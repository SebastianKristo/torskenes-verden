// Alle kall mot eksterne tjenester. Kjøres kun på serveren; nøkler sendes aldri til nettleseren.
import ical from 'node-ical';
import { Agent } from 'undici';
import { config } from './config.js';
import { cached, fetchJson } from './cache.js';
import { cfg, parseRoutes } from './settings.js';

/* ---------------- Ruter / Entur ---------------- */

// Kjente koordinater gjør lenken til reise.ruter.no mer presis; andre stopp fungerer uten.
const COORDS = { 58381: [10.71634, 59.929213], 6354: [10.660875, 59.952497], 6258: [10.733173, 59.920864], 63280: [10.7355, 59.91795] };

export function ruterUrl(r) {
  const part = (p, id, name) => {
    const c = COORDS[id];
    return `${p}Id=__NSR-StopPlace-${id}__&${p}Type=__STOP_PLACE__&${p}Name=__${encodeURIComponent(name)}__${c ? `&${p}Longitude=${c[0]}&${p}Latitude=${c[1]}` : ''}`;
  };
  return `https://reise.ruter.no/?${part('from', r.fromId, r.fromName)}&${part('to', r.toId, r.toName)}`;
}

const TRIP_QUERY = `query($from:String!,$to:String!,$n:Int!){
  trip(from:{place:$from},to:{place:$to},numTripPatterns:$n,modes:{accessMode:foot,egressMode:foot}){
    tripPatterns{ legs{ mode expectedStartTime fromPlace{name} line{publicCode transportMode} } }
  }
}`;

async function enturTrip(r, count) {
  const data = await fetchJson('https://api.entur.io/journey-planner/v3/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ET-Client-Name': config.enturClient },
    body: JSON.stringify({ query: TRIP_QUERY, variables: { from: `NSR:StopPlace:${r.fromId}`, to: `NSR:StopPlace:${r.toId}`, n: count * 2 } }),
  });
  const deps = [];
  for (const p of data.data?.trip?.tripPatterns ?? []) {
    const leg = p.legs.find((l) => l.line);
    if (!leg) continue;
    deps.push({ line: leg.line.publicCode, mode: leg.line.transportMode || leg.mode, time: leg.expectedStartTime });
  }
  // Fjern duplikater og behold de første.
  const seen = new Set();
  return deps.filter((d) => !seen.has(d.line + d.time) && seen.add(d.line + d.time))
    .sort((a, b) => a.time.localeCompare(b.time)).slice(0, count);
}

