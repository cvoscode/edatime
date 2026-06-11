import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { computeBuildIdFromManifest, substituteBuildId } from './frontendBuildId.mjs';

const ROOT = path.resolve('.');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const PACKAGE_DIST = path.join(ROOT, 'crates', 'edatime-bin', 'frontend', 'dist');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const VITE_MANIFEST = path.join(PACKAGE_DIST, '.vite', 'manifest.json');
const SERVICE_WORKER_SRC = path.join(FRONTEND_DIR, 'sw.js');

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

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

/**
 * Read sw.js, substitute __BUILD_ID__ from the Vite manifest if present,
 * and write the result to PACKAGE_DIST/sw.js. In production, a missing
 * manifest or unresolved placeholder is a hard failure: we never want
 * a deployed sw.js to keep `__BUILD_ID__` literally.
 */
async function writeServiceWorker() {
  if (!fs.existsSync(SERVICE_WORKER_SRC)) return;

  const srcText = fs.readFileSync(SERVICE_WORKER_SRC, 'utf8');
  let outText = srcText;
  const hasPlaceholder = srcText.includes('__BUILD_ID__');

  if (hasPlaceholder) {
    if (!fs.existsSync(VITE_MANIFEST)) {
      const msg = `Vite manifest missing at ${VITE_MANIFEST}; cannot inject BUILD_ID.`;
      if (isProd) {
        console.error(msg);
        process.exit(1);
      }
      console.warn(msg);
    } else {
      try {
        const buildId = await computeBuildIdFromManifest(VITE_MANIFEST);
        outText = substituteBuildId(srcText, buildId);
        fs.writeFileSync(path.join(PACKAGE_DIST, 'build-id.txt'), buildId);
        console.log(`Injected BUILD_ID ${buildId} into sw.js`);
      } catch (err) {
        const msg = `Failed to compute BUILD_ID from Vite manifest: ${err?.message ?? err}`;
        if (isProd) {
          console.error(msg);
          process.exit(1);
        }
        console.warn(`${msg}; leaving sw.js unsubstituted.`);
      }
    }
  }

  // Final guard: refuse to ship a sw.js that still carries the placeholder.
  if (outText.includes('__BUILD_ID__') && isProd) {
    console.error('Refusing to write sw.js with an unresolved __BUILD_ID__ placeholder.');
    process.exit(1);
  }

  fs.writeFileSync(path.join(PACKAGE_DIST, 'sw.js'), outText);
}

function copyRuntimeAssets() {
  const libsSrc = path.join(FRONTEND_DIR, 'libs');
  if (fs.existsSync(libsSrc)) {
    copyDir(libsSrc, path.join(PACKAGE_DIST, 'libs'));
    console.log('Copied libs to packaged frontend dist');
  }
}

if (!fs.existsSync(VITE_BIN)) {
  console.error('Vite is not installed. Run `npm ci` from the repository root, then retry.');
  process.exit(1);
}

const viteArgs = ['build', '--config', 'frontend/vite.config.ts'];
if (isWatch) viteArgs.push('--watch');
if (isProd) viteArgs.push('--mode', 'production');

const result = spawnSync('node', [VITE_BIN, ...viteArgs], {
  stdio: 'inherit',
  cwd: ROOT,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

(async () => {
  try {
    await writeServiceWorker();
  } catch (err) {
    console.error('Failed to materialize sw.js:', err?.message ?? err);
    process.exit(1);
  }
  copyRuntimeAssets();

  if (isWatch) {
    process.exit(0);
  }

  const archCheck = spawnSync('node', ['scripts/check-frontend-architecture.mjs'], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (archCheck.status !== 0) {
    if (isProd) {
      process.exit(archCheck.status ?? 1);
    }
    console.warn('Frontend architecture check reported violations; continuing in dev mode.');
  }

  if (isProd) {
    const budgetCheck = spawnSync('node', ['scripts/check-frontend-budgets.mjs'], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    if (budgetCheck.status !== 0) {
      process.exit(budgetCheck.status ?? 1);
    }
  }
})();
