// Prompt 44 (PWA44): mobilpunktene i design_handoff_homelab/prompts/prompt-44-pakke/ (kontrakt CONTRACT44.md).
//   1. Mer ny (Mer Ny.dc.html): søk i moduler, 2 × 2 levende kort (Store) eller én liste (Lave), verktøy med levende
//      undertekst, Innstillinger nederst. Hold inne → wiggle, «–» skjuler, Store · Lave og Ferdig, «Vis N skjulte».
//   2. Gjøremål (Huskeliste.dc.html): ↳+ og deloppgaver rett i lista, «Fullfør X også?», infoside i Papir-stil
//      (Frist/Når, Detaljer, Deloppgaver, Sted med kart, fast Fullfør-knapp) og raden «Synk med Home Assistant».
//   3. Innstillinger → Gjøremål (HA-synk), Innstillinger → Homelab → Logger (mobile-p44l.js), Kontoer og brukere →
//      FAMILIE · LOGG INN SOM og SERVER · EIER (Mobil Papir App.dc.html asRows/ownRows), System → TIDLIGERE VERSJONER.
//   4. Glimt-tid i Hjem-søket: «time 12.5 16:30 kino dune.» → Kino dune 12. mai 16:30 (QAP.QP i fasiten).
//   5. Studie → Dokumenter (mobile-p44s.js) og Avspilling (mobile-p44a.js, også som fane i Media).
// Lastes med dynamisk import fra mobile.js (statiske importer herfra er trygge fordi resten allerede er evaluert).
// API-ene lages av SERVER44 samtidig: alt tåler 404 med en rolig tekst («Krever en nyere Homelab-server»).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { HK, tasksLoad, grp, row } from './mobile-p17.js';
import * as P28 from './mobile-p28.js';
import * as P37 from './mobile-p37.js';
import * as P22 from './mobile-p22.js';
import { MER_IC } from './mobile-p25.js';
import * as P30 from './mobile-p30.js';
import { U, watch } from '/assets/js/sysupdate.js';

