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
// Lookups:         getMenu(id), getToolbar(id), getTopMenu(),
//                  isMenuVisible(), showMenu(id), hideMenu(id),
//                  hideAllMenus().
//
// Lifecycle hook: setMenuVisibilityCallback(v => paused = v) — fires once
// per show/hide for ALL menus including dialogs. Use this for paused-
// tracking; per-menu onShow/onHide are reserved for menu-specific logic.
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
// trigger the same sound as a toolbar-button-driven open.
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
//   {type:'slider', id:'volume', persist:'mygame.volume', value: 0.8,
//    min:0, max:1, onChange: v => setSoundVolume(v)}
// On reload, persist re-applies the saved value via onChange before any
// menu sound has a chance to play, so the very first nav sound is at the
// user-visible volume.
//
// MenuMedal extends LittleJS's Medal so unlocks fire a DOM toast (top-left)
// instead of the engine's canvas overlay. Same `medalsInit('SaveName')`
// call, same `medals[id]` map — just a different display path.

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
        panel.appendChild(built.el);
        itemList.push(built);
        if (item.id) itemHandles[item.id] = built.handle;
        // hideOnTouch: same convenience flag toolbar items have. Useful for
        // FULLSCREEN buttons (mobile browsers' fullscreen story is messy)
        // and similar mouse-keyboard-only menu items.
        if (item.hideOnTouch && isTouchDevice) built.handle.setVisible(false);
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
//           {type:'button', label:'ABOUT',   onClick: () => pushMenu('about')},
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
        onPlay:        null,
        playLabel:     'PLAY',
        itemsBefore:   [],
        items:         [],
        revealOnClick: true,
        canReveal:     null,
        onShow:        null,
        onHide:        null,
    }, config);

    // run user onPlay first, then auto-hide so consumers don't have to call
    // hideMenu(id) themselves in every play handler
    const playFn = () =>
    {
        if (cfg.onPlay) cfg.onPlay();
        hideMenu(cfg.id);
    };

    const menu = createMenu({
        id:           cfg.id,
        title:        cfg.title,
        subtitle:     cfg.subtitle,
        dismissable:  false,
        onStart:      playFn,
        onShow:       cfg.onShow,
        onHide:       cfg.onHide,
        items: [
            ...cfg.itemsBefore,
            {type:'button', id:'play', label: cfg.playLabel, onClick: playFn},
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
// non-zero value; state persists per-page in localStorage under the
// `muteStorageKey` (default 'menu.muted'). Pass `mute: false` to skip the
// button entirely — sequencer-style games where muting makes no sense.
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
function installDefaultToolbar(opts)
{
    opts = Object.assign({
        id:               'hud',
        anchor:           'top-right',
        direction:        'horizontal',
        mute:             true,
        fullscreen:       true,
        pauseMenuId:      'pause',
        titleMenuId:      'title',
        titleDismissable: false,
        muteStorageKey:   'menu.muted',
        muteLabelOn:      '🔊',
        muteLabelOff:     '🔇',
        extraItemsBefore: [],
        extraItemsAfter:  [],
    }, opts || {});

    const items = [];
    items.push(...opts.extraItemsBefore);

    if (opts.mute)
    {
        // Persisted mute state. Saved volume restores on unmute so the
        // user's volume preference (set via an OPTIONS slider) survives.
        let muted = localStorage.getItem(opts.muteStorageKey) === '1';
        let savedVolume = (typeof soundVolume === 'number' && soundVolume > 0)
            ? soundVolume : 0.3;
        if (muted && typeof setSoundVolume === 'function')
            setSoundVolume(0);

        items.push({
            type: 'button',
            id:   'mute',
            label: muted ? opts.muteLabelOff : opts.muteLabelOn,
            title: muted ? 'Unmute' : 'Mute',
            onClick: () =>
            {
                muted = !muted;
                if (muted)
                {
                    if (typeof soundVolume === 'number' && soundVolume > 0)
                        savedVolume = soundVolume;
                    if (typeof setSoundVolume === 'function') setSoundVolume(0);
                }
                else
                {
                    if (typeof setSoundVolume === 'function')
                        setSoundVolume(savedVolume || 0.3);
                }
                localStorage.setItem(opts.muteStorageKey, muted ? '1' : '0');
                const item = getToolbar(opts.id)?.getItem('mute');
                if (item)
                {
                    item.setLabel(muted ? opts.muteLabelOff : opts.muteLabelOn);
                    item.setTitle?.(muted ? 'Unmute' : 'Mute');
                }
            },
        });
    }

    if (opts.fullscreen)
    {
        items.push({
            type: 'button',
            id:   'fs',
            label: '⛶',
            title: 'Toggle fullscreen',
            onClick: toggleFullscreen,
            hideOnTouch: true,
        });
    }

    items.push(...opts.extraItemsAfter);

    items.push({
        type: 'button',
        id:   'menu',
        label: '☰',
        title: 'Menu',
        onClick: () =>
        {
            const top = getTopMenu();
            // Title is on top — leave it up (no useful exit). Games that
            // genuinely want to dismiss the title set titleDismissable.
            if (top && top.id === opts.titleMenuId && !opts.titleDismissable)
                return;
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
        items,
    });
    toolbar.show();

    // Gray the hamburger whenever the title menu is on top (and not
    // dismissable). Keeps the button visible so the bar layout doesn't
    // shift, but blocks clicks so the player can't dismiss the title.
    function updateHamburgerGrayed()
    {
        const item = toolbar.getItem('menu');
        if (!item) return;
        const top = getTopMenu();
        const grayed = top && top.id === opts.titleMenuId && !opts.titleDismissable;
        item.setDisabled(!!grayed);
    }
    _addInternalVisibilityListener(updateHamburgerGrayed);
    updateHamburgerGrayed();

    return toolbar;
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
    const position = opts.position || 'top-left';
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
        dismissable:   true,         // BACK / Esc / B / backdrop all close it
        initialItemId: 'ok',
        onHide:        popMenu,
        items,
    });
    pushMenu(id);
}

// Two-button confirmation. Defaults selection to NO (safe choice). YES
// clears the submenu stack so the caller can branch (e.g. QUIT to title);
// NO closes the dialog and restores the parent.
//
//   showConfirmDialog({message, title?, icon?, onYes?, onNo?,
//                      yesLabel?, noLabel?})
//
// `dismissable` is false — Esc/B/Start/backdrop all do nothing, forcing
// an explicit choice. yesLabel / noLabel default to 'YES' / 'NO'.

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
        clearSubmenuStack();   // YES means caller decides what's next
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
// Internal listeners — used by built-in features (e.g. installDefaultToolbar)
// that need to react to menu changes without stomping the user's callback.
const _internalVisibilityListeners = [];
function _addInternalVisibilityListener(fn) { _internalVisibilityListeners.push(fn); }
function fireMenuVisibility()
{
    const v = isMenuVisible();
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
    color: var(--menu-accent); margin-bottom: 0.5em;
}
.ljs-menu-subtitle {
    font-size: 0.875em; font-weight: bold; text-align: center;
    letter-spacing: 0.15em; color: var(--menu-fg); opacity: 0.85;
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
//   {type:'slider', id:'volume', persist:'mygame.volume', value: 0.8,
//                   onChange: v => setSoundVolume(v)},

function persistedRead(key, defaultValue, kind)
{
    if (!key) return defaultValue;
    try
    {
        const raw = localStorage.getItem(key);
        if (raw === null) return defaultValue;
        if (kind === 'number')  return Number.isFinite(+raw) ? +raw : defaultValue;
        if (kind === 'boolean') return raw === 'true';
        return raw;
    }
    catch (e) { return defaultValue; }
}

function persistedWrite(key, value)
{
    if (!key) return;
    try { localStorage.setItem(key, String(value)); }
    catch (e) { /* quota / privacy / disabled storage — ignore */ }
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
        setLabel(t)    { labelEl.textContent = t; },
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
        setLabel(t)    { labelEl.textContent = t; },
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
        setLabel(t)    { labelEl.textContent = t; },
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
        setLabel(t)    { labelEl.textContent = t; },
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
    span.textContent = text || '';
    return span;
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
        setLabel(t)    { labelEl.textContent = t; },
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
        setLabel(t)    { labelEl.textContent = t; },
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
