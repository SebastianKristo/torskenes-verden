// Felles for Homelab på desktop og i mobilappene: profil (navn, bilde), oppsett av forside og meny,
// Google-søk (forslag og historikk), mobilforsiden og widgetene «Serverstatus» og «Ruter-avganger».
// Rutene godtar en innlogget sesjon ELLER et FinansHub-token (Bearer), så de native appene kan bruke dem.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readFile, writeFile, unlink, mkdir, readdir } from 'node:fs/promises';
import { statfsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { config } from './config.js';
import { kv, OWNER } from './db.js';
import { aiJson } from './homeos-common.js';
import { sessionUser, userInfo, serverName, isAdmin, installKind } from './auth.js';
import { packagesFor } from './tracking.js';
import { newsFor } from './rss.js';
import finansApi, { bearerOk } from './finans/routes.js';
import { matApi } from './mat.js';
import { domainOverview } from './domains.js';
import { readBg, weatherImages, weatherKind, planetsToday, osloImages, apodImage } from './bg.js';
import { uiPrefs, saveUiPrefs } from './ui.js';
import { weatherFull, searchPlaces, DEFAULT_PLACES, weatherCompare, PLACES as WX_PLACES } from './weather-full.js';
import { appMeta } from './notify.js';
import { nextTasks } from './tasks.js';
import * as integrations from './integrations.js';
import { widgetOut as birthdaysWidget } from './birthdays.js';

const MOCK = process.env.MOCK_DATA === '1';
const ext = MOCK ? await import('./mock.js') : integrations;
const AVATARS = join(config.dataDir, 'avatars');
await mkdir(AVATARS, { recursive: true });

/* ---------------- Tilgang ---------------- */

// Lesing: sesjon eller token med finance:read. Endring: sesjon eller token med finance:write.
export const authOrToken = async (c, next) => {
  const write = !['GET', 'HEAD'].includes(c.req.method);
  let id = sessionUser(c);
  if (!id && bearerOk(c, write ? 'finance:write' : 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
};

/* ---------------- Profil ---------------- */

const avatarFile = (id) => join(AVATARS, `${String(id).replace(/[^\w-]/g, '')}.jpg`);
const avatarV = (id) => kv.get(id, 'avatar_v', 0);

export function meOut(id) {
  const u = userInfo(id);
  if (!u) return null;
  const v = avatarV(id);
  return { ...u, serverName: serverName(), avatarUrl: v ? `/api/me/avatar?v=${v}` : null };
}

export const removeAvatar = (id) => unlink(avatarFile(id)).catch(() => {});

// Godtar bare JPEG/PNG/WebP (sjekker filsignaturen, ikke bare MIME-typen). Klienten beskjærer til 256×256.
function imageKind(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

async function sendAvatar(c, id) {
  if (!avatarV(id)) return c.json({ error: 'Ingen profilbilde' }, 404);
  try {
    const b = await readFile(avatarFile(id));
    return c.body(b, 200, { 'Content-Type': imageKind(b) ?? 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  } catch { return c.json({ error: 'Ingen profilbilde' }, 404); }
}

/* ---------------- Oppsett av forside og meny ---------------- */

const ids = (v, max = 60) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && /^[\w.-]{1,40}$/.test(x));
// Egne navn på faner og menypunkter: { id: navn }, maks 30 tegn. Tomt navn = standardnavnet.
const labels = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 40
  && Object.entries(v).every(([k, n]) => /^[\w.-]{1,40}$/.test(k) && typeof n === 'string' && n.length <= 30 && !/[<>]/.test(n));
const navShape = (v) => v && typeof v === 'object' && !Array.isArray(v) && (v.order === undefined || ids(v.order)) && (v.hidden === undefined || ids(v.hidden)) && (v.labels === undefined || labels(v.labels));
const MOBILE_START = ['homelab', 'fin-hjem', 'fin-liste', 'fin-budsjett'];
const LAYOUT = {
  finNav: navShape,
  // Mobil: forside (sec), faner (hlTabs/finTabs), skjult (hide), egne navn (names), rekkefølge (order: liste eller {linje: liste}),
  // startside, tilbake-stil og Matplan-tema.
  mobile: (v) => v && typeof v === 'object' && !Array.isArray(v)
    && ['sec', 'hlTabs', 'finTabs'].every((k) => v[k] === undefined || ids(v[k]))
    && (v.hide === undefined || (v.hide && typeof v.hide === 'object' && !Array.isArray(v.hide) && Object.entries(v.hide).length <= 80 && Object.entries(v.hide).every(([k, b]) => /^[\w.-]{1,40}$/.test(k) && typeof b === 'boolean')))
    && (v.names === undefined || labels(v.names))
    && (v.order === undefined || ids(v.order) || (v.order && typeof v.order === 'object' && !Array.isArray(v.order) && Object.keys(v.order).length <= 10 && Object.entries(v.order).every(([k, o]) => /^[\w.-]{1,40}$/.test(k) && ids(o))))
    && (v.start === undefined || MOBILE_START.includes(v.start))
    && (v.backStyle === undefined || ['arrow', 'bar'].includes(v.backStyle))
    && (v.matTheme === undefined || ['light', 'dark', 'system'].includes(v.matTheme)),
  homelab: (v) => v && typeof v === 'object' && !Array.isArray(v) && (v.hiddenWidgets === undefined || ids(v.hiddenWidgets)) && (v.hiddenTabs === undefined || ids(v.hiddenTabs)) && (v.labels === undefined || labels(v.labels)),
};
// Enkle verdier (prompt 13): tema for FinansHub desktop, kompakt sidemeny, Homelab-tema, mobildesign, papirmodus og fotovindu.
const SCALAR = {
  design: (v) => ['v2', 'lys', 'mork', 'glod'].includes(v),
  compactNav: (v) => typeof v === 'boolean',
  hlTheme: (v) => ['cur', '2c'].includes(v),
  mobileDesign: (v) => ['klassisk', 'papir'].includes(v),
  paperMode: (v) => ['auto', 'lys', 'mork'].includes(v),
  photo: (v) => PHOTO_KINDS.includes(v),
  onboarded: (v) => typeof v === 'boolean',
  // Prompt 20: rekkefølgen på Finans-flisene i appene (iOS, Android, PWA). Maks 30 id-er på 1–40 tegn [a-z0-9-], uten duplikater.
  fmOrder: (v) => Array.isArray(v) && v.length <= 30 && new Set(v).size === v.length && v.every((x) => typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x)),
  // Rekkefølgen på kortene i Sporing (prompt 14): Legg til + kilder, Sendinger, Varsler og Transportører.
  trkOrder: (v) => Array.isArray(v) && v.length <= TRK_CARDS.length && new Set(v).size === v.length && v.every((x) => TRK_CARDS.includes(x)),
  // Prompt 15: tilpassede sider (rekkefølge og skjulte kort per side), Finans-fanelinjen, fjerde fane og skanneknapp.
  pages: (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 30
    && Object.entries(v).every(([k, o]) => /^[\w.-]{1,40}$/.test(k) && o && typeof o === 'object' && !Array.isArray(o)
      && Object.keys(o).every((f) => f === 'order' || f === 'hidden') && (o.order === undefined || cardIds(o.order)) && (o.hidden === undefined || cardIds(o.hidden))),
  finTabs: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 4 && new Set(v).size === v.length && v.every((x) => FIN_TABS.includes(x)),
  fourthTab: (v) => ['auto', 'domener', 'sporing'].includes(v),
  fab: (v) => ['float', 'inline'].includes(v),
  // Prompt 16: Papir-hovedlinjen (opptil 6 faner med eget navn og ikon) og fargetema for ikonene i Innstillinger.
  tabBar: (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => k === 'items') && Array.isArray(v.items) && v.items.length >= 1 && v.items.length <= 6
    && new Set(v.items.map((x) => x?.id)).size === v.items.length
    && v.items.every((x) => x && typeof x === 'object' && TAB_IDS.includes(x.id) && Object.keys(x).every((f) => ['id', 'label', 'icon'].includes(f))
      && (x.label === undefined || (typeof x.label === 'string' && x.label.length <= 24)) && (x.icon === undefined || (typeof x.icon === 'string' && /^[\w.-]{1,40}$/.test(x.icon)))),
  iconTheme: (v) => ICON_THEMES.includes(v),
  // Prompt 19: bakgrunner (type, planet, bytte, uskarphet, demping, Kun på Wi-Fi og animasjon). bgType speiles mot photo.
  bgType: (v) => BG_TYPES.includes(v),
  bgPlanet: (v) => ['auto', 'earth', 'moon', 'jupiter', 'mars', 'saturn'].includes(v),
  bgRotate: (v) => ['daily', 'hourly'].includes(v),
  bgBlur: (v) => Number.isInteger(v) && v >= 0 && v <= 20,
  bgDim: (v) => Number.isInteger(v) && v >= 0 && v <= 60,
  bgWifiOnly: (v) => typeof v === 'boolean',
  bgAnimate: (v) => typeof v === 'boolean',
  // Prompt 23: rekkefølgen på kortene på Abonnementer → Hjem (hold inne og dra). Bare kjente id-er, uten duplikater.
  subHomeOrder: (v) => Array.isArray(v) && v.length >= 1 && v.length <= SUB_HOME_CARDS.length && new Set(v).size === v.length && v.every((x) => SUB_HOME_CARDS.includes(x)),
  // Prompt 24: profiler (Innstillinger → PROFIL). Et ferdig oppsett av startside og faner, synket mellom enheter.
  // Egne endringer i startRoute/homeNav/finNav etter valg gjør profilen til «custom» (Egendefinert).
  profile: (v) => PROFILE_IDS.includes(v),
  startRoute: (v) => typeof v === 'string' && /^[a-z0-9-]{1,30}(\/[a-z0-9-]{1,30}){0,2}$/.test(v),
  homeNav: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 6 && new Set(v).size === v.length && v.every((x) => TAB_IDS.includes(x)),
  appIcon: (v) => typeof v === 'string' && /^[\w.-]{1,40}$/.test(v),
  // Prompt 25: fanelinje-stil. text = navn på alle (ikon på valgt), icons = bare ikoner, icons_active_label = ikoner + navn på valgt.
  navStyle: (v) => NAV_STYLES.includes(v),
  appName: (v) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 20 && !/[<>\u0000-\u001f]/.test(v),
  // Prompt 26: Kalender per bruker. Kortrekkefølge og skjulte kort (rediger-modus), filtre, visning, påminnelser og fagfarger.
  // Kortene A–E som i designet (A Nå-kort, B Prøver og frister, C Kalendere-lenken, D Kalenderen, E Widgets).
  kalOrder: (v) => Array.isArray(v) && v.length <= KAL_CARDS.length && new Set(v).size === v.length && v.every((x) => KAL_CARDS.includes(x)),
  kalHidden: (v) => Array.isArray(v) ? v.length <= KAL_CARDS.length && v.every((x) => KAL_CARDS.includes(x))
    : !!v && typeof v === 'object' && Object.entries(v).every(([k, b]) => KAL_CARDS.includes(k) && typeof b === 'boolean'),
  // {timeplan, prover, bursdager, skole: bool} (true = vises), eller en liste med skjulte nøkler.
  kalFilters: (v) => Array.isArray(v) ? v.length <= KAL_FILTERS.length && v.every((x) => KAL_FILTERS.includes(x))
    : !!v && typeof v === 'object' && Object.entries(v).every(([k, b]) => KAL_FILTERS.includes(k) && typeof b === 'boolean'),
  kalView: (v) => ['uke', 'maaned', 'agenda'].includes(v),
  kalReminders: (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 1000
    && Object.entries(v).every(([k, r]) => k.length >= 1 && k.length <= 120 && !/[<>]/.test(k) && ['none', '15m', '1h', 'day'].includes(r)),
  subjectColors: (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 60
    && Object.entries(v).every(([k, col]) => KAL_KEY.test(k) && typeof col === 'string' && /^#[0-9a-f]{6}$/i.test(col)),
};
// Filternavn og fag: bokstaver (også æøå), tall, mellomrom og noen tegn, 1–40 tegn.
const KAL_CARDS = ['A', 'B', 'C', 'D', 'E'];
const KAL_FILTERS = ['timeplan', 'prover', 'bursdager', 'skole'];
const KAL_KEY = /^[\p{L}\p{N} ._&+()\/-]{1,40}$/u;
// Felt som flettes per nøkkel (en klient kan lagre én påminnelse eller én fagfarge uten å sende resten; null fjerner nøkkelen).
const MERGE_MAP = ['kalReminders', 'subjectColors'];
// finNav som liste (prompt 24): fanene i Finans i profilen. Lagres som finNavList, så sidemenyen på desktop (finNav-objektet
// {order, hidden, labels}) beholdes uendret. GET /api/me/layout svarer med finNav = listen og finSideNav = objektet.
const FIN_NAV_IDS = ['oversikt', 'liste', 'finn', 'sok', 'budsjett', 'kvitteringer', 'aksjer', 'abonnementer', 'kontoer', 'boliger', 'mer'];
// Prompt 26: finNav kan også være [{key, label?, icon?}] (egne navn og ikoner fra «Rediger fanelinjen»). Maks 5 faner;
// Mer ligger alltid sist i appene og lagres ikke (fjernes fra listen). Lagres som finNavList (nøklene) og finNavMeta.
const FIN_NAV_MAX = 5;
function finNavParse(v) {
  if (!Array.isArray(v) || v.length > FIN_NAV_MAX + 1) return null;
  const items = [];
  for (const x of v) {
    const it = typeof x === 'string' ? { key: x } : x && typeof x === 'object' && !Array.isArray(x) ? x : null;
    if (!it || !Object.keys(it).every((f) => ['key', 'label', 'icon'].includes(f)) || !FIN_NAV_IDS.includes(it.key)) return null;
    if (it.label !== undefined && it.label !== null && (typeof it.label !== 'string' || it.label.trim().length > 24 || /[<>\u0000-\u001f]/.test(it.label))) return null;
    if (it.icon !== undefined && it.icon !== null && (typeof it.icon !== 'string' || !/^[\w.:-]{1,60}$/.test(it.icon))) return null;
    if (it.key === 'mer') continue;
    items.push({ key: it.key, ...(it.label?.trim() ? { label: it.label.trim().replace(/\s+/g, ' ') } : {}), ...(it.icon ? { icon: it.icon } : {}) });
  }
  if (!items.length || items.length > FIN_NAV_MAX || new Set(items.map((x) => x.key)).size !== items.length) return null;
  return items;
}
const finNavList = (v) => !!finNavParse(v);
export const PROFILES = {
  standard: { startRoute: 'hjem', homeNav: ['hjem', 'finans', 'mat', 'mer'], finNav: ['oversikt', 'liste', 'finn', 'sok'] },
  finans_boliger: { startRoute: 'finans/boliger', homeNav: ['finans'], finNav: ['boliger', 'sok', 'liste', 'oversikt', 'kvitteringer'] },
  boliger: { startRoute: 'finans/boliger', homeNav: ['finans', 'domener'], finNav: ['boliger', 'kvitteringer', 'oversikt', 'sok'] },
};
const PROFILE_IDS = [...Object.keys(PROFILES), 'custom'];
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
/** Profilfeltene med standardverdier: valgt profil, eller Standard. */
export function profileOf(id) {
  const l = layoutOf(id), p = PROFILES[l.profile] ?? PROFILES.standard;
  const finNav = l.finNavList ?? (l.profile && PROFILES[l.profile] ? p.finNav : l.finTabs ?? p.finNav);
  const meta = l.finNavList && l.finNavMeta && typeof l.finNavMeta === 'object' ? l.finNavMeta : {};
  return { profile: PROFILE_IDS.includes(l.profile) ? l.profile : 'standard', startRoute: l.startRoute ?? p.startRoute, homeNav: l.homeNav ?? p.homeNav,
    finNav, finNavItems: finNav.filter((k) => k !== 'mer').slice(0, FIN_NAV_MAX).map((key) => ({ key, ...(meta[key] ?? {}) })),
    appIcon: l.appIcon ?? null, appName: l.appName ?? null, finSideNav: l.finNav ?? null };
}
const SUB_HOME_CARDS = ['ai', 'next7', 'check', 'list'];
export const NAV_STYLES = ['text', 'icons', 'icons_active_label'];
const BG_TYPES = ['weather', 'planets', 'oslo', 'custom', 'none', 'cur'];
export const TAB_IDS = ['hjem', 'finans', 'mat', 'sporing', 'domener', 'sok', 'mer', 'vaer', 'nyheter', 'familie', 'avganger', 'aksjer', 'boliger', 'abonnementer', 'media', 'huske'];
export const TAB_BAR_DEFAULT = { items: [{ id: 'hjem', label: 'Hjem', icon: 'house' }, { id: 'finans', label: 'Finans', icon: 'wallet' }, { id: 'mat', label: 'Mat', icon: 'fork.knife' }, { id: 'domener', label: 'Domener', icon: 'globe' }, { id: 'sok', label: 'Søk', icon: 'magnifyingglass' }, { id: 'mer', label: 'Mer', icon: 'ellipsis' }] };
const ICON_THEMES = ['standard', 'varm', 'kjolig', 'mono', 'fargerik'];
const cardIds = (a) => Array.isArray(a) && a.length <= 40 && a.every((x) => typeof x === 'string' && /^[\w.-]{1,40}$/.test(x));
const FIN_TABS = ['oversikt', 'liste', 'finn', 'sok', 'budsjett', 'kvitteringer', 'aksjer', 'abonnementer', 'kontoer', 'boliger'];
const FIN_TABS_DEFAULT = ['oversikt', 'liste', 'finn', 'sok'];
const TRK_CARDS = ['add', 'shipments', 'notify', 'carriers'];
const PHOTO_KINDS = ['cur', 'oslo', 'weather', 'planets', 'custom'];
export const layoutOf = (id) => kv.get(id, 'layout', {});

/* ---------------- Snarveier ---------------- */

export const DEFAULT_SHORTCUTS = [
  ['NRK', 'https://www.nrk.no'], ['VG', 'https://www.vg.no'], ['FINN', 'https://www.finn.no'], ['Komplett', 'https://www.komplett.no'], ['Yr', 'https://www.yr.no'],
  ['Canvas', 'https://canvas.instructure.com'], ['Claude', 'https://claude.ai'], ['ChatGPT', 'https://chatgpt.com'], ['Gemini', 'https://gemini.google.com'],
  ['Ruter', config.services.find(([n]) => n === 'Ruter')?.[1] ?? 'http://192.168.1.1'], ['Home Assistant', config.services.find(([n]) => n === 'Home Assistant')?.[1] ?? 'http://192.168.1.20:8123'],
  ['Proxmox', config.services.find(([n]) => n === 'Proxmox')?.[1] ?? 'https://192.168.1.10:8006'], ['Homey', 'https://my.homey.app'], ['LabDeck', config.services.find(([n]) => n === 'LabDeck')?.[1] ?? 'http://192.168.1.50'],
].map(([name, url]) => ({ name, url }));

const isLocalUrl = (u) => { try { const h = new URL(u).hostname; return /^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|\.local$|\.lan$|\.home\.arpa$|^localhost$/.test(h) || !h.includes('.'); } catch { return false; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

// Logoer: offentlige adresser bruker sitt eget domene. Lokale adresser (192.168.x.x, .local) har ikke noe favicon å hente,
// så navnet slås opp én gang (fast liste, ellers AI) og svaret lagres for alle brukere. Tom streng = ingen logo, vis initialer.
const KNOWN = { 'home assistant': 'home-assistant.io', proxmox: 'proxmox.com', 'pi-hole': 'pi-hole.net', pihole: 'pi-hole.net', homey: 'homey.app',
  unraid: 'unraid.net', truenas: 'truenas.com', synology: 'synology.com', plex: 'plex.tv', jellyfin: 'jellyfin.org', sonarr: 'sonarr.tv', radarr: 'radarr.video',
  portainer: 'portainer.io', grafana: 'grafana.com', unifi: 'ui.com', opnsense: 'opnsense.org', pfsense: 'pfsense.org', nextcloud: 'nextcloud.com',
  immich: 'immich.app', 'uptime kuma': 'uptime.kuma.pet', prowlarr: 'prowlarr.com', qbittorrent: 'qbittorrent.org', overseerr: 'overseerr.dev', vaultwarden: 'vaultwarden.net' };
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const domainCache = () => kv.get(OWNER, 'shortcut_domains', {});
const nameKey = (n) => String(n).trim().toLowerCase();
export const shortcutsFor = (id) => {
  const cache = domainCache();
  return (kv.get(id, 'shortcuts') ?? DEFAULT_SHORTCUTS).map((s) => {
    const local = isLocalUrl(s.url), k = nameKey(s.name);
    const domain = local ? (KNOWN[k] ?? cache[k] ?? null) : hostOf(s.url) || null;
    return { ...s, local, domain: domain || null, resolved: !local || k in KNOWN || k in cache };
  });
};

let resolving = null, aiDownUntil = 0;
async function resolveDomains(names) {
  const cache = domainCache(), todo = [...new Set(names.map(nameKey))].filter((k) => k && !(k in KNOWN) && !(k in cache)).slice(0, 20);
  if (!todo.length || Date.now() < aiDownUntil) return;
  let found = {};
  try {
    const r = await Promise.race([
      aiJson(`Dette er navn på tjenester som kjører på et lokalt hjemmenettverk (homelab): ${JSON.stringify(todo)}.
For hvert navn: gi domenet til det offisielle nettstedet for produktet eller programvaren (f.eks. "Proxmox" → "proxmox.com", "Home Assistant" → "home-assistant.io").
Hvis navnet er en generell enhet eller noe du ikke kjenner sikkert (f.eks. "Ruter", "NAS", "Skriver", "LabDeck"), svar med tom streng. Ikke gjett.`,
        { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, domain: { type: 'STRING' } }, required: ['name', 'domain'] } } }, required: ['items'] }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI svarte ikke')), 20_000)),
    ]);
    for (const it of r.data?.items ?? []) {
      const k = nameKey(it.name), d = String(it.domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (todo.includes(k)) found[k] = DOMAIN_RE.test(d) ? d : '';
    }
  } catch { aiDownUntil = Date.now() + 10 * 60_000; return; } // ingen AI nå: prøv igjen om 10 min, initialer vises så lenge
  // Navn AI-en ikke svarte på lagres som «ingen logo», så de ikke spørres om hver gang.
  for (const k of todo) if (!(k in found)) found[k] = '';
  kv.set(OWNER, 'shortcut_domains', { ...domainCache(), ...found });
}

/* ---------------- Søkehistorikk ---------------- */

const HIST_MAX = 500;
const histOf = (id) => kv.get(id, 'search_history', []);
const setHist = (id, list) => kv.set(id, 'search_history', list.slice(0, HIST_MAX));
const cleanQ = (q) => String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
function addHist(id, qs, { front = true } = {}) {
  const cur = histOf(id), seen = new Set(), out = [];
  const push = (q) => { const k = q.toLowerCase(); if (q && !seen.has(k)) { seen.add(k); out.push(q); } };
  if (front) { qs.forEach(push); cur.forEach(push); } else { cur.forEach(push); qs.forEach(push); }
  setHist(id, out);
  return out.length;
}
// Google Takeout → Mine aktiviteter → Søk (JSON): objekter med title «Searched for …» / «Søkte etter …».
export function parseTakeout(data) {
  const arr = Array.isArray(data) ? data : Array.isArray(data?.queries) ? data.queries.map((q) => ({ title: `Searched for ${q}` })) : [];
  return arr.map((x) => (typeof x === 'string' ? `Searched for ${x}` : String(x?.title ?? '')))
    .map((t) => t.match(/^(?:Searched for|Søkte etter|Søkt etter|Har søkt etter)\s+(.+)$/i)?.[1]).filter(Boolean).map(cleanQ).filter(Boolean);
}
const searchSettings = (id) => { const u = uiPrefs(id); return { suggest: u.searchSuggest !== false, save: u.searchSave !== false }; };

/* ---------------- Serverstatus ---------------- */

let lastCpu = null;
function cpuPct() {
  const t = os.cpus().reduce((a, c) => { for (const [k, v] of Object.entries(c.times)) a[k === 'idle' ? 'idle' : 'busy'] += v; return a; }, { idle: 0, busy: 0 });
  const prev = lastCpu; lastCpu = t;
  if (!prev || t.idle + t.busy - prev.idle - prev.busy <= 0) return Math.min(100, Math.round((os.loadavg()[0] / Math.max(1, os.cpus().length)) * 100));
  return Math.round(((t.busy - prev.busy) / (t.busy - prev.busy + t.idle - prev.idle)) * 100);
}
cpuPct();
function memInfo() {
  try {
    const m = Object.fromEntries(readFileSync('/proc/meminfo', 'utf8').split('\n').map((l) => l.match(/^(\w+):\s+(\d+)/)).filter(Boolean).map(([, k, v]) => [k, +v * 1024]));
    if (m.MemTotal && m.MemAvailable !== undefined) return { total: m.MemTotal, used: m.MemTotal - m.MemAvailable };
  } catch { /* ikke Linux */ }
  return { total: os.totalmem(), used: os.totalmem() - os.freemem() };
}
function diskInfo() {
  try { const s = statfsSync(config.dataDir); return { total: s.blocks * s.bsize, used: (s.blocks - s.bfree) * s.bsize }; } catch { return null; }
}
async function tempC() {
  try {
    const zones = (await readdir('/sys/class/thermal')).filter((z) => z.startsWith('thermal_zone'));
    const vals = (await Promise.all(zones.map((z) => readFile(`/sys/class/thermal/${z}/temp`, 'utf8').then((t) => +t / 1000).catch(() => NaN)))).filter((v) => v > 0 && v < 150);
    return vals.length ? Math.round(Math.max(...vals)) : null;
  } catch { return null; }
}
const pct = (u, t) => (t ? Math.round((u / t) * 100) : null);
function uptimeText(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${h} t` : h ? `${h} t ${m} min` : `${m} min`;
}
export async function serverStatus() {
  if (MOCK) return { host: 'homelab', cpu: 23, mem: 61, disk: 48, temp: 52, uptime: 1_234_567, uptimeText: uptimeText(1_234_567), memUsed: 9.8e9, memTotal: 16e9, diskUsed: 230e9, diskTotal: 480e9, cores: 8, load: [0.8, 0.7, 0.6] };
  const m = memInfo(), d = diskInfo(), up = Math.round(os.uptime());
  return { host: os.hostname(), cpu: cpuPct(), mem: pct(m.used, m.total), disk: d ? pct(d.used, d.total) : null, temp: await tempC(), uptime: up, uptimeText: uptimeText(up),
    memUsed: m.used, memTotal: m.total, diskUsed: d?.used ?? null, diskTotal: d?.total ?? null, cores: os.cpus().length, load: os.loadavg().map((x) => Math.round(x * 100) / 100) };
}

/* ---------------- Ruter (mobil) ---------------- */

// Linjefarger i Ruters profil.
const MODE_COLOR = { metro: '#EC700C', tram: '#0B91EF', bus: '#E60000', rail: '#003087', water: '#682C88', coach: '#75A300' };
const minsTo = (iso) => Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000));
const hhmm = (iso) => new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
const depOut = (d) => ({ line: d.line, mode: d.mode, color: d.color ?? MODE_COLOR[d.mode] ?? MODE_COLOR.bus, textColor: d.textColor ?? '#FFFFFF', min: minsTo(d.time), minutes: minsTo(d.time), time: hhmm(d.time), to: d.to,
  // Prompt 21: turen (holdeplasser til endestasjonen) og status, når kilden har dem (widgets/ruter; ikke reiseforslagene).
  ...(d.stops ? { modeName: d.modeName, platform: d.platform, delayMin: d.delayMin, status: d.status, stops: d.stops, stopsCount: d.stopsCount, ruterUrl: d.ruterUrl } : {}) });

// 05–10 God morgen, 10–12 God formiddag, 12–18 God ettermiddag, 18–23 God kveld, 23–05 God natt.
export const greetingFor = (h) => (h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 12 ? 'God formiddag' : h < 18 ? 'God ettermiddag' : h < 23 ? 'God kveld' : 'God natt');
const osloHour = () => +new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Oslo' }).slice(0, 2);
const safe = async (fn) => { try { return await fn(); } catch { return null; } };

/* ---------------- Ruter ---------------- */

const api = new Hono();
const json = async (c) => c.req.json().catch(() => null);

api.get('/me', authOrToken, (c) => c.json(meOut(c.get('user'))));
api.get('/me/avatar', authOrToken, (c) => sendAvatar(c, c.get('user')));
api.post('/me/avatar', authOrToken, bodyLimit({ maxSize: 1024 * 1024 + 64 * 1024, onError: (c) => c.json({ error: 'Bildet er for stort (maks 1 MB)' }, 413) }), async (c) => {
  const body = await c.req.parseBody().catch(() => ({}));
  const f = body.file;
  if (!(f instanceof File)) return c.json({ error: 'Mangler fil' }, 400);
  const b = Buffer.from(await f.arrayBuffer());
  if (b.length > 1024 * 1024) return c.json({ error: 'Bildet er for stort (maks 1 MB)' }, 413);
  if (!imageKind(b)) return c.json({ error: 'Bruk et JPEG-, PNG- eller WebP-bilde' }, 400);
  const id = c.get('user');
  await writeFile(avatarFile(id), b);
  kv.set(id, 'avatar_v', Date.now());
  return c.json(meOut(id));
});
api.delete('/me/avatar', authOrToken, async (c) => {
  const id = c.get('user');
  await removeAvatar(id);
  kv.del(id, 'avatar_v');
  return c.json(meOut(id));
});
// Andre brukeres bilder (brukerlisten, delte mapper, Familie, Huskeliste). Bare for innloggede; profilbildet er en del av
// det trygge utvalget (id, navn, bilde) som alle innloggede ser om hverandre (prompt 21).
api.get('/users/:id/avatar', authOrToken, (c) => sendAvatar(c, c.req.param('id')));

// Lagret oppsett med standardverdiene for utseendet fylt inn (de avhenger av om installasjonen er ny, se designOf).
api.get('/me/layout', authOrToken, (c) => { const id = c.get('user'); const { finNavList: _l, finNavMeta: _m, ...l } = layoutOf(id); return c.json({ ...l, ...designOf(id), ...profileOf(id) }); });
api.put('/me/layout', authOrToken, async (c) => {
  const b = await json(c);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet et objekt' }, 400);
  const next = { ...layoutOf(c.get('user')) };
  // Profil først: ferdig oppsett av startRoute, homeNav og finNav. Felt som sendes i samme kall overstyrer.
  if (b.profile !== undefined && b.profile !== null) {
    if (!SCALAR.profile(b.profile)) return c.json({ error: 'Ugyldig verdi for profile' }, 400);
    const p = PROFILES[b.profile];
    if (p) { Object.assign(next, { startRoute: p.startRoute, homeNav: [...p.homeNav], finNavList: [...p.finNav] }); delete next.finNavMeta; }
  }
  const custom = ['startRoute', 'homeNav', 'finNav'].some((k) => b[k] !== undefined && !(k === 'finNav' && !Array.isArray(b[k]) && b[k] !== null));
  for (const [k, v] of Object.entries(b)) {
    if (!LAYOUT[k] && !SCALAR[k]) return c.json({ error: `Ukjent nøkkel ${k}` }, 400);
    if (k === 'finNav' && (Array.isArray(v) || v === null)) {
      if (v === null) { delete next.finNavList; delete next.finNavMeta; continue; }
      const items = finNavParse(v);
      if (!items) return c.json({ error: `Ugyldig verdi for finNav (1–${FIN_NAV_MAX} faner, Mer kommer alltid sist)` }, 400);
      next.finNavList = items.map((x) => x.key);
      const meta = Object.fromEntries(items.filter((x) => x.label || x.icon).map(({ key, ...m }) => [key, m]));
      if (Object.keys(meta).length) next.finNavMeta = meta; else delete next.finNavMeta;
      continue;
    }
    if (MERGE_MAP.includes(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      // Fletting: {id: verdi} legges til, {id: null} fjernes.
      const merged = { ...(next[k] ?? {}), ...v };
      for (const [id, x] of Object.entries(merged)) if (x === null) delete merged[id];
      if (!SCALAR[k](merged)) return c.json({ error: `Ugyldig verdi for ${k}` }, 400);
      next[k] = merged; continue;
    }
    if (k === 'kalView' && v === 'mnd') { next.kalView = 'maaned'; continue; }
    if (k === 'appName' && typeof v === 'string') { if (!SCALAR.appName(v)) return c.json({ error: 'Navnet på appen må være 1–20 tegn' }, 400); next.appName = v.trim().replace(/\s+/g, ' '); continue; }
    if (v === null) { delete next[k]; continue; }
    if (SCALAR[k]) {
      if (!SCALAR[k](v)) return c.json({ error: `Ugyldig verdi for ${k}` }, 400);
      // Sidene flettes per side, så en klient kan lagre én side uten å sende resten.
      next[k] = k === 'pages' ? { ...(next.pages ?? {}), ...v } : v;
      // Gamle klienter sender photo, nye bgType. «Ingen» finnes bare som bgType og vises som gradient (cur).
      if (k === 'photo') next.bgType = v;
      if (k === 'bgType') next.photo = v === 'none' ? 'cur' : v;
      continue;
    }
    if (!LAYOUT[k](v)) return c.json({ error: `Ugyldig verdi for ${k}` }, 400);
    next[k] = { ...(next[k] ?? {}), ...v };
    // Tomme navn betyr standardnavnet og lagres ikke.
    for (const f of ['labels', 'names']) if (v[f]) next[k][f] = Object.fromEntries(Object.entries(v[f]).map(([id, n]) => [id, n.trim()]).filter(([, n]) => n));
  }
  // Egne endringer i fanene eller startsiden: «Egendefinert», med mindre de er lik den valgte profilen.
  if (custom) {
    const p = PROFILES[next.profile ?? 'standard'];
    const same = p && (next.startRoute ?? p.startRoute) === p.startRoute && sameList(next.homeNav ?? p.homeNav, p.homeNav) && sameList(next.finNavList ?? p.finNav, p.finNav) && !next.finNavMeta;
    if (!same) next.profile = 'custom';
  }
  kv.set(c.get('user'), 'layout', next);
  const { finNavList: _l, finNavMeta: _m, finNav: _side, ...rest } = next;
  return c.json({ ...rest, ...profileOf(c.get('user')) });
});
// Ferdige profiler (Innstillinger → PROFIL): Standard, Finans + Boliger og Boliger-profil.
api.get('/me/profiles', authOrToken, (c) => c.json({ ...PROFILES, current: profileOf(c.get('user')).profile,
  labels: { standard: 'Standard', finans_boliger: 'Finans + Boliger', boliger: 'Boliger-profil', custom: 'Egendefinert' } }));

// Værappen i mobilappene: MET/yr (Open-Meteo som reserve), cachet i 10 minutter. ?place=<id> (egne steder også), eller ?lat=&lon=&name=.
api.get('/weather/full', authOrToken, async (c) => {
  const q = c.req.query();
  const own = q.place ? placesOf(c.get('user')).find((x) => x.id === q.place) : null;
  const src = q.source === 'open-meteo' ? 'open-meteo' : 'met';
  if (own) return c.json(await weatherFull({ lat: own.lat, lon: own.lon, name: own.name, source: src }).then((w) => ({ ...w, place: { ...w.place, id: own.id, name: own.name, region: own.region } })));
  return c.json(await weatherFull({ place: q.place, lat: q.lat, lon: q.lon, name: typeof q.name === 'string' ? q.name.slice(0, 60) : undefined, source: src }));
});

// «Sammenlign Yr og Storm»: Yr (MET) mot ECMWF (Open-Meteo, nærmeste åpne kilde til Storm). ?place=<id> (også egne steder) eller ?lat=&lon=.
api.get('/weather/compare', authOrToken, async (c) => {
  const q = c.req.query();
  const own = q.place ? placesOf(c.get('user')).find((x) => x.id === q.place) : null;
  let p = own ? { id: own.id, name: own.name, lat: own.lat, lon: own.lon } : WX_PLACES[String(q.place ?? '').toLowerCase()];
  const lat = Number(q.lat), lon = Number(q.lon);
  if (!p && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && q.lat !== '' && q.lon !== '') p = { id: 'pos', name: typeof q.name === 'string' ? q.name.slice(0, 60) : 'Min posisjon', lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
  return c.json(await weatherCompare(p ?? WX_PLACES.oslo));
});

// Steder i værappen, per bruker: standard Oslo, Bergen, Trondheim og Tromsø. Søk via Kartverket (Open-Meteo som reserve).
const placesOf = (u) => { const v = kv.get(u, 'wx_places', null); return Array.isArray(v) ? v : DEFAULT_PLACES; };
const coord = (v, lim) => { const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= lim ? Math.round(n * 1e4) / 1e4 : null; };
api.get('/weather/places', authOrToken, (c) => c.json(placesOf(c.get('user'))));
api.get('/weather/search', authOrToken, async (c) => {
  try { return c.json(await searchPlaces(c.req.query('q'))); } catch (e) { return c.json({ error: `Stedssøket svarte ikke (${e.message})` }, 502); }
});
api.post('/weather/places', authOrToken, async (c) => {
  const b = await json(c) ?? {};
  const name = String(b.name ?? '').trim().slice(0, 60), lat = coord(b.lat, 90), lon = coord(b.lon, 180);
  if (!name || lat == null || lon == null) return c.json({ error: 'Trenger navn, lat og lon' }, 400);
  const list = placesOf(c.get('user'));
  if (list.length >= 20) return c.json({ error: 'Maks 20 steder' }, 400);
  const dup = list.find((x) => Math.abs(x.lat - lat) < 0.01 && Math.abs(x.lon - lon) < 0.01);
  if (dup) return c.json(list);
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const next = [...list, { id, name, lat, lon, region: String(b.region ?? '').trim().slice(0, 60) }];
  kv.set(c.get('user'), 'wx_places', next);
  return c.json(next, 201);
});
api.delete('/weather/places/:id', authOrToken, (c) => {
  const next = placesOf(c.get('user')).filter((x) => x.id !== c.req.param('id'));
  kv.set(c.get('user'), 'wx_places', next);
  return c.json(next);
});
api.put('/weather/places/order', authOrToken, async (c) => {
  const ids = (await json(c))?.ids;
  if (!Array.isArray(ids)) return c.json({ error: 'Trenger ids' }, 400);
  const list = placesOf(c.get('user')), pos = new Map(ids.map((id, i) => [String(id), i]));
  const next = [...list].sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
  kv.set(c.get('user'), 'wx_places', next);
  return c.json(next);
});

api.get('/me/shortcuts', authOrToken, (c) => c.json(shortcutsFor(c.get('user'))));
// Slår opp logo-domener for lokale snarveier (én gang per navn) og svarer med den oppdaterte listen.
api.post('/me/shortcuts/resolve', authOrToken, async (c) => {
  const open = shortcutsFor(c.get('user')).filter((s) => !s.resolved).map((s) => s.name);
  if (open.length) {
    resolving ??= resolveDomains(open).finally(() => { resolving = null; });
    await resolving;
  }
  return c.json(shortcutsFor(c.get('user')));
});
api.put('/me/shortcuts', authOrToken, async (c) => {
  const b = await json(c);
  if (b === null || (Array.isArray(b) && !b.length)) { kv.del(c.get('user'), 'shortcuts'); return c.json(shortcutsFor(c.get('user'))); }
  if (!Array.isArray(b) || b.length > 40) return c.json({ error: 'Maks 40 snarveier' }, 400);
  const list = [];
  for (const s of b) {
    const name = String(s?.name ?? '').trim().slice(0, 30), url = String(s?.url ?? '').trim();
    if (!name || !/^https?:\/\/\S+$/i.test(url) || url.length > 300) return c.json({ error: `Ugyldig snarvei: ${name || url || '?'}` }, 400);
    list.push({ name, url });
  }
  kv.set(c.get('user'), 'shortcuts', list);
  return c.json(shortcutsFor(c.get('user')));
});

// Standard: en liste med forslag (som før). Med ?full=1: {items, error?} så klienten kan vise hvorfor forslagene mangler.
api.get('/search/suggest', authOrToken, async (c) => {
  const full = c.req.query('full') === '1';
  if (!searchSettings(c.get('user')).suggest) return c.json(full ? { items: [], off: true } : []);
  const r = await ext.getSuggestions(c.req.query('q') ?? '', { withError: true });
  if (full) return c.json(r);
  return c.json(r.items, 200, r.error ? { 'X-Suggest-Error': encodeURIComponent(r.error) } : {});
});

// «✦ AI» i søkefeltet: korte søk (1–2 ord uten spørsmål) går rett til vanlig søk; ellers svarer AI-motoren (Ollama/Gemini).
const QUESTION = /\?|^(hva|hvem|hvor|hvordan|hvorfor|når|hvilk\w*|kan|er|skal|bør|vil|finnes|what|who|where|how|why|when|which|is|are|can|should|does|do)(\s|$)/i;
export const plainFirst = (q) => q.split(/\s+/).filter(Boolean).length <= 2 && !QUESTION.test(q);
api.post('/search/ask', authOrToken, async (c) => {
  const b = await json(c);
  const q = String(b?.q ?? '').trim().slice(0, 300);
  if (!q) return c.json({ error: 'Skriv et spørsmål' }, 400);
  if (!b.force && plainFirst(q)) return c.json({ mode: 'plain', q, notice: 'Kort søk – viser vanlige treff først, uten AI.' });
  const schema = { type: 'OBJECT', properties: { answer: { type: 'STRING' }, followUps: { type: 'ARRAY', items: { type: 'STRING' } }, searchQuery: { type: 'STRING' } }, required: ['answer'] };
  const prompt = 'Svar kort og presist på norsk bokmål (maks 5 setninger) på spørsmålet under. Er du usikker, si det. Ikke finn på tall, priser eller åpningstider du ikke vet.\n'
    + 'Foreslå opptil 3 oppfølgingsspørsmål og et godt Google-søk for å lese mer. Returner JSON.\n'
    + `Dato i dag: ${new Date().toLocaleDateString('nb-NO')}.\nSpørsmål: «${q}»`;
  try {
    const { provider, data } = MOCK
      ? { provider: 'Eksempel', data: { answer: `Dette er et eksempelsvar på «${q}». Med ekte AI-motor svarer Ollama eller Gemini her.`, followUps: [`${q} i Oslo`, `${q} pris`], searchQuery: q } }
      : await aiJson(prompt, schema);
    const answer = String(data?.answer ?? '').trim();
    if (!answer) throw new Error('AI-motoren ga et tomt svar');
    return c.json({ mode: 'ai', q, provider, answer: answer.slice(0, 2000), followUps: (Array.isArray(data.followUps) ? data.followUps : []).map(String).filter(Boolean).slice(0, 3),
      searchQuery: String(data.searchQuery ?? '').trim().slice(0, 200) || q });
  } catch (e) {
    const why = e.name === 'TimeoutError' ? 'AI-motoren svarte ikke i tide' : e.message;
    return c.json({ error: `✦ AI svarte ikke: ${why}. Sjekk AI-motor under FinansHub → Innstillinger → AI-motor.`, reason: why }, 502);
  }
});
api.get('/search/history', authOrToken, (c) => c.json({ items: histOf(c.get('user')), ...searchSettings(c.get('user')) }));
api.post('/search/history', authOrToken, async (c) => {
  const q = cleanQ((await json(c))?.q);
  if (!q) return c.json({ error: 'Tomt søk' }, 400);
  if (searchSettings(c.get('user')).save) addHist(c.get('user'), [q]);
  return c.json({ items: histOf(c.get('user')) });
});
api.delete('/search/history', authOrToken, (c) => { setHist(c.get('user'), []); return c.json({ items: [] }); });
api.delete('/search/history/:q', authOrToken, (c) => {
  const q = cleanQ(decodeURIComponent(c.req.param('q'))).toLowerCase();
  setHist(c.get('user'), histOf(c.get('user')).filter((x) => x.toLowerCase() !== q));
  return c.json({ items: histOf(c.get('user')) });
});
// Takeout-filen kan være stor; nettleseren sender gjerne bare søkene ({queries:[…]}), men rå JSON godtas også.
api.post('/search/history/import', authOrToken, bodyLimit({ maxSize: 25 * 1024 * 1024, onError: (c) => c.json({ error: 'Filen er for stor (maks 25 MB)' }, 413) }), async (c) => {
  let data = null;
  const ct = c.req.header('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const f = (await c.req.parseBody().catch(() => ({}))).file;
    if (f instanceof File) try { data = JSON.parse(await f.text()); } catch { data = null; }
  } else data = await json(c);
  if (data === null) return c.json({ error: 'Kunne ikke lese filen. Velg MyActivity.json fra Google Takeout (Mine aktiviteter → Søk).' }, 400);
  const qs = parseTakeout(data);
  const before = histOf(c.get('user')).length;
  const total = addHist(c.get('user'), qs, { front: false });
  return c.json({ found: qs.length, imported: total - before, total });
});
api.put('/search/settings', authOrToken, async (c) => {
  const b = await json(c) ?? {};
  const ch = {};
  if (typeof b.suggest === 'boolean') ch.searchSuggest = b.suggest;
  if (typeof b.save === 'boolean') ch.searchSave = b.save;
  saveUiPrefs(c.get('user'), ch);
  return c.json(searchSettings(c.get('user')));
});

api.get('/widgets/server-status', authOrToken, async (c) => c.json(await serverStatus()));
api.get('/widgets/ruter', authOrToken, async (c) => {
  try {
    const r = await ext.getDepartures(c.req.query('stop'));
    return c.json({ stop: r.stop, stopId: r.stopId, departures: r.departures.filter((d) => new Date(d.time) > Date.now() - 60_000).map(depOut) });
  } catch (e) { return c.json({ error: e.message }, 502); }
});

// Avganger (prompt 16): søk i Entur, egne stopp per bruker og avganger med sanntid fra hvert stopp.
api.get('/ruter/search', authOrToken, async (c) => {
  try { return c.json(await ext.searchStops(c.req.query('q'))); } catch (e) { return c.json({ error: `Entur svarte ikke (${e.message})` }, 502); }
});
api.get('/ruter/departures', authOrToken, async (c) => {
  try { return c.json(await ext.getStopDepartures(c.req.query('stop'), c.req.query('n'))); } catch (e) { return c.json({ error: e.message }, /Ugyldig/.test(e.message) ? 400 : 502); }
});
async function stopsOf(u) {
  const v = kv.get(u, 'ruter_stops', null);
  if (Array.isArray(v)) return v;
  const d = await safe(ext.getDepartures);
  return d?.stopId ? [{ id: `NSR:StopPlace:${String(d.stopId).replace(/\D/g, '')}`, name: d.stop }] : [];
}
api.get('/me/stops', authOrToken, async (c) => c.json(await stopsOf(c.get('user'))));
api.put('/me/stops', authOrToken, async (c) => {
  const b = await json(c) ?? {};
  if (!Array.isArray(b.stops)) return c.json({ error: 'Trenger stops' }, 400);
  const seen = new Set(), out = [];
  for (const x of b.stops.slice(0, 12)) {
    const id = ext.stopIdOf(x?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id); out.push({ id, name: String(x.name ?? '').trim().slice(0, 60) || id });
  }
  kv.set(c.get('user'), 'ruter_stops', out);
  return c.json(out);
});
const homeStops = async (u) => Promise.all((await stopsOf(u)).slice(0, 6).map(async (s) => {
  const d = await safe(() => ext.getStopDepartures(s.id, 6));
  return { id: s.id, name: s.name, departures: (d?.departures ?? []).filter((x) => !x.cancelled).slice(0, 4), error: d ? undefined : 'Ingen sanntid akkurat nå' };
}));

// Alt mobilforsiden i appene trenger, i ett kall.
api.get('/mobile/home', authOrToken, async (c) => {
  const id = c.get('user'), me = meOut(id);
  const [w, ruter, status, stops] = await Promise.all([safe(ext.getWeather), safe(ext.getRuter), serverStatus(), homeStops(id).catch(() => [])]);
  return c.json({
    name: me.name, serverName: me.serverName, avatarUrl: me.avatarUrl, greeting: greetingFor(osloHour()),
    // Samme felter som /api/weather (vind er fortsatt et tall; detaljer i windInfo), pluss de korte navnene appene bruker.
    weather: w && { ...w, lat: w.lat ?? config.location.lat, lon: w.lon ?? config.location.lon, max: w.hi ?? w.days?.[0]?.max ?? null, min: w.lo ?? w.days?.[0]?.min ?? null, code: w.symbol ?? w.kind ?? null },
    shortcuts: shortcutsFor(id),
    ruter: (ruter?.trips ?? []).map((t) => ({ from: t.from, to: t.to, url: t.url, departures: (t.deps ?? []).filter((d) => new Date(d.time) > Date.now() - 60_000).map(depOut) })),
    stops, // brukerens egne stopp med sanntid (prompt 16)
    serverStatus: status,
    layout: layoutOf(id).mobile ?? {},
    search: searchSettings(id),
    packages: packagesFor(2, id), // Sporing (prompt 11): brukerens egne 2 viktigste pakker (per bruker fra ISO2)
    news: newsFor(id, 5), // Nyhetsleser (prompt 13): «Siste nytt» på forsiden
    design: designOf(id),
    app: appMeta(), // navn og ikon på appen (prompt 17)
    tasks: nextTasks(id, 3), // Huskeliste-widget (prompt 17): de tre neste oppgavene brukeren selv ser (prompt 21)
    birthdays: (() => { try { return birthdaysWidget(id); } catch { return null; } })(), // «BURSDAGER · NESTE» (prompt 24)
  });
});

/* ---------------- Utseende og fotovindu (prompt 13) ---------------- */

/** Valgt utseende med standardverdier: FinansHub-tema, Homelab-tema, mobildesign, papirmodus og fotovindu. */
export const designOf = (id) => {
  const l = layoutOf(id);
  const fresh = installKind() === 'papir';
  const trk = (l.trkOrder ?? []).filter((x) => TRK_CARDS.includes(x));
  return { design: l.design ?? 'lys', compactNav: !!l.compactNav, hlTheme: l.hlTheme ?? (fresh ? '2c' : 'cur'), mobileDesign: l.mobileDesign ?? (fresh ? 'papir' : 'klassisk'),
    paperMode: l.paperMode ?? 'auto', photo: l.photo ?? (fresh ? 'oslo' : 'cur'), onboarded: l.onboarded ?? !fresh, trkOrder: [...trk, ...TRK_CARDS.filter((x) => !trk.includes(x))],
    pages: l.pages ?? {}, finTabs: l.finTabs ?? FIN_TABS_DEFAULT, fourthTab: l.fourthTab ?? 'auto', fab: l.fab ?? 'float',
    tabBar: l.tabBar ?? null, tabBarDefault: TAB_BAR_DEFAULT, iconTheme: l.iconTheme ?? 'standard',
    bgType: l.bgType ?? l.photo ?? (fresh ? 'oslo' : 'cur'), bgPlanet: l.bgPlanet ?? 'auto', bgRotate: l.bgRotate ?? 'daily', bgBlur: l.bgBlur ?? 0, bgDim: l.bgDim ?? 0,
    bgWifiOnly: !!l.bgWifiOnly, bgAnimate: l.bgAnimate ?? true, navStyle: NAV_STYLES.includes(l.navStyle) ? l.navStyle : 'text' };
};

const PHOTOS = join(config.dataDir, 'photo-window');
await mkdir(PHOTOS, { recursive: true });
const photoFile = (id) => join(PHOTOS, `${String(id).replace(/[^\w-]/g, '')}.img`);
const CUR_GRADIENT = 'linear-gradient(160deg, #1d2a44 0%, #3a3f6b 45%, #c9826b 100%)';
// Værgradienter etter MET-symbolet, dag og natt.
function weatherGradient(symbol = '') {
  const night = /_night|polartwilight/.test(symbol);
  if (/thunder/.test(symbol)) return 'linear-gradient(170deg, #1f2230 0%, #3b3f55 55%, #6b6a7a 100%)';
  if (/snow|sleet/.test(symbol)) return 'linear-gradient(170deg, #9fb3c8 0%, #d7e1ea 60%, #f3f5f7 100%)';
  if (/rain/.test(symbol)) return night ? 'linear-gradient(170deg, #10151f 0%, #24303f 60%, #3c4a5a 100%)' : 'linear-gradient(170deg, #4a5a6c 0%, #7d8b99 55%, #b7c0c8 100%)';
  if (/fog/.test(symbol)) return 'linear-gradient(170deg, #8d949a 0%, #b9bec2 60%, #dcdedf 100%)';
  if (/cloudy/.test(symbol) && !/partly/.test(symbol)) return night ? 'linear-gradient(170deg, #161a22 0%, #2c323d 100%)' : 'linear-gradient(170deg, #6f7f90 0%, #a9b5c0 60%, #d5dbe0 100%)';
  if (night) return 'linear-gradient(170deg, #0b1026 0%, #1b2350 55%, #3c3a6e 100%)';
  return 'linear-gradient(170deg, #3d7cc9 0%, #7fb2e5 55%, #f4d9a6 100%)';
}

// Fotovinduet (prompt 14): alle bilder leveres fra serveren under /api/bg/ (se bg.js). url er førstevalget og fallbacks
// prøves etter tur hvis det ikke laster. Gradienten vises bak bildet og er reserven når ingenting laster.
const SHADE = 'linear-gradient(180deg,rgba(0,0,0,.25),transparent 35%,rgba(0,0,0,.45))';
const SPACE_GRADIENT = 'linear-gradient(170deg, #05060d 0%, #141a33 100%)';
const OSLO_GRADIENT = 'linear-gradient(170deg, #f2b36b 0%, #d7766a 45%, #4a3a5e 100%)';
const WEATHER_TEXT = { clear: 'klart', cloudy: 'skyet', rain: 'regn', snow: 'snø', fog: 'tåke', night: 'natt' };
const photoOut = (kind, list, extra) => ({ kind, url: list[0] ?? null, fallbacks: list.slice(1), shade: SHADE, ...extra });

api.get('/photo-window', authOrToken, async (c) => {
  const id = c.get('user');
  let kind = c.req.query('kind') || designOf(id).photo;
  if (!PHOTO_KINDS.includes(kind)) return c.json({ error: 'Ukjent fotovindu' }, 400);
  if (kind === 'custom') {
    const v = kv.get(id, 'photo_v', 0);
    if (v) return c.json(photoOut(kind, [`/api/me/photo-window?v=${v}`, ...osloImages()], { credit: 'Eget bilde', gradient: CUR_GRADIENT }));
    kind = 'cur'; // ikke lastet opp ennå
  }
  if (kind === 'planets') {
    const a = await safe(ext.getApod);
    // Første henting av dagens bilde venter høyst 6 s; ellers vises et planetbilde, og APOD er klart neste gang.
    const apod = MOCK ? null : await Promise.race([apodImage(a), new Promise((r) => setTimeout(() => r(null), 6000).unref?.())]);
    if (apod) return c.json(photoOut(kind, [apod, ...planetsToday()], { credit: `NASA APOD · ${a.title ?? ''}${a.copyright ? ` · © ${String(a.copyright).trim()}` : ''}`.trim(), gradient: SPACE_GRADIENT }));
    return c.json(photoOut(kind, planetsToday(), { credit: a?.media_type === 'video' ? 'Planeter · dagens APOD er en video' : 'Planeter', gradient: SPACE_GRADIENT }));
  }
  if (kind === 'oslo') return c.json(photoOut(kind, osloImages(), { credit: 'Oslo · Operaen og Bjørvika', gradient: OSLO_GRADIENT }));
  if (kind === 'weather') {
    const w = await safe(ext.getWeather);
    const sym = w?.symbol ?? '';
    return c.json(photoOut(kind, weatherImages(sym), { credit: w ? `Vær nå · ${w.text ?? WEATHER_TEXT[weatherKind(sym)]} ${w.temp != null ? Math.round(w.temp) + '°' : ''}`.trim() : 'Vær nå',
      gradient: weatherGradient(sym), symbol: sym || null, weather: weatherKind(sym) }));
  }
  return c.json({ kind: 'cur', url: null, fallbacks: [], credit: '', gradient: CUR_GRADIENT });
});

// Selve bildene. Krever innlogging (sesjon eller app-token) som resten av fotovinduet; kan caches i en dag.
api.get('/bg/:file', authOrToken, async (c) => {
  const f = await readBg(c.req.param('file'));
  if (!f) return c.json({ error: 'Fant ikke bildet' }, 404);
  return c.body(f.body, 200, { 'Content-Type': f.type, 'Cache-Control': `private, max-age=${f.bundled ? 86400 : 604800}`, 'X-Content-Type-Options': 'nosniff' });
});

api.get('/me/photo-window', authOrToken, async (c) => {
  const id = c.get('user');
  if (!kv.get(id, 'photo_v', 0)) return c.json({ error: 'Ingen eget bilde' }, 404);
  try {
    const b = await readFile(photoFile(id));
    return c.body(b, 200, { 'Content-Type': imageKind(b) ?? 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  } catch { return c.json({ error: 'Ingen eget bilde' }, 404); }
});
api.post('/me/photo-window', authOrToken, bodyLimit({ maxSize: 8 * 1024 * 1024 + 64 * 1024, onError: (c) => c.json({ error: 'Bildet er for stort (maks 8 MB)' }, 413) }), async (c) => {
  const f = (await c.req.parseBody().catch(() => ({}))).file;
  if (!(f instanceof File)) return c.json({ error: 'Mangler fil' }, 400);
  const b = Buffer.from(await f.arrayBuffer());
  if (b.length > 8 * 1024 * 1024) return c.json({ error: 'Bildet er for stort (maks 8 MB)' }, 413);
  if (!imageKind(b)) return c.json({ error: 'Bruk et JPEG-, PNG- eller WebP-bilde' }, 400);
  const id = c.get('user'), v = Date.now();
  await writeFile(photoFile(id), b);
  kv.set(id, 'photo_v', v);
  const l = layoutOf(id);
  kv.set(id, 'layout', { ...l, photo: 'custom' });
  return c.json({ kind: 'custom', url: `/api/me/photo-window?v=${v}`, credit: 'Eget bilde' });
});
api.delete('/me/photo-window', authOrToken, async (c) => {
  const id = c.get('user');
  await unlink(photoFile(id)).catch(() => {});
  kv.del(id, 'photo_v');
  const l = layoutOf(id);
  if (l.photo === 'custom') kv.set(id, 'layout', { ...l, photo: 'cur' });
  return c.json({ ok: true, photo: designOf(id).photo });
});

/* ---------------- Widgets (iOS WidgetKit og Android Glance) ---------------- */

// Ett kall med alt widgetene trenger. Hver del hentes for seg, og en del som feiler (eller som brukeren ikke har tilgang til) blir null.
// Finans, Matplan og Domener spørres internt med samme innlogging (cookie eller token) som kallet, så tilgangsreglene er de samme som ellers.
const inner = async (app, path, c) => {
  const headers = {};
  for (const h of ['authorization', 'cookie']) { const v = c.req.header(h); if (v) headers[h] = v; }
  const res = await app.request(path, { headers });
  if (!res.ok) throw new Error(`${path} svarte ${res.status}`);
  return res.json();
};
const part = (p) => p.then((v) => v ?? null, () => null);
const r0 = (n) => (Number.isFinite(+n) ? Math.round(+n) : null);
const daysTo = (d) => (d ? Math.round((new Date(`${String(d).slice(0, 10)}T12:00:00`) - new Date(`${new Date().toLocaleDateString('sv-SE')}T12:00:00`)) / 864e5) : null);

api.get('/mobile/widgets', authOrToken, async (c) => {
  const id = c.get('user'), admin = isAdmin(id);
  const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE');
  const [w, sum, rec, stk, finn, folders, week, week2, subs] = await Promise.all([
    part(safe(ext.getWeather)),
    part(inner(finansApi, '/summary', c)), part(inner(finansApi, '/recurring', c)), part(inner(finansApi, '/stocks', c)), part(inner(finansApi, '/finn', c)),
    part(inner(finansApi, '/folders', c)),
    part(inner(matApi, '/week', c)), part(inner(matApi, `/week?start=${tomorrow}`, c)), // Matplan er per bruker (ISO2)
    part(inner(finansApi, '/subscriptions', c)),
  ]);

  const weather = w && {
    temp: r0(w.temp), symbol: w.symbol ?? w.kind ?? null, desc: w.text ?? w.desc ?? '', hi: r0(w.hi ?? w.days?.[0]?.max), lo: r0(w.lo ?? w.days?.[0]?.min), feels: r0(w.feels),
    place: w.place ?? '', hours: (w.hours ?? []).slice(0, 6).map((h) => ({ t: h.t ?? h.label ?? '', symbol: h.symbol ?? h.icon ?? null, temp: r0(h.temp) })),
  };

  let packages = null;
  { try { const items = packagesFor(4, id); packages = { items: items.map((p) => ({ id: p.id, name: p.name, title: p.title, shop: p.shop, logo: p.logo, moreCount: p.moreCount, carrier: p.carrier, carrierName: p.carrierName, status: p.status, statusText: p.statusText, step: p.step, eta: p.eta, pickupPoint: p.pickupPoint })), active: packagesFor(99, id).length }; } catch { packages = null; } } // brukerens egne (ISO2)

  const budget = sum && {
    month: sum.month, spent: r0(sum.budgetUsed ?? sum.ut), limit: r0(sum.budgetTotal), left: r0(sum.left), pct: sum.budgetTotal ? Math.round((sum.budgetUsed / sum.budgetTotal) * 100) : null, daysLeft: sum.daysLeft ?? null,
    top: [...(sum.budgets ?? [])].sort((a, b) => (b.used ?? 0) - (a.used ?? 0)).slice(0, 3).map((b) => ({ name: b.category, spent: r0(b.used), limit: r0(b.budget), color: b.color })),
  };
  const finance = sum && {
    balance: r0(sum.balance), currency: 'NOK',
    recent: (sum.recent ?? []).slice(0, 4).map((t) => ({ id: t.id, date: t.date, merchant: t.merchant || t.description, amount: t.amount, category: t.category, color: t.color })),
    toReview: (sum.review ?? []).length,
  };

  // Neste trekk: faste utgifter og abonnementer, det som kommer først.
  const charges = [
    ...(Array.isArray(rec) ? rec : []).filter((r) => r.active !== false && r.next).map((r) => ({ name: r.name, amount: r.amount, date: r.next })),
    ...(subs?.items ?? []).filter((s) => s.active !== false && s.nextDate).map((s) => ({ name: s.name, amount: s.price, date: s.nextDate })),
  ].filter((x) => daysTo(x.date) >= 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nextCharge = charges[0] ? { ...charges[0], daysLeft: daysTo(charges[0].date) } : null;

  const stocks = stk?.summary && (stk.configured !== false || stk.mock) ? {
    value: r0(stk.summary.total ?? stk.summary.value), change: r0(stk.summary.result), changePct: stk.summary.invested ? Math.round((stk.summary.result / stk.summary.invested) * 1000) / 10 : null,
    top: [...(stk.positions ?? [])].sort((a, b) => Math.abs(b.dayPct ?? 0) - Math.abs(a.dayPct ?? 0)).slice(0, 3).map((p) => ({ ticker: p.symbol ?? p.ticker, name: p.name, changePct: p.dayPct ?? null })),
  } : null;

  let domains = null;
  if (admin) { try { const d = domainOverview(); domains = { total: d.total, up: d.up, down: d.down, expiringSoon: d.expiringSoon }; } catch { domains = null; } }

  const dayOf = (wk, date) => wk?.days?.find((d) => d.date === date);
  const today = dayOf(week, new Date().toLocaleDateString('sv-SE')), tm = dayOf(week, tomorrow) ?? dayOf(week2, tomorrow);
  const meal = (d) => (d?.name ? { dish: d.name, cook: d.cook ?? null } : null);
  const matplan = week ? { today: meal(today), tomorrow: meal(tm) } : null;

  const finnW = finn && {
    active: finn.ongoing ?? 0, netYear: r0((finn.sold ?? 0) - (finn.bought ?? 0)),
    items: (finn.items ?? []).filter((f) => !f.done).slice(0, 3).map((f) => ({ id: f.id, title: f.item, role: f.role, step: f.stage ?? null, status: f.status ?? '' })),
  };

  const home = Array.isArray(folders) && folders[0] ? folders[0] : null;
  const det = home ? await part(inner(finansApi, `/folders/${home.id}`, c)) : null;
  const boliger = home && { id: home.id, name: home.name, yearTotal: r0(home.yearTotal ?? home.total), count: home.count ?? 0,
    dueSoon: (det?.bills ?? []).filter((b) => b.nextDue).sort((a, b) => String(a.nextDue).localeCompare(String(b.nextDue))).slice(0, 3)
      .map((b) => ({ title: b.name, amount: b.last?.amount ?? null, date: b.nextDue, color: b.color ?? null })) };

  let birthdays = null;
  try { birthdays = birthdaysWidget(id); } catch { birthdays = null; }
  return c.json({ updatedAt: new Date().toISOString(), weather, packages, budget, finance, nextCharge, stocks, domains, matplan, finn: finnW, boliger, birthdays });
});

export default api;
