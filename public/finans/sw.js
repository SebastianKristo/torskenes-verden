// FinansHub service worker: appskallet caches; API-kall går alltid til nettverket.
const CACHE = 'finanshub-v8';
const SHELL = ['/assets/finans/css/finans.css', '/assets/finans/css/mobile.css', '/assets/finans/js/main.js', '/assets/finans/js/core.js', '/assets/finans/js/desktop.js', '/assets/finans/js/modules.js', '/assets/finans/js/mobile.js', '/assets/finans/js/mobile-mods.js', '/assets/finans/js/mobile-set.js', '/assets/finans/js/mobile-hl.js', '/assets/finans/js/mobile-pages.js', '/assets/finans/js/mobile-tx.js', '/assets/finans/js/mobile-theme.js', '/assets/finans/js/mobile-mat.js', '/assets/finans/js/mobile-finn.js', '/assets/finans/js/mobile-track.js', '/assets/finans/js/mobile-aks.js', '/assets/finans/js/mobile-subs.js', '/assets/finans/js/mobile-haptics.js', '/assets/finans/js/finn-desktop.js', '/assets/finans/css/finn.css', '/assets/finans/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/assets/finans/')) return;
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request)));
});
