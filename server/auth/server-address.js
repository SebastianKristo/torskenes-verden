// Prompt 46 (SERVER46), claude-code-mac-oppdatering-intern-ip.md – «Ser etter oppdateringer på 172.18.0.3 …».
//
// Rotårsak (serverdelen): /api/discovery og /api/me/server (auth41.js) laget «lokal adresse» fra os.networkInterfaces(). Inne i
// Docker er det bare bridge-nettets adresse (172.18.0.3), som ingen Mac/telefon kan nå. Kalender for Mac lagret den som
// serveradresse og sjekket oppdateringer der – uten tidsavbrudd. Nå bygger serveren aldri URL-er fra container-IP:
//   1. PUBLIC_URL (.env), f.eks. https://home.kristo.no
//   2. X-Forwarded-Proto/-Host – BARE når vertsnavnet er et kjent eget domene (PUBLIC_URL, Innstillinger → Server: ekstern/lokal
//      adresse, LOCAL_URL, eller APP_DOMAINS=a.no,b.no). Ellers ignoreres headeren (ingen host-header-injeksjon i lenker/manifest).
//   3. Host-headeren, men aldri en Docker-/loopback-adresse.
// LAN-adresser (lanUrls46): LOCAL_URL fra .env, ellers grensesnittene – men ikke inne i en container (der er de alltid interne).
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { kv, OWNER } from '../db.js';
import { config } from '../config.js';
import { buildInfo } from '../cache-bust.js';
import { serverName } from './session.js';
import { serverUrls47 } from '../system/server-urls.js'; // prompt 47: standardadresser og «Tilbakestill til standard»
import { normalizeServerUrl } from '../net/server-url.js';

// Samme normalisering som appene (shared/testvektorer/serveradresse.json): uten skjema → http for lokale verter, ellers https;
// sti og / til slutt fjernes, porten beholdes, aldri brukernavn/passord.
export const cleanUrl46 = (v) => normalizeServerUrl(v);
const hostOfUrl = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return null; } };
const hostnameOf = (h) => String(h ?? '').toLowerCase().replace(/:\d{1,5}$/, '').replace(/^\[|\]$/g, '');

/** Docker-/loopback-/link-local-adresser (172.16.0.0/12, 127.0.0.0/8, 169.254/16, ::1, fc00::/7) – aldri en adresse brukeren kan nå. */
export function isInternalIp46(host) {
  const h = hostnameOf(host);
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  }
  return /^f[cd][0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h);
}
/** Privat nett (også 10/8 og 192.168/16): kan være LAN, men aldri i et offentlig manifest. */
export function isPrivateIp46(host) {
  const h = hostnameOf(host);
  if (isInternalIp46(h)) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  return !!m && (Number(m[1]) === 10 || (Number(m[1]) === 192 && Number(m[2]) === 168) || (Number(m[1]) === 100 && Number(m[2]) >= 64 && Number(m[2]) <= 127));
}

let inDocker = null;
/** Kjører vi i en container? (/.dockerenv, eller docker/containerd/lxc i cgroup). INSIDE_DOCKER=0/1 overstyrer. */
export function inContainer46() {
  if (process.env.INSIDE_DOCKER === '1') return true;
  if (process.env.INSIDE_DOCKER === '0') return false;
  if (inDocker !== null) return inDocker;
  try { inDocker = existsSync('/.dockerenv') || /docker|containerd|kubepods/.test(readFileSync('/proc/1/cgroup', 'utf8')); } catch { inDocker = existsSync('/.dockerenv'); }
  return inDocker;
}

