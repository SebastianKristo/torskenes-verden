// Prompt 24 (mobilweb / PWA): profiler (Innstillinger → PROFIL), søk og ✦ AI-søk i Innstillinger, alle integrasjoner via
// /api/integrations, Ruter-visningen som fullskjerm uten fanelinje og FAB, Boliger (toppbilde per bolig, domene-pille og
// «Rediger bolig» med hold inne) og ikoner i Nyhetsleser som <img>. Bursdager er skilt ut i mobile-bursdager.js (importeres
// først, der Bursdager-modulen P36 sto). Endepunktene kommer fra serveren i samme prompt; mangler de (404), faller vi tilbake.
import { bdInput, bdChange, bdSubmit, bdClick } from './mobile-bursdager.js';
import * as P30 from './mobile-system-og-ark.js';
import { api, esc, n0, ini, hlApi } from './core.js';
import { m, draw, flash, domOk } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { AV, avgLoad, BO, bolLoad, heroBg, setTabBar } from './mobile-fanelinje.js';
import { DEP, depKey, depStatus, stopList, modeName, delayOf } from './mobile-konto-og-deling.js';
import { setFinTabs } from './mobile-tilpassing.js';
import { hlDom } from './mobile-hl.js';
import { paperDark } from './mobile-paper.js';
import { famSource } from './mobile-familie-soner.js';
import * as P25 from './mobile-fanelinje-stil.js';
import * as P26 from './mobile-integrasjoner.js';

const LS = 'fh_p24';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };
const hm = (t) => (t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '');
const kr = (v) => `${(v ?? 0) < 0 ? '−' : ''}${n0(Math.abs(v ?? 0))} kr`;

/* =====================================================================
   1. Profiler: Standard · Finans + Boliger · Boliger-profil (· Egendefinert)
   ===================================================================== */

// Samme oppsett som GET /api/me/profiles; brukes når serveren ikke har endepunktet ennå.
const PROF_DEF = {
  standard: { startRoute: 'hjem', homeNav: ['hjem', 'finans', 'mat', 'mer'], finNav: ['oversikt', 'liste', 'finn', 'sok'] },
  finans_boliger: { startRoute: 'finans/boliger', homeNav: ['finans'], finNav: ['boliger', 'sok', 'liste', 'oversikt', 'kvitteringer'] },
  boliger: { startRoute: 'finans/boliger', homeNav: ['finans', 'domener'], finNav: ['boliger', 'kvitteringer', 'oversikt', 'sok'] },
};
const PROF_N = [['standard', 'Standard', 'Oversikt, Økonomi, Mat og Mer · vanlige Økonomi-faner'], ['finans_boliger', 'Finans + Boliger', 'Åpner i Boliger · Boliger, Søk, Liste, Oversikt, Kvitteringer · Homelab under Mer'], ['boliger', 'Boliger-profil', 'Bare Finans og Domener, med Boliger først']];
let PROFS = PROF_DEF, profT = 0, applying = false;
/** Prompt 39: navnet på valgt profil (undertekst på raden Appprofil). */
export const profName = () => (profile() === 'custom' ? 'Egendefinert' : PROF_N.find(([k]) => k === profile())?.[1] ?? 'Standard');
export const profile = () => (['standard', 'finans_boliger', 'boliger', 'custom'].includes(L.profile) ? L.profile : 'standard');
// Rute fra profilen → skjerm i appen. «hjem» er Hjem-forsiden (hl), «finans» er Finans-oversikten.
const SCR = { hjem: 'hl', finans: 'hjem', 'finans/boliger': 'dir', boliger: 'dir', 'finans/oversikt': 'hjem', 'finans/liste': 'liste', mat: 'mat' };
/** Startskjerm fra profilen, eller null (vanlig startside). */
export const profStart = () => (profile() === 'standard' || !L.startRoute ? null : SCR[L.startRoute] ?? null);
/** Boliger er roten (ingen tilbake-knapp på Finans-fanene, «‹ Boliger» på Domener). */
export const profRoot = () => profStart() === 'dir';
export const profHomeNav = () => (profile() === 'standard' ? null : L.homeNav ?? null);

/** Leser profil og appnavn fra /api/me/layout. */
export function take24(r) {
  if (!r) return;
  const p = ['standard', 'finans_boliger', 'boliger', 'custom'].includes(r.profile) ? r.profile : null;
  if (p) {
    const changed = p !== L.profile;
    L.profile = p;
    if (typeof r.startRoute === 'string') L.startRoute = r.startRoute;
    if (Array.isArray(r.homeNav)) L.homeNav = r.homeNav;
    if (Array.isArray(r.finNav)) L.finNav = r.finNav;
    keep();
    // En annen enhet valgte profilen: bruk fanene derfra her også (uten å lagre på nytt).
    if (changed) applyLocal(p, L.homeNav ?? PROFS[p]?.homeNav, L.finNav ?? PROFS[p]?.finNav);
  }
}
function applyLocal(k, homeNav, finNav) {
  applying = true;
  try {
    if (Array.isArray(finNav) && finNav.length) setFinTabs(finNav.filter((x) => x !== 'mer'), false);
    // Standard: de vanlige fanene (Hjem, Finans, Mat, Domener/Sporing, Søk og Mer). Ellers fanene fra profilen + Mer.
    if (k === 'standard') setTabBar(null, false);
    else if (Array.isArray(homeNav)) setTabBar([...homeNav.filter((id) => id !== 'mer').map((id) => ({ id })), { id: 'mer' }], false);
  } finally { applying = false; }
}
async function profLoad() {
  if (Date.now() - profT < 10 * 60000) return;
  profT = Date.now();
  try { const r = await hlApi('/me/profiles'); if (r && typeof r === 'object' && r.finans_boliger) { const { current, labels, ...rest } = r; PROFS = { ...PROF_DEF, ...rest }; if (current && current !== L.profile && PROF_N.some(([x]) => x === current)) { L.profile = current; keep(); } } } catch { /* eldre server: ferdige oppsett her */ }
}
export async function pickProfile(k) {
  const p = PROFS[k] ?? PROF_DEF[k];
  if (!p) return;
  L.profile = k; L.startRoute = p.startRoute; L.homeNav = p.homeNav; L.finNav = p.finNav; keep();
  applyLocal(k, p.homeNav, p.finNav);
  // Serveren bruker forhåndsoppsettet når bare profile sendes (startRoute, homeNav og finNav).
  hlApi('/me/layout', { method: 'PUT', json: { profile: k } }).catch(() => {});
  haptic('ok');
  const to = SCR[p.startRoute] ?? 'hl';
  flash(k === 'standard' ? 'Vanlig oppsett er tilbake ✓' : `${PROF_N.find(([x]) => x === k)?.[1]} er valgt ✓ · appen åpner i Boliger`);
  if (location.hash !== `#/${to}`) location.hash = `#/${to}`; else draw();
}
/** Egne endringer i fanene etter et profilvalg lagres som «Egendefinert». */
export function markCustom(patch = {}) {
  if (applying || profile() === 'standard' || profile() === 'custom') return;
  L.profile = 'custom';
  if (patch.finTabs) L.finNav = patch.finTabs;
  if (patch.tabBar?.items) L.homeNav = patch.tabBar.items.map((x) => x.id).filter((x) => x !== 'mer');
  keep();
  hlApi('/me/layout', { method: 'PUT', json: { profile: 'custom', homeNav: L.homeNav, finNav: L.finNav, startRoute: L.startRoute } }).catch(() => {});
}
export function profGroup(row, grp, title = 'PROFIL') {
  if (!profT) profLoad().catch(() => {});
  const cur = profile();
  const rows = PROF_N.map(([k, n, s]) => `<button class="opt-row p17-row p24-prow" data-p24="prof" data-k="${k}" aria-pressed="${cur === k}"><span class="m-grow p17-rt"><b>${esc(n)}</b><small>${esc(s)}</small></span><span class="sval" style="opacity:1;font-weight:700;color:${cur === k ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${cur === k ? '✓ Valgt' : 'Velg'}</span></button>`);
  if (cur === 'custom') rows.push('<div class="opt-row p17-row"><span class="m-grow p17-rt"><b>Egendefinert</b><small>Egne endringer i fanene etter et profilvalg</small></span><span class="sval" style="opacity:1;font-weight:700;color:var(--pp-pos)">✓ Valgt</span></div>');
  return grp(title, rows);
}

