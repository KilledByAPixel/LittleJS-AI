# LittleJS-AI Copilot Instructions

## Project Overview
This is a collection of single-file HTML games built with the [LittleJS](https://github.com/KilledByAPixel/LittleJS) game engine, optimized for AI-assisted "vibe coding." Each game is self-contained in one HTML file with embedded JavaScript—no build steps, no external assets.

## Architecture

### File Structure
- `games/` — Complete playable games (one `.html` file per game)
- `AI/` — Starter templates and documentation for AI workflows
  - `index.html` — Standard starter template with `SoundGenerator` class
  - `indexBox2d.html` — Physics-enabled template with Box2D integration
  - `reference.md` — Complete LittleJS API reference
  - `tutorial.md` — Step-by-step Breakout tutorial

### Engine Initialization Pattern
Every game follows this structure with 5 callback functions:
```javascript
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
```
- `gameInit` — One-time setup (create objects, load levels)
- `gameUpdate` — Per-frame input handling and game logic (60 FPS)
- `gameUpdatePost` — Post-physics updates, camera positioning
- `gameRender` — Draw backgrounds before objects
- `gameRenderPost` — Draw HUD/UI after objects

## Key Conventions

### Single-File Games
- All code lives in `<script>` tags within one HTML file
- No external images, audio files, or spritesheets
- Use `SoundGenerator` class (included in templates) for procedural sounds
- Use solid-color primitives: `drawRect`, `drawCircle`, `drawEllipse`, `drawLine`

### Engine Settings Block
Every game starts with this boilerplate (do not remove):
```javascript
'use strict';
debugWatermark = false;
showEngineVersion = false;
paused = false;
gravity = vec2(0, 0);
cameraPos = vec2(0, 0);
cameraScale = 32;
```

### Sound Effects with SoundGenerator
Create sounds without audio files using the `SoundGenerator` class:
```javascript
const sfxShoot = new SoundGenerator({frequency:520, release:.07, slide:-1.2});
const sfxBoom  = new SoundGenerator({frequency:95, release:.28, noise:.32});
sfxShoot.play();  // Play the sound
```
Key parameters: `frequency`, `release`, `volume`, `slide`, `noise`, `pitchJump`

### Coordinate System & Drawing
- World space is centered at `cameraPos`; positive Y is up
- `drawCircle`/`drawEllipse` `size` parameter is **diameter**, not radius
- Angles are in radians; **clockwise is positive**
- Use `vec2()` for all positions and sizes
- Colors via `rgb(r,g,b,a)` or `hsl(h,s,l,a)` with values 0–1

### Input Handling
```javascript
mousePos                     // World-space mouse position
keyIsDown('KeyA')            // Check if key is held
keyWasPressed('Space')       // Check if key was pressed this frame
keyDirection()               // Returns vec2 from arrow/WASD keys
mouseWasPressed(0)           // Left mouse button pressed
```

### Timers
Use `Timer` for cooldowns, delays, and animations:
```javascript
const spawnTimer = new Timer(2);  // 2 second timer
if (spawnTimer.elapsed()) spawnEnemy();
```

### Game Objects
Extend `EngineObject` for game entities:
```javascript
class Player extends EngineObject {
    constructor() {
        super(vec2(0,0), vec2(1,1)); // position, size
        this.color = RED;
    }
    update() {
        // Called automatically each frame
    }
}
```

### Box2D Physics (Optional)
Use `AI/indexBox2d.html` template. Requires async init:
```javascript
async function gameInit() {
    await box2dInit();
    // Create Box2dObject or Box2dStaticObject
}
```

## Game Types That Work Well
- **Puzzle**: Tetris, Columns, Minesweeper, Match-3
- **Arcade**: Breakout, Snake, Asteroids, Space Invaders, Frogger
- **Board games**: Checkers, Connect Four, Battleship, Solitaire
- **Platformer**: Use `TileCollisionLayer` for tile-based collision
- **Top-down**: Twin-stick shooters, racing, adventure
- **Pseudo-3D**: Raycasting or arcade racing
- **Physics**: Use `AI/indexBox2d.html` for Box2D games

## Common Pitfalls
- Don't redefine math shortcuts (`min`, `max`, `abs`, `sign`, `clamp`, `lerp` already exist globally)
- Don't modify HTML/CSS—only write JavaScript
- Don't write new audio code—use `SoundGenerator` for all sounds
- Don't replace `\n` with actual newlines inside string literals
- For fixed-size canvas: `setCanvasFixedSize(vec2(1280, 720))`
- Debug overlay default is `Escape` key; games often use `setDebugKey('Backquote')` to avoid conflicts

## Helpful Resources
- [AI/reference.md](AI/reference.md) — Full API cheat sheet
- [AI/tutorial.md](AI/tutorial.md) — Breakout tutorial walkthrough
- [games/breakout.html](games/breakout.html) — Example with powerups, collisions
- [games/tetris.html](games/tetris.html) — Complex example with AI opponent

## Testing Games
Open the HTML file directly in a browser—no server required. Press `Escape` (or backtick if overridden) to toggle debug overlay.
