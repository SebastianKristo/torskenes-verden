// Nettet i eval: én global fetch som
//   – slipper modellkall gjennom til ekte Ollama/Open WebUI (eller den falske modellen med --backend mock) og tapper ut
//     plan, verktøykall og tokens (prompt_eval_count/eval_count) til tracen,
//   – svarer deterministisk for alle eksterne datakilder (vær/geokoding, nettsøk, Sonarr, Nominatim),
//   – blokkerer alt annet (og logger det, så uventede kall syns i tracen).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const fx = (n) => JSON.parse(readFileSync(join(FIX, n), 'utf8'));
const WEATHER = fx('weather.json');
const SEARCH = fx('search.json');
const SONARR = fx('sonarr.json');

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const H = (t, s = 200) => new Response(t, { status: s, headers: { 'content-type': 'text/html; charset=utf-8' } });
const clip = (s, n = 400) => { const t = typeof s === 'string' ? s : JSON.stringify(s); return t && t.length > n ? `${t.slice(0, n)} …` : t; };

/* ---------------- Vær ---------------- */

const lower = (s) => String(s ?? '').toLowerCase().trim();
const placeByName = (q) => WEATHER.places.find((p) => p.aliases.includes(lower(q)) || lower(p.name) === lower(q));
const placeByPos = (lat, lon) => WEATHER.places.map((p) => ({ p, d: Math.hypot(p.latitude - lat, p.longitude - lon) })).sort((a, b) => a.d - b.d).find((x) => x.d < 1.5)?.p ?? null;
const profileOf = (p) => WEATHER.profiles[p?.name] ?? { temp: 10, lo: 6, hi: 12, code: 2, wind: 3, precipProb: 20, precip: 0, symbol: 'partlycloudy_day' };
// Lokal tid «YYYY-MM-DDTHH:00» i stedets tidssone.
const localParts = (ms, tz) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = (t) => f.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: +g('hour') };
};
const tzOffsetSec = (ms, tz) => { const p = localParts(ms, tz); const asUtc = Date.parse(`${p.date}T${String(p.hour).padStart(2, '0')}:00:00Z`); return Math.round((asUtc - Math.floor(ms / 3600_000) * 3600_000) / 1000); };
function dayVals(prof, i, tz, name) {
  // NY i morgen og Oslo i dag er fasit; andre dager litt variasjon.
  return { hi: prof.hi + (i >= 2 ? (i % 3) - 1 : 0), lo: prof.lo + (i >= 2 ? (i % 2) : 0), code: prof.code, precipProb: prof.precipProb, precip: prof.precip * 24 };
}
function openMeteoForecast(u) {
  const lat = +u.searchParams.get('latitude'), lon = +u.searchParams.get('longitude');
  const p = placeByPos(lat, lon);
  const prof = profileOf(p);
  const tz = p?.timezone ?? 'Europe/Oslo';
  const now = Date.now();
  const nowL = localParts(now, tz);
  const ndays = Math.max(1, Math.min(16, +(u.searchParams.get('forecast_days') ?? 7) || 7));
  const startDay = Date.parse(`${nowL.date}T00:00:00Z`);
  const days = Array.from({ length: ndays }, (_, i) => new Date(startDay + i * 864e5).toISOString().slice(0, 10));
  const val = (k, { hour = nowL.hour, day = 0 } = {}) => {
    const dv = dayVals(prof, day, tz, p?.name);
    if (/temperature_2m_max|apparent_temperature_max/.test(k)) return dv.hi;
    if (/temperature_2m_min|apparent_temperature_min/.test(k)) return dv.lo;
    if (/apparent_temperature/.test(k)) return prof.temp - 2;
    if (/temperature/.test(k)) return day === 0 && Math.abs(hour - nowL.hour) <= 1 ? prof.temp : Math.round((dv.lo + (dv.hi - dv.lo) * Math.sin(Math.PI * Math.max(0, Math.min(1, (hour - 6) / 14)))) * 10) / 10;
    if (/precipitation_probability/.test(k)) return dv.precipProb;
    if (/precipitation|rain|showers/.test(k)) return /sum/.test(k) ? dv.precip : prof.precip;
    if (/snow/.test(k)) return 0;
    if (/weather_code|weathercode/.test(k)) return dv.code;
    if (/wind_speed|windspeed|wind_gusts/.test(k)) return /gust/.test(k) ? prof.wind * 2 : prof.wind;
    if (/wind_direction|winddirection/.test(k)) return 200;
    if (/is_day/.test(k)) return hour >= 8 && hour < 18 ? 1 : 0;
    if (/humidity/.test(k)) return 80;
    if (/cloud/.test(k)) return prof.code >= 3 ? 90 : 10;
    if (/uv/.test(k)) return 1;
    if (/pressure/.test(k)) return 1012;
    if (/visibility/.test(k)) return 20000;
    if (/sunrise/.test(k)) return `${days[day]}T08:15`;
    if (/sunset/.test(k)) return `${days[day]}T17:45`;
    if (/daylight|sunshine/.test(k)) return 30000;
    return 0;
  };
  const list = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const out = { latitude: lat, longitude: lon, timezone: tz, timezone_abbreviation: tz === 'Europe/Oslo' ? 'CEST' : 'EDT', utc_offset_seconds: tzOffsetSec(now, tz), elevation: 20 };
  const cur = list(u.searchParams.get('current') ?? '');
  if (cur.length) { out.current = { time: `${nowL.date}T${String(nowL.hour).padStart(2, '0')}:00`, interval: 900 }; for (const k of cur) out.current[k] = val(k); }
  if (u.searchParams.get('current_weather') === 'true') out.current_weather = { temperature: prof.temp, windspeed: prof.wind, winddirection: 200, weathercode: prof.code, is_day: 1, time: `${nowL.date}T${String(nowL.hour).padStart(2, '0')}:00` };
  const hourly = list(u.searchParams.get('hourly'));
  if (hourly.length) {
    out.hourly = { time: [] };
    for (const k of hourly) out.hourly[k] = [];
    days.forEach((d, di) => { for (let h = 0; h < 24; h++) { out.hourly.time.push(`${d}T${String(h).padStart(2, '0')}:00`); for (const k of hourly) out.hourly[k].push(val(k, { hour: h, day: di })); } });
  }
  const daily = list(u.searchParams.get('daily'));
  if (daily.length) {
    out.daily = { time: days };
    for (const k of daily) out.daily[k] = days.map((_, di) => val(k, { day: di, hour: 14 }));
  }
  return { body: out, place: p?.name ?? null, tz };
}
function metForecast(u) {
  const lat = +u.searchParams.get('lat'), lon = +u.searchParams.get('lon');
  const p = placeByPos(lat, lon);
  const prof = profileOf(p);
  const tz = p?.timezone ?? 'Europe/Oslo';
  const t0 = Math.floor(Date.now() / 3600_000) * 3600_000;
  const nowL = localParts(Date.now(), tz);
  const ts = [];
  for (let i = 0; i < 24 * 9; i += i < 60 ? 1 : 6) {
    const ms = t0 + i * 3600_000, L = localParts(ms, tz);
    const day = Math.round((Date.parse(`${L.date}T00:00:00Z`) - Date.parse(`${nowL.date}T00:00:00Z`)) / 864e5);
    const dv = dayVals(prof, day, tz, p?.name);
    const temp = i <= 1 ? prof.temp : Math.round((dv.lo + (dv.hi - dv.lo) * Math.sin(Math.PI * Math.max(0, Math.min(1, (L.hour - 6) / 14)))) * 10) / 10;
    const det = { precipitation_amount: prof.precip, probability_of_precipitation: dv.precipProb, precipitation_amount_max: prof.precip * 2, precipitation_amount_min: 0 };
    ts.push({ time: new Date(ms).toISOString().replace('.000', ''), data: {
      instant: { details: { air_temperature: temp, wind_speed: prof.wind, wind_from_direction: 200, relative_humidity: 80, cloud_area_fraction: prof.code >= 3 ? 90 : 10, air_pressure_at_sea_level: 1012, ultraviolet_index_clear_sky: 1, dew_point_temperature: 2, wind_speed_of_gust: prof.wind * 2, fog_area_fraction: 0 } },
      ...(i < 60 ? { next_1_hours: { summary: { symbol_code: prof.symbol }, details: det } } : {}),
      next_6_hours: { summary: { symbol_code: prof.symbol }, details: { ...det, precipitation_amount: prof.precip * 6, air_temperature_max: dv.hi, air_temperature_min: dv.lo } },
      next_12_hours: { summary: { symbol_code: prof.symbol }, details: { probability_of_precipitation: dv.precipProb } },
    } });
  }
  return { body: { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat, 20] }, properties: { meta: { updated_at: new Date(t0).toISOString(), units: { air_temperature: 'celsius' } }, timeseries: ts } }, place: p?.name ?? null, tz };
}
function geocode(u) {
  const q = u.searchParams.get('name') ?? '';
  const p = placeByName(q) ?? WEATHER.places.find((x) => lower(q).length >= 4 && lower(x.name).startsWith(lower(q)));
  return { body: p ? { results: [{ id: 1, name: p.name, latitude: p.latitude, longitude: p.longitude, country_code: p.country_code, country: p.country, timezone: p.timezone, admin1: '' }] } : { generationtime_ms: 0.1 }, q, place: p?.name ?? null };
}

