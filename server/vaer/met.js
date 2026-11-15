// Værmelding fra MET (yr): Locationforecast «complete» + Nowcast + Sunrise.
// buildWeather() er ren (ingen nettverk) slik at den kan testes med lagrede svar.
const TZ = 'Europe/Oslo';

const SYMBOL_NB = [
  [/thunder/, 'Torden'], [/heavysnow/, 'Kraftig snø'], [/lightsnow/, 'Lett snø'], [/snow/, 'Snø'],
  [/sleet/, 'Sludd'], [/heavyrain/, 'Kraftig regn'], [/lightrain/, 'Lett regn'], [/rain/, 'Regn'],
  [/fog/, 'Tåke'], [/partlycloudy/, 'Delvis skyet'], [/fair/, 'Lettskyet'], [/cloudy/, 'Skyet'], [/clearsky/, 'Klarvær'],
];
export const symbolText = (s = '') => SYMBOL_NB.find(([re]) => re.test(s))?.[1] ?? '–';
export const symbolKind = (s = '') => /rain|sleet|snow|thunder/.test(s) ? 'regn' : /cloudy|fog/.test(s) && !/partly/.test(s) ? 'sky' : 'sol';
// Ikon-nøkkel som klientene tegner (sun, moon, part, cloud, rain, snow, thunder, fog).
export function symbolIcon(s = '') {
  if (/thunder/.test(s)) return 'thunder';
  if (/snow|sleet/.test(s)) return 'snow';
  if (/rain/.test(s)) return 'rain';
  if (/fog/.test(s)) return 'fog';
  if (/^cloudy/.test(s)) return 'cloud';
  if (/clearsky_night|fair_night/.test(s)) return 'moon';
  if (/clearsky/.test(s)) return 'sun';
  if (/fair|partlycloudy/.test(s)) return 'part';
  return 'cloud';
}

// «Føles som» med vindavkjøling (gyldig under 10 °C og over 1,3 m/s).
export const feelsLike = (t, v) => (t <= 10 && v > 1.3) ? 13.12 + 0.6215 * t - 11.37 * (v * 3.6) ** 0.16 + 0.3965 * t * (v * 3.6) ** 0.16 : t;

const DIRS = ['Nord', 'Nordøst', 'Øst', 'Sørøst', 'Sør', 'Sørvest', 'Vest', 'Nordvest'];
export const windDirText = (deg) => (Number.isFinite(deg) ? DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8] : '');
export const uvText = (uv) => (uv == null ? '' : uv < 3 ? 'Lav' : uv < 6 ? 'Moderat' : uv < 8 ? 'Høy' : uv < 11 ? 'Svært høy' : 'Ekstrem');

const localDate = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ });
const localHM = (d) => new Date(d).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const localH = (d) => new Date(d).toLocaleTimeString('nb-NO', { hour: '2-digit', timeZone: TZ });
const r1 = (x) => Math.round(x * 10) / 10;
const dayLabel = (iso, i) => (i === 0 ? 'I dag' : new Date(iso + 'T12:00:00Z').toLocaleDateString('nb-NO', { weekday: 'short', timeZone: 'UTC' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()));

// UTC-forskjell for Oslo på en gitt dato, som «+02:00».
export function osloOffset(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).formatToParts(date);
  const m = (parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1').match(/GMT([+-]\d+)(?::(\d+))?/);
  const h = m ? +m[1] : 1;
  return `${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:${m?.[2] ?? '00'}`;
}

// Sol opp/ned lokalt (NOAA-forenklet) – reserve når Sunrise-API-et ikke svarer, og for skumring (-6°).
export function sunTime(dateIso, lat, lon, altitude, rising) {
  const rad = Math.PI / 180, d0 = new Date(dateIso + 'T12:00:00Z');
  const n = Math.round((d0 - Date.UTC(2000, 0, 1, 12)) / 86400000);
  const Jstar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jtransit = 2451545 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const decl = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad));
  const cosH = (Math.sin(altitude * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH < -1 || cosH > 1) return null; // midnattssol eller mørketid
  const H = Math.acos(cosH) / rad;
  const J = Jtransit + (rising ? -H : H) / 360;
  return new Date((J - 2440587.5) * 86400000);
}

