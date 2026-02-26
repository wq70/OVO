// A basic service worker to make the app installable
self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
});

self.addEventListener('fetch', (event) => {
  // This basic service worker doesn't intercept any requests.
  // It just lets the browser handle them as usual.
  return;
});