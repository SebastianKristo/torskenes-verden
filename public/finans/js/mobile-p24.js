// Prompt 24 (mobilweb / PWA): Bursdager (Mer → Bursdager og Hjem-widgeten «BURSDAGER · NESTE»), Ruter-visningen som
// fullskjerm uten fanelinje og FAB, profiler (Innstillinger → PROFIL), Boliger (toppbilde per bolig, domene-pille og
// «Rediger bolig» med hold inne), søk og ✦ AI-søk i Innstillinger, alle integrasjoner via /api/integrations og
// ikoner i Nyhetsleser som <img>. Endepunktene kommer fra serveren i samme prompt; mangler de (404), faller vi tilbake.
import { api, esc, n0, ini, hlApi } from './core.js';
import { m, draw, flash, domOk } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { AV, avgLoad, BO, bolLoad, heroBg, setTabBar } from './mobile-p16.js';
import { DEP, depKey, depStatus, stopList, modeName, delayOf } from './mobile-p21.js';
import { setFinTabs } from './mobile-paper3.js';
import { hlDom } from './mobile-hl.js';
import { paperDark } from './mobile-paper.js';
import { famSource } from './mobile-p22.js';
import * as P25 from './mobile-p25.js';

const LS = 'fh_p24';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };
const isAdmin = () => m.me?.role === 'admin' || m.me?.isMainAdmin === true;
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
const PROF_N = [['standard', 'Standard', 'Hjem, Finans, Mat og Mer · vanlige Finans-faner'], ['finans_boliger', 'Finans + Boliger', 'Åpner i Boliger · Boliger, Søk, Liste, Oversikt, Kvitteringer · Hjem under Mer'], ['boliger', 'Boliger-profil', 'Bare Finans og Domener, med Boliger først']];
let PROFS = PROF_DEF, profT = 0, applying = false;
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
function profGroup(row, grp) {
  if (!profT) profLoad().catch(() => {});
  const cur = profile();
  const rows = PROF_N.map(([k, n, s]) => `<button class="opt-row p17-row p24-prow" data-p24="prof" data-k="${k}" aria-pressed="${cur === k}"><span class="m-grow p17-rt"><b>${esc(n)}</b><small>${esc(s)}</small></span><span class="sval" style="opacity:1;font-weight:700;color:${cur === k ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${cur === k ? '✓ Valgt' : 'Velg'}</span></button>`);
  if (cur === 'custom') rows.push('<div class="opt-row p17-row"><span class="m-grow p17-rt"><b>Egendefinert</b><small>Egne endringer i fanene etter et profilvalg</small></span><span class="sval" style="opacity:1;font-weight:700;color:var(--pp-pos)">✓ Valgt</span></div>');
  return grp('PROFIL', rows);
}

/* =====================================================================
   2. Søk og ✦ AI-søk i Innstillinger
   ===================================================================== */

export const SS = { q: '', ai: false, ans: '', ids: null, busy: false };
// Alle innstillinger og undersider: id, tittel, hvor den ligger og hvor trykket går.
const IDX = [
  ['prof-std', 'Standard', 'Profil', '#/set', 'profil oppsett vanlig'], ['prof-fin', 'Finans + Boliger', 'Profil', '#/set', 'profil boliger finans start'], ['prof-bol', 'Boliger-profil', 'Profil', '#/set', 'profil boliger'],
  ['konto', 'Kontoer og brukere', 'Konto', '#/set/konto', 'bruker logg inn konto'], ['sik', 'Sikkerhet', 'Konto', '#/set/sik', 'passord 2fa totrinn lås face id fingeravtrykk økter'], ['tok', 'API-tokens', 'Konto', '#/set/tok', 'token nøkkel langtidstoken'],
  ['profil', 'Profilbilde og navn', 'Konto', '#/set/profil', 'avatar bilde profil'],
  ['fai', 'AI og tolkning', 'Finans', '#/set/fai', 'ai gemini groq ollama roboflow kvittering ocr'], ['kat', 'Kategorier og budsjett', 'Finans', '#/set/kat', 'kategori budsjett'], ['regel', 'Regler', 'Finans', '#/set/regel', 'regel automatisk'],
  ['bank', 'Bankimport', 'Finans', '#/set/bank', 'bank dnb csv import'], ['t212', 'Aksjer · Trading 212', 'Finans', '#/set/t212', 'aksje trading212 t212 fond'], ['fanelinje', 'Fanelinje og Mer i Finans', 'Finans', '#/set/fanelinje', 'fane faner navigasjon'], ['sub', 'Subscription OS', 'Finans', '#/sub', 'abonnement'],
  ['appnavn', 'Navn på appen', 'Homelab', 'nm', 'navn app tittel'], ['appikon', 'App-ikon', 'Homelab', 'ic', 'ikon logo app'], ['hjemnav', 'Fanelinje i Hjem', 'Homelab', '#/set/fanelinje', 'fane faner hjem navigasjon'], ['navstil', 'Fanelinje-stil', 'Homelab', 'ns', 'fane fanelinje stil ikoner tekst navn navigasjon'],
  ['mod', 'Moduler', 'Homelab', '#/set/mod', 'modul widget sporing domener mat'], ['rss', 'Nyhetsleser', 'Homelab', '#/nyheter', 'rss nyheter kilder ikon'],
  ['look', 'Utseende og fanelinje', 'App', '#/set/look', 'tema mørk lys farge papir utseende ikonfarger'], ['bakgrunn', 'Bakgrunn på Hjem', 'App · Utseende', '#/set/bakgrunn', 'bakgrunn bilde planeter vær oslo'],
  ['varsler', 'Varsler og haptikk', 'App', '#/set/varsler', 'varsel push lyd vibrasjon haptikk bursdager'], ['integ', 'Integrasjoner', 'App', '#/set/integ', 'integrasjon nøkkel api'],
  ['bd', 'Bursdager', 'Mer', '#/bd', 'bursdag kalender google'],
];
const INTEG_IDX = [['ha', 'Home Assistant', 'home ha assistant'], ['google', 'Google Kalender', 'kalender bursdag google oauth'], ['ai', 'AI (Gemini)', 'gemini groq ollama ai nøkkel'], ['t212', 'Trading 212', 'aksje'], ['bank', 'Bank', 'bank import'], ['imap', 'Kvitteringer på e-post (IMAP)', 'epost mail kvittering imap'],
  ['entur', 'Entur', 'ruter buss trikk avgang'], ['mybring', 'Mybring', 'posten bring pakke sporing'], ['postnord', 'PostNord', 'pakke sporing post'], ['parcelsapp', 'ParcelsApp', 'pakke sporing reserve'], ['cloudflare', 'Cloudflare', 'domene domener'], ['finn', 'Finn', 'finn annonse'],
  ['met', 'MET / Yr', 'vær yr'], ['map', 'Kart', 'kart maptiler stadia'], ['icons', 'Ikoner', 'ikon iconify'], ['photos', 'Unsplash / Pexels', 'bilde foto bakgrunn']];
