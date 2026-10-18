// Integrasjonsinnstillinger som kan endres fra siden. Verdier i databasen overstyrer miljøvariabler.
// Hemmeligheter lagres kun på serveren og sendes aldri tilbake til nettleseren.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { kv, OWNER } from './db.js';
import { clearCache } from './cache.js';

// Hemmelige felt lagres kryptert (AES-256-GCM, nøkkel avledet fra SESSION_SECRET) med prefikset «enc1:».
// Eldre verdier i klartekst leses som før og krypteres neste gang de lagres.
let SECRET_KEY = null;
const secretKey = () => (SECRET_KEY ??= scryptSync(process.env.SESSION_SECRET || 'homelab-os', 'hl-settings-v1', 32));
function sealSecret(text) {
  if (!text) return text;
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', secretKey(), iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return 'enc1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function openSecret(v) {
  if (typeof v !== 'string' || !v.startsWith('enc1:')) return v;
  try {
    const b = Buffer.from(v.slice(5), 'base64'), d = createDecipheriv('aes-256-gcm', secretKey(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

const e = (k, d = '') => process.env[k] ?? d;

const DEFAULT_ROUTES = 'Amagerveien (6354) > Majorstuen (58381)\nFrydenlund (6258) > Majorstuen (58381)\nMajorstuen (58381) > Amagerveien (6354)\nMajorstuen (58381) > Holbergs plass (63280)';

// [gruppe, { id, domain (logo), category, help, guide? }, [[nøkkel, etikett, standardverdi (fra env), hemmelig?, type], …]]
export const SCHEMA = [
  ['Vær (MET/Yr)', { id: 'weather', domain: 'yr.no', category: 'Generelt', help: 'Stedet og koordinatene brukes til værmeldingen fra MET (yr.no). Finn koordinatene ved å høyreklikke på et sted i Google Maps.' }, [
    ['wx_place', 'Sted', e('PLACE', 'Oslo')],
    ['wx_lat', 'Breddegrad', e('LAT', '59.9139')],
    ['wx_lon', 'Lengdegrad', e('LON', '10.7522')],
  ]],
  ['Ruter (Entur)', { id: 'ruter', domain: 'ruter.no', category: 'Generelt', help: 'Finn stopp-ID (NSR) på stoppested.entur.org. Skriv én strekning per linje: Fra (ID) > Til (ID).' }, [
    ['ruter_routes', 'Strekninger – én per linje: Fra (NSR-ID) > Til (NSR-ID)', e('RUTER_ROUTES', DEFAULT_ROUTES), false, 'textarea'],
    ['ruter_count', 'Antall avganger', '3'],
  ]],
  ['Kalender / timeplan', { id: 'calendar', domain: 'calendar.google.com', category: 'Skole', help: 'Lim inn iCal-adressen fra Canvas (Kalender → Kalenderfeed) eller Outlook (Publiser kalender → ICS).' }, [
    ['cal_ics', 'iCal-URL (skole)', e('SCHOOL_ICAL_URL'), true],
    ['cal_mazemap', 'MazeMap campus-ID', e('MAZEMAP_CAMPUS_ID')],
    ['school_url', 'Skolens nettside', e('SCHOOL_URL', 'https://www.vilbli.no')],
  ]],
  ['Home Assistant', { id: 'ha', domain: 'home-assistant.io', category: 'Hjem', help: 'Lag et long-lived token i Home Assistant: Profil → Sikkerhet → Long-lived access tokens → Opprett token.' }, [
    ['ha_url', 'URL', e('HA_URL', 'http://192.168.1.20:8123')],
    ['ha_token', 'Long-lived token', e('HA_TOKEN'), true],
    ['ha_sensor_power', 'Effektsensor (nå)', e('HA_SENSOR_POWER', 'sensor.power_now')],
    ['ha_sensor_energy', 'Energisensor (daglig)', e('HA_SENSOR_ENERGY_DAILY', 'sensor.energy_daily')],
    ['ha_sensor_price', 'Strømpris-sensor', e('HA_SENSOR_PRICE', 'sensor.nordpool_kwh_oslo_nok')],
  ]],
  ['Sonarr', { id: 'sonarr', domain: 'sonarr.tv', category: 'Media', help: 'API-nøkkelen finner du i Sonarr under Settings → General → Security → API Key.' }, [
    ['sonarr_url', 'URL', e('SONARR_URL', 'http://192.168.1.20:8989')],
    ['sonarr_key', 'API-nøkkel', e('SONARR_API_KEY'), true],
    ['sonarr_days', 'Dager frem', e('SONARR_DAYS', '14')],
  ]],
  ['Radarr', { id: 'radarr', domain: 'radarr.video', category: 'Media', help: 'API-nøkkelen finner du i Radarr under Settings → General → Security → API Key.' }, [
    ['radarr_url', 'URL', e('RADARR_URL', 'http://192.168.1.20:7878')],
    ['radarr_key', 'API-nøkkel', e('RADARR_API_KEY'), true],
    ['radarr_days', 'Dager frem', e('RADARR_DAYS', '14')],
  ]],
  ['Plex', { id: 'plex', domain: 'plex.tv', category: 'Media', help: 'Plex må være tilgjengelig fra serveren som kjører dashbordet.', guide: [
    ['Finn adressen', 'Adressen er IP-en til serveren med port 32400, for eksempel http://192.168.1.20:32400. Du finner IP-en i Plex under Innstillinger → Fjerntilgang, eller i ruteren.'],
    ['Finn X-Plex-Token', 'Åpne Plex i nettleseren og logg inn. Velg en film eller episode → ⋯ → Hent info → Vis XML. Adressen som åpnes slutter med X-Plex-Token=…, og det som står etter = er tokenet.', 'http://192.168.1.20:32400/library/metadata/123?X-Plex-Token=AbCdEf123456'],
    ['Eller hent det fra serveren', 'Tokenet står også i filen Preferences.xml som PlexOnlineToken. I Docker ligger den i config-mappen til Plex.', 'grep -o \'PlexOnlineToken="[^"]*"\' Preferences.xml'],
    ['Test', 'Trykk Test tilkobling. Testen henter servernavn, versjon og antall som spiller nå. Tokenet gir full tilgang til Plex-kontoen, så det lagres bare på serveren.'],
  ] }, [
    ['plex_url', 'URL', e('PLEX_URL', 'http://192.168.1.20:32400')],
    ['plex_token', 'X-Plex-Token', e('PLEX_TOKEN'), true],
  ]],
  ['Jellyfin', { id: 'jellyfin', domain: 'jellyfin.org', category: 'Media', help: 'Jellyfin må være tilgjengelig fra serveren som kjører dashbordet.', guide: [
    ['Finn adressen', 'Adressen er IP-en til serveren med port 8096, for eksempel http://192.168.1.20:8096.'],
    ['Lag en API-nøkkel', 'I Jellyfin: Kontrollpanel → Avansert → API-nøkler → +. Gi den navnet Homelab og kopier nøkkelen.'],
    ['Skriv brukernavnet', '«Nylig lagt til» hentes for én bruker. Skriv brukernavnet du logger inn med i Jellyfin. Tomt felt bruker den første brukeren.'],
    ['Test', 'Trykk Test tilkobling. Testen henter servernavn, versjon, antall som spiller nå, og sjekker at brukeren finnes.'],
  ] }, [
    ['jf_url', 'URL', e('JELLYFIN_URL', 'http://192.168.1.20:8096')],
    ['jf_key', 'API-nøkkel', e('JELLYFIN_API_KEY'), true],
    ['jf_user', 'Brukernavn (for «Nylig lagt til»)', e('JELLYFIN_USER')],
  ]],
  ['Trading 212', { id: 't212', domain: 'trading212.com', category: 'Økonomi', help: 'Lag nøkkelen på app.trading212.com under Innstillinger → API, i samme konto og miljø (Live eller Demo). Gi bare lesetilgang.' }, [
    ['t212_key', 'API-nøkkel (Key ID)', e('TRADING212_API_KEY'), true],
    ['t212_secret', 'Secret', e('TRADING212_API_SECRET'), true],
    ['t212_env', 'Miljø (live eller demo)', e('TRADING212_ENV', 'live')],
  ]],
  ['NASA / CelesTrak', { id: 'nasa', domain: 'nasa.gov', category: 'Rom', help: 'En egen nøkkel får du gratis på api.nasa.gov. DEMO_KEY virker, men har lav grense.' }, [
    ['nasa_key', 'NASA API-nøkkel', e('NASA_API_KEY', 'DEMO_KEY'), true],
    ['sat_group', 'CelesTrak-gruppe', e('SAT_GROUP', 'starlink')],
  ]],
  ['Bakgrunner', { id: 'backgrounds', domain: 'unsplash.com', category: 'Hjem', help: 'Brukes til bakgrunnene Oslo og Vær. Uten nøkler vises egne opplastede bilder og de medfølgende illustrasjonene. Planeter kommer fra NASA og trenger ingen nøkkel.', guide: [
    ['Unsplash', 'Lag en gratis app på unsplash.com/developers og kopier «Access Key». Fotografen krediteres automatisk med lenke, slik Unsplash krever.'],
    ['Pexels', 'Lag en gratis nøkkel på pexels.com/api. Brukes når Unsplash mangler eller ikke gir treff.'],
    ['Egne bilder', 'Last opp egne Oslo-bilder i Utseende → Bakgrunn. Getty-bilder kan bare brukes hvis du har kjøpt lisens.'],
  ] }, [
    ['unsplash_key', 'Unsplash Access Key', e('UNSPLASH_ACCESS_KEY'), true],
    ['pexels_key', 'Pexels API-nøkkel', e('PEXELS_API_KEY'), true],
  ]],
  ['Cloudflare', { id: 'cloudflare', domain: 'cloudflare.com', category: 'Nettverk', help: 'Lag tokenet i Cloudflare under My Profile → API Tokens med Zone, DNS, Analytics, Registrar og Firewall Services: Read.' }, [
    ['cf_token', 'Standard-token for Domener (Zone, DNS, Analytics, Registrar og Firewall Services: Read)', e('CLOUDFLARE_API_TOKEN'), true],
    ['cf_domain', 'Første domene (legges inn i Domener ved oppstart)', e('CLOUDFLARE_DOMAIN')],
  ]],
  ['Sporing', { id: 'tracking', domain: 'posten.no', category: 'Hjem', help: 'Nøkler til transportørenes sporings-API. Uten nøkkel for en transportør brukes 17TRACK som reserve. Pakker kan spores uten nøkler, men da oppdateres ikke statusen automatisk.', guide: [
    ['Posten og Bring', 'Lag en gratis Mybring-bruker på mybring.com, og hent API-nøkkelen under Mybring → Innstillinger → API. Brukeren er e-postadressen din.'],
    ['PostNord', 'Registrer deg på developer.postnord.com og lag en API-nøkkel for «Track and Trace».'],
    ['DHL', 'Lag en app på developer.dhl.com og legg til «Shipment Tracking – Unified». Bruk API Key (ikke secret).'],
    ['UPS', 'Lag en app på developer.ups.com med produktet «Tracking», og kopier Client ID og Client Secret (OAuth).'],
    ['17TRACK (reserve)', 'Lag en konto på api.17track.net. Den dekker FedEx, GLS, DB Schenker, Helthjem, Budbee, Instabox og de fleste andre. Gratisplanen har en månedlig kvote.'],
    ['ParcelsApp (siste reserve)', 'Lag en API-nøkkel på parcelsapp.com/developers/console/api-keys. Gratisplanen har 3 oppslag i måneden, så den brukes bare når du selv legger til eller oppdaterer en sending som ingen annen kilde kjenner. Serveren teller oppslagene.'],
  ] }, [
    ['trk_bring_uid', 'Posten/Bring: Mybring-bruker (e-post)', e('BRING_API_UID')],
    ['trk_bring_key', 'Posten/Bring: API-nøkkel', e('BRING_API_KEY'), true],
    ['trk_postnord_key', 'PostNord: API-nøkkel', e('POSTNORD_API_KEY'), true],
    ['trk_dhl_key', 'DHL: API-nøkkel', e('DHL_API_KEY'), true],
    ['trk_ups_id', 'UPS: Client ID', e('UPS_CLIENT_ID')],
    ['trk_ups_secret', 'UPS: Client Secret', e('UPS_CLIENT_SECRET'), true],
    ['trk_17_key', '17TRACK: API-nøkkel (reserve)', e('TRACK17_API_KEY'), true],
    ['trk_parcelsapp_key', 'ParcelsApp: API-nøkkel (reserve, 3 oppslag i måneden)', e('PARCELSAPP_API_KEY'), true],
  ]],
  ['Søk', { id: 'search', domain: 'google.com', category: 'Generelt', help: 'Søket legges til på slutten av adressen, for eksempel https://www.google.com/search?q=' }, [
    ['search_url', 'Søke-URL (søket legges til på slutten)', e('SEARCH_URL', 'https://www.google.com/search?q=')],
  ]],
];

const FIELDS = new Map(SCHEMA.flatMap(([, , fs]) => fs.map((f) => [f[0], { key: f[0], label: f[1], def: f[2], secret: !!f[3], type: f[4] }])));

/** Verdien som er lagret fra siden (dekryptert), uten fallback til miljø/standard. undefined hvis ingen. */
export function cfgOverride(key) {
  const v = kv.get(OWNER, 'cfg', {})[key];
  return v == null ? undefined : openSecret(v);
}

export function cfg(key) {
  const over = kv.get(OWNER, 'cfg', {});
  return over[key] != null ? openSecret(over[key]) : FIELDS.get(key)?.def ?? '';
}

// Til nettleseren: hemmeligheter vises bare som «satt / ikke satt».
export function publicConfig() {
  const over = kv.get(OWNER, 'cfg', {});
  return SCHEMA.map(([name, meta, fs]) => ({
    name, id: meta.id, domain: meta.domain, category: meta.category, help: meta.help ?? '', guide: meta.guide ?? [],
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
  t212_env: (v) => /^(live|demo)$/.test(v),
  jf_user: (v) => /^[\p{L}\p{N} ._@-]{1,64}$/u.test(v),
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
    over[key] = f.secret ? sealSecret(v) : v;
  }
  kv.set(OWNER, 'cfg', over);
  clearCache();
}

export function parseRoutes(text) {
  return String(text).split(/\r?\n/).map((l) => l.match(/^\s*(.+?)\s*\((?:NSR:StopPlace:)?(\d+)\)\s*(?:>|→|->)\s*(.+?)\s*\((?:NSR:StopPlace:)?(\d+)\)\s*$/))
    .filter(Boolean).map(([, fromName, fromId, toName, toId]) => ({ fromName, fromId, toName, toId }));
}

// Passord satt i Innstillinger overstyrer APP_PASSWORD_HASH fra miljøet.
export function passwordHash() {
  return kv.get(OWNER, 'password_hash', '') || process.env.APP_PASSWORD_HASH || '';
}
export function setPasswordHash(hash) { kv.set(OWNER, 'password_hash', hash); }

/** Finner en gruppe etter navn eller id (f.eks. «Plex» eller «plex»). */
export function groupOf(nameOrId) {
  const g = SCHEMA.find(([name, meta]) => name === nameOrId || meta.id === nameOrId);
  return g ? { name: g[0], ...g[1] } : null;
}
