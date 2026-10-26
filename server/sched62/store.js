// Prompt 62 (prompt 49 del 2, D2SRV): lagring av planlagte oppgaver (`glimt_schedules`) og kjøringer (`glimt_schedule_runs`).
// Additiv migrering: tabellene opprettes hvis de mangler, og kolonner som mangler legges til (aldri endret/slettet). Per bruker, lokalt.
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { ruleOfWhen62, nextRun62, nextRuns62, afterQuiet62, quiet62, labelOf62, ruleToRRule62, icalOf62, osloParts62 } from '../glimt45/dates.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS glimt_schedules (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  title TEXT NOT NULL, what TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'query', when_text TEXT, rrule TEXT, dtstart TEXT NOT NULL, tz TEXT NOT NULL DEFAULT 'Europe/Oslo',
  until TEXT, explicit_time INTEGER NOT NULL DEFAULT 0, condition TEXT, params TEXT NOT NULL DEFAULT '{}', channel TEXT NOT NULL DEFAULT 'push',
  status TEXT NOT NULL DEFAULT 'active', next_run_at INTEGER, last_run_at INTEGER, last_planned_at INTEGER, source TEXT NOT NULL DEFAULT 'glimt');
CREATE INDEX IF NOT EXISTS glimt_schedules_due ON glimt_schedules(status, next_run_at);
CREATE INDEX IF NOT EXISTS glimt_schedules_user ON glimt_schedules(user_id, status);
CREATE TABLE IF NOT EXISTS glimt_schedule_runs (id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, user_id TEXT NOT NULL, planned_at INTEGER NOT NULL,
  started_at INTEGER, finished_at INTEGER, ms INTEGER, status TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT 'schedule', result TEXT, condition TEXT,
  delivery TEXT, reason TEXT, error TEXT, trace_id TEXT);
