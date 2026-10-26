// Prompt 64 (prompt 49 del 7, D7WEB): «Kvalitet over tid» på web. Formene står i $S/SERVER64-API.md (alt under /api/glimt/quality):
//   GET  /runs[?limit=]            → {items:[Run], running, enabled, keepDays}          (admin, 403 ellers)
//   GET  /runs/:id[?format=md|json] → RunDetail (Run + cases) · md-rapporten · hele eval-resultatet
//   POST /run-now {runs?}           → 202 {ok, run} · 409 {error, run} · 200 {ok:false, run(skipped)}
//   POST /abort                     → {ok, run} · 409 {error}
//   GET  /weekly[?week=2026-W44]    → Weekly (egne tall, admin får også system)
//   GET/PUT /settings {scope:'user', weekly} | {scope:'server', nightly?, weekly?, runs?, maxMinutes?, interactiveWaitSec?, keepDays?}
// Selvstendig modul (lett å flytte når Innstillinger omorganiseres): (1) siden Innstillinger → Kvalitet (mountQuality64 i en
// [data-mount-host]-plass, se settings64.js): ukerapporten (inneværende og tidligere uker) og – for admin – nattlige eval-kjøringer
// med status, bestått, svartid p50/p90, regresjoner, rapporten og «Kjør nå»/«Avbryt». (2) Brytere i AI-kontroll → Valg som fyller
// [data-q64set]. (3) Lenkene fra pushene (#/innstillinger/kvalitet/run/<id> og …/uke/<uke>) åpner siden på riktig kjøring/uke.
// Eldre server (404): siden sier «Oppdater serveren», og ingenting vises i AI-kontroll.
import { when62 } from './sched62.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const ROUTE64 = '/#/innstillinger/kvalitet';
export const RUNS64 = [1, 2, 3, 4, 5];
export const MAXMIN64 = [60, 120, 180, 240, 360];
export const WAIT64 = [10, 20, 30, 60, 120];
export const KEEP64 = [7, 14, 30, 90, 180];
const LAB = { nightly: 'Nattlig eval', weekly: 'Ukerapport' };
const HELP = {
  nightly: 'Kl. 02 hver natt kjøres eval-testene mot den lokale modellen. Du får push bare når noe som var grønt har blitt rødt. Avbrytes hvis noen bruker Glimt.',
  weekly: 'Søndag kl. 20: én kort melding med antall forespørsler, andel løst på første forsøk, rettelser, nye oppskrifter, hurtigvei og median svartid.',
};
const ST = {
  running: ['Kjører', 'run'], ok: ['OK', 'ok'], regression: ['Regresjon', 'bad'], failed: ['Feilet', 'bad'], skipped: ['Hoppet over', 'mut'], aborted: ['Avbrutt', 'warn'],
};
const CST = { green: ['Grønn', 'ok'], red: ['Rød', 'bad'], partial: ['Delvis', 'warn'], env: ['Miljøfeil', 'mut'] };

