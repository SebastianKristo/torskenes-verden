// Prompt 73 (LOGO73): «Endre logo» for en butikk i Finans – søk i hele logobiblioteket og overstyr logoen per butikk.
// Alt er per bruker. «Finansdata forlater aldri huset»: søket går bare mot det lokale logobiblioteket (server/logos) og
// logoene serveren allerede har lagret (merchant_logos + data/logos). Ingen eksterne oppslag herfra.
//
//   GET  /finans/api/logos?q=…                → [{id, name, domain, logoUrl}] (navn, alias og domene, ufølsomt for store/små
//                                                bokstaver og æ/ø/å; id = bibliotekets id eller «saved:<nøkkel>»)
//   POST /finans/api/merchants/logo/upload     → {uploadId, url}  (multipart «file»/«image», eller rått image/*; beskjæres til
//                                                kvadrat i midten, maks 512×512, lagres på serveren)
//   GET  /finans/api/merchants/:id/logo        → {key, name, logoUrl, manual, source, count}
//   PUT  /finans/api/merchants/:id/logo {logoId | uploadId | initials:true | null} → samme form. null = «Tilbakestill til
//                                                automatisk» (manuelt valg slettes, kjeden kjører på nytt neste gang)
//   GET  /finans/api/merchants/logo-overrides  → {v, items:[{key, name, logoUrl, source}], names:{«rått navn i små bokstaver»: url|""}}
//                                                (klientene bruker names til å vise overstyringen overalt i Finans; "" = initialer)
// :id er butikknavnet (URL-kodet) slik klienten viser det, eller nøkkelen fra merchant_logos. Overstyringen lagres per normalisert
// butikknavn (cleanName().key) i merchant_logos med manual=1, der manuelle valg allerede vinner i findLogo().
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bodyLimit } from 'hono/body-limit';
import { db } from './db.js';
import { cleanName, LOGO_DIR, logoFileUrl, isLogoFile } from './logo-lookup.js';
import { registry, normalize, hasFile, itemById } from '../logos/match.js';
import { ocrTools } from '../ocr-fallback.js';
import { setLogoOverride52 } from '../logos52.js';

const run = promisify(execFile);
const q = (sql) => db.prepare(sql);
const bad = (c, msg, code = 400) => c.json({ error: msg }, code);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const libUrl = (id) => `/finans/api/logos/file/${encodeURIComponent(id)}`;

/* ---------------- Søk i logobiblioteket ---------------- */

/** Poeng for ett felt: eksakt 100, prefiks 80, ord som starter med søket 60, inneholder 40. */
function score(field, nq) {
  const f = normalize(field);
  if (!f) return 0;
  if (f === nq) return 100;
  if (f.startsWith(nq)) return 80;
  if ((' ' + f).includes(' ' + nq)) return 60;
  if (f.replace(/ /g, '').includes(nq.replace(/ /g, ''))) return 40;
  return 0;
}
const domainBase = (d) => String(d ?? '').toLowerCase().replace(/^www\./, '');

/** Søk i hele logobiblioteket + brukerens lagrede logoer. Tomt søk gir bibliotekets logoer alfabetisk. */
export function searchLogos73(u, raw, limit = 40) {
  const nq = normalize(raw);
  const out = [];
  for (const it of registry().items) {
    if (it.kilde === 'bokstav') continue;
    const file = hasFile(it.id);
    let s = 0;
    if (nq) {
      for (const f of [it.navn, ...(it.alias ?? []), domainBase(it.domene)]) s = Math.max(s, score(f, nq));
      if (!s) continue;
    }
    out.push({ s: s + (file ? 5 : 0), r: { id: it.id, name: it.navn, domain: it.domene || null, logoUrl: file ? libUrl(it.id) : null } });
  }
  // Logoer serveren allerede har hentet for denne brukeren (ikke manuelle opplastinger, de er private for butikken).
  const seen = new Set(out.map((o) => normalize(o.r.name)));
  for (const r of q("SELECT key, name, domain, file, checked_at FROM merchant_logos WHERE user_id=? AND file IS NOT NULL AND file NOT LIKE 'lib:%' AND source!='none' AND manual=0").all(u)) {
    if (!isLogoFile(r.file) || !existsSync(join(LOGO_DIR, r.file))) continue;
    const name = r.name || r.key;
    if (seen.has(normalize(name))) continue;
    const s = nq ? Math.max(score(name, nq), score(r.key.replace(/-/g, ' '), nq), score(domainBase(r.domain), nq)) : 1;
    if (!s) continue;
    out.push({ s: s + 4, r: { id: `saved:${r.key}`, name, domain: r.domain || null, logoUrl: logoFileUrl(r.file, r.checked_at) } });
  }
  out.sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name, 'nb'));
  return { total: out.length, items: out.slice(0, limit).map((o) => o.r) };
}