/* ---------------- Nettsøk ---------------- */

function searchHits(q) {
  const re = new RegExp(SEARCH.uk_pm.match, 'i');
  return re.test(q) ? SEARCH.uk_pm.hits : SEARCH.generic;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const ddgHtml = (hits) => `<html><body>${hits.map((h) => `<div class="result results_links web-result"><h2 class="result__title"><a rel="nofollow" class="result__a" href="${esc(h.url)}">${esc(h.title)}</a></h2><a class="result__snippet" href="${esc(h.url)}">${esc(h.snippet)}</a></div>`).join('')}</body></html>`;

/* ---------------- Sonarr ---------------- */

function sonarr(u, init, rec) {
  const path = u.pathname.replace(/^\/api\/v3/, '');
  const method = String(init?.method ?? 'GET').toUpperCase();
  let body = null;
  try { body = init?.body ? JSON.parse(init.body) : null; } catch { body = init?.body ?? null; }
  rec({ kind: 'sonarr', method, path, query: Object.fromEntries(u.searchParams), body });
  const series = SONARR.series.map((s) => ({ ...s, images: [], added: '2024-01-01T00:00:00Z', seriesType: 'standard', languageProfileId: 1 }));
  if (method === 'GET' && path === '/series') return J(series);
  if (method === 'GET' && /^\/series\/\d+$/.test(path)) { const s = series.find((x) => x.id === +path.split('/')[2]); return s ? J(s) : J({ message: 'NotFound' }, 404); }
  if (method === 'GET' && path === '/series/lookup') {
    const term = lower(u.searchParams.get('term')).replace(/[^a-z0-9æøå]+/g, '');
    const all = [...series, ...SONARR.lookupExtra.map((x) => ({ ...x, images: [] }))];
    // Som ekte Sonarr: «911», «9-1-1» og «9 1 1» finner serien; resten av teksten («siste episode fra …») gir ingen treff.
    return J(all.filter((s) => { const t = lower(s.title).replace(/[^a-z0-9æøå]+/g, ''); return term && (t.includes(term) || term === t); }));
  }
  if (method === 'GET' && path === '/episode') return J((SONARR.episodes[u.searchParams.get('seriesId')] ?? []).map((e) => ({ ...e, seriesId: +u.searchParams.get('seriesId'), airDate: e.airDateUtc.slice(0, 10) })));
  if (method === 'GET' && /^\/episode\/\d+$/.test(path)) { const id = +path.split('/')[2]; for (const [sid, eps] of Object.entries(SONARR.episodes)) { const e = eps.find((x) => x.id === id); if (e) return J({ ...e, seriesId: +sid }); } return J({ message: 'NotFound' }, 404); }
  if (method === 'POST' && path === '/command') return J({ id: 501, name: body?.name ?? 'Unknown', status: 'queued', queued: new Date().toISOString(), body }, 201);
  if (method === 'GET' && path === '/command') return J([]);
  if (method === 'GET' && path === '/qualityprofile') return J([{ id: 4, name: 'HD-1080p' }, { id: 5, name: 'Ultra-HD' }, { id: 6, name: 'HD-720p' }]);
  if (method === 'GET' && path === '/rootfolder') return J([{ id: 1, path: '/data/media/tv', freeSpace: 5e11 }]);
  if (method === 'GET' && path === '/release') return J([]);
  if (method === 'GET' && path === '/system/status') return J({ version: '4.0.9', appName: 'Sonarr' });
  if (method === 'GET' && /^\/(queue|wanted\/missing|history)/.test(path)) return J({ page: 1, pageSize: 50, totalRecords: 0, records: [] });
  if (method === 'GET' && path === '/calendar') return J([]);
  if (method === 'POST' && path === '/series') return J({ ...(body ?? {}), id: 99 }, 201);
  if (method === 'GET') return J([]);
  return J({}, 200);
}

/* ---------------- Modell-tapping ---------------- */

/** Leser en kopi av strømmen (ndjson fra Ollama, SSE fra Open WebUI) og samler innhold, tool_calls og tokens. */
async function tapStream(stream, entry) {
  const dec = new TextDecoder();
  let buf = '', content = '', thinking = '';
  const tools = [];
  const take = (line) => {
    line = line.trim();
    if (!line) return;
    if (line.startsWith('data:')) line = line.slice(5).trim();
    if (line === '[DONE]') return;
    let j; try { j = JSON.parse(line); } catch { return; }
    if (j.message) { content += j.message.content ?? ''; thinking += j.message.thinking ?? ''; for (const t of j.message.tool_calls ?? []) tools.push(t.function ?? t); }
    if (j.response) content += j.response;
    for (const ch of j.choices ?? []) { content += ch.delta?.content ?? ch.message?.content ?? ''; for (const t of ch.delta?.tool_calls ?? ch.message?.tool_calls ?? []) if (t.function?.name) tools.push({ name: t.function.name, arguments: t.function.arguments }); }
    if (j.prompt_eval_count != null) entry.promptTokens = j.prompt_eval_count;
    if (j.eval_count != null) entry.outTokens = j.eval_count;
    if (j.usage) { entry.promptTokens = j.usage.prompt_tokens ?? entry.promptTokens; entry.outTokens = j.usage.completion_tokens ?? entry.outTokens; }
    if (j.done_reason) entry.doneReason = j.done_reason;
    // Prompt 55: hvor tiden gikk (Ollama oppgir nanosekunder): lasting (modellbytte/kald), prompt og generering.
    for (const [k, f] of [['loadMs', 'load_duration'], ['promptMs', 'prompt_eval_duration'], ['genMs', 'eval_duration'], ['totalMs', 'total_duration']]) if (j[f] != null) entry[k] = Math.round(j[f] / 1e6);
    if (j.error) entry.error = clip(j.error, 300);
  };
  try {
    const rd = stream.getReader();
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const parts = buf.split('\n'); buf = parts.pop(); parts.forEach(take); }
    take(buf);
  } catch (e) { entry.tapError = String(e?.message ?? e); }
  entry.content = clip(content, 1500);
  if (thinking) entry.thinkingChars = thinking.length;
  if (tools.length) entry.toolCalls = tools.map((t) => ({ name: t.name, arguments: typeof t.arguments === 'string' ? clip(t.arguments, 400) : t.arguments }));
  entry.ms = Date.now() - entry.t0;
  delete entry.t0;
}
function describeRequest(path, b) {
  const msgs = b.messages ?? [];
  const sys = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const usr = msgs.filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
  return {
    path, model: b.model, stream: b.stream, think: b.think, options: b.options ?? null,
    maxTokens: b.max_tokens ?? null, temperature: b.temperature ?? b.options?.temperature ?? null,
    tools: (b.tools ?? []).map((t) => t.function?.name ?? t.name), format: b.format ? (typeof b.format === 'string' ? b.format : 'json-schema') : b.response_format ? 'response_format' : null,
    images: msgs.reduce((a, m) => a + (m.images?.length ?? 0) + (Array.isArray(m.content) ? m.content.filter((c) => c.type === 'image_url').length : 0), 0),
    chars: { system: sys.length, user: usr.length, tools: b.tools ? JSON.stringify(b.tools).length : 0 },
    estTokens: Math.round((sys.length + usr.length + (b.tools ? JSON.stringify(b.tools).length : 0)) / 3.5),
    lastUser: clip(msgs.filter((m) => m.role === 'user').at(-1)?.content ?? b.prompt ?? '', 300),
    systemHead: clip(sys, 300),
  };
}

