// Prompt 42 (SERVER42): Finn-bilder – bare bildene fra annonsen selv, største størrelse, og ingen felles reservebilde.
// claude-code-finn-bilder.md. Brukes av finn-routes.js (parseAdHtml + fetchAd) og ved oppstart (migrering av lagrede annonser).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db, kv, OWNER } from './db.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS fh_finn_img_hash (sha1 TEXT NOT NULL, finn_id INTEGER NOT NULL, code TEXT, rel TEXT NOT NULL, PRIMARY KEY (sha1, finn_id, rel));
CREATE INDEX IF NOT EXISTS fh_finn_img_hash_s ON fh_finn_img_hash(sha1);`);

const AD_URL = /\/ads?\/|adnami|doubleclick|googlesyndication|cdn\.schibsted|banner|display|adform|adservice|\/annonser?\/|sponsored|recommend|lignende/i;
const HOST = /^images\.finncdn\.no$/i;
/** Største størrelse: …/dynamic/240w/… → …/dynamic/1280w/… */
export const bigFinnImage42 = (u) => String(u).replace(/\/dynamic\/(?:\d{2,4}w|\d{2,4}x\d{2,4}c?|default)\//, '/dynamic/1280w/');
function walk(o, out, depth = 0) {
  if (!o || depth > 12) return;
  if (Array.isArray(o)) { for (const x of o) walk(x, out, depth + 1); return; }
  if (typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (/^(images|imageList|gallery|media)$/i.test(k) && Array.isArray(v)) {
      for (const x of v) { const u = typeof x === 'string' ? x : x?.uri ?? x?.url ?? x?.src ?? x?.path; if (u) out.push({ url: u, w: x?.width ?? null, h: x?.height ?? null, description: x?.description ?? null }); }
    } else if (!/^(recommendations|similar|related|ads|banners|recommended|lignende)/i.test(k)) walk(v, out, depth + 1);
  }
}
const jsonAfter = (html, re) => {
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};
/**
 * Bildene i en Finn-annonse, i rekkefølge: 1) __NEXT_DATA__ / __remixContext (annonsens images[]), 2) JSON-LD Product.image[], 3) galleriet i markupen.
 * Ingen generell <img>-selektor. og:image tas bare med når den også står i annonsens bilder. → {images:[url], source, rejected:[{url, why}]}
 */
export function adImages42(html, code = null) {
  const rejected = [];
  let source = null, list = [];
  const next = jsonAfter(html, /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  const remix = jsonAfter(html, /window\.__remixContext\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i);
  for (const [name, j] of [['next_data', next], ['remix', remix]]) { if (list.length || !j) continue; const out = []; walk(j, out); if (out.length) { list = out.map((x) => x.url); source = name; } }
  if (!list.length) {
    for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      let j; try { j = JSON.parse(m[1]); } catch { continue; }
      for (const o of [j, ...(Array.isArray(j) ? j : []), ...(j['@graph'] ?? [])].flat()) {
        if (!o || typeof o !== 'object' || !/product/i.test(String(o['@type'] ?? '')) && !(o.name && o.offers)) continue;
        const imgs = Array.isArray(o.image) ? o.image : o.image ? [o.image] : [];
        list.push(...imgs.map((x) => (typeof x === 'string' ? x : x?.url)).filter(Boolean));
      }
    }
    if (list.length) source = 'jsonld';
  }
  if (!list.length) {
    const g = html.match(/<(?:div|section|ul)[^>]+(?:data-testid=["']image-gallery["']|aria-label=["'][^"']*bilde[^"']*["'])[^>]*>([\s\S]*?)<\/(?:div|section|ul)>/i);
    if (g) { for (const m of g[1].matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)) list.push(m[1]); source = 'dom'; }
  }
  const og = [...html.matchAll(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const o of og) if (!list.includes(o)) rejected.push({ url: o, why: 'og:image utenfor annonsens bilder' });
  const seen = new Map();
  for (const raw of list) {
    let u;
    try { u = new URL(String(raw).replace(/&amp;/g, '&'), 'https://images.finncdn.no'); } catch { rejected.push({ url: raw, why: 'ugyldig' }); continue; }
    if (u.protocol !== 'https:' || !HOST.test(u.hostname)) { rejected.push({ url: raw, why: 'annet nettsted' }); continue; }
    if (AD_URL.test(u.pathname + u.search)) { rejected.push({ url: raw, why: 'reklame' }); continue; }
    if (!/\/dynamic\//.test(u.pathname) && !(code && u.pathname.includes(code))) { rejected.push({ url: raw, why: 'ikke annonsebilde' }); continue; }
    const big = bigFinnImage42(u.toString());
    const key = new URL(big).pathname.split('/').pop();
    if (!seen.has(key)) seen.set(key, big);
  }
  return { images: [...seen.values()].slice(0, 30), source, rejected };
}
export function logFinn42(code, source, count, rejected = []) {
  try {
    const l = kv.get(OWNER, 'finn42_log', []) ?? [];
    l.unshift({ at: new Date().toISOString(), finnkode: code ?? null, kilde: source ?? 'ingen', bilder: count, forkastet: rejected.map((r) => r.why) });
    kv.set(OWNER, 'finn42_log', l.slice(0, 100));
  } catch { /* */ }
}
/** sha1 per lagret bilde; bilder som går igjen i ≥ 2 annonser med ulik finnkode, regnes som felles (reklame/stock) og fjernes fra listen. */
export async function dropShared42(f, rels, root) {
  const out = [];
  for (const rel of rels) {
    let sha = null;
    try { sha = createHash('sha1').update(await readFile(join(root, rel))).digest('hex'); } catch { out.push(rel); continue; }
    q('INSERT OR IGNORE INTO fh_finn_img_hash(sha1, finn_id, code, rel) VALUES(?,?,?,?)').run(sha, f.id, f.finn_code ?? null, rel);
    const others = q('SELECT count(DISTINCT COALESCE(code, finn_id)) FROM fh_finn_img_hash WHERE sha1=? AND finn_id<>? AND COALESCE(code, \'\')<>COALESCE(?, \'-\')').pluck().get(sha, f.id, f.finn_code ?? null);
    if (!others) out.push(rel);
  }
  return out;
}
export const sharedHashes42 = () => q('SELECT sha1 FROM fh_finn_img_hash GROUP BY sha1 HAVING count(DISTINCT COALESCE(code, finn_id)) >= 2').pluck().all();
/** Migrering: gå gjennom alle lagrede annonser, fjern bilder som er felles på tvers av annonser. → {ads, removed} */
export async function cleanStoredAds42(root, { force = false } = {}) {
  if (!force && kv.get(OWNER, 'finn42_clean_v1', false)) return { ads: 0, removed: 0, skipped: true };
  const ads = q('SELECT a.finn_id, a.images, f.finn_code FROM fh_finn_ad a JOIN fh_finn f ON f.id=a.finn_id').all();
  for (const a of ads) for (const rel of JSON.parse(a.images || '[]')) {
    try { const sha = createHash('sha1').update(await readFile(join(root, rel))).digest('hex'); q('INSERT OR IGNORE INTO fh_finn_img_hash(sha1, finn_id, code, rel) VALUES(?,?,?,?)').run(sha, a.finn_id, a.finn_code ?? null, rel); } catch { /* mangler */ }
  }
  const shared = new Set(sharedHashes42());
  let removed = 0;
  for (const a of ads) {
    const imgs = JSON.parse(a.images || '[]');
    const bad = new Set(q(`SELECT rel FROM fh_finn_img_hash WHERE finn_id=? AND sha1 IN (${[...shared].map(() => '?').join(',') || "''"})`).pluck().all(a.finn_id, ...shared));
    const keep = imgs.filter((r) => !bad.has(r) && !AD_URL.test(r));
    if (keep.length !== imgs.length) { removed += imgs.length - keep.length; q('UPDATE fh_finn_ad SET images=? WHERE finn_id=?').run(JSON.stringify(keep), a.finn_id); }
  }
  kv.set(OWNER, 'finn42_clean_v1', Date.now());
  return { ads: ads.length, removed };
}
