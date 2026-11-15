// Prompt 51 (SEC51): WebAuthn (passkeys) i ren JS med node:crypto – ingen avhengigheter.
// - CBOR (RFC 8949): dekoder det WebAuthn bruker (heltall, byte-/tekststrenger, lister, kart, enkle verdier, flyttall) og en liten
//   koder (brukes av testene og til å lagre COSE-nøkler).
// - authenticatorData: rpIdHash, flagg (UP/UV/BE/BS/AT/ED), signCount, attestert credential (AAGUID, id, COSE-nøkkel).
// - COSE → KeyObject: ES256 (kty 2, crv 1, alg −7) og RS256 (kty 3, alg −257).
// - Registrering: attestasjon «none» og «packed» (selvattestasjon med credential-nøkkelen, eller x5c der signaturen sjekkes mot
//   sertifikatets offentlige nøkkel – kjeden mot en rot sjekkes ikke, vi ber om attestation:'none').
// - Innlogging: signaturen over authenticatorData ‖ SHA-256(clientDataJSON), challenge, origin, RP-id og sign count.
import { createHash, createPublicKey, verify as cryptoVerify, X509Certificate, timingSafeEqual } from 'node:crypto';

export class WebAuthnError51 extends Error { constructor(message, code = 'invalid') { super(message); this.code = code; this.status = 400; } }
const fail = (m, code) => { throw new WebAuthnError51(m, code); };
export const sha256 = (b) => createHash('sha256').update(b).digest();
export const b64u = (b) => Buffer.from(b).toString('base64url');
export const fromB64u = (s) => {
  if (Buffer.isBuffer(s)) return s;
  if (typeof s !== 'string' || !/^[A-Za-z0-9_\-+/=]*$/.test(s)) fail('Ugyldig base64url-verdi');
  return Buffer.from(s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), 'base64url');
};

/* ---------------- CBOR ---------------- */

export function cborDecode(buf, { allowTrailing = false } = {}) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let i = 0, depth = 0;
  const need = (n) => { if (i + n > b.length) fail('CBOR: for kort'); };
  const arg = (info) => {
    if (info < 24) return info;
    if (info === 24) { need(1); return b[i++]; }
    if (info === 25) { need(2); const v = b.readUInt16BE(i); i += 2; return v; }
    if (info === 26) { need(4); const v = b.readUInt32BE(i); i += 4; return v; }
    if (info === 27) { need(8); const v = b.readBigUInt64BE(i); i += 8; if (v > BigInt(Number.MAX_SAFE_INTEGER)) fail('CBOR: for stort tall'); return Number(v); }
    fail('CBOR: ubestemt lengde støttes ikke');
  };
  const item = () => {
    if (++depth > 32) fail('CBOR: for dyp struktur');
    need(1);
    const ib = b[i++], major = ib >> 5, info = ib & 31;
    let out;
    if (major === 0) out = arg(info);
    else if (major === 1) out = -1 - arg(info);
    else if (major === 2) { const n = arg(info); need(n); out = b.subarray(i, i + n); i += n; }
    else if (major === 3) { const n = arg(info); need(n); out = b.subarray(i, i + n).toString('utf8'); i += n; }
    else if (major === 4) { const n = arg(info); if (n > 10_000) fail('CBOR: for lang liste'); out = []; for (let k = 0; k < n; k++) out.push(item()); }
    else if (major === 5) { const n = arg(info); if (n > 10_000) fail('CBOR: for stort kart'); out = new Map(); for (let k = 0; k < n; k++) { const key = item(); out.set(key, item()); } }
    else if (major === 6) { arg(info); out = item(); } // tagger ignoreres
    else {
      if (info === 20) out = false; else if (info === 21) out = true; else if (info === 22 || info === 23) out = null;
      else if (info === 25) { need(2); out = halfFloat(b.readUInt16BE(i)); i += 2; }
      else if (info === 26) { need(4); out = b.readFloatBE(i); i += 4; }
      else if (info === 27) { need(8); out = b.readDoubleBE(i); i += 8; }
      else fail('CBOR: ukjent enkel verdi');
    }
    depth--;
    return out;
  };
  const v = item();
  if (!allowTrailing && i !== b.length) fail('CBOR: data etter slutten');
  return allowTrailing ? { value: v, length: i } : v;
}
function halfFloat(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

/** Liten CBOR-koder (heltall, Buffer, tekst, lister, Map/objekt, bool, null). */
export function cborEncode(v) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) { const x = Buffer.alloc(3); x[0] = (major << 5) | 25; x.writeUInt16BE(n, 1); return x; }
    if (n < 2 ** 32) { const x = Buffer.alloc(5); x[0] = (major << 5) | 26; x.writeUInt32BE(n, 1); return x; }
    const x = Buffer.alloc(9); x[0] = (major << 5) | 27; x.writeBigUInt64BE(BigInt(n), 1); return x;
  };
  if (v === false) return Buffer.from([0xf4]);
  if (v === true) return Buffer.from([0xf5]);
  if (v === null || v === undefined) return Buffer.from([0xf6]);
  if (typeof v === 'number') { if (!Number.isInteger(v)) fail('cborEncode: bare heltall'); return v >= 0 ? head(0, v) : head(1, -1 - v); }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (typeof v === 'string') { const t = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, t.length), t]); }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cborEncode)]);
  const entries = v instanceof Map ? [...v.entries()] : Object.entries(v);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, x]) => [cborEncode(k), cborEncode(x)])]);
}

