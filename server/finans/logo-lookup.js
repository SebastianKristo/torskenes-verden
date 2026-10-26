// Prompt 27 (+ prompt 69): logo-oppslag for butikker uten at AI gjetter URL-er. AI brukes bare til å foreslå domener ut fra det
// ryddede butikknavnet; koden henter og sjekker logoen selv. Rekkefølgen (stopp på første treff):
//   1. merchant_logos (egen tabell per bruker, manuelle valg vinner alltid, sjekkes på nytt etter 90 dager, «ingen» etter 7 dager)
//   2. rydd navnet uten AI (AS/ASA, org.nr., kortnr., butikknummer, sted) + kjente kjeder (logobiblioteket i server/logos)
//      — «Finansdata forlater aldri huset» (externalBlocked48) stopper alt herfra som går ut: bare steg 7 kan kjøre —
//   3. Brønnøysundregistrene (org.nr. først, så navn) → hjemmeside
//   3b. Wikidata (prompt 69, innstillingen logo_wikidata, på som standard): bare det ryddede navnet, logget i ai_audit (wikidata).
//      wbsearchentities (nb, så en) → wbgetentities for de 3 beste. Godtas bare når P31 er virksomhet/kjede/merkevare, landet er
//      Norge (P17 Q20) eller domenet (P856) er .no/står i registeret, og en etikett/et alias er navnet. Logo fra P154 → P8972 → P2910
//      som PNG fra Commons (Special:FilePath/<fil>?width=256, aldri SVG). Bare P856 → domenet prøves som i steg 6.
//      Én forespørsel om gangen per vert, egen User-Agent med kontaktadresse, tidsgrense 6 s og hurtigbuffer.
//   4. Gemini, KUN via logoLookup(name, country): sanert navn (maks 60 tegn) + land, Google Search grounding,
//      JSON {domene, alternativer (maks 2), sikkerhet}. Sikkerhet < 0.5 → ingen forsøk. Maks 3 domener, i rekkefølge, alle med
//      «svarer» og (med «Sjekk logoen») <title> som inneholder navnet. Sosiale medier og kataloger hoppes over.
//   5. gjett domene (navn.no/.com/.se): krever HTTP 200 og at <title> inneholder navnet
//   6. hent ikon fra domenet: apple-touch-icon (største) → manifest-ikonene (største) → <link rel=icon> (SVG bare med ImageMagick,
//      så største) → og:logo → og:image (bare kvadratisk) → /favicon.svg (bare med ImageMagick) → /favicon.ico → Google s2 (reserve).
//      Under 32 px brukes bare når ingenting større finnes (og aldri med «Sjekk logoen»). 403 respekteres (ingen nytt forsøk).
//   7. klipp logoen fra kvitteringen lokalt (Ollama-bildemodell gir en boks, ImageMagick klipper)
//   8. ingen treff → {none:true} (klienten viser initialer og «Velg logo»)
// Personvern: Ollama (lokalt) kan se hele kvitteringen. Gemini får bare {butikk, land}, Wikidata bare {navn}. Begge logges i ai_audit.
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from '../config.js';
import { userBool } from '../settings.js';
import { db, me, settings } from './db.js';
import { geminiFetch, hasGemini } from './gemini-keys.js';
import { aiTimeoutsOf, GEMINI_DEFAULT } from './ai.js';
import { audit } from './ai-audit.js';
import { validDomain } from './enrich.js';
import { matchMerchant, filePath as libraryFile, itemForDomain, normalize as libNorm } from '../logos/match.js';
import { ocrTools } from '../ocr-fallback.js';
import { run as aiRun } from '../ai-run.js';
import { externalBlocked48 } from '../receipts48/settings.js'; // prompt 48: «Finansdata forlater aldri huset»

const run = promisify(execFile);
const q = (sql) => db.prepare(sql);
export const LOGO_DIR = resolve(config.dataDir, 'logos');
const RECHECK_MS = 90 * 86400_000;
const NONE_RECHECK_MS = 7 * 86400_000;

db.exec(`CREATE TABLE IF NOT EXISTS merchant_logos (
  key TEXT NOT NULL, user_id TEXT NOT NULL, domain TEXT, file TEXT, source TEXT, checked_at INTEGER NOT NULL, manual INTEGER NOT NULL DEFAULT 0, name TEXT,
  PRIMARY KEY (user_id, key))`);

// Tester setter egen fetch (alt nett i modulen går hit). Gemini går via geminiFetch (nøkkelrotasjon), som bruker global fetch.
let fx = null;
export const _setLogoFetch = (fn) => { fx = fn; };
const F = (url, init = {}) => (fx ?? globalThis.fetch)(url, { redirect: 'follow', ...init, signal: init.signal ?? AbortSignal.timeout(init.timeout ?? 6000) });
let ollamaBox = null; // tester: egen «bildemodell» for steg 7
export const _setLogoOllama = (fn) => { ollamaBox = fn; };

/* ---------------- Steg 2: rydd navnet ---------------- */

