// Prompt 27/28: nytt abonnement fra skjermbilde. Bildet leses lokalt av Ollama med en bildemodell (vision) og sendes aldri
// til sky, med mindre brukeren selv trykker «Les med Gemini» (?engine=gemini, logges i ai_audit). Bildet lagres aldri.
// Prompt 28 (fiks, se prompts/prompt-28-pakke/claude-code-abo-skjermbilde-fiks.md): HEIC/stor PNG konverteres til JPEG
// ≤1600 px med ImageMagick, ren base64 uten data:-prefiks, /api/chat med format:"json", num_ctx 8192, keep_alive 10m,
// 120 s tidsgrense, vision-modell valgt via /api/show (aldri Chat-modellen uten vision), <think> og alt utenfor {…} fjernes,
// norske og engelske nøkler, «129,00 kr» → 129. Feil har code: ollama_down | no_vision | timeout | not_found | bad_image.
// Svar: {tjeneste, plan, pris (øre NOK), valuta, prisOriginal?, syklus:'mnd'|'år', neste_trekk, kategori, logoUrl?, domain?,
//        sikkerhet:{felt:0–1}, check:[felt…], existingId?, approx?, engine, model}
import { spawn } from 'node:child_process';
import { db, me, settings } from './db.js';
import { _aiTest, logAi, aiTimeoutsOf, OLLAMA_KEEP_ALIVE } from './ai.js';
import { hasGemini, geminiFetch } from './gemini-keys.js';
import { audit } from './ai-audit.js';
import { ocrTools } from '../ocr-fallback.js';
import { ollamaPost, shortBody, stripThink } from '../ollama-opts.js';
import { routing as aiRouting, jobStart, jobEnd, jobUpdate } from '../ai-run.js';
const OWNER_ID = 'owner';
import { SUB_CATEGORIES, categoryFor } from './subs.js';
import { domainFor } from './enrich.js';

const q = (sql) => db.prepare(sql);
let fx = null;
export const _setScreenshotFetch = (fn) => { fx = fn; visionCache.clear(); };
const F = (url, init) => (fx ?? globalThis.fetch)(url, init);

// Kjente tjenester: navn, domene og kategori (SUB_CATEGORIES).
export const KNOWN = [
  [/spotify/i, 'Spotify', 'spotify.com', 'Underholdning'], [/netflix/i, 'Netflix', 'netflix.com', 'Underholdning'], [/disney/i, 'Disney+', 'disneyplus.com', 'Underholdning'],
  [/youtube/i, 'YouTube Premium', 'youtube.com', 'Underholdning'], [/viaplay/i, 'Viaplay', 'viaplay.no', 'Underholdning'], [/icloud/i, 'iCloud+', 'apple.com', 'Lagring og sky'],
  [/chat\s*gpt|openai/i, 'ChatGPT', 'openai.com', 'Produktivitet'], [/\bclaude\b|anthropic/i, 'Claude', 'claude.ai', 'Produktivitet'], [/\bhbo|\bmax\b/i, 'Max', 'max.com', 'Underholdning'],
  [/tv\s*2/i, 'TV 2 Play', 'tv2.no', 'Underholdning'], [/apple\s*music/i, 'Apple Music', 'apple.com', 'Underholdning'], [/apple\s*tv/i, 'Apple TV+', 'apple.com', 'Underholdning'],
  [/apple\s*one/i, 'Apple One', 'apple.com', 'Underholdning'], [/google\s*one/i, 'Google One', 'google.com', 'Lagring og sky'], [/microsoft|office\s*365|m365/i, 'Microsoft 365', 'microsoft.com', 'Produktivitet'],
  [/adobe/i, 'Adobe', 'adobe.com', 'Produktivitet'], [/tidal/i, 'Tidal', 'tidal.com', 'Underholdning'], [/storytel/i, 'Storytel', 'storytel.com', 'Nyheter og lesing'],
  [/audible/i, 'Audible', 'audible.com', 'Underholdning'], [/dropbox/i, 'Dropbox', 'dropbox.com', 'Lagring og sky'], [/proton/i, 'Proton', 'proton.me', 'Produktivitet'],
  [/aftenposten/i, 'Aftenposten', 'aftenposten.no', 'Nyheter og lesing'], [/\bvg\+?/i, 'VG+', 'vg.no', 'Nyheter og lesing'], [/strava/i, 'Strava', 'strava.com', 'Helse og trening'],
  [/sats/i, 'SATS', 'sats.no', 'Helse og trening'], [/playstation|ps\s*plus/i, 'PlayStation Plus', 'playstation.com', 'Underholdning'], [/xbox|game\s*pass/i, 'Xbox Game Pass', 'xbox.com', 'Underholdning'],
  [/nintendo/i, 'Nintendo Switch Online', 'nintendo.com', 'Underholdning'], [/github/i, 'GitHub', 'github.com', 'Produktivitet'], [/1password/i, '1Password', '1password.com', 'Produktivitet'],
];
// Fast kurs-tabell (NOK per enhet). Grov omregning; vises med «≈».
export const RATES = { NOK: 1, USD: 10.8, EUR: 11.7, SEK: 1.0, DKK: 1.57, GBP: 13.9, CHF: 12.3, JPY: 0.072, PLN: 2.7, CAD: 7.9, AUD: 7.1 };
const SYMBOLS = { $: 'USD', '€': 'EUR', '£': 'GBP', kr: 'NOK', 'kr.': 'NOK', ',-': 'NOK', '¥': 'JPY' };

