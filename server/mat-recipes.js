// Mat (prompt 13): mapper, oppskrifter fra nettsider og skannede bilder, og lenker/filer per rett.
//
// Per bruker (ISO2): alle fire tabellene har user_id (gamle rader tilhører OWNER), og alle spørringer filtrerer på brukeren.
//
// Datamodell (SQLite, ved siden av rettene i kv user/'mat'):
//   food_folder(id, name, sort)                          – dish.folderId peker hit
//   dish_link(id, dish_id, title, url, file_path, kind)  – lenke (url) eller opplastet fil (file_path = mat_file.id)
//   mat_file(id, path, mime, name, size, created)        – bilder, vedlegg og originalbilder fra skanning
//   mat_scan_job(id, status, error, dish_id, name, file_id, mime, created, updated)
//
// Filene ligger i DATA_DIR/mat/ og hentes med GET /mat/api/files/:id (bak samme tilgang som resten av Mat).
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { db, OWNER } from './db.js';
import { activeUser, runAsUser } from './settings.js';
import { config } from './config.js';
import { settings, secret } from './finans/db.js';
import { sniffMime } from './finans/scan.js';
import { readJson, bad, str, MOCK, aiJson } from './homeos-common.js';
import { geminiFetch, hasGemini } from './finans/gemini-keys.js';
import { ollamaContent, ollamaPost, shortBody } from './ollama-opts.js';

const ROOT = resolve(config.dataDir, 'mat');
const rid = () => randomBytes(6).toString('hex');
const low = (s) => String(s ?? '').trim().toLowerCase();
const MAX_FILE = 25 * 1024 * 1024;
const MAX_PAGE = 4 * 1024 * 1024;

db.exec(`CREATE TABLE IF NOT EXISTS food_folder (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS dish_link (id TEXT PRIMARY KEY, dish_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT, file_path TEXT, kind TEXT NOT NULL DEFAULT 'link', created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS dish_link_dish ON dish_link(dish_id);
CREATE TABLE IF NOT EXISTS mat_file (id TEXT PRIMARY KEY, path TEXT NOT NULL, mime TEXT NOT NULL, name TEXT, size INTEGER, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mat_scan_job (id TEXT PRIMARY KEY, status TEXT NOT NULL, error TEXT, dish_id TEXT, name TEXT, file_id TEXT, mime TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);`);
for (const t of ['food_folder', 'dish_link', 'mat_file', 'mat_scan_job']) {
  if (!db.prepare(`SELECT 1 FROM pragma_table_info('${t}') WHERE name='user_id'`).get()) db.exec(`ALTER TABLE ${t} ADD COLUMN user_id TEXT`);
  db.prepare(`UPDATE ${t} SET user_id=? WHERE user_id IS NULL`).run(OWNER);
}
db.exec('CREATE INDEX IF NOT EXISTS food_folder_user ON food_folder(user_id)');
// Brukeren forespørselen eller jobben gjelder.
const mu = () => { const u = activeUser(); if (!u) throw Object.assign(new Error('Ikke innlogget'), { status: 401 }); return u; };

/* ---------------- Mapper ---------------- */

export const DEFAULT_FOLDERS = ['Middag', 'Supper', 'Fisk', 'Kylling', 'Vegetar', 'Bakst', 'Frokost', 'Favoritter'];
const qFolders = db.prepare('SELECT id, name, sort FROM food_folder WHERE user_id=? ORDER BY sort, name');
export const folders = (u = mu()) => qFolders.all(u);
export const folderById = (id, u = mu()) => (id ? db.prepare('SELECT id, name, sort FROM food_folder WHERE id=? AND user_id=?').get(id, u) ?? null : null);
export const folderByName = (n) => folders().find((f) => low(f.name) === low(n)) ?? null;

export function ensureDefaultFolders(u = mu()) {
  if (folders(u).length) return;
  const ins = db.prepare('INSERT INTO food_folder(id, name, sort, user_id) VALUES(?,?,?,?)');
  db.transaction(() => DEFAULT_FOLDERS.forEach((n, i) => ins.run(rid(), n, i, u)))();
}

