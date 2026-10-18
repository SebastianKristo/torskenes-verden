// Værappen i mobilappene (design/Vaer.dc.html). Kilde: MET/yr (api.met.no Locationforecast 2.0 «complete», med
// User-Agent fra config). Open-Meteo fyller inn det MET ikke har: i går, passerte timer, sikt og UV. Cachet i 10 minutter.
// Uten nett eller med MOCK_DATA=1 gis realistiske eksempeldata. Månefasen regnes lokalt.
import { cached, fetchJson } from './cache.js';
import { config } from './config.js';
import { sunTime, feelsLike } from './weather.js';

export const PLACES = {
  oslo: { id: 'oslo', name: 'Oslo', lat: 59.9139, lon: 10.7522 },
  bergen: { id: 'bergen', name: 'Bergen', lat: 60.3913, lon: 5.3221 },
  trondheim: { id: 'trondheim', name: 'Trondheim', lat: 63.4305, lon: 10.3951 },
  tromso: { id: 'tromso', name: 'Tromsø', lat: 69.6492, lon: 18.9553 },
};

// WMO-værkoder → norsk tekst.
const WMO = {
  0: 'Klart', 1: 'Stort sett klart', 2: 'Delvis skyet', 3: 'Skyet', 45: 'Tåke', 48: 'Rimtåke',
  51: 'Lett yr', 53: 'Yr', 55: 'Kraftig yr', 56: 'Underkjølt yr', 57: 'Kraftig underkjølt yr',
  61: 'Lett regn', 63: 'Regn', 65: 'Kraftig regn', 66: 'Underkjølt regn', 67: 'Kraftig underkjølt regn',
  71: 'Lett snø', 73: 'Snø', 75: 'Kraftig snø', 77: 'Snøkorn', 80: 'Lette regnbyger', 81: 'Regnbyger', 82: 'Kraftige regnbyger',
  85: 'Snøbyger', 86: 'Kraftige snøbyger', 95: 'Tordenvær', 96: 'Tordenvær med hagl', 99: 'Kraftig tordenvær med hagl',
};
export const wmoText = (c) => WMO[c] ?? 'Ukjent';

export function weatherKindOf(code, isDay) {
  if (!isDay) return 'night';
  if ([45, 48].includes(code)) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain';
  if (code >= 2) return 'cloudy';
  return 'clear';
}

// Månefase: 0 = nymåne, 0,5 = fullmåne. Synodisk måned fra kjent nymåne 6. januar 2000 18:14 UTC.
const SYNODIC = 29.530588853;
const NEW_REF = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
export function moonOf(date = new Date()) {
  const days = date.getTime() / 86400000 - NEW_REF;
  const phase = ((days / SYNODIC) % 1 + 1) % 1;
  const illum = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100);
  const name = phase < 0.03 || phase > 0.97 ? 'Nymåne' : phase < 0.22 ? 'Voksende månesigd' : phase < 0.28 ? 'Første kvarter'
    : phase < 0.47 ? 'Voksende måne' : phase < 0.53 ? 'Fullmåne' : phase < 0.72 ? 'Minkende måne' : phase < 0.78 ? 'Siste kvarter' : 'Minkende månesigd';
  const at = (target) => new Date(date.getTime() + (((target - phase) % 1 + 1) % 1 || 1) * SYNODIC * 86400000).toISOString().slice(0, 10);
  return { phase: Math.round(phase * 1000) / 1000, illum, name, nextFull: at(0.5), nextNew: at(0) };
}

