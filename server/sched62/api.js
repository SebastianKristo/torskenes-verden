// Prompt 62 (prompt 49 del 2, D2SRV): /api/glimt/schedules – «Faste oppgaver». Se $S/SERVER62-API.md.
//   GET / · POST /parse · POST / · GET|PUT /settings · GET /:id · PATCH /:id (også brief:<kind>) · DELETE /:id · GET /:id/runs · POST /:id/run-now
// Alt per bruker (sesjon eller app-token).
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { sched62, serverSched62, userSched62, saveSched62, zone62, LABELS62, HELP62 } from './settings.js';
import { SID62, rowOf62, rowsOf62, publicSchedule62, publicRun62, runsOf62, insertSchedule62, updateSchedule62, deleteSchedule62, nextOf62, KINDS62 } from './store.js';
import { interpret62, builtinBriefs62, summaryOf62, BRIEF62 } from './task.js';
import { runNow62, now62 } from './scheduler.js';
import { nextRuns62, ruleToRRule62, osloParts62, afterQuiet62, quiet62 } from '../glimt45/dates.js';
import { ZONES } from '../power-price.js';
import { glimtSettingsOf, cleanGlimtPatch, saveGlimtSettings } from '../glimt35.js';
import './tools.js';

export const schedulesApi62 = new Hono();
schedulesApi62.use('*', authOrToken);
const NS = { 'Cache-Control': 'no-store' };
const OFF = { error: 'Planlagte oppgaver er slått av' };
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const settingsOut = (u) => ({ settings: sched62(u), server: serverSched62(), user: userSched62(u), admin: isAdmin(u), labels: LABELS62, help: HELP62, zone: zone62(u), zones: ZONES });
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; };

/** Tolkning fra {what, when, condition} (samme kode som Glimt). → {task} | {error} */
function interpretBody(u, b, now) {
  const when = str(b.when, 200), what = str(b.what, 300), cond = b.condition == null ? '' : str(b.condition, 200);
  if (!when) return { error: 'when mangler (f.eks. «hver morgen kl. 7»)' };
  const set = sched62(u);
  const r = interpret62({ what, when, condition: cond }, { user: u, text: [what, when, cond ? `hvis ${cond}` : ''].filter(Boolean).join(' '), now, allowConditions: set.conditions });
  if (r.error) return { error: r.error };
  if (r.ask) return { error: r.ask.question };
  return r;
}
const preview = (u, t, now) => {
  const rule = t.when.rule;
  const nexts = nextRuns62(rule, now, 3).map((x) => (sched62(u).quiet && !t.when.explicitTime && quiet62(x) ? afterQuiet62(x) : x));
  return { when: { text: t.when.text, label: t.label, rrule: ruleToRRule62(rule), dtstart: `${rule.dtstart}T${rule.time}`, tz: 'Europe/Oslo', until: rule.until, once: !rule.freq, time: rule.time, explicitTime: t.when.explicitTime },
    condition: t.condition, title: t.title, what: t.what, kind: t.kind, params: t.params, private: t.private, nextRuns: nexts.map(iso), summary: t.summary };
};

