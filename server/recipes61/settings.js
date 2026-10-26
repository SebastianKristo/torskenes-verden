// Prompt 61 (prompt 49 del 1, D1SRV): innstillingene for «Glimt lærer» (oppskrifter). Fire brytere, hver for seg, standard PÅ:
//   save    – lagre oppskrifter fra vellykkede kjøringer (og telle bruk/suksess/feil)
//   fewshot – lignende oppskrifter som eksempler til planleggeren (maks 3, ca. 600 tokens)
//   fast    – hurtigvei: hopp over planleggeren ved svært lik forespørsel (strenge krav, se engine61.js)
//   learn   – lær av rettelser («nei, jeg mente …»): negativt eksempel, ny kandidat, testtilfelle i eval/learned/
// Effektiv verdi = server OG bruker (samme modell som convo60/settings.js). Serveren i kv(OWNER,'recipes61'), brukeren i
// kv(bruker,'recipes61_user'). Se $S/SERVER61-API.md §6.
import { kv, OWNER } from '../db.js';

export const KEYS61 = ['save', 'fewshot', 'fast', 'learn'];
export const LABELS61 = { save: 'Lagre oppskrifter', fewshot: 'Bruk som eksempler', fast: 'Hurtigvei', learn: 'Lær av rettelser' };
export const HELP61 = {
  save: 'Når Glimt løser noe riktig, lagres hvordan (planen med variabler som {person} og {when}). Bare lokalt i databasen.',
  fewshot: 'Lignende oppskrifter (maks 3) gis til planleggeren som eksempler før de faste.',
  fast: 'Svært like forespørsler (likhet ≥ 0,92, aktiv oppskrift med minst 5 vellykkede bruk og ingen feil de siste 10) hopper over planleggeren. Aldri for handlinger som endrer data uten at det er slått på for oppskriften.',
  learn: '«Nei, jeg mente …» lagrer feil og riktig plan, lager en ny oppskrift og et testtilfelle for eval.',
};
const SERVER_KEY = 'recipes61', USER_KEY = 'recipes61_user';
const DEFAULTS = Object.freeze({ save: true, fewshot: true, fast: true, learn: true });

let testOverride = null;
/** Bare for tester: tving verdier ({fast:false, …}). null = tilbake til det lagrede. */
export const _setRecipes61 = (o) => { testOverride = o ? { ...o } : null; };

// I testene (NODE_ENV=test) er del 1 av som standard: mange tester stiller samme spørsmål flere ganger med falske planleggere i samme
// prosess, og oppskriftene ville endret planleggerens prompt. Eval (eval/worker.mjs) setter RECIPES61_DEFAULTS=prod (alt på).
const OFF = Object.freeze({ save: false, fewshot: false, fast: false, learn: false });
const defaults = () => (process.env.NODE_ENV === 'test' && process.env.RECIPES61_DEFAULTS !== 'prod' ? OFF : DEFAULTS);

export function serverRecipes61() {
  let raw = {};
  try { raw = kv.get(OWNER, SERVER_KEY, {}) ?? {}; } catch { /* standard */ }
  const d = defaults();
  return Object.fromEntries(KEYS61.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : d[k]]));
}
export function userRecipes61(user) {
  let raw = {};
  try { raw = (user ? kv.get(user, USER_KEY, {}) : {}) ?? {}; } catch { /* */ }
  return Object.fromEntries(KEYS61.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : null]));
}
/** Effektive innstillinger. → {save, fewshot, fast, learn} */
export function recipes61(user) {
  const s = serverRecipes61(), u = userRecipes61(user);
  const out = Object.fromEntries(KEYS61.map((k) => [k, s[k] !== false && (u[k] ?? true) !== false]));
  return testOverride ? { ...out, ...testOverride } : out;
}
export const anyOn61 = (set) => KEYS61.some((k) => set[k]);

/** PUT: {scope:'user'|'server', save?, fewshot?, fast?, learn?}. → {ok} | {error, status} */
export function saveRecipes61(user, body, { admin = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Forventet {scope, save?, fewshot?, fast?, learn?}', status: 400 };
  const scope = body.scope === 'server' ? 'server' : body.scope === 'user' || body.scope == null ? 'user' : null;
  if (!scope) return { error: 'scope må være user eller server', status: 400 };
  if (scope === 'server' && !admin) return { error: 'Bare administrator kan endre serverens valg', status: 403 };
  let cur = {};
  try { cur = { ...((scope === 'server' ? kv.get(OWNER, SERVER_KEY, {}) : kv.get(user, USER_KEY, {})) ?? {}) }; } catch { /* */ }
  for (const k of KEYS61) {
    if (body[k] === undefined) continue;
    if (scope === 'server' ? typeof body[k] !== 'boolean' : body[k] !== null && typeof body[k] !== 'boolean') return { error: `${k} må være true${scope === 'user' ? ', false eller null' : ' eller false'}`, status: 400 };
    if (body[k] === null) delete cur[k]; else cur[k] = body[k];
  }
  kv.set(scope === 'server' ? OWNER : user, scope === 'server' ? SERVER_KEY : USER_KEY, cur);
  return { ok: true };
}
