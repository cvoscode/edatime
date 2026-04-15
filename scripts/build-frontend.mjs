import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';

const SRC_DIR = path.resolve('frontend/src');
const OUT_DIR = path.resolve('frontend/js');
const isWatch = process.argv.includes('--watch');

// Discover all TypeScript entry points (non-declaration files).
function findEntryPoints(dir, base = '') {
    const entries = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            entries.push(...findEntryPoints(path.join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            entries.push(rel);
        }
    }
    return entries;
}

const entryPoints = findEntryPoints(SRC_DIR).map(f => path.join(SRC_DIR, f));

// Clean stale chunk files before building.
for (const f of fs.readdirSync(OUT_DIR).filter(n => n.startsWith('chunk-') && n.endsWith('.js'))) {
    fs.unlinkSync(path.join(OUT_DIR, f));
    const map = path.join(OUT_DIR, f + '.map');
    if (fs.existsSync(map)) fs.unlinkSync(map);
}

const buildOptions = {
    entryPoints,
    outdir: OUT_DIR,
    format: 'esm',
    splitting: true,
    bundle: true,
    sourcemap: true,
    target: 'es2022',
    platform: 'browser',
    external: [
        'https://esm.sh/*',
        'https://unpkg.com/*',
    ],
    outExtension: { '.js': '.js' },
    logLevel: 'info',
};

if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
} else {
    await esbuild.build(buildOptions);
    console.log('Frontend build complete.');
}
