'use strict';

// AI can use this module to build a sprite atlas from canvas 2D draw ops.
// initDrawToTexture(cols) builds a cols x cols grid inside the atlas. The atlas
// is 4096px when the GPU's MAX_TEXTURE_SIZE allows (near-universal on WebGL2)
// and 2048px otherwise — see pickAtlasSize(). cols=4 (default) gives 16 tiles,
// cols=8 gives 64 tiles; only 4 and 8 are supported. Tile pixel sizes scale
// with the atlas (e.g. cols=4 -> 1000px tiles at 4096, 488px at 2048). Paint
// functions always draw in a fixed DRAW_SIZE (500) space scaled to the tile,
// so the atlas resolution / gutter / tile pixel size can change without
// touching paint code.
// initDrawToTexture() replaces textureInfos[0]. drawToTexture() paints a tile
// and returns a TileInfo.
// drawTextToTexture() is the shortcut for the common "centre an emoji or
// short string in a tile" case, with optional hue-shift recolour.
// saveAtlasImage()/saveAtlasPrompt() export the sheet + prompt.
// useAtlasImage(url) swaps in an AI-generated atlas image without
// invalidating already-returned TileInfos.
// initDefaultAtlas() bakes 16 built-in white-on-transparent icons (circle,
// droplet, ... bolt) into tiles 0-15 and returns a name->TileInfo map, ready
// to tint per-instance via drawTile's color arg. drawDefaultIcon(name,
// tileIndex, scale) paints a single named icon into any tile.
// showAtlas(true|false) pins the live atlas canvas to the
// top-right of the page for visual debugging.

// Atlas pixel resolution. Starts at 2048 (the WebGL-guaranteed minimum) but
// initDrawToTexture upgrades it to 4096 when the GPU reports it can sample a
// texture that large. Paint fns are unaffected — they always draw in DRAW_SIZE
// space, which drawToTexture scales to the tile.
let ATLAS_SIZE = 2048;

// Pick the atlas resolution: prefer 4096 for sharper sprites, but never exceed
// what the GPU can sample. glContext is a WebGL2 context created before
// gameInit; it's undefined only on the canvas2D fallback, where 2048 is safe.
// Both 2048 and 4096 are powers of two, so the mipmap path stays valid.
function pickAtlasSize()
{
    const preferred = 4096, fallback = 2048;
    if (!glContext) return fallback; // canvas2D fallback, no GL to query
    const max = glContext.getParameter(glContext.MAX_TEXTURE_SIZE);
    return max >= preferred ? preferred : fallback;
}

// Fixed logical space every paint function draws in, regardless of the actual
// tile resolution. drawToTexture scales DRAW_SIZE -> TILE_SIZE, so changing
// TILE_PADDING / TILE_SIZE never shifts or clips a sprite — paint fns keep
// using 0..DRAW_SIZE coordinates (the documented 500x500 contract).
const DRAW_SIZE = 500;

let TILE_COLS, TILE_PADDING, TILE_STRIDE, TILE_SIZE, TILE_COUNT;
let atlasCanvas, atlasCtx, atlasDirty, flushScheduled;
const tileDescriptions = [];

// Default font family used by drawTextToTexture when a caller doesn't pass
// its own `font` option. 'serif' picks the OS emoji font on every platform.
// A game that bundles its own emoji font (e.g. a loaded Twemoji FontFace)
// can call setTextureFont('"Twemoji", serif') once before painting its atlas
// to get identical glyphs across browsers/OSes. Backward-compatible: any game
// that doesn't call it keeps the original 'serif' behaviour.
let textureDefaultFont = 'serif';
function setTextureFont(font) { textureDefaultFont = font || 'serif'; }

// Default outline used by drawTextToTexture when a caller doesn't pass its
// own `outline` option. null = no outline (original behaviour). Set once via
// setTextureOutline(true) (or an {color,width} object) to give every emoji in
// a game's atlas a black sticker outline so it pops off the background.
let textureDefaultOutline = null;
function setTextureOutline(outline) { textureDefaultOutline = outline; }

