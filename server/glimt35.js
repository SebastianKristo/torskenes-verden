// Prompt 35 (SERVER35): Glimt-innstillinger (figur, venner, brief, opplesning, briefer gjennom dagen, stemme), «nesten
// menneskelige» stemmer (POST /api/tts) og bildeproxy for nyhetsbilder (GET /api/img). Alt per bruker; nøkler og serveroppsett
// endres bare av admin (PUT /api/ai/keys/openai|elevenlabs|azure), alle ser status. Nøkler sendes aldri til klienten.
//
// GET /api/glimt/settings → {char:'glimt', friends:true, brief:true, readAloud:false, guide:true, notify:true,
//      briefs:{morning:{on:true, at:'06:45'}, day:{on:false, at:'12:00'}, evening:{on:true, at:'18:00'}, night:{on:false, at:'22:30'}},
//      tts:{engine:'openai'|'elevenlabs'|'azure'|'browser', voice:'nora'|'henrik'|'lys', rate:'calm'|'normal'|'fast', lang:'no'|'en'},
//      engines:[{id, name, desc, badge, ready, keySet, tail, admin, link, region?}], chars:[{id, name, family:'ring'|'venn'}],
//      voices:[{id, name, desc}], rates:[{id, name, speed}], host:'glimt'|'natt'|…}
// PUT /api/glimt/settings {…delvis} → samme. 400 {error, errors[]} ved ugyldige verdier. Synkes til alle klienter
//      (realtime «glimt-settings»). /api/brief/settings er alias for {notify, guide, home} (eldre klienter).
//      Prompt 38: + cards:[{id, on, label}] (rekkefølge og av/på i Now Brief, se cards38.js) og auroraNotify:true
//      (push kl. 20 ved Kp ≥ 4 og skydekke < 40 %). PUT {cards:[{id, on}] | ['id', …]} lagrer ny rekkefølge.
// POST /api/tts {text, character?, voice?, rate?, lang?} → audio/mpeg (X-TTS-Engine: openai|elevenlabs|azure|mock,
//      X-TTS-Cache: hit|miss, X-TTS-Voice, X-TTS-Chars). Uten klar motor/nøkkel, motor «browser» eller brukt opp sky-budsjett:
//      503 {error, fallback:'browser'}. Cache 30 dager (motor, stemme, figur, tempo, språk, tekst). Teksten normaliseres for
//      uttale (kl. → klokka, 15:15 → kvart over tre, 8° → 8 grader, tir 21. → tirsdag tjueførste, ordbok). Hvert kall som ikke
//      er cache-treff logges i AI-kontroll (oppgave «tts», /api/ai/usage) med anslått kostnad.
//      Prompt 57 (VOX57): + motor «voxcpm» (VoxCPM2 på Mac mini-en, server/voxcpm57), stemme-id-er vx-…/vxu-…, tts.newsVoice,
//      body purpose:'news'|'glimt', headere X-TTS-AI: 1 og X-TTS-Fallback: voxcpm. Se docs/voxcpm-57.md.
// GET /api/img?u=<url>[&s=<sig>] → bildet (cache 7 dager på disk). Krever innlogging ELLER gyldig signatur s (som briefen
//      lager, så native bildevisning uten token fungerer). Bare http(s), ikke private adresser, bare image/*, maks 5 MB.
import { Hono } from 'hono';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { deflateSync, crc32 } from 'node:zlib';
import { kv, OWNER } from './db.js';
import { config } from './config.js';
import { authOrToken } from './mobile.js';
import { isAdmin } from './auth.js';
import { secret } from './finans/db.js';
import { broadcast } from './realtime.js';
import * as ai from './ai-run.js';
import { cardsOf, cleanCards, saveCards, auroraNotifyOf, setAuroraNotify } from './cards38.js'; // prompt 38: kortene i Now Brief
import { julActive, cleanJul, JUL_DEFAULTS } from './jul40.js'; // prompt 40: julemodus
import { mai17Active, cleanMai17, MAI17_DEFAULTS } from './mai17-41.js'; // prompt 41: 17. mai
import { isVxId57, vxVoiceOf57, classicOf57, vxSpeakFor57, VX_LABEL57 } from './voxcpm57/voices.js'; // prompt 57: VoxCPM2 på Mac mini-en
import { vxReady57, vxConfigured57 } from './voxcpm57/health.js';

const MOCK = () => process.env.MOCK_DATA === '1';

/* ═══════════════════════ Figurer, stemmer, motorer ═══════════════════════ */

export const CHARS = [
  ['glimt', 'Glimt', 'ring'], ['halo', 'Halo', 'ring'], ['boble', 'Boble', 'ring'], ['antenne', 'Antenne', 'ring'], ['bane', 'Bane', 'ring'], ['pastell', 'Pastell', 'ring'],
  ['natt', 'Natt', 'ring'], ['sky', 'Sky', 'venn'], ['drape', 'Dråpe', 'venn'], ['ugle', 'Ugle', 'venn'], ['stjerne', 'Stjerne', 'venn'], ['spire', 'Spire', 'venn'], ['gris', 'Gris', 'venn'],
  ['blekk', 'Blekksprut', 'venn'], // prompt 52: ny figur (seks armer, glad og vennlig)
].map(([id, name, family]) => ({ id, name, family }));
// Prompt 52: farge, navnelapp og hilsen per figur (bare de som har egne; klientene har resten).
export const CHAR_META52 = { blekk: { color: '#f1a3ad', tag: 'BLEKKSPRUT', greeting: 'Hei! Seks armer klare. Nå er jeg din Glimt.' } };
// Prompt 52: standardfigur per bruker satt av admin (kv OWNER glimt_char_defaults52 = {brukerId: figur}). Gjelder til brukeren velger selv.
const CHAR_DEF_KEY52 = 'glimt_char_defaults52';
export const charDefaultOf52 = (u) => { const d = kv.get(OWNER, CHAR_DEF_KEY52, {})?.[u]; return typeof d === 'string' && CHARS.some((c) => c.id === d) ? d : null; };
export function setCharDefault52(u, id) {
  const all = { ...(kv.get(OWNER, CHAR_DEF_KEY52, {}) ?? {}) };
  if (id) all[u] = id; else delete all[u];
  kv.set(OWNER, CHAR_DEF_KEY52, all);
  try { const out = settingsOut(u); broadcast('glimt-settings', out, [u]); broadcast('glimt:settings', out, [u]); } catch { /* sanntid er best effort */ }
}
const CHAR_IDS = new Set(CHARS.map((c) => c.id));
export const charName = (id) => CHARS.find((c) => c.id === id)?.name ?? 'Glimt';

