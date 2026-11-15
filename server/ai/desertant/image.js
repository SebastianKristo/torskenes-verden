// Prompt 53 (DAL53): Eye (hva slags bilde, rotasjon) og Moderator (NSFW) på serveren.
//   - Bildet dekodes med ImageMagick til rå RGB (EXIF-rotasjon rettet, maks 768 px) – ingen nye avhengigheter.
//   - Eye: kind (receipt/document/screenshot/photo/…) og rotation (90/180/270 med klokka fra oppreist) → veien i Glimt-chatten og
//     ekstra rotasjon før Tesseract. Moderator: score/isNSFW for barnekontoer.
//   - Alt er lokalt og bak feature flag; ikke klar = null (kalleren bruker reserven). Dekodingen har egen tidsgrense.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { use53, ready53 } from './models.js';
import { on53 } from './flags.js';

const MAX_PX = 768;
let magickBin = null;
async function magick() {
  if (magickBin !== null) return magickBin;
  for (const b of ['magick', 'convert']) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await new Promise((res) => execFile(b, ['-version'], { timeout: 3000 }, (e, out) => res(!e && /ImageMagick/i.test(String(out)))));
    if (ok) return (magickBin = b);
  }
  return (magickBin = '');
}
/** Bare for tester: overstyr dekoderen (fn(input) → {data,width,height}|null). */
let decoder = null;
export const _setDecoder53 = (fn) => { decoder = fn ?? null; };

/**
 * Bilde (Buffer eller filsti) → {data:Uint8Array RGB, width, height} | null. EXIF-rotasjonen er rettet (oppreist slik den vises).
 */
export async function decodePixels53(input, { maxPx = MAX_PX, timeoutMs = 4000 } = {}) {
  if (decoder) return decoder(input);
  const bin = await magick();
  if (!bin) return null;
  const src = typeof input === 'string' ? `${input}[0]` : '-[0]';
  const args = [src, '-auto-orient', '-resize', `${maxPx}x${maxPx}>`, '-alpha', 'off', '-colorspace', 'sRGB', '-depth', '8', '-format', '%w %h\n', '-write', 'info:fd:2', 'rgb:-'];
  return new Promise((res) => {
    const p = execFile(bin, args, { encoding: 'buffer', maxBuffer: maxPx * maxPx * 3 + 1024, timeout: timeoutMs }, (e, out, err) => {
      if (e) return res(null);
      const [w, h] = String(err).trim().split(/\s+/).slice(-2).map(Number);
      if (!(w > 0 && h > 0) || out.length < w * h * 3) return res(null);
      res({ data: new Uint8Array(out.buffer, out.byteOffset, w * h * 3), width: w, height: h });
    });
    if (typeof input !== 'string') { p.stdin.on('error', () => {}); p.stdin.end(input); }
  });
}

/* ---------------- Eye ---------------- */

const DOC_KINDS = new Set(['receipt', 'document', 'screenshot', 'identity_document', 'photo_of_screen', 'whiteboard', 'handwriting', 'text', 'invoice', 'form', 'menu']);
/** Eye-kind → veien i Glimt-chatten: 'document' (OCR-kjeden) | 'photo' (visjonsmodellen) | null. */
export function routeOfKind53(kind) {
  if (!kind) return null;
  if (DOC_KINDS.has(kind) || /receipt|document|screenshot|screen|text|invoice|letter|form/.test(kind)) return 'document';
  return 'photo';
}

const eyeCache = new Map(); // hash → resultat (maks 200)
const keyOf = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 32);
const remember = (m, k, v) => { m.set(k, v); if (m.size > 200) m.delete(m.keys().next().value); return v; };

/**
 * Eye på ett bilde. → {kind, route, rotation, confidence, scores} | null (ikke klar / feil / tidsavbrudd).
 * Bare «photo»-delen kjøres (rask), ikke ansikter/layout.
 */
export async function eyeAnalyze53(input, { timeoutMs = 2000 } = {}) {
  if (!ready53('eye')) { await use53('eye', () => null); return null; } // teller reserven og starter lasting
  const buf = typeof input === 'string' ? null : input;
  const k = buf ? keyOf(buf) : null;
  if (k && eyeCache.has(k)) return eyeCache.get(k);
  const px = await decodePixels53(input);
  if (!px) return null;
  const a = await use53('eye', (eye) => eye.analyze(px, { parts: ['photo'] }), { timeoutMs });
  if (!a) return null;
  const types = a.details?.photo?.type ?? {};
  const kind = a.kind ?? (Object.entries(types).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null);
  const out = { kind, route: routeOfKind53(kind), rotation: [90, 180, 270].includes(a.rotation) ? a.rotation : null, confidence: kind ? (types[kind] ?? a.confidence?.(kind) ?? null) : null };
  return k ? remember(eyeCache, k, out) : out;
}

/** Til forbehandlingen før Tesseract: ekstra rotasjon (grader med klokka som må til for å få bildet oppreist) eller 0. */
export async function eyeRotation53(file) {
  try {
    if (!on53('dal_eye53') || !ready53('eye')) return 0;
    const r = await eyeAnalyze53(file, { timeoutMs: 1500 });
    return r?.rotation ? 360 - r.rotation : 0;
  } catch { return 0; }
}

/* ---------------- Moderator ---------------- */

const modCache = new Map();
/** → {score, isNSFW, regions} | null. policy 'standard', terskel 0.5 (anbefalt). */
export async function moderate53(input, { timeoutMs = 2000, threshold = 0.5 } = {}) {
  if (!ready53('moderator')) { await use53('moderator', () => null); return null; }
  const k = typeof input === 'string' ? null : keyOf(input);
  if (k && modCache.has(k)) return modCache.get(k);
  const px = await decodePixels53(input, { maxPx: 1024 });
  if (!px) return null;
  const r = await use53('moderator', (m) => m.analyze(px, { threshold, quality: 'balanced' }), { timeoutMs });
  if (!r) return null;
  const out = { score: Math.round(Number(r.score) * 1000) / 1000, isNSFW: !!r.isNSFW, regions: r.regions ?? null };
  return k ? remember(modCache, k, out) : out;
}
