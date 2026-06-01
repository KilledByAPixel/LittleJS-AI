'use strict';

// ============================================================================
// bloom.js — reusable multi-pass bloom post-process plugin for LittleJS.
//
// A drop-in replacement for a hand-written PostProcessPlugin bloom. It bypasses
// the engine's single-pass PostProcessPlugin and runs its own WebGL pipeline on
// the shared glContext so it can do a REAL wide blur: capture the frame, extract
// the bright parts, then ping-pong a separable Gaussian across two reduced-res
// framebuffers for many iterations, and composite sharp-scene + glow (+ optional
// vignette) to the screen.
//
// ── USAGE ───────────────────────────────────────────────────────────────────
// 1. Load this AFTER littlejs.js (a <script src="../templates/bloom.js"> tag).
// 2. Call bloomInit() once in gameInit to turn it on:
//        bloomInit();                              // sensible defaults
//        bloomInit({ intensity: 5, iterations: 8 }); // or tune it
// 3. (optional) Adjust live: bloomSetParams({ intensity: 2 }), or toggle with
//    setBloomEnabled(false) — handy for an options checkbox.
//
// Including the script does nothing until bloomInit() is called, so it's safe to
// load in every template. Only ONE bloom may be active; do not also create a
// PostProcessPlugin (the engine allows only one post-process either way).
//
// ── PARAMETERS (all optional) ────────────────────────────────────────────────
//   downsample     2    bloom buffers run at 1/N canvas res. 1 = full (tight,
//                       costly), 2 = balanced, 4 = wide/cheap but misses thin
//                       lines. Lower captures thin geometry better.
//   iterations     6    blur passes (each = horizontal + vertical). More = wider
//                       and softer; each adds two cheap reduced-res draws.
//   threshold    0.25   luminance (0..1) below which a pixel does NOT glow. Lower
//                       = more of the scene blooms.
//   intensity    3.5    how strongly the blurred glow is added back. A Gaussian
//                       conserves energy, so a thin line blurred wide has a low
//                       peak — you generally need intensity > 1 to see it.
//   vignette       1    edge-darkening strength multiplier (0 disables, 1 = the
//                       classic CRT vignette).
//   includeOverlay false (default, like PostProcessPlugin's includeMainCanvas).
//                       false uploads the WebGL scene directly to the bloom and
//                       leaves the 2D overlay (drawTextScreen HUD, etc.) crisp
//                       on top — the cheap path. true folds the overlay into the
//                       bloom so it glows too, but costs two full-res CPU canvas
//                       blits per frame (drawImage of glCanvas + the HUD).
//
// ── API ───────────────────────────────────────────────────────────────────────
//   bloomInit(options?)      enable + configure (merges over current params)
//   bloomSetParams(patch)    live-update any subset of the params above
//   getBloomParams()         returns a copy of the current params
//   setBloomEnabled(b)       toggle the effect on/off (resources are kept)
//   isBloomEnabled()         -> boolean
//   bloomTweaks(label?)      add a Bloom section to the tweakables panel (~);
//                            no-op if tweakables.js isn't loaded
// ============================================================================

const _bloom =
{
    enabled: false,
    ready:   false,
    // params (see header)
    downsample:     2,
    iterations:     4,
    threshold:      0.15,
    intensity:      4,
    vignette:       1,
    includeOverlay: false,  // false = upload WebGL scene directly (cheap, HUD crisp on top)
    // gl resources
    brightProg: undefined,
    blurProg:   undefined,
    compositeProg: undefined,
    vao:        undefined,
    sceneTex:   undefined,
    targets:    null,   // [{tex,fbo}, {tex,fbo}] ping-pong
    dw: 0, dh: 0,
};

function bloomInit(options = {})
{
    bloomSetParams(options);
    _bloom.enabled = true;
}

function bloomSetParams(patch = {})
{
    for (const k of ['downsample','iterations','threshold','intensity','vignette','includeOverlay'])
        if (patch[k] !== undefined) _bloom[k] = patch[k];
}

function getBloomParams()
{
    const { downsample, iterations, threshold, intensity, vignette, includeOverlay } = _bloom;
    return { downsample, iterations, threshold, intensity, vignette, includeOverlay };
}

function setBloomEnabled(b) { _bloom.enabled = !!b; }
function isBloomEnabled()   { return _bloom.enabled; }