const osloParts = (d) => Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  .formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
const osloNowLocal = () => { const p = osloParts(new Date()); return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:00`; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** Bygger svaret fra Open-Meteo-rådata (også brukt av mockdata og testene). */
export function buildFull(raw, place, now = osloNowLocal()) {
  const H = raw.hourly ?? {}, D = raw.daily ?? {}, C = raw.current ?? {};
  const times = H.time ?? [];
  const idxNow = Math.max(0, times.findIndex((t) => t >= now.slice(0, 13)));
  const from = Math.max(0, idxNow - 12), to = Math.min(times.length, idxNow + 36);
  const hours = [];
  for (let i = from; i < to; i++) {
    hours.push({ t: times[i], temp: r1(H.temperature_2m?.[i]), feels: r1(H.apparent_temperature?.[i]), code: H.weather_code?.[i] ?? 0, isDay: !!H.is_day?.[i],
      precipProb: H.precipitation_probability?.[i] ?? 0, precip: r1(H.precipitation?.[i] ?? 0), wind: r1(H.wind_speed_10m?.[i]), gust: r1(H.wind_gusts_10m?.[i]), windDir: H.wind_direction_10m?.[i] ?? null });
  }
  const dt = D.time ?? [];
  const todayIdx = Math.max(0, dt.indexOf(now.slice(0, 10)));
  const days = [];
  for (let i = todayIdx; i < Math.min(dt.length, todayIdx + 7); i++) {
    days.push({ date: dt[i], hi: r1(D.temperature_2m_max?.[i]), lo: r1(D.temperature_2m_min?.[i]), code: D.weather_code?.[i] ?? 0, precipProb: D.precipitation_probability_max?.[i] ?? 0,
      precipSum: r1(D.precipitation_sum?.[i] ?? 0), sunrise: D.sunrise?.[i] ?? null, sunset: D.sunset?.[i] ?? null, uvMax: r1(D.uv_index_max?.[i]), windMax: r1(D.wind_speed_10m_max?.[i]) });
  }
  const today = days[0] ?? {};
  const y = todayIdx > 0 ? todayIdx - 1 : null;
  // Lufttrykk: trend over de siste 3 timene.
  const pNow = H.pressure_msl?.[idxNow], p3 = H.pressure_msl?.[Math.max(0, idxNow - 3)];
  const trend = pNow == null || p3 == null ? 'steady' : pNow - p3 > 1 ? 'rising' : p3 - pNow > 1 ? 'falling' : 'steady';
  let nextRain = null;
  for (let i = idxNow; i < times.length; i++) if ((H.precipitation?.[i] ?? 0) >= 0.1) { nextRain = { t: times[i], mm: r1(H.precipitation[i]) }; break; }
  const code = C.weather_code ?? H.weather_code?.[idxNow] ?? 0, isDay = C.is_day != null ? !!C.is_day : !!H.is_day?.[idxNow];
  const daylight = today.sunrise && today.sunset ? Math.round((Date.parse(today.sunset) - Date.parse(today.sunrise)) / 60000) : null;
  return {
    place,
    current: { temp: r1(C.temperature_2m ?? H.temperature_2m?.[idxNow]), feels: r1(C.apparent_temperature ?? H.apparent_temperature?.[idxNow]), code, text: wmoText(code), isDay,
      wind: r1(C.wind_speed_10m ?? H.wind_speed_10m?.[idxNow]), gust: r1(C.wind_gusts_10m ?? H.wind_gusts_10m?.[idxNow]), windDir: C.wind_direction_10m ?? H.wind_direction_10m?.[idxNow] ?? null,
      humidity: C.relative_humidity_2m ?? H.relative_humidity_2m?.[idxNow] ?? null, dew: r1(H.dew_point_2m?.[idxNow]), pressure: r1(C.pressure_msl ?? pNow), pressureTrend: trend,
      visibility: H.visibility?.[idxNow] != null ? Math.round(H.visibility[idxNow] / 100) / 10 : null, uv: r1(H.uv_index?.[idxNow] ?? 0), precip: r1(C.precipitation ?? H.precipitation?.[idxNow] ?? 0) },
    today: { hi: today.hi ?? null, lo: today.lo ?? null, sunrise: today.sunrise ?? null, sunset: today.sunset ?? null, daylight, precipSum: today.precipSum ?? 0, precipProb: today.precipProb ?? 0 },
    yesterday: y == null ? null : { hi: r1(D.temperature_2m_max?.[y]), lo: r1(D.temperature_2m_min?.[y]) },
    hours, days, moon: moonOf(), nextRain, kind: weatherKindOf(code, isDay),
    yrUrl: `https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/${place.lat},${place.lon}`,
    updatedAt: new Date().toISOString(),
  };
}

const HOURLY = 'temperature_2m,apparent_temperature,weather_code,is_day,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,dew_point_2m,pressure_msl,visibility,uv_index';
const DAILY = 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max';
const CURRENT = 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,pressure_msl,precipitation';

async function fetchRaw(p) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&timezone=Europe%2FOslo&past_days=1&forecast_days=7&wind_speed_unit=ms`
    + `&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}`;
  return fetchJson(url, { headers: { 'User-Agent': 'homelab-os', Accept: 'application/json' } }, 8000);
}

