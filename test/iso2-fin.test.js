// ISO2 (ISO-FIN): FinansHub-regnskapet er per bruker, uansett rolle. To admins (sebastian = OWNER, rune) og én vanlig
// bruker (kari) ser bare sine egne data. Boliger kan fortsatt deles. Eldre data (fra før user_id) tilhører sebastian, uendret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const DIR = mkdtempSync(join(tmpdir(), 'hl-iso2fin-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
delete process.env.MOCK_DATA;
delete process.env.GEMINI_API_KEY;
delete process.env.IMAP_HOST;

// Et regnskap slik det så ut før ISO2: tabellene uten user_id og kategorinavn som er UNIQUE for hele databasen.
mkdirSync(join(DIR, 'uploads'), { recursive: true });
{
  const old = new Database(join(DIR, 'homelab.db'));
  old.exec(`
CREATE TABLE fh_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, bank TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'checking', last4 TEXT,
  opening_balance INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE fh_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'expense', sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE fh_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER REFERENCES fh_accounts(id) ON DELETE SET NULL, date TEXT NOT NULL, amount INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '', merchant TEXT, category_id INTEGER REFERENCES fh_categories(id) ON DELETE SET NULL, note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual', external_id TEXT UNIQUE, created INTEGER NOT NULL);
CREATE TABLE fh_finn (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, item TEXT NOT NULL, counterpart TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, amount INTEGER NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]', source TEXT, tx_id INTEGER REFERENCES fh_transactions(id) ON DELETE SET NULL, created INTEGER NOT NULL, UNIQUE(source));
INSERT INTO fh_categories(id,name,color,kind,sort) VALUES (1,'Mat og dagligvarer','#FF9F5A','expense',0),(2,'Gammel kategori','#123456','expense',1);
INSERT INTO fh_accounts(id,name,bank,type) VALUES (7,'Sebastians brukskonto','DNB','checking');
INSERT INTO fh_transactions(id,account_id,date,amount,description,merchant,category_id,created) VALUES (41,7,'2026-09-03',-12345,'SEBASTIAN GAMMEL REMA','Gammel Rema',1,1);
INSERT INTO fh_finn(id,role,item,date,amount,source,created) VALUES (5,'sold','Gammel sykkel','2026-08-01',150000,'gml-1',1);`);
  old.close();
}

const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const headers = { cookie };
  if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  const r = await app.request(path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ikke JSON */ }
  return { status: r.status, body: json, text };
};

const S = client(await login('sebastian', 'testpassord1'));
for (const [username, role, name] of [['rune', 'admin', 'Rune'], ['kari', 'bruker', 'Kari']]) {
  const r = await S('/api/users', 'POST', { username, password: `${username}Passord123`, role, name });
  assert.equal(r.status, 200, r.text);
}
const Rn = client(await login('rune', 'runePassord123'));
const K = client(await login('kari', 'kariPassord123'));
const ids = { seb: (await S('/finans/api/me')).body.id, rune: (await Rn('/finans/api/me')).body.id, kari: (await K('/finans/api/me')).body.id };
const USERS = { seb: S, rune: Rn, kari: K };

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const file = (name) => { const fd = new FormData(); fd.append('file', new File([jpeg], name, { type: 'image/jpeg' })); return fd; };
const settle = async () => { for (let i = 0; i < 100; i++) { if (!db.prepare("SELECT 1 FROM fh_receipts WHERE status IN ('pending','processing')").get()) return; await new Promise((r) => setTimeout(r, 50)); } };

// Hver bruker lager et eget regnskap med en unik markør.
const made = {};
for (const [who, C] of Object.entries(USERS)) {
  const tag = `ZQX${who.toUpperCase()}`;
  const acc = (await C('/finans/api/accounts', 'POST', { name: `Konto ${tag}`, type: 'checking', last4: '1111' })).body.id;
  const tx = await C('/finans/api/transactions', 'POST', { date: '2026-10-10', amount: -321, type: 'expense', description: `${tag} butikk`, accountId: acc });
  assert.equal(tx.status, 200, tx.text);
  const cat = await C('/finans/api/categories', 'POST', { name: `Kategori ${tag}` });
  assert.equal(cat.status, 200, cat.text);
  const sub = await C('/finans/api/subscriptions', 'POST', { name: `Abo ${tag}`, price: 99, cycle: 'monthly' });
  assert.equal(sub.status, 200, sub.text);
  const finn = await C('/finans/api/finn', 'POST', { role: 'bought', item: `Finn ${tag}`, amount: 500, counterpart: 'selger X' });
  assert.equal(finn.status, 200, finn.text);
  const rc = await C('/finans/api/receipts', 'POST', file(`${tag}.jpg`));
  assert.equal(rc.status, 200, rc.text);
  await C('/finans/api/settings', 'PUT', { monthStart: { seb: 5, rune: 10, kari: 20 }[who], name: `Navn ${tag}` });
  await C('/finans/api/search/ai', 'POST', { q: `${tag} butikk`, mode: 'plain' });
  made[who] = { tag, acc, tx: tx.body.id, cat: cat.body.id, sub: sub.body.id, finn: finn.body.id, rc: rc.body.id };
}
await settle();

