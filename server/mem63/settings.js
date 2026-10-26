// Prompt 63 (prompt 49 del 5, D5SRV): innstillingene for «minnet holder seg ryddig». Tre brytere, standard PÅ (ingenting kommer
// likevel inn i minnet uten at brukeren sier ja, og ingenting slettes automatisk):
//   nightly   – nattlig oppsummering kl. 03 som foreslår nye fakta (pending)
//   conflicts – motstrid-sjekk (samme subjekt med ulike verdier, aliaskollisjoner, mot entitetsregisteret) med spørsmål
//   stale     – markering av fakta som ikke er brukt på lenge (staleDays, standard 90)
// Effektiv verdi = server OG bruker (samme modell som sched62/recipes61). Serveren i kv(OWNER,'mem63'), brukeren i kv(bruker,'mem63_user').
import { kv, OWNER } from '../db.js';

export const KEYS63 = ['nightly', 'conflicts', 'stale'];
export const LABELS63 = { nightly: 'Nattlig oppsummering', conflicts: 'Motstrid-sjekk', stale: 'Marker ubrukte fakta' };
export const HELP63 = {
  nightly: 'Hver natt kl. 03 går Glimt gjennom dagens samtaler, rettelser og nye kalenderhendelser og foreslår nye ting å huske. Ingenting lagres før du godkjenner. Kjøres med den lokale modellen.',
  conflicts: 'Glimt ser etter ting som motsier hverandre («Nina er frisør» og «Nina er tannlege») og spør deg hva som stemmer.',
  stale: 'Fakta som ikke er brukt på lenge får et merke. De slettes aldri automatisk – bare når du trykker «Slett».',
};
export const STALE_DAYS63 = 90;
const SERVER_KEY = 'mem63', USER_KEY = 'mem63_user';
const DEFAULTS = Object.freeze({ nightly: true, conflicts: true, stale: true });

let testOverride = null;
/** Bare for tester: tving verdier ({nightly:false, …}). null = tilbake til det lagrede. */
export const _setMem63 = (o) => { testOverride = o ? { ...o } : null; };

export function serverMem63() {
  let raw = {};
  try { raw = kv.get(OWNER, SERVER_KEY, {}) ?? {}; } catch { /* standard */ }
  return Object.fromEntries(KEYS63.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : DEFAULTS[k]]));
}
export function userMem63(user) {
  let raw = {};
  try { raw = (user ? kv.get(user, USER_KEY, {}) : {}) ?? {}; } catch { /* */ }
  return Object.fromEntries(KEYS63.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : null]));
}
/** Effektive innstillinger. → {nightly, conflicts, stale} */
export function mem63(user) {
  const s = serverMem63(), u = userMem63(user);
  const out = Object.fromEntries(KEYS63.map((k) => [k, s[k] !== false && (u[k] ?? true) !== false]));
  return testOverride ? { ...out, ...testOverride } : out;
}
/** Grensen for «ikke brukt på lenge» (dager, 30–730). */
export function staleDays63(user) {
  let d = null;
  try { d = user ? kv.get(user, USER_KEY, {})?.staleDays ?? null : null; } catch { /* */ }
  return Number.isInteger(d) && d >= 30 && d <= 730 ? d : STALE_DAYS63;
}

/** PUT: {scope:'user'|'server', nightly?, conflicts?, stale?, staleDays?}. → {ok} | {error, status} */
export function saveMem63(user, body, { admin = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Forventet {scope, nightly?, conflicts?, stale?, staleDays?}', status: 400 };
  const scope = body.scope === 'server' ? 'server' : body.scope === 'user' || body.scope == null ? 'user' : null;
  if (!scope) return { error: 'scope må være user eller server', status: 400 };
  if (scope === 'server' && !admin) return { error: 'Bare administrator kan endre serverens valg', status: 403 };
  let cur = {};
  try { cur = { ...((scope === 'server' ? kv.get(OWNER, SERVER_KEY, {}) : kv.get(user, USER_KEY, {})) ?? {}) }; } catch { /* */ }
  for (const k of KEYS63) {
    if (body[k] === undefined) continue;
    if (scope === 'server' ? typeof body[k] !== 'boolean' : body[k] !== null && typeof body[k] !== 'boolean') return { error: `${k} må være true${scope === 'user' ? ', false eller null' : ' eller false'}`, status: 400 };
    if (body[k] === null) delete cur[k]; else cur[k] = body[k];
  }
  if (body.staleDays !== undefined) {
    if (scope !== 'user') return { error: 'staleDays kan bare settes for brukeren', status: 400 };
    if (body.staleDays === null) delete cur.staleDays;
    else if (!Number.isInteger(body.staleDays) || body.staleDays < 30 || body.staleDays > 730) return { error: 'staleDays må være et heltall 30–730', status: 400 };
    else cur.staleDays = body.staleDays;
  }
  kv.set(scope === 'server' ? OWNER : user, scope === 'server' ? SERVER_KEY : USER_KEY, cur);
  return { ok: true };
}