/* ---------------- authenticatorData ---------------- */

export const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40, ED: 0x80 };
export function parseAuthData(buf) {
  const b = Buffer.from(buf);
  if (b.length < 37) fail('authenticatorData er for kort');
  const flags = b[32];
  const out = { rpIdHash: b.subarray(0, 32), flags, up: !!(flags & FLAGS.UP), uv: !!(flags & FLAGS.UV), be: !!(flags & FLAGS.BE), bs: !!(flags & FLAGS.BS),
    at: !!(flags & FLAGS.AT), ed: !!(flags & FLAGS.ED), signCount: b.readUInt32BE(33) };
  let i = 37;
  if (out.at) {
    if (b.length < i + 18) fail('Mangler attestert credential');
    out.aaguid = b.subarray(i, i + 16); i += 16;
    const n = b.readUInt16BE(i); i += 2;
    if (n < 1 || n > 1023 || b.length < i + n) fail('Ugyldig credential-id');
    out.credentialId = b.subarray(i, i + n); i += n;
    const { value, length } = cborDecode(b.subarray(i), { allowTrailing: true });
    out.cosePublicKey = b.subarray(i, i + length); out.cose = value; i += length;
  }
  if (out.ed) { const { length } = cborDecode(b.subarray(i), { allowTrailing: true }); i += length; }
  if (i !== b.length) fail('authenticatorData har data etter slutten');
  return out;
}

/* ---------------- COSE ---------------- */

export const ALG = { ES256: -7, RS256: -257 };
/** COSE-nøkkel (Map eller CBOR-bytes) → {key: KeyObject, alg, jwk} */
export function coseToKey(cose) {
  const m = Buffer.isBuffer(cose) ? cborDecode(cose) : cose;
  if (!(m instanceof Map)) fail('COSE-nøkkelen er ikke et kart');
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && alg === ALG.ES256) {
    if (m.get(-1) !== 1) fail('Bare P-256 støttes for ES256');
    const x = m.get(-2), y = m.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) fail('Ugyldig EC-nøkkel');
    const jwk = { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y) };
    return { key: createPublicKey({ key: jwk, format: 'jwk' }), alg, jwk };
  }
  if (kty === 3 && alg === ALG.RS256) {
    const n = m.get(-1), e = m.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256) fail('Ugyldig RSA-nøkkel (minst 2048 bit)');
    const jwk = { kty: 'RSA', n: b64u(n), e: b64u(e) };
    return { key: createPublicKey({ key: jwk, format: 'jwk' }), alg, jwk };
  }
  fail('Nøkkeltypen støttes ikke (bare ES256 og RS256)', 'unsupported_alg');
}
export const keyFromJwk = (jwk) => createPublicKey({ key: typeof jwk === 'string' ? JSON.parse(jwk) : jwk, format: 'jwk' });
function verifySig(alg, key, data, sig) {
  if (alg !== ALG.ES256 && alg !== ALG.RS256) fail('Ukjent algoritme');
  try { return cryptoVerify('sha256', data, key, sig); } catch { return false; }
}

/* ---------------- clientDataJSON ---------------- */

function clientData(raw, type, challenge, origins) {
  let cd;
  try { cd = JSON.parse(Buffer.from(raw).toString('utf8')); } catch { fail('clientDataJSON er ikke JSON'); }
  if (cd.type !== type) fail(`Feil type (${type} forventet)`);
  const got = (() => { try { return fromB64u(String(cd.challenge ?? '')); } catch { return Buffer.alloc(0); } })();
  const want = Buffer.from(challenge);
  if (got.length !== want.length || !timingSafeEqual(got, want)) fail('Utfordringen stemmer ikke', 'challenge');
  if (!origins.includes(String(cd.origin ?? ''))) fail(`Feil opphav (${String(cd.origin ?? '').slice(0, 80)})`, 'origin');
  if (cd.crossOrigin === true) fail('Innbygd fra et annet opphav');
  return cd;
}
const rpOk = (ad, rpId) => timingSafeEqual(ad.rpIdHash, sha256(Buffer.from(rpId, 'utf8')));

/* ---------------- Registrering ---------------- */

/**
 * Sjekker en registrering (navigator.credentials.create).
 * cred: {id, rawId, response:{clientDataJSON, attestationObject, transports?}} (base64url)
 * → {credentialId, jwk, alg, signCount, aaguid, fmt, uv, backupEligible, backedUp, transports}
 */
