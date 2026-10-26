#!/usr/bin/env node
// Laster ned logoene i server/logos/registry.json til server/logos/files/<id>.png (128×128 PNG).
// Kjøres i GitHub Actions (.github/workflows/logos.yml), som har nett. Node 22, ingen avhengigheter.
//
// Kilder i prioritert rekkefølge (prompt 69):
//   1. Wikidata/Commons: oppføringer med `wikidata` (fra grow-nsi.mjs eller tidligere kjøringer). Er feltet tomt, slås
//      id-en opp via domenet (P856, SPARQL) eller navnet (wbsearchentities, nb/en, må være norsk eller ha domenet).
//      Logoen er P154 (logo image), så P8972 (small logo), så P2910 (icon), hentet som PNG fra Commons
//      Special:FilePath/<fil>?width=256 (SVG tolkes aldri her) og skalert til 128×128. Lagrer kilde «wikidata»,
//      wikidata, commonsFil og lisens (Commons LicenseShortName). Se wikimedia.mjs for User-Agent, kø og hurtigbuffer.
//   2. Ikoner fra nettstedet, der det største gyldige vinner (aldri 16 px når et større finnes):
//      /apple-touch-icon.png, /favicon.svg (bare med ImageMagick), <link rel="icon|apple-touch-icon">, ikonene i
//      manifest.json/site.webmanifest og til slutt og:image (bare kvadratisk, og bare uten ikon på minst 64 px).
//      403 respekteres: nettstedet hoppes over (ingen nytt forsøk med nettleser-headere), Wikidata/Commons dekker de fleste.
//   3. https://www.google.com/s2/favicons?sz=128&domain=<domene>
//   4. https://icons.duckduckgo.com/ip3/<domene>.ico
// Domener som deles av flere oppføringer (coop.no for Extra, Mega, Prix, Obs, Marked, Byggmix og Obs Bygg) gir favicon
// bare til den første oppføringen med domenet; de andre får logo fra Wikidata eller bokstav (kilde «bokstav»).
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
import { pathToFileURL } from 'node:url';
import { getEntities, getEntity, logoFile, domainOf, commonsPngUrl, commonsLicenses, qidForDomain, qidForName, wmGet, _setWikimediaFetch } from './wikimedia.mjs';

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
const NO_WIKIDATA = args.includes('--no-wikidata');

// Til testene: bytt ut fetch for nettsidene og Wikimedia, og slå av ImageMagick (PNG lagres da som den er).
let fetchImpl = (...a) => globalThis.fetch(...a);
export function _setFetch(f) { fetchImpl = f ?? ((...a) => globalThis.fetch(...a)); _setWikimediaFetch(f); }
export function _setImageMagick(cmd) { IM = cmd; }

/* ---------------- Hjelpere ---------------- */

const sha = (b) => createHash('sha256').update(b).digest('hex');

async function get(url, { accept = '*/*', max = MAX_BYTES } = {}) {
  const once = async (headers) => {
    try {
      const r = await fetchImpl(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      if (!r.ok) { await r.body?.cancel?.().catch(() => {}); return { ok: false, status: r.status, url: r.url || url }; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > max) return { ok: false, status: 413, url: r.url || url };
      return { ok: true, status: r.status, url: r.url || url, type: r.headers.get('content-type') ?? '', buf };
    } catch (e) { return { ok: false, status: 0, error: e.message }; }
  };
  return once({ 'User-Agent': UA, Accept: accept, 'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5' });
}

// Format og størrelse fra filhodet (PNG, JPEG, GIF, ICO, WebP, SVG). Returnerer { fmt, w, h, frame? }.
export function probe(b) {
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
    const r = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
    if (!r) continue;
    const buf = Buffer.from(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
    if (!buf.length) continue;
    GLOBE.add(sha(buf));
    const info = probe(buf);
    if (info) { const png = await toPng(buf, info); if (png) GLOBE.add(sha(png)); }
  }
  console.log(`[logos] ${GLOBE.size} kjente standardikoner (globus)`);
}

/* ---------------- Kilder: nettstedet ---------------- */

const abs = (href, base) => { try { return new URL(href.replace(/&amp;/g, '&'), base).href; } catch { return null; } };
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x != null) ?? null;
const pxOf = (sizes) => Math.max(0, ...[...String(sizes ?? '').toLowerCase().matchAll(/(\d+)x(\d+)/g)].map((m) => +m[1]));

async function manifestIcons(url) {
  const mr = await get(url, { accept: 'application/manifest+json,application/json', max: 500_000 });
  if (!mr.ok) return [];
  try {
    const out = [];
    for (const ic of JSON.parse(mr.buf.toString('utf8')).icons ?? []) {
      const u = ic.src && abs(ic.src, mr.url || url);
      if (u && !/monochrome/.test(ic.purpose ?? '')) out.push({ url: u, px: pxOf(ic.sizes) || 192, kind: 'manifest' });
    }
    return out;
  } catch { return []; }
}

