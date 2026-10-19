// Prompt 30: SMB-veiviseren (/api/smb) og nettverksdisk som mål i systembackupen.
// smbclient byttes ut med den falske NAS-en i server/smb-mock.js (samme utdata som smbclient), nettverket med falske funksjoner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-smb30-'));
process.env.BACKUP_DIR = join(process.env.DATA_DIR, 'sb');
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-30';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.BACKUP_COMPRESS = 'gz';
delete process.env.MOCK_DATA;
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const fb = await import('../server/finans/backup.js');
const sbr = await import('../server/smb-browse.js');
const sb = await import('../server/system-backup.js');
const mock = await import('../server/smb-mock.js');

// smbclient-kall logges: argumenter + innholdet og rettighetene til auth-fila mens kallet pågår.
const calls = [];
fb._setSmbExec(async (args, o) => {
  const af = args[args.indexOf('-A') + 1];
  const c = { args, auth: args.includes('-A') ? readFileSync(af, 'utf8') : null, mode: args.includes('-A') ? statSync(af).mode & 0o777 : null, authPath: af };
  calls.push(c);
  return mock.mockSmbExec(args, o);
});
sbr._setNet({ lookup: async (h) => ({ 'nas.local': '192.168.1.20', 'gammel-nas.local': '192.168.1.30', 'ond.example': '8.8.8.8' })[h] ?? Promise.reject(new Error('ENOTFOUND')) });

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body, extra = {}) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let json = null; try { json = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: json, text: t };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const tokR = (await A('/finans/api/tokens', 'POST', { name: 'iPhone', scopes: ['finance:read'] })).body.token;
const tokW = (await A('/finans/api/tokens', 'POST', { name: 'Pixel', scopes: ['finance:read', 'finance:write'] })).body.token;
const TR = client({ authorization: `Bearer ${tokR}` });
const TW = client({ authorization: `Bearer ${tokW}` });
const NAS = { host: 'nas.local', user: 'sebastian', password: 'hemmelig-nas-pw', domain: '' };

/* ---------------- Parsing ---------------- */

test('parser smbclient -L -g og skjuler IPC$, print$ og admin-shares', () => {
  const out = 'Disk|backup|Sikkerhetskopier\nDisk|media|\nIPC|IPC$|IPC Service (Samba 4.19)\nDisk|print$|Printer Drivers\nDisk|homes$|skjult\nPrinter|hp|Skriver\nServer|NAS|\nWorkgroup|WORKGROUP|NAS\n';
  assert.deepEqual(sbr.parseShares(out), [{ name: 'backup', comment: 'Sikkerhetskopier' }, { name: 'media', comment: '' }]);
  assert.deepEqual(sbr.parseShares(''), []);
});

test('parser ls: mapper med mellomrom, filer, attributter; skjuler . .. @eaDir #recycle', () => {
  const out = [
    '  .                                   D        0  Mon Oct 19 10:00:00 2026',
    '  ..                                  D        0  Mon Oct 19 10:00:00 2026',
    '  homelab                             D        0  Fri Oct  2 09:01:02 2026',
    '  Time Machine                        D        0  Thu Jan  1 00:00:00 2026',
    '  Film A                             DR        0  Thu Jan  1 00:00:00 2026',
    '  @eaDir                              D        0  Thu Jan  1 00:00:00 2026',
    '  #recycle                           DH        0  Thu Jan  1 00:00:00 2026',
    '  bk-20261001-030000-abcdef.tar.gz    A  1234567  Thu Oct  1 03:00:10 2026',
    '  notat 2024.txt                      N       12  Thu Oct  1 03:00:10 2026',
    '', '\t\t3906469376 blocks of size 1024. 2512048128 blocks available'].join('\n');
  const all = sbr.parseLs(out);
  assert.equal(all.length, 7);
  assert.deepEqual(all.find((r) => r.name === 'bk-20261001-030000-abcdef.tar.gz'), { name: 'bk-20261001-030000-abcdef.tar.gz', type: 'file', size: 1234567, when: Date.parse('Thu Oct 1 03:00:10 2026') });
  assert.equal(all.find((r) => r.name === 'notat 2024.txt').type, 'file');
  assert.deepEqual(sbr.foldersOf(out), [{ name: 'Film A', type: 'dir' }, { name: 'homelab', type: 'dir' }, { name: 'Time Machine', type: 'dir' }]);
});

