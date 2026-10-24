// Prompt 23 (server): ikoner (Iconify-proxy med diskcache, ✦ forslag, hl_rss-ikoner per bruker), tidsgrenser for AI-motorene
// (neste nøkkel/motor, nye forsøk og kø), Finn-annonsen i appen (attributter, bilder, e-poster, meldinger) og subHomeOrder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p23-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p23-logos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
process.env.OCR_FALLBACK = '0';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const icons = await import('../server/icons.js');
const AI = await import('../server/finans/ai.js');
const { setSecret, saveSettings, settings } = await import('../server/finans/db.js');
const keys = await import('../server/finans/gemini-keys.js');
const finn = await import('../server/finans/finn-routes.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const raw = body instanceof FormData;
  const r = await app.request(path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body && !raw ? { 'content-type': 'application/json' } : {}) }, body: raw ? body : body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString()); } catch { /* ikke JSON */ }
  return { status: r.status, body: json, text: buf.toString(), headers: r.headers };
};
const A = client(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ola', password: 'olaPassord123', role: 'bruker', name: 'Ola' })).status, 200);
const B = client(await login('ola', 'olaPassord123'));
const anon = client(null);
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
// AbortSignal.timeout holder ikke prosessen i live (unref); uten en server må testen gjøre det selv.
const alive = setInterval(() => {}, 1000);
test.after(() => clearInterval(alive));

/* ---------------- 1. Ikoner ---------------- */

test('ikoner: Iconify-søk via proxy, SVG cachet på disk, sett og innlogging', async () => {
  const calls = [];
  icons._setIconFetch(async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.pathname === '/search') {
      const pre = u.searchParams.get('prefixes');
      const q = u.searchParams.get('query');
      const all = ['lucide:trophy', 'mdi:trophy', 'mdi:trophy-outline', 'ph:trophy', 'tabler:trophy', 'bad id', 'noto:trophy'];
      return json({ icons: all.filter((x) => !pre || x.startsWith(pre + ':')).filter(() => q !== 'tomt'), total: 7, limit: +u.searchParams.get('limit') });
    }
    if (u.pathname === '/lucide/trophy.svg') return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" onload="alert(1)"><script>x()</script><path stroke="currentColor" d="M6 9H4"/></svg>', { headers: { 'content-type': 'image/svg+xml' } });
    return new Response('404', { status: 404 });
  });
  assert.equal((await anon('/api/icons/search?q=trophy')).status, 401);
  const s = await A('/api/icons/search?q=trophy&limit=4');
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.icons[0], { prefix: 'lucide', name: 'trophy', id: 'lucide:trophy' });
  assert.equal(s.body.icons.length, 4);
  assert.ok(s.body.icons.every((i) => i.id === `${i.prefix}:${i.name}`));
  assert.equal(s.body.total, 7);
  assert.match(calls[0], /limit=32/, 'Iconify krever limit ≥ 32');
  const p = await B('/api/icons/search?q=trophy&prefix=mdi');
  assert.deepEqual(p.body.icons.map((i) => i.id), ['mdi:trophy', 'mdi:trophy-outline']);
  assert.match(calls.at(-1), /prefixes=mdi/);
  assert.equal((await A('/api/icons/search?q=trophy&prefix=Ugyldig!')).status, 400);
  assert.deepEqual((await A('/api/icons/search?q=')).body, { icons: [], total: 0 });

  // SVG: hentes én gang, renses og lagres i DATA_DIR/icons, deretter fra disk.
  const n0 = calls.length;
  const svg = await A('/api/icons/lucide/trophy.svg');
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(svg.headers.get('cache-control'), /max-age=31536000/);
  assert.doesNotMatch(svg.text, /<script|onload/);
  assert.match(svg.text, /currentColor/);
  const file = join(process.env.DATA_DIR, 'icons', 'lucide', 'trophy.svg');
  assert.ok(existsSync(file));
  assert.equal(readFileSync(file, 'utf8'), svg.text);
  assert.equal((await B('/api/icons/lucide/trophy.svg')).text, svg.text);
  assert.equal(calls.length, n0 + 1, 'andre gang fra diskcachen');
  assert.equal((await A('/api/icons/lucide/finnes-ikke.svg')).status, 404);
  assert.equal((await A('/api/icons/lucide/..%2F..%2Fx.svg')).status, 400);
  assert.equal((await anon('/api/icons/lucide/trophy.svg')).status, 401);

  const sets = await A('/api/icons/sets');
  assert.equal(sets.body.sets[0].name, 'Alle');
  assert.deepEqual(sets.body.sets.slice(1, 4).map((x) => x.prefix), ['lucide', 'material-symbols', 'mdi']);
  assert.equal(sets.body.sets.length, 18);
  assert.equal(sets.body.sets.find((x) => x.prefix === 'noto').color, true);
  assert.equal(sets.body.defaults.sport, 'lucide:trophy');

  // ✦ forslag uten AI-motor: innebygd ordliste → første treff i valgt bibliotek.
  const sg = await A('/api/icons/suggest', 'POST', { label: 'Sport' });
  assert.equal(sg.status, 200);
  assert.deepEqual({ keyword: sg.body.keyword, icon: sg.body.icon, source: sg.body.source }, { keyword: 'trophy', icon: 'lucide:trophy', source: 'list' });
  assert.equal((await A('/api/icons/suggest', 'POST', { label: 'Sport', prefix: 'ph' })).body.icon, 'ph:trophy');
  assert.equal((await A('/api/icons/suggest', 'POST', {})).status, 400);
  // Uten nett: 502 med norsk feilmelding.
  icons._setIconFetch(async () => { throw new Error('offline'); });
  const off = await A('/api/icons/search?q=heart');
  assert.equal(off.status, 502);
  assert.match(off.body.error, /ikonbiblioteket/);
  icons._setIconFetch(null);
});

