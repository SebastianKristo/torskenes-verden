// Prompt 50 (SRVMEDIA50, claude-code-media-bilder-raskt.md): ThumbHash i ren JS (samme format som evanw/thumbhash, MIT).
// Serveren regner hashen fra et lite RGBA-uttrekk (≤ 100 × 100, laget med ImageMagick), klientene tegner en uskarp
// plassholder i plakatens farger fra de ~25 bytene før det ekte bildet er lastet. Dekoderen ligger i public/js/thumbhash50.js.

/** RGBA (Uint8Array/Buffer, w × h × 4) → ThumbHash (Uint8Array). */
export function rgbaToThumbHash50(w, h, rgba) {
  if (w > 100 || h > 100 || w < 1 || h < 1) throw new Error(`${w}x${h} passer ikke i 100x100`);
  const { PI, round, max, cos, abs } = Math;
  let avgR = 0, avgG = 0, avgB = 0, avgA = 0;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const alpha = rgba[j + 3] / 255;
    avgR += (alpha / 255) * rgba[j];
    avgG += (alpha / 255) * rgba[j + 1];
    avgB += (alpha / 255) * rgba[j + 2];
    avgA += alpha;
  }
  if (avgA) { avgR /= avgA; avgG /= avgA; avgB /= avgA; }
  const hasAlpha = avgA < w * h;
  const lLimit = hasAlpha ? 5 : 7;
  const lx = max(1, round((lLimit * w) / max(w, h)));
  const ly = max(1, round((lLimit * h) / max(w, h)));
  const l = [], p = [], q = [], a = [];
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const alpha = rgba[j + 3] / 255;
    const r = avgR * (1 - alpha) + (alpha / 255) * rgba[j];
    const g = avgG * (1 - alpha) + (alpha / 255) * rgba[j + 1];
    const b = avgB * (1 - alpha) + (alpha / 255) * rgba[j + 2];
    l[i] = (r + g + b) / 3;
    p[i] = (r + g) / 2 - b;
    q[i] = r - g;
    a[i] = alpha;
  }
  const encodeChannel = (channel, nx, ny) => {
    let dc = 0, scale = 0;
    const ac = [], fx = [];
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = 0; cx * ny < nx * (ny - cy); cx++) {
        let f = 0;
        for (let x = 0; x < w; x++) fx[x] = cos((PI / w) * cx * (x + 0.5));
        for (let y = 0; y < h; y++) {
          const fy = cos((PI / h) * cy * (y + 0.5));
          for (let x = 0; x < w; x++) f += channel[x + y * w] * fx[x] * fy;
        }
        f /= w * h;
        if (cx || cy) { ac.push(f); scale = max(scale, abs(f)); } else dc = f;
      }
    }
    if (scale) for (let i = 0; i < ac.length; i++) ac[i] = 0.5 + (0.5 / scale) * ac[i];
    return [dc, ac, scale];
  };
  const [lDc, lAc, lScale] = encodeChannel(l, max(3, lx), max(3, ly));
  const [pDc, pAc, pScale] = encodeChannel(p, 3, 3);
  const [qDc, qAc, qScale] = encodeChannel(q, 3, 3);
  const [aDc, aAc, aScale] = hasAlpha ? encodeChannel(a, 5, 5) : [];
  const isLandscape = w > h;
  const header24 = round(63 * lDc) | (round(31.5 + 31.5 * pDc) << 6) | (round(31.5 + 31.5 * qDc) << 12) | (round(31 * lScale) << 18) | ((hasAlpha ? 1 : 0) << 23);
  const header16 = (isLandscape ? ly : lx) | (round(63 * pScale) << 3) | (round(63 * qScale) << 9) | ((isLandscape ? 1 : 0) << 15);
  const hash = [header24 & 255, (header24 >> 8) & 255, header24 >> 16, header16 & 255, header16 >> 8];
  const acStart = hasAlpha ? 6 : 5;
  let acIndex = 0;
  if (hasAlpha) hash.push(round(15 * aDc) | (round(15 * aScale) << 4));
  for (const ac of hasAlpha ? [lAc, pAc, qAc, aAc] : [lAc, pAc, qAc]) {
    for (const f of ac) {
      const k = acStart + (acIndex >> 1);
      hash[k] = (hash[k] ?? 0) | (round(15 * f) << ((acIndex++ & 1) << 2));
    }
  }
  return new Uint8Array(hash);
}

/** Bytes → base64 (det som sendes i liste-API-ene). */
export const thumbHashB64_50 = (bytes) => Buffer.from(bytes).toString('base64');
