const CACHE_NAME = 'little-linguist-v9';

// Local files to pre-cache on install. The heavy libraries are now self-hosted
// under vendor/ so the app no longer depends on any third-party CDN and works
// fully offline from the very first load once installed.
const LOCAL_ASSETS = [
  '/Gungbe-Yor/',
  '/Gungbe-Yor/index.html',
  '/Gungbe-Yor/manifest.json',
  '/Gungbe-Yor/icon-192.png',
  '/Gungbe-Yor/icon-512.png',
  '/Gungbe-Yor/vendor/react.production.min.js',
  '/Gungbe-Yor/vendor/react-dom.production.min.js',
  '/Gungbe-Yor/vendor/babel.min.js',
  '/Gungbe-Yor/vendor/confetti.browser.min.js',
];

// Firebase compat SDK is loaded from gstatic (browser-ready build). Precache it
// best-effort so the app still works offline after the first successful load.
const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js',
];

// -- Install: pre-cache everything ------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each asset best-effort so one missing file never blocks install
    await Promise.allSettled(
      LOCAL_ASSETS.map(url =>
        fetch(url, { cache: 'reload' })
          .then(res => { if (res.ok) return cache.put(url, res); })
          .catch(() => {})
      )
    );
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

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Self-hosted vendor libraries: cache-first (versioned, won't change between
  // deploys; a new library version ships as a new file or a cache bump)
  if (url.includes('/vendor/')) {
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

  // gstatic Firebase SDK: cache-first (versioned, immutable)
  if (url.indexOf('gstatic.com/firebasejs/') !== -1) {
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

  // Requests with cache-buster (?t=...) go straight to network - never intercept
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
