// Prompt 28: stedssøk i Vær (prompts/prompt-28-pakke/claude-code-vaer-stedssok.md). Søket brukte bare Open-Meteo og fant
// ikke mindre steder (f.eks. Strømstad, Sverige). Nå: Open-Meteo (count=10, language=nb), Open-Meteo med foldet tekst
// (ø→o, æ→ae, å→a, uten aksenter) og Nominatim (OpenStreetMap) parallelt. Bare bosteder, duplikater innen 5 km slås sammen,
// navn som starter med søket først, så folketall. Maks 10. Hver kilde caches i 24 t; Nominatim får maks 1 kall/s og egen
// User-Agent/Referer (kravet i Nominatims bruksvilkår).
// Svar: [{name, sub:'Fylke/region, Land', lat, lon, country, source:'open-meteo'|'osm', region}] (region = sub før landet,
// for eldre klienter som sender region videre til POST /api/weather/places).
import { cached } from './cache.js';
import { config } from './config.js';

const MOCK = () => process.env.MOCK_DATA === '1';
export const NOMINATIM_UA = process.env.NOMINATIM_USER_AGENT || `Homelab-Torskenes/1.0 (${String(config.metUserAgent ?? '').match(/[\w.+-]+@[\w.-]+/)?.[0] ?? 'homelab'})`;
export const NOMINATIM_REFERER = process.env.NOMINATIM_REFERER || 'https://github.com/SebastianKristo/torskenes-verden';

/** ø→o, æ→ae, å→a og fjern aksenter (Strømstad → Stromstad, Västra → Vastra). */
export function fold(s) {
  return String(s ?? '').replace(/ø/g, 'o').replace(/Ø/g, 'O').replace(/æ/g, 'ae').replace(/Æ/g, 'Ae').replace(/å/g, 'a').replace(/Å/g, 'A')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const key = (s) => fold(s).toLowerCase().trim();

// Haversine-avstand i km.
export function distKm(a, b) {
  const R = 6371, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const round4 = (n) => Math.round(Number(n) * 1e4) / 1e4;
const subOf = (region, country) => [region, country].filter(Boolean).join(', ');

async function getJson(url, headers = {}, ms = 6000) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} svarte ${res.status}`);
  return res.json();
}

/* ---------------- Open-Meteo ---------------- */

async function openMeteo(name) {
  const r = await cached(`wxp:om:${name.toLowerCase()}`, 24 * 3600_000, async () => {
    const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=nb&format=json`);
    return { items: (d.results ?? []).filter((x) => !x.feature_code || /^(PPL|ADM|ISL)/.test(x.feature_code)).map((x) => ({
      name: x.name, region: x.admin1 ?? x.admin2 ?? '', country: x.country ?? '', cc: String(x.country_code ?? '').toUpperCase(),
      lat: round4(x.latitude), lon: round4(x.longitude), pop: Number(x.population) || 0, source: 'open-meteo',
    })).filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lon)) };
  });
  return r.items ?? [];
}

/* ---------------- Nominatim (OpenStreetMap) ---------------- */

const KEEP = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'municipality', 'administrative', 'island', 'locality']);
let nextSlot = 0; // maks 1 kall per sekund (felles for hele serveren)
export const _resetNominatim = () => { nextSlot = 0; };
async function slot() {
  const now = Date.now(), at = Math.max(now, nextSlot);
  nextSlot = at + 1000;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}