// Eksempeldata: en høstuke i Oslo med regn i morgen, deterministisk ut fra dato og sted.
export function mockRaw(p, base = new Date()) {
  const n = osloParts(base);
  const day0 = new Date(Date.UTC(+n.year, +n.month - 1, +n.day));
  const iso = (d) => d.toISOString().slice(0, 10);
  const seed = p.lat + p.lon;
  const hourly = { time: [], temperature_2m: [], apparent_temperature: [], weather_code: [], is_day: [], precipitation_probability: [], precipitation: [],
    wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], relative_humidity_2m: [], dew_point_2m: [], pressure_msl: [], visibility: [], uv_index: [] };
  const daily = { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [], precipitation_probability_max: [], precipitation_sum: [], sunrise: [], sunset: [], uv_index_max: [], wind_speed_10m_max: [] };
  const north = (p.lat - 59) / 10;
  for (let d = -1; d < 7; d++) {
    const date = new Date(day0.getTime() + d * 86400000), ds = iso(date);
    const rainy = d === 1 || d === 4 ? 1 : 0, base0 = 7 - north * 6 + Math.sin(d + seed) * 2;
    let hi = -99, lo = 99, sum = 0, pmax = 0;
    for (let h = 0; h < 24; h++) {
      const temp = base0 + 4 * Math.sin(((h - 8) / 24) * 2 * Math.PI) - rainy;
      const mm = rainy && h > 9 && h < 18 ? 0.4 + 0.3 * Math.sin(h) : 0;
      const prob = rainy ? 70 + (h % 3) * 8 : d === 0 && h > 15 ? 25 : 5;
      const dayH = h >= 8 && h < 17;
      hourly.time.push(`${ds}T${String(h).padStart(2, '0')}:00`);
      hourly.temperature_2m.push(r1(temp)); hourly.apparent_temperature.push(r1(temp - 2.5)); hourly.weather_code.push(rainy && mm ? 61 : h % 5 === 0 ? 3 : 2);
      hourly.is_day.push(dayH ? 1 : 0); hourly.precipitation_probability.push(prob); hourly.precipitation.push(r1(mm));
      hourly.wind_speed_10m.push(r1(3 + rainy * 3 + Math.sin(h / 3) * 1.5)); hourly.wind_gusts_10m.push(r1(7 + rainy * 5)); hourly.wind_direction_10m.push(200 + h * 3);
      hourly.relative_humidity_2m.push(70 + rainy * 20); hourly.dew_point_2m.push(r1(temp - 4)); hourly.pressure_msl.push(r1(1012 - rainy * 8 + h * 0.1));
      hourly.visibility.push(rainy ? 12000 : 35000); hourly.uv_index.push(dayH ? r1(1 + Math.sin(((h - 8) / 9) * Math.PI)) : 0);
      hi = Math.max(hi, temp); lo = Math.min(lo, temp); sum += mm; pmax = Math.max(pmax, prob);
    }
    daily.time.push(ds); daily.temperature_2m_max.push(r1(hi)); daily.temperature_2m_min.push(r1(lo)); daily.weather_code.push(rainy ? 63 : 2);
    daily.precipitation_probability_max.push(pmax); daily.precipitation_sum.push(r1(sum));
    daily.sunrise.push(`${ds}T0${8 + Math.round(north)}:0${Math.abs(d) % 10}`); daily.sunset.push(`${ds}T1${7 - Math.round(north)}:4${Math.abs(d) % 10}`);
    daily.uv_index_max.push(2); daily.wind_speed_10m_max.push(rainy ? 9 : 5);
  }
  return { hourly, daily, current: null };
}

/* ---------------- MET (api.met.no) → samme rådataform som Open-Meteo ---------------- */