// ISO2: uten admin tas Domener (og Cloudflare) ut av søket.
const index = () => [...IDX.map(([id, t, p, h, k]) => ({ id, title: t, path: p, href: h, kw: domOk() ? k : k.replace(/\s*domener/g, '') })),
  ...(IG.list ?? INTEG_IDX.filter(([id]) => id !== 'cloudflare' || domOk()).map(([id, name, kw]) => ({ id, name, kw }))).map((x) => ({ id: `integ:${x.id}`, title: x.name, path: `Integrasjoner · ${x.name}`, href: `#/set/integ/${x.id}`, kw: `${x.kw ?? ''} ${x.group ?? ''} ${(x.fields ?? []).map((f) => f.label).join(' ')}` }))];
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
function localHits(q) {
  const w = norm(q).split(/\s+/).filter((x) => x.length > 1);
  if (!w.length) return [];
  return index().map((x) => { const hay = norm(`${x.title} ${x.path} ${x.kw}`); const s = w.reduce((a, t) => a + (norm(x.title).includes(t) ? 3 : hay.includes(t) ? 1 : hay.includes(t.slice(0, 4)) && t.length > 4 ? 0.5 : 0), 0); return [x, s]; })
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([x]) => x);
}
function searchBar() {
  return `<div class="p24-ss"><label class="p24-ssf"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg><input id="p24-sq" data-p24in="sq" type="search" value="${esc(SS.q)}" placeholder="${SS.ai ? 'Spør, f.eks. «hvor bytter jeg ikon?»' : 'Søk i innstillinger'}" enterkeyhint="search" autocomplete="off" aria-label="Søk i innstillinger">${SS.q ? '<button type="button" class="p24-ssx" data-p24="sqx" aria-label="Tøm">×</button>' : ''}</label>
    <button class="p24-ai${SS.ai ? ' on' : ''}" data-p24="sqai" aria-pressed="${SS.ai}">✦ AI</button></div>`;
}
function searchResults() {
  const hits = SS.ai && SS.ids ? SS.ids.map((id) => index().find((x) => x.id === id)).filter(Boolean) : localHits(SS.q);
  // Prompt 25: et trykk på et treff åpner riktig side, scroller til raden og fremhever den (som «Ta meg dit →»).
  const rows = hits.map((x) => `<a class="opt-row p17-row" href="${esc(x.href.startsWith('#') ? x.href : '#/set')}" data-p24="goset" data-id="${esc(x.id)}"><span class="m-grow p17-rt"><b>${esc(x.title)}</b><small>${esc(x.path)}</small></span><span class="p17-chev" aria-hidden="true">›</span></a>`).join('');
  const top = SS.ai && !SS.busy && hits[0];
  return `${SS.ans ? `<div class="p24-ans"><span>✦</span><span class="p25-ansb"><span>${esc(SS.ans)}</span>${top ? `<button class="p25-go" data-p24="goset" data-id="${esc(top.id)}">Ta meg dit →</button>` : ''}</span></div>` : ''}${SS.busy ? '<div class="pp-mut" style="padding:0 4px">✦ Tenker …</div>' : ''}
    ${rows ? `<span class="pp-lab p17-gl">TREFF · ${hits.length}</span><div class="list p17-list">${rows}</div>` : SS.busy ? '' : `<span class="pp-mut p24-none">Ingen treff.${SS.ai ? '' : ' Slå på ✦ AI for å spørre med vanlige ord.'}</span>`}`;
}
async function aiSearch() {
  const q = SS.q.trim();
  if (q.length < 2) return;
  SS.busy = true; SS.ans = ''; draw();
  const items = index().map(({ id, title, path }) => ({ id, title, path }));
  try {
    const r = await hlApi('/settings/ai-search', { method: 'POST', json: { q, items } });
    SS.ans = r?.answer ?? ''; SS.ids = Array.isArray(r?.ids) ? r.ids : localHits(q).map((x) => x.id);
  } catch {
    const h = localHits(q); SS.ids = h.map((x) => x.id);
    SS.ans = h.length ? `Det ligger under ${h[0].path}${h[0].path.includes(h[0].title) ? '' : ` → ${h[0].title}`}.` : 'Fant ingen innstilling som passer. Prøv andre ord.';
  }
  SS.busy = false; draw();
}
/** Toppen av Innstillinger i Papir: søk, ✦ AI og PROFIL. Ved søk vises bare treffene. */
export function setTop(row, grp, rest) {
  return `${searchBar()}${SS.q.trim() ? searchResults() : profGroup(row, grp) + rest}`;
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
   4. Bursdager (GET/POST/PATCH/DELETE /api/birthdays)
   ===================================================================== */

const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], MS = MN.map((x) => x.slice(0, 3)), WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const RELC = { familie: '#b23a2a', venn: '#2b5d8a', jobb: '#2e6f75', annet: '#a8661a' }, RELN = { familie: 'Familie', venn: 'Venn', jobb: 'Jobb', annet: 'Annet' };
const SRC = { google: 'GOOGLE', ha: 'HOME ASSISTANT', local: 'LOKAL' };
const REMS = [[0, 'Samme dag'], [1, '1 dag før'], [7, '1 uke før'], [null, 'Ingen']];
export const BD = { d: null, local: false, err: '', t: 0, q: '', sel: null, add: false, editId: null, f: null, delArm: null, busy: '', cals: null, ents: null };
const LBD = 'bd_v1';
const localGet = () => { try { return JSON.parse(localStorage.getItem(LBD) || 'null')?.items ?? []; } catch { return []; } };
const localPut = (items) => { try { localStorage.setItem(LBD, JSON.stringify({ items })); } catch {} };
function nextOf(M, D) {
  const n = new Date(), t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  let x = new Date(n.getFullYear(), M - 1, D); if (x < t0) x = new Date(n.getFullYear() + 1, M - 1, D);
  return { x, days: Math.round((x - t0) / 864e5) };
}
const people = () => (BD.d?.items ?? []).map((p) => {
  const M = +p.month, D = +p.day, { x, days } = nextOf(M, D);
  const rel = String(p.relation ?? 'annet').toLowerCase();
  return { ...p, M, D, x, days: Number.isFinite(p.daysLeft) ? p.daysLeft : days, age: p.age ?? (p.year ? x.getFullYear() - p.year : null), rel: RELC[rel] ? rel : 'annet', src: SRC[p.source] ? p.source : 'local', rem: p.reminderDays ?? null };
}).sort((a, b) => a.days - b.days || String(a.name).localeCompare(b.name, 'nb'));
const inis = (n) => String(n).split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
const when = (d) => (d === 0 ? 'I dag' : d === 1 ? 'I morgen' : `om ${d} d`);
const dtx = (x) => `${WD[x.getDay()]} ${x.getDate()}. ${MN[x.getMonth()]}`;
const bav = (p, s) => `<span class="p24-bav" style="width:${s}px;height:${s}px;border-radius:${s / 2}px;background:${p.avatarUrl ? 'transparent' : RELC[p.rel]};font-size:${s >= 40 ? 14 : s >= 30 ? 11 : 10}px">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(inis(p.name))}</span>`;