// Enkel gjetning når AI ikke har svart: navn og ingredienser mot mappenavnene.
const GUESS = [
  ['Supper', /supp/],
  ['Bakst', /pizza|brød|bolle|kake|deig|bakst|scones|muffins|vaffel|rundstykk|focaccia/],
  ['Frokost', /frokost|grøt|omelett|pannekake|smoothie|granola|eggerøre/],
  ['Fisk', /fisk|laks|torsk|sei|reke|skalldyr|tunfisk|ørret|hyse|makrell|scampi/],
  ['Kylling', /kylling|høne|kalkun/],
  ['Vegetar', /vegetar|vegan|linse|halloumi|tofu|bønne|kikert|falafel/],
];
export function guessFolder(name, ing = []) {
  const t = low(`${name} ${(ing ?? []).join(' ')}`), n = low(name);
  for (const [f, re] of GUESS) if (re.test(n)) return f;
  for (const [f, re] of GUESS) if (f !== 'Supper' && f !== 'Bakst' && f !== 'Frokost' && re.test(t)) return f;
  return 'Middag';
}
export const guessFolderId = (name, ing) => (folderByName(guessFolder(name, ing)) ?? folderByName('Middag') ?? folders()[0] ?? null)?.id ?? null;

/* ---------------- Filer ---------------- */

const SAFE_INLINE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']);
const EXT_MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
};
const ALLOWED_EXT = new Set(Object.keys(EXT_MIME));
const extOf = (n) => String(n ?? '').toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? '';
const fileUrl = (id) => `/mat/api/files/${id}`;

export function storeFile(buf, mime, name = '') {
  mkdirSync(ROOT, { recursive: true });
  const id = rid(), ext = Object.entries(EXT_MIME).find(([, m]) => m === mime)?.[0] ?? (extOf(name) || 'bin');
  const path = `${id}.${ext}`;
  writeFileSync(join(ROOT, path), buf);
  db.prepare('INSERT INTO mat_file(id, path, mime, name, size, created, user_id) VALUES(?,?,?,?,?,?,?)').run(id, path, mime, str(name, 160) || path, buf.length, Date.now(), mu());
  return { id, url: fileUrl(id) };
}
const fileRow = (id) => db.prepare('SELECT * FROM mat_file WHERE id=? AND user_id=?').get(id, mu());
function removeFile(id) {
  const f = id && fileRow(id);
  if (!f) return;
  try { unlinkSync(join(ROOT, f.path)); } catch { /* allerede borte */ }
  db.prepare('DELETE FROM mat_file WHERE id=? AND user_id=?').run(id, mu());
}
const fileIdFromUrl = (u) => String(u ?? '').match(/^\/mat\/api\/files\/([a-f0-9]{12})$/)?.[1] ?? null;

/* ---------------- Lenker ---------------- */

export function linkKind(url = '', title = '', mime = '') {
  const t = low(`${url} ${title}`);
  if (/spreadsheet|ms-excel|text\/csv/.test(mime) || /\.xlsx?\b|\.csv\b|excel|docs\.google\.com\/spreadsheets|sheets|regneark|kalkulator/.test(t)) return 'sheet';
  if (mime === 'application/pdf' || /\.pdf\b/.test(t)) return 'pdf';
  if (/youtube\.com|youtu\.be|vimeo\.com|\.mp4\b|tiktok\.com/.test(t)) return 'video';
  if (/wordprocessing|msword/.test(mime) || /\.docx?\b|docs\.google\.com\/document/.test(t)) return 'doc';
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)\b/.test(t)) return 'image';
  return 'link';
}
const linkOut = (r) => ({ id: r.id, title: r.title, url: r.url ?? (r.file_path ? fileUrl(r.file_path) : null), fileUrl: r.file_path ? fileUrl(r.file_path) : null, kind: r.kind });
const qLinks0 = db.prepare('SELECT * FROM dish_link WHERE dish_id=? AND user_id=? ORDER BY created');
const qLinks = { all: (dishId) => qLinks0.all(dishId, mu()) };
export const linksFor = (dishId) => qLinks.all(dishId).map(linkOut);
export function allLinks() {
  const m = new Map();
  for (const r of db.prepare('SELECT * FROM dish_link WHERE user_id=? ORDER BY created').all(mu())) { if (!m.has(r.dish_id)) m.set(r.dish_id, []); m.get(r.dish_id).push(linkOut(r)); }
  return m;
}
export function removeDishData(dish) {
  for (const r of qLinks.all(dish.id)) removeFile(r.file_path);
  db.prepare('DELETE FROM dish_link WHERE dish_id=? AND user_id=?').run(dish.id, mu());
  const img = fileIdFromUrl(dish.image);
  if (img) removeFile(img);
  if (dish.scanFile) removeFile(dish.scanFile);
}

/* ---------------- Henting av nettsider (med vern mot interne adresser) ---------------- */

