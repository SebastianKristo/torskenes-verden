// Prompt 30: felles validering av bbox per kvitteringslinje (brukes av ai.js og highlight30.js, uten sirkulær import).
/** Gyldig bbox: fire tall i prosent (0–100), bredde og høyde > 0. Ellers null. */
export function cleanBbox(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const v = b.map(Number);
  if (!v.every(Number.isFinite)) return null;
  // Noen modeller svarer i 0–1: skaler opp.
  const scaled = v.every((x) => x >= 0 && x <= 1) ? v.map((x) => x * 100) : v;
  const [x, y, w, h] = scaled.map((n) => Math.round(n * 100) / 100);
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x > 100 || y > 100) return null;
  return [x, y, Math.min(w, 100 - x), Math.min(h, 100 - y)];
}

