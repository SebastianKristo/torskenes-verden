// Prompt 70 (WEBCHAT70, claude-code-sporing-innstillinger.md, fasit «Innstillinger Web.dc.html» → Moduler → Sporing, spVals):
// Innstillinger → Moduler → Sporing. KILDER og TRANSPORTØRER lå før nederst på Sporing-siden.
//   KILDER (høyre: «Sist sjekket 14:47 · Sjekk nå»): e-post (Proton), Finn-handler, Arkiver leverte automatisk (brytere)
//     og «Varsler for pakker» → Innstillinger → Varsler.
//   TRANSPORTØRER (høyre: «Nøkler i Integrasjoner ›»): Posten og Bring, PostNord, DHL, UPS og 17TRACK med logo, beskrivelse og
//     status (grønn «Tilkoblet» / oransje «Mangler nøkkel»). Trykk åpner nøklene i Integrasjoner → Sporing.
// Bryterne lagres per bruker på serveren (PUT /api/tracking/sources {email|finn|autoArchive}) og speiles i localStorage
// «papir_spor_set» = {uid, mail, finn, arch}, så siden tegnes riktig med en gang. «Sjekk nå» = POST /api/tracking/refresh (/check på eldre server).
// Data: GET /api/tracking (sources, lastRun, carriers, items for tellingene). Ingen nøkler hentes eller vises her.
import { api, esc, hm } from './util.js';
import { is2c } from './hltheme.js';
import { TAB_IC } from './settings-search.js';

export const SP70_IC = 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10';
export const SP70_COL = '#A8661A';
TAB_IC.sporing = [SP70_COL, SP70_IC]; // ikon: pakke (oransje)
/** Fanen (settes inn i TABS i settings.js): [id, navn, undertekst, seksjon, ikon]. */
export const TABS70 = [['sporing', 'Sporing', 'Kilder, transportører og varsler', 'Moduler', SP70_IC]];
export const ALIAS70 = { spor: 'sporing', pakke: 'sporing', pakker: 'sporing', pakkesporing: 'sporing', tracking: 'sporing', transportor: 'sporing', 'transportør': 'sporing', 'transportører': 'sporing', transportorer: 'sporing' };
const KW = 'sporing pakke pakker pakkesporing transportør transportører postnord bring posten dhl ups 17track proton e-post finn arkiv arkivering';

const CARS = [
  ['posten', 'Posten og Bring', 'API-nøkkel fra Mybring (bruker-ID og nøkkel)', 'bring.no', 'posten bring mybring'],
  ['postnord', 'PostNord', 'Uten konto og nøkkel · offentlig sporing (nøkkel valgfri)', 'postnord.no', 'postnord'],
  ['dhl', 'DHL', 'DHL Shipment Tracking API (Unified)', 'dhl.com', 'dhl'],
  ['ups', 'UPS', 'OAuth-klient fra UPS Developer', 'ups.com', 'ups'],
  ['other', '17TRACK', 'Reserve for FedEx, GLS, DB Schenker, Helthjem, Budbee, Instabox og andre', '17track.net', '17track fedex gls schenker helthjem budbee instabox'],
];
const SRC = [['email', 'mail', 'Kilde: e-post (Proton)'], ['finn', 'finn', 'Kilde: Finn-handler'], ['autoArchive', 'arch', 'Arkiver leverte automatisk']];

const SP = { d: null, err: '', loading: false, at: 0, busy: false, msg: '' };
let rr = () => {};

const uid = () => { try { return localStorage.getItem('hl_uid') || ''; } catch { return ''; } };
/** Speilet av bryterne (per bruker). */
export function localSet70() {
  try { const o = JSON.parse(localStorage.getItem('papir_spor_set') || 'null'); if (o && (!o.uid || String(o.uid) === uid())) return o; } catch { /* privat modus */ }
  return null;
}
function saveLocal(sources) {
  if (!sources) return;
  const o = { uid: uid(), mail: sources.email?.on !== false, finn: sources.finn?.on !== false, arch: sources.autoArchive?.on === true };
  try { localStorage.setItem('papir_spor_set', JSON.stringify(o)); } catch { /* privat modus */ }
}
/** Er kilden på? Serverens svar først, ellers speilet, ellers standard (e-post og Finn på, arkivering av). */
function on(k, short) {
  const s = SP.d?.sources?.[k];
  if (s) return k === 'autoArchive' ? s.on === true : s.on !== false;
  const l = localSet70();
  if (l && short in l) return !!l[short];
  return k !== 'autoArchive';
}

function load(force = false) {
  if (SP.loading || (!force && SP.d && Date.now() - SP.at < 30_000)) return;
  SP.loading = true;
  api('/tracking').then((d) => { SP.d = d; SP.err = ''; saveLocal(d?.sources); })
    .catch((e) => { SP.err = e.status === 404 ? 'missing' : e.message; })
    .finally(() => { SP.loading = false; SP.at = Date.now(); rr(); });
}

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'sp70-css';
  s.textContent = `.sp70 .sg-t{display:flex;align-items:baseline;gap:10px}
.sp70-r{margin-left:auto;font:500 13px var(--sans,inherit);letter-spacing:0;text-transform:none;color:var(--muted,#8f897c)}
.sp70-r button{border:0;background:none;padding:0;font:inherit;font-weight:700;color:var(--acc,#b23a2a);cursor:pointer}
.sp70-r button:disabled{opacity:.6;cursor:default}
.sp70 .sg-v{font-family:inherit;font-weight:600;letter-spacing:0}`;
  document.head.appendChild(s);
}

