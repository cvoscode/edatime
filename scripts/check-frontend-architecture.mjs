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
  const isLegacy = rel.startsWith('frontend/src/legacy/');

  // Skip files in the legacy archive tree.
  if (isLegacy) continue;

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

  // Rule 4: Block imports from deprecated surfaces in live files.
  // Test files are exempted to preserve coverage during migration.
  if (!isTest) {
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(importRe)) {
      const src = match[1];
      // scatter/state.ts exports appState for the scatter module's internal use — skip it.
      if (rel !== 'frontend/src/scatter/state.ts' && /(^|\/)state\.ts$/.test(src)) {
        add(file, 'import from state.ts is deprecated — use store/ sub-states or store/appStateCompat.js', lineOf(text, match.index ?? 0));
      } else if (src !== './state.js' && /(^|\/)state\.js$/.test(src) && rel !== 'frontend/src/store/index.ts') {
        add(file, 'import from state.ts is deprecated — use store/ sub-states or store/appStateCompat.js', lineOf(text, match.index ?? 0));
      } else if (/ui\/columns(\.js)?$/.test(src)) {
        add(file, 'import from ui/columns.ts is deprecated — use features/timeseries/columnsController.js', lineOf(text, match.index ?? 0));
      } else if (/bootstrap\/appShell(\.js)?$/.test(src)) {
        add(file, 'import from bootstrap/appShell.ts is deprecated — use app/shell.js', lineOf(text, match.index ?? 0));
      } else if (/bootstrap\/pageLoaders(\.js)?$/.test(src)) {
        add(file, 'import from bootstrap/pageLoaders.ts is deprecated — use app/pageRegistry.js', lineOf(text, match.index ?? 0));
      } else if (/bootstrap\/timeseriesBootstrap(\.js)?$/.test(src)) {
        add(file, 'import from bootstrap/timeseriesBootstrap.ts is deprecated — use features/timeseries/entrypoint.js', lineOf(text, match.index ?? 0));
      } else if ((/^(\.\.\/)+components\//.test(src) || src.startsWith('components/')) && !/^frontend\/src\/components\//.test(rel)) {
        add(file, 'import from components/ is deprecated — use ui/ instead', lineOf(text, match.index ?? 0));
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

  // Rule 6: Transport ownership — API fetch calls must live in services/api/.
  // (Already covered by Rule 2 above, but reinforced here for clarity)

  // Rule 7: Page runtime ownership — files in pages/ must not import from other
  // pages/ subdirectories directly unless they are in pages/shared/.
  // E.g. fftPage.ts must not import from heatmapPage.ts, but both may import from pages/shared/.
  if (/^frontend\/src\/pages\//.test(rel) && !isTest) {
    const pageImportRe = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(pageImportRe)) {
      const src = match[1];
      // Allow pages/shared/ imports
      if (/^\.\.\/shared\//.test(src) || src.startsWith('shared/')) continue;
      // Allow imports from the same page directory
      if (rel.startsWith('frontend/src/pages/') && /^\.\//.test(src) && !/^\.\.\//.test(src)) continue;
      // Block cross-page imports: fftPage importing from heatmapPage, etc.
      if (/^frontend\/src\/pages\/[^\/]+\.js$/.test(src) || /^frontend\/src\/pages\/[^\/]+\/[^\/]+\.js$/.test(src)) {
        if (!/pages\/shared\//.test(src)) {
          add(file, 'page files must not import from other page directories — use pages/shared/ for shared behavior', lineOf(text, match.index ?? 0));
        }
      }
    }
  }

  // Rule 8: Feature-entrypoint ownership — feature entrypoints (features/*/entrypoint.ts)
  // may not be imported by files outside their feature scope except via the canonical
  // public API surface. This prevents tight coupling between features.
  if (/^frontend\/src\/features\//.test(rel) && !isTest) {
    const entrypointRe = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(entrypointRe)) {
      const src = match[1];
      // Block direct imports of entrypoints from outside their feature
      if (/\/entrypoint(\.js)?$/.test(src)) {
        // Extract feature name from current file path
        const featureMatch = rel.match(/^frontend\/src\/features\/([^\/]+)\//);
        const srcFeatureMatch = src.match(/^frontend\/src\/features\/([^\/]+)\//);
        if (featureMatch && srcFeatureMatch && featureMatch[1] !== srcFeatureMatch[1]) {
          add(file, 'feature entrypoints must not be imported across feature boundaries — use public API surface', lineOf(text, match.index ?? 0));
        }
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
