const CACHE_NAME = 'little-linguist-v5';

// CDN scripts to pre-cache on install (Tailwind is now inlined so not needed)
const CDN_ASSETS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
];

// Local files to pre-cache on install
const LOCAL_ASSETS = [
  '/Gungbe-Yor/',
  '/Gungbe-Yor/index.html',
  '/Gungbe-Yor/manifest.json',
  '/Gungbe-Yor/icon-192.png',
  '/Gungbe-Yor/icon-512.png',
];

// ── Install: pre-cache everything ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache local files (must succeed)
    await cache.addAll(LOCAL_ASSETS).catch(() => {});

    // Cache CDN scripts (best effort — don't block install if offline)
    await Promise.allSettled(
      CDN_ASSETS.map(url =>
        fetch(url)
          .then(res => { if (res.ok) cache.put(url, res); })
          .catch(() => {})
      )
    );
  })());
  self.skipWaiting();
});

// ── Activate: clean up old caches ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // CDN assets: cache-first (they are versioned and won't change)
  const isCdn = CDN_ASSETS.some(cdn => url.startsWith(cdn));
  if (isCdn) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
          return res;
        }).catch(() => caches.match(request));
      })
    );
    return;
  }

  // version.json: network-first, short timeout, fall back to cache
  // (so update banner appears quickly but works offline too)
  if (url.includes('version.json')) {
    event.respondWith(
      Promise.race([
        fetch(request).then(res => {
          if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
          return res;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]).catch(() => caches.match(request))
    );
    return;
  }

  // Local origin files: network-first, fall back to cache for offline
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