schedulesApi62.get('/', (c) => {
  const u = c.get('user'), now = now62();
  const st = c.req.query('status') || null;
  if (st && !['active', 'paused', 'ended'].includes(st)) return c.json({ error: 'Ukjent status (active, paused, ended)' }, 400);
  const all = rowsOf62(u);
  const counts = { active: 0, paused: 0, ended: 0, total: all.length };
  for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return c.json({ items: all.filter((r) => !st || r.status === st).map((r) => publicSchedule62(r, { now, quiet: sched62(u).quiet })), builtin: builtinBriefs62(u, now), settings: sched62(u), enabled: sched62(u).enabled, counts }, 200, NS);
});
schedulesApi62.get('/settings', (c) => c.json(settingsOut(c.get('user')), 200, NS));
schedulesApi62.put('/settings', async (c) => {
  const u = c.get('user');
  const r = saveSched62(u, await body(c), { admin: isAdmin(u) });
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json(settingsOut(u));
});
schedulesApi62.post('/parse', async (c) => {
  const u = c.get('user'), b = await body(c), now = now62();
  if (!b) return c.json({ error: 'Forventet {when, what?, condition?}' }, 400);
  const r = interpretBody(u, { what: b.what || 'påminnelse', ...b }, now);
  if (r.error) return c.json({ error: r.error }, 400);
  return c.json({ ok: true, ...preview(u, r.task, now) });
});
schedulesApi62.post('/', async (c) => {
  const u = c.get('user'), b = await body(c), now = now62();
  if (!b) return c.json({ error: 'Forventet {what, when, condition?, title?, kind?, zone?, channel?}' }, 400);
  if (!sched62(u).enabled) return c.json(OFF, 409);
  if (!str(b.what, 300)) return c.json({ error: 'what mangler' }, 400);
  const r = interpretBody(u, b, now);
  if (r.error) return c.json({ error: r.error }, 400);
  const t = r.task;
  if (b.kind !== undefined) { if (!KINDS62.includes(b.kind)) return c.json({ error: `kind må være ${KINDS62.join(', ')}` }, 400); if (b.kind !== t.kind) { t.kind = b.kind; if (b.kind !== 'power') delete t.params.zone; else t.params.zone ??= zone62(u); t.params.day ??= 'today'; } }
  if (b.zone !== undefined) { if (!ZONES[b.zone]) return c.json({ error: `zone må være ${Object.keys(ZONES).join(', ')}` }, 400); t.params.zone = b.zone; }
  if (b.channel !== undefined && b.channel !== 'push') return c.json({ error: "channel må være 'push'" }, 400);
  if (b.title !== undefined) { const ti = str(b.title, 60); if (ti.length < 2) return c.json({ error: 'title må være 2–60 tegn' }, 400); t.title = ti; }
  t.summary = summaryOf62(t);
  try {
    const row = insertSchedule62(u, { ...t, when: { text: t.when.text, rule: t.when.rule, explicitTime: t.when.explicitTime }, source: 'api' }, { now, quiet: sched62(u).quiet });
    return c.json({ ok: true, item: publicSchedule62(row, { now, lastRun: null }) }, 201);
  } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
});