function initDrawToTexture(cols = 4)
{
    ASSERT(cols === 4 || cols === 8, 'cols must be 4 or 8');

    // A generated atlas is always a high-res (2048px+) sheet, so disable the
    // engine's nearest-neighbour pixel-art filtering for smooth sampling. Set
    // before the TextureInfo below so its GL texture gets LINEAR magFilter +
    // mipmaps. Games used to set this at module top-level; it now lives here so
    // any texture-generator game gets it automatically. The engine re-reads
    // tilesPixelated every frame in enginePreRender, and gameInit (where this
    // runs) completes before the first render, so the timing matches.
    tilesPixelated = false;

    ATLAS_SIZE   = pickAtlasSize();               // 4096 if the GPU allows, else 2048
    TILE_COLS    = cols;
    TILE_STRIDE  = ATLAS_SIZE / TILE_COLS;        // 1024/512 at 4096, 512/256 at 2048
    TILE_PADDING = TILE_COLS === 4 ? 12 : 6;       // transparent moat to stop mip bleed
    TILE_SIZE    = TILE_STRIDE - TILE_PADDING * 2;
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
    // paint in a fixed DRAW_SIZE space scaled to fill the tile, so paint fns are
    // independent of TILE_SIZE (padding can change without moving sprites).
    atlasCtx.scale(TILE_SIZE / DRAW_SIZE, TILE_SIZE / DRAW_SIZE);
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
//   drawTextToTexture(31, '🗡️', {flipX: true});   // mirror across vertical axis
//   drawTextToTexture(44, '🪓', {flipY: true});   // mirror across horizontal axis
//   drawTextToTexture(5, '🐱', {outline: true});  // black sticker outline
//
// Options:
//   description  – atlas-prompt label; falls back to `text` if omitted
//   hueShift     – degrees, 0–360. 0 = no filter applied
//   filter       – raw CSS canvas filter string (overrides hueShift) — use
//                  this for saturate / brightness / etc. combos
//   sizeMul      – font scale; default .85 leaves a few px of breathing room
//   font         – font family, default 'serif' (matches the emoji look)
//   flipX        – mirror the glyph left↔right (about the vertical axis)
//   flipY        – mirror the glyph top↔bottom (about the horizontal axis)
//   outline      – add a contrasting outline so the glyph pops off the
//                  background. true | width-fraction | {color, width}.
//                  `width` is a fraction of the tile size (default .04).
//                  Color emoji can't be stroked cleanly, so this DILATES the
//                  glyph — stamps a flattened-to-solid copy around a ring —
//                  rather than using strokeText.
function drawTextToTexture(tileIndex, text, options)
{
    options = options || {};
    const hueShift    = options.hueShift    || 0;
    const filter      = options.filter      || (hueShift ? 'hue-rotate(' + hueShift + 'deg)' : '');
    const sizeMul     = options.sizeMul     != null ? options.sizeMul : .85;
    const font        = options.font        || textureDefaultFont;
    const flipX       = !!options.flipX;
    const flipY       = !!options.flipY;
    // Falling back to the glyph itself as the description keeps the
    // atlas-prompt output legible even when the caller didn't spell out
    // a label — for emoji sheets that's almost always good enough.
    const description = options.description || text;

    // Normalise the outline option into {color, width} or null.
    let outline = options.outline != null ? options.outline : textureDefaultOutline;
    if (outline)
    {
        if (outline === true)                 outline = {};
        else if (typeof outline === 'number') outline = {width: outline};
        outline = {
            color: outline.color != null ? outline.color : '#000',
            width: outline.width != null ? outline.width : .04,
        };
    }

    return drawToTexture(tileIndex, ctx =>
    {
        ctx.font = (DRAW_SIZE * .96 * sizeMul) + 'px ' + font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // emoji glyphs sit a few px above the math-center of their em box —
        // nudge down so the visual centre lands at the tile centre.
        const cx = DRAW_SIZE / 2;
        const cy = DRAW_SIZE / 2 + DRAW_SIZE * .04;

        // Paint the glyph once at (x,y), honouring the optional flip.
        const paint = (x, y) =>
        {
            if (flipX || flipY)
            {
                // Translate + scale so the flip pivots around the glyph centre.
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
                ctx.fillText(text, 0, 0);
                ctx.restore();
            }
            else
                ctx.fillText(text, x, y);
        };

        if (outline)
        {
            // brightness(0) flattens the colour glyph to solid black while
            // keeping its alpha shape; stamping the whole glyph (not a point)
            // at each ring offset fully covers the dilated band, so a modest
            // sample count leaves no gaps.
            const r = outline.width * DRAW_SIZE;
            const samples = 16;
            ctx.save();
            ctx.filter = 'brightness(0)';
            for (let i = 0; i < samples; ++i)
            {
                const a = i / samples * 2 * Math.PI;
                paint(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            ctx.restore();

            // Recolour the black silhouette if a non-black outline was asked
            // for. source-atop tints only the pixels already drawn.
            if (outline.color !== '#000' && outline.color !== 'black')
            {
                ctx.save();
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = outline.color;
                ctx.fillRect(0, 0, DRAW_SIZE, DRAW_SIZE);
                ctx.restore();
            }
        }

        // The colour glyph on top of its outline.
        if (filter) ctx.filter = filter;
        paint(cx, cy);
    }, description);
}

function flushAtlas()
{
    flushScheduled = false;
    if (!atlasDirty) return;
    atlasDirty = false;
    textureInfos[0].createWebGLTexture();
}

// Force every texel's RGB to white, keeping the alpha channel, then re-upload
// the atlas + regenerate mipmaps. This is the real cure for the dark halo on a
// WHITE-only atlas (e.g. the default icons): the fringe comes from bilinear
// filtering and mipmap downsampling averaging the white icon edge with the
// transparent surround, whose RGB is (0,0,0) — so the colour drifts toward
// black. With RGB white EVERYWHERE no average can darken, and because alpha
// stays a true 0 in the transparent region it also contributes nothing under
// additive blending (no faint square like the 1/255 trick had).
//
// The trick that makes this possible: we upload the ImageData straight to the
// GPU. You can't fix it on the canvas itself — a 2D canvas is premultiplied,
// so any pixel with alpha 0 has its RGB forced back to black the instant it
// touches the canvas (putImageData included). ImageData / texImage2D is NOT
// premultiplied (UNPACK_PREMULTIPLY_ALPHA is off in LittleJS), so white-at-
// alpha-0 survives all the way into the texture.
//
// Only valid for a uniformly white atlas — it overwrites colour. Call it AFTER
// all white tiles are painted; if you later draw more tiles, call it again
// (a normal flush re-uploads the black-RGB canvas and undoes this).
//
// `ignoreTiles` (optional array of tile indices) lets a mixed atlas keep some
// tiles' real colours: pixels inside those tiles' cells are left untouched, so
// a sprite that WANTS a dark outline (e.g. a card front's thin black border or
// a coloured card back) survives while the surrounding white tiles still get
// de-haloed. Omit it for the original whole-atlas behaviour.
function whitenAtlasAlpha(ignoreTiles = [])
{
    flushAtlas(); // make sure the GL texture exists / is current first
    if (!glContext || !textureInfos[0].glTexture) return; // canvas2D: no GL halo

    const image = atlasCtx.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    const d = image.data;
    if (!ignoreTiles.length)
    {
        for (let i = 0; i < d.length; i += 4)
            d[i] = d[i+1] = d[i+2] = 255; // white RGB, leave d[i+3] (alpha) alone
    }
    else
    {
        // Whiten every pixel except those falling inside an ignored tile's cell.
        const skip = new Set(ignoreTiles);
        for (let py = 0; py < ATLAS_SIZE; ++py)
        {
            const rowTile = (py / TILE_STRIDE | 0) * TILE_COLS;
            for (let px = 0; px < ATLAS_SIZE; ++px)
            {
                if (skip.has(rowTile + (px / TILE_STRIDE | 0))) continue;
                const i = (py * ATLAS_SIZE + px) * 4;
                d[i] = d[i+1] = d[i+2] = 255; // white RGB, leave alpha alone
            }
        }
    }

    glContext.bindTexture(glContext.TEXTURE_2D, textureInfos[0].glTexture);
    glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA,
        glContext.RGBA, glContext.UNSIGNED_BYTE, image);
    if (!tilesPixelated && isPowerOfTwo(ATLAS_SIZE))
        glContext.generateMipmap(glContext.TEXTURE_2D); // white RGB -> clean mips
    glContext.bindTexture(glContext.TEXTURE_2D, glActiveTexture); // restore engine binding
}

function saveAtlasImage(filename = 'atlas')
{
    flushAtlas();
    saveCanvas(atlasCanvas, filename);
}

function saveAtlasPrompt(filename = 'atlas-prompt')
{
    let blob = 'A ' + ATLAS_SIZE + 'x' + ATLAS_SIZE + ' sprite atlas, ' + TILE_COLS + 'x' + TILE_COLS +
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
            // paint the loaded image into the ATLAS_SIZE atlasCanvas, scaling as needed
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
// Call showAtlas() to toggle on, showAtlas(false) to hide.
function showAtlas(visible = true)
{
    if (!atlasCanvas) return;
    if (visible)
    {
        atlasCanvas.style.cssText =
            'position:fixed;top:8px;right:8px;width:50vmin;height:50vmin;' +
            'border:2px solid #f0a;pointer-events:none;z-index:9999;' +
            'background:rgba(128,128,128,.5);image-rendering:auto;';
        document.body.appendChild(atlasCanvas);
    }
    else if (atlasCanvas.parentNode)
    {
        atlasCanvas.parentNode.removeChild(atlasCanvas);
    }
}

///////////////////////////////////////////////////////////////////////////////
// DEFAULT ICON ATLAS
//
// 16 white-on-transparent icons that any prototype can bake in one call. Icons
// are drawn pure white so games tint them per-instance via drawTile's color
// arg: drawTile(pos, size, icons.star, RED). The private drawers + path helpers
// live inside the IIFE below so generic names (circle, poly, ...) never leak
// to global scope; only DEFAULT_ICON_NAMES, drawDefaultIcon, and
// initDefaultAtlas are public.
//
// Tile order (row-major, 0..15):
//   0 circle     1 glow      2 ring       3 roundSquare
//   4 triangle   5 diamond   6 pentagon   7 hexagon
//   8 spark      9 star     10 burst     11 plus
//  12 heart     13 droplet  14 bolt      15 arrow

const DEFAULT_ICON_NAMES = [
    'circle', 'glow',  'ring', 'roundSquare',
    'triangle', 'diamond', 'pentagon', 'hexagon',
    'spark', 'star', 'burst', 'plus',
    'heart', 'droplet', 'bolt', 'arrow', 
];

// Private registry: name -> fn(ctx, x, y, r). Each draws a white icon centred
// at (x,y) with nominal radius r, using the ctx's current white fill/stroke
// (glow/spark build their own white radial gradients).
const _defaultIconDrawers = (() =>
{
    function poly(ctx, x, y, r, sides, rot=0)
    {
        ctx.beginPath();
        for (let k = sides; k--;)
        {
            const a = rot + k * (2*PI / sides);
            const px = x + Math.sin(a) * r, py = y - Math.cos(a) * r;
            ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    function starPath(ctx, x, y, ro, ri, points, rot = -PI / 2)
    {
        ctx.beginPath();
        for (let k = points * 2; k--;)
        {
            const rr = k & 1 ? ri : ro;
            const a = rot + k * (PI / points);
            const px = x + Math.cos(a) * rr;
            const py = y + Math.sin(a) * rr;
            ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    function roundRectPath(ctx, x, y, w, h, r)
    {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function circle(ctx, x, y, r)
    {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 9);
        ctx.fill();
    }

    function droplet(ctx, x, y, r)
    {
        // point at top, round bulb at the bottom
        const by = y + .3 * r, br = .6 * r; // bulb center y, bulb radius
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.bezierCurveTo(x + .3 * r, y - .5 * r, x + br, y - .1 * r, x + br, by);
        ctx.arc(x, by, br, 0, PI); // rounded bottom
        ctx.bezierCurveTo(x - br, y - .1 * r, x - .3 * r, y - .5 * r, x, y - r);
        ctx.closePath();
        ctx.fill();
    }

    function roundSquare(ctx, x, y, r)
    {
        roundRectPath(ctx, x - r, y - r, r*2, r*2, r*.4);
        ctx.fill();
    }

    function triangle(ctx, x, y, r)
    {
        poly(ctx, x, y, r, 3);
        ctx.fill();
    }

    function diamond(ctx, x, y, r)
    {
        poly(ctx, x, y, r, 4);
        ctx.fill();
    }

    function pentagon(ctx, x, y, r)
    {
        poly(ctx, x, y, r, 5);
        ctx.fill();
    }

    function hexagon(ctx, x, y, r)
    {
        poly(ctx, x, y, r, 6, PI/2);
        ctx.fill();
    }

    function ring(ctx, x, y, r)
    {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 9);
        ctx.arc(x, y, r*.7, 9, 0, true);
        ctx.fill();
    }

    function glow(ctx, x, y, r)
    {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 9);
        ctx.fill();
    }

    function burst(ctx, x, y, r)
    {
        starPath(ctx, x, y, r, r*.7, 10);
        ctx.fill();
    }

    function spark(ctx, x, y, r)
    {
        starPath(ctx, x, y, r, r/4, 4);
        ctx.fill();
    }

    function star(ctx, x, y, r)
    {
        starPath(ctx, x, y, r, r*.4, 5);
        ctx.fill();
    }

    function heart(ctx, x, y, r)
    {
        const width    = 1;   // diameter of heart
        const topCtrl  = .92; // lobe humps bulge
        const dip      = .40; // depth of the notch
        const shoulder = .46; // outer sides begin height
        const tip      = .9;  // bottom point drop

        // create the heart shape
        const p = (nx, ny) => [x + nx * r, y + ny * r];
        ctx.beginPath();
        ctx.moveTo(...p(0, -dip));
        ctx.bezierCurveTo(...p(0, -topCtrl), ...p(-width, -topCtrl), ...p(-width, -shoulder));
        ctx.bezierCurveTo(...p(-width, 0), ...p(0, tip * .9), ...p(0, tip));
        ctx.bezierCurveTo(...p(0, tip * .9), ...p(width, 0), ...p(width, -shoulder));
        ctx.bezierCurveTo(...p(width, -topCtrl), ...p(0, -topCtrl), ...p(0, -dip));
        ctx.closePath();
        ctx.fill();
    }

    function plus(ctx, x, y, r)
    {
        const a = r * .3; // arm half-width
        const b = r;      // arm extent
        ctx.beginPath();
        ctx.moveTo(x - a, y - b);
        ctx.lineTo(x + a, y - b);
        ctx.lineTo(x + a, y - a);
        ctx.lineTo(x + b, y - a);
        ctx.lineTo(x + b, y + a);
        ctx.lineTo(x + a, y + a);
        ctx.lineTo(x + a, y + b);
        ctx.lineTo(x - a, y + b);
        ctx.lineTo(x - a, y + a);
        ctx.lineTo(x - b, y + a);
        ctx.lineTo(x - b, y - a);
        ctx.lineTo(x - a, y - a);
        ctx.closePath();
        ctx.fill();
    }

    function arrow(ctx, x, y, r)
    {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + .8 * r, y - .1 * r);
        ctx.lineTo(x + .3 * r, y - .1 * r);
        ctx.lineTo(x + .3 * r, y + r);
        ctx.lineTo(x - .3 * r, y + r);
        ctx.lineTo(x - .3 * r, y - .1 * r);
        ctx.lineTo(x - .8 * r, y - .1 * r);
        ctx.closePath();
        ctx.fill();
    }

    function bolt(ctx, x, y, r)
    {
        ctx.beginPath();
        ctx.moveTo(x + .25 * r, y - r);
        ctx.lineTo(x -  .5 * r, y + .15 * r);
        ctx.lineTo(x -  .1 * r, y + .15 * r);
        ctx.lineTo(x - .25 * r, y + r);
        ctx.lineTo(x +  .5 * r, y -  .2 * r);
        ctx.lineTo(x +  .1 * r, y -  .2 * r);
        ctx.closePath();
        ctx.fill();
    }

    return {
        circle, glow, ring, roundSquare,
        triangle, diamond, pentagon, hexagon,
        spark, star, burst, plus,
        heart, droplet, bolt, arrow,
    };
})();

// Draw one named white icon into a tile; returns its TileInfo (like
// drawToTexture). scale tweaks icon size within the tile (1 = default).
function drawDefaultIcon(name, tileIndex, scale = 1)
{
    const fn = _defaultIconDrawers[name];
    ASSERT(fn, 'unknown default icon: ' + name);
    return drawToTexture(tileIndex, ctx =>
    {
        const c = DRAW_SIZE / 2;
        const r = c * scale;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        fn(ctx, c, c, r);
    }, name);
}

// Build the 16 default icons into tiles 0-15 and return a name->TileInfo map.
// Auto-inits a 4x4 atlas if none exists; if an atlas was already created (e.g.
// initDrawToTexture(8)), reuses it and leaves tiles 16+ free for custom sprites.
function initDefaultAtlas(scale = 1)
{
    if (!atlasCtx) initDrawToTexture(4);
    const icons = {};
    for (let i = 0; i < DEFAULT_ICON_NAMES.length; ++i)
        icons[DEFAULT_ICON_NAMES[i]] = drawDefaultIcon(DEFAULT_ICON_NAMES[i], i, scale);
    whitenAtlasAlpha(); // white RGB everywhere -> no dark halo, true alpha-0 elsewhere
    return icons;
}