const privateV4 = (ip) => {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};
const privateIp = (ip) => (isIP(ip) === 4 ? privateV4(ip) : /^(::1|::|fc|fd|fe80|::ffff:(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip));
async function assertPublic(u) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol)) throw new Error('Bare http- og https-adresser');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new Error('Lokale adresser kan ikke hentes');
  if (isIP(host)) { if (privateIp(host)) throw new Error('Lokale adresser kan ikke hentes'); return url; }
  try { const addrs = await lookup(host, { all: true }); if (addrs.some((a) => privateIp(a.address))) throw new Error('Lokale adresser kan ikke hentes'); }
  catch (e) { if (/Lokale/.test(e.message)) throw e; /* DNS-feil: fetch gir en tydeligere melding */ }
  return url;
}
const UA = 'Mozilla/5.0 (compatible; HomelabOS-Mat/1.0; +https://github.com/SebastianKristo/torskenes-verden)';
// Følger opptil 4 omdirigeringer manuelt, så hver ny adresse sjekkes.
async function safeFetch(u, { accept = 'text/html,application/xhtml+xml', max = MAX_PAGE, timeout = 15_000 } = {}) {
  let url = String(u);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    let res;
    try { res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5' }, signal: AbortSignal.timeout(timeout) }); }
    catch (e) { throw new Error(e.name === 'TimeoutError' ? 'Siden svarte ikke i tide' : `Kunne ikke hente siden (${e.cause?.code ?? e.message})`); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location'), url).href; continue; }
    if (!res.ok) throw new Error(`Siden svarte ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) throw new Error('Siden er for stor');
    return { url, buf, type: res.headers.get('content-type') ?? '' };
  }
  throw new Error('For mange omdirigeringer');
}

/* ---------------- Tolking av oppskrifter ---------------- */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aring: 'å', Aring: 'Å', oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ', eacute: 'é', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export const decode = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m));
const clean = (s, max = 300) => decode(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max);
const asArr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ISO 8601-varighet (PT1H30M) → «1 t 30 min».
export function duration(v) {
  const m = String(v ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m || !(m[1] || m[2] || m[3])) return clean(v, 30) || null;
  const min = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  if (!min) return null;
  const h = Math.floor(min / 60), r = min % 60;
  return h ? `${h} t${r ? ` ${r} min` : ''}` : `${r} min`;
}
const sumDur = (...vs) => {
  let min = 0;
  for (const v of vs) { const m = String(v ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i); if (m) min += (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0); }
  return min ? duration(`PT${min}M`) : null;
};
function yieldOf(v) {
  const a = asArr(v).map((x) => clean(x, 40)).filter(Boolean);
  const withNum = a.find((x) => /\d/.test(x)) ?? a[0];
  if (!withNum) return null;
  const n = withNum.match(/\d+(?:[.,]\d+)?/)?.[0];
  return n && /^\d+(?:[.,]\d+)?\s*(porsjon\w*|pers\w*|stk|servings?|people)?$/i.test(withNum) ? n.replace(',', '.') : withNum;
}
const imageOf = (v) => {
  for (const x of asArr(v)) {
    if (typeof x === 'string' && x) return x;
    if (x && typeof x === 'object') { const u = x.url ?? x.contentUrl ?? x['@id']; if (typeof u === 'string' && u) return u; }
  }
  return null;
};
function stepsOf(v) {
  const out = [];
  const walk = (x) => {
    if (!x) return;
    if (typeof x === 'string') { for (const p of decode(x).split(/\r?\n|<br\s*\/?>|<\/p>|<\/li>/i)) { const t = clean(p, 600); if (t) out.push(t.replace(/^\d+[.)]\s+/, '')); } return; }
    if (Array.isArray(x)) return x.forEach(walk);
    if (typeof x === 'object') {
      const t = asArr(x['@type']).join(' ');
      if (/HowToSection/i.test(t)) { walk(x.itemListElement); return; }
      if (x.text) return walk(x.text);
      if (x.name) return walk(x.name);
      if (x.itemListElement) walk(x.itemListElement);
    }
  };
  walk(v);
  return out.slice(0, 40);
}

const isRecipe = (o) => o && typeof o === 'object' && asArr(o['@type']).some((t) => /(^|\/)Recipe$/i.test(String(t)));
function findRecipe(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) { for (const x of node) { const r = findRecipe(x, depth + 1); if (r) return r; } return null; }
  if (typeof node !== 'object') return null;
  if (isRecipe(node)) return node;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) { const r = findRecipe(node[k], depth + 1); if (r) return r; }
  return null;
}

// JSON-LD: <script type="application/ld+json"> med @type Recipe (også inne i @graph).
export function fromJsonLd(html) {
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    const raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try { data = JSON.parse(raw); } catch { try { data = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    const r = findRecipe(data);
    if (!r) continue;
    const name = clean(r.name ?? r.headline, 120);
    if (!name) continue;
    return {
      name, image: imageOf(r.image),
      ingredients: asArr(r.recipeIngredient ?? r.ingredients).map((x) => clean(x, 200)).filter(Boolean).slice(0, 60),
      steps: stepsOf(r.recipeInstructions),
      servings: yieldOf(r.recipeYield),
      time: r.totalTime ? duration(r.totalTime) : sumDur(r.prepTime, r.cookTime),
      method: 'jsonld',
    };
  }
  return null;
}

// Microdata: itemtype="https://schema.org/Recipe" med itemprop-felter.
export function fromMicrodata(html) {
  const start = html.search(/itemtype\s*=\s*["']https?:\/\/schema\.org\/Recipe["']/i);
  if (start < 0) return null;
  const part = html.slice(start, start + 400_000);
  const props = (name) => {
    const out = [];
    const re = new RegExp(`<(\\w+)[^>]*itemprop\\s*=\\s*["'][^"']*\\b${name}\\b[^"']*["'][^>]*>`, 'gi');
    let m;
    while ((m = re.exec(part))) {
      const tag = m[0], el = m[1].toLowerCase();
      const attr = (a) => tag.match(new RegExp(`\\b${a}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
      if (attr('content') != null) { out.push(decode(attr('content'))); continue; }
      if (el === 'img' || el === 'link' || el === 'meta') { const v = attr('src') ?? attr('href'); if (v) out.push(v); continue; }
      const close = part.indexOf(`</${el}>`, m.index + tag.length);
      if (close > 0) out.push(part.slice(m.index + tag.length, close));
    }
    return out;
  };
  const name = clean(props('name')[0], 120);
  if (!name) return null;
  return {
    name, image: props('image')[0] ?? null,
    ingredients: [...props('recipeIngredient'), ...props('ingredients')].map((x) => clean(x, 200)).filter(Boolean).slice(0, 60),
    steps: stepsOf(props('recipeInstructions').join('\n')),
    servings: yieldOf(props('recipeYield')),
    time: duration(props('totalTime')[0]) ?? sumDur(props('prepTime')[0], props('cookTime')[0]),
    method: 'microdata',
  };
}

// Synlig tekst til AI: uten skript, stil, navigasjon og kommentarer.
export function pageText(html, max = 14_000) {
  return decode(String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h\d|tr|br|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, max);
}
const ogImage = (html) => html.match(/<meta[^>]+property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i)?.[1]
  ?? html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i)?.[1] ?? null;

const RECIPE_SCHEMA = (folderNames) => ({ type: 'OBJECT', properties: {
  name: { type: 'STRING' }, ingredients: { type: 'ARRAY', items: { type: 'STRING' } }, steps: { type: 'ARRAY', items: { type: 'STRING' } },
  servings: { type: 'STRING' }, time: { type: 'STRING' }, folder: { type: 'STRING', enum: folderNames.length ? folderNames : undefined },
}, required: ['name', 'ingredients', 'steps'] });
const recipePrompt = (folderNames, what) => `${what}
Returner KUN JSON etter skjemaet, på norsk bokmål:
- name: rettens navn
- ingredients: én ingrediens per element med mengde, f.eks. «400 g kjøttdeig»
- steps: ett kort steg per element, i rekkefølge
- servings: antall porsjoner hvis det står, ellers tom
- time: total tid som «45 min» eller «1 t 15 min» hvis det står, ellers tom
- folder: den mappen som passer best blant: ${folderNames.join(', ')}
Er det ingen oppskrift her, returner name som tom tekst.`;

// Kan byttes ut i tester: { text(prompt, schema), vision(buf, mime, prompt, schema) } → { provider, data }.
let AI = null;
export function setRecipeAi(fn) { AI = fn; }

async function visionJson(buf, mime, prompt, schema) {
  if (AI?.vision) return AI.vision(buf, mime, prompt, schema);
  const st = settings();
  let order = [...new Set([st.provider, ...(st.fallback ? [st.provider === 'ollama' ? 'gemini' : 'ollama'] : [])])];
  // Ollama leser verken PDF eller HEIC; da går det rett til Gemini.
  if (mime === 'application/pdf' || /hei[cf]/.test(mime)) order = ['gemini'];
  const errors = [];
  for (const p of order) {
    try {
      if (p === 'gemini') {
        if (!hasGemini()) throw new Error('Gemini-nøkkel mangler (FinansHub → Innstillinger → AI-motor)');
        const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(st.geminiModel)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90_000),
          body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mime, data: buf.toString('base64') } }, { text: prompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: schema } }),
        });
        if (!res.ok) { let d = ''; try { const j = await res.json(); d = j.error?.message ?? ''; } catch { /* tomt */ } throw new Error(`Gemini svarte ${res.status}${d ? `: ${String(d).slice(0, 140)}` : ''}`); }
        const d = await res.json();
        const text = d.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '';
        return { provider: 'Gemini', data: JSON.parse(text) };
      }
      const lowerSchema = (s) => (Array.isArray(s) ? s.map(lowerSchema) : s && typeof s === 'object' ? Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined).map(([k, v]) => [k, k === 'type' ? String(v).toLowerCase() : lowerSchema(v)])) : s);
      const res = await ollamaPost((u, i) => fetch(u, i), `${st.ollamaUrl.replace(/\/$/, '')}/api/chat`,
        shortBody({ model: st.ollamaModel, stream: false, format: lowerSchema(schema), options: { temperature: 0.1 }, messages: [{ role: 'user', content: prompt, images: [buf.toString('base64')] }] }),
        { signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT ?? 120) * 1000) });
      if (!res.ok) throw new Error(`Ollama svarte ${res.status}`);
      return { provider: 'Ollama', data: JSON.parse(ollamaContent(await res.json())) };
    } catch (e) {
      errors.push(`${p === 'gemini' ? 'Gemini' : 'Ollama'}: ${e.name === 'TimeoutError' ? 'svarte ikke i tide' : e.cause?.code ? `kan ikke nås (${e.cause.code})` : e.message}`);
    }
  }
  throw new Error(errors.join(' · ') || 'Ingen AI-motor');
}
const textJson = (prompt, schema) => (AI?.text ? AI.text(prompt, schema) : aiJson(prompt, schema));

const lineList = (v, max, len) => asArr(v).map((x) => clean(x, len)).filter(Boolean).slice(0, max);
function normalize(r, fallback = {}) {
  return {
    name: clean(r?.name, 80),
    ingredients: lineList(r?.ingredients, 60, 200),
    steps: lineList(r?.steps, 40, 600).map((s) => s.replace(/^\d+[.)]\s+/, '')),
    servings: clean(r?.servings, 20) || fallback.servings || null,
    time: clean(r?.time, 30) || fallback.time || null,
    folder: clean(r?.folder, 40) || null,
  };
}

// Lim inn en adresse → forhåndsvisning. JSON-LD først, så microdata, så AI på den rensede teksten.
export async function importFromUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl ?? '').trim()); } catch { throw new Error('Ugyldig adresse'); }
  const page = await safeFetch(u.href);
  const html = page.buf.toString('utf8');
  let r = fromJsonLd(html) ?? fromMicrodata(html), provider = null;
  if (!r || (!r.ingredients.length && !r.steps.length)) {
    const names = folders().map((f) => f.name);
    const text = pageText(html);
    if (text.length < 80) throw new Error('Fant ingen oppskrift på siden');
    let ai;
    try { ai = await textJson(recipePrompt(names, `Her er teksten fra nettsiden ${page.url}. Finn oppskriften.\n\n${text}`), RECIPE_SCHEMA(names)); }
    catch (e) { throw new Error(`Fant ingen oppskrift i sidens data, og AI kunne ikke lese den (${e.message})`); }
    const n = normalize(ai.data);
    if (!n.name || (!n.ingredients.length && !n.steps.length)) throw new Error('Fant ingen oppskrift på siden');
    r = { ...n, image: r?.image ?? ogImage(html), method: 'ai' };
    provider = ai.provider;
  } else if (!r.image) r.image = ogImage(html);
  const image = r.image ? new URL(decode(r.image), page.url).href : null;
  return {
    name: r.name, image, time: r.time ?? null, servings: r.servings ?? null,
    ingredients: r.ingredients, steps: r.steps, sourceUrl: page.url,
    folderSuggestion: (r.folder && folderByName(r.folder)?.name) || guessFolder(r.name, r.ingredients),
    method: r.method, provider,
  };
}

// Bildet lastes ned lokalt, så retten ikke er avhengig av nettstedet senere.
export async function downloadImage(url) {
  if (!url) return null;
  if (fileIdFromUrl(url)) return url;
  try {
    const r = await safeFetch(url, { accept: 'image/avif,image/webp,image/jpeg,image/png,image/*', max: 10 * 1024 * 1024 });
    const mime = sniffMime(r.buf, r.type, url);
    if (!mime || !mime.startsWith('image/')) return null;
    return storeFile(r.buf, mime, `bilde.${mime.split('/')[1]}`).url;
  } catch { return null; }
}

/* ---------------- Skanning (kø i bakgrunnen) ---------------- */

const jobOut = (j) => ({ id: j.id, status: j.status, error: j.error ?? null, dishId: j.dish_id ?? null, name: j.name ?? null, created: j.created, updated: j.updated, image: j.file_id ? fileUrl(j.file_id) : null });
export const jobs = (u = mu()) => db.prepare('SELECT * FROM mat_scan_job WHERE user_id=? ORDER BY created DESC LIMIT 30').all(u).map(jobOut);
const setJob = (id, f) => db.prepare(`UPDATE mat_scan_job SET ${Object.keys(f).map((k) => `${k}=@${k}`).join(', ')}, updated=@updated WHERE id=@id`).run({ ...f, id, updated: Date.now() });

let running = false, ctx = null;
async function work() {
  if (running || !ctx) return;
  running = true;
  try {
    for (;;) {
      const j = db.prepare("SELECT * FROM mat_scan_job WHERE status='queued' ORDER BY created LIMIT 1").get();
      if (!j) break;
      setJob(j.id, { status: 'reading' });
      await runAsUser(j.user_id ?? OWNER, () => scanOne(j));
    }
  } finally { running = false; }
}
// Én skannejobb, i brukerens kontekst (mapper, filer og den nye retten blir brukerens).
async function scanOne(j) {
  try {
    const f = fileRow(j.file_id);
    if (!f || !existsSync(join(ROOT, f.path))) throw new Error('Originalbildet mangler');
    const buf = readFileSync(join(ROOT, f.path)), names = folders().map((x) => x.name);
    let n;
    try {
      const ask = visionJson(buf, f.mime, recipePrompt(names, 'Du leser et bilde eller en PDF av en oppskrift (kokebok, utklipp, håndskrift eller skjermbilde).'), RECIPE_SCHEMA(names));
      // Med eksempeldata venter vi ikke på en AI-motor som ikke finnes.
      const r = MOCK && !AI ? await Promise.race([ask, new Promise((_, rej) => setTimeout(() => rej(new Error('tidsavbrudd')), 2500).unref?.())]) : await ask;
      n = normalize(r.data);
    } catch (e) {
      if (!MOCK) throw e;
      // Eksempeldata uten AI: lag en plausibel rett så flyten kan prøves.
      n = { name: 'Skannet fiskegrateng', ingredients: ['400 g torsk', '3 dl makaroni', '4 dl melk', '2 egg', 'Revet ost'], steps: ['Kok makaronien.', 'Visp egg og melk.', 'Legg fisk og makaroni i form, hell over og stek på 200 °C i 35 minutter.'], servings: '4', time: '50 min', folder: 'Fisk' };
    }
    if (!n.name || (!n.ingredients.length && !n.steps.length)) throw new Error('Fant ingen oppskrift i bildet');
    const dish = ctx.addDish({ ...n, folderId: (n.folder && folderByName(n.folder)?.id) || guessFolderId(n.name, n.ingredients), src: 'scan', scanFile: f.id, image: f.mime.startsWith('image/') ? fileUrl(f.id) : null });
    setJob(j.id, { status: 'done', dish_id: dish.id, name: dish.name, error: null });
  } catch (e) {
    console.error('[mat] skanning feilet:', e.message);
    setJob(j.id, { status: 'error', error: String(e.message).slice(0, 300) });
  }
}

/* ---------------- Ruter ---------------- */

const fileOf = async (c) => {
  const b = await c.req.parseBody({ all: true });
  const files = [].concat(b.file ?? [], b.files ?? []).filter((x) => x && typeof x === 'object' && typeof x.arrayBuffer === 'function');
  return { b, files };
};

/**
 * Monterer rutene på Mat-API-et. ctx = { state, save, dishOf, addDish(fields) → dish, reply(c, s, start, extra, status), startOf(c, body) }.
 */
export function mountRecipes(api, context) {
  ctx = context;
  // Jobber som sto midt i lesingen da serveren stoppet, legges tilbake i køen.
  db.prepare("UPDATE mat_scan_job SET status='queued' WHERE status='reading'").run();
  setTimeout(work, 2000).unref?.();

  /* Mapper */
  api.get('/folders', (c) => {
    const s = ctx.state(), cnt = {};
    for (const d of s.dishes) if (d.folderId) cnt[d.folderId] = (cnt[d.folderId] ?? 0) + 1;
    return c.json(folders().map((f) => ({ ...f, count: cnt[f.id] ?? 0 })));
  });
  api.post('/folders', async (c) => {
    const b = await readJson(c), name = str(b.name, 40);
    if (!name) return bad(c, 'Skriv et navn på mappen.');
    if (folderByName(name)) return bad(c, `Mappen ${name} finnes allerede.`, 409);
    if (folders().length >= 60) return bad(c, 'Maks 60 mapper');
    const id = rid(), sort = Math.max(-1, ...folders().map((f) => f.sort)) + 1;
    db.prepare('INSERT INTO food_folder(id, name, sort, user_id) VALUES(?,?,?,?)').run(id, name, sort, mu());
    return c.json({ id, name, sort, count: 0 }, 201);
  });
  api.patch('/folders/:id', async (c) => {
    const f = folderById(c.req.param('id'));
    if (!f) return bad(c, 'Fant ikke mappen', 404);
    const b = await readJson(c);
    const name = b.name !== undefined ? str(b.name, 40) : f.name;
    if (!name) return bad(c, 'Skriv et navn på mappen.');
    const twin = folderByName(name);
    if (twin && twin.id !== f.id) return bad(c, `Mappen ${name} finnes allerede.`, 409);
    const sort = b.sort !== undefined && Number.isFinite(+b.sort) ? Math.round(+b.sort) : f.sort;
    db.prepare('UPDATE food_folder SET name=?, sort=? WHERE id=? AND user_id=?').run(name, sort, f.id, mu());
    return c.json({ ...f, name, sort });
  });
  api.delete('/folders/:id', (c) => {
    const f = folderById(c.req.param('id'));
    if (!f) return bad(c, 'Fant ikke mappen', 404);
    const s = ctx.state();
    let moved = 0;
    for (const d of s.dishes) if (d.folderId === f.id) { d.folderId = null; moved++; }
    ctx.save(s);
    db.prepare('DELETE FROM food_folder WHERE id=? AND user_id=?').run(f.id, mu());
    return c.json({ ok: true, moved, status: `Mappen ${f.name} er slettet.${moved ? ` ${moved} ${moved === 1 ? 'rett' : 'retter'} ligger nå uten mappe.` : ''}` });
  });

  /* Import fra nettside */
  api.post('/recipes/import', async (c) => {
    const b = await readJson(c);
    try { return c.json(await importFromUrl(b.url)); } catch (e) { return bad(c, e.message, 422); }
  });
  api.post('/recipes/import/save', async (c) => {
    const b = await readJson(c), p = b.preview && typeof b.preview === 'object' ? b.preview : null;
    if (!p) return bad(c, 'Forhåndsvisningen mangler');
    const n = normalize(p, { servings: p.servings != null ? String(p.servings) : null, time: p.time });
    if (!n.name) return bad(c, 'Retten mangler navn');
    const folderId = folderById(b.folderId)?.id ?? (p.folderSuggestion && folderByName(p.folderSuggestion)?.id) ?? guessFolderId(n.name, n.ingredients);
    let sourceUrl = null;
    try { const u = new URL(String(p.sourceUrl ?? '')); if (/^https?:$/.test(u.protocol)) sourceUrl = u.href; } catch { /* uten kilde */ }
    const image = p.image ? await downloadImage(String(p.image)) : null;
    try {
      const dish = ctx.addDish({ ...n, folderId, sourceUrl, image, src: 'web' });
      const s = ctx.state();
      return ctx.reply(c, s, ctx.startOf(c, b), { dish: ctx.dishOut(s, dish), status: `${dish.name} er importert${sourceUrl ? ` fra ${new URL(sourceUrl).hostname.replace(/^www\./, '')}` : ''} og lagt i ${folderById(folderId)?.name ?? 'ingen mappe'}.` }, 201);
    } catch (e) { return bad(c, e.message, e.status ?? 400); }
  });

  /* Skann oppskrift */
  api.post('/recipes/scan', async (c) => {
    if (!(c.req.header('content-type') ?? '').includes('multipart')) return bad(c, 'Send bildet som multipart (felt «file»).');
    const { files } = await fileOf(c);
    if (!files.length) return bad(c, 'Velg et bilde eller en PDF.');
    const out = [];
    for (const f of files.slice(0, 10)) {
      if (f.size > MAX_FILE) return bad(c, `${f.name || 'Filen'} er for stor (maks 25 MB).`, 413);
      const buf = Buffer.from(await f.arrayBuffer()), mime = sniffMime(buf, f.type, f.name);
      if (!mime || !(mime.startsWith('image/') || mime === 'application/pdf')) return bad(c, `${f.name || 'Filen'} er verken bilde eller PDF.`, 415);
      const file = storeFile(buf, mime, f.name || 'oppskrift');
      const id = rid(), now = Date.now();
      db.prepare('INSERT INTO mat_scan_job(id, status, file_id, mime, name, created, updated, user_id) VALUES(?,?,?,?,?,?,?,?)').run(id, 'queued', file.id, mime, str(f.name, 120) || null, now, now, mu());
      out.push(id);
    }
    queueMicrotask(work);
    return c.json({ jobId: out[0], jobIds: out, jobs: jobs() }, 202);
  });
  api.get('/recipes/jobs', (c) => c.json(jobs()));
  api.delete('/recipes/jobs/:id', (c) => {
    const j = db.prepare('SELECT * FROM mat_scan_job WHERE id=? AND user_id=?').get(c.req.param('id'), mu());
    if (!j) return bad(c, 'Fant ikke jobben', 404);
    if (j.status === 'reading') return bad(c, 'Jobben leses nå. Prøv igjen om litt.', 409);
    if (!j.dish_id) removeFile(j.file_id);
    db.prepare('DELETE FROM mat_scan_job WHERE id=? AND user_id=?').run(j.id, mu());
    return c.json({ ok: true });
  });
  api.post('/recipes/jobs/:id/retry', (c) => {
    const j = db.prepare('SELECT * FROM mat_scan_job WHERE id=? AND user_id=?').get(c.req.param('id'), mu());
    if (!j) return bad(c, 'Fant ikke jobben', 404);
    if (j.status !== 'error') return bad(c, 'Bare jobber som feilet kan prøves igjen.', 409);
    setJob(j.id, { status: 'queued', error: null });
    queueMicrotask(work);
    return c.json(jobs());
  });

  /* Lenker og filer per rett */
  api.post('/dishes/:id/links', async (c) => {
    const s = ctx.state(), d = ctx.dishOf(s, c.req.param('id'));
    if (!d) return bad(c, 'Fant ikke retten', 404);
    if (qLinks.all(d.id).length >= 30) return bad(c, 'Maks 30 lenker og filer per rett');
    const ins0 = db.prepare('INSERT INTO dish_link(id, dish_id, title, url, file_path, kind, created, user_id) VALUES(?,?,?,?,?,?,?,?)'), me = mu();
    const ins = { run: (...a) => ins0.run(...a, me) };
    if ((c.req.header('content-type') ?? '').includes('multipart')) {
      const { b, files } = await fileOf(c);
      if (!files.length) return bad(c, 'Velg en fil.');
      for (const f of files.slice(0, 10)) {
        const ext = extOf(f.name);
        if (f.size > MAX_FILE) return bad(c, `${f.name} er for stor (maks 25 MB).`, 413);
        const buf = Buffer.from(await f.arrayBuffer());
        const sniffed = sniffMime(buf, f.type, f.name);
        const mime = sniffed ?? (ALLOWED_EXT.has(ext) ? EXT_MIME[ext] : null);
        if (!mime) return bad(c, `${f.name || 'Filen'}: bare xlsx, csv, pdf, docx og bilder kan lastes opp.`, 415);
        const file = storeFile(buf, mime, f.name);
        const title = (files.length === 1 && str(b.title, 120)) || str(f.name, 120) || 'Fil';
        ins.run(rid(), d.id, title, null, file.id, linkKind('', f.name, mime), Date.now());
      }
    } else {
      const b = await readJson(c);
      let url;
      try { url = new URL(String(b.url ?? '').trim()); } catch { return bad(c, 'Ugyldig lenke'); }
      if (!/^https?:$/.test(url.protocol)) return bad(c, 'Lenken må starte med http:// eller https://');
      const title = str(b.title, 120) || decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '') || url.hostname.replace(/^www\./, '');
      ins.run(rid(), d.id, title.slice(0, 120), url.href, null, linkKind(url.href, title), Date.now());
    }
    return ctx.reply(c, s, ctx.startOf(c), { dish: ctx.dishOut(s, d), links: linksFor(d.id) }, 201);
  });
  api.delete('/dishes/:id/links/:lid', (c) => {
    const s = ctx.state(), d = ctx.dishOf(s, c.req.param('id'));
    const r = d && db.prepare('SELECT * FROM dish_link WHERE id=? AND dish_id=? AND user_id=?').get(c.req.param('lid'), d.id, mu());
    if (!r) return bad(c, 'Fant ikke lenken', 404);
    removeFile(r.file_path);
    db.prepare('DELETE FROM dish_link WHERE id=? AND user_id=?').run(r.id, mu());
    return ctx.reply(c, s, ctx.startOf(c), { dish: ctx.dishOut(s, d), links: linksFor(d.id) });
  });

  /* Filer */
  api.get('/files/:id', (c) => {
    const f = fileRow(c.req.param('id'));
    if (!f || !existsSync(join(ROOT, f.path))) return bad(c, 'Fant ikke filen', 404);
    const inline = SAFE_INLINE.has(f.mime);
    const name = String(f.name || f.path).replace(/[^\w.\- æøåÆØÅ]/g, '_');
    return c.body(readFileSync(join(ROOT, f.path)), 200, {
      'Content-Type': inline ? f.mime : (f.mime || 'application/octet-stream'),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
  });
}