const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  raw: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  put: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const svg = (d, s = 18, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const pad = (n) => String(n).padStart(2, '0');
const isoD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayIso = (n = 0) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return isoD(d); };
const isAdmin = () => m.me?.role === 'admin' || m.me?.isMainAdmin === true;
const meId = () => String(m.me?.id ?? '');
const first = (s) => String(s ?? '').trim().split(/\s+/)[0] || '';
const AVC = ['#3b5d8a', '#7a5ad6', '#2f6b4a', '#b23a2a', '#a0671a', '#c2477a', '#3d7f8a'];
const colOf = (id, c) => c || AVC[[...String(id ?? '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVC.length];
const NEWER = 'Krever en nyere Homelab-server';
const errMsg = (e) => (e?.status === 404 || e?.status === 405 ? NEWER : e?.message || 'Noe gikk galt');
let toastT = null;
/** Toast med valgfri Angre-knapp (egen, så den kan ha handling). */
const T44 = { t: '', undo: null };
function toast(t, undo = null, ms = 4500) { T44.t = t; T44.undo = undo; clearTimeout(toastT); toastT = setTimeout(() => { T44.t = ''; T44.undo = null; draw(); }, ms); draw(); }

/* =====================================================================
   1. Mer ny
   ===================================================================== */
const ME = { edit: false, q: '', lp: null, lpAt: 0, tsz: ls.raw('papir_mer_tsz') === 'lav' ? 'lav' : 'stor' };
const LIVE = { cal: null, calT: 0, bd: null, bdT: 0, fam: null, famT: 0, busy: {} };
// Fargebrikker fra fasiten (lys) – mørkt tema blander fargen inn i kortet.
const TILE_C = { saldo: '#2f6b4a', budsjett: '#b23a2a', kv: '#a0671a', fast: '#2b5d8a', aks: '#2f6b4a', finn: '#a0671a', dir: '#b23a2a', liste: '#6b665c', konto: '#2b5d8a', imp: '#7a5ad6', rap: '#6b665c', sok: '#2b5d8a', avspilling: '#e5a00d', kal: '#b23a2a', huske: '#2f6b4a', bd: '#7a5ad6', fam: '#b23a2a', chat: '#2b5d8a', media: '#a0671a', dom: '#2f6b4a', sub: '#2f6b4a', bibel: '#b23a2a', nyheter: '#6b665c', hjem: '#2b5d8a', spor: '#a0671a', brief: '#7a5ad6', hl: '#3d4652', studie: '#2b5d8a', set: '#6b665c' };
const TILES0 = { hl: ['kal', 'huske', 'bd', 'fam'], fin: ['saldo', 'budsjett', 'kv', 'fast'] };
/* Prompt 45 (claude-code-mer-tittel-og-store-bokser.md, claude-code-finans-mer-samme-design.md): seksjonstittelen kan skjules
   eller få nytt navn, og de fire store boksene kan byttes (⇄ → «Velg boks»). Finans → Mer bruker samme komponent (mode 'fin').
   Lagring per bruker: /api/me/layout pages.mer45<mode> = {order:[4 bokser], hidden:['_title'?]} + navnet lokalt (papir_mer45_<mode>). */
const MP = { hl: ls.get('papir_mer45_hl', {}) ?? {}, fin: ls.get('papir_mer45_fin', {}) ?? {} };
const mpSave = (mode, patch) => {
  MP[mode] = { ...MP[mode], ...patch }; ls.set(`papir_mer45_${mode}`, MP[mode]);
  const P = MP[mode]; hlApi('/me/layout', { method: 'PUT', json: { pages: { [`mer45${mode}`]: { order: (P.tiles ?? TILES0[mode]).filter((k) => /^[\w.-]{1,40}$/.test(k)), hidden: P.titleOff ? ['_title'] : [] } } } }).catch(() => {});
};
export function merTake45(pages) { for (const mode of ['hl', 'fin']) { const v = pages?.[`mer45${mode}`]; if (!v) continue; MP[mode] = { ...MP[mode], tiles: Array.isArray(v.order) && v.order.length === 4 ? v.order : MP[mode].tiles, titleOff: (v.hidden ?? []).includes('_title') }; ls.set(`papir_mer45_${mode}`, MP[mode]); } }
const tilesOf = (mode) => { const t = MP[mode]?.tiles; return Array.isArray(t) && t.length === 4 ? t : TILES0[mode]; };
const TITLE0 = { hl: 'HVERDAG OG FAMILIE', fin: 'FINANS' };
const titleOf = (mode) => (MP[mode]?.titleOff ? '' : String(MP[mode]?.title || TITLE0[mode]).toUpperCase());
/* Finans → Mer: skjulte lagres separat (papir_fmer_hid + /api/prefs/mer?scope=fin). */
const FKEY = { konto: 'kontoer', budsjett: 'budsjett', kv: 'kvitt', fast: 'faste', aks: 'aksjer', finn: 'finn', dir: 'boliger', sub: 'abo', liste: 'fliste', imp: 'fimport', rap: 'rapp', sok: 'fsok' };
const FBACK = Object.fromEntries(Object.entries(FKEY).map(([a, b]) => [b, a]));
const FH = { h: ls.get('papir_fmer_hid', []) ?? [], loaded: false };
function fhLoad() { if (FH.loaded) return; FH.loaded = true; hlApi('/prefs/mer?scope=fin').then((r) => { if (Array.isArray(r?.h) && r.updated) { FH.h = r.h.map((k) => FBACK[k] ?? k); ls.set('papir_fmer_hid', FH.h); if (m.screen === 'fmer') draw(); } }).catch(() => {}); }
const fhSave = () => { ls.set('papir_fmer_hid', FH.h); hlApi('/prefs/mer?scope=fin', { method: 'PUT', json: { o: [], h: FH.h.map((k) => FKEY[k]).filter(Boolean) } }).catch(() => {}); };
const SW = { open: false, i: 0, mode: 'hl' };
async function liveLoad(key, fn, max = 300000) {
  if (LIVE.busy[key] || Date.now() - (LIVE[`${key}T`] ?? 0) < max) return;
  LIVE.busy[key] = true;
  try { LIVE[key] = await fn(); } catch { LIVE[key] ??= { err: true }; }
  LIVE[`${key}T`] = Date.now(); LIVE.busy[key] = false;
  if (m.screen === 'mer') draw();
}
function merLive() {
  liveLoad('cal', async () => { const r = await hlApi(`/kalender?from=${dayIso(0)}&to=${dayIso(21)}`); return { ev: r?.events ?? [] }; });
  liveLoad('bd', async () => { const r = await hlApi('/birthdays'); return { items: r?.items ?? (Array.isArray(r) ? r : []) }; });
  liveLoad('fam', async () => { const r = await hlApi('/family'); return { members: r?.members ?? [] }; });
  if (!HK.d && !HK.busy) tasksLoad().then(() => { if (m.screen === 'mer') draw(); }).catch(() => {});
  try { const MD = globalThis.P43?.media; if (MD?.widgetLoad && !MD.MW?.t) MD.widgetLoad().then(() => { if (m.screen === 'mer') draw(); }).catch(() => {}); } catch {}
}
const hm = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }); };
function dayWord(k) {
  const n = Math.round((new Date(`${k}T12:00`) - new Date(`${dayIso(0)}T12:00`)) / 864e5);
  return n === 0 ? 'I dag' : n === 1 ? 'I morgen' : new Date(`${k}T12:00`).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/^./, (c) => c.toUpperCase());
}
/** Levende innhold per kort: {k, v, s, row} (row = undertekst i Lave/liste). */
function liveOf(key) {
  if (key === 'kal') {
    const ev = (LIVE.cal?.ev ?? []).filter((e) => !['media', 'bursdag', 'abonnement', 'fri'].includes(e.type) && !['media', 'birthdays', 'abonnementer'].includes(e.source) && e.kind !== 'bursdag');
    const now = Date.now();
    const nx = ev.map((e) => { const k = String(e.date ?? e.start ?? '').slice(0, 10), t = e.allDay ? null : (e.time ?? (String(e.start ?? '').length > 10 ? hm(e.start) : null)); const at = t ? Date.parse(`${k}T${t}`) : Date.parse(`${k}T23:59`); return { e, k, t, at }; })
      .filter((x) => x.k && x.at >= now).sort((a, b) => a.at - b.at)[0];
    if (!LIVE.cal) return { k: 'Neste', v: '…', s: '', row: 'Henter …' };
    if (!nx) return { k: '', v: '', s: 'Ingen hendelser i dag', row: 'Ingen hendelser i dag' };
    const w = dayWord(nx.k), tt = String(nx.e.title ?? 'Hendelse');
    return { k: 'Neste', v: tt, s: `${w}${nx.t ? ` · ${nx.t}` : ''}`, row: `Neste: ${tt} · ${w.toLowerCase()}${nx.t ? ` ${nx.t}` : ''}` };
  }
  if (key === 'huske') {
    if (!HK.d) return { k: '', v: '…', s: 'åpne for familien', row: 'Henter …' };
    const n = (HK.d.items ?? []).filter((x) => !x.done && !x.archived).length;
    return n ? { k: '', v: String(n), s: 'åpne for familien', row: `${n} åpne for familien`, big: true } : { k: '', v: '0', s: 'Alt er gjort', row: 'Alt er gjort', big: true };
  }
  if (key === 'bd') {
    const it = (LIVE.bd?.items ?? []).filter((x) => x.daysLeft != null && x.daysLeft <= 30).sort((a, b) => a.daysLeft - b.daysLeft)[0];
    if (!LIVE.bd) return { k: 'Snart', v: '…', s: '', row: 'Henter …' };
    if (!it) return { k: '', v: '', s: 'Ingen bursdager de neste 30 dagene', row: 'Ingen bursdager de neste 30 dagene' };
    const w = it.daysLeft === 0 ? 'i dag' : it.daysLeft === 1 ? 'i morgen' : `om ${it.daysLeft} dager`;
    return { k: 'Snart', v: first(it.name), s: w, row: `${first(it.name)} ${w}` };
  }
  if (key === 'fam') {
    const M = LIVE.fam?.members ?? [];
    if (!LIVE.fam) return { k: '', v: '', s: 'Henter …', row: 'Henter …', av: [] };
    const home = M.filter((x) => /hjem/i.test(String(x.last?.zone ?? x.zone ?? x.last?.place ?? x.place ?? ''))).length;
    const has = M.some((x) => x.last && (x.last.zone || x.last.place || x.last.lat != null));
    const s = M.length < 2 ? 'Bare deg i familien ennå' : has ? `${home} av ${M.length} hjemme` : `${M.length} i familien`;
    return { k: '', v: '', s, row: s, av: M.slice(0, 4) };
  }
  if (ME.fin?.[key]) return ME.fin[key];
  const r = (ME.all ?? []).find((x) => x.k === key); // prompt 45: valgfri modul i en stor boks
  return r ? { k: '', v: '', s: r.s ?? '', row: r.s ?? '' } : null;
}
function toolSub(r) {
  if (r.k === 'media') {
    const MW = globalThis.P43?.media?.MW?.d; if (!MW) return r.s;
    const n = (MW.tor ?? []).filter((t) => t.st === 'dl' || t.state === 'downloading' || (t.pc != null && t.pc < 100)).length, nx = (MW.upc ?? [])[0];
    const a = [n ? `${n} lastes ned` : '', nx?.t ? `neste: ${nx.t}` : ''].filter(Boolean).join(' · ');
    return a || r.s;
  }
  return r.s;
}
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tint = (c) => `color-mix(in srgb, ${c} 14%, var(--pp-card))`;
const IC44 = { saldo: 'M3 7h18v12H3zM3 11h18M7 15h3', budsjett: 'M12 3a9 9 0 1 0 9 9h-9zM14 3.2V10h6.8', kv: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', fast: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', aks: 'M3 17l6-6 4 4 8-8M15 7h6v6', finn: 'M7 7h10l3 4-8 10L4 11zM4 11h16', dir: 'M3 11l9-7 9 7M5 10v10h14V10', liste: 'M4 6h16M4 12h16M4 18h10', konto: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18', imp: 'M12 3v12M7 10l5 5 5-5M5 21h14', rap: 'M4 20V10M10 20V4M16 20v-7M22 20H2', sok: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', avspilling: 'M4 5h16v11H4zM9 20h6M12 16v4M10 8.5v4l3.5-2z', studie: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6' };
const ic44 = (k, s = 30) => { const c = TILE_C[k] ?? '#6b665c'; return `<span class="p44-mi" style="width:${s}px;height:${s}px;background:${tint(c)};color:${c}">${svg(MER_IC[k] ?? IC44[k] ?? 'M12 12h.01', Math.round(s * 0.55), 2)}</span>`; };
const MINUS = '<span aria-hidden="true">–</span>';
/** rows = [[rute, navn, undertekst], …] fra paperMer() (Innstillinger sist). opt.mode 'fin' = Finans → Mer (prompt 45). */
export function merNew(rows, opt = {}) {
  const mode = opt.mode === 'fin' ? 'fin' : 'hl';
  if (ME.mode !== mode) { ME.mode = mode; ME.edit = false; ME.q = ''; ME.ttlEd = false; }
  ME.rows = rows; ME.fin = opt.live ?? null; ME.opt = opt;
  if (mode === 'hl') merLive(); else fhLoad();
  const split = mode === 'hl' ? P28.merSplit(rows) : { vis: rows.filter((r) => r.k === 'set' || !FH.h.includes(r.k)), hid: rows.filter((r) => r.k !== 'set' && FH.h.includes(r.k)) };
  const { vis, hid } = split; ME.all = [...vis, ...hid];
  const ed = ME.edit, lav = ME.tsz === 'lav', q = norm(ME.q.trim());
  const hit = (...a) => !q || norm(a.join(' ')).includes(q);
  const setR = vis.find((r) => r.k === 'set') ?? { k: 'set', n: 'Innstillinger', s: 'Tema, bakgrunn og konto' };
  const mods = vis.filter((r) => r.k !== 'set'), T4 = tilesOf(mode);
  const tiles = lav ? [] : T4.map((k) => mods.find((r) => r.k === k)).filter(Boolean).map((r) => ({ ...r, L: liveOf(r.k) ?? { k: '', v: '', s: r.s, row: r.s } })).filter((r) => hit(r.n, r.L.v, r.L.s));
  const tools = mods.filter((r) => lav || !T4.includes(r.k)).map((r) => ({ ...r, sub: T4.includes(r.k) ? (liveOf(r.k)?.row ?? r.s) : toolSub(r) })).filter((r) => hit(r.n, r.sub));
  const an = (j) => (ed ? ` style="animation-delay:${(j % 3) * -0.1}s"` : '');
  const href = (r) => `#/${r.href ?? r.k}`;
  const tile = (r, j) => { const L = r.L;
    const av = r.k === 'fam' && L.av?.length ? `<span class="p44-avs">${L.av.map((p, i) => `<i style="background:${colOf(p.userId, p.color)};margin-left:${i ? -8 : 0}px">${esc(String(p.name ?? '?').slice(0, 1).toUpperCase())}</i>`).join('')}</span>` : '';
    return `<${ed ? 'div' : 'a'} class="p44-mt${ed ? ' wig' : ''}" ${ed ? '' : `href="${href(r)}"`} data-p44mk="${r.k}"${an(j)}>${ed ? `<button type="button" class="p44-mx" data-p44="merhide" data-k="${r.k}" aria-label="Skjul ${esc(r.n)}">${MINUS}</button><button type="button" class="p45-mswap" data-p44="merswap" data-i="${T4.indexOf(r.k)}" aria-label="Bytt ${esc(r.n)} med en annen modul" title="Bytt">⇄</button>` : ''}
      <span class="p44-mth">${ic44(r.k)}<b>${esc(r.n)}</b></span>
      <span class="p44-mtb">${L.k ? `<small>${esc(L.k)}</small>` : ''}${L.v ? `<b class="p44-mtv${L.big ? ' big' : ''}">${esc(L.v)}</b>` : ''}${L.s ? `<small>${esc(L.s)}</small>` : ''}${av}</span></${ed ? 'div' : 'a'}>`; };
  const trow = (r, j) => `<${ed ? 'div' : 'a'} class="p44-mr${ed ? ' wig' : ''}" ${ed ? '' : `href="${href(r)}"`} data-p44mk="${r.k}"${an(j + 4)}>${ed ? `<button type="button" class="p44-mx red" data-p44="merhide" data-k="${r.k}" aria-label="Skjul ${esc(r.n)}">${MINUS}</button>` : ''}${ic44(r.k, 34)}<span class="m-grow"><b class="pp-serif">${esc(r.n)}</b><small>${esc(r.sub)}</small></span><span class="p44-chev" aria-hidden="true">›</span></${ed ? 'div' : 'a'}>`;
  const seg = `<span class="p44-seg" role="radiogroup" aria-label="Kortstørrelse">${[['stor', 'Store'], ['lav', 'Lave']].map(([k, n]) => `<button type="button" role="radio" aria-checked="${ME.tsz === k}" class="${ME.tsz === k ? 'on' : ''}" data-p44="mertsz" data-k="${k}">${n}</button>`).join('')}</span>`;
  const T = titleOf(mode);
  // Tittelen under søket: i wiggle med (−) for å skjule og trykk på teksten for å gi nytt navn; skjult → «+ Legg til tittel».
  const ttlEd = ed && !lav ? (T ? (ME.ttlEd ? `<form class="p45-mtf" data-p44f="merttl"><input id="p45-merttl" data-p44in="merttl" value="${esc(MP[mode]?.title || TITLE0[mode])}" maxlength="40" enterkeyhint="done" aria-label="Navn på tittelen" autocomplete="off"><button type="submit" class="p44-done">OK</button></form>` : `<span class="p45-mtw"><button type="button" class="p44-mx red p45-mtx" data-p44="merttloff" aria-label="Skjul tittelen">${MINUS}</button><button type="button" class="p44-lab p45-mtn" data-p44="merttled" title="Trykk for å gi nytt navn">${esc(T)}</button></span>`) : '<button type="button" class="p45-mtadd" data-p44="merttlon">+ Legg til tittel</button>') : '';
  const head = ed ? `<div class="p44-mh">${lav ? '<span></span>' : ttlEd}<span class="p44-mhr">${seg}<button type="button" class="p44-done" data-p44="merdone">Ferdig</button></span></div>`
    : lav || !T ? '' : `<div class="p44-mh"><span class="p44-lab">${esc(T)}</span></div>`;
  const empty = q && !tiles.length && !tools.length ? `<div class="p44-mempty">Ingen moduler heter «${esc(ME.q.trim())}».</div>` : '';
  const setHref = opt.setHref ?? '#/set';
  return `<div class="p44-mer${ed ? ' ed' : ''}${mode === 'fin' ? ' p45-fmer' : ''}">
    <label class="p44-msrch">${svg('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', 16, 2.2)}<input id="p44-merq" data-p44in="merq" value="${esc(ME.q)}" placeholder="Søk i moduler" autocomplete="off" enterkeyhint="search" aria-label="Søk i moduler">${ME.q ? '<button type="button" class="p44-mclr" data-p44="merclr" aria-label="Tøm søket">×</button>' : ''}</label>
    ${head}
    ${tiles.length ? `<div class="p44-mtiles">${tiles.map(tile).join('')}</div>` : ''}
    ${!lav && tools.length ? `<div class="p44-mh tl"><span class="p44-lab">${mode === 'fin' ? 'VERKTØY' : 'VERKTØY'}</span></div>` : ''}
    ${tools.length ? `<div class="p44-mlist">${tools.map(trow).join('')}</div>` : ''}${empty}
    ${hit(setR.n, setR.s) ? `<a class="p44-mset" href="${setHref}">${svg('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z', 18, 1.8)}<span class="m-grow"><b>${esc(setR.n)}</b><small>${esc(setR.s)}</small></span><span class="p44-chev" aria-hidden="true">›</span></a>` : ''}
    ${ed && hid.length ? `<button type="button" class="p44-mshow" data-p44="mershow">Vis ${hid.length} skjulte</button>` : ''}
    ${ed ? '' : `<span class="p44-mhint">Hold inne for å skjule moduler, bytte de store boksene eller velge Store · Lave.</span>`}</div>`;
}
/** Bunnarket «Velg boks»: alle moduler med ikon og forhåndsvisning. Valgt modul har hake. */
function swapSheet() {
  if (!SW.open || !ME.all) return '';
  const T4 = tilesOf(SW.mode), cur = T4[SW.i];
  const L = ME.all.filter((r) => r.k !== 'set');
  return `<div class="p44-scrim" data-p44="swapx"></div><div class="pp-sheet p45-swap" role="dialog" aria-modal="true" aria-label="Velg boks"><span class="pp-grab"></span>
    <div class="p45-swh"><b class="pp-sh">Velg boks</b><button type="button" class="p44-done" data-p44="swapx">Ferdig</button></div><span class="pp-mut">Velg hva den ${['første', 'andre', 'tredje', 'fjerde'][SW.i] ?? ''} store boksen skal vise.</span>
    <div class="p45-swl">${L.map((r) => { const on = r.k === cur, used = !on && T4.includes(r.k), Lv = liveOf(r.k); return `<button type="button" class="p45-swr${on ? ' on' : ''}" data-p44="merpick" data-k="${esc(r.k)}" aria-pressed="${on}">${ic44(r.k, 34)}<span class="m-grow"><b>${esc(r.n)}</b><small>${esc(Lv?.row || Lv?.s || r.s || '')}${used ? ' · i en annen boks' : ''}</small></span>${on ? '<span class="p45-swck" aria-hidden="true">✓</span>' : ''}</button>`; }).join('')}</div></div>`;
}
/** Søk mens man skriver: bytt bare innholdet under søkefeltet (feltet beholder fokus, ingen ny tegning av hele appen). */
function merPatch() {
  const w = document.querySelector('#app .p44-mer'); if (!w || !ME.rows) { draw(); return; }
  const tmp = document.createElement('div'); tmp.innerHTML = merNew(ME.rows, ME.opt ?? {});
  const nw = tmp.firstElementChild; if (!nw) return;
  [...w.children].slice(1).forEach((c) => c.remove());
  [...nw.children].slice(1).forEach((c) => w.appendChild(c));
  const lab = w.firstElementChild, clr = lab.querySelector('.p44-mclr'), want = !!ME.q;
  if (want && !clr) lab.insertAdjacentHTML('beforeend', '<button type="button" class="p44-mclr" data-p44="merclr" aria-label="Tøm søket">×</button>'); else if (!want && clr) clr.remove();
}
function merDown(e) {
  if ((m.screen !== 'mer' && m.screen !== 'fmer') || ME.edit || (e.button ?? 0) > 0) return;
  const r = e.target.closest?.('[data-p44mk]'); if (!r || e.target.closest('button')) return;
  clearTimeout(ME.lp?.t);
  ME.lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { ME.lp = null; ME.edit = true; ME.lpAt = Date.now(); haptic('tab'); vib(12); draw(); }, 480) };
}
function merMove(e) { if (ME.lp && (Math.abs(e.clientX - ME.lp.x) > 8 || Math.abs(e.clientY - ME.lp.y) > 8)) { clearTimeout(ME.lp.t); ME.lp = null; } }
function merUp() { if (ME.lp) { clearTimeout(ME.lp.t); ME.lp = null; } }

