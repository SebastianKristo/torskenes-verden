#!/usr/bin/env node
// Laster ned bakgrunnsfotoene i catalog.js fra Wikimedia Commons til server/backgrounds/files/<nøkkel>/<slug>.webp
// (2000 px) og <slug>-1080.webp (1080 px), og skriver fotograf og lisens (Commons imageinfo/extmetadata) til
// server/backgrounds/files/credits.json. Kjøres i GitHub Actions (.github/workflows/backgrounds.yml), som har nett.
// Node 22, ingen avhengigheter. Krever ImageMagick (`magick` eller `convert`) for WebP.
//
// Valg: --only planet,oslo   bare disse nøklene   --keep   hopp over filer som allerede finnes
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { CATALOG, SIZES, bundledPath, filePathUrl, infoUrl, pageUrl, creditFromInfo, KNOWN_CREDITS } from './catalog.js';

const run = promisify(execFile);
const HERE = new URL('.', import.meta.url).pathname;
const FILES = join(HERE, 'files'), CREDITS = join(FILES, 'credits.json');
// Wikimedia krever en beskrivende User-Agent med kontaktinfo.
const UA = 'KristoHomelab/1.0 (https://kristo.no; kontakt@kristo.no) fetch-backgrounds.mjs';
const TIMEOUT = 60_000, MAX_BYTES = 40_000_000;

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ONLY = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const KEEP = args.includes('--keep');

async function get(url, accept = '*/*') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 3000 * attempt)); continue; }
      if (!r.ok) return { ok: false, status: r.status };
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_BYTES) return { ok: false, status: 413 };
      return { ok: true, buf, type: r.headers.get('content-type') ?? '' };
    } catch (e) { if (attempt === 3) return { ok: false, status: 0, error: e.message }; }
  }
  return { ok: false, status: 429 };
}
const isImage = (b) => b.length > 1000 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.toString('ascii', 8, 12) === 'WEBP');

let IM;
async function imageMagick() {
  if (IM !== undefined) return IM;
  for (const cmd of ['magick', 'convert']) { try { await run(cmd, ['-version']); return (IM = cmd); } catch { /* finnes ikke */ } }
  return (IM = null);
}

let n = 0;
async function toWebp(buf, size, dst) {
  const im = await imageMagick();
  const src = join(tmpdir(), `kristo-bg-${process.pid}-${++n}`);
  await writeFile(src, buf);
  try {
    await mkdir(dirname(dst), { recursive: true });
    await run(im, [`${src}[0]`, '-auto-orient', '-strip', '-colorspace', 'sRGB', '-resize', `${size}x${size}>`, '-quality', '80', `webp:${dst}`], { timeout: 120_000 });
  } finally { await rm(src, { force: true }); }
}

async function creditOf(file) {
  const r = await get(infoUrl(file), 'application/json');
  let c = { author: null, license: null, licenseUrl: null };
  if (r.ok) { try { c = creditFromInfo(JSON.parse(r.buf.toString('utf8'))); } catch { /* ugyldig svar */ } }
  const [kAuthor, kLicense] = KNOWN_CREDITS[file] ?? [];
  return { file, author: c.author || kAuthor || null, license: c.license || kLicense || null, licenseUrl: c.licenseUrl, source: 'Wikimedia Commons', url: pageUrl(file) };
}

if (!(await imageMagick())) { console.error('[backgrounds] ImageMagick mangler (magick eller convert).'); process.exit(1); }
await mkdir(FILES, { recursive: true });
const credits = existsSync(CREDITS) ? JSON.parse(await readFile(CREDITS, 'utf8')) : {};
let ok = 0, failed = 0;
const done = new Map(); // fil → nedlastet original (samme fil kan stå under flere nøkler)

for (const [key, files] of Object.entries(CATALOG)) {
  if (ONLY && !ONLY.includes(key)) continue;
  for (const file of files) {
    const targets = SIZES.map((s) => ({ s, path: bundledPath(FILES, key, file, s) }));
    if (KEEP && targets.every((t) => existsSync(t.path))) { ok++; continue; }
    let buf = done.get(file);
    if (!buf) {
      for (const w of [2000, 1280, null]) {
        const url = w ? filePathUrl(file, w) : filePathUrl(file).replace(/\?width=\d+$/, '');
        const r = await get(url, 'image/*');
        if (r.ok && isImage(r.buf)) { buf = r.buf; break; }
        console.warn(`  ${file} (${w ?? 'original'}): ${r.status || r.error || 'ikke et bilde'}`);
      }
    }
    if (!buf) {
      const had = await stat(targets[0].path).then((x) => x.size > 0).catch(() => false);
      console.log(`✗ ${key}/${file}${had ? ' (beholdt forrige fil)' : ''}`);
      if (!had) failed++;
      continue;
    }
    done.set(file, buf);
    try {
      for (const t of targets) await toWebp(buf, t.s, t.path);
      credits[file] ??= {};
      Object.assign(credits[file], await creditOf(file), { keys: [...new Set([...(credits[file].keys ?? []), key])], fetched: new Date().toISOString().slice(0, 10) });
      ok++;
      console.log(`✓ ${key}/${file} → ${credits[file].author ?? 'ukjent'} · ${credits[file].license ?? 'ukjent lisens'}`);
    } catch (e) { failed++; console.log(`✗ ${key}/${file}: ${e.message.split('\n')[0]}`); }
    await new Promise((r) => setTimeout(r, 500)); // vær snill mot Commons
  }
}

const sorted = Object.fromEntries(Object.entries(credits).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(CREDITS, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`\n[backgrounds] ${ok} filer klare, ${failed} feilet.`);
if (!ok) process.exit(1);
