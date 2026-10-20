// Prompt 39 (PWA39): sveip bort Brief og Bibelvers myk og uten hint (felles motor etter design/swipe-dismiss.js: transform
// direkte i DOM i requestAnimationFrame, ingen tegning midt i gesten, fart-basert slipp, fjær tilbake, målt høyde-kollaps),
// redigeringsark som ikke flyter (fast i bunnen, bakteppe over alt, siden og vuggingen står stille), Yr mot Storm 2a med
// wiggle-redigering (hold 480 ms, dra etter 170 ms, FLIP), «Glimt · ukas vær» nederst i Vær, og «✦ På nytt» på kvitteringer
// med fremdrift (steg, prosent, Avbryt, gul markering av felt som endret seg).
// Fasit: design_handoff_homelab/prompts/prompt-39-pakke/design/ (Mobil Papir App, Bibelvers, Yr mot Storm Design 2a, Vaer).
// API (kontrakt 39, SERVER39): GET /api/weather/week-summary, POST /finans/api/receipts/:id/reanalyze → {jobId} + fremdrift
// {step, pct, msg} på sanntidskanalen. Alt tåler 404 (eldre server): lokal reserve.
import { S, esc, api, hlApi, loadReceipts } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
// Resten hentes lat (dynamisk import), så denne modulen ikke endrer rekkefølgen modulene evalueres i (TDZ i sykliske importer).
let P35 = null, P36 = null, P37B = null, P17 = null, PAP3 = null, WX22 = null;
Promise.all([import('./mobile-p35.js'), import('./mobile-p36.js'), import('./mobile-p37b.js'), import('./mobile-p17.js'), import('./mobile-paper3.js'), import('./mobile-wx22.js')])
  .then(([a, b, c, d, e, f]) => { P35 = a; P36 = b; P37B = c; P17 = d; PAP3 = e; WX22 = f; }).catch(() => {});
const CMPo = () => P17?.CMP ?? { open: false, d: {} };
const edOn = (pg) => PAP3?.edOn?.(pg) ?? false;
const normCmp = (r) => WX22?.normCmp?.(r) ?? null;

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const f1 = (x) => (x == null || !Number.isFinite(+x) ? '–' : String(Math.round(+x * 10) / 10).replace('.', ','));
const deg = (v) => (v == null || !Number.isFinite(+v) ? '–' : `${Math.round(+v)}°`);
const sg = (x) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${f1(Math.abs(x))}`;
const WD3 = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'], WDL = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/* =====================================================================
   0. Ingen tegning midt i en gest (sveip, dra). draw() spør holdDraw() først.
   ===================================================================== */
const H = { n: 0, pend: false };
export function holdDraw() { if (!H.n) return false; H.pend = true; return true; }
const hold = () => { H.n++; };
const release = (redraw = true) => { H.n = Math.max(0, H.n - 1); if (!H.n && H.pend) { H.pend = false; if (redraw) draw(); } };

/* =====================================================================
   1. Sveip bort (Brief-kortet og Bibelvers-kortet på Hjem)
   ===================================================================== */
const SWC = [
  { card: '[data-p36bsc]', wrap: '[data-p36bs]', ok: () => !edOn('hl'), commit: () => P36?.briefCommit() },
  { card: '[data-p37bvc]', wrap: '[data-p37bv]', ok: () => !edOn('hl'), commit: () => P37B?.bibleCommit() },
];
const SW = { g: null, busy: false, mv: 0 };
const TH = 0.38;
function lbl(g, w) { for (const [k, sel] of [['i', '[data-sw-idle]'], ['a', '[data-sw-armed]'], ['d', '[data-sw-done]']]) { const el = g.rev?.querySelector(sel); if (el) el.style.opacity = k === w ? '1' : '0'; } }
function paint(g) {
  g.raf = 0;
  const p = Math.min(1, Math.max(0, g.dx) / (g.W * TH));
  g.card.style.transform = `translate3d(${g.dx.toFixed(1)}px,0,0) rotate(${((g.dx / g.W) * 4).toFixed(2)}deg)`;
  if (g.rev) g.rev.style.opacity = g.dx > 2 ? String(Math.min(1, 0.35 + p * 0.65)) : '0';
  if (g.ic) g.ic.style.transform = `scale(${(g.armed ? 1.15 : 0.7 + p * 0.3).toFixed(3)})`;
}
function arm(g, a) {
  if (a === g.armed) return;
  g.armed = a; if (a) vib(10);
  if (g.rev) g.rev.style.background = a ? '#2f7a4f' : '#1b1a17';
  lbl(g, a ? 'a' : 'i');
}
function swDown(e) {
  if (SW.busy || SW.g || (e.pointerType === 'mouse' && e.button !== 0)) return;
  for (const c of SWC) {
    const card = e.target.closest?.(`#app ${c.card}`); if (!card) continue;
    const wrap = card.closest(c.wrap); if (!wrap || (c.ok && !c.ok())) return;
    card.getAnimations?.().forEach((a) => { if (a.id === 'sw') a.cancel(); });
    const rev = wrap.querySelector('[data-sw-rev]');
    SW.g = { c, card, wrap, rev, ic: rev?.querySelector('[data-sw-ic]'), x0: e.clientX, y0: e.clientY, lock: null, cap: false, pid: e.pointerId, W: card.offsetWidth || 360, hist: [[e.timeStamp, 0]], dx: 0, armed: false, raf: 0 };
    return;
  }
}
function swMove(e) {
  const g = SW.g; if (!g || e.pointerId !== g.pid) return;
  const ddx = e.clientX - g.x0, ddy = e.clientY - g.y0;
  if (g.lock == null && (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)) g.lock = Math.abs(ddx) > Math.abs(ddy) * 1.15 && ddx > 0 ? 'x' : 'y';
  if (g.lock === 'y') { SW.g = null; return; }
  if (g.lock !== 'x') return;
  if (!g.cap) {
    g.cap = true; hold();
    try { g.card.setPointerCapture(g.pid); } catch {}
    g.card.style.transition = 'none'; g.card.style.animation = 'none'; g.card.style.willChange = 'transform'; g.card.style.backfaceVisibility = 'hidden';
    if (g.rev) { g.rev.style.transition = 'background .18s ease'; g.rev.style.background = '#1b1a17'; }
    lbl(g, 'i');
  }
  if (e.cancelable) e.preventDefault();
  SW.mv = Date.now();
  g.dx = ddx >= 0 ? ddx : -Math.pow(-ddx, 0.7);
  g.hist.push([e.timeStamp, g.dx]); while (g.hist.length > 2 && e.timeStamp - g.hist[0][0] > 90) g.hist.shift();
  arm(g, g.dx >= g.W * TH);
  if (!g.raf) g.raf = requestAnimationFrame(() => paint(g));
}
function swUp(e) {
  const g = SW.g; if (!g || e.pointerId !== g.pid) return;
  // Når kortet tar fangsten, mister det opprinnelige målet den (lostpointercapture) – det er ikke slutten på gesten.
  if (e.type === 'lostpointercapture' && e.target !== g.card) return;
  SW.g = null;
  if (g.raf) { cancelAnimationFrame(g.raf); paint(g); }
  if (g.lock !== 'x' || !g.cap) return;
  SW.mv = Date.now();
  const a = g.hist[0], b = g.hist[g.hist.length - 1], v = b && a && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
  if (e.type !== 'pointercancel' && e.type !== 'lostpointercapture' && (g.dx >= g.W * TH || (v > 0.55 && g.dx > 36))) commit(g, v); else settle(g);
}
function settle(g) {
  const from = g.card.style.transform || 'none';
  g.card.style.transform = 'translate3d(0,0,0)';
  const an = g.card.animate?.([{ transform: from }, { transform: 'translate3d(0,0,0)' }], { duration: reduce() ? 1 : 420, easing: 'cubic-bezier(.22,1.28,.36,1)', id: 'sw' });
  if (g.rev) { const op = g.rev.style.opacity || '0'; g.rev.style.opacity = '0'; g.rev.animate?.([{ opacity: op }, { opacity: 0 }], { duration: 220, easing: 'ease-out' }); }
  arm(g, false); g.dx = 0;
  const done = () => { g.card.style.transform = ''; release(); };
  if (an) an.onfinish = an.oncancel = done; else done();
}
function commit(g, v) {
  SW.busy = true; arm(g, true); lbl(g, 'd'); vib([8, 30, 12]); haptic('ok');
  const from = g.card.style.transform, end = g.W * 1.18, dist = Math.max(40, end - g.dx), dur = reduce() ? 120 : Math.max(170, Math.min(320, dist / Math.max(1.1, v)));
  if (g.rev) g.rev.style.opacity = '1';
  g.card.style.transform = `translate3d(${end}px,0,0) rotate(6deg)`;
  const fin = () => {
    // Kollaps med målt høyde (h px → 0) og negativ marg for gapet, så listen under glir opp uten hopp.
    const t = g.wrap.closest('.pp-ed') ?? g.wrap, h = t.offsetHeight, gp = t.parentElement, gap = gp ? parseFloat(getComputedStyle(gp).rowGap) || 0 : 0;
    t.style.overflow = 'hidden';
    const col = t.animate?.([{ height: `${h}px`, marginBottom: '0px', opacity: 1 }, { height: '0px', marginBottom: `${-gap}px`, opacity: 0 }], { duration: reduce() ? 1 : 300, easing: 'cubic-bezier(.3,0,.15,1)', fill: 'forwards' });
    const end2 = () => { SW.busy = false; H.n = Math.max(0, H.n - 1); H.pend = false; g.c.commit(); };
    if (col) col.onfinish = end2; else end2();
  };
  const fly = g.card.animate?.([{ transform: from }, { transform: g.card.style.transform }], { duration: dur, easing: 'cubic-bezier(.2,.6,.3,1)', id: 'sw' });
  const go = () => setTimeout(fin, reduce() ? 0 : 260);
  if (fly) fly.onfinish = go; else go();
}
// Klikk som kommer < 350 ms etter et drag blokkeres (åpner ikke kortet ved et uhell).
function swClick(e) { if (Date.now() - SW.mv < 350 && e.target.closest?.(SWC.map((c) => c.wrap).join(','))) { e.preventDefault(); e.stopPropagation(); } }