// MET-symbol → WMO-kode (så klientene har én kodeliste).
export function metToWmo(sym = '') {
  const s = String(sym);
  if (/thunder/.test(s)) return /heavy/.test(s) ? 99 : 95;
  if (/sleet/.test(s)) return /heavy/.test(s) ? 67 : 66;
  if (/snowshowers/.test(s)) return /heavy/.test(s) ? 86 : 85;
  if (/snow/.test(s)) return /heavy/.test(s) ? 75 : /light/.test(s) ? 71 : 73;
  if (/rainshowers/.test(s)) return /heavy/.test(s) ? 82 : /light/.test(s) ? 80 : 81;
  if (/rain/.test(s)) return /heavy/.test(s) ? 65 : /light/.test(s) ? 61 : 63;
  if (/fog/.test(s)) return 45;
  if (/^cloudy/.test(s)) return 3;
  if (/partlycloudy/.test(s)) return 2;
  if (/fair/.test(s)) return 1;
  return 0;
}
const osloLocal = (iso) => { const p = osloParts(new Date(iso)); return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:00`; };

export function metToRaw(met, p) {
  const ts = met?.properties?.timeseries ?? [];
  const hourly = { time: [], temperature_2m: [], apparent_temperature: [], weather_code: [], is_day: [], precipitation_probability: [], precipitation: [],
    wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], relative_humidity_2m: [], dew_point_2m: [], pressure_msl: [], visibility: [], uv_index: [] };
  const byDay = new Map();
  for (const t of ts) {
    const nxt = t.data?.next_1_hours ?? t.data?.next_6_hours;
    if (!t.data?.next_1_hours && hourly.time.length && Date.parse(t.time) - Date.parse(ts[0].time) < 60 * 3600_000) continue; // timesverdier først, 6-timers senere
    const d = t.data?.instant?.details ?? {};
    const sym = nxt?.summary?.symbol_code ?? '';
    const local = osloLocal(t.time), date = local.slice(0, 10);
    const temp = d.air_temperature ?? null, wind = d.wind_speed ?? null;
    const mm = nxt?.details?.precipitation_amount ?? 0;
    const prob = nxt?.details?.probability_of_precipitation ?? (mm > 0 ? 60 : 5);
    const night = /_night/.test(sym) || (!/_day/.test(sym) && !/_polartwilight/.test(sym) && (() => { const h = +local.slice(11, 13); return h < 7 || h > 19; })());
    hourly.time.push(local); hourly.temperature_2m.push(temp); hourly.apparent_temperature.push(temp == null ? null : Math.round(feelsLike(temp, wind ?? 0) * 10) / 10);
    hourly.weather_code.push(metToWmo(sym)); hourly.is_day.push(night ? 0 : 1); hourly.precipitation_probability.push(Math.round(prob)); hourly.precipitation.push(t.data?.next_1_hours ? mm : mm / 6);
    hourly.wind_speed_10m.push(wind); hourly.wind_gusts_10m.push(d.wind_speed_of_gust ?? null); hourly.wind_direction_10m.push(d.wind_from_direction ?? null);
    hourly.relative_humidity_2m.push(d.relative_humidity == null ? null : Math.round(d.relative_humidity)); hourly.dew_point_2m.push(d.dew_point_temperature ?? null);
    hourly.pressure_msl.push(d.air_pressure_at_sea_level ?? null); hourly.visibility.push(d.fog_area_fraction > 50 ? 1000 : null); hourly.uv_index.push(d.ultraviolet_index_clear_sky ?? null);
    const g = byDay.get(date) ?? { hi: -99, lo: 99, sum: 0, prob: 0, uv: 0, wind: 0, codes: {} };
    if (temp != null) { g.hi = Math.max(g.hi, temp); g.lo = Math.min(g.lo, temp); }
    g.sum += t.data?.next_1_hours ? mm : 0; g.prob = Math.max(g.prob, prob); g.uv = Math.max(g.uv, d.ultraviolet_index_clear_sky ?? 0); g.wind = Math.max(g.wind, wind ?? 0);
    const c = metToWmo(sym); const h = +local.slice(11, 13); if (h >= 9 && h <= 18) g.codes[c] = (g.codes[c] ?? 0) + 1;
    if (!t.data?.next_1_hours && t.data?.next_6_hours) g.sum += mm;
    byDay.set(date, g);
  }
  const daily = { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [], precipitation_probability_max: [], precipitation_sum: [], sunrise: [], sunset: [], uv_index_max: [], wind_speed_10m_max: [] };
  for (const [date, g] of byDay) {
    const code = +(Object.entries(g.codes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 2);
    const up = sunTime(date, p.lat, p.lon, -0.833, true), down = sunTime(date, p.lat, p.lon, -0.833, false);
    daily.time.push(date); daily.temperature_2m_max.push(g.hi === -99 ? null : g.hi); daily.temperature_2m_min.push(g.lo === 99 ? null : g.lo);
    daily.weather_code.push(code); daily.precipitation_probability_max.push(Math.round(g.prob)); daily.precipitation_sum.push(Math.round(g.sum * 10) / 10);
    daily.sunrise.push(up ? osloLocalMin(up) : null); daily.sunset.push(down ? osloLocalMin(down) : null); daily.uv_index_max.push(g.uv); daily.wind_speed_10m_max.push(g.wind);
  }
  return { hourly, daily, current: null };
}
const osloLocalMin = (d) => { const p = osloParts(d); return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`; };

