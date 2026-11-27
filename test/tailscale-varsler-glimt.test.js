// Tailscale (prompt 57): varselreglene (offline > 10 min, nøkkel om 7 d, ny enhet, DERP > 1 t; én gang per hendelse; av/på globalt
// og per enhet), Glimt-verktøyet tailscale.status (bare lesing, bare admin) og enhetene i felles søk. Eksempeldata (MOCK_DATA=1), uten nett.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-ts-varsel-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-ts57';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.TAILSCALE_SOCKET = join(DATA, 'ingen.sock');
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const auth = await import('../server/auth/session.js');
const V = await import('../server/tailscale/varsler.js');
const G = await import('../server/tailscale/glimt.js');
const TS = await import('../server/tailscale/index.js');
const P = await import('../server/glimt/plan.js');
const { TOOL45 } = await import('../server/glimt/tools.js');
const { SENTENCES46 } = await import('../server/glimt/tools-weather-subs.js');

const MIN = 60_000, NOW = Date.parse('2026-11-27T10:00:00Z');
const dev = (id, o = {}) => ({ id, name: id, kind: 'server', online: true, lastSeen: null, tunnel: 'direkte', expiresInDays: 100, keyExpiry: '2027-03-01T00:00:00.000Z', ip: '100.64.0.9', os: 'linux', ...o });

test('offline: bare servere, etter 10 min, én gang per gang den går ned', () => {
  let r = V.evaluer(null, [dev('hytta', { online: false, lastSeen: new Date(NOW - 5 * MIN).toISOString() }), dev('mob', { kind: 'mobile', online: false, lastSeen: new Date(NOW - 60 * MIN).toISOString() })], NOW);
  assert.deepEqual(r.alerts, [], 'under 10 min, og mobilen varsler ikke');
  r = V.evaluer(r.state, [dev('hytta', { online: false, lastSeen: new Date(NOW - 5 * MIN).toISOString() })], NOW + 6 * MIN);
  assert.deepEqual(r.alerts.map((a) => [a.type, a.id, a.title]), [['offline', 'hytta', 'hytta er offline']]);
  r = V.evaluer(r.state, [dev('hytta', { online: false, lastSeen: new Date(NOW - 5 * MIN).toISOString() })], NOW + 30 * MIN);
  assert.deepEqual(r.alerts, [], 'ikke igjen');
  r = V.evaluer(r.state, [dev('hytta')], NOW + 40 * MIN);
  r = V.evaluer(r.state, [dev('hytta', { online: false, lastSeen: new Date(NOW + 41 * MIN).toISOString() })], NOW + 55 * MIN);
  assert.equal(r.alerts.length, 1, 'ny gang den går ned → nytt varsel');
});

test('nøkkel om 7 dager, ny enhet (ikke første runde) og DERP over en time', () => {
  let r = V.evaluer(null, [dev('a', { expiresInDays: 7, keyExpiry: '2026-12-04T10:00:00.000Z' }), dev('b', { expiresInDays: 8 })], NOW);
  assert.deepEqual(r.alerts.map((a) => [a.type, a.id, a.body]), [['nokkel', 'a', 'Nøkkelen utløper om 7 dager.']]);
  r = V.evaluer(r.state, [dev('a', { expiresInDays: 6, keyExpiry: '2026-12-04T10:00:00.000Z' })], NOW + 86_400_000);
  assert.deepEqual(r.alerts, [], 'én gang per utløpsdato');
  assert.deepEqual(V.evaluer(null, [dev('ny')], NOW, { nye: ['ny'], forste: true }).alerts, [], 'første runde: ingen «ny enhet»');
  assert.deepEqual(V.evaluer(null, [dev('ny')], NOW, { nye: ['ny'] }).alerts.map((a) => a.title), ['Ny enhet i tailnetet']);
  r = V.evaluer(null, [dev('c', { tunnel: 'derp:osl' })], NOW);
  r = V.evaluer(r.state, [dev('c', { tunnel: 'derp:osl' })], NOW + 61 * MIN);
  assert.deepEqual(r.alerts.map((a) => [a.type, a.body]), [['derp', 'Ingen direkte forbindelse på over en time (relay osl).']]);
});

