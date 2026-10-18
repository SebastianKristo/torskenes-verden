// Prompt 21 (server): bakgrunner er ekte foto fra Wikimedia Commons. Ferdig nedlastede filer (BG_FILES_DIR),
// nedlasting ved første bruk (fetch mockes), værkode → nøkkel, Ruter-bildet, rekkefølgen for Oslo og gradienten som siste reserve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-bg21-'));
const FILES = mkdtempSync(join(tmpdir(), 'hl-bg21-files-'));
process.env.BG_FILES_DIR = FILES;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');
const { default: mobile } = await import('../server/mobile.js');
const BG = await import('../server/background.js');
const CAT = await import('../server/backgrounds/catalog.js');
const { updateConfig } = await import('../server/settings.js');
const bg = BG.default;

const { token } = await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) })).json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const B = async (path) => { const r = await bg.request(path, { headers: H }); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const M = async (path, method, body) => (await mobile.request(path, { method, headers: H, body: JSON.stringify(body) })).status;
const GRAD = 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)';
const WEBP = (n) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(n, 1)]);
const JPEG = () => new Response(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]), { headers: { 'content-type': 'image/jpeg' } });
const live = async (fn) => { delete process.env.MOCK_DATA; try { return await fn(); } finally { process.env.MOCK_DATA = '1'; } };
function withFetch(handler) {
  const orig = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push(String(url)); return (await handler(String(url), opts)) ?? new Response('{}', { status: 404 }); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
// Ferdig nedlastede kopier slik fetch-backgrounds.mjs lager dem.
function bundle(key, file, sizes = [2000, 1080]) {
  mkdirSync(join(FILES, key), { recursive: true });
  for (const s of sizes) writeFileSync(CAT.bundledPath(FILES, key, file, s), WEBP(s === 2000 ? 400 : 100));
}

test('katalogen har filene fra spesifikasjonen, og Saturn er med', () => {
  assert.equal(CAT.CATALOG.planet[0], 'PIA21641-Jupiter-SouthernStorms-JunoCam-20170525.jpg');
  assert.ok(CAT.CATALOG.planet.includes('Saturn_during_Equinox.jpg'));
  assert.deepEqual(CAT.PLANETS, ['earth', 'moon', 'jupiter', 'mars', 'saturn']);
  assert.deepEqual(Object.keys(CAT.CATALOG).sort(), ['oslo', 'planet', 'ruter', 'vaer_klart', 'vaer_regn', 'vaer_sky']);
  assert.equal(CAT.slug('SL18_tram_performing_test_run_at_Bjørvika.jpg'), 'sl18_tram_performing_test_run_at_bjorvika');
  assert.equal(CAT.filePathUrl('Oslo_S_aerial.jpg'), 'https://commons.wikimedia.org/wiki/Special:FilePath/Oslo_S_aerial.jpg?width=2000');
  assert.deepEqual(CAT.creditFromInfo({ query: { pages: { 7: { imageinfo: [{ extmetadata: { Artist: { value: '<span>Kari &amp; Ola</span>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } } }] } } } }),
    { author: 'Kari & Ola', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0' });
});

test('værkode → vaer_klart / vaer_sky / vaer_regn', () => {
  const k = BG.vaerKey;
  assert.equal(k(0), 'vaer_klart'); assert.equal(k(1), 'vaer_klart'); assert.equal(k(2), 'vaer_sky'); assert.equal(k(45), 'vaer_sky');
  assert.equal(k(50), 'vaer_sky'); assert.equal(k(51), 'vaer_regn'); assert.equal(k(95), 'vaer_regn'); assert.equal(k('3'), 'vaer_sky');
  assert.equal(k('clearsky_day'), 'vaer_klart'); assert.equal(k('partlycloudy_night'), 'vaer_sky'); assert.equal(k('fog'), 'vaer_sky');
  assert.equal(k('lightrain'), 'vaer_regn'); assert.equal(k('heavysnow'), 'vaer_regn'); assert.equal(k(null), 'vaer_sky');
});

test('uten foto: gradient, ingen tegning (alle typer)', async () => {
  for (const t of ['weather', 'planets', 'oslo', 'ruter']) {
    const b = (await B(`/?type=${t}`)).body;
    assert.equal(b.image_url, null, t);
    assert.equal(b.gradient, GRAD, t);
  }
});

test('ferdig nedlastede foto brukes og serveres som WebP i 1080 eller 2000 px, med credits.json', async () => {
  bundle('vaer_sky', 'Cloudy_Sky_Background.jpg');
  bundle('ruter', 'SL18_tram_performing_test_run_at_Bjørvika.jpg', [2000]);
  writeFileSync(join(FILES, 'credits.json'), JSON.stringify({ 'Cloudy_Sky_Background.jpg': { author: 'Ola Fotograf', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0' } }));
  const b = (await B('/?type=weather&w=800')).body;
  assert.equal(b.key, 'vaer_sky');
  assert.match(b.image_url, /^\/api\/background\/img\/wm-[a-f0-9]{16}\?w=800$/);
  assert.equal(b.url, b.image_url);
  assert.match(b.credit.text, /Ola Fotograf · Wikimedia Commons$/);
  assert.equal(b.credit.license, 'CC BY 2.0');
  const small = await bg.request(b.image_url.replace('/api/background', ''), { headers: H });
  assert.equal(small.status, 200);
  assert.equal(small.headers.get('content-type'), 'image/webp');
  assert.equal(Buffer.from(await small.arrayBuffer()).length, 116); // 1080-varianten
  const big = await bg.request(b.image_url.replace('/api/background', '').replace('w=800', 'w=1920'), { headers: H });
  assert.equal(Buffer.from(await big.arrayBuffer()).length, 416);
  const again = await bg.request(b.image_url.replace('/api/background', ''), { headers: { ...H, 'if-none-match': small.headers.get('etag') } });
  assert.equal(again.status, 304);
  // ?code= (Open-Meteo) overstyrer: 61 = regn → vaer_regn, som har Cloudy_Sky_Background som reservefil.
  const rain = (await B('/?type=vaer&code=61')).body;
  assert.equal(rain.type, 'weather');
  assert.equal(rain.key, 'vaer_regn');
  assert.equal(rain.image_url?.split('?')[0], b.image_url.split('?')[0]);
  // Ruter-bildet
  const r = (await B('/?type=ruter')).body;
  assert.equal(r.type, 'ruter');
  assert.match(r.image_url, /wm-/);
  assert.equal(r.credit.source, 'Wikimedia Commons');
  // Kreditering for alle
  const cr = (await B('/credits')).body;
  assert.ok(cr.items.find((x) => x.file === 'Cloudy_Sky_Background.jpg' && x.bundled && x.author === 'Ola Fotograf'));
  assert.ok(cr.items.find((x) => x.file === 'Saturn_during_Equinox.jpg' && !x.bundled && /Space Science Institute/.test(x.author)));
});

test('ruter kan ikke velges som bakgrunn, saturn kan', async () => {
  assert.equal(await M('/me/layout', 'PUT', { bgType: 'ruter' }), 400);
  assert.equal(await M('/me/layout', 'PUT', { bgType: 'planets', bgPlanet: 'saturn' }), 200);
  assert.equal((await B('/?type=planets')).body.settings.planet, 'saturn');
  await M('/me/layout', 'PUT', { bgPlanet: 'auto' });
});

test('nedlasting ved første bruk: Special:FilePath width=2000, så 1280; cache; feil gir neste fil', async () => {
  BG._clearWiki();
  const f = withFetch((url) => {
    if (url.includes('Special:FilePath/Oslo_S_aerial.jpg')) return new Response('nei', { status: 404 });
    if (url.includes('Special:FilePath/Oslo_Opera_House.jpg?width=2000')) return new Response('nei', { status: 500 });
    if (url.includes('Special:FilePath/')) return JPEG();
    if (url.includes('/w/api.php')) return new Response('{}', { status: 200 });
  });
  try {
    // Dag 0: rekkefølgen starter på Oslo_S_aerial (feiler), så Operaen (2000 feiler, 1280 virker).
    const b = await live(() => BG.backgroundFor(null, { type: 'oslo', now: 0 }));
    assert.match(b.image_url, /wm-/);
    assert.equal(b.credit.file, 'Oslo_Opera_House.jpg');
    assert.ok(f.calls.includes('https://commons.wikimedia.org/wiki/Special:FilePath/Oslo_Opera_House.jpg?width=1280'));
    const n = f.calls.length;
    const again = await live(() => BG.backgroundFor(null, { type: 'oslo', now: 0 }));
    assert.equal(again.image_url, b.image_url);
    assert.equal(f.calls.length, n, 'cachen brukes, ingen nye kall');
    assert.equal((await bg.request(b.image_url.replace('/api/background', ''), { headers: H })).status, 200);
  } finally { f.restore(); }
});

test('Oslo: egne bilder går foran Unsplash, som går foran Wikimedia', async () => {
  updateConfig({ unsplash_key: 'u-test' });
  BG._clearSearch();
  const f = withFetch((url) => {
    if (url.includes('api.unsplash.com/search/photos')) return new Response(JSON.stringify({ results: [{ urls: { raw: 'https://images.unsplash.com/oslo' }, links: { html: 'https://unsplash.com/p', download_location: 'https://api.unsplash.com/photos/p/download' }, user: { name: 'Fotograf Oslo' } }] }), { headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://images.unsplash.com/')) return JPEG();
    if (url.includes('/download')) return new Response('{}');
  });
  try {
    let b = await live(() => BG.backgroundFor(null, { type: 'oslo', now: 0 }));
    assert.equal(b.credit.source, 'Unsplash');
    assert.ok(b.fallbacks.some((u) => /wm-/.test(u)), 'Wikimedia som reserve');
    const fd = new FormData();
    fd.append('file', new File([Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)])], 'oslo.jpg', { type: 'image/jpeg' }));
    const up = await bg.request('/oslo', { method: 'POST', headers: { authorization: H.authorization }, body: fd });
    assert.equal(up.status, 201);
    b = await live(() => BG.backgroundFor(null, { type: 'oslo', now: 0 }));
    assert.equal(b.credit.source, 'Eget bilde');
  } finally { f.restore(); updateConfig({ unsplash_key: null }); BG._clearSearch(); }
});

test('henger ikke når Commons ikke svarer: venter høyst budsjettet og gir gradient', async () => {
  BG._clearWiki();
  const f = withFetch(() => new Promise(() => {})); // svarer aldri
  try {
    const t0 = Date.now();
    const pick = await live(() => BG.wikiPick(['Ukjent_fil_som_ikke_finnes.jpg'], { budget: 300 }));
    assert.equal(pick, null);
    assert.ok(Date.now() - t0 < 2000);
  } finally { f.restore(); }
});
