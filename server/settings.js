// Integrasjonsinnstillinger som kan endres fra siden. Verdier i databasen overstyrer miljøvariabler.
// Hemmeligheter lagres kun på serveren og sendes aldri tilbake til nettleseren.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';
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

export { sealSecret, openSecret }; // prompt 37: tracking37.js (husstandens sporingsnøkler)
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
  // Prompt 26: Kalender-modulen leser skolens iCal (timeplan, prøver) og en valgfri Canvas-iCal (innleveringer), per bruker.
  ['Kalender / timeplan', { id: 'calendar', scope: 'personal', domain: 'calendar.google.com', category: 'Skole', help: 'Lim inn iCal-adressen fra Canvas (Kalender → Kalenderfeed) eller Outlook (Publiser kalender → ICS).', guide: [
    ['Finn skolens iCal-adresse', 'Timeplanen ligger i skolens system (Visma InSchool, Outlook eller Teams). Se etter «Abonner på kalender», «Publiser kalender» eller «Eksporter til kalender», og kopier adressen som slutter på .ics.', 'https://skole.example.no/kalender/elev/abc123.ics'],
    ['Canvas (valgfritt)', 'I Canvas: Kalender → Kalenderfeed nederst til høyre. Kopier adressen. Den gir innleveringer og frister fra alle fagene.', 'https://skole.instructure.com/feeds/calendars/user_abc123.ics'],
    ['Lim inn', 'Lim inn adressene under Skole-iCal og Canvas-iCal. webcal:// gjøres om til https:// automatisk. Kalenderen hentes på nytt hver time.'],
    ['MazeMap (valgfritt)', 'Campus-ID-en står i adressen når du åpner skolen i use.mazemap.com (campusid=…). Da får hvert rom en lenke «Finn rommet i MazeMap».'],
    ['Test', 'Trykk Test tilkobling. Testen henter kalenderne og teller hendelsene.'],
  ] }, [
    ['cal_ics', 'iCal-URL (skole)', e('SCHOOL_ICAL_URL'), true],
    ['canvas_ics', 'Canvas-iCal (valgfri)', e('CANVAS_ICAL_URL'), true],
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
  // Prompt 24: Bursdager. OAuth-klienten (type «Web application») lages i Google Cloud Console; hver bruker logger inn selv.
  ['Google Kalender', { id: 'google', domain: 'calendar.google.com', category: 'Hjem', help: 'Brukes av Bursdager. Lag en OAuth-klient (Web application) i Google Cloud Console → APIs & Services → Credentials, slå på Google Calendar API, og legg inn omdirigerings-URI-en https://<din adresse>/api/birthdays/google/callback.', guide: [
    ['Lag klienten', 'console.cloud.google.com → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.'],
    ['Omdirigering', 'Under «Authorized redirect URIs» legger du inn BEGGE: https://<din adresse>/api/birthdays/google/callback (Kalender og Bursdager) og https://<din adresse>/api/gsc/callback (Search Console). Tomt felt for omdirigerings-URI her betyr at serveren bruker adressen den blir nådd på.'],
    ['Search Console', 'Slå også på «Google Search Console API» under APIs & Services → Library, og legg til scopet webmasters.readonly på samtykkeskjermen.'],
    ['Samtykke', 'OAuth consent screen: legg til scopene calendar.events og calendar.readonly, og legg brukerne inn som testbrukere til appen er publisert.'],
  ] }, [
    ['googleClientId', 'Klient-ID', e('GOOGLE_CLIENT_ID')],
    ['googleClientSecret', 'Klienthemmelighet', e('GOOGLE_CLIENT_SECRET'), true],
    ['googleRedirectUri', 'Omdirigerings-URI (valgfri)', e('GOOGLE_REDIRECT_URI')],
  ]],
  ['Sonarr', { id: 'sonarr', scope: 'personal', domain: 'sonarr.tv', category: 'Media', help: 'API-nøkkelen finner du i Sonarr under Settings → General → Security → API Key.' }, [
    ['sonarr_url', 'URL', e('SONARR_URL', 'http://192.168.1.20:8989')],
    ['sonarr_key', 'API-nøkkel', e('SONARR_API_KEY'), true],
    ['sonarr_days', 'Dager frem', e('SONARR_DAYS', '14')],
  ]],
  ['Radarr', { id: 'radarr', scope: 'personal', domain: 'radarr.video', category: 'Media', help: 'API-nøkkelen finner du i Radarr under Settings → General → Security → API Key.' }, [
    ['radarr_url', 'URL', e('RADARR_URL', 'http://192.168.1.20:7878')],
    ['radarr_key', 'API-nøkkel', e('RADARR_API_KEY'), true],
    ['radarr_days', 'Dager frem', e('RADARR_DAYS', '14')],
  ]],
  ['Plex', { id: 'plex', scope: 'personal', domain: 'plex.tv', category: 'Media', help: 'Plex må være tilgjengelig fra serveren som kjører dashbordet.', guide: [
    ['Finn adressen', 'Adressen er IP-en til serveren med port 32400, for eksempel http://192.168.1.20:32400. Du finner IP-en i Plex under Innstillinger → Fjerntilgang, eller i ruteren.'],
    ['Finn X-Plex-Token', 'Åpne Plex i nettleseren og logg inn. Velg en film eller episode → ⋯ → Hent info → Vis XML. Adressen som åpnes slutter med X-Plex-Token=…, og det som står etter = er tokenet.', 'http://192.168.1.20:32400/library/metadata/123?X-Plex-Token=AbCdEf123456'],
    ['Eller hent det fra serveren', 'Tokenet står også i filen Preferences.xml som PlexOnlineToken. I Docker ligger den i config-mappen til Plex.', 'grep -o \'PlexOnlineToken="[^"]*"\' Preferences.xml'],
    ['Test', 'Trykk Test tilkobling. Testen henter servernavn, versjon og antall som spiller nå. Tokenet gir full tilgang til Plex-kontoen, så det lagres bare på serveren.'],
  ] }, [
    ['plex_url', 'URL', e('PLEX_URL', 'http://192.168.1.20:32400')],
    ['plex_token', 'X-Plex-Token', e('PLEX_TOKEN'), true],
  ]],
  ['Jellyfin', { id: 'jellyfin', scope: 'personal', domain: 'jellyfin.org', category: 'Media', help: 'Jellyfin må være tilgjengelig fra serveren som kjører dashbordet.', guide: [
    ['Finn adressen', 'Adressen er IP-en til serveren med port 8096, for eksempel http://192.168.1.20:8096.'],
    ['Lag en API-nøkkel', 'I Jellyfin: Kontrollpanel → Avansert → API-nøkler → +. Gi den navnet Homelab og kopier nøkkelen.'],
    ['Skriv brukernavnet', '«Nylig lagt til» hentes for én bruker. Skriv brukernavnet du logger inn med i Jellyfin. Tomt felt bruker den første brukeren.'],
    ['Test', 'Trykk Test tilkobling. Testen henter servernavn, versjon, antall som spiller nå, og sjekker at brukeren finnes.'],
  ] }, [
    ['jf_url', 'URL', e('JELLYFIN_URL', 'http://192.168.1.20:8096')],
    ['jf_key', 'API-nøkkel', e('JELLYFIN_API_KEY'), true],
    ['jf_user', 'Brukernavn (for «Nylig lagt til»)', e('JELLYFIN_USER')],
  ]],
  ['Trading 212', { id: 't212', scope: 'personal', domain: 'trading212.com', category: 'Økonomi', help: 'Lag nøkkelen på app.trading212.com under Innstillinger → API, i samme konto og miljø (Live eller Demo). Gi bare lesetilgang.' }, [
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
  ['Sporing', { id: 'tracking', scope: 'personal', domain: 'posten.no', category: 'Hjem', help: 'Nøkler til transportørenes sporings-API. Uten nøkkel for en transportør brukes 17TRACK som reserve. Pakker kan spores uten nøkler, men da oppdateres ikke statusen automatisk.', guide: [
    ['Posten og Bring', 'Lag en gratis Mybring-bruker på mybring.com, og hent API-nøkkelen under Mybring → Innstillinger → API. Brukeren er e-postadressen din.'],
    ['PostNord', 'Nøkkelen er valgfri. Uten nøkkel hentes status fra PostNords offentlige sporingsside (uoffisielt), med ParcelsApp som reserve. Har du organisasjonsnummer, kan du lage en API-nøkkel for «Track and Trace» på developer.postnord.com.'],
    ['DHL', 'Lag en app på developer.dhl.com og legg til «Shipment Tracking – Unified». Bruk API Key (ikke secret).'],
    ['UPS', 'Lag en app på developer.ups.com med produktet «Tracking», og kopier Client ID og Client Secret (OAuth).'],
    ['17TRACK (reserve)', 'Lag en konto på api.17track.net. Den dekker FedEx, GLS, DB Schenker, Helthjem, Budbee, Instabox og de fleste andre. Gratisplanen har en månedlig kvote.'],
    ['ParcelsApp (siste reserve)', 'Lag en API-nøkkel på parcelsapp.com/developers/console/api-keys. Gratisplanen har 3 oppslag i måneden, så den brukes bare når du selv legger til eller oppdaterer en sending som ingen annen kilde kjenner. Serveren teller oppslagene.'],
  ] }, [
    // Prompt 22: nøklene heter mybringUid, mybringKey og postnordKey. De gamle navnene (trk_bring_uid …) leses fortsatt, se LEGACY.
    ['mybringUid', 'Posten/Bring: Mybring-bruker (X-Mybring-API-Uid, e-post)', e('BRING_API_UID')],
    ['mybringKey', 'Posten/Bring: Mybring API-nøkkel (X-Mybring-API-Key)', e('BRING_API_KEY'), true],
    ['postnordKey', 'PostNord: API-nøkkel (valgfri)', e('POSTNORD_API_KEY'), true],
    ['trk_dhl_key', 'DHL: API-nøkkel', e('DHL_API_KEY'), true],
    ['trk_ups_id', 'UPS: Client ID', e('UPS_CLIENT_ID')],
    ['trk_ups_secret', 'UPS: Client Secret', e('UPS_CLIENT_SECRET'), true],
    ['trk_17_key', '17TRACK: API-nøkkel (reserve)', e('TRACK17_API_KEY'), true],
    ['trk_parcelsapp_key', 'ParcelsApp: API-nøkkel (reserve, 3 oppslag i måneden)', e('PARCELSAPP_API_KEY'), true],
  ]],
  ['Kart', { id: 'map', domain: 'maptiler.com', category: 'Generelt', help: 'Kartet bruker CARTO og Kartverket (topo) via serverens egen kartproxy (/tiles), uten nøkkel. Med en nøkkel kan du også velge MapTiler eller Stadia Maps.', guide: [
    ['MapTiler', 'Lag en gratis konto på cloud.maptiler.com og kopier nøkkelen under Account → API keys.'],
    ['Stadia Maps (valgfritt)', 'Lag en gratis konto på client.stadiamaps.com og lag en API-nøkkel for eiendommen din.'],
  ] }, [
    ['maptilerKey', 'MapTiler API-nøkkel', e('MAPTILER_KEY'), true],
    ['stadiaKey', 'Stadia Maps API-nøkkel (valgfri)', e('STADIA_KEY'), true],
  ]],
  ['Søk', { id: 'search', domain: 'google.com', category: 'Generelt', help: 'Søket legges til på slutten av adressen, for eksempel https://www.google.com/search?q=' }, [
    ['search_url', 'Søke-URL (søket legges til på slutten)', e('SEARCH_URL', 'https://www.google.com/search?q=')],
  ]],
  // Prompt 27: Chat. Open WebUI er serveroppsett (admin); uten den bruker Chat egen lagring og Ollama/Gemini/Groq direkte.
  ['Open WebUI', { id: 'openwebui', domain: 'openwebui.com', category: 'AI', help: 'Valgfri motor for Chat (historikk, kunnskapsbase, nettsøk, tale). Lag en API-nøkkel i Open WebUI under Innstillinger → Konto → API-nøkler. Uten Open WebUI virker Chat med Ollama, Gemini og Groq direkte.' }, [
    ['openwebui_url', 'Adresse', e('OPENWEBUI_URL')],
    ['openwebui_key', 'API-nøkkel', e('OPENWEBUI_KEY'), true],
  ]],
  // Prompt 27: personlige valg for Chat og for logo-oppslag (Innstillinger → AI og tolkning → CHAT / PERSONVERN OG LOGOER).
  ['Chat', { id: 'chat', scope: 'personal', domain: 'openwebui.com', category: 'AI', help: 'Dine valg for Chat. «Mine data» gir modellen et kort sammendrag fra Finans, Kalender og Huskeliste.' }, [
    ['chat_my_data', 'Chat kan lese mine data', '0', false, 'bool'],
    ['chat_ask_cloud', 'Spør før sky-modeller får data', '1', false, 'bool'],
    ['chat_default_model', 'Standardmodell', ''],
    ['chat_theme', 'Tema (papir eller noytral)', 'papir'],
  ]],
  ['Personvern og logoer', { id: 'privacy', scope: 'personal', domain: 'brreg.no', category: 'AI', help: 'Logoer finnes uten at AI gjetter: Brønnøysundregistrene, nettstedet selv og (valgfritt) Gemini med bare butikknavnet.' }, [
    ['logo_local_receipts', 'Les kvitteringer lokalt', '1', false, 'bool'],
    ['logo_gemini', 'Finn logo med Gemini', '1', false, 'bool'],
    ['logo_verify', 'Sjekk logoen før den lagres', '1', false, 'bool'],
  ]],
  // Korte AI-oppgaver (Glimt, rask time, logo, kvitteringer, oppsummeringer …) sender think:false til Ollama (server/ollama-opts.js).
  ['Lokal AI', { id: 'ailocal', scope: 'personal', domain: 'ollama.com', category: 'AI', help: 'Lokal AI (Ollama) i korte oppgaver som Glimt, rask time, logoer, kvitteringer og oppsummeringer. Tenkemodeller svarer mye raskere når de ikke tenker først.' }, [
    ['ai_think', 'La modellen tenke før den svarer (tregere, men noen ganger smartere)', '0', false, 'bool'],
  ]],
];

// Gamle nøkkelnavn → nye (prompt 22). Lagrede verdier under det gamle navnet brukes til noe lagres under det nye,
// og PUT med det gamle navnet lagres under det nye. Ingenting slettes.
export const LEGACY = { trk_bring_uid: 'mybringUid', trk_bring_key: 'mybringKey', trk_postnord_key: 'postnordKey' };
const LEGACY_OF = Object.fromEntries(Object.entries(LEGACY).map(([o, n]) => [n, o]));
const stored = (over, key) => (over[key] != null ? over[key] : LEGACY_OF[key] && over[LEGACY_OF[key]] != null ? over[LEGACY_OF[key]] : undefined);

const FIELDS = new Map(SCHEMA.flatMap(([, meta, fs]) => fs.map((f) => [f[0], { key: f[0], label: f[1], def: f[2], secret: !!f[3], type: f[4], personal: meta.scope === 'personal' }])));

/* ---------------- Personlige integrasjoner per bruker (ISO2) ---------------- */
// Plex/Jellyfin, Sonarr/Radarr, skolekalender, Trading 212, sporingsnøkler og IMAP er personlige: hver bruker har sine egne
// verdier i kv(user,'cfg_personal'). Resten (MET, Entur, HA, Cloudflare, Kart, Bilder, Google-klient …) er serveroppsett hos OWNER.
// Miljøvariablene (PLEX_TOKEN, IMAP_HOST …) tilhører eieren (OWNER); andre brukere starter tomme.
const envOr = (k, d = '') => process.env[k] || d;
// IMAP til FinansHub (kvitteringer på e-post) og Sporing. Ikke i SCHEMA (vises under /api/integrations → imap).
const IMAP_FIELDS = [
  ['imapHost', 'IMAP-vert', envOr('IMAP_HOST'), false],
  ['imapPort', 'IMAP-port', envOr('IMAP_PORT', '143'), false],
  ['imapSecurity', 'Sikkerhet', ['starttls', 'tls', 'none'].includes(process.env.IMAP_SECURITY) ? process.env.IMAP_SECURITY : 'starttls', false],
  ['imapUser', 'IMAP-brukernavn', envOr('IMAP_USER'), false],
  ['imapPass', 'IMAP-passord', envOr('IMAP_PASSWORD', envOr('FINN_IMAP_PASSWORD')), true],
  ['imapFolder', 'Mappe', envOr('IMAP_FOLDER', 'Folders/Kvitteringer'), false],
  ['imapDoneFolder', 'Mappe for leste', envOr('IMAP_DONE_FOLDER', 'Folders/Kvitteringer/Lest'), false],
  ['imapFinnFolder', 'Mappe for Finn-e-poster', envOr('IMAP_FINN_FOLDER'), false],
];
for (const [key, label, def, secret] of IMAP_FIELDS) FIELDS.set(key, { key, label, def, secret, personal: true, hidden: true });
export const PERSONAL_KEYS = new Set([...FIELDS.values()].filter((f) => f.personal).map((f) => f.key));
export const isPersonalKey = (k) => PERSONAL_KEYS.has(LEGACY[k] ?? k);
// Ufarlige standarder for andre enn eieren (ingen adresser, nøkler eller e-post fra eierens miljø).
const SAFE_DEF = { t212_env: 'live', sonarr_days: '14', radarr_days: '14', imapPort: '143', imapSecurity: 'starttls', imapFolder: 'Folders/Kvitteringer', imapDoneFolder: 'Folders/Kvitteringer/Lest',
  chat_my_data: '0', chat_ask_cloud: '1', chat_theme: 'papir', logo_local_receipts: '1', logo_gemini: '1', logo_verify: '1', ai_think: '0' };
const defFor = (user, f) => (user === OWNER ? f.def ?? '' : SAFE_DEF[f.key] ?? '');

// FinansHub krypterer sine hemmeligheter med «enc:» (finans/db.js). Kopierte verdier derfra åpnes her med samme nøkkel.
let FH_KEY = null;
const fhKey = () => (FH_KEY ??= createHash('sha256').update('fh-secret:' + (process.env.SECRET_KEY || config.sessionSecret || 'dev')).digest());
function openAny(v) {
  if (typeof v === 'string' && v.startsWith('enc:')) {
    try {
      const b = Buffer.from(v.slice(4), 'base64'), d = createDecipheriv('aes-256-gcm', fhKey(), b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    } catch { return ''; }
  }
  return openSecret(v);
}

// Hvem forespørselen gjelder. index.js kjører hver forespørsel i runRequest(c, …); runAsUser brukes av bakgrunnsjobber.
const ctx = new AsyncLocalStorage();
export const runAsUser = (user, fn) => ctx.run({ user }, fn);
export const runRequest = (c, fn) => ctx.run({ c }, fn);
/** Innlogget bruker i denne forespørselen/jobben. undefined = utenfor forespørsel (oppstart, eldre jobber), null = ikke innlogget. */
export function currentUser() {
  const s = ctx.getStore();
  if (!s) return undefined;
  if ('user' in s) return s.user ?? null;
  try { return s.c.get('user') ?? null; } catch { return null; }
}
const userOf = () => { const u = currentUser(); return u === undefined ? OWNER : u; };
/** Brukeren cfg() leser personlige verdier for: innlogget bruker, OWNER utenfor forespørsler, null hvis ikke innlogget. */
export const activeUser = userOf;

const personal = (user) => (user ? kv.get(user, 'cfg_personal', {}) ?? {} : {});
/** Lagret personlig verdi (dekryptert) eller undefined. */
// Eieren: verdier som fortsatt bare ligger i det gamle felles oppsettet (kv OWNER/'cfg', også gamle nøkkelnavn) leses derfra.
export function userCfgOverride(user, key) {
  key = LEGACY[key] ?? key;
  let v = personal(user)[key];
  if (v == null && user === OWNER) v = stored(kv.get(OWNER, 'cfg', {}) ?? {}, key);
  return v == null ? undefined : openAny(v);
}
/** Brukerens verdi for en personlig nøkkel (med standard). For servernøkler: serververdien. */
export function userCfg(user, key) {
  key = LEGACY[key] ?? key;
  const f = FIELDS.get(key);
  if (!f?.personal) return cfg(key);
  const v = userCfgOverride(user, key);
  return v !== undefined ? v : defFor(user, f);
}
export const userSecret = (user, key) => userCfg(user, key) || '';
/** Prompt 27: av/på-innstilling ('1'/'0', 'true'/'false', 'on'/'off'). */
export const userBool = (user, key) => /^(1|true|on|ja|yes)$/i.test(String(userCfg(user, key) ?? '').trim());
/** true hvis brukeren selv har lagret verdien (ikke standard/miljø). */
export const userCfgSet = (user, key) => { const v = userCfgOverride(user, key); return v !== undefined && v !== ''; };

/** Lagrer personlige verdier for user. null fjerner, tomt hemmelig felt beholdes. */
export function setUserCfg(user, changes) {
  if (!user) throw Object.assign(new Error('Ikke innlogget'), { status: 401 });
  const over = { ...personal(user) };
  for (const [k0, raw] of Object.entries(changes)) {
    const key = LEGACY[k0] ?? k0;
    const f = FIELDS.get(key);
    if (!f?.personal) throw new Error(`Ukjent personlig innstilling: ${k0}`);
    if (raw === null) {
      delete over[key];
      // Eieren: fjern også den gamle felles verdien, ellers leses den igjen (som «Fjern» gjorde før ISO2).
      if (user === OWNER) { const old = kv.get(OWNER, 'cfg', {}) ?? {}; if (key in old || (LEGACY_OF[key] && LEGACY_OF[key] in old)) { delete old[key]; if (LEGACY_OF[key]) delete old[LEGACY_OF[key]]; kv.set(OWNER, 'cfg', old); } }
      continue;
    }
    let v = String(raw).trim().slice(0, 4000);
    if (f.secret && v === '') continue;
    if (/_ics$/.test(key)) v = v.replace(/^webcals?:\/\//i, 'https://'); // prompt 26: abonnementslenker (webcal://) hentes over https
    if (v && /_url$|_ics$/.test(key) && !isUrl(v)) throw new Error(`${f.label}: ugyldig URL`);
    if (v && VALID[key] && !VALID[key](v)) throw new Error(`${f.label}: ugyldig verdi`);
    if (f.type === 'bool') v = boolText(v);
    if (key === 'chat_theme') v = v.toLowerCase().replace('ø', 'o');
    over[key] = f.secret ? sealSecret(v) : v;
  }
  kv.set(user, 'cfg_personal', over);
  clearCache();
}

// Engangsmigrering: eierens eksisterende verdier KOPIERES til kv(OWNER,'cfg_personal'). Ingenting slettes.
// Trading 212 og IMAP hentes fra FinansHub (fh_secret/fh_settings) først, siden de har ligget der.
(function migratePersonal() {
  if (kv.get(OWNER, 'cfg_personal_v1')) return;
  const old = kv.get(OWNER, 'cfg', {}) ?? {}, fhs = kv.get(OWNER, 'fh_settings', {}) ?? {}, fhx = kv.get(OWNER, 'fh_secret', {}) ?? {};
  const out = { ...(kv.get(OWNER, 'cfg_personal', {}) ?? {}) };
  const put = (k, v) => { if (out[k] === undefined && v !== undefined && v !== null && v !== '') out[k] = typeof v === 'string' ? v : String(v); };
  for (const k of PERSONAL_KEYS) put(k, stored(old, k));
  if (fhx.t212Key && fhx.t212Secret) { out.t212_key = fhx.t212Key; out.t212_secret = fhx.t212Secret; if (fhs.t212Env) out.t212_env = fhs.t212Env; }
  else { put('t212_key', fhx.t212Key); put('t212_secret', fhx.t212Secret); put('t212_env', fhs.t212Env); }
  for (const [k] of IMAP_FIELDS) put(k, k === 'imapPass' ? fhx.imapPass : fhs[k]);
  kv.set(OWNER, 'cfg_personal', out);
  kv.set(OWNER, 'cfg_personal_v1', Date.now());
})();

/** Verdien som er lagret fra siden (dekryptert), uten fallback til miljø/standard. undefined hvis ingen. Personlig nøkkel: innlogget bruker. */
export function cfgOverride(key) {
  key = LEGACY[key] ?? key;
  if (FIELDS.get(key)?.personal) return userCfgOverride(userOf(), key);
  const v = stored(kv.get(OWNER, 'cfg', {}), key);
  return v == null ? undefined : openSecret(v);
}

export function cfg(key) {
  key = LEGACY[key] ?? key;
  const f = FIELDS.get(key);
  if (f?.personal) return userCfg(userOf(), key);
  const v = stored(kv.get(OWNER, 'cfg', {}), key);
  return v != null ? openSecret(v) : f?.def ?? '';
}

/**
 * Til nettleseren: hemmeligheter vises bare som «satt / ikke satt». Hver gruppe har scope 'personal' (brukerens egne) eller 'server'.
 * Personlige grupper viser user sine verdier. Servergruppene tas bare med når admin er true.
 */
export function publicConfig(user = OWNER, { admin = true } = {}) {
  const over = kv.get(OWNER, 'cfg', {}), mine = personal(user);
  return SCHEMA.filter(([, meta]) => admin || meta.scope === 'personal').map(([name, meta, fs]) => {
    const scope = meta.scope === 'personal' ? 'personal' : 'server';
    return {
      name, id: meta.id, scope, domain: meta.domain, category: meta.category, help: meta.help ?? '', guide: meta.guide ?? [],
      fields: fs.map(([key]) => {
        const f = FIELDS.get(key);
        const own = scope === 'personal' ? userCfgOverride(user, key) : stored(over, key);
        const v = own ?? (scope === 'personal' ? defFor(user, f) : f.def);
        return { key, label: f.label, type: f.secret ? 'password' : f.type ?? 'text', secret: f.secret, set: !!v,
          value: f.secret ? '' : v, custom: own !== undefined };
      }),
    };
  });
}

const VALID = {
  wx_lat: (v) => Math.abs(+v) <= 90, wx_lon: (v) => Math.abs(+v) <= 180,
  ruter_count: (v) => +v >= 1 && +v <= 10, sonarr_days: (v) => +v >= 1 && +v <= 90, radarr_days: (v) => +v >= 1 && +v <= 365,
  t212_env: (v) => /^(live|demo)$/.test(v),
  jf_user: (v) => /^[\p{L}\p{N} ._@-]{1,64}$/u.test(v),
  sat_group: (v) => /^[a-z0-9-]{1,30}$/i.test(v),
  ruter_routes: (v) => parseRoutes(v).length > 0,
  googleRedirectUri: (v) => /^https?:\/\/[^\s]+\/api\/birthdays\/google\/callback$/.test(v),
  googleClientId: (v) => /^[\w.-]{8,200}$/.test(v),
  chat_theme: (v) => /^(papir|noytral|nøytral)$/i.test(v),
  chat_default_model: (v) => /^[\w.:\/@+-]{1,120}$/.test(v),
};
// Prompt 27: av/på-felt (type 'bool') godtar 1/0, true/false, on/off og lagres som '1' eller '0'.
for (const f of FIELDS.values()) if (f.type === 'bool') VALID[f.key] = (v) => /^(0|1|true|false|on|off|ja|nei|yes|no)$/i.test(v);
export const boolText = (v) => (/^(1|true|on|ja|yes)$/i.test(String(v).trim()) ? '1' : '0');
const isUrl = (v) => /^https?:\/\/[^\s]+$/.test(v);

// value === null fjerner overstyringen (tilbake til env/standard).
// Personlige nøkler lagres hos user (kv cfg_personal). Servernøkler krever admin (ellers 403) og lagres hos OWNER.
export function updateConfig(changes, user = undefined, { admin = true } = {}) {
  const u = user === undefined ? userOf() : user;
  const mine = {}, server = {};
  for (const [k0, raw] of Object.entries(changes)) {
    const key = LEGACY[k0] ?? k0;
    const f = FIELDS.get(key);
    if (!f || f.hidden) throw new Error(`Ukjent innstilling: ${key}`);
    (f.personal ? mine : server)[k0] = raw;
  }
  if (Object.keys(server).length && !admin) throw Object.assign(new Error('Bare administratorer kan endre serveroppsettet'), { status: 403 });
  if (Object.keys(mine).length) setUserCfg(u, mine);
  if (!Object.keys(server).length) return;
  const over = kv.get(OWNER, 'cfg', {});
  for (const [k0, raw] of Object.entries(server)) {
    const key = LEGACY[k0] ?? k0;
    const f = FIELDS.get(key);
    if (raw === null) { delete over[key]; if (LEGACY_OF[key]) delete over[LEGACY_OF[key]]; continue; }
    const v = String(raw).trim().slice(0, 4000);
    if (f.secret && v === '') continue; // tomt felt = behold lagret hemmelighet
    if (v && /_url$|_ics$/.test(key) && !isUrl(v)) throw new Error(`${f.label}: ugyldig URL`);
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
