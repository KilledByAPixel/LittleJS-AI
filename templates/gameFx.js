'use strict';

// ============================================================================
// SoundGenerator — friendly named-parameter wrapper over a ZzFX sound.
//
// AI: use this class to make every game sound effect. Pass a {} of named
// parameters (any you omit fall back to the sensible ZzFX default below) and
// call it to fire the sound. The play signature is inherited from LittleJS Sound:
//   .play(pos?, volume?, pitch?, randomnessScale?, loop?)
//   - pos is an OPTIONAL world-space Vector2 (gives positional panning/falloff);
//     pass it for in-world sfx, e.g. sound.play(this.pos).
//   - for a non-positional UI/global sound, omit pos: sound.play() or, to scale
//     volume, sound.play(undefined, .5)  // NOTE: volume is the 2nd arg, not 1st.
// Construct sounds ONCE (module scope or in gameInit) and reuse the instance —
// ZzFX caches the samples, so re-constructing every frame is wasteful.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ HOW TO USE THIS WELL — read before reaching for parameters:               │
// │                                                                            │
// │ Build EVERY sound from the CORE parameters below. They reliably produce   │
// │ good sounds, and almost every classic game effect is just a frequency +   │
// │ a short release + maybe a slide/pitchJump/noise. Start from the closest    │
// │ recipe and tweak ONLY core params.                                         │
// │                                                                            │
// │ The ADVANCED parameters are powerful but easy to misuse — stacking        │
// │ several of them usually yields harsh noise/mush, NOT a richer sound.       │
// │ Reach for an advanced param ONLY when BOTH hold:                           │
// │   1. you have a specific reason it improves THIS sound, AND                │
// │   2. you add it ONE at a time and keep the rest at default,                │
// │ OR the user explicitly asks for that character ("make it metallic", "add  │
// │ vibrato", "muffle it", "retro/chiptune", "give it a tail"). When unsure,   │
// │ leave every advanced param at its default. Fewer knobs = better sounds.    │
// └──────────────────────────────────────────────────────────────────────────┘
//
// All 21 ZzFX params are reachable; the destructure is order-independent
// (keyword keys), so list only the ones you set, in any order.
//
// ╔═══════════════════════════════════════════════════════════════════════════
// ║ CORE PARAMETERS — your default palette. Make sounds from these.
// ╚═══════════════════════════════════════════════════════════════════════════
//     frequency      9..2000  Hz. Pitch of the tone. ~220 low, ~880 high.
//                     Use ZZFX.getNote(semitoneOffset) for musical pitches.
//     volume         0..1(+)  overall loudness. UI ticks .3-.5, impacts .8-1.
//                     Can exceed 1 but watch for clipping.
//     attack         0..3 s  fade-IN. 0 = instant click. A tiny .01-.05 softens
//                     the pop on percussive hits; big .1-.3 = swells.
//     release        0..3 s  fade-OUT at the end. Always keep >0 (even .02) or
//                     the sample clicks. Short blips .05-.15, booms .3-.6.
//     randomness     0..1   per-play pitch wobble. .05 = subtle variety so
//                     repeats aren't identical; 0 = exact every time.
//     slide          ±      pitch glide, kHz/s. + rises, - falls. Lasers small
//                     negative (-1.5); jumps positive (.3).
//     pitchJump      ±      Hz step added to pitch at pitchJumpTime. Big jump up
//                     = coin/powerup "bling"; negative = downward chirp.
//     pitchJumpTime  0..    seconds until the pitchJump fires (pair the two).
//     noise          0..50  random hiss. MOST sounds want 0; a tiny ~.1 adds
//                     subtle grit. EXPLOSIONS need it HIGH: 5 is a good start,
//                     up to ~15-50 (diminishing returns past that). Pair w/ bitCrush.
//     shapeCurve     0..2   waveform sharpness (0=square-ish,1=normal,2=pointy).
//     repeatTime     0..    seconds; periodically resets pitch/slide to make
//                     arpeggios, stutters, machine-gun loops.
//     bitCrush       0..1   lo-fi downsample for a crunchy 8-bit edge. Subtle
//                     .1-.3 for retro UI. THE key ingredient for explosions/
//                     impacts — pair with noise or shape:4 (see recipes below).
//     delay          0..    seconds; overlays a delayed copy for reverb/thicken.
//                     Small (.01-.05) fattens an impact.
//
// ╔═══════════════════════════════════════════════════════════════════════════
// ║ ADVANCED PARAMETERS — use SPARINGLY (see the box above). Default = off.
// ╚═══════════════════════════════════════════════════════════════════════════
//     shape          0..5   waveform: 0 sine,1 triangle,2 saw,3 tan,4 noise,
//                     5 square. The safest advanced param — pick ONE deliberately
//                     (e.g. 5 for a chiptune game); don't combine with the others.
//                     shape:4 (noise wave) + bitCrush is the go-to for explosions.
//     sustain        0..3 s  hold time at sustainVolume. Only for notes meant to
//                     ring on (music, drones); most SFX want sustain 0.
//     decay          0..3 s  fall from full volume to sustainVolume after attack.
//     sustainVolume  0..1   level held during sustain (after decay).
//     filter         ±      cutoff Hz. + high-pass (thins/brightens), - low-pass
//                     (muffles/darkens), 0 off. Use when asked to brighten/muffle.
//     modulation     ±      FM frequency (Hz). Small = vibrato/warble, large =
//                     metallic/bell. Negative flips phase. For "metallic"/"bell".
//     tremolo        0..1   volume wobble depth; REQUIRES repeatTime>0. Engine
//                     hum, alarms, shimmer.
//     deltaSlide     ±      rate-of-change of slide (kHz/s/s) — curves the glide
//                     into accelerating swoops / dive-bombs.
//
// ╔═══════════════════════════════════════════════════════════════════════════
// ║ QUICK RECIPES — all core params; copy the closest and tweak.
// ╚═══════════════════════════════════════════════════════════════════════════
//   Coin/pickup : {frequency:900, release:.12, pitchJump:600, pitchJumpTime:.05}
//   Laser shoot : {frequency:820, release:.08, slide:-1.6, shapeCurve:.6, noise:.02}
//   Jump        : {frequency:300, release:.12, slide:.3}
//   Hit/thud    : {frequency:220, release:.18, slide:-.4, noise:.1}
//   Powerup     : {frequency:400, release:.3, slide:.4, repeatTime:.08, pitchJump:300}
//   Blip/UI     : {frequency:520, release:.05, volume:.4}
//   (Advanced, only when asked) Chiptune blip: add shape:5 to the Blip above.
//   (Advanced, only when asked) Engine hum: {frequency:80, sustain:.3, release:.1, repeatTime:.05, tremolo:.6}
//
// ── EXPLOSIONS & IMPACTS (the one place to deliberately use shape:4) ────────
//   The secret to a good explosion is bitCrush + NOISE. The noise comes from
//   EITHER shape:4 (the noise WAVEFORM — the go-to) OR the noise param; bitCrush
//   adds the crunchy grit that sells it. A plain low sine + slide sounds weak
//   and inaudible — don't do that. Scale the SIZE with the envelope + delay:
//     Small hit/pop : {shape:4, bitCrush:.2, sustainVolume:.5}
//                     short — fast attack, no sustain, no delay.
//     Big explosion : {attack:.05, sustain:.2, release:.3, shape:4, bitCrush:1, delay:.2, sustainVolume:.5}
//     Huge blast    : bump sustain/release to ~.4/.6 and delay to ~.4.
//     Noise-param alt (no shape:4): {frequency:90, sustain:.2, release:.4, noise:5, bitCrush:.5, sustainVolume:.5, delay:.05}
//   (bitCrush is a core param; shape:4 is the sanctioned advanced exception here.
//    delay enlarges the blast. The noise PARAM must run HIGH for explosions —
//    5 minimum, up to ~15-50; most other sounds want 0 or a tiny ~.1.)
// ============================================================================