// Register the bloom params as a section in the tweakables panel (templates/
// tweakables.js — press ~ to open). No-op if tweakables isn't loaded. Call once
// in gameInit (after bloomInit). The tweaks point straight at the live _bloom
// params object, so dragging a slider applies instantly and persists per-game
// under '<GameName>.tweaks'.
function bloomTweaks(label = 'Bloom')
{
    if (typeof tweak !== 'function') return; // tweakables.js not loaded
    if (typeof tweakDivider === 'function') tweakDivider(label);
    tweak('_bloom.intensity',  {min:0, max:10});
    tweak('_bloom.threshold',  {min:0, max:1});
    tweak('_bloom.iterations', {min:0, max:16, step:1});
    tweak('_bloom.downsample', {min:1, max:8,  step:1});
    tweak('_bloom.vignette',   {min:0, max:2});
    tweak('_bloom.includeOverlay');
}

function _bloomBuild()
{
    const gl = glContext;

    // Shared fullscreen-quad vertex shader: maps the engine's 0..1 geometry
    // strip to clip space and passes the 0..1 position through as the uv.
    const VS =
        '#version 300 es\nprecision highp float;' +
        'in vec2 p; out vec2 uv;' +
        'void main(){ uv = p; gl_Position = vec4(p*2.-1., 0., 1.); }';

    const makeProgram = (fs) =>
    {
        const compile = (src, type) =>
        {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(VS, gl.VERTEX_SHADER));
        gl.attachShader(prog, compile('#version 300 es\nprecision highp float;\n' + fs, gl.FRAGMENT_SHADER));
        gl.bindAttribLocation(prog, 0, 'p'); // force 'p' to 0 so one VAO fits every program
        gl.linkProgram(prog);
        return prog;
    };

    // Bright pass + 4-tap box downsample: keep luminance above threshold.
    _bloom.brightProg = makeProgram(
        'uniform sampler2D tex; uniform vec2 srcTexel; uniform float threshold;' +
        'in vec2 uv; out vec4 c;' +
        'void main(){' +
        '  vec3 s  = texture(tex, uv + srcTexel*vec2(-1.,-1.)).rgb;' +
        '       s += texture(tex, uv + srcTexel*vec2( 1.,-1.)).rgb;' +
        '       s += texture(tex, uv + srcTexel*vec2(-1., 1.)).rgb;' +
        '       s += texture(tex, uv + srcTexel*vec2( 1., 1.)).rgb;' +
        '  s *= .25;' +
        '  float b = max(max(s.r, s.g), s.b);' +
        '  float k = max(b - threshold, 0.);' +
        '  c = vec4(s * (b > 1e-4 ? k/b : 0.), 1.);' +
        '}');

    // Separable Gaussian — 5 linear-sampled taps cover 9 texels; dir picks axis.
    _bloom.blurProg = makeProgram(
        'uniform sampler2D tex; uniform vec2 dir;' +
        'in vec2 uv; out vec4 c;' +
        'void main(){' +
        '  vec3 s  = texture(tex, uv).rgb * .227027;' +
        '       s += texture(tex, uv + dir*1.3846).rgb * .316216;' +
        '       s += texture(tex, uv - dir*1.3846).rgb * .316216;' +
        '       s += texture(tex, uv + dir*3.2308).rgb * .070270;' +
        '       s += texture(tex, uv - dir*3.2308).rgb * .070270;' +
        '  c = vec4(s, 1.);' +
        '}');

    // Composite: sharp scene + glow, then a tunable vignette.
    _bloom.compositeProg = makeProgram(
        'uniform sampler2D sceneTex; uniform sampler2D bloomTex;' +
        'uniform float intensity; uniform float vignette;' +
        'in vec2 uv; out vec4 c;' +
        'void main(){' +
        '  vec3 scene = texture(sceneTex, uv).rgb;' +
        '  vec3 glow  = texture(bloomTex, uv).rgb;' +
        '  vec3 col = scene + glow * intensity;' +
        '  float dx = 2.*uv.x-1., dy = 2.*uv.y-1.;' +
        '  col *= 1. - vignette*pow((dx*dx + dy*dy)/2., 6.);' +
        '  c = vec4(col, 1.);' +
        '}');

    // One VAO over the engine geometry buffer (0..1 triangle-strip quad). Baked
    // once so per-frame passes never touch the global ARRAY_BUFFER binding the
    // engine relies on.
    _bloom.vao = gl.createVertexArray();
    gl.bindVertexArray(_bloom.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, glGeometryBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);

    _bloom.sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _bloom.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    _bloom.targets = null;
    _bloom.dw = _bloom.dh = 0;
    _bloom.ready = true;
}