const iso = (d) => d.toLocaleDateString('sv-SE');
const addCycle = (date, syklus) => { const d = new Date(`${date}T12:00:00`); if (syklus === 'år') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1); return iso(d); };
const clamp = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : 0);

// Norske og engelske nøkler fra modellen (tjeneste|service, pris|price, syklus|cycle, neste_trekk|next_charge …).
const ALIASES = {
  tjeneste: ['tjeneste', 'service', 'name', 'navn', 'merchant', 'app'], plan: ['plan', 'tier', 'abonnement', 'subscription'],
  pris: ['pris', 'price', 'amount', 'belop', 'beløp', 'cost'], valuta: ['valuta', 'currency'],
  syklus: ['syklus', 'cycle', 'period', 'periode', 'billing_cycle', 'interval'],
  neste_trekk: ['neste_trekk', 'next_charge', 'next_payment', 'next_billing', 'renewal', 'renews', 'fornyes', 'neste_betaling'],
  sikkerhet: ['sikkerhet', 'confidence', 'konfidens'],
};
const pick = (o, keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; const low = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v])); for (const k of keys) if (low[k] !== undefined && low[k] !== null && low[k] !== '') return low[k]; return null; };
export function unalias(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = Object.fromEntries(Object.entries(ALIASES).map(([k, keys]) => [k, pick(o, keys)]));
  const c = out.sikkerhet && typeof out.sikkerhet === 'object' ? out.sikkerhet : {};
  out.sikkerhet = Object.fromEntries(Object.entries(ALIASES).filter(([k]) => k !== 'sikkerhet').map(([k, keys]) => [k, pick(c, keys)]));
  return out;
}

/** «129,00 kr» → {amount:129, currency:'NOK'}; «$9.99» → USD; «1 290,50» → 1290.5; «149,-» → 149. */
export function parsePrice(v) {
  if (typeof v === 'number') return { amount: v, currency: null };
  const t = String(v ?? '').trim();
  if (!t) return { amount: NaN, currency: null };
  let currency = null;
  if (/\$|usd/i.test(t)) currency = 'USD'; else if (/€|eur/i.test(t)) currency = 'EUR'; else if (/£|gbp/i.test(t)) currency = 'GBP';
  else if (/sek/i.test(t)) currency = 'SEK'; else if (/dkk/i.test(t)) currency = 'DKK'; else if (/kr|nok|,-/i.test(t)) currency = 'NOK';
  let n = t.replace(/,-$/, '').replace(/[^\d.,\s-]/g, '').trim().replace(/[\s ]/g, '');
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, '').replace(',', '.'); // 1.290,50
  else if (/\.\d{1,2}$/.test(n)) n = n.replace(/,/g, ''); // 1,290.50
  else n = n.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
  return { amount: n ? Number(n) : NaN, currency };
}

