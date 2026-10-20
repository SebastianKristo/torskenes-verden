// Prompt 40 (SERVER40): SMB-mappen «[05] Backup» ble avvist med «Ugyldig mappenavn». Den ekte feilen: hvitelisten SMB_SEG i
// finans/backup.js godtok bare bokstaver, tall, mellomrom og . _ - ( ) + , = @ # ~ !, mens SMB tillater alt unntatt \ / : * ? " < > |.
// Nå: SMB-reglene, share og sti hver for seg, sti som én argv-verdi (--directory, aldri skall/glob), feiltype per kind, shares med pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p40smb-'));
process.env.BACKUP_DIR = join(process.env.DATA_DIR, 'sb');
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-40smb';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
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
const mock = await import('../server/smb-mock.js');

const calls = [];
fb._setSmbExec(async (args, o) => { calls.push(args); return mock.mockSmbExec(args, o); });
sbr._setNet({ lookup: async (h) => ({ 'nas.local': '192.168.1.20' })[h] ?? Promise.reject(new Error('ENOTFOUND')) });
// Sharen «Skogen» slik brukerens NAS ser ut.
const node = (d = {}) => ({ d: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, node(v)])), f: {} });
mock.mockSmbTree().Skogen = { comment: 'Skogen', ro: false, guest: false, root: node({ '[05] Backup': {}, 'Bilder & video': {}, 'Æøå': {}, "Ola's {arkiv}": {} }) };

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const cookie = await login('sebastian', 'testpassord1');
const A = async (path, body) => {
  const r = await app.request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: j, text: t };
};
const NAS = { host: 'nas.local', user: 'sebastian', password: 'hemmelig-nas-pw' };

test('SMB-reglene: bare \\ / : * ? " < > | og kontrolltegn er forbudt, ikke slutt på mellomrom/punktum', () => {
  for (const ok of ['[05] Backup', 'Bilder & video', 'Æøå', "Ola's {arkiv}", 'a$b', '~tmp', 'x`y']) assert.equal(fb.smbNameError(ok), null, ok);
  for (const [bad, ch] of [['Backup?', '?'], ['a:b', ':'], ['a*b', '*'], ['a<b', '<'], ['a|b', '|'], ['a"b', '"'], ['a\\b', '\\']]) {
    const e = fb.smbNameError(bad);
    assert.equal(e.kind, 'name', bad);
    assert.equal(e.char, ch);
    assert.equal(e.message, `Mappenavnet kan ikke inneholde ${ch}`);
  }
  assert.match(fb.smbNameError('bak ').message, /slutte på mellomrom eller punktum/);
  assert.match(fb.smbNameError('bak.').message, /slutte på mellomrom eller punktum/);
  assert.match(fb.smbNameError('x\u0001').message, /kontrolltegn/);
  assert.equal(sbr.cleanPath('/[05] Backup/'), '[05] Backup');
  assert.throws(() => sbr.cleanPath('Backup?'), (e) => e.kind === 'name' && e.char === '?' && e.status === 400);
});

test('Skogen/[05] Backup, Skogen/Bilder & video og Skogen/Æøå godkjennes, og skrivetesten lager og sletter .homelab-test', async () => {
  for (const path of ['[05] Backup', 'Bilder & video', 'Æøå']) {
    calls.length = 0;
    const r = await A('/api/smb/test', { ...NAS, share: 'Skogen', path });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.writable, true, `${path}: ${r.text}`);
    // Stien går som én argv-verdi (aldri gjennom skall/glob), share for seg.
    assert.ok(calls.every((a) => a[0] === '//nas.local/Skogen'), JSON.stringify(calls[0]));
    assert.ok(calls.some((a) => a.includes(`--directory=${path}`)));
    assert.ok(calls.some((a) => a.some((x) => /put ".*" "\.homelab-test-/.test(x))));
    assert.ok(calls.some((a) => a.some((x) => /^del "\.homelab-test-/.test(x))));
  }
  assert.deepEqual(Object.keys(mock.mockSmbTree().Skogen.root.d['[05] Backup'].f), [], 'testfila er slettet');
  // Mappevelgeren lister mappen og gir brødsmuler.
  const l = await A('/api/smb/list', { ...NAS, share: 'Skogen', path: '' });
  assert.equal(l.status, 200, l.text);
  const names = l.body.folders.map((f) => f.name);
  for (const n of ['[05] Backup', 'Bilder & video', 'Æøå', "Ola's {arkiv}"]) assert.ok(names.includes(n), n);
  assert.ok(l.body.folders.every((f) => !f.unsupported));
  const sub = await A('/api/smb/list', { ...NAS, share: 'Skogen', path: '[05] Backup' });
  assert.deepEqual(sub.body.breadcrumb.map((b) => b.name), ['nas.local', 'Skogen', '[05] Backup']);
  // Lagre virker med samme sti.
  const s = await A('/api/smb/save', { ...NAS, share: 'Skogen', path: '[05] Backup', use: ['system'] });
  assert.equal(s.status, 200, s.text);
  assert.equal(s.body.label, '//nas.local/Skogen/[05] Backup');
});

test('feilmelding per type: name (med tegn), notfound («Fant ikke mappen … i Skogen» + opprett), connect, shares med pass', async () => {
  const n = await A('/api/smb/test', { ...NAS, share: 'Skogen', path: 'Backup?' });
  assert.equal(n.status, 400);
  assert.deepEqual([n.body.kind, n.body.char, n.body.error], ['name', '?', 'Mappenavnet kan ikke inneholde ?']);
  const nf = await A('/api/smb/list', { ...NAS, share: 'Skogen', path: '[06] Mangler' });
  assert.equal(nf.body.kind, 'notfound');
  assert.equal(nf.body.error, 'Fant ikke mappen «[06] Mangler» i Skogen');
  assert.equal(nf.body.canCreate, true);
  assert.deepEqual(nf.body.create, { share: 'Skogen', path: '', name: '[06] Mangler' });
  const mk = await A('/api/smb/mkdir', { ...NAS, share: 'Skogen', path: '', name: '[06] Mangler' });
  assert.equal(mk.status, 200, mk.text);
  assert.equal(mk.body.writable, true);
  const bad = await A('/api/smb/mkdir', { ...NAS, share: 'Skogen', path: '', name: 'a;b' });
  assert.deepEqual([bad.status, bad.body.kind, bad.body.char], [400, 'name', ';']);
  // Får ikke kontakt (vert som ikke svarer) → connect.
  fb._setSmbExec(async () => ({ code: 1, stdout: '', stderr: 'Connection to nas.local failed (Error NT_STATUS_HOST_UNREACHABLE)' }));
  const cn = await A('/api/smb/list', { ...NAS, share: 'Skogen', path: '' });
  assert.equal(cn.body.kind, 'connect');
  assert.equal(cn.body.detail, 'host');
  fb._setSmbExec(async (args, o) => mock.mockSmbExec(args, o));
  // POST /api/smb/shares {host, user, pass} lister de delte ressursene.
  const sh = await A('/api/smb/shares', { host: 'nas.local', user: 'sebastian', pass: 'hemmelig-nas-pw' });
  assert.equal(sh.status, 200, sh.text);
  assert.ok(sh.body.shares.some((s) => s.name === 'Skogen'));
  const wrong = await A('/api/smb/shares', { host: 'nas.local', user: 'sebastian', pass: 'feil' });
  assert.equal(wrong.body.kind, 'auth');
});