/**
 * Installerer global fetch. opts: {modelHosts:Set<host>, fakeModel:(url, init)=>Response|null}
 * → {trace:{model:[], ext:[]}, reset()}
 */
export function installNet({ modelHosts, passHosts = new Set(), fakeModel = null }) {
  const real = globalThis.fetch.bind(globalThis);
  const trace = { model: [], ext: [], inflight: 0, lastActivity: Date.now() };
  const rec = (x) => trace.ext.push({ at: Date.now(), ...x });
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url);
    const host = u.host;
    if (modelHosts.has(host) && !/\/api\/v1\/retrieval\/process\/web\/search$/.test(u.pathname)) {
      const isChat = /\/api\/(chat|generate|embed|embeddings)$|\/v1\/chat\/completions$|\/api\/chat\/completions$|\/v1\/embeddings$/.test(u.pathname) && init.body;
      let entry = null;
      if (isChat) {
        let b = {}; try { b = JSON.parse(init.body); } catch { /* */ }
        entry = { t0: Date.now(), at: Date.now(), ...describeRequest(u.pathname, b) };
        if (/embed/.test(u.pathname)) { entry.kind = 'embed'; entry.inputs = [].concat(b.input ?? b.prompt ?? []).length; }
        trace.model.push(entry);
      }
      let res;
      trace.inflight++; trace.lastActivity = Date.now();
      const doneFlight = () => { trace.inflight--; trace.lastActivity = Date.now(); };
      try { res = fakeModel ? await fakeModel(url, init) : await real(input, init); }
      catch (e) { doneFlight(); if (entry) { entry.error = String(e?.cause?.code ?? e?.message ?? e); entry.ms = Date.now() - entry.t0; delete entry.t0; } throw e; }
      if (entry) {
        entry.status = res.status;
        if (!res.ok || !res.body || entry.kind === 'embed') { doneFlight(); entry.ms = Date.now() - entry.t0; delete entry.t0; if (!res.ok) { const t = await res.clone().text().catch(() => ''); entry.error = clip(t, 300); } return res; }
        const [a, b2] = res.body.tee();
        tapStream(b2, entry).finally(doneFlight);
        return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
      }
      doneFlight();
      return res;
    }
    trace.lastActivity = Date.now();
    // Prompt 55: tjenester som skal være ekte (Mac-OCR med EVAL_MAC_OCR_URL) slippes gjennom og logges.
    if (passHosts.has(host)) { rec({ kind: 'pass', host, path: u.pathname }); return real(input, init); }
    // Eksterne datakilder (deterministiske).
    if (host === 'geocoding-api.open-meteo.com') { const g = geocode(u); rec({ kind: 'weather', api: 'open-meteo-geocode', q: g.q, place: g.place }); return J(g.body); }
    if (host === 'api.open-meteo.com') { const f = openMeteoForecast(u); rec({ kind: 'weather', api: 'open-meteo-forecast', place: f.place, tz: f.tz, lat: +u.searchParams.get('latitude'), lon: +u.searchParams.get('longitude'), params: clip(u.search, 300) }); return J(f.body); }
    if (host === 'api.met.no') {
      if (/locationforecast/.test(u.pathname)) { const f = metForecast(u); rec({ kind: 'weather', api: 'met-locationforecast', place: f.place, tz: f.tz, lat: +u.searchParams.get('lat'), lon: +u.searchParams.get('lon') }); return J(f.body); }
      rec({ kind: 'weather', api: `met${u.pathname}` });
      return J({ properties: { timeseries: [] } });
    }
    if (host === 'ws.geonorge.no') { const q = u.searchParams.get('sok') ?? ''; const p = placeByName(q.replace(/\*$/, '')); rec({ kind: 'geo', api: 'geonorge', q, place: p?.name ?? null }); return J({ navn: p && p.country_code === 'NO' ? [{ skrivemåte: p.name, representasjonspunkt: { nord: p.latitude, øst: p.longitude }, kommuner: [{ kommunenavn: p.name }], navneobjekttype: 'By' }] : [] }); }
    if (host === 'nominatim.openstreetmap.org') {
      const q = u.searchParams.get('q') ?? '';
      rec({ kind: 'geo', api: 'nominatim', q });
      if (/colosseum/i.test(q)) return J([{ name: 'Colosseum Kino', display_name: 'Colosseum Kino, Fridtjof Nansens vei 6, Majorstuen, Oslo', lat: '59.9296', lon: '10.7126', address: { road: 'Fridtjof Nansens vei', house_number: '6', suburb: 'Majorstuen', city: 'Oslo' } }]);
      if (/oslomet|pilestredet/i.test(q)) return J([{ name: 'OsloMet', display_name: 'OsloMet, Pilestredet 35, Oslo', lat: '59.9196', lon: '10.7355', address: { road: 'Pilestredet', house_number: '35', suburb: 'St. Hanshaugen', city: 'Oslo' } }]);
      return J([]);
    }
    if (host === 'html.duckduckgo.com' || host === 'duckduckgo.com') { const q = u.searchParams.get('q') ?? ''; const hits = searchHits(q); rec({ kind: 'search', api: 'ddg', q, hits: hits.length }); return H(ddgHtml(hits)); }
    if (host === 'api.search.brave.com') { const q = u.searchParams.get('q') ?? ''; const hits = searchHits(q); rec({ kind: 'search', api: 'brave', q, hits: hits.length }); return J({ web: { results: hits.map((h) => ({ title: h.title, url: h.url, description: h.snippet, page_age: h.published })) } }); }
    if (u.pathname.endsWith('/api/v1/retrieval/process/web/search')) {
      let b = {}; try { b = JSON.parse(init.body); } catch { /* */ }
      const q = b.queries?.[0] ?? b.query ?? '';
      const hits = searchHits(q);
      rec({ kind: 'search', api: 'openwebui', q, hits: hits.length });
      return J({ docs: hits.map((h) => ({ content: h.snippet, metadata: { source: h.url, title: h.title, published: h.published } })) });
    }
    if (host === 'searxng.eval') { const q = u.searchParams.get('q') ?? ''; const hits = searchHits(q); rec({ kind: 'search', api: 'searxng', q, hits: hits.length }); return J({ results: hits.map((h) => ({ title: h.title, url: h.url, content: h.snippet, publishedDate: h.published })) }); }
    if (host === 'sonarr.eval:8989' || host === 'sonarr.eval') return sonarr(u, init, rec);
    rec({ kind: 'blocked', host, path: u.pathname });
    throw new TypeError(`fetch failed (eval: ekstern vert ${host} er blokkert)`);
  };
  return { trace, real };
}
