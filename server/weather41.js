// Prompt 41 (SERVER41): Glimt tenker gjennom værspørsmål om uka med ekte ukesdata (claude-code-glimt-vaer-uke-ai.md),
// og skiføre i Vær/Brief (claude-code-vaer-rediger-ski-julfigur.md).
//
// Uke (assist + chat):
//   isWeekWeather41(tekst): uke/uka/helg/dager/neste/når/hvilken dag/beste/ukedager/sammenlign/tur/trening/fremover, eller > 9 ord (med værord eller «beste dag»).
//   Enkle spørsmål (≤ 9 ord, nå/i dag/i morgen) går fortsatt til hurtigsvaret i assist.js.
//   weekAnswer41(u, tekst) → assist-svar {text, bold, source:'✦ Ollama · Open-Meteo 7 dager · Oslo', intent:'weather.week', tool:'Vær', engine:'ollama'|'local',
//     model, week:[dag], place, open:{label:'Åpne Vær for Oslo ›', web, deepLink}, steps:['Leser værdata for uken …'], noAi?:true}
//   Ollama (lokalt, 20 s) med kompakt tabell per dag; svarer ikke modellen: lokal reserve som svarer på spørsmålet (merket «uten AI»).
//   weekFact41(u, tekst) → fakta til chatten {tool:'weather', place, when:'7 dager', label, text, source:'Open-Meteo', prompt}
// Ski: ski41(u) → {text, chip:'Ski: blå', wax:'Blå (V30)', grip:'Feste: Blå (V30)', glide:'Glid: universal', places:[{name, snowCm, newCm, tempC, humidity, url}], source} | null
//   Vises når snødybde ≥ 15 cm i Nordmarka (59.99, 10.67) og «Skiføre» ikke er slått av (kv vaer_layout.ski === false). Brief og Vær får ski.
import { kv } from './db.js';
import { extractPlace, geocode } from './weather35.js';
import { homePlace } from './chat-tools41.js';

