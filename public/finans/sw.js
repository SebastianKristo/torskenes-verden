// FinansHub service worker: appskallet caches; API-kall går alltid til nettverket, unntatt bakgrunnsbildene
// (/api/background/img/…, /api/bg/…), som lagres i en egen cache så fotovinduet virker uten nett (prompt 19).
// Prompt 31: Web Push (Glimt-svar, prøveperioder, oppdatering, rask time) vises når appen er lukket eller i bakgrunnen;
// trykk på varselet åpner riktig side (data.url) i et åpent vindu eller et nytt.
// Prompt 32 (claude-code-web-cache-fiks.md): nettverk først for HTML/navigasjon, cache først bare for versjonerte filer (?v=<build>),
// skipWaiting + clients.claim, gamle cacher slettes i activate. Klienten (mobile-sidefaner-og-sw.js) kaller registration.update() ved
// oppstart, fokus og hvert 10. minutt, og laster siden på nytt én gang ved controllerchange.
// Prompt 34: v34 – mobile-glimt-brief.js (haptikk tilbake, kvitteringer under AI-analyse, Glimt-brief, markering) og mobile-ai-kontroll.js (AI-kontroll).
// Prompt 35: v35 – mobile-glimt-figurer.js (Glimt-familien, brief med venner og opplesning, Innstillinger → Glimt, vær for sted) og /assets/js/glimt-figs.js.
// Prompt 36: v36 – mobile-brief-og-oppstart.js (sveip bort brief, Sherlock-/snekker-Glimt, oppstartsside, tidligere versjoner, profilbilde, ikoner, temperatur trykk/hold, Mat felles, Google-kalendere).
// Prompt 37: v37 – mobile-gjoremal.js (Gjøremål: uten fanelinje, detaljark, delte lister, Glimt i ✦-knappen) og mobile-bibel-og-onboarding.js
// (bibelvers, onboarding med profil, «hvor er X», Pakker «bare når det er pakker», prøveperioder og delte abonnementer).
// Prompt 38: v38 – mobile-okt-og-qr.js (AI-svar lukk, nye brief-kort, prestedrakt, ØKT i Konto, QR-innlogging, Glimt i Domener).
// Prompt 39: v39 – mobile-sveip-bort.js (sveip bort myk uten hint, Bibel uten fanelinje, wiggle-ark, Tilpass og Appprofil, Yr mot Storm 2a
// med wiggle, Glimt · ukas vær, kvittering «På nytt» med fremdrift). Glimt-varsler bruker Glimt-logoen (/assets/glimt-varsel.png + badge).
// Prompt 40: v40 – mobile-jul-og-totrinn.js (Gjøremål-Glimt flere punkter, tastaturbaren, julemodus, 2FA i appen, Finans lagt til / Rediger alt /
// Les på nytt / søk med Glimt-kort, brief → Bibel, Nyheter Glimt-side) og mobile-vel-fremme.js (Hjemlys 1a + 1b + 1c) + sveip/wiggle-fiksen i mobile-sveip-bort.js og mobile-tilpassing.js.
// Prompt 41: v42 – mobile-bakgrunn-og-hoytider.js (Oslo fra lufta, skanneknapp på Hjem, Fold 1c, søkepille → Chat, Huskeliste-Glimt i bakgrunnen,
// Konto → Server, 17. mai, Vær rediger/skiføre) og mobile-min-reise.js (Min reise, Hjemlys i Familie, Bursdager). Commons-bildene for
// «Oslo» caches i bakgrunnscachen (Special:FilePath → upload.wikimedia.org).
// Prompt 42: v43 – mobile-oversikt-knapp.js (Hjem-knapp i fanelinja 1a–1d med forhåndsvisning, HELSE (FAMILIE) i Innstillinger,
// Vel fremme-statuslinje, lokal deling i Gjøremål-Glimt) + Soner uten kart/ikonsøk (mobile-familie-soner.js), PostNord-logo pakket med
// appen (mobile-track.js), bibelvers-arket med fast knapp (mobile-bibel-og-onboarding.js), Klassisk-designet slettet.
// Prompt 42: v44 – FinansHub web (Boliger 2a+1b, Filter, Glimt-oppgaver, v2 slettet).
// Prompt 43: v45 – mobile-widgets-og-media.js (Hjem-widget Media, Widgets-siden, rekkefølge på lister, Claude-import, stor skjerm),
// mobile-media.js (Media: Sonarr, Radarr, qBittorrent, Prowlarr) og mobile-orb.js (Glimt-orben) + saldokort 4b, månedstopp i Liste,
// Glimt-knapp i Finans, Glimt-rad i Domener, send-knappen i Chat, svarboble → Chat med samme svar, Integrasjoner MEDIA.
// Prompt 44: v46 – mobile-mer-og-gjoremal.js (Mer ny, Gjøremål-infoside og deloppgaver, Innstillinger → Gjøremål, Logg inn som, Overfør eier,
// Tidligere versjoner, Glimt-tid), mobile-logger.js (Logger), mobile-studie.js (Studie → Dokumenter), mobile-avspilling.js (Avspilling) og
// Media: servervalg, søk, banner, last ned på nytt/slett, interaktivt søk som jobb.
// Prompt 45: v47 – mobile-glimt-agent.js (Glimt-agenten, brett: skann/Hjem-knapp/wiggle i navbaren, Finans → Mer, Mer-tittel og store bokser,
// Ruter-antall, Vær «Min posisjon», sonevarsler, Innstillinger samlet, personlighet) og mobile-helse.js (Helse fra Home Assistant).
// Prompt 46: v48 – mobile-nyheter-innstillinger.js (Nyheter i Innstillinger, sammendrag per kategori, liquid glass i Vær) og mobile-kart.js (Kart),
// + Vær Min posisjon, Gjøremål lukker ved fullfør, Bibel på brett, Ruter-innstillinger i wiggle, prøveperioder skjult, profilring.
// Prompt 47: v49 – Boliger mobil uten Tilgang-fane (Tilgang fra «Rediger bolig»), Innstillinger → Server med standardadresser
// (/assets/js/serveradresser.js), status og Test per adresse, Tilbakestill til standard.
// Prompt 48: v51 – kvitteringer lastes opp til /receipts/scan (serveren kjører Mac-OCR → Tesseract → Gemini), skjema med usikre
// felt og merkelapp for veien (kvittering-skjema.js), AI i Finans → Kvitteringer (Mac-OCR og stegene, /assets/js/receipts-settings.js).
// Prompt 50 (SRVCHAT50): v52 – «Les på nytt» som jobb (les-pa-nytt.js) og nye feilmeldinger.
// Prompt 50 (FAMWEB50): v53 – Familie i nytt design (mobile-familie.js + /assets/js/family.js), Ruter › Min reise henter skolen fra
// Familie › Steder. Sjekk inn-varsler: 👍 / Ring / Hent svarer med POST /api/family/checkin/:id/reply; «Hent meg» (priority high)
// blir liggende (requireInteraction). Familie-lenker (/#/familie/…) åpnes som #/fam/… i appen.
// Prompt 51 (RCPTUI51): v54 – «Rådata» og kilden til butikknavnet i kvitteringsskjemaet (kvittering-kilde.js, /assets/css/receipts51.css).
// Prompt 51 (MEDCTL51): v55 – fjernkontroll i Avspilling › Spilles nå (/assets/js/media-fjernkontroll.js).
// Prompt 51 (A11Y51): v56 – kontrast og berøringsflater (finans.css, mobile.css, mobile-theme.js, mobile-paper.js).
// Prompt 52 (WEB52F): v57 – felles kvitteringspanel (kvitteringspanel.js, kvitteringspanel.css), saldokortets utseende og avrundet månedslinje
// (mobile-saldokort.js), «Nytt i versjon» som papirkort (nytt-i-versjonen.js).
// Prompt 73 (LOGO73): v58 – «Endre logo» (endre-logo.js, endre-logo.css).
// Fase 3: v59 – samme strategi som /sw.js: versjonerte filer faller tilbake til den forhåndscachede filen uten ?v når nettet mangler
// (før traff skallet i SHELL aldri, fordi siden ber om filene med ?v=<build>). Se docs/utvikling.md («Service workere»).
// Fase 3 (Økonomi): v60 – nummererte filer har fått beskrivende navn (felles.css, boliger.css, planlegging.css, kvitteringspanel.css,
// endre-logo.css, boliger.js, filter.js …), tema.js (følger Homelab-temaet), sykluser.js (abonnementssykluser fra serveren) og
// designtokens (/assets/css/tokens.css).
// Fase 3 (Økonomi, siste runde): v61 – leaflet.js (Leaflet bare fra serveren, uten unpkg-reserve).
// Fase 3 (sammenslåing): v62 – sidene sine nye modulnavn (crash.js, family.js, media-fjernkontroll.js …) og pages/kvitteringer.css.
// Opprydding (Økonomi på mobil-web): v64 – mobile-p16…p46.js og mobile-paper2/3.js har fått beskrivende navn etter funksjon.
const CACHE = 'finanshub-v64';
const BGCACHE = 'finanshub-bg-v1', BGMAX = 40;
const SHELL = ['/assets/css/tokens.css', '/assets/finans/css/finans.css', '/assets/finans/css/mobile.css', '/assets/finans/css/felles.css', '/assets/finans/css/boliger.css', '/assets/finans/css/planlegging.css', '/assets/finans/js/tema.js', '/assets/finans/js/sykluser.js', '/assets/finans/js/main.js', '/assets/finans/js/core.js', '/assets/finans/js/desktop.js', '/assets/finans/js/modules.js', '/assets/finans/js/mobile.js', '/assets/finans/js/mobile-mods.js', '/assets/finans/js/mobile-set.js', '/assets/finans/js/mobile-hl.js', '/assets/finans/js/mobile-pages.js', '/assets/finans/js/mobile-tx.js', '/assets/finans/js/mobile-theme.js', '/assets/finans/js/mobile-mat.js', '/assets/finans/js/mobile-finn.js', '/assets/finans/js/mobile-track.js', '/assets/finans/js/mobile-aks.js', '/assets/finans/js/mobile-fanelinje.js', '/assets/finans/js/mobile-app-og-sanntid.js', '/assets/finans/js/mobile-subs.js', '/assets/finans/js/mobile-haptics.js', '/assets/finans/js/mobile-paper.js', '/assets/finans/js/mobile-bg.js', '/assets/finans/js/mobile-papir-sider.js', '/assets/finans/js/mobile-tilpassing.js', '/assets/finans/js/mobile-wx.js', '/assets/finans/js/mobile-gate.js', '/assets/finans/js/mobile-upq.js', '/assets/finans/js/mobile-posisjon-og-logoer.js', '/assets/finans/js/mobile-konto-og-deling.js', '/assets/finans/js/mobile-familie-soner.js', '/assets/finans/js/mobile-sveip-og-kvitteringer.js', '/assets/finans/js/mobile-profiler-og-bursdager.js', '/assets/finans/js/mobile-fanelinje-stil.js', '/assets/finans/js/mobile-vaer-kart-og-steder.js', '/assets/finans/js/mobile-integrasjoner.js', '/assets/finans/js/mobile-kal.js', '/assets/finans/js/mobile-sokefelt-og-nyheter.js', '/assets/finans/js/mobile-mer.js', '/assets/finans/js/mobile-sok-og-backup.js', '/assets/finans/js/mobile-system-og-ark.js', '/assets/finans/js/mobile-boliger-deling.js', '/assets/finans/js/mobile-glimt.js', '/assets/finans/js/mobile-sidefaner-og-sw.js', '/assets/finans/js/mobile-glimt-husker.js', '/assets/finans/js/mobile-glimt-brief.js', '/assets/finans/js/mobile-ai-kontroll.js', '/assets/finans/js/mobile-glimt-figurer.js', '/assets/finans/js/mobile-brief-og-oppstart.js', '/assets/finans/js/mobile-gjoremal.js', '/assets/finans/js/mobile-bibel-og-onboarding.js', '/assets/finans/js/mobile-okt-og-qr.js', '/assets/finans/js/mobile-sveip-bort.js', '/assets/finans/js/mobile-jul-og-totrinn.js', '/assets/finans/js/mobile-vel-fremme.js', '/assets/finans/js/mobile-bakgrunn-og-hoytider.js', '/assets/finans/js/mobile-min-reise.js', '/assets/finans/js/mobile-oversikt-knapp.js', '/assets/finans/js/mobile-widgets-og-media.js', '/assets/finans/js/mobile-media.js', '/assets/finans/js/mobile-orb.js', '/assets/finans/js/mobile-mer-og-gjoremal.js', '/assets/finans/js/mobile-logger.js', '/assets/finans/js/mobile-studie.js', '/assets/finans/js/mobile-avspilling.js', '/assets/js/media-fjernkontroll.js', '/assets/finans/js/mobile-glimt-agent.js', '/assets/finans/js/mobile-helse.js', '/assets/finans/js/mobile-nyheter-innstillinger.js', '/assets/finans/js/mobile-kart.js', '/assets/finans/js/leaflet.js', '/assets/finans/js/mobile-familie.js', '/assets/js/family.js', '/assets/js/zone-icons.js', '/assets/css/pages/familie.css', '/assets/js/glimt-figs.js', '/assets/js/lib/viewport.js', '/assets/js/lib/chunks.js', '/assets/js/lib/dates.js', '/assets/js/serveradresser.js', '/assets/js/receipts-settings.js', '/assets/css/pages/kvitteringer.css', '/assets/finans/js/kvittering-skjema.js', '/assets/finans/js/kvittering-kilde.js', '/assets/js/widget-help.js', '/assets/finans/js/sub-shot.js', '/assets/finans/js/mobile-chat.js', '/assets/finans/js/mobile-upd.js', '/assets/finans/js/loader.js', '/assets/finans/js/reanalyze.js', '/assets/finans/js/les-pa-nytt.js', '/assets/finans/js/finn-desktop.js', '/assets/finans/css/finn.css', '/assets/finans/css/kvitteringspanel.css', '/assets/finans/js/kvitteringspanel.js', '/assets/finans/js/mobile-saldokort.js', '/assets/finans/js/nytt-i-versjonen.js', '/assets/finans/js/kvitteringskort.js', '/assets/finans/js/endre-logo.js', '/assets/finans/css/endre-logo.css', '/assets/finans/js/kategori-flytting.js', '/assets/finans/js/kvittering-flytting.js', '/assets/finans/icons/icon-192.png'];
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
    if (!url.pathname.startsWith('/finans') || url.pathname.startsWith('/finans/api/')) return; // prompt 51 (FIN51): API-sider (skatteeksport o.l.) caches ikke som appskallet
    // Prompt 51 (FIN51): egne sider (/finans/plan51) caches under sin egen adresse, ikke som appskallet /finans/.
    const key = url.pathname === '/finans/' || url.pathname === '/finans' ? '/finans/' : url.pathname;
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return res; }).catch(async () => (await caches.match(key)) || (await caches.match(e.request)) || (await caches.match('/finans/')) || Response.error()));
    return;
  }
  if (!url.pathname.startsWith('/assets/finans/') && !url.pathname.startsWith('/assets/js/')) return;
  // Versjonerte filer (?v=<build>) endres aldri: cachen først.
  if (url.searchParams.has('v')) { e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(async (err) => { const old = await c.match(e.request, { ignoreSearch: true }); if (old) return old; throw err; }))); return; }
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
  // Prompt 45: sonevarsler viser sonens ikon i sonefarge (iconUrl fra serveren) i stedet for app-logoen; app-merket som badge.
  const zone = D.kind === 'zone' || D.channel === 'sonevarsler' || d.category === 'familie' && !!(D.iconUrl || d.icon);
  const zIcon = zone ? (D.iconUrl || d.icon || null) : null;
  const opts = {
    body: String(d.body || '').replace(/\*\*/g, ''), tag: d.tag || undefined, renotify: !!d.tag, icon: zIcon || (gl ? '/assets/glimt-varsel.png' : '/assets/finans/icons/icon-192.png'), badge: gl ? '/assets/glimt-badge.png' : '/assets/finans/icons/icon-192.png',
    data: { url: d.url || '/finans/#/hl', category: d.category || '', trialId: D.trialId ?? null, cancelUrl: D.cancelUrl ?? null, kind: D.kind ?? null, checkinId: D.checkinId ?? null },
    actions: acts.slice(0, Math.max(2, (self.Notification && Notification.maxActions) || 2)).map((a) => ({ action: a.id || a.action, title: a.title })),
  };
  if (D.priority === 'high') { opts.requireInteraction = true; opts.vibrate = [300, 120, 300, 120, 300]; }
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
    // Prompt 50: svar på innsjekk/forespørsel med ett trykk fra varselet.
    if (/^checkin\./.test(D.kind || '') && D.checkinId != null && e.action) {
      if (e.action === 'checkin') url = `/#/familie/sjekk?req=${encodeURIComponent(D.checkinId)}`;
      else if (['ok', 'call', 'pickup'].includes(e.action)) {
        let r = null;
        try { r = await fetch(`/api/family/checkin/${encodeURIComponent(D.checkinId)}/reply`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply: e.action }) }); } catch {}
        if (e.action !== 'call' && r && r.ok) return;
        if (e.action === 'call') { try { const j = r && r.ok ? await r.json() : null; const ph = j && j.call && j.call.phone; if (ph) { await self.clients.openWindow(`tel:${String(ph).replace(/[^\d+]/g, '')}`); return; } } catch {} }
      }
    }
    if (ACT[e.action] && D.trialId != null) {
      try { await fetch(`/finans/api/subscriptions/trials/${encodeURIComponent(D.trialId)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ACT[e.action]) }); } catch {}
      return;
    }
    const abs = new URL(url, self.location.origin).href;
    if (new URL(abs).origin !== self.location.origin) { await self.clients.openWindow(abs); return; }
    // Web-lenker (/chat, /kalender …) åpnes i appen når den er installert: Chat og Hjem har egne sider der.
    const u = new URL(abs), map = { '/chat': '/finans/#/chat', '/': '/finans/#/hl', '/kalender': '/finans/#/kal', '/abonnementer': '/finans/#/sub' };
    const fam = !u.pathname.startsWith('/finans') && /^#\/familie/.test(u.hash) ? famPath50(u.hash) : null; // prompt 50
    const dest = fam != null ? new URL(`/finans/#/fam${fam ? `/${fam}` : ''}`, self.location.origin).href : u.pathname.startsWith('/finans') ? abs : /system/.test(u.hash) ? new URL('/finans/#/nordlys', self.location.origin).href : new URL(map[u.pathname] || abs, self.location.origin).href;
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = cs.find((x) => new URL(x.url).pathname.startsWith('/finans'));
    if (c) { try { await c.focus(); } catch {} c.postMessage({ type: 'p31-open', url: dest }); return; }
    await self.clients.openWindow(dest);
  })());
});

/** Prompt 50: /#/familie/sjekk?id=5 → sjekk/5 · ?req=5 → sjekk/svar/5 · steder?sted=3 → steder/3 · ?ny=skole → steder/ny/skole (PWA-en har ikke ?-parametre i ruten). */
function famPath50(hash) {
  const h = String(hash).replace(/^#\/familie\/?/, ''), i = h.indexOf('?'), p = i < 0 ? h : h.slice(0, i), Q = new URLSearchParams(i < 0 ? '' : h.slice(i + 1));
  if (Q.get('id')) return `${p || 'sjekk'}/${encodeURIComponent(Q.get('id'))}`;
  if (Q.get('req')) return `sjekk/svar/${encodeURIComponent(Q.get('req'))}`;
  if (Q.get('sted')) return `steder/${encodeURIComponent(Q.get('sted'))}`;
  if (Q.get('ny')) return `steder/ny/${encodeURIComponent(Q.get('ny'))}`;
  return p;
}
