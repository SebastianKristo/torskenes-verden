// Integrasjonsinnstillinger som kan endres fra siden. Verdier i databasen overstyrer miljøvariabler.
// Hemmeligheter lagres kun på serveren og sendes aldri tilbake til nettleseren.
import { kv, OWNER } from './db.js';
import { clearCache } from './cache.js';

const e = (k, d = '') => process.env[k] ?? d;

const DEFAULT_ROUTES = 'Amagerveien (6354) > Majorstuen (58381)\nFrydenlund (6258) > Majorstuen (58381)\nMajorstuen (58381) > Amagerveien (6354)\nMajorstuen (58381) > Holbergs plass (63280)';

// [nøkkel, etikett, standardverdi (fra env), hemmelig?, type]
export const SCHEMA = [
  ['Vær (MET/Yr)', [
    ['wx_place', 'Sted', e('PLACE', 'Oslo')],
    ['wx_lat', 'Breddegrad', e('LAT', '59.9139')],
    ['wx_lon', 'Lengdegrad', e('LON', '10.7522')],
  ]],
  ['Ruter (Entur)', [
    ['ruter_routes', 'Strekninger – én per linje: Fra (NSR-ID) > Til (NSR-ID)', e('RUTER_ROUTES', DEFAULT_ROUTES), false, 'textarea'],
    ['ruter_count', 'Antall avganger', '3'],
  ]],
  ['Kalender / timeplan', [
    ['cal_ics', 'iCal-URL (skole)', e('SCHOOL_ICAL_URL'), true],
    ['cal_mazemap', 'MazeMap campus-ID', e('MAZEMAP_CAMPUS_ID')],
    ['school_url', 'Skolens nettside', e('SCHOOL_URL', 'https://www.vilbli.no')],
  ]],
  ['Home Assistant', [
    ['ha_url', 'URL', e('HA_URL', 'http://192.168.1.20:8123')],
    ['ha_token', 'Long-lived token', e('HA_TOKEN'), true],
    ['ha_sensor_power', 'Effektsensor (nå)', e('HA_SENSOR_POWER', 'sensor.power_now')],
    ['ha_sensor_energy', 'Energisensor (daglig)', e('HA_SENSOR_ENERGY_DAILY', 'sensor.energy_daily')],
    ['ha_sensor_price', 'Strømpris-sensor', e('HA_SENSOR_PRICE', 'sensor.nordpool_kwh_oslo_nok')],
  ]],
  ['Sonarr', [
    ['sonarr_url', 'URL', e('SONARR_URL', 'http://192.168.1.20:8989')],
    ['sonarr_key', 'API-nøkkel', e('SONARR_API_KEY'), true],
    ['sonarr_days', 'Dager frem', e('SONARR_DAYS', '14')],
  ]],
  ['Radarr', [
    ['radarr_url', 'URL', e('RADARR_URL', 'http://192.168.1.20:7878')],
    ['radarr_key', 'API-nøkkel', e('RADARR_API_KEY'), true],
    ['radarr_days', 'Dager frem', e('RADARR_DAYS', '14')],
  ]],
  ['Trading 212', [
    ['t212_key', 'API-nøkkel', e('TRADING212_API_KEY'), true],
  ]],
  ['NASA / CelesTrak', [
    ['nasa_key', 'NASA API-nøkkel', e('NASA_API_KEY', 'DEMO_KEY'), true],
    ['sat_group', 'CelesTrak-gruppe', e('SAT_GROUP', 'starlink')],
  ]],
  ['Cloudflare', [
    ['cf_token', 'API-token (Zone:Read, DNS:Read, Registrar:Read)', e('CLOUDFLARE_API_TOKEN'), true],
    ['cf_domain', 'Domene', e('CLOUDFLARE_DOMAIN')],
  ]],
  ['Søk', [
    ['search_url', 'Søke-URL (søket legges til på slutten)', e('SEARCH_URL', 'https://www.google.com/search?q=')],
  ]],
];

const FIELDS = new Map(SCHEMA.flatMap(([, fs]) => fs.map((f) => [f[0], { key: f[0], label: f[1], def: f[2], secret: !!f[3], type: f[4] }])));

export function cfg(key) {
  const over = kv.get(OWNER, 'cfg', {});
  return over[key] ?? FIELDS.get(key)?.def ?? '';
}

// Til nettleseren: hemmeligheter vises bare som «satt / ikke satt».
export function publicConfig() {
  const over = kv.get(OWNER, 'cfg', {});
  return SCHEMA.map(([name, fs]) => ({
    name,
    fields: fs.map(([key]) => {
      const f = FIELDS.get(key), v = over[key] ?? f.def;
      return { key, label: f.label, type: f.secret ? 'password' : f.type ?? 'text', secret: f.secret, set: !!v,
        value: f.secret ? '' : v, custom: key in over };
    }),
  }));
}

const VALID = {
  wx_lat: (v) => Math.abs(+v) <= 90, wx_lon: (v) => Math.abs(+v) <= 180,
  ruter_count: (v) => +v >= 1 && +v <= 10, sonarr_days: (v) => +v >= 1 && +v <= 90, radarr_days: (v) => +v >= 1 && +v <= 365,
  sat_group: (v) => /^[a-z0-9-]{1,30}$/i.test(v),
  ruter_routes: (v) => parseRoutes(v).length > 0,
};
const isUrl = (v) => /^https?:\/\/[^\s]+$/.test(v);

// value === null fjerner overstyringen (tilbake til env/standard).
export function updateConfig(changes) {
  const over = kv.get(OWNER, 'cfg', {});
  for (const [key, raw] of Object.entries(changes)) {
    const f = FIELDS.get(key);
    if (!f) throw new Error(`Ukjent innstilling: ${key}`);
    if (raw === null) { delete over[key]; continue; }
    const v = String(raw).trim().slice(0, 4000);
    if (f.secret && v === '') continue; // tomt felt = behold lagret hemmelighet
    if (v && /_url$|cal_ics/.test(key) && !isUrl(v)) throw new Error(`${f.label}: ugyldig URL`);
    if (v && VALID[key] && !VALID[key](v)) throw new Error(`${f.label}: ugyldig verdi`);
    over[key] = v;
  }
  kv.set(OWNER, 'cfg', over);
  clearCache();
}

export function parseRoutes(text) {
  return String(text).split(/\r?\n/).map((l) => l.match(/^\s*(.+?)\s*\((?:NSR:StopPlace:)?(\d+)\)\s*(?:>|→|->)\s*(.+?)\s*\((?:NSR:StopPlace:)?(\d+)\)\s*$/))
    .filter(Boolean).map(([, fromName, fromId, toName, toId]) => ({ fromName, fromId, toName, toId }));
}
