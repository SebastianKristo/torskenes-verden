// Prompt 39 (SERVER39): «Glimt · ukas vær» nederst i Vær (claude-code-vaer-glimt-ukas-vaer.md). Sesjon eller app-token.
//
// GET /api/weather/week-summary?place=<navn|id|lat,lon>&char=sky|ugle|spire  (uten place: brukerens første værsted, ellers Oslo;
//     uten char: lagret valg vaer_glimt_p, ellers sky)
//   → {text, char, charName, charDesc, place:{name, lat, lon}, engine:'lokal'|'glimt', source:'open-meteo'|'mock',
//      thisWeek:{from, to, avgMax, avgMin, avgTemp, precipMm, sunHours, rainDays, days:[{date, wd, max, min, mm, sunH, wind, code, cond}]},
//      lastWeek:{…samme}, diff:{temp, precipMm, sunHours},
//      tiles:[{k:'temp', label:'TEMP', value:'8°', sub:'+1,2° mot forrige uke'}, {k:'precip', label:'NEDBØR', value:'12 mm', sub:'(forrige 8 mm)'}, {k:'sun', label:'SOL', value:'14 t', sub:'(forrige 9 t)'}],
//      highlights:[{k:'best', label:'Beste dag ute', text:'Fredag · 10° og sol'}, {k:'umbrella', label:'Paraply', text:'Torsdag og lørdag'}, {k:'clothes', label:'Klær', text:'Lett jakke'}],
//      chars:[{id, name, desc}], updatedAt}
//   Data: Open-Meteo daily (tmax, tmin, nedbør, soltimer, værkode, vind) med past_days=7 & forecast_days=7: forrige uke = 0–6, denne = 7–13.
//   Cache per sted 3 t. Beste dag = maks av tmax − 1,5·mm − 0,4·vind + 0,3·soltimer. Klær etter snitt-maks (< 3° vinterjakke, < 8° varm jakke,
//   < 13° lett jakke, < 18° genser, ellers T-skjorte). Med Glimt-LLM: 2–3 setninger i valgt stemme, ellers lokal tekst.
// PUT /api/weather/week-summary {char} → {char}  (lagrer valget, vaer_glimt_p)
import { Hono } from 'hono';
import { kv } from './db.js';
import { authOrToken } from './mobile.js';
import { cached } from './cache.js';
import { PLACES, wmoText } from './weather-full.js';
import { geocode } from './weather35.js';
import { run as aiRun } from './ai-run.js';

const MOCK = () => process.env.MOCK_DATA === '1';
export const CHARS39 = [
  { id: 'sky', name: 'Sky', desc: 'den rolige' },
  { id: 'ugle', name: 'Ugle', desc: 'tallknuseren' },
  { id: 'spire', name: 'Spire', desc: 'ut og lek' },
];
const CHAR_ALIAS = { glimt: 'sky', natt: 'sky', drape: 'spire', gris: 'spire', stjerne: 'sky', halo: 'sky', boble: 'sky' };
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const r1 = (v) => Math.round(v * 10) / 10;
const n1 = (v) => String(r1(v)).replace('.', ',');
const sgn = (v) => (v > 0 ? `+${n1(v)}` : v < 0 ? `−${n1(-v)}` : '±0');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const joinNo = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}`);
const wdOf = (d) => WD[new Date(`${d}T12:00:00Z`).getUTCDay()];
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const todayOslo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());

let F = (u, i) => fetch(u, i);
let injectedFlag = false;
export const _setWeek39Fetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); injectedFlag = !!fn; };
let llmImpl = null;
export const _setWeek39Llm = (fn) => { llmImpl = fn; };

/** 14 dager (7 bak + 7 frem). → [{date, max, min, mm, sunH, wind, code}] */
async function rawDays(p) {
  const key = `wk39:${r1(p.lat)},${r1(p.lon)}:${todayOslo()}`;
  return cached(key, 3 * 3600_000, async () => {
    if (MOCK() && !injected()) return mockDays(p);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&timezone=Europe%2FOslo&past_days=7&forecast_days=7&wind_speed_unit=ms`
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,weather_code,wind_speed_10m_max';
    const r = await F(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json', 'User-Agent': 'homelab-vaer' } });
    if (!r.ok) throw new Error(`Open-Meteo svarte ${r.status}`);
    const D = (await r.json()).daily ?? {};
    return (D.time ?? []).map((date, i) => ({ date, max: +D.temperature_2m_max?.[i] || 0, min: +D.temperature_2m_min?.[i] || 0, mm: +D.precipitation_sum?.[i] || 0,
      sunH: (+D.sunshine_duration?.[i] || 0) / 3600, wind: +D.wind_speed_10m_max?.[i] || 0, code: D.weather_code?.[i] ?? 0 }));
  });
}
const injected = () => injectedFlag;
export const _injectWeek39 = (on) => { injectedFlag = !!on; };
const hashN = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
function mockDays(p) {
  const t = todayOslo();
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(t, i - 7), r = hashN(`${date}:${p.lat}`);
    const code = [0, 1, 2, 3, 61, 63, 80, 2, 3, 1][Math.floor(r * 10)];
    const base = 7 + (i >= 7 ? 1 : 0);
    return { date, max: r1(base + 2 + r * 5), min: r1(base - 4 + r * 2), mm: code >= 61 ? r1(2 + r * 8) : 0, sunH: code <= 1 ? r1(4 + r * 4) : code === 2 ? r1(1 + r * 3) : r1(r), wind: r1(2 + r * 7), code };
  });
}

