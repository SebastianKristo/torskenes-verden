// Prompt 51 (QA51): feature flags per bruker/enhet, krasjrapporter (lokalt + GlitchTip) og «Nytt i denne versjonen».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p51qa-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51qa';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4605';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.GLITCHTIP_DSN;
const CL = join(process.env.DATA_DIR, 'CHANGELOG.md');
writeFileSync(CL, '# Endringslogg\n\n## [4.45.0] – 25.10.2026 · prompt 51 – kvalitet\n- **Feature flags:** slå ting av og på per bruker.\n- Krasjrapporter til GlitchTip.\n\n## [4.44.0] – 24.10.2026 · prompt 50\n- Familie.\n');
process.env.CHANGELOG_PATH = CL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const qa = await import('../server/qa51.js');
const { db } = await import('../server/db.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck, extra = {}) => (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck, ...extra }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const ingridCk = await cookie('ingrid', 'ingridPassord123');
const I = as(ingridCk);
const sebId = (await A('/api/me')).body.id;
const ingridId = (await I('/api/me')).body.id;

/* ---------------- Feature flags ---------------- */

test('flagg: GET /api/flags krever innlogging og gir innebygde flagg AV som standard', async () => {
  assert.equal((await req('/api/flags')).status, 401);
  const r = await I('/api/flags');
  assert.equal(r.status, 200);
  assert.equal(r.body.flags.crash_breadcrumbs51, false);
  assert.equal(r.body.flags.glimt_proactive51, false);
  assert.ok(Object.values(r.body.flags).every((v) => v === false), 'alt nytt er av som standard');
});

test('flagg: bare admin kan se og endre; nye flagg er alltid av selv om klienten ber om på', async () => {
  assert.equal((await I('/api/admin/flags51')).status, 403);
  assert.equal((await I('/api/admin/flags51', 'POST', { key: 'ny_ting51' })).status, 403);
  const c = await A('/api/admin/flags51', 'POST', { key: 'ny_ting51', description: 'Ny ting', default: true });
  assert.equal(c.status, 201);
  assert.equal(c.body.flag.default, false);
  assert.equal((await A('/api/admin/flags51', 'POST', { key: 'ny_ting51' })).status, 409);
  assert.equal((await A('/api/admin/flags51', 'POST', { key: 'Ugyldig Navn' })).status, 400);
  assert.equal((await I('/api/flags')).body.flags.ny_ting51, false);
  const list = await A('/api/admin/flags51');
  assert.equal(list.status, 200);
  assert.ok(list.body.flags.some((f) => f.key === 'ny_ting51'));
  assert.ok(list.body.users.some((u) => u.id === ingridId));
});

test('flagg: rekkefølge enhet > bruker > standard, og enheter fra X-Device-Id / enhetscookie', async () => {
  const devI = as(ingridCk, { 'x-device-id': 'ingrid-iphone-0001', 'x-device-name': 'Ingrids iPhone', 'x-client-platform': 'ios' });
  const f0 = await devI('/api/flags');
  assert.match(f0.body.device, /^app-[0-9a-f]{16}$/);
  const dev = f0.body.device;
  // Standard på for alle
  assert.equal((await A('/api/admin/flags51/ny_ting51', 'PATCH', { default: true })).status, 200);
  assert.equal((await A('/api/flags')).body.flags.ny_ting51, true);
  // Av for Ingrid
  assert.equal((await A('/api/admin/flags51/ny_ting51/override', 'PUT', { scope: 'user', user: ingridId, value: false })).status, 200);
  assert.equal((await I('/api/flags')).body.flags.ny_ting51, false);
  assert.equal((await A('/api/flags')).body.flags.ny_ting51, true);
  // Men på for iPhonen hennes
  assert.equal((await A('/api/admin/flags51/ny_ting51/override', 'PUT', { scope: 'device', user: ingridId, device: dev, value: true })).status, 200);
  assert.equal((await devI('/api/flags')).body.flags.ny_ting51, true);
  assert.equal((await I('/api/flags')).body.flags.ny_ting51, false);
  // Enhetslisten for admin har navnet
  const l = await A('/api/admin/flags51');
  assert.ok(l.body.devices.some((d) => d.device === dev && d.name === 'Ingrids iPhone' && d.platform === 'ios' && d.user === ingridId));
  // Fjern overstyringene
  assert.equal((await A('/api/admin/flags51/ny_ting51/override', 'PUT', { scope: 'device', user: ingridId, device: dev, value: null })).status, 200);
  assert.equal((await devI('/api/flags')).body.flags.ny_ting51, false);
  assert.equal((await A('/api/admin/flags51/ny_ting51/override', 'PUT', { scope: 'device', user: ingridId, device: 'feil', value: true })).status, 400);
  assert.equal((await A('/api/admin/flags51/ny_ting51/override', 'PUT', { scope: 'user', user: 'finnes-ikke', value: true })).status, 404);
  assert.equal(qa.flagOn51('ny_ting51', sebId), true);
  assert.equal(qa.flagOn51('ukjent51', sebId), false);
  // Innebygde kan ikke slettes, egne kan
  assert.equal((await A('/api/admin/flags51/crash_breadcrumbs51', 'DELETE')).status, 400);
  assert.equal((await A('/api/admin/flags51/ny_ting51', 'DELETE')).status, 200);
  assert.equal('ny_ting51' in (await A('/api/flags')).body.flags, false);
});

/* ---------------- Krasjrapporter ---------------- */

test('krasj: vasker hemmeligheter og lagrer lokalt uten GlitchTip; bare admin ser dem', async () => {
  qa._resetCrashLimits51();
  const r = await I('/api/crash', 'POST', {
    platform: 'web', release: '4.45.0', level: 'error',
    message: 'TypeError: x is undefined (token=fh_pat_abcdefghijklmnopqrstuvwxyz123 sebastian@kristo.no)',
    stack: 'at render (https://os.example/assets/js/app.js?v=abc:10:5)\nat Bearer abcdefghijklmnop1234',
    url: 'https://os.example/finans/?token=hemmelig#/kv?id=4', extra: { apiKey: 'sk-ant-1234567890abcdefghij', route: 'kv', password: 'x' },
  });
  assert.equal(r.status, 202);
  assert.equal(r.body.forwarding, false);
  const id = r.body.id;
  assert.equal((await I(`/api/admin/crashes51/${id}`)).status, 403);
  assert.equal((await I('/api/admin/crashes51')).status, 403);
  const d = await A(`/api/admin/crashes51/${id}`);
  assert.equal(d.status, 200);
  const all = JSON.stringify(d.body);
  for (const bad of ['fh_pat_abc', 'sebastian@kristo.no', 'hemmelig', 'sk-ant-123', 'abcdefghijklmnop1234']) assert.ok(!all.includes(bad), `lekket: ${bad}`);
  assert.equal(d.body.crash.url, '/finans/#/kv');
  assert.equal(d.body.crash.user.id, ingridId);
  assert.equal(d.body.crash.extra.apiKey, '[fjernet]');
  assert.equal(d.body.crash.extra.route, 'kv');
  const s = await A('/api/admin/crashes51/status');
  assert.equal(s.body.glitchtip.configured, false);
  assert.match(s.body.glitchtip.note, /lokalt/);
});

test('krasj: dedup i en time, størrelsesgrense, validering og ratebegrensning uten innlogging', async () => {
  qa._resetCrashLimits51();
  const rep = { platform: 'ios', message: 'Fatal error: Index out of range 17', stack: 'Shell.swift:120' };
  const a = await req('/api/crash', { method: 'POST', body: rep, headers: { 'x-forwarded-for': '203.0.113.9' } });
  const b = await req('/api/crash', { method: 'POST', body: { ...rep, message: 'Fatal error: Index out of range 18' }, headers: { 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(a.status, 202);
  assert.equal(a.body.id, b.body.id, 'samme feil (tall normalisert) telles opp');
  assert.equal(db.prepare('SELECT count FROM crash51 WHERE id=?').get(a.body.id).count, 2);
  assert.equal((await req('/api/crash', { method: 'POST', body: { platform: 'nokia', message: 'x' } })).status, 400);
  assert.equal((await req('/api/crash', { method: 'POST', body: { platform: 'web' } })).status, 400);
  assert.equal((await req('/api/crash', { method: 'POST', raw: 'ikke json' })).status, 400);
  const big = await req('/api/crash', { method: 'POST', body: { platform: 'web', message: 'x'.repeat(70 * 1024) } });
  assert.equal(big.status, 413);
  // Uten innlogging: maks 10 per minutt per IP
  let last;
  for (let i = 0; i < 12; i++) last = await req('/api/crash', { method: 'POST', body: { platform: 'web', message: `feil nr ${'abcdefghijkl'[i]}` }, headers: { 'x-forwarded-for': '203.0.113.50' } });
  assert.equal(last.status, 429);
  // Flere i én forespørsel
  qa._resetCrashLimits51();
  const many = await I('/api/crash', 'POST', { reports: [{ platform: 'android', message: 'NullPointerException a' }, { platform: 'android', message: 'IllegalStateException b' }, { platform: 'zz', message: 'c' }] });
  assert.equal(many.status, 202);
  assert.equal(many.body.ids.length, 2);
});

test('krasj: videresending til GlitchTip bare i huset, nøkkelen aldri ut, og ny sending når den er oppe igjen', async () => {
  qa._resetCrashLimits51();
  const sent = [];
  let up = false;
  qa._setForwardFetch51(async (url, opt) => { if (!up) throw new TypeError('fetch failed'); sent.push({ url, opt }); return new Response('{}', { status: 200 }); });
  process.env.GLITCHTIP_DSN = 'https://hemmeligNokkel123@app.glitchtip.com/7';
  let s = await A('/api/admin/crashes51/status');
  assert.equal(s.body.glitchtip.active, false, 'ekstern vert brukes ikke uten GLITCHTIP_ALLOW_EXTERNAL');
  assert.ok(!JSON.stringify(s.body).includes('hemmeligNokkel123'));
  process.env.GLITCHTIP_DSN = 'http://hemmeligNokkel123@glitchtip:8000/3';
  s = await A('/api/admin/crashes51/status');
  assert.equal(s.body.glitchtip.active, true);
  assert.equal(s.body.glitchtip.host, 'glitchtip:8000');
  assert.ok(!JSON.stringify(s.body).includes('hemmeligNokkel123'));
  const r = await I('/api/crash', 'POST', { platform: 'android', message: 'OutOfMemoryError i bilde', release: '4.45.0' });
  const f1 = await qa.forwardCrash51(r.body.id);
  assert.equal(f1.forwarded, false);
  assert.match(f1.error, /svarer ikke/);
  up = true;
  const fl = await A('/api/admin/crashes51/flush', 'POST');
  assert.ok(fl.body.sent >= 1);
  const ev = sent.find((x) => JSON.parse(x.opt.body).message.formatted === 'OutOfMemoryError i bilde');
  assert.ok(ev);
  assert.equal(ev.url, 'http://glitchtip:8000/api/3/store/');
  assert.match(ev.opt.headers['x-sentry-auth'], /sentry_key=hemmeligNokkel123/);
  const body = JSON.parse(ev.opt.body);
  assert.equal(body.release, '4.45.0');
  assert.notEqual(body.user.id, ingridId, 'brukeren sendes som anonym hash');
  assert.equal(db.prepare('SELECT forwarded FROM crash51 WHERE id=?').get(r.body.id).forwarded, 1);
  assert.equal(qa.isLocalHost51('10.69.1.39'), true);
  assert.equal(qa.isLocalHost51('sentry.io'), false);
  delete process.env.GLITCHTIP_DSN;
});

test('krasj: serverfeil fra app.onError havner i samme lager', async () => {
  process.env.QA51_CAPTURE_TEST = '1';
  qa.reportServerError51(new Error('Boom i ruten med passord=hemmelig'), { req: { path: '/api/x', method: 'GET' } });
  delete process.env.QA51_CAPTURE_TEST;
  const l = await A('/api/admin/crashes51?platform=server');
  assert.ok(l.body.crashes.some((x) => /Boom i ruten/.test(x.message) && !x.message.includes('hemmelig')));
});

/* ---------------- Nytt i denne versjonen ---------------- */

test('nytt i versjonen: siste CHANGELOG-seksjon som JSON, vises én gang per bruker', async () => {
  assert.equal((await req('/api/whatsnew')).status, 401);
  const w = await I('/api/whatsnew');
  assert.equal(w.status, 200);
  assert.equal(w.body.version, '4.45.0');
  assert.equal(w.body.title, 'Kvalitet'); // prompt 52: interne merknader («prompt 51») fjernes fra tittelen; title_raw har originalen
  assert.equal(w.body.title_raw, 'prompt 51 – kvalitet');
  assert.deepEqual(w.body.items, ['Feature flags: slå ting av og på per bruker.', 'Krasjrapporter til GlitchTip.']);
  assert.match(w.body.markdown, /\*\*Feature flags:\*\*/);
  assert.equal(w.body.show, true);
  assert.equal((await I('/api/whatsnew/seen', 'POST', { version: 'tull' })).status, 400);
  assert.equal((await I('/api/whatsnew/seen', 'POST', { version: '4.45.0' })).status, 200);
  const w2 = await I('/api/whatsnew');
  assert.equal(w2.body.show, false);
  assert.equal(w2.body.seen, true);
  assert.equal((await A('/api/whatsnew')).body.show, true, 'per bruker');
  const old = await I('/api/whatsnew?version=4.44.0');
  assert.equal(old.body.version, '4.44.0');
  assert.equal(old.body.show, false);
  assert.equal((await I('/api/whatsnew?version=1.0.0')).status, 404);
});