// Ikoner fra forsiden: <link rel="icon|apple-touch-icon|shortcut icon">, manifest (lenket, ellers /manifest.json og
// /site.webmanifest) og og:image (merket square: true, godtas bare kvadratisk). Største først.
export async function htmlIcons(domain) {
  for (const base of [`https://${domain}/`, `https://www.${domain}/`]) {
    if (domain.startsWith('www.') && base.includes('www.www.')) continue;
    const r = await get(base, { accept: 'text/html,application/xhtml+xml', max: 4_000_000 });
    if (!r.ok || !/html/i.test(r.type)) continue;
    const html = r.buf.toString('utf8');
    const out = [];
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      const rel = (attr(tag, 'rel') ?? '').toLowerCase(), href = attr(tag, 'href');
      if (!href || !/(?:^|\s)(?:icon|apple-touch-icon(?:-precomposed)?|fluid-icon)(?:\s|$)/.test(rel)) continue;
      const sizes = (attr(tag, 'sizes') ?? '').toLowerCase();
      const px = sizes === 'any' ? 512 : pxOf(sizes);
      const url = abs(href, r.url);
      if (url) out.push({ url, px: px || (rel.includes('apple') ? 180 : /\.svg(\?|$)/i.test(href) ? 256 : 32), kind: 'html-icon' });
    }
    const man = html.match(/<link\b[^>]*rel\s*=\s*["']?manifest["']?[^>]*>/i)?.[0];
    const manHref = man && attr(man, 'href');
    const manUrls = manHref ? [abs(manHref, r.url)] : [abs('/manifest.json', r.url), abs('/site.webmanifest', r.url)];
    for (const mu of manUrls.filter(Boolean)) { const icons = await manifestIcons(mu); out.push(...icons); if (icons.length) break; }
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
      if (key !== 'og:image' && key !== 'og:image:url' && key !== 'og:image:secure_url') continue;
      const url = attr(tag, 'content') && abs(attr(tag, 'content'), r.url);
      if (url && !out.some((x) => x.url === url)) out.push({ url, px: 0, kind: 'og-image', square: true });
    }
    // Største først (og:image sist), men over 512 px er bare tregere å hente.
    return out.sort((a, b) => (a.kind === 'og-image') - (b.kind === 'og-image') || Math.min(b.px, 512) - Math.min(a.px, 512));
  }
  // Forsiden svarer ikke: prøv manifestene direkte.
  for (const mu of [`https://${domain}/site.webmanifest`, `https://${domain}/manifest.json`]) { const icons = await manifestIcons(mu); if (icons.length) return icons.sort((a, b) => Math.min(b.px, 512) - Math.min(a.px, 512)); }
  return [];
}

// Kandidatene fra nettstedet, i rekkefølgen de prøves.
async function siteSources(domain) {
  const out = [];
  for (const host of domain.startsWith('www.') ? [domain] : [domain, `www.${domain}`]) out.push({ url: `https://${host}/apple-touch-icon.png`, kind: 'apple-touch-icon' });
  if (await imageMagick()) out.push({ url: `https://${domain}/favicon.svg`, kind: 'favicon-svg' });
  for (const s of await htmlIcons(domain)) if (!out.some((x) => x.url === s.url)) out.push(s);
  return out;
}

