// Enkel service worker: gjør appen installerbar og holder skallet tilgjengelig offline.
// API-kall går alltid til nettverket.
const CACHE = 'os-v3';
const SHELL = ['/assets/css/app.css', '/assets/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/assets/')) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request)));
});

/* ---------- Prompt 31: Web Push (varsler når fanen er lukket) ---------- */
// Serveren (server/notify.js → notifyUser) sender {title, body, url, tag, category, id?, actions?}, kryptert med aes128gcm.
// AI-svar vises ikke som varsel når en fane med dashbordet er synlig (der vises svaret i siden).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Glimt';
  const opts = {
    body: String(d.body || '').replace(/\*\*/g, ''), tag: d.tag || undefined, renotify: !!d.tag, icon: '/assets/icons/icon-192.png', badge: '/assets/icons/icon-192.png',
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
