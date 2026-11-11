// Prompt 86 (SRV86):
//  A. SESSION_SECRET: ny installasjon får en tilfeldig hemmelighet lagret i DATA_DIR/session-secret (0600); en eksisterende
//     installasjon uten hemmelighet beholder de gamle reservenøklene bit for bit og får varsel; SESSION_SECRET i miljøet vinner.
//  B. RSS og iCal: lokale adresser (også via DNS og omdirigering) avvises, med mindre verten er godkjent av en administrator
//     (GET|PUT /api/admin/local-fetch-hosts). En admin som selv legger til en lokal adresse, godkjenner verten. Migrering én gang.
//  C. Ollama har ingen standardadresse: uten OLLAMA_URL og uten lagret adresse er den «ikke satt opp», uten krasj.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, createDecipheriv, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const mod = (p) => pathToFileURL(join(ROOT, 'server', p)).href;

/* ---------------- B og C: i samme prosess ---------------- */
// (Testene registreres først når oppsettet under er ferdig – A-testene med egne prosesser står derfor sist i fila.)

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p86-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-86s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.GLITCHTIP_DSN;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const RSS = (t) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${t}</title><item><title>Sak fra ${t}</title><link>https://offentlig.example.no/sak/1</link><guid>${t}-1</guid><pubDate>Tue, 10 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
const ICS = (n) => ['BEGIN:VCALENDAR', 'VERSION:2.0', `X-WR-CALNAME:${n}`, 'BEGIN:VEVENT', 'UID:p86@test', 'DTSTART:20261201T100000Z', 'DTEND:20261201T110000Z', 'SUMMARY:Møte', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
const calls = [];
const ROUTES = {
  'https://offentlig.example.no/feed': () => new Response(RSS('Offentlig'), { status: 200, headers: { 'content-type': 'application/rss+xml' } }),
  'https://snu.example.no/feed': () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8080/hemmelig' } }),
  'https://snu2.example.no/feed': () => new Response(null, { status: 301, headers: { location: 'http://intern.example.no/feed' } }),
  'https://videre.example.no/feed': () => new Response(null, { status: 302, headers: { location: 'https://offentlig.example.no/feed' } }),
  'https://snu.example.no/kal.ics': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
  'https://offentlig.example.no/kal.ics': () => new Response(ICS('Offentlig'), { status: 200, headers: { 'content-type': 'text/calendar' } }),
};
const LOCAL_OK = /^http:\/\/(10\.0\.0\.5|192\.168\.1\.77|nas\.local|172\.16\.5\.5)(:\d+)?\/feed$/;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input?.url ?? input);
  calls.push(url);
  if (ROUTES[url]) return ROUTES[url]();
  if (LOCAL_OK.test(url)) return new Response(RSS('Lokal'), { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  if (/^https?:\/\/(kal\.local|192\.168\.1\.88)\/.*\.ics$/.test(url)) return new Response(ICS('Hjemme'), { status: 200, headers: { 'content-type': 'text/calendar' } });
  throw new TypeError('fetch failed');
};
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const auth = await import('../server/auth.js');
const { db, kv, OWNER } = await import('../server/db.js');
const L = await import('../server/localfetch86.js');
const DNS = { 'offentlig.example.no': ['93.184.216.34'], 'snu.example.no': ['93.184.216.35'], 'snu2.example.no': ['93.184.216.36'], 'videre.example.no': ['93.184.216.37'],
  'intern.example.no': ['192.168.1.10'], 'blandet.example.no': ['93.184.216.40', '10.0.0.9'], 'v6.example.no': ['fd00::1'] };
L._setNet86({ resolve: async (host) => { if (!DNS[host]) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); return DNS[host]; } });
test.after(() => L._setNet86(null));

const LAN = { incoming: { socket: { remoteAddress: '192.168.1.20' } } };
const req = async (cookie, path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }, LAN);
  let j = null; try { j = await r.json(); } catch { /* ikke JSON */ }
  return { status: r.status, body: j };
};
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }, LAN);
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
}
const perUser = auth.createUser({ username: 'per86', password: 'passord-per-86', name: 'Per' });
const perId = perUser?.id ?? db.prepare("SELECT id FROM users WHERE username='per86'").get().id;
const admin = await login('sebastian', 'testpassord1');
const per = await login('per86', 'passord-per-86');
const hosts = async () => (await req(admin, '/api/admin/local-fetch-hosts')).body.hosts;
await L.migrateLocalHosts86().catch(() => {}); // oppstartsmigreringen er ferdig før testene endrer lista

