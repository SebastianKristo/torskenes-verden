// Tekst på en farge brukeren har valgt selv (M9): hvit (--ds-on-category) eller svart (--ds-on-category-light) etter hvilken som gir
// best kontrast. Den beste av de to gir alltid minst 4,58:1 (WCAG 2.1), så teksten er lesbar uansett farge.

/** '#rgb', '#rrggbb' eller 'rgb(r, g, b)' → [r, g, b] (0–255), ellers null. */
function rgbOf(c) {
  const s = String(c ?? '').trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((x) => parseInt(x + x, 16));
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  return m ? [m[1], m[2], m[3]].map(Number) : null;
}
/** Relativ luminans (WCAG 2.1). */
function lum(rgb) {
  const [r, g, b] = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Kontrastforholdet mellom to farger (1–21). */
export function kontrast(a, b) {
  const A = rgbOf(a), B = rgbOf(b);
  if (!A || !B) return 1;
  const [hi, lo] = [lum(A), lum(B)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** true når svart tekst gir bedre kontrast enn hvit på fargen. Ukjent farge → false (hvit, som på kategorifargene). */
export function lysBakgrunn(c) {
  const rgb = rgbOf(c);
  if (!rgb) return false;
  const L = lum(rgb);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05);
}
