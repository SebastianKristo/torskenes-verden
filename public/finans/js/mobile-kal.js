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
import { parseQuick } from '/assets/js/quick-time.js';
import { LEARN_TYPES, typeName, loadMemory, memoryNow, addMemory, applyMemory, nameOfEvent, dinOf } from '/assets/js/glimt-memory.js'; // prompt 33
import * as P29 from './mobile-p29.js';
import { glimt } from './mobile-p31.js'; // prompt 32: Glimt-merket i søket og «Beskriv med Glimt»

const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], MS = MN.map((x) => x.slice(0, 3));
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'], WS = ['MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN'];
const LAB = 'var(--pp-lab)';
// Kalenderne (kontrakt 27). Serveren kan sende egne navn/farger i `calendars`.
const CALS0 = [['timeplan', 'Timeplan', '#2b5d8a', 'Skolens iCal'], ['prover', 'Prøver og frister', '#b23a2a', 'Skolens iCal'], ['skole', 'Skole', '#a8661a', 'Skolens iCal'], ['privat', 'Privat', '#6b4fa0', 'Google Kalender'], ['familie', 'Familie', '#d08a1e', 'Google · delt med familien'], ['bursdager', 'Bursdager', '#3f7a6e', 'Bursdager-modulen']];
const VIEWS = [['dag', 'Dag', 'M5 4h14v16H5zM5 9h14'], ['3dager', '3 dager', 'M3 5h18v15H3zM9 5v15M15 5v15'], ['uke', 'Uke', 'M3 5h18v15H3zM3 10h18M7.5 5v15M12 5v15M16.5 5v15'], ['maaned', 'Måned', 'M3 5h18v15H3zM3 10h18M3 15h18M9 5v15M15 5v15'], ['liste', 'Liste', 'M4 6h16M4 12h16M4 18h10']];
const REMS = [['none', 'Ingen'], ['10m', '10 min'], ['15m', '15 min'], ['1h', '1 time'], ['day', 'Dagen før']];
const REPS = [['none', 'Ingen'], ['daily', 'Hver dag'], ['weekly', 'Hver uke'], ['monthly', 'Hver måned']];

const LS = 'fh_kal';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };

// Prompt 31: URL-er fjernes fra stedsteksten i alle korte visninger (timeplan-import har «Pilestredet park 35 U2005 https://link.mazemap.com/…»).
// Lenken beholdes i hendelsen og vises som «Åpne kart ↗» i detaljarket.
const URL_RE = /\s*https?:\/\/\S+/g;
export const noUrl = (t) => String(t ?? '').replace(URL_RE, '').replace(/\s{2,}/g, ' ').trim();
const urlOf = (t) => (String(t ?? '').match(/https?:\/\/\S+/) ?? [null])[0];
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
  const base = { id: String(x.id ?? `${a.k}|${x.title}`), t: x.title ?? x.subject ?? '', short: x.short || '', subj: x.subject ?? '', r: noUrl(x.room ?? x.location ?? ''), rl: x.room ?? x.location ?? '', teacher: x.teacher ?? '', n: x.note ?? x.description ?? '', kind, cal, color: x.color ?? null, url: x.url ?? null, maze: x.mazemap ?? urlOf(x.location) ?? urlOf(x.room) ?? null, src: x.source ?? '', editable: !!x.editable, rep: x.recurrence ?? null, reminder: x.reminder ?? null, raw: x };
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
    .map((u) => ({ id: `u|${u.id}|${k}`, uid: u.id, k, s: u.allDay ? '' : u.start, e: u.allDay ? '' : u.end, t: u.title, short: '', subj: '', r: noUrl(u.location || ''), rl: u.location || '', maze: urlOf(u.location), teacher: '', n: u.note || '', kind: 'g', cal: u.calendar, color: null, src: 'local', editable: true, rep: u.repeat, reminder: u.reminder, local: true }));
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

