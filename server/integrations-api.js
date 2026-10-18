// Integrasjoner (prompt 24, per bruker fra ISO2): én liste med oppsettene, for appene og nettsiden.
//   GET    /api/integrations                  → [{id, name, group, scope, status, category, badge, color, description, statusText,
//                                                 guide:[{n,title,text,code?}], fields:[{key,label,type,value|null,saved,help}], canTest, message?,
//                                                 hidden?, replacedBy?, links? (bare «calendars»: Google Kalender og Home Assistant)}]
//   Prompt 26: også under /api/integrasjoner (samme ruter).
//   PUT    /api/integrations/:id {key: value}  → lagrer (hemmeligheter kryptert), svarer med integrasjonen
//   POST   /api/integrations/:id/test          → {ok, message, ms}
//   DELETE /api/integrations/:id/:key          → fjerner verdien (tilbake til standard), svarer med integrasjonen
// scope: 'personal' = brukerens egne (Plex, Jellyfin, Sonarr, Radarr, skolekalender, Trading 212, IMAP, Finn, Bank, Mybring,
// PostNord, ParcelsApp). Alle innloggede ser, endrer og tester sine egne, og ingen ser andres. 'server' = serveroppsett
// (AI, HA, Google-klient, Entur, MET, Kart, Ikoner, Bilder, Cloudflare): bare administratorer ser dem (andre får 403 på dem).
// Sesjon eller app-token (authOrToken; endring krever finance:write).
// Lagring: personlige verdier i kv(user,'cfg_personal') via settings.js (userCfg/setUserCfg), serververdier i kv(OWNER,'cfg')
// og FinansHubs AI-innstillinger (fh_settings/fh_secret hos OWNER). Hemmelige verdier sendes aldri ut, bare saved:true/false.
import { Hono } from 'hono';
import { kv, OWNER } from './db.js';
import { cfg, updateConfig, userCfg, userCfgOverride, setUserCfg, runAsUser, SCHEMA } from './settings.js';
import { testCalendars } from './calendar.js';
import { calendarLinks } from './birthdays.js';
import { isAdmin, sessionUser, userInfo } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { authOrToken } from './mobile.js';
import { secret, setSecret, settings, saveSettings, DEFAULT_SETTINGS } from './finans/db.js';
import { PROFILES } from './finans/csv.js';
import { geminiKeys, addKey, removeKey } from './finans/gemini-keys.js';
import { testEngine } from './finans/ai.js';
import { testMail } from './finans/mail.js';
import * as integ from './integrations.js';
import { testTracking } from './tracking.js';
import { testMap } from './tiles.js';
import { testBackgrounds } from './background.js';
import { iconSvg } from './icons.js';
import { clearCache } from './cache.js';

const MOCK = process.env.MOCK_DATA === '1';

/* ---------------- Lagring ---------------- */
// Hver store: get(user), set(user, v), clear(user), secret.

// Serveroppsett (settings.js, kv «cfg» hos OWNER).
const cfgStore = (key, isSecret = false) => ({
  get: () => cfg(key), secret: isSecret,
  set: (_u, v) => updateConfig({ [key]: v }, OWNER), clear: () => updateConfig({ [key]: null }, OWNER),
});
// Personlige verdier (settings.js, kv «cfg_personal» hos brukeren).
const mine = (key, isSecret = false, check) => ({
  get: (u) => userCfg(u, key), secret: isSecret,
  set: (u, v) => { const x = check ? check(v) : String(v).trim(); if (x === undefined) throw new Error('Ugyldig verdi'); setUserCfg(u, { [key]: String(x) }); },
  clear: (u) => setUserCfg(u, { [key]: null }),
});
// Trading 212 og IMAP for eieren: FinansHub har lest dem fra fh_secret/fh_settings. Speiles dit for OWNER, så Aksjer og
// e-postimporten virker også før finans-koden leser userCfg. Andre brukere skrives aldri dit.
const mirrored = (key, fhKey, isSecret, check) => {
  const m = mine(key, isSecret, check);
  const mirror = (u, v) => { if (u !== OWNER) return; if (isSecret) setSecret(fhKey, v ?? ''); else saveSettings({ [fhKey]: v ?? DEFAULT_SETTINGS[fhKey] }); };
  return { ...m, set: (u, v) => { m.set(u, v); mirror(u, userCfgOverride(u, key)); }, clear: (u) => { m.clear(u); mirror(u, null); } };
};
// FinansHub-innstilling per bruker (kv(user,'fh_settings'), samme sted som FinansHub lagrer brukerens innstillinger).
const fhUserSetting = (key, check) => ({
  get: (u) => ({ ...DEFAULT_SETTINGS, ...(kv.get(u, 'fh_settings', {}) ?? {}) })[key] ?? '', secret: false,
  set: (u, v) => { const x = check ? check(v) : String(v).trim(); if (x === undefined) throw new Error('Ugyldig verdi'); kv.set(u, 'fh_settings', { ...(kv.get(u, 'fh_settings', {}) ?? {}), [key]: x }); },
  clear: (u) => { const s = { ...(kv.get(u, 'fh_settings', {}) ?? {}) }; delete s[key]; kv.set(u, 'fh_settings', s); },
});
// AI-motorene er serveroppsett (OWNER sine FinansHub-innstillinger og -hemmeligheter).
const fhSecret = (key) => ({ get: () => secret(key), secret: true, set: (_u, v) => setSecret(key, String(v).trim()), clear: () => setSecret(key, '') });
const fhSetting = (key, check) => ({
  get: () => settings()[key] ?? '', secret: false,
  set: (_u, v) => { const x = check ? check(v) : String(v).trim(); if (x === undefined) throw new Error('Ugyldig verdi'); saveSettings({ [key]: x }); },
  clear: () => saveSettings({ [key]: DEFAULT_SETTINGS[key] }),
});
// Flere Gemini-nøkler (reserver): én per linje legges til listen; fjern tømmer reservene (hovednøkkelen er eget felt).
const geminiExtra = {
  get: () => (geminiKeys().filter((k) => k.id !== 'main').length ? 'x' : ''), secret: true,
  set: (_u, v) => { String(v).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).forEach((k) => addKey('', k)); },
  clear: () => { for (const k of geminiKeys()) if (k.id !== 'main') removeKey(k.id); },
};
const int = (lo, hi) => (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };
const oneOf = (list) => (v) => (list.includes(String(v).trim()) ? String(v).trim() : undefined);
const urlOk = (v) => (/^https?:\/\/\S+$/.test(String(v).trim()) ? String(v).trim() : undefined);
const hostOk = (v) => (/^[a-z0-9.-]{0,120}$/i.test(String(v).trim()) ? String(v).trim() : undefined);

