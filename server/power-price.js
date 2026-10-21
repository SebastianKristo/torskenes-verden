// Prompt 44: strømpris-verktøyet (power) for Glimt og Chat.
// Kilde: Home Assistant-sensoren ha_sensor_price (Nord Pool, f.eks. sensor.nordpool_kwh_oslo_nok) når HA er satt opp, sonen
// stemmer med sensoren og dagen er i dag; ellers hvakosterstrommen.no (uten nøkkel):
//   https://www.hvakosterstrommen.no/api/v1/prices/YYYY/MM-DD_NO1.json → [{NOK_per_kWh, time_start, time_end}] (uten mva;
//   fra 1.10.2025 kvarterspriser, 96 per døgn – vi regner timesnitt for billigste/dyreste time).
// Soner: NO1 Oslo/Øst, NO2 Kristiansand/Sør (og Stavanger), NO3 Trondheim/Midt, NO4 Tromsø/Nord, NO5 Bergen/Vest.
// Tall i øre/kWh, med og uten mva (25 %, ikke i NO4). Antagelse: HA-sensoren viser pris med mva (standard i Nord Pool-integrasjonen).
// MOCK_DATA=1 (uten injisert fetch) gir faste priser.
import { cfg } from './settings.js';
import { cached } from './cache.js';

const MOCK = () => process.env.MOCK_DATA === '1';
let F = null;
export const _setPowerFetch = (fn) => { F = fn ?? null; };
const fx = (u, i) => (F ?? globalThis.fetch)(u, i);

export const ZONES = { NO1: 'Oslo', NO2: 'Kristiansand', NO3: 'Trondheim', NO4: 'Tromsø', NO5: 'Bergen' };
export const ZONE_AREA = { NO1: 'Øst-Norge', NO2: 'Sør-Norge', NO3: 'Midt-Norge', NO4: 'Nord-Norge', NO5: 'Vest-Norge' };
const CITY = [
  [/\b(oslo|østlandet|øst-?norge|drammen|fredrikstad|sarpsborg|hamar|lillehammer|gjøvik|moss|asker|bærum|lillestrøm|tønsberg|sandefjord|larvik|skien|porsgrunn)\b/i, 'NO1'],
  [/\b(kristiansand|sørlandet|sør-?norge|arendal|grimstad|mandal|stavanger|sandnes|haugesund|egersund|flekkefjord)\b/i, 'NO2'],
  [/\b(trondheim|trøndelag|midt-?norge|molde|ålesund|kristiansund|steinkjer|namsos|røros)\b/i, 'NO3'],
  [/\b(tromsø|nord-?norge|bodø|narvik|alta|harstad|hammerfest|kirkenes|mo i rana|vadsø|finnmark|troms|lofoten)\b/i, 'NO4'],
  [/\b(bergen|vestlandet|vest-?norge|førde|voss|odda|florø|stord)\b/i, 'NO5'],
];
/** Prisområdet i teksten (NO1–NO5 eller et sted), ellers null. */
export function zoneOf(text) {
  const t = String(text ?? '');
  const m = t.match(/\bNO\s?([1-5])\b/i);
  if (m) return `NO${m[1]}`;
  for (const [re, z] of CITY) if (re.test(t)) return z;
  return null;
}
/** Standardsonen: sonen i HA-sensornavnet (…_oslo_…), ellers NO1. */
export function homeZone() {
  const s = String(cfg('ha_sensor_price') ?? '').toLowerCase();
  return /bergen/.test(s) ? 'NO5' : /tr_?heim|trondheim/.test(s) ? 'NO3' : /troms/.test(s) ? 'NO4' : /kr_?sand|kristiansand|_no2/.test(s) ? 'NO2' : 'NO1';
}
const pad = (n) => String(n).padStart(2, '0');
const osloDate = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const osloHour = (t) => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const r1 = (v) => Math.round(v * 10) / 10;
const nbn = (v) => String(r1(v)).replace('.', ',');
export const hasVat = (zone) => zone !== 'NO4';

/** Er spørsmålet om strømpris? */
export const POWER_RE = /(strøm\s*pris(?:en|er|ene)?|prisen\s+på\s+strøm(?:men)?|spot\s*pris(?:en)?|hva\s+koster\s+strømmen|strømmen\s+(?:koster|i\s+dag|i\s+morgen)|kwh-?pris|pris\s+per\s+kwh|øre\s*(?:\/|per)\s*kwh|billigst(?:e)?\s+strøm|når\s+er\s+strømmen\s+billigst|electricity\s+price|power\s+price)/i;
export const isPowerQuestion = (text) => POWER_RE.test(String(text ?? ''));

