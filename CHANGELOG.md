# Changelog

Notable changes to the **littlejs** Claude Code plugin. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are [semantic](https://semver.org/spec/v2.0.0.html).

> **Maintainers:** the `version` field in `.claude-plugin/plugin.json` is what gates updates — the plugin cache is keyed by it, so people who already installed the plugin receive **nothing** until that number changes. Any user-visible change means bumping it and adding an entry here in the same commit.

## [Unreleased]

## [1.2.0] - 2026-10-02

### Added

- **New skill, `custom-level-editor`.** The engine's debug build has a 2D tile and object editor and a 3D level editor, both built to be turned into a game's own editor. The skill covers the three ways to use them: as is, by making the game load its level from data and registering its object types; customized through the `levelEditor` object with the game's own keys, panel buttons, mouse tools, overlays and save target; or forked from the engine source when the built-in tools themselves must change. It bundles the engine's `EDITOR.md` guide and two small games that start in the editor, and covers what a game opened from `file://` needs, since `fetch` cannot read a level file there.
- The `littlejs-api` and `littlejs-conventions` skills and `AGENTS.md` point at the new skill for anything about level editors.

## [1.1.0] - 2026-10-02

Ships engine **1.23.0** (up from 1.18.30). This is five engine releases at once — 1.19 through 1.23 — and the engine roughly tripled in size: built-in 3D, level editors, tweakables, parallax and more are now part of every build.

### Changed

- **3D now means LittleJS 3D, not three.js.** The engine has its own 3D renderer (`Render3DPlugin`, `EngineObject3D`, the `render3D` global) inside `littlejs.js`: meshes from shape builders, height map and voxel terrain, shadows, lights, fog, particles, cameras, glTF/OBJ loading, 3D levels. The skills and `AGENTS.md` now always recommend it for a 3D game. A 3D game needs no CDN and opens from `file://` like any other. The engine still contains its three.js plugin for anyone who wants it, but nothing here uses or recommends it unless three.js is asked for by name.
- **Live tweaking is an engine plugin.** `tweak()`, `tweakDivider()`, `tweakButton()` and `tweakEngineDefaults()` are engine functions now, so `templates/tweakableGame.html` and `boardGame.html` use those and no template loads a tweakables script. Differences from the old helper: the panel opens with Esc then 9 (or `debugTweakables = true`) instead of `\`; `tweakEngineDefaults()` always adds its rows (the `tweakShowEngineDefaults` opt-in flag is gone); the `{value: ...}` option is gone, set the variable in code instead; values are saved under `LittleJS tweaks <page path>` rather than `<GameName>.tweaks`, so previously saved tweaks do not carry over. New: `tweakButton`, Vector3 values, an alpha slider on colors, and `{object}` for ES module games.
- `reference.md` is the engine's 1.23.0 reference: about 2300 lines, up from about 950. The `littlejs-api` skill's lookup advice is updated for the size and the new sections.
- The scaffolding skill's size checks follow the engine: `littlejs.js` is about 1.9MB now, so "under ~100KB means a truncated copy" became "under ~1MB". A built zip of an empty game is about 123KB, since every build includes the plugins.
- The privacy policy no longer lists a three.js CDN request, because no game made with the plugin makes one.

### Added

- `examples/3dGame/` — the engine's own 3D example (rolling ball on a terrain island with shadows, a forest, sprites, 3D text, lights, particles, bloom and a free camera), the copy-from starter for 3D games. It ships one small `tiles.png`, listed in its `build.json` `data`.
- Engine 1.19 through 1.23, all documented in `reference.md`. Beyond 3D and tweakables: 2D and 3D level editors in the debug build (Esc, then 0) with object layers and an extension API; `ParallaxLayer`; custom `Shader`s on any draw; ready-made post-process effects (`postProcessBloom`, `postProcessTV`, scanlines, vignette, ...); particle effect presets; a scene system; audio effects; `engineVariableStep`; touch pinch as the mouse wheel; a loading screen and `engineAddLoad`.
- Guidance to use the engine's ready-made particle effects (`particleEffect(name, pos)`) and post-process effects before hand-rolling either, and why built-in 3D is preferred: it shares the engine's objects, physics and input and has far more options built in.
- Conventions for 3D (Y up, -Z forward, diameters vs radii, the 3D pass, WebGL stays on) and a warning that the engine now declares about 1600 top-level names, so a game-level `function` that reuses one silently replaces the engine's.

### Removed

- `examples/threejsGame/` and `templates/threejsGame.html`.
- `templates/tweakables.js`, replaced by the engine plugin. A project scaffolded earlier that vendored its own copy keeps working until its engine is updated; after that, delete the script tag and the `sources` entry — the calls stay the same.
- `templates/bloom.js` and `templates/postProcess.js`, replaced by the engine's post-process effects. No template or example here loaded either. For a game that did: `bloomInit({threshold, intensity})` becomes `postProcessBloom(threshold, strength, size)`, where `size` is the glow's width in place of `iterations`/`downsample` and `includeOverlay` is the fourth argument, `includeMainCanvas`. The vignette is a separate piece now — `new PostProcessPlugin(postProcessEffects(postProcessGlow(threshold, strength, size), postProcessVignette()))`. The hand-written TV shader in `postProcess.js` is `postProcessTV({...})`. The engine's defaults differ from the old helper's (threshold .6 rather than .15, strength 1 rather than 4), so retune by eye rather than copying numbers across.

### Fixed

- `templates/menus.js` declared a function named `buildGrid`, which is now also the engine's 3D grid mesh builder. Loaded after the engine, the menu's version replaced it, which would have broken `buildGrid` in any 3D game with menus. Renamed to `buildGridItem`.
- Adding `#debug` (or `#release` / `#min`) to the URL of a template that is already open did nothing, because a hash change does not reload the page. `templates/engineLoader.js` now reloads when the flag asks for a different build than the one running. The templates' script cache-bust number is bumped too, so browsers fetch the new loader and engine.

### Engine changes worth knowing when updating an older game

- `canvasClearColor` defaults to transparent black (`CLEAR_BLACK`) instead of `BLACK`, and `canvasMaxSize` to 3840x2160.
- `collideTiles` is deprecated in favour of `collideLevel` (same flag; the old name still works).
- Box2D: world gravity is the engine's `setGravity(...)`; `Box2dTileLayer(tileLayer)`, `addPoly(points, density, ...)`, `setMassData(localCenter, mass, inertia)`, `setFilterData(categoryBits, ignoreCategoryBits, groupIndex)` and `Box2dTargetJoint(object, fixedObject, worldPos)` changed their arguments.
- `drawNineSliceScreen` / `drawThreeSliceScreen` take `color` before `borderSize`.
- The debug build takes the number keys, `C` and `+`/`-` while the debug overlay is open.

## [1.0.11] - 2026-09-18

### Fixed

- **1.0.10 shipped a marketplace manifest that fails validation.** The `displayName` key, listed in the plugin docs as optional, is rejected by `claude plugin validate` as unrecognized — and the directory review pipeline runs that same validator. The release script checked the Python step's exit code but not the validator's, so the failure printed and the push went ahead anyway. Removed the key; the release chain now stops on a validation failure. Nothing else changed, so behaviour is identical to 1.0.9 and 1.0.10.

## [1.0.10] - 2026-09-18

### Changed

- **Description cut to directory length.** Among the 40 most-installed plugins the median description is 170 characters and the top one is 151; ours was about 560, and read as a wall of text. It is now one line that names what LittleJS actually is — a fast open-source HTML5 engine with WebGL rendering, physics, particles and audio built in — and ends on the same beat as before: nothing to install, nothing to reinvent. Applied identically to `plugin.json`, the marketplace entry, and the directory submission.
- Tried `displayName: "LittleJS"` on the marketplace entry for brand capitalization. `claude plugin validate` rejects it as an unrecognized key, so it did not ship — see 1.0.11. The identifier stays `littlejs` regardless, since it is part of the install command and every skill namespace.
- README tagline reordered to lead with the toolkit and end with the plugin, matching what the repo is: templates, helpers, agent instructions any coding AI reads, and a Claude Code plugin as one way to install it.

## [1.0.9] - 2026-09-18

Changes from a second round of real-world feedback — an agent building a breakout game with 1.0.8 in Cowork, and the report it wrote afterwards.

### Fixed

- **Screen shake slowly drifted the camera.** `addScreenShake` in `templates/gameFx.js` nudged `cameraPos` by a random amount every frame and never removed it, so it was a random walk: after a few shakes the camera sat permanently off-centre. The comment even said so. It now undoes the previous frame's nudge before applying the next, so the camera always returns to wherever the game put it.
- **The shipped zip was a debug build.** Since 1.0.2 a scaffolded project vendors only `littlejs.js`, and `build.json` pointed at it, so `npm run build` packaged the debug engine — hundreds of asserts, the watermark, and a `LittleJS DEBUG build loaded` console warning, delivered to players. `build.mjs` now uses `littlejs.release.js` automatically whenever it sits beside `littlejs.js`, and warns loudly when it has to fall back to the debug build. Verified both directions: debug-only produces the warning and the marker; with the release copied in, the marker is gone.
- `examples/emptyGame` now sets `debugWatermark = false` like `pong` does. A fresh game showing an FPS watermark in the corner looks like a bug.

### Changed

- **Scaffolding no longer builds the zip.** The Cowork test showed the agent going straight from scaffold to `npm install` and a zip, before the user had played anything. Making a game is iterative: scaffold, play, change, repeat, and packaging is the last step, on request. The skill now says so explicitly, stops after a playable `index.html`, and has a separate **Shipping** section for when the user asks — which is also where `littlejs.release.js` gets copied in, so the zip that eventually ships is the release build.

### Added

- Four conventions the report hit as silent failures, each verified against the engine build before being written down: bounciness is `restitution` (`elasticity` no longer exists); returning `false` from `collideWithObject` skips the engine's collision response so you can handle it yourself; a one-line `setCameraScale` recipe for fitting a fixed playfield into any aspect ratio; and that `keyDirection()` already covers WASD.

## [1.0.8] - 2026-09-18

### Changed

- **Repositioned the plugin description around what it saves you, not what it lets you do.** "You can build games with AI" is table stakes now; nobody browsing a directory is impressed by it. The actual pitch is that asking an AI for a game from scratch makes it rebuild a game engine from scratch, every time, and you pay for that in tokens and bugs. LittleJS already solved rendering, input, physics, particles, audio and collision, and the templates already solved menus, sound and sprite art. The plugin, marketplace and README copy now all say that, and end on the same line: nothing to install, nothing to configure, nothing to reinvent.

## [1.0.7] - 2026-09-18

Ships engine **1.18.30** (up from 1.18.25). This is the release that actually delivers it: the engine
was bumped in the repo on August 18, but without a plugin version bump the cache stayed on 1.0.6 and
every installed copy kept running 1.18.25 while fresh installs got 1.18.30. A version bump is what
gates updates, so this is a reminder to self as much as a release note.

### Added

- Engine 1.18.26 through 1.18.30. New API surface, documented in `reference.md`:
  - `backgroundCanvas` / `setBackgroundCanvas(canvas)` for compositing a plugin canvas behind the engine canvases.
  - `createAudioBuffer(sampleChannels, sampleRate)` and `playAudioBuffer(...)` for procedurally generated audio, shareable between sounds.
  - `gamepadAxisFilterEnable` (default on) so axes that do not rest near centre, like steering wheels, are ignored.
- The repo's project instructions now live in `AGENTS.md`, the convention Codex, Cursor and Copilot read natively, with `CLAUDE.md` reduced to a one-line import. No effect on the plugin's skills, which never referenced either file.

## [1.0.6] - 2026-08-01

Ships engine **1.18.25**, which closes both gaps this plugin's feedback surfaced upstream.

### Fixed

- **The scaffolding skill stated a limitation that no longer exists.** It told agents `engineUpdate` is private to `engineInit`, so a frame could not be advanced headlessly and `Timer`-driven logic could not be verified. That was true through 1.18.24 and is now false — leaving it in would have stopped anyone using the capability that was added because of this exact complaint.

### Added

- **Deterministic headless stepping, in the engine.** `setEngineManualStep(true)` stops the engine driving itself with `requestAnimationFrame`, and `engineStep(frames)` then advances exactly that many fixed updates. Paired with `setHeadlessMode(true)`, time-driven behaviour — `Timer`, spawn intervals, cooldowns — becomes testable rather than something you verify by watching.

  Measured against the shipped build, not assumed: 100 consecutive `engineStep(1)` calls produced exactly 100 updates with zero drift, `engineStep(60)` exactly 60, `engineStep(0)` nothing, `frame` matched the update count exactly, and 10 steps while `paused` advanced nothing. The engine also does not self-drive in manual mode.

  Both the scaffolding skill's verification step and `littlejs-conventions` now point at it, and `reference.md` documents the full contract under "Headless testing".
- **`readSaveData` now asserts on a scalar default** in debug builds, catching the silent `NaN` that 1.0.5 could only warn about. The conventions skill still carries the guidance, since `ASSERT` is stripped from release builds — the assert catches the mistake, the skill prevents it.

## [1.0.5] - 2026-08-01

Changes from real-world feedback after building a game with 1.0.4.

### Fixed

- **Scaffolded games produced a `build.json` referencing a `tiles.png` that no longer exists**, so `npm run build` failed on first use. `tiles.png` was removed from `emptyGame` but four references survived — the starter's own `build.json` (which broke `node build.mjs emptyGame` outright) and three in the scaffolding skill. These games draw their art procedurally and ship no external textures, so the skill now says to omit `data` entirely unless the game genuinely ships a file alongside the page.
- **`readSaveData` with a scalar default silently produces `NaN`.** It returns `{...yourDefault, ...whatWasStored}`, so `readSaveData('best', 0)` spreads a number and yields `{}` rather than `0`. A best-score built on it becomes `NaN` with no error anywhere — while following the skill's own advice to prefer it over hand-rolled localStorage. Now called out in `littlejs-conventions` twice: in the save-data guidance and again in the pitfalls list, where it belongs alongside the other silent-failure entries.
- `package.json` still said `"version": "1.0.0"` while the plugin was on 1.0.4. Harmless to the plugin, but it is the obvious file to check, and one reader ended up grepping `engineVersion` out of the engine build to answer the question. Now tracks the plugin version and says which file actually gates updates.

### Added

- **A verification step before handing a game over.** Step 4 previously ended at "write the loop, then summarize", delegating all testing to the user — which is how the `readSaveData` bug above reached a finished game. There is now an explicit Step 5: check the script parses, re-read for values that silently go `NaN`, and report what was verified.
- **Guidance to serve over HTTP when verifying your own work.** The `file://` promise holds for a user opening the page, but an agent preview pane commonly renders `file://` as a static snapshot where the engine runs and `game.js` does not. The symptom is badly misleading — hoisted functions exist, classes and consts are `undefined`, the canvas is 0x0, and the engine throws `Constructed Vector2 is invalid`, which reads like a name collision. Step 5 names the signature so nobody debugs a phantom.
- A note that `new-littlejs-game` takes priority over general brainstorming workflows, so "make me a game" with another design-exploration plugin installed yields a game rather than a requirements interview.
- A world-scale anchor in `littlejs-conventions` (a typical view is roughly 35x20 units), matching why the existing `drawText ~3` / `drawTextScreen ~80` note is useful.

## [1.0.4] - 2026-08-01

### Changed

- **`build.mjs` is now hidden from local diffs too, not just GitHub pull requests.** 1.0.3 gave it `linguist-vendored`, which is a GitHub-only hint — a human reviewing a PR saw it collapsed, but `git diff` still printed all 348 lines, and that is exactly what an AI agent reads. Adding `-diff` closes the gap: a fresh scaffold's first commit drops from ~690 lines to ~342, which is `game.js` plus a few lines of config.

  `templates/**` deliberately keeps `linguist-vendored` without `-diff`. Helper modules are plausible to tweak while making a game — sounds in `gameFx.js`, sprites in `textureGenerator.js` — and silently swallowing a real edit there would be worse than showing it. `build.mjs` is shared tooling nobody edits by hand, so hiding it outright is safe. If it ever isn't, deleting one line from `.gitattributes` restores normal diffing.

## [1.0.3] - 2026-08-01

### Changed

- **A new game's first diff now shows only the game.** 1.0.2 hid the engine; this extends the same treatment to `build.mjs` and the copied `templates/` helper modules, which are also vendored from the plugin rather than written by you. A fresh scaffold went from ~1,800 reviewable lines to a few hundred — `game.js`, `index.html`, `build.json` — with everything copied in collapsed.

  The two markers are used deliberately, not interchangeably. The engine gets `-diff` as well, because it is generated, enormous, and never edited by hand. `build.mjs` and `templates/**` get `linguist-vendored` only: collapsed in pull requests, but if you later tweak a helper module, that edit still appears in a normal `git diff` instead of being silently swallowed.

## [1.0.2] - 2026-08-01

### Changed

- **Scaffolded projects now mark the vendored engine as vendored.** New projects get a `.gitattributes` with `dist/** -diff linguist-vendored`. Without it the engine lands in the first commit as ~640KB of apparently-new code, and every later reviewer — human or AI — treats it as project source to read and verify. One real session spent its effort on *"let me verify the copy is byte-identical myself so the reviewer doesn't have to line-read 650KB of third-party code."* Now `git diff` reports `Binary files differ` and GitHub collapses it in pull requests. The skill also states outright that the engine must never be reviewed, diffed, or summarized.
- **Only one engine build is vendored.** Projects previously received both `littlejs.js` and `littlejs.release.js` (~640KB each) although nothing ever loaded the second. Now just `littlejs.js`, with `build.json` pointing at it — half the footprint, no functional loss. Copy `littlejs.release.js` in by hand if you want the smallest possible jam build.
- Plugin and marketplace descriptions rewritten to say what the plugin is for rather than enumerate engine trivia, and to mention Box2D physics and three.js 3D support.

### Added

- A `.gitattributes` in this repo, for the same reason: `dist/` is a vendored engine build and should not appear in review.

## [1.0.1] - 2026-08-01

### Fixed

- **`littlejs-conventions` and `new-littlejs-game` silently failed to load when the plugin was installed.** Both descriptions contained a colon followed by a space (`...mistakes are silent: drawCircle...` and `...IS the answer: scaffold...`). In YAML a plain unquoted scalar treats `: ` as the key/value indicator, so the frontmatter failed to parse and the skill was dropped — with no error anywhere. Only the two shortest descriptions, which happened to contain no embedded colon, loaded.

  This is worth knowing about because it does not reproduce under `claude --plugin-dir`, so every pre-release test passed. It surfaced only on a real `plugin install`, and the symptom is indistinguishable from a badly-worded trigger: asking for a game just produced "which tech stack do you want?"

  **If you write a skill description, keep `: ` out of it.** Use a dash or a semicolon instead.

## [1.0.0] - 2026-08-01

First release. The repo itself is the plugin: `.claude-plugin/marketplace.json` points at the repo root, so `dist/`, `templates/`, `examples/`, `reference.md`, and `build.mjs` ship as payload and the engine travels with the plugin.

### Added

- **`littlejs-conventions` skill** — portable engine rules and pitfalls, applied to any LittleJS code in any project. Carries knowledge that previously lived only in this repo's `CLAUDE.md` and could not travel: sizes are diameters, `lerp` takes percent last, `ParticleEmitter` speed is per-frame, spin is `angleVelocity`, Y is up-positive, `update()` needs no `super.update()`, and top-level consts collide with engine globals.
- **`new-littlejs-game` skill** — scaffolds a complete playable project into any empty directory, copying the engine and chosen starter out of the installed plugin. Opens in a browser straight from disk; no clone, no `npm install`, no server.
- **`littlejs-api` skill** — grep-only lookup into the bundled 900-line `reference.md`, so exact signatures are available without loading 48KB into context.
- **`atlas-shape-art` skill** — renders shape-heavy games as tinted atlas tiles instead of per-shape draw calls.
- **Standalone build mode** — `node build.mjs` with no arguments now builds the current folder when it contains a `build.json`, which is what lets a scaffolded project produce a single-file zip.
- `CHANGELOG.md` and a marketplace entry with author, homepage, repository, license, and tags.

### Fixed

- `build.mjs` still pointed at the pre-rename `games/` folder, so **every build in the repo was broken**. Now targets `examples/`, and the stale `GAMES_DIR` constant is `EXAMPLES_DIR`.
- `build.mjs` did not quote interpolated paths passed to terser and bestzip, so builds failed in any directory containing a space — which, on Windows, is most home directories.
- `.gitignore` also still referenced `games/`, so roughly 1.3MB of generated build output under `examples/` had been committed. Untracked, files kept on disk.
- `CLAUDE.md` presented `saveDataInit`, `SoundGenerator`, and `initDefaultAtlas` as engine API. They are helper wrappers in `templates/menus.js`, `templates/gameFx.js`, and `templates/textureGenerator.js`; a scaffolded project that called them would throw on startup.
- `jsconfig.json` included `./games/**/*.js`, giving editor IntelliSense no coverage of any game.

### Removed

- The `iterate-sprite` skill and its local HTTP server — an experiment that did not work out.
- `.github/copilot-instructions.md`, which described a repo layout from roughly six months earlier.
- The `GPT/` ChatGPT package, moved to its own repo at [KilledByAPixel/LittleJS-GPT](https://github.com/KilledByAPixel/LittleJS-GPT) with its history. A marketplace install copies the whole repo, so it was shipping 680KB of unrelated files to everyone installing a game-dev plugin.

[Unreleased]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.11...HEAD
[1.0.11]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/KilledByAPixel/LittleJS-AI/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/KilledByAPixel/LittleJS-AI/releases/tag/v1.0.0