/* =====================================================================
   2. Søk og ✦ AI-søk i Innstillinger
   ===================================================================== */

export const SS = { q: '', ai: false, ans: '', ids: null, busy: false };
// Alle innstillinger og undersider: id, tittel, hvor den ligger og hvor trykket går.
const IDX = [
  // Prompt 39: profilene ligger på undersiden App → Appprofil (#/set/appprofil).
  ['appprofil', 'Appprofil', 'App', '#/set/appprofil', 'profil profiler oppsett boliger finans standard'], ['prof-std', 'Standard', 'App · Appprofil', '#/set/appprofil', 'profil oppsett vanlig'], ['prof-fin', 'Finans + Boliger', 'App · Appprofil', '#/set/appprofil', 'profil boliger finans start oppsett'], ['prof-bol', 'Boliger-profil', 'App · Appprofil', '#/set/appprofil', 'profil boliger oppsett'],
  ['konto', 'Kontoer og brukere', 'Konto', '#/set/konto', 'bruker logg inn konto'], ['sik', 'Sikkerhet', 'Konto', '#/set/sik', 'passord 2fa totrinn tofaktor lås face id fingeravtrykk økter', '2fa'], ['tok', 'API-tokens', 'Konto', '#/set/tok', 'token nøkkel langtidstoken'], ['sysbk', 'Backup', 'Konto', '#/set/sysbk', 'backup sikkerhetskopi gjenopprett hele systemet kryptering sky', 'bk-now'], ['bk-auto', 'Automatisk backup', 'Konto · Backup', '#/set/sysbk', 'automatisk backup tidsplan natt', 'bk-auto'],
  ['profil', 'Profilbilde og navn', 'Konto', '#/set/profil', 'avatar bilde profil'],
  ['nordlys', 'Nordlys OS', 'Programvare', '#/nordlys', 'programvare system nordlys os'], // prompt 32: eneste sted å oppdatere
  // Prompt 34: mål-id (6. felt) → siden åpnes, målet scrolles midt i bildet og får rød pulserende ring.
  ['upd', 'Oppdater nå', 'System', '#/nordlys', 'oppdater oppdatere oppdaterer oppdatering update installer ny versjon nordlys', 'upd'], ['chk', 'Se etter oppdatering', 'System', '#/nordlys', 'oppdatering versjon sjekk se etter ny', 'chk'],
  ['pw', 'Krev passord for å oppdatere', 'System', '#/nordlys', 'krev passord oppdater oppdatering', 'pw'],
  ['aictl', 'AI og modeller', 'App', '#/aictl', 'ai modell modeller ollama gemini groq last ned nedlasting tokens jobber forbruk budsjett glimt selvtest', 'selftest'], ['ai-mod', 'Modeller', 'App · AI og modeller', '#/aictl/mod', 'modell modeller last ned slett vram ollama', 'ai-mod'],
  ['ai-sel', 'Hvilken modell gjør hva', 'App · AI og modeller → Valg', '#/aictl/rt', 'ruting reserve modell valg temperatur kontekst keep alive', 'ai-sel'], ['ai-key-gemini', 'Gemini-nøkkel', 'App · AI og modeller → API og nøkler', '#/aictl/api', 'gemini nøkkel api key groq openrouter roboflow', 'ai-key-gemini'],
  // Prompt 35: Innstillinger → GLIMT → Glimt (figur, brief, stemme og venner).
  ['glimt', 'Glimt', 'Glimt', '#/glimt', 'glimt figur figurer vert venner gris ugle sky dråpe natt maskot', 'gl-fig'], ['gl-brief', 'Glimt-brief', 'Glimt', '#/glimt', 'brief briefer morgenbrief dagsbrief kveldsbrief nattbrief varsel guide vis meg rundt', 'gl-brief'],
  ['gl-voice', 'Stemme og opplesning', 'Glimt', '#/glimt', 'stemme stemmer opplesning les opp tts openai elevenlabs azure nora henrik lys tempo språk engelsk', 'gl-voice'],
  ['fai', 'AI og tolkning', 'Økonomi', '#/aictl/fin', 'ai gemini groq ollama roboflow kvittering ocr finans'], ['r48', 'Kvitteringer · Mac-OCR', 'Økonomi · AI og tolkning', '#/aictl/fin/ocr', 'mac ocr vision tesseract gemini kvittering kjede nøkkel skann'], // prompt 48
  ['kat', 'Kategorier og budsjett', 'Økonomi', '#/set/kat', 'kategori budsjett'], ['regel', 'Regler', 'Økonomi', '#/set/regel', 'regel automatisk'],
  ['bank', 'Bankimport', 'Økonomi', '#/set/bank', 'bank dnb csv import'], ['t212', 'Aksjer · Trading 212', 'Økonomi', '#/set/t212', 'aksje trading212 t212 fond'], ['fanelinje', 'Fanelinje og Mer i Økonomi', 'Økonomi', '#/set/fanelinje', 'fane faner navigasjon'], ['sub', 'Faste betalinger', 'Økonomi', '#/sub', 'abonnement'],
  // Prompt 39: alt med utseende og farger ligger i Homelab → Tilpass (#/set/tilpass).
  ['tilpass', 'Tilpass', 'Homelab', '#/set/tilpass', 'tilpass utseende tema farge farger ikon navn fanelinje bakgrunn customize mørk lys papir', 'theme'],
  ['appnavn', 'Navn på appen', 'Homelab · Tilpass', '#/set/tilpass', 'navn app tittel'], ['appikon', 'App-ikon', 'Homelab · Tilpass', '#/set/tilpass', 'ikon logo app'], ['hjemnav', 'Fanelinje på Oversikt', 'Homelab · Tilpass', '#/set/fanelinje', 'fane faner hjem navigasjon'], ['navstil', 'Fanelinje-stil', 'Homelab · Tilpass', '#/set/tilpass', 'fane fanelinje stil ikoner tekst navn navigasjon'],
  ['mod', 'Moduler', 'Homelab', '#/set/mod', 'modul widget sporing domener mat'], ['rss', 'Nyheter', 'Homelab', '#/nyheter', 'rss nyheter kilder ikon'],
  ['look', 'Tema og farger', 'Homelab · Tilpass', '#/set/tilpass', 'tema mørk lys farge farger papir utseende ikonfarger aksent', 'theme'], ['bakgrunn', 'Bakgrunn på Oversikt', 'Homelab · Tilpass', '#/set/bakgrunn', 'bakgrunn bilde planeter vær oslo', 'bg'],
  ['haptic', 'Haptikk', 'App · Varsler og haptikk', '#/set/hap', 'haptikk vibrasjon vibrer', 'haptic'], ['varsler', 'Varsler og haptikk', 'App', '#/set/varsler', 'varsel push lyd bursdager', 'push'], ['quiet', 'Stille timer', 'App · Varsler', '#/set/varsler', 'stille timer natt lyd', 'quiet'], ['kal', 'Kalendere', 'App', '#/set/kal', 'kalender google home assistant ha ical canvas skole timeplan synk'], ['integ', 'Integrasjoner', 'App', '#/set/integ', 'integrasjon nøkkel api'],
  ['bd', 'Bursdager', 'Mer', '#/bd', 'bursdag'], ['kalside', 'Kalender', 'Mer', '#/kal', 'timeplan prøver frister skole uke måned agenda'],
];
const INTEG_IDX = [['ha', 'Home Assistant', 'home ha assistant'], ['google', 'Google Kalender', 'kalender bursdag google oauth'], ['ai', 'AI (Gemini)', 'gemini groq ollama ai nøkkel'], ['t212', 'Trading 212', 'aksje'], ['bank', 'Bank', 'bank import'], ['imap', 'Kvitteringer på e-post (IMAP)', 'epost mail kvittering imap'],
  ['entur', 'Entur', 'ruter buss trikk avgang'], ['mybring', 'Mybring', 'posten bring pakke sporing'], ['postnord', 'PostNord', 'pakke sporing post'], ['parcelsapp', 'ParcelsApp', 'pakke sporing reserve'], ['cloudflare', 'Cloudflare', 'domene domener'], ['finn', 'Finn', 'finn annonse'],
  ['met', 'MET / Yr', 'vær yr'], ['map', 'Kart', 'kart maptiler stadia'], ['icons', 'Ikoner', 'ikon iconify'], ['photos', 'Unsplash / Pexels', 'bilde foto bakgrunn']];
