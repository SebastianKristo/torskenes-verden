// Prompt 27 (PWA): Kalender v2 – fullskjerm uten toppbilde og uten appens fanelinje, med egen fanelinje
// (Dag · 3 dager · Uke · Måned · Liste + rund +), NESTE/NÅ-stripe, 00–24-rutenett som ruller til nå, rød nålinje,
// HELE-rad, overlapp side om side, trykk på tom plass = ny hendelse, måned i 6 uker, liste 45 dager, sveip,
// søk, minikalender med kalenderfilter, ny/rediger/detaljer. Widgetene nederst er fjernet.
// Fold/brede skjermer (≥ 600 px): sidepanel med minikalender og kalendere.
// Hjem-widgeten KALENDER (kalWidget) er uendret. Fasit: design/Kalender.dc.html (variant mobile).
// Data: GET /api/kalender?from=&to= (events med calendar/editable, calendars, now). Skriving: POST/PATCH/DELETE
// /api/kalender/events (Google). Mangler endepunktene (404), lagres egne hendelser på enheten.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { BD, bdLoad } from './mobile-p24.js';

const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], MS = MN.map((x) => x.slice(0, 3));
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'], WS = ['MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN'];
const LAB = 'var(--pp-lab)';
// Kalenderne (kontrakt 27). Serveren kan sende egne navn/farger i `calendars`.
const CALS0 = [['timeplan', 'Timeplan', '#2b5d8a', 'Skolens iCal'], ['prover', 'Prøver og frister', '#b23a2a', 'Skolens iCal'], ['skole', 'Skole', '#a8661a', 'Skolens iCal'], ['privat', 'Privat', '#6b4fa0', 'Google Kalender'], ['familie', 'Familie', '#d08a1e', 'Google · delt med familien'], ['bursdager', 'Bursdager', '#3f7a6e', 'Bursdager-modulen']];
const VIEWS = [['dag', 'Dag', 'M5 4h14v16H5zM5 9h14'], ['3dager', '3 dager', 'M3 5h18v15H3zM9 5v15M15 5v15'], ['uke', 'Uke', 'M3 5h18v15H3zM3 10h18M7.5 5v15M12 5v15M16.5 5v15'], ['maaned', 'Måned', 'M3 5h18v15H3zM3 10h18M3 15h18M9 5v15M15 5v15'], ['liste', 'Liste', 'M4 6h16M4 12h16M4 18h10']];
const REMS = [['none', 'Ingen'], ['15m', '15 min'], ['1h', '1 time'], ['day', 'Dagen før']];
const REPS = [['none', 'Ingen'], ['daily', 'Hver dag'], ['weekly', 'Hver uke'], ['monthly', 'Hver måned']];

const LS = 'fh_kal';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };

export const K = { ev: null, subjects: {}, cals: null, from: null, to: null, err: '', miss: false, t: 0, busy: false, cur: null, sel: null, form: null, srch: false, q: '', res: null, mini: false, miniOff: 0, delArm: false, sw: null, swiped: 0, gk: '', gs: null, off: 0 };

/* ---------- Datoer ---------- */
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const d0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mm = (s) => { const [a, b] = String(s).split(':'); return +a * 60 + +b; };
const hm = (x) => `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`;
const ofKey = (k) => new Date(`${k}T12:00`);
const isoW = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); };
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const dLong = (d) => `${WD[d.getDay()]} ${d.getDate()}. ${MN[d.getMonth()]}`;
const dur = (x) => (x >= 60 ? `${Math.floor(x / 60)} t ${x % 60} min` : `${x} min`);
const dur2 = (x) => (x < 60 ? `${x} min` : x < 1440 ? `${Math.floor(x / 60)} t${x % 60 ? ` ${x % 60} min` : ''}` : `${Math.round(x / 1440)} d`);
function when(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { k: s, hm: '' };
  const d = new Date(s);
  if (Number.isNaN(+d)) return null;
  return { k: key(d), hm: `${pad(d.getHours())}:${pad(d.getMinutes())}`, d };
}

/* ---------- Valg (lokal kopi + /api/me/layout) ---------- */
const VK = VIEWS.map(([k]) => k);
const normView = (v) => (v === 'agenda' ? 'liste' : v === 'mnd' ? 'maaned' : v === '3d' ? '3dager' : VK.includes(v) ? v : null);
const view = () => normView(L.view) ?? '3dager';
const hidCal = () => L.hidCal ?? (L.hidF ? { timeplan: !!L.hidF.time, prover: !!L.hidF.prove, bursdager: !!L.hidF.bursdag, skole: !!L.hidF.skole } : {});
const rems = () => L.rem ?? {};
const subjCol = () => L.subj ?? {};
function save(patch, local) { Object.assign(L, local); keep(); hlApi('/me/layout', { method: 'PUT', json: patch }).catch(() => {}); }
const saveFilters = () => save({ kalFilters: Object.fromEntries(cals().map((c) => [c.id, !hidCal()[c.id]])) }, {});
/** Fra GET /api/me/layout. kalFilters: {kalender: synlig} (eller eldre liste over skjulte). */
export function takeKal(r) {
  if (!r) return;
  const v = normView(r.kalView); if (v) L.view = v;
  if (Array.isArray(r.kalFilters)) L.hidCal = Object.fromEntries(r.kalFilters.map((k) => [k, true]));
  else if (r.kalFilters && typeof r.kalFilters === 'object') L.hidCal = Object.fromEntries(Object.entries(r.kalFilters).map(([k, on]) => [{ time: 'timeplan', prove: 'prover', bursdag: 'bursdager' }[k] ?? k, on === false]));
  if (r.kalReminders && typeof r.kalReminders === 'object') L.rem = r.kalReminders;
  if (r.subjectColors && typeof r.subjectColors === 'object') L.subj = r.subjectColors;
  keep();
}
const cals = () => {
  const s = K.cals ?? [];
  return CALS0.map(([id, n, c, src]) => { const x = s.find((y) => y.id === id) ?? {}; return { id, name: x.name ?? n, color: x.color ?? c, src: x.source ?? src, writable: x.writable ?? (id === 'privat' || id === 'familie'), enabled: x.enabled !== false }; })
    .concat(s.filter((x) => !CALS0.some(([id]) => id === x.id)).map((x) => ({ id: x.id, name: x.name, color: x.color ?? '#7a7468', src: x.source ?? '', writable: !!x.writable, enabled: x.enabled !== false })));
};
const calOf = (id) => cals().find((c) => c.id === id) ?? { id, name: id, color: '#7a7468', src: '' };

