---
name: new-littlejs-game
description: Use when the user wants to start a brand-new LittleJS game in this repo — "make a new game", "start a X game", "create a game", "let's build a Y", or invokes /new-littlejs-game. Picks the right starter folder + template, scaffolds games/<name>/, and builds the smallest playable loop. Not for editing an existing game.
---

# new-littlejs-game

Scaffold a new playable LittleJS game in `games/<name>/` by copying the closest **example game**, then pulling gameplay patterns from the closest **template**. The whole point of this skill is to skip re-exploring the repo every time: the tables below are the answers, so you don't re-derive the layout, paths, and template purposes on each new game.

## When to invoke

- The user typed `/new-littlejs-game`.
- The user asks to start/create/build a NEW game ("make a card game", "let's build a platformer", "I want a tower defense game"). Offer it conversationally if they're clearly starting fresh: "I'll use the new-littlejs-game skill to scaffold this."
- NOT for editing/extending a game that already exists in `games/` — just edit it directly.

## Step 1 — Ask up to 3 quick questions (only what's needed)

Ask only the questions whose answers change the scaffold. Usually:

1. **Game name** (becomes the `games/<name>/` folder, camelCase, e.g. `memoryMatch`). If they don't care, propose one.
2. **Core mechanic / genre** in one line — enough to pick the template (see Step 2).
3. **Does it need a title/pause menu now or later?** (decides whether to wire `menus.js` from the start.)

If the request already answers these, skip straight to Step 2 and just confirm the name.

## Step 2 — Pick the base folder + template

**Two decisions:** which example game to COPY (gives you a working `index.html`/`game.js`/`build.json`), and which template to PULL PATTERNS FROM (copy code out of it into `game.js` — never base the folder structure on a template).

Copy base — pick the closest **example game folder**:

| Game uses…                    | Copy this folder         | Why                                              |
|-------------------------------|--------------------------|--------------------------------------------------|
| Box2D physics                 | `games/box2dGame/`       | Already wires `box2dInit`, the wasm loader, `data` |
| Anything else (the default)   | `games/emptyGame/`       | Canonical non-physics starter                     |
| A simple arcade reference      | `games/pong/`            | Complete tiny game to read for structure          |

> These three are the only vetted example folders — name them directly, don't glob `games/` for others.

Pattern source — pick the closest **template** (`templates/*.html`):

| Game type / need                       | Template                  | Helper modules to load (in `templates/`)         |
|----------------------------------------|---------------------------|--------------------------------------------------|
| Basic shapes / text / camera (default) | `game.html`               | —                                                |
| Box2D physics                          | `box2dGame.html`          | (engine wasm loader, not a template module)      |
| Turn-based grid / board                | `boardGame.html`          | —                                                |
| Playing cards                          | `cardsGame.html`          | `textureGenerator.js`, `cards.js`                |
| Title / pause / options UI             | `menuGame.html`           | `menus.js`                                        |
| Procedural sprite atlas                | `textureGame.html`        | `textureGenerator.js`                            |
| Runtime tuning controls                | `tweakableGame.html`      | `tweakables.js`                                   |
| Canvas UI widgets                      | `uiGame.html`             | `menus.js` (+ `uiGame.html` patterns)            |
| Sound effects + screen shake (any game)| (read `gameFx.js` API)    | `gameFx.js`                                      |

Combine rows freely — `gameFx.js` stacks onto any other choice. Example: a card game with menus and SFX pulls from `cardsGame.html` + `menuGame.html` and loads `textureGenerator.js`, `cards.js`, `menus.js`, `gameFx.js`. Wire every helper module the same way: a `<script>` tag in `index.html` AND a `sources` entry in `build.json` (Step 3).

## Step 3 — Scaffold the folder

1. Copy the chosen base folder to `games/<name>/` (keep `index.html`, `game.js`, `build.json`; `emptyGame` also has `tiles.png`).
2. Update `<title>` in `index.html` and `name`/`title` in `build.json` to the new game.
3. Add the helper-module `<script>` tags from Step 2 to `index.html`, in dependency order, **between** the engine and `game.js`. Paths from `games/<name>/` are one level deeper than `templates/`:

   ```html
   <script src=../../dist/littlejs.js></script>
   <script src=../../dist/box2d.wasm.js></script>      <!-- only for Box2D -->
   <script src=../../templates/textureGenerator.js></script>  <!-- cards/texture need this FIRST -->
   <script src=../../templates/cards.js></script>
   <script src=../../templates/menus.js></script>
   <script src=game.js></script>
   ```

4. Mirror those into `build.json` `sources` (ordered, engine is auto-prepended — do NOT list `littlejs.js`). List helper modules by their `../../templates/...` path, `game.js` last:

   ```json
   { "title": "Memory Match", "name": "memoryMatch",
     "sources": ["../../templates/textureGenerator.js", "../../templates/cards.js", "../../templates/menus.js", "game.js"] }
   ```
   For Box2D, add `"data": ["../../dist/box2d.wasm.js", "../../dist/box2d.wasm.wasm"]` (copied by basename, as in `games/box2dGame/build.json`).

## Step 4 — Build the smallest playable loop

Write the core loop into `game.js` (split into more modules only if it grows), pulling concrete patterns out of the chosen template(s). Honor the project rules in CLAUDE.md: 4-space indent, global API (`engineInit`, `vec2`, `drawText`…), no `LJS.` prefix, no ES imports, engine built-ins over custom helpers (`keyDirection()`, `isOverlapping`, `Timer`, `saveDataInit('<Name>')` first in `gameInit`).

Then stop and give the standard output: 1-3 line step summary, quick test (open `games/<name>/index.html` directly — no server — with expected result + controls), and 2-4 next-step options.

## Common mistakes

- **Basing the folder on a template** (`templates/*.html`) — those are single-file references; copy patterns OUT of them, but copy the FOLDER from an example game.
- **Copying `emptyGame` for a physics game** — copy `box2dGame` so wasm/`data` are already wired.
- **Listing `littlejs.js` in `build.json` `sources`** — the engine release is auto-prepended; only list loose JS.
- **`cards.js`/texture sprites before `textureGenerator.js`** — load order matters; `textureGenerator.js` first.
- **Globbing `games/` to discover starters** — `Glob games/*/` can return nothing on this platform; just use the three named folders.
- **Re-exploring the repo** — the tables above are the answers; only read a template file when you're ready to copy gameplay code from it.
