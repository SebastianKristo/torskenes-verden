// Prompt 14 (server): bakgrunnsbilder, transportørlogoer, Ruter-farger, sporingsvalg per bruker, trkOrder/onboarded og Papir som standard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-s14-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { kv, OWNER } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const { default: fin } = await import('../server/finans/routes.js');
const { default: mobile, designOf } = await import('../server/mobile.js');
const bg = await import('../server/bg.js');
const ext = await import('../server/integrations.js');
const { default: trk } = await import('../server/tracking.js');
const car = await import('../server/tracking-carriers.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const req = (app) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};
const M = req(mobile), T = req(trk);

test('ny installasjon: Papir og onboarding; eksisterende beholder Nåværende og Klassisk', async () => {
  assert.equal(auth.installKind(), 'papir', 'tom database');
  const g = (await M('/me/layout')).body;
  assert.deepEqual([g.hlTheme, g.mobileDesign, g.onboarded, g.photo], ['2c', 'papir', false, 'oslo']);
  assert.deepEqual(g.trkOrder, ['add', 'shipments', 'notify', 'carriers']);
  kv.set(OWNER, 'install_kind', 'legacy');
  const d = designOf(OWNER);
  assert.deepEqual([d.hlTheme, d.mobileDesign, d.onboarded, d.photo], ['cur', 'klassisk', true, 'cur']);
  kv.set(OWNER, 'install_kind', 'papir');
});

test('layout: onboarded og trkOrder lagres og valideres', async () => {
  assert.equal((await M('/me/layout', 'PUT', { onboarded: true, trkOrder: ['notify', 'add'] })).status, 200);
  const g = (await M('/me/layout')).body;
  assert.equal(g.onboarded, true);
  assert.deepEqual(g.trkOrder, ['notify', 'add', 'shipments', 'carriers'], 'manglende kort legges til bakerst');
  for (const b of [{ onboarded: 'ja' }, { trkOrder: ['add', 'add'] }, { trkOrder: ['tull'] }, { trkOrder: 'add' }]) {
    assert.equal((await M('/me/layout', 'PUT', b)).status, 400, JSON.stringify(b));
  }
});

test('bakgrunn: lokale bilder for Oslo, vær og planeter, med reserver', async () => {
  const o = (await M('/photo-window?kind=oslo')).body;
  assert.equal(o.url, '/api/bg/oslo.jpg');
  assert.match(o.shade, /linear-gradient\(180deg/);
  const p = (await M('/photo-window?kind=planets')).body;
  assert.match(p.url, /^\/api\/bg\/(apod-|planets-)/);
  assert.ok(p.fallbacks.length >= 2);
  for (const f of [o.url, p.fallbacks[0]]) {
    const r = await mobile.request(f.replace('/api', ''), { headers: { authorization: H.authorization } });
    assert.equal(r.status, 200, f);
    assert.match(r.headers.get('cache-control'), /max-age/);
  }
  assert.equal((await mobile.request('/bg/oslo.jpg')).status, 401, 'krever innlogging');
  assert.equal((await mobile.request('/bg/..%2Fsecret.jpg', { headers: { authorization: H.authorization } })).status, 404);
  const map = { clearsky_day: 'clear', partlycloudy_day: 'cloudy', cloudy: 'cloudy', lightrain: 'rain', heavyrainandthunder: 'rain', snow: 'snow', lightsleet: 'snow', fog: 'fog', clearsky_night: 'night' };
  for (const [s, k] of Object.entries(map)) assert.equal(bg.weatherKind(s), k, s);
  assert.equal(bg.weatherImages('lightrain')[0], '/api/bg/weather-rain.jpg');
  assert.equal(bg.weatherImages('lightrain').length, 6);
  for (const k of bg.WEATHER_SET) assert.ok(await bg.readBg(`weather-${k}.jpg`), k);
});

test('APOD lastes ned én gang og leveres lokalt; video gir planetbilde', async () => {
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 1)]);
  let calls = 0;
  const fetchFn = async () => { calls++; return new Response(jpg); };
  const a = { media_type: 'image', url: 'https://apod.nasa.gov/apod/image/2610/x.jpg', date: '2026-10-18' };
  assert.equal(await bg.apodImage(a, { fetchFn }), '/api/bg/apod-2026-10-18.jpg');
  assert.equal(await bg.apodImage(a, { fetchFn }), '/api/bg/apod-2026-10-18.jpg');
  assert.equal(calls, 1);
  assert.ok(existsSync(join(bg.BG_CACHE, 'apod-2026-10-18.jpg')));
  assert.equal(await bg.apodImage({ media_type: 'video', url: 'https://youtube.com/x' }, { fetchFn }), null);
});

test('transportørlogoer ligger lokalt', async () => {
  for (const id of ['postnord', 'posten', 'bring', 'dhl', 'helthjem', 'ups', 'gls', 'instabox', 'budbee']) {
    assert.equal(car.CARRIER[id].logo, `/assets/carriers/${id}.svg`);
    assert.ok(existsSync(join('public', 'carriers', `${id}.svg`)), id);
  }
  const r = (await T('/')).body;
  assert.ok(r.carriers.every((c) => c.logo.startsWith('/assets/carriers/')));
});

test('Ruter: linjefarge fra Entur, ellers Ruters standardfarger', () => {
  assert.deepEqual(ext.lineColor('metro', '5'), { color: '#EC700C', textColor: '#FFFFFF', mode: 'metro' });
  assert.equal(ext.lineColor('tram', '19').color, '#0B91EF');
  assert.equal(ext.lineColor('bus', '31').color, '#E60000');
  assert.equal(ext.lineColor('bus', '250').color, '#75A300', 'regionbuss');
  assert.equal(ext.lineColor('water', 'B9').color, '#682C88');
  assert.equal(ext.lineColor('rail', 'L1').color, '#003087');
  assert.deepEqual(ext.lineColor('bus', '31', { colour: 'e60000', textColour: 'FFFFFF' }), { color: '#E60000', textColor: '#FFFFFF', mode: 'bus' });
  assert.equal(ext.lineColor('tram', '11', { colour: 'f3d38a' }).textColor, '#1B1A17', 'mørk tekst på lys farge');
});

test('sporing: varsler per bruker, kilder med automatisk arkivering', async () => {
  const p = (await T('/prefs', 'PUT', { delayed: true, delivered: false })).body.prefs;
  assert.equal(p.delayed, true);
  assert.equal(p.delivered, false);
  assert.equal((await T('/')).body.prefs.delivered, false);
  const s = (await T('/sources', 'PUT', { autoArchive: { on: true }, email: false })).body.sources;
  assert.equal(s.autoArchive.on, true);
  assert.equal(s.email.on, false);
  assert.equal(s.finn.on, true);
});
