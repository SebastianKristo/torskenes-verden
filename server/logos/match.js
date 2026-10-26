// Internt logobibliotek (prompt 20): register over norske butikker og tjenester, ferdig nedlastede logoer i
// server/logos/files/<id>.png og matching av banktekster («VIPPS*KIWI 123», «IZ *RUTER», «ELKJOP STORO»).
// Registeret leses én gang ved oppstart; filene sjekkes på nytt når mappen endres.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
export const REGISTRY_FILE = join(HERE, 'registry.json');
// LOGO_FILES_DIR: egen mappe (testene), ellers filene som følger med i repoet og imaget.
export const FILES_DIR = process.env.LOGO_FILES_DIR || join(HERE, 'files');
// Prompt 22: manuelt kontrollerte logoer (kilde «manuell», f.eks. fraktselskapene) ligger i files/manuell/<id>.png.
// For disse brukes bare den kontrollerte filen, aldri files/<id>.png (som kan være et tilfeldig favicon).
export const MANUAL_DIR = join(FILES_DIR, 'manuell');

/* ---------------- Normalisering ---------------- */

// Små bokstaver, æøå/ü/é → ascii, toppdomene fjernes («netflix.com» → «netflix»), tegnsetting blir mellomrom.
export function normalize(s) {
  return String(s ?? '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/[øö]/g, 'o').replace(/å/g, 'a')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\+/g, ' plus ')
    .replace(/\.(?:no|com|se|dk|fi|eu|io|ai|me|net|org|app|de|tv|so|co\.uk|uk|us)\b/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z]{2,})/g, '$1 $2')
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Betalingsformidlere foran butikknavnet. Står det ingenting etter, er det formidleren selv (f.eks. «VIPPS*»).
const PREFIXES = [/^vipps\s*\*\s*/i, /^klarna\s*\*\s*/i, /^paypal\s*\*\s*/i, /^sq\s*\*\s*/i, /^iz\s*\*\s*/i, /^sumup\s*\*\s*/i, /^nets\s*\*\s*/i,
  /^zettle_?\s*\*?\s*/i, /^google\s*\*\s*/i, /^bambora\s*\*\s*/i, /^stripe\s*\*\s*/i, /^dnb\s*\*\s*/i, /^nyx\s*\*\s*/i, /^pp\s*\*\s*/i];
// Bankenes egne ord foran teksten (DNB, Nordea, SpareBank 1, Sbanken …).
const BANK_WORDS = /^(?:visa|varekjop|varekjøp|varer|kortkjop|kortkjøp|kjop|kjøp|reservert|reservasjon|debit|bankaxept|bax|kontaktlos|kontaktløs|betaling|giro|avtalegiro|efaktura|e-faktura|nettgiro|overforing til|til|fra)\b[\s:.-]*/i;
// Det som ikke er navnet: kortnummer, datoer, beløp, tid, butikk- og postnummer, selskapsform og vanlige steder.
const NOISE = [
  /\*+\s*\d{2,}/g, /\bx{2,}\d+/gi, /\b\d{4}\s?x{4,}\s?\d{0,4}/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g, /\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g, /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
  /\b(?:nok|kr|eur|usd|sek|dkk)\s*-?\d[\d\s.,]*/gi, /\bkurs\s*[\d.,]+/gi, /\bvaluta\b.*/gi,
];
const CORP = new Set(['as', 'asa', 'ab', 'aps', 'sa', 'da', 'ans', 'ltd', 'limited', 'inc', 'llc', 'gmbh', 'bv', 'oy', 'plc', 'norge', 'norway', 'nor', 'no', 'avd', 'avdeling', 'filial', 'nuf']);
const PLACES = new Set(('oslo bergen trondheim stavanger tromso bodo kristiansand drammen fredrikstad sandnes sarpsborg skien alesund tonsberg moss haugesund sandefjord arendal hamar larvik halden lillehammer molde harstad gjovik kongsberg porsgrunn ' +
  'grunerlokka majorstuen bislett storo alnabru sentrum city oslo s jernbanetorget torggata grorud furuset romsas stovner lambertseter nydalen ullevaal ulleval sinsen torshov sagene frogner skoyen bryn helsfyr ' +
  'tøyen toyen gronland bjorvika aker brygge vika homansbyen fornebu lysaker sandvika asker baerum lillestrom ski kolbotn jessheim gardermoen sola flesland vaernes ' +
  'senter storsenter kjopesenter amfi cc steen strom glasmagasinet byporten paleet sandvika lagunen sartor jekta').split(' '));

