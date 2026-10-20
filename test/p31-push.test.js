// Prompt 31 (SERVER31): Web Push uten avhengigheter (VAPID ES256 + aes128gcm, RFC 8291), abonnementer, presence,
// notifyUser og køen for de native appene (GET /api/notify/pending).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';

const DIR = mkdtempSync(join(tmpdir(), 'hl-p31push-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-31p';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const wp = await import('../server/webpush.js');
const nt = await import('../server/notify.js');
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
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const me = (await A('/api/me')).body;
const SEB = me?.id ?? me?.user?.id ?? 'owner';
// Stille timer av, så testene ikke avhenger av klokkeslettet.
await A('/api/me/notify', 'PUT', { quietOn: false });

test('aes128gcm: RFC 8291 kap. 5 testvektor', () => {
  const out = wp.encryptPayload('When I grow up, I want to be a watermelon',
    { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    { asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw' });
  assert.equal(wp.b64u(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  assert.equal(wp.decryptPayload(out, { uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94', auth: 'BTBZMqHH6r4Tts7J_aSIgg' }).toString(), 'When I grow up, I want to be a watermelon');
});

function uaKeys() {
  const e = createECDH('prime256v1'); e.generateKeys();
  return { p256dh: wp.b64u(e.getPublicKey()), auth: wp.b64u(randomBytes(16)), uaPrivate: wp.b64u(e.getPrivateKey()) };
}

test('aes128gcm: tilfeldige nøkler og salt hver gang, men dekrypterbart', () => {
  const k = uaKeys();
  const a = wp.encryptPayload('{"title":"Glimt"}', k), b = wp.encryptPayload('{"title":"Glimt"}', k);
  assert.notEqual(wp.b64u(a), wp.b64u(b));
  assert.equal(a.readUInt32BE(16), 4096);
  assert.equal(a[20], 65);
  assert.equal(wp.decryptPayload(a, k).toString(), '{"title":"Glimt"}');
  assert.throws(() => wp.encryptPayload('x', { p256dh: 'AAAA', auth: k.auth }), /p256dh/);
});

test('VAPID: ES256-JWT med aud = endepunktets origin, gyldig signatur, nøkkelen lagres', async () => {
  const pub = wp.vapidPublicKey();
  assert.equal(wp.fromB64u(pub).length, 65);
  assert.equal(wp.vapidPublicKey(), pub, 'samme nøkkel neste gang');
  const jwt = wp.vapidJwt('https://fcm.googleapis.com/fcm/send/abc', { now: Date.parse('2026-10-19T10:00:00Z') });
  const [h, c] = jwt.split('.').slice(0, 2).map((x) => JSON.parse(wp.fromB64u(x).toString()));
  assert.deepEqual(h, { typ: 'JWT', alg: 'ES256' });
  assert.equal(c.aud, 'https://fcm.googleapis.com');
  assert.equal(c.exp, Date.parse('2026-10-19T22:00:00Z') / 1000);
  assert.match(c.sub, /^mailto:/);
  assert.equal(wp.fromB64u(jwt.split('.')[2]).length, 64);
  assert.equal(await wp.verifyVapidJwt(jwt, pub), true);
  assert.match(wp.vapidAuthHeader('https://fcm.googleapis.com/x'), new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${pub}$`));
  const r = await A('/api/push/vapid');
  assert.equal(r.status, 200);
  assert.equal(r.body.publicKey, pub);
  assert.equal((await client({})('/api/push/vapid')).status, 401);
});

test('endepunkter: bare kjente push-tjenester over https', () => {
  assert.equal(wp.validEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(wp.validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), true);
  assert.equal(wp.validEndpoint('https://web.push.apple.com/QW'), true);
  assert.equal(wp.validEndpoint('http://fcm.googleapis.com/x'), false);
  assert.equal(wp.validEndpoint('https://evil.example/x'), false);
  assert.equal(wp.validEndpoint('https://127.0.0.1/x'), false);
  assert.equal(wp.validEndpoint('https://fcm.googleapis.com:8443/x'), false);
});

const sent = [];
wp._setPushFetch(async (url, init) => { sent.push({ url, init }); return new Response('', { status: sent.at(-1).url.includes('gone') ? 410 : 201 }); });
const KEYS = uaKeys();
const EP = 'https://fcm.googleapis.com/fcm/send/seb-1';

test('abonnement: validering, lagres per bruker, flyttes ved ny innlogging, slettes', async () => {
  assert.equal((await A('/api/push/subscribe', 'POST', { endpoint: 'https://evil.example/x', keys: KEYS })).status, 400);
  assert.equal((await A('/api/push/subscribe', 'POST', { endpoint: EP, keys: { p256dh: 'kort', auth: KEYS.auth } })).status, 400);
  const r = await A('/api/push/subscribe', 'POST', { endpoint: EP, keys: { p256dh: KEYS.p256dh, auth: KEYS.auth } });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.id);
  assert.equal((await A('/api/push/subscribe', 'POST', { endpoint: EP, keys: KEYS })).body.id, r.body.id, 'samme endepunkt = samme rad');
  assert.equal(db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint=?').pluck().get(EP), SEB);
  // Kari kan ikke slette Sebastians abonnement.
  assert.equal((await K('/api/push/subscribe', 'DELETE', { endpoint: EP })).body.removed, 0);
});

test('notifyUser: realtime + kø + Web Push (kryptert, VAPID, TTL); ikke når en klient er synlig', async () => {
  sent.length = 0;
  const r = await nt.notifyUser(SEB, { title: 'Glimt', body: 'Nina **frisør** er fredag 25. september kl. 14.30.', url: '/#/chat/1', tag: 'assist-a1', category: 'ai' });
  assert.equal(r.pushed, 1, JSON.stringify(r));
  assert.ok(r.id > 0);
  assert.equal(sent.length, 1);
  const h = sent[0].init.headers;
  assert.equal(sent[0].url, EP);
  assert.equal(h['Content-Encoding'], 'aes128gcm');
  assert.equal(h.TTL, '86400');
  assert.equal(h.Urgency, 'high');
  assert.match(h.Authorization, /^vapid t=/);
  const payload = JSON.parse(wp.decryptPayload(Buffer.from(sent[0].init.body), KEYS).toString());
  assert.deepEqual([payload.title, payload.body, payload.url, payload.tag, payload.id], ['Glimt', 'Nina frisør er fredag 25. september kl. 14.30.', '/#/chat/1', 'assist-a1', r.id]);
  // Synlig heartbeat → ingen push (men fortsatt i køen).
  assert.deepEqual((await A('/api/push/presence', 'POST', { visible: true })).body, { ok: true, visible: true, holdSeconds: 30 });
  sent.length = 0;
  const r2 = await nt.notifyUser(SEB, { title: 'Lagt i kalenderen', body: 'x', category: 'kalender' });
  assert.equal(r2.skipped, 'i forgrunnen');
  assert.equal(sent.length, 0);
  assert.ok(r2.id > r.id);
  // 30 s senere → push igjen.
  const r3 = await nt.notifyUser(SEB, { title: 'Senere', category: 'kalender' }, { now: Date.now() + 31_000 });
  assert.equal(r3.pushed, 1);
  await A('/api/push/presence', 'POST', { visible: false });
});

test('brukervalg: AI-svar i bakgrunnen av → ingen push/kø for kategori ai; hovedbryter av → ingenting', async () => {
  let n = (await A('/api/me/notify')).body;
  assert.equal(n.ai_bg_notify, true, 'på som standard');
  n = (await A('/api/me/notify', 'PUT', { ai_bg_notify: false })).body;
  assert.equal(n.ai_bg_notify, false);
  assert.equal((await A('/api/me/notify', 'PUT', { ai_bg_notify: 'ja' })).status, 400);
  sent.length = 0;
  const r = await nt.notifyUser(SEB, { title: 'Glimt', body: 'svar', category: 'ai' });
  assert.equal(r.skipped, 'AI-svar i bakgrunnen av');
  assert.equal(r.id, null);
  assert.equal(sent.length, 0);
  assert.equal((await nt.notifyUser(SEB, { title: 'Prøve', category: 'abonnement' })).pushed, 1, 'andre kategorier sendes');
  await A('/api/me/notify', 'PUT', { ai_bg_notify: true, on: false });
  assert.equal((await nt.notifyUser(SEB, { title: 'Prøve', category: 'abonnement' })).skipped, 'varsler av');
  await A('/api/me/notify', 'PUT', { on: true });
  assert.deepEqual((await A('/api/assist/settings')).body, { ai_bg_notify: true, n_ai_in: true, cloud: false }); // prompt 39: + n_ai_in
});

test('GET /api/notify/pending: per bruker, since-markør, nyeste etter', async () => {
  const all = (await A('/api/notify/pending')).body;
  assert.ok(all.items.length >= 4);
  assert.deepEqual(Object.keys(all.items[0]).sort(), ['badge', 'body', 'category', 'data', 'icon', 'id', 'tag', 'title', 'ts', 'url']); // prompt 39: Glimt-ikon på AI-varsler
  assert.equal(all.cursor, all.items.at(-1).id);
  const since = all.items[1].id;
  const r = (await A(`/api/notify/pending?since=${since}`)).body;
  assert.ok(r.items.every((x) => x.id > since));
  assert.equal((await A(`/api/notify/pending?since=${all.cursor}`)).body.items.length, 0);
  assert.equal((await A('/api/notify/pending?since=999999')).body.cursor, all.cursor, 'for høy markør settes tilbake');
  assert.equal((await K('/api/notify/pending')).body.items.length, 0, 'Kari ser ikke Sebastians varsler');
  assert.equal((await client({})('/api/notify/pending')).status, 401);
});

test('push-tjenesten svarer 410 → abonnementet slettes; DELETE fjerner', async () => {
  const k = uaKeys();
  await A('/api/push/subscribe', 'POST', { endpoint: 'https://fcm.googleapis.com/fcm/send/gone', keys: k });
  assert.equal(db.prepare("SELECT count(*) FROM push_subscriptions WHERE user_id=?").pluck().get(SEB), 2);
  const r = await nt.notifyUser(SEB, { title: 'Test', category: 'system' }, { now: Date.now() + 60_000 });
  assert.equal(r.pushed, 1);
  assert.equal(db.prepare("SELECT count(*) FROM push_subscriptions WHERE endpoint LIKE '%gone'").pluck().get(), 0);
  assert.equal((await A('/api/push/subscribe', 'DELETE', { endpoint: EP })).body.removed, 1);
  assert.equal((await nt.notifyUser(SEB, { title: 'Test', category: 'system' }, { now: Date.now() + 90_000 })).skipped, 'ingen abonnement');
});
