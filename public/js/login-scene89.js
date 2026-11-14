// Prompt 89 (WEB89): animert bakgrunn i toppbildet på innloggingssiden (fasit «Logg inn Animert.dc.html»).
// Oslo-scenen (himmel etter tid på døgnet, nordlys, stjerner, solnedgang bak Operaen, lys som tennes i vinduene,
// glitrende vann og speiling) erstatter bildet /assets/bg/oslo.jpg når bakgrunnen er «Oslo». QR-/passorddelen røres ikke.
//
// Ytelse: alt som går i løkke er CSS-animasjoner av transform/opacity på egne lag (kompositoren tegner dem, ikke
// hovedtråden). SVG-ene er statiske; vinduene tennes ved å tone inn hele lag, ikke enkelt-rektangler. Animasjonene
// pauses når fanen er skjult eller toppbildet er utenfor skjermen. prefers-reduced-motion = stille bilde (sluttbildet).
const NS = 'http://www.w3.org/2000/svg';
const SKY = { morgen: ['#2b3a6b', '#8a7a95', '#e3a27c'], formiddag: ['#26335f', '#6f6479', '#a98676'], ettermiddag: ['#2f4677', '#7d7f9c', '#c89a7a'], kveld: ['#1d2550', '#5a4a72', '#b5736a'], natt: ['#0f1533', '#262a52', '#3e3c63'] };
const BLD = [[0, 24, 700], [34, 104, 790], [140, 112, 718], [265, 80, 756], [946, 72, 690], [1019, 112, 768], [1135, 56, 748], [1200, 76, 688], [1278, 10, 565]];
const VB_W = 1280, VB_H = 1300, WATER = 885;

const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
/** Tid på døgnet for himmelfargene (samme inndeling som fasiten). */
export function tid89(d = new Date()) { const t = d.getHours(); return t >= 5 && t < 9 ? 'morgen' : t < 12 ? 'formiddag' : t < 17 ? 'ettermiddag' : t < 22 ? 'kveld' : 'natt'; }

const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
function svg(viewBox, aspect = 'xMidYMax slice') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', viewBox); s.setAttribute('preserveAspectRatio', aspect); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  return s;
}
function sv(parent, tag, attrs) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); parent.append(e); return e; }
/** Et lag som fyller toppbildet (wrapper-diven er det som animeres). */
function layer(cls, child) { const d = el('div', `sc89-l ${cls}`); if (child) d.append(child); return d; }

