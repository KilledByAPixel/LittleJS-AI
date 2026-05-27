'use strict';

// =============================================================================
// templates/cards.js
// Procedural sprite atlas + render helpers for a standard 52-card deck.
//
// Requires textureGenerator.js (initDrawToTexture / drawToTexture / TileInfo).
//
// Usage:
//   initCardAtlas();                  // once in gameInit
//   drawCard(pos, rank, suit);        // face-up; rank 0..12, suit 0..3
//   drawCardBack(pos);                // face-down; uses configurable back art
//   drawCardShape(pos, size, color);  // card-silhouette solid (shadows, drop hints)
//
// Tile budget: claims indices 0-12 (ranks), 16-19 (suits), 24 (front bg),
// 25 (tint mask), 26 (back) of an initDrawToTexture(8) atlas. Host games
// can use the remaining 37 slots for their own sprites.
//
// Customization (all optional, pass to initCardAtlas):
//   { redInk, blackInk, paintBack, rankLabels, suitGlyphs }
// Defaults match games/freecell.html's original look.
// =============================================================================

// --- Public constants (var so they're window-global across script tags) ---
var CARD_SIZE     = vec2(6, 8.5);
var CARD_ASPECT   = 8.5 / 6;
var SUIT_HEARTS   = 0;
var SUIT_SPADES   = 1;
var SUIT_DIAMONDS = 2;
var SUIT_CLUBS    = 3;
var RANK_ACE      = 0;
var RANK_JACK     = 10;
var RANK_QUEEN    = 11;
var RANK_KING     = 12;

// --- Internal defaults ---
const _CARD_RANK_LABELS   = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const _CARD_SUIT_GLYPHS   = ['♥','♠','♦','♣'];
const _CARD_DEFAULT_RED   = new Color(0.85, 0.10, 0.10);
const _CARD_DEFAULT_BLACK = new Color(0.05, 0.05, 0.05);

// Glyph layout in world units, sized for the default CARD_SIZE (6x8.5).
// When drawCard is called with a different size, these scale uniformly by
// size.x / CARD_SIZE.x so glyphs stay proportional.
const _CARD_CORNER_RANK_OFFSET = vec2(1.0, 1.0);
const _CARD_CORNER_RANK_SIZE   = vec2(1.8);
const _CARD_CORNER_SUIT_OFFSET = vec2(2.0, 1.0);
const _CARD_CORNER_SUIT_SIZE   = vec2(1.4);
const _CARD_PIP_SIZE           = vec2(1.4);
const _CARD_PIP_SPREAD_X       = 1.2;
const _CARD_PIP_SPREAD_Y       = 1.6;

// --- Internal state ---
let _cardSprites  = null;     // { ranks:[13], suits:[4], bg, tint, back } of TileInfos
let _cardRedInk   = _CARD_DEFAULT_RED;
let _cardBlackInk = _CARD_DEFAULT_BLACK;

// --- Tile-bleed prevention ---
// The bg/tint/back silhouettes are painted inside a margin so bilinear
// sampling can't pick up neighbouring atlas tiles when the card is rendered
// at sub-source-size scales. The renderer then scales the tile up by
// _CARD_BG_SCALE so the painted silhouette still covers the caller's
// requested CARD_SIZE — visible card stays the same size, just with a
// transparent breathing-room border in the atlas.
const _CARD_TILE_PX  = 250;                                       // tile drawable area
const _CARD_INSET    = 16;                                        // transparent margin
const _CARD_SILH_PX  = _CARD_TILE_PX - 2 * _CARD_INSET;           // painted silhouette = 218
const _CARD_BG_SCALE = _CARD_TILE_PX / _CARD_SILH_PX;             // ~1.147 render compensation

// =============================================================================
// PUBLIC API
// =============================================================================

function initCardAtlas(options = {})
{
    initDrawToTexture(8);

    const rankLabels = options.rankLabels || _CARD_RANK_LABELS;
    const suitGlyphs = options.suitGlyphs || _CARD_SUIT_GLYPHS;
    const paintBack  = options.paintBack  || _paintDefaultCardBack;
    _cardRedInk   = options.redInk   || _CARD_DEFAULT_RED;
    _cardBlackInk = options.blackInk || _CARD_DEFAULT_BLACK;

    _cardSprites = { ranks: [], suits: [], bg: null, tint: null, back: null };
    for (let i = 0; i < 13; ++i)
        _cardSprites.ranks.push(drawToTexture(i,
            _paintRankTile(rankLabels[i]), 'card rank ' + rankLabels[i]));
    for (let i = 0; i < 4; ++i)
        _cardSprites.suits.push(drawToTexture(16 + i,
            _paintSuitTile(suitGlyphs[i]), 'card suit ' + suitGlyphs[i]));
    _cardSprites.bg = drawToTexture(24, _paintCardBg,
        'card front, rounded white rectangle with thin dark border');
    _cardSprites.tint = drawToTexture(25, _paintTintShape,
        'card-shaped solid-white silhouette for tint overlays');
    _cardSprites.back = drawToTexture(26, paintBack,
        'card back design');
}

