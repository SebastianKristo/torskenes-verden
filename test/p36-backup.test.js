// Prompt 36 (SERVER36): SMB-mappeleser med undermapper og «Ny mappe», og FEIL «backup tatt, men tom mappe»:
// synlig filnavn + .json-manifest, .part → rename, verifisering (stat + størrelse + sha256 + liste), status OK bare etter
// verifisering, retention etter verifisering og aldri den nye fila, opplasting med --directory (ingen stille fallback til roten).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p36b-'));
process.env.BACKUP_DIR = join(process.env.DATA_DIR, 'sb');
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-36b';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.BACKUP_COMPRESS = 'gz';
delete process.env.MOCK_DATA;
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const fb = await import('../server/finans/backup.js');
const sbr = await import('../server/smb-browse.js');
const sb = await import('../server/system-backup.js');
const mock = await import('../server/smb-mock.js');

const calls = [];
let fault = null; // (args) → svar som erstatter den falske NAS-en (f.eks. kabel trukket ut midt i put)
fb._setSmbExec(async (args, o) => { calls.push(args); const f = fault?.(args); return f ?? mock.mockSmbExec(args, o); });
sbr._setNet({ lookup: async (h) => ({ 'nas.local': '192.168.1.20' })[h] ?? Promise.reject(new Error('ENOTFOUND')) });

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let json = null; try { json = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: json, text: t };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
const NAS = { host: 'nas.local', user: 'sebastian', password: 'pw', domain: '' };
const cmdOf = (a) => a[a.indexOf('-c') + 1] ?? '';

test('mappeleser: åpne «backup» → «homelab», + Ny mappe «2026» (skrivetest med en gang), brødsmulesti og smb://-sti', async () => {
  mock.resetMockSmb();
  const root = await A('/api/smb/list', 'POST', { ...NAS, share: 'backup', path: '' });
  assert.equal(root.status, 200, root.text);
  assert.equal(root.body.url, 'smb://nas.local/backup');
  assert.ok(root.body.folders.some((f) => f.name === 'homelab'));
  const hl = await A('/api/smb/list', 'POST', { ...NAS, share: 'backup', path: 'homelab' });
  assert.equal(hl.body.empty, true);
  assert.match(hl.body.hint, /^Tom mappe/);
  assert.equal(hl.body.parent, '');
  const mk = await A('/api/smb/mkdir', 'POST', { ...NAS, share: 'backup', path: 'homelab', name: '2026' });
  assert.equal(mk.status, 200, mk.text);
  assert.deepEqual([mk.body.ok, mk.body.path, mk.body.writable, mk.body.url], [true, 'homelab/2026', true, 'smb://nas.local/backup/homelab/2026']);
  const y = await A('/api/smb/list', 'POST', { ...NAS, share: 'backup', path: 'homelab/2026' });
  assert.deepEqual(y.body.breadcrumb.map((x) => [x.name, x.path]), [['nas.local', null], ['backup', ''], ['homelab', 'homelab'], ['2026', 'homelab/2026']]);
  assert.deepEqual(y.body.target, { host: 'nas.local', share: 'backup', path: '/homelab/2026' });
  assert.deepEqual(Object.keys(mock.mockSmbTree().backup.root.d.homelab.d['2026'].f), [], 'testfila er slettet');
  const ro = await A('/api/smb/mkdir', 'POST', { ...NAS, share: 'media', path: '', name: 'x' });
  assert.equal(ro.body.kind, 'access');
  const save = await A('/api/smb/save', 'POST', { ...NAS, share: 'backup', path: 'homelab/2026', use: ['system'] });
  assert.equal(save.status, 200, save.text);
  assert.equal(save.body.url, 'smb://nas.local/backup/homelab/2026');
  assert.deepEqual(save.body.target, { host: 'nas.local', share: 'backup', path: '/homelab/2026' });
  assert.equal(save.body.system.url, 'smb://nas.local/backup/homelab/2026');
});

