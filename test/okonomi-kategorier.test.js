// Kategoriene i Økonomi (Fase 6, Q11): nye standardkategorier for nye regnskap, visningsnavn = lagret navn, og flyttingen av
// eksisterende data som bare admin kan gjøre (forhåndsvisning → bekreftelse → angring). Ingenting endres av seg selv.
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-okonomi-kategorier-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-kat';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/finans/db.js');
const { DEFAULT_CATEGORIES } = await import('../server/finans/db.js');
const { heuristic } = await import('../server/finans/enrich.js');

let ip = 20;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ip++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.3' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const ingridId = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'sebastian', password: 'testpassord1', device: 'iPhone' } })).json?.token;
const AT = as({ authorization: `Bearer ${tok}` });

const names = (u) => db.prepare('SELECT name FROM fh_categories WHERE user_id=? ORDER BY sort, id').pluck().all(u);
const catId = (u, n) => db.prepare('SELECT id FROM fh_categories WHERE user_id=? AND name=?').pluck().get(u, n);
const count = (t, u, cid) => db.prepare(`SELECT count(*) FROM ${t} WHERE user_id=? AND category_id=?`).pluck().get(u, cid);

test('nye regnskap får «Bolig» og «Hjem og interiør», og ingen kategori «Abonnementer»', async () => {
  assert.equal((await I('/finans/api/bootstrap')).status, 200); // første bruk seeder regnskapet
  const n = names(ingridId);
  assert.ok(n.includes('Bolig') && n.includes('Hjem og interiør'));
  assert.ok(!n.includes('Hjem') && !n.includes('Abonnementer'));
  assert.deepEqual(n, DEFAULT_CATEGORIES.map(([x]) => x));
  // Streamingregelen peker på Fritid og hobby i stedet for Abonnementer.
  const rule = db.prepare("SELECT c.name FROM fh_rules r JOIN fh_categories c ON c.id=r.category_id WHERE r.user_id=? AND r.pattern='SPOTIFY*'").pluck().get(ingridId);
  assert.equal(rule, 'Fritid og hobby');
});

test('visningsteksten er det lagrede kategorinavnet (ingen egne oversettelser)', () => {
  assert.equal(heuristic({ merchant: 'Ukjent butikk', amount: -100, category: 'Hjem og interiør' }).short, 'Hjem og interiør');
  assert.equal(heuristic({ merchant: 'Ukjent butikk', amount: -100, category: 'Mat og dagligvarer' }).short, 'Mat og dagligvarer');
  assert.equal(heuristic({ merchant: 'Ukjent', amount: -100, category: 'Hjem' }).short, 'Hjem');
});

// Et eldre regnskap: eieren og Ingrid har de gamle kategoriene «Hjem» og «Abonnementer» med data.
const OWNER = 'owner';
function oldLedger(u) {
  // De gamle standardkategoriene: «Hjem» i stedet for «Hjem og interiør», og «Abonnementer».
  db.prepare("UPDATE fh_categories SET name='Hjem' WHERE user_id=? AND name='Hjem og interiør'").run(u);
  db.prepare('INSERT OR IGNORE INTO fh_categories(name,color,kind,sort,user_id) VALUES(?,?,?,?,?)').run('Abonnementer', '#FF6B8B', 'expense', 6, u);
  const acc = db.prepare("INSERT INTO fh_accounts(name,bank,type,user_id) VALUES('Brukskonto','','checking',?) RETURNING id").pluck().get(u);
  const tx = db.prepare("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,created,user_id) VALUES(?,?,?,?,?,?,'manual',?,?)");
  for (let i = 0; i < 3; i++) tx.run(acc, `2026-10-0${i + 1}`, -19900, 'Jula', 'Jula', catId(u, 'Hjem'), Date.now(), u);
  for (let i = 0; i < 2; i++) tx.run(acc, `2026-10-1${i}`, -12900, 'Spotify', 'Spotify', catId(u, 'Abonnementer'), Date.now(), u);
  const bud = db.prepare('INSERT INTO fh_budgets(category_id,month,amount,user_id) VALUES(?,?,?,?)');
  bud.run(catId(u, 'Hjem'), 'default', 100000, u);
  bud.run(catId(u, 'Abonnementer'), 'default', 75000, u);
  bud.run(catId(u, 'Fritid og hobby'), 'default', 150000, u);
  db.prepare("INSERT INTO fh_recurring(name,amount,interval,day,category_id,active,user_id) VALUES('Netflix',27900,'monthly',28,?,1,?)").run(catId(u, 'Abonnementer'), u);
}

