import { access, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const srcRoot = join(root, 'frontend/src');
const violations = [];
const retiredSourceRoots = [
  'frontend/src/legacy',
  'frontend/src/bootstrap',
  'frontend/src/pages',
  'frontend/src/causal',
  'frontend/src/scatter',
  'frontend/src/drift',
  'frontend/src/components',
];
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

/**
 * Resolve a module import string to an absolute path, handling relative imports.
 * e.g. "../services/api/index.js" from "frontend/src/ui/foo.ts" → "frontend/src/services/api/index.js"
 */
function resolveImportPath(importStr, fromFile) {
  if (importStr.startsWith('/') || importStr.startsWith('.')) {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
    const resolved = join(root, fromDir, importStr).replace(/\\/g, '/');
    return resolved.replace(/^.*\/frontend\/src\//, 'frontend/src/');
  }
  return importStr;
}

/** Returns true if the resolved path lives under frontend/src/services/api/. */
function isServicesApiPath(resolvedPath) {
  return resolvedPath.startsWith('frontend/src/services/api/');
}

function isHeavyStartupImport(src, resolvedPath) {
  return (
    src === 'echarts'
    || src === 'apache-arrow'
    || src.includes('chartgpu')
    || resolvedPath.endsWith('/chart/DataChart.js')
  );
}

function isStartupShellOrSharedUiFile(rel) {
  return [
    'frontend/src/app.ts',
    'frontend/src/app/pageModules.ts',
    'frontend/src/app/shell.ts',
    'frontend/src/app/shell/core.ts',
    'frontend/src/ui/pageNavigation.ts',
    'frontend/src/app/shell/globalShortcuts.ts',
    'frontend/src/app/shell/commands.ts',
  ].includes(rel);
}

for (const retiredRoot of retiredSourceRoots) {
  try {
    await access(join(root, retiredRoot));
    add(join(root, retiredRoot), 'retired source tree must remain deleted');
  } catch {
    // Absence is the required state.
  }
}

try {
  const storeEntries = await readdir(join(srcRoot, 'store'));
  for (const entry of storeEntries) {
    if (entry.startsWith('compat')) {
      add(join(srcRoot, 'store', entry), 'retired store/compat* surface must remain deleted');
    }
  }
} catch {
  add(join(srcRoot, 'store'), 'focused store directory is missing');
}

const files = await listTsFiles(srcRoot);

for (const file of files) {
  const rel = relative(root, file);
  const text = await readFile(file, 'utf8');
  const isTest = /\.test\.ts$/.test(file);
  const staticImportRe = /(^|\n)\s*import\s+(type\s+)?[^'"\n]+from\s+['"]([^'"]+)['"]/g;

  if (!isTest && /^frontend\/src\/features\/[^/]+\/index\.ts$/.test(rel)) {
    const wildcardExport = /export\s+\*\s+from\s+['"]/g;
    for (const match of text.matchAll(wildcardExport)) {
      add(file, 'feature public indexes must declare explicit exports instead of wildcard re-exports', lineOf(text, match.index ?? 0));
    }
  }

  if (!isTest) {
    const directWrite = /appState\.[A-Za-z0-9_]+\s*=(?!=)/g;
    for (const match of text.matchAll(directWrite)) {
      add(file, 'direct appState writes must use store setters', lineOf(text, match.index ?? 0));
    }
  }

  // Route identities are a versioned contract, not an implementation detail
  // of individual transport modules. Keep every production /api/v1 literal
  // in the canonical route map so a cutover cannot drift one endpoint.
  if (!isTest && rel !== 'frontend/src/contracts/api/v1/routes.ts') {
    const versionedRoute = /['"]\/api\/v1(?:\/|['"])/g;
    for (const match of text.matchAll(versionedRoute)) {
      add(file, 'production /api/v1 paths must come from contracts/api/v1/routes.js', lineOf(text, match.index ?? 0));
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
      const resolved = resolveImportPath(src, rel);
      const targetsRetiredTree = retiredSourceRoots.some((retiredRoot) =>
        resolved === retiredRoot || resolved.startsWith(`${retiredRoot}/`),
      );
      // The monolithic type hub has been retired; each consumer must use a domain module.
      if (resolved === 'frontend/src/types.js') {
        add(file, 'import from types.ts is retired — use types/api, types/chart, types/scatter, types/store, or types/analytics', lineOf(text, match.index ?? 0));
      } else if (/(^|\/)state\.ts$/.test(src)) {
        add(file, 'import from state.ts is deprecated — use focused store sub-states', lineOf(text, match.index ?? 0));
      } else if (targetsRetiredTree || /store\/compat/.test(src)) {
        add(file, 'production imports must not reference retired source trees or store/compat*', lineOf(text, match.index ?? 0));
      } else if ((/^(\.\.\/)+components\//.test(src) || src.startsWith('components/')) && !/^frontend\/src\/components\//.test(rel)) {
        add(file, 'import from components/ is deprecated — use ui/ instead', lineOf(text, match.index ?? 0));
      } else if (/store\/index(\.js)?$/.test(src)) {
        add(file, 'production modules must import focused store slices instead of store/index.js', lineOf(text, match.index ?? 0));
      }
    }
  }

  // Rule 9: ui/* must not import from services/api/*.
  // ui/* is the reusable rendering surface — it should own no transport knowledge.
  if (/^frontend\/src\/ui\//.test(rel) && !isTest) {
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(importRe)) {
      const src = match[1];
      const resolved = resolveImportPath(src, rel);
      if (isServicesApiPath(resolved)) {
        add(file, 'ui/* must not import from services/api — transport must stay in services/api', lineOf(text, match.index ?? 0));
      }
    }
  }

  // Rule 14: consumers outside a feature must use that feature's public
  // index. This keeps feature internals private and makes composition seams
  // explicit across app, bootstrap, chart, and other feature owners.
  if (!isTest && !/^frontend\/src\/features\//.test(rel)) {
    const importRe = /(?:from\s+|import\()['\"]([^'\"]+)['\"]/g;
    for (const match of text.matchAll(importRe)) {
      const src = match[1];
      const resolved = resolveImportPath(src, rel);
      if (resolved.startsWith('frontend/src/features/') && !/\/index\.js$/.test(resolved)) {
        add(file, 'external feature consumers must import through features/<name>/index.js', lineOf(text, match.index ?? 0));
      }
    }
  }

  // Rule 12: startup/shell/shared UI boundaries must not statically import
  // heavy vendor deps or page implementation modules.
  if (!isTest && isStartupShellOrSharedUiFile(rel)) {
    for (const match of text.matchAll(staticImportRe)) {
      const isTypeOnly = Boolean(match[2]);
      if (isTypeOnly) continue;
      const src = match[3];
      const resolved = resolveImportPath(src, rel);
      if (isHeavyStartupImport(src, resolved)) {
        add(file, 'startup/shell/shared UI must not statically import heavy deps or page implementations', lineOf(text, match.index ?? 0));
      }
    }
  }

  // Rule 13: shared UI must not import features. UI components are reused
  // across features, so feature behavior belongs in its owning feature or
  // the application composition root rather than the reusable UI layer.
  if (/^frontend\/src\/ui\//.test(rel) && !isTest) {
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(importRe)) {
      const src = match[1];
      const resolved = resolveImportPath(src, rel);
      if (resolved.startsWith('frontend/src/features/')) {
        add(file, 'ui/* must not import from features — feature behavior belongs to its owner or app composition', lineOf(text, match.index ?? 0));
      }
    }
  }

  // app/* is the composition root — it must not own transport.
  if (/^frontend\/src\/app\//.test(rel) && !isTest) {
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(importRe)) {
      const src = match[1];
      const resolved = resolveImportPath(src, rel);
      if (isServicesApiPath(resolved)) {
        add(file, 'app/* must not import from services/api — transport must stay in services/api', lineOf(text, match.index ?? 0));
      }
    }
  }

  // Rule 11: Block imports from deprecated surfaces not yet covered above,
  // specifically surfaces that have been replaced by ui/* or features/*.
  if (!isTest) {
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(importRe)) {
      const src = match[1];
      // ui/overlay.ts replaced by ui/annotationPanel.ts and ui/analyticsDrawer.ts
      if (/ui\/overlay(\.js)?$/.test(src)) {
        add(file, 'import from ui/overlay.ts is deprecated — use ui/annotationPanel.js or ui/analyticsDrawer.js', lineOf(text, match.index ?? 0));
      }
      // ui/chartTextEditor.ts replaced by ui/chartTextControls.ts
      else if (/ui\/chartTextEditor(\.js)?$/.test(src)) {
        add(file, 'import from ui/chartTextEditor.ts is deprecated — use ui/chartTextControls.js', lineOf(text, match.index ?? 0));
      }
    }
  }

  // The former components/ tree is retired; reusable controls live in ui/.
  const componentImport = /from\s+['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(componentImport)) {
    if (/^(\.\.\/)+components\//.test(match[1]) || match[1].startsWith('components/')) {
      add(file, 'internal modules must not import from retired components/ — use ui/ instead', lineOf(text, match.index ?? 0));
    }
  }

}

if (violations.length > 0) {
  console.error('Frontend architecture violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Frontend architecture checks passed.');