// AI can use this class to make sound effects
class SoundGenerator extends Sound
{
    constructor(params = {})
    {
        const {
            // ── CORE — reach for these first ──
            frequency     = 220,  // [core] Pitch of the tone (Hz, ~9..2000)
            volume        = 1,    // [core] Overall loudness scale (percent, ~0..1, may exceed 1)
            attack        = 0,    // [core] Fade-in time (seconds, 0..3)
            release       = .1,   // [core] Fade-out time — keep >0 to avoid clicks (seconds, 0..3)
            randomness    = .05,  // [core] Per-play frequency wobble (percent, 0..1)
            slide         = 0,    // [core] Pitch glide (kHz/s, + rises / - falls)
            pitchJump     = 0,    // [core] Pitch step applied at pitchJumpTime (Hz, ±)
            pitchJumpTime = 0,    // [core] When the pitch jump fires (seconds)
            noise         = 0,    // [core] Random hiss; 0 or ~.1 for most, 5..50 for explosions (+ bitCrush)
            shapeCurve    = 1,    // [core] Wave sharpness (0=square,1=normal,2=pointy); duty cycle for square
            repeatTime    = 0,    // [core] Periodically resets pitch/slide for arps/stutters (seconds)
            bitCrush      = 0,    // [core] Lo-fi crunch; light .1-.3 for retro, key to explosions w/ noise (samples*100, 0..1)
            delay         = 0,    // [core] Overlay a delayed copy for reverb/thicken (seconds)
            // ── ADVANCED — leave at default unless confident or the user asks (see header) ──
            shape         = 0,    // [adv] Waveform: 0 sine,1 triangle,2 saw,3 tan,4 noise,5 square
            sustain       = 0,    // [adv] Hold time at sustainVolume — for ringing/music notes (seconds, 0..3)
            decay         = 0,    // [adv] Fade from full volume to sustainVolume after attack (seconds, 0..3)
            sustainVolume = 1,    // [adv] Level held during sustain after decay (percent, 0..1)
            filter        = 0,    // [adv] Cutoff Hz; + high-pass (brighten), - low-pass (muffle), 0 off
            modulation    = 0,    // [adv] FM frequency for metallic/vibrato, negative flips phase (Hz, ±)
            tremolo       = 0,    // [adv] Volume wobble depth, pulsed at repeatTime (percent, 0..1; needs repeatTime)
            deltaSlide    = 0,    // [adv] Rate of change of slide — curves the glide (kHz/s/s, ±)
        } = params;

        super([volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
            slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation,
            bitCrush, delay, sustainVolume, decay, tremolo, filter]);
    }
}

