// Prompt 64 (prompt 49 del 7, D7SRV): systemoppgavene i scheduleren fra del 2 (glimt_schedules, source 'system', som minnejobben i del 5):
//   «Nattlig eval» – kind 'quality', én rad (første admin), hver natt kl. 02:00 Europe/Oslo (før minnejobben kl. 03)
//   «Ukerapport»   – kind 'weekly', én rad per bruker, søndag kl. 20:00
// De synes i «Faste oppgaver», kan pauses (ikke slettes/endres), og en pauset oppgave settes aldri på igjen automatisk.
// sched62/run.js kaller computeSystem64 for kind 'quality'/'weekly'. Nattevalen startes og går i bakgrunnen (scheduleren venter ikke).
import { db } from '../db.js';
import { quality64, serverQuality64 } from './settings.js';
import { startEval64 } from './evalrun.js';
import { weeklyPush64, ingest64 } from './weekly.js';
import { adminUsers64 } from './notify64.js';

const q = (sql) => db.prepare(sql);
export const SYSTEM64 = Object.freeze({
  quality: { title: 'Nattlig eval', what: 'kjør eval-testene mot den lokale modellen og varsle hvis noe grønt har blitt rødt', time: '02:00', freq: 'DAILY', byday: [],
    text: 'hver natt kl. 02', label: 'Hver natt kl. 02:00',
    summary: 'Hver natt kl. 02 kjører serveren eval-testene (også de lærte fra rettelser) mot den lokale modellen. Du får bare varsel når en test som var grønn har blitt rød.' },
  weekly: { title: 'Ukerapport', what: 'send ukerapporten for Glimt', time: '20:00', freq: 'WEEKLY', byday: ['SU'], text: 'hver søndag kl. 20', label: 'Hver søndag kl. 20:00',
    summary: 'Søndag kveld får du én kort melding om uka med Glimt: forespørsler, andel løst på første forsøk, rettelser, nye oppskrifter, hurtigvei og median svartid.' },
});

export const systemRow64 = (user, kind) => q("SELECT * FROM glimt_schedules WHERE user_id=? AND kind=? AND source='system' ORDER BY created_at LIMIT 1").get(user, kind) ?? null;
export const qualityRow64 = () => q("SELECT * FROM glimt_schedules WHERE kind='quality' AND source='system' ORDER BY created_at LIMIT 1").get() ?? null;

async function insert(user, kind, now) {
  const s = SYSTEM64[kind];
  const [{ insertSchedule62 }, { osloParts62 }] = await Promise.all([import('../sched62/store.js'), import('../glimt45/dates.js')]);
  const rule = { freq: s.freq, interval: 1, byday: s.byday, bymonthday: [], bymonth: [], dtstart: osloParts62(now).date, time: s.time, until: null };
  try {
    return insertSchedule62(user, { title: s.title, what: s.what, kind, when: { text: s.text, rule, explicitTime: true }, condition: null, params: {}, channel: 'push', source: 'system',
      label: s.label, summary: s.summary }, { now, quiet: false });
  } catch (e) { console.warn(`[quality64] systemoppgave ${kind}:`, String(e?.message ?? e).slice(0, 160)); return null; }
}
/** Ukerapporten for brukeren (og nattevalen hvis brukeren er første admin og ingen har den). → {weekly, quality} */
export async function ensureSystem64(user, now = Date.now()) {
  const weekly = systemRow64(user, 'weekly') ?? (await insert(user, 'weekly', now));
  let quality = qualityRow64();
  if (!quality && adminUsers64()[0] === user) quality = await insert(user, 'quality', now);
  return { weekly, quality };
}
export async function ensureAllUsers64(now = Date.now()) {
  let users = [];
  try { users = q('SELECT id FROM users ORDER BY created').pluck().all(); } catch { return 0; }
  const admin = adminUsers64()[0];
  if (admin) await ensureSystem64(admin, now).catch(() => {});
  for (const u of users) if (u !== admin) await ensureSystem64(u, now).catch(() => {});
  return users.length;
}

/** Fra scheduleren (sched62/run.js compute62). Ingen levering derfra – push sendes her ved behov. */
export async function computeSystem64(row, { now = Date.now() } = {}) {
  if (row.kind === 'quality') {
    if (!serverQuality64().nightly) return { status: 'skipped', reason: 'Nattlig eval er slått av', noDeliver: true };
    const r = await startEval64({ trigger: 'schedule', user: row.user_id });
    if (r.error) return { status: 'skipped', reason: r.error, noDeliver: true };
    if (r.run.status === 'skipped') return { status: 'skipped', reason: r.run.reason, noDeliver: true };
    return { status: 'ok', result: `Nattlig eval startet (${r.run.id}) – resultatet kommer i Kvalitet. Varsel bare ved regresjon.`, noDeliver: true };
  }
  if (row.kind === 'weekly') {
    if (!quality64(row.user_id).weekly) return { status: 'skipped', reason: 'Ukerapport er slått av', noDeliver: true };
    const r = await weeklyPush64(row.user_id, now);
    if (r.skipped) return { status: 'skipped', reason: r.skipped, noDeliver: true };
    return { status: r.sent ? 'ok' : 'failed', result: r.text, noDeliver: true, ...(r.sent ? {} : { error: 'Fikk ikke sendt varselet' }) };
  }
  return { status: 'failed', error: `Ukjent systemoppgave ${row.kind}`, noDeliver: true };
}

let timer = null;
/** index.js: systemoppgavene for alle brukere (nå og hver time) og innsamling fra sporene (hver time). Ikke i NODE_ENV=test. */
export function startQuality64() {
  if (timer || process.env.NODE_ENV === 'test') return false;
  setTimeout(() => { ensureAllUsers64().catch(() => {}); try { ingest64(); } catch { /* */ } }, 30_000).unref?.();
  timer = setInterval(() => { ensureAllUsers64().catch(() => {}); try { ingest64(); } catch { /* */ } }, 3600_000);
  timer.unref?.();
  return true;
}
