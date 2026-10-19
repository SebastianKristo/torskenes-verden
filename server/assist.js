// Prompt 31 (SERVER31): Glimt – AI-agenten i Nordlys OS. Montert under /api/assist. Sesjon eller app-token (authOrToken), alt per bruker.
//
// POST /api/assist {q, source:'search'|'chat', chatId?}
//   Kjøres som serverjobb (tabell assist_jobs) så den fullføres selv om klienten forsvinner.
//   Ferdig innen 1,2 s → 200 med svaret direkte (+ jobId). Ellers → 202 {jobId}; hent med GET /api/assist/:id eller vent på
//   realtime «assist» over /api/ws. Er jobben ferdig etter 202, sendes svaret også med notifyUser (kategori 'ai', tittel
//   «Glimt»): kø for appene (GET /api/notify/pending) og Web Push når ingen klient er synlig – hvis «AI-svar i bakgrunnen» er på.
//
// Svaret (200-kroppen, og answer i GET /:id og i realtime når state='done'):
//   { text      'Det er **8° og lettskyet** i Oslo nå, vind 3 m/s. I dag 5–9°.'  (én–to setninger, det viktigste i **…**)
//     bold      ['8° og lettskyet']                        (utdrag av **…**)
//     source    'Open-Meteo · MET Norway' | 'Kalender' | 'Entur' | 'Sporing' | 'Finans' | 'Huskeliste' |
//               'Abonnementer · varsel planlagt' | 'Abonnementer' | 'Kalender · rask time' | 'Glimt' | 'Glimt · Gemini'
//     intent    'weather' | 'calendar.day' | 'calendar.next' | 'departures' | 'packages' | 'finance.spent' | 'tasks' |
//               'trial.create' | 'appointment.create' | 'memory.add' | 'llm'
//     tool?     'Vær' | 'Kalender' | 'Avganger' | 'Pakker' | 'Finans' | 'Huskeliste' | 'Abonnementer'
//     card?     {k:'weather', city, t, ic, icon, d, hi, lo, night, kind, precipProb, wind, day:'today'|'tomorrow', umbrella, h:[{l, t, ic, icon}]}
//               {k:'calendar', date, wd:'MAN', n:19, t:'I dag', sub:'19. oktober · 2 hendelser', items:[{id, time:'16:30'|'Hele', title, color, place}]}
//               {k:'departures', stop, stopId, items:[{line, dest, minutes, clock, color, textColor, realtime}]}
//               {k:'packages', items:[{id, title, statusText, status, step, steps, carrierName, eta, logo}], count}
//               {k:'finance', total, currency:'NOK', category, period:{from, to, label}, count, items:[{name, amount, date}]}
//               {k:'tasks', items:[{id, title, due, done, overdue}], count}
//     ms        tid brukt (ms)
//     model     'Glimt · verktøy' | 'Glimt · lokal' | 'Glimt · Gemini (sky)'
//     engine    'tool' | 'ollama' | 'gemini' | 'mock' | 'none'
//     chatContext {q, intent, messages:[{role:'user', content:q}, {role:'assistant', content:text, card?, tool?}]}  («Fortsett i Chat»)
//     chatId?   når source='chat': samtalen svaret ble lagret i (ny samtale hvis chatId mangler/ikke finnes)
//     followUp? 'chat' når den lokale modellen ikke svarte i tide
//     trial?    prøven som ble lagret (trial.create), missing?: ['service'|'endsAt'] når noe mangler (da lagres ingenting)
//     quickJobId? jobben i /api/kalender/quick (appointment.create) – AI-boblen følger «calendar-quick»-hendelsene
//     memory?   (memory.add, prompt 33) aliaset som ble lagret {id, kind, match, type, title}
//     apply?    {memoryId, count, title, url} – «Endre tittel på N avtaler?» → POST url
//   }
// Prompt 32 (SERVER32):
//   intent 'nav' (side-snarvei, før alle verktøy): «vis meg / åpne / gå til / ta meg til / hvor finner jeg / finn …» eller 1–2 ord →
//     {intent:'nav', target:'nordlys'|'kalender'|'vaer'|'innstillinger'|'sporing'|'budsjett'|'kvitteringer'|'finans'|'abonnement'|
//      'domener'|'familie'|'mat'|'huskeliste'|'bursdager'|'rom'|'chat', text:'Åpner **Kalender**.', source:'Snarvei',
//      nav:{target, label, web:'/#/kalender', deepLink:'finanshub://kalender', delayMs:450}, …}
//   POST /api/assist/:id/handoff {chatId?} → {chatId, jobId, state}: søkefeltet ga opp etter layout.hs_timeout_s (5/8/15/30, standard 8)
//     → jobben fortsetter og svaret lagres i Chat-tråden (spørsmålet legges inn med en gang). Lokal modell har nå 60 s.
// Prompt 33: POST /api/assist tar også context:{eventId} (hendelsen brukeren ser på) for «det var frisør».
// GET  /api/assist/:id → {jobId, state:'queued'|'running'|'done'|'failed'|'cancelled', q, source, chatId, title, model, input,
//                         steps:[{key, label, state}], fields:[{k, v}], progress, created, updated, answer?, error?}
// POST /api/assist/:id/cancel → {ok, state}
// GET/PUT /api/assist/settings {ai_bg_notify (på), cloud (av)}
// Realtime «assist»: {jobId, state, steps[], fields[], progress, title, model, input, source, answer?, error?} (samme struktur
// som «calendar-quick»).
//
// Prompt 33 (SERVER33): POST /api/assist {q, source:'calendar', context?:{eventId}} → Glimt i Kalender-appen (server/kalender33.js,
//   calendarAnswer): {text, bold, steps:[etiketter], events[], slots[], created?, summary?, weather?, intent, tools[], source:'Kalender', …}.
//   Jobbens steps[] bruker etikettene ({key:'s1', label, state}). Fikk klienten 202, sendes realtime «assist»
//   {jobId, state:'running', partial, done:false} med teksten ord for ord før svaret. Varsel: deepLink 'kalender://liste'.
//
// Personvern: verktøyene leser bare brukerens egne data på serveren. Fritekst går til lokal Ollama (12 s). Gemini brukes bare
// når brukeren har slått på sky (cloud) OG spørsmålet ikke ser ut til å inneholde brukerdata; da sendes bare spørsmålet,
// og kallet logges i ai_audit.
import { Hono } from 'hono';
import { randomBytes, randomUUID } from 'node:crypto';
import { db, kv } from './db.js';
import { authOrToken, homeDeparturesOf } from './mobile.js';
import { runAsUser } from './settings.js';
import { broadcast } from './realtime.js';
import { notifyOf, notifyUser } from './notify.js';
import { eventsFor, normText, findEvent } from './calendar.js';
import { weatherFull, wmoText, iconOf, PLACES } from './weather-full.js';
import { packagesFor } from './tracking.js';
import { nextTasks } from './tasks.js';
import { settings as fhSettings, ensureLedger } from './finans/db.js';
import { createTrial, trialOut } from './finans/trials.js';
import { startQuickJob } from './calendar-quick.js';
import { parseQuick, osloTodayISO, quickLabel, senderOf } from '../public/js/quick-time.js';
import { aliasesOf, aliasPrompt, parseMemoryIntent, learnFromAssist, typeOfWord, eventHitsAlias, getContext, setContext } from './glimt-memory.js'; // prompt 33
import { parseTrial, serviceOf, trialSentence, MONTHS, WEEKDAYS, addDaysISO, daysBetween } from '../public/js/trial-parse.js';
import * as integrations from './integrations.js';
import { calendarAnswer } from './kalender33.js'; // prompt 33: source:'calendar'
import { parseDay } from './parse-day35.js'; // prompt 35: felles dag-tolkning
import { extractPlace, placeWeather, PlaceNotFound } from './weather35.js'; // prompt 35: været for et sted
import { run as aiRun, routing as aiRouting, AiRunError, isCloud, providerOf, providerLabel } from './ai-run.js';
import { isSunQuestion, daylight } from './sun36.js'; // prompt 36: dagslys lokalt
import { whereIntent, whereAnswer } from './where37.js'; // prompt 37: «hvor er Ingrid?»
import { parseIntent37, schoolTestAnswer } from './kal37.js'; // prompt 37: skoleprøve ≠ prøveperiode
import { bareDay37 } from './kalender33.js'; // prompt 37: «i morgen?»

const MOCK = process.env.MOCK_DATA === '1';
const ext = MOCK ? await import('./mock.js') : integrations;
const MAX_Q = 500;
const DIRECT_MS = 1200;
const LLM_MS = 12_000;
// Prompt 32: den lokale modellen får lengre tid. Søkefeltet flytter jobben til Chat etter hs_timeout_s (POST /:id/handoff), jobben avbrytes ikke.
const LOCAL_LLM_MS = 60_000;
const SYSTEM = 'Svar på norsk i maks to korte setninger. Marker det viktigste med **…**';
const ID = /^a[0-9a-f]{12}$/;

