// Prompt 26 (PWA): Kalender med skoletimeplan under Mer → Kalender (#/kal), og Hjem-widgeten KALENDER (h10).
// Fasit: design/Kalender.dc.html, variant="mobile" (hideTitle, toppbildet har tittelen) og mode="widget".
// Data: GET /api/kalender?from=&to= (skolens iCal, Canvas, Bursdager og Google). Valgene lagres per bruker i
// /api/me/layout (kalOrder, kalHidden, kalFilters, kalView, kalReminders, subjectColors). Mangler endepunktet (404),
// vises bursdagene fra Bursdager og en merknad om at skolekalenderen krever nyere server.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { BD, bdLoad } from './mobile-p24.js';

const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], MS = MN.map((x) => x.slice(0, 3));
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'], WS = ['MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN'];
const LAB = 'var(--pp-lab)';
// Filtrene (Timeplan · Prøver og frister · Bursdager · Skole) og hvilke typer de dekker.
const CH = [['time', 'Timeplan', 'var(--pp-ink)'], ['prove', 'Prøver og frister', LAB], ['bursdag', 'Bursdager', '#2b5d8a'], ['skole', 'Skole', '#a8661a']];
const GRP = { time: 'time', prove: 'prove', innl: 'prove', bursdag: 'bursdag', skole: 'skole', fri: 'skole' };
const KCOL = { bursdag: '#2b5d8a', skole: '#a8661a', fri: '#a8661a' };
// Kortene på siden (kan flyttes og skjules): Nå-kort, Prøver og frister, Kalendere-lenken, Kalenderen og Widgets.
const CARDS = [['now', 'Nå-kort'], ['exams', 'Prøver og frister'], ['calendars', 'Kalendere'], ['calendar', 'Kalender'], ['widgets', 'Widgets']];
const C0 = CARDS.map(([k]) => k);
const VIEWS = [['uke', 'Uke'], ['maaned', 'Måned'], ['agenda', 'Agenda']];
const REMS = [['none', 'Ingen'], ['15m', '15 min før'], ['1h', '1 time før'], ['day', 'Dagen før']];

const LS = 'fh_kal';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };

export const K = { ev: null, subjects: {}, from: null, to: null, err: '', miss: false, t: 0, busy: false, off: 0, sel: null, day: null, ro: false, lp: null, lpFired: false, sw: null, swiped: 0 };

/* ---------- Datoer ---------- */
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const d0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mm = (s) => { const [a, b] = String(s).split(':'); return +a * 60 + +b; };
const ofKey = (k) => new Date(`${k}T12:00`);
const isoW = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); };
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const dLong = (d) => `${WD[d.getDay()]} ${d.getDate()}. ${MN[d.getMonth()]}`;
const dur = (x) => (x >= 60 ? `${Math.floor(x / 60)} t ${x % 60} min` : `${x} min`);
// Tid i et ISO-felt: datoen (lokal) og klokkeslett. Rene datoer («2026-10-30») tolkes lokalt.
function when(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { k: s, hm: '' };
  const d = new Date(s);
  if (Number.isNaN(+d)) return null;
  return { k: key(d), hm: `${pad(d.getHours())}:${pad(d.getMinutes())}`, d };
}

/* ---------- Valg (lokal kopi + /api/me/layout) ---------- */
const view = () => (VIEWS.some(([k]) => k === L.view) ? L.view : 'uke');
const hidF = () => L.hidF ?? {};
const order = () => { const o = (L.ord ?? []).filter((k) => C0.includes(k)); return [...o, ...C0.filter((k) => !o.includes(k))]; };
const hidC = () => (L.hidC ?? []).filter((k) => C0.includes(k));
const rems = () => L.rem ?? {};
const subjCol = () => L.subj ?? {};
function save(patch, local) {
  Object.assign(L, local); keep();
  hlApi('/me/layout', { method: 'PUT', json: patch }).catch(() => {});
}
// Serveren bruker A–E for kortene og {timeplan, prover, bursdager, skole} for filtrene.
const AE = { now: 'A', exams: 'B', calendars: 'C', calendar: 'D', widgets: 'E' }, EA = Object.fromEntries(Object.entries(AE).map(([a, b]) => [b, a]));
const FK = { time: 'timeplan', prove: 'prover', bursdag: 'bursdager', skole: 'skole' };
const toAE = (l) => l.map((k) => AE[k]).filter(Boolean), ofAE = (l) => l.map((k) => EA[k] ?? k).filter((k) => C0.includes(k));
const saveFilters = () => save({ kalFilters: Object.fromEntries(CH.map(([k]) => [FK[k], !hidF()[k]])) }, {});
/** Fra GET /api/me/layout. kalFilters kan være {type: synlig} eller en liste over synlige typer. */
export function takeKal(r) {
  if (!r) return;
  if (Array.isArray(r.kalOrder)) L.ord = ofAE(r.kalOrder);
  if (Array.isArray(r.kalHidden)) L.hidC = ofAE(r.kalHidden); else if (r.kalHidden && typeof r.kalHidden === 'object') L.hidC = ofAE(Object.keys(r.kalHidden).filter((k) => r.kalHidden[k]));
  if (VIEWS.some(([k]) => k === r.kalView)) L.view = r.kalView;
  if (Array.isArray(r.kalFilters)) L.hidF = Object.fromEntries(CH.map(([k]) => [k, r.kalFilters.includes(FK[k])])); // liste = skjulte
  else if (r.kalFilters && typeof r.kalFilters === 'object') L.hidF = Object.fromEntries(CH.map(([k]) => [k, (r.kalFilters[FK[k]] ?? r.kalFilters[k]) === false]));
  if (r.kalReminders && typeof r.kalReminders === 'object') L.rem = r.kalReminders;
  if (r.subjectColors && typeof r.subjectColors === 'object') L.subj = r.subjectColors;
  keep();
}

