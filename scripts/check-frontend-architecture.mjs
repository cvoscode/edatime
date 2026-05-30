import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const srcRoot = join(root, 'frontend/src');
const violations = [];

async function listTsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listTsFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

function add(file, message, lineNumber) {
  const rel = relative(root, file);
  violations.push(`${rel}${lineNumber ? `:${lineNumber}` : ''} ${message}`);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const files = await listTsFiles(srcRoot);

for (const file of files) {
  const rel = relative(root, file);
  const text = await readFile(file, 'utf8');
  const isTest = /\.test\.ts$/.test(file);
  const isLegacyState = rel === 'frontend/src/state.ts' || rel === 'frontend/src/store/index.ts';

  if (!isTest && !isLegacyState) {
    const directWrite = /appState\.[A-Za-z0-9_]+\s*=(?!=)/g;
    for (const match of text.matchAll(directWrite)) {
      add(file, 'direct appState writes must use store setters', lineOf(text, match.index ?? 0));
    }
  }

  if (!isTest && !rel.startsWith('frontend/src/services/api/')) {
    const fetchCall = /\b(?:globalThis\.)?fetch\s*\(/g;
    for (const match of text.matchAll(fetchCall)) {
      add(file, 'API fetch calls must live in services/api', lineOf(text, match.index ?? 0));
    }
  }

  if (/^frontend\/src\/(services|store|types)\//.test(rel)) {
    const domQuery = /document\.(getElementById|querySelector)/g;
    for (const match of text.matchAll(domQuery)) {
      add(file, 'services/store/types must not query the DOM', lineOf(text, match.index ?? 0));
    }
  }

  if (rel !== 'frontend/src/store/index.ts' && /^frontend\/src\/(components|features|services|store|types)\//.test(rel)) {
    const stateImport = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(stateImport)) {
      if (/(^|\/)state(\.js)?$/.test(match[1])) {
        add(file, 'new modules must not import from state.ts', lineOf(text, match.index ?? 0));
      }
    }
  }

  // Rule 5: Only frontend/src/components/ may import from itself (re-exports allowed).
  // All other internal modules must import from the canonical ui/ surface.
  if (!/^frontend\/src\/components\//.test(rel)) {
    const componentImport = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(componentImport)) {
      if (/^(\.\.\/)+components\//.test(match[1]) || match[1].startsWith('components/')) {
        add(file, 'internal modules must not import from deprecated components/ — use ui/ instead', lineOf(text, match.index ?? 0));
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Frontend architecture violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Frontend architecture checks passed.');
