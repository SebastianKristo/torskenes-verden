// Prompt 34 (SERVER34): nettverksdisk – «backup»-mappen vises ikke i sharen, skann finner ingenting (Docker/tunnel),
// skjulte shares, manuell sti, tilgang med lås, skrivetest med ekte feilkode og opplasting via .part + rename.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-smb34-'));
process.env.BACKUP_DIR = join(process.env.DATA_DIR, 'sb');
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-34b';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.OLLAMA_URL;
delete process.env.LAN_SUBNET;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const fb = await import('../server/finans/backup.js');
const sbr = await import('../server/smb-browse.js');
const mock = await import('../server/smb-mock.js');
const calls = [];
fb._setSmbExec(async (args, o) => { calls.push(args); return mock.mockSmbExec(args, o); });
sbr._setNet({ lookup: async () => { throw new Error('ENOTFOUND'); } });
sbr._setDiscoverExtra({ mdns: async () => [], netbios: async () => [] });

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return r.headers.get('set-cookie').split(';')[0];
}
const A = (() => { let ck; return async (path, method = 'GET', body, extra = {}) => {
  ck ??= await login('sebastian', 'testpassord1');
  const r = await app.request(path, { method, headers: { cookie: ck, 'content-type': 'application/json', ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch { /* */ } return { status: r.status, body: json, text: t };
}; })();
const TN = { host: 'truenas.local', user: 'sebastian', password: 'pw', share: 'arkiv' };

test('ls-parser: små attributter (Dr = junction/ZFS-datasett), datoer med ekstra mellomrom, NFD-navn og spesialtegn', () => {
  const out = [
    '  backup                             Dr        0  Sun Oct  4 10:00:00 2026',
    '  Backup NAS                          D        0  Mon Oct 19 20:11:12 2026',
    `  ${'Backup på NAS'.normalize('NFD')}                       D        0  Thu Jan  1 00:00:00 2026`,
    '  Junction                            r        0  Thu Jan  1 00:00:00 2026',
    '  arkiv.zip                          An     1234  Thu  Jan  1  00:00:00  2026',
    '  @eaDir                              D        0  Thu Jan  1 00:00:00 2026'].join('\n');
  const rows = fb.parseSmbLs(out);
  assert.deepEqual(rows.map((r) => [r.name.normalize('NFC'), r.type]), [['backup', 'dir'], ['Backup NAS', 'dir'], ['Backup på NAS', 'dir'], ['Junction', 'dir'], ['arkiv.zip', 'file'], ['@eaDir', 'dir']]);
  const d = sbr.foldersDetail(out);
  assert.deepEqual(d.folders.map((f) => f.display ?? f.name), ['backup', 'Backup NAS', 'Backup på NAS', 'Junction']);
  assert.equal(d.folders.find((f) => f.name === 'Junction').link, true);
  assert.deepEqual(d.filtered, [{ name: '@eaDir', attrs: 'D', why: 'systemmappe' }]);
  assert.ok(fb.SMB_SEG.test('Backup på NAS'.normalize('NFD')), 'NFD avvises ikke');
  assert.ok(fb.SMB_SHARE.test('backup$') && !fb.SMB_SEG.test('backup$'));
});

test('mappelisting: «backup» (Dr) vises, «Privat» med lås og årsak, systemmapper filtrert, skjulte med Vis skjulte, rå liste logges', async () => {
  const r = await A('/api/smb/list', 'POST', { ...TN, path: '' });
  assert.equal(r.status, 200, r.text);
  const names = r.body.folders.map((f) => f.display ?? f.name);
  assert.deepEqual(names, ['backup', 'Backup på NAS', 'Dokumenter', 'Privat']);
  const p = r.body.folders.find((f) => f.name === 'Privat');
  assert.equal(p.locked, true);
  assert.equal(p.code, 'STATUS_ACCESS_DENIED');
  assert.match(p.reason, /Ingen tilgang for sebastian/);
  assert.match(r.body.hint, /lese- og skrivetilgang/);
  assert.deepEqual(r.body.filtered.map((f) => f.name).sort(), ['#recycle', '.skjult', '@eaDir'].sort());
  assert.ok(calls.at(-1).includes('-c') && /ls "backup\/\*"; .*pwd$/.test(calls.at(-1)[calls.at(-1).indexOf('-c') + 1]), 'én tilgangssjekk for alle mappene');
  const h = await A('/api/smb/list', 'POST', { ...TN, path: '', showHidden: true });
  assert.ok(h.body.folders.some((f) => f.name === '.skjult' && f.hidden));
  // Eldre /browse (array) har også mappene med lås.
  const b = await A('/api/smb/browse', 'POST', { ...TN, path: '' });
  assert.ok(b.body.some((f) => f.name === 'Privat' && f.locked));
  // Inn i «backup» (junction) virker.
  assert.deepEqual((await A('/api/smb/browse', 'POST', { ...TN, path: 'backup' })).body.map((f) => f.name), ['homelab']);
});

test('skjult share (backup$) og «Skriv sti manuelt»; skrivetest med ekte feilkode', async () => {
  const shares = await A('/api/smb/shares', 'POST', { host: 'truenas.local', user: 'sebastian', password: 'pw' });
  assert.ok(!shares.body.shares.some((s) => s.name === 'backup$'), 'skjulte shares listes ikke');
  const m = await A('/api/smb/list', 'POST', { host: 'truenas.local', user: 'sebastian', password: 'pw', manual: '/backup$/homelab' });
  assert.equal(m.status, 200, m.text);
  assert.equal(m.body.share, 'backup$'); assert.equal(m.body.path, 'homelab');
  const w = await A('/api/smb/test', 'POST', { host: 'truenas.local', user: 'sebastian', password: 'pw', manual: '//truenas.local/backup$/homelab' });
  assert.equal(w.body.writable, true);
  assert.match(w.body.message, /^✓ Kan skrive · [\d,]+ MB\/s\. Skrev og slettet en testfil i \/\/truenas\.local\/backup\$\/homelab \(lest tilbake og kontrollert\)\./);
  assert.equal(w.body.readBack, true);
  assert.ok(calls.some((a) => /put ".*" "\.homelab-test-[0-9a-f-]{36}"/.test(a.join(' '))));
  // Bare lesing (media på nas.local): ekte feilkode.
  const ro = await A('/api/smb/test', 'POST', { host: 'nas.local', user: 'sebastian', password: 'pw', share: 'media', path: '' });
  assert.equal(ro.body.writable, false);
  assert.match(ro.body.message, /^✗ Ingen skrivetilgang: STATUS_ACCESS_DENIED/);
  assert.equal(ro.body.code, 'STATUS_ACCESS_DENIED');
  assert.equal((await A('/api/smb/list', 'POST', { host: 'truenas.local', manual: '/../etc' })).status, 400);
});

test('opplasting: til .part og rename når den er ferdig (ingen halve filer)', async () => {
  const local = join(process.env.DATA_DIR, 'x.bin');
  (await import('node:fs')).writeFileSync(local, Buffer.alloc(10));
  const out = await fb.smbRun({ share: '//nas.local/backup', user: 'sebastian', password: 'pw', cmd: `cd "homelab"; put "${local}" "bk.tar.gz.part"; rename "bk.tar.gz.part" "bk.tar.gz"` });
  assert.equal(fb.smbPutError(out), null);
  assert.deepEqual(Object.keys(mock.mockSmbTree().backup.root.d.homelab.f), ['bk.tar.gz']);
  assert.equal(fb.smbPutError('NT_STATUS_OBJECT_NAME_COLLISION making remote directory \\x\nputting file'), null, 'mkdir på eksisterende mappe er ikke en feil');
  assert.equal(fb.smbPutError('NT_STATUS_DISK_FULL opening remote file'), 'NT_STATUS_DISK_FULL');
  const src = readFileSync(new URL('../server/system-backup.js', import.meta.url), 'utf8') + readFileSync(new URL('../server/finans/backup.js', import.meta.url), 'utf8');
  assert.ok((src.match(/\.part"; rename "/g) ?? []).length >= 2, 'begge backupene laster opp via .part (prompt 36: systembackupen også manifestet)');
  assert.ok(statSync(local).size === 10);
});

test('skann: Docker/tunnel – klientens LAN-IP fra kroppen, LAN_SUBNET, kjente adresser og vanlige hjemmenett; årsak når ingenting finnes', async () => {
  const probed = new Set();
  sbr._setNet({ interfaces: () => ({ eth0: [{ family: 'IPv4', address: '172.17.0.2', internal: false }] }), probe: async (ip) => { probed.add(ip); return ip === '192.168.50.20'; },
    netbios: async () => 'TRUENAS', reverse: async () => null, lookup: async () => { throw new Error('ENOTFOUND'); } });
  process.env.LAN_SUBNET = '10.0.5.0/24';
  // Klienten kommer via tunnel (offentlig IP), men sender LAN-adressen sin.
  const r = await A('/api/smb/scan', 'POST', { lanIp: '192.168.86.31' }, { 'x-forwarded-for': '84.210.10.10' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.nets[0], '192.168.86.0/24');
  assert.ok(r.body.nets.includes('10.0.5.0/24'));
  assert.ok(r.body.nets.includes('192.168.50.0/24'), 'vanlige hjemmenett');
  assert.ok(r.body.nets.every((n) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n)), 'bare private nett');
  assert.ok([...probed].every((ip) => !/^84\./.test(ip)));
  assert.deepEqual(r.body.devices.map((d) => [d.ip, d.name]), [['192.168.50.20', 'TRUENAS']]);
  // SSE med fremdrift.
  const ck = await login('sebastian', 'testpassord1');
  const s = await (await app.request('/api/smb/scan', { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json', accept: 'text/event-stream' }, body: '{}' })).text();
  assert.match(s, /event: progress/); assert.match(s, /event: found/); assert.match(s, /event: done/);
  // Ingenting funnet → årsak og tiltak med manuell adresse.
  sbr._setNet({ interfaces: () => ({}), probe: async () => false, netbios: async () => null, reverse: async () => null, lookup: async () => { throw new Error('x'); } });
  const e = await A('/api/smb/scan', 'POST', {});
  assert.equal(e.body.devices.length, 0);
  assert.match(e.body.hint, /^Fant ingen\. Sjekk at NAS-en er på samme nett.*legg til manuelt: smb:\/\//);
  assert.ok(e.body.reason);
  // Den eldre /discover prøver også de vanlige nettene når de første ikke ga noe.
  sbr._setNet({ interfaces: () => ({ eth0: [{ family: 'IPv4', address: '172.17.0.2', internal: false }] }), probe: async (ip) => ip === '192.168.1.20', netbios: async () => 'NAS', reverse: async () => null, lookup: async () => { throw new Error('x'); } });
  const d = await A('/api/smb/discover', 'POST', {}, { 'x-forwarded-for': '84.210.10.10' });
  assert.deepEqual(d.body.map((x) => x.ip), ['192.168.1.20']);
  delete process.env.LAN_SUBNET;
});
