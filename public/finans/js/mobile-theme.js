// Android-farger (Material You) og lys/mørk modus for mobil-PWA-en.
// Alle Android-farger i mobile.css er skrevet som var(--m3-XXXXXX, #XXXXXX). Her regnes de om fra én frøfarge
// ved å flytte fargetonen; semantisk grønn, rød og gul flyttes ikke. Lys modus speiler lysheten.
// «Følg systemet» prøver CSS-fargen AccentColor (systemets aksentfarge) og faller tilbake til oransje.

export const SEEDS = { sys: ['Følg systemet', null], orange: ['Oransje', '#FFB68A'], blue: ['Blå', '#A8C7FA'], green: ['Grønn', '#8CD5B0'], purple: ['Lilla', '#D0BCFF'], pink: ['Rosa', '#FFB1C8'], yellow: ['Gul', '#E9C46A'] };
export const MODES = { sys: 'Følg systemet', light: 'Lys', dark: 'Mørk' };

// Fargene i Android-temaet (fra designet). Fargene i FIX endrer ikke tone (grønn = inn, rød = feil, gul = advarsel).
const ALL = ['#19120E', '#F0DFD7', '#D7C2B8', '#5D4033', '#FFDBC8', '#763300', '#FFB68A', '#261E19', '#1F3A2F', '#9FE3C6', '#3D332C', '#45462A', '#E6E6AE', '#31281F', '#532200',
  '#ECE8E0', '#3A362E', '#FF7A3D', '#B9B4A8', '#A08D83', '#C9E4D8', '#1A0C04', '#FFB08A', '#3A2F29', '#FF8A80', '#07301F', '#3A2F33', '#FFB1C8', '#2F2529', '#D5C2C6', '#7B2949',
  '#FFD9E2', '#7BE3A0', '#2A2024', '#F2B56B', '#3A3631', '#121110', '#2A211B', '#55524D', '#0C0806', '#1F1712', '#F4F2EF', '#D9D5CF', '#1E1712', '#4A3C33', '#52443C', '#1A1114',
  '#F2DEE2', '#3A2C31', '#3B0A1E', '#A9C3FF', '#FF8A6B', '#FF8A4C', '#C2E27A'];
const FIX = ['#9FE3C6', '#7BE3A0', '#1F3A2F', '#C9E4D8', '#07301F', '#FF8A80', '#F2B56B', '#FF8A6B', '#A9C3FF', '#C2E27A'];

const hsl = (hx) => {
  const r = parseInt(hx.slice(1, 3), 16) / 255, g = parseInt(hx.slice(3, 5), 16) / 255, b = parseInt(hx.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; }
  return [h, s, l];
};
const hex = (h, s, l) => {
  h = ((h % 360) + 360) % 360;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};
function palette(seed, light) {
  const dh = hsl(seed)[0] - hsl('#FFB68A')[0];
  return ALL.map((x) => {
    let [h, s, l] = hsl(x);
    const fix = FIX.includes(x);
    if (!fix && s > 0.12) h += dh;
    if (light) {
      if (s > 0.5 && l > 0.55) l = 0.36;
      else if (s > 0.15 && l > 0.13 && l < 0.46) l = 0.92 - (l - 0.13) * 0.3;
      else l = Math.max(0.04, Math.min(0.985, 1 - l));
      if (fix && l < 0.5) l = Math.min(l, 0.32);
    }
    return `--m3-${x.slice(1)}:${hex(h, s, l)}`;
  }).join(';');
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
export function applyM3(on, seedKey = 'sys', mode = 'dark', redraw = () => {}) {
  let el = document.getElementById('fh-m3');
  if (!on) { el?.remove(); key = ''; return false; }
  if (!mq) { mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener?.('change', () => { key = ''; redraw(); }); }
  const seed = SEEDS[seedKey]?.[1] ?? systemSeed() ?? '#FFB68A';
  const light = isLight(mode), k = seed + light;
  if (k === key) return light;
  key = k;
  if (!el) { el = document.createElement('style'); el.id = 'fh-m3'; document.head.appendChild(el); }
  el.textContent = `:root{${palette(seed, light)}}`;
  return light;
}
/** var(--m3-XXXXXX,#XXXXXX) for inline-stiler i Android-temaet. */
export const c3 = (h) => `var(--m3-${h.slice(1).toUpperCase()},${h})`;