/** PUBLIC_URL fra .env, ellers den eksterne adressen admin har satt (Innstillinger → Server). */
export function publicUrl46() {
  const env = cleanUrl46(process.env.PUBLIC_URL);
  if (env) return env;
  const s = kvServer89(OWNER, 'server41');
  const ext = cleanUrl46(s.external);
  return ext && !isInternalIp46(hostOfUrl(ext)) ? ext : null;
}
/** Vertsnavn vi stoler på i X-Forwarded-Host. */
export function knownHosts46() {
  const s = kvServer89(OWNER, 'server41');
  const list = [process.env.PUBLIC_URL, process.env.LOCAL_URL, s.external, ...(Array.isArray(s.local) ? s.local : [])].map(cleanUrl46).filter(Boolean).map(hostOfUrl);
  for (const d of String(process.env.APP_DOMAINS ?? '').split(',')) { const x = d.trim().toLowerCase(); if (/^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(x)) list.push(x); }
  const out = new Set();
  for (const h of list) if (h) { out.add(h); out.add(hostnameOf(h)); }
  return out;
}
const HOST_RE = /^[a-z0-9.-]{1,253}(:\d{1,5})?$|^\[[0-9a-f:]+\](:\d{1,5})?$/i;
/**
 * Offentlig opphav for lenker (QR, delingslenker, varsler, manifest): PUBLIC_URL → klarert X-Forwarded-Host → Host (aldri intern IP).
 * → 'https://home.kristo.no' | '' (ukjent – bruk relative URL-er).
 */