test('kategoridata endres ikke av seg selv: uten admin-handling står de gamle kategoriene', async () => {
  oldLedger(OWNER); oldLedger(ingridId);
  await A('/finans/api/bootstrap'); await I('/finans/api/bootstrap');
  assert.ok(catId(OWNER, 'Hjem') && catId(OWNER, 'Abonnementer') && catId(ingridId, 'Abonnementer'));
});

test('bare admin i nettleseren: vanlig bruker og app-token får 403', async () => {
  assert.equal((await I('/finans/api/categories/migration')).status, 403);
  assert.equal((await I('/finans/api/categories/migration', 'POST', { confirm: true, previewId: 'x' })).status, 403);
  assert.equal((await AT('/finans/api/categories/migration')).status, 403);
  assert.equal((await req('/finans/api/categories/migration')).status, 401);
});

let preview;
test('forhåndsvisning: antall per tabell og tekst som «3 transaksjoner i Hjem → Hjem og interiør», uten å endre noe', async () => {
  const before = names(OWNER).join();
  const r = await A('/finans/api/categories/migration');
  assert.equal(r.status, 200, r.text);
  preview = r.json;
  const hjem = preview.mappings.find((m) => m.id === 'hjem'), abo = preview.mappings.find((m) => m.id === 'abonnementer');
  assert.equal(hjem.users, 2);
  assert.equal(hjem.transactions, 6);
  assert.equal(hjem.budgets, 2);
  assert.equal(hjem.rename, 2, '«Hjem og interiør» finnes ikke hos dem: kategorien får nytt navn');
  assert.ok(hjem.lines.includes('6 transaksjoner i Hjem → Hjem og interiør'), hjem.lines.join(' | '));
  assert.ok(hjem.lines.includes('2 budsjetter'));
  assert.equal(abo.to, 'Fritid og hobby');
  assert.equal(abo.transactions, 4);
  assert.equal(abo.recurring, 2);
  assert.equal(abo.merge, 2);
  assert.ok(abo.lines.includes('4 transaksjoner i Abonnementer → Fritid og hobby'));
  assert.match(preview.previewId, /^[0-9a-f]{16}$/);
  assert.equal(names(OWNER).join(), before, 'forhåndsvisningen endrer ingenting');
  // Annet mål gir en annen forhåndsvisning.
  const other = (await A('/finans/api/categories/migration?abonnementer=Annet')).json;
  assert.equal(other.mappings.find((m) => m.id === 'abonnementer').to, 'Annet');
  assert.notEqual(other.previewId, preview.previewId);
});

