// Integrasjoner (prompt 24): én liste med alle oppsettene, for appene og nettsiden.
//   GET    /api/integrations                  → [{id, name, group, status, fields:[{key,label,type,value|null,saved,help}], canTest, message?}]
//   PUT    /api/integrations/:id {key: value}  → lagrer (hemmeligheter kryptert), svarer med integrasjonen
//   POST   /api/integrations/:id/test          → {ok, message, ms}
//   DELETE /api/integrations/:id/:key          → fjerner verdien (tilbake til miljø/standard), svarer med integrasjonen
// Bare administratorer (andre får 403). Sesjon eller app-token (authOrToken; endring krever finance:write).
// Verdiene ligger der de alltid har ligget: Homelab-oppsettet (settings.js, kv «cfg», hemmeligheter krypteres med enc1:)
// og FinansHubs innstillinger og hemmeligheter (finans/db.js, «fh_settings» og «fh_secret», krypteres med enc:).
// Hemmelige verdier sendes aldri ut, bare saved:true/false.
import { Hono } from 'hono';
import { kv, OWNER } from './db.js';
import { cfg, updateConfig, SCHEMA } from './settings.js';
import { isAdmin, sessionUser, userInfo } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { authOrToken } from './mobile.js';
import { secret, setSecret, settings, saveSettings, DEFAULT_SETTINGS } from './finans/db.js';
import { PROFILES } from './finans/csv.js';
import { geminiKeys, addKey, removeKey } from './finans/gemini-keys.js';
import { testEngine } from './finans/ai.js';
import { testMail } from './finans/mail.js';
import * as integ from './integrations.js';
import { testTracking } from './tracking.js';
import { testMap } from './tiles.js';
import { testBackgrounds } from './background.js';
import { iconSvg } from './icons.js';
import { clearCache } from './cache.js';

const MOCK = process.env.MOCK_DATA === '1';

/* ---------------- Lagring ---------------- */

// Felt i Homelab-oppsettet (settings.js): verdi, standard og hemmelig hentes fra SCHEMA.
const CFG = new Map(SCHEMA.flatMap(([, , fs]) => fs.map((f) => [f[0], { secret: !!f[3] }])));
const cfgStore = (key) => ({
  get: () => cfg(key), secret: CFG.get(key)?.secret ?? false,
  set: (v) => updateConfig({ [key]: v }), clear: () => updateConfig({ [key]: null }),
});
const fhSecret = (key) => ({ get: () => secret(key), secret: true, set: (v) => setSecret(key, String(v).trim()), clear: () => setSecret(key, '') });
const fhSetting = (key, check) => ({
  get: () => settings()[key] ?? '', secret: false,
  set: (v) => { const x = check ? check(v) : String(v).trim(); if (x === undefined) throw new Error('Ugyldig verdi'); saveSettings({ [key]: x }); },
  clear: () => saveSettings({ [key]: DEFAULT_SETTINGS[key] }),
});
// Trading 212: FinansHub (Aksjer) og Homelab-widgeten har hver sin lagring fra før. Lagres begge steder, så de er like.
const both = (fhKey, cfgKey, isSecret = true) => ({
  get: () => (isSecret ? secret(fhKey) : settings()[fhKey]) || cfg(cfgKey), secret: isSecret,
  set: (v) => { const s = String(v).trim(); if (isSecret) setSecret(fhKey, s); else saveSettings({ [fhKey]: s }); updateConfig({ [cfgKey]: s }); kv.set(OWNER, 'fh_t212_auth', 'basic'); },
  clear: () => { if (isSecret) setSecret(fhKey, ''); else saveSettings({ [fhKey]: DEFAULT_SETTINGS[fhKey] }); updateConfig({ [cfgKey]: null }); },
});
// Flere Gemini-nøkler (reserver): én per linje legges til listen; fjern tømmer reservene (hovednøkkelen er eget felt).
const geminiExtra = {
  get: () => (geminiKeys().filter((k) => k.id !== 'main').length ? 'x' : ''), secret: true,
  set: (v) => { String(v).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).forEach((k) => addKey('', k)); },
  clear: () => { for (const k of geminiKeys()) if (k.id !== 'main') removeKey(k.id); },
};
const int = (lo, hi) => (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };
const oneOf = (list) => (v) => (list.includes(String(v).trim()) ? String(v).trim() : undefined);
const urlOk = (v) => (/^https?:\/\/\S+$/.test(String(v).trim()) ? String(v).trim() : undefined);
const hostOk = (v) => (/^[a-z0-9.-]{0,120}$/i.test(String(v).trim()) ? String(v).trim() : undefined);