const green = () => (is2c() ? '#2f6b45' : '#34c759');
const orange = () => (is2c() ? '#a8661a' : '#f3b54a');

/**
 * Siden. H = byggeklossene fra settings.js ({ group, row }). rerender tegner Innstillinger på nytt når data kommer.
 * Svaret har html (med høyre-lenkene i overskriftene) og search (gruppene, så søket i Innstillinger finner radene).
 */
export function sporView70(H, rerender) {
  const { group, row } = H;
  if (rerender) rr = rerender;
  css();
  load();
  if (SP.err === 'missing') return { groups: [group('Sporing', [row({ t: 'Sporing er ikke klart på serveren ennå', s: 'Oppdater Homelab-serveren for å bruke pakkesporing.', k: KW })])] };
  const d = SP.d, items = d?.items ?? [];
  const nM = items.filter((t) => t.source === 'email').length, nF = items.filter((t) => t.source === 'finn').length;
  const subs = { email: d ? `${nM} funnet i innboksen` : 'Henter …', finn: d ? `${nF} fra handler` : 'Henter …', autoArchive: 'Leverte pakker flyttes til arkivet' };
  const kilder = [
    ...SRC.map(([k, short, t]) => row({ t, s: subs[k], tog: on(k, short), act: `data-sp70-src="${k}"`, k: `${KW} kilde ${k === 'email' ? 'e-post epost mail proton innboks' : k === 'finn' ? 'finn handler' : 'arkiv arkiver levert automatisk'}` })),
    row({ t: 'Varsler for pakker', s: 'Ny pakke, klar for henting, ute for levering, forsinket og levert', go: 'varsel', btn: 'Innstillinger ›', k: `${KW} varsel varsler pakkevarsel` }),
  ];
  const carOf = (id) => d?.carriers?.find((c) => c.id === id) ?? null;
  const transp = CARS.map(([id, t, s, dom, kw]) => {
    const c = carOf(id), ok = c ? !!c.configured || id === 'postnord' : id === 'postnord';
    return row({ t, s, logo: dom, ini: t, v: d || id === 'postnord' ? (ok ? 'Tilkoblet' : 'Mangler nøkkel') : '', vc: ok ? green() : orange(), go: 'int|cfg:Sporing', btn: false, k: `${KW} transportør nøkkel ${kw}` });
  });
  const gK = group('Kilder', kilder), gT = group('Transportører', transp);
  const last = SP.busy ? 'Sjekker …' : d?.lastRun ? `Sist sjekket ${hm(new Date(d.lastRun))}` : d ? 'Ikke sjekket ennå' : '';
  const head = (t, right) => `<h3 class="sg-t"><span>${esc(t)}</span><span class="sp70-r">${right}</span></h3>`;
  const sec = (g, right) => `<section class="sg sp70">${head(g.t, right)}<div class="sg-box">${g.rows.map((r) => r.html).join('')}</div></section>`;
  const html = sec(gK, `${esc(last)}${last ? ' · ' : ''}<button type="button" data-sp70-check${SP.busy ? ' disabled' : ''}>Sjekk nå</button>`)
    + sec(gT, '<button type="button" data-go="int|cfg:Sporing">Nøkler i Integrasjoner ›</button>')
    + (SP.err ? `<div class="sg-note">Fikk ikke hentet sporingen: ${esc(SP.err)}</div>` : SP.msg ? `<div class="sg-note" role="status">${esc(SP.msg)}</div>` : '');
  return { html, search: [gK, gT] };
}

async function check() {
  if (SP.busy) return;
  SP.busy = true; SP.msg = ''; rr();
  try {
    let r;
    try { r = await api('/tracking/refresh', { method: 'POST' }); } catch (e) { if (e.status !== 404) throw e; r = await api('/tracking/check', { method: 'POST' }); }
    SP.msg = r?.message ?? 'Status er oppdatert';
  } catch (e) { SP.msg = e.message; }
  SP.busy = false;
  load(true);
}

/** Klikk i Innstillinger. true = håndtert. */
export async function click70(e, render) {
  if (render) rr = render;
  if (e.target.closest('[data-sp70-check]')) { check(); return true; }
  const b = e.target.closest('[data-sp70-src]');
  if (!b) return false;
  const k = b.dataset.sp70Src, short = SRC.find((x) => x[0] === k)?.[1] ?? k, next = !on(k, short);
  // Optimistisk: bryteren flyttes med en gang (og speilet lagres), serveren bekrefter.
  const prev = SP.d?.sources;
  if (SP.d) SP.d = { ...SP.d, sources: { ...(prev ?? {}), [k]: { ...(prev?.[k] ?? {}), on: next } } };
  const l = localSet70() ?? { mail: on('email', 'mail'), finn: on('finn', 'finn'), arch: on('autoArchive', 'arch') };
  try { localStorage.setItem('papir_spor_set', JSON.stringify({ ...l, uid: uid(), [short]: next })); } catch { /* privat modus */ }
  SP.msg = ''; rr();
  try {
    const r = await api('/tracking/sources', { method: 'PUT', json: { [k]: next } });
    if (r?.sources && SP.d) { SP.d = { ...SP.d, sources: r.sources }; saveLocal(r.sources); }
  } catch (err) {
    if (SP.d) SP.d = { ...SP.d, sources: prev };
    if (prev) saveLocal(prev);
    SP.msg = err.message;
  }
  rr();
  return true;
}
