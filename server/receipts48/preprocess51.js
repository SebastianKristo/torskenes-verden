// Prompt 51 (RCPTSRV51), Del B 4: forbehandling før OCR (Tesseract) – alltid på ORIGINALEN.
//   1. HEIC → JPEG i full oppløsning (heif-convert), ellers rett inn i ImageMagick.
//   2. EXIF-rotasjon rettes (-auto-orient).
//   3. Perspektiv og beskjæring: kvitteringen finnes som største lyse flate i en liten gråtonekopi (Otsu-terskel og sammenhengende
//      område, ren JS), hjørnene blir et firkantet utsnitt som rettes opp med -distort Perspective og beskjæres. Fyller
//      kvitteringen nesten hele bildet, eller er flaten urimelig, gjøres ingenting.
//   4. Lengste side aldri under MIN_PX (2000): mindre bilder skaleres opp; store skaleres ned til MAX_PX (4000).
//   5. Gråtoner, normalisering, skjevhet (-deskew) og litt skarphet – ingen hard terskel (Tesseract 5 binariserer selv).
// Mangler ImageMagick, brukes bildet som det er (preprocess: null). Ingen nettkall.
import { execFile } from 'node:child_process';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const MIN_PX51 = 2000;
export const MAX_PX51 = 4000;
const MASK_PX = 400;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/tiff': 'tif', 'image/bmp': 'bmp', 'image/gif': 'gif' };

const execBuf = (cmd, args, { timeout = 60_000 } = {}) => new Promise((res, rej) => {
  execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' }, (e, stdout, stderr) => (e ? rej(Object.assign(e, { stderr: String(stderr ?? '') })) : res(stdout)));
});
// Tester: falsk kjøring (run(cmd, args) → Buffer).
const T = { run: execBuf };
export const _setPre51 = (o) => { T.run = o?.run ?? execBuf; };

/** P5 (binær PGM) → {w, h, px: Uint8Array} | null. */
export function parsePgm51(buf) {
  const b = Buffer.from(buf ?? []);
  if (b.length < 8 || b[0] !== 0x50 || b[1] !== 0x35) return null;
  const tok = [];
  let i = 2;
  while (tok.length < 3 && i < b.length) {
    while (i < b.length && /\s/.test(String.fromCharCode(b[i]))) i++;
    if (b[i] === 0x23) { while (i < b.length && b[i] !== 0x0a) i++; continue; }
    let s = '';
    while (i < b.length && !/\s/.test(String.fromCharCode(b[i]))) s += String.fromCharCode(b[i++]);
    tok.push(+s);
  }
  i++; // ett blanktegn etter maxval
  const [w, h, max] = tok;
  if (!(w > 0 && h > 0) || max > 255 || b.length - i < w * h) return null;
  return { w, h, px: new Uint8Array(b.buffer, b.byteOffset + i, w * h) };
}