export async function bdLoad(force = false) {
  if (!force && BD.d && Date.now() - BD.t < 60000) return;
  BD.t = Date.now();
  try { const r = await hlApi('/birthdays'); BD.d = { ...r, items: r?.items ?? (Array.isArray(r) ? r : []) }; BD.local = false; BD.err = ''; }
  catch (e) {
    if (e.status === 404) { BD.local = true; BD.d = { items: localGet(), google: { connected: false }, ha: {} }; BD.err = ''; }
    else BD.err = e.message;
  }
}
const f0 = () => { const n = new Date(), g = BD.d?.google?.connected, h = BD.d?.ha?.entityId; return { name: '', day: String(n.getDate()), month: String(n.getMonth() + 1), year: '', relation: 'venn', reminderDays: 1, saveTo: g ? 'google' : h ? 'ha' : 'local' }; };
const chip = (on, attrs, n) => `<button class="p24-chip${on ? ' on' : ''}" ${attrs} aria-pressed="${on}">${esc(n)}</button>`;
const tog = (on, attrs, n, s) => `<button class="p24-tog" ${attrs} role="switch" aria-checked="${on}"><span class="m-grow"><b>${esc(n)}</b><small>${esc(s)}</small></span><span class="p24-sw${on ? ' on' : ''}"><i></i></span></button>`;