// ISO2: uten admin tas Domener (og Cloudflare) ut av søket.
const index = () => [...IDX.map(([id, t, p, h, k, a]) => ({ id, title: t, path: p, href: h, anchor: a ?? null, kw: domOk() ? k : k.replace(/\s*domener/g, '') })),
  ...(IG.list ?? INTEG_IDX.filter(([id]) => id !== 'cloudflare' || domOk()).map(([id, name, kw]) => ({ id, name, kw }))).map((x) => ({ id: `integ:${x.id}`, title: x.name, path: `Integrasjoner · ${x.name}`, href: `#/set/integ/${x.id}`, kw: `${x.kw ?? ''} ${x.group ?? ''} ${(x.fields ?? []).map((f) => f.label).join(' ')}` }))];
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
// Prompt 34 (claude-code-innst-ai-sok-highlight.md): poengsum per ord – helt ord = 3, prefiks = 2, treff i tittel = 1. Beste treff først.
const STOP = new Set(['hvordan', 'hvor', 'hva', 'jeg', 'meg', 'min', 'mitt', 'mine', 'er', 'kan', 'for', 'til', 'en', 'et', 'ei', 'og', 'pa', 'i', 'av', 'med', 'den', 'det', 'som', 'vil', 'skal', 'ser', 'gjor', 'man', 'du', 'how', 'do', 'the', 'to']);
const words = (s) => norm(s).split(/[^a-z0-9æøå]+/).filter(Boolean);
function localHits(q) {
  const w = words(q).filter((x) => x.length > 1 && !STOP.has(x));
  if (!w.length) return [];
  return index().map((x) => {
    const hay = words(`${x.title} ${x.path} ${x.kw}`), tw = words(x.title);
    const s = w.reduce((a, t) => a + (hay.includes(t) ? 3 : hay.some((h) => (h.length >= 4 && (h.startsWith(t) || t.startsWith(h))) || (t.length >= 6 && h.slice(0, 6) === t.slice(0, 6))) ? 2 : 0) + (tw.some((h) => h.startsWith(t) || (h.length >= 4 && t.startsWith(h))) ? 1 : 0), 0);
    return [x, s];
  }).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([x]) => x);
}
/** Enter i søkefeltet: går rett til beste treff med markering (vanlig søk), eller spør Glimt med en gang (✦ AI). */
export function key24(e) {
  if (e.key !== 'Enter' || e.target?.id !== 'p24-sq') return false;
  e.preventDefault();
  if (SS.ai) { clearTimeout(sqT); aiSearch(); return true; }
  const top = localHits(SS.q)[0];
  if (top) { SS.q = ''; SS.ans = ''; SS.ids = null; P25.goSet(top); }
  return true;
}
let goT = null;
function searchBar() {
  return `<div class="p24-ss"><label class="p24-ssf"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg><input id="p24-sq" data-p24in="sq" type="search" value="${esc(SS.q)}" placeholder="${SS.ai ? 'Spør, f.eks. «hvor bytter jeg ikon?»' : 'Søk i innstillinger'}" enterkeyhint="search" autocomplete="off" aria-label="Søk i innstillinger">${SS.q ? '<button type="button" class="p24-ssx" data-p24="sqx" aria-label="Tøm">×</button>' : ''}</label>
    <button class="p24-ai${SS.ai ? ' on' : ''}" data-p24="sqai" aria-pressed="${SS.ai}">✦ AI</button></div>`;
}
function searchResults() {
  const hits = SS.ai && SS.ids ? SS.ids.map((id) => index().find((x) => x.id === id)).filter(Boolean) : localHits(SS.q);
  // Prompt 25: et trykk på et treff åpner riktig side, scroller til raden og fremhever den (som «Ta meg dit →»).
  const rows = hits.map((x) => `<a class="opt-row p17-row" href="${esc(x.href.startsWith('#') ? x.href : '#/set')}" data-p24="goset" data-id="${esc(x.id)}"><span class="m-grow p17-rt"><b>${esc(x.title)}</b><small>${esc(x.path)}</small></span><span class="p17-chev" aria-hidden="true">›</span></a>`).join('');
  const top = SS.ai && !SS.busy && hits[0];
  return `${SS.ans ? `<div class="p24-ans"><span>✦</span><span class="p25-ansb"><span>${esc(SS.ans)}</span>${top ? `<button class="p25-go" data-p24="goset" data-id="${esc(top.id)}">Vis meg nå ›</button>` : ''}</span></div>` : ''}${SS.busy ? '<div class="pp-mut" style="padding:0 4px">✦ Tenker …</div>' : ''}
    ${rows ? `<span class="pp-lab p17-gl">TREFF · ${hits.length}</span><div class="list p17-list">${rows}</div>` : SS.busy ? '' : `<span class="pp-mut p24-none">Ingen treff.${SS.ai ? '' : ' Slå på ✦ AI for å spørre med vanlige ord.'}</span>`}`;
}
async function aiSearch() {
  const q = SS.q.trim();
  if (q.length < 2) return;
  SS.busy = true; SS.ans = ''; draw();
  const items = index().map(({ id, title, path }) => ({ id, title, path }));
  try {
    const r = await hlApi('/settings/ai-search', { method: 'POST', json: { q, items } });
    SS.ans = r?.answer ?? ''; SS.ids = Array.isArray(r?.ids) ? r.ids.filter((id) => index().some((x) => x.id === id)) : localHits(q).map((x) => x.id); // valideres mot indeksen
    if (!SS.ids.length) SS.ids = localHits(q).map((x) => x.id);
  } catch {
    const h = localHits(q); SS.ids = h.map((x) => x.id);
    SS.ans = h.length ? `Det ligger under ${h[0].path}${h[0].path.includes(h[0].title) ? '' : ` → ${h[0].title}`}.` : 'Fant ingen innstilling som passer. Prøv andre ord.';
  }
  SS.busy = false; draw();
  // Prompt 34: etter ca. 1,6 s går den av seg selv til siden og markerer målet («Vis meg nå ›» gjør det med en gang).
  clearTimeout(goT);
  const top = SS.ids?.[0] && index().find((x) => x.id === SS.ids[0]);
  if (top && SS.q.trim() === q) goT = setTimeout(() => { if (SS.ai && SS.q.trim() === q && m.screen === 'set') { SS.q = ''; SS.ans = ''; SS.ids = null; SS.ai = false; P25.goSet(top); } }, 1600);
}
/** Toppen av Innstillinger i Papir: søk, ✦ AI og PROFIL. Ved søk vises bare treffene. */
export function setTop(row, grp, rest) {
  return `${SS.q.trim() ? '' : P30.updBanner('set')}${searchBar()}${SS.q.trim() ? searchResults() : rest /* prompt 39: PROFIL er flyttet til App → Appprofil */}`; // prompt 30: oppdateringsbanner øverst
}

