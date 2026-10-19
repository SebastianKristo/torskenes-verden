// Prompt 27 (SERVER-B): Finans-søkeforslag (/finans/api/forslag), uklar matching i vanlig søk («blosm» → Blomsterlandet)
// og nytt abonnement fra skjermbilde (Ollama lokalt, mocket).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p27b-fin-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p27b-fin-logos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
delete process.env.MOCK_DATA;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const { forslag, initials } = await import('../server/finans/forslag.js');
const shot = await import('../server/finans/sub-screenshot.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { cookie, ...(body && !isForm ? { 'content-type': 'application/json' } : {}) }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text };
};
const S = client(await login('sebastian', 'testpassord1'));
assert.equal((await S('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client(await login('kari', 'kariPassord123'));
await S('/finans/api/transactions'); // oppretter regnskapet (standardkategorier)
await K('/finans/api/transactions');

const cat = (name) => db.prepare('SELECT id FROM fh_categories WHERE name=? AND user_id=?').get(name, 'owner')?.id ?? null;
const ins = db.prepare("INSERT INTO fh_transactions(date,amount,description,merchant,category_id,source,created,user_id) VALUES(?,?,?,?,?,'manual',?,?)");
const tx = (date, kr, name, category, u = 'owner') => ins.run(date, Math.round(kr * 100), name, name, category ? cat(category) : null, Date.now(), u);
tx('2026-10-01', -309, 'Blomsterlandet Ski', 'Hjem');
tx('2026-10-12', -309, 'Blomsterlandet Ski', 'Hjem');
tx('2026-10-03', -89.9, 'Bloms Kafé', 'Restaurant og kafé');
tx('2026-10-05', -412.5, 'Rema 1000 Majorstuen', 'Mat og dagligvarer');
tx('2026-10-06', -152, 'Rema 1000 Majorstuen', 'Mat og dagligvarer');
tx('2026-10-07', -45, 'Café Mocca', 'Restaurant og kafé');
tx('2026-10-08', -199, 'Blåbærhuset', 'Mat og dagligvarer');
db.prepare("INSERT INTO fh_receipts(id,status,merchant,extraction,created,user_id) VALUES('rc1','booked','Rema 1000',?,?,'owner')").run(JSON.stringify({ lines: [{ description: 'Blomkål', amount: 29.9 }, { description: 'Melk lett 1L', amount: 21.5 }] }), Date.now());
db.prepare("INSERT INTO fh_receipts(id,status,merchant,extraction,created,user_id) VALUES('rc2','booked','Kiwi',?,?,'owner')").run(JSON.stringify({ lines: [{ description: 'Blomkål', amount: 32.9 }] }), Date.now());
tx('2026-10-09', -999, 'Blomsterlandet Kari', 'Hjem', (await K('/api/me')).body?.id ?? 'x');

test('forslag: butikk først ved lik score, «Butikk · 2 kjøp · −618 kr», ikon og farge', async () => {
  const r = await S('/finans/api/forslag?q=bloms&limit=6');
  assert.equal(r.status, 200);
  const [first] = r.body;
  assert.deepEqual({ type: first.type, navn: first.navn, antall: first.antall, sum: first.sum, ikon: first.ikon }, { type: 'butikk', navn: 'Blomsterlandet Ski', antall: 2, sum: -61800, ikon: 'BS' });
  assert.match(first.farge, /^#[0-9a-f]{6}$/i);
  const types = r.body.map((x) => x.type);
  assert.ok(types.indexOf('butikk') < types.indexOf('vare'), 'butikk før vare');
  const kal = r.body.find((x) => x.type === 'vare' && x.navn === 'Blomkål');
  assert.deepEqual([kal.antall, kal.sum], [2, -6280]);
  assert.ok(!r.body.some((x) => x.navn === 'Blomsterlandet Kari'), 'bare egne data');
  assert.deepEqual((await K('/finans/api/forslag?q=rema')).body, []);
  assert.equal((await S('/finans/api/forslag?q=bl&limit=2')).body.length, 2);
  assert.deepEqual((await S('/finans/api/forslag?q=')).body, []);
});

test('score 4/3/2/1: start, ordstart, inneholder, Levenshtein ≤ 1 (q ≥ 4) – og diakritiske tegn', async () => {
  const names = (q) => forslag(q, { u: 'owner', limit: 20 }).map((x) => x.navn);
  assert.equal(names('rema')[0], 'Rema 1000 Majorstuen');
  assert.ok(names('majorst').includes('Rema 1000 Majorstuen'), 'et ord starter med q');
  assert.ok(names('jorst').includes('Rema 1000 Majorstuen'), 'inneholder q');
  assert.equal(names('blosm')[0], 'Blomsterlandet Ski', 'ombytting = én feil');
  assert.ok(!names('blo').includes('Bloms Kafé') || names('blo').indexOf('Blomsterlandet Ski') < names('blo').indexOf('Bloms Kafé'), 'flest kjøp først ved lik score');
  assert.ok(names('cafe').includes('Café Mocca'), 'é → e');
  assert.ok(names('blåbær').includes('Blåbærhuset'), 'å beholdes');
  assert.ok(!forslag('xq', { u: 'owner' }).length);
  // Kategorier.
  const k = forslag('mat og', { u: 'owner' }).find((x) => x.type === 'kategori');
  assert.equal(k.navn, 'Mat og dagligvarer');
  assert.equal(k.antall, 3);
  assert.equal(initials('Mat og dagligvarer'), 'MD');
});

test('cachen bygges på nytt når det kommer nye transaksjoner, og svaret er raskt', async () => {
  assert.equal(forslag('bloms', { u: 'owner' })[0].antall, 2);
  tx('2026-10-15', -150, 'Blomsterlandet Ski', 'Hjem');
  assert.equal(forslag('bloms', { u: 'owner' })[0].antall, 3);
  const many = db.transaction(() => { for (let i = 0; i < 3000; i++) tx('2026-09-01', -10 - (i % 50), `Butikk ${i % 400} Oslo`, 'Hjem'); });
  many();
  forslag('butikk', { u: 'owner' }); // bygger cachen
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) forslag(['bu', 'butt', 'blosm', 'rema', 'butikk 12'][i % 5], { u: 'owner' });
  const per = (performance.now() - t0) / 10;
  assert.ok(per < 50, `forslag tok ${per.toFixed(1)} ms`);
});

test('vanlig søk bruker samme uklare matching: «blosm» finner Blomsterlandet', async () => {
  const r = await S('/finans/api/search?q=blosm');
  assert.equal(r.status, 200);
  assert.ok(r.body.hits.length >= 3);
  const bl = r.body.hits.filter((h) => h.description === 'Blomsterlandet Ski');
  assert.equal(bl.length, 3);
  assert.match(bl[0].reason, /^Butikk · Blomsterlandet/);
  assert.ok(!r.body.hits.some((h) => /Kari/.test(h.description)));
  // Eksakte treff brukes som før (ingen uklare treff når det finnes vanlige).
  const exact = await S('/finans/api/search?q=rema');
  assert.ok(exact.body.hits.length && exact.body.hits.every((h) => !h.fuzzy));
});

test('abonnement fra skjermbilde: Ollama lokalt, kjent tjeneste, valuta regnes om (≈), manglende dato → i dag + syklus og «Sjekk»', async () => {
  const sent = [];
  shot._setScreenshotFetch(async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ message: { content: JSON.stringify({ tjeneste: 'NETFLIX.COM', plan: 'Standard', pris: 15.49, valuta: 'USD', syklus: 'mnd', neste_trekk: null, sikkerhet: { tjeneste: 0.95, plan: 0.9, pris: 0.95, syklus: 0.85, neste_trekk: 0 } }) } });
  });
  const png = Buffer.alloc(200); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  const fd = new FormData();
  fd.append('image', new File([png], 'skjerm.png', { type: 'image/png' }));
  const r = await S('/finans/api/subscriptions/from-screenshot', 'POST', fd);
  assert.equal(r.status, 200, r.text);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'http://ollama.test:11434/api/chat', 'bare lokal Ollama');
  assert.equal(sent[0].body.model, 'qwen2.5vl:7b');
  assert.ok(sent[0].body.format && sent[0].body.messages[0].images[0].length > 10);
  const b = r.body;
  assert.equal(b.tjeneste, 'Netflix');
  assert.equal(b.domain, 'netflix.com');
  assert.equal(b.kategori, 'Underholdning');
  assert.equal(b.pris, Math.round(15.49 * shot.RATES.USD * 100));
  assert.equal(b.valuta, 'NOK');
  assert.equal(b.approx, true);
  assert.deepEqual(b.prisOriginal, { belop: 1549, valuta: 'USD', tekst: '15,49 USD' });
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  assert.equal(b.neste_trekk, d.toLocaleDateString('sv-SE'));
  assert.ok(b.check.includes('neste_trekk') && b.check.includes('pris'));
  assert.equal(b.existingId, undefined);
  // Finnes tjenesten fra før: existingId.
  const s = await S('/finans/api/subscriptions', 'POST', { name: 'Netflix', price: 129, cycle: 'monthly' });
  const again = await S('/finans/api/subscriptions/from-screenshot', 'POST', fd);
  assert.equal(again.body.existingId, s.body.id ?? s.body.subscription?.id);
  assert.equal((await K('/finans/api/subscriptions/from-screenshot', 'POST', fd)).body.existingId, undefined, 'per bruker');
  // Ugyldig fil.
  const bad = new FormData();
  bad.append('image', new File(['hei'], 'x.txt', { type: 'text/plain' }));
  assert.equal((await S('/finans/api/subscriptions/from-screenshot', 'POST', bad)).status, 400);
  // Mock (MOCK_DATA=1) gir Spotify.
  shot._setScreenshotFetch(null);
  process.env.MOCK_DATA = '1';
  try {
    const m = await S('/finans/api/subscriptions/from-screenshot', 'POST', fd);
    assert.equal(m.body.tjeneste, 'Spotify');
    assert.equal(m.body.pris, 17900);
    assert.equal(m.body.syklus, 'mnd');
  } finally { delete process.env.MOCK_DATA; }
});

test('normalisering: årlig syklus, symboler og kjente tjenester', () => {
  const n = shot.normalizeSub({ tjeneste: 'iCloud+ 200 GB', pris: '39,00', valuta: 'kr', syklus: 'year', neste_trekk: '2026-12-01', sikkerhet: { tjeneste: 0.9, plan: 0.9, pris: 0.9, syklus: 0.9, neste_trekk: 0.9 } }, { now: '2026-10-19', u: 'nobody' });
  assert.deepEqual([n.tjeneste, n.pris, n.syklus, n.neste_trekk, n.kategori, n.approx], ['iCloud+', 3900, 'år', '2026-12-01', 'Lagring og sky', false]);
  assert.deepEqual(n.check, []);
  const e = shot.normalizeSub({ tjeneste: 'Ukjent Tjeneste', pris: 5, valuta: '€', sikkerhet: {} }, { now: '2026-10-19', u: 'nobody' });
  assert.equal(e.pris, 5850);
  assert.equal(e.neste_trekk, '2026-11-19');
  assert.ok(e.check.includes('tjeneste') && e.check.includes('kategori'));
});
