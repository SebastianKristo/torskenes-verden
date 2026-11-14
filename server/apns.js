// Prompt 89 (SRV89): APNs-sender for Live Activities (iOS). node:http2 + ES256-JWT med node:crypto, ingen nye avhengigheter.
//
// Oppsett (bare admin): Innstillinger → Integrasjoner → «Apple Push (Live Activities)»: team-id, nøkkel-id, .p8-nøkkelen
// (hemmelighet, kryptert i settings.js), bundle-id (appen, standard no.kristo.finanshub) og miljø (sandbox eller produksjon).
// Nøkkelen og JWT-en logges aldri og sendes aldri til nettleseren eller appene. Uten fullstendig oppsett sendes ingenting
// (appene poller GET /api/live/aktiviteter i stedet).
//
//   apnsConf89()                         → {on, team, keyId, bundle, env, topic, host, missing:[felt]}  (aldri nøkkelen)
//   apnsJwt89({now})                     → «header.claims.signatur» (ES256, kid = nøkkel-id, iss = team-id, iat), cache 40 min
//   sendLive89({token, payload, priority, expiration}) → {ok, status, reason?, apnsId?, gone?}
//   testApns89()                         → {ok, message} (sender til et ugyldig token: BadDeviceToken = nøkkelen er godtatt)
import http2 from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';
import { cfg } from './settings.js';

export const APNS_HOSTS89 = { produksjon: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' };
export const DEFAULT_BUNDLE89 = 'no.kristo.finanshub';
const JWT_TTL = 40 * 60_000; // Apple: ny token tidligst hvert 20. min, senest hvert 60. min
const TIMEOUT = 10_000;

let hostOverride = null;
/** Bare for tester: send til en lokal (h2c) mock-server i stedet for Apple. null = tilbake til Apple. */
export const _setApnsHost89 = (url) => { hostOverride = url || null; closeApns89(); };

const envOf = (v) => (/^(sandbox|dev|development|utvikling)$/i.test(String(v ?? '').trim()) ? 'sandbox' : 'produksjon');
export function apnsConf89() {
  const team = String(cfg('apns_team') ?? '').trim(), keyId = String(cfg('apns_key_id') ?? '').trim();
  const bundle = String(cfg('apns_bundle') ?? '').trim() || DEFAULT_BUNDLE89, env = envOf(cfg('apns_env'));
  const hasKey = !!String(cfg('apns_p8') ?? '').trim();
  const missing = [!team && 'team-id', !keyId && 'nøkkel-id', !hasKey && '.p8-nøkkel'].filter(Boolean);
  return { on: !missing.length, team, keyId, bundle, env, topic: `${bundle}.push-type.liveactivity`, host: hostOverride ?? APNS_HOSTS89[env], missing };
}

/** .p8-innholdet (PEM med eller uten linjeskift, eller bare base64-kroppen) → KeyObject. Kaster en norsk feil uten nøkkelinnhold. */
function keyObject(raw) {
  const s = String(raw ?? '');
  const body = s.replace(/-----(BEGIN|END)[A-Z ]*-----/g, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]{40,}$/.test(body)) throw new Error('.p8-nøkkelen har feil format');
  const pem = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  try {
    const k = createPrivateKey({ key: pem, format: 'pem' });
    if (k.asymmetricKeyType !== 'ec') throw new Error('x');
    return k;
  } catch { throw new Error('.p8-nøkkelen kunne ikke leses (forventet en EC-nøkkel fra Apple)'); }
}
const b64u = (b) => Buffer.from(b).toString('base64url');

let jwtCache = null; // {sig: team|keyId|lengde, at, token}
/** ES256-JWT for APNs. Bytter når oppsettet endres eller etter 40 min. */
export function apnsJwt89({ now = Date.now() } = {}) {
  const c = apnsConf89();
  if (!c.on) throw new Error(`APNs er ikke satt opp (mangler ${c.missing.join(', ')})`);
  const raw = String(cfg('apns_p8') ?? '');
  const sig = `${c.team}|${c.keyId}|${raw.length}|${raw.slice(-12)}`;
  if (jwtCache && jwtCache.sig === sig && now - jwtCache.at < JWT_TTL && now >= jwtCache.at) return jwtCache.token;
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: c.keyId })), claims = b64u(JSON.stringify({ iss: c.team, iat: Math.floor(now / 1000) }));
  const s = sign('sha256', Buffer.from(`${head}.${claims}`), { key: keyObject(raw), dsaEncoding: 'ieee-p1363' });
  const token = `${head}.${claims}.${b64u(s)}`;
  jwtCache = { sig, at: now, token };
  return token;
}
export const _resetApnsJwt89 = () => { jwtCache = null; };

/* ---------------- HTTP/2-økt (gjenbrukes) ---------------- */

