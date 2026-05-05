# Texture Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable canvas-2D atlas builder (`templates/textureGenerator.js`) so prototypes can paint sprites into a fixed 4×4 / 500px-tile / 2048-atlas, save the atlas + a one-shot AI prompt blob, and later swap to an AI-generated atlas without touching sprite references.

**Architecture:** A plain-function module (no class) that mirrors `templates/soundGenerator.js`. State lives in module-level variables. Drawing goes through a 2D canvas that backs `textureInfos[0]`; WebGL re-uploads are debounced via `queueMicrotask`. All TileInfos returned by `drawToTexture` reference the same `TextureInfo`, so an in-place image swap upgrades every sprite at once.

**Tech Stack:** LittleJS engine (`dist/littlejs.js`), Canvas 2D API, no build step. Tests are manual: open the prototype HTML in a browser.

**Spec:** [docs/superpowers/specs/2026-05-04-texture-generator-design.md](../specs/2026-05-04-texture-generator-design.md)

---

## Constants reference (used across tasks)

```
ATLAS_SIZE   = 2048
TILE_PADDING = 6
TILE_SIZE    = 500            // drawable area inside cell
TILE_STRIDE  = 512            // TILE_SIZE + 2*TILE_PADDING
TILE_COLS    = 4              // ATLAS_SIZE / TILE_STRIDE
TILE_COUNT   = 16             // TILE_COLS * TILE_COLS
```

---

### Task 1: Create the textureGenerator module

**Files:**
- Create: `templates/textureGenerator.js`

This task delivers `initDrawToTexture` + `drawToTexture` + the internal microtask flush. No save/swap functions yet — they're added in Tasks 2 and 3. We'll exercise the module in Task 4 by rewriting `textureGame.html`; until then it's verified by a manual smoke check.

- [ ] **Step 1: Write the module file**

Create `templates/textureGenerator.js` with this exact content:

```javascript
'use strict';

// AI can use this module to build a sprite atlas from canvas 2D draw ops.
// Fixed 4x4 grid of 500x500 drawable tiles in a 2048x2048 atlas, with
// 6px transparent gutters around every tile to prevent bilinear bleed.
// initDrawToTexture() replaces textureInfos[0]. drawToTexture() paints a
// tile and returns a TileInfo. saveAtlasImage()/saveAtlasPrompt() export
// the sheet + prompt. useAtlasImage(url) swaps in an AI-generated 2048
// image without invalidating already-returned TileInfos.

const ATLAS_SIZE   = 2048;
const TILE_PADDING = 6;
const TILE_SIZE    = 500;
const TILE_STRIDE  = TILE_SIZE + TILE_PADDING * 2;     // 512
const TILE_COLS    = ATLAS_SIZE / TILE_STRIDE;         // 4
const TILE_COUNT   = TILE_COLS * TILE_COLS;            // 16

let atlasCanvas, atlasCtx, atlasDirty, flushScheduled;
const tileDescriptions = [];

function initDrawToTexture()
{
    atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = atlasCanvas.height = ATLAS_SIZE;
    atlasCtx = atlasCanvas.getContext('2d');

    textureInfos[0] && textureInfos[0].destroyWebGLTexture();
    textureInfos[0] = new TextureInfo(atlasCanvas);

    setTileDefaultSize(vec2(TILE_SIZE));
    setTileDefaultPadding(TILE_PADDING);

    tileDescriptions.length = 0;
    for (let i = 0; i < TILE_COUNT; ++i)
        tileDescriptions.push('');
    atlasDirty = false;
    flushScheduled = false;
}

function drawToTexture(tileIndex, drawFn, description)
{
    ASSERT(tileIndex >= 0 && tileIndex < TILE_COUNT,
        'tileIndex must be 0-' + (TILE_COUNT - 1));

    const cellX = (tileIndex % TILE_COLS) * TILE_STRIDE;
    const cellY = (tileIndex / TILE_COLS | 0) * TILE_STRIDE;
    const drawX = cellX + TILE_PADDING;
    const drawY = cellY + TILE_PADDING;

    // clear the full cell so re-drawing replaces cleanly
    atlasCtx.clearRect(cellX, cellY, TILE_STRIDE, TILE_STRIDE);

    atlasCtx.save();
    atlasCtx.translate(drawX, drawY);
    atlasCtx.beginPath();
    atlasCtx.rect(0, 0, TILE_SIZE, TILE_SIZE);
    atlasCtx.clip();
    drawFn(atlasCtx, tileIndex);
    atlasCtx.restore();

    tileDescriptions[tileIndex] = description || '';

    atlasDirty = true;
    if (!flushScheduled)
    {
        flushScheduled = true;
        queueMicrotask(flushAtlas);
    }

    return new TileInfo(vec2(drawX, drawY), vec2(TILE_SIZE),
        textureInfos[0], TILE_PADDING);
}

function flushAtlas()
{
    flushScheduled = false;
    if (!atlasDirty) return;
    atlasDirty = false;
    textureInfos[0].createWebGLTexture();
}
```

