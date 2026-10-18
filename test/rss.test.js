// Nyhetsleser (prompt 13): RSS/Atom-tolking, kilder per bruker, ✦ AI-kategorisering og -sammendrag, layout-felt og fotovindu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-rss-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');
const { default: mobile } = await import('../server/mobile.js');
const { default: rss, parseFeed, mapCategory } = await import('../server/rss.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const req = (app) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};
const R = req(rss), M = req(mobile);

const RSS = (name, items) => `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${name}</title><link>https://x.no</link>
${items.map(([t, cat, i]) => `<item><title><![CDATA[${t}]]></title><link>https://${name.toLowerCase()}.no/sak/${i}</link><guid>${name}-${i}</guid>
<pubDate>${new Date(Date.UTC(2026, 9, 18, 8, 59 - i)).toUTCString()}</pubDate>${cat ? `<category>${cat}</category>` : ''}
<media:content url="https://img.${name.toLowerCase()}.no/${i}.jpg" medium="image"/><description>&lt;p&gt;Ingress ${i}&lt;/p&gt;</description></item>`).join('')}</channel></rss>`;
const ATOM = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Tek-blogg</title><link rel="self" href="https://tek.no/atom"/>
<entry><title type="html">Ny Android-oppdatering &amp; mer</title><link rel="enclosure" href="https://tek.no/a.mp3"/><link rel="alternate" href="https://tek.no/android"/>
<id>tag:tek.no,2026:1</id><updated>2026-10-18T07:00:00Z</updated><category term="Teknologi"/><summary>Kort om oppdateringen</summary></entry></feed>`;

let aiCalls = 0;
const fakeFetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/api/chat') || u.includes('generativelanguage')) {
    aiCalls++;
    const prompt = JSON.parse(init.body).messages?.[0]?.content ?? JSON.parse(init.body).contents?.[0]?.parts?.[0]?.text ?? '';
    const content = prompt.includes('ingress')
      ? { text: 'Regn på Østlandet og statsbudsjettet preger dagen.' }
      : { items: [...prompt.matchAll(/"id":(\d+),"title":"([^"]+)"/g)].map(([, id, t]) => ({ id: +id, category: /glimt|håndball/i.test(t) ? 'sport' : /genève|tyskland/i.test(t) ? 'verden' : 'norge' })) };
    return new Response(JSON.stringify({ message: { content: JSON.stringify(content) } }), { headers: { 'content-type': 'application/json' } });
  }
  if (u.includes('tek.no')) return new Response(ATOM, { headers: { 'content-type': 'application/atom+xml' } });
  if (u.includes('ikke-feed')) return new Response('<html><body>Hei</body></html>', { headers: { 'content-type': 'text/html' } });
  const name = u.includes('nrk') ? 'NRK' : u.includes('vg') ? 'VG' : u.includes('e24') ? 'E24' : u.includes('aftenposten') ? 'Aftenposten' : 'Kilde';
  return new Response(RSS(name, [['Kraftig regn ventes på Østlandet', 'Innenriks', 1], ['Bodø/Glimt klare for kvartfinale', '', 2], ['FN-toppmøte i Genève', '', 3], ['Oslo Børs stiger', 'Økonomi', 4]]), { headers: { 'content-type': 'application/rss+xml' } });
};
const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;
test.after(() => { globalThis.fetch = realFetch; });

test('parseFeed leser RSS 2.0 med kategori, bilde og ingress', () => {
  const f = parseFeed(RSS('NRK', [['Tittel &amp; mer', 'Sport', 1]]));
  assert.equal(f.title, 'NRK');
  assert.equal(f.items.length, 1);
  const it = f.items[0];
  assert.equal(it.title, 'Tittel & mer');
  assert.equal(it.url, 'https://nrk.no/sak/1');
  assert.equal(it.category, 'Sport');
  assert.equal(it.image, 'https://img.nrk.no/1.jpg');
  assert.equal(it.excerpt, 'Ingress 1');
  assert.match(it.published, /^2026-10-18T08:58/);
});

test('parseFeed leser Atom og velger rel="alternate"', () => {
  const f = parseFeed(ATOM);
  assert.equal(f.title, 'Tek-blogg');
  assert.equal(f.items[0].url, 'https://tek.no/android');
  assert.equal(f.items[0].title, 'Ny Android-oppdatering & mer');
  assert.equal(f.items[0].category, 'Teknologi');
  assert.throws(() => parseFeed('<html></html>'), /ikke en RSS/);
});

test('mapCategory kjenner igjen vanlige kategorinavn', () => {
  assert.equal(mapCategory('Sport'), 'sport');
  assert.equal(mapCategory('Utenriks'), 'verden');
  assert.equal(mapCategory('Næringsliv'), 'okonomi');
  assert.equal(mapCategory(''), null);
});

test('GET /api/rss lager standardkilder, henter dem og kategoriserer med AI', async () => {
  const r = await R('/');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.feeds.map((f) => f.name), ['NRK', 'VG', 'E24', 'Aftenposten', 'Tek.no']);
  assert.equal(r.body.categories[0].id, 'siste');
  assert.ok(r.body.items.length >= 10);
  const glimt = r.body.items.find((i) => i.feed === 'NRK' && /Glimt/.test(i.title));
  assert.equal(glimt.category, 'sport', 'AI satte sport');
  assert.equal(glimt.ai, true);
  assert.equal(r.body.items.find((i) => i.feed === 'NRK' && /Børs/.test(i.title)).category, 'okonomi', 'feedens egen kategori brukes');
  // E24 står fast på Økonomi, uansett hva feeden sier.
  assert.ok(r.body.items.filter((i) => i.feed === 'E24').every((i) => i.category === 'okonomi'));
  assert.ok(aiCalls > 0);
  const sport = await R('/?cat=sport');
  assert.ok(sport.body.items.length && sport.body.items.every((i) => i.category === 'sport'));
  assert.equal((await R('/?cat=tull')).status, 400);
});

test('✦ AI-sammendrag lages ved oppfrisking og kan slås av', async () => {
  const r = await R('/refresh', 'POST');
  assert.equal(r.status, 200);
  assert.match(r.body.digest.text, /Østlandet/);
  assert.match((await R('/')).body.digest.text, /statsbudsjettet/);
  const s = await R('/settings', 'PUT', { aiSummary: false });
  assert.deepEqual(s.body, { aiSummary: false, aiCategorize: true });
  assert.equal((await R('/')).body.digest, null);
  await R('/settings', 'PUT', { aiSummary: true });
});

test('kilder kan legges til, endres og fjernes', async () => {
  const bad = await R('/feeds', 'POST', { url: 'https://ikke-feed.no/' });
  assert.equal(bad.status, 422);
  assert.match(bad.body.error, /ikke en RSS/);
  assert.equal((await R('/feeds', 'POST', { url: 'https://www.nrk.no/toppsaker.rss' })).status, 409);
  const add = await R('/feeds', 'POST', { url: 'dagbladet.no/rss' });
  assert.equal(add.status, 201);
  assert.equal(add.body.feed.url, 'https://dagbladet.no/rss');
  assert.equal(add.body.feed.name, 'Kilde', 'navnet fra feedens <title>');
  assert.equal(add.body.feed.count, 4);
  const id = add.body.feed.id;
  const p = await R(`/feeds/${id}`, 'PATCH', { category: 'kultur', name: 'Dagbladet' });
  assert.equal(p.body.feeds.find((f) => f.id === id).category, 'kultur');
  assert.equal((await R(`/feeds/${id}`, 'PATCH', { category: 'tull' })).status, 400);
  assert.ok((await R('/?cat=kultur')).body.items.some((i) => i.feed === 'Dagbladet'));
  const d = await R(`/feeds/${id}`, 'DELETE');
  assert.ok(!d.body.feeds.some((f) => f.id === id));
  assert.ok(!(await R('/')).body.items.some((i) => i.feedId === id));
});

test('/api/mobile/home har de 5 nyeste sakene', async () => {
  const r = await M('/mobile/home');
  assert.equal(r.status, 200);
  assert.equal(r.body.news.length, 5);
  assert.ok(r.body.news.every((n) => n.title && n.url && n.feed && n.published));
  // Tom database = ny installasjon: Papir er standard (prompt 14).
  assert.equal(r.body.design.mobileDesign, 'papir');
  assert.equal(r.body.design.onboarded, false);
});

test('layout godtar tema- og designvalg og avviser ukjente verdier', async () => {
  const ok = await M('/me/layout', 'PUT', { design: 'glod', compactNav: true, hlTheme: '2c', mobileDesign: 'papir', paperMode: 'mork', photo: 'oslo' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.design, 'glod');
  assert.equal(ok.body.hlTheme, '2c');
  for (const b of [{ design: 'rosa' }, { hlTheme: 'x' }, { mobileDesign: 'glass' }, { paperMode: 1 }, { photo: 'mars' }, { compactNav: 'ja' }]) {
    assert.equal((await M('/me/layout', 'PUT', b)).status, 400, JSON.stringify(b));
  }
  const g = await M('/me/layout');
  assert.equal(g.body.design, 'glod');
  assert.equal(g.body.photo, 'oslo');
  await M('/me/layout', 'PUT', { design: null });
  assert.equal((await M('/me/layout')).body.design, 'v2', 'standardverdien fylles inn');
});

test('fotovindu: Oslo, vær, planeter med reserve og eget bilde', async () => {
  const oslo = await M('/photo-window?kind=oslo');
  assert.equal(oslo.body.url, '/api/bg/oslo.jpg');
  const img = await mobile.request('/bg/oslo.jpg', { headers: { authorization: H.authorization } });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  const w = await M('/photo-window?kind=weather');
  assert.equal(w.status, 200);
  assert.match(w.body.gradient, /^linear-gradient/);
  const p = await M('/photo-window?kind=planets');
  assert.ok(p.body.url, 'planeter har alltid et bilde (APOD eller reserve)');
  assert.equal((await M('/photo-window?kind=mars')).status, 400);
  assert.equal((await M('/photo-window?kind=custom')).body.kind, 'cur', 'uten opplastet bilde');

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082', 'hex');
  const fd = new FormData();
  fd.append('file', new File([png], 'bilde.png', { type: 'image/png' }));
  const up = await mobile.request('/me/photo-window', { method: 'POST', headers: { authorization: H.authorization }, body: fd });
  assert.equal(up.status, 200);
  const upb = await up.json();
  assert.match(upb.url, /^\/api\/me\/photo-window\?v=\d+/);
  assert.equal((await M('/me/layout')).body.photo, 'custom');
  const c = await M('/photo-window');
  assert.equal(c.body.kind, 'custom');
  const file = await mobile.request('/me/photo-window', { headers: { authorization: H.authorization } });
  assert.equal(file.headers.get('content-type'), 'image/png');
  const bad = new FormData();
  bad.append('file', new File([Buffer.from('ikke et bilde')], 'x.txt', { type: 'text/plain' }));
  assert.equal((await mobile.request('/me/photo-window', { method: 'POST', headers: { authorization: H.authorization }, body: bad })).status, 400);
  await M('/me/photo-window', 'DELETE');
  assert.equal((await M('/me/layout')).body.photo, 'cur');
});