const F = (key, label, type, store, { help = '', required = false } = {}) => ({ key, label, type, store, help, required });

/* ---------------- Integrasjonene ---------------- */

const viaGroup = (name) => () => integ.testIntegration(name);
const P = 'personal', S = 'server';
export const INTEGRATIONS = [
  // Personlige (hver bruker sine egne)
  { id: 'plex', name: 'Plex', group: 'Media', scope: P, test: viaGroup('Plex'), fields: [
    F('plex_url', 'Adresse', 'url', mine('plex_url'), { required: true, help: 'For eksempel http://192.168.1.20:32400' }),
    F('plex_token', 'X-Plex-Token', 'secret', mine('plex_token', true), { required: true, help: 'Plex → ⋯ → Hent info → Vis XML: X-Plex-Token i adressen' }),
  ] },
  { id: 'jellyfin', name: 'Jellyfin', group: 'Media', scope: P, test: viaGroup('Jellyfin'), fields: [
    F('jf_url', 'Adresse', 'url', mine('jf_url'), { required: true, help: 'For eksempel http://192.168.1.20:8096' }),
    F('jf_key', 'API-nøkkel', 'secret', mine('jf_key', true), { required: true, help: 'Kontrollpanel → Avansert → API-nøkler' }),
    F('jf_user', 'Brukernavn (for «Nylig lagt til»)', 'text', mine('jf_user')),
  ] },
  { id: 'sonarr', name: 'Sonarr', group: 'Media', scope: P, test: viaGroup('Sonarr'), fields: [
    F('sonarr_url', 'Adresse', 'url', mine('sonarr_url'), { required: true }),
    F('sonarr_key', 'API-nøkkel', 'secret', mine('sonarr_key', true), { required: true, help: 'Settings → General → Security → API Key' }),
  ] },
  { id: 'radarr', name: 'Radarr', group: 'Media', scope: P, test: viaGroup('Radarr'), fields: [
    F('radarr_url', 'Adresse', 'url', mine('radarr_url'), { required: true }),
    F('radarr_key', 'API-nøkkel', 'secret', mine('radarr_key', true), { required: true, help: 'Settings → General → Security → API Key' }),
  ] },
  // Prompt 26: Kalendere (Skole-iCal og Canvas-iCal, med Google Kalender og Home Assistant som lenker). Erstatter «calendar»,
  // som fortsatt svarer på /api/integrations/calendar og står i listen med hidden:true for eldre klienter.
  { id: 'calendars', name: 'Kalendere', group: 'Skole', scope: P, test: (u) => testCalendars(u), anyOf: ['cal_ics', 'canvas_ics'], fields: [
    F('cal_ics', 'Skole-iCal', 'secret', mine('cal_ics', true), { help: 'Timeplan og prøver. Visma InSchool, Outlook eller Teams → Abonner på kalender (.ics)' }),
    F('canvas_ics', 'Canvas-iCal', 'secret', mine('canvas_ics', true), { help: 'Innleveringer og frister. Canvas → Kalender → Kalenderfeed' }),
    F('cal_mazemap', 'MazeMap campus-ID', 'text', mine('cal_mazemap'), { help: 'Valgfri. Gir lenken «Finn rommet i MazeMap».' }),
  ] },
  { id: 'calendar', name: 'Skolekalender (iCal)', group: 'Skole', scope: P, hidden: true, replacedBy: 'calendars', test: viaGroup('Kalender / timeplan'), fields: [
    F('cal_ics', 'iCal-URL', 'secret', mine('cal_ics', true), { required: true, help: 'Canvas → Kalender → Kalenderfeed, eller Outlook → Publiser kalender → ICS' }),
    F('cal_mazemap', 'MazeMap campus-ID', 'text', mine('cal_mazemap')),
    F('school_url', 'Skolens nettside', 'url', mine('school_url')),
  ] },
  { id: 't212', name: 'Trading 212', group: 'Finans', scope: P, test: viaGroup('Trading 212'), fields: [
    F('t212Key', 'API-nøkkel (Key ID)', 'secret', mirrored('t212_key', 't212Key', true), { required: true, help: 'app.trading212.com → Innstillinger → API. Bare lesetilgang.' }),
    F('t212Secret', 'Secret', 'secret', mirrored('t212_secret', 't212Secret', true)),
    F('t212Env', 'Miljø (live eller demo)', 'text', mirrored('t212_env', 't212Env', false, (v) => { const e = oneOf(['live', 'demo'])(v); if (!e) throw new Error('Miljø må være live eller demo'); return e; })),
  ] },
  { id: 'bank', name: 'Bank og import', group: 'Finans', scope: P, test: null, fields: [
    F('csvProfile', `CSV-profil (${PROFILES.join(', ')})`, 'text', fhUserSetting('csvProfile', oneOf(PROFILES)), { help: 'Brukes når en bankfil er tvetydig. Kolonnene finnes ellers automatisk.' }),
  ] },
  { id: 'imap', name: 'Kvitteringer på e-post (IMAP)', group: 'Finans', scope: P, test: (u) => testImap(u), fields: [
    F('imapHost', 'Vert', 'text', mirrored('imapHost', 'imapHost', false, hostOk), { required: true, help: 'Proton Mail Bridge: protonmail-bridge (i Docker) eller 127.0.0.1' }),
    F('imapPort', 'Port', 'text', mirrored('imapPort', 'imapPort', false, int(1, 65535))),
    F('imapSecurity', 'Sikkerhet (starttls, tls eller none)', 'text', mirrored('imapSecurity', 'imapSecurity', false, oneOf(['starttls', 'tls', 'none']))),
    F('imapUser', 'Brukernavn', 'text', mirrored('imapUser', 'imapUser', false, (v) => String(v).trim().slice(0, 120)), { required: true }),
    F('imapPass', 'Passord', 'secret', mirrored('imapPass', 'imapPass', true), { required: true }),
    F('imapFolder', 'Mappe', 'text', mirrored('imapFolder', 'imapFolder', false, (v) => String(v).trim().slice(0, 120) || 'INBOX')),
  ] },
  { id: 'finn', name: 'Finn', group: 'Finans', scope: P, test: null, fields: [
    F('imapFinnFolder', 'E-postmappe for Finn-e-poster', 'text', mirrored('imapFinnFolder', 'imapFinnFolder', false, (v) => String(v).trim().slice(0, 120)), { required: true, help: 'Kvitteringer og meldinger fra Finn leses fra denne mappen (samme e-postkonto som Kvitteringer).' }),
  ] },
  { id: 'mybring', name: 'Mybring (Posten og Bring)', group: 'Sporing', scope: P, test: () => testTracking(), fields: [
    F('mybringUid', 'Mybring-bruker (e-post)', 'text', mine('mybringUid'), { required: true }),
    F('mybringKey', 'API-nøkkel', 'secret', mine('mybringKey', true), { required: true, help: 'mybring.com → Innstillinger → API' }),
  ] },
  { id: 'postnord', name: 'PostNord', group: 'Sporing', scope: P, test: () => testTracking(), fields: [
    F('postnordKey', 'API-nøkkel (valgfri)', 'secret', mine('postnordKey', true), { help: 'Valgfri (krever organisasjonsnummer hos developer.postnord.com). Uten nøkkel hentes status fra PostNords offentlige sporingsside (uoffisielt), med ParcelsApp som reserve.' }),
  ] },
  { id: 'parcelsapp', name: 'ParcelsApp', group: 'Sporing', scope: P, test: () => testTracking(), fields: [
    F('trk_parcelsapp_key', 'API-nøkkel', 'secret', mine('trk_parcelsapp_key', true), { required: true, help: 'Siste reserve. Gratisplanen har 3 oppslag i måneden.' }),
  ] },
  // Serveroppsett (bare admin)
  { id: 'ha', name: 'Home Assistant', group: 'Hjem', scope: S, test: viaGroup('Home Assistant'), fields: [
    F('ha_url', 'Adresse', 'url', cfgStore('ha_url'), { required: true, help: 'For eksempel http://192.168.1.20:8123' }),
    F('ha_token', 'Long-lived token', 'secret', cfgStore('ha_token', true), { required: true, help: 'Home Assistant → Profil → Sikkerhet → Long-lived access tokens' }),
  ] },
  { id: 'google', name: 'Google Kalender', group: 'Hjem', scope: S, test: testGoogle, fields: [
    F('googleClientId', 'Klient-ID', 'text', cfgStore('googleClientId'), { required: true, help: 'OAuth-klient (Web application) fra Google Cloud Console. Brukes av Bursdager.' }),
    F('googleClientSecret', 'Klienthemmelighet', 'secret', cfgStore('googleClientSecret', true), { required: true }),
    F('googleRedirectUri', 'Omdirigerings-URI (valgfri)', 'url', cfgStore('googleRedirectUri'), { help: 'https://<din adresse>/api/birthdays/google/callback. Tom = adressen serveren nås på.' }),
  ] },
  { id: 'ai', name: 'AI (Gemini, Groq og Ollama)', group: 'AI', scope: S, test: testAi, fields: [
    F('geminiKey', 'Gemini API-nøkkel', 'secret', fhSecret('geminiKey'), { help: 'aistudio.google.com → Get API key' }),
    F('geminiKeys', 'Flere Gemini-nøkler (reserve, én per linje)', 'secret', geminiExtra, { help: 'Brukes etter tur når en nøkkel er brukt opp for dagen.' }),
    F('groqKey', 'Groq API-nøkkel', 'secret', fhSecret('groqKey'), { help: 'console.groq.com → API Keys' }),
    F('ollamaUrl', 'Ollama-adresse', 'url', fhSetting('ollamaUrl', urlOk), { help: 'For eksempel http://192.168.1.30:11434' }),
    F('ollamaModel', 'Ollama-modell', 'text', fhSetting('ollamaModel', (v) => String(v).trim().slice(0, 60) || undefined)),
  ] },
  { id: 'entur', name: 'Entur (Ruter)', group: 'Reise', scope: S, test: viaGroup('Ruter (Entur)'), fields: [
    F('ruter_routes', 'Strekninger – én per linje: Fra (NSR-ID) > Til (NSR-ID)', 'text', cfgStore('ruter_routes'), { help: 'Stopp-ID finner du på stoppested.entur.org. Egne stopp i appen trenger ingen nøkkel.' }),
    F('ruter_count', 'Antall avganger', 'text', cfgStore('ruter_count')),
  ] },
  { id: 'cloudflare', name: 'Cloudflare', group: 'Nettverk', scope: S, test: viaGroup('Cloudflare'), fields: [
    F('cf_token', 'API-token (Zone, DNS, Analytics: Read)', 'secret', cfgStore('cf_token', true), { required: true }),
    F('cf_domain', 'Første domene', 'text', cfgStore('cf_domain')),
  ] },
  { id: 'met', name: 'MET / Yr', group: 'Generelt', scope: S, test: viaGroup('Vær (MET/Yr)'), fields: [
    F('wx_place', 'Sted', 'text', cfgStore('wx_place'), { required: true }),
    F('wx_lat', 'Breddegrad', 'text', cfgStore('wx_lat'), { required: true }),
    F('wx_lon', 'Lengdegrad', 'text', cfgStore('wx_lon'), { required: true }),
  ] },
  { id: 'map', name: 'Kart (MapTiler og Stadia)', group: 'Generelt', scope: S, test: testMap, fields: [
    F('maptilerKey', 'MapTiler API-nøkkel', 'secret', cfgStore('maptilerKey', true), { help: 'Valgfri. Kartverket (standard) trenger ingen nøkkel.' }),
    F('stadiaKey', 'Stadia Maps API-nøkkel', 'secret', cfgStore('stadiaKey', true), { help: 'Valgfri.' }),
  ] },
  { id: 'icons', name: 'Ikoner (Iconify)', group: 'Generelt', scope: S, test: testIcons, fields: [] },
  { id: 'photos', name: 'Bilder (Unsplash og Pexels)', group: 'Generelt', scope: S, test: testBackgrounds, fields: [
    F('unsplash_key', 'Unsplash Access Key', 'secret', cfgStore('unsplash_key', true)),
    F('pexels_key', 'Pexels API-nøkkel', 'secret', cfgStore('pexels_key', true)),
  ] },
];
const byId = new Map(INTEGRATIONS.map((x) => [x.id, x]));

