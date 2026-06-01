---
name: atlas-shape-art
description: Use when a LittleJS game's visuals are geometric/abstract/neon shapes or it has many round entities (orbs, gems, bubbles, asteroids, particles, stars), OR when speeding up a game that calls many drawCircle/drawEllipse/drawPoly/drawRegularPoly per frame. Renders shapes as tinted atlas tiles instead.
---

# atlas-shape-art

For shape-based LittleJS games, bake the 16 built-in white icons ONCE with `initDefaultAtlas()` and draw every entity as a per-instance **tinted `drawTile`** — instead of `drawCircle`/`drawEllipse`/`drawPoly`. The shapes already exist in `templates/textureGenerator.js`; you do not hand-roll a canvas or a star-point array.

**Core win:** one shared atlas → every sprite is a single quad in one unbroken WebGL batch, recolorable to any hue for free, zero external assets.

## When to use

- New game whose look is geometric/abstract/neon/puzzle/arcade, or has lots of round/polygon entities (orbs, gems, bubbles, asteroids, stars, particles-as-entities).
- **Retrofit:** an existing game calling many `drawCircle`/`drawEllipse`/`drawPoly`/`drawRegularPoly` per frame and the rendering is a hot spot.

**Not for:** representational art (a specific character, a detailed prop) — that's a custom sprite, use the `iterate-sprite` skill. A handful of shapes drawn once is fine as-is; this is for *many* instances or a shape-driven art style.

## Why it's faster (don't skip — agents get this wrong)

`drawCircle` → `drawEllipse` → `drawRegularPoly` tessellates a **32-sided polygon** (`glCircleSides = 32`) and pushes ~32 verts per call through the untextured-poly path. `drawPoly` / `drawRegularPoly` are the same path. A tinted `drawTile` is **one quad (2 triangles)** and all atlas `drawTile` calls collapse into a single batched draw.

Common misconception: *"drawCircle batches in WebGL too, 300 is trivial."* It batches, but at ~16× the vertices of a quad **and** on a separate path from your textured sprites, breaking the uniform batch. `drawRect` is the exception — it is already `drawTile(pos, size, undefined, color)`, a single quad, so rects are NOT the bottleneck. The win is round/polygon shapes and keeping everything in one texture batch.

## The 16 shapes (tiles 0–15)

`circle` `glow` `ring` `roundSquare` · `triangle` `diamond` `pentagon` `hexagon` · `heart` `droplet` `plus` `arrow` · `spark` `star` `burst` `bolt`

All are pure white, so `drawTile`'s color arg multiplies to any hue. `glow` and `spark` are radial-gradient sprites — ideal for additive glow/FX.

## Quick start

1. Wire `templates/textureGenerator.js` — a `<script>` tag in `index.html` (after the engine, before `game.js`) AND a `sources` entry in `build.json`. From `games/<name>/` the path is `../../templates/textureGenerator.js`.

2. Bake the atlas once in `gameInit` and keep the returned name→TileInfo map:

```javascript
let icons;
function gameInit()
{
    saveDataInit('MyGame');     // if you persist anything (CLAUDE.md rule)
    icons = initDefaultAtlas(); // 16 white icons into tiles 0-15, halo already fixed
}
```

3. Draw each entity as a tinted tile. Size is the full **diameter** (a circle of diameter 1 → `vec2(1)`):

```javascript
function gameRender()
{
    for (const e of entities)
        drawTile(e.pos, vec2(e.size), icons[e.kind], e.color); // e.kind: 'circle','star',...
}
```

## Tinting & glow

White icon × `color` = that color, no per-instance canvas state. For additive glow, pass `additiveColor` with **alpha 0** (repo rule — non-zero alpha thickens the silhouette). Note the arg order — `angle` and `mirror` come first:

```javascript
drawTile(e.pos, vec2(e.size), icons.glow, e.color, 0, false, new Color(1,1,1,0));
```

## Retrofit mapping

| Old call | New call |
|----------|----------|
| `drawCircle(p, d, c)` | `drawTile(p, vec2(d), icons.circle, c)` |
| `drawEllipse(p, size, c)` | `drawTile(p, size, icons.circle, c)` |
| `drawRegularPoly(p, vec2(d), 5, c)` | `drawTile(p, vec2(d), icons.pentagon, c)` |
| hand-rolled star `drawPoly` | `drawTile(p, vec2(d), icons.star, c)` |
| `drawRect` | leave it (already a quad) — or `icons.roundSquare` to keep it in the same batch |

`drawCircle`/`drawEllipse` size is a diameter, and `drawTile` size is the full quad size, so pass the same number — the look stays identical.

## Common mistakes

- **Reinventing the atlas** — hand-rolling a canvas + `textureInfos.push` + `tile()`. Don't. `initDefaultAtlas()` returns ready TileInfos for all 16 shapes.
- **Re-fighting the halo** — `initDefaultAtlas()` already calls `whitenAtlasAlpha()`; don't add your own de-halo pass.
- **Per-color or per-shape textures** — defeats the point. ONE atlas, tint per instance.
- **`useWebGL=false` or passing a 2D `context`** — drops you onto canvas2D and off the GPU batch. Omit those args.
- **Treating size as a radius** — it's the full diameter/quad size.
- **Custom sprites too?** Call `initDrawToTexture(8)` first, then `initDefaultAtlas()` reuses it and leaves tiles 16+ free for your own `drawToTexture` art.
- Standard repo rules still apply: global API (no `LJS.` prefix), no ES imports, 4-space indent.
