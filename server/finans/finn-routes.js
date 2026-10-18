// Finn-handler: handler med annonse, original kvittering, e-poster og bilder (prompt 10).
// - Annonsen hentes på serveren (finn.no), med robots.txt og rate-limit. Tittel, pris, sted, beskrivelse og alle bildene
//   lagres lokalt under data/finn/<finnkode>/, så kopien finnes selv om annonsen slettes.
// - E-poster fra FINN, Posten/Bring, Tillit eller motparten kobles til handelen via Finn-koden, ordrenummer, sporingsnummer
//   eller varenavnet (IMAP-arbeideren i mail.js kaller linkMail), og .eml kan legges ved manuelt.
// - Stegene er faste: Betalt → Sendt → Mottatt → Godkjent ved kjøp, Solgt → Sendt → Levert → Utbetalt ved salg.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { simpleParser } from 'mailparser';
import { db, settings, secret } from './db.js';
import { config } from '../config.js';
import { askJson } from './ai.js';
import { parseFinnEmail } from './finn.js';

const q = (sql) => db.prepare(sql);
const MOCK = process.env.MOCK_DATA === '1';
const ROOT = resolve(config.dataDir, 'finn');
const bad = (c, msg, code = 400) => c.json({ error: msg }, code);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const today = () => new Date().toLocaleDateString('sv-SE');
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ---------------- Tabeller ---------------- */

