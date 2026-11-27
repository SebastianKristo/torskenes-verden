// Helse: brukerens egne helsedata fra Apple Helse (og senere Health Connect) til Helse-siden, Glimt og Brief.
//   POST   /api/helse  {source?, days:[{date, steps, distanceM, activeKcal, exerciseMin, restingHr}],
//                       sleep:[{start, end, stage:'inBed'|'asleep'|'awake'|'core'|'deep'|'rem'}],
//                       workouts:[{id, type, start, end, durationMin?, kcal?, distanceM?}], weight:[{at, kg}]}
//                      → {ok, stored:{days, nights, workouts, weight}}
//   GET    /api/helse?periode=uke|maned  → shared/schemas/api/helse.schema.json (regnet ut i regler.js)
//   DELETE /api/helse  → {ok, deleted}  (sletter også Familie-sammendraget, family_health)
//
// Personvern (docs/sikkerhet.md): alt er per bruker og bare for brukeren selv. Andre i husstanden ser bare det personen deler i
// Familie (familie/places.js health50 leser delingHelse() under, filtrert per kategori). Helsedata logges aldri, sendes aldri til
// eksterne AI-tjenester (Glimt lager svarene av tallene her, se glimt/tools-helse.js) og beholdes i 400 dager.
// Tabellene er nye (helse_*); de eksisterende (family_health) endres ikke.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { db, q } from '../db.js';
import { userInfo, sessionUser } from '../auth/session.js';
import { bearerOk } from '../finans/routes.js';
import { osloDate, addDays } from '../dates/oslo.js';
import { rensSovn, netter, helseSide, PERIODER, OKT_TYPER, DAY_MS, nattUt, oktUt, vektUt, heltall, distanse, kortTekst } from './regler.js';
import { eksempelHelse } from './eksempel.js';

const MOCK = process.env.MOCK_DATA === '1';
export const HELSE_KEEP_DAYS = 400;

db.exec(`
CREATE TABLE IF NOT EXISTS helse_dag (
  user TEXT NOT NULL, date TEXT NOT NULL, steps INTEGER, distance_m REAL, active_kcal INTEGER, exercise_min INTEGER, resting_hr REAL,
  source TEXT, updated INTEGER NOT NULL, PRIMARY KEY (user, date)
);
CREATE TABLE IF NOT EXISTS helse_natt (
  user TEXT NOT NULL, night TEXT NOT NULL, bed_ms INTEGER, asleep_ms INTEGER, wake_ms INTEGER, in_bed_min INTEGER, asleep_min INTEGER,
  deep_min INTEGER, core_min INTEGER, rem_min INTEGER, awake_min INTEGER, staged INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL,
  PRIMARY KEY (user, night)
);
CREATE TABLE IF NOT EXISTS helse_okt (
  user TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, duration_s INTEGER,
  kcal REAL, distance_m REAL, updated INTEGER NOT NULL, PRIMARY KEY (user, id)
);
CREATE INDEX IF NOT EXISTS helse_okt_start ON helse_okt(user, start_ms);
CREATE TABLE IF NOT EXISTS helse_vekt (user TEXT NOT NULL, at_ms INTEGER NOT NULL, kg REAL NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user, at_ms));
`);

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const ms = (v) => (typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v ?? '')));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) || null : null);

/* ---------------- Lagring ---------------- */

// Flere enheter sender hver sin dagssum: høyeste verdi per felt, ikke summen (samme regel som Familie). Hvilepuls er siste verdi.
const hi = (col) => `CASE WHEN excluded.${col} IS NULL THEN ${col} WHEN ${col} IS NULL THEN excluded.${col} ELSE MAX(${col}, excluded.${col}) END`;