/* ---------- Hjelpere (rene, testes i test/p64-web.test.js) ---------- */
/** Lenkene fra pushene: «#/innstillinger/kvalitet», «…/run/q…» og «…/uke/2026-W44». null = ikke vår adresse. */
export function parseRoute64(hash) {
  const m = String(hash ?? '').match(/^#\/innstillinger\/(?:ai\/)?kvalitet(?:\/(run|uke)\/([\w-]+))?\/?$/);
  if (!m) return null;
  if (m[1] === 'run') return /^q[0-9a-f]{14}$/.test(m[2]) ? { run: m[2] } : {};
  if (m[1] === 'uke') return /^\d{4}-W\d{2}$/.test(m[2]) ? { week: m[2] } : {};
  return {};
}
/** Svartid: «812 ms», «4,1 s», «3 min 12 s», «2 t 14 min». '–' for ukjent. */
export function ms64(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '–';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(Math.round(ms / 100) / 10).toFixed(1).replace('.', ',')} s`;
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h} t${m ? ` ${m} min` : ''}` : `${m} min${r ? ` ${r} s` : ''}`;
}
/** Andel: 0.876 → «88 %». '–' for ukjent. */
export const pct64 = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)} %` : '–');
/** Statusmerket for en kjøring: [tekst, klasse]. */
export const status64 = (s) => ST[s] ?? [String(s ?? 'Ukjent'), 'mut'];
export const caseStatus64 = (s) => CST[s] ?? [String(s ?? '–'), 'mut'];
/** Hovedlinja for en fullført kjøring: «120/129 bestått · 40/43 caser grønne · p50 4,1 s · p90 18,2 s». */
export function runLine64(r = {}) {
  if (r.status === 'running') return progress64(r);
  if (!Number.isFinite(r.total) || !r.total) return r.reason || (r.status === 'skipped' ? 'Ikke kjørt' : '');
  return [`${r.passed}/${r.total} bestått`, Number.isFinite(r.cases) ? `${r.greenCases ?? 0}/${r.cases} caser grønne` : '',
    Number.isFinite(r.p50Ms) ? `p50 ${ms64(r.p50Ms)}` : '', Number.isFinite(r.p90Ms) ? `p90 ${ms64(r.p90Ms)}` : ''].filter(Boolean).join(' · ');
}
/** Tilleggslinja: modellfeil, miljøfeil (teller ikke som røde), nye caser, bedre caser, varsel sendt. */
export function extraLine64(r = {}) {
  const n = (v, one, many) => (v ? `${v} ${v === 1 ? one : many}` : '');
  return [n(r.modelFailures, 'modellfeil', 'modellfeil'), r.envFailures ? `${n(r.envFailures, 'miljøfeil', 'miljøfeil')} (teller ikke)` : '',
    n((r.improved ?? []).length, 'case bedre', 'caser bedre'), n(r.newCases, 'ny case', 'nye caser'), r.notified ? 'push sendt' : ''].filter(Boolean).join(' · ');
}
/** «12 av 129 · 05-middag-fredag». */
export function progress64(r = {}) {
  const p = r.progress;
  if (!p || !Number.isFinite(p.total) || !p.total) return 'Starter …';
  return [`${p.done ?? 0} av ${p.total}`, p.current || ''].filter(Boolean).join(' · ');
}
export const progressPct64 = (r = {}) => (r.progress?.total ? Math.max(0, Math.min(100, Math.round(((r.progress.done ?? 0) / r.progress.total) * 100))) : 0);
/** En regresjon på én linje: «07-vaer-to-steder 3/3 → 1/3: grunn». */
export const regLine64 = (x = {}) => `${x.caseId ?? x.id ?? ''} ${x.before ?? '?'} → ${x.now ?? '?'}${x.reason ? `: ${x.reason}` : ''}`;
/** Varighet for kjøringen («2 t 14 min»), ellers ''. */
export const dur64 = (r = {}) => (Number.isFinite(r.ms) ? ms64(r.ms) : '');
/** Casene i detaljvisningen: regresjoner først, så røde, delvise, miljøfeil og til slutt grønne. */
export function sortCases64(cases = []) {
  const rank = (c) => (c.regression ? 0 : { red: 1, partial: 2, env: 3, green: 4 }[c.status] ?? 5);
  return [...cases].sort((a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id)));
}
/** Tallene i ukerapporten: [[etikett, verdi, undertekst?]]. Svar-cache står bare i full rapport. */
export function weeklyRows64(u = {}) {
  if (!u || typeof u !== 'object') return [];
  return [
    ['Forespørsler', String(u.requests ?? 0)],
    ['Løst på første forsøk', pct64(u.firstTryShare), Number.isFinite(u.firstTry) ? `${u.firstTry} av ${u.requests ?? 0}` : ''],
    ['Rettelser', String(u.corrections ?? 0)],
    ['Nye oppskrifter', String(u.newRecipes ?? 0)],
    ['Hurtigvei', pct64(u.fastShare), Number.isFinite(u.fast) ? `${u.fast} svar` : ''],
    ['Svar-cache', pct64(u.cacheShare), Number.isFinite(u.cache) ? `${u.cache} svar` : ''],
    ['Median svartid', ms64(u.medianMs), Number.isFinite(u.p90Ms) ? `p90 ${ms64(u.p90Ms)}` : ''],
  ];
}
/** Systemtallene (admin) på én linje. */
export function systemLine64(s) {
  if (!s) return '';
  return [`${s.requests ?? 0} forespørsler fra ${s.users ?? 0} ${s.users === 1 ? 'bruker' : 'brukere'}`, `${pct64(s.firstTryShare)} første forsøk`,
    `${s.corrections ?? 0} rettelser`, `${s.newRecipes ?? 0} nye oppskrifter`, `hurtigvei ${pct64(s.fastShare)}`, `median ${ms64(s.medianMs)}`].join(' · ');
}
export function evalWeekLine64(e) {
  if (!e) return '';
  const n = (v, one, many) => `${v ?? 0} ${v === 1 ? one : many}`;
  return [`${n(e.runs, 'nattlig kjøring', 'nattlige kjøringer')}`, `${e.completed ?? 0} fullført`, n(e.regressions, 'regresjon', 'regresjoner'),
    e.aborted ? `${e.aborted} avbrutt` : '', e.skipped ? `${e.skipped} hoppet over` : ''].filter(Boolean).join(' · ');
}
/** Server-PUT for en admin-verdi innenfor grensene i SERVER64-API.md. null = ugyldig. */
export function serverBody64(key, v) {
  const lim = { runs: [1, 5], maxMinutes: [15, 360], interactiveWaitSec: [5, 120], keepDays: [7, 180] }[key];
  if (!lim) return ['nightly', 'weekly'].includes(key) && typeof v === 'boolean' ? { scope: 'server', [key]: v } : null;
  const n = Number(v);
  return Number.isInteger(n) && n >= lim[0] && n <= lim[1] ? { scope: 'server', [key]: n } : null;
}
/** Brukerens ukerapport-bryter: null når valget er det samme som serverens (følg standard). */
export const userWeeklyBody64 = (next, srv) => ({ scope: 'user', weekly: next === srv ? null : next });

/* ---------- Data ---------- */
const Q = { runs: null, runsErr: '', admin403: false, set: null, wk: null, wkErr: '', week: null, missing: false, at: 0, loading: null, open: null, det: {}, md: {}, msg: '', smsg: '', busy: false, sbusy: false, want: null, poll: 0 };
async function call(path, method = 'GET', json, raw = false) {
  const r = await fetch(`/api/glimt/quality${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined });
  if (raw && r.ok) return r.text();
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status === 404 ? 'Fant ikke dette' : `Feil ${r.status}`)), { status: r.status, data: d });
  return Object.assign(d, { _status: r.status });
}
const wkQ = () => (Q.week ? `?week=${encodeURIComponent(Q.week)}` : '');
export async function loadQuality64(force = false) {
  if (!force && Q.at && Date.now() - Q.at < 15_000) return Q;
  if (Q.loading) return Q.loading;
  Q.loading = (async () => {
    const [s, w, r] = await Promise.allSettled([call('/settings'), call(`/weekly${wkQ()}`), call('/runs?limit=30')]);
    if (s.status === 'rejected' && [404, 405].includes(s.reason.status)) Q.missing = true;
    else {
      Q.missing = false;
      if (s.status === 'fulfilled') Q.set = s.value;
      if (w.status === 'fulfilled') { Q.wk = w.value; Q.wkErr = ''; } else Q.wkErr = w.reason.message;
      if (r.status === 'fulfilled') { Q.runs = r.value; Q.runsErr = ''; Q.admin403 = false; } else { Q.admin403 = r.reason.status === 403; Q.runsErr = Q.admin403 ? '' : r.reason.message; }
    }
    Q.at = Date.now(); Q.loading = null;
    pollIfRunning();
    return Q;
  })();
  return Q.loading;
}
const isAdmin = () => !!Q.set?.admin && !Q.admin403;
const running = () => (Q.runs ? Q.runs.running ?? null : Q.set?.running ?? null); // /runs er ferskest (pollingen henter bare den)

