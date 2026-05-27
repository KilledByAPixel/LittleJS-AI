// Stamp a cache-buster on every local <script src="..."> in games/*.html and
// templates/*.html. Default version is the current epoch (ms), so every run
// produces a fresh value with no state file. Pass an explicit version to
// override: `node scripts/bump-cache-version.js 42`.
//
// A local include is any <script src> whose path (with ?query and #frag stripped)
// resolves to a file that exists on disk. External URLs (http://, https://, //...)
// are left alone.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['games', 'templates'];

function listHtmlFiles() {
    const out = [];
    for (const dir of SCAN_DIRS) {
        const full = path.join(ROOT, dir);
        if (!fs.existsSync(full)) continue;
        for (const f of fs.readdirSync(full)) {
            if (f.endsWith('.html')) out.push(path.join(full, f));
        }
    }
    return out;
}

function rewriteHtml(content, htmlDir, version) {
    let changeCount = 0;
    const updated = content.replace(/<script\b([^>]*)>/gi, (match, attrs) => {
        const newAttrs = attrs.replace(/\bsrc\s*=\s*"([^"]+)"/g, (am, src) => {
            // skip absolute URLs
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src) || src.startsWith('//')) return am;

            const bareSrc = src.replace(/[?#].*$/, '');
            const resolved = path.resolve(htmlDir, bareSrc);
            if (!fs.existsSync(resolved)) return am;

            const newSrc = `${bareSrc}?${version}`;
            if (newSrc !== src) changeCount++;
            return `src="${newSrc}"`;
        });
        return `<script${newAttrs}>`;
    });
    return {updated, changeCount};
}

function main() {
    const arg = process.argv[2];
    const newVersion = arg ? arg : String(Date.now());

    const files = listHtmlFiles();
    let touchedFiles = 0;
    let totalChanges = 0;

    for (const file of files) {
        const before = fs.readFileSync(file, 'utf8');
        const {updated, changeCount} = rewriteHtml(before, path.dirname(file), newVersion);
        if (updated !== before) {
            fs.writeFileSync(file, updated);
            touchedFiles++;
            totalChanges += changeCount;
        }
    }

    console.log(`Cache version: ${newVersion}`);
    console.log(`Files scanned: ${files.length}`);
    console.log(`Files updated: ${touchedFiles}`);
    console.log(`Includes rewritten: ${totalChanges}`);
}

main();