/* ---------- Data ---------- */
const TYPES = ['time', 'prove', 'innl', 'bursdag', 'skole', 'fri'];
const KCAL = { time: 'timeplan', prove: 'prover', innl: 'prover', bursdag: 'bursdager', skole: 'skole', fri: 'skole' };
function norm(x) {
  const a = when(x.start), b = when(x.end) ?? a;
  if (!a) return [];
  const g = x.calendar === 'privat' || x.calendar === 'familie' || /google/i.test(x.source ?? '');
  const kind = TYPES.includes(x.type) ? x.type : g ? 'g' : 'skole', all = !!x.allDay || !a.hm;
  const cal = x.calendar ?? (g ? 'privat' : KCAL[kind] ?? 'skole');
  const base = { id: String(x.id ?? `${a.k}|${x.title}`), t: x.title ?? x.subject ?? '', short: x.short || '', subj: x.subject ?? '', r: x.room ?? x.location ?? '', teacher: x.teacher ?? '', n: x.note ?? x.description ?? '', kind, cal, color: x.color ?? null, url: x.url ?? null, maze: x.mazemap ?? null, src: x.source ?? '', editable: !!x.editable, rep: x.recurrence ?? null, reminder: x.reminder ?? null, raw: x };
  if (!all) return [{ ...base, k: a.k, s: kind === 'innl' && a.hm === b?.hm ? '' : a.hm, e: b?.hm || a.hm }];
  const out = [], end = b && b.k > a.k ? ofKey(b.k) : add(ofKey(a.k), 1);
  for (let d = ofKey(a.k), i = 0; d < end && i < 62; d = add(d, 1), i++) out.push({ ...base, id: i ? `${base.id}|${i}` : base.id, base: base.id, cont: i > 0, k: key(d), s: '', e: '' });
  return out;
}
function bdEvents(from, to) {
  const out = [], items = BD.d?.items ?? [];
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    for (const p of items) {
      const k = `${y}-${pad(+p.month)}-${pad(+p.day)}`;
      if (k >= from && k <= to) out.push({ id: `bd|${p.id}|${y}`, k, s: '', e: '', t: `${p.name} har bursdag`, short: p.name, subj: '', r: '', teacher: '', n: p.year ? `Fyller ${y - p.year}` : '', kind: 'bursdag', cal: 'bursdager', color: null, src: 'birthdays' });
    }
  }
  return out;
}
const span = () => { const t = d0(new Date()); return [key(add(new Date(t.getFullYear(), t.getMonth(), 1), -7)), key(add(t, 120))]; };
export async function kalLoad(force = false, a, b) {
  const [f0, t0] = span(), from = [a ?? f0, K.from ?? f0].sort()[0], to = [b ?? t0, K.to ?? t0].sort()[1];
  const covered = K.ev && K.from <= from && K.to >= to;
  if (K.busy || (!force && covered && Date.now() - K.t < 15 * 60000)) return;
  K.busy = true;
  try {
    const r = await hlApi(`/kalender?from=${from}&to=${to}`);
    K.ev = (r?.events ?? []).flatMap(norm); K.subjects = r?.subjects ?? {}; K.cals = Array.isArray(r?.calendars) ? r.calendars : K.cals; K.now = r?.now ?? null; K.miss = false; K.err = '';
  } catch (e) {
    if (e.status === 404) { K.miss = true; await bdLoad().catch(() => {}); K.ev = bdEvents(from, to); K.err = ''; }
    else { K.err = e.message; K.ev ??= []; }
  }
  K.from = from; K.to = to; K.t = Date.now(); K.busy = false;
}
const ensure = (a, b) => { if (K.ev && (a < K.from || b > K.to) && !K.busy) kalLoad(true, a, b).then(draw).catch(() => {}); };

// Egne hendelser lagret på enheten (bare når serveren ikke har skrive-endepunktene ennå).
const ue = () => L.ue ?? [];
function ueOn(k) {
  const wd = ofKey(k).getDay();
  return ue().filter((u) => (u.repeat === 'daily' ? k >= u.date : u.repeat === 'weekly' ? k >= u.date && ofKey(u.date).getDay() === wd : u.repeat === 'monthly' ? k >= u.date && u.date.slice(8) === k.slice(8) : k >= u.date && k <= (u.endDate || u.date)))
    .map((u) => ({ id: `u|${u.id}|${k}`, uid: u.id, k, s: u.allDay ? '' : u.start, e: u.allDay ? '' : u.end, t: u.title, short: '', subj: '', r: u.location || '', teacher: '', n: u.note || '', kind: 'g', cal: u.calendar, color: null, src: 'local', editable: true, rep: u.repeat, reminder: u.reminder, local: true }));
}

const col = (e) => (e.kind === 'prove' || e.kind === 'innl' ? LAB : e.kind === 'time' ? subjCol()[e.subj] ?? e.color ?? K.subjects[e.subj] ?? '#5c5850' : e.color ?? calOf(e.cal).color);
const short = (e) => (e.kind === 'time' ? e.short || e.subj || e.t : e.t);
const tmOf = (e) => (e.kind === 'innl' ? `Frist ${e.e || '23:59'}` : e.s ? `${e.s}–${e.e}` : 'Hele dagen');
/** Hendelsene en dag: fri fjerner timene, og en prøve erstatter timen den overlapper. Filtrert og sortert. */
function evOn(d, filt = true) {
  const k = typeof d === 'string' ? d : key(d), all = [...(K.ev ?? []).filter((e) => e.k === k), ...ueOn(k)];
  const fri = all.some((e) => e.kind === 'fri' && !e.s);
  const ex = all.filter((e) => e.kind === 'prove' && e.s);
  const L0 = all.filter((e) => e.kind !== 'time' || (!fri && !ex.some((x) => mm(e.e) > mm(x.s) && mm(e.s) < mm(x.e))));
  const H = hidCal();
  return (filt ? L0.filter((e) => !H[e.cal]) : L0).sort((a, b) => (a.s ? mm(a.s) : -1) - (b.s ? mm(b.s) : -1));
}
const lesson = (e) => e.s && (e.kind === 'time' || e.kind === 'prove');