db.exec(`CREATE TABLE IF NOT EXISTS assist_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','done','failed','cancelled')),
  q TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'search',
  chat_id TEXT,
  intent TEXT,
  title TEXT,
  model TEXT,
  steps TEXT,
  fields TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  error TEXT,
  direct INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assist_jobs_user ON assist_jobs(user_id, created);`);
try { db.exec('ALTER TABLE assist_jobs ADD COLUMN handoff INTEGER NOT NULL DEFAULT 0'); } catch { /* finnes */ } // prompt 32
const q = (sql) => db.prepare(sql);

/* ---------------- Tekst ---------------- */

const pad = (n) => String(n).padStart(2, '0');
const r0 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
const kr = (v) => `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} kr`;
export const boldOf = (t) => [...String(t).matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
export const plainText = (t) => String(t ?? '').replace(/\*\*/g, '').trim();
const wdName = (d) => WEEKDAYS[new Date(d + 'T00:00:00Z').getUTCDay()];
const longDate = (d) => { const x = new Date(d + 'T00:00:00Z'); return `${x.getUTCDate()}. ${MONTHS[x.getUTCMonth()]}`; };
const osloNow = (t = Date.now()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, h: Number(p.hour) };
};
const hmOf = (iso) => osloNow(Date.parse(iso)).hm;
const relDays = (n) => (n === 0 ? 'i dag' : n === 1 ? 'i morgen' : `om ${n} dager`);
const dayWord = (date, today) => (date === today ? 'I dag' : date === addDaysISO(today, 1) ? 'I morgen' : `${wdName(date).replace(/^./, (c) => c.toUpperCase())} ${longDate(date)}`);

/* ---------------- Intensjon (før LLM) ---------------- */

const RE = {
  trial: /pr(ø|o)ve|gratis|avslutt|si opp|oppsig|trial/,
  next: /neste|når (er|skal|har)|når.*time/,
  nextWhat: /time|avtale|frisør|lege|tannlege|møte|trening|prøve|eksamen|hos\b/,
  weather: /v(æ|ae)r(et|meldingen)?\b|regn|paraply|grader|temperatur|snø|vind|sol(a|en)?\b|kaldt|varmt|jakke|ute i dag|i morgen.*(ute|tur)|\bweather\b|\bforecast\b/,
  calDay: /hva (skjer|har jeg|står på)|kalender(en)?|planer|program(met)?\b|avtaler|opptatt|ledig|what'?s on/,
  departures: /når går|avgang(er|en)?|neste (buss|trikk|bane|t-bane|tog)|\bbuss(en)?\b|\btrikk(en)?\b|t-?bane(n)?\b|\btog(et)?\b/,
  packages: /pakke(n|r|ne)?\b|sending(en|er)?\b|sporing|levert|hentes/,
  finance: /(hva|hvor mye).*(brukt|bruke|bruker|brukte|kostet|handlet)|forbruk|utgifter/,
  tasks: /huskeliste(n)?|gjøremål|oppgave(r|ne)?\b|å gjøre|to-?do/,
};

// Prompt 32: side-snarveier (samme liste som hsAsk() i designet). target = sidenøkkelen i appene, web = rute på web.
export const NAV = [
  [/oppdater|nordlys|ny versjon|versjon/, 'nordlys', 'Nordlys OS · oppdatering', '/#/innstillinger/system'],
  [/kalender|timeplan/, 'kalender', 'Kalender', '/#/kalender'],
  [/v(æ|ae)ret? (side|app)|værside|vaerside|åpne vær/, 'vaer', 'Vær', '/#/vaer'],
  [/innstilling/, 'innstillinger', 'Innstillinger', '/#/innstillinger'],
  [/pakke|sporing|sending/, 'sporing', 'Sporing', '/#/sporing'],
  [/budsjett/, 'budsjett', 'Budsjett', '/finans/#/budsjett'],
  [/kvittering/, 'kvitteringer', 'Kvitteringer', '/finans/#/kv'],
  [/finans|økonomi|saldo|konto/, 'finans', 'Finans', '/finans/'],
  [/abonnement|prøveperiode/, 'abonnement', 'Abonnement', '/finans/#/abonnement'],
  [/domene/, 'domener', 'Domener', '/#/domener'],
  [/familie|posisjon|hvor er/, 'familie', 'Familie', '/#/familie'],
  [/middag|matplan|oppskrift|\bmat\b/, 'mat', 'Mat', '/#/matplan'],
  [/huskeliste|handleliste|todo|to-do|gjøremål/, 'huskeliste', 'Gjøremål', '/#/huskeliste'], // prompt 37: «Gjøremål» (intern nøkkel huske)
  [/bursdag/, 'bursdager', 'Bursdager', '/#/bursdager'],
  [/\brom\b|satellitt|rombilde|mars-?rover/, 'rom', 'Rom', '/#/rom'],
  [/\bchat\b/, 'chat', 'Chat', '/#/chat'],
];
const NAV_PREFIX = /^(vis( meg)?|åpne|gå til|ta meg til|hvor finner jeg|finn)\b/;
/** Snarvei til en side, eller null. → {target, label, web} */
export function navTarget(text) {
  const n = String(text ?? '').toLowerCase().replace(/[?!.]+$/, '').trim();
  if (!n || !(NAV_PREFIX.test(n) || n.split(/\s+/).length <= 2)) return null;
  const hit = NAV.find(([re]) => re.test(n));
  return hit ? { target: hit[1], label: hit[2], web: hit[3] } : null;
}

/* ---------------- Prompt 36: spørsmål eller handling ---------------- */
// Spørsmål → svaret vises i kortet under søkefeltet (ingen pille). Handling/beskjed → bare Glimt-pillen (live activity).
const Q_PREFIX = /^(?:spørsmål\s*[:,.-]?\s*)?(?:hei\s*,?\s*|glimt\s*,?\s*)?/i;
const Q_START = /^(spørsmål|hva|hvor|hvem|hvilken|hvilket|hvilke|hvordan|hvorfor|når|kan du|vet du|fortell|what|when|where|how|who|why|which|is|are|do|does|can)\b/i;
const Q_PHRASE = /\b(hvor (mange|mye|lenge|langt)|hva (er|blir|skjer|har)|når (går|er|kommer|blir|skal)|hvordan (blir|er))\b/i;
const ACT_VERB = /^(?:spørsmål\s*[:,]?\s*)?(legg (til|inn)|book|booke|bestill|påminn|minn meg|husk|lagre|last opp|avbestill|sett opp|lag (en )?(avtale|påminnelse))\b/i;
/** Lokale regler. → {kind:'question'|'action', sure, reason} */
export function questionGuard(text) {
  const t = String(text ?? '').trim(), n = t.toLowerCase();
  if (ACT_VERB.test(n)) return { kind: 'action', sure: true, reason: 'handlingsverb' };
  if (/\?/.test(n)) return { kind: 'question', sure: true, reason: 'spørsmålstegn' };
  const body = n.replace(Q_PREFIX, '');
  if (/^spørsmål\b/.test(n) || Q_START.test(body)) return { kind: 'question', sure: true, reason: 'spørreord' };
  if (Q_PHRASE.test(n)) return { kind: 'question', sure: true, reason: 'spørrefrase' };
  return { kind: null, sure: false, reason: null };
}
export const isQuestion = (text) => questionGuard(text).kind === 'question';
const ACTION_INTENTS = new Set(['appointment.create', 'trial.create', 'memory.add']);
/** kind for et svar/intent: lokale regler først, så intensjonen. sure:false betyr at en kort LLM-klassifisering kan avgjøre. */
export function classifyLocal(text, intent = detectIntent(text)) {
  const g = questionGuard(text);
  if (g.kind) return { kind: g.kind, sure: true, reason: g.reason, intent };
  if (ACTION_INTENTS.has(intent)) return { kind: 'action', sure: true, reason: 'avtale/påminnelse', intent };
  if (intent !== 'llm') return { kind: 'question', sure: true, reason: 'verktøy', intent };
  return { kind: 'question', sure: false, reason: 'uklart', intent };
}
let classifyImpl = null;
/** Bare for tester: (text) → 'question'|'action'. */
export const _setClassifyLlm = (fn) => { classifyImpl = fn; };
/** Lokale regler, og ved tvil et kort klassifiseringskall (maks 300 ms, lokal modell). → {kind, sure, reason, intent, via} */
export async function classify(user, text, { today = osloTodayISO(), maxMs = 300 } = {}) {
  const c = classifyLocal(text, detectIntent(text, today));
  if (c.sure) return { ...c, via: 'regler' };
  try {
    const call = classifyImpl ? Promise.resolve(classifyImpl(text))
      : (MOCK && !process.env.OLLAMA_URL) ? Promise.resolve(null)
        : aiRun('sok', { user, prompt: `Er dette et spørsmål som skal besvares, eller en beskjed/handling som skal utføres (legge i kalender, lagre, påminne)? Svar KUN med JSON {"type":"question"|"action"}.\nTekst: ${String(text).slice(0, 300)}`, json: true, numPredict: 12, temperature: 0, localOnly: true, background: true, title: 'Glimt · klassifisering' }).then((o) => o.text);
    const out = await Promise.race([call, new Promise((r) => setTimeout(() => r(null), maxMs))]);
    const v = typeof out === 'string' ? (out.match(/"type"\s*:\s*"(question|action)"/)?.[1] ?? (/^(question|action)$/.test(out.trim()) ? out.trim() : null)) : null;
    if (v) return { ...c, kind: v, sure: true, reason: 'llm', via: 'llm' };
  } catch { /* modellen nede: bruk reglene */ }
  return { ...c, via: 'regler' };
}