/* ---------------- Metadata som på web (prompt 26) ---------------- */
// id → [kategori, merke, farge, kort beskrivelse, SCHEMA-gruppe for guiden (settings.js), titler fra den guiden (tom = alle)].
// Kategoriene: Smarthjem · Transport og pakker · Økonomi · AI · Informasjon · Annet (rekkefølgen i CATEGORIES).
export const CATEGORIES = ['Smarthjem', 'Transport og pakker', 'Økonomi', 'AI', 'Informasjon', 'Annet'];
const META = {
  ha: ['Smarthjem', 'HA', '#18bcf2', 'Lokal server og to-do-lister', 'ha'],
  entur: ['Transport og pakker', 'R', '#d0605a', 'Sanntid for avganger', 'ruter'],
  mybring: ['Transport og pakker', 'B', '#7BC144', 'Sporing hos Posten og Bring', 'tracking', ['Posten og Bring']],
  postnord: ['Transport og pakker', 'PN', '#00A0D6', 'Sporing hos PostNord', 'tracking', ['PostNord']],
  parcelsapp: ['Transport og pakker', 'PA', '#4B5BD6', 'Reserve for alle transportører', 'tracking', ['ParcelsApp (siste reserve)', '17TRACK (reserve)']],
  t212: ['Økonomi', 'T', '#13a37f', 'Aksjer og kontoer', 't212'],
  bank: ['Økonomi', 'BK', '#2b5d8a', 'Banker og filimport', null],
  imap: ['Økonomi', '@', '#6d4aff', 'IMAP eller Proton Mail Bridge', null],
  finn: ['Økonomi', 'F', '#0063FB', 'Varsler og handler', null],
  ai: ['AI', 'G', '#4b6cf0', 'AI-tolkning av kvitteringer og søk', null],
  calendars: ['Informasjon', '31', '#4285F4', 'Skole-iCal, Canvas, Google og Home Assistant', 'calendar'],
  calendar: ['Informasjon', '31', '#4285F4', 'Timeplan fra skolens iCal', 'calendar'],
  google: ['Informasjon', '31', '#4285F4', 'OAuth-klient for Google Kalender', 'google'],
  cloudflare: ['Informasjon', 'CF', '#F38020', 'Domener, trafikk og oppetid', 'cloudflare'],
  met: ['Informasjon', 'Yr', '#1f8fd6', 'Værvarsel', 'weather'],
  map: ['Informasjon', '◎', '#3f7a6e', 'Kartverket, MapTiler og Stadia', 'map'],
  plex: ['Annet', 'P', '#e5a00d', 'Mediaserver', 'plex'],
  jellyfin: ['Annet', 'J', '#7b4fd6', 'Mediaserver', 'jellyfin'],
  sonarr: ['Annet', 'S', '#2f8fd8', 'Serier', 'sonarr'],
  radarr: ['Annet', 'R', '#e0a325', 'Filmer', 'radarr'],
  icons: ['Annet', '✦', '#5b6478', 'Iconify via Homelab-cache', null],
  photos: ['Annet', 'U', '#3a3a3a', 'Bakgrunner fra Unsplash og Pexels', 'backgrounds'],
};
// Guider for integrasjoner som ikke har en SCHEMA-gruppe (samme tekster som i designet / web).
const OWN_GUIDE = {
  bank: [['Eksporter fra banken', 'Last ned kontoutskriften som CSV fra nettbanken.'], ['Velg profil', 'Kolonnene finnes automatisk. Er filen tvetydig, velg banken under CSV-profil.']],
  imap: [
    ['Sjekk abonnementet', 'Proton Mail har ingen vanlig IMAP-server. Tilgang går gjennom Proton Mail Bridge, som bare finnes på betalte planer. Gmail og andre: bruk et app-passord.'],
    ['Start Bridge på homelaben', 'Legg Bridge i samme docker-compose som FinansHub, på samme nettverk. Ikke åpne portene mot internett.', 'protonmail-bridge:\n  image: shenxn/protonmail-bridge\n  restart: unless-stopped\n  volumes:\n    - ./proton:/root'],
    ['Hent brukernavn og passord', 'Kjør info i Bridge. Brukernavn er Proton-adressen, og passordet er Bridge-passordet (ikke Proton-passordet ditt).', '>>> info'],
    ['Finn vert og port', 'Fra FinansHub-containeren er verten protonmail-bridge og porten 143. Kjører Bridge-appen på samme maskin uten Docker, bruk 127.0.0.1 og 1143.'],
    ['Fyll ut feltene og test', 'Lim inn verdiene og trykk Test tilkobling.'],
  ],
  finn: [['Varsler', 'Lagre søk på Finn med varsel til e-posten, og la et filter flytte Finn-e-postene til en egen mappe.'], ['Mappen', 'Skriv navnet på mappen (samme e-postkonto som Kvitteringer).']],
  ai: [['Gemini', 'Gå til aistudio.google.com → Get API key og lag en nøkkel. Gratisnivået holder for vanlig bruk.'], ['Groq (valgfritt)', 'console.groq.com → API Keys.'], ['Ollama (valgfritt)', 'Adressen til din egen Ollama-server, for eksempel http://192.168.1.30:11434.']],
  icons: [['Ingen nøkkel', 'Ikonene hentes fra Iconify og lagres på serveren. Test henter ett ikon.']],
};
const GROUPS = new Map(SCHEMA.map(([name, meta]) => [meta.id, { name, ...meta }]));
const stepsOf = (list) => list.map(([title, text, code], i) => ({ n: i + 1, title, text, ...(code ? { code } : {}) }));
function guideOf(x) {
  const m = META[x.id];
  if (OWN_GUIDE[x.id]) return stepsOf(OWN_GUIDE[x.id]);
  const g = m?.[4] ? GROUPS.get(m[4]) : null;
  if (!g) return [];
  if (g.guide?.length) return stepsOf(m[5] ? g.guide.filter(([t]) => m[5].includes(t)) : g.guide);
  return g.help ? stepsOf([['Slik gjør du', g.help]]) : [];
}
function metaOut(x, status) {
  const [category, badge, color, description] = META[x.id] ?? ['Annet', x.name.slice(0, 2).toUpperCase(), '#5b6478', ''];
  const statusText = status === 'ok' ? 'Tilkoblet' : status === 'error' ? 'Tilkoblingen feilet' : x.id === 'calendars' || x.id === 'calendar' ? 'Mangler iCal-adresse' : 'Mangler API-nøkkel';
  return { category, badge, color, description, statusText, guide: guideOf(x) };
}
/** 'personal' | 'server' for en integrasjon (id eller navn), null hvis ukjent. */
export const integrationScope = (key) => { const k = String(key ?? '').trim().toLowerCase(); return INTEGRATIONS.find((i) => i.id === k || i.name.toLowerCase() === k)?.scope ?? null; };
// IMAP-test med brukerens egne verdier. finans/mail.js fyller manglende felt fra eierens oppsett, så andre brukere må ha
// vert, brukernavn og passord selv før testen kjøres (ellers kunne eierens passord blitt sendt til en annen server).
async function testImap(u) {
  const c = imapOf(u);
  if (u !== OWNER && !(c.host && c.user && c.pass)) return { ok: false, code: 'missing', message: 'Fyll inn vert, brukernavn og passord.' };
  return testMail(c);
}
// IMAP-oppsettet til en bruker (til testMail), fra brukerens egne verdier.
const imapOf = (u) => ({ host: userCfg(u, 'imapHost'), port: Number(userCfg(u, 'imapPort')) || 143, security: userCfg(u, 'imapSecurity') || 'starttls',
  user: userCfg(u, 'imapUser'), pass: userCfg(u, 'imapPass'), folder: userCfg(u, 'imapFolder') || 'INBOX' });

