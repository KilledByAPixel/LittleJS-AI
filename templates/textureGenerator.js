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

function saveAtlasImage(filename = 'atlas')
{
    flushAtlas();
    saveCanvas(atlasCanvas, filename);
}

function saveAtlasPrompt(filename = 'atlas-prompt')
{
    let blob = 'A 2048x2048 sprite atlas, 4x4 grid of 500px tiles with ' +
        '6px gutters between tiles, transparent background. ' +
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

function useAtlasImage(url)
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
    };
    img.src = url;
}
