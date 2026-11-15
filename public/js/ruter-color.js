// Ruters egne linjefarger (egen modul fra Fase 3, så oversikt-mobil.js ikke drar med seg hele dashbordet): fra Entur når serveren sender dem (color/textColor), ellers etter transportmiddel og linjenummer.
const RUTER = { metro: '#EC700C', tram: '#0B91EF', bus: '#E60000', regional: '#75A300', water: '#682C88', rail: '#003087' };
function ruterColor(d) {
  const okHex = (c) => (/^#?[0-9a-f]{6}$/i.test(c ?? '') ? (c[0] === '#' ? c : '#' + c) : null);
  if (okHex(d.color)) return [okHex(d.color), okHex(d.textColor) ?? '#fff'];
  const m = String(d.mode ?? '').toLowerCase(), n = String(d.line ?? '');
  const k = /metro|subway/.test(m) || /^T?\d$/.test(n) && /metro/.test(m) ? 'metro'
    : /tram/.test(m) ? 'tram' : /water|ferry|boat/.test(m) ? 'water' : /rail|train/.test(m) ? 'rail'
    : /^[1-5]$/.test(n) ? 'metro' : /^1[1-9]$/.test(n) ? 'tram' : /^B\d/i.test(n) ? 'water' : /^(R|L|F)\d/i.test(n) ? 'rail' : /^\d{3}/.test(n) ? 'regional' : 'bus';
  return [RUTER[k], '#fff'];
}
// Prompt 51 (A11Y51): linjemerket skal ha minst 4,5:1 kontrast (11 px tekst). Mørkner bakgrunnen (samme fargetone) til kravet er nådd.
export function ruterColorA11y(d) {
  const [bg, fg] = ruterColor(d);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  if (!/^#[0-9a-f]{6}$/i.test(bg) || !/^#[0-9a-f]{6}$/i.test(fg)) return [bg, fg];
  const f = rgb(fg); let c = rgb(bg);
  if (lum(f) < 0.5) return [bg, fg]; // mørk tekst på lys bakgrunn: la Ruters farger stå
  for (let i = 0; i < 20 && ratio(c, f) < 4.55; i++) c = c.map((v) => Math.round(v * 0.93));
  return ['#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''), fg];
}
