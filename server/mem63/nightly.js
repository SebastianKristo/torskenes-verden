// Prompt 63 (prompt 49 del 5, D5SRV): nattjobben «Nattlig oppsummering av minnet» – en systemoppgave i scheduleren fra del 2
// (glimt_schedules, kind 'memory', source 'system', hver dag kl. 03:00 Europe/Oslo). Den synes i «Faste oppgaver» og kan pauses.
// Én kjøring for én bruker (sched62/run.js kaller computeMemory63):
//   1. forslag fra dagens kilder (extract.js) → glimt_memory_pending (ALDRI rett inn i minnet),
//   2. motstrid-sjekk av nye forslag og av minnet (review.js) → glimt_memory_conflicts med spørsmål,
//   3. markering av fakta som ikke er brukt på lenge (telles; slettes aldri).
// Ingen push kl. 03: finnes det nye forslag/motstrid, sendes «Glimt har 3 forslag til minnet» om morgenen (kl. 07, morningPush63).
import { db, kv } from '../db.js';
import { mem63, staleDays63 } from './settings.js';
import { propose63 } from './extract.js';
import { insertPending63, pendingCounts63, conflictCounts63, staleOf63, MAX_PENDING63, iso63 } from './store.js';
import { checkPending63, scanMemory63, tidy63 } from './review.js';

const q = (sql) => db.prepare(sql);
export const SYSTEM_TITLE63 = 'Nattlig oppsummering av minnet';
export const SYSTEM_WHAT63 = 'oppsummer dagens samtaler og foreslå nye ting å huske';
export const PUSH_URL63 = '/#/innstillinger/glimt-husker';
export const PUSH_HOUR63 = 7;
const LAST_KEY = 'mem63_last', PUSH_KEY = 'mem63_push';

/* ---------------- Systemoppgaven ---------------- */

export const systemRow63 = (user) => q("SELECT * FROM glimt_schedules WHERE user_id=? AND kind='memory' AND source='system' ORDER BY created_at LIMIT 1").get(user) ?? null;
/** Sørger for at brukeren har systemoppgaven (kl. 03 hver natt). En pauset oppgave røres ikke. → raden */
export async function ensureSystem63(user, now = Date.now()) {
  const row = systemRow63(user);
  if (row) return row;
  const { insertSchedule62 } = await import('../sched62/store.js');
  const { osloParts62 } = await import('../glimt45/dates.js');
  const rule = { freq: 'DAILY', interval: 1, byday: [], bymonthday: [], bymonth: [], dtstart: osloParts62(now).date, time: '03:00', until: null };
  try {
    return insertSchedule62(user, { title: SYSTEM_TITLE63, what: SYSTEM_WHAT63, kind: 'memory', when: { text: 'hver natt kl. 03', rule, explicitTime: true }, condition: null, params: {},
      channel: 'push', source: 'system', label: 'Hver natt kl. 03:00', summary: 'Hver natt kl. 03:00 går Glimt gjennom dagens samtaler, rettelser og nye kalenderhendelser og foreslår ting å huske. Ingenting lagres før du godkjenner.' }, { now, quiet: false });
  } catch (e) { console.warn('[mem63] systemoppgave:', String(e?.message ?? e).slice(0, 160)); return null; }
}
export function ensureAllUsers63(now = Date.now()) {
  let users = [];
  try { users = q('SELECT id FROM users').pluck().all(); } catch { return 0; }
  for (const u of users) ensureSystem63(u, now).catch(() => {});
  return users.length;
}

/* ---------------- Kjøringen ---------------- */

export const lastRun63 = (user) => { try { return kv.get(user, LAST_KEY, null); } catch { return null; } };

/** Nattjobben for én bruker. → {status:'ok'|'skipped'|'failed', proposals, conflicts, stale, sources, model, reason?, at, ms} */
export async function nightly63(user, { now = Date.now(), useModel = true, trigger = 'schedule' } = {}) {
  const t0 = Date.now();
  const set = mem63(user);
  const out = { at: iso63(now), ms: 0, status: 'ok', proposals: 0, conflicts: 0, stale: 0, sources: { messages: 0, corrections: 0, events: 0 }, model: null, reason: null, trigger };
  try {
    if (!set.nightly && !set.conflicts && !set.stale) { out.status = 'skipped'; out.reason = 'Alt for «minnet holder seg ryddig» er slått av'; }
    else {
      if (set.nightly) {
        const open = pendingCounts63(user).pending;
        const r = await propose63(user, { now, useModel });
        out.sources = r.sources; out.model = r.model;
        if (r.modelError) out.reason = `Den lokale modellen svarte ikke (${r.modelError}) – bare faste mønstre brukt`;
        for (const p of r.proposals.slice(0, Math.max(0, MAX_PENDING63 - open))) {
          const row = insertPending63(user, p, now);
          out.proposals++;
          if (set.conflicts) await checkPending63(user, row, now);
        }
      } else out.reason = 'Nattlig oppsummering er av – bare motstrid/markering';
      if (set.conflicts) out.conflicts = await scanMemory63(user, now);
      // Nye motstrid fra forslagene telles også.
      out.conflicts = conflictCounts63(user).open;
      if (set.stale) out.stale = staleOf63(user, staleDays63(user), now).length;
      tidy63(user);
    }
  } catch (e) { out.status = 'failed'; out.reason = String(e?.message ?? e).slice(0, 300); }
  out.ms = Date.now() - t0;
  try { kv.set(user, LAST_KEY, out); } catch { /* */ }
  // Morgenvarselet: bare når det er noe nytt å se på.
  if (out.status === 'ok' && (out.proposals > 0 || out.conflicts > 0)) { try { kv.set(user, PUSH_KEY, { due: dayOf(now), at: now }); } catch { /* */ } }
  return out;
}

