'use strict';

// Declarative HTML-based menus and corner toolbars for LittleJS games.
// Each createMenu() / createToolbar() call takes a config object and
// returns a handle for show/hide/toggle/getItem/destroy.
//
// Usage:
//   const m = createMenu({
//       id: 'pause', title: 'PAUSED', initialItemId: 'resume',
//       items: [
//           {type:'button', id:'resume', label:'RESUME', onClick: () => m.hide()},
//           {type:'toggle', id:'music',  label:'MUSIC',  value: true,
//                           onChange: v => setMusic(v)},
//       ],
//   });
//   m.show();
//   m.getItem('music').setValue(false);
//
//   const hud = createToolbar({
//       id:'hud', anchor:'top-right',
//       items:[ {type:'button', label:'☰', onClick: () => m.show()} ],
//   });
//
// Toolbar config: id, anchor ('top-right' default | 'top-left' | 'bottom-*'),
//   direction ('horizontal' default | 'vertical'), landscapeStack (default
//   false — opt in to flip a horizontal toolbar to a vertical stack in
//   landscape only; corner item stays in its corner), items.
//
// Item types:  label, text (wrapping paragraph), separator, button, toggle,
//              slider, checkbox, color (HTML5 picker), input (text field;
//              arrow/Enter/Space are passed to the field while focused),
//              grid (optional per-cell onClick + 2D nav), custom
//              (focusable: true to opt in).
// Tooltips:    pass `title:'...'` on any item; grids fall back to label.
//
// Per-item flags (any item type unless noted):
//   onUpdate(el)        — fires per frame while the parent menu is visible.
//                         Live counters, animated labels, custom DOM.
//   persist:'storeKey'  — slider/toggle/checkbox/color/input only. Auto-
//                         loads from localStorage on init, auto-saves on
//                         change. onChange ALSO fires once at init via a
//                         microtask so consumer effects (setSoundVolume,
//                         etc.) apply the persisted value.
// Per-item flag (works on menu items AND toolbar items):
//   hideOnTouch:true    — auto-hide on touch devices. For fullscreen /
//                         music style items that don't make sense there.
//
// Sub-menu nav:    pushMenu(id), popMenu (wire as child's onHide which
//                  receives reason='push'|'dismiss'), clearSubmenuStack
//                  (e.g. for QUIT-to-title flows).
// Title reveal:    attachClickToReveal(menuId, canReveal?) installs a
//                  pointerdown/Space/Enter/A/Start listener that shows
//                  the named menu when the user interacts with the canvas.
//                  Predicate gates reveal on game state (e.g.
//                  () => onTitleScreen). Works for mouse, touch, keyboard,
//                  AND gamepad.
// Title shortcut:  createTitleMenu({title, subtitle, onPlay, items,
//                  canReveal}) wraps createMenu + a PLAY button +
//                  attachClickToReveal in one call for the standard title
//                  pattern. Auto-wires PLAY's onClick to gamepad Start.
// Title FX:        titleFx on createMenu / createTitleMenu (and the dialog
//                  helpers) juices a heading. String = one effect by name
//                  ('neon', 'float', 'sparkle'); object composes channels:
//                  {fill, motion, sparkle, hue, invert, speed, color}.
//                  Fills: neon rainbow shine fire gold outline hardshadow 3d
//                  glitch crt. Motion: wave heartbeat jelly float. Tweaks:
//                  hue(deg) invert speed(x) color shadow(hardshadow offset
//                  color) size(em) spacing(letter-spacing em). Effects
//                  auto-tear-down on hide so sparkle timers never leak.
//                  showGameOverDialog defaults to gold (win) / red glow
//                  (loss); override with titleFx, disable with titleFx:null.
//                  Menu label/text items accept the same spec via `fx:`.
//                  Powered by applyMenuFx(el, spec) which any consumer can
//                  call on its own element.
// Theme:           setMenuTheme({bg, fg, accent, border, itemBg, itemHoverBg,
//                  backdrop, disabled, subtitleColor, borderWidth, radius,
//                  font}) sets the matching --menu-* CSS vars on
//                  #littlejs-menus from JS (no <style> block). Only passed
//                  keys change; numbers for borderWidth/radius get px. Or pass
//                  a preset NAME + optional overrides: setMenuTheme('neon',
//                  {accent:'#f0a'}) — presets: neon casino felt retro arcade
//                  mono. Call once per game; safe before any menu exists.
// Entrance anim:   menus fade+scale in on show (~.18s). setMenuAnimations(b)
//                  toggles it (options checkbox); off under reduced-motion.
// PLAY/btn glow:   createTitleMenu({playGlow:true}) pulses the PLAY button in
//                  the accent; any button item takes glow:true.
// Pause hotkey:    bindPauseKey({menuId, when}) — call from gameUpdate each
//                  frame. Surfaces 'pause' menu on Esc / gamepad Start,
//                  plays the activate sound, clears the press. Returns true
//                  if it triggered so callers can `if (...) return;`.
// Per-menu hook:   `onStart` (createMenu) runs when gamepad Start is
//                  pressed instead of the default dismiss-on-Start.
//                  Useful for title screens where Start should launch
//                  the game.
// One-shot modals: showAlertDialog({message, title, icon, onOk, okLabel}),
//                  showConfirmDialog({message, title, icon, onYes, onNo,
//                                     yesLabel, noLabel}).
// Toasts:          showMenuToast({icon, title, text, duration, position}) —
//                  DOM notification in any corner (top-left default), queued.
//                  MenuMedal (extends LittleJS Medal) auto-toasts on unlock().
// Orientation:     setOrientationLock('landscape'|'portrait', {icon, title,
//                  text}) — on touch devices held the wrong way, shows a
//                  full-screen "rotate your device" overlay above everything
//                  and pauses the game (folds into the visibility/pause hook).
//                  Off by default; setOrientationLock(false) clears it.
// Lookups:         getMenu(id), getToolbar(id), getTopMenu(),
//                  isMenuVisible(), showMenu(id), hideMenu(id),
//                  hideAllMenus().
// Demo mode:       isDemoMode() — true when loaded with `#demo` in the URL
//                  (the arcade launcher's hero cabinet). All menu chrome is
//                  auto-hidden so the game runs menu-less as a live attract;
//                  games can also branch on it (e.g. AI-vs-AI vs static board).
//
// Lifecycle hook: setMenuVisibilityCallback(v => paused = v) — fires once
// per show/hide for ALL menus including dialogs. Use this for paused-
// tracking; per-menu onShow/onHide are reserved for menu-specific logic.
//
// Shortcut: installAutoPause(predicate?) — wires the engine's `paused`
// global to menu visibility. Most games just want
//     installAutoPause(() => isPlaying);
// so the title menu can sit interactively over an animated backdrop while
// any in-game menu (pause/dialog) freezes gameplay. Without a predicate,
// `paused = isMenuVisible()` (pauses for every menu, title included).
// Uses an internal listener so the game's setMenuVisibilityCallback is
// still available for custom one-off needs.
//
// Default toolbar: installDefaultToolbar({mute, fullscreen, pauseMenuId,
//                                         titleMenuId, titleDismissable,
//                                         extraItemsBefore, extraItemsAfter})
// Builds the standard top-right HUD toolbar in one call: optional mute
// (toggles & persists soundVolume), optional fullscreen (auto-hidden on
// touch), and a hamburger ☰ that opens the pause menu (and grays out
// while the title menu is on top, unless titleDismissable). Toolbar is
// always visible — no per-game show/hide wiring needed.
//
// Standard pause + options menus:
//   createPauseMenu({onRestart, onQuit, extraItems, confirmQuit})
//   createOptionsMenu({volume, extraItems, persistKey})
// Stamp out the RESUME/RESTART/extras/QUIT-TO-TITLE pause shape every game
// hand-rolls, and an OPTIONS menu with a volume slider that syncs with
// the toolbar's mute button.
//
// Mute API: isMenuMuted(), setMenuMuted(bool), toggleMenuMuted(). Single
// shared mute state across the toolbar button and any volume slider.
//
// Inputs: mouse/touch always; keyboard (arrows/Enter/Esc, with arrow
// auto-repeat) and gamepad (d-pad/stick/A/B/Start) handled automatically
// when a menu is visible. Selection only auto-shows for keyboard/gamepad
// modality so pointer-mode opens don't drag a stale outline around.
// Toolbars are pointer-only.
//
// `dismissable: false` (createMenu) suppresses Esc / gamepad B / gamepad
// Start / backdrop click — useful for title screens (clicking off
// shouldn't start the game) and confirm dialogs (force an explicit
// Yes/No choice). Default is `true`.
//
// Sounds: setMenuSounds({select, activate}) wires global UI sounds.
// `select` fires on keyboard/gamepad nav; `activate` on click / Enter / A.
// playMenuSound('activate') lets game code (e.g. Esc -> showMenu('pause'))
// trigger the same sound as a toolbar-button-driven open. Default zzfx
// select/activate tones are installed automatically on first createMenu
// — call setMenuSounds() with your own handlers to override, or
// setMenuSounds(null) to silence the menu UI entirely.
//
// Theming: every color, font, size and spacing is a CSS variable on
// #littlejs-menus. Override any of them in your own <style>:
//   #littlejs-menus {
//       --menu-bg:           rgba(20, 0, 30, 0.95);
//       --menu-accent:       #f0a;
//       --menu-font:         sans-serif;   /* font everywhere */
//       --menu-border-width: 4px;
//   }
// `--menu-font` controls every text element in the menu system (titles,
// items, buttons, toolbar icons, toasts) — it's the only knob you need
// to touch to set a custom font. Per-menu CSS via the `data-menu-id` /
// `data-item-id` attributes that panels and items carry from cfg.id:
//   #littlejs-menus .ljs-menu-panel[data-menu-id="title"] { top: 65%; }
//   #littlejs-menus .ljs-menu-item[data-item-id="hi"] { color: #ff0; }
// See injectStyles() below for the full list of variables.
//
// ----------------------------------------------------------------------------
// Audio integration (LittleJS Sound + setMenuSounds)
// ----------------------------------------------------------------------------
//
// menus.js doesn't know how to play sounds itself — wire it via setMenuSounds
// once in gameInit. The shape:
//
//   const sound_select   = new Sound([.5,,910,,,.02,2,...]);   // zzfx params
//   const sound_activate = new Sound([.7,,30,.01,,.02,1,...]);
//   setMenuSounds({
//       select:   () => sound_select.play(),
//       activate: () => sound_activate.play(),
//   });
//
// Wrapping zzfx params with `new Sound(...)` and calling `.play()` from the
// hook (rather than calling zzfx() directly) routes the audio through the
// engine's audio graph — so the master volume slider, the engine's mute
// state, and the user-gesture-required-before-audio gating all just work.
//
// `select` fires on keyboard / d-pad nav; `activate` fires on click / Enter
// / A. Toolbar buttons play `activate` automatically. Game code that opens
// a menu without going through a focusable item (e.g. Esc -> showMenu(
// 'pause')) should call `playMenuSound('activate')` so the open feels the
// same as a toolbar-button-driven open.
//
// Persistent volume slider:
//   {type:'slider', id:'volume', persist:'volume', value: 0.8,
//    min:0, max:1, onChange: v => setSoundVolume(v)}
// On reload, persist re-applies the saved value via onChange before any
// menu sound has a chance to play, so the very first nav sound is at the
// user-visible volume.
//
// MenuMedal extends LittleJS's Medal so unlocks fire a DOM toast (top-left)
// instead of the engine's canvas overlay. Same `medalsInit('SaveName')`
// call, same `medals[id]` map — just a different display path.

// ============================================================================
// Title / heading FX (titleFx). See applyMenuFx below. Channel model:
//   fill    one of MENU_FX_FILL   (color/shadow/gradient look)
//   motion  one of MENU_FX_MOTION (transform; wrapped or per-letter for wave)
//   sparkle boolean overlay (particle layer)
//   tweaks  hue (deg), invert (bool), speed (multiplier), color (override)
// A bare string is shorthand for its channel: 'neon' -> {fill:'neon'},
// 'float' -> {motion:'float'}, 'sparkle' -> {sparkle:true}.
// ============================================================================
const MENU_FX_FILL = ['neon','rainbow','shine','fire','gold','outline','hardshadow','3d','glitch','crt'];
const MENU_FX_MOTION = ['wave','heartbeat','jelly','float'];
// NOTE: every motion uses an outer `.m-<name>` wrapper EXCEPT `wave`, which is
// per-letter and applied as `.fx-wave` on the heading itself — applyMenuFx
// special-cases it.
const MENU_FX_CHANNEL = {};
for (const n of MENU_FX_FILL) MENU_FX_CHANNEL[n] = 'fill';
for (const n of MENU_FX_MOTION) MENU_FX_CHANNEL[n] = 'motion';
MENU_FX_CHANNEL['sparkle'] = 'overlay';

function normalizeFxSpec(spec)
{
    if (!spec) return null;
    if (typeof spec === 'string')
    {
        const ch = MENU_FX_CHANNEL[spec];
        if (!ch) { console.warn('applyMenuFx: unknown effect "' + spec + '"'); return null; }
        if (ch === 'overlay') return { sparkle: true };
        const out = {}; out[ch] = spec; return out;
    }
    return spec;
}

// Apply a (normalized or string) FX spec to a DOM text element. Returns an
// idempotent teardown fn that fully reverses every change (classes, wrapper,
// letter-split, sparkle timer, inline styles). Safe to call teardown twice.
function applyMenuFx(element, spec)
{
    spec = normalizeFxSpec(spec);
    if (!element || !spec) return () => {};

    const teardowns = [];
    const target = element;   // fill classes / tweaks / sparkle land here

    // ---- tweaks: speed + color custom props, hue/invert as a filter ----
    if (typeof spec.speed === 'number' && spec.speed > 0)
    {
        const prevSpeed = target.style.getPropertyValue('--fx-speed');
        target.style.setProperty('--fx-speed', spec.speed);
        teardowns.push(() => prevSpeed
            ? target.style.setProperty('--fx-speed', prevSpeed)
            : target.style.removeProperty('--fx-speed'));
    }
    else if (typeof spec.speed === 'number')
        console.warn('applyMenuFx: speed must be > 0 (got ' + spec.speed + '); ignoring.');
    if (spec.color)
    {
        const prevColor = target.style.getPropertyValue('--fx-color');
        target.style.setProperty('--fx-color', spec.color);
        teardowns.push(() => prevColor
            ? target.style.setProperty('--fx-color', prevColor)
            : target.style.removeProperty('--fx-color'));
    }
    // Secondary color (--fx-color2): the hardshadow offset color.
    if (spec.shadow)
    {
        const prevShadow = target.style.getPropertyValue('--fx-color2');
        target.style.setProperty('--fx-color2', spec.shadow);
        teardowns.push(() => prevShadow
            ? target.style.setProperty('--fx-color2', prevShadow)
            : target.style.removeProperty('--fx-color2'));
    }
    // Typography: size (font-size) and spacing (letter-spacing). A number is
    // treated as em; pass a string for explicit units.
    if (spec.size != null)
    {
        const prevSize = target.style.fontSize;
        target.style.fontSize = (typeof spec.size === 'number') ? spec.size + 'em' : spec.size;
        teardowns.push(() => { target.style.fontSize = prevSize; });
    }
    if (spec.spacing != null)
    {
        const prevSpacing = target.style.letterSpacing;
        target.style.letterSpacing = (typeof spec.spacing === 'number') ? spec.spacing + 'em' : spec.spacing;
        teardowns.push(() => { target.style.letterSpacing = prevSpacing; });
    }
    const filters = [];
    if (typeof spec.hue === 'number') filters.push('hue-rotate(' + spec.hue + 'deg)');
    if (spec.invert) filters.push('invert(1)');
    if (filters.length)
    {
        const prevFilter = target.style.filter;
        target.style.filter = (prevFilter ? prevFilter + ' ' : '') + filters.join(' ');
        teardowns.push(() => { target.style.filter = prevFilter; });
    }

    // ---- fill ----
    const fill = (spec.fill && MENU_FX_CHANNEL[spec.fill] === 'fill') ? spec.fill : null;
    if (spec.fill && !fill) console.warn('applyMenuFx: unknown fill "' + spec.fill + '"');
    if (fill)
    {
        const cls = 'fx-' + fill;
        target.classList.add(cls);
        teardowns.push(() => target.classList.remove(cls));
    }

    // ---- motion ----
    const motion = (spec.motion && MENU_FX_CHANNEL[spec.motion] === 'motion') ? spec.motion : null;
    if (spec.motion && !motion) console.warn('applyMenuFx: unknown motion "' + spec.motion + '"');
    const fillIsGradient = fill && ['gold','rainbow','shine','fire'].includes(fill);
    if (motion === 'wave' && fillIsGradient)
    {
        // wave splits the title into per-letter spans, which breaks a gradient
        // (background-clip:text) fill — the parent keeps the gradient but loses
        // its text, so nothing renders. Keep the fill, skip the wave, and point
        // the developer at a wrapper motion that moves the title as one piece.
        console.warn('applyMenuFx: "wave" cannot combine with gradient fill "' + fill + '" (the title would vanish) — use motion float/heartbeat/jelly instead. Skipping wave.');
    }
    else if (motion === 'wave')
    {
        // per-letter on the fill element
        target.classList.add('fx-wave');
        const original = target.textContent;
        const frag = document.createDocumentFragment();
        [...original].forEach((ch, i) => {
            const s = document.createElement('span');
            s.textContent = ch;
            s.style.animationDelay = (i * 0.09) + 's';
            frag.appendChild(s);
        });
        target.textContent = '';
        target.appendChild(frag);
        teardowns.push(() => { target.classList.remove('fx-wave'); target.textContent = original; });
    }
    else if (motion)
    {
        // wrap in an outer transform element (takes the element's place)
        const wrap = document.createElement('div');
        wrap.className = 'm-' + motion;
        if (element.parentNode)
        {
            element.parentNode.insertBefore(wrap, element);
            wrap.appendChild(element);
            teardowns.push(() => {
                if (wrap.parentNode) { wrap.parentNode.insertBefore(element, wrap); wrap.remove(); }
            });
        }
        else console.warn('applyMenuFx: element not in DOM; "' + motion + '" motion skipped');
    }

    // ---- sparkle overlay ----
    if (spec.sparkle)
    {
        target.classList.add('ov-sparkle');
        const timer = setInterval(() => {
            const s = document.createElement('span');
            s.className = 'ljs-fx-spark';
            s.style.left = (Math.random() * 100) + '%';
            s.style.top = (Math.random() * 100) + '%';
            target.appendChild(s);
            setTimeout(() => s.remove(), 900);
        }, 160);
        teardowns.push(() => {
            clearInterval(timer);
            target.classList.remove('ov-sparkle');
            target.querySelectorAll('.ljs-fx-spark').forEach(s => s.remove());
        });
    }

    return () => { while (teardowns.length) teardowns.pop()(); };
}

