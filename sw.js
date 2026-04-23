const CACHE_NAME = 'legitile-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/tracker.html',
  '/overtime.html',
  '/sidebar.html',
  '/manifest.json'
  // Add any local CSS or JS files here if you aren't using CDNs
];

// Install Event - Cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch Event - Serve from cache first, then network
self.addEventListener('fetch', event => {
  // We only want to cache the static UI, NOT your live API calls
  if (event.request.url.includes('.workers.dev') || event.request.url.includes('wslwebservices')) {
      return; 
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
});
