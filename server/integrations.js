// Alle kall mot eksterne tjenester. Kjøres kun på serveren; nøkler sendes aldri til nettleseren.
import { t212Creds, t212AuthHeader } from './finans/stocks.js';
import ical from 'node-ical';
// undici sin egen fetch må brukes med undici-Agent: Node sin innebygde fetch har en eldre undici og avviser den («invalid onRequestStart method»).
import { Agent, fetch as undiciFetch } from 'undici';
import { config } from './config.js';
import { cached, fetchJson } from './cache.js';
import { fetchWeather } from './weather.js';
import { cfg, parseRoutes, groupOf } from './settings.js';

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
    tripPatterns{ legs{ mode expectedStartTime fromPlace{name} line{publicCode transportMode presentation{colour textColour}} } }
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
    deps.push(withLineColor({ line: leg.line.publicCode, mode: leg.line.transportMode || leg.mode, time: leg.expectedStartTime }, leg.line.presentation));
  }
  // Fjern duplikater og behold de første.
  const seen = new Set();
  return deps.filter((d) => !seen.has(d.line + d.time) && seen.add(d.line + d.time))
    .sort((a, b) => a.time.localeCompare(b.time)).slice(0, count);
}

// Linjefarger (prompt 14): Entur sin presentation.colour/textColour når linjen har det, ellers Ruters standardfarger
// per transportmiddel. Regionbusser (tresifret linjenummer) er grønne.
export const RUTER_COLORS = { metro: '#EC700C', tram: '#0B91EF', bus: '#E60000', regionalbus: '#75A300', coach: '#75A300', water: '#682C88', rail: '#003087' };
const hex = (v) => (/^#?[0-9a-f]{6}$/i.test(String(v ?? '')) ? `#${String(v).replace('#', '').toUpperCase()}` : null);
const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export function lineColor(mode, line, presentation) {
  const m = String(mode ?? 'bus').toLowerCase();
  const fallback = m === 'bus' && /^\d{3}/.test(String(line ?? '')) ? RUTER_COLORS.regionalbus : RUTER_COLORS[m] ?? RUTER_COLORS.bus;
  const color = hex(presentation?.colour) ?? fallback;
  const textColor = hex(presentation?.textColour) ?? (lum(color) > 0.6 ? '#1B1A17' : '#FFFFFF');
  const mo = m === 'regionalbus' || m === 'coach' ? 'bus' : m;
  return { color, textColor, mode: ['metro', 'tram', 'bus', 'water', 'rail'].includes(mo) ? mo : 'bus' };
}
export const withLineColor = (d, presentation) => ({ ...d, ...lineColor(d.mode, d.line, presentation) });

export const getRuter = () => cached('ruter', 30_000, async () => {
  const count = Math.min(10, Math.max(1, parseInt(cfg('ruter_count'), 10) || 3));
  const trips = await Promise.all(parseRoutes(cfg('ruter_routes')).map(async (r) => {
    let deps = [], error = null;
    try { deps = await enturTrip(r, count); } catch (e) { error = e.message; }
    return { from: r.fromName, to: r.toName, url: ruterUrl(r), deps, error };
  }));
  return { trips, updated: new Date().toISOString() };
});

// Avganger fra ett stoppested (mobilwidgeten «Ruter-avganger»). Standard er første «fra»-stopp i strekningene.
const DEPARTURE_QUERY = `query($id:String!,$n:Int!){
  stopPlace(id:$id){ name estimatedCalls(numberOfDepartures:$n){ expectedDepartureTime destinationDisplay{frontText} serviceJourney{ line{publicCode transportMode presentation{colour textColour}} } } }
}`;
export const getDepartures = (stopId) => {
  const id = String(stopId || parseRoutes(cfg('ruter_routes'))[0]?.fromId || '58381').replace(/\D/g, '');
  return cached('dep_' + id, 30_000, async () => {
    const d = await fetchJson('https://api.entur.io/journey-planner/v3/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ET-Client-Name': config.enturClient },
      body: JSON.stringify({ query: DEPARTURE_QUERY, variables: { id: `NSR:StopPlace:${id}`, n: 8 } }),
    });
    const sp = d.data?.stopPlace;
    if (!sp) throw new Error('Fant ikke stoppestedet');
    return { stop: sp.name, stopId: id, departures: sp.estimatedCalls.map((c) => ({
      line: c.serviceJourney?.line?.publicCode ?? '', mode: c.serviceJourney?.line?.transportMode ?? 'bus', to: c.destinationDisplay?.frontText ?? '', time: c.expectedDepartureTime }))
      .map((d, i) => withLineColor(d, sp.estimatedCalls[i].serviceJourney?.line?.presentation)) };
  });
};

