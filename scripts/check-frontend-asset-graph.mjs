import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_DIST_ROOT = resolve('crates/edatime-bin/frontend/dist');

function localAssetPath(reference) {
  const value = String(reference ?? '').trim();
  if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:')) return null;
  return value.split(/[?#]/, 1)[0].replace(/^\//, '');
}

function collectHtmlAssetReferences(html) {
  return Array.from(
    html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/gi),
    (match) => match[1],
  ).map(localAssetPath).filter(Boolean);
}

function manifestEntry(manifest) {
  const entry = manifest['index.html']
    ?? Object.values(manifest).find((item) => item?.isEntry);
  if (!entry?.file) throw new Error('Vite manifest has no index.html entry');
  return entry;
}

async function fileExists(root, relativePath) {
  try {
    await access(join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies the deployable HTML, manifest, and emitted assets form one graph.
 * This catches interrupted/stale builds where an old index.html points at
 * hashed chunks removed by a newer Vite output.
 */
export async function verifyPackagedFrontendAssetGraph(distRoot = DEFAULT_DIST_ROOT) {
  const [html, rawManifest] = await Promise.all([
    readFile(join(distRoot, 'index.html'), 'utf8'),
    readFile(join(distRoot, '.vite', 'manifest.json'), 'utf8'),
  ]);
  const manifest = JSON.parse(rawManifest);
  const entry = manifestEntry(manifest);
  const htmlReferences = collectHtmlAssetReferences(html);
  const missing = [];
  const packagedFiles = await readdir(distRoot, { recursive: true });
  const forbiddenArtifacts = packagedFiles.filter((file) => (
    file.endsWith('.map') || file === 'libs' || file.startsWith('libs/')
  ));

  if (forbiddenArtifacts.length > 0) {
    throw new Error(`Packaged frontend contains forbidden generated artifacts: ${forbiddenArtifacts.join(', ')}`);
  }

  for (const reference of htmlReferences) {
    if (!await fileExists(distRoot, reference)) missing.push(reference);
  }

  const entryFile = localAssetPath(entry.file);
  if (!htmlReferences.includes(entryFile)) {
    throw new Error(
      `Packaged frontend HTML does not boot the manifest entry: expected /${entryFile}, found ${htmlReferences.join(', ') || 'no local assets'}`,
    );
  }

  for (const stylesheet of entry.css ?? []) {
    const stylesheetPath = localAssetPath(stylesheet);
    if (!htmlReferences.includes(stylesheetPath)) {
      throw new Error(
        `Packaged frontend HTML does not reference manifest stylesheet: expected /${stylesheetPath}`,
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(`Packaged frontend HTML references missing files: ${missing.join(', ')}`);
  }
}

async function main() {
  try {
    await verifyPackagedFrontendAssetGraph();
    console.log('Packaged frontend asset graph passed.');
  } catch (error) {
    console.error(`Packaged frontend asset graph failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
