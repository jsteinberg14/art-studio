// Keeps the app working offline. Change VERSION whenever you update files,
// so phones and iPads pick up the new version.
const VERSION = 'art-studio-v26';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/db.js', './js/draw.js', './js/feedback.js', './js/icons.js',
  './js/ideas.js', './js/zoom.js', './js/kindness.js', './js/sample.js', './js/config.js', './js/cloud.js', './js/friends.js',
  './privacy.html', './consent-form.html',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
