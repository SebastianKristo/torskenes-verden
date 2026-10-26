// Prompt 62 (prompt 49 del 2, D2SRV): innstillingene for planlagte oppgaver («Faste oppgaver»). Tre brytere, standard PÅ:
//   enabled    – planlagte oppgaver totalt (av = ingen kjøringer, Glimt lager ingen nye)
//   conditions – betingede varsler («si fra hvis strømprisen går over 2 kr») – av = de hoppes over (logget)
//   quiet      – stille timer 23–07 for oppgaver uten eget klokkeslett (flyttes til 07:00)
// + zone (bare bruker): standard prisområde for strøm (NO1–NO5, standard NO1 / Home Assistant-sonen).
// Effektiv verdi = server OG bruker (samme modell som recipes61/convo60). Serveren i kv(OWNER,'sched62'), brukeren i kv(bruker,'sched62_user').
import { kv, OWNER } from '../db.js';
import { homeZone, ZONES } from '../power-price.js';

export const KEYS62 = ['enabled', 'conditions', 'quiet'];
export const LABELS62 = { enabled: 'Planlagte oppgaver', conditions: 'Betingede varsler', quiet: 'Stille timer 23–07' };
export const HELP62 = {
  enabled: 'Glimt kan gjøre ting til faste tider («Send meg strømprisene hver morgen kl. 7»). Av: ingen kjøringer og ingen nye oppgaver.',
  conditions: 'Varsler med betingelse («si fra hvis strømprisen går over 2 kr i morgen»). Betingelsen sjekkes i koden med ekte data – modellen vurderer den aldri.',
  quiet: 'Oppgaver uten eget klokkeslett kjøres ikke mellom 23 og 07 (flyttes til 07:00). Ber du om et klokkeslett, gjelder det.',
};
const SERVER_KEY = 'sched62', USER_KEY = 'sched62_user';
const DEFAULTS = Object.freeze({ enabled: true, conditions: true, quiet: true });

let testOverride = null;
/** Bare for tester: tving verdier ({enabled:false, …}). null = tilbake til det lagrede. */
export const _setSched62 = (o) => { testOverride = o ? { ...o } : null; };

export function serverSched62() {
  let raw = {};
  try { raw = kv.get(OWNER, SERVER_KEY, {}) ?? {}; } catch { /* standard */ }
  return Object.fromEntries(KEYS62.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : DEFAULTS[k]]));
}
export function userSched62(user) {
  let raw = {};
  try { raw = (user ? kv.get(user, USER_KEY, {}) : {}) ?? {}; } catch { /* */ }
  return Object.fromEntries(KEYS62.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : null]));
}
/** Effektive innstillinger. → {enabled, conditions, quiet} */
export function sched62(user) {
  const s = serverSched62(), u = userSched62(user);
  const out = Object.fromEntries(KEYS62.map((k) => [k, s[k] !== false && (u[k] ?? true) !== false]));
  return testOverride ? { ...out, ...testOverride } : out;
}
/** Brukerens prisområde for strøm (NO1–NO5). */
export function zone62(user) {
  let z = null;
  try { z = user ? kv.get(user, USER_KEY, {})?.zone ?? null : null; } catch { /* */ }
  return ZONES[z] ? z : homeZone();
}

/** PUT: {scope:'user'|'server', enabled?, conditions?, quiet?, zone?}. → {ok} | {error, status} */
export function saveSched62(user, body, { admin = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Forventet {scope, enabled?, conditions?, quiet?, zone?}', status: 400 };
  const scope = body.scope === 'server' ? 'server' : body.scope === 'user' || body.scope == null ? 'user' : null;
  if (!scope) return { error: 'scope må være user eller server', status: 400 };
  if (scope === 'server' && !admin) return { error: 'Bare administrator kan endre serverens valg', status: 403 };
  let cur = {};
  try { cur = { ...((scope === 'server' ? kv.get(OWNER, SERVER_KEY, {}) : kv.get(user, USER_KEY, {})) ?? {}) }; } catch { /* */ }
  for (const k of KEYS62) {
    if (body[k] === undefined) continue;
    if (scope === 'server' ? typeof body[k] !== 'boolean' : body[k] !== null && typeof body[k] !== 'boolean') return { error: `${k} må være true${scope === 'user' ? ', false eller null' : ' eller false'}`, status: 400 };
    if (body[k] === null) delete cur[k]; else cur[k] = body[k];
  }
  if (body.zone !== undefined) {
    if (scope !== 'user') return { error: 'zone kan bare settes for brukeren', status: 400 };
    if (body.zone === null) delete cur.zone;
    else if (!ZONES[body.zone]) return { error: `zone må være ${Object.keys(ZONES).join(', ')}`, status: 400 };
    else cur.zone = body.zone;
  }
  kv.set(scope === 'server' ? OWNER : user, scope === 'server' ? SERVER_KEY : USER_KEY, cur);
  return { ok: true };
}
