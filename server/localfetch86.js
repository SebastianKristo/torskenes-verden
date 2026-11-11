// Prompt 86: SSRF-vern for adresser brukere selv legger inn (RSS-kilder, artikkelsider fra feeder og iCal-abonnementer).
//
// guardedFetch86(url, init) henter som fetch, men:
//   - bare http/https, og omdirigeringer følges for hånd (maks 5) med ny kontroll for hvert hopp;
//   - private, loopback-, link-local- og metadata-adresser (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7, fe80::/10 …),
//     navn som localhost/*.local/*.lan/*.internal og navn som DNS peker til slike adresser, avvises med LOCAL_MSG86;
//   - offentlige adresser hentes via den vernede agenten i news73.js (kontroll også ved selve tilkoblingen, så DNS-rebinding
//     ikke slipper gjennom);
//   - verter på godkjenningslista (bare admin kan endre den) hentes som før.
//
// Godkjenningslista: kv(OWNER, 'local_fetch_hosts86') – vertsnavn eller IP, maks 50.
//   GET /api/admin/local-fetch-hosts        → {hosts:[…], max:50}                    (bare admin)
//   PUT /api/admin/local-fetch-hosts {hosts} → {hosts:[…], max:50}                    (bare admin)
// Når en admin selv legger til en RSS-/iCal-adresse med lokal vert, legges verten på lista (approveIfAdmin86).
// migrateLocalHosts86() kjøres én gang ved oppgradering: lokale verter i abonnementene til administratorer legges på lista.
import { Hono } from 'hono';
import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { db, kv, OWNER } from './db.js';
import { isAdmin } from './auth.js';
import { _onIcsSet86, userCfg } from './settings.js';

export const LOCAL_MSG86 = 'Lokale adresser må godkjennes av en administrator (Innstillinger → Sikkerhet).';
export const MAX_LOCAL_HOSTS86 = 50;
const KEY = 'local_fetch_hosts86', MIGRATED = 'local_fetch_migrated86', MAX_REDIRECTS = 5;
const LOCAL_NAME = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|.*\.home\.arpa)$/i;
const HOST_RE = /^(?=.{1,253}$)[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?)*$/;

const localErr = () => Object.assign(new Error(LOCAL_MSG86), { code: 'ELOCAL86', status: 403 });
const bare = (h) => String(h ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

// news73.js lastes først ved bruk (den importerer mobile.js, som igjen importerer rss.js – unngår sirkulær last ved oppstart).
let n73 = null;
const news73 = () => (n73 ??= import('./news73.js'));

let resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((x) => x.address);
let transport = null;
/** Bare for tester: {resolve(host) → [ip], fetch(url, init) → Response (erstatter den vernede hentingen)}. null tilbakestiller. */
export function _setNet86(o) {
  resolver = o?.resolve ?? (async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((x) => x.address));
  transport = o?.fetch ?? null;
}

/** Vertsnavn eller IP slik det lagres på lista (også fra en hel adresse). Ugyldig → null. */
export function normHost86(v) {
  let s = String(v ?? '').trim();
  if (!s || s.length > 300) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) { try { s = new URL(s).hostname; } catch { return null; } }
  s = bare(s);
  if (isIP(s)) return s;
  if (/^\d+(\.\d+){3}$/.test(s)) return null; // ser ut som IPv4, men er ikke gyldig
  return HOST_RE.test(s) ? s : null;
}

