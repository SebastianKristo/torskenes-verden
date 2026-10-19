// Prompt 30: SMB-veiviser («Sett opp nettverksdisk»). Montert under /api/smb. Serveroppsett: bare admin.
//
// Tilgang (samme mønster som system-backup.js / system-update.js):
//   - Alle ruter er POST og krever admin: økt i nettleseren (med JSON-kropp) ELLER app-token med finance:write fra en admin.
//   - Passordet til NAS-en sendes med hvert kall fra klienten (holdes bare i minnet i veiviseren), går til smbclient via en
//     midlertidig auth-fil (0600, slettes etterpå) og sendes aldri ut igjen. Det lagres kryptert (setSecret) først ved /save.
//   - Bare servere på hjemmenettet: discover skanner bare private /24-nett, og et vertsnavn som slår opp til en offentlig
//     adresse avvises.
//   - Alt som havner i smbclients kommandospråk (-c) eller -D (share, mapper, nye mappenavn) valideres strengt (SMB_SEG):
//     ingen «..», anførselstegn, semikolon, skråstreker eller kontrolltegn. Ugyldig blir avvist, aldri escapet.
//
// Ruter:
//   POST /discover {}                         → [{host, ip, name?}]   SMB-servere (port 445) på LAN
//   POST /probe    {host}                      → {ok, host, ip?, message?}   svarer verten på port 445?
//   POST /shares   {host, user, password, domain?}             → {shares:[{name, comment}], protocol:'SMB3'|'SMB2'}
//   POST /browse   {host, share, path, user, password, domain?, protocol?} → [{name, type:'dir'}]
//   POST /mkdir    {…, path, name}             → {ok, path}
//   POST /test     {…, path}                   → {ok, writable, message, mbps?}
//   POST /save     {host, share, path, user, password, domain, protocol, use:['finans','system']}
//                  → {ok, share, path, label, use, finans:{…smbConfig}, system:{enabled, share, path}}
import { Hono } from 'hono';
import net from 'node:net';
import os from 'node:os';
import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { sessionUser, isAdmin, clientIp, isLan } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { saveSettings, setSecret } from './finans/db.js';
import { smbRun, smbCmdError, smbErrorText, smbConfig, parseSmbLs, localArg, SMB_SEG, SMB_HOST, normShare } from './finans/backup.js';
import { setSmbTarget, smbTarget } from './system-backup.js';
import { MOCK_NAS } from './smb-mock.js';

const MOCK = process.env.MOCK_DATA === '1';
const WORK = join(resolve(config.dataDir), 'backups');

