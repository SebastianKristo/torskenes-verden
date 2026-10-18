// Android-farger (Material You) og lys/mørk modus for mobil-PWA-en.
// Alle Android-farger i mobile.css er skrevet som var(--m3-XXXXXX, #XXXXXX). Her regnes de om fra én frøfarge i OKLCH:
// hver farge har en fast rolle (overflate, tekst, primær, container …) med egen tone i mørk og lys modus. Bare kulørtonen
// følger aksentfargen; lys modus bruker egne toner per rolle (ikke invertering). Statusfarger (grønn, rød, gul, blå)
// og Domener-rosa følger ikke aksentfargen. Med «Samme overalt» brukes hovedtemaet også på Domener.
// «Følg systemet» prøver CSS-fargen AccentColor (systemets aksentfarge) og faller tilbake til oransje.

export const SEEDS = { sys: ['Følg systemet', null], orange: ['Oransje', '#FFB68A'], blue: ['Blå', '#A8C7FA'], green: ['Grønn', '#8CD5B0'], purple: ['Lilla', '#D0BCFF'], pink: ['Rosa', '#FFB1C8'], yellow: ['Gul', '#E9C46A'] };
export const MODES = { sys: 'Følg systemet', light: 'Lys', dark: 'Mørk' };

/* ---------- OKLCH ⇄ sRGB ---------- */

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklch(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function rgb(L, C, H) {
  const h = (H * Math.PI) / 180, A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
// Reduserer kroma til fargen er innenfor sRGB (beholder lyshet og kulør).
function hex(L, C, H) {
  L = Math.max(0, Math.min(1, L));
  let lo = 0, hi = C, c = rgb(L, C, H);
  if (c.some((v) => v < -1e-4 || v > 1.0001)) {
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (rgb(L, mid, H).some((v) => v < -1e-4 || v > 1.0001)) hi = mid; else lo = mid; }
    c = rgb(L, lo, H);
  }
  return '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, toSrgb(Math.max(0, v)))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/* ---------- Roller ---------- */

// Familier: p = primær (frøfargens kulør), s = sekundær (lav kroma), t = tertiær (kulør + 60°),
// n = nøytral, v = nøytral variant, k = Domener-rosa (fast kulør), x = status (fast kulør og kroma).
// Tallet er tonen (0–100) i lys modus. Mørk modus bruker designets egen lyshet, så oransje gir nøyaktig designet.
const ROLE = {
  // Overflater og tekst
  '0C0806': ['n', 100], '121110': ['n', 99], '19120E': ['n', 98], '1E1712': ['n', 96], '1F1712': ['n', 96], '261E19': ['n', 94], '2A211B': ['n', 93],
  '31281F': ['n', 91], '3A2F29': ['n', 89], '3D332C': ['v', 87], '3A3631': ['n', 88], '3A362E': ['n', 88], '4A3C33': ['v', 84], '52443C': ['v', 80],
  '55524D': ['n', 70], 'A08D83': ['v', 50], 'B9B4A8': ['n', 45], 'D7C2B8': ['v', 30], 'D9D5CF': ['n', 30], 'F0DFD7': ['n', 10], 'ECE8E0': ['n', 12], 'F4F2EF': ['n', 8],
  // Primær
  'FFB68A': ['p', 40], 'FFB08A': ['p', 42], 'FF8A4C': ['p', 50], 'FF7A3D': ['p', 52], '532200': ['p', 100], '1A0C04': ['p', 100], '763300': ['p', 90], 'FFDBC8': ['p', 12],
  // Sekundær og tertiær
  '5D4033': ['s', 90], '45462A': ['t', 90], 'E6E6AE': ['t', 12],
  // Domener-rosa
  '7B2949': ['k', 90], 'FFD9E2': ['k', 12], 'FFB1C8': ['k', 42], '3B0A1E': ['k', 100], '2A2024': ['k', 94], '3A2F33': ['k', 90], '2F2529': ['k', 92],
  '3A2C31': ['k', 89], '1A1114': ['k', 97], 'D5C2C6': ['k', 30], 'F2DEE2': ['k', 10],
  // Status (grønn = inn, rød = feil, gul = advarsel, blå = info)
  '9FE3C6': ['x', 40], '7BE3A0': ['x', 42], '1F3A2F': ['x', 90], 'C9E4D8': ['x', 20], '07301F': ['x', 95], 'FF8A80': ['x', 45], 'F2B56B': ['x', 48],
  'FF8A6B': ['x', 48], 'A9C3FF': ['x', 45], 'C2E27A': ['x', 45],
};
const [, BASE_C, BASE_H] = oklch('#FFB68A');
// M3-tone (CIELAB L*) → OKLCH-lyshet: L = ∛Y.
const okL = (tone) => { const f = (tone + 16) / 116, Y = tone > 8 ? f ** 3 : tone / 903.3; return Math.cbrt(Y); };
// Kroma i lys modus: sterkest midt på toneskalaen, svak ved ytterpunktene (som M3-tonepaletter).
const lightC = (base, tone) => base * Math.max(0.22, 1 - Math.abs(tone - 48) / 58);

// «Samme overalt» (prompt 12, standard): Domener-rosa erstattes av rollen med samme plass i hovedtemaet, så alle sider
// bruker Material You-fargene fra frøfargen. «Egen farge per side» beholder rosa.
const K_SAME = { '7B2949': '5D4033', FFD9E2: 'FFDBC8', FFB1C8: 'FFB68A', '3B0A1E': '532200', '2A2024': '2A211B', '3A2F33': '3A2F29', '2F2529': '31281F',
  '3A2C31': '3A2F29', '1A1114': '19120E', D5C2C6: 'D7C2B8', F2DEE2: 'F0DFD7' };
function palette(seed, light, same = false) {
  const out = palOf(seed, light);
  return Object.keys(ROLE).map((h) => `--m3-${h}:${same && K_SAME[h] ? out[K_SAME[h]] : out[h]}`).join(';');
}
function palOf(seed, light) {
  const [, sC, sH] = oklch(seed);
  const dh = sH - BASE_H, pC = Math.max(0.06, Math.min(0.17, sC)), kC = Math.max(0.5, Math.min(1.25, sC / BASE_C));
  return Object.entries(ROLE).map(([h, [fam, tone]]) => {
    const [L, C, H] = oklch('#' + h);
    let out;
    if (!light) {
      // Mørk: designets lyshet. Bare kuløren roteres (og nøytrale får en svak tone av frøfargen).
      // Med oransje frø (dh = 0, kC = 1) blir fargene nøyaktig som i designet.
      if (fam === 'k' || fam === 'x' || (Math.abs(dh) < 1 && Math.abs(kC - 1) < 0.02)) out = '#' + h;
      else out = hex(L, fam === 'p' ? C * kC : C, H + dh);
    } else {
      const T = okL(tone);
      if (fam === 'n') out = hex(T, tone > 95 ? 0.006 : 0.012, sH);
      else if (fam === 'v') out = hex(T, 0.03, sH);
      else if (fam === 'p') out = hex(T, lightC(Math.min(0.2, pC * 1.5), tone), sH);
      else if (fam === 's') out = hex(T, lightC(0.05, tone), sH);
      else if (fam === 't') out = hex(T, lightC(0.07, tone), H + dh);
      else out = hex(T, lightC(Math.max(0.08, C), tone), H); // k og x: fast kulør
    }
    return [h, out];
  }).reduce((a, [h, v]) => ((a[h] = v), a), {});
}

// Systemets aksentfarge (Chrome på Android 12+ eksponerer Material You-fargen som AccentColor der det støttes).
function systemSeed() {
  try {
    const t = document.createElement('i');
    t.style.color = 'AccentColor';
    if (!t.style.color) return null;
    document.body.appendChild(t);
    const m = getComputedStyle(t).color.match(/\d+/g);
    t.remove();
    if (m && !(m[0] === m[1] && m[1] === m[2])) return '#' + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('');
  } catch { /* ikke støttet */ }
  return null;
}

let mq = null, key = '';
export const isLight = (mode) => mode === 'light' || (mode === 'sys' && !!matchMedia('(prefers-color-scheme: light)').matches);

/** Setter (eller fjerner) Android-paletten. on=false for iOS-temaet. */
export function applyM3(on, seedKey = 'sys', mode = 'dark', redraw = () => {}, same = true) {
  let el = document.getElementById('fh-m3');
  if (!on) { el?.remove(); key = ''; return false; }
  if (!mq) { mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener?.('change', () => { key = ''; redraw(); }); }
  const seed = SEEDS[seedKey]?.[1] ?? systemSeed() ?? '#FFB68A';
  const light = isLight(mode), k = seed + light + same;
  if (k === key) return light;
  key = k;
  if (!el) { el = document.createElement('style'); el.id = 'fh-m3'; document.head.appendChild(el); }
  el.textContent = `:root{${palette(seed, light, same)}}`;
  return light;
}
export const paletteFor = palette; // for tester
/** var(--m3-XXXXXX,#XXXXXX) for inline-stiler i Android-temaet. */
export const c3 = (h) => `var(--m3-${h.slice(1).toUpperCase()},${h})`;

/* ---------- Papir (prompt 13) ---------- */
// Papir bruker ikke Material You. Hver Android-rolle får en papirfarge, så alle sider (som tegnes med Android-oppsettet)
// blir lyst papir eller kveldspapir. I tillegg settes --pp-* for Papir-skallet og de nye kortene.
export const PAPER = {
  light: { bg: '#f3efe6', card: '#ffffff', surf2: '#ebe5d8', line: '#d8d1c2', mut: '#8f897c', mut2: '#6b665c', ink: '#1b1a17', lab: '#b23a2a', onLab: '#ffffff', labC: '#f3e3d9', onLabC: '#7a2814', pos: '#2f7a4f', posC: '#dfe9e1', onPosC: '#1f4d3a', warn: '#a86a10', blue: '#2f5d8a', lime: '#5a7a10', limeC: '#eef2d6', onLimeC: '#3d4a10', nav: '#1b1a17', navInk: '#a39e92', navAct: '#f3efe6', navActInk: '#1b1a17' },
  dark: { bg: '#14130f', card: '#211f19', surf2: '#2a2820', line: '#34322a', mut: '#8a8578', mut2: '#b5ae9f', ink: '#ece7dc', lab: '#e8705c', onLab: '#14130f', labC: '#3a2418', onLabC: '#f2b8a6', pos: '#7fcf9a', posC: '#17271e', onPosC: '#c9e4d8', warn: '#f2b56b', blue: '#8fb3dc', lime: '#c2e27a', limeC: '#2c3216', onLimeC: '#d4f25a', nav: '#ece7dc', navInk: '#5e594f', navAct: '#14130f', navActInk: '#ece7dc' },
};
const X_PAPER = { '9FE3C6': 'pos', '7BE3A0': 'pos', '1F3A2F': 'posC', 'C9E4D8': 'onPosC', '07301F': 'posC', FF8A80: 'lab', FF8A6B: 'lab', F2B56B: 'warn', A9C3FF: 'blue', C2E27A: 'lime' };
function paperRole(h, c) {
  const [fam, tone] = ROLE[h];
  if (fam === 'x') return c[X_PAPER[h]] ?? c.ink;
  if (fam === 'p') return tone >= 100 ? c.onLab : tone >= 85 ? c.labC : tone <= 15 ? c.onLabC : c.lab;
  if (fam === 't') return tone >= 85 ? c.limeC : c.onLimeC;
  if (fam === 's') return c.surf2;
  return tone >= 96 ? c.bg : tone >= 94 ? c.card : tone >= 87 ? c.surf2 : tone >= 78 ? c.line : tone >= 40 ? c.mut : tone >= 25 ? c.mut2 : c.ink;
}
/** Setter papirfargene (lys eller mørk) på alle --m3-*-rollene og --pp-*-tokenene. */
export function applyPaper(dark) {
  const c = PAPER[dark ? 'dark' : 'light'], k2 = 'paper' + dark;
  let el = document.getElementById('fh-m3');
  if (el && key === k2) return !dark;
  key = k2;
  if (!el) { el = document.createElement('style'); el.id = 'fh-m3'; document.head.appendChild(el); }
  const roles = Object.keys(ROLE).map((h) => `--m3-${h}:${paperRole(K_SAME[h] ?? h, c)}`).join(';');
  const pp = Object.entries(c).map(([n, v]) => `--pp-${n}:${v}`).join(';');
  el.textContent = `:root{${roles};${pp}}`;
  return !dark;
}
