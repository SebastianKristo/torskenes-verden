// Prompt 73 (LOGO73): «Endre logo» i Finans – søk i hele logobiblioteket, overstyr per butikk (bibliotek, opplasting,
// initialer, tilbakestill), per bruker, uten nettkall, og overstyringen brukes overalt (logos52, forslag, overstyringskartet).
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p73logo-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-73logo';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4673';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => { calls++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const L73 = await import('../server/finans/logo73.js');
const { findLogo, cachedLogoUrl } = await import('../server/finans/logo-lookup.js');
const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

let ipN = 30;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const sebId = (await A('/api/me')).body.id;
const ingridId = (await I('/api/me')).body.id;
await A('/finans/api/transactions'); await I('/finans/api/transactions');
const addTx = (u, kr, merchant) => db.prepare("INSERT INTO fh_transactions(date, amount, description, merchant, source, created, user_id) VALUES('2026-10-16',?,?,?,'manual',?,?)").run(-Math.round(kr * 100), merchant, merchant, Date.now(), u);
addTx(sebId, 386.5, 'REMA 1000 BISLETT');
addTx(sebId, 120, 'REMA 1000 BISLETT');
addTx(sebId, 99, 'Rema 1000 Majorstuen');
addTx(sebId, 45, 'Kaffebrenneriet Bislett');
addTx(ingridId, 50, 'REMA 1000 BISLETT');

/* ---------------- Søk ---------------- */

test('søk: GET /finans/api/logos?q= søker i hele logobiblioteket på navn, alias og domene', async () => {
  const r = await A('/finans/api/logos?q=rema');
  assert.equal(r.status, 200, r.text);
  assert.ok(Array.isArray(r.body));
  const hit = r.body.find((x) => x.id === 'rema-1000');
  assert.ok(hit, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(hit).sort(), ['domain', 'id', 'logoUrl', 'name']);
  assert.equal(hit.domain, 'rema.no');
  assert.match(hit.logoUrl, /^\/finans\/api\/logos\/file\/rema-1000$/);
  // Domene og butikker brukeren aldri har handlet hos.
  assert.ok((await A('/finans/api/logos?q=elkjop.no')).body.some((x) => x.id === 'elkjop'));
  assert.ok((await A('/finans/api/logos?q=clas')).body.some((x) => /clas ohlson/i.test(x.name)));
  assert.ok(Number((await A('/finans/api/logos?q=')).headers.get('x-total-count')) > 100, 'tomt søk viser hele biblioteket');
});

test('søk: ufølsomt for store/små bokstaver og æ/ø/å', async () => {
  for (const q of ['ELKJØP', 'elkjop', 'Elkjøp']) assert.equal((await A(`/finans/api/logos?q=${encodeURIComponent(q)}`)).body[0]?.id, 'elkjop', q);
  const s = L73.searchLogos73(sebId, 'vinmonopol');
  assert.ok(s.items.some((x) => /vinmonopolet/i.test(x.name)));
});

test('søk: krever innlogging og gjør ingen nettkall', async () => {
  calls = 0;
  assert.equal((await req('/finans/api/logos?q=rema')).status, 401);
  await A('/finans/api/logos?q=kiwi');
  assert.equal(calls, 0);
});

/* ---------------- Overstyring ---------------- */

const name = 'REMA 1000 BISLETT';
const enc = encodeURIComponent(name);

test('PUT logoId: lagres per normalisert butikk, vinner i findLogo, logos52, forslag og overstyringskartet', async () => {
  calls = 0;
  const r = await A(`/finans/api/merchants/${enc}/logo`, 'PUT', { logoId: 'kiwi' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.manual, true);
  assert.equal(r.body.logoUrl, '/finans/api/logos/file/kiwi');
  assert.equal(r.body.count, 3, 'alle kjøp fra samme butikk (Bislett og Majorstuen er samme kjede)');
  const row = db.prepare('SELECT * FROM merchant_logos WHERE user_id=? AND key=?').get(sebId, r.body.key);
  assert.equal(row.manual, 1);
  assert.equal(row.file, 'lib:kiwi');
  // Manuelle valg vinner i kjeden …
  const f = await findLogo('Rema 1000 Majorstuen', { u: sebId, force: true });
  assert.equal(f.logoUrl, '/finans/api/logos/file/kiwi');
  assert.equal(cachedLogoUrl('REMA 1000 BISLETT', sebId), '/finans/api/logos/file/kiwi');
  // … i listene (logos52) …
  const b = await A('/finans/api/logos52/batch', 'POST', { names: [name, 'Kaffebrenneriet Bislett'] });
  assert.equal(b.body.items[name].url, '/finans/api/logos/file/kiwi');
  // … og i kartet klientene bruker overalt i Finans.
  const ov = await A('/finans/api/merchants/logo-overrides');
  assert.equal(ov.status, 200);
  assert.equal(ov.body.names['rema 1000 bislett'], '/finans/api/logos/file/kiwi');
  assert.equal(ov.body.names['rema 1000 majorstuen'], '/finans/api/logos/file/kiwi');
  assert.equal(ov.body.names['kaffebrenneriet bislett'], undefined);
  // GET gir samme tilstand.
  const g = await A(`/finans/api/merchants/${enc}/logo`);
  assert.equal(g.body.manual, true);
  assert.equal(calls, 0, 'ingen nettkall');
});

test('per bruker: Ingrids REMA er uberørt', async () => {
  const ov = await I('/finans/api/merchants/logo-overrides');
  assert.deepEqual(ov.body.items, []);
  const b = await I('/finans/api/logos52/batch', 'POST', { names: [name] });
  assert.equal(b.body.items[name].url, '/finans/api/logos/file/rema-1000');
  assert.equal((await I(`/finans/api/merchants/${enc}/logo`)).body.manual, false);
});

test('PUT initials:true gir bokstav; null tilbakestiller til automatisk', async () => {
  let r = await A(`/finans/api/merchants/${enc}/logo`, 'PUT', { initials: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.logoUrl, null);
  assert.equal(r.body.initials, true);
  assert.equal((await A('/finans/api/merchants/logo-overrides')).body.names['rema 1000 bislett'], '');
  assert.equal((await A('/finans/api/logos52/batch', 'POST', { names: [name] })).body.items[name].url, null);
  r = await A(`/finans/api/merchants/${enc}/logo`, 'PUT', null);
  assert.equal(r.status, 200);
  assert.equal(r.body.manual, false);
  assert.equal((await A('/finans/api/merchants/logo-overrides')).body.names['rema 1000 bislett'], undefined);
  assert.equal((await A('/finans/api/logos52/batch', 'POST', { names: [name] })).body.items[name].url, '/finans/api/logos/file/rema-1000');
});

test('ukjent logoId og fremmed uploadId avvises', async () => {
  assert.equal((await A(`/finans/api/merchants/${enc}/logo`, 'PUT', { logoId: 'finnes-ikke-73' })).status, 404);
  assert.equal((await A(`/finans/api/merchants/${enc}/logo`, 'PUT', { logoId: '../../etc/passwd' })).status, 404);
  assert.equal((await A(`/finans/api/merchants/${enc}/logo`, 'PUT', { uploadId: 'abc' })).status, 404);
  assert.equal((await req(`/finans/api/merchants/${enc}/logo`, { method: 'PUT', body: { logoId: 'kiwi' } })).status, 401);
});

/* ---------------- Opplasting ---------------- */

let magick = null;
for (const m of ['magick', 'convert']) { try { execFileSync(m, ['-version'], { stdio: 'ignore' }); magick = m; break; } catch { /* */ } }

test('opplasting: beskjæres til kvadrat på maks 512, bare eieren kan bruke den', { skip: !magick && 'ImageMagick mangler' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p73img-'));
  const file = join(dir, 'wide.png');
  execFileSync(magick, ['-size', '1200x700', 'xc:#b23a2a', file]);
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(file)], { type: 'image/png' }), 'logo.png');
  const up = await A('/finans/api/merchants/logo/upload', 'POST', fd);
  assert.equal(up.status, 200, up.text);
  assert.match(up.body.url, /^\/finans\/api\/merchants\/logo\/file\/m-[a-f0-9]+\.png/);
  const img = await app.request(up.body.url);
  assert.equal(img.status, 200);
  const buf = Buffer.from(await img.arrayBuffer());
  assert.equal(buf.readUInt32BE(16), 512);
  assert.equal(buf.readUInt32BE(20), 512);
  // Små bilder skaleres ikke opp, men blir kvadratiske.
  execFileSync(magick, ['-size', '100x60', 'xc:#1b1a17', join(dir, 'small.png')]);
  const sq = await L73.squareLogo73(readFileSync(join(dir, 'small.png')));
  assert.deepEqual([sq.readUInt32BE(16), sq.readUInt32BE(20)], [60, 60]);
  // Ingrid kan ikke bruke Sebastians opplasting.
  assert.equal((await I(`/finans/api/merchants/${enc}/logo`, 'PUT', { uploadId: up.body.uploadId })).status, 404);
  const r = await A(`/finans/api/merchants/${enc}/logo`, 'PUT', { uploadId: up.body.uploadId });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.logoUrl, /m-[a-f0-9]+\.png/);
  assert.equal(r.body.manual, true);
  // Engangs: samme uploadId kan ikke brukes igjen.
  assert.equal((await A('/finans/api/merchants/kaffebrenneriet/logo', 'PUT', { uploadId: up.body.uploadId })).status, 404);
});

