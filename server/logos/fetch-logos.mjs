#!/usr/bin/env node
// Laster ned logoene i server/logos/registry.json til server/logos/files/<id>.png (128×128 PNG).
// Kjøres i GitHub Actions (.github/workflows/logos.yml), som har nett. Node 22, ingen avhengigheter.
//
// Kilder i prioritert rekkefølge:
//   1. https://<domene>/apple-touch-icon.png (også www.)
//   2. største <link rel="icon">/apple-touch-icon eller manifest-ikon fra forsiden
//   3. https://www.google.com/s2/favicons?sz=128&domain=<domene>
//   4. https://icons.duckduckgo.com/ip3/<domene>.ico
// Ikoner under 32 px og generiske «globus»-ikoner (hash mot standardikonet) avvises. Med ImageMagick
// (`magick` eller `convert`) skaleres alt til 128×128 PNG med gjennomsiktig bakgrunn; uten den lagres bare PNG-er som de er.
// Det som mangler, skrives til missing.txt. kilde/hentet oppdateres i registeret.
//
// Valg: --only id1,id2   bare disse   --limit N   bare de N første   --keep   hopp over oppføringer som allerede har fil
//
// Prompt 22: oppføringer med kilde «manuell» (fraktselskapene) har en eksplisitt src-URL (Wikimedia Commons
// Special:FilePath eller merkevaresiden). De hentes bare fra src, lagres i files/manuell/<id>.png og overskrives
// aldri fra favicon-kildene. Feiler src, beholdes forrige kontrollerte fil. Til slutt lages preview.html med alle
// logoene i et rutenett, som skal ses over før commit.
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const HERE = new URL('.', import.meta.url).pathname;
const REG = join(HERE, 'registry.json'), FILES = join(HERE, 'files'), MISSING = join(HERE, 'missing.txt');
const MANUAL = join(FILES, 'manuell'), PREVIEW = join(HERE, 'preview.html');
const UA = 'Mozilla/5.0 (compatible; KristoHomelab-logos/1.0; +https://kristo.no) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MIN = 32, SIZE = 128, CONCURRENCY = 8, TIMEOUT = 12_000, MAX_BYTES = 3_000_000;
const today = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ONLY = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const LIMIT = Number(opt('--limit')) || Infinity;
const KEEP = args.includes('--keep');

/* ---------------- Hjelpere ---------------- */

const sha = (b) => createHash('sha256').update(b).digest('hex');

async function get(url, { accept = '*/*', max = MAX_BYTES } = {}) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) { await r.body?.cancel().catch(() => {}); return { ok: false, status: r.status, url: r.url }; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) return { ok: false, status: 413, url: r.url };
    return { ok: true, status: r.status, url: r.url, type: r.headers.get('content-type') ?? '', buf };
  } catch (e) { return { ok: false, status: 0, error: e.message }; }
}

