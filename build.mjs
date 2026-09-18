/**
 * LittleJS Build System (root, config-driven)
 * - Builds any game from examples/<gameName>/build.json
 * - Concatenates the engine + game source, minifies with terser,
 *   inlines into a single index.html, then zips it.
 *
 * Usage (from repo root):
 *   node build.mjs <gameName>     build one game
 *   node build.mjs --all          build every game that has a build.json
 *   node build.mjs                (no args) build the current working
 *                                  directory if it contains a build.json
 *                                  (standalone project mode)
 *
 * Build tools (terser, bestzip) are installed once at the repo root:
 *   npm install            (run once after cloning)
 *
 * Per-game config: examples/<gameName>/build.json
 *   {
 *       "title": "My Game",        // optional, defaults to name
 *       "name": "mygame",          // optional, defaults to folder name; output zip is <name>.zip
 *       "sources": ["game.js"],    // required, concatenated in order (engine NOT listed here)
 *       "data": ["tiles.png"],     // optional, copied into build and zipped
 *       "engine": "../../dist/littlejs.release.js", // optional; false omits the engine
 *       "keepIntermediate": false  // optional; keep build/index.js for debugging
 *   }
 * All paths in build.json are relative to the game folder.
 */

'use strict';

import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, 'examples');

function fail(message)
{
    console.error(`build.mjs: ${message}`);
    process.exit(1);
}

// dispatch on the CLI argument
const arg = process.argv[2];
if (arg === '--all' || arg === 'all')
    buildAll();
else if (arg)
    buildOne(arg);
else if (fs.existsSync(join(process.cwd(), 'build.json')))
    buildHere();
else
    fail('usage: node build.mjs <gameName> | --all (or run from a folder containing build.json)');

///////////////////////////////////////////////////////////////////////////////

// build a single game; on failure print the error and exit non-zero
function buildOne(gameName)
{
    try
    {
        buildGame(gameName);
    }
    catch (e)
    {
        fail(e.message);
    }
}

// build the current working directory as a standalone game folder
function buildHere()
{
    try
    {
        buildGameDir(process.cwd(), basename(process.cwd()));
    }
    catch (e)
    {
        fail(e.message);
    }
}

// build every game that has a build.json; continue past failures, then summarize
function buildAll()
{
    const names = fs.readdirSync(EXAMPLES_DIR)
        .filter(n => fs.existsSync(join(EXAMPLES_DIR, n, 'build.json')))
        .sort();

    if (!names.length)
        fail('no games with a build.json found under examples/');

    console.log(`Building ${names.length} games: ${names.join(', ')}`);
    console.log('');

    const failures = [];
    for (const name of names)
    {
        try
        {
            buildGame(name);
        }
        catch (e)
        {
            console.error(`Failed to build ${name}: ${e.message}`);
            failures.push(name);
        }
        console.log('');
    }

    if (failures.length)
        fail(`${failures.length} of ${names.length} build(s) failed: ${failures.join(', ')}`);

    console.log(`All ${names.length} builds completed!`);
}

///////////////////////////////////////////////////////////////////////////////

// Build one game by folder name. Throws Error on any failure so callers can
// decide whether to abort (single build) or continue (build --all).
function buildGame(gameName)
{
    const gameDir = join(EXAMPLES_DIR, gameName);
    if (!fs.existsSync(gameDir) || !fs.statSync(gameDir).isDirectory())
        throw new Error(`Game folder not found: examples/${gameName}`);
    buildGameDir(gameDir, gameName);
}

