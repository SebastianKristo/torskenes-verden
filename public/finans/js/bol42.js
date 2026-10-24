// Prompt 42: Boliger på web – forside 2a «Alle boligene på ett ark» og 1b «Kontobok» inne i en bolig, etter fasiten
// «Boliger Web.dc.html» (inne i FinansHub: 80 % skala, ingen egen bakgrunn, ingen maks-bredde, ingen «Dette må gjøres»).
// Erstatter den gamle Boliger-siden i modules.js, som er slettet. Ruter: #/dir → 2a, #/dir/<id>?fane=kat → 1b.
// Data: /folders (+ /folders/:id), /boliger/categories og (når serveren har det) /boliger/oversikt. Alt tåler 404.
import { S, api, esc, n2, render, toast, today, logo } from './core.js';
import { orb, kr, secs, askStream } from './fin42.js';

const u = S.ui;
const B = (S.b42 ??= { homes: null, det: {}, cats: null, ov: null, users: null, lines: {} });
const st = () => (u.b42 ??= { tab: 'utg', ym: null, catMode: 'mnd' });
const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const NB = ' ';
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pk = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const dS = (k) => (k ? `${+k.slice(8, 10)}.${NB}${MS[+k.slice(5, 7) - 1]}` : '');
const dL = (k) => { if (!k) return ''; const d = pk(k); return `${WD[d.getDay()]} ${d.getDate()}.${NB}${MN[d.getMonth()]}`; };
const TK = () => today();
const CYM = () => TK().slice(0, 7);
const CY = () => +TK().slice(0, 4);
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\s|kr/gi, '').replace('−', '-').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const sum = (a) => a.reduce((t, e) => t + e.amt, 0);
const CATC = ['#c2477a', '#8a5a2b', '#a8661a', '#2b5d8a', '#6b665c', '#7a5c3a', '#9a7a12', '#3d7f8a', '#8a3fa0', '#2f6b4a', '#5b4fc4', '#b23a2a', '#7d776b', '#1f7a8a', '#6a7a1a', '#4a6fa5', '#a0522d'];
const COLS = ['#2b5d8a', '#7a3f8a', '#3d7f8a', '#a8661a', '#2f6b4a', '#b23a2a', '#5b4fc4', '#6b665c'];
const PCOL = ['#2b5d8a', '#a8661a', '#3d7f8a', '#7a3f8a', '#2f6b4a', '#b23a2a'];
const TYPES = ['Enebolig', 'Leilighet', 'Rekkehus', 'Hytte', 'Hytte i Sverige', 'Annet'];
const ROLE = { owner: 'Eier', editor: 'Kan se og legge inn', viewer: 'Kan bare se' };
// Standardkategoriene («hva som ble kjøpt»). Serverens kategorier kommer i tillegg.
const BASE = ['Blomster', 'Møbler', 'Mat og drikke', 'Maling', 'Verktøy', 'Byggevarer', 'Lys og elektrisk', 'Rengjøring', 'Interiør', 'Hage', 'Strøm', 'Avgifter', 'Annet'];
const SYN = { basseng: ['basseng', 'pool', 'klor', 'ph-', 'bassengduk', 'bassengpumpe', 'svømme', 'spa'], terrasse: ['terrasse', 'beis', 'terrassebord', 'platting', 'maling'], tak: ['tak', 'takrenne', 'takstein', 'beslag'], hage: ['hage', 'plante', 'gjødsel', 'blomst', 'frø', 'jord', 'plen'], brygge: ['brygge', 'fortøy', 'båt', 'tau'], bad: ['bad', 'flis', 'sluk', 'dusj'], kjøkken: ['kjøkken', 'benkeplate', 'komfyr'], maling: ['maling', 'beis', 'pensel', 'malerull'], strøm: ['strøm', 'energi', 'nettleie', 'elvia', 'tibber', 'fjordkraft'] };
const STOPW = /\b(legg|til|alle|alt|transaksjoner|transaksjon|kvitteringer|kvittering|kjøp|utgifter|utgift|regninger|relatert|relaterte|som|har|med|å|gjøre|om|i|det|dette|prosjektet|prosjekt|fra|og|for|på|finn|vis|meg|kan|du|jeg|vil|ha|hva|hvor|mye|brukt|vi|år|kategori)\b/g;
const terms = (q) => {
  const w = (` ${String(q).toLowerCase().replace(/[«»"'?.!,:;]/g, ' ')} `).replace(STOPW, ' ').split(/\s+/).filter((x) => x.length > 2);
  const all = new Set();
  for (const x of w) { all.add(x.replace(/(ene|er|en|et)$/, '')); for (const [k, v] of Object.entries(SYN)) if (x.startsWith(k.slice(0, 5)) || v.some((s) => x.startsWith(s))) [...v, k].forEach((s) => all.add(s)); }
  return { base: w, all: [...all].filter((x) => x.length > 1) };
};
const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } return v; };

/* ===================== Data ===================== */

const homes = () => B.homes ?? [];
const dup = (n) => homes().filter((x) => x.name === n).length > 1;
const hName = (h) => (h ? h.name + (dup(h.name) ? ` ${String(h.type ?? '').toLowerCase()}` : '') : '');
const homeColor = (h, i = homes().indexOf(h)) => (/^#[0-9a-f]{6}$/i.test(h?.color ?? '') ? h.color : COLS[Math.max(0, i) % COLS.length]);
const STROMSTAD = '/assets/boliger/stromstad.webp';
const homeImg = (h) => {
  const d = B.det[h.id] ?? h, key = d.background ?? h.background ?? '';
  if (d.backgroundUrl ?? h.backgroundUrl) return d.backgroundUrl ?? h.backgroundUrl;
  if (key === 'preset:stromstad' || (!key && /str[øo]mstad/i.test(`${h.name} ${h.address ?? ''}`))) return STROMSTAD;
  if (String(key).startsWith('upload:')) return `/finans/api/folders/${h.id}/bg?v=${encodeURIComponent(key.slice(7))}`;
  return '';
};
const cssU = (url) => `url('${String(url).replace(/["'()\\\s]/g, encodeURIComponent)}')`;
const thumbBg = (h) => { const img = homeImg(h); return img ? `${cssU(img)} center / cover no-repeat` : homeColor(h); };
const pstat = () => LS('fh_b42_pst') ?? {};
// Utgiftene i en bolig i samme form som fasiten: h, d, m, desc, cat, amt, rc, by, proj.
function exps(h) {
  const d = B.det[h.id];
  return (d?.entries ?? []).map((e) => ({ id: e.id, h: h.id, d: e.date ?? '', m: e.description ?? '', desc: e.note ?? e.what ?? '', ai: e.aiText ?? e.aiShort ?? '', cat: e.category ?? 'Annet', catId: e.categoryId, sub: e.subcategory, amt: Math.abs(+e.amount || 0), rid: e.receiptId ?? null, rc: !!e.receiptId || !!e.hasReceipt, by: e.paidBy ?? '', proj: e.projectId ?? null, review: e.status === 'review' || !!e.pending, pending: !!e.pending, domain: e.domain, lines: e.lines ?? null, file: e.fileName ?? null, mime: e.mime ?? null }));
}
const done = (h) => exps(h).filter((e) => !e.review);
const allCats = () => {
  const tree = B.cats?.categories ?? [], names = tree.map((c) => c.name);
  const used = Object.values(B.det).flatMap((d) => (d.entries ?? []).map((e) => e.category)).filter(Boolean);
  return [...new Set([...(names.length ? names : BASE), ...used])];
};
const catInfo = (n) => (B.cats?.categories ?? []).find((c) => c.name === n) ?? null;
const cc = (n) => CATC[Math.max(0, allCats().indexOf(n)) % CATC.length];
const fileUrl = (e, kind = 'file') => (e.rid ? `/finans/api/folders/${e.h}/receipts/${encodeURIComponent(e.rid)}/${kind}` : null);

export async function loadB42() {
  const y = CY();
  const [list, ov, cats] = await Promise.all([api('/folders'), api(`/boliger/oversikt?year=${y}`).catch(() => null), api('/boliger/categories').catch(() => B.cats)]);
  B.homes = list; B.ov = ov; B.cats = cats;
  const det = await Promise.all(list.map((f) => api(`/folders/${f.id}`).catch(() => null)));
  B.det = Object.fromEntries(list.map((f, i) => [f.id, det[i] ?? f]));
  if (!B.users) api('/users').then((r) => { B.users = r; }).catch(() => { B.users = []; });
  // Kategorier Glimt har laget siden sist: vis meldingen én gang.
  u.seenNotice ??= new Set();
  for (const d of det) for (const n of d?.notices ?? []) { const k = `${n.entryId}:${n.at}`; if (!u.seenNotice.has(k)) { u.seenNotice.add(k); toast(n.text); } }
}
const reloadHome = async (id) => { if (!id) return loadB42(); const r = await api(`/folders/${id}`); B.det[id] = r; return r; };

/* ===================== Ruting ===================== */

function routeInfo() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const seg = path.split('/');
  const q = new URLSearchParams(qs ?? '');
  return { id: seg[1] ? +seg[1] || seg[1] : null, tab: q.get('fane'), q };
}
const curHome = () => {
  const { id } = routeInfo(), L = homes();
  if (id != null) return L.find((h) => String(h.id) === String(id)) ?? null;
  return L.length === 1 ? L[0] : null;
};
const TAB_IDS = { utg: 'utgifter', kat: 'kategorier', pro: 'prosjekter', til: 'tilgang' };
const tabOf = () => { const t = routeInfo().tab; return Object.entries(TAB_IDS).find(([, v]) => v === t)?.[0] ?? 'utg'; };
const goHome = (id, tab) => { const s = st(); s.cv = null; s.pv = null; s.gres = null; s.sq = null; s.gsOn = false; s.ym = CYM(); location.hash = id ? `#/dir/${id}${tab && tab !== 'utg' ? `?fane=${TAB_IDS[tab]}` : ''}` : '#/dir'; };

/** Søkeavgrensningen for toppfeltet (claude-code-boliger-sok-scope.md). */
export function bolScope() {
  if (u.page !== 'dir' || u.bolScopeOff) return null;
  const h = curHome();
  return { name: h ? hName(h) : 'Boliger', id: h?.id ?? null, home: !!h };
}
export function bolTitle() { const h = curHome(); return h ? hName(h) : 'Boliger'; }

/* ===================== Søk (toppfeltet og «Søk med Glimt») ===================== */

