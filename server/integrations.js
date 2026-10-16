// Alle kall mot eksterne tjenester. Kjøres kun på serveren; nøkler sendes aldri til nettleseren.
import ical from 'node-ical';
import { Agent } from 'undici';
import { config } from './config.js';
import { cached, fetchJson } from './cache.js';

/* ---------------- Ruter / Entur ---------------- */

export const STOPS = {
  Majorstuen: { id: '58381', lon: 10.71634, lat: 59.929213 },
  Amagerveien: { id: '6354', lon: 10.660875, lat: 59.952497 },
  Frydenlund: { id: '6258', lon: 10.733173, lat: 59.920864 },
  'Holbergs plass': { id: '63280', lon: 10.7355, lat: 59.91795 },
};

export const ROUTES = process.env.RUTER_ROUTES
  ? JSON.parse(process.env.RUTER_ROUTES)
  : [['Amagerveien', 'Majorstuen'], ['Frydenlund', 'Majorstuen'], ['Majorstuen', 'Amagerveien'], ['Majorstuen', 'Holbergs plass']];

export function ruterUrl(from, to) {
  const part = (p, name) => {
    const s = STOPS[name];
    return `${p}Id=__NSR-StopPlace-${s.id}__&${p}Type=__STOP_PLACE__&${p}Name=__${encodeURIComponent(name)}__&${p}Longitude=${s.lon}&${p}Latitude=${s.lat}`;
  };
  return `https://reise.ruter.no/?${part('from', from)}&${part('to', to)}`;
}

const TRIP_QUERY = `query($from:String!,$to:String!){
  trip(from:{place:$from},to:{place:$to},numTripPatterns:6,modes:{accessMode:foot,egressMode:foot}){
    tripPatterns{ legs{ mode expectedStartTime fromPlace{name} line{publicCode transportMode} } }
  }
}`;

async function enturTrip(from, to) {
  const data = await fetchJson('https://api.entur.io/journey-planner/v3/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ET-Client-Name': config.enturClient },
    body: JSON.stringify({ query: TRIP_QUERY, variables: { from: `NSR:StopPlace:${STOPS[from].id}`, to: `NSR:StopPlace:${STOPS[to].id}` } }),
  });
  const deps = [];
  for (const p of data.data?.trip?.tripPatterns ?? []) {
    const leg = p.legs.find((l) => l.line);
    if (!leg) continue;
    deps.push({ line: leg.line.publicCode, mode: leg.line.transportMode || leg.mode, time: leg.expectedStartTime });
  }
  // Fjern duplikater og behold de tre første.
  const seen = new Set();
  return deps.filter((d) => !seen.has(d.line + d.time) && seen.add(d.line + d.time))
    .sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3);
}

export const getRuter = () => cached('ruter', 30_000, async () => {
  const trips = await Promise.all(ROUTES.map(async ([from, to]) => {
    let deps = [], error = null;
    try { deps = await enturTrip(from, to); } catch (e) { error = e.message; }
    return { from, to, url: ruterUrl(from, to), deps, error };
  }));
  return { trips, updated: new Date().toISOString() };
});

/* ---------------- Vær / MET ---------------- */

const SYMBOL_NB = [
  [/thunder/, 'Torden'], [/heavysnow/, 'Kraftig snø'], [/lightsnow/, 'Lett snø'], [/snow/, 'Snø'],
  [/sleet/, 'Sludd'], [/heavyrain/, 'Kraftig regn'], [/lightrain/, 'Lett regn'], [/rain/, 'Regn'],
  [/fog/, 'Tåke'], [/partlycloudy/, 'Delvis skyet'], [/fair/, 'Lettskyet'], [/cloudy/, 'Skyet'], [/clearsky/, 'Klarvær'],
];
const symbolText = (s = '') => SYMBOL_NB.find(([re]) => re.test(s))?.[1] ?? '–';
const symbolKind = (s = '') => /rain|sleet|snow|thunder/.test(s) ? 'regn' : /cloudy|fog/.test(s) && !/partly/.test(s) ? 'sky' : 'sol';

// «Føles som» med vindavkjøling (gyldig under 10 °C og over 1,3 m/s).
const feelsLike = (t, v) => (t <= 10 && v > 1.3) ? 13.12 + 0.6215 * t - 11.37 * (v * 3.6) ** 0.16 + 0.3965 * t * (v * 3.6) ** 0.16 : t;