/* =====================================================================
   3. Integrasjoner (GET/PUT/POST/DELETE /api/integrations)
   ===================================================================== */

export const IG = { list: null, miss: false, err: '', open: null, f: {}, test: {}, busy: '', t: 0 };
export async function integLoad24(force = false) {
  if (IG.miss || (!force && Date.now() - IG.t < 15000)) return;
  IG.t = Date.now();
  try { const r = await hlApi('/integrations'); IG.list = Array.isArray(r) ? r : r?.items ?? []; IG.err = ''; }
  catch (e) { if (e.status === 404) IG.miss = true; else IG.err = e.message; }
}
const ST = { ok: ['● Tilkoblet', 'var(--pp-pos)'], missing: ['Ikke satt opp', 'var(--pp-mut)'], error: ['● Feil', 'var(--pp-lab)'] };
/** Innstillinger → Integrasjoner. old = den gamle siden (HA-tilkobling), brukes når serveren mangler endepunktet. */
export function integPage24(old, haSync, sub = '') {
  if (IG.miss) return old;
  if (!IG.list) { if (!IG.t) integLoad24().then(draw).catch(() => {}); return IG.err ? `<div class="snote" style="color:var(--pp-lab)">${esc(IG.err)}</div>` : '<div class="m-spin"></div>'; }
  const want = sub || null;
  const one = (g) => {
    const [st, sc] = ST[g.status] ?? ST.missing, t = IG.test[g.id];
    const rows = (g.fields ?? []).map((f) => {
      const k = `${g.id}:${f.key}`, open = IG.open === k;
      const val = f.type === 'secret' ? (f.saved ? '•••• lagret' : 'Ikke satt') : f.value ? String(f.value) : f.saved ? 'Lagret' : 'Ikke satt';
      return `<button class="opt-row p17-row" data-p24="igf" data-k="${esc(k)}" aria-expanded="${open}"><span class="m-grow p17-rt"><b>${esc(f.label)}</b>${f.help ? `<small>${esc(f.help)}</small>` : ''}</span><span class="sval p24-igv">${esc(val)}</span><span class="p17-chev" aria-hidden="true">${open ? '⌄' : '›'}</span></button>
        ${open ? `<form class="p24-igf" data-p24form="igsave" data-id="${esc(g.id)}" data-key="${esc(f.key)}"><input class="p24-in mono" name="v" type="${f.type === 'secret' ? 'password' : f.type === 'url' ? 'url' : 'text'}" value="${esc(IG.f[k] ?? (f.type === 'secret' ? '' : f.value ?? ''))}" data-p24in="igv" data-k="${esc(k)}" placeholder="${esc(f.type === 'secret' ? (f.saved ? '•••• lagret – skriv for å bytte' : 'Lim inn nøkkelen') : f.label)}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <div class="p24-two"><button type="button" class="pp-btn" data-p24="igx">Avbryt</button><button type="submit" class="pp-btn ink" ${IG.busy === k ? 'disabled' : ''}>${IG.busy === k ? 'Lagrer …' : 'Lagre'}</button></div>
          ${f.saved || f.value ? `<button type="button" class="p24-clr" data-p24="igdel" data-id="${esc(g.id)}" data-key="${esc(f.key)}">Fjern verdi</button>` : ''}</form>` : ''}`;
    });
    if (g.canTest) rows.push(`<button class="opt-row p17-row" data-p24="igtest" data-id="${esc(g.id)}"><span class="m-grow p17-rt"><b style="color:var(--pp-lab)">Test tilkobling</b>${t ? `<small>${esc(t)}</small>` : ''}</span></button>`);
    return `<div class="p24-igg${want === g.id ? ' hit' : ''}" id="ig-${esc(g.id)}"><span class="pp-lab p17-gl p24-igh"><span>${esc(String(g.name).toUpperCase())}</span><span style="color:${sc}">${st}</span></span><div class="list p17-list">${rows.join('')}</div></div>`;
  };
  // ISO2: «Dine integrasjoner» (scope personal, egne verdier for hver bruker) først, «Server (administrator)» under.
  // Servergruppene sender serveren bare til admin. Grupper uten scope (eldre server) regnes som personlige.
  const mine = IG.list.filter((g) => g.scope !== 'server'), srv = IG.list.filter((g) => g.scope === 'server');
  const head = (t, s) => `<div class="p24-igsec"><b class="pp-serif">${t}</b><span class="pp-mut">${s}</span></div>`;
  const groups = (mine.length ? head('Dine integrasjoner', 'Bare du ser og bruker disse verdiene') + mine.map(one).join('') : '')
    + (srv.length ? head('Server (administrator)', 'Felles for alle brukere på serveren') + srv.map(one).join('') : '');
  if (want) setTimeout(() => document.getElementById(`ig-${want}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
  return `${groups || '<div class="snote">Ingen integrasjoner.</div>'}${IG.err ? `<div class="snote" style="color:var(--pp-lab)">${esc(IG.err)}</div>` : ''}
    <div class="snote">Hemmelige verdier lagres kryptert på serveren og vises bare som «•••• lagret».</div>${haSync || ''}`;
}

/* =====================================================================
   5. Ruter-visningen (fullskjerm, uten fanelinje og FAB)
   ===================================================================== */

export const RV = { sel: 0, mode: 'Alle' };
const LC = { Buss: '#e60000', Trikk: '#0b91ef', 'T-bane': '#ec700c', Tog: '#e1eb00', Båt: '#682c88' };
const lineC = (d) => d.color || LC[modeName(d)] || (/^\d$/.test(String(d.line)) ? LC['T-bane'] : /^1[1-9]$/.test(String(d.line)) ? LC.Trikk : LC.Buss);
// Mørke linjefarger får hvit tekst, lyse (Ruters gule tog, lyseblå trikk) får blekk.
const lineFg = (d, c) => { if (d.textColor) return d.textColor; const h = String(c).replace('#', ''); if (h.length !== 6) return '#fff'; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b > 120 ? '#1b1a17' : '#fff'; };
const minOf = (d) => d.minutes ?? d.min ?? (d.expected ? Math.round((new Date(d.expected) - Date.now()) / 60000) : null);
export function ruterView() {
  if (!AV.stops && !RV.busy) { RV.busy = true; avgLoad().then(draw).catch(() => {}).finally(() => { RV.busy = false; }); }
  const st = AV.stops ?? [], i = Math.min(RV.sel, Math.max(0, st.length - 1)), s = st[i];
  const key = s ? s.id ?? s.name : null, D = key ? AV.deps[key] ?? {} : {}, all = (D.departures ?? []).slice(0, 20);
  const modes = [...new Set(all.map(modeName).filter(Boolean))];
  const order = ['Trikk', 'Buss', 'T-bane', 'Tog', 'Båt'], mlist = ['Alle', ...order.filter((x) => modes.includes(x))];
  if (!mlist.includes(RV.mode)) RV.mode = 'Alle';
  const deps = RV.mode === 'Alle' ? all : all.filter((d) => modeName(d) === RV.mode);
  const name = D.stop?.name || s?.name || 'Avganger';
  const ml = modes.map((x, j) => (j && x !== 'T-bane' ? x.toLowerCase() : x)), ms = ml.length > 1 ? `${ml.slice(0, -1).join(', ')} og ${ml.at(-1)}` : ml[0] ?? '';
  const walk = D.stop?.walkMin ?? s?.walkMin;
  const sub = [ms || (st.length ? 'Sanntid fra Entur' : 'Ingen stopp ennå'), walk != null ? `${walk} min gange` : ''].filter(Boolean).join(' · ');
  const alert = D.situations?.[0]?.text ?? D.situations?.[0] ?? all.find((d) => d.situation)?.situation ?? '';
  const loading = !AV.stops || (s && !AV.deps[key]), failed = !!D.error;
  const pills = AV.edit ? '' : `<div class="p24-stops" data-p24lp="stops">${st.map((x, j) => `<button class="p24-sp${j === i ? ' on' : ''}" data-p24="rvstop" data-i="${j}">${esc(x.name)}</button>`).join('')}<button class="p24-sp add" data-p24="rvadd" aria-label="Legg til stopp">+ Stopp</button></div>`;
  const ed = AV.edit ? `<div class="p24-card p24-mine"><div class="p24-mh"><b>Mine stopp</b><button class="p24-b ink sm" data-p16="avdone">Ferdig</button></div>
      ${st.map((x, j) => `<div class="p24-mr"><span class="m-grow" style="min-width:0"><b class="m-ell">${esc(x.name)}</b><small>${esc(x.locality || (j === i ? 'Vises nå' : ''))}</small></span><button data-p16="avmv" data-i="${j}" data-d="-1" aria-label="Flytt opp" ${j ? '' : 'style="opacity:.3" disabled'}>↑</button><button data-p16="avmv" data-i="${j}" data-d="1" aria-label="Flytt ned" ${j < st.length - 1 ? '' : 'style="opacity:.3" disabled'}>↓</button><button class="rm" data-p16="avrm" data-i="${j}" aria-label="Fjern ${esc(x.name)}" ${st.length > 1 ? '' : 'style="opacity:.3" disabled'}>−</button></div>`).join('')}
      <label class="p24-msq"><span>⌕</span><input id="p16-avq" data-p16q="av" value="${esc(AV.q)}" placeholder="Søk etter holdeplass" autocomplete="off" enterkeyhint="search"></label>
      ${AV.busy ? '<span class="p24-mut">Søker i Entur …</span>' : ''}${AV.sErr ? `<span class="p24-mut">${esc(AV.sErr)}</span>` : ''}
      ${AV.res && !AV.res.length && !AV.busy && !AV.sErr ? '<span class="p24-mut">Fant ingen holdeplasser.</span>' : ''}
      ${(AV.res ?? []).length ? `<div class="p24-res">${AV.res.map((r, j) => { const has = st.some((x) => x.id === r.id); return `<button data-p16="avpick" data-i="${j}"${j ? '' : ' style="border-top:0"'}><span class="m-grow"><b>${esc(r.name)}</b><small>${esc([r.locality, ...(r.modes ?? [])].filter(Boolean).join(' · '))}</small></span><span style="color:${has ? 'var(--pp-mut)' : 'var(--pp-lab)'}">${has ? 'Lagt til' : '+ Legg til'}</span></button>`; }).join('')}</div>` : ''}
      <span class="p24-mut" style="font-size:11.5px">Hold inne på stoppene for å komme hit.</span></div>` : '';
  const rows = deps.map((d, j) => {
    const k = depKey(key, d, j), open = DEP.open === k, c = lineC(d), { txt, late } = depStatus(d), mn = minOf(d), clock = hm(d.expected || d.aimed || d.time);
    return `<div class="p24-dep${d.cancelled ? ' x' : ''}"${j ? '' : ' style="border-top:0"'}><button class="p24-dh" data-p21="dep" data-k="${esc(k)}" aria-expanded="${open}"><span class="p24-ln" style="background:${esc(c)};color:${esc(lineFg(d, c))}">${esc(d.line)}</span>
      <span class="m-grow" style="min-width:0"><b class="m-ell">${esc(d.to ?? '')}</b><span style="color:${late || delayOf(d) > 0 ? 'var(--pp-lab)' : 'var(--pp-mut)'}">${esc(txt)}</span></span>
      <span class="p24-dm"><b>${mn == null ? '–' : mn <= 0 ? 'nå' : `${mn} min`}</b><small>${esc(clock)}</small></span></button><div class="p28-col${open ? ' on' : ''}" data-depcol="${esc(k)}"><div>${stopList(d, k, c, name)}</div></div></div>`; // prompt 28: alltid i layout, høyden animeres
  }).join('');
  return `<div class="p24-rv"><div class="p24-rvh" style="${heroBg('avg')}">
      <div class="p24-rvt"><a class="p24-gp" href="#/hl" data-swipeback>‹ Oversikt</a><span class="m-grow"></span><button class="p24-gp" data-p24="rvref" aria-label="Oppdater">↻ ${esc(hm(AV.t || Date.now()))}</button></div>
      <div class="p24-rvk"><span>Sanntid · Ruter</span><h1>${esc(name)}</h1><small>${esc(sub)}</small></div></div>
    <div class="p24-rvb">${globalThis.P41?.tripRuter?.() ?? '' /* prompt 41: MIN REISE · SEBASTIAN */}${pills}${ed}
      ${loading && !failed ? '<span class="p24-st">Henter sanntid fra Entur …</span>' : ''}${failed ? '<span class="p24-st lab">Fikk ikke kontakt med Entur. Trykk ↻ for å prøve igjen.</span>' : ''}
      ${mlist.length > 1 ? `<div class="p24-seg">${mlist.map((x) => `<button data-p24="rvmode" data-v="${esc(x)}" aria-pressed="${RV.mode === x}">${esc(x)}</button>`).join('')}</div>` : ''}
      ${alert ? `<div class="p24-alert"><b>!</b><span>${esc(alert)}</span></div>` : ''}
      ${rows ? `<div class="p24-deps">${rows}</div>` : !loading && s ? '<span class="p24-st">Ingen avganger av denne typen den neste timen.</span>' : ''}
      ${!st.length && AV.stops ? '<span class="p24-st">Ingen stopp ennå. Trykk «+ Stopp» for å søke etter en holdeplass.</span>' : ''}
      <span class="p24-foot">Sanntid fra Entur/Ruter når tilkoblet. Trykk på en avgang for å se stoppene.</span></div></div>`;
}

/* =====================================================================
   6. Boliger: toppbilde per bolig, piller med hold inne, «Rediger bolig» og domene-pille
   ===================================================================== */

export const BE = { id: null, f: null, delArm: false, busy: false, prevBg: null, curBg: null, at: 0, dom: null, domT: 0 };
const STROM = '/assets/boliger/stromstad.webp';
const COLS = ['#3f7a6e', '#2f6b45', '#2b5d8a', '#7a3b6b', '#a8661a', '#b23a2a', '#3d4652'];
const curHome = () => {
  const L0 = BO.list ?? [], id = +String(m.sub ?? '').split('/')[0] || +L.bol || null;
  return L0.find((f) => f.id === id) ?? L0[0] ?? null;
};
const bgKind = (f) => (f?.background ? f.background : /str[øo]mstad/i.test(`${f?.name ?? ''} ${f?.address ?? ''}`) ? 'preset:stromstad' : 'color');
export const bgUrl = (f) => { const k = bgKind(f); return k === 'preset:stromstad' ? STROM : k.startsWith('upload:') ? f.backgroundUrl || `/finans/api/folders/${f.id}/bg?v=${encodeURIComponent(k.slice(7))}` : null; };
const HERO_G = 'linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0) 35%,rgba(0,0,0,.45))';
/** Toppbildet på Boliger: valgt boligs bakgrunn, eller null (vanlig toppbilde) når boligen har «Farge». */
export function bolHero() {
  const f = curHome(), u = f ? bgUrl(f) : null;
  const v = u ? `background-image:${HERO_G},url('${esc(u)}');background-size:cover;background-position:center` : null;
  if (v !== BE.curBg) { BE.prevBg = BE.curBg; BE.curBg = v; BE.at = Date.now(); }
  return v;
}
/** Krysstoning (200 ms) fra forrige bolig sitt bilde. */
export function bolFade() {
  if (!BE.prevBg || Date.now() - BE.at > 260) return '';
  return `<span class="p24-xf" style="${BE.prevBg}" aria-hidden="true"></span>`;
}
export const bolKicker = () => ((BO.list ?? []).length ? (BO.list ?? []).map((f) => f.name).join(' · ') : null);
/** Pillene øverst på Boliger (overlapper toppbildet). Hold inne 0,5 s = «Rediger bolig». */
export function bolPills() {
  const L0 = BO.list ?? [], cur = curHome(), mon = new Date().toLocaleDateString('nb-NO', { month: 'short' }).replace('.', '');
  if (!L0.length) return '';
  return `<div class="p24-hp">${L0.map((f) => {
    const on = cur?.id === f.id, d = BO.d[f.id], mt = d?.months?.at?.(-1)?.total;
    return `<a class="p24-hpi${on ? ' on' : ''}" href="#/dir/${f.id}" data-p24bol="${f.id}" draggable="false"><span class="p24-hav" style="background:${esc(f.color || COLS[f.id % COLS.length])}">${esc(ini(f.name).slice(0, 1))}</span><span><b>${esc(f.name)}</b><small>${mt != null ? `${kr(mt)} i ${mon}` : `${kr(f.yearTotal)} i år`}</small></span></a>`;
  }).join('')}<button class="p24-hpi add" data-p16="bolny">+ Ny bolig</button></div>`;
}
/** Ark som tegnes utenfor rullefeltet (over fanelinja). */
export const sheets24 = () => (BE.id && m.screen === 'dir' ? editSheet() : '');
function editSheet() {
  const f = (BO.list ?? []).find((x) => x.id === BE.id);
  if (!f) return '';
  const E = BE.f, bk = E.background, u = bk === 'preset:stromstad' ? STROM : bk.startsWith('upload:') ? E.preview || bgUrl({ ...f, background: bk }) : null;
  const prev = u ? `background-image:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55)),url('${esc(u)}')` : `background:linear-gradient(150deg,${E.color},color-mix(in srgb,${E.color} 70%,#000))`;
  const opt = (k, n, bg) => `<button class="p24-bgo" data-p24="bebg" data-v="${esc(k)}" aria-pressed="${bk === k}"><span style="${bg}"></span><small>${n}</small></button>`;
  const own = f.background?.startsWith('upload:') || bk.startsWith('upload:') ? opt(bk.startsWith('upload:') ? bk : f.background, 'Eget bilde', `background-image:url('${esc(E.preview || bgUrl({ ...f, background: bk.startsWith('upload:') ? bk : f.background }))}')`) : '';
  const last = (BO.list ?? []).length <= 1;
  return `<div class="sheet-bg" data-p24="bex"></div><div class="pp-sheet p24-be" role="dialog" aria-label="Rediger bolig"><span class="pp-grab"></span>
    <div class="p24-beh"><span></span><b>Rediger bolig</b><button data-p24="bex" aria-label="Lukk">×</button></div>
    <div class="p24-bep" style="${prev};background-size:cover;background-position:center">${esc(E.name || f.name)}</div>
    <span class="p24-fl">Navn</span><input class="p24-in" data-p24in="be" data-k="name" value="${esc(E.name)}" maxlength="60">
    <span class="p24-fl">Adresse</span><input class="p24-in" data-p24in="be" data-k="address" value="${esc(E.address)}" maxlength="120">
    <span class="p24-fl">Budsjett per måned (kr)</span><input class="p24-in mono" data-p24in="be" data-k="budget" value="${esc(E.budget)}" inputmode="numeric">
    <span class="p24-fl">Farge</span><div class="p24-cols">${COLS.map((c) => `<button data-p24="becol" data-v="${c}" aria-label="Farge ${c}" aria-pressed="${E.color === c}" style="background:${c}"></button>`).join('')}<label class="p24-colf" title="Egen farge"><input type="color" value="${esc(E.color)}" data-p24in="becolf"></label></div>
    <span class="p24-fl">Bakgrunn</span><div class="p24-bgs">${opt('color', 'Farge', `background:linear-gradient(150deg,${E.color},color-mix(in srgb,${E.color} 70%,#000))`)}${opt('preset:stromstad', 'Strømstad', `background-image:url('${STROM}')`)}${own}
      <label class="p24-bgo"><span class="up">+</span><small>Last opp</small><input class="m-file" type="file" accept="image/*" data-p24file="bebg"></label></div>
    ${accRow47(f)}
    <button class="p24-b ink lg" data-p24="besave" ${BE.busy ? 'disabled' : ''}>${BE.busy ? 'Lagrer …' : 'Lagre'}</button>
    <button class="p24-b ghost lab" data-p24="bedel" ${last ? 'disabled' : ''}>${last ? 'Kan ikke slette siste bolig' : BE.delArm ? `Trykk igjen for å slette ${esc(f.name)}` : 'Slett bolig'}</button></div>`;
}
// Prompt 47: «Delt med N» i Rediger bolig åpner Tilgang-siden (fanen Tilgang finnes ikke lenger på mobil).
function accRow47(f) {
  const mem = BO.d[f.id]?.members ?? f.members ?? [], n = Math.max(0, mem.length - 1);
  const av = mem.slice(0, 4).map((x) => `<span class="p47-av" style="background:${esc(x.color || '#6b6558')}">${esc(ini(x.name || '?').slice(0, 1))}</span>`).join('');
  return `<button type="button" class="p47-acc" data-p24="beacc" data-id="${f.id}">${av ? `<span class="p47-avs" aria-hidden="true">${av}</span>` : ''}<span class="m-grow"><b>${n ? `Delt med ${n}` : 'Ikke delt'}</b><small>Tilgang · hvem som kan se og laste opp</small></span><span class="p47-chev" aria-hidden="true">›</span></button>`;
}
function openEdit(id) {
  const f = (BO.list ?? []).find((x) => x.id === id);
  if (!f) return;
  BE.id = id; BE.delArm = false;
  BE.f = { name: f.name ?? '', address: f.address ?? '', budget: f.budget != null ? String(Math.round(f.budget)) : '', color: f.color || COLS[id % COLS.length], background: bgKind(f), file: null, preview: null };
  haptic('ok'); navigator.vibrate?.(15); draw();
}
// Skalerer et eget bilde til maks 1200 px før opplasting (JPEG).
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const s = Math.min(1, 1200 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * s); cv.height = Math.round(im.naturalHeight * s);
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return await new Promise((ok) => cv.toBlob((b) => ok(b || file), 'image/jpeg', 0.86));
  } catch { return file; } finally { URL.revokeObjectURL(url); }
}
async function saveEdit() {
  const id = BE.id, E = BE.f;
  BE.busy = true; draw();
  try {
    let bg = E.background;
    if (E.file) {
      const fd = new FormData(); fd.append('file', E.file, 'bg.jpg');
      const r = await fetch(`/finans/api/folders/${id}/bg`, { method: 'PUT', body: fd });
      if (!r.ok) throw new Error(r.status === 404 ? 'Serveren støtter ikke egne bilder ennå' : `Opplastingen feilet (${r.status})`);
      const j = await r.json().catch(() => ({}));
      bg = j.background || `upload:${j.id ?? Date.now()}`;
    }
    const budget = E.budget.trim() === '' ? null : +E.budget.replace(/\s/g, '').replace(',', '.');
    await api(`/folders/${id}`, { method: 'PATCH', json: { name: E.name.trim() || undefined, address: E.address, budget, color: E.color, background: bg } });
    // Eldre server lagrer ikke bakgrunnen: husk valget her så toppbildet følger det likevel.
    BO.list = (BO.list ?? []).map((f) => (f.id === id ? { ...f, name: E.name.trim() || f.name, address: E.address, budget, color: E.color, background: bg, ...(E.preview ? { backgroundUrl: E.preview } : {}) } : f));
    await bolLoad(m.sub).catch(() => {});
    BO.list = (BO.list ?? []).map((f) => (f.id === id && !f.background ? { ...f, background: bg, ...(E.preview ? { backgroundUrl: E.preview } : {}) } : f));
    BE.id = null; flash('Boligen er lagret ✓');
  } catch (e) { flash(e.message); }
  BE.busy = false; draw();
}
// Domene-pillen (Finans + Boliger-profilen): besøk i dag, antall domener og status. Oppdateres hvert 5. minutt.
export function domPill() {
  if (!profRoot() || m.screen !== 'dir' || m.sub || !domOk()) return '';
  if (Date.now() - BE.domT > 5 * 60000) {
    BE.domT = Date.now();
    hlApi('/domains/summary').then((r) => { BE.dom = r; }).catch(() => { const d = hlDom(); BE.dom = d ? { visitsToday: d.visitors, domains: d.n, status: d.up === false ? 'error' : 'ok' } : BE.dom; }).finally(() => { if (m.screen === 'dir') draw(); });
  }
  const d = BE.dom ?? {}, dot = d.status === 'error' ? '#e0604f' : d.status === 'warn' ? '#e8c14a' : '#6fdc8c';
  return `<a class="p24-dom" href="#/dom" title="Åpne Domener"><span class="p24-gl"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg></span><span class="p24-dv"><b>${d.visitsToday != null ? n0(d.visitsToday) : '–'}</b><small>besøk i dag · ${d.domains ?? '–'} domener</small></span><i style="background:${dot}"></i></a>`;
}

/* =====================================================================
   7. Ikoner i Nyhetsleser som <img> (fargen bakt inn i SVG-en, forhåndslastet)
   ===================================================================== */

const SVGC = new Map(), SVGP = new Map();
const icUrl = (id) => `/api/icons/${id.split(':').map(encodeURIComponent).join('/')}.svg`;
const COLOR = ['noto', 'twemoji', 'fluent-emoji', 'logos', 'flag', 'circle-flags'];
const isColor = (id) => COLOR.includes(id.split(':')[0]) || /emoji/.test(id);
/** Henter SVG-ene på forhånd, så ikonene vises med en gang (ikke først når fanen tegnes på nytt). */
export function icPreload(ids) {
  const miss = [...new Set(ids.filter((id) => id && !isColor(id) && !SVGC.has(id) && !SVGP.has(id)))];
  if (!miss.length) return Promise.resolve();
  return Promise.all(miss.map((id) => { const p = fetch(icUrl(id)).then((r) => (r.ok ? r.text() : '')).then((t) => { SVGC.set(id, t); }).catch(() => SVGC.set(id, '')).finally(() => SVGP.delete(id)); SVGP.set(id, p); return p; })).then(() => { if (['nyheter', 'set'].includes(m.screen)) draw(); });
}
const INK = () => (paperDark() ? ['#f3efe6', '#8a8578'] : ['#1b1a17', '#7a7468']);
/** Ikonet som <img>. tone: 'ink' (valgt) eller 'mut'. */
export function icImg(id, size = 16, cls = 'p23-ic', tone = 'ink') {
  if (!id) return '';
  const st = `width:${size}px;height:${size}px`;
  if (isColor(id)) return `<img class="${cls} p24-img" src="${icUrl(id)}" alt="" style="${st}" decoding="async">`;
  const svg = SVGC.get(id);
  if (svg == null) { icPreload([id]); return `<span class="${cls} p24-img" style="${st}" aria-hidden="true"></span>`; }
  if (!svg) return `<span class="${cls} p24-img" style="${st}" aria-hidden="true"></span>`;
  const c = tone === 'mut' ? INK()[1] : tone === 'lab' ? '#b23a2a' : tone === 'white' ? '#ffffff' : INK()[0];
  const out = svg.replace(/currentColor/g, c).replace(/<svg\b(?![^>]*\bcolor=)/, `<svg color="${c}"`);
  return `<img class="${cls} p24-img" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(out)}" alt="" style="${st}" decoding="sync">`;
}

/* =====================================================================
   8. Hendelser
   ===================================================================== */

let lp = null, lpFired = false, sqT = null;
export function down24(e) {
  lpFired = false;
  if ((e.button ?? 0) > 0) return false;
  const pill = e.target.closest?.('[data-p24bol]'), stops = e.target.closest?.('[data-p24lp="stops"]');
  if (!pill && !stops) return false;
  const ms = pill ? 500 : 550;
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
    lp = null; lpFired = true;
    if (pill) openEdit(+pill.dataset.p24bol);
    else { AV.edit = true; AV.q = ''; AV.res = null; haptic('ok'); navigator.vibrate?.(15); draw(); }
  }, ms) };
  return false;
}
export function move24(e) { if (lp && (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10)) { clearTimeout(lp.t); lp = null; } }
export function up24() { if (lp) clearTimeout(lp.t); lp = null; }