test('opplasting: tekst og SVG avvises', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.equal((await A('/finans/api/merchants/logo/upload', 'POST', fd)).status, 400);
  assert.equal((await A('/finans/api/merchants/logo/upload', 'POST', new FormData())).status, 400);
});

/* ---------------- Klientene (kildesjekk) ---------------- */

test('web: «Endre logo»-arket i papir-design, debounce 250 ms, overstyringen i core.logo og mobil-logoen', () => {
  const s = src('public/finans/js/logo73.js');
  for (const t of ['Endre logo', 'Søk etter butikk', 'Last opp bilde', 'Bruk initialer', 'Bruk denne logoen', 'Tilbakestill til automatisk', 'FINANS · BUTIKKLOGO', 'LOGODATABASEN']) assert.ok(s.includes(t), t);
  assert.match(s, /250/);
  assert.match(s, /\/logos\?q=/);
  assert.match(s, /\/merchants\/\$\{encodeURIComponent\([^)]*\)\}\/logo/);
  assert.match(s, /512/);
  const css = src('public/finans/css/logo73.css');
  for (const c of ['#f3efe6', '#d8d1c2', '#1b1a17', '#8f897c', '#b23a2a', 'Newsreader', 'Manrope', 'IBM Plex Mono']) assert.ok(css.includes(c), c);
  assert.ok(!/backdrop-filter:\s*blur\(\s*(?:[2-9]\d|1\d)px/.test(css), 'ikke mørkt glass');
  const core = src('public/finans/js/core.js');
  assert.match(core, /logoOv73/);
  assert.match(src('public/finans/js/mobile-p20.js'), /logoOv73/);
  assert.match(src('public/finans/js/desktop.js'), /logoBtn73/);
  assert.match(src('public/finans/js/mobile-tx.js'), /logoBtn73/);
});