/* ---------- Data ---------- */
const TYPES = ['time', 'prove', 'innl', 'bursdag', 'skole', 'fri'];
function norm(x) {
  const a = when(x.start), b = when(x.end) ?? a;
  if (!a) return [];
  const kind = TYPES.includes(x.type) ? x.type : 'skole', all = !!x.allDay || !a.hm;
  const base = { id: String(x.id ?? `${a.k}|${x.title}`), t: x.title ?? x.subject ?? '', short: x.short || '', subj: x.subject ?? '', r: x.room ?? '', teacher: x.teacher ?? '', n: x.note ?? '', kind, color: x.color ?? null, url: x.url ?? null, maze: x.mazemap ?? null, src: x.source ?? '' };
  if (!all) return [{ ...base, k: a.k, s: kind === 'innl' && a.hm === b?.hm ? '' : a.hm, e: b?.hm || a.hm }];
  // Heldagshendelser over flere dager (slutt er eksklusiv i iCal) legges på hver dag.
  const out = [], end = b && b.k > a.k ? ofKey(b.k) : add(ofKey(a.k), 1);
  for (let d = ofKey(a.k), i = 0; d < end && i < 62; d = add(d, 1), i++) out.push({ ...base, id: i ? `${base.id}|${i}` : base.id, cont: i > 0, k: key(d), s: '', e: '' });
  return out;
}
// Reserve uten /api/kalender: bursdagene fra Bursdager (samme felles data som Bursdager-siden).
function bdEvents(from, to) {
  const out = [], items = BD.d?.items ?? [];
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    for (const p of items) {
      const k = `${y}-${pad(+p.month)}-${pad(+p.day)}`;
      if (k >= from && k <= to) out.push({ id: `bd|${p.id}|${y}`, k, s: '', e: '', t: `${p.name} har bursdag`, short: p.name, subj: '', r: '', teacher: '', n: p.year ? `Fyller ${y - p.year}` : '', kind: 'bursdag', color: null, src: 'birthdays' });
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
    K.ev = (r?.events ?? []).flatMap(norm); K.subjects = r?.subjects ?? {}; K.sources = r?.sources ?? []; K.miss = false; K.err = '';
  } catch (e) {
    if (e.status === 404) { K.miss = true; await bdLoad().catch(() => {}); K.ev = bdEvents(from, to); K.err = ''; }
    else { K.err = e.message; K.ev ??= []; }
  }
  K.from = from; K.to = to; K.t = Date.now(); K.busy = false;
}
const ensure = (a, b) => { if (K.ev && (a < K.from || b > K.to) && !K.busy) kalLoad(true, a, b).then(draw).catch(() => {}); };

const col = (e) => (e.kind === 'prove' || e.kind === 'innl' ? LAB : e.kind === 'time' ? subjCol()[e.subj] ?? e.color ?? K.subjects[e.subj] ?? '#5c5850' : e.color ?? KCOL[e.kind] ?? '#a8661a');
const short = (e) => (e.kind === 'time' ? e.short || e.subj || e.t : e.t);
const tmOf = (e) => (e.kind === 'innl' ? `Frist ${e.e || '23:59'}` : e.s ? `${e.s}–${e.e}` : 'Hele dagen');
/** Hendelsene en dag: planleggingsdag/fri fjerner timene, og en prøve erstatter timen den overlapper. Filtrert og sortert. */
function evOn(d) {
  const k = typeof d === 'string' ? d : key(d), all = (K.ev ?? []).filter((e) => e.k === k);
  const fri = all.some((e) => e.kind === 'fri' && !e.s);
  const ex = all.filter((e) => e.kind === 'prove' && e.s);
  const L0 = all.filter((e) => e.kind !== 'time' || (!fri && !ex.some((x) => mm(e.e) > mm(x.s) && mm(e.s) < mm(x.e))));
  return L0.filter((e) => !hidF()[GRP[e.kind]]).sort((a, b) => (a.s ? mm(a.s) : -1) - (b.s ? mm(b.s) : -1));
}
const lesson = (e) => e.s && (e.kind === 'time' || e.kind === 'prove');
const sub2 = (e) => [e.r, e.kind === 'time' ? e.teacher : e.n].filter(Boolean).join(' · ');

