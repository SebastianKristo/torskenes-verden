// Prompt 62 (prompt 49 del 2, D2SRV): Glimt-verktøyene for planlagte oppgaver i det felles registeret (TOOLS45).
//   schedule.create {what, when, condition} – DESTRUKTIV: motoren ber alltid om bekreftelse av tolkningen før lagring
//   schedule.list   {}                       – lesekall: oppgavene fra databasen + briefene
//   schedule.update {target, when, action}   – DESTRUKTIV: flytt/pause/start; «morgenbriefen» endrer brief-innstillingen (glimt35)
//   schedule.delete {target}                 – DESTRUKTIV: «stopp» = pause, «slett» = slett
// «Når» og betingelsen tolkes i koden (task.js); modellen gir bare råtekst.
import { TOOLS45, TOOL45 } from '../glimt45/tools.js';
import { SENTENCES46, FAIL_TEXT46 } from '../glimt45/tools46.js';
import { parseRecurrence62, nextRuns62, ruleOfWhen62, ruleToRRule62, labelOf62, osloParts62, osloToUtc62, afterQuiet62, quiet62, nextRun62 } from '../glimt45/dates.js';
import { interpret62, briefIn62, builtinBriefs62, timeOf62, summaryOf62, BRIEF62 } from './task.js';
import { rowOf62, rowsOf62, insertSchedule62, updateSchedule62, deleteSchedule62, publicSchedule62, ruleOfRow62, nextOf62 } from './store.js';
import { sched62 } from './settings.js';
import { now62 } from './scheduler.js';
import { registerLocalPlan62 } from '../glimt45/plan.js';
import { glimtSettingsOf, cleanGlimtPatch, saveGlimtSettings } from '../glimt35.js';

const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const sTxt = (d) => ({ type: 'string', description: d });
const pad = (n) => String(n).padStart(2, '0');
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const J = (s, d) => { if (s == null) return d; try { return JSON.parse(s) ?? d; } catch { return d; } };
const OFF = 'Planlagte oppgaver er slått av (Innstillinger → AI-kontroll → Valg)';
export const OPEN62 = { web: '/#/innstillinger/faste-oppgaver', deepLink: 'finanshub://faste-oppgaver' };

/** «Nå» for verktøyene: motorens (ev. fryste) dag og minutt, ellers klokka. */
export function nowOfCtx62(ctx) {
  if (ctx?.today && Number.isFinite(ctx?.nowMin)) return osloToUtc62(ctx.today, `${pad(Math.floor(ctx.nowMin / 60))}:${pad(ctx.nowMin % 60)}`);
  return now62();
}
const quietAdj = (user, explicit, ts) => (sched62(user).quiet && !explicit ? ts.map((t) => (quiet62(t) ? afterQuiet62(t) : t)) : ts);
const relWhen = (ms, now) => {
  if (ms == null) return 'ingen flere kjøringer';
  const p = osloParts62(ms), today = osloParts62(now).date;
  const day = p.date === today ? 'i dag' : p.date === osloParts62(now + 86400_000).date ? 'i morgen' : `${+p.date.slice(8, 10)}.${+p.date.slice(5, 7)}.`;
  return `${day} ${p.hm}`;
};
export const scheduleCard62 = (s, now = Date.now()) => ({ kind: 'schedule', id: s.id, title: s.title, subtitle: s.kind === 'brief' ? `${s.label}${s.active ? '' : ' · av'}` : `${s.when.label}${s.status === 'active' ? ` · neste ${relWhen(Date.parse(s.nextRunAt ?? '') || null, now)}` : s.status === 'paused' ? ' · på pause' : ' · ferdig'}`,
  status: s.status ?? (s.active ? 'active' : 'paused'), open: OPEN62 });

/* ---------------- Mål («strømprisvarselet», «morgenbriefen», «den andre») ---------------- */