/* ---------------- Opplasting: kvadrat i midten, maks 512×512 ---------------- */

const sniff = (b) => (b.length < 12 ? null : b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg'
  : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'webp' : b.slice(0, 3).toString() === 'GIF' ? 'gif'
  : b.slice(4, 12).toString().startsWith('ftyp') ? 'heic' : null);
const pngDims = (b) => (b.length > 24 ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null);
export const MAX_SIDE73 = 512;

/** Beskjærer til kvadrat i midten og skalerer ned til maks 512. Uten ImageMagick godtas bare PNG som allerede er kvadratisk og ≤ 512. */
export async function squareLogo73(buf) {
  const kind = sniff(buf);
  if (!kind) throw Object.assign(new Error('Bildet må være PNG, JPEG, WebP, GIF eller HEIC'), { status: 400 });
  const tl = await ocrTools().catch(() => ({}));
  if (!tl.magick) {
    const d = kind === 'png' ? pngDims(buf) : null;
    if (d && d[0] === d[1] && d[0] <= MAX_SIDE73) return buf;
    throw Object.assign(new Error('Serveren kan ikke beskjære bildet (ImageMagick mangler). Beskjær det til et kvadrat på maks 512 px.'), { status: 415 });
  }
  const dir = await mkdtemp(join(tmpdir(), 'logo73-'));
  try {
    const src = join(dir, `in.${kind}`), out = join(dir, 'out.png');
    await writeFile(src, buf);
    const { stdout } = await run(tl.magick, [`${src}[0]`, '-auto-orient', '-format', '%w %h', 'info:'], { timeout: 15_000 });
    const [w, h] = String(stdout).trim().split(/\s+/).map(Number);
    if (!(w > 0 && h > 0)) throw Object.assign(new Error('Kunne ikke lese bildet'), { status: 400 });
    const s = Math.min(w, h), t = Math.min(s, MAX_SIDE73);
    await run(tl.magick, [`${src}[0]`, '-auto-orient', '-gravity', 'center', '-crop', `${s}x${s}+0+0`, '+repage', '-resize', `${t}x${t}`, '-strip', `png:${out}`], { timeout: 20_000 });
    return await readFile(out);
  } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error('Kunne ikke lese bildet'), { status: 400 });
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// Opplastinger som ikke er tatt i bruk ennå: uploadId → {u, file, at}. Bare eieren kan bruke dem, og de utløper etter en time.
const UPLOADS = new Map();
const UPLOAD_TTL = 3600_000;
function gcUploads() { const now = Date.now(); for (const [k, v] of UPLOADS) if (now - v.at > UPLOAD_TTL) UPLOADS.delete(k); }

export async function saveUpload73(u, buf) {
  const png = await squareLogo73(buf);
  await mkdir(LOGO_DIR, { recursive: true });
  const id = randomBytes(9).toString('hex');
  const file = `m-${id}.png`;
  await writeFile(join(LOGO_DIR, file), png);
  gcUploads();
  UPLOADS.set(id, { u, file, at: Date.now() });
  return { uploadId: id, url: logoFileUrl(file) };
}

/* ---------------- Overstyring per butikk ---------------- */

const rowOf = (u, key) => q('SELECT * FROM merchant_logos WHERE user_id=? AND key=?').get(u, key);
const upsert = (u, key, v) => q(`INSERT INTO merchant_logos(key,user_id,domain,file,source,checked_at,manual,name) VALUES(@key,@u,@domain,@file,@source,@at,1,@name)
  ON CONFLICT(user_id,key) DO UPDATE SET domain=@domain, file=@file, source=@source, checked_at=@at, manual=1, name=@name`).run({ key, u, domain: v.domain ?? null, file: v.file ?? null, source: v.source, at: Date.now(), name: v.name ?? null });