/* ---------- Beregninger (Nå-kort, prøver og widget) ---------- */
function exams() {
  const tk = key(new Date()), t = d0(new Date());
  return (K.ev ?? []).filter((e) => (e.kind === 'prove' || e.kind === 'innl') && !e.cont && e.k >= tk && !hidF().prove)
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : (a.s || '').localeCompare(b.s || '')))
    .map((e) => { const dd = Math.round((d0(ofKey(e.k)) - t) / 864e5); return { e, dd, in: dd === 0 ? 'I dag' : dd === 1 ? 'I morgen' : `${dd} dager`, soon: dd <= 7 }; });
}
function nowCard() {
  const now = new Date(), today = d0(now), nm = now.getHours() * 60 + now.getMinutes();
  const tl = evOn(today).filter(lesson), cur = tl.find((e) => nm >= mm(e.s) && nm < mm(e.e)), nx = tl.find((e) => mm(e.s) > nm);
  let v;
  if (cur) v = { k: 'NÅ', when: `${cur.s}–${cur.e}`, t: cur.t, sub: `${[cur.r, cur.teacher].filter(Boolean).join(' · ')}${cur.r || cur.teacher ? ' · ' : ''}${mm(cur.e) - nm} min igjen`, c: col(cur), pct: Math.round(((nm - mm(cur.s)) / (mm(cur.e) - mm(cur.s))) * 100), e: cur, next: nx ? `Deretter: ${nx.t} ${nx.s}${nx.r ? ` · ${nx.r}` : ''}` : 'Siste time i dag' };
  else if (nx) v = { k: 'NESTE TIME', when: `om ${dur(mm(nx.s) - nm)}`, t: nx.t, sub: `${nx.s}–${nx.e}${nx.r ? ` · ${nx.r}` : ''}`, c: col(nx), e: nx, next: '' };
  else {
    let d = add(today, 1), f = null;
    for (let i = 0; i < 14 && !f; i++) { f = evOn(d).find(lesson); if (!f) d = add(d, 1); }
    v = f ? { k: 'NESTE SKOLEDAG', when: dLong(d), t: f.t, sub: `${f.s}–${f.e}${f.r ? ` · ${f.r}` : ''} · første time`, c: col(f), e: f, next: '' } : { k: 'FRI', when: '', t: 'Ingen timer', sub: K.miss ? 'Skolekalenderen krever nyere server' : 'Legg inn skolens iCal under Kalendere', c: '#7a7468', e: null, next: '' };
  }
  const ne = exams()[0];
  if (ne) v.next = `${v.next ? `${v.next} · ` : ''}${ne.e.t} ${ne.dd === 0 ? 'i dag' : ne.dd === 1 ? 'i morgen' : `om ${ne.dd} dager`}`;
  return v;
}
/** Widget-data (samme regler som WidgetKit/Glance): neste time, dagens timer og de to neste prøvene. */
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
    dayT: `${isT ? 'I dag · ' : ''}${dS} ${wd.getDate()}. ${MS[wd.getMonth()]}`, dayL: `${isT ? 'I dag · ' : ''}${dS} ${wd.getDate()}. ${MN[wd.getMonth()]}`, cnt: `${wl.length} timer`,
    n3: (n3.length ? n3 : wl.slice(0, 3)).map((e) => ({ s: e.s, t: short(e), r: e.r, c: col(e) })),
    all: wl.slice(0, 5).map((e) => ({ tm: `${e.s}–${e.e}`, t: e.t, r: [e.r, e.teacher].filter(Boolean).join(' · '), c: col(e), op: isT && mm(e.e) <= nm ? '.45' : '1' })),
    ex: ex.map((x) => ({ t: x.e.t, in: x.in, soon: x.soon })),
  };
}

/* ---------- Tegning ---------- */
const sel = () => (K.sel ? (K.ev ?? []).find((e) => e.id === K.sel) ?? null : null);
const go = (e, extra = '') => `data-k26="ev" data-id="${esc(e.id)}"${extra}`;
const item = (e, i) => `<button class="k26-it" ${go(e)}${i ? '' : ' style="border-top:0"'}><span class="k26-tm">${esc(tmOf(e))}</span><span class="k26-st" style="background:${col(e)}"></span><span class="m-grow k26-tt"><b>${esc(e.t)}</b><span>${esc(sub2(e))}</span></span>${e.kind === 'prove' || e.kind === 'innl' ? `<span class="k26-tag" style="background:${col(e)}">${e.kind === 'prove' ? 'PRØVE' : 'FRIST'}</span>` : ''}</button>`;