const F = (key, label, type, store, { help = '', required = false } = {}) => ({ key, label, type, store, help, required });

/* ---------------- Integrasjonene ---------------- */

const viaGroup = (name) => () => integ.testIntegration(name);
export const INTEGRATIONS = [
  { id: 'ha', name: 'Home Assistant', group: 'Hjem', test: viaGroup('Home Assistant'), fields: [
    F('ha_url', 'Adresse', 'url', cfgStore('ha_url'), { required: true, help: 'For eksempel http://192.168.1.20:8123' }),
    F('ha_token', 'Long-lived token', 'secret', cfgStore('ha_token'), { required: true, help: 'Home Assistant → Profil → Sikkerhet → Long-lived access tokens' }),
  ] },
  { id: 'google', name: 'Google Kalender', group: 'Hjem', test: testGoogle, fields: [
    F('googleClientId', 'Klient-ID', 'text', cfgStore('googleClientId'), { required: true, help: 'OAuth-klient (Web application) fra Google Cloud Console. Brukes av Bursdager.' }),
    F('googleClientSecret', 'Klienthemmelighet', 'secret', cfgStore('googleClientSecret'), { required: true }),
    F('googleRedirectUri', 'Omdirigerings-URI (valgfri)', 'url', cfgStore('googleRedirectUri'), { help: 'https://<din adresse>/api/birthdays/google/callback. Tom = adressen serveren nås på.' }),
  ] },
  { id: 'ai', name: 'AI (Gemini, Groq og Ollama)', group: 'AI', test: testAi, fields: [
    F('geminiKey', 'Gemini API-nøkkel', 'secret', fhSecret('geminiKey'), { help: 'aistudio.google.com → Get API key' }),
    F('geminiKeys', 'Flere Gemini-nøkler (reserve, én per linje)', 'secret', geminiExtra, { help: 'Brukes etter tur når en nøkkel er brukt opp for dagen.' }),
    F('groqKey', 'Groq API-nøkkel', 'secret', fhSecret('groqKey'), { help: 'console.groq.com → API Keys' }),
    F('ollamaUrl', 'Ollama-adresse', 'url', fhSetting('ollamaUrl', urlOk), { help: 'For eksempel http://192.168.1.30:11434' }),
    F('ollamaModel', 'Ollama-modell', 'text', fhSetting('ollamaModel', (v) => String(v).trim().slice(0, 60) || undefined)),
  ] },
  { id: 't212', name: 'Trading 212', group: 'Finans', test: viaGroup('Trading 212'), fields: [
    F('t212Key', 'API-nøkkel (Key ID)', 'secret', both('t212Key', 't212_key'), { required: true, help: 'app.trading212.com → Innstillinger → API. Bare lesetilgang.' }),
    F('t212Secret', 'Secret', 'secret', both('t212Secret', 't212_secret')),
    F('t212Env', 'Miljø (live eller demo)', 'text', { ...both('t212Env', 't212_env', false), set: (v) => { const e = oneOf(['live', 'demo'])(v); if (!e) throw new Error('Miljø må være live eller demo'); saveSettings({ t212Env: e }); updateConfig({ t212_env: e }); } }),
  ] },
  { id: 'bank', name: 'Bank og import', group: 'Finans', test: null, fields: [
    F('csvProfile', `CSV-profil (${PROFILES.join(', ')})`, 'text', fhSetting('csvProfile', oneOf(PROFILES)), { help: 'Brukes når en bankfil er tvetydig. Kolonnene finnes ellers automatisk.' }),
  ] },
  { id: 'imap', name: 'Kvitteringer på e-post (IMAP)', group: 'Finans', test: () => testMail(), fields: [
    F('imapHost', 'Vert', 'text', fhSetting('imapHost', hostOk), { required: true, help: 'Proton Mail Bridge: protonmail-bridge (i Docker) eller 127.0.0.1' }),
    F('imapPort', 'Port', 'text', fhSetting('imapPort', int(1, 65535))),
    F('imapSecurity', 'Sikkerhet (starttls, tls eller none)', 'text', fhSetting('imapSecurity', oneOf(['starttls', 'tls', 'none']))),
    F('imapUser', 'Brukernavn', 'text', fhSetting('imapUser', (v) => String(v).trim().slice(0, 120)), { required: true }),
    F('imapPass', 'Passord', 'secret', fhSecret('imapPass'), { required: true }),
    F('imapFolder', 'Mappe', 'text', fhSetting('imapFolder', (v) => String(v).trim().slice(0, 120) || 'INBOX')),
  ] },
  { id: 'entur', name: 'Entur (Ruter)', group: 'Reise', test: viaGroup('Ruter (Entur)'), fields: [
    F('ruter_routes', 'Strekninger – én per linje: Fra (NSR-ID) > Til (NSR-ID)', 'text', cfgStore('ruter_routes'), { help: 'Stopp-ID finner du på stoppested.entur.org. Egne stopp i appen trenger ingen nøkkel.' }),
    F('ruter_count', 'Antall avganger', 'text', cfgStore('ruter_count')),
  ] },
  { id: 'mybring', name: 'Mybring (Posten og Bring)', group: 'Sporing', test: testTracking, fields: [
    F('mybringUid', 'Mybring-bruker (e-post)', 'text', cfgStore('mybringUid'), { required: true }),
    F('mybringKey', 'API-nøkkel', 'secret', cfgStore('mybringKey'), { required: true, help: 'mybring.com → Innstillinger → API' }),
  ] },
  { id: 'postnord', name: 'PostNord', group: 'Sporing', test: testTracking, fields: [
    F('postnordKey', 'API-nøkkel', 'secret', cfgStore('postnordKey'), { required: true, help: 'developer.postnord.com → Track and Trace' }),
  ] },
  { id: 'parcelsapp', name: 'ParcelsApp', group: 'Sporing', test: testTracking, fields: [
    F('trk_parcelsapp_key', 'API-nøkkel', 'secret', cfgStore('trk_parcelsapp_key'), { required: true, help: 'Siste reserve. Gratisplanen har 3 oppslag i måneden.' }),
  ] },
  { id: 'cloudflare', name: 'Cloudflare', group: 'Nettverk', test: viaGroup('Cloudflare'), fields: [
    F('cf_token', 'API-token (Zone, DNS, Analytics: Read)', 'secret', cfgStore('cf_token'), { required: true }),
    F('cf_domain', 'Første domene', 'text', cfgStore('cf_domain')),
  ] },
  { id: 'finn', name: 'Finn', group: 'Finans', test: null, fields: [
    F('imapFinnFolder', 'E-postmappe for Finn-e-poster', 'text', fhSetting('imapFinnFolder', (v) => String(v).trim().slice(0, 120)), { required: true, help: 'Kvitteringer og meldinger fra Finn leses fra denne mappen (samme e-postkonto som Kvitteringer).' }),
  ] },
  { id: 'met', name: 'MET / Yr', group: 'Generelt', test: viaGroup('Vær (MET/Yr)'), fields: [
    F('wx_place', 'Sted', 'text', cfgStore('wx_place'), { required: true }),
    F('wx_lat', 'Breddegrad', 'text', cfgStore('wx_lat'), { required: true }),
    F('wx_lon', 'Lengdegrad', 'text', cfgStore('wx_lon'), { required: true }),
  ] },
  { id: 'map', name: 'Kart (MapTiler og Stadia)', group: 'Generelt', test: testMap, fields: [
    F('maptilerKey', 'MapTiler API-nøkkel', 'secret', cfgStore('maptilerKey'), { help: 'Valgfri. Kartverket (standard) trenger ingen nøkkel.' }),
    F('stadiaKey', 'Stadia Maps API-nøkkel', 'secret', cfgStore('stadiaKey'), { help: 'Valgfri.' }),
  ] },
  { id: 'icons', name: 'Ikoner (Iconify)', group: 'Generelt', test: testIcons, fields: [] },
  { id: 'photos', name: 'Bilder (Unsplash og Pexels)', group: 'Generelt', test: testBackgrounds, fields: [
    F('unsplash_key', 'Unsplash Access Key', 'secret', cfgStore('unsplash_key')),
    F('pexels_key', 'Pexels API-nøkkel', 'secret', cfgStore('pexels_key')),
  ] },
];
const byId = new Map(INTEGRATIONS.map((x) => [x.id, x]));

