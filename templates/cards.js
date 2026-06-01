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
const _CARD_CORNER_SUIT_OFFSET = vec2(2.05, .95);
const _CARD_CORNER_SUIT_SIZE   = vec2(1.4);
const _CARD_PIP_SIZE           = vec2(1.3);
const _CARD_PIP_SPREAD_X       = 1.2;
const _CARD_PIP_SPREAD_Y       = 1.7;

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

    // De-halo the white tiles (ranks, suits, tint mask) but keep the card
    // front (24) and back (26) — those have intentional dark/coloured art.
    whitenAtlasAlpha([24, 26]);
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
        ctx.fillText(label, 125, 130, 160);
    };
}

// --- Vector suit shapes ------------------------------------------------------
// Each draws one white suit centered in the 250x250 suit tile. drawCard tints
// them red (hearts/diamonds) or black (spades/clubs) per instance.

// Lobed body shared by heart (point down) and spade (point up). The bezier
// construction mirrors the engine's default-atlas heart icon.
function _suitLobed(ctx, cx, cy, rx, ry, pointDown)
{
    const sy = pointDown ? 1 : -1;
    const topCtrl = .92, dip = .35, shoulder = .46, tip = .9, w = 1;
    const p = (nx, ny) => [cx + nx * rx, cy + sy * ny * ry];
    ctx.beginPath();
    ctx.moveTo(...p(0, -dip));
    ctx.bezierCurveTo(...p(0, -topCtrl), ...p(-w, -topCtrl), ...p(-w, -shoulder));
    ctx.bezierCurveTo(...p(-w, 0), ...p(0, tip * .9), ...p(0, tip));
    ctx.bezierCurveTo(...p(0, tip * .9), ...p(w, 0), ...p(w, -shoulder));
    ctx.bezierCurveTo(...p(w, -topCtrl), ...p(0, -topCtrl), ...p(0, -dip));
    ctx.closePath();
    ctx.fill();
}

// Flared stem used by spade and club: narrow at the top, widening to the base.
function _suitStem(ctx, cx, topY, baseY, halfW)
{
    const h = baseY - topY;
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.bezierCurveTo(cx + halfW * .2, topY + h * .5, cx + halfW * .7, baseY - h * .15, cx + halfW, baseY);
    ctx.lineTo(cx - halfW, baseY);
    ctx.bezierCurveTo(cx - halfW * .7, baseY - h * .15, cx - halfW * .2, topY + h * .5, cx, topY);
    ctx.closePath();
    ctx.fill();
}

function _suitHeart(ctx)
{
    _suitLobed(ctx, 125, 122, 72, 110, true);
}

function _suitSpade(ctx)
{
    _suitLobed(ctx, 125, 100, 72, 86, false);
    _suitStem(ctx, 125, 138, 210, 44);
}

function _suitDiamond(ctx)
{
    const cx = 125, cy = 125, hw = 72, hh = 100;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fill();
}

function _suitClub(ctx)
{
    const cx = 125, cy = 115, R = 105, lobeR = 39;
    const lobe = (px, py, r=lobeR) => { ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * PI); ctx.fill(); };
    const w = .4;
    lobe(cx, cy - .48 * R);            // top lobe
    lobe(cx - w * R, cy + .16 * R);  // lower-left lobe
    lobe(cx + w * R, cy + .16 * R);  // lower-right lobe
    lobe(cx, cy, lobeR*.7); // cover center gap
    _suitStem(ctx, cx, cy + .14 * R, 210, 42);
}

// Map the four standard suit glyphs to vector drawers so the default deck uses
// crisp canvas shapes instead of font text (which renders inconsistently across
// platforms and may show as a color emoji). A custom suitGlyphs override that
// isn't one of these four falls back to text rendering.
const _CARD_SUIT_DRAWERS = { '♥': _suitHeart, '♠': _suitSpade, '♦': _suitDiamond, '♣': _suitClub };