export const getWeather = () => cached('weather', 15 * 60_000, async () => {
  const { lat, lon, name } = config.location;
  const d = await fetchJson(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
    { headers: { 'User-Agent': config.metUserAgent } });
  const ts = d.properties.timeseries;
  const nowIdx = Math.max(0, ts.findIndex((t) => new Date(t.time) > Date.now() - 3600_000));
  const now = ts[nowIdx];
  const inst = now.data.instant.details;
  const next1 = now.data.next_1_hours;
  const symbol = next1?.summary.symbol_code ?? now.data.next_6_hours?.summary.symbol_code;
  const hours = ts.slice(nowIdx, nowIdx + 6).map((t, i) => ({
    time: t.time, label: i === 0 ? 'Nå' : new Date(t.time).toLocaleTimeString('nb-NO', { hour: '2-digit', timeZone: 'Europe/Oslo' }),
    temp: Math.round(t.data.instant.details.air_temperature), precip: t.data.next_1_hours?.details.precipitation_amount ?? 0,
    symbol: t.data.next_1_hours?.summary.symbol_code,
  }));
  const byDay = new Map();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  for (const t of ts) {
    const day = new Date(t.time).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
    if (day <= today) continue;
    const temp = t.data.instant.details.air_temperature;
    const e = byDay.get(day) ?? { day, min: temp, max: temp };
    e.min = Math.min(e.min, temp); e.max = Math.max(e.max, temp);
    byDay.set(day, e);
  }
  const days = [...byDay.values()].slice(0, 4).map((e) => ({
    label: new Date(e.day + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()),
    max: Math.round(e.max), min: Math.round(e.min),
  }));
  return {
    place: name, temp: Math.round(inst.air_temperature), feels: Math.round(feelsLike(inst.air_temperature, inst.wind_speed)),
    wind: Math.round(inst.wind_speed), precip: next1?.details.precipitation_amount ?? 0,
    symbol, text: symbolText(symbol), kind: symbolKind(symbol), hours, days, updated: d.properties.meta.updated_at,
  };
});

/* ---------------- Skole / iCal ---------------- */