function clean(text) {
  let s = String(text ?? '');
  for (const re of NOISE) s = s.replace(re, ' ');
  const words = normalize(s).split(' ').filter(Boolean);
  // Butikknummer og postnummer (tall alene), selskapsform og steder til slutt i teksten.
  const out = words.filter((w) => !/^\d+$/.test(w) && !CORP.has(w));
  while (out.length > 1 && PLACES.has(out[out.length - 1])) out.pop();
  return out.join(' ');
}

// «IZ *RUTER» → «RUTER», «APPLE.COM/BILL» → «apple». Returnerer kandidattekstene (full og renset).
export function candidates(text) {
  let s = String(text ?? '').trim();
  if (/\b(?:apple\.com\/bill|itunes\.com\/bill|apple\.com\/no)\b/i.test(s)) s = s.replace(/(?:apple|itunes)\.com\/(?:bill|no)/i, 'apple');
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(BANK_WORDS, '').trim();
    for (const re of PREFIXES) {
      const m = s.match(re);
      if (m) { const rest = s.slice(m[0].length).trim(); s = rest.replace(/^[*\s]+/, '') || m[0].replace(/[\s*_]+$/, ''); }
    }
    // Kortnummer/dato først i teksten («*1234 18.10 REMA 1000 …»).
    s = s.replace(/^(?:\*?\d{4}\s+)?(?:\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s+)/, '').trim();
    if (s === before) break;
  }
  const full = normalize(s.replace(/\*+\s*\d{2,}/g, ' '));
  const cleaned = clean(s);
  return [...new Set([full, cleaned].filter(Boolean))];
}

/* ---------------- Register ---------------- */

let REG = null, INDEX = null;
function load() {
  if (REG) return REG;
  REG = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8'));
  INDEX = [];
  for (const it of REG.items) for (const a of it.alias ?? []) { const n = normalize(a); if (n) INDEX.push({ a: n, words: n.split(' ').length, it, g: isGeneric(n) || (it.fra === 'nsi' && !n.includes(' ')) }); }
  INDEX.sort((x, y) => y.a.length - x.a.length); // lengste alias først: «coop extra» før «coop», «max burger» før «max»
  return REG;
}
export const registry = () => load();
let BYID = null;
export const itemById = (id) => { const r = load(); if (!BYID || BYID.reg !== r) BYID = { reg: r, map: new Map(r.items.map((x) => [x.id, x])) }; return BYID.map.get(id) ?? null; };
// Til testene: les registeret på nytt.
export function reloadRegistry() { REG = null; INDEX = null; filesSeen = null; manualSeen = null; return load(); }