const MOCK = () => process.env.MOCK_DATA === '1';
let F = null, llm = null;
/** Bare for tester: fetch for Open-Meteo (null = standard). Med injisert fetch hentes ekte data også med MOCK_DATA=1. */
export const _setWeather41Fetch = (fn) => { F = fn ?? null; };
/** Bare for tester: ({prompt, system}) → tekst | kast. null = Ollama via ai-run (sok, lokalt). */
export const _setWeek41Llm = (fn) => { llm = fn ?? null; };
export const WEEK_LLM_MS = 20_000;
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const WD_RE = /\b(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(en)?\b/i;
const WEATHER = /v(æ|ae)r(et|meldingen)?\b|regn|nedbør|paraply|grader|temperatur|snø|vind|sol(a|en|fylt|rik)?\b|kaldt|varmt|tørt|tørr|våt|skyet|\bweather\b|\bforecast\b/i;
const WEEK = /\b(uke|uka|uken|helg|helga|helgen|dager|dagene|neste (?:uke|helg|dager|\d+ dager)|når|hvilken dag|hvilke dager|beste|best|ukedag|ukedager|sammenlign|tur|trening|trene|sykle|sykkel|løpe|fremover|framover|resten av)\b/i;

/** true når spørsmålet skal tenkes gjennom med 7 dager værdata (ikke hurtigsvaret). */
export function isWeekWeather41(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  const w = t.split(/\s+/).length;
  const weatherish = WEATHER.test(t) || (/\b(beste|best|hvilken dag|når)\b/i.test(t) && /\b(sykle|sykkel|tur|gå tur|løpe|trene|trening|grille|bade|ute|ski)\b/i.test(t));
  if (!weatherish) return false;
  if (WEEK.test(t) || WD_RE.test(t)) return true;
  // Lange spørsmål om et bestemt tidspunkt (i morgen, neste time …) besvares av faktaverktøyet (chat-tools41), ikke ukesdata.
  if (/(^|\s)(i dag|idag|i morgen|nå|neste time|i kveld|i natt|om \d+ timer?)(?![\p{L}])/iu.test(t)) return false;
  return w > 9;
}

/* ---------------- Data ---------------- */

const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset';
const WMO_SHORT = { 0: 'klart', 1: 'lettskyet', 2: 'delvis skyet', 3: 'skyet', 45: 'tåke', 48: 'tåke', 51: 'yr', 53: 'yr', 55: 'yr', 61: 'lett regn', 63: 'regn', 65: 'kraftig regn', 66: 'underkjølt regn', 67: 'underkjølt regn', 71: 'lett snø', 73: 'snø', 75: 'kraftig snø', 77: 'snøkorn', 80: 'regnbyger', 81: 'regnbyger', 82: 'kraftige byger', 85: 'snøbyger', 86: 'snøbyger', 95: 'torden', 96: 'torden', 99: 'torden' };
async function getJson(url, ms = 8000) {
  const res = await (F ?? globalThis.fetch)(url, { headers: { Accept: 'application/json', 'User-Agent': 'homelab-os' }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} svarte ${res.status}`);
  return res.json();
}
const osloToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Deterministiske eksempeldager (MOCK_DATA=1), med regn torsdag/fredag og tørr helg. */
export function mockWeek41(p, today = osloToday()) {
  const seed = Math.abs(Math.round((p.lat * 7 + p.lon * 3) * 10)) % 5;
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i), wd = new Date(`${date}T12:00:00Z`).getUTCDay();
    const wet = wd === 4 ? 6.2 : wd === 5 ? 3.1 : wd === 1 ? 0.8 : 0;
    return { date, code: wet > 3 ? 63 : wet > 0 ? 61 : wd === 3 ? 1 : 2, max: 8 + ((i + seed) % 4), min: 2 + ((i + seed) % 3), mm: wet, pop: wet > 3 ? 80 : wet > 0 ? 40 : 10, wind: wd === 3 ? 2.5 : 4 + (i % 3), sunrise: `${date}T07:58`, sunset: `${date}T17:41` };
  });
}
async function week(p) {
  if (MOCK() && !F) return { days: mockWeek41(p), source: 'Open-Meteo', mock: true };
  const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&timezone=auto&forecast_days=7&wind_speed_unit=ms&daily=${DAILY}`);
  const x = d.daily ?? {};
  if (!x.time?.length) throw new Error('Open-Meteo ga ingen ukesprognose');
  return { days: x.time.map((date, i) => ({ date, code: x.weather_code?.[i] ?? null, max: x.temperature_2m_max?.[i] ?? null, min: x.temperature_2m_min?.[i] ?? null, mm: x.precipitation_sum?.[i] ?? 0,
    pop: x.precipitation_probability_max?.[i] ?? null, wind: x.wind_speed_10m_max?.[i] ?? null, sunrise: x.sunrise?.[i] ?? null, sunset: x.sunset?.[i] ?? null })), source: 'Open-Meteo' };
}
async function placeFor(u, text) {
  const name = extractPlace(text);
  if (name) { try { const g = await geocode(name); if (g) return { name: g.name ?? name, lat: g.lat, lon: g.lon }; } catch { /* hjemmet */ } }
  const h = await homePlace(u);
  return { name: h.name, lat: h.lat, lon: h.lon };
}
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const nb = (v) => String(r1(v)).replace('.', ',');
const dayName = (date, today = osloToday()) => { const wd = WD[new Date(`${date}T12:00:00Z`).getUTCDay()]; return date === today ? `i dag (${wd})` : date === addDays(today, 1) ? `i morgen (${wd})` : wd; };
const dm = (date) => `${+date.slice(8, 10)}.${date.slice(5, 7)}`;
/** Kompakt tabell per dag til modellen. */
export function weekTable41(days) {
  return days.map((d) => `${WD[new Date(`${d.date}T12:00:00Z`).getUTCDay()]} ${dm(d.date)}: ${WMO_SHORT[d.code] ?? 'ukjent'}, ${Math.round(d.min)}–${Math.round(d.max)}°, nedbør ${nb(d.mm ?? 0)} mm (${d.pop ?? '–'} %), vind ${nb(d.wind ?? 0)} m/s`).join('\n');
}
/** Lokal reserve som faktisk svarer på spørsmålet (regndager / tørreste / varmeste / kaldeste / beste dag). */
export function localWeekAnswer41(text, days, today = osloToday()) {
  const t = String(text ?? '').toLowerCase();
  const by = (f, dir = 1) => [...days].sort((a, b) => dir * (f(a) - f(b)))[0];
  const nm = (d, big = false) => `${big ? dayName(d.date, today).replace(/^./, (c) => c.toUpperCase()) : dayName(d.date, today)} ${dm(d.date)}`;
  if (/regn|nedbør|våt|paraply/.test(t) && !/tørr|tørt|opphold/.test(t)) {
    const wet = by((d) => d.mm ?? 0, -1);
    if (!(wet.mm > 0.2)) return 'Det ser **tørt ut hele uka**, ingen dager med merkbar nedbør.';
    const others = days.filter((d) => d !== wet && d.mm >= 1).map((d) => dayName(d.date, today));
    return `**Mest regn ${nm(wet)}, rundt ${Math.round(wet.mm)} mm (${wet.pop ?? '–'} %).**${others.length ? ` ${others.join(' og ').replace(/^./, (c) => c.toUpperCase())} er også våt${others.length > 1 ? 'e' : ''}.` : ''}`;
  }
  if (/varm/.test(t)) { const d = by((x) => x.max, -1); return `**Varmest ${nm(d)} med ${Math.round(d.max)}°.**`; }
  if (/kald/.test(t)) { const d = by((x) => x.min); return `**Kaldest ${nm(d)} med ned mot ${Math.round(d.min)}°.**`; }
  if (/vind|blås/.test(t)) { const d = by((x) => x.wind ?? 0, -1); return `**Mest vind ${nm(d)}, opptil ${nb(d.wind)} m/s.**`; }
  const best = by((d) => (d.mm ?? 0) * 3 + (d.pop ?? 0) / 20 + (d.wind ?? 0) * 0.6 - (d.max ?? 0) * 0.2);
  const dry = days.filter((d) => (d.mm ?? 0) < 0.3).map((d) => dayName(d.date, today));
  return `**${nm(best, true)} ser best ut: ${(best.mm ?? 0) < 0.3 ? 'tørt' : `${nb(best.mm)} mm`}, ${Math.round(best.max)}° og ${(best.wind ?? 0) < 4 ? 'lite vind' : `${nb(best.wind)} m/s`}.**${dry.length > 1 ? ` Tørre dager: ${dry.join(', ')}.` : ''}`;
}
const SYSTEM = 'Du er Glimt, en værassistent. Svar kort på norsk bokmål (1–3 setninger) med konkrete dager og tall fra tabellen. Uthev hovedsvaret med **…** én gang. Ikke finn på data som ikke står i tabellen.';
async function askLlm(u, question, table, place) {
  const prompt = `Værdata for ${place} de neste 7 dagene (Open-Meteo):\n${table}\n\nSpørsmål: ${question}`;
  if (llm) return { text: await llm({ prompt, system: SYSTEM }), model: 'test' };
  const { run } = await import('./ai-run.js');
  const r = await run('sok', { user: u, prompt, system: SYSTEM, localOnly: true, numPredict: 220, temperature: 0.2, timeoutMs: WEEK_LLM_MS, title: 'Glimt · ukas vær' });
  return { text: r.text, model: r.model };
}
const boldOf = (t) => [...String(t).matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);
/** Assist-svaret for ukesspørsmål (se toppen). */
export async function weekAnswer41(u, text) {
  const place = await placeFor(u, text);
  const w = await week(place);
  const table = weekTable41(w.days);
  let out = null, model = null;
  try {
    const r = await Promise.race([askLlm(u, text, table, place.name), new Promise((_, rej) => { const t = setTimeout(() => rej(new Error('Tidsavbrudd')), WEEK_LLM_MS + 500); t.unref?.(); })]);
    const txt = String(r?.text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (txt) { out = /\*\*/.test(txt) ? txt : `**${txt}**`; model = r.model; }
  } catch { /* lokal reserve */ }
  const noAi = !out;
  if (noAi) out = localWeekAnswer41(text, w.days);
  const q = encodeURIComponent(place.name);
  return { text: out, bold: boldOf(out), source: noAi ? `Glimt · uten AI · Open-Meteo 7 dager · ${place.name}` : `✦ Ollama · Open-Meteo 7 dager · ${place.name}`, tool: 'Vær', intent: 'weather.week',
    engine: noAi ? 'local' : 'ollama', model: noAi ? 'Glimt · uten AI' : `Glimt · ${model ?? 'Ollama'}`, ...(noAi ? { noAi: true, warning: 'uten AI' } : {}), place: { name: place.name, lat: place.lat, lon: place.lon },
    week: w.days, steps: ['Leser værdata for uken …', noAi ? 'Svarer uten AI' : 'Ollama tenker'], open: { label: `Åpne Vær for ${place.name} ›`, web: `/#/vaer?sted=${q}`, deepLink: `finanshub://vaer?sted=${q}` } };
}
/** Fakta til chatten (systemprompten får ukestabellen). */
export async function weekFact41(u, text) {
  const place = await placeFor(u, text);
  const w = await week(place);
  const table = weekTable41(w.days);
  return { tool: 'weather', place: place.name, when: '7 dager', window: 'neste 7 dager', label: `Ukesprognose for ${place.name}`, text: table, source: w.source, values: { days: w.days }, ...(w.mock ? { mock: true } : {}),
    prompt: `Værdata for ${place.name} de neste 7 dagene (Open-Meteo). Bruk dem til å svare på spørsmålet med konkrete dager og tall, ikke finn på noe:\n${table}` };
}

/* ---------------- Skiføre ---------------- */

export const NORDMARKA = { name: 'Nordmarka', lat: 59.99, lon: 10.67, url: 'https://skisporet.no/' };
/** Smøring ut fra temperatur (og skare/nysnø). */
export function wax41({ tempC, newCm = 0, refrozen = false }) {
  if (refrozen) return { grip: 'Blå klister', short: 'blå klister' };
  if (tempC <= -10) return { grip: 'Grønn (V20)', short: 'grønn' };
  if (tempC <= -3) return newCm >= 2 ? { grip: 'Blå (V30)', short: 'blå' } : { grip: 'Blå ekstra (V40)', short: 'blå ekstra' };
  if (tempC <= 0) return { grip: 'Fiolett (V45)', short: 'fiolett' };
  return { grip: 'Rød (V55) eller universalklister', short: 'rød' };
}
export const glide41 = (t) => (t <= -8 ? 'kald' : t <= -2 ? 'universal' : 'varm');
/** Skiføre-data (Open-Meteo for Nordmarka). Mock: snø fra november til mars. */
async function skiData(now = Date.now()) {
  const m = +new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }).slice(5, 7);
  if (MOCK() && !F) return [11, 12, 1, 2, 3].includes(m) ? { snowCm: 42, newCm: 6, tempC: -4, humidity: 82, maxC: -2 } : { snowCm: 0, newCm: 0, tempC: 6, humidity: 80, maxC: 9 };
  const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${NORDMARKA.lat}&longitude=${NORDMARKA.lon}&timezone=Europe%2FOslo&past_days=3&forecast_days=1&current=temperature_2m,relative_humidity_2m,snow_depth&daily=snowfall_sum,temperature_2m_max`);
  const cur = d.current ?? {};
  const fall = (d.daily?.snowfall_sum ?? []).slice(0, 3).reduce((a, x) => a + (x ?? 0), 0);
  return { snowCm: Math.round((cur.snow_depth ?? 0) * 100), newCm: Math.round(fall), tempC: Math.round(cur.temperature_2m ?? 0), humidity: Math.round(cur.relative_humidity_2m ?? 0), maxC: Math.round(d.daily?.temperature_2m_max?.at(-1) ?? 0) };
}
export const skiOff41 = (u) => (kv.get(u, 'vaer_layout', {}) ?? {}).ski === false;
/** Skiføre når det er relevant (snø ≥ 15 cm og ikke slått av). → objekt eller null */
export async function ski41(u, now = Date.now()) {
  if (skiOff41(u)) return null;
  let s;
  try { s = await skiData(now); } catch { return null; }
  if (!(s.snowCm >= 15)) return null;
  const refrozen = s.maxC > 0 && s.tempC < -1;
  const w = wax41({ tempC: s.tempC, newCm: s.newCm, refrozen });
  const g = glide41(s.tempC);
  const what = s.newCm >= 2 ? 'Nysnø' : refrozen ? 'Gjenfrosset' : 'Fint skiføre';
  return { text: `${what} i Nordmarka: ${s.snowCm} cm snø og ${s.tempC}°. Glimt anbefaler ${w.grip.charAt(0).toLowerCase()}${w.grip.slice(1)} i festesonen.`,
    chip: `Ski: ${w.short}`, wax: w.grip, grip: `Feste: ${w.grip}`, glide: `Glid: ${g}`, title: 'SKIFØRE · NORDMARKA', voice: 'Det er fint skiføre i marka i dag.',
    places: [{ name: NORDMARKA.name, lat: NORDMARKA.lat, lon: NORDMARKA.lon, snowCm: s.snowCm, newCm: s.newCm, tempC: s.tempC, humidity: s.humidity, url: NORDMARKA.url }], source: 'Open-Meteo' };
}