/** Normaliserer modellsvaret til det klienten viser. now = dagens dato (YYYY-MM-DD). */
export function normalizeSub(raw, { now = iso(new Date()), u = me() } = {}) {
  const r = unalias(raw);
  const conf = r.sikkerhet;
  const sikkerhet = { tjeneste: clamp(conf.tjeneste), plan: clamp(conf.plan), pris: clamp(conf.pris), syklus: clamp(conf.syklus), neste_trekk: clamp(conf.neste_trekk), kategori: 0 };
  let tjeneste = String(r.tjeneste ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
  if (tjeneste && /^(null|ukjent|unknown|n\/a)$/i.test(tjeneste)) tjeneste = null;
  const known = tjeneste ? KNOWN.find(([re]) => re.test(tjeneste)) : null;
  let domain = null, kategori;
  if (known) { tjeneste = known[1]; domain = known[2]; kategori = known[3]; sikkerhet.tjeneste = Math.max(sikkerhet.tjeneste, 0.9); sikkerhet.kategori = 0.95; }
  else { domain = tjeneste ? domainFor(tjeneste) : null; kategori = categoryFor(tjeneste ?? ''); sikkerhet.kategori = kategori === 'Annet' ? 0.4 : 0.8; }
  if (!SUB_CATEGORIES.includes(kategori)) kategori = 'Annet';
  const plan = String(r.plan ?? '').trim().slice(0, 80) || null;
  const { amount: rawAmount, currency: priceCur } = parsePrice(r.pris);
  let valuta = String(r.valuta ?? priceCur ?? 'NOK').trim();
  valuta = SYMBOLS[valuta.toLowerCase()] ?? SYMBOLS[valuta] ?? valuta.toUpperCase().slice(0, 3);
  if (!RATES[valuta]) valuta = 'NOK';
  const sy = String(r.syklus ?? '').trim();
  const weekly = /^(uke|ukentlig|week|weekly|wk)$/i.test(sy);
  const syklus = /^(år|ar|year|yearly|annual|annually|årlig|arlig|yr|per år)$/i.test(sy) ? 'år' : 'mnd';
  // Ukepris regnes om til månedspris (52/12), siden abonnementene har månedlig eller årlig syklus.
  const amount = weekly && Number.isFinite(rawAmount) ? Math.round((rawAmount * 52 / 12) * 100) / 100 : rawAmount;
  let pris = null, prisOriginal, approx = false;
  if (Number.isFinite(amount) && amount > 0) {
    if (valuta === 'NOK') pris = Math.round(amount * 100);
    else { pris = Math.round(amount * RATES[valuta] * 100); prisOriginal = { belop: Math.round(amount * 100), valuta, tekst: `${amount.toFixed(2).replace('.', ',')} ${valuta}` }; approx = true; }
    if (weekly) { approx = true; sikkerhet.syklus = Math.min(sikkerhet.syklus, 0.5); }
  } else sikkerhet.pris = 0;
  if (!r.syklus) sikkerhet.syklus = Math.min(sikkerhet.syklus, 0.5);
  let neste = typeof r.neste_trekk === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.neste_trekk.slice(0, 10)) ? r.neste_trekk.slice(0, 10) : null;
  if (!neste) { neste = addCycle(now, syklus); sikkerhet.neste_trekk = 0; }
  const check = Object.entries(sikkerhet).filter(([, v]) => v < 0.8).map(([k]) => k);
  if (approx && !check.includes('pris')) check.push('pris');
  const existing = tjeneste ? q('SELECT id, name, plan, price FROM fh_subscriptions WHERE user_id=?').all(u).find((s) => s.name.toLowerCase() === tjeneste.toLowerCase() || (known && known[0].test(s.name))) : null;
  return { tjeneste, plan, pris, valuta: 'NOK', ...(prisOriginal ? { prisOriginal } : {}), approx, syklus, ...(weekly ? { syklusOriginal: 'uke' } : {}), neste_trekk: neste, kategori,
    ...(domain ? { domain, logoUrl: `/finans/api/logo/${domain}` } : {}), sikkerhet, check, ...(existing ? { existingId: existing.id, existing: { id: existing.id, name: existing.name, plan: existing.plan, price: existing.price / 100 } } : {}) };
}

