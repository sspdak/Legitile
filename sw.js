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

// Fetch Event - Serve from cache first, then network fallback
self.addEventListener('fetch', event => {
  // We only want to cache the static UI, NOT your live API calls
  if (event.request.url.includes('.workers.dev') || event.request.url.includes('wslwebservices')) {
      return; 
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      // 1. Return the cached file if we have it
      if (response) {
        return response;
      }
      
      // 2. If it's not in cache, try the network. 
      // 3. Catch the error if the network is asleep/offline when resuming the app
      return fetch(event.request).catch(() => {
          // If the network fails and it was a page navigation, safely fallback to the dashboard
          if (event.request.mode === 'navigate') {
              return caches.match('/home.html');
          }
      });
    })
  );
});