const urlOfRow = (r) => (!r || r.source === 'none' ? null : r.file ? (r.file.startsWith('lib:') ? libUrl(r.file.slice(4)) : logoFileUrl(r.file, r.checked_at)) : r.domain && r.source !== 'initialer' ? `/finans/api/logo/${r.domain}` : null);

/** :id → {key, name}. Nøkkel som finnes i merchant_logos brukes som den er; ellers ryddes navnet med cleanName(). */
export function merchantKey73(u, id, name = null) {
  const raw = str(name, 120) || str(id, 120);
  if (!raw) return null;
  if (!name && /^[a-z0-9-]{1,60}$/.test(raw)) { const r = rowOf(u, raw); if (r) return { key: raw, name: r.name || raw }; }
  const c = cleanName(raw);
  return c.key ? { key: c.key, name: c.name } : null;
}

// Hvor mange kjøp nøkkelen gjelder, og navn → nøkkel for overstyringskartet. Bufres per bruker til transaksjonene endres.
const NAMES = new Map();
function namesOf(u) {
  const sig = q('SELECT count(*) n, max(id) m FROM fh_transactions WHERE user_id=?').get(u);
  const tag = `${sig.n}:${sig.m}`;
  const hit = NAMES.get(u);
  if (hit?.tag === tag) return hit;
  const keyOf = new Map(), perKey = new Map();
  const kOf = (n) => {
    const s = str(n, 120);
    if (!s) return null;
    if (keyOf.has(s)) return keyOf.get(s);
    let k = null;
    try { k = cleanName(s).key || null; } catch { /* */ }
    keyOf.set(s, k);
    return k;
  };
  // Hver transaksjon telles én gang per nøkkel (beskrivelse og butikk peker ofte på samme butikk).
  for (const r of q('SELECT description d, merchant m FROM fh_transactions WHERE user_id=?').iterate(u)) {
    for (const k of new Set([kOf(r.d), kOf(r.m)])) if (k) perKey.set(k, (perKey.get(k) ?? 0) + 1);
  }
  for (const [n, k] of keyOf) if (!k) keyOf.delete(n);
  const v = { tag, keyOf, perKey };
  NAMES.set(u, v);
  if (NAMES.size > 50) NAMES.delete(NAMES.keys().next().value);
  return v;
}
const countFor = (u, key) => namesOf(u).perKey.get(key) ?? 0;

export function logoState73(u, key, name) {
  const r = rowOf(u, key);
  return { key, name: r?.name || name, logoUrl: urlOfRow(r), manual: !!r?.manual, source: r?.source ?? null, initials: r?.source === 'initialer', count: countFor(u, key) };
}

/** Lagrer valget. body: {logoId} | {uploadId} | {initials:true} | null/{logoId:null}. */
export async function setLogo73(u, id, body) {
  const b = body && typeof body === 'object' ? body : {};
  const mk = merchantKey73(u, id, b.name ?? null);
  if (!mk) throw Object.assign(new Error('Mangler butikk'), { status: 400 });
  const { key, name } = mk;
  if (b.logoId) {
    const lid = str(b.logoId, 80);
    if (lid.startsWith('saved:')) {
      const src = rowOf(u, lid.slice(6));
      if (!src?.file || (!src.file.startsWith('lib:') && !isLogoFile(src.file))) throw Object.assign(new Error('Fant ikke logoen'), { status: 404 });
      upsert(u, key, { domain: src.domain, file: src.file, source: 'manuell', name });
    } else {
      const it = /^[a-z0-9-]{1,80}$/.test(lid) ? itemById(lid) : null;
      if (!it || !hasFile(it.id)) throw Object.assign(new Error('Fant ikke logoen i logobiblioteket'), { status: 404 });
      upsert(u, key, { domain: it.domene || null, file: `lib:${it.id}`, source: 'manuell', name });
    }
  } else if (b.uploadId) {
    gcUploads();
    const up = UPLOADS.get(str(b.uploadId, 40));
    if (!up || up.u !== u) throw Object.assign(new Error('Opplastingen finnes ikke (eller er utløpt). Last opp bildet på nytt.'), { status: 404 });
    upsert(u, key, { domain: null, file: up.file, source: 'manuell', name });
    UPLOADS.delete(str(b.uploadId, 40));
  } else if (b.initials === true) {
    upsert(u, key, { domain: null, file: null, source: 'initialer', name });
  } else {
    q('DELETE FROM merchant_logos WHERE user_id=? AND key=?').run(u, key); // tilbakestill: kjeden kjører på nytt
  }
  OV.delete(u);
  return logoState73(u, key, name);
}

