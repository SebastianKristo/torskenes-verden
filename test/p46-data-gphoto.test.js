// Prompt 46 (DATA46): Google Photos-album som bakgrunn – lenkekontroll, SSRF-vern (verter, redirecter, private IP-er, størrelse),
// uttrekk av bilder fra albumsiden (lagret, syntetisk side), nedlasting per bruker, rotasjon hver time, «behold siste bilde» ved feil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p46g-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-46g';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4262';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const G = await import('../server/gphoto46.js');
const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'p46', 'gphoto-album.html'), 'utf8');

let ipN = 60;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch { /* */ }
  return { status: r.status, body: j, buf, text: buf.toString('utf8'), headers: r.headers };
}
async function cookieFor(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ipN++}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await cookieFor('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await cookieFor('ingrid', 'ingridPassord123') });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
function png1x1(r, g, b) {
  const crc = (buf) => { let c, crcT = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } let x = 0xffffffff; for (const v of buf) x = crcT[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, r, g, b]))), chunk('IEND', Buffer.alloc(0))]);
}
/** Falsk Google: goo.gl → photos.google.com (redirect), albumsiden, og bildene i tre størrelser + 1×1 PNG. */
function google({ album = HTML, redirectTo = 'https://photos.google.com/share/AF1QipAlbumIdabcdefghij?key=K1', imgStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    assert.equal(init.redirect, 'manual', 'redirect følges manuelt');
    if (url.startsWith('https://photos.app.goo.gl/')) return new Response('', { status: 302, headers: { location: redirectTo } });
    if (url.startsWith('https://photos.google.com/share/')) return album == null ? new Response('Not found', { status: 404 }) : new Response(album, { status: 200, headers: { 'content-type': 'text/html' } });
    if (url.startsWith('https://lh3.googleusercontent.com/')) {
      if (imgStatus !== 200) return new Response('', { status: imgStatus });
      if (url.endsWith('=w1-h1-rp')) return new Response(url.includes('PHOTO02') ? png1x1(240, 240, 240) : png1x1(20, 30, 40), { headers: { 'content-type': 'image/png' } });
      return new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } });
    }
    throw new Error(`uventet vert: ${url}`);
  };
  return { fn, calls };
}

