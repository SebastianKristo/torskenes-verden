// Prompt 48 (SERVER48): Tesseract på serveren som OCR-reserve når Mac-OCR er utilgjengelig. Kjøres med `tsv`, så den gir
// felles OCR-format: linjer (ordene i hver Tesseract-linje) med bbox normalisert til 0–1 (origo øverst til venstre),
// konfidens 0–1, rows (samme gruppering som klientene), full_text, image_size og ms. Forbehandling med ImageMagick som i
// server/ocr-fallback.js (auto-orient, gråtoner, oppskalering, støy, skjevhet, adaptiv terskel). Ingen nettoppslag.
import { execFile } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ocrTools } from '../../ocr-fallback.js';
import { rows48 } from '../normalize.js';
import { preprocess51 } from '../preprocess51.js'; // prompt 51: original, EXIF, perspektiv, aldri under 2000 px

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/tiff': 'tif', 'image/bmp': 'bmp', 'image/heic': 'heic', 'image/heif': 'heif' };
const execRun = (cmd, args, { timeout = 60_000 } = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (e, stdout, stderr) => (e ? reject(Object.assign(e, { stderr })) : resolve(stdout)));
});
// Tester: falske verktøy (run(cmd,args) → stdout, tools() → {tesseract, magick}).
const T = { run: execRun, tools: ocrTools };
export const _setTesseract48 = (o) => { T.run = o?.run ?? execRun; T.tools = o?.tools ?? ocrTools; };

/** TSV fra Tesseract → felles OCR-format (uten ms). Linjer = ord gruppert på (side, blokk, avsnitt, linje). */
export function tsvToOcr48(tsv) {
  const rows = String(tsv ?? '').split('\n').filter(Boolean);
  const head = rows.shift()?.split('\t') ?? [];
  const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  if (col.text === undefined || col.left === undefined) throw new Error('Tesseract ga ikke TSV');
  let W = 0, H = 0;
  const groups = new Map();
  for (const r of rows) {
    const c = r.split('\t');
    const n = (k) => Number(c[col[k]]);
    if (n('level') === 1) { W = Math.max(W, n('width')); H = Math.max(H, n('height')); continue; }
    if (n('level') !== 5) continue;
    const text = String(c[col.text] ?? '').trim();
    if (!text) continue;
    const key = `${n('page_num')}:${n('block_num')}:${n('par_num')}:${n('line_num')}`;
    const g = groups.get(key) ?? { words: [], l: Infinity, t: Infinity, r: -Infinity, b: -Infinity, conf: [] };
    g.words.push({ text, x: n('left') });
    g.l = Math.min(g.l, n('left')); g.t = Math.min(g.t, n('top')); g.r = Math.max(g.r, n('left') + n('width')); g.b = Math.max(g.b, n('top') + n('height'));
    if (n('conf') >= 0) g.conf.push(n('conf'));
    groups.set(key, g);
  }
  if (!W || !H) { for (const g of groups.values()) { W = Math.max(W, g.r); H = Math.max(H, g.b); } }
  const r4 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
  const lines = [...groups.values()].map((g) => ({
    text: g.words.sort((a, b) => a.x - b.x).map((w) => w.text).join(' '),
    confidence: g.conf.length ? Math.round((g.conf.reduce((a, v) => a + v, 0) / g.conf.length) * 10) / 1000 : null,
    bbox: W && H ? [r4(g.l / W), r4(g.t / H), r4((g.r - g.l) / W), r4((g.b - g.t) / H)] : null,
  }));
  const rws = rows48(lines);
  return { source: 'tesseract', lines, rows: rws, full_text: rws.join('\n'), image_size: W && H ? [W, H] : null };
}

/**
 * Bildet → felles OCR-format. Kaster {missing:true} når Tesseract ikke er installert.
 * Prompt 51: image skal være ORIGINALEN. Forbehandlingen (preprocess51) retter EXIF-rotasjon og perspektiv, beskjærer og sørger for
 * at lengste side aldri er under 2000 px. fallback {buf, mime} (klientens 1600 px-kopi) brukes bare når originalen ikke kan leses.
 * Svaret har preprocess {rotated, perspective, cropped, upscaled, downscaled, from} og image_size for bildet som faktisk ble lest.
 */
export async function tesseractOcr48(image, mime, { fallback = null } = {}) {
  const tl = await T.tools();
  if (!tl.tesseract) throw Object.assign(new Error('Tesseract er ikke installert på serveren'), { missing: true, unavailable: true });
  if (mime === 'application/pdf') throw Object.assign(new Error('Tesseract-steget leser ikke PDF'), { unavailable: true });
  const t0 = Date.now();
  const dir = await mkdtemp(join(tmpdir(), 'ocr48-'));
  try {
    let input, pre = null;
    if (tl.magick) pre = await preprocess51(image, mime, { tools: tl, fallback }).catch(() => null);
    if (pre) { input = join(dir, 'pre51.png'); await writeFile(input, pre.buf); }
    else {
      const src = join(dir, `in.${EXT[mime] ?? 'jpg'}`);
      await writeFile(src, image);
      input = src;
      if (tl.magick) {
        const out = join(dir, 'pre.png');
        // Reserve (prompt 48): bare oppskalering, aldri nedskalering, og lengste side minst 2000 px.
        try { await T.run(tl.magick, [src, '-auto-orient', '-colorspace', 'Gray', '-resize', '2000x2000<', '-despeckle', '-deskew', '40%', out], { timeout: 30_000 }); input = out; } catch { /* originalbildet */ }
      }
    }
    const tsv = await T.run('tesseract', [input, 'stdout', '-l', 'nor+eng', '--oem', '1', '--psm', '4', '--dpi', '300', '-c', 'preserve_interword_spaces=1', 'tsv'], { timeout: 90_000 })
      .catch(() => T.run('tesseract', [input, 'stdout', '-l', 'eng', '--psm', '4', 'tsv'], { timeout: 90_000 }));
    const ocr = tsvToOcr48(tsv);
    if (!ocr.full_text.trim()) throw new Error('Tesseract fant ingen tekst i bildet');
    return { ...ocr, ...(pre ? { preprocess: pre.preprocess } : {}), ms: Date.now() - t0 };
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