// Overstyringskartet per bruker (bufres til et valg eller transaksjonene endres).
const OV = new Map();
export function overrides73(u) {
  const rows = q("SELECT key, name, domain, file, source, checked_at FROM merchant_logos WHERE user_id=? AND manual=1").all(u);
  const nm = namesOf(u);
  const tag = `${nm.tag}|${rows.map((r) => `${r.key}:${r.checked_at}`).join(',')}`;
  const hit = OV.get(u);
  if (hit?.tag === tag) return hit.body;
  const byKey = new Map(rows.map((r) => [r.key, urlOfRow(r) ?? '']));
  const names = {};
  for (const [n, k] of nm.keyOf) if (byKey.has(k)) names[n.toLowerCase()] = byKey.get(k);
  for (const r of rows) if (r.name) names[r.name.toLowerCase()] ??= byKey.get(r.key);
  const body = { v: tag.length ? Buffer.from(tag).toString('base64url').slice(-16) : '0', items: rows.map((r) => ({ key: r.key, name: r.name || r.key, logoUrl: byKey.get(r.key) || null, source: r.source })), names };
  OV.set(u, { tag, body });
  if (OV.size > 50) OV.delete(OV.keys().next().value);
  return body;
}

/** Manuell overstyring for et navn (til logos52 og andre lister): {url} der url kan være null (initialer), ellers undefined. */
export function manualFor73(u, name) {
  try {
    const k = cleanName(name).key;
    const r = k ? rowOf(u, k) : null;
    return r?.manual ? { url: urlOfRow(r) } : undefined;
  } catch { return undefined; }
}
setLogoOverride52(manualFor73);

/* ---------------- Ruter ---------------- */

export function mountLogo73(api, { R, W }) {
  api.get('/logos', R, (c) => {
    const { total, items } = searchLogos73(c.get('user'), str(c.req.query('q'), 80), Math.min(100, Math.max(1, Number(c.req.query('limit')) || 40)));
    return c.json(items, 200, { 'X-Total-Count': String(total), 'Cache-Control': 'private, no-cache' });
  });
  api.get('/merchants/logo-overrides', R, (c) => c.json(overrides73(c.get('user')), 200, { 'Cache-Control': 'private, no-cache' }));
  api.post('/merchants/logo/upload', W, bodyLimit({ maxSize: 12 * 1024 * 1024, onError: (c) => bad(c, 'Bildet kan være maks 12 MB', 413) }), async (c) => {
    let buf = null;
    const type = c.req.header('content-type') ?? '';
    if (/multipart\/form-data/i.test(type)) {
      const body = await c.req.parseBody();
      const f = body.file ?? body.image;
      if (f instanceof File && f.size) buf = Buffer.from(await f.arrayBuffer());
    } else if (/^image\//i.test(type)) buf = Buffer.from(await c.req.arrayBuffer());
    if (!buf?.length) return bad(c, 'Mangler bilde');
    try { return c.json(await saveUpload73(c.get('user'), buf)); } catch (e) { return bad(c, e.message, e.status ?? 400); }
  });
  api.get('/merchants/:id/logo', R, (c) => {
    const mk = merchantKey73(c.get('user'), c.req.param('id'), c.req.query('name') ?? null);
    if (!mk) return bad(c, 'Mangler butikk');
    return c.json(logoState73(c.get('user'), mk.key, mk.name));
  });
  api.put('/merchants/:id/logo', W, async (c) => {
    const b = await c.req.json().catch(() => null);
    try { return c.json(await setLogo73(c.get('user'), c.req.param('id'), b)); } catch (e) { return bad(c, e.message, e.status ?? 400); }
  });
}