test('backup til SMB: synlig homelab-…tar.gz + .json i valgt undermappe, verifisert, kvittering i list/status', async () => {
  const dir = () => mock.mockSmbTree().backup.root.d.homelab.d['2026'].f;
  dir()['homelab-2026-01-01_0300-hele.tar.gz.part'] = { size: 5, mtime: Date.now(), data: Buffer.alloc(5) }; // halv fil fra en avbrutt kjøring
  assert.equal((await A('/api/backup/settings', 'PUT', { keep: '7', scope: 'finans' })).status, 200);
  calls.length = 0;
  const job = await sb.startBackup({ scope: 'finans', kind: 'manual', by: 'sebastian' }).done;
  assert.equal(job.ok, true, job.error);
  assert.equal(job.verified, true);
  assert.equal(job.target, 'smb');
  assert.equal(job.method, 'smbclient');
  assert.match(job.name, /^homelab-\d{4}-\d\d-\d\d_\d{4}-finans\.tar\.gz$/);
  assert.equal(job.url, `smb://nas.local/backup/homelab/2026/${job.name}`);
  assert.equal(job.fullPath, `//nas.local/backup/homelab/2026/${job.name}`);
  assert.equal(job.bytes, job.size);
  assert.match(job.sha256, /^[0-9a-f]{64}$/);
  assert.match(job.receipt, /^✓ .+ · smb:\/\/nas\.local\/backup\/homelab\/2026\/homelab-.+ · verifisert$/);
  assert.deepEqual(job.folder, { host: 'nas.local', share: 'backup', path: 'homelab/2026' });
  const names = Object.keys(dir());
  assert.ok(names.includes(job.name));
  assert.ok(names.includes(job.name.replace(/\.tar\.gz$/, '.json')), 'manifest ved siden av');
  assert.ok(!names.some((n) => n.endsWith('.part')), 'ingen halve filer');
  assert.equal(dir()[job.name].size, job.size);
  const man = JSON.parse(dir()[job.name.replace(/\.tar\.gz$/, '.json')].data.toString('utf8'));
  assert.equal(man.sha256, job.sha256);
  // Opplastingen går med --directory (finnes ikke mappen, feiler smbclient i stedet for å skrive til roten).
  const put = calls.find((a) => cmdOf(a).startsWith('put '));
  assert.ok(put.includes('--directory=homelab/2026'));
  assert.ok(calls.some((a) => /^get "/.test(cmdOf(a))), 'lest tilbake for sha256');
  const list = (await A('/api/backup/list')).body;
  assert.equal(list[0].verified, true);
  assert.equal(list[0].url, job.url);
  const st = (await A('/api/backup/status')).body;
  assert.equal(st.last.verified, true);
});

test('retention etter verifisering, aldri den nye fila (også med feil sortering), gamle manifester ryddes', async () => {
  const dir = mock.mockSmbTree().backup.root.d.homelab.d['2026'].f;
  for (let i = 1; i <= 8; i++) { dir[`homelab-2099-0${i}-01_0300-hele.tar.gz`] = { size: 1, mtime: Date.now(), data: Buffer.alloc(1) }; dir[`homelab-2099-0${i}-01_0300-hele.json`] = { size: 1, mtime: Date.now(), data: Buffer.alloc(1) }; }
  const job = await sb.startBackup({ scope: 'finans', kind: 'manual' }).done;
  assert.equal(job.ok, true, job.error);
  assert.ok(Object.keys(dir).includes(job.name), 'den nye er beholdt selv om «framtidige» filer sorteres foran');
  assert.ok(job.retention.some((r) => r.where === 'smb' && r.action === 'slettet'));
  const tars = Object.keys(dir).filter((n) => /\.tar\.gz$/.test(n));
  assert.equal(tars.length, 8, 'keep 7, men den nye (sortert sist bak «2099»-filene) beholdes i tillegg');
  for (const r of job.retention.filter((x) => x.where === 'smb')) assert.ok(!(r.name in dir));
  assert.deepEqual(sb.smbRotateList(['homelab-2026-10-19_2130-hele.tar.zst', 'homelab-2026-10-18_0300-hele.tar.zst'], '7'), []);
  assert.deepEqual(sb.smbRotateList(['homelab-2026-10-19_2130-hele.tar.zst', 'homelab-2026-01-01_0300-hele.tar.zst'], '90d', Date.parse('2026-10-19T22:00:00Z')), ['homelab-2026-01-01_0300-hele.tar.zst']);
  assert.deepEqual(sb.smbRotateList(['homelab-2026-10-19_2130-hele.tar.zst', 'homelab-2026-01-01_0300-hele.tar.zst'], '90d', Date.parse('2026-10-19T22:00:00Z'), 'homelab-2026-01-01_0300-hele.tar.zst'), []);
});

test('nettverkskabelen ut midt i: status Feilet med ekte feilkode, ingen halv fil, aldri «tatt» uten fil', async () => {
  const dir = mock.mockSmbTree().backup.root.d.homelab.d['2026'].f;
  const before = Object.keys(dir).length;
  fault = (args) => (cmdOf(args).startsWith('put ') && cmdOf(args).includes('.tar.') ? { code: 1, stdout: '', stderr: 'NT_STATUS_CONNECTION_DISCONNECTED' } : null);
  const job = await sb.startBackup({ scope: 'finans', kind: 'manual' }).done;
  fault = null;
  assert.equal(job.ok, false);
  assert.equal(job.state, 'failed');
  assert.equal(job.verified, false);
  assert.match(job.error, /Kopien til nettverksdisken feilet: .*SMB-versjon|Kopien til nettverksdisken feilet/);
  assert.equal(Object.keys(dir).length, before);
  assert.ok(!Object.keys(dir).some((n) => n.endsWith('.part')));
  const st = (await A('/api/backup/status')).body;
  assert.equal(st.last.ok, false);
});

test('feil størrelse på NAS-en etter opplasting gir Feilet', async () => {
  let put = null;
  fault = (args) => {
    const c = cmdOf(args);
    const m = c.match(/^put "[^"]+" "(homelab-[^"]+\.tar\.gz)\.part"/);
    if (m) { put = m[1]; return null; }
    if (c === 'ls' && put) { const d = mock.mockSmbTree().backup.root.d.homelab.d['2026'].f; if (d[put]) d[put].size = 3; }
    return null;
  };
  const job = await sb.startBackup({ scope: 'finans', kind: 'manual' }).done;
  fault = null;
  assert.ok(put);
  assert.equal(job.ok, false);
  assert.match(job.error, /feil størrelse: 3 av/);
});

test('BACKUP_REQUIRE_MOUNT=1: en mappe som ikke er montert gir feil, ingen stille lokal fallback', async () => {
  process.env.BACKUP_REQUIRE_MOUNT = '1';
  assert.match(sb.checkBackupMount(process.env.BACKUP_DIR), /ikke montert/);
  const job = await sb.startBackup({ scope: 'finans', kind: 'manual' }).done;
  delete process.env.BACKUP_REQUIRE_MOUNT;
  assert.equal(job.ok, false);
  assert.match(job.error, /ikke montert/);
  assert.equal(sb.checkBackupMount(), null);
});

test('FinansHub-backup til SMB: --directory og verifisering før status OK', async () => {
  await A('/api/smb/save', 'POST', { ...NAS, share: 'backup', path: 'finanshub', use: ['finans'] });
  (await import('../server/finans/db.js')).saveSettings({ smbEncrypt: false, smbDb: true });
  calls.length = 0;
  const r = await fb.runBackup('test');
  assert.equal(r.started, true, r.message);
  for (let i = 0; i < 100 && fb.backupRunning(); i++) await new Promise((x) => setTimeout(x, 20));
  const { db } = await import('../server/finans/db.js');
  const row = db.prepare('SELECT * FROM fh_backups ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.status, 'ok', row.error);
  const put = calls.find((a) => cmdOf(a).startsWith('put '));
  assert.ok(put.includes('--directory=finanshub'));
  assert.ok(Object.keys(mock.mockSmbTree().backup.root.d.finanshub.f).includes(row.file));
  assert.ok(readdirSync(process.env.BACKUP_DIR).length >= 1);
});
