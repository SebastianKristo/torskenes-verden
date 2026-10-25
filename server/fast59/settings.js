// Prompt 59 (prompt 49 del 4, D4SRV): innstillingene for «raskere svar». Fire brytere, hver for seg, standard PÅ:
//   cache    – svar-cache med utløp per datatype (server + bruker)
//   warm     – hold hovedmodellen varm (bare server/admin)
//   stream   – strømming i Glimt (SSE, server + bruker)
//   parallel – parallelle verktøykall for uavhengige lesesteg (server + bruker)
// Effektiv verdi = server OG bruker. Serveren i kv(OWNER,'fast59'), brukerens egne valg i kv(bruker,'fast59_user') (null = følg serveren).
// Se $S/SERVER59-API.md §2.
import { kv, OWNER } from '../db.js';

export const FAST_KEYS59 = ['cache', 'warm', 'stream', 'parallel'];
export const USER_KEYS59 = ['cache', 'stream', 'parallel'];
export const FAST_LABELS59 = { cache: 'Svar-cache', warm: 'Varm modell', stream: 'Strømming', parallel: 'Parallelle verktøy' };
export const FAST_HELP59 = {
  cache: 'Gjenbruker ferske svar: vær 15 min, strømpris til neste hele time, nettsøk og nyheter 30 min. Kalender, gjøremål, finans, minne og alt som endrer data caches aldri.',
  warm: 'Holder hovedmodellen lastet: varmes opp ved oppstart og etter bildejobber (visjonsmodellen), med lang keep_alive. Bakgrunnsprioritet.',
  stream: 'Glimt viser svaret ord for ord og en statuslinje mens verktøyene jobber.',
  parallel: 'Uavhengige oppslag (kalender, vær, finans, nettsøk) kjøres samtidig. Modellkall går fortsatt ett om gangen.',
};
const SERVER_KEY = 'fast59', USER_KEY = 'fast59_user';
const DEFAULTS = Object.freeze({ cache: true, warm: true, stream: true, parallel: true });

let testOverride = null;
/** Bare for tester: tving verdier ({cache:false, …}) uansett lagret valg. null = tilbake til det lagrede. */
export const _setFast59 = (o) => { testOverride = o ? { ...o } : null; };

// I testene (NODE_ENV=test) er svar-cachen av som standard: mange tester stiller samme spørsmål med ulike falske modeller/data i
// samme prosess. Eval (eval/worker.mjs) setter FAST59_DEFAULTS=prod og måler med produksjonens standard (alt på).
const defaults = () => (process.env.NODE_ENV === 'test' && process.env.FAST59_DEFAULTS !== 'prod' ? { ...DEFAULTS, cache: false } : DEFAULTS);
export function serverFast59() {
  let raw = {};
  try { raw = kv.get(OWNER, SERVER_KEY, {}) ?? {}; } catch { /* standard */ }
  const d = defaults();
  return Object.fromEntries(FAST_KEYS59.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : d[k]]));
}
export function userFast59(user) {
  let raw = {};
  try { raw = (user ? kv.get(user, USER_KEY, {}) : {}) ?? {}; } catch { /* */ }
  return Object.fromEntries(USER_KEYS59.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : null]));
}
/** Effektive innstillinger for brukeren. → {cache, warm, stream, parallel} */
export function fast59(user) {
  const s = serverFast59(), u = userFast59(user);
  const out = Object.fromEntries(FAST_KEYS59.map((k) => [k, s[k] !== false && (u[k] ?? true) !== false]));
  return testOverride ? { ...out, ...testOverride } : out;
}
export const fastOn59 = (user, k) => !!fast59(user)[k];

/** PUT: {scope:'user'|'server', cache?, stream?, parallel?, warm?}. → {ok} | {error, status} */
export function saveFast59(user, body, { admin = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Forventet {scope, cache?, warm?, stream?, parallel?}', status: 400 };
  const scope = body.scope === 'server' ? 'server' : body.scope === 'user' || body.scope == null ? 'user' : null;
  if (!scope) return { error: 'scope må være user eller server', status: 400 };
  if (scope === 'server') {
    if (!admin) return { error: 'Bare administrator kan endre serverens valg', status: 403 };
    let cur = {};
    try { cur = { ...(kv.get(OWNER, SERVER_KEY, {}) ?? {}) }; } catch { /* */ } // bare det som er valgt lagres (standarden kan endres senere)
    for (const k of FAST_KEYS59) {
      if (body[k] === undefined) continue;
      if (typeof body[k] !== 'boolean') return { error: `${k} må være true eller false`, status: 400 };
      cur[k] = body[k];
    }
    kv.set(OWNER, SERVER_KEY, cur);
    return { ok: true };
  }
  if (body.warm !== undefined) return { error: 'Varm modell er en serverinnstilling (scope server, admin)', status: 400 };
  const cur = userFast59(user);
  for (const k of USER_KEYS59) {
    if (body[k] === undefined) continue;
    if (body[k] !== null && typeof body[k] !== 'boolean') return { error: `${k} må være true, false eller null`, status: 400 };
    cur[k] = body[k];
  }
  kv.set(user, USER_KEY, cur);
  return { ok: true };
}