// Søk etter stoppesteder (Entur geocoder). Svarer [{ id:'NSR:StopPlace:…', name, locality, modes }].
const CAT_MODE = { metroStation: 'metro', onstreetTram: 'tram', tramStation: 'tram', onstreetBus: 'bus', busStation: 'bus', railStation: 'rail', ferryStop: 'water', harbourPort: 'water', airport: 'air' };
export async function searchStops(q) {
  const t = String(q ?? '').trim().slice(0, 80);
  if (t.length < 2) return [];
  return cached('stops_' + t.toLowerCase(), 24 * 3600_000, async () => {
    const d = await fetchJson(`https://api.entur.io/geocoder/v1/autocomplete?text=${encodeURIComponent(t)}&layers=venue&size=12&lang=no`,
      { headers: { 'ET-Client-Name': config.enturClient, Accept: 'application/json' } }, 6000);
    return (d.features ?? []).filter((f) => /^NSR:StopPlace:\d+$/.test(f.properties?.id ?? '')).map((f) => ({
      id: f.properties.id, name: f.properties.name, locality: f.properties.locality ?? f.properties.county ?? '',
      modes: [...new Set((f.properties.category ?? []).map((c) => CAT_MODE[c]).filter(Boolean))],
    }));
  });
}

// Avganger med detaljer fra ett stopp (Avganger-siden og brukerens egne stopp): planlagt og forventet tid, sanntid,
// plattform, innstilt og avviksmeldinger.
const STOP_QUERY = `query($id:String!,$n:Int!){
  stopPlace(id:$id){ id name estimatedCalls(numberOfDepartures:$n, timeRange:86400){
    aimedDepartureTime expectedDepartureTime realtime cancellation
    quay{ publicCode name }
    destinationDisplay{ frontText }
    situations{ summary{ value language } }
    serviceJourney{ line{ publicCode transportMode presentation{ colour textColour } } }
  } }
}`;
export const stopIdOf = (v) => { const s = String(v ?? '').trim(); const m = s.match(/^(?:NSR:StopPlace:)?(\d{1,9})$/); return m ? `NSR:StopPlace:${m[1]}` : null; };
export function stopDeparturesOut(sp, now = Date.now()) {
  return { stop: { id: sp.id, name: sp.name }, departures: (sp.estimatedCalls ?? []).map((c) => {
    const line = c.serviceJourney?.line ?? {}, exp = c.expectedDepartureTime ?? c.aimedDepartureTime;
    const sit = (c.situations ?? []).map((x) => (x.summary ?? []).find((y) => /no|nob/.test(y.language ?? ''))?.value ?? x.summary?.[0]?.value).filter(Boolean);
    return { line: line.publicCode ?? '', to: c.destinationDisplay?.frontText ?? '', ...lineColor(line.transportMode, line.publicCode, line.presentation),
      aimed: c.aimedDepartureTime, expected: exp, time: exp, minutes: Math.max(0, Math.round((Date.parse(exp) - now) / 60000)),
      delay: c.aimedDepartureTime && exp ? Math.round((Date.parse(exp) - Date.parse(c.aimedDepartureTime)) / 60000) : 0,
      realtime: !!c.realtime, cancelled: !!c.cancellation, platform: c.quay?.publicCode || null, situation: sit[0] ?? null };
  }) };
}
export const getStopDepartures = (stop, n = 20) => {
  const id = stopIdOf(stop);
  if (!id) return Promise.reject(new Error('Ugyldig stopp-ID'));
  const count = Math.min(40, Math.max(1, +n || 20));
  return cached(`stopdep_${id}_${count}`, 20_000, async () => {
    const d = await fetchJson('https://api.entur.io/journey-planner/v3/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'ET-Client-Name': config.enturClient },
      body: JSON.stringify({ query: STOP_QUERY, variables: { id, n: count } }),
    });
    if (!d.data?.stopPlace) throw new Error('Fant ikke stoppestedet');
    return stopDeparturesOut(d.data.stopPlace);
  });
};

/* ---------------- Google-søkeforslag ---------------- */

// Proxy mot Google Suggest (nettleseren får ikke kalle Google direkte på grunn av CSP). Svarer [] ved feil.
const suggestCache = new Map();
export async function getSuggestions(q, { withError = false } = {}) {
  const key = String(q).trim().toLowerCase().slice(0, 120);
  if (!key) return withError ? { items: [] } : [];
  const hit = suggestCache.get(key);
  if (hit && hit.exp > Date.now()) return withError ? { items: hit.list } : hit.list;
  let list = [], error = null;
  try {
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=chrome&hl=no&ie=utf-8&oe=utf-8&q=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Mozilla/5.0 (homelab-os)', Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Google svarte ${res.status}`);
    // Google kan svare i ISO-8859-1 selv om vi ber om UTF-8; tegnsettet i headeren avgjør.
    const cs = /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
    let text;
    try { text = new TextDecoder(cs).decode(await res.arrayBuffer()); } catch { text = ''; }
    const d = JSON.parse(text);
    list = (Array.isArray(d?.[1]) ? d[1] : []).filter((x) => typeof x === 'string').slice(0, 8);
  } catch (e) {
    error = e.name === 'TimeoutError' ? 'Google svarte ikke i tide' : e instanceof SyntaxError ? 'Uventet svar fra Google' : e.cause ? `Kunne ikke nå Google (${e.cause.code ?? e.cause.message ?? e.message})` : e.message;
  }
  // Feil caches ikke, så neste tastetrykk prøver igjen.
  if (!error) {
    if (suggestCache.size > 500) suggestCache.delete(suggestCache.keys().next().value);
    suggestCache.set(key, { list, exp: Date.now() + 10 * 60_000 });
  }
  return withError ? { items: list, ...(error ? { error } : {}) } : list;
}