- [ ] **Step 2: Smoke-check the file syntactically**

Run: `node --check templates/textureGenerator.js`
Expected: no output, exit 0. (LittleJS globals will be unbound at runtime, but the file must at least parse.)

- [ ] **Step 3: Commit**

```
git add templates/textureGenerator.js
git commit -m "feat: add textureGenerator module (init + drawToTexture)"
```

---

### Task 2: Add saveAtlasImage and saveAtlasPrompt

**Files:**
- Modify: `templates/textureGenerator.js`

- [ ] **Step 1: Append save functions**

Append to the end of `templates/textureGenerator.js`:

```javascript

function saveAtlasImage(filename = 'atlas')
{
    flushAtlas();
    saveCanvas(atlasCanvas, filename);
}

function saveAtlasPrompt(filename = 'atlas-prompt')
{
    let blob = 'A 2048x2048 sprite atlas, 4x4 grid of 500px tiles with ' +
        '6px transparent gutters between tiles, transparent background. ' +
        'Tiles are numbered 0-15 left-to-right, top-to-bottom. Match each ' +
        'tile\'s silhouette and palette to the rough drawing.\n\n';
    for (let i = 0; i < TILE_COUNT; ++i)
    {
        if (tileDescriptions[i])
            blob += 'Tile ' + i + ': ' + tileDescriptions[i] + '\n';
    }
    const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(blob);
    saveDataURL(url, filename + '.txt');
}
```

Notes:
- `flushAtlas()` is called before `saveCanvas` so a same-frame batch of `drawToTexture` calls is committed to the canvas pixels (the canvas already has the pixels — the flush is for WebGL — but calling it costs nothing and keeps state tidy).
- Empty descriptions are skipped, so the prompt only mentions populated tiles.
- The header text is intentionally one paragraph so it pastes cleanly into ChatGPT/DALL-E.

- [ ] **Step 2: Syntax check**

Run: `node --check templates/textureGenerator.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```
git add templates/textureGenerator.js
git commit -m "feat: add saveAtlasImage and saveAtlasPrompt to textureGenerator"
```

---

### Task 3: Add useAtlasImage

**Files:**
- Modify: `templates/textureGenerator.js`

- [ ] **Step 1: Append the swap function**

Append to the end of `templates/textureGenerator.js`:

```javascript

function useAtlasImage(url)
{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () =>
    {
        // mutate textureInfos[0] in place so existing TileInfos keep working
        const tex = textureInfos[0];
        tex.image = img;
        tex.size = vec2(img.width, img.height);
        tex.sizeInverse = vec2(1 / img.width, 1 / img.height);
        tex.createWebGLTexture();
    };
    img.src = url;
}
```

Why mutate in place: `TileInfo` instances hold a hard reference to a specific `TextureInfo`. Replacing `textureInfos[0]` with a new instance would orphan all returned `TileInfo`s. Mutating preserves identity.

- [ ] **Step 2: Syntax check**

Run: `node --check templates/textureGenerator.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```
git add templates/textureGenerator.js
git commit -m "feat: add useAtlasImage swap to textureGenerator"
```

---

### Task 4: Rewrite textureGame.html to use the module

**Files:**
- Modify: `templates/textureGame.html`

