const CACHE = 'cube-four-finish-mode-1';
const SHELL = [
  './', './index.html', './styles.css?v=finish-mode-1', './online.css?v=gold-silver-1',
  './src/main.js?v=finish-mode-1', './src/core.js', './src/challenges.js?v=finish-mode-1', './src/renderer.js?v=feature-suite-1',
  './src/audio.js?v=home-bgm-1', './src/online.js?v=feature-suite-1', './src/ai-worker.js',
  './vendor/three.module.min.js', './vendor/OrbitControls.js', './vendor/qrcode.js', './vendor/supabase.js',
  './public/audio/warning-sign.mp3', './public/icons/cube-four.svg', './manifest.webmanifest?v=feature-suite-1', './config.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
