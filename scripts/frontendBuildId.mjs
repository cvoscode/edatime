/**
 * frontendBuildId — compute a stable per-build fingerprint for the
 * service-worker cache name and substitute it into the sw.js template.
 *
 * The id is derived from the Vite manifest JSON (sorted keys + sha256 first
 * 16 hex chars), suffixed with a minute-resolution timestamp so two builds
 * inside the same Vite run still get distinct ids.
 *
 * This module is intentionally side-effect-free so it can be unit-tested
 * without spawning Vite.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function hashHex(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function minuteStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}${m}${d}${hh}${mm}`;
}

/**
 * Compute a build id from raw manifest text or an already-parsed object.
 * Exported separately so unit tests can call it with a fixture.
 *
 * @param {string | object} manifest - the Vite manifest JSON text or parsed object
 * @param {Date} [now] - override the timestamp source for tests
 * @returns {string} the build id, e.g. "1a2b3c4d5e6f7g8h-202606100932"
 */
export function computeBuildId(manifest, now = new Date()) {
  const text = typeof manifest === 'string' ? stableStringify(JSON.parse(manifest)) : stableStringify(manifest);
  return `${hashHex(text)}-${minuteStamp(now)}`;
}

/**
 * Read the Vite manifest at the given path and compute the build id.
 * Throws if the file is missing or invalid.
 */
export async function computeBuildIdFromManifest(manifestPath) {
  const text = await readFile(manifestPath, 'utf8');
  return computeBuildId(text);
}

/**
 * Replace every occurrence of `__BUILD_ID__` in `swSource` with `buildId`.
 * Other `__*__` placeholders are left alone. The function is total: an
 * already-substituted sw.js round-trips unchanged.
 */
export function substituteBuildId(swSource, buildId) {
  if (typeof buildId !== 'string' || buildId.length === 0) {
    throw new Error('substituteBuildId: buildId must be a non-empty string');
  }
  return swSource.replace(/__BUILD_ID__/g, buildId);
}