test('Nyhetsleser: ic, icSrc og icOn lagres i hl_rss per bruker og beholdes', async () => {
  const r = await A('/api/rss/settings', 'PUT', { ic: { siste: 'lucide:zap', sport: '', Kultur: 'noto:performing-arts' }, icSrc: { siste: 'std', sport: 'user', Kultur: 'ai' }, icOn: false });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.ic, { siste: 'lucide:zap', sport: '', Kultur: 'noto:performing-arts' });
  assert.deepEqual(r.body.icSrc, { siste: 'std', sport: 'pick', Kultur: 'ai' }, '«user» fra designet lagres som «pick»');
  assert.equal(r.body.icOn, false);
  // Andre felt rører ikke ikonene.
  const s2 = await A('/api/rss/settings', 'PUT', { aiSummary: false });
  assert.equal(s2.body.icOn, false);
  assert.equal(s2.body.ic.siste, 'lucide:zap');
  assert.equal(s2.body.aiSummary, false);
  assert.equal((await A('/api/rss/settings', 'PUT', { ic: { sport: 'ikke et ikon' } })).status, 400);
  assert.equal((await A('/api/rss/settings', 'PUT', { icSrc: { sport: 'x' } })).status, 400);
  assert.equal((await A('/api/rss/settings', 'PUT', { icOn: 'ja' })).status, 400);
  // Brukerskillet: Ola har standardverdiene.
  const b = await B('/api/rss/settings', 'PUT', {});
  assert.deepEqual({ ic: b.body.ic, icSrc: b.body.icSrc, icOn: b.body.icOn }, { ic: {}, icSrc: {}, icOn: true });
  await A('/api/rss/settings', 'PUT', { aiSummary: true });
});

/* ---------------- 2. Tidsgrenser ---------------- */

// Gemini «henger» (svarer aldri før signalet avbryter), Groq svarer. Alt annet (Ollama) er nede.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const RECEIPT = { merchant: 'REMA 1000', date: '2026-10-18', total: 99.9, currency: 'NOK', confidence: { merchant: 0.95, date: 0.95, total: 0.95 } };
function aiFetch({ geminiHangs = true } = {}) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    const key = init.headers?.['x-goog-api-key'];
    calls.push({ url, key });
    if (url.includes('generativelanguage')) {
      if (!geminiHangs) return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(RECEIPT) }] } }] });
      return new Promise((_, rej) => { init.signal?.addEventListener('abort', () => rej(init.signal.reason)); });
    }
    if (url.includes('api.groq.com')) return json({ choices: [{ message: { content: JSON.stringify(RECEIPT) } }] });
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

