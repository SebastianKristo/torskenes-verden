// Faste betalinger (Q4): abonnementer, faste utgifter og planlagte trekk i én form fra serveren (GET /finans/api/faste-betalinger),
// og feltene på /recurring som klientene før regnet ut selv (nextDate i Oslo-tid, cycle, cycleName, label).
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-faste-betalinger-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-fbt';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { fasteBetalinger } = await import('../server/finans/faste-betalinger.js');
const { recurringNextDate } = await import('../server/finans/cycles.js');
const { osloDate } = await import('../server/dates/oslo.js');

async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': '198.51.100.7', ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}
const lr = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = (lr.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
assert.ok(cookie, 'innlogget');
const A = (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });

test('recurringNextDate: månedlig, årlig og ukentlig i Oslo-dato, også 31. i korte måneder', () => {
  assert.equal(recurringNextDate({ interval: 'monthly', day: 5 }, '2026-11-11'), '2026-12-05');
  assert.equal(recurringNextDate({ interval: 'monthly', day: 11 }, '2026-11-11'), '2026-11-11', 'trekk i dag er neste trekk');
  assert.equal(recurringNextDate({ interval: 'monthly', day: 31 }, '2026-11-11'), '2026-11-30');
  assert.equal(recurringNextDate({ interval: 'monthly', day: 31 }, '2027-02-01'), '2027-02-28');
  assert.equal(recurringNextDate({ interval: 'yearly', day: 15, month: 3 }, '2026-11-11'), '2027-03-15');
  assert.equal(recurringNextDate({ interval: 'yearly', day: 20, month: 11 }, '2026-11-11'), '2026-11-20');
  assert.equal(recurringNextDate({ interval: 'weekly', day: 1 }, '2026-11-11'), '2026-11-16', 'onsdag → mandag');
});

test('/recurring har nextDate, cycle, cycleName og label fra serveren', async () => {
  const r = await A('/finans/api/recurring', 'POST', { name: 'Husleie', amount: 12000, interval: 'monthly', day: 1 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.cycle, 'monthly');
  assert.equal(r.json.cycleName, 'Månedlig');
  assert.equal(r.json.nextDate, recurringNextDate({ interval: 'monthly', day: 1 }, osloDate()));
  assert.equal(r.json.next, r.json.nextDate, 'det eldre feltet next har samme verdi');
  assert.match(r.json.label, /^Månedlig · neste trekk \d{1,2}\. [a-zæøå.]+$/);
});

test('GET /faste-betalinger: tre filtre, én form for abonnementer og faste utgifter, ingen dobbelttelling', async () => {
  assert.equal((await A('/finans/api/recurring', 'POST', { name: 'Forsikring', amount: 6000, interval: 'yearly', day: 15, month: 3 })).status, 200);
  assert.equal((await A('/finans/api/recurring', 'POST', { name: 'Spotify', amount: 129, interval: 'monthly', day: 6 })).status, 200);
  const s = await A('/finans/api/subscriptions', 'POST', { name: 'Spotify', price: 129, cycle: 'monthly', chargeDay: 6 });
  assert.equal(s.status, 200, s.text);
  const r = await A('/finans/api/faste-betalinger');
  assert.equal(r.status, 200, r.text);
  const b = r.json;
  assert.deepEqual(b.filters.map((f) => [f.id, f.name]), [['abonnementer', 'Abonnementer'], ['faste', 'Faste utgifter'], ['planlagte', 'Planlagte trekk']]);
  const keys = ['key', 'kind', 'id', 'name', 'amount', 'monthly', 'yearly', 'cycle', 'cycleName', 'perLabel', 'nextDate', 'nextLabel', 'daysLeft', 'label', 'active', 'source', 'href', 'duplicateOf'];
  for (const it of b.items) for (const k of keys) assert.ok(k in it, `${it.key} mangler ${k}`);
  const sub = b.items.find((x) => x.kind === 'abonnement' && x.name === 'Spotify');
  assert.equal(sub.monthly, 129);
  assert.equal(sub.href, `#/fast/abonnementer/${sub.id}`);
  const dup = b.items.find((x) => x.kind === 'fast' && x.name === 'Spotify');
  assert.equal(dup.duplicateOf, sub.key, 'Spotify som fast utgift peker på abonnementet');
  const fors = b.items.find((x) => x.name === 'Forsikring');
  assert.equal(fors.monthly, 500);
  assert.equal(fors.cycleName, 'Årlig');
  // Summen per måned: Husleie 12 000 + Forsikring 500 + Spotify 129 (bare én gang).
  assert.equal(b.monthly, 12629);
  assert.equal(b.filters[0].monthly, 129);
  assert.equal(b.filters[1].monthly, 12500);
  assert.equal(b.yearly, 12629 * 12);
  // Planlagte trekk: negative beløp med dato og etikett, samme tjeneste bare én gang per dato.
  assert.ok(b.planned.items.length > 0);
  for (const p of b.planned.items) { assert.ok(p.amount < 0); assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(['abonnement', 'fast', 'funnet'].includes(p.kind)); }
  const dates = b.planned.items.filter((p) => /spotify/i.test(p.name)).map((p) => p.date);
  assert.equal(new Set(dates).size, dates.length);
  assert.equal(b.filters[2].count, b.planned.items.length);
});

test('fasteBetalinger: trekkdager i måneden og daysLeft regnes fra «i dag» (Oslo)', () => {
  const out = fasteBetalinger('owner', { today: '2026-11-11' });
  const husleie = out.items.find((x) => x.name === 'Husleie');
  assert.equal(husleie.nextDate, '2026-12-01');
  assert.equal(husleie.daysLeft, 20);
  assert.equal(out.month, '2026-11');
  const days = Object.fromEntries(out.chargeDays.map((d) => [d.day, d.names]));
  assert.ok(days[1]?.includes('Husleie'));
  assert.ok(days[6]?.includes('Spotify'));
  assert.ok(!out.chargeDays.some((d) => d.names.filter((n) => n === 'Spotify').length > 1), 'Spotify telles én gang');
});

test('uten innlogging: 401', async () => {
  assert.equal((await req('/finans/api/faste-betalinger')).status, 401);
});