// Legger Open-Meteo-data inn der MET mangler: timene før MET starter (i går og i dag tidligere), i går, sikt og UV.
export function mergeRaw(met, om) {
  if (!om?.hourly?.time) return met;
  const H = met.hourly, O = om.hourly;
  const first = H.time[0] ?? '9999';
  const keys = Object.keys(H);
  const pre = O.time.map((t, i) => [t, i]).filter(([t]) => t < first);
  for (const k of keys) H[k] = [...pre.map(([, i]) => O[k]?.[i] ?? null), ...H[k]];
  const idx = new Map(O.time.map((t, i) => [t, i]));
  H.time.forEach((t, i) => { const j = idx.get(t); if (j == null) return; if (H.visibility[i] == null) H.visibility[i] = O.visibility?.[j] ?? null; if (H.uv_index[i] == null) H.uv_index[i] = O.uv_index?.[j] ?? null; });
  const D = met.daily, OD = om.daily ?? {};
  const firstDay = D.time[0] ?? '9999';
  const preD = (OD.time ?? []).map((t, i) => [t, i]).filter(([t]) => t < firstDay);
  for (const k of Object.keys(D)) D[k] = [...preD.map(([, i]) => OD[k]?.[i] ?? null), ...D[k]];
  // Soloppgang fra Open-Meteo er mer presis enn den lokale utregningen når den finnes.
  D.time.forEach((t, i) => { const j = (OD.time ?? []).indexOf(t); if (j >= 0) { D.sunrise[i] = OD.sunrise?.[j] ?? D.sunrise[i]; D.sunset[i] = OD.sunset?.[j] ?? D.sunset[i]; } });
  return met;
}

