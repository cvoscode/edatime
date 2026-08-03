#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const mode = process.argv[2] ?? 'artifacts';
const options = new Map();
for (let index = 3; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith('--') && value) options.set(key.slice(2), value);
}

const root = resolve('.');
const distRoot = resolve('crates/edatime-bin/frontend/dist');

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(file));
    else files.push(file);
  }
  return files;
}

function summarizeArtifacts() {
  const files = listFiles(distRoot);
  const byHash = new Map();
  const rows = files.map((file) => {
    const bytes = readFileSync(file);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const row = {
      file: relative(root, file),
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
      brotliBytes: brotliCompressSync(bytes).length,
      sourceMap: file.endsWith('.map'),
    };
    const matches = byHash.get(hash) ?? [];
    matches.push(row.file);
    byHash.set(hash, matches);
    return row;
  });
  const rawBytes = rows.reduce((total, row) => total + row.rawBytes, 0);
  const sourceMapBytes = rows.filter((row) => row.sourceMap).reduce((total, row) => total + row.rawBytes, 0);
  const manifestPath = join(distRoot, '.vite', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest['index.html'] ?? Object.values(manifest).find((item) => item?.isEntry);
  const entryFiles = new Set([entry?.file, ...(entry?.css ?? [])].filter(Boolean));
  const initial = rows.filter((row) => entryFiles.has(row.file.replace(`${relative(root, distRoot)}/`, '')));
  return {
    mode: 'artifacts',
    distRoot: relative(root, distRoot),
    fileCount: rows.length,
    rawBytes,
    sourceMapBytes,
    servedBytes: rawBytes - sourceMapBytes,
    initialRawBytes: initial.reduce((total, row) => total + row.rawBytes, 0),
    initialGzipBytes: initial.reduce((total, row) => total + row.gzipBytes, 0),
    duplicateContent: [...byHash.values()].filter((paths) => paths.length > 1),
    largestFiles: [...rows].sort((left, right) => right.rawBytes - left.rawBytes).slice(0, 20),
  };
}

async function summarizeBrowser() {
  const target = options.get('target');
  if (!target) throw new Error(`Usage: node scripts/bench_app_structure.mjs ${mode} --target http://127.0.0.1:3000 [--path /#page=home]`);
  const { chromium } = await import('playwright');
  const path = options.get('path') ?? '/';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const resources = [];
  page.on('response', async (response) => {
    const request = response.request();
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') return;
    const headers = response.headers();
    resources.push({
      url: response.url(),
      status: response.status(),
      type: request.resourceType(),
      contentLength: Number(headers['content-length'] ?? 0),
    });
  });
  const startedAt = performance.now();
  await page.goto(new URL(path, target).toString(), { waitUntil: 'networkidle' });
  const result = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0]?.toJSON() ?? null;
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime]));
    const resources = performance.getEntriesByType('resource').map((entry) => entry.toJSON());
    return {
      navigation,
      paints,
      domNodes: document.querySelectorAll('*').length,
      resources,
      heap: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      } : null,
    };
  });
  await browser.close();
  return {
    mode,
    target,
    path,
    elapsedMs: performance.now() - startedAt,
    ...result,
    responses: resources,
  };
}

async function main() {
  if (mode !== 'artifacts' && mode !== 'startup' && mode !== 'navigation') {
    throw new Error(`Unknown mode '${mode}'. Use artifacts, startup, or navigation.`);
  }
  const result = mode === 'artifacts' ? summarizeArtifacts() : await summarizeBrowser();
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const output = options.get('out');
  if (output) {
    mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(resolve(output), json);
  }
  process.stdout.write(json);
}

await main();