// Kort setning ut fra Nowcast (5-minutters nedbør de neste 90 min), eller fra timene som reserve.
export function nowcastText(nowcast, hours, temp) {
  const word = temp != null && temp <= 0 ? 'Snøen' : 'Regnet';
  const noun = temp != null && temp <= 0 ? 'Snø' : 'Regn';
  const ts = nowcast?.properties?.timeseries;
  if (Array.isArray(ts) && ts.length) {
    const pts = ts.slice(0, 19).map((t) => ({ t: t.time, r: t.data?.instant?.details?.precipitation_rate ?? 0 }));
    const wet = pts[0].r > 0.1;
    const change = pts.findIndex((p) => (wet ? p.r <= 0.1 : p.r > 0.1));
    if (wet) return change > 0 ? `${word} gir seg rundt ${localHM(pts[change].t)}.` : `${noun} de neste 90 minuttene.`;
    return change > 0 ? `${noun} fra rundt ${localHM(pts[change].t)}.` : 'Opphold de neste 90 minuttene.';
  }
  if (!hours?.length) return '';
  const wet = hours[0].mm > 0;
  const i = hours.findIndex((h) => (wet ? h.mm === 0 : h.mm > 0));
  if (wet) return i > 0 ? `${word} gir seg rundt ${hours[i].t}:00.` : `${noun} de neste timene.`;
  return i > 0 ? `${noun} fra rundt ${hours[i].t}:00.` : 'Opphold de neste timene.';
}