// Prompt 29: lyst «Nå / Neste»-kort (claude-code-kalender-na-kort.md) i stedet for den svarte stripen.
function nextStrip() {
  const now = new Date(), today = d0(now), nm = now.getHours() * 60 + now.getMinutes();
  let nx = null;
  for (let i = 0; i < 21 && !nx; i++) { const d = add(today, i); for (const e of evOn(d).filter((x) => x.s && x.e && x.kind !== 'innl')) { const a = mm(e.s) + i * 1440, b = mm(e.e) + i * 1440; if (b > nm) { nx = { e: reg(e), cur: a <= nm, a, b, i, d }; break; } } }
  const clock = svgP('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5V12l3 2', 20, 2);
  if (!nx) return `<button class="k29-nx" data-k27="none" style="--c:#7a7468"><span class="k29-ic">${clock}</span><span class="m-grow k29-nm"><b class="k29-t">Ingen kommende hendelser</b><span class="k29-k"><span class="k29-mu">De neste tre ukene</span></span></span></button>`;
  const e = nx.e, c = col(e);
  const big = nx.cur ? dur2(nx.b - nm) : nx.a - nm < 1440 ? dur2(nx.a - nm) : cap(WD[nx.d.getDay()]).slice(0, 3);
  const small = nx.cur ? 'igjen' : nx.a - nm < 1440 ? 'til start' : e.s;
  const day = nx.i === 0 ? 'i dag' : nx.i === 1 ? 'i morgen' : dLong(nx.d);
  const pct = nx.cur ? Math.round(((nm - nx.a) / Math.max(1, nx.b - nx.a)) * 100) : 0;
  return `<button class="k29-nx" ${evAttr(e)} style="--c:${c}"><span class="k29-ic">${clock}</span><span class="m-grow k29-nm"><span class="k29-k"><span>${nx.cur ? 'NÅ' : 'NESTE'}</span><span class="k29-mu">${esc(`${e.s}–${e.e} · ${day}`)}</span></span><span class="k29-tr"><b class="k29-t">${esc(e.t)}</b>${e.r ? `<span class="k29-rm">${esc(e.r)}</span>` : ''}</span></span><span class="k29-w"><b>${esc(big)}</b><span>${esc(small)}</span></span>${nx.cur ? `<span class="k29-pg"><i style="width:${pct}%"></i></span>` : ''}</button>`;
}
function miniCal() {
  const V = view(), cur = curD(), tk = key(new Date()), base = new Date(cur.getFullYear(), cur.getMonth() + K.miniOff, 1, 12), st = add(base, -((base.getDay() + 6) % 7));
  const [a, b] = range();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = add(st, i), k = key(d), isT = k === tk, inW = V !== 'maaned' && V !== 'liste' ? k >= a && k <= b : k === key(cur), L0 = evOn(d).filter((e) => e.kind !== 'time');
    const wk = i % 7 === 0 ? `<button class="k29-wk mini" data-k27="wk" data-k="${k}" aria-label="Uke ${isoW(d)}">${isoW(d)}</button>` : '';
    return `${wk}<button class="k27-mc${isT ? ' t' : inW ? ' w' : ''}${d.getMonth() === base.getMonth() ? '' : ' o'}" data-k27="mday" data-k="${k}">${d.getDate()}<i style="background:${L0.length ? (isT ? '#fff' : col(L0[0])) : 'transparent'}"></i></button>`;
  }).join('');
  return `<div class="k27-mini"><div class="k27-mh"><b>${cap(MN[base.getMonth()])} ${base.getFullYear()}</b><button data-k27="mprev" aria-label="Forrige måned">‹</button><button data-k27="mnext" aria-label="Neste måned">›</button></div>
    <div class="k27-mg k29-mg"><span>U</span>${WS.map((t) => `<span>${t[0]}</span>`).join('')}${cells}</div></div>`;
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
      return `<button class="k27-ev${solid ? ' solid' : ''}" ${evAttr(e)} style="top:${(y.a / 60) * HH}px;height:${Math.max(18, ht - 2)}px;left:calc(${(y.c / y.n) * 100}% + 1px);width:calc(${100 / y.n}% - 3px);border-left-color:${c};background:${solid ? c : `color-mix(in oklab,${c} 22%,var(--pp-card))`}${sel === e.id ? ';outline:2px solid var(--pp-ink);outline-offset:1px' : ''};font-size:${narrow ? '10.5px' : '12px'}"><b>${esc(short(e))}</b>${ht >= 40 && !(narrow && y.n > 1) ? `<span>${esc(`${e.s}–${e.e}${e.r ? ` · ${e.r}` : ''}`)}</span>` : ''}</button>`;
    }).join('')}${x.isT ? `<span class="k27-now" style="top:${(nm / 60) * HH}px"><i></i></span>` : ''}</div>`).join('')}</div>`;
  K.gkNow = `${V}|${a}`; K.gy = Math.max(0, (days.some((x) => x.isT) ? nm / 60 : 7.75) * HH - (days.some((x) => x.isT) ? HH * 1.5 : 0));
  return `${head}${allRow}<div class="k27-gs" id="k27-gs">${grid}</div>`;
}
function monthView() {
  const [a, b, st] = range(), cur = curD(), tk = key(new Date()), w = wide();
  ensure(a, b);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = add(st, i), k = key(d), L0 = evOn(d), isT = k === tk, inM = d.getMonth() === cur.getMonth(), les = L0.filter((e) => e.kind === 'time').length, oth = L0.filter((e) => e.kind !== 'time'), mx = w ? 4 : 3, sh = oth.slice(0, les ? mx - 1 : mx);
    const chips = sh.map((e) => { reg(e); const solid = e.kind === 'prove' || !e.s || e.kind === 'innl'; // Prompt 30: hendelsen i dagruta åpner hendelsen (detaljarket); handleren tar nærmeste [data-k27], så ruta selv (dday → Dag) får ikke trykket.
      return `<span class="k30-mev" role="button" tabindex="0" ${evAttr(e)} style="background:${solid ? col(e) : `color-mix(in oklab,${col(e)} 18%,var(--pp-card))`};color:${solid ? '#fff' : `color-mix(in oklab,${col(e)} 78%,var(--pp-ink))`}">${esc(`${e.s && e.kind !== 'innl' && w ? `${e.s} ` : ''}${short(e)}`)}</span>`; });
    if (les) chips.push(`<span class="les">${les}${w ? ' timer' : ' t'}</span>`);
    const wk = i % 7 === 0 ? `<button class="k29-wk" data-k27="wk" data-k="${k}" aria-label="Uke ${isoW(d)}">${isoW(d)}</button>` : '';
    return `${wk}<button class="k27-md${isT ? ' t' : ''}${inM ? '' : ' o'}" data-k27="dday" data-k="${k}"><b>${d.getDate()}</b>${chips.join('')}${oth.length > sh.length ? `<em>+${oth.length - sh.length}</em>` : ''}</button>`;
  }).join('');
  return `<div class="k27-mhd k29-mhd"><span>U</span>${WS.map((t) => `<span>${w ? t : t[0]}</span>`).join('')}</div><div class="k27-mo k29-mo">${cells}</div>`;
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
    ${e.editable && !e.local ? '<button type="button" class="k33-learn" data-k27="learn">Lær Glimt hva dette er…</button>' : ''}
    <div class="k27-btns">${e.editable ? `<button class="ink" data-k27="edit">Rediger</button><button class="red" data-k27="del">${K.delArm ? 'Trykk igjen' : 'Slett'}</button>` : ''}${map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Åpne kart ↗</a>` : ''}${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">Åpne i ${e.src === 'canvas' ? 'Canvas' : 'kilden'} ↗</a>` : ''}${e.editable || e.kind === 'bursdag' ? '' : '<button data-k27="dup">Kopier til Privat</button>'}</div>`);
}
/* ---------- Prompt 32: «✦ Beskriv med Glimt» i Ny hendelse (Kalender.dc.html → fmAi) ---------- */
function aiBox(F) {
  const A = F.aiS ?? {}, txt = F.ai ?? '', busy = !!A.busy, has = !!txt.trim();
  return `<div class="k32-fm"><div class="k32-fmh"><span class="k32-fml">✦ BESKRIV MED GLIMT</span><span class="m-grow"></span>${A.done ? `<span class="k32-fmok">✓ ${esc(A.note)}</span>` : ''}</div>
    <div class="k32-fmr"><textarea id="k32-ai" rows="2" data-k27i="ai" placeholder="F.eks. «Tannlege hos Dr. Berg tirsdag 10.30, Bogstadveien 12, minn meg dagen før» eller lim inn en melding" aria-label="Beskriv hendelsen">${esc(txt)}</textarea>
    <button type="button" class="k32-fill${has ? ' on' : ''}${busy ? ' busy' : ''}" data-k27="fai" ${!has || busy ? 'disabled' : ''}>${glimt(28, busy ? 'think' : 'ready')}<span>${busy ? 'Fyller ut …' : 'Fyll ut'}</span></button></div>
    ${A.err ? `<span class="k32-fmerr">${esc(A.err)}</span>` : ''}</div>`;
}
function aiApply(r, txt) {
  const F = K.form; if (!F) return;
  const t = txt.toLowerCase(), got = [];
  if (r.title) { F.title = r.title; got.push('tittel'); }
  if (r.date) { F.date = r.date; got.push('dato'); }
  if (r.allDay) F.allDay = true;
  else if (r.start) { F.allDay = false; F.start = r.start; F.end = r.end || hm(Math.min(mm(r.start) + (r.duration || 60), 23 * 60 + 59)); got.push('tid'); }
  if (r.place) { F.location = r.place; got.push('sted'); }
  const rp = /hver dag|daglig/.test(t) ? 'daily' : /hver uke|ukentlig|hver (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)/.test(t) ? 'weekly' : /hver måned|månedlig/.test(t) ? 'monthly' : r.repeat && REPS.some(([k]) => k === r.repeat) ? r.repeat : null;
  if (rp) { F.repeat = rp; got.push('gjentakelse'); }
  const rm = /dagen før/.test(t) ? 'day' : /(1|en) time før|times? før/.test(t) ? '1h' : /15 min/.test(t) ? '15m' : /10 min/.test(t) ? '10m' : /ingen varsel|ikke varsle/.test(t) ? 'none' : r.reminder && REMS.some(([k]) => k === r.reminder) ? r.reminder : null;
  if (rm) { F.reminder = rm; got.push('varsel'); }
  if (/familie|famil|barna|mamma|pappa/.test(t) || r.calendar === 'familie') { F.calendar = 'familie'; got.push('kalender'); } else F.calendar = F.calendar || 'privat';
  if (txt.length > 60 && !F.note) F.note = txt;
  const list = got.length > 2 ? `${got.slice(0, -1).join(', ')} og ${got[got.length - 1]}` : got.join(' og ');
  F.aiS = r.date ? { done: true, note: r.srvNote || `Fylte ut ${list || 'feltene'}` } : { err: r.srvErr || 'Fant ikke dato. Velg dato under.' };
}
async function fillAi() {
  const F = K.form; if (!F) return;
  const txt = String(F.ai ?? '').trim(); if (!txt || F.aiS?.busy) return;
  F.aiS = { busy: true }; draw();
  let r = null; try { r = parseQuick(txt, key(new Date())); } catch {}
  if (r?.ok && r.date) { await new Promise((ok) => setTimeout(ok, 450)); }
  else {
    // Parseren fant ikke dato: spør serveren (lokal modell), POST /api/kalender/describe {text}.
    try {
      const d = await hlApi('/kalender/describe', { method: 'POST', json: { text: txt, today: key(new Date()) } }), x = d?.event ?? d ?? {};
      const tm = (v) => (v == null || v === '' ? null : /^\d{1,2}:\d{2}$/.test(String(v)) ? String(v).padStart(5, '0') : when(v)?.hm || null);
      const dk = x.date ?? (/^\d{4}-\d{2}-\d{2}/.test(String(x.start ?? '')) ? String(x.start).slice(0, 10) : null);
      r = { title: x.title ?? r?.title ?? '', date: dk, start: x.allDay ? null : tm(x.start), end: x.allDay ? null : tm(x.end), place: x.location ?? r?.place ?? '', allDay: !!x.allDay && !!dk, repeat: x.repeat, reminder: x.reminder, calendar: x.calendar, note: x.note, srvNote: d?.note, srvErr: d?.error };
    } catch { r = { title: r?.title ?? '', date: null, start: r?.start ?? null, end: r?.end ?? null, place: r?.place ?? '' }; }
  }
  if (K.form !== F) return;
  aiApply(r, txt); haptic(F.aiS.done ? 'ok' : 'err'); draw();
}
function formSheet() {
  const F = K.form; if (!F) return '';
  const chip = (on) => (on ? ' class="on"' : '');
  const wc = cals().filter((c) => c.writable);
  return sheetWrap(`<div class="k27-dh"><b class="m-grow k27-fh">${F.id ? 'Rediger hendelse' : 'Ny hendelse'}</b><button class="k27-cx" data-k27="shx" aria-label="Lukk">✕</button></div>
    <form class="k27-form" data-k27f="save">${aiBox(F)}<input id="k27-ft" class="k27-in big" value="${esc(F.title)}" placeholder="Tittel" autocomplete="off" data-k27i="title">
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
/* ---------- Prompt 33: «Lær Glimt hva dette er…» (alias i «Glimt husker») ---------- */
function learnSheet() {
  const G = K.learn; if (!G) return '';
  const head = `<div class="k27-dh"><span class="m-grow"><span class="k27-lab">✦ GLIMT HUSKER</span><b class="k27-dt">Lær Glimt hva dette er</b></span><button class="k27-cx" data-k27="lx" aria-label="Lukk">✕</button></div>`;
  if (G.step === 'ask') {
    return sheetWrap(`${head}<p class="k33-q">Ok, Glimt husker at <b>${esc(G.name)}</b> er ${esc(dinOf(G.type))}.</p>
      ${G.count ? `<p class="k33-q">Endre tittel på ${G.count} ${G.count === 1 ? 'avtale' : 'avtaler'} til «${esc(G.title)}»?</p><div class="k27-btns"><button class="ink" data-k27="lapply"${G.busy ? ' disabled' : ''}>${G.busy ? 'Endrer …' : 'Endre'}</button><button data-k27="lx">Nei takk</button></div>`
    : '<div class="k27-btns"><button class="ink" data-k27="lx">Ferdig</button></div>'}`);
  }
  return sheetWrap(`${head}${G.text ? `<p class="k33-q">${esc(G.text)}</p>` : ''}
    <span class="k27-lab">HVA ER DETTE?</span><div class="k27-chips">${LEARN_TYPES.map(([v, n]) => `<button type="button" class="${G.type === v ? 'on' : ''}" data-k27="ltype" data-v="${v}" aria-pressed="${G.type === v}">${n}</button>`).join('')}</div>
    <form class="k27-form" data-k27f="learn"><input class="k27-in" id="k33-name" value="${esc(G.name)}" placeholder="Navn på avsender, f.eks. Påhåret" data-k33i="name" autocomplete="off">
      ${G.type === 'annet' ? `<input class="k27-in" value="${esc(G.title)}" placeholder="Tittel, f.eks. Massasje · Spa Nova" data-k33i="title" autocomplete="off">` : ''}
      ${G.err ? `<span class="k27-err">${esc(G.err)}</span>` : ''}
      <button type="submit" class="k27-save"${!G.type || G.busy ? ' disabled' : ''}>${G.busy ? 'Lagrer …' : G.suggest ? 'Husk' : 'Lagre'}</button>
      <span class="k27-mut sm">Glimt bruker dette neste gang en melding fra samme avsender legges inn. Se Innstillinger → AI → Glimt husker.</span></form>`);
}
function learnOpen(ev, pre = {}) { K.sel = null; K.learn = { step: 'pick', type: pre.type ?? '', name: pre.name ?? nameOfEvent(ev ?? {}), title: pre.title ?? '', text: pre.text ?? '', suggest: !!pre.suggest, err: '' }; draw(); }
async function learnSave() {
  const G = K.learn; if (!G) return;
  if (!G.type) { G.err = 'Velg hva det er.'; draw(); return; }
  if (G.name.trim().length < 2) { G.err = 'Skriv navnet på avsenderen.'; draw(); return; }
  const name = G.name.trim(), title = G.type === 'annet' ? G.title.trim() || name : G.suggest && G.title ? G.title : `${typeName(G.type)} · ${name}`;
  G.busy = true; G.err = ''; draw();
  try { const d = await addMemory({ match: name, type: G.type, title }); Object.assign(G, { step: 'ask', id: d.item?.id, count: d.matches ?? 0, title: d.item?.title || title, name }); haptic('ok'); }
  catch (e) { G.err = e.message; }
  G.busy = false; draw();
}
async function learnApply() {
  const G = K.learn; if (!G?.id) return;
  G.busy = true; draw();
  try { const d = await applyMemory(G.id); K.learn = null; flash(d.count ? `${d.count} ${d.count === 1 ? 'avtale' : 'avtaler'} fikk nytt navn ✓` : 'Ingen avtaler å endre'); await kalLoad(true).catch(() => {}); }
  catch (e) { G.busy = false; G.err = e.message; G.step = 'pick'; }
  draw();
}

