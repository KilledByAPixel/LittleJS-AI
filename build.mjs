/**
 * LittleJS Build System (root, config-driven)
 * - Builds any game from games/<gameName>/build.json
 * - Concatenates the engine + game source, minifies with terser,
 *   inlines into a single index.html, then zips it.
 *
 * Usage (from repo root):
 *   node build.mjs <gameName>     build one game
 *   node build.mjs --all          build every game that has a build.json
 *
 * Build tools (terser, bestzip) are installed once at the repo root:
 *   npm install            (run once after cloning)
 *
 * Per-game config: games/<gameName>/build.json
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
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = join(__dirname, 'games');

function fail(message)
{
    console.error(`build.mjs: ${message}`);
    process.exit(1);
}

// dispatch on the CLI argument
const arg = process.argv[2];
if (!arg)
    fail('usage: node build.mjs <gameName> | --all');

if (arg === '--all' || arg === 'all')
    buildAll();
else
    buildOne(arg);

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

// build every game that has a build.json; continue past failures, then summarize
function buildAll()
{
    const names = fs.readdirSync(GAMES_DIR)
        .filter(n => fs.existsSync(join(GAMES_DIR, n, 'build.json')))
        .sort();

    if (!names.length)
        fail('no games with a build.json found under games/');

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
    const gameDir = join(GAMES_DIR, gameName);
    if (!fs.existsSync(gameDir) || !fs.statSync(gameDir).isDirectory())
        throw new Error(`Game folder not found: games/${gameName}`);

    const configPath = join(gameDir, 'build.json');
    if (!fs.existsSync(configPath))
        throw new Error(`Config not found: games/${gameName}/build.json`);

    let config;
    try
    {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    catch (e)
    {
        throw new Error(`Invalid JSON in games/${gameName}/build.json: ${e.message}`);
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

    // build the ordered concatenation list (engine first unless false)
    const sourceRelPaths = engine === false
        ? [...config.sources]
        : [engine, ...config.sources];

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

    // copy data files into the build folder
    for (const file of dataFiles)
        fs.copyFileSync(join(gameDir, file), join(BUILD_FOLDER, file));

    // build steps are closures over this game's config so multiple games can be
    // built in one process (build --all) without leaking state between them
    function htmlBuildStep(filename)
    {
        console.log('Building html...');

        // inline the minified script into a single html file
        let buffer = '';
        buffer += '<!DOCTYPE html>';
        buffer += '<head>';
        buffer += `<title>${title}</title>`;
        buffer += '<meta charset=utf-8>';
        buffer += '</head>';
        buffer += '<body>';
        buffer += '<script>';
        buffer += fs.readFileSync(filename) + '\n';
        buffer += '</script>';

        // output html file
        fs.writeFileSync(join(BUILD_FOLDER, 'index.html'), buffer, {flag: 'w+'});
    }

    function zipBuildStep()
    {
        console.log('Zipping...');
        const sources = ['index.html', ...dataFiles];
        execSync(`npx bestzip ../${name}.zip ${sources.join(' ')}`,
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
    execSync(`npx terser ${filename} -c -m -o ${filename}`, {stdio: 'inherit'});
}
