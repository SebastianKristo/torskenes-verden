// Tailscale: datakilden og normaliseringen (prompt 57, claude-code-tailscale.md §1).
//
// To kilder, valgt automatisk (modus «auto», Innstillinger → Tilkoblinger → Tailscale):
//   A. LocalAPI (foretrukket): HTTP over unix-socketen /var/run/tailscale/tailscaled.sock (TAILSCALE_SOCKET overstyrer).
//      Ingen nøkkel. Bare to kall er lov: GET /localapi/v0/status og POST /localapi/v0/ping (latens, direkte eller DERP).
//      Socketen monteres lesende (:ro) i docker-compose.yml. Ingenting annet sendes til tailscaled.
//   B. Tailscale-API-et (reserve): GET https://api.tailscale.com/api/v2/tailnet/<tailnet>/devices?fields=all med en OAuth-klient
//      (scope devices:core:read) eller en API-nøkkel, lagret kryptert som hemmelighet på serveren (settings.js). Nøkkelen forlater
//      aldri serveren, logges aldri og står aldri i en feilmelding. Eneste andre kall er OAuth-tokenet (client_credentials).
// Ingen skrivende kall mot Tailscale: ingenting slettes, autoriseres eller endres.
//
// Begge kildene normaliseres til samme modell (normaliser*), og listen caches i 30 s (cached('tailscale', …)).
import { request } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { cached } from '../cache.js';
import { cfg } from '../settings.js';

export const SOCKET_DEFAULT = '/var/run/tailscale/tailscaled.sock';
export const socketPath = () => process.env.TAILSCALE_SOCKET || SOCKET_DEFAULT;
export const API_BASE = 'https://api.tailscale.com';
export const INGEN_KILDE = 'Fant ikke tailscaled.sock – mount /var/run/tailscale eller bruk API-nøkkel';
const MOCK = () => process.env.MOCK_DATA === '1';
const DAY = 86_400_000;

/* ---------------- Klassifisering ---------------- */

// kind → ikon (lucide), samme navn på web; appene har sine egne symboler for de samme typene.
export const KIND_ICON = { server: 'server', desktop: 'monitor', laptop: 'laptop', mobile: 'smartphone', tablet: 'tablet', iot: 'cpu' };
export const KIND_LABEL = { server: 'Server', desktop: 'Datamaskin', laptop: 'Bærbar', mobile: 'Mobil', tablet: 'Nettbrett', iot: 'Smarthus' };
const IOT = /(^|[^a-z])(homeassistant|home-assistant|hassio|esp(home)?[0-9-]*|shelly[a-z0-9-]*|pikvm)([^a-z]|$)/;
const SERVER_HOST = /(unraid|proxmox|(^|[^a-z])pve|truenas|(^|[^a-z])nas([^a-z]|$)|server|homelab)/;

/** Type enhet ut fra OS og vertsnavn: server | desktop | laptop | mobile | tablet | iot. */
export function classify(os, host) {
  const o = String(os ?? '').toLowerCase().trim(), h = String(host ?? '').toLowerCase().trim();
  if (IOT.test(h)) return 'iot';
  if (o === 'ipados' || h.includes('ipad')) return 'tablet';
  if (o === 'ios') return 'mobile';
  if (o === 'android') return /tablet|(^|[^a-z])tab([^a-z]|$)|galaxy-tab|pad/.test(h) ? 'tablet' : 'mobile';
  if (o === 'tvos') return 'iot';
  if (h.includes('macbook') || h.includes('laptop') || h.includes('thinkpad')) return 'laptop';
  if (o === 'windows') return SERVER_HOST.test(h) ? 'server' : 'desktop';
  if (o === 'macos') return 'desktop';
  if (o === 'linux' || o === 'freebsd' || o === 'openbsd' || SERVER_HOST.test(h)) return 'server';
  return 'desktop';
}

/* ---------------- Normalisering ---------------- */