/* ---------- Siden: Innstillinger → Kvalitet ---------- */
const chip = ([t, c]) => `<i class="q64-chip q64-${c}">${esc(t)}</i>`;
const btn = (attr, label, cls = '', dis = false) => `<button type="button" class="q64-b${cls ? ` ${cls}` : ''}" ${attr}${dis ? ' disabled' : ''}>${label}</button>`;
const empty = (t) => `<div class="sg-row"><span class="sg-txt"><span>${t}</span></span></div>`;

function weeklyHtml() {
  const w = Q.wk;
  if (!w) return `<section class="sg" data-q64-wk><h3 class="sg-t">Ukerapport</h3><div class="sg-box">${empty(Q.wkErr ? `Serveren svarte: ${esc(Q.wkErr)}` : 'Laster …')}</div></section>`;
  const weeks = Array.isArray(w.weeks) ? w.weeks : [];
  const i = weeks.findIndex((x) => x.week === w.week);
  const older = i >= 0 ? weeks[i + 1] : null, newer = i > 0 ? weeks[i - 1] : null;
  const nav = `<div class="q64-wnav" role="group" aria-label="Velg uke">${btn(`data-q64-week="${esc(older?.week ?? '')}" aria-label="Uka før"`, '‹', '', !older)}
    <select data-q64-wsel aria-label="Uke">${(weeks.length ? weeks : [{ week: w.week, label: w.label }]).map((x) => `<option value="${esc(x.week)}"${x.week === w.week ? ' selected' : ''}>${esc(x.label ?? x.week)}</option>`).join('')}</select>
    ${btn(`data-q64-week="${esc(newer?.week ?? '')}" aria-label="Uka etter"`, '›', '', !newer)}</div>`;
  const tiles = weeklyRows64(w.user).map(([l, v, s]) => `<div class="q64-tile"><span>${esc(l)}</span><b>${esc(v)}</b>${s ? `<small>${esc(s)}</small>` : ''}</div>`).join('');
  const sent = w.sentAt ? `Sendt som push ${esc(when62(w.sentAt))}` : w.partial ? 'Uka er ikke ferdig – tallene oppdateres fortløpende' : w.enabled === false ? 'Ukerapporten er slått av – ingen push' : 'Ikke sendt';
  const sys = w.system ? `<div class="sg-row q64-sys"><span class="sg-txt"><b>Alle brukere (admin)</b><span>${esc(systemLine64(w.system))}</span>${w.system.eval ? `<span>${esc(evalWeekLine64(w.system.eval))}</span>` : ''}</span></div>` : '';
  return `<section class="sg" data-q64-wk><h3 class="sg-t">Ukerapport</h3><div class="sg-box">
    <div class="sg-row q64-wh"><span class="sg-txt"><b data-no-i18n>${esc(w.label ?? w.week)}${w.partial ? ' · så langt' : ''}</b><span>${sent}</span></span>${nav}</div>
    ${w.text ? `<div class="sg-row"><span class="sg-txt"><span class="q64-text" data-no-i18n>${esc(w.text)}</span></span></div>` : ''}
    <div class="q64-tiles">${tiles}</div>${sys}</div>
    <div class="sg-note">Bare dine egne tall. «Løst på første forsøk» betyr at Glimt ikke feilet, ikke måtte spørre, ikke ble rettet og ikke fikk tommel ned.</div></section>`;
}

