// Prompt 27: nytt abonnement fra skjermbilde. Bildet leses av Ollama med bildemodell (lokalt, format: json) og sendes aldri
// til sky. Ruten sletter ikke noe på disk fordi bildet aldri lagres: det ligger bare i minnet under lesingen.
// Svar: {tjeneste, plan, pris (øre NOK), valuta, prisOriginal?, syklus:'mnd'|'år', neste_trekk, kategori, logoUrl?, domain?,
//        sikkerhet:{felt:0–1}, check:[felt…], existingId?, approx?}
import { db, me, settings } from './db.js';
import { aiTimeoutsOf } from './ai.js';
import { SUB_CATEGORIES, categoryFor } from './subs.js';
import { domainFor } from './enrich.js';

const q = (sql) => db.prepare(sql);
let fx = null;
export const _setScreenshotFetch = (fn) => { fx = fn; };
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

const SCHEMA = { type: 'object', properties: {
  tjeneste: { type: ['string', 'null'] }, plan: { type: ['string', 'null'] }, pris: { type: ['number', 'null'] }, valuta: { type: ['string', 'null'] },
  syklus: { type: ['string', 'null'], enum: ['mnd', 'år', null] }, neste_trekk: { type: ['string', 'null'] },
  sikkerhet: { type: 'object', properties: { tjeneste: { type: 'number' }, plan: { type: 'number' }, pris: { type: 'number' }, syklus: { type: 'number' }, neste_trekk: { type: 'number' } } },
}, required: ['tjeneste', 'pris', 'sikkerhet'] };
const PROMPT = `Du leser et skjermbilde av et abonnement (kvittering i en app, App Store-abonnement, e-post eller kontoside).
Returner KUN JSON: {"tjeneste","plan","pris" (tall, punktum som desimalskille),"valuta" (ISO-kode, f.eks. NOK, USD, EUR),"syklus" ("mnd" eller "år"),"neste_trekk" ("YYYY-MM-DD" eller null),"sikkerhet":{felt:0–1}}.
Gjett ikke: ukjent felt = null.`;

const iso = (d) => d.toLocaleDateString('sv-SE');
const addCycle = (date, syklus) => { const d = new Date(`${date}T12:00:00`); if (syklus === 'år') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1); return iso(d); };
const clamp = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : 0);

/** Normaliserer modellsvaret til det klienten viser. now = dagens dato (YYYY-MM-DD). */
export function normalizeSub(raw, { now = iso(new Date()), u = me() } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const conf = r.sikkerhet && typeof r.sikkerhet === 'object' ? r.sikkerhet : {};
  const sikkerhet = { tjeneste: clamp(conf.tjeneste), plan: clamp(conf.plan), pris: clamp(conf.pris), syklus: clamp(conf.syklus), neste_trekk: clamp(conf.neste_trekk), kategori: 0 };
  let tjeneste = String(r.tjeneste ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
  const known = tjeneste ? KNOWN.find(([re]) => re.test(tjeneste)) : null;
  let domain = null, kategori;
  if (known) { tjeneste = known[1]; domain = known[2]; kategori = known[3]; sikkerhet.tjeneste = Math.max(sikkerhet.tjeneste, 0.9); sikkerhet.kategori = 0.95; }
  else { domain = tjeneste ? domainFor(tjeneste) : null; kategori = categoryFor(tjeneste ?? ''); sikkerhet.kategori = kategori === 'Annet' ? 0.4 : 0.8; }
  if (!SUB_CATEGORIES.includes(kategori)) kategori = 'Annet';
  const plan = String(r.plan ?? '').trim().slice(0, 80) || null;
  let valuta = String(r.valuta ?? 'NOK').trim();
  valuta = SYMBOLS[valuta.toLowerCase()] ?? SYMBOLS[valuta] ?? valuta.toUpperCase().slice(0, 3);
  if (!RATES[valuta]) valuta = 'NOK';
  const amount = Number(String(r.pris ?? '').replace(/\s/g, '').replace(',', '.'));
  let pris = null, prisOriginal, approx = false;
  if (Number.isFinite(amount) && amount > 0) {
    if (valuta === 'NOK') pris = Math.round(amount * 100);
    else { pris = Math.round(amount * RATES[valuta] * 100); prisOriginal = { belop: Math.round(amount * 100), valuta, tekst: `${amount.toFixed(2).replace('.', ',')} ${valuta}` }; approx = true; }
  } else sikkerhet.pris = 0;
  const syklus = /^(år|ar|year|yearly|annual|årlig|arlig|yr)$/i.test(String(r.syklus ?? '').trim()) ? 'år' : 'mnd';
  if (!r.syklus) sikkerhet.syklus = Math.min(sikkerhet.syklus, 0.5);
  let neste = typeof r.neste_trekk === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.neste_trekk) ? r.neste_trekk : null;
  if (!neste) { neste = addCycle(now, syklus); sikkerhet.neste_trekk = 0; }
  const check = Object.entries(sikkerhet).filter(([, v]) => v < 0.8).map(([k]) => k);
  if (approx && !check.includes('pris')) check.push('pris');
  const existing = tjeneste ? q('SELECT id, name, plan, price FROM fh_subscriptions WHERE user_id=?').all(u).find((s) => s.name.toLowerCase() === tjeneste.toLowerCase() || (known && known[0].test(s.name))) : null;
  return { tjeneste, plan, pris, valuta: 'NOK', ...(prisOriginal ? { prisOriginal } : {}), approx, syklus, neste_trekk: neste, kategori,
    ...(domain ? { domain, logoUrl: `/finans/api/logo/${domain}` } : {}), sikkerhet, check, ...(existing ? { existingId: existing.id, existing: { id: existing.id, name: existing.name, plan: existing.plan, price: existing.price / 100 } } : {}) };
}

export const MOCK_SUB = { tjeneste: 'Spotify', plan: 'Premium Duo', pris: 179, valuta: 'NOK', syklus: 'mnd', neste_trekk: null, sikkerhet: { tjeneste: 0.98, plan: 0.92, pris: 0.97, syklus: 0.9, neste_trekk: 0 } };

/** Leser skjermbildet lokalt med Ollama (bildemodell). Bildet forlater aldri serveren. */
export async function readScreenshot(image) {
  if (process.env.MOCK_DATA === '1' && !fx) return { ...MOCK_SUB };
  const st = settings();
  const model = st.ollamaModel || 'qwen2.5vl:7b';
  let res;
  try {
    res = await F(`${st.ollamaUrl.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(aiTimeoutsOf().ollama * 1000 * 2),
      body: JSON.stringify({ model, stream: false, format: SCHEMA, options: { temperature: 0 }, keep_alive: '10m', messages: [{ role: 'user', content: PROMPT, images: [image.toString('base64')] }] }) });
  } catch (e) { throw Object.assign(new Error(`Ollama kan ikke nås (${e.cause?.code || e.name})`), { status: 502 }); }
  if (!res.ok) throw Object.assign(new Error(`Ollama svarte ${res.status}`), { status: 502 });
  const d = await res.json().catch(() => null);
  try { return JSON.parse(d?.message?.content ?? 'null'); } catch { throw Object.assign(new Error('Ollama ga ugyldig JSON'), { status: 502 }); }
}