// Filer som finnes, lest på nytt når mappen endres (fetch-logos.mjs eller en ny versjon av imaget).
let filesSeen = null, filesMtime = -1;
export function filesPresent() {
  let m = 0;
  try { m = statSync(FILES_DIR).mtimeMs; } catch { return new Set(); }
  if (filesSeen && m === filesMtime) return filesSeen;
  filesMtime = m;
  filesSeen = new Set(readdirSync(FILES_DIR).filter((f) => /^[a-z0-9-]+\.png$/.test(f)).map((f) => f.slice(0, -4)));
  return filesSeen;
}
let manualSeen = null, manualMtime = -1;
export function manualPresent() {
  let m = 0;
  try { m = statSync(MANUAL_DIR).mtimeMs; } catch { return (manualSeen = new Set()); }
  if (manualSeen && m === manualMtime) return manualSeen;
  manualMtime = m;
  manualSeen = new Set(readdirSync(MANUAL_DIR).filter((f) => /^[a-z0-9-]+\.png$/.test(f)).map((f) => f.slice(0, -4)));
  return manualSeen;
}
export const isManual = (id) => itemById(id)?.kilde === 'manuell';
export const hasFile = (id) => (isManual(id) ? manualPresent().has(id) : filesPresent().has(id));
export const filePath = (id) => (/^[a-z0-9-]+$/.test(String(id)) && hasFile(id) ? join(isManual(id) ? MANUAL_DIR : FILES_DIR, `${id}.png`) : null);
/** Domenet tilhører et selskap med manuelt kontrollert logo: da skal det aldri hentes favicon for det. */
export function isManualDomain(domain) {
  let d = String(domain ?? '').toLowerCase().replace(/^www\./, '').trim();
  while (d.includes('.')) {
    if (load().items.some((it) => it.domene === d && it.kilde === 'manuell')) return true;
    d = d.slice(d.indexOf('.') + 1);
    if (!d.includes('.')) break;
  }
  return false;
}

// Ferdig nedlastet logo for et domene (første oppføring med fil). www. ignoreres.
export function fileForDomain(domain) {
  const d = String(domain ?? '').toLowerCase().replace(/^www\./, '');
  if (!d) return null;
  for (const it of load().items) if (it.domene === d && it.kilde !== 'bokstav' && hasFile(it.id)) return filePath(it.id);
  return null;
}

/** Registeroppføringen for et domene (den med fil først), eller null. Underdomener faller tilbake til hoveddomenet. */
export function itemForDomain(domain) {
  let d = String(domain ?? '').toLowerCase().replace(/^www\./, '').trim();
  while (d.includes('.')) {
    const hits = load().items.filter((it) => it.domene === d);
    if (hits.length) return hits.find((it) => it.kilde !== 'bokstav' && hasFile(it.id)) ?? hits[0];
    d = d.slice(d.indexOf('.') + 1);
    if (!d.includes('.')) break;
  }
  return null;
}

/* ---------------- Egne valg (POST /finans/api/logos/override) ---------------- */

// normalisert navn → domene. Settes av routes.js fra kv ved oppstart og når admin lagrer et valg.
let OVERRIDES = new Map();
export function setOverrides(obj) { MEMO.clear(); OVERRIDES = new Map(Object.entries(obj ?? {}).map(([k, v]) => [normalize(k), String(v).toLowerCase()])); }
export const overrides = () => Object.fromEntries(OVERRIDES);

// Til appene: liten liste med ETag (endres når registeret eller filene endres).
let pubCache = null;
export function publicRegistry() {
  const reg = load(), files = filesPresent(), man = manualPresent();
  if (pubCache && pubCache.files === files && pubCache.man === man) return pubCache.out;
  const items = reg.items.map((x) => ({ id: x.id, navn: x.navn, domene: x.domene || null, alias: x.alias, kategori: x.kategori, farge: x.farge,
    hasFile: x.kilde === 'manuell' ? man.has(x.id) : x.kilde !== 'bokstav' && files.has(x.id), ...(x.kilde === 'manuell' ? { manual: true } : {}) }));
  const hash = createHash('sha1').update(JSON.stringify(items)).digest('hex').slice(0, 12);
  const out = { body: { version: `${reg.version}-${hash}`, items }, etag: `"lr-${hash}"` };
  pubCache = { files, man, out };
  return out;
}