/** Hvilket verktøy spørsmålet går til (uten å hente data). → intent */
export function detectIntent(text, today = osloTodayISO()) {
  const n = String(text ?? '').toLowerCase();
  if (whereIntent(text)) return 'family.where'; // prompt 37: før snarveien «hvor er → Familie»
  if (navTarget(text)) return 'nav';
  // Prompt 36: dagslys/soloppgang/solnedgang besvares lokalt (før avtaletolkning).
  if (isSunQuestion(text)) return 'sun.daylight';
  const asked = isQuestion(text);
  // Prøveperiode: «gratis», «trial», «prøveperiode», eller «prøve/avslutt/si opp» sammen med en tjeneste («Storytel prøve til 25.11»).
  // Prompt 37: «Neste prøve på skolen» er en skoleprøve (Studie), ikke en prøveperiode.
  const pi = parseIntent37(text);
  if (pi.schoolTest && pi.schoolContext) return 'calendar.school';
  if (RE.trial.test(n) && (/gratis|trial|prøveperiode|prøvetid/.test(n) || serviceOf(text))) return 'trial.create';
  if (bareDay37(text, today)) return 'calendar.day'; // «i morgen?»
  if (parseMemoryIntent(text)) return 'memory.add';
  if (RE.next.test(n) && RE.nextWhat.test(n)) return 'calendar.next';
  const pq = parseQuick(text, today);
  // Prompt 36: spørsmålsvakt – et spørsmål med dato er aldri en avtale («hvor mange timer med dagslys er det den 29.06.2027»).
  if (pq.isAppointment && pq.ok && pq.date && !asked) return 'appointment.create';
  if (RE.weather.test(n)) return 'weather';
  if (RE.finance.test(n)) return 'finance.spent';
  if (RE.tasks.test(n)) return 'tasks';
  if (RE.packages.test(n)) return 'packages';
  if (RE.calDay.test(n)) return 'calendar.day';
  if (RE.departures.test(n)) return 'departures';
  return 'llm';
}

// Ord som peker på egne data (og mønstre som e-post, telefon, personnummer, kontonummer): da sendes ingenting til sky.
const USER_DATA = /@\S+\.\w|\b\d{8}\b|\b\d{11}\b|\b\d{4}[ .]\d{2}[ .]\d{5}\b|(^|[^a-zæøå])(min|mitt|mine|mi|meg|jeg|vår|vårt|våre|oss)(?![a-zæøå])|lønn|konto|passord|kalender|kvittering|adresse|kona|mannen|sønn|datter|helse|diagnose|personnummer/i;
export const hasUserData = (text) => USER_DATA.test(String(text ?? ''));

/* ---------------- Testkroker ---------------- */

let llmImpl = null, weatherImpl = null, placeImpl = null, directMs = DIRECT_MS;
/** Bare for tester: ({q, user, engine:'ollama'|'gemini'}) → tekst, eller kast. null = standard. */
export const _setAssistLlm = (fn) => { llmImpl = fn; };
/** Bare for tester: (place) → svaret fra weatherFull. */
export const _setAssistWeather = (fn) => { weatherImpl = fn; };
/** Bare for tester (prompt 35): (navn, {offset}) → placeWeather-svaret. */
export const _setAssistPlace = (fn) => { placeImpl = fn; };
export const _setDirectMs = (ms) => { directMs = ms ?? DIRECT_MS; };

/* ---------------- Verktøy ---------------- */

