// Prompt 31: bekreft passordet på nytt (biometri-flyten i appene). POST /api/auth/reauth {password} → {reauthToken, expiresAt, expiresIn}
// - Krever innlogging (økt eller app-token). Passordet sjekkes med samme sperre mot gjentatte forsøk som innloggingen (429).
// - Tokenet er tilfeldig (32 byte), gjelder i 5 minutter, er bundet til brukeren og kan brukes én gang. Bare en hash
//   holdes i minnet (forsvinner ved omstart). Brukes av POST /api/system/update/start|rollback {reauthToken} når
//   «Krev passord for å oppdatere» er på.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { checkPassword, clientIp, loginBlocked, loginFailed, loginSucceeded } from './auth.js';

export const REAUTH_TTL_MS = 5 * 60_000;
const tokens = new Map(); // sha256(token) → {user, exp}
const hashOf = (t) => createHash('sha256').update(String(t)).digest('hex');

export function issueReauth(user, now = Date.now()) {
  for (const [k, v] of tokens) if (v.exp <= now) tokens.delete(k);
  const token = 'ra_' + randomBytes(32).toString('base64url');
  tokens.set(hashOf(token), { user: String(user), exp: now + REAUTH_TTL_MS });
  return { reauthToken: token, expiresAt: new Date(now + REAUTH_TTL_MS).toISOString(), expiresIn: REAUTH_TTL_MS / 1000 };
}

/** true når tokenet finnes, ikke er utløpt og hører til user. Tokenet slettes uansett (engangsbruk). */
export function consumeReauth(token, user, now = Date.now()) {
  if (typeof token !== 'string' || !/^ra_[A-Za-z0-9_-]{40,}$/.test(token)) return false;
  const k = hashOf(token), v = tokens.get(k);
  if (!v) return false;
  tokens.delete(k);
  const a = Buffer.from(v.user), b = Buffer.from(String(user));
  return v.exp > now && a.length === b.length && timingSafeEqual(a, b);
}

/** Hono-handler; c.get('user') er satt av authOrToken. */
export async function reauthHandler(c) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Ikke innlogget' }, 401);
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  const b = await c.req.json().catch(() => ({}));
  if (!checkPassword(user, b?.password)) { loginFailed(ip); return c.json({ error: 'Feil passord' }, 403); }
  loginSucceeded(ip);
  return c.json(issueReauth(user), 200, { 'Cache-Control': 'no-store' });
}

export const _reauthTokens = tokens;