function weekOf(days) {
  const n = days.length || 1;
  const avgMax = days.reduce((a, d) => a + d.max, 0) / n, avgMin = days.reduce((a, d) => a + d.min, 0) / n;
  return { from: days[0]?.date ?? null, to: days[days.length - 1]?.date ?? null, avgMax: r1(avgMax), avgMin: r1(avgMin), avgTemp: r1((avgMax + avgMin) / 2),
    precipMm: r1(days.reduce((a, d) => a + d.mm, 0)), sunHours: r1(days.reduce((a, d) => a + d.sunH, 0)), rainDays: days.filter((d) => d.mm >= 1).length,
    days: days.map((d) => ({ date: d.date, wd: wdOf(d.date), max: r1(d.max), min: r1(d.min), mm: r1(d.mm), sunH: r1(d.sunH), wind: r1(d.wind), code: d.code, cond: wmoText(d.code) })) };
}
export const clothesFor = (avgMax) => (avgMax < 3 ? 'Vinterjakke' : avgMax < 8 ? 'Varm jakke' : avgMax < 13 ? 'Lett jakke' : avgMax < 18 ? 'Genser' : 'T-skjorte');
export const bestDayOf = (days) => days.map((d) => ({ d, s: d.max - 1.5 * d.mm - 0.4 * d.wind + 0.3 * d.sunH })).sort((a, b) => b.s - a.s)[0]?.d ?? null;

export function summarize(raw, char = 'sky') {
  const last = weekOf(raw.slice(0, 7)), cur = weekOf(raw.slice(7, 14));
  const diff = { temp: r1(cur.avgTemp - last.avgTemp), precipMm: r1(cur.precipMm - last.precipMm), sunHours: r1(cur.sunHours - last.sunHours) };
  const best = bestDayOf(raw.slice(7, 14));
  const wet = cur.days.filter((d) => d.mm >= 1);
  const clothes = clothesFor(cur.avgMax);
  const warmer = diff.temp >= 0.5 ? 'litt varmere' : diff.temp <= -0.5 ? 'litt kaldere' : 'omtrent like varm';
  const wetter = diff.precipMm >= 2 ? 'våtere' : diff.precipMm <= -2 ? 'tørrere' : 'omtrent like våt';
  const bestTxt = best ? `${cap(wdOf(best.date))} · ${Math.round(best.max)}°${best.sunH >= 3 ? ' og sol' : best.mm < 0.5 ? ' og oppholdsvær' : ''}` : '–';
  let text;
  if (char === 'ugle') {
    text = `Snittet denne uka er ${n1(cur.avgTemp)}° (${sgn(diff.temp)}° mot forrige uke). Nedbør ${n1(cur.precipMm)} mm mot ${n1(last.precipMm)} mm, sol ${n1(cur.sunHours)} t mot ${n1(last.sunHours)} t. ${cur.rainDays} av 7 dager med regn.`;
  } else if (char === 'spire') {
    text = `${best ? `${cap(wdOf(best.date))} er beste dag ute – ${Math.round(best.max)}° ${best.sunH >= 3 ? 'og sol' : 'og stort sett tørt'}.` : 'Uka ser grå ut.'} ${wet.length ? `Ta med paraply ${joinNo(wet.map((d) => d.wd))}.` : 'Paraplyen kan bli hjemme.'} ${clothes} holder.`;
  } else {
    text = `Uka blir ${warmer} ${warmer.startsWith('omtrent') ? 'som' : 'enn'} forrige uke, og ${wetter}. Snittet ligger rundt ${Math.round(cur.avgTemp)}°.${wet.length ? ` Regn ${joinNo(wet.map((d) => d.wd))}` : ' Lite regn'}${best ? `, og ${wdOf(best.date)} ser finest ut.` : '.'}`;
  }
  const tiles = [
    { k: 'temp', label: 'TEMP', value: `${Math.round(cur.avgTemp)}°`, sub: `${sgn(diff.temp)}° mot forrige uke` },
    { k: 'precip', label: 'NEDBØR', value: `${Math.round(cur.precipMm)} mm`, sub: `(forrige ${Math.round(last.precipMm)} mm)` },
    { k: 'sun', label: 'SOL', value: `${Math.round(cur.sunHours)} t`, sub: `(forrige ${Math.round(last.sunHours)} t)` },
  ];
  const highlights = [
    { k: 'best', label: 'Beste dag ute', text: bestTxt, date: best?.date ?? null },
    { k: 'umbrella', label: 'Paraply', text: wet.length ? cap(joinNo(wet.map((d) => d.wd))) : 'Ikke nødvendig', dates: wet.map((d) => d.date) },
    { k: 'clothes', label: 'Klær', text: clothes },
  ];
  return { text, thisWeek: cur, lastWeek: last, diff, tiles, highlights };
}