const WX_EMOJI = { clear: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', sleet: '🌨️', snow: '❄️', thunder: '⛈️' };
const icOf = (code, isDay = true) => { const k = iconOf(code); return { icon: k, ic: !isDay && (k === 'clear' || k === 'partly') ? '🌙' : WX_EMOJI[k] ?? '☁️' }; };

async function toolWeather(user, text) {
  const n = text.toLowerCase();
  // Prompt 35: «været i New York» → stedet i teksten (Open-Meteo/Nominatim + timezone=auto), ellers brukerens sted (Oslo).
  const pd = parseDay(text, osloNow().date);
  const offset = pd && pd.offset >= 0 && pd.offset <= 6 ? pd.offset : 0;
  const named = extractPlace(text);
  if (named && !(weatherImpl && !placeImpl)) {
    let r;
    try { r = await (placeImpl ? placeImpl(named, { offset }) : placeWeather(named, { offset })); }
    catch (e) {
      if (e instanceof PlaceNotFound || e?.status === 404) return { text: `${e.message}${e.suggest ? ` Mente du **${e.suggest}**?` : ''}`, source: 'Open-Meteo · stedssøk', tool: 'Vær', ...(e.suggest ? { suggest: e.suggest } : {}), notFound: true };
      throw e;
    }
    const d = r.days[offset] ?? r.today ?? {};
    const umbrellaQ = /paraply|regn/.test(n);
    const rain = (d.precipProb ?? 0) >= 50;
    const day = offset === 0 ? 'I dag' : offset === 1 ? 'I morgen' : r.text.split(' ')[0];
    const t2 = umbrellaQ ? `${day} er det ${d.precipProb ?? 0} % sjanse for nedbør i ${r.place.label}. **${rain ? 'Ta med paraply.' : 'Du klarer deg uten paraply.'}** ${d.lo}–${d.hi}°.` : r.text;
    const card = { k: 'weather', city: r.place.label, t: offset ? d.hi : r.now.temp, icon: offset ? d.icon : r.now.icon, ic: offset ? d.ic : r.now.ic, d: offset ? d.cond : r.now.cond, hi: d.hi, lo: d.lo,
      night: !offset && r.now.isDay === false, kind: null, precipProb: d.precipProb ?? 0, wind: r.now.wind, day: offset === 1 ? 'tomorrow' : offset ? d.date : 'today', umbrella: rain, h: [],
      place: r.place, open: r.open };
    return { text: t2, source: r.source === 'met' ? 'MET Norway' : 'Open-Meteo', tool: 'Vær', card, place: r.place, open: r.open };
  }
  const list = kv.get(user, 'wx_places', null);
  const own = Array.isArray(list) && list[0]?.lat != null ? list[0] : null;
  const place = own ? { lat: own.lat, lon: own.lon, name: own.name } : { place: 'oslo' };
  const w = await (weatherImpl ? weatherImpl(place) : weatherFull(place));
  const city = own?.name ?? w.place?.name ?? PLACES.oslo.name;
  const tomorrow = offset === 1 || /i morgen/.test(n);
  const d = (tomorrow ? w.days?.[1] : w.days?.[0]) ?? {};
  const cur = w.current ?? {};
  const p = r0(d.precipProb ?? w.today?.precipProb ?? 0) ?? 0;
  const hi = r0(d.hi ?? w.today?.hi), lo = r0(d.lo ?? w.today?.lo);
  const rain = p >= 50;
  const desc = wmoText(tomorrow ? d.code : cur.code).toLowerCase();
  const umbrellaQ = /paraply|regn/.test(n);
  const day = tomorrow ? 'I morgen' : 'I dag';
  let text2;
  if (umbrellaQ) text2 = `${day} er det ${p} % sjanse for nedbør i ${city}. **${rain ? 'Ta med paraply.' : 'Du klarer deg uten paraply.'}** ${lo}–${hi}°.`;
  else if (tomorrow) text2 = `I morgen blir det **${lo}–${hi}° og ${desc}** i ${city}, ${p} % sjanse for nedbør.${rain ? ' **Ta med paraply.**' : ''}`;
  else text2 = `Det er **${r0(cur.temp)}° og ${desc}** i ${city} nå, vind ${r0(cur.wind) ?? 0} m/s. I dag ${lo}–${hi}°.${rain ? ' **Ta med paraply.**' : ''}`;
  // Timerad: 6 timer fra nå, «I morgen» hver 3. time fra kl. 06.
  const now = osloNow();
  const hours = Array.isArray(w.hours) ? w.hours : [];
  const tDate = addDaysISO(now.date, 1);
  const hs = tomorrow
    ? hours.filter((h) => String(h.t).startsWith(tDate) && Number(String(h.t).slice(11, 13)) >= 6 && Number(String(h.t).slice(11, 13)) % 3 === 0).slice(0, 6)
    : hours.filter((h) => String(h.t) >= `${now.date}T${pad(now.h)}`).slice(0, 6);
  const h = hs.map((x, i) => ({ l: !tomorrow && i === 0 ? 'Nå' : String(x.t).slice(11, 13), t: r0(x.temp), ...icOf(x.code, x.isDay !== false) }));
  const night = !tomorrow && cur.isDay === false;
  const card = { k: 'weather', city, t: tomorrow ? hi : r0(cur.temp), ...icOf(tomorrow ? d.code : cur.code, tomorrow ? true : cur.isDay !== false), d: wmoText(tomorrow ? d.code : cur.code), hi, lo,
    night, kind: w.kind ?? null, precipProb: p, wind: r0(cur.wind), day: tomorrow ? 'tomorrow' : 'today', umbrella: rain, h };
  const lat = own?.lat ?? w.place?.lat ?? PLACES.oslo.lat, lon = own?.lon ?? w.place?.lon ?? PLACES.oslo.lon;
  const open = { route: 'vaer', name: city, lat, lon };
  return { text: text2, source: 'Open-Meteo · MET Norway', tool: 'Vær', card: { ...card, open }, place: { name: city, country: 'Norge', label: city, lat, lon, tz: 'Europe/Oslo', norway: true }, open };
}

const calItem = (e) => ({ id: e.id, time: e.allDay ? 'Hele' : hmOf(e.start), title: e.title, color: e.color, place: e.room || null });
async function toolCalendarDay(user, text, today) {
  const pq = parseQuick(text, today);
  const date = parseDay(text, today)?.date ?? (pq.date && pq.date >= today ? pq.date : today); // prompt 35: felles parseDay()
  const { events } = await runAsUser(user, () => eventsFor(user, date, date));
  const list = events.filter((e) => (e.allDay ? e.date <= date && e.end > date : e.date === date));
  const label = dayWord(date, today);
  const n = list.length;
  const first = list.find((e) => !e.allDay) ?? list[0];
  const t = !n ? `${label} er kalenderen **tom**.`
    : `${label} har du ${n} ${n === 1 ? 'ting' : 'ting'} i kalenderen. Første er **${first.title}${first.allDay ? '' : ` kl. ${hmOf(first.start)}`}**.`;
  const x = new Date(date + 'T00:00:00Z');
  const card = { k: 'calendar', date, wd: WEEKDAYS[x.getUTCDay()].slice(0, 3).toUpperCase(), n: x.getUTCDate(), t: label, sub: `${longDate(date)} · ${n} ${n === 1 ? 'hendelse' : 'hendelser'}`, items: list.slice(0, 8).map(calItem) };
  return { text: t, source: 'Kalender', tool: 'Kalender', card };
}

const NEXT_STOP = new Set(['når', 'er', 'neste', 'min', 'mitt', 'mi', 'mine', 'time', 'timen', 'timer', 'avtale', 'avtalen', 'til', 'jeg', 'har', 'hva', 'skal', 'hos', 'den', 'det', 'en', 'et', 'på', 'i', 'meg', 'sin', 'sitt', 'kommer', 'blir', 'vi', 'du', 'hvilken', 'dag', 'da']);
async function toolCalendarNext(user, text, today) {
  const kw = text.toLowerCase().replace(/[?.!,«»"]/g, ' ').split(/\s+/).filter((w) => w && !NEXT_STOP.has(w)).map((w) => w.replace(/time(n|r)?$/, '')).filter((w) => w.length > 1);
  const { events } = await runAsUser(user, () => eventsFor(user, today, addDaysISO(today, 365)));
  const now = Date.now();
  // Prompt 33: «neste frisørtime» finner også avtaler hos et alias med typen frisør («Påhåret»), i tittel eller notat.
  const types = new Set(kw.map(typeOfWord).filter(Boolean));
  let aliases = [];
  try { aliases = types.size ? aliasesOf(user).filter((m) => types.has(m.type)) : []; } catch { /* */ }
  const schoolQ = parseIntent37(text).schoolTest; // prompt 37: «neste prøve» er aldri en prøveperiode
  const hits = events.filter((e) => (e.allDay ? e.date >= today : Date.parse(e.start) >= now - 5 * 60_000)).filter((e) => !(schoolQ && (e.source === 'trials' || e.kind === 'trial')))
    .filter((e) => !kw.length || kw.some((w) => normText(`${e.title} ${e.room ?? ''}`).includes(normText(w))) || aliases.some((m) => eventHitsAlias(e, m)));
  const what = kw.length ? kw.join(' ') : '';
  if (!hits.length) return { text: `Fant ingen kommende ${what ? what + 'time' : 'time'} i kalenderen.`, source: 'Kalender', tool: 'Kalender', card: { k: 'calendar', date: today, wd: '', n: null, t: 'Neste', sub: 'Ingen treff', items: [] } };
  const e = hits[0];
  const when = `${wdName(e.date)} ${longDate(e.date)}${e.allDay ? '' : ` kl. ${hmOf(e.start).replace(':', '.')}`}`;
  const x = new Date(e.date + 'T00:00:00Z');
  return { text: `${e.title} er **${when}** (${relDays(daysBetween(today, e.date))}).`, source: 'Kalender', tool: 'Kalender',
    card: { k: 'calendar', date: e.date, wd: WEEKDAYS[x.getUTCDay()].slice(0, 3).toUpperCase(), n: x.getUTCDate(), t: dayWord(e.date, today), sub: `${longDate(e.date)} · neste treff`, items: [calItem(e)] } };
}

async function toolDepartures(user, text) {
  const n = text.toLowerCase();
  const m = n.match(/\b(?:linje\s*|buss\s*|trikk\s*|t-?bane\s*)?([lrf]?\d{1,3}[a-z]?)\b/i);
  const line = m ? m[1].toUpperCase() : null;
  const h = await homeDeparturesOf(user);
  const stops = (h.mine?.length ? h.mine : []).slice(0, 3);
  if (!stops.length) return { text: 'Du har ingen stopp ennå. **Legg til et stopp** under Avganger.', source: 'Entur', tool: 'Avganger' };
  const res = await Promise.all(stops.map(async (s) => { try { return { s, d: await ext.getStopDepartures(s.id, 30) }; } catch { return { s, d: null }; } }));
  const now = Date.now();
  const all = res.flatMap(({ s, d }) => (d?.departures ?? []).filter((x) => !x.cancelled && Date.parse(x.time) > now - 60_000).map((x) => ({ ...x, stop: d.stop?.name ?? s.name, stopId: s.id })))
    .filter((x) => !line || String(x.line).toUpperCase() === line || String(x.line).toUpperCase() === line.replace(/^T/, ''))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (!all.length) return { text: `Fant ingen avganger${line ? ` for **${line}**` : ''} fra ${stops.map((s) => s.name).join(', ')}.`, source: 'Entur', tool: 'Avganger', card: { k: 'departures', stop: stops[0].name, stopId: stops[0].id, items: [] } };
  const f = all[0];
  const mins = Math.max(0, Math.round((Date.parse(f.time) - now) / 60_000));
  const sameStop = all.filter((x) => x.stopId === f.stopId).slice(0, 4);
  return { text: `**${f.line}** mot ${f.to} går ${mins === 0 ? '**nå**' : `om **${mins} min**`} fra ${f.stop}.`, source: 'Entur', tool: 'Avganger',
    card: { k: 'departures', stop: f.stop, stopId: f.stopId, items: sameStop.map((x) => ({ line: x.line, dest: x.to, minutes: Math.max(0, Math.round((Date.parse(x.time) - now) / 60_000)), clock: hmOf(x.time), color: x.color ?? null, textColor: x.textColor ?? '#FFFFFF', realtime: !!x.realtime })) } };
}

function toolPackages(user) {
  const list = packagesFor(3, user);
  const n = list[0]?.activeCount ?? list.length;
  if (!list.length) return { text: 'Du har **ingen pakker** på vei.', source: 'Sporing', tool: 'Pakker', card: { k: 'packages', items: [], count: 0 } };
  const f = list[0];
  return { text: `Du har **${n} ${n === 1 ? 'pakke' : 'pakker'}** på vei. ${f.title || f.name || 'Første'}: ${String(f.statusText ?? '').toLowerCase() || 'ukjent status'}.`, source: 'Sporing', tool: 'Pakker',
    card: { k: 'packages', count: n, items: list.map((p) => ({ id: p.id, title: p.title || p.name, statusText: p.statusText, status: p.status, step: p.step, carrierName: p.carrierName, eta: p.eta ?? null, logo: p.logo ?? null })) } };
}

const FIN_CATS = [[/mat\b|matvarer|dagligvare|matbutikk|handlet mat/, 'Mat og dagligvarer'], [/restaurant|kafé|kafe|take ?away|fast ?food|ute ?spising/, 'Restaurant og kafé'],
  [/transport|lading|bensin|drivstoff|ruter|taxi|\btog\b|\bbuss/, 'Transport og lading'], [/bolig|husleie|strøm/, 'Bolig'], [/\bhjem(met)?\b|interiør/, 'Hjem'],
  [/fritid|hobby|trening/, 'Fritid og hobby'], [/abonnement/, 'Abonnementer'], [/skole|bøker/, 'Skole']];
function toolFinance(user, text, today) {
  const n = text.toLowerCase();
  const [y, m, d] = today.split('-').map(Number);
  let from = `${y}-${pad(m)}-01`, to = today, label = `i ${MONTHS[m - 1]}`;
  if (/forrige måned/.test(n)) { const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y; from = `${py}-${pad(pm)}-01`; to = new Date(Date.UTC(py, pm, 0)).toISOString().slice(0, 10); label = `i ${MONTHS[pm - 1]}`; }
  else if (/\bi år\b|hittil i år/.test(n)) { from = `${y}-01-01`; label = 'i år'; }
  else if (/denne uk(a|en)|\bi uk(a|en)\b/.test(n)) { const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; from = addDaysISO(today, -wd); label = 'denne uka'; }
  else if (/\bi dag\b/.test(n)) { from = today; label = 'i dag'; }
  const cat = FIN_CATS.find(([re]) => re.test(n))?.[1] ?? null;
  ensureLedger(user);
  const rows = q(`SELECT t.amount, t.date, coalesce(t.merchant, t.description) AS name, c.name AS cat FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id
    WHERE t.user_id=? AND t.date BETWEEN ? AND ? AND t.amount < 0 AND coalesce(c.kind, 'expense') = 'expense' ${cat ? 'AND c.name=?' : ''}`).all(user, from, to, ...(cat ? [cat] : []));
  const total = rows.reduce((a, r) => a - r.amount, 0) / 100;
  const top = [...rows].sort((a, b) => a.amount - b.amount).slice(0, 3).map((r) => ({ name: r.name || 'Ukjent', amount: Math.round(-r.amount) / 100, date: r.date }));
  const what = cat ? cat.toLowerCase() : 'alt';
  const t = rows.length ? `Du har brukt **${kr(total)}** på ${what} ${label}.${top[0] ? ` Mest hos ${top[0].name} (${kr(top[0].amount)}).` : ''}` : `Du har **ikke brukt noe** på ${what} ${label}.`;
  return { text: t, source: 'Finans', tool: 'Finans', card: { k: 'finance', total: Math.round(total * 100) / 100, currency: 'NOK', category: cat, period: { from, to, label }, count: rows.length, items: top } };
}

/** Prompt 37: neste skoleprøve/eksamen i Studie (aldri prøveperioder). */
async function toolSchoolTest(user, today) {
  const { events } = await runAsUser(user, () => eventsFor(user, today, addDaysISO(today, 180)));
  const a = schoolTestAnswer(events, today);
  const e = a.events[0];
  const x = e ? new Date(e.date + 'T00:00:00Z') : null;
  return { text: a.text, source: 'Kalender · Studie', tool: 'Kalender', events: a.events,
    card: { k: 'calendar', date: e?.date ?? today, wd: x ? WEEKDAYS[x.getUTCDay()].slice(0, 3).toUpperCase() : '', n: x ? x.getUTCDate() : null, t: e ? dayWord(e.date, today) : 'Prøver', sub: e ? `${longDate(e.date)} · neste prøve` : 'Ingen prøver', items: a.events.map(calItem) } };
}

function toolTasks(user) {
  const list = nextTasks(user, 5);
  if (!list.length) return { text: 'Huskelisten er **tom**.', source: 'Huskeliste', tool: 'Huskeliste', card: { k: 'tasks', items: [], count: 0 } };
  const f = list[0];
  return { text: `Du har **${list.length} ${list.length === 1 ? 'ting' : 'ting'}** på huskelisten. Først: ${f.title}${f.due ? ` (frist ${longDate(f.due)})` : ''}.`, source: 'Huskeliste', tool: 'Huskeliste',
    card: { k: 'tasks', count: list.length, items: list.map((x) => ({ id: x.id, title: x.title, due: x.due ?? null, done: !!x.done, overdue: !!x.overdue })) } };
}

function toolTrial(user, text, today) {
  const p = parseTrial(text, today);
  if (!p.ok) return { text: p.question, source: 'Abonnementer', tool: 'Abonnementer', missing: p.missing, parsed: p };
  const r = createTrial(user, { service: p.service, endsAt: p.endsAt, priceAfter: p.priceAfter, remindOffsetsDays: p.remindOffsetsDays }, { source: 'glimt', today });
  if (r.error) return { text: r.error, source: 'Abonnementer', tool: 'Abonnementer' };
  const t = trialOut(r.row, today);
  return { text: trialSentence({ ...p }), source: 'Abonnementer · varsel planlagt', tool: 'Abonnementer', trial: t };
}

function toolAppointment(user, text, today) {
  const r = startQuickJob(user, text);
  if (r.error) return { text: r.error, source: 'Kalender · rask time', tool: 'Kalender' };
  let aliases = [];
  try { aliases = aliasesOf(user); } catch { /* */ }
  const pq = parseQuick(text, today, aliases);
  return { text: `Legger til **${pq.title || 'avtalen'} · ${quickLabel(pq)}** i kalenderen.`, source: 'Kalender · rask time', tool: 'Kalender', quickJobId: r.jobId };
}

/** Prompt 36: dagslys, soloppgang og solnedgang for dato og sted, regnet lokalt. Kortet har «Åpne Vær ›». */
async function toolSun(user, text, today) {
  const date = parseDay(text, today)?.date ?? (parseQuick(text, today).date || today);
  const n = String(text).toLowerCase();
  const list = kv.get(user, 'wx_places', null);
  const own = Array.isArray(list) ? list : [];
  let p = own.find((x) => x?.name && new RegExp(`(^|[^a-zæøå])${String(x.name).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zæøå]|$)`).test(n))
    ?? Object.values(PLACES).find((x) => new RegExp(`(^|[^a-zæøå])${x.name.toLowerCase()}([^a-zæøå]|$)`).test(n));
  let tz = 'Europe/Oslo', note = '';
  const named = !p ? extractPlace(text) : null;
  if (!p && named) {
    try { const r = await (placeImpl ? placeImpl(named, { offset: 0 }) : placeWeather(named, { offset: 0 })); p = { name: r.place.label ?? r.place.name, lat: r.place.lat, lon: r.place.lon }; tz = r.place.tz || tz; }
    catch { note = ` (fant ikke ${named}, viser Oslo)`; }
  }
  p ??= own[0]?.lat != null ? own[0] : PLACES.oslo;
  const d = daylight(date, { name: p.name, lat: p.lat, lon: p.lon, tz });
  const open = { route: 'vaer', name: p.name, lat: p.lat, lon: p.lon, date };
  return { text: d.text + note, source: 'Glimt · sol (lokal beregning)', tool: 'Vær', open, place: { name: p.name, label: p.name, lat: p.lat, lon: p.lon, tz },
    card: { k: 'sun', date, place: p.name, sunrise: d.sunrise, sunset: d.sunset, daylightMin: d.daylightMin, daylight: { h: Math.floor(d.daylightMin / 60), m: d.daylightMin % 60 }, polar: d.polar, open, action: { label: 'Åpne Vær', open } } };
}

async function toolMemory(user, text, ctx) {
  const intent = parseMemoryIntent(text);
  return learnFromAssist(user, text, intent, ctx ?? getContext(user));
}

/* ---------------- LLM ---------------- */

/** Prompt 33: systemprompten til LOKAL Ollama får brukerens egne alias (aldri Gemini/sky). */
export function localSystem(user) {
  let a = '';
  try { a = aliasPrompt(aliasesOf(user)); } catch { /* */ }
  return a ? `${SYSTEM}\n${a}` : SYSTEM;
}
const short = (t) => { const s = String(t).replace(/\s+/g, ' ').trim(); const parts = s.match(/[^.!?]+[.!?]+/g); return (parts && parts.length > 2 ? parts.slice(0, 2).join('') : s).slice(0, 600).trim(); };
const withTimeout = (p, ms = LLM_MS) => Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(Object.assign(new Error('Svarte ikke i tide'), { timeout: true })), ms); t.unref?.(); })]);

