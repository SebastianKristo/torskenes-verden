// F 12 / L10: personvernmodus (skjulte beløp) i det serveren sender selv: push-varsler (kø, sanntid, Web Push, ntfy) og
// widgetdata. Appene skjuler beløp de formaterer selv, men tekster serveren har laget («149 kr/mnd», «Trekk i morgen: 249 kr»)
// gikk forbi. Valget «hideAmounts» ligger i /api/me/notify (per bruker); widgetene godtar også ?hideAmounts=1 fra en enhet der
// «Skjul beløp» er på.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-skjul-belop-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-belop';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const wp = await import('../server/webpush.js');
const nt = await import('../server/notify.js');
const { maskAmounts } = await import('../server/skjul-belop.js');
const { db } = await import('../server/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
const me = (await A('/api/me')).body;
const SEB = me?.id ?? me?.user?.id ?? 'owner';
await A('/api/me/notify', 'PUT', { quietOn: false });

test('maskAmounts: beløp i kroner blir prikker, alt annet står', () => {
  const cases = [
    ['Netflix koster 149 kr/mnd etter prøven', 'Netflix koster ••• kr/mnd etter prøven'],
    ['deretter 1 234,50 kr', 'deretter ••• kr'],
    ['Trekk i morgen: kr 2 499', 'Trekk i morgen: kr •••'],
    ['Saldo −1 250 kr', 'Saldo ••• kr'],
    ['NOK 99,00 trekkes', 'NOK ••• trekkes'],
    ['Du har brukt 3400 kroner', 'Du har brukt ••• kroner'],
    ['Pris 349,- per måned', 'Pris •••,- per måned'],
    ['149kr', '•••kr'],
  ];
  for (const [inn, ut] of cases) assert.equal(maskAmounts(inn), ut, inn);
  for (const s of ['Prøven slutter om 3 dager', 'Tannlege kl. 17:30', 'Nordlys i kveld · Kp 5,3', 'Pakken er på vei (2 av 4)', 'Kristiansand', '', null]) assert.equal(maskAmounts(s), s ?? '', String(s));
});

test('/api/me/notify: hideAmounts er av som standard, kan slås på og må være true/false', async () => {
  assert.equal((await A('/api/me/notify')).body.hideAmounts, false);
  assert.equal((await A('/api/me/notify', 'PUT', { hideAmounts: 'ja' })).status, 400);
  const r = await A('/api/me/notify', 'PUT', { hideAmounts: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.hideAmounts, true);
  assert.equal((await A('/api/me/notify')).body.hideAmounts, true);
  await A('/api/me/notify', 'PUT', { hideAmounts: false });
});

test('notifyUser: med skjulte beløp får køen, Web Push og ntfy prikker i stedet for beløpet', async (t) => {
  const e = createECDH('prime256v1'); e.generateKeys();
  const keys = { p256dh: wp.b64u(e.getPublicKey()), auth: wp.b64u(randomBytes(16)) }, uaPrivate = wp.b64u(e.getPrivateKey());
  const endpoint = 'https://fcm.googleapis.com/fcm/send/skjul-belop';
  db.prepare('INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth, ua, created) VALUES(?,?,?,?,?,?)').run(SEB, endpoint, keys.p256dh, keys.auth, 'test', Date.now());
  const sent = [];
  wp._setPushFetch(async (url, init) => { sent.push(JSON.parse(wp.decryptPayload(Buffer.from(init.body), { uaPrivate, auth: keys.auth }).toString())); return new Response('', { status: 201 }); });
  const hooked = [];
  nt.setNotifyHook51((u, item) => { hooked.push(item); });
  t.after(() => { wp._setPushFetch(null); nt.setNotifyHook51(null); db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint); });

  // Av: beløpet står.
  await nt.notifyUser(SEB, { title: 'Prøveperioden slutter i morgen', body: 'Deretter 149 kr/mnd', category: 'abonnement' });
  assert.equal(nt.pendingFor(SEB).at(-1).body, 'Deretter 149 kr/mnd');
  // På: kø, push og ntfy skjuler beløpet, også i tittelen.
  await A('/api/me/notify', 'PUT', { hideAmounts: true });
  const r = await nt.notifyUser(SEB, { title: 'Trekk i morgen: 249 kr', body: 'Deretter 149 kr/mnd', category: 'abonnement' });
  assert.equal(r.pushed, 1);
  const last = nt.pendingFor(SEB).at(-1);
  assert.equal(last.title, 'Trekk i morgen: ••• kr');
  assert.equal(last.body, 'Deretter ••• kr/mnd');
  assert.equal(sent.at(-1).body, 'Deretter ••• kr/mnd');
  assert.equal(sent.at(-1).title, 'Trekk i morgen: ••• kr');
  await new Promise((res) => setImmediate(res));
  assert.equal(hooked.at(-1).body, 'Deretter ••• kr/mnd');
  // Tekst uten beløp er uendret.
  await nt.notifyUser(SEB, { title: 'Pakken er hentet', body: 'Hentet kl. 14:05', category: 'pakker' });
  assert.equal(nt.pendingFor(SEB).at(-1).body, 'Hentet kl. 14:05');
  await A('/api/me/notify', 'PUT', { hideAmounts: false });
});

test('Widgetdata: prøveperiode-widgeten skjuler prisene, og Hjem-widgetene sier fra til appen', async () => {
  const ends = new Date(Date.now() + 5 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  db.prepare("INSERT INTO trials(user_id, service, ends_at, price_after, status, created) VALUES(?,?,?,?,'active',?)").run(SEB, 'Netflix', ends, 149, Date.now());
  const plain = (await A('/api/widgets/trials')).body;
  assert.equal(plain.hideAmounts, false);
  assert.equal(plain.next.priceLabel, '149 kr/mnd');
  // Fra en enhet med «Skjul beløp» på.
  const dev = (await A('/api/widgets/trials?hideAmounts=1')).body;
  assert.equal(dev.hideAmounts, true);
  assert.equal(dev.next.priceLabel, '••• kr/mnd');
  assert.equal(dev.next.afterLabel, 'deretter ••• kr/mnd');
  assert.equal(dev.next.price, null);
  assert.ok(dev.next.notifications.every((n) => !/\d+\s?kr/.test(`${n.title} ${n.body}`)), JSON.stringify(dev.next.notifications));
  // Per bruker (Innstillinger → Varsler).
  await A('/api/me/notify', 'PUT', { hideAmounts: true });
  assert.equal((await A('/api/widgets/trials')).body.next.priceLabel, '••• kr/mnd');
  const mw = await A('/api/mobile/widgets');
  assert.equal(mw.status, 200, mw.text);
  assert.equal(mw.body.hideAmounts, true);
  await A('/api/me/notify', 'PUT', { hideAmounts: false });
  assert.equal((await A('/api/mobile/widgets')).body.hideAmounts, false);
  assert.equal((await A('/api/mobile/widgets?hideAmounts=1')).body.hideAmounts, true);
  // Brief-widgeten (prøveperiodene med pris).
  const bw = await A('/api/brief/widget?size=large');
  assert.equal(bw.status, 200, bw.text);
  assert.equal(bw.body.hideAmounts, false);
  const bh = await A('/api/brief/widget?size=large&hideAmounts=1');
  assert.equal(bh.body.hideAmounts, true);
  assert.doesNotMatch(JSON.stringify(bh.body), /\d\s?kr\b/, 'ingen beløp i tekstene');
  if (/149 kr/.test(bw.text)) assert.match(bh.text, /••• kr/);
});