db.exec(`
CREATE TABLE IF NOT EXISTS fh_finn_ad (
  finn_id INTEGER PRIMARY KEY REFERENCES fh_finn(id) ON DELETE CASCADE,
  url TEXT, code TEXT, title TEXT, price INTEGER, place TEXT, description TEXT,
  images TEXT NOT NULL DEFAULT '[]',          -- [filnavn relativt til data/finn]
  source TEXT NOT NULL DEFAULT 'fetch',        -- fetch | upload
  fetched INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fh_finn_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finn_id INTEGER NOT NULL REFERENCES fh_finn(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- receipt | photo | ad
  name TEXT NOT NULL, mime TEXT NOT NULL,
  file TEXT NOT NULL,                          -- relativt til data/finn
  size INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fh_finn_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finn_id INTEGER NOT NULL REFERENCES fh_finn(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL, date TEXT, sender TEXT, subject TEXT, body TEXT,
  source TEXT NOT NULL DEFAULT 'imap',         -- imap | eml | paste
  created INTEGER NOT NULL,
  UNIQUE(finn_id, message_id)
);
`);
const addCol = (t, col, def) => { if (!q(`PRAGMA table_info(${t})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
addCol('fh_finn', 'finn_code', 'TEXT');   // Finn-koden til annonsen
addCol('fh_finn', 'order_id', 'TEXT');    // ordre-/handelsnummer fra e-posten
addCol('fh_finn', 'tracking', 'TEXT');    // sporingsnummer (kobler Posten/Bring-e-poster)
addCol('fh_finn', 'ad_url', 'TEXT');
addCol('fh_finn', 'stage', 'INTEGER');    // manuelt steg 1–4 (null = beregnes fra stegene og e-postene)
addCol('fh_finn', 'lines', 'TEXT');       // JSON {price, shipping, fee} i kroner, fra kvitteringsmailen

/* ---------------- Steg ---------------- */

export const STEPS = { bought: ['Betalt', 'Sendt', 'Mottatt', 'Godkjent'], sold: ['Solgt', 'Sendt', 'Levert', 'Utbetalt'] };
export const NEXT = {
  bought: ['Venter på at selger sender', 'Pakken er på vei til deg', 'Godkjenn varen innen 24 t', 'Fullført'],
  sold: ['Send pakken innen 5 dager', 'Venter på levering', 'Utbetaling innen 1 dag', 'Fullført'],
};
// Fremtidige setninger («pengene utbetales når kjøper har bekreftet mottatt») skal ikke telle som fullført.
const present = (t) => String(t ?? '').replace(/\b(?:når|til (?:du|kjøper(?:en)?|selger(?:en)?) har|innen)\b[^.\n]*[.\n]?/gi, ' ').replace(/\bhusk å godkjenne\b[^.\n]*/gi, ' ').toLowerCase();
export function stageOf(f, emails = []) {
  if (f.stage >= 1 && f.stage <= 4) return f.stage;
  const steps = JSON.parse(f.steps || '[]');
  const t = present([...steps.filter((s) => s.done).map((s) => s.t), ...emails.map((e) => `${e.subject ?? ''}. ${e.body ?? ''}`)].join('. '));
  if (f.role === 'sold') {
    if (/utbetalt|fullført/.test(t)) return 4;
    if (/levert|bekreftet mottatt|hentet|er mottatt/.test(t)) return 3;
    if (/sendt|på vei|registrert hos posten/.test(t)) return 2;
    return 1;
  }
  if (/godkjent|fullført|utbetalt til selger/.test(t)) return 4;
  if (/levert|mottatt|kan hentes|hentet|ligger klar/.test(t)) return 3;
  if (/sendt|på vei/.test(t)) return 2;
  return 1;
}

/* ---------------- Uttrekk fra e-post ---------------- */

const num = (s) => { const v = parseFloat(String(s ?? '').replace(/[\s ]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
export function codesIn(text) {
  const t = String(text ?? '');
  const code = t.match(/finn-?kode\s*[:#]?\s*(\d{6,12})/i)?.[1] ?? t.match(/finn\.no\/[^\s"'<>]*?(?:item\/|finnkode=)(\d{6,12})/i)?.[1] ?? null;
  const tracking = t.match(/sporingsnummer\s*[:#]?\s*([A-Z]{2}\d{9}[A-Z]{2}|\d{12,20})/i)?.[1] ?? null;
  const order = t.match(/(?:ordre|handel|referanse)(?:nummer|nr\.?)?\s*[:#]?\s*([A-Z0-9-]{5,})/i)?.[1] ?? null;
  return { code, tracking, order };
}
export function linesIn(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  const amt = (re) => { const m = t.match(re); return m ? num(m[1]) : null; };
  const price = amt(/(?:varepris|salgspris|annonse(?:pris)?|pris)\s*[:–-]?\s*([\d\s.]+(?:,\d{2})?)\s*kr/i);
  const shipping = amt(/frakt[^:\d]{0,40}[:–-]?\s*([\d\s.]+(?:,\d{2})?)\s*kr/i);
  const fee = amt(/(?:servicegebyr|gebyr)[^:\d]{0,20}[:–-]?\s*([\d\s.]+(?:,\d{2})?)\s*kr/i);
  return price == null && shipping == null && fee == null ? null : { price, shipping, fee };
}

/* ---------------- Filer ---------------- */

const folderOf = (f) => (f.finn_code ? String(f.finn_code) : `handel-${f.id}`);
const safeName = (n) => str(n, 120).replace(/[^\p{L}\p{N}._ -]/gu, '_') || 'fil';
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf', 'message/rfc822': '.eml', 'image/svg+xml': '.svg' };
const MIME_OF = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
const mimeFor = (file) => {
  const t = file.type || '', ext = extname(file.name || '').toLowerCase();
  if (ext === '.eml' || t === 'message/rfc822') return 'message/rfc822';
  if (EXT[t]) return t;
  return MIME_OF[ext === '.jpeg' ? '.jpg' : ext] ?? null;
};
async function saveBuffer(f, buf, ext) {
  const rel = join(folderOf(f), `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}${ext}`);
  await mkdir(join(ROOT, folderOf(f)), { recursive: true });
  await writeFile(join(ROOT, rel), buf);
  return rel;
}
const abs = (rel) => { const p = resolve(ROOT, rel); if (!p.startsWith(ROOT + '/')) throw new Error('Ugyldig sti'); return p; };

/* ---------------- Annonsen (finn.no) ---------------- */

let doFetch = (...a) => fetch(...a);
export const _setFetch = (fn, gap = 8000) => { doFetch = fn ? Object.assign(fn, { mocked: true }) : (...a) => fetch(...a); robots = null; lastFetch = 0; MIN_GAP = gap; };
const UA = 'HomelabOS/1.0 (privat arkiv av egne Finn-handler)';
const FINN_HOST = /^(www\.|m\.)?finn\.no$/i;
const IMG_HOST = /(^|\.)finncdn\.no$|(^|\.)finn\.no$/i;
let robots = null, lastFetch = 0;
let MIN_GAP = 8000;

// robots.txt for finn.no, gruppen «*». Hentes én gang per døgn; utilgjengelig robots.txt tolkes som tillatt.
async function robotsAllows(url) {
  if (!robots || Date.now() - robots.at > 86400_000) {
    let rules = [];
    try {
      const r = await doFetch('https://www.finn.no/robots.txt', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        let star = false;
        for (const line of (await r.text()).split(/\r?\n/)) {
          const [k, ...rest] = line.replace(/#.*/, '').split(':'); const v = rest.join(':').trim(), key = k.trim().toLowerCase();
          if (key === 'user-agent') star = v === '*';
          else if (star && (key === 'disallow' || key === 'allow') && v) rules.push({ allow: key === 'allow', path: v });
        }
      }
    } catch { rules = []; }
    robots = { rules, at: Date.now() };
  }
  const p = new URL(url).pathname + new URL(url).search;
  const match = (rule) => { const re = new RegExp('^' + rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')); return re.test(p); };
  const hits = robots.rules.filter(match).sort((a, b) => b.path.length - a.path.length);
  return !hits.length || hits[0].allow;
}

export function adUrlFor(f, emails = []) {
  if (f.ad_url) return f.ad_url;
  const code = f.finn_code ?? emails.map((e) => codesIn(`${e.subject} ${e.body}`).code).find(Boolean);
  return code ? `https://www.finn.no/recommerce/forsale/item/${code}` : null;
}
export function normalizeAdUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim().replace(/^http:/i, 'https:')); } catch { return null; }
  if (u.protocol !== 'https:' || !FINN_HOST.test(u.hostname)) return null;
  return u.toString();
}
const decode = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const textOf = (html) => decode(String(html).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|section|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

// Strukturert uttrekk uten AI: JSON-LD (Product), Open Graph og bilde-URL-er fra finncdn.
export function parseAdHtml(html, url) {
  const out = { title: null, price: null, place: null, description: null, images: [], code: url?.match(/(?:item\/|finnkode=)(\d{6,12})/)?.[1] ?? null };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    for (const o of [j, ...(Array.isArray(j) ? j : []), ...(j['@graph'] ?? [])].flat()) {
      if (!o || typeof o !== 'object' || !(o.name && (o.offers || o.image || /product/i.test(o['@type'] ?? '')))) continue;
      out.title ??= decode(o.name);
      out.description ??= o.description ? decode(o.description) : null;
      const off = Array.isArray(o.offers) ? o.offers[0] : o.offers;
      if (off?.price != null) out.price ??= num(off.price);
      const imgs = Array.isArray(o.image) ? o.image : o.image ? [o.image] : [];
      out.images.push(...imgs.map((x) => (typeof x === 'string' ? x : x?.url)).filter(Boolean));
      const a = off?.availableAtOrFrom?.address ?? o.address ?? off?.seller?.address;
      if (a) out.place ??= [a.addressLocality, a.addressRegion].filter(Boolean).join(', ') || null;
    }
  }
  const meta = (p) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`, 'i'))?.[1];
  out.title ??= decode(meta('og:title') ?? html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s*\|\s*FINN.*$/i, '').trim() || null;
  out.description ??= meta('og:description') ? decode(meta('og:description')) : null;
  for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)) out.images.push(decode(m[1]));
  for (const m of html.matchAll(/https:\/\/images\.finncdn\.no\/[^\s"'<>)]+?\.(?:jpe?g|png|webp)/gi)) out.images.push(m[0]);
  if (out.price == null) { const t = textOf(html); out.price = num(t.match(/(?:pris|til salgs)\s*:?\s*([\d\s.]{3,})\s*kr/i)?.[1]); out.place ??= t.match(/(?:sted|område|lokasjon)\s*:?\s*([^\n]{3,60})/i)?.[1]?.trim() ?? null; }
  // Samme bilde i flere størrelser: behold én per filnavn, største først (finncdn har størrelsen i stien).
  const seen = new Map();
  for (const src of out.images) { try { const u = new URL(src); if (!IMG_HOST.test(u.hostname)) continue; const key = u.pathname.split('/').pop(); const size = +(u.pathname.match(/\/(\d{3,4})(?:w|x\d+)?\//)?.[1] ?? 0); if (!seen.has(key) || seen.get(key).size < size) seen.set(key, { src: u.toString(), size }); } catch { /* ugyldig */ } }
  out.images = [...seen.values()].map((x) => x.src).slice(0, 20);
  return out;
}

const AD_SCHEMA = { type: 'object', properties: { title: { type: 'string' }, price: { type: 'number', nullable: true }, place: { type: 'string', nullable: true }, description: { type: 'string', nullable: true } }, required: ['title'] };
async function aiAd(text) {
  try {
    const x = await askJson(`Dette er teksten fra en annonse på FINN.no. Returner KUN JSON med title (annonsens tittel), price (pris i kroner som tall), place (sted, f.eks. «Bislett, Oslo») og description (selgerens beskrivelse, uten menyer og bunntekst, maks 800 tegn).\n"""\n${text.slice(0, 7000)}\n"""`, AD_SCHEMA, { timeout: 25_000 });
    return { title: str(x.title, 160) || null, price: Number.isFinite(+x.price) && +x.price > 0 ? +x.price : null, place: str(x.place, 80) || null, description: str(x.description, 1500) || null };
  } catch { return null; }
}

async function downloadImages(f, urls) {
  const files = [];
  for (const [i, src] of urls.entries()) {
    try {
      const u = new URL(src);
      if (u.protocol !== 'https:' || !IMG_HOST.test(u.hostname)) continue;
      const r = await doFetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      const type = (r.headers.get('content-type') ?? '').split(';')[0];
      if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) continue;
      const rel = join(folderOf(f), `annonse-${String(i + 1).padStart(2, '0')}${EXT[type]}`);
      await mkdir(join(ROOT, folderOf(f)), { recursive: true });
      await writeFile(join(ROOT, rel), buf);
      files.push(rel);
    } catch { /* hopp over bildet */ }
  }
  return files;
}

// Demodata uten nett: lager en annonse med enkle bilder (SVG) ut fra handelen.
const TINTS = ['#3A2F4A', '#1E2A3F', '#3B2E22', '#22362C', '#2C2C33', '#2A3540'];
async function mockAd(f) {
  const files = [];
  await mkdir(join(ROOT, folderOf(f)), { recursive: true });
  for (let i = 0; i < 3; i++) {
    const tint = TINTS[(f.id + i) % TINTS.length], ini = f.item.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tint}"/><stop offset="1" stop-color="#0E0E12"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="${560 - i * 120}" cy="${200 + i * 60}" r="${150 - i * 30}" fill="rgba(255,255,255,.06)"/><text x="400" y="340" font-family="system-ui,sans-serif" font-size="140" font-weight="700" fill="rgba(255,255,255,.25)" text-anchor="middle">${ini}</text><text x="400" y="430" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,.4)" text-anchor="middle">Bilde ${i + 1} av 3</text></svg>`;
    const rel = join(folderOf(f), `annonse-0${i + 1}.svg`);
    await writeFile(join(ROOT, rel), svg);
    files.push(rel);
  }
  return { title: f.item, price: f.amount / 100, place: 'Bislett, Oslo', description: `${f.item} i god stand. Lite brukt, ingen riper. Selges fordi jeg har fått ny. Kan sendes med Fiks ferdig.`, images: files };
}