const NEVER = /^0001-01-01/;
const isoOr = (v) => (typeof v === 'string' && v && !NEVER.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const dnsOf = (v) => String(v ?? '').replace(/\.$/, '');
const nameOf = (dns, host) => (dns ? dns.split('.')[0] : '') || String(host ?? '').trim() || 'ukjent';
const ipv4 = (list) => (Array.isArray(list) ? list.find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x)) : null) ?? null;
const ipv6 = (list) => (Array.isArray(list) ? list.find((x) => String(x).includes(':')) : null) ?? null;
const daysUntil = (iso, now) => (iso ? Math.ceil((Date.parse(iso) - now) / DAY) : null);
const num = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : 0);
const tags = (t) => (Array.isArray(t) ? t.filter((x) => typeof x === 'string').slice(0, 20) : []);

/** Tunnelen for en peer fra LocalAPI: 'direkte' (CurAddr), 'derp:<relay>' (bare via DERP) eller null (offline/ukjent). */
export function tunnelOf(p) {
  if (!p?.Online) return null;
  if (p.CurAddr) return 'direkte';
  return p.Relay ? `derp:${String(p.Relay).toLowerCase()}` : null;
}

function base(now, x) {
  const expires = x.keyExpiry;
  return {
    id: x.id, name: x.name, host: x.host, dns: x.dns, ip: x.ip, ipv6: x.ipv6, os: x.os, kind: classify(x.os, x.host || x.name),
    user: x.user, tags: x.tags, online: !!x.online, lastSeen: x.lastSeen, self: !!x.self, exitNode: !!x.exitNode,
    tunnel: x.tunnel ?? null, latencyMs: null, rx: x.rx ?? 0, tx: x.tx ?? 0,
    clientVersion: x.clientVersion ?? null, updateAvailable: x.updateAvailable ?? null,
    keyExpiry: expires, expiresInDays: daysUntil(expires, now),
  };
}

/** GET /localapi/v0/status → {devices, tailnet, selfVersion}. Self står først. now (ms) gir expiresInDays. */
export function normaliserLocalApi(status, now = Date.now()) {
  const users = status?.User ?? {};
  const userOf = (id) => users[String(id)]?.LoginName ?? users[String(id)]?.DisplayName ?? null;
  const version = String(status?.Version ?? '').split('-')[0] || null;
  const one = (p, self) => {
    const dns = dnsOf(p.DNSName);
    return base(now, {
      id: String(p.ID || p.PublicKey || dns), name: nameOf(dns, p.HostName), host: String(p.HostName ?? ''), dns, ip: ipv4(p.TailscaleIPs), ipv6: ipv6(p.TailscaleIPs),
      os: String(p.OS ?? ''), user: userOf(p.UserID), tags: tags(p.Tags), online: self ? true : !!p.Online, lastSeen: self ? null : isoOr(p.LastSeen),
      self, exitNode: !!p.ExitNode, tunnel: self ? null : tunnelOf(p), rx: num(p.RxBytes), tx: num(p.TxBytes),
      clientVersion: self ? version : null, updateAvailable: null, keyExpiry: isoOr(p.KeyExpiry),
    });
  };
  const devices = [];
  if (status?.Self) devices.push(one(status.Self, true));
  for (const p of Object.values(status?.Peer ?? {})) if (p && typeof p === 'object') devices.push(one(p, false));
  return { devices, tailnet: status?.CurrentTailnet?.Name ?? null, magicDns: status?.CurrentTailnet?.MagicDNSSuffix ?? status?.MagicDNSSuffix ?? null, selfVersion: version };
}

/** GET /api/v2/tailnet/-/devices?fields=all → {devices}. Online = connectedToControl, ellers sett siste 5 min. */
export function normaliserApi(json, now = Date.now()) {
  const list = Array.isArray(json?.devices) ? json.devices : [];
  const devices = list.filter((d) => d && typeof d === 'object').map((d) => {
    const dns = dnsOf(d.name), last = isoOr(d.lastSeen);
    const online = typeof d.connectedToControl === 'boolean' ? d.connectedToControl : !!last && now - Date.parse(last) < 5 * 60_000;
    return base(now, {
      id: String(d.nodeId || d.id || dns), name: nameOf(dns, d.hostname), host: String(d.hostname ?? ''), dns, ip: ipv4(d.addresses), ipv6: ipv6(d.addresses),
      os: String(d.os ?? ''), user: typeof d.user === 'string' ? d.user : null, tags: tags(d.tags), online, lastSeen: online ? null : last,
      self: false, exitNode: false, tunnel: null, rx: 0, tx: 0,
      clientVersion: String(d.clientVersion ?? '').split('-')[0] || null, updateAvailable: typeof d.updateAvailable === 'boolean' ? d.updateAvailable : null,
      keyExpiry: d.keyExpiryDisabled ? null : isoOr(d.expires),
    });
  });
  return { devices, tailnet: null, magicDns: devices.find((d) => d.dns.includes('.'))?.dns.split('.').slice(1).join('.') || null, selfVersion: null };
}

