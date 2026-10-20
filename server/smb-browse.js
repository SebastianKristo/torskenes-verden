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
//   POST /scan     {lanIp?, subnet?}           → prompt 34: {devices:[{host, ip, name?, model?, methods:['tcp445'|'mdns'|'netbios'|'known'], known?}],
//                                                nets:['192.168.1.0/24'], ms, methods:{mdns, netbios, known, tcp445}, docker, suggestions:[{ip, name, source}],
//                                                scanned, total, reason?, hint?}  (SSE med Accept: text/event-stream: progress/found/done)
//   POST /browse   {host, share | manual, path, user, password, domain?, protocol?, showHidden?} → [{name, type:'dir', locked?, code?, reason?, display?, hidden?, link?}]
//   POST /list     samme kropp → {path, share, folders:[…som over], filtered:[{name, attrs, why}], rawCount, protocol, hint?}
//                  share kan være skjult (backup$); manual:'/backup/homelab' = «Skriv sti manuelt»
//   POST /mkdir    {…, path, name}             → {ok, path, writable, url, message} (prompt 36: tester skrivetilgang med en gang)
//   (prompt 36) /list svarer også {host, url:'smb://host/share/a/b', breadcrumb:[{name, path, share}], parent, empty, files, target:{host, share, path}}
//   POST /test     {…, path}                   → {ok, writable, readBack?, message:'✓ Kan skrive · 38 MB/s …'|'✗ Ingen skrivetilgang: STATUS_ACCESS_DENIED …', mbps?, code?}
//   POST /save     {host, share, path, user, password, domain, protocol, use:['finans','system']}
//                  → {ok, share, path, label, use, finans:{…smbConfig}, system:{enabled, share, path}}
import { Hono } from 'hono';
import net from 'node:net';
import os from 'node:os';
import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { sessionUser, isAdmin, clientIp, isLan } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { saveSettings, setSecret, settings as fhSettings } from './finans/db.js';
import { smbRun, smbCmdError, smbErrorText, smbConfig, parseSmbLs, localArg, SMB_SEG, SMB_SHARE, SMB_HOST, normShare, smbNameError } from './finans/backup.js';
import { streamSSE } from 'hono/streaming';
import { setSmbTarget, smbTarget } from './system-backup.js';
import { MOCK_NAS } from './smb-mock.js';

const MOCK = process.env.MOCK_DATA === '1';
const WORK = join(resolve(config.dataDir), 'backups');

