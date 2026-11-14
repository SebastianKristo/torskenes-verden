// Prompt 90 (BKUP90): gjenopprett fra en backupfil på PC-en. POST /api/backup/upload (bare admin med økt i nettleseren),
// strømmet til disk i biter, sjekket (tar-hoder, manifest, sha256, kryptering) og lagt i backup_jobs som kind 'upload';
// gjenoppretting går via den vanlige POST /api/backup/restore. Også backup fra en eldre versjon (skjemaforskjeller).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p90-'));
process.env.BACKUP_DIR = join(process.env.DATA_DIR, 'sb');
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-90';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.BACKUP_COMPRESS = 'gz';
delete process.env.MOCK_DATA;
delete process.env.OLLAMA_URL;
delete process.env.BACKUP_UPLOAD_MAX;
process.env.BACKUP_UPLOAD_RATE = '1000'; // rate-begrensningen testes for seg
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

const { default: app } = await import('../server/index.js');
const sb = await import('../server/system-backup.js');
const { tarHeader } = await import('../server/finans/backup.js');
const { db, kv, OWNER } = await import('../server/db.js');
const { default: Database } = await import('better-sqlite3');
const DATA = process.env.DATA_DIR, BDIR = process.env.BACKUP_DIR;

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* binær */ }
  return { status: r.status, body: json, buf };
};
const cookieA = await login('sebastian', 'testpassord1');
const A = client({ cookie: cookieA });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const cookieK = await login('kari', 'kariPassord123');
const tokW = (await A('/finans/api/tokens', 'POST', { name: 'Pixel', scopes: ['finance:read', 'finance:write'] })).body.token;

/** Laster opp buf som name, i biter på chunk byte (som nettsiden). → siste svar {status, body} */
async function upload(buf, name, { cookie = cookieA, chunk = 1 << 30, headers = {}, size = buf.length } = {}) {
  let id = null, off = 0, last;
  do {
    const part = buf.subarray(off, off + chunk);
    const r = await app.request('/api/backup/upload', { method: 'POST', body: part, headers: { cookie, 'content-type': 'application/octet-stream', 'x-backup-filename': encodeURIComponent(name),
      'x-upload-size': String(size), ...(id ? { 'x-upload-id': id, 'x-upload-offset': String(off) } : {}), ...headers } });
    last = { status: r.status, body: await r.json().catch(() => null) };
    if (r.status === 202) { id = last.body.uploadId; off = last.body.received; } else break;
  } while (off < buf.length);
  return last;
}
const waitIdle = async () => { for (let i = 0; i < 600 && sb.backupRunning(); i++) await new Promise((r) => setTimeout(r, 10)); };
const runBackup = async (b) => { const r = await A('/api/backup/run', 'POST', b); assert.equal(r.status, 202, JSON.stringify(r.body)); await waitIdle(); return r.body.id; };
const download = async (id) => { const d = await A(`/api/backup/${id}/download`); assert.equal(d.status, 200); return d.buf; };
/** Fjerner backupen fra serveren (rad, fil, manifest) – som om den bare finnes på PC-en. */
const forget = (id) => { for (const f of readdirSync(BDIR)) if (f.startsWith(id)) rmSync(join(BDIR, f)); db.prepare('DELETE FROM backup_jobs WHERE id=?').run(id); };
const leftovers = () => readdirSync(BDIR).filter((f) => /^\.upload-|\.part$/.test(f));
const ev = (title) => [{ id: 'loc-p90aaaaaaa', title, allDay: true, date: '2026-12-24', start: null, end: null, endDate: null, location: '', calendar: 'privat', repeat: 'none', reminder: 'none', note: '' }];

