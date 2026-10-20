// FinansHub service worker: appskallet caches; API-kall går alltid til nettverket, unntatt bakgrunnsbildene
// (/api/background/img/…, /api/bg/…), som lagres i en egen cache så fotovinduet virker uten nett (prompt 19).
// Prompt 31: Web Push (Glimt-svar, prøveperioder, oppdatering, rask time) vises når appen er lukket eller i bakgrunnen;
// trykk på varselet åpner riktig side (data.url) i et åpent vindu eller et nytt.
// Prompt 32 (claude-code-web-cache-fiks.md): nettverk først for HTML/navigasjon, cache først bare for versjonerte filer (?v=<build>),
// skipWaiting + clients.claim, gamle cacher slettes i activate. Klienten (mobile-p32.js) kaller registration.update() ved
// oppstart, fokus og hvert 10. minutt, og laster siden på nytt én gang ved controllerchange.
// Prompt 34: v34 – mobile-p34.js (haptikk tilbake, kvitteringer under AI-analyse, Glimt-brief, markering) og mobile-p34ai.js (AI-kontroll).
// Prompt 35: v35 – mobile-p35.js (Glimt-familien, brief med venner og opplesning, Innstillinger → Glimt, vær for sted) og /assets/js/glimt-figs.js.
// Prompt 36: v36 – mobile-p36.js (sveip bort brief, Sherlock-/snekker-Glimt, oppstartsside, tidligere versjoner, profilbilde, ikoner, temperatur trykk/hold, Mat felles, Google-kalendere).
// Prompt 37: v37 – mobile-p37.js (Gjøremål: uten fanelinje, detaljark, delte lister, Glimt i ✦-knappen) og mobile-p37b.js
// (bibelvers, onboarding med profil, «hvor er X», Pakker «bare når det er pakker», prøveperioder og delte abonnementer).
// Prompt 38: v38 – mobile-p38.js (AI-svar lukk, nye brief-kort, prestedrakt, ØKT i Konto, QR-innlogging, Glimt i Domener).
// Prompt 39: v39 – mobile-p39.js (sveip bort myk uten hint, Bibel uten fanelinje, wiggle-ark, Tilpass og Appprofil, Yr mot Storm 2a
// med wiggle, Glimt · ukas vær, kvittering «På nytt» med fremdrift). Glimt-varsler bruker Glimt-logoen (/assets/glimt-varsel.png + badge).
// Prompt 40: v40 – mobile-p40.js (Gjøremål-Glimt flere punkter, tastaturbaren, julemodus, 2FA i appen, Finans lagt til / Rediger alt /
// Les på nytt / søk med Glimt-kort, brief → Bibel, Nyheter Glimt-side) og mobile-p40h.js (Hjemlys 1a + 1b + 1c) + sveip/wiggle-fiksen i mobile-p39.js og mobile-paper3.js.
// Prompt 41: v42 – mobile-p41.js (Oslo fra lufta, skanneknapp på Hjem, Fold 1c, søkepille → Chat, Huskeliste-Glimt i bakgrunnen,
// Konto → Server, 17. mai, Vær rediger/skiføre) og mobile-p41b.js (Min reise, Hjemlys i Familie, Bursdager). Commons-bildene for
// «Oslo» caches i bakgrunnscachen (Special:FilePath → upload.wikimedia.org).
// Prompt 42: v43 – mobile-p42.js (Hjem-knapp i fanelinja 1a–1d med forhåndsvisning, HELSE (FAMILIE) i Innstillinger,
// Vel fremme-statuslinje, lokal deling i Gjøremål-Glimt) + Soner uten kart/ikonsøk (mobile-p22.js), PostNord-logo pakket med
// appen (mobile-track.js), bibelvers-arket med fast knapp (mobile-p37b.js), Klassisk-designet slettet.
const CACHE = 'finanshub-v43';
const BGCACHE = 'finanshub-bg-v1', BGMAX = 40;
const SHELL = ['/assets/finans/css/finans.css', '/assets/finans/css/mobile.css', '/assets/finans/js/main.js', '/assets/finans/js/core.js', '/assets/finans/js/desktop.js', '/assets/finans/js/modules.js', '/assets/finans/js/mobile.js', '/assets/finans/js/mobile-mods.js', '/assets/finans/js/mobile-set.js', '/assets/finans/js/mobile-hl.js', '/assets/finans/js/mobile-pages.js', '/assets/finans/js/mobile-tx.js', '/assets/finans/js/mobile-theme.js', '/assets/finans/js/mobile-mat.js', '/assets/finans/js/mobile-finn.js', '/assets/finans/js/mobile-track.js', '/assets/finans/js/mobile-aks.js', '/assets/finans/js/mobile-p16.js', '/assets/finans/js/mobile-p17.js', '/assets/finans/js/mobile-subs.js', '/assets/finans/js/mobile-haptics.js', '/assets/finans/js/mobile-paper.js', '/assets/finans/js/mobile-bg.js', '/assets/finans/js/mobile-paper2.js', '/assets/finans/js/mobile-paper3.js', '/assets/finans/js/mobile-wx.js', '/assets/finans/js/mobile-gate.js', '/assets/finans/js/mobile-upq.js', '/assets/finans/js/mobile-p20.js', '/assets/finans/js/mobile-p21.js', '/assets/finans/js/mobile-p22.js', '/assets/finans/js/mobile-p23.js', '/assets/finans/js/mobile-p24.js', '/assets/finans/js/mobile-p25.js', '/assets/finans/js/mobile-wx22.js', '/assets/finans/js/mobile-p26.js', '/assets/finans/js/mobile-kal.js', '/assets/finans/js/mobile-p27.js', '/assets/finans/js/mobile-p28.js', '/assets/finans/js/mobile-p29.js', '/assets/finans/js/mobile-p30.js', '/assets/finans/js/mobile-p30b.js', '/assets/finans/js/mobile-p31.js', '/assets/finans/js/mobile-p32.js', '/assets/finans/js/mobile-p33.js', '/assets/finans/js/mobile-p34.js', '/assets/finans/js/mobile-p34ai.js', '/assets/finans/js/mobile-p35.js', '/assets/finans/js/mobile-p36.js', '/assets/finans/js/mobile-p37.js', '/assets/finans/js/mobile-p37b.js', '/assets/finans/js/mobile-p38.js', '/assets/finans/js/mobile-p39.js', '/assets/finans/js/mobile-p40.js', '/assets/finans/js/mobile-p40h.js', '/assets/finans/js/mobile-p41.js', '/assets/finans/js/mobile-p41b.js', '/assets/finans/js/mobile-p42.js', '/assets/js/glimt-figs.js', '/assets/js/widget-help.js', '/assets/finans/js/sub-shot.js', '/assets/finans/js/mobile-chat.js', '/assets/finans/js/mobile-upd.js', '/assets/finans/js/loader.js', '/assets/finans/js/reanalyze.js', '/assets/finans/js/finn-desktop.js', '/assets/finans/css/finn.css', '/assets/finans/icons/icon-192.png'];
// Feiler én fil (f.eks. en modul som ikke finnes på en eldre server), installeres service workeren likevel.
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))); });
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting' || e.data?.type === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('finanshub-') && k !== CACHE && k !== BGCACHE) /* bare egne gamle cacher: web-dashboardets os-* har samme origin */.map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && url.origin === location.origin && /^\/api\/(background\/img|bg)\//.test(url.pathname)) return e.respondWith(bgImage(e.request, url));
  if (e.request.method === 'GET' && (url.host === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/Special:FilePath/') || url.host === 'upload.wikimedia.org')) return e.respondWith(bgImage(e.request, url)); // prompt 41: Oslo fra lufta
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // HTML og navigasjon: alltid nettverket først (no-store), cachen bare uten nett.
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    if (!url.pathname.startsWith('/finans')) return;
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/finans/', copy)); } return res; }).catch(async () => (await caches.match(e.request)) || (await caches.match('/finans/')) || Response.error()));
    return;
  }
  if (!url.pathname.startsWith('/assets/finans/') && !url.pathname.startsWith('/assets/js/')) return;
  // Versjonerte filer (?v=<build>) endres aldri: cachen først.
  if (url.searchParams.has('v')) { e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }))); return; }
  // Uversjonerte filer: nettverket først (no-cache), så cachen uten nett.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