test('B: vanlig bruker – RSS mot loopback, private nett, metadata-adressen, IPv6 og DNS som peker lokalt avvises', async () => {
  for (const url of ['http://127.0.0.1:8080/feed', 'http://10.0.0.5/feed', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]:3000/feed', 'http://[fd00::1]/feed', 'http://[::ffff:10.0.0.5]/feed',
    'http://192.168.1.77/feed', 'http://172.16.5.5/feed', 'http://localhost:11434/api/tags', 'http://nas.local/feed', 'http://2130706433/feed',
    'http://intern.example.no/feed', 'http://blandet.example.no/feed', 'http://v6.example.no/feed']) {
    calls.length = 0;
    const r = await req(per, '/api/rss/feeds', 'POST', { url });
    assert.equal(r.status, 422, url);
    assert.ok(r.body.error.includes(L.LOCAL_MSG86), `${url}: ${r.body.error}`);
    assert.deepEqual(calls.filter((u) => !/favicon|\.ico/.test(u)), [], `${url} skal aldri hentes`);
  }
  assert.equal(L.LOCAL_MSG86, 'Lokale adresser må godkjennes av en administrator (Innstillinger → Sikkerhet).');
  assert.deepEqual(await hosts(), [], 'en vanlig bruker godkjenner ingenting');
});