/* ---------------- Validering ---------------- */

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const isPrivate4 = (ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !/^127\./.test(ip) && isLan(ip);
const OK_IP = (ip) => isLan(ip) || /^169\.254\./.test(ip);

// Prompt 40: feil med type, så veiviseren viser riktig melding (ikke nettverkstips ved et ugyldig navn): {kind:'name', char?}.
const nameBad = (e) => Object.assign(new Error(e.message), { status: 400, kind: 'name', ...(e.char ? { char: e.char } : {}), ...(e.rule ? { rule: e.rule } : {}) });
/** Mappesti relativ til sharen: '' eller 'a/b/c'. Hvert ledd valideres etter SMB-reglene (smbNameError). Skråstrek = skille. */
export function cleanPath(p) {
  if (p === undefined || p === null || p === '' || p === '/') return '';
  if (typeof p !== 'string' || p.length > 1000) throw Object.assign(bad('Ugyldig mappe'), { kind: 'name' });
  const segs = p.replace(/\\/g, '/').split('/').filter((x) => x !== '');
  if (segs.length > 24) throw Object.assign(bad('Ugyldig mappe (for mange nivåer)'), { kind: 'name' });
  for (const seg of segs) { const e = smbNameError(seg); if (e) throw nameBad(e); }
  return segs.join('/');
}
export function cleanName(n) {
  const e = smbNameError(typeof n === 'string' ? n : '');
  if (e || typeof n !== 'string') throw nameBad(e ?? { message: 'Mappenavnet kan ikke være tomt' });
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
  o.password = textField(b.password ?? b.pass, 256, 'passord'); // prompt 40: pass = password
  o.domain = textField(b.domain, 64, 'domene').trim();
  if (o.domain && !/^[\w.\-]+$/.test(o.domain)) throw bad('Ugyldig domene (arbeidsgruppe)');
  if (o.user && /["]/.test(o.user)) throw bad('Ugyldig brukernavn');
  o.protocol = b.protocol === 'SMB2' ? 'SMB2' : 'SMB3';
  if (share) {
    // Prompt 34: «Skriv sti manuelt» – manual:'/backup/homelab' eller '//nas/backup$/homelab' (første ledd = share, også skjulte backup$).
    if ((b.share === undefined || b.share === '') && typeof b.manual === 'string') {
      const segs = b.manual.trim().replace(/\\/g, '/').replace(/^smb:/i, '').replace(/^\/\/[^/]+/, '').split('/').filter(Boolean);
      if (!segs.length) throw bad('Skriv stien som /share/mappe, for eksempel /backup/homelab');
      b = { ...b, share: segs[0], path: segs.slice(1).join('/') };
    }
    if (typeof b.share !== 'string' || !SMB_SHARE.test(b.share)) throw bad('Ugyldig navn på delt mappe');
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

// Prompt 34: i Docker (bridge) ser serveren bare 172.17.x.x, og klienten kommer ofte via tunnel/offentlig IP. Da fant skanningen
// ingenting. Nå prøves i rekkefølge: klientens LAN-adresse (fra kroppen: lanIp/subnet, eller forespørselen), LAN_SUBNET (env,
// komma-separert: «192.168.1.0/24,10.0.0»), kjente Homelab-adresser (tjenestene i Nettverk, SMB-sharen, Ollama), serverens egne
// grensesnitt, og til slutt vanlige hjemmenett (192.168.0/1/50/86/10/100/178, 10.0.0/1, 172.16.0). Bare private nett.
export const COMMON_NETS = ['192.168.1', '192.168.0', '192.168.50', '192.168.86', '192.168.10', '192.168.100', '192.168.178', '10.0.0', '10.0.1', '172.16.0'];
const netOf = (ip) => { const v = String(ip ?? '').trim().replace(/^::ffff:/, '').replace(/\/\d+$/, ''); const m = v.match(/^(\d+\.\d+\.\d+)(?:\.\d+)?$/); return m && isPrivate4(`${m[1]}.1`) ? m[1] : null; };
const hostOfUrl = (u) => { try { return new URL(String(u)).hostname; } catch { return null; } };
const inDocker = () => { try { return existsSync('/.dockerenv') || /docker|containerd|kubepods/.test(readFileSync('/proc/1/cgroup', 'utf8')); } catch { return false; } };
/** Kjente adresser fra Homelab (tjenester i Nettverk, SMB-sharen, Ollama). → [{ip, name, source}] (bare private IPv4) */
export function knownHosts() {
  const out = [];
  const add = (ip, name, source) => { if (isPrivate4(ip) && !out.some((x) => x.ip === ip)) out.push({ ip, name, source }); };
  try { for (const [name, url] of config.services ?? []) add(hostOfUrl(url), name, 'nettverk'); } catch { /* */ }
  try { const st = fhSettings(); const m = String(st.smbShare ?? '').match(/^\/\/([^/]+)/); if (m) add(m[1], 'Nettverksdisk', 'backup'); add(hostOfUrl(st.ollamaUrl), 'Ollama', 'ai'); } catch { /* */ }
  for (const ip of String(process.env.SMB_HOSTS ?? '').split(',').map((x) => x.trim()).filter(Boolean)) add(ip, ip, 'env');
  return out;
}
/** /24-nettene som skal skannes (prefiks 'a.b.c'), i prioritert rekkefølge. hints: {lanIp?, subnet?} fra klienten. */
export function scanNets(client, hints = {}, { max = 8, common = false, known = false } = {}) {
  const out = [];
  const add = (ip) => { const p = netOf(ip); if (p && !out.includes(p)) out.push(p); };
  add(hints.lanIp); add(hints.subnet);
  add(client);
  for (const x of String(process.env.LAN_SUBNET ?? '').split(',')) add(x);
  if (known) for (const h of knownHosts()) add(h.ip);
  const docker = [];
  for (const [name, list] of Object.entries(NET.interfaces() ?? {})) {
    if (SKIP_IF.test(name)) continue;
    for (const a of list ?? []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) { if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address) && inDocker()) docker.push(a.address); else add(a.address); }
  }
  if (common) for (const n of COMMON_NETS) add(`${n}.1`);
  for (const d of docker) add(d); // Docker-bridge sist: der er det sjelden en NAS
  return out.slice(0, max);
}

// mDNS (Avahi) og NetBIOS-kringkasting når verktøyene finnes (virker bare med host-nettverk / Avahi-socket i containeren).
const execOut = (cmd, args, timeout) => new Promise((res) => execFile(cmd, args, { timeout }, (e, out) => res(e?.code === 'ENOENT' ? null : String(out ?? ''))));
export function parseAvahi(out) {
  const r = [];
  for (const l of String(out ?? '').split('\n')) {
    const f = l.split(';');
    if (f[0] !== '=' || f[2] !== 'IPv4' || !isPrivate4(f[7])) continue;
    if (!r.some((x) => x.ip === f[7])) r.push({ ip: f[7], host: f[6] || f[7], name: f[3]?.replace(/\\032/g, ' ') || f[6], method: 'mdns', ...(/model=([^"]+)/.exec(f[9] ?? '') ? { model: /model=([^"]+)/.exec(f[9])[1] } : {}) });
  }
  return r;
}
export function parseNmbBroadcast(out) {
  const r = [];
  for (const l of String(out ?? '').split('\n')) { const m = l.match(/^(\d+\.\d+\.\d+\.\d+)\s+(\S+)<00>/); if (m && isPrivate4(m[1]) && !r.some((x) => x.ip === m[1])) r.push({ ip: m[1], name: m[2], method: 'netbios' }); }
  return r;
}
let EXTRA = {
  mdns: async () => parseAvahi(await execOut('avahi-browse', ['-rpt', '_smb._tcp'], 4000)),
  netbios: async () => parseNmbBroadcast(await execOut('nmblookup', ['-S', '*'], 4000)),
};
/** Bare for tester. */
export const _setDiscoverExtra = (o) => { EXTRA = o ?? { mdns: async () => [], netbios: async () => [] }; };

/**
 * Finner SMB-servere. Alle metodene parallelt (mDNS, NetBIOS, kjente adresser, TCP 445 på /24-nettene), slått sammen på IP.
 * onEvent({type:'progress', net, pct, scanned, total} | {type:'found', device}) for fremdrift.
 * → {devices:[{host, ip, name?, model?, methods:[...], known?}], nets:['192.168.1.0/24'], ms, methods:{mdns, netbios, known, tcp445},
 *    docker, reason?, hint?, suggestions:[{ip, name, source}]}
 */
export async function scan(client, { hints = {}, budget = 8000, onEvent = () => {}, common = true, useKnown = true, extras = true, skip = [] } = {}) {
  const t0 = Date.now();
  const nets = scanNets(client, hints, { common, known: useKnown }).filter((n) => !skip.includes(n));
  const known = useKnown ? knownHosts() : [];
  if (MOCK) {
    await new Promise((r) => setTimeout(r, process.env.NODE_ENV === 'test' ? 0 : 700));
    const d = { ...MOCK_NAS, methods: ['tcp445', 'mdns'], model: 'TrueNAS (demo)' };
    onEvent({ type: 'progress', net: `${nets[0] ?? '192.168.1'}.0/24`, pct: 100, scanned: 254, total: 254 }); onEvent({ type: 'found', device: d });
    return { devices: [d], nets: nets.map((n) => `${n}.0/24`), ms: Date.now() - t0, methods: { mdns: 1, netbios: 0, known: 0, tcp445: 1 }, docker: false, suggestions: known };
  }
  const found = new Map();
  const put = (x, method) => {
    const cur = found.get(x.ip) ?? { host: x.host || x.ip, ip: x.ip, methods: [] };
    if (!cur.methods.includes(method)) cur.methods.push(method);
    if (x.name && !cur.name) cur.name = x.name;
    if (x.model && !cur.model) cur.model = x.model;
    if (x.host && cur.host === cur.ip && x.host !== x.ip) cur.host = x.host;
    if (x.known) cur.known = x.known;
    const isNew = !found.has(x.ip);
    found.set(x.ip, cur);
    if (isNew) onEvent({ type: 'found', device: cur });
  };
  const counts = { mdns: 0, netbios: 0, known: 0, tcp445: 0 };
  const extra = !extras ? Promise.resolve() : Promise.all([
    withTimeout(EXTRA.mdns().catch(() => []), 4500, []).then((l) => { for (const x of l ?? []) { put(x, 'mdns'); counts.mdns++; } }),
    withTimeout(EXTRA.netbios().catch(() => []), 4500, []).then((l) => { for (const x of l ?? []) { put(x, 'netbios'); counts.netbios++; } }),
    Promise.all(known.map(async (k) => { if (await NET.probe(k.ip, 445, 600)) { put({ ip: k.ip, name: k.name, known: k.source }, 'known'); counts.known++; } })),
  ]);
  const scanEnd = t0 + budget - 1500;
  const ips = nets.flatMap((p) => Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`));
  let i = 0, done = 0, lastPct = -1;
  const worker = async () => {
    while (i < ips.length && Date.now() < scanEnd) {
      const ip = ips[i++];
      if (await NET.probe(ip, 445, 300)) { put({ ip }, 'tcp445'); counts.tcp445++; }
      done++;
      const pct = Math.round((done / ips.length) * 100);
      if (pct !== lastPct && (pct % 5 === 0 || done === ips.length)) { lastPct = pct; onEvent({ type: 'progress', net: `${ip.split('.').slice(0, 3).join('.')}.0/24`, pct, scanned: done, total: ips.length }); }
    }
  };
  await Promise.all([...Array.from({ length: Math.min(64, ips.length) }, worker), extra]);
  const left = Math.max(300, t0 + budget - Date.now());
  const devices = await Promise.all([...found.values()].slice(0, 40).map(async (d) => {
    if (d.name && d.host !== d.ip) return d;
    const [nb, rev] = await withTimeout(Promise.all([d.name ? null : NET.netbios(d.ip).catch(() => null), d.host !== d.ip ? null : NET.reverse(d.ip).catch(() => null)]), left, [null, null]);
    if (rev) d.host = rev;
    if (!d.name && (nb || rev)) d.name = nb || rev;
    return d;
  }));
  devices.sort((a, b) => (b.known ? 1 : 0) - (a.known ? 1 : 0) || a.ip.split('.').map(Number).reduce((x, y, k) => x || y - b.ip.split('.').map(Number)[k], 0));
  const docker = inDocker();
  const out = { devices, nets: nets.map((n) => `${n}.0/24`), ms: Date.now() - t0, methods: counts, docker, suggestions: known, scanned: done, total: ips.length };
  if (!devices.length) {
    out.reason = done < ips.length ? `Rakk bare å skanne ${done} av ${ips.length} adresser i ${out.nets.join(', ')}.` : `Ingen svarte på SMB (port 445) i ${out.nets.join(', ')}.`;
    out.hint = `Fant ingen. Sjekk at NAS-en er på samme nett${docker ? ' (Homelab kjører i Docker, så sett LAN_SUBNET=192.168.1.0/24 eller bruk network_mode: host for oppdagelse)' : ''}, eller legg til manuelt: smb://${known[0]?.ip ?? '192.168.1.20'}`;
  }
  console.info(`[smb] skann nett=${out.nets.join(',')} metoder=mdns:${counts.mdns},netbios:${counts.netbios},kjente:${counts.known},445:${counts.tcp445} funn=${devices.length} ms=${out.ms}${docker ? ' docker' : ''}`);
  return out;
}

/**
 * Eldre form (prompt 30): bare listen [{host, ip, name?}]. Først klientens og serverens egne nett; finnes ingenting og det er tid
 * igjen, prøves kjente Homelab-adresser, mDNS/NetBIOS og de vanlige hjemmenettene (prompt 34).
 */
export async function discover(client, { budget = 6000, hints = {} } = {}) {
  const t0 = Date.now();
  const first = scanNets(client, hints, { common: false, known: false });
  let r = await scan(client, { budget, hints, common: false, useKnown: false, extras: false });
  const left = budget - (Date.now() - t0);
  if (!r.devices.length && left > 2000) r = await scan(client, { budget: left, hints, skip: first });
  return r.devices.map(({ host, ip, name }) => ({ host, ip, ...(name ? { name } : {}) }));
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
// Prompt 34: bare de eksakte systemnavnene filtreres (før: alt som startet med @ eller ., f.eks. «@backup»). Navn som «backup»,
// «Backups» og «Time Machine» vises alltid. Mapper som starter med «.» vises med «Vis skjulte».
export const SYSTEM_DIRS = ['@eaDir', '@tmp', '@sharebin', '@Recycle', '@Recently-Snapshot', '@SynoResource', '@SynoEAStream', '#recycle', '#snapshot', '$RECYCLE.BIN', 'System Volume Information', 'lost+found', '.TemporaryItems', '.Trashes', '.Spotlight-V100', '.fseventsd'];
const SYS = new Set(SYSTEM_DIRS.map((x) => x.toLowerCase()));
/**
 * Mappene i en ls-utskrift, med årsak for alt som ble filtrert bort.
 * → {folders:[{name, display?, type:'dir', hidden?, link?, unsupported?, reason?}], filtered:[{name, attrs, why}], raw:[{name, attrs, type}]}
 */
export function foldersDetail(out, { showHidden = false } = {}) {
  const raw = parseLs(out), folders = [], filtered = [];
  for (const r of raw) {
    if (r.type !== 'dir') continue;
    const nfc = r.name.normalize('NFC');
    if (SYS.has(nfc.toLowerCase())) { filtered.push({ name: r.name, attrs: r.attrs, why: 'systemmappe' }); continue; }
    const hidden = nfc.startsWith('.') || /H/.test(r.attrs ?? '');
    if (hidden && !showHidden) { filtered.push({ name: r.name, attrs: r.attrs, why: 'skjult (Vis skjulte)' }); continue; }
    const f = { name: r.name, type: 'dir' };
    if (nfc !== r.name) f.display = nfc;
    if (hidden) f.hidden = true;
    if (r.link) f.link = true;
    if (!SMB_SEG.test(r.name)) { f.unsupported = true; f.reason = smbNameError(r.name)?.message ?? 'Navnet har tegn Homelab ikke kan bruke i SMB-kommandoer. Gi mappen et nytt navn på NAS-en.'; }
    folders.push(f);
  }
  folders.sort((x, y) => (x.display ?? x.name).localeCompare(y.display ?? y.name, 'nb', { numeric: true }));
  return { folders, filtered, raw: raw.map((r) => ({ name: r.name, attrs: r.attrs, type: r.type })) };
}
// Prompt 30-formen: plain mapper er {name, type:'dir'}; skjulte systemmapper filtreres. «.»-mapper skjules (Vis skjulte i /list).
export const foldersOf = (out, o = {}) => foldersDetail(out, o).folders;

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
/**
 * Mappene i t.path med tilgangssjekk: ett ekstra smbclient-kall (ls "mappe/*" per mappe, maks 40) markerer mapper uten
 * List folder/Read-rett med locked:true og reason. Rå liste og filtrerte navn logges (feilsøking: kom «backup» fra serveren?).
 * → {folders, filtered, rawCount, path, protocol}
 */
export async function list(t, { showHidden = false, checkAccess = true } = {}) {
  const out = await inShare(t, { cmd: 'ls' });
  const d = foldersDetail(out, { showHidden });
  const where = `//${t.host}/${t.share}${t.path ? '/' + t.path : ''}`;
  console.info(`[smb] ls ${where} dialekt≥${t.protocol} rå=${JSON.stringify(d.raw.map((r) => `${r.name}${r.attrs ? ` [${r.attrs}]` : ''}`))} filtrert=${JSON.stringify(d.filtered.map((f) => `${f.name}: ${f.why}`))}`);
  const check = d.folders.filter((f) => !f.unsupported).slice(0, 40);
  if (checkAccess && check.length) {
    try {
      const res = await smbRun({ share: `//${t.host}/${t.share}`, ...conn(t), proto: t.protocol, dir: t.path || undefined, cmd: [...check.map((f) => `ls "${f.name}/*"`), 'pwd'].join('; '), timeout: 30_000 });
      for (const m of String(res).matchAll(/NT_STATUS_([A-Z_]+) listing \\?(?:.*\\)?([^\\\n]+)\\\*/g)) {
        const f = check.find((x) => x.name === m[2] || x.name.normalize('NFC') === m[2].normalize('NFC'));
        if (!f) continue;
        if (/ACCESS_DENIED|NETWORK_ACCESS_DENIED/.test(m[1])) { f.locked = true; f.code = `STATUS_${m[1]}`; f.reason = `Ingen tilgang for ${t.user || 'gjest'}. Gi brukeren ${t.user || 'gjest'} lese- og skrivetilgang til mappen i NAS-ens innstillinger.`; }
        else if (/NOT_A_DIRECTORY|OBJECT_PATH_NOT_FOUND|OBJECT_NAME_NOT_FOUND/.test(m[1]) && f.link) { f.broken = true; f.reason = 'Snarvei (junction/symlink) som ikke peker til en mappe'; }
      }
    } catch (e) { console.warn(`[smb] tilgangssjekk i ${where} feilet: ${e.message}`); }
  }
  // Prompt 36: navigering i undermapper – url, brødsmulesti, forelder og «Tom mappe».
  const files = parseLs(out).filter((r) => r.type !== 'dir').length;
  return { path: t.path, share: t.share, host: t.host, url: smbUrl(t.host, t.share, t.path), breadcrumb: crumbsOf(t.host, t.share, t.path),
    parent: t.path ? t.path.split('/').slice(0, -1).join('/') : null, empty: !d.folders.length && !files, files,
    target: { host: t.host, share: t.share, path: t.path ? '/' + t.path : '' },
    folders: d.folders, filtered: d.filtered, rawCount: d.raw.length, protocol: t.protocol };
}
// Prompt 30-formen (array). Mapper uten tilgang er med (locked:true) i stedet for å forsvinne.
export const browse = async (t, o = {}) => (await list(t, o)).folders;
/** Prompt 36: lager mappen der man står og tester skrivetilgang i den med en gang. → {ok, path, writable, url, message?, code?} */
export async function mkdir(t, name, { test = true } = {}) {
  await inShare(t, { cmd: `mkdir "${cleanName(name)}"` });
  const path = [t.path, name].filter(Boolean).join('/');
  const out = { ok: true, path, url: smbUrl(t.host, t.share, path) };
  if (!test) return out;
  const w = await writeTest({ ...t, path }).catch((e) => ({ writable: false, message: e.message }));
  return { ...out, writable: !!w.writable, message: w.message, ...(w.code ? { code: w.code } : {}), ...(w.mbps ? { mbps: w.mbps } : {}) };
}
/** smb://host/share/a/b */
export const smbUrl = (host, share, path = '') => `smb://${host}/${share}${path ? '/' + path : ''}`;
/** Brødsmulesti: [{name:'truenas.local', path:null}, {name:'backup', path:''}, {name:'homelab', path:'homelab'}] */
export const crumbsOf = (host, share, path = '') => [{ name: host, path: null, share: null }, { name: share, path: '', share },
  ...String(path || '').split('/').filter(Boolean).map((seg, i, a) => ({ name: seg, path: a.slice(0, i + 1).join('/'), share }))];
const statusOf = (e) => { const m = String(e?.raw ?? e?.message ?? '').match(/NT_STATUS_([A-Z_]+)/); return m ? `STATUS_${m[1]}` : null; };
/**
 * Test skrivetilgang (prompt 34): skriver .homelab-test-{uuid} (1 MiB), leser den tilbake og sammenligner, sletter den.
 * → {ok, writable, readBack, message:'✓ Kan skrive · 38 MB/s …' | '✗ Ingen skrivetilgang: STATUS_ACCESS_DENIED …', mbps?, code?}
 */
export async function writeTest(t) {
  const SIZE = 1024 * 1024;
  const local = join(WORK, `.smbtest-${randomUUID()}`), back = `${local}.back`;
  const remote = `.homelab-test-${randomUUID()}`;
  const data = randomBytes(SIZE);
  writeFileSync(local, data, { mode: 0o600 });
  const label = `//${t.host}/${t.share}${t.path ? '/' + t.path : ''}`;
  try {
    // Tilkobling og lesing først, så skriving (feil i put skal gi «kan ikke skrive», ikke «finner ikke serveren»).
    await inShare(t, { cmd: 'ls' });
    const t0 = Date.now();
    try { await inShare(t, { cmd: `put "${localArg(local)}" "${remote}"`, timeout: 60_000 }); }
    catch (e) {
      const code = statusOf(e) ?? (e.kind === 'access' ? 'STATUS_ACCESS_DENIED' : null);
      if (e.kind === 'access') return { ok: true, writable: false, code, kind: 'access', message: `✗ Ingen skrivetilgang: ${code} · Brukeren ${t.user || 'gjest'} har ikke skrivetilgang til mappen${t.path ? ` «${t.path.split('/').at(-1)}»` : ''} i ${t.share}. Gi brukeren ${t.user || 'gjest'} lese- og skrivetilgang til mappen i NAS-ens innstillinger, eller velg en annen mappe.` };
      if (e.kind === 'full') return { ok: true, writable: false, code, message: `✗ ${e.message}${code ? ` (${code})` : ''}` };
      throw e;
    }
    const sec = Math.max(0.05, (Date.now() - t0) / 1000);
    const mbps = Math.round((SIZE / 1e6 / sec) * 10) / 10;
    let readBack = null;
    try { await inShare(t, { cmd: `get "${remote}" "${localArg(back)}"` }); readBack = readFileSync(back).equals(data); } catch { readBack = null; }
    let left = '';
    try { await inShare(t, { cmd: `del "${remote}"` }); } catch { left = ` Testfila ${remote} ble liggende igjen – slett den gjerne.`; }
    return { ok: true, writable: true, readBack, mbps, message: `✓ Kan skrive · ${String(mbps).replace('.', ',')} MB/s. Skrev og slettet en testfil i ${label}${readBack ? ' (lest tilbake og kontrollert)' : ''}.${readBack === false ? ' Obs: fila som ble lest tilbake var ikke lik.' : ''}${left}` };
  } catch (e) { const code = statusOf(e); const k = kind40(e, t); return { ok: false, writable: false, code, ...k, message: `✗ ${e.message}${code ? ` (${code})` : ''}` }; }
  finally { rmSync(local, { force: true }); rmSync(back, { force: true }); }
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
  return { ok: true, share, path: t.path, label: `${share}${t.path ? '/' + t.path : ''}`, url: smbUrl(t.host, t.share, t.path), target: { host: t.host, share: t.share, path: t.path ? '/' + t.path : '' }, use, finans: smbConfig(), system: smbTarget() };
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
/**
 * Prompt 40: feiltype for veiviseren {error, kind:'name'|'notfound'|'access'|'connect'|'auth'|…, char?, detail?, canCreate?}.
 * host/proto → connect (nettverkstipsene), share → notfound. «Fant ikke mappen «[05] Backup» i Skogen» når stien ikke finnes.
 */
export function kind40(e, t = {}) {
  const k = e?.kind ?? null;
  const map = { host: 'connect', proto: 'connect', share: 'notfound' };
  const kind = map[k] ?? k;
  const out = { ...(kind ? { kind } : {}), ...(map[k] ? { detail: k } : {}), ...(e?.char ? { char: e.char } : {}), ...(e?.rule ? { rule: e.rule } : {}) };
  const last = String(t.path ?? '').split('/').filter(Boolean).at(-1);
  if (k === 'notfound' && last) Object.assign(out, { error: `Fant ikke mappen «${last}» i ${t.share}`, canCreate: true, create: { share: t.share, path: t.path.split('/').slice(0, -1).join('/'), name: last } });
  if (k === 'share' && t.share) Object.assign(out, { error: `Fant ikke den delte mappen «${t.share}» på ${t.host}` });
  if (k === 'access') Object.assign(out, { error: `Brukeren ${t.user || 'gjest'} har ikke ${t.path !== undefined ? 'skrivetilgang til mappen' : 'tilgang'}${last ? ` «${last}»` : ''}` });
  return out;
}
const run = (fn) => async (c) => {
  const b = await body(c);
  try { return c.json(await fn(b, c)); }
  catch (e) {
    let t = {}; try { t = { host: b.host, share: b.share, path: typeof b.path === 'string' ? cleanPath(b.path) : '', user: b.user }; } catch { /* */ }
    const k = kind40(e, t);
    return c.json({ error: String(k.error ?? e.message ?? e).slice(0, 400), ...k, ...(k.error ? { message: String(e.message ?? '').slice(0, 300) } : {}) }, e.status ?? 500);
  }
};

const hintsOf = (b) => ({ lanIp: typeof b.lanIp === 'string' ? b.lanIp.slice(0, 45) : null, subnet: typeof b.subnet === 'string' ? b.subnet.slice(0, 45) : null });
api.post('/discover', run(async (b, c) => discover(clientIp(c), { hints: hintsOf(b) })));
// Prompt 34: POST /scan {lanIp?, subnet?} – med Accept: text/event-stream: SSE «progress» {net, pct, scanned, total}, «found» {device}
// og «done» (samme som JSON-svaret). JSON: {devices, nets, ms, methods, docker, suggestions, reason?, hint?}.
api.post('/scan', async (c) => {
  const b = await body(c);
  if (!/text\/event-stream/.test(c.req.header('accept') ?? '')) {
    try { return c.json(await scan(clientIp(c), { hints: hintsOf(b) })); } catch (e) { return c.json({ error: String(e.message ?? e).slice(0, 300) }, 500); }
  }
  return streamSSE(c, async (st) => {
    const r = await scan(clientIp(c), { hints: hintsOf(b), onEvent: (e) => { st.writeSSE({ event: e.type, data: JSON.stringify(e.type === 'found' ? e.device : e) }).catch(() => {}); } });
    await st.writeSSE({ event: 'done', data: JSON.stringify(r) });
  });
});
api.post('/probe', run(async (b) => {
  const host = cleanHost(b.host);
  const ip = await checkHost(host);
  if (MOCK) return ['nas.local', 'nas', '192.168.1.20', '192.168.1.30', 'gammel-nas.local', 'truenas.local', '192.168.1.40'].includes(host) ? { ok: true, host, ip: ip ?? host } : { ok: false, host, message: `Fant ikke ${host} på nettverket. Sjekk adressen, og at SMB er slått på på NAS-en.` };
  const ok = await NET.probe(ip ?? host, 445, 1500);
  return ok ? { ok: true, host, ip: ip ?? null } : { ok: false, host, ip: ip ?? null, message: `Fant ikke SMB på ${host} (port 445). Sjekk adressen, at NAS-en er på, og at SMB (fildeling for Windows) er slått på.` };
}));
// Prompt 40: {host, user, pass} (pass = password) → {shares:[{name, comment}], protocol} (NetShareEnum via smbclient -L).
api.post('/shares', run(async (b) => { const t = cleanTarget(b); await checkHost(t.host); return listShares(t); }));
api.post('/browse', run(async (b) => { const t = cleanTarget(b, { share: true }); await checkHost(t.host); return browse(t, { showHidden: b.showHidden === true }); }));
// Prompt 34: POST /list {…, share | manual, path, showHidden?} → {path, share, folders:[{name, display?, type:'dir', locked?, code?, reason?, hidden?, link?, unsupported?}],
//   filtered:[{name, attrs, why}], rawCount, protocol, hint?}
api.post('/list', run(async (b) => {
  const t = cleanTarget(b, { share: true });
  await checkHost(t.host);
  const r = await list(t, { showHidden: b.showHidden === true });
  if (r.folders.some((f) => f.locked)) r.hint = `Mapper med lås er synlige, men ${t.user || 'gjest'} har ikke tilgang. Gi brukeren lese- og skrivetilgang til mappen i NAS-ens innstillinger (Synology DSM: Kontrollpanel → Delt mappe → Rediger → Tillatelser; TrueNAS: Datasets → Edit Permissions).`;
  else if (r.empty) r.hint = 'Tom mappe. Lag en undermappe med «+ Ny mappe», eller trykk «Bruk denne mappen».';
  else if (!r.folders.length) r.hint = 'Ingen mapper her. Ser du ikke mappen du venter? Den kan være skjult for brukeren (Access-Based Enumeration) eller være en egen share. Skriv stien manuelt, for eksempel /backup/homelab, og test den.';
  return r;
}));
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