export async function fetchAd(f, rawUrl) {
  const emails = q('SELECT subject, body FROM fh_finn_emails WHERE finn_id=?').all(f.id);
  const url = rawUrl ? normalizeAdUrl(rawUrl) : adUrlFor(f, emails);
  if (rawUrl && !url) throw Object.assign(new Error('Lenken må gå til finn.no'), { status: 400 });
  if (!url && !MOCK) throw Object.assign(new Error('Lim inn lenken til annonsen. Finn-koden står ikke i e-postene.'), { status: 400 });
  let ad;
  if (MOCK && !doFetch.mocked) ad = await mockAd(f);
  else {
    const wait = lastFetch + MIN_GAP - Date.now();
    if (wait > 0) throw Object.assign(new Error(`Vent ${Math.ceil(wait / 1000)} s før neste henting fra finn.no`), { status: 429 });
    if (!(await robotsAllows(url))) throw Object.assign(new Error('finn.no sin robots.txt tillater ikke automatisk henting av denne siden. Last opp annonsen som PDF eller skjermbilde i stedet.'), { status: 403 });
    lastFetch = Date.now();
    let r;
    try { r = await doFetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) }); }
    catch { throw Object.assign(new Error('Fikk ikke kontakt med finn.no'), { status: 502 }); }
    if (r.url && !FINN_HOST.test(new URL(r.url).hostname)) throw Object.assign(new Error('finn.no sendte videre til en annen side'), { status: 502 });
    if (r.status === 404 || r.status === 410) throw Object.assign(new Error('Annonsen finnes ikke lenger på finn.no. Last opp en PDF eller et skjermbilde hvis du har det.'), { status: 404 });
    if (!r.ok) throw Object.assign(new Error(`finn.no svarte ${r.status}`), { status: 502 });
    const html = (await r.text()).slice(0, 3_000_000);
    const parsed = parseAdHtml(html, url);
    const ai = await aiAd(textOf(html));
    ad = { title: ai?.title ?? parsed.title, price: ai?.price ?? parsed.price, place: ai?.place ?? parsed.place, description: ai?.description ?? parsed.description, code: parsed.code };
    if (!ad.title) throw Object.assign(new Error('Fant ikke annonsen på siden'), { status: 422 });
    ad.images = await downloadImages(f, parsed.images);
    lastFetch = Date.now(); // pausen regnes fra siste kall mot finn.no
  }
  const code = ad.code ?? url?.match(/(?:item\/|finnkode=)(\d{6,12})/)?.[1] ?? f.finn_code;
  // Gamle annonsebilder fjernes først når de nye er på plass.
  const old = q('SELECT images FROM fh_finn_ad WHERE finn_id=?').get(f.id);
  q(`INSERT INTO fh_finn_ad(finn_id,url,code,title,price,place,description,images,source,fetched) VALUES(?,?,?,?,?,?,?,?,'fetch',?)
     ON CONFLICT(finn_id) DO UPDATE SET url=excluded.url, code=excluded.code, title=excluded.title, price=excluded.price, place=excluded.place,
       description=excluded.description, images=excluded.images, source='fetch', fetched=excluded.fetched`)
    .run(f.id, url, code, ad.title, ad.price != null ? Math.round(ad.price * 100) : null, ad.place, ad.description, JSON.stringify(ad.images), Date.now());
  for (const rel of JSON.parse(old?.images ?? '[]')) if (!ad.images.includes(rel)) await unlink(abs(rel)).catch(() => {});
  q('UPDATE fh_finn SET ad_url=?, finn_code=COALESCE(finn_code, ?) WHERE id=?').run(url, code, f.id);
  return ad;
}

/* ---------------- E-poster ---------------- */

const FROM_OK = /finn\.no|posten|bring|tillit/i;
const STOP = new Set(['med', 'for', 'til', 'fra', 'og', 'str', 'stk', 'pakke', 'selger', 'kjøper', 'brukt', 'pent']);
const tokens = (s) => String(s ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w));
const firstName = (cp) => String(cp ?? '').replace(/^(selger|kjøper)\s+/i, '').split(/\s+/)[0]?.toLowerCase() ?? '';

