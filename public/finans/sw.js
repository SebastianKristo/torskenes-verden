// FinansHub service worker: appskallet caches; API-kall går alltid til nettverket, unntatt bakgrunnsbildene
// (/api/background/img/…, /api/bg/…), som lagres i en egen cache så fotovinduet virker uten nett (prompt 19).
const CACHE = 'finanshub-v27';
const BGCACHE = 'finanshub-bg-v1', BGMAX = 40;
const SHELL = ['/assets/finans/css/finans.css', '/assets/finans/css/mobile.css', '/assets/finans/js/main.js', '/assets/finans/js/core.js', '/assets/finans/js/desktop.js', '/assets/finans/js/modules.js', '/assets/finans/js/mobile.js', '/assets/finans/js/mobile-mods.js', '/assets/finans/js/mobile-set.js', '/assets/finans/js/mobile-hl.js', '/assets/finans/js/mobile-pages.js', '/assets/finans/js/mobile-tx.js', '/assets/finans/js/mobile-theme.js', '/assets/finans/js/mobile-mat.js', '/assets/finans/js/mobile-finn.js', '/assets/finans/js/mobile-track.js', '/assets/finans/js/mobile-aks.js', '/assets/finans/js/mobile-p16.js', '/assets/finans/js/mobile-p17.js', '/assets/finans/js/mobile-subs.js', '/assets/finans/js/mobile-haptics.js', '/assets/finans/js/mobile-paper.js', '/assets/finans/js/mobile-bg.js', '/assets/finans/js/mobile-paper2.js', '/assets/finans/js/mobile-paper3.js', '/assets/finans/js/mobile-wx.js', '/assets/finans/js/mobile-gate.js', '/assets/finans/js/mobile-upq.js', '/assets/finans/js/mobile-p20.js', '/assets/finans/js/mobile-p21.js', '/assets/finans/js/mobile-p22.js', '/assets/finans/js/mobile-p23.js', '/assets/finans/js/mobile-p24.js', '/assets/finans/js/mobile-p25.js', '/assets/finans/js/mobile-wx22.js', '/assets/finans/js/mobile-p26.js', '/assets/finans/js/mobile-kal.js', '/assets/finans/js/mobile-p27.js', '/assets/finans/js/mobile-chat.js', '/assets/finans/js/loader.js', '/assets/finans/js/reanalyze.js', '/assets/finans/js/finn-desktop.js', '/assets/finans/css/finn.css', '/assets/finans/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== BGCACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && url.origin === location.origin && /^\/api\/(background\/img|bg)\//.test(url.pathname)) return e.respondWith(bgImage(e.request, url));
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/assets/finans/')) return;
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request)));
});
// Bildene har fast id (og ETag): fra cachen først, ellers nettet. Forsøksparameteren r= ignoreres i nøkkelen.
async function bgImage(req, url) {
  const forced = url.searchParams.has('r'); url.searchParams.delete('r');
  const key = url.toString(), c = await caches.open(BGCACHE), hit = await c.match(key);
  if (hit && !forced) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      await c.put(key, res.clone());
      const ks = await c.keys();
      for (const k of ks.slice(0, Math.max(0, ks.length - BGMAX))) await c.delete(k);
    }
    return res;
  } catch (err) { if (hit) return hit; throw err; }
}