export function buildWeather({ forecast, nowcast = null, sun = null, place = '', lat = 59.9139, lon = 10.7522, now = Date.now() }) {
  const ts = forecast.properties.timeseries;
  const nowIdx = Math.max(0, ts.findIndex((t) => new Date(t.time) > now - 3600_000));
  const cur = ts[nowIdx];
  const inst = cur.data.instant.details;
  const n1 = cur.data.next_1_hours, n6 = cur.data.next_6_hours;
  const symbol = n1?.summary.symbol_code ?? n6?.summary.symbol_code ?? '';

  // 8 timer fra nå.
  const hours = ts.slice(nowIdx, nowIdx + 8).map((t, i) => {
    const s = t.data.next_1_hours?.summary.symbol_code ?? t.data.next_6_hours?.summary.symbol_code ?? '';
    const mm = t.data.next_1_hours?.details.precipitation_amount ?? 0;
    const label = i === 0 ? 'Nå' : localH(t.time);
    return { time: t.time, t: i === 0 ? 'Nå' : label, label, temp: Math.round(t.data.instant.details.air_temperature), precip: mm, mm, symbol: s, icon: symbolIcon(s) };
  });

  // Nedbørssum uten dobbelttelling: neste 1 t der det finnes, ellers neste 6 t.
  const steps = [];
  let covered = 0;
  for (const t of ts.slice(nowIdx)) {
    const at = +new Date(t.time);
    if (at < covered) continue;
    const a = t.data.next_1_hours?.details.precipitation_amount, b = t.data.next_6_hours?.details.precipitation_amount;
    if (a != null) { steps.push({ at, mm: a }); covered = at + 3600_000; } else if (b != null) { steps.push({ at, mm: b }); covered = at + 6 * 3600_000; }
  }
  const sumMm = (from, to) => r1(steps.filter((s) => s.at >= from && s.at < to).reduce((x, s) => x + s.mm, 0));

  // 6 dager fra og med i dag.
  const byDay = new Map();
  for (const t of ts.slice(nowIdx)) {
    const day = localDate(t.time), temp = t.data.instant.details.air_temperature;
    const e = byDay.get(day) ?? { date: day, min: temp, max: temp, syms: [], noon: null };
    e.min = Math.min(e.min, temp); e.max = Math.max(e.max, temp);
    const s = t.data.next_6_hours?.summary.symbol_code ?? t.data.next_1_hours?.summary.symbol_code;
    if (s) e.syms.push(s);
    const h = +new Date(t.time).toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ });
    if (s && h >= 10 && h <= 14 && !e.noon) e.noon = s;
    byDay.set(day, e);
  }
  const mmByDay = new Map();
  for (const s of steps) { const d = localDate(s.at); mmByDay.set(d, r1((mmByDay.get(d) ?? 0) + s.mm)); }
  const days = [...byDay.values()].slice(0, 6).map((e, i) => {
    const counts = e.syms.reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map());
    const s = e.noon ?? [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return { date: e.date, label: dayLabel(e.date, i), symbol: s, icon: symbolIcon(s), min: Math.round(e.min), max: Math.round(e.max), mm: mmByDay.get(e.date) ?? 0 };
  });

  // Lufttrykk om 3 timer gir trenden.
  const p0 = inst.air_pressure_at_sea_level, p3 = ts[nowIdx + 3]?.data.instant.details.air_pressure_at_sea_level;
  const pressureTrend = p0 == null || p3 == null ? '' : p3 - p0 > 1 ? 'Stigende' : p3 - p0 < -1 ? 'Synkende' : 'Stabil';
  const fog = inst.fog_area_fraction;
  const visibility = fog == null ? null : fog > 50 ? 'Dårlig (tåke)' : fog > 10 ? 'Moderat' : 'God';

  // Sol: MET Sunrise hvis det svarte, ellers lokal beregning. Skumring (-6°) regnes alltid lokalt.
  const today = localDate(now);
  const sunrise = sun?.properties?.sunrise?.time ?? sunTime(today, lat, lon, -0.833, true)?.toISOString() ?? null;
  const sunset = sun?.properties?.sunset?.time ?? sunTime(today, lat, lon, -0.833, false)?.toISOString() ?? null;
  const dusk = sunTime(today, lat, lon, -6, false);
  const dayMin = sunrise && sunset ? Math.round((new Date(sunset) - new Date(sunrise)) / 60000) : null;

  const wind = Math.round(inst.wind_speed);
  const gust = inst.wind_speed_of_gust != null ? Math.round(inst.wind_speed_of_gust) : null;
  const dir = inst.wind_from_direction ?? null;
  const uv = inst.ultraviolet_index_clear_sky != null ? Math.round(inst.ultraviolet_index_clear_sky) : null;
  const temp = Math.round(inst.air_temperature);
  return {
    place, temp, feels: Math.round(feelsLike(inst.air_temperature, inst.wind_speed)),
    hi: days[0]?.max ?? temp, lo: days[0]?.min ?? temp,
    // «wind» er fortsatt et tall (m/s) for eldre klienter; detaljene ligger i windInfo/windGust/windDir.
    wind, windGust: gust, windDir: dir, windDirText: windDirText(dir), windInfo: { speed: wind, gust, dir, dirText: windDirText(dir) },
    precip: n1?.details.precipitation_amount ?? 0, precipNow: n1?.details.precipitation_amount ?? 0, precip24: sumMm(now, now + 24 * 3600_000),
    humidity: inst.relative_humidity != null ? Math.round(inst.relative_humidity) : null,
    dew: inst.dew_point_temperature != null ? Math.round(inst.dew_point_temperature) : null,
    uv, uvText: uvText(uv),
    pressure: p0 != null ? Math.round(p0) : null, pressureTrend,
    visibility, cloud: inst.cloud_area_fraction != null ? Math.round(inst.cloud_area_fraction) : null,
    sunrise, sunset, dusk: dusk?.toISOString() ?? null, dayLength: dayMin, dayLengthText: dayMin == null ? '' : `${Math.floor(dayMin / 60)} t ${dayMin % 60} m`,
    nowcast: { text: nowcastText(nowcast, hours, inst.air_temperature), radar: !!nowcast },
    symbol, icon: symbolIcon(symbol), text: symbolText(symbol), kind: symbolKind(symbol),
    hours, days, updated: forecast.properties.meta?.updated_at ?? null,
  };
}

export async function fetchWeather({ lat, lon, place, userAgent }) {
  const q = `lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' };
  const get = async (url) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${new URL(url).host} svarte ${res.status}`);
    return res.json();
  };
  const today = localDate(Date.now());
  const [fc, nc, sn] = await Promise.allSettled([
    get(`https://api.met.no/weatherapi/locationforecast/2.0/complete?${q}`),
    get(`https://api.met.no/weatherapi/nowcast/2.0/complete?${q}`),
    get(`https://api.met.no/weatherapi/sunrise/3.0/sun?${q}&date=${today}&offset=${encodeURIComponent(osloOffset())}`),
  ]);
  if (fc.status !== 'fulfilled') throw fc.reason;
  return buildWeather({ forecast: fc.value, nowcast: nc.status === 'fulfilled' ? nc.value : null, sun: sn.status === 'fulfilled' ? sn.value : null, place, lat, lon });
}