const SUBJECT_COLORS = ['#9fb4ff', '#f3d38a', '#8fe0b0', '#e8a6d8', '#a8d4fb', '#f59a8f'];
function colorFor(title = '') {
  if (/frist|innlever|deadline/i.test(title)) return '#f59a8f';
  let h = 0; for (const ch of title.replace(/\s*[-–·].*$/, '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length];
}

function expand(ev, from, to) {
  const dur = (ev.end ? ev.end - ev.start : 3600_000);
  if (!ev.rrule) return ev.start < to && ev.start.getTime() + dur > from ? [ev.start] : [];
  const ex = new Set(Object.values(ev.exdate ?? {}).map((d) => new Date(d).getTime()));
  return ev.rrule.between(new Date(from.getTime() - dur), to, true).filter((d) => !ex.has(d.getTime()));
}

export const getSchool = () => cached('school', 15 * 60_000, async () => {
  if (!config.icalUrl) return { configured: false, events: [] };
  const res = await fetch(config.icalUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`iCal svarte ${res.status}`);
  const parsed = ical.sync.parseICS(await res.text());
  const from = new Date(Date.now() - 45 * 86400_000), to = new Date(Date.now() + 75 * 86400_000);
  const events = [];
  for (const ev of Object.values(parsed)) {
    if (ev.type !== 'VEVENT' || !ev.start) continue;
    const dur = ev.end ? ev.end - ev.start : 0;
    const allDay = ev.datetype === 'date';
    const overrides = ev.recurrences ?? {};
    for (const start of expand(ev, from, to)) {
      const key = start.toISOString().slice(0, 10);
      const o = overrides[key];
      const e = o ?? ev;
      const s = o ? o.start : start;
      const title = String(e.summary?.val ?? e.summary ?? '(uten tittel)');
      events.push({
        title, location: String(e.location?.val ?? e.location ?? ''), start: s.toISOString(),
        end: new Date(s.getTime() + (o?.end ? o.end - o.start : dur)).toISOString(), allDay, color: colorFor(title),
        deadline: /frist|innlever|deadline|due/i.test(title) || (!allDay && dur === 0),
      });
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { configured: true, events, mazemapCampusId: config.mazemapCampusId };
});

/* ---------------- Trading 212 ---------------- */

export const getTrading = () => cached('t212', 60_000, async () => {
  if (!config.trading212Key) return { configured: false };
  const h = { headers: { Authorization: config.trading212Key } };
  // Hent sekvensielt: Trading 212 har strenge rate limits per endepunkt.
  const cash = await fetchJson(`${config.trading212Base}/api/v0/equity/account/cash`, h);
  const portfolio = await fetchJson(`${config.trading212Base}/api/v0/equity/portfolio`, h);
  let currency = 'NOK';
  try { currency = (await cached('t212info', 24 * 3600_000, () => fetchJson(`${config.trading212Base}/api/v0/equity/account/info`, h))).currencyCode || currency; } catch {}
  const positions = portfolio.map((p) => {
    const value = p.quantity * p.currentPrice;
    const cost = p.quantity * p.averagePrice;
    return { ticker: p.ticker.replace(/_[A-Z]{2}_EQ$|_EQ$/, '').replace(/l$/, ''), value, ppl: p.ppl + (p.fxPpl ?? 0), pct: cost ? (p.ppl / cost) * 100 : 0 };
  }).sort((a, b) => b.value - a.value);
  // Verdier fra /portfolio er i instrumentets valuta; totalsummen fra /cash er i kontovaluta.
  return { configured: true, currency, total: cash.total, ppl: cash.ppl, invested: cash.invested, free: cash.free,
    pplPct: cash.invested ? (cash.ppl / cash.invested) * 100 : 0, positions: positions.slice(0, 6) };
});

/* ---------------- Home Assistant ---------------- */

async function ha(path) {
  return fetchJson(`${config.ha.url}${path}`, { headers: { Authorization: `Bearer ${config.ha.token}` } });
}

export const getEnergy = () => cached('energy', 60_000, async () => {
  if (!config.ha.url || !config.ha.token) return { configured: false };
  const num = (s) => { const v = parseFloat(s?.state); return Number.isFinite(v) ? v : null; };
  const [power, price] = await Promise.all([ha(`/api/states/${config.ha.power}`), ha(`/api/states/${config.ha.price}`).catch(() => null)]);
  let kw = num(power);
  if (kw !== null && /^W$/i.test(power.attributes?.unit_of_measurement ?? '')) kw /= 1000;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  const hist = await ha(`/api/history/period/${start.toISOString()}?filter_entity_id=${config.ha.energyDaily}&minimal_response&no_attributes`).catch(() => [[]]);
  // Sensoren nullstilles hver dag: høyeste verdi per dag = dagens forbruk.
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    days.push({ date: d.toLocaleDateString('sv-SE'), label: d.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()), kwh: 0 });
  }
  for (const s of hist[0] ?? []) {
    const v = parseFloat(s.state); if (!Number.isFinite(v)) continue;
    const key = new Date(s.last_changed ?? s.last_updated).toLocaleDateString('sv-SE');
    const day = days.find((d) => d.date === key);
    if (day) day.kwh = Math.max(day.kwh, v);
  }
  return { configured: true, kw, price: num(price), priceUnit: price?.attributes?.unit_of_measurement ?? 'kr/kWh',
    week: days.reduce((a, d) => a + d.kwh, 0), days };
});

/* ---------------- Rom ---------------- */

export const getTle = () => cached('tle', 6 * 3600_000, async () => {
  const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle', {
    headers: { 'User-Agent': config.metUserAgent }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`CelesTrak svarte ${res.status}`);
  const text = await res.text();
  if (!/^1 /m.test(text)) throw new Error('Uventet svar fra CelesTrak');
  return { text, fetched: new Date().toISOString() };
});

export const getApod = () => cached('apod', 3 * 3600_000, () =>
  fetchJson(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(config.nasaKey)}&thumbs=true`));

export const GALLERIES = { mars: 'perseverance mars surface', webb: 'james webb space telescope', hubble: 'hubble galaxy' };
export const getGallery = (key) => cached('gal_' + key, 12 * 3600_000, async () => {
  const d = await fetchJson(`https://images-api.nasa.gov/search?media_type=image&q=${encodeURIComponent(GALLERIES[key])}`);
  return { items: d.collection.items.filter((i) => i.links?.[0]?.href).slice(0, 10).map((i) => ({
    img: i.links[0].href, title: i.data[0].title, date: (i.data[0].date_created || '').slice(0, 10),
    url: `https://images.nasa.gov/details/${encodeURIComponent(i.data[0].nasa_id)}` })) };
});

/* ---------------- Helsesjekk ---------------- */

// Proxmox o.l. bruker selvsignerte sertifikater på LAN; godta dem kun for helsesjekken.
const insecure = new Agent({ connect: { rejectUnauthorized: false } });

export const getHealth = () => cached('health', 30_000, async () => {
  const services = await Promise.all(config.services.map(async ([name, url]) => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'manual', dispatcher: insecure, signal: AbortSignal.timeout(4000) });
      res.body?.cancel();
      // Ethvert HTTP-svar (også 401/403) betyr at tjenesten lever.
      return { name, url, host: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), up: res.status < 500, status: res.status, ms: Date.now() - t0 };
    } catch (e) {
      return { name, url, host: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), up: false, error: e.cause?.code || e.name };
    }
  }));
  return { services, checked: new Date().toISOString() };
});
