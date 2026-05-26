'use strict';

// AI can use this module to build a sprite atlas from canvas 2D draw ops.
// initDrawToTexture(cols) builds a cols x cols grid inside a 2048 atlas.
// cols=4 (default) gives 16 tiles of 500px with 6px gutters (unchanged
// from the original module). cols=8 gives 64 tiles of 250px with 3px
// gutters. Only 4 and 8 are supported. initDrawToTexture() replaces
// textureInfos[0]. drawToTexture() paints a tile and returns a TileInfo.
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
            'background:rgba(0,0,0,.6);image-rendering:auto;';
        document.body.appendChild(atlasCanvas);
    }
    else if (atlasCanvas.parentNode)
    {
        atlasCanvas.parentNode.removeChild(atlasCanvas);
    }
}
