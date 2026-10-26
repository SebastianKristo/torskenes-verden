// Prompt 64 (prompt 49 del 7, D7SRV): ukerapporten. Per bruker med egne tall (admin får i tillegg systemtall):
//   antall forespørsler, andel løst på første forsøk, rettelser, nye oppskrifter, hurtigvei-andel, median svartid.
// Kildene: sporene (glimt47_trace – lever bare 3 dager, så de samles hver time i quality64_requests), oppskriftene (recipes, del 1),
// tommel ned (recipe_runs.vote), rettelsene (sporets recipe.correction, del 1), svar-cachen (sporets cache.hit, del 4).
// Søndag kl. 20 (systemoppgave «Ukerapport», sched62): én kort push; full rapport i appen (GET /api/glimt/quality/weekly).
import { db, kv, OWNER } from '../db.js';
import { insertRequest64, requestsBetween64, runsBetween64, publicRun64 } from './store.js';
import { quality64 } from './settings.js';
import { push64, PUSH_URL64 } from './notify64.js';
import { osloParts62, osloToUtc62 } from '../glimt45/dates.js';

const q = (sql) => db.prepare(sql);
const DAY = 86400_000;
const INGEST_KEY = 'quality64_ingest', SENT_KEY = 'quality64_weekly_sent';
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
export const WEEK64 = /^(\d{4})-W(\d{2})$/;

/* ---------------- Uker (ISO 8601, Europe/Oslo) ---------------- */

const ymd = (t) => new Date(t).toISOString().slice(0, 10);
/** «2026-10-26» → '2026-W44' */
export function weekOfDate64(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const wd = (new Date(t).getUTCDay() + 6) % 7; // man = 0
  const thu = t + (3 - wd) * DAY;
  const wy = new Date(thu).getUTCFullYear();
  const n = 1 + Math.floor((thu - Date.UTC(wy, 0, 1)) / (7 * DAY)); // torsdagen i uka avgjør året
  return `${wy}-W${String(n).padStart(2, '0')}`;
}
export const weekOf64 = (ms) => weekOfDate64(osloParts62(ms).date);
/** '2026-W44' → {monday:'2026-10-26', from, to (ms, mandag 00:00 → neste mandag 00:00 Oslo)} | null */
export function weekRange64(week) {
  const m = WEEK64.exec(String(week ?? ''));
  if (!m) return null;
  const y = +m[1], n = +m[2];
  if (n < 1 || n > 53) return null;
  const jan4 = Date.UTC(y, 0, 4);
  const mon1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const mon = mon1 + (n - 1) * 7 * DAY;
  if (weekOfDate64(ymd(mon)) !== week) return null; // uke 53 i et år uten uke 53
  return { monday: ymd(mon), sunday: ymd(mon + 6 * DAY), from: osloToUtc62(ymd(mon), '00:00'), to: osloToUtc62(ymd(mon + 7 * DAY), '00:00') };
}
const dm = (date) => { const [, mo, d] = date.split('-').map(Number); return `${d}. ${MON[mo - 1]}`; };
export function weekLabel64(week, { long = true } = {}) {
  const r = weekRange64(week);
  const n = +week.slice(-2);
  return r && long ? `Uke ${n} (${dm(r.monday)} – ${dm(r.sunday)})` : `Uke ${n}`;
}
const prevWeek = (week) => { const r = weekRange64(week); return weekOf64(r.from - 12 * 3600_000); };

/* ---------------- Innsamling fra sporene ---------------- */

/** Et spor → sammendraget i quality64_requests. */
export function requestOfTrace64(row) {
  let d = {};
  try { d = JSON.parse(row.data) ?? {}; } catch { /* */ }
  const tools = d.tools ?? [];
  const recipe = d.recipe ?? {};
  return {
    traceId: row.id, user: row.user_id, at: row.created, ms: Number.isFinite(d.totalMs) ? d.totalMs : null, module: d.module ?? null, intent: d.plan?.intent ?? null,
    ok: !d.plan?.failed && !tools.some((t) => t.status === 'failed'), asked: !!d.plan?.ask,
    fast: recipe.use === 'fast' || !!recipe.fast?.used, cache: !!d.cache?.hit,
    correctionOf: recipe.correction?.of ?? null, correctionKind: recipe.correction ? String(recipe.correction.kind ?? 'retting') : null,
  };
}
/** Samler nye spor (siden forrige gang, med litt overlapp). → antall nye */
export function ingest64(now = Date.now()) {
  let since = 0;
  try { since = kv.get(OWNER, INGEST_KEY, 0) ?? 0; } catch { /* */ }
  let rows = [];
  try { rows = q('SELECT id, user_id, created, data FROM glimt47_trace WHERE created >= ? ORDER BY created').all(Math.max(0, since - 3600_000)); } catch { return 0; }
  let n = 0, max = since;
  for (const r of rows) { n += insertRequest64(requestOfTrace64(r)); if (r.created > max) max = r.created; }
  try { kv.set(OWNER, INGEST_KEY, Math.min(max, now)); } catch { /* */ }
  return n;
}

