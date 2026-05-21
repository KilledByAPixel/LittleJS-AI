---
name: iterate-sprite
description: Use when designing a LittleJS textureGenerator sprite — opens a 3x3 grid of paint(ctx) variations in a local browser, refines based on the user's click + text feedback, writes the accepted paint function into the target game's drawToTexture call. Best when the user says "make a sprite for X", "design art for tile N", "iterate on this character", or invokes /iterate-sprite directly.
---

# iterate-sprite

Drive an interactive sprite-design loop using a local browser grid. Each round you generate 9 different `paint(ctx)` functions for a 500x500 canvas (the textureGenerator tile size), the user clicks their favorite and optionally types steering feedback, you generate another round refined toward that feedback. On accept, you write the winning paint function into a target `games/*.html` file's `drawToTexture` call.

## When to invoke

- The user typed `/iterate-sprite`.
- The user is asking you to design or redesign a sprite for a LittleJS prototype that uses `textureGenerator`. Offer the skill conversationally: "Want me to use the iterate-sprite skill? It opens a 3×3 grid of variations in a browser." Only enter if they confirm.

## Args

The slash form accepts named args; missing values get asked conversationally:

- `target` — path to the game `.html` file (e.g., `games/robofight.html`). Required.
- `tile` — atlas tile index 0-15. Required.
- `desc` — sprite description (e.g., "robot enemy with chainsaw"). If empty, default to "a simple colored circle" as a placeholder so the user can see the loop work.

## Loop overview

```
Round 1: write 9 fresh paint(ctx) variations of `desc`
   ↓ tell user the URL, end turn
[user clicks a cell in browser (sends a `select` event),
 then comes back to chat and says what to do]
   ↓ next turn: read events file (latest select) + user message
If user wants more rounds:
  Round 2+: cell 1 = previous select's paint fn verbatim (the "champion")
            cells 2-9 = 8 fresh variations steered by user's text
If user wants to ship: write champion's paint fn into target file
If user wants to cancel: end without writing
```

**There is no Accept or Cancel button in the browser.** The only browser action is clicking a cell, which records a `select` event. All "ship / refine / cancel" decisions come from the user's chat message — the browser click only tells you WHICH cell they're talking about.
```

## Step-by-step

### Step 1: Gather args

Ensure you have `target`, `tile`, `desc`. Ask conversationally for anything missing. For an empty `desc`, default to `"a simple colored circle"` and tell the user.

Read the target file to understand its style and confirm whether the tile slot is already occupied:

```
Read tool: <target>
```

If a `drawToTexture(<tile>, ...)` call already exists, note the existing paint function name — you'll replace its body on accept. If not, you'll append a new call.

### Step 2: Create the session

Pick a unique session ID — Unix epoch in seconds is fine (`date +%s` in Bash, or any unique integer). Below and in every subsequent step, substitute your chosen ID wherever you see `<SESSION>`. Example: if you picked `1716290000`, the path `.claude/skills/iterate-sprite/sessions/<SESSION>/content/round-1.html` becomes `.claude/skills/iterate-sprite/sessions/1716290000/content/round-1.html`.

```bash
mkdir -p .claude/skills/iterate-sprite/sessions/<SESSION>/content
mkdir -p .claude/skills/iterate-sprite/sessions/<SESSION>/state
```

### Step 3: Start the server

Use the Bash tool with `run_in_background: true` (required so the server survives across conversation turns):

```bash
node .claude/skills/iterate-sprite/scripts/server.cjs \
    --session-dir .claude/skills/iterate-sprite/sessions/<SESSION> \
    --scripts-dir .claude/skills/iterate-sprite/scripts \
    --owner-pid $$