/** Otsu-terskel for et gråtonebilde. */
export function otsu51(px) {
  const hist = new Array(256).fill(0);
  for (const v of px) hist[v]++;
  const total = px.length;
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/**
 * Finner kvitteringen (største lyse sammenhengende flate) i en liten gråtonekopi. → {quad:[[x,y]×4 TL,TR,BR,BL], area, w, h} | null
 * quad er i koordinatene til maskebildet. null når flaten er for liten (<12 %) eller dekker nesten alt (>96 %).
 */
export function findDocument51({ w, h, px }) {
  const thr = otsu51(px);
  const lab = new Int32Array(w * h).fill(-1);
  let bestArea = 0, bestId = -1, id = 0;
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (lab[s] !== -1 || px[s] <= thr) continue;
    let top = 0, area = 0;
    stack[top++] = s; lab[s] = id;
    while (top) {
      const p = stack[--top]; area++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && lab[p - 1] === -1 && px[p - 1] > thr) { lab[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && lab[p + 1] === -1 && px[p + 1] > thr) { lab[p + 1] = id; stack[top++] = p + 1; }
      if (y > 0 && lab[p - w] === -1 && px[p - w] > thr) { lab[p - w] = id; stack[top++] = p - w; }
      if (y < h - 1 && lab[p + w] === -1 && px[p + w] > thr) { lab[p + w] = id; stack[top++] = p + w; }
    }
    if (area > bestArea) { bestArea = area; bestId = id; }
    id++;
  }
  const frac = bestArea / (w * h);
  if (bestId < 0 || frac < 0.12 || frac > 0.96) return null;
  let tl = null, tr = null, br = null, bl = null;
  for (let p = 0; p < w * h; p++) {
    if (lab[p] !== bestId) continue;
    const x = p % w, y = (p - x) / w;
    if (!tl || x + y < tl[0] + tl[1]) tl = [x, y];
    if (!br || x + y > br[0] + br[1]) br = [x, y];
    if (!tr || x - y > tr[0] - tr[1]) tr = [x, y];
    if (!bl || x - y < bl[0] - bl[1]) bl = [x, y];
  }
  const quad = [tl, tr, br, bl];
  // Arealet av firkanten (skolisseformelen) må dekke det meste av flaten, ellers er det ikke et ark (f.eks. en rund tallerken).
  const qa = Math.abs(quad.reduce((a, [x, y], i) => { const [x2, y2] = quad[(i + 1) % 4]; return a + x * y2 - x2 * y; }, 0)) / 2;
  if (qa < bestArea * 0.8 || qa > bestArea * 1.35) return null;
  return { quad, area: frac, w, h };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Original → bildet Tesseract skal lese. → {buf, mime, size:[w,h], preprocess:{…}} | null (uten ImageMagick eller ved feil).
 * tools: {magick:'magick'|'convert'|null}. fallback: {buf, mime} (f.eks. klientens 1600 px-kopi) når originalen ikke kan leses.
 */
export async function preprocess51(image, mime, { tools = {}, fallback = null } = {}) {
  if (!tools.magick || !image?.length) return null;
  const im = tools.magick;
  const dir = await mkdtemp(join(tmpdir(), 'pre51-'));
  const info = { rotated: false, perspective: false, cropped: false, upscaled: false, downscaled: false, from: 'original', orientation: null };
  try {
    let src = join(dir, `in.${EXT[mime] ?? 'jpg'}`);
    await writeFile(src, image);
    // HEIC: heif-convert i full oppløsning (ImageMagick 6 i Debian kan ofte ikke lese HEIC).
    if (/heic|heif/.test(mime ?? '')) {
      const jpg = join(dir, 'heic.jpg');
      try { await T.run('heif-convert', ['-q', '95', src, jpg], { timeout: 60_000 }); src = jpg; } catch { /* prøv ImageMagick */ }
    }
    let probe;
    try { probe = String(await T.run(im, [`${src}[0]`, '-format', '%w %h %[orientation]', 'info:'], { timeout: 20_000 })).trim().split(/\s+/); }
    catch {
      if (!fallback?.buf) return null;
      src = join(dir, 'fallback.jpg'); await writeFile(src, fallback.buf); info.from = 'scan';
      try { probe = String(await T.run(im, [`${src}[0]`, '-format', '%w %h %[orientation]', 'info:'], { timeout: 20_000 })).trim().split(/\s+/); } catch { return null; }
    }
    let W = +probe[0], H = +probe[1];
    const orient = probe[2] ?? 'Undefined';
    info.orientation = orient;
    if (!/^(TopLeft|Undefined)$/i.test(orient)) { info.rotated = true; if (/^(LeftTop|RightTop|RightBottom|LeftBottom)$/i.test(orient)) [W, H] = [H, W]; }
    if (!(W > 0 && H > 0)) return null;

    // Perspektiv/beskjæring ut fra en liten gråtonemaske.
    const geo = [];
    try {
      const pgm = await T.run(im, [`${src}[0]`, '-auto-orient', '-resize', `${MASK_PX}x${MASK_PX}`, '-colorspace', 'Gray', '-blur', '0x1.5', '-depth', '8', 'pgm:-'], { timeout: 20_000 });
      const mask = parsePgm51(pgm);
      const doc = mask ? findDocument51(mask) : null;
      if (doc) {
        const sx = W / doc.w, sy = H / doc.h;
        const [tl, tr, br, bl] = doc.quad.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)]);
        const ow = Math.round(Math.max(dist(tl, tr), dist(bl, br))), oh = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
        const skew = Math.max(Math.abs(tl[1] - tr[1]) / Math.max(1, ow), Math.abs(tl[0] - bl[0]) / Math.max(1, oh), Math.abs(tr[0] - br[0]) / Math.max(1, oh), Math.abs(bl[1] - br[1]) / Math.max(1, ow));
        if (ow > 50 && oh > 50) {
          if (skew > 0.02) {
            geo.push('-virtual-pixel', 'white', '-distort', 'Perspective', `${tl[0]},${tl[1]} 0,0  ${tr[0]},${tr[1]} ${ow},0  ${br[0]},${br[1]} ${ow},${oh}  ${bl[0]},${bl[1]} 0,${oh}`,
              '-crop', `${ow}x${oh}+0+0`, '+repage');
            info.perspective = true;
          } else {
            const x0 = Math.max(0, Math.min(tl[0], bl[0])), y0 = Math.max(0, Math.min(tl[1], tr[1]));
            geo.push('-crop', `${ow}x${oh}+${x0}+${y0}`, '+repage');
          }
          info.cropped = true; W = ow; H = oh;
        }
      }
    } catch { /* uten maske: hele bildet */ }

    const long = Math.max(W, H);
    let scale = 1;
    if (long < MIN_PX51) { scale = MIN_PX51 / long; info.upscaled = true; }
    else if (long > MAX_PX51) { scale = MAX_PX51 / long; info.downscaled = true; }
    const resize = scale !== 1 ? ['-resize', `${Math.round(scale * 10000) / 100}%`] : [];
    const out = join(dir, 'ocr.png');
    await T.run(im, [`${src}[0]`, '-auto-orient', ...geo, ...resize, '-colorspace', 'Gray', '-normalize', '-background', 'white', '-deskew', '40%', '+repage', '-unsharp', '0x1', '-density', '300', '-units', 'PixelsPerInch', out], { timeout: 60_000 });
    const buf = await readFile(out);
    return { buf, mime: 'image/png', size: [Math.round(W * scale), Math.round(H * scale)], preprocess: info };
  } catch { return null; } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
