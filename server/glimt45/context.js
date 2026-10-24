// Prompt 47 (GLIMT47) Steg A – kontekstbygger (kode, ingen modell). Én kompakt kontekstblokk som legges i ALLE Glimt-kall
// (planlegger og svar): dato + ukedag + klokkeslett + tidssone (alltid med, ellers tror modellen det er treningsåret), kort profil
// (navn, by, språk), relevante minnefakta for akkurat denne meldingen (Steg B, memory47.js) og de siste 4–6 meldingene.
//
//   nowLine47(today, nowMin)      → «Nå: lørdag 24. oktober 2026 kl. 10:00 (Europe/Oslo)»
//   buildContext47(user, text, {today, nowMin, facts}) → {nowLine, profile, factsText, historyText, facts, terms}
//   rememberTurn47(user, text, reply) – kort samtalehistorikk per bruker (6 runder, 30 min), bare i kv for denne brukeren.
import { db, kv } from '../db.js';
import { WD45, MON45, todayOslo45, nowMinOslo45 } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
/** «Nå: lørdag 24. oktober 2026 kl. 10:00 (Europe/Oslo)». today/nowMin følger motorens (fryste) klokke. */
export function nowLine47(today = todayOslo45(), nowMin = nowMinOslo45()) {
  const x = new Date(`${today}T00:00:00Z`);
  return `Nå: ${WD45[x.getUTCDay()]} ${x.getUTCDate()}. ${MON45[x.getUTCMonth()]} ${x.getUTCFullYear()} kl. ${pad(Math.floor(nowMin / 60))}:${pad(nowMin % 60)} (Europe/Oslo)`;
}
/** ISO-tidspunkt for «nå» i Oslo (for modellen og tracen): 2026-10-24T10:00. */
export const nowIso47 = (today, nowMin) => `${today}T${pad(Math.floor(nowMin / 60))}:${pad(nowMin % 60)}`;

/** Kort fast profil: navn (fornavn), by (første lagrede værsted, ellers Oslo), språk. Ingen andre personopplysninger. */
export function profileOf47(user) {
  let name = '', city = 'Oslo';
  try { name = String(db.prepare('SELECT name FROM users WHERE id=?').pluck().get(user) ?? '').trim().split(/\s+/)[0] ?? ''; } catch { /* */ }
  if (!name) name = String(process.env.USER_NAME ?? '').trim().split(/\s+/)[0] ?? '';
  try { const l = kv.get(user, 'wx_places', null); if (Array.isArray(l) && l[0]?.name) city = String(l[0].name).slice(0, 40); } catch { /* */ }
  return { name: name.slice(0, 40), city, language: 'norsk (bokmål)' };
}

/* ---------------- Samtalehistorikk (kort) ---------------- */

const HIST = 'glimt47_hist';
const HIST_MS = 30 * 60_000;
const HIST_N = 6;
export function historyOf47(user) {
  try { const h = kv.get(user, HIST, null); return h && Date.now() - (h.at ?? 0) < HIST_MS ? (h.turns ?? []).slice(-HIST_N) : []; } catch { return []; }
}
export function rememberTurn47(user, text, reply) {
  try {
    const turns = [...historyOf47(user), { u: String(text ?? '').slice(0, 300), a: String(reply ?? '').replace(/\*\*/g, '').slice(0, 300) }].slice(-HIST_N);
    kv.set(user, HIST, { at: Date.now(), turns });
  } catch { /* best effort */ }
}
export const clearHistory47 = (user) => { try { kv.set(user, HIST, null); } catch { /* */ } };

/**
 * Kontekstblokken. facts = resultatet fra recallFacts47 (memory47.js): [{subject, object, aliases, why}].
 * → {nowLine, profile, profileText, factsText, historyText, facts, terms}
 */
export function buildContext47(user, text, { today = todayOslo45(), nowMin = nowMinOslo45(), facts = [], history = null } = {}) {
  const nowLine = nowLine47(today, nowMin);
  const profile = profileOf47(user);
  const profileText = `User: ${profile.name || 'the user'}, lives in ${profile.city}, speaks ${profile.language}.`;
  const factsText = facts.length ? facts.map((f) => `- ${f.subject} = ${f.object}${f.aliases?.length ? ` (also: ${f.aliases.slice(0, 6).join(', ')})` : ''}`).join('\n') : '';
  const turns = history ?? historyOf47(user);
  const historyText = turns.map((t) => `User: ${t.u}\nGlimt: ${t.a}`).join('\n');
  const terms = [...new Set(facts.flatMap((f) => [f.subject, f.object, ...(f.aliases ?? [])]).filter(Boolean))];
  return { nowLine, profile, profileText, factsText, historyText, facts, terms };
}
/** Kontekstblokken som tekst (modellkallene). parts kan være trimmet av fitParts47. */
export function contextBlock47(c, parts = {}) {
  const facts = parts.facts ?? c.factsText, hist = parts.history ?? c.historyText;
  return [`${c.nowLine}.`, c.profileText, facts ? `Memory facts (from the user):\n${facts}` : '', hist ? `Recent conversation:\n${hist}` : ''].filter(Boolean).join('\n');
}