/* =====================================================================
   2. Gjøremål: deloppgaver i lista og infosiden
   ===================================================================== */
const VW = { id: null, menu: false, list: false, subV: '', addFor: null, addV: '', pl: null, sug: [], sugQ: '', geoBusy: false, ask: null };
const byId = (id) => { const x = (HK.d?.items ?? []).find((y) => String(y.id) === String(id)); return x ? P37.T(x) : null; };
const listOf = (id) => P37.lists().find((l) => l.id === String(id)) ?? P37.lists()[0] ?? { id: '', name: 'Liste', color: '#1b1a17' };
const SUB_IC = 'M5 4v8a3 3 0 0 0 3 3h6M17 12v6M14 15h6';
/** Knappen ↳+ på raden (ved ✕). */
export const subBtn = (x) => `<button type="button" class="p37-ib p44-sb${VW.addFor === String(x.id) ? ' on' : ''}" data-p44="subadd" data-id="${esc(x.id)}" aria-label="Legg til deloppgave i ${esc(x.title)}" title="Legg til deloppgave">${svg(SUB_IC, 17, 2)}</button>`;
/** Deloppgavene innrykket under oppgaven + feltet «Ny deloppgave …». */
export function subRows(x, l) {
  const c = l?.color ?? '#1b1a17', open = VW.addFor === String(x.id);
  if (!x.subs.length && !open) return '';
  return `<div class="p44-subs" style="--c:${esc(c)}">${x.subs.map((u, i) => `<div class="p44-su${u.done ? ' done' : ''}"><button type="button" class="p44-sck" data-p44="subtick" data-id="${esc(x.id)}" data-i="${i}" aria-label="${u.done ? 'Angre' : 'Fullfør'} deloppgave ${esc(u.n)}">${u.done ? '✓' : ''}</button><span class="m-grow">${esc(u.n)}</span><button type="button" class="p44-srm" data-p44="subrm" data-id="${esc(x.id)}" data-i="${i}" aria-label="Fjern ${esc(u.n)}">✕</button></div>`).join('')}
    ${open ? `<form class="p44-saf" data-p44f="subadd" data-id="${esc(x.id)}"><span class="p44-sdash" aria-hidden="true"></span><input id="p44-sub-${esc(x.id)}" data-p44in="addv" value="${esc(VW.addV)}" placeholder="Ny deloppgave …" enterkeyhint="done" autocomplete="off" aria-label="Ny deloppgave"><button type="submit" class="p44-sadd">Legg til</button></form>` : ''}</div>`;
}
async function subPatch(id, fn) {
  const x = byId(id); if (!x) return null;
  const subs = fn(x.subs.map((u) => ({ ...u })));
  await P37.patchTask(id, { subs });
  return { x, subs };
}
async function subTick(id, i) {
  const r = await subPatch(id, (s) => s.map((u, j) => (j === i ? { ...u, done: !u.done } : u)));
  vib(6); haptic('tap');
  if (r && !r.x.done && r.subs.length && r.subs.every((u) => u.done)) { VW.ask = String(id); draw(); }
}
function askSheet() {
  const x = VW.ask && byId(VW.ask); if (!x) { VW.ask = null; return ''; }
  return `<div class="p44-scrim" data-p44="askx"></div><div class="pp-sheet p44-ask" role="dialog" aria-modal="true" aria-label="Fullfør oppgaven"><span class="pp-grab"></span>
    <b class="pp-sh">Fullfør «${esc(x.title)}» også?</b><span class="pp-mut">Alle deloppgavene er krysset av.</span>
    <div class="p44-row2"><button type="button" class="pp-btn" data-p44="askx">Ikke nå</button><button type="button" class="pp-btn ink" data-p44="askok">Fullfør</button></div></div>`;
}
async function complete(id, on = true) {
  const x = byId(id); if (!x) return;
  const patch = { done: on, doneAt: on ? Date.now() : null };
  if (on && x.subs.some((u) => !u.done)) patch.subs = x.subs.map((u) => ({ ...u, done: true }));
  await P37.patchTask(id, patch); vib(8); haptic(on ? 'ok' : 'tap');
  if (on && x.rep && x.rep !== 'aldri') { HK.t = 0; await tasksLoad(true).catch(() => {}); draw(); }
}
/* Infosiden */
export const vwOpen = (id) => { VW.id = String(id); VW.menu = false; VW.list = false; VW.subV = ''; VW.pl = null; VW.sug = []; haptic('tap'); try { document.activeElement?.blur?.(); } catch {} draw(); };
export const vwOn = () => m.screen === 'huske' && !!VW.id && !!byId(VW.id);
const DL_DAY = (k) => new Date(`${k}T12:00`).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase());
function whenTxt(k) {
  const n = Math.round((new Date(`${k}T12:00`) - new Date(`${dayIso(0)}T12:00`)) / 864e5);
  return n === 0 ? 'I dag' : n === 1 ? 'I morgen' : n === -1 ? 'I går' : new Date(`${k}T12:00`).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/^./, (c) => c.toUpperCase());
}
const geoOf = (x) => { const g = x.geo ?? x.raw?.geo ?? null; return g && g.lat != null && g.lon != null ? g : null; };
// Stedet lagres som geo {lat, lon, label} (tasks.js, prompt 44); fritekst uten koordinater huskes på enheten (pl).
const plOf = (x) => x.geo?.label || x.pl || x.placeName || '';
/** Kart som OSM-fliser (img-src https: er lov i CSP-en, iframe er ikke) med nål i midten. */
function mapHtml(g, label) {
  const z = 15, n = 2 ** z, fx = ((g.lon + 180) / 360) * n, lr = (g.lat * Math.PI) / 180, fy = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy), px = fx * 256, py = fy * 256, tiles = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) { const x = tx + dx, y = ty + dy; tiles.push(`<img src="https://tile.openstreetmap.org/${z}/${x}/${y}.png" alt="" loading="lazy" style="left:calc(50% + ${Math.round(x * 256 - px)}px);top:calc(50% + ${Math.round(y * 256 - py)}px)">`); }
  const q = encodeURIComponent(label || `${g.lat},${g.lon}`);
  return `<div class="p44-map" role="img" aria-label="Kart over ${esc(label || 'stedet')}">${tiles.join('')}<span class="p44-pin">${svg('M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 7.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z', 30, 2)}</span><small class="p44-osm">© OpenStreetMap</small></div>
    <div class="p44-mapb"><a class="p44-pb ink" href="https://maps.apple.com/?q=${q}&amp;ll=${g.lat},${g.lon}" target="_blank" rel="noopener">Åpne i Kart</a><a class="p44-pb" href="https://www.google.com/maps/search/?api=1&amp;query=${g.lat},${g.lon}" target="_blank" rel="noopener">Google Maps</a></div>`;
}
function vwPage() {
  const x = byId(VW.id); if (!x) { VW.id = null; return ''; }
  const l = listOf(x.list), c = l.color || '#1b1a17', L = P37.lists();
  const dl = x.dl || null, over = dl && !x.done && dl < dayIso(0);
  const sd = x.subs.filter((u) => u.done).length, pl = VW.pl ?? plOf(x), g = geoOf(x);
  if (pl && !g && !VW.geoBusy && !x.raw?.geoTried) geoLookup(x, pl);
  const star = x.flag ? '★' : '☆';
  return `<div class="p44-vw" role="dialog" aria-modal="true" aria-label="Gjøremål ${esc(x.title)}" style="--c:${esc(c)}">
    <div class="p44-vtop"><button type="button" class="p44-vback" data-p44="vwback" data-p30close aria-label="Tilbake til Gjøremål">${svg('M15 5l-7 7 7 7', 14, 3.2)}Tilbake</button><span class="m-grow"></span>
      <button type="button" class="p44-rb star${x.flag ? ' on' : ''}" data-p44="vwflag" aria-pressed="${x.flag}" aria-label="${x.flag ? 'Fjern flagg' : 'Flagg'}">${star}</button>
      <button type="button" class="p44-rb" data-p44="vwmenu" aria-expanded="${VW.menu}" aria-label="Flere valg">${svg('M4 7h10M18 7h2M4 17h2M10 17h10M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 18, 2)}</button></div>
    ${VW.menu ? `<div class="p44-vmenu" role="menu"><button type="button" role="menuitem" data-p44="vwedit">Gjentakelse, påminnelse og mer …</button><button type="button" role="menuitem" data-p44="vwdup">Dupliser</button><button type="button" role="menuitem" class="red" data-p44="vwdel">Slett oppgaven</button></div>` : ''}
    <div class="p44-vbody">
      <div class="p44-vlw"><button type="button" class="p44-vlist" data-p44="vwlist" aria-expanded="${VW.list}"><i style="background:${esc(c)}"></i>${esc(l.name)}<span aria-hidden="true">▼</span></button>
        ${VW.list ? `<div class="p44-vlmenu" role="menu">${L.map((y) => `<button type="button" role="menuitemradio" aria-checked="${y.id === l.id}" data-p44="vwsetl" data-k="${esc(y.id)}"><i style="background:${esc(y.color)}"></i><span class="m-grow">${esc(y.name)}</span>${y.id === l.id ? '✓' : ''}</button>`).join('')}</div>` : ''}</div>
      <div class="p44-vt"><button type="button" class="p44-vck${x.done ? ' on' : ''}" data-p44="vwdone" aria-label="${x.done ? 'Angre fullført' : 'Fullfør oppgaven'}">${x.done ? '✓' : ''}</button><textarea id="p44-vn" class="p44-vn${x.done ? ' done' : ''}" data-p44in="vwtitle" rows="1" aria-label="Tittel">${esc(x.title)}</textarea></div>
      <div class="p44-vcards">
        <div class="p44-vc${over ? ' over' : ''}" data-p44="vwpick" data-k="dl" role="button" tabindex="0"><span class="p44-lab">FRIST</span><b>${dl ? `${esc(`Frist: ${DL_DAY(dl)}`)}${over ? ' · forfalt' : ''}` : 'Legg til'}</b><input type="date" class="p44-hid" id="p44-dl" data-p44in="vwdl" value="${esc(dl ?? '')}" tabindex="-1" aria-label="Frist">${dl ? '<button type="button" class="p44-vx" data-p44="vwclr" data-k="dl" aria-label="Fjern frist">✕</button>' : ''}</div>
        <div class="p44-vc" data-p44="vwpick" data-k="due" role="button" tabindex="0"><span class="p44-lab">NÅR</span><span class="p44-vwhen"><b>${x.due ? esc(whenTxt(x.due)) : 'Legg til'}</b>${x.due ? `<span class="p44-tp" data-p44="vwpick" data-k="time" role="button" tabindex="0">${esc(x.time || 'Legg til tid')}<input type="time" class="p44-hid" id="p44-tm" data-p44in="vwtime" value="${esc(x.time ?? '')}" tabindex="-1" aria-label="Klokkeslett"></span>` : ''}</span><input type="date" class="p44-hid" id="p44-due" data-p44in="vwdue" value="${esc(x.due ?? '')}" tabindex="-1" aria-label="Dato">${x.due ? '<button type="button" class="p44-vx" data-p44="vwclr" data-k="due" aria-label="Fjern dato">✕</button>' : ''}</div></div>
      <div class="p44-vcard"><span class="p44-lab">DETALJER</span><textarea id="p44-vnotes" class="p44-vnotes" data-p44in="vwnotes" rows="2" placeholder="Skriv notater, lenker eller hva som skal huskes …">${esc(x.notes)}</textarea></div>
      <div class="p44-vcard sub"><span class="p44-vsh"><span class="p44-lab">DELOPPGAVER</span>${x.subs.length ? `<span class="p44-mono">${sd} av ${x.subs.length}</span>` : ''}</span>
        ${x.subs.length ? `<span class="p44-bar"><i style="width:${Math.round((sd / x.subs.length) * 100)}%"></i></span>` : ''}
        ${x.subs.map((u, i) => `<div class="p44-vsu${u.done ? ' done' : ''}"><button type="button" class="p44-sck" data-p44="subtick" data-id="${esc(x.id)}" data-i="${i}" aria-label="${u.done ? 'Angre' : 'Fullfør'} ${esc(u.n)}">${u.done ? '✓' : ''}</button><span class="m-grow">${esc(u.n)}</span><button type="button" class="p44-srm" data-p44="subrm" data-id="${esc(x.id)}" data-i="${i}" aria-label="Fjern ${esc(u.n)}">✕</button></div>`).join('')}
        <form class="p44-vsf" data-p44f="vwsub"><span class="p44-sdash" aria-hidden="true"></span><input id="p44-vsub" data-p44in="vwsubv" value="${esc(VW.subV)}" placeholder="Legg til deloppgave" enterkeyhint="done" autocomplete="off" aria-label="Legg til deloppgave"><button type="submit" class="p44-vplus" aria-label="Legg til">+</button></form></div>
      <div class="p44-vcard pl"><span class="p44-lab">STED</span><span class="p44-vpl">${svg('M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 7.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z', 16, 2.2)}<input id="p44-vpl" data-p44in="vwpl" value="${esc(pl)}" placeholder="Legg til sted eller adresse" autocomplete="off" aria-label="Sted eller adresse">${pl ? '<button type="button" class="p44-vx s" data-p44="vwplclr" aria-label="Fjern sted">✕</button>' : ''}</span>
        ${VW.sug.length ? `<div class="p44-sug">${VW.sug.map((s, i) => `<button type="button" data-p44="vwplpick" data-i="${i}"><b>${esc(s.street || s.label)}</b><small>${esc([s.postcode, s.city].filter(Boolean).join(' ') || s.label)}</small></button>`).join('')}</div>` : ''}
        ${g ? mapHtml(g, pl) : VW.geoBusy ? '<span class="p44-mut s">Finner stedet på kartet …</span>' : ''}</div>
    </div>
    <div class="p44-vbot"><button type="button" class="p44-vgo${x.done ? ' undo' : ''}" data-p44="vwdone">${x.done ? 'Angre fullført' : 'Fullfør oppgaven'}</button></div></div>`;
}
/** Adresseforslag: GET /api/geo/address?q= (Kartverket, OSM som reserve – på serveren; CSP-en tillater ikke kall herfra). */
let sugT = null;
function plSuggest(q) {
  clearTimeout(sugT); VW.sugQ = q;
  if (q.trim().length < 3) { VW.sug = []; return; }
  sugT = setTimeout(async () => {
    let L = [];
    try { const r = await hlApi(`/geo/address?q=${encodeURIComponent(q)}`); L = Array.isArray(r) ? r : r?.items ?? []; }
    catch {}
    if (VW.sugQ !== q) return;
    VW.sug = L.slice(0, 5); draw();
  }, 280);
}
async function geoLookup(x, pl) {
  VW.geoBusy = true;
  try {
    let g = null;
    try { const r = await hlApi(`/geo/address?q=${encodeURIComponent(pl)}`); const a = (Array.isArray(r) ? r : r?.items ?? [])[0]; if (a?.lat != null) g = { lat: +a.lat, lon: +a.lon }; }
    catch {}
    if (x.raw) x.raw.geoTried = true;
    const it = (HK.d?.items ?? []).find((y) => String(y.id) === String(x.id)); if (it) it.geoTried = true;
    if (g) await P37.patchTask(x.id, { pl, geo: { ...g, label: pl } }, false);
  } catch {}
  VW.geoBusy = false; if (vwOn()) draw();
}
let vwTitleT = null, vwNotesT = null;
function pick(k) {
  const el = document.getElementById(k === 'dl' ? 'p44-dl' : k === 'time' ? 'p44-tm' : 'p44-due'); if (!el) return;
  try { if (el.showPicker) { el.showPicker(); return; } } catch {}
  try { el.focus(); el.click(); } catch {}
}
/** Raden «⇄ Synk med Home Assistant · Synket 20:41 · endres i Innstillinger → Gjøremål ›» (erstatter kortet i lista). */
export function haRow() {
  if (!isAdmin() || HK.local) return '';
  const d = P22.HA.d, on = !!d?.enabled;
  if (!P22.HA.t && !P22.HA.miss) P22.haLoad().then(() => { if (m.screen === 'huske') draw(); }).catch(() => {});
  const st = !d ? 'Av' : !on ? 'Av' : d.status === 'error' ? 'Feil' : d.syncedAt ? `Synket ${hm(d.syncedAt)}` : 'Kobler til …';
  return `<a class="p44-harow" href="#/set/huske"><span class="p44-hai" aria-hidden="true">⇄</span><span class="m-grow"><b>Synk med Home Assistant</b><small>${esc(st)} · endres i Innstillinger → Gjøremål</small></span><span class="p44-chev" aria-hidden="true">›</span></a>`;
}