test('iOS: LogoSheet73 med søk, opplasting (kvadrat 512) og overstyring i PaperLogo', () => {
  const s = src('apps/ios/FinansHub/Sources/LogoSheet73.swift');
  for (const t of ['Endre logo', 'Søk etter butikk', 'Bruk denne logoen', 'Tilbakestill til automatisk', 'Bruk initialer', '/logos?q=', '/merchants/logo-overrides', '/merchants/logo/upload', '512']) assert.ok(s.includes(t), t);
  assert.ok(!s.includes('/*/'), 'ingen /* inne i blokkommentar');
  assert.match(src('apps/ios/FinansHub/Sources/PaperPages.swift'), /LogoOv73/);
  assert.match(src('apps/ios/FinansHub/Sources/Receipt52Panel.swift'), /LogoSheet73/);
});

test('Android: LogoSheet73 med søk, opplasting (kvadrat 512) og overstyring i Logo og StoreLogo52', () => {
  const s = src('apps/android/app/src/main/java/no/kristo/finanshub/ui/LogoSheet73.kt');
  for (const t of ['Endre logo', 'Søk etter butikk', 'Bruk denne logoen', 'Tilbakestill til automatisk', 'Bruk initialer', '/logos?q=', '/merchants/logo-overrides', '/merchants/logo/upload', '512']) assert.ok(s.includes(t), t);
  assert.match(s, /CancellationException/);
  assert.match(src('apps/android/app/src/main/java/no/kristo/finanshub/ui/Finance.kt'), /LogoOv73/);
  assert.match(src('apps/android/app/src/main/java/no/kristo/finanshub/ui/And52AUi.kt'), /LogoTap73/);
  assert.match(src('apps/android/app/src/main/java/no/kristo/finanshub/ui/Ui52B.kt'), /LogoOv73/);
});