/* ---------------- Tallene ---------------- */

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const pct = (xs, p) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const share = (a, b) => (b ? Math.round((a / b) * 100) / 100 : null);
function downVoted(ids) {
  if (!ids.length) return new Set();
  try {
    const out = new Set();
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400);
      for (const id of q(`SELECT trace_id FROM recipe_runs WHERE vote='down' AND trace_id IN (${part.map(() => '?').join(',')})`).pluck().all(...part)) out.add(id);
    }
    return out;
  } catch { return new Set(); }
}
function newRecipes(user, from, to) {
  try { return user == null ? q('SELECT COUNT(*) FROM recipes WHERE created_at>=? AND created_at<?').pluck().get(from, to) : q('SELECT COUNT(*) FROM recipes WHERE user_id=? AND created_at>=? AND created_at<?').pluck().get(user, from, to); }
  catch { return 0; }
}
/** Tallene for en bruker (eller alle med user = null) i [from, to). */
export function stats64(user, from, to) {
  const rows = requestsBetween64(user, from, to);
  // Rettelser kan komme litt etter (neste melding): se en time inn i neste uke.
  const later = requestsBetween64(user, from, to + 3600_000);
  const corrected = new Set(later.map((r) => r.correction_of).filter(Boolean));
  const down = downVoted(rows.map((r) => r.trace_id));
  const firstTry = rows.filter((r) => r.ok && !r.asked && !corrected.has(r.trace_id) && !down.has(r.trace_id)).length;
  const fast = rows.filter((r) => r.fast).length, cache = rows.filter((r) => r.cache).length;
  const ms = rows.map((r) => r.ms);
  return {
    requests: rows.length, firstTry, firstTryShare: share(firstTry, rows.length),
    corrections: rows.filter((r) => r.correction_kind).length, newRecipes: newRecipes(user, from, to),
    fast, fastShare: share(fast, rows.length), cache, cacheShare: share(cache, rows.length),
    medianMs: median(ms), p90Ms: pct(ms, 0.9),
    ...(user == null ? { users: new Set(rows.map((r) => r.user_id)).size } : {}),
  };
}
const nb1 = (v) => (v / 1000).toFixed(1).replace('.', ',');
const pc = (v) => `${Math.round((v ?? 0) * 100)} %`;
/** Den korte meldingen. */
export function weeklyText64(week, s) {
  const n = +week.slice(-2);
  if (!s.requests) return `Uke ${n}: ingen forespørsler til Glimt denne uka`;
  return [`Uke ${n}: ${s.requests} ${s.requests === 1 ? 'forespørsel' : 'forespørsler'}`, `${pc(s.firstTryShare)} løst på første forsøk`,
    `${s.corrections} ${s.corrections === 1 ? 'rettelse' : 'rettelser'}`, `${s.newRecipes} ${s.newRecipes === 1 ? 'ny oppskrift' : 'nye oppskrifter'}`,
    `hurtigvei ${pc(s.fastShare)}`, ...(s.medianMs != null ? [`median ${nb1(s.medianMs)} s`] : [])].join(' · ');
}
const sentOf = (user) => { try { return kv.get(user, SENT_KEY, {}) ?? {}; } catch { return {}; } };

/** Hele ukerapporten (Weekly, SERVER64-API.md §1). → objekt | null (ugyldig uke) */
export function weekly64(user, week, { admin = false, now = Date.now() } = {}) {
  ingest64(now);
  const r = weekRange64(week);
  if (!r) return null;
  const s = stats64(user, r.from, r.to);
  const out = { week, label: weekLabel64(week), from: new Date(r.from).toISOString(), to: new Date(r.to).toISOString(), partial: now < r.to, user: s,
    text: weeklyText64(week, s), sentAt: sentOf(user)[week] ? new Date(sentOf(user)[week]).toISOString() : null, enabled: quality64(user).weekly, weeks: [] };
  if (admin) {
    const sys = stats64(null, r.from, r.to);
    const runs = runsBetween64(r.from, r.to);
    out.system = { requests: sys.requests, users: sys.users, firstTryShare: sys.firstTryShare, corrections: sys.corrections, newRecipes: sys.newRecipes, fastShare: sys.fastShare, medianMs: sys.medianMs,
      eval: { runs: runs.length, completed: runs.filter((x) => x.status === 'ok' || x.status === 'regression').length, regressions: runs.filter((x) => x.status === 'regression').length,
        aborted: runs.filter((x) => x.status === 'aborted').length, skipped: runs.filter((x) => x.status === 'skipped').length, last: runs.length ? publicRun64(runs[runs.length - 1]) : null } };
  }
  // Navigasjon: siste 12 uker fra inneværende.
  let w = weekOf64(now);
  for (let i = 0; i < 12; i++) {
    const rr = weekRange64(w);
    const n = requestsBetween64(user, rr.from, rr.to).length;
    out.weeks.push({ week: w, label: weekLabel64(w, { long: false }), requests: n });
    w = prevWeek(w);
  }
  return out;
}

/** Søndagsvarselet for brukeren (én kort melding). → {sent, skipped?, week, text} */
export async function weeklyPush64(user, now = Date.now()) {
  const week = weekOf64(now - 6 * 3600_000); // søndag kl. 20 (eller tatt igjen kort etter midnatt) gjelder uka som slutter
  const r = weekRange64(week);
  if (!quality64(user).weekly) return { sent: false, skipped: 'Ukerapport er slått av', week };
  const sent = sentOf(user);
  if (sent[week]) return { sent: false, skipped: 'Allerede sendt for uka', week };
  ingest64(now);
  const s = stats64(user, r.from, r.to);
  const text = weeklyText64(week, s);
  if (!s.requests) return { sent: false, skipped: 'Ingen forespørsler denne uka', week, text };
  const msg = { title: `Glimt – uke ${+week.slice(-2)}`, body: text, url: PUSH_URL64.week(week), tag: 'weekly64', category: 'ai',
    data: { kind: 'quality.weekly', week, deepLink: PUSH_URL64.deepWeek(week) } };
  const res = await push64(user, msg, now);
  const keep = Object.fromEntries(Object.entries({ ...sent, [week]: now }).sort().slice(-20));
  try { kv.set(user, SENT_KEY, keep); } catch { /* */ }
  return { sent: !res?.error, week, text, result: res };
}
