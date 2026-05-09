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
// Item types:  label, text (wrapping paragraph), separator, button, toggle,
//              slider, checkbox, color (HTML5 picker), input (text field;
//              arrow/Enter/Space are passed to the field while focused),
//              grid (optional per-cell onClick + 2D nav), custom
//              (focusable: true to opt in).
// Tooltips:    pass `title:'...'` on any item; grids fall back to label.
//
// Sub-menu nav:    pushMenu(id), popMenu (wire as child's onHide),
//                  clearSubmenuStack (e.g. for QUIT-to-title flows).
// One-shot modals: showAlertDialog(msg, onOk, okLabel='BACK'),
//                  showConfirmDialog(msg, onYes, onNo).
// Toasts:          showMenuToast({icon, title, text, duration}) — DOM
//                  notification in the top-left, queued. MenuMedal
//                  (extends LittleJS Medal) auto-toasts on unlock().
// Lookups:         getMenu(id), getToolbar(id), getTopMenu(),
//                  isMenuVisible(), showMenu(id), hideMenu(id),
//                  hideAllMenus().
//
// Lifecycle hook: setMenuVisibilityCallback(v => paused = v) — fires once
// per show/hide for ALL menus including dialogs. Use this for paused-
// tracking; per-menu onShow/onHide are reserved for menu-specific logic.
//
// Inputs: mouse/touch always; keyboard (arrows/Enter/Esc, with arrow
// auto-repeat) and gamepad (d-pad/stick/A/B/Start) handled automatically
// when a menu is visible. Selection only auto-shows for keyboard/gamepad
// modality so pointer-mode opens don't drag a stale outline around.
// Toolbars are pointer-only.
//
// Sounds: setMenuSounds({select, activate}) wires global UI sounds.
// `select` fires on keyboard/gamepad nav; `activate` on click / Enter / A.
// playMenuSound('activate') lets game code (e.g. Esc -> showMenu('pause'))
// trigger the same sound as a toolbar-button-driven open.
//
// Theming: every color, font, size and spacing is a CSS variable on
// #littlejs-menus. Override any of them in your own <style>:
//   #littlejs-menus {
//       --menu-bg:           rgba(20, 0, 30, 0.95);
//       --menu-accent:       #f0a;
//       --menu-font:         'Orbitron', sans-serif;
//       --menu-border-width: 4px;
//   }
// See injectStyles() below for the full list of variables.