// Draws a face-up card. options: { size, angle, tint }
function drawCard(pos, rank, suit, options = {})
{
    ASSERT(_cardSprites, 'initCardAtlas() must be called before drawCard()');
    const size    = options.size || CARD_SIZE;
    const angle   = options.angle || 0;
    const tint    = options.tint;
    const scale   = size.x / CARD_SIZE.x;
    const bgSize  = size.scale(_CARD_BG_SCALE);   // compensates for paint inset

    drawTile(pos, bgSize, _cardSprites.bg, undefined, angle);

    const color    = (suit % 2 === 0) ? _cardRedInk : _cardBlackInk;
    const rankTile = _cardSprites.ranks[rank];
    const suitTile = _cardSprites.suits[suit];

    const halfX = CARD_SIZE.x / 2, halfY = CARD_SIZE.y / 2;
    const crSize = _CARD_CORNER_RANK_SIZE.scale(scale);
    const csSize = _CARD_CORNER_SUIT_SIZE.scale(scale);

    // Place a tile at an offset given in unrotated card-local coordinates,
    // honoring the card's rotation. extraAngle stacks on top of `angle`
    // (used to flip the bottom-right glyphs 180°).
    const placeAt = (dx, dy, glyphSize, tile, extraAngle = 0) =>
    {
        const local = vec2(dx, dy).scale(scale).rotate(angle);
        drawTile(pos.add(local), glyphSize, tile, color, angle + extraAngle);
    };

    // Top-left corner: rank above, suit below.
    placeAt(-halfX + _CARD_CORNER_RANK_OFFSET.x,  halfY - _CARD_CORNER_RANK_OFFSET.y, crSize, rankTile);
    placeAt(-halfX + _CARD_CORNER_SUIT_OFFSET.x,  halfY - _CARD_CORNER_SUIT_OFFSET.y, csSize, suitTile);

    // Main face. Ace = big suit; J/Q/K = big rank glyph; 2-10 = pip pattern.
    if (rank === 0)
        drawTile(pos, vec2(4.2 * scale), suitTile, color, angle);
    else if (rank >= 10)
        drawTile(pos, vec2(4.6 * scale), rankTile, color, angle);
    else
        _drawPips(pos, rank + 1, suitTile, color, angle, scale);

    // Bottom-right corner, rotated 180° so glyphs read upside-down.
    placeAt( halfX - _CARD_CORNER_RANK_OFFSET.x, -halfY + _CARD_CORNER_RANK_OFFSET.y, crSize, rankTile, PI);
    placeAt( halfX - _CARD_CORNER_SUIT_OFFSET.x, -halfY + _CARD_CORNER_SUIT_OFFSET.y, csSize, suitTile, PI);

    // Highlight veil last so it sits over the glyphs too. Tint tile has no
    // dark edge, so the bg's border isn't re-tinted.
    if (tint) drawTile(pos, bgSize, _cardSprites.tint, tint, angle);
}

// Draws a face-down card. options: { size, angle, tint }
function drawCardBack(pos, options = {})
{
    ASSERT(_cardSprites, 'initCardAtlas() must be called before drawCardBack()');
    const size   = options.size || CARD_SIZE;
    const angle  = options.angle || 0;
    const tint   = options.tint;
    const bgSize = size.scale(_CARD_BG_SCALE);
    drawTile(pos, bgSize, _cardSprites.back, undefined, angle);
    if (tint) drawTile(pos, bgSize, _cardSprites.tint, tint, angle);
}

// Draws a solid card-shaped silhouette in `color`. Use for shadows, empty-
// slot drop hints, or any case where you need the card's rounded outline
// without the front art.
function drawCardShape(pos, size, color, angle = 0)
{
    ASSERT(_cardSprites, 'initCardAtlas() must be called before drawCardShape()');
    const s = (size || CARD_SIZE).scale(_CARD_BG_SCALE);
    drawTile(pos, s, _cardSprites.tint, color, angle);
}

// =============================================================================
// INTERNAL PAINTERS (each paints into a 250x250 tile of the cols=8 atlas)
// =============================================================================

function _paintRankTile(label)
{
    return ctx =>
    {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // "10" is the only two-char rank — shrink so it fits.
        const size = label.length > 1 ? 160 : 200;
        ctx.font = 'bold ' + size + 'px sans-serif';
        ctx.fillText(label, 125, 130);
    };
}

