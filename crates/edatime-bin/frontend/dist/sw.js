/**
 * Service Worker for EdaTime.
 *
 * Vite emits hashed production assets, so the worker must not pre-cache fixed
 * app, CSS, or HTML paths. Runtime caching is network-first to avoid serving an
 * older frontend after a rebuild.
 *
 * The cache name is interpolated at build time by `scripts/build-frontend.mjs`
 * from a content hash of the Vite manifest. The literal token is `2c6a07adfd6be0e6-202606170724`;
 * if you see it in a deployed sw.js, the build pipeline did not run.
 */

const CACHE_NAME = `edatime-runtime-2c6a07adfd6be0e6-202606170724`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  if (request.mode === 'navigate' || isCacheableAsset(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});

function isCacheableAsset(pathname) {
  return [
    '.css',
    '.js',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.webp',
  ].some((ext) => pathname.endsWith(ext));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}
