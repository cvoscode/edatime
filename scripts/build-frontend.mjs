import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve('.');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const JS_DIR = path.join(ROOT, 'frontend/js');
const FRONTEND_DIST = path.join(FRONTEND_DIR, 'dist');
const BIN_FRONTEND_DIST = path.join(ROOT, 'crates', 'edatime-bin', 'frontend', 'dist');

function copyDir(src, dest) {
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
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

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
// - root: frontend
// - TS entry: frontend/src/app.ts
// - outDir: frontend/js, matching the static script tag in frontend/index.html
const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

if (!fs.existsSync(VITE_BIN)) {
  console.error('Vite is not installed. Run `npm ci` from the repository root, then retry.');
  process.exit(1);
}

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
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  // Assemble the static frontend served by the Rust binary. The reinstated
  // frontend keeps source HTML/CSS at frontend/ and Vite emits JS to
  // frontend/js; make dev serves frontend/dist, so dist must contain all of it.
  if (fs.existsSync(FRONTEND_DIST)) {
    fs.rmSync(FRONTEND_DIST, { recursive: true });
  }
  fs.mkdirSync(FRONTEND_DIST, { recursive: true });

  copyFile(path.join(FRONTEND_DIR, 'index.html'), path.join(FRONTEND_DIST, 'index.html'));
  if (fs.existsSync(path.join(FRONTEND_DIR, 'css'))) {
    copyDir(path.join(FRONTEND_DIR, 'css'), path.join(FRONTEND_DIST, 'css'));
  }
  if (fs.existsSync(JS_DIR)) {
    copyDir(JS_DIR, path.join(FRONTEND_DIST, 'js'));
  }
  if (fs.existsSync(path.join(FRONTEND_DIR, 'sw.js'))) {
    copyFile(path.join(FRONTEND_DIR, 'sw.js'), path.join(FRONTEND_DIST, 'sw.js'));
  }

  // Copy ChartGPU library to dist AFTER Vite build (needed at runtime)
  const libsSrc = path.join(FRONTEND_DIR, 'libs');
  const libsDest = path.join(FRONTEND_DIST, 'libs');
  if (fs.existsSync(libsSrc)) {
    if (fs.existsSync(libsDest)) {
      fs.rmSync(libsDest, { recursive: true });
    }
    copyDir(libsSrc, libsDest);
    console.log('Copied libs to dist/libs');
  }

  // Append cache-busting query param to index.html script/style tags so
  // browsers always fetch fresh assets after each rebuild.
  // Using query param (?v=) so file lookup still works correctly.
  const indexPath = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(indexPath)) {
    const version = Date.now().toString(36);
    let html = fs.readFileSync(indexPath, 'utf8');
    // Add ?v=VERSION before the closing quote for src= and href= attributes
    html = html.replace(/(src|href)="([^"]+\.(?:js|css))"/g, (match, attr, path) => {
      return `${attr}="${path}?v=${version}"`;
    });
    fs.writeFileSync(indexPath, html);
    console.log(`Cache-busting applied: ?v=${version}`);
  }

  // The root binary serves frontend/dist, while crates/edatime-bin serves its
  // own packaged frontend directory. Keep both in sync so hashed chunks and
  // sourcemap references cannot drift between launch paths.
  if (fs.existsSync(FRONTEND_DIST)) {
    if (fs.existsSync(BIN_FRONTEND_DIST)) {
      fs.rmSync(BIN_FRONTEND_DIST, { recursive: true });
    }
    copyDir(FRONTEND_DIST, BIN_FRONTEND_DIST);
    console.log('Synced frontend dist to crates/edatime-bin/frontend/dist');
  }

  // Clean up SolidJS-specific artifacts from the packaged dist.
  // The Vite build above produces flat-output JS (no hashes), but if a previous
  // build placed a SolidJS+hashed version in BIN_FRONTEND_DIST, those files would
  // still be there and would clobber the flat output. Remove them explicitly.
  const solidJsArtifacts = ['assets', 'frontend'];
  for (const artifact of solidJsArtifacts) {
    const artifactPath = path.join(BIN_FRONTEND_DIST, artifact);
    if (fs.existsSync(artifactPath)) {
      fs.rmSync(artifactPath, { recursive: true, force: true });
      console.log(`Removed SolidJS artifact: ${artifact}`);
    }
  }

  process.exit(result.status ?? 0);
}