test('tidsgrenser: innstillingene valideres og ligger i FinansHub-innstillingene', async () => {
  const d = await A('/finans/api/settings');
  assert.equal(d.status, 200);
  assert.deepEqual(d.body.aiTimeouts, { gemini: 20, groq: 15, roboflow: 15, ollama: 45, retries: 0, onTimeout: 'next' });
  assert.deepEqual(d.body.aiTimeoutOptions.steps, [5, 10, 15, 20, 30, 45, 60, 90, 120]);
  const put = await A('/finans/api/settings', 'PUT', { aiTimeouts: { gemini: 2, groq: 500, ollama: 30, retries: 9, onTimeout: 'tull' } });
  assert.deepEqual(put.body.aiTimeouts, { gemini: 5, groq: 120, roboflow: 15, ollama: 30, retries: 3, onTimeout: 'next' });
  // Fletting: bare feltene som sendes, endres.
  const put2 = await A('/finans/api/settings', 'PUT', { aiTimeouts: { onTimeout: 'queue' } });
  assert.deepEqual(put2.body.aiTimeouts, { gemini: 5, groq: 120, roboflow: 15, ollama: 30, retries: 3, onTimeout: 'queue' });
  assert.equal((await A('/finans/api/bootstrap')).body.settings.aiTimeouts.onTimeout, 'queue');
  // ISO2: tidsgrensene er serveroppsett. Vanlige brukere ser dem (under server), men kan ikke endre dem.
  const bs = await B('/finans/api/settings');
  assert.equal(bs.status, 200);
  assert.equal(bs.body.canEditServer, false);
  assert.equal(bs.body.server.aiTimeouts.onTimeout, 'queue');
  assert.equal(bs.body.ollamaUrl, undefined, 'vanlige brukere ser ikke server-URL-er');
  assert.equal((await B('/finans/api/settings', 'PUT', { aiTimeouts: { gemini: 60 } })).status, 403);
  assert.equal((await A('/finans/api/settings')).body.aiTimeouts.gemini, 5);
});

// Prompt 48: Groq er tatt ut av kvitteringskjeden og Gemini står sist (etter Ollama). Gemini som henger gir derfor feil til slutt, ikke Groq.
test('tidsgrenser: Gemini henger → nytt forsøk, neste nøkkel, så ingen Groq (prompt 48); status og ai_log viser motoren', async () => {
  AI._resetAi();
  AI._aiTest.scale = 0.01; // 5 s → 50 ms, 1 s ventetid → 10 ms
  setSecret('geminiKey', 'AIza-main-key-aaaaaaaaaaaaaaaa');
  setSecret('groqKey', 'gsk_test');
  keys.addKey('Reserve 1', 'AIzaReserveKeyBBBBBBBBBBBBBBBBBB');
  saveSettings({ provider: 'gemini', fallback: true, aiTasks: {}, aiTimeouts: { gemini: 5, groq: 5, roboflow: 5, ollama: 5, retries: 1, onTimeout: 'next' } });
  const f = aiFetch();
  const statuses = [];
  try {
    await assert.rejects(AI.extract(PNG, 'image/png', ['Dagligvarer'], null, { status: (t, info) => statuses.push([t, info.timeoutEngine]) }), /Gemini: svarte ikke innen tidsfristen/);
  } finally { f.restore(); }
  assert.equal(f.calls.filter((c) => c.url.includes('api.groq.com')).length, 0, 'Groq brukes ikke til kvitteringer');
  const gem = f.calls.filter((c) => c.url.includes('generativelanguage')).map((c) => c.key);
  assert.deepEqual(gem, ['AIza-main-key-aaaaaaaaaaaaaaaa', 'AIza-main-key-aaaaaaaaaaaaaaaa', 'AIzaReserveKeyBBBBBBBBBBBBBBBBBB', 'AIzaReserveKeyBBBBBBBBBBBBBBBBBB'], 'to forsøk per nøkkel');
  const texts = statuses.map((s) => s[0]);
  assert.ok(texts.includes('✦ Gemini svarte ikke innen 5 s · nytt forsøk om 1 s …'), texts.join('\n'));
  assert.ok(texts.includes('✦ Gemini svarte ikke innen 5 s · prøver Gemini (Reserve 1) …'), texts.join('\n'));
  assert.ok(!texts.some((t) => /Groq/.test(t)), texts.join('\n'));
  assert.ok(statuses.every((s) => s[1] === 'gemini'));
  const log = (await A('/finans/api/ai/log?limit=20')).body.items;
  assert.ok(log.some((l) => l.engine === 'gemini' && l.status === 'tidsavbrudd' && l.timeoutEngine === 'gemini'));
});

test('tidsgrenser: tekst-AI (søk, kategorier) går videre til neste motor ved tidsavbrudd', async () => {
  AI._resetAi();
  saveSettings({ provider: 'gemini', fallback: false, aiTimeouts: { gemini: 5, retries: 0, onTimeout: 'next' } });
  const f = aiFetch();
  try {
    // Uten reserve («hold alt lokalt») legges ingen nye skymotorer til.
    await assert.rejects(AI.textJson('hei', { type: 'object', properties: {} }), /Gemini: svarte ikke innen tidsfristen \(5 s\)/);
    AI._resetAi();
    saveSettings({ fallback: true });
    const r = await AI.textJson('hei', { type: 'object', properties: {} });
    assert.equal(r.engine, 'groq');
  } finally { f.restore(); }
});

