'use strict';

// AI can use this module to build a sprite atlas from canvas 2D draw ops.
// initDrawToTexture(cols) builds a cols x cols grid inside a 2048 atlas.
// cols=4 (default) gives 16 tiles of 500px with 6px gutters (unchanged
// from the original module). cols=8 gives 64 tiles of 250px with 3px
// gutters. Only 4 and 8 are supported. initDrawToTexture() replaces
// textureInfos[0]. drawToTexture() paints a tile and returns a TileInfo.
// drawTextToTexture() is the shortcut for the common "centre an emoji or
// short string in a tile" case, with optional hue-shift recolour.
// saveAtlasImage()/saveAtlasPrompt() export the sheet + prompt.
// useAtlasImage(url) swaps in an AI-generated 2048 image without
// invalidating already-returned TileInfos.
// showAtlasOverlay(true|false) pins the live atlas canvas to the
// top-right of the page for visual debugging.

const ATLAS_SIZE = 2048;

let TILE_COLS, TILE_PADDING, TILE_STRIDE, TILE_SIZE, TILE_COUNT;
let atlasCanvas, atlasCtx, atlasDirty, flushScheduled;
const tileDescriptions = [];

function initDrawToTexture(cols = 4)
{
    ASSERT(cols === 4 || cols === 8, 'cols must be 4 or 8');

    TILE_COLS    = cols;
    TILE_STRIDE  = ATLAS_SIZE / TILE_COLS;        // 512 or 256
    TILE_PADDING = TILE_COLS === 4 ? 6 : 3;
    TILE_SIZE    = TILE_STRIDE - TILE_PADDING * 2; // 500 or 250
    TILE_COUNT   = TILE_COLS * TILE_COLS;

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

// Convenience wrapper for the common case — paint a single emoji or short
// text glyph centred in a tile, optionally hue-shifted. Removes the
// "ctx.font / textAlign / textBaseline / fillText" boilerplate from every
// caller, and lets a game produce recoloured variants of the same emoji
// (e.g. a 180° hue-shifted Evil Wizard) by passing `hueShift` instead of
// painting a custom drawFn.
//
// Usage:
//   drawTextToTexture(0, '🧙');
//   drawTextToTexture(37, '🧙', {hueShift: 180, description: 'evil wizard'});
//   drawTextToTexture(46, '💎', {filter: 'hue-rotate(260deg) saturate(1.3)'});
//   drawTextToTexture(7, 'GO', {sizeMul: .6, font: 'sans-serif'});
//
// Options:
//   description  – atlas-prompt label; falls back to `text` if omitted
//   hueShift     – degrees, 0–360. 0 = no filter applied
//   filter       – raw CSS canvas filter string (overrides hueShift) — use
//                  this for saturate / brightness / etc. combos
//   sizeMul      – font scale; default .85 leaves a few px of breathing room
//   font         – font family, default 'serif' (matches the emoji look)
function drawTextToTexture(tileIndex, text, options)
{
    options = options || {};
    const hueShift    = options.hueShift    || 0;
    const filter      = options.filter      || (hueShift ? 'hue-rotate(' + hueShift + 'deg)' : '');
    const sizeMul     = options.sizeMul     != null ? options.sizeMul : .85;
    const font        = options.font        || 'serif';
    // Falling back to the glyph itself as the description keeps the
    // atlas-prompt output legible even when the caller didn't spell out
    // a label — for emoji sheets that's almost always good enough.
    const description = options.description || text;

    return drawToTexture(tileIndex, ctx =>
    {
        if (filter) ctx.filter = filter;
        ctx.font = (TILE_SIZE * .96 * sizeMul) + 'px ' + font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // emoji glyphs sit a few px above the math-center of their em box —
        // nudge down so the visual centre lands at the tile centre.
        ctx.fillText(text, TILE_SIZE / 2, TILE_SIZE / 2 + TILE_SIZE * .04);
    }, description);
}

function flushAtlas()
{
    flushScheduled = false;
    if (!atlasDirty) return;
    atlasDirty = false;
    textureInfos[0].createWebGLTexture();
}

function saveAtlasImage(filename = 'atlas')
{
    flushAtlas();
    saveCanvas(atlasCanvas, filename);
}

function saveAtlasPrompt(filename = 'atlas-prompt')
{
    let blob = 'A 2048x2048 sprite atlas, ' + TILE_COLS + 'x' + TILE_COLS +
        ' grid of ' + TILE_SIZE + 'px tiles with ' + TILE_PADDING +
        'px gutters between tiles, transparent background. ' +
        'Tiles are numbered 0-' + (TILE_COUNT - 1) +
        ' left-to-right, top-to-bottom. Match each tile\'s silhouette ' +
        'and palette to the rough drawing.\n\n';
    for (let i = 0; i < TILE_COUNT; ++i)
    {
        if (tileDescriptions[i])
            blob += 'Tile ' + i + ': ' + tileDescriptions[i] + '\n';
    }
    const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(blob);
    saveDataURL(url, filename + '.txt');
}

// Returns a Promise that resolves once the swap is done (or the image fails
// to load, so callers can `await` it without hanging on a missing file).
// Resolves with true on success, false on error.
function useAtlasImage(url)
{
    return new Promise(resolve =>
    {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () =>
        {
            // paint the loaded image into the 2048 atlasCanvas, scaling as needed
            // so tile coordinates stay correct regardless of source image size
            atlasCtx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
            atlasCtx.drawImage(img, 0, 0, ATLAS_SIZE, ATLAS_SIZE);
            textureInfos[0].createWebGLTexture();
            resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

// Debug helper: pin the live atlasCanvas to the top-right of the page so
// you can see exactly what's in the texture as you paint tiles. Same
// element doubles as the WebGL texture source, so updates appear live.
// Call showAtlasOverlay() to toggle on, showAtlasOverlay(false) to hide.
function showAtlasOverlay(visible = true)
{
    if (!atlasCanvas) return;
    if (visible)
    {
        atlasCanvas.style.cssText =
            'position:fixed;top:8px;right:8px;width:25vmin;height:25vmin;' +
            'border:2px solid #f0a;pointer-events:none;z-index:9999;' +
            'background:rgba(128,128,128,.5);image-rendering:auto;';
        document.body.appendChild(atlasCanvas);
    }
    else if (atlasCanvas.parentNode)
    {
        atlasCanvas.parentNode.removeChild(atlasCanvas);
    }
}