test('norske feilmeldinger for vanlige smbclient-feil', () => {
  const t = (s) => fb.smbErrorText(s);
  assert.equal(t('session setup failed: NT_STATUS_LOGON_FAILURE').kind, 'auth');
  assert.match(t('session setup failed: NT_STATUS_LOGON_FAILURE').message, /^Feil brukernavn eller passord/);
  for (const s of ['do_connect: Connection to 10.0.0.9 failed (Error NT_STATUS_HOST_UNREACHABLE)', 'NT_STATUS_IO_TIMEOUT', 'Error NT_STATUS_CONNECTION_REFUSED']) {
    assert.equal(t(s).kind, 'host', s);
    assert.match(t(s).message, /Fant ikke serveren.*SMB.*slått på/);
  }
  assert.equal(t('tree connect failed: NT_STATUS_ACCESS_DENIED').kind, 'access');
  assert.match(t('tree connect failed: NT_STATUS_BAD_NETWORK_NAME').message, /Fant ikke den delte mappen/);
  assert.equal(t('protocol negotiation failed: NT_STATUS_CONNECTION_RESET').kind, 'proto');
  assert.match(t('protocol negotiation failed: NT_STATUS_CONNECTION_RESET').message, /SMB2 eller SMB3/);
  assert.equal(fb.smbErrorText('', { missing: true }).kind, 'missing');
  assert.equal(fb.smbErrorText('', { killed: true }).kind, 'host');
});

/* ---------------- Sanering ---------------- */

test('sanering: navn og stier med injeksjonsforsøk avvises (ingen escaping)', () => {
  for (const bad of ['..', '.', 'a"b', "a'b", 'a;b', 'a/b', 'a\\b', 'x\ny', 'x\0', ' foran', 'bak ', '', 'a|b', 'a`b', 'a$b', 'a*b', 'a?b', 'a<b', 'a:b', 'x'.repeat(121)]) {
    assert.throws(() => sbr.cleanName(bad), /Ugyldig/, JSON.stringify(bad));
  }
  for (const ok of ['homelab', 'Time Machine', 'Bilder (2025)', 'æøå ÆØÅ', 'a.b-c_d', 'backup+2', '#1', '...a']) assert.equal(sbr.cleanName(ok), ok);
  assert.equal(sbr.cleanPath('/a/b/'), 'a/b');
  assert.equal(sbr.cleanPath(''), '');
  for (const bad of ['../etc', 'a/../b', 'a/"x', 'a;ls', 'a/b\n', 'x/.']) assert.throws(() => sbr.cleanPath(bad), /Ugyldig/, bad);
  for (const bad of ['nas;ls', 'nas local', '"nas"', '-L', 'nas$', '']) assert.throws(() => sbr.cleanHost(bad), /IP-adressen/, bad);
  assert.equal(sbr.cleanHost('\\\\NAS.local\\backup'), 'nas.local');
  assert.equal(sbr.cleanHost('smb://192.168.1.20/backup'), '192.168.1.20');
  assert.equal(fb.normShare('//nas/a"b'), null);
  assert.equal(fb.normShare('//nas/backup/sub;del'), null);
  assert.equal(fb.normShare('\\\\nas\\backup'), '//nas/backup');
});

