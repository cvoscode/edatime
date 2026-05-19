/**
 * Service Worker for EdaTime - Static asset caching
 * Caches CSS, JS, fonts, and other static assets for faster page loads
 */

const CACHE_NAME = 'edatime-v2';
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/index.html',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API requests (they should always be fresh)
  if (url.pathname.startsWith('/api/')) return;

  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // For static assets (CSS, fonts, images), use cache-first strategy
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version, but also update cache in background
          fetchAndCache(request);
          return cachedResponse;
        }
        // Not in cache, fetch and cache
        return fetchAndCache(request);
      })
    );
    return;
  }

  // For HTML pages, use network-first strategy
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/');
          });
        })
    );
    return;
  }

  // Default: network first, cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

/**
 * Check if URL is a static asset that can be cached
 */
function isStaticAsset(pathname) {
  const staticExtensions = [
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
  ];
  const staticPaths = [
    '/css/',
    '/js/',
    '/assets/',
    '/fonts/',
    '/libs/',
    '/_static/',
  ];

  return (
    staticExtensions.some((ext) => pathname.endsWith(ext)) ||
    staticPaths.some((path) => pathname.startsWith(path))
  );
}

/**
 * Fetch and cache a response
 */
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Network failed, return cached if available
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}