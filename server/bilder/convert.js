// Prompt 50 (SRVCHAT50): bildeverktøy for chat-vedlegg og «Les på nytt» av kvitteringer.
//   - toJpeg50(buf, max)   → nedskalert JPEG (lengste side max px, kvalitet 85, rotert etter EXIF, uten metadata). Originalen røres ikke.
//   - thumbWebp50(buf)     → miniatyr (maks 480 px, WebP) til chat-historikken, med bredde og høyde.
// Skaleres med ImageMagick (`magick`/`convert`, finnes i Docker-imaget). Mangler den, eller feiler den, svarer funksjonene null,
// og kallet bruker originalen (JS-reserve: send originalen). Ingen nye npm-avhengigheter.
import { spawn, execFile } from 'node:child_process';

const T = { cmd: undefined, run: null };
/** Tester: {cmd:'convert'|null} overstyrer oppslaget, {run:(args, input) => Buffer} overstyrer kjøringen. */
export const _setImg50 = (o = {}) => { if ('cmd' in o) T.cmd = o.cmd; if ('run' in o) T.run = o.run; };

export async function magick50() {
  if (T.cmd !== undefined) return T.cmd;
  for (const cmd of ['magick', 'convert']) {
    if (await new Promise((r) => execFile(cmd, ['-version'], { timeout: 5000 }, (e) => r(!e)))) return (T.cmd = cmd);
  }
  return (T.cmd = null);
}

function runMagick(cmd, args, input, timeout = 30_000) {
  if (T.run) return Promise.resolve(T.run(args, input));
  return new Promise((resolve) => {
    let p;
    try { p = spawn(cmd, args, { timeout }); } catch { resolve(null); return; }
    const out = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', () => {});
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 ? Buffer.concat(out) : null));
    p.stdin.on('error', () => {});
    p.stdin.end(input);
  });
}

/** Bildetype fra innholdet (ikke fra klientens påstand). */
export function sniffImage50(buf) {
  const b = buf ?? Buffer.alloc(0);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const a = (s, e) => b.subarray(s, e).toString('latin1');
  if (a(0, 4) === 'RIFF' && a(8, 12) === 'WEBP') return 'image/webp';
  if (a(0, 4) === 'GIF8') return 'image/gif';
  if (a(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|heif)$/.test(a(8, 12))) return 'image/heic';
  if (a(0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** Bredde og høyde fra et WebP-hode (VP8, VP8L, VP8X). → {w, h} | null */
export function webpSize50(b) {
  if (!b || b.length < 30 || b.subarray(0, 4).toString('latin1') !== 'RIFF' || b.subarray(8, 12).toString('latin1') !== 'WEBP') return null;
  const kind = b.subarray(12, 16).toString('latin1');
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  return null;
}
/** Bredde og høyde fra et JPEG- eller PNG-hode. → {w, h} | null */
export function imageSize50(b) {
  if (!b?.length) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b.length > 24) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  return webpSize50(b);
}

/** Nedskalert JPEG til modellen. → {buf, mime:'image/jpeg', resized:true, w, h} | null (bruk originalen). */
export async function toJpeg50(buf, max = 2048, quality = 85) {
  const cmd = await magick50();
  if (!cmd || !buf?.length) return null;
  const out = await runMagick(cmd, ['-', '-auto-orient', '-resize', `${max}x${max}>`, '-strip', '-quality', String(quality), 'jpg:-'], buf, 45_000);
  if (!out?.length || sniffImage50(out) !== 'image/jpeg') return null;
  return { buf: out, mime: 'image/jpeg', resized: true, ...(imageSize50(out) ?? {}) };
}

/** Miniatyr (maks 480 px, WebP). → {buf, mime:'image/webp', w, h} | null (bruk originalen). */
export async function thumbWebp50(buf, max = 480, quality = 78) {
  const cmd = await magick50();
  if (!cmd || !buf?.length) return null;
  const out = await runMagick(cmd, ['-', '-auto-orient', '-resize', `${max}x${max}>`, '-strip', '-quality', String(quality), 'webp:-'], buf, 30_000);
  if (!out?.length || sniffImage50(out) !== 'image/webp') return null;
  return { buf: out, mime: 'image/webp', ...(webpSize50(out) ?? {}) };
}
