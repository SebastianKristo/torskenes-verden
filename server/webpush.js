// Prompt 31: Web Push uten avhengigheter (bare node:crypto).
// - VAPID (RFC 8292): ES256-JWT {aud, exp, sub} signert med serverens P-256-nøkkel. Header «Authorization: vapid t=…, k=…».
// - Innhold kryptert med «aes128gcm» (RFC 8291 + RFC 8188): ECDH (P-256) mot abonnementets p256dh, HKDF med auth-hemmeligheten,
//   én post (rs 4096) med skilletegnet 0x02. Testet mot testvektoren i RFC 8291 kap. 5 (test/p31-push.test.js).
// - Nøklene lages første gang og lagres i kv(OWNER, 'vapid') som JWK (privat) + offentlig nøkkel i base64url.
import { createECDH, createHmac, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, randomBytes, sign, generateKeyPairSync } from 'node:crypto';
import { kv, OWNER } from './db.js';

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const fromB64u = (s) => Buffer.from(String(s ?? '').replace(/=+$/, ''), 'base64url');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/* ---------------- VAPID ---------------- */

/** Nøkkelpar {publicKey (base64url, 65 byte ukomprimert), privateJwk}. Lages én gang. */
export function vapidKeys() {
  const cur = kv.get(OWNER, 'vapid', null);
  if (cur?.publicKey && cur?.privateJwk?.d) return cur;
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  const v = { publicKey: b64u(pub), privateJwk: jwk, created: Date.now() };
  kv.set(OWNER, 'vapid', v);
  return v;
}
export const vapidPublicKey = () => vapidKeys().publicKey;

/** ES256-JWT for et endepunkt. exp maks 24 t (RFC 8292); vi bruker 12 t. */
export function vapidJwt(endpoint, { subject = 'mailto:admin@homelab.local', keys = vapidKeys(), now = Date.now() } = {}) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const data = `${header}.${claims}`;
  const key = createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  const sig = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64u(sig)}`;
}
export const vapidAuthHeader = (endpoint, opts = {}) => {
  const keys = opts.keys ?? vapidKeys();
  return `vapid t=${vapidJwt(endpoint, { ...opts, keys })}, k=${keys.publicKey}`;
};
/** Bare for tester: sjekker en JWT mot den offentlige nøkkelen. */
export function verifyVapidJwt(jwt, publicKeyB64u) {
  const [h, c, s] = String(jwt).split('.');
  const raw = fromB64u(publicKeyB64u);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) }, format: 'jwk' });
  return import('node:crypto').then(({ verify }) => verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, fromB64u(s)));
}

/* ---------------- aes128gcm (RFC 8291) ---------------- */

/**
 * Krypterer payload til ett abonnement. → Buffer (header + chiffertekst), klar som POST-kropp.
 * For testvektoren kan avsenderens ECDH-nøkkel (asPrivate, base64url) og salt (base64url) settes.
 */
export function encryptPayload(payload, { p256dh, auth }, { asPrivate = null, salt = null, rs = 4096 } = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('Ugyldig p256dh-nøkkel');
  if (authSecret.length < 16) throw new Error('Ugyldig auth-hemmelighet');
  const ecdh = createECDH('prime256v1');
  if (asPrivate) ecdh.setPrivateKey(fromB64u(asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const saltB = salt ? fromB64u(salt) : randomBytes(16);
  // RFC 8291 kap. 3.4: IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  // RFC 8188: CEK og NONCE fra HKDF(salt, IKM)
  const prk = hmac(saltB, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const plain = Buffer.concat([Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload)), Buffer.from([2])]);
  if (plain.length + 16 > rs) throw new Error('Varselet er for stort');
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  saltB.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

/** Bare for tester: dekrypterer med mottakerens private nøkkel (base64url). → Buffer uten skilletegn. */
export function decryptPayload(buf, { uaPrivate, auth }) {
  const salt = buf.subarray(0, 16), idlen = buf[20], asPublic = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(fromB64u(uaPrivate));
  const uaPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(asPublic);
  const prkKey = hmac(fromB64u(auth), secret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const out = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = out.length - 1;
  while (end >= 0 && out[end] === 0) end--;
  if (out[end] !== 2) throw new Error('Mangler skilletegn');
  return out.subarray(0, end);
}

/* ---------------- Sending ---------------- */

// Bare kjente push-tjenester (hindrer at serveren brukes til å POSTe til vilkårlige adresser).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /^push\.services\.mozilla\.com$/];
export function validEndpoint(endpoint) {
  let u;
  try { u = new URL(String(endpoint ?? '')); } catch { return false; }
  return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && PUSH_HOSTS.some((re) => re.test(u.hostname)) && String(endpoint).length <= 1000;
}

let fetcher = (...a) => fetch(...a);
/** Bare for tester: bytt ut fetch mot push-tjenesten. */
export const _setPushFetch = (fn) => { fetcher = fn ?? ((...a) => fetch(...a)); };

/** Sender ett varsel. → {ok, status, gone} (gone = 404/410, abonnementet skal slettes). */
export async function sendPush(sub, data, { ttl = 24 * 3600, urgency = 'normal', topic = null } = {}) {
  if (!validEndpoint(sub.endpoint)) return { ok: false, status: 0, gone: true, error: 'Ukjent push-tjeneste' };
  const body = encryptPayload(JSON.stringify(data), sub);
  const headers = { TTL: String(ttl), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Urgency: urgency, Authorization: vapidAuthHeader(sub.endpoint) };
  if (topic) headers.Topic = String(topic).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  try {
    const r = await fetcher(sub.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, gone: r.status === 404 || r.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: e.name === 'TimeoutError' ? 'Push-tjenesten svarte ikke' : String(e.message).slice(0, 200) };
  }
}