/** Gyldig funn: tjeneste ≠ tom og pris > 0. */
export const isValidSub = (n) => !!(n && n.tjeneste && n.pris > 0);

export const MOCK_SUB = { tjeneste: 'Spotify', plan: 'Premium Duo', pris: 179, valuta: 'NOK', syklus: 'mnd', neste_trekk: null, sikkerhet: { tjeneste: 0.98, plan: 0.92, pris: 0.97, syklus: 0.9, neste_trekk: 0 } };

// Ordrett fra spesifikasjonen (prompt 28).
export const PROMPT = `Du leser et skjermbilde av et abonnement (App Store, e-post, kvittering eller kontoside).
Svar KUN med JSON: {"tjeneste":string,"plan":string|null,"pris":number,"valuta":"NOK"|"USD"|"EUR"|string,
"syklus":"mnd"|"år"|"uke","neste_trekk":"YYYY-MM-DD"|null,"sikkerhet":{"tjeneste":0-1,"pris":0-1,"neste_trekk":0-1}}.
Bruk null hvis noe ikke står i bildet. Ikke gjett pris.`;

/* ---------------- Feil ---------------- */

const MESSAGES = {
  ollama_down: 'Får ikke kontakt med Ollama på hjemmeserveren.',
  no_vision: 'Ingen bildemodell installert.',
  timeout: 'Bildemodellen brukte for lang tid.',
  not_found: 'Fant ikke et abonnement i bildet.',
  bad_image: 'Bildet kunne ikke leses. Prøv et skjermbilde som JPEG eller PNG.',
  no_gemini: 'Gemini er ikke satt opp (Innstillinger → AI og tolkning).',
  gemini_failed: 'Gemini kunne ikke lese bildet.',
};
const STATUS = { ollama_down: 502, no_vision: 409, timeout: 504, not_found: 422, bad_image: 415, no_gemini: 400, gemini_failed: 502 };
export const shotError = (code, detail = null) => Object.assign(new Error(MESSAGES[code]), { code, status: STATUS[code], detail });
/** Feilsvaret til klienten: {error, code, canGemini, detail?, install?}. */
export function errorBody(e) {
  const code = e.code ?? 'ollama_down';
  return { error: e.code ? e.message : MESSAGES.ollama_down, code, canGemini: code !== 'no_gemini' && code !== 'gemini_failed' && hasGemini(),
    ...(e.detail ? { detail: String(e.detail).slice(0, 300) } : {}), ...(code === 'no_vision' ? { install: VISION_INSTALL } : {}) };
}

/* ---------------- Bildet ---------------- */

