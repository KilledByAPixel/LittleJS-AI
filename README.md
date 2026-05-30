# 🚂🤖 LittleJS AI

*AI-assisted HTML5 game-making with LittleJS — starter templates, helper modules, and prompts. Home of the [LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/): 50+ games built with these tools.*

# 🎮 [▶ Play in the LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/)

[LittleJS](https://github.com/KilledByAPixel/LittleJS) is a fast, lightweight, and fully open source HTML5 game engine designed for simplicity and performance.

This repo is the AI-assisted LittleJS toolkit:
- starter templates you can fork and remix
- helper modules for menus, sound/FX, sprites, and live tweaking
- docs and prompts to improve LittleJS + AI workflows

The finished games built with these tools live in the **[LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/)** ([repo](https://github.com/KilledByAPixel/LittleJSArcade)).

### Want to make a game without writing code? Try the [LittleJS GPT!](https://chatgpt.com/g/g-67c7c080b5bc81919736bc8815836be6-littlejs-game-maker)

For advanced users, LittleJS also works great with tools like GitHub Copilot, Codex, and Cursor.

LittleJS and everything in this repository is **MIT licensed!** See [LICENSE](LICENSE) for details.

## 📚 Resources

- [LittleJS Engine](https://github.com/KilledByAPixel/LittleJS) — the main LittleJS repository
- [LittleJS Arcade](https://killedbyapixel.github.io/LittleJSArcade/) — 50+ finished games built with these templates ([repo](https://github.com/KilledByAPixel/LittleJSArcade))
- [Templates Folder](templates/) — starting templates and reusable components
- [LittleJS GPT AI](https://chatgpt.com/g/g-67c7c080b5bc81919736bc8815836be6-littlejs-game-maker) — use ChatGPT to make games without writing any code

## 🛠️ Make Your Own

Each game is one self-contained HTML file — no build step, no external assets, no dependencies. To start:

1. Copy a file from [templates/](templates/).
2. Edit the JavaScript inside the `<script>` tag.
3. Open the `.html` in a web browser.

### 📝 Templates

- [game.html](templates/game.html) — minimal scaffold
- [boardGame.html](templates/boardGame.html) — grid-based games (chess, sokoban, match-3)
- [menuGame.html](templates/menuGame.html) — title, pause, options, medals, HUD toolbar
- [box2dGame.html](templates/box2dGame.html) — Box2D physics (pool, plinko, pinball)
- [textureGame.html](templates/textureGame.html) — procedural sprite atlases from canvas draw ops
- [tweakableGame.html](templates/tweakableGame.html) — live-tweak globals via an HTML slider overlay
- [uiGame.html](templates/uiGame.html) — canvas-drawn UI (menus, sliders, dialogs)

Mix in helper scripts to add features: `menus.js` (DOM menus + best score + game-over dialog + setPlaying/quitToTitle), `gameFx.js` (procedural SFX + screen shake), `textureGenerator.js` (sprite painter), `tweakables.js` (live value tweaking).

## 🕹️ Featured Games Made With AI

Playable demos you can fork as starting points for your own games.

Did you make a game you think should be included? Send a pull request!

- 🧩 [Tetrix](https://killedbyapixel.github.io/LittleJSArcade/games/tetrix.html)
- 🤖 [Robo Rescue](https://killedbyapixel.github.io/LittleJSArcade/games/roboRescue.html)
- 🐸 [Froggit](https://killedbyapixel.github.io/LittleJSArcade/games/froggit.html)
- 🧛 [Emoji Survivors](https://killedbyapixel.github.io/LittleJSArcade/games/emojiSurvivors.html)
- 🏙️ [Missile Defense](https://killedbyapixel.github.io/LittleJSArcade/games/missileDefense.html)
- ⛳ [Mini Golf](https://killedbyapixel.github.io/LittleJSArcade/games/miniGolf.html)
- 🎱 [Pool](https://killedbyapixel.github.io/LittleJSArcade/games/pool.html)
- 🃏 [Freecell](https://killedbyapixel.github.io/LittleJSArcade/games/freecell.html)
- 👾 [Space Intruders](https://killedbyapixel.github.io/LittleJSArcade/games/spaceIntruders.html)
- 👻 [Puc-Man](https://killedbyapixel.github.io/LittleJSArcade/games/pucMan.html)
- 🌑 [Asterblast](https://killedbyapixel.github.io/LittleJSArcade/games/asterblast.html)
- 🔴 [Checkers](https://killedbyapixel.github.io/LittleJSArcade/games/checkers.html)
- 🐛 [Centibug](https://killedbyapixel.github.io/LittleJSArcade/games/centibug.html)
- 🪐 [Orbitswarm](https://killedbyapixel.github.io/LittleJSArcade/games/orbitswarm.html)
- 💊 [Dr. Pill](https://killedbyapixel.github.io/LittleJSArcade/games/drPill.html)