/** Regner ut snitt/min/maks/nå/billigste og dyreste time fra [{ts, ore (uten mva)}]. */
export function summarize(points, { zone, date, now = Date.now(), source, inclVat = false } = {}) {
  const vat = hasVat(zone) ? 1.25 : 1;
  const ex = points.map((p) => ({ ...p, ore: inclVat ? p.ore / vat : p.ore }));
  const byHour = new Map();
  for (const p of ex) { const h = osloHour(p.ts); const a = byHour.get(h) ?? []; a.push(p.ore); byHour.set(h, a); }
  const hours = [...byHour.entries()].map(([h, a]) => ({ hour: h, ore: a.reduce((x, y) => x + y, 0) / a.length })).sort((a, b) => a.hour - b.hour);
  const all = ex.map((p) => p.ore);
  const avg = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  const cur = date === osloDate(now) ? ex.filter((p) => p.ts <= now).at(-1) ?? null : null;
  const cheap = hours.reduce((a, b) => (b.ore < a.ore ? b : a), hours[0]), dear = hours.reduce((a, b) => (b.ore > a.ore ? b : a), hours[0]);
  const w = (v) => (v == null ? null : r1(v * vat));
  const hh = (h) => `${pad(h.hour)}–${pad((h.hour + 1) % 24)}`;
  const exVat = { avg: r1(avg), min: r1(Math.min(...all)), max: r1(Math.max(...all)), now: cur ? r1(cur.ore) : null, cheapest: { hour: hh(cheap), ore: r1(cheap.ore) }, priciest: { hour: hh(dear), ore: r1(dear.ore) } };
  const withVat = { avg: w(avg), min: w(Math.min(...all)), max: w(Math.max(...all)), now: cur ? w(cur.ore) : null, cheapest: { hour: hh(cheap), ore: w(cheap.ore) }, priciest: { hour: hh(dear), ore: w(dear.ore) } };
  return { zone, area: ZONE_AREA[zone], city: ZONES[zone], date, unit: 'øre/kWh', vat: hasVat(zone), vatPct: hasVat(zone) ? 25 : 0, withVat, exVat, hours: hours.map((h) => ({ hour: h.hour, ore: r1(h.ore * vat) })),
    resolution: points.length > 30 ? '15 min' : 'time', source };
}