/* ---------- Widget-data (Hjem-widgeten) ---------- */
function exams() {
  const tk = key(new Date()), t = d0(new Date());
  return (K.ev ?? []).filter((e) => (e.kind === 'prove' || e.kind === 'innl') && !e.cont && e.k >= tk && !hidCal().prover)
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : (a.s || '').localeCompare(b.s || '')))
    .map((e) => { const dd = Math.round((d0(ofKey(e.k)) - t) / 864e5); return { e, dd, in: dd === 0 ? 'I dag' : dd === 1 ? 'I morgen' : `${dd} dager`, soon: dd <= 7 }; });
}
function widgetData() {
  const now = new Date(), today = d0(now), nm = now.getHours() * 60 + now.getMinutes();
  let wd = today, wl = evOn(today).filter(lesson), isT = true;
  if (!wl.some((e) => mm(e.e) > nm)) { isT = false; for (let i = 1; i < 14; i++) { const d = add(today, i), x = evOn(d).filter(lesson); if (x.length) { wd = d; wl = x; break; } } if (!wl.length || wd === today) wl = []; }
  const cur = isT ? wl.find((e) => nm >= mm(e.s) && nm < mm(e.e)) : null, nx = cur || (isT ? wl.find((e) => mm(e.s) > nm) : wl[0]) || wl[0];
  const ix = Math.max(0, wl.indexOf(nx)), dS = cap(WD[wd.getDay()]), ex = exams().slice(0, 2);
  const n3 = wl.slice(ix + 1, ix + 4);
  return {
    k: !nx ? 'FRI' : cur ? 'NÅ' : isT ? 'NESTE TIME' : dS.toUpperCase(), big: nx ? (cur ? cur.e : nx.s) : '–', t: nx ? nx.t : 'Ingen timer', r: nx ? [nx.r, nx.teacher].filter(Boolean).join(' · ') : '', c: nx ? col(nx) : '#999', e: nx,
    when: !nx ? '' : cur ? `${dur(mm(cur.e) - nm)} igjen` : isT ? `om ${dur(mm(nx.s) - nm)}` : 'første time',
    dayT: `${isT ? 'I dag · ' : ''}${dS} ${wd.getDate()}. ${MS[wd.getMonth()]}`,
    n3: (n3.length ? n3 : wl.slice(0, 3)).map((e) => ({ s: e.s, t: short(e), r: e.r, c: col(e) })),
    ex: ex.map((x) => ({ t: x.e.t, in: x.in, soon: x.soon })),
  };
}
/** Hjem-widgeten KALENDER (mode="widget"), uendret fra prompt 26. */
export function kalWidget() {
  if (!K.ev) { if (!K.busy) kalLoad().then(draw).catch(() => {}); return `<a class="k26-hw" href="#/kal"><span class="k26-hwh"><span class="k">KALENDER</span><span class="mut">›</span></span><span class="mut" style="font-size:13px">Henter timeplanen …</span></a>`; }
  const w = widgetData(), ex = w.ex[0];
  return `<a class="k26-hw" href="#/kal" aria-label="Åpne Kalender"><span class="k26-hwh"><span class="k">KALENDER · ${esc(w.k)}</span><span class="mut">${esc(w.dayT)} ›</span></span>
    <span class="k26-hwm"><span class="k26-ns" style="background:${w.c};width:5px;height:44px;align-self:auto"></span><span class="m-grow k26-hwt"><b>${esc(w.t)}</b><span>${esc(w.r)}</span></span><span class="k26-hwb"><b>${esc(w.big)}</b><span>${esc(w.when)}</span></span></span>
    ${w.n3.length ? `<span class="k26-hwn">${w.n3.map((e) => `<span style="border-left-color:${e.c}"><b class="s">${esc(e.s)}</b><b>${esc(e.t)}</b></span>`).join('')}</span>` : ''}
    ${ex ? `<span class="k26-hwx"><span class="k">NESTE PRØVE</span><b class="m-grow">${esc(ex.t)}</b><span class="k26-wp${ex.soon ? ' soon' : ''}">${esc(ex.in)}</span></span>` : ''}</a>`;
}

/* ---------- Kalender v2: tegning ---------- */
const curD = () => (K.cur ? ofKey(K.cur) : d0(new Date()));
const wide = () => innerWidth >= 600;
const svgP = (d, s = 19, w = 1.9) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const evAttr = (e) => `data-k27="ev" data-id="${esc(e.id)}" data-k="${e.k}"`;
let EVMAP = new Map(); // id → hendelse (for detaljer), fylles ved tegning
const reg = (e) => { EVMAP.set(e.id, e); return e; };

