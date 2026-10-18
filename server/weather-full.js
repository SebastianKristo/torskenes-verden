// Værappen i mobilappene (prompt 15, design/Vaer.dc.html): Open-Meteo forecast med past_days=1, cachet i 10 minutter.
// Uten nett eller med MOCK_DATA=1 gis realistiske eksempeldata. Månefasen regnes lokalt.
import { cached, fetchJson } from './cache.js';

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

const MOCK = process.env.MOCK_DATA === '1';

/** GET /api/weather/full: ?place=oslo|bergen|trondheim|tromso eller ?lat=&lon=. */
export async function weatherFull({ place, lat, lon, name } = {}) {
  let p = PLACES[String(place ?? '').toLowerCase()];
  if (!p && Number.isFinite(+lat) && Number.isFinite(+lon) && lat !== '' && lon !== '' && lat != null && lon != null) {
    p = { id: 'pos', name: name || 'Min posisjon', lat: Math.round(+lat * 1e4) / 1e4, lon: Math.round(+lon * 1e4) / 1e4 };
  }
  p ??= PLACES.oslo;
  if (MOCK) return buildFull(mockRaw(p), p);
  return cached(`wfull:${p.lat},${p.lon}`, 10 * 60_000, async () => {
    try { return buildFull(await fetchRaw(p), p); }
    catch (e) { console.warn('[weather/full]', e.message); return { ...buildFull(mockRaw(p), p), mock: true, error: 'Fikk ikke kontakt med Open-Meteo – viser eksempeldata' }; }
  });
}
