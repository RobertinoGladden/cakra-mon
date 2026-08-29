// Cakra Service Worker — v2.0.1 (Network-first untuk HTML/JS, Cache-first untuk CDN)
const CACHE_NAME = 'cakra-v2.0.1';
const CDN_CACHE  = 'cakra-cdn-v2.0.1';

const LOCAL_ASSETS = [
  '/css/base.css', '/css/dashboard.css', '/css/upload.css',
  '/js/parser.js', '/js/charts.js', '/js/map.js',
  '/js/dashboard.js', '/js/ai.js', '/js/upload.js',
  '/icons/icon.svg', '/manifest.json'
];

const CDN_PATTERNS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CDN_CACHE)
      .then(c => c.addAll(LOCAL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CDN_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  // HTML & JS lokal → Network first (selalu ambil yang terbaru)
  if (url.endsWith('.html') || (url.includes('/js/') && !url.includes('cdnjs'))) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // CDN assets → Cache first
  const isCdn = CDN_PATTERNS.some(p => url.includes(p));
  if (isCdn) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CDN_CACHE).then(c => c.put(e.request, clone));
          return res;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Lainnya → Cache first dengan fallback network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