// ============================================================================
// Screen shake — random-walk nudge on cameraPos, decays linearly to zero.
// Stacks by keeping whichever active shake has the larger (amount × remaining)
// "energy" — strongest event wins, weaker is discarded.
//
// Registered as a single engine plugin at file-scope. Future game-feel
// helpers (hit-stop, flashes, etc.) can slot into gameFxUpdate / gameFxRender
// below without games needing additional engineAddPlugin calls.
// ============================================================================

let _shakeAmount    = 0;     // peak amplitude in world units
let _shakeRemaining = 0;     // seconds left
let _shakeDuration  = 1;     // original duration of the active event
let _shakeEnabled   = true;

function addScreenShake(amount, duration)
{
    if (!(amount > 0) || !(duration > 0)) return;
    const newEnergy = amount * duration;
    const curEnergy = _shakeAmount * _shakeRemaining;
    if (newEnergy <= curEnergy) return;
    _shakeAmount    = amount;
    _shakeRemaining = duration;
    _shakeDuration  = duration;
}

function setScreenShakeEnabled(b) { _shakeEnabled = !!b; }
function isScreenShakeEnabled()   { return _shakeEnabled; }

function _shakeUpdate()
{
    if (_shakeRemaining <= 0) return;
    _shakeRemaining -= timeDelta;
    if (_shakeRemaining <= 0)
    {
        _shakeAmount = 0;
        return;
    }
    if (!_shakeEnabled) return;
    const a = _shakeAmount * (_shakeRemaining / _shakeDuration);
    cameraPos = cameraPos.add(vec2(rand(-a, a), rand(-a, a)));
}

// cameraFit(center, size, worldMargin, screenInset) is now a built-in LittleJS
// engine function (it used to be defined here). worldMargin/screenInset each
// accept a number, a Vector2, or a {top,right,bottom,left} object.

// ============================================================================
// Active input device — mouse vs keyboard vs gamepad, "most recently used".
//
// LittleJS tracks isUsingGamepad, but it flips to false on ANY mouse-click OR
// keypress, so it can't tell mouse from keyboard; and mouse *movement* never
// changes it while analog-*stick* movement never sets it. Games with a
// mouse-follow fallback (e.g. paddle = mousePos every frame) therefore snap
// back to the mouse the instant the stick/keys go idle.
//
// This picks whichever device is ACTIVELY being used this frame and, crucially,
// KEEPS the last device when everything is idle (instead of reverting to mouse).
// Refreshes lazily once per frame, so the value is current the first time a
// game reads it inside gameUpdate.
//
//   inputDevice()        -> 'mouse' | 'keyboard' | 'gamepad'
//   usingMouseInput()    -> true only while the mouse is the active device
//   usingKeyboardInput() -> ...
//   usingGamepadInput()  -> ...
//
// Typical use — replace an unconditional mouse fallback:
//     if (usingMouseInput()) paddleX = mousePos.x;       // mouse drives it
//     else                   paddleX += keyOrStick * spd; // kbd/gamepad; idle stays put
// ============================================================================

let _inputDevice = 'mouse';     // sensible default before any input
let _inputDeviceFrame = -1;
const _MOUSE_MOVE_PIXELS = 2;   // ignore sub-pixel hand jitter

function _gamepadActiveNow()
{
    // sticks are already deadzoned by the engine, so a centered stick reads 0
    if (gamepadStick(0).lengthSquared() > .04) return true;
    if (gamepadStick(1).lengthSquared() > .04) return true;
    for (let b = 0; b < 17; b++)
        if (gamepadIsDown(b)) return true;
    return false;
}

function _mouseActiveNow()
{
    return mouseIsDown(0) || mouseIsDown(1) || mouseIsDown(2) ||
        mouseDeltaScreen.length() > _MOUSE_MOVE_PIXELS;
}

function _inputDeviceRefresh()
{
    if (typeof frame === 'undefined' || _inputDeviceFrame === frame) return;
    _inputDeviceFrame = frame;
    if      (_gamepadActiveNow())                 _inputDevice = 'gamepad';
    else if (_mouseActiveNow())                   _inputDevice = 'mouse';
    else if (keyDirection().lengthSquared() > 0)  _inputDevice = 'keyboard';
    // else: keep previous device — the whole point (idle never reverts to mouse)
}

function inputDevice()        { _inputDeviceRefresh(); return _inputDevice; }
function usingMouseInput()    { return inputDevice() === 'mouse'; }
function usingKeyboardInput() { return inputDevice() === 'keyboard'; }
function usingGamepadInput()  { return inputDevice() === 'gamepad'; }

// ============================================================================
// Starfield — STATELESS, seeded parallax/twinkle star background.
//
// Stores ONLY configuration — no per-star array. Each draw() reseeds a
// RandomGenerator and re-derives every star's params in the same fixed order,
// so the field is identical frame-to-frame (looks random, holds still) with
// zero stored state. The only per-frame inputs are `time` (twinkle) and
// `cameraPos` (screen-space parallax). Build once, then call draw() from
// gameRender at the point the sky belongs (usually first, behind everything):
//
//   const sky = new Starfield(options);  // build once (e.g. in gameInit)
//   sky.draw();                          // every frame, in gameRender
//
// Two space modes:
//   world  (default)          stars sit at fixed world positions in the rect
//                             center ± area (area = half-extents); drawn with
//                             drawTile(tile) if a tile is given, else drawRect.
//                             The camera moves over them naturally.
//   screen (screenSpace:true) stars live in a virtual field of size `area` px
//                             (default vec2(2000)) and wrap across the canvas,
//                             scrolling by cameraPos × per-layer parallax.
//
// Twinkle is `base + amp · oscillate(speed)`: brightness (and size, if
// twinkleSize) pulses between base and base+amp. For a plain `.55+.45*sin`
// look (floor .1) use twinkleBase:.1, twinkleAmp:.9; the defaults give a
// gentler .55..1 pulse.
//
// Depth via layers: pass `layers:[{count, parallax, sizeMin, sizeMax, alphaMin,
// alphaMax, twSpeedMin, twSpeedMax, tintChance, tints:[Color,...]}, ...]`; or
// omit `layers` and use the flat single-layer options of the same names.
//
// Extras: `color` sets the base star color (default WHITE). `drift` (a vec2
// direction) + `driftSpeedMin/Max` scroll a WORLD-space field statelessly
// (pos = base + drift*speed*time, wrapped in `area`). `unpaused:true` animates
// from `timeReal` instead of `time`, so a title/paused backdrop keeps moving.
// `wrap` (world units) makes a horizontal world CYLINDER: stars at worldX=0..wrap
// scroll with the camera by per-layer `parallax` as DEPTH (1 = fixed in the world,
// 0 = nailed to the view), wrapped seamlessly via mod(); off-screen stars cull.
// ============================================================================
class Starfield
{
    constructor({
        seed = 1234, screenSpace = false, tile, area, center = vec2(),
        color = WHITE,
        count = 150, parallax = 0,
        sizeMin = .05, sizeMax = .12, alphaMin = .6, alphaMax = 1,
        twSpeedMin = 1, twSpeedMax = 3,
        twinkleBase = .55, twinkleAmp = .45, twinkleSize = false,
        tintChance = 0, tints, layers,
        drift, driftSpeedMin = 1, driftSpeedMax = 1, unpaused = false, wrap = 0,
    } = {})
    {
        this.seed        = seed || 1234;   // xorshift requires non-zero
        this.screenSpace = screenSpace;
        this.tile        = tile;
        this.color       = color;
        this.area        = area || (screenSpace ? vec2(2000) : vec2(40, 24));
        this.center      = center;
        this.twinkleBase = twinkleBase;
        this.twinkleAmp  = twinkleAmp;
        this.twinkleSize = twinkleSize;
        this.drift       = drift;          // vec2 dir; enables stateless scroll (world mode)
        this.unpaused    = unpaused;       // animate from timeReal (runs while paused)
        this.wrap        = wrap;           // >0 = horizontal world cylinder of this width
        this.layers      = layers || [{ count, parallax, sizeMin, sizeMax,
            alphaMin, alphaMax, twSpeedMin, twSpeedMax, tintChance, tints,
            driftSpeedMin, driftSpeedMax }];
    }

