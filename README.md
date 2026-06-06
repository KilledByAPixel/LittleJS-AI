# 🚂🤖 LittleJS AI

*An AI-assisted toolkit for making HTML5 games with [LittleJS](https://github.com/KilledByAPixel/LittleJS) — starter templates, helper modules, docs, and prompts for AI workflows. The games built with it live in the [LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/).*

# 🎮 [▶ Play in the LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/)

[LittleJS](https://github.com/KilledByAPixel/LittleJS) is a fast, lightweight, and fully open source HTML5 game engine designed for simplicity and performance.

This repo is the **AI-assisted LittleJS toolkit** — everything you need to build games, but not the games themselves:
- starter templates you can fork and remix
- helper modules for menus, sound/FX, sprites, and live tweaking
- docs and prompts to improve LittleJS + AI workflows

The 50+ finished games built with these tools live in their own repo: the **[LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/)** ([source](https://github.com/KilledByAPixel/LittleJSArcade)).

### Want to make a game without writing code? Try the [LittleJS GPT!](https://chatgpt.com/g/g-67c7c080b5bc81919736bc8815836be6-littlejs-game-maker)

For advanced users, LittleJS also works great with tools like GitHub Copilot, Codex, and Cursor.

LittleJS and everything in this repository is **MIT licensed!** See [LICENSE](LICENSE) for details.

## 📚 Resources

- [LittleJS Engine](https://github.com/KilledByAPixel/LittleJS) — the main LittleJS repository
- [LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/) — 50+ finished games built with these tools, in their own repo ([source](https://github.com/KilledByAPixel/LittleJSArcade))
- [Templates Folder](templates/) — starting templates and reusable components
- [LittleJS GPT AI](https://chatgpt.com/g/g-67c7c080b5bc81919736bc8815836be6-littlejs-game-maker) — use ChatGPT to make games without writing any code

## 🛠️ Make Your Own

Clone the repo and you have everything you need to build games — from quick prototypes to large, multi-file projects. No external assets and no dependencies to play; the only npm packages are optional build tools.

### Start a new game

1. Copy the starter folder [games/emptyGame/](games/emptyGame/) to `games/<yourGame>/`.
2. Edit `game.js` — and add more files (`player.js`, `ui.js`, `constants.js`, …) as the game grows.
3. Open `index.html` in a web browser. That's it — it runs straight from `file://`, no server needed.

Games use the **global LittleJS API**: load `dist/littlejs.js` with a plain `<script>` tag and call globals like `engineInit`, `drawText`, and `vec2` directly. Keep gameplay modular across several `.js` files for medium and large games.

### Ship a single-file build (optional)

Each game folder includes a `build.mjs` that concatenates the engine + your source, minifies it, and produces one self-contained `index.html` plus a `.zip` (great for game jams).

```sh
npm install                       # once, in the repo root — installs terser + bestzip
node games/yourGame/build.mjs   # builds games/yourGame/build/ and <name>.zip
```

### 📝 Feature templates

Single-file references to copy patterns from when adding a feature — not full game scaffolds:

- [game.html](templates/game.html) — minimal scaffold (shapes, text, camera)
- [boardGame.html](templates/boardGame.html) — grid-based games (chess, sokoban, match-3)
- [menuGame.html](templates/menuGame.html) — title, pause, options, medals, HUD toolbar
- [box2dGame.html](templates/box2dGame.html) — Box2D physics (pool, plinko, pinball)
- [textureGame.html](templates/textureGame.html) — procedural sprite atlases from canvas draw ops
- [tweakableGame.html](templates/tweakableGame.html) — live-tweak globals via an HTML slider overlay
- [uiGame.html](templates/uiGame.html) — canvas-drawn UI (menus, sliders, dialogs)

Mix in helper scripts to add features: `menus.js` (DOM menus + best score + game-over dialog + setPlaying/quitToTitle), `gameFx.js` (procedural SFX + screen shake), `textureGenerator.js` (sprite painter), `tweakables.js` (live value tweaking).

## 🕹️ Built With These Tools

A few favorites from the **[LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/)** — every one made with the templates and helpers in this repo. Fork any of them from the [Arcade repo](https://github.com/KilledByAPixel/LittleJSArcade) as a starting point for your own.

- 🧩 [Tetrix](https://killedbyapixel.github.io/LittleJSArcade/games/tetrix.html)
- 🤖 [Pong](https://killedbyapixel.github.io/LittleJSArcade/games/pong.html)
- 🤖 [Robo Rescue](https://killedbyapixel.github.io/LittleJSArcade/games/roboRescue.html)
- 🐸 [Froggit](https://killedbyapixel.github.io/LittleJSArcade/games/froggit.html)
- 🧛 [Emoji Survivors](https://killedbyapixel.github.io/LittleJSArcade/games/emojiSurvivors.html)
- 🏙️ [Missile Defense](https://killedbyapixel.github.io/LittleJSArcade/games/missileDefense.html)
- ⛳ [Mini Golf](https://killedbyapixel.github.io/LittleJSArcade/games/miniGolf.html)
- 🎱 [Pool](https://killedbyapixel.github.io/LittleJSArcade/games/pool.html)
- 🃏 [Freecell](https://killedbyapixel.github.io/LittleJSArcade/games/freecell.html)
- 👾 [Space Intruders](https://killedbyapixel.github.io/LittleJSArcade/games/spaceIntruders.html)
- 👻 [Maze Munchy](https://killedbyapixel.github.io/LittleJSArcade/games/pucMan.html)
- 🌑 [Astroblast](https://killedbyapixel.github.io/LittleJSArcade/games/asterblast.html)
- 🔴 [Checkers](https://killedbyapixel.github.io/LittleJSArcade/games/checkers.html)