/* =====================================================================
   2. Redigeringsark: fast i bunnen, bakteppe over alt, siden låst og vuggingen pauset
   ===================================================================== */
const SHEETS = '.pp-sheet, .p37-sheet, .p28-sheet, .p35-sh';
function sheetState() {
  const on = m.screen === 'hl' && !!document.querySelector(`#app ${SHEETS}`);
  const r = document.documentElement;
  if (on === r.classList.contains('p39-sh')) return;
  r.classList.toggle('p39-sh', on);
}

/* =====================================================================
   3. Yr mot Storm (2a): himmel + glasskort, duell-topp, enighet, Glimt forklarer, dag for dag – med wiggle-redigering
   ===================================================================== */
const BLK = [['hero', 'Dagens duell'], ['agree', 'Enighet'], ['glimt', 'Glimt forklarer'], ['list', 'Dag for dag'], ['chart', 'Neste 24 timer'], ['rain', 'Nedbør per dag']];
const LAY0 = { ord: BLK.map(([k]) => k), hid: { chart: true, rain: true } };
export const CM = { ed: false, tab: 't', open: 0, st: 0, lay: null };
function cmLay() {
  if (!CM.lay) { const v = lsGet('vs_cmp_layout'); CM.lay = v && Array.isArray(v.ord) ? v : LAY0; }
  const keys = BLK.map(([k]) => k), ord = [...CM.lay.ord.filter((k) => keys.includes(k)), ...keys.filter((k) => !CM.lay.ord.includes(k))];
  return { ord, hid: { ...(CM.lay.hid ?? {}) } };
}
function cmSave(lay) {
  CM.lay = lay; lsSet('vs_cmp_layout', lay);
  hlApi('/me/layout', { method: 'PUT', json: { vs_cmp_layout: lay } }).catch(() => {});
}
/** Lagret oppsett fra kontoen (GET /api/me/layout). */
export function take39(r) { const v = r?.vs_cmp_layout; if (v && Array.isArray(v.ord)) { CM.lay = v; lsSet('vs_cmp_layout', v); } }
const wet = (v) => (v ?? 0) > 0.5;
function cmData(place) {
  const { WX } = WXM ?? {};
  const raw = WX?.d?.[place]?.compare ?? CMPo().d[place];
  const C = normCmp(raw); if (!C || !C.days.length) return null;
  const W = WX?.d?.[place]?.days ?? [], rawD = Array.isArray(raw?.days) ? raw.days : [];
  const D = C.days.slice(0, 7).map((d, i) => {
    const r = rawD[i] ?? {}, w = W.find((x) => String(x.date).slice(0, 10) === d.date);
    const sW = r.ecmwf?.wind ?? r.storm?.wind ?? r.pent?.wind ?? null, yW = r.yr?.wind ?? w?.windMax ?? null;
    const x = { d: i === 0 ? 'I dag' : WD3[new Date(`${d.date}T12:00`).getDay()], yH: d.yr?.max, yL: d.yr?.min, sH: d.pent?.max, sL: d.pent?.min, yP: d.yr?.precip ?? 0, sP: d.pent?.precip ?? 0, yW, sW };
    x.dT = x.yH != null && x.sH != null ? x.yH - x.sH : 0; x.ok = Math.abs(x.dT) < 2 && wet(x.yP) === wet(x.sP);
    return x;
  });
  return { C, D, wind: D.some((x) => x.yW != null && x.sW != null) };
}
let WXM = null;
import('./mobile-wx.js').then((x) => { WXM = x; }).catch(() => {});
function cmBlocks(place, X) {
  const { C, D, wind } = X, t0 = D[0];
  const nOk = D.filter((x) => x.ok).length, worst = D.slice().sort((a, b) => (Math.abs(b.dT) + Math.abs(b.yP - b.sP)) - (Math.abs(a.dT) + Math.abs(a.yP - a.sP)))[0];
  const ws = (v) => (v == null ? '' : ` · ${Math.round(v)} m/s`);
  const dd = t0.sH != null && t0.yH != null ? t0.sH - t0.yH : null;
  const hero = `<div class="p39-g p39-duel"><div class="p39-dy"><span class="p39-dk yr"><i>yr</i>YR</span><b>${deg(t0.yH)}</b><span>${f1(t0.yP)} mm${ws(t0.yW)}</span></div>
    <div class="p39-dm"><span></span><em>${dd == null ? '–' : Math.round(dd) === 0 ? '±0°' : `${dd > 0 ? '+' : '−'}${Math.abs(Math.round(dd))}°`}</em></div>
    <div class="p39-dy r"><span class="p39-dk st">STORM<i>S</i></span><b>${deg(t0.sH)}</b><span>${f1(t0.sP)} mm${ws(t0.sW)}</span></div></div>`;
  const agree = `<div class="p39-g p39-ag"><span class="p39-agh"><b>${nOk} av ${D.length}</b><span>dager der de er enige</span></span>
    <div class="p39-dots">${D.map((x) => `<span><i class="${x.ok ? 'ok' : 'no'}">${x.ok ? '✓' : '≠'}</i><small>${x.d === 'I dag' ? 'I D' : x.d.slice(0, 1).toUpperCase()}</small></span>`).join('')}</div></div>`;
  const wetTxt = (p, h) => (wet(p) ? `regn (${f1(p)} mm) og ${deg(h)}` : `opphold og ${deg(h)}`);
  const gl = nOk === D.length ? `Yr og Storm er enige hele uka. Snittavviket i makstemperatur er ${f1(C.avgDiff)}°, så du kan stole på varselet.`
    : `Størst uenighet er ${worst.d.toLowerCase()}. Yr venter ${wetTxt(worst.yP, worst.yH)}, Storm venter ${wetTxt(worst.sP, worst.sH)}.${wet(worst.yP) || wet(worst.sP) ? ' Ta med paraply for sikkerhets skyld.' : ''}`;
  const glimt = `<div class="p39-g p39-gl"><span class="p39-ring"><span>✦</span></span><span>${esc(gl)}</span></div>`;
  const M = { t: ['Temp', (x) => [deg(x.yH), deg(x.sH), x.dT, 4, '°']], p: ['Nedbør', (x) => [f1(x.yP), f1(x.sP), x.yP - x.sP, 4, ' mm']], ...(wind ? { w: ['Vind', (x) => [`${Math.round(x.yW)} m/s`, `${Math.round(x.sW)} m/s`, x.yW - x.sW, 4, ' m/s']] } : {}) };
  const T = M[CM.tab] ? CM.tab : 't';
  const rows = D.map((x, i) => {
    const [y, s, df, sc, u] = M[T][1](x), w = Math.min(1, Math.abs(df) / sc) * 50, yr = df > 0, op = CM.open === i;
    const st = x.ok ? 'Enige' : wet(x.yP) !== wet(x.sP) && Math.abs(x.dT) >= 2 ? 'Uenige om regn og temperatur' : wet(x.yP) !== wet(x.sP) ? 'Uenige om regn' : 'Uenige om temperatur';
    const dft = Math.abs(df) < 0.05 || (u === '°' && Math.round(Math.abs(df)) === 0) ? '' : `${df > 0 ? '+' : '−'}${u === '°' ? Math.abs(Math.round(df)) : f1(Math.abs(df))}${u}`;
    return `<div class="p39-lr"><button type="button" class="p39-lb" data-p39="cmrow" data-i="${i}" aria-expanded="${op}"><b>${esc(x.d)}</b><span class="n">${esc(y)}</span><span class="p39-bar"><i></i><em></em><s style="left:${yr ? 50 - w : 50}%;width:${Math.max(w, df ? 1.5 : 0)}%;background:${yr ? '#7fd6f5' : '#ffb27a'}"></s><u style="color:${!dft ? 'transparent' : yr ? '#9fe3ff' : '#ffc79e'}">${dft}</u></span><span class="n l">${esc(s)}</span><span class="p39-chv" style="transform:rotate(${op ? 90 : 0}deg)">›</span></button>
      ${op ? `<div class="p39-lx"><span style="color:${x.ok ? '#8ff0b0' : '#ffb3a6'}">${st}</span><div><span class="yr"><small>YR</small><b>${deg(x.yH)} / ${deg(x.yL)}</b><span>${f1(x.yP)} mm${ws(x.yW)}</span></span><span class="st"><small>STORM</small><b>${deg(x.sH)} / ${deg(x.sL)}</b><span>${f1(x.sP)} mm${ws(x.sW)}</span></span></div></div>` : ''}</div>`;
  }).join('');
  const list = `<div class="p39-g p39-tabs">${Object.entries(M).map(([k, [n]]) => `<button type="button" data-p39="cmtab" data-k="${k}" aria-pressed="${T === k}">${n}</button>`).join('')}</div>
    <div class="p39-g p39-list"><div class="p39-lh"><span></span><span class="yr">YR</span><span class="mid"><span>← Yr</span><span>Storm →</span></span><span class="st">STORM</span><span></span></div>${rows}</div>`;
  // Neste 24 timer: uenighetsbånd mellom linjene.
  const hrs = C.hours.filter((h) => h.yr != null && h.pent != null).slice(0, 24);
  let chart = '';
  if (hrs.length > 1) {
    const all = hrs.flatMap((h) => [h.yr, h.pent]), lo = Math.floor(Math.min(...all)) - 1, hi = Math.ceil(Math.max(...all)) + 1, n = hrs.length - 1;
    const X0 = (k) => 24 + k * (296 / n), Y = (v) => 8 + (1 - (v - lo) / Math.max(1, hi - lo)) * 112;
    const py = hrs.map((h, k) => [X0(k), Y(h.yr)]), ps = hrs.map((h, k) => [X0(k), Y(h.pent)]);
    const line = (P) => P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const band = `${line(py)} ${ps.slice().reverse().map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} Z`;
    const grid = []; for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) grid.push(`<line x1="24" x2="320" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="rgba(255,255,255,.08)"/><text x="0" y="${(Y(v) + 3).toFixed(1)}" fill="rgba(255,255,255,.55)" font-size="9" font-weight="700">${v}°</text>`);
    const hx = hrs.map((h, k) => (k % 4 ? '' : `<text x="${X0(k).toFixed(1)}" y="137" fill="rgba(255,255,255,.55)" font-size="9" font-weight="700" text-anchor="middle">${String(new Date(h.t).getHours()).padStart(2, '0')}</text>`)).join('');
    chart = `<div class="p39-g p39-ch"><div class="p39-chh"><span>NESTE 24 TIMER</span><span><i style="background:#7fd6f5"></i>Yr<i style="background:#ffb27a"></i>Storm<i class="b"></i>Avvik</span></div>
      <svg viewBox="0 0 320 140" aria-label="Temperatur neste 24 timer, Yr og Storm">${grid.join('')}<path d="${band}" fill="rgba(255,255,255,.16)"/><path d="${line(py)}" fill="none" stroke="#7fd6f5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${line(ps)}" fill="none" stroke="#ffb27a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${py[0][0].toFixed(1)}" cy="${py[0][1].toFixed(1)}" r="4" fill="#fff"/>${hx}</svg></div>`;
  } else chart = '<div class="p39-g p39-ch"><span class="p39-chh"><span>NESTE 24 TIMER</span></span><span style="opacity:.75;font-size:13px">Timeverdier mangler for dette stedet.</span></div>';
  const pMax = Math.max(0.1, ...D.map((x) => Math.max(x.yP, x.sP)));
  const rain = `<div class="p39-g p39-rn"><span class="p39-chh"><span>NEDBØR · MM PER DAG</span></span><div class="p39-rg">${D.map((x) => `<div><span><i style="height:${Math.max(2, (x.yP / pMax) * 64)}px;background:#7fd6f5"></i><i style="height:${Math.max(2, (x.sP / pMax) * 64)}px;background:#ffb27a"></i></span><small>${x.d === 'I dag' ? 'I d' : x.d.slice(0, 2)}</small></div>`).join('')}</div></div>`;
  return { hero, agree, glimt, list, chart, rain };
}
export function cmpView39(place, placeName) {
  if (!CMPo().open) return '';
  const X = cmData(place), lay = cmLay(), ed = CM.ed, N = Object.fromEntries(BLK);
  let body = '';
  if (!X) body = `<div class="p39-g" style="padding:16px">${esc(CMPo().busy ? 'Henter Storm-data …' : CMPo().err || 'Henter …')}</div>`;
  else {
    const B = cmBlocks(place, X), vis = lay.ord.filter((k) => !lay.hid[k]);
    body = vis.map((k, i) => `<div class="p39-blk${ed ? ` p39-wig${i % 2 ? ' odd' : ''}` : ''}" data-blk="${k}">${ed ? `<button type="button" class="p39-rm" data-p39="cmhide" data-k="${k}" aria-label="Skjul ${esc(N[k])}">−</button>` : ''}<div class="p39-bi">${B[k]}</div></div>`).join('');
    const hid = lay.ord.filter((k) => lay.hid[k]);
    if (ed && hid.length) body += `<div class="p39-add"><span>LEGG TIL KORT</span>${hid.map((k) => `<button type="button" data-p39="cmshow" data-k="${k}"><i>+</i><span>${esc(N[k])}</span></button>`).join('')}</div>`;
  }
  const raw = WXM?.WX?.d?.[place]?.compare ?? CMPo().d[place], up = raw?.updatedAt ? new Date(raw.updatedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="p39-cmp" role="dialog" aria-label="Yr mot Storm"><div class="p39-cmsc" id="p39-cmsc"><div class="p39-cmin">
    <div class="p39-cmh"><span><b>Yr mot Storm</b><span>${esc(placeName ?? '')}${up ? ` · oppdatert ${up}` : ''}</span></span><button type="button" class="p39-done${ed ? ' on' : ''}" data-p39="cmdone">Ferdig</button></div>
    ${ed ? '<span class="p39-edh">Dra kortene for å flytte · − for å skjule</span>' : ''}
    <div class="p39-blks" id="p39-blks">${body}</div>
    <span class="p39-src">Yr: MET Norway. Storm: ECMWF via Open-Meteo (Storm har ikke åpent API).</span></div></div></div>`;
}
// Wiggle: hold inne 480 ms → redigering. I redigering: hold 170 ms og dra (transform i rAF), naboene glir med FLIP.
const CD = { lp: null, lpFired: 0, dt: null, d: null, px: 0, py: 0, y2: null, raf: 0, as: 0 };
function cmDown(e) {
  if (!CMPo().open) return;
  const el = e.target.closest?.('.p39-cmp [data-blk]'); if (!el || e.target.closest('[data-p39="cmhide"]')) return;
  CD.px = e.clientX; CD.py = e.clientY; CD.y2 = null;
  if (!CM.ed) {
    if (e.target.closest('button, a') && !e.target.closest('.p39-lb')) return;
    clearTimeout(CD.lp);
    CD.lp = setTimeout(() => { CD.lp = null; CD.lpFired = Date.now(); vib(12); haptic('ok'); CM.ed = true; draw(); }, 480);
    return;
  }
  const pid = e.pointerId, k = el.dataset.blk;
  clearTimeout(CD.dt);
  CD.dt = setTimeout(() => {
    CD.dt = null; const n = document.querySelector(`.p39-cmp [data-blk="${k}"]`); if (!n) return;
    try { n.setPointerCapture(pid); } catch {}
    hold();
    CD.d = { k, el: n, y0: CD.py, y: CD.y2 ?? CD.py, pid };
    n.classList.add('p39-lift'); vib(6); cmPaint();
  }, 170);
}
function cmPaint() { const D = CD.d; if (!D) return; D.el.style.transform = `translate3d(0,${(D.y - D.y0).toFixed(1)}px,0) scale(1.03)`; }
function cmMove(e) {
  if (!CMPo().open) return false;
  CD.y2 = e.clientY;
  if ((CD.lp || CD.dt) && (Math.abs(e.clientX - CD.px) > 8 || Math.abs(e.clientY - CD.py) > 8)) { clearTimeout(CD.lp); CD.lp = null; clearTimeout(CD.dt); CD.dt = null; }
  const D = CD.d; if (!D || e.pointerId !== D.pid) return false;
  if (e.cancelable) e.preventDefault();
  D.y = e.clientY;
  const sc = document.getElementById('p39-cmsc');
  if (sc) { const r = sc.getBoundingClientRect(); CD.as = e.clientY < r.top + 80 ? -9 : e.clientY > r.bottom - 80 ? 9 : 0; if (CD.as && !CD.asRaf) CD.asRaf = requestAnimationFrame(cmAuto); }
  if (!CD.raf) CD.raf = requestAnimationFrame(cmStep);
  return true;
}
function cmAuto() {
  CD.asRaf = 0; const D = CD.d, sc = document.getElementById('p39-cmsc'); if (!D || !CD.as || !sc) return;
  const before = sc.scrollTop; sc.scrollTop += CD.as; D.y0 -= sc.scrollTop - before; cmPaint();
  CD.asRaf = requestAnimationFrame(cmAuto);
}
function cmStep() {
  CD.raf = 0; const D = CD.d; if (!D) return;
  cmPaint();
  const box = document.getElementById('p39-blks'); if (!box) return;
  const els = [...box.querySelectorAll(':scope > [data-blk]')], i = els.indexOf(D.el), r = D.el.getBoundingClientRect(), cy = r.top + r.height / 2;
  let j = i;
  if (i > 0) { const p = els[i - 1].getBoundingClientRect(); if (cy < p.top + p.height / 2) j = i - 1; }
  if (j === i && i < els.length - 1) { const n = els[i + 1].getBoundingClientRect(); if (cy > n.top + n.height / 2) j = i + 1; }
  if (j === i) return;
  // FLIP: mål før, flytt i DOM, animer de andre fra gammel til ny plass. Det dratte kortet justeres med samme forskyvning.
  const F = new Map(els.map((x) => [x, x.getBoundingClientRect().top]));
  const other = els[j];
  if (j < i) box.insertBefore(D.el, other); else box.insertBefore(D.el, other.nextSibling);
  for (const x of box.querySelectorAll(':scope > [data-blk]')) {
    const dy = F.get(x) - x.getBoundingClientRect().top; if (!dy) continue;
    if (x === D.el) { D.y0 -= dy; continue; }
    x.animate?.([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  cmPaint(); vib(5);
}
function cmUp(e) {
  if (e?.type === 'lostpointercapture' && (!CD.d || e.target !== CD.d.el)) return false;
  if (CD.lp) { clearTimeout(CD.lp); CD.lp = null; }
  clearTimeout(CD.dt); CD.dt = null; CD.as = 0;
  const D = CD.d; if (!D || (e && e.pointerId !== D.pid)) return false;
  CD.d = null;
  const el = D.el, from = el.style.transform;
  el.style.transform = ''; el.classList.remove('p39-lift');
  const an = el.animate?.([{ transform: from }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
  const box = document.getElementById('p39-blks'), lay = cmLay();
  const vis = box ? [...box.querySelectorAll(':scope > [data-blk]')].map((x) => x.dataset.blk) : lay.ord.filter((k) => !lay.hid[k]);
  cmSave({ ord: [...vis, ...lay.ord.filter((k) => !vis.includes(k))], hid: lay.hid });
  haptic('ok');
  const done = () => release();
  if (an) an.onfinish = an.oncancel = done; else done();
  return true;
}
function cmScroll(e) { if (e.target?.id === 'p39-cmsc') CM.st = e.target.scrollTop; }

/* =====================================================================
   4. Glimt · ukas vær (nederst i Vær): personligheter + sammenligning med forrige uke
   ===================================================================== */
const PS = [['sky', 'Sky', 'Sky · den rolige'], ['ugle', 'Ugle', 'Ugle · tallknuseren'], ['spire', 'Spire', 'Spire · ut og lek']];
export const WK = { d: {}, busy: {}, miss: false, per: (() => { try { return localStorage.getItem('vaer_glimt_p') || 'sky'; } catch { return 'sky'; } })() };
async function wkLoad(place) {
  const k = `${place}|${WK.per}`;
  if (WK.miss || WK.busy[k] || (WK.d[k] && Date.now() - WK.d[k].t < 3 * 3600e3)) return;
  WK.busy[k] = true;
  try {
    const q = WXM?.placeQuery ? WXM.placeQuery(place) : `place=${encodeURIComponent(place)}`;
    const r = await hlApi(`/weather/week-summary?${q}&char=${encodeURIComponent(WK.per)}`);
    WK.d[k] = { r, t: Date.now() };
  } catch (e) { if (e.status === 404 || e.status === 405) WK.miss = true; WK.d[k] = { r: null, t: Date.now() }; }
  WK.busy[k] = false;
  if (m.screen === 'vaer') draw();
}
/** Lokal reserve (fasit wkVals): denne uka fra varselet. Forrige uke trenger serveren (Open-Meteo past_days=7). */
function wkLocal(D) {
  const days = (D?.days ?? []).slice(0, 7).filter((d) => d.hi != null);
  if (!days.length) return null;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const tw = mean(days.map((d) => ((d.hi ?? 0) + (d.lo ?? d.hi ?? 0)) / 2)), pw = days.reduce((a, d) => a + (+d.precipSum || 0), 0), sw = days.some((d) => d.sunshine != null) ? Math.round(days.reduce((a, d) => a + (+d.sunshine || 0), 0) / 3600) : null;
  const dn = (i) => (i === 0 ? 'i dag' : i === 1 ? 'i morgen' : WDL[new Date(`${String(days[i].date).slice(0, 10)}T12:00`).getDay()]);
  const score = (d) => d.hi - (+d.precipSum || 0) * 1.5 - (+d.windMax || 0) * 0.4 + ((+d.sunshine || 0) / 3600) * 0.3;
  const bi = days.reduce((b, d, i) => (score(d) > score(days[b]) ? i : b), 0), best = days[bi];
  const wetI = days.map((d, i) => ((+d.precipSum || 0) >= 1 ? i : -1)).filter((i) => i >= 0);
  const mx = mean(days.map((d) => d.hi)), cloth = mx < 3 ? 'Vinterjakke, lue og votter' : mx < 8 ? 'Varm jakke og skjerf' : mx < 13 ? 'Lett jakke eller ullgenser' : mx < 18 ? 'Genser holder' : 'T-skjorte-vær';
  const umb = wetI.length ? wetI.map(dn).join(', ').replace(/, ([^,]*)$/, ' og $1') : 'ingen dager';
  const bestTxt = `${dn(bi)} med ${Math.round(best.hi)}°${(+best.precipSum || 0) < 0.5 ? ' og opphold' : `, ${f1(best.precipSum)} mm`}`;
  const txt = WK.per === 'ugle' ? `Snittet denne uka er ${f1(tw)}°. Nedbør ${f1(pw)} mm${sw != null ? `, og ${sw} soltimer` : ''}. Regn ${wetI.length} av ${days.length} dager.`
    : WK.per === 'spire' ? `Beste dag ute er ${bestTxt}. Paraply: ${umb}. ${cloth}.`
      : `Snittet ligger rundt ${Math.round(tw)}° denne uka. ${wetI.length ? `Regn ${umb}, ` : 'Ingen regndager, '}${bi === 0 ? 'og i dag' : `og ${dn(bi)}`} ser finest ut.`;
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return { txt, stats: [['TEMP', `${f1(tw)}°`, 'snitt denne uka'], ['NEDBØR', `${f1(pw)} mm`, 'forrige: –'], ['SOL', sw != null ? `${sw} t` : '–', 'forrige: –']],
    rows: [['Beste dag ute', cap1(bestTxt)], ['Paraply', cap1(umb)], ['Klær', cloth]] };
}
function wkFromServer(r) {
  if (!r || typeof r !== 'object') return null;
  const T = r.thisWeek ?? {}, L = r.lastWeek ?? {};
  const t = (o) => o.tempAvg ?? o.avg ?? o.mean ?? o.temp ?? null, p = (o) => o.precip ?? o.mm ?? o.rain ?? null, s = (o) => o.sunHours ?? o.sun ?? null;
  const dT = t(T) != null && t(L) != null ? t(T) - t(L) : null;
  const hl = Array.isArray(r.highlights) ? r.highlights.map((h) => (typeof h === 'string' ? (h.includes(':') ? h.split(/:\s*/, 2) : ['', h]) : [h.k ?? h.label ?? h.title ?? '', h.v ?? h.value ?? h.text ?? ''])).filter(([, v]) => v).slice(0, 4) : [];
  return { txt: String(r.text ?? '').replace(/\*\*/g, ''), stats: [['TEMP', dT != null ? `${sg(dT)}°` : `${f1(t(T))}°`, dT != null ? 'mot forrige uke' : 'snitt denne uka'], ['NEDBØR', p(T) != null ? `${f1(p(T))} mm` : '–', `forrige: ${p(L) != null ? `${f1(p(L))} mm` : '–'}`], ['SOL', s(T) != null ? `${Math.round(s(T))} t` : '–', `forrige: ${s(L) != null ? `${Math.round(s(L))} t` : '–'}`]], rows: hl };
}
export function wkCard(D, place) {
  if (!D) return '';
  const k = `${place}|${WK.per}`;
  if (!WK.d[k] && !WK.busy[k]) wkLoad(place);
  const srv = wkFromServer(WK.d[k]?.r), loc = wkLocal(D), V = srv && srv.txt ? { ...srv, rows: srv.rows.length ? srv.rows : loc?.rows ?? [] } : loc;
  const who = PS.find(([x]) => x === WK.per) ?? PS[0];
  return `<div class="vx-card p39-wk"><div class="p39-wkh"><span class="p39-wkt"><span class="p39-ring sm"><span></span></span>GLIMT · UKAS VÆR</span><div class="p39-wkp">${PS.map(([x, n]) => `<button type="button" data-p39="wkp" data-k="${x}" aria-pressed="${WK.per === x}">${n}</button>`).join('')}</div></div>
    <div class="p39-wkb"><span class="p39-wkf">${(P35 ? P35.fig(who[0], 54, 'glad') : '')}</span><span class="p39-wkx"><b>${esc(who[2])}</b><span>${esc(V?.txt || (WK.busy[k] ? 'Henter ukas vær og forrige uke …' : 'Ingen værdata for uka ennå.'))}</span></span></div>
    ${V ? `<div class="p39-wks">${V.stats.map(([a, b, c]) => `<div><small>${esc(a)}</small><b>${esc(b)}</b><span>${esc(c)}</span></div>`).join('')}</div>
    <div class="p39-wkr">${V.rows.map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>` : ''}</div>`;
}

/* =====================================================================
   5. Kvitteringer: «✦ På nytt» med fremdrift (POST /finans/api/receipts/:id/reanalyze)
   ===================================================================== */
const RST = [['upload', 'Laster opp bildet', 15], ['ocr', 'Leser teksten (OCR)', 45], ['llm', '✦ Gemini tolker butikk, linjer og beløp', 80], ['verify', 'Sjekker sum og dato', 97]];
export const RE = {};
export const HLF = {};
const rcOf = (id) => (S.receipts ?? []).find((x) => String(x.id) === String(id));
const snap = (r) => ({ merchant: r?.merchant ?? '', total: r?.total ?? null, date: r?.date ?? '', cat: r?.categoryId ?? r?.category ?? null });
function reTick(id) {
  const R = RE[id]; if (!R || R.err || R.done) return;
  // Uten ekte fremdrift glir prosenten mot 88 % (aldri 100 før svaret er der).
  if (Date.now() - (R.real || 0) > 1500) { R.pct = Math.min(88, R.pct + Math.max(0.4, (88 - R.pct) * 0.06)); R.step = stepOf(R.pct); }
  paintRe(id);
}
const stepOf = (p) => (RST.find(([, , e]) => p < e) ?? RST[3])[0];
/** Oppdaterer fremdriften i DOM uten å tegne hele siden (raden, linja, knappen og panelet). */
function paintRe(id) {
  const R = RE[id]; if (!R) return;
  const P = Math.floor(R.pct), root = document.querySelector(`#app [data-p39re="${CSS.escape(String(id))}"]`);
  if (!root) return;
  root.querySelectorAll('[data-p39rp]').forEach((x) => { x.textContent = `${P} %`; });
  root.querySelectorAll('[data-p39rw]').forEach((x) => { x.style.width = `${Math.max(2, P)}%`; });
  const b = root.querySelector('[data-p39rb]'); if (b) b.textContent = `✦ ${P} %`;
  const meta = root.querySelector('[data-p39rm]'); if (meta) meta.textContent = `✦ Analyserer på nytt … ${P} %`;
  const st = root.querySelector('[data-p39rs]'); if (st) { const i = RST.findIndex(([k]) => k === R.step); st.textContent = `${(RST[i] ?? RST[0])[1]} …`; root.querySelectorAll('[data-p39ri]').forEach((x) => { const j = +x.dataset.p39ri; x.className = j < i ? 'ok' : j === i ? 'on' : ''; x.firstChild.textContent = j < i ? '✓' : j === i ? '•' : '·'; }); }
}
export async function rcRe(id, engine = 'gemini') {
  if (RE[id] && !RE[id].err) return;
  const before = snap(rcOf(id));
  const R = RE[id] = { pct: 2, step: 'upload', t0: Date.now(), real: 0, before, engine, seq: (RE[id]?.seq ?? 0) + 1 };
  const seq = R.seq;
  haptic('tap'); draw();
  R.timer = setInterval(() => reTick(id), 350);
  const alive = () => RE[id] && RE[id].seq === seq && !RE[id].stop;
  try {
    const r = await api(`/receipts/${id}/reanalyze`, { method: 'POST', json: { engine, async: true } });
    if (!alive()) return;
    if (r?.jobId) { R.jobId = r.jobId; await reWait(id, seq); return; }
    // Eldre server: svaret kommer med en gang (kandidat). Det nye resultatet tas i bruk, som i designet.
    if (r?.candidateId) {
      R.pct = 92; R.step = 'verify'; R.real = Date.now(); paintRe(id);
      await api(`/receipts/${id}/reanalyze/apply`, { method: 'POST', json: { candidateId: r.candidateId, keep: 'new' } });
      if (!alive()) return;
      await reDone(id, r.result?.confidence);
      return;
    }
    await reDone(id);
  } catch (e) {
    if (!alive()) return;
    reFail(id, !e.status || e.status >= 500 ? `${engine === 'tesseract' ? 'Lokal OCR' : 'Gemini'} svarte ikke` : e.message || 'Noe gikk galt');
  }
}
async function reWait(id, seq) {
  // Fremdriften kommer på sanntidskanalen (onRt39). Reserve: spør jobblisten hvert 2. sekund, maks 3 minutter.
  const t0 = Date.now();
  while (RE[id] && RE[id].seq === seq && !RE[id].stop && !RE[id].done && !RE[id].err && Date.now() - t0 < 180e3) {
    await new Promise((ok) => setTimeout(ok, 2000));
    const R = RE[id]; if (!R || R.seq !== seq || R.stop || R.done || R.err) return;
    try {
      const j = await api(`/receipts/reanalyze/${encodeURIComponent(R.jobId)}`).catch(async (e) => { if (e.status === 404) return (await api('/receipts/jobs').catch(() => [])).find?.((x) => String(x.id) === String(R.jobId) || String(x.jobId) === String(R.jobId)); throw e; });
      if (j) onRt39({ type: 'receipt-job', jobId: R.jobId, ...j, pct: j.pct ?? j.progress, step: j.step ?? (j.status === 'done' || j.status === 'needs_review' ? 'done' : j.status === 'error' ? 'error' : undefined) });
    } catch { /* prøv igjen */ }
  }
  if (RE[id] && RE[id].seq === seq && !RE[id].done && !RE[id].err && !RE[id].stop) await reDone(id);
}
/** Sanntid: {type:'receipt-job'|'job'|'reanalyze', jobId|id, step:'upload'|'ocr'|'llm'|'verify'|'done'|'error', pct, msg}. */
export function onRt39(d) {
  if (!d || typeof d !== 'object') return false;
  const jid = d.jobId ?? d.job ?? (String(d.type ?? '').startsWith('job:') ? String(d.type).slice(4) : null);
  const id = Object.keys(RE).find((k) => RE[k].jobId != null && (String(RE[k].jobId) === String(jid ?? d.id)));
  if (!id) return false;
  const R = RE[id];
  if (d.step === 'error' || d.status === 'error') { reFail(id, d.msg || d.error || 'Gemini svarte ikke'); return true; }
  if (d.step === 'done') { reDone(id, d.confidence); return true; }
  if (Number.isFinite(+d.pct)) { R.pct = Math.max(R.pct, Math.min(99, +d.pct)); R.real = Date.now(); }
  if (RST.some(([k]) => k === d.step)) R.step = d.step; else R.step = stepOf(R.pct);
  paintRe(id);
  return true;
}
async function reDone(id, conf) {
  const R = RE[id]; if (!R || R.done) return;
  R.done = true; clearInterval(R.timer); R.pct = 100; paintRe(id);
  try { await loadReceipts(); } catch {}
  const r = rcOf(id), a = snap(r), b = R.before;
  const ch = ['merchant', 'total', 'date', 'cat'].filter((k) => String(a[k] ?? '') !== String(b[k] ?? ''));
  if (ch.length) { HLF[id] = ch; setTimeout(() => { delete HLF[id]; if (m.screen === 'kv') draw(); }, 2000); }
  delete RE[id];
  const c = conf ?? r?.confidence; const pc = c != null ? Math.round(c * (c <= 1 ? 100 : 1)) : null;
  flash(`✦ Analysert på nytt${pc != null ? ` · ${pc} % sikker` : ''}`, 'ok');
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { navigator.serviceWorker?.getRegistration?.('/finans/').then((g) => g?.showNotification('Glimt', { body: `Kvitteringen fra ${r?.merchant || 'butikken'} er lest på nytt`, icon: '/assets/glimt-varsel.png', badge: '/assets/glimt-badge.png', tag: `rc-${id}`, data: { url: '/finans/#/kv' } })).catch(() => {}); } catch {}
  }
}
function reFail(id, msg) { const R = RE[id]; if (!R) return; clearInterval(R.timer); R.err = msg; haptic('err'); draw(); }
function reStop(id) {
  const R = RE[id]; if (!R) return;
  R.stop = true; clearInterval(R.timer);
  if (R.jobId) api(`/receipts/reanalyze/${encodeURIComponent(R.jobId)}`, { method: 'DELETE' }).catch(() => {});
  delete RE[id]; haptic('tap'); flash('Avbrutt · ingenting ble endret'); draw();
}
/** Raden i TIL GJENNOMGANG: undertekst og tynn linje mens analysen pågår. */
export const reMeta = (id) => { const R = RE[id]; if (!R) return null; return R.err ? `<span style="color:var(--pp-lab)">✕ ${esc(R.err)}</span>` : `<span data-p39rm style="color:var(--pp-lab)">✦ Analyserer på nytt … ${Math.floor(R.pct)} %</span>`; };
export const reLine = (id) => (RE[id] && !RE[id].err ? `<span class="p39-rl" aria-hidden="true"><i data-p39rw style="width:${Math.max(2, Math.floor(RE[id].pct))}%"></i></span>` : '');
export const reBtn = (id) => { const R = RE[id]; return R && !R.err ? `<button class="p23-re" disabled data-p39rb>✦ ${Math.floor(R.pct)} %</button>` : `<button class="p23-re" data-p39="rcre" data-id="${esc(id)}">✦ På nytt</button>`; };
export function rePanel(id) {
  const R = RE[id]; if (!R) return '';
  const i = RST.findIndex(([k]) => k === R.step), P = Math.floor(R.pct);
  if (R.err) return `<div class="p39-rp err"><b>✕ ${esc(R.err)}</b><div class="p39-rpb"><button type="button" data-p39="rcre" data-id="${esc(id)}">Prøv igjen</button><button type="button" data-p39="rcocr" data-id="${esc(id)}">Bruk lokal OCR</button></div></div>`;
  return `<div class="p39-rp"><div class="p39-rph"><b data-p39rs>${esc((RST[i] ?? RST[0])[1])} …</b><span data-p39rp>${P} %</span></div><span class="p39-rpl"><i data-p39rw style="width:${Math.max(2, P)}%"></i></span>
    <div class="p39-rps">${RST.map(([, n], j) => `<span data-p39ri="${j}" class="${j < i ? 'ok' : j === i ? 'on' : ''}"><i>${j < i ? '✓' : j === i ? '•' : '·'}</i>${esc(n)}</span>`).join('')}</div>
    <button type="button" class="p39-rpx" data-p39="rcstop" data-id="${esc(id)}">Avbryt</button></div>`;
}
export const hlOf = (id, f) => (HLF[id]?.includes(f) ? ' p39-hl' : '');