// (re)allocate the two reduced-res ping-pong render targets if size changed
function _bloomEnsureTargets(fullW, fullH)
{
    const gl = glContext;
    const dw = max(1, fullW / _bloom.downsample | 0);
    const dh = max(1, fullH / _bloom.downsample | 0);
    if (_bloom.targets && _bloom.dw === dw && _bloom.dh === dh) return;

    if (_bloom.targets)
        for (const t of _bloom.targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }

    _bloom.targets = [];
    for (let i = 0; i < 2; i++)
    {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dw, dh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        _bloom.targets.push({ tex, fbo });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    _bloom.dw = dw;
    _bloom.dh = dh;
}

function _bloomRender()
{
    if (headlessMode || !glEnable || !glContext || !_bloom.enabled) return;
    if (!_bloom.ready) _bloomBuild();

    const gl = glContext;
    const fullW = mainCanvas.width, fullH = mainCanvas.height;
    const setTex = (prog, name, tex, unit) =>
    {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    };

    // 1) Flush the engine batch so the WebGL scene is on glCanvas, capture it.
    glFlush();
    gl.bindVertexArray(_bloom.vao);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _bloom.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (_bloom.includeOverlay)
    {
        // Fold the 2D HUD overlay into the bloom so it glows too. Costs two
        // full-res CPU blits (glCanvas -> work canvas, then HUD on top). Clear
        // the overlay afterward so the HUD isn't ALSO drawn crisp on top of the
        // bloomed copy this frame (the engine re-clears + redraws it next frame).
        workCanvas.width = fullW;
        workCanvas.height = fullH;
        glCopyToContext(workContext);                // WebGL scene
        workContext.drawImage(mainCanvas, 0, 0);     // HUD / overlay text on top
        mainCanvas.width |= 0;                        // clear overlay
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, workCanvas);
    }
    else
    {
        // Cheap path: upload the WebGL scene texture directly (no CPU copy). The
        // 2D overlay (HUD) is left untouched and rides crisp on top of the bloom.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glCanvas);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    _bloomEnsureTargets(fullW, fullH);
    const dw = _bloom.dw, dh = _bloom.dh;

    // 2) Bright pass + downsample: scene -> targets[0]. Box taps span half a
    //    downsample cell so the 4-tap box tiles the whole cell (via LINEAR)
    //    instead of skipping source pixels between thin lines.
    const cell = _bloom.downsample * 0.5;
    gl.viewport(0, 0, dw, dh);
    gl.useProgram(_bloom.brightProg);
    setTex(_bloom.brightProg, 'tex', _bloom.sceneTex, 0);
    gl.uniform2f(gl.getUniformLocation(_bloom.brightProg, 'srcTexel'), cell/fullW, cell/fullH);
    gl.uniform1f(gl.getUniformLocation(_bloom.brightProg, 'threshold'), _bloom.threshold);
    gl.bindFramebuffer(gl.FRAMEBUFFER, _bloom.targets[0].fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 3) Ping-pong separable Gaussian blur (each iteration = H then V)
    gl.useProgram(_bloom.blurProg);
    const dirLoc = gl.getUniformLocation(_bloom.blurProg, 'dir');
    let read = _bloom.targets[0], write = _bloom.targets[1];
    for (let i = 0; i < _bloom.iterations; i++)
    {
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        setTex(_bloom.blurProg, 'tex', read.tex, 0);
        gl.uniform2f(dirLoc, 1/dw, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        [read, write] = [write, read];

        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        setTex(_bloom.blurProg, 'tex', read.tex, 0);
        gl.uniform2f(dirLoc, 0, 1/dh);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        [read, write] = [write, read];
    }

    // 4) Composite sharp scene + blurred glow -> screen (default framebuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, fullW, fullH);
    gl.useProgram(_bloom.compositeProg);
    setTex(_bloom.compositeProg, 'sceneTex', _bloom.sceneTex, 0);
    setTex(_bloom.compositeProg, 'bloomTex', read.tex, 1);
    gl.uniform1f(gl.getUniformLocation(_bloom.compositeProg, 'intensity'), _bloom.intensity);
    gl.uniform1f(gl.getUniformLocation(_bloom.compositeProg, 'vignette'), _bloom.vignette);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 5) Restore the engine's GL state for anything that renders after us.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glActiveTexture || null);
    gl.bindVertexArray(null);
    glSetInstancedMode(true);
}

// WebGL context lifecycle: drop resources on loss, rebuild lazily on next render.
function _bloomContextLost()     { _bloom.ready = false; }
function _bloomContextRestored() { _bloom.ready = false; }

engineAddPlugin(undefined, _bloomRender, _bloomContextLost, _bloomContextRestored);
