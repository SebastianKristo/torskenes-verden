// Låser svarene til rutene for system og drift (admin, logger, helse, backup, oppdatering, flagg, krasj, kvalitet, søk, tema,
// oppstart, serveradresser, Innstillinger-søket, fanelinjen, dashbord-layout, Glimt-hurtigtolkingen og brief-kortene) før
// serverfilene samles i server/system/ (Fase 2b). Omstruktureringen skal ikke endre stier, statuskoder eller felt.
//
// Fasiten ligger i test/fixtures/system-ruter.json. Den lages på nytt med SYSTEM_RUTER_SKRIV=1 (bare når en endring i svarene er
// bevisst). Rollene: A = admin (eier), I = vanlig bruker (økt), TI = samme bruker med app-token (mobil), N = ikke innlogget.
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-system-ruter-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-system';
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
  '/api/health', '/api/health?boot=1', '/api/version', '/api/config/servers', '/api/flags', '/api/whatsnew', '/api/app/pages',
  '/api/settings/index', '/api/settings/sections', '/api/dashboard/layout', '/api/dashboard/layout?device=mobile',
  '/api/admin/impersonate', '/api/admin/impersonate/notice', '/api/server/owner', '/api/users/2/layout',
  '/api/admin/jobs', '/api/admin/aliases', '/api/admin/local-fetch-hosts',
  '/api/admin/flags51', '/api/admin/crashes51', '/api/admin/crashes51/status',
  '/api/system/docker/setup', '/api/system/containers', '/api/system/logs', '/api/system/logs/groups',
  '/api/system/obs51/traces', '/api/system/obs51/heal', '/api/system/obs51/proxmox', '/api/me/ntfy51',
  '/api/ops51/summary', '/api/ops51/updates', '/api/ops51/db', '/api/ops51/backup/settings', '/api/ops51/backup/runs',
  '/api/ops51/backup/restore-tests', '/api/ops51/smoke',
  '/api/system/update', '/api/system/update/status', '/api/system/update/settings', '/api/update/versions', '/api/system/version',
  '/api/backup/settings', '/api/backup/status', '/api/backup/list',
  '/api/glimt/quality/runs', '/api/glimt/quality/settings', '/api/glimt/agent/fast',
  '/api/glimt/lex52', '/api/brief52', '/api/admin/brief52/access', '/api/me/glimt-char52', '/api/admin/glimt-char52',
  '/api/search51/types', '/api/search51?q=melk', '/api/me/share51', '/api/me/theme51', '/api/offline51/versions?tasks=1&events=1',
  '/api/finnes-ikke',
];

async function snapshot() {
  const snap = {};
  for (const p of GETS) {
    const rs = { A: await A(p), I: await I(p), TI: await TI(p), N: await N(p) };
    snap[`GET ${p}`] = { status: Object.values(rs).map((r) => r.status).join(' '), A: out(rs.A), I: out(rs.I), TI: out(rs.TI) };
  }
  const put = async (name, r) => { snap[name] = { status: String(r.status), A: out(r) }; return r; };
  await put('PUT /api/dashboard/layout', await I('/api/dashboard/layout', 'PUT', { device: 'web', cols: 12, items: [{ id: 'vaer', x: 0, y: 0, w: 4, h: 2 }] }));
  await put('PUT /api/dashboard/layout (ugyldig)', await I('/api/dashboard/layout', 'PUT', { cols: 5 }));
  await put('PUT /api/me/theme51', await I('/api/me/theme51', 'PUT', { mode: 'dark' }));
  await put('PUT /api/me/share51', await I('/api/me/share51', 'PUT', { tasks: true }));
  await put('POST /api/search51/recent', await I('/api/search51/recent', 'POST', { q: 'melk' }));
  await put('POST /api/settings/ask', await I('/api/settings/ask', 'POST', { q: 'bakgrunn' }));
  await put('POST /api/glimt/quickparse52', await I('/api/glimt/quickparse52', 'POST', { text: 'tannlege i morgen kl 14', ai: false }));
  await put('POST /api/glimt/lex52', await I('/api/glimt/lex52', 'POST', { from: 'Strømstadd', to: 'Strømstad' }));
  await put('POST /api/crash', await N('/api/crash', 'POST', { platform: 'web', message: 'Låsetest', stack: 'at x' }));
  await put('POST /api/admin/flags51', await A('/api/admin/flags51', 'POST', { key: 'laasetest', description: 'Låsetest' }));
  await put('POST /api/admin/flags51 (bruker)', await I('/api/admin/flags51', 'POST', { key: 'laasetest2' }));
  await put('POST /api/whatsnew/seen', await I('/api/whatsnew/seen', 'POST', {}));
  await put('PUT /api/admin/local-fetch-hosts', await A('/api/admin/local-fetch-hosts', 'PUT', { hosts: ['nas.lan'] }));
  await put('POST /api/admin/impersonate (bruker)', await I('/api/admin/impersonate', 'POST', { userId: 1 }));
  await put('PUT /api/glimt/agent/fast', await I('/api/glimt/agent/fast', 'PUT', { cache: false }));
  await put('PUT /api/glimt/quality/settings', await I('/api/glimt/quality/settings', 'PUT', { weekly: false }));
  await put('POST /api/system/docker/setup (bruker)', await I('/api/system/docker/setup', 'POST', {}));
  return snap;
}

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'system-ruter.json');

test('System og drift: status og svarform er uendret', async () => {
  const snap = await snapshot();
  if (process.env.SYSTEM_RUTER_SKRIV === '1') { writeFileSync(FIX, JSON.stringify(snap, null, 1) + '\n'); return; }
  const want = JSON.parse(readFileSync(FIX, 'utf8'));
  assert.deepEqual(Object.keys(snap), Object.keys(want));
  for (const k of Object.keys(want)) assert.deepEqual(snap[k], want[k], k);
});

test('bakgrunnsjobbene for system, drift, sikkerhet og AI går via den felles planleggeren (ikke aktive i test)', async () => {
  const { listJobs } = await import('../server/jobs/index.js');
  const jobs = listJobs().filter((j) => /^(drift|backup|oppdatering|sikkerhet|kvalitet|ai)\./.test(j.name));
  // Med MOCK_DATA=1 registreres ikke omstartsvarselet og selvreparasjonen (de trenger ekte Docker).
  assert.deepEqual(jobs.map((j) => [j.name, j.everyMs]).sort(), [
    ['ai.hengende-jobber', 15_000], ['ai.hovedmodell', null], ['ai.varm-modell', null],
    ['backup.avbrutte', null], ['backup.tidsplan', 60_000],
    ['drift.backup-vedlikehold', 60_000], ['drift.krasjrapporter', 600_000], ['drift.malinger', 900_000], ['drift.varsler', 900_000],
    ['kvalitet.systemoppgaver', 3_600_000],
    ['oppdatering.auto', 60_000], ['oppdatering.sjekk', 21_600_000],
    ['sikkerhet.paminnelser', 21_600_000],
  ]);
  assert.ok(jobs.every((j) => !j.active));
});