test('eldre data tilhører sebastian (OWNER) og er uendret; kategorinavn er nå unike per bruker', async () => {
  const t = db.prepare('SELECT * FROM fh_transactions WHERE id=41').get();
  assert.equal(t.user_id, 'owner');
  assert.equal(t.amount, -12345);
  assert.equal(t.category_id, 1);
  assert.equal(t.account_id, 7);
  assert.equal(db.prepare('SELECT user_id FROM fh_categories WHERE id=2').get().user_id, 'owner');
  assert.equal(db.prepare('SELECT user_id FROM fh_accounts WHERE id=7').get().user_id, 'owner');
  assert.equal(db.prepare('SELECT user_id FROM fh_finn WHERE id=5').get().user_id, 'owner');
  assert.equal(ids.seb, 'owner');
  const tx = (await S('/finans/api/transactions')).body.items.find((x) => x.id === 41);
  assert.equal(tx.amount, -123.45);
  assert.equal(tx.category, 'Mat og dagligvarer');
  assert.equal(tx.account, 'Sebastians brukskonto');
  assert.ok((await S('/finans/api/finn')).body.items.some((f) => f.id === 5));
  // Rune og Kari har fått egne standardkategorier med samme navn.
  for (const C of [Rn, K]) {
    const b = (await C('/finans/api/bootstrap')).body;
    assert.equal(b.restricted, false);
    assert.ok(b.categories.some((x) => x.name === 'Mat og dagligvarer' && x.id !== 1));
    assert.ok(!b.categories.some((x) => x.id === 1 || x.id === 2));
    assert.ok(!b.accounts.some((a) => a.id === 7));
  }
  // Migrasjonen er idempotent: tabellen er bygd om én gang, og radene er de samme.
  assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name='fh_categories'").pluck().get(), /UNIQUE\(user_id, name\)/);
});

test('ingen ser andres kontoer, transaksjoner, kvitteringer, abonnementer, Finn, søk, AI-logg eller innstillinger', async () => {
  for (const [who, C] of Object.entries(USERS)) {
    const mine = made[who];
    const others = Object.entries(made).filter(([w]) => w !== who).map(([, m]) => m);
    const lists = [
      (await C('/finans/api/bootstrap')).text, (await C('/finans/api/transactions')).text, (await C('/finans/api/summary')).text,
      (await C('/finans/api/receipts')).text, (await C('/finans/api/receipts/jobs')).text, (await C('/finans/api/subscriptions')).text,
      (await C('/finans/api/finn')).text, (await C('/finans/api/search?q=butikk')).text, (await C('/finans/api/search/history')).text,
      (await C('/finans/api/reports')).text, (await C('/finans/api/export.json')).text, (await C('/finans/api/settings')).text,
    ].join('\n');
    assert.ok(lists.includes(mine.tag), `${who} ser sine egne data`);
    for (const o of others) assert.ok(!lists.includes(o.tag), `${who} ser ikke ${o.tag}`);
    assert.ok(!lists.includes('SEBASTIAN GAMMEL') || who === 'seb');
    for (const o of others) {
      for (const p of [`/finans/api/transactions/${o.tx}`, `/finans/api/transactions/${o.tx}/original`, `/finans/api/receipts/${o.rc}`, `/finans/api/receipts/${o.rc}/file`, `/finans/api/finn/${o.finn}`, `/finans/api/subscriptions/${o.sub}/logo`]) {
        assert.equal((await C(p)).status, 404, `${who} → ${p}`);
      }
      assert.equal((await C(`/finans/api/transactions/${o.tx}`, 'PATCH', { description: 'kapret' })).status, 404);
      assert.equal((await C(`/finans/api/accounts/${o.acc}`, 'PATCH', { name: 'kapret' })).status, 404);
      assert.equal((await C(`/finans/api/categories/${o.cat}`, 'PATCH', { name: 'kapret' })).status, 404);
      assert.equal((await C(`/finans/api/subscriptions/${o.sub}`, 'PATCH', { name: 'kapret' })).status, 404);
      await C(`/finans/api/transactions/${o.tx}`, 'DELETE');
      await C(`/finans/api/accounts/${o.acc}`, 'DELETE');
      await C(`/finans/api/subscriptions/${o.sub}`, 'DELETE');
      await C(`/finans/api/finn/${o.finn}`, 'DELETE');
      await C(`/finans/api/receipts/${o.rc}`, 'DELETE');
      // Kan ikke bruke andres konto eller kategori i egne poster.
      assert.equal((await C('/finans/api/transactions', 'POST', { date: '2026-10-11', amount: -1, description: 'x', accountId: o.acc })).status, 400);
      assert.equal((await C('/finans/api/rules', 'POST', { pattern: 'X*', categoryId: o.cat })).status, 400);
    }
    // Innstillinger: egne verdier.
    const st = (await C('/finans/api/settings')).body;
    assert.equal(st.user.monthStart, { seb: 5, rune: 10, kari: 20 }[who]);
    assert.equal(st.name, `Navn ${mine.tag}`);
    // AI-loggen: bare egne kall.
    const n = db.prepare('SELECT count(*) FROM ai_log WHERE user_id=?').pluck().get(ids[who]);
    assert.equal((await C('/finans/api/ai/log?limit=500')).body.items.length, n);
  }
  // Ingenting ble slettet eller endret av de andre.
  for (const m of Object.values(made)) {
    assert.ok(db.prepare('SELECT 1 FROM fh_transactions WHERE id=? AND description LIKE ?').get(m.tx, `${m.tag}%`));
    assert.ok(db.prepare('SELECT 1 FROM fh_accounts WHERE id=?').get(m.acc));
    assert.ok(db.prepare('SELECT 1 FROM fh_subscriptions WHERE id=?').get(m.sub));
    assert.ok(db.prepare('SELECT 1 FROM fh_finn WHERE id=?').get(m.finn));
    assert.ok(db.prepare('SELECT 1 FROM fh_receipts WHERE id=?').get(m.rc));
  }
  assert.ok(db.prepare('SELECT count(*) FROM ai_log WHERE user_id=?').pluck().get('owner') >= 1, 'kvitteringsjobben logger hos eieren av kvitteringen');
});

