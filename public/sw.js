// Service worker for Homelab (Nordlys). Prompt 32 (claude-code-web-cache-fiks.md):
// - Navigasjon/HTML: alltid nettverket først (cache bare som reserve uten nett), så en ny versjon slår inn med en gang.
// - Versjonerte filer (/assets/…?v=<build>, serveren skriver dem inn i HTML og importer): cache først (immutable).
// - Uversjonerte /assets/: nettverket først med revalidering. API-kall går aldri via cachen.
// - skipWaiting i install, clients.claim i activate, og alle gamle cacher (andre navn) slettes.
const CACHE = 'os-v32';
const SHELL = ['/assets/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k.startsWith('os-')).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
const put = (req, res) => { if (res && res.ok && res.type === 'basic' && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); } return res; };
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/finans/') || url.pathname === '/version.json' || url.pathname === '/sw.js') return;
  if (req.mode === 'navigate') {
    // HTML: nettverket først, uten HTTP-cache. Uten nett: siste kopi.
    e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => put(new Request(url.pathname), res)).catch(() => caches.match(url.pathname).then((r) => r || Response.error())));
    return;
  }
  if (!url.pathname.startsWith('/assets/')) return;
  if (url.searchParams.has('v')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => put(req, res)).catch(() => caches.match(req).then((r) => r || Response.error())));
});

/* ---------- Prompt 31: Web Push (varsler når fanen er lukket) ---------- */
// Serveren (server/notify.js → notifyUser) sender {title, body, url, tag, category, id?, actions?}, kryptert med aes128gcm.
// AI-svar vises ikke som varsel når en fane med dashbordet er synlig (der vises svaret i siden).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Glimt';
  const opts = {
    body: String(d.body || '').replace(/\*\*/g, ''), tag: d.tag || undefined, renotify: !!d.tag, icon: d.icon || '/assets/icons/icon-192.png', badge: d.badge || '/assets/icons/icon-192.png', // prompt 39: Glimt-logo på AI-svar
    data: { url: d.url || '/#/dash', category: d.category || '', id: d.id ?? null, actions: d.actions || null },
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2).map((a) => ({ action: a.action || a.id, title: a.title })) : [],
  };
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const vis = cs.some((c) => c.visibilityState === 'visible' && !new URL(c.url).pathname.startsWith('/finans'));
    if (vis && d.category === 'ai') return;
    await self.registration.showNotification(title, opts);
  })());
});
self.addEventListener('notificationclick', (e) => {
  const n = e.notification, D = n.data || {};
  n.close();
  let url = D.url || '/#/dash';
  // Handlinger på prøve-varsler: Avslutt nå (oppsigelsessiden), Behold, Minn meg i morgen (PATCH på prøven).
  const act = e.action && Array.isArray(D.actions) ? D.actions.find((a) => (a.action || a.id) === e.action) : null;
  if (act?.url) url = act.url;
  e.waitUntil((async () => {
    if (act && act.patch && D.id != null) {
      try { await fetch(`/finans/api/subscriptions/trials/${encodeURIComponent(D.id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(act.patch) }); } catch {}
      if (!act.url) return;
    }
    const abs = new URL(url, self.location.origin).href;
    if (new URL(abs).origin !== self.location.origin) { await self.clients.openWindow(abs); return; }
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = cs.find((x) => !new URL(x.url).pathname.startsWith('/finans'));
    if (c) { try { await c.focus(); } catch {} try { if ('navigate' in c) await c.navigate(abs); } catch {} return; }
    await self.clients.openWindow(abs);
  })());
});