export function verifyRegistration51(cred, { challenge, rpId, origins, requireUV = true }) {
  const r = cred?.response ?? {};
  const cdRaw = fromB64u(r.clientDataJSON ?? '');
  clientData(cdRaw, 'webauthn.create', challenge, origins);
  const att = cborDecode(fromB64u(r.attestationObject ?? ''));
  if (!(att instanceof Map)) fail('attestationObject er ikke et kart');
  const fmt = att.get('fmt'), attStmt = att.get('attStmt'), authData = att.get('authData');
  if (!Buffer.isBuffer(authData)) fail('Mangler authData');
  const ad = parseAuthData(authData);
  if (!rpOk(ad, rpId)) fail('RP-id stemmer ikke', 'rpid');
  if (!ad.up) fail('Brukeren var ikke til stede (UP)');
  if (requireUV && !ad.uv) fail('Enheten bekreftet ikke brukeren (Face ID, fingeravtrykk eller PIN)', 'uv');
  if (!ad.at || !ad.credentialId) fail('Mangler credential i authData');
  const { key, alg, jwk } = coseToKey(ad.cose);
  const clientDataHash = sha256(cdRaw);
  const signed = Buffer.concat([authData, clientDataHash]);
  if (fmt === 'none') {
    if (!(attStmt instanceof Map) || attStmt.size) fail('«none»-attestasjon skal være tom');
  } else if (fmt === 'packed') {
    if (!(attStmt instanceof Map)) fail('Ugyldig attStmt');
    const sAlg = attStmt.get('alg'), sig = attStmt.get('sig'), x5c = attStmt.get('x5c');
    if (!Buffer.isBuffer(sig)) fail('Mangler signatur i attestasjonen');
    if (Array.isArray(x5c) && x5c.length) {
      let cert;
      try { cert = new X509Certificate(x5c[0]); } catch { fail('Ugyldig attestasjonssertifikat'); }
      if (sAlg !== ALG.ES256 && sAlg !== ALG.RS256) fail('Ukjent attestasjonsalgoritme');
      if (!verifySig(sAlg, cert.publicKey, signed, sig)) fail('Attestasjonssignaturen stemmer ikke', 'signature');
      const now = Date.now();
      if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) fail('Attestasjonssertifikatet er ikke gyldig nå');
    } else {
      if (sAlg !== alg) fail('Selvattestasjon må bruke samme algoritme som nøkkelen');
      if (!verifySig(alg, key, signed, sig)) fail('Selvattestasjonen stemmer ikke', 'signature');
    }
  } else fail(`Attestasjonsformatet «${String(fmt).slice(0, 20)}» støttes ikke (bare none og packed)`, 'unsupported_fmt');
  const credentialId = b64u(ad.credentialId);
  if (cred.rawId && b64u(fromB64u(cred.rawId)) !== credentialId) fail('rawId stemmer ikke med authData');
  const transports = (Array.isArray(r.transports) ? r.transports : []).filter((t) => /^[a-z-]{2,20}$/.test(t)).slice(0, 6);
  return { credentialId, jwk, alg, signCount: ad.signCount, aaguid: ad.aaguid.toString('hex'), fmt, uv: ad.uv, backupEligible: ad.be, backedUp: ad.bs, transports };
}

/* ---------------- Innlogging ---------------- */

/**
 * Sjekker en innlogging (navigator.credentials.get) mot en lagret nøkkel.
 * stored: {jwk, alg, signCount, userHandle?} → {signCount, uv, backedUp, cloneWarning}
 * Sign count: er en av dem > 0, må den nye være større enn den lagrede (ellers kan nøkkelen være kopiert → avvist).
 */
export function verifyAssertion51(cred, stored, { challenge, rpId, origins, requireUV = true }) {
  const r = cred?.response ?? {};
  const cdRaw = fromB64u(r.clientDataJSON ?? ''), adRaw = fromB64u(r.authenticatorData ?? ''), sig = fromB64u(r.signature ?? '');
  clientData(cdRaw, 'webauthn.get', challenge, origins);
  const ad = parseAuthData(adRaw);
  if (!rpOk(ad, rpId)) fail('RP-id stemmer ikke', 'rpid');
  if (!ad.up) fail('Brukeren var ikke til stede (UP)');
  if (requireUV && !ad.uv) fail('Enheten bekreftet ikke brukeren (Face ID, fingeravtrykk eller PIN)', 'uv');
  if (r.userHandle && stored.userHandle && b64u(fromB64u(r.userHandle)) !== stored.userHandle) fail('Passkeyen hører til en annen bruker', 'user');
  const key = keyFromJwk(stored.jwk);
  if (!verifySig(stored.alg, key, Buffer.concat([adRaw, sha256(cdRaw)]), sig)) fail('Signaturen stemmer ikke', 'signature');
  const prev = Number(stored.signCount) || 0;
  if ((ad.signCount > 0 || prev > 0) && ad.signCount <= prev) fail('Telleren til passkeyen gikk ikke fremover – den kan være kopiert', 'sign_count');
  return { signCount: ad.signCount, uv: ad.uv, backedUp: ad.bs };
}