const norm = (s) => String(s ?? '').toLowerCase().replace(/å/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').replace(/\u0001/g, 'å');
// Kjente kjeder (visningsnavn). Tall i navnet (Rema 1000, Apotek 1, 7-Eleven) beholdes.
export const CHAINS = ['Blomsterlandet', 'Plantasjen', 'Kiwi', 'Rema 1000', 'Meny', 'Joker', 'Spar', 'Eurospar', 'Bunnpris', 'Coop Extra', 'Coop Mega', 'Coop Prix', 'Coop Obs', 'Obs Bygg',
  'Coop Marked', 'Coop', 'Extra', 'Oda', 'Vinmonopolet', 'Circle K', 'Esso', 'Shell', 'Uno-X', 'St1', 'YX', 'Elkjøp', 'Power', 'Komplett', 'NetOnNet', 'Clas Ohlson', 'Biltema', 'Jula',
  'Ikea', 'Jysk', 'XXL', 'Sport 1', 'Intersport', 'Normal', 'Europris', 'Nille', 'Tilbords', 'Kid', 'Princess', 'Kitch\'n', 'Søstrene Grene', 'Flying Tiger', 'Apotek 1', 'Vitusapotek',
  'Boots', 'Ditt Apotek', 'Narvesen', '7-Eleven', 'Deli de Luca', 'Espresso House', 'Kaffebrenneriet', 'Starbucks', 'Peppes', 'McDonalds', 'Burger King', 'Max', 'H&M', 'Cubus',
  'Dressmann', 'Zara', 'Lindex', 'KappAhl', 'Bik Bok', 'Carlings', 'Jernia', 'Byggmax', 'Maxbo', 'Montér', 'Megaflis', 'Rusta', 'Ark', 'Norli', 'Ruter', 'Vy', 'Flytoget',
  'Fjellsport', 'Stormberg', 'Anton Sport', 'Gant', 'Mester Grønn', 'Interflora', 'Bohus', 'Skeidar', 'Fagmøbler', 'Hageland', 'Felleskjøpet', 'Thansen', 'Mekonomen', 'Bilxtra'];
const CHAIN_KEYS = CHAINS.map((n) => [norm(n), n]).sort((a, b) => b[0].length - a[0].length);
const LEGAL = /\b(as|asa|ans|da|enk|sa|nuf|ba|ks|norge|norway|avd|avdeling|filial)\b/g;
// Vanlige steder på kvitteringer (sist i navnet). Fjernes når kjeden ikke er kjent.
const PLACES = new Set(('oslo bergen trondheim stavanger tromsø drammen kristiansand fredrikstad sandnes ski lambertseter pilestredet majorstuen storo grünerløkka grunerlokka '
  + 'sentrum torggata bogstadveien sandvika asker bærum lillestrøm jessheim moss sarpsborg hamar lillehammer gjøvik tønsberg sandefjord larvik skien porsgrunn arendal bodø ålesund '
  + 'molde haugesund kolbotn nydalen bryn ryen tveita furuset lørenskog strømmen kolsås lysaker bislett frogner grønland vika aker brygge alnabru økern sinsen ullevål røa holmen '
  + 'lading flytoget stasjon senter storsenter kjøpesenter amfi city jernbanetorget sjølyst').split(' '));
const NOISE = new Set(('kvittering salgskvittering kortkjøp kortkjop betaling kjøp kjop terminal bax ref kasse kassa nr org varer salg kopi visa mastercard bankaxept '
  + 'kontaktløs kontaktlos sum total totalt beløp belop').split(' '));
const cap = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/** «BLOMSTERLANDET SKI AS 9812» → {name:'Blomsterlandet', key:'blomsterlandet', chain:true}. */
export function cleanName(raw) {
  let s = norm(raw).replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:vipps\s*\*|iz\s*\*|sumup\s*\*|zettle_?\s*\*|klarna\s*\*|paypal\s*\*|google\s*\*|apple\.com\/bill|dnb\s*\*|kortkjøp\s+|varer\s+|visa\s+)/, '').trim();
  s = s.replace(/\bno\s*\d{3}\s*\d{3}\s*\d{3}\s*(?:mva)?\b/g, ' ').replace(/\b(?:org\.?\s*nr\.?|foretaksregisteret|mva)\b[:.]?/g, ' ');
  s = s.replace(/(?:\*{2,}|x{2,})\s*\d{2,4}/g, ' ').replace(/\b\d{4}\s?\d{2}\s?\d{2}\s?\d{4,}\b/g, ' ');
  const padded = ` ${s.replace(/[^\p{L}\p{N}&'+-]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const [k, n] of CHAIN_KEYS) if (padded.startsWith(` ${k} `) || (k.length >= 5 && padded.includes(` ${k} `))) return { name: n, key: slug(n), chain: true };
  let words = padded.replace(/\d+/g, ' ').replace(LEGAL, ' ').replace(/[&'+]+/g, ' ').split(' ').filter((w) => w && w !== '-');
  // Første ord beholdes alltid; steder og kvitteringsord etter det fjernes.
  words = words.filter((w, i) => i === 0 || (!PLACES.has(w) && !NOISE.has(w)));
  words = words.slice(0, 3);
  const name = cap(words.join(' '));
  return { name, key: slug(name), chain: false };
}
export const slug = (s) => norm(s).replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/&/g, 'og').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/* ---------------- Steg 4: Gemini (den ENESTE veien til Gemini for logoer) ---------------- */

/** Bare bokstaver, tall, mellomrom og &-. – maks 60 tegn. Alt annet fjernes før noe sendes. */
export const sanitizeLogoName = (name) => String(name ?? '').normalize('NFC').replace(/[^\p{L}\p{N} &.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
const countryOf = (c) => (/^[A-Za-z]{2}$/.test(String(c ?? '').trim()) ? String(c).trim().toUpperCase() : 'NO');

/**
 * Spør Gemini (med Google Search grounding) om domenet til butikken. Tar bare tekst: navnet (sanert) og land.
 * Svarer {domene, alternativer (maks 2), sikkerhet} eller null. Ingen logo-URL, bilder, varelinjer, beløp, org.nr. eller kortdata kan sendes herfra.
 */
export async function logoLookup(name, country) {
  const butikk = sanitizeLogoName(name), land = countryOf(country);
  if (!butikk || butikk.length < 2 || !hasGemini()) return null;
  const sent = { butikk, land };
  // Prompt 69: også små lokale butikker – be om butikkens egen hjemmeside og inntil 2 alternativer (prøves i rekkefølge).
  const prompt = 'Finn det offisielle nettstedet til butikken eller kjeden under. Bruk Google-søk. Det kan være en liten lokal butikk: '
    + 'let etter butikkens egen hjemmeside, ikke Facebook, Instagram, Google Maps, Gule Sider, Proff eller Finn. Svar KUN med JSON '
    + '{"domene":"eksempel.no","alternativer":["eksempel.com"],"sikkerhet":0.0-1.0}. "alternativer" er maks 2 andre domener som også kan være '
    + 'riktige, ellers []. Ikke oppgi logo- eller bilde-URL. Er du usikker, sett "domene" til null.\n' + JSON.stringify(sent);
  audit('gemini', 'logo', sent);
  const model = settings().geminiModel || GEMINI_DEFAULT;
  let res;
  try {
    res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(aiTimeoutsOf().gemini * 1000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
    });
  } catch { return null; }
  if (!res?.ok) return null;
  let text = '';
  try { const d = await res.json(); text = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''); } catch { return null; }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const domene = cleanDomain(j.domene ?? j.domain);
    const sikkerhet = Math.max(0, Math.min(1, Number(j.sikkerhet ?? j.confidence) || 0));
    const alt = j.alternativer ?? j.alternatives;
    const alternativer = [...new Set((Array.isArray(alt) ? alt : []).slice(0, 2).map(cleanDomain).filter((d) => d && d !== domene))];
    if (!domene && !alternativer.length) return null;
    return { domene: domene ?? alternativer[0], alternativer: domene ? alternativer : alternativer.slice(1), sikkerhet };
  } catch { return null; }
}

/* ---------------- Nett: domener, sider og ikoner ---------------- */

export const cleanDomain = (v) => validDomain(String(v ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]);
// Prompt 69: 403 respekteres – nettsteder som stenger ute ukjente klienter, prøves ikke på nytt med nettleser-headere.
const get403 = (url, headers, accept) => F(url, { headers: { 'user-agent': 'Mozilla/5.0 (Homelab logo)', accept, ...headers } });
async function getPage(domain) {
  for (const url of [`https://${domain}/`, `https://www.${domain}/`]) {
    try {
      const r = await get403(url, {}, 'text/html,application/xhtml+xml,*/*;q=0.8');
      if (r.status !== 200) continue;
      const html = (await r.text()).slice(0, 400_000);
      return { url: r.url || url, html, title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim() };
    } catch { /* prøv neste */ }
  }
  return null;
}
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((m) => [m[1].toLowerCase(), m[3] ?? m[4] ?? m[5] ?? '']));
const abs = (href, base) => { try { const u = new URL(href.replace(/&amp;/g, '&'), base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
const sizeOf = (sizes) => Math.max(0, ...String(sizes ?? '').split(/\s+/).map((x) => +x.split('x')[0] || 0));
const svgLike = (type, href) => /svg/.test(type ?? '') || /\.svg(\?|$)/i.test(href ?? '');
/**
 * Ikon-kandidater fra forsiden, best først. svg:false (ingen ImageMagick) hopper over SVG-ikonene og /favicon.svg.
 * Manifest-ikonene (egen forespørsel) settes inn etter apple-touch-icon i iconFrom.
 */
export function iconCandidates(html, base, { svg = true } = {}) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const out = [];
  const rel = (l) => String(l.rel ?? '').toLowerCase();
  for (const l of links.filter((l) => /apple-touch-icon/.test(rel(l)) && l.href).sort((a, b) => sizeOf(b.sizes) - sizeOf(a.sizes))) out.push(['apple-touch-icon', abs(l.href, base)]);
  const icons = links.filter((l) => /(^|\s)icon(\s|$)/.test(rel(l)) && l.href).map((l) => ({ l, size: sizeOf(l.sizes), svg: svgLike(l.type, l.href) })).filter((i) => svg || !i.svg);
  for (const i of icons.filter((i) => i.svg || i.size >= 64).sort((a, b) => (b.svg - a.svg) || b.size - a.size)) out.push(['icon', abs(i.l.href, base)]);
  const meta = (p) => metas.find((m) => String(m.property ?? m.name ?? '').toLowerCase() === p)?.content;
  if (meta('og:logo')) out.push(['og:logo', abs(meta('og:logo'), base)]);
  if (meta('og:image')) out.push(['og:image', abs(meta('og:image'), base)]);
  // Mindre <link rel=icon>: 32–63 px først, så uten oppgitt størrelse, så under 32 px (brukes bare når ingenting større finnes).
  const rank = (s) => (s >= 32 ? s : s === 0 ? 31 : s - 100);
  for (const i of icons.filter((i) => !i.svg && i.size < 64).sort((a, b) => rank(b.size) - rank(a.size))) out.push(['icon', abs(i.l.href, base)]);
  if (svg) out.push(['favicon.svg', abs('/favicon.svg', base)]);
  out.push(['favicon', abs('/favicon.ico', base)]);
  const seen = new Set();
  return out.filter(([, u]) => u && !seen.has(u) && seen.add(u));
}
/** Ikonene i web-manifestet (<link rel=manifest>), største først. Monokrome ikoner og (uten ImageMagick) SVG hoppes over. */
async function manifestIcons(html, base, svg) {
  const l = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0])).find((x) => /(^|\s)manifest(\s|$)/i.test(x.rel ?? '') && x.href);
  const url = l ? abs(l.href, base) : null;
  if (!url) return [];
  try {
    const r = await get403(url, {}, 'application/manifest+json,application/json;q=0.9,*/*;q=0.5');
    if (r.status !== 200) return [];
    const j = JSON.parse((await r.text()).slice(0, 200_000));
    return (Array.isArray(j?.icons) ? j.icons : []).filter((i) => i?.src && !/monochrome/i.test(i.purpose ?? ''))
      .map((i) => ({ u: abs(String(i.src), url), size: sizeOf(i.sizes), svg: svgLike(i.type, String(i.src)) }))
      .filter((i) => i.u && (svg || !i.svg) && (i.svg || i.size >= 64 || i.size === 0))
      .sort((a, b) => (b.svg - a.svg) || b.size - a.size).slice(0, 3).map((i) => ['manifest', i.u]);
  } catch { return []; }
}
const sniff = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b.slice(0, 4).toString() === 'RIFF' ? 'webp' : b[0] === 0 && b[1] === 0 && b[2] === 1 ? 'ico'
  : b.slice(0, 3).toString() === 'GIF' ? 'gif' : /^\s*(<\?xml|<svg)/i.test(b.slice(0, 200).toString()) ? 'svg' : null);