export function localHosts86() {
  const v = kv.get(OWNER, KEY, []);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
/** Erstatter lista. Kaster {status: 400} ved ugyldig vert eller flere enn 50. */
export function setLocalHosts86(list) {
  if (!Array.isArray(list)) throw Object.assign(new Error('Forventet {hosts: [...]}'), { status: 400 });
  const out = [];
  for (const raw of list) {
    const h = typeof raw === 'string' ? normHost86(raw) : null;
    if (!h) throw Object.assign(new Error(`Ugyldig vert «${String(typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, 80)}». Skriv et vertsnavn eller en IP-adresse, for eksempel nas.local eller 192.168.1.20.`), { status: 400 });
    if (!out.includes(h)) out.push(h);
  }
  if (out.length > MAX_LOCAL_HOSTS86) throw Object.assign(new Error(`Maks ${MAX_LOCAL_HOSTS86} verter`), { status: 400 });
  kv.set(OWNER, KEY, out);
  return out;
}
/** Legger én vert på lista (ingen endring når den står der eller lista er full). → true når den står på lista etterpå. */
export function addLocalHost86(host) {
  const h = normHost86(host), cur = localHosts86();
  if (!h) return false;
  if (cur.includes(h)) return true;
  if (cur.length >= MAX_LOCAL_HOSTS86) return false;
  kv.set(OWNER, KEY, [...cur, h]);
  return true;
}
const approved = (host) => localHosts86().includes(host);

/** Lokal etter navnet eller IP-en alene (uten DNS)? */
async function localLiteral(host) {
  if (!host || LOCAL_NAME.test(host)) return true;
  return isIP(host) ? (await news73()).blockedIp73(host) : false;
}
/** Lokal vert: etter navnet/IP-en, eller fordi DNS peker til en privat adresse. DNS-feil → false (hentingen feiler da av seg selv). */
export async function isLocalHost86(host0) {
  const host = bare(host0);
  if (await localLiteral(host)) return true;
  if (isIP(host)) return false;
  let ips = [];
  try { ips = await resolver(host); } catch { return false; }
  const { blockedIp73 } = await news73();
  return ips.some((ip) => blockedIp73(ip));
}
const hostOfUrl = (url) => { try { const u = new URL(String(url)); return /^https?:$/.test(u.protocol) ? bare(u.hostname) : null; } catch { return null; } };

/** En admin la selv inn adressen: er verten lokal, legges den på godkjenningslista. Andre brukere: ingen endring. */
export async function approveIfAdmin86(user, url) {
  const host = hostOfUrl(url);
  if (!host || !user || !isAdmin(user) || approved(host)) return false;
  if (!(await isLocalHost86(host))) return false;
  return addLocalHost86(host);
}

/** fetch med vernet over. init.redirect overstyres (omdirigeringer følges her). */
export async function guardedFetch86(url, init = {}) {
  let cur;
  try { cur = new URL(String(url)); } catch { throw new Error('Ugyldig adresse'); }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (cur.protocol !== 'http:' && cur.protocol !== 'https:') throw new Error('Bare http og https');
    const host = bare(cur.hostname);
    let res;
    if (approved(host)) res = await globalThis.fetch(cur.href, { ...init, redirect: 'manual' });
    else {
      if (await isLocalHost86(host)) throw localErr();
      try { res = await (transport ?? (await pinned()))(cur.href, { ...init, redirect: 'manual' }); }
      catch (e) { if (e?.code === 'ESSRF' || e?.cause?.code === 'ESSRF') throw localErr(); throw e; }
    }
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;
    const loc = res.headers.get('location');
    if (!loc) return res;
    try { await res.body?.cancel?.(); } catch { /* */ }
    if (hop === MAX_REDIRECTS) break;
    try { cur = new URL(loc, cur); } catch { throw new Error('Ugyldig omdirigering'); }
  }
  throw new Error('For mange omdirigeringer');
}
// Vanlig drift: den vernede agenten i news73.js (kontrollerer adressen ved tilkoblingen). Er globalThis.fetch byttet ut (tester som
// later som de er nettet), brukes den – kontrollen over (navn, IP og DNS) gjelder uansett.
const NATIVE = /internal\/deps\/undici/;
async function pinned() {
  const f = globalThis.fetch;
  let under = f;
  while (under?.__obs51 && under.__orig51) under = under.__orig51; // målingen i obs51/trace.js ligger utenpå
  let native = false;
  try { native = NATIVE.test(Function.prototype.toString.call(under)); } catch { native = false; }
  return native ? (await news73()).safeFetch73 : f;
}

/* ---------------- Migrering (én gang) ---------------- */

/** Lokale verter i RSS-/iCal-abonnementene til administratorer legges på lista, så det som virket før oppgraderingen fortsatt virker. */
export async function migrateLocalHosts86({ force = false } = {}) {
  if (!force && kv.get(OWNER, MIGRATED, null)) return { skipped: true, added: [] };
  const urls = [];
  let admins = [];
  try { admins = db.prepare("SELECT id FROM users WHERE role='admin'").all().map((r) => r.id); } catch { admins = []; }
  for (const u of admins) {
    try { for (const f of db.prepare('SELECT url FROM rss_feed WHERE user=?').all(u)) urls.push(f.url); } catch { /* tabellen finnes ikke ennå */ }
    try { for (const x of kv.get(u, 'kal35_ext', null)?.ical ?? []) urls.push(x?.url); } catch { /* */ }
    try { for (const k of ['cal_ics', 'canvas_ics']) urls.push(userCfg(u, k)); } catch { /* */ }
  }
  const added = [];
  for (const host of new Set(urls.map(hostOfUrl).filter(Boolean))) {
    if (approved(host)) continue;
    try { if (await isLocalHost86(host) && addLocalHost86(host)) added.push(host); } catch { /* neste */ }
  }
  kv.set(OWNER, MIGRATED, Date.now());
  if (added.length) console.log(`[localfetch] Oppgradering: ${added.length} lokale verter fra administratorenes RSS-/iCal-abonnementer er godkjent (${added.join(', ')}). Se Innstillinger → Sikkerhet.`);
  return { skipped: false, added };
}

// Skole-/Canvas-iCal (cal_ics, canvas_ics) lagres i settings.js: en admin som legger inn en lokal adresse, godkjenner verten.
_onIcsSet86((user, url) => { approveIfAdmin86(user, url).catch(() => {}); });

/* ---------------- API (bare admin) ---------------- */

export function mountLocalFetch86(app, authOrToken) {
  const api = new Hono();
  const NO_STORE = { 'Cache-Control': 'no-store' };
  const out = () => ({ hosts: localHosts86(), max: MAX_LOCAL_HOSTS86 });
  api.use('/admin/local-fetch-hosts', authOrToken, async (c, next) => {
    if (!isAdmin(c.get('user')) || c.get('impersonation')?.target) return c.json({ error: 'Bare administratorer kan gjøre dette' }, 403);
    await next();
  });
  api.get('/admin/local-fetch-hosts', (c) => c.json(out(), 200, NO_STORE));
  api.put('/admin/local-fetch-hosts', async (c) => {
    let b = null;
    try { b = await c.req.json(); } catch { b = null; }
    try { setLocalHosts86(b && typeof b === 'object' ? b.hosts : null); } catch (e) { return c.json({ error: e.message }, e.status ?? 400, NO_STORE); }
    return c.json(out(), 200, NO_STORE);
  });
  app.route('/api', api);
}