/** Online først, deretter navn (norsk sortering). */
export const sortDevices = (list) => list.slice().sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'nb'));

/* ---------------- LocalAPI over unix-socket ---------------- */

// Bare disse kallene går til tailscaled. Alt annet avvises før socketen åpnes.
const LOCALAPI_ALLOWED = [['GET', /^\/localapi\/v0\/status$/], ['POST', /^\/localapi\/v0\/ping\?ip=[0-9a-f.:]+&type=disco$/i]];

export function socketFinnes(path = socketPath()) {
  try { return existsSync(path) && statSync(path).isSocket(); } catch { return false; }
}

/** Ett kall til LocalAPI. → JSON. Kaster med norsk melding. */
export function localApi(path, { method = 'GET', timeoutMs = 5000, socket = socketPath() } = {}) {
  if (!LOCALAPI_ALLOWED.some(([m, re]) => m === method && re.test(path))) return Promise.reject(new Error('Dette LocalAPI-kallet er ikke tillatt'));
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: socket, path, method, headers: { Host: 'local-tailscaled.sock', 'Sec-Tailscale': 'localapi', Accept: 'application/json' }, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; if (body.length > 8_000_000) req.destroy(new Error('For stort svar fra tailscaled')); });
      res.on('end', () => {
        if (res.statusCode === 403) return reject(new Error('tailscaled avviste kallet (mangler tilgang til LocalAPI)'));
        if (res.statusCode >= 400) return reject(new Error(`tailscaled svarte ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error('tailscaled ga et svar som ikke er JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('tailscaled svarte ikke i tide')));
    req.on('error', (e) => reject(e?.code === 'ENOENT' || e?.code === 'ECONNREFUSED' ? new Error(INGEN_KILDE) : e));
    req.end();
  });
}

/* ---------------- Tailscale-API-et ---------------- */

let apiFetch = null;
/** Bare for tester: bytt ut fetch for api.tailscale.com. */
export const _setTailscaleFetch = (fn) => { apiFetch = fn; oauth = null; };
const doFetch = (...a) => (apiFetch ?? fetch)(...a);

const secretCfg = (k) => String(cfg(k) ?? '').trim();
export const apiConfigured = () => !!(secretCfg('ts_api_key') || (secretCfg('ts_oauth_id') && secretCfg('ts_oauth_secret')));
const tailnetName = () => (/^[\w.@-]{1,120}$/.test(secretCfg('ts_tailnet')) ? secretCfg('ts_tailnet') : '-');

let oauth = null; // {token, until}
async function bearer() {
  const key = secretCfg('ts_api_key');
  if (key) return key;
  if (oauth && oauth.until > Date.now()) return oauth.token;
  const id = secretCfg('ts_oauth_id'), sec = secretCfg('ts_oauth_secret');
  if (!id || !sec) throw new Error(INGEN_KILDE);
  const r = await doFetch(`${API_BASE}/api/v2/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: sec, grant_type: 'client_credentials', scope: 'devices:core:read' }).toString(), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 400 ? 'Tailscale godtok ikke OAuth-klienten' : `Tailscale svarte ${r.status} på OAuth`);
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('Tailscale ga ikke noe OAuth-token');
  oauth = { token: j.access_token, until: Date.now() + Math.max(60, (Number(j.expires_in) || 3600) - 60) * 1000 };
  return oauth.token;
}