/** Faste priser (MOCK_DATA=1): kurve med topp morgen og ettermiddag. */
export function mockPoints(date) {
  const base = Date.parse(`${date}T00:00:00+02:00`);
  return Array.from({ length: 24 }, (_, h) => ({ ts: base + h * 3600_000, ore: Math.round((55 + 25 * Math.sin(((h - 6) / 24) * 2 * Math.PI) + (h >= 17 && h <= 19 ? 30 : 0)) * 10) / 10 }));
}
async function fromHvakoster(zone, date) {
  const [y, m, d] = date.split('-');
  const url = `https://www.hvakosterstrommen.no/api/v1/prices/${y}/${m}-${d}_${zone}.json`;
  const r = await fx(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) throw Object.assign(new Error(`Prisene for ${date} er ikke publisert ennå`), { notYet: true });
  if (!r.ok) throw new Error(`hvakosterstrommen.no svarte ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j) || !j.length) throw new Error('hvakosterstrommen.no ga ingen priser');
  return j.map((x) => ({ ts: Date.parse(x.time_start), ore: Number(x.NOK_per_kWh) * 100 })).filter((x) => Number.isFinite(x.ts) && Number.isFinite(x.ore));
}
async function fromHa(zone, date) {
  const url = String(cfg('ha_url') ?? '').replace(/\/$/, ''), tok = cfg('ha_token'), sensor = cfg('ha_sensor_price');
  if (!url || !tok || !sensor || zone !== homeZone() || date !== osloDate()) return null;
  const r = await fx(`${url}/api/states/${sensor}`, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const s = await r.json();
  const a = s.attributes ?? {};
  const unit = String(a.unit_of_measurement ?? a.unit ?? 'kr/kWh');
  const k = /øre|ore|cent/i.test(unit) || a.price_in_cents ? 1 : 100;
  if (Array.isArray(a.raw_today) && a.raw_today.length) return a.raw_today.map((x) => ({ ts: Date.parse(x.start), ore: Number(x.value) * k })).filter((x) => Number.isFinite(x.ore));
  if (Array.isArray(a.today) && a.today.length) { const base = Date.parse(`${date}T00:00:00`); const step = (24 * 3600_000) / a.today.length; return a.today.map((v, i) => ({ ts: base + i * step, ore: Number(v) * k })).filter((x) => Number.isFinite(x.ore)); }
  return null;
}

/**
 * Strømprisen for sonen og dagen. → summarize(…) + {source:'hvakosterstrommen.no'|'Home Assistant'|'Mock'}
 * when: 'today' | 'tomorrow'. Cache 15 min.
 */
export async function powerPrice({ zone = homeZone(), when = 'today', now = Date.now() } = {}) {
  const date = osloDate(now + (when === 'tomorrow' ? 86400_000 : 0));
  return cached(`p44:power:${zone}:${date}:${F ? 'f' : ''}`, 15 * 60_000, async () => {
    if (MOCK() && !F) return summarize(mockPoints(date), { zone, date, now, source: 'Mock' });
    try { const ha = await fromHa(zone, date); if (ha?.length) return summarize(ha, { zone, date, now, source: 'Home Assistant', inclVat: true }); } catch { /* reserve: hvakosterstrommen.no */ }
    return summarize(await fromHvakoster(zone, date), { zone, date, now, source: 'hvakosterstrommen.no' });
  });
}

/** Faktakort (prompt 41-formen) for strømprisen i spørsmålet. → fact (med error når prisene ikke kunne hentes) */
export async function powerFact(text, { now = Date.now() } = {}) {
  const zone = zoneOf(text) ?? homeZone();
  const when = /\b(i\s*morgen|imorgen|tomorrow)\b/i.test(String(text ?? '')) ? 'tomorrow' : 'today';
  const whenLabel = when === 'tomorrow' ? 'i morgen' : 'i dag';
  const place = `${zone} ${ZONES[zone]}`;
  try {
    const p = await powerPrice({ zone, when, now });
    const W = p.withVat, X = p.exVat, mv = p.vat ? 'med mva' : 'uten mva (NO4 har ikke mva)';
    const label = `Snitt ${nbn(W.avg)} øre/kWh ${mv}${W.now != null ? ` · nå ${nbn(W.now)} øre` : ''} · billigst kl. ${W.cheapest.hour}`;
    const text2 = `Strømprisen i ${zone} (${ZONES[zone]}) ${whenLabel}: snitt ${nbn(W.avg)} øre/kWh ${mv}${p.vat ? ` (${nbn(X.avg)} uten mva)` : ''}`
      + `${W.now != null ? `, nå ${nbn(W.now)} øre` : ''}, laveste ${nbn(W.min)} og høyeste ${nbn(W.max)} øre. Billigste time er kl. ${W.cheapest.hour} (${nbn(W.cheapest.ore)} øre), dyreste kl. ${W.priciest.hour} (${nbn(W.priciest.ore)} øre). Kilde: ${p.source}.`;
    return { tool: 'power', place, zone, country: 'Norge', when: whenLabel, window: p.date, localTime: null, tz: 'Europe/Oslo', label, values: p, source: p.source, text: text2 };
  } catch (e) {
    const msg = `Fikk ikke hentet strømprisen for ${place} ${whenLabel} (${e.message})`;
    return { tool: 'power', place, zone, country: 'Norge', when: whenLabel, label: msg, error: msg, values: {}, source: null, text: `${msg}.` };
  }
}
/** Blokken i systemprompten. */
export function powerPrompt(f) {
  if (!f) return '';
  if (f.error) return `Strømpris (hentet nå): ${f.label}. Si dette til brukeren, ikke gjett.`;
  const p = f.values, W = p.withVat, X = p.exVat;
  return `Strømpris (hentet nå, ${p.source}) for ${f.zone} ${ZONES[f.zone]} ${f.when} (${p.date}), øre/kWh ${p.vat ? 'med mva (25 %)' : 'uten mva (NO4)'}: snitt ${nbn(W.avg)}, min ${nbn(W.min)}, maks ${nbn(W.max)}`
    + `${W.now != null ? `, nå ${nbn(W.now)}` : ''}, billigste time kl. ${W.cheapest.hour} (${nbn(W.cheapest.ore)}), dyreste kl. ${W.priciest.hour} (${nbn(W.priciest.ore)}).`
    + `${p.vat ? ` Uten mva: snitt ${nbn(X.avg)}, min ${nbn(X.min)}, maks ${nbn(X.max)}.` : ''} Bruk disse tallene, ikke gjett. Nettleie og påslag er ikke med.`;
}