/** Tar-arkiv (gzip) av [{name, data, type?}] med vanlig tar-hode; type endrer typeflagget (f.eks. '2' = symlink). */
function tarGz(entries) {
  const parts = [];
  for (const e of entries) {
    const data = Buffer.from(e.data ?? '');
    const h = tarHeader(e.name, data.length, Date.now());
    if (e.type) {
      h[156] = e.type.charCodeAt(0);
      if (e.link) h.write(e.link, 157, 100);
      h.write('        ', 148); let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    }
    parts.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const manifestOf = (files, extra = {}) => JSON.stringify({ format: 'homelab-system-backup', formatVersion: 1, version: '1.0.0', created: '2026-01-02T03:04:05.000Z', scope: 'custom', modules: ['bursdager'], tables: { bursdager: ['birthdays'] }, dirs: {}, files, ...extra });
const sqliteBytes = async () => { const p = join(DATA, 'p90-tmp.db'); await db.backup(p); const b = readFileSync(p); rmSync(p); return b; };

test('last ned → slett fra serveren → last opp (i biter) → gjenopprett: dataene er tilbake', async () => {
  kv.set(OWNER, 'kal_local_events', ev('Fra PC-en'));
  db.prepare("INSERT INTO birthdays(user_id,name,month,day,year,relation,reminder_days,source,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)").run(OWNER, 'P90 Person', 3, 3, 1990, 'venn', 1, 'local', Date.now(), Date.now());
  mkdirSync(join(DATA, 'uploads'), { recursive: true });
  writeFileSync(join(DATA, 'uploads', 'p90.txt'), 'original');
  const id = await runBackup({ scope: 'all' });
  const file = await download(id);
  forget(id);
  // Alt endres etterpå
  kv.set(OWNER, 'kal_local_events', []);
  db.prepare("DELETE FROM birthdays WHERE name='P90 Person'").run();
  writeFileSync(join(DATA, 'uploads', 'p90.txt'), 'endret');

  const up = await upload(file, `${id}.tar.gz`, { chunk: 64 * 1024 });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.match(up.body.id, /^bk-\d{8}-\d{6}-[0-9a-f]{6}$/);
  assert.notEqual(up.body.id, id); // ny id med dagens tid
  assert.equal(up.body.id.slice(3, 11), new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  assert.deepEqual([up.body.scope, up.body.encrypted, up.body.needKey], ['all', false, false]);
  assert.deepEqual(up.body.modules, sb.MODULE_IDS);
  assert.match(up.body.created, /^\d{4}-\d\d-\d\dT/);
  assert.equal(up.body.size, file.length);
  assert.deepEqual(leftovers(), []);
  const row = db.prepare('SELECT * FROM backup_jobs WHERE id=?').get(up.body.id);
  assert.deepEqual([row.kind, row.state, row.encrypted, row.sha256, row.size], ['upload', 'done', 0, sha(file), file.length]);
  assert.equal(row.file, `${up.body.id}.tar.gz`);
  const item = (await A('/api/backup/list')).body.find((x) => x.id === up.body.id);
  assert.deepEqual([item.kind, item.uploaded, item.ok, item.needKey], ['upload', true, true, false]);
  // «Siste backup» er fortsatt en ekte backup, ikke opplastingen
  assert.notEqual((await A('/api/backup/status')).body.last?.id, up.body.id);

  // Gjenoppretting via den vanlige veien: passord kreves, sikkerhetskopi først
  assert.equal((await A('/api/backup/restore', 'POST', { id: up.body.id, password: 'feil' })).status, 403);
  const r = await A('/api/backup/restore', 'POST', { id: up.body.id, modules: ['kalender', 'bursdager', 'filer'], password: 'testpassord1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.safetyId, /^bk-/);
  assert.equal(kv.get(OWNER, 'kal_local_events')[0].title, 'Fra PC-en');
  assert.equal(db.prepare("SELECT count(*) FROM birthdays WHERE name='P90 Person'").pluck().get(), 1);
  assert.equal(readFileSync(join(DATA, 'uploads', 'p90.txt'), 'utf8'), 'original');
  // Hele backupen (uten modules) virker også, og økten overlever
  const all = await A('/api/backup/restore', 'POST', { id: up.body.id, password: 'testpassord1' });
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.equal((await A('/api/backup/settings')).status, 200);
});

test('kryptert: kjent nøkkel sjekkes ved opplasting; ukjent nøkkel → needKey, feil nøkkel avvises, riktig gir dataene', async () => {
  const k = await A('/api/backup/key', 'POST', {});
  assert.equal(k.status, 200);
  assert.equal((await A('/api/backup/settings', 'PUT', { encrypt: true })).status, 200);
  kv.set(OWNER, 'kal_local_events', ev('Kryptert P90'));
  const id = await runBackup({ scope: 'custom', modules: ['kalender'] });
  const file = await download(id);
  assert.equal(file.subarray(0, 6).toString(), 'FHBK1\n');
  forget(id);

  // Serveren kjenner nøkkelen
  const known = await upload(file, `${id}.tar.gz.enc`);
  assert.equal(known.status, 200, JSON.stringify(known.body));
  assert.deepEqual([known.body.encrypted, known.body.needKey, known.body.scope], [true, false, 'custom']);
  assert.deepEqual(known.body.modules, ['kalender']);
  assert.equal(JSON.stringify(known.body).includes(k.body.key), false);
  kv.set(OWNER, 'kal_local_events', []);
  assert.equal((await A('/api/backup/restore', 'POST', { id: known.body.id, password: 'testpassord1' })).status, 200);
  assert.equal(kv.get(OWNER, 'kal_local_events')[0].title, 'Kryptert P90');

  // Ny installasjon: serveren har ikke nøkkelen
  const saved = { keys: kv.get(OWNER, 'sys_backup_keys'), cur: kv.get(OWNER, 'sys_backup_key_current') };
  kv.set(OWNER, 'sys_backup_keys', {});
  try {
    const up = await upload(file, 'homelab-backup fra PC.tar.gz.enc');
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.deepEqual([up.body.encrypted, up.body.needKey, up.body.modules], [true, true, []]);
    assert.equal((await A('/api/backup/list')).body.find((x) => x.id === up.body.id).needKey, true);
    kv.set(OWNER, 'kal_local_events', []);
    const miss = await A('/api/backup/restore', 'POST', { id: up.body.id, password: 'testpassord1' });
    assert.equal(miss.status, 400);
    assert.equal(miss.body.needKey, true);
    const wrong = await A('/api/backup/restore', 'POST', { id: up.body.id, password: 'testpassord1', key: 'feil-feil-feil-feil' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.needKey, true);
    assert.deepEqual(kv.get(OWNER, 'kal_local_events'), []); // ingenting endret
    assert.equal((await A('/api/backup/restore', 'POST', { id: up.body.id, modules: ['finans'], password: 'testpassord1', key: k.body.key })).status, 400); // ikke i backupen
    const ok = await A('/api/backup/restore', 'POST', { id: up.body.id, password: 'testpassord1', key: k.body.key });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.modules, ['kalender']);
    assert.equal(kv.get(OWNER, 'kal_local_events')[0].title, 'Kryptert P90');
    // Raden har fått modulene fra manifestet
    const item = (await A('/api/backup/list')).body.find((x) => x.id === up.body.id);
    assert.deepEqual(item.modules, ['kalender']);
    assert.equal(item.scope, 'custom');
    // Ikke-kryptert fil med .enc-navn og en kryptert fil uten .enc avvises
    assert.equal((await upload(gzipSync(Buffer.alloc(2048)), 'x.tar.gz.enc')).status, 400);
    assert.equal((await upload(file, 'x.tar.gz')).status, 400);
  } finally {
    kv.set(OWNER, 'sys_backup_keys', saved.keys); kv.set(OWNER, 'sys_backup_key_current', saved.cur);
    assert.equal((await A('/api/backup/settings', 'PUT', { encrypt: false })).status, 200);
  }
  // Skadet kryptert fil (kjent nøkkel, en byte endret midt i) avvises
  const bad = Buffer.from(file); bad[Math.floor(bad.length / 2)] ^= 0xff;
  const r = await upload(bad, 'skadet.tar.gz.enc');
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.deepEqual(leftovers(), []);
});

test('ugyldige arkiver avvises og rydder etter seg: path traversal, absolutt sti, symlink, ikke tar, ikke gzip, feil manifest, sjekksum', async () => {
  const before = db.prepare('SELECT count(*) FROM backup_jobs').pluck().get();
  const dbb = await sqliteBytes();
  const good = [{ name: 'db/homelab.db', data: dbb }, { name: 'manifest.json', data: manifestOf({ 'db/homelab.db': sha(dbb) }) }];
  // Kontroll: det gyldige arkivet går gjennom
  const ok = await upload(tarGz(good), 'egen.tar.gz');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.modules, ['bursdager']);
  assert.equal(ok.body.version, '1.0.0');
  forget(ok.body.id);
  const cases = [
    ['path traversal', tarGz([{ name: '../../evil.txt', data: 'x' }, ...good]), /Ugyldig sti/],
    ['traversal i files/', tarGz([{ name: 'files/uploads/../../../evil', data: 'x' }, ...good]), /Ugyldig sti/],
    ['absolutt sti', tarGz([{ name: '/etc/passwd', data: 'x' }, ...good]), /Ugyldig sti/],
    ['symlink', tarGz([{ name: 'files/uploads/lenke', type: '2', link: '/etc/passwd' }, ...good]), /lenke/i],
    ['hardlink', tarGz([{ name: 'files/uploads/hard', type: '1', link: 'db/homelab.db' }, ...good]), /lenke/i],
    ['ukjent type', tarGz([{ name: 'files/uploads/dev', type: '3' }, ...good]), /Ukjent oppføring/],
    ['uventet fil', tarGz([{ name: 'etc/x', data: 'x' }, ...good]), /Uventet fil/],
    ['ikke tar', gzipSync(Buffer.from('dette er ikke et tar-arkiv'.repeat(40))), /tar-arkiv/],
    ['ikke gzip', Buffer.from('hei, jeg er bare tekst'.repeat(10)), /gzip/],
    ['mangler manifest', tarGz([good[0]]), /manifest\.json/],
    ['feil format', tarGz([good[0], { name: 'manifest.json', data: JSON.stringify({ format: 'noe-annet', files: {} }) }]), /Ukjent backupformat/],
    ['FinansHub-arkiv', tarGz([{ name: 'homelab.db', data: dbb }, { name: 'manifest.json', data: '{"format":"homelab-backup"}' }]), /Uventet fil/],
    ['feil sjekksum', tarGz([good[0], { name: 'manifest.json', data: manifestOf({ 'db/homelab.db': 'a'.repeat(64) }) }]), /Sjekksummen/],
    ['fil utenfor manifestet', tarGz([...good, { name: 'files/uploads/snik.txt', data: 'x' }]), /står ikke i manifestet/],
    ['ikke SQLite', tarGz([{ name: 'db/homelab.db', data: 'tekst' }, { name: 'manifest.json', data: manifestOf({ 'db/homelab.db': sha(Buffer.from('tekst')) }) }]), /SQLite/],
    ['avkortet', tarGz(good).subarray(0, 600), /pakkes ut|avkortet/],
  ];
  for (const [what, buf, re] of cases) {
    const r = await upload(buf, 'test.tar.gz');
    assert.equal(r.status, 400, `${what}: ${JSON.stringify(r.body)}`);
    assert.match(r.body.error, re, what);
  }
  // Filnavnet avgjør bare formatet og brukes aldri som sti
  assert.equal((await upload(tarGz(good), 'backup.zip')).status, 400);
  const p = await upload(tarGz(good), '../../../../etc/bk.tar.gz');
  assert.equal(p.status, 200);
  assert.equal(db.prepare('SELECT file FROM backup_jobs WHERE id=?').pluck().get(p.body.id), `${p.body.id}.tar.gz`);
  assert.equal(existsSync(join(BDIR, `${p.body.id}.tar.gz`)), true);
  forget(p.body.id);
  assert.deepEqual(leftovers(), []);
  assert.equal(db.prepare('SELECT count(*) FROM backup_jobs').pluck().get(), before);
});

test('tilgang: bare admin med økt i nettleseren; header kreves; rekkefølge for biter', async () => {
  const buf = tarGz([{ name: 'manifest.json', data: '{}' }]);
  assert.equal((await upload(buf, 'x.tar.gz', { cookie: cookieK })).status, 403);
  const tok = await app.request('/api/backup/upload', { method: 'POST', body: buf, headers: { authorization: `Bearer ${tokW}`, 'content-type': 'application/octet-stream', 'x-backup-filename': 'x.tar.gz', 'x-upload-size': String(buf.length) } });
  assert.equal(tok.status, 403);
  const anon = await app.request('/api/backup/upload', { method: 'POST', body: buf, headers: { 'content-type': 'application/octet-stream', 'x-backup-filename': 'x.tar.gz', 'x-upload-size': String(buf.length) } });
  assert.equal(anon.status, 401);
  // Uten filnavn-header (en vanlig skjema-POST fra et annet nettsted) eller med feil innholdstype
  assert.equal((await upload(buf, '', {})).status, 400);
  assert.equal((await app.request('/api/backup/upload', { method: 'POST', body: buf, headers: { cookie: cookieA, 'content-type': 'text/plain', 'x-backup-filename': 'x.tar.gz' } })).status, 415);
  assert.equal((await upload(buf, 'x.tar.gz', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  // En bit på feil posisjon, eller til en ukjent opplasting
  const big = Buffer.alloc(5000, 1);
  const first = await app.request('/api/backup/upload', { method: 'POST', body: big.subarray(0, 1000), headers: { cookie: cookieA, 'content-type': 'application/octet-stream', 'x-backup-filename': 'x.tar.gz', 'x-upload-size': '5000' } });
  assert.equal(first.status, 202);
  const { uploadId } = await first.json();
  const wrongOff = await app.request('/api/backup/upload', { method: 'POST', body: big.subarray(0, 1000), headers: { cookie: cookieA, 'content-type': 'application/octet-stream', 'x-upload-id': uploadId, 'x-upload-offset': '0' } });
  assert.equal(wrongOff.status, 409);
  assert.equal((await app.request('/api/backup/upload', { method: 'POST', body: big, headers: { cookie: cookieK, 'content-type': 'application/octet-stream', 'x-upload-id': uploadId, 'x-upload-offset': '1000' } })).status, 403);
  assert.equal((await app.request('/api/backup/upload', { method: 'POST', body: big, headers: { cookie: cookieA, 'content-type': 'application/octet-stream', 'x-upload-id': 'f'.repeat(24), 'x-upload-offset': '1000' } })).status, 404);
  sb._uploads.reset();
  assert.deepEqual(leftovers(), []);
});

test('for stor fil: 413 (oppgitt størrelse over BACKUP_UPLOAD_MAX, eller mer data enn oppgitt)', async () => {
  process.env.BACKUP_UPLOAD_MAX = '1k';
  try {
    assert.equal(sb.uploadMax(), 1000);
    const r = await upload(Buffer.alloc(2000), 'stor.tar.gz');
    assert.equal(r.status, 413);
    assert.match(r.body.error, /for stor/);
  } finally { delete process.env.BACKUP_UPLOAD_MAX; }
  assert.equal(sb.uploadMax(), 20e9);
  const lie = await upload(Buffer.alloc(3000), 'løgn.tar.gz', { size: 100 });
  assert.equal(lie.status, 413);
  assert.deepEqual(leftovers(), []);
});

test('rate-begrensning: mange nye opplastinger på kort tid gir 429', async () => {
  sb._uploads.reset();
  process.env.BACKUP_UPLOAD_RATE = '3';
  try {
    for (let i = 0; i < 3; i++) assert.equal((await upload(Buffer.from('x'), 'a.tar.gz')).status, 400);
    const r = await upload(Buffer.from('x'), 'a.tar.gz');
    assert.equal(r.status, 429);
  } finally { process.env.BACKUP_UPLOAD_RATE = '1000'; sb._uploads.reset(); }
});

test('backup fra en eldre versjon: manglende/nye kolonner og tabeller håndteres (snitt, NOT NULL fylles, ukjente hoppes over)', async () => {
  db.prepare("DELETE FROM birthdays WHERE name LIKE 'Gammel%'").run();
  // En «gammel» database: birthdays uten created/ha_uid (NOT NULL uten standard her), en tabell denne versjonen ikke kjenner,
  // og en kolonne som er fjernet i ny versjon.
  const p = join(DATA, 'gammel.db');
  await db.backup(p);
  const o = new Database(p);
  o.exec("DELETE FROM birthdays; ALTER TABLE birthdays DROP COLUMN created; ALTER TABLE birthdays DROP COLUMN ha_uid; ALTER TABLE birthdays ADD COLUMN gammel_kolonne TEXT;");
  o.prepare("INSERT INTO birthdays(user_id,name,month,day,year,relation,reminder_days,source,updated,gammel_kolonne) VALUES(?,?,?,?,?,?,?,?,?,?)").run(OWNER, 'Gammel Person', 7, 7, 1970, 'familie', 2, 'local', 1, 'x');
  o.exec('CREATE TABLE cal_fremtid (id INTEGER PRIMARY KEY, x TEXT); INSERT INTO cal_fremtid(x) VALUES (1)');
  const quick = o.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cal\\_%' ESCAPE '\\' AND name<>'cal_fremtid'").pluck().all();
  for (const t of quick) o.exec(`DROP TABLE "${t}"`);
  o.close();
  const dbb = readFileSync(p); rmSync(p);
  const buf = tarGz([{ name: 'db/homelab.db', data: dbb }, { name: 'manifest.json', data: manifestOf({ 'db/homelab.db': sha(dbb) }, { version: '0.9.0', modules: ['bursdager', 'kalender', 'gammelmodul'], tables: { bursdager: ['birthdays'], kalender: ['cal_fremtid'] } }) }]);
  const up = await upload(buf, 'gammel.tar.gz');
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.deepEqual(up.body.modules, ['kalender', 'bursdager']);
  assert.deepEqual(up.body.ignored, ['gammelmodul']);
  const r = await A('/api/backup/restore', 'POST', { id: up.body.id, modules: ['bursdager', 'kalender'], password: 'testpassord1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = db.prepare("SELECT * FROM birthdays WHERE name='Gammel Person'").get();
  assert.ok(row, 'raden fra den gamle backupen er tilbake');
  assert.deepEqual([row.created, row.ha_uid, row.relation, row.month], [0, null, 'familie', 7]);
  assert.ok(r.body.skipped.some((x) => x.table === 'cal_fremtid' && /finnes ikke/.test(x.reason)), JSON.stringify(r.body.skipped));
  if (quick.length) assert.ok(r.body.skipped.some((x) => x.table === quick[0] && /beholdt/.test(x.reason)));
  assert.ok(r.body.messages.some((m) => /birthdays: .*created.*gammel_kolonne/.test(m)), JSON.stringify(r.body.messages));
  assert.equal(db.prepare("SELECT count(*) FROM sqlite_master WHERE name='cal_fremtid'").pluck().get(), 0);
  db.prepare("DELETE FROM birthdays WHERE name='Gammel Person'").run();
});