/* ---------------- Vær / MET ---------------- */

// Logikken ligger i weather.js (Locationforecast complete + Nowcast + Sunrise). Locationforecast oppdateres
// omtrent hver time og Nowcast hvert 5. minutt, så 10 minutters cache holder «nå»-linja fersk uten å mase på MET.
export const getWeather = () => cached('weather', 10 * 60_000, () => fetchWeather({
  lat: parseFloat(cfg('wx_lat')) || 59.9139, lon: parseFloat(cfg('wx_lon')) || 10.7522, place: cfg('wx_place'), userAgent: config.metUserAgent,
}));

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

// Fjern mellomrom, linjeskift og anførselstegn som følger med ved liming.
const clean = (v) => String(v ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, '');

// Nye nøkler (2025+) har Key ID og secret: «Authorization: Basic base64(KEY:SECRET)». Eldre nøkler uten secret sendes som før.
// Samme nøkkel som FinansHub → Aksjer (se t212Creds): nøkkel, secret og miljø fra én og samme kilde.
export function t212Auth() {
  const { key, secret, env } = t212Creds();
  if (!key) return null;
  return { base: `https://${env}.trading212.com`, env, headers: { Authorization: t212AuthHeader(key, secret) } };
}

async function t212Json(a, path) {
  const res = await fetch(`${a.base}${path}`, { headers: a.headers, signal: AbortSignal.timeout(10_000) });
  if (res.status === 401) throw new Error(`Trading 212 avviste nøkkelen (401): sjekk Key ID og secret, og at nøkkelen er laget for ${a.env === 'demo' ? 'Demo' : 'Live'}.`);
  if (res.status === 403) throw new Error('Trading 212: nøkkelen mangler tilgang (403). Gi lesetilgang til account og portfolio.');
  if (res.status === 429) throw new Error('Trading 212: for mange forespørsler (429). Prøver igjen om litt.');
  if (!res.ok) throw new Error(`Trading 212 svarte ${res.status}`);
  return res.json();
}

export const getTrading = () => cached('t212', 60_000, async () => {
  const a = t212Auth();
  if (!a) return { configured: false };
  // Hent sekvensielt: Trading 212 har strenge rate limits per endepunkt.
  const cash = await t212Json(a, '/api/v0/equity/account/cash');
  const portfolio = await t212Json(a, '/api/v0/equity/portfolio');
  let currency = 'NOK';
  try { currency = (await cached('t212info', 24 * 3600_000, () => t212Json(a, '/api/v0/equity/account/info'))).currencyCode || currency; } catch {}
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
      const res = await undiciFetch(url, { method: 'GET', redirect: 'manual', dispatcher: insecure, signal: AbortSignal.timeout(4000) });
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

/* ---------------- Media: Plex og Jellyfin ---------------- */

const MEDIA_MS = 8000;
const ticksToMs = (t) => (Number(t) || 0) / 10_000;      // Jellyfin: 1 tick = 100 ns
const se = (s, e) => (s != null && e != null ? `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}` : '');
const plexVer = (v) => String(v || '').split('-')[0].split('.').slice(0, 3).join('.');
const resLabel = (r) => (!r ? '' : /^\d+$/.test(String(r)) ? `${r}p` : String(r).toUpperCase() === '4K' ? '4K' : String(r));

async function mediaGet(url, headers, as = 'json') {
  const res = await undiciFetch(url, { headers, dispatcher: insecure, signal: AbortSignal.timeout(MEDIA_MS) });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`Tokenet ble avvist (${res.status})`), { status: res.status });
  if (!res.ok) throw Object.assign(new Error(`${new URL(url).host} svarte ${res.status}`), { status: res.status });
  return as === 'json' ? res.json() : res;
}

const plexCfg = () => ({ url: cfg('plex_url').replace(/\/+$/, ''), token: cfg('plex_token').trim() });
const plexH = (token) => ({ 'X-Plex-Token': token, Accept: 'application/json', 'X-Plex-Product': 'Homelab OS', 'X-Plex-Client-Identifier': 'homelab-os' });
const jfCfg = () => ({ url: cfg('jf_url').replace(/\/+$/, ''), key: cfg('jf_key').trim(), user: cfg('jf_user').trim() });
const jfH = (key) => ({ Authorization: `MediaBrowser Client="Homelab OS", Device="Server", DeviceId="homelab-os", Version="1.0", Token="${key}"`, 'X-Emby-Token': key, Accept: 'application/json' });