test('sanering i rutene: injeksjonsforsøk gir 400 og når aldri smbclient', async () => {
  const n = calls.length;
  const tries = [
    ['/api/smb/browse', { ...NAS, share: 'backup', path: '../../etc' }],
    ['/api/smb/browse', { ...NAS, share: 'backup"; del "x', path: '' }],
    ['/api/smb/browse', { ...NAS, share: 'backup', path: 'homelab"; mkdir "x' }],
    ['/api/smb/mkdir', { ...NAS, share: 'backup', path: 'homelab', name: 'ny"; del "bk' }],
    ['/api/smb/mkdir', { ...NAS, share: 'backup', path: 'homelab', name: '..' }],
    ['/api/smb/mkdir', { ...NAS, share: 'backup', path: 'homelab', name: 'a;b' }],
    ['/api/smb/shares', { ...NAS, host: 'nas.local; ls' }],
    ['/api/smb/shares', { ...NAS, host: '-L' }],
    ['/api/smb/shares', { ...NAS, user: 'a\nb' }],
    ['/api/smb/shares', { ...NAS, password: 'pw\nusername = root' }],
    ['/api/smb/shares', { ...NAS, domain: 'X;Y' }],
    ['/api/smb/test', { ...NAS, share: 'backup', path: 'a/\u0007b' }],
  ];
  for (const [p, b] of tries) { const r = await A(p, 'POST', b); assert.equal(r.status, 400, `${p} ${JSON.stringify(b)} → ${r.text}`); }
  assert.equal(calls.length, n);
  // Offentlig adresse (eller navn som peker dit) avvises også.
  assert.equal((await A('/api/smb/shares', 'POST', { ...NAS, host: '8.8.8.8' })).status, 400);
  const r = await A('/api/smb/shares', 'POST', { ...NAS, host: 'ond.example' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /internett/);
  assert.equal(calls.length, n);
});

/* ---------------- Tilgang ---------------- */

test('tilgang: bare admin; økt krever JSON; token må ha finance:write', async () => {
  assert.equal((await client({})('/api/smb/discover', 'POST', {})).status, 401);
  assert.equal((await K('/api/smb/discover', 'POST', {})).status, 403);
  assert.equal((await K('/api/smb/shares', 'POST', NAS)).status, 403);
  assert.equal((await K('/api/smb/save', 'POST', { ...NAS, share: 'backup', path: '', use: ['finans'] })).status, 403);
  assert.equal((await TR('/api/smb/shares', 'POST', NAS)).status, 401);
  assert.equal((await TW('/api/smb/shares', 'POST', NAS)).status, 200);
  const form = await app.request('/api/smb/shares', { method: 'POST', headers: { cookie: (await login('sebastian', 'testpassord1')), 'content-type': 'application/x-www-form-urlencoded' }, body: 'host=nas.local' });
  assert.equal(form.status, 415);
  assert.equal((await A('/api/smb/shares')).status, 405);
});

/* ---------------- Finn server ---------------- */

test('discover: bare private /24-nett (klient + egne grensesnitt uten docker), navn via NetBIOS/DNS', async () => {
  const probed = [];
  sbr._setNet({
    interfaces: () => ({ eth0: [{ family: 'IPv4', address: '192.168.1.5', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
      docker0: [{ family: 'IPv4', address: '172.17.0.1', internal: false }], 'br-1a2b': [{ family: 'IPv4', address: '172.18.0.1', internal: false }],
      lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }], wan0: [{ family: 'IPv4', address: '84.210.1.2', internal: false }] }),
    probe: async (ip) => { probed.push(ip); return ip === '192.168.1.20' || ip === '10.0.0.7'; },
    netbios: async (ip) => (ip === '192.168.1.20' ? 'NAS' : null),
    reverse: async (ip) => (ip === '10.0.0.7' ? 'pc.lan' : null),
  });
  const r = await A('/api/smb/discover', 'POST', {}, { 'x-forwarded-for': '10.0.0.50' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body, [{ host: 'pc.lan', ip: '10.0.0.7', name: 'pc.lan' }, { host: '192.168.1.20', ip: '192.168.1.20', name: 'NAS' }]);
  assert.equal(probed.length, 2 * 254);
  assert.ok(probed.every((ip) => /^(10\.0\.0|192\.168\.1)\.\d+$/.test(ip)), 'bare private nett');
  // Offentlig klientadresse: bare serverens eget LAN.
  probed.length = 0;
  const r2 = await A('/api/smb/discover', 'POST', {}, { 'x-forwarded-for': '8.8.4.4' });
  assert.equal(r2.status, 200);
  assert.ok(probed.length === 254 && probed.every((ip) => ip.startsWith('192.168.1.')));
  assert.deepEqual(sbr.scanNets('127.0.0.1'), ['192.168.1']);
  // Tidsbudsjett: trege verter stoppes.
  sbr._setNet({ probe: (ip) => new Promise((res) => setTimeout(() => res(false), 300)) });
  const t0 = Date.now();
  await sbr.discover('10.1.2.3', { budget: 1800 });
  assert.ok(Date.now() - t0 < 2500, `brukte ${Date.now() - t0} ms`);
});

/* ---------------- Logg inn, shares, mapper ---------------- */

test('shares: SMB3, auth-fil 0600 som slettes, passordet aldri på kommandolinjen eller i svaret', async () => {
  const n = calls.length;
  const r = await A('/api/smb/shares', 'POST', NAS);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body, { shares: [{ name: 'backup', comment: 'Sikkerhetskopier' }, { name: 'home', comment: 'Hjemmemapper' }, { name: 'media', comment: 'Filmer, musikk og bilder' }], protocol: 'SMB3' });
  const c = calls[n];
  assert.deepEqual(c.args.slice(0, 3), ['-L', '//nas.local', '-g']);
  assert.ok(c.args.includes('--option=client min protocol=SMB3_00'));
  assert.equal(c.mode, 0o600);
  assert.match(c.auth, /^username = sebastian\npassword = hemmelig-nas-pw\ndomain = WORKGROUP\n$/);
  assert.equal(existsSync(c.authPath), false);
  assert.ok(!c.args.join(' ').includes('hemmelig-nas-pw'));
  assert.ok(!r.text.includes('hemmelig-nas-pw'));
});

test('shares: gjest, feil passord, ukjent server og automatisk SMB2', async () => {
  const g = await A('/api/smb/shares', 'POST', { host: 'nas.local' });
  assert.equal(g.status, 200);
  assert.match(calls.at(-1).auth, /^username = guest\n/);
  const f = await A('/api/smb/shares', 'POST', { ...NAS, password: 'feil' });
  assert.equal(f.status, 502);
  assert.equal(f.body.kind, 'auth');
  assert.match(f.body.error, /^Feil brukernavn eller passord/);
  const u = await A('/api/smb/shares', 'POST', { ...NAS, host: '192.168.1.99' });
  assert.equal(u.status, 502);
  assert.match(u.body.error, /Fant ikke serveren/);
  const n = calls.length;
  const o = await A('/api/smb/shares', 'POST', { ...NAS, host: 'gammel-nas.local' });
  assert.equal(o.status, 200, o.text);
  assert.equal(o.body.protocol, 'SMB2');
  assert.equal(calls.length - n, 2);
  assert.ok(calls.at(-1).args.includes('--option=client min protocol=SMB2_02'));
});

test('browse, mkdir og skrivetest', async () => {
  const T = { ...NAS, share: 'backup' };
  const root = await A('/api/smb/browse', 'POST', { ...T, path: '' });
  assert.equal(root.status, 200, root.text);
  assert.deepEqual(root.body.map((x) => x.name), ['Bilder fra mobil', 'finanshub', 'homelab', 'Time Machine']);
  assert.ok(root.body.every((x) => x.type === 'dir'));
  const sub = await A('/api/smb/browse', 'POST', { ...T, path: 'Bilder fra mobil' });
  assert.deepEqual(sub.body.map((x) => x.name), ['2025', '2026']);
  assert.ok(calls.at(-1).args.includes('--directory=Bilder fra mobil'));
  const missing = await A('/api/smb/browse', 'POST', { ...T, path: 'finnes/ikke' });
  assert.equal(missing.status, 502);
  assert.match(missing.body.error, /Fant ikke mappen/);
  const mk = await A('/api/smb/mkdir', 'POST', { ...T, path: 'homelab', name: 'Server 1' });
  assert.equal(mk.status, 200, mk.text);
  assert.deepEqual(mk.body, { ok: true, path: 'homelab/Server 1' });
  assert.deepEqual((await A('/api/smb/browse', 'POST', { ...T, path: 'homelab' })).body, [{ name: 'Server 1', type: 'dir' }]);
  const dup = await A('/api/smb/mkdir', 'POST', { ...T, path: 'homelab', name: 'Server 1' });
  assert.equal(dup.status, 502);
  assert.match(dup.body.error, /finnes allerede/);
  const ro = await A('/api/smb/mkdir', 'POST', { ...NAS, share: 'media', path: '', name: 'x' });
  assert.equal(ro.body.kind, 'access');

  const w = await A('/api/smb/test', 'POST', { ...T, path: 'homelab' });
  assert.equal(w.status, 200);
  assert.equal(w.body.ok, true);
  assert.equal(w.body.writable, true);
  assert.match(w.body.message, /Skrev og slettet en testfil i \/\/nas\.local\/backup\/homelab/);
  assert.equal(typeof w.body.mbps, 'number');
  assert.deepEqual(Object.keys(mock.mockSmbTree().backup.root.d.homelab.f), [], 'testfila er slettet');
  const r = await A('/api/smb/test', 'POST', { ...NAS, share: 'media', path: 'Filmer' });
  assert.deepEqual([r.body.ok, r.body.writable], [true, false]);
  assert.match(r.body.message, /ikke skrivetilgang/);
  const g = await A('/api/smb/test', 'POST', { host: 'nas.local', share: 'backup', path: '' });
  assert.equal(g.body.ok, false);
  assert.match(g.body.message, /Ingen tilgang/);
});

/* ---------------- Lagre ---------------- */

test('save → smbConfig (FinansHub) og systembackupens SMB-mål; passordet kryptert og aldri ut igjen', async () => {
  assert.equal((await A('/api/smb/save', 'POST', { ...NAS, share: 'backup', path: 'homelab', use: [] })).status, 400);
  assert.equal((await A('/api/smb/save', 'POST', { ...NAS, share: 'backup', path: 'homelab', use: ['alt'] })).status, 400);
  assert.equal((await A('/api/smb/save', 'POST', { ...NAS, share: 'backup', path: 'finnes-ikke', use: ['finans'] })).status, 502);
  const r = await A('/api/smb/save', 'POST', { ...NAS, domain: 'HJEM', share: 'backup', path: 'homelab', protocol: 'SMB3', use: ['finans', 'system'] });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.label, '//nas.local/backup/homelab');
  assert.ok(!r.text.includes('hemmelig-nas-pw'));
  const c = fb.smbConfig();
  assert.deepEqual({ on: c.on, share: c.share, dir: c.dir, user: c.user, domain: c.domain, version: c.version, pwSet: c.pwSet },
    { on: true, share: '//nas.local/backup', dir: 'homelab', user: 'sebastian', domain: 'HJEM', version: '3.0', pwSet: true });
  const { kv, OWNER } = await import('../server/db.js');
  assert.match(kv.get(OWNER, 'fh_secret', {}).smbPass, /^enc:/);
  const s = await A('/api/backup/settings');
  assert.deepEqual({ ...s.body.target.smb, lastUpload: undefined }, { enabled: true, share: '//nas.local/backup', path: 'homelab', label: '//nas.local/backup/homelab', lastUpload: undefined, lastError: null, unencrypted: true });
  assert.ok(!JSON.stringify((await A('/finans/api/backup')).body).includes('hemmelig-nas-pw'));
  // FinansHub-testen bruker samme pålogging.
  const t = await A('/finans/api/backup/smb/test', 'POST', {});
  assert.equal(t.body.ok, true, t.text);
  assert.match(t.body.message, /Tilkoblet \/\/nas\.local\/backup\/homelab/);
  assert.match(calls.at(-1).auth, /password = hemmelig-nas-pw/);
  // Bare FinansHub: systemmålet på samme share slås av.
  const r2 = await A('/api/smb/save', 'POST', { ...NAS, share: 'backup', path: 'homelab', use: ['finans'] });
  assert.equal(r2.body.system.enabled, false);
  // PUT /api/backup/settings target.smb valideres.
  assert.equal((await A('/api/backup/settings', 'PUT', { target: { smb: { path: '../x' } } })).status, 400);
  assert.equal((await A('/api/backup/settings', 'PUT', { target: { smb: { share: '//nas/a"b' } } })).status, 400);
  assert.equal((await A('/api/backup/settings', 'PUT', { target: { smb: { enabled: true } } })).status, 200);
});