let sess = null; // {origin, s}
function session(origin) {
  if (sess && sess.origin === origin && !sess.s.closed && !sess.s.destroyed) return sess.s;
  const s = http2.connect(origin);
  s.on('error', () => { if (sess?.s === s) sess = null; });
  s.on('goaway', () => { if (sess?.s === s) sess = null; });
  s.on('close', () => { if (sess?.s === s) sess = null; });
  s.setTimeout(5 * 60_000, () => s.close());
  s.unref?.();
  sess = { origin, s };
  return s;
}
export function closeApns89() { try { sess?.s.close(); } catch { /* */ } sess = null; }

function post(origin, headers, body) {
  return new Promise((resolve) => {
    let done = false;
    const end = (v) => { if (!done) { done = true; resolve(v); } };
    let s;
    try { s = session(origin); } catch (e) { end({ status: 0, reason: e.code || 'Tilkobling feilet' }); return; }
    const req = s.request(headers);
    const t = setTimeout(() => { try { req.close(http2.constants.NGHTTP2_CANCEL); } catch { /* */ } end({ status: 0, reason: 'Tidsavbrudd' }); }, TIMEOUT);
    t.unref?.();
    let status = 0, apnsId = null, data = '';
    req.on('response', (h) => { status = +h[':status'] || 0; apnsId = h['apns-id'] ?? null; });
    req.setEncoding('utf8');
    req.on('data', (d) => { if (data.length < 4096) data += d; });
    req.on('end', () => { clearTimeout(t); let reason = null; try { reason = data ? JSON.parse(data).reason ?? null : null; } catch { /* */ } end({ status, apnsId, reason }); });
    req.on('error', (e) => { clearTimeout(t); end({ status: 0, reason: e.code || 'Feil' }); });
    req.end(body);
  });
}

const TOKEN_RE = /^[A-Fa-f0-9]{32,512}$/;
const GONE = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic', 'ExpiredToken']);
/**
 * Sender én Live Activity-push (apns-push-type: liveactivity, topic <bundle>.push-type.liveactivity).
 * gone:true betyr at tokenet er ugyldig/utløpt og bør slettes.
 */
export async function sendLive89({ token, payload, priority = 10, expiration = null, now = Date.now() } = {}) {
  const c = apnsConf89();
  if (!c.on) return { ok: false, status: 0, reason: 'NotConfigured' };
  if (!TOKEN_RE.test(String(token ?? ''))) return { ok: false, status: 0, reason: 'BadDeviceToken', gone: true };
  let jwt;
  try { jwt = apnsJwt89({ now }); } catch (e) { return { ok: false, status: 0, reason: e.message }; }
  const r = await post(c.host, {
    ':method': 'POST', ':path': `/3/device/${String(token).toLowerCase()}`, authorization: `bearer ${jwt}`,
    'apns-push-type': 'liveactivity', 'apns-topic': c.topic, 'apns-priority': String(priority === 5 ? 5 : 10),
    'apns-expiration': String(expiration ?? Math.floor(now / 1000) + 3600), 'content-type': 'application/json',
  }, JSON.stringify(payload));
  if (r.reason === 'ExpiredProviderToken') jwtCache = null;
  return { ok: r.status === 200, status: r.status, ...(r.reason ? { reason: r.reason } : {}), ...(r.apnsId ? { apnsId: r.apnsId } : {}), ...(r.status === 410 || GONE.has(r.reason) ? { gone: true } : {}) };
}

/** Test tilkobling: et kjent ugyldig token. BadDeviceToken (400) = Apple godtok nøkkelen. */
export async function testApns89() {
  const c = apnsConf89();
  if (!c.on) return { ok: false, message: `Mangler ${c.missing.join(', ')}.` };
  try { apnsJwt89(); } catch (e) { return { ok: false, message: e.message }; }
  const r = await sendLive89({ token: '0'.repeat(64), payload: { aps: { timestamp: Math.floor(Date.now() / 1000), event: 'update', 'content-state': {} } } });
  if (r.reason === 'BadDeviceToken' || r.reason === 'DeviceTokenNotForTopic') return { ok: true, message: `Apple godtok nøkkelen (${c.env}, ${c.topic}).` };
  if (r.reason === 'InvalidProviderToken') return { ok: false, message: 'Apple avviste nøkkelen: sjekk team-id, nøkkel-id og .p8-filen.' };
  if (r.reason === 'TopicDisallowed' || r.reason === 'BadTopic') return { ok: false, message: `Apple godtar ikke bundle-id-en ${c.bundle}.` };
  if (!r.status) return { ok: false, message: `Fikk ikke kontakt med Apple (${r.reason ?? 'ukjent feil'}).` };
  return { ok: false, message: `Apple svarte ${r.status}${r.reason ? ` (${r.reason})` : ''}.` };
}
