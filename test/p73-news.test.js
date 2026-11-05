// Prompt 73 (NEWS73): Nyheter – lagre hele artikler offline (claude-code-nyheter-lagre-artikkel.md).
// Uttrekk (Readability-lignende), kort-tekst-regelen med AMP, SSRF-avvisning (også etter redirect), sanering ved visning,
// og at lagrede artikler er per bruker. Nettet er falskt (_setNet73), så ingenting går ut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p73news-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p73n';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { default: app } = await import('../server/index.js');
const N = await import('../server/news73.js');
const { createUser } = await import('../server/auth.js');

let ipN = 20;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* */ }
  return { status: r.status, body: json, buf, type: r.headers.get('content-type') };
}
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const cookieA = await login('sebastian', 'testpassord1');
createUser({ username: 'kari73', password: 'karipassord73', name: 'Kari' });
const cookieB = await login('kari73', 'karipassord73');
const A = (p, m = 'GET', b) => req(p, { method: m, headers: { cookie: cookieA }, body: b });
const B = (p, m = 'GET', b) => req(p, { method: m, headers: { cookie: cookieB }, body: b });

/* ---------------- Falskt nett ---------------- */

const para = (n, w = 'Strømprisen') => Array.from({ length: n }, (_, i) => `<p>${w} ventes å falle i november, skriver analytikerne i rapport nummer ${i + 1}, og fyllingsgraden i magasinene er over normalen for årstiden.</p>`).join('\n');
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(200, 7)]);
const LONG = `<!doctype html><html><head><title>Strømprisen ventes å falle – NRK</title>
<meta property="og:title" content="Strømprisen ventes å falle i november"><meta property="og:site_name" content="NRK">
<meta property="og:description" content="Fulle vannmagasiner og mildt vær gir lavere priser.">
<meta name="author" content="Kari Nordmann"><meta property="article:published_time" content="2026-10-28T09:02:00+01:00">
<meta property="og:image" content="https://bilder.example.no/hero.png"><script>alert(1)</script></head>
<body><header class="site-header"><nav><a href="/">Forsiden</a><a href="/sport">Sport</a></nav></header>
<div class="layout"><aside class="sidebar"><p>Mest lest: ${'Lenke til en annen sak, '.repeat(6)}</p></aside>
<article class="article"><h1>Strømprisen ventes å falle i november</h1>
<div class="article-body">${para(6)}<figure><img data-src="https://bilder.example.no/graf.png" src="data:image/gif;base64,R0lGOD"><figcaption>Prisene i Sør-Norge</figcaption></figure>
<h2>Lite kulde før desember</h2>${para(4, 'Værprognosene')}
<div class="share-tools"><p>Del artikkelen på Facebook og X, og følg oss i sosiale medier for mer.</p></div>
<ul class="related-links"><li><a href="/a">Les også: Noe annet som er lenket her</a></li><li><a href="/b">Les også: Enda mer som er lenket</a></li></ul></div></article>
<footer><p>© NRK ${'Kontakt oss og personvern. '.repeat(5)}</p></footer></div></body></html>`;
const SHORT = `<html><head><meta property="og:title" content="Kort sak"><link rel="amphtml" href="https://amp.example.no/kort.amp"></head><body><article><p>Bare en kort ingress her, resten er bak innlogging.</p></article></body></html>`;
const AMP = `<html><head><title>Kort sak</title></head><body><article>${para(9, 'AMP-teksten')}</article></body></html>`;
const PAYWALL = `<html><head><meta property="og:title" content="Betalt sak"><script type="application/ld+json">{"@type":"NewsArticle","headline":"Betalt sak","isAccessibleForFree":false}</script></head><body><article><p>Kort ingress som er åpen.</p></article></body></html>`;