export function bolSearch(q, glimt = false) {
  q = String(q ?? '').trim();
  const s = st();
  if (!q) { s.sq = null; return render(); }
  const t0 = performance.now(), h = curHome(), T = terms(q);
  const pool = (h ? [h] : homes()).flatMap((x) => exps(x));
  const words = T.base.length ? T.base : [q.toLowerCase()];
  const hay = (e) => `${e.m} ${e.desc} ${e.ai} ${e.cat} ${(e.lines ?? []).map((l) => l.text ?? l.t ?? '').join(' ')}`.toLowerCase();
  const list = pool.filter((e) => words.every((w) => { const st0 = w.replace(/(ene|er|en|et)$/, ''); const H = hay(e); return H.includes(st0) || T.all.some((a) => a.startsWith(st0.slice(0, 5)) && H.includes(a)); })).sort((a, b) => b.d.localeCompare(a.d));
  s.sq = { q, glimt, ids: list.map((e) => `${e.h}:${e.id}`), ms: performance.now() - t0, home: h?.id ?? null, text: '' };
  render();
  if (glimt) {
    const run = (s.sqRun = (s.sqRun ?? 0) + 1);
    askStream(q, { scope: { module: 'boliger', home_id: h?.id ?? null }, onStep: (T2) => { if (s.sqRun === run && s.sq) { s.sq.think = T2; paintThink(); } } })
      .then((r) => { if (s.sqRun !== run || !s.sq) return; s.sq.text = r?.text ?? ''; s.sq.think = r?.think ?? null; render(); })
      .catch(() => { if (s.sq) { s.sq.think = null; render(); } });
  }
}
function paintThink() {
  const el = document.querySelector('[data-b42-think]');
  const T = st().sq?.think;
  if (!el || !T) return;
  el.textContent = T.done ? `Glimt tenkte i ${secs(T.ms ?? 0)}` : `Glimt tenker … ${secs(Date.now() - T.t0)}`;
}
setInterval(() => { if (st().sq?.think && !st().sq.think.done) paintThink(); }, 100);

/* ===================== Tegning ===================== */

const btn = (label, attrs, kind = 'line') => `<button type="button" class="b42-btn ${kind}" ${attrs}>${label}</button>`;
const chips = (list, on, attr) => list.map(([v, n, dot]) => `<button type="button" class="b42-chip${String(v) === String(on) ? ' on' : ''}" ${attr}="${esc(v)}">${dot ? `<i style="background:${dot}"></i>` : ''}${esc(n)}</button>`).join('');
const paperMini = (e, cls = '') => {
  const t = fileUrl(e, 'thumb');
  return `<span class="b42-paper${cls ? ` ${cls}` : ''}${t ? ' img' : ''}"${t ? ` style="background-image:${cssU(t)}"` : ''}><i></i><i></i><i></i><i></i><span></span><b></b></span>`;
};

export function bolPage() {
  if (!B.homes) return '<div class="b42"><div class="skel" style="min-height:420px"></div></div>';
  const h = curHome(), s = st();
  s.ym ??= CYM();
  const body = h ? homePage(h) : listPage();
  return `<div class="b42" data-b42>${body}${modals()}${s.toast ? `<div class="b42-toast" role="status"><span>${esc(s.toast.t)}</span>${s.toast.undo ? '<button type="button" data-b42="undo">Angre</button>' : ''}</div>` : ''}</div>`;
}

function headSum() {
  const L = homes(), y = String(CY());
  const t = B.ov?.sumYear ?? L.reduce((a, h) => a + sum(done(h).filter((e) => e.d.startsWith(y))), 0);
  return `${L.length} ${L.length === 1 ? 'bolig' : 'boliger'} · ${kr(t)} brukt hittil i år`;
}
function sqCard() {
  const s = st(), SQ = s.sq;
  if (!SQ) return '';
  const h = curHome(), L = SQ.ids.map((k) => { const [hid, id] = k.split(':'); const hh = homes().find((x) => String(x.id) === hid); return hh ? exps(hh).find((e) => String(e.id) === id) : null; }).filter(Boolean);
  const where = h ? hName(h) : 'alle boligene';
  const sub = `${L.length ? `${L.length === 1 ? '1 treff' : `${L.length} treff`} i ${where} · ${kr(sum(L))}` : `Ingen treff i ${h ? hName(h) : 'boligene'}`} · ${secs(SQ.ms)}`;
  const think = SQ.think ? `<span class="b42-think" data-b42-think>${SQ.think.done ? `Glimt tenkte i ${secs(SQ.think.ms ?? 0)}` : `Glimt tenker … ${secs(Date.now() - SQ.think.t0)}`}</span>` : '';
  return `<section class="b42-sq" aria-live="polite"><div class="b42-sq-h"><span class="b42-sq-t">${orb(30, !!SQ.think && !SQ.think.done)}<b>${SQ.glimt ? 'Glimt' : 'Søk'}: «${esc(SQ.q)}»</b></span>${btn('Lukk', 'data-b42="sq-close"', 'line sm')}</div>
    <span class="b42-mute">${sub}${think ? ' · ' : ''}${think}</span>${SQ.text ? `<p class="b42-sq-a">${esc(SQ.text)}</p>` : ''}
    ${L.slice(0, 12).map((e) => { const h2 = homes().find((x) => x.id === e.h); return `<button type="button" class="b42-sq-r" data-b42-open="${e.h}:${e.id}"><span class="b42-mute">${dS(e.d)}</span><span class="b42-col"><b>${esc(e.m)}</b><small>${esc([e.desc || e.ai, e.cat, !h && h2 ? hName(h2) : ''].filter(Boolean).join(' · '))}</small></span><b class="b42-mono">${kr(e.amt)}</b></button>`; }).join('')}</section>`;
}

function listPage() {
  const L = homes(), y = String(CY());
  const people = (h) => (B.det[h.id]?.members ?? h.members ?? []).filter((m) => !m.you).map((m) => String(m.name ?? '').split(/\s+/)[0]);
  const cards = L.map((h) => {
    const E = exps(h), spent = B.ov?.homes?.find((x) => String(x.id) === String(h.id))?.spentYear ?? sum(E.filter((e) => !e.review && e.d.startsWith(y)));
    const rv = E.filter((e) => e.review).length, miss = E.filter((e) => !e.review && !e.rc && (Date.now() - pk(e.d)) / 864e5 > 7 && e.d.startsWith(y)).length;
    const rc = rv ? `${rv} venter på gjennomgang` : miss ? (miss === 1 ? '1 kvittering mangler' : `${miss} kvitteringer mangler`) : '✓ Alt er i orden';
    const img = homeImg(h), pp = people(h);
    return `<article class="b42-card"><button type="button" class="b42-card-top" style="background:${thumbBg(h)}" data-b42-go="${h.id}" aria-label="Åpne ${esc(hName(h))}">${img ? '' : esc(h.name.slice(0, 1).toUpperCase())}</button>
      <div class="b42-card-b"><div class="b42-col"><b class="b42-serif30">${esc(h.name)}</b><span class="b42-mute2">${esc(h.type ?? '')}</span>${pp.length ? `<span class="b42-mute">Delt med ${esc(pp.length > 2 ? `${pp.slice(0, -1).join(', ')} og ${pp.at(-1)}` : pp.join(' og '))}</span>` : ''}</div>
      <div class="b42-rows"><span><span>Brukt i år</span><b class="b42-mono">${kr(spent)}</b></span><span><span>Kvitteringer</span><b class="${rv || miss ? 'amber' : 'green'}">${rc}</b></span></div>
      <div class="b42-card-a">${btn(`Åpne ${esc(hName(h))} ›`, `data-b42-go="${h.id}"`, 'dark lg')}${h.isOwner || h.role === 'owner' ? btn('Rediger', `data-b42-edit="${h.id}"`, 'line lg') : ''}</div></div></article>`;
  }).join('');
  return `<div class="b42-head"><div class="b42-col"><span class="b42-title">Boliger</span><span class="b42-mute">${headSum()}</span></div><div class="b42-acts">${btn('+ Legg til utgift', 'data-b42="add"', 'green')}</div></div>
    ${sqCard()}
    ${L.length ? `<div class="b42-grid">${cards}</div>` : '<div class="b42-empty">Ingen boliger ennå. Trykk «+ Legg til bolig» for å lage den første.</div>'}
    <button type="button" class="b42-add" data-b42="new-home">+ Legg til bolig</button>`;
}

function yearBoxes(h) {
  const s = st(), E = done(h), cy = CY(), first = E.reduce((m, e) => Math.min(m, +e.d.slice(0, 4) || cy), cy);
  const from = Math.min(first, cy - 4), yy = +s.ym.slice(0, 4);
  const box = [];
  for (let Y = from; Y <= cy; Y++) { const ex = E.filter((e) => e.d.startsWith(String(Y))); box.push(`<button type="button" class="b42-yb${Y === yy ? ' on' : ''}" data-b42-year="${Y}"><b class="b42-serif28">${Y}</b><b class="b42-mono">${kr(sum(ex))}</b><span>${Y === cy ? `Hittil i år · ${ex.length} kjøp` : `${ex.length} kjøp`}</span></button>`); }
  return `<div class="b42-years"><button type="button" class="b42-yarr" data-b42="y-prev" aria-label="Eldre år">‹</button><div class="b42-yrow" data-b42-yrow>${box.join('')}</div><button type="button" class="b42-yarr" data-b42="y-next" aria-label="Nyere år">›</button></div>`;
}