/** [bredde, høyde] for PNG, GIF og ICO (største ikon i fila); null når det ikke kan leses billig. */
function imgDims(b, kind) {
  if (kind === 'png' && b.length > 24) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (kind === 'gif' && b.length > 10) return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (kind === 'ico' && b.length >= 22) { let m = 0; for (let i = 0, n = b.readUInt16LE(4); i < n && 6 + 16 * i + 1 < b.length; i++) m = Math.max(m, b[6 + 16 * i] || 256); return m ? [m, m] : null; }
  return null;
}
const minSide = (img) => (img?.dims ? Math.min(...img.dims) : null);
/** Henter et bilde. SVG godtas bare med svg:true (ImageMagick finnes og gjør den om til PNG). */
async function getImage(url, { svg = false, headers = {} } = {}) {
  try {
    const r = await get403(url, headers, 'image/avif,image/webp,image/png,image/*;q=0.9,*/*;q=0.5');
    if (r.status !== 200) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const kind = sniff(buf);
    if (!kind || buf.length < 64 || buf.length > 2_000_000) return null;
    if (kind === 'svg' && !svg) return null;
    return { buf, kind, dims: imgDims(buf, kind) };
  } catch { return null; }
}
async function iconFrom(domain, page, verify) {
  const svg = !!(await ocrTools().catch(() => ({}))).magick;
  const p = page ?? (await getPage(domain));
  let cands = p ? iconCandidates(p.html, p.url, { svg }) : [...(svg ? [['favicon.svg', `https://${domain}/favicon.svg`]] : []), ['favicon', `https://${domain}/favicon.ico`]];
  if (p) {
    const man = (await manifestIcons(p.html, p.url, svg)).filter(([, u]) => !cands.some(([, c]) => c === u));
    const at = cands.findLastIndex(([k]) => k === 'apple-touch-icon') + 1;
    cands = [...cands.slice(0, at), ...man, ...cands.slice(at)];
  }
  let small = null; // under 32 px: bare når ingenting større finnes, og aldri med «Sjekk logoen»
  for (const [kind, url] of cands) {
    const img = await getImage(url, { svg });
    if (!img) continue;
    if (kind === 'og:image' && img.dims && img.dims[0] !== img.dims[1]) continue; // og:image bare når bildet er kvadratisk
    const px = minSide(img);
    if (px !== null && px < 32) { if (!verify && (!small || px > minSide(small))) small = { ...img, from: kind }; continue; }
    return { ...img, from: kind };
  }
  const s2 = await getImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
  if (s2 && (minSide(s2) ?? 32) >= 32) return { ...s2, from: 's2' };
  return small ?? (s2 && !verify ? { ...s2, from: 's2' } : null);
}
/** 128×128 PNG med gjennomsiktighet når ImageMagick finnes; ellers lagres originalen (klienten skalerer). */
async function toPng128(buf, kind) {
  const tl = await ocrTools().catch(() => ({}));
  if (!tl.magick) return kind === 'svg' ? null : buf; // SVG lagres aldri som den er
  const dir = await mkdtemp(join(tmpdir(), 'logo-'));
  try {
    const src = join(dir, `in.${kind}`), out = join(dir, 'out.png');
    await writeFile(src, buf);
    const pre = kind === 'svg' ? ['-background', 'none', '-density', '384'] : []; // SVG: gjennomsiktig og skarp før den leses
    await run(tl.magick, [...pre, kind === 'ico' ? `${src}[0]` : src, '-background', 'none', '-resize', '128x128', '-gravity', 'center', '-extent', '128x128', `png:${out}`], { timeout: 15_000 });
    return await readFile(out);
  } catch { return kind === 'svg' ? null : buf; } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
/** Lagrer logoen som PNG; null når den ikke kan lagres trygt (SVG uten ImageMagick). */
async function saveFile(name, buf, kind) {
  await mkdir(LOGO_DIR, { recursive: true });
  const png = await toPng128(buf, kind);
  if (!png) return null;
  await writeFile(join(LOGO_DIR, name), png);
  return name;
}

/* ---------------- Steg 3b: Wikidata og Commons (prompt 69) ---------------- */

// Wikimedias regler for API-bruk: tydelig User-Agent med kontaktadresse, én forespørsel om gangen per vert og hurtigbuffer.
export const WD_UA = 'KristoHomelab-logo/1.0 (https://kristo.no; logo-oppslag fra hjemmeserver)';
const WD_API = 'https://www.wikidata.org/w/api.php';
const WD_TIMEOUT_MS = 6000;
// P31 (forekomst av) som betyr virksomhet, kjede eller merkevare.
// business, enterprise, company, corporation, public/privately held company, subsidiary, retail/supermarket/restaurant/fast food chain,
// brand, trademark, shop, supermarket, restaurant, coffeehouse, bank, pharmacy, franchise.
export const WD_TYPES = new Set(['Q4830453', 'Q6881511', 'Q783794', 'Q167037', 'Q891723', 'Q1589009', 'Q658255', 'Q507619', 'Q18043413', 'Q18534714',
  'Q18509232', 'Q431289', 'Q167270', 'Q213441', 'Q180846', 'Q11707', 'Q30022', 'Q22687', 'Q13107184', 'Q1774898']);
const hostChain = new Map();
/** Kjør fn når forrige forespørsel til samme vert er ferdig (maks 1 om gangen per vert). */
function oneAtATime(url, fn) {
  const host = new URL(url).host;
  const p = (hostChain.get(host) ?? Promise.resolve()).then(() => fn());
  const tail = p.catch(() => {});
  hostChain.set(host, tail);
  tail.then(() => { if (hostChain.get(host) === tail) hostChain.delete(host); });
  return p;
}
async function wdJson(params, deadline) {
  if (deadline - Date.now() < 300) return { failed: true };
  const url = `${WD_API}?${new URLSearchParams({ ...params, format: 'json' })}`;
  return oneAtATime(url, async () => {
    try {
      const r = await F(url, { headers: { 'user-agent': WD_UA, 'api-user-agent': WD_UA, accept: 'application/json' }, timeout: Math.max(300, deadline - Date.now()) });
      return r.status === 200 ? { json: await r.json() } : { failed: r.status >= 500 || r.status === 429 };
    } catch { return { failed: true }; }
  });
}
// Navnet slik det sammenlignes: normalisert, uten selskapsform og «Norge», uten mellomrom.
const WD_DROP = new Set(['as', 'asa', 'ab', 'sa', 'norge', 'norway', 'norsk', 'group', 'gruppen', 'konsern', 'ltd', 'inc']);
const wdKey = (s) => libNorm(s).split(' ').filter((w) => w && !WD_DROP.has(w)).join('');
const claims = (e, p) => [...(e?.claims?.[p] ?? [])].filter((c) => c.rank !== 'deprecated').sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred')).map((c) => c.mainsnak?.datavalue?.value).filter((v) => v != null);
const qidOf = (v) => (typeof v === 'string' ? v : v?.id ?? (v?.['numeric-id'] ? `Q${v['numeric-id']}` : null));
/** Godtar en Wikidata-entitet bare når typen, landet/domenet og navnet stemmer. Svarer {id, domain, logo} eller null. */
export function wdAccept(e, name) {
  if (!e || !e.claims || 'missing' in e) return null;
  const key = wdKey(name);
  if (!key || !claims(e, 'P31').map(qidOf).some((t) => WD_TYPES.has(t))) return null;
  const domain = claims(e, 'P856').map(cleanDomain).find(Boolean) ?? null;
  let inRegistry = false;
  try { inRegistry = !!(domain && itemForDomain(domain)); } catch { /* registeret mangler */ }
  if (!claims(e, 'P17').map(qidOf).includes('Q20') && !(domain && (domain.endsWith('.no') || inRegistry))) return null;
  const names = [...Object.values(e.labels ?? {}), ...Object.values(e.aliases ?? {}).flat()].map((x) => x?.value).filter(Boolean);
  if (!names.some((n) => wdKey(n) === key)) return null;
  const logo = ['P154', 'P8972', 'P2910'].map((p) => claims(e, p).find((v) => typeof v === 'string')).find(Boolean) ?? null;
  return { id: e.id, domain, logo };
}
const WD_CACHE = new Map();
const WD_HIT_MS = 30 * 86400_000, WD_FAIL_MS = 3600_000;
export const _clearWikidataCache = () => WD_CACHE.clear();
/**
 * Slår opp butikken i Wikidata. Sender BARE det ryddede navnet (sanert som for Gemini) og logger det i ai_audit (wikidata).
 * Svarer {id, domain, logo (Commons-filnavn)} eller null. Hurtigbuffer: treff 30 dager, «ingen» 7 dager, nettfeil 1 time.
 */
export async function wikidataLookup(name, { u = me() } = {}) {
  const navn = sanitizeLogoName(name);
  const key = wdKey(navn);
  if (!navn || key.length < 2) return null;
  const hitC = WD_CACHE.get(key);
  if (hitC && Date.now() < hitC.until) return hitC.val;
  audit('wikidata', 'logo', { navn }, u);
  const deadline = Date.now() + WD_TIMEOUT_MS;
  let failed = false, val = null;
  const ids = [];
  for (const language of ['nb', 'en']) {
    const s = await wdJson({ action: 'wbsearchentities', search: navn, language, uselang: language, type: 'item', limit: '5' }, deadline);
    failed ||= !!s.failed;
    for (const h of s.json?.search ?? []) if (/^Q\d+$/.test(h?.id ?? '') && !ids.includes(h.id)) ids.push(h.id);
    if (ids.length) break;
  }
  if (ids.length) {
    const top = ids.slice(0, 3);
    const g = await wdJson({ action: 'wbgetentities', ids: top.join('|'), props: 'labels|aliases|claims', languages: 'nb|nn|no|en|mul' }, deadline);
    failed ||= !!g.failed;
    for (const id of top) { val = wdAccept(g.json?.entities?.[id], navn); if (val) break; }
  }
  if (WD_CACHE.size > 1000) WD_CACHE.delete(WD_CACHE.keys().next().value);
  WD_CACHE.set(key, { val, until: Date.now() + (val ? WD_HIT_MS : failed ? WD_FAIL_MS : NONE_RECHECK_MS) });
  return val;
}
/** Commons-fil som PNG (Commons skalerer, også SVG-logoer). Serveren tar aldri imot SVG herfra. */
export const commonsPngUrl = (file) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(file).trim().replace(/ /g, '_'))}?width=256`;
const commonsImage = (file) => { const url = commonsPngUrl(file); return oneAtATime(url, () => getImage(url, { headers: { 'user-agent': WD_UA } })); };

/* ---------------- Steg 3: Brønnøysundregistrene ---------------- */

async function brregJson(url) { try { const r = await F(url, { headers: { accept: 'application/json' }, timeout: 5000 }); return r.status === 200 ? await r.json() : null; } catch { return null; } }
export async function brregDomain(name, orgnr) {
  const org = String(orgnr ?? '').replace(/\D/g, '');
  if (/^\d{9}$/.test(org)) {
    let e = await brregJson(`https://data.brreg.no/enhetsregisteret/api/enheter/${org}`);
    if (!e) { const u = await brregJson(`https://data.brreg.no/enhetsregisteret/api/underenheter/${org}`); if (u?.hjemmeside) return cleanDomain(u.hjemmeside); if (u?.overordnetEnhet) e = await brregJson(`https://data.brreg.no/enhetsregisteret/api/enheter/${u.overordnetEnhet}`); }
    const d = cleanDomain(e?.hjemmeside);
    if (d) return d;
  }
  if (!name || name.length < 2) return null;
  const list = (await brregJson(`https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(name)}&size=10`))?._embedded?.enheter ?? [];
  const n = norm(name);
  const hit = list.filter((e) => e.hjemmeside && norm(e.navn).replace(/\b(as|asa)\b/g, '').trim().startsWith(n)).sort((a, b) => a.navn.length - b.navn.length)[0];
  return hit ? cleanDomain(hit.hjemmeside) : null;
}