/* ---------------- Validering ---------------- */

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const isPrivate4 = (ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !/^127\./.test(ip) && isLan(ip);
const OK_IP = (ip) => isLan(ip) || /^169\.254\./.test(ip);

/** Mappesti relativ til sharen: '' eller 'a/b/c'. Hvert ledd må passe SMB_SEG. */
export function cleanPath(p) {
  if (p === undefined || p === null || p === '' || p === '/') return '';
  if (typeof p !== 'string' || p.length > 600) throw bad('Ugyldig mappe');
  const segs = p.replace(/\\/g, '/').split('/').filter((x) => x !== '');
  if (segs.length > 24 || !segs.every((s) => SMB_SEG.test(s))) throw bad('Ugyldig mappenavn. Bruk bokstaver, tall, mellomrom og . _ - ( ) + , = @ # ~ !');
  return segs.join('/');
}
export function cleanName(n) {
  if (typeof n !== 'string' || !SMB_SEG.test(n)) throw bad('Ugyldig mappenavn. Bruk bokstaver, tall, mellomrom og . _ - ( ) + , = @ # ~ ! (ikke / \\ " \' ; eller ..)');
  return n;
}
export function cleanHost(h) {
  const v = String(h ?? '').trim().replace(/^(smb:)?[\\/]+/i, '').replace(/[\\/].*$/, '').toLowerCase();
  if (!v || !SMB_HOST.test(v)) throw bad('Skriv IP-adressen (for eksempel 192.168.1.20) eller navnet på serveren (for eksempel nas.local).');
  return v;
}
const textField = (v, max, label) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || v.length > max || /[\r\n\0]/.test(v)) throw bad(`Ugyldig ${label}`);
  return v;
};
/** Hele kroppen → {host, share?, path, user, password, domain, protocol} */
export function cleanTarget(b, { share = false } = {}) {
  const o = { host: cleanHost(b.host) };
  o.user = textField(b.user, 128, 'brukernavn').trim();
  o.password = textField(b.password, 256, 'passord');
  o.domain = textField(b.domain, 64, 'domene').trim();
  if (o.domain && !/^[\w.\-]+$/.test(o.domain)) throw bad('Ugyldig domene (arbeidsgruppe)');
  if (o.user && /["]/.test(o.user)) throw bad('Ugyldig brukernavn');
  o.protocol = b.protocol === 'SMB2' ? 'SMB2' : 'SMB3';
  if (share) {
    if (typeof b.share !== 'string' || !SMB_SEG.test(b.share)) throw bad('Ugyldig navn på delt mappe');
    o.share = b.share;
    o.path = cleanPath(b.path);
  }
  return o;
}

/* ---------------- Nettverk (byttes ut i tester) ---------------- */

const realProbe = (ip, port = 445, timeout = 300) => new Promise((res) => {
  const s = net.connect({ host: ip, port });
  const done = (v) => { s.destroy(); res(v); };
  s.setTimeout(timeout, () => done(false));
  s.once('connect', () => done(true));
  s.once('error', () => done(false));
});
let nmbOk = null;
const realNetbios = (ip, timeout = 1200) => new Promise((res) => {
  if (nmbOk === false) return res(null);
  execFile('nmblookup', ['-A', ip], { timeout }, (e, out) => {
    if (e?.code === 'ENOENT') { nmbOk = false; return res(null); }
    nmbOk = true;
    // «\tNAS             <00> -         B <ACTIVE>» (ikke <GROUP>)
    const m = String(out ?? '').split('\n').map((l) => l.match(/^\s+(\S+)\s+<(00|20)>\s+-\s+(?!<GROUP>)\S*\s*<ACTIVE>/)).find(Boolean);
    res(m ? m[1] : null);
  });
});
const realReverse = (ip) => dns.reverse(ip).then((n) => n[0] ?? null, () => null);
const realLookup = (host) => dns.lookup(host, { family: 4 }).then((r) => r.address);
let NET = { probe: realProbe, netbios: realNetbios, reverse: realReverse, lookup: realLookup, interfaces: () => os.networkInterfaces() };
/** Bare for tester. */
export const _setNet = (o) => { NET = o ? { ...NET, ...o } : { probe: realProbe, netbios: realNetbios, reverse: realReverse, lookup: realLookup, interfaces: () => os.networkInterfaces() }; };

const withTimeout = (p, ms, v = null) => Promise.race([p, new Promise((r) => setTimeout(() => r(v), ms).unref?.())]);
const SKIP_IF = /^(docker|br-|veth|virbr|lo$|cni|flannel|cali|vxlan|tun|tap|zt|tailscale|wg|podman|lxc|lxd)/;

/** /24-nettene som skal skannes (prefiks 'a.b.c'): klientens LAN-adresse først, så serverens egne grensesnitt. Bare private nett. */
export function scanNets(client) {
  const out = [];
  const add = (ip) => { const v = String(ip ?? '').replace(/^::ffff:/, ''); if (!isPrivate4(v)) return; const p = v.split('.').slice(0, 3).join('.'); if (!out.includes(p)) out.push(p); };
  add(client);
  for (const [name, list] of Object.entries(NET.interfaces() ?? {})) {
    if (SKIP_IF.test(name)) continue;
    for (const a of list ?? []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) add(a.address);
  }
  return out.slice(0, 4);
}

/** Finner SMB-servere: TCP 445 på hver vert, maks 64 samtidig, 300 ms per vert, ca. 6 s totalt. */
export async function discover(client, { budget = 6000 } = {}) {
  if (MOCK) { await new Promise((r) => setTimeout(r, process.env.NODE_ENV === 'test' ? 0 : 700)); return [{ ...MOCK_NAS }]; }
  const t0 = Date.now(), scanEnd = t0 + budget - 1500;
  const ips = scanNets(client).flatMap((p) => Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`));
  const found = [];
  let i = 0;
  const worker = async () => {
    while (i < ips.length && Date.now() < scanEnd) {
      const ip = ips[i++];
      if (await NET.probe(ip, 445, 300)) found.push(ip);
    }
  };
  await Promise.all(Array.from({ length: Math.min(64, ips.length) }, worker));
  const left = Math.max(300, t0 + budget - Date.now());
  const named = await Promise.all(found.slice(0, 40).map(async (ip) => {
    const [nb, rev] = await withTimeout(Promise.all([NET.netbios(ip).catch(() => null), NET.reverse(ip).catch(() => null)]), left, [null, null]);
    const r = { host: rev || ip, ip };
    if (nb || rev) r.name = nb || rev;
    return r;
  }));
  return named.sort((a, b) => a.ip.split('.').map(Number).reduce((x, y, k) => x || y - b.ip.split('.').map(Number)[k], 0));
}

/** Vertsnavnet må peke til hjemmenettet. Et navn som ikke slår opp (NetBIOS) får smbclient prøve selv. */
async function checkHost(host) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) { if (!OK_IP(host)) throw bad('Bare servere på hjemmenettet (private adresser som 192.168.x.x eller 10.x.x.x) er tillatt.'); return host; }
  if (MOCK && host === MOCK_NAS.host) return MOCK_NAS.ip;
  let ip = null;
  try { ip = await withTimeout(NET.lookup(host), 2500); } catch { ip = null; }
  if (ip && !OK_IP(ip)) throw bad(`«${host}» peker til en adresse på internett (${ip}). Bare servere på hjemmenettet er tillatt.`);
  return ip;
}

/* ---------------- smbclient ---------------- */

const conn = (t) => ({ user: t.user, password: t.password, domain: t.domain });
const fail = (e) => Object.assign(new Error(e.message), { status: e.status ?? 502, kind: e.kind });

/** Parser «smbclient -L //host -g». Skjuler IPC$, print$ og andre skjulte admin-shares (navn som slutter på $). */
export function parseShares(out) {
  const rows = [];
  for (const l of String(out ?? '').split('\n')) {
    const m = l.match(/^Disk\|([^|]+)\|(.*)$/);
    if (!m || m[1].endsWith('$')) continue;
    rows.push({ name: m[1], comment: m[2].trim() });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}
export const parseLs = parseSmbLs;
// Systemmapper på NAS-er (Synology/QNAP) som ikke er nyttige som backupmål.
const HIDE_DIR = /^(@|#recycle$|\.|\$RECYCLE\.BIN$|System Volume Information$|lost\+found$)/i;
export const foldersOf = (out) => parseLs(out).filter((r) => r.type === 'dir' && !HIDE_DIR.test(r.name) && SMB_SEG.test(r.name))
  .map(({ name }) => ({ name, type: 'dir' })).sort((a, b) => a.name.localeCompare(b.name, 'nb', { numeric: true }));

/** Lister shares: prøver SMB3 først, så SMB2. */
export async function listShares(t) {
  let last;
  for (const proto of ['SMB3', 'SMB2']) {
    try { return { shares: parseShares(await smbRun({ list: t.host, ...conn(t), proto, timeout: 20_000 })), protocol: proto }; }
    catch (e) { last = e; if (e.kind !== 'proto' && e.kind !== 'other') break; }
  }
  throw fail(last);
}
async function inShare(t, { dir = t.path, cmd, timeout = 30_000 }) {
  const out = await smbRun({ share: `//${t.host}/${t.share}`, ...conn(t), proto: t.protocol, dir: dir || undefined, cmd, timeout }).catch((e) => { throw fail(e); });
  const st = smbCmdError(out);
  if (st) { const e = smbErrorText(st); throw Object.assign(new Error(e.message), { status: 502, kind: e.kind }); }
  return out;
}
export const browse = async (t) => foldersOf(await inShare(t, { cmd: 'ls' }));
export async function mkdir(t, name) {
  await inShare(t, { cmd: `mkdir "${cleanName(name)}"` });
  return { ok: true, path: [t.path, name].filter(Boolean).join('/') };
}
export async function writeTest(t) {
  const SIZE = 1024 * 1024;
  const local = join(WORK, `.smbtest-${randomUUID()}`);
  const remote = `.homelab-skrivetest-${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(local, randomBytes(SIZE), { mode: 0o600 });
  const label = `//${t.host}/${t.share}${t.path ? '/' + t.path : ''}`;
  try {
    // Tilkobling og lesing først, så skriving (feil i put skal gi «kan ikke skrive», ikke «finner ikke serveren»).
    await inShare(t, { cmd: 'ls' });
    const t0 = Date.now();
    try { await inShare(t, { cmd: `put "${localArg(local)}" "${remote}"`, timeout: 60_000 }); }
    catch (e) {
      if (e.kind === 'access') return { ok: true, writable: false, message: `Koblet til ${label}, men brukeren har ikke skrivetilgang her. Gi brukeren skrivetilgang på NAS-en, eller velg en annen mappe.` };
      if (e.kind === 'full') return { ok: true, writable: false, message: e.message };
      throw e;
    }
    const sec = Math.max(0.05, (Date.now() - t0) / 1000);
    const mbps = Math.round((SIZE / 1e6 / sec) * 10) / 10;
    let left = '';
    try { await inShare(t, { cmd: `del "${remote}"` }); } catch { left = ` Testfila ${remote} ble liggende igjen – slett den gjerne.`; }
    return { ok: true, writable: true, mbps, message: `✓ Skrev og slettet en testfil i ${label} (ca. ${String(mbps).replace('.', ',')} MB/s).${left}` };
  } catch (e) { return { ok: false, writable: false, message: e.message }; }
  finally { rmSync(local, { force: true }); }
}

/** Lagrer: FinansHub-backupens SMB-innstillinger (alltid, de er felles påloggingen) og systembackupens SMB-mål. */
export async function saveTarget(t, use) {
  const share = `//${t.host}/${t.share}`;
  if (!normShare(share)) throw bad('Ugyldig share');
  await inShare(t, { cmd: 'ls' }); // sjekk at mappen finnes og pålogging virker før noe lagres
  const patch = { smbShare: share, smbDir: t.path, smbUser: t.user, smbDomain: t.domain || 'WORKGROUP', smbVersion: t.protocol === 'SMB2' ? '2.1' : '3.0' };
  if (use.includes('finans')) patch.smbOn = true;
  saveSettings(patch);
  setSecret('smbPass', t.password || '');
  if (use.includes('system')) setSmbTarget({ enabled: true, share, path: t.path });
  else if (smbTarget().enabled && smbTarget().share === share) setSmbTarget({ enabled: false });
  return { ok: true, share, path: t.path, label: `${share}${t.path ? '/' + t.path : ''}`, use, finans: smbConfig(), system: smbTarget() };
}

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', async (c, next) => {
  let user = sessionUser(c), session = !!user;
  if (!user && bearerOk(c, 'finance:write')) user = c.get('user');
  if (!user) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(user)) return c.json({ error: 'Bare administratorer kan sette opp nettverksdisk' }, 403);
  if (c.req.method !== 'POST') return c.json({ error: 'Bruk POST' }, 405);
  if (session && !/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'Forventet JSON' }, 415);
  c.set('user', user);
  await next();
});
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const run = (fn) => async (c) => {
  try { return c.json(await fn(await body(c), c)); }
  catch (e) { return c.json({ error: String(e.message ?? e).slice(0, 400), ...(e.kind ? { kind: e.kind } : {}) }, e.status ?? 500); }
};