/* ---------------- Systembackup → nettverksdisk ---------------- */

test('systembackup kopierer ferdig fil til SMB, roterer etter keep og viser smb i lista', async () => {
  mock.resetMockSmb();
  // Gamle backuper i mappen (9 stk.) + en annen fil som aldri skal røres.
  const dir = mock.mockSmbTree().backup.root.d.homelab.f;
  for (let i = 1; i <= 9; i++) dir[`bk-2026090${i}-030000-00000${i}.tar.gz`] = { size: 10, mtime: Date.now(), data: Buffer.alloc(10) };
  dir['notater.txt'] = { size: 3, mtime: Date.now(), data: Buffer.from('hei') };
  assert.equal((await A('/api/backup/settings', 'PUT', { keep: '7', scope: 'finans' })).status, 200);
  const { id, done } = sb.startBackup({ scope: 'finans', kind: 'manual', by: 'sebastian' });
  const job = await done;
  assert.equal(job.ok, true, job.error);
  assert.equal(job.smb.ok, true, JSON.stringify(job.smb));
  assert.equal(job.smb.path, '//nas.local/backup/homelab');
  assert.equal(job.smb.removed, 3);
  const names = Object.keys(dir).sort();
  assert.ok(names.includes(sb._test.getJob(id).file));
  assert.equal(names.filter((n) => n.startsWith('bk-')).length, 7);
  assert.ok(names.includes('notater.txt'));
  assert.equal(dir[sb._test.getJob(id).file].size, job.size);
  const put = calls.find((c) => c.args.includes('-c') && c.args[c.args.indexOf('-c') + 1].includes(`"${sb._test.getJob(id).file}"`));
  assert.match(put.args[put.args.indexOf('-c') + 1], /^mkdir "homelab"; cd "homelab"; put "/);
  const list = (await A('/api/backup/list')).body;
  assert.equal(list.find((x) => x.id === id).smb.ok, true);
  assert.ok((await A('/api/backup/settings')).body.target.smb.lastUpload);

  // Feil på nettverksdisken: backupen er fortsatt OK lokalt, feilen vises.
  fb._setSmbExec(async (args) => (args[0] === '--version' ? { code: 0, stdout: '', stderr: '' } : { code: 1, stdout: '', stderr: 'session setup failed: NT_STATUS_LOGON_FAILURE' }));
  const j2 = await sb.startBackup({ scope: 'finans', kind: 'manual' }).done;
  assert.equal(j2.ok, true);
  assert.equal(j2.smb.ok, false);
  assert.match(j2.smb.error, /Feil brukernavn eller passord/);
  assert.match((await A('/api/backup/settings')).body.target.smb.lastError, /Feil brukernavn/);
});

test('rotasjonsliste for nettverksdisken (antall og alder, nyeste beholdes)', () => {
  const n = ['bk-20260101-030000-aaaaaa.tar.gz', 'bk-20260601-030000-bbbbbb.tar.gz.enc', 'bk-20261001-030000-cccccc.tar.zst', 'annet.txt', 'bk-..-x'];
  assert.deepEqual(sb.smbRotateList(n, '7'), []);
  assert.deepEqual(sb.smbRotateList([...n, ...Array.from({ length: 7 }, (_, i) => `bk-2026110${i}-030000-00000${i}.tar.gz`)], '7').length, 3);
  assert.deepEqual(sb.smbRotateList(n, '90d', Date.parse('2026-10-19T00:00:00Z')), ['bk-20260601-030000-bbbbbb.tar.gz.enc', 'bk-20260101-030000-aaaaaa.tar.gz']);
  assert.deepEqual(sb.smbRotateList(n, '1y', Date.parse('2026-10-19T00:00:00Z')), []);
  assert.deepEqual(sb.smbRotateList(['bk-20200101-030000-aaaaaa.tar.gz'], '90d'), [], 'den eneste beholdes');
});