async function apiDevices() {
  const r = await doFetch(`${API_BASE}/api/v2/tailnet/${encodeURIComponent(tailnetName())}/devices?fields=all`, { headers: { authorization: `Bearer ${await bearer()}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 401 || r.status === 403) { oauth = null; throw new Error('Tailscale godtok ikke nøkkelen (trenger devices:core:read)'); }
  if (!r.ok) throw new Error(`Tailscale-API-et svarte ${r.status}`);
  return r.json();
}

/* ---------------- Valg av kilde ---------------- */

export const MODES = ['auto', 'localapi', 'api'];
const modeCfg = () => (MODES.includes(secretCfg('ts_mode')) ? secretCfg('ts_mode') : 'auto');

/** Hvilken kilde brukes nå: 'localapi' | 'api' | 'demo' | null (ingen). */
export function chooseSource() {
  const m = modeCfg(), sock = socketFinnes(), key = apiConfigured();
  if (m === 'localapi') return sock ? 'localapi' : MOCK() ? 'demo' : null;
  if (m === 'api') return key ? 'api' : MOCK() ? 'demo' : null;
  if (sock) return 'localapi';
  if (key) return 'api';
  return MOCK() ? 'demo' : null;
}

let demoImpl = null;
const demo = async (now) => { demoImpl ??= (await import('./demo.js')).demoStatus; return normaliserLocalApi(demoImpl(now), now); };

/** Henter fra kilden (uten cache). → {source, devices (sortert), tailnet, magicDns, selfVersion, updatedAt} */
export async function readSource(now = Date.now()) {
  const source = chooseSource();
  if (!source) throw Object.assign(new Error(INGEN_KILDE), { code: 'TAILSCALE_NOT_CONFIGURED', status: 503 });
  const n = source === 'localapi' ? normaliserLocalApi(await localApi('/localapi/v0/status'), now) : source === 'api' ? normaliserApi(await apiDevices(), now) : await demo(now);
  return { source, ...n, devices: sortDevices(n.devices), updatedAt: new Date(now).toISOString() };
}

/** Den normaliserte listen, cachet i 30 s. */
export const getTailnet = () => cached('tailscale', 30_000, () => readSource());

/** Pinger én enhet via LocalAPI (disco-ping). → {ok, latencyMs, tunnel, error?}. Krever LocalAPI. */
export async function pingIp(ip, { source = chooseSource() } = {}) {
  if (!/^[0-9a-f.:]{3,45}$/i.test(String(ip ?? ''))) return { ok: false, latencyMs: null, tunnel: null, error: 'Ugyldig adresse' };
  if (source === 'demo') return { ok: true, latencyMs: 2 + (String(ip).split('.').pop() % 7), tunnel: 'direkte' };
  if (source !== 'localapi') return { ok: false, latencyMs: null, tunnel: null, error: 'Ping krever LocalAPI (tailscaled.sock)', code: 'PING_NEEDS_LOCALAPI' };
  try {
    const r = await localApi(`/localapi/v0/ping?ip=${encodeURIComponent(ip)}&type=disco`, { method: 'POST', timeoutMs: 6000 });
    if (r?.Err || !(Number(r?.LatencySeconds) >= 0)) return { ok: false, latencyMs: null, tunnel: null, error: 'Ingen svar' };
    const tunnel = r.Endpoint ? 'direkte' : r.DERPRegionCode ? `derp:${String(r.DERPRegionCode).toLowerCase()}` : null;
    return { ok: true, latencyMs: Math.round(Number(r.LatencySeconds) * 10000) / 10, tunnel };
  } catch (e) { return { ok: false, latencyMs: null, tunnel: null, error: e.message }; }
}

/** Test tilkobling (Innstillinger → Tilkoblinger → Tailscale). Kaster aldri. */
export async function testTailscale() {
  const t0 = Date.now();
  try {
    const r = await readSource();
    const on = r.devices.filter((d) => d.online).length;
    const via = r.source === 'localapi' ? 'LocalAPI (tailscaled.sock)' : r.source === 'api' ? 'Tailscale-API-et' : 'eksempeldata (MOCK_DATA=1)';
    return { ok: true, message: `${via} svarte: ${on} av ${r.devices.length} enheter online.`, ms: Date.now() - t0, source: r.source, ...(r.source === 'demo' ? { mock: true } : {}) };
  } catch (e) { return { ok: false, message: e.message, ms: Date.now() - t0 }; }
}