async function fetchMet(p) {
  return fetchJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${p.lat.toFixed(4)}&lon=${p.lon.toFixed(4)}`,
    { headers: { 'User-Agent': config.metUserAgent, Accept: 'application/json' } }, 8000);
}

/* ---------------- Steder: lagret per bruker, søk via Kartverket (Open-Meteo som reserve) ---------------- */

export const DEFAULT_PLACES = Object.values(PLACES).map((x) => ({ ...x, region: x.id === 'oslo' ? 'Oslo' : x.id === 'bergen' ? 'Vestland' : x.id === 'trondheim' ? 'Trøndelag' : 'Troms' }));
const MOCK_PLACES = [
  { name: 'Lillehammer', region: 'Innlandet', country: 'Norge', lat: 61.1153, lon: 10.4662 }, { name: 'Lillesand', region: 'Agder', country: 'Norge', lat: 58.2496, lon: 8.3779 },
  { name: 'Lillestrøm', region: 'Akershus', country: 'Norge', lat: 59.9560, lon: 11.0500 }, { name: 'Stavanger', region: 'Rogaland', country: 'Norge', lat: 58.9690, lon: 5.7331 },
  { name: 'Kristiansand', region: 'Agder', country: 'Norge', lat: 58.1467, lon: 7.9956 }, { name: 'Bodø', region: 'Nordland', country: 'Norge', lat: 67.2804, lon: 14.4049 },
  { name: 'Ålesund', region: 'Møre og Romsdal', country: 'Norge', lat: 62.4722, lon: 6.1495 }, { name: 'Hemsedal', region: 'Buskerud', country: 'Norge', lat: 60.8636, lon: 8.5527 },
];
export async function searchPlaces(q) {
  const t = String(q ?? '').trim();
  if (t.length < 2) return [];
  if (MOCK) return MOCK_PLACES.filter((x) => x.name.toLowerCase().startsWith(t.toLowerCase()) || x.name.toLowerCase().includes(t.toLowerCase())).slice(0, 8);
  return cached(`wsearch:${t.toLowerCase()}`, 24 * 3600_000, async () => {
    try {
      const d = await fetchJson(`https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(t)}*&fuzzy=true&utkoordsys=4258&treffPerSide=12&side=1`, { headers: { Accept: 'application/json' } }, 6000);
      const seen = new Set(), out = [];
      for (const n of d.navn ?? []) {
        const pt = n.representasjonspunkt ?? {}, name = n.skrivemåte ?? n.stedsnavn?.[0]?.skrivemåte;
        const lat = pt.nord ?? pt['nord'], lon = pt.øst ?? pt['øst'];
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const region = n.kommuner?.[0]?.kommunenavn ?? n.fylker?.[0]?.fylkesnavn ?? '';
        const key = `${name}|${region}`; if (seen.has(key)) continue; seen.add(key);
        out.push({ name, region, country: 'Norge', lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, kind: n.navneobjekttype ?? null });
      }
      if (out.length) return out.slice(0, 10);
    } catch (e) { console.warn('[weather/search] Kartverket:', e.message); }
    const g = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t)}&count=10&language=nb&format=json`, {}, 6000);
    return (g.results ?? []).map((r) => ({ name: r.name, region: r.admin1 ?? '', country: r.country ?? '', lat: r.latitude, lon: r.longitude }));
  });
}

const MOCK = process.env.MOCK_DATA === '1';

/** GET /api/weather/full: ?place=oslo|bergen|trondheim|tromso eller ?lat=&lon=. */
export async function weatherFull({ place, lat, lon, name, source = 'met' } = {}) {
  let p = PLACES[String(place ?? '').toLowerCase()];
  if (!p && Number.isFinite(+lat) && Number.isFinite(+lon) && lat !== '' && lon !== '' && lat != null && lon != null) {
    p = { id: 'pos', name: name || 'Min posisjon', lat: Math.round(+lat * 1e4) / 1e4, lon: Math.round(+lon * 1e4) / 1e4 };
  }
  p ??= PLACES.oslo;
  if (MOCK) return { ...buildFull(mockRaw(p), p), source: 'mock' };
  return cached(`wfull:${source}:${p.lat},${p.lon}`, 10 * 60_000, async () => {
    const [met, om] = await Promise.allSettled([source === 'open-meteo' ? Promise.reject(new Error('av')) : fetchMet(p), fetchRaw(p)]);
    if (met.status === 'fulfilled') {
      try { return { ...buildFull(mergeRaw(metToRaw(met.value, p), om.status === 'fulfilled' ? om.value : null), p), source: om.status === 'fulfilled' ? 'met+open-meteo' : 'met', credit: 'Data fra MET Norge (yr.no)' }; }
      catch (e) { console.warn('[weather/full] MET-tolking:', e.message); }
    } else if (source !== 'open-meteo') console.warn('[weather/full] MET:', met.reason?.message);
    if (om.status === 'fulfilled') return { ...buildFull(om.value, p), source: 'open-meteo', credit: 'Data fra Open-Meteo' };
    return { ...buildFull(mockRaw(p), p), mock: true, source: 'mock', error: 'Fikk ikke kontakt med MET eller Open-Meteo – viser eksempeldata' };
  });
}
