// Låser svarene til rutene i Familie, Vel fremme, Kart, Sporing, Vær, Gjøremål og Mat (status per rolle og formen på svaret)
// før serverfilene samles i server/{familie,sporing,vaer,gjoremal,mat}/ (Fase 2b). Omstruktureringen skal ikke endre stier,
// statuskoder eller felt. Rutene passerer flere lag (mellomvare som legger på felt etter next()), så formen sjekkes to nivåer ned.
//
// Fasiten ligger i test/fixtures/hjem-ruter.json. Den lages på nytt med HJEM_RUTER_SKRIV=1 (bare når en endring i svarene er
// bevisst). Rollene: A = admin (eier), I = vanlig bruker (økt), TI = samme bruker med app-token (mobil), N = ikke innlogget.
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-hjem-ruter-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-hjem';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers, type: r.headers.get('content-type') ?? '' };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'ingrid', password: 'ingridPassord123', device: 'iPhone' } })).json?.token;
assert.ok(tok);
const TI = as({ authorization: `Bearer ${tok}` });
const N = as({});

/**
 * Formen på et svar: nøklene to nivåer ned. En liste blir formen til alle elementene slått sammen (mockdata kan ha felt som bare
 * noen elementer har). Verdiene (tall, tekst, tider) er ikke med.
 */
function merge(a, b) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (Array.isArray(a) && Array.isArray(b)) return a.length || b.length ? [merge(a[0], b[0])] : [];
  if (a && typeof a === 'object' && b && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map((k) => [k, merge(a[k], b[k])]));
  }
  return typeof a === 'object' || (a && !b) ? a : b; // objekt/liste vinner over tom verdi (null)
}
// Lister med bare «…» eller enkle verdier (innholdet er ikke del av formen) og tomme lister er samme form: om dagens bibelvers har vers før
// seg, eller om «I kveld» har noen titler, avhenger av data og dato, ikke av koden.
const loose = (v) => Array.isArray(v) ? (v.every((x) => x === '…' || x === '') ? [] : v.map(loose)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, loose(x)])) : v;
function shape(v, depth = 2) {
  if (Array.isArray(v)) return v.length ? [v.map((x) => (depth > 0 ? shape(x, depth - 1) : '…')).reduce(merge)] : [];
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, depth > 0 ? shape(v[k], depth - 1) : (v[k] && typeof v[k] === 'object' ? (Array.isArray(v[k]) ? '[]' : '{}') : '')]));
  }
  return '';
}
const out = (r) => (r.json != null ? shape(r.json) : `${r.type.split(';')[0]}`);

// Rutene klientene bruker uten parametre. Ruter med svar som avhenger av klokka eller tilfeldig mockdata er tatt ut.
const GETS = [
  '/api/family', '/api/family/positions', '/api/family/events', '/api/family/places', '/api/family/places/regions',
  '/api/family/people50', '/api/family/today50', '/api/family/health50', '/api/family/health/ha', '/api/family/checkin',
  '/api/family/checkin/log', '/api/family/checkin/suggest', '/api/family/zone-alerts',
  '/api/famcal51/events', '/api/famcal51/drives', '/api/famcal51/settings',
  '/api/hjemlys', '/api/hjemlys/notices', '/api/hjemlys/recipients', '/api/hjemlys/suggest', '/api/velfremme/notices',
  '/api/kart', '/api/kart/people', '/api/kart/prefs', '/api/kart/zones',
  '/api/tracking', '/api/tracking/widget', '/api/tracking/keys', '/api/tracking/postnord/health', '/api/tracking/sources46',
  '/api/tracking/aliexpress', '/api/tracking/detect?no=70712345678901234',
  '/api/weather/layout', '/api/weather/places', '/api/weather/full', '/api/weather/compare', '/api/weather/places/summary',
  '/api/weather/here?lat=59.91&lon=10.75', '/api/weather/place?q=Oslo', '/api/weather/week-summary', '/api/weather/search?q=Oslo',
  '/api/tasks', '/api/tasks/lists', '/api/tasks/lists/order', '/api/tasks/next', '/api/tasks/brief', '/api/tasks/settings',
  '/api/tasks/sync', '/api/tasks/ha', '/api/tasks/ha/summary', '/api/tasks/glimt/cards', '/api/tasks/glimt/jobs',
  '/api/tasks/glimt/log', '/api/tasks/glimt/sources', '/api/tasks/glimt/tips',
  '/api/matplan/week', '/api/matplan/folders', '/api/matplan/recipes/jobs', '/mat/api/week', '/mat/api/folders',
  '/api/media51/status', '/api/media51/tonight/home', '/api/media51/tonight/profile', '/api/media51/subs/status', '/api/media51/audio/status',
  '/api/media51/storage', '/api/media51/storage/deletions',
];