test('albumlenke: bare https photos.app.goo.gl/… og photos.google.com/share/…', () => {
  assert.equal(G.albumUrl46('https://photos.app.goo.gl/tSePoABzDyz7bsoh8'), 'https://photos.app.goo.gl/tSePoABzDyz7bsoh8');
  assert.match(G.albumUrl46('https://photos.google.com/share/AF1QipAlbumIdabcdefghij?key=abc'), /^https:\/\/photos\.google\.com\/share\/AF1QipAlbumIdabcdefghij\?key=abc$/);
  for (const bad of ['http://photos.app.goo.gl/tSePoABzDyz7bsoh8', 'https://photos.app.goo.gl.evil.com/tSePoABzDyz7bsoh8', 'https://evil.com/photos.app.goo.gl/x', 'https://photos.google.com/album/abc',
    'https://user@photos.app.goo.gl/tSePoABzDyz7bsoh8', 'https://photos.app.goo.gl:8443/tSePoABzDyz7bsoh8', 'https://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'ikke en lenke', '']) assert.equal(G.albumUrl46(bad), null, bad);
});

test('SSRF: private/lokale IP-er avvises, redirect ut av Google stoppes, bildefiler bare fra *.googleusercontent.com', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.18.0.3', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) assert.equal(G.isPrivateIp(ip), true, ip);
  for (const ip of ['142.250.74.110', '2a00:1450:400f:80c::200e']) assert.equal(G.isPrivateIp(ip), false, ip);
  const g = google({ redirectTo: 'http://169.254.169.254/latest/meta-data' });
  G._setGphotoFetch46(g.fn);
  try {
    await assert.rejects(G.fetchAlbum46('https://photos.app.goo.gl/tSePoABzDyz7bsoh8'), /Vert ikke tillatt/);
    assert.ok(!g.calls.some((c) => c.url.includes('169.254')), 'aldri kalt');
    const g2 = google({ redirectTo: 'https://evil.example/share/x' });
    G._setGphotoFetch46(g2.fn);
    await assert.rejects(G.fetchAlbum46('https://photos.app.goo.gl/tSePoABzDyz7bsoh8'), /Vert ikke tillatt/);
    const imageOk = (u) => u.protocol === 'https:' && /(^|\.)googleusercontent\.com$/i.test(u.hostname);
    await assert.rejects(G.guardedGet46('https://lh3.googleusercontent.com.evil.com/x', { hostOk: imageOk, maxBytes: 10 }), /Vert ikke tillatt/);
    // Maks størrelse per bilde.
    G._setGphotoFetch46(async () => new Response(Buffer.alloc(32), { headers: { 'content-length': String(G.GP_MAX_BYTES + 1) } }));
    await assert.rejects(G.guardedGet46('https://lh3.googleusercontent.com/pw/x', { hostOk: imageOk, maxBytes: G.GP_MAX_BYTES }), /For stor/);
    G._setGphotoFetch46(async () => new Response(Buffer.alloc(64)));
    await assert.rejects(G.guardedGet46('https://lh3.googleusercontent.com/pw/x', { hostOk: imageOk, maxBytes: 32 }), /For stor/);
  } finally { G._setGphotoFetch46(null); }
});

test('albumsiden: bildene plukkes ut (uten avatar, små bilder, video og duplikater), også escapede URL-er', () => {
  const items = G.extractImages46(HTML);
  assert.equal(items.length, 4);
  assert.ok(items.every((x) => x.base.startsWith('https://lh3.googleusercontent.com/pw/') && !x.base.includes('=')));
  assert.ok(!items.some((x) => x.base.includes('PHOTO03')), 'video hoppet over');
  assert.ok(!items.some((x) => x.base.includes('/a/')), 'avatar hoppet over');
  assert.ok(items.some((x) => x.base.includes('ESCAPED05')));
  assert.equal(G.pngLightness46(png1x1(250, 250, 250)).light, 'light');
  assert.equal(G.pngLightness46(png1x1(10, 10, 10)).light, 'dark');
  assert.equal(G.pngLightness46(Buffer.from('ikke png')), null);
});

test('POST /api/bg/gphoto: henter albumet, laster ned stor/mobil/miniatyr lokalt, bytter hver time likt på alle enheter, per bruker', async () => {
  const bad = await A('/api/bg/gphoto', 'POST', { url: 'https://example.com/album' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'Må være en delt album-lenke fra Google Photos');
  const g = google();
  G._setGphotoFetch46(g.fn);
  try {
    const r = await A('/api/bg/gphoto', 'POST', { url: 'https://photos.app.goo.gl/tSePoABzDyz7bsoh8' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.configured, true);
    assert.equal(r.body.count, 4);
    assert.match(r.body.rowText, /^Bytter bilde hver time · photos\.app\.goo\.gl\/tSePoABzDyz7bsoh8/);
    assert.deepEqual(r.body.choice, { mob2a_bg: 'gphoto', papir_bg_gphoto: 'https://photos.app.goo.gl/tSePoABzDyz7bsoh8' });
    const cur = r.body.current;
    assert.match(cur.large, /^\/api\/bg\/gphoto\/img\/[a-f0-9]{20}-l\.jpg$/);
    assert.ok(!r.text.includes('googleusercontent'), 'ingen hotlinking: klientene får bare lokale adresser');
    assert.ok(g.calls.some((c) => c.url.endsWith('=w2400-h2400')) && g.calls.some((c) => c.url.endsWith('=w1200-h1200')) && g.calls.some((c) => c.url.endsWith('=w48-h48')));
    assert.ok(['light', 'dark'].includes(cur.light));
    assert.equal(cur.textColor, cur.light === 'light' ? 'dark' : 'light');
    const img = await A(cur.large);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.equal(img.buf[0], 0xff);
    assert.equal((await I(cur.large)).status, 404, 'andre brukere ser ikke bildene dine');
    assert.equal((await I('/api/bg/gphoto')).body.configured, false);
    assert.equal((await A('/api/bg/gphoto/img/..%2F..%2Fetc-l.jpg')).status, 400);
    // Rotasjon: samme time → samme bilde; neste time → neste; «Neste bilde» flytter alle enheter.
    const t = Date.UTC(2026, 9, 23, 10, 5);
    assert.equal(G.indexAt46(4, t), G.indexAt46(4, t + 50 * 60_000));
    assert.equal(G.indexAt46(4, t + 3600_000), (G.indexAt46(4, t) + 1) % 4);
    const before = (await A('/api/bg/gphoto')).body.current.index;
    const nx = await A('/api/bg/gphoto/next', 'POST', {});
    assert.equal(nx.body.current.index, (before + 1) % 4);
  } finally { G._setGphotoFetch46(null); }
});

test('albumet gjort privat/tomt: siste bilde beholdes og menyen viser «Fikk ikke hentet albumet · trykk for å prøve igjen»', async () => {
  const keep = (await A('/api/bg/gphoto')).body.current;
  const g = google({ album: null });
  G._setGphotoFetch46(g.fn);
  try {
    const r = await A('/api/bg/gphoto/refresh', 'POST', {});
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, 'Fikk ikke hentet albumet · trykk for å prøve igjen');
    assert.equal(r.body.rowText, 'Fikk ikke hentet albumet · trykk for å prøve igjen');
    assert.equal(r.body.count, 4);
    assert.equal(r.body.current.id, keep.id, 'samme bilde');
    const g2 = google({ album: '<html>ingen bilder</html>' });
    G._setGphotoFetch46(g2.fn);
    const fresh = await I('/api/bg/gphoto', 'POST', { url: 'https://photos.app.goo.gl/tSePoABzDyz7bsoh8' });
    assert.equal(fresh.status, 502, 'nytt album uten bilder');
    assert.match(fresh.body.error, /Fikk ikke hentet albumet/);
  } finally { G._setGphotoFetch46(null); }
  // Valget synkes per bruker som bakgrunnstype «gphoto», og /api/background gir timens bilde (lokal adresse).
  const lay = await A('/api/me/layout', 'PUT', { bgType: 'gphoto' });
  assert.equal(lay.status, 200, lay.text);
  const bg = await A('/api/background');
  assert.equal(bg.body.type, 'gphoto');
  assert.match(bg.body.image_url, /^\/api\/bg\/gphoto\/img\/[a-f0-9]{20}-[lm]\.jpg$/);
  assert.equal(bg.body.gphoto.count, 4);
  assert.equal((await A('/api/bg/gphoto', 'DELETE')).body.configured, false);
  assert.equal((await A('/api/background')).body.type, 'gphoto', 'uten album: tom gphoto (klienten faller tilbake)');
  assert.equal((await A('/api/bg/gphoto')).body.configured, false);
});