const DNS = { 'www.nrk.example': ['93.184.216.34'], 'bilder.example.no': ['93.184.216.35'], 'amp.example.no': ['93.184.216.36'], 'kort.example.no': ['93.184.216.37'], 'betalt.example.no': ['93.184.216.38'],
  'intern.example.no': ['192.168.1.10'], 'rebind.example.no': ['93.184.216.40', '10.0.0.5'], 'snu.example.no': ['93.184.216.41'], 'v6.example.no': ['fd00::1'], 'loop.example.no': ['127.0.0.1'], 'meta.example.no': ['169.254.169.254'],
  'pdf.example.no': ['93.184.216.42'], 'stor.example.no': ['93.184.216.43'], 'ring.example.no': ['93.184.216.44'], 'farlig.example.no': ['93.184.216.45'] };
const hits = [];
const html = (s, status = 200, extra = {}) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...extra } });
N._setNet73({
  resolve: async (h) => { if (!DNS[h]) throw new Error('ENOTFOUND'); return DNS[h]; },
  fetch: async (url) => {
    hits.push(url);
    const u = new URL(url);
    if (u.hostname === 'www.nrk.example') return html(LONG);
    if (u.hostname === 'bilder.example.no') return new Response(PNG, { headers: { 'content-type': 'image/png' } });
    if (u.hostname === 'kort.example.no') return html(SHORT);
    if (u.hostname === 'amp.example.no') return html(AMP);
    if (u.hostname === 'betalt.example.no') return html(PAYWALL);
    if (u.hostname === 'snu.example.no') return new Response('', { status: 302, headers: { location: 'http://intern.example.no/admin' } });
    if (u.hostname === 'ring.example.no') return new Response('', { status: 302, headers: { location: `https://ring.example.no/${Number(u.pathname.slice(1) || 0) + 1}` } });
    if (u.hostname === 'pdf.example.no') return new Response('%PDF-1.4', { headers: { 'content-type': 'application/pdf' } });
    if (u.hostname === 'stor.example.no') return html('<p>' + 'x'.repeat(N.MAX_BYTES73 + 10) + '</p>');
    if (u.hostname === 'farlig.example.no') return html(`<html><body><article>${para(8)}<p onclick="alert(1)">Trykk <a href="javascript:alert(1)">her</a></p><iframe src="https://evil.example/"></iframe><img src="x" onerror="alert(1)"></article></body></html>`);
    throw new Error(`uventet henting ${url}`);
  },
});

/* ---------------- Uttrekk ---------------- */

test('uttrekk: tittel, meta, brødtekst uten meny/deling/relaterte, mellomtittel og bilde fra lat lasting', () => {
  const e = N.extract73(LONG, 'https://www.nrk.example/okonomi/strom');
  assert.equal(e.title, 'Strømprisen ventes å falle i november');
  assert.equal(e.source, 'NRK');
  assert.equal(e.author, 'Kari Nordmann');
  assert.equal(e.published, '2026-10-28T09:02:00+01:00');
  assert.equal(e.image, 'https://bilder.example.no/hero.png');
  assert.equal(e.lead, 'Fulle vannmagasiner og mildt vær gir lavere priser.');
  const ps = e.blocks.filter((b) => b.t === 'p');
  assert.equal(ps.length, 10, 'alle ti avsnittene');
  assert.ok(e.blocks.some((b) => b.t === 'h' && b.x === 'Lite kulde før desember'));
  const img = e.blocks.find((b) => b.t === 'img');
  assert.equal(img.src, 'https://bilder.example.no/graf.png', 'data-src i stedet for plassholderen');
  assert.equal(img.cap, 'Prisene i Sør-Norge');
  assert.ok(!e.text.includes('Forsiden') && !e.text.includes('Mest lest') && !e.text.includes('Del artikkelen') && !e.text.includes('Les også') && !e.text.includes('Kontakt oss'));
  assert.ok(!e.blocks.some((b) => b.x === e.title), 'tittelen gjentas ikke i brødteksten');
  assert.ok(e.words > 150);
});