/** Bygger scenen. → rot-elementet (div.sc89) */
export function buildScene89(tid = tid89()) {
  const p = SKY[tid] ?? SKY.kveld, r = rng(7);
  const root = el('div', 'sc89');
  root.setAttribute('aria-hidden', 'true');
  root.dataset.tid = tid;
  root.style.background = `linear-gradient(180deg,${p[0]} 0%,${p[1]} 44%,${p[2]} 64%)`;

  // Nordlys: fire uskarpe flak som glir sakte (transform), samlet glød som pulserer (opacity).
  const aur = layer('sc89-aur');
  [['2%', '8%', '72%', '24%', 'rgba(220,172,196,.6)', 'a', 26], ['28%', '18%', '82%', '20%', 'rgba(196,154,182,.5)', 'b', 32], ['-12%', '30%', '62%', '15%', 'rgba(160,196,206,.28)', 'b', 38], ['76%', '24%', '44%', '18%', 'rgba(226,190,205,.45)', 'a', 29]]
    .forEach(([l, t, w, h, c, k, s]) => { const b = el('i', `sc89-au sc89-au${k}`); Object.assign(b.style, { left: l, top: t, width: w, height: h, background: `radial-gradient(ellipse at center,${c},transparent 70%)`, animationDuration: `${s}s` }); aur.append(b); });

  // Stjerner i to grupper som blinker i hver sin takt.
  const stars = [layer('sc89-st sc89-st1'), layer('sc89-st sc89-st2')];
  for (let i = 0; i < 46; i++) { const s = 1 + r() * 1.8, x = r() * 100, y = r() * 100; r(); r(); const d = el('i'); Object.assign(d.style, { left: `${x}%`, top: `${y}%`, width: `${s}px`, height: `${s}px` }); stars[i % 2].append(d); }

  // Solglød (bak åsene) og solskiva (foran åsene, bak husene) stiger opp ved start.
  const glow = svg(`0 0 ${VB_W} ${VB_H}`), gd = sv(glow, 'defs', {}), rg = sv(gd, 'radialGradient', { id: 'sc89-sg' });
  sv(rg, 'stop', { offset: '0%', 'stop-color': '#f2d38a', 'stop-opacity': .75 }); sv(rg, 'stop', { offset: '100%', 'stop-color': '#f2d38a', 'stop-opacity': 0 });
  sv(glow, 'circle', { cx: 1050, cy: 745, r: 190, fill: 'url(#sc89-sg)' });
  const hills = svg(`0 0 ${VB_W} ${VB_H}`);
  sv(hills, 'path', { d: 'M0 765 Q260 720 560 738 T1000 748 Q1160 752 1280 775 L1280 885 L0 885Z', fill: '#4d4466' });
  const sun = svg(`0 0 ${VB_W} ${VB_H}`);
  sv(sun, 'circle', { cx: 1050, cy: 745, r: 68, fill: '#efcf88' });

  // Byen og Operaen (statisk), vann med gradient.
  const city = svg(`0 0 ${VB_W} ${VB_H}`), cd = sv(city, 'defs', {}), wg = sv(cd, 'linearGradient', { id: 'sc89-wg', x1: 0, y1: 0, x2: 0, y2: 1 });
  sv(wg, 'stop', { offset: '0%', 'stop-color': '#343a66' }); sv(wg, 'stop', { offset: '100%', 'stop-color': '#12162f' });
  for (const [x, w, top] of BLD) sv(city, 'rect', { x, y: top, width: w, height: WATER - top, fill: '#2a2340' });
  sv(city, 'polygon', { points: '860,885 870,842 940,842 940,885', fill: '#2a2340' });
  sv(city, 'polygon', { points: '240,885 300,825 500,745 590,730 730,740 800,770 905,885', fill: '#cfcbc0' });
  sv(city, 'polygon', { points: '500,745 590,730 730,740 792,768 600,758', fill: '#bcb7ab' });
  sv(city, 'rect', { x: 0, y: WATER, width: VB_W, height: VB_H - WATER, fill: 'url(#sc89-wg)' });
  sv(city, 'line', { x1: 0, y1: 885.5, x2: VB_W, y2: 885.5, stroke: '#8a87a6', 'stroke-opacity': .55 });

  // Vinduer: tre lag som tennes etter hverandre, og ett lag som flimrer av og til.
  const win = [0, 1, 2, 3].map(() => svg(`0 0 ${VB_W} ${VB_H}`));
  BLD.forEach(([x, w, top]) => { for (let yy = top + 16; yy < 872; yy += 30) for (let xx = x + 10; xx < x + w - 10; xx += 24) if (r() < .42) { const fl = r() < .12, k = fl ? 3 : Math.floor(r() * 3); sv(win[k], 'rect', { x: xx, y: yy, width: 7, height: 8, fill: '#e9c47c' }); } });

  // Vannet (bare vannflaten, samme skala som resten): glitrende striper i to lag + speiling av Operaen og sola.
  const wv = `0 ${WATER} ${VB_W} ${VB_H - WATER}`, sh = [svg(wv, 'xMidYMin slice'), svg(wv, 'xMidYMin slice')];
  for (let i = 0; i < 64; i++) { const x = r() * 1280, y = 896 + r() * 400, w = 30 + r() * 130; r(); r(); r(); sv(sh[i % 2], 'rect', { x, y, width: w, height: 2, rx: 1, fill: i % 5 === 0 ? '#e9c47c' : '#a3a8d2' }); }
  const refl = svg(wv, 'xMidYMin slice');
  sv(refl, 'polygon', { points: '240,885 300,939 500,1011 590,1024 730,1015 800,988 905,885', fill: '#9b98ad', opacity: .32 });
  for (let i = 0; i < 9; i++) { const hw = 54 - i * 5; sv(refl, 'rect', { x: 1050 - hw, y: 898 + i * 16, width: hw * 2, height: 3, rx: 1.5, fill: '#efcf88', opacity: (.42 - i * .04).toFixed(2) }); }

  root.append(aur, ...stars, layer('sc89-glow', glow), layer('sc89-hills', hills), layer('sc89-sun', sun), layer('sc89-city', city),
    layer('sc89-w sc89-w0', win[0]), layer('sc89-w sc89-w1', win[1]), layer('sc89-w sc89-w2', win[2]), layer('sc89-w sc89-fl', win[3]),
    layer('sc89-wat sc89-sh sc89-sh0', sh[0]), layer('sc89-wat sc89-sh sc89-sh1', sh[1]), layer('sc89-wat sc89-refl', refl),
    el('div', 'sc89-shade'), el('div', 'sc89-curtain'));
  return root;
}

const S89 = { root: null, hero: null, ro: null, io: null, vis: null };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Vannflaten følger «slice»-skaleringen: høyden settes i px så vannlagene treffer horisonten. */
function fit() {
  const h = S89.hero, root = S89.root; if (!h || !root) return;
  const W = h.clientWidth, H = h.clientHeight, s = Math.max(W / VB_W, H / VB_H);
  root.style.setProperty('--sc89-water', `${Math.round((VB_H - WATER) * s)}px`);
}
function paused() { if (!S89.root) return; S89.root.classList.toggle('sc89-paused', document.hidden || S89.off === true); }

/**
 * Viser/skjuler scenen i toppbildet. on=false fjerner den (andre bakgrunner bruker bildet som før).
 * → true når scenen vises (da skal toppbildet ikke ha bakgrunnsbilde).
 */
export function scene89(hero, on) {
  if (!hero) return false;
  if (!on) { if (S89.root) { S89.root.remove(); S89.ro?.disconnect(); S89.io?.disconnect(); document.removeEventListener('visibilitychange', S89.vis); S89.root = null; } hero.classList.remove('sc89-on'); return false; }
  if (S89.root && S89.hero === hero) return true;
  S89.hero = hero;
  S89.root = buildScene89();
  if (reduced()) S89.root.classList.add('sc89-still');
  hero.prepend(S89.root);
  hero.classList.add('sc89-on');
  fit();
  try { S89.ro = new ResizeObserver(fit); S89.ro.observe(hero); } catch { addEventListener('resize', fit); }
  try { S89.io = new IntersectionObserver((e) => { S89.off = !e[0]?.isIntersecting; paused(); }); S89.io.observe(hero); } catch { /* eldre nettleser */ }
  S89.vis = paused;
  document.addEventListener('visibilitychange', S89.vis);
  try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => S89.root?.classList.toggle('sc89-still', e.matches)); } catch { /* */ }
  return true;
}