export const getRuter = () => cached('ruter', 30_000, async () => {
  const count = Math.min(10, Math.max(1, parseInt(cfg('ruter_count'), 10) || 3));
  const trips = await Promise.all(parseRoutes(cfg('ruter_routes')).map(async (r) => {
    let deps = [], error = null;
    try { deps = await enturTrip(r, count); } catch (e) { error = e.message; }
    return { from: r.fromName, to: r.toName, url: ruterUrl(r), deps, error };
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
  const lat = parseFloat(cfg('wx_lat')) || 59.9139, lon = parseFloat(cfg('wx_lon')) || 10.7522, name = cfg('wx_place');
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
  const icalUrl = cfg('cal_ics');
  if (!icalUrl) return { configured: false, events: [] };
  const res = await fetch(icalUrl, { signal: AbortSignal.timeout(15_000) });
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
  return { configured: true, events, mazemapCampusId: cfg('cal_mazemap') };
});

/* ---------------- Trading 212 ---------------- */

export const getTrading = () => cached('t212', 60_000, async () => {
  const key = cfg('t212_key');
  if (!key) return { configured: false };
  const h = { headers: { Authorization: key } };
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
  return fetchJson(`${cfg('ha_url').replace(/\/$/, '')}${path}`, { headers: { Authorization: `Bearer ${cfg('ha_token')}` } });
}

export const getEnergy = () => cached('energy', 60_000, async () => {
  if (!cfg('ha_url') || !cfg('ha_token')) return { configured: false };
  const num = (s) => { const v = parseFloat(s?.state); return Number.isFinite(v) ? v : null; };
  const [power, price] = await Promise.all([ha(`/api/states/${cfg('ha_sensor_power')}`), ha(`/api/states/${cfg('ha_sensor_price')}`).catch(() => null)]);
  let kw = num(power);
  if (kw !== null && /^W$/i.test(power.attributes?.unit_of_measurement ?? '')) kw /= 1000;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  const hist = await ha(`/api/history/period/${start.toISOString()}?filter_entity_id=${cfg('ha_sensor_energy')}&minimal_response&no_attributes`).catch(() => [[]]);
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
  const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(cfg('sat_group'))}&FORMAT=tle`, {
    headers: { 'User-Agent': config.metUserAgent }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`CelesTrak svarte ${res.status}`);
  const text = await res.text();
  if (!/^1 /m.test(text)) throw new Error('Uventet svar fra CelesTrak');
  return { text, fetched: new Date().toISOString() };
});

export const getApod = () => cached('apod', 3 * 3600_000, () =>
  fetchJson(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(cfg('nasa_key') || 'DEMO_KEY')}&thumbs=true`));

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
  const list = config.services.map(([n, u]) => [n, n === 'Home Assistant' ? cfg('ha_url') : u]);
  for (const [n, k] of [['Sonarr', 'sonarr'], ['Radarr', 'radarr']]) if (cfg(k + '_key')) list.push([n, cfg(k + '_url')]);
  const services = await Promise.all(list.filter(([, u]) => u).map(async ([name, url]) => {
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

/* ---------------- Sonarr / Radarr ---------------- */

const poster = (images = []) => {
  const p = images.find((i) => i.coverType === 'poster');
  return p?.remoteUrl || null;
};
const arrRange = (days) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + Math.min(365, Math.max(1, parseInt(days, 10) || 14)) * 86400_000);
  return `start=${start.toISOString()}&end=${end.toISOString()}`;
};

async function sonarr() {
  const url = cfg('sonarr_url').replace(/\/$/, ''), key = cfg('sonarr_key');
  if (!url || !key) return { configured: false, items: [] };
  const eps = await fetchJson(`${url}/api/v3/calendar?${arrRange(cfg('sonarr_days'))}&includeSeries=true&unmonitored=false`, { headers: { 'X-Api-Key': key } });
  return { configured: true, url: `${url}/calendar`, items: eps.map((e) => ({
    kind: 'tv', title: e.series?.title ?? e.title, sub: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} · ${e.title ?? ''}`.replace(/ · $/, ''),
    date: e.airDateUtc ?? e.airDate, img: poster(e.series?.images), status: e.hasFile ? 'lastet ned' : 'kommer',
    overview: e.overview ?? e.series?.overview ?? '', network: e.series?.network ?? '',
    url: e.series?.titleSlug ? `${url}/series/${e.series.titleSlug}` : `${url}/calendar`,
  })) };
}

async function radarr() {
  const url = cfg('radarr_url').replace(/\/$/, ''), key = cfg('radarr_key');
  if (!url || !key) return { configured: false, items: [] };
  const movies = await fetchJson(`${url}/api/v3/calendar?${arrRange(cfg('radarr_days'))}&unmonitored=false`, { headers: { 'X-Api-Key': key } });
  const now = Date.now(), start = new Date().setHours(0, 0, 0, 0);
  return { configured: true, url: `${url}/calendar`, items: movies.map((m) => {
    // Velg den neste relevante utgivelsen i perioden.
    const rel = [['kino', m.inCinemas], ['digital', m.digitalRelease], ['fysisk', m.physicalRelease]]
      .filter(([, d]) => d && new Date(d) >= start).sort((a, b) => a[1].localeCompare(b[1]))[0];
    return { kind: 'movie', title: m.title, sub: `${rel?.[0] ?? 'overvåkes'}${m.year ? ` · ${m.year}` : ''}`, date: rel?.[1] ?? null,
      img: poster(m.images), status: m.hasFile ? 'lastet ned' : rel ? rel[0] : 'overvåkes', overview: m.overview ?? '',
      url: m.titleSlug ? `${url}/movie/${m.titleSlug}` : `${url}/calendar`, future: rel ? new Date(rel[1]) > now : false };
  }) };
}

export const getUpcoming = () => cached('upcoming', 10 * 60_000, async () => {
  const [tv, movies] = await Promise.all([sonarr().catch((e) => ({ configured: true, error: e.message, items: [] })), radarr().catch((e) => ({ configured: true, error: e.message, items: [] }))]);
  const byDate = (a, b) => String(a.date ?? '9').localeCompare(String(b.date ?? '9'));
  tv.items.sort(byDate); movies.items.sort(byDate);
  return { tv, movies };
});

/* ---------------- Nyheter (RSS) ---------------- */

const FEEDS = [['NRK', 'https://www.nrk.no/toppsaker.rss', '#0b4ea2'], ['VG', 'https://www.vg.no/rss/feed/', '#c8102e']];
const decode = (t = '') => t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);

async function feed([src, url, color]) {
  const res = await fetch(url, { headers: { 'User-Agent': config.metUserAgent }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${src} svarte ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].slice(0, 15).map(([it]) => {
    const link = tag(it, 'link');
    return { src, color, title: tag(it, 'title'), url: /^https?:\/\//.test(link) ? link : null, date: new Date(tag(it, 'pubDate') || Date.now()).toISOString() };
  }).filter((n) => n.title && n.url);
}

export const getNews = () => cached('news', 5 * 60_000, async () => {
  const results = await Promise.allSettled(FEEDS.map(feed));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (!items.length) throw new Error('Fikk ikke hentet nyheter fra NRK eller VG');
  return { items: items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 24) };
});