const isHeic = (b) => b.length > 12 && b.subarray(4, 8).toString() === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|heif)$/.test(b.subarray(8, 12).toString());
export function imageKind(b) {
  if (!b?.length) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG') return 'image/png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.subarray(0, 3).toString() === 'GIF') return 'image/gif';
  if (isHeic(b)) return 'image/heic';
  return null;
}
/** Bredde × høyde fra filhodet (PNG/JPEG/GIF), ellers null. */
export function imageSize(b) {
  try {
    const k = imageKind(b);
    if (k === 'image/png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (k === 'image/gif') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (k === 'image/jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { /* ukjent */ }
  return null;
}
const MAX_SIDE = 1600;
let magickFn = null; // tester: _setMagick(async (buf, kind) => jpeg)
export const _setMagick = (fn) => { magickFn = fn; };
async function runMagick(buf, kind) {
  const tl = await ocrTools();
  if (!tl.magick) return null;
  const src = kind === 'image/heic' ? 'heic:-' : kind === 'image/png' ? 'png:-' : kind === 'image/webp' ? 'webp:-' : kind === 'image/gif' ? 'gif:-[0]' : 'jpg:-';
  return new Promise((resolve) => {
    const p = spawn(tl.magick, [src, '-auto-orient', '-resize', `${MAX_SIDE}x${MAX_SIDE}>`, '-strip', '-quality', '85', 'jpg:-'], { timeout: 30_000 });
    const out = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', () => resolve(null));
    p.on('close', (code) => { const r = Buffer.concat(out); resolve(code === 0 && imageKind(r) === 'image/jpeg' ? r : null); });
    p.stdin.on('error', () => {});
    p.stdin.end(buf);
  });
}
/**
 * Gjør bildet klart for modellen: HEIC, PNG, WebP/GIF og bilder over 1600 px konverteres til JPEG ≤1600 px når ImageMagick
 * finnes (det er i Docker-bildet). Uten ImageMagick sendes bildet som det er. → {buf, mime, w, h, converted}
 */
export async function prepareImage(buf) {
  const kind = imageKind(buf);
  if (!kind) throw shotError('bad_image');
  const size = imageSize(buf);
  const big = !size || Math.max(size.w, size.h) > MAX_SIDE;
  if (kind !== 'image/jpeg' || big) {
    const out = await (magickFn ? magickFn(buf, kind) : runMagick(buf, kind)).catch(() => null);
    if (out?.length) { const s2 = imageSize(out); return { buf: out, mime: 'image/jpeg', w: s2?.w ?? null, h: s2?.h ?? null, converted: true }; }
  }
  return { buf, mime: kind, w: size?.w ?? null, h: size?.h ?? null, converted: false };
}
/** Ren base64 uten data:-prefiks (også når klienten sendte en data-URL som tekst). */
export function decodeImageField(v) {
  if (Buffer.isBuffer(v)) return v;
  const t = String(v ?? '').trim();
  if (!t) return null;
  const b64 = t.replace(/^data:[\w/+.-]+;base64,/i, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(b64)) return null;
  const b = Buffer.from(b64, /[-_]/.test(b64) ? 'base64url' : 'base64');
  return b.length ? b : null;
}

/* ---------------- Svaret ---------------- */

/** Fjerner <think>…</think> og alt før første { og etter siste }, og parser. null hvis ugyldig. */
export function parseModelJson(text) {
  if (text && typeof text === 'object') return text;
  let t = stripThink(text);
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1);
  try { const v = JSON.parse(t); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

/* ---------------- Ollama: vision-modell ---------------- */

export const VISION_INSTALL = 'qwen2.5vl:7b';
// Rekkefølge: qwen2.5vl:7b → andre qwen2.5vl → gemma3/gemma4 → llama3.2-vision → andre bildemodeller.
const RANK = [/^qwen2\.5vl:7b$/i, /^qwen2\.5vl/i, /^qwen3-?vl/i, /^gemma3/i, /^gemma4/i, /^llama3\.2-vision/i];
const NAME_VISION = /vl\b|vl:|vision|llava|minicpm-v|gemma3|gemma4|moondream|bakllava/i;
const rankOf = (n) => { const i = RANK.findIndex((re) => re.test(n)); return i < 0 ? RANK.length : i; };
const visionCache = new Map(); // base → {at, model}
const base = () => settings().ollamaUrl.replace(/\/$/, '');
const scaleMs = (ms) => Math.max(1, Math.round(ms * _aiTest.scale));
export const OLLAMA_TIMEOUT_S = 120;

async function ollamaJson(path, { method = 'GET', body, timeout = 5000 } = {}) {
  let res;
  try { res = await F(`${base()}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(scaleMs(timeout)) }); }
  catch (e) { throw shotError('ollama_down', `${e.cause?.code || e.name}`); }
  return res;
}

/** Velger en installert vision-modell (capabilities fra /api/show). Kaster no_vision/ollama_down. */
export async function pickVisionModel({ fresh = false } = {}) {
  const b = base(), hit = visionCache.get(b);
  if (!fresh && hit && Date.now() - hit.at < 10 * 60_000) return hit.model;
  const tags = await ollamaJson('/api/tags');
  if (!tags.ok) throw shotError('ollama_down', `Ollama svarte ${tags.status}`);
  const names = (((await tags.json().catch(() => ({}))).models) ?? []).map((m) => m.name ?? m.model).filter(Boolean);
  let pref = settings().ollamaModel;
  try { pref = aiRouting(OWNER_ID).tasks.rc.model || pref; } catch { /* ruting er valgfri */ } // prompt 34: ruten «Kvitteringer (bilde)» først
  // Spesifikasjonens rekkefølge først, så modellen valgt for kvitteringer, så resten. Embedding-modeller hoppes over.
  const cands = names.filter((n) => !/embed/i.test(n)).sort((x, y) => (rankOf(x) - rankOf(y)) || ((y === pref) - (x === pref)));
  for (const n of cands.slice(0, 12)) {
    let caps = null;
    try {
      const r = await ollamaJson('/api/show', { method: 'POST', body: { model: n, name: n } });
      if (r.ok) { const d = await r.json().catch(() => ({})); if (Array.isArray(d.capabilities)) caps = d.capabilities; }
    } catch (e) { if (e.code === 'ollama_down') throw e; }
    const ok = caps ? caps.includes('vision') : NAME_VISION.test(n); // eldre Ollama uten capabilities: navnet avgjør
    if (ok) { visionCache.set(b, { at: Date.now(), model: n }); return n; }
  }
  visionCache.delete(b);
  throw shotError('no_vision');
}
export const clearVisionCache = () => visionCache.clear();

const logLine = (o) => console.log(`[abo-skjermbilde] ${Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'string' && /\s/.test(v) ? JSON.stringify(v) : v}`).join(' ')}`);

async function readOllama(img) {
  const model = await pickVisionModel();
  const t0 = Date.now();
  let res;
  try {
    res = await ollamaPost(F, `${base()}/api/chat`, shortBody({ model, stream: false, format: 'json', keep_alive: OLLAMA_KEEP_ALIVE, options: { temperature: 0, num_ctx: 8192 },
        messages: [{ role: 'user', content: PROMPT, images: [img.buf.toString('base64')] }] }), { signal: AbortSignal.timeout(scaleMs(OLLAMA_TIMEOUT_S * 1000)) });
  } catch (e) {
    const ms = Date.now() - t0;
    const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    logAi({ task: 'subscreenshot', engine: 'ollama', model, ms, status: timeout ? 'tidsavbrudd' : 'feil', error: timeout ? `over ${OLLAMA_TIMEOUT_S} s` : e.message, limitS: OLLAMA_TIMEOUT_S, ...(timeout ? { timeoutEngine: 'ollama' } : {}) });
    logLine({ engine: 'ollama', model, bytes: img.buf.length, size: `${img.w ?? '?'}x${img.h ?? '?'}`, ms, error: timeout ? 'timeout' : e.cause?.code || e.name });
    if (timeout) { visionCache.clear(); throw shotError('timeout'); }
    visionCache.clear(); throw shotError('ollama_down', e.cause?.code || e.name);
  }
  const ms = Date.now() - t0;
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    logAi({ task: 'subscreenshot', engine: 'ollama', model, ms, status: 'feil', error: `HTTP ${res.status}: ${text.slice(0, 200)}`, limitS: OLLAMA_TIMEOUT_S });
    logLine({ engine: 'ollama', model, bytes: img.buf.length, size: `${img.w ?? '?'}x${img.h ?? '?'}`, ms, status: res.status, raw: text.slice(0, 500) });
    if (res.status === 404 || /not found|does not support|vision|image input/i.test(text)) { visionCache.clear(); throw shotError('no_vision', text.slice(0, 200)); }
    if (/image|decode|format/i.test(text)) throw shotError('bad_image', text.slice(0, 200));
    throw shotError('ollama_down', `Ollama svarte ${res.status}`);
  }
  let content = '';
  try { const d = JSON.parse(text); content = d?.message?.content ?? d?.response ?? ''; } catch { content = text; }
  logLine({ engine: 'ollama', model, bytes: img.buf.length, size: `${img.w ?? '?'}x${img.h ?? '?'}`, ms, raw: String(content).slice(0, 500) });
  const parsed = parseModelJson(content);
  logAi({ task: 'subscreenshot', engine: 'ollama', model, promptLen: PROMPT.length, ms, status: parsed ? 'ok' : 'ugyldig', error: parsed ? null : String(content).slice(0, 200), limitS: OLLAMA_TIMEOUT_S });
  return { raw: parsed, model };
}

/* ---------------- Gemini (bare når brukeren ber om det) ---------------- */

export const GEMINI_SHOT_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest'];
async function readGemini(img) {
  if (!hasGemini()) throw shotError('no_gemini');
  audit('gemini', 'subscreenshot', { image: { mime: img.mime, bytes: img.buf.length, w: img.w, h: img.h }, prompt: 'abonnement-fra-skjermbilde' });
  for (const model of GEMINI_SHOT_MODELS) {
    const t0 = Date.now();
    let res;
    try {
      res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(scaleMs(Math.max(30, aiTimeoutsOf().gemini) * 1000)),
        body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: img.mime, data: img.buf.toString('base64') } }, { text: PROMPT }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } }) });
    } catch (e) {
      const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
      logAi({ task: 'subscreenshot', engine: 'gemini', model, ms: Date.now() - t0, status: timeout ? 'tidsavbrudd' : 'feil', error: e.message });
      throw shotError(timeout ? 'timeout' : 'gemini_failed', e.message);
    }
    const ms = Date.now() - t0;
    const text = await res.text().catch(() => '');
    if (res.status === 404 && model !== GEMINI_SHOT_MODELS.at(-1)) continue;
    if (!res.ok) { logAi({ task: 'subscreenshot', engine: 'gemini', model, ms, status: 'feil', error: `HTTP ${res.status}` }); throw shotError('gemini_failed', `Gemini svarte ${res.status}`); }
    let content = '';
    try { content = (JSON.parse(text).candidates?.[0]?.content?.parts ?? []).filter((x) => !x.thought).map((x) => x.text ?? '').join(''); } catch { /* tomt */ }
    logLine({ engine: 'gemini', model, bytes: img.buf.length, size: `${img.w ?? '?'}x${img.h ?? '?'}`, ms, raw: content.slice(0, 500) });
    const parsed = parseModelJson(content);
    logAi({ task: 'subscreenshot', engine: 'gemini', model, promptLen: PROMPT.length, ms, status: parsed ? 'ok' : 'ugyldig' });
    return { raw: parsed, model };
  }
  throw shotError('gemini_failed');
}