// ============================================================================
// Theme helper — set the menu skin from JS instead of a CSS <style> block.
// Each friendly key maps to a --menu-* custom property on #littlejs-menus.
// Only the keys you pass change; everything else keeps its default. Numbers
// for borderWidth/radius get 'px' appended; pass a string for other units.
// Safe to call before any menu exists (it inits the root). Global per game.
//   setMenuTheme({ bg:'#102', accent:'#f0a', radius:16, borderWidth:3 });
// ============================================================================
const MENU_THEME_VARS = {
    bg:          '--menu-bg',
    fg:          '--menu-fg',
    accent:      '--menu-accent',
    border:      '--menu-border-color',
    itemBg:      '--menu-item-bg',
    itemHoverBg: '--menu-item-hover-bg',
    backdrop:    '--menu-backdrop',
    disabled:    '--menu-disabled',
    subtitleColor: '--menu-subtitle-color',
    borderWidth: '--menu-border-width',
    radius:      '--menu-radius',
    font:        '--menu-font',
};
const MENU_THEME_PX = { borderWidth: 1, radius: 1 };   // keys whose numbers get 'px'

// Named presets — pass the name as the first arg, optionally with an override
// object: setMenuTheme('neon', {accent:'#f0a'}). Presets are a tuned starting
// point; the override object wins.
const MENU_THEME_PRESETS = {
    neon:   { accent:'#33e0ff', bg:'rgba(8,10,20,.9)',  borderWidth:3, radius:10 },
    casino: { accent:'#ffd700', bg:'rgba(22,8,0,.93)',  borderWidth:2, radius:6 },
    felt:   { accent:'#33cc66', bg:'rgba(8,22,14,.93)', borderWidth:2, radius:8 },
    retro:  { accent:'#46d846', bg:'rgba(0,0,0,.9)',    borderWidth:2, radius:0, font:'monospace' },
    arcade: { accent:'#ff2aa8', bg:'rgba(10,6,18,.92)', borderWidth:3, radius:8 },
    mono:   { accent:'#cccccc', bg:'rgba(0,0,0,.85)',   borderWidth:2, radius:4 },
};

function setMenuTheme(theme, overrides)
{
    // String first arg = preset name; merge with any override object.
    if (typeof theme === 'string')
    {
        const preset = MENU_THEME_PRESETS[theme];
        if (!preset) { console.warn('setMenuTheme: unknown preset "' + theme + '"'); return; }
        theme = Object.assign({}, preset, overrides);
    }
    if (!theme) return;
    initMenuSystem();
    for (const key in theme)
    {
        if (theme[key] === undefined) continue;
        const cssVar = MENU_THEME_VARS[key];
        if (!cssVar) { console.warn('setMenuTheme: unknown key "' + key + '"'); continue; }
        let value = theme[key];
        if (typeof value === 'number') value = value + (MENU_THEME_PX[key] ? 'px' : '');
        menuSystemRoot.style.setProperty(cssVar, value);
    }
}

// Toggle the menu entrance fade/scale globally (e.g. an options checkbox).
function setMenuAnimations(on)
{
    initMenuSystem();
    if (on === false) menuSystemRoot.style.setProperty('--menu-anim-time', '0s');
    else menuSystemRoot.style.removeProperty('--menu-anim-time');
}

function createMenu(config)
{
    initMenuSystem();

    const cfg = Object.assign({
        id:            null,
        titleFx:       null,    // string | {fill,motion,sparkle,hue,invert,speed,color}
        title:         null,
        backdrop:      true,
        dismissable:   true,
        initialItemId: null,    // id of focusable item to select on show; falls back to first
        onShow:        null,
        onHide:        null,
        items:         [],
    }, config);

    // backdrop element (one per menu so per-menu visibility is independent)
    const backdrop = document.createElement('div');
    backdrop.className = 'ljs-menu-backdrop';
    menuSystemRoot.appendChild(backdrop);

    // panel element. data-menu-id mirrors cfg.id so consumers can target a
    // specific panel from CSS (e.g. shift the title-screen menu off-center
    // without affecting other menus): `.ljs-menu-panel[data-menu-id="title"]`
    const panel = document.createElement('div');
    panel.className = 'ljs-menu-panel';
    if (cfg.id) panel.dataset.menuId = cfg.id;
    menuSystemRoot.appendChild(panel);

    let titleEl = null;
    if (cfg.title)
    {
        titleEl = document.createElement('div');
        titleEl.className = 'ljs-menu-title';
        titleEl.textContent = cfg.title;
        panel.appendChild(titleEl);
    }
    // Optional subtitle below the title — small, all-caps-ish, hugs tight to
    // the title above. Useful for "TITLE / Tagline" pairings.
    if (cfg.subtitle)
    {
        const s = document.createElement('div');
        s.className = 'ljs-menu-subtitle';
        s.textContent = cfg.subtitle;
        panel.appendChild(s);
    }

    const itemHandles = {};
    const itemList = [];
    for (const item of cfg.items)
    {
        const built = buildMenuItem(item);
        if (!built) continue;
        built.itemId = item.id || null;
        // Mirror cfg.id onto the panel via data-menu-id and item.id onto the
        // item el via data-item-id, so consumers can target individual items
        // from CSS without poking handle internals:
        //   .ljs-menu-panel[data-menu-id="title"]
        //     .ljs-menu-item[data-item-id="highScore"] { color: yellow; }
        if (item.id) built.el.dataset.itemId = item.id;
        // onUpdate(el) on any item — fires per frame while the parent
        // menu is visible and this item isn't setVisible(false). Useful
        // for live-counting labels, animated custom elements, etc.
        if (item.onUpdate) built.onUpdate = item.onUpdate;
        if (item.fx) built.fx = item.fx;   // FX spec applied on show, torn down on hide
        if (item.glow) built.el.classList.add('ljs-glow');   // pulsing accent highlight
        panel.appendChild(built.el);
        itemList.push(built);
        if (item.id) itemHandles[item.id] = built.handle;
        // hideOnTouch: same convenience flag toolbar items have. Useful for
        // FULLSCREEN buttons (mobile browsers' fullscreen story is messy)
        // and similar mouse-keyboard-only menu items.
        if (item.hideOnTouch && isTouchDevice) built.handle.setVisible(false);
    }

    let visible = false;
    // FX teardowns for the title + any item with `fx:`. Applied on show,
    // reversed on hide so sparkle timers never run while a menu is hidden.
    const fxTeardowns = [];
    const applyFx = () => {
        if (titleEl && cfg.titleFx) fxTeardowns.push(applyMenuFx(titleEl, cfg.titleFx));
        for (const it of itemList) if (it.fx) fxTeardowns.push(applyMenuFx(it.el, it.fx));
    };
    const teardownFx = () => { while (fxTeardowns.length) fxTeardowns.pop()(); };
    const handle = {
        id: cfg.id,
        show()
        {
            if (visible) return;
            visible = true;
            if (cfg.backdrop) backdrop.classList.add('visible');
            panel.classList.add('visible');
            if (!fxTeardowns.length) applyFx();
            allMenus.push(handle);
            // Auto-select on show only when the user is actively in keyboard
            // or gamepad mode. Pointer mode opens with no selection so the
            // outline doesn't follow the cursor around — the first keyboard
            // or d-pad press will then select the initial item.
            if (inputModality !== 'pointer')
            {
                const targets = focusableItems(handle);
                let pick = null;
                if (cfg.initialItemId)
                    pick = targets.find(t => t.item.itemId === cfg.initialItemId);
                if (!pick) pick = targets[0];
                if (pick) setSelected(pick.focusEl);
            }
            if (cfg.onShow) cfg.onShow();
            fireMenuVisibility();
        },
        // `reason` distinguishes the "user explicitly dismissed me" path
        // (Esc / B / backdrop / explicit hideMenu) from "I'm being hidden
        // so a sub-menu can take over" (pushMenu calls hide('push')).
        // Defaults to 'dismiss' so existing callers see the user-driven
        // case. onHide(reason) can branch on it — see pinball's title menu
        // for the canonical example (don't reset titleMenuRevealed on push).
        hide(reason)
        {
            if (!visible) return;
            visible = false;
            clearSelected();    // Clear outline when menu closes
            backdrop.classList.remove('visible');
            panel.classList.remove('visible');
            teardownFx();
            const i = allMenus.indexOf(handle);
            if (i >= 0) allMenus.splice(i, 1);
            if (cfg.onHide) cfg.onHide(reason || 'dismiss');
            fireMenuVisibility();
        },
        toggle() { visible ? handle.hide() : handle.show(); },
        isVisible() { return visible; },
        getItem(id) { return itemHandles[id]; },
        // The .ljs-menu-title element rendered from cfg.title (or null if
        // cfg.title was omitted). Exposed so consumers can drive per-frame
        // animation on it via the menu-level onUpdate hook — animating
        // text-shadow with CSS @keyframes can flicker on high-DPR mobile
        // displays; a JS-driven path that sets el.style each frame stays
        // smooth (same pattern works fine for custom-item onUpdate).
        getTitleEl() { return titleEl; },
        // Live-swap the title FX (e.g. the menu designer). Updates cfg so the
        // new spec persists across show/hide, and re-applies immediately if
        // the menu is currently visible.
        setTitleFx(spec)
        {
            cfg.titleFx = spec;
            if (visible) { teardownFx(); applyFx(); }
        },
        getTitleFx() { return cfg.titleFx; },
        destroy()
        {
            if (cfg.id && menusById[cfg.id] === handle) delete menusById[cfg.id];
            handle.hide();
            backdrop.remove();
            panel.remove();
        },
        // internal access for plugin update
        _items: itemList,
        _panel: panel,
        _cfg: cfg,
        _backdrop: backdrop,
    };

    // backdrop click -> dismiss (only if dismissable)
    backdrop.addEventListener('click', () =>
    {
        if (cfg.dismissable) handle.hide();
    });

    if (cfg.id) menusById[cfg.id] = handle;
    return handle;
}

// ============================================================================
// Title-menu helper.
// ============================================================================
//
// Shortcut for the "title screen with a PLAY button, gamepad Start launches
// PLAY, first-click reveals the menu" pattern that nearly every game wants.
// Bundles createMenu + attachClickToReveal into one call.
//
//   createTitleMenu({
//       title:    'SNAKE',
//       subtitle: 'Eat. Avoid walls. Do not die.',
//       onPlay:   () => { resetGame(); isPlaying = true; },
//       canReveal: () => !isPlaying,    // gates first-click reveal
//       itemsBefore: [                  // optional, rendered ABOVE PLAY
//           {type:'label', id:'bestLabel', text:'Best: 0'},
//       ],
//       items: [                        // rendered AFTER PLAY
//           {type:'button', label:'OPTIONS', onClick: () => pushMenu('options')},
//           {type:'button', label:'HELP',    onClick: () => pushMenu('help')},
//       ],
//   });
//
// The menu is created with id:'title' (override via `id`), dismissable:false
// (clicking off shouldn't start the game), the PLAY button id:'play', and
// `onStart` wired so gamepad Start also fires onPlay. The menu auto-hides
// itself after onPlay runs, so consumers don't repeat hideMenu(id) inside
// every onPlay. Item order in the menu is:
//   subtitle → itemsBefore → PLAY → items
//
// `canReveal` is strongly recommended: without it, clicks during gameplay
// would re-show the title. Set `revealOnClick: false` to opt out of the
// click-to-reveal listener entirely — e.g. if you want to showMenu('title')
// manually from gameInit, or have a custom intro animation.
function createTitleMenu(config)
{
    const cfg = Object.assign({
        id:            'title',
        title:         '',
        subtitle:      '',
        titleFx:       null,
        onPlay:        null,
        playLabel:     'PLAY',
        playGlow:      false,    // pulse the PLAY button with an accent glow
        itemsBefore:   [],
        items:         [],
        revealOnClick: true,
        canReveal:     null,
        onShow:        null,
        onHide:        null,
        showBest:      false,
        formatBest:    null,           // n => string; defaults to 'Best: ' + n
    }, config);

    // run user onPlay first, then auto-hide so consumers don't have to call
    // hideMenu(id) themselves in every play handler
    const playFn = () =>
    {
        if (cfg.onPlay) cfg.onPlay();
        hideMenu(cfg.id);
    };

    const bestId = 'bestLabel';
    const fmtBest = cfg.formatBest || (n => 'Best: ' + n);

    const itemsBefore = cfg.showBest
        ? [...cfg.itemsBefore, {type:'label', id: bestId, text: fmtBest(getBestScore())}]
        : cfg.itemsBefore;

    // Chain caller-supplied onShow with the Best-label auto-refresh.
    const onShow = (cfg.showBest || cfg.onShow) ? () => {
        if (cfg.onShow) cfg.onShow();
        if (cfg.showBest) {
            const m = getMenu(cfg.id);
            const lbl = m && m.getItem(bestId);
            if (lbl) lbl.setLabel(fmtBest(getBestScore()));
        }
    } : null;

    const menu = createMenu({
        id:           cfg.id,
        title:        cfg.title,
        subtitle:     cfg.subtitle,
        titleFx:      cfg.titleFx,
        dismissable:  false,
        onStart:      playFn,
        onShow,
        onHide:       cfg.onHide,
        items: [
            ...itemsBefore,
            {type:'button', id:'play', label: cfg.playLabel, onClick: playFn, glow: cfg.playGlow},
            ...cfg.items,
        ],
    });

    if (cfg.revealOnClick)
        attachClickToReveal(cfg.id, cfg.canReveal);

    return menu;
}

function createToolbar(config)
{
    initMenuSystem();

    const cfg = Object.assign({
        id:        null,
        anchor:    'top-right',
        direction: 'horizontal',
        // landscapeStack: opt-in responsive flip. When true, a normally
        // horizontal toolbar stacks vertically in landscape orientation
        // (where the canvas is letterboxed with room in the side gutter)
        // and stays horizontal in portrait. The corner item (e.g. the
        // hamburger) stays pinned to its corner — see the CSS rules. No-op
        // on toolbars built with direction:'vertical'.
        landscapeStack: false,
        items:     [],
    }, config);

    const el = document.createElement('div');
    el.className = 'ljs-menu-toolbar anchor-' + cfg.anchor + ' dir-' + cfg.direction;
    if (cfg.landscapeStack) el.classList.add('ljs-toolbar-landscape-stack');
    el.classList.add('ljs-hidden');              // start hidden; user calls show()
    menuSystemRoot.appendChild(el);

    const itemHandles = {};
    for (const item of cfg.items)
    {
        const built = item.type === 'toggle'
            ? buildToolbarToggle(item)
            : buildToolbarButton(item);
        if (!built) continue;
        el.appendChild(built.el);
        if (item.id) itemHandles[item.id] = built.handle;
        // hideOnTouch: convenience flag for fullscreen / music style buttons
        // that don't make sense on touch (mute via OS, already-fullscreen).
        // Equivalent to calling getItem(id).setVisible(false) post-construction.
        if (item.hideOnTouch && isTouchDevice) built.handle.setVisible(false);
    }

    let visible = false;
    const handle = {
        id: cfg.id,
        show()       { visible = true; el.classList.remove('ljs-hidden'); },
        hide()       { visible = false; el.classList.add('ljs-hidden'); },
        toggle()     { visible ? handle.hide() : handle.show(); },
        isVisible()  { return visible; },
        getItem(id)  { return itemHandles[id]; },
        destroy()    { el.remove(); },
    };
    allToolbars.push(handle);
    return handle;
}

// ============================================================================
// Default HUD toolbar — the standard mute / fullscreen / hamburger set.
// ============================================================================
//
// One-call replacement for the createToolbar boilerplate every game was
// hand-rolling. Builds a top-right toolbar that stays visible at all times
// (including over the title menu). Defaults: mute + fullscreen + hamburger.
//
//   installDefaultToolbar();                       // most games
//   installDefaultToolbar({mute: false});          // sound-driven games
//   installDefaultToolbar({titleDismissable: true}); // fancy title screens
//
// Mute toggles `soundVolume` (LittleJS global) between 0 and the last
// non-zero value; state persists site-wide in the `littlejs.global` save
// blob (see the Unified save data section). Pass `mute: false` to skip
// the button entirely — sequencer-style games where muting makes no sense.
//
// Hamburger opens the configured pause menu. When the title menu is on
// top, the hamburger grays out (browser-disabled), since a player can't
// usefully "open the menu" from the menu they're already in. Set
// `titleDismissable: true` if your title has a backdrop worth seeing and
// you want clicking ☰ to dismiss the title.
//
// `extraItemsBefore` / `extraItemsAfter` accept the same item descriptors
// as createToolbar (button, toggle, etc.), inserted at the left or right
// of the default trio. Anchor is top-right so the LAST item sits in the
// corner; the hamburger is always the last item.
//
// Custom hamburger behavior: pass `onHamburger: () => {...}` to override
// the default open-pause / close-current behavior — useful for games whose
// "menu" action is something other than a pause menu (e.g. miniGolf's
// back-to-hole-select). Pair with `grayedWhen: () => <predicate>` for a
// custom grayed-state check (overrides the default title-on-top check);
// when the underlying state changes, call `refreshDefaultToolbar()` to
// re-evaluate the grayed state.
function installDefaultToolbar(opts)
{
    opts = Object.assign({
        id:               'hud',
        anchor:           'top-right',
        direction:        'horizontal',
        landscapeStack:   false,  // stack vertically in landscape (see createToolbar)
        mute:             true,
        fullscreen:       true,
        panelButton:      true,   // grid library button — touch + in-launcher only
        pauseMenuId:      'pause',
        titleMenuId:      'title',
        titleDismissable: false,
        extraItemsBefore: [],
        extraItemsAfter:  [],
        onHamburger:      null,   // override default click behavior
        grayedWhen:       null,   // override default grayed-state predicate
    }, opts || {});

    const items = [];
    items.push(...opts.extraItemsBefore);

    if (opts.mute)
    {
        // Mute state is shared module-level — see isMenuMuted / setMenuMuted /
        // toggleMenuMuted. The options-menu volume slider syncs with it too.
        const muted = isMenuMuted();
        items.push({
            type: 'button',
            id:   'mute',
            label: buildSvgIcon(muted ? 'volume-off' : 'volume-on'),
            title: muted ? 'Unmute' : 'Mute',
            onClick: toggleMenuMuted,
        });
    }

    if (opts.fullscreen)
    {
        items.push({
            type: 'button',
            id:   'fs',
            label: buildSvgIcon('fullscreen'),
            title: 'Toggle fullscreen',
            onClick: _toolbarToggleFullscreen,
            hideOnTouch: true,
        });
    }

    items.push(...opts.extraItemsAfter);

    // Library button (2×2 grid icon) — toggles the arcade's library sidebar
    // (a slide-in drawer on touch, the persistent side panel on desktop). Shown
    // on ALL devices, but only when we're embedded in the arcade iframe — so it's
    // gated on that here and only revealed once the launcher answers the
    // handshake below (see _arcadeHandshake). Standalone games and games iframed
    // on some other site never see it.
    const _wantPanelButton = opts.panelButton && window.self !== window.top;
    if (_wantPanelButton)
    {
        items.push({
            type:  'button',
            id:    'panel',
            label: buildSvgIcon('grid'),   // filled 2×2 squares, sized like its neighbors
            title: 'Library',
            onClick: _arcadeTogglePanel,
        });
    }

    items.push({
        type: 'button',
        id:   'menu',
        label: buildSvgIcon('menu'),
        title: 'Menu',
        onClick: () =>
        {
            // Custom override wins. Don't fire if the button is grayed —
            // the visual state must match the click behavior so a disabled
            // hamburger never triggers anything.
            if (_isHamburgerGrayed(opts)) return;
            if (opts.onHamburger) { opts.onHamburger(); return; }
            const top = getTopMenu();
            if (top)
            {
                clearSubmenuStack();
                hideAllMenus();
            }
            else
            {
                showMenu(opts.pauseMenuId);
            }
        },
    });

    const toolbar = createToolbar({
        id:        opts.id,
        anchor:    opts.anchor,
        direction: opts.direction,
        landscapeStack: opts.landscapeStack,
        items,
    });
    toolbar.show();

    // The Library button starts hidden and only appears once the launcher
    // answers our handshake — guarantees it never shows unless a real arcade
    // is listening (and ready to act on the toggle-panel message).
    if (_wantPanelButton)
    {
        const panelItem = toolbar.getItem('panel');
        if (panelItem)
        {
            panelItem.setVisible(false);
            _arcadeHandshake(() => panelItem.setVisible(true));
        }
    }
    // Even without a Library button, start the handshake when embedded so the
    // fullscreen button learns the launcher's page fullscreen state.
    else if (opts.fullscreen && window.self !== window.top)
        _arcadeHandshake();

    // Keep handle to opts so refreshDefaultToolbar can re-evaluate later
    // when the game's underlying state (driving grayedWhen) changes.
    _defaultToolbarRegistry.set(opts.id, { toolbar, opts });

    // Gray the hamburger whenever the title menu is on top (and not
    // dismissable), or whenever a custom grayedWhen predicate says so.
    // Keeps the button visible so the bar layout doesn't shift, but
    // blocks clicks so the player can't dismiss the title.
    function updateHamburgerGrayed()
    {
        const item = toolbar.getItem('menu');
        if (!item) return;
        item.setDisabled(_isHamburgerGrayed(opts));
    }
    _addInternalVisibilityListener(updateHamburgerGrayed);
    updateHamburgerGrayed();

    return toolbar;
}