/** Fra scheduleren (sched62/run.js compute62 for kind 'memory'). Ingen levering kl. 03 – push kommer om morgenen. */
export async function computeMemory63(row, { now = Date.now() } = {}) {
  const r = await nightly63(row.user_id, { now });
  if (r.status === 'skipped') return { status: 'skipped', reason: r.reason, noDeliver: true };
  if (r.status === 'failed') return { status: 'failed', error: r.reason, noDeliver: true };
  const parts = [`${r.proposals} ${r.proposals === 1 ? 'nytt forslag' : 'nye forslag'}`, `${r.conflicts} motstrid`, `${r.stale} ikke brukt på lenge`];
  return { status: 'ok', result: `Minnet: ${parts.join(', ')}.${r.reason ? ` ${r.reason}.` : ''}`, noDeliver: true, private: true };
}

/* ---------------- Morgenvarselet ---------------- */

const dayOf = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).slice(0, 10);
const hourOf = (ms) => +new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo', hour12: false }).slice(11, 13);
let notifyImpl = null;
/** Bare for tester: falsk levering (user, msg) → {pushed}. */
export const _setNotify63 = (fn) => { notifyImpl = fn ?? null; };
export const pushText63 = (n, c) => (n > 0 ? `Glimt har ${n} ${n === 1 ? 'forslag' : 'forslag'} til minnet${c ? ` og ${c} motstrid å se på` : ''}` : `Glimt har ${c} motstrid i minnet å se på`);

/** Sender morgenvarselet for brukeren hvis det er klart (etter kl. 07 samme dag som nattjobben) og det fortsatt finnes noe åpent. → resultat | null */
export async function morningPush63(user, now = Date.now()) {
  let p = null;
  try { p = kv.get(user, PUSH_KEY, null); } catch { return null; }
  if (!p?.due || p.sent) return null;
  if (dayOf(now) < p.due || (dayOf(now) === p.due && hourOf(now) < PUSH_HOUR63)) return null;
  const n = pendingCounts63(user).pending, c = conflictCounts63(user).open;
  kv.set(user, PUSH_KEY, { ...p, sent: now });
  if (!n && !c) return { skipped: 'ingenting åpent' };
  const msg = { title: 'Glimt', body: pushText63(n, c), url: PUSH_URL63, tag: 'mem63', category: 'ai', data: { kind: 'memory.pending', pending: n, conflicts: c, deepLink: 'finanshub://glimt-husker' } };
  try { return notifyImpl ? await notifyImpl(user, msg) : await (await import('../notify.js')).notifyUser(user, msg, { now }); } catch (e) { return { error: String(e?.message ?? e).slice(0, 160) }; }
}
export async function morningPushAll63(now = Date.now()) {
  let users = [];
  try { users = q("SELECT user FROM kv WHERE key=?").pluck().all(PUSH_KEY); } catch { try { users = q('SELECT id FROM users').pluck().all(); } catch { return 0; } }
  let n = 0;
  for (const u of users) { const r = await morningPush63(u, now).catch(() => null); if (r && !r.skipped) n++; }
  return n;
}

let timer = null;
/** index.js: systemoppgaven for alle brukere (nå og hver time) og morgenvarselet (hvert 5. min). Ikke i NODE_ENV=test. */
export function startMem63() {
  if (timer || process.env.NODE_ENV === 'test') return false;
  setTimeout(() => ensureAllUsers63(), 25_000).unref?.();
  let ticks = 0;
  timer = setInterval(() => {
    if (++ticks % 12 === 0) ensureAllUsers63();
    morningPushAll63().catch(() => {});
  }, 5 * 60_000);
  timer.unref?.();
  return true;
}
