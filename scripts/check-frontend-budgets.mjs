import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve('.');
const distRoot = join(root, 'frontend', 'dist');
const appJsPath = join(distRoot, 'js', 'app.js');
const assetsDir = join(distRoot, 'js', 'assets');
const indexHtmlPath = join(distRoot, 'index.html');

const BUDGETS = {
  appJsMaxBytes: 220_000,
  initialCssMaxBytes: 10_000,
  heavyChunks: {
    echarts: 3_000_000,
    chartgpu: 400_000,
    arrow: 600_000,
  },
};

const violations = [];

function addViolation(message) {
  violations.push(message);
}

function stripQuery(path) {
  return path.split('?')[0];
}

async function getInitialCssBytes() {
  const html = await readFile(indexHtmlPath, 'utf8');
  const cssRefs = Array.from(
    html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g),
    (match) => match[1],
  ).filter((href) => !/^https?:\/\//.test(href) && !href.startsWith('data:'));

  let total = 0;
  for (const href of cssRefs) {
    const filePath = join(distRoot, stripQuery(href));
    total += (await stat(filePath)).size;
  }
  return total;
}

async function findChunkSize(prefix) {
  const entries = await readdir(assetsDir);
  const match = entries.find((entry) => entry.startsWith(`${prefix}-`) && entry.endsWith('.js'));
  if (!match) {
    addViolation(`Missing expected heavy chunk "${prefix}-*.js" in frontend/dist/js/assets`);
    return null;
  }
  const size = (await stat(join(assetsDir, match))).size;
  return { file: match, size };
}

async function main() {
  const appJs = await readFile(appJsPath, 'utf8');
  const appJsBytes = Buffer.byteLength(appJs);
  const initialCssBytes = await getInitialCssBytes();

  if (appJsBytes > BUDGETS.appJsMaxBytes) {
    addViolation(`Initial app.js is ${appJsBytes} bytes, above budget ${BUDGETS.appJsMaxBytes}`);
  }

  if (initialCssBytes > BUDGETS.initialCssMaxBytes) {
    addViolation(`Initial blocking CSS is ${initialCssBytes} bytes, above budget ${BUDGETS.initialCssMaxBytes}`);
  }

  const eagerHeavyImport = /^\s*import\s+.*(?:chartgpu|echarts|arrow-[^'"]+)\.js['"];?/m;
  if (eagerHeavyImport.test(appJs)) {
    addViolation('Initial app.js still contains a static import of a heavy chunk');
  }

  for (const [prefix, maxBytes] of Object.entries(BUDGETS.heavyChunks)) {
    const chunk = await findChunkSize(prefix);
    if (!chunk) continue;
    if (chunk.size > maxBytes) {
      addViolation(`Cold chunk ${chunk.file} is ${chunk.size} bytes, above budget ${maxBytes}`);
    }
    console.log(`${chunk.file}: ${chunk.size} bytes`);
  }

  console.log(`app.js: ${appJsBytes} bytes`);
  console.log(`initial-css: ${initialCssBytes} bytes`);

  if (violations.length > 0) {
    console.error('Frontend bundle budget violations:');
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log('Frontend bundle budgets passed.');
}

await main();