test('serveroppsettet: admin kan endre, vanlig bruker ser det uten adresser og kan ikke endre', async () => {
  const k = (await K('/finans/api/settings')).body;
  assert.equal(k.canEditServer, false);
  assert.equal(k.ollamaUrl, undefined);
  assert.equal(k.server.ollamaUrl, undefined);
  assert.ok(k.server.provider);
  assert.equal((await K('/finans/api/settings', 'PUT', { provider: 'groq' })).status, 403);
  assert.equal((await K('/finans/api/settings', 'PUT', { geminiKey: 'AIzaX' })).status, 403);
  assert.equal((await K('/finans/api/ai/gemini-keys')).status, 403);
  const r = await Rn('/finans/api/settings', 'PUT', { aiTimeouts: { gemini: 30 } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.canEditServer, true);
  // Felles for alle.
  assert.equal((await S('/finans/api/settings')).body.server.aiTimeouts.gemini, 30);
  assert.equal((await K('/finans/api/settings')).body.server.aiTimeouts.gemini, 30);
  // Brukerens egne valg påvirker ikke de andre.
  assert.equal((await S('/finans/api/settings')).body.monthStart, 5);
});

test('alle roller får eget fullt regnskap; app-token for vanlig bruker har finance:write', async () => {
  const r = await app.request('/finans/api/auth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'kari', password: 'kariPassord123', device: 'Pixel' }) });
  const t = await r.json();
  assert.ok(t.scopes.includes('finance:write'));
  const H = { authorization: `Bearer ${t.token}`, 'content-type': 'application/json' };
  const tx = await app.request('/finans/api/transactions', { method: 'POST', headers: H, body: JSON.stringify({ date: '2026-10-12', amount: -50, type: 'expense', description: 'Kari via app' }) });
  assert.equal(tx.status, 200);
  assert.equal(db.prepare("SELECT user_id FROM fh_transactions WHERE description='Kari via app'").pluck().get(), ids.kari);
});

test('personlig e-post og Trading 212: kari sitt oppsett påvirker ikke sebastian', async () => {
  const before = (await S('/finans/api/mail/config')).body.config;
  const k = await K('/finans/api/mail/config', 'PUT', { imapHost: 'imap.kari.no', imapUser: 'kari@kari.no', pass: 'hemmelig' });
  assert.equal(k.status, 200, k.text);
  assert.equal(k.body.config.host, 'imap.kari.no');
  assert.equal(k.body.config.passSet, true);
  assert.deepEqual((await S('/finans/api/mail/config')).body.config, before);
  assert.notEqual((await Rn('/finans/api/mail/config')).body.config.host, 'imap.kari.no');
  assert.ok(!k.text.includes('hemmelig'));
  await K('/finans/api/stocks/config', 'PUT', { key: 'KARIKEY123', secret: 'KARISECRET', env: 'demo' });
  assert.equal((await K('/finans/api/stocks')).body.configured, true);
  assert.equal((await S('/finans/api/stocks')).body.configured, false);
});

test('Boliger kan fortsatt deles: medlemmer ser posten og kvitteringen, andre ikke; bokføring går til eget regnskap', async () => {
  const f = (await S('/finans/api/folders', 'POST', { name: 'Delt hytte', type: 'Hytte' })).body;
  assert.equal((await S(`/finans/api/folders/${f.id}/members`, 'POST', { userId: ids.kari, role: 'editor' })).status, 200);
  const up = await K(`/finans/api/folders/${f.id}/receipts`, 'POST', file('hytte.jpg'));
  assert.equal(up.status, 200, up.text);
  const rid = up.body.id;
  await settle();
  // Kvitteringen tilhører Kari (eget regnskap, egen gjennomgang).
  assert.equal(db.prepare('SELECT user_id FROM fh_receipts WHERE id=?').pluck().get(rid), ids.kari);
  assert.ok((await K('/finans/api/receipts')).body.some((r) => r.id === rid));
  // Sebastian (medlem) ser posten og kvitteringen i boligen, men den er ikke i hans regnskap.
  const full = (await S(`/finans/api/folders/${f.id}`)).body;
  assert.ok(full.receipts.some((r) => r.receiptId === rid));
  assert.equal((await S(`/finans/api/folders/${f.id}/receipts/${rid}/file`)).status, 200);
  assert.equal((await S(`/finans/api/receipts/${rid}`)).status, 200);
  assert.ok(!(await S('/finans/api/receipts')).body.some((r) => r.id === rid));
  assert.equal((await S(`/finans/api/receipts/${rid}/reject`, 'POST')).status, 200);
  assert.notEqual(db.prepare('SELECT status FROM fh_receipts WHERE id=?').pluck().get(rid), 'rejected', 'medlemmer kan se, ikke endre');
  // Rune er ikke medlem.
  assert.equal((await Rn(`/finans/api/folders/${f.id}`)).status, 404);
  assert.equal((await Rn(`/finans/api/receipts/${rid}`)).status, 404);
  assert.equal((await Rn(`/finans/api/folders/${f.id}/receipts/${rid}/file`)).status, 404);
  assert.ok(!(await Rn('/finans/api/folders')).body.some((x) => x.id === f.id));
  // Kari bokfører i sitt eget regnskap.
  await K(`/finans/api/receipts/${rid}`, 'PATCH', { merchant: 'Hyttebutikken', total: 250, date: '2026-10-13' });
  const b = await K(`/finans/api/receipts/${rid}/book`, 'POST');
  assert.equal(b.status, 200, b.text);
  const txId = db.prepare('SELECT transaction_id FROM fh_receipts WHERE id=?').pluck().get(rid);
  assert.equal(db.prepare('SELECT user_id FROM fh_transactions WHERE id=?').pluck().get(txId), ids.kari);
  assert.ok(!(await S('/finans/api/transactions')).body.items.some((t) => t.id === txId));
  // Kari kan legge sin egen transaksjon i boligen, men ikke Sebastians.
  assert.equal((await K(`/finans/api/folders/${f.id}/entries`, 'POST', { txId: made.seb.tx })).status, 404);
  assert.equal((await K(`/finans/api/folders/${f.id}/entries`, 'POST', { txId: made.kari.tx })).status, 200);
});

test('backup: egen eksport og gjenoppretting; hele databasen bare for hovedadmin', async () => {
  const ex = (await Rn('/finans/api/export.json')).body;
  for (const [t, rows] of Object.entries(ex.tables)) for (const r of rows) if ('user_id' in r && t !== 'fh_folder_members') assert.equal(r.user_id, ids.rune, t);
  assert.equal((await Rn('/finans/api/backup/run', 'POST')).status, 403);
  assert.equal((await Rn('/finans/api/backup/smb', 'PUT', { share: '//nas/x' })).status, 403);
  assert.equal((await Rn('/finans/api/backup')).body.canSmb, false);
  // En dump med Sebastians ID-er overskriver ingenting hos ham.
  const fd = new FormData();
  fd.append('file', new File([JSON.stringify({ format: 'finanshub-backup', tables: { fh_transactions: [{ id: 41, date: '2026-01-01', amount: -1, description: 'KAPRET', created: 1 }] } })], 'x.json', { type: 'application/json' }));
  const st = await Rn('/finans/api/backup/stage', 'POST', fd);
  assert.equal(st.status, 200, st.text);
  const rs = await Rn('/finans/api/backup/restore', 'POST', { stageId: st.body.stageId });
  assert.equal(rs.status, 200, rs.text);
  const t = db.prepare('SELECT * FROM fh_transactions WHERE id=41').get();
  assert.equal(t.description, 'SEBASTIAN GAMMEL REMA');
  assert.equal(t.user_id, 'owner');
});
