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
//   2. #debug | #release | #min    URL hash flag  — one-shot too; just append it to the URL.
//                                                   Word-boundary matched, so it composes with
//                                                   other hash flags (e.g. games/snake.html#demo,debug).
//   3. localStorage['littlejs-build']             — set via littlejsBuild() in the console; sticks across ALL games
//   4. BUILD constant below                       — the shipped default
//
// document.write is the right tool here: called inline during the initial parse it
// is the supported, order-preserving way to inject a parser-blocking script. The
// "intervention" that blocks document.written scripts only applies to CROSS-origin
// scripts on slow links; the engine is same-origin (../dist/…), so it's exempt.
'use strict';
{
    const BUILD = 'release';            // shipped default: 'debug' | 'release' | 'min'
    const VER   = '1790925797986';      // engine cache-bust; bump on engine update
    const FILES = { debug: 'littlejs.js', release: 'littlejs.release.js', min: 'littlejs.min.js' };
    const KEY   = 'littlejs-build';

    // Console helper for games opened standalone (the launcher defines its own copy
    // in index.html that reloads the iframe). Call from the game page's console:
    //   littlejsBuild()            -> show the current build + available options
    //   littlejsBuild('debug')     -> run every game on the debug build (persists), reload
    //   littlejsBuild('release')   -> back to the shipped default build (clears the override)
    //   littlejsBuild('min')       -> minified release build
    window.littlejsBuild = function(build) {
        if (build === undefined) {
            console.log(
                '%clittlejs build:%c ' + (localStorage.getItem(KEY) || BUILD) + '%c\n' +
                'Options: ' + Object.keys(FILES).join(', ') + '   (' + BUILD + ' = default)\n' +
                "Switch every game with littlejsBuild('debug') / ('release') / ('min'), or littlejsDebug().\n" +
                'One-shot for this page only: append #debug (or #release / #min) to the URL.',
                'color: #f7c948; font-weight: bold;', 'color: #58a6ff; font-weight: bold;', 'color: #8b949e;'
            );
            return;
        }
        if (!FILES[build]) { console.warn("littlejsBuild: use 'debug', 'release', or 'min'"); return; }
        // The default build needs no override → clear it; others persist.
        if (build === BUILD) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, build);
        location.reload();
    };
    // Short alias — littlejsDebug() turns the debug build on for every game;
    // littlejsDebug(false) turns it back off (release default).
    window.littlejsDebug = (on = true) => window.littlejsBuild(on ? 'debug' : 'release');

    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}     // private-mode / disabled storage
    const param = new URLSearchParams(location.search).get('engine');
    // #debug / #release / #min hash flag — a one-shot like ?engine=, but trivial to append
    // to any URL. Word-boundary matched so it composes with other hash flags (e.g. the
    // cabinet's #demo → #demo,debug) without a false hit from a substring like "min".
    const hashFlag = (location.hash.match(/\b(debug|release|min)\b/) || [])[1];
    const build = (param && FILES[param]) ? param
                : (hashFlag && FILES[hashFlag]) ? hashFlag
                : (stored && FILES[stored]) ? stored
                : BUILD;
    document.write('<script src="../dist/' + FILES[build] + '?' + VER + '"><\/script>');

    // Typing #debug (or #release / #min) onto the URL of a page that is already open
    // only changes the hash, the page does not load again. Reload when the flag asks
    // for a different build than the one running, so the flag does what it says.
    addEventListener('hashchange', () => {
        const flag = (location.hash.match(/\b(debug|release|min)\b/) || [])[1];
        const wanted = (param && FILES[param]) ? param
                     : (flag && FILES[flag]) ? flag
                     : (stored && FILES[stored]) ? stored
                     : BUILD;
        if (wanted !== build) location.reload();
    });

    // Centrally apply engine settings every game shared, so they don't have to be
    // repeated in each file: silence the version/build console messages and hide the
    // corner debug watermark. These are top-level `let`s in the engine, so they don't
    // exist until the tag above executes — but classic scripts share one global lexical
    // scope, so this inline script (parser-blocking, runs right after the engine is
    // defined and before any game's engineInit) can flip them.
    document.write(`<script>
        showEngineVersion = false; // supress engine startup message
        canvasMinAspect = .4;
        canvasMaxAspect = 2.5;
        canvasMaxSize = vec2(2048); // use full canvas resolution for sharper rendering on high-DPI displays
        setCanvasPixelRatio(); // use device pixel ratio by default for sharper rendering
    <\/script>`);
}
