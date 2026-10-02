---
name: custom-level-editor
description: Use when a LittleJS game needs a level editor or editable levels — "add a level editor", "let me edit levels", "make a map editor", "build a custom editor for my game", "hook my game up to the editor", placing objects or painting tiles while the game runs, saving levels as files, or extending/forking the built-in editor. LittleJS ships a 2D tile and object editor and a 3D level editor in the debug build; make the game load its level from data and customize that editor through the levelEditor object (own object types, keys, buttons, tools, panel, overlays, save) instead of writing an editor from scratch.
---

# custom-level-editor

LittleJS (1.23+) has two level editors inside the debug build — a 2D one that paints tile layers and places objects in a Tiled map, and a 3D one that places, moves, rotates and scales objects, paints blocks and sculpts terrain. Both are a starting point, meant to be turned into the editor for one particular game. **Do not write a level editor from scratch.** Undo, autosave, selection, copy and paste, snapping, file save and a play/edit toggle are already there.

The full API with tested code for every feature is in `${CLAUDE_SKILL_DIR}/EDITOR.md` (the engine's own guide, ~330 lines — read it before writing editor code). Two complete small games that start in the editor are in `${CLAUDE_SKILL_DIR}/examples/`: `editor2D.js` and `editor3D.js`.

## Pick the level of customization

Work down this list and stop at the first one that covers what the user asked for.

1. **Use it as is.** Make the game load its level from data, register its object types, set two hooks. This alone gives a working editor. Most of the work is here (see "Making a game editable").
2. **Customize it through `levelEditor`.** Add the game's own keys, panel buttons, mouse tools, panel controls, overlays and save target. This is what "a custom editor for my game" almost always means.
3. **Fork the editor source.** Only when the user wants to change how the editor's *own* tools behave (how Move snaps, how painting works, the panel's layout), which the API does not expose. See "Forking" — it means building the engine, so confirm that is wanted first.

## Facts that decide whether it works at all

- **Debug build only.** The editor's code is in `littlejs.js` and absent from `littlejs.release.js` / `littlejs.min.js`. The page being developed must load the debug build. In a release build `levelEditor` is a stub that accepts every call and does nothing, so editor code needs no `if (debug)` guards and can stay in the shipped game.
- **Opening it.** Esc opens the debug overlay, then `0` opens the editor; Esc then switches between editing and playing. Or call `levelEditor.open()` at the end of `gameInit` to start in the editor. It picks the 3D editor when the game loaded a 3D level; `levelEditor.use3D = true/false` forces one.
- **The level data is the source of truth.** The editor edits the level object the game loaded (a Tiled map in 2D, a `{littlejs3D: 1, objects: [...]}` object in 3D) and brings the game's objects in line. A level built by code in `gameInit` (`new Wall(...)` in loops) gives the editor nothing to edit.
- **Types are named by a string**, never by the class, because minified builds rename classes.
- **Engine names are global.** `levelEditor`, `LevelEditor`, `setLevelEditor`, `level3DLoad`, `objectLayersLoad` and friends are engine globals — never declare your own with those names.

## Making a game editable

This is the step that turns an existing game into one the editor can work on.

1. **Move the level into data.** One object per level.
   - 2D: a Tiled map — `{width, height, tilewidth, tileheight, layers: [{type: 'tilelayer', ...}, {type: 'objectgroup', objects: [...]}]}`. Copy the shape from `examples/editor2D.js` (`makeLevel`). Tiled itself can open and save these files.
   - 3D: `{littlejs3D: 1, objects: [{id, type, pos, rotation, scale, properties}]}` with optional `scene`, `voxels`, `terrain` and `prefabs` blocks. `Box`, `Sphere`, `Cylinder` and `Light` are built-in types, enough to block out a level with no code. Copy the shape from `examples/editor3D.js`.