const plexPoster = (thumb) => (thumb ? `/api/media/poster?src=plex&id=${encodeURIComponent(thumb)}` : null);
const jfPoster = (id) => (id ? `/api/media/poster?src=jellyfin&id=${encodeURIComponent(id)}` : null);

// Servernavn og versjon endres sjelden; hentes separat og caches.
const plexInfo = () => cached('plex_info', 10 * 60_000, async () => {
  const { url, token } = plexCfg();
  const j = (await mediaGet(`${url}/`, plexH(token))).MediaContainer ?? {};
  return { name: j.friendlyName || 'Plex', version: plexVer(j.version), machineId: j.machineIdentifier };
});
const jfInfo = () => cached('jf_info', 10 * 60_000, async () => {
  const { url, key } = jfCfg();
  const j = await mediaGet(`${url}/System/Info`, jfH(key));
  return { name: j.ServerName || 'Jellyfin', version: j.Version || '' };
});

async function plexNow() {
  const { url, token } = plexCfg();
  const list = (await mediaGet(`${url}/status/sessions`, plexH(token))).MediaContainer?.Metadata ?? [];
  return list.map((m) => {
    const ep = m.type === 'episode';
    const trans = !!m.TranscodeSession && m.TranscodeSession.videoDecision === 'transcode';
    const res = resLabel(m.Media?.[0]?.videoResolution);
    const dur = Number(m.duration) || 0, pos = Number(m.viewOffset) || 0;
    return {
      src: 'plex', kind: m.type, title: ep ? `${m.grandparentTitle} · ${se(m.parentIndex, m.index)}` : m.title,
      sub: ep ? m.title : m.year ? String(m.year) : '', user: m.User?.title ?? '', device: m.Player?.title || m.Player?.product || '',
      mode: trans ? 'transcode' : 'direct', quality: res, state: m.Player?.state === 'paused' ? 'paused' : 'playing',
      pct: dur ? Math.min(100, Math.round((pos / dur) * 100)) : 0, leftMs: Math.max(0, dur - pos),
      poster: plexPoster(ep ? m.grandparentThumb || m.thumb : m.thumb),
    };
  });
}

async function plexRecent() {
  const { url, token } = plexCfg();
  const list = (await mediaGet(`${url}/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=12`, plexH(token))).MediaContainer?.Metadata ?? [];
  return list.slice(0, 12).map((m) => {
    const tv = m.type === 'episode' || m.type === 'season' || m.type === 'show';
    const title = m.type === 'episode' ? m.grandparentTitle : m.type === 'season' ? m.parentTitle : m.title;
    const sub = m.type === 'episode' ? `Serie · ${se(m.parentIndex, m.index)}` : m.type === 'season' ? `Serie · ${m.title}` : tv ? 'Serie' : `Film${m.year ? ` · ${m.year}` : ''}`;
    return { src: 'plex', kind: tv ? 'tv' : 'movie', title: title || m.title, sub, added: m.addedAt ? new Date(m.addedAt * 1000).toISOString() : null,
      poster: plexPoster(m.type === 'episode' ? m.grandparentThumb || m.parentThumb || m.thumb : m.type === 'season' ? m.parentThumb || m.thumb : m.thumb), url: `${url}/web/index.html` };
  });
}

async function jfUserId() {
  return cached('jf_uid', 10 * 60_000, async () => {
    const { url, key, user } = jfCfg();
    const users = await mediaGet(`${url}/Users`, jfH(key));
    const u = user ? users.find((x) => x.Name?.toLowerCase() === user.toLowerCase()) : users[0];
    if (!u) throw new Error(`Fant ikke Jellyfin-brukeren «${user}»`);
    return u.Id;
  });
}

async function jfNow() {
  const { url, key } = jfCfg();
  const sessions = await mediaGet(`${url}/Sessions?activeWithinSeconds=960`, jfH(key));
  return sessions.filter((x) => x.NowPlayingItem).map((x) => {
    const it = x.NowPlayingItem, ep = it.Type === 'Episode';
    const dur = ticksToMs(it.RunTimeTicks), pos = ticksToMs(x.PlayState?.PositionTicks);
    const trans = x.PlayState?.PlayMethod === 'Transcode' || (x.TranscodingInfo && x.TranscodingInfo.IsVideoDirect === false);
    const h = it.Height || it.MediaStreams?.find((m) => m.Type === 'Video')?.Height;
    return {
      src: 'jellyfin', kind: it.Type?.toLowerCase(), title: ep ? `${it.SeriesName} · ${se(it.ParentIndexNumber, it.IndexNumber)}` : it.Name,
      sub: ep ? it.Name : it.ProductionYear ? String(it.ProductionYear) : '', user: x.UserName ?? '', device: x.DeviceName || x.Client || '',
      mode: trans ? 'transcode' : 'direct', quality: trans && x.TranscodingInfo?.Height ? `${x.TranscodingInfo.Height}p` : h ? (h >= 2000 ? '4K' : `${h}p`) : '',
      state: x.PlayState?.IsPaused ? 'paused' : 'playing', pct: dur ? Math.min(100, Math.round((pos / dur) * 100)) : 0, leftMs: Math.max(0, dur - pos),
      poster: jfPoster(ep ? it.SeriesId || it.Id : it.Id),
    };
  });
}