export const VOICES = [
  { id: 'nora', name: 'Nora', desc: 'Rolig og varm', openai: 'sage', eleven: 'XrExE9yKIg1WjnnlVkGX', azure: { no: 'nb-NO-PernilleNeural', en: 'en-GB-SoniaNeural' } },
  { id: 'henrik', name: 'Henrik', desc: 'Lav og trygg', openai: 'ash', eleven: 'pNInz6obpgDQGcFmaJgB', azure: { no: 'nb-NO-FinnNeural', en: 'en-GB-RyanNeural' } },
  { id: 'lys', name: 'Lys', desc: 'Glad og lett', openai: 'coral', eleven: 'EXAVITQu4vr4xnSDxMaL', azure: { no: 'nb-NO-IselinNeural', en: 'en-GB-LibbyNeural' } },
];
export const RATES = [{ id: 'calm', name: 'Rolig', speed: 0.85 }, { id: 'normal', name: 'Normal', speed: 1 }, { id: 'fast', name: 'Rask', speed: 1.15 }];
const SPEED = Object.fromEntries(RATES.map((r) => [r.id, r.speed]));
const TTS_ENGINES = [
  { id: 'openai', name: 'OpenAI · gpt-4o-mini-tts', desc: 'Nesten menneskelig. Følger instruks om tone og følelse.', badge: 'ANBEFALT', secret: 'openaiKey', model: 'gpt-4o-mini-tts', link: 'https://platform.openai.com/api-keys' },
  { id: 'elevenlabs', name: 'ElevenLabs · Multilingual v2', desc: 'Mest naturlig og uttrykksfull. Kan klone en egen stemme.', badge: 'BEST', secret: 'elevenlabsKey', model: 'eleven_multilingual_v2', link: 'https://elevenlabs.io/app/settings/api-keys' },
  { id: 'azure', name: 'Azure · nb-NO Neural (Pernille, Finn, Iselin)', desc: 'Ekte norske stemmer med riktig tonelag.', badge: 'NORSK', secret: 'azureSpeechKey', model: 'azure-neural', link: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices' },
  { id: 'voxcpm', name: VX_LABEL57, desc: 'Lokal på Mac mini-en, gratis. Ferdige norske stemmer, egne fra beskrivelse og klonede stemmer.', badge: 'LOKAL', secret: null, model: 'VoxCPM2', link: null }, // prompt 57
  { id: 'browser', name: 'Nettleserens stemme', desc: 'Robotaktig. Bare for testing uten nøkkel.', badge: '', secret: null, model: null, link: null },
];
const ENGINE_IDS = TTS_ENGINES.map((e) => e.id);
export const TTS_SECRET = { openai: 'openaiKey', elevenlabs: 'elevenlabsKey', azure: 'azureSpeechKey' };

// Personlighet per figur (fasit: CHAR_I / CHAR_EN / CHV i Glimt Brief.dc.html). Ringvariantene snakker som Glimt.
const CHAR_NO = {
  glimt: 'Du er Glimt, en varm, vennlig og litt leken assistent. Snakk naturlig norsk bokmål med Oslo-uttale, rolig tempo, smil i stemmen.',
  natt: 'Du er Glimt om kvelden: lav, rolig og beroligende, nesten hviskende. Norsk bokmål.',
  sky: 'Du er Sky, en lett og fjærlett sky: lys, glad og nysgjerrig stemme, litt raskere. Norsk bokmål.',
  drape: 'Du er Dråpe, en liten regndråpe: søt, sprudlende og litt fnisete. Norsk bokmål.',
  ugle: 'Du er Ugle: klok, dyp, langsom og trygg, som en snill bestefar. Norsk bokmål.',
  gris: 'Du er Gris, en blid sparegris: vennlig, sprettende og litt frekk, nøye med penger. Norsk bokmål.',
  stjerne: 'Du er Stjerne: glad, energisk og feirende, som når noe er ferdig. Norsk bokmål.',
  spire: 'Du er Spire, en liten plante: frisk, blid og rolig. Norsk bokmål.',
  blekk: 'Du er Blekksprut, en blid og nysgjerrig blekksprut med seks armer: varm, leken og litt klønete, ler lett. Norsk bokmål.', // prompt 52
};
const CHAR_EN = {
  glimt: 'You are Glimt, a warm, friendly and slightly playful assistant. Speak natural, relaxed English with a gentle smile in your voice.',
  natt: 'You are Glimt at night: low, calm and soothing, almost whispering.',
  sky: 'You are Sky, a light fluffy cloud: bright, cheerful and curious, a little faster.',
  drape: 'You are Drop, a tiny raindrop: cute, bubbly and giggly.',
  ugle: 'You are Owl: wise, deep, slow and reassuring, like a kind grandfather.',
  gris: 'You are Piggy, a cheerful piggy bank: friendly, bouncy, a little cheeky, careful with money.',
  stjerne: 'You are Star: happy, energetic and celebrating.',
  spire: 'You are Sprout, a little plant: fresh, cheerful and calm.',
  blekk: 'You are Octopus, a cheerful, curious octopus with six arms: warm, playful and a little clumsy, laughs easily.', // prompt 52
};
const voiceChar = (ch) => (CHAR_NO[ch] ? ch : 'glimt'); // halo, boble, antenne, bane, pastell → Glimt
const CHV = { glimt: [1, 1], natt: [0.92, 0.95], sky: [1.12, 1.02], drape: [1.25, 1.06], ugle: [0.8, 0.94], gris: [1.08, 1.04], stjerne: [1.1, 1.05], spire: [1.05, 1], blekk: [1.06, 1.02] }; // prompt 52: blekk
const ELEVEN_ST = { glimt: [0.45, 0.35], natt: [0.7, 0.15], sky: [0.35, 0.55], drape: [0.3, 0.65], ugle: [0.75, 0.2], gris: [0.4, 0.5], stjerne: [0.35, 0.6], spire: [0.5, 0.3], blekk: [0.35, 0.6] };
const AZ_STYLE = { natt: 'whispering', ugle: 'calm', sky: 'cheerful', drape: 'cheerful', gris: 'cheerful', stjerne: 'cheerful', glimt: 'friendly', spire: 'calm', blekk: 'cheerful' };

/* ═══════════════════════ Innstillinger ═══════════════════════ */

const KINDS = ['morning', 'day', 'evening', 'night'];
const DEFAULTS = () => ({ char: 'glimt', friends: true, brief: true, readAloud: false, guide: true, notify: true, briefGlimt: true, // prompt 39: Glimt-figuren i Now Brief av/på
  briefs: { morning: { on: true, at: '06:45' }, day: { on: false, at: '12:00' }, evening: { on: true, at: '18:00' }, night: { on: false, at: '22:30' } },
  tts: { engine: 'openai', voice: 'nora', rate: 'normal', lang: 'no', newsVoice: null }, ...JUL_DEFAULTS, ...MAI17_DEFAULTS });
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Brukerens Glimt-innstillinger (standard + eldre brief_settings + lagret). */
export function glimtSettingsOf(u) {
  const d = DEFAULTS(), old = kv.get(u, 'brief_settings', null) ?? {}, s = kv.get(u, 'glimt35_settings', null) ?? {};
  const out = { ...d, ...(typeof old.notify === 'boolean' ? { notify: old.notify } : {}), ...(typeof old.guide === 'boolean' ? { guide: old.guide } : {}) };
  { const def52 = charDefaultOf52(u); if (def52) out.char = def52; } // prompt 52: admins standardfigur for brukeren (eget valg vinner under)
  for (const k of ['char', 'friends', 'brief', 'readAloud', 'guide', 'notify', 'briefGlimt', 'jul', 'julPhase', 'snow', 'julSound', 'mai17']) if (s[k] !== undefined) out[k] = s[k];
  out.briefs = Object.fromEntries(KINDS.map((k) => [k, { ...d.briefs[k], ...(s.briefs?.[k] ?? {}) }]));
  out.tts = { ...d.tts, ...(s.tts ?? {}) };
  return out;
}
/** Renser en delvis endring. → {patch, errors} */
// Prompt 57: gyldig stemme = nora|henrik|lys eller en VoxCPM-stemme brukeren har (uten bruker: bare formen sjekkes).
const voiceOk57 = (id, u) => VOICES.some((v) => v.id === id) || (isVxId57(id) && (u === undefined || !!vxVoiceOf57(u, id)));
export function cleanGlimtPatch(b, cur, u = undefined) {
  const errors = [], next = JSON.parse(JSON.stringify(cur));
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { next, errors: ['Forventet et objekt'] };
  const known = new Set(['char', 'friends', 'brief', 'readAloud', 'guide', 'notify', 'briefGlimt', 'briefs', 'tts', 'engines', 'chars', 'voices', 'rates', 'host', 'cards', 'auroraNotify', 'jul', 'julPhase', 'snow', 'julSound', 'julActive', 'mai17', 'mai17Active']);
  { const j = cleanJul(b); errors.push(...j.errors); Object.assign(next, j.patch); } // prompt 40
  { const j = cleanMai17(b); errors.push(...j.errors); Object.assign(next, j.patch); } // prompt 41
  if (b.cards !== undefined) { const r = cleanCards(b.cards); errors.push(...r.errors); if (!r.errors.length) next.cards = r.cards; } // prompt 38
  if (b.auroraNotify !== undefined) { if (typeof b.auroraNotify !== 'boolean') errors.push('auroraNotify må være true eller false'); else next.auroraNotify = b.auroraNotify; }
  for (const k of Object.keys(b)) if (!known.has(k)) errors.push(`Ukjent nøkkel ${k}`);
  if (b.char !== undefined) { if (!CHAR_IDS.has(b.char)) errors.push(`Ukjent figur ${b.char}`); else next.char = b.char; }
  for (const k of ['friends', 'brief', 'readAloud', 'guide', 'notify', 'briefGlimt']) if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') errors.push(`${k} må være true eller false`); else next[k] = b[k]; }
  if (b.briefs !== undefined) {
    if (!b.briefs || typeof b.briefs !== 'object') errors.push('briefs må være et objekt');
    else for (const [k, v] of Object.entries(b.briefs)) {
      if (!KINDS.includes(k)) { errors.push(`Ukjent brief ${k} (morning, day, evening, night)`); continue; }
      if (!v || typeof v !== 'object') { errors.push(`briefs.${k} må være {on, at}`); continue; }
      if (v.on !== undefined) { if (typeof v.on !== 'boolean') errors.push(`briefs.${k}.on må være true eller false`); else next.briefs[k].on = v.on; }
      if (v.at !== undefined) { if (!HM.test(String(v.at))) errors.push(`briefs.${k}.at må være HH:MM`); else next.briefs[k].at = v.at; }
    }
  }
  if (b.tts !== undefined) {
    const t = b.tts ?? {};
    if (typeof t !== 'object') errors.push('tts må være et objekt');
    else {
      if (t.engine !== undefined) { if (!ENGINE_IDS.includes(t.engine)) errors.push('tts.engine må være openai, elevenlabs, azure, voxcpm eller browser'); else next.tts.engine = t.engine; }
      if (t.voice !== undefined) { if (!voiceOk57(t.voice, u)) errors.push('tts.voice må være nora, henrik, lys eller en av dine VoxCPM-stemmer'); else next.tts.voice = t.voice; }
      if (t.newsVoice !== undefined) { if (t.newsVoice !== null && !voiceOk57(t.newsVoice, u)) errors.push('tts.newsVoice må være null, nora, henrik, lys eller en av dine VoxCPM-stemmer'); else next.tts.newsVoice = t.newsVoice; } // prompt 57
      if (t.rate !== undefined) { if (!SPEED[t.rate]) errors.push('tts.rate må være calm, normal eller fast'); else next.tts.rate = t.rate; }
      if (t.lang !== undefined) { if (!['no', 'en'].includes(t.lang)) errors.push('tts.lang må være no eller en'); else next.tts.lang = t.lang; }
    }
  }
  return { next, errors };
}
export function saveGlimtSettings(u, next) {
  const { char, friends, brief, readAloud, guide, notify, briefs, tts, briefGlimt, jul, julPhase, snow, julSound, mai17 } = next;
  kv.set(u, 'glimt35_settings', { char, friends, brief, readAloud, guide, notify, briefs, tts, briefGlimt: briefGlimt !== false, jul, julPhase: julPhase ?? null, snow: snow !== false, julSound, mai17: mai17 ?? 'auto' }); // prompt 40: jul* · prompt 41: mai17
  if (Array.isArray(next.cards)) saveCards(u, next.cards); // prompt 38
  if (typeof next.auroraNotify === 'boolean') setAuroraNotify(u, next.auroraNotify);
  // Eldre lesere (brief34, appene før 35) leser brief_settings.
  const old = kv.get(u, 'brief_settings', null) ?? {};
  kv.set(u, 'brief_settings', { ...old, notify, guide });
  try { const out = settingsOut(u); broadcast('glimt-settings', out, [u]); broadcast('glimt:settings', out, [u]); } catch { /* sanntid er best effort */ } // prompt 40: + glimt:settings
}

const osloHour = (t = Date.now()) => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
/** Verten: brukerens figur, men «natt» mellom 21 og 06 når figuren er Glimt. */
export function hostOf(u, t = Date.now(), s = glimtSettingsOf(u)) {
  const h = osloHour(t);
  return s.char === 'glimt' && (h >= 21 || h < 6) ? 'natt' : s.char;
}

const tail = (v) => (v ? String(v).slice(-4) : null);
const azureRegion = () => String(kv.get(OWNER, 'tts35_cfg', {})?.azureRegion ?? process.env.AZURE_SPEECH_REGION ?? '').trim();
export const setAzureRegion = (r) => kv.set(OWNER, 'tts35_cfg', { ...(kv.get(OWNER, 'tts35_cfg', {}) ?? {}), azureRegion: r });
export const getAzureRegion = azureRegion;
const keyOf = (id) => (TTS_SECRET[id] ? secret(TTS_SECRET[id], OWNER) || '' : '');
export const engineReady = (id) => (id === 'browser' ? true : id === 'voxcpm' ? vxReady57() : id === 'azure' ? !!keyOf('azure') && !!azureRegion() : !!keyOf(id)); // prompt 57: voxcpm = Mac-en svarte
export function enginesOut(u) {
  const admin = isAdmin(u);
  return TTS_ENGINES.map((e) => ({ id: e.id, name: e.name, desc: e.desc, badge: e.badge || null, ready: engineReady(e.id), keySet: e.id === 'browser' ? false : e.id === 'voxcpm' ? vxConfigured57() : !!keyOf(e.id),
    tail: e.id === 'browser' || e.id === 'voxcpm' ? null : tail(keyOf(e.id)), admin, link: e.link, ...(e.id === 'azure' ? { region: azureRegion() || null } : {}) }));
}
export function settingsOut(u) {
  const s = glimtSettingsOf(u);
  return { ...s, julActive: julActive(s), mai17Active: mai17Active(s, Date.now(), u), cards: cardsOf(u), auroraNotify: auroraNotifyOf(u), engines: enginesOut(u), chars: CHARS, voices: VOICES.map(({ id, name, desc }) => ({ id, name, desc })), rates: RATES, host: hostOf(u) };
}

export const settingsApi = new Hono();
settingsApi.use('*', authOrToken);
settingsApi.get('/', (c) => c.json(settingsOut(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
settingsApi.put('/', async (c) => {
  const u = c.get('user');
  const b = await c.req.json().catch(() => null);
  const { next, errors } = cleanGlimtPatch(b, glimtSettingsOf(u), u);
  if (errors.length) return c.json({ error: errors[0], errors }, 400);
  saveGlimtSettings(u, next);
  return c.json(settingsOut(u));
});

/* ═══════════════════════ Uttale ═══════════════════════ */

const H_NO = ['tolv', 'ett', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti', 'elleve'];
const H_EN = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
/** 15:15 → «kvart over tre», 15:30 → «halv fire», 15:20 → «ti på halv fire», 15:00 → «tre». Andre minutter: «15 17». */
export function clockNo(h, m) {
  const a = H_NO[h % 12], b = H_NO[(h + 1) % 12];
  const W = { 0: a, 5: `fem over ${a}`, 10: `ti over ${a}`, 15: `kvart over ${a}`, 20: `ti på halv ${b}`, 25: `fem på halv ${b}`, 30: `halv ${b}`, 35: `fem over halv ${b}`, 40: `ti over halv ${b}`, 45: `kvart på ${b}`, 50: `ti på ${b}`, 55: `fem på ${b}` };
  return W[m] ?? `${h} ${String(m).padStart(2, '0')}`;
}
export function clockEn(h, m) {
  const a = H_EN[h % 12], b = H_EN[(h + 1) % 12];
  const W = { 0: `${a} o'clock`, 5: `five past ${a}`, 10: `ten past ${a}`, 15: `quarter past ${a}`, 20: `twenty past ${a}`, 25: `twenty-five past ${a}`, 30: `half past ${a}`, 35: `twenty-five to ${b}`, 40: `twenty to ${b}`, 45: `quarter to ${b}`, 50: `ten to ${b}`, 55: `five to ${b}` };
  return W[m] ?? `${h % 12 || 12} ${String(m).padStart(2, '0')}`;
}
const ORD = ['', 'første', 'andre', 'tredje', 'fjerde', 'femte', 'sjette', 'sjuende', 'åttende', 'niende', 'tiende', 'ellevte', 'tolvte', 'trettende', 'fjortende', 'femtende', 'sekstende', 'syttende', 'attende', 'nittende', 'tjuende',
  'tjueførste', 'tjueandre', 'tjuetredje', 'tjuefjerde', 'tjuefemte', 'tjuesjette', 'tjuesjuende', 'tjueåttende', 'tjueniende', 'trettiende', 'trettiførste'];
const MON = { jan: 'januar', feb: 'februar', mar: 'mars', apr: 'april', mai: 'mai', jun: 'juni', jul: 'juli', aug: 'august', sep: 'september', okt: 'oktober', nov: 'november', des: 'desember' };
const WDS = { man: 'mandag', tir: 'tirsdag', ons: 'onsdag', tor: 'torsdag', fre: 'fredag', lør: 'lørdag', søn: 'søndag' };
// Uttaleordbok for egennavn og forkortelser (kan utvides med env TTS_LEXICON='{"Ord":"uttale"}').
export const LEXICON = { IN2010: 'I N tjue ti', IN1000: 'I N tusen', Grünerløkka: 'Grynerløkka', NRK: 'N R K', VG: 'V G', E24: 'E tjuefire', 'TV 2': 'TV to', HBO: 'H B O', 'f.eks.': 'for eksempel', 'ca.': 'cirka', 'osv.': 'og så videre', 'bl.a.': 'blant annet' };
const lexicon = () => { try { return { ...LEXICON, ...(process.env.TTS_LEXICON ? JSON.parse(process.env.TTS_LEXICON) : {}) }; } catch { return LEXICON; } };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Gjør teksten klar for opplesning. */
export function normalizeSpeech(text, lang = 'no') {
  let t = String(text ?? '').replace(/\*\*|__|`/g, '').replace(/[«»“”"]/g, '').replace(/\s+/g, ' ').trim();
  for (const [k, v] of Object.entries(lexicon())) t = t.replace(new RegExp(`(^|[^\\p{L}\\d])${esc(k)}(?![\\p{L}\\d])`, 'gu'), `$1${v}`);
  if (lang === 'en') {
    t = t.replace(/\b(?:kl\.?|klokka|at)\s*(\d{1,2})[:.](\d{2})\b/gi, (m, h, mi) => `at ${clockEn(+h, +mi)}`).replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mi) => clockEn(+h, +mi));
    t = t.replace(/(-?\d+(?:[.,]\d+)?)\s*°C?/g, (m, n) => `${n.replace(/^-/, 'minus ')} degrees`).replace(/(\d)\s*kr\/mnd/g, '$1 kroner a month').replace(/(\d)\s*kr\b/g, '$1 kroner')
      .replace(/(\d)\s*%/g, '$1 percent').replace(/(\d)\s*m\/s/g, '$1 metres per second').replace(/(\d)\s*–\s*(\d)/g, '$1 to $2');
    return t;
  }
  t = t.replace(/\b(?:kl\.?|klokka)\s*(\d{1,2})[:.](\d{2})\b/gi, (m, h, mi) => (+h < 24 && +mi < 60 ? `klokka ${clockNo(+h, +mi)}` : m));
  t = t.replace(/\b(?:kl\.?|klokka)\s*(\d{1,2})\b(?![:.]\d)/gi, (m, h) => (+h < 24 ? `klokka ${H_NO[+h % 12]}` : m));
  t = t.replace(/\bkl\.\s?/gi, 'klokka ');
  t = t.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (m, h, mi) => clockNo(+h, +mi));
  // «tir 21.» → «tirsdag tjueførste», «21. okt» → «tjueførste oktober», «1. nov» → «første november»
  t = t.replace(/\b(man|tir|ons|tor|fre|lør|søn)\.?\s+(\d{1,2})\.(?!\d)/gi, (m, w, d) => (+d >= 1 && +d <= 31 ? `${WDS[w.toLowerCase()]} ${ORD[+d]}` : m));
  t = t.replace(/\b(\d{1,2})\.\s*(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-zæøå]*\.?/gi, (m, d, mo) => (+d >= 1 && +d <= 31 ? `${ORD[+d]} ${MON[mo.toLowerCase()]}` : m));
  t = t.replace(/(-?\d+(?:[.,]\d+)?)\s*°C?/g, (m, n) => `${n.replace(/^-/, 'minus ')} grader`);
  t = t.replace(/(\d)\s*kr\/mnd\.?/g, '$1 kroner i måneden').replace(/(\d)\s*kr\b\.?/g, '$1 kroner').replace(/(\d)\s*%/g, '$1 prosent').replace(/(\d)\s*m\/s\b/g, '$1 meter per sekund')
    .replace(/(\d)\s*mm\b/g, '$1 millimeter').replace(/(\d)\s*–\s*(\d)/g, '$1 til $2').replace(/\s*·\s*/g, ', ');
  return t.replace(/\s+/g, ' ').trim();
}

/* ═══════════════════════ Tekst til tale ═══════════════════════ */

let F = (u, i) => fetch(u, i), injected = false;
/** Bare for tester: injiser fetch mot leverandørene (null = standard). */
export const _setTtsFetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); injected = !!fn; };
const CACHE_DIR = () => join(config.dataDir, 'tts-cache');
const CACHE_MS = 30 * 86400_000;
const MAX_CHARS = 1500;
// Anslått pris i USD per tegn: OpenAI gpt-4o-mini-tts ≈ 0,015 $/min (~900 tegn/min), ElevenLabs ≈ 0,18 $/1000 tegn, Azure Neural 16 $/1M tegn.
const USD_PER_CHAR = { openai: 0.015 / 900, elevenlabs: 0.18 / 1000, azure: 16 / 1e6 };

export class TtsUnavailable extends Error { constructor(msg, status = 503) { super(msg); this.status = status; } }

// Ett MPEG-1 Layer III-rammehode (128 kbit/s, 44,1 kHz) med stille innhold – brukes i MOCK_DATA=1 i stedet for leverandørene.
export const SILENT_MP3 = (() => { const f = Buffer.alloc(417); f.set([0xff, 0xfb, 0x90, 0x64]); return Buffer.concat(Array.from({ length: 8 }, () => f)); })();

function pruneCache() {
  try { for (const f of readdirSync(CACHE_DIR())) { const p = join(CACHE_DIR(), f); if (Date.now() - statSync(p).mtimeMs > CACHE_MS) unlinkSync(p); } } catch { /* ingen cache ennå */ }
}
if (process.env.NODE_ENV !== 'test') { setTimeout(pruneCache, 30_000).unref?.(); setInterval(pruneCache, 86400_000).unref?.(); }

function ssml(text, voiceName, lang, ch, speed) {
  const cv = CHV[ch] ?? [1, 1];
  const pitch = Math.round((cv[0] - 1) * 100), rate = Math.round((speed * cv[1] - 1) * 100);
  const x = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const loc = lang === 'en' ? 'en-GB' : 'nb-NO';
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${loc}"><voice name="${voiceName}"><mstts:express-as style="${AZ_STYLE[ch] ?? 'friendly'}"><prosody pitch="${pitch >= 0 ? '+' : ''}${pitch}%" rate="${rate >= 0 ? '+' : ''}${rate}%">${x}</prosody></mstts:express-as></voice></speak>`;
}

async function callEngine(engine, { text, voice, ch, speed, lang }) {
  const key = keyOf(engine);
  if (MOCK() && !injected) return SILENT_MP3;
  let r;
  try {
    if (engine === 'openai') {
      r = await F('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: voice.openai, input: text, instructions: (lang === 'en' ? CHAR_EN : CHAR_NO)[ch], response_format: 'mp3', speed }), signal: AbortSignal.timeout(30_000) });
    } else if (engine === 'elevenlabs') {
      const st = ELEVEN_ST[ch] ?? ELEVEN_ST.glimt;
      r = await F(`https://api.elevenlabs.io/v1/text-to-speech/${voice.eleven}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', language_code: lang === 'en' ? 'en' : 'no', voice_settings: { stability: st[0], similarity_boost: 0.8, style: st[1], use_speaker_boost: true, speed: Math.min(1.2, Math.max(0.7, speed)) } }), signal: AbortSignal.timeout(30_000) });
    } else {
      r = await F(`https://${azureRegion()}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'homelab-os' },
        body: ssml(text, voice.azure[lang === 'en' ? 'en' : 'no'], lang, ch, speed), signal: AbortSignal.timeout(30_000) });
    }
  } catch (e) { throw new TtsUnavailable(`${engine === 'openai' ? 'OpenAI' : engine === 'elevenlabs' ? 'ElevenLabs' : 'Azure'} kan ikke nås (${e.cause?.code ?? e.name})`, 502); }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    let msg = body.slice(0, 160); try { const j = JSON.parse(body); msg = j.error?.message ?? j.detail?.message ?? j.detail ?? j.message ?? msg; } catch { /* tekst */ }
    throw new TtsUnavailable(`${engine === 'openai' ? 'OpenAI' : engine === 'elevenlabs' ? 'ElevenLabs' : 'Azure'} svarte ${r.status}${msg ? `: ${String(msg).slice(0, 160)}` : ''}`, r.status === 401 || r.status === 403 ? 503 : 502);
  }
  return Buffer.from(await r.arrayBuffer());
}

/** Velger motor: brukerens valg hvis klar, ellers første klare sky-motor. «browser» eller ingen klar → TtsUnavailable. */
export function pickEngine(want) {
  if (want === 'browser') throw new TtsUnavailable('Nettleserstemmen er valgt. Opplesningen skjer i nettleseren.');
  if (want && want !== 'voxcpm' && engineReady(want)) return want; // prompt 57: voxcpm håndteres i speak()
  const any = ['openai', 'elevenlabs', 'azure'].find(engineReady);
  if (!any) throw new TtsUnavailable('Ingen stemmemotor er satt opp. En administrator kan legge inn en nøkkel for OpenAI, ElevenLabs eller Azure under AI → API og nøkler.');
  return any;
}

/** Prompt 57: VoxCPM-stemmen for forespørselen, eller null (sky-motorene). vx-id vinner alltid; motor «voxcpm» + nora|henrik|lys → vx-<samme>. */
function vxWanted57(engine, voiceId) {
  if (isVxId57(voiceId)) return voiceId;
  if (engine === 'voxcpm') return VOICES.some((v) => v.id === voiceId) ? `vx-${voiceId}` : 'vx-nora';
  return null;
}
async function vxTry57(user, vxId, say, L, R) {
  const r = await vxSpeakFor57(user, { voiceId: vxId, text: say, lang: L, speed: SPEED[R] });
  return { ...r, engine: 'voxcpm', fallback: null };
}

/** → {audio:Buffer, engine, cache:'hit'|'miss', voice, chars, text, contentType?, fallback?} */
export async function speak(user, { text, character, voice, rate, lang, purpose } = {}) {
  const s = glimtSettingsOf(user);
  const raw = String(text ?? '').trim();
  if (!raw) throw new TtsUnavailable('Skriv en tekst', 400);
  if (raw.length > MAX_CHARS) throw new TtsUnavailable(`Teksten er for lang (maks ${MAX_CHARS} tegn)`, 400);
  const L = lang === 'en' || lang === 'no' ? lang : s.tts.lang;
  const wantId = voice ?? (purpose === 'news' ? (s.tts.newsVoice ?? s.tts.voice) : s.tts.voice); // prompt 57: egen stemme for nyhetsleseren
  const R = SPEED[rate] ? rate : s.tts.rate;
  const ch = voiceChar(CHAR_IDS.has(character) ? character : hostOf(user, Date.now(), s));
  const say = normalizeSpeech(raw, L);
  // Prompt 57: VoxCPM på Mac mini-en først når en VoxCPM-stemme er valgt; svarer den ikke → brukerens sky-motor → første klare → nettleseren.
  const vxId = vxWanted57(s.tts.engine, wantId);
  let fallback = null;
  if (vxId) {
    if (vxReady57()) {
      try { return await vxTry57(user, vxId, say, L, R); } catch (e) { if (e?.status === 400) throw new TtsUnavailable(e.message, 400); }
    }
    fallback = 'voxcpm';
  }
  const V = VOICES.find((v) => v.id === (vxId ? classicOf57(vxId) : wantId)) ?? VOICES[0];
  let engine;
  try { engine = pickEngine(vxId && s.tts.engine === 'voxcpm' ? null : s.tts.engine); }
  catch (e) {
    // Ingen sky-motor: VoxCPM som siste reserve (ikke når nettleserstemmen er valgt med vilje).
    if (!vxId && s.tts.engine !== 'browser' && vxReady57()) { try { return await vxTry57(user, `vx-${V.id}`, say, L, R); } catch { /* nettleseren */ } }
    throw e;
  }
  const model = TTS_ENGINES.find((e) => e.id === engine).model;
  const h = createHash('sha256').update(JSON.stringify([engine, model, V.id, ch, R, L, say])).digest('hex');
  const file = join(CACHE_DIR(), `${h}.mp3`);
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < CACHE_MS) return { audio: readFileSync(file), engine: MOCK() && !injected ? 'mock' : engine, cache: 'hit', voice: V.id, chars: say.length, text: say, fallback };
  const b = ai.budgetState();
  if (b.blocked) throw new TtsUnavailable(`Sky-budsjettet er brukt opp (${b.monthCostKr} av ${b.monthlyKr} kr denne måneden)`);
  const t0 = Date.now();
  const job = ai.jobStart({ user, task: 'tts', kind: 'tts', title: `Glimt · stemme (${charName(ch)})`, model, provider: engine });
  let audio;
  try { audio = await callEngine(engine, { text: say, voice: V, ch, speed: SPEED[R], lang: L }); }
  catch (e) { ai.jobUpdate(job, { status: 'fail', error: e.message, ms: Date.now() - t0 }); throw e; }
  const costKr = MOCK() && !injected ? 0 : Math.round(say.length * (USD_PER_CHAR[engine] ?? 0) * ai.USD_NOK * 10000) / 10000;
  ai.jobEnd(job, { ms: Date.now() - t0, tokIn: say.length, tokOut: 0, costKr });
  try { mkdirSync(CACHE_DIR(), { recursive: true }); writeFileSync(file, audio); } catch (e) { console.warn('[tts] cache:', e.message); }
  return { audio, engine: MOCK() && !injected ? 'mock' : engine, cache: 'miss', voice: V.id, chars: say.length, text: say, fallback };
}

/** Test av en bestemt motor (AI → API og nøkler → Test): uten cache. → {model, bytes} */
export async function speakWith(user, engine, text) {
  if (!engineReady(engine)) throw new TtsUnavailable(engine === 'azure' && keyOf('azure') ? 'Azure mangler region' : 'Nøkkelen mangler');
  const t0 = Date.now(), model = TTS_ENGINES.find((e) => e.id === engine).model;
  const job = ai.jobStart({ user, task: 'tts', kind: 'tts', title: 'Glimt · stemme (test)', model, provider: engine });
  try {
    const audio = await callEngine(engine, { text: normalizeSpeech(text), voice: VOICES[0], ch: 'glimt', speed: 1, lang: 'no' });
    ai.jobEnd(job, { ms: Date.now() - t0, tokIn: text.length, tokOut: 0, costKr: MOCK() && !injected ? 0 : Math.round(text.length * (USD_PER_CHAR[engine] ?? 0) * ai.USD_NOK * 10000) / 10000 });
    return { model, bytes: audio.length };
  } catch (e) { ai.jobUpdate(job, { status: 'fail', error: e.message, ms: Date.now() - t0 }); throw e; }
}

export const ttsApi = new Hono();
ttsApi.use('*', authOrToken);
ttsApi.post('/', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b.text !== 'string') return c.json({ error: 'Forventet {text, character?, voice?, rate?, lang?, purpose?}' }, 400);
  try {
    const r = await speak(c.get('user'), b);
    return new Response(r.audio, { status: 200, headers: { 'Content-Type': r.contentType || 'audio/mpeg', 'Content-Length': String(r.audio.length), 'Cache-Control': 'private, max-age=2592000',
      'X-TTS-Engine': r.engine, 'X-TTS-Cache': r.cache, 'X-TTS-Voice': r.voice, 'X-TTS-Chars': String(r.chars), 'X-TTS-AI': '1', ...(r.fallback ? { 'X-TTS-Fallback': r.fallback } : {}) } }); // prompt 57: + X-TTS-AI, X-TTS-Fallback
  } catch (e) {
    if (e instanceof TtsUnavailable && e.status === 400) return c.json({ error: e.message }, 400);
    return c.json({ error: e.message, fallback: 'browser' }, 503);
  }
});

/* ═══════════════════════ Bildeproxy for nyhetsbilder ═══════════════════════ */

const IMG_DIR = () => join(config.dataDir, 'img-cache');
const IMG_MS = 7 * 86400_000;
const IMG_MAX = 5 * 1024 * 1024;
const sigKey = () => `img35:${process.env.SECRET_KEY || config.sessionSecret || 'dev'}`;
export const imgSig = (u) => createHmac('sha256', sigKey()).update(String(u)).digest('hex').slice(0, 20);
/** Proxy-adressen for et bilde (relativ, signert), eller null. */
export const proxied = (u) => (/^https?:\/\//i.test(String(u ?? '')) ? `/api/img?u=${encodeURIComponent(u)}&s=${imgSig(u)}` : null);
const sigOk = (u, s) => { try { const a = Buffer.from(imgSig(u)), b = Buffer.from(String(s ?? '')); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; } };

function privateIp(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:') && privateIp(x.slice(7));
}
/** http(s)-adresse som ikke peker til private nett (DNS sjekkes). → URL eller null */
export async function safeUrl(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return null;
  try { const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }); if (!addrs.length || addrs.some((a) => privateIp(a.address))) return null; } catch { return null; }
  return url;
}
/** Plassholder (PNG 160×90) i en farge fra adressen – MOCK_DATA=1 og når bildet ikke kan hentes i mock. */
export function placeholderPng(seed = '', w = 160, h = 90) {
  const hs = createHash('sha1').update(String(seed)).digest();
  const c1 = [hs[0], hs[1], hs[2]].map((v) => 60 + (v % 150)), c2 = [hs[3], hs[4], hs[5]].map((v) => 40 + (v % 120));
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const f = (x / w + y / h) / 2, o = y * (w * 3 + 1) + 1 + x * 3; for (let k = 0; k < 3; k++) raw[o + k] = Math.round(c1[k] * (1 - f) + c2[k] * f); }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let imgFetch = (u, i) => fetch(u, i), imgInjected = false;
/** Bare for tester. */
export const _setImgFetch = (fn) => { imgFetch = fn ?? ((u, i) => fetch(u, i)); imgInjected = !!fn; };
async function fetchImage(u) {
  let cur = u;
  for (let hop = 0; hop < 4; hop++) {
    const url = imgInjected ? new URL(cur) : await safeUrl(cur);
    if (!url) throw Object.assign(new Error('Ugyldig eller privat adresse'), { status: 400 });
    const r = await imgFetch(url.href, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (homelab-os bildeproxy)', Accept: 'image/*' }, signal: AbortSignal.timeout(8000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { cur = new URL(r.headers.get('location'), url).href; continue; }
    if (!r.ok) throw Object.assign(new Error(`Bildet svarte ${r.status}`), { status: 502 });
    const type = String(r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|gif|webp|avif|svg\+xml)$/.test(type)) throw Object.assign(new Error('Ikke et bilde'), { status: 415 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > IMG_MAX) throw Object.assign(new Error('Bildet er for stort'), { status: 413 });
    return { buf, type };
  }
  throw Object.assign(new Error('For mange omdirigeringer'), { status: 502 });
}

export const imgApi = new Hono();
imgApi.get('/', async (c) => {
  const u = String(c.req.query('u') ?? '');
  if (!u || u.length > 2000 || !/^https?:\/\//i.test(u)) return c.json({ error: 'Forventet ?u=https://…' }, 400);
  if (!sigOk(u, c.req.query('s'))) {
    let authed = false;
    const res = await authOrToken(c, async () => { authed = true; });
    if (!authed) return res ?? c.json({ error: 'Ikke innlogget' }, 401);
  }
  const h = createHash('sha256').update(u).digest('hex'), file = join(IMG_DIR(), h);
  const headers = (type, n) => ({ 'Content-Type': type, 'Content-Length': String(n), 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', ...(type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}) });
  try {
    if (existsSync(file) && Date.now() - statSync(file).mtimeMs < IMG_MS) {
      const meta = JSON.parse(readFileSync(`${file}.json`, 'utf8'));
      const buf = readFileSync(file);
      return new Response(buf, { headers: { ...headers(meta.type, buf.length), 'X-Img-Cache': 'hit' } });
    }
  } catch { /* hent på nytt */ }
  if (MOCK() && !imgInjected) { const png = placeholderPng(u); return new Response(png, { headers: { ...headers('image/png', png.length), 'X-Img-Cache': 'mock' } }); }
  try {
    const { buf, type } = await fetchImage(u);
    try { mkdirSync(IMG_DIR(), { recursive: true }); writeFileSync(file, buf); writeFileSync(`${file}.json`, JSON.stringify({ type, u, at: Date.now() })); } catch { /* cache er valgfritt */ }
    return new Response(buf, { headers: { ...headers(type, buf.length), 'X-Img-Cache': 'miss' } });
  } catch (e) { return c.json({ error: e.message }, e.status ?? 502); }
});