/* ---------------- Steg 7: klipp fra kvitteringen (lokalt) ---------------- */

async function ollamaLogoBox(image) {
  if (ollamaBox) return ollamaBox(image);
  // Prompt 34: ruten «Kvitteringer (bilde)» via ai.run, bare lokale modeller (kvitteringsbildet forlater ikke huset).
  const schema = { type: 'object', properties: { funnet: { type: 'boolean' }, x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } }, required: ['funnet'] };
  const out = await aiRun('rc', { prompt: 'Finn butikkens logo øverst på kvitteringen. Svar KUN med JSON {"funnet":true,"x1":..,"y1":..,"x2":..,"y2":..} (piksler). Ingen logo: {"funnet":false}.',
    images: [image], schema, temperature: 0, localOnly: true, title: 'Logo fra kvittering', background: true });
  return out.data ?? null;
}
async function cropFromReceipt(receiptId, u, key) {
  const r = q('SELECT file, scan, mime FROM fh_receipts WHERE id=? AND user_id=?').get(String(receiptId), u);
  const rel = r?.scan || (/^image\//.test(r?.mime ?? '') ? r.file : null);
  if (!rel || rel.includes('..')) return null;
  let image;
  try { image = await readFile(join(resolve(config.dataDir, 'receipts'), rel)); } catch { return null; }
  let box;
  try { box = await ollamaLogoBox(image); } catch { return null; }
  if (!box?.funnet || ![box.x1, box.y1, box.x2, box.y2].every(Number.isFinite) || box.x2 <= box.x1 || box.y2 <= box.y1) return null;
  const tl = await ocrTools().catch(() => ({}));
  if (!tl.magick) return null;
  const dir = await mkdtemp(join(tmpdir(), 'rclogo-'));
  try {
    const src = join(dir, 'in.jpg'), out = join(dir, 'out.png');
    await writeFile(src, image);
    const w = Math.round(box.x2 - box.x1), h = Math.round(box.y2 - box.y1);
    await run(tl.magick, [src, '-auto-orient', '-crop', `${w}x${h}+${Math.round(box.x1)}+${Math.round(box.y1)}`, '+repage', '-background', 'none', '-resize', '128x128', '-gravity', 'center', '-extent', '128x128', `png:${out}`], { timeout: 20_000 });
    await mkdir(LOGO_DIR, { recursive: true });
    const file = `${key}-kvittering.png`;
    await writeFile(join(LOGO_DIR, file), await readFile(out));
    return file;
  } catch { return null; } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/* ---------------- Kjeden ---------------- */

const rowOf = (u, key) => q('SELECT * FROM merchant_logos WHERE user_id=? AND key=?').get(u, key);
const upsert = (u, key, v) => q(`INSERT INTO merchant_logos(key,user_id,domain,file,source,checked_at,manual,name) VALUES(@key,@u,@domain,@file,@source,@at,@manual,@name)
  ON CONFLICT(user_id,key) DO UPDATE SET domain=@domain, file=@file, source=@source, checked_at=@at, manual=@manual, name=@name`).run({ key, u, domain: v.domain ?? null, file: v.file ?? null, source: v.source, at: Date.now(), manual: v.manual ? 1 : 0, name: v.name ?? null });
export const logoFileUrl = (file, at = '') => `/finans/api/merchants/logo/file/${encodeURIComponent(file)}${at ? `?v=${at}` : ''}`;
function out(row) {
  if (!row || row.source === 'none') return { none: true, key: row?.key ?? null };
  const logoUrl = row.file ? (row.file.startsWith('lib:') ? `/finans/api/logos/file/${row.file.slice(4)}` : logoFileUrl(row.file, row.checked_at)) : row.domain ? `/finans/api/logo/${row.domain}` : null;
  return { domain: row.domain ?? null, logoUrl, source: row.source, key: row.key, manual: !!row.manual };
}
/** Synkron: lagret logo-URL for et navn (brukes av søkeforslag og lister), eller null. */
export function cachedLogoUrl(name, u = me()) {
  try { const k = cleanName(name).key; const r = k ? rowOf(u, k) : null; return r && r.source !== 'none' ? out(r).logoUrl : null; } catch { return null; }
}

/** Steg 4–6 for et domene: sjekk at det svarer (når verify), hent ikonet og lagre det. */
async function tryDomain(domain, key, { verify, requireTitle = null }) {
  const d = cleanDomain(domain);
  if (!d) return null;
  const page = await getPage(d);
  if ((verify || requireTitle) && !page) return null;
  if (requireTitle && !norm(page.title).replace(/\s+/g, '').includes(norm(requireTitle).replace(/\s+/g, ''))) return null;
  const icon = await iconFrom(d, page, verify);
  if (!icon) return null;
  const file = await saveFile(`${key}.png`, icon.buf, icon.kind);
  return file ? { domain: d, file, from: icon.from } : null;
}

// Gemini-domener som aldri er butikkens eget nettsted (sosiale medier, kart og kataloger).
const NOT_SHOP = /(^|\.)(facebook|fb|instagram|google|goo|gulesider|proff|1881|finn|tripadvisor|linkedin|tiktok|youtube|twitter|x|wikipedia|yelp|mapquest)\.[a-z.]+$/;
/** Domenene fra Gemini i rekkefølge: hoveddomenet, så alternativene. Maks 3, uten dubletter og sosiale medier. */
export const geminiDomains = (g) => [...new Set([g?.domene, ...(g?.alternativer ?? [])].map(cleanDomain).filter((d) => d && !NOT_SHOP.test(d)))].slice(0, 3);

const inflight = new Map();
/**
 * Finn logo for et butikknavn. Svarer {domain, logoUrl, source} eller {none:true}.
 * opts: orgnr (kvitteringens org.nr.), receiptId (for steg 7), force (ignorer 90-dagers-cachen), country.
 */
export async function findLogo(rawName, { orgnr = null, receiptId = null, force = false, country = 'NO', u = me() } = {}) {
  const c = cleanName(rawName);
  if (!c.key) return { none: true, key: null };
  const k = `${u}:${c.key}`;
  if (inflight.has(k)) return inflight.get(k);
  const p = (async () => {
    const cur = rowOf(u, c.key);
    if (cur?.manual) return out(cur); // manuelle valg vinner alltid
    if (cur && !force && Date.now() - cur.checked_at < (cur.source === 'none' ? NONE_RECHECK_MS : RECHECK_MS)) return out(cur);
    const verify = userBool(u, 'logo_verify'), useGemini = userBool(u, 'logo_gemini'), useWikidata = userBool(u, 'logo_wikidata'), localReceipts = userBool(u, 'logo_local_receipts');
    const save = (v) => { upsert(u, c.key, { ...v, name: c.name }); return out(rowOf(u, c.key)); };
    // Steg 2b: kjent kjede i logobiblioteket (ferdig fil eller kjent domene).
    const lib = matchMerchant(c.name) ?? matchMerchant(rawName);
    if (lib?.id && libraryFile(lib.id)) return save({ domain: lib.domene ?? null, file: `lib:${lib.id}`, source: 'bibliotek' });
    // Prompt 48 (PRIV48): med «Finansdata forlater aldri huset» (eller brukt opp sky-budsjett) går ingenting ut – ingen
    // Brønnøysund, Gemini, nettsider eller favicon-tjeneste med butikknavn/org.nr. Bare logobiblioteket (over) og klipp fra
    // kvitteringen (lokal modell). Lagres ikke som «ingen», så oppslaget prøves igjen når sperren slås av.
    if (externalBlocked48().blocked) {
      if (receiptId && localReceipts) { const file = await cropFromReceipt(receiptId, u, c.key); if (file) return save({ domain: null, file, source: 'kvittering' }); }
      return { none: true, key: c.key, blocked: true };
    }
    const tried = new Set();
    const attempt = async (domain, source, extra = {}) => {
      const d = cleanDomain(domain);
      if (!d || tried.has(d)) return null;
      tried.add(d);
      const r = await tryDomain(d, c.key, { verify, ...extra });
      return r ? save({ domain: r.domain, file: r.file, source: r.from === 's2' ? `${source}+s2` : source }) : null;
    };
    let hit = lib?.domene ? await attempt(lib.domene, 'bibliotek') : null;
    if (hit) return hit;
    // Steg 3: Brreg.
    hit = await attempt(await brregDomain(c.name, orgnr), 'brreg');
    if (hit) return hit;
    // Steg 3b: Wikidata (bare det ryddede navnet), når brukeren ikke har slått det av.
    if (useWikidata) {
      const w = await wikidataLookup(c.name, { u });
      if (w?.logo) {
        const img = await commonsImage(w.logo);
        const file = img && (minSide(img) ?? 32) >= 32 ? await saveFile(`${c.key}.png`, img.buf, img.kind) : null;
        if (file) return save({ domain: w.domain, file, source: 'wikidata' });
      }
      if (w?.domain) { hit = await attempt(w.domain, 'wikidata'); if (hit) return hit; }
    }
    // Steg 4: Gemini (bare navn + land), bare når brukeren har slått det på.
    if (useGemini) {
      const g = await logoLookup(c.name, country);
      // Lav sikkerhet → ingen forsøk. Ellers maks 3 domener i rekkefølge; hvert må svare og (med «Sjekk logoen») ha navnet i <title>.
      if (g && g.sikkerhet >= 0.5) {
        for (const d of geminiDomains(g)) { hit = await attempt(d, 'gemini', { verify: true, requireTitle: verify ? c.name : null }); if (hit) return hit; }
      }
    }
    // Steg 5: gjett domenet. Krever 200 og at <title> inneholder navnet.
    const base = slug(c.name).replace(/-/g, '');
    for (const tld of ['no', 'com', 'se']) { hit = await attempt(`${base}.${tld}`, 'favicon', { requireTitle: c.name }); if (hit) return hit; }
    // Steg 7: klipp fra kvitteringen (lokalt).
    if (receiptId && localReceipts) {
      const file = await cropFromReceipt(receiptId, u, c.key);
      if (file) return save({ domain: null, file, source: 'kvittering' });
    }
    return save({ source: 'none' });
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** «Velg logo»: manuelt domene (logoen hentes og lagres) eller opplastet bilde. Manuelle valg vinner alltid. */
export async function setManualLogo(rawName, { domain = null, image = null, u = me() } = {}) {
  const c = cleanName(rawName);
  if (!c.key) throw Object.assign(new Error('Mangler navn'), { status: 400 });
  if (image) {
    const kind = sniff(image);
    if (!kind || kind === 'svg') throw Object.assign(new Error('Logoen må være PNG, JPEG, WebP, GIF eller ICO'), { status: 400 });
    const file = await saveFile(`m-${randomBytes(9).toString('hex')}.png`, image, kind);
    upsert(u, c.key, { domain: cleanDomain(domain), file, source: 'manuell', manual: true, name: c.name });
    return out(rowOf(u, c.key));
  }
  const d = cleanDomain(domain);
  if (!d) throw Object.assign(new Error('Ugyldig domene'), { status: 400 });
  const r = await tryDomain(d, c.key, { verify: false });
  upsert(u, c.key, { domain: d, file: r?.file ?? null, source: 'manuell', manual: true, name: c.name });
  return out(rowOf(u, c.key));
}
/** Fjern et lagret valg (neste oppslag kjører kjeden på nytt). */
export const clearLogo = (rawName, u = me()) => { const k = cleanName(rawName).key; if (k) q('DELETE FROM merchant_logos WHERE user_id=? AND key=?').run(u, k); };
export const isLogoFile = (f) => /^[a-z0-9-]{1,90}\.png$/.test(String(f ?? ''));