async function jfRecent() {
  const { url, key } = jfCfg();
  const uid = await jfUserId();
  const list = await mediaGet(`${url}/Users/${encodeURIComponent(uid)}/Items/Latest?Limit=12&Fields=ProductionYear,DateCreated`, jfH(key));
  return list.slice(0, 12).map((it) => {
    const tv = ['Episode', 'Season', 'Series'].includes(it.Type);
    const title = it.Type === 'Episode' ? it.SeriesName : it.Type === 'Season' ? it.SeriesName || it.Name : it.Name;
    const sub = it.Type === 'Episode' ? `Serie · ${se(it.ParentIndexNumber, it.IndexNumber)}` : it.Type === 'Season' ? `Serie · ${it.Name}` : tv ? 'Serie' : `Film${it.ProductionYear ? ` · ${it.ProductionYear}` : ''}`;
    return { src: 'jellyfin', kind: tv ? 'tv' : 'movie', title, sub, added: it.DateCreated ?? null,
      poster: jfPoster(it.Type === 'Episode' || it.Type === 'Season' ? it.SeriesId || it.Id : it.Id), url: `${url}/web/#/details?id=${encodeURIComponent(it.Id)}` };
  });
}

/* Historikk: siste avspillinger. Plex via /status/sessions/history/all (brukernavn fra /accounts), Jellyfin via DatePlayed per bruker. */
const plexAccounts = () => cached('plex_accounts', 30 * 60_000, async () => {
  const { url, token } = plexCfg();
  const list = (await mediaGet(`${url}/accounts`, plexH(token)).catch(() => null))?.MediaContainer?.Account ?? [];
  return Object.fromEntries(list.map((a) => [String(a.id), a.name]));
});
async function plexHistory() {
  const { url, token } = plexCfg();
  const [list, acc, info] = await Promise.all([
    mediaGet(`${url}/status/sessions/history/all?sort=viewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=20`, plexH(token)).then((j) => j.MediaContainer?.Metadata ?? []),
    plexAccounts().catch(() => ({})), plexInfo().catch(() => null),
  ]);
  return list.map((m) => {
    const ep = m.type === 'episode';
    const key = String(m.ratingKey ?? m.key ?? '').match(/\d+/)?.[0];
    return {
      src: 'plex', kind: ep ? 'episode' : 'movie', user: acc[String(m.accountID)] ?? (m.accountID === 1 ? 'Eier' : ''),
      show: ep ? m.grandparentTitle : m.title, title: ep ? m.title : (m.year ? String(m.year) : ''), season: ep ? m.parentIndex ?? null : null, episode: ep ? m.index ?? null : null,
      playedAt: m.viewedAt ? new Date(m.viewedAt * 1000).toISOString() : null,
      poster: plexPoster(ep ? m.grandparentThumb || m.thumb : m.thumb),
      url: key && info?.machineId ? `${url}/web/index.html#!/server/${info.machineId}/details?key=${encodeURIComponent('/library/metadata/' + key)}` : `${url}/web/index.html`,
    };
  });
}
async function jfHistory() {
  const { url, key, user } = jfCfg();
  const uid = await jfUserId();
  const j = await mediaGet(`${url}/Users/${encodeURIComponent(uid)}/Items?SortBy=DatePlayed&SortOrder=Descending&Filters=IsPlayed&Recursive=true&IncludeItemTypes=Episode,Movie&Limit=20&Fields=UserData,ProductionYear`, jfH(key));
  return (j.Items ?? []).map((it) => {
    const ep = it.Type === 'Episode';
    return {
      src: 'jellyfin', kind: ep ? 'episode' : 'movie', user: user || '',
      show: ep ? it.SeriesName : it.Name, title: ep ? it.Name : (it.ProductionYear ? String(it.ProductionYear) : ''), season: ep ? it.ParentIndexNumber ?? null : null, episode: ep ? it.IndexNumber ?? null : null,
      playedAt: it.UserData?.LastPlayedDate ?? null, poster: jfPoster(ep ? it.SeriesId || it.Id : it.Id),
      url: `${url}/web/#/details?id=${encodeURIComponent(it.Id)}`,
    };
  });
}