// Hvilke handler passer en e-post til? Finn-kode, ordre- eller sporingsnummer er sikre treff; ellers varenavnet
// (minst to ord, eller hele navnet) når avsenderen er FINN, Posten/Bring, Tillit eller motparten.
export function matchDeals({ subject, text, from }) {
  const t = `${subject ?? ''}\n${text ?? ''}`.toLowerCase(), sender = String(from ?? '').toLowerCase();
  const { code, tracking, order } = codesIn(`${subject}\n${text}`);
  const rows = q("SELECT * FROM fh_finn WHERE date >= date('now','-400 days') ORDER BY date DESC").all();
  const hits = [];
  for (const f of rows) {
    const sure = (code && f.finn_code === code) || (order && f.order_id && f.order_id.toLowerCase() === order.toLowerCase())
      || (f.finn_code && t.includes(f.finn_code)) || (f.order_id && t.includes(f.order_id.toLowerCase())) || (f.tracking && t.includes(f.tracking.toLowerCase()));
    const fn = firstName(f.counterpart), fromCp = fn.length >= 3 && sender.includes(fn);
    const toks = tokens(f.item), inT = toks.filter((w) => t.includes(w)).length;
    const byItem = t.includes(f.item.toLowerCase()) || (toks.length >= 2 ? inT >= 2 : inT === toks.length && toks.length > 0);
    if (sure || ((FROM_OK.test(sender) || fromCp) && byItem)) hits.push(f);
  }
  return hits;
}

const insMail = () => q('INSERT OR IGNORE INTO fh_finn_emails(finn_id,message_id,date,sender,subject,body,source,created) VALUES(?,?,?,?,?,?,?,?)');
// Lagrer e-posten på handelen og plukker opp Finn-kode, ordre-/sporingsnummer og kvitteringslinjer hvis de mangler.
export function attachMail(f, { messageId, date, from, subject, text }, source = 'imap') {
  const r = insMail().run(f.id, String(messageId || `${subject}|${date}`).slice(0, 300), date ? String(date).slice(0, 10) : today(), str(from, 200), str(subject, 300), String(text ?? '').slice(0, 20000), source, Date.now());
  const ids = codesIn(`${subject}\n${text}`), lines = linesIn(text);
  q('UPDATE fh_finn SET finn_code=COALESCE(finn_code, ?), order_id=COALESCE(order_id, ?), tracking=COALESCE(tracking, ?), lines=COALESCE(lines, ?) WHERE id=?')
    .run(ids.code, ids.order, ids.tracking, lines ? JSON.stringify(lines) : null, f.id);
  return r.changes > 0;
}
const mailText = (p) => (p.text?.trim() ? p.text : textOf(p.html ?? ''));
const asMail = (p) => ({ messageId: p.messageId, date: p.date ? p.date.toLocaleDateString('sv-SE') : null, from: p.from?.text ?? '', subject: p.subject ?? '', text: mailText(p) });

// E-posten som opprettet/oppdaterte handelen (Finn-mappen i IMAP-importen) kobles alltid til den.
export function attachParsed(f, parsed) { if (f && parsed) attachMail(f, asMail(parsed), 'imap'); }

// Kalles av IMAP-arbeideren for hver e-post den ser. Returnerer antall handler e-posten ble koblet til.
export function linkMail(parsed) {
  const m = asMail(parsed);
  let n = 0;
  for (const f of matchDeals(m)) if (attachMail(f, m, 'imap')) n++;
  return n;
}

/* ---------------- Utdata ---------------- */

const fileUrl = (f, x) => `/finans/api/finn/${f.id}/files/${x.id}`;
export function summaryOf(f) {
  const nm = q('SELECT count(*) FROM fh_finn_emails WHERE finn_id=?').pluck().get(f.id);
  const files = q('SELECT kind, count(*) n FROM fh_finn_files WHERE finn_id=? GROUP BY kind').all(f.id);
  const n = (k) => files.find((x) => x.kind === k)?.n ?? 0;
  const ad = q('SELECT images, source FROM fh_finn_ad WHERE finn_id=?').get(f.id);
  const adImgs = ad ? JSON.parse(ad.images).length : 0;
  const s = { emails: nm, receipts: n('receipt'), ad: !!ad || n('ad') > 0, photos: n('photo'), adImages: adImgs };
  const parts = [nm ? `${nm} e-post${nm === 1 ? '' : 'er'}` : null, s.receipts ? 'kvittering ✓' : null, s.ad ? 'annonse lagret' : null, s.photos ? `${s.photos} bilde${s.photos === 1 ? '' : 'r'}` : null].filter(Boolean);
  return { ...s, text: parts.join(' · ') };
}
function coverOf(f) {
  const ph = q("SELECT id FROM fh_finn_files WHERE finn_id=? AND kind='photo' AND mime LIKE 'image/%' ORDER BY id LIMIT 1").get(f.id);
  if (ph) return fileUrl(f, ph);
  const ad = q('SELECT images FROM fh_finn_ad WHERE finn_id=?').get(f.id);
  return ad && JSON.parse(ad.images).length ? `/finans/api/finn/${f.id}/ad/img/0` : null;
}
export function finnOut(f) {
  const steps = JSON.parse(f.steps || '[]');
  const emails = q('SELECT subject, body FROM fh_finn_emails WHERE finn_id=?').all(f.id);
  const stage = stageOf(f, emails), names = STEPS[f.role === 'sold' ? 'sold' : 'bought'];
  const done = stage >= 4;
  return { id: f.id, role: f.role, item: f.item, counterpart: f.counterpart, date: f.date, amount: f.amount / 100, steps, txId: f.tx_id,
    done, domain: 'finn.no', code: f.finn_code ?? null, orderId: f.order_id ?? null, tracking: f.tracking ?? null, adUrl: f.ad_url ?? null,
    stage, status: done ? 'Fullført' : names[stage - 1], next: NEXT[f.role === 'sold' ? 'sold' : 'bought'][stage - 1], manualStage: f.stage ?? null,
    track: names.map((t, i) => ({ t, done: i < stage, cur: i === stage - 1 && !done })),
    cover: coverOf(f), summary: summaryOf(f), shipment: shipmentOf(f) };
}
// Sporing (prompt 11): sendingen til handelen fra Sporing-fanen (hl_shipments), med de siste hendelsene til tidslinjen.
// Leses direkte fra tabellen for å unngå sirkulær import med server/tracking.js; finnes ikke tabellen ennå, er feltet null.
const STATUS_NB = { registered: 'Registrert', picked_up: 'Hentet', in_transit: 'I transport', ready_for_pickup: 'Klar for henting', out_for_delivery: 'Ute for levering', delivered: 'Levert', delayed: 'Forsinket', unknown: 'Ukjent status' };
function shipmentOf(f) {
  try {
    const s = q("SELECT id, tracking_no, carrier, status, eta, pickup_point FROM hl_shipments WHERE (source='finn' AND source_ref=?) OR (tracking_no=?) LIMIT 1").get(String(f.id), f.tracking ?? '');
    if (!s) return null;
    const events = q('SELECT ts, status, location FROM hl_shipment_events WHERE shipment_id=? ORDER BY ts DESC LIMIT 8').all(s.id);
    return { id: s.id, trackingNo: s.tracking_no, carrier: s.carrier, status: s.status, statusText: STATUS_NB[s.status] ?? s.status, eta: s.eta, pickupPoint: s.pickup_point, events };
  } catch { return null; }
}
function receiptLines(f) {
  const l = JSON.parse(f.lines || 'null') ?? {}, amt = f.amount / 100;
  if (f.role === 'sold') {
    const price = l.price ?? amt;
    return { lines: [{ l: 'Salgspris', v: price }, { l: 'Frakt betalt av kjøper', v: l.shipping ?? 0 }, { l: 'Gebyr', v: l.fee ?? 0 }], totalLabel: 'Utbetalt', total: amt };
  }
  const shipping = l.shipping ?? null, fee = l.fee ?? null;
  const price = l.price ?? Math.max(0, amt - (shipping ?? 0) - (fee ?? 0));
  const lines = [{ l: 'Varepris', v: price }];
  if (shipping != null) lines.push({ l: 'Frakt · Fiks ferdig', v: shipping });
  if (fee != null) lines.push({ l: 'Servicegebyr', v: fee });
  return { lines, totalLabel: 'Betalt', total: amt };
}
export function finnFull(f) {
  const base = finnOut(f);
  const ad = q('SELECT * FROM fh_finn_ad WHERE finn_id=?').get(f.id);
  const files = q('SELECT * FROM fh_finn_files WHERE finn_id=? ORDER BY id').all(f.id);
  const adFile = files.find((x) => x.kind === 'ad');
  const emails = q('SELECT * FROM fh_finn_emails WHERE finn_id=? ORDER BY date, id').all(f.id).map((e) => ({ id: e.id, date: e.date, from: e.sender, subject: e.subject,
    snippet: String(e.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 160), body: e.body, source: e.source }));
  return { ...base,
    ad: ad || adFile ? { url: ad?.url ?? f.ad_url ?? null, code: ad?.code ?? f.finn_code ?? null, title: ad?.title ?? null, price: ad?.price != null ? ad.price / 100 : null, place: ad?.place ?? null,
      description: ad?.description ?? null, images: ad ? JSON.parse(ad.images).map((_, i) => `/finans/api/finn/${f.id}/ad/img/${i}`) : [], source: ad?.source ?? 'upload',
      fetched: ad?.fetched ?? adFile?.created ?? null, file: adFile ? { id: adFile.id, name: adFile.name, mime: adFile.mime, url: fileUrl(f, adFile) } : null } : null,
    adUrlGuess: adUrlFor(f, emails.map((e) => ({ subject: e.subject, body: e.body }))),
    receipts: files.filter((x) => x.kind === 'receipt').map((x) => ({ id: x.id, name: x.name, mime: x.mime, size: x.size, url: fileUrl(f, x), created: x.created })),
    photos: files.filter((x) => x.kind === 'photo').map((x) => ({ id: x.id, name: x.name, url: fileUrl(f, x), thumb: fileUrl(f, x) })),
    emails, receipt: receiptLines(f) };
}