/* ---------------- Tester ---------------- */

let googleFetch = null;
export const _setIntegrationsGoogleFetch = (fn) => { googleFetch = fn; };
// Google: et ugyldig kodebytte svarer «invalid_grant» når klient-ID og hemmelighet stemmer, og «invalid_client» ellers.
async function testGoogle() {
  const id = cfg('googleClientId'), sec = cfg('googleClientSecret');
  if (!id || !sec) return { ok: false, message: 'Klient-ID og klienthemmelighet mangler.' };
  if (MOCK && !googleFetch) return { ok: true, mock: true, message: 'Demodata (MOCK_DATA=1): ingen ekte kall ble gjort.' };
  try {
    const r = await (googleFetch ?? fetch)('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'homelab-test', client_id: id, client_secret: sec, redirect_uri: cfg('googleRedirectUri') || 'http://localhost/api/birthdays/google/callback' }).toString(), signal: AbortSignal.timeout(10_000) });
    const j = await r.json().catch(() => ({}));
    if (j.error === 'invalid_client' || j.error === 'unauthorized_client') return { ok: false, message: 'Google godtok ikke klient-ID eller hemmelighet.' };
    if (j.error === 'invalid_grant' || j.error === 'redirect_uri_mismatch') return { ok: true, message: 'Google godtok klienten. Hver bruker logger inn selv under Bursdager.' };
    return { ok: r.ok, message: j.error_description || j.error || `Google svarte ${r.status}` };
  } catch (e) { return { ok: false, message: `Fikk ikke kontakt med Google: ${e.message}` }; }
}
async function testAi() {
  const st = settings(), order = [st.provider, ...['gemini', 'groq', 'ollama'].filter((p) => p !== st.provider)];
  const usable = order.filter((p) => (p === 'gemini' ? geminiKeys().length : p === 'groq' ? secret('groqKey') : true));
  if (MOCK) return { ok: true, mock: true, message: 'Demodata (MOCK_DATA=1): ingen ekte kall ble gjort.' };
  const r = await testEngine(usable[0] ?? st.provider);
  return { ok: r.ok, message: r.message, ms: r.ms };
}
async function testIcons() {
  try { const s = await iconSvg('lucide', 'zap'); return { ok: !!s, message: s ? 'Iconify svarte (lucide:zap). Ingen nøkkel trengs.' : 'Iconify ga ikke noe ikon.' }; }
  catch (e) { return { ok: false, message: `Iconify svarte ikke: ${e.message}` }; }
}

/* ---------------- Utdata ---------------- */

const lastTests = () => kv.get(OWNER, 'integ_tests', {}) ?? {};
function fieldOut(f) {
  const v = f.store.get();
  const saved = v !== undefined && v !== null && String(v) !== '';
  const type = f.type === 'secret' || f.store.secret ? 'secret' : f.type;
  return { key: f.key, label: f.label, type, value: type === 'secret' ? null : saved ? String(v) : null, saved, help: f.help, required: !!f.required };
}
export function integrationOut(x) {
  const fields = x.fields.map(fieldOut);
  const missing = x.fields.some((f, i) => f.required && !fields[i].saved);
  const t = lastTests()[x.id];
  const status = missing ? 'missing' : t && t.ok === false ? 'error' : 'ok';
  return { id: x.id, name: x.name, group: x.group, status, fields, canTest: !!x.test, ...(t ? { lastTest: t } : {}), ...(status === 'error' ? { message: t.message } : {}) };
}
export const listIntegrations = () => INTEGRATIONS.map(integrationOut);
// Felles test for den eldre «Test tilkobling» (POST /api/config/test/:group): finner integrasjonen på id eller navn
// (f.eks. «google» eller «Google Kalender»). null = ukjent eller uten egen test her.
export async function testByIdOrName(key) {
  const k = String(key ?? '').trim().toLowerCase();
  const x = INTEGRATIONS.find((i) => i.id === k || i.name.toLowerCase() === k);
  if (!x?.test) return null;
  const t0 = Date.now();
  let r;
  try { r = await x.test(); } catch (e) { r = { ok: false, message: e.message }; }
  const out = { ok: !!r.ok, message: r.message ?? (r.ok ? 'OK' : 'Feilet'), ms: r.ms ?? Date.now() - t0, ...(r.mock ? { mock: true } : {}), at: new Date().toISOString() };
  kv.set(OWNER, 'integ_tests', { ...lastTests(), [x.id]: out });
  return out;
}

/* ---------------- API ---------------- */

const api = new Hono();
api.use('*', authOrToken, async (c, next) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan se og endre integrasjonene', restricted: true }, 403);
  await next();
});
const find = (c) => byId.get(c.req.param('id'));