function createMenu(config)
{
    initMenuSystem();

    const cfg = Object.assign({
        id:            null,
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

    // panel element
    const panel = document.createElement('div');
    panel.className = 'ljs-menu-panel';
    menuSystemRoot.appendChild(panel);

    if (cfg.title)
    {
        const t = document.createElement('div');
        t.className = 'ljs-menu-title';
        t.textContent = cfg.title;
        panel.appendChild(t);
    }

    const itemHandles = {};
    const itemList = [];
    for (const item of cfg.items)
    {
        const built = buildMenuItem(item);
        if (!built) continue;
        built.itemId = item.id || null;
        panel.appendChild(built.el);
        itemList.push(built);
        if (item.id) itemHandles[item.id] = built.handle;
    }

    let visible = false;
    const handle = {
        id: cfg.id,
        show()
        {
            if (visible) return;
            visible = true;
            if (cfg.backdrop) backdrop.classList.add('visible');
            panel.classList.add('visible');
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
        hide()
        {
            if (!visible) return;
            visible = false;
            clearSelected();    // Clear outline when menu closes
            backdrop.classList.remove('visible');
            panel.classList.remove('visible');
            const i = allMenus.indexOf(handle);
            if (i >= 0) allMenus.splice(i, 1);
            if (cfg.onHide) cfg.onHide();
            fireMenuVisibility();
        },
        toggle() { visible ? handle.hide() : handle.show(); },
        isVisible() { return visible; },
        getItem(id) { return itemHandles[id]; },
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

function createToolbar(config)
{
    initMenuSystem();

    const cfg = Object.assign({
        id:        null,
        anchor:    'top-right',
        direction: 'horizontal',
        items:     [],
    }, config);

    const el = document.createElement('div');
    el.className = 'ljs-menu-toolbar anchor-' + cfg.anchor + ' dir-' + cfg.direction;
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
        cur.hide();
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
// Dialog helpers.
// ============================================================================
//
// One-shot modal helpers built on top of pushMenu. Both auto-pick a
// wrapping `text` item for long or multi-line messages and a centered
// `label` for short ones. Both push themselves over the current top menu
// (so the caller's panel doesn't bleed through visually) and restore the
// caller via popMenu when dismissed.
//
//   showAlertDialog('Saved.');                         // single OK/BACK
//   showConfirmDialog('Quit to title?', quitToTitle);  // YES/NO

// Single-button info dialog. For "you got a medal", "saved", "level
// description" — anywhere the player just needs to acknowledge. Default
// label is BACK because that matches the dismissal action in game menus.
// ============================================================================
// Toasts and achievement medals.
// ============================================================================
//
// `showMenuToast({icon, title, text, duration})` renders a DOM notification
// in the top-left (opposite corner from the standard top-right HUD toolbar).
// Toasts queue and play one at a time; later calls during a visible toast
// are appended. Pointer-events are disabled so toasts never intercept game
// clicks. Duration defaults to 5 seconds (slide-out included).
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
const toastQueue = [];
let currentToastEl = null;
let toastTimer = 0;

function showMenuToast(options)
{
    initMenuSystem();
    toastQueue.push(options || {});
    if (!currentToastEl) processToastQueue();
}

function processToastQueue()
{
    if (!toastQueue.length) { currentToastEl = null; return; }
    const opts = toastQueue.shift();

    const el = document.createElement('div');
    el.className = 'ljs-toast';

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
    currentToastEl = el;

    // Force a layout flush before adding the .visible class so the slide-in
    // transition actually plays. requestAnimationFrame queues us for after
    // the next render pass — same trick the menu panel uses implicitly via
    // its display:none -> display:flex transition not being animated.
    requestAnimationFrame(() => el.classList.add('visible'));

    const duration = (opts.duration || TOAST_DURATION_DEFAULT) * 1000;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() =>
    {
        el.classList.remove('visible');
        setTimeout(() =>
        {
            el.remove();
            processToastQueue();
        }, TOAST_SLIDE_MS);
    }, duration);
}

class MenuMedal extends Medal
{
    /** Override of Medal.unlock() that routes the unlock notification to our
     *  DOM toast queue instead of the engine's canvas display queue.
     *  Same persistence (localStorage via storageKey()), same lookup map
     *  (engine's `medals[id]`) — only the visual display differs. */
    unlock()
    {
        if (this.unlocked) return;
        // Honor the engine's debug "prevent unlock" flag if it's been set.
        if (typeof medalsPreventUnlock !== 'undefined' && medalsPreventUnlock) return;
        localStorage[this.storageKey()] = this.unlocked = true;
        showMenuToast({
            icon:  this.icon,
            title: this.name,
            text:  this.description,
        });
    }
}

function showAlertDialog(message, onOk, okLabel)
{
    const id = '__ljs-alert-' + (Math.random() * 1e9 | 0);
    const useText = message.length > 40 || message.includes('\n');
    const dialog = createMenu({
        id,
        dismissable:   true,         // BACK / Esc / B / backdrop all close it
        initialItemId: 'ok',
        onHide:        popMenu,
        items: [
            useText
                ? {type:'text',  text: message}
                : {type:'label', text: message},
            {type:'button', id:'ok', label: okLabel || 'BACK', onClick: () =>
            {
                dialog.destroy();    // hide -> onHide -> restore parent
                if (onOk) onOk();
            }},
        ],
    });
    pushMenu(id);
}

// Two-button confirmation. Defaults selection to NO (safe choice). YES
// clears the submenu stack so the caller can branch (e.g. QUIT to title);
// NO closes the dialog and restores the parent.
function showConfirmDialog(message, onYes, onNo)
{
    const id = '__ljs-confirm-' + (Math.random() * 1e9 | 0);
    const useText = message.length > 40 || message.includes('\n');
    const dialog = createMenu({
        id,
        dismissable:   false,
        initialItemId: 'no',
        onHide:        popMenu,
        items: [
            useText
                ? {type:'text',  text: message}
                : {type:'label', text: message},
            {type:'button', id:'yes', label:'YES', onClick: () =>
            {
                clearSubmenuStack();   // YES means caller decides what's next
                dialog.destroy();
                if (onYes) onYes();
            }},
            {type:'button', id:'no',  label:'NO',  onClick: () =>
            {
                dialog.destroy();      // hide -> onHide -> restore parent
                if (onNo) onNo();
            }},
        ],
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
    menuSounds.select   = sounds.select   || null;
    menuSounds.activate = sounds.activate || null;
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
function fireMenuVisibility()
{
    if (menuVisibilityCallback) menuVisibilityCallback(isMenuVisible());
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
    /* shared */
    --menu-bg:           rgba(0, 0, 0, 0.85);
    --menu-fg:           #fff;
    --menu-accent:       #6cf;
    --menu-disabled:     #666;
    --menu-radius:       12px;
    --menu-font:         monospace;
    --menu-border-color: var(--menu-accent);
    --menu-border-width: 2px;
    --menu-title-size:   28px;
    --menu-item-size:    18px;

    /* button fill */
    --menu-item-bg:       rgba(255, 255, 255, 0.06);
    --menu-item-hover-bg: rgba(255, 255, 255, 0.18);

    /* modal menus */
    --menu-backdrop:     rgba(0, 0, 0, 0.5);
    --menu-padding:      24px;
    --menu-item-gap:     10px;
    --menu-min-width:    min(320px, 90vw);
    --menu-max-width:    min(90vw, 480px);
    --menu-max-height:   90vh;

    /* toolbars */
    --toolbar-gap:       6px;
    --toolbar-margin:    12px;
    --toolbar-icon-size: 48px;
    --toolbar-bg:        transparent;

    /* toasts (achievement / notification pop-ups, top-left) */
    --toast-margin:      12px;
    --toast-min-width:   240px;
    --toast-max-width:   320px;
    --toast-padding:     10px 14px;
    --toast-icon-size:   32px;
    --toast-title-size:  14px;
    --toast-text-size:   12px;
}
/* Single visibility class wins over every display rule below. setVisible()
   on every item type — and the toolbar parent — toggles this class. */
.ljs-hidden { display: none !important; }

.ljs-menu-backdrop {
    position: fixed; inset: 0; z-index: 999;
    background: var(--menu-backdrop);
    display: none;
}
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
.ljs-menu-panel.visible { display: flex; }
.ljs-menu-title {
    font-size: var(--menu-title-size); font-weight: bold; text-align: center;
    color: var(--menu-accent); margin-bottom: 8px;
}
.ljs-menu-item {
    font-size: var(--menu-item-size); text-align: center;
    padding: 10px 14px; box-sizing: border-box;
}
.ljs-menu-item.disabled { color: var(--menu-disabled); pointer-events: none; }
button.ljs-menu-item, input.ljs-menu-item {
    font-family: inherit; font-size: inherit;
    background: var(--menu-item-bg); color: inherit;
    border: 2px solid transparent; border-radius: 8px;
    cursor: pointer;
}
/* Hover shows the accent border + brighter fill (mouse feedback). The
   selection outline shows when arrow/d-pad nav has explicitly selected
   an item (.ljs-selected) or when the browser's native keyboard focus
   traversal is in use (:focus-visible — Tab nav). Mouse-clicking a
   button does not produce an outline — the click is enough feedback. */
button.ljs-menu-item:hover {
    background: var(--menu-item-hover-bg);
    border-color: var(--menu-accent); outline: none;
}
.ljs-menu-item.ljs-selected,
button.ljs-menu-item:focus-visible,
.ljs-grid-cell.ljs-selected,
.ljs-grid-cell:focus-visible {
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
    border: 2px solid currentColor; border-radius: 4px;
    display: inline-flex; align-items: center; justify-content: center;
}
.ljs-menu-item.ljs-color {
    display: flex; justify-content: space-between; align-items: center;
}
.ljs-menu-item.ljs-input {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
}
.ljs-input-field {
    flex: 1; min-width: 0;
    background: var(--menu-item-bg); color: inherit;
    font-family: inherit; font-size: inherit;
    border: 2px solid transparent; border-radius: 4px;
    padding: 4px 8px; box-sizing: border-box;
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
.ljs-menu-item.ljs-menu-separator {
    padding: 0; margin: 4px 0; height: 0;
    border-top: 1px solid var(--menu-border-color);
    opacity: 0.4;
}
.ljs-menu-item.ljs-menu-grid {
    display: grid;
    grid-template-columns: repeat(var(--ljs-grid-cols, 3), minmax(0, 1fr));
    gap: var(--menu-grid-gap, 8px);
    padding: 4px 0;
}
.ljs-grid-cell {
    display: flex; flex-direction: column; align-items: center;
    gap: 4px; padding: 10px 6px;
    border: 2px solid transparent; border-radius: 8px; text-align: center;
    background: transparent; color: inherit;
    font-family: inherit; font-size: inherit;
    transition: opacity 0.2s, filter 0.2s, background 0.15s;
}
button.ljs-grid-cell { cursor: pointer; }
button.ljs-grid-cell:hover {
    background: var(--menu-item-hover-bg); border-color: var(--menu-accent);
    outline: none;
}
.ljs-grid-cell.unearned { opacity: 0.3; filter: grayscale(1); }
.ljs-grid-icon  { font-size: var(--menu-grid-icon-size, 32px); line-height: 1; }
.ljs-grid-label { font-size: 11px; color: var(--menu-fg); word-break: break-word; }
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
.ljs-menu-toolbar button {
    width: var(--toolbar-icon-size); height: var(--toolbar-icon-size);
    font-family: var(--menu-font); font-size: 28px;
    color: var(--menu-fg); background: transparent;
    border: none; border-radius: 8px; cursor: pointer;
    outline: none;        /* toolbars are pointer-only; never draw focus rings */
}
.ljs-menu-toolbar button:focus-visible { outline: none; }
.ljs-menu-toolbar button:hover { background: rgba(255,255,255,0.15); }
.ljs-menu-toolbar button.toolbar-toggle-off { opacity: 0.4; }

/* Toast: top-left, slides in/out, never intercepts clicks (so it can't
   block gameplay even if the player aims through that area). */
.ljs-toast {
    position: fixed; top: var(--toast-margin); left: var(--toast-margin);
    z-index: 10000; pointer-events: none;
    background: var(--menu-bg); color: var(--menu-fg);
    font-family: var(--menu-font);
    border: var(--menu-border-width) solid var(--menu-border-color);
    border-radius: var(--menu-radius);
    padding: var(--toast-padding); box-sizing: border-box;
    min-width: var(--toast-min-width); max-width: var(--toast-max-width);
    display: flex; gap: 10px; align-items: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    transform: translateX(calc(-100% - var(--toast-margin) * 2));
    transition: transform 0.3s ease-out;
}
.ljs-toast.visible { transform: translateX(0); }
.ljs-toast-icon { font-size: var(--toast-icon-size); line-height: 1; }
.ljs-toast-content { flex: 1; min-width: 0; }
.ljs-toast-title { font-size: var(--toast-title-size); font-weight: bold; color: var(--menu-accent); }
.ljs-toast-text { font-size: var(--toast-text-size); opacity: 0.85; word-break: break-word; }
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

function initMenuSystem()
{
    if (menuSystemRoot) return;

    injectStyles();

    menuSystemRoot = document.createElement('div');
    menuSystemRoot.id = 'littlejs-menus';
    document.body.appendChild(menuSystemRoot);

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
        // Off the grid edge — fall through to sequential step which exits
        // the grid into the next/prev focusable item in the menu.
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
    if (gamepadWasPressed(1, gp) || gamepadWasPressed(9, gp))
    {
        // Both B and Start back out of the current menu (when dismissable).
        if (menu._cfg.dismissable) menu.hide();
        gamepadClear(1, gp);
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

function buildToggle(item)
{
    const el = document.createElement('button');
    el.className = 'ljs-menu-item';
    if (item.title) el.title = item.title;
    let value = !!item.value;
    let baseLabel = item.label || '';
    const render = () => { el.textContent = baseLabel + ': ' + (value ? 'ON' : 'OFF'); };
    render();
    wireActivate(el, () =>
    {
        value = !value;
        render();
        if (item.onChange) item.onChange(value);
    });
    const handle = {
        type: 'toggle',
        setLabel(t)    { baseLabel = t; render(); },
        setValue(v)    { value = !!v; render(); },
        getValue()     { return value; },
        setDisabled(d) { el.disabled = !!d; el.classList.toggle('disabled', !!d); },
        isDisabled()   { return el.disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
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
    slider.value = String(item.value ?? 0);
    wrap.appendChild(slider);

    const renderValue = () => { valueEl.textContent = (+slider.value).toFixed(2); };
    renderValue();

    slider.addEventListener('input', () =>
    {
        renderValue();
        if (item.onChange) item.onChange(+slider.value);
    });

    const handle = {
        type: 'slider',
        setLabel(t)    { labelEl.textContent = t; },
        setValue(v)    { slider.value = String(v); renderValue(); },
        getValue()     { return +slider.value; },
        setDisabled(d) { slider.disabled = !!d; wrap.classList.toggle('disabled', !!d); },
        isDisabled()   { return slider.disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
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

    let value = !!item.value;
    const render = () => { boxEl.textContent = value ? '✓' : ''; };
    render();

    wireActivate(wrap, () =>
    {
        value = !value;
        render();
        if (item.onChange) item.onChange(value);
    });

    const handle = {
        type: 'checkbox',
        setLabel(t)    { labelEl.textContent = t; },
        setValue(v)    { value = !!v; render(); },
        getValue()     { return value; },
        setDisabled(d) { wrap.disabled = !!d; wrap.classList.toggle('disabled', !!d); },
        isDisabled()   { return wrap.disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
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
    input.value = item.value || '';
    if (item.placeholder) input.placeholder = item.placeholder;
    if (item.maxLength) input.maxLength = item.maxLength;
    if (item.title) input.title = item.title;

    wrap.appendChild(labelEl);
    wrap.appendChild(input);

    // Fires per keystroke. handleKeyboard skips arrow/Enter/Space while
    // this input is focused, so typing is unaffected by menu nav.
    input.addEventListener('input', () =>
    {
        if (item.onChange) item.onChange(input.value);
    });

    const handle = {
        type: 'input',
        setLabel(t)    { labelEl.textContent = t; },
        setValue(v)    { input.value = v == null ? '' : String(v); },
        getValue()     { return input.value; },
        setDisabled(d) { input.disabled = !!d; wrap.classList.toggle('disabled', !!d); },
        isDisabled()   { return input.disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
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
    input.value = item.value || '#000000';
    if (item.title) input.title = item.title;

    wrap.appendChild(labelEl);
    wrap.appendChild(input);

    // `input` fires continuously while the user picks; `change` would fire
    // only on commit. Continuous feels right for a live preview.
    input.addEventListener('input', () =>
    {
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
        setLabel(t)    { labelEl.textContent = t; },
        setValue(v)    { input.value = v; },
        getValue()     { return input.value; },
        setDisabled(d) { input.disabled = !!d; wrap.classList.toggle('disabled', !!d); },
        isDisabled()   { return input.disabled; },
        setVisible(v)  { wrap.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    return { el: wrap, handle, focusable: true, focusEl: input };
}

// ============================================================================
// Toolbar item builders.
// ============================================================================

function buildToolbarButton(item)
{
    const el = document.createElement('button');
    el.textContent = item.label || '';
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
        setLabel(t)    { el.textContent = t; },
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
    el.textContent = item.label || '';
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
        setLabel(t)    { el.textContent = t; },
        setValue(v)    { value = !!v; render(); },
        getValue()     { return value; },
        setDisabled(d) { el.disabled = !!d; },
        isDisabled()   { return el.disabled; },
        setVisible(v)  { el.classList.toggle('ljs-hidden', !v); },
    };
    if (item.disabled) handle.setDisabled(true);
    return { el, handle };
}