test('uttrekk: JSON-LD articleBody brukes når den er lengre, og betalingsmur gjenkjennes', () => {
  const body = 'Første avsnitt med mye tekst om saken. '.repeat(12) + '\n' + 'Andre avsnitt med enda mer tekst om det samme. '.repeat(10);
  const h = `<html><head><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'NewsArticle', headline: 'LD-sak', articleBody: body, author: [{ name: 'Ola' }], datePublished: '2026-10-01' }] })}</script></head><body><p>Kort.</p></body></html>`;
  const e = N.extract73(h, 'https://x.example/');
  assert.equal(e.via, 'jsonld');
  assert.equal(e.title, 'LD-sak');
  assert.equal(e.author, 'Ola');
  assert.equal(e.blocks.filter((b) => b.t === 'p').length, 2);
  assert.equal(N.extract73(PAYWALL, 'https://betalt.example.no/').paywall, true);
});

test('kort-tekst-regelen: < 800 tegn eller < 1,5 × RSS-sammendraget', () => {
  assert.equal(N.isShort73(799, 0), true);
  assert.equal(N.isShort73(800, 0), false);
  assert.equal(N.isShort73(1000, 700), true, '1000 < 1,5 × 700');
  assert.equal(N.isShort73(1100, 700), false);
});

/* ---------------- SSRF ---------------- */

test('SSRF: blokkerte adresser (IPv4, IPv6, mappet) og offentlige', () => {
  for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', 'localhost'])
    assert.equal(N.blockedIp73(ip), true, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(N.blockedIp73(ip), false, ip);
});

test('SSRF: bare http/https, DNS sjekkes, redirect til intern adresse og for mange redirecter avvises', async () => {
  const no = async (u, code = 'ESSRF') => { await assert.rejects(N.guardedGet73(u), (e) => e.code === code, u); };
  await no('file:///etc/passwd');
  await no('ftp://www.nrk.example/x');
  await no('gopher://www.nrk.example/');
  await no('javascript:alert(1)');
  await no('http://user:pw@www.nrk.example/');
  await no('http://127.0.0.1:8080/');
  await no('http://[::1]/');
  await no('http://localhost/');
  await no('http://intern.example.no/');
  await no('http://rebind.example.no/', 'ESSRF');
  await no('http://v6.example.no/');
  await no('http://loop.example.no/');
  await no('http://meta.example.no/latest/meta-data/');
  hits.length = 0;
  await no('https://snu.example.no/');
  assert.deepEqual(hits, ['https://snu.example.no/'], 'redirect-målet hentes aldri');
  await no('https://ring.example.no/0', 'EREDIR');
  assert.equal(hits.filter((h) => h.includes('ring.')).length, 6, 'første + 5 redirecter');
  await no('https://pdf.example.no/', 'ETYPE');
  await no('https://stor.example.no/', 'ESIZE');
  const ok = await N.guardedGet73('https://www.nrk.example/okonomi/strom');
  assert.match(ok.buf.toString(), /Strømprisen/);
});

test('POST /api/news/saved mot intern adresse lagrer «Kun sammendrag · blokkert» og henter ingenting', async () => {
  hits.length = 0;
  const r = await A('/api/news/saved', 'POST', { url: 'http://intern.example.no/secret', title: 'Intern', wait: true });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'summary');
  assert.equal(r.body.item.reason, 'blokkert');
  assert.equal(hits.length, 0);
  const bad = await A('/api/news/saved', 'POST', { url: 'file:///etc/passwd' });
  assert.equal(bad.status, 400);
});

/* ---------------- Lagring, bilder, AMP, sanering, per bruker ---------------- */

