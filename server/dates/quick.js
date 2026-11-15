// Rask-avtaler («tannlege fredag halv tre») på serveren: web-tolkeren public/js/quick-time.js finner tittel, type, sted og varighet,
// mens dato og klokkeslett kommer fra den felles tolkeren (dates/parse.js), så serveren lagrer samme dato uansett inngang (Q17, Q37).
// Web-klienten bruker quick-time.js direkte til Fase 3; serverrutene importerer parseQuick herfra.
import { parseQuick as parseQuickWeb, NO_DATE, NO_TIME } from '../../public/js/quick-time.js';
import { whenOf, addMin } from './parse.js';
import { today as osloToday, nowMinutes } from './oslo.js';

const INTENT = /(^|[^a-zæøå])(time|timen|timeavtale|avtale|avtalen|legg til|book|booke|booket|bestill|bestilt|bestille)([^a-zæøå]|$)/; // som quick-time.js
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const todayOf = (t) => (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : t instanceof Date ? osloToday(t) : osloToday());

/**
 * Samme form som quick-time.js parseQuick: {ok, why?, title, date, start, end, place, type, duration, allDay, confidence, isAppointment, …}.
 * opts.nowMin: minutter etter midnatt i Oslo (standard nå), for «kl 9» uten dato (i dag eller i morgen) og ukedag i dag med passert tid.
 * opts.timeWithoutDate: 'today' (Q37: i dag, eller i morgen hvis tiden har passert) eller 'none' (ingen dato: Rask-køen lager avtalen
 * uten å spørre, så der må brukeren velge dato selv i stedet for at serveren gjetter).
 */
export function parseQuick(text, todayISO, memory, { nowMin = null, timeWithoutDate = 'today' } = {}) {
  const r = parseQuickWeb(text, todayISO, memory);
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src) return r;
  const today = todayOf(todayISO);
  const w = whenOf(src, today, { prefer: 'future', nowMin: nowMin ?? nowMinutes(), timeWithoutDate });
  if (w.errors.length || (!w.date && !w.start)) return r;
  const out = { ...r };
  if (w.date) out.date = w.date;
  if (w.start) {
    if (w.start !== r.start) out.end = w.end ?? addMin(w.start, out.duration ?? 60);
    else if (w.end) out.end = w.end;
    out.start = w.start;
  } else if (r.start && w.dateRaw && r.start.endsWith(':00') && new RegExp(`(^|\\D)0?${+r.start.slice(0, 2)}(\\D|$)`).test(w.dateRaw)) {
    out.start = null; out.end = null; // web-tolkeren tok dagen i «15. mars» som kl. 15
  }
  // Uttrykket web-tolkeren ikke kjente («overmorgen», «fredag om to uker»), skal ikke bli stående i tittelen.
  for (const raw of [w.dateRaw, w.timeRaw]) {
    if (raw && out.title && new RegExp(`(^|\\s)${escRe(raw)}(?=\\s|$)`, 'i').test(out.title)) {
      out.title = out.title.replace(new RegExp(`(^|\\s)${escRe(raw)}(?=\\s|$)`, 'i'), ' ').replace(/\s+/g, ' ').trim();
      out.title = out.title ? out.title.charAt(0).toUpperCase() + out.title.slice(1) : r.title;
    }
  }
  if (out.date) {
    out.allDay = !out.start;
    if (!r.ok) { // samme poeng som web-tolkeren gir for dato (+0,3) og klokkeslett (+0,2)
      out.ok = true;
      out.confidence = Math.round(Math.min(0.95, (r.confidence ?? 0.3) + 0.3 + (out.start && !r.start ? 0.2 : 0)) * 100) / 100;
      out.isAppointment = INTENT.test(src.toLowerCase()) || r.type !== 'annet' || !!r.memory || !!(r.business && out.start);
    }
    if (out.start) delete out.why; else out.why = NO_TIME;
  } else if (!out.ok) out.why = NO_DATE;
  return out;
}

export { quickLabel, osloTodayISO, TYPES, DURATION, NO_DATE, NO_TIME, memoryMatch, aliasTitle, isNoiseLine, senderOf, KINDS } from '../../public/js/quick-time.js';
