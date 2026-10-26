// Prompt 64 (prompt 49 del 7, D7SRV): innstillingene for «kvalitet over tid». To brytere, standard PÅ:
//   nightly – nattlig eval kl. 02 (bare serveren/admin: kjører eval-riggen mot den lokale modellen, varsler bare ved regresjon)
//   weekly  – ukerapport søndag kl. 20 (server OG bruker: hver bruker kan slå av sin egen)
// Tallene for nattevalen (runs, maxMinutes, interactiveWaitSec, keepDays) er bare serverens. Serveren i kv(OWNER,'quality64'),
// brukeren i kv(bruker,'quality64_user').
import { kv, OWNER } from '../db.js';

export const LABELS64 = { nightly: 'Nattlig eval', weekly: 'Ukerapport' };
export const HELP64 = {
  nightly: 'Hver natt kl. 02 kjører serveren eval-testene (også de lærte fra rettelser) mot den lokale modellen. Du får bare varsel når en test som var grønn har blitt rød. Evalen viker for deg: venter en forespørsel for lenge, avbrytes den.',
  weekly: 'Søndag kveld kl. 20 får du én kort melding om uka: antall forespørsler, andel løst på første forsøk, rettelser, nye oppskrifter, hurtigvei-andel og median svartid.',
};
const SERVER_KEY = 'quality64', USER_KEY = 'quality64_user';
export const DEFAULTS64 = Object.freeze({ nightly: true, weekly: true, runs: 3, maxMinutes: 180, interactiveWaitSec: 20, keepDays: 30 });
export const LIMITS64 = Object.freeze({ runs: [1, 5], maxMinutes: [15, 360], interactiveWaitSec: [5, 120], keepDays: [7, 180] });
const BOOLS = ['nightly', 'weekly'];

let testOverride = null;
/** Bare for tester: tving serververdier ({nightly:false, runs:1, …}). null = tilbake til det lagrede. */
export const _setQuality64 = (o) => { testOverride = o ? { ...o } : null; };

export function serverQuality64() {
  let raw = {};
  try { raw = kv.get(OWNER, SERVER_KEY, {}) ?? {}; } catch { /* standard */ }
  const out = {};
  for (const k of BOOLS) out[k] = typeof raw[k] === 'boolean' ? raw[k] : DEFAULTS64[k];
  for (const [k, [lo, hi]] of Object.entries(LIMITS64)) out[k] = Number.isInteger(raw[k]) && raw[k] >= lo && raw[k] <= hi ? raw[k] : DEFAULTS64[k];
  return testOverride ? { ...out, ...testOverride } : out;
}
export function userQuality64(user) {
  let raw = {};
  try { raw = (user ? kv.get(user, USER_KEY, {}) : {}) ?? {}; } catch { /* */ }
  return { weekly: typeof raw.weekly === 'boolean' ? raw.weekly : null };
}
/** Effektive brytere. → {nightly, weekly} */
export function quality64(user) {
  const s = serverQuality64(), u = userQuality64(user);
  return { nightly: s.nightly !== false, weekly: s.weekly !== false && u.weekly !== false };
}

/** PUT: {scope:'user', weekly} | {scope:'server', nightly?, weekly?, runs?, maxMinutes?, interactiveWaitSec?, keepDays?}. → {ok} | {error, status} */
export function saveQuality64(user, body, { admin = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Forventet {scope, …}', status: 400 };
  const scope = body.scope === 'server' ? 'server' : body.scope === 'user' || body.scope == null ? 'user' : null;
  if (!scope) return { error: 'scope må være user eller server', status: 400 };
  if (scope === 'server' && !admin) return { error: 'Bare administrator kan endre serverens valg', status: 403 };
  let cur = {};
  try { cur = { ...((scope === 'server' ? kv.get(OWNER, SERVER_KEY, {}) : kv.get(user, USER_KEY, {})) ?? {}) }; } catch { /* */ }
  if (scope === 'user') {
    for (const k of Object.keys(body)) if (k !== 'scope' && k !== 'weekly') return { error: `${k} kan bare settes av administrator (scope server)`, status: 400 };
    if (body.weekly !== undefined) {
      if (body.weekly !== null && typeof body.weekly !== 'boolean') return { error: 'weekly må være true, false eller null', status: 400 };
      if (body.weekly === null) delete cur.weekly; else cur.weekly = body.weekly;
    }
  } else {
    for (const k of BOOLS) {
      if (body[k] === undefined) continue;
      if (typeof body[k] !== 'boolean') return { error: `${k} må være true eller false`, status: 400 };
      cur[k] = body[k];
    }
    for (const [k, [lo, hi]] of Object.entries(LIMITS64)) {
      if (body[k] === undefined) continue;
      if (body[k] === null) { delete cur[k]; continue; }
      if (!Number.isInteger(body[k]) || body[k] < lo || body[k] > hi) return { error: `${k} må være et heltall ${lo}–${hi}`, status: 400 };
      cur[k] = body[k];
    }
  }
  kv.set(scope === 'server' ? OWNER : user, scope === 'server' ? SERVER_KEY : USER_KEY, cur);
  return { ok: true };
}
