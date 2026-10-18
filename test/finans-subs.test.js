import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-subs-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { db } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');
const subs = await import('../server/finans/subs.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const J = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: J, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
await call('/settings', 'PUT', { ollamaUrl: 'http://127.0.0.1:9', provider: 'ollama', fallback: false });

const now = new Date(), y = now.getFullYear(), m = now.getMonth();
const day = (monthsBack, d) => new Date(y, m - monthsBack, d).toLocaleDateString('sv-SE');
const insTx = db.prepare('INSERT INTO fh_transactions(date, amount, description, merchant, created,user_id) VALUES(?,?,?,?,?,\'owner\')');
const tx = (date, kr, name) => insTx.run(date, Math.round(kr * 100), name, name, Date.now());

test('trekk per år: månedlig 12 ganger, årlig én gang, hvert 2. år bare i trekkåret', () => {
  assert.equal(subs.chargesInYear({ cycle: 'monthly', next_date: '2026-10-21' }, 2026).length, 12);
  assert.deepEqual(subs.chargesInYear({ cycle: 'yearly', next_date: '2027-03-16' }, 2026), ['2026-03-16']);
  assert.deepEqual(subs.chargesInYear({ cycle: 'biennial', next_date: '2027-12-17' }, 2027), ['2027-12-17']);
  assert.deepEqual(subs.chargesInYear({ cycle: 'biennial', next_date: '2027-12-17' }, 2026), []);
  assert.deepEqual(subs.chargesInYear({ cycle: 'biennial', next_date: '2027-12-17' }, 2025), ['2025-12-17']);
  // 31. i en måned med 30 dager: siste dag i måneden.
  assert.ok(subs.chargesInYear({ cycle: 'monthly', next_date: '2026-01-31' }, 2026).includes('2026-04-30'));
});

test('månedsgraf per kategori, uten oppsagte', () => {
  const list = [{ id: 1, name: 'Netflix', price: 14900, cycle: 'monthly', next_date: '2026-10-03', active: 1 },
    { id: 2, name: 'NordVPN', price: 120000, cycle: 'biennial', next_date: '2026-06-01', active: 1 },
    { id: 3, name: 'Viaplay', price: 44900, cycle: 'monthly', next_date: '2026-10-14', active: 0 }];
  const bm = subs.byMonth(list, 2026);
  assert.equal(bm.length, 12);
  assert.equal(bm[0].month, '2026-01');
  assert.equal(bm[0].total, 149);
  assert.equal(bm[5].total, 149 + 1200);
  assert.equal(bm[5].byCategory.Underholdning, 149);
  assert.equal(bm[5].byCategory.Produktivitet, 1200);
  assert.equal(bm.reduce((a, x) => a + x.total, 0), 149 * 12 + 1200);
});

test('status, helse og sparing', () => {
  const list = [{ id: 1, name: 'A', price: 10000, cycle: 'monthly', next_date: '2026-11-01', active: 1, low_use: 1, usage_note: 'Ikke åpnet på 30 d' },
    { id: 2, name: 'B', price: 12000, prev_price: 10000, price_changed: new Date().toLocaleDateString('sv-SE'), cycle: 'monthly', next_date: '2026-11-02', active: 1 },
    { id: 3, name: 'C', price: 5000, cycle: 'monthly', next_date: '2026-11-03', active: 1 }];
  assert.deepEqual(list.map(subs.statusOf), ['low_use', 'price_up', 'active']);
  assert.equal(subs.statusOf({ ...list[1], price_changed: '2020-01-01' }), 'active', 'gammel prisøkning vises ikke lenger');
  const h = subs.health(list);
  assert.ok(h.score > 0 && h.score < 100);
  assert.match(h.text, /1 abonnement brukes lite, og 1 har økt prisen/);
  const s = subs.savings(list);
  assert.equal(s.suggestions.length, 2);
  assert.equal(s.monthly, 100 + 20);
  assert.equal(subs.health([{ ...list[2] }]).score, 100);
});

test('API: nytt abonnement med trekkdag, kategori og hvert 2. år', async () => {
  const r = await call('/subscriptions', 'POST', { name: 'Proton Unlimited', plan: '2 år', price: 2328, cycle: 'biennial', chargeDay: 12, category: 'Lagring og sky' });
  assert.equal(r.status, 200);
  assert.equal(r.body.cycle, 'biennial');
  assert.equal(r.body.chargeDay, 12);
  assert.equal(r.body.category, 'Lagring og sky');
  assert.equal(r.body.nextDate.slice(8, 10), '12');
  assert.equal(r.body.monthly, 97);
  const p = await call(`/subscriptions/${r.body.id}`, 'PATCH', { category: 'Produktivitet', chargeDay: 3 });
  assert.equal(p.body.category, 'Produktivitet');
  assert.equal(p.body.chargeDay, 3);
  // Ukjent kategori: velges automatisk fra navnet.
  const q = await call('/subscriptions', 'POST', { name: 'Spotify', price: 239, category: 'Tull' });
  assert.equal(q.body.category, 'Underholdning');
  assert.equal(q.body.status, 'active');
});

test('API: «Pris økt» fra de to siste banktrekkene', async () => {
  const s = await call('/subscriptions', 'POST', { name: 'Netflix', price: 149, cycle: 'monthly', chargeDay: 3 });
  tx(day(2, 3), -149, 'NETFLIX.COM');
  tx(day(1, 3), -179, 'NETFLIX.COM');
  const g = await call('/subscriptions');
  const n = g.body.items.find((x) => x.id === s.body.id);
  assert.equal(n.status, 'price_up');
  assert.equal(n.price, 179);
  assert.equal(n.prevPrice, 149);
  assert.ok(g.body.savings.suggestions.some((x) => x.id === n.id && x.kind === 'price' && x.amount === 30));
  // En økning for hånd gir også «Pris økt».
  const sp = g.body.items.find((x) => x.name === 'Spotify');
  const p = await call(`/subscriptions/${sp.id}`, 'PATCH', { price: 259 });
  assert.equal(p.body.status, 'price_up');
  assert.equal(p.body.prevPrice, 239);
});

test('API: oversikt har månedsgraf, helse, sparing, kommende trekk og trekk denne måneden', async () => {
  const g = (await call('/subscriptions')).body;
  assert.deepEqual(g.categories.slice(0, 5), ['Underholdning', 'Produktivitet', 'Lagring og sky', 'Helse og trening', 'Transport']);
  assert.equal(g.byMonth.length, 12);
  assert.ok(g.byMonth.every((x) => typeof x.total === 'number' && x.byCategory));
  assert.ok(g.health.score >= 0 && g.health.score <= 100);
  assert.ok(Array.isArray(g.savings.suggestions));
  assert.ok(Array.isArray(g.upcoming) && g.upcoming.every((x) => x.id && x.date && typeof x.amount === 'number'));
  assert.ok(g.thisMonth.every((x) => x.date.startsWith(g.month)));
  for (const it of g.items) assert.ok(['active', 'low_use', 'price_up', 'cancelled'].includes(it.status) && it.category && 'chargeDay' in it);
  const other = (await call('/subscriptions?month=2026-02')).body;
  assert.equal(other.month, '2026-02');
});

test('API: kandidater fra transaksjoner, og legg til fra kandidat', async () => {
  for (let i = 1; i <= 4; i++) tx(day(i, 9), -129, 'DISNEY PLUS');
  for (let i = 1; i <= 4; i++) tx(day(i, 12), -(300 + i * 140), 'REMA 1000'); // dagligvarer: ulike beløp
  for (let i = 1; i <= 2; i++) tx(day(i, 20), -99, 'HBO MAX'); // bare to ganger
  const c = (await call('/subscriptions/candidates')).body;
  const d = c.find((x) => /disney/i.test(x.merchant));
  assert.ok(d, 'Disney+ er en kandidat');
  assert.equal(d.amount, 129);
  assert.equal(d.cycle, 'monthly');
  assert.equal(d.count, 4);
  assert.ok(d.lastDate && 'domain' in d);
  assert.ok(!c.some((x) => /rema|hbo|netflix|spotify/i.test(x.merchant)), 'varierende beløp, færre enn 3 trekk og registrerte er ikke med');
  const r = await call('/subscriptions', 'POST', { fromCandidate: d });
  assert.equal(r.status, 200);
  assert.equal(r.body.price, 129);
  assert.equal(r.body.chargeDay, 9);
  assert.ok(r.body.nextDate >= new Date().toLocaleDateString('sv-SE'));
  assert.ok(!(await call('/subscriptions/candidates')).body.some((x) => /disney/i.test(x.merchant)));
});

test('API: «Fra kvittering» godtar e-post (.eml)', async () => {
  const eml = 'From: Disney+ <noreply@disneyplus.com>\r\nTo: meg@example.com\r\nSubject: Kvittering for Disney+\r\nDate: Fri, 16 Oct 2026 10:00:00 +0200\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nTakk! Du har betalt 129 kr for Disney+ Standard.\r\n';
  const fd = new FormData();
  fd.append('file', new File([eml], 'kvittering.eml', { type: 'message/rfc822' }));
  const r = await api.request('/subscriptions/receipts', { method: 'POST', headers: { authorization: J.authorization }, body: fd });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.jobs.length, 1);
  const row = db.prepare('SELECT mime, target, name FROM fh_receipts WHERE id=?').get(b.jobs[0].id);
  assert.equal(row.mime, 'text/plain');
  assert.equal(row.target, 'sub');
  assert.equal(row.name, 'Kvittering for Disney+');
  // Andre filtyper avvises fortsatt.
  const bad = new FormData(); bad.append('file', new File(['x'], 'a.zip', { type: 'application/zip' }));
  assert.equal((await api.request('/subscriptions/receipts', { method: 'POST', headers: { authorization: J.authorization }, body: bad })).status, 400);
});