CREATE INDEX IF NOT EXISTS glimt_schedule_runs_sched ON glimt_schedule_runs(schedule_id, planned_at);
CREATE INDEX IF NOT EXISTS glimt_schedule_runs_user ON glimt_schedule_runs(user_id, planned_at);`);
{
  const cols = q('PRAGMA table_info(glimt_schedules)').all().map((c) => c.name);
  for (const [c, t] of [['prepared', 'TEXT'], ['retry_of', 'INTEGER'], ['label', 'TEXT'], ['summary', 'TEXT'], ['private', 'INTEGER NOT NULL DEFAULT 0']]) if (!cols.includes(c)) db.exec(`ALTER TABLE glimt_schedules ADD COLUMN ${c} ${t}`);
}
try { q("DELETE FROM glimt_schedule_runs WHERE planned_at < ? AND status != 'running'").run(Date.now() - 180 * 86400_000); } catch { /* */ }

export const STATUS62 = ['active', 'paused', 'ended'];
export const KINDS62 = ['power', 'reminder', 'query'];
export const MAX62 = 100; // per bruker
export const SID62 = /^s[0-9a-f]{14}$/;
export const newId62 = (p) => `${p}${randomBytes(7).toString('hex')}`;
const J = (s, d) => { if (s == null) return d; try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

export const rowOf62 = (user, id) => q('SELECT * FROM glimt_schedules WHERE id=? AND user_id=?').get(String(id ?? ''), user) ?? null;
export const rowsOf62 = (user) => q("SELECT * FROM glimt_schedules WHERE user_id=? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, COALESCE(next_run_at, 9e15), created_at").all(user);
export const whenOfRow62 = (r) => ({ rrule: r.rrule, dtstart: r.dtstart, until: r.until });
export const ruleOfRow62 = (r) => ruleOfWhen62(whenOfRow62(r));

/** Neste kjøring etter afterMs med stille timer (uten eget klokkeslett: 23–07 → 07:00). → ms | null */
export function nextOf62(row, afterMs, { quiet = true } = {}) {
  const rule = ruleOfRow62(row);
  if (!rule) return null;
  const t = nextRun62(rule, afterMs);
  if (t == null) return null;
  return quiet && !row.explicit_time && quiet62(t) ? afterQuiet62(t) : t;
}

/** Raden → API-formen (SERVER62-API.md §1). */
export function publicSchedule62(row, { now = Date.now(), lastRun = undefined, quiet = true } = {}) {
  const rule = ruleOfRow62(row);
  const lr = lastRun !== undefined ? lastRun : q('SELECT * FROM glimt_schedule_runs WHERE schedule_id=? ORDER BY COALESCE(started_at, planned_at) DESC LIMIT 1').get(row.id);
  const nexts = row.status === 'active' && rule ? nextRuns62(rule, Math.max(now, (row.next_run_at ?? now) - 1), 3).map((t) => (quiet && !row.explicit_time && quiet62(t) ? afterQuiet62(t) : t)) : [];
  if (row.status === 'active' && row.next_run_at && !nexts.includes(row.next_run_at)) nexts.unshift(row.next_run_at);
  const today = osloParts62(now).date;
  return {
    id: row.id, title: row.title, what: row.what, kind: row.kind,
    when: { text: row.when_text ?? null, label: row.label ?? (rule ? labelOf62(rule, today) : ''), rrule: row.rrule ?? null, ical: rule ? icalOf62(rule) : null, dtstart: row.dtstart, tz: row.tz,
      until: row.until ?? null, once: !row.rrule, time: rule?.time ?? null, explicitTime: !!row.explicit_time },
    condition: J(row.condition, null), params: J(row.params, {}), channel: row.channel, status: row.status, summary: row.summary ?? null, private: !!row.private,
    nextRunAt: row.status === 'active' ? iso(row.next_run_at) : null, nextRuns: nexts.slice(0, 3).map(iso),
    lastRun: lr ? publicRun62(lr) : null, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), source: row.source,
    system: row.source === 'system', // prompt 63: systemoppgaven (nattlig oppsummering av minnet) – kan pauses, ikke slettes/endres
  };
}
export function publicRun62(r) {
  return { id: r.id, scheduleId: r.schedule_id, plannedAt: iso(r.planned_at), startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), ms: r.ms ?? null, status: r.status, trigger: r.trigger,
    result: r.result ?? null, condition: J(r.condition, null), delivery: J(r.delivery, null), reason: r.reason ?? null, error: r.error ?? null, traceId: r.trace_id ?? null };
}
export const runsOf62 = (user, id, limit = 20) => q('SELECT * FROM glimt_schedule_runs WHERE schedule_id=? AND user_id=? ORDER BY COALESCE(started_at, planned_at) DESC, rowid DESC LIMIT ?').all(id, user, Math.max(1, Math.min(100, limit)));

/**
 * Ny oppgave. s = {title, what, kind, when:{text, rule, explicitTime}, condition, params, channel, source, summary, label, private}. → raden
 */
export function insertSchedule62(user, s, { now = Date.now(), quiet = true } = {}) {
  const n = q("SELECT COUNT(*) FROM glimt_schedules WHERE user_id=? AND status!='ended'").pluck().get(user);
  if (n >= MAX62) throw Object.assign(new Error(`Du har allerede ${MAX62} faste oppgaver – slett noen først`), { status: 400 });
  const id = newId62('s');
  const r = s.when.rule;
  const row = { id, user_id: user, created_at: now, updated_at: now, title: s.title, what: s.what, kind: s.kind, when_text: s.when.text ?? null, rrule: ruleToRRule62(r), dtstart: `${r.dtstart}T${r.time}`,
    tz: 'Europe/Oslo', until: r.until ?? null, explicit_time: s.when.explicitTime ? 1 : 0, condition: s.condition ? JSON.stringify(s.condition) : null, params: JSON.stringify(s.params ?? {}),
    channel: s.channel ?? 'push', status: 'active', next_run_at: null, source: s.source ?? 'glimt', label: s.label ?? null, summary: s.summary ?? null, private: s.private ? 1 : 0 };
  row.next_run_at = nextOf62(row, now, { quiet });
  if (row.next_run_at == null) throw Object.assign(new Error('Fant ingen kjøring fram i tid'), { status: 400 });
  q(`INSERT INTO glimt_schedules(id, user_id, created_at, updated_at, title, what, kind, when_text, rrule, dtstart, tz, until, explicit_time, condition, params, channel, status, next_run_at, source, label, summary, private)
    VALUES(@id, @user_id, @created_at, @updated_at, @title, @what, @kind, @when_text, @rrule, @dtstart, @tz, @until, @explicit_time, @condition, @params, @channel, @status, @next_run_at, @source, @label, @summary, @private)`).run(row);
  return rowOf62(user, id);
}
/** Oppdaterer feltene i set (kolonnenavn) + updated_at. */
export function updateSchedule62(user, id, set, now = Date.now()) {
  const keys = Object.keys(set);
  if (!keys.length) return rowOf62(user, id);
  q(`UPDATE glimt_schedules SET ${keys.map((k) => `${k}=@${k}`).join(', ')}, updated_at=@_now WHERE id=@_id AND user_id=@_user`).run({ ...set, _now: now, _id: id, _user: user });
  return rowOf62(user, id);
}
export function deleteSchedule62(user, id) {
  const n = q('DELETE FROM glimt_schedules WHERE id=? AND user_id=?').run(id, user).changes;
  if (n) q('DELETE FROM glimt_schedule_runs WHERE schedule_id=? AND user_id=?').run(id, user);
  return n;
}
export function insertRun62(row, r) {
  const id = newId62('k');
  q(`INSERT INTO glimt_schedule_runs(id, schedule_id, user_id, planned_at, started_at, finished_at, ms, status, trigger, result, condition, delivery, reason, error, trace_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, row.id, row.user_id, r.plannedAt, r.startedAt ?? null, r.finishedAt ?? null, r.ms ?? null, r.status, r.trigger ?? 'schedule', r.result ?? null,
    r.condition ? JSON.stringify(r.condition) : null, r.delivery ? JSON.stringify(r.delivery) : null, r.reason ?? null, r.error ?? null, r.traceId ?? null);
  return id;
}
export function finishRun62(id, r) {
  q('UPDATE glimt_schedule_runs SET finished_at=?, ms=?, status=?, result=?, condition=?, delivery=?, reason=?, error=?, trace_id=? WHERE id=?')
    .run(r.finishedAt ?? Date.now(), r.ms ?? null, r.status, r.result ?? null, r.condition ? JSON.stringify(r.condition) : null, r.delivery ? JSON.stringify(r.delivery) : null, r.reason ?? null, r.error ?? null, r.traceId ?? null, id);
  return q('SELECT * FROM glimt_schedule_runs WHERE id=?').get(id);
}
