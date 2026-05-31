/**
 * LittleJS Build System (root, config-driven)
 * - Builds any game from games/<gameName>/build.json
 * - Concatenates the engine + game source, minifies with terser,
 *   inlines into a single index.html, then zips it.
 *
 * Usage (from repo root):
 *   node build.mjs <gameName>
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

function fail(message)
{
    console.error(`build.mjs: ${message}`);
    process.exit(1);
}

// resolve and validate the game and its config
const gameName = process.argv[2];
if (!gameName)
    fail('usage: node build.mjs <gameName>');

const gameDir = join(__dirname, 'games', gameName);
if (!fs.existsSync(gameDir) || !fs.statSync(gameDir).isDirectory())
    fail(`Game folder not found: games/${gameName}`);

const configPath = join(gameDir, 'build.json');
if (!fs.existsSync(configPath))
    fail(`Config not found: games/${gameName}/build.json`);

let config;
try
{
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
catch (e)
{
    fail(`Invalid JSON in games/${gameName}/build.json: ${e.message}`);
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
    fail('build.json: "sources" is required and must be a non-empty array');

// build the ordered concatenation list (engine first unless false)
const sourceRelPaths = engine === false
    ? [...config.sources]
    : [engine, ...config.sources];

// resolve to absolute paths and verify every input file exists
const sourceFiles = sourceRelPaths.map(f => join(gameDir, f));
for (let i = 0; i < sourceFiles.length; ++i)
    if (!fs.existsSync(sourceFiles[i]))
        fail(`File not found: ${sourceRelPaths[i]} (from build.json sources)`);
for (const f of dataFiles)
    if (!fs.existsSync(join(gameDir, f)))
        fail(`File not found: ${f} (from build.json data)`);

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

Build
(
    SCRIPT_FILE,
    sourceFiles,
    [minifyBuildStep, htmlBuildStep, zipBuildStep]
);

// leave the build folder matching the zip contents (drop the intermediate script)
if (!keepIntermediate)
    fs.rmSync(SCRIPT_FILE, { force: true });

console.log('');
console.log(`Build completed in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);

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