function _paintSuitTile(glyph)
{
    return ctx =>
    {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Force a text-style suit, not a color emoji rendering.
        ctx.font = '210px "Arial Unicode MS", "DejaVu Sans", sans-serif';
        ctx.fillText(glyph, 125, 135);
    };
}

// Silhouette painters all use _CARD_INSET / _CARD_SILH_PX so they share
// identical outer rounded rects — the bg, tint, and back tiles must match
// pixel-for-pixel so highlights and shadows align with the card edge.

function _paintCardBg(ctx)
{
    const r = 14;
    const o = _CARD_INSET, s = _CARD_SILH_PX;
    ctx.fillStyle = '#0a0a0a';
    _cardRoundedRect(ctx, o, o, s, s, r);
    ctx.fill();
    ctx.fillStyle = '#fff';
    _cardRoundedRect(ctx, o + 4, o + 4, s - 8, s - 8, r - 2);
    ctx.fill();
}

function _paintTintShape(ctx)
{
    // Matches the bg's OUTER rounded rect, but solid white with no border
    // so a tinted overlay doesn't drag the bg's dark edge along with it.
    const r = 14;
    const o = _CARD_INSET, s = _CARD_SILH_PX;
    ctx.fillStyle = '#fff';
    _cardRoundedRect(ctx, o, o, s, s, r);
    ctx.fill();
}

function _paintDefaultCardBack(ctx)
{
    // Classic-looking back: dark border, deep navy field, white diagonal
    // cross-hatch, thin inset frame. Override via initCardAtlas({paintBack}).
    const r = 14;
    const o = _CARD_INSET, s = _CARD_SILH_PX;
    ctx.fillStyle = '#0a0a0a';
    _cardRoundedRect(ctx, o, o, s, s, r);
    ctx.fill();
    ctx.fillStyle = '#1a3a8c';
    _cardRoundedRect(ctx, o + 4, o + 4, s - 8, s - 8, r - 2);
    ctx.fill();

    ctx.save();
    _cardRoundedRect(ctx, o + 4, o + 4, s - 8, s - 8, r - 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    const step = 16;
    ctx.beginPath();
    for (let i = -_CARD_TILE_PX; i < _CARD_TILE_PX * 2; i += step)
    {
        ctx.moveTo(i, 0);                ctx.lineTo(i + _CARD_TILE_PX, _CARD_TILE_PX);
        ctx.moveTo(i, _CARD_TILE_PX);    ctx.lineTo(i + _CARD_TILE_PX, 0);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    _cardRoundedRect(ctx, o + 20, o + 20, s - 40, s - 40, r - 6);
    ctx.stroke();
}

function _cardRoundedRect(ctx, x, y, w, h, r)
{
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
}

// Pip positions for number cards (v = 2..10). Each pip sits on a
// normalized (+/-1.x, +/-1.y) grid, then scales to fit between the
// corner glyphs of a 6x8.5 card. `scale` uniformly resizes spacing
// and pip size; `angle` rotates the layout around `center`.
function _drawPips(center, v, suitTile, color, angle, scale)
{
    const spreadX = _CARD_PIP_SPREAD_X * scale;
    const spreadY = _CARD_PIP_SPREAD_Y * scale;
    const pipSize = _CARD_PIP_SIZE.scale(scale);
    for (let i = 0; i < v; ++i)
    {
        let px = 0, py = 0;
        if (v === 2 || v === 4 || v === 5) py = i % 2 ? -1 : 1;
        if (v === 3) py = i - 1;
        if (v === 4 || v === 5)
        {
            px = i < 2 ? -1 : 1;
            if (v === 5 && i === 4) { px = 0; py = 0; }
        }
        if (v === 6 || v === 7 || v === 8)
        {
            px = i < 3 ? -1 : 1;
            py = (i % 3) - 1;
            if (i > 5)
            {
                px = 0;
                // v=8 places two center pips (i=6 below, i=7 above center).
                // v=7 has a single extra pip (i=6) — sit it ABOVE center
                // to match the traditional 7 layout.
                py = (v === 7) ? 0.5 : py + 0.5;
            }
        }
        if (v >= 9)
        {
            px = i < 4 ? -1 : 1;
            py = (i % 4) / 3 * 2 - 1;
            if (i > 7) { px = 0; py = v === 9 ? 0 : (i - 7 - 1.5) * 1.3; }
        }
        const offset = vec2(px * spreadX, py * spreadY).rotate(angle);
        drawTile(center.add(offset), pipSize, suitTile, color, angle);
    }
}