async function toolLlm(user, text) {
  if (llmImpl) return toolLlmTest(user, text);
  if (MOCK && !process.env.OLLAMA_URL) return { text: `Dette er et eksempelsvar fra **Glimt** på «${text.slice(0, 80)}». Med Ollama svarer den lokale modellen her.`, source: 'Glimt', engine: 'mock', model: 'Glimt · lokal' };
  // Prompt 34: alt går gjennom ai.run('sok') – ruting, validering mot /api/tags, 20 s → reserve, jobblogg. Feil vises i svaret.
  const route = aiRouting(user).tasks.sok;
  const explicitCloud = isCloud(providerOf(route.model).provider) || isCloud(providerOf(route.fallback).provider);
  const localOnly = hasUserData(text) || (!assistSettings(user).cloud && !explicitCloud);
  try {
    const out = await aiRun('sok', { user, prompt: text, system: (p) => (p === 'ollama' ? localSystem(user) : SYSTEM), numPredict: 160, temperature: 0.3, localOnly, title: `AI-søk · «${text.slice(0, 60)}»` });
    const t = short(out.text);
    if (out.provider !== 'ollama') { try { const { audit } = await import('./finans/ai-audit.js'); audit(out.provider, 'assist', { spørsmål: text }, user); } catch { /* logg er best effort */ } }
    const cloud = out.provider !== 'ollama';
    return { text: t, source: cloud ? `Glimt · ${providerLabel(out.provider)}` : 'Glimt', engine: out.provider, model: cloud ? `Glimt · ${providerLabel(out.provider)} (sky)` : 'Glimt · lokal', modelId: out.model,
      ...(out.warnings.length ? { warning: out.warnings.join(' · ') } : {}), ...(out.notice ? { notice: out.notice } : {}), aiJobId: out.jobId };
  } catch (e) {
    const msg = e instanceof AiRunError ? e.message : `Glimt fikk ikke svar: ${String(e?.message ?? e).slice(0, 200)}`;
    console.warn('[glimt] llm', msg);
    return { text: msg, source: 'Glimt', engine: 'none', model: 'Glimt · lokal', followUp: 'chat', error: msg, fix: e.fix ?? null, aiJobId: e.jobId ?? null,
      actions: [{ k: 'retry', label: 'Prøv igjen' }, { k: 'ai', label: 'Åpne AI-kontroll', route: 'innstillinger/ai', tab: e.fix === 'api' ? 'api' : e.fix === 'model' || e.fix === 'valg' ? 'rt' : 'ov' }] };
  }
}
// Testkroken (_setAssistLlm): samme oppførsel som før prompt 34 (lokal først, Gemini når «cloud» er på og spørsmålet ikke har egne data).
async function toolLlmTest(user, text) {
  const run = (engine) => llmImpl({ q: text, user, engine, system: engine === 'gemini' ? SYSTEM : localSystem(user) });
  let lastErr = null;
  try {
    const t = short(await withTimeout(run('ollama'), LOCAL_LLM_MS));
    if (t) return { text: t, source: 'Glimt', engine: 'ollama', model: 'Glimt · lokal' };
  } catch (e) { lastErr = e; }
  const cloud = assistSettings(user).cloud;
  if (cloud && !hasUserData(text)) {
    try {
      const t = short(await withTimeout(run('gemini')));
      try { const { audit } = await import('./finans/ai-audit.js'); audit('gemini', 'assist', { spørsmål: text }, user); } catch { /* logg er best effort */ }
      if (t) return { text: t, source: 'Glimt · Gemini', engine: 'gemini', model: 'Glimt · Gemini (sky)' };
    } catch { /* sky nede */ }
  }
  const why = lastErr ? `: ${String(lastErr.message ?? lastErr).slice(0, 160)}` : '';
  return { text: `Glimt fikk ikke svar fra den lokale modellen${why}. **Fortsett i Chat** for et lengre svar.`, source: 'Glimt', engine: 'none', model: 'Glimt · lokal', followUp: 'chat', ...(lastErr ? { error: String(lastErr.message ?? lastErr).slice(0, 200) } : {}) };
}

