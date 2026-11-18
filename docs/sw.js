const C = 'guide-v3';
const FILES = ['./', 'index.html', 'guide.css', 'guide.js', 'guide.json', 'mutalaa/', 'mutalaa/index.html', 'mutalaa/style.css', 'mutalaa/app.js', 'mutalaa/engine.js', 'mutalaa/vendor/jszip.min.js', 'manifest.json', 'icon.svg', 'icon-192.png',
  'fonts/cairo-arabic-400-normal.woff2', 'fonts/cairo-arabic-700-normal.woff2', 'fonts/cairo-latin-400-normal.woff2', 'fonts/cairo-latin-700-normal.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // الشبكة أولاً حتى تصل التحديثات، والنسخة المحفوظة عند انقطاع الإنترنت
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