const STOP = new Set(['stopp', 'stoppe', 'slett', 'slette', 'fjern', 'fjerne', 'flytt', 'flytte', 'endre', 'pause', 'sett', 'skru', 'slå', 'start', 'oppgaven', 'oppgave', 'faste', 'fast', 'den', 'det', 'min', 'mitt', 'mine', 'til', 'kl', 'hver', 'meg', 'på', 'av', 'om', 'igjen', 'for', 'med', 'jeg', 'vil', 'kan', 'du']);
const words = (s) => String(s ?? '').toLowerCase().replace(/[«»"“”.,!?:;()]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
function score(row, ws) {
  const hay = `${row.title} ${row.what}`.toLowerCase();
  const cond = J(row.condition, null);
  let s = 0;
  for (const w of ws) {
    if (/strøm|spotpris|kwh/.test(w)) s += row.kind === 'power' || cond?.source === 'power' ? 3 : -1;
    if (/varsel|varslet|beskjed/.test(w)) s += cond ? 2 : -1;
    if (/påminnelse/.test(w)) s += row.kind === 'reminder' ? 2 : 0;
    if (/^vær/.test(w)) s += /vær/.test(hay) || cond?.source === 'weather' ? 2 : 0;
    if (w.length >= 4 && hay.includes(w.slice(0, Math.min(6, w.length)))) s += 2;
  }
  return s;
}
/** → {row} | {ask} | {error} */
export function resolveTarget62(user, target, text, ctx = {}, verb = 'endre') {
  const rows = rowsOf62(user).filter((r) => r.status !== 'ended');
  const sel = String(ctx.context?.selectedId ?? '').match(/^(?:sch-)?(s[0-9a-f]{14})$/)?.[1];
  if (sel) { const r = rowOf62(user, sel); if (r) return { row: r }; }
  if (!rows.length) return { error: 'Du har ingen faste oppgaver' };
  const quoted = /«([^»]{2,80})»/.exec(String(text ?? ''))?.[1];
  if (quoted) { const hit = rows.filter((r) => r.title.toLowerCase() === quoted.toLowerCase()); if (hit.length === 1) return { row: hit[0] }; }
  const ws = words(`${target ?? ''} ${text ?? ''}`);
  const sc = rows.map((r) => ({ r, s: score(r, ws) })).sort((a, b) => b.s - a.s);
  if (sc[0].s > 0 && (sc.length === 1 || sc[0].s > sc[1].s)) return { row: sc[0].r };
  if (rows.length === 1 && (sc[0].s >= 0)) return { row: rows[0] };
  const pool = sc[0].s > 0 ? sc.filter((x) => x.s === sc[0].s).map((x) => x.r) : rows;
  const V = { endre: 'Endre', stoppe: 'Stopp', slette: 'Slett', flytte: 'Flytt' }[verb] ?? 'Endre';
  return { ask: { question: `Hvilken fast oppgave vil du ${verb}?`, field: 'schedule',
    options: pool.slice(0, 5).map((r) => ({ id: `sch-${r.id}`, label: `${r.title} (${r.label ?? ''})`, text: `${V} den faste oppgaven «${r.title}»${verb === 'flytte' ? ` ${String(text ?? '').match(/(?<![a-zæøå])til\s+.+$/i)?.[0] ?? ''}` : ''}` })) } };
}

/* ---------------- schedule.create ---------------- */

export const createTool62 = {
  name: 'schedule.create', module: 'home', destructive: true,
  description: 'Lag en planlagt oppgave («Send meg strømprisene hver morgen kl. 7»). Glimt bekrefter tolkningen før den lagres. what = hva (en vanlig forespørsel), when = når (råtekst), condition = betingelse (råtekst).',
  parameters: S({ what: sTxt('Hva Glimt skal gjøre (en vanlig forespørsel: «strømprisene», «oppsummer hva jeg har brukt penger på denne uka»)'), when: sTxt('Når, slik brukeren skrev det («hver morgen kl. 7», «den 1. hver måned»)'), condition: sTxt('Betingelse, slik brukeren skrev det («strømprisen går over 2 kr»)') }),
  async validate(args, ctx) {
    const set = sched62(ctx.user);
    if (!set.enabled) return { error: OFF };
    const now = nowOfCtx62(ctx);
    const r = interpret62(args, { user: ctx.user, text: ctx.text, now, allowConditions: set.conditions });
    if (r.error) return { error: r.error };
    if (r.ask) return { ask: r.ask };
    const t = r.task, rule = t.when.rule;
    const rrule = ruleToRRule62(rule);
    const dup = rowsOf62(ctx.user).find((x) => x.status === 'active' && x.kind === t.kind && x.what.toLowerCase() === t.what.toLowerCase() && (x.rrule ?? '') === (rrule ?? '') && x.dtstart.slice(11) === rule.time && (x.condition ?? null) === (t.condition ? JSON.stringify(t.condition) : null));
    if (dup) return { error: `Du har allerede denne faste oppgaven: «${dup.title}» (${dup.label})` };
    const nexts = quietAdj(ctx.user, t.when.explicitTime, nextRuns62(rule, now, 3));
    if (!nexts.length) return { error: 'Fant ingen kjøring fram i tid' };
    const when = { text: t.when.text, label: t.label, rrule, dtstart: `${rule.dtstart}T${rule.time}`, tz: 'Europe/Oslo', until: rule.until, once: !rule.freq, time: rule.time, explicitTime: t.when.explicitTime };
    return { args: { title: t.title, what: t.what, kind: t.kind, when, condition: t.condition, params: t.params, private: t.private, nextRuns: nexts.map(iso), summary: t.summary },
      summary: `${t.summary} Stemmer det?` };
  },
  async run(a, ctx) {
    if (!sched62(ctx.user).enabled) return { status: 'failed', error: OFF };
    const rule = ruleOfWhen62(a.when);
    if (!rule) return { status: 'failed', error: 'Ugyldig tidspunkt' };
    const now = nowOfCtx62(ctx);
    const row = insertSchedule62(ctx.user, { title: a.title, what: a.what, kind: a.kind, when: { text: a.when.text, rule, explicitTime: a.when.explicitTime }, condition: a.condition, params: a.params,
      label: a.when.label, summary: a.summary, private: a.private, source: 'glimt' }, { now, quiet: sched62(ctx.user).quiet });
    const s = publicSchedule62(row, { now, lastRun: null });
    return { status: 'done', result: { schedule: s, created: true, open: OPEN62 }, cards: [scheduleCard62(s, now)] };
  },
  async verify(r, ctx) { return !!rowOf62(ctx.user, r.result?.schedule?.id); },
};
const dayNow = (today) => (today ? osloToUtc62(today, '12:00') : Date.now());
SENTENCES46['schedule.create'] = (a, r, today) => `Lagret. ${r.result.schedule.summary ?? a.summary} Første gang ${relWhen(Date.parse(r.result.schedule.nextRunAt ?? '') || null, dayNow(today))}. Du finner den under Innstillinger → Faste oppgaver.`;
FAIL_TEXT46['schedule.create'] = 'Fikk ikke lagret den faste oppgaven';

/* ---------------- schedule.list ---------------- */

export const listTool62 = {
  name: 'schedule.list', module: 'home', parallel: true,
  description: 'Vis brukerens faste (planlagte) oppgaver og briefer.',
  parameters: S({}),
  async validate() { return { args: {} }; },
  async run(a, ctx) {
    const now = nowOfCtx62(ctx);
    const items = rowsOf62(ctx.user).filter((r) => r.status !== 'ended').map((r) => publicSchedule62(r, { now }));
    const builtin = builtinBriefs62(ctx.user, now);
    return { status: 'done', result: { count: items.length, items, builtin, enabled: sched62(ctx.user).enabled, open: OPEN62 }, cards: [...items.map((s) => scheduleCard62(s, now)), ...builtin.filter((b) => b.active).map((b) => scheduleCard62(b, now))].slice(0, 12) };
  },
};
const joinNo = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);
SENTENCES46['schedule.list'] = (a, r) => {
  const { items, builtin, enabled } = r.result;
  const act = items.filter((s) => s.status === 'active'), paused = items.filter((s) => s.status === 'paused');
  const br = builtin.filter((b) => b.active).map((b) => `${b.title.toLowerCase()} kl. ${b.at}`);
  const head = !items.length ? 'Du har ingen faste oppgaver ennå.' : `Du har ${items.length} ${items.length === 1 ? 'fast oppgave' : 'faste oppgaver'}: ${joinNo(act.map((s) => `${s.title} (${s.when.label.charAt(0).toLowerCase()}${s.when.label.slice(1)})`))}${paused.length ? `${act.length ? '. ' : ''}På pause: ${joinNo(paused.map((s) => s.title))}` : ''}.`;
  return `${head}${br.length ? ` I tillegg kommer ${joinNo(br)}.` : ''}${enabled ? '' : ' Planlagte oppgaver er slått av, så ingenting kjøres nå.'}`;
};
FAIL_TEXT46['schedule.list'] = 'Fikk ikke lest de faste oppgavene';

/* ---------------- schedule.update / schedule.delete ---------------- */

const actionOf = (args, text) => {
  const a = String(args.action ?? '').toLowerCase();
  if (['pause', 'resume', 'move', 'stop', 'delete'].includes(a)) return a;
  const t = String(text ?? '').toLowerCase();
  if (/(?<![a-zæøå])(slett|fjern)/.test(t)) return 'delete';
  if (/(?<![a-zæøå])(pause|sett\s+på\s+vent|ta\s+en\s+pause)/.test(t)) return 'pause';
  if (/(?<![a-zæøå])(start\s+.*igjen|slå\s+på|skru\s+på|fortsett|gjenoppta|aktiver|begynn\s+igjen)/.test(t)) return 'resume';
  if (/(?<![a-zæøå])(stopp|stans|skru\s+av|slå\s+av|avslutt|slutt\s+med|ikke\s+send)/.test(t)) return 'stop';
  return 'move';
};
const briefSettings = (user) => { try { return glimtSettingsOf(user); } catch { return null; } };

async function validateChange(args, ctx, kind) {
  if (!sched62(ctx.user).enabled && kind !== 'delete') return { error: OFF };
  const now = nowOfCtx62(ctx);
  let action = actionOf(args, ctx.text);
  if (kind === 'delete' && !['delete', 'stop', 'pause'].includes(action)) action = /slett|fjern/i.test(ctx.text) ? 'delete' : 'stop';
  if (kind === 'update' && action === 'delete') action = 'stop';
  // Briefene: den eksisterende innstillingen (aldri en duplikat).
  const bk = briefIn62(args.target) ?? briefIn62(ctx.text);
  if (bk) {
    const s = briefSettings(ctx.user);
    const b = s?.briefs?.[bk];
    if (!b) return { error: 'Fant ikke briefen' };
    const title = BRIEF62[bk];
    if (action === 'move') {
      const at = timeOf62(args.when) ?? timeOf62(String(ctx.text).replace(/^.*?brief\w*/i, ''));
      if (!at) return { ask: { question: `Når vil du ha ${title.toLowerCase()}en? (f.eks. «kl. 06:30»)` } };
      if (at === b.at && b.on) return { error: `${title}en kommer allerede kl. ${at}` };
      return { args: { builtin: `brief:${bk}`, brief: bk, title, action: 'move', from: { at: b.at, on: !!b.on }, to: { at, on: true } }, summary: `Flytte ${title.toLowerCase()}en fra kl. ${b.at} til kl. ${at}${b.on ? '' : ' (og slå den på)'}? Stemmer det?` };
    }
    const on = action === 'resume';
    if (!!b.on === on) return { error: `${title}en er allerede ${on ? 'på' : 'av'}` };
    return { args: { builtin: `brief:${bk}`, brief: bk, title, action: on ? 'resume' : 'stop', from: { at: b.at, on: !!b.on }, to: { at: b.at, on } }, summary: `${on ? 'Slå på' : 'Slå av'} ${title.toLowerCase()}en (kl. ${b.at})? Stemmer det?` };
  }
  const verb = action === 'delete' ? 'slette' : action === 'stop' || action === 'pause' ? 'stoppe' : action === 'resume' ? 'endre' : 'flytte';
  const tr = resolveTarget62(ctx.user, args.target, ctx.text, ctx, verb);
  if (tr.error || tr.ask) return tr;
  const row = tr.row;
  // Prompt 63: systemoppgaven (nattlig oppsummering av minnet) kan bare stoppes (pause) eller slås på igjen.
  if (row.source === 'system' && action === 'delete') action = 'pause';
  if (row.source === 'system' && action === 'move') return { error: `«${row.title}» er en systemoppgave – den kan bare stoppes eller slås på igjen` };
  const base = { id: row.id, title: row.title, label: row.label, action };
  if (action === 'delete') return { args: base, summary: `Slette den faste oppgaven «${row.title}» (${row.label}) og loggen? Stemmer det?` };
  if (action === 'stop' || action === 'pause') {
    if (row.status !== 'active') return { error: `«${row.title}» er allerede stoppet` };
    return { args: { ...base, action: 'pause' }, summary: `Stoppe «${row.title}» (${row.label})? Den settes på pause og kan slås på igjen under Innstillinger → Faste oppgaver. Stemmer det?` };
  }
  if (action === 'resume') {
    if (row.status === 'active') return { error: `«${row.title}» er allerede på` };
    return { args: base, summary: `Slå på «${row.title}» igjen (${row.label})? Stemmer det?` };
  }
  // Flytt: ny gjentakelse eller bare nytt klokkeslett.
  const wt = String(args.when ?? '').trim() || String(ctx.text).replace(/^.*?(?<![a-zæøå])til\s+/i, '');
  const p = parseRecurrence62(wt, { now, today: osloParts62(now).date });
  const old = ruleOfRow62(row);
  let rule = null, explicit = !!row.explicit_time;
  if (p.ok && p.rule.freq) { rule = { ...p.rule, until: p.rule.until ?? old?.until ?? null }; explicit = p.when.explicitTime || explicit; }
  else {
    const at = timeOf62(wt);
    if (!at || !old) return { ask: { question: `Når vil du ha «${row.title}»? (f.eks. «kl. 06:30» eller «hver fredag kl. 16»)` } };
    rule = { ...old, time: at };
    if (rule.freq) { const f = nextRun62({ ...rule, dtstart: osloParts62(now).date }, now); if (f != null) rule.dtstart = osloParts62(f).date; }
    else if (osloToUtc62(rule.dtstart, at) <= now) return { error: `Kl. ${at} ${rule.dtstart === osloParts62(now).date ? 'i dag ' : ''}har allerede vært` };
    explicit = true;
  }
  const label = labelOf62(rule, osloParts62(now).date);
  const when = { text: wt, label, rrule: ruleToRRule62(rule), dtstart: `${rule.dtstart}T${rule.time}`, until: rule.until ?? null, explicitTime: explicit };
  return { args: { ...base, action: 'move', from: { label: row.label }, to: { label, when } }, summary: `Flytte «${row.title}» fra «${row.label}» til «${label}»? Stemmer det?` };
}
async function runChange(a, ctx) {
  const now = nowOfCtx62(ctx);
  if (a.builtin) {
    const s = briefSettings(ctx.user);
    const { next, errors } = cleanGlimtPatch({ briefs: { [a.brief]: { at: a.to.at, on: a.to.on } }, ...(a.to.on && s && s.brief === false ? { brief: true } : {}) }, s, ctx.user);
    if (errors?.length) return { status: 'failed', error: errors[0] };
    saveGlimtSettings(ctx.user, next);
    const b = builtinBriefs62(ctx.user, now).find((x) => x.id === a.builtin);
    return { status: 'done', result: { schedule: b, updated: true, open: OPEN62 }, cards: b ? [scheduleCard62(b, now)] : [] };
  }
  const row = rowOf62(ctx.user, a.id);
  if (!row) return { status: 'failed', error: 'Fant ikke oppgaven' };
  if (a.action === 'delete') { deleteSchedule62(ctx.user, a.id); return { status: 'done', result: { schedule: { id: a.id, title: a.title }, deleted: true, open: OPEN62 } }; }
  if (a.action === 'pause') { const r = updateSchedule62(ctx.user, a.id, { status: 'paused', next_run_at: null }, now); const s = publicSchedule62(r, { now }); return { status: 'done', result: { schedule: s, stopped: true, open: OPEN62 }, cards: [scheduleCard62(s, now)] }; }
  if (a.action === 'resume') {
    const nx = nextOf62({ ...row, status: 'active' }, now, { quiet: sched62(ctx.user).quiet });
    if (nx == null) return { status: 'failed', error: 'Oppgaven har ingen flere kjøringer (sluttdatoen er passert)' };
    const r = updateSchedule62(ctx.user, a.id, { status: 'active', next_run_at: nx }, now); const s = publicSchedule62(r, { now }); return { status: 'done', result: { schedule: s, updated: true, open: OPEN62 }, cards: [scheduleCard62(s, now)] };
  }
  const w = a.to.when;
  const tmp = { ...row, rrule: w.rrule, dtstart: w.dtstart, until: w.until, explicit_time: w.explicitTime ? 1 : 0, status: 'active' };
  const nx = nextOf62(tmp, now, { quiet: sched62(ctx.user).quiet });
  if (nx == null) return { status: 'failed', error: 'Fant ingen kjøring fram i tid' };
  const sumTask = { ...publicSchedule62(tmp, { now, lastRun: null }), label: w.label, params: J(row.params, {}), condition: J(row.condition, null) };
  const r = updateSchedule62(ctx.user, a.id, { rrule: w.rrule, dtstart: w.dtstart, until: w.until, explicit_time: w.explicitTime ? 1 : 0, label: w.label, when_text: w.text, status: 'active', next_run_at: nx, summary: summaryOf62(sumTask) }, now);
  const s = publicSchedule62(r, { now });
  return { status: 'done', result: { schedule: s, updated: true, open: OPEN62 }, cards: [scheduleCard62(s, now)] };
}
export const updateTool62 = {
  name: 'schedule.update', module: 'home', destructive: true,
  description: 'Endre en fast oppgave eller brief: flytte tidspunktet, sette på pause eller slå på igjen (krever bekreftelse). «Flytt morgenbriefen til 06:30».',
  parameters: S({ target: sTxt('Hvilken oppgave («strømprisvarselet», «morgenbriefen»)'), when: sTxt('Nytt tidspunkt slik brukeren skrev det («06:30», «hver fredag kl. 16»)'), action: sTxt('move | pause | resume') }),
  validate: (args, ctx) => validateChange(args, ctx, 'update'),
  run: runChange,
};
export const deleteTool62 = {
  name: 'schedule.delete', module: 'home', destructive: true,
  description: 'Stoppe (pause) eller slette en fast oppgave eller brief (krever bekreftelse). «Stopp strømprisvarselet».',
  parameters: S({ target: sTxt('Hvilken oppgave («strømprisvarselet», «husleia»)') }),
  validate: (args, ctx) => validateChange(args, ctx, 'delete'),
  run: runChange,
};
const changeSentence = (a, r, today) => {
  const s = r.result.schedule ?? {};
  if (a.builtin) return a.action === 'move' ? `${a.title}en kommer nå kl. ${a.to.at}.` : a.to.on ? `${a.title}en er slått på (kl. ${a.to.at}).` : `${a.title}en er slått av.`;
  if (r.result.deleted) return `Slettet den faste oppgaven «${a.title}».`;
  if (r.result.stopped) return `Stoppet «${a.title}». Du kan slå den på igjen under Innstillinger → Faste oppgaver.`;
  if (a.action === 'resume') return `«${a.title}» er på igjen. Neste gang ${relWhen(Date.parse(s.nextRunAt ?? '') || null, dayNow(today))}.`;
  return `Flyttet «${a.title}» til ${String(s.when?.label ?? a.to?.label ?? '').replace(/^./, (c) => c.toLowerCase())}. Neste gang ${relWhen(Date.parse(s.nextRunAt ?? '') || null, dayNow(today))}.`;
};
SENTENCES46['schedule.update'] = changeSentence;
SENTENCES46['schedule.delete'] = changeSentence;
FAIL_TEXT46['schedule.update'] = 'Fikk ikke endret den faste oppgaven';
FAIL_TEXT46['schedule.delete'] = 'Fikk ikke stoppet den faste oppgaven';

for (const t of [createTool62, listTool62, updateTool62, deleteTool62]) {
  if (TOOL45[t.name]) continue;
  const i = TOOLS45.findIndex((x) => x.name === 'app.answer');
  TOOLS45.splice(i < 0 ? TOOLS45.length : i, 0, t);
  TOOL45[t.name] = t;
}

/* ---------------- Lokal plan (modellen nede) og hint til planleggeren ---------------- */

const LIST_RE = /(?<![a-zæøå])(?:hvilke|hva\s+er|vis|list(?:\s+opp)?|har\s+jeg\s+noen)\b.*(?:faste|planlagte|gjentakende)\s+(?:oppgaver|varsler|påminnelser|jobber)|^(?:mine\s+)?(?:faste|planlagte)\s+oppgaver\s*\??$/;
const SCHED_NOUN = /(?<![a-zæøå])(varsel\w*|varslet|påminnelse\w*|\w*brief\w*|fast\w*\s+oppgave\w*|planlagt\w*\s+oppgave\w*|strømpris\w*\s*(?:varsel\w*|melding\w*)?|faste\s+oppgaven)(?![a-zæøå])/;
const MAKE_RE = /(?<![a-zæøå])(send|gi|minn|påminn\w*|si\s+fra|gi\s+beskjed|varsle?|oppsummer\w*|fortell|husk|les|sjekk)(?![a-zæøå])/;
/** Lokal plan for planlagte oppgaver (bare når teksten er tydelig). → plan | null */
export function localSched62(text, { today, now } = {}) {
  const t = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const P = (tool) => ({ intent: tool === 'schedule.list' ? 'summarize' : tool === 'schedule.create' ? 'create' : tool === 'schedule.delete' ? 'delete' : 'update', module: 'home', calls: [{ tool, args: {} }], engine: 'lokal' });
  if (LIST_RE.test(t)) return P('schedule.list');
  if (/^(?:kan\s+du\s+)?(?:stopp|stans|slett|fjern|skru\s+av|slå\s+av|avslutt|slutt\s+med|ikke\s+send)\b/.test(t) && SCHED_NOUN.test(t)) return P('schedule.delete');
  if (/^(?:kan\s+du\s+)?(?:flytt|endre|sett|utsett)\b/.test(t) && SCHED_NOUN.test(t) && !/kalender|avtale/.test(t)) return P('schedule.update');
  if (/^(?:kan\s+du\s+)?(?:pause|start|slå\s+på|skru\s+på)\b/.test(t) && SCHED_NOUN.test(t)) return P('schedule.update');
  if (!MAKE_RE.test(t) || /^(?:hva|hvordan|hvorfor|når\s+er|hvem)\b/.test(t)) return null;
  const n = now ?? Date.now();
  const r = parseRecurrence62(t, { now: n, today: today ?? osloParts62(n).date });
  if (r.ok && r.rule.freq) return P('schedule.create');
  if (/(?<![a-zæøå])(si\s+fra|gi\s+beskjed|varsle?\s+meg)\s+(?:hvis|om|dersom|når)(?![a-zæøå])/.test(t) && /(strøm|temperatur|minusgrader|frost|regn|nedbør|grader)/.test(t)) return P('schedule.create');
  return null;
}
registerLocalPlan62(localSched62);
