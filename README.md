# 🚂🤖 LittleJS AI

*40+ classic arcade games rebuilt in pure HTML5 — each one a single self-contained file, AI-assisted.*

[LittleJS](https://github.com/KilledByAPixel/LittleJS) is a fast, lightweight, and fully open source HTML5 game engine designed for simplicity and performance.

This repo is a library of LittleJS AI experiments:
- playable games generated or iterated with AI help
- starter projects you can fork and remix
- docs and prompts to improve LittleJS + AI workflows

### Want to make a game without writing code? Try the [LittleJS GPT!](https://chatgpt.com/g/g-67c7c080b5bc81919736bc8815836be6-littlejs-game-maker)

For advanced users, LittleJS also works great with tools like GitHub Copilot, Codex, and Cursor.

LittleJS and everything in this repository is **MIT licensed!** See [LICENSE](LICENSE) for details.

## 📚 Resources

- [LittleJS Engine](https://github.com/KilledByAPixel/LittleJS) — the main LittleJS repository
- [Games Folder](games/) — example games made with LittleJS AI
- [Templates Folder](templates/) — starting templates and reusable components
- [LittleJS GPT AI](https://chatgpt.com/g/g-67c7c080b5bc81919736bc8815836be6-littlejs-game-maker) — use ChatGPT to make games without writing any code

## 🛠️ Make Your Own

Each game is one self-contained HTML file — no build step, no external assets, no dependencies. To start:

1. Copy a file from [templates/](templates/).
2. Edit the JavaScript inside the `<script>` tag.
3. Open the `.html` directly in a browser — no server needed.

### Templates

- [game.html](templates/game.html) — minimal scaffold
- [boardGame.html](templates/boardGame.html) — grid-based games (chess, sokoban, match-3)
- [menuGame.html](templates/menuGame.html) — title, pause, options, medals, HUD toolbar
- [box2dGame.html](templates/box2dGame.html) — Box2D physics (pool, plinko, pinball)
- [textureGame.html](templates/textureGame.html) — procedural sprite atlases from canvas draw ops
- [tweakableGame.html](templates/tweakableGame.html) — live-tweak globals via an HTML slider overlay
- [uiGame.html](templates/uiGame.html) — canvas-drawn UI (menus, sliders, dialogs)

Mix in helper scripts to add features: `menus.js` (DOM menus), `soundGenerator.js` (procedural SFX), `textureGenerator.js` (sprite painter), `tweakables.js` (live value tweaking).

## 🕹️ Games Made With AI

**Genre:** 🧩 Puzzle · 👾 Arcade · 🚀 Shooter · 🎯 Aim · ♟️ Board · 🏎️ Racing · 🏃 Platformer · ⚽ Sports · 🗺️ Adventure

**Features:** 👆 Touch · 🎮 Gamepad · 📦 Box2D physics

### 🌟 Featured — Top 10 Games

The most polished prototypes. Playable games with menus, sound, and a complete loop.

- [Tetris](https://killedbyapixel.github.io/LittleJS-AI/games/tetris.html) 🧩 👆 🎮
- [Frogger](https://killedbyapixel.github.io/LittleJS-AI/games/frogger.html) 👾 👆 🎮
- [Missile Command](https://killedbyapixel.github.io/LittleJS-AI/games/missileCommand.html) 🎯
- [Mini Golf](https://killedbyapixel.github.io/LittleJS-AI/games/miniGolf.html) 🎯 📦
- [Robotron](https://killedbyapixel.github.io/LittleJS-AI/games/robotron.html) 🚀 👆 🎮
- [Space Invaders](https://killedbyapixel.github.io/LittleJS-AI/games/spaceInvaders.html) 🚀 👆 🎮
- [Pac-Man](https://killedbyapixel.github.io/LittleJS-AI/games/pacman.html) 👾 👆 🎮
- [Centipede](https://killedbyapixel.github.io/LittleJS-AI/games/centipede.html) 🚀 👆 🎮
- [Asteroids](https://killedbyapixel.github.io/LittleJS-AI/games/asteroids.html) 🚀 👆 🎮
- [Checkers](https://killedbyapixel.github.io/LittleJS-AI/games/checkers.html) ♟️

### 🕹️ The Arcade

Polished, complete games that didn't quite make the top cut.

- [Sokoban](https://killedbyapixel.github.io/LittleJS-AI/games/sokoban.html) 🧩
- [Minesweeper](https://killedbyapixel.github.io/LittleJS-AI/games/minesweeper.html) 🧩
- [Match 3](https://killedbyapixel.github.io/LittleJS-AI/games/match3.html) 🧩
- [Flappy Bird](https://killedbyapixel.github.io/LittleJS-AI/games/flappyBird.html) 👾 🎮
- [Lunar Lander](https://killedbyapixel.github.io/LittleJS-AI/games/lunarLander.html) 🚀
- [Connect 4](https://killedbyapixel.github.io/LittleJS-AI/games/connect4.html) ♟️
- [Othello](https://killedbyapixel.github.io/LittleJS-AI/games/othello.html) ♟️
- [Chess](https://killedbyapixel.github.io/LittleJS-AI/games/chess.html) ♟️
- [Orbitswarm](https://killedbyapixel.github.io/LittleJS-AI/games/orbitswarm.html) 🧩
- [Snake](https://killedbyapixel.github.io/LittleJS-AI/games/snake.html) 👾 👆 🎮
- [Columns](https://killedbyapixel.github.io/LittleJS-AI/games/columns.html) 🧩
- [Snood](https://killedbyapixel.github.io/LittleJS-AI/games/snood.html) 🎯 👆
- [Dr. Mario](https://killedbyapixel.github.io/LittleJS-AI/games/drMario.html) 🧩

### 🚧 Works in Progress

Playable but still need iteration and polish to take them to the next level. Did you make a game you think should be included? Send a pull request!

- [Skiing](https://killedbyapixel.github.io/LittleJS-AI/games/skiing.html) 🏎️
- [Mario](https://killedbyapixel.github.io/LittleJS-AI/games/mario.html) 🏃 👆
- [Breakout](https://killedbyapixel.github.io/LittleJS-AI/games/breakout.html) 👾
- [Combat](https://killedbyapixel.github.io/LittleJS-AI/games/combat.html) 🚀
- [Geometry Dash](https://killedbyapixel.github.io/LittleJS-AI/games/geometryDash.html) 🏃 🎮
- [River Raid](https://killedbyapixel.github.io/LittleJS-AI/games/riverRaid.html) 🚀
- [Plinko](https://killedbyapixel.github.io/LittleJS-AI/games/plinko.html) 🎯 👆 🎮 📦
- [Micro Racer](https://killedbyapixel.github.io/LittleJS-AI/games/microRacer.html) 🏎️ 📦
- [Spy Hunter](https://killedbyapixel.github.io/LittleJS-AI/games/spyhunter.html) 🏎️

### 🧪 Prototypes & Experiments

Rough early experiments. Expect bugs and missing features.

- [2048](https://killedbyapixel.github.io/LittleJS-AI/games/2048.html) 🧩
- [Baseball](https://killedbyapixel.github.io/LittleJS-AI/games/baseball.html) ⚽ 📦
- [Basketball](https://killedbyapixel.github.io/LittleJS-AI/games/basketball.html) ⚽ 📦
- [Joust](https://killedbyapixel.github.io/LittleJS-AI/games/joust.html) 🏃
- [Defender](https://killedbyapixel.github.io/LittleJS-AI/games/defender.html) 🚀
- [Gradius](https://killedbyapixel.github.io/LittleJS-AI/games/gradius.html) 🚀
- [Kaboom](https://killedbyapixel.github.io/LittleJS-AI/games/kaboom.html) 🎯 👆
- [Moon Patrol](https://killedbyapixel.github.io/LittleJS-AI/games/moonPatrol.html) 🏎️
- [Mr. Driller](https://killedbyapixel.github.io/LittleJS-AI/games/mrDriller.html) 🧩
- [Peggle](https://killedbyapixel.github.io/LittleJS-AI/games/peggle.html) 🎯
- [Pong](https://killedbyapixel.github.io/LittleJS-AI/games/pong.html) ⚽ 👆
- [Pinball](https://killedbyapixel.github.io/LittleJS-AI/games/pinball.html) 🎯 📦
- [Pokemon](https://killedbyapixel.github.io/LittleJS-AI/games/pokemon.html) 🗺️
- [Puzzle Fighter](https://killedbyapixel.github.io/LittleJS-AI/games/puzzleFighter.html) 🧩
- [Pole Position](https://killedbyapixel.github.io/LittleJS-AI/games/polePosition.html) 🏎️
- [Jetpack Dash](https://killedbyapixel.github.io/LittleJS-AI/games/jetpackDash.html) 🏃