api.get('/', (c) => c.json(listIntegrations()));
api.get('/:id', (c) => { const x = find(c); return x ? c.json(integrationOut(x)) : c.json({ error: 'Ukjent integrasjon' }, 404); });
api.put('/:id', async (c) => {
  const x = find(c);
  if (!x) return c.json({ error: 'Ukjent integrasjon' }, 404);
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet et objekt {nøkkel: verdi}' }, 400);
  const fields = new Map(x.fields.map((f) => [f.key, f]));
  for (const k of Object.keys(b)) if (!fields.has(k)) return c.json({ error: `Ukjent felt: ${k}` }, 400);
  try {
    for (const [k, v] of Object.entries(b)) {
      const f = fields.get(k);
      if (v === null) { f.store.clear(); continue; }
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new Error(`${f.label}: ugyldig verdi`);
      const s = String(v);
      if (s.length > 4000) throw new Error(`${f.label}: for lang verdi`);
      if ((f.type === 'secret' || f.store.secret) && !s.trim()) continue; // tomt felt = behold lagret hemmelighet
      f.store.set(s);
    }
  } catch (e) { return c.json({ error: e.message }, e.status && e.status < 500 ? e.status : 400); }
  clearCache();
  const t = lastTests(); delete t[x.id]; kv.set(OWNER, 'integ_tests', t); // ny verdi: forrige testresultat gjelder ikke lenger
  return c.json(integrationOut(x));
});
api.post('/:id/test', async (c) => {
  const x = find(c);
  if (!x) return c.json({ error: 'Ukjent integrasjon' }, 404);
  if (!x.test) return c.json({ error: 'Denne integrasjonen har ingen test' }, 400);
  const t0 = Date.now();
  let r;
  try { r = await x.test(); } catch (e) { r = { ok: false, message: e.message }; }
  const out = { ok: !!r.ok, message: r.message ?? (r.ok ? 'OK' : 'Feilet'), ms: r.ms ?? Date.now() - t0, ...(r.mock ? { mock: true } : {}), at: new Date().toISOString() };
  kv.set(OWNER, 'integ_tests', { ...lastTests(), [x.id]: out });
  return c.json(out);
});
api.delete('/:id/:key', (c) => {
  const x = find(c);
  if (!x) return c.json({ error: 'Ukjent integrasjon' }, 404);
  const f = x.fields.find((y) => y.key === c.req.param('key'));
  if (!f) return c.json({ error: 'Ukjent felt' }, 404);
  try { f.store.clear(); } catch (e) { return c.json({ error: e.message }, 400); }
  clearCache();
  return c.json(integrationOut(x));
});