/* ---------------- Tester ---------------- */

let googleFetch = null;
export const _setIntegrationsGoogleFetch = (fn) => { googleFetch = fn; };
// Google: et ugyldig kodebytte svarer «invalid_grant» når klient-ID og hemmelighet stemmer, og «invalid_client» ellers.
async function testGoogle() {
  const id = cfg('googleClientId'), sec = cfg('googleClientSecret');
  if (!id || !sec) return { ok: false, message: 'Klient-ID og klienthemmelighet mangler.' };
  if (MOCK && !googleFetch) return { ok: true, mock: true, message: 'Demodata (MOCK_DATA=1): ingen ekte kall ble gjort.' };
  try {
    const r = await (googleFetch ?? fetch)('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'homelab-test', client_id: id, client_secret: sec, redirect_uri: cfg('googleRedirectUri') || 'http://localhost/api/birthdays/google/callback' }).toString(), signal: AbortSignal.timeout(10_000) });
    const j = await r.json().catch(() => ({}));
    if (j.error === 'invalid_client' || j.error === 'unauthorized_client') return { ok: false, message: 'Google godtok ikke klient-ID eller hemmelighet.' };
    if (j.error === 'invalid_grant' || j.error === 'redirect_uri_mismatch') return { ok: true, message: 'Google godtok klienten. Hver bruker logger inn selv under Bursdager.' };
    return { ok: r.ok, message: j.error_description || j.error || `Google svarte ${r.status}` };
  } catch (e) { return { ok: false, message: `Fikk ikke kontakt med Google: ${e.message}` }; }
}
async function testAi() {
  const st = settings(), order = [st.provider, ...['gemini', 'groq', 'ollama'].filter((p) => p !== st.provider)];
  const usable = order.filter((p) => (p === 'gemini' ? geminiKeys().length : p === 'groq' ? secret('groqKey') : true));
  if (MOCK) return { ok: true, mock: true, message: 'Demodata (MOCK_DATA=1): ingen ekte kall ble gjort.' };
  const r = await testEngine(usable[0] ?? st.provider);
  return { ok: r.ok, message: r.message, ms: r.ms };
}
async function testIcons() {
  try { const s = await iconSvg('lucide', 'zap'); return { ok: !!s, message: s ? 'Iconify svarte (lucide:zap). Ingen nøkkel trengs.' : 'Iconify ga ikke noe ikon.' }; }
  catch (e) { return { ok: false, message: `Iconify svarte ikke: ${e.message}` }; }
}

/* ---------------- Utdata ---------------- */

// Siste testresultat: personlige integrasjoner per bruker, serveroppsettet hos OWNER.
const testsOwner = (x, u) => (x.scope === P ? u : OWNER);
const lastTests = (who) => kv.get(who, 'integ_tests', {}) ?? {};
function fieldOut(f, u) {
  const v = f.store.get(u);
  const saved = v !== undefined && v !== null && String(v) !== '';
  const type = f.type === 'secret' || f.store.secret ? 'secret' : f.type;
  return { key: f.key, label: f.label, type, value: type === 'secret' ? null : saved ? String(v) : null, saved, help: f.help, required: !!f.required };
}
export function integrationOut(x, u = OWNER) {
  const fields = x.fields.map((f) => fieldOut(f, u));
  const missing = x.fields.some((f, i) => f.required && !fields[i].saved) || (x.anyOf && !x.anyOf.some((k) => fields.find((f) => f.key === k)?.saved));
  const t = lastTests(testsOwner(x, u))[x.id];
  const status = missing ? 'missing' : t && t.ok === false ? 'error' : 'ok';
  return { id: x.id, name: x.name, group: x.group, scope: x.scope, status, ...metaOut(x, status), fields, canTest: !!x.test, ...(t ? { lastTest: t } : {}), ...(status === 'error' ? { message: t.message } : {}),
    ...(x.hidden ? { hidden: true, replacedBy: x.replacedBy } : {}), ...(x.id === 'calendars' ? { links: calendarLinksOut(u) } : {}) };
}
// Kalendere: Google Kalender og Home Assistant er lenker til Innstillinger → Kalendere (oppsettet ligger under Bursdager-API-et).
function calendarLinksOut(u) {
  const l = calendarLinks(u);
  return [
    { id: 'google', name: 'Google Kalender', badge: '31', color: '#4285F4', connected: l.google.connected, configured: l.google.configured, detail: l.google.email ?? null,
      statusText: l.google.connected ? 'Tilkoblet' : 'Ikke koblet', route: 'innstillinger/kalendere', api: '/api/birthdays' },
    { id: 'ha', name: 'Home Assistant', badge: 'HA', color: '#18bcf2', connected: l.ha.connected, configured: l.ha.configured, detail: l.ha.entityId ?? null, allowed: l.ha.allowed,
      statusText: l.ha.connected ? 'Tilkoblet' : 'Ikke koblet', route: 'innstillinger/kalendere', api: '/api/birthdays' },
  ];
}
/** Integrasjonene user ser: egne personlige, og serveroppsettet bare for administratorer. */
export const listIntegrations = (u = OWNER, admin = isAdmin(u)) => INTEGRATIONS.filter((x) => admin || x.scope === P).map((x) => integrationOut(x, u));

async function runTest(x, u) {
  const t0 = Date.now();
  let r;
  try { r = await runAsUser(u, () => x.test(u)); } catch (e) { r = { ok: false, message: e.message }; }
  const out = { ok: !!r.ok, message: r.message ?? (r.ok ? 'OK' : 'Feilet'), ms: r.ms ?? Date.now() - t0, ...(r.mock ? { mock: true } : {}), at: new Date().toISOString() };
  const who = testsOwner(x, u);
  kv.set(who, 'integ_tests', { ...lastTests(who), [x.id]: out });
  return out;
}
// Felles test for den eldre «Test tilkobling» (POST /api/config/test/:group): finner integrasjonen på id eller navn
// (f.eks. «google» eller «Google Kalender»). null = ukjent eller uten egen test her. u = brukeren som tester.
export async function testByIdOrName(key, u = OWNER) {
  const k = String(key ?? '').trim().toLowerCase();
  const x = INTEGRATIONS.find((i) => i.id === k || i.name.toLowerCase() === k);
  if (!x?.test) return null;
  if (x.scope !== P && !isAdmin(u)) return { ok: false, message: 'Bare administratorer kan teste serveroppsettet', restricted: true };
  return runTest(x, u);
}

/* ---------------- API ---------------- */

const api = new Hono();
api.use('*', authOrToken);
// Serveroppsett: bare administratorer. Personlige: alle, med egne verdier.
const find = (c) => {
  const x = byId.get(c.req.param('id'));
  if (!x) return { res: c.json({ error: 'Ukjent integrasjon' }, 404) };
  if (x.scope !== P && !isAdmin(c.get('user'))) return { res: c.json({ error: 'Bare administratorer kan se og endre serveroppsettet', restricted: true }, 403) };
  return { x };
};

api.get('/', (c) => c.json(listIntegrations(c.get('user'))));
api.get('/:id', (c) => { const { x, res } = find(c); return res ?? c.json(integrationOut(x, c.get('user'))); });
api.put('/:id', async (c) => {
  const { x, res } = find(c);
  if (res) return res;
  const u = c.get('user');
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet et objekt {nøkkel: verdi}' }, 400);
  const fields = new Map(x.fields.map((f) => [f.key, f]));
  for (const k of Object.keys(b)) if (!fields.has(k)) return c.json({ error: `Ukjent felt: ${k}` }, 400);
  try {
    for (const [k, v] of Object.entries(b)) {
      const f = fields.get(k);
      if (v === null) { f.store.clear(u); continue; }
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new Error(`${f.label}: ugyldig verdi`);
      const s = String(v);
      if (s.length > 4000) throw new Error(`${f.label}: for lang verdi`);
      if ((f.type === 'secret' || f.store.secret) && !s.trim()) continue; // tomt felt = behold lagret hemmelighet
      f.store.set(u, s);
    }
  } catch (e) { return c.json({ error: e.message }, e.status && e.status < 500 ? e.status : 400); }
  clearCache();
  const who = testsOwner(x, u), t = lastTests(who); delete t[x.id]; kv.set(who, 'integ_tests', t); // ny verdi: forrige testresultat gjelder ikke lenger
  return c.json(integrationOut(x, u));
});
api.post('/:id/test', async (c) => {
  const { x, res } = find(c);
  if (res) return res;
  if (!x.test) return c.json({ error: 'Denne integrasjonen har ingen test' }, 400);
  return c.json(await runTest(x, c.get('user')));
});
api.delete('/:id/:key', (c) => {
  const { x, res } = find(c);
  if (res) return res;
  const f = x.fields.find((y) => y.key === c.req.param('key'));
  if (!f) return c.json({ error: 'Ukjent felt' }, 404);
  try { f.store.clear(c.get('user')); } catch (e) { return c.json({ error: e.message }, 400); }
  clearCache();
  return c.json(integrationOut(x, c.get('user')));
});

export default api;

/* ---------------- ✦ AI-søk i innstillingene (prompt 24) ---------------- */
// POST /api/settings/ai-search {q, items:[{id, title, path}]} → {answer, ids, provider, mode:'ai'|'text'}.
// Klienten sender sin egen indeks over innstillingene; AI-en velger id-er fra den (ukjente id-er fjernes). Uten AI-motor
// (eller når den feiler) brukes enkel tekstmatch med noen vanlige synonymer.
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');
const SYN = { ikon: ['ikon', 'icon', 'app-ikon'], icon: ['ikon'], bring: ['mybring', 'posten', 'bring'], posten: ['mybring', 'bring'], morkt: ['tema', 'mork', 'dark'], mork: ['tema', 'morkt'], tema: ['utseende', 'tema'],
  passord: ['passord', 'sikkerhet'], '2fa': ['sikkerhet', 'totp'], varsel: ['varsler'], varsler: ['varsel'], navn: ['navn', 'appnavn'], bakgrunn: ['bakgrunn', 'bilde'], kart: ['kart', 'maptiler'],
  nokkel: ['nokkel', 'token', 'api'], token: ['nokkel', 'token'], gemini: ['ai', 'gemini'], ai: ['ai', 'gemini', 'ollama'], bursdag: ['bursdager', 'google'], kalender: ['google', 'kalender'] };
const STOP = new Set(['hvor', 'hva', 'hvordan', 'jeg', 'kan', 'man', 'en', 'et', 'det', 'den', 'pa', 'i', 'til', 'for', 'av', 'med', 'min', 'mitt', 'mine', 'bytter', 'endre', 'endrer', 'bytte', 'finner', 'er', 'og', 'a', 'skal', 'vil']);
export function textSearch(q, items, limit = 8) {
  const words = fold(q).split(/[^a-z0-9-]+/).filter((w) => w.length > 1 && !STOP.has(w));
  const terms = [...new Set(words.flatMap((w) => [w, ...(SYN[w] ?? [])]))];
  if (!terms.length) return [];
  return items.map((it) => {
    const t = fold(it.title), p = fold(it.path);
    let score = 0;
    for (const w of terms) { if (t.includes(w)) score += t.startsWith(w) ? 4 : 3; else if (p.includes(w)) score += 1; else if (w.length > 4 && t.includes(w.slice(0, -1))) score += 2; }
    return { it, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.it);
}
const textAnswer = (hits) => (hits.length ? `Fant ${hits.length === 1 ? 'ett treff' : `${hits.length} treff`}. «${hits[0].title}» ligger under ${hits[0].path || 'Innstillinger'}.` : 'Fant ingen innstilling som passer. Prøv med andre ord.');

let aiImpl = null;
export const _setSettingsAi = (fn) => { aiImpl = fn; };
export const settingsSearchApi = new Hono();
// Søket endrer ingenting, så et app-token med finance:read holder.
const readAuth = async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
};
settingsSearchApi.post('/ai-search', readAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const q = String(b.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!q) return c.json({ error: 'Skriv hva du leter etter' }, 400);
  if (!Array.isArray(b.items) || !b.items.length) return c.json({ error: 'Mangler items (listen over innstillinger)' }, 400);
  const items = b.items.slice(0, 400).map((x) => ({ id: String(x?.id ?? '').slice(0, 80), title: String(x?.title ?? '').slice(0, 120), path: String(x?.path ?? '').slice(0, 200) })).filter((x) => x.id && x.title);
  const known = new Set(items.map((x) => x.id));
  const text = () => { const hits = textSearch(q, items); return { mode: 'text', provider: null, answer: textAnswer(hits), ids: hits.map((x) => x.id) }; };
  const ai = aiImpl ?? (MOCK ? null : (await import('./homeos-common.js')).aiJson);
  if (!ai) return c.json(text());
  const schema = { type: 'OBJECT', properties: { answer: { type: 'STRING' }, ids: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['answer', 'ids'] };
  const prompt = 'Du hjelper brukeren å finne riktig innstilling i en app. Under er alle innstillingene som JSON (id, title, path).\n'
    + 'Svar på norsk bokmål med én kort setning om hvor innstillingen ligger (bruk path), og gi id-ene til de 1–5 beste treffene, best først. '
    + 'Bruk bare id-er fra listen. Finnes ingen, svar det og gi en tom liste.\n'
    + `Innstillinger: ${JSON.stringify(items)}\nSpørsmål: «${q}»`;
  try {
    const r = await Promise.race([ai(prompt, schema, { timeout: 20_000, temperature: 0.2, task: 'search' }), new Promise((_, rej) => setTimeout(() => rej(new Error('AI svarte ikke i tide')), 22_000).unref?.())]);
    const ids = [...new Set((Array.isArray(r?.data?.ids) ? r.data.ids : []).map(String).filter((id) => known.has(id)))].slice(0, 8);
    const answer = String(r?.data?.answer ?? '').trim().slice(0, 600);
    if (!answer && !ids.length) throw new Error('Tomt svar');
    return c.json({ mode: 'ai', provider: r.provider ?? null, answer: answer || textAnswer(items.filter((x) => ids.includes(x.id))), ids });
  } catch (e) {
    return c.json({ ...text(), fallback: true, reason: e.message });
  }
});
