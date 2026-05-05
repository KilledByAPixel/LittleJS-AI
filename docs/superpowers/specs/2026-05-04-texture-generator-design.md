# Texture Generator — Design

**Date:** 2026-05-04
**Status:** Approved (pending user review of this doc)

## Goal

A reusable helper, mirroring `templates/soundGenerator.js`, that lets prototypes (typically authored by Claude) build a sprite atlas from canvas 2D draw calls, save the atlas + a prompt blob for an AI image generator, and later swap the rough drawn atlas for an AI-generated high-resolution version that aligns 1:1.

## File

`templates/textureGenerator.js` — loaded via `<script src="textureGenerator.js">` from every template, the same way `soundGenerator.js` is loaded. Plain functions, no class — there is one global atlas.

## Fixed parameters

- Atlas: **2048×2048**, replaces `textureInfos[0]`.
- Cell stride: **512×512**.
- Padding: **6px** gutter on every side.
- Drawable tile size: **500×500** (inside the 512 cell).
- Grid: **4×4 = 16 tile slots**, indexed `0–15` left-to-right, top-to-bottom.
- Tile index → drawable top-left pixel: `tileX = (i % 4) * 512 + 6`, `tileY = (i >> 2) * 512 + 6`.

The padding/size split matches LittleJS's `TileInfo(pos, size, texture, padding)` semantics: cell stride = `size + 2*padding`. The 6px transparent gutters protect against bilinear bleed when sprites are scaled or rotated.

## Module state

- `atlasCanvas`, `atlasCtx` — the backing 2D canvas.
- `atlasDirty` — set when any tile is repainted; cleared on flush.
- `flushScheduled` — single-microtask debounce flag.
- `descriptions[16]` — string per tile (empty by default).

## API

### `initDrawToTexture()`

Creates the 2048×2048 canvas, replaces `textureInfos[0]` with a fresh `TextureInfo(atlasCanvas)` (after destroying the engine's default), resets `descriptions`, and sets engine tile defaults via `setTileDefaultSize(vec2(500))` and `setTileDefaultPadding(6)` so plain `tile(i)` calls Just Work. Call once at the top of `gameInit`.

### `drawToTexture(tileIndex, drawFn, description)`

Paints into the tile at `tileIndex`. Parameters:

- `tileIndex: 0–15` (asserted in range)
- `drawFn(ctx, tileIndex)` — the 2D context is **pre-translated** so `(0,0)` is the **drawable** top-left (the inner 500×500 area, *not* the 512 cell), and **clipped** to that 500×500 region. Author in pixels (`ctx.fillRect(0,0,500,500)` fills the tile). The 6px gutter outside this region stays transparent.
- `description: string` — short text saved into `descriptions[tileIndex]`, used in the AI prompt blob.

Internally: `clearRect` the **full 512×512 cell** (so re-drawing replaces cleanly) → `ctx.save()` → translate to the drawable top-left → set clip rect to `(0,0,500,500)` → call `drawFn` → `ctx.restore()`. Sets `atlasDirty = true` and schedules a microtask flush if not already scheduled.

Returns a `TileInfo(drawablePos, vec2(500), textureInfos[0], 6)` for use with `drawTile`.

### `saveAtlasImage(filename = 'atlas')`

Calls `saveCanvas(atlasCanvas, filename)` (LittleJS built-in). Downloads `<filename>.png`.

### `saveAtlasPrompt(filename = 'atlas-prompt')`

Builds a single text blob:

```
A 2048×2048 sprite atlas, 4×4 grid of 512px tiles, transparent background.
Tiles are numbered 0–15 left-to-right, top-to-bottom. Match each tile's
silhouette and palette to the rough drawing.

Tile 0: <descriptions[0]>
Tile 1: <descriptions[1]>
...
Tile 15: <descriptions[15]>
```

Empty descriptions are skipped. Saved via `saveDataURL('data:text/plain;charset=utf-8,' + encodeURIComponent(blob), filename + '.txt')`.

### `useAtlasImage(url)`

Loads the image at `url`. On load, **mutates the existing `textureInfos[0]` in place** — sets `.image`, `.size`, `.sizeInverse` from the new image, then calls `.createWebGLTexture()`. The `TextureInfo` reference is preserved, so all previously returned `TileInfo`s keep working unchanged.

The AI-generated image **must be 2048×2048** for tile coordinates to line up. (Tile size in the AI image is implicitly the same 512px because the atlas size is fixed.)

Use to point a finished prototype at the AI-generated atlas, e.g., `useAtlasImage('atlas-ai.png')`.

## Auto-refresh

`drawToTexture` does not re-upload to WebGL itself. It sets `atlasDirty` and, if `flushScheduled` is false, calls `queueMicrotask(flush)` and sets `flushScheduled = true`. `flush()` checks `atlasDirty`, calls `textureInfos[0].createWebGLTexture()` (which updates an existing texture in place), then clears both flags.

Result:

- 16 `drawToTexture` calls in `gameInit` collapse to **one** upload.
- A burst of runtime calls in the same frame also collapse to one upload.
- The user never calls a refresh function.

## Template integration

Rewrite `templates/textureGame.html` to use the new module — drop the inline `initAtlas` / `drawToAtlas` / per-painter pixel-size plumbing; replace with `initDrawToTexture()` + `drawToTexture(i, paintFn, '...')` calls. Keep the painter functions but change their signatures to `(ctx)` (or `(ctx, i)`), since the size is fixed at 512.

The other templates (`game.html`, `boardGame.html`, `box2dGame.html`, `uiGame.html`) gain the `<script src="textureGenerator.js">` tag for consistency, but pay no cost because nothing calls `initDrawToTexture` unless the prototype opts in.

## Out of scope (deferred)

- Multiple atlases / `textureId` parameter — single atlas only for v1.
- Multi-tile sprites (e.g., spanning 4 slots) — single 500×500 tiles only.
- Re-importing AI metadata — one-way export of the prompt blob is enough.
- A normalized 0–1 coordinate mode — pixels-only, since 500 is fixed.
- Per-tile AI image swap (`useTileImage(i, url)`) — full-atlas swap only for v1; single-tile swap is a likely v1.5 follow-up since one-shot AI generation rarely produces 16 perfect tiles in one go.

## Workflow summary

1. Prototype calls `initDrawToTexture()` in `gameInit`.
2. For each sprite, call `drawToTexture(i, paintFn, 'short description')`.
3. Game runs against the rough drawn atlas immediately.
4. To upgrade visuals: trigger `saveAtlasImage()` and `saveAtlasPrompt()` (typically wired to a debug key). Paste the prompt + reference PNG into an image generator. Save the result as `atlas-ai.png` next to the prototype HTML.
5. Add `useAtlasImage('atlas-ai.png')` after `initDrawToTexture()`. The same `TileInfo` objects now render the high-res art.