export default api;

/* ---------------- ✦ AI-søk i innstillingene (prompt 24) ---------------- */
// POST /api/settings/ai-search {q, items:[{id, title, path}]} → {answer, ids, provider, mode:'ai'|'text'}.
// Klienten sender sin egen indeks over innstillingene; AI-en velger id-er fra den (ukjente id-er fjernes). Uten AI-motor
// (eller når den feiler) brukes enkel tekstmatch med noen vanlige synonymer.
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');
const SYN = { ikon: ['ikon', 'icon', 'app-ikon'], icon: ['ikon'], bring: ['mybring', 'posten', 'bring'], posten: ['mybring', 'bring'], morkt: ['tema', 'mork', 'dark'], mork: ['tema', 'morkt'], tema: ['utseende', 'tema'],
  passord: ['passord', 'sikkerhet'], '2fa': ['sikkerhet', 'totp'], varsel: ['varsler'], varsler: ['varsel'], navn: ['navn', 'appnavn'], bakgrunn: ['bakgrunn', 'bilde'], kart: ['kart', 'maptiler'],
  nokkel: ['nokkel', 'token', 'api'], token: ['nokkel', 'token'], gemini: ['ai', 'gemini'], ai: ['ai', 'gemini', 'ollama'], bursdag: ['bursdager', 'google'], kalender: ['google', 'kalender'] };
