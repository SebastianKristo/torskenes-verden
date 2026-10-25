// Prompt 60 (prompt 49 del 3, D3SRV): innstillingene for «bedre forståelse i samtaler». Tre brytere, hver for seg, standard PÅ:
//   state    – samtaletilstand per samtale («og i Bergen?», «flytt den til 11», «si opp det»)
//   entities – entitetsregisteret (personer, steder, butikker, abonnementer, faste hendelser med aliaser)
//   choices  – oppfølgingsspørsmål med konkrete valg (knapper) og forståelse av «den første»
// Effektiv verdi = server OG bruker (samme modell som fast59/settings.js). Serveren i kv(OWNER,'convo60'), brukeren i kv(bruker,'convo60_user').
// Se $S/SERVER60-API.md §5.
import { kv, OWNER } from '../db.js';

export const KEYS60 = ['state', 'entities', 'choices'];
export const LABELS60 = { state: 'Samtaletilstand', entities: 'Entitetsregister', choices: 'Valgknapper ved usikkerhet' };
export const HELP60 = {
  state: 'Glimt husker forrige spørsmål i samtalen, så «og i Bergen?» og «flytt den til 11» forstås. Utløper etter 30 min i søket på Hjem og 12 t i Chat.',
  entities: 'Personer, steder, butikker, abonnementer og faste hendelser med aliaser («hytta», «jobben»), brukt i minne, kalendersøk, vær og finans.',
  choices: 'Glimt spør med konkrete valg («Mener du A eller B?») i stedet for å gjette, og forstår «den første».',
};
const SERVER_KEY = 'convo60', USER_KEY = 'convo60_user';
const DEFAULTS = Object.freeze({ state: true, entities: true, choices: true });

let testOverride = null;
/** Bare for tester: tving verdier ({state:false, …}). null = tilbake til det lagrede. */
export const _setConvo60 = (o) => { testOverride = o ? { ...o } : null; };

export function serverConvo60() {
  let raw = {};
  try { raw = kv.get(OWNER, SERVER_KEY, {}) ?? {}; } catch { /* standard */ }
  return Object.fromEntries(KEYS60.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : DEFAULTS[k]]));
}
export function userConvo60(user) {
  let raw = {};
  try { raw = (user ? kv.get(user, USER_KEY, {}) : {}) ?? {}; } catch { /* */ }
  return Object.fromEntries(KEYS60.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : null]));
}
/** Effektive innstillinger. → {state, entities, choices} */
export function convo60(user) {
  const s = serverConvo60(), u = userConvo60(user);
  const out = Object.fromEntries(KEYS60.map((k) => [k, s[k] !== false && (u[k] ?? true) !== false]));
  return testOverride ? { ...out, ...testOverride } : out;
}

/** PUT: {scope:'user'|'server', state?, entities?, choices?}. → {ok} | {error, status} */
export function saveConvo60(user, body, { admin = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Forventet {scope, state?, entities?, choices?}', status: 400 };
  const scope = body.scope === 'server' ? 'server' : body.scope === 'user' || body.scope == null ? 'user' : null;
  if (!scope) return { error: 'scope må være user eller server', status: 400 };
  if (scope === 'server' && !admin) return { error: 'Bare administrator kan endre serverens valg', status: 403 };
  let cur = {};
  try { cur = { ...((scope === 'server' ? kv.get(OWNER, SERVER_KEY, {}) : kv.get(user, USER_KEY, {})) ?? {}) }; } catch { /* */ }
  for (const k of KEYS60) {
    if (body[k] === undefined) continue;
    if (scope === 'server' ? typeof body[k] !== 'boolean' : body[k] !== null && typeof body[k] !== 'boolean') return { error: `${k} må være true${scope === 'user' ? ', false eller null' : ' eller false'}`, status: 400 };
    if (body[k] === null) delete cur[k]; else cur[k] = body[k];
  }
  kv.set(scope === 'server' ? OWNER : user, scope === 'server' ? SERVER_KEY : USER_KEY, cur);
  return { ok: true };
}