test('lagre hel artikkel: brødtekst, bilder på serveren, liste og offline-kopi', async () => {
  const r = await A('/api/news/saved', 'POST', { url: 'https://www.nrk.example/okonomi/strom', title: 'Strømprisen ventes å falle i november', lead: 'Kort RSS-ingress.', wait: true });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'ok');
  const id = r.body.id;
  const g = await A(`/api/news/saved/${id}`);
  assert.equal(g.status, 200);
  assert.equal(g.body.status, 'ok');
  assert.equal(g.body.statusText, 'Lagret · uten nett');
  assert.equal(g.body.source, 'NRK', 'kildenavnet fra og:site_name');
  assert.equal(g.body.author, 'Kari Nordmann');
  assert.ok(g.body.words > 150);
  assert.equal(g.body.images, 2, 'hero + graf lastet ned');
  assert.match(g.body.image, new RegExp(`^/api/news/saved/${id}/img/\\d+$`));
  assert.ok(!g.body.html.includes('bilder.example.no'), 'ingen hotlink');
  assert.ok(!/<script/i.test(g.body.html));
  const im = await A(g.body.image);
  assert.equal(im.status, 200);
  assert.equal(im.type, 'image/png');
  assert.deepEqual(im.buf.subarray(0, 8), PNG.subarray(0, 8));
  const list = await A('/api/news/saved');
  assert.equal(list.body.items.some((x) => x.id === id && x.status === 'ok'), true);
  assert.equal('html' in list.body.items[0], false, 'lista er lett');
  const off = await A(`/api/news/saved/${id}?offline=1`);
  assert.equal(off.body.offline, true);
  assert.match(off.body.image, /^data:image\/png;base64,/);
  assert.ok(off.body.blocks.filter((b) => b.t === 'img').every((b) => b.src.startsWith('data:image/png;base64,')));
  // Lagre samme adresse på nytt gir samme id.
  const again = await A('/api/news/saved', 'POST', { url: 'https://www.nrk.example/okonomi/strom' });
  assert.equal(again.status, 200);
  assert.equal(again.body.id, id);
});

test('kort tekst → AMP-versjonen; betalingsmur → «Kun sammendrag» og «Prøv igjen»', async () => {
  const r = await A('/api/news/saved', 'POST', { url: 'https://kort.example.no/sak', wait: true });
  assert.equal(r.body.status, 'ok');
  const g = await A(`/api/news/saved/${r.body.id}`);
  assert.equal(g.body.via, 'amp');
  assert.match(g.body.html, /AMP-teksten/);
  const p = await A('/api/news/saved', 'POST', { url: 'https://betalt.example.no/sak', title: 'Betalt sak', lead: 'Ingressen fra RSS.', description: 'Ingressen fra RSS. Litt mer tekst fra feeden.', wait: true });
  assert.equal(p.body.status, 'summary');
  const pg = await A(`/api/news/saved/${p.body.id}`);
  assert.equal(pg.body.statusText, 'Kun sammendrag · betalingsmur');
  assert.match(pg.body.html, /Litt mer tekst fra feeden/);
  const rt = await A(`/api/news/saved/${p.body.id}/retry`, 'POST', { wait: true });
  assert.equal(rt.status, 200);
  assert.equal(rt.body.status, 'summary');
});

test('sanering ved visning: ingen script, iframe, on*-attributter eller javascript:-lenker', async () => {
  const dirty = `<p onclick="x()">Hei <a href="javascript:alert(1)">a</a> <a href=" JaVaScRiPt:alert(2)">b</a> <a href="https://ok.example/">c</a></p>
    <script>alert(1)</script><iframe src="https://evil"></iframe><img src="https://evil/x.png" onerror="alert(1)"><img src="/api/news/saved/abc-1/img/1" onload="y()">
    <svg onload="alert(1)"><script>z()</script></svg><style>body{}</style><div style="background:url(javascript:alert(1))">tekst</div><a href="data:text/html,<script>1</script>">d</a>`;
  const s = N.sanitize73(dirty);
  assert.doesNotMatch(s, /<script|<iframe|<svg|<style|\bon\w+=|javascript:|style=|data:text/i);
  assert.match(s, /href="https:\/\/ok\.example\/"/);
  assert.match(s, /<img src="\/api\/news\/saved\/abc-1\/img\/1"/);
  assert.doesNotMatch(s, /evil/);
  assert.match(s, /tekst/);
  // Og en lagret side med farlig innhold kommer ren ut av API-et.
  const r = await A('/api/news/saved', 'POST', { url: 'https://farlig.example.no/sak', wait: true });
  const g = await A(`/api/news/saved/${r.body.id}`);
  assert.doesNotMatch(g.body.html, /<script|<iframe|onclick|onerror|javascript:/i);
});

