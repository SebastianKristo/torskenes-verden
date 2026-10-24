// Port av de rene funksjonene i Sources/VisionOCRCore/Geometry.swift (bbox, bånd, sammenslåing, rows).
// Brukes bare for å sjekke algoritmen der Swift ikke finnes (Linux/CI). Hold den lik Swift-koden.
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const midY = (b) => b.y + b.h / 2;
const maxY = (b) => b.y + b.h;
const maxX = (b) => b.x + b.w;

export const bboxFromArray = ([x, y, w, h]) => ({ x, y, w, h });
export const bboxToArray = (b) => [b.x, b.y, b.w, b.h];

export function visionToTopLeft(x, y, width, height) {
  const x0 = clamp01(x), x1 = clamp01(x + width);
  const yTop = clamp01(1 - (y + height)), yBottom = clamp01(1 - y);
  return { x: x0, y: yTop, w: Math.max(0, x1 - x0), h: Math.max(0, yBottom - yTop) };
}

export function bandRanges(width, height, { maxRatio = 2.5, bandRatio = 2.0, overlap = 0.10, minBandHeight = 400 } = {}) {
  if (!(width > 0 && height > 0)) return [];
  if (height <= maxRatio * width) return [{ top: 0, height }];
  const bandHeight = Math.max(minBandHeight, Math.round(width * bandRatio));
  if (bandHeight >= height) return [{ top: 0, height }];
  const overlapPx = Math.max(1, Math.round(bandHeight * overlap));
  const step = Math.max(1, bandHeight - overlapPx);
  const out = [];
  let top = 0;
  for (;;) {
    if (top + bandHeight >= height) { out.push({ top: height - bandHeight, height: bandHeight }); break; }
    out.push({ top, height: bandHeight });
    top += step;
  }
  return out;
}

export function bandToGlobal(b, band, imageHeight) {
  const H = Math.max(1, imageHeight);
  return { x: b.x, y: clamp01((band.top + b.y * band.height) / H), w: b.w, h: Math.min(1, (b.h * band.height) / H) };
}

export const normalizeText = (s) => s.toLowerCase().replace(/\s/g, '');

export function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

export function textsSimilar(a, b) {
  const na = normalizeText(a), nb = normalizeText(b);
  if (!na || !nb) return na === nb;
  if (na === nb) return true;
  const A = Array.from(na), B = Array.from(nb);
  return levenshtein(A, B) <= Math.max(1, Math.floor(Math.max(A.length, B.length) / 5));
}

export function isDuplicateLine(a, b) {
  const tol = Math.max(a.bbox.h, b.bbox.h) * 0.6;
  if (Math.abs(midY(a.bbox) - midY(b.bbox)) > tol) return false;
  const xOverlap = Math.min(maxX(a.bbox), maxX(b.bbox)) - Math.max(a.bbox.x, b.bbox.x);
  if (!(xOverlap > 0)) return false;
  return textsSimilar(a.text, b.text);
}

export function mergeBands(perBand, bands, imageHeight) {
  if (perBand.length !== bands.length || bands.length <= 1) return perBand.flat();
  const H = Math.max(1, imageHeight);
  const cuts = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const ov0 = bands[i + 1].top, ov1 = bands[i].top + bands[i].height;
    cuts.push((ov0 + ov1) / 2 / H);
  }
  const kept = [];
  perBand.forEach((lines, i) => {
    const lo = i === 0 ? -Infinity : cuts[i - 1];
    const hi = i === bands.length - 1 ? Infinity : cuts[i];
    for (const l of lines) { const m = midY(l.bbox); if (m > lo && m <= hi) kept.push({ line: l, band: i }); }
  });
  const drop = new Set();
  for (let a = 0; a < kept.length; a++) {
    if (drop.has(a)) continue;
    for (let b = a + 1; b < kept.length; b++) {
      if (!drop.has(b) && Math.abs(kept[a].band - kept[b].band) === 1 && isDuplicateLine(kept[a].line, kept[b].line)) {
        if (kept[b].line.confidence > kept[a].line.confidence) { drop.add(a); break; }
        drop.add(b);
      }
    }
  }
  return kept.filter((_, i) => !drop.has(i)).map((k) => k.line);
}

const cmp2 = (a1, a2, b1, b2) => (a1 < b1 ? -1 : a1 > b1 ? 1 : a2 < b2 ? -1 : a2 > b2 ? 1 : 0);

export const sortReadingOrder = (lines) => [...lines].sort((p, q) => cmp2(midY(p.bbox), p.bbox.x, midY(q.bbox), q.bbox.x));

export function groupRows(lines, minOverlap = 0.5) {
  const usable = sortReadingOrder(lines.filter((l) => l.text.trim() !== ''));
  const rows = [];
  for (const l of usable) {
    let best = -1, bestScore = 0;
    rows.forEach((r, i) => {
      const overlap = Math.min(r.bottom, maxY(l.bbox)) - Math.max(r.top, l.bbox.y);
      if (overlap <= 0) return;
      const ref = Math.min(l.bbox.h, r.sumHeight / Math.max(1, r.members.length));
      if (ref <= 0) return;
      const score = overlap / ref;
      if (score >= minOverlap && score > bestScore) { best = i; bestScore = score; }
    });
    if (best >= 0) {
      const r = rows[best];
      r.top = Math.min(r.top, l.bbox.y); r.bottom = Math.max(r.bottom, maxY(l.bbox));
      r.sumHeight += l.bbox.h; r.members.push(l);
    } else {
      rows.push({ top: l.bbox.y, bottom: maxY(l.bbox), sumHeight: l.bbox.h, members: [l] });
    }
  }
  const minX = (r) => Math.min(...r.members.map((m) => m.bbox.x));
  rows.sort((p, q) => cmp2(p.top, minX(p), q.top, minX(q)));
  return rows.map((r) => [...r.members].sort((p, q) => p.bbox.x - q.bbox.x).map((m) => m.text.trim()).join(' '));
}

const roundTo = (v, places) => { const p = 10 ** places; return Math.round(v * p) / p; };

/** Port av buildResult i OcrFormat.swift: felles OCR-format med source «mac_vision». */
export function buildResult(lines, width, height, ms) {
  const ordered = sortReadingOrder(lines);
  const rows = groupRows(ordered);
  return {
    source: 'mac_vision',
    lines: ordered.map((l) => ({ text: l.text, confidence: roundTo(Math.min(1, Math.max(0, l.confidence)), 3), bbox: bboxToArray(l.bbox).map((v) => roundTo(v, 4)) })),
    rows,
    full_text: rows.join('\n'),
    image_size: [width, height],
    ms: Math.max(0, ms),
  };
}
