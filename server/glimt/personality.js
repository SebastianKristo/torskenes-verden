// Prompt 45 (GLIMT45): Glimts personlighet – en god nordmann og monarkist, og en liten rakker og moroknarkist.
// Regler: bekreftelsen (hva som faktisk skjedde) kommer først, så maks én kort spøk. Ingen spøk ved feil, spørsmål tilbake,
// sletting, økonomi eller alvorlige tema. Innstilling per bruker: off | little (standard) | full.
import { kv } from '../db.js';

export const PERSONALITIES = ['off', 'little', 'full'];
export const PERSONALITY_LABELS = { off: 'Av', little: 'Litt', full: 'Full rakker' };
const KEY = 'glimt45_personality';
export function personalityOf(user) { const v = kv.get(user, KEY, null); return PERSONALITIES.includes(v) ? v : 'little'; }
export function setPersonality(user, v) { if (!PERSONALITIES.includes(v)) throw Object.assign(new Error('personality må være off, little eller full'), { status: 400 }); kv.set(user, KEY, v); return v; }

const SERIOUS = /sykehus|begravelse|bisettelse|død|dødsfall|kreft|sykdom|syk\b|legevakt|psykolog|lege|tannlege|operasjon|skilsmisse|politi|advokat|nav\b|gjeld|inkasso|purring|sorg|minnestund/i;
const QUIPS = {
  calendar: ['Kongen ville vært stolt av den planleggingen.', 'Notert med kongelig presisjon.', 'Kalenderen takker og bukker.', 'Ryddig som et 17. mai-tog.', 'Jeg har satt av plass – og kanskje litt popcorn.'],
  movie: ['Popcorn er ikke inkludert, men sterkt anbefalt.', 'Husk å slå av lyden på telefonen. Jeg skal være stille, lover.'],
  tasks: ['Ikke glem brunosten.', 'Jeg holder et øye med den. Kanskje to.', 'Lagt i lista – den blir ikke kortere av seg selv.', 'Kongen gjør også gjøremål. Tror jeg.'],
  milk: ['Ikke glem brunosten.', 'Melk uten brunost er bare halve jobben.'],
  done: ['Hurra! Et kryss til.', 'Ferdig! Det fortjener en vaffel.'],
  list: ['Det er det hele. Resten av tida er din.', 'Kongen har sikkert travlere uker. Litt.'],
  search: ['Snoket ferdig.', 'Funnet – uten å rote i skuffene dine.'],
};
const SPECIAL = { '05-17': 'Hipp hurra for 17. mai!', '02-21': 'Og gratulerer med dagen til Kongen!', '07-04': 'Gratulerer med dagen til Dronningen!', '06-07': 'Og god 7. juni – unionen er oppløst og kalenderen i orden.', '12-24': 'God jul!' };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * Én kort spøk eller null. outcome = {kind:'calendar'|'tasks'|'done'|'list'|'search'|null, ok, destructive, finance, ask, title}
 * Deterministisk (seed = requestId) så samme forespørsel gir samme svar.
 */
export function quipFor(level, outcome, { seed = '', today = '' } = {}) {
  if (level === 'off' || !outcome?.ok || outcome.ask || outcome.destructive || outcome.finance || !outcome.kind) return null;
  if (SERIOUS.test(String(outcome.title ?? ''))) return null;
  const h = hash(`${seed}|${outcome.kind}`);
  const special = SPECIAL[String(today).slice(5, 10)];
  if (special && (level === 'full' || outcome.kind === 'calendar' || outcome.kind === 'tasks')) return special;
  // Litt: omtrent hver tredje vellykkede handling. Full rakker: hver gang.
  if (level === 'little' && h % 3 !== 0) return null;
  let pool = QUIPS[outcome.kind] ?? null;
  if (outcome.kind === 'calendar' && /kino|film|dune/i.test(outcome.title ?? '')) pool = QUIPS.movie;
  if (outcome.kind === 'tasks' && /melk/i.test(outcome.title ?? '')) pool = QUIPS.milk;
  if (!pool) return null;
  return pool[(h >>> 3) % pool.length];
}
/** Systemtekst til modellen (bare stil – fakta og bekreftelse lages av koden). */
export const PERSONA_PROMPT = 'Du er Glimt: varm, kvikk, en god nordmann og monarkist, en liten rakker. Korte svar på norsk bokmål.';