/**
 * Leser skjermbildet. engine = 'ollama' (standard, lokalt) eller 'gemini' (bare når brukeren trykket «Les med Gemini»).
 * → normalisert svar + {engine, model, image:{w,h,bytes,converted}}. Kaster shotError med code.
 */
export async function readScreenshot(buf, { engine = 'ollama', u = me(), mock = null } = {}) {
  // MOCK_DATA=1: ?mock=ollama_down|no_vision|timeout|not_found gir feilkortet (for klienttester), ellers Spotify.
  if (process.env.MOCK_DATA === '1' && !fx && mock && MESSAGES[mock]) throw shotError(mock);
  if (process.env.MOCK_DATA === '1' && !fx) return { ...normalizeSub({ ...MOCK_SUB }, { u }), engine: 'mock', model: 'mock' };
  const img = await prepareImage(buf);
  // Prompt 34: jobben vises i AI-kontroll → Jobber.
  const jobId = jobStart({ user: u, task: 'rc', kind: 'screenshot', title: 'Abonnement fra skjermbilde', provider: engine === 'gemini' ? 'gemini' : 'ollama' });
  const t0 = Date.now();
  try {
    const { raw, model } = engine === 'gemini' ? await readGemini(img) : await readOllama(img);
    const n = raw ? normalizeSub(raw, { u }) : null;
    if (!isValidSub(n)) throw shotError('not_found');
    jobEnd(jobId, { model, ms: Date.now() - t0 });
    return { ...n, engine, model, image: { w: img.w, h: img.h, bytes: img.buf.length, converted: img.converted } };
  } catch (e) {
    jobUpdate(jobId, { status: 'fail', error: e.message, ms: Date.now() - t0 });
    throw e;
  } finally { if (img.buf !== buf) img.buf.fill(0); }
}