schedulesApi62.get('/:id', (c) => {
  const u = c.get('user'), id = c.req.param('id');
  const row = SID62.test(id) ? rowOf62(u, id) : null;
  if (!row) return c.json({ error: 'Fant ikke oppgaven' }, 404);
  return c.json({ item: publicSchedule62(row, { now: now62(), quiet: sched62(u).quiet }), runs: runsOf62(u, id, 20).map(publicRun62) }, 200, NS);
});
schedulesApi62.get('/:id/runs', (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!SID62.test(id) || !rowOf62(u, id)) return c.json({ error: 'Fant ikke oppgaven' }, 404);
  const lim = Number(c.req.query('limit') ?? 20);
  if (!Number.isInteger(lim) || lim < 1 || lim > 100) return c.json({ error: 'limit må være 1–100' }, 400);
  return c.json({ items: runsOf62(u, id, lim).map(publicRun62) }, 200, NS);
});
schedulesApi62.post('/:id/run-now', async (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!SID62.test(id) || !rowOf62(u, id)) return c.json({ error: 'Fant ikke oppgaven' }, 404);
  if (!sched62(u).enabled) return c.json(OFF, 409);
  const r = await runNow62(u, id, now62());
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json({ ok: true, run: r.run, item: publicSchedule62(rowOf62(u, id), { now: now62() }) });
});
schedulesApi62.patch('/:id', async (c) => {
  const u = c.get('user'), id = c.req.param('id'), now = now62();
  const b = await body(c);
  if (!b) return c.json({ error: 'Forventet {status?, when?, what?, title?, condition?, zone?, channel?}' }, 400);
  // Briefene: den eksisterende innstillingen i glimt35.
  const bm = /^brief:(morning|day|evening|night)$/.exec(id);
  if (bm) {
    const patch = {};
    if (b.at !== undefined) { if (typeof b.at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.at)) return c.json({ error: 'at må være HH:MM' }, 400); patch.at = b.at; }
    if (b.on !== undefined) { if (typeof b.on !== 'boolean') return c.json({ error: 'on må være true eller false' }, 400); patch.on = b.on; }
    if (!Object.keys(patch).length) return c.json({ error: 'Forventet {at?, on?}' }, 400);
    const cur = glimtSettingsOf(u);
    const { next, errors } = cleanGlimtPatch({ briefs: { [bm[1]]: patch } }, cur, u);
    if (errors?.length) return c.json({ error: errors[0] }, 400);
    saveGlimtSettings(u, next);
    return c.json({ ok: true, item: builtinBriefs62(u, now).find((x) => x.id === id) ?? null });
  }
  const row = SID62.test(id) ? rowOf62(u, id) : null;
  if (!row) return c.json({ error: 'Fant ikke oppgaven' }, 404);
  if (!sched62(u).enabled) return c.json(OFF, 409);
  // Prompt 63: systemoppgaven kan bare pauses/fortsettes.
  if (row.source === 'system' && Object.keys(b).some((k) => k !== 'status')) return c.json({ error: 'Systemoppgave – den kan bare settes på pause eller slås på igjen' }, 400);
  const set = {};
  let tmp = { ...row };
  if (b.title !== undefined) { const t = str(b.title, 60); if (t.length < 2) return c.json({ error: 'title må være 2–60 tegn' }, 400); set.title = t; }
  if (b.channel !== undefined && b.channel !== 'push') return c.json({ error: "channel må være 'push'" }, 400);
  if (b.zone !== undefined) { if (!ZONES[b.zone]) return c.json({ error: `zone må være ${Object.keys(ZONES).join(', ')}` }, 400); set.params = JSON.stringify({ ...JSON.parse(row.params || '{}'), zone: b.zone }); }
  if (b.what !== undefined) { const w = str(b.what, 300); if (w.length < 2) return c.json({ error: 'what må være 2–300 tegn' }, 400); set.what = w; }
  if (b.when !== undefined || b.condition !== undefined) {
    const cond0 = row.condition ? JSON.parse(row.condition).text : '';
    const r = interpretBody(u, { what: set.what ?? row.what, when: b.when ?? row.when_text ?? '', condition: b.condition === undefined ? cond0 : b.condition }, now);
    if (r.error) return c.json({ error: r.error }, 400);
    const t = r.task, rule = t.when.rule;
    Object.assign(set, { rrule: ruleToRRule62(rule), dtstart: `${rule.dtstart}T${rule.time}`, until: rule.until ?? null, explicit_time: t.when.explicitTime ? 1 : 0, label: t.label, when_text: t.when.text,
      condition: t.condition ? JSON.stringify(t.condition) : null });
    if (t.condition) set.params = JSON.stringify({ ...JSON.parse(set.params ?? row.params ?? '{}'), ...t.params });
  }
  if (b.status !== undefined) { if (b.status !== 'active' && b.status !== 'paused') return c.json({ error: "status må være 'active' eller 'paused'" }, 400); set.status = b.status; }
  tmp = { ...row, ...set };
  if (tmp.status === 'active') {
    const nx = nextOf62(tmp, now, { quiet: sched62(u).quiet });
    if (nx == null) return c.json({ error: 'Fant ingen kjøring fram i tid (sluttdatoen er passert)' }, 400);
    set.next_run_at = nx;
  } else set.next_run_at = null;
  const parsed = { ...publicSchedule62(tmp, { now, lastRun: null }), label: tmp.label, params: JSON.parse(tmp.params || '{}'), condition: tmp.condition ? JSON.parse(tmp.condition) : null };
  if (row.source !== 'system') set.summary = summaryOf62(parsed); // prompt 63: systemoppgaven beholder sin egen tekst
  const r = updateSchedule62(u, id, set, now);
  return c.json({ ok: true, item: publicSchedule62(r, { now, quiet: sched62(u).quiet }) });
});
schedulesApi62.delete('/:id', (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!SID62.test(id)) return c.json({ error: 'Fant ikke oppgaven' }, 404);
  if (rowOf62(u, id)?.source === 'system') return c.json({ error: 'Systemoppgave – sett den på pause i stedet' }, 400); // prompt 63
  const n = deleteSchedule62(u, id);
  if (!n) return c.json({ error: 'Fant ikke oppgaven' }, 404);
  return c.json({ ok: true, removed: n });
});
export { BRIEF62 };