test('utføring krever bekreftelse og samme forhåndsvisning', async () => {
  assert.equal((await A('/finans/api/categories/migration', 'POST', { previewId: preview.previewId })).status, 400);
  const stale = await A('/finans/api/categories/migration', 'POST', { confirm: true, previewId: '0000000000000000' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.code, 'PREVIEW_STALE');
  assert.ok(catId(OWNER, 'Hjem'), 'ingenting er flyttet');
});

let runId;
const snapshot = () => JSON.stringify([OWNER, ingridId].map((u) => ({
  cats: db.prepare('SELECT id, name, color, kind, sort FROM fh_categories WHERE user_id=? ORDER BY id').all(u),
  tx: db.prepare('SELECT id, category_id FROM fh_transactions WHERE user_id=? ORDER BY id').all(u),
  bud: db.prepare('SELECT category_id, month, amount FROM fh_budgets WHERE user_id=? ORDER BY category_id, month').all(u),
  rec: db.prepare('SELECT id, category_id FROM fh_recurring WHERE user_id=? ORDER BY id').all(u),
  rules: db.prepare('SELECT id, category_id FROM fh_rules WHERE user_id=? ORDER BY id').all(u),
})));
let before;
test('utføring: Hjem får nytt navn, Abonnementer slås sammen med målet, budsjettene legges sammen', async () => {
  before = snapshot();
  const hjemId = catId(OWNER, 'Hjem'), aboId = catId(OWNER, 'Abonnementer'), fritid = catId(OWNER, 'Fritid og hobby');
  const r = await A('/finans/api/categories/migration', 'POST', { confirm: true, previewId: preview.previewId });
  assert.equal(r.status, 200, r.text);
  runId = r.json.id;
  assert.equal(catId(OWNER, 'Hjem'), undefined);
  assert.equal(catId(OWNER, 'Hjem og interiør'), hjemId, 'samme kategori, nytt navn');
  assert.equal(count('fh_transactions', OWNER, hjemId), 3);
  assert.equal(catId(OWNER, 'Abonnementer'), undefined);
  assert.equal(count('fh_transactions', OWNER, aboId), 0);
  assert.equal(count('fh_transactions', OWNER, fritid), 2);
  assert.equal(count('fh_recurring', OWNER, fritid), 1);
  assert.equal(db.prepare("SELECT amount FROM fh_budgets WHERE category_id=? AND month='default'").pluck().get(fritid), 225000, '1 500 + 750 kr');
  assert.equal(catId(ingridId, 'Abonnementer'), undefined, 'gjelder alle regnskapene');
  // Ny forhåndsvisning: ingenting igjen å flytte.
  const p2 = (await A('/finans/api/categories/migration')).json;
  assert.equal(p2.nothing, true);
  assert.equal((await A('/finans/api/categories/migration', 'POST', { confirm: true, previewId: p2.previewId })).status, 400);
  assert.ok(p2.history.some((h) => h.id === runId && h.undoable));
});

test('angring: alt settes tilbake slik det var', async () => {
  const r = await A(`/finans/api/categories/migration/${runId}/undo`, 'POST');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.counts.skipped, 0);
  assert.equal(snapshot(), before);
  assert.equal((await A(`/finans/api/categories/migration/${runId}/undo`, 'POST')).status, 409, 'kan bare angres én gang');
  assert.equal((await I(`/finans/api/categories/migration/${runId}/undo`, 'POST')).status, 403);
  const h = (await A('/finans/api/categories/migrations')).json.items.find((x) => x.id === runId);
  assert.ok(h.undoneAt && !h.undoable);
});

test('angring rører ikke rader brukeren har endret etterpå', async () => {
  const p = (await A('/finans/api/categories/migration')).json;
  const r = await A('/finans/api/categories/migration', 'POST', { confirm: true, previewId: p.previewId });
  assert.equal(r.status, 200, r.text);
  const fritid = catId(OWNER, 'Fritid og hobby'), annet = catId(OWNER, 'Annet');
  const moved = db.prepare("SELECT id FROM fh_transactions WHERE user_id=? AND category_id=? AND merchant='Spotify' LIMIT 1").pluck().get(OWNER, fritid);
  db.prepare('UPDATE fh_transactions SET category_id=? WHERE id=?').run(annet, moved);
  const u = await A(`/finans/api/categories/migration/${r.json.id}/undo`, 'POST');
  assert.equal(u.status, 200);
  assert.equal(u.json.counts.skipped, 1);
  assert.equal(db.prepare('SELECT category_id FROM fh_transactions WHERE id=?').pluck().get(moved), annet);
  assert.ok(catId(OWNER, 'Abonnementer') && catId(OWNER, 'Hjem'));
});