function homePage(h) {
  const s = st(), tab = tabOf(), d = B.det[h.id] ?? {};
  const one = homes().length === 1;
  const tabs = [['utg', 'Utgifter'], ['kat', 'Kategorier'], ['pro', 'Prosjekter'], ['til', 'Hvem har tilgang']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-b42-tab="${k}">${n}</button>`).join('');
  const gs = s.gsOn ? `<form class="b42-gs" data-b42-form="gs">${orb(30)}<input name="q" value="${esc(s.gsQ ?? '')}" placeholder="Spør Glimt om ${esc(hName(h))} …, f.eks. «maling i år»" aria-label="Spør Glimt om ${esc(hName(h))}" autocomplete="off" data-b42-gsq><button class="b42-btn dark">Spør Glimt</button></form>` : '';
  let body = '';
  if (tab === 'utg') body = utgTab(h);
  else if (tab === 'kat') body = katTab(h);
  else if (tab === 'pro') body = proTab(h);
  else body = tilTab(h, d);
  return `<div class="b42-head"><div class="b42-col"><span class="b42-title">${esc(hName(h))}</span><span class="b42-mute">${esc([h.type, h.address].filter(Boolean).join(' · '))}</span></div>
    <div class="b42-acts">${one ? '' : btn('‹ Alle boligene', 'data-b42="back"')}${btn(`${orb(28, !!s.gsOn)}Søk med Glimt`, `data-b42="gs" aria-pressed="${!!s.gsOn}"`, `line orbb${s.gsOn ? ' on' : ''}`)}${btn('+ Legg til utgift', 'data-b42="add"', 'green')}</div></div>
    ${gs}${sqCard()}${yearBoxes(h)}<nav class="b42-tabs" role="tablist" aria-label="Boligmeny">${tabs}</nav>${body}`;
}

function reviewBox(h) {
  const hr = exps(h).filter((e) => e.review);
  if (!hr.length) return '';
  const usage = {}; exps(h).forEach((x) => { usage[x.cat] = (usage[x.cat] ?? 0) + 1; });
  const topC = Object.entries(usage).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const rows = hr.map((r) => {
    const opts = [r.cat, ...[...topC, 'Annet'].filter((c) => c !== r.cat)].filter((c, i, a) => a.indexOf(c) === i).slice(0, 4);
    const k = `${r.h}:${r.id}`;
    return `<div class="b42-rv"><button type="button" class="b42-rv-p" data-b42-view="${k}" title="Vis original" aria-label="Vis original">${paperMini(r)}</button>
      <div class="b42-col g12"><div class="b42-rv-h"><span class="b42-col"><b class="b42-f21">${esc(r.pending ? 'Glimt leser kvitteringen …' : r.m)}</b><span class="b42-mute">${esc([dS(r.d), r.desc || r.ai, r.file].filter(Boolean).join(' · '))}</span></span><b class="b42-mono b42-f26${r.amt ? '' : ' red'}">${r.pending ? '…' : r.amt ? kr(r.amt) : 'Sjekk beløp'}</b></div>
      ${r.pending ? '' : `<div class="b42-col g8"><span class="b42-lab">Kategori</span><div class="b42-chips">${opts.map((c) => `<button type="button" class="b42-chip${c === r.cat ? ' on' : ''}" data-b42-rvcat="${k}:${esc(c)}"><i style="background:${cc(c)}"></i>${esc(c)}</button>`).join('')}</div></div>`}
      <div class="b42-row8">${r.pending ? '' : r.amt ? btn('✓ Godkjenn', `data-b42-ok="${k}"`, 'green') : btn('Skriv inn beløp', `data-b42-open="${k}"`, 'green')}${btn('Endre detaljer', `data-b42-open="${k}"`)}${btn('Vis original', `data-b42-view="${k}"`, 'link')}</div></div></div>`;
  }).join('');
  return `<section class="b42-col g12"><div class="b42-rv-top"><div class="b42-row12">${orb(40)}<span class="b42-col"><b class="b42-f20">${hr.length === 1 ? 'Glimt har lest 1 kvittering' : `Glimt har lest ${hr.length} kvitteringer`}</b><span class="b42-mute">Sjekk butikk, beløp og kategori, og godkjenn.</span></span></div>${hr.filter((r) => r.amt && !r.pending).length > 1 ? btn('Godkjenn alle', 'data-b42="ok-all"') : ''}</div>${rows}</section>`;
}

function utgTab(h) {
  const s = st(), yy = +s.ym.slice(0, 4), cy = CY();
  const list = done(h).filter((e) => e.d.startsWith(String(yy))).sort((a, b) => b.d.localeCompare(a.d)), sm = sum(list);
  const rows = list.map((e, i) => {
    const k = `${e.h}:${e.id}`;
    const rcB = e.rc ? `<button type="button" class="b42-vis" data-b42-view="${k}">Vis ›</button>` : `<label class="b42-att" data-b42-stop>Legg ved<input type="file" accept="image/*,application/pdf" data-b42-attach="${k}" hidden></label>`;
    return `<div class="b42-tr${i % 2 ? ' alt' : ''}" data-b42-open="${k}" role="button" tabindex="0"><span>${dS(e.d)}</span><span class="b42-col b42-what">${logo({ description: e.m, domain: e.domain }, 30, 8)}<span class="b42-col"><b>${esc(e.m)}</b><small>${esc([e.desc || e.ai, e.by].filter(Boolean).join(' · '))}</small></span></span><span class="b42-tcat">${esc(e.cat)}</span><b class="b42-mono b42-r">${kr(e.amt)}</b><span class="b42-r">${rcB}</span></div>`;
  }).join('');
  return `${reviewBox(h)}<div class="b42-mnav">${btn(`‹ ${yy - 1}`, 'data-b42="yr-prev"')}<b class="b42-serif32">${yy}</b>${btn(`${yy + 1} ›`, `data-b42="yr-next"${yy >= cy ? ' disabled' : ''}`)}</div>
    <div class="b42-kpis"><div class="b42-kpi"><span>Brukt i ${yy}</span><b class="b42-mono">${kr(sm)}</b></div><div class="b42-kpi"><span>Hittil i år</span><b class="b42-mono">${kr(sum(done(h).filter((e) => e.d.startsWith(String(cy)))))}</b></div></div>
    <div class="b42-table"><div class="b42-th"><span>Dato</span><span>Hva</span><span>Kategori</span><span class="b42-r">Beløp</span><span class="b42-r">Kvittering</span></div>${rows}
      ${list.length ? `<div class="b42-tsum"><b>Sum ${yy}</b><b class="b42-mono">${kr(sm)}</b></div>` : `<div class="b42-tempty"><span>Ingen utgifter i ${yy}.</span>${btn('+ Legg til utgift', 'data-b42="add"', 'green')}</div>`}</div>
    <div class="b42-row12">${btn('Skriv ut', 'data-b42="print"')}${btn('Last ned for Excel', 'data-b42="csv"')}</div>`;
}

function katTab(h) {
  const s = st(), [yy, mm] = s.ym.split('-').map(Number), cm = s.catMode ?? 'mnd', E = done(h);
  const pfx = cm === 'mnd' ? s.ym : String(yy), src = E.filter((e) => e.d.startsWith(pfx));
  const ALLC = allCats(), canM = !!B.cats?.canManage;
  if (s.cv && ALLC.includes(s.cv)) {
    const CV = s.cv, pm = s.cvMode ?? cm, cl = E.filter((e) => e.cat === CV && (pm === 'alt' || e.d.startsWith(pm === 'mnd' ? s.ym : String(yy)))).sort((a, b) => b.d.localeCompare(a.d));
    const per = pm === 'mnd' ? `i ${MN[mm - 1]} ${yy}` : pm === 'ar' ? `i ${yy}` : 'totalt', ci = catInfo(CV);
    return `<div class="b42-col g16"><div class="b42-between">${btn('‹ Alle kategorier', 'data-b42="cv-back"')}<div class="b42-seg">${[['mnd', 'Måned'], ['ar', 'Året'], ['alt', 'Alt']].map(([k, n]) => `<button type="button" class="${pm === k ? 'on' : ''}" data-b42-cvmode="${k}">${n}</button>`).join('')}</div></div>
      <div class="b42-box b42-row16"><span class="b42-cini lg" style="background:${cc(CV)}">${esc(CV[0])}</span><span class="b42-col grow"><b class="b42-serif30">${ci?.ai ? '✦ ' : ''}${esc(CV)}</b><span class="b42-mute">${cl.length === 1 ? '1 kjøp' : `${cl.length} kjøp`} ${per} · ${esc(hName(h))}</span></span><b class="b42-mono b42-f26">${kr(sum(cl))}</b></div>
      <div class="b42-table">${cl.map((e) => `<div class="b42-tr c4" data-b42-open="${e.h}:${e.id}" role="button" tabindex="0"><span class="b42-mute">${dS(e.d)}</span><span class="b42-col"><b>${esc(e.m)}</b><small>${esc([e.desc || e.ai, e.by, e.rc ? 'kvittering' : 'mangler kvittering'].filter(Boolean).join(' · '))}</small></span><b class="b42-mono">${kr(e.amt)}</b><span>${e.rc ? `<button type="button" class="b42-vis" data-b42-view="${e.h}:${e.id}">Kvittering ›</button>` : ''}</span></div>`).join('') || `<div class="b42-tempty"><span>Ingen kjøp i ${esc(CV)} ${per}.</span></div>`}</div>
      <div class="b42-row12">${btn(`+ Legg til utgift i ${esc(CV)}`, `data-b42-addcat="${esc(CV)}"`, 'green')}${canM && ci && CV !== 'Annet' ? btn('Slett kategori', `data-b42-delcat="${ci.id}"`, 'danger') : ''}</div></div>`;
  }
  const tot = {}; src.forEach((e) => { tot[e.cat] = (tot[e.cat] ?? 0) + e.amt; });
  const ent = Object.entries(tot).sort((a, b) => b[1] - a[1]), tot0 = ent.reduce((t, x) => t + x[1], 0) || 1;
  const pk0 = cm === 'mnd' ? new Date(yy, mm - 2, 1).toLocaleDateString('sv-SE').slice(0, 7) : String(yy - 1);
  const prevE = E.filter((e) => e.d.startsWith(pk0)), prevT = {}; prevE.forEach((e) => { prevT[e.cat] = (prevT[e.cat] ?? 0) + e.amt; });
  const months = cm === 'mnd' ? Array.from({ length: 6 }, (_, k) => new Date(yy, mm - 6 + k, 1).toLocaleDateString('sv-SE').slice(0, 7)) : Array.from({ length: 12 }, (_, k) => `${yy}-${String(k + 1).padStart(2, '0')}`);
  const card = (n, v, used) => {
    const pv = prevT[n] ?? 0, dd = v - pv, ce = (used ? src : E).filter((e) => e.cat === n).sort((a, b) => b.d.localeCompare(a.d));
    const mv = months.map((mk) => sum(E.filter((e) => e.cat === n && e.d.startsWith(mk)))), mx = Math.max(1, ...mv), ci = catInfo(n);
    return `<button type="button" class="b42-cc" data-b42-cv="${esc(n)}"><span class="b42-row12"><span class="b42-cini" style="background:${cc(n)}">${esc(n[0])}</span><span class="b42-col grow"><b class="b42-ell">${ci?.ai ? '✦ ' : ''}${esc(n)}</b><span class="b42-mute sm">${used ? `${ce.length === 1 ? '1 kjøp' : `${ce.length} kjøp`} · ${Math.round((v / tot0) * 100)}${NB}% av totalen` : '0 kjøp · 0 % av totalen'}</span></span><span class="b42-chev">›</span></span>
      <span class="b42-between end"><b class="b42-mono b42-f24">${kr(v)}</b><span class="b42-delta ${!used ? 'mute' : !pv ? 'blue' : dd > 0 ? 'red' : 'green'}">${!used ? '–' : pv ? `${dd >= 0 ? '▲' : '▼'} ${kr(Math.abs(dd))}` : 'Ny'}</span></span>
      <span class="b42-spark">${mv.map((x, k) => `<i title="${months[k]}: ${kr(x)}" style="height:${Math.round((x / mx) * 100)}%;background:${used && k === mv.length - 1 ? cc(n) : 'var(--b-spark)'}"></i>`).join('')}</span>
      <span class="b42-mute sm b42-ell">${ce[0] ? `Sist: ${esc(ce[0].m)} · ${dS(ce[0].d)}` : 'Ikke brukt ennå'}</span></button>`;
  };
  const usedN = ent.map((x) => x[0]);
  const cards = [...ent.map(([n, v]) => card(n, v, true)), ...ALLC.filter((n) => !usedN.includes(n)).map((n) => card(n, 0, false))].join('');
  const totP = sum(prevE), dT = tot0 - totP, noRc = src.filter((e) => !e.rc).length;
  const kp = [[cm === 'mnd' ? `Brukt i ${MN[mm - 1]}` : `Brukt i ${yy}`, kr(ent.length ? tot0 : 0), totP ? `${dT >= 0 ? '▲' : '▼'} ${kr(Math.abs(dT))} mot ${cm === 'mnd' ? MN[(mm + 10) % 12] : yy - 1}` : 'Ingen tall for forrige periode', !totP ? '' : dT > 0 ? 'red' : 'green'],
    ['Største kategori', ent[0]?.[0] ?? '–', ent[0] ? `${kr(ent[0][1])} · ${Math.round((ent[0][1] / tot0) * 100)} %` : '', ''], ['Kategorier brukt', String(ent.length), `${src.length} kjøp totalt`, ''], ['Uten kvittering', String(noRc), noRc ? 'Legg ved i Utgifter' : 'Alt har kvittering', noRc ? 'amber' : 'green']];
  const pm = new Date(yy, mm - 2, 1), nm = new Date(yy, mm, 1), nd = s.ym >= CYM();
  return `<div class="b42-col g18"><div class="b42-mnav">${btn(`‹ ${cap(MN[pm.getMonth()])}`, 'data-b42="m-prev"')}<b class="b42-serif32">${cap(MN[mm - 1])} ${yy}</b>${btn(`${cap(MN[nm.getMonth()])} ›`, `data-b42="m-next"${nd ? ' disabled' : ''}`)}</div>
    <div class="b42-between"><b class="b42-serif28">Kategorier ${cm === 'mnd' ? `i ${MN[mm - 1]} ${yy}` : `i ${yy}`}</b><div class="b42-seg">${[['mnd', 'Måned'], ['ar', 'Hele året']].map(([k, n]) => `<button type="button" class="${cm === k ? 'on' : ''}" data-b42-catmode="${k}">${n}</button>`).join('')}</div></div>
    <div class="b42-kgrid">${kp.map(([l, v, sb, c]) => `<div class="b42-kpi"><span>${esc(l)}</span><b class="b42-mono b42-ell">${esc(v)}</b><small class="${c}">${esc(sb)}</small></div>`).join('')}</div>
    <div class="b42-cgrid">${cards}</div>
    ${ent.length ? '' : '<div class="b42-box b42-c">Ingen utgifter i perioden.</div>'}
    <form class="b42-box b42-col g12" data-b42-form="newcat"><b class="b42-f17">Ny kategori</b><span class="b42-mute">Glimt lager nye kategorier når en kvittering ikke passer (merket ✦). Kategoriene gjelder alle boligene.</span><div class="b42-row8 b42-wrap"><input class="b42-inp grow" name="name" placeholder="Ny kategori, f.eks. Grill" maxlength="40" autocomplete="off" aria-label="Ny kategori"><button class="b42-btn dark">+ Legg til kategori</button></div></form></div>`;
}

function projInfo(h, p) {
  const ex = done(h).filter((e) => e.proj === p.id), sm = sum(ex), bud = +p.budget || 0, pc = bud ? Math.min(100, (sm / bud) * 100) : 0;
  const stv = p.status ?? pstat()[p.id] ?? 'Pågår';
  return { ex, sm, bud, pct: `${pc}%`, barC: bud && sm > bud ? '#b23a2a' : '#2b5d8a', budT: bud ? (sm > bud ? `Over budsjettet med ${kr(sm - bud)}` : `${kr(bud - sm)} igjen av ${kr(bud)}`) : '', st: stv, stC: stv === 'Ferdig' ? 'done' : stv === 'Pågår' ? 'run' : 'plan', cnt: ex.length === 1 ? '1 kjøp' : `${ex.length} kjøp` };
}
function proTab(h) {
  const s = st(), P = B.det[h.id]?.projects ?? [];
  const PV = P.find((p) => p.id === s.pv);
  if (!PV) {
    const head = P.length ? `${P.length === 1 ? '1 prosjekt' : `${P.length} prosjekter`} · ${kr(P.reduce((t, p) => t + projInfo(h, p).sm, 0))} samlet` : 'Samle kjøp og regninger som hører til samme ting.';
    return `<div class="b42-col g16"><div class="b42-col"><b class="b42-serif30">Prosjekter</b><span class="b42-mute">${head}</span></div><div class="b42-pgrid">${P.map((p, i) => {
      const I = projInfo(h, p), rs = [...I.ex].sort((a, b) => b.d.localeCompare(a.d)), c = PCOL[i % PCOL.length];
      return `<button type="button" class="b42-pc" data-b42-pv="${p.id}"><span class="b42-pc-s" style="background:${c}"></span><span class="b42-col g16 b42-pc-b"><span class="b42-row12"><span class="b42-cini lg" style="background:${c}">${esc(p.name[0]?.toUpperCase() ?? '?')}</span><span class="b42-col g4"><b class="b42-f21">${esc(p.name)}</b><span class="b42-st ${I.stC}">${esc(I.st)}</span></span></span>
        <span class="b42-col"><b class="b42-serif34">${kr(I.sm)}</b><span class="b42-mute">${I.cnt}${rs[0] ? ` · sist ${dS(rs[0].d)}` : ''}</span></span>
        ${I.bud ? `<span class="b42-col g6"><span class="b42-bar"><i style="width:${I.pct};background:${I.barC}"></i></span><span class="b42-mute sm">${I.budT}</span></span>` : ''}
        <span class="b42-pc-r">${rs.slice(0, 3).map((e) => `<span><span class="b42-ell">${esc(e.m + (e.desc ? ` · ${e.desc}` : ''))}</span><b class="b42-mono">${kr(e.amt)}</b></span>`).join('') || '<em>Ingen kjøp ennå. Åpne og legg til, eller spør Glimt.</em>'}</span>
        <span class="b42-pc-o">Åpne prosjektet ›</span></span></button>`;
    }).join('')}<button type="button" class="b42-pc add" data-b42="new-proj"><span class="b42-plus">+</span><b class="b42-f19">Nytt prosjekt</b><span class="b42-mute">Samle kjøp og regninger til en oppussing, en brygge eller et basseng.</span></button></div></div>`;
  }
  const I = projInfo(h, PV), G = s.gres, gh = G ? G.ids.map((id) => done(h).find((e) => e.id === id)).filter(Boolean) : [], nSel = G ? gh.filter((e) => G.sel[e.id]).length : 0;
  const fr = done(h).filter((e) => !e.proj).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8);
  const sugg = [`Legg til alle kjøp relatert til ${PV.name.toLowerCase()}`, 'Finn kvitteringer fra Biltema', 'Legg til alt med kategori Maling'];
  return `<div class="b42-col g18"><div class="b42-between">${btn('‹ Alle prosjekter', 'data-b42="pv-back"')}<span class="b42-row8">${btn('Endre prosjekt', `data-b42-pedit="${PV.id}"`)}${btn('+ Legg til kjøp', `data-b42-addproj="${PV.id}"`, 'green')}</span></div>
    <div class="b42-box b42-col g10"><span class="b42-between"><b class="b42-serif32">${esc(PV.name)}</b><span class="b42-st ${I.stC}">${esc(I.st)}</span></span><span class="b42-between"><span class="b42-mute">${I.cnt}</span><b class="b42-mono b42-f24">${kr(I.sm)}</b></span>${I.bud ? `<span class="b42-bar lg"><i style="width:${I.pct};background:${I.barC}"></i></span><span class="b42-mute">${I.budT}</span>` : ''}</div>
    <div class="b42-box strong b42-col g12"><div class="b42-row12">${orb(32, !!s.gbusy)}<b class="b42-f19">Spør Glimt</b></div>
      <form class="b42-row8 b42-wrap" data-b42-form="pglimt"><input class="b42-inp pill grow" name="q" value="${esc(s.gq ?? '')}" placeholder="F.eks. «Legg til alle kjøp relatert til basseng»" autocomplete="off" aria-label="Spør Glimt om prosjektet"><button class="b42-btn dark">Spør</button></form>
      <div class="b42-chips">${sugg.map((t) => `<button type="button" class="b42-sugg" data-b42-pask="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      ${s.gbusy ? '<span class="b42-mute">✦ Glimt leser utgiftene og kvitteringene …</span>' : ''}
      ${G && !s.gbusy ? `<div class="b42-col g10 b42-gl"><span class="b42-f18">${gh.length ? `Glimt fant ${gh.length === 1 ? '1 kjøp' : `${gh.length} kjøp`} om «${esc(G.terms.join(' ') || G.q)}» som ikke er i prosjektet ennå, til sammen ${kr(sum(gh))}. Fjern hake på det som ikke hører til.` : `Glimt fant ingen kjøp om «${esc(G.terms.join(' ') || G.q)}» i denne boligen som ikke allerede er med.`}</span>
        ${gh.map((e) => { const on = !!G.sel[e.id]; return `<button type="button" class="b42-ck${on ? ' on' : ''}" data-b42-gtog="${e.id}" aria-pressed="${on}"><span class="b42-box2">${on ? '✓' : ''}</span><span class="b42-col"><b>${esc(e.m)}</b><small>${esc([dS(e.d), e.cat, e.desc, e.rc ? 'kvittering' : ''].filter(Boolean).join(' · '))}</small></span><b class="b42-mono">${kr(e.amt)}</b></button>`; }).join('')}
        <div class="b42-row8">${nSel ? btn(`Legg til ${nSel === 1 ? '1 valgt' : `${nSel} valgte`} i ${esc(PV.name)}`, 'data-b42="g-add"', 'green') : ''}${btn('Lukk', 'data-b42="g-clear"')}</div></div>` : ''}</div>
    <div class="b42-table">${I.ex.sort((a, b) => b.d.localeCompare(a.d)).map((e) => `<div class="b42-tr c3" data-b42-open="${e.h}:${e.id}" role="button" tabindex="0"><span class="b42-col"><b>${esc(e.m)}</b><small>${esc([dS(e.d), e.cat, e.desc].filter(Boolean).join(' · '))}</small></span><b class="b42-mono">${kr(e.amt)}</b>${btn('Fjern', `data-b42-unlink="${e.id}"`, 'line sm')}</div>`).join('') || '<div class="b42-tempty"><span>Ingen kjøp lagt til ennå.</span></div>'}</div>
    ${fr.length ? `<div class="b42-col g10"><b class="b42-f19">Legg til en utgift du allerede har registrert</b><div class="b42-table">${fr.map((e) => `<div class="b42-tr c3 static"><span class="b42-col"><b>${esc(e.m)}</b><small>${dS(e.d)} · ${esc(e.cat)}</small></span><b class="b42-mono">${kr(e.amt)}</b>${btn('Legg til', `data-b42-link="${e.id}"`, 'dark sm')}</div>`).join('')}</div></div>` : ''}</div>`;
}

function tilTab(h, d) {
  const mem = d.members ?? h.members ?? [], owners = mem.filter((m) => m.role === 'owner').length, isOwner = d.isOwner ?? h.role === 'owner';
  return `<div class="b42-col g16"><div class="b42-table">${mem.map((m, i) => {
    const canRole = isOwner && !(m.role === 'owner' && owners < 2) && !m.you, canRm = (isOwner && !m.you) || (m.you && !(m.role === 'owner' && owners < 2));
    return `<div class="b42-mem"><span class="b42-av" style="background:${PCOL[i % PCOL.length]}">${esc(String(m.name ?? '?')[0].toUpperCase())}</span><span class="b42-col"><b>${esc(m.name)}${m.you ? ' (deg)' : ''}</b><span class="b42-mute">${esc(ROLE[m.role] ?? 'Kan se og legge inn')}${m.login === false ? ' · uten innlogging' : ''}</span></span>
      <span class="b42-row8">${canRole ? `<select class="b42-inp sm" data-b42-role="${m.id}" aria-label="Rolle for ${esc(m.name)}">${Object.entries(ROLE).map(([k, n]) => `<option value="${k}"${k === m.role ? ' selected' : ''}>${n}</option>`).join('')}</select>` : ''}${canRm ? btn(m.you ? 'Forlat' : 'Fjern', `data-b42-rm="${m.id}"${m.you ? ' data-leave="1"' : ''}`) : ''}</span></div>`;
  }).join('')}</div>
  ${isOwner ? `<form class="b42-box b42-col g8" data-b42-form="invite"><b class="b42-f19">Inviter en person</b><span class="b42-mute">Skriv navn eller e-post. Personen kan se og legge inn utgifter for denne boligen.</span><div class="b42-row8 b42-wrap"><input class="b42-inp grow" name="who" placeholder="Navn eller e-post" autocomplete="off" aria-label="Navn eller e-post" list="b42-users"><datalist id="b42-users">${(B.users ?? []).map((x) => `<option value="${esc(x.displayName ?? x.name ?? x.username)}">`).join('')}</datalist><button class="b42-btn dark">Inviter</button></div></form>` : ''}</div>`;
}

/* ===================== Ark og paneler ===================== */

function modals() {
  const s = st();
  return [homeModal(s.hm), addMenu(s.am), expPanel(s.ex), projModal(s.pj), rcView(s.rcv), rcFull(s.rcf)].join('');
}
const sheet = (title, inner, cls = '') => `<div class="b42-ov" data-b42-ov><div class="b42-sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="b42-between"><b class="b42-serif32">${esc(title)}</b>${btn('Lukk', 'data-b42="close"')}</div>${inner}</div></div>`;
function homeModal(H) {
  if (!H) return '';
  const prev = H.preview ? `${cssU(H.preview)} center / cover` : H.img ? `${cssU(H.img)} center / cover` : H.color;
  return sheet(H.id ? 'Rediger bolig' : 'Ny bolig', `<div class="b42-hprev" style="background:${prev}">${H.preview || H.img ? '' : esc((H.name || '?')[0].toUpperCase())}</div>
    ${H.id ? `<div class="b42-row8"><label class="b42-btn line">${H.busy ? 'Laster opp …' : 'Velg bilde'}<input type="file" accept="image/*" data-b42-himg hidden></label>${H.img || H.preview ? btn('Fjern bilde', 'data-b42="h-rmimg"', 'link red') : ''}</div>` : ''}
    <label class="b42-f">Navn<input class="b42-inp" data-b42-h="name" value="${esc(H.name)}" placeholder="F.eks. Hytta på Toten" maxlength="60"></label>
    <div class="b42-col g8"><span class="b42-flab">Type</span><div class="b42-chips">${chips(TYPES.map((t) => [t, t]), H.type, 'data-b42-htype')}</div></div>
    <label class="b42-f">Adresse<input class="b42-inp" data-b42-h="address" value="${esc(H.address)}" placeholder="Gate og sted" maxlength="120"></label>
    <div class="b42-col g8"><span class="b42-flab">Farge</span><div class="b42-row10">${COLS.map((c) => `<button type="button" class="b42-sw${H.color === c ? ' on' : ''}" style="background:${c};--c:${c}" data-b42-hcol="${c}" aria-label="Velg farge ${c}"></button>`).join('')}</div></div>
    ${H.err ? '<span class="b42-err">Skriv inn et navn.</span>' : ''}
    <div class="b42-col g8">${btn('Lagre', 'data-b42="h-save"', 'dark lg')}${H.id && homes().length > 1 ? btn(H.arm ? 'Trykk igjen for å slette boligen og alle utgiftene' : 'Slett boligen', 'data-b42="h-del"', 'link red') : ''}</div>`);
}
function addMenu(A) {
  if (!A) return '';
  const L = homes(), hh = L.find((x) => x.id === A.h) ?? L[0], mail = B.det[hh?.id]?.mailAddress ?? B.det[hh?.id]?.email ?? null;
  return sheet('Legg til utgift', `${L.length > 1 ? `<div class="b42-col g8"><span class="b42-flab">Hvilken bolig?</span><div class="b42-chips">${L.map((x) => `<button type="button" class="b42-hchip${x.id === hh?.id ? ' on' : ''}" data-b42-amh="${x.id}"><span style="background:${thumbBg(x)}"></span>${esc(hName(x))}</button>`).join('')}</div></div>` : ''}
    <div class="b42-amg"><label class="b42-am green"><b>Ta bilde av kvittering</b><span>Bruk kameraet</span><input type="file" accept="image/*" capture="environment" data-b42-up hidden></label>
      <label class="b42-am"><b>Last opp fil</b><span>Bilde eller PDF, flere om gangen</span><input type="file" multiple accept="image/*,application/pdf" data-b42-up hidden></label>
      <button type="button" class="b42-am" data-b42="am-mail"><b>Send fra e-post</b><span>Videresend kvitteringen</span></button>
      <button type="button" class="b42-am" data-b42="am-manual"><b>Skriv inn selv</b><span>Uten kvittering</span></button>
      <label class="b42-am wide"><b>Importer fra bank/fil</b><span>CSV, XLSX eller PDF-kontoutskrift · alle linjene går til ${esc(hName(hh))} til gjennomgang</span><input type="file" accept=".csv,.xlsx,.xls,.pdf,.txt" data-b42-imp hidden></label></div>
    ${A.mail ? `<div class="b42-box b42-col g10">${mail ? `<span>Send eller videresend kvitteringen til denne adressen, så havner den på riktig bolig:</span><b class="b42-mono b42-brk">${esc(mail)}</b>${btn(A.cp ? '✓ Kopiert' : 'Kopier adressen', `data-b42-copy="${esc(mail)}"`, 'dark')}` : `<span>Videresend kvitteringen til kvitteringsadressen din (Innstillinger → Import → E-post), og skriv «${esc(hName(hh))}» i emnefeltet. Glimt legger den i riktig bolig.</span>`}</div>` : ''}`);
}
function expPanel(X) {
  if (!X) return '';
  const L = homes(), P = B.det[X.h]?.projects ?? [], ALLC = allCats();
  const amtBig = `−${n2(num(X.amt))}`, hh = L.find((x) => x.id === X.h);
  const lines = X.lines ?? [];
  const rcCard = X.rid ? `<button type="button" class="b42-orig" data-b42="ex-view"><span class="b42-paper sm${X.rid ? ' img' : ''}" style="background-image:${cssU(`/finans/api/folders/${X.h}/receipts/${encodeURIComponent(X.rid)}/thumb`)}"><i></i><i></i><span></span><b></b></span><span class="b42-col grow"><b>Vis original kvittering</b><small class="b42-ell">Kvittering fra ${dS(X.d)}${X.m ? ` · ${esc(X.m)}` : ''}</small></span><span class="b42-gx">⤢</span></button>` : '';
  return `<div class="b42-ov side" data-b42-ov><aside class="b42-panel" role="dialog" aria-modal="true" aria-label="${esc(X.m || 'Ny utgift')}">
    <div class="b42-between start">${logo({ description: X.m || '?', domain: X.domain }, 58, 14)}<button type="button" class="b42-x" data-b42="close" aria-label="Lukk">×</button></div>
    <div class="b42-col g4"><b class="b42-f26 b700">${esc(X.m || (X.id ? 'Utgift' : 'Ny utgift'))}</b><span class="b42-mute2">${esc([X.d ? `${dL(X.d)} ${X.d.slice(0, 4)}` : '', hName(hh)].filter(Boolean).join(' · '))}</span></div>
    <b class="b42-big">${amtBig}<small>kr</small></b>${rcCard}
    <div class="b42-g2"><label class="b42-f sm">Butikk<input class="b42-inp soft" data-b42-x="m" value="${esc(X.m)}" placeholder="F.eks. Biltema"></label><label class="b42-f sm">Beløp (kr)<input class="b42-inp soft b42-mono" data-b42-x="amt" value="${esc(X.amt)}" inputmode="decimal" placeholder="0"></label></div>
    <label class="b42-f sm">Hva ble kjøpt<input class="b42-inp soft" data-b42-x="desc" value="${esc(X.desc)}" placeholder="F.eks. Maling og pensler"></label>
    ${(X.ai || lines.length) && !X.busy ? `<div class="b42-ai"><span class="b42-row8 b700">${orb(20)}Glimt leste kvitteringen</span>${X.ai ? `<span>${esc(X.ai)}</span>` : ''}${lines.length ? `<div class="b42-lines">${lines.map((l) => { const a = +(l.amount ?? l.price ?? l.a ?? 0); return `<span><span>${esc(l.text ?? l.description ?? l.name ?? l.t ?? '')}</span><span class="b42-mono">${a < 0 ? '−' : ''}${n2(a)}</span></span>`; }).join('')}</div>` : ''}</div>` : ''}
    ${X.busy ? '<div class="b42-ai shim">✦ Glimt leser kvitteringen på nytt …</div>' : ''}
    ${X.rid ? `<button type="button" class="b42-reai" data-b42="ex-reai"${X.busy ? ' disabled' : ''}>${orb(40, !!X.busy)}<span class="b42-col grow"><b>${X.busy ? 'Glimt leser kvitteringen …' : X.ai ? 'Analyser på nytt med Glimt' : 'Analyser med Glimt'}</b><small>${X.busy ? 'Henter butikk, beløp, varelinjer og kategori' : 'Leser originalen igjen · butikk, beløp, varelinjer og kategori'}</small></span><span class="b42-re">↻</span></button>` : ''}
    <div class="b42-col g8"><span class="b42-flab sm">Kategori</span><div class="b42-chips">${chips(ALLC.map((c) => [c, c]), X.cat, 'data-b42-xcat')}${X.nc == null ? '<button type="button" class="b42-chip dash" data-b42="ex-nc">+ Ny kategori</button>' : ''}</div>
      ${X.nc != null ? `<div class="b42-row8 b42-wrap"><input class="b42-inp soft grow" data-b42-x="nc" value="${esc(X.nc)}" placeholder="Navn på kategori" aria-label="Navn på kategori">${btn('Legg til', 'data-b42="ex-nc-save"', 'dark')}${btn('Avbryt', 'data-b42="ex-nc-cancel"')}</div>` : ''}</div>
    <div class="b42-g2"><label class="b42-f sm">Dato<input type="date" class="b42-inp soft" data-b42-x="d" value="${esc(X.d)}"></label><div class="b42-f sm">Kvittering<span class="b42-row6">${chips([['1', 'Ja'], ['0', 'Nei']], X.rc ? '1' : '0', 'data-b42-xrc')}</span></div></div>
    ${L.length > 1 ? `<div class="b42-col g8"><span class="b42-flab sm">Bolig</span><div class="b42-chips">${chips(L.map((x) => [x.id, hName(x)]), X.h, 'data-b42-xh')}</div></div>` : ''}
    ${P.length ? `<div class="b42-col g8"><span class="b42-flab sm">Hører til prosjekt</span><div class="b42-chips">${chips([['', 'Ingen'], ...P.map((p) => [p.id, p.name])], X.proj ?? '', 'data-b42-xp')}</div></div>` : ''}
    ${X.err ? '<span class="b42-err">Skriv inn butikk og beløp.</span>' : ''}
    <div class="b42-col g8">${btn(X.review ? '✓ Godkjenn og lagre' : 'Lagre', 'data-b42="ex-save"', 'dark lg')}${X.id ? btn(X.arm ? 'Trykk igjen for å slette' : 'Slett utgiften', 'data-b42="ex-del"', 'link red') : ''}</div></aside></div>`;
}
function projModal(PJ) {
  if (!PJ) return '';
  return sheet(PJ.id ? 'Endre prosjekt' : 'Nytt prosjekt', `<label class="b42-f">Navn<input class="b42-inp" data-b42-p="name" value="${esc(PJ.name)}" placeholder="F.eks. Male terrassen" maxlength="80"></label>
    <label class="b42-f">Budsjett (valgfritt, kr)<input class="b42-inp b42-mono" data-b42-p="budget" value="${esc(PJ.budget)}" inputmode="numeric"></label>
    <div class="b42-col g8"><span class="b42-flab">Status</span><div class="b42-chips">${chips(['Planlagt', 'Pågår', 'Ferdig'].map((x) => [x, x]), PJ.status, 'data-b42-pst')}</div></div>
    ${PJ.err ? '<span class="b42-err">Skriv inn et navn.</span>' : ''}
    <div class="b42-col g8">${btn('Lagre', 'data-b42="p-save"', 'dark lg')}${PJ.id ? btn(PJ.arm ? 'Trykk igjen for å slette prosjektet' : 'Slett prosjektet', 'data-b42="p-del"', 'link red') : ''}</div>`);
}
function rcView(V) {
  if (!V) return '';
  const hh = homes().find((x) => x.id === V.h), url = fileUrl(V);
  const fields = [['Butikk', V.m], ['Dato', V.d ? dL(V.d) : ''], ['Beløp', V.amt ? kr(V.amt) : 'Mangler'], ['Kategori', V.cat], ['Bolig', hName(hh)], ['Fil', V.file ?? '']].filter((f) => f[1]);
  return `<div class="b42-ov" data-b42-ov><div class="b42-sheet wide" role="dialog" aria-modal="true" aria-label="Original kvittering"><div class="b42-rcv-img" data-b42="rc-full" title="Se originalen">${url ? `<img class="b42-rcimg" src="${esc(url)}" alt="Kvittering fra ${esc(V.m)}">` : `<div class="b42-roll"><b>${esc(String(V.m).toUpperCase())}</b><span>${esc(hh?.address ?? '')}</span><span>${esc(V.d ? V.d.split('-').reverse().join('.') : '')}</span><hr>${(V.lines?.length ? V.lines : [{ text: V.desc || 'Varer', amount: V.amt }]).map((l) => `<span class="lr"><span>${esc(l.text ?? l.description ?? l.t ?? '')}</span><span>${n2(+(l.amount ?? l.a ?? 0))}</span></span>`).join('')}<hr><span class="lr b700"><span>TOTALT</span><span>${n2(V.amt)}</span></span></div>`}</div>
    <div class="b42-col g14"><div class="b42-between"><span class="b42-kick">${V.review ? 'ORIGINAL · VENTER PÅ GODKJENNING' : 'ORIGINAL KVITTERING'}</span>${btn('Lukk', 'data-b42="close"', 'line sm')}</div><b class="b42-serif32">${esc(V.m)}</b>
      <div class="b42-table">${fields.map(([k, v]) => `<div class="b42-kv"><span class="b42-mute">${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${url ? '' : '<span class="b42-mute sm">Originalfilen finnes ikke for denne utgiften, så kvitteringen vises slik Glimt leste den.</span>'}
      <div class="b42-row10 b42-wrap">${url ? btn('Se originalen ⤢', 'data-b42="rc-full"', 'green') : ''}${btn('Endre', `data-b42-open="${V.h}:${V.id}"`, 'dark')}${url ? `<a class="b42-btn line" href="${esc(url)}" download>Last ned</a>` : ''}</div></div></div></div>`;
}
function rcFull(F) {
  if (!F) return '';
  const url = fileUrl(F);
  return `<div class="b42-full" data-b42-full><div class="b42-between"><b class="b42-serif24">${esc(F.m)} · original</b><span class="b42-row10">${url ? `<a class="b42-btn wline" href="${esc(url)}" target="_blank" rel="noopener">Åpne i ny fane ↗</a>` : ''}${btn('Lukk', 'data-b42="rcf-close"', 'white')}</span></div>
    <div class="b42-full-b" data-b42-zoom>${url ? `<img class="b42-rcimg full" src="${esc(url)}" alt="Original kvittering" style="transform:scale(${F.z ?? 1})">` : ''}</div></div>`;
}

/* ===================== Handlinger ===================== */

const findE = (k) => { const [hid, id] = String(k).split(':'); const h = homes().find((x) => String(x.id) === hid); return h ? exps(h).find((e) => String(e.id) === id) ?? null : null; };
function flash(t, undo = null) {
  const s = st(); s.toast = { t, undo }; render();
  clearTimeout(flash.t); flash.t = setTimeout(() => { s.toast = null; render(); }, 5500);
}
function openEx(o = {}) {
  const s = st(), h = curHome();
  s.ex = { h: h?.id ?? homes()[0]?.id, d: TK(), m: '', desc: '', cat: 'Annet', amt: '', rc: false, proj: null, ...o, amt: o.amt != null && o.amt !== '' ? String(o.amt).replace('.', ',') : '' };
  s.am = null; render();
  const X = s.ex;
  if (X.rid && !X.lines && !B.lines[X.rid]) {
    api(`/receipts/${encodeURIComponent(X.rid)}`).then((r) => { B.lines[X.rid] = r?.lines ?? r?.items ?? []; if (s.ex === X) { X.lines = B.lines[X.rid]; X.ai ||= r?.aiDescription ?? r?.aiShort ?? ''; render(); } }).catch(() => { B.lines[X.rid] = []; });
  } else if (X.rid && B.lines[X.rid]) X.lines ??= B.lines[X.rid];
  setTimeout(() => document.querySelector('[data-b42-x="m"]')?.focus(), 30);
}
const catIdOf = (n) => { const c = (B.cats?.categories ?? []).find((x) => x.name === n); return c?.id ?? null; };
async function patchE(h, id, body) { B.det[h] = await api(`/folders/${h}/entries/${id}`, { method: 'PATCH', json: body }); }
async function approve(e, silent) {
  await patchE(e.h, e.id, { status: 'ok' });
  if (!silent) flash(`Godkjent: ${e.m}`, async () => { await patchE(e.h, e.id, { status: 'review' }); render(); });
}
async function uploadFiles(hid, files) {
  if (!files.length || !hid) return;
  const fd = new FormData();
  for (const f of files) fd.append('file', f);
  const r = await api(`/folders/${hid}/receipts`, { method: 'POST', body: fd });
  const n = r?.jobs?.length ?? files.length;
  st().am = null;
  if (curHome()?.id !== hid) location.hash = `#/dir/${hid}`;
  flash(`✦ Glimt leser ${n === 1 ? 'kvitteringen' : `${n} kvitteringer`}. Sjekk og godkjenn under «Glimt har lest …».`);
  const poll = async (i) => { if (i > 24 || u.page !== 'dir') return; await reloadHome(hid).catch(() => {}); render(); if (exps(homes().find((x) => x.id === hid) ?? { id: hid }).some((e) => e.pending)) setTimeout(() => poll(i + 1), 2500); };
  setTimeout(() => poll(0), 1500);
}
async function saveEx() {
  const s = st(), X = s.ex, a = num(X.amt);
  if (!String(X.m).trim() || !a) { X.err = true; return render(); }
  const body = { merchant: X.m.trim(), description: X.m.trim(), amount: a, date: X.d || TK(), note: X.desc ?? '' };
  const cid = catIdOf(X.cat); if (cid) body.categoryId = cid; else body.category = X.cat;
  body.projectId = X.proj || null;
  if (X.id && X.h0 && X.h0 !== X.h) {
    // Flytt til en annen bolig: serveren tar imot folderId når den kan; ellers ny post der og slett den gamle (uten kvittering).
    try { await api(`/folders/${X.h0}/entries/${X.id}`, { method: 'PATCH', json: { ...body, folderId: X.h, homeId: X.h } }); }
    catch { if (X.rid) { toast('Kvitteringen kan ikke flyttes ennå'); return; } await api(`/folders/${X.h}/entries`, { method: 'POST', json: { ...body, description: X.m.trim() } }); await api(`/folders/${X.h0}/entries/${X.id}`, { method: 'DELETE' }); }
    await Promise.all([reloadHome(X.h0), reloadHome(X.h)]);
  } else if (X.id) {
    await patchE(X.h, X.id, { ...body, ...(X.review ? { status: 'ok' } : {}) });
  } else {
    B.det[X.h] = await api(`/folders/${X.h}/entries`, { method: 'POST', json: { ...body, description: X.m.trim() } });
    if (curHome()?.id === X.h) { s.ym = body.date.slice(0, 7); }
  }
  s.ex = null;
  flash(`${X.id ? 'Endret' : 'Lagt til'}: ${X.m.trim()} · ${kr(a)}`);
  B.homes = await api('/folders').catch(() => B.homes);
}
async function reAi() {
  const s = st(), X = s.ex;
  if (!X?.rid || X.busy) return;
  X.busy = true; render();
  try {
    let r = null;
    try { r = await api(`/folders/${X.h}/entries/${X.id}/reanalyze`, { method: 'POST', json: { keep: X.touched ?? [] } }); }
    catch (e) { if (e.status !== 404 && e.status !== 405) throw e; await api(`/receipts/${encodeURIComponent(X.rid)}/reread`, { method: 'POST' }); }
    // Prompt 50: følg jobben (GET /jobs/:id hvert 1,5 s, maks 5 min) – lesingen holder aldri en forespørsel åpen.
    if (r?.jobId) {
      for (let i = 0; i < 200; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        const j = await api(`/jobs/${encodeURIComponent(r.jobId)}`).catch((e) => (e.status === 404 ? { status: 'done' } : null));
        if (!j || j.status === 'running') continue;
        if (j.status === 'error') throw Object.assign(new Error(j.error || 'Lesingen feilet'), { status: j.httpStatus ?? 500, kode: j.kode ?? null, data: j });
        break;
      }
    }
    // Vent på at kvitteringsleseren er ferdig, og hent varelinjene på nytt. Felt brukeren har endret beholdes.
    for (let i = 0; i < 20; i++) {
      const rc = await api(`/receipts/${encodeURIComponent(X.rid)}`).catch(() => null);
      if (rc && !['pending', 'processing'].includes(rc.status)) { r = { ...rc, ...(r ?? {}) }; break; }
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    const d = await reloadHome(X.h).catch(() => null), e = d?.entries?.find((x) => x.id === X.id);
    if (s.ex !== X) return;
    const keep = new Set(X.touched ?? []);
    if (!keep.has('m') && (r?.merchant || e?.description)) X.m = r?.merchant ?? e.description;
    if (!keep.has('amt') && (r?.total ?? e?.amount)) X.amt = String(r?.total ?? e.amount).replace('.', ',');
    if (e?.category && !keep.has('cat')) X.cat = e.category;
    X.lines = r?.lines ?? r?.items ?? X.lines; B.lines[X.rid] = X.lines;
    X.ai = r?.aiDescription ?? r?.aiShort ?? e?.aiShort ?? X.ai;
    flash('✦ Glimt leste kvitteringen på nytt');
  } catch (err) { toast((await import('./reread50.js')).rereadError50(err).text); } finally { if (s.ex === X) X.busy = false; render(); }
}
async function saveHome() {
  const s = st(), H = s.hm;
  if (!String(H.name).trim()) { H.err = true; return render(); }
  let id = H.id;
  if (id) await api(`/folders/${id}`, { method: 'PATCH', json: { name: H.name.trim(), type: H.type, address: H.address.trim(), color: H.color, ...(H.rmImg ? { background: 'color' } : {}) } });
  else { const r = await api('/folders', { method: 'POST', json: { name: H.name.trim(), type: TYPES.includes(H.type) ? H.type : 'Annet', address: H.address.trim() } }); id = r.id; await api(`/folders/${id}`, { method: 'PATCH', json: { color: H.color } }).catch(() => {}); }
  s.hm = null;
  await loadB42();
  flash(H.id ? `Lagret ${H.name.trim()}` : `${H.name.trim()} er lagt til`);
}
function glimtFind(h, PV, q) {
  const s = st();
  q = String(q ?? '').trim(); if (!q) return;
  s.gq = q; s.gbusy = true; s.gres = null; render();
  const T = terms(q), local = () => done(h).filter((e) => e.proj !== PV.id && T.all.some((t) => `${e.m} ${e.desc} ${e.ai} ${e.cat} ${(e.lines ?? []).map((l) => l.text ?? '').join(' ')}`.toLowerCase().includes(t))).sort((a, b) => b.d.localeCompare(a.d)).map((e) => e.id);
  // Serverens Glimt (boliger.search_expenses) når den finnes; lokal søkeordtolkning ellers. Kobler aldri uten bekreftelse.
  api(`/folders/${h.id}/projects/${PV.id}/candidates`, { method: 'POST', json: { q } }).then((r) => (Array.isArray(r?.ids) ? r.ids : Array.isArray(r?.items) ? r.items.map((x) => x.id ?? x.entryId) : local())).catch(() => local())
    .then((ids) => { const sel = {}; ids.forEach((id) => { sel[id] = true; }); s.gbusy = false; s.gres = { q, terms: T.base, ids, sel }; render(); });
}
async function linkTo(hid, ids, pid) {
  for (const id of ids) B.det[hid] = await api(`/folders/${hid}/entries/${id}`, { method: 'PATCH', json: { projectId: pid } });
}

function csv(h) {
  const s = st(), yy = s.ym.slice(0, 4), list = done(h).filter((e) => e.d.startsWith(yy)).sort((a, b) => b.d.localeCompare(a.d));
  const rows = [['Dato', 'Hvor', 'Hva', 'Kategori', 'Beløp', 'Kvittering'], ...list.map((e) => [e.d, e.m, e.desc || e.ai || '', e.cat, String(e.amt).replace('.', ','), e.rc ? 'Ja' : 'Nei'])];
  const t = `﻿${rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv;charset=utf-8' })); a.download = `${hName(h)} ${yy}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let bound = false;
export function bindB42(el) {
  const wrap = (fn) => async (e) => { try { await fn(e); } catch (err) { toast(err.message); } };
  el.addEventListener('click', wrap(async (e) => {
    if (u.page !== 'dir') return;
    const t = e.target, d = (q) => t.closest(q), s = st(), h = curHome();
    let x;
    if (d('[data-b42-stop]') && !t.matches('input')) return;
    // Prompt 46: lukkes kvitteringen (over utgiftspanelet), står panelet åpent som før.
    if ((x = d('[data-b42-ov]')) && t === x) { if (s.rcv && !x.classList.contains('side')) { s.rcv = null; return render(); } s.hm = s.am = s.ex = s.pj = s.rcv = null; return render(); }
    if ((x = d('[data-b42-full]')) && (t === x || t.matches('[data-b42-zoom]'))) { s.rcf = null; return render(); }
    if ((x = d('[data-b42-go]'))) return goHome(+x.dataset.b42Go);
    if ((x = d('[data-b42-edit]'))) { const hh = homes().find((y) => y.id === +x.dataset.b42Edit); s.hm = { id: hh.id, name: hh.name, type: hh.type ?? 'Enebolig', address: hh.address ?? '', color: homeColor(hh), img: homeImg(hh) }; return render(); }
    if ((x = d('[data-b42-tab]'))) { s.cv = null; s.pv = null; s.gres = null; location.hash = `#/dir/${h.id}${x.dataset.b42Tab === 'utg' ? '' : `?fane=${TAB_IDS[x.dataset.b42Tab]}`}`; return; }
    if ((x = d('[data-b42-year]'))) { const Y = +x.dataset.b42Year; s.ym = Y === CY() ? CYM() : `${Y}-12`; return render(); }
    if ((x = d('[data-b42-view]'))) { e.stopPropagation(); s.rcv = findE(x.dataset.b42View); return render(); }
    if ((x = d('[data-b42-open]'))) { const en = findE(x.dataset.b42Open); if (!en) return; s.rcv = null; return openEx({ ...en, h0: en.h, amt: en.amt }); }
    if ((x = d('[data-b42-ok]'))) { await approve(findE(x.dataset.b42Ok)); return render(); }
    if ((x = d('[data-b42-rvcat]'))) { const [hid, id, ...c] = x.dataset.b42Rvcat.split(':'); const n = c.join(':'), cid = catIdOf(n); await patchE(+hid, +id, cid ? { categoryId: cid } : { category: n }); return render(); }
    if ((x = d('[data-b42-cv]'))) { s.cv = x.dataset.b42Cv; s.cvMode = null; render(); return window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if ((x = d('[data-b42-cvmode]'))) { s.cvMode = x.dataset.b42Cvmode; return render(); }
    if ((x = d('[data-b42-catmode]'))) { s.catMode = x.dataset.b42Catmode; return render(); }
    if ((x = d('[data-b42-addcat]'))) return openEx({ h: h.id, cat: x.dataset.b42Addcat });
    if ((x = d('[data-b42-delcat]'))) { if (!confirm('Slette kategorien? Utgiftene flyttes til «Annet».')) return; B.cats = await api(`/boliger/categories/${x.dataset.b42Delcat}`, { method: 'DELETE' }); s.cv = null; await loadB42(); return flash('Kategorien er slettet. Utgiftene er flyttet til Annet.'); }
    if ((x = d('[data-b42-pv]'))) { s.pv = +x.dataset.b42Pv; s.gres = null; s.gq = ''; return render(); }
    if ((x = d('[data-b42-pedit]'))) { const p = B.det[h.id].projects.find((y) => y.id === +x.dataset.b42Pedit); s.pj = { id: p.id, h: h.id, name: p.name, budget: p.budget ? String(p.budget) : '', status: p.status ?? pstat()[p.id] ?? 'Pågår' }; return render(); }
    if ((x = d('[data-b42-addproj]'))) return openEx({ h: h.id, proj: +x.dataset.b42Addproj });
    if ((x = d('[data-b42-pask]'))) { const PV = B.det[h.id].projects.find((p) => p.id === s.pv); return glimtFind(h, PV, x.dataset.b42Pask); }
    if ((x = d('[data-b42-gtog]'))) { const id = +x.dataset.b42Gtog; s.gres.sel[id] = !s.gres.sel[id]; return render(); }
    if ((x = d('[data-b42-unlink]'))) { const id = +x.dataset.b42Unlink, PV = s.pv; await linkTo(h.id, [id], null); return flash(`Fjernet fra ${B.det[h.id].projects.find((p) => p.id === PV)?.name ?? 'prosjektet'}`, async () => { await linkTo(h.id, [id], PV); render(); }); }
    if ((x = d('[data-b42-link]'))) { const id = +x.dataset.b42Link, PV = B.det[h.id].projects.find((p) => p.id === s.pv); await linkTo(h.id, [id], PV.id); return flash(`Lagt til i ${PV.name}`, async () => { await linkTo(h.id, [id], null); render(); }); }
    if ((x = d('[data-b42-rm]'))) { const leave = !!x.dataset.leave, m = (B.det[h.id].members ?? []).find((y) => y.id === +x.dataset.b42Rm); if (!confirm(leave ? `Forlate «${h.name}»? Du mister tilgangen til boligen.` : `Fjerne ${m?.name} fra «${h.name}»?`)) return; await api(`/folders/${h.id}/members/${m.id}`, { method: 'DELETE' }); if (leave) { await loadB42(); return goHome(null); } await reloadHome(h.id); return flash(`${m?.name} har ikke lenger tilgang`); }
    if ((x = d('[data-b42-amh]'))) { s.am.h = +x.dataset.b42Amh; return render(); }
    if ((x = d('[data-b42-copy]'))) { try { await navigator.clipboard.writeText(x.dataset.b42Copy); } catch { /* manuelt */ } s.am.cp = true; return render(); }
    if ((x = d('[data-b42-htype]'))) { s.hm.type = x.dataset.b42Htype; return render(); }
    if ((x = d('[data-b42-hcol]'))) { s.hm.color = x.dataset.b42Hcol; return render(); }
    if ((x = d('[data-b42-xcat]'))) { s.ex.cat = x.dataset.b42Xcat; (s.ex.touched ??= []).push('cat'); return render(); }
    if ((x = d('[data-b42-xrc]'))) { s.ex.rc = x.dataset.b42Xrc === '1'; return render(); }
    if ((x = d('[data-b42-xh]'))) { s.ex.h = +x.dataset.b42Xh; s.ex.proj = null; return render(); }
    if ((x = d('[data-b42-xp]'))) { s.ex.proj = +x.dataset.b42Xp || null; return render(); }
    if ((x = d('[data-b42-pst]'))) { s.pj.status = x.dataset.b42Pst; return render(); }
    const a = d('[data-b42]')?.dataset.b42;
    if (!a) return;
    switch (a) {
      case 'back': return goHome(null);
      case 'add': s.am = { h: h?.id ?? homes()[0]?.id }; return render();
      case 'new-home': s.hm = { id: null, name: '', type: 'Enebolig', address: '', color: COLS[homes().length % COLS.length] }; render(); return document.querySelector('[data-b42-h="name"]')?.focus();
      case 'close': if (s.rcv && d('[data-b42="close"]')?.closest('.b42-ov:not(.side)')) { s.rcv = null; return render(); } s.hm = s.am = s.ex = s.pj = s.rcv = null; return render(); // prompt 46
      case 'gs': s.gsOn = !s.gsOn; render(); if (s.gsOn) document.querySelector('[data-b42-gsq]')?.focus(); return;
      case 'sq-close': s.sq = null; return render();
      case 'undo': { const f = s.toast?.undo; s.toast = null; render(); if (f) await f(); return; }
      case 'y-prev': case 'y-next': { const r = document.querySelector('[data-b42-yrow]'); r?.scrollBy({ left: (a === 'y-prev' ? -1 : 1) * r.clientWidth * 0.8, behavior: 'smooth' }); return; }
      case 'yr-prev': s.ym = `${+s.ym.slice(0, 4) - 1}-12`; return render();
      case 'yr-next': { const Y = +s.ym.slice(0, 4) + 1; if (Y > CY()) return; s.ym = Y === CY() ? CYM() : `${Y}-12`; return render(); }
      case 'm-prev': case 'm-next': { const [yy, mm] = s.ym.split('-').map(Number), dt = new Date(yy, mm - 1 + (a === 'm-prev' ? -1 : 1), 1), ym = dt.toLocaleDateString('sv-SE').slice(0, 7); if (ym > CYM()) return; s.ym = ym; return render(); }
      case 'print': return window.print();
      case 'csv': return csv(h);
      case 'ok-all': { const L = exps(h).filter((r) => r.review && r.amt && !r.pending); for (const r of L) await approve(r, true); return flash(`Godkjent: ${L.length} kvitteringer`); }
      case 'cv-back': s.cv = null; return render();
      case 'pv-back': s.pv = null; s.gres = null; return render();
      case 'new-proj': s.pj = { id: null, h: h.id, name: '', budget: '', status: 'Pågår' }; render(); return document.querySelector('[data-b42-p="name"]')?.focus();
      case 'g-add': { const PV = B.det[h.id].projects.find((p) => p.id === s.pv), ids = s.gres.ids.filter((id) => s.gres.sel[id]); s.gres = null; s.gq = ''; await linkTo(h.id, ids, PV.id); return flash(`✦ Glimt la ${ids.length} kjøp i ${PV.name}`, async () => { await linkTo(h.id, ids, null); render(); }); }
      case 'g-clear': s.gres = null; s.gbusy = false; return render();
      case 'am-mail': s.am.mail = !s.am.mail; return render();
      case 'am-manual': return openEx({ h: s.am.h });
      case 'h-save': return saveHome();
      case 'h-del': { const H = s.hm; if (!H.arm) { H.arm = true; return render(); } await api(`/folders/${H.id}`, { method: 'DELETE' }); s.hm = null; await loadB42(); flash(`${H.name} er slettet`); return goHome(null); }
      case 'h-rmimg': s.hm.img = ''; s.hm.preview = null; s.hm.rmImg = true; return render();
      case 'ex-view': { const X = s.ex; s.rcv = { ...X, amt: num(X.amt) }; return render(); }
      case 'ex-reai': return reAi();
      case 'ex-nc': s.ex.nc = ''; render(); return document.querySelector('[data-b42-x="nc"]')?.focus();
      case 'ex-nc-cancel': s.ex.nc = null; return render();
      case 'ex-nc-save': {
        const n = String(s.ex.nc ?? '').trim(); if (!n) return;
        const name = cap(n), have = allCats().find((c) => c.toLowerCase() === name.toLowerCase());
        if (!have) { try { B.cats = await api('/boliger/categories', { method: 'POST', json: { name } }); } catch (err) { toast(err.status === 403 ? 'Bare administratorer kan lage nye kategorier' : err.message); return; } }
        s.ex.cat = have ?? name; s.ex.nc = null; return render();
      }
      case 'ex-save': return saveEx();
      case 'ex-del': { const X = s.ex; if (!X.arm) { X.arm = true; return render(); } B.det[X.h] = await api(`/folders/${X.h}/entries/${X.id}`, { method: 'DELETE' }); s.ex = null; return flash(`Slettet: ${X.m}`); }
      case 'p-save': {
        const PJ = s.pj; if (!String(PJ.name).trim()) { PJ.err = true; return render(); }
        const body = { name: PJ.name.trim(), budget: num(PJ.budget), status: PJ.status, vendor: '' };
        let r;
        if (PJ.id) r = await api(`/folders/${PJ.h}/projects/${PJ.id}`, { method: 'PATCH', json: body });
        else r = await api(`/folders/${PJ.h}/projects`, { method: 'POST', json: body });
        B.det[PJ.h] = r;
        const pid = PJ.id ?? r.projects?.at(-1)?.id; if (pid) LS('fh_b42_pst', { ...pstat(), [pid]: PJ.status });
        s.pj = null; return flash(`Lagret: ${body.name}`);
      }
      case 'p-del': { const PJ = s.pj; if (!PJ.arm) { PJ.arm = true; return render(); } B.det[PJ.h] = await api(`/folders/${PJ.h}/projects/${PJ.id}`, { method: 'DELETE' }); s.pj = null; s.pv = null; return flash(`Slettet: ${PJ.name}. Kjøpene ligger fortsatt i boligen.`); }
      case 'rc-full': if (s.rcv && fileUrl(s.rcv)) { s.rcf = { ...s.rcv, z: 1 }; return render(); } return;
      case 'rcf-close': s.rcf = null; return render();
    }
  }));
  el.addEventListener('input', (e) => {
    const t = e.target, s = st();
    if (t.dataset.b42X && s.ex) { s.ex[t.dataset.b42X] = t.value; if (t.dataset.b42X !== 'nc') (s.ex.touched ??= []).push(t.dataset.b42X); if (s.ex.err) s.ex.err = false; }
    if (t.dataset.b42H && s.hm) s.hm[t.dataset.b42H] = t.value;
    if (t.dataset.b42P && s.pj) s.pj[t.dataset.b42P] = t.value;
    if (t.matches('[data-b42-gsq]')) s.gsQ = t.value;
  });
  el.addEventListener('change', wrap(async (e) => {
    const t = e.target, s = st(), h = curHome();
    if (t.matches('[data-b42-up]')) { const f = [...t.files]; t.value = ''; return uploadFiles(s.am?.h ?? h?.id, f); }
    if (t.matches('[data-b42-imp]')) {
      const f = t.files[0]; t.value = ''; if (!f) return;
      const hid = s.am?.h ?? h?.id, fd = new FormData(); fd.append('files', f); fd.append('file', f); fd.append('homeId', hid);
      try { const r = await api(`/import?home=${hid}&commit=1`, { method: 'POST', body: fd }); s.am = null; await reloadHome(hid); flash(`${r.imported ?? r.rows?.length ?? 0} linjer sendt til ${hName(homes().find((x) => x.id === hid))} til gjennomgang`); }
      catch (err) { toast(err.status === 404 ? 'Serveren kan ikke importere rett til en bolig ennå' : err.message); }
      return;
    }
    if (t.matches('[data-b42-attach]')) {
      const en = findE(t.dataset.b42Attach), f = t.files[0]; t.value = ''; if (!en || !f) return;
      const fd = new FormData(); fd.append('file', f);
      try { B.det[en.h] = await api(`/folders/${en.h}/entries/${en.id}/receipt`, { method: 'POST', body: fd }); flash(`Kvittering lagt ved: ${en.m}`); }
      catch (err) { if (err.status !== 404) throw err; await uploadFiles(en.h, [f]); }
      return render();
    }
    if (t.matches('[data-b42-himg]')) {
      const f = t.files[0]; t.value = ''; if (!f || !s.hm?.id) return;
      s.hm.busy = true; s.hm.preview = URL.createObjectURL(f); render();
      const fd = new FormData(); fd.append('file', f);
      try { await api(`/folders/${s.hm.id}/bg`, { method: 'PUT', body: fd }); s.hm.rmImg = false; } catch (err) { s.hm.preview = null; toast(err.message); }
      if (s.hm) s.hm.busy = false; return render();
    }
    if (t.matches('[data-b42-role]')) { B.det[h.id] = await api(`/folders/${h.id}/members/${t.dataset.b42Role}`, { method: 'PATCH', json: { role: t.value } }).then(() => reloadHome(h.id)); return flash('Rollen er endret'); }
  }));
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest('[data-b42-form]'); if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)), s = st(), h = curHome();
    switch (f.dataset.b42Form) {
      case 'gs': s.gsQ = v.q; return bolSearch(v.q, true);
      case 'pglimt': return glimtFind(h, B.det[h.id].projects.find((p) => p.id === s.pv), v.q);
      case 'newcat': {
        const n = cap(String(v.name ?? '').trim()); if (!n) return;
        if (allCats().some((c) => c.toLowerCase() === n.toLowerCase())) return toast(`«${n}» finnes allerede`);
        try { B.cats = await api('/boliger/categories', { method: 'POST', json: { name: n } }); } catch (err) { return toast(err.status === 403 ? 'Bare administratorer kan lage nye kategorier' : err.message); }
        return flash(`Ny kategori: ${n}`);
      }
      case 'invite': {
        const who = String(v.who ?? '').trim(); if (!who) return;
        const usr = (B.users ?? []).find((x) => [x.displayName, x.name, x.username].some((n) => String(n ?? '').toLowerCase() === who.toLowerCase()));
        if (usr) await api(`/folders/${h.id}/members`, { method: 'POST', json: { userId: usr.id, role: 'editor' } });
        else await api(`/folders/${h.id}/invite`, { method: 'POST', json: { members: [who] } });
        await reloadHome(h.id); return flash(`Invitasjon sendt til ${who}`);
      }
    }
  }));
  el.addEventListener('keydown', (e) => {
    if (u.page !== 'dir') return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.b42-tr[role=button]')) { e.preventDefault(); e.target.click(); }
  });
  // Hjul og knip zoomer originalen i fullskjerm.
  el.addEventListener('wheel', (e) => {
    const z = e.target.closest?.('[data-b42-zoom]'), F = st().rcf;
    if (!z || !F) return;
    e.preventDefault();
    F.z = Math.min(5, Math.max(1, (F.z ?? 1) * (e.deltaY < 0 ? 1.12 : 0.89)));
    const img = z.querySelector('img'); if (img) img.style.transform = `scale(${F.z})`;
  }, { passive: false });
  if (!bound) {
    bound = true;
    document.addEventListener('keydown', (e) => {
      if (u.page !== 'dir' || e.key !== 'Escape') return;
      const s = st();
      if (s.rcf) s.rcf = null; else if (s.rcv) s.rcv = null; else if (s.ex || s.hm || s.am || s.pj) s.ex = s.hm = s.am = s.pj = null; else return;
      render();
    });
    // PDF eller bilde som ikke lar seg vise: bytt til innebygd viser.
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (img?.tagName !== 'IMG' || !img.classList.contains('b42-rcimg')) return;
      const src = img.getAttribute('src'), box = document.createElement('div');
      box.className = 'b42-pdf';
      box.innerHTML = `<iframe src="${esc(src)}" title="Original kvittering"></iframe><a class="b42-btn line" href="${esc(src)}" target="_blank" rel="noopener">Åpne PDF ↗</a>`;
      img.replaceWith(box);
    }, true);
  }
}
// Etter tegning: årsraden starter med i år helt til høyre.
export function afterB42(el) {
  const r = el.querySelector('[data-b42-yrow]');
  if (r && !r.dataset.init) { r.dataset.init = '1'; const on = r.querySelector('.on'); r.scrollLeft = on ? on.offsetLeft - r.clientWidth + on.offsetWidth : r.scrollWidth; }
}
