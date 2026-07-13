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

function isPageImplementationPath(resolvedPath) {
  return (
    /^frontend\/src\/pages\/[^/]+Page\.js$/.test(resolvedPath)
    || resolvedPath === 'frontend/src/scatter/scatterPage.js'
    || resolvedPath === 'frontend/src/causal/causalPage.js'
    || resolvedPath === 'frontend/src/drift/driftPage.js'
  );
}

function isHeavyStartupImport(src, resolvedPath) {
  return (
    src === 'echarts'
    || src === 'apache-arrow'
    || src.includes('chartgpu')
    || resolvedPath.endsWith('/chart/DataChart.js')
    || isPageImplementationPath(resolvedPath)
  );
}

function isStartupShellOrSharedUiFile(rel) {
  return [
    'frontend/src/app.ts',
    'frontend/src/app/pageModules.ts',
    'frontend/src/app/shell.ts',
    'frontend/src/app/shell/core.ts',
    'frontend/src/ui/pageNavigation.ts',
    'frontend/src/app/bootstrap/globalShortcuts.ts',
    'frontend/src/app/shell/commands.ts',
  ].includes(rel);
}

const files = await listTsFiles(srcRoot);

for (const file of files) {
  const rel = relative(root, file);
  const text = await readFile(file, 'utf8');
  const isTest = /\.test\.ts$/.test(file);
  const isLegacyState = rel === 'frontend/src/store/index.ts';
  const staticImportRe = /(^|\n)\s*import\s+(type\s+)?[^'"\n]+from\s+['"]([^'"]+)['"]/g;

  if (!isTest && /^frontend\/src\/features\/[^/]+\/index\.ts$/.test(rel)) {
    const wildcardExport = /export\s+\*\s+from\s+['"]/g;
    for (const match of text.matchAll(wildcardExport)) {
      add(file, 'feature public indexes must declare explicit exports instead of wildcard re-exports', lineOf(text, match.index ?? 0));
    }
  }

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
      const resolved = resolveImportPath(src, rel);
      // The monolithic type hub has been retired; each consumer must use a domain module.
      if (resolved === 'frontend/src/types.js') {
        add(file, 'import from types.ts is retired — use types/api, types/chart, types/scatter, types/store, or types/analytics', lineOf(text, match.index ?? 0));
      // scatter/state.ts exports appState for the scatter module's internal use — skip it.
      } else if (rel !== 'frontend/src/scatter/state.ts' && /(^|\/)state\.ts$/.test(src)) {
        add(file, 'import from state.ts is deprecated — use focused store sub-states', lineOf(text, match.index ?? 0));
      } else if (/ui\/columns(\.js)?$/.test(src)) {
        add(file, 'import from ui/columns.ts is deprecated — use features/timeseries/columnsController.js', lineOf(text, match.index ?? 0));
      } else if (/bootstrap\/appShell(\.js)?$/.test(src)) {
        add(file, 'import from bootstrap/appShell.ts is deprecated — use app/shell.js', lineOf(text, match.index ?? 0));
      } else if (/bootstrap\/pageLoaders(\.js)?$/.test(src)) {
        add(file, 'import from bootstrap/pageLoaders.ts is deprecated — use app/pageRegistry.js', lineOf(text, match.index ?? 0));
      } else if (/bootstrap\/timeseriesBootstrap(\.js)?$/.test(src)) {
        add(file, 'import from bootstrap/timeseriesBootstrap.ts is deprecated — use features/timeseries/index.js', lineOf(text, match.index ?? 0));
      } else if ((/^(\.\.\/)+components\//.test(src) || src.startsWith('components/')) && !/^frontend\/src\/components\//.test(rel)) {
        add(file, 'import from components/ is deprecated — use ui/ instead', lineOf(text, match.index ?? 0));
      } else if (!isLegacyState && /store\/index(\.js)?$/.test(src)) {
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

  // Rule 10: app/* must not import from services/api/* except for approved bootstrap helpers.
  // app/* is the composition root — it should not own transport.
  // Approved bootstrap helpers legitimately use services/api for lazy loading and init coordination.
  if (/^frontend\/src\/app\//.test(rel) && !isTest) {
    const approvedBootstrapHelpers = [
      'frontend/src/app/bootstrap/datasetBootstrap.ts',
    ];
    const isApproved = approvedBootstrapHelpers.some((h) => rel.endsWith(h));
    if (!isApproved) {
      const importRe = /from\s+['"]([^'"]+)['"]/g;
      for (const match of text.matchAll(importRe)) {
        const src = match[1];
        const resolved = resolveImportPath(src, rel);
        if (isServicesApiPath(resolved)) {
          add(file, 'app/* must not import from services/api — transport must stay in services/api', lineOf(text, match.index ?? 0));
        }
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