function placeOfUser(u) {
  const list = kv.get(u, 'wx_places', null);
  const own = Array.isArray(list) && list[0]?.lat != null ? list[0] : null;
  return own ? { name: own.name ?? 'Mitt sted', lat: +own.lat, lon: +own.lon } : { name: PLACES.oslo.name, lat: PLACES.oslo.lat, lon: PLACES.oslo.lon };
}
async function resolvePlace(u, q) {
  const s = String(q ?? '').trim();
  if (!s) return placeOfUser(u);
  const ll = s.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (ll) return { name: `${(+ll[1]).toFixed(2)}, ${(+ll[2]).toFixed(2)}`, lat: +ll[1], lon: +ll[2] };
  const id = s.toLowerCase();
  if (PLACES[id]) return { name: PLACES[id].name, lat: PLACES[id].lat, lon: PLACES[id].lon };
  const own = (kv.get(u, 'wx_places', null) ?? []).find?.((x) => String(x.name ?? '').toLowerCase() === id);
  if (own?.lat != null) return { name: own.name, lat: +own.lat, lon: +own.lon };
  const g = await geocode(s).catch(() => null);
  return g ? { name: g.label ?? g.name, lat: g.lat, lon: g.lon } : null;
}
const charOf = (u, q) => { const c = CHAR_ALIAS[q] ?? q; if (CHARS39.some((x) => x.id === c)) return c; const s = kv.get(u, 'vaer_glimt_p', null) ?? kv.get(u, 'layout', {})?.vaer_glimt_p; return CHARS39.some((x) => x.id === s) ? s : 'sky'; };

export async function weekSummary(u, { place = '', char = '' } = {}) {
  const p = await resolvePlace(u, place);
  if (!p) return { error: `Fant ikke stedet «${place}»`, status: 404 };
  const ch = charOf(u, char);
  const raw = await rawDays(p);
  if (raw.length < 14) return { error: 'Fikk ikke nok værdata for å sammenligne ukene', status: 502 };
  const s = summarize(raw, ch);
  let engine = 'lokal';
  try {
    const c = CHARS39.find((x) => x.id === ch);
    const facts = { sted: p.name, denneUka: { snitt: s.thisWeek.avgTemp, mm: s.thisWeek.precipMm, sol: s.thisWeek.sunHours, regndager: s.thisWeek.rainDays }, forrigeUke: { snitt: s.lastWeek.avgTemp, mm: s.lastWeek.precipMm, sol: s.lastWeek.sunHours },
      beste: s.highlights[0].text, paraply: s.highlights[1].text, klaer: s.highlights[2].text };
    const prompt = `Du er ${c.name}, ${c.desc}, en av Glimt-figurene. Skriv 2–3 korte setninger på norsk bokmål om ukas vær i den stemmen, med sammenligning mot forrige uke. Bruk bare fakta: ${JSON.stringify(facts)}`;
    const t = llmImpl ? await llmImpl(prompt, ch) : MOCK() && !process.env.OLLAMA_URL ? null : (await aiRun('glimt', { user: u, prompt, temperature: 0.5, numPredict: 140, timeoutMs: 20_000, title: 'Glimt · ukas vær', background: true })).text;
    const clean = String(t ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length > 20) { s.text = clean.slice(0, 500); engine = 'glimt'; }
  } catch { /* lokal tekst */ }
  const c = CHARS39.find((x) => x.id === ch);
  return { text: s.text, char: ch, charName: c.name, charDesc: c.desc, place: p, engine, source: MOCK() && !injected() ? 'mock' : 'open-meteo',
    thisWeek: s.thisWeek, lastWeek: s.lastWeek, diff: s.diff, tiles: s.tiles, highlights: s.highlights, chars: CHARS39, updatedAt: new Date().toISOString() };
}

export const week39Api = new Hono();
week39Api.use('*', authOrToken);
week39Api.get('/', async (c) => {
  try {
    const r = await weekSummary(c.get('user'), { place: c.req.query('place') ?? '', char: c.req.query('char') ?? '' });
    return r.error ? c.json({ error: r.error }, r.status ?? 400) : c.json(r);
  } catch (e) { return c.json({ error: `Fikk ikke hentet været: ${String(e.message ?? e).slice(0, 160)}` }, 502); }
});
week39Api.put('/', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const ch = CHAR_ALIAS[b?.char] ?? b?.char;
  if (!CHARS39.some((x) => x.id === ch)) return c.json({ error: 'char må være sky, ugle eller spire' }, 400);
  kv.set(c.get('user'), 'vaer_glimt_p', ch);
  return c.json({ char: ch });
});