const STOP = new Set(['hvor', 'hva', 'hvordan', 'jeg', 'kan', 'man', 'en', 'et', 'det', 'den', 'pa', 'i', 'til', 'for', 'av', 'med', 'min', 'mitt', 'mine', 'bytter', 'endre', 'endrer', 'bytte', 'finner', 'er', 'og', 'a', 'skal', 'vil']);
export function textSearch(q, items, limit = 8) {
  const words = fold(q).split(/[^a-z0-9-]+/).filter((w) => w.length > 1 && !STOP.has(w));
  const terms = [...new Set(words.flatMap((w) => [w, ...(SYN[w] ?? [])]))];
  if (!terms.length) return [];
  return items.map((it) => {
    const t = fold(it.title), p = fold(it.path);
    let score = 0;
    for (const w of terms) { if (t.includes(w)) score += t.startsWith(w) ? 4 : 3; else if (p.includes(w)) score += 1; else if (w.length > 4 && t.includes(w.slice(0, -1))) score += 2; }
    return { it, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.it);
}
const textAnswer = (hits) => (hits.length ? `Fant ${hits.length === 1 ? 'ett treff' : `${hits.length} treff`}. «${hits[0].title}» ligger under ${hits[0].path || 'Innstillinger'}.` : 'Fant ingen innstilling som passer. Prøv med andre ord.');

let aiImpl = null;
export const _setSettingsAi = (fn) => { aiImpl = fn; };
export const settingsSearchApi = new Hono();
// Søket endrer ingenting, så et app-token med finance:read holder.
const readAuth = async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
};
settingsSearchApi.post('/ai-search', readAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const q = String(b.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!q) return c.json({ error: 'Skriv hva du leter etter' }, 400);
  if (!Array.isArray(b.items) || !b.items.length) return c.json({ error: 'Mangler items (listen over innstillinger)' }, 400);
  const items = b.items.slice(0, 400).map((x) => ({ id: String(x?.id ?? '').slice(0, 80), title: String(x?.title ?? '').slice(0, 120), path: String(x?.path ?? '').slice(0, 200) })).filter((x) => x.id && x.title);
  const known = new Set(items.map((x) => x.id));
  const text = () => { const hits = textSearch(q, items); return { mode: 'text', provider: null, answer: textAnswer(hits), ids: hits.map((x) => x.id) }; };
  const ai = aiImpl ?? (MOCK ? null : (await import('./homeos-common.js')).aiJson);
  if (!ai) return c.json(text());
  const schema = { type: 'OBJECT', properties: { answer: { type: 'STRING' }, ids: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['answer', 'ids'] };
  const prompt = 'Du hjelper brukeren å finne riktig innstilling i en app. Under er alle innstillingene som JSON (id, title, path).\n'
    + 'Svar på norsk bokmål med én kort setning om hvor innstillingen ligger (bruk path), og gi id-ene til de 1–5 beste treffene, best først. '
    + 'Bruk bare id-er fra listen. Finnes ingen, svar det og gi en tom liste.\n'
    + `Innstillinger: ${JSON.stringify(items)}\nSpørsmål: «${q}»`;
  try {
    const r = await Promise.race([ai(prompt, schema, { timeout: 20_000, temperature: 0.2, task: 'search' }), new Promise((_, rej) => setTimeout(() => rej(new Error('AI svarte ikke i tide')), 22_000).unref?.())]);
    const ids = [...new Set((Array.isArray(r?.data?.ids) ? r.data.ids : []).map(String).filter((id) => known.has(id)))].slice(0, 8);
    const answer = String(r?.data?.answer ?? '').trim().slice(0, 600);
    if (!answer && !ids.length) throw new Error('Tomt svar');
    return c.json({ mode: 'ai', provider: r.provider ?? null, answer: answer || textAnswer(items.filter((x) => ids.includes(x.id))), ids });
  } catch (e) {
    return c.json({ ...text(), fallback: true, reason: e.message });
  }
});