2. **Register the game's types before loading**, by name, with default properties. Each default that is a number, boolean, string, `Color` or vector becomes an input in the editor's panel, saved per object.
   - 2D: `objectLayersAddType('Coin', Coin, {value: 1}, tile(6))` — the class is made with `new Coin(pos)`, the defaults are then set on it, and the tile is its icon in the editor.
   - 3D: `level3DAddType('Spawner', Spawner, {rate: 2, color: hsl(0, 1, .5)})` — the class is made with `new Spawner(pos3D, properties)`, so it needs its **own constructor** taking those two; one that forwards every argument to `EngineObject3D` would pass the properties as the mesh. `level3DAddMesh('Tree', mesh)` is a static prop with no class.
   - A thing that is not an object (a player start, a camera point) is an arrow function — `objectLayersAddType('PlayerStart', (pos)=> playerStart = pos)`.
3. **Write one `loadLevel()`** that destroys everything and rebuilds from the data, and call it from `gameInit`:
   - 2D: `engineObjectsDestroy(); tileLayersLoad(level, tile(0, 16), 0, collisionLayerIndex); objectLayersLoad(level);` then make the player.
   - 3D: `engineObjectsDestroy(); level3DLoad(level);` then make the player.
4. **Set the two hooks** that make the editor useful for playtesting:

   ```javascript
   levelEditor.onRestart = loadLevel;                  // adds a Restart button
   levelEditor.onPlayFrom = (pos)=> { player.pos = pos.copy(); player.velocity = vec2(); }; // "Play from mouse"
   ```

   In 3D `pos` is a `Vector3` — set `player.pos3D` and `velocity3D`.
5. 2D only — if painted tiles need game logic (collision values, spawning a decoration), set `levelEditor.onTile = (layer, pos, tile)=> {...}` (`tile` is undefined when erased), and `levelEditor.paletteTiles = [0, 1, 10]` to show only the level tiles of the sheet.

### Tile sheets

The 2D editor paints tile indices from a tile sheet, so a tile-based game needs one — an image in `engineInit`'s image list, or a texture the game generates. A map of object layers only (`objectLayersLoad` with no tile layer) needs none. In 3D only the block map needs a sheet — a level with a `voxels` block asserts `tile texture is not loaded` when the game has no image, so leave that block out (objects, terrain and scene work without one) or give the game a sheet and call `level3DVoxelSetup`.

### Where the level file lives

The editor autosaves to the browser as you work, and its Save button writes the level as JSON (to a file picked once in Chrome and Edge, a download elsewhere). How the game reads it back depends on how the game is served.

- **Opened from `file://`** (no server) — `fetch` cannot read local files, so keep the level in a script — `level.js` containing `const level = {...};`, loaded by a `<script>` tag before `game.js`. Have Save write that form:

  ```javascript
  levelEditor.onSave = (text, fileName)=>
  {
      saveText('const level = ' + text + ';\n', 'level.js', 'text/javascript'); // downloads level.js
      return true; // kept, the editor writes no file of its own
  };
  ```

  Tell the user to move the downloaded `level.js` over the one in the project. Add `level.js` to `build.json` `sources` before `game.js`.
- **Served over http** — keep `level.json` and load it with `level = await fetchJSON('level.json')` in an async `gameInit`; the editor's own Save then writes the real file. List it in `build.json` `data`.

Either way a level loaded again from the same object, as a restart does, has the edits.

## Customizing through `levelEditor`

Everything is on `levelEditor`, the same calls in both editors. Read `EDITOR.md` for the exact arguments and a tested example of each; the map of what exists:

| Want | Use |
|---|---|
| A shortcut for a common edit | `levelEditor.addKey('k', (shift)=> {...}, 'K: what it does')` |
| A button in the panel | `levelEditor.addButton('Label', ()=> {...}, 'tooltip')` |
| A mouse tool (paths, zones, rows of things, a brush) | `levelEditor.addTool('Name', {key, hint, onPress, onDrag, onRelease, onDraw})` |
| Your own controls in the panel | `levelEditor.onPanel = (box)=> {...}` — an HTML element to fill |
| Overlays: ranges, links, spawn zones | `levelEditor.onDraw = ()=> {...}` |
| Per-frame logic, open and close moments | `onUpdate`, `onOpen`, `onClose` |
| Save somewhere of your own | `levelEditor.onSave = (text, fileName)=> true` (may be async) |
| All of it as one class | `class MyEditor extends LevelEditor {...}` then `setLevelEditor(new MyEditor)` |