/* ---------------- Matching ---------------- */

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Prompt 69: korte eller generiske navn («Max», «Normal», «Extra», «Power», «Obs») gir falske treff når registeret vokser
// (NSI-kjedene). De matches bare som hele ord først i teksten (eksakt eller prefiks, etter at betalingsformidler og bankord
// er fjernet i candidates()), aldri med Levenshtein og aldri midt i teksten. Brukes også av grow-nsi.mjs.
// Oppføringer lagt til automatisk fra NSI (fra: 'nsi') behandles likt for alle enkeltord-alias («Volt», «Glitter»).
export const GENERIC = new Set(('max maxi normal extra power mega prix obs spar joker meny marked plus super best good one city smart fresh life basic express ' +
  'shop store market house home sport apotek kiosk bakeri pizza burger sushi cafe kafe kaffe taxi parkering bensin service senter ' +
  'mat bar pub hotell hotel bygg auto bil data mobil tele energi strom bank finans post pakke frakt gull optikk blomster ' +
  'helse lege tannlege klinikk frisor salong hage dyr zoo bok leker sko klaer interior mote design').split(' '));
export const isGeneric = (alias) => { const n = normalize(alias); return n.replace(/[^a-z0-9]/g, '').length <= 3 || GENERIC.has(n); };

// Tillatt avstand etter aliasets lengde: 2 fra 8 tegn, 1 fra 5 tegn, ellers ingen (korte navn gir for mange falske treff).
const maxDist = (n) => (n >= 8 ? 2 : n >= 5 ? 1 : 0);
const out = (it) => ({ id: it.id, navn: it.navn, domene: it.domene || null, farge: it.farge, kategori: it.kategori });

// Hurtigbuffer for matchMerchant: et større register (NSI) gjør Levenshtein-steget dyrere, og samme banktekst går igjen.
// Tømmes når registeret leses på nytt eller egne valg endres.
const MEMO = new Map(), MEMO_MAX = 5000;
let MEMO_REG = null;

/** Banktekst eller butikknavn → { id, navn, domene, farge, kategori } eller null (vis bokstav). */
export function matchMerchant(text) {
  const reg = load();
  if (MEMO_REG !== reg) { MEMO.clear(); MEMO_REG = reg; }
  const key = String(text ?? '');
  if (MEMO.has(key)) { const v = MEMO.get(key); return v && { ...v }; }
  const v = matchUncached(text);
  if (MEMO.size >= MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  MEMO.set(key, v && { ...v });
  return v;
}

function matchUncached(text) {
  const cands = candidates(text).filter((c) => c.length >= 2);
  if (!cands.length) return null;
  // 0. Eget valg for navnet (overstyrer registeret).
  for (const c of [normalize(text), ...cands]) {
    const d = OVERRIDES.get(c);
    if (!d) continue;
    const it = itemForDomain(d);
    return it ? { ...out(it), domene: d, override: true } : { id: null, navn: String(text).trim(), domene: d, farge: null, kategori: null, override: true };
  }
  // 1. Eksakt
  for (const c of cands) { const h = INDEX.find((x) => x.a === c); if (h) return out(h.it); }
  // 2. Prefiks: aliaset står først i teksten (hele ord). Lengste alias vinner.
  for (const c of cands) { const h = INDEX.find((x) => c.startsWith(x.a + ' ')); if (h) return out(h.it); }
  // 3. Levenshtein ≤ 2 mot like mange første ord som aliaset har.
  let best = null;
  for (const c of cands) {
    const words = c.split(' ');
    for (const x of INDEX) {
      const m = maxDist(x.a.length);
      if (!m || x.g || x.words > words.length) continue;
      const d = lev(words.slice(0, x.words).join(' '), x.a, m);
      if (d <= m && (!best || d < best.d || (d === best.d && x.a.length > best.x.a.length))) best = { d, x };
    }
  }
  if (best) return out(best.x.it);
  // 4. Alias på minst 5 tegn som hele ord et annet sted i teksten («BETALING FINN.NO»).
  for (const c of cands) { const h = INDEX.find((x) => x.a.length >= 5 && !x.g && (' ' + c + ' ').includes(' ' + x.a + ' ')); if (h) return out(h.it); }
  return null;
}

export const registryExists = () => existsSync(REGISTRY_FILE);
