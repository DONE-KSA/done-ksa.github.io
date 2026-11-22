/* DONE | تمّ — service worker: makes the site installable and usable offline */
const CACHE = 'done-v4';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './assets/css/style.css', './assets/js/data.js', './assets/js/api.js', './assets/js/app.js',
  './assets/img/icon.svg', './assets/img/logo.svg', './assets/img/logo-light.svg', './assets/img/calacatta.svg',
  ...['measure', 'design', 'porcelain', 'sink', 'kitchen', 'table', 'parquet', 'mosaic', 'aluminium'].map((s) => `./assets/img/services/${s}.svg`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first, fall back to cache (keeps content fresh, works offline)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