/* ---------- Prompt 29: «Legg til time» (rask time med AI, claude-code-kalender-rask-time.md) ---------- */
const QCHIPS = ['Frisør', 'Lege', 'Tannlege', 'Fysio'];
function qaPreview(txt) {
  const t = String(txt ?? '').trim();
  if (t.length <= 3) return '';
  if (!memoryNow().length) loadMemory().then((l) => { if (l.length && K.qa) qaSet(K.qa.txt); });
  const r = parseQuick(t, key(new Date()), memoryNow());
  if (!r.ok) return `<span class="k29-bad">${esc(r.why || 'Fant ikke dato. Skriv f.eks. «25.09» eller «tirsdag».')}</span>`;
  const d = ofKey(r.date), when = `${WD[d.getDay()]} ${d.getDate()}. ${MN[d.getMonth()]}${r.start ? ` · ${r.start}–${r.end}` : ' · hele dagen'}`;
  return `<div class="k29-pv"><span class="k29-pvb"></span><span class="m-grow"><b>${esc(r.title)}</b><span>${esc(when)}</span>${r.place ? `<span>${esc(r.place)}</span>` : ''}<small>Privat · varsel 1 time før</small></span></div>`;
}
function qaSheet() {
  const Q = K.qa; if (!Q) return '';
  const has = !!Q.txt.trim();
  return sheetWrap(`<span class="k29-grip" aria-hidden="true"></span><div class="k29-qh"><span class="m-grow"><span class="k27-lab">✦ AI · RASK TIME</span><b>Legg til time</b></span><button class="k27-cx" data-k27="shx" aria-label="Lukk">${svgP('M6 6l12 12M18 6L6 18', 14, 2.6)}</button></div>
    <form class="k29-qf" data-k27f="qa"><textarea id="k29-qt" rows="3" data-k27i="qa" placeholder="F.eks. «time hos Nina frisør 14.30 25.09» eller lim inn meldingen fra legekontoret">${esc(Q.txt)}</textarea>
      <div class="k29-chips"><button type="button" class="ink" data-k27="qpaste">${svgP('M9 4h6v3H9zM7 5H5v16h14V5h-2', 13, 2.2)}Lim inn melding</button>${QCHIPS.map((n) => `<button type="button" data-k27="qchip" data-v="${n}">${n}</button>`).join('')}</div>
      <div id="k29-pvw">${qaPreview(Q.txt)}</div>
      <button type="submit" class="k29-go" id="k29-go" style="opacity:${has ? 1 : 0.45}">Legg til i kalenderen</button>
      <button type="button" class="k29-man" data-k27="qman">Fyll ut selv</button>
      <span class="k29-fn">Du kan lukke appen. Timen legges til i bakgrunnen.</span></form>`);
}
function qaOpen(txt = '') { K.qa = { txt }; K.sel = null; K.mini = false; draw(); setTimeout(() => { const t = document.getElementById('k29-qt'); if (t) { t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length); } }, 40); }
function qaSet(txt) {
  if (!K.qa) return; K.qa.txt = txt;
  const t = document.getElementById('k29-qt'); if (t && t.value !== txt) t.value = txt;
  const w = document.getElementById('k29-pvw'); if (w) w.innerHTML = qaPreview(txt);
  const g = document.getElementById('k29-go'); if (g) g.style.opacity = txt.trim() ? '1' : '0.45';
}
/** Åpner «Legg til time» (også fra del-mål/andre sider). */
export function kalQuick(txt = '') { if (m.screen !== 'kal') { location.hash = '#/kal'; setTimeout(() => qaOpen(txt), 120); } else qaOpen(txt); }
/** Åpner vanlig skjema ferdig utfylt (når tolkningen feiler). */
export function kalFormPrefill(pre) { const go = () => openForm(pre); if (m.screen !== 'kal') { location.hash = '#/kal'; setTimeout(go, 160); } else go(); }
/** «Vis»: hopp til dagen. */
export function kalShowDay(k) { K.cur = k; K.sel = null; if (view() !== 'dag' && view() !== '3dager' && view() !== 'uke') save({ kalView: 'dag' }, { view: 'dag' }); if (m.screen !== 'kal') location.hash = '#/kal'; else draw(); }
/** Lagrer en hendelse lokalt (server uten skrive-endepunkt). Returnerer id. */
export function kalAddLocal(body) { const id = `u${Date.now()}`; L.ue = [...ue(), { id, ...body }]; keep(); return id; }
export function kalDelLocal(id) { const n = ue().length; L.ue = ue().filter((x) => x.id !== id); keep(); return ue().length < n; }
export const kalMissing = () => K.miss;

