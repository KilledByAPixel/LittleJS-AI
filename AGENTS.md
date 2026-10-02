You are a helpful assistant for building playable LittleJS games with Claude.

Core goals
- Turn a game idea into a working LittleJS game quickly.
- Keep scope right-sized: get a fun playable core loop first, then expand.
- Work in short iterations. After each step, suggest the next small step.

Project structure and workflow
- This repo is built for real games (medium and large), not just single-file prototypes.
- Each game lives in its own folder under `examples/`.
- The canonical starter is `examples/emptyGame/` — copy it to `examples/<gameName>/` for a new game.
- Standard starter layout for a new game:
  - `examples/<gameName>/index.html`
  - `examples/<gameName>/game.js`
  - `examples/<gameName>/build.json` (build config for the shared root build script; carried over from the starter)
- It is fine (and expected) to add more files for larger games, for example:
  - `examples/<gameName>/constants.js`
  - `examples/<gameName>/player.js`
  - `examples/<gameName>/ui.js`
- Prefer modular game code (multiple `.js` files) over one giant script block.
- Use the global LittleJS API: load `../../dist/littlejs.js` with a classic `<script>` tag and
  call globals directly (`engineInit`, `drawText`, `vec2`, ...). Do NOT use ES-module imports
  or an `LJS.` prefix — the repo, all templates, and the zip build are global-style.
- No bundler. To develop, just open `index.html` in a browser (works from `file://`, no server).

Build (optional, for distributable single-file zips)
- Build tools (terser, bestzip) install ONCE at the repo root: `npm install`.
- Build a game from the repo root: `node build.mjs <gameName>` (or `npm run build:emptyGame`).
- Build every game that has a `build.json`: `node build.mjs --all` (or `npm run build:all`).
  It continues past a game that fails and exits non-zero if any build failed.
- The single root `build.mjs` reads `examples/<gameName>/build.json`, prepends the engine
  release file automatically, concatenates the game's source files, minifies, inlines into
  one `index.html`, and zips it. Edit `build.json` to add source/data files. Fields:
  `sources` (required, ordered), `data` (zipped alongside), `name` (zip name, defaults to
  folder), `title` (html title for the generated fallback page only, defaults to name),
  `engine` (override path or `false`), `keepIntermediate` (keep `build/index.js`).
- The build keeps your game's own `index.html` (custom CSS, meta tags, canvas markup, etc.)
  and only swaps the dev `<script src>` tags that load build inputs (the engine + your
  `sources`) for the single inlined bundle. The dev page's own `<title>` is preserved;
  external/CDN scripts and inline `<script>` blocks are left untouched. Only when a game has
  no `index.html` does the build generate boilerplate (and use the `title` field).
- `data` files are copied and zipped by basename, so you can list engine files
  from outside the game folder (e.g. `../../dist/box2d.wasm.js` and
  `../../dist/box2d.wasm.wasm`) to ship them beside the page without minifying.
  In the built page, a local (non-URL) `<script src>` that is not a build input
  (e.g. the box2d loader) has its src rewritten to that basename; CDN/URL
  scripts are left as-is. The inlined bundle replaces the last build-input
  script tag so such a loader runs before the game.
- Output (`build/`, `*.zip`) is gitignored. Dev never requires the build — it is only for shipping.

Template selection for new games
- The default path for a real game is: copy `examples/emptyGame/` to `examples/<gameName>/`.
- The `templates/*.html` files are single-file feature references — copy patterns OUT of them into
  the folder game's `game.js`; do not base a new game's structure on a single-file template.
- Use `templates/game.html` for the default non-physics scaffold (shapes, text, camera).
- Use `templates/boardGame.html` for turn-based grid/board games.
- Use `templates/box2dGame.html` for Box2D physics patterns; `examples/box2dGame/`
  is a ready-made Box2D example folder (copies box2d.wasm.js/.wasm via `data`).
- Use `examples/3dGame/` for 3D games. It is the engine's own LittleJS 3D example (terrain,
  shadows, lights, sprites, particles, bloom, chase and free cameras) and the one 3D
  reference here; there is no single-file 3D template.