function cardNow() {
  const v = nowCard();
  return `<button class="k26-now" ${v.e ? go(v.e) : 'data-k26="none"'}><span class="k26-nk"><span class="k">${esc(v.k)}</span><span class="w">${esc(v.when)}</span></span>
    <span class="k26-nm"><span class="k26-ns" style="background:${v.c}"></span><span class="m-grow" style="min-width:0"><b>${esc(v.t)}</b><span>${esc(v.sub)}</span></span></span>
    ${v.pct != null ? `<span class="k26-bar"><i style="width:${v.pct}%"></i></span>` : ''}${v.next ? `<span class="k26-nx">${esc(v.next)}</span>` : ''}</button>`;
}
function cardExams() {
  const X = exams();
  const rows = X.map((x, i) => { const d = ofKey(x.e.k); return `<button class="k26-ex" ${go(x.e, ' data-ag="1"')}${i ? '' : ' style="border-top:0"'}><span class="k26-exd"><b>${d.getDate()}</b><span>${MS[d.getMonth()].toUpperCase()}</span></span>
    <span class="m-grow k26-tt"><b>${esc(x.e.t)}</b><span>${esc(`${cap(WD[d.getDay()])} · ${x.e.kind === 'innl' ? `frist ${x.e.e || '23:59'}` : x.e.s ? `${x.e.s}–${x.e.e}` : 'hele dagen'}${x.e.r ? ` · ${x.e.r}` : ''}`)}</span></span>
    <span class="k26-in${x.soon ? ' soon' : ''}">${esc(x.in)}</span></button>`; }).join('');
  return `<div class="k26-col6"><span class="k26-lab"><span>PRØVER OG FRISTER</span><span class="mut">${X.length}</span></span>
    <div class="k26-list">${rows || '<div class="k26-none">Ingen kommende prøver eller frister.</div>'}</div></div>`;
}
const cardCals = () => '<button class="k26-link" data-k26="cals"><span class="m-grow" style="min-width:0"><b>Kalendere</b><span>Skolens iCal · Google Kalender · Bursdager</span></span><span class="k26-lk">Innstillinger ›</span></button>';

