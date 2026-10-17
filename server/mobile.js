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
import { sessionUser, userInfo, serverName, isAdmin } from './auth.js';
import { packagesFor } from './tracking.js';
import { bearerOk } from './finans/routes.js';
import { uiPrefs, saveUiPrefs } from './ui.js';
import * as integrations from './integrations.js';

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
const depOut = (d) => ({ line: d.line, mode: d.mode, color: MODE_COLOR[d.mode] ?? MODE_COLOR.bus, min: minsTo(d.time), time: hhmm(d.time), to: d.to });

const greetingFor = (h) => (h < 10 ? 'God morgen' : h < 18 ? 'Hei' : 'God kveld');
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
// Andre brukeres bilder (brukerlisten, delte mapper). Bare for innloggede.
api.get('/users/:id/avatar', authOrToken, (c) => sendAvatar(c, c.req.param('id')));

api.get('/me/layout', authOrToken, (c) => c.json(layoutOf(c.get('user'))));
api.put('/me/layout', authOrToken, async (c) => {
  const b = await json(c);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet et objekt' }, 400);
  const next = { ...layoutOf(c.get('user')) };
  for (const [k, v] of Object.entries(b)) {
    if (!LAYOUT[k]) return c.json({ error: `Ukjent nøkkel ${k}` }, 400);
    if (v === null) { delete next[k]; continue; }
    if (!LAYOUT[k](v)) return c.json({ error: `Ugyldig verdi for ${k}` }, 400);
    next[k] = { ...(next[k] ?? {}), ...v };
    // Tomme navn betyr standardnavnet og lagres ikke.
    for (const f of ['labels', 'names']) if (v[f]) next[k][f] = Object.fromEntries(Object.entries(v[f]).map(([id, n]) => [id, n.trim()]).filter(([, n]) => n));
  }
  kv.set(c.get('user'), 'layout', next);
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

api.get('/search/suggest', authOrToken, async (c) => {
  if (!searchSettings(c.get('user')).suggest) return c.json([]);
  return c.json(await ext.getSuggestions(c.req.query('q') ?? ''));
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

// Alt mobilforsiden i appene trenger, i ett kall.
api.get('/mobile/home', authOrToken, async (c) => {
  const id = c.get('user'), me = meOut(id);
  const [w, ruter, status] = await Promise.all([safe(ext.getWeather), safe(ext.getRuter), serverStatus()]);
  return c.json({
    name: me.name, serverName: me.serverName, avatarUrl: me.avatarUrl, greeting: greetingFor(osloHour()),
    // Samme felter som /api/weather (vind er fortsatt et tall; detaljer i windInfo), pluss de korte navnene appene bruker.
    weather: w && { ...w, max: w.hi ?? w.days?.[0]?.max ?? null, min: w.lo ?? w.days?.[0]?.min ?? null, code: w.symbol ?? w.kind ?? null },
    shortcuts: shortcutsFor(id),
    ruter: (ruter?.trips ?? []).map((t) => ({ from: t.from, to: t.to, url: t.url, departures: (t.deps ?? []).filter((d) => new Date(d.time) > Date.now() - 60_000).map(depOut) })),
    serverStatus: status,
    layout: layoutOf(id).mobile ?? {},
    search: searchSettings(id),
    packages: isAdmin(id) ? packagesFor(2) : [], // Sporing (prompt 11): de 2 viktigste pakkene
  });
});

export default api;