/* ---------------- Svar ---------------- */

// Prompt 36: spørsmål med dato til modellen får datoen med som kontekst (ingen avtale).
function withDateContext(text, today) {
  const d = isQuestion(text) ? parseDay(text, today) : null;
  return d?.date ? `${text}\n(Dato i spørsmålet: ${d.date}, ${d.label}. I dag er ${today}.)` : text;
}

const TITLES = { 'sun.daylight': 'Regner på sola', 'calendar.free_slots': 'Finner ledig tid', 'calendar.search': 'Leter i kalenderen', 'calendar.summary': 'Oppsummerer', 'calendar.create': 'Legger til i kalenderen', 'weather.daily': 'Sjekker været', 'calendar.ask': 'Glimt tenker', weather: 'Sjekker været', 'calendar.day': 'Ser i kalenderen', 'calendar.next': 'Leter i kalenderen', departures: 'Henter avganger', packages: 'Ser på pakkene',
  'finance.spent': 'Regner på forbruket', tasks: 'Leser huskelisten', 'trial.create': 'Lager påminnelse', 'family.where': 'Ser i Familie', 'calendar.school': 'Ser i Studie', 'appointment.create': 'Legger til i kalenderen', 'memory.add': 'Glimt husker', nav: 'Åpner siden', llm: 'Glimt tenker' };
const TOOL_OF = { 'sun.daylight': 'Vær', 'calendar.free_slots': 'Kalender', 'calendar.search': 'Kalender', 'calendar.summary': 'Kalender', 'calendar.create': 'Kalender', 'weather.daily': 'Vær', 'calendar.ask': 'Kalender', weather: 'Vær', 'calendar.day': 'Kalender', 'calendar.next': 'Kalender', departures: 'Avganger', packages: 'Pakker', 'finance.spent': 'Finans', tasks: 'Huskeliste', 'trial.create': 'Abonnementer', 'appointment.create': 'Kalender', 'memory.add': 'Glimt husker', nav: 'Snarvei', 'family.where': 'Familie', 'calendar.school': 'Kalender' };

/** Svarer på spørsmålet. onStep(at, intent) for fremdrift. → svarobjektet (se toppen). */
export async function answer(user, text, { today = osloTodayISO(), onStep = () => {}, ctx = null } = {}) {
  const t0 = Date.now();
  const intent = detectIntent(text, today);
  onStep(1, intent);
  let r;
  try {
    const nv = intent === 'nav' ? navTarget(text) : null;
    r = intent === 'family.where' ? await whereAnswer(user, text)
      : intent === 'calendar.school' ? await toolSchoolTest(user, today)
      : nv ? { text: `Åpner **${nv.label}**.`, source: 'Snarvei', nav: { target: nv.target, label: nv.label, web: nv.web, deepLink: `finanshub://${nv.target}`, delayMs: 450 } }
      : intent === 'sun.daylight' ? await toolSun(user, text, today)
      : intent === 'weather' ? await toolWeather(user, text)
      : intent === 'calendar.day' ? await toolCalendarDay(user, text, today)
        : intent === 'calendar.next' ? await toolCalendarNext(user, text, today)
          : intent === 'departures' ? await toolDepartures(user, text)
            : intent === 'packages' ? toolPackages(user)
              : intent === 'finance.spent' ? toolFinance(user, text, today)
                : intent === 'tasks' ? toolTasks(user)
                  : intent === 'trial.create' ? toolTrial(user, text, today)
                    : intent === 'appointment.create' ? toolAppointment(user, text, today)
                      : intent === 'memory.add' ? await toolMemory(user, text, ctx)
                        : await toolLlm(user, withDateContext(text, today));
  } catch (e) {
    console.warn('[glimt]', intent, e?.message ?? e);
    r = { text: `Fikk ikke hentet ${TOOL_OF[intent]?.toLowerCase() ?? 'svaret'} akkurat nå. **Prøv igjen** om litt.`, source: 'Glimt', tool: TOOL_OF[intent], error: String(e?.message ?? e).slice(0, 200) };
  }
  onStep(2, intent);
  const kc = classifyLocal(text, intent);
  const out = { text: r.text, bold: boldOf(r.text), source: r.source, intent, kind: kc.kind, surface: kc.kind === 'action' ? 'pill' : 'inline', ...(r.tool ? { tool: r.tool } : {}), ...(r.card ? { card: r.card } : {}), ms: Date.now() - t0,
    model: r.model ?? 'Glimt · verktøy', engine: r.engine ?? (intent === 'llm' ? 'none' : 'tool') };
  for (const k of ['followUp', 'trial', 'missing', 'quickJobId', 'memory', 'apply', 'error', 'fix', 'actions', 'warning', 'notice', 'modelId', 'aiJobId', 'place', 'open', 'suggest', 'notFound', 'person', 'events']) if (r[k] !== undefined) out[k] = r[k];
  if (r.nav) { out.target = r.nav.target; out.nav = r.nav; }
  out.chatContext = { q: text, intent, messages: [{ role: 'user', content: text }, { role: 'assistant', content: r.text, ...(r.card ? { card: r.card } : {}), ...(r.tool ? { tool: r.tool } : {}) }] };
  return out;
}