/** Lagrer det appen sendte for brukeren selv. → {days, nights, workouts, weight} (antall rader). */
export function lagreHelse(user, b, now = Date.now()) {
  const oldest = osloDate(now - HELSE_KEEP_DAYS * DAY_MS), today = osloDate(now);
  const days = (Array.isArray(b?.days) ? b.days : []).slice(0, 400).map((r) => {
    if (!DATE.test(String(r?.date ?? '')) || r.date < oldest || r.date > addDays(today, 1)) return null;
    return { date: r.date, steps: num(r.steps, 0, 200_000), distance_m: num(r.distanceM, 0, 500_000), active_kcal: num(r.activeKcal, 0, 20_000),
      exercise_min: num(r.exerciseMin, 0, 1440), resting_hr: num(r.restingHr, 20, 250) };
  }).filter(Boolean);
  const samples = rensSovn(b?.sleep, now);
  const nights = netter(samples).filter((n) => n.night >= oldest);
  const workouts = (Array.isArray(b?.workouts) ? b.workouts : []).slice(0, 500).map((w) => {
    const s = ms(w?.start), e = ms(w?.end), id = typeof w?.id === 'string' && /^[\w.:-]{1,64}$/.test(w.id) ? w.id : null;
    if (!id || !Number.isFinite(s) || !Number.isFinite(e) || e <= s || e - s > 2 * DAY_MS || e > now + 5 * 60_000 || s < now - HELSE_KEEP_DAYS * DAY_MS) return null;
    const dur = num(w.durationMin, 0, 2880);
    return { id, type: Object.hasOwn(OKT_TYPER, w.type) ? w.type : 'other', s, e, dur: dur != null ? Math.round(dur * 60) : null, kcal: num(w.kcal, 0, 20_000), dist: num(w.distanceM, 0, 1_000_000) };
  }).filter(Boolean);
  const weight = (Array.isArray(b?.weight) ? b.weight : []).slice(0, 1000).map((x) => {
    const at = ms(x?.at), kg = num(x?.kg, 2, 400);
    return Number.isFinite(at) && kg != null && at <= now + 5 * 60_000 && at > now - HELSE_KEEP_DAYS * DAY_MS ? { at: Math.round(at), kg } : null;
  }).filter(Boolean);
  const source = clean(b?.source, 60);
  const insDay = q(`INSERT INTO helse_dag(user, date, steps, distance_m, active_kcal, exercise_min, resting_hr, source, updated) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user, date) DO UPDATE SET steps=${hi('steps')}, distance_m=${hi('distance_m')}, active_kcal=${hi('active_kcal')}, exercise_min=${hi('exercise_min')},
      resting_hr=COALESCE(excluded.resting_hr, resting_hr), source=COALESCE(excluded.source, source), updated=excluded.updated`);
  // En natt regnes alltid ut på nytt fra målingene appen sender for den (hele natten sendes hver gang).
  const insNight = q(`INSERT OR REPLACE INTO helse_natt(user, night, bed_ms, asleep_ms, wake_ms, in_bed_min, asleep_min, deep_min, core_min, rem_min, awake_min, staged, updated)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insW = q(`INSERT OR REPLACE INTO helse_okt(user, id, type, start_ms, end_ms, duration_s, kcal, distance_m, updated) VALUES(?,?,?,?,?,?,?,?,?)`);
  const insKg = q('INSERT OR REPLACE INTO helse_vekt(user, at_ms, kg, updated) VALUES(?,?,?,?)');
  db.transaction(() => {
    for (const d of days) insDay.run(user, d.date, d.steps, d.distance_m, d.active_kcal, d.exercise_min, d.resting_hr, source, now);
    for (const n of nights) insNight.run(user, n.night, n.bedMs, n.asleepMs, n.wakeMs, n.inBedMin, n.asleepMin, n.stages?.deep ?? null, n.stages?.core ?? null, n.stages?.rem ?? null, n.stages?.awake ?? null, n.stages ? 1 : 0, now);
    for (const w of workouts) insW.run(user, w.id, w.type, w.s, w.e, w.dur, w.kcal, w.dist, now);
    for (const x of weight) insKg.run(user, x.at, x.kg, now);
  })();
  rydd(now);
  return { days: days.length, nights: nights.length, workouts: workouts.length, weight: weight.length };
}

let lastPrune = 0;
function rydd(now = Date.now()) {
  if (now - lastPrune < 3_600_000) return;
  lastPrune = now;
  const cut = osloDate(now - HELSE_KEEP_DAYS * DAY_MS), cutMs = now - HELSE_KEEP_DAYS * DAY_MS;
  q('DELETE FROM helse_dag WHERE date < ?').run(cut);
  q('DELETE FROM helse_natt WHERE night < ?').run(cut);
  q('DELETE FROM helse_okt WHERE start_ms < ?').run(cutMs);
  q('DELETE FROM helse_vekt WHERE at_ms < ?').run(cutMs);
}

/** Sletter alle egne helsedata (Helse-siden og Familie-sammendraget). → antall rader */
export function slettHelse(user) {
  let n = 0;
  db.transaction(() => {
    for (const t of ['helse_dag', 'helse_natt', 'helse_okt', 'helse_vekt']) n += q(`DELETE FROM ${t} WHERE user=?`).run(user).changes;
    if (q("SELECT 1 FROM sqlite_master WHERE type='table' AND name='family_health'").get()) n += q('DELETE FROM family_health WHERE user=?').run(user).changes;
  })();
  return n;
}

const nightRow = (r) => ({ night: r.night, bedMs: r.bed_ms, asleepMs: r.asleep_ms, wakeMs: r.wake_ms, inBedMin: r.in_bed_min, asleepMin: r.asleep_min,
  stages: r.staged ? { deep: r.deep_min, core: r.core_min, rem: r.rem_min, awake: r.awake_min } : null });

/** Rådata for de siste `days` dagene (pluss perioden før, til trendene). Eksempeldata med MOCK_DATA=1 når brukeren ikke har egne. */
export function helseData(user, { now = Date.now(), days = 60 } = {}) {
  const from = osloDate(now - (days + 1) * DAY_MS), fromMs = now - (days + 1) * DAY_MS;
  const d = {
    days: q('SELECT * FROM helse_dag WHERE user=? AND date >= ? ORDER BY date').all(user, from),
    nights: q('SELECT * FROM helse_natt WHERE user=? AND night >= ? ORDER BY night').all(user, from).map(nightRow),
    workouts: q('SELECT * FROM helse_okt WHERE user=? AND start_ms >= ? ORDER BY start_ms DESC').all(user, fromMs),
    weights: q('SELECT at_ms, kg FROM helse_vekt WHERE user=? AND at_ms >= ? ORDER BY at_ms').all(user, fromMs),
  };
  // Vekt: siste måling også når den er eldre enn perioden.
  if (!d.weights.length) { const w = q('SELECT at_ms, kg FROM helse_vekt WHERE user=? ORDER BY at_ms DESC LIMIT 1').get(user); if (w) d.weights = [w]; }
  if (!d.workouts.length) { const w = q('SELECT * FROM helse_okt WHERE user=? ORDER BY start_ms DESC LIMIT 1').get(user); if (w) d.workouts = [w]; }
  const ups = [...d.days, ...q('SELECT updated FROM helse_natt WHERE user=? ORDER BY updated DESC LIMIT 1').all(user), ...q('SELECT updated FROM helse_okt WHERE user=? ORDER BY updated DESC LIMIT 1').all(user), ...q('SELECT updated FROM helse_vekt WHERE user=? ORDER BY updated DESC LIMIT 1').all(user)].map((r) => r.updated ?? 0);
  d.updated = ups.length ? Math.max(...ups) : null;
  const empty = !d.days.length && !d.nights.length && !d.workouts.length && !d.weights.length;
  if (empty && MOCK) return { ...eksempelHelse(now), mock: true };
  return d;
}

/** Hele Helse-siden for brukeren selv. */
export function helseFor(user, { now = Date.now(), periode = 'uke' } = {}) {
  const p = PERIODER[periode] ? periode : 'uke';
  const d = helseData(user, { now, days: PERIODER[p] * 2 });
  return { ...helseSide(d, { now, periode: p }), ...(d.mock ? { mock: true } : {}) };
}

/**
 * Familie: det personen deler, per kategori (share = shareHealth). Søvn med stadier når «sleep» deles, siste økt og distanse
 * når «workouts» deles, vekt når «weight» deles. Ingenting annet forlater brukerens egne data. → {sleep?, workout?, distanceText?, weight?} | null
 */
export function delingHelse(user, share, { now = Date.now(), data = null } = {}) {
  if (!share || !(share.sleep || share.workouts || share.weight)) return null;
  const today = osloDate(now);
  const d = data ?? helseData(user, { now, days: 7 });
  const out = {};
  if (share.sleep) { const n = d.nights.filter((x) => x.night <= today).at(-1); if (n && n.night >= addDays(today, -1)) out.sleep = nattUt(n, today); }
  if (share.workouts) {
    const w = d.workouts.slice().sort((a, b) => b.start_ms - a.start_ms)[0];
    if (w) out.workout = oktUt(w, today);
    const t = d.days.find((x) => x.date === today);
    if (t?.distance_m != null) { out.distanceM = Math.round(t.distance_m); out.distanceText = distanse(t.distance_m); }
  }
  if (share.weight) { const v = vektUt(d.weights, { today, days: 30 }); if (v) out.weight = { kg: v.kg, kgText: v.kgText, date: v.date, dayText: v.dayText, changeText: v.changeText, direction: v.direction }; }
  return Object.keys(out).length ? out : null;
}

/** Kort sammendrag til Brief: {text, sleepText, stepsText} | null (bare brukerens egne tall, ingen AI). */
export function helseBrief(user, now = Date.now()) {
  const h = helseFor(user, { now });
  if (h.empty) return null;
  const s = h.sleep.tonight ?? null;
  const text = h.summary;
  if (!text && !s && h.today.steps == null) return null;
  return { label: 'Helse', text, sleepText: s?.asleepText ?? null, sleepRange: s?.range ?? null, stepsText: h.today.stepsText, steps: h.today.steps,
    sleepAvgText: h.sleep.avg7Text, ...(h.mock ? { mock: true } : {}) };
}
export { kortTekst, heltall };

/* ---------------- Ruter ---------------- */

export const helseApi = new Hono();
// Sesjon eller hvilket som helst gyldig app-token (som Familie): alt her er brukerens egne data.
helseApi.use('*', async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget', code: 'HOMELAB_AUTH', reason: 'none' }, 401);
  c.set('user', id);
  await next();
});
const NO_STORE = { 'Cache-Control': 'no-store' };
helseApi.get('/', (c) => {
  const p = c.req.query('periode') ?? 'uke';
  if (!PERIODER[p]) return c.json({ error: 'periode må være uke eller maned', code: 'BAD_REQUEST' }, 400);
  return c.json(helseFor(c.get('user'), { periode: p }), 200, NO_STORE);
});
helseApi.post('/', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: 'For mye data på én gang (maks 2 MB)', code: 'BAD_REQUEST' }, 413) }), async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {days, sleep, workouts, weight}', code: 'BAD_REQUEST' }, 400);
  const stored = lagreHelse(c.get('user'), b);
  return c.json({ ok: true, stored }, 200, NO_STORE);
});
helseApi.delete('/', (c) => c.json({ ok: true, deleted: slettHelse(c.get('user')) }, 200, NO_STORE));

export function mountHelse(app) {
  app.route('/api/helse', helseApi);
}