function runHead(r) {
  const s = status64(r.status), when = when62(r.startedAt);
  const sub = [when, r.trigger === 'run-now' ? 'kjørt manuelt' : '', dur64(r), r.model || ''].filter(Boolean).join(' · ');
  return `<span class="sg-txt"><b>${chip(s)}<span data-no-i18n>${esc(runLine64(r) || s[0])}</span></b><span>${esc(sub)}</span>${extraLine64(r) ? `<span class="q64-l2">${esc(extraLine64(r))}</span>` : ''}${r.reason && r.status !== 'running' ? `<span class="q64-l2" data-no-i18n>${esc(r.reason)}</span>` : ''}</span>`;
}
function regsHtml(r) {
  const R = r.regressions ?? [];
  return R.length ? `<ul class="q64-regs">${R.map((x) => `<li data-no-i18n><b>${esc(x.caseId)}</b> ${esc(x.before)} → ${esc(x.now)}${x.reason ? ` <span>${esc(x.reason)}</span>` : ''}</li>`).join('')}</ul>` : '';
}
function detailHtml(r) {
  const d = Q.det[r.id], id = esc(r.id), base = `/api/glimt/quality/runs/${encodeURIComponent(r.id)}`;
  const links = r.report?.md || r.report?.json ? `<div class="q64-acts">${r.report?.md ? btn(`data-q64-md="${id}"`, Q.md[r.id]?.show ? 'Skjul rapporten' : 'Åpne rapporten', 'pri') : ''}${r.report?.md ? `<a class="q64-b" href="${base}?format=md" download="eval-${id}.md">Last ned .md</a>` : ''}${r.report?.json ? `<a class="q64-b" href="${base}?format=json" download="eval-${id}.json">Last ned .json</a>` : ''}</div>` : '';
  const md = Q.md[r.id]?.show ? `<pre class="q64-md" data-no-i18n tabindex="0">${esc(Q.md[r.id].text ?? (Q.md[r.id].err ? `Kunne ikke hente rapporten: ${Q.md[r.id].err}` : 'Henter rapporten …'))}</pre>` : '';
  let cases = '';
  if (!d) cases = '<div class="q64-mut">Henter casene …</div>';
  else if (d.err) cases = `<div class="q64-mut">${esc(d.err)}</div>`;
  else if (Array.isArray(d.cases) && d.cases.length) {
    const all = sortCases64(d.cases), shown = Q.allCases === r.id ? all : all.filter((c) => c.status !== 'green' || c.regression), hidden = all.length - shown.length;
    cases = `<div class="q64-cases" role="table" aria-label="Caser">${shown.map((c) => `<div class="q64-case${c.regression ? ' reg' : ''}" role="row"><span role="cell">${chip(caseStatus64(c.status))}<b data-no-i18n>${esc(c.id)}</b>${c.regression ? '<i class="q64-chip q64-bad">ble rød</i>' : ''}</span>
      <span role="cell" class="q64-mono">${c.passes ?? 0}/${c.runs ?? 0}${c.envRuns ? ` (+${c.envRuns} miljø)` : ''}${c.baseline ? ` · før ${c.baseline.passes}/${c.baseline.runs}` : ''} · p50 ${esc(ms64(c.p50Ms))}</span>
      ${c.title ? `<span role="cell" class="q64-l2" data-no-i18n>${esc(c.title)}</span>` : ''}${c.reason ? `<span role="cell" class="q64-l2 q64-why" data-no-i18n>${esc(c.reason)}</span>` : ''}${c.status === 'env' && c.envReasons?.length ? `<span role="cell" class="q64-l2" data-no-i18n>${esc(c.envReasons[0])}</span>` : ''}</div>`).join('') || '<div class="q64-mut">Alle caser er grønne.</div>'}</div>
      ${hidden > 0 ? btn(`data-q64-all="${id}"`, `Vis alle ${all.length} caser (${hidden} grønne til)`) : Q.allCases === r.id ? btn(`data-q64-all=""`, 'Skjul grønne') : ''}`;
  }
  const meta = [r.backend, r.url, r.commit ? `commit ${r.commit}` : '', r.runsPerCase ? `${r.runsPerCase} kjøringer per case` : '', r.baselineRunId ? `sammenlignet med ${r.baselineRunId}` : 'ingen tidligere kjøring å sammenligne med'].filter(Boolean).join(' · ');
  return `<div class="q64-det">${regsHtml(r)}${cases}<div class="q64-l2" data-no-i18n>${esc(meta)}</div>${links}${md}</div>`;
}
function runHtml(r) {
  const open = Q.open === r.id, id = esc(r.id);
  return `<div class="q64-run${open ? ' open' : ''}" data-q64-rid="${id}"><button type="button" class="sg-row q64-head" data-q64-open="${id}" aria-expanded="${open}">${runHead(r)}<span class="q64-chev" aria-hidden="true">${open ? '▾' : '▸'}</span></button>
    ${!open && (r.regressions ?? []).length ? `<div class="q64-det">${regsHtml(r)}</div>` : ''}${open ? detailHtml(r) : ''}</div>`;
}
function runningHtml(r) {
  if (!r) return '';
  const pct = progressPct64(r);
  return `<div class="sg-row q64-live" data-q64-live><span class="sg-txt"><b>${chip(status64('running'))}Eval kjører · ${esc(progress64(r))}</b><span>Startet ${esc(when62(r.startedAt))}${r.model ? ` · ${esc(r.model)}` : ''} · avbrytes av seg selv hvis noen venter på Glimt</span>
    <span class="q64-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span></span>${btn('data-q64-abort', 'Avbryt', 'bad', Q.busy)}</div>`;
}
function evalHtml() {
  if (Q.admin403 || (Q.set && !Q.set.admin)) return '';
  const S = Q.set, D = Q.runs, run = running();
  if (!D) return `<section class="sg" data-q64-eval><h3 class="sg-t">Nattlig eval</h3><div class="sg-box">${empty(Q.runsErr ? `Serveren svarte: ${esc(Q.runsErr)}` : 'Laster …')}</div></section>`;
  const sch = S?.schedules?.nightly, on = S?.settings?.nightly !== false && D.enabled !== false;
  const next = !on ? 'Nattlig eval er slått av' : sch?.status === 'paused' ? 'Satt på pause i Faste oppgaver' : sch?.nextRunAt ? `Neste ${when62(sch.nextRunAt)}` : 'Hver natt kl. 02';
  const items = (D.items ?? []).filter((x) => x.status !== 'running' || x.id !== run?.id);
  const head = `<div class="sg-row q64-eh"><span class="sg-txt"><b>${on ? 'Kjører hver natt kl. 02' : 'Slått av'}</b><span>${esc(next)} · rapportene lagres i ${esc(D.keepDays ?? S?.server?.keepDays ?? 30)} dager · push bare når noe grønt blir rødt</span></span>${btn('data-q64-run', run ? 'Kjører …' : 'Kjør nå', 'pri', Q.busy || !!run)}</div>`;
  const msg = Q.msg ? `<div class="sg-row"><span class="sg-txt"><span role="status">${esc(Q.msg)}</span></span></div>` : '';
  const list = items.length ? items.map(runHtml).join('') : empty('Ingen kjøringer ennå. Den første kjøres i natt kl. 02, eller trykk «Kjør nå».');
  return `<section class="sg" data-q64-eval><h3 class="sg-t">Nattlig eval</h3><div class="sg-box">${head}${msg}${runningHtml(run)}${list}</div>
    <div class="sg-note">Eval-testene (eval/ og eval/learned/) kjøres mot den lokale modellen med egen testdatabase – aldri dine data. Miljøfeil (modellen svarte ikke, andre modeller lastet) regnes ikke som røde. Bare for administrator.</div></section>`;
}
function pageToggles() {
  const d = Q.set;
  if (!d) return '';
  const srvW = d.server?.weekly !== false, own = d.user?.weekly, onW = srvW && (own ?? srvW);
  const rows = [`<button type="button" class="sg-row q64-tg" data-q64-user="weekly" role="switch" aria-checked="${onW}"${Q.sbusy || !srvW ? ' disabled' : ''}><span class="sg-txt"><b>${lab('weekly')}</b><span>${!srvW ? 'Slått av for alle av administrator' : help('weekly')}</span></span><span class="sg-sw"></span></button>`];
  if (isAdmin()) rows.push(`<button type="button" class="sg-row q64-tg" data-q64-server="nightly" role="switch" aria-checked="${d.server?.nightly !== false}"${Q.sbusy ? ' disabled' : ''}><span class="sg-txt"><b>${lab('nightly')} (admin)</b><span>${help('nightly')}</span></span><span class="sg-sw"></span></button>`);
  return `<section class="sg"><h3 class="sg-t">Valg</h3><div class="sg-box">${rows.join('')}</div>${Q.smsg ? `<div class="sg-note" role="status">${esc(Q.smsg)}</div>` : ''}<div class="sg-note">Flere valg (kjøringer per case, tidsgrense, hvor lenge rapportene lagres) i AI-kontroll → Valg.</div></section>`;
}
export function pageHtml64() {
  if (Q.missing) return '<section class="sg"><div class="sg-box"><div class="sg-row"><span class="sg-txt"><span>Serveren har ikke kvalitetsrapporter ennå. Oppdater serveren.</span></span></div></div></section>';
  if (!Q.set && !Q.wk) return `<section class="sg"><div class="sg-box">${empty('Laster …')}</div></section>`;
  return `<div class="q64" data-q64>${weeklyHtml()}${evalHtml()}${pageToggles()}</div>`;
}