/* ---------------- Demodata ---------------- */

// MOCK_DATA: gi demohandlene Finn-kode, e-poster og (for noen) annonse og bilder, første gang listen åpnes.
let demoDone = false;
async function ensureDemo() {
  if (!MOCK || demoDone) return;
  demoDone = true;
  if (q('SELECT 1 FROM fh_finn_emails LIMIT 1').get()) return;
  const rows = q('SELECT * FROM fh_finn ORDER BY id').all();
  for (const [i, f] of rows.entries()) {
    const code = String(345678000 + f.id * 7919), track = `3707247600${String(12345678 + f.id).padStart(8, '0')}`;
    q('UPDATE fh_finn SET finn_code=COALESCE(finn_code, ?), tracking=COALESCE(tracking, ?) WHERE id=?').run(code, track, f.id);
    const g = q('SELECT * FROM fh_finn WHERE id=?').get(f.id), d = new Date(g.date + 'T12:00'), dt = (k) => new Date(d.getTime() + k * 86400_000).toLocaleDateString('sv-SE');
    const who = g.counterpart.replace(/^(selger|kjøper)\s+/i, ''), amt = Math.round(g.amount / 100).toLocaleString('nb-NO');
    const done = JSON.parse(g.steps).filter((s) => s.done).length;
    const mails = g.role === 'bought'
      ? [['FINN.no <noreply@finn.no>', `Kvittering: du har betalt for «${g.item}»`, 0, `Du har kjøpt ${g.item} fra ${g.counterpart} via Fiks ferdig.\nFinn-kode: ${code}\nVarepris: ${Math.round(g.amount / 100 - 99 - Math.round(g.amount / 100 * 0.03))} kr\nFrakt (Fiks ferdig): 99 kr\nServicegebyr: ${Math.round(g.amount / 100 * 0.03)} kr\nTotalt: ${amt} kr\nBeløpet holdes av FINN til du har godkjent varen.`],
        [`${who} via FINN <melding@finn.no>`, 'Takk! Sender i morgen', 0, 'Hei! Takk for handelen. Jeg sender pakken i morgen formiddag.'],
        ...(done >= 2 ? [['Posten Bring <sporing@posten.no>', 'Pakken din er på vei', 1, `Sporingsnummer: ${track}. Pakken er sendt og er på vei til deg.`]] : []),
        ...(done >= 3 ? [['Posten Bring <sporing@posten.no>', 'Pakken kan hentes', 2, `Sporingsnummer: ${track}. Pakken ligger klar på hentestedet.`], ['FINN.no <noreply@finn.no>', 'Handelen er fullført', 3, 'Du har godkjent varen. Pengene er utbetalt til selger.']] : [])]
      : [['FINN.no <noreply@finn.no>', `«${g.item}» er solgt med Trygg betaling`, 0, `Du har solgt ${g.item} til ${g.counterpart}. Finn-kode: ${code}\nSalgspris: ${amt} kr\nKjøper har betalt. Send varen innen 5 dager.`],
        ['FINN.no <noreply@finn.no>', 'Fraktetikett er klar', 0, 'Etiketten er lagt ved som PDF. Lever pakken på et Posten-utleveringssted.'],
        ...(done >= 2 ? [['Posten Bring <sporing@posten.no>', 'Pakken er sendt', 1, `Sporingsnummer: ${track}. Pakken er registrert hos Posten.`]] : []),
        ...(done >= 3 ? [['Posten Bring <sporing@posten.no>', 'Pakken er levert', 2, `Sporingsnummer: ${track}. Pakken er hentet av mottaker.`], ['FINN.no <noreply@finn.no>', 'Utbetaling er på vei', 3, `${amt} kr er utbetalt til kontoen din.`]] : [])];
    for (const [j, [from, subject, k, text]] of mails.entries()) attachMail(g, { messageId: `<demo-${g.id}-${j}@finn.no>`, date: dt(k), from, subject, text }, 'imap');
    if (i % 2 === 0) await fetchAd(q('SELECT * FROM fh_finn WHERE id=?').get(g.id)).catch(() => {});
  }
}

/* ---------------- Ruter ---------------- */

