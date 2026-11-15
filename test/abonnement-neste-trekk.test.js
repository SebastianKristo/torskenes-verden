// Fase 5 (D-android §6): «Neste trekk …» i abonnementsskjemaet regnes av serveren (GET /finans/api/subscriptions/next-charge),
// ikke av appene (Android Subs14.kt nextChargeText). Datoene følger shared/testvektorer/abonnement.json (testvektorer.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.TZ = 'Europe/Oslo';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-neste-trekk-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-nt1';
process.env.NODE_ENV = 'test';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { nextChargePreview, NO_CHARGE_DAY } = await import('../server/finans/cycles.js');
const { default: finansApi } = await import('../server/finans/routes.js');

test('nextChargePreview: dato og tekst som skjemaet viser', () => {
  // Månedlig: denne måneden hvis dagen ikke har passert, ellers neste. Dagen glir ikke (31 → 30. november).
  assert.deepEqual(nextChargePreview({ cycle: 'monthly', day: 20 }, '2026-11-16'), { cycle: 'monthly', nextDate: '2026-11-20', label: 'Neste trekk 20. november, deretter hver måned' });
  assert.equal(nextChargePreview({ cycle: 'monthly', day: 10 }, '2026-11-16').nextDate, '2026-12-10');
  assert.equal(nextChargePreview({ cycle: 'monthly', day: 31 }, '2026-11-16').nextDate, '2026-11-30');
  assert.equal(nextChargePreview({ cycle: 'monthly', day: 16 }, '2026-11-16').nextDate, '2026-11-16', 'trekk i dag er neste trekk');
  // Årlig og hvert 2. år: neste gang datoen kommer.
  assert.deepEqual(nextChargePreview({ cycle: 'yearly', day: 21, month: 10 }, '2026-11-16'), { cycle: 'yearly', nextDate: '2027-10-21', label: 'Neste trekk 21. oktober, deretter hvert år' });
  assert.equal(nextChargePreview({ cycle: 'yearly', day: 1, month: 12 }, '2026-11-16').nextDate, '2026-12-01');
  assert.equal(nextChargePreview({ cycle: 'biennial', day: 29, month: 2 }, '2026-11-16').nextDate, '2027-02-28');
  assert.match(nextChargePreview({ cycle: 'biennial', day: 5, month: 3 }, '2026-11-16').label, /, deretter hvert 2\. år$/);
  // Tekst fra klienten (norske ord) og tall som tekst (query-parametre).
  assert.equal(nextChargePreview({ cycle: 'årlig', day: '21', month: '10' }, '2026-11-16').nextDate, '2027-10-21');
  // Uten trekkdag: ingen dato.
  assert.deepEqual(nextChargePreview({ cycle: 'monthly' }, '2026-11-16'), { cycle: 'monthly', nextDate: null, label: NO_CHARGE_DAY });
  assert.equal(nextChargePreview({ cycle: 'monthly', day: 0 }, '2026-11-16').nextDate, null);
  // Ukesykluser trenger en startdato.
  assert.equal(nextChargePreview({ cycle: 'weekly', day: 3 }, '2026-11-16').nextDate, null);
  assert.equal(nextChargePreview({ cycle: 'weekly', startDate: '2026-11-02' }, '2026-11-16').nextDate, '2026-11-16');
});

test('GET /finans/api/subscriptions/next-charge krever innlogging og gir {cycle, nextDate, label}', async () => {
  assert.equal((await finansApi.request('/subscriptions/next-charge?cycle=monthly&day=5')).status, 401);
  const login = await finansApi.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'neste-trekk' }) });
  const { token } = await login.json();
  const r = await finansApi.request('/subscriptions/next-charge?cycle=yearly&day=21&month=10', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.cycle, 'yearly');
  assert.match(b.nextDate, /^\d{4}-10-21$/);
  assert.equal(b.label, `Neste trekk 21. oktober, deretter hvert år`);
  const tom = await (await finansApi.request('/subscriptions/next-charge?cycle=monthly', { headers: { authorization: `Bearer ${token}` } })).json();
  assert.deepEqual(tom, { cycle: 'monthly', nextDate: null, label: NO_CHARGE_DAY });
});