function _paintSuitTile(glyph)
{
    const drawer = _CARD_SUIT_DRAWERS[glyph];
    return ctx =>
    {
        ctx.fillStyle = '#fff';
        if (drawer)
            return drawer(ctx);
        // Fallback for custom (non-standard) suit glyphs.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
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

// =============================================================================
// CARD GAME MODEL  (optional helpers shared by solitaire-style games)
//
// These build on the rendering API above to provide the parts every card
// game re-implements: an animated Card, a generic CardStack with a pluggable
// fan layout, a shuffled-deck builder, an empty-slot outline, a tween sweep,
// and an undo/redo history. Game-specific rules (legal moves, win/lose,
// per-stack layout, and what each `type` tag means) stay in the game.
//
//   const deck = shuffledDeck();                       // 52 shuffled Cards
//   const col  = new CardStack(pos, MY_TYPE, fanFn);   // fanFn(i, cards)->Vector2
//   col.putCardOnTop(deck.pop(), true);                // true = animate
//   updateCardTweens(allStacks);                       // once per frame
//   drawCardSlot(pos, isFoundation);                   // empty-slot outline
//   const history = new CardHistory({serialize, deserialize});
// =============================================================================

// A single card with built-in move-tween animation. `faceUp` is honored by
// games that hide cards (Klondike); games that don't simply never set it.
class Card
{
    constructor(value, suit, faceUp = false)
    {
        this.value  = value;
        this.suit   = suit;
        this.faceUp = faceUp;
        this.pos    = vec2();        // world center; set when placed in a stack
        this.tweenFrom     = null;   // null = no active tween
        this.tweenTimer    = new Timer();
        this.tweenDuration = 0.2;
    }
    startTween(fromPos)
    {
        this.tweenFrom = fromPos.copy();
        this.tweenTimer.set(this.tweenDuration);
    }
    // True only while actively interpolating; goes false the frame the timer
    // elapses (updateCardTweens clears tweenFrom shortly after).
    isTweening()
    {
        return this.tweenFrom !== null && this.tweenTimer.active();
    }
    // Pure getter — safe to call many times per frame (hover tint, drop
    // highlight, tween render) without disturbing the tween.
    drawnPos()
    {
        if (!this.tweenFrom) return this.pos;
        if (this.tweenTimer.elapsed()) return this.pos;
        return this.tweenFrom.lerp(this.pos, smoothStep(this.tweenTimer.getPercent()));
    }
}

// A pile of cards anchored at a world position. `type` is an opaque tag the
// game assigns (its own StackType). `offsetFn(index, cards) -> Vector2` gives
// each card's offset from the anchor; omit it for piles that stack every card
// on the anchor (stock, waste, foundations).
class CardStack
{
    constructor(anchorPos, type = 0, offsetFn = null)
    {
        this.pos      = anchorPos.copy();
        this.type     = type;
        this.cards    = [];
        this.offsetFn = offsetFn;
    }
    topCard()    { return this.cards.length ? this.cards[this.cards.length - 1] : null; }
    bottomCard() { return this.cards.length ? this.cards[0] : null; }
    isEmpty()    { return !this.cards.length; }

    cardOffset(index)
    {
        return this.offsetFn ? this.offsetFn(index, this.cards) : vec2();
    }
    relayout()
    {
        for (let i = 0; i < this.cards.length; ++i)
            this.cards[i].pos = this.pos.add(this.cardOffset(i));
    }
    putCardOnTop(card, tween = false)
    {
        const oldPos = card.pos.copy();
        this.cards.push(card);
        card.pos = this.pos.add(this.cardOffset(this.cards.length - 1));
        if (tween) card.startTween(oldPos);
    }
    moveTopCard(target, tween = false)
    {
        if (this.isEmpty()) return;
        target.putCardOnTop(this.cards.pop(), tween);
    }
    moveManyToStack(target, startCard, tween = false)
    {
        const startIndex = startCard ? this.cards.indexOf(startCard) : 0;
        if (startIndex < 0) return;
        const moving = this.cards.splice(startIndex);
        for (const c of moving) target.putCardOnTop(c, tween);
    }
}

// Hit-test: returns { stack, card } for the topmost card under `worldPoint`,
// { stack, card:null } for an empty stack there, or null. Cards are searched
// last-first (the visually topmost card is last in its stack); piles work too
// since all their cards share the anchor, so the top is found first.
function cardAtPoint(stacks, worldPoint)
{
    for (const s of stacks)
        for (let i = s.cards.length - 1; i >= 0; --i)
            if (isOverlapping(worldPoint, CARD_SIZE, s.cards[i].pos))
                return { stack: s, card: s.cards[i] };
    for (const s of stacks)
        if (s.isEmpty() && isOverlapping(worldPoint, CARD_SIZE, s.pos))
            return { stack: s, card: null };
    return null;
}

// Should `stack`'s empty-slot outline be drawn this frame? Pile stacks (no fan
// offset — stock, waste, foundations) always show it beneath their cards. A
// fanning stack shows it while empty, and keeps showing it until its base card
// finishes tweening in, so the outline doesn't blink out from under a card
// still flying toward it.
function cardSlotVisible(stack)
{
    if (!stack.offsetFn) return true;
    return stack.isEmpty() || stack.cards[0].isTweening();
}

// Returns a fresh, shuffled 52-card deck (Fisher-Yates with LittleJS rand).
function shuffledDeck()
{
    const deck = [];
    for (let suit = 0; suit < 4; ++suit)
        for (let value = 0; value < 13; ++value)
            deck.push(new Card(value, suit));
    for (let i = deck.length - 1; i > 0; --i)
    {
        const j = randInt(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Draws a faint empty-slot outline at `pos`. Pass `foundation = true` for the
// home/foundation look: a warm gold frame plus a faint four-suit marker, so it
// reads clearly differently from the neutral free-cell / tableau slot (which
// is a plain white-outlined dark slot).
function drawCardSlot(pos, foundation = false)
{
    // 4-rect outline (drawRect has no stroke param). `t` = line thickness.
    const outline = (stroke, t) =>
    {
        drawRect(vec2(pos.x, pos.y + CARD_SIZE.y/2), vec2(CARD_SIZE.x, t), stroke);
        drawRect(vec2(pos.x, pos.y - CARD_SIZE.y/2), vec2(CARD_SIZE.x, t), stroke);
        drawRect(vec2(pos.x - CARD_SIZE.x/2, pos.y), vec2(t, CARD_SIZE.y), stroke);
        drawRect(vec2(pos.x + CARD_SIZE.x/2, pos.y), vec2(t, CARD_SIZE.y), stroke);
    };

    if (foundation)
    {
        // Gold frame + faint warm fill — a distinct hue from the free cells,
        // not just a brightness tweak.
        drawRect(pos, CARD_SIZE, new Color(0.85, 0.65, 0.15, 0.16));
        outline(new Color(1.0, 0.82, 0.30, 0.80), 0.18);

        // Faint 2×2 cluster of the four suit pips — the classic "build all
        // four suits here" marker. Needs the atlas; skip if not built yet.
        if (_cardSprites)
        {
            const pipColor = new Color(1, 0.95, 0.8, 0.10);
            const dx = CARD_SIZE.x * 0.22, dy = CARD_SIZE.y * 0.22;
            const ps = vec2(2.1);
            drawTile(pos.add(vec2(-dx,  dy)), ps, _cardSprites.suits[0], pipColor);
            drawTile(pos.add(vec2( dx,  dy)), ps, _cardSprites.suits[1], pipColor);
            drawTile(pos.add(vec2(-dx, -dy)), ps, _cardSprites.suits[2], pipColor);
            drawTile(pos.add(vec2( dx, -dy)), ps, _cardSprites.suits[3], pipColor);
        }
        return;
    }

    // Neutral slot (free cells, tableau): dark fill, plain white outline.
    drawRect(pos, CARD_SIZE, new Color(0, 0, 0, 0.30));
    outline(new Color(1, 1, 1, 0.30), 0.12);
}

// Clears finished tweens. Call once per frame (e.g. gameUpdatePost) with the
// stacks that hold cards. Done as a deferred sweep so hover/highlight reads of
// drawnPos() during the frame don't cancel a tween early.
function updateCardTweens(stacks)
{
    for (const s of stacks)
        for (const c of s.cards)
            if (c.tweenFrom && c.tweenTimer.elapsed())
                c.tweenFrom = null;
}

// Undo/redo + autosave for a card game. The game supplies `serialize()`
// (current state -> plain object) and `deserialize(snap)` (apply a snapshot).
// Snapshots persist through menus.js saveData under `saveKey` when that helper
// is present, so a reload can restore the latest position.
class CardHistory
{
    constructor({ serialize, deserialize, saveKey = 'saveState', cap = 500 })
    {
        this.serialize   = serialize;
        this.deserialize = deserialize;
        this.saveKey     = saveKey;
        this.cap         = cap;
        this.undo = [];
        this.redo = [];
    }
    // Clear history and seed it with the current state (call from newGame).
    reset()
    {
        this.undo = [];
        this.redo = [];
        this.save();
    }
    // Push the current state as a new undo point and persist it.
    save()
    {
        this.undo.push(this.serialize());
        if (this.undo.length > this.cap) this.undo.shift();   // cap memory
        this.redo = [];
        const snap = this.undo[this.undo.length - 1];
        if (typeof saveData === 'function')
            try { saveData({ [this.saveKey]: snap }); } catch (e) { /* non-fatal */ }
    }
    undoMove()
    {
        if (this.undo.length <= 1) return;   // keep the initial snapshot
        this.redo.push(this.undo.pop());
        this.deserialize(this.undo[this.undo.length - 1]);
    }
    redoMove()
    {
        if (!this.redo.length) return;
        const snap = this.redo.pop();
        this.undo.push(snap);
        this.deserialize(snap);
    }
}