/* ---------------- Brukervalg ---------------- */

export function assistSettings(user) {
  const s = kv.get(user, 'assist', {}) ?? {};
  let n; try { n = notifyOf(user); } catch { n = { ai_bg_notify: true }; }
  return { ai_bg_notify: n.ai_bg_notify !== false, cloud: s.cloud === true };
}

/* ---------------- Chat ---------------- */

function saveToChat(user, chatId, text, a, { assistantOnly = false } = {}) {
  const now = Date.now();
  const msgs = [...(assistantOnly ? [] : [{ role: 'user', content: text, ts: now }]), { role: 'assistant', content: a.text, ts: now + 1, card: a.card, tool: a.tool, meta: { glimt: true, intent: a.intent, source: a.source, tool: a.tool, card: a.card, ms: a.ms } }];
  const row = chatId ? q('SELECT * FROM hl_chats WHERE id=? AND user_id=?').get(String(chatId), user) : null;
  try {
    if (row) {
      let old = []; try { old = JSON.parse(row.messages) ?? []; } catch { old = []; }
      q('UPDATE hl_chats SET messages=?, updated=? WHERE id=? AND user_id=?').run(JSON.stringify([...old, ...msgs]), now, row.id, user);
      return row.id;
    }
    const id = randomUUID();
    q('INSERT INTO hl_chats(id,user_id,title,model,settings,messages,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(id, user, text.replace(/\s+/g, ' ').slice(0, 60) || 'Ny samtale', 'glimt', '{}', JSON.stringify(msgs), now, now);
    return id;
  } catch (e) { console.warn('[glimt] chat:', e.message); return null; }
}

/* ---------------- Jobber ---------------- */

const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const STEP_LABELS = (intent) => [['read', 'Leser spørsmålet'], ['tool', intent === 'llm' ? 'Spør den lokale modellen' : `Henter fra ${TOOL_OF[intent] ?? 'verktøyet'}`], ['answer', 'Skriver svaret']];
// Prompt 33: labels = egne tenker-steg (Kalender: «Leser i morgen i kalenderen», «Finner hull på minst 45 min», …).
function stepsAt(intent, at, failed = false, labels = null) {
  const L = Array.isArray(labels) && labels.length ? labels.map((l, i) => [`s${i + 1}`, String(l)]) : STEP_LABELS(intent ?? 'llm');
  return L.map(([key, label], i) => ({ key, label, state: i < at ? 'done' : i === at ? (failed ? 'failed' : 'active') : 'pending' }));
}
export function jobOut(row) {
  const o = { jobId: row.id, state: row.state, q: row.q, source: row.source, chatId: row.chat_id ?? null, intent: row.intent ?? null, title: row.title ?? 'Glimt tenker', model: row.model ?? 'Glimt',
    input: row.q, steps: parseJ(row.steps, stepsAt(row.intent, 0)), fields: parseJ(row.fields, []), progress: row.progress, created: row.created, updated: row.updated };
  const a = parseJ(row.result, null);
  if (a) o.answer = a;
  if (row.error) o.error = row.error;
  return o;
}
const getJob = (id) => q('SELECT * FROM assist_jobs WHERE id=?').get(id);
const setJob = (id, f) => { const keys = Object.keys(f); q(`UPDATE assist_jobs SET ${keys.map((k) => `${k}=@${k}`).join(', ')}, updated=@updated WHERE id=@id`).run({ ...f, id, updated: Date.now() }); };
const emit = (row) => { const j = jobOut(row); broadcast('assist', { jobId: j.jobId, state: j.state, steps: j.steps, fields: j.fields, progress: j.progress, title: j.title, model: j.model, input: j.input, source: j.source,
  ...(j.answer ? { answer: j.answer } : {}), ...(j.error ? { error: j.error } : {}) }, [row.user_id]); };

const running = new Map(); // id → Promise
async function runJob(id) {
  const row0 = getJob(id);
  if (!row0 || row0.state !== 'queued') return;
  const user = row0.user_id;
  setJob(id, { state: 'running', steps: JSON.stringify(stepsAt(null, 0)), progress: 10 });
  emit(getJob(id));
  let a;
  const cal = row0.source === 'calendar';
  try {
    a = await runAsUser(user, () => (cal ? calendarAnswer : answer)(user, row0.q, {
      onStep: (at, intent, labels) => {
        if (getJob(id)?.state === 'cancelled') return;
        setJob(id, { intent, title: TITLES[intent] ?? 'Glimt tenker', model: intent === 'llm' ? 'Glimt · lokal' : 'Glimt · verktøy', steps: JSON.stringify(stepsAt(intent, labels ? (at === 1 ? 0 : labels.length - 1) : at, false, labels)), progress: at === 1 ? 40 : 85,
          fields: JSON.stringify([{ k: 'Verktøy', v: TOOL_OF[intent] ?? 'Glimt' }]) });
        emit(getJob(id));
      },
    }));
  } catch (e) {
    if (getJob(id)?.state !== 'cancelled') { setJob(id, { state: 'failed', error: String(e?.message ?? e).slice(0, 300), steps: JSON.stringify(stepsAt(getJob(id)?.intent, 1, true)) }); emit(getJob(id)); }
    return;
  }
  let cur = getJob(id);
  if (cur.state === 'cancelled') return;
  // Prompt 33: klienten fikk 202 → strøm teksten ord for ord over realtime før svaret (Kalender-appen).
  if (cal && !cur.direct) { await streamWords(id, user, a.text); cur = getJob(id); if (cur.state === 'cancelled') return; }
  if (cur.source === 'chat') a.chatId = saveToChat(user, cur.chat_id, cur.q, a, { assistantOnly: !!cur.handoff && !!cur.chat_id });
  setJob(id, { state: 'done', result: JSON.stringify(a), intent: a.intent, model: a.model, progress: 100, chat_id: a.chatId ?? cur.chat_id,
    steps: JSON.stringify(stepsAt(a.intent, cal ? (a.steps?.length ?? 3) : 3, false, cal ? a.steps : null)), fields: JSON.stringify([{ k: 'Verktøy', v: a.tool ?? 'Glimt' }, { k: 'Kilde', v: a.source }, { k: 'Tid', v: `${(a.ms / 1000).toFixed(1).replace('.', ',')} s` }]) });
  const done = getJob(id);
  emit(done);
  // Svaret kom etter at klienten fikk 202: varsle (kø for appene + Web Push når ingen klient er synlig).
  if (!done.direct) {
    const chatId = done.chat_id;
    notifyUser(user, { title: 'Glimt', body: plainText(a.text), url: done.source === 'chat' && chatId ? `/#/chat/${chatId}` : cal ? '/#/kalender' : '/#/hjem', tag: `assist-${id}`, category: 'ai',
      data: { kind: 'assist', jobId: id, q: done.q, source: done.source, chatId, deepLink: done.source === 'chat' && chatId ? `finanshub://chat/${chatId}` : cal ? 'kalender://liste' : 'finanshub://hjem' } }, { realtime: false })
      .catch((e) => console.warn('[glimt] varsel:', e.message));
  }
}
/** Prompt 33: «assist» {jobId, state:'running', partial, done:false} i biter (ca. 1,5 s totalt) så klienten kan vise ord for ord. */
async function streamWords(id, user, text) {
  const words = String(text ?? '').split(' ');
  const per = Math.max(2, Math.ceil(words.length / 30));
  for (let n = per; n < words.length; n += per) {
    if (getJob(id)?.state === 'cancelled') return;
    broadcast('assist', { jobId: id, state: 'running', partial: words.slice(0, n).join(' '), done: false }, [user]);
    await new Promise((r) => { const t = setTimeout(r, streamMs); t.unref?.(); });
  }
}
let streamMs = 45;
/** Bare for tester: pause mellom bitene. */
export const _setStreamMs = (ms) => { streamMs = ms ?? 45; };
function start(id) {
  const p = runJob(id).catch((e) => { console.error('[glimt]', e?.message ?? e); try { setJob(id, { state: 'failed', error: 'Noe gikk galt. Prøv igjen.' }); } catch { /* */ } });
  running.set(id, p);
  p.finally(() => running.delete(id));
  return p;
}
/** Bare for tester: venter til alle jobber er ferdige. */
export const _drainAssist = async () => { while (running.size) await Promise.all([...running.values()]); };
function resume() {
  q("UPDATE assist_jobs SET state='queued', direct=0 WHERE state='running'").run();
  for (const { id } of q("SELECT id FROM assist_jobs WHERE state='queued' ORDER BY created").all()) start(id);
}
if (process.env.NODE_ENV !== 'test') resume();

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', authOrToken);

api.get('/settings', (c) => c.json(assistSettings(c.get('user'))));
api.put('/settings', async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {ai_bg_notify, cloud}' }, 400);
  for (const k of Object.keys(b)) { if (!['ai_bg_notify', 'cloud'].includes(k)) return c.json({ error: `Ukjent nøkkel ${k}` }, 400); if (typeof b[k] !== 'boolean') return c.json({ error: `${k} må være true eller false` }, 400); }
  if ('cloud' in b) kv.set(u, 'assist', { ...(kv.get(u, 'assist', {}) ?? {}), cloud: b.cloud });
  if ('ai_bg_notify' in b) kv.set(u, 'notify', { ...(kv.get(u, 'notify', {}) ?? {}), ai_bg_notify: b.ai_bg_notify });
  return c.json(assistSettings(u));
});