test('tidsgrenser: onTimeout=queue legger jobben tilbake i køen med retryAt og statustekst', async () => {
  AI._resetAi();
  keys.removeKey((keys.listKeysOut().find((k) => !k.main) ?? {}).id);
  saveSettings({ provider: 'gemini', fallback: true, aiTimeouts: { gemini: 5, retries: 0, onTimeout: 'queue' } });
  const f = aiFetch();
  try {
    const fd = new FormData();
    fd.append('file', new Blob([PNG], { type: 'image/png' }), 'kvittering.png');
    const up = await A('/finans/api/receipts', 'POST', fd);
    assert.equal(up.status, 200, up.text);
    const id = up.body.id;
    let job;
    for (let i = 0; i < 100; i++) {
      job = (await A('/finans/api/receipts/jobs')).body.find((j) => j.id === id);
      if (job?.retryAt) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(job.status, 'pending');
    assert.equal(job.timeoutEngine, 'gemini');
    assert.ok(job.retryAt > Date.now() - 1000);
    assert.match(job.statusText, /^✦ Gemini svarte ikke innen 5 s · lagt i kø, prøver igjen kl\. \d\d:\d\d$/);
    assert.equal(job.aiShort, job.statusText);
    assert.equal(f.calls.filter((c) => c.url.includes('api.groq.com')).length, 0, 'køen prøver ikke neste motor');
    // onTimeout=ocr: lokal OCR med en gang (her er OCR av/ikke installert, så feilen sier at Gemini ikke svarte).
    saveSettings({ aiTimeouts: { gemini: 5, retries: 0, onTimeout: 'ocr' } });
    AI._resetAi();
    const statuses = [];
    await AI.extract(PNG, 'image/png', ['Dagligvarer'], null, { status: (t) => statuses.push(t) }).catch((e) => { assert.equal(e.timeoutEngine, 'gemini'); });
    assert.ok(statuses.includes('✦ Gemini svarte ikke innen 5 s · prøver lokal OCR …'), statuses.join('\n'));
    assert.equal(f.calls.filter((c) => c.url.includes('api.groq.com')).length, 0);
  } finally { f.restore(); AI._aiTest.scale = 1; saveSettings({ aiTimeouts: { onTimeout: 'next' } }); }
});

/* ---------------- 3. Finn-annonsen ---------------- */

const AD_HTML = `<html><head><title>iPhone 14 Pro 256 GB | FINN torget</title>
<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'iPhone 14 Pro 256 GB', description: 'Pent brukt, alltid med deksel. Batteri 91 %.', brand: { name: 'Apple' }, model: 'iPhone 14 Pro',
  image: ['https://images.finncdn.no/dynamic/1280w/item/1.jpg', 'https://images.finncdn.no/dynamic/1280w/item/2.jpg'], offers: { price: 6500, itemCondition: 'https://schema.org/UsedCondition' } })}</script></head>
<body><dl><dt>Lagringskapasitet</dt><dd>256 GB</dd><dt>Farge</dt><dd>Lilla</dd></dl></body></html>`;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

test('Finn: annonsen hentes når handelen opprettes, med attributter, lokale bilder, e-poster og meldinger', async () => {
  let gone = false;
  finn._setFetch(async (url) => {
    const u = String(url);
    if (u.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\n');
    if (u.includes('images.finncdn.no')) return new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } });
    if (u.includes('/item/123456789')) return gone ? new Response('borte', { status: 410 }) : new Response(AD_HTML, { headers: { 'content-type': 'text/html' } });
    return new Response('nei', { status: 404 });
  }, 0);
  const f = await A('/finans/api/finn', 'POST', { role: 'bought', item: 'iPhone 14 Pro', amount: 6500, counterpart: 'selger Kari', adUrl: 'https://www.finn.no/recommerce/forsale/item/123456789' });
  assert.equal(f.status, 200, f.text);
  assert.equal(f.body.adError, undefined);
  const id = f.body.id;
  const ad = await A(`/finans/api/finn/${id}/ad`);
  assert.equal(ad.status, 200);
  assert.equal(ad.body.title, 'iPhone 14 Pro 256 GB');
  assert.equal(ad.body.price, 6500);
  assert.match(ad.body.description, /Batteri 91/);
  assert.deepEqual(ad.body.attrs, [{ label: 'Tilstand', value: 'Brukt' }, { label: 'Merke', value: 'Apple' }, { label: 'Modell', value: 'iPhone 14 Pro' }, { label: 'Lagringskapasitet', value: '256 GB' }, { label: 'Farge', value: 'Lilla' }]);
  assert.deepEqual(ad.body.images, [`/finans/api/finn/${id}/img/0`, `/finans/api/finn/${id}/img/1`]);
  assert.equal(ad.body.url, 'https://www.finn.no/recommerce/forsale/item/123456789');
  assert.equal(ad.body.removed, false);
  assert.ok(Date.parse(ad.body.fetchedAt));
  const img = await A(`/finans/api/finn/${id}/img/0`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.ok(existsSync(join(process.env.DATA_DIR, 'finn', '123456789')), 'bildene ligger i DATA_DIR/finn/<finnkode>/');
  assert.equal((await A(`/finans/api/finn/${id}/img/9`)).status, 404);

  // Fjernet fra finn.no: kopien beholdes og merkes.
  gone = true;
  const rf = await A(`/finans/api/finn/${id}/ad/refresh`, 'POST');
  assert.equal(rf.status, 200, rf.text);
  assert.equal(rf.body.removed, true);
  assert.equal(rf.body.title, 'iPhone 14 Pro 256 GB');
  assert.equal(rf.body.images.length, 2);

  // E-poster og meldinger fra e-postvarslene.
  const { db } = await import('../server/finans/db.js');
  const row = db.prepare('SELECT * FROM fh_finn WHERE id=?').get(id);
  finn.attachMail(row, { messageId: '<a@finn.no>', date: '2026-10-10', from: 'FINN.no <noreply@finn.no>', subject: 'Kvittering: du har betalt', text: 'Du har kjøpt iPhone 14 Pro fra selger Kari. Totalt: 6 500 kr' });
  finn.attachMail(row, { messageId: '<b@finn.no>', date: '2026-10-11', from: 'FINN.no <meldinger@finn.no>', subject: 'Du har fått en ny melding', text: 'Du har fått en ny melding fra Kari:\n«Sender i morgen!»\nSvar på meldingen i FINN: https://www.finn.no/messages/conversation/abc123' });
  finn.attachMail(row, { messageId: '<c@finn.no>', date: '2026-10-11', from: 'FINN.no <meldinger@finn.no>', subject: 'Du sendte en melding', text: 'Kopi av meldingen din til Kari:\n«Supert, takk!»' });
  const em = await A(`/finans/api/finn/${id}/emails`);
  assert.equal(em.status, 200);
  assert.equal(em.body.length, 3);
  assert.deepEqual(Object.keys(em.body[0]).sort(), ['date', 'from', 'id', 'snippet', 'subject']);
  const one = await A(`/finans/api/finn/${id}/emails/${em.body.find((e) => e.subject.startsWith('Kvittering')).id}`);
  assert.match(one.body.body, /Totalt: 6 500 kr/);
  assert.equal((await A(`/finans/api/finn/${id + 999}/emails`)).status, 404);
  const ms = await A(`/finans/api/finn/${id}/messages`);
  assert.deepEqual(ms.body.items.map(({ from, text, time }) => ({ from, text, time })), [{ from: 'them', text: 'Sender i morgen!', time: '2026-10-11' }, { from: 'me', text: 'Supert, takk!', time: '2026-10-11' }]);
  assert.equal(ms.body.chatUrl, 'https://www.finn.no/messages/conversation/abc123');
  const full = await A(`/finans/api/finn/${id}`);
  assert.equal(full.body.messages.length, 2);
  assert.equal(full.body.ad.attrs.length, 5);
  // ISO2: handelen er admins egen; andre brukere (eget regnskap) finner den ikke.
  assert.equal((await B(`/finans/api/finn/${id}/ad`)).status, 404);
  assert.equal((await B(`/finans/api/finn/${id}/messages`)).status, 404);
  finn._setFetch(null);
});

/* ---------------- 4. Layout ---------------- */

test('layout: subHomeOrder valideres og lagres per bruker', async () => {
  const ok = await A('/api/me/layout', 'PUT', { subHomeOrder: ['list', 'ai', 'next7', 'check'] });
  assert.equal(ok.status, 200);
  assert.deepEqual((await A('/api/me/layout')).body.subHomeOrder, ['list', 'ai', 'next7', 'check']);
  for (const bad of [['ai', 'ai'], ['ai', 'ukjent'], [], 'ai', ['ai', 'next7', 'check', 'list', 'ai']]) {
    assert.equal((await A('/api/me/layout', 'PUT', { subHomeOrder: bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await B('/api/me/layout')).body.subHomeOrder, undefined);
  assert.equal((await A('/api/me/layout', 'PUT', { subHomeOrder: null })).status, 200);
  assert.equal((await A('/api/me/layout')).body.subHomeOrder, undefined);
});
