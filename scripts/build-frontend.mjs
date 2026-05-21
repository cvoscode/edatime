import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve('.');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const JS_DIR = path.join(ROOT, 'frontend/js');

// Clean stale esbuild-era output before running Vite.
// Vite only cleans the specific outDir when emptyOutDir is true;
// these were created by the old esbuild multi-entry build.
const staleEntries = [
  'js/app.js',    // old duplicate (also: frontend/js/js/app.js → removed below)
  'js/js/app.js', // esbuild nested output (2-level deep from HTML-input build)
  'js/src/app-DRxCtknr.js', // esbuild nested output
  'registerSW.js', // PWA plugin artifact from Vite's HTML-input build
  'workbox-0bb07689.js', // PWA plugin artifact
  'sw.js',        // PWA plugin regenerated sw
];

// Also remove any leftover nested js/ and src/ dirs created by old builds
const staleDirs = ['js/js', 'js/src'];

// PWA plugin artifacts — created by vite-plugin-pwa in earlier build attempts
const pwaArtifacts = [
  'js/registerSW.js',
  'js/workbox-0bb07689.js',
  'js/sw.js',
];

for (const rel of staleEntries) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs);
    console.log(`Removed stale: ${rel}`);
  }
  const map = abs + '.map';
  if (fs.existsSync(map)) {
    fs.unlinkSync(map);
    console.log(`Removed stale: ${rel}.map`);
  }
}

for (const rel of staleDirs) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { recursive: true });
    console.log(`Removed stale directory: ${rel}`);
  }
}

for (const rel of pwaArtifacts) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs);
    console.log(`Removed PWA artifact: ${rel}`);
  }
  const map = abs + '.map';
  if (fs.existsSync(map)) fs.unlinkSync(map);
}

// Run Vite build.  The config at frontend/vite.config.ts handles:
// - root: frontend (where tsconfig.json lives)
// - outDir: dist (frontend/dist — where the Rust backend serves from)
const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');
const VITE_BIN = './frontend/node_modules/vite/bin/vite.js';

if (isWatch) {
  // Start Vite in watch mode (for development)
  const vite = spawnSync('node', [VITE_BIN, 'build', '--config', 'frontend/vite.config.ts', '--watch'], {
    stdio: 'inherit',
    shell: true,
    cwd: ROOT,
  });
  process.exit(vite.status ?? 0);
} else {
  const modeFlag = isProd ? ['--mode', 'production'] : [];
  const result = spawnSync('node', [VITE_BIN, 'build', '--config', 'frontend/vite.config.ts', ...modeFlag], {
    stdio: 'inherit',
    shell: true,
    cwd: ROOT,
  });

  // Copy ChartGPU library to dist AFTER Vite build (needed at runtime)
  const libsSrc = path.join(FRONTEND_DIR, 'libs');
  const libsDest = path.join(FRONTEND_DIR, 'dist', 'libs');
  if (fs.existsSync(libsSrc)) {
    if (fs.existsSync(libsDest)) {
      fs.rmSync(libsDest, { recursive: true });
    }
    const copyDir = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        if (fs.statSync(srcPath).isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    copyDir(libsSrc, libsDest);
    console.log('Copied libs to dist/libs');
  }

  process.exit(result.status ?? 0);
}
