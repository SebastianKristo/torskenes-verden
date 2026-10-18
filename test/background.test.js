// Prompt 19 (server): felles bakgrunnstjeneste. MET, NASA, Unsplash og Pexels mockes; sandkassen har ikke nett.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-bg19-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');
const { default: mobile } = await import('../server/mobile.js');
const BG = await import('../server/background.js');
const { default: bg } = BG;
const { updateConfig } = await import('../server/settings.js');
const local = (u) => u.replace(/^\/api\/background/, '');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const req = (app) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};
const M = req(mobile), B = req(bg);

function withFetch(handler) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), opts }); const r = await handler(String(url), opts); return r ?? new Response('{}', { status: 404 }); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
// Et lite, gyldig JPEG-hode (nok for typesjekken).
const JPEG = () => new Response(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]), { headers: { 'content-type': 'image/jpeg' } });
const live = async (fn) => { delete process.env.MOCK_DATA; try { return await fn(); } finally { process.env.MOCK_DATA = '1'; } };

test('symbol_code kartlegges til kind', () => {
  const k = BG.weatherKindOf;
  assert.equal(k('clearsky_day'), 'clear');
  assert.equal(k('fair_night'), 'partly');
  assert.equal(k('partlycloudy_day'), 'partly');
  assert.equal(k('cloudy'), 'cloudy');
  assert.equal(k('lightrainshowers_day'), 'rain');
  assert.equal(k('heavysleet'), 'snow');
  assert.equal(k('snow'), 'snow');
  assert.equal(k('fog'), 'fog');
  assert.equal(k('rainandthunder'), 'thunder');
});

test('MOCK_DATA: vær gir realistisk svar med medfølgende bilde og innstillinger', async () => {
  const r = await B('/?type=weather&w=400&dpr=2');
  assert.equal(r.status, 200);
  const b = r.body;
  assert.equal(b.type, 'weather');
  assert.deepEqual(b.weather, { symbol: 'partlycloudy_day', kind: 'partly', isDay: true, temp: 9 });
  assert.match(b.image_url, /^\/api\/background\/img\/b-weather-cloudy\?w=800$/);
  assert.equal(b.particles, null);
  assert.ok(['light', 'dark'].includes(b.theme_hint));
  assert.match(b.gradient, /^linear-gradient/);
  assert.ok(b.colors.length >= 2 && b.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)));
  assert.ok(!Number.isNaN(Date.parse(b.next)));
  assert.deepEqual(Object.keys(b.settings).sort(), ['animate', 'blur', 'dim', 'planet', 'planetRotate', 'type', 'wifiOnly']);
  const img = await bg.request(local(b.image_url), { headers: H });
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-type'), /^image\//);
  assert.match(img.headers.get('cache-control'), /max-age/);
  const etag = img.headers.get('etag');
  assert.ok(etag);
  const again = await bg.request(local(b.image_url), { headers: { ...H, 'if-none-match': etag } });
  assert.equal(again.status, 304);
});

test('uten innlogging: 401', async () => {
  const r = await bg.request('/?type=weather');
  assert.equal(r.status, 401);
  assert.equal((await bg.request('/img/b-oslo')).status, 401);
});