export function mountFinn(api, { R, W, upload, saveFinn }) {
  const deal = (c) => q('SELECT * FROM fh_finn WHERE id=?').get(+c.req.param('id'));
  const filesIn = (b) => (Array.isArray(b.file) ? b.file : b.file ? [b.file] : []).filter((x) => x instanceof File && x.size > 0);

  api.get('/finn', R, async (c) => {
    await ensureDemo();
    const rows = q('SELECT * FROM fh_finn ORDER BY date DESC, id DESC').all().map(finnOut);
    const y = String(new Date().getFullYear());
    const sum = (role) => rows.filter((r) => r.role === role && r.date.startsWith(y)).reduce((a, r) => a + r.amount, 0);
    // Netto per måned i år (solgt − kjøpt) for stolpene på mobil.
    const months = Array.from({ length: 12 }, (_, i) => ({ m: `${y}-${String(i + 1).padStart(2, '0')}`, bought: 0, sold: 0 }));
    for (const r of rows) if (r.date.startsWith(y)) months[+r.date.slice(5, 7) - 1][r.role === 'sold' ? 'sold' : 'bought'] += r.amount;
    return c.json({ items: rows, bought: sum('bought'), sold: sum('sold'), ongoing: rows.filter((r) => !r.done).length, months,
      nBought: rows.filter((r) => r.role === 'bought' && r.date.startsWith(y)).length, nSold: rows.filter((r) => r.role === 'sold' && r.date.startsWith(y)).length,
      imap: { configured: !!(settings().imapHost && settings().imapUser && secret('imapPass')), finnFolder: settings().imapFinnFolder || null } });
  });

  api.post('/finn', W, async (c) => {
    const b = await c.req.json();
    let d;
    if (str(b.email, 50000)) {
      try { d = await parseFinnEmail(String(b.email).slice(0, 50000)); } catch (e) { return bad(c, e.message); }
    } else {
      d = { role: b.role === 'sold' ? 'sold' : 'bought', item: str(b.item, 120), counterpart: str(b.counterpart, 80), date: isDate(b.date) ? b.date : today(), amount: +String(b.amount ?? '').replace(',', '.'),
        steps: Array.isArray(b.steps) ? b.steps.slice(0, 8).map((s) => ({ t: str(s.t ?? s, 60), done: !!s.done })) : [{ t: 'Trygg betaling', done: true }] };
    }
    if (!d.item || !Number.isFinite(d.amount) || d.amount <= 0) return bad(c, 'Fant ikke gjenstand og beløp');
    const f = saveFinn(d);
    if (str(b.email, 50000)) attachMail(f, { messageId: `paste:${d.source ?? f.id}:${Date.now()}`, date: d.date, from: 'Limt inn', subject: d.item, text: String(b.email).slice(0, 20000) }, 'paste');
    return c.json(finnOut(q('SELECT * FROM fh_finn WHERE id=?').get(f.id)));
  });

  api.get('/finn/:id', R, (c) => { const f = deal(c); return f ? c.json(finnFull(f)) : c.notFound(); });

  api.patch('/finn/:id', W, async (c) => {
    const cur = deal(c);
    if (!cur) return c.notFound();
    const b = await c.req.json();
    const steps = Array.isArray(b.steps) ? JSON.stringify(b.steps.slice(0, 8).map((s) => ({ t: str(s.t, 60), done: !!s.done }))) : cur.steps;
    let adUrl = cur.ad_url;
    if (b.adUrl !== undefined) { adUrl = b.adUrl ? normalizeAdUrl(b.adUrl) : null; if (b.adUrl && !adUrl) return bad(c, 'Lenken må gå til finn.no'); }
    const code = b.finnCode !== undefined ? (/^\d{6,12}$/.test(String(b.finnCode).trim()) ? String(b.finnCode).trim() : null) : cur.finn_code;
    const stage = b.stage !== undefined ? (b.stage === null ? null : Math.min(4, Math.max(1, Math.round(+b.stage) || 1))) : cur.stage;
    q('UPDATE fh_finn SET item=?, counterpart=?, steps=?, ad_url=?, finn_code=?, stage=? WHERE id=?')
      .run(b.item !== undefined ? str(b.item, 120) || cur.item : cur.item, b.counterpart !== undefined ? str(b.counterpart, 80) : cur.counterpart, steps, adUrl, code, stage, cur.id);
    return c.json(finnFull(q('SELECT * FROM fh_finn WHERE id=?').get(cur.id)));
  });

  api.delete('/finn/:id', W, async (c) => {
    const f = deal(c);
    if (!f) return c.json({ ok: true });
    const files = q('SELECT file FROM fh_finn_files WHERE finn_id=?').pluck().all(f.id);
    const ad = JSON.parse(q('SELECT images FROM fh_finn_ad WHERE finn_id=?').pluck().get(f.id) ?? '[]');
    for (const rel of [...files, ...ad]) await unlink(abs(rel)).catch(() => {});
    db.transaction(() => { for (const t of ['fh_finn_files', 'fh_finn_emails', 'fh_finn_ad']) q(`DELETE FROM ${t} WHERE finn_id=?`).run(f.id); q('DELETE FROM fh_finn WHERE id=?').run(f.id); })();
    await rmdir(join(ROOT, folderOf(f))).catch(() => {}); // fjernes bare hvis mappen er tom
    return c.json({ ok: true });
  });

  // ✦ Hent annonsen fra finn.no (lenke i body, ellers lagret lenke eller Finn-koden fra e-postene).
  api.post('/finn/:id/ad', W, async (c) => {
    const f = deal(c);
    if (!f) return c.notFound();
    const b = await c.req.json().catch(() => ({}));
    try { await fetchAd(f, str(b.url, 500) || null); } catch (e) { return bad(c, e.message, e.status ?? 400); }
    const full = finnFull(q('SELECT * FROM fh_finn WHERE id=?').get(f.id));
    return c.json({ ...full, message: `Annonsen er lagret med ${full.ad?.images.length ?? 0} bilde${full.ad?.images.length === 1 ? '' : 'r'}` });
  });
  api.delete('/finn/:id/ad', W, async (c) => {
    const f = deal(c);
    if (!f) return c.notFound();
    for (const rel of JSON.parse(q('SELECT images FROM fh_finn_ad WHERE finn_id=?').pluck().get(f.id) ?? '[]')) await unlink(abs(rel)).catch(() => {});
    q('DELETE FROM fh_finn_ad WHERE finn_id=?').run(f.id);
    return c.json(finnFull(f));
  });
  api.get('/finn/:id/ad/img/:n', R, async (c) => {
    const imgs = JSON.parse(q('SELECT images FROM fh_finn_ad WHERE finn_id=?').pluck().get(+c.req.param('id')) ?? '[]');
    const rel = imgs[+c.req.param('n')];
    if (!rel) return c.notFound();
    try { return c.body(await readFile(abs(rel)), 200, { 'Content-Type': MIME_OF[extname(rel)] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', ...(rel.endsWith('.svg') ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}) }); }
    catch { return c.notFound(); }
  });

  // Filer: kind=receipt (PDF/bilde/.eml), photo (bilder) eller ad (annonsen som PDF/skjermbilde). Flere filer i feltet «file».
  api.post('/finn/:id/files', W, upload, async (c) => {
    const f = deal(c);
    if (!f) return c.notFound();
    const b = await c.req.parseBody({ all: true });
    const kind = ['receipt', 'photo', 'ad'].includes(b.kind) ? b.kind : 'receipt';
    const fs = filesIn(b);
    if (!fs.length) return bad(c, 'Velg minst én fil');
    for (const file of fs) {
      const mime = mimeFor(file);
      const okType = kind === 'photo' ? /^image\//.test(mime ?? '') && mime !== 'image/svg+xml' : mime && mime !== 'image/svg+xml' && (kind !== 'ad' || mime !== 'message/rfc822');
      if (!okType) return bad(c, `«${file.name}» er ikke en støttet filtype (${kind === 'photo' ? 'bilder' : 'PDF, bilde' + (kind === 'receipt' ? ' eller .eml' : '')})`);
    }
    if (kind === 'ad') for (const x of q("SELECT * FROM fh_finn_files WHERE finn_id=? AND kind='ad'").all(f.id)) { await unlink(abs(x.file)).catch(() => {}); q('DELETE FROM fh_finn_files WHERE id=?').run(x.id); }
    for (const file of kind === 'ad' ? fs.slice(0, 1) : fs.slice(0, 30)) {
      const mime = mimeFor(file), buf = Buffer.from(await file.arrayBuffer());
      const rel = await saveBuffer(f, buf, EXT[mime] ?? '');
      q('INSERT INTO fh_finn_files(finn_id,kind,name,mime,file,size,created) VALUES(?,?,?,?,?,?,?)').run(f.id, kind, safeName(file.name), mime, rel, buf.length, Date.now());
    }
    return c.json(finnFull(f));
  });
  api.get('/finn/:id/files/:fid', R, async (c) => {
    const x = q('SELECT * FROM fh_finn_files WHERE id=? AND finn_id=?').get(+c.req.param('fid'), +c.req.param('id'));
    if (!x) return c.notFound();
    const dl = x.mime === 'message/rfc822' || c.req.query('download') === '1';
    try {
      return c.body(await readFile(abs(x.file)), 200, { 'Content-Type': x.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(x.name)}` });
    } catch { return c.notFound(); }
  });
  api.delete('/finn/:id/files/:fid', W, async (c) => {
    const f = deal(c), x = f && q('SELECT * FROM fh_finn_files WHERE id=? AND finn_id=?').get(+c.req.param('fid'), f.id);
    if (!x) return c.notFound();
    await unlink(abs(x.file)).catch(() => {});
    q('DELETE FROM fh_finn_files WHERE id=?').run(x.id);
    return c.json(finnFull(f));
  });

  // Manuelle e-poster (.eml) i handelen.
  api.post('/finn/:id/emails', W, upload, async (c) => {
    const f = deal(c);
    if (!f) return c.notFound();
    const fs = filesIn(await c.req.parseBody({ all: true }));
    if (!fs.length) return bad(c, 'Velg en .eml-fil');
    let added = 0;
    for (const file of fs.slice(0, 20)) {
      let p;
      try { p = await simpleParser(Buffer.from(await file.arrayBuffer())); } catch { return bad(c, `Kunne ikke lese «${file.name}» som e-post`); }
      if (!p.subject && !p.text && !p.html) return bad(c, `«${file.name}» ser ikke ut som en e-post (.eml)`);
      if (attachMail(f, { ...asMail(p), messageId: p.messageId || `eml:${file.name}:${file.size}` }, 'eml')) added++;
    }
    return c.json({ ...finnFull(q('SELECT * FROM fh_finn WHERE id=?').get(f.id)), added });
  });
  api.delete('/finn/:id/emails/:eid', W, (c) => {
    const f = deal(c);
    if (!f) return c.notFound();
    q('DELETE FROM fh_finn_emails WHERE id=? AND finn_id=?').run(+c.req.param('eid'), f.id);
    return c.json(finnFull(f));
  });
}

/* ---------------- Import (Innstillinger → Import → Finn.no) ---------------- */
// Tidligere Finn-e-poster (.eml, .mbox, .zip med .eml, eller alle fra Proton Mail Bridge) og annonselenker.
// Arbeidet går som én jobb om gangen i bakgrunnen; kallet venter inntil ~50 s og gir ellers fremdriften (running: true),
// så Cloudflare-tunnelen (100 s) ikke kutter forespørselen. GET /finn/import/status viser jobben.

const DEAL_MAIL = /kvittering|du har (?:kjøpt|solgt)|er solgt|trygg betaling|fiks ferdig|utbetal|tillit/i;
let mailFetcher = null;   // tester kan sette en egen henter (uten IMAP)
export const _setFinnMailFetcher = (fn) => { mailFetcher = fn; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// .mbox: e-postene skilles med linjer som begynner med «From ». .zip (Proton-eksport): alle .eml/.mbox inni.
export async function mailSources(file) {
  const name = String(file.name ?? '').toLowerCase(), buf = Buffer.from(await file.arrayBuffer());
  if (/\.zip$/.test(name) || (buf[0] === 0x50 && buf[1] === 0x4b)) {
    const { unzip } = await import('./xlsx.js');
    const out = [];
    for (const [n, text] of unzip(buf, (n) => /\.(eml|mbox)$/i.test(n))) out.push(...(/\.mbox$/i.test(n) ? splitMbox(text) : [Buffer.from(text, 'utf8')]));
    return out;
  }
  const text = buf.toString('utf8');
  if (/\.mbox$/.test(name) || /^From \S+.*\r?\n[\w-]+:/.test(text)) return splitMbox(text);
  return [buf];
}
export function splitMbox(text) {
  return String(text).split(/^From [^\r\n]*\r?\n/m).map((s) => s.replace(/^>(>*From )/gm, '$1')).filter((s) => /^[\w-]+:/m.test(s.slice(0, 2000))).map((s) => Buffer.from(s, 'utf8'));
}

// Én e-post: handelsmail fra FINN oppretter eller oppdaterer handelen; andre (Posten/Bring, Tillit, motparten) kobles
// til handlene de passer til. Svarer 'added' | 'linked' | 'skipped'.
async function importOne(source, finnFromMail, origin) {
  const p = await simpleParser(source);
  const m = asMail(p);
  if (!m.subject && !m.text) return 'skipped';
  const from = String(m.from).toLowerCase();
  if (/finn\.no/.test(from) && DEAL_MAIL.test(`${m.subject}\n${m.text}`)) {
    const before = q('SELECT coalesce(max(id),0) FROM fh_finn').pluck().get();
    try {
      const f = await finnFromMail(m.text, p);
      if (origin !== 'imap') q("UPDATE fh_finn_emails SET source=? WHERE finn_id=? AND message_id=? AND source='imap'").run(origin, f.id, String(m.messageId || `${m.subject}|${m.date}`).slice(0, 300));
      return f.id > before ? 'added' : 'linked';
    } catch { /* ikke en handel (f.eks. en statusmail uten beløp) – prøv å koble den */ }
  }
  let n = 0;
  for (const f of matchDeals(m)) if (attachMail(f, { ...m, messageId: m.messageId || `${origin}:${m.subject}:${m.date}` }, origin)) n++;
  return n ? 'linked' : 'skipped';
}

let job = null;
const jobOut = () => (job ? { kind: job.kind, running: job.running, total: job.total, done: job.done, added: job.added, linked: job.linked, skipped: job.skipped, errors: job.errors.slice(-20), message: job.message ?? null, items: job.items ?? [], started: job.started, finished: job.finished ?? null } : { running: false });
function startJob(kind, total, work) {
  job = { kind, running: true, total, done: 0, added: 0, linked: 0, skipped: 0, errors: [], items: [], started: Date.now() };
  const me = job;
  me.promise = (async () => {
    try { await work(me); } catch (e) { me.errors.push(e.message); }
    me.running = false; me.finished = Date.now();
    me.message ??= `${me.added} ny${me.added === 1 ? '' : 'e'} handel${me.added === 1 ? '' : 'er'} · ${me.linked} oppdatert · ${me.skipped} hoppet over${me.errors.length ? ` · ${me.errors.length} feil` : ''}`;
  })();
  return me;
}
async function waitJob(c, me, ms = 50_000) {
  let t;
  await Promise.race([me.promise, new Promise((r) => { t = setTimeout(r, ms); t.unref?.(); })]);
  clearTimeout(t);
  return c.json(jobOut());
}
const tally = (me, r) => { me[r]++; me.done++; };

export function finnCodes(text) {
  const codes = [];
  for (const m of String(text ?? '').matchAll(/(?:finn\.no\/[^\s"'<>]*?(?:item\/|finnkode=)|\bfinnkode\s*[:=]?\s*)(\d{6,12})/gi)) if (!codes.includes(m[1])) codes.push(m[1]);
  for (const m of String(text ?? '').matchAll(/^\s*(\d{8,12})\s*$/gm)) if (!codes.includes(m[1])) codes.push(m[1]);
  return codes;
}

export function mountFinnImport(api, { R, W, upload, finnFromMail }) {
  const busy = (c) => (job?.running ? c.json({ ...jobOut(), error: 'En import pågår allerede – vent til den er ferdig' }, 409) : null);
  api.get('/finn/import/status', R, (c) => c.json(jobOut()));

  api.post('/finn/import/eml', W, upload, async (c) => {
    if (busy(c)) return busy(c);
    const b = await c.req.parseBody({ all: true });
    const files = [b.file, b.files, b['files[]']].flat().filter((x) => x instanceof File && x.size > 0);
    if (!files.length) return bad(c, 'Velg .eml-, .mbox- eller .zip-filer');
    const sources = [], errors = [];
    for (const f of files.slice(0, 50)) { try { sources.push(...await mailSources(f)); } catch (e) { errors.push(`${f.name}: ${e.message}`); } }
    if (!sources.length) return bad(c, errors[0] ?? 'Fant ingen e-poster i filene');
    const me = startJob('eml', sources.length, async (me) => {
      me.errors.push(...errors);
      for (const s of sources.slice(0, 2000)) { try { tally(me, await importOne(s, finnFromMail, 'eml')); } catch (e) { me.done++; me.errors.push(e.message); } }
    });
    return waitJob(c, me);
  });

  api.post('/finn/import/mail', W, async (c) => {
    if (busy(c)) return busy(c);
    const me = startJob('mail', 0, async (me) => {
      const r = await (mailFetcher ?? (async () => (await import('./mail.js')).fetchAllFinnMails()))();
      if (!r.ok) { me.message = r.message; me.errors.push(r.message); return; }
      me.total = r.sources.length;
      for (const s of r.sources) { try { tally(me, await importOne(s, finnFromMail, 'imap')); } catch (e) { me.done++; me.errors.push(e.message); } }
      me.message = `Fant ${r.sources.length} Finn-e-post${r.sources.length === 1 ? '' : 'er'} · ${me.added} nye handler · ${me.linked} oppdatert`;
    });
    return waitJob(c, me);
  });

  // Annonselenker (én per linje). Hver annonse hentes med samme regler som «Hent annonse» (robots.txt, 8 s mellomrom),
  // og blir en ny handel – eller oppdaterer handelen som allerede har Finn-koden.
  api.post('/finn/import/links', W, async (c) => {
    if (busy(c)) return busy(c);
    const b = await c.req.json().catch(() => ({}));
    const codes = finnCodes(b.text).slice(0, 50);
    if (!codes.length) return bad(c, 'Lim inn minst én Finn-lenke, f.eks. https://www.finn.no/recommerce/forsale/item/476377764');
    const role = b.role === 'sold' ? 'sold' : 'bought';
    const me = startJob('links', codes.length, async (me) => {
      for (const code of codes) {
        const url = `https://www.finn.no/recommerce/forsale/item/${code}`;
        let f = q('SELECT * FROM fh_finn WHERE finn_code=? ORDER BY id LIMIT 1').get(code), created = false;
        if (!f) {
          f = q("INSERT INTO fh_finn(role,item,counterpart,date,amount,steps,source,finn_code,ad_url,created) VALUES(?,?,'',?,0,'[]',?,?,?,?) ON CONFLICT(source) DO NOTHING RETURNING *")
            .get(role, `Finn-annonse ${code}`, today(), `ad:${code}`, code, url, Date.now()) ?? q('SELECT * FROM fh_finn WHERE source=?').get(`ad:${code}`);
          created = true;
        }
        try {
          if (!(MOCK && !doFetch.mocked)) { const w = lastFetch + MIN_GAP - Date.now(); if (w > 0) await sleep(w); }
          const ad = await fetchAd(f, url);
          if (created || /^Finn-annonse \d+$/.test(f.item)) q('UPDATE fh_finn SET item=?, amount=CASE WHEN amount=0 THEN ? ELSE amount END WHERE id=?').run(str(ad.title, 120) || f.item, ad.price ? Math.round(ad.price * 100) : 0, f.id);
          me.items.push({ id: f.id, code, title: ad.title, images: ad.images?.length ?? 0, status: 'ok' });
          tally(me, created ? 'added' : 'linked');
        } catch (e) {
          if (created && !q('SELECT 1 FROM fh_finn_emails WHERE finn_id=?').get(f.id)) q('DELETE FROM fh_finn WHERE id=?').run(f.id);
          me.items.push({ code, status: 'error', error: e.message });
          me.errors.push(`${code}: ${e.message}`); me.done++;
        }
      }
    });
    return waitJob(c, me);
  });
}
