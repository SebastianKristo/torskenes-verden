// Prompt 29 (SERVER29): rask time (jobbkø med falsk Ollama, angre), brukervalg (search_engine, calendar_web_layout) og
// systembackup (admin/ikke-admin, kjør → liste → modul-gjenoppretting, rotasjon, kryptering, sky med SigV4, stier).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p29-'));
process.env.BACKUP_DIR = join(process.env.DATA_DIR, 'sb');
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-29';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1'; // lokale hendelser i Privat uten Google
process.env.BACKUP_COMPRESS = 'gz';
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const quick = await import('../server/calendar-quick.js');
const sb = await import('../server/system-backup.js');
const { db, kv, OWNER } = await import('../server/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* binær */ }
  return { status: r.status, body: json, buf, headers: r.headers };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const tokR = (await A('/finans/api/tokens', 'POST', { name: 'iPhone', scopes: ['finance:read'] })).body.token;
const tokW = (await A('/finans/api/tokens', 'POST', { name: 'Pixel', scopes: ['finance:read', 'finance:write'] })).body.token;
const TR = client({ authorization: `Bearer ${tokR}` });
const TW = client({ authorization: `Bearer ${tokW}` });
assert.ok(tokR && tokW);

/* ---------------- Rask time ---------------- */

const eventsOn = async (C, date) => (await C(`/api/kalender?from=${date}&to=${date}`)).body.events;

test('parse-endepunktet bruker den felles tolkeren', async () => {
  const r = await A('/api/kalender/quick/parse', 'POST', { text: 'time hos Nina frisør 14.30 25.09', today: '2026-09-01' });
  assert.equal(r.status, 200);
  assert.deepEqual({ t: r.body.title, d: r.body.date, s: r.body.start, e: r.body.end, l: r.body.label, a: r.body.isAppointment },
    { t: 'Nina frisør', d: '2026-09-25', s: '14:30', e: '15:15', l: 'fre 25. sep · 14:30', a: true });
  assert.equal((await A('/api/kalender/quick/parse', 'POST', {})).status, 400);
  assert.equal((await TR('/api/kalender/quick/parse', 'POST', { text: 'lege i morgen kl 9' })).status, 401); // skriving krever finance:write
  assert.equal((await TW('/api/kalender/quick/parse', 'POST', { text: 'lege i morgen kl 9' })).status, 200);
});

test('jobbkø: Ollama brukes når sikker, ellers parseQuick; hendelse i Privat med varsel og kilde', async () => {
  const prompts = [];
  quick._setQuickOllama(async (prompt) => { prompts.push(prompt); return { tittel: 'Nina frisør', dato: '2026-10-23', start: '14:30', slutt: null, sted: 'Bogstadveien 1', type: 'frisør', sikkerhet: 0.9 }; });
  const r = await A('/api/kalender/quick', 'POST', { text: 'time hos Nina frisør fredag 14.30' });
  assert.equal(r.status, 202);
  assert.match(r.body.jobId, /^q[0-9a-f]{12}$/);
  await quick._drain();
  assert.match(prompts[0], /^Dagens dato er \d{4}-\d{2}-\d{2} \([a-zæøå]+\)\. Tidssone Europe\/Oslo\./);
  assert.match(prompts[0], /Ikke finn på tid eller dato\./);
  assert.match(prompts[0], /time hos Nina frisør fredag 14\.30/);
  const jobs = (await A('/api/kalender/quick/jobs')).body;
  const j = jobs.find((x) => x.id === r.body.jobId);
  assert.equal(j.state, 'done');
  assert.equal(j.engine, 'ollama');
  // Prompt 47: datoen kommer fra den felles datoparseren (teksten sier «fredag»), ikke fra modellens faste '2026-10-23'.
  const D47 = await import('../server/glimt45/dates.js');
  const fri = D47.whenOf45('fredag 14.30', D47.todayOslo45(), { timeWithoutDate: 'none' }).date;
  const MON3 = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
  assert.deepEqual({ ...j.result, eventId: !!j.result.eventId }, { eventId: true, title: 'Nina frisør', date: fri, start: '14:30', end: '15:15', place: 'Bogstadveien 1', label: `fre ${+fri.slice(8)}. ${MON3[+fri.slice(5, 7) - 1]} · 14:30` });
  const ev = (await eventsOn(A, fri)).find((e) => e.id === j.result.eventId);
  assert.ok(ev);
  assert.equal(ev.calendar, 'privat');
  assert.equal(ev.reminder, '1h');
  assert.equal(ev.origin, 'AI · rask time');
  assert.equal(ev.time, '14:30–15:15');

  // Lav sikkerhet → lokal tolker
  quick._setQuickOllama(async () => ({ tittel: 'Noe', dato: '2026-12-01', start: '10:00', type: 'annet', sikkerhet: 0.3 }));
  const r2 = await A('/api/kalender/quick', 'POST', { text: 'Tannlege 12.11.2026 kl. 08:30. Adresse: Kirkeveien 64, 0364 Oslo. Husk å avbestille senest 24 timer før, ellers blir du fakturert.' });
  await quick._drain();
  const j2 = (await A('/api/kalender/quick/jobs')).body.find((x) => x.id === r2.body.jobId);
  assert.equal(j2.engine, 'lokal');
  assert.equal(j2.result.title, 'Tannlege');
  assert.equal(j2.result.date, '2026-11-12');
  assert.equal(j2.result.end, '09:30');
  const ev2 = (await eventsOn(A, '2026-11-12')).find((e) => e.id === j2.result.eventId);
  assert.equal(ev2.room, 'Kirkeveien 64, 0364 Oslo');
  assert.match(ev2.note, /avbestille/); // lang tekst i notat

  // Ollama nede → lokal tolker
  quick._setQuickOllama(async () => { throw new Error('Ollama kan ikke nås'); });
  const r3 = await A('/api/kalender/quick', 'POST', { text: 'frisør 25.12.2026 kl 11' });
  await quick._drain();
  const j3 = (await A('/api/kalender/quick/jobs')).body.find((x) => x.id === r3.body.jobId);
  assert.equal(j3.state, 'done');
  assert.equal(j3.engine, 'lokal');
  assert.equal(j3.result.label, 'fre 25. des · 11:00');

  // Uten dato → feilet med det som ble funnet
  quick._setQuickOllama(async () => ({ tittel: 'Nina', dato: null, start: '14:30', type: 'frisør', sikkerhet: 0.9 }));
  const r4 = await A('/api/kalender/quick', 'POST', { text: 'time hos Nina frisør 14.30' });
  await quick._drain();
  const j4 = (await A('/api/kalender/quick/jobs')).body.find((x) => x.id === r4.body.jobId);
  assert.equal(j4.state, 'failed');
  assert.match(j4.error, /Fant ikke dato/);
  assert.deepEqual({ t: j4.found.title, s: j4.found.start, d: j4.found.date, n: j4.found.note }, { t: 'Nina frisør', s: '14:30', d: null, n: 'time hos Nina frisør 14.30' });
  quick._setQuickOllama(null);

  assert.equal((await A('/api/kalender/quick', 'POST', { text: '' })).status, 400);
  assert.equal((await A('/api/kalender/quick', 'POST', { text: 'x'.repeat(4001) })).status, 400);
  assert.ok(jobs.length <= 20);
  // Per bruker
  assert.equal((await K('/api/kalender/quick/jobs')).body.length, 0);
});

test('angre sletter hendelsen jobben laget', async () => {
  quick._setQuickOllama(null);
  const r = await A('/api/kalender/quick', 'POST', { text: 'lege 30.11.2026 kl 10' });
  await quick._drain();
  const j = (await A('/api/kalender/quick/jobs')).body.find((x) => x.id === r.body.jobId);
  assert.ok((await eventsOn(A, '2026-11-30')).some((e) => e.id === j.result.eventId));
  assert.equal((await K(`/api/kalender/quick/${j.id}/undo`, 'POST', {})).status, 404); // andres jobb
  assert.equal((await A('/api/kalender/quick/../undo', 'POST', {})).status, 404);
  assert.equal((await A('/api/kalender/quick/qXYZ/undo', 'POST', {})).status, 400);
  const u = await A(`/api/kalender/quick/${j.id}/undo`, 'POST', {});
  assert.deepEqual(u.body, { ok: true });
  assert.ok(!(await eventsOn(A, '2026-11-30')).some((e) => e.id === j.result.eventId));
  assert.equal((await A(`/api/kalender/quick/${j.id}/undo`, 'POST', {})).status, 409);
});

test('fromOllama validerer svaret', () => {
  assert.equal(quick.fromOllama({ tittel: 'X', dato: '2026-02-30', sikkerhet: 0.9 }), null);
  assert.equal(quick.fromOllama({ tittel: 'X', dato: '2026-02-03', sikkerhet: 0.59 }), null);
  assert.equal(quick.fromOllama({ tittel: '', dato: '2026-02-03', sikkerhet: 0.9 }), null);
  const r = quick.fromOllama({ tittel: 'Psykolog', dato: '2026-02-03', start: '25:00', type: 'ukjent', sikkerhet: 1 });
  assert.equal(r.start, null);
  assert.equal(r.allDay, true);
  assert.equal(r.type, 'annet');
  assert.equal(quick.fromOllama({ tittel: 'P', dato: '2026-02-03', start: '10:00', type: 'psykolog', sikkerhet: 0.8 }).end, '10:50');
});

/* ---------------- Brukervalg ---------------- */

test('search_engine og calendar_web_layout i /api/me/layout', async () => {
  const g = (await K('/api/me/layout')).body;
  assert.equal(g.search_engine, 'ai');
  assert.equal(g.calendar_web_layout, 'menu');
  assert.equal((await K('/api/me/layout', 'PUT', { search_engine: 'bing' })).status, 400);
  assert.equal((await K('/api/me/layout', 'PUT', { calendar_web_layout: 'max' })).status, 400);
  const p = (await K('/api/me/layout', 'PUT', { search_engine: 'ddg', calendar_web_layout: 'full' })).body;
  assert.equal(p.search_engine, 'ddg');
  assert.equal(p.calendar_web_layout, 'full');
  assert.equal((await K('/api/me/layout')).body.search_engine, 'ddg');
  assert.equal((await A('/api/me/layout')).body.search_engine, 'ai'); // per bruker
});

/* ---------------- Systembackup ---------------- */

const waitIdle = async () => { for (let i = 0; i < 400 && sb.backupRunning(); i++) await new Promise((r) => setTimeout(r, 10)); };
const runBackup = async (C, b = {}) => { const r = await C('/api/backup/run', 'POST', b); assert.equal(r.status, 202, JSON.stringify(r.body)); await waitIdle(); return r.body.id; };
const DATA = process.env.DATA_DIR;

test('bare admin; GET med app-token, endringer med økt eller skrive-token', async () => {
  assert.equal((await K('/api/backup/settings')).status, 403);
  assert.equal((await K('/api/backup/list')).status, 403);
  assert.equal((await K('/api/backup/run', 'POST', {})).status, 403);
  assert.equal((await client({})('/api/backup/status')).status, 401);
  assert.equal((await TR('/api/backup/settings')).status, 200);
  assert.equal((await TR('/api/backup/run', 'POST', {})).status, 401); // lesetoken kan ikke kjøre
  const s = (await A('/api/backup/settings')).body;
  assert.deepEqual(Object.keys(s).slice(0, 9), ['auto', 'schedule', 'keep', 'notifyFail', 'scope', 'modules', 'target', 'cloud', 'encrypt']);
  assert.equal(s.auto, true);
  assert.equal(s.schedule, 'nightly');
  assert.equal(s.cloud.enabled, false);
  assert.equal(s.keySet, false);
  assert.equal(s.target.local, true);
  assert.equal(s.target.path, process.env.BACKUP_DIR);
  assert.deepEqual(s.moduleList.map((m) => m.id), ['finans', 'kalender', 'familie', 'mat', 'sporing', 'huske', 'bursdager', 'chat', 'domener', 'innstillinger', 'filer']);
  // Skjema-POST med økt uten JSON avvises
  const form = await app.request('/api/backup/run', { method: 'POST', headers: { cookie: (await login('sebastian', 'testpassord1')), 'content-type': 'application/x-www-form-urlencoded' }, body: 'scope=all' });
  assert.equal(form.status, 415);
  assert.equal((await A('/api/backup/settings', 'PUT', { schedule: 'hver dag' })).status, 400);
  assert.equal((await A('/api/backup/settings', 'PUT', { target: { path: '/etc' } })).status, 400);
  assert.equal((await A('/api/backup/settings', 'PUT', { encrypt: true })).status, 409); // nøkkel først
  assert.equal((await A('/api/backup/settings', 'PUT', { cloud: { enabled: true, provider: 'b2', bucket: 'min-bucket', endpoint: 's3.eu-central-003.backblazeb2.com' } })).status, 400); // ikke ukryptert til sky
  assert.equal((await A('/api/backup/settings', 'PUT', { scope: 'custom', modules: [] })).status, 400);
  const p = (await TW('/api/backup/settings', 'PUT', { schedule: 'weekly', keep: '90d' })).body;
  assert.equal(p.schedule, 'weekly');
  assert.equal(p.keep, '90d');
  assert.match((await A('/api/backup/status')).body.summary, /^Hver uke \(søndag\) · Hele systemet$/);
});

test('kjør → liste → modul-gjenoppretting gir dataene tilbake', async () => {
  // Data i kalender (kv), bursdager (tabell), filer (mappe) og finans (kv)
  kv.set(OWNER, 'kal_local_events', [{ id: 'loc-aaaaaaaaaa', title: 'Gammel avtale', allDay: true, date: '2026-12-24', start: null, end: null, endDate: null, location: '', calendar: 'privat', repeat: 'none', reminder: 'none', note: '' }]);
  const bdBefore = db.prepare('SELECT count(*) FROM birthdays').pluck().get();
  db.prepare("INSERT INTO birthdays(user_id,name,month,day,year,relation,reminder_days,source,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)").run(OWNER, 'Testperson', 5, 5, 2000, 'venn', 1, 'local', Date.now(), Date.now());
  mkdirSync(join(DATA, 'uploads'), { recursive: true });
  writeFileSync(join(DATA, 'uploads', 'p29.txt'), 'original');
  kv.set(OWNER, 'fh_p29', { v: 1 });

  const id = await runBackup(A, { scope: 'custom', modules: ['kalender', 'bursdager', 'filer'] });
  assert.match(id, /^bk-\d{8}-\d{6}-[0-9a-f]{6}$/);
  const list = (await TR('/api/backup/list')).body;
  const b = list.find((x) => x.id === id);
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.deepEqual(b.modules, ['kalender', 'bursdager', 'filer']);
  assert.equal(b.scope, 'custom');
  assert.equal(b.encrypted, false);
  assert.ok(b.size > 0);
  assert.match(b.at, /^\d{4}-\d{2}-\d{2}T/);
  const st = (await A('/api/backup/status')).body;
  assert.equal(st.last.id, id);
  assert.equal(st.last.pct, 100);
  assert.equal(st.running, null);

  // Endre alt
  kv.set(OWNER, 'kal_local_events', []);
  db.prepare("DELETE FROM birthdays WHERE name='Testperson'").run();
  writeFileSync(join(DATA, 'uploads', 'p29.txt'), 'endret');
  writeFileSync(join(DATA, 'uploads', 'ny.txt'), 'ny');
  kv.set(OWNER, 'fh_p29', { v: 2 });

  assert.equal((await A('/api/backup/restore', 'POST', { id, modules: ['kalender'], password: 'feil' })).status, 403);
  assert.equal((await A('/api/backup/restore', 'POST', { id, modules: ['finans'], password: 'testpassord1' })).status, 400); // ikke i backupen
  assert.equal((await A('/api/backup/restore', 'POST', { id: '../' + id, modules: ['kalender'], password: 'testpassord1' })).status, 400);
  assert.equal((await K('/api/backup/restore', 'POST', { id, modules: ['kalender'], password: 'kariPassord123' })).status, 403);

  const r = await A('/api/backup/restore', 'POST', { id, modules: ['kalender', 'filer'], password: 'testpassord1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.reload, true);
  assert.match(r.body.safetyId, /^bk-/);
  assert.deepEqual(kv.get(OWNER, 'kal_local_events').map((e) => e.title), ['Gammel avtale']);
  assert.equal(readFileSync(join(DATA, 'uploads', 'p29.txt'), 'utf8'), 'original');
  assert.equal(existsSync(join(DATA, 'uploads', 'ny.txt')), false); // mappen byttet ut
  assert.equal(db.prepare("SELECT count(*) FROM birthdays WHERE name='Testperson'").pluck().get(), 0); // ikke valgt
  assert.deepEqual(kv.get(OWNER, 'fh_p29'), { v: 2 }); // finans urørt
  assert.ok(db.prepare('SELECT count(*) FROM birthdays').pluck().get() >= bdBefore);
  // Sikkerhetskopien er full og står i listen
  const safety = (await A('/api/backup/list')).body.find((x) => x.id === r.body.safetyId);
  assert.equal(safety.kind, 'safety');
  assert.equal(safety.scope, 'all');
  assert.equal(safety.ok, true);
  // Bursdager fra den samme backupen
  const r2 = await A('/api/backup/restore', 'POST', { id, modules: ['bursdager'], password: 'testpassord1' });
  assert.equal(r2.status, 200);
  assert.equal(db.prepare("SELECT count(*) FROM birthdays WHERE name='Testperson'").pluck().get(), 1);
  // Hele systemet fra sikkerhetskopien: fh_p29 tilbake til v2 er allerede sant, kal tilbake til tom liste
  const r3 = await A('/api/backup/restore', 'POST', { id: r.body.safetyId, password: 'testpassord1' });
  assert.equal(r3.status, 200, JSON.stringify(r3.body));
  assert.deepEqual(kv.get(OWNER, 'kal_local_events'), []);
  assert.equal(readFileSync(join(DATA, 'uploads', 'p29.txt'), 'utf8'), 'endret');
  // Økten overlever (sessions røres ikke) og brukerne finnes
  assert.equal((await A('/api/backup/settings')).status, 200);
  assert.equal((await K('/api/me/layout')).status, 200);
});

test('nedlasting: økt kreves, id og filnavn valideres', async () => {
  const id = (await A('/api/backup/list')).body.find((x) => x.ok).id;
  const d = await A(`/api/backup/${id}/download`);
  assert.equal(d.status, 200);
  assert.match(d.headers.get('content-disposition'), new RegExp(`attachment; filename="${id}\\.tar\\.gz"`));
  assert.equal(d.buf[0], 0x1f); // gzip
  assert.equal(d.buf[1], 0x8b);
  assert.equal((await TW(`/api/backup/${id}/download`)).status, 403);
  assert.equal((await K(`/api/backup/${id}/download`)).status, 403);
  assert.equal((await A('/api/backup/bk-1/download')).status, 400);
  assert.equal((await A('/api/backup/..%2F..%2Fhomelab.db/download')).status, 400);
  assert.equal((await A('/api/backup/bk-20990101-000000-abcdef/download')).status, 404);
  // Et manipulert filnavn i tabellen brukes aldri
  const fake = 'bk-20200101-000000-aaaaaa';
  db.prepare("INSERT INTO backup_jobs(id, kind, state, pct, started, scope, modules, file) VALUES(?,?,?,?,?,?,?,?)").run(fake, 'manual', 'done', 100, Date.parse('2020-01-01'), 'all', '[]', '../../homelab.db');
  assert.equal((await A(`/api/backup/${fake}/download`)).status, 404);
  db.prepare('DELETE FROM backup_jobs WHERE id=?').run(fake);
});

test('kryptering rundtur: nøkkel vises én gang, feil nøkkel avvises', async () => {
  const k = await A('/api/backup/key', 'POST', {});
  assert.equal(k.status, 200);
  assert.match(k.body.key, /^[\w-]{8}-[\w-]{8}-[\w-]{8}-[\w-]{8}$/);
  const again = await A('/api/backup/key', 'POST', {});
  assert.equal(again.status, 409);
  assert.equal(again.body.key, undefined);
  assert.equal(JSON.stringify(kv.get(OWNER, 'sys_backup_keys')).includes(k.body.key), false); // lagres kryptert
  assert.equal((await A('/api/backup/settings', 'PUT', { encrypt: true, scope: 'all' })).body.encrypt, true);
  assert.equal((await A('/api/backup/settings')).body.keySet, true);

  kv.set(OWNER, 'kal_local_events', [{ id: 'loc-bbbbbbbbbb', title: 'Kryptert', allDay: true, date: '2026-12-01', start: null, end: null, endDate: null, location: '', calendar: 'privat', repeat: 'none', reminder: 'none', note: '' }]);
  const id = await runBackup(A, { scope: 'custom', modules: ['kalender'] });
  const b = (await A('/api/backup/list')).body.find((x) => x.id === id);
  assert.equal(b.encrypted, true);
  const raw = readFileSync(join(process.env.BACKUP_DIR, `${id}.tar.gz.enc`));
  assert.equal(raw.subarray(0, 6).toString(), 'FHBK1\n');
  assert.equal(raw.includes(Buffer.from('Kryptert')), false);

  kv.set(OWNER, 'kal_local_events', []);
  // Serveren har mistet nøkkelen: må limes inn
  const saved = kv.get(OWNER, 'sys_backup_keys');
  kv.set(OWNER, 'sys_backup_keys', {});
  const miss = await A('/api/backup/restore', 'POST', { id, modules: ['kalender'], password: 'testpassord1' });
  assert.equal(miss.status, 400);
  assert.equal(miss.body.needKey, true);
  const wrong = await A('/api/backup/restore', 'POST', { id, modules: ['kalender'], password: 'testpassord1', key: 'feil-feil-feil-feil' });
  assert.equal(wrong.status, 400);
  assert.deepEqual(kv.get(OWNER, 'kal_local_events'), []); // ingenting endret
  const ok = await A('/api/backup/restore', 'POST', { id, modules: ['kalender'], password: 'testpassord1', key: k.body.key });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(kv.get(OWNER, 'kal_local_events')[0].title, 'Kryptert');
  kv.set(OWNER, 'sys_backup_keys', saved);
  // Med lagret nøkkel trengs den ikke
  kv.set(OWNER, 'kal_local_events', []);
  assert.equal((await A('/api/backup/restore', 'POST', { id, modules: ['kalender'], password: 'testpassord1' })).status, 200);
  assert.equal(kv.get(OWNER, 'kal_local_events')[0].title, 'Kryptert');
  // Ny nøkkel krever passord
  assert.equal((await A('/api/backup/key', 'POST', { rotate: true, password: 'feil' })).status, 403);
  const k2 = await A('/api/backup/key', 'POST', { rotate: true, password: 'testpassord1' });
  assert.equal(k2.status, 200);
  assert.notEqual(k2.body.key, k.body.key);
  // Eldre backup kan fortsatt gjenopprettes med den gamle (lagrede) nøkkelen
  assert.equal((await A('/api/backup/restore', 'POST', { id, modules: ['kalender'], password: 'testpassord1' })).status, 200);
});

test('sky (B2): bare kryptert, SigV4-signert PUT', async () => {
  const calls = [];
  sb._setCloudFetch(async (url, init) => {
    const chunks = []; for await (const ch of init.body) chunks.push(Buffer.from(ch));
    calls.push({ url, init, body: Buffer.concat(chunks) });
    return new Response('', { status: 200 });
  });
  const bad = await A('/api/backup/settings', 'PUT', { cloud: { enabled: true, provider: 'b2', bucket: 'hl-backup', endpoint: 'http://192.168.1.1' } });
  assert.equal(bad.status, 400);
  assert.equal((await A('/api/backup/settings', 'PUT', { cloud: { enabled: true, provider: 'gdrive' } })).status, 400);
  const s = await A('/api/backup/settings', 'PUT', { cloud: { enabled: true, provider: 'b2', bucket: 'hl-backup', endpoint: 's3.eu-central-003.backblazeb2.com', prefix: 'homelab', keyId: '003abcdef0123456789', appKey: 'K003abcdefghijklmnopqrstuvwxyz' } });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.cloud.keySet, true);
  assert.equal(s.body.cloud.region, 'eu-central-003');
  assert.equal(JSON.stringify(s.body).includes('K003abcdef'), false); // hemmeligheten sendes aldri ut
  assert.equal((await A('/api/backup/settings', 'PUT', { encrypt: false })).status, 400); // kan ikke slå av kryptering med sky på
  const id = await runBackup(A, { scope: 'custom', modules: ['domener'] });
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, `https://s3.eu-central-003.backblazeb2.com/hl-backup/homelab/${id}.tar.gz.enc`);
  assert.equal(c.init.method, 'PUT');
  assert.match(c.init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=003abcdef0123456789\/\d{8}\/eu-central-003\/s3\/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.equal(c.body.subarray(0, 6).toString(), 'FHBK1\n');
  const b = (await A('/api/backup/list')).body.find((x) => x.id === id);
  assert.equal(b.cloud.ok, true);
  assert.equal((await A('/api/backup/settings')).body.cloud.lastError, null);
  await A('/api/backup/settings', 'PUT', { cloud: { enabled: false } });
  sb._setCloudFetch(null);
});

test('SigV4 mot kjente testvektorer (AWS-dokumentasjonen)', () => {
  // S3 «GET Object»-eksempelet
  const s3 = sb.sigv4({ method: 'GET', path: '/test.txt', headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'x-amz-date': '20130524T000000Z' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', region: 'us-east-1', service: 's3', accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', amzDate: '20130524T000000Z' });
  assert.equal(s3.signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  assert.equal(s3.authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  // IAM ListUsers-eksempelet (spørrestreng)
  const iam = sb.sigv4({ method: 'GET', path: '/', query: { Action: 'ListUsers', Version: '2010-05-08' }, headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8', host: 'iam.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', region: 'us-east-1', service: 'iam', accessKey: 'AKIDEXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', amzDate: '20150830T123600Z' });
  assert.equal(iam.signature, '5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
});

test('rotasjon etter keep', () => {
  const dir = process.env.BACKUP_DIR;
  const mk = (i, daysAgo, kind = 'manual') => {
    const id = `bk-2001${String(i).padStart(4, '0')}-000000-${String(i).padStart(6, '0')}`.replace(/^(bk-\d{8})/, (m) => m);
    const file = `${id}.tar.gz`;
    writeFileSync(join(dir, file), 'x');
    db.prepare("INSERT INTO backup_jobs(id, kind, state, pct, started, scope, modules, file) VALUES(?,?,?,?,?,?,?,?)").run(id, kind, 'done', 100, Date.now() - daysAgo * 86_400_000 - 3_600_000, 'all', '[]', file);
    return { id, file };
  };
  db.prepare("DELETE FROM backup_jobs WHERE kind<>'safety'").run();
  const rows = Array.from({ length: 10 }, (_, i) => mk(101 + i, 10 - i)); // eldst først
  assert.equal(sb.rotate('7'), 3);
  for (const r of rows.slice(0, 3)) assert.equal(existsSync(join(dir, r.file)), false);
  for (const r of rows.slice(3)) assert.equal(existsSync(join(dir, r.file)), true);
  assert.equal(sb.rotate('30'), 0);
  db.prepare("DELETE FROM backup_jobs WHERE kind<>'safety'").run();
  const old = [mk(201, 400), mk(202, 200), mk(203, 100), mk(204, 50), mk(205, 1)];
  assert.equal(sb.rotate('1y'), 1); // 400 dager
  assert.equal(sb.rotate('90d'), 2); // 200 og 100 dager
  assert.deepEqual(db.prepare("SELECT id FROM backup_jobs WHERE kind<>'safety' ORDER BY started").pluck().all(), old.slice(3).map((r) => r.id));
  // Den nyeste beholdes alltid, også når alt er gammelt
  db.prepare("DELETE FROM backup_jobs WHERE kind<>'safety'").run();
  mk(301, 500); mk(302, 400);
  assert.equal(sb.rotate('90d'), 1);
  assert.equal(db.prepare("SELECT count(*) FROM backup_jobs WHERE kind<>'safety'").pluck().get(), 1);
});

test('tidsplan (Europe/Oslo) og scheduler', async () => {
  assert.equal(sb.dueSlot('nightly', Date.parse('2026-10-19T01:00:00Z')), 'n-2026-10-19'); // 03:00 sommertid
  assert.equal(sb.dueSlot('nightly', Date.parse('2026-10-19T02:00:00Z')), null);
  assert.equal(sb.dueSlot('nightly', Date.parse('2026-12-01T02:05:00Z')), 'n-2026-12-01'); // vintertid
  assert.equal(sb.dueSlot('6h', Date.parse('2026-10-19T04:00:00Z')), '6h-2026-10-19-6');
  assert.equal(sb.dueSlot('6h', Date.parse('2026-10-19T05:00:00Z')), null);
  assert.equal(sb.dueSlot('weekly', Date.parse('2026-10-25T02:00:00Z')), 'w-2026-10-25'); // søndag
  assert.equal(sb.dueSlot('weekly', Date.parse('2026-10-19T01:00:00Z')), null);
  assert.equal(sb.dueSlot('monthly', Date.parse('2026-11-01T02:00:00Z')), 'm-2026-11-01');
  assert.equal(sb.nextRun('nightly', Date.parse('2026-10-19T10:00:00Z')), '2026-10-20T01:00:00.000Z');
  assert.equal(sb.nextRun('monthly', Date.parse('2026-10-19T10:00:00Z')), '2026-11-01T02:00:00.000Z');
  await A('/api/backup/settings', 'PUT', { auto: true, schedule: 'nightly', scope: 'custom', modules: ['domener'] });
  const t = Date.parse('2026-10-19T01:01:00Z');
  const id = sb.schedulerTick(t);
  assert.match(id, /^bk-/);
  await waitIdle();
  assert.equal(sb.schedulerTick(t + 60_000), null); // samme luke
  const j = (await A('/api/backup/list')).body.find((x) => x.id === id);
  assert.equal(j.kind, 'auto');
  assert.deepEqual(j.modules, ['domener']);
  await A('/api/backup/settings', 'PUT', { auto: false });
  assert.equal(sb.schedulerTick(Date.parse('2026-10-20T01:01:00Z')), null);
  assert.equal((await A('/api/backup/status')).body.summary, 'Automatisk av');
});

test('modulkart dekker alle tabeller', () => {
  const map = sb.tableMap();
  const all = Object.values(map).flat();
  for (const t of ['fh_transactions', 'fh_receipts', 'cal_quick_jobs', 'family_pos', 'mat_file', 'hl_shipments', 'hl_tasks', 'birthdays', 'hl_chats', 'hl_domains', 'users', 'kv']) assert.ok(all.includes(t), t);
  assert.ok(map.finans.includes('fh_transactions'));
  assert.ok(map.kalender.includes('cal_quick_jobs'));
  assert.ok(map.innstillinger.includes('users'));
  assert.ok(!all.includes('sessions'));
  assert.ok(!all.includes('backup_jobs'));
  assert.ok(!all.some((t) => t.startsWith('fh_fts')));
  assert.equal(new Set(all).size, all.length); // hver tabell i én modul
  assert.equal(sb.kvModule('kal_local_events'), 'kalender');
  assert.equal(sb.kvModule('fh_settings'), 'finans');
  assert.equal(sb.kvModule('layout'), 'innstillinger');
  assert.equal(sb.kvModule('sys_backup_keys'), null);
});