test('per bruker: B ser ikke, henter ikke bilder fra og sletter ikke A sine artikler', async () => {
  const a = await A('/api/news/saved');
  const one = a.body.items.find((x) => x.status === 'ok' && x.image);
  assert.ok(one);
  const lb = await B('/api/news/saved');
  assert.equal(lb.status, 200);
  assert.equal(lb.body.items.length, 0);
  assert.equal((await B(`/api/news/saved/${one.id}`)).status, 404);
  assert.equal((await B(one.image)).status, 404);
  assert.equal((await B(`/api/news/saved/${one.id}`, 'DELETE')).status, 404);
  assert.equal((await B(`/api/news/saved/${one.id}/retry`, 'POST', {})).status, 404);
  // B kan lagre samme adresse selv (egen kopi).
  const mine = await B('/api/news/saved', 'POST', { url: one.url, wait: true });
  assert.equal(mine.status, 201);
  assert.notEqual(mine.body.id, one.id);
  assert.equal((await req('/api/news/saved')).status, 401, 'uten innlogging');
  // A sletter sin; B sin står.
  assert.equal((await A(`/api/news/saved/${one.id}`, 'DELETE')).status, 200);
  assert.equal((await A(`/api/news/saved/${one.id}`)).status, 404);
  assert.equal((await A(one.image)).status, 404, 'bildene slettes også');
  assert.equal((await B(`/api/news/saved/${mine.body.id}`)).status, 200);
});

test('felles søk (FTS5, search51) finner lagrede artikler – bare egne', async () => {
  const S = await import('../server/webx51.js');
  const ME = (await import('../server/db.js')).db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
  const KARI = (await import('../server/db.js')).db.prepare("SELECT id FROM users WHERE username='kari73'").pluck().get();
  const r = await S.search51(ME, 'AMP-teksten');
  const hit = r.results.find((x) => x.type === 'article');
  assert.ok(hit, 'treff i lagret artikkel (brødtekst)');
  assert.equal(hit.typeLabel, 'Lagrede artikler');
  assert.match(hit.link.web, /saved=/);
  const rb = await S.search51(KARI, 'AMP-teksten');
  assert.equal(rb.results.some((x) => x.type === 'article'), false);
});

test('klientene: web, iOS og Android har Lagret, lagre-knapp, Åpne original, fjern og offline-kopi', () => {
  const web = readFileSync(join(ROOT, 'public/js/news73.js'), 'utf8');
  for (const s of ['/news/saved', 'Lagret', 'Åpne original', 'Fjern fra lagret', 'Prøv å laste ned på nytt', 'Kun sammendrag', 'Søk i lagrede artikler']) assert.ok(web.includes(s), `web: ${s}`);
  assert.doesNotMatch(web, /innerHTML\s*=\s*[^;]*\.html\b(?![^;]*sanit)/, 'web setter ikke rå HTML');
  const nw = readFileSync(join(ROOT, 'public/js/news.js'), 'utf8');
  assert.match(nw, /news73/);
  const ios = readFileSync(join(ROOT, 'apps/ios/FinansHub/Sources/News73Saved.swift'), 'utf8');
  for (const s of ['/news/saved', 'offline=1', 'Åpne original', 'Fjern fra lagret', 'Prøv å laste ned på nytt', 'swipeActions']) assert.ok(ios.includes(s), `iOS: ${s}`);
  const and = readFileSync(join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub/ui/News73.kt'), 'utf8');
  for (const s of ['/news/saved', 'offline=1', 'Åpne original', 'Fjern fra lagret', 'Prøv å laste ned på nytt', 'SwipeToDismissBox', 'CancellationException']) assert.ok(and.includes(s), `Android: ${s}`);
});