test('vær fra MET (compact + Sunrise) med Unsplash-bilde, regn gir partikler og fotografkreditering', async () => {
  BG._clearWeather(); BG._clearSearch();
  await M('/me/layout', 'PUT', { bgType: 'weather' });
  updateConfig({ unsplash_key: 'u-test' });
  const f = withFetch((url, opts) => {
    if (url.includes('api.met.no/weatherapi/locationforecast/2.0/compact')) {
      assert.ok(opts.headers?.['User-Agent'] || opts.headers?.['user-agent']);
      return json({ properties: { timeseries: [{ time: new Date().toISOString(), data: { instant: { details: { air_temperature: 4.4 } }, next_1_hours: { summary: { symbol_code: 'rain' } } } }] } });
    }
    if (url.includes('api.met.no/weatherapi/sunrise/3.0/sun')) {
      const d = new Date(); const at = (h) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h)).toISOString();
      return json({ properties: { sunrise: { time: at(0) }, sunset: { time: at(23) } } });
    }
    if (url.includes('api.unsplash.com/search/photos')) {
      assert.equal(opts.headers.Authorization, 'Client-ID u-test');
      return json({ total: 1, results: [{ id: 'abc', urls: { raw: 'https://images.unsplash.com/photo-rain', regular: 'https://images.unsplash.com/photo-rain?w=1080' }, links: { html: 'https://unsplash.com/photos/abc', download_location: 'https://api.unsplash.com/photos/abc/download' }, user: { name: 'Kari Nordmann', links: { html: 'https://unsplash.com/@kari' } }, width: 4000, height: 3000 }] });
    }
    if (url.startsWith('https://images.unsplash.com/')) return JPEG();
    if (url.includes('/download')) return json({});
  });
  try {
    const b = await live(async () => (await B('/?w=1080')).body);
    assert.equal(b.type, 'weather');
    assert.equal(b.weather.kind, 'rain');
    assert.equal(b.weather.temp, 4.4);
    assert.equal(b.particles, 'rain');
    assert.match(b.image_url, /^\/api\/background\/img\/[a-f0-9]{16}\?w=1080$/);
    assert.equal(b.fallbacks.length, 1);
    assert.match(b.credit.text, /Kari Nordmann/);
    assert.match(b.credit.url, /utm_source=/);
    assert.equal(b.credit.source, 'Unsplash');
    assert.ok(f.calls.some((c) => c.url.includes('sunrise/3.0')));
    // Andre kall innen 30 min bruker cachen: ingen nye MET-kall.
    const n = f.calls.filter((c) => c.url.includes('locationforecast')).length;
    await live(() => B('/?w=1080'));
    assert.equal(f.calls.filter((c) => c.url.includes('locationforecast')).length, n);
    const img = await bg.request(local(b.image_url), { headers: H });
    assert.equal(img.status, 200);
  } finally { f.restore(); updateConfig({ unsplash_key: null }); BG._clearSearch(); }
});

test('planeter fra NASA: valgt planet, kreditering og fast rotasjon', async () => {
  const f = withFetch((url) => {
    if (url.startsWith('https://images-api.nasa.gov/search')) {
      const q = new URL(url).searchParams.get('q');
      return json({ collection: { items: [{ data: [{ nasa_id: `PIA-${q.length}`, title: `${q} bilde` }], links: [{ href: `https://images-assets.nasa.gov/image/x/x~thumb.jpg`, render: 'image' }] }] } });
    }
    if (url.startsWith('https://images-assets.nasa.gov/')) return JPEG();
  });
  try {
    await M('/me/layout', 'PUT', { bgType: 'planets', bgPlanet: 'jupiter', bgRotate: 'hourly' });
    const b = await live(async () => (await B('/')).body);
    assert.equal(b.type, 'planets');
    assert.equal(b.planet, 'jupiter');
    assert.equal(b.theme_hint, 'dark');
    assert.match(b.credit.text, /^NASA · Jupiter Juno/);
    assert.match(b.credit.url, /images\.nasa\.gov\/details\/PIA-/);
    assert.ok(f.calls.some((c) => c.url.includes('q=Jupiter%20Juno') && c.url.includes('media_type=image')));
    assert.ok(f.calls.some((c) => c.url.endsWith('~large.jpg')));
    assert.ok(Date.parse(b.next) - Date.now() <= 3600_000);
    // auto roterer gjennom alle fire.
    await M('/me/layout', 'PUT', { bgPlanet: 'auto', bgRotate: 'daily' });
    const seen = new Set();
    for (let d = 0; d < 4; d++) seen.add((await BG.backgroundFor(null, { type: 'planets', now: Date.now() + d * 86400_000 })).planet);
    assert.deepEqual([...seen].sort(), ['earth', 'jupiter', 'mars', 'moon']);
  } finally { f.restore(); }
});

