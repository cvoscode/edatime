import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve('.');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const PACKAGE_DIST = path.join(ROOT, 'crates', 'edatime-bin', 'frontend', 'dist');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

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

function copyRuntimeAssets() {
  const serviceWorker = path.join(FRONTEND_DIR, 'sw.js');
  if (fs.existsSync(serviceWorker)) {
    copyFile(serviceWorker, path.join(PACKAGE_DIST, 'sw.js'));
  }

  const libsSrc = path.join(FRONTEND_DIR, 'libs');
  if (fs.existsSync(libsSrc)) {
    copyDir(libsSrc, path.join(PACKAGE_DIST, 'libs'));
    console.log('Copied libs to packaged frontend dist');
  }
}

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

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

if (isWatch) {
  copyRuntimeAssets();
  process.exit(0);
}

copyRuntimeAssets();

if (isProd) {
  const budgetCheck = spawnSync('node', ['scripts/check-frontend-budgets.mjs'], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (budgetCheck.status !== 0) {
    process.exit(budgetCheck.status ?? 1);
  }
}