// Ett bilde → { png, w, h, score } eller { reason }. square: avvis bilder som ikke er kvadratiske (og:image).
async function tryImage(s) {
  const r = await get(s.url, { accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8' });
  if (!r.ok) return { reason: `${s.kind}:${r.status || r.error || 'feil'}` };
  const info = probe(r.buf);
  if (!info) return { reason: `${s.kind}:ikke-bilde` };
  if (info.fmt === 'svg' && !(await imageMagick())) return { reason: `${s.kind}:svg-uten-imagemagick` };
  if (GLOBE.has(sha(r.buf))) return { reason: `${s.kind}:globus` };
  if (info.fmt !== 'svg' && info.w && (info.w < MIN || info.h < MIN)) return { reason: `${s.kind}:${info.w}px` };
  if (s.square && info.fmt !== 'svg' && (!info.w || Math.abs(info.w - info.h) > Math.max(2, info.w * 0.02))) return { reason: `${s.kind}:ikke-kvadratisk` };
  const png = await toPng(r.buf, info);
  if (!png) return { reason: `${s.kind}:convert` };
  if (GLOBE.has(sha(png))) return { reason: `${s.kind}:globus` };
  const o = probe(png);
  if (!o || o.w < MIN) return { reason: `${s.kind}:liten` };
  // Poeng: kildens egen størrelse (SVG regnes som stor). Bestemmer hvilket ikon som vinner.
  const score = info.fmt === 'svg' ? 1024 : Math.min(info.w || o.w, info.h || o.h);
  return { png, score, kind: s.kind, url: r.url || s.url };
}

const GOOD_ENOUGH = SIZE; // et ikon på minst 128 px er godt nok: slutt å lete

/** Favicon-kildene for et domene: største gyldige ikon fra nettstedet, ellers Google og DuckDuckGo. */
export async function fetchSite(domain) {
  const reasons = [];
  let best = null;
  for (const s of (await siteSources(domain)).slice(0, 10)) {
    if (s.kind === 'og-image' && best && best.score >= 64) break; // og:image bare når nettstedet mangler et brukbart ikon
    const got = await tryImage(s);
    if (got.reason) { reasons.push(got.reason); continue; }
    if (!best || got.score > best.score) best = got;
    if (best.score >= GOOD_ENOUGH) break;
  }
  if (best) return best;
  for (const s of [
    { url: `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}`, kind: 'google' },
    { url: `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`, kind: 'duckduckgo' },
  ]) {
    const got = await tryImage(s);
    if (got.png) return got;
    reasons.push(got.reason);
  }
  return { reasons };
}

/* ---------------- Kilde: Wikidata/Commons ---------------- */

/** Wikidata-id for oppføringen: feltet, ellers via domenet (P856) eller navnet. shared: domenet deles med andre oppføringer. */
export async function resolveQid(item, { shared = false } = {}) {
  if (item.wikidata) return item.wikidata;
  if (item.domene && !shared) { const q = await qidForDomain(item.domene); if (q) return q; }
  return qidForName(item.navn, { domain: shared ? '' : item.domene });
}

/** Logo fra Wikidata (P154 → P8972 → P2910) som PNG fra Commons. → { png, kind: 'wikidata', qid, file, prop, url } eller { qid?, reasons }. */
export async function fetchWikidata(item, opts = {}) {
  const qid = await resolveQid(item, opts);
  if (!qid) return { reasons: ['wikidata:ingen-id'] };
  const e = await getEntity(qid);
  if (!e) return { reasons: ['wikidata:ukjent-id'] };
  const realQ = e.id ?? qid;
  const lf = logoFile(e);
  if (!lf) return { qid: realQ, entity: e, reasons: ['wikidata:ingen-logo'] };
  const url = commonsPngUrl(lf.file, 256);
  const r = await wmGet(url, { as: 'buf' });
  if (!r.ok) return { qid: realQ, entity: e, reasons: [`wikidata:commons-${r.status || r.error || 'feil'}`] };
  const info = probe(r.buf);
  // Special:FilePath med width gir PNG (eller JPEG for foto); SVG godtas bare via ImageMagick.
  if (!info || (info.fmt === 'svg' && !(await imageMagick()))) return { qid: realQ, entity: e, reasons: ['wikidata:ikke-bilde'] };
  if (info.fmt !== 'svg' && info.w && (info.w < MIN || info.h < MIN)) return { qid: realQ, entity: e, reasons: [`wikidata:${info.w}px`] };
  const png = await toPng(r.buf, info);
  if (!png) return { qid: realQ, entity: e, reasons: ['wikidata:convert'] };
  return { png, kind: 'wikidata', qid: realQ, entity: e, file: lf.file, prop: lf.prop, url: r.url || url };
}

/* ---------------- Manuelle logoer ---------------- */

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
  for (const s of (await htmlIcons(host)).filter((x) => x.kind !== 'og-image').slice(0, 6)) {
    const x = await get(s.url, { accept: 'image/*' });
    if (!x.ok) continue;
    const got = await tryImg(x.buf, 'manuell', s.url);
    if (got) return got;
  }
  return { reasons: ['src:fant ikke ikon på merkevaresiden'] };
}

/* ---------------- Hovedløkke ---------------- */

export function serialize(reg) {
  return `{\n  "version": ${JSON.stringify(reg.version)},\n  "note": ${JSON.stringify(reg.note ?? '')},\n  "items": [\n${reg.items.map((x) => '    ' + JSON.stringify(x)).join(',\n')}\n  ]\n}\n`;
}

/** Domener som deles: domene → id-en til den første oppføringen (ikke manuell, ikke bokstav) som har det. */
export function domainOwners(items) {
  const count = new Map(), owner = new Map();
  for (const it of items) if (it.domene) count.set(it.domene, (count.get(it.domene) ?? 0) + 1);
  for (const it of items) if (it.domene && count.get(it.domene) > 1 && !owner.has(it.domene) && it.kilde !== 'bokstav' && it.kilde !== 'manuell') owner.set(it.domene, it.id);
  for (const it of items) if (it.domene && count.get(it.domene) > 1 && !owner.has(it.domene)) owner.set(it.domene, null);
  return owner;
}

/**
 * Henter logoen for én oppføring (ikke manuell). Endrer oppføringen (fil, kilde, hentet, wikidata, commonsFil, domene).
 * → { status: 'got' | 'kept' | 'missing' | 'letter', kind?, url?, reasons? }
 */
export async function processItem(it, { filesDir = FILES, owners = new Map(), wikidata = !NO_WIKIDATA, keep = KEEP } = {}) {
  const file = join(filesDir, `${it.id}.png`);
  if (keep && existsSync(file) && it.kilde !== 'bokstav') return { status: 'kept' };
  const shared = owners.has(it.domene) && owners.get(it.domene) !== it.id;
  const reasons = [];
  const save = async (png, extra) => { await writeFile(file, png); Object.assign(it, { fil: `${it.id}.png`, hentet: today, ...extra }); };
  // 1. Wikidata/Commons.
  if (wikidata) {
    const w = await fetchWikidata(it, { shared });
    if (w.qid && !it.wikidata) it.wikidata = w.qid;
    if (w.entity && !it.domene) { const d = domainOf(w.entity); if (d) it.domene = d; }
    if (w.png) {
      await save(w.png, { kilde: 'wikidata', wikidata: w.qid, commonsFil: w.file });
      return { status: 'got', kind: 'wikidata', url: w.url };
    }
    reasons.push(...w.reasons);
  }
  // 2–4. Favicon-kildene, bare når domenet er oppføringens eget.
  if (it.domene && !shared && it.kilde !== 'bokstav') {
    const r = await fetchSite(it.domene);
    if (r.png) {
      await save(r.png, { kilde: r.kind });
      delete it.commonsFil; delete it.lisens;
      return { status: 'got', kind: r.kind, url: r.url };
    }
    reasons.push(...r.reasons);
  }
  // Behold en tidligere nedlastet fil hvis den finnes.
  const had = it.kilde !== 'bokstav' && await stat(file).then((x) => x.size > 0).catch(() => false);
  if (had) return { status: 'kept', reasons };
  if (shared || it.kilde === 'bokstav') { it.kilde = 'bokstav'; it.hentet = ''; return { status: 'letter', reasons }; }
  if (!it.domene) { if (it.kilde !== 'nsi') it.kilde = ''; it.hentet = ''; return { status: 'letter', reasons }; }
  it.kilde = ''; it.hentet = '';
  return { status: 'missing', reasons };
}

async function main() {
  const reg = JSON.parse(await readFile(REG, 'utf8'));
  await mkdir(FILES, { recursive: true });
  await mkdir(MANUAL, { recursive: true });
  await imageMagick();
  await learnGlobes();

  let todo = reg.items.filter((x) => (!ONLY || ONLY.includes(x.id)));
  todo = todo.slice(0, LIMIT);
  const owners = domainOwners(reg.items);
  // Alle kjente Wikidata-id-er i bunker på 50 før arbeiderne starter (hurtigbufret i wikimedia.mjs).
  if (!NO_WIKIDATA) await getEntities(todo.filter((x) => x.kilde !== 'manuell').map((x) => x.wikidata).filter(Boolean));
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
      const r = await processItem(it, { owners });
      if (r.status === 'got') { got.push(it); console.log(`✓ ${it.id.padEnd(24)} ${r.kind.padEnd(16)} ${r.url}`); }
      else if (r.status === 'kept') { got.push(it); if (r.reasons) console.log(`= ${it.id.padEnd(24)} beholdt forrige fil (${r.reasons.join(', ')})`); }
      else if (r.status === 'letter') letters.push(it);
      else { missing.push({ it, reasons: r.reasons }); console.log(`✗ ${it.id.padEnd(24)} ${r.reasons.join(', ')}`); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Lisensen fra Commons for logoene som kom derfra.
  const fromCommons = reg.items.filter((x) => x.kilde === 'wikidata' && x.commonsFil);
  if (fromCommons.length) {
    const lic = await commonsLicenses(fromCommons.map((x) => x.commonsFil));
    for (const x of fromCommons) { const l = lic.get(x.commonsFil); if (l) x.lisens = l; }
  }

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
  const fromWd = reg.items.filter((x) => x.kilde === 'wikidata').length;
  const share = got.length / Math.max(1, got.length + missing.length);
  console.log(`\n[logos] ${got.length} av ${got.length + missing.length} med domene har logo (${(share * 100).toFixed(1)} %), ${fromWd} fra Wikidata/Commons, ${letters.length} bruker bokstav.`);
  if (share < 0.95) console.warn('[logos] Under 95 % – se missing.txt.');
}

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
