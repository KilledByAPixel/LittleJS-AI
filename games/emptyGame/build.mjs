/**
 * LittleJS Build System
 * - Concatenates the engine + game source into one file
 * - Minifies with terser, inlines into a single index.html, then zips it
 * - Run from this game's folder with: node build.mjs
 *
 * Build tools (terser, bestzip) are installed once at the repo root:
 *   npm install            (run once in the repo root after cloning)
 *
 * To build your own game, copy this file into your game folder and edit the
 * CONFIG block below. npx resolves the tools from the shared root node_modules.
 */

'use strict';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

///////////////////////////////////////////////////////////////////////////////
// CONFIG - edit these for your game

const PROGRAM_TITLE = 'Little JS Game'; // <title> in the built html
const PROGRAM_NAME  = 'game';           // output zip name (game.zip)
const KEEP_INTERMEDIATE = false;        // keep the un-inlined build/index.js (for debugging)

// source files concatenated in order (use the global release build of the engine)
const sourceFiles =
[
    join(__dirname, '../../dist/littlejs.release.js'),
    join(__dirname, 'game.js'),
    // add your game's source files here
];

// data files copied into the build and bundled into the zip
const dataFiles =
[
    'tiles.png',
    // add your game's data files here
];

///////////////////////////////////////////////////////////////////////////////

const BUILD_FOLDER = join(__dirname, 'build');
const SCRIPT_FILE = join(BUILD_FOLDER, 'index.js'); // intermediate, inlined into index.html
const ZIP_PATH = join(__dirname, `${PROGRAM_NAME}.zip`);

console.log(`Building ${PROGRAM_NAME}...`);
const startTime = Date.now();

// remove old output and set up a fresh build folder
fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });
fs.rmSync(ZIP_PATH, { force: true });
fs.mkdirSync(BUILD_FOLDER);

// copy data files into the build folder
for (const file of dataFiles)
    fs.copyFileSync(join(__dirname, file), join(BUILD_FOLDER, file));

Build
(
    SCRIPT_FILE,
    sourceFiles,
    [minifyBuildStep, htmlBuildStep, zipBuildStep]
);

// leave the build folder matching the zip contents (drop the intermediate script)
if (!KEEP_INTERMEDIATE)
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
    buffer += `<title>${PROGRAM_TITLE}</title>`;
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
    execSync(`npx bestzip ../${PROGRAM_NAME}.zip ${sources.join(' ')}`,
        {cwd: BUILD_FOLDER, stdio: 'inherit'});
    console.log(`Size of ${PROGRAM_NAME}.zip: ${fs.statSync(ZIP_PATH).size} bytes`);
}