/* =====================================================================
   3a. Innstillinger → Gjøremål (HA-synk) og Homelab → Logger
   ===================================================================== */
export const setRowHuske = () => row('#/set/huske', 'Gjøremål', haSub(), '', 'list', 'huske');
function haSub() { const d = P22.HA.d; return `Synk med Home Assistant · ${d?.enabled ? 'på' : 'av'}`; }
export function homelabGroup() {
  if (!isAdmin()) return '';
  return grp('HOMELAB', [row('#/set/logger', 'Logger', 'Docker-logger, feil og feilsøking', '', 'list', 'logger')]);
}
export function huskeSet() {
  if (!HK.d) { tasksLoad().then(() => { if (m.screen === 'set') draw(); }).catch(() => {}); return '<div class="m-spin"></div>'; }
  if (!isAdmin()) return '<div class="snote">Synk med Home Assistant settes opp av administrator.</div>';
  if (!P22.HA.t && !P22.HA.miss) P22.haLoad().then(() => { if (m.screen === 'set') draw(); }).catch(() => {});
  if (P22.HA.miss) return `<div class="snote">${NEWER}: Home Assistant-synk for Gjøremål finnes ikke på denne serveren.</div>`;
  return `<div class="p44-hset">${P22.haSection()}</div><a class="opt-row p17-row p44-hlink" href="#/huske"><span class="m-grow p17-rt"><b>Åpne Gjøremål</b><small>Listene som synkes</small></span><span class="p17-chev" aria-hidden="true">›</span></a>`;
}
let LOGM = null;
export function loggerSet() {
  if (!isAdmin()) return '<div class="snote">Loggene er serverinfrastruktur og vises bare for administrator.</div>';
  if (!LOGM) { import('./mobile-p44l.js').then((x) => { LOGM = x; draw(); }).catch((e) => console.warn('mobile-p44l', e)); return '<div class="m-spin"></div>'; }
  return LOGM.logView();
}

/* =====================================================================
   3b. Kontoer og brukere: Logg inn som (impersonering) og Overfør eierskap
   ===================================================================== */