// Default-toolbar bookkeeping. Lets refreshDefaultToolbar re-evaluate the
// hamburger's grayed state in response to game-driven (non-menu) state
// changes — e.g. miniGolf's gameState='menu'|'play' transitions.
const _defaultToolbarRegistry = new Map();
function _isHamburgerGrayed(opts)
{
    if (opts.grayedWhen) return !!opts.grayedWhen();
    const top = getTopMenu();
    return !!(top && top.id === opts.titleMenuId && !opts.titleDismissable);
}
function refreshDefaultToolbar(id)
{
    const ids = id ? [id] : [..._defaultToolbarRegistry.keys()];
    for (const tid of ids)
    {
        const reg = _defaultToolbarRegistry.get(tid);
        if (!reg) continue;
        const item = reg.toolbar.getItem('menu');
        if (item) item.setDisabled(_isHamburgerGrayed(reg.opts));
    }
}

// Arcade-launcher handshake. The game posts a 'hello' to its parent frame; the
// launcher replies 'here' (and includes its current page-level fullscreen
// state). Game-initiated (rather than launcher-initiated) so there's no
// load-timing race: whenever a toolbar inits it asks, and the launcher answers
// immediately. Results are cached so later toolbars/buttons react right away.
//
// Two things ride on this:
//   • the Library button reveals itself only once a real launcher answers.
//   • the fullscreen button tracks the launcher's PAGE fullscreen state so it
//     can exit a launcher-owned fullscreen (started from the arcade's own
//     page-level button) instead of just covering it with the game canvas.
let _arcadeConfirmed = false;
let _arcadeParentFullscreen = false;
const _arcadeConfirmCbs = [];
let _arcadeHandshakeStarted = false;
// Ask the launcher to toggle its library sidebar. No-op (silently caught) when
// there's no parent or it isn't the arcade — callers gate on the handshake.
function _arcadeTogglePanel()
{
    try { window.parent.postMessage({ type: 'littlejsArcadeTogglePanel' }, '*'); }
    catch (e) {}
}
// Ask the launcher to exit its page-level fullscreen.
function _arcadeExitFullscreen()
{
    try { window.parent.postMessage({ type: 'littlejsArcadeExitFullscreen' }, '*'); }
    catch (e) {}
}
// Start the handshake once; run onConfirm now if already confirmed, else queue it.
function _arcadeHandshake(onConfirm)
{
    if (onConfirm)
    {
        if (_arcadeConfirmed) onConfirm();
        else _arcadeConfirmCbs.push(onConfirm);
    }
    if (_arcadeHandshakeStarted) return;
    _arcadeHandshakeStarted = true;
    window.addEventListener('message', e =>
    {
        const d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'littlejsArcadeHere')
        {
            _arcadeConfirmed = true;
            if (typeof d.fullscreen === 'boolean') _arcadeParentFullscreen = d.fullscreen;
            while (_arcadeConfirmCbs.length) _arcadeConfirmCbs.shift()();
        }
        else if (d.type === 'littlejsArcadeFullscreenState')
            _arcadeParentFullscreen = !!d.fullscreen;
    });
    try { window.parent.postMessage({ type: 'littlejsArcadeHello' }, '*'); }
    catch (e) {}
}
// Toolbar fullscreen button. Inside the arcade, when the launcher's PAGE is
// fullscreen (started from the arcade's own fullscreen button), ask the launcher
// to exit — so this button works like Escape instead of just stacking the game
// canvas on top. Otherwise toggle the game's own fullscreen as usual (standalone
// games are unaffected — _arcadeParentFullscreen stays false there).
function _toolbarToggleFullscreen()
{
    if (_arcadeParentFullscreen) { _arcadeExitFullscreen(); return; }
    toggleFullscreen();
}

// ============================================================================
// Standard pause + options menus.
// ============================================================================
//
// Every game's pause menu was the same shape: RESUME, RESTART, optional
// extras (OPTIONS / HOW TO PLAY), QUIT TO TITLE (with confirm). These
// helpers stamp that shape from a couple of callbacks.
//
//   createPauseMenu({
//       onRestart: startGame,                 // adds RESTART button
//       onQuit:    quitToTitle,               // adds QUIT TO TITLE (with confirm)
//       extraItems: [                         // inserted between RESTART and QUIT
//           {type:'button', label:'OPTIONS',     onClick: () => pushMenu('options')},
//           {type:'button', label:'HOW TO PLAY', onClick: () => pushMenu('help')},
//       ],
//   });
//
//   createOptionsMenu();    // VOLUME slider + BACK, in-sync with toolbar mute
//   createOptionsMenu({
//       extraItems: [                         // custom controls go above BACK
//           {type:'checkbox', label:'SCREEN SHAKE', value:true,
//                            persist:'shake',
//                            onChange: v => screenShakeEnabled = v},
//       ],
//   });
//
// Skip `onRestart` or `onQuit` to drop the corresponding button. Pass
// `confirmQuit: false` to bypass the "Quit to title?" confirm dialog.
function createPauseMenu(opts)
{
    opts = Object.assign({
        id:           'pause',
        title:        'PAUSED',
        onRestart:    null,
        onQuit:       null,
        onShow:       null,        // forwarded to createMenu — for live labels
        onHide:       null,        // forwarded to createMenu
        extraItems:   [],
        confirmQuit:  true,
        quitMessage:  'Quit to title?',
        resumeLabel:  'RESUME',
        restartLabel: 'RESTART',
        quitLabel:    'QUIT TO TITLE',
    }, opts || {});

    const items = [
        {type:'button', id:'resume', label:opts.resumeLabel,
            onClick: () => hideMenu(opts.id)},
    ];

    if (opts.onRestart)
        items.push({type:'button', id:'restart', label:opts.restartLabel,
            onClick: () => { hideMenu(opts.id); opts.onRestart(); }});

    items.push(...opts.extraItems);

    if (opts.onQuit)
        items.push({type:'button', id:'quit', label:opts.quitLabel,
            onClick: () =>
            {
                // Match the RESTART pattern: hide the pause menu before firing
                // the callback, so games whose onQuit doesn't itself call
                // hideAllMenus() don't leave the pause panel hovering above
                // the title menu.
                if (opts.confirmQuit)
                    showConfirmDialog({
                        message: opts.quitMessage,
                        onYes:   () => { hideMenu(opts.id); opts.onQuit(); },
                    });
                else
                    { hideMenu(opts.id); opts.onQuit(); }
            }});

    return createMenu({
        id:            opts.id,
        title:         opts.title,
        initialItemId: 'resume',
        onShow:        opts.onShow,
        onHide:        opts.onHide,
        items,
    });
}

// Standard options menu. Default body: a single VOLUME slider that drives
// soundVolume and syncs with the toolbar's mute button (changing the
// slider above 0 unmutes; muting via the toolbar leaves the slider
// position intact — the slider value is the "saved volume" for unmute).
// extras go above BACK. Wired with onHide: popMenu so BACK returns to
// the parent menu when pushed.
function createOptionsMenu(opts)
{
    opts = Object.assign({
        id:            'options',
        title:         'OPTIONS',
        volume:        true,
        volumeLabel:   'VOLUME',
        persistKey:    'volume',
        extraItems:    [],
        backLabel:     'BACK',
        showResetBest: false,
        resetBestLabel:   'RESET BEST',
        resetBestMessage: 'Reset best score?',
    }, opts || {});

    const items = [];

    if (opts.volume)
    {
        // Slider value defaults from current soundVolume, persisted under
        // opts.persistKey. onChange ALSO writes _menuSavedVolume so a
        // later mute → unmute restores to the slider's last position.
        const initial = (typeof soundVolume === 'number' && soundVolume > 0)
            ? soundVolume : 0.5;
        items.push({
            type: 'slider', id: 'volume', label: opts.volumeLabel,
            min: 0, max: 1, value: initial,
            persist: opts.persistKey,
            onChange: v =>
            {
                if (typeof setSoundVolume === 'function') setSoundVolume(v);
                _menuSavedVolume = v;
                // Unmute if user drags slider above zero. A zero value
                // leaves mute state alone — silence via slider stays muted
                // for the toolbar button's purposes too.
                if (v > 0 && isMenuMuted()) setMenuMuted(false);
            },
        });
    }

    items.push(...opts.extraItems);

    if (opts.showResetBest)
    {
        items.push({type:'separator'});
        items.push({type:'button', label: opts.resetBestLabel,
            onClick: () => showConfirmDialog({
                message: opts.resetBestMessage,
                // Resetting is not a navigation — keep the back chain so YES
                // returns to this options menu instead of closing to nothing.
                keepStack: true,
                onYes: () => resetBestScore(),
            })});
    }

    items.push({type:'separator'});
    items.push({type:'button', label: opts.backLabel,
        onClick: () => hideMenu(opts.id)});

    return createMenu({
        id:     opts.id,
        title:  opts.title,
        onHide: popMenu,
        items,
    });
}

// Build a simple read-only info menu (how-to-play / HELP). Mirrors the
// hand-rolled `createMenu({id:'help', ...})` pattern many games use inline: a
// wrapping text paragraph, optional extra items (e.g. a controls line), then a
// separator and BACK button. Opened via pushMenu('help'); returns via popMenu.
//   createHelpMenu({title, text, extraItems, id, backLabel})
function createHelpMenu(opts)
{
    opts = Object.assign({
        id:        'help',
        title:     'HELP',
        text:      'A LittleJS prototype.',
        extraItems: [],
        backLabel: 'BACK',
    }, opts || {});

    const items = [];
    if (opts.text)
        items.push({type:'text', text: opts.text});
    items.push(...opts.extraItems);
    items.push({type:'separator'});
    items.push({type:'button', label: opts.backLabel,
        onClick: () => hideMenu(opts.id)});

    return createMenu({
        id:     opts.id,
        title:  opts.title,
        onHide: popMenu,
        items,
    });
}

// ============================================================================
// Sub-menu navigation.
// ============================================================================
//
// Stack-based "open child / return to parent" pattern. Use pushMenu() to
// open a sub-menu — it hides the current top menu first so panels don't
// stack and bleed text through each other. Wire popMenu on the child's
// onHide so it returns to the parent on BACK / Esc / B button / backdrop
// click. clearSubmenuStack abandons the stack (e.g. for QUIT flows that
// drop the player back to a fresh title screen).
//
// Demo wiring:
//   createMenu({ id:'options', onHide: popMenu, items: [
//     {type:'button', label:'BACK', onClick: () => hideMenu('options')},
//   ]});
//   // From a parent menu's button:
//   onClick: () => pushMenu('options')

function pushMenu(id)
{
    const cur = getTopMenu();
    if (cur && cur.id) submenuStack.push(cur.id);
    if (cur)
    {
        // Suppress the parent's auto-pop while we're hiding it as part
        // of the push. Without this, a parent that has its own popMenu
        // wired (i.e. a sub-sub-menu chain) would pop the stack we just
        // pushed, undoing the navigation.
        suppressPopMenu = true;
        cur.hide('push');   // tells the parent's onHide this isn't a real dismiss
        suppressPopMenu = false;
    }
    showMenu(id);
}

function popMenu()
{
    if (suppressPopMenu) return;
    const parent = submenuStack.pop();
    if (parent) showMenu(parent);
}

function clearSubmenuStack() { submenuStack.length = 0; }

// ============================================================================
// Click-to-reveal helper.
// ============================================================================
//
// Standard "title screen" pattern: the canvas shows your game's title art
// with a "CLICK TO PLAY" prompt drawn on it, and the first user interaction
// brings the menu up. After dismissal (Esc, etc.) the prompt comes back and
// the next click re-opens the menu.
//
//   const stop = attachClickToReveal('title');             // unconditional
//   const stop = attachClickToReveal('title',              // gated reveal
//       () => onTitleScreen);                              //   only on title
//   stop();                                                // disable
//
// Reveal triggers on any document click, Space, or Enter — except on the
// menus.js root (so clicks inside a different visible menu don't bubble in).
// Self-cancels while the menu is already visible. The optional `canReveal`
// predicate lets callers gate reveal on game state (e.g. only during the
// title screen) so the listener can stay attached for the whole game.
// Combine with the menu's `onShow` hook to start title music, etc.

// Active reveal handlers — the per-frame gamepad poll in menusUpdate
// walks this list so A / Start can trigger reveal even though gamepad
// input is poll-based and doesn't fire DOM events.
const clickToRevealHandlers = [];