/** Input svarer synkront (true = tatt), resten er asynkront. */
export function bind24(e, t) { return e.type === 'input' ? input24(e, t) : bindAsync(e, t); }
function input24(e, t) {
  {
    const k = t.dataset?.p24in;
    if (!k) return false;
    if (k === 'sq') { SS.q = t.value; SS.ans = ''; SS.ids = null; clearTimeout(sqT); if (SS.ai) sqT = setTimeout(aiSearch, 700); draw(); return true; }
    if (bdInput(k, t)) return true;
    if (k === 'igv') { IG.f[t.dataset.k] = t.value; return true; }
    if (k === 'be') { BE.f[t.dataset.k] = t.value; if (t.dataset.k === 'name') { const p = document.querySelector('.p24-bep'); if (p) p.textContent = t.value; } return true; }
    if (k === 'becolf') { BE.f.color = t.value; return true; }
    return false;
  }
}
async function bindAsync(e, t) {
  if (e.type === 'change') {
    if (t.dataset?.p24in === 'becolf') { BE.f.color = t.value; if (BE.f.background === 'color') draw(); return true; }
    if (bdChange(t)) return true;
    if (t.dataset?.p24file === 'bebg') {
      const f = t.files?.[0]; t.value = ''; if (!f) return true;
      const b = await shrink(f); BE.f.file = b; BE.f.preview = URL.createObjectURL(b); BE.f.background = 'upload:new'; draw(); return true;
    }
    return false;
  }
  if (e.type === 'submit') {
    const fm = t.dataset?.p24form;
    if (!fm) return false;
    e.preventDefault();
    if (await bdSubmit(fm)) return true;
    if (fm === 'igsave') {
      const id = t.dataset.id, key = t.dataset.key, k = `${id}:${key}`, v = String(new FormData(t).get('v') ?? '').trim();
      if (!v) { IG.open = null; draw(); return true; }
      IG.busy = k; draw();
      try { await hlApi(`/integrations/${encodeURIComponent(id)}`, { method: 'PUT', json: { [key]: v } }); delete IG.f[k]; IG.open = null; await integLoad24(true); flash('Lagret ✓'); } catch (err) { flash(err.message); }
      IG.busy = ''; draw(); return true;
    }
    return false;
  }
  if (e.type !== 'click') return false;
  if (lpFired && t.closest?.('[data-p24bol], [data-p24lp]')) { e.preventDefault(); lpFired = false; return true; }
  const fs = t.closest?.('[data-p24f="src"]');
  if (fs) { e.preventDefault(); haptic('tab'); await famSource(fs.dataset.id); return true; }
  const x = t.closest?.('[data-p24]');
  if (!x) return false;
  const k = x.dataset.p24;
  if (x.tagName !== 'LABEL' && x.tagName !== 'A') e.preventDefault();
  if (await bdClick(k, x, e)) return true;
  switch (k) {
    case 'prof': await pickProfile(x.dataset.k); return true;
    case 'sqx': SS.q = ''; SS.ans = ''; SS.ids = null; draw(); document.getElementById('p24-sq')?.focus(); return true;
    case 'goset': { e.preventDefault(); clearTimeout(goT); const it = index().find((y) => y.id === x.dataset.id); SS.q = ''; SS.ans = ''; SS.ids = null; SS.ai = false; P25.goSet(it); return true; }
    case 'sqai': SS.ai = !SS.ai; SS.ans = ''; SS.ids = null; draw(); if (SS.ai && SS.q.trim()) aiSearch(); document.getElementById('p24-sq')?.focus(); return true;
    case 'igf': IG.open = IG.open === x.dataset.k ? null : x.dataset.k; draw(); setTimeout(() => document.querySelector('.p24-igf input')?.focus(), 30); return true;
    case 'igx': IG.open = null; draw(); return true;
    case 'igdel': try { await hlApi(`/integrations/${encodeURIComponent(x.dataset.id)}/${encodeURIComponent(x.dataset.key)}`, { method: 'DELETE' }); IG.open = null; await integLoad24(true); flash('Verdien er fjernet'); } catch (err) { flash(err.message); } draw(); return true;
    case 'igtest': { const id = x.dataset.id; IG.test[id] = 'Tester …'; draw(); try { const r = await hlApi(`/integrations/${encodeURIComponent(id)}/test`, { method: 'POST' }); IG.test[id] = `${r?.ok === false ? '✕ ' : '✓ '}${r?.message ?? (r?.ok === false ? 'Feilet' : 'Tilkoblingen virker')}`; } catch (err) { IG.test[id] = `✕ ${err.message}`; } await integLoad24(true); draw(); return true; }
    // Ruter
    case 'rvstop': RV.sel = +x.dataset.i; RV.mode = 'Alle'; DEP.open = null; haptic('tab'); draw(); return true;
    case 'rvmode': RV.mode = x.dataset.v; haptic('tab'); draw(); return true;
    case 'rvref': await avgLoad(true); draw(); return true;
    case 'rvadd': AV.edit = true; AV.q = ''; AV.res = null; draw(); setTimeout(() => document.getElementById('p16-avq')?.focus(), 40); return true;
    // Boliger
    case 'bex': BE.id = null; draw(); return true;
    case 'beacc': { const id = +x.dataset.id; BE.id = null; BO.tab = 'tilg'; haptic('tap'); if (+String(m.sub ?? '').split('/')[0] !== id) location.hash = `#/dir/${id}`; window.scrollTo(0, 0); draw(); return true; } // prompt 47
    case 'becol': BE.f.color = x.dataset.v; draw(); return true;
    case 'bebg': BE.f.background = x.dataset.v; draw(); return true;
    case 'besave': await saveEdit(); return true;
    case 'bedel': {
      if ((BO.list ?? []).length <= 1) return true;
      if (!BE.delArm) { BE.delArm = true; draw(); return true; }
      const id = BE.id;
      try { await api(`/folders/${id}`, { method: 'DELETE' }); BE.id = null; flash('Boligen er slettet'); if (String(m.sub).startsWith(String(id))) location.hash = '#/dir'; await bolLoad(''); } catch (err) { flash(err.message); }
      draw(); return true;
    }
    default: return false;
  }
}
/** Husk sist valgte bolig (toppbildet på Boliger følger den). */
export function noteBol(sub) { const id = +String(sub ?? '').split('/')[0]; if (id && L.bol !== id) { L.bol = id; keep(); } }