/* ---------- Prompt 32: søkemeny med Glimt (Kalender.dc.html → sr, srLocal, srCloud, srMark) ---------- */
const relOf = (i) => (i === 0 ? 'I dag' : i === 1 ? 'I morgen' : i === -1 ? 'I går' : i > 0 ? `om ${i} dager` : `${-i} dager siden`);
const SUGG = ['Hva har jeg i morgen?', 'Når er neste prøve?', 'Er jeg ledig fredag ettermiddag?', 'Hva skjer neste uke?'];
function srHits(q, F) {
  const t = d0(new Date()), out = [];
  for (let i = -30; i < 120 && out.length < 60; i++) { const d = add(t, i); for (const e of evOn(d, false)) if (out.length < 60 && (F === '*' || e.cal === F) && `${e.t} ${e.r} ${noUrl(e.n)} ${e.subj}`.toLowerCase().includes(q)) out.push({ e, d, i }); }
  return [...out.filter((x) => x.i >= 0), ...out.filter((x) => x.i < 0).reverse()];
}
const hit = (t, q) => { const s0 = String(t ?? ''), ix = q ? s0.toLowerCase().indexOf(q) : -1; return ix < 0 ? esc(s0) : `${esc(s0.slice(0, ix))}<mark class="k32-hit">${esc(s0.slice(ix, ix + q.length))}</mark>${esc(s0.slice(ix + q.length))}`; };
/** Lokale svar uten nett: dag/periode, ledig tid, prøver/frister og «neste X». null = ikke forstått. */
function srLocal(q) {
  const today = d0(new Date()), now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), n = q.toLowerCase().replace(/[?!.]/g, ' ');
  let from = null, to = null, lbl = '';
  if (/i overmorgen/.test(n)) { from = to = add(today, 2); lbl = 'i overmorgen'; }
  else if (/i morgen/.test(n)) { from = to = add(today, 1); lbl = 'i morgen'; }
  else if (/i dag|idag/.test(n)) { from = to = today; lbl = 'i dag'; }
  else if (/neste uke/.test(n)) { const mo = add(today, 7 - ((today.getDay() + 6) % 7)); from = mo; to = add(mo, 6); lbl = 'neste uke'; }
  else if (/denne uk|resten av uk/.test(n)) { from = today; to = add(today, 6 - ((today.getDay() + 6) % 7)); lbl = 'resten av uka'; }
  else { const w = WD.findIndex((x) => new RegExp(`\\b${x}`).test(n)); if (w >= 0) { from = to = add(today, (w - today.getDay() + 7) % 7); lbl = WD[w]; } }
  const span = (a, b) => { const out = []; for (let d = a; d <= b; d = add(d, 1)) evOn(d).forEach((e) => { if (+d !== +today || !e.e || mm(e.e) > nm || /ledig/.test(n)) out.push({ e, d }); }); return out; };
  const rel = (d) => { const i = Math.round((d - today) / 864e5); return i === 0 ? 'i dag' : i === 1 ? 'i morgen' : `om ${i} dager`; };
  if (/ledig|fri tid|tid til|opptatt/.test(n)) {
    const d = from || today, pm = /ettermiddag|kveld/.test(n), am = /formiddag|morgen\b/.test(n) && !/i morgen/.test(n);
    const A0 = pm ? 720 : 480, B0 = pm ? 1200 : am ? 720 : 1200, Lx = evOn(d).filter((e) => e.s && e.e).map((e) => [mm(e.s), mm(e.e)]).sort((a, b) => a[0] - b[0]);
    let t = A0; if (+d === +today) t = Math.max(t, Math.ceil(nm / 15) * 15);
    const fr = []; Lx.forEach(([a, b]) => { if (a > t && a - t >= 30) fr.push([t, Math.min(a, B0)]); t = Math.max(t, b); }); if (B0 - t >= 30) fr.push([t, B0]);
    const f = fr.filter(([a, b]) => b - a >= 30 && a < B0);
    return { txt: `${cap(dLong(d))}${f.length ? ` er du ledig ${f.map(([a, b]) => `${hm(a)}–${hm(b)}`).join(', ')}.` : ` er du opptatt hele ${pm ? 'ettermiddagen' : 'dagen'}.`}`, items: span(d, d).filter((x) => x.e.s) };
  }
  if (/prøve|eksamen|frist|innlever|oblig/.test(n) && !from) {
    const out = []; for (let i = 0; i < 120 && out.length < 5; i++) { const d = add(today, i); evOn(d).filter((e) => e.kind === 'prove' || e.kind === 'innl').forEach((e) => out.push({ e, d })); }
    if (!out.length) return { txt: 'Ingen prøver eller frister de neste fire månedene.', items: [] };
    const x = out[0]; return { txt: `Neste er ${short(x.e)} ${dLong(x.d)} (${rel(x.d)})${out.length > 1 ? `. Deretter ${out.length - 1} til.` : '.'}`, items: out };
  }
  if (from) { const Lx = span(from, to); if (!Lx.length) return { txt: `Du har ingenting i kalenderen ${lbl}.`, items: [] }; const nT = Lx.filter((x) => x.e.kind === 'time').length; return { txt: `${cap(lbl)} har du ${Lx.length} ting${nT ? `, ${nT} av dem i timeplanen` : ''}. Først ut: ${short(Lx[0].e)}${Lx[0].e.s ? ` kl. ${Lx[0].e.s}` : ''}.`, items: Lx }; }
  if (/neste|når/.test(n) && !/\bsist\b|forrige|hadde/.test(n)) {
    const stop = new Set(['når', 'er', 'neste', 'min', 'mitt', 'mi', 'time', 'timen', 'har', 'jeg', 'skal', 'hva', 'hos', 'den', 'det', 'en', 'et', 'på', 'i', 'meg', 'til', 'sist', 'hadde']);
    const kw = n.split(/\s+/).filter((w) => w && !stop.has(w));
    if (kw.length) {
      for (let i = 0; i < 120; i++) { const d = add(today, i), e = evOn(d).find((x) => (i > 0 || !x.e || mm(x.e) > nm) && kw.every((w) => `${x.t} ${x.subj || ''} ${x.r || ''}`.toLowerCase().includes(w))); if (e) return { txt: `${short(e)} er ${dLong(d)}${e.s ? ` kl. ${e.s}` : ''} (${rel(d)}).`, items: [{ e, d }] }; }
      if (!/sist/.test(n)) return { txt: `Fant ingen kommende «${kw.join(' ')}» de neste fire månedene.`, items: [] };
    }
  }
  return null;
}
/** Spør Glimt: lokalt først, ellers serveren (GET /api/kalender/search?q=&ai=1 → {answer, events}). */
async function srAsk(t) {
  const q = String(t ?? K.q).trim(); if (!q) return;
  K.q = q; const loc = srLocal(q);
  K.ai = { q, busy: true }; draw();
  if (loc) { setTimeout(() => { if (K.ai?.q === q) { K.ai = { q, ...loc }; haptic('ok'); draw(); } }, 450); return; }
  try {
    const r = await hlApi(`/kalender/search?q=${encodeURIComponent(q)}&ai=1`);
    const an = r?.answer && typeof r.answer === 'object' ? r.answer : { text: r?.answer ?? r?.text ?? '' };
    const txt = String(an.text ?? '').replace(/\*\*/g, '').replace(/\s*\[\d+\]/g, '').trim();
    const evs = (an.items?.length ? an.items : an.kind === 'none' ? [] : r?.events ?? []).flatMap(norm).filter((e) => !e.cont).slice(0, 6).map((e) => ({ e, d: ofKey(e.k) }));
    if (K.ai?.q !== q) return;
    K.ai = { q, txt: txt || (evs.length ? `Fant ${evs.length} ${evs.length === 1 ? 'hendelse' : 'hendelser'}.` : 'Jeg fant ikke noe konkret svar i kalenderen. Prøv «hva har jeg på fredag?» eller «når er neste prøve?».'), items: evs };
  } catch { if (K.ai?.q === q) K.ai = { q, txt: 'Jeg fant ikke noe konkret svar i kalenderen. Prøv «hva har jeg på fredag?» eller «når er neste prøve?».', items: [] }; }
  haptic('ok'); draw();
}
const srRow = (x, q, withDay) => { reg(x.e); return `<button ${evAttr(x.e)} data-go="1"><span class="k27-bar" style="background:${col(x.e)}"></span>${withDay ? `<span class="k32-dn"><span>${WS[(x.d.getDay() + 6) % 7]}</span><b>${x.d.getDate()}</b></span>` : `<span class="k32-tm">${esc(x.e.s || 'Hele')}</span>`}<span class="m-grow"><b>${q ? hit(short(x.e), q) : esc(short(x.e))}</b><span>${esc(withDay ? `${tmOf(x.e)}${x.e.r ? ` · ${x.e.r}` : ''}` : `${x.e.r || noUrl(x.e.n) || tmOf(x.e)}`)}</span></span></button>`; };
const aiRow = (x) => { reg(x.e); return `<button ${evAttr(x.e)} data-go="1"><span class="k27-bar" style="background:${col(x.e)}"></span><span class="k32-tm">${esc(x.e.s || 'Hele')}</span><span class="m-grow"><b>${esc(short(x.e))}</b><span>${esc(cap(dLong(x.d)))}${x.e.r ? ` · ${esc(x.e.r)}` : ''}</span></span></button>`; };
function searchSheet() {
  if (!K.srch) return '';
  const q0 = K.q.trim(), q = q0.toLowerCase(), F = K.srF ?? '*', A = K.ai && K.ai.q === q0 ? K.ai : null;
  const chips = [['*', 'Alle', ''], ...cals().map((c) => [c.id, c.name, c.color])].map(([k, n, c]) => `<button type="button" data-k27="srf" data-v="${esc(k)}" aria-pressed="${F === k}">${c ? `<i style="background:${esc(c)}"></i>` : ''}${esc(n)}</button>`).join('');
  const ai = A ? `<div class="k32-ai"><div class="k32-aih">${glimt(28, A.busy ? 'think' : 'done')}<span class="m-grow"><span class="k32-ail">GLIMT</span><span class="k32-aiq">«${esc(A.q)}»</span></span></div>
      ${A.busy ? '<span class="k32-mut">Leser kalenderen …</span>' : `<span class="k32-ait">${esc(A.txt)}</span>${A.items?.length ? `<div class="k32-ail2">${A.items.slice(0, 6).map(aiRow).join('')}</div>` : ''}`}</div>` : '';
  let body = '';
  if (!q0 && !A) {
    const today = d0(new Date()), nm = new Date().getHours() * 60 + new Date().getMinutes(), soon = [];
    for (let i = 0; i < 14 && soon.length < 4; i++) { const d = add(today, i); evOn(d).filter((e) => e.s && (i > 0 || mm(e.e) > nm) && (F === '*' || e.cal === F)).forEach((e) => { if (soon.length < 4) soon.push({ e, d }); }); }
    body = `<span class="k32-lab">SPØR GLIMT</span><div class="k32-list">${SUGG.map((t) => `<button type="button" data-k27="srask" data-v="${esc(t)}"><span class="k32-sp">✦</span><span class="m-grow">${esc(t)}</span><span class="k32-mut">↗</span></button>`).join('')}</div>
      ${soon.length ? `<span class="k32-lab">SNART</span><div class="k32-list k27-res">${soon.map((x) => srRow(x, '', true)).join('')}</div>` : ''}`;
  } else if (q.length >= 2) {
    const R = srHits(q, F), G = [];
    R.forEach((x) => { const k2 = key(x.d); let g = G.find((y) => y.k === k2); if (!g) G.push(g = { k: k2, d: x.d, i: x.i, rows: [] }); g.rows.push(x); });
    const fn = F === '*' ? '' : ` i ${calOf(F).name}`;
    body = R.length ? `<span class="k32-mut sm">${R.length}${R.length >= 60 ? '+' : ''} treff${esc(fn)}</span>${G.map((g) => `<div class="k32-g"><span class="k32-gh"><b>${esc(cap(dLong(g.d)))}</b><span>${esc(relOf(g.i))}</span></span><div class="k27-res">${g.rows.map((x) => srRow(x, q, false)).join('')}</div></div>`).join('')}`
      : (A ? '' : '<span class="k32-mut">Ingen treff de neste fire månedene. Trykk «✦ Spør» for å spørre Glimt.</span>');
  }
  return `<div class="k27-shbg k32-srbg" data-k27="shx"><div class="k27-sheet k32-sr" data-k27stop role="dialog" aria-label="Søk i kalenderen">
    <form class="k27-srow" data-k27f="ask"><div class="k27-sf p27-sf k32-sf${K.q ? ' has' : ''}"><span class="p27-ic" aria-hidden="true">${svgP('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.6-3.6', 18, 2.2)}</span><input id="k27-q" type="search" value="${esc(K.q)}" placeholder="Søk, eller spør Glimt …" autocomplete="off" enterkeyhint="search"><button type="button" class="p27-x" data-p27clr aria-label="Tøm søket"><span>${svgP('M6 6l12 12M18 6L6 18', 11, 3.2)}</span></button><button type="submit" class="k32-ask${q0 ? ' on' : ''}" aria-disabled="${!q0}">✦ Spør</button></div><button type="button" class="k27-cx" data-k27="shx" aria-label="Lukk">✕</button></form>
    <div class="k32-fl">${chips}</div>
    <div class="k32-body">${ai}${body}</div></div></div>`;
}
let srT = null;
/** Mens man skriver: tegn treffene på nytt (lokalt, ingen nettkall). */
function runSearch() {
  clearTimeout(srT);
  srT = setTimeout(() => {
    const el = document.querySelector('.k32-body'), ask = document.querySelector('.k32-ask');
    if (!el) { draw(); return; }
    const tmp = document.createElement('div'); tmp.innerHTML = searchSheet();
    const nb = tmp.querySelector('.k32-body'); if (nb) el.replaceWith(nb);
    if (ask) { const on = !!K.q.trim(); ask.classList.toggle('on', on); ask.setAttribute('aria-disabled', String(!on)); }
    document.querySelector('.k32-sf')?.classList.toggle('has', !!K.q);
  }, 120);
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
    ${detSheet()}${formSheet()}${searchSheet()}${qaSheet()}${learnSheet()}</div>`;
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
    if ((m.screen === 'kal' || m.screen === 'hl') && K.ev && !K.form && !K.srch && !K.qa && !(ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) draw();
  }, 60000);
  addEventListener('keydown', (e) => {
    if (e.target?.id === 'k32-ai' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); fillAi(); return; }
    if (m.screen !== 'kal' || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (K.form || K.srch || K.sel || K.qa) { if (e.key === 'Escape') { K.form = null; K.srch = false; K.sel = null; K.qa = null; draw(); } return; }
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
function openSearch() { K.srch = true; K.q = ''; K.res = null; K.ai = null; K.mini = false; draw(); setTimeout(() => document.getElementById('k27-q')?.focus({ preventScroll: true }), 30); }
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
  let sg = null;
  try {
    if (F.local || (K.miss && !F.id)) local();
    else if (F.id) sg = (await hlApi(`/kalender/events/${encodeURIComponent(F.id)}`, { method: 'PATCH', json: body }))?.suggestMemory ?? null;
    else await hlApi('/kalender/events', { method: 'POST', json: body });
  } catch (e) {
    if (e.status === 404 || e.status === 405) local();
    else if (e.status === 409) { F.busy = false; F.err = 'Google må kobles til på nytt med skrivetilgang (Innstillinger → Kalendere).'; draw(); return; }
    else { F.busy = false; F.err = e.message; draw(); return; }
  }
  K.form = null; K.cur = F.date; haptic('ok'); flash(F.id || F.uid ? 'Hendelsen er oppdatert ✓' : 'Hendelsen er lagret ✓');
  // Prompt 33: ny tittel på en rask time → foreslå å huske avsenderen (lagres bare med «Husk»).
  if (sg?.name) learnOpen(null, { name: sg.name, type: sg.type === 'annet' ? '' : sg.type, title: sg.title, text: sg.text, suggest: true });
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
  openForm(u ? { ...u, uid: u.id, local: true, id: null, endDate: u.endDate || '' } : { id: e.base ?? e.id, title: e.t, allDay: !e.s, date: e.k, start: e.s || '09:00', end: e.e || '10:00', location: e.rl ?? e.r, calendar: e.cal === 'familie' ? 'familie' : 'privat', repeat: raw.repeat ?? (e.rep && REPS.some(([k]) => k === e.rep) ? e.rep : 'none'), reminder: remOf(e), note: e.n });
}
async function copyEvent(e) {
  try { await hlApi(`/kalender/events/${encodeURIComponent(e.base ?? e.id)}/copy`, { method: 'POST', json: { calendar: 'privat' } }); K.sel = null; flash('Kopiert til Privat ✓'); await kalLoad(true).catch(() => {}); draw(); }
  catch (err) { if (err.status === 409) { flash('Google må kobles til på nytt med skrivetilgang'); return; } K.sel = null; openForm({ title: e.t, date: e.k, start: e.s || '09:00', end: e.e || '10:00', allDay: !e.s, location: e.rl ?? e.r, note: e.n, calendar: 'privat', local: err.status === 404 }); }
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
  if (t.id === 'k27-q') { K.q = t.value; if (K.ai && K.ai.q !== K.q.trim()) K.ai = null; runSearch(); return true; }
  if (t.id === 'k29-qt') { qaSet(t.value); return true; }
  if (t.dataset?.k33i && K.learn) { K.learn[t.dataset.k33i] = t.value; return true; }
  const f = t.dataset?.k27i;
  if (f && K.form) {
    if (f === 'start') { const d = mm(K.form.end) - mm(K.form.start); K.form.start = t.value; if (t.value && d > 0) K.form.end = hm(Math.min(mm(t.value) + d, 23 * 60 + 59)); const en = document.querySelector('[data-k27i="end"]'); if (en) en.value = K.form.end; }
    else K.form[f] = t.value;
    if (f === 'ai') { const on = !!t.value.trim(), b = document.querySelector('.k32-fill'); if (b && !K.form.aiS?.busy) { b.disabled = !on; b.classList.toggle('on', on); } if (K.form.aiS?.done || K.form.aiS?.err) K.form.aiS = {}; }
    return true;
  }
  return false;
}
export async function kalBind(e, t) {
  if (m.screen !== 'kal') return false;
  if (e.type === 'submit') {
    if (!t.matches?.('[data-k27f]')) return false; e.preventDefault();
    if (t.dataset.k27f === 'learn') { await learnSave(); return true; }
    if (t.dataset.k27f === 'ask') { document.activeElement?.blur?.(); await srAsk(); return true; }
    if (t.dataset.k27f === 'qa') { const v = (K.qa?.txt ?? '').trim(); if (!v) return true; K.qa = null; document.activeElement?.blur?.(); draw(); P29.quickRun(v); return true; }
    await saveForm(); return true;
  }
  if (e.type !== 'click') return false;
  if (Date.now() - K.swiped < 350) { K.swiped = 0; e.preventDefault(); e.stopPropagation(); return true; }
  if (t.closest?.('[data-p27clr]') && t.closest('.k27-sf')) { K.q = ''; K.res = null; K.ai = null; const i = document.getElementById('k27-q'); if (i) { i.value = ''; i.focus(); i.parentElement.classList.remove('has'); } draw(); return true; }
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
    // Prompt 30 (claude-code-kalender-dag-klikk.md): i Dag, 3 dager og Uke beholdes visningen og den hopper til datoen; fra Måned eller Liste → Dag.
    case 'mday': K.cur = x.dataset.k; K.mini = false; K.miniOff = 0; K.sel = null; navigator.vibrate?.(8); if (view() === 'maaned' || view() === 'liste') { setView('dag'); return true; } break;
    case 'dday': K.cur = x.dataset.k; K.sel = null; setView('dag'); return true;
    case 'wk': K.cur = x.dataset.k; K.sel = null; K.mini = false; K.miniOff = 0; setView('uke'); return true; // Prompt 29: ukenummer → Uke
    case 'cal': { const id = x.dataset.id; L.hidCal = { ...hidCal(), [id]: !hidCal()[id] }; keep(); saveFilters(); haptic('tab'); break; }
    case 'cset': location.hash = '#/set/kal'; return true;
    case 'prev': shift(-1); return true;
    case 'next': shift(1); return true;
    case 'today': K.cur = null; K.sel = null; K.mini = false; K.gk = ''; haptic('tap'); break;
    case 'search': openSearch(); return true;
    case 'srf': K.srF = x.dataset.v; haptic('tab'); break;
    case 'srask': await srAsk(x.dataset.v); return true;
    case 'fai': await fillAi(); return true;
    case 'view': setView(x.dataset.v); return true;
    case 'new': qaOpen(''); return true; // Prompt 29: + åpner «Legg til time»
    case 'qchip': qaSet(`Time hos ${x.dataset.v.toLowerCase()} `); document.getElementById('k29-qt')?.focus(); return true;
    case 'qpaste': { try { const v = await navigator.clipboard.readText(); if (v) qaSet(v); else flash('Utklippstavlen er tom'); } catch { flash('Fikk ikke lese utklippstavlen. Lim inn med hold inne.'); document.getElementById('k29-qt')?.focus(); } return true; }
    case 'qman': { const v = (K.qa?.txt ?? '').trim(), r = v ? parseQuick(v, key(new Date())) : null; K.qa = null; openForm(r ? { title: r.title || '', ...(r.date ? { date: r.date } : {}), ...(r.start ? { start: r.start, end: r.end } : {}), location: r.place || '', reminder: '1h', note: v.length > 60 ? v : '' } : {}); return true; }
    case 'none': return true;
    case 'ev': {
      const id = x.dataset.id, ev = EVMAP.get(id);
      if (x.dataset.go && ev) { K.srch = false; K.cur = ev.k; if (view() === 'maaned' || view() === 'liste') save({ kalView: 'dag' }, { view: 'dag' }); }
      K.sel = id; K.delArm = false; haptic('tap');
      // Prompt 33: «sist viste hendelse» for Glimt («det var frisør»).
      if (ev?.editable && !ev.local) hlApi(`/kalender/events/${encodeURIComponent(ev.base ?? ev.id)}`).catch(() => {});
      break;
    }
    case 'shx': K.sel = null; K.form = null; K.srch = false; K.qa = null; K.delArm = false; K.learn = null; break;
    case 'learn': { const ev = EVMAP.get(K.sel); if (ev) learnOpen(ev); setTimeout(() => document.getElementById('k33-name')?.focus({ preventScroll: true }), 40); return true; }
    case 'lx': K.learn = null; break;
    case 'ltype': if (K.learn) { K.learn.type = x.dataset.v; K.learn.err = ''; haptic('tab'); } break;
    case 'lapply': await learnApply(); return true;
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
export function kalLeave() { K.ai = null; K.learn = null; K.qa = null; K.sel = null; K.form = null; K.srch = false; K.mini = false; K.cur = null; K.gk = ''; }
