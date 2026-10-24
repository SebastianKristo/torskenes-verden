// Prompt 35 (SERVER35): været for hvilket som helst sted («været i New York» ga Oslo). Brukes av GET /api/weather/place,
// /api/assist (Homelab-søket og Chat), Kalender-Glimt og web-søket.
//
// GET /api/weather/place?q=New York[&day=today|tomorrow]   (sesjon eller app-token)
//   → {place:{name:'New York', country:'USA', label:'New York, USA', lat, lon, tz:'America/New_York', norway:false},
//      now:{temp, cond:'Lettskyet', code, wind, isDay, icon:'partly', ic:'⛅'}, today:{date, hi, lo, cond, code, precipProb},
//      tomorrow:{date, hi, lo, cond, code, precipProb}, days:[{date, hi, lo, cond, code, icon, ic, precipProb}] (7),
//      text:'Lettskyet og **14°** i New York, USA nå, vind 4 m/s. I dag 11–17°.', plain:'(uten **)', source:'open-meteo'|'met'|'mock',
//      open:{route:'vaer', name, lat, lon}}
//   404 {error:'Fant ikke stedet «Nwe Yrok». Prøv en annen stavemåte.', suggest?:'New York'}  · 400 uten q
// Stedet: Open-Meteo Geocoding (count=1, language=nb), ellers Nominatim (via searchPlacesV2). Værdata: norske steder fra MET
// (weatherFull), andre fra Open-Meteo med timezone=auto, så «i dag» og «i morgen» gjelder stedets tid.
// extractPlace(text) finner stedet i teksten etter «i / på / in / for / at / ved / rundt» (ikke «i morgen», «i dag» …).
import { Hono } from 'hono';
import { cached } from './cache.js';
import { authOrToken } from './mobile.js';
import { weatherFull, wmoText, iconOf, PLACES } from './weather-full.js';
import { searchPlacesV2, fold } from './weather-places.js';