// Bildene har fast id (og ETag): fra cachen først, ellers nettet. Forsøksparameteren r= ignoreres i nøkkelen.
async function bgImage(req, url) {
  const forced = url.searchParams.has('r'); url.searchParams.delete('r');
  const key = url.toString(), c = await caches.open(BGCACHE), hit = await c.match(key);
  if (hit && !forced) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') { // prompt 41: Commons-bildene er krysskilde (opaque)
      await c.put(key, res.clone());
      const ks = await c.keys();
      for (const k of ks.slice(0, Math.max(0, ks.length - BGMAX))) await c.delete(k);
    }
    return res;
  } catch (err) { if (hit) return hit; throw err; }
}

/* ---------- Prompt 31: Web Push ---------- */
// Serveren (server/notify.js notifyUser) sender {id, title, body, url, tag, category, data}. Kryptert med aes128gcm (RFC 8291).
// Prøve-varsler har data.actions [{id:'cancel'|'keep'|'snooze', title}] og data.trialId / data.cancelUrl.
const ACT = { keep: { status: 'kept' }, snooze: { snooze: 'tomorrow' } };
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const D = d.data || {}, acts = Array.isArray(D.actions) ? D.actions : Array.isArray(d.actions) ? d.actions : [];
  // Prompt 39: AI-svar (og andre Glimt-varsler) har tittelen «Glimt» og Glimt-logoen; resten beholder app-ikonet.
  const gl = d.category === 'ai' || /^glimt\b/i.test(d.title || '') || /\bAI$/.test(d.title || '');
  const title = gl && d.category === 'ai' ? 'Glimt' : d.title || 'Glimt';
  const opts = {
    body: String(d.body || '').replace(/\*\*/g, ''), tag: d.tag || undefined, renotify: !!d.tag, icon: gl ? '/assets/glimt-varsel.png' : '/assets/finans/icons/icon-192.png', badge: gl ? '/assets/glimt-badge.png' : '/assets/finans/icons/icon-192.png',
    data: { url: d.url || '/finans/#/hl', category: d.category || '', trialId: D.trialId ?? null, cancelUrl: D.cancelUrl ?? null },
    actions: acts.slice(0, 2).map((a) => ({ action: a.id || a.action, title: a.title })),
  };
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const vis = cs.some((c) => c.visibilityState === 'visible' && new URL(c.url).pathname.startsWith('/finans'));
    for (const c of cs) c.postMessage({ type: 'p31-push', payload: { ...d, shown: !vis } });
    // Serveren holder tilbake push når appen er synlig (presence); kommer det likevel et AI-svar, viser appen det selv.
    if (vis && d.category === 'ai') return;
    await self.registration.showNotification(title, opts);
  })());
});
self.addEventListener('notificationclick', (e) => {
  const n = e.notification, D = n.data || {};
  n.close();
  let url = D.url || '/finans/#/hl';
  if (e.action === 'cancel' && D.cancelUrl) url = D.cancelUrl;
  e.waitUntil((async () => {
    if (ACT[e.action] && D.trialId != null) {
      try { await fetch(`/finans/api/subscriptions/trials/${encodeURIComponent(D.trialId)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ACT[e.action]) }); } catch {}
      return;
    }
    const abs = new URL(url, self.location.origin).href;
    if (new URL(abs).origin !== self.location.origin) { await self.clients.openWindow(abs); return; }
    // Web-lenker (/chat, /kalender …) åpnes i appen når den er installert: Chat og Hjem har egne sider der.
    const u = new URL(abs), map = { '/chat': '/finans/#/chat', '/': '/finans/#/hl', '/kalender': '/finans/#/kal', '/abonnementer': '/finans/#/sub' };
    const dest = u.pathname.startsWith('/finans') ? abs : /system/.test(u.hash) ? new URL('/finans/#/nordlys', self.location.origin).href : new URL(map[u.pathname] || abs, self.location.origin).href;
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = cs.find((x) => new URL(x.url).pathname.startsWith('/finans'));
    if (c) { try { await c.focus(); } catch {} c.postMessage({ type: 'p31-open', url: dest }); return; }
    await self.clients.openWindow(dest);
  })());
});
