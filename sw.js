// Cakra Service Worker — v2.0.1 (Network-first untuk HTML/JS, Cache-first untuk CDN)
const CACHE_NAME = 'cakra-v2.0.1';
const CDN_CACHE  = 'cakra-cdn-v2.0.1';

const LOCAL_ASSETS = [
  '/index.html', '/dashboard.html', '/predict.html', '/compare.html', '/docs.html', '/about.html',
  '/css/base.css', '/css/dashboard.css', '/css/upload.css',
  '/js/parser.js', '/js/charts.js', '/js/map.js', '/js/route.js',
  '/js/dashboard.js', '/js/ai.js', '/js/upload.js', '/js/predict.js',
  '/js/propagation.js', '/js/buildings.js', '/js/export.js',
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
  const accept = e.request.headers.get('accept') || '';
  const isHTML = url.endsWith('.html') || e.request.mode === 'navigate' ||
    (accept.includes('text/html') && !url.includes('cdnjs') && !url.includes('fonts.'));

  // HTML (termasuk URL bersih tanpa .html) → Network first + simpan ke cache (PWA offline)
  if (isHTML) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then(m => m || caches.match('/index.html')))
    );
    return;
  }

  // JS lokal → Network first (selalu ambil yang terbaru)
  if (url.includes('/js/') && !url.includes('cdnjs')) {
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
