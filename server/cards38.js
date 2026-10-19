// Prompt 38 (SERVER38): rekkefølge og av/på for kortene i Now Brief (Innstillinger → Glimt → Brief), og bryteren for
// nordlysvarselet kl. 20. Lagres per bruker i kv (brief38_cards, brief38_aurora_notify). Brukes av GET/PUT /api/glimt/settings
// (glimt35.js) og briefen (brief38.js). Ingen andre avhengigheter enn kv, så glimt35 kan importere den uten løkker.
import { kv } from './db.js';

/** Alle kortene i standard rekkefølge. De nye (prompt 38) ligger etter Abonnementer og før Nyheter. */
export const CARD_IDS = ['weather', 'calendar', 'todos', 'dinner', 'trials', 'packages', 'family', 'school', 'birthdays', 'aurora', 'news', 'bible'];
export const CARD_LABELS = { weather: 'Vær', calendar: 'Kalender', todos: 'Gjøremål', dinner: 'Middag', trials: 'Abonnementer', packages: 'Pakker', family: 'Familie',
  school: 'Skole og jobb', birthdays: 'Bursdager', aurora: 'Nordlys i natt', news: 'Nyheter', bible: 'Bibelvers' };

/** [{id, on, label}] i brukerens rekkefølge. Kort som mangler i det lagrede (nye kort) legges til sist i standardrekkefølge, på. */
export function cardsOf(u) {
  const saved = kv.get(u, 'brief38_cards', null);
  const list = Array.isArray(saved) ? saved.filter((x) => CARD_IDS.includes(x?.id)) : [];
  const out = list.map((x) => ({ id: x.id, on: x.on !== false }));
  for (const id of CARD_IDS) if (!out.some((x) => x.id === id)) out.push({ id, on: true });
  return out.map((x) => ({ ...x, label: CARD_LABELS[x.id] }));
}
export const cardOn = (u, id) => cardsOf(u).find((x) => x.id === id)?.on !== false;

/** Renser cards fra klienten. → {cards, errors}. Godtar [{id, on}] eller ['id', …] (alle på). Ukjente id-er gir feil. */
export function cleanCards(v) {
  const errors = [];
  if (!Array.isArray(v)) return { cards: null, errors: ['cards må være en liste [{id, on}]'] };
  const seen = new Set(), cards = [];
  for (const x of v) {
    const id = typeof x === 'string' ? x : x?.id;
    if (!CARD_IDS.includes(id)) { errors.push(`Ukjent kort ${id} (${CARD_IDS.join(', ')})`); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const on = typeof x === 'string' ? true : x.on;
    if (on !== undefined && typeof on !== 'boolean') { errors.push(`cards.${id}.on må være true eller false`); continue; }
    cards.push({ id, on: on !== false });
  }
  return { cards, errors };
}
export const saveCards = (u, cards) => kv.set(u, 'brief38_cards', cards.map(({ id, on }) => ({ id, on })));
export const auroraNotifyOf = (u) => kv.get(u, 'brief38_aurora_notify', true) !== false;
export const setAuroraNotify = (u, on) => kv.set(u, 'brief38_aurora_notify', !!on);