// Build one game from its folder. Throws Error on any failure so callers can
// decide whether to abort (single build) or continue (build --all).
function buildGameDir(gameDir, gameName)
{
    const configPath = join(gameDir, 'build.json');
    if (!fs.existsSync(configPath))
        throw new Error(`Config not found: ${configPath}`);

    let config;
    try
    {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    catch (e)
    {
        throw new Error(`Invalid JSON in ${configPath}: ${e.message}`);
    }

    // apply smart defaults
    const name = config.name ?? gameName;
    const title = config.title ?? name;
    const dataFiles = config.data ?? [];
    const keepIntermediate = config.keepIntermediate ?? false;
    const engine = config.engine === undefined
        ? '../../dist/littlejs.release.js'
        : config.engine; // may be a string path or false

    if (!Array.isArray(config.sources) || config.sources.length === 0)
        throw new Error('build.json: "sources" is required and must be a non-empty array');

    // prefer the release engine for shipping. A scaffolded project points
    // build.json at the debug build (littlejs.js) because that is what the
    // page loads while developing; once littlejs.release.js is copied beside
    // it, use that instead so the zip does not ship asserts, the watermark and
    // the "DEBUG build loaded" warning. Fall back the other way too, loudly.
    let engineResolved = engine;
    if (typeof engine === 'string')
    {
        const dir = dirname(engine), base = basename(engine);
        const release = join(dir, 'littlejs.release.js');
        const debug = join(dir, 'littlejs.js');
        if (base === 'littlejs.js' && fs.existsSync(join(gameDir, release)))
        {
            engineResolved = release;
            console.log('Using release engine build (littlejs.release.js)');
        }
        else if (base === 'littlejs.release.js' && !fs.existsSync(join(gameDir, engine))
            && fs.existsSync(join(gameDir, debug)))
        {
            engineResolved = debug;
            console.warn('Warning: littlejs.release.js not found, building with the DEBUG engine.');
            console.warn('         Copy littlejs.release.js beside littlejs.js before shipping.');
        }
        else if (base === 'littlejs.js')
        {
            console.warn('Warning: building with the DEBUG engine (no littlejs.release.js beside it).');
            console.warn('         Players will see the debug watermark; copy littlejs.release.js in before shipping.');
        }
    }

    // build the ordered concatenation list (engine first unless false)
    const sourceRelPaths = engineResolved === false
        ? [...config.sources]
        : [engineResolved, ...config.sources];

    // resolve to absolute paths and verify every input file exists
    const sourceFiles = sourceRelPaths.map(f => join(gameDir, f));
    for (let i = 0; i < sourceFiles.length; ++i)
        if (!fs.existsSync(sourceFiles[i]))
            throw new Error(`File not found: ${sourceRelPaths[i]} (from build.json sources)`);
    for (const f of dataFiles)
        if (!fs.existsSync(join(gameDir, f)))
            throw new Error(`File not found: ${f} (from build.json data)`);

    // output paths (in the game folder)
    const BUILD_FOLDER = join(gameDir, 'build');
    const SCRIPT_FILE = join(BUILD_FOLDER, 'index.js'); // intermediate, inlined into index.html
    const ZIP_PATH = join(gameDir, `${name}.zip`);

    console.log(`Building ${name}...`);
    const startTime = Date.now();

    // remove old output and set up a fresh build folder
    fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });
    fs.rmSync(ZIP_PATH, { force: true });
    fs.mkdirSync(BUILD_FOLDER);

    // copy data files into the build folder (flattened to basename so files from
    // outside the game folder, e.g. ../../dist/box2d.wasm.js, land beside the page)
    for (const file of dataFiles)
        fs.copyFileSync(join(gameDir, file), join(BUILD_FOLDER, basename(file)));

    // basenames of the build inputs the dev index.html loads via <script src>
    // (engine + sources), normalized so the dev engine tag matches the release
    // build input (littlejs.js <-> littlejs.release.js)
    const inputBasenames = new Set(sourceRelPaths.map(p => normalizeScriptName(basename(p))));

    // build steps are closures over this game's config so multiple games can be
    // built in one process (build --all) without leaking state between them
    function htmlBuildStep(filename)
    {
        console.log('Building html...');

        const bundle = `<script>${fs.readFileSync(filename)}\n</script>`;
        const htmlPath = join(gameDir, 'index.html');

        let outHtml;
        if (fs.existsSync(htmlPath))
        {
            // transform the game's own index.html: keep all of it, swap the dev
            // <script src> tags that load build inputs for the inlined bundle
            outHtml = transformGameHtml(fs.readFileSync(htmlPath, 'utf8'), inputBasenames, bundle);
        }
        else
        {
            // no dev index.html: fall back to generated boilerplate (uses title)
            outHtml =
                '<!DOCTYPE html><head>' +
                `<title>${title}</title>` +
                '<meta charset=utf-8>' +
                '</head><body>' +
                bundle;
        }

        fs.writeFileSync(join(BUILD_FOLDER, 'index.html'), outHtml, {flag: 'w+'});
    }

    function zipBuildStep()
    {
        console.log('Zipping...');
        const sources = ['index.html', ...dataFiles.map(f => basename(f))];
        execSync(`npx bestzip "../${name}.zip" ${sources.map(f => `"${f}"`).join(' ')}`,
            {cwd: BUILD_FOLDER, stdio: 'inherit'});
        console.log(`Size of ${name}.zip: ${fs.statSync(ZIP_PATH).size} bytes`);
    }

    Build
    (
        SCRIPT_FILE,
        sourceFiles,
        [minifyBuildStep, htmlBuildStep, zipBuildStep]
    );

    // leave the build folder matching the zip contents (drop the intermediate script)
    if (!keepIntermediate)
        fs.rmSync(SCRIPT_FILE, { force: true });

    console.log(`Build completed in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);
}

///////////////////////////////////////////////////////////////////////////////

// A single build with its own source files, build steps, and output file
// - each build step is a callback that accepts a single filename
function Build(outputFile, files=[], buildSteps=[])
{
    // concatenate source files into one buffer
    let buffer = '';
    for (const file of files)
        buffer += fs.readFileSync(file) + '\n';

    // write the combined output file
    fs.writeFileSync(outputFile, buffer, {flag: 'w+'});

    // execute build steps in order
    for (const buildStep of buildSteps)
        buildStep(outputFile);
}

function minifyBuildStep(filename)
{
    console.log('Running terser...');
    execSync(`npx terser "${filename}" -c -m -o "${filename}"`, {stdio: 'inherit'});
}

// normalize a <script src> basename for matching against build inputs:
// strip a .release or .min infix that sits right before .js so the dev engine
// tag (littlejs.js) matches the release build input (littlejs.release.js)
function normalizeScriptName(name)
{
    return name.replace(/\.(release|min)\.js$/i, '.js');
}

// true if a <script src> points at an external URL we must not rewrite
function isUrlSrc(src)
{
    return /^(https?:)?\/\//i.test(src) || /^data:/i.test(src);
}

// transform a game's dev index.html: keep the whole document, but
//  - replace the LAST <script src> that loads a build input with the inlined
//    bundle, and drop the other input tags (so any kept external script stays
//    ahead of the bundle - needed for box2d's loader to run before gameInit);
//  - rewrite a local (non-URL) non-input <script src> to its basename so it
//    resolves beside the flattened build output (e.g. ../../dist/box2d.wasm.js
//    -> box2d.wasm.js); URL/CDN srcs and inline <script> blocks are untouched.
// If no input tag is found, the bundle is injected before </body> with a warning.
function transformGameHtml(html, inputBasenames, bundle)
{
    const tagRe = /<script\b([^>]*)>\s*<\/script>/gi;
    const srcOf = attrs =>
    {
        const m = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
        return m ? (m[1] ?? m[2] ?? m[3]) : null;
    };
    const isInput = src => inputBasenames.has(normalizeScriptName(basename(src)));

    // pass 1: find the index (among <script src> tags, in order) of the LAST
    // input-matching tag. Only src tags are counted, so pass 2 can align.
    let scriptIdx = -1, lastInput = -1;
    for (const mm of html.matchAll(tagRe))
    {
        const src = srcOf(mm[1]);
        if (!src)
            continue;
        ++scriptIdx;
        if (isInput(src))
            lastInput = scriptIdx;
    }

    // pass 2: rebuild. seen advances only for src tags (inline tags return early
    // before ++seen), keeping it aligned with scriptIdx/lastInput from pass 1.
    let seen = -1;
    const out = html.replace(tagRe, (tag, attrs) =>
    {
        const src = srcOf(attrs);
        if (!src)
            return tag; // inline script - leave as-is

        const idx = ++seen;
        if (isInput(src))
            return idx === lastInput ? bundle : ''; // bundle at last input, drop the rest

        // non-input: rewrite local path to basename so it resolves in the zip
        if (isUrlSrc(src))
            return tag;
        return tag.replace(src, basename(src));
    });

    if (lastInput >= 0)
        return out;

    // no <script src> matched a build input: inject the bundle so the game still runs
    console.log('Warning: no matching <script src> in index.html; bundle appended');
    const closeBody = out.search(/<\/body>/i);
    if (closeBody >= 0)
        return out.slice(0, closeBody) + bundle + out.slice(closeBody);
    return out + bundle;
}