Edits go through `levelEditor.edit3D` or `levelEditor.edit2D` — `place`, `change`, `setTransform`, `setProperty`, `paint`, `changeObjects`, `selection`, `undo`, `toJSON` and more, tabled in `EDITOR.md`.

Rules that are easy to break:

- **An edit is a stroke.** After `edit.change(...)`, `edit.place(...)`, `edit.paint(...)` or `edit.changeObjects(...)` in a key or button, call `edit.strokeEnd()` — that is what makes it one undo step and autosaves it. Inside a **tool's** callbacks do NOT call it; the editor ends the stroke at the release.
- **Change the level, not the game's objects.** Moving an `EngineObject` directly is lost on the next sync. Use `edit.setTransform` / `edit.setProperty` inside `edit.change`.
- **Use `edit3D` / `edit2D` only inside what the editor calls** — a key's action, a button's click, a tool's callbacks, `onUpdate`, `onDraw`. They are undefined in a release build, where none of those run.
- **`onDraw` draws the way its editor does** — 2D draws (`drawRect`, `drawLine`) in the 2D editor, and inside the 3D pass (`render3D.drawBox`, `render3D.drawLine`) in the 3D one.
- **`Escape` and `0` are the editor's own** and cannot be taken. A key of yours replaces an editor key of the same name, with a console warning — check the editor's `?` help for what is in use.
- In an editor class, do not name your own fields `keys`, `buttons`, `tools` or `tool`.
- `setLevelEditor` goes before the editor opens; use the global `levelEditor` afterwards, not a reference taken earlier.

A good custom editor, in order: the game's types with useful default properties; `onRestart` and `onPlayFrom`; keys and buttons for what a designer does most; a tool for what is done with the mouse; `onDraw` for whatever the level does not show by itself.

## Forking the editor

The API adds things *beside* the editor's own tools; it does not change them. To change them, the editor's source has to be edited — `src/engineEditor.js` (2D, ~135KB) and `plugins/render3dEditor.js` (3D, ~165KB) in the engine repository, https://github.com/KilledByAPixel/LittleJS.

A modified copy of either file **cannot be loaded as an extra script next to the engine**: the debug build already contains the editor, and its top-level `let`/`const`/`class` declarations would be declared twice, which is a load error. The way that works:

1. Clone the engine repo at the tag matching the game's engine version (`engineVersion` in `dist/littlejs.js`).
2. Edit the editor file there. Its internals are functions named `editor...` and `editor3D...`.
3. `npm install`, then `npm run build`, and copy the built `dist/littlejs.js` over the game's copy.

The cost to state plainly to the user: the game now carries a private engine build, and every engine update means merging the change again. Internal `editor...` functions also change between versions. Offer the API route first, and fork only when the request really is about the built-in tools' behaviour.

## Verify

- The page loads the debug build, and Esc then `0` (or `levelEditor.open()`) shows the editor's panel.
- Every type the level uses is registered before `loadLevel()` runs — in 3D an object whose type is unknown is skipped with a console error.
- Place an object, press Esc to play, Esc to edit again, Ctrl+Z — the object is undone. Restart rebuilds the level with the edits.
- Reload the page — the autosaved edits come back.

## Using the bundled examples

`examples/editor2D.js` and `examples/editor3D.js` are the engine's demo "shorts": plain game code with no `engineInit` line and written for a 16-pixel tile sheet. To run one as a game, add `engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png'])` with empty functions for the callbacks it does not define, and either supply a tile sheet or, for the 3D one, delete its `voxels` block. Read them for structure; write the game's own level and types.