async function mediaServers() {
  const p = plexCfg(), j = jfCfg();
  const out = [];
  if (p.url && p.token) out.push({ src: 'plex', label: 'Plex', url: `${p.url}/web/index.html`, info: plexInfo().catch(() => null) });
  if (j.url && j.key) out.push({ src: 'jellyfin', label: 'Jellyfin', url: `${j.url}/web/`, info: jfInfo().catch(() => null) });
  for (const s of out) { const i = await s.info; s.name = i?.name ?? s.label; s.version = i?.version ?? ''; delete s.info; }
  return out;
}

async function collect(kind) {
  const servers = await mediaServers();
  const fns = { plex: { now: plexNow, recent: plexRecent, history: plexHistory }[kind], jellyfin: { now: jfNow, recent: jfRecent, history: jfHistory }[kind] };
  const results = await Promise.allSettled(servers.map((s) => fns[s.src]()));
  const items = [];
  servers.forEach((s, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') { s.ok = true; items.push(...r.value); } else { s.ok = false; s.error = r.reason?.message ?? 'Ukjent feil'; }
  });
  return { configured: servers.length > 0, servers, items };
}

export const getMediaNow = () => cached('media_now', 30_000, () => collect('now'));
export const getMediaRecent = () => cached('media_recent', 10 * 60_000, async () => {
  const r = await collect('recent');
  r.items.sort((a, b) => String(b.added ?? '').localeCompare(String(a.added ?? '')));
  r.items = r.items.slice(0, 12);
  return r;
});

export const getMediaHistory = () => cached('media_history', 5 * 60_000, async () => {
  const r = await collect('history');
  r.items.sort((a, b) => String(b.playedAt ?? '').localeCompare(String(a.playedAt ?? '')));
  r.items = r.items.slice(0, 20);
  return r;
});

/** Henter en plakat fra Plex/Jellyfin. Tokenet legges på her og når aldri nettleseren. */
export async function getMediaPoster(src, id) {
  id = String(id ?? '');
  if (src === 'plex') {
    if (!/^\/library\/(metadata|collections)\/\d+\/(thumb|art|poster)(\/\d+)?$/.test(id)) return null;
    const { url, token } = plexCfg();
    if (!url || !token) return null;
    const res = await mediaGet(`${url}/photo/:/transcode?width=300&height=450&minSize=1&upscale=1&url=${encodeURIComponent(id)}`, plexH(token), 'raw');
    return { type: res.headers.get('content-type') || 'image/jpeg', body: Buffer.from(await res.arrayBuffer()) };
  }
  if (src === 'jellyfin') {
    if (!/^[a-f0-9-]{32,36}$/i.test(id)) return null;
    const { url, key } = jfCfg();
    if (!url || !key) return null;
    const res = await mediaGet(`${url}/Items/${id}/Images/Primary?maxHeight=450&quality=85`, jfH(key), 'raw');
    return { type: res.headers.get('content-type') || 'image/jpeg', body: Buffer.from(await res.arrayBuffer()) };
  }
  return null;
}

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

/* ---------------- Test tilkobling (Innstillinger → Integrasjoner) ---------------- */

const TEST_MS = 8000;
class TestError extends Error {}

// Ett ekte kall mot tjenesten med de lagrede verdiene. Feil gjøres om til en forklaring på norsk.
async function probe(url, opts = {}, { insecureTls = false } = {}) {
  let res;
  try {
    res = await (insecureTls ? undiciFetch : fetch)(url, { ...opts, redirect: 'follow', signal: AbortSignal.timeout(TEST_MS), ...(insecureTls ? { dispatcher: insecure } : {}) });
  } catch (e) {
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    const code = e.cause?.code ?? e.code ?? '';
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new TestError(`Ingen svar fra ${host} innen ${TEST_MS / 1000} sekunder.`);
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') throw new TestError(`Fant ikke ${host}. Sjekk adressen, og at serveren har tilgang til nettet (DNS).`);
    if (code === 'ECONNREFUSED') throw new TestError(`${host} avviste tilkoblingen. Kjører tjenesten, og stemmer porten?`);
    if (/CERT|SSL|TLS/i.test(code + e.message)) throw new TestError(`Sertifikatfeil mot ${host} (${code || e.message}).`);
    throw new TestError(`Fikk ikke kontakt med ${host}: ${e.cause?.message ?? e.message}`);
  }
  if (res.status === 401 || res.status === 403) throw new TestError(`Nøkkelen eller tokenet ble avvist (${res.status}).`);
  if (res.status === 404) throw new TestError(`Fant ikke adressen (404). Sjekk URL-en.`);
  if (res.status === 429) throw new TestError('For mange forespørsler (429). Prøv igjen om litt.');
  if (!res.ok) throw new TestError(`Tjenesten svarte ${res.status} ${res.statusText}`.trim());
  return res;
}
const need = (v, msg) => { if (!v) throw new TestError(msg); return v; };
const base = (k) => cfg(k).replace(/\/+$/, '');