function nextStrip() {
  const now = new Date(), today = d0(now), nm = now.getHours() * 60 + now.getMinutes();
  let nx = null;
  for (let i = 0; i < 21 && !nx; i++) { const d = add(today, i); for (const e of evOn(d).filter((x) => x.s && x.e && x.kind !== 'innl')) { const a = mm(e.s) + i * 1440, b = mm(e.e) + i * 1440; if (b > nm) { nx = { e: reg(e), cur: a <= nm, a, b, i, d }; break; } } }
  if (!nx) return `<button class="k27-nx" data-k27="none"><span class="k27-nxs" style="background:#7a7468"></span><span class="m-grow"><b>Ingen kommende hendelser</b><span>De neste tre ukene</span></span></button>`;
  const e = nx.e, w = nx.cur ? `${dur2(nx.b - nm)} igjen` : nx.a - nm < 1440 ? `om ${dur2(nx.a - nm)}` : cap(WD[nx.d.getDay()]).slice(0, 3);
  return `<button class="k27-nx" ${evAttr(e)}><span class="k27-nxs" style="background:${col(e)}"></span><span class="k27-nxk">${nx.cur ? 'NÅ' : 'NESTE'}</span><span class="m-grow"><b>${esc(e.t)}</b><span>${esc(`${nx.i === 0 ? 'I dag' : nx.i === 1 ? 'I morgen' : cap(dLong(nx.d))} · ${e.s}–${e.e}${e.r ? ` · ${e.r}` : ''}`)}</span></span><span class="k27-nxw">${esc(w)}</span></button>`;
}
function miniCal() {
  const V = view(), cur = curD(), tk = key(new Date()), base = new Date(cur.getFullYear(), cur.getMonth() + K.miniOff, 1, 12), st = add(base, -((base.getDay() + 6) % 7));
  const [a, b] = range();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = add(st, i), k = key(d), isT = k === tk, inW = V !== 'maaned' && V !== 'liste' ? k >= a && k <= b : k === key(cur), L0 = evOn(d).filter((e) => e.kind !== 'time');
    return `<button class="k27-mc${isT ? ' t' : inW ? ' w' : ''}${d.getMonth() === base.getMonth() ? '' : ' o'}" data-k27="mday" data-k="${k}">${d.getDate()}<i style="background:${L0.length ? (isT ? '#fff' : col(L0[0])) : 'transparent'}"></i></button>`;
  }).join('');
  return `<div class="k27-mini"><div class="k27-mh"><b>${cap(MN[base.getMonth()])} ${base.getFullYear()}</b><button data-k27="mprev" aria-label="Forrige måned">‹</button><button data-k27="mnext" aria-label="Neste måned">›</button></div>
    <div class="k27-mg">${WS.map((t) => `<span>${t[0]}</span>`).join('')}${cells}</div></div>`;
}
const calChips = () => `<div class="k27-cals">${cals().map((c) => { const off = !!hidCal()[c.id]; return `<button class="k27-cc${off ? ' off' : ''}" data-k27="cal" data-id="${c.id}" aria-pressed="${!off}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`; }).join('')}</div>`;
const calList = () => `<div class="k27-cl"><span class="k27-lab">KALENDERE</span>${cals().map((c) => { const off = !!hidCal()[c.id]; return `<button data-k27="cal" data-id="${c.id}" aria-pressed="${!off}"><span class="k27-cb" style="border-color:${c.color};background:${off ? 'transparent' : c.color}">✓</span><span class="m-grow m-ell">${esc(c.name)}</span></button>`; }).join('')}<button class="k27-adm" data-k27="cset">Administrer kalendere ›</button></div>`;
function range() {
  const V = view(), cur = curD(), nD = V === 'dag' ? 1 : V === '3dager' ? 3 : 7, st = V === 'uke' ? add(cur, -((cur.getDay() + 6) % 7)) : cur;
  if (V === 'maaned') { const m0 = new Date(cur.getFullYear(), cur.getMonth(), 1, 12), s = add(m0, -((m0.getDay() + 6) % 7)); return [key(s), key(add(s, 41)), s, 42]; }
  if (V === 'liste') return [key(cur), key(add(cur, 44)), cur, 45];
  return [key(st), key(add(st, nD - 1)), st, nD];
}
function lay(L0) {
  const T = L0.filter((e) => e.s && e.e && e.kind !== 'innl').map((e) => ({ e, a: mm(e.s), b: Math.max(mm(e.e), mm(e.s) + 20) })).sort((x, y) => x.a - y.a || y.b - x.b), out = [];
  let grp = [], end = -1;
  const flush = () => { const cs = []; grp.forEach((x) => { let c = cs.findIndex((t) => t <= x.a); if (c < 0) { c = cs.length; cs.push(0); } cs[c] = x.b; x.c = c; }); grp.forEach((x) => { x.n = cs.length; out.push(x); }); grp = []; };
  T.forEach((x) => { if (grp.length && x.a >= end) { flush(); end = -1; } grp.push(x); end = Math.max(end, x.b); });
  if (grp.length) flush();
  return out;
}
function gridView() {
  const V = view(), [a, b, st, nD] = range(), now = new Date(), tk = key(now), nm = now.getHours() * 60 + now.getMinutes();
  ensure(a, b);
  const HH = V === 'dag' ? 64 : V === '3dager' ? 56 : 46, gh = 24 * HH, narrow = nD === 7 && !wide();
  const days = Array.from({ length: nD }, (_, i) => { const d = add(st, i), k = key(d), L0 = evOn(d); return { d, k, L0, isT: k === tk, we: d.getDay() % 6 === 0, all: L0.filter((e) => !e.s || !e.e || e.kind === 'innl') }; });
  const hasAll = days.some((x) => x.all.length), cols = `40px repeat(${nD},minmax(0,1fr))`;
  const head = `<div class="k27-gh" style="grid-template-columns:${cols}"><span class="k27-wk">U${isoW(st)}</span>${days.map((x) => `<button data-k27="dday" data-k="${x.k}" class="${x.isT ? 't' : x.we ? 'we' : ''}"><span>${narrow ? WS[(x.d.getDay() + 6) % 7][0] : WS[(x.d.getDay() + 6) % 7]}</span><b>${x.d.getDate()}</b></button>`).join('')}</div>`;
  const allRow = hasAll ? `<div class="k27-all" style="grid-template-columns:${cols}"><span>HELE</span>${days.map((x) => `<div>${x.all.map((e) => `<button ${evAttr(reg(e))} style="background:${col(e)}">${esc(`${e.kind === 'innl' ? '⚑ ' : ''}${short(e)}`)}</button>`).join('')}</div>`).join('')}</div>` : '';
  const hrs = Array.from({ length: 23 }, (_, i) => i + 1);
  const lines = hrs.map((h) => `<i style="top:${h * HH}px"></i>`).join('');
  const sel = K.sel;
  const grid = `<div class="k27-grid" style="grid-template-columns:${cols}"><div class="k27-hrs" style="height:${gh}px">${hrs.map((h) => `<span style="top:${h * HH}px">${pad(h)}</span>`).join('')}</div>
    ${days.map((x) => `<div class="k27-col${x.isT ? ' t' : x.we ? ' we' : ''}" data-k27col="${x.k}" data-hh="${HH}" style="height:${gh}px">${lines}${lay(x.L0).map((y) => {
      const e = reg(y.e), c = col(e), solid = e.kind === 'prove', ht = ((y.b - y.a) / 60) * HH;
      return `<button class="k27-ev${solid ? ' solid' : ''}" ${evAttr(e)} style="top:${(y.a / 60) * HH}px;height:${Math.max(18, ht - 2)}px;left:calc(${(y.c / y.n) * 100}% + 1px);width:calc(${100 / y.n}% - 3px);border-left-color:${c};background:${solid ? c : `color-mix(in oklab,${c} 17%,var(--pp-card))`}${sel === e.id ? ';outline:2px solid var(--pp-ink);outline-offset:1px' : ''};font-size:${narrow ? '10.5px' : '12px'}"><b>${esc(short(e))}</b>${ht >= 40 && !(narrow && y.n > 1) ? `<span>${esc(`${e.s}–${e.e}${e.r ? ` · ${e.r}` : ''}`)}</span>` : ''}</button>`;
    }).join('')}${x.isT ? `<span class="k27-now" style="top:${(nm / 60) * HH}px"><i></i></span>` : ''}</div>`).join('')}</div>`;
  K.gkNow = `${V}|${a}`; K.gy = Math.max(0, (days.some((x) => x.isT) ? nm / 60 : 7.75) * HH - (days.some((x) => x.isT) ? HH * 1.5 : 0));
  return `${head}${allRow}<div class="k27-gs" id="k27-gs">${grid}</div>`;
}
function monthView() {
  const [a, b, st] = range(), cur = curD(), tk = key(new Date()), w = wide();
  ensure(a, b);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = add(st, i), k = key(d), L0 = evOn(d), isT = k === tk, inM = d.getMonth() === cur.getMonth(), les = L0.filter((e) => e.kind === 'time').length, oth = L0.filter((e) => e.kind !== 'time'), mx = w ? 4 : 3, sh = oth.slice(0, les ? mx - 1 : mx);
    const chips = sh.map((e) => { reg(e); const solid = e.kind === 'prove' || !e.s || e.kind === 'innl'; return `<span style="background:${solid ? col(e) : 'transparent'};color:${solid ? '#fff' : col(e)}">${esc(`${e.s && e.kind !== 'innl' && w ? `${e.s} ` : ''}${short(e)}`)}</span>`; });
    if (les) chips.push(`<span class="les">${les}${w ? ' timer' : ' t'}</span>`);
    return `<button class="k27-md${isT ? ' t' : ''}${inM ? '' : ' o'}" data-k27="dday" data-k="${k}"><b>${d.getDate()}</b>${chips.join('')}${oth.length > sh.length ? `<em>+${oth.length - sh.length}</em>` : ''}</button>`;
  }).join('');
  return `<div class="k27-mhd">${WS.map((t) => `<span>${w ? t : t[0]}</span>`).join('')}</div><div class="k27-mo">${cells}</div>`;
}
function listView() {
  const cur = curD(), tk = key(new Date()), [a, b] = range();
  ensure(a, b);
  const G = [];
  for (let i = 0; i < 45; i++) {
    const d = add(cur, i), k = key(d), L0 = evOn(d), isT = k === tk;
    if (!L0.length && !isT) continue;
    G.push(`<div class="k27-lg"><div class="k27-ld${isT ? ' t' : ''}"><span>${WS[(d.getDay() + 6) % 7]}</span><b>${d.getDate()}</b><em>${MS[d.getMonth()].toUpperCase()}</em></div><div class="m-grow k27-li">${L0.length ? L0.map((e) => { reg(e); const c = col(e), solid = e.kind === 'prove' || e.kind === 'innl';
      return `<button ${evAttr(e)} style="border-left-color:${c};background:${solid ? c : `color-mix(in oklab,${c} 13%,var(--pp-card))`};color:${solid ? '#fff' : 'var(--pp-ink)'}"><span class="m-grow"><b>${esc(e.t)}</b><span>${esc(`${tmOf(e)}${e.r ? ` · ${e.r}` : ''}${e.kind === 'time' && e.teacher ? ` · ${e.teacher}` : ''}`)}</span></span>${solid ? `<em>${e.kind === 'prove' ? 'PRØVE' : 'FRIST'}</em>` : ''}</button>`; }).join('') : '<span class="k27-none">Ingen hendelser</span>'}</div></div>`);
  }
  return `<div class="k27-list" id="k27-list">${G.join('')}</div>`;
}
const remOf = (e) => rems()[e.base ?? e.id] ?? e.reminder ?? (e.kind === 'prove' || e.kind === 'innl' ? 'day' : 'none');
function sheetWrap(inner) { return `<div class="k27-shbg" data-k27="shx"><div class="k27-sheet" data-k27stop role="dialog">${inner}</div></div>`; }
function detSheet() {
  const e = K.sel ? EVMAP.get(K.sel) : null;
  if (!e) return '';
  const c = col(e), sd = ofKey(e.k), cal = calOf(e.cal);
  const rows = [e.r ? ['Sted', e.r] : null, e.teacher ? ['Lærer', e.teacher] : null, ['Kalender', cal.name], e.kind !== 'time' && e.subj ? ['Fag', e.subj] : null, e.n ? ['Merknad', e.n] : null, e.rep && e.rep !== 'none' ? ['Gjentas', REPS.find(([k]) => k === e.rep)?.[1] ?? 'Ja'] : null].filter(Boolean);
  const map = e.maze || (e.r && !['bursdag', 'g'].includes(e.kind) && !/canvas/i.test(e.r) ? `https://use.mazemap.com/#search=${encodeURIComponent(e.r)}` : null), r = remOf(e);
  const K2 = (cal.name || '').toUpperCase() + (e.kind === 'prove' ? ' · PRØVE' : e.kind === 'innl' ? ' · INNLEVERING' : '');
  const src = e.editable ? (e.local ? 'Lagret på denne enheten.' : `Lagret i Google Kalender (${cal.name}).`) : cal.src ? `Fra ${cal.src}. Endres i kilden.` : '';
  return sheetWrap(`<div class="k27-dh"><span class="k27-bar" style="background:${c}"></span><div class="m-grow"><span class="k27-lab">${esc(K2)}</span><b class="k27-dt">${esc(e.t)}</b><span class="k27-mut">${esc(`${cap(dLong(sd))} · ${tmOf(e)}`)}</span></div><button class="k27-cx" data-k27="shx" aria-label="Lukk">✕</button></div>
    <div class="k27-rows">${rows.map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>
    <span class="k27-lab">VARSEL</span><div class="k27-chips">${REMS.map(([v, n]) => `<button class="${r === v ? 'on' : ''}" data-k27="rem" data-v="${v}" aria-pressed="${r === v}">${n}</button>`).join('')}</div>
    ${src ? `<span class="k27-mut sm">${esc(src)}</span>` : ''}
    <div class="k27-btns">${e.editable ? `<button class="ink" data-k27="edit">Rediger</button><button class="red" data-k27="del">${K.delArm ? 'Trykk igjen' : 'Slett'}</button>` : ''}${map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Vis rom på kart ↗</a>` : ''}${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">Åpne i ${e.src === 'canvas' ? 'Canvas' : 'kilden'} ↗</a>` : ''}${e.editable || e.kind === 'bursdag' ? '' : '<button data-k27="dup">Kopier til Privat</button>'}</div>`);
}
function formSheet() {
  const F = K.form; if (!F) return '';
  const chip = (on) => (on ? ' class="on"' : '');
  const wc = cals().filter((c) => c.writable);
  return sheetWrap(`<div class="k27-dh"><b class="m-grow k27-fh">${F.id ? 'Rediger hendelse' : 'Ny hendelse'}</b><button class="k27-cx" data-k27="shx" aria-label="Lukk">✕</button></div>
    <form class="k27-form" data-k27f="save"><input id="k27-ft" class="k27-in big" value="${esc(F.title)}" placeholder="Tittel" autocomplete="off" data-k27i="title">
      <div class="k27-fbox"><button type="button" class="k27-tg" data-k27="fall" role="switch" aria-checked="${!!F.allDay}"><span>Hele dagen</span><span class="k27-sw${F.allDay ? ' on' : ''}"><i></i></span></button>
        <label><span>Dato</span><input type="date" value="${esc(F.date)}" data-k27i="date"></label>
        ${F.allDay ? `<label><span>Til og med</span><input type="date" value="${esc(F.endDate || F.date)}" data-k27i="endDate"></label>` : `<label><span>Fra</span><input type="time" step="300" value="${esc(F.start)}" data-k27i="start"></label><label><span>Til</span><input type="time" step="300" value="${esc(F.end)}" data-k27i="end"></label>`}</div>
      <input class="k27-in" value="${esc(F.location)}" placeholder="Sted" data-k27i="location" autocomplete="off">
      <span class="k27-lab">KALENDER</span><div class="k27-chips">${wc.map((c) => `<button type="button"${chip(F.calendar === c.id)} data-k27="fcal" data-v="${c.id}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`).join('')}</div>
      <span class="k27-lab">GJENTA</span><div class="k27-chips">${REPS.map(([k, n]) => `<button type="button"${chip(F.repeat === k)} data-k27="frep" data-v="${k}">${n}</button>`).join('')}</div>
      <span class="k27-lab">VARSEL</span><div class="k27-chips">${REMS.map(([k, n]) => `<button type="button"${chip(F.reminder === k)} data-k27="frem" data-v="${k}">${n}</button>`).join('')}</div>
      <textarea class="k27-in" rows="2" placeholder="Merknad" data-k27i="note">${esc(F.note)}</textarea>
      ${F.err ? `<span class="k27-err">${esc(F.err)}</span>` : ''}
      <button type="submit" class="k27-save" ${F.busy ? 'disabled' : ''}>${F.busy ? 'Lagrer …' : 'Lagre'}</button><span class="k27-mut sm">${K.miss || F.local ? 'Lagres på denne enheten til serveren støtter Google Kalender.' : 'Skrives til Google Kalender.'}</span></form>`);
}
function searchSheet() {
  if (!K.srch) return '';
  const q = K.q.trim(), R = K.res;
  return sheetWrap(`<div class="k27-srow"><div class="k27-sf p27-sf${K.q ? ' has' : ''}"><span class="p27-ic" aria-hidden="true">${svgP('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.6-3.6', 18, 2.2)}</span><button type="button" class="p27-x" data-p27clr aria-label="Tøm søket"><span>${svgP('M6 6l12 12M18 6L6 18', 11, 3.2)}</span></button><input id="k27-q" type="search" value="${esc(K.q)}" placeholder="Søk etter timer, prøver, steder" autocomplete="off" enterkeyhint="search"></div><button class="k27-cx" data-k27="shx" aria-label="Lukk">✕</button></div>
    ${q.length >= 2 && R ? (R.length ? `<span class="k27-mut sm">${R.length}${R.length >= 40 ? '+' : ''} treff</span><div class="k27-res">${R.map((e) => { reg(e); return `<button ${evAttr(e)} data-go="1"><span class="k27-bar" style="background:${col(e)}"></span><span class="m-grow"><b>${esc(e.t)}</b><span>${esc(`${cap(dLong(ofKey(e.k)))} · ${tmOf(e)}${e.r ? ` · ${e.r}` : ''}`)}</span></span></button>`; }).join('')}</div>` : '<span class="k27-mut">Ingen treff de neste fire månedene.</span>') : ''}`);
}
let srT = null, srC = null;
function runSearch() {
  const q = K.q.trim();
  clearTimeout(srT); srC?.abort();
  if (q.length < 2) { K.res = null; draw(); return; }
  srT = setTimeout(async () => {
    const local = () => { const t = d0(new Date()), out = [], n = q.toLowerCase(); for (let i = -7; i < 120 && out.length < 40; i++) for (const e of evOn(add(t, i), false)) if (out.length < 40 && `${e.t} ${e.r} ${e.n} ${e.subj} ${e.teacher}`.toLowerCase().includes(n)) out.push(e); return out; };
    srC = new AbortController();
    try {
      const r = await fetch(`/api/kalender/search?q=${encodeURIComponent(q)}`, { signal: srC.signal });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json(); K.res = (Array.isArray(j) ? j : j?.events ?? j?.items ?? []).flatMap(norm).filter((e) => !e.cont).slice(0, 40);
    } catch (e) { if (e.name === 'AbortError') return; K.res = local(); }
    if (K.q.trim() === q) draw();
  }, 180);
}
/** Mer → Kalender (#/kal): fullskjerm. */
export function kalView() {
  if (!K.ev && !K.busy) kalLoad().then(draw).catch(() => {});
  EVMAP = new Map();
  const V = view(), [, , st] = range(), cur = curD(), w = wide();
  const ttl = V === 'maaned' || V === 'liste' ? cur : st, endD = V === 'maaned' || V === 'liste' ? cur : add(st, (V === 'dag' ? 1 : V === '3dager' ? 3 : 7) - 1);
  const title = ttl.getMonth() === endD.getMonth() ? cap(MN[ttl.getMonth()]) : `${cap(MS[ttl.getMonth()])}–${MS[endD.getMonth()]}`;
  const body = K.ev === null ? '<div class="m-spin"></div>' : V === 'maaned' ? monthView() : V === 'liste' ? listView() : gridView();
  const nx = K.ev ? nextStrip() : '';
  return `<div class="k27${w ? ' wide' : ''}" data-k27root>
    <div class="k27-top"><button class="k27-ib back" data-k27="back" aria-label="Tilbake">‹</button><button class="k27-ttl" data-k27="mini" aria-expanded="${K.mini}"><b>${esc(title)}</b><span>${endD.getFullYear()}</span>${w ? '' : `<em>${K.mini ? '▲' : '▼'}</em>`}</button><span class="m-grow"></span>
      ${w ? `<button class="k27-ib ar" data-k27="prev" aria-label="Forrige">‹</button><button class="k27-ib ar" data-k27="next" aria-label="Neste">›</button>` : ''}
      <button class="k27-ib" data-k27="search" aria-label="Søk i kalenderen">${svgP('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.6-3.6', 20, 2.2)}</button><button class="k27-ib today" data-k27="today" aria-label="I dag">${svgP('M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4', 24, 1.8)}<b>${new Date().getDate()}</b></button></div>
    ${!w && K.mini ? `<div class="k27-drop">${miniCal()}${calChips()}<button class="k27-adm" data-k27="cset">Administrer kalendere ›</button></div>` : ''}
    ${nx}
    ${K.err ? `<span class="k27-note err">${esc(K.err)}</span>` : K.miss ? '<span class="k27-note">Skolens timeplan og Google Kalender krever nyere server. Bursdagene hentes fra Bursdager.</span>' : ''}
    <div class="k27-body">${w ? `<aside class="k27-side">${miniCal()}${calList()}</aside>` : ''}<div class="k27-main" data-k27sw>${body}</div></div>
    <nav class="k27-bar2" aria-label="Kalendervisning">${VIEWS.map(([k, n, ic]) => `<button data-k27="view" data-v="${k}" aria-pressed="${V === k}">${svgP(ic)}<span>${n}</span></button>`).join('')}</nav><button class="k27-fab" data-k27="new" aria-label="Ny hendelse">${svgP('M12 5v14M5 12h14', 24, 2.4)}</button>
    ${detSheet()}${formSheet()}${searchSheet()}</div>`;
}
/** Etter tegning: rutenettet ruller til nå ved ny visning/periode, ellers beholdes posisjonen. */
export function kalAfterDraw() {
  if (m.screen !== 'kal') return;
  const root = document.querySelector('.k27'); if (root) root.scrollTop = 0;
  const g = document.getElementById('k27-gs');
  if (g) { if (K.gk !== K.gkNow) { K.gk = K.gkNow; g.scrollTop = K.gy; K.gs = K.gy; } else if (K.gs != null) g.scrollTop = K.gs; }
  const l = document.getElementById('k27-list'); if (l && K.lk !== `${K.cur}`) { K.lk = `${K.cur}`; l.scrollTop = 0; }
}
addEventListener('scroll', (e) => { if (e.target?.id === 'k27-gs') K.gs = e.target.scrollTop; }, { capture: true, passive: true });

/* ---------- Påminnelser (lokale varsler mens appen er åpen) ---------- */
const OFF = { '10m': 10, '15m': 15, '1h': 60, day: 1440 };
const FIRED = 'fh_kal_fired';
function checkReminders() {
  if (!K.ev) return;
  let fired = {}; try { fired = JSON.parse(localStorage.getItem(FIRED) || '{}') || {}; } catch {}
  const now = Date.now(), t = d0(new Date());
  const list = [...K.ev, ...ueOn(key(t)), ...ueOn(key(add(t, 1)))];
  for (const e of list) {
    const r = remOf(e), off = OFF[r];
    if (!off || e.kind === 'bursdag') continue;
    const at = e.s ? new Date(`${e.k}T${e.s}`).getTime() - off * 60000 : new Date(`${e.k}T18:00`).getTime() - 1440 * 60000;
    if (now < at || now - at > 5 * 60000 || fired[e.id]) continue;
    fired[e.id] = now;
    const body = `${e.t} · ${tmOf(e)}${e.r ? ` · ${e.r}` : ''}`;
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(r === 'day' ? 'I morgen' : `Om ${r === '1h' ? '1 time' : r === '10m' ? '10 min' : '15 min'}`, { body, icon: '/assets/finans/icons/icon-192.png', tag: `kal-${e.id}` }); else flash(`Påminnelse: ${body}`); } catch { flash(`Påminnelse: ${body}`); }
  }
  for (const k of Object.keys(fired)) if (now - fired[k] > 3 * 864e5) delete fired[k];
  try { localStorage.setItem(FIRED, JSON.stringify(fired)); } catch {}
}
let tick = null;
export function kalBoot() {
  if (tick) return;
  tick = setInterval(() => {
    if (document.hidden || document.documentElement.dataset.ui !== 'mobile') return;
    checkReminders();
    if (Date.now() - K.t > 3600e3 && K.ev) kalLoad(true).then(draw).catch(() => {});
    const ae = document.activeElement;
    if ((m.screen === 'kal' || m.screen === 'hl') && K.ev && !K.form && !K.srch && !(ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) draw();
  }, 60000);
  addEventListener('keydown', (e) => {
    if (m.screen !== 'kal' || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (K.form || K.srch || K.sel) { if (e.key === 'Escape') { K.form = null; K.srch = false; K.sel = null; draw(); } return; }
    const V = { d: 'dag', 3: '3dager', w: 'uke', m: 'maaned', l: 'liste' }[e.key.toLowerCase()];
    if (e.key === 'ArrowLeft') shift(-1); else if (e.key === 'ArrowRight') shift(1); else if (e.key.toLowerCase() === 't') { K.cur = null; draw(); } else if (V) setView(V); else if (e.key.toLowerCase() === 'n') openForm({}); else if (e.key === '/') { e.preventDefault(); openSearch(); }
  });
}

/* ---------- Handlinger ---------- */
function shift(dir) {
  const V = view(), c = curD();
  const n = V === 'maaned' ? new Date(c.getFullYear(), c.getMonth() + dir, 1, 12) : add(c, dir * ({ dag: 1, '3dager': 3, uke: 7, liste: 14 }[V] ?? 1));
  K.cur = key(n); K.sel = null; draw();
}
function setView(v) { if (v !== view()) save({ kalView: v }, { view: v }); K.sel = null; K.mini = false; haptic('tab'); draw(); }
function openSearch() { K.srch = true; K.q = ''; K.res = null; K.mini = false; draw(); setTimeout(() => document.getElementById('k27-q')?.focus({ preventScroll: true }), 30); }
function openForm(pre) {
  const c = curD(), now = new Date(), st = Math.min(22 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30);
  K.sel = null; K.mini = false;
  K.form = { id: null, title: '', allDay: false, date: key(c), start: hm(st), end: hm(Math.min(st + 60, 23 * 60 + 30)), endDate: '', location: '', calendar: 'privat', repeat: 'none', reminder: '15m', note: '', err: '', ...pre };
  draw(); setTimeout(() => document.getElementById('k27-ft')?.focus({ preventScroll: true }), 40);
}
async function saveForm() {
  const F = K.form; if (!F) return;
  const title = F.title.trim();
  if (!title) { F.err = 'Skriv en tittel.'; draw(); return; }
  if (!F.date) { F.err = 'Velg dato.'; draw(); return; }
  if (!F.allDay && (!F.start || !F.end || mm(F.end) <= mm(F.start))) { F.err = 'Slutt må være etter start.'; draw(); return; }
  const body = { title, allDay: !!F.allDay, date: F.date, start: F.allDay ? '' : F.start, end: F.allDay ? '' : F.end, ...(F.allDay && F.endDate && F.endDate > F.date ? { endDate: F.endDate } : {}), location: F.location.trim(), calendar: F.calendar, repeat: F.repeat, reminder: F.reminder, note: F.note.trim() };
  F.busy = true; F.err = ''; draw();
  const local = () => { const id = F.uid || `u${Date.now()}`, o = { id, ...body }; L.ue = F.uid ? ue().map((x) => (x.id === F.uid ? o : x)) : [...ue(), o]; keep(); };
  try {
    if (F.local || (K.miss && !F.id)) local();
    else if (F.id) await hlApi(`/kalender/events/${encodeURIComponent(F.id)}`, { method: 'PATCH', json: body });
    else await hlApi('/kalender/events', { method: 'POST', json: body });
  } catch (e) {
    if (e.status === 404 || e.status === 405) local();
    else if (e.status === 409) { F.busy = false; F.err = 'Google må kobles til på nytt med skrivetilgang (Innstillinger → Kalendere).'; draw(); return; }
    else { F.busy = false; F.err = e.message; draw(); return; }
  }
  K.form = null; K.cur = F.date; haptic('ok'); flash(F.id || F.uid ? 'Hendelsen er oppdatert ✓' : 'Hendelsen er lagret ✓');
  await kalLoad(true).catch(() => {}); draw();
}
async function delEvent(e) {
  try {
    if (e.local) { L.ue = ue().filter((x) => x.id !== e.uid); keep(); }
    else await hlApi(`/kalender/events/${encodeURIComponent(e.base ?? e.id)}`, { method: 'DELETE' });
    K.sel = null; K.delArm = false; flash('Hendelsen er slettet'); await kalLoad(true).catch(() => {}); draw();
  } catch (err) { flash(err.message, 'err'); }
}
function editForm(e) {
  const u = e.local ? ue().find((x) => x.id === e.uid) : null, raw = e.raw ?? {};
  K.sel = null;
  openForm(u ? { ...u, uid: u.id, local: true, id: null, endDate: u.endDate || '' } : { id: e.base ?? e.id, title: e.t, allDay: !e.s, date: e.k, start: e.s || '09:00', end: e.e || '10:00', location: e.r, calendar: e.cal === 'familie' ? 'familie' : 'privat', repeat: raw.repeat ?? (e.rep && REPS.some(([k]) => k === e.rep) ? e.rep : 'none'), reminder: remOf(e), note: e.n });
}
async function copyEvent(e) {
  try { await hlApi(`/kalender/events/${encodeURIComponent(e.base ?? e.id)}/copy`, { method: 'POST', json: { calendar: 'privat' } }); K.sel = null; flash('Kopiert til Privat ✓'); await kalLoad(true).catch(() => {}); draw(); }
  catch (err) { if (err.status === 409) { flash('Google må kobles til på nytt med skrivetilgang'); return; } K.sel = null; openForm({ title: e.t, date: e.k, start: e.s || '09:00', end: e.e || '10:00', allDay: !e.s, location: e.r, note: e.n, calendar: 'privat', local: err.status === 404 }); }
}

/* ---------- Sveip og klikk ---------- */
export function kalDown(e) {
  if (m.screen !== 'kal' || (e.button ?? 0) > 0) return;
  const sw = e.target.closest?.('[data-k27sw]');
  K.sw = sw && e.clientX > 24 && !e.target.closest('.k27-sheet') ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
}
export function kalMove() {}
export function kalUp(e) {
  const s = K.sw; K.sw = null;
  if (!s || e.type !== 'pointerup') return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.t < 800) { K.swiped = Date.now(); haptic('tab'); shift(dx < 0 ? 1 : -1); }
}
export function kalInput(e, t) {
  if (m.screen !== 'kal') return false;
  if (t.id === 'k27-q') { K.q = t.value; runSearch(); return true; }
  const f = t.dataset?.k27i;
  if (f && K.form) {
    if (f === 'start') { const d = mm(K.form.end) - mm(K.form.start); K.form.start = t.value; if (t.value && d > 0) K.form.end = hm(Math.min(mm(t.value) + d, 23 * 60 + 59)); const en = document.querySelector('[data-k27i="end"]'); if (en) en.value = K.form.end; }
    else K.form[f] = t.value;
    return true;
  }
  return false;
}
export async function kalBind(e, t) {
  if (m.screen !== 'kal') return false;
  if (e.type === 'submit') { if (!t.matches?.('[data-k27f]')) return false; e.preventDefault(); await saveForm(); return true; }
  if (e.type !== 'click') return false;
  if (Date.now() - K.swiped < 350) { K.swiped = 0; e.preventDefault(); e.stopPropagation(); return true; }
  if (t.closest?.('[data-p27clr]') && t.closest('.k27-sf')) { K.q = ''; K.res = null; const i = document.getElementById('k27-q'); if (i) { i.value = ''; i.focus(); i.parentElement.classList.remove('has'); } draw(); return true; }
  const x = t.closest?.('[data-k27]');
  if (!x) {
    // Trykk på tom plass i rutenettet: ny hendelse på den halvtimen.
    const col = t.closest?.('[data-k27col]');
    if (col && !t.closest('.k27-ev')) { const r = col.getBoundingClientRect(), HH = +col.dataset.hh, mi = Math.max(0, Math.min(23 * 60, Math.floor(((e.clientY - r.top) / HH) * 2) * 30)); openForm({ date: col.dataset.k27col, start: hm(mi), end: hm(Math.min(mi + 60, 23 * 60 + 59)) }); return true; }
    return !!t.closest?.('[data-k27stop]');
  }
  if (x.dataset.k27 === 'shx' && x !== t && t.closest('[data-k27stop]') && !t.closest('.k27-cx')) return true;
  e.preventDefault();
  const a = x.dataset.k27;
  switch (a) {
    case 'back': location.hash = m.kalFrom && m.kalFrom !== 'kal' ? `#/${m.kalFrom}` : '#/mer'; return true;
    case 'mini': if (!wide()) { K.mini = !K.mini; K.miniOff = 0; } break;
    case 'mprev': K.miniOff--; break;
    case 'mnext': K.miniOff++; break;
    case 'mday': K.cur = x.dataset.k; K.mini = false; K.miniOff = 0; K.sel = null; break;
    case 'dday': K.cur = x.dataset.k; K.sel = null; setView('dag'); return true;
    case 'cal': { const id = x.dataset.id; L.hidCal = { ...hidCal(), [id]: !hidCal()[id] }; keep(); saveFilters(); haptic('tab'); break; }
    case 'cset': location.hash = '#/set/kal'; return true;
    case 'prev': shift(-1); return true;
    case 'next': shift(1); return true;
    case 'today': K.cur = null; K.sel = null; K.mini = false; K.gk = ''; haptic('tap'); break;
    case 'search': openSearch(); return true;
    case 'view': setView(x.dataset.v); return true;
    case 'new': openForm({}); return true;
    case 'none': return true;
    case 'ev': {
      const id = x.dataset.id, ev = EVMAP.get(id);
      if (x.dataset.go && ev) { K.srch = false; K.cur = ev.k; if (view() === 'maaned' || view() === 'liste') save({ kalView: 'dag' }, { view: 'dag' }); }
      K.sel = id; K.delArm = false; haptic('tap'); break;
    }
    case 'shx': K.sel = null; K.form = null; K.srch = false; K.delArm = false; break;
    case 'rem': { const ev = EVMAP.get(K.sel); if (!ev) return true; const k2 = ev.base ?? ev.id, v = { ...rems(), [k2]: x.dataset.v }; save({ kalReminders: v }, { rem: v }); haptic('tab'); if (x.dataset.v !== 'none' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); break; }
    case 'edit': { const ev = EVMAP.get(K.sel); if (ev) editForm(ev); return true; }
    case 'del': { const ev = EVMAP.get(K.sel); if (!ev) return true; if (!K.delArm) { K.delArm = true; break; } await delEvent(ev); return true; }
    case 'dup': { const ev = EVMAP.get(K.sel); if (ev) await copyEvent(ev); return true; }
    case 'fall': if (K.form) K.form.allDay = !K.form.allDay; break;
    case 'fcal': if (K.form) K.form.calendar = x.dataset.v; break;
    case 'frep': if (K.form) K.form.repeat = x.dataset.v; break;
    case 'frem': if (K.form) K.form.reminder = x.dataset.v; break;
    default: return true;
  }
  draw(); return true;
}
/** Ny side: lukk ark og gå tilbake til i dag. */
export function kalLeave() { K.sel = null; K.form = null; K.srch = false; K.mini = false; K.cur = null; K.gk = ''; }
