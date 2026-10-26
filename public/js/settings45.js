// Prompt 45 (WEB45): Innstillinger samlet (claude-code-innstillinger-samlet.md). Innstillinger som lå inne i modulene ligger nå her:
// - Media (varsler, Vis i Kalender, Spill av med, tjenester, tilgang) – før tannhjulet i Media.      GET /api/media/status, PUT /api/media/settings, GET/PUT /api/media/access
// - Ruter (Antall anbefalte reiser 1 · 2 · 3) – også i kortets ⋯-meny.                              GET/PUT /api/ruter/settings {recoCount}
// - Familie → Sonevarsler (hovedbryter, per person, per sone) – speiles i Varsler.                    GET/PUT /api/family/zone-alerts
// Alle kall tåler 404 (eldre server): da står det hva som mangler.
import { esc } from './util.js';
import { store } from './store.js';
import { TAB_IC } from './settings-search.js';
import { toast } from './toast.js';
import { diagGroup50, diagClick50 } from './settings-media50.js'; // prompt 50: Media → Diagnostikk (admin)

const admin = () => store.me?.me?.role === 'admin';
async function j(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Serveren svarte ${r.status}`), { status: r.status, data: d });
  return d;
}
let rr = () => {};

const P45 = {
  media: 'M4 6h16v12H4zM10 9.5v5l4-2.5z',
  vaer: 'M7 18a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.5 11 3.5 3.5 0 0 1 18 18z',
  studie: 'M3 8l9-4 9 4-9 4zM7 10v5c3 2 7 2 10 0v-5',
  finans: 'M3 7h18v12H3zM3 11h18M7 15h3',
  ruter: 'M7 4h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM4 11h16M8 21l1.5-3M16 21l-1.5-3M8 14.5h.01M16 14.5h.01',
};
Object.assign(TAB_IC, { media: ['#2a8fbf', P45.media], ruter: ['#c0392b', P45.ruter], vaer: ['#3b7bbf', P45.vaer], studie: ['#2B5D8A', P45.studie], finans: ['#2f7a4f', P45.finans] });
/** Fanene (settes inn i TABS i settings.js): [id, navn, undertekst, seksjon, ikon]. */
export const TABS45 = [
  ['media', 'Media', 'Varsler, kalender, avspilling og tjenestene (Sonarr, Radarr, qBittorrent, Prowlarr, Plex, Jellyfin).', 'Moduler', P45.media],
  ['ruter', 'Ruter', 'Anbefalte reiser og avganger.', 'Moduler', P45.ruter],
  ['vaer', 'Vær', 'Steder, Min posisjon og værkortet på Hjem.', 'Moduler', P45.vaer],
  ['studie', 'Studie', 'Timeplan, Canvas og dokumenter (vitnemål, karakterutskrifter).', 'Moduler', P45.studie],
  ['finans', 'Finans', 'FinansHub: kategorier og regler, bank og import, aksjer.', 'Moduler', P45.finans],
];
export const ALIAS45 = { weather: 'vaer', 'vær': 'vaer', study: 'studie', okonomi: 'finans', finance: 'finans',  sonarr: 'media', radarr: 'media', plex: 'media', jellyfin: 'media', qbittorrent: 'media', prowlarr: 'media', reise: 'ruter', avganger: 'ruter', kollektiv: 'ruter' };

/* ---------------- Media ---------------- */
const MD = { st: null, err: '', loading: false, access: null, accErr: '', at: 0 };
function loadMedia(force) {
  if (MD.loading || (!force && MD.st && Date.now() - MD.at < 30_000)) return;
  MD.loading = true;
  j('/api/media/status').then((s) => { MD.st = s; MD.err = ''; if (s?.admin && !MD.access) j('/api/media/access').then((a) => { MD.access = a; rr(); }).catch((e) => { MD.accErr = e.message; rr(); }); })
    .catch((e) => { MD.st = null; MD.err = e.status === 404 ? 'missing' : e.message; })
    .finally(() => { MD.loading = false; MD.at = Date.now(); rr(); });
}
export function mediaView45(H) {
  const { group, row, note } = H;
  loadMedia();
  if (MD.err === 'missing') return { groups: [group('Media', [row({ t: 'Media er ikke klart på serveren ennå', s: 'Oppdater Homelab-serveren, og sett opp tjenestene under Integrasjoner → Media.', go: 'int', btn: 'Integrasjoner' })])] };
  if (MD.err) return { groups: [group('Media', [row({ t: 'Fikk ikke hentet innstillingene', s: MD.err, act: 'data-s45="mretry"', btn: 'Prøv igjen' })])] };
  const S = MD.st, p = S?.settings ?? {};
  const svc = !S ? [row({ t: 'Henter …' })] : (S.services ?? []).map((s) => row({ t: s.name, s: s.url ?? (s.configured ? '' : 'Ikke satt opp'), v: s.ok ? s.text ?? 'OK' : s.configured ? s.error ?? 'Feil' : s.mock ? 'demodata' : 'Mangler', vc: s.ok ? '#2f7a4f' : s.configured ? '#b23a2a' : '', k: 'tjeneste sonarr radarr qbittorrent prowlarr plex jellyfin' }));
  const players = `<div class="s45-seg" role="radiogroup" aria-label="Spill av med">${[['jellyfin', 'Jellyfin'], ['plex', 'Plex']].map(([k, n]) => `<button type="button" role="radio" aria-checked="${(p.player ?? 'jellyfin') === k}" data-s45-player="${k}">${n}</button>`).join('')}</div>`;
  const groups = [
    group('Varsler og kalender', [
      row({ t: 'Varsel når en nedlasting er ferdig', s: 'Push og Glimt-brief: «Ferdig: Shrinking S03E08 · klar i Jellyfin»', tog: p.notifyDone !== false, act: 'data-s45-mpref="notifyDone"', k: 'media varsel ferdig nedlasting' }),
      row({ t: 'Varsel når noe feiler eller står fast', s: '0 seedere i 30 min, indekser nede, full disk', tog: p.notifyFail !== false, act: 'data-s45-mpref="notifyFail"', k: 'media varsel feil står fast' }),
      row({ t: 'Vis i Kalender', s: 'Egen kalender «Media» i Kalender-appen', tog: p.calendar !== false, act: 'data-s45-mpref="calendar"', k: 'media kalender kommer snart' }),
    ]),
    group('Spill av med', [{ html: `<div class="sg-row"><span class="sg-txt"><b>Avspilling</b><span>Hvor «Spill av» åpner serier og filmer</span></span>${players}</div>`, q: 'spill av med jellyfin plex avspilling' }]),
    group('Tjenester', svc, `API-nøklene lagres på serveren. Appen snakker bare med Homelab. Adresser og nøkler: <button type="button" class="s45-link" data-go="int">Integrasjoner → Media</button>.`),
  ];
  if (S?.admin) groups.push(diagGroup50(H)); // prompt 50 (SRVMEDIA50): ledd 2–6 grønt/rødt
  if (S?.admin) {
    const A = MD.access;
    groups.push(group('Tilgang til Media', !A ? [row({ t: MD.accErr || 'Henter …' })] : (A.users ?? []).map((u) => (u.admin ? row({ t: u.name, s: 'Administrator · har alltid tilgang', k: 'tilgang media' }) : row({ t: u.name, s: u.allowed ? 'Har tilgang' : 'Ingen tilgang', tog: !!u.allowed, act: `data-s45-macc="${esc(u.id)}"`, k: 'tilgang media bruker' })))));
  }
  return { groups, extra: note('Rydd uovervåkede episoder og filmer gjør du i Media → Sonarr/Radarr (bare admin).') };
}

/* ---------------- Vær, Studie, Finans (samlet her, innstillingene bor der de alltid har bodd) ---------------- */
let geo45 = null;
export function vaerView45(H) {
  const { group, row } = H;
  if (geo45 == null) { geo45 = 'prompt'; navigator.permissions?.query({ name: 'geolocation' }).then((p) => { geo45 = p.state; rr(); }).catch(() => {}); }
  return { groups: [
    group('Vær', [
      row({ t: 'Steder', s: 'Legg til, fjern og sorter stedene dine på Vær-siden (søk øverst til venstre)', act: 'data-s45-href="#/vaer"', btn: 'Åpne Vær', k: 'vær steder by sted' }),
      row({ t: 'Min posisjon', s: geo45 === 'granted' ? 'Tillatt i denne nettleseren · vises øverst i stedslista' : geo45 === 'denied' ? 'Avslått i nettleseren. Tillat posisjon for nettstedet (låsikonet ved adressen).' : 'Nettleseren spør første gang du åpner Vær. Posisjonen lagres ikke.', v: geo45 === 'granted' ? 'På' : geo45 === 'denied' ? 'Avslått' : '', vc: geo45 === 'granted' ? '#2f7a4f' : '', act: geo45 === 'denied' ? undefined : 'data-s45-geo', btn: geo45 === 'granted' ? false : 'Tillat', k: 'min posisjon geolokasjon vær der jeg er' }),
      row({ t: 'Værkortet og bakgrunnen på Hjem', s: 'Bakgrunn «Vær nå», tema og widgets', go: 'look', btn: 'Utseende', k: 'vær bakgrunn hjem widget' }),
      row({ t: 'Yr / MET-integrasjonen', s: 'Adresse og standardsted for værdata', go: 'int', btn: 'Integrasjoner', k: 'yr met vær integrasjon' }),
    ]),
  ] };
}
export function studieView45(H) {
  const { group, row } = H;
  return { groups: [
    group('Studie', [
      row({ t: 'Timeplan og Canvas', s: 'Skolens iCal-lenke, Canvas og prøver i kalenderen', go: 'kal', btn: 'Kalendere', k: 'studie timeplan canvas ical skole' }),
      row({ t: 'Dokumenter', s: 'Vitnemål og karakterutskrifter: Glimt leser fag og karakterer, og du kan se originalen', act: 'data-s45-href="#/studie"', btn: 'Åpne Studie', k: 'vitnemål karakterutskrift dokument original' }),
    ]),
  ] };
}
export function finansView45(H) {
  const { group, row } = H;
  return { groups: [
    group('Finans', [
      row({ t: 'Innstillinger i FinansHub', s: 'Kategorier og regler, budsjett, bank, import og eksport', act: 'data-s45-href="/finans/?desktop=1#/inn"', btn: 'Åpne', k: 'finans finanshub regler kategorier budsjett bank import' }),
      row({ t: 'Bank og aksjer', s: 'Nøkler for bank-import og Trading 212', go: 'int', btn: 'Integrasjoner', k: 'bank trading 212 aksjer nøkkel' }),
      row({ t: 'Glimt i Finans', s: 'Kvitteringslesing og modell – under AI → Kvitteringer', act: 'data-p65-ai="rcpt"', btn: 'AI', k: 'glimt kvittering ai finans modell ocr' }), // prompt 65: lenke til AI → Kvitteringer
    ]),
  ] };
}

/* ---------------- Ruter ---------------- */
const RT = { s: null, err: '', loading: false };
function loadRuter() {
  if (RT.loading || RT.s || RT.err) return;
  RT.loading = true;
  j('/api/ruter/settings').then((s) => { RT.s = s ?? {}; }).catch((e) => { RT.err = e.status === 404 ? 'missing' : e.message; RT.s = {}; }).finally(() => { RT.loading = false; rr(); });
}
export const recoCount = () => { const v = +(RT.s?.recoCount ?? store.me?.ui?.recoCount ?? 2); return [1, 2, 3].includes(v) ? v : 2; };
export async function setRecoCount(n) {
  n = +n; if (![1, 2, 3].includes(n)) return;
  RT.s = { ...(RT.s ?? {}), recoCount: n }; rr();
  try { navigator.vibrate?.(8); } catch { /* */ }
  try { const r = await j('/api/ruter/settings', { method: 'PUT', body: JSON.stringify({ recoCount: n }) }); if (r) RT.s = { ...RT.s, ...r }; }
  catch (e) { if (e.status !== 404) toast(e.message); }
  try { document.dispatchEvent(new CustomEvent('hl:ruter-reco', { detail: n })); } catch { /* */ }
}
export function ruterView45(H) {
  const { group } = H;
  loadRuter();
  const cur = recoCount();
  const seg = `<div class="s45-seg" role="radiogroup" aria-label="Antall anbefalte reiser">${[1, 2, 3].map((n) => `<button type="button" role="radio" aria-checked="${cur === n}" data-s45-reco="${n}">${n}</button>`).join('')}</div>`;
  return { groups: [group('Min reise', [{ html: `<div class="sg-row"><span class="sg-txt"><b>Antall anbefalte reiser</b><span>Kortet «Anbefalt for min reise» viser nøyaktig så mange (på Hjem og i appen)</span></span>${seg}</div>`, q: 'ruter anbefalt antall reiser min reise kollektiv' }],
    RT.err === 'missing' ? 'Serveren lagrer ikke valget ennå – det gjelder bare denne nettleseren til Homelab er oppdatert.' : 'Lagres på brukeren og synkes mellom enhetene dine.')] };
}

/* ---------------- Sonevarsler (Familie + Varsler) ---------------- */
const ZA = { d: null, err: '', loading: false };
function loadZa(force) {
  if (ZA.loading || (!force && (ZA.d || ZA.err))) return;
  ZA.loading = true;
  j('/api/family/zone-alerts').then((d) => { ZA.d = d; ZA.err = ''; }).catch((e) => { ZA.err = e.status === 404 ? 'missing' : e.message; }).finally(() => { ZA.loading = false; rr(); });
}
const zIcon = (z, s = 30) => (z.iconUrl ? `<img src="${esc(z.iconUrl)}" alt="" width="${s}" height="${s}" style="border-radius:${Math.round(s * 0.28)}px">` : `<span class="s45-zi" style="background:${esc(z.color ?? '#2f7a4f')};width:${s}px;height:${s}px">${esc(String(z.name ?? '?').slice(0, 1))}</span>`);
/** Gruppen «Sonevarsler». where = 'familie' | 'varsel'. */
export function zoneGroups45(H, where = 'familie') {
  const { group, row } = H;
  loadZa();
  if (ZA.err === 'missing') return [group('Sonevarsler', [row({ t: 'Serveren har ikke sonevarsler ennå', s: 'Oppdater Homelab for å slå varsler av og på per person og sone.' })])];
  if (ZA.err) return [group('Sonevarsler', [row({ t: 'Fikk ikke hentet sonevarslene', s: ZA.err, act: 'data-s45="zretry"', btn: 'Prøv igjen' })])];
  const d = ZA.d;
  if (!d) return [group('Sonevarsler', [row({ t: 'Henter …' })])];
  const on = d.on !== false;
  const people = (d.people ?? []).map((p) => row({ t: p.name, s: !on ? 'Av (hovedbryteren er av)' : p.on !== false ? 'Varsler når hen kommer eller går' : 'Ingen varsler om denne personen', tog: on && p.on !== false, disabled: !on, act: `data-s45-zp="${esc(p.id)}"`, img: p.avatar || undefined, ini: p.avatar ? undefined : p.initials ?? String(p.name ?? '?').slice(0, 1), ic: p.color, k: 'sonevarsel posisjon person av på' }));
  const zones = (d.zones ?? []).map((z) => ({ html: `<button type="button" class="sg-row" data-s45-zz="${esc(z.id)}" role="switch" aria-checked="${on && z.on !== false}"${on ? '' : ' disabled'}><span class="sg-av s45-zav">${zIcon(z, 30)}</span><span class="sg-txt"><b>${esc(z.name)}</b><span>${on ? z.on !== false ? 'Varsler i denne sonen' : 'Av for denne sonen' : 'Av'}</span></span><span class="sg-sw"></span></button>`, q: `sone ${z.name} varsel` }));
  const sample = d.sample ?? (d.zones?.[0] ? { title: d.zones[0].name, body: `${d.people?.[0]?.name ?? 'Ingrid'} forlot ${d.zones[0].name}`, iconUrl: d.zones[0].iconUrl, color: d.zones[0].color } : null);
  const ex = sample ? `<div class="s45-zex" aria-label="Eksempel på varsel"><span class="s45-zexi">${zIcon({ ...sample, name: sample.title }, 38)}<i class="s45-zbadge" aria-hidden="true"></i></span><span class="s45-zext"><b>${esc(sample.title)}</b><span>${esc(sample.body)}</span></span><span class="s45-zexn">nå</span></div>` : '';
  const out = [group('Sonevarsler', [
    row({ t: 'Varsle når noen kommer eller går', s: on ? 'Varselet viser sonens ikon i sonens farge' : 'Ingen sonevarsler sendes til deg', tog: on, act: 'data-s45-zon', k: 'sonevarsel posisjonsvarsel varsle kommer går familie' }),
    ...(where === 'familie' ? people : []),
  ], 'Valget gjelder bare varslene du får. Ingen nye posisjonsdata deles, og sonene, kartet og «Siste hendelser» virker som før.')];
  if (where === 'familie' && zones.length) out.push(group('Per sone', zones));
  if (where === 'varsel' && people.length) out.push(group('Sonevarsler per person', people));
  if (ex) out.push(group('Eksempel', [{ html: ex, q: 'eksempel sonevarsel' }]));
  return out;
}
async function putZa(body, rollback) {
  rr();
  try { ZA.d = await j('/api/family/zone-alerts', { method: 'PUT', body: JSON.stringify(body) }); }
  catch (e) { rollback(); toast(e.status === 404 ? 'Serveren har ikke sonevarsler ennå' : e.message); }
  rr();
}

/* ---------------- Gjøremål → Forslag fra Glimt (claude-code-gjoremal-glimt-forslag.md) ---------------- */
const TIPK = [['pack', 'Pakkelister', 'Bare for reiser og hytteturer på minst to dager, aldri bursdager eller timer'], ['merge', 'Like gjøremål', '«2× Melk i Handel» – slå sammen'], ['late', 'Forfalte', 'Flytt til i morgen eller arkiver når flere er forfalt'], ['store', 'Stedspåminnelse', 'Påminn meg ved butikken']];
const TO = { d: null };
function tipOffNow() { if (TO.d) return TO.d; try { TO.d = JSON.parse(localStorage.getItem('huske_tip_off') || '{}') || {}; } catch { TO.d = {}; } j('/api/me/layout').then((l) => { if (l?.huske_tip_off) { TO.d = { ...TO.d, ...l.huske_tip_off }; rr(); } }).catch(() => {}); return TO.d; }
export function huskeTips45(H) {
  const o = tipOffNow();
  return `<section class="sg"><h3 class="sg-t">Forslag fra Glimt</h3><div class="sg-box">${TIPK.map(([k, t, s]) => H.row({ t, s, tog: !o[k], act: `data-s45-tip="${k}"` }).html).join('')}</div><div class="sg-note">Glimt foreslår maks ett kalender-forslag om gangen, og aldri det samme to ganger.</div></section>`;
}

/* ---------------- Klikk ---------------- */
export async function click45(e, render) {
  rr = render;
  if (await diagClick50(e, render)) return true; // prompt 50
  const b = e.target.closest('[data-s45-href],[data-s45-geo],[data-s45-tip],[data-s45],[data-s45-mpref],[data-s45-player],[data-s45-macc],[data-s45-reco],[data-s45-zon],[data-s45-zp],[data-s45-zz]');
  if (!b || b.disabled) return false;
  const d = b.dataset;
  if (d.s45Href) { const h = d.s45Href; if (h.startsWith('#')) { document.querySelector('#settings [data-set-done]')?.click(); setTimeout(() => { location.hash = h; }, 30); } else location.href = h; return true; }
  if ('s45Geo' in d) { navigator.geolocation?.getCurrentPosition(() => { geo45 = 'granted'; render(); }, (er) => { geo45 = er.code === 1 ? 'denied' : geo45; render(); }); return true; }
  if (d.s45 === 'mretry') { MD.err = ''; loadMedia(true); return true; }
  if (d.s45 === 'zretry') { ZA.err = ''; loadZa(true); return true; }
  if (d.s45Mpref || d.s45Player) {
    const p = MD.st?.settings ?? {}, k = d.s45Mpref ?? 'player', v = d.s45Mpref ? !(p[k] !== false) : d.s45Player;
    if (MD.st) MD.st.settings = { ...p, [k]: v };
    render();
    try { const r = await j('/api/media/settings', { method: 'PUT', body: JSON.stringify({ [k]: v }) }); if (MD.st && r) MD.st.settings = r; } catch (er) { if (MD.st) MD.st.settings = p; toast(er.message); }
    render(); return true;
  }
  if (d.s45Macc) {
    const u = MD.access?.users?.find((x) => String(x.id) === d.s45Macc); if (!u) return true;
    u.allowed = !u.allowed; render();
    try { await j('/api/media/access', { method: 'PUT', body: JSON.stringify({ userId: u.id, allowed: u.allowed }) }); } catch (er) { u.allowed = !u.allowed; toast(er.message); render(); }
    return true;
  }
  if (d.s45Tip) {
    const o = { ...tipOffNow(), [d.s45Tip]: !tipOffNow()[d.s45Tip] }; TO.d = o; render();
    try { localStorage.setItem('huske_tip_off', JSON.stringify(o)); } catch { /* */ }
    try { document.dispatchEvent(new CustomEvent('hl:tip-off45', { detail: o })); } catch { /* */ }
    j('/api/me/layout', { method: 'PUT', body: JSON.stringify({ huske_tip_off: o }) }).catch(() => {});
    return true;
  }
  if (d.s45Reco) { await setRecoCount(+d.s45Reco); render(); return true; }
  if ('s45Zon' in d && ZA.d) { const prev = ZA.d.on; ZA.d.on = prev === false; await putZa({ on: ZA.d.on }, () => { ZA.d.on = prev; }); return true; }
  if (d.s45Zp && ZA.d) { const p = ZA.d.people?.find((x) => String(x.id) === d.s45Zp); if (!p) return true; const prev = p.on; p.on = prev === false; await putZa({ people: { [p.id]: p.on } }, () => { p.on = prev; }); return true; }
  if (d.s45Zz && ZA.d) { const z = ZA.d.zones?.find((x) => String(x.id) === d.s45Zz); if (!z) return true; const prev = z.on; z.on = prev === false; await putZa({ zones: { [z.id]: z.on } }, () => { z.on = prev; }); return true; }
  return false;
}
export const setRender45 = (f) => { rr = f; };
/** Data hentet utenfor Innstillinger (Familie-siden) holdes i synk. */
export function zoneAlertsState() { loadZa(); return ZA; }
export { putZa as putZoneAlerts45 };
