---
name: littlejs-conventions
description: LittleJS game engine (littlejsengine) conventions — REQUIRED before answering, writing, editing, reviewing, or debugging ANY LittleJS code, including one-line questions about a snippet. TRIGGER whenever "LittleJS" appears, or the code uses engineInit/EngineObject/drawTile/drawRect/drawCircle/drawEllipse/drawText/drawTextScreen/vec2/tile()/tileInfo/keyDirection/mousePos/cameraPos/ParticleEmitter/TileCollisionLayer/angleVelocity/zzfx, or a littlejs.js script tag is present. Do NOT answer from memory or from general game-engine priors — LittleJS contradicts them and the mistakes are silent — drawCircle/drawEllipse size is the DIAMETER not the radius, spin is angleVelocity (angularVelocity is a no-op), lerp takes percent LAST, ParticleEmitter speed is per-FRAME, Y is up-positive, update() needs no super.update(), top-level consts collide with engine globals. Read it first even for a tiny change.
---

# LittleJS engine conventions

Rules for the LittleJS engine's **global API** style: call `engineInit`, `vec2`, `drawTile`, etc. directly — no `LJS.` prefix, no ES-module imports (unless the project already uses the ESM build).

## Startup and structure

- `engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources)` starts the engine — define all five callbacks even if some are empty. `gameInit` may be `async`; the engine awaits it (put `await box2dInit()` or a three.js `await import(...)` at the top).
- Model entities as classes extending `EngineObject` — the engine updates, moves, collides, and renders them automatically every frame:

```javascript
class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1), tile(0), 0, CYAN); // pos, size, tileInfo, angle, color
    }
    update()
    {
        this.velocity = keyDirection().scale(.2); // arrows/WASD move the player
        // engine applies physics (velocity, gravity, collision) after update()
        // no super.update() call is needed
    }
}
```

Spawn once in `gameInit` with `new Player(vec2(0))`; it draws itself — no manual draw call. Customize visuals via `this.tileInfo` / `this.color` / `this.angle`, or override `render()`.
- Persisted settings/stats: use `readSaveData`/`writeSaveData` (localStorage-backed, JSON-serialized) — don't hand-roll localStorage. **Save data is always an object.** `readSaveData` returns `{...yourDefault, ...whatWasStored}`, so a scalar default spreads to nothing: `readSaveData('best', 0)` yields `{}`, not `0`, and the next arithmetic on it is `NaN` with no error. Always pass and read an object — `readSaveData('save', {best:0}).best` — and write the whole object back with `writeSaveData('save', {best:score})`.
- **three.js 3D** (the engine's built-in `ThreeJSPlugin` / `ThreeJSObject`): three.js itself is not bundled. Declare `let THREE;` at top level and `THREE = await import(...)` at the top of an async `gameInit`, then `new ThreeJSPlugin(THREE)` — construct no `THREE.*` object before that import resolves (no top-level `new THREE.Vector3(...)`). Never declare `let threeJS` in game code: the engine owns that global and the plugin constructor assigns it, so redeclaring it throws. Call `setGLEnable(false)` so the LittleJS canvas draws only Canvas2D content (HUD text, particles) over the 3D scene.

## Never shadow engine globals

Engine globals share top-level scope with game scripts. A top-level `let`/`const` named after one throws `already declared` at load: `gravity`, `time`, `frame`, `paused`, `mousePos`, `cameraPos`, `cameraScale`, math shortcuts (`sin`, `cos`, `min`, `max`, `lerp`, `clamp`, `percent`, `rand`, `randInt`, `PI`), and color constants (`RED`, `GREEN`, `BLUE`, `CYAN`, `YELLOW`, `WHITE`, `BLACK`, ...). Prefix your own globals (`playerGravity`, `gameTime`); names like `score` and `level` are fine. When unsure, grep the engine file for `let <name>`.

## Use the engine's built-ins — don't reinvent

- `keyDirection()` for ALL arrow/WASD directional input (returns a vec2) — never write manual arrow-key OR chains. WASD is already included (`inputWASDEmulateDirection` defaults to true), so don't wire it by hand. `keyIsDown()` is for non-directional actions (jump, interact).
- `gamepadStick(0)` for analog movement/aim; `mousePos` (world-space), `mouseWasPressed(0)` / `mouseIsDown(0)` for the mouse.
- `isOverlapping(posA, sizeA, posB, sizeB)` for AABB hit tests; `isOnScreen()` for culling; `screenToWorld()` / `worldToScreen()` for coordinate conversion; `Timer` for timed events.
- Math: `clamp`, `lerp`, `percent`, `rand`, `randInt`, and `Vector2` methods (`add`, `scale`, `distance`, `normalize`, `rotate`, ...) — don't rewrite them.
- Sound: `Sound` / `zzfx()` (ZzFX) — never write custom WebAudio code.
- FX: `ParticleEmitter` for explosions/trails/sparkles.
- Tile-based collision: `TileCollisionLayer` and the engine's tile-collision flow; put tile reactions in `collideWithTile(tileData, pos)`. Don't build a custom tile-collision engine.
- Prefer world-space drawing (`drawTile`, `drawRect`, `drawText`, ...); most draw functions take a `screenSpace` parameter if needed.

## Pitfalls (each of these causes silent bugs)

- `drawCircle` / `drawEllipse` size is the **diameter**, not the radius.
- `lerp(valueA, valueB, percent)` — percent comes **last**, not first.
- `ParticleEmitter` speed values are **per frame**, not per second (typical range 0.1–0.5, not 10+).
- Angles: **clockwise is positive** in LittleJS (Box2D is the opposite — counterclockwise positive).
- Y-axis is **up-positive** in world space: falling gravity is negative Y.
- `drawText` is world-space (size ~3 is normal); `drawTextScreen` is pixel/screen-space (size ~80 is normal). Don't mix them up.
- Spin uses `angleVelocity` / `angleDamping` — the standard-sounding `angularVelocity` is a silent no-op.
- Bounciness is `restitution` (0 to 1). Older LittleJS called it `elasticity`; that property no longer exists and setting it does nothing.
- To handle a collision yourself, return `false` from `collideWithObject(other)` — that skips the engine's position/velocity resolution for the pair (how a paddle steers a ball). Returning `true`, the default, lets the engine resolve it.
- The canvas can be any aspect ratio. To keep a fixed playfield fully visible, set the scale each frame in `gameUpdatePost`: `setCameraScale(min(mainCanvasSize.x / viewW, mainCanvasSize.y / viewH))`.
- For additive glow, the `additiveColor` argument needs **alpha 0** (e.g. `new Color(1,1,0,0)`); non-zero alpha thickens the silhouette.
- `readSaveData(key, default)` merges with object spread, so the default must be an OBJECT. A scalar default returns `{}` and turns into `NaN` downstream, silently. (Engine 1.18.25+ asserts on a scalar default in debug builds; release builds still fail quietly, so pass an object regardless.)
- Time-driven logic is testable: `setHeadlessMode(true)` plus `setEngineManualStep(true)` before `engineInit` stop the engine self-driving, and `engineStep(frames)` then advances exactly that many fixed updates. Use it instead of guessing whether a `Timer` or spawn interval fired.
- Keep `\n` as a two-character escape inside string literals; don't convert to real line breaks.
- A typical view is roughly 35x20 world units at the default camera scale. If you need a specific framing, set it explicitly with `setCameraScale` rather than guessing entity sizes against an unknown viewport.
- Don't redefine the engine's math shortcuts or color constants (see the shadowing list above).