function addCard() {
  const f = BD.f ?? (BD.f = f0()), G = BD.d?.google ?? {}, H = BD.d?.ha ?? {};
  const dests = [['google', 'Google Kalender', G.connected], ['ha', 'Home Assistant', !!H.entityId], ['local', 'Bare her', true]].filter((x) => x[2]);
  const note = f.saveTo === 'google' ? `Lagres som årlig heldagshendelse i Google Kalender${G.email ? ` på ${G.email}` : ''}.` : f.saveTo === 'ha' ? `Lagres i ${H.entityId} via Home Assistant.` : BD.local ? 'Lagres bare på denne enheten. Serveren støtter ikke bursdager ennå.' : 'Lagres bare i Homelab. Koble til en kalender for å synke.';
  return `<form class="p24-bdadd" data-p24form="bdsave"><b class="p24-h22">${BD.editId ? 'Rediger bursdag' : 'Ny bursdag'}</b>
    <input class="p24-in" data-p24in="bdf" data-k="name" value="${esc(f.name)}" placeholder="Navn" maxlength="60" autocomplete="off">
    <div class="p24-dmy"><select class="p24-in" data-p24in="bdf" data-k="day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${+f.day === i + 1 ? ' selected' : ''}>${i + 1}.</option>`).join('')}</select>
      <select class="p24-in" data-p24in="bdf" data-k="month">${MN.map((n, i) => `<option value="${i + 1}"${+f.month === i + 1 ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input class="p24-in mono" data-p24in="bdf" data-k="year" value="${esc(f.year)}" placeholder="År" inputmode="numeric" maxlength="4"></div>
    <span class="p24-fl">Hvem</span><div class="p24-chips">${Object.entries(RELN).map(([k, n]) => chip(f.relation === k, `type="button" data-p24="bdrel" data-v="${k}"`, n)).join('')}</div>
    <span class="p24-fl">Påminnelse</span><div class="p24-chips">${REMS.map(([v, n]) => chip(f.reminderDays === v, `type="button" data-p24="bdrem" data-v="${v ?? ''}"`, n)).join('')}</div>
    <span class="p24-fl">Lagre i</span><div class="p24-chips">${dests.map(([k, n]) => chip(f.saveTo === k, `type="button" data-p24="bddest" data-v="${k}"`, n)).join('')}</div>
    <span class="p24-note">${esc(note)}</span>
    <div class="p24-two"><button type="button" class="p24-b" data-p24="bdx">Avbryt</button><button type="submit" class="p24-b ink" ${BD.busy === 'save' ? 'disabled' : ''}>${BD.busy === 'save' ? 'Lagrer …' : 'Lagre'}</button></div></form>`;
}
function bdRow(p, i) {
  const open = BD.sel === p.id;
  return `<div class="p24-bdr"${i ? '' : ' style="border-top:0"'}><button class="p24-bdh" data-p24="bdsel" data-id="${esc(p.id)}" aria-expanded="${open}">${bav(p, 42)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(p.name)}</b><span class="p24-mut">${p.x.getDate()}. ${MS[p.x.getMonth()]}${p.age != null ? ` · fyller ${p.age}` : ''} · ${RELN[p.rel]}</span></span>
    <span class="p24-bdw"><b class="${p.days <= 7 ? 'soon' : ''}">${when(p.days)}</b><small>${SRC[p.src]}</small></span></button>
    ${open ? `<div class="p24-bdo"><span>${esc(dtx(p.x).replace(/^./, (c) => c.toUpperCase()))}${p.year ? ` · født ${p.year}` : ''} · ${p.days === 0 ? 'har bursdag i dag' : `om ${p.days} dager`}</span>
      <span class="p24-fl">Påminnelse</span><div class="p24-chips">${REMS.map(([v, n]) => chip(p.rem === v, `data-p24="bdprem" data-id="${esc(p.id)}" data-v="${v ?? ''}"`, n)).join('')}</div>
      <div class="p24-chips">${p.src === 'google' ? '<a class="p24-ob" href="https://calendar.google.com/" target="_blank" rel="noopener">Åpne i Google Kalender</a>' : ''}<button class="p24-ob" data-p24="bdedit" data-id="${esc(p.id)}">Rediger</button><button class="p24-ob lab" data-p24="bddel" data-id="${esc(p.id)}">${BD.delArm === p.id ? 'Trykk igjen for å slette' : 'Slett'}</button></div></div>` : ''}</div>`;
}
function calCard() {
  const G = BD.d?.google ?? {}, H = BD.d?.ha ?? {}, gOn = !!G.connected, hOn = !!H.entityId;
  if (gOn && !BD.cals && !BD.calBusy) { BD.calBusy = true; hlApi('/birthdays/google/calendars').then((r) => { BD.cals = Array.isArray(r) ? r : r?.items ?? r?.calendars ?? []; }).catch(() => { BD.cals = []; }).finally(() => draw()); }
  const haOk = H.allowed !== false && !BD.local;
  if (haOk && isAdmin() && !BD.ents && !BD.entBusy) { BD.entBusy = true; hlApi('/birthdays/ha/calendars').then((r) => { BD.ents = Array.isArray(r) ? r : r?.items ?? r?.entities ?? []; }).catch(() => { BD.ents = []; }).finally(() => draw()); }
  const GSVG = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  const cal = (x) => ({ id: x.id ?? x.calendarId ?? x, n: x.summary ?? x.name ?? x.id ?? x });
  const ent = (x) => (typeof x === 'string' ? x : x.entity_id ?? x.entityId ?? x.id);
  const ents = [...new Set([...(BD.ents ?? []).map(ent), ...(H.entityId ? [H.entityId] : [])])].filter(Boolean);
  return `<div class="p24-bdcal"><span class="p24-lab">KALENDERE</span><div class="p24-card p24-cal">
    <div class="p24-ch"><span class="p24-ci g">${GSVG.replace('18', '20').replace('18', '20')}</span><span class="m-grow"><b>Google Kalender</b><small style="color:${gOn ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${gOn ? `${esc(G.email ?? 'Tilkoblet')} · ${G.syncedAt ? `synket ${hm(G.syncedAt)}` : 'kobler til …'}` : BD.local ? 'Krever nyere server' : 'Ikke koblet til'}</small></span></div>
    ${gOn ? `<span class="p24-fl">Kalender</span><div class="p24-chips">${(BD.cals ?? []).map(cal).map((c) => chip(G.calendarId === c.id, `data-p24="gcal" data-v="${esc(c.id)}"`, c.n)).join('') || '<span class="p24-mut">Henter kalendere …</span>'}</div>
      ${tog(G.writeNew !== false, 'data-p24="gtog" data-k="writeNew"', 'Skriv nye bursdager til Google', 'Årlig heldagshendelse med påminnelse')}${tog(G.contacts !== false, 'data-p24="gtog" data-k="contacts"', 'Hent bursdager fra Google-kontakter', 'Fra kontaktlisten din')}
      <div class="p24-row8"><button class="p24-b lab m-grow" data-p24="gsync" ${BD.busy === 'g' ? 'disabled' : ''}>${BD.busy === 'g' ? 'Synker …' : '↻ Synk nå'}</button><button class="p24-b" data-p24="glogout">Logg ut</button></div>`
    : `<button class="p24-glog" data-p24="glogin" ${BD.local ? 'disabled' : ''}>${GSVG}Logg inn med Google</button>${G.configured === false ? '<span class="p24-mut">Google-klienten er ikke satt opp. Admin legger den inn under Innstillinger → Integrasjoner → Google Kalender.</span>' : ''}`}${G.error ? `<span class="p24-mut" style="color:var(--pp-lab)">${esc(G.error)}</span>` : ''}
    ${haOk ? `    <i class="p24-hr"></i>
    <div class="p24-ch"><span class="p24-ci ha"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/></svg></span><span class="m-grow"><b>Home Assistant</b><small style="color:${hOn ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${hOn ? `${esc(H.entityId)}${H.syncedAt ? ` · importert ${hm(H.syncedAt)}` : ''}` : 'Velg kalender og importer'}</small></span></div>
    ${ents.length ? `<span class="p24-fl">Kalender i Home Assistant</span><div class="p24-chips">${ents.map((e) => chip(H.entityId === e, `data-p24="haent" data-v="${esc(e)}"`, e).replace('p24-chip', 'p24-chip mono')).join('')}</div>` : isAdmin() || BD.local ? '' : '<span class="p24-mut">Bare administrator kan velge kalender i Home Assistant.</span>'}
    ${hOn ? tog(H.twoWay !== false, 'data-p24="hatwo"', 'Synk to veier', 'Nye bursdager her legges også i Home Assistant') : ''}
    <button class="p24-b ink" data-p24="haimp" ${BD.busy === 'ha' || BD.local || !(hOn || ents.length) ? 'disabled' : ''}>${BD.busy === 'ha' ? 'Importerer …' : hOn ? '↻ Importer på nytt' : 'Importer fra Home Assistant'}</button>` : ''}</div>
    <span class="p24-note" style="padding:0 4px">Nye bursdager lagres som årlige heldagshendelser. Endringer i Google Kalender og Home Assistant hentes inn automatisk.</span></div>`;
}
/** Mer → Bursdager (Bursdager.dc.html, variant mobile med skjult tittel). */
export function bdView() {
  if (!BD.d) { if (!BD.err && !BD.busyL) { BD.busyL = true; bdLoad().then(draw).catch(() => {}).finally(() => { BD.busyL = false; }); } return BD.err ? `<div class="p24-card p24-mut">${esc(BD.err)}</div>` : '<div class="m-spin"></div>'; }
  const L0 = people(), q = BD.q.trim().toLowerCase(), F = q ? L0.filter((x) => String(x.name).toLowerCase().includes(q)) : L0;
  const h = L0[0], same = h ? L0.filter((x) => x.days === h.days) : [], nxt = h ? L0.filter((x) => x.days > h.days).slice(0, 2) : [];
  const hero = h ? `<button class="p24-bdhero" data-p24="bdsel" data-id="${esc(h.id)}"><span class="p24-bdk"><span>${h.days === 0 ? 'BURSDAG I DAG' : 'NESTE BURSDAG'}</span><span>${same.length > 1 ? '' : SRC[h.src]}</span></span>
      <span class="p24-bdm"><span style="min-width:0"><b class="p24-bdn">${esc(same.map((x) => x.name).join(' og '))}</b><span class="p24-bds">${same.length === 1 && h.age != null ? `Fyller ${h.age} · ` : ''}${esc(dtx(h.x))}</span></span><span class="p24-bdbig"><b>${h.days === 0 ? 'I dag' : h.days}</b><small>${h.days === 0 ? '' : h.days === 1 ? 'dag igjen' : 'dager igjen'}</small></span></span>
      ${nxt.length ? `<span class="p24-bdmore">Deretter: ${esc(nxt.map((x) => `${x.name} ${x.x.getDate()}. ${MS[x.x.getMonth()]}`).join(' · '))}</span>` : ''}</button>` : '';
  const G = [], yr = new Date().getFullYear(), soon = F.filter((x) => x.days <= 30);
  if (soon.length) G.push({ t: 'NESTE 30 DAGER', items: soon });
  for (const x of F.filter((y) => y.days > 30)) { const k = MN[x.x.getMonth()].toUpperCase() + (x.x.getFullYear() !== yr ? ` ${x.x.getFullYear()}` : ''); let g = G.find((z) => z.t === k); if (!g) G.push(g = { t: k, items: [] }); g.items.push(x); }
  return `<div class="p24-bd">${hero}
    <div class="p24-bdq"><label class="p24-ssf"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg><input id="p24-bdq" data-p24in="bdq" type="search" value="${esc(BD.q)}" placeholder="Søk etter navn" autocomplete="off" aria-label="Søk etter navn"></label><button class="p24-add" data-p24="bdadd">${BD.add ? 'Lukk' : '+ Legg til'}</button></div>
    ${BD.add ? addCard() : ''}
    ${!F.length ? `<div class="p24-card p24-mut">${L0.length ? 'Ingen treff.' : 'Ingen bursdager ennå. Trykk «+ Legg til», eller koble til Google Kalender eller Home Assistant under.'}</div>` : ''}
    ${G.map((g) => `<div class="p24-bdg"><span class="p24-lab"><span>${esc(g.t)}</span><span class="p24-c">${g.items.length}</span></span><div class="p24-card p24-bdl">${g.items.map(bdRow).join('')}</div></div>`).join('')}
    ${calCard()}</div>`;
}
/** Hjem-widgeten «BURSDAGER · NESTE» (h9): de tre neste og «alle ›». */
export function bdWidget() {
  if (!BD.d) return '';
  const L0 = people().slice(0, 3);
  return `<a class="pp-card p24-bdwid" href="#/bd"><span class="pp-row"><span class="pp-lab">BURSDAGER · ${L0[0]?.days === 0 ? 'I DAG' : 'NESTE'}</span><span class="pp-mut" style="font-size:12px">alle ›</span></span>
    ${L0.map((x) => `<span class="p24-bwr">${bav(x, 30)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(x.name)}</b><span class="pp-mut">${x.x.getDate()}. ${MS[x.x.getMonth()]}${x.age != null ? ` · fyller ${x.age}` : ''}</span></span><b class="p24-bww${x.days <= 7 ? ' soon' : ''}">${when(x.days)}</b></span>`).join('') || '<span class="pp-mut">Ingen bursdager ennå · trykk for å legge til</span>'}</a>`;
}
async function bdWrite(fn, okMsg) {
  try { await fn(); await bdLoad(true); if (okMsg) flash(okMsg); } catch (e) { flash(e.status === 404 ? 'Serveren støtter ikke dette ennå' : e.message); }
  draw();
}
async function bdSave() {
  const f = BD.f ?? f0(), name = f.name.trim();
  if (!name) return flash('Skriv inn navn');
  const body = { name, month: +f.month, day: +f.day, year: /^\d{4}$/.test(f.year) ? +f.year : null, relation: f.relation, reminderDays: f.reminderDays, saveTo: f.saveTo };
  BD.busy = 'save'; draw();
  if (BD.local) {
    const items = localGet(), it = { id: BD.editId ?? `l${Date.now()}`, ...body, source: 'local' };
    localPut(BD.editId ? items.map((x) => (x.id === BD.editId ? { ...x, ...it } : x)) : [...items, it]);
    BD.busy = ''; BD.add = false; BD.editId = null; BD.f = null; BD.q = '';
    return bdWrite(async () => {}, `${name} er lagret`);
  }
  const id = BD.editId;
  await bdWrite(() => (id ? hlApi(`/birthdays/${encodeURIComponent(id)}`, { method: 'PATCH', json: body }) : hlApi('/birthdays', { method: 'POST', json: body })),
    `${name}${f.saveTo === 'google' ? ' er lagt i Google Kalender' : f.saveTo === 'ha' ? ' er lagt i Home Assistant' : ' er lagret'}`);
  BD.busy = ''; BD.add = false; BD.editId = null; BD.f = null; BD.q = ''; draw();
}
let armT = null;

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
      <span class="p24-dm"><b>${mn == null ? '–' : mn <= 0 ? 'nå' : `${mn} min`}</b><small>${esc(clock)}</small></span></button>${open ? stopList(d, k, c, name) : ''}</div>`;
  }).join('');
  return `<div class="p24-rv"><div class="p24-rvh" style="${heroBg('avg')}">
      <div class="p24-rvt"><a class="p24-gp" href="#/hl" data-swipeback>‹ Hjem</a><span class="m-grow"></span><button class="p24-gp" data-p24="rvref" aria-label="Oppdater">↻ ${esc(hm(AV.t || Date.now()))}</button></div>
      <div class="p24-rvk"><span>Sanntid · Ruter</span><h1>${esc(name)}</h1><small>${esc(sub)}</small></div></div>
    <div class="p24-rvb">${pills}${ed}
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
    <button class="p24-b ink lg" data-p24="besave" ${BE.busy ? 'disabled' : ''}>${BE.busy ? 'Lagrer …' : 'Lagre'}</button>
    <button class="p24-b ghost lab" data-p24="bedel" ${last ? 'disabled' : ''}>${last ? 'Kan ikke slette siste bolig' : BE.delArm ? `Trykk igjen for å slette ${esc(f.name)}` : 'Slett bolig'}</button></div>`;
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
    if (k === 'bdq') { BD.q = t.value; draw(); return true; }
    if (k === 'bdf') { BD.f[t.dataset.k] = t.dataset.k === 'year' ? t.value.replace(/\D/g, '').slice(0, 4) : t.value; return true; }
    if (k === 'igv') { IG.f[t.dataset.k] = t.value; return true; }
    if (k === 'be') { BE.f[t.dataset.k] = t.value; if (t.dataset.k === 'name') { const p = document.querySelector('.p24-bep'); if (p) p.textContent = t.value; } return true; }
    if (k === 'becolf') { BE.f.color = t.value; return true; }
    return false;
  }
}
async function bindAsync(e, t) {
  if (e.type === 'change') {
    if (t.dataset?.p24in === 'becolf') { BE.f.color = t.value; if (BE.f.background === 'color') draw(); return true; }
    if (t.dataset?.p24in === 'bdf' && t.tagName === 'SELECT') { BD.f[t.dataset.k] = t.value; return true; }
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
    if (fm === 'bdsave') { await bdSave(); return true; }
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
  switch (k) {
    case 'prof': await pickProfile(x.dataset.k); return true;
    case 'sqx': SS.q = ''; SS.ans = ''; SS.ids = null; draw(); document.getElementById('p24-sq')?.focus(); return true;
    case 'goset': { e.preventDefault(); const it = index().find((y) => y.id === x.dataset.id); SS.q = ''; SS.ans = ''; SS.ids = null; SS.ai = false; P25.goSet(it); return true; }
    case 'sqai': SS.ai = !SS.ai; SS.ans = ''; SS.ids = null; draw(); if (SS.ai && SS.q.trim()) aiSearch(); document.getElementById('p24-sq')?.focus(); return true;
    case 'igf': IG.open = IG.open === x.dataset.k ? null : x.dataset.k; draw(); setTimeout(() => document.querySelector('.p24-igf input')?.focus(), 30); return true;
    case 'igx': IG.open = null; draw(); return true;
    case 'igdel': try { await hlApi(`/integrations/${encodeURIComponent(x.dataset.id)}/${encodeURIComponent(x.dataset.key)}`, { method: 'DELETE' }); IG.open = null; await integLoad24(true); flash('Verdien er fjernet'); } catch (err) { flash(err.message); } draw(); return true;
    case 'igtest': { const id = x.dataset.id; IG.test[id] = 'Tester …'; draw(); try { const r = await hlApi(`/integrations/${encodeURIComponent(id)}/test`, { method: 'POST' }); IG.test[id] = `${r?.ok === false ? '✕ ' : '✓ '}${r?.message ?? (r?.ok === false ? 'Feilet' : 'Tilkoblingen virker')}`; } catch (err) { IG.test[id] = `✕ ${err.message}`; } await integLoad24(true); draw(); return true; }
    // Bursdager
    case 'bdadd': BD.add = !BD.add; BD.editId = null; BD.f = f0(); draw(); if (BD.add) setTimeout(() => document.querySelector('[data-p24in="bdf"][data-k="name"]')?.focus(), 30); return true;
    case 'bdx': BD.add = false; BD.editId = null; draw(); return true;
    case 'bdrel': BD.f.relation = x.dataset.v; draw(); return true;
    case 'bdrem': BD.f.reminderDays = x.dataset.v === '' ? null : +x.dataset.v; draw(); return true;
    case 'bddest': BD.f.saveTo = x.dataset.v; draw(); return true;
    case 'bdsel': BD.sel = BD.sel === x.dataset.id ? null : x.dataset.id; BD.delArm = null; haptic('tab'); draw(); return true;
    case 'bdedit': { const p = people().find((y) => String(y.id) === x.dataset.id); if (!p) return true; BD.add = true; BD.editId = p.id; BD.f = { name: p.name, day: String(p.D), month: String(p.M), year: p.year ? String(p.year) : '', relation: p.rel, reminderDays: p.rem, saveTo: p.src }; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); return true; }
    case 'bdprem': {
      const id = x.dataset.id, v = x.dataset.v === '' ? null : +x.dataset.v;
      if (BD.local) { localPut(localGet().map((y) => (String(y.id) === id ? { ...y, reminderDays: v } : y))); await bdWrite(async () => {}); return true; }
      await bdWrite(() => hlApi(`/birthdays/${encodeURIComponent(id)}`, { method: 'PATCH', json: { reminderDays: v } })); return true;
    }
    case 'bddel': {
      const id = x.dataset.id, p = people().find((y) => String(y.id) === id);
      if (BD.delArm !== id) { BD.delArm = id; clearTimeout(armT); armT = setTimeout(() => { BD.delArm = null; draw(); }, 2500); draw(); return true; }
      BD.delArm = null; BD.sel = null;
      if (BD.local) { localPut(localGet().filter((y) => String(y.id) !== id)); await bdWrite(async () => {}, `${p?.name ?? 'Bursdagen'} er slettet`); return true; }
      await bdWrite(() => hlApi(`/birthdays/${encodeURIComponent(id)}`, { method: 'DELETE' }), `${p?.name ?? 'Bursdagen'} er slettet`); return true;
    }
    case 'glogin': {
      if (BD.d?.google?.configured === false) { flash('Admin må legge inn Google-klienten under Innstillinger → Integrasjoner'); return true; }
      const ret = `${location.origin}/finans/#/bd`;
      try { const r = await hlApi('/birthdays/google/start', { method: 'POST', json: { return: ret } }); location.href = r.url; }
      catch { location.href = `/api/birthdays/google/auth?return=${encodeURIComponent(ret)}`; }
      return true;
    }
    case 'gcal': await bdWrite(() => hlApi('/birthdays/google', { method: 'PUT', json: { calendarId: x.dataset.v, writeNew: BD.d?.google?.writeNew !== false, contacts: BD.d?.google?.contacts !== false } })); return true;
    case 'gtog': { const G = BD.d?.google ?? {}, kk = x.dataset.k, body = { calendarId: G.calendarId, writeNew: G.writeNew !== false, contacts: G.contacts !== false }; body[kk] = !body[kk]; await bdWrite(() => hlApi('/birthdays/google', { method: 'PUT', json: body })); return true; }
    case 'gsync': BD.busy = 'g'; draw(); await bdWrite(() => hlApi('/birthdays/google/sync', { method: 'POST' }), 'Synket med Google Kalender'); BD.busy = ''; draw(); return true;
    case 'glogout': BD.cals = null; await bdWrite(() => hlApi('/birthdays/google', { method: 'DELETE' }), 'Logget ut av Google'); return true;
    case 'haent': await bdWrite(() => hlApi('/birthdays/ha', { method: 'PUT', json: { entityId: x.dataset.v, twoWay: BD.d?.ha?.twoWay !== false } })); return true;
    case 'hatwo': await bdWrite(() => hlApi('/birthdays/ha', { method: 'PUT', json: { entityId: BD.d?.ha?.entityId, twoWay: !(BD.d?.ha?.twoWay !== false) } })); return true;
    case 'haimp': {
      BD.busy = 'ha'; draw();
      try { const r = await hlApi('/birthdays/ha/import', { method: 'POST' }); await bdLoad(true); const n = r?.added ?? r?.imported ?? r?.count; flash(n != null ? (n ? `${n} bursdager importert fra ${BD.d?.ha?.entityId ?? 'Home Assistant'}` : 'Ingen nye bursdager') : 'Importert fra Home Assistant'); } catch (err) { flash(err.message); }
      BD.busy = ''; draw(); return true;
    }
    // Ruter
    case 'rvstop': RV.sel = +x.dataset.i; RV.mode = 'Alle'; DEP.open = null; haptic('tab'); draw(); return true;
    case 'rvmode': RV.mode = x.dataset.v; haptic('tab'); draw(); return true;
    case 'rvref': await avgLoad(true); draw(); return true;
    case 'rvadd': AV.edit = true; AV.q = ''; AV.res = null; draw(); setTimeout(() => document.getElementById('p16-avq')?.focus(), 40); return true;
    // Boliger
    case 'bex': BE.id = null; draw(); return true;
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
