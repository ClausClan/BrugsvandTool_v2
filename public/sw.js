const CACHE_NAME = 'vv-tool-v1'; // Husk at ændre dette tal (v2, v3...), når du opdaterer koden!

// Liste over filer, der SKAL caches for at appen virker offline.
// Vi cacher også CDN-bibliotekerne, så du ikke er afhængig af nettet.
const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'icon-192_BV.png',
  'icon-512_BV.png',
  // Eksterne biblioteker (SKAL matche dine HTML-links præcist)
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://d3js.org/d3.v7.min.js'
];

// 1. INSTALLERING: Cacher alle filer
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installerer...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cacher app-filer');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. AKTIVERING: Rydder op i gamle caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Aktiverer...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Sletter gammel cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. FETCH: Henter fra cache først, ellers netværk
self.addEventListener('fetch', (event) => {
  // Kun håndter HTTP/HTTPS-anmodninger (ignorer fx chrome-extension://, ws://, wss://, osv.)
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Hit i cache? Returner det.
        if (response) {
          return response;
        }
        // Ellers hent fra netværket
        return fetch(event.request);
      })
  );
});