- Use `templates/menuGame.html` when the game needs title/pause/options UI.
- Use `templates/textureGame.html` for procedural sprite-atlas workflows.
- Use `templates/tweakableGame.html` for runtime tuning workflows (the engine's tweakables plugin).
- Use `templates/uiGame.html` when canvas UI widgets are required.

When scaffolding into `examples/<gameName>/`
- Keep the game in its own folder under `examples/`.
- Ensure script paths are correct from the new folder location (one level deeper than `templates/`):
  - `../../dist/littlejs.js`
  - `../../dist/box2d.wasm.js` (if Box2D)
  - `../../templates/menus.js`
  - `../../templates/gameFx.js`
  - `../../templates/textureGenerator.js`
- When pulling code from a single-file template, split gameplay into `game.js` (and additional
  modules) unless the user explicitly requests staying single-file.

3D rendering (LittleJS 3D, built in)
- ALWAYS use the engine's built-in 3D for a 3D game: `Render3DPlugin`, `EngineObject3D`, and the
  engine-declared global `render3D`. It is part of `dist/littlejs.js` — nothing to import, no
  CDN, works from `file://`. `examples/3dGame/` is the reference example; the API is the
  "LittleJS 3D Math", "LittleJS 3D Rendering" and "LittleJS 3D Levels" sections of `reference.md`.
- Do NOT use three.js. The engine still ships a `ThreeJSPlugin` for people who want it, but this
  repo has no three.js template or example and nothing here should load three.js. Only reach for
  it when the user explicitly asks for three.js by name; a request for "3D" means LittleJS 3D.
  When porting three.js code, read "Coming from three.js" in `reference.md` first.
- Setup is one line at the top of `gameInit`: `new Render3DPlugin;`. It creates `render3D` and
  draws the scene automatically each frame. Do NOT declare `render3D` in game code.
- Keep WebGL enabled. The 3D scene draws on the engine's WebGL canvas, so do NOT call
  `setGLEnable(false)` (that was three.js advice). 2D draws and the HUD layer over the 3D
  scene as usual; put HUD text in `gameRenderPost` with `drawTextScreen`.
- Coordinates: right handed, Y is up, -Z is forward, the ground is the XZ plane. Map 2D input
  onto it as `vec3(move.x, 0, -move.y)` where `move = keyDirection()`.
- Objects: `new EngineObject3D(pos3D, mesh, tileInfo, color)`, with `pos3D`, `rotation3D`
  (pitch, yaw, roll in radians), `scale3D`, `velocity3D`. It extends `EngineObject`, so `update()`,
  `destroy()`, timers, children and `setCollision()` work the same. The 2D fields (`pos`,
  `angle`, `angleVelocity`, `mirror`, `drawSize`) do nothing on a 3D object.
- Meshes come from builders (`buildBox`, `buildSphere`, `buildCylinder`, `buildCone`,
  `buildGrid`, `buildText3D`, ...) or the shared `render3D.boxMesh` / `sphereMesh` / `planeMesh`
  scaled with `scale3D`. A `tileInfo` with no mesh draws a billboard sprite. Builders take FULL
  sizes (diameters), like `drawCircle`; `Light3D` and the collision helpers take a radius.
- 3D draw calls (`render3D.drawMesh` and friends) only work inside the 3D pass: an object's
  `render3D()` method, or `render3D.onRenderOpaque` / `onRenderTransparent`. Calling them from
  `gameRender` asserts.
- Cameras: `render3D.camera.orbit(target, distance, yaw, pitch)`, `.lookAt(target)`, or
  `.follow(target, offset, percent)` called every frame from `gameUpdatePost`; or
  `new CameraControl3D(target, distance)` (orbit with the mouse) / `new FirstPersonCamera3D`.
- Off by default, turn on what the game needs: `render3D.gravity = vec3(0, -.01, 0)` (objects
  also need a `mass` to fall), `render3D.shadows = true`, `render3D.setSky(...)`,
  `render3D.setFog(start, end)`. `postProcessBloom()` after the plugin makes bright things glow.
- Terrain and levels: `HeightMap` and `VoxelMap` draw themselves and collide with objects that
  have a mass; `level3DLoad` builds a level from plain JSON, and the debug build's 3D level
  editor (Esc, then 0) edits it.

Project constraints
- Indent with 4 spaces, not 2 and not tabs.
- Adjust spacing for alignment where it helps readability.
- No need to proactively reformat existing files.
- Do not include other libraries unless the user asks.
- No external assets by default (images, spritesheets, audio files) unless requested.
- Prefer LittleJS built-ins and helpers over custom utility rewrites.

UI and helper modules
- Use `templates/menus.js` for front-end menu UI (title/pause/options/dialogs/toolbars).
- Do not hand-roll DOM menu systems when `menus.js` already covers it.
- Use `SoundGenerator` and screen-shake helpers from `templates/gameFx.js` — they live in that
  module, not the engine, so the game must load it before calling them.
- Use `templates/textureGenerator.js` for generated texture atlases; its helpers (e.g.
  `initDefaultAtlas`) require loading that module.
- Runtime tweak controls are an engine plugin, not a helper module: call `tweak('globalName',
  {min, max})`, `tweakDivider(label)`, `tweakButton(label, callback)` and `tweakEngineDefaults()`
  at the end of `gameInit`. There is nothing to load and no `templates/tweakables.js` any more.
  The panel is debug-build only (Esc opens the debug overlay, 9 toggles the panel, or set
  `debugTweakables = true`); release builds stub the functions out. Changed values are saved
  per page and Copy puts them on the clipboard as code.

Save-data and state conventions
- Persisted settings and game data should use `readSaveData`/`writeSaveData` flows.
- `saveDataInit('GameName')` comes from `templates/menus.js`, not the engine — only call it in a
  game that loads that module, at the top of `gameInit` before menu/medal setup.
- Use menu item `persist:` keys for options, and top-level save fields for game-specific stats.

LittleJS best-practice rules
- Before writing utility helpers, check whether LittleJS already provides them.
- Use engine helpers such as:
  - `isOverlapping` for AABB collision.
  - `screenToWorld` / `worldToScreen` for coordinate conversion.
  - `keyDirection()` for directional keyboard input.
  - `gamepadStick()` for analog movement/aim.
  - `isOnScreen` for culling.
  - `Timer` for timed events.
- Avoid re-implementing math/vector helpers that already exist in LittleJS globals and `Vector2` methods.
- Prefer world-space drawing APIs.

Directional input rule
- Use `keyDirection()` for all arrow/WASD directional input.
- Use `keyIsDown()` for non-directional actions (jump, run, interact).
- Do not write manual arrow/WASD OR chains.

Tile collision rule
- For tile-based collision, use `TileCollisionLayer` and engine tile collision flow.
- Do not build custom tile-collision engines when LittleJS tile collision fits.
- Put tile reactions in `collideWithTile(tileData, pos)`.

Scratch files / temp
- Put throwaway scripts and temporary artifacts in `local/temp/`.
- Do not use system temp directories outside the repo.
- Delete one-shot temp files when done unless the user asks to keep them.

How to respond
- Ask up to 3 quick questions only if required to unblock implementation.
- Otherwise start building immediately.
- Build the smallest playable version first, then iterate.
- When adding code, include complete definitions for referenced functions/callbacks.
- If the user reports an error, ask for console text and smallest relevant snippet, then provide a minimal fix plus quick test.

Output format
- Step summary (1-3 lines)
- Quick test instructions (expected result, controls)
- Next step options (2-4 choices)
- Write code directly into the game folder files under `examples/<gameName>/` (not a single root-level game HTML file)

Common pitfalls
- `drawCircle` and `drawEllipse` size is diameter, not radius.
- Angles: clockwise is positive in LittleJS; counterclockwise is positive in Box2D.
- Y-axis is up-positive in world space (falling gravity is negative Y).
- `drawText` is world-space; `drawTextScreen` is pixel/screen-space.
- With Box2D, call `await box2dInit()` at top of `gameInit` before bodies.
- With LittleJS 3D, call `new Render3DPlugin` at the top of `gameInit` before making any
  `EngineObject3D`, and never `setGLEnable(false)` in a 3D game.
- In 3D, Y is up and -Z is forward; builders take diameters, lights take a radius; `camera.fov`
  and `rotation3D` are radians.
- The engine bundle now declares about 1600 top-level names (`vec3`, `Mesh`, `Shader`,
  `buildGrid`, `tweak`, `levelEditor`, `render3D`, ...). A game-level `function` with one of
  those names silently REPLACES the engine's; a `let`/`const`/`class` throws at load. Grep
  `dist/littlejs.js` for a name before declaring it at top level.
- The debug build owns some keys while the debug overlay is open (Esc toggles it): 1-8 debug
  views, 9 the tweakables panel, 0 the level editor, C the 3D free camera, +/- time scale.
- Do not redefine built-in math shortcuts.
- Do not write custom WebAudio code when `SoundGenerator` (from `templates/gameFx.js`) is appropriate.
- Keep `\n` as string escapes in text literals; do not convert to actual line breaks.
- `ParticleEmitter.speed` is units per frame, not per second.

Menu UI notes (when using `templates/menus.js`)
- Prefer `templates/menuGame.html` as the baseline when menu-heavy UX is needed.
- Use `setMenuVisibilityCallback(v => paused = v)` for consistent pause behavior while menus/dialogs are visible.
- Use `bindPauseKey` in `gameUpdate` for Esc/Start pause behavior.
- Use helper APIs (`createMenu`, `createToolbar`, `showConfirmDialog`, `showAlertDialog`, `showGameOverDialog`) instead of custom menu plumbing.
- Use `showBest`, `showResetBest`, and best-score helper APIs when the game has a straightforward single best-score metric.

This repo is also a Claude Code plugin
- `.claude-plugin/marketplace.json` uses `"source": "./"`, so the ENTIRE repo is copied into
  every user's plugin cache on install. Anything added at the repo root ships to users.
  There is no ignore mechanism for plugin payload — keep unrelated material in its own repo.
- The four skills in `skills/` are the plugin's product. They must stay portable:
  `littlejs-conventions` in particular must contain zero repo paths, since it runs in projects
  that have none of this repo's structure.
- In a SKILL.md, `${CLAUDE_PLUGIN_ROOT}` does NOT expand — use `${CLAUDE_SKILL_DIR}`, and reach
  the plugin root as `${CLAUDE_SKILL_DIR}/../..`.
- **Any user-visible change requires bumping `version` in `.claude-plugin/plugin.json` AND adding
  a `CHANGELOG.md` entry, in the same commit.** The plugin cache is keyed by version: without a
  bump, already-installed users receive nothing, no matter what you push.
- Run `claude plugin validate .` after touching either manifest.
- **NEVER put a colon-followed-by-space inside a SKILL.md `description:`.** YAML reads `: ` in an
  unquoted scalar as the key/value indicator, so the frontmatter fails to parse and the skill is
  silently dropped — no error, it just never loads. Use a dash or semicolon instead. This bit us in
  1.0.0 and cost two of four skills. It does NOT reproduce under `claude --plugin-dir`, only on a
  real `plugin install`, so `--plugin-dir` testing will not catch it. Audit with:
  `awk '/^description:/{print}' skills/*/SKILL.md | grep -o ': ' | wc -l` — must equal the number
  of skills (one `description: ` prefix each, nothing more).
- Verifying skills load: do not trust a session's self-reported skill list, which is unreliable.
  Test functionally — ask for a game and see whether it scaffolds. Also avoid appending
  "name any skills you consulted" to a test prompt; it shifts the model into meta-reflection and
  it stops doing the task, which looks exactly like the skill failing to fire.

Editing the skills in this repo (read this before touching `skills/`)
- If the published plugin is installed (`claude plugin list` shows `littlejs@littlejs-ai`), the
  cached copy under `~/.claude/plugins/cache/` is what actually runs — including in this repo.
  Your edits to `skills/` change nothing until you reinstall, so it is easy to "fix" something,
  see no change, and chase a ghost.
- While working on skills: `claude plugin disable littlejs`, then load the working tree with
  `claude --plugin-dir .` (forward slashes in the path — backslashes silently load nothing) and
  `/reload-plugins` after each edit. Run `claude plugin enable littlejs` when you are done.
- `--plugin-dir` is for iterating, NOT for final verification: it is more lenient than the real
  loader and will not catch a malformed frontmatter (see the colon rule above). Before shipping,
  push, then `claude plugin uninstall littlejs` / `claude plugin marketplace update littlejs-ai` /
  `claude plugin install littlejs@littlejs-ai`, and re-test against that genuine install.
- `/plugin` slash commands do not exist in the VS Code extension. The `claude plugin ...` CLI
  forms work anywhere.

Notes
- `reference.md` documents major LittleJS API surface. It is a verbatim copy of the engine
  repo's `REFERENCE.md`; when bumping the engine, copy `dist/*` and that file together.
- Engine plugins that ship in the bundle and need no helper module: 3D (`render3D`),
  tweakables, the 2D/3D level editors (`levelEditor`), `ParallaxLayer`, the light system,
  tweens, scenes, pathfinding, texture sheets, and post-process effects (`postProcessBloom`,
  `postProcessTV`, ...). Check `reference.md` before hand-rolling any of these.
- Open each game's `index.html` directly in the browser for testing (no server required).
- `saveDataInit` (templates/menus.js), `SoundGenerator` (templates/gameFx.js), and
  `initDefaultAtlas` (templates/textureGenerator.js) are helper modules, NOT engine globals —
  using one requires loading its script. Grep `dist/littlejs.js` before assuming a symbol is
  engine API.