api.post('/discover', run(async (_b, c) => discover(clientIp(c))));
api.post('/probe', run(async (b) => {
  const host = cleanHost(b.host);
  const ip = await checkHost(host);
  if (MOCK) return ['nas.local', 'nas', '192.168.1.20', '192.168.1.30', 'gammel-nas.local'].includes(host) ? { ok: true, host, ip: ip ?? host } : { ok: false, host, message: `Fant ikke ${host} på nettverket. Sjekk adressen, og at SMB er slått på på NAS-en.` };
  const ok = await NET.probe(ip ?? host, 445, 1500);
  return ok ? { ok: true, host, ip: ip ?? null } : { ok: false, host, ip: ip ?? null, message: `Fant ikke SMB på ${host} (port 445). Sjekk adressen, at NAS-en er på, og at SMB (fildeling for Windows) er slått på.` };
}));
api.post('/shares', run(async (b) => { const t = cleanTarget(b); await checkHost(t.host); return listShares(t); }));
api.post('/browse', run(async (b) => { const t = cleanTarget(b, { share: true }); await checkHost(t.host); return browse(t); }));
api.post('/mkdir', run(async (b) => { const t = cleanTarget(b, { share: true }); cleanName(b.name); await checkHost(t.host); return mkdir(t, b.name); }));
api.post('/test', run(async (b) => { const t = cleanTarget(b, { share: true }); await checkHost(t.host); return writeTest(t); }));
api.post('/save', run(async (b) => {
  const t = cleanTarget(b, { share: true });
  const use = Array.isArray(b.use) ? [...new Set(b.use)] : [];
  if (!use.length || !use.every((u) => u === 'finans' || u === 'system')) throw bad('Velg hva nettverksdisken skal brukes til: finans og/eller system');
  await checkHost(t.host);
  return saveTarget(t, use);
}));

export default api;