function weekView(nav) {
  const now = new Date(), today = d0(now), tk = key(today), nm = now.getHours() * 60 + now.getMinutes();
  let b = today; const wd = b.getDay();
  if (K.off === 0 && (wd === 6 || wd === 0)) b = add(b, wd === 6 ? 2 : 1);
  const ws = add(add(b, -((b.getDay() + 6) % 7)), K.off * 7), fri = add(ws, 4);
  ensure(key(ws), key(add(ws, 6)));
  nav.t = `Uke ${isoW(ws)}`; nav.s = `${ws.getDate()}.${ws.getMonth() !== fri.getMonth() ? ` ${MS[ws.getMonth()]}` : ''}–${fri.getDate()}. ${MN[fri.getMonth()]} ${fri.getFullYear()}`; nav.today = K.off === 0;
  const H = 48, S0 = 8 * 60, S1 = 16 * 60, HH = ((S1 - S0) / 60) * H, hours = [];
  for (let h = 8; h <= 16; h++) hours.push([pad(h), ((h * 60 - S0) / 60) * H]);
  const days = [0, 1, 2, 3, 4].map((i) => {
    const d = add(ws, i), k = key(d), L0 = evOn(d), out = (e) => e.s && e.kind !== 'innl' && (mm(e.e) <= S0 || mm(e.s) >= S1);
    return { i, d, k, isT: k === tk, all: L0.filter((e) => !e.s || e.kind === 'innl' || out(e)).map((e) => ({ e, t: e.kind === 'innl' ? `⚑ ${e.t}` : out(e) ? `${e.s} ${e.t}` : e.t })), ev: L0.filter((e) => e.s && e.kind !== 'innl' && !out(e)) };
  });
  const S = sel(), hasAll = days.some((x) => x.all.length);
  const head = `<div class="k26-wg"><span></span>${days.map((x) => `<button class="k26-wd" data-k26="wday" data-k="${x.k}"><span>${WS[x.i]}</span><b class="${x.isT ? 'on' : ''}">${x.d.getDate()}</b></button>`).join('')}</div>`;
  const allRow = hasAll ? `<div class="k26-wg"><span class="k26-hele">HELE</span>${days.map((x) => `<div class="k26-wa">${x.all.map(({ e, t }) => `<button ${go(e)} style="background:${col(e)}">${esc(t)}</button>`).join('')}</div>`).join('')}</div>` : '';
  const lines = hours.map(([, top]) => `<span class="k26-hl" style="top:${top}px"></span>`).join('');
  const grid = `<div class="k26-wg"><div class="k26-hrs" style="height:${HH}px">${hours.map(([t, top]) => `<span style="top:${top}px">${t}</span>`).join('')}</div>
    ${days.map((x) => `<div class="k26-day${x.isT ? ' on' : ''}" style="height:${HH}px">${lines}${x.ev.map((e) => { const a = Math.max(S0, mm(e.s)), bb = Math.min(S1, mm(e.e)), pr = e.kind === 'prove', c = col(e);
      return `<button class="k26-blk${pr ? ' pr' : ''}" ${go(e)} style="top:${((a - S0) / 60) * H}px;height:${Math.max(22, ((bb - a) / 60) * H - 2)}px;border-left-color:${c};background:${pr ? c : `color-mix(in oklab,${c} 15%,var(--pp-card))`}${S?.id === e.id ? ';outline:2px solid var(--pp-ink);outline-offset:1px' : ''}"><b>${esc(short(e))}</b><span>${esc(pr ? `${e.r ? `${e.r} · ` : ''}PRØVE` : e.r)}</span></button>`; }).join('')}
      ${x.isT && nm >= S0 && nm <= S1 ? `<span class="k26-nowl" style="top:${((nm - S0) / 60) * H}px"><i></i></span>` : ''}</div>`).join('')}</div>`;
  return `<div class="k26-wk" data-k26sw>${head}${allRow}${grid}</div>`;
}
function monthView(nav) {
  const today = d0(new Date()), tk = key(today), m0 = new Date(today.getFullYear(), today.getMonth() + K.off, 1), last = new Date(m0.getFullYear(), m0.getMonth() + 1, 0);
  nav.t = `${cap(MN[m0.getMonth()])} ${m0.getFullYear()}`; nav.s = `Uke ${isoW(m0)}–${isoW(last)}`;
  const st = add(m0, -((m0.getDay() + 6) % 7));
  ensure(key(st), key(add(st, 41)));
  const selK = K.day && K.day.slice(0, 7) === key(m0).slice(0, 7) ? K.day : K.off === 0 ? tk : key(m0);
  nav.today = K.off === 0 && selK === tk;
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = add(st, i), k = key(d), inM = d.getMonth() === m0.getMonth(), L0 = evOn(d), isT = k === tk, sl = k === selK, wkd = d.getDay() % 6 !== 0;
    const cs = [...new Set(L0.filter((e) => e.kind !== 'time').map(col))].slice(0, 3);
    if (L0.some((e) => e.kind === 'time') && cs.length < 3) cs.push('var(--pp-line)');
    return `<button class="k26-mc${sl ? ' sel' : ''}${inM ? '' : ' out'}" data-k26="mday" data-k="${k}"><b class="${isT ? 'on' : wkd ? '' : 'we'}">${d.getDate()}</b><span>${cs.map((c) => `<i style="background:${c}"></i>`).join('')}</span></button>`;
  }).join('');
  const sd = ofKey(selK), list = evOn(selK);
  return `<div class="k26-mo" data-k26sw><div class="k26-mg">${WS.map((t) => `<span class="k26-mh">${t}</span>`).join('')}${cells}</div></div>
    <div class="k26-col6"><span class="k26-lab"><span>${esc(`${selK === tk ? 'I DAG · ' : ''}${dLong(sd).toUpperCase()}`)}</span></span><div class="k26-list">${list.map(item).join('') || '<div class="k26-none">Ingenting denne dagen.</div>'}</div></div>`;
}
function agendaView(nav) {
  const today = d0(new Date()), tk = key(today), tm = key(add(today, 1)), a0 = add(today, K.off * 7), a1 = add(a0, 20);
  nav.t = `${a0.getDate()}. ${MS[a0.getMonth()]} – ${a1.getDate()}. ${MS[a1.getMonth()]}`; nav.s = 'Tre uker fremover'; nav.today = K.off === 0;
  ensure(key(a0), key(a1));
  const G = [];
  for (let i = 0; i < 21; i++) { const d = add(a0, i), k = key(d), L0 = evOn(d); if (L0.length) G.push({ k, d, L0 }); }
  return `<div class="k26-ag">${G.map((g) => `<div class="k26-col6"><span class="k26-lab${g.k === tk ? '' : ' ink'}"><span>${esc(`${g.k === tk ? 'I DAG · ' : g.k === tm ? 'I MORGEN · ' : ''}${dLong(g.d).toUpperCase()}`)}</span><span class="mut">${g.L0.length}</span></span><div class="k26-list">${g.L0.map(item).join('')}</div></div>`).join('') || '<div class="k26-list"><div class="k26-none">Ingenting de neste tre ukene.</div></div>'}</div>`;
}
const remOf = (e) => rems()[e.id] ?? (e.kind === 'prove' || e.kind === 'innl' ? 'day' : 'none');
function detail() {
  const e = sel();
  if (!e) return '';
  const c = col(e), sd = ofKey(e.k), K2 = { time: 'TIME', prove: 'PRØVE', innl: 'INNLEVERING', bursdag: 'BURSDAG', skole: 'SKOLE', fri: 'SKOLE' }[e.kind];
  const rows = [e.r ? ['Rom', e.r] : null, e.teacher ? ['Lærer', e.teacher] : null, e.kind !== 'time' && e.subj ? ['Fag', e.subj] : null, e.n ? ['Merknad', e.n] : null].filter(Boolean);
  const map = e.maze || (e.r && e.kind !== 'bursdag' && !/canvas/i.test(e.r) ? `https://use.mazemap.com/#search=${encodeURIComponent(e.r)}` : null), r = remOf(e);
  return `<div class="k26-det" style="border-color:${c}"><div class="k26-dh"><span class="k26-ns" style="background:${c}"></span><div class="m-grow" style="min-width:0"><span class="k26-dk" style="color:${c}">${K2}</span><b>${esc(e.t)}</b><span class="mut">${esc(`${cap(dLong(sd))} · ${tmOf(e)}`)}</span></div><button class="k26-x" data-k26="close" aria-label="Lukk">×</button></div>
    ${rows.map(([a, b]) => `<div class="k26-dr"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}
    <span class="k26-pl">Påminnelse</span><div class="k26-chips">${REMS.map(([v, n]) => `<button class="k26-rem${r === v ? ' on' : ''}" data-k26="rem" data-v="${v}" aria-pressed="${r === v}">${n}</button>`).join('')}</div>
    ${e.url ? `<a class="k26-maze" href="${esc(e.url)}" target="_blank" rel="noopener">Åpne i ${e.src === 'canvas' ? 'Canvas' : 'kalenderen'} ↗</a>` : ''}${map ? `<a class="k26-maze" href="${esc(map)}" target="_blank" rel="noopener">Finn rommet i MazeMap ↗</a>` : ''}</div>`;
}
function cardCal() {
  const V = view(), nav = { t: '', s: '', today: true };
  const body = V === 'uke' ? weekView(nav) : V === 'maaned' ? monthView(nav) : agendaView(nav);
  return `<div class="k26-col12"><div class="k26-seg" role="tablist">${VIEWS.map(([k, n]) => `<button role="tab" data-k26="view" data-v="${k}" aria-selected="${V === k}">${n}</button>`).join('')}</div>
    <div class="k26-nav"><button class="k26-ar" data-k26="prev" aria-label="Forrige">‹</button><div class="k26-nt"><b>${esc(nav.t)}</b><span>${esc(nav.s)}</span></div><button class="k26-ar" data-k26="next" aria-label="Neste">›</button><button class="k26-td${nav.today ? '' : ' off'}" data-k26="today">I dag</button></div>
    <div class="k26-chips sc">${CH.map(([k, n, c]) => `<button class="k26-fc${hidF()[k] ? ' off' : ''}" data-k26="flt" data-k="${k}" aria-pressed="${!hidF()[k]}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>
    ${detail()}${K.ev === null ? '<div class="m-spin"></div>' : body}
    ${K.err ? `<span class="k26-note" style="color:var(--pp-lab)">${esc(K.err)}</span>` : ''}
    <span class="k26-note">${K.miss ? 'Skolens timeplan krever nyere server. Bursdagene hentes fra Bursdager.' : 'Timeplanen hentes fra skolens iCal-lenke og oppdateres hver time. Trykk på en time for rom, lærer og påminnelse.'}</span></div>`;
}
// Forhåndsvisning av widgetene (iPhone WidgetKit, Android Material You og Samsung One UI) i tre størrelser.
const PLATS = [
  ['iPhone · WidgetKit', 'k26-ios', ['158px', '158px'], ['338px', '158px'], ['338px', '354px'], ['Liten', 'Medium', 'Stor']],
  ['Android · Material You', 'k26-and', ['170px', '170px'], ['350px', '170px'], ['350px', '350px'], ['2 × 2', '4 × 2', '4 × 4']],
  ['Samsung One UI', 'k26-sam', ['134px', '155px'], ['296px', '155px'], ['296px', '330px'], ['2 × 2', '4 × 2', '4 × 4']],
];
function cardWidgets() {
  const w = widgetData(), pill = (x) => `<span class="k26-wp${x.soon ? ' soon' : ''}">${esc(x.in)}</span>`;
  return `<div class="k26-col10"><span class="k26-lab" style="padding-top:6px"><span>WIDGETS PÅ TELEFONEN</span></span>
    ${PLATS.map(([n, cls, s, md, lg, lb]) => `<div class="k26-pl26"><span class="k26-pn">${n}</span><div class="k26-pw">
      <div class="k26-wv"><div class="k26-w ${cls} sm" style="width:${s[0]};height:${s[1]}"><span class="ka">${esc(w.k)}</span><b class="kb">${esc(w.big)}</b><span class="k26-ws"><span class="st" style="background:${w.c};height:32px"></span><span class="tt"><b>${esc(w.t)}</b><span>${esc(w.r)}</span></span></span><span class="ka kw">${esc(w.when)}</span></div><span class="k26-wl">${lb[0]}</span></div>
      <div class="k26-wv"><div class="k26-w ${cls} md" style="width:${md[0]};height:${md[1]}"><div class="l"><span class="ka">${esc(w.k)}</span><b class="kb">${esc(w.big)}</b><b class="t1">${esc(w.t)}</b><span class="mu">${esc(w.r)}</span><span class="ka kw">${esc(w.when)}</span></div><div class="r"><span class="dt">${esc(w.dayT)}</span>${w.n3.map((e) => `<span class="k26-wr"><span class="s">${esc(e.s)}</span><span class="st" style="background:${e.c};height:24px"></span><span class="tt"><b>${esc(e.t)}</b><span>${esc(e.r)}</span></span></span>`).join('')}</div></div><span class="k26-wl">${lb[1]}</span></div>
      <div class="k26-wv"><div class="k26-w ${cls} lg" style="width:${lg[0]};height:${lg[1]}"><span class="k26-wh"><b>${esc(w.dayL)}</b><span class="ka">${esc(w.cnt)}</span></span>${w.all.map((e) => `<span class="k26-wr big" style="opacity:${e.op}"><span class="s">${esc(e.tm)}</span><span class="st" style="background:${e.c};height:28px"></span><span class="tt"><b>${esc(e.t)}</b><span>${esc(e.r)}</span></span></span>`).join('')}<span class="hr"></span><span class="ka">PRØVER OG FRISTER</span>${w.ex.map((x) => `<span class="k26-wx"><b>${esc(x.t)}</b>${pill(x)}</span>`).join('')}</div><span class="k26-wl">${lb[2]}</span></div>
    </div></div>`).join('')}
    <span class="k26-note">Liten viser neste time, medium også de tre neste, og stor hele dagen og de neste prøvene. Trykk åpner Kalender.</span></div>`;
}
const BODY = { now: cardNow, exams: cardExams, calendars: cardCals, calendar: cardCal, widgets: cardWidgets };

/** Mer → Kalender. */
export function kalView() {
  if (!K.ev && !K.busy) kalLoad().then(draw).catch(() => {});
  const ord = order(), hc = hidC(), vis = ord.filter((k) => !hc.includes(k)), N = Object.fromEntries(CARDS);
  const pill = K.ro ? `<div class="k26-pill"><span class="m-grow">Flytt med ▲ ▼ · skjul med −</span><button data-k26="reset">Tilbakestill</button><button class="done" data-k26="done">Ferdig</button></div>
    ${hc.length ? `<div class="k26-hid"><span>SKJULT</span>${hc.map((k) => `<button data-k26="show" data-k="${k}">+ ${N[k]}</button>`).join('')}</div>` : ''}` : '';
  const cards = vis.map((k, i) => `<div class="k26-c${K.ro ? ' ro' : ''}" data-kc="${k}">${K.ro ? `<div class="k26-roc"><button data-k26="mv" data-k="${k}" data-d="-1" aria-label="Flytt opp" style="opacity:${i ? 1 : 0.35}">▲</button><button data-k26="mv" data-k="${k}" data-d="1" aria-label="Flytt ned" style="opacity:${i < vis.length - 1 ? 1 : 0.35}">▼</button><button class="hd" data-k26="hide" data-k="${k}" aria-label="Skjul kortet">−</button></div>` : ''}${BODY[k]()}</div>`).join('');
  return `<div class="k26">${pill}<div class="k26-cards">${cards}</div></div>`;
}
/** Hjem-widgeten KALENDER (mode="widget"). */
export function kalWidget() {
  if (!K.ev) { if (!K.busy) kalLoad().then(draw).catch(() => {}); return `<a class="k26-hw" href="#/kal"><span class="k26-hwh"><span class="k">KALENDER</span><span class="mut">›</span></span><span class="mut" style="font-size:13px">Henter timeplanen …</span></a>`; }
  const w = widgetData(), ex = w.ex[0];
  return `<a class="k26-hw" href="#/kal" aria-label="Åpne Kalender"><span class="k26-hwh"><span class="k">KALENDER · ${esc(w.k)}</span><span class="mut">${esc(w.dayT)} ›</span></span>
    <span class="k26-hwm"><span class="k26-ns" style="background:${w.c};width:5px;height:44px;align-self:auto"></span><span class="m-grow k26-hwt"><b>${esc(w.t)}</b><span>${esc(w.r)}</span></span><span class="k26-hwb"><b>${esc(w.big)}</b><span>${esc(w.when)}</span></span></span>
    ${w.n3.length ? `<span class="k26-hwn">${w.n3.map((e) => `<span style="border-left-color:${e.c}"><b class="s">${esc(e.s)}</b><b>${esc(e.t)}</b></span>`).join('')}</span>` : ''}
    ${ex ? `<span class="k26-hwx"><span class="k">NESTE PRØVE</span><b class="m-grow">${esc(ex.t)}</b><span class="k26-wp${ex.soon ? ' soon' : ''}">${esc(ex.in)}</span></span>` : ''}</a>`;
}

/* ---------- Påminnelser (lokale varsler mens appen er åpen) ---------- */
const OFF = { '15m': 15, '1h': 60, day: 1440 };
const FIRED = 'fh_kal_fired';
function checkReminders() {
  if (!K.ev) return;
  let fired = {}; try { fired = JSON.parse(localStorage.getItem(FIRED) || '{}') || {}; } catch {}
  const now = Date.now();
  for (const e of K.ev) {
    const r = remOf(e), off = OFF[r];
    if (!off || e.kind === 'bursdag') continue;
    const at = e.s ? new Date(`${e.k}T${e.s}`).getTime() - off * 60000 : new Date(`${e.k}T18:00`).getTime() - 1440 * 60000;
    if (now < at || now - at > 5 * 60000 || fired[e.id]) continue;
    fired[e.id] = now;
    const body = `${e.t} · ${tmOf(e)}${e.r ? ` · ${e.r}` : ''}`;
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(r === 'day' ? 'I morgen' : `Om ${r === '1h' ? '1 time' : '15 min'}`, { body, icon: '/assets/finans/icons/icon-192.png', tag: `kal-${e.id}` }); else flash(`Påminnelse: ${body}`); } catch { flash(`Påminnelse: ${body}`); }
  }
  for (const k of Object.keys(fired)) if (now - fired[k] > 3 * 864e5) delete fired[k];
  try { localStorage.setItem(FIRED, JSON.stringify(fired)); } catch {}
}
let tick = null;
export function kalBoot() {
  if (tick) return;
  // Nå-kortet, nå-linja og widgeten oppdateres hvert minutt; data hentes på nytt hver time.
  tick = setInterval(() => {
    if (document.hidden || document.documentElement.dataset.ui !== 'mobile') return;
    checkReminders();
    if (Date.now() - K.t > 3600e3 && K.ev) kalLoad(true).then(draw).catch(() => {});
    const ae = document.activeElement;
    if ((m.screen === 'kal' || m.screen === 'hl') && K.ev && !K.ro && !(ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) draw();
  }, 60000);
}

/* ---------- Hold inne (rediger), sveip (uke/måned) og klikk ---------- */
export function kalDown(e) {
  K.lpFired = false;
  if (m.screen !== 'kal' || (e.button ?? 0) > 0) return;
  const sw = e.target.closest?.('[data-k26sw]');
  K.sw = sw && e.clientX > 30 ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
  const c = e.target.closest?.('[data-kc]');
  if (!c || K.ro || e.target.closest('input,select,a,.k26-roc')) return;
  K.lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { K.lp = null; K.lpFired = true; K.ro = true; K.sel = null; K.sw = null; haptic('ok'); navigator.vibrate?.(18); draw(); }, 550) };
}
export function kalMove(e) {
  if (K.lp && (Math.abs(e.clientX - K.lp.x) > 8 || Math.abs(e.clientY - K.lp.y) > 8)) { clearTimeout(K.lp.t); K.lp = null; }
}
export function kalUp(e) {
  if (K.lp) { clearTimeout(K.lp.t); K.lp = null; }
  const s = K.sw; K.sw = null;
  if (!s || e.type !== 'pointerup' || K.ro) return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) { K.off += dx < 0 ? 1 : -1; K.sel = null; K.swiped = Date.now(); haptic('tab'); draw(); }
}
const setView = (v) => { save({ kalView: v }, { view: v }); };
export async function kalBind(e, t) {
  if (e.type !== 'click' || m.screen !== 'kal') return false;
  if (K.lpFired || Date.now() - K.swiped < 350) { K.lpFired = false; K.swiped = 0; e.preventDefault(); e.stopPropagation(); return true; }
  const x = t.closest?.('[data-k26]');
  // I rediger-modus er trykk på innholdet sperret (bare ▲ ▼ −, Tilbakestill, Ferdig og + skjult kort virker).
  if (K.ro && t.closest?.('[data-kc]') && !t.closest('.k26-roc')) { e.preventDefault(); return true; }
  if (!x) return false;
  e.preventDefault();
  const a = x.dataset.k26, ord = order(), hc = hidC();
  switch (a) {
    case 'ev': {
      const id = x.dataset.id; K.sel = K.sel === id ? null : id; haptic('tap');
      if (x.dataset.ag && K.sel) { K.off = 0; if (view() !== 'agenda') setView('agenda'); }
      draw(); if (K.sel) setTimeout(() => document.querySelector('.k26-det')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 40);
      return true;
    }
    case 'close': K.sel = null; draw(); return true;
    case 'view': if (x.dataset.v !== view()) { setView(x.dataset.v); K.off = 0; K.sel = null; haptic('tab'); } draw(); return true;
    case 'prev': K.off--; K.sel = null; draw(); return true;
    case 'next': K.off++; K.sel = null; draw(); return true;
    case 'today': K.off = 0; K.day = null; K.sel = null; draw(); return true;
    case 'flt': { const k = x.dataset.k; L.hidF = { ...hidF(), [k]: !hidF()[k] }; keep(); saveFilters(); haptic('tab'); draw(); return true; }
    case 'wday': { const d = ofKey(x.dataset.k), t0 = new Date(); K.day = x.dataset.k; K.off = (d.getFullYear() - t0.getFullYear()) * 12 + d.getMonth() - t0.getMonth(); K.sel = null; setView('maaned'); draw(); return true; }
    case 'mday': K.day = x.dataset.k; K.sel = null; draw(); return true;
    case 'rem': { const e2 = sel(); if (!e2) return true; const v = { ...rems(), [e2.id]: x.dataset.v }; save({ kalReminders: v }, { rem: v }); haptic('tab'); if (x.dataset.v !== 'none' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); draw(); return true; }
    case 'cals': location.hash = '#/set/kal'; return true;
    case 'done': K.ro = false; haptic('ok'); draw(); return true;
    case 'reset': save({ kalOrder: toAE(C0), kalHidden: [] }, { ord: [...C0], hidC: [] }); haptic('tap'); draw(); return true;
    case 'mv': { const vis = ord.filter((k) => !hc.includes(k)), i = vis.indexOf(x.dataset.k), j = i + +x.dataset.d; if (i < 0 || j < 0 || j >= vis.length) return true; [vis[i], vis[j]] = [vis[j], vis[i]]; const o = [...vis, ...hc]; save({ kalOrder: toAE(o) }, { ord: o }); navigator.vibrate?.(8); draw(); return true; }
    case 'hide': { if (ord.filter((k) => !hc.includes(k)).length <= 1) { flash('Minst ett kort må være synlig'); return true; } const h = [...hc, x.dataset.k]; save({ kalHidden: toAE(h) }, { hidC: h }); haptic('tap'); draw(); return true; }
    case 'show': { const h = hc.filter((k) => k !== x.dataset.k); save({ kalHidden: toAE(h) }, { hidC: h }); haptic('tap'); draw(); return true; }
    default: return true;
  }
}
/** Ny side: avbryt rediger-modus og detaljkortet. */
export function kalLeave() { K.ro = false; K.sel = null; K.off = 0; K.day = null; }