export function originOf46(c, { preferPublic = true } = {}) {
  const pub = publicUrl46();
  if (preferPublic && pub) return pub;
  let u = null; try { u = new URL(c.req.url); } catch { /* */ }
  const known = knownHosts46();
  const xfh = String(c.req.header('x-forwarded-host') ?? '').split(',')[0].trim().toLowerCase();
  if (xfh && HOST_RE.test(xfh) && (known.has(xfh) || known.has(hostnameOf(xfh)))) {
    const p = String(c.req.header('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase();
    return `${p === 'http' ? 'http' : 'https'}://${xfh}`;
  }
  const host = String(c.req.header('host') ?? u?.host ?? '').trim().toLowerCase();
  if (host && HOST_RE.test(host) && !isInternalIp46(host)) return `${u?.protocol === 'https:' ? 'https' : 'http'}://${host}`;
  return pub ?? '';
}
/** Vertsnavnet (uten protokoll) til originOf46, eller fallback. */
export const hostOf46 = (c, fallback = 'home.kristo.no') => hostOfUrl(originOf46(c)) || fallback;

/** LAN-adresser til Homelab: LOCAL_URL (.env), ellers grensesnittene – men aldri inne i en container (der er alt Docker-internt). */
export function lanUrls46() {
  const env = String(process.env.LOCAL_URL ?? '').split(',').map(cleanUrl46).filter((x) => x && !isInternalIp46(hostOfUrl(x)));
  if (env.length) return env.slice(0, 4);
  if (inContainer46()) return [];
  const out = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !isInternalIp46(a.address)) out.push(`http://${a.address}:${config.port}`);
  return out.slice(0, 4);
}
/** Fjerner interne adresser fra en lagret adresseliste (eldre versjoner lagret 172.18.0.3). */
export const dropInternal46 = (list) => (Array.isArray(list) ? list.map(cleanUrl46).filter((x) => x && !isInternalIp46(hostOfUrl(x))) : []);

/* ---------------- Gammelt standarddomene ---------------- */

// Prompt 89 (WEB89, claude-code-standard-serveradresser.md): standarddomenet er os.smarthjemeksperten.no (med k).
// Eldre versjoner lagret den feilstavede «…experten.no» som standard. En lagret adresse som er NØYAKTIG den gamle standarden
// (evt. med / til slutt eller store bokstaver) byttes til den nye – første gang den leses – og skrives tilbake. Andre adresser røres ikke.

export const OLD_PUBLIC_URL89 = 'https://os.smarthjem' + 'experten.no';
export const NEW_PUBLIC_URL89 = 'https://os.smarthjemeksperten.no';

/** Den nye standarden hvis v er nøyaktig den gamle, ellers v uendret. */
export function migrateUrl89(v) {
  if (typeof v !== 'string') return v;
  return v.trim().replace(/\/+$/, '').toLowerCase() === OLD_PUBLIC_URL89 ? NEW_PUBLIC_URL89 : v;
}

/** Leser kv(user,key) og migrerer feltet «external» (lagres tilbake ved endring). → objektet (aldri null). */
export function kvServer89(user, key) {
  const s = kv.get(user, key, {}) ?? {};
  if (s && typeof s === 'object' && typeof s.external === 'string') {
    const n = migrateUrl89(s.external);
    if (n !== s.external) { const next = { ...s, external: n }; try { kv.set(user, key, next); } catch { /* lesing skal aldri feile */ } return next; }
  }
  return s;
}

/* ---------------- Serverens adresser for appene (/api/discovery, /api/me/server) ---------------- */

const URL_RE = /^https?:\/\/[^\s/?#]+(?::\d+)?(\/[^\s]*)?$/i;
const cleanUrl = (v) => { const s = String(v ?? '').trim().replace(/\/+$/, ''); return URL_RE.test(s) ? s : null; };
// Prompt 46: inne i Docker ga networkInterfaces() bare bridge-adressen (http://172.18.0.3:3000) – den ble «lokal adresse» i
// /api/discovery og /api/me/server, og Kalender for Mac sjekket oppdateringer mot den. Nå kommer lokale adresser fra lanUrls46.
/** Serverens egne adresser (admin kan sette dem i kv(OWNER,'server41')). Interne adresser fjernes alltid. */
export function serverAddresses41() {
  const s = kvServer89(OWNER, 'server41');
  const saved = dropInternal46(s.local);
  const local = saved.length ? saved : lanUrls46();
  const ext = dropInternal46([s.external])[0] ?? null;
  return { local, external: ext ?? publicUrl46() ?? cleanUrl(process.env.PUBLIC_URL) ?? null };
}
let version = null;
export function discovery41() {
  try { version ??= buildInfo().version ?? null; } catch { version = null; }
  const a = serverAddresses41();
  return { name: serverName(), version, local: a.local, external: a.external, app: 'homelab', api: 41 };
}
export function meServer41(u) {
  const s = kvServer89(u, 'server41_me');
  const d = serverAddresses41();
  // Prompt 46: en lagret intern adresse (172.18.0.3 fra eldre versjoner) erstattes av den oppdagede/offentlige.
  // Prompt 47: uten lagret eller oppdaget adresse gjelder standardverdiene (PUBLIC_URL/LOCAL_URL, ellers os.smarthjemeksperten.no / 10.69.1.39:3000).
  // Lokal: lagret per bruker → admin-satt (Innstillinger → Server) → LOCAL_URL/standarden. Oppdagede grensesnitt-adresser bare som
  // siste reserve, og aldri Docker-bridge (dropInternal46).
  const def = serverUrls47();
  const adminLocal = dropInternal46((kv.get(OWNER, 'server41', {}) ?? {}).local)[0] ?? null;
  const local = dropInternal46([s.local])[0] ?? adminLocal ?? def.localUrl ?? d.local[0] ?? null, external = dropInternal46([s.external])[0] ?? d.external ?? def.publicUrl;
  return { local, external, auto: s.auto !== false, discovered: d, defaults: { local: def.localUrl, external: def.publicUrl },
    isDefault: local === def.localUrl && external === def.publicUrl, updatedAt: s.updatedAt ?? null, updatedBy: s.updatedBy ?? null };
}
export function setMeServer41(u, b = {}) {
  const cur = kvServer89(u, 'server41_me');
  const next = { ...cur };
  // Prompt 47: {reset:true} = «Tilbakestill til standard» (begge feltene får standardverdiene; local/external i samme kall ignoreres).
  if (b.reset === true) { const def = serverUrls47(); b = { ...b, local: def.localUrl, external: def.publicUrl }; }
  for (const k of ['local', 'external']) if (k in b) {
    if (b[k] === null || b[k] === '') next[k] = null;
    else {
      const v = cleanUrl(b[k]); if (!v) throw Object.assign(new Error(`${k === 'local' ? 'Lokal' : 'Ekstern'} adresse må starte med http:// eller https://`), { status: 400 });
      if (!dropInternal46([v]).length) throw Object.assign(new Error('Adressen er Docker-intern (f.eks. 172.18.x.x) og kan ikke nås fra andre enheter. Bruk LAN-adressen eller domenet.'), { status: 400 }); // prompt 46
      next[k] = v;
    }
  }
  if ('auto' in b) { if (typeof b.auto !== 'boolean') throw Object.assign(new Error('auto må være true eller false'), { status: 400 }); next.auto = b.auto; }
  // Prompt 47: synk mellom enheter – når og fra hvilken enhet adressene sist ble endret.
  next.updatedAt = new Date().toISOString();
  next.updatedBy = typeof b.device === 'string' ? b.device.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || null : null;
  kv.set(u, 'server41_me', next);
  return meServer41(u);
}