test('av/på: globalt og per enhet', () => {
  const pa = new Set(['nokkel']);
  const list = [dev('a', { expiresInDays: 3, keyExpiry: 'x1' }), dev('b', { expiresInDays: 3, keyExpiry: 'x2' })];
  assert.deepEqual(V.evaluer(null, list, NOW, { pa, av: (id) => new Set(id === 'b' ? ['nokkel'] : []) }).alerts.map((a) => a.id), ['a']);
  assert.deepEqual(V.evaluer(null, list, NOW, { pa: new Set(['offline']) }).alerts, []);
  assert.deepEqual(V.settVarsler('nX', { offline: false, tull: false }), { offline: false, nokkel: true, ny: true, derp: true });
  assert.deepEqual(V.varslerFor('nX'), { offline: false, nokkel: true, ny: true, derp: true });
  assert.deepEqual(V.settVarsler('nX', { offline: true }), { offline: true, nokkel: true, ny: true, derp: true });
});

test('jobben: prøver og varsler til administratorene (demo: nøkkelen til pihole utløper om 6 d)', async () => {
  const r1 = await TS.taProver();
  assert.ok(r1.antall > 5);
  const q = db.prepare("SELECT title FROM notify_queue WHERE category='system' AND title LIKE 'Nøkkelen til%'").pluck().all();
  assert.ok(q.includes('Nøkkelen til pihole utløper'), q.join(' | '));
  assert.equal(db.prepare("SELECT count(*) FROM notify_queue WHERE title='Ny enhet i tailnetet'").pluck().get(), 0, 'første runde varsler ikke om nye');
});

test('Glimt: tolkingen av de tre spørsmålene', () => {
  assert.deepEqual(G.tolk('Hvilke maskiner er nede?'), { sporsmal: 'nede', enhet: '' });
  assert.deepEqual(G.tolk('hva er IP-en til unraid?'), { sporsmal: 'ip', enhet: 'unraid' });
  assert.deepEqual(G.tolk('Hvor lenge har hytta vært offline?'), { sporsmal: 'offline_siden', enhet: 'hytta' });
  assert.equal(G.tolk('Hvor er M3-skruene?'), null);
});

test('Glimt: tailscale.status svarer med setning, kort og kilde (bare admin, bare lesing)', async () => {
  const me = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
  const t = TOOL45['tailscale.status'];
  assert.equal(t.destructive, false);
  const run = async (text) => {
    const v = await t.validate({}, { user: me, text });
    const r = await t.run(v.args, { user: me, text });
    return { r, s: SENTENCES46['tailscale.status'](v.args, r) };
  };
  const a = await run('Hvilke maskiner er nede?');
  assert.match(a.s, /^Én maskin er nede: hytta \(sist sett 3 d\)\./, 'mobil og nettbrett regnes ikke som nede');
  assert.match(a.s, /Kilde: Tailscale · lest \d\d:\d\d\.$/);
  assert.ok(a.r.cards.every((c) => c.kind === 'tailnet.device'));
  const b = await run('hva er IP-en til unraid?');
  assert.match(b.s, /^IP-en til unraid er 100\.101\.0\.2 \(unraid\.tail-demo\.ts\.net\)\./);
  assert.equal(b.r.cards[0].kind, 'tailnet.ip');
  const c = await run('Hvor lenge har hytta vært offline?');
  assert.match(c.s, /^hytta har vært offline i 3 dager\./);
  assert.equal(c.r.cards[0].stripe.length, 30);
  // Lokal plan bare for admin.
  auth.createUser({ username: 'ingrid', password: 'ingridpassord', role: 'bruker' });
  const ingrid = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
  assert.equal(P.localPlan45('Hvilke maskiner er nede?', { user: me }).calls[0].tool, 'tailscale.status');
  assert.notEqual(P.localPlan45('Hvilke maskiner er nede?', { user: ingrid }).calls[0]?.tool, 'tailscale.status');
  assert.deepEqual(await t.validate({ sporsmal: 'nede' }, { user: ingrid, text: 'nede?' }), { error: 'Bare administratorer kan se tailnetet' });
});

test('⌘K: enhetene i felles søk for admin, ikke for andre', async () => {
  const login = async (u, p) => (await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify({ username: u, password: p }) })).headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
  const get = async (cookie) => (await app.request('/api/search51?q=unraid', { headers: { cookie, 'x-forwarded-for': '198.51.100.9' } })).json();
  const a = await get(await login('sebastian', 'testpassord1'));
  const hit = a.results.find((r) => r.type === 'tailnet');
  assert.ok(hit, JSON.stringify(a.groups));
  assert.equal(hit.title, 'unraid');
  assert.ok(hit.actions.some((x) => x.kind === 'copy' && x.value === '100.101.0.2'));
  const b = await get(await login('ingrid', 'ingridpassord'));
  assert.ok(!b.results.some((r) => r.type === 'tailnet'));
});