```

Wait a moment, then read the startup info:

```
Read tool: .claude/skills/iterate-sprite/sessions/<SESSION>/state/server-info
```

The JSON line contains `port` and `url`. Save them — you'll show the URL to the user every round.

### Step 4: Generate round 1

Write 9 paint functions named `paint1` through `paint9`. Each must be a complete, self-contained drawing of `desc` on a 500x500 canvas, drawn at (0,0) to (500,500).

**The variation rule (critical).** All 9 must be VISUALLY DIFFERENT. Different silhouettes, different proportions, different structural choices — not just palette swaps. A round where 9 cells look like the same sprite in 9 colors is a failed round; the user has nothing meaningful to pick between. Per the user's existing memory on this: give repeated sprites distinct silhouettes (kinds), not just color variation.

Examples of "different" for a robot enemy:
- humanoid biped vs. quadruped vs. spider vs. floating sphere vs. wheeled vs. tank
- chunky cube head vs. round dome vs. visor vs. antenna cluster vs. cyclops eye
- weapon variants: arm cannon, chainsaw, claw, shield, none

Pick 9 distinct concepts, then draw each. Keep each paint function tight (~30-60 lines). Prefer primitive shapes and gradients — match the style of `templates/textureGame.html`.

Use the **Read** tool once to load `.claude/skills/iterate-sprite/scripts/grid-template.html` for the structure, then use the **Write** tool to create a new file at `.claude/skills/iterate-sprite/sessions/<SESSION>/content/round-1.html`. **Never Edit the template itself** — it must stay as a reference for future sessions. Substitute the markers:

- `«description»` → `desc`
- `«N»` → `1`
- `«games/foo.html»` → `target`
- `«3»` → `tile`
- Replace the 9 placeholder paint functions with your real ones.
- Remove the `<div class="badge">Current pick</div>` from cell 1 (no champion in round 1).

Save to: `.claude/skills/iterate-sprite/sessions/<SESSION>/content/round-1.html`

### Step 5: Hand off to user

Tell them the URL from `server-info` and end the turn. Example:

> Round 1 is up at http://localhost:PORT — open that in your browser. Click your favorite cell to mark it. Then come back here and say what you want: "ship it" to commit that cell to the target, "more variations" (optionally with steering like "more cartoony" or "give them helmets") to refine in round 2, or "cancel" to abort.

### Step 6: Next turn — figure out intent

On your next turn, read the events file to find the most recent cell selection:

```
Read tool: .claude/skills/iterate-sprite/sessions/<SESSION>/state/events
```

Parse the JSON-lines. Take the **most recent `select` event** as the user's current pick. (The browser only ever emits `select` events — there are no `accept` or `cancel` events.)

Then read the user's chat message and classify their intent:

- **Ship / commit / accept** ("ship it", "looks good", "go with that one", "accept", "yes commit", "perfect") → go to Step 8 (write to target file).
- **Refine / iterate** ("more variations", "try X", "more like #3 but rounder", "different palette", "keep going", or just descriptive steering with no explicit verb) → go to Step 7 (next round).
- **Cancel** ("cancel", "nevermind", "drop it", "stop", "abort") → go to Step 9 (cleanup, no write).
- **The user named a cell in text but didn't click** (e.g., "I like #3, ship it") → use the named cell instead of the last select event.
- **Ambiguous** ("ok", "cool", "thanks") → ASK what they want. Don't guess between ship/refine.
- **No events file AND no clear intent in text** → ask if they had trouble opening the URL.

Browser clicks tell you WHICH cell. Chat text tells you WHAT TO DO with that cell. Both halves are needed.

### Step 7: Generate round N+1

First, extract the previous round's selected paint function verbatim. Read the previous round's HTML:

```
Read tool: .claude/skills/iterate-sprite/sessions/<SESSION>/content/round-<previous-N>.html
```

Find `function paint<selectedCell>(ctx) { ... }` in that file (where `<selectedCell>` is the cell number the user clicked, e.g. 5 for cell 5). Copy its body byte-for-byte. **Do not regenerate it from memory** — even small drift defeats the "champion stays put" contract the user is relying on.

In round N+1, emit that body as `function paint1(ctx) { ... }`. The old name (`paint<selectedCell>`) does NOT appear in round N+1 — only the renamed `paint1` carries forward.

Generate 8 NEW paint functions (`paint2` through `paint9`), steered by:

- The user's text feedback if any ("darker", "make them rounder", "try variants with hats", "throw out the legs, give them treads"). Apply the steering uniformly across all 8 — same direction, 8 different attempts at it.
- If no text feedback: continue refining around the champion. Vary one axis per cell (proportions, palette, details, pose, accessories) so the user can see what changes give them.

The variation rule still applies — 8 distinct attempts, not 8 minor tweaks.

Save to: `.claude/skills/iterate-sprite/sessions/<SESSION>/content/round-N.html` (next sequential number). Same template structure; cell 1 keeps the "Current pick" badge.

Tell the user the round number and end the turn. They'll click and reply again.

### Step 8: Accept — write to target file

**Use the Edit tool only — never Write — when modifying the target file.** Re-read the target if you don't already have its current full content. The `old_string` passed to Edit must be the exact existing function body so the diff is scoped to one definition only.

The accepted cell's paint function source is your output. Two cases:

**Case A — tile slot already exists in target.** The target contains something like:

```js
function paintRobot(ctx) { /* old body */ }
// ...
sprites.robot = drawToTexture(3, paintRobot, 'robot enemy');
```

Use the Edit tool to replace only the body of `paintRobot` with the new paint function's body. Keep the function name and the `drawToTexture` line intact. If `desc` changed materially from what's in the description string, update that too.

**Case B — tile slot does not exist.** Find `gameInit` in the target. Locate the cluster of existing `drawToTexture(...)` calls (or the spot where they'd go if there are none yet). Append:

```js
sprites.<name> = drawToTexture(<tile>, paint<Name>, '<desc>');
```

`<name>` is camelCase derived from `desc` ("robot enemy" → `robot`, function name `paintRobot`). Avoid name collisions — if `paintRobot` already exists in the file, suffix the new one with the tile index (`paintRobot3`).

Emit the new `paint<Name>` function above `gameInit`, adjacent to the other `paint*` functions in the file (or just before `gameInit` if there are none yet).

Show the user the diff with the Edit tool's natural output. Before proceeding to cleanup, re-read the target file once and confirm the new paint function body is in place AND the `drawToTexture(<tile>, ...)` call still references it correctly. If anything looks off, fix it now while the session evidence still exists.

### Step 9: Cleanup

After shipping (Step 8) or after the user cancelled:

```bash
rm -rf .claude/skills/iterate-sprite/sessions/<SESSION>
```

The server keeps running until its owner process exits or 30 minutes pass with no activity. Cleanup of the session dir does NOT signal the server — it will keep serving stale content from RAM until it idles out. If you want to kill it sooner, terminate the background bash shell that the Bash tool launched in Step 3 (the one started with `run_in_background: true`). `server-info` does not contain a PID — only `port`, `url`, and `session_dir`.

Tell the user what happened:
- Accept: "Wrote `paintRobot` into `games/robofight.html` at tile 3. Test it with `L` in the texture template, or run the game directly."
- Cancel: "Session cancelled. Nothing written."

## Round file gotchas

- `«description»` may contain quote characters — escape them when substituting into the HTML attribute and the `<title>` tag.
- Paint functions run inside an `IIFE` after `grid.js` loads. Don't use `return` at the top level. `ctx` is a 2D context with origin at (0,0), 500x500 drawable area, no clipping done for you (the cell is square so anything you draw outside (0,0)-(500,500) gets clipped by the canvas itself).
- Don't define helper globals like `Math.tau` or `PI` inside paint functions — the file has 9 in a row and they'd collide. Use locals inside each function.

## Visual style reference

Match the style of `templates/textureGame.html` when in doubt. It demonstrates: gradients, thick dark outlines, simple geometric primitives, recognizable silhouettes at small sizes.