/* ---------- AI-kontroll → Valg ---------- */
const sw = (v) => `<span class="ac-sw${v ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const lab = (k) => esc(Q.set?.labels?.[k] ?? LAB[k]), help = (k) => esc(Q.set?.help?.[k] && Q.set.help[k] !== '…' ? Q.set.help[k] : HELP[k]);
const seg = (k, name, sub, opts, fmt, dis) => {
  const cur = Q.set?.server?.[k];
  return `<div class="ac-par"><span class="ac-row ac-sb"><span class="ac-col"><b>${name}</b><span>${sub}</span></span><b class="ac-mono">${esc(cur != null ? fmt(cur) : '–')}</b></span><div class="ac-seg" role="group" aria-label="${name}">${opts.map((n) => `<button type="button" class="${n === cur ? 'on' : ''}" data-q64-par="${k}" data-v="${n}" aria-pressed="${n === cur}"${dis ? ' disabled' : ''}>${esc(fmt(n))}</button>`).join('')}</div></div>`;
};
export function settingsHtml64() {
  if (Q.missing) return '';
  const d = Q.set;
  if (!d) return `<div class="ac-sec"><span class="ac-lab">KVALITET OVER TID</span><div class="ac-card ac-list"><div class="ac-mut" style="padding:12px 0">Laster …</div></div></div>`;
  const srvW = d.server?.weekly !== false, own = d.user?.weekly, onW = srvW && (own ?? srvW);
  const mine = `<button type="button" class="ac-li" data-q64-user="weekly" role="switch" aria-checked="${onW}"${Q.sbusy || !srvW ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab('weekly')}</b><span>${!srvW ? 'Slått av for alle av administrator' : `${help('weekly')}${own == null ? '' : ' · Ditt eget valg'}`}</span></span>${sw(onW)}</button>`;
  const link = '<button type="button" class="ac-li" data-q64-go><span class="ac-col ac-grow"><b>Se kvalitet</b><span>Innstillinger → Kvalitet: ukerapporten og nattlige eval-kjøringer</span></span><span aria-hidden="true">›</span></button>';
  let admin = '';
  if (d.admin) {
    const tog = (k, sub) => { const v = d.server?.[k] !== false; return `<button type="button" class="ac-li" data-q64-server="${k}" role="switch" aria-checked="${v}"${Q.sbusy ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${k === 'weekly' ? 'Ukerapport for alle' : lab(k)}</b><span>${sub}</span></span>${sw(v)}</button>`; };
    const off = d.server?.nightly === false || Q.sbusy;
    admin = `<div class="ac-sec" data-q64-admin><span class="ac-lab">KVALITET · NATTLIG EVAL (ADMIN)</span><div class="ac-card ac-list">${tog('nightly', help('nightly'))}${tog('weekly', 'Av her slår ukerapporten av for alle brukere.')}
      ${seg('runs', 'Kjøringer per case', 'Hver test kjøres så mange ganger – suksessraten rapporteres', RUNS64, (n) => `${n}×`, off)}
      ${seg('maxMinutes', 'Tidsgrense', 'Evalen stopper etter så lang tid', MAXMIN64, (n) => (n % 60 ? `${n} min` : `${n / 60} t`), off)}
      ${seg('interactiveWaitSec', 'Gi plass etter', 'Avbryt hvis en vanlig forespørsel venter så lenge', WAIT64, (n) => `${n} s`, off)}
      ${seg('keepDays', 'Lagre rapporter', 'Eldre rapporter slettes fra serveren', KEEP64, (n) => `${n} d`, Q.sbusy)}</div>
      <div class="ac-note">«Nattlig eval» står også i Faste oppgaver som systemoppgave, der den kan settes på pause.</div></div>`;
  }
  return `<div class="ac-sec" data-q64-sec><span class="ac-lab">KVALITET OVER TID · FOR MEG</span><div class="ac-card ac-list">${mine}${link}</div>${Q.smsg ? `<div class="ac-note" role="status">${esc(Q.smsg)}</div>` : ''}</div>${admin}`;
}

/* ---------- Tegning og hendelser ---------- */
const STYLE64 = `.q64-chip{font-style:normal;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;margin-right:8px;border:1px solid currentColor;white-space:nowrap;vertical-align:1px}
.q64-ok{color:#2f9e5b}.q64-bad{color:#d0503c}.q64-warn{color:#b7871a}.q64-run>.sg-row .q64-chip.q64-run,.q64-chip.q64-run{color:#3b82c4}.q64-mut{opacity:.75}
.q64 .sg-txt{min-width:0}.q64 .sg-txt b,.q64 .sg-txt span{overflow-wrap:anywhere}.q64-l2{font-size:13.5px;opacity:.75}
.q64-b{min-height:36px;padding:0 14px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit;font:inherit;font-size:14.5px;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none;flex:none}
.q64-b:hover{background:rgba(127,127,127,.14)}.q64-b.pri{background:rgba(127,127,127,.22);font-weight:600}.q64-b.bad{color:#d0503c}.q64-b:disabled{opacity:.45;cursor:default}
.q64-acts{display:flex;gap:8px;flex-wrap:wrap}
.q64-wh{flex-wrap:wrap;gap:10px}.q64-wnav{display:flex;gap:6px;align-items:center}.q64-wnav select{height:36px;max-width:220px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit;font:inherit;padding:0 8px}
.q64-wnav select option{color:#111;background:#fff}.q64-wnav .q64-b{width:36px;justify-content:center;padding:0}
.q64-text{font-weight:500}
.q64-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;padding:12px 26px 16px;border-top:1px solid rgba(127,127,127,.15)}
.q64-tile{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.1);min-width:0}
.q64-tile>span{font-size:13px;opacity:.75}.q64-tile>b{font-size:22px;font-variant-numeric:tabular-nums}.q64-tile>small{font-size:12.5px;opacity:.7}
.q64-sys{border-top:1px solid rgba(127,127,127,.15)}.q64-sys .sg-txt{display:flex;flex-direction:column;gap:2px}
.q64-eh{flex-wrap:wrap;gap:10px}.q64-run{border-top:1px solid rgba(127,127,127,.15)}
button.q64-head{width:100%;text-align:left;cursor:pointer;border:0;background:transparent;color:inherit;font:inherit}.q64-head .sg-txt{flex:1;display:flex;flex-direction:column;gap:2px}.q64-chev{flex:none;opacity:.6}
.q64-det{display:flex;flex-direction:column;gap:10px;padding:0 26px 14px}
.q64-regs{margin:0;padding-left:18px;color:#d0503c;font-size:14px}.q64-regs span{opacity:.85}.q64-regs b{font-weight:600}
.q64-cases{display:flex;flex-direction:column;border-radius:12px;border:1px solid rgba(127,127,127,.25);overflow:hidden}
.q64-case{display:flex;flex-direction:column;gap:2px;padding:8px 12px;border-top:1px solid rgba(127,127,127,.15);font-size:14px}.q64-case:first-child{border-top:0}.q64-case.reg{background:rgba(208,80,60,.08)}
.q64-case b{overflow-wrap:anywhere}.q64-mono{font-variant-numeric:tabular-nums;font-size:13.5px;opacity:.85}.q64-why{font-style:italic}
.q64-md{margin:0;max-height:60vh;overflow:auto;padding:12px;border-radius:12px;background:rgba(127,127,127,.12);font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.q64-live{flex-wrap:wrap;gap:10px;border-top:1px solid rgba(127,127,127,.15)}.q64-live .sg-txt{flex:1 1 240px;display:flex;flex-direction:column;gap:4px}
.q64-bar{display:block;height:6px;border-radius:3px;background:rgba(127,127,127,.25);overflow:hidden}.q64-bar i{display:block;height:100%;background:#3b82c4;transition:width .4s}
.q64-tg{width:100%;text-align:left;cursor:pointer}
@media (max-width:600px){.q64-tiles{padding:12px 16px 14px;grid-template-columns:repeat(2,minmax(0,1fr))}.q64-det{padding:0 16px 12px}.q64-wnav{width:100%}.q64-wnav select{flex:1;max-width:none}.q64-tile>b{font-size:19px}}`;
function css() { if (typeof document === 'undefined' || document.getElementById('q64-css')) return; const st = document.createElement('style'); st.id = 'q64-css'; st.textContent = STYLE64; document.head.appendChild(st); }
const L = { slot: null };
function repaint() {
  if (L.slot?.isConnected) L.slot.innerHTML = pageHtml64();
  for (const el of document.querySelectorAll('[data-q64set]')) el.innerHTML = settingsHtml64();
  if (Q.want) reveal();
}
/** Siden Innstillinger → Kvalitet tegnes i plassen fra settings64.js. */
export function mountQuality64(slot) {
  css();
  L.slot = slot;
  slot.innerHTML = pageHtml64();
  loadQuality64(!!Q.want).then(async () => { if (Q.want?.week && Q.wk?.week !== Q.want.week) await setWeek(Q.want.week, false); if (Q.want?.run) await openRun(Q.want.run, false); repaint(); });
}
function reveal() {
  const w = Q.want;
  if (!w || !Q.at || !L.slot?.isConnected) return;
  const el = w.run ? L.slot.querySelector(`[data-q64-rid="${CSS.escape(w.run)}"]`) : w.week ? L.slot.querySelector("[data-q64-wk]") : null;
  if (w.run && !el && Q.runs) Q.msg = 'Fant ikke kjøringen – den kan være slettet (rapportene lagres en stund).';
  Q.want = null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function setWeek(week, paint = true) {
  Q.week = week || null;
  try { Q.wk = await call(`/weekly${wkQ()}`); Q.wkErr = ''; } catch (er) { Q.wkErr = er.message; }
  if (paint) repaint();
}
async function openRun(id, paint = true) {
  Q.open = id;
  if (paint) repaint();
  try { const r = await call(`/runs/${encodeURIComponent(id)}`); Q.det[id] = { cases: r.cases ?? [] }; if (Q.runs?.items && !Q.runs.items.some((x) => x.id === id)) Q.runs.items.unshift(r); }
  catch (er) { Q.det[id] = { err: er.status === 404 ? 'Fant ikke kjøringen (rapporten kan være rotert bort).' : `Kunne ikke hente casene: ${er.message}` }; }
  if (paint) repaint();
}
function pollIfRunning() {
  if (typeof window === 'undefined' || Q.poll || !running()) return;
  Q.poll = window.setTimeout(async () => {
    Q.poll = 0;
    if (!L.slot?.isConnected && !document.querySelector('[data-q64set]')) return;
    const was = running()?.id;
    try { Q.runs = await call('/runs?limit=30'); } catch { /* prøver igjen */ }
    if (was && !running()) { const done = Q.runs?.items?.find((x) => x.id === was); Q.msg = done ? `Ferdig: ${status64(done.status)[0]}${runLine64(done) ? ` · ${runLine64(done)}` : ''}` : 'Kjøringen er ferdig'; }
    repaint(); pollIfRunning();
  }, 4000);
}
async function act(fn) {
  Q.busy = true; Q.msg = ''; repaint();
  try { Q.msg = (await fn()) ?? ''; } catch (er) { Q.msg = er.message; }
  Q.busy = false;
  await loadQuality64(true); repaint();
}
async function actSettings(fn) {
  Q.sbusy = true; Q.smsg = ''; repaint();
  try { Q.set = await fn(); Q.smsg = 'Lagret ✓'; } catch (er) { Q.smsg = er.message; }
  Q.sbusy = false;
  await loadQuality64(true); repaint();
}
function goPage() {
  if (L.slot?.isConnected) { L.slot.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (/^\/finans/.test(location.pathname)) { location.href = ROUTE64; return; }
  import('./settings.js').then((m) => m.openSettings('kvalitet')).catch(() => { location.hash = '#/innstillinger/kvalitet'; });
}
/** Lenkene fra pushene har tre ledd (…/kvalitet/run/<id>); settings.js leser bare to, så de skrives om til «#/innstillinger/kvalitet». */
function takeRoute() {
  const r = parseRoute64(location.hash);
  if (!r) return;
  if (r.run || r.week) Q.want = r;
  if (/\/(run|uke)\//.test(location.hash)) { try { history.replaceState(history.state, '', `${location.pathname}${location.search}#/innstillinger/kvalitet`); } catch { /* */ } }
  if (L.slot?.isConnected && Q.want) { const w = Q.want; (async () => { if (w.week) await setWeek(w.week, false); if (w.run) await openRun(w.run, false); repaint(); })(); }
}

if (typeof document !== 'undefined') {
  takeRoute(); // før settings.js leser adressen (denne modulen importeres av settings64.js og evalueres først)
  window.addEventListener('hashchange', takeRoute); // registreres før settings.js sin lytter
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-q64-open],[data-q64-md],[data-q64-all],[data-q64-run],[data-q64-abort],[data-q64-week],[data-q64-user],[data-q64-server],[data-q64-par],[data-q64-go]');
    if (!t || t.disabled) return;
    e.preventDefault();
    const ds = t.dataset;
    if (ds.q64Go != null) { e.stopPropagation(); goPage(); return; }
    if (ds.q64Open) { if (Q.open === ds.q64Open) { Q.open = null; repaint(); } else openRun(ds.q64Open); return; }
    if (ds.q64All != null) { Q.allCases = ds.q64All || null; repaint(); return; }
    if (ds.q64Md) {
      const id = ds.q64Md, cur = Q.md[id];
      if (cur?.show) { cur.show = false; repaint(); return; }
      Q.md[id] = { ...(cur ?? {}), show: true }; repaint();
      if (cur?.text) return;
      call(`/runs/${encodeURIComponent(id)}?format=md`, 'GET', null, true).then((txt) => { Q.md[id].text = String(txt); }, (er) => { Q.md[id].err = er.message; }).then(repaint);
      return;
    }
    if (ds.q64Week != null) { if (ds.q64Week) setWeek(ds.q64Week); return; }
    if (ds.q64Run != null) {
      act(async () => {
        try {
          const r = await call('/run-now', 'POST', {});
          if (r.ok === false) return `Ble ikke kjørt: ${r.run?.reason ?? status64(r.run?.status)[0]}`;
          return 'Eval startet – det tar en stund. Du kan lukke siden.';
        } catch (er) { if (er.status === 409) return 'Eval kjører allerede'; throw er; }
      });
      return;
    }
    if (ds.q64Abort != null) { act(async () => { try { await call('/abort', 'POST'); return 'Avbrutt'; } catch (er) { if (er.status === 409) return 'Ingenting kjører'; throw er; } }); return; }
    if (ds.q64User) {
      const srv = Q.set?.server?.weekly !== false, cur = srv && (Q.set?.user?.weekly ?? srv);
      actSettings(() => call('/settings', 'PUT', userWeeklyBody64(!cur, srv)));
      return;
    }
    if (ds.q64Server) { const body = serverBody64(ds.q64Server, !(Q.set?.server?.[ds.q64Server] !== false)); if (body) actSettings(() => call('/settings', 'PUT', body)); return; }
    if (ds.q64Par) { const body = serverBody64(ds.q64Par, ds.v); if (body && Number(ds.v) !== Q.set?.server?.[ds.q64Par]) actSettings(() => call('/settings', 'PUT', body)); }
  });
  document.addEventListener('change', (e) => { const s = e.target.closest?.('[data-q64-wsel]'); if (s) setWeek(s.value); });
  let raf = 0;
  const decorate = () => {
    const els = [...document.querySelectorAll('[data-q64set]:not([data-q64-done])')];
    if (!els.length) return;
    css();
    for (const el of els) { el.dataset.q64Done = '1'; el.innerHTML = settingsHtml64(); }
    loadQuality64().then(repaint);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };
  const boot = () => { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
}