const TESTS = {
  'Vær (MET/Yr)': async () => {
    const r = await probe(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${(+cfg('wx_lat')).toFixed(4)}&lon=${(+cfg('wx_lon')).toFixed(4)}`, { headers: { 'User-Agent': config.metUserAgent } });
    const t = (await r.json()).properties?.timeseries?.[0]?.data?.instant?.details?.air_temperature;
    return `MET svarte · ${t ?? '–'} °C i ${cfg('wx_place') || 'valgt sted'} nå.`;
  },
  'Ruter (Entur)': async () => {
    const routes = parseRoutes(cfg('ruter_routes'));
    need(routes.length, 'Ingen strekninger er satt opp.');
    const ids = [...new Set(routes.flatMap((r) => [r.fromId, r.toId]))].slice(0, 8);
    const q = `{${ids.map((id, i) => `s${i}: stopPlace(id: "NSR:StopPlace:${id}") { name }`).join(' ')}}`;
    const r = await probe('https://api.entur.io/journey-planner/v3/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'ET-Client-Name': config.enturClient }, body: JSON.stringify({ query: q }) });
    const data = (await r.json()).data ?? {};
    const missing = ids.filter((_, i) => !data[`s${i}`]);
    if (missing.length) throw new TestError(`Entur svarte, men fant ikke stopp ${missing.join(', ')}. Sjekk NSR-ID-ene.`);
    return `Entur svarte · ${ids.length} stopp funnet: ${ids.map((_, i) => data[`s${i}`].name).join(', ')}.`;
  },
  'Kalender / timeplan': async () => {
    const url = need(cfg('cal_ics'), 'iCal-adressen mangler.');
    const text = await (await probe(url)).text();
    if (!/BEGIN:VCALENDAR/.test(text)) throw new TestError('Adressen svarte, men det er ikke en iCal-kalender.');
    const n = (text.match(/BEGIN:VEVENT/g) ?? []).length;
    return `Kalenderen svarte · ${n} hendelser.`;
  },
  'Home Assistant': async () => {
    const url = need(base('ha_url'), 'Adressen til Home Assistant mangler.');
    const token = need(cfg('ha_token'), 'Long-lived token mangler.');
    const h = { headers: { Authorization: `Bearer ${token}` } };
    const msg = (await (await probe(`${url}/api/`, h, { insecureTls: true })).json()).message ?? 'svar';
    const sensor = cfg('ha_sensor_power');
    if (!sensor) return `Home Assistant svarte (${msg}).`;
    try {
      const st = await (await probe(`${url}/api/states/${encodeURIComponent(sensor)}`, h, { insecureTls: true })).json();
      return `Home Assistant svarte (${msg}) · ${sensor} = ${st.state}${st.attributes?.unit_of_measurement ? ' ' + st.attributes.unit_of_measurement : ''}.`;
    } catch (e) {
      if (e instanceof TestError && /404/.test(e.message)) throw new TestError(`Tilkoblet, men fant ikke sensoren ${sensor}.`);
      throw e;
    }
  },
  Sonarr: () => arrTest('sonarr', 'Sonarr'),
  Radarr: () => arrTest('radarr', 'Radarr'),
  Plex: async () => {
    const url = need(base('plex_url'), 'Adressen til Plex mangler.');
    const token = need(cfg('plex_token').trim(), 'X-Plex-Token mangler.');
    let j;
    try { j = (await (await probe(`${url}/`, { headers: plexH(token) }, { insecureTls: true })).json()).MediaContainer ?? {}; }
    catch (e) { if (e instanceof TestError && /avvist/.test(e.message)) throw new TestError('Tokenet ble avvist (401). Hent et nytt fra «Vis XML».'); throw e; }
    let n = 0;
    try { n = ((await (await probe(`${url}/status/sessions`, { headers: plexH(token) }, { insecureTls: true })).json()).MediaContainer?.Metadata ?? []).length; } catch {}
    return `${j.friendlyName || 'Plex'} ${plexVer(j.version)} svarer · ${n} spiller nå.`.replace(/\s+svarer/, ' svarer');
  },
  Jellyfin: async () => {
    const url = need(base('jf_url'), 'Adressen til Jellyfin mangler.');
    const key = need(cfg('jf_key').trim(), 'API-nøkkelen mangler.');
    let j;
    try { j = await (await probe(`${url}/System/Info`, { headers: jfH(key) }, { insecureTls: true })).json(); }
    catch (e) { if (e instanceof TestError && /avvist/.test(e.message)) throw new TestError('API-nøkkelen ble avvist (401). Lag en ny under Kontrollpanel → Avansert → API-nøkler.'); throw e; }
    let n = 0, u = '';
    try { n = (await (await probe(`${url}/Sessions?activeWithinSeconds=960`, { headers: jfH(key) }, { insecureTls: true })).json()).filter((x) => x.NowPlayingItem).length; } catch {}
    const user = cfg('jf_user').trim();
    if (user) {
      try {
        const users = await (await probe(`${url}/Users`, { headers: jfH(key) }, { insecureTls: true })).json();
        u = users.some((x) => x.Name?.toLowerCase() === user.toLowerCase()) ? ` Fant brukeren ${user}.` : ` Fant ikke brukeren «${user}».`;
      } catch {}
    }
    return `${j.ServerName || 'Jellyfin'} ${j.Version || ''} svarer · ${n} spiller nå.${u}`.replace(/\s+svarer/, ' svarer');
  },
  'Trading 212': async () => {
    const a = need(t212Auth(), 'API-nøkkelen (Key ID) mangler.');
    let res;
    try { res = await fetch(`${a.base}/api/v0/equity/account/cash`, { headers: a.headers, signal: AbortSignal.timeout(TEST_MS) }); }
    catch (e) { throw new TestError(`Fikk ikke kontakt med ${new URL(a.base).host}: ${e.cause?.message ?? e.message}`); }
    const env = a.env === 'demo' ? 'Demo' : 'Live';
    if (res.status === 401) throw new TestError(clean(cfg('t212_secret'))
      ? `Nøkkelen ble avvist (401). Sjekk at Key ID og secret hører sammen, og at nøkkelen er laget i ${env} (ikke ${env === 'Live' ? 'Demo' : 'Live'}) og for Invest/ISA, ikke CFD.`
      : 'Nøkkelen ble avvist (401). Nye Trading 212-nøkler har både Key ID og secret: fyll inn begge.');
    if (res.status === 403) throw new TestError('Nøkkelen mangler tilgang (403). Gi lesetilgang til account og portfolio, og sjekk eventuell IP-begrensning (serverens offentlige IP).');
    if (res.status === 429) throw new TestError('For mange forespørsler (429). Vent litt og prøv igjen.');
    if (!res.ok) throw new TestError(`Trading 212 svarte ${res.status}.`);
    const cash = await res.json();
    return `Trading 212 (${env}) svarte · totalt ${Math.round(cash.total ?? 0).toLocaleString('nb-NO')}.`;
  },
  'NASA / CelesTrak': async () => {
    const a = await (await probe(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(cfg('nasa_key') || 'DEMO_KEY')}`)).json();
    const tle = await (await probe(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(cfg('sat_group'))}&FORMAT=tle`, { headers: { 'User-Agent': config.metUserAgent } })).text();
    const n = Math.floor(tle.trim().split(/\r?\n/).length / 3);
    if (!n) throw new TestError(`NASA svarte, men CelesTrak-gruppen «${cfg('sat_group')}» er tom.`);
    return `NASA svarte («${a.title ?? 'dagens bilde'}») · CelesTrak: ${n.toLocaleString('nb-NO')} satellitter.`;
  },
  Cloudflare: async () => {
    const token = need(cfg('cf_token'), 'Standard-tokenet mangler.');
    const j = await (await probe('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { Authorization: `Bearer ${token}` } })).json();
    if (!j.success) throw new TestError(j.errors?.[0]?.message ?? 'Cloudflare godtok ikke tokenet.');
    return `Cloudflare godtok tokenet (status ${j.result?.status ?? 'ok'}).`;
  },
  'Søk': async () => {
    const url = cfg('search_url');
    if (!/^https?:\/\/[^\s]+$/.test(url)) throw new TestError('Søke-URL-en er ugyldig.');
    await probe(url + encodeURIComponent('homelab'), { headers: { 'User-Agent': 'Mozilla/5.0 (homelab-os)' } });
    return `Søkemotoren svarte (${new URL(url).host}).`;
  },
};

async function arrTest(k, name) {
  const url = need(base(`${k}_url`), `Adressen til ${name} mangler.`);
  const key = need(cfg(`${k}_key`), 'API-nøkkelen mangler.');
  const s = await (await probe(`${url}/api/v3/system/status`, { headers: { 'X-Api-Key': key } }, { insecureTls: true })).json();
  return `${name} ${s.version ?? ''} svarte.`.replace(/\s+svarte/, ' svarte');
}

export const TEST_GROUPS = Object.keys(TESTS);
export const hasTest = (group) => !!(TESTS[group] ?? TESTS[groupOf(group)?.name]);

/** Tester én integrasjonsgruppe med de lagrede verdiene. Kaster aldri; svarer { ok, message, ms }. */
export async function testIntegration(group) {
  const fn = TESTS[group] ?? TESTS[groupOf(group)?.name];
  if (!fn) return { ok: false, message: 'Ingen test for denne gruppen.', ms: 0 };
  const t0 = Date.now();
  if (process.env.MOCK_DATA === '1') return { ok: true, message: 'Demodata (MOCK_DATA=1): ingen ekte kall ble gjort.', ms: 0, mock: true };
  try { return { ok: true, message: await fn(), ms: Date.now() - t0 }; }
  catch (e) { return { ok: false, message: e instanceof TestError ? e.message : `Uventet feil: ${e.message}`, ms: Date.now() - t0 }; }
}