// Format og størrelse fra filhodet (PNG, JPEG, GIF, ICO, WebP, SVG). Returnerer { fmt, w, h, frame? }.
function probe(b) {
  if (!b || b.length < 12) return null;
  if (b.readUInt32BE(0) === 0x89504e47) return { fmt: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { fmt: 'gif', w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1) {
    const n = b.readUInt16LE(4); let best = null;
    for (let i = 0; i < n && 6 + i * 16 + 16 <= b.length; i++) {
      const o = 6 + i * 16, w = b[o] || 256, h = b[o + 1] || 256;
      let rw = w, rh = h;
      // PNG inne i ICO: les ekte størrelse.
      const off = b.readUInt32LE(o + 12);
      if (off + 24 <= b.length && b.readUInt32BE(off) === 0x89504e47) { rw = b.readUInt32BE(off + 16); rh = b.readUInt32BE(off + 20); }
      if (!best || rw * rh > best.w * best.h) best = { fmt: 'ico', w: rw, h: rh, frame: i };
    }
    return best;
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return { fmt: 'webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (k === 'VP8 ') return { fmt: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return { fmt: 'webp', w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    return { fmt: 'webp', w: 0, h: 0 };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { fmt: 'jpg', w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return { fmt: 'jpg', w: 0, h: 0 };
  }
  const head = b.toString('utf8', 0, Math.min(b.length, 2000)).trim();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return { fmt: 'svg', w: 1024, h: 1024 };
  return null;
}

/* ---------------- ImageMagick ---------------- */

let IM = undefined;
async function imageMagick() {
  if (IM !== undefined) return IM;
  for (const cmd of ['magick', 'convert']) {
    try { await run(cmd, ['-version']); IM = cmd; return IM; } catch { /* finnes ikke */ }
  }
  IM = null;
  console.warn('[logos] ImageMagick mangler: bare PNG-er lagres, uten skalering.');
  return IM;
}
let n = 0;
async function toPng(buf, info) {
  const im = await imageMagick();
  if (!im) return info.fmt === 'png' ? buf : null;
  const dir = join(tmpdir(), 'kristo-logos');
  await mkdir(dir, { recursive: true });
  const src = join(dir, `in-${process.pid}-${++n}.${info.fmt}`), dst = join(dir, `out-${process.pid}-${n}.png`);
  await writeFile(src, buf);
  try {
    const input = info.fmt === 'ico' ? `${src}[${info.frame ?? 0}]` : info.fmt === 'gif' ? `${src}[0]` : src;
    const pre = info.fmt === 'svg' ? ['-background', 'none', '-density', '384'] : ['-background', 'none'];
    await run(im, [...pre, input, '-alpha', 'on', '-resize', `${SIZE}x${SIZE}`, '-gravity', 'center', '-extent', `${SIZE}x${SIZE}`, '-strip', `PNG32:${dst}`], { timeout: 30_000 });
    return await readFile(dst);
  } catch (e) { console.warn('[logos] convert feilet:', e.message.split('\n')[0]); return null; }
  finally { await rm(src, { force: true }); await rm(dst, { force: true }); }
}

/* ---------------- Globus-ikoner ---------------- */
// Google og DuckDuckGo gir et standardikon (globus) for ukjente domener. Hashene hentes ved oppstart fra et
// domene som ikke finnes, både som rådata og etter skalering, og sammenlignes med hvert treff.
const GLOBE = new Set();
async function learnGlobes() {
  const fake = `ingen-logo-${Date.now().toString(36)}.invalid`;
  for (const url of [`https://www.google.com/s2/favicons?sz=128&domain=${fake}`, `https://www.google.com/s2/favicons?sz=64&domain=${fake}`, `https://www.google.com/s2/favicons?domain=${fake}`, `https://icons.duckduckgo.com/ip3/${fake}.ico`]) {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
    if (!r) continue;
    const buf = Buffer.from(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
    if (!buf.length) continue;
    GLOBE.add(sha(buf));
    const info = probe(buf);
    if (info) { const png = await toPng(buf, info); if (png) GLOBE.add(sha(png)); }
  }
  console.log(`[logos] ${GLOBE.size} kjente standardikoner (globus)`);
}

/* ---------------- Kilder ---------------- */

const abs = (href, base) => { try { return new URL(href.replace(/&amp;/g, '&'), base).href; } catch { return null; } };
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x != null) ?? null;

// Ikoner fra forsiden: <link rel="icon|apple-touch-icon|shortcut icon|mask-icon"> og manifest.json, største først.
async function htmlIcons(domain) {
  for (const base of [`https://${domain}/`, `https://www.${domain}/`]) {
    if (domain.startsWith('www.') && base.includes('www.www.')) continue;
    const r = await get(base, { accept: 'text/html', max: 4_000_000 });
    if (!r.ok || !/html/i.test(r.type)) continue;
    const html = r.buf.toString('utf8');
    const out = [];
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      const rel = (attr(tag, 'rel') ?? '').toLowerCase(), href = attr(tag, 'href');
      if (!href || !/(?:^|\s)(?:icon|apple-touch-icon(?:-precomposed)?|fluid-icon)(?:\s|$)/.test(rel)) continue;
      const sizes = (attr(tag, 'sizes') ?? '').toLowerCase();
      const px = sizes === 'any' ? 512 : Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map((m) => +m[1]));
      const url = abs(href, r.url);
      if (url) out.push({ url, px: px || (rel.includes('apple') ? 180 : /\.svg(\?|$)/i.test(href) ? 256 : 32), kind: 'html-icon' });
    }
    const man = html.match(/<link\b[^>]*rel\s*=\s*["']?manifest["']?[^>]*>/i)?.[0];
    const manHref = man && attr(man, 'href');
    if (manHref) {
      const mu = abs(manHref, r.url), mr = mu && await get(mu, { accept: 'application/manifest+json,application/json', max: 500_000 });
      if (mr?.ok) {
        try {
          for (const ic of JSON.parse(mr.buf.toString('utf8')).icons ?? []) {
            const px = Math.max(0, ...[...String(ic.sizes ?? '').matchAll(/(\d+)x(\d+)/g)].map((m) => +m[1]));
            const url = ic.src && abs(ic.src, mu);
            if (url && !/monochrome/.test(ic.purpose ?? '')) out.push({ url, px: px || 192, kind: 'manifest' });
          }
        } catch { /* ugyldig manifest */ }
      }
    }
    // Største først, men over 512 px er bare tregere å hente.
    return out.sort((a, b) => Math.min(b.px, 512) - Math.min(a.px, 512));
  }
  return [];
}

async function* sources(domain) {
  for (const host of domain.startsWith('www.') ? [domain] : [domain, `www.${domain}`]) {
    yield { url: `https://${host}/apple-touch-icon.png`, kind: 'apple-touch-icon' };
  }
  for (const s of (await htmlIcons(domain)).slice(0, 6)) yield s;
  yield { url: `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}`, kind: 'google' };
  yield { url: `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`, kind: 'duckduckgo' };
}

async function fetchOne(item) {
  const reasons = [];
  for await (const s of sources(item.domene)) {
    const r = await get(s.url, { accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8' });
    if (!r.ok) { reasons.push(`${s.kind}:${r.status || r.error || 'feil'}`); continue; }
    const info = probe(r.buf);
    if (!info) { reasons.push(`${s.kind}:ikke-bilde`); continue; }
    if (GLOBE.has(sha(r.buf))) { reasons.push(`${s.kind}:globus`); continue; }
    if (info.fmt !== 'svg' && info.w && (info.w < MIN || info.h < MIN)) { reasons.push(`${s.kind}:${info.w}px`); continue; }
    const png = await toPng(r.buf, info);
    if (!png) { reasons.push(`${s.kind}:convert`); continue; }
    if (GLOBE.has(sha(png))) { reasons.push(`${s.kind}:globus`); continue; }
    const out = probe(png);
    if (!out || out.w < MIN) { reasons.push(`${s.kind}:liten`); continue; }
    return { png, kind: s.kind, url: s.url };
  }
  return { reasons };
}

// Manuell logo: src er enten selve bildet (Commons Special:FilePath) eller merkevaresiden (største ikon derfra).
async function fetchManual(item) {
  if (!item.src) return { reasons: ['mangler src'] };
  const r = await get(item.src, { accept: 'image/svg+xml,image/png,image/*,text/html;q=0.8' });
  if (!r.ok) return { reasons: [`src:${r.status || r.error || 'feil'}`] };
  const tryImg = async (buf, kind, url) => {
    const info = probe(buf);
    if (!info) return null;
    if (info.fmt !== 'svg' && info.w && (info.w < MIN || info.h < MIN)) return null;
    const png = await toPng(buf, info);
    return png ? { png, kind, url } : null;
  };
  const direct = await tryImg(r.buf, 'manuell', r.url);
  if (direct) return direct;
  if (!/html/i.test(r.type)) return { reasons: ['src:ikke-bilde'] };
  const host = new URL(r.url).hostname.replace(/^www\./, '');
  for (const s of (await htmlIcons(host)).slice(0, 6)) {
    const x = await get(s.url, { accept: 'image/*' });
    if (!x.ok) continue;
    const got = await tryImg(x.buf, 'manuell', s.url);
    if (got) return got;
  }
  return { reasons: ['src:fant ikke ikon på merkevaresiden'] };
}

/* ---------------- Hovedløkke ---------------- */

function serialize(reg) {
  return `{\n  "version": ${JSON.stringify(reg.version)},\n  "note": ${JSON.stringify(reg.note ?? '')},\n  "items": [\n${reg.items.map((x) => '    ' + JSON.stringify(x)).join(',\n')}\n  ]\n}\n`;
}

const reg = JSON.parse(await readFile(REG, 'utf8'));
await mkdir(FILES, { recursive: true });
await mkdir(MANUAL, { recursive: true });
await imageMagick();
await learnGlobes();

let todo = reg.items.filter((x) => (!ONLY || ONLY.includes(x.id)));
todo = todo.slice(0, LIMIT);
const missing = [], got = [], letters = [];
let i = 0;
async function worker() {
  while (i < todo.length) {
    const it = todo[i++];
    if (it.kilde === 'manuell') {
      const mf = join(MANUAL, `${it.id}.png`);
      if (KEEP && existsSync(mf)) { got.push(it); continue; }
      const r = await fetchManual(it);
      if (r.png) { await writeFile(mf, r.png); it.hentet = today; got.push(it); console.log(`✓ ${it.id.padEnd(24)} manuell        ${r.url}`); continue; }
      const had = await stat(mf).then((x) => x.size > 0).catch(() => false);
      if (had) { got.push(it); console.log(`= ${it.id.padEnd(24)} beholdt kontrollert fil (${r.reasons.join(', ')})`); continue; }
      missing.push({ it, reasons: r.reasons }); // kilde forblir «manuell»: klientene viser fargefyll med navnet
      console.log(`✗ ${it.id.padEnd(24)} manuell: ${r.reasons.join(', ')}`);
      continue;
    }
    const file = join(FILES, `${it.id}.png`);
    if (it.kilde === 'bokstav' || !it.domene) { letters.push(it); continue; } // felles favicon (Coop-kjedene) eller ukjent domene
    if (KEEP && existsSync(file)) { got.push(it); continue; }
    const r = await fetchOne(it);
    if (r.png) {
      await writeFile(file, r.png);
      Object.assign(it, { fil: `${it.id}.png`, kilde: r.kind, hentet: today });
      got.push(it);
      console.log(`✓ ${it.id.padEnd(24)} ${r.kind.padEnd(16)} ${r.url}`);
    } else {
      // Behold en tidligere nedlastet fil hvis den finnes; ellers står oppføringen i missing.txt.
      const had = await stat(file).then((s) => s.size > 0).catch(() => false);
      if (had) { got.push(it); console.log(`= ${it.id.padEnd(24)} beholdt forrige fil (${r.reasons.join(', ')})`); continue; }
      it.kilde = ''; it.hentet = '';
      missing.push({ it, reasons: r.reasons });
      console.log(`✗ ${it.id.padEnd(24)} ${r.reasons.join(', ')}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

reg.version = today;
await writeFile(REG, serialize(reg));
const lines = [
  `# Logoer som mangler (${today}). Generert av server/logos/fetch-logos.mjs.`,
  `# ${got.length} hentet, ${missing.length} mangler, ${letters.length} bruker bokstav (felles favicon eller ukjent domene).`,
  ...missing.sort((a, b) => a.it.id.localeCompare(b.it.id)).map(({ it, reasons }) => `${it.id}\t${it.navn}\t${it.domene}\t${reasons.join(', ')}`),
  ...letters.sort((a, b) => a.id.localeCompare(b.id)).map((it) => `${it.id}\t${it.navn}\t${it.domene || '-'}\tbokstav`),
];
await writeFile(MISSING, lines.join('\n') + '\n');
await writeFile(PREVIEW, previewHtml(reg.items));
console.log(`[logos] ${PREVIEW} – se over logoene før commit.`);
const share = got.length / Math.max(1, got.length + missing.length);
console.log(`\n[logos] ${got.length} av ${got.length + missing.length} med domene har logo (${(share * 100).toFixed(1)} %), ${letters.length} bruker bokstav.`);
if (share < 0.95) console.warn('[logos] Under 95 % – se missing.txt.');

/* ---------------- Visuell sjekk (preview.html) ---------------- */
// Alle logoene i et rutenett (manuelle først). Mangler filen, vises fargefyll med navnet, slik klientene gjør.
function previewHtml(items) {
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const sorted = [...items].sort((a, b) => (b.kilde === 'manuell') - (a.kilde === 'manuell') || a.id.localeCompare(b.id));
  const cell = (it) => {
    const rel = it.kilde === 'manuell' ? `files/manuell/${it.id}.png` : `files/${it.id}.png`;
    const has = existsSync(join(HERE, rel));
    const img = has ? `<img src="${esc(rel)}" alt="">` : `<span class="fill" style="background:${esc(it.farge || '#3A4252')}">${esc(it.navn)}</span>`;
    return `<figure class="${it.kilde === 'manuell' ? 'man' : ''}">${img}<figcaption><b>${esc(it.navn)}</b><br>${esc(it.id)} · ${esc(it.kilde || 'mangler')}${it.src ? `<br><a href="${esc(it.src)}">src</a>` : ''}</figcaption></figure>`;
  };
  return `<!doctype html><meta charset="utf-8"><title>Logobibliotek</title>
<style>body{font:13px system-ui,sans-serif;margin:16px;background:#f3efe6;color:#1b1a17}h1{font-size:18px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #d8d1c2;border-radius:14px;padding:10px;text-align:center}figure.man{outline:2px solid #2f7a4f}
img,.fill{width:64px;height:64px;object-fit:contain;display:inline-grid;place-items:center;border-radius:12px;color:#fff;font-weight:700;font-size:11px;overflow:hidden}
figcaption{margin-top:6px;color:#7a7468;word-break:break-word}</style>
<h1>Logobibliotek · ${items.length} oppføringer · ${today}</h1><p>Grønn ramme = manuelt kontrollert (kilde «manuell»). Se over før commit.</p>
<div class="g">${sorted.map(cell).join('')}</div>
`;
}