const MOCK = () => process.env.MOCK_DATA === '1';
const WX_EMOJI = { clear: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', sleet: '🌨️', snow: '❄️', thunder: '⛈️' };
const r0 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
const icOf = (code, isDay = true) => { const k = iconOf(code); return { icon: k, ic: !isDay && (k === 'clear' || k === 'partly') ? '🌙' : WX_EMOJI[k] ?? '☁️' }; };
const COUNTRY = { US: 'USA', GB: 'Storbritannia', SE: 'Sverige', DK: 'Danmark', DE: 'Tyskland', FR: 'Frankrike', ES: 'Spania', IT: 'Italia', JP: 'Japan', NO: 'Norge', FI: 'Finland', NL: 'Nederland' };

let F = (u, i) => fetch(u, i), injected = false;
/** Bare for tester: injiser fetch (null = standard). Med injisert fetch brukes ekte geokoding/værkall også når MOCK_DATA=1. */
export const _setWeather35Fetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); injected = !!fn; };
async function getJson(url, ms = 7000) {
  const r = await F(url, { headers: { Accept: 'application/json', 'User-Agent': 'homelab-os' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${new URL(url).host} svarte ${r.status}`);
  return r.json();
}

/* ---------------- Stedet i teksten ---------------- */

const TIME_WORDS = /^(i morgen|imorgen|i morra|imorra|i dag|idag|i kveld|ikveld|i natt|inatt|i helg(en|a)?|i går|igår|i overmorgen|overmorgen|nå|da|tomorrow|today|tonight|now|this|neste|denne|på (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|kl\.?|klokka|om)\b/i;
const NOT_PLACE = /^(dag|morgen|morra|kveld|natt|helgen|helga|går|uka|uken|neste|denne|ute|nå|det|den|år|år|morges|ettermiddag|formiddag|løpet|the|weekend|my|min|mitt|hele|tur|turen|løpeturen)$/i;
const PREP = /(?:^|\s)(i|på|in|for|at|ved|rundt|around|near)\s+/gi;

/** Stedet i teksten («været i new york» → «New York»), eller null. */
export function extractPlace(text) {
  const src = String(text ?? '').replace(/[«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!src) return null;
  for (const m of src.matchAll(PREP)) {
    const rest = src.slice(m.index + m[0].length);
    if (TIME_WORDS.test(rest) || TIME_WORDS.test(`${m[1]} ${rest}`)) continue;
    // Fram til tid-ord, tegnsetting eller slutten.
    let cand = rest.split(/[?!,;:()]|\.(?=\s|$)/)[0];
    const stop = cand.search(/\s(i morgen|imorgen|i morra|i dag|idag|i kveld|i natt|i helg\w*|i går|i overmorgen|overmorgen|nå|tomorrow|today|tonight|now|this weekend|neste|på (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|(om|kl\.?|klokka) \d|og\s|eller\s|da$|da\s|egentlig|for (tiden|øyeblikket))\b/i);
    if (stop >= 0) cand = cand.slice(0, stop);
    cand = cand.replace(/\s+(nå|da|egentlig|akkurat)$/i, '').trim();
    if (!cand || cand.length < 2 || cand.length > 60 || NOT_PLACE.test(cand) || /^\d/.test(cand)) continue;
    if (/^(været|weather|regn|vær|temperaturen)$/i.test(cand)) continue;
    if (cand.split(/\s+/).length > 4) cand = cand.split(/\s+/).slice(0, 4).join(' ');
    return cand.split(/\s+/).map((w) => (w === w.toLowerCase() && !/^(de|la|le|del|am|upon|og)$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
  }
  return null;
}

/* ---------------- Geokoding ---------------- */

// Eksempelsteder (MOCK_DATA=1 og forslag ved feilstaving).
const KNOWN = [
  ['New York', 'US', 40.7143, -74.006, 'America/New_York'], ['Paris', 'FR', 48.8534, 2.3488, 'Europe/Paris'], ['London', 'GB', 51.5085, -0.1257, 'Europe/London'],
  ['Strømstad', 'SE', 58.9395, 11.1712, 'Europe/Stockholm'], ['Stockholm', 'SE', 59.3294, 18.0687, 'Europe/Stockholm'], ['København', 'DK', 55.6759, 12.5655, 'Europe/Copenhagen'],
  ['Berlin', 'DE', 52.5244, 13.4105, 'Europe/Berlin'], ['Tokyo', 'JP', 35.6895, 139.6917, 'Asia/Tokyo'], ['Barcelona', 'ES', 41.3888, 2.159, 'Europe/Madrid'],
  ['Roma', 'IT', 41.8919, 12.5113, 'Europe/Rome'], ['Oslo', 'NO', 59.9127, 10.7461, 'Europe/Oslo'], ['Bergen', 'NO', 60.392, 5.328, 'Europe/Oslo'],
  ['Trondheim', 'NO', 63.4305, 10.3951, 'Europe/Oslo'], ['Tromsø', 'NO', 69.6496, 18.957, 'Europe/Oslo'], ['Stavanger', 'NO', 58.97, 5.7331, 'Europe/Oslo'],
  ['Lillehammer', 'NO', 61.1153, 10.4662, 'Europe/Oslo'], ['Kristiansand', 'NO', 58.1467, 7.9956, 'Europe/Oslo'], ['Bodø', 'NO', 67.28, 14.4049, 'Europe/Oslo'],
];
const ALIAS = { 'new york city': 'New York', nyc: 'New York', copenhagen: 'København', rome: 'Roma', gothenburg: 'Göteborg', tromso: 'Tromsø', stromstad: 'Strømstad' };
const key = (s) => fold(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]/g, '');
function lev(a, b) { // Damerau-Levenshtein (OSA): «Nwe Yrok» → «New York» = 2
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
/** «Mente du New York?» – nærmeste kjente sted (Levenshtein ≤ 40 % av lengden), eller null. */
export function suggestPlace(q) {
  const k = key(q);
  if (k.length < 3) return null;
  let best = null;
  for (const [name] of KNOWN) { const v = lev(k, key(name)); if (v <= Math.max(2, Math.round(key(name).length * 0.4)) && (!best || v < best[1])) best = [name, v]; }
  return best?.[0] ?? null;
}
const placeOut = (name, cc, country, lat, lon, tz) => {
  const c = String(cc ?? '').toUpperCase(), norway = c === 'NO' || /^norge$/i.test(country ?? '');
  const ctry = COUNTRY[c] ?? country ?? '';
  return { name, country: ctry, cc: c || null, label: norway || !ctry ? name : `${name}, ${ctry}`, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, tz: tz || null, norway };
};

/** Finner stedet. → place eller null. */
export async function geocode(q) {
  const t = String(q ?? '').trim().slice(0, 80);
  if (t.length < 2) return null;
  const want = ALIAS[t.toLowerCase()] ?? t;
  if (MOCK() && !injected) {
    const hit = KNOWN.find(([n]) => key(n) === key(want)) ?? KNOWN.find(([n]) => key(n).startsWith(key(want)) && key(want).length >= 4);
    return hit ? placeOut(hit[0], hit[1], null, hit[2], hit[3], hit[4]) : null;
  }
  return cached(`wx35:geo:${key(want)}`, 24 * 3600_000, async () => {
    try {
      const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(want)}&count=1&language=nb&format=json`);
      const x = d.results?.[0];
      if (x) return placeOut(x.name, x.country_code, x.country, x.latitude, x.longitude, x.timezone);
    } catch (e) { console.warn('[weather35] Open-Meteo-geokoding:', e.message); }
    try {
      const L = await searchPlacesV2(want);
      const x = L[0];
      if (x) return placeOut(x.name, null, x.country, x.lat, x.lon, null);
    } catch (e) { console.warn('[weather35] Nominatim:', e.message); }
    return null;
  });
}

/* ---------------- Værdata ---------------- */