test('layout: bg-felt valideres og photo speiles begge veier', async () => {
  for (const [k, v] of [['bgBlur', 21], ['bgBlur', 2.5], ['bgDim', 61], ['bgType', 'getty'], ['bgPlanet', 'saturn'], ['bgRotate', 'weekly'], ['bgWifiOnly', 'ja'], ['bgAnimate', 1]]) {
    assert.equal((await M('/me/layout', 'PUT', { [k]: v })).status, 400, `${k}=${v}`);
  }
  let r = await M('/me/layout', 'PUT', { bgType: 'oslo', bgBlur: 12, bgDim: 40, bgWifiOnly: true, bgAnimate: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.photo, 'oslo');
  r = await M('/me/layout');
  assert.equal(r.body.bgType, 'oslo'); assert.equal(r.body.bgBlur, 12); assert.equal(r.body.bgDim, 40);
  assert.equal(r.body.bgWifiOnly, true); assert.equal(r.body.bgAnimate, false);
  r = await M('/me/layout', 'PUT', { photo: 'weather' });
  assert.equal(r.body.bgType, 'weather');
  r = await M('/me/layout', 'PUT', { bgType: 'none' });
  assert.equal(r.body.photo, 'cur');
  const b = (await B('/')).body;
  assert.equal(b.type, 'none');
  assert.equal(b.image_url, null);
  assert.deepEqual({ blur: b.settings.blur, dim: b.settings.dim, wifiOnly: b.settings.wifiOnly, animate: b.settings.animate }, { blur: 12, dim: 40, wifiOnly: true, animate: false });
});

test('Oslo: egne bilder (admin), dagens bilde, sletting og reserve', async () => {
  let b = (await B('/?type=oslo')).body;
  assert.match(b.image_url, /b-oslo/);
  assert.match(b.credit.text, /Unsplash- eller Pexels-nøkkel/);
  const fd = new FormData();
  fd.append('file', new File([Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)])], 'oslo.jpg', { type: 'image/jpeg' }));
  fd.append('file', new File([Buffer.from('ikke et bilde')], 'tekst.txt', { type: 'text/plain' }));
  const up = await bg.request('/oslo', { method: 'POST', headers: { authorization: H.authorization }, body: fd });
  const ub = await up.json();
  assert.equal(up.status, 201, JSON.stringify(ub));
  assert.equal(ub.added.length, 1);
  assert.equal(ub.errors.length, 1);
  const id = ub.added[0];
  assert.match(id, /^o-[a-f0-9]{16}$/);
  b = (await B('/?type=oslo')).body;
  assert.match(b.image_url, new RegExp(id));
  assert.equal(b.credit.source, 'Eget bilde');
  assert.equal((await bg.request(`/img/${id}`, { headers: H })).status, 200);
  assert.equal((await B('/oslo')).body.items.length, 1);
  assert.equal((await B(`/oslo/${id}`, 'DELETE')).status, 200);
  assert.equal((await B('/oslo')).body.items.length, 0);
  assert.equal((await bg.request(`/img/${id}`, { headers: H })).status, 404);
  assert.equal((await bg.request('/img/..%2Fsecret', { headers: H })).status, 404);
});

test('forhåndsvisning gir alle typer', async () => {
  const r = await B('/previews');
  assert.equal(r.status, 200);
  for (const t of ['weather', 'planets', 'oslo', 'custom', 'none']) assert.ok(r.body[t] && 'image_url' in r.body[t] && 'theme_hint' in r.body[t], t);
  assert.match(r.body.planets.image_url, /b-planets-/);
});

test('Test tilkobling: uten nøkler, og med Unsplash-nøkkel', async () => {
  assert.equal(BG.hasBackgroundTest('backgrounds'), true);
  let t = await BG.testBackgrounds();
  assert.equal(t.ok, false);
  updateConfig({ unsplash_key: 'u-test' });
  const f = withFetch((url) => (url.includes('api.unsplash.com/search/photos') ? json({ total: 42, results: [] }) : null));
  try { t = await BG.testBackgrounds(); assert.equal(t.ok, true); assert.match(t.message, /42/); }
  finally { f.restore(); updateConfig({ unsplash_key: null }); }
});