function attachClickToReveal(menuId, canReveal)
{
    initMenuSystem();
    const handler = {
        menuId,
        reveal()
        {
            if (canReveal && !canReveal()) return;
            const m = getMenu(menuId);
            if (!m || m.isVisible()) return;
            if (isMenuVisible()) return; // some other menu is up; don't intrude
            m.show();
        },
    };
    clickToRevealHandlers.push(handler);
    // pointerdown (not click) so this works on touch devices: LittleJS calls
    // preventDefault() on canvas touch events which can suppress the
    // synthesized click event entirely on mobile. pointerdown is the
    // unified mouse + touch + pen event and fires regardless.
    const onPointer = e =>
    {
        if (menuSystemRoot && menuSystemRoot.contains(e.target)) return;
        handler.reveal();
    };
    const onKey = e =>
    {
        if (e.key === ' ' || e.key === 'Enter') handler.reveal();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () =>
    {
        const i = clickToRevealHandlers.indexOf(handler);
        if (i >= 0) clickToRevealHandlers.splice(i, 1);
        document.removeEventListener('pointerdown', onPointer);
        document.removeEventListener('keydown', onKey);
    };
}

// ============================================================================
// Pause-key helper.
// ============================================================================
//
// Replaces the "if (isPlaying && keyWasPressed('Escape')) { showMenu('pause');
// ... }" boilerplate that every game needs in gameUpdate. Handles keyboard
// Esc and gamepad Start, plays the 'activate' sound, and clears the press so
// it doesn't immediately path through to the menu's own dismiss handler.
//
// IMPORTANT: call this every frame from gameUpdate. It's a per-frame poll,
// not a one-time install — LittleJS input state is frame-based, and
// gameUpdate doesn't run while a menu is up (so this naturally goes quiet
// once a menu surfaces).
//
//   function gameUpdate()
//   {
//       if (bindPauseKey({when: () => isPlaying && alive})) return;
//       // ... rest of update ...
//   }
//
// Returns true if it surfaced the menu this frame (so the caller can early-
// return to skip the rest of the frame's update). Returns false otherwise.
//
// Options (all optional):
//   menuId       which menu to show. Default 'pause'.
//   when         predicate gating activation, e.g. () => isPlaying && alive.
//                Default always-true.
//
// Always checks isMenuVisible() before acting, so it never double-opens.
function bindPauseKey(opts)
{
    const cfg = Object.assign({
        menuId: 'pause',
        when:   null,
    }, opts);

    if (cfg.when && !cfg.when()) return false;
    if (isMenuVisible()) return false;

    // Guard the engine-global lookups in case this helper is called before
    // engineInit (e.g. from tests or a custom bootstrap).
    const escPressed   = typeof keyWasPressed     === 'function' && keyWasPressed('Escape');
    const startPressed = typeof gamepadWasPressed === 'function' && gamepadWasPressed(9);
    if (!escPressed && !startPressed) return false;

    playMenuSound('activate');
    showMenu(cfg.menuId);

    // Swallow the press so menusUpdate doesn't see the same Esc/Start on
    // the next frame and immediately dismiss the menu we just opened.
    if (typeof inputClearKey === 'function')
    {
        inputClearKey('Escape');
        // Match the gamepad-clear signature the games are using.
        try { inputClearKey(9, 1, false, true, false); } catch(e) {}
    }
    return true;
}

// ============================================================================
// Dialog helpers.
// ============================================================================
//
// One-shot modal helpers built on top of pushMenu. Both auto-pick a
// wrapping `text` item for long or multi-line messages and a centered
// `label` for short ones. Both push themselves over the current top menu
// (so the caller's panel doesn't bleed through visually) and restore the
// caller via popMenu when dismissed.
//
//   showAlertDialog({message: 'Saved.'});                              // single OK/BACK
//   showConfirmDialog({message: 'Quit to title?', onYes: quitToTitle}); // YES/NO

// Single-button info dialog. For "you got a medal", "saved", "level
// description" — anywhere the player just needs to acknowledge. Default
// button label is BACK to match the dismissal action in game menus.
//
//   showAlertDialog({message, title?, icon?, onOk?, okLabel?})
//
// `title`  optional menu-title-style header.
// `icon`   optional emoji rendered prominently above the message.
// `onOk`   fires after the dialog closes (click / Enter / Esc all path
//          through this since dismissable is true).
// `okLabel` defaults to 'BACK'.
// ============================================================================
// Toasts and achievement medals.
// ============================================================================
//
// `showMenuToast({icon, title, text, duration, position})` renders a DOM
// notification in a corner of the viewport. Position is one of 'top-left'
// (default), 'top-right', 'bottom-left', 'bottom-right' — the slide-in
// direction follows the position so toasts always slide in from the
// nearest edge. Toasts queue and play one at a time; later calls during a
// visible toast are appended. Pointer-events are disabled so toasts never
// intercept game clicks. Duration defaults to 5 seconds (slide-out included).
//
// `MenuMedal` is a drop-in subclass of LittleJS's `Medal` that overrides
// unlock() to fire a toast instead of pushing to the engine's canvas queue.
// Use it everywhere you would have used `Medal` — `medalsInit('SaveName')`
// still loads the unlocked state from localStorage as normal.
//
//   const medal_first_win = new MenuMedal(0, 'First Win', 'Win a match.', '🏆');
//   medalsInit('My Game');
//   medal_first_win.unlock();   // toast in top-left, no canvas overlay

const TOAST_DURATION_DEFAULT = 5;
const TOAST_SLIDE_MS = 300;
// One queue per screen corner so toasts in different corners don't block
// each other — a bottom-left boss banner can show concurrently with a
// bottom-right pickup toast. Each corner serializes within itself so
// stacked entries in the same position still queue up.
const toastQueues  = {};   // position → array of pending opts
const toastCurrent = {};   // position → currently-showing element (or null)
const toastTimers  = {};   // position → setTimeout handle for the active toast

function showMenuToast(options)
{
    initMenuSystem();
    const opts = options || {};
    const position = opts.position || 'top-left';
    if (!toastQueues[position]) toastQueues[position] = [];
    toastQueues[position].push(opts);
    if (!toastCurrent[position]) processToastQueue(position);
}

function processToastQueue(position)
{
    const queue = toastQueues[position];
    if (!queue || !queue.length) { toastCurrent[position] = null; return; }
    const opts = queue.shift();

    const el = document.createElement('div');
    el.className = 'ljs-toast pos-' + position;

    if (opts.icon)
    {
        const iconEl = document.createElement('div');
        iconEl.className = 'ljs-toast-icon';
        iconEl.textContent = opts.icon;
        el.appendChild(iconEl);
    }

    const content = document.createElement('div');
    content.className = 'ljs-toast-content';
    if (opts.title)
    {
        const titleEl = document.createElement('div');
        titleEl.className = 'ljs-toast-title';
        titleEl.textContent = opts.title;
        content.appendChild(titleEl);
    }
    if (opts.text)
    {
        const textEl = document.createElement('div');
        textEl.className = 'ljs-toast-text';
        textEl.textContent = opts.text;
        content.appendChild(textEl);
    }
    el.appendChild(content);

    menuSystemRoot.appendChild(el);
    toastCurrent[position] = el;

    // Force a layout flush before adding the .visible class so the slide-in
    // transition actually plays. requestAnimationFrame queues us for after
    // the next render pass — same trick the menu panel uses implicitly via
    // its display:none -> display:flex transition not being animated.
    requestAnimationFrame(() => el.classList.add('visible'));

    const duration = (opts.duration || TOAST_DURATION_DEFAULT) * 1000;
    clearTimeout(toastTimers[position]);
    toastTimers[position] = setTimeout(() =>
    {
        el.classList.remove('visible');
        setTimeout(() =>
        {
            el.remove();
            processToastQueue(position);
        }, TOAST_SLIDE_MS);
    }, duration);
}

class MenuMedal extends Medal
{
    /** Override of Medal.unlock() that routes the unlock notification to our
     *  DOM toast queue instead of the engine's canvas display queue. Same
     *  persistence (engine medalsSave() -> localStorage[medalsSaveName]) and
     *  lookup map (engine's `medals[id]`) — only the visual display differs. */
    unlock()
    {
        if (this.unlocked) return;
        // Honor the engine's debug "prevent unlock" flag if it's been set.
        if (typeof medalsPreventUnlock !== 'undefined' && medalsPreventUnlock) return;
        this.unlocked = true;
        medalsSave();   // engine persists all medals as one localStorage blob
        showMenuToast({
            icon:  this.icon,
            title: this.name,
            text:  this.description,
        });
    }
}

function showAlertDialog(opts)
{
    opts = opts || {};
    const id = '__ljs-alert-' + (Math.random() * 1e9 | 0);
    const message = opts.message || '';
    const useText = message.length > 40 || message.includes('\n');
    const items = [];
    // Optional big icon above the message — useful for medal/achievement
    // detail dialogs where the cell's icon should re-appear in the popup.
    if (opts.icon)
    {
        const iconEl = document.createElement('div');
        iconEl.className = 'ljs-dialog-icon';
        iconEl.textContent = opts.icon;
        items.push({type:'custom', el: iconEl});
    }
    items.push(useText
        ? {type:'text',  text: message}
        : {type:'label', text: message});
    items.push({type:'button', id:'ok', label: opts.okLabel || 'BACK', onClick: () =>
    {
        dialog.destroy();    // hide -> onHide -> restore parent
        if (opts.onOk) opts.onOk();
    }});
    const dialog = createMenu({
        id,
        title:         opts.title || null,
        titleFx:       opts.titleFx,
        dismissable:   true,         // BACK / Esc / B / backdrop all close it
        initialItemId: 'ok',
        onHide:        popMenu,
        items,
    });
    pushMenu(id);
}

// ============================================================================
// Standard "GAME OVER" dialog — extracted from 26 games that all used the
// same showAlertDialog shape (title:'GAME OVER', icon:'💥', message with
// score line, onOk: quitToTitle). Auto-submits to best score by default;
// pass submitBest:false to opt out.
// ============================================================================

function showGameOverDialog(opts)
{
    opts = opts || {};
    const won            = !!opts.won;
    const hasScore       = (typeof opts.score === 'number');
    const score          = hasScore ? opts.score : 0;
    const submitBest     = opts.submitBest !== false;
    const lowerIsBetter  = !!opts.lowerIsBetter;
    const onContinue     = (typeof opts.onContinue === 'function')
        ? opts.onContinue : () => quitToTitle();

    let newBest = false;
    if (submitBest && hasScore)
        newBest = submitBestScore(score, {lowerIsBetter});

    let message;
    if (typeof opts.customMessage === 'string')
    {
        message = opts.customMessage;
    }
    else
    {
        const scoreLine = (typeof opts.format === 'function')
            ? opts.format(score) : ('Score: ' + score);
        const lines = [scoreLine];
        if (Array.isArray(opts.extraLines))
            for (const line of opts.extraLines)
                lines.push(line);
        if (newBest) lines.push('NEW BEST!');
        message = lines.join('\n');
    }

    // Default heading FX: gold shimmer on a win, red glow on a loss.
    // Caller can override with opts.titleFx, or disable with titleFx:null.
    let titleFx = opts.titleFx;
    if (titleFx === undefined)
        titleFx = won ? { fill:'gold' } : { fill:'neon', color:'#e23' };

    showAlertDialog({
        title:   won ? 'YOU WIN!' : 'GAME OVER',
        icon:    won ? '🏆' : '💥',
        titleFx,
        message,
        onOk:    onContinue,
    });
}

// Two-button confirmation. Defaults selection to NO (safe choice). YES
// clears the submenu stack so the caller can branch (e.g. QUIT to title);
// NO closes the dialog and restores the parent.
//
//   showConfirmDialog({message, title?, icon?, onYes?, onNo?,
//                      yesLabel?, noLabel?, keepStack?})
//
// `dismissable` is false — Esc/B/Start/backdrop all do nothing, forcing
// an explicit choice. yesLabel / noLabel default to 'YES' / 'NO'.
//
// `keepStack:true` — for confirms whose YES is NOT a navigation (e.g. RESET
// BEST / RESET PROGRESS, where the user should land back on the menu they
// came from). YES then behaves like NO for navigation: it leaves the submenu
// stack intact so closing the dialog restores the parent menu, and runs onYes
// for its side effect only. Without it, YES wipes the back chain and a
// non-navigating onYes leaves no menu visible at all.

function showConfirmDialog(opts)
{
    opts = opts || {};
    const id = '__ljs-confirm-' + (Math.random() * 1e9 | 0);
    const message = opts.message || '';
    const useText = message.length > 40 || message.includes('\n');
    const items = [];
    if (opts.icon)
    {
        const iconEl = document.createElement('div');
        iconEl.className = 'ljs-dialog-icon';
        iconEl.textContent = opts.icon;
        items.push({type:'custom', el: iconEl});
    }
    items.push(useText
        ? {type:'text',  text: message}
        : {type:'label', text: message});
    items.push({type:'button', id:'yes', label: opts.yesLabel || 'YES', onClick: () =>
    {
        // By default YES means the caller decides what's next, so wipe the
        // back chain. keepStack:true leaves it intact so destroy -> onHide ->
        // popMenu restores the parent menu (see keepStack note above).
        if (!opts.keepStack) clearSubmenuStack();
        dialog.destroy();
        if (opts.onYes) opts.onYes();
    }});
    items.push({type:'button', id:'no', label: opts.noLabel || 'NO', onClick: () =>
    {
        dialog.destroy();      // hide -> onHide -> restore parent
        if (opts.onNo) opts.onNo();
    }});
    const dialog = createMenu({
        id,
        title:         opts.title || null,
        titleFx:       opts.titleFx,
        dismissable:   false,
        initialItemId: 'no',
        onHide:        popMenu,
        items,
    });
    pushMenu(id);
}

// ============================================================================
// Internals: module state, lazy init, plugin registration.
// ============================================================================

// Menu system state.
let menuSystemRoot = null;     // root <div> hosting all menu and toolbar DOM
const allMenus = [];           // visible menus in show order; last is "top"
const allToolbars = [];        // every toolbar created (visible or not)
const menusById = {};          // id -> menu handle (for showMenu/getMenu)

// Sub-menu navigation state (see pushMenu / popMenu above).
const submenuStack = [];
let suppressPopMenu = false;

// Global UI sound hooks; setMenuSounds() wires these. `select` fires on
// keyboard/gamepad navigation, `activate` fires when a focusable item is
// clicked or activated via Enter/A. Both are no-ops until set.
const menuSounds = { select: null, activate: null };
function setMenuSounds(sounds)
{
    if (!sounds) { menuSounds.select = menuSounds.activate = null; return; }
    menuSounds.select   = _menuSoundGuard(sounds.select   || null);
    menuSounds.activate = _menuSoundGuard(sounds.activate || null);
}

// --- Silent attract -------------------------------------------------------
// A game whose title screen is a live "attract" demo (auto-plays behind the
// menu, like Pong) calls setSilentAttract(true) once in gameInit. While that
// game sits at its title (isPlaying() === false) ALL game audio is force-muted,
// yet the menu's own select/activate sounds still play — they run through
// _menuSoundGuard, which lifts the mute for the duration of the call. So menus
// stay clicky, the demo stays silent, and a real game (isPlaying() true) is at
// full volume. soundEnable is left alone, so the audio context still resumes.
let _silentAttract = false;   // did the game opt in?
let _demoSilent    = false;   // are we muting game audio right now?
let _inMenuSound   = false;   // true only while a menu sound is being played

// Demo (attract) mode: the game was loaded with `#demo` in the URL. The arcade
// launcher's hero cabinet uses this to run a game menu-less as a live attract.
// initMenuSystem() auto-hides all menu chrome (#littlejs-menus) when this is set,
// so the launcher no longer has to inject hide-CSS into the iframe — `#demo` is
// self-describing. Hiding is purely visual: the menu stays tracked in allMenus,
// so isMenuVisible() is unchanged and installAutoPause(() => isPlaying()) keeps
// `paused` false at the title (isPlaying() is false there), letting the attract
// run live behind nothing. Games can also read isDemoMode() to branch behavior
// (e.g. board games run AI-vs-AI only in demo, a static board otherwise).
const _demoMode = /demo/.test(location.hash);
function isDemoMode() { return _demoMode; }

// Patch Sound.prototype.play once (per document) so we can force game sounds to
// volume 0 during a silent attract, without disabling the engine's audio.
function _installSoundMute()
{
    if (typeof Sound !== 'function' || Sound.prototype._ljsDemoMute) return;
    Sound.prototype._ljsDemoMute = true;
    const _origPlay = Sound.prototype.play;
    Sound.prototype.play = function(...args)
    {
        if (_demoSilent && !_inMenuSound) args[1] = 0;   // args[1] is volume
        return _origPlay.apply(this, args);
    };
}

// Wrap a menu-sound callback so invoking it briefly lifts the demo mute.
function _menuSoundGuard(fn)
{
    if (!fn) return null;
    return function(...a)
    {
        const prev = _inMenuSound; _inMenuSound = true;
        try { return fn.apply(this, a); }
        finally { _inMenuSound = prev; }
    };
}

// Opt a game in/out of silent-attract muting (call once in gameInit).
function setSilentAttract(on = true)
{
    _silentAttract = !!on;
    _installSoundMute();
    _demoSilent = _demoMode || (_silentAttract && !_isPlaying);
}

// ============================================================================
// Unified save data.
// ============================================================================
//
// One blob per game (player-facing data) plus one global blob (site-wide
// settings such as mute). All writes funnel through engine readSaveData /
// writeSaveData. Call saveDataInit('GameName') once in gameInit, before any
// menu construction, tweak() call, or getSaveData/saveData call — this
// primes both blobs and is the canonical save name for the game (matches
// medalsInit by convention).
//
// Storage layout:
//   localStorage['<GameName>']        — { options:{...}, ...gameCustomFields }
//   localStorage['littlejs.global']   — { muted: boolean }
//   localStorage['<GameName>.tweaks'] — owned by tweakables.js (separate)
//
// Public API:
//   saveDataInit(name)   call once in gameInit. Caches the blobs.
//   getSaveData()        returns the cached per-game blob (read-only view).
//                        MUST NOT be mutated — use saveData(patch) to write.
//   saveData(patch)      shallow-merges patch into the blob, writes it.
//   getSaveName()        current save name, or null if saveDataInit wasn't called.

let _saveName = null;
let _gameSaveData = null;
let _globalSaveData = null;
const _savePreInitWarned = new Set();

// ============================================================================
// Game flow helpers — extracted from the same boilerplate that lived in
// ~50 games as let isPlaying / function setPlaying / function quitToTitle.
// ============================================================================

let _isPlaying = false;

function isPlaying() { return _isPlaying; }

function setPlaying(p)
{
    _isPlaying = !!p;
    // Silent-attract: mute game audio whenever we're not actually playing — and
    // for the ENTIRE cabinet demo (#demo) even with isPlaying() true.
    _demoSilent = _demoMode || (_silentAttract && !_isPlaying);
    // Fire registered listeners (games hook these for game-state-driven
    // UI toggles, e.g. hide undo / new-game while at title).
    for (const fn of _playingListeners) fn(_isPlaying);
}

// Game-state hook: register a fn that fires every time setPlaying flips.
// Used by games whose toolbars have gameplay-only items (undo, redo, new
// game, etc.) that should hide while the player is at the title. The
// default toolbar itself stays visible at all times — its hamburger is
// title-aware via _isHamburgerGrayed, not via show/hide.
//
// Fires once with the current state on registration so the initial UI
// matches without games needing to call setPlaying(false) explicitly.
const _playingListeners = new Set();
function addPlayingListener(fn)
{
    _playingListeners.add(fn);
    fn(_isPlaying);
    return () => _playingListeners.delete(fn);
}

// Single canonical quit-to-title flow. `onCleanup` is an optional sync
// callback for game-specific teardown (e.g. cancel an AI search loop).
function quitToTitle(onCleanup)
{
    clearSubmenuStack();
    hideAllMenus();
    setPlaying(false);
    if (typeof onCleanup === 'function') onCleanup();
    showMenu('title');
}

function _warnPreInitOnce(key, msg)
{
    if (_savePreInitWarned.has(key)) return;
    _savePreInitWarned.add(key);
    console.warn(msg);
}

function saveDataInit(name)
{
    if (typeof name !== 'string' || !name)
    {
        console.warn('saveDataInit: name must be a non-empty string');
        return;
    }
    if (_saveName === name) return;          // idempotent for same name
    if (_saveName !== null)
    {
        console.warn('saveDataInit: already initialized as "' + _saveName +
            '", ignoring re-init with "' + name + '"');
        return;
    }
    _saveName = name;
    _gameSaveData = readSaveData(name, {});
    _globalSaveData = readSaveData('littlejs.global', {});
}

function getSaveName() { return _saveName; }

function getSaveData()
{
    if (_saveName === null)
    {
        _warnPreInitOnce('getSaveData',
            'getSaveData(): call saveDataInit(name) first; returning {}');
        return {};
    }
    return _gameSaveData;
}

function saveData(patch)
{
    if (_saveName === null)
    {
        _warnPreInitOnce('saveData',
            'saveData(): call saveDataInit(name) first; ignoring write');
        return;
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    {
        console.warn('saveData(): patch must be a plain object, got', patch);
        return;
    }
    Object.assign(_gameSaveData, patch);
    writeSaveData(_saveName, _gameSaveData);
}

// ============================================================================
// Best score — extracted from the same 4-line ritual that lived in 36 games.
// Stored under the `bestScore` key inside the per-game save blob, so games
// that were already calling saveData({bestScore: ...}) read/write the exact
// same value with these helpers — no migration of saved data needed.
// ============================================================================

function getBestScore()
{
    const data = getSaveData();
    return (data && typeof data.bestScore === 'number') ? data.bestScore : 0;
}

function setBestScore(n)
{
    saveData({bestScore: n});
}

// Returns true if `n` beat the stored best and was written.
// Pass {lowerIsBetter:true} for golf-style scoring.
function submitBestScore(n, opts)
{
    const lower = opts && opts.lowerIsBetter;
    const current = getBestScore();
    const isBetter = current === 0
        ? true                                    // first score always wins
        : (lower ? n < current : n > current);
    if (!isBetter) return false;
    setBestScore(n);
    return true;
}

function resetBestScore()
{
    setBestScore(0);
}

// Internal helper for the global blob. Mute is the only consumer today;
// add more if/when other site-wide prefs (master volume, fullscreen) move
// here. Lazily inits if saveDataInit wasn't called so mute still works
// when a toolbar is built before the game-level saveDataInit call.
function _readGlobalSaveData()
{
    if (_globalSaveData === null)
        _globalSaveData = readSaveData('littlejs.global', {});
    return _globalSaveData;
}

function _writeGlobalSaveData()
{
    writeSaveData('littlejs.global', _readGlobalSaveData());
}

// Shared mute state — single source of truth for the toolbar's volume-on /
// volume-off SVG icon
// button and any options-menu volume slider. Refactored out of
// installDefaultToolbar so a volume change can keep the mute icon in
// sync (and vice versa). Persists in the 'littlejs.global' save blob;
// the saved volume restores on unmute so a user's slider preference
// survives.
let _menuMuted = false;
let _menuSavedVolume = 0.3;
function _initMuteState()
{
    if (_initMuteState._done) return;
    _initMuteState._done = true;
    _menuMuted = !!_readGlobalSaveData().muted;
    if (typeof soundVolume === 'number' && soundVolume > 0)
        _menuSavedVolume = soundVolume;
    if (_menuMuted && typeof setSoundVolume === 'function')
        setSoundVolume(0);
}
function isMenuMuted() { _initMuteState(); return _menuMuted; }
function setMenuMuted(muted)
{
    _initMuteState();
    muted = !!muted;
    if (_menuMuted === muted) return;
    _menuMuted = muted;
    if (_menuMuted)
    {
        if (typeof soundVolume === 'number' && soundVolume > 0)
            _menuSavedVolume = soundVolume;
        if (typeof setSoundVolume === 'function') setSoundVolume(0);
    }
    else
    {
        if (typeof setSoundVolume === 'function')
            setSoundVolume(_menuSavedVolume || 0.3);
    }
    _readGlobalSaveData().muted = _menuMuted;
    _writeGlobalSaveData();
    _refreshMuteUI();
}
function toggleMenuMuted() { setMenuMuted(!isMenuMuted()); }
// Update every toolbar's mute button label/title to match current state.
// Called whenever mute changes (toolbar click, slider drag, programmatic).
function _refreshMuteUI()
{
    for (const tb of allToolbars)
    {
        const item = tb.getItem('mute');
        if (!item) continue;
        item.setLabel(buildSvgIcon(_menuMuted ? 'volume-off' : 'volume-on'));
        item.setTitle?.(_menuMuted ? 'Unmute' : 'Mute');
    }
}
// Manually play one of the wired sounds. Use this from game code that
// opens a menu without going through a focusable item — e.g., Esc / Start
// in gameUpdate calling `showMenu('pause')` should match the click sound
// of the toolbar button that does the same. Names: 'select' | 'activate'.
function playMenuSound(name)
{
    const fn = menuSounds[name];
    if (fn) fn();
}

// Global menu-visibility hook. setMenuVisibilityCallback(cb) wires a
// callback that fires whenever any menu — including dialogs created by
// showAlertDialog / showConfirmDialog — is shown or hidden. The callback
// receives the new visibility state. Use this to drive `paused` and
// similar global flags from a single place, instead of wiring onShow/
// onHide on every individual menu (which is easy to forget and would
// miss the internal dialog menus entirely).
let menuVisibilityCallback = null;
function setMenuVisibilityCallback(cb) { menuVisibilityCallback = cb || null; }
// Internal listeners — used by built-in features (e.g. installDefaultToolbar,
// installAutoPause) that need to react to menu changes without stomping the
// user's callback.
const _internalVisibilityListeners = [];
function _addInternalVisibilityListener(fn) { _internalVisibilityListeners.push(fn); }
// Auto-pause shortcut. installAutoPause() drives LittleJS's `paused` global
// from menu visibility — pauses whenever any menu is visible. Pass a
// predicate (e.g. `() => isPlaying`) to only pause when the game is
// actually running, so the title menu stays interactive over an animated
// backdrop. Internally uses the listener system so it doesn't conflict
// with a separate setMenuVisibilityCallback.
function installAutoPause(predicate)
{
    _addInternalVisibilityListener(v =>
    {
        // `paused` is LittleJS's global; this assignment writes to it.
        paused = predicate ? (v && !!predicate()) : v;
    });
}
function fireMenuVisibility()
{
    // The orientation-lock overlay counts as "something blocking play" so it
    // pauses the game through the same single signal as menus/dialogs.
    const v = isMenuVisible() || orientationBlocked;
    // When the last menu closes, clear stale mouse-button state in LittleJS's
    // input table. We stopPropagation on pointer events at the menu DOM root
    // (so menu widgets like sliders work), which means a mouse RELEASE that
    // happens over the menu never reaches the engine's document-level
    // listener. The engine's "down" state for that button stays latched, and
    // gameplay code that polls mouseIsDown sees a phantom hold after the
    // menu closes (e.g. a pinball flipper that the player was mouse-holding
    // when they hit Esc stays raised even after they release in the menu).
    // Clearing on the last-close transition also covers the equivalent
    // touch-end case for the same reason.
    if (!v && typeof inputClearKey === 'function')
        for (let b = 0; b < 3; b++) inputClearKey(b, 0, true, true, true);
    if (menuVisibilityCallback) menuVisibilityCallback(v);
    for (const fn of _internalVisibilityListeners) fn(v);
}

// --- Orientation lock ----------------------------------------------------
// setOrientationLock('landscape'|'portrait', options?) declares the device
// orientation a game wants. On touch devices held the wrong way, a full-
// screen overlay appears (above all menus) and the game pauses — the block
// folds into fireMenuVisibility() above, so setMenuVisibilityCallback /
// installAutoPause drive `paused` with no extra wiring. Off by default;
// setOrientationLock(false) (or null) clears it. options overrides:
//   { icon, title, text } — defaults: '📱', 'Please Rotate Your Device',
//   'This game is best played in <orientation>.'
let orientationLock      = null;   // 'landscape' | 'portrait' | null
let orientationBlocked   = false;  // overlay currently showing
let orientationOpts      = {};
let orientationOverlay   = null;   // lazily-created DOM element
let orientationListening = false;  // resize/orientationchange listeners attached

function setOrientationLock(orientation, options)
{
    if (orientation !== 'landscape' && orientation !== 'portrait')
        orientation = null;        // anything else (false/null/typo) disables
    initMenuSystem();
    orientationLock = orientation;
    orientationOpts = options || {};
    if (orientation && !orientationListening)
    {
        orientationListening = true;
        const onChange = () => updateOrientationLock();
        window.addEventListener('resize', onChange);
        window.addEventListener('orientationchange', onChange);
    }
    updateOrientationLock();
}

function orientationIsTouchDevice()
{
    if (typeof isTouchDevice !== 'undefined') return isTouchDevice;
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

function ensureOrientationOverlay()
{
    if (orientationOverlay) return orientationOverlay;
    const el = document.createElement('div');
    el.className = 'ljs-orientation-lock';
    for (const cls of ['ljs-orient-icon', 'ljs-orient-title', 'ljs-orient-text'])
    {
        const child = document.createElement('div');
        child.className = cls;
        el.appendChild(child);
    }

    // Top-left Library button — an escape hatch back to the arcade for a player
    // who launched an orientation-locked game on a device they can't/won't
    // rotate. The overlay covers the toolbar (so its Library button is hidden),
    // hence this dedicated copy. Only shown inside the launcher: starts hidden
    // and is revealed by the same handshake, and reuses the toggle-panel message.
    const panelBtn = document.createElement('button');
    panelBtn.className = 'ljs-orient-panel-btn';
    panelBtn.title = 'Library';
    panelBtn.appendChild(buildGridIcon());
    panelBtn.style.display = 'none';
    panelBtn.addEventListener('click', () => { _arcadeTogglePanel(); panelBtn.blur(); });
    el.appendChild(panelBtn);
    _arcadeHandshake(() => { panelBtn.style.display = ''; });

    menuSystemRoot.appendChild(el);
    orientationOverlay = el;
    return el;
}

function updateOrientationLock()
{
    const current = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    const blocked = !!orientationLock && orientationIsTouchDevice() &&
        current !== orientationLock;
    if (blocked)
    {
        const el = ensureOrientationOverlay();
        el.querySelector('.ljs-orient-icon').textContent  = orientationOpts.icon  || '📱';
        el.querySelector('.ljs-orient-title').textContent = orientationOpts.title || 'Please Rotate Your Device';
        el.querySelector('.ljs-orient-text').textContent  = orientationOpts.text  ||
            ('This game is best played in ' + orientationLock + '.');
        el.classList.add('visible');
    }
    else if (orientationOverlay)
        orientationOverlay.classList.remove('visible');

    if (blocked !== orientationBlocked)
    {
        orientationBlocked = blocked;
        fireMenuVisibility();   // re-pause / un-pause through the shared signal
    }
}

// Currently arrow/d-pad-selected element. Independent of DOM focus — DOM
// focus follows for accessibility but the .ljs-selected class drives the
// visible outline. Cleared on any pointer interaction.
let selectedEl = null;

// Active input modality. Drives whether menus auto-select an item on show().
// Pointer-mode opens have no initial selection so the cursor doesn't drag a
// stale outline around; the first keyboard/gamepad input brings it back.
// Tracked via document-level listeners so it stays correct even when game
// code (not menus.js) opens a menu in response to Esc / Start.
let inputModality = 'pointer';

// Left-stick repeat state for menu navigation.
const STICK_REPEAT_INITIAL = 0.4;       // seconds before first repeat
const STICK_REPEAT_RATE    = 0.15;      // seconds between subsequent repeats
const STICK_DEADZONE       = 0.5;
let stickRepeatTimer = 0;
let stickWasActive = false;

// Keyboard arrow repeat state. LittleJS's onKeyDown filters browser
// auto-repeat (`if (!e.repeat)` in the engine) so we drive it ourselves —
// gives consistent feel across keyboard, gamepad d-pad, and stick. Same
// timing knobs as the stick to keep the experience uniform.
let keyRepeatTimer = 0;
let keyRepeatHeld  = null;     // currently-repeating arrow key, or null

function injectStyles()
{
    const css = `
#littlejs-menus {
    /* Viewport-responsive base font-size. All size variables below are em-
       based so the entire UI scales with this. The clamp range is narrow on
       purpose: mobile sites must include <meta name="viewport" content=
       "width=device-width,initial-scale=1"> for the floor to land at real
       device size — without it, mobile browsers shrink-to-fit a 980px
       layout viewport and the menu ends up tiny. Override --menu-base-size
       on #littlejs-menus to pick a different scale. */
    font-size: var(--menu-base-size, clamp(16px, 2vmin, 18px));

    /* shared */
    --menu-bg:           rgba(0, 0, 0, 0.85);
    --menu-fg:           #fff;
    --menu-accent:       #6cf;
    --menu-disabled:     #666;
    --menu-radius:       0.75em;
    --menu-font:         monospace;
    --menu-border-color: var(--menu-accent);
    --menu-border-width: 2px;
    --menu-title-size:   1.75em;
    --menu-item-size:    1.125em;
    --menu-anim-time:    0.18s;   /* menu entrance fade/scale; setMenuAnimations(false) -> 0s */

    /* button fill */
    --menu-item-bg:       rgba(255, 255, 255, 0.06);
    --menu-item-hover-bg: rgba(255, 255, 255, 0.18);

    /* modal menus */
    --menu-backdrop:     rgba(0, 0, 0, 0.5);
    --menu-padding:      1.5em;
    --menu-item-gap:     0.625em;
    --menu-min-width:    min(20em, 90vw);
    --menu-max-width:    min(90vw, 30em);
    --menu-max-height:   90vh;

    /* toolbars */
    --toolbar-gap:        0.4em;
    --toolbar-margin:     0.5em;
    --toolbar-icon-size:  3em;     /* button frame (tappable area) */
    --toolbar-glyph-size: 2em;   /* icon glyph inside the button */
    --toolbar-bg:         transparent;

    /* toasts (achievement / notification pop-ups, top-left) */
    --toast-margin:      0.75em;
    --toast-min-width:   15em;
    --toast-max-width:   20em;
    --toast-padding:     0.625em 0.875em;
    --toast-icon-size:   2em;
    --toast-title-size:  0.875em;
    --toast-text-size:   0.75em;

    /* big icon at the top of showAlertDialog / showConfirmDialog */
    --dialog-icon-size:    3em;
    --dialog-icon-padding: 0;

    /* orientation-lock overlay (setOrientationLock) */
    --orient-bg:        rgba(0, 0, 0, 0.95);
    --orient-icon-size: 5em;
}
/* Single visibility class wins over every display rule below. setVisible()
   on every item type — and the toolbar parent — toggles this class. */
.ljs-hidden { display: none !important; }

.ljs-menu-backdrop {
    position: fixed; inset: 0; z-index: 999;
    background: var(--menu-backdrop);
    display: none;
}
/* Backdrop appears instantly (no fade) — fading it lags a frame behind the
   panel and you glimpse the undimmed scene. Only the panel animates in. */
.ljs-menu-backdrop.visible { display: block; }
.ljs-menu-panel {
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    z-index: 1000;
    background: var(--menu-bg); color: var(--menu-fg);
    font-family: var(--menu-font);
    border: var(--menu-border-width) solid var(--menu-border-color);
    border-radius: var(--menu-radius);
    padding: var(--menu-padding);
    min-width: var(--menu-min-width);
    max-width: var(--menu-max-width);
    max-height: var(--menu-max-height);
    overflow-y: auto;
    display: none; flex-direction: column; gap: var(--menu-item-gap);
    box-sizing: border-box;
}
.ljs-menu-panel.visible { display: flex; animation: ljs-menu-in var(--menu-anim-time, .18s) ease-out; }
/* Entrance: fade + slight scale-up. The transform keeps the -50%,-50%
   centering so the panel grows from its center. setMenuAnimations(false)
   sets --menu-anim-time to 0s; prefers-reduced-motion disables it too. */
@keyframes ljs-menu-in {
    from { opacity: 0; transform: translate(-50%, -50%) scale(.94); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.ljs-menu-title {
    font-size: var(--menu-title-size); font-weight: bold; text-align: center;
    color: var(--menu-accent); margin-bottom: 0.5em;
}
.ljs-menu-subtitle {
    font-size: 0.875em; font-weight: bold; text-align: center;
    letter-spacing: 0.15em; color: var(--menu-subtitle-color, var(--menu-fg)); opacity: 0.85;
    /* Pull tight under the title (cancels the title's margin-bottom plus
       the panel's flex gap). Tune via your own CSS override per menu. */
    margin-top: -1.5em; margin-bottom: -.5em;
}
.ljs-menu-item {
    font-family: var(--menu-font);
    font-size: var(--menu-item-size); text-align: center;
    padding: 0.625em 0.875em; box-sizing: border-box;
}
.ljs-menu-item.disabled { color: var(--menu-disabled); pointer-events: none; }
button.ljs-menu-item, input.ljs-menu-item {
    font-family: inherit; font-size: inherit;
    background: var(--menu-item-bg); color: inherit;
    border: 2px solid transparent; border-radius: 0.5em;
    cursor: pointer;
}
/* Hover shows the accent border + brighter fill (mouse feedback). The
   selection outline shows when arrow/d-pad nav has explicitly selected
   an item (.ljs-selected). We do NOT use :focus-visible — Safari/iOS
   sometimes treats a touch tap as a keyboard-like focus and keeps
   :focus-visible after the synthesized click (and our blur() inside
   wireActivate doesn't reliably clear it on every browser), which
   leaves an outline stuck on a tapped toggle. .ljs-selected is set
   explicitly by menus.js's own arrow/d-pad nav code and cleared on
   any pointer interaction, so we get a consistent indicator across
   mouse, touch, and gamepad without depending on browser heuristics. */
/* Gate all :hover rules on a hover-capable device. iOS Safari (and most
   mobile browsers) leave :hover stuck after a tap until the user taps
   elsewhere — that was the "stuck selection" on touch we were chasing. */
@media (hover: hover) and (pointer: fine) {
    button.ljs-menu-item:hover {
    background: var(--menu-item-hover-bg);
        border-color: var(--menu-accent); outline: none;
    }
}
.ljs-menu-item.ljs-selected,
.ljs-grid-cell.ljs-selected {
    border-color: var(--menu-accent); outline: none;
}
button.ljs-menu-item:disabled { color: var(--menu-disabled); cursor: default; }
.ljs-menu-item.ljs-slider { display: flex; flex-direction: column; }
.ljs-menu-item.ljs-slider .ljs-slider-row {
    display: flex; justify-content: space-between;
}
.ljs-menu-item.ljs-checkbox {
    display: flex; justify-content: space-between; align-items: center;
}
.ljs-menu-item.ljs-checkbox .ljs-checkbox-box {
    width: 1.2em; height: 1.2em;
    border: 2px solid currentColor; border-radius: 0.25em;
    display: inline-flex; align-items: center; justify-content: center;
}
.ljs-menu-item.ljs-color {
    display: flex; justify-content: space-between; align-items: center;
}
.ljs-menu-item.ljs-input {
    display: flex; justify-content: space-between; align-items: center; gap: 0.5em;
}
.ljs-input-field {
    flex: 1; min-width: 0;
    background: var(--menu-item-bg); color: inherit;
    font-family: inherit; font-size: inherit;
    border: 2px solid transparent; border-radius: 0.25em;
    padding: 0.25em 0.5em; box-sizing: border-box;
}
.ljs-input-field:focus,
.ljs-input-field.ljs-selected { border-color: var(--menu-accent); outline: none; }
/* Strip browser default chrome so the swatch matches the menu look.
   Vendor pseudo-elements vary per engine — set them all. */
.ljs-color-input {
    -webkit-appearance: none; -moz-appearance: none; appearance: none;
    width: 2.4em; height: 1.4em; padding: 0;
    border: 2px solid currentColor; border-radius: 4px;
    background: transparent; cursor: pointer;
}
.ljs-color-input::-webkit-color-swatch-wrapper { padding: 0; }
.ljs-color-input::-webkit-color-swatch { border: none; border-radius: 2px; }
.ljs-color-input::-moz-color-swatch        { border: none; border-radius: 2px; }
.ljs-menu-item.ljs-menu-text {
    white-space: pre-wrap; text-align: left; line-height: 1.4;
}
/* showAlertDialog / showConfirmDialog top icon. Override --dialog-icon-size
   for size and --dialog-icon-padding for the spacing around it. The
   .ljs-menu-item.ljs-dialog-icon double-class beats the bare .ljs-menu-item
   padding default. */
.ljs-menu-item.ljs-dialog-icon {
    font-size: var(--dialog-icon-size);
    padding: var(--dialog-icon-padding);
    text-align: center; line-height: 1;
}
.ljs-menu-item.ljs-menu-separator {
    padding: 0; margin: 0.25em 0; height: 0;
    border-top: 1px solid var(--menu-border-color);
    opacity: 0.4;
}
.ljs-menu-item.ljs-menu-grid {
    display: grid;
    grid-template-columns: repeat(var(--ljs-grid-cols, 3), minmax(0, 1fr));
    gap: var(--menu-grid-gap, 0.5em);
    padding: 0.25em 0;
}
.ljs-grid-cell {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.25em; padding: 0.625em 0.375em;
    border: 2px solid transparent; border-radius: 0.5em; text-align: center;
    background: transparent; color: inherit;
    font-family: inherit; font-size: inherit;
    transition: opacity 0.2s, filter 0.2s, background 0.15s;
}
button.ljs-grid-cell { cursor: pointer; }
@media (hover: hover) and (pointer: fine) {
    button.ljs-grid-cell:hover {
        background: var(--menu-item-hover-bg); border-color: var(--menu-accent);
        outline: none;
    }
}
.ljs-grid-cell.unearned { opacity: 0.3; filter: grayscale(1); }
.ljs-grid-icon  { font-size: var(--menu-grid-icon-size,  2em);     line-height: 1; }
.ljs-grid-label { font-size: var(--menu-grid-label-size, 0.6875em); color: var(--menu-fg); word-break: break-word; }
.ljs-menu-toolbar {
    position: fixed; z-index: 1000;
    display: flex; gap: var(--toolbar-gap);
    background: var(--toolbar-bg);
}
.ljs-menu-toolbar.anchor-top-left     { top: var(--toolbar-margin); left: var(--toolbar-margin); }
.ljs-menu-toolbar.anchor-top-right    { top: var(--toolbar-margin); right: var(--toolbar-margin); }
.ljs-menu-toolbar.anchor-bottom-left  { bottom: var(--toolbar-margin); left: var(--toolbar-margin); }
.ljs-menu-toolbar.anchor-bottom-right { bottom: var(--toolbar-margin); right: var(--toolbar-margin); }
.ljs-menu-toolbar.dir-vertical { flex-direction: column; }
/* landscapeStack: opt-in responsive flip (set via createToolbar). A horizontal
   toolbar stacks vertically in landscape (canvas is letterboxed, side gutter has
   room) and stays horizontal in portrait. The column direction is chosen per
   anchor so the item that sits in the corner horizontally — last child for the
   right anchors, first child for the left — stays pinned to that same corner
   when stacked (e.g. the top-right hamburger stays at the top, buttons below). */
@media (orientation: landscape) {
    .ljs-menu-toolbar.ljs-toolbar-landscape-stack.anchor-top-right,
    .ljs-menu-toolbar.ljs-toolbar-landscape-stack.anchor-bottom-left  { flex-direction: column-reverse; }
    .ljs-menu-toolbar.ljs-toolbar-landscape-stack.anchor-top-left,
    .ljs-menu-toolbar.ljs-toolbar-landscape-stack.anchor-bottom-right { flex-direction: column; }
}
/* iOS top-URL-bar browsers (see the ios-topbar tag) overlap fixed top content
   in PORTRAIT; drop the top toolbar + the rotate-overlay button clear of the
   bar. Landscape hides the bar, and desktop/Safari never get the class. */
@media (orientation: portrait) {
    html.ios-topbar .ljs-menu-toolbar.anchor-top-left,
    html.ios-topbar .ljs-menu-toolbar.anchor-top-right { top: 30px; }
    html.ios-topbar .ljs-orient-panel-btn { top: 30px; }
}
.ljs-menu-toolbar button {
    /* font-size stays at 1em so the em-based width/height resolve against
       the parent's base font-size, not against a bumped button size. The
       inner .ljs-toolbar-icon span carries the visible glyph size. */
    width: var(--toolbar-icon-size); height: var(--toolbar-icon-size);
    font-family: var(--menu-font); font-size: 1em;
    color: var(--menu-fg); background: transparent;
    border: none; border-radius: 0.25em; cursor: pointer;
    outline: none;        /* toolbars are pointer-only; never draw focus rings */
    display: inline-flex; align-items: center; justify-content: center;
}
.ljs-toolbar-icon { font-family: inherit; font-size: var(--toolbar-glyph-size); line-height: 1; }
/* Inline SVG toolbar icons (volume / fullscreen / menu / library) all draw
   with stroke:currentColor at 1em, so they theme and scale together. display
   block removes the inline-SVG baseline gap so they center in the button. */
.ljs-toolbar-icon svg { display: block; width: 1em; height: 1em; }
/* Filled 2×2 library icon (four solid squares) — same look as the launcher's
   drawer toggle. Proportions mirror index.html's #hamburger .grid (3px gap /
   2px radius on a 20px box → 0.15em / 0.1em at 1em). */
.ljs-grid-icon {
    display: grid;
    grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
    gap: 0.15em; width: 1em; height: 1em;
}
.ljs-grid-icon span { background: currentColor; border-radius: 0.1em; }
.ljs-menu-toolbar button:focus-visible { outline: none; }
@media (hover: hover) and (pointer: fine) {
    .ljs-menu-toolbar button:hover { background: rgba(255,255,255,0.15); }
}
.ljs-menu-toolbar button.toolbar-toggle-off { opacity: 0.4; }
.ljs-menu-toolbar button:disabled { opacity: 0.35; cursor: default; }
@media (hover: hover) and (pointer: fine) {
    .ljs-menu-toolbar button:disabled:hover { background: transparent; }
}

/* Toast: corner-anchored (position option picks which corner), slides in
   from the nearest horizontal edge. Pointer-events disabled so toasts
   never intercept game clicks. */
.ljs-toast {
    position: fixed; z-index: 10000; pointer-events: none;
    background: var(--menu-bg); color: var(--menu-fg);
    font-family: var(--menu-font);
    border: var(--menu-border-width) solid var(--menu-border-color);
    border-radius: var(--menu-radius);
    padding: var(--toast-padding); box-sizing: border-box;
    min-width: var(--toast-min-width); max-width: var(--toast-max-width);
    display: flex; gap: 0.625em; align-items: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    transition: transform 0.3s ease-out;
}
.ljs-toast.pos-top-left     { top:    var(--toast-margin); left:  var(--toast-margin); }
.ljs-toast.pos-top-right    { top:    var(--toast-margin); right: var(--toast-margin); }
.ljs-toast.pos-bottom-left  { bottom: var(--toast-margin); left:  var(--toast-margin); }
.ljs-toast.pos-bottom-right { bottom: var(--toast-margin); right: var(--toast-margin); }
/* Slide in from the nearest horizontal edge (left-anchored toasts slide
   in from the left, right-anchored from the right). */
.ljs-toast.pos-top-left,
.ljs-toast.pos-bottom-left  { transform: translateX(calc(-100% - var(--toast-margin) * 2)); }
.ljs-toast.pos-top-right,
.ljs-toast.pos-bottom-right { transform: translateX(calc( 100% + var(--toast-margin) * 2)); }
.ljs-toast.visible { transform: translateX(0); }
.ljs-toast-icon { font-size: var(--toast-icon-size); line-height: 1; }
.ljs-toast-content { flex: 1; min-width: 0; }
.ljs-toast-title { font-size: var(--toast-title-size); font-weight: bold; color: var(--menu-accent); }
.ljs-toast-text { font-size: var(--toast-text-size); opacity: 0.85; word-break: break-word; }

/* Orientation-lock overlay (setOrientationLock). Full-viewport, sits above
   every menu/dialog/toast, captures pointer events so taps don't fall through
   to the canvas. Hidden until .visible is added. */
.ljs-orientation-lock {
    position: fixed; inset: 0; z-index: 100000;
    display: none; pointer-events: auto;
    flex-direction: column; align-items: center; justify-content: center;
    gap: 1em; text-align: center; padding: 2em; box-sizing: border-box;
    background: var(--orient-bg); color: var(--menu-fg);
    font-family: var(--menu-font);
}
.ljs-orientation-lock.visible { display: flex; }
.ljs-orient-icon {
    font-size: var(--orient-icon-size); line-height: 1;
    animation: ljs-orient-rotate 1.6s ease-in-out infinite;
}
.ljs-orient-title { font-size: var(--menu-title-size); font-weight: bold; color: var(--menu-accent); }
.ljs-orient-text  { font-size: var(--menu-item-size); max-width: 18em; opacity: 0.9; }
/* Library escape-hatch button, pinned top-left of the rotate overlay. */
.ljs-orient-panel-btn {
    position: absolute;
    top: 10px;
    left: 10px;
    width: 40px; height: 40px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 20px;                /* grid icon is 1em → 20px, like the launcher */
    color: var(--menu-fg);
    /* Match index.html's #hamburger: faint neutral chip, no accent outline. */
    background: rgba(20, 26, 38, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    cursor: pointer; line-height: 1;
    outline: none;                               /* never draw a focus ring */
    -webkit-tap-highlight-color: transparent;    /* kill the mobile tap flash */
}
.ljs-orient-panel-btn:hover { background: rgba(20, 26, 38, 0.92); }
.ljs-orient-panel-btn:focus-visible { outline: none; }
/* Wiggle the icon between portrait-ish and landscape-ish to suggest rotating. */
@keyframes ljs-orient-rotate {
    0%, 100% { transform: rotate(-12deg); }
    50%      { transform: rotate(78deg); }
}

/* ============================================================
   Title / heading FX (titleFx) — composable juice effects.
   Each effect class lives on ONE channel; durations divide by
   --fx-speed (default 1), tintable fills read --fx-color
   (default per-effect) so games recolor without new CSS.
   ============================================================ */

/* FILL channel ------------------------------------------------ */
.fx-neon{ color:#fff; animation:ljsfx-neon calc(1.8s / var(--fx-speed,1)) ease-in-out infinite; }
@keyframes ljsfx-neon{
    0%,100%{ text-shadow:0 0 4px var(--fx-color,#6cf),0 0 10px var(--fx-color,#6cf),0 0 20px var(--fx-color,#09f),0 0 40px var(--fx-color,#06f); }
    50%{ text-shadow:0 0 6px var(--fx-color,#6cf),0 0 18px var(--fx-color,#6cf),0 0 36px var(--fx-color,#09f),0 0 72px var(--fx-color,#06f); }
}
.fx-rainbow{
    background:linear-gradient(90deg,#f0f,#0ff,#0f0,#ff0,#f80,#f0f); background-size:300% 100%;
    -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-fill-color:transparent;
    animation:ljsfx-hue calc(4s / var(--fx-speed,1)) linear infinite;
}
@keyframes ljsfx-hue{ from{background-position:0 0;} to{background-position:300% 0;} }
.fx-shine{
    color:var(--fx-color,#a7b5c8);
    background:linear-gradient(110deg,var(--fx-color,#a7b5c8) 0%,var(--fx-color,#a7b5c8) 40%,#fff 50%,var(--fx-color,#a7b5c8) 60%,var(--fx-color,#a7b5c8) 100%);
    background-size:250% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
    animation:ljsfx-shine calc(2.6s / var(--fx-speed,1)) linear infinite;
}
@keyframes ljsfx-shine{ from{background-position:140% 0;} to{background-position:-40% 0;} }
.fx-fire{
    background:linear-gradient(0deg,#ff3 0%,#f80 40%,#e22 80%,#a00 100%);
    -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-fill-color:transparent;
    filter:drop-shadow(0 0 6px #f60); animation:ljsfx-fire calc(.12s / var(--fx-speed,1)) steps(2) infinite;
}
@keyframes ljsfx-fire{ 0%{filter:drop-shadow(0 0 6px #f60);} 100%{filter:drop-shadow(0 -2px 10px #f93);} }
.fx-gold{
    background:linear-gradient(100deg,#a67c00 0%,#fde98c 25%,#fff7d6 38%,#fde98c 50%,#a67c00 75%,#fde98c 100%);
    background-size:250% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-fill-color:transparent;
    animation:ljsfx-gold calc(3.2s / var(--fx-speed,1)) linear infinite;
}
@keyframes ljsfx-gold{ from{background-position:0 0;} to{background-position:250% 0;} }
.fx-outline{
    color:transparent; -webkit-text-fill-color:transparent;
    -webkit-text-stroke:2px var(--fx-color,var(--menu-accent,#6cf));
    text-shadow:0 0 12px var(--fx-color,rgba(102,204,255,.4));
}
.fx-hardshadow{ color:var(--fx-color,#fff); text-shadow:4px 4px 0 var(--fx-color2,#444),8px 8px 0 rgba(0,0,0,.35); }
.fx-3d{
    color:#ffd34d;
    text-shadow:1px 1px 0 #b9860b,2px 2px 0 #b9860b,3px 3px 0 #936c09,4px 4px 0 #6e5107,5px 5px 0 #4c3805,6px 6px 8px rgba(0,0,0,.6);
}
.fx-glitch{ color:var(--fx-color,#fff); animation:ljsfx-glitch calc(2.4s / var(--fx-speed,1)) steps(2) infinite; }
@keyframes ljsfx-glitch{
    0%,92%,100%{ text-shadow:1px 0 #f0f,-1px 0 #0ff; transform:translate(0); }
    93%{ text-shadow:3px 0 #f0f,-3px 0 #0ff; transform:translate(-2px,1px); }
    95%{ text-shadow:-4px 0 #f0f,4px 0 #0ff; transform:translate(2px,-1px); }
    97%{ text-shadow:2px 0 #f0f,-2px 0 #0ff; transform:translate(-1px,0); }
}
/* CRT: scanlines modulate the TEXT's own alpha via a mask (cuts into the
   glyphs over any background) instead of laying black bars on top. */
.fx-crt{ color:#7fffb0; text-shadow:0 0 6px #2f8;
    -webkit-mask:repeating-linear-gradient(0deg,#000 0 2px,rgba(0,0,0,.3) 2px 4px);
    mask:repeating-linear-gradient(0deg,#000 0 2px,rgba(0,0,0,.3) 2px 4px);
    animation:ljsfx-crt calc(3s / var(--fx-speed,1)) steps(40) infinite; }
@keyframes ljsfx-crt{ 0%,97%,100%{opacity:1;} 98%{opacity:.7;} 99%{opacity:.95;} }

/* MOTION channel (outer wrapper, animates transform) ---------- */
.m-float{ display:inline-block; animation:ljsfx-float calc(3s / var(--fx-speed,1)) ease-in-out infinite; }
@keyframes ljsfx-float{ 0%,100%{transform:translateY(-5px);} 50%{transform:translateY(5px);} }
.m-heartbeat{ display:inline-block; animation:ljsfx-beat calc(1.3s / var(--fx-speed,1)) ease-in-out infinite; }
@keyframes ljsfx-beat{ 0%,100%{transform:scale(1);} 15%{transform:scale(1.12);} 30%{transform:scale(1);} }
.m-jelly{ display:inline-block; animation:ljsfx-jelly calc(1.6s / var(--fx-speed,1)) ease-in-out infinite; }
@keyframes ljsfx-jelly{ 0%,100%{transform:scale(1,1);} 25%{transform:scale(1.1,.85);} 50%{transform:scale(.9,1.1);} 75%{transform:scale(1.05,.95);} }
/* wave is per-letter, applied to the fill element's letter spans */
.fx-wave span{ display:inline-block; animation:ljsfx-wave calc(1.4s / var(--fx-speed,1)) ease-in-out infinite; }
@keyframes ljsfx-wave{ 0%,100%{transform:translateY(0);} 50%{transform:translateY(-12px);} }

/* OVERLAY channel -------------------------------------------- */
/* Shrink the sparkle host to its text so particles only cover the title
   glyphs, not the full panel width. align-self centers it in the flex menu
   column; the fit-content + margin-inline:auto pair covers non-flex hosts. */
.ov-sparkle{ position:relative; width:-moz-fit-content; width:fit-content; max-width:100%; margin-inline:auto; align-self:center; }
/* .9s is intentionally fixed (not --fx-speed scaled) — it is coupled to the
   JS particle lifetime in applyMenuFx (spawn/remove timers). */
.ljs-fx-spark{ position:absolute; width:6px; height:6px; pointer-events:none;
    background:radial-gradient(circle,#fff 0%,#ffd34d 50%,transparent 70%); border-radius:50%;
    animation:ljsfx-spark .9s ease-out forwards; }
@keyframes ljsfx-spark{
    0%{transform:scale(0) rotate(0);opacity:0;}
    30%{transform:scale(1.4) rotate(90deg);opacity:1;}
    100%{transform:scale(0) rotate(180deg) translateY(-18px);opacity:0;}
}

/* reduced motion --------------------------------------------- */
/* Primary-button glow — opt-in via item glow:true (or createTitleMenu
   playGlow:true on PLAY). A gentle accent pulse to draw the eye. */
@keyframes ljs-menu-glow-pulse {
    0%,100% { box-shadow: 0 0 2px transparent; }
    50%     { box-shadow: 0 0 14px var(--menu-accent); }
}
button.ljs-menu-item.ljs-glow {
    animation: ljs-menu-glow-pulse 1.6s ease-in-out infinite;
    border-color: var(--menu-accent);
}

@media (prefers-reduced-motion: reduce){
    .fx-neon,.fx-rainbow,.fx-shine,.fx-fire,.fx-gold,.fx-glitch,.fx-crt,
    .m-float,.m-heartbeat,.m-jelly,.fx-wave span{ animation:none !important; }
    .m-float,.m-heartbeat,.m-jelly,.fx-wave span{ transform:none !important; }
    .ljs-fx-spark{ display:none !important; }
    .ljs-menu-panel.visible{ animation:none !important; }
    button.ljs-menu-item.ljs-glow{ animation:none !important; }
}
`;
    const style = document.createElement('style');
    style.textContent = css;
    // Insert at the START of <head> so any user <style> block (which
    // typically lives AFTER this script tag in source order, or is
    // appended later via JS) wins cascade ties for theme variables.
    // appendChild here would let helper defaults override user overrides
    // on `#littlejs-menus { --menu-accent: ... }` etc., which is very
    // rarely what the consumer wants.
    document.head.insertBefore(style, document.head.firstChild);
}

function initMenuSystem()
{
    if (menuSystemRoot) return;

    // LittleJS defaults its debug overlay to the Escape key, which collides
    // with the pause/dismiss flow this menu system relies on. Move it to
    // backtick (~) automatically so games that load menus.js don't have to.
    if (typeof setDebugKey === 'function' &&
        typeof debugKey !== 'undefined' && debugKey === 'Escape')
        setDebugKey('Backquote');

    // Default UI sounds: tuned zzfx tones that worked across every game's
    // hand-rolled `setMenuSounds(...)` block. Only installed if the game
    // hasn't already wired its own — explicit setMenuSounds calls always
    // win. To run silent, call `setMenuSounds(null)` after the first
    // createMenu (or before, with empty handlers).
    if (typeof Sound === 'function')
    {
        if (!menuSounds.select)
        {
            const _defaultSelect = new Sound([.4,,910,,,.02,2,.07,-5,-33,,,,,,,,.25]);
            menuSounds.select = _menuSoundGuard(() => _defaultSelect.play());
        }
        if (!menuSounds.activate)
        {
            const _defaultActivate = new Sound([.6,,30,.01,,.02,1,3.4,94,,,,,,,,,.67]);
            menuSounds.activate = _menuSoundGuard(() => _defaultActivate.play());
        }
    }

    // Non-Safari iOS browsers (Chrome/Edge/Firefox = CriOS/EdgiOS/FxiOS) keep
    // their URL bar at the TOP and overlap fixed top content; tag the document
    // so the toolbar + orientation-overlay CSS can clear it in portrait. Safari
    // (URL bar at the bottom) is excluded.
    if (/CriOS|EdgiOS|FxiOS/.test(navigator.userAgent))
        document.documentElement.classList.add('ios-topbar');

    injectStyles();

    menuSystemRoot = document.createElement('div');
    menuSystemRoot.id = 'littlejs-menus';
    document.body.appendChild(menuSystemRoot);

    // In demo/attract mode (#demo — e.g. the launcher's hero cabinet), hide all
    // menu chrome so the game runs menu-less behind nothing. setProperty with
    // 'important' beats any game CSS, matching what the launcher used to inject.
    // This is visual only — allMenus tracking is untouched, so the demo still
    // updates live (see _demoMode note above).
    if (_demoMode)
    {
        menuSystemRoot.style.setProperty('display', 'none', 'important');
        // The cabinet demo runs SILENT — mute all game audio for the whole demo
        // (even with isPlaying() true) so no startup/loop sfx sneak through.
        _installSoundMute();
        _demoSilent = true;
    }

    // Stop pointer events from bubbling to LittleJS's document-level handlers,
    // which would otherwise preventDefault() and break native widget behavior
    // — most visibly, slider drag and text input focus.
    const stop = e => e.stopPropagation();
    ['mousedown','mouseup','pointerdown','pointerup',
     'touchstart','touchend','touchmove','wheel','click'].forEach(t =>
        menuSystemRoot.addEventListener(t, stop));

    // Pointer activity clears the keyboard/gamepad selection so clicking switches
    // to a fresh item rather than keeping old navigation state.
    menuSystemRoot.addEventListener('mousedown', clearSelected);
    menuSystemRoot.addEventListener('touchstart', clearSelected);

    // Document-level modality tracking. Capture phase so we see the event
    // regardless of who's listening on the canvas / menu root. Pointer events
    // also reset keyRepeatHeld so a held arrow key + a mouse click doesn't
    // leave keyboard nav repeating in the background while the user is
    // clearly switching to pointer interaction.
    addEventListener('keydown',    () => { inputModality = 'keyboard'; }, true);
    addEventListener('mousedown',  () => { inputModality = 'pointer'; keyRepeatHeld = null; }, true);
    addEventListener('touchstart', () => { inputModality = 'pointer'; keyRepeatHeld = null; }, true);

    // While a menu is open, claim Enter / Space / Arrow keys so the browser's
    // native handling doesn't double-fire with ours:
    //   - Enter or Space on a focused <button> would trigger a native click
    //     ON TOP OF activateFocused -> selectedEl.click(): two sounds, two
    //     onChange calls (toggles flip back to original, BACK in a sub-menu
    //     pops past the parent into the next-selected item, etc).
    //   - ArrowUp/Down/Left/Right on a focused <input type="range"> would
    //     change the slider value via the browser's accessibility default,
    //     on top of our focusBy / adjustFocused.
    // Skip writable text inputs so the user can type freely.
    addEventListener('keydown', e =>
    {
        if (!isMenuVisible()) return;
        if (isTextInputElement(e.target)) return;
        const k = e.key;
        if (k === 'Enter' || k === ' ' ||
            k === 'ArrowUp' || k === 'ArrowDown' ||
            k === 'ArrowLeft' || k === 'ArrowRight')
            e.preventDefault();
    }, true);

    engineAddPlugin(menusUpdate);
}

// ============================================================================
// Focus and input handling.
// ============================================================================

function getTopMenu()
{
    return allMenus.length ? allMenus[allMenus.length - 1] : null;
}

// True if `el` is a writable text/textarea input — used to skip our keyboard
// nav and key suppression so the user can type freely. Range/color/checkbox
// inputs deliberately don't count: those are nav targets, not text fields.
function isTextInputElement(el)
{
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' &&
        /^(text|email|password|search|url|tel|number)$/.test(el.type);
}

// Flattened list of focus targets across all items. Most items contribute
// one entry (themselves); a grid contributes one entry per focusable cell.
// Each entry: { focusEl, handle, item, cellIndex? }.
// Skips items that are disabled OR currently hidden via setVisible(false) —
// hidden items shouldn't be reachable by keyboard/gamepad nav.
function focusableItems(menu)
{
    const out = [];
    for (const item of menu._items)
    {
        if (item.handle.isDisabled()) continue;
        if (item.el.classList.contains('ljs-hidden')) continue;
        if (item.focusEls)
        {
            for (let i = 0; i < item.focusEls.length; i++)
            {
                const fe = item.focusEls[i];
                if (fe) out.push({focusEl: fe, handle: item.handle, item, cellIndex: i});
            }
        }
        else if (item.focusable && item.focusEl)
            out.push({focusEl: item.focusEl, handle: item.handle, item});
    }
    return out;
}

function setSelected(el)
{
    if (selectedEl && selectedEl !== el) selectedEl.classList.remove('ljs-selected');
    selectedEl = el;
    if (el)
    {
        el.classList.add('ljs-selected');
        el.focus();
    }
}

function clearSelected()
{
    if (selectedEl) selectedEl.classList.remove('ljs-selected');
    selectedEl = null;
}

function selectedIndex(menu)
{
    return focusableItems(menu).findIndex(b => b.focusEl === selectedEl);
}

// Helper: locate the entry in the flat focus list that points to a specific
// grid cell. Used by 2D grid nav.
function findGridCellEntry(items, grid, cellIndex)
{
    return items.find(e => e.item === grid && e.cellIndex === cellIndex);
}

// Select the first focusable target and play the nav sound. Used to "wake
// up" a menu that was opened in pointer mode (no selection) when the user
// presses any nav input. Safe to call on empty menus — no-ops.
function selectFirstFocusable(menu)
{
    const items = focusableItems(menu);
    if (!items.length) return;
    setSelected(items[0].focusEl);
    if (menuSounds.select) menuSounds.select();
}

// Vertical nav. For grid cells, moves by ±columns within the grid (true 2D
// up/down). When the target cell is missing, non-focusable, or off the top/
// bottom of the grid, falls through to ±1 sequential nav across the flat
// list (which exits the grid into surrounding items). Wraparound is
// preserved for non-grid items so the menu stays cyclical.
function focusBy(menu, delta)
{
    const items = focusableItems(menu);
    if (!items.length) return;
    const cur = selectedIndex(menu);

    if (cur >= 0 && items[cur].cellIndex !== undefined)
    {
        const entry = items[cur];
        const grid  = entry.item;
        const cols  = grid.columns;
        const total = grid.focusEls.length;
        const newIdx = entry.cellIndex + delta * cols;
        if (newIdx >= 0 && newIdx < total && grid.focusEls[newIdx])
        {
            const target = findGridCellEntry(items, grid, newIdx);
            if (target)
            {
                setSelected(target.focusEl);
                if (menuSounds.select) menuSounds.select();
                return;
            }
        }
        // Off the top/bottom edge of the grid — exit the grid block
        // entirely. The naive `cur + delta` step here would land on the
        // next cell in the flat list (i.e. sideways inside the grid),
        // which feels like LEFT/RIGHT to the player. Skip past the grid
        // to the first non-grid item in the travel direction (wrapping
        // around the menu if needed).
        const gridStart = items.findIndex(it => it.item === grid);
        let gridEnd = gridStart;
        while (gridEnd + 1 < items.length && items[gridEnd + 1].item === grid)
            gridEnd++;
        const exit = delta > 0
            ? (gridEnd   + 1                  ) % items.length
            : (gridStart - 1 + items.length   ) % items.length;
        setSelected(items[exit].focusEl);
        if (menuSounds.select) menuSounds.select();
        return;
    }

    const next = cur < 0
        ? (delta > 0 ? 0 : items.length - 1)
        : (cur + delta + items.length) % items.length;
    setSelected(items[next].focusEl);
    if (menuSounds.select) menuSounds.select();
}

function activateFocused(menu)
{
    // No selection yet — first Enter/A picks the first item so the user
    // gets feedback rather than a no-op. Activation requires a second press.
    if (!selectedEl) { selectFirstFocusable(menu); return; }
    // The element's own click handler fires menuSounds.activate via the
    // wrapped listener installed by the builder, so no need to fire here.
    selectedEl.click();
}

function adjustFocused(menu, delta)
{
    const items = focusableItems(menu);
    const cur = selectedIndex(menu);
    // No selection (pointer-mode open, then keyboard left/right) — wake up
    // the menu by picking the first item. Same UX as focusBy's first press.
    if (cur < 0) { selectFirstFocusable(menu); return; }
    const entry = items[cur];
    const h = entry.handle;
    if (h.type === 'slider')
    {
        const sl = entry.focusEl;
        const step = parseFloat(sl.step) || ((+sl.max - +sl.min) / 100);
        const v = Math.max(+sl.min, Math.min(+sl.max, +sl.value + step * delta));
        h.setValue(v);
        sl.dispatchEvent(new Event('input'));
    }
    else if (h.type === 'toggle' || h.type === 'checkbox')
    {
        // ←/→ flips the same as activate
        entry.focusEl.click();
    }
    else if (h.type === 'grid')
    {
        // Horizontal nav within a grid row. ±1 column, clamped to the row;
        // hitting the row edge exits the grid by stepping in the flat list
        // (which puts you on the first cell of the next/prev row, or out
        // of the grid entirely if you were already at a corner).
        const grid = entry.item;
        const cols = grid.columns;
        const idx  = entry.cellIndex;
        const col  = idx % cols;
        const newCol = col + delta;
        if (newCol >= 0 && newCol < cols)
        {
            const newIdx = idx + delta;
            if (newIdx < grid.focusEls.length && grid.focusEls[newIdx])
            {
                const target = findGridCellEntry(items, grid, newIdx);
                if (target)
                {
                    setSelected(target.focusEl);
                    if (menuSounds.select) menuSounds.select();
                    return;
                }
            }
        }
        // Out of row, or target cell is non-focusable: step in flat list.
        const next = (cur + delta + items.length) % items.length;
        setSelected(items[next].focusEl);
        if (menuSounds.select) menuSounds.select();
    }
}

function handleKeyboard()
{
    const menu = getTopMenu();
    if (!menu) { keyRepeatHeld = null; return; }

    // Skip arrow / Enter / Space handling when focus is in a writable text
    // input — the user is typing, not navigating. Esc still works so they
    // can back out of the menu without first clicking elsewhere.
    const typing = isTextInputElement(document.activeElement);

    if (!typing)
    {
        // Arrow keys: act on initial press, then auto-repeat while held using
        // the same timing as the gamepad stick. Important: do NOT clear the
        // down bit on arrows — keyIsDown drives the repeat logic; clearing
        // would break the "still held" check between auto-repeat fires.
        const arrowAct = k =>
            k === 'ArrowUp'    ? focusBy(menu, -1)       :
            k === 'ArrowDown'  ? focusBy(menu, +1)       :
            k === 'ArrowLeft'  ? adjustFocused(menu, -1) :
            k === 'ArrowRight' ? adjustFocused(menu, +1) : null;

        let firedKey = null;
        for (const k of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])
            if (keyWasPressed(k)) { arrowAct(k); firedKey = k; }

        if (firedKey)
        {
            keyRepeatHeld  = firedKey;
            keyRepeatTimer = STICK_REPEAT_INITIAL;
        }
        else if (keyRepeatHeld && keyIsDown(keyRepeatHeld))
        {
            keyRepeatTimer -= timeDelta;
            if (keyRepeatTimer <= 0)
            {
                keyRepeatTimer = STICK_REPEAT_RATE;
                arrowAct(keyRepeatHeld);
            }
        }
        else
        {
            keyRepeatHeld  = null;
            keyRepeatTimer = 0;
        }

        if (keyWasPressed('Enter'))  { activateFocused(menu); inputClearKey('Enter'); }
        if (keyWasPressed('Space'))  { activateFocused(menu); inputClearKey('Space'); }
    }

    if (keyWasPressed('Escape'))
    {
        if (menu._cfg.dismissable) menu.hide();
        inputClearKey('Escape');
    }
}

function handleGamepad()
{
    const gp = 0;
    const menu = getTopMenu();
    if (!menu) { stickRepeatTimer = 0; stickWasActive = false; return; }

    // Gamepad has no DOM events, so detect any activity here and update
    // modality up front. This must happen BEFORE activate handlers fire,
    // because they may push a sub-menu whose show() reads modality.
    const stick = gamepadStick(0, gp);
    const ax = Math.abs(stick.x), ay = Math.abs(stick.y);
    const active = ax > STICK_DEADZONE || ay > STICK_DEADZONE;
    if (active ||
        gamepadWasPressed(0, gp)  || gamepadWasPressed(1, gp)  ||
        gamepadWasPressed(9, gp)  || gamepadWasPressed(12, gp) ||
        gamepadWasPressed(13, gp) || gamepadWasPressed(14, gp) ||
        gamepadWasPressed(15, gp))
        inputModality = 'gamepad';

    // Standard Gamepad API: button 0 = A (south), 1 = B (east),
    // 9 = Start, 12/13/14/15 = d-pad up/down/left/right.
    let dpadActed = false;

    if (gamepadWasPressed(0, gp)) { activateFocused(menu); gamepadClear(0, gp); }
    // B (1) is the back/dismiss button.
    if (gamepadWasPressed(1, gp))
    {
        if (menu._cfg.dismissable) menu.hide();
        gamepadClear(1, gp);
    }
    // Start (9): if the menu defines onStart, run it (e.g. title menu's
    // PLAY shortcut). Otherwise fall through to dismiss like B does.
    if (gamepadWasPressed(9, gp))
    {
        if (menu._cfg.onStart)
        {
            if (menuSounds.activate) menuSounds.activate();
            menu._cfg.onStart();
        }
        else if (menu._cfg.dismissable) menu.hide();
        gamepadClear(9, gp);
    }
    if (gamepadWasPressed(12, gp)) { focusBy(menu, -1);       gamepadClear(12, gp); dpadActed = true; }
    if (gamepadWasPressed(13, gp)) { focusBy(menu, +1);       gamepadClear(13, gp); dpadActed = true; }
    if (gamepadWasPressed(14, gp)) { adjustFocused(menu, -1); gamepadClear(14, gp); dpadActed = true; }
    if (gamepadWasPressed(15, gp)) { adjustFocused(menu, +1); gamepadClear(15, gp); dpadActed = true; }

    // Left stick (also reflects d-pad via gamepadDirectionEmulateStick).
    // Note: LittleJS's applyDeadZones flips Y so positive y means stick UP.
    if (!active)
    {
        stickWasActive = false;
        stickRepeatTimer = 0;
        return;
    }

    // If a d-pad button just fired focus motion, pretend the stick already
    // fired this frame so we don't double-move (d-pad emulation copies the
    // d-pad direction onto sticks[0], which would otherwise re-trigger).
    if (dpadActed)
    {
        stickWasActive = true;
        stickRepeatTimer = STICK_REPEAT_INITIAL;
        return;
    }

    if (!stickWasActive)
    {
        // first activation: fire immediately, then wait INITIAL before repeating
        stickWasActive = true;
        stickRepeatTimer = STICK_REPEAT_INITIAL;
    }
    else
    {
        stickRepeatTimer -= timeDelta;
        if (stickRepeatTimer > 0) return;
        stickRepeatTimer = STICK_REPEAT_RATE;
    }

    // y-up convention: stick.y > 0 means UP, which is the previous item.
    if (ay > ax) focusBy(menu, stick.y > 0 ? -1 : +1);
    else         adjustFocused(menu, stick.x > 0 ? +1 : -1);
}

function gamepadClear(button, gp)
{
    // Clear only the pressed bit. Leaving the down bit set tells the
    // engine "still held" on the next frame so it doesn't re-trigger
    // pressed when the user is just holding the button down.
    inputClearKey(button, gp + 1, false, true, false);
}

function menusUpdate()
{
    handleKeyboard();
    handleGamepad();
    // Gamepad-driven click-to-reveal: A (0) or Start (9) when no menu is
    // up should reveal the registered menu(s) so the player isn't stuck on
    // the title art with no way back. Gamepad has no DOM event so we have
    // to poll here.
    if (clickToRevealHandlers.length && !isMenuVisible())
    {
        const gp = 0;
        const a = gamepadWasPressed(0, gp);
        const start = gamepadWasPressed(9, gp);
        if (a || start)
        {
            for (const h of clickToRevealHandlers) h.reveal();
            if (a) gamepadClear(0, gp);
            if (start) gamepadClear(9, gp);
        }
    }
    // Per-frame onUpdate hooks for visible menus. Skip hidden items so
    // a setVisible(false) custom item doesn't keep ticking. The
    // menu-level cfg.onUpdate fires before item-level ones — useful for
    // animating built-ins like the title element (cfg.onUpdate receives
    // the menu handle so it can grab getTitleEl() / getItem() / etc).
    for (const menu of allMenus)
    {
        if (menu._cfg.onUpdate) menu._cfg.onUpdate(menu);
        for (const item of menu._items)
        {
            if (!item.onUpdate) continue;
            if (item.el.classList.contains('ljs-hidden')) continue;
            item.onUpdate(item.el);
        }
    }
}

function isMenuVisible()
{
    // allMenus only contains currently-visible menus (push on show, splice
    // on hide), so a non-empty list means a menu is up.
    return allMenus.length > 0;
}

function showMenu(id)
{
    const m = menusById[id];
    if (m) m.show();
}

function hideMenu(id)
{
    const m = menusById[id];
    if (m) m.hide();
}

function getMenu(id)
{
    return menusById[id];
}

function getToolbar(id)
{
    return allToolbars.find(t => t.id === id);
}

function hideAllMenus()
{
    // iterate a copy because hide() mutates allMenus
    for (const m of [...allMenus]) m.hide();
}

// ============================================================================
// Item builders.
// ============================================================================

function buildMenuItem(item)
{
    if (item.type === 'label')     return buildLabel(item);
    if (item.type === 'text')      return buildText(item);
    if (item.type === 'separator') return buildSeparator(item);
    if (item.type === 'button')    return buildButton(item);
    if (item.type === 'toggle')    return buildToggle(item);
    if (item.type === 'slider')    return buildSlider(item);
    if (item.type === 'checkbox')  return buildCheckbox(item);
    if (item.type === 'color')     return buildColor(item);
    if (item.type === 'input')     return buildInput(item);
    if (item.type === 'grid')      return buildGrid(item);
    if (item.type === 'custom')    return buildCustom(item);
    console.warn('createMenu: unknown item type:', item.type);
    return null;
}

// Wraps a click handler with an activate-sound call. Used by every
// builder that wants click=activate semantics (button, toggle, checkbox,
// grid cell). Sliders intentionally don't use this — `input` events
// fire constantly during drag and would spam the sound.
//
// Also blurs DOM focus after the click handler runs. Without this, a
// later keypress (or gamepad input mapped to keyboard by Steam Input,
// browsers, etc.) would flip :focus-visible on the just-clicked element
// and outline it. Our setSelected() re-applies focus on nav, so dropping
// it here is safe.
function wireActivate(el, onClick)
{
    el.addEventListener('click', () =>
    {
        if (menuSounds.activate) menuSounds.activate();
        if (onClick) onClick();
        el.blur();
    });
}

function buildGrid(item)
{
    const columns = item.columns || 3;
    const wrap = document.createElement('div');
    wrap.className = 'ljs-menu-item ljs-menu-grid';
    wrap.style.setProperty('--ljs-grid-cols', columns);

    // Each cell is independent: cells with onClick become focusable
    // <button>s; the rest are display-only <div>s. Mixed grids are fine.
    const cells = (item.cells || []).map(cell => ({ ...cell }));
    const cellEls = [];
    const focusEls = [];
    cells.forEach((cell, i) =>
    {
        const interactive = !!cell.onClick;
        const cellEl = document.createElement(interactive ? 'button' : 'div');
        cellEl.className = 'ljs-grid-cell ' + (cell.earned ? 'earned' : 'unearned');
        // Auto-tooltip from `title` (explicit override) or `label` so a
        // mouseover always shows what the cell represents. Pass title:''
        // explicitly to suppress.
        const tip = cell.title !== undefined ? cell.title : cell.label;
        if (tip) cellEl.title = tip;

        const iconEl = document.createElement('div');
        iconEl.className = 'ljs-grid-icon';
        iconEl.textContent = cell.icon || '';

        const labelEl = document.createElement('div');
        labelEl.className = 'ljs-grid-label';
        labelEl.textContent = cell.label || '';

        cellEl.appendChild(iconEl);
        cellEl.appendChild(labelEl);
        wrap.appendChild(cellEl);
        cellEls.push(cellEl);

        if (interactive)
        {
            wireActivate(cellEl, () => cell.onClick(i));
            focusEls.push(cellEl);
        }
        else focusEls.push(null);
    });
    const anyFocusable = focusEls.some(Boolean);

    const handle = {
        type: 'grid',
        setLabel()     {},
        setValue()     {},
        getValue()     { return undefined; },
        setCell(index, props)
        {
            if (index < 0 || index >= cellEls.length) return;
            const cellEl = cellEls[index];
            if (props.earned !== undefined)
            {
                cells[index].earned = props.earned;
                cellEl.classList.toggle('earned',   !!props.earned);
                cellEl.classList.toggle('unearned', !props.earned);
            }
            if (props.icon  !== undefined) cellEl.querySelector('.ljs-grid-icon').textContent  = props.icon;
            if (props.label !== undefined) cellEl.querySelector('.ljs-grid-label').textContent = props.label;
        },
        setDisabled(d) { wrap.classList.toggle('disabled', !!d); handle._disabled = !!d; },
        isDisabled()   { return !!handle._disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
        _disabled: false,
    };
    if (item.disabled) handle.setDisabled(true);
    // focusEls (with nulls for non-focusable cells) lets focusableItems()
    // navigate cells individually. `columns` is exposed so the nav layer
    // can do 2D up/down/left/right inside the grid. Plain non-interactive
    // grids stay non-focusable.
    return anyFocusable
        ? { el: wrap, handle, focusEls, columns }
        : { el: wrap, handle, focusable: false, focusEl: null };
}

function buildSeparator(item)
{
    const el = document.createElement('div');
    el.className = 'ljs-menu-item ljs-menu-separator';
    const handle = {
        type: 'separator',
        setLabel()     {},
        setValue()     {},
        getValue()     { return undefined; },
        setDisabled()  {},
        isDisabled()   { return false; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
    };
    return { el, handle, focusable: false, focusEl: null };
}

function buildText(item)
{
    const el = document.createElement('div');
    el.className = 'ljs-menu-item ljs-menu-text';
    el.textContent = item.text || '';
    if (item.title) el.title = item.title;
    const handle = {
        type: 'text',
        setLabel(t)    { el.textContent = t; },
        setValue()     {},
        getValue()     { return undefined; },
        setDisabled(d) { el.classList.toggle('disabled', !!d); handle._disabled = !!d; },
        isDisabled()   { return !!handle._disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
        _disabled: false,
    };
    return { el, handle, focusable: false, focusEl: null };
}

function buildCustom(item)
{
    const el = item.el;
    if (!el)
    {
        console.warn('createMenu: custom item missing el');
        return null;
    }
    el.classList.add('ljs-menu-item');
    const handle = {
        type: 'custom',
        setLabel()     {},
        setValue()     {},
        getValue()     { return undefined; },
        setDisabled(d) { el.classList.toggle('disabled', !!d); handle._disabled = !!d; },
        isDisabled()   { return !!handle._disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
        _disabled: false,
    };
    // Opt-in keyboard/gamepad nav. The user is responsible for the click
    // handler and any activation behavior on focusEl (defaults to el).
    // The user should also call menuSounds.activate?.() if a sound is wanted.
    // (onUpdate is wired centrally in createMenu's item loop — works on any
    // item type including custom.)
    return item.focusable
        ? { el, handle, focusable: true, focusEl: item.focusEl || el }
        : { el, handle, focusable: false, focusEl: null };
}

function buildLabel(item)
{
    const el = document.createElement('div');
    el.className = 'ljs-menu-item';
    el.textContent = item.text || '';
    if (item.title) el.title = item.title;
    const handle = {
        type: 'label',
        setLabel(t)    { el.textContent = t; },
        setValue()     {},
        getValue()     { return undefined; },
        setDisabled(d) { el.classList.toggle('disabled', !!d); handle._disabled = !!d; },
        isDisabled()   { return !!handle._disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
        _disabled: false,
    };
    return { el, handle, focusable: false, focusEl: null };
}

function buildButton(item)
{
    const el = document.createElement('button');
    el.className = 'ljs-menu-item';
    el.textContent = item.label || '';
    if (item.title) el.title = item.title;
    wireActivate(el, item.onClick);
    const handle = {
        type: 'button',
        setLabel(t)    { el.textContent = t; },
        setValue()     {},
        getValue()     { return undefined; },
        setDisabled(d) { el.disabled = !!d; el.classList.toggle('disabled', !!d); },
        isDisabled()   { return el.disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    return { el, handle, focusable: true, focusEl: el };
}

// ============================================================================
// Persistent settings.
// ============================================================================
//
// slider / toggle / checkbox / color / input items accept `persist: 'key'`.
// The value is auto-loaded from localStorage on init and auto-saved on every
// change. When `persist` is set, onChange ALSO fires once at init time with
// the resolved value, so consumer effects (e.g. setSoundVolume) apply the
// persisted value immediately on load — you don't need a separate `applyX(
// getMenu(...).getItem(...).getValue())` call after createMenu.
//
//   {type:'slider', id:'volume', persist:'volume', value: 0.8,
//                   onChange: v => setSoundVolume(v)},

function persistedRead(key, defaultValue, kind)
{
    if (!key) return defaultValue;
    if (_saveName === null)
    {
        _warnPreInitOnce('persistedRead:' + key,
            'persist:"' + key + '" read before saveDataInit(name); using default');
        return defaultValue;
    }
    const raw = _gameSaveData.options?.[key];
    if (raw === undefined) return defaultValue;
    if (kind === 'number')
        return Number.isFinite(+raw) ? +raw : defaultValue;
    if (kind === 'boolean')
        return raw === true || raw === 'true';   // tolerate legacy string form
    return raw;
}

function persistedWrite(key, value)
{
    if (!key) return;
    if (_saveName === null)
    {
        _warnPreInitOnce('persistedWrite:' + key,
            'persist:"' + key + '" write before saveDataInit(name); ignoring');
        return;
    }
    if (!_gameSaveData.options) _gameSaveData.options = {};
    _gameSaveData.options[key] = value;
    writeSaveData(_saveName, _gameSaveData);
}

function buildToggle(item)
{
    const el = document.createElement('button');
    el.className = 'ljs-menu-item';
    if (item.title) el.title = item.title;
    let value = persistedRead(item.persist, !!item.value, 'boolean');
    let baseLabel = item.label || '';
    const render = () => { el.textContent = baseLabel + ': ' + (value ? 'ON' : 'OFF'); };
    render();
    wireActivate(el, () =>
    {
        value = !value;
        render();
        persistedWrite(item.persist, value);
        if (item.onChange) item.onChange(value);
    });
    const handle = {
        type: 'toggle',
        setLabel(t)    { baseLabel = t; render(); },
        setValue(v)    { value = !!v; render(); persistedWrite(item.persist, value); },
        getValue()     { return value; },
        setDisabled(d) { el.disabled = !!d; el.classList.toggle('disabled', !!d); },
        isDisabled()   { return el.disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    // Defer init onChange to a microtask so cross-references in the
    // consumer's handler (e.g. `getToolbar('hud').getItem(...)`) resolve
    // — by the time the microtask fires, the rest of gameInit has run
    // and any toolbars / sibling menus exist.
    if (item.persist && item.onChange)
        Promise.resolve().then(() => item.onChange(value));
    return { el, handle, focusable: true, focusEl: el };
}

function buildSlider(item)
{
    const wrap = document.createElement('div');
    wrap.className = 'ljs-menu-item ljs-slider';
    // Set title on both wrap and slider input — hovering the slider thumb
    // wouldn't otherwise inherit the wrap's tooltip (title doesn't cascade).
    if (item.title) wrap.title = item.title;

    const labelRow = document.createElement('div');
    labelRow.className = 'ljs-slider-row';
    const labelEl = document.createElement('span');
    labelEl.textContent = item.label || '';
    const valueEl = document.createElement('span');
    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);
    wrap.appendChild(labelRow);

    const slider = document.createElement('input');
    slider.type = 'range';
    if (item.title) slider.title = item.title;
    slider.min  = String(item.min ?? 0);
    slider.max  = String(item.max ?? 1);
    slider.step = item.step !== undefined
        ? String(item.step)
        : String(((item.max ?? 1) - (item.min ?? 0)) / 100);
    slider.value = String(persistedRead(item.persist, item.value ?? 0, 'number'));
    wrap.appendChild(slider);

    const renderValue = () => { valueEl.textContent = (+slider.value).toFixed(2); };
    renderValue();

    slider.addEventListener('input', () =>
    {
        renderValue();
        persistedWrite(item.persist, +slider.value);
        if (item.onChange) item.onChange(+slider.value);
    });

    const handle = {
        type: 'slider',
        setLabel(t)    { if (t instanceof Node) labelEl.replaceChildren(t); else labelEl.textContent = t; },
        // Defensive clamp + NaN guard. The browser also clamps `<input
        // type="range">`, but explicit clamp here keeps persistedWrite
        // honest and avoids surprising behavior if min/max change later.
        setValue(v)
        {
            const n = +v;
            const clamped = Number.isFinite(n)
                ? Math.max(+slider.min, Math.min(+slider.max, n))
                : +slider.min;
            slider.value = String(clamped);
            renderValue();
            persistedWrite(item.persist, clamped);
        },
        getValue()     { return +slider.value; },
        setDisabled(d) { slider.disabled = !!d; wrap.classList.toggle('disabled', !!d); },
        isDisabled()   { return slider.disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    if (item.persist && item.onChange)
        Promise.resolve().then(() => item.onChange(+slider.value));
    return { el: wrap, handle, focusable: true, focusEl: slider };
}

function buildCheckbox(item)
{
    const wrap = document.createElement('button');
    wrap.className = 'ljs-menu-item ljs-checkbox';
    if (item.title) wrap.title = item.title;

    const labelEl = document.createElement('span');
    labelEl.textContent = item.label || '';
    const boxEl = document.createElement('span');
    boxEl.className = 'ljs-checkbox-box';
    wrap.appendChild(labelEl);
    wrap.appendChild(boxEl);

    let value = persistedRead(item.persist, !!item.value, 'boolean');
    const render = () => { boxEl.textContent = value ? '✓' : ''; };
    render();

    wireActivate(wrap, () =>
    {
        value = !value;
        render();
        persistedWrite(item.persist, value);
        if (item.onChange) item.onChange(value);
    });

    const handle = {
        type: 'checkbox',
        setLabel(t)    { if (t instanceof Node) labelEl.replaceChildren(t); else labelEl.textContent = t; },
        setValue(v)    { value = !!v; render(); persistedWrite(item.persist, value); },
        getValue()     { return value; },
        setDisabled(d) { wrap.disabled = !!d; wrap.classList.toggle('disabled', !!d); },
        isDisabled()   { return wrap.disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    // Defer init onChange to a microtask so cross-references in the
    // consumer's handler (e.g. `getToolbar('hud').getItem(...)`) resolve
    // — by the time the microtask fires, the rest of gameInit has run
    // and any toolbars / sibling menus exist.
    if (item.persist && item.onChange)
        Promise.resolve().then(() => item.onChange(value));
    return { el: wrap, handle, focusable: true, focusEl: wrap };
}

function buildInput(item)
{
    const wrap = document.createElement('div');
    wrap.className = 'ljs-menu-item ljs-input';
    if (item.title) wrap.title = item.title;

    const labelEl = document.createElement('span');
    labelEl.textContent = item.label || '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ljs-input-field';
    input.value = persistedRead(item.persist, item.value || '', 'string');
    if (item.placeholder) input.placeholder = item.placeholder;
    if (item.maxLength) input.maxLength = item.maxLength;
    if (item.title) input.title = item.title;

    wrap.appendChild(labelEl);
    wrap.appendChild(input);

    // Fires per keystroke. handleKeyboard skips arrow/Enter/Space while
    // this input is focused, so typing is unaffected by menu nav.
    input.addEventListener('input', () =>
    {
        persistedWrite(item.persist, input.value);
        if (item.onChange) item.onChange(input.value);
    });

    const handle = {
        type: 'input',
        setLabel(t)    { if (t instanceof Node) labelEl.replaceChildren(t); else labelEl.textContent = t; },
        setValue(v)    { input.value = v == null ? '' : String(v); persistedWrite(item.persist, input.value); },
        getValue()     { return input.value; },
        setDisabled(d) { input.disabled = !!d; wrap.classList.toggle('disabled', !!d); },
        isDisabled()   { return input.disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    if (item.persist && item.onChange)
        Promise.resolve().then(() => item.onChange(input.value));
    return { el: wrap, handle, focusable: true, focusEl: input };
}

function buildColor(item)
{
    const wrap = document.createElement('div');
    wrap.className = 'ljs-menu-item ljs-color';
    if (item.title) wrap.title = item.title;

    const labelEl = document.createElement('span');
    labelEl.textContent = item.label || '';

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'ljs-color-input';
    input.value = persistedRead(item.persist, item.value || '#000000', 'string');
    if (item.title) input.title = item.title;

    wrap.appendChild(labelEl);
    wrap.appendChild(input);

    // `input` fires continuously while the user picks; `change` would fire
    // only on commit. Continuous feels right for a live preview.
    input.addEventListener('input', () =>
    {
        persistedWrite(item.persist, input.value);
        if (item.onChange) item.onChange(input.value);
    });
    // Activate sound on click — but don't blur (would close the picker).
    // The browser opens the native picker on click; keyboard activate via
    // setSelected -> .click() also opens it.
    input.addEventListener('click', () =>
    {
        if (menuSounds.activate) menuSounds.activate();
    });

    const handle = {
        type: 'color',
        setLabel(t)    { if (t instanceof Node) labelEl.replaceChildren(t); else labelEl.textContent = t; },
        setValue(v)    { input.value = v; persistedWrite(item.persist, input.value); },
        getValue()     { return input.value; },
        setDisabled(d) { input.disabled = !!d; wrap.classList.toggle('disabled', !!d); },
        isDisabled()   { return input.disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    if (item.persist && item.onChange)
        Promise.resolve().then(() => item.onChange(input.value));
    return { el: wrap, handle, focusable: true, focusEl: input };
}

// ============================================================================
// Toolbar item builders.
// ============================================================================

// Toolbar buttons wrap the label in a span so the icon glyph can scale
// independently of the button frame. CSS sets the button's font-size to
// 1em (so width/height in em stay correct) and the inner span to a larger
// em for the actual glyph rendering. Without this split, bumping the
// button's own font-size to enlarge the glyph would also rescale its
// em-based width/height — buttons grow when the icon does.
function buildToolbarLabelSpan(text)
{
    const span = document.createElement('span');
    span.className = 'ljs-toolbar-icon';
    // A label may be a DOM node (e.g. the 2×2 grid icon) instead of a glyph.
    if (text instanceof Node) span.appendChild(text);
    else span.textContent = text || '';
    return span;
}

// Unified line-icon set for toolbar buttons. Each entry is the inner SVG of a
// 0 0 24 24 viewBox drawn with fill:none + stroke:currentColor (set on the
// wrapping <svg> below), so all icons share one stroke language and inherit
// the button's color/size. buildSvgIcon(name) returns a fresh <svg> node usable
// directly as a toolbar item `label` (buildToolbarLabelSpan accepts a Node).
const _toolbarIconPaths = {
    // speaker + sound waves
    'volume-on':  '<path d="M11 5 6 9H2v6h4l5 4z"/>'
                + '<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    // speaker + X (muted)
    'volume-off': '<path d="M11 5 6 9H2v6h4l5 4z"/>'
                + '<path d="M22 9l-6 6M16 9l6 6"/>',
    // four corner brackets (expand)
    'fullscreen': '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3'
                + 'M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    // three bars (hamburger)
    'menu':       '<path d="M3 6h18M3 12h18M3 18h18"/>',
    // 2×2 filled squares (library). Filled via per-rect fill/stroke overrides
    // (the parent <svg> is fill:none/stroke:currentColor for the line icons).
    // Inset to 4..20 so the solid fill reads the same visual size as the line
    // icons' ~3..21 strokes — same viewBox + 1em sizing guarantees parity.
    'grid':       '<rect x="4"  y="4"  width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/>'
                + '<rect x="13" y="4"  width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/>'
                + '<rect x="4"  y="13" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/>'
                + '<rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/>',
};
function buildSvgIcon(name)
{
    // Parse via an HTML span: the parser switches into the SVG namespace for
    // the <svg> tag, so the result is a real SVG element (no createElementNS
    // bookkeeping). Returns the <svg> node to drop into a toolbar label span.
    const holder = document.createElement('span');
    holder.innerHTML =
        '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
      + 'stroke-linejoin="round" aria-hidden="true">'
      + (_toolbarIconPaths[name] || '') + '</svg>';
    return holder.firstElementChild;
}

// Filled 2×2 "library" icon — four solid rounded squares, matching the
// launcher's #hamburger drawer toggle (index.html). Used for the Library
// buttons (toolbar + orientation overlay) where we want the filled look
// rather than the line-art SVG set. currentColor + em so it themes/scales.
function buildGridIcon()
{
    const grid = document.createElement('span');
    grid.className = 'ljs-grid-icon';
    for (let i = 0; i < 4; i++) grid.appendChild(document.createElement('span'));
    return grid;
}

function buildToolbarButton(item)
{
    const el = document.createElement('button');
    const labelEl = buildToolbarLabelSpan(item.label);
    el.appendChild(labelEl);
    if (item.title) el.title = item.title;
    el.addEventListener('click', () =>
    {
        if (menuSounds.activate) menuSounds.activate();
        if (item.onClick) item.onClick();
        // Drop DOM focus so a later keypress (or gamepad-mapped-as-keyboard
        // input from Steam Input etc.) doesn't flip :focus-visible on this
        // button and outline it indefinitely. Toolbars are pointer-only.
        el.blur();
    });
    const handle = {
        type: 'button',
        setLabel(t)    { if (t instanceof Node) labelEl.replaceChildren(t); else labelEl.textContent = t; },
        setTitle(t)    { el.title = t || ''; },
        setValue()     {},
        getValue()     { return undefined; },
        setDisabled(d) { el.disabled = !!d; },
        isDisabled()   { return el.disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    return { el, handle };
}

function buildToolbarToggle(item)
{
    const el = document.createElement('button');
    const labelEl = buildToolbarLabelSpan(item.label);
    el.appendChild(labelEl);
    if (item.title) el.title = item.title;
    let value = !!item.value;
    const render = () => el.classList.toggle('toolbar-toggle-off', !value);
    render();
    el.addEventListener('click', () =>
    {
        if (menuSounds.activate) menuSounds.activate();
        value = !value;
        render();
        if (item.onChange) item.onChange(value);
        el.blur();   // see buildToolbarButton — toolbars are pointer-only
    });
    const handle = {
        type: 'toggle',
        setLabel(t)    { if (t instanceof Node) labelEl.replaceChildren(t); else labelEl.textContent = t; },
        setTitle(t)    { el.title = t || ''; },
        setValue(v)    { value = !!v; render(); },
        getValue()     { return value; },
        setDisabled(d) { el.disabled = !!d; },
        isDisabled()   { return el.disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    return { el, handle };
}