async function forecastOf(p) {
  if (p.norway || (MOCK() && !injected)) {
    const w = await weatherFull({ lat: p.lat, lon: p.lon, name: p.name });
    const days = (w.days ?? []).slice(0, 7).map((d) => ({ date: d.date, hi: r0(d.hi), lo: r0(d.lo), code: d.code ?? 0, precipProb: r0(d.precipProb) ?? 0 }));
    const c = w.current ?? {};
    // Prompt 47: timeprognosen (lokal tid i stedets tidssone) for «neste time», «om 2 timer», «i kveld».
    const hours = (w.hours ?? []).map((h) => ({ t: String(h.t ?? '').slice(0, 16), temp: r0(h.temp), code: h.code ?? 0, precip: h.precip ?? null, precipProb: r0(h.precipProb), wind: r0(h.wind) })).filter((h) => h.t);
    return { now: { temp: r0(c.temp), code: c.code ?? 0, wind: r0(c.wind), isDay: c.isDay !== false }, days, hours, source: w.source === 'mock' ? 'mock' : String(w.source ?? 'met').startsWith('met') ? 'met' : w.source, tz: p.tz ?? 'Europe/Oslo' };
  }
  return cached(`wx35:fc:${p.lat},${p.lon}`, 10 * 60_000, async () => {
    const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&timezone=auto&forecast_days=7&wind_speed_unit=ms`
      + '&current=temperature_2m,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max'
      + '&hourly=temperature_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m', 8000); // prompt 47: timeprognose
    const D = d.daily ?? {}, C = d.current ?? {}, H = d.hourly ?? {};
    const days = (D.time ?? []).map((date, i) => ({ date, hi: r0(D.temperature_2m_max?.[i]), lo: r0(D.temperature_2m_min?.[i]), code: D.weather_code?.[i] ?? 0, precipProb: r0(D.precipitation_probability_max?.[i]) ?? 0 }));
    const hours = (H.time ?? []).slice(0, 72).map((t, i) => ({ t: String(t).slice(0, 16), temp: r0(H.temperature_2m?.[i]), code: H.weather_code?.[i] ?? 0, precip: H.precipitation?.[i] ?? null, precipProb: r0(H.precipitation_probability?.[i]), wind: r0(H.wind_speed_10m?.[i]) }));
    return { now: { temp: r0(C.temperature_2m), code: C.weather_code ?? 0, wind: r0(C.wind_speed_10m), isDay: C.is_day !== 0 }, days, hours, source: 'open-meteo', tz: d.timezone ?? p.tz };
  });
}

const dayOut = (d) => (d ? { date: d.date, hi: d.hi, lo: d.lo, cond: wmoText(d.code), code: d.code, ...icOf(d.code), precipProb: d.precipProb } : null);
/** Teksten i svaret (med **…** rundt det viktigste). offset 0 = nå/i dag, 1 = i morgen, 2–6 = den dagen. */
export function placeText(r, offset = 0) {
  const P = r.place.label;
  if (offset === 0 || !r.days[offset]) {
    const t = r.today;
    return `${r.now.cond} og **${r.now.temp}°** i ${P} nå, vind ${r.now.wind ?? 0} m/s.${t ? ` I dag ${t.lo}–${t.hi}°.` : ''}${t && t.precipProb >= 50 ? ' **Ta med paraply.**' : ''}`;
  }
  const d = r.days[offset];
  const when = offset === 1 ? 'I morgen' : `${['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'][new Date(d.date + 'T12:00:00Z').getUTCDay()]}`;
  return `${when} blir det **${d.lo}–${d.hi}° og ${d.cond.toLowerCase()}** i ${P}, ${d.precipProb} % sjanse for nedbør.${d.precipProb >= 50 ? ' **Ta med paraply.**' : ''}`;
}

export class PlaceNotFound extends Error {
  constructor(q) { super(`Fant ikke stedet «${q}». Prøv en annen stavemåte.`); this.status = 404; this.q = q; this.suggest = suggestPlace(q); }
}
/** Været for et sted (navn). Kaster PlaceNotFound. */
export async function placeWeather(q, { offset = 0 } = {}) {
  const p = await geocode(q);
  if (!p) throw new PlaceNotFound(String(q ?? '').trim());
  const f = await forecastOf(p);
  const days = f.days.map(dayOut);
  const r = { place: { ...p, tz: p.tz ?? f.tz ?? null }, now: { ...f.now, cond: wmoText(f.now.code), ...icOf(f.now.code, f.now.isDay) }, today: days[0] ?? null, tomorrow: days[1] ?? null, days, hours: (f.hours ?? []).map((h) => ({ ...h, cond: wmoText(h.code) })), source: f.source };
  r.text = placeText(r, offset);
  r.plain = r.text.replace(/\*\*/g, '');
  r.open = { route: 'vaer', name: p.label, lat: p.lat, lon: p.lon };
  return r;
}

/* ---------------- Rute ---------------- */

const api = new Hono();
api.use('*', authOrToken);
api.get('/', async (c) => {
  const q = String(c.req.query('q') ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return c.json({ error: 'Skriv et sted (q)' }, 400);
  const offset = c.req.query('day') === 'tomorrow' ? 1 : 0;
  try { return c.json(await placeWeather(q, { offset })); }
  catch (e) {
    if (e instanceof PlaceNotFound) return c.json({ error: e.message, ...(e.suggest ? { suggest: e.suggest } : {}) }, 404);
    return c.json({ error: `Fikk ikke hentet været akkurat nå (${e.message})` }, 502);
  }
});
export default api;
export { PLACES };