    draw()
    {
        const rng = new RandomGenerator(this.seed);
        const W = mainCanvasSize.x, H = mainCanvasSize.y;
        const screen = this.screenSpace, drift = this.drift, wrap = this.wrap;
        const t = this.unpaused ? timeReal : time;
        let halfVisW, yMin, yMax;
        if (wrap)
        {
            const cs = getCameraSize();
            halfVisW = cs.x/2 + 1;
            yMin = cameraPos.y - cs.y/2 - 1;
            yMax = cameraPos.y + cs.y/2 + 1;
        }
        for (const L of this.layers)
        {
            const par = L.parallax || 0;
            const tints = L.tints, tintChance = L.tintChance || 0;
            for (let i = L.count; i--;)
            {
                // derive this star deterministically (FIXED call order)
                const rx = rng.float(), ry = rng.float();
                const size    = rng.float(L.sizeMax, L.sizeMin);
                const alpha   = rng.float(L.alphaMax, L.alphaMin);
                const twSpeed = rng.float(L.twSpeedMax, L.twSpeedMin);
                const twPhase = rng.float();
                const tintRoll = rng.float();
                const tintIdx  = tints ? rng.int(tints.length) : 0;
                const dspeed   = drift ? rng.float(L.driftSpeedMax, L.driftSpeedMin) : 0;
                const col = (tints && tintRoll < tintChance) ? tints[tintIdx] : this.color;

                const tw = this.twinkleBase + this.twinkleAmp * oscillate(twSpeed, 1, t, twPhase);
                const sz = size * (this.twinkleSize ? tw : 1);
                const c  = rgb(col.r, col.g, col.b, alpha * tw);

                if (screen)
                {
                    const sx = mod(rx*this.area.x - cameraPos.x*par, W);
                    const sy = mod(ry*this.area.y + cameraPos.y*par, H);
                    if (this.tile) drawTile(vec2(sx, sy), vec2(sz), this.tile, c, 0, 0, undefined, undefined, true);
                    else           drawRect(vec2(sx, sy), vec2(sz), c, 0, true, true);
                }
                else
                {
                    let wx = this.center.x + (rx*2 - 1)*this.area.x;
                    let wy = this.center.y + (ry*2 - 1)*this.area.y;
                    if (wrap)
                    {
                        // horizontal world cylinder of width `wrap` with depth
                        // parallax: a star at worldX = rx*wrap lags the camera by
                        // (1 - par). par=1 sits in the world, par->0 nails it to the
                        // view. mod() wraps the field seamlessly (handles negatives).
                        const dx = mod(rx*wrap - cameraPos.x*par + wrap/2, wrap) - wrap/2;
                        if (abs(dx) > halfVisW || wy < yMin || wy > yMax) continue;
                        wx = cameraPos.x + dx;
                    }
                    else if (drift)
                    {
                        const ax = this.area.x, ay = this.area.y;
                        wx = mod(wx + drift.x*dspeed*t - this.center.x + ax, 2*ax) + this.center.x - ax;
                        wy = mod(wy + drift.y*dspeed*t - this.center.y + ay, 2*ay) + this.center.y - ay;
                    }
                    if (this.tile) drawTile(vec2(wx, wy), vec2(sz), this.tile, c);
                    else           drawRect(vec2(wx, wy), vec2(sz), c);
                }
            }
        }
    }
}

// ============================================================================
// clearParticles — destroy every live ParticleEmitter (and its particles) so a
// reset/quit leaves a clean field instead of frozen or fading particles.
//
// Uses immediate destroy so a trail/flame emitter that gets recreated right
// after a reset doesn't briefly double up with the old one. Games that moved a
// hand-rolled particle array onto ParticleEmitter call this where they used to
// do `particles.length = 0`. Harmless (a no-op) in games with no emitters.
// ============================================================================
function clearParticles()
{
    for (const o of engineObjects)
        if (o instanceof ParticleEmitter) o.destroy(true);
}

function gameFxUpdate()
{
    _shakeUpdate();
    // future feel-helpers slot in here
}

function gameFxRender()
{
    // reserved for future render-phase effects
}

engineAddPlugin(gameFxUpdate, gameFxRender);
