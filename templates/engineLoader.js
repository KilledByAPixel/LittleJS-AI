// LittleJS Arcade — engine build loader.
//
// Single source of truth for which LittleJS build every game loads. Each game and
// template includes THIS instead of a direct <script src="../dist/littlejs*.js">.
// It synchronously document.writes the real engine tag — a parser-blocking script
// inserted right after this one, so the engine is fully defined before the template
// helpers and inline game code that follow (identical load order to a direct tag).
//
// Build selection precedence (highest first):
//   1. ?engine=debug|release|min   URL param      — one-shot spot check on a single game
//   2. localStorage['littlejs-build']             — set via littlejsBuild() in the console; sticks across ALL games
//   3. BUILD constant below                       — the shipped default
//
// document.write is the right tool here: called inline during the initial parse it
// is the supported, order-preserving way to inject a parser-blocking script. The
// "intervention" that blocks document.written scripts only applies to CROSS-origin
// scripts on slow links; the engine is same-origin (../dist/…), so it's exempt.
'use strict';
{
    const BUILD = 'release';            // shipped default: 'debug' | 'release' | 'min'
    const VER   = '1780292569262';      // engine cache-bust; bump on engine update
    const FILES = { debug: 'littlejs.js', release: 'littlejs.release.js', min: 'littlejs.min.js' };
    const KEY   = 'littlejs-build';

    // Console helper for games opened standalone (the launcher defines its own copy
    // in index.html that reloads the iframe). Call from the game page's console:
    //   littlejsBuild()            -> log the current override
    //   littlejsBuild('debug')     -> run every game on the debug build (persists), reload
    //   littlejsBuild('release'|'min')
    //   littlejsBuild('default')   -> clear the override, reload
    window.littlejsBuild = function(build) {
        if (build === undefined) {
            console.log('littlejs build override:', localStorage.getItem(KEY) || '(none — default: ' + BUILD + ')');
            return;
        }
        if (build === 'default' || build === null) localStorage.removeItem(KEY);
        else if (FILES[build]) localStorage.setItem(KEY, build);
        else { console.warn("littlejsBuild: use 'debug' | 'release' | 'min' | 'default'"); return; }
        location.reload();
    };

    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}     // private-mode / disabled storage
    const param = new URLSearchParams(location.search).get('engine');
    const build = (param && FILES[param]) ? param
                : (stored && FILES[stored]) ? stored
                : BUILD;
    document.write('<script src="../dist/' + FILES[build] + '?' + VER + '"><\/script>');
}
