import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-search-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { db } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');
const { stem, fold, interpret, plainSearch, suggestionGroups } = await import('../server/finans/search.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const J = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: J, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// AI-motor som ikke svarer (lukket port) – søket skal falle tilbake til vanlig søk.
await call('/settings', 'PUT', { ollamaUrl: 'http://127.0.0.1:9', provider: 'ollama', fallback: false });

const now = new Date(), y = now.getFullYear(), m = now.getMonth();
const day = (monthsBack, d) => new Date(y, m - monthsBack, d).toLocaleDateString('sv-SE');
const cat = (name) => db.prepare('SELECT id FROM fh_categories WHERE name=?').pluck().get(name) ?? null;
const insTx = db.prepare('INSERT INTO fh_transactions(date, amount, description, merchant, category_id, note, created,user_id) VALUES(?,?,?,?,?,?,?,\'owner\')');
const tx = (date, kr, desc, merchant = desc, category = null, note = '') => Number(insTx.run(date, Math.round(kr * 100), desc, merchant, category && cat(category), note, Date.now()).lastInsertRowid);
const insRc = db.prepare("INSERT INTO fh_receipts(id, status, merchant, date, total, extraction, transaction_id, created,user_id) VALUES(?,?,?,?,?,?,?,?,'owner')");
const rc = (id, status, merchant, date, total, lines, txId = null) => insRc.run(id, status, merchant, date, Math.round(total * 100), JSON.stringify({ merchant, lines }), txId, Date.now());

const b1 = tx(day(0, 3), -349, 'Biltema Alnabru', 'Biltema Alnabru', 'Hjem');
tx(day(1, 20), -129.9, 'Biltema Lørenskog', 'Biltema Lørenskog', 'Hjem');
const rema = tx(day(0, 2), -386.5, 'Rema 1000 Bislett', 'Rema 1000 Bislett', 'Mat og dagligvarer');
tx(day(1, 5), -54.2, 'Kiwi Majorstuen', 'Kiwi Majorstuen', 'Mat og dagligvarer', 'Tomater til pizzakvelden');
tx(day(1, 14), -1284, 'Fjordkraft strøm', 'Fjordkraft', 'Bolig');
tx(day(0, 1), 41200, 'Lønn', 'Lønn', null);
tx(day(0, 1), -9800, 'Husleie oktober', 'Husleie', 'Bolig');
rc('r-rema', 'booked', 'Rema 1000 Bislett', day(0, 2), 386.5, [{ description: 'Tomater 500 g', amount: 24.9 }, { description: 'Melk lett 1,75 l', amount: 21.5 }, { description: 'Café-kaffe', amount: 89 }], rema);
rc('r-bil', 'booked', 'Biltema Alnabru', day(0, 3), 349, [{ description: 'Lyspære E27 ×2', amount: 150 }, { description: 'Skjøteledning', amount: 199 }], b1);
rc('r-review', 'needs_review', 'Clas Ohlson', day(0, 4), 129, [{ description: 'Epler 1 kg', amount: 39 }]);

test('stemming og aksenter: tomat/tomater/tomatene, eple/epler, café', () => {
  assert.equal(stem('tomater'), stem('tomat'));
  assert.equal(stem('tomatene'), 'tomat');
  assert.equal(stem('epler'), stem('eple'));
  assert.equal(fold('Café'), 'cafe');
  assert.equal(fold('Lørenskog'), 'lørenskog');
});

test('tolkning av vanlige spørsmål', () => {
  assert.equal(interpret('Sist jeg var på biltema, finn om det er noen butikker kalt biltema og datoen').store, 'biltema');
  assert.equal(interpret('kvitteringer med tomater').item, 'tomater');
  assert.equal(interpret('Sist jeg kjøpte melk').item, 'melk');
  assert.equal(interpret('over 500 kr i september').minAmount, 500);
  assert.equal(interpret('over 1 200,50 kr').minAmount, 1200.5);
  assert.equal(interpret('største utgift').largest, true);
  assert.equal(interpret('til gjennomgang').review, true);
  assert.match(interpret('strøm i oktober 2026').month, /oktober 2026/);
});

test('«sist jeg var på Biltema» gir siste kjøp, dato og alle butikker med navnet', () => {
  const r = plainSearch('Sist jeg var på biltema, finn om det er noen butikker kalt biltema og datoen');
  assert.equal(r.mode, 'plain');
  assert.equal(r.interpreted.store, 'biltema');
  assert.equal(r.stores.length, 2);
  assert.deepEqual(r.stores.map((s) => s.name).sort(), ['Biltema Alnabru', 'Biltema Lørenskog']);
  assert.equal(r.hits[0].description, 'Biltema Alnabru');
  assert.equal(r.hits[0].reason, 'Butikk · Biltema Alnabru');
  assert.match(r.summary, /Sist du var på Biltema Alnabru/);
  assert.match(r.summary, /2 butikker/);
});

test('«kvitteringer med tomater» finner varelinjen, med bøying', () => {
  for (const qtext of ['kvitteringer med tomater', 'kvitteringer med tomat', 'Sist jeg kjøpte tomatene']) {
    const r = plainSearch(qtext);
    assert.equal(r.hits.length, 1, qtext);
    assert.equal(r.hits[0].type, 'line');
    assert.equal(r.hits[0].receiptId, 'r-rema');
    assert.equal(r.hits[0].txId, rema);
    assert.equal(r.hits[0].reason, 'I kvitteringen · Tomater 500 g 24,90 kr');
  }
});

test('fritekst søker i butikk, kategori, notat og varelinjer', () => {
  const r = plainSearch('tomater');
  const reasons = r.hits.map((h) => h.reason);
  assert.ok(reasons.includes('I kvitteringen · Tomater 500 g 24,90 kr'));
  assert.ok(reasons.some((x) => x.startsWith('Notat · Tomater til pizzakvelden')));
  const k = plainSearch('bolig');
  assert.ok(k.hits.every((h) => h.reason === 'Kategori · Bolig'));
  assert.equal(k.hits.length, 2);
  assert.equal(plainSearch('kaffe').hits[0].reason, 'I kvitteringen · Café-kaffe 89,00 kr');
});

test('beløp, største utgift, måned og til gjennomgang', () => {
  const over = plainSearch('over 500 kr');
  assert.ok(over.hits.length >= 2 && over.hits.every((h) => Math.abs(h.amount) >= 500));
  const big = plainSearch('største utgift');
  assert.equal(big.hits[0].description, 'Husleie');
  assert.match(big.summary, /Største utgift var Husleie/);
  const mName = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'][(m + 11) % 12];
  const month = plainSearch(`strøm i ${mName}`);
  assert.equal(month.hits.length, 1);
  assert.equal(month.hits[0].description, 'Fjordkraft');
  const rev = plainSearch('til gjennomgang');
  assert.equal(rev.hits.length, 1);
  assert.equal(rev.hits[0].description, 'Clas Ohlson');
  assert.match(rev.hits[0].reason, /^Til gjennomgang/);
});

test('ingen treff gir en forklaring og forslag', () => {
  const r = plainSearch('zxqv');
  assert.equal(r.hits.length, 0);
  assert.match(r.summary, /Fant ingen treff/);
  assert.ok(r.suggestions.length > 0);
});

test('«Prøv også» kan selv tolkes av vanlig søk', () => {
  for (const qtext of ['Sist jeg var på biltema', 'kvitteringer med tomater', 'strøm', 'til gjennomgang']) {
    const r = plainSearch(qtext);
    assert.ok(r.followUps.length >= 2, qtext);
    for (const f of r.followUps) assert.ok(plainSearch(f).hits.length >= 0);
  }
  const b = plainSearch('Sist jeg var på biltema');
  assert.ok(b.followUps.some((f) => /biltema/i.test(f)));
  assert.ok(plainSearch(b.followUps[0]).hits.length > 0, b.followUps[0]);
});

test('forslag i tre grupper bygd fra egne data', () => {
  const g = suggestionGroups();
  assert.deepEqual(g.map((x) => x.title), ['Butikker', 'Varer i kvitteringer', 'Beløp og perioder']);
  assert.ok(g[0].items.some((s) => /Biltema|Rema 1000/.test(s)));
  assert.ok(g[1].items.some((s) => /tomater|melk|lyspære|skjøteledning|epler/i.test(s)));
  assert.ok(g[2].items.includes('Til gjennomgang'));
});

test('GET /search og /search/suggestions', async () => {
  const r = await call('/search?q=' + encodeURIComponent('kvitteringer med tomater'));
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'plain');
  assert.equal(r.body.hits[0].reason, 'I kvitteringen · Tomater 500 g 24,90 kr');
  assert.ok(Array.isArray(r.body.followUps) && Array.isArray(r.body.suggestions));
  const s = await call('/search/suggestions');
  assert.equal(s.body.groups.length, 3);
  assert.ok(Array.isArray(s.body.items) && s.body.items.length >= 6);
  const empty = await call('/search?q=');
  assert.equal(empty.body.hits.length, 0);
  assert.equal(empty.body.groups.length, 3);
});

test('POST /search/ai faller tilbake til vanlig søk når AI ikke svarer', async () => {
  const r = await call('/search/ai', 'POST', { q: 'Sist jeg var på biltema' });
  assert.equal(r.status, 200);
  assert.equal(r.body.aiUnavailable, true);
  assert.equal(r.body.mode, 'plain');
  assert.equal(r.body.stores.length, 2);
  assert.ok(r.body.answer);
  assert.ok(r.body.followUps.length && r.body.suggestions.length);
  assert.equal(r.body.history[0], 'Sist jeg var på biltema');
  const p = await call('/search/ai', 'POST', { q: 'kvitteringer med melk', mode: 'plain', save: false });
  assert.equal(p.body.mode, 'plain');
  assert.equal(p.body.aiUnavailable, undefined);
  assert.equal(p.body.hits[0].reason, 'I kvitteringen · Melk lett 1,75 l 21,50 kr');
});