/* =====================================================================
   6. Innstillinger → Glimt: «Forslag fra Glimt» (pakkelister kan slås på igjen)
   ===================================================================== */
export function tipsCfg() {
  const off = !!(lsGet('huske_tip_off', {}) || {}).pack;
  return `<span class="p35-lab">FORSLAG FRA GLIMT I GJØREMÅL</span><div class="p35-list"><button type="button" class="p35-row" data-p39="tippack" role="switch" aria-checked="${!off}"><span class="p35-rt"><b>Pakkelister før reiser</b><span>Bare for reiser og hyttetur over flere dager, aldri for bursdager eller timer</span></span><span class="p35-sw${off ? '' : ' on'}" aria-hidden="true"><i></i></span></button></div>`;
}

/* =====================================================================
   Hendelser, lag og oppstart
   ===================================================================== */
export function layer39() { return ''; }
export async function bind39(e, t) {
  const x = t.closest?.('[data-p39]'); if (!x) return false;
  const k = x.dataset.p39, id = x.dataset.id;
  switch (k) {
    case 'cmdone': e.preventDefault(); if (CM.ed) { CM.ed = false; haptic('ok'); draw(); } else { CMPo().open = false; CM.st = 0; draw(); } return true;
    case 'cmtab': CM.tab = x.dataset.k; haptic('tab'); draw(); return true;
    case 'cmrow': if (CM.ed) return true; CM.open = CM.open === +x.dataset.i ? -1 : +x.dataset.i; haptic('tap'); draw(); return true;
    case 'cmhide': { e.stopPropagation(); const L = cmLay(); cmSave({ ...L, hid: { ...L.hid, [x.dataset.k]: true } }); vib(8); draw(); return true; }
    case 'cmshow': { const L = cmLay(), kk = x.dataset.k, ord = L.ord.filter((y) => y !== kk), last = ord.filter((y) => !L.hid[y]).pop(); ord.splice(last ? ord.indexOf(last) + 1 : 0, 0, kk); const hid = { ...L.hid }; delete hid[kk]; cmSave({ ord, hid }); vib(8); draw(); return true; }
    case 'wkp': WK.per = x.dataset.k; try { localStorage.setItem('vaer_glimt_p', WK.per); } catch {} hlApi('/me/layout', { method: 'PUT', json: { vaer_glimt_p: WK.per } }).catch(() => {}); haptic('tab'); draw(); return true;
    case 'rcre': e.preventDefault(); rcRe(id); return true;
    case 'rcocr': e.preventDefault(); delete RE[id]; rcRe(id, 'tesseract'); return true;
    case 'rcstop': e.preventDefault(); reStop(id); return true;
    case 'tippack': { const o = { ...(lsGet('huske_tip_off', {}) || {}) }; o.pack = !o.pack; lsSet('huske_tip_off', o); hlApi('/me/layout', { method: 'PUT', json: { huske_tip_off: o } }).catch(() => {}); haptic('tab'); draw(); return true; }
    default: return false;
  }
}
export function afterDraw39() {
  sheetState();
  const sc = document.getElementById('p39-cmsc');
  if (sc) { if (CM.st && Math.abs(sc.scrollTop - CM.st) > 1) sc.scrollTop = CM.st; sc.addEventListener('scroll', cmScroll, { passive: true }); }
  for (const id of Object.keys(RE)) paintRe(id);
}
let booted = false;
export function boot39() {
  if (booted) return; booted = true;
  document.addEventListener('pointerdown', (e) => { swDown(e); cmDown(e); }, true);
  document.addEventListener('pointermove', (e) => { swMove(e); cmMove(e); }, { capture: true, passive: false });
  const up = (e) => { swUp(e); cmUp(e); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(ev, up, true);
  document.addEventListener('click', (e) => {
    swClick(e);
    // Klikket som fulgte holdet (start på redigering) og klikk på kortinnhold i redigering blokkeres.
    if (CMPo().open && e.target.closest?.('.p39-cmp [data-blk]') && !e.target.closest('[data-p39="cmhide"]') && (CM.ed || Date.now() - CD.lpFired < 600)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('.p39-cmp [data-blk], [data-p36bsc], [data-p37bvc]')) e.preventDefault(); }, true);
  // Mens et kort dras i Yr mot Storm, står siden stille.
  document.addEventListener('touchmove', (e) => { if ((CD.d || (SW.g && SW.g.cap)) && e.cancelable) e.preventDefault(); }, { passive: false, capture: true });
}