async function nominatim(q) {
  const r = await cached(`wxp:osm:${key(q)}`, 24 * 3600_000, async () => {
    await slot();
    const d = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=nb&q=${encodeURIComponent(q)}`,
      { 'User-Agent': NOMINATIM_UA, Referer: NOMINATIM_REFERER }, 7000);
    return { items: (Array.isArray(d) ? d : []).filter((x) => KEEP.has(x.addresstype) || (x.category === 'place' && KEEP.has(x.type)) || (x.category === 'boundary' && x.type === 'administrative')).map((x) => {
      const a = x.address ?? {};
      const name = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.municipality ?? a.island ?? a.locality ?? x.name;
      return { name, region: a.county ?? a.state ?? '', country: a.country ?? '', cc: String(a.country_code ?? '').toUpperCase(),
        lat: round4(x.lat), lon: round4(x.lon), pop: Math.round((Number(x.importance) || 0) * 10_000), source: 'osm' };
    }).filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lon)) };
  });
  return r.items ?? [];
}

/* ---------------- Sammenslåing ---------------- */

/** Slår sammen treffene: duplikater innen 5 km (samme navn, foldet) blir ett; Open-Meteo går foran, OSM fyller inn. */
export function mergePlaces(q, lists, max = 10) {
  const out = [];
  for (const it of lists.flat()) {
    const dup = out.find((o) => distKm(o, it) <= 5 && (key(o.name) === key(it.name) || distKm(o, it) <= 1));
    if (dup) { if (!dup.region && it.region) dup.region = it.region; if (!dup.country && it.country) dup.country = it.country; dup.pop = Math.max(dup.pop, it.pop); continue; }
    out.push({ ...it });
  }
  const k = key(q);
  const starts = (x) => (key(x.name).startsWith(k) ? 0 : 1);
  out.sort((a, b) => starts(a) - starts(b) || b.pop - a.pop);
  return out.slice(0, max).map((x) => ({ name: x.name, sub: subOf(x.region, x.country), lat: x.lat, lon: x.lon, country: x.country, source: x.source, region: x.region }));
}

const MOCK_LIST = [
  { name: 'Strømstad', region: 'Västra Götaland', country: 'Sverige', lat: 58.9395, lon: 11.1712, pop: 6400, source: 'open-meteo' },
  { name: 'Lillehammer', region: 'Innlandet', country: 'Norge', lat: 61.1153, lon: 10.4662, pop: 28000, source: 'open-meteo' },
  { name: 'Lillesand', region: 'Agder', country: 'Norge', lat: 58.2496, lon: 8.3779, pop: 11000, source: 'open-meteo' },
  { name: 'Lillestrøm', region: 'Akershus', country: 'Norge', lat: 59.956, lon: 11.05, pop: 90000, source: 'open-meteo' },
  { name: 'Stavanger', region: 'Rogaland', country: 'Norge', lat: 58.969, lon: 5.7331, pop: 144000, source: 'open-meteo' },
  { name: 'Kristiansand', region: 'Agder', country: 'Norge', lat: 58.1467, lon: 7.9956, pop: 116000, source: 'open-meteo' },
  { name: 'Bodø', region: 'Nordland', country: 'Norge', lat: 67.2804, lon: 14.4049, pop: 53000, source: 'open-meteo' },
  { name: 'Ålesund', region: 'Møre og Romsdal', country: 'Norge', lat: 62.4722, lon: 6.1495, pop: 67000, source: 'open-meteo' },
  { name: 'Hemsedal', region: 'Buskerud', country: 'Norge', lat: 60.8636, lon: 8.5527, pop: 2500, source: 'osm' },
  { name: 'Göteborg', region: 'Västra Götaland', country: 'Sverige', lat: 57.7072, lon: 11.9668, pop: 580000, source: 'open-meteo' },
  { name: 'København', region: 'Hovedstaden', country: 'Danmark', lat: 55.6759, lon: 12.5655, pop: 1150000, source: 'open-meteo' },
];

/**
 * Søker etter steder. q under 2 tegn → []. Feiler alle kildene: kaster (ruten svarer 502 «Får ikke søkt nå. Prøv igjen.»).
 */
export async function searchPlacesV2(q) {
  const t = String(q ?? '').trim().slice(0, 80);
  if (t.length < 2) return [];
  if (MOCK()) return mergePlaces(t, [MOCK_LIST.filter((x) => key(x.name).includes(key(t)))]);
  const folded = fold(t);
  const jobs = [openMeteo(t), folded !== t ? openMeteo(folded) : Promise.resolve([]), nominatim(t)];
  const res = await Promise.allSettled(jobs);
  const failed = res.filter((r) => r.status === 'rejected');
  for (const f of failed) console.warn('[weather/places] søk:', f.reason?.message ?? f.reason);
  if (res[0].status === 'rejected' && res[2].status === 'rejected') throw new Error('Får ikke søkt nå. Prøv igjen.'); // begge hovedkildene nede
  return mergePlaces(t, res.map((r) => (r.status === 'fulfilled' ? r.value : [])));
}