// Impersonering: POST /api/admin/impersonate {userId} → {token, expiresAt, user}. Tokenet (30 min, fornyes ved aktivitet)
// sendes som Authorization: Bearer på alle /api-kall mens man er logget inn som X. Admin-økten (informasjonskapselen)
// beholdes, så «Gå ut» bare forkaster X-tokenet. Lagres i localStorage («papir_as») så det overlever innlasting.
const AS_K = 'papir_as';
const AS = { users: null, uT: 0, pick: null, lay: {}, busy: false, own: null, ownD: null, ownT: 0, ownErr: '' };
export const asCur = () => { const a = ls.get(AS_K); if (!a?.token && !a?.cookie) return null; if (a.exp && Date.parse(a.exp) < Date.now() - 5 * 60e3 && Date.now() - (a.seen ?? 0) > 30 * 60e3) { ls.set(AS_K, null); return null; } return a; };
const realFetch = globalThis.fetch.bind(globalThis);
function fetchWrap() {
  if (globalThis.__p44fetch) return; globalThis.__p44fetch = true;
  globalThis.fetch = (input, init = {}) => {
    const a = asCur();
    try {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      const same = url.startsWith('/') ? !url.startsWith('//') : url.startsWith(location.origin);
      const path = same ? new URL(url, location.origin).pathname : '';
      if (a?.token && same && /^\/(api|finans\/api)\//.test(path) && !/^\/api\/admin\/impersonate/.test(path) && !/^\/api\/auth\//.test(path)) {
        const h = new Headers(init.headers ?? (typeof input !== 'string' ? input.headers : undefined) ?? {});
        if (!h.has('authorization')) h.set('authorization', `Bearer ${a.token}`);
        const meth = String(init.method ?? (typeof input !== 'string' ? input.method : 'GET') ?? 'GET').toUpperCase();
        if (meth !== 'GET' && meth !== 'HEAD') { a.n = (a.n ?? 0) + 1; }
        a.seen = Date.now(); ls.set(AS_K, a);
        return realFetch(input, { ...init, headers: h }).then((res) => {
          const nt = res.headers.get('x-impersonation-token'); if (nt) { const b = asCur(); if (b) { b.token = nt; b.exp = res.headers.get('x-impersonation-expires') ?? b.exp; ls.set(AS_K, b); } }
          if (res.status === 401 && asCur()) { ls.set(AS_K, null); ls.set('papir_as_toast', { t: 'Innloggingen som familiemedlem er utløpt. Du er deg selv igjen.' }); setTimeout(() => location.reload(), 50); }
          return res;
        });
      }
    } catch {}
    return realFetch(input, init);
  };
}
async function usersLoad(force = false) {
  if (!force && AS.users && Date.now() - AS.uT < 60000) return;
  AS.uT = Date.now();
  let L = null;
  // /api/users har rolle og hovedadmin (admin ser alle); katalogen (/api/users/directory) har farge – slås sammen.
  try { const r = await hlApi('/users'); L = r?.users ?? (Array.isArray(r) ? r : null); } catch {}
  let dir = [];
  try { const r = await hlApi('/users/directory'); dir = Array.isArray(r) ? r : r?.users ?? r?.items ?? []; } catch {}
  if (!L) L = dir;
  L = L.map((u) => ({ ...(dir.find((d) => String(d.id) === String(u.id)) ?? {}), ...u, color: u.color ?? dir.find((d) => String(d.id) === String(u.id))?.color ?? null }));
  AS.users = L.map((u) => ({ id: String(u.id ?? u.userId), name: u.displayName ?? u.name ?? u.username ?? '', username: u.username ?? '', role: u.role ?? 'user', color: u.color ?? null, owner: !!(u.owner ?? u.isOwner ?? u.isMainAdmin), totp: u.totp ?? u.twoFactor ?? null, device: u.device ?? u.lastDevice ?? null, avatarUrl: u.avatarUrl ?? null }));
  if (m.screen === 'set') draw();
}
async function ownLoad(force = false) {
  if (!force && Date.now() - AS.ownT < 60000) return;
  AS.ownT = Date.now();
  try { AS.ownD = await hlApi('/server/owner'); AS.ownErr = ''; } catch (e) { AS.ownD = { miss: e.status === 404 }; AS.ownErr = e.status === 404 ? '' : e.message; }
  if (m.screen === 'set') draw();
}
async function layLoad(id) {
  try { AS.lay[id] = await hlApi(`/users/${encodeURIComponent(id)}/layout`); } catch (e) { AS.lay[id] = { miss: e.status === 404, err: e.status !== 404 ? e.message : '' }; }
  draw();
}
const fmtDate = (v) => { const d = new Date(v ?? ''); return isNaN(d) ? '' : d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }); };
const av = (u, s = 38) => `<span class="p44-av" style="width:${s}px;height:${s}px;background:${colOf(u.id, u.color)};font-size:${Math.round(s * 0.36)}px">${esc(String(u.name || '?').slice(0, 1).toUpperCase())}</span>`;
/** Gruppene øverst i Kontoer og brukere (Papir). */
export function kontoGroups() {
  usersLoad(); ownLoad();
  const a = asCur(), out = [];
  if (a) {
    out.push(grp(`LOGGET INN SOM ${String(a.name).toUpperCase()}`, [`<button type="button" class="opt-row p17-row" data-p44="asout"><span class="m-grow p17-rt"><b>Gå ut av ${esc(first(a.name))}</b><small>Tilbake til din egen bruker. Endringene er lagret.</small></span><span class="sval p44-red">Gå ut ›</span></button>`]));
  } else if (isAdmin()) {
    const others = (AS.users ?? []).filter((u) => u.id !== meId());
    const rows = others.map((u) => { const L = AS.lay[u.id]; if (!L) layLoad(u.id); const lk = !!L?.locked; return `<button type="button" class="opt-row p17-row" data-p44="aspick" data-id="${esc(u.id)}">${av(u, 34)}<span class="m-grow p17-rt"><b>${esc(u.name)}</b><small>${esc([u.device, u.role === 'admin' ? 'admin' : '', lk ? 'låst oppsett' : 'kan endre selv'].filter(Boolean).join(' · '))}</small></span><span class="sval p44-red">Velg ›</span></button>`; });
    out.push(grp('FAMILIE · LOGG INN SOM', rows.length ? rows : [`<div class="opt-row p17-row"><span class="m-grow p17-rt"><b>${AS.users ? 'Ingen andre brukere ennå' : 'Henter brukere …'}</b><small>Nye brukere legges til av admin i Homelab.</small></span></div>`]));
  }
  // SERVER · EIER (GET /api/server/owner → {owner:{id, name, since}, me:{isOwner, canTransfer, needsApproval}, pending:[…], candidates:[…]})
  const O = AS.ownD ?? {}, users = AS.users ?? [];
  const oid = String(O.owner?.id ?? O.ownerId ?? users.find((u) => u.owner)?.id ?? '');
  const on = O.owner?.name ?? O.ownerName ?? users.find((u) => u.id === oid)?.name ?? '';
  const isMe = O.me ? !!O.me.isOwner : !!oid && oid === meId(), canT = O.me ? !!O.me.canTransfer : isMe || isAdmin();
  if (on || users.length) {
    const since = O.owner?.since ?? O.since ?? null;
    const rows = [`<div class="opt-row p17-row"><span class="m-grow p17-rt"><b>Eier av serveren</b><small>${esc(`${on || 'Ukjent'}${isMe ? ' (deg)' : ''}${since ? ` · startet serveren ${fmtDate(since)}` : ''}`)}</small></span>${isMe ? '<span class="sval">Eier</span>' : ''}</div>`];
    for (const pend of [].concat(O.pending ?? [])) if (pend?.id) rows.push(`<div class="opt-row p17-row"><span class="m-grow p17-rt"><b>Venter på godkjenning</b><small>${esc(`${pend.by?.name ?? ''} vil overføre serveren til ${pend.to?.name ?? ''} · gyldig til ${fmtDate(pend.expiresAt)}`)}</small></span>${isMe ? `<button type="button" class="p44-sm" data-p44="ownok" data-id="${esc(pend.id)}">Godkjenn</button><button type="button" class="p44-sm red" data-p44="ownno" data-id="${esc(pend.id)}">Avslå</button>` : ''}</div>`);
    if (!a && canT) rows.push(`<button type="button" class="opt-row p17-row" data-p44="ownstart"><span class="m-grow p17-rt"><b>Overfør eierskap</b><small>${isMe ? 'Gi serveren til en annen bruker. Du blir admin.' : 'Eieren må godkjenne overføringen (gyldig i 48 t).'}</small></span><span class="sval p44-red">Overfør ›</span></button>`);
    out.push(grp('SERVER · EIER', rows));
  }
  return out.join('');
}
function asSheet() {
  const u = AS.pick && (AS.users ?? []).find((x) => x.id === AS.pick); if (!u || m.screen !== 'set') { AS.pick = null; return ''; }
  const L = AS.lay[u.id] ?? {}, lk = !!L.locked;
  const upd = L.updatedBy ? `Sist endret av ${L.updatedByName ?? L.updatedBy}${L.updatedAt ? ` · ${fmtDate(L.updatedAt)}` : ''}` : 'Hjem, fanelinje og Mer';
  return `<div class="sheet-bg" data-p44="asx"></div><div class="pp-sheet p44-ash" role="dialog" aria-modal="true" aria-label="${esc(u.name)}"><span class="pp-grab"></span>
    <div class="p44-ashh">${av(u, 52)}<span class="m-grow"><b class="pp-serif">${esc(u.name)}</b><small class="pp-mut">${esc([u.device, u.role === 'admin' ? 'Admin' : 'Bruker'].filter(Boolean).join(' · '))}</small></span><button type="button" class="p44-x" data-p44="asx" aria-label="Lukk">✕</button></div>
    <button type="button" class="p44-big red" data-p44="asgo" ${AS.busy || u.role === 'admin' || u.owner ? 'disabled' : ''}>${AS.busy ? 'Logger inn …' : `Logg inn som ${esc(first(u.name))}`}</button>
    <span class="pp-mut p44-c">${u.owner || u.role === 'admin' ? 'Du kan ikke logge inn som en annen admin eller eieren av serveren.' : 'Uten passord, fordi du er admin. Rediger som vanlig, trykk «Gå ut» når du er ferdig.'}</span>
    <div class="p44-card">
      <button type="button" class="p44-cr" data-p44="ascopy"><span class="m-grow"><b>${AS.copyArm === u.id ? 'Trykk igjen for å kopiere' : 'Kopier mitt oppsett hit'}</b><small>Erstatter oppsettet til ${esc(first(u.name))}</small></span></button>
      <button type="button" class="p44-cr" data-p44="asreset"><span class="m-grow"><b>${AS.resetArm === u.id ? 'Trykk igjen for å tilbakestille' : 'Tilbakestill til standard'}</b><small>${esc(upd)}</small></span></button>
      <button type="button" class="p44-cr" data-p44="aslock" role="switch" aria-checked="${!lk}"><span class="m-grow"><b>${esc(first(u.name))} kan endre selv</b><small>${lk ? `Av: oppsettet styres av ${esc(first(m.me?.name ?? 'deg'))}` : `På: ${esc(first(u.name))} kan endre selv`}</small></span><span class="p44-sw${lk ? '' : ' on'}"><i></i></span></button></div>
    ${L.miss ? `<span class="pp-mut p44-c">${NEWER} for å styre oppsettet til andre.</span>` : ''}</div>`;
}
async function asLogin(u) {
  AS.busy = true; draw();
  try {
    const prev = await hlApi(`/users/${encodeURIComponent(u.id)}/layout`).catch(() => null);
    const r = await hlApi('/admin/impersonate', { method: 'POST', json: { userId: u.id, web: true } });
    const token = r?.token ?? r?.accessToken; if (!token) throw new Error('Serveren ga ikke noe token');
    ls.set(AS_K, { token, exp: r?.expiresAt ?? null, id: u.id, name: r?.user?.name ?? u.name, color: colOf(u.id, r?.user?.color ?? u.color), admin: m.me?.name ?? 'admin', at: Date.now(), n: 0, seen: Date.now() });
    if (prev && !prev.miss) ls.set(`papir_as_prev_${u.id}`, prev);
    vib(15); haptic('ok');
    setTimeout(() => { location.hash = '#/hl'; location.reload(); }, 60);
  } catch (e) { AS.busy = false; flash(e.status === 403 && !/Homelab svarte/.test(e.message) ? e.message : e.status === 403 ? 'Bare admin kan logge inn som andre (og ikke som en annen admin eller eieren).' : errMsg(e)); draw(); }
}
async function asLogout() {
  const a = asCur(); if (!a) return;
  let r = null;
  try { const res = await realFetch('/api/admin/impersonate/exit', { method: 'POST', headers: { ...(a.token ? { authorization: `Bearer ${a.token}` } : {}), 'content-type': 'application/json' }, body: '{}' }); r = res.ok ? await res.json().catch(() => null) : null; } catch {}
  ls.set(AS_K, null);
  const n = r?.changes ?? a.n ?? 0;
  ls.set('papir_as_toast', { t: r?.message ?? `Logget ut av ${first(a.name)}${n ? ` · ${n} endring${n === 1 ? '' : 'er'} lagret` : ' · ingen endringer'}. Du er ${first(a.admin)} igjen.`, undo: n > 0 ? a.id : null, path: r?.undo?.path ?? null });
  setTimeout(() => { location.hash = '#/set/konto'; location.reload(); }, 60);
}
async function asUndo(id, path) {
  if (path || id) { try { await realFetch(path || `/api/users/${encodeURIComponent(id)}/layout/undo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then((x) => { if (!x.ok) throw Object.assign(new Error(`Homelab svarte ${x.status}`), { status: x.status }); }); toast('Endringene er angret.'); return; } catch (e) { if (e.status !== 404) { toast(errMsg(e)); return; } } }
  const prev = ls.get(`papir_as_prev_${id}`);
  if (!prev) { toast('Fant ikke oppsettet fra før.'); return; }
  try { await hlApi(`/users/${encodeURIComponent(id)}/layout`, { method: 'PUT', json: prev }); toast('Endringene er angret.'); } catch (e) { toast(errMsg(e)); }
}
const ownToU = () => { const id = AS.own?.to; const c = (AS.ownD?.candidates ?? []).find((x) => String(x.id) === id); return c ? { id, name: c.name ?? '' } : (AS.users ?? []).find((u) => u.id === id) ?? null; };
const ownOk = () => { const to = ownToU(), t = String(AS.own?.txt ?? '').trim().toLowerCase(); return !!(to && AS.own?.pw && (t === first(to.name).toLowerCase() || t === String(to.name).toLowerCase())); };
const ownBtn = () => { const b = document.querySelector('[data-p44="owngo"]'); if (b) { const ok = ownOk(); b.disabled = !ok; b.className = `p44-big${ok ? ' red' : ' off'}`; } };
/* Overfør eierskap: steg 1 velg bruker, steg 2 skriv navnet + passord (reauth < 5 min). */
function ownSheet() {
  const O = AS.own; if (!O || m.screen !== 'set') { AS.own = null; return ''; }
  const cand = AS.ownD?.candidates?.length ? AS.ownD.candidates.map((c) => ({ id: String(c.id), name: c.name ?? '', role: c.role, color: null, totp: c.totp, ok: c.eligible !== false, why: c.reason ?? '' })) : null;
  const users = cand ?? (AS.users ?? []).filter((u) => u.id !== meId()).map((u) => ({ ...u, ok: u.totp !== false, why: u.totp === false ? `${first(u.name)} må slå på 2FA først` : '' })), to = users.find((u) => u.id === O.to);
  const ok = !!(to && O.txt.trim().toLowerCase() === first(to.name).toLowerCase() || to && O.txt.trim().toLowerCase() === to.name.toLowerCase());
  const body = O.step === 1
    ? `<span class="pp-mut p44-c l">Den nye eieren får full kontroll: server, backup, brukere og fakturaer. Du blir admin og kan ikke ta eierskapet tilbake selv.</span>
      <div class="p44-card">${users.map((u) => `<button type="button" class="p44-cr" data-p44="ownto" data-id="${esc(u.id)}" aria-pressed="${O.to === u.id}">${av(u)}<span class="m-grow"><b class="pp-serif">${esc(u.name)}</b><small>${esc(`${u.role === 'admin' ? 'Admin' : 'Bruker · blir admin'}${u.ok ? '' : ` · ${u.why || 'kan ikke motta'}`}`)}</small></span><span class="p44-rad${O.to === u.id ? ' on' : ''}">${O.to === u.id ? '✓' : ''}</span></button>`).join('') || '<div class="p44-cr"><span class="m-grow"><b>Ingen andre brukere</b><small>Legg til en bruker først.</small></span></div>'}</div>
      <button type="button" class="p44-big${O.to ? ' ink' : ' off'}" data-p44="ownnext" ${O.to ? '' : 'disabled'}>Fortsett</button>`
    : `<span class="p44-c l">Skriv <b>${esc(first(to?.name))}</b> for å bekrefte, og passordet ditt.</span>
      <input class="sinp p44-in" id="p44-owntxt" data-p44in="owntxt" value="${esc(O.txt)}" placeholder="${esc(first(to?.name))}" autocomplete="off" aria-label="Navnet til mottakeren">
      <input class="sinp p44-in" id="p44-ownpw" data-p44in="ownpw" type="password" value="${esc(O.pw)}" placeholder="Passordet ditt" autocomplete="current-password" aria-label="Passord">
      ${O.err ? `<div class="upd-merr" role="alert">${esc(O.err)}</div>` : ''}
      <div class="p44-row2"><button type="button" class="pp-btn" data-p44="ownback">Tilbake</button><button type="button" class="p44-big${ok && O.pw ? ' red' : ' off'}" data-p44="owngo" ${ok && O.pw && !O.busy ? '' : 'disabled'}>${O.busy ? 'Overfører …' : `Overfør til ${esc(first(to?.name))}`}</button></div>`;
  return `<div class="sheet-bg" data-p44="ownx"></div><div class="pp-sheet p44-ash" role="dialog" aria-modal="true" aria-label="Overfør eierskap"><span class="pp-grab"></span>
    <div class="p44-ashh"><b class="pp-serif m-grow" style="font-size:26px">Overfør eierskap</b><button type="button" class="p44-x" data-p44="ownx" aria-label="Lukk">✕</button></div>${body}</div>`;
}
async function ownGo() {
  const O = AS.own; if (!O) return;
  const to = (AS.ownD?.candidates ?? []).map((c) => ({ id: String(c.id), name: c.name })).find((u) => u.id === O.to) ?? (AS.users ?? []).find((u) => u.id === O.to); if (!to) return;
  O.busy = true; O.err = ''; draw();
  try {
    const r = await hlApi('/server/owner/transfer', { method: 'POST', json: { toUserId: to.id, password: O.pw } });
    AS.own = null; vib([20, 40, 20]); haptic('ok'); AS.ownT = 0; ownLoad(true); usersLoad(true);
    toast(r?.message ? r.message : r?.pending || r?.status === 'pending' ? `Venter på at eieren godkjenner overføringen til ${first(to.name)} (gyldig i 48 t).` : `${first(to.name)} eier nå serveren. Du er fortsatt admin. ${first(to.name)} har fått e-post og varsel.`);
  } catch (e) { O.busy = false; O.err = e.status === 404 ? `${NEWER} for å overføre eierskap.` : e.status === 401 || (e.status === 403 && /passord|password|reauth|bekreftelsen/i.test(e.message)) ? 'Feil passord.' : e.message; draw(); }
}
/** Pillen øverst mens admin er logget inn som X. */
function asPill() {
  const a = asCur(); if (!a) return '';
  return `<div class="p44-aspill" role="status" style="--c:${esc(a.color ?? '#7a5ad6')}"><span class="p44-asi">${esc(String(a.name).slice(0, 1).toUpperCase())}</span><span>Logget inn som ${esc(first(a.name))}</span><button type="button" data-p44="asout">Gå ut</button></div>`;
}

/* =====================================================================
   3c. System → TIDLIGERE VERSJONER (Tidligere Versjoner.dc.html)
   ===================================================================== */
// Updateren eier versjonslista selv. GET /api/update/versions → [{version, date, notes, hasBackup, backupAt, dbSchema,
// compatible, current, previous, lost}], POST /api/update/rollback {version, restoreBackup, pauseAutoDays, password?}.
const RV = { d: null, t: 0, miss: false, err: '', to: null, opt: 'keep', pause: true, pw: '', busy: false, e2: '' };
async function verLoad(force = false) {
  if (RV.busy || (!force && Date.now() - RV.t < 60000)) return;
  RV.t = Date.now();
  try { let r; try { r = await hlApi('/update/versions'); } catch (e0) { if (e0.status !== 404) throw e0; r = await hlApi('/system/update/versions'); } RV.d = Array.isArray(r) ? r : r?.versions ?? r?.items ?? []; RV.err = ''; RV.miss = false; }
  catch (e) { RV.miss = e.status === 404; RV.err = RV.miss ? '' : e.message; RV.d ??= []; }
  if (m.screen === 'nordlys') draw();
}
const vDate = (v) => { const d = new Date(v ?? ''); if (isNaN(d)) return String(v ?? ''); const t = isoD(d) === dayIso(0); return t ? `i dag ${hm(d)}` : d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', ''); };
export function versionsSection() {
  if (!isAdmin()) return '';
  verLoad();
  if (RV.miss) return `<div class="p44-ver"><span class="n31-lab p44-vlab">TIDLIGERE VERSJONER</span><span class="p44-mut">${NEWER}: updateren har ikke versjonslista ennå.</span></div>`;
  const L = (RV.d ?? []).slice(0, 10);
  const rows = L.map((v) => { const cur = !!v.current;
    const tags = [v.previous ? '<span class="p44-tag">Forrige</span>' : '', v.hasBackup ? '<span class="p44-tag ok">Har backup</span>' : ''].join('');
    return `<div class="p44-vr${cur ? ' cur' : ''}"><span class="m-grow"><span class="p44-vrh"><b class="p44-mono">${esc(v.version)}</b><small>${esc(vDate(v.date))}</small>${tags}</span><small class="p44-vn1">${esc(String(Array.isArray(v.notes) ? v.notes[0] ?? '' : v.notes ?? '').split('\n')[0])}</small></span>${cur ? '<span class="p44-run">Kjører nå</span>' : `<button type="button" class="p44-inst" data-p44="rvpick" data-v="${esc(v.version)}">Installer</button>`}</div>`; }).join('');
  return `<div class="p44-ver"><span class="n31-lab p44-vlab">TIDLIGERE VERSJONER</span>
    ${RV.err ? `<span class="p44-mut">${esc(RV.err)}</span>` : !RV.d ? '<div class="m-spin"></div>' : L.length ? `<div class="n31-card p44-verl">${rows}</div>` : '<span class="p44-mut">Ingen tidligere versjoner er lagret ennå.</span>'}
    <span class="n31-note">Tilbakerulling bruker samme updater-container. Backup tas automatisk før hver oppdatering (de 5 siste beholdes).</span></div>`;
}
function rvSheet() {
  if (!RV.to || m.screen !== 'nordlys') return '';
  const v = (RV.d ?? []).find((x) => x.version === RV.to); if (!v) { RV.to = null; return ''; }
  const cur = (RV.d ?? []).find((x) => x.current), keepOk = v.compatible !== false, bk = !!v.hasBackup;
  if (!keepOk && RV.opt === 'keep' && bk) RV.opt = 'restore';
  const needPw = P30.UP.cfg && typeof P30.UP.cfg === 'object' && P30.UP.cfg.require_password === true;
  const opt = (k, t, s, ok) => `<button type="button" class="p44-opt${RV.opt === k ? ' on' : ''}" data-p44="rvopt" data-k="${k}" ${ok ? '' : 'disabled'} role="radio" aria-checked="${RV.opt === k}"><span class="p44-dot" aria-hidden="true"></span><span class="m-grow"><b>${esc(t)}</b><small class="${ok ? '' : 'warn'}">${esc(s)}</small></span></button>`;
  const bkAt = v.backupAt ? `${vDate(v.backupAt)}${String(v.backupAt).length > 10 ? '' : ''}` : vDate(v.date);
  const lost = v.lost ?? v.lostChanges ?? null;
  const canGo = (RV.opt === 'keep' ? keepOk : bk) && (!needPw || RV.pw) && !RV.busy;
  return `<div class="sheet-bg" data-p44="rvx"></div><div class="pp-sheet p44-rv" role="dialog" aria-modal="true" aria-label="Gå tilbake til ${esc(v.version)}"><span class="pp-grab"></span>
    <div class="p44-ashh"><b class="pp-serif m-grow" style="font-size:24px">Gå tilbake til Nordlys ${esc(v.version)}?</b><button type="button" class="p44-x" data-p44="rvx" aria-label="Lukk">✕</button></div>
    <div class="p44-opts" role="radiogroup">${opt('keep', 'Behold dataene mine', keepOk ? 'Bare programmet byttes. Gjøremål, hendelser og innstillinger blir som nå.' : `${cur?.version ?? 'Gjeldende versjon'} endret databasen. Du må gjenopprette backupen.`, keepOk)}
      ${opt('restore', `Gjenopprett backup fra ${bkAt}`, bk ? `Data tilbake til slik de var før oppdateringen.${lost ? ` Endringer etter det forsvinner: ${typeof lost === 'string' ? lost : Object.entries(lost).map(([k, n]) => `${n} ${k}`).join(', ')}.` : ' Endringer etter det forsvinner.'}` : 'Ingen backup for denne versjonen.', bk)}</div>
    <button type="button" class="p44-ck${RV.pause ? ' on' : ''}" data-p44="rvpause" role="checkbox" aria-checked="${RV.pause}"><span class="p44-cbx">${RV.pause ? '✓' : ''}</span>Slå av automatiske oppdateringer i 7 dager</button>
    ${needPw ? `<input class="sinp p44-in" type="password" id="p44-rvpw" data-p44in="rvpw" value="${esc(RV.pw)}" placeholder="Passord" autocomplete="current-password" aria-label="Passord">` : ''}
    ${RV.e2 ? `<div class="upd-merr" role="alert">${esc(RV.e2)}</div>` : ''}
    <button type="button" class="p44-big ${canGo ? 'red' : 'off'}" data-p44="rvgo" ${canGo ? '' : 'disabled'}>${RV.busy ? 'Starter …' : `Installer ${esc(v.version)}`}</button></div>`;
}
async function rvGo() {
  const v = RV.to; if (!v) return;
  RV.busy = true; RV.e2 = ''; draw();
  try {
    const body = { version: v, restoreBackup: RV.opt === 'restore', pauseAutoDays: RV.pause ? 7 : 0 };
    if (RV.pw) body.password = RV.pw;
    let r; try { r = await hlApi('/update/rollback', { method: 'POST', json: body }); } catch (e0) { if (e0.status !== 404) throw e0; r = await hlApi('/system/update/rollback', { method: 'POST', json: body }); }
    const cur = (RV.d ?? []).find((x) => x.current)?.version ?? '';
    U.prev = { sha: U.d?.installed?.sha ?? null, version: U.d?.installed?.version ?? null }; U.jobId = r?.id ?? r?.jobId ?? null;
    U.d = { ...(U.d ?? {}), running: true, status: { ...(U.d?.status ?? {}), id: U.jobId, state: 'downloading', step: 'downloading', error: null, startedAt: new Date().toISOString(), finishedAt: null } };
    try { localStorage.setItem('p30_upd_job', JSON.stringify({ from: cur, to: v, rollback: true, at: Date.now() })); } catch {}
    ls.set('p44_rv_done', { from: cur, to: v, pause: RV.pause, at: Date.now() });
    RV.to = null; RV.pw = ''; RV.busy = false; haptic('ok'); watch(); draw();
  } catch (e) {
    RV.busy = false;
    RV.e2 = e.status === 404 ? `${NEWER}: tilbakerulling finnes ikke ennå.` : (e.status === 401 || e.status === 403 || e.status === 428) && /passord|password|reauth/i.test(e.message ?? '') ? 'Feil passord, eller serveren krever passord.' : e.message;
    if (/passord|password/i.test(RV.e2) && P30.UP.cfg && typeof P30.UP.cfg === 'object') P30.UP.cfg.require_password = true;
    draw();
  }
}
/** Etter tilbakerulling: toast «Kjører Nordlys X · automatiske oppdateringer er av til …» + «Oppdater til Y igjen». */
function rvAfter() {
  const j = ls.get('p44_rv_done'); if (!j || Date.now() - j.at > 30 * 60e3) { if (j) ls.set('p44_rv_done', null); return; }
  const inst = U.d?.installed?.version ?? null;
  if (!inst || !String(inst).startsWith(String(j.to).replace(/^v/, ''))) return;
  ls.set('p44_rv_done', null);
  const till = new Date(Date.now() + 7 * 864e5).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '');
  toast(`Kjører Nordlys ${j.to}${j.pause ? ` · automatiske oppdateringer er av til ${till}` : ''}`, j.from ? { label: `Oppdater til ${j.from} igjen`, a: 'rvback', v: j.from } : null, 9000);
}

/* =====================================================================
   4. Glimt-tid i Hjem-søket («time 12.5 16:30 kino dune.»)
   ===================================================================== */
const MON = { jan: 1, januar: 1, feb: 2, februar: 2, mar: 3, mars: 3, apr: 4, april: 4, mai: 5, jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, des: 12, desember: 12 };
const WD = { mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6, søndag: 0, man: 1, tir: 2, ons: 3, tor: 4, fre: 5, lør: 6, søn: 0 };
const DUR = [[/frisør/i, 45], [/tannlege|lege|time hos/i, 60]];
/** Lokal tolkning av dato, tid og tittel. Brukes når den felles tolkeren ga «Avtale» eller ikke fant klokkeslettet. */
export function glimtTime(text, today = dayIso(0)) {
  let s = ` ${String(text ?? '').trim()} `;
  const t0 = new Date(`${today}T12:00`);
  let date = null, time = null;
  const take = (re, fn) => { const mm = s.match(re); if (mm) { const r = fn(mm); if (r !== false) { s = s.replace(mm[0], ' '); return true; } } return false; };
  // Tid: 16:30, 16.30 (bare når det ikke er en dato), kl 16, kl. 16.30, 1630 / 0930, 16h, «16» alene sist.
  take(/\s(?:kl\.?\s*)?([01]?\d|2[0-3]):([0-5]\d)(?=[\s.,;!?]|$)/i, (mm) => { time = `${pad(+mm[1])}:${mm[2]}`; });
  if (!time) take(/\skl\.?\s*([01]?\d|2[0-3])(?:[.:]([0-5]\d))?(?=[\s.,;!?]|$)/i, (mm) => { time = `${pad(+mm[1])}:${mm[2] ?? '00'}`; });
  if (!time) take(/\s([01]\d|2[0-3])([0-5]\d)(?=[\s.,;!?]|$)/, (mm) => { time = `${mm[1]}:${mm[2]}`; });
  if (!time) take(/\s([01]?\d|2[0-3])h(?=[\s.,;!?]|$)/i, (mm) => { time = `${pad(+mm[1])}:00`; });
  // Dato: 12.5, 12.05, 12/5, 12.5.2027, 12. mai, i dag, i morgen, i overmorgen, ukedag, neste uke.
  const ymd = (d, mo, y) => { let yy = y ? (+y < 100 ? 2000 + +y : +y) : t0.getFullYear(); let dd = new Date(yy, mo - 1, d, 12); if (!y && isoD(dd) < today) dd = new Date(yy + 1, mo - 1, d, 12); return dd.getMonth() === mo - 1 ? isoD(dd) : null; };
  take(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=[\s.,;!?]|$)/, (mm) => { if (+mm[2] > 12) return false; date = ymd(+mm[1], +mm[2], mm[3]); return date ? undefined : false; });
  if (!date) take(/\s(\d{1,2})\.?\s+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|aug|sept?|okt|nov|des)\.?(?=[\s.,;!?]|$)/i, (mm) => { date = ymd(+mm[1], MON[mm[2].toLowerCase()]); });
  if (!date) take(/\si\s+overmorgen\b/i, () => { date = dayIso(2); });
  if (!date) take(/\si\s+morgen\b/i, () => { date = dayIso(1); });
  if (!date) take(/\si\s+dag\b/i, () => { date = dayIso(0); });
  if (!date) take(/\s(?:på\s+|neste\s+)?(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?=[\s.,;!?]|$)/i, (mm) => { const w = WD[mm[1].toLowerCase()]; const d = new Date(t0); let n = (w - d.getDay() + 7) % 7; if (n === 0 || /neste/i.test(mm[0])) n = n || 7; d.setDate(d.getDate() + n); date = isoD(d); });
  if (!date) take(/\sneste\s+uke\b/i, () => { const d = new Date(t0); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); date = isoD(d); });
  if (!time && date) take(/\s([01]?\d|2[0-3])(?=[\s.,;!?]*$)/, (mm) => { time = `${pad(+mm[1])}:00`; });
  // Tittel = resten uten innledningsord og «hos».
  let title = s.replace(/\b(legg\s+til|book|ny|avtale|time)\b/gi, ' ').replace(/^\s*hos\s+/i, ' ').replace(/\s+/g, ' ').trim().replace(/^[\s.,;:–-]+|[\s.,;:–-]+$/g, '');
  if (/^\s*time\s+hos\s+/i.test(text) && !title) title = '';
  title = title ? title.charAt(0).toUpperCase() + title.slice(1) : '';
  const dur = (DUR.find(([re]) => re.test(text))?.[1]) ?? 60;
  const end = time ? (() => { const [h, mi] = time.split(':').map(Number), x = h * 60 + mi + dur; return `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`; })() : null;
  return { date, start: time, end, title };
}
/** Retter resultatet fra den felles tolkeren (quick-time.js) med den lokale: tittel etter dato/tid, 1630, kl 16, 16h. */
export function fixQuick(text, r) {
  try {
    const g = glimtTime(text, r?.today ?? dayIso(0));
    if (!g.date && !r?.date) return r;
    const out = { ...(r ?? {}) };
    if (!out.date && g.date) out.date = g.date;
    if (!out.start && g.start) { out.start = g.start; out.end = g.end; }
    if ((!out.title || out.title === 'Avtale' || /^\d/.test(out.title)) && g.title) out.title = g.title;
    if (out.date && (out.start || /\btime\b|avtale|frisør|lege|tannlege|møte|kino/i.test(text))) { out.ok = true; out.isAppointment = true; }
    return out;
  } catch { return r; }
}

/* =====================================================================
   5. Studie (mobile-p44s.js) og Avspilling (mobile-p44a.js)
   ===================================================================== */
let STU = null, AVS = null;
export const studieMod = () => STU;
export const avsMod = () => AVS;
export function studieView() {
  if (!STU) { import('./mobile-p44s.js').then((x) => { STU = x; draw(); STU.studieLoad?.().then(draw).catch(() => {}); }).catch((e) => console.warn('mobile-p44s', e)); return '<div class="m-spin"></div>'; }
  return STU.studieView();
}
export function avsView(embedded = false) {
  if (!AVS) { import('./mobile-p44a.js').then((x) => { AVS = x; draw(); AVS.avsLoad?.().then(draw).catch(() => {}); }).catch((e) => console.warn('mobile-p44a', e)); return '<div class="m-spin"></div>'; }
  return AVS.avsView(embedded);
}

/* =====================================================================
   Kroker fra mobile.js (og de andre modulene)
   ===================================================================== */
export function load44(scr, sub) {
  if (scr === 'set' && sub === 'huske') return tasksLoad().then(() => P22.haLoad(true)).catch(() => {});
  if (scr === 'set' && sub === 'konto') return Promise.all([usersLoad(true), ownLoad(true)]).catch(() => {});
  if (scr === 'set' && sub === 'logger' && LOGM) return LOGM.logLoad?.().catch(() => {});
  if (scr === 'nordlys') return verLoad(true);
  if (scr === 'studie' && STU) return STU.studieLoad?.().catch(() => {});
  if (scr === 'mer') { merLive(); return null; }
  return null;
}
export function layer44() {
  let h = asPill();
  if (m.screen === 'huske' && VW.id) h += vwPage();
  if (m.screen === 'huske') h += askSheet();
  if (m.screen === 'mer' || m.screen === 'fmer') h += swapSheet(); // prompt 45: «Velg boks»
  if (m.screen === 'set') h += asSheet() + ownSheet() + (LOGM?.logLayer?.() ?? '');
  if (m.screen === 'nordlys') h += rvSheet();
  if (m.screen === 'studie' && STU) h += STU.studieLayer?.() ?? '';
  if (T44.t) h += `<div class="p44-toast" role="status"><span class="m-grow">${esc(T44.t)}</span>${T44.undo ? `<button type="button" data-p44="tundo">${esc(T44.undo.label ?? 'Angre')}</button>` : ''}</div>`;
  return h;
}
export function afterDraw44() {
  const app = document.querySelector('#app .m');
  app?.classList.toggle('p44-as', !!asCur());
  app?.classList.toggle('p44-vwon', vwOn());
  if (m.screen !== 'huske' && VW.id) { VW.id = null; VW.menu = false; VW.list = false; }
  if (m.screen !== 'mer' && m.screen !== 'fmer' && ME.edit) ME.edit = false;
  if (m.screen !== 'mer' && m.screen !== 'fmer') SW.open = false;
  const ta = document.getElementById('p44-vn'); if (ta) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; }
  const tn = document.getElementById('p44-vnotes'); if (tn) { tn.style.height = 'auto'; tn.style.height = `${Math.max(44, tn.scrollHeight)}px`; }
  if (m.screen === 'nordlys') rvAfter();
  LOGM?.logAfter?.();
  STU?.studieAfter?.();
  AVS?.avsAfter?.();
}
export function input44(e, t) {
  // Filvalg i Studie: tas på «input» (før andre lyttere tegner siden på nytt og «change» aldri når roten).
  if (t.matches?.('[data-p44s-file]') && STU) { STU.studieChange(e, t); return true; }
  const k = t.dataset?.p44in; if (!k) return LOGM?.logInput?.(e, t) || STU?.studieInput?.(e, t) || AVS?.avsInput?.(e, t) || false;
  const v = t.value;
  if (k === 'merq') { ME.q = v; merPatch(); return true; }
  if (k === 'merttl') return true;
  if (k === 'addv') { VW.addV = v; return true; }
  if (k === 'vwsubv') { VW.subV = v; return true; }
  if (k === 'vwtitle') { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; clearTimeout(vwTitleT); const id = VW.id; vwTitleT = setTimeout(() => { if (v.trim()) P37.patchTask(id, { title: v.trim() }, false); }, e.type === 'change' ? 0 : 500); return true; }
  if (k === 'vwnotes') { clearTimeout(vwNotesT); const id = VW.id; vwNotesT = setTimeout(() => P37.patchTask(id, { notes: v }, false), e.type === 'change' ? 0 : 600); return true; }
  if (k === 'vwdl' || k === 'vwdue' || k === 'vwtime') {
    if (e.type !== 'change' && e.type !== 'input') return true;
    const id = VW.id, x = byId(id); if (!x) return true;
    const p = k === 'vwdl' ? { dl: v || null } : k === 'vwdue' ? { due: v || null, ...(v ? {} : { time: null }) } : { time: v || null, due: x.due ?? dayIso(0) };
    P37.patchTask(id, p); haptic('tab'); return true;
  }
  if (k === 'vwpl') { VW.pl = v; plSuggest(v); if (e.type === 'change' && !VW.sug.length) { const id = VW.id; setTimeout(() => { if (!VW.sug.length && VW.pl === v) P37.patchTask(id, { pl: v || null, geo: null }, false).then(() => { const it = (HK.d?.items ?? []).find((y) => String(y.id) === String(id)); if (it) it.geoTried = false; draw(); }); }, 400); } return true; }
  if (k === 'owntxt') { if (AS.own) { AS.own.txt = v; ownBtn(); } return true; }
  if (k === 'ownpw') { if (AS.own) { AS.own.pw = v; ownBtn(); } return true; }
  if (k === 'rvpw') { RV.pw = v; const b = document.querySelector('[data-p44="rvgo"]'); if (b) { b.disabled = !v; b.className = `p44-big ${v ? 'red' : 'off'}`; } return true; }
  return false;
}
export async function change44(e, t) { if (t.dataset?.p44in) return input44(e, t); return (await LOGM?.logChange?.(e, t)) || (await STU?.studieChange?.(e, t)) || false; }
export async function submit44(e, f) {
  const k = f.dataset?.p44f;
  if (!k) return (await LOGM?.logSubmit?.(e, f)) || (await STU?.studieSubmit?.(e, f)) || (await AVS?.avsSubmit?.(e, f)) || false;
  e.preventDefault();
  if (k === 'merttl') { const v = String(f.querySelector('input')?.value ?? '').trim(); mpSave(ME.mode, { title: v || null, titleOff: false }); ME.ttlEd = false; haptic('ok'); draw(); return true; }
  if (k === 'subadd') { const id = f.dataset.id, v = VW.addV.trim(); if (v) { VW.addV = ''; await subPatch(id, (s) => [...s, { n: v, done: false }]); haptic('ok'); setTimeout(() => document.getElementById(`p44-sub-${id}`)?.focus({ preventScroll: true }), 30); } return true; }
  if (k === 'vwsub') { const v = VW.subV.trim(); if (v && VW.id) { VW.subV = ''; await subPatch(VW.id, (s) => [...s, { n: v, done: false }]); haptic('ok'); setTimeout(() => document.getElementById('p44-vsub')?.focus({ preventScroll: true }), 30); } return true; }
  return true;
}
export async function bind44(e, t) {
  const merS = m.screen === 'mer' || m.screen === 'fmer';
  if (merS && Date.now() - ME.lpAt < 700 && t.closest?.('[data-p44mk]')) { e.preventDefault(); e.stopPropagation(); ME.lpAt = 0; return true; }
  if (merS && ME.edit && t.closest?.('[data-p44mk]') && !t.closest('[data-p44]')) { e.preventDefault(); return true; }
  const x = t.closest?.('[data-p44]');
  if (!x) return (await LOGM?.logBind?.(e, t)) || (await STU?.studieBind?.(e, t)) || (await AVS?.avsBind?.(e, t)) || false;
  const a = x.dataset.p44, id = x.dataset.id;
  if (a !== 'vwpick') e.preventDefault();
  switch (a) {
    /* Mer */
    case 'merhide': if (ME.mode === 'fin') { FH.h = [...new Set([...FH.h, x.dataset.k])]; fhSave(); } else P28.merHide(x.dataset.k); vib(8); haptic('tap'); draw(); return true;
    case 'mershow': if (ME.mode === 'fin') { FH.h = []; fhSave(); } else P28.merShowAll(); vib(8); haptic('ok'); draw(); return true;
    /* Prompt 45: tittel og de fire store boksene */
    case 'merttloff': mpSave(ME.mode, { titleOff: true }); ME.ttlEd = false; haptic('tap'); draw(); return true;
    case 'merttlon': mpSave(ME.mode, { titleOff: false }); haptic('tap'); draw(); return true;
    case 'merttled': ME.ttlEd = true; draw(); setTimeout(() => { const i = document.getElementById('p45-merttl'); i?.focus(); i?.select?.(); }, 40); return true;
    case 'merswap': SW.open = true; SW.i = Math.max(0, +x.dataset.i || 0); SW.mode = ME.mode; haptic('tap'); draw(); return true;
    case 'swapx': SW.open = false; draw(); return true;
    case 'merpick': { const T4 = [...tilesOf(SW.mode)], k = x.dataset.k, j = T4.indexOf(k); if (j >= 0 && j !== SW.i) T4[j] = T4[SW.i]; T4[SW.i] = k; mpSave(SW.mode, { tiles: T4 }); SW.open = false; haptic('ok'); draw(); return true; }
    case 'merdone': ME.edit = false; haptic('ok'); draw(); return true;
    case 'mertsz': ME.tsz = x.dataset.k === 'lav' ? 'lav' : 'stor'; ls.put('papir_mer_tsz', ME.tsz); hlApi('/me/layout', { method: 'PUT', json: { papir_mer_tsz: ME.tsz } }).catch(() => {}); haptic('tab'); draw(); return true;
    case 'merclr': ME.q = ''; draw(); setTimeout(() => document.getElementById('p44-merq')?.focus(), 30); return true;
    /* Gjøremål: deloppgaver i lista */
    case 'subadd': VW.addFor = VW.addFor === String(id) ? null : String(id); VW.addV = ''; haptic('tap'); draw(); if (VW.addFor) setTimeout(() => document.getElementById(`p44-sub-${id}`)?.focus({ preventScroll: false }), 40); return true;
    case 'subtick': await subTick(id, +x.dataset.i); return true;
    case 'subrm': await subPatch(id, (s) => s.filter((_, j) => j !== +x.dataset.i)); haptic('tap'); return true;
    case 'askx': VW.ask = null; draw(); return true;
    case 'askok': { const i2 = VW.ask; VW.ask = null; await complete(i2, true); flash('Fullført ✓'); return true; }
    /* Infosiden */
    case 'vwback': VW.id = null; VW.menu = false; VW.list = false; draw(); return true;
    case 'vwflag': { const y = byId(VW.id); if (y) await P37.patchTask(y.id, { flag: !y.flag }); haptic('tab'); return true; }
    case 'vwmenu': VW.menu = !VW.menu; VW.list = false; draw(); return true;
    case 'vwlist': VW.list = !VW.list; VW.menu = false; draw(); return true;
    case 'vwsetl': { const y = byId(VW.id); VW.list = false; if (y) { const p = { list: x.dataset.k }; if (y.who && !listOf(x.dataset.k).members.some((u) => u.id === String(y.who))) p.who = null; await P37.patchTask(y.id, p); } haptic('tab'); return true; }
    case 'vwedit': VW.menu = false; P37.G7.ed = VW.id; P37.G7.tagV = ''; P37.G7.subV = ''; draw(); return true;
    case 'vwdup': { VW.menu = false; const y = byId(VW.id); if (y) { try { const n = await P37.addTask({ ...y, title: `${y.title} (kopi)`, done: false, subs: y.subs.map((u) => ({ ...u, done: false })) }); flash('Duplisert ✓'); if (n?.id != null) VW.id = String(n.id); } catch (err) { flash(err.message); } } draw(); return true; }
    case 'vwdel': { VW.menu = false; const y = byId(VW.id); if (y) { VW.id = null; await P37.delTask(y.id); flash('Oppgaven er slettet'); } draw(); return true; }
    case 'vwdone': { const y = byId(VW.id); if (y) await complete(y.id, !y.done); return true; }
    case 'vwpick': if (t.closest('.p44-vx')) return false; e.preventDefault(); pick(x.dataset.k); return true;
    case 'vwclr': { const y = byId(VW.id); if (y) await P37.patchTask(y.id, x.dataset.k === 'dl' ? { dl: null } : { due: null, time: null }); haptic('tab'); return true; }
    case 'vwplclr': { const y = byId(VW.id); VW.pl = ''; VW.sug = []; if (y) await P37.patchTask(y.id, { pl: null, geo: null }); return true; }
    case 'vwplpick': { const s = VW.sug[+x.dataset.i], y = byId(VW.id); if (s && y) { const lab = s.street ? `${s.street}${s.city ? `, ${s.city}` : ''}` : s.label; VW.pl = lab; VW.sug = []; await P37.patchTask(y.id, { pl: lab, geo: s.lat != null ? { lat: +s.lat, lon: +s.lon, label: lab } : null }); haptic('ok'); } return true; }
    /* Kontoer og brukere */
    case 'aspick': AS.pick = id; AS.copyArm = null; AS.resetArm = null; layLoad(id); draw(); return true;
    case 'asx': AS.pick = null; draw(); return true;
    case 'asgo': { const u = (AS.users ?? []).find((y) => y.id === AS.pick); if (u) await asLogin(u); return true; }
    case 'asout': await asLogout(); return true;
    case 'ascopy': { const uid = AS.pick; if (AS.copyArm !== uid) { AS.copyArm = uid; draw(); return true; } AS.copyArm = null; try { await hlApi(`/users/${encodeURIComponent(uid)}/layout/copy-from-me`, { method: 'POST', json: {} }); AS.pick = null; toast(`Kopierte oppsettet ditt til ${first((AS.users ?? []).find((u) => u.id === uid)?.name)}.`); layLoad(uid); } catch (err) { toast(errMsg(err)); } return true; }
    case 'asreset': { const uid = AS.pick; if (AS.resetArm !== uid) { AS.resetArm = uid; draw(); return true; } AS.resetArm = null; try { await hlApi(`/users/${encodeURIComponent(uid)}/layout/reset`, { method: 'POST', json: {} }); AS.pick = null; toast(`${first((AS.users ?? []).find((u) => u.id === uid)?.name)} har fått standardoppsettet.`); layLoad(uid); } catch (err) { toast(errMsg(err)); } return true; }
    case 'aslock': { const uid = AS.pick, L = AS.lay[uid] ?? {}, nl = !L.locked; AS.lay[uid] = { ...L, locked: nl }; draw(); try { await hlApi(`/users/${encodeURIComponent(uid)}/layout/lock`, { method: 'PUT', json: { locked: nl } }); haptic('tab'); } catch (err) { AS.lay[uid] = { ...L }; toast(errMsg(err)); } return true; }
    case 'ownstart': AS.own = { step: 1, to: null, txt: '', pw: '', err: '' }; usersLoad(); draw(); return true;
    case 'ownx': AS.own = null; draw(); return true;
    case 'ownto': if (AS.own) { AS.own.to = id; haptic('tab'); draw(); } return true;
    case 'ownnext': if (AS.own?.to) { const cd = AS.ownD?.candidates?.find((y) => String(y.id) === AS.own.to), u = (AS.users ?? []).find((y) => y.id === AS.own.to); const why = cd ? (cd.eligible === false ? cd.reason || 'Kan ikke motta eierskapet' : '') : u?.totp === false ? `${first(u.name)} må slå på 2FA først.` : ''; if (why) { toast(why); return true; } AS.own.step = 2; draw(); setTimeout(() => document.getElementById('p44-owntxt')?.focus(), 60); } return true;
    case 'ownback': if (AS.own) { AS.own.step = 1; AS.own.err = ''; draw(); } return true;
    case 'owngo': await ownGo(); return true;
    case 'ownok': case 'ownno': try { await hlApi(`/server/owner/transfer/${encodeURIComponent(id)}/${a === 'ownok' ? 'approve' : 'reject'}`, { method: 'POST', json: {} }); toast(a === 'ownok' ? 'Overføringen er godkjent.' : 'Overføringen er avslått.'); AS.ownT = 0; ownLoad(true); usersLoad(true); } catch (err) { toast(errMsg(err)); } return true;
    /* Tidligere versjoner */
    case 'rvpick': RV.to = x.dataset.v; RV.opt = 'keep'; RV.pause = true; RV.pw = ''; RV.e2 = ''; draw(); return true;
    case 'rvx': RV.to = null; draw(); return true;
    case 'rvopt': RV.opt = x.dataset.k; haptic('tab'); draw(); return true;
    case 'rvpause': RV.pause = !RV.pause; haptic('tab'); draw(); return true;
    case 'rvgo': await rvGo(); return true;
    /* Toast */
    case 'tundo': { const u = T44.undo; T44.t = ''; T44.undo = null; draw(); if (u?.a === 'asundo') await asUndo(u.id, u.path); else if (u?.a === 'rvback') { location.hash = '#/nordlys'; P30.upNow(false); } else if (typeof u?.fn === 'function') await u.fn(); return true; }
    default: return false;
  }
}
let booted = false;
export function boot44() {
  if (booted) return; booted = true;
  fetchWrap();
  globalThis.P44 = { toast, avsMod, merNew, merTake45, subBtn, subRows, vwOpen, vwOn, haRow, setRowHuske, homelabGroup, huskeSet, loggerSet, kontoGroups, versionsSection, fixQuick, glimtTime, studieView, avsView, asCur };
  document.addEventListener('pointerdown', merDown, true);
  document.addEventListener('pointermove', merMove, { capture: true, passive: true });
  document.addEventListener('pointerup', merUp, true); document.addEventListener('pointercancel', merUp, true);
  document.addEventListener('contextmenu', (e) => { if (m.screen === 'mer' && e.target.closest?.('[data-p44mk]')) e.preventDefault(); }, true);
  addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (VW.menu || VW.list) { VW.menu = false; VW.list = false; draw(); } else if (VW.id) { VW.id = null; draw(); } else if (AS.pick || AS.own || RV.to) { AS.pick = null; AS.own = null; RV.to = null; draw(); } else if (ME.edit) { ME.edit = false; draw(); } });
  addEventListener('huske-update', () => { if (m.screen === 'huske') draw(); });
  // Toast etter «Gå ut» / utløpt impersonering (overlever innlastingen).
  const t0 = ls.get('papir_as_toast');
  if (t0) { ls.set('papir_as_toast', null); setTimeout(() => toast(t0.t, t0.undo ? { label: 'Angre', a: 'asundo', id: t0.undo, path: t0.path } : null, 5000), 400); }
  // Informasjonskapselen (hl_imp) lever, men lokal tilstand er borte: vis pillen likevel så man kan gå ut.
  if (!asCur()) hlApi('/admin/impersonate').then((r) => { if (r?.active && r.user) { ls.set(AS_K, { token: null, cookie: true, id: String(r.user.id), name: r.user.name, color: colOf(r.user.id), admin: r.actor?.name ?? 'admin', n: r.changes ?? 0, at: Date.now(), seen: Date.now() }); draw(); } }).catch(() => {});
  // X ser en melding neste gang: «Sebastian har oppdatert oppsettet ditt».
  if (!asCur()) setTimeout(() => { hlApi('/admin/impersonate/notice').then((r) => { const nt = r?.notice; if (nt?.text) { toast(`${nt.text}${nt.changes ? ` · ${nt.changes} ${nt.changes === 1 ? 'endring' : 'endringer'}` : ''}.`); hlApi('/admin/impersonate/notice/seen', { method: 'POST', json: {} }).catch(() => {}); } }).catch(() => {}); }, 1500);
}