api.post('/', async (c) => {
  const user = c.get('user');
  const b = await c.req.json().catch(() => null);
  const text = typeof b?.q === 'string' ? b.q.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) return c.json({ error: 'Skriv et spørsmål' }, 400);
  if (text.length > MAX_Q) return c.json({ error: `Spørsmålet er for langt (maks ${MAX_Q} tegn)` }, 400);
  const source = b.source === 'chat' ? 'chat' : b.source === 'calendar' ? 'calendar' : 'search';
  // Prompt 33: hendelsen brukeren ser på (for «det var frisør»).
  const ctxId = typeof b.context?.eventId === 'string' && b.context.eventId.length <= 120 ? b.context.eventId : null;
  if (ctxId) {
    try {
      const ev = await runAsUser(user, () => findEvent(user, ctxId));
      if (ev) setContext(user, { source: 'event', eventId: ev.id, title: ev.title ?? '', note: ev.note ?? '', place: ev.room ?? '', business: senderOf(ev.note ?? '') });
    } catch { /* ukjent hendelse: bruk siste kontekst */ }
  }
  const chatId = typeof b.chatId === 'string' && b.chatId.length <= 80 ? b.chatId : null;
  // Chat strømmer vanlige spørsmål selv fra valgt modell; Glimt svarer bare når et verktøy passer (unngår to LLM-kall).
  if (source === 'chat' && detectIntent(text, osloTodayISO()) === 'llm') return c.json({ intent: 'chat', followUp: 'chat', text: '', source: 'Glimt' });
  if (q("SELECT count(*) FROM assist_jobs WHERE user_id=? AND state IN ('queued','running')").pluck().get(user) >= 5) return c.json({ error: 'Glimt jobber allerede med flere spørsmål. Vent litt.' }, 429);
  const id = 'a' + randomBytes(6).toString('hex'), now = Date.now();
  q('INSERT INTO assist_jobs(id, user_id, state, q, source, chat_id, title, model, steps, created, updated, direct) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)')
    .run(id, user, 'queued', text, source, chatId, 'Glimt tenker', 'Glimt', JSON.stringify(stepsAt(null, 0)), now, now);
  q('DELETE FROM assist_jobs WHERE user_id=? AND id NOT IN (SELECT id FROM assist_jobs WHERE user_id=? ORDER BY created DESC LIMIT 100)').run(user, user);
  const p = start(id);
  let timer;
  const quick = await Promise.race([p.then(() => true), new Promise((r) => { timer = setTimeout(() => r(false), directMs); timer.unref?.(); })]);
  clearTimeout(timer);
  const row = getJob(id);
  if (quick && row?.state === 'done') return c.json({ ...parseJ(row.result, {}), jobId: id });
  // Klienten venter ikke lenger: varsle når den blir ferdig.
  q('UPDATE assist_jobs SET direct=0 WHERE id=?').run(id);
  if (row?.state === 'failed') return c.json({ jobId: id, state: 'failed', error: row.error }, 502);
  const kc = classifyLocal(text, detectIntent(text, osloTodayISO()));
  return c.json({ jobId: id, kind: kc.kind, surface: kc.kind === 'action' ? 'pill' : 'inline', intent: kc.intent }, 202);
});
// Prompt 36: POST /api/assist/classify {q} → {kind:'question'|'action', surface:'inline'|'pill', sure, reason, intent, via}
// Raskt (lokale regler, ved tvil maks 300 ms LLM), så klienten vet om den skal vise kortet under søket eller pillen.
api.post('/classify', async (c) => {
  const b = await c.req.json().catch(() => null);
  const text = typeof b?.q === 'string' ? b.q.replace(/\s+/g, ' ').trim().slice(0, MAX_Q) : '';
  if (!text) return c.json({ error: 'Mangler q' }, 400);
  const r = await classify(c.get('user'), text);
  return c.json({ ...r, surface: r.kind === 'action' ? 'pill' : 'inline' });
});

api.get('/:id', (c) => {
  const id = c.req.param('id');
  if (!ID.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
  const row = getJob(id);
  if (!row || row.user_id !== c.get('user')) return c.json({ error: 'Fant ikke jobben' }, 404);
  return c.json(jobOut(row), 200, { 'Cache-Control': 'no-store' });
});
// Prompt 32: søkefeltet ga opp etter hs_timeout_s → jobben flyttes til en Chat-tråd (samme jobb-id) og fortsetter der.
// POST /api/assist/:id/handoff {chatId?} → {chatId, jobId, state}. Ferdig jobb: spørsmål + svar lagres i tråden med en gang.
api.post('/:id/handoff', async (c) => {
  const id = c.req.param('id'), user = c.get('user');
  if (!ID.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
  const row = getJob(id);
  if (!row || row.user_id !== user) return c.json({ error: 'Fant ikke jobben' }, 404);
  if (row.source === 'chat' && row.chat_id) return c.json({ chatId: row.chat_id, jobId: id, state: row.state });
  const b = await c.req.json().catch(() => ({}));
  const want = typeof b?.chatId === 'string' && b.chatId.length <= 80 ? b.chatId : null;
  if (row.state === 'done') {
    const chatId = saveToChat(user, want, row.q, parseJ(row.result, { text: '' }));
    if (!chatId) return c.json({ error: 'Kunne ikke lage samtalen' }, 500);
    setJob(id, { source: 'chat', chat_id: chatId, handoff: 1 });
    return c.json({ chatId, jobId: id, state: 'done' });
  }
  if (row.state === 'failed' || row.state === 'cancelled') return c.json({ error: 'Jobben er avsluttet', state: row.state }, 409);
  // Tråden får spørsmålet nå; svaret legges til når jobben er ferdig (og varsles hvis appen er lukket).
  const now = Date.now();
  let chatId = want && q('SELECT id FROM hl_chats WHERE id=? AND user_id=?').pluck().get(want, user);
  try {
    if (chatId) {
      const cur = q('SELECT messages FROM hl_chats WHERE id=?').pluck().get(chatId);
      q('UPDATE hl_chats SET messages=?, updated=? WHERE id=?').run(JSON.stringify([...parseJ(cur, []), { role: 'user', content: row.q, ts: now }]), now, chatId);
    } else {
      chatId = randomUUID();
      q('INSERT INTO hl_chats(id,user_id,title,model,settings,messages,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(chatId, user, row.q.slice(0, 60) || 'Ny samtale', 'glimt', '{}', JSON.stringify([{ role: 'user', content: row.q, ts: now }]), now, now);
    }
  } catch (e) { return c.json({ error: 'Kunne ikke lage samtalen' }, 500); }
  setJob(id, { source: 'chat', chat_id: chatId, handoff: 1, direct: 0 });
  emit(getJob(id));
  return c.json({ chatId, jobId: id, state: getJob(id).state });
});
api.post('/:id/cancel', (c) => {
  const id = c.req.param('id');
  if (!ID.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
  const row = getJob(id);
  if (!row || row.user_id !== c.get('user')) return c.json({ error: 'Fant ikke jobben' }, 404);
  if (row.state === 'done' || row.state === 'failed') return c.json({ ok: false, state: row.state, error: 'Jobben er allerede ferdig' }, 409);
  setJob(id, { state: 'cancelled', error: 'Avbrutt', steps: JSON.stringify(stepsAt(row.intent, 1, true)) });
  emit(getJob(id));
  return c.json({ ok: true, state: 'cancelled' });
});

export default api;
