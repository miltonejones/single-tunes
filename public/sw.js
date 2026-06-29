const SHELL_CACHE = 'skytunes-shell-v2';
const API_CACHE = 'skytunes-api-v2';
const IMAGE_CACHE = 'skytunes-images-v2';

const TUNE_API_HOST = 'u8m0btl997.execute-api.us-east-1.amazonaws.com';
const PHOTO_API_HOST = 'swkwp5a4m0.execute-api.us-east-1.amazonaws.com';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sky-tunes-logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
];

// ── Install ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  const validCaches = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !validCaches.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => clients.claim()),
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle http(s) requests
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // ── API calls (stale-while-revalidate) ────────────────────────────────
  if (url.hostname === TUNE_API_HOST || url.hostname === PHOTO_API_HOST) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // ── Images (cache-first) ─────────────────────────────────────────────
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // ── Static assets (cache-first) ──────────────────────────────────────
  if (
    request.destination === 'style' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // ── JS modules (network-first, fallback to cache) ────────────────────
  if (request.destination === 'script' || request.destination === 'worker') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // ── Navigation (network-first, fallback to cached index.html) ────────
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(() =>
        caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 })),
      ),
    );
    return;
  }

  // ── Everything else (network-first) ──────────────────────────────────
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

// ── Strategies ─────────────────────────────────────────────────────────────

function isCacheable(request, response) {
  return request.method === 'GET' && response.ok && response.status !== 206;
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheable(request, response)) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (isCacheable(request, response)) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // For navigation, the caller handles fallback to index.html
    throw new Error('Offline');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Fetch in background to update cache (don't await — let it happen async)
  const fetchPromise = fetch(request)
    .then((response) => {
      if (isCacheable(request, response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => {
      // Network failed — cached response (if any) will be returned below
    });

  // Return cached response immediately if available
  if (cached) return cached;

  // Otherwise wait for the network
  const response = await fetchPromise;
  if (response) return response;

  return new Response('Offline', { status: 503 });
}