This proves the module end-to-end: 7 sprites painted via `drawToTexture`, atlas overlay rendered, debug keys for save/swap.

- [ ] **Step 1: Replace the entire `<script>` body in `templates/textureGame.html`**

Open `templates/textureGame.html`. Add a `<script src="textureGenerator.js"></script>` line right before the inline `<script>` block, then replace the entire inline `<script>` content (lines 8 through the end of the script block) with:

```javascript
'use strict';

// engine settings, do not remove
debugWatermark = false;
showEngineVersion = false;
paused = false;

// engine settings, customize if necessary
gravity = vec2(0, 0);
cameraPos = vec2(0, 0);
cameraScale = 64;

///////////////////////////////////////////////////////////////////////////////
// TEXTURE ATLAS TEMPLATE
//
// Builds a 4x4 atlas of 500px tiles entirely from canvas draw ops via the
// textureGenerator module. Press S to save the atlas PNG + prompt blob,
// press L to swap to an "atlas-ai.png" sitting next to this file.

const sprites = {};

///////////////////////////////////////////////////////////////////////////////
// SPRITE PAINTERS — each fills the 500x500 drawable area of a tile.
// (0,0) is the tile's drawable top-left; clipping is handled by the module.

function paintCircle(ctx)
{
    const r = 226;
    const g = ctx.createRadialGradient(200, 175, r * .1, 250, 250, r);
    g.addColorStop(0, '#ffb3b3');
    g.addColorStop(1, '#b40000');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(250, 250, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#400';
    ctx.lineWidth = 16;
    ctx.stroke();
}

function paintStar(ctx)
{
    const cx = 250, cy = 250, rOuter = 220, rInner = rOuter * .45;
    ctx.beginPath();
    for (let i = 0; i < 10; ++i)
    {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 ? rInner : rOuter;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.strokeStyle = '#8a5a00';
    ctx.lineWidth = 20;
    ctx.stroke();
}

function paintGem(ctx)
{
    const cx = 250, top = 55, bot = 445, sideY = 190;
    const left = 65, right = 435;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(right, sideY);
    ctx.lineTo(cx, bot);
    ctx.lineTo(left, sideY);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#9be9ff');
    g.addColorStop(1, '#0a5f8a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#022';
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx - 60, sideY);
    ctx.lineTo(cx, bot);
    ctx.lineTo(cx + 60, sideY);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 8;
    ctx.stroke();
}

function paintGear(ctx)
{
    const cx = 250, cy = 250, teeth = 10, rOuter = 220, rInner = rOuter - 56;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; ++i)
    {
        const a = i * Math.PI / teeth;
        const r = i % 2 ? rInner : rOuter;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#888';
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, rInner * .45, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
}

function paintHeart(ctx)
{
    const cx = 250, cy = 150, w = 100;
    ctx.beginPath();
    ctx.moveTo(cx, cy + w * .4);
    ctx.bezierCurveTo(cx, cy - w * .4, cx - w * 2, cy - w * .4, cx - w * 2, cy + w * .3);
    ctx.bezierCurveTo(cx - w * 2, cy + w * 1.1, cx, cy + w * 2.2, cx, cy + w * 3);
    ctx.bezierCurveTo(cx, cy + w * 2.2, cx + w * 2, cy + w * 1.1, cx + w * 2, cy + w * .3);
    ctx.bezierCurveTo(cx + w * 2, cy - w * .4, cx, cy - w * .4, cx, cy + w * .4);
    ctx.closePath();
    ctx.fillStyle = '#ff3b6c';
    ctx.fill();
    ctx.strokeStyle = '#661022';
    ctx.lineWidth = 16;
    ctx.stroke();
}

function paintBolt(ctx)
{
    ctx.beginPath();
    ctx.moveTo(275, 50);
    ctx.lineTo(100, 275);
    ctx.lineTo(225, 275);
    ctx.lineTo(150, 450);
    ctx.lineTo(400, 200);
    ctx.lineTo(275, 200);
    ctx.lineTo(400, 50);
    ctx.closePath();
    ctx.fillStyle = '#fff46a';
    ctx.fill();
    ctx.strokeStyle = '#7a5a00';
    ctx.lineWidth = 16;
    ctx.stroke();
}

function paintFace(ctx)
{
    const cx = 250, cy = 250, r = 220;
    ctx.fillStyle = '#ffd18a';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3a00';
    ctx.lineWidth = 24;
    ctx.stroke();
    // eyes
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(cx - r * .35, cy - r * .15, r * .12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * .35, cy - r * .15, r * .12, 0, Math.PI * 2); ctx.fill();
    // smile
    ctx.beginPath();
    ctx.arc(cx, cy + r * .1, r * .45, .15 * Math.PI, .85 * Math.PI);
    ctx.lineWidth = 28;
    ctx.strokeStyle = '#5a1010';
    ctx.stroke();
}

///////////////////////////////////////////////////////////////////////////////
async function gameInit()
{
    initDrawToTexture();

    sprites.circle = drawToTexture(0, paintCircle, 'a glossy red rubber ball with dark outline');
    sprites.star   = drawToTexture(1, paintStar,   'a five-pointed gold star with dark outline');
    sprites.gem    = drawToTexture(2, paintGem,    'a cyan-to-deep-blue diamond gem with white facet highlight');
    sprites.gear   = drawToTexture(3, paintGear,   'a gray ten-toothed mechanical gear with a dark center hole');
    sprites.heart  = drawToTexture(4, paintHeart,  'a hot-pink heart with dark crimson outline');
    sprites.bolt   = drawToTexture(5, paintBolt,   'a yellow lightning bolt with brown outline');
    sprites.face   = drawToTexture(6, paintFace,   'a friendly tan smiley face with black eyes and red smile');

    canvasClearColor = hsl(.6, .2, .15);
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (keyWasPressed('KeyS'))
    {
        saveAtlasImage();
        saveAtlasPrompt();
    }
    if (keyWasPressed('KeyL'))
        useAtlasImage('atlas-ai.png');
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // show the full atlas underneath the sprite row
    const atlasView = vec2(6);
    const fullAtlas = new TileInfo(vec2(), vec2(2048));
    drawRect(vec2(0, -1), atlasView, GRAY);
    drawTile(vec2(0, -1), atlasView, fullAtlas, WHITE);

    // sprites in a row on top, gently rotating
    const row = [sprites.circle, sprites.star, sprites.gem,
                 sprites.gear, sprites.heart, sprites.bolt, sprites.face];
    const angle = time;
    for (let i = 0; i < row.length; ++i)
    {
        const x = (i - (row.length - 1) / 2) * 1.8;
        drawTile(vec2(x, 3), vec2(1.5), row[i], WHITE, angle);
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    drawTextScreen('Texture Atlas Template',
        vec2(mainCanvasSize.x / 2, 60), 50, WHITE, 4, BLACK);
    drawTextScreen('S = save atlas + prompt   L = load atlas-ai.png',
        vec2(mainCanvasSize.x / 2, 110), 24, hsl(0, 0, .7), 2, BLACK);
}

///////////////////////////////////////////////////////////////////////////////
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
```

Final structure of the file should be:
```html
<!DOCTYPE html><head>
<title>LittleJS Texture Atlas Template</title>
<meta charset="utf-8">
</head><body style="background:#000">
<script src="../dist/littlejs.js"></script>
<script src="soundGenerator.js"></script>
<script src="textureGenerator.js"></script>
<script>
... (the JS above) ...
</script></body></html>
```

- [ ] **Step 2: Open in a browser and verify**

Open `templates/textureGame.html` directly (file://) in a browser.

Expected:
- Bottom half of the screen shows the full 2048 atlas with 7 painted tiles in the top row (circle, star, gem, gear, heart, bolt, face) and 9 empty tile cells. Empty padding gutters are visible between tiles.
- Top half shows the same 7 sprites in a row, all gently rotating, each rendered crisply with no neighbor bleeding into adjacent sprites during rotation.
- Title text "Texture Atlas Template" + control hint at the top.
- DevTools console: no errors.

- [ ] **Step 3: Verify save**

Press **S** while the page has focus.

Expected: two browser downloads — `atlas.png` (the 2048×2048 sheet, mostly transparent except the 7 tiles) and `atlas-prompt.txt` containing the header paragraph followed by 7 `Tile N: ...` lines.

- [ ] **Step 4: Verify swap (using the just-saved PNG as a stand-in)**

Move the downloaded `atlas.png` to `templates/atlas-ai.png` (so the relative path from `textureGame.html` resolves). Reload the page, press **L**.

Expected: visual is identical (since we just swapped to the same image). No console errors. This proves the swap pipeline works end-to-end.

Clean up the test file:
```
git rm --cached templates/atlas-ai.png 2>/dev/null; rm templates/atlas-ai.png
```

- [ ] **Step 5: Commit**

```
git add templates/textureGame.html
git commit -m "refactor: rewrite textureGame template to use textureGenerator module"
```

---

### Task 5: Wire textureGenerator into the other templates

**Files:**
- Modify: `templates/game.html`
- Modify: `templates/boardGame.html`
- Modify: `templates/box2dGame.html`
- Modify: `templates/uiGame.html`

Each template gains a `<script src="textureGenerator.js">` tag positioned right after the existing `<script src="soundGenerator.js">` line. The module is opt-in — nothing runs unless the prototype calls `initDrawToTexture()`.

- [ ] **Step 1: Add the script tag to game.html**

In `templates/game.html`, find the line:
```html
<script src="soundGenerator.js"></script>
```
Insert immediately after it:
```html
<script src="textureGenerator.js"></script>
```

- [ ] **Step 2: Repeat for boardGame.html, box2dGame.html, uiGame.html**

Same edit in each of the three remaining templates.

- [ ] **Step 3: Verify each template still loads**

For each of the four templates, open the file directly in a browser. Expected: the template renders as before, DevTools console shows no errors. (Each template is unchanged in behavior since none calls `initDrawToTexture`.)

- [ ] **Step 4: Commit**

```
git add templates/game.html templates/boardGame.html templates/box2dGame.html templates/uiGame.html
git commit -m "chore: load textureGenerator in all templates"
```

---

### Task 6: Update CLAUDE.md to mention textureGenerator

**Files:**
- Modify: `CLAUDE.md`

Future prototype-author sessions need to know this module exists. CLAUDE.md already mentions `SoundGenerator`; add the texture analog right next to it.

- [ ] **Step 1: Edit the relevant bullet**

In `CLAUDE.md`, find the line:
```
- Use SoundGenerator class (defined in templates/soundGenerator.js, loaded via a script tag in every template) to make sound effects. When copying a template into games/, change the `<script src="soundGenerator.js">` path to `<script src="../templates/soundGenerator.js">`.
```

Add immediately after it:
```
- Use the textureGenerator module (defined in templates/textureGenerator.js, loaded via a script tag in every template) to build sprite atlases from canvas 2D draw ops. Call `initDrawToTexture()` once in gameInit, then `drawToTexture(tileIndex, drawFn, description)` for each sprite (16 tiles available, indexed 0-15; drawFn paints in a 500x500 pixel space). `saveAtlasImage()` and `saveAtlasPrompt()` export the sheet + an AI prompt; `useAtlasImage(url)` swaps to a precached AI-generated 2048x2048 atlas. When copying a template into games/, change the `<script src="textureGenerator.js">` path to `<script src="../templates/textureGenerator.js">`.
```

- [ ] **Step 2: Commit**

```
git add CLAUDE.md
git commit -m "docs: document textureGenerator module in CLAUDE.md"
```

---

## Self-review notes

- All five spec sections (file, fixed parameters, module state, API, auto-refresh, template integration) map to tasks 1–5. Out-of-scope items in the spec stay out of scope here.
- No placeholders: every step contains the literal code or command.
- Type/symbol consistency: `flushAtlas` is referenced by `drawToTexture` and `saveAtlasImage` and defined in Task 1. `tileDescriptions` array is populated in `initDrawToTexture` (Task 1) before `saveAtlasPrompt` (Task 2) reads it.
- `keyWasPressed` is the LittleJS API for edge-triggered key input (lower-case `keyWasPressed` in v2 — confirmed when implementing Task 4 by reading `dist/littlejs.js` if uncertain).
