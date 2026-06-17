const CACHE_NAME = 'little-linguist-v11';

// Local app files to pre-cache on install.
const LOCAL_ASSETS = [
  '/Gungbe-Yor/',
  '/Gungbe-Yor/index.html',
  '/Gungbe-Yor/manifest.json',
  '/Gungbe-Yor/icon-192.png',
  '/Gungbe-Yor/icon-512.png',
];

// CDN libraries (browser-ready builds). Pre-cached best-effort so the app works
// offline after the first successful online load. Confetti is inlined in
// index.html so it is not listed here.
const CDN_ASSETS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js',
];

// -- Install: pre-cache everything ------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_ASSETS).catch(() => {});
    await Promise.allSettled(
      CDN_ASSETS.map(url =>
        fetch(url)
          .then(res => { if (res.ok) return cache.put(url, res); })
          .catch(() => {})
      )
    );
  })());
  self.skipWaiting();
});

// -- Activate: clean up old caches ------------------------------------------
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

// -- Fetch -------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  if (request.method !== 'GET') return;

  // CDN libraries (unpkg + gstatic Firebase): cache-first, they are versioned
  const isCdn = CDN_ASSETS.some(cdn => url === cdn) ||
                url.indexOf('unpkg.com/') !== -1 ||
                url.indexOf('gstatic.com/firebasejs/') !== -1;
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

  // Firebase Storage videos: cache-first after first play
  if (url.includes('firebasestorage.googleapis.com')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
          }
          return res;
        });
      })
    );
    return;
  }

  // Cache-buster (?t=...) requests go straight to network
  if (url.includes('?t=')) return;

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