async function snapshot() {
  const snap = {};
  for (const p of GETS) {
    const rs = { A: await A(p), I: await I(p), TI: await TI(p), N: await N(p) };
    snap[`GET ${p}`] = { status: Object.values(rs).map((r) => r.status).join(' '), A: out(rs.A), I: out(rs.I) };
  }
  // Skriveflyter som går gjennom flere lag.
  const t = await I('/api/tasks', 'POST', { title: 'Låsetest', placeName: 'Strømstad' });
  snap['POST /api/tasks'] = { status: String(t.status), A: out(t) };
  const t2 = await I('/api/tasks', 'POST', { title: 'Etterpå', after: t.json?.item?.id });
  snap['POST /api/tasks (after)'] = { status: String(t2.status), A: out(t2) };
  const id = t.json?.item?.id;
  const p = await I(`/api/tasks/${id}`, 'PATCH', { done: true });
  snap['PATCH /api/tasks/:id'] = { status: String(p.status), A: out(p) };
  const o = await I('/api/tasks/lists/order', 'PUT', { reset: true });
  snap['PUT /api/tasks/lists/order'] = { status: String(o.status), A: out(o) };
  const pkg = await I('/api/tracking', 'POST', { trackingNo: 'LA123456789NO', name: 'Låsepakke' });
  snap['POST /api/tracking'] = { status: String(pkg.status), A: out(pkg) };
  const pos = await I('/api/family/location', 'POST', { lat: 59.91, lon: 10.75, acc: 10 });
  snap['POST /api/family/location'] = { status: String(pos.status), A: out(pos) };
  const lay = await I('/api/weather/layout', 'PUT', { ski: false });
  snap['PUT /api/weather/layout'] = { status: String(lay.status), A: out(lay) };
  const hl = await I('/api/hjemlys/start', 'POST', { eta: 20 });
  snap['POST /api/hjemlys/start'] = { status: String(hl.status), A: out(hl) };
  const hn = await I('/api/hjemlys/notice', 'POST', { kind: 'leaving_now' });
  snap['POST /api/hjemlys/notice'] = { status: String(hn.status), A: out(hn) };
  const he = await A(`/api/hjemlys/${hl.json?.session?.id}/end`, 'POST', {});
  snap['POST /api/hjemlys/end (admin)'] = { status: String(he.status), A: out(he) };
  const hj = await I('/api/huske/glimt-jobs', 'POST', { text: 'kjøp melk' });
  snap['POST /api/huske/glimt-jobs'] = { status: String(hj.status), A: out(hj) };
  const fe = await I('/api/famcal51/events', 'POST', { title: 'Fotball', start: '2030-01-10T17:00', kind: 'activity' });
  snap['POST /api/famcal51/events'] = { status: String(fe.status), A: out(fe) };
  const pid = pkg.json?.item?.id;
  const pd = await I(`/api/tracking/${pid}`, 'PATCH', { name: 'Låsepakke 2' });
  snap['PATCH /api/tracking/:id'] = { status: String(pd.status), A: out(pd) };
  const md = await I('/api/matplan/dishes', 'POST', { name: 'Låsegryte' });
  snap['POST /api/matplan/dishes'] = { status: String(md.status), A: out(md) };
  const td = await I(`/api/tracking/debug/1`);
  snap['GET /api/tracking/debug/1 (bruker)'] = { status: String(td.status), A: out(td) };
  return snap;
}

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hjem-ruter.json');

test('Familie, Sporing, Vær, Gjøremål og Mat: status og svarform er uendret', async () => {
  const snap = await snapshot();
  if (process.env.HJEM_RUTER_SKRIV === '1') { writeFileSync(FIX, JSON.stringify(snap, null, 1) + '\n'); return; }
  const want = JSON.parse(readFileSync(FIX, 'utf8'));
  assert.deepEqual(Object.keys(snap), Object.keys(want));
  for (const k of Object.keys(want)) assert.deepEqual(loose(snap[k]), loose(want[k]), k);
});

test('bakgrunnsjobbene i Familie går via den felles planleggeren (ikke aktive i test)', async () => {
  const { listJobs } = await import('../server/jobs/index.js');
  const jobs = listJobs().filter((j) => j.name.startsWith('familie.'));
  assert.deepEqual(jobs.map((j) => [j.name, j.everyMs]).sort(), [['familie.forlot', 30_000], ['familie.helse-ha', 900_000], ['familie.kjoring', 300_000], ['familie.sjekk-inn', 30_000], ['familie.vel-fremme', 60_000]]);
  assert.ok(jobs.every((j) => !j.active));
});

test('bakgrunnsjobbene i Sporing og Mat går via den felles planleggeren (ikke aktive i test)', async () => {
  const { listJobs } = await import('../server/jobs/index.js');
  const jobs = listJobs().filter((j) => /^(sporing|mat)\./.test(j.name));
  assert.deepEqual(jobs.map((j) => [j.name, j.everyMs]).sort(), [['mat.ukeplan', 600_000], ['sporing.kontoer', 300_000], ['sporing.status', 900_000]]);
  assert.ok(jobs.every((j) => !j.active));
});