test('B: offentlige adresser virker som før, og omdirigering kontrolleres per hopp', async () => {
  calls.length = 0;
  let r = await req(per, '/api/rss/feeds', 'POST', { url: 'https://videre.example.no/feed' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(calls.includes('https://videre.example.no/feed') && calls.includes('https://offentlig.example.no/feed'), 'omdirigering til en offentlig adresse følges');
  for (const url of ['https://snu.example.no/feed', 'https://snu2.example.no/feed']) {
    calls.length = 0;
    r = await req(per, '/api/rss/feeds', 'POST', { url });
    assert.equal(r.status, 422, url);
    assert.ok(r.body.error.includes(L.LOCAL_MSG86), r.body.error);
    assert.ok(!calls.some((u) => /127\.0\.0\.1|intern\.example/.test(u)), 'det lokale målet for omdirigeringen skal ikke hentes');
  }
});

test('B: godkjenningslista – bare admin, validert, maks 50', async () => {
  assert.equal((await req(null, '/api/admin/local-fetch-hosts')).status, 401);
  assert.equal((await req(per, '/api/admin/local-fetch-hosts')).status, 403);
  assert.equal((await req(per, '/api/admin/local-fetch-hosts', 'PUT', { hosts: ['10.0.0.5'] })).status, 403);
  assert.equal((await req(null, '/api/admin/local-fetch-hosts', 'PUT', { hosts: ['10.0.0.5'] })).status, 401);
  assert.deepEqual(await hosts(), []);
  for (const bad of [{ hosts: 'nas.local' }, {}, { hosts: [5] }, { hosts: ['har mellomrom'] }, { hosts: ['999.1.1.1'] }, { hosts: ['-feil.local'] }, { hosts: [''] }, { hosts: ['nas.local/sti'] }, { hosts: ['a'.repeat(300)] },
    { hosts: Array.from({ length: 51 }, (_, i) => `10.1.0.${i}`) }]) {
    const r = await req(admin, '/api/admin/local-fetch-hosts', 'PUT', bad);
    assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 80));
    assert.ok(r.body.error);
  }
  assert.deepEqual(await hosts(), [], 'ugyldige forsøk endrer ikke lista');
  const r = await req(admin, '/api/admin/local-fetch-hosts', 'PUT', { hosts: [' NAS.Local ', 'http://10.0.0.5:8080/feed', '[::1]', 'nas.local'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { hosts: ['nas.local', '10.0.0.5', '::1'], max: 50 });
  assert.equal((await req(admin, '/api/admin/local-fetch-hosts', 'PUT', { hosts: Array.from({ length: 50 }, (_, i) => `10.1.0.${i}`) })).status, 200);
  assert.equal((await req(admin, '/api/admin/local-fetch-hosts', 'PUT', { hosts: ['10.0.0.5', 'nas.local'] })).status, 200);
});

test('B: godkjent vert virker for en vanlig bruker – andre lokale verter avvises fortsatt', async () => {
  let r = await req(per, '/api/rss/feeds', 'POST', { url: 'http://10.0.0.5/feed' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await req(per, '/api/rss/feeds', 'POST', { url: 'http://nas.local:8080/feed' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await req(per, '/api/rss/feeds', 'POST', { url: 'http://10.0.0.6/feed' });
  assert.equal(r.status, 422);
  // Fjernes verten, slutter abonnementet å hentes, og feilen står på abonnementet.
  await req(admin, '/api/admin/local-fetch-hosts', 'PUT', { hosts: ['nas.local'] });
  r = await req(per, '/api/rss/refresh', 'POST', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.feeds.find((f) => f.url === 'http://10.0.0.5/feed').lastError, L.LOCAL_MSG86);
  assert.equal(r.body.feeds.find((f) => f.url === 'http://nas.local:8080/feed').lastError, null);
});

test('B: admin legger selv til en lokal adresse (RSS og iCal) – verten godkjennes automatisk', async () => {
  let r = await req(admin, '/api/rss/feeds', 'POST', { url: 'http://192.168.1.77/feed' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok((await hosts()).includes('192.168.1.77'));
  r = await req(admin, '/api/kalender/calendars/ical', 'POST', { url: 'webcal://kal.local/hjem.ics' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok((await hosts()).includes('kal.local'));
  // En offentlig adresse havner ikke på lista.
  r = await req(admin, '/api/rss/feeds', 'POST', { url: 'https://offentlig.example.no/feed' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(!(await hosts()).includes('offentlig.example.no'));
  // Nå kan også en vanlig bruker abonnere på den godkjente kalenderen.
  r = await req(per, '/api/kalender/calendars/ical', 'POST', { url: 'http://kal.local/hjem.ics' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});

test('B: iCal for vanlig bruker – lokale adresser og omdirigering til metadata-adressen avvises (abonnement, forhåndsvisning og skole-iCal)', async () => {
  for (const url of ['http://127.0.0.1:8123/kal.ics', 'http://192.168.1.88/kal.ics', 'http://[::1]/kal.ics', 'http://intern.example.no/kal.ics', 'https://snu.example.no/kal.ics']) {
    calls.length = 0;
    const r = await req(per, '/api/kalender/calendars/ical', 'POST', { url });
    assert.ok(r.status >= 400 && r.status < 500, `${url} → ${r.status}`);
    assert.ok(r.body.error.includes(L.LOCAL_MSG86), `${url}: ${r.body.error}`);
    assert.ok(!calls.some((u) => /127\.0\.0\.1|192\.168\.1\.88|\[::1\]|intern\.example|169\.254/.test(u)), `${url} skal ikke hentes`);
    const p = await req(per, '/api/kalender/calendars/url/preview', 'POST', { url });
    assert.equal(p.status, 400, url);
    assert.equal(p.body.error, L.LOCAL_MSG86);
  }
  assert.ok(!(await hosts()).includes('192.168.1.88'));
  // Skole-iCal (cal_ics) hentes av calendar.js: feilen står på kilden.
  const { setUserCfg } = await import('../server/settings.js');
  const cal = await import('../server/calendar.js');
  setUserCfg(perId, { cal_ics: 'http://192.168.1.88/skole.ics' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!(await hosts()).includes('192.168.1.88'), 'en vanlig bruker godkjenner ikke verten ved å lagre adressen');
  const ev = await cal.calendarOut(perId, { from: '2026-12-01', to: '2026-12-02' });
  assert.equal(ev.sources.find((s) => s.id === 'ical').error, L.LOCAL_MSG86);
  // En admin som lagrer samme adresse, godkjenner verten – og da hentes den for begge.
  const adminId = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get().id;
  setUserCfg(adminId, { cal_ics: 'http://192.168.1.88/skole.ics' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok((await hosts()).includes('192.168.1.88'));
  cal.clearCalendarCache(perId);
  const ev2 = await cal.calendarOut(perId, { from: '2026-12-01', to: '2026-12-02' });
  assert.equal(ev2.sources.find((s) => s.id === 'ical').ok, true);
  const r = await req(per, '/api/kalender/calendars/ical', 'POST', { url: 'https://offentlig.example.no/kal.ics' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});

test('B: migrering – lokale verter i administratorenes abonnementer godkjennes én gang, vanlige brukeres gjør det ikke', async () => {
  const adminId = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get().id;
  await req(admin, '/api/admin/local-fetch-hosts', 'PUT', { hosts: [] });
  const ins = db.prepare('INSERT INTO rss_feed (user, name, url, category, color, sort, created) VALUES (?,?,?,?,?,?,?)');
  ins.run(adminId, 'Hjemme', 'http://172.16.5.5/feed', 'auto', '#000000', 90, Date.now());
  ins.run(adminId, 'DNS', 'http://intern.example.no/feed', 'auto', '#000000', 91, Date.now());
  ins.run(perId, 'Pers', 'http://172.16.6.6/feed', 'auto', '#000000', 90, Date.now());
  kv.set(perId, 'kal35_ext', { ...(kv.get(perId, 'kal35_ext', {}) ?? {}), ical: [...(kv.get(perId, 'kal35_ext', {})?.ical ?? []), { id: 'ical-p86per', url: 'http://10.77.0.1/a.ics', name: 'P', color: '#000000' }] });
  assert.deepEqual(await L.migrateLocalHosts86(), { skipped: true, added: [] }, 'kjørt ved oppstart – ikke en gang til');
  const m = await L.migrateLocalHosts86({ force: true });
  // Fra testene over: 192.168.1.77 (RSS), kal.local (iCal-abonnement) og 192.168.1.88 (skole-iCal) hører til admin.
  for (const h of ['172.16.5.5', 'intern.example.no', '192.168.1.77', 'kal.local', '192.168.1.88']) assert.ok(m.added.includes(h), `${h} mangler i ${m.added}`);
  for (const h of ['172.16.6.6', '10.77.0.1', '10.0.0.5', 'offentlig.example.no', 'nas.local']) assert.ok(!m.added.includes(h), `${h} skal ikke med`);
  assert.deepEqual([...(await hosts())].sort(), [...m.added].sort());
  assert.ok(kv.get(OWNER, 'local_fetch_migrated86', null));
  // Etter migreringen: adminens lokale kilde hentes, brukerens gir feilteksten.
  let r = await req(admin, '/api/rss/refresh', 'POST', {});
  assert.equal(r.body.feeds.find((f) => f.url === 'http://172.16.5.5/feed').lastError, null);
  r = await req(per, '/api/rss/refresh', 'POST', {});
  assert.equal(r.body.feeds.find((f) => f.url === 'http://172.16.6.6/feed').lastError, L.LOCAL_MSG86);
});

test('B: vernet ved selve tilkoblingen (DNS-rebinding) gir samme feiltekst', async () => {
  L._setNet86({ resolve: async () => ['93.184.216.34'], fetch: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('Avvist adresse'), { code: 'ESSRF' }) }); } });
  try { await assert.rejects(() => L.guardedFetch86('https://rebind.example.no/feed'), (e) => e.code === 'ELOCAL86' && e.message === L.LOCAL_MSG86); }
  finally { L._setNet86({ resolve: async (host) => { if (!DNS[host]) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); return DNS[host]; } }); }
  await assert.rejects(() => L.guardedFetch86('file:///etc/passwd'), /Bare http og https/);
  await assert.rejects(() => L.guardedFetch86('gopher://127.0.0.1/'), /Bare http og https/);
});

test('C: Ollama uten adresse er «ikke satt opp» – ingen standardadresse, ingen krasj, og lagret adresse gjelder som før', async () => {
  const fdb = await import('../server/finans/db.js');
  assert.equal(fdb.DEFAULT_SETTINGS.ollamaUrl, '');
  assert.equal(fdb.settings(OWNER).ollamaUrl, '');
  const src = readFileSync(join(ROOT, 'server', 'finans', 'db.js'), 'utf8');
  assert.ok(!/ollamaUrl:[^\n,]*(?:192\.168|10\.\d+|172\.(?:1[6-9]|2\d|3[01]))\./.test(src), 'ingen privat adresse som standard for Ollama');
  calls.length = 0;
  const { ollamaModels, startPull } = await import('../server/finans/ollama-models.js');
  await assert.rejects(() => ollamaModels(), (e) => /Ollama er ikke satt opp/.test(e.message) && e.status === 501);
  assert.throws(() => startPull('qwen3:8b'), /Ollama er ikke satt opp/);
  const ai = await import('../server/finans/ai.js');
  const h = await ai.health();
  assert.equal(h.ollama.ok, false); assert.equal(h.ollama.configured, false);
  assert.match(h.ollama.error, /ikke satt opp/);
  for (const path of ['/finans/api/ai/ollama/models', '/finans/api/ai/health', '/api/ai/models', '/api/ai/backend', '/api/ai/keys', '/finans/api/settings', '/api/widgets/server-status']) {
    const r = await req(admin, path);
    assert.ok(r.status !== 500 && r.status < 502, `${path} → ${r.status}`);
  }
  const m = await req(admin, '/finans/api/ai/ollama/models');
  assert.equal(m.status, 501);
  assert.equal(m.body.ok, false);
  assert.match(m.body.error, /Ollama er ikke satt opp/);
  const t = await req(admin, '/api/ai/backend/test', 'POST', { which: 'ollama' });
  assert.ok(t.status < 500);
  assert.deepEqual(calls.filter((u) => /11434|192\.168\.1\.30/.test(u)), [], 'ingen forespørsler til en gjettet Ollama-adresse');
  // Den som har satt adressen selv, påvirkes ikke.
  fdb.saveSettings({ ollamaUrl: 'http://10.20.30.40:11434' }, OWNER);
  assert.equal(fdb.settings(OWNER).ollamaUrl, 'http://10.20.30.40:11434');
  assert.equal(fdb.settings(perId).ollamaUrl, 'http://10.20.30.40:11434');
  fdb.saveSettings({ ollamaUrl: '' }, OWNER);
});

/* ---------------- A: hemmeligheten (egne prosesser – ikke testmodus) ---------------- */

/** Kjører et lite skript i en egen prosess som en vanlig server (uten NODE_ENV=test og uten node --test-miljøet). */
function run(dataDir, code, extra = {}) {
  const env = { ...process.env, DATA_DIR: dataDir, PORT: '0', OPS51_SANDBOX: '1', COOKIE_SECURE: 'false', ...extra };
  for (const k of ['NODE_ENV', 'NODE_TEST_CONTEXT', 'MOCK_DATA', 'OLLAMA_URL', 'APP_PASSWORD_HASH', 'USER_NAME']) if (!(k in extra)) delete env[k];
  if (!('SESSION_SECRET' in extra)) delete env.SESSION_SECRET;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env, cwd: mkdtempSync(join(tmpdir(), 'hl-p86cwd-')), encoding: 'utf8', timeout: 60_000 });
  const line = r.stdout.split('\n').find((l) => l.startsWith('UT:'));
  assert.ok(line, `skriptet ga ikke noe svar: ${r.stderr.slice(-800)}`);
  return { out: JSON.parse(line.slice(3)), stderr: r.stderr, stdout: r.stdout };
}
const SECRET_JS = `const m = await import(${JSON.stringify(mod('secret86.js'))});
console.log('UT:' + JSON.stringify({ status: m.secretStatus86(), dev: m.sessionSecret86('dev'), os: m.sessionSecret86('homelab-os', true), tom: m.sessionSecret86() }));`;

test('A: ny installasjon – 48 tilfeldige byte lages, lagres med 0600 og brukes igjen ved neste oppstart', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'hl-p86ny-')), 'data'); // mappen finnes ikke ennå
  const a = run(dir, SECRET_JS);
  const file = join(dir, 'session-secret');
  assert.ok(existsSync(file), 'fila skal være laget');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const stored = readFileSync(file, 'utf8').trim();
  assert.equal(Buffer.from(stored, 'base64url').length, 48);
  assert.deepEqual(a.out.status, { source: 'file', warning: null });
  assert.equal(a.out.dev, stored); assert.equal(a.out.os, stored); assert.equal(a.out.tom, stored);
  assert.match(a.stdout, /Ny installasjon/);
  assert.ok(!a.stdout.split('\n').some((l) => !l.startsWith('UT:') && l.includes(stored)) && !a.stderr.includes(stored), 'hemmeligheten skal aldri i loggen');
  // Neste oppstart (nå finnes også databasen): samme hemmelighet, ingen ny fil.
  writeFileSync(join(dir, 'homelab.db'), '');
  const b = run(dir, SECRET_JS);
  assert.equal(b.out.dev, stored);
  assert.equal(readFileSync(file, 'utf8').trim(), stored);
  // To ulike nye installasjoner får ulike hemmeligheter.
  const c = run(mkdtempSync(join(tmpdir(), 'hl-p86ny2-')), SECRET_JS);
  assert.notEqual(c.out.dev, stored);
});

test('A: eksisterende installasjon uten hemmelighet – samme reservenøkler som før, ingen fil, tydelig advarsel', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p86gml-'));
  writeFileSync(join(dir, 'homelab.db'), ''); // databasen finnes fra før
  const a = run(dir, SECRET_JS);
  assert.equal(a.out.status.source, 'legacy');
  assert.equal(a.out.dev, 'dev'); assert.equal(a.out.os, 'homelab-os'); assert.equal(a.out.tom, '');
  assert.ok(!existsSync(join(dir, 'session-secret')), 'en eksisterende installasjon skal ikke få ny nøkkel');
  for (const re of [/SESSION_SECRET/, /\.env/, /logget ut/, /integrasjonsnøkler må legges inn på nytt/]) { assert.match(a.out.status.warning, re); assert.match(a.stderr, re); }
  assert.match(a.stderr, /ADVARSEL/);
});

test('A: eksisterende installasjon – nøklene er bit for bit som før, og admin får varselet under Sikkerhet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p86gml2-'));
  writeFileSync(join(dir, 'homelab.db'), '');
  const code = `const { hashPassword } = await import(${JSON.stringify(mod('password.js'))});
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1'); process.env.USER_NAME = 'Sebastian';
const { default: app } = await import(${JSON.stringify(mod('index.js'))});
const { sealSecret } = await import(${JSON.stringify(mod('settings.js'))});
const { recoveryHash } = await import(${JSON.stringify(mod('totp.js'))});
const { db } = await import(${JSON.stringify(mod('db.js'))});
const LAN = { incoming: { socket: { remoteAddress: '192.168.1.20' } } };
const l = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) }, LAN);
const cookie = l.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
const sid = cookie.match(/hl_sid=([^;]+)/)?.[1] ?? '';
const o = await app.request('/api/security51/overview', { headers: { cookie } }, LAN);
console.log('UT:' + JSON.stringify({ login: l.status, sid, sessions: db.prepare('SELECT id FROM sessions').all().map((r) => r.id), sealed: sealSecret('hemmelig-verdi-86'), rec: recoveryHash('ABCD2345'), overview: o.status, warning: (await o.json()).secretWarning ?? null }));
process.exit(0);`;
  const { out } = run(dir, code);
  assert.equal(out.login, 200);
  // Økt-ID-en lagres som HMAC med «dev» (auth.js), gjenopprettingskoder likeså (totp.js).
  assert.ok(out.sessions.includes(createHmac('sha256', 'dev').update(out.sid).digest('hex')), 'økten skal være hashet med den gamle reservenøkkelen');
  assert.equal(out.rec, createHmac('sha256', 'dev').update('recovery:ABCD2345').digest('hex'));
  // Innstillinger krypteres med scrypt(«homelab-os») (settings.js): en verdi lagret nå kan leses med den gamle nøkkelen.
  const b = Buffer.from(out.sealed.slice(5), 'base64'), d = createDecipheriv('aes-256-gcm', scryptSync('homelab-os', 'hl-settings-v1', 32), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  assert.equal(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'), 'hemmelig-verdi-86');
  assert.equal(out.overview, 200);
  assert.match(out.warning, /SESSION_SECRET er ikke satt/);
  assert.match(out.warning, /\.env/);
  assert.ok(!existsSync(join(dir, 'session-secret')));
});

test('A: SESSION_SECRET i miljøet vinner – også over en lagret fil, og på en ny installasjon lages ingen fil', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p86env-'));
  const env = 'fra-miljoet-fra-miljoet-fra-miljoet-86';
  const a = run(dir, SECRET_JS, { SESSION_SECRET: env });
  assert.deepEqual(a.out.status, { source: 'env', warning: null });
  assert.equal(a.out.dev, env); assert.equal(a.out.os, env);
  assert.ok(!existsSync(join(dir, 'session-secret')));
  writeFileSync(join(dir, 'session-secret'), 'x'.repeat(64), { mode: 0o600 });
  const b = run(dir, SECRET_JS, { SESSION_SECRET: env });
  assert.equal(b.out.dev, env);
  // Uten miljøvariabelen brukes fila – også når den har for vide rettigheter (strammes til 0600).
  writeFileSync(join(dir, 'homelab.db'), '');
  chmodSync(join(dir, 'session-secret'), 0o644);
  const c = run(dir, SECRET_JS);
  assert.equal(c.out.dev, 'x'.repeat(64));
  assert.equal(statSync(join(dir, 'session-secret')).mode & 0o777, 0o600);
});

test('A: testmodus (NODE_ENV=test) er som før – ingen fil, reservenøkler uten SESSION_SECRET', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p86test-'));
  const a = run(dir, SECRET_JS, { NODE_ENV: 'test' });
  assert.equal(a.out.dev, 'dev'); assert.equal(a.out.os, 'homelab-os');
  assert.equal(a.out.status.warning, null);
  assert.ok(!existsSync(join(dir, 'session-secret')));
});
