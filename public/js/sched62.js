// Prompt 62 (prompt 49 del 2, D2WEB): «Faste oppgaver» på web – planlagte oppgaver i naturlig språk. Formene står i $S/SERVER62-API.md:
//   GET    /api/glimt/schedules[?status=]       → {items:[Schedule], builtin:[Builtin], settings, enabled, counts}
//   POST   /api/glimt/schedules/parse {when, what?, condition?} → {ok, when, condition, nextRuns, summary}  (lagrer ingenting)
//   GET    /api/glimt/schedules/:id             → {item, runs:[Run]}
//   PATCH  /api/glimt/schedules/:id {status?, when?, what?, title?, condition?, zone?} → {ok, item}
//   PATCH  /api/glimt/schedules/brief:<kind> {at?, on?} → {ok, item:Builtin}   (den eksisterende brief-innstillingen)
//   DELETE /api/glimt/schedules/:id             → {ok, removed}
//   POST   /api/glimt/schedules/:id/run-now     → {ok, run, item}   (409 «Kjører allerede»)
//   GET/PUT /api/glimt/schedules/settings {scope, enabled?, conditions?, quiet?, zone?}
// Fire deler: (1) siden Innstillinger → Faste oppgaver (mountSched62 i [data-mount-host] fra settings62.js), (2) brytere i
// AI-kontroll → Valg som fyller [data-sched62] (samme stil som «Glimt lærer»), (3) bekreftelseskortet for en ny/endret/stoppet
// oppgave i Chat og Glimt-søket (schedCard62Html, brukt av glimt-agent45.js og chat.js med de vanlige Ja/Avbryt-knappene fra
// del 3), (4) kvitteringen etter «Ja» (schedDone62Html) med lenke til siden. Eldre server (404): «Oppdater serveren» / ingenting.
// Selvstendig modul (ingen andre importer), så glimt-agent45.js også kan bruke den fra FinansHub.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const ROUTE62 = '/#/innstillinger/faste-oppgaver';
export const KEYS62 = ['enabled', 'conditions', 'quiet'];
const LAB = { enabled: 'Planlagte oppgaver', conditions: 'Betingede varsler', quiet: 'Stille timer 23–07' };
const HELP = {
  enabled: 'Glimt kjører faste oppgaver du har bedt om («Send meg strømprisene hver morgen kl. 7») og sender resultatet som push i appen. Av: ingenting kjøres, men oppgavene står.',
  conditions: 'Varsler med betingelse («si fra hvis strømprisen går over 2 kr») sjekkes i koden mot ekte data – modellen vurderer aldri betingelsen.',
  quiet: 'Oppgaver uten eget klokkeslett flyttes til 07:00 i stedet for å kjøre mellom 23 og 07. Ba du om et klokkeslett, gjelder det.',
};
export const STATUS62 = { active: 'Aktiv', paused: 'Pauset', ended: 'Ferdig' };
export const RUN62 = { running: 'Kjører', ok: 'Levert', failed: 'Feilet', skipped: 'Hoppet over', missed: 'Tapt', condition_false: 'Betingelsen ikke oppfylt' };
const KIND62 = { power: 'Strømpriser', reminder: 'Påminnelse', query: 'Glimt-forespørsel', brief: 'Brief', memory: 'Nattlig oppsummering av minnet' };
const TRIG = { schedule: 'planlagt', catchup: 'tatt igjen etter omstart', 'run-now': 'kjørt nå' };
const ZONES = ['NO1', 'NO2', 'NO3', 'NO4', 'NO5'];
const ZLAB = { NO1: 'Øst', NO2: 'Sør', NO3: 'Midt', NO4: 'Nord', NO5: 'Vest' };

/* ---------- Hjelpere (rene, testes i test/p62-web.test.js) ---------- */
const TZ = 'Europe/Oslo';
const dayKey = (d) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const addDay = (key, n) => new Date(Date.parse(`${key}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** «i dag 07:00», «i morgen 07:00», «i går 15:00», «fre 30. okt 15:00» (Europe/Oslo). '' for ugyldig. */
export function when62(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const t = d.toLocaleTimeString('nb-NO', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).replace('.', ':');
  const k = dayKey(d), today = dayKey(now instanceof Date ? now : new Date(now));
  if (k === today) return `i dag ${t}`;
  if (k === addDay(today, 1)) return `i morgen ${t}`;
  if (k === addDay(today, -1)) return `i går ${t}`;
  const o = { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', ...(k.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) };
  return `${d.toLocaleDateString('nb-NO', o).replace(/\./g, '').replace(/(\d+) /, '$1. ')} ${t}`;
}
/** «28. feb 2027» for en lokal dato (YYYY-MM-DD). */
export function day62(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd ?? ''))) return '';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('nb-NO', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).replace(/\.(?= \d{4})/, '').replace(/ (\w+)\./, ' $1');
}
/** Tidspunktet som tekst: «Hver dag kl. 07:00 · til og med 28. feb 2027». */
export function whenLabel62(w = {}) {
  if (!w || typeof w !== 'object') return '';
  const base = w.label || w.text || '';
  return [base, w.until ? `til og med ${day62(w.until)}` : ''].filter(Boolean).join(' · ');
}
/** Leveransen for en kjøring: «Push sendt», «Ikke sendt: stille timer» … */
export function delivery62(run = {}) {
  const d = run?.delivery;
  if (!d) return '';
  if (d.skipped) return `Ikke sendt: ${d.skipped}`;
  if (d.delivered) return d.pushed > 1 ? `Push sendt til ${d.pushed} enheter` : 'Push sendt';
  return d.channel === 'push' ? 'Ingen enheter tok imot push' : '';
}
/** Én linje om siste kjøring: «Levert i dag 07:00 · 1,2 s». */
export function runLine62(run, now = new Date()) {
  if (!run) return 'Ikke kjørt ennå';
  const at = run.finishedAt || run.startedAt || run.plannedAt;
  const head = [RUN62[run.status] ?? run.status, when62(at, now)].filter(Boolean).join(' ');
  return [head, typeof run.ms === 'number' && run.status !== 'running' ? `${(run.ms / 1000).toFixed(1).replace('.', ',')} s` : ''].filter(Boolean).join(' · ');
}
/** Ser teksten ut som en fast oppgave (gjentakelse, betinget varsel, liste/flytt/stopp)? Da går den rett til Glimt i søket på Hjem
 *  i stedet for å bli foreslått som avtale eller huskebeskjed («Minn meg på husleia den 1. hver måned» er ikke én avtale). */
export const SCHED_RE62 = /\bhver(t)?\s+(dag|morgen|kveld|natt|uke|måned|år|hverdag|helg|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|time)\b|\bhverdag(er)?\b|\bannenhver\b|\bden \d{1,2}\.? (i )?hver\b|\bfaste oppgaver?\b|\bplanlagte oppgaver\b|\b(si|gi) (meg )?(fra|ifra|beskjed)\b.{0,60}\b(hvis|om|når)\b|\bvarsle? meg\b.{0,60}\b(hvis|om|når)\b|strømprisvarsel|\b(flytt|endre)\b.{0,20}\b(morgen|dags|kvelds|natt)brief/i;
export const isSched62 = (t) => SCHED_RE62.test(String(t ?? ''));
/** Sjekker «endre tidspunkt» før PATCH. → {error} eller {body}. */
export function checkWhen62(text, it = {}) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (t.length < 2 || t.length > 200) return { error: 'Skriv når, f.eks. «hver hverdag kl. 7» (2–200 tegn)' };
  if (t === (it.when?.text ?? '')) return { body: {} };
  return { body: { when: t } };
}
/** Klokkeslett for en brief («6:30», «06.30», «0630») → «06:30» eller null. */
export function hhmm62(s) {
  const m = String(s ?? '').trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : null;
}
/** Kortet trenger: schedule62 fra svaret, ellers args fra handlingen som venter på bekreftelse. */
export function preview62(a) {
  if (!a) return null;
  if (a.schedule62?.preview || a.schedule62?.action) return { action: a.schedule62.action ?? 'create', ...(a.schedule62.preview ?? {}) };
  const x = (a.actions ?? []).find((y) => /^schedule\.(create|update|delete)$/.test(y?.tool ?? '') && y.status === 'needs_confirm');
  if (!x) return null;
  const k = x.tool.split('.')[1];
  return { ...(x.args ?? {}), action: k === 'create' ? 'create' : x.args?.action ?? (k === 'delete' ? 'delete' : 'move'), op: k };
}
/** Teksten på Ja-knappen. */
export function yesLabel62(p) {
  if (!p) return 'Ja, gjør det';
  return { create: 'Ja, lagre', move: 'Ja, flytt', pause: 'Ja, sett på pause', resume: 'Ja, slå på', stop: 'Ja, stopp', delete: 'Ja, slett' }[p.action] ?? 'Ja, gjør det';
}
/** Oppgaven som ble lagret/endret etter «Ja» (actions[].result.schedule), eller null. */
export function done62(a) {
  const x = (a?.actions ?? []).find((y) => y?.result?.schedule && /^schedule\./.test(y.tool ?? ''));
  if (!x) return null;
  const r = x.result;
  return { schedule: r.schedule, how: r.created ? 'created' : r.updated ? 'updated' : r.stopped ? 'stopped' : r.deleted ? 'deleted' : 'updated' };
}
const clock = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const kv = (k, v, raw = false) => (v ? `<div class="s62-kv"><b>${esc(k)}</b><span${raw ? '' : ' data-no-i18n'}>${raw ? v : esc(v)}</span></div>` : '');
/** Bekreftelseskortet over Ja/Avbryt: hva, når, betingelse, de neste kjøringene og levering. '' når svaret ikke gjelder en oppgave. */
export function schedCard62Html(p, opts = {}) {
  if (!p) return '';
  css();
  const now = opts.now ?? new Date();
  const dark = opts.dark ? ' dark' : '';
  const title = esc(p.title || p.what || 'Fast oppgave');
  if (p.action === 'create') {
    const w = p.when ?? {};
    const runs = (p.nextRuns ?? []).slice(0, 3).map((x) => when62(x, now)).filter(Boolean);
    const zone = p.params?.zone || p.zone;
    const power = p.kind === 'power' || p.condition?.source === 'power';
    const quiet = w.explicitTime === false ? 'Uten eget klokkeslett: flyttes til 07:00 hvis den havner mellom 23 og 07' : '';
    return `<div class="s62-card${dark}" role="group" aria-label="Ny fast oppgave" data-s62-card="create"><div class="s62-ch">${clock}<b data-no-i18n>${title}</b><i>Ny fast oppgave</i></div>
      ${kv('Hva', p.what)}${kv('Når', whenLabel62(w))}${p.condition ? kv('Bare hvis', `<span data-no-i18n>${esc(p.condition.label || p.condition.text || '')}</span><small>Sjekkes i koden mot ekte data${p.condition.expr ? ` · <code data-no-i18n>${esc(p.condition.expr)}</code>` : ''}</small>`, true) : ''}
      ${power && zone ? kv('Prisområde', `${zone}${ZLAB[zone] ? ` (${ZLAB[zone]})` : ''}`) : ''}${runs.length ? kv(w.once ? 'Kjøres' : 'Neste', runs.join(' · ')) : ''}
      ${kv('Levering', p.channel && p.channel !== 'push' ? p.channel : 'Push i appen')}${p.private ? kv('Personvern', 'Push-varselet er generelt – detaljene står bare i appen') : ''}${quiet ? kv('Stille timer', quiet) : ''}
      <span class="s62-foot">Ingenting lagres før du svarer ja.</span></div>`;
  }
  const sub = p.builtin ? 'Endrer den eksisterende brief-innstillingen' : '';
  const lbl = (x) => x?.label || (x?.when ? whenLabel62(x.when) : '') || (x?.at ? `${p.builtin ? 'Hver dag ' : ''}kl. ${x.at}` : '') || (x?.on === false ? 'Av' : '');
  if (p.action === 'move') {
    return `<div class="s62-card${dark}" role="group" aria-label="Endre fast oppgave" data-s62-card="move"><div class="s62-ch">${clock}<b data-no-i18n>${title}</b><i>Nytt tidspunkt</i></div>
      ${kv('Fra', lbl(p.from))}${kv('Til', lbl(p.to))}${sub ? `<span class="s62-foot">${sub} – det lages ingen ny oppgave.</span>` : ''}</div>`;
  }
  const what = { pause: 'Settes på pause – kan slås på igjen under Faste oppgaver', stop: 'Stoppes – kan slås på igjen under Faste oppgaver', resume: 'Slås på igjen', delete: 'Slettes sammen med kjøringsloggen' }[p.action] ?? '';
  return `<div class="s62-card${dark}" role="group" aria-label="Endre fast oppgave" data-s62-card="${esc(p.action)}"><div class="s62-ch">${clock}<b data-no-i18n>${title}</b>${p.label || lbl(p.from) ? `<i data-no-i18n>${esc(p.label || lbl(p.from))}</i>` : ''}</div>${what ? `<span class="s62-foot">${esc(what)}${sub ? ` · ${sub}` : ''}</span>` : ''}</div>`;
}
/** Kvitteringen etter «Ja»: hva som ble lagret og når den kjøres neste gang, med lenke til siden. */
export function schedDone62Html(d, opts = {}) {
  if (!d?.schedule) return '';
  css();
  const s = d.schedule, now = opts.now ?? new Date();
  const head = { created: 'Lagret', updated: 'Endret', stopped: 'Stoppet', deleted: 'Slettet' }[d.how] ?? 'Lagret';
  const label = s.when?.label ?? s.label ?? '';
  const next = s.status !== 'paused' && s.on !== false && d.how !== 'deleted' && s.nextRunAt ? `neste ${when62(s.nextRunAt, now)}` : '';
  return `<div class="s62-card s62-done${opts.dark ? ' dark' : ''}" role="status"><div class="s62-ch">${clock}<b>${head}: <span data-no-i18n>${esc(s.title ?? '')}</span></b></div>${label || next ? `<span class="s62-foot" data-no-i18n>${esc([label, next].filter(Boolean).join(' · '))}</span>` : ''}<button type="button" class="s62-link" data-s62-open>Se faste oppgaver ›</button></div>`;
}

/* ---------- API ---------- */
async function call(path, method = 'GET', json) {
  const r = await fetch(`/api/glimt/schedules${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: json !== undefined ? { 'Content-Type': 'application/json' } : {}, body: json !== undefined ? JSON.stringify(json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status === 404 ? 'Fant ikke oppgaven' : r.status === 403 ? 'Bare administrator kan endre dette for alle' : `Feil ${r.status}`)), { status: r.status });
  return d;
}
const idPath = (id) => (/^brief:[a-z]+$/.test(id) ? `/${id}` : `/${encodeURIComponent(id)}`);

/* ---------- Brytere (AI-kontroll → Valg, og øverst på siden) ---------- */
const S = { d: null, at: 0, busy: false, msg: '', missing: false, loading: null };
export async function loadSettings62(force = false) {
  if (!force && S.at && Date.now() - S.at < 20_000) return S.d;
  if (S.loading) return S.loading;
  S.loading = (async () => {
    try {
      const r = await fetch('/api/glimt/schedules/settings', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404 || r.status === 405) S.missing = true;
      else if (r.ok) { S.d = await r.json(); S.missing = false; S.msg = ''; }
      else S.msg = (await r.json().catch(() => ({}))).error || `Feil ${r.status}`;
    } catch (e) { S.msg = e.message; }
    S.at = Date.now(); S.loading = null;
    return S.d;
  })();
  return S.loading;
}
const effOn = (d, k) => { const srv = d?.server?.[k] !== false; return { srv, own: d?.user?.[k], on: srv && (d?.user?.[k] ?? srv) }; };
const zoneOf = (d) => d?.zone || d?.user?.zone || d?.settings?.zone || 'NO1';
const zonesOf = (d) => (Array.isArray(d?.zones) && d.zones.length ? d.zones.map((z) => (typeof z === 'string' ? { id: z, label: ZLAB[z] ?? '' } : { id: z.id ?? z.zone ?? z.code, label: z.label ?? z.name ?? ZLAB[z.id] ?? '' })).filter((z) => z.id) : ZONES.map((id) => ({ id, label: ZLAB[id] })));
const lab = (d, k) => esc(d?.labels?.[k] ?? LAB[k]), help = (d, k) => esc(d?.help?.[k] && d.help[k] !== '…' ? d.help[k] : HELP[k]);
const sw = (on) => `<span class="ac-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
/** AI-kontroll → Valg: «Faste oppgaver · for meg» (tre brytere + prisområde) og «for alle (admin)». */
export function settingsHtml62() {
  if (S.missing) return '';
  const d = S.d;
  if (!d) return `<div class="ac-sec"><span class="ac-lab">FASTE OPPGAVER</span><div class="ac-card ac-list"><div class="ac-mut" style="padding:12px 0">${S.msg ? esc(S.msg) : 'Laster …'}</div></div></div>`;
  const mine = KEYS62.map((k) => {
    const { srv, own, on } = effOn(d, k), locked = !srv || (k !== 'enabled' && !effOn(d, 'enabled').on);
    const sub = !srv ? 'Slått av for alle av administrator' : own == null ? help(d, k) : `${help(d, k)} · Ditt eget valg`;
    return `<button type="button" class="ac-li" data-s62-user="${k}" role="switch" aria-checked="${on}"${S.busy || locked ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(d, k)}</b><span>${sub}</span></span>${sw(on)}</button>`;
  }).join('');
  const z = zoneOf(d);
  const zone = `<div class="ac-par"><span class="ac-row ac-sb"><span class="ac-col"><b>Prisområde for strøm</b><span>Brukes av strømprisoppgaver og strømvarsler når du ikke sier noe annet</span></span><b class="ac-mono">${esc(z)}</b></span><div class="ac-seg" role="group" aria-label="Prisområde">${zonesOf(d).map((x) => `<button type="button" class="${x.id === z ? 'on' : ''}" data-s62-zone="${esc(x.id)}" aria-pressed="${x.id === z}" title="${esc(x.label)}"${S.busy ? ' disabled' : ''}>${esc(x.id)}</button>`).join('')}</div></div>`;
  const link = '<button type="button" class="ac-li" data-s62-open><span class="ac-col ac-grow"><b>Se faste oppgaver</b><span>Innstillinger → Faste oppgaver: neste kjøring, logg, pause, kjør nå</span></span><span aria-hidden="true">›</span></button>';
  let admin = '';
  if (d.admin) {
    const rows = KEYS62.map((k) => { const on = d.server?.[k] !== false; return `<button type="button" class="ac-li" data-s62-server="${k}" role="switch" aria-checked="${on}"${S.busy ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(d, k)}</b><span>${help(d, k)}</span></span>${sw(on)}</button>`; }).join('');
    admin = `<div class="ac-sec"><span class="ac-lab">FASTE OPPGAVER · FOR ALLE (ADMIN)</span><div class="ac-card ac-list">${rows}</div><div class="ac-note">Av her slår funksjonen av for alle brukere. Hver bruker kan i tillegg slå av for seg selv over.</div></div>`;
  }
  return `<div class="ac-sec" data-s62-sec><span class="ac-lab">FASTE OPPGAVER · FOR MEG</span><div class="ac-card ac-list">${mine}${zone}${link}</div>${S.msg ? `<div class="ac-note" role="status">${esc(S.msg)}</div>` : ''}</div>${admin}`;
}
/** Samme brytere i stil med resten av Innstillinger (øverst på siden Faste oppgaver). */
function pageToggles() {
  const d = S.d;
  if (!d || S.missing) return '';
  const rows = KEYS62.map((k) => {
    const { srv, on } = effOn(d, k), locked = !srv || (k !== 'enabled' && !effOn(d, 'enabled').on);
    return `<button type="button" class="sg-row s62-tg" data-s62-user="${k}" role="switch" aria-checked="${on}"${S.busy || locked ? ' disabled' : ''}><span class="sg-txt"><b>${lab(d, k)}</b><span>${!srv ? 'Slått av for alle av administrator' : help(d, k)}</span></span><span class="sg-sw"></span></button>`;
  }).join('');
  const z = zoneOf(d);
  const zone = `<div class="sg-row s62-zr"><span class="sg-txt"><b>Prisområde for strøm</b><span>Standard for strømpriser og strømvarsler</span></span><span class="s62-seg" role="group" aria-label="Prisområde">${zonesOf(d).map((x) => `<button type="button" class="${x.id === z ? 'on' : ''}" data-s62-zone="${esc(x.id)}" aria-pressed="${x.id === z}" title="${esc(x.label)}"${S.busy ? ' disabled' : ''}>${esc(x.id)}</button>`).join('')}</span></div>`;
  return `<section class="sg"><h3 class="sg-t">Valg</h3><div class="sg-box">${rows}${zone}</div>${S.msg ? `<div class="sg-note" role="status">${esc(S.msg)}</div>` : ''}<div class="sg-note">Valgene finnes også i AI-kontroll → Valg.</div></section>`;
}
async function putSettings(body) { const j = await call('/settings', 'PUT', body); S.d = j; S.at = Date.now(); return j; }

/* ---------- Siden «Faste oppgaver» ---------- */
const L = { d: null, at: 0, loading: null, missing: false, err: '', msg: '', filter: '', open: null, det: {}, edit: null, prev: null, arm: null, busy: {}, rmsg: {}, slot: null };
export async function loadSchedules62(force = false) {
  if (!force && L.at && Date.now() - L.at < 15_000) return L.d;
  if (L.loading) return L.loading;
  L.loading = (async () => {
    try {
      const r = await fetch('/api/glimt/schedules', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404 || r.status === 405) L.missing = true;
      else if (r.ok) { L.d = await r.json(); L.missing = false; L.err = ''; }
      else L.err = (await r.json().catch(() => ({}))).error || `Feil ${r.status}`;
    } catch (e) { L.err = e.message; }
    L.at = Date.now(); L.loading = null;
    return L.d;
  })();
  return L.loading;
}
const pill = (st) => `<i class="s62-st s62-${esc(st)}">${esc(STATUS62[st] ?? st)}</i>`;
function runsHtml(runs) {
  if (!runs?.length) return '<div class="s62-mut">Ingen kjøringer ennå.</div>';
  return `<ul class="s62-runs">${runs.map((r) => {
    const cond = r.condition ? `Betingelse ${r.condition.met ? 'oppfylt' : 'ikke oppfylt'}${typeof r.condition.value === 'number' ? ` (${String(r.condition.value).replace('.', ',')})` : ''}` : '';
    const meta = [TRIG[r.trigger] && r.trigger !== 'schedule' ? TRIG[r.trigger] : '', typeof r.ms === 'number' ? `${(r.ms / 1000).toFixed(1).replace('.', ',')} s` : '', cond, delivery62(r)].filter(Boolean).join(' · ');
    return `<li class="s62-r s62-r-${esc(r.status)}"><span class="s62-rh"><b>${esc(RUN62[r.status] ?? r.status)}</b> <span>${esc(when62(r.finishedAt || r.startedAt || r.plannedAt))}</span>${meta ? ` <small>${esc(meta)}</small>` : ''}</span>${r.result ? `<span class="s62-rt" data-no-i18n>${esc(r.result)}</span>` : ''}${r.reason ? `<span class="s62-rw">${esc(r.reason)}</span>` : ''}${r.error ? `<span class="s62-rw bad">${esc(r.error)}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}
function editHtml(it) {
  const id = esc(it.id), p = L.prev;
  const prev = p?.busy ? '<div class="s62-prev" role="status">Tolker …</div>' : p?.err ? `<div class="s62-prev bad" role="status">${esc(p.err)}</div>`
    : p?.r ? `<div class="s62-prev ok" role="status"><b data-no-i18n>${esc(p.r.summary || whenLabel62(p.r.when))}</b>${(p.r.nextRuns ?? []).length ? `<span>Neste: ${esc(p.r.nextRuns.slice(0, 3).map((x) => when62(x)).join(' · '))}</span>` : ''}</div>` : '';
  return `<form class="s62-form" data-s62-form="${id}" autocomplete="off"><label class="s62-fl"><span>Når</span><input name="when" required minlength="2" maxlength="200" value="${esc(it.when?.text ?? '')}" placeholder="hver hverdag kl. 7" aria-label="Når oppgaven skal kjøres"></label>
    <span class="s62-hint">Skriv som du ville sagt det: «hver morgen kl. 7», «den 1. hver måned», «annenhver tirsdag kl 18», «hver fredag kl. 15 i vinter».</span>
    ${prev}<div class="s62-acts"><button type="button" class="s62-b" data-s62-preview="${id}">Forhåndsvis</button><button type="button" class="s62-b" data-s62-cancel>Avbryt</button><button type="submit" class="s62-b pri"${L.busy[it.id] ? ' disabled' : ''}>Lagre</button></div></form>`;
}
function detailHtml(it) {
  const id = esc(it.id), D = L.det[it.id], busy = L.busy[it.id];
  const runs = (it.nextRuns ?? []).slice(0, 3).map((x) => when62(x)).filter(Boolean);
  const zone = it.params?.zone, power = it.kind === 'power' || it.condition?.source === 'power';
  const off = L.d?.enabled === false;
  const tgl = it.status === 'active' ? `<button type="button" class="s62-b" data-s62-st="paused" data-s62-id="${id}"${busy || off ? ' disabled' : ''}>Pause</button>` : it.status === 'paused' ? `<button type="button" class="s62-b" data-s62-st="active" data-s62-id="${id}"${busy || off ? ' disabled' : ''}>Fortsett</button>` : '';
  // Prompt 63: systemoppgaver (nattlig oppsummering av minnet) kan bare pauses – ikke slettes eller flyttes.
  const del = it.system ? '' : `<button type="button" class="s62-b bad" data-s62-del="${id}"${busy ? ' disabled' : ''}>${L.arm === it.id ? 'Trykk igjen for å slette' : 'Slett'}</button>`;
  return `<div class="s62-det" data-s62-det="${id}">
    ${kv('Hva', it.what)}${kv('Type', KIND62[it.kind] ?? it.kind)}${kv('Når', whenLabel62(it.when))}
    ${it.condition ? kv('Bare hvis', `<span data-no-i18n>${esc(it.condition.label || it.condition.text || '')}</span>${it.condition.expr ? `<small>Sjekkes i koden: <code data-no-i18n>${esc(it.condition.expr)}</code></small>` : ''}`, true) : ''}
    ${power && zone ? kv('Prisområde', `${zone}${ZLAB[zone] ? ` (${ZLAB[zone]})` : ''}`) : ''}
    ${runs.length ? kv('Neste', runs.join(' · ')) : ''}${kv('Levering', it.channel && it.channel !== 'push' ? it.channel : 'Push i appen')}
    ${it.when?.explicitTime === false ? kv('Stille timer', 'Flyttes til 07:00 hvis den havner mellom 23 og 07') : ''}
    ${L.edit === it.id ? editHtml(it) : `<div class="s62-acts"><button type="button" class="s62-b pri" data-s62-run="${id}"${busy || off ? ' disabled' : ''}>${busy === 'run' ? 'Kjører …' : 'Kjør nå'}</button>${tgl}${it.system ? '' : `<button type="button" class="s62-b" data-s62-edit="${id}"${off ? ' disabled' : ''}>Endre tidspunkt</button>`}${del}</div>`}
    ${it.system ? '<div class="s62-mut">Systemoppgave: Glimt går gjennom dagens samtaler og foreslår nye fakta til «Glimt husker». Ingenting lagres før du godkjenner. Kan settes på pause, ikke slettes.</div>' : ''}
    ${L.rmsg[it.id] ? `<div class="s62-prev${L.rmsg[it.id].bad ? ' bad' : ' ok'}" role="status">${L.rmsg[it.id].html}</div>` : ''}
    <div class="s62-sub">Siste kjøringer</div>${D?.runs ? runsHtml(D.runs) : D?.err ? `<div class="s62-prev bad">${esc(D.err)}</div>` : '<div class="s62-mut">Laster kjøringer …</div>'}</div>`;
}
function rowHtml(it) {
  const open = L.open === it.id, lr = it.lastRun;
  const next = it.status === 'active' && it.nextRunAt ? `Neste ${when62(it.nextRunAt)}` : it.status === 'paused' ? 'På pause' : 'Ingen flere kjøringer';
  return `<div class="s62-item${open ? ' open' : ''}" data-s62-row="${esc(it.id)}"><button type="button" class="sg-row s62-head" data-s62-toggle="${esc(it.id)}" aria-expanded="${open}"><span class="s62-ic" aria-hidden="true">${clock}</span><span class="sg-txt"><b data-no-i18n>${esc(it.title || it.what)}</b><span>${pill(it.status)}${it.system ? '<i class="s62-st s62-sys">System</i>' : ''}<span data-no-i18n>${esc(whenLabel62(it.when))}</span></span><span class="s62-l2">${esc(next)}${it.condition ? ' · med betingelse' : ''}</span><span class="s62-l2 s62-last s62-r-${esc(lr?.status ?? 'none')}">Sist: ${esc(runLine62(lr))}${lr?.result ? ` – <span data-no-i18n>${esc(String(lr.result).slice(0, 90))}${String(lr.result).length > 90 ? '…' : ''}</span>` : ''}</span></span><span aria-hidden="true" class="s62-chev">${open ? '▾' : '›'}</span></button>${open ? detailHtml(it) : ''}</div>`;
}
function briefHtml(b) {
  const id = esc(b.id), busy = L.busy[b.id], canAt = !b.editable || b.editable.includes('at'), canOn = !b.editable || b.editable.includes('on');
  return `<div class="sg-row s62-brief" data-s62-brief="${id}"><span class="s62-ic" aria-hidden="true">${clock}</span><span class="sg-txt"><b data-no-i18n>${esc(b.title)}</b><span>${b.on === false ? 'Av' : esc([b.label, b.nextRunAt ? `neste ${when62(b.nextRunAt)}` : ''].filter(Boolean).join(' · '))}</span>${L.rmsg[b.id] ? `<span role="status" class="${L.rmsg[b.id].bad ? 's62-badt' : ''}">${L.rmsg[b.id].html}</span>` : ''}</span>
    ${canAt ? `<form class="s62-bt" data-s62-bform="${id}" autocomplete="off"><input name="at" value="${esc(b.at ?? '')}" inputmode="numeric" maxlength="5" aria-label="Klokkeslett for ${esc(b.title)}" placeholder="06:45"><button type="submit" class="s62-b"${busy ? ' disabled' : ''}>Lagre</button></form>` : ''}
    ${canOn ? `<button type="button" class="s62-sw" data-s62-bon="${id}" role="switch" aria-checked="${b.on !== false}" aria-label="${esc(b.title)} på"${busy ? ' disabled' : ''}><span class="sg-sw"></span></button>` : ''}</div>`;
}
export function pageHtml62() {
  if (L.missing) return '<section class="sg"><div class="sg-box"><div class="sg-row"><span class="sg-txt"><span>Serveren har ikke faste oppgaver ennå. Oppdater serveren.</span></span></div></div></section>';
  const d = L.d;
  if (!d) return `<section class="sg"><div class="sg-box"><div class="sg-row"><span class="sg-txt"><span>${L.err ? `Serveren svarte: ${esc(L.err)}` : 'Laster …'}</span></span></div></div></section>`;
  const items = Array.isArray(d.items) ? d.items : [], c = d.counts ?? {};
  const n = (s) => c[s] ?? items.filter((x) => x.status === s).length;
  const off = d.enabled === false ? '<div class="sg-row s62-off"><span class="sg-txt"><b>Planlagte oppgaver er slått av</b><span>Ingenting kjøres nå. Oppgavene står, og du kan slå det på igjen under Valg nederst eller i AI-kontroll → Valg.</span></span></div>' : '';
  const bar = `<div class="s62-bar" role="group" aria-label="Vis status"><button type="button" class="${L.filter ? '' : 'on'}" data-s62-f="" aria-pressed="${!L.filter}">Alle <small>${c.total ?? items.length}</small></button>${['active', 'paused', 'ended'].map((s) => `<button type="button" class="${L.filter === s ? 'on' : ''}" data-s62-f="${s}" aria-pressed="${L.filter === s}">${s === 'active' ? 'Aktive' : s === 'paused' ? 'Pauset' : 'Ferdige'} <small>${n(s)}</small></button>`).join('')}</div>`;
  const shown = items.filter((x) => !L.filter || x.status === L.filter);
  const list = shown.length ? shown.map(rowHtml).join('') : `<div class="sg-row"><span class="sg-txt"><span>${items.length ? 'Ingen oppgaver her.' : 'Ingen faste oppgaver ennå. Si det til Glimt i Chat eller søkefeltet, f.eks. «Send meg strømprisene hver morgen kl. 7», «Minn meg på å betale husleia den 1. hver måned» eller «Si fra hvis strømprisen går over 2 kr i morgen». Glimt viser alltid tolkningen før noe lagres.'}</span></span></div>`;
  const msg = L.msg ? `<div class="sg-row"><span class="sg-txt"><span role="status">${esc(L.msg)}</span></span></div>` : '';
  const builtin = Array.isArray(d.builtin) && d.builtin.length ? `<section class="sg"><h3 class="sg-t">Briefer</h3><div class="sg-box">${d.builtin.map(briefHtml).join('')}</div><div class="sg-note">Briefene er de samme som under Innstillinger → Glimt. «Flytt morgenbriefen til 06:30» til Glimt endrer klokkeslettet her.</div></section>` : '';
  return `<div class="s62" data-s62><section class="sg"><h3 class="sg-t">Oppgaver</h3><div class="sg-box">${off}${bar}${msg}${list}</div><div class="sg-note">Lag, flytt og stopp oppgaver ved å si det til Glimt («Hvilke faste oppgaver har jeg?», «Stopp strømprisvarselet»). Hver kjøring logges her med resultat og levering.</div></section>${builtin}${pageToggles()}</div>`;
}

const STYLE62 = `.s62-card{display:flex;flex-direction:column;gap:6px;padding:12px 14px;margin:2px 0 8px;border-radius:14px;border:1px solid rgba(127,127,127,.3);background:rgba(127,127,127,.08);font-size:14.5px;line-height:1.45;text-align:left;max-width:520px}
.s62-card.dark{color:#fff;border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.07)}
.s62-ch{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.s62-ch b{font-size:15px}.s62-ch i{font-style:normal;font-size:12px;opacity:.75;padding:1px 8px;border-radius:999px;border:1px solid currentColor}
.s62-kv{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px}.s62-kv>b{opacity:.7;font-weight:600}.s62-kv>span{overflow-wrap:anywhere;display:flex;flex-direction:column;gap:1px}
.s62-kv small,.s62-foot{font-size:12.5px;opacity:.75}.s62-kv code{font-size:12px}
.s62-link{align-self:flex-start;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;padding:4px 0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
#gl-layer .s62-card button.s62-link{width:auto;height:auto;margin:0;box-shadow:none;background:transparent;color:#fff}
.s62-bar{display:flex;gap:6px;flex-wrap:wrap;padding:12px 26px;border-top:1px solid rgba(127,127,127,.2)}
.s62-bar button,.s62-seg button{height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer}
.s62-bar button.on,.s62-seg button.on{background:rgba(127,127,127,.25);font-weight:600}.s62-bar small{opacity:.7;margin-left:3px}
.s62-seg{display:flex;gap:4px;flex-wrap:wrap}.s62-seg button{padding:0 10px}
.s62-head{width:100%;text-align:left;cursor:pointer}.s62-head .sg-txt{min-width:0;flex:1}.s62-head .sg-txt b,.s62-head .sg-txt span{overflow-wrap:anywhere}
.s62-ic{flex:none;width:34px;height:34px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:#7a3b6b;color:#fff}
.s62-l2{font-size:13.5px;opacity:.75}.s62-last.s62-r-failed,.s62-last.s62-r-missed{color:#d0503c;opacity:1}
.s62-chev{flex:none;opacity:.6}
.s62-st{font-style:normal;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;margin-right:6px;border:1px solid currentColor}
.s62-sys{color:#7a3b6b}.s62-active{color:#2f9e5b}.s62-paused{color:#b7871a}.s62-ended{color:#8a8a8a}
.s62-det{display:flex;flex-direction:column;gap:9px;padding:4px 26px 18px 76px;font-size:14.5px;line-height:1.45}
.s62-det .s62-kv{grid-template-columns:110px minmax(0,1fr)}
.s62-acts{display:flex;gap:8px;flex-wrap:wrap}
.s62-b{height:38px;padding:0 14px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit;font:inherit;font-size:14.5px;cursor:pointer;white-space:nowrap}
.s62-b:hover{background:rgba(127,127,127,.14)}.s62-b.pri{background:rgba(127,127,127,.22);font-weight:600}.s62-b.bad{color:#d0503c}.s62-b:disabled{opacity:.5;cursor:default}
.s62-sub{font-weight:600;opacity:.8;margin-top:4px}.s62-mut{opacity:.7;font-size:14px}
.s62-runs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.s62-r{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:10px;background:rgba(127,127,127,.1);box-shadow:inset 3px 0 0 #8a8a8a;overflow-wrap:anywhere}
.s62-r-ok{box-shadow:inset 3px 0 0 #2f9e5b}.s62-r-failed,.s62-r-missed{box-shadow:inset 3px 0 0 #d0503c}.s62-r-condition_false,.s62-r-skipped{box-shadow:inset 3px 0 0 #b7871a}
.s62-rh small{opacity:.7}.s62-rt{white-space:pre-line}.s62-rw{font-size:13px;opacity:.8}.s62-rw.bad,.s62-badt{color:#d0503c}
.s62-form{display:flex;flex-direction:column;gap:8px}.s62-fl{display:flex;flex-direction:column;gap:4px}.s62-fl span{font-weight:600;opacity:.8}
.s62-fl input,.s62-bt input{min-width:0;height:42px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit;font:inherit}
.s62-hint{font-size:13px;opacity:.7}
.s62-prev{display:flex;flex-direction:column;gap:3px;padding:9px 12px;border-radius:10px;background:rgba(127,127,127,.12);font-size:14px;overflow-wrap:anywhere}
.s62-prev.ok{box-shadow:inset 3px 0 0 #2f9e5b}.s62-prev.bad{box-shadow:inset 3px 0 0 #d0503c}
.s62-brief .sg-txt{flex:1;min-width:0}.s62-bt{display:flex;gap:6px;align-items:center;flex:none}.s62-bt input{width:76px;text-align:center}
.s62-sw{flex:none;border:0;background:transparent;padding:0;cursor:pointer}.s62-sw[aria-checked=true] .sg-sw{background:#34c759;justify-content:flex-end}
.s62-off{box-shadow:inset 3px 0 0 #b7871a}
@media (max-width:600px){.s62-bar{padding:10px 16px}.s62-det{padding:4px 16px 14px}.s62-det .s62-kv,.s62-kv{grid-template-columns:minmax(0,1fr);gap:0}.s62-brief{flex-wrap:wrap}.s62-brief .sg-txt{flex:1 1 calc(100% - 50px)}.s62-bt{margin-left:42px;flex:1 1 auto}.s62-bt input{flex:1 1 70px;max-width:110px}.s62-zr{flex-wrap:wrap}.s62-ic{width:30px;height:30px}}`;
function css() { if (typeof document === 'undefined' || document.getElementById('s62-css')) return; const st = document.createElement('style'); st.id = 's62-css'; st.textContent = STYLE62; document.head.appendChild(st); }

const repaintSettings = () => { if (typeof document === 'undefined') return; for (const el of document.querySelectorAll('[data-sched62]')) el.innerHTML = settingsHtml62(); };
const repaintPage = () => { if (L.slot?.isConnected) L.slot.innerHTML = pageHtml62(); else { L.slot = null; for (const el of document.querySelectorAll('[data-s62-host]')) { L.slot = el; el.innerHTML = pageHtml62(); } } };
/** Innstillinger → Faste oppgaver: tegner siden i slot og laster liste + brytere. */
export function mountSched62(slot) {
  css();
  L.slot = slot; slot.dataset.s62Host = '1';
  slot.innerHTML = pageHtml62();
  Promise.all([loadSchedules62(), loadSettings62()]).then(repaintPage);
}
let raf = 0;
function decorate() {
  const s = [...document.querySelectorAll('[data-sched62]:not([data-s62-done])')];
  if (!s.length) return;
  css();
  for (const el of s) { el.dataset.s62Done = '1'; el.innerHTML = settingsHtml62(); }
  loadSettings62().then(repaintSettings);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };
const itemOf = (id) => (L.d?.items ?? []).find((x) => x.id === id) ?? null;
function replaceItem(item) { const xs = L.d?.items; if (!xs || !item) return; const i = xs.findIndex((x) => x.id === item.id); if (i >= 0) xs[i] = item; }
async function loadDetail(id) {
  try { const r = await call(idPath(id)); L.det[id] = { runs: r.runs ?? [] }; if (r.item) replaceItem(r.item); }
  catch (e) { L.det[id] = { err: `Kunne ikke hente kjøringene: ${e.message}` }; }
  repaintPage();
}
async function actSettings(fn) {
  S.busy = true; S.msg = ''; repaintSettings(); repaintPage();
  try { S.msg = (await fn()) ?? ''; } catch (err) { S.msg = err.message; }
  S.busy = false; repaintSettings();
  await loadSchedules62(true); repaintPage();
}
function openPage() {
  const el = document.querySelector('[data-s62-host]');
  if (el && el.isConnected) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (/^\/finans/.test(location.pathname)) { location.href = ROUTE62; return; }
  import('./settings.js').then((m) => m.openSettings('faste-oppgaver')).catch(() => { location.hash = '#/innstillinger/faste-oppgaver'; });
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', async (e) => {
    if (e.target.closest?.('[data-s62-open]')) { e.preventDefault(); e.stopPropagation(); document.dispatchEvent(new CustomEvent('sched62:open')); openPage(); return; }
    const u = e.target.closest?.('[data-s62-user]'), s = e.target.closest?.('[data-s62-server]'), z = e.target.closest?.('[data-s62-zone]');
    if (u && !u.disabled) {
      e.preventDefault();
      const k = u.dataset.s62User, { srv, on } = effOn(S.d, k), next = !on;
      actSettings(async () => { await putSettings({ scope: 'user', [k]: next === srv ? null : next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for deg`; });
      return;
    }
    if (s && !s.disabled) {
      e.preventDefault();
      const k = s.dataset.s62Server, next = !(S.d?.server?.[k] !== false);
      actSettings(async () => { await putSettings({ scope: 'server', [k]: next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for alle`; });
      return;
    }
    if (z && !z.disabled) {
      e.preventDefault();
      const zone = z.dataset.s62Zone;
      if (zone === zoneOf(S.d)) return;
      actSettings(async () => { await putSettings({ scope: 'user', zone }); return `Prisområde ${zone}`; });
      return;
    }
    const t = e.target.closest?.('[data-s62-f],[data-s62-toggle],[data-s62-edit],[data-s62-cancel],[data-s62-del],[data-s62-st],[data-s62-run],[data-s62-preview],[data-s62-bon]');
    if (!t || !t.closest('[data-s62]') || t.disabled) return;
    e.preventDefault();
    const ds = t.dataset;
    if (ds.s62F != null) { L.filter = ds.s62F; repaintPage(); return; }
    if (ds.s62Toggle) { const id = ds.s62Toggle; L.open = L.open === id ? null : id; L.edit = null; L.prev = null; L.arm = null; L.msg = ''; repaintPage(); if (L.open) loadDetail(id); return; }
    if (ds.s62Edit) { L.edit = ds.s62Edit; L.prev = null; L.arm = null; repaintPage(); document.querySelector(`[data-s62-form="${ds.s62Edit}"] input[name=when]`)?.focus(); return; }
    if (ds.s62Cancel != null) { L.edit = null; L.prev = null; repaintPage(); return; }
    if (ds.s62Preview) {
      const inp = document.querySelector(`[data-s62-form="${ds.s62Preview}"] input[name=when]`), it = itemOf(ds.s62Preview);
      const { error } = checkWhen62(inp?.value, {});
      if (error) { L.prev = { err: error }; repaintPage(); return; }
      const when = inp.value.trim();
      L.prev = { busy: true }; repaintPage();
      try { L.prev = { r: await call('/parse', 'POST', { when, ...(it?.what ? { what: it.what } : {}) }) }; } catch (er) { L.prev = { err: er.message }; }
      repaintPage();
      const again = document.querySelector(`[data-s62-form="${ds.s62Preview}"] input[name=when]`); if (again) again.value = when;
      return;
    }
    if (ds.s62St) {
      const id = ds.s62Id;
      L.busy[id] = 'st'; delete L.rmsg[id]; repaintPage();
      try { const r = await call(idPath(id), 'PATCH', { status: ds.s62St }); replaceItem(r.item); L.msg = ds.s62St === 'paused' ? 'Satt på pause ✓' : 'Slått på igjen ✓'; await loadSchedules62(true); }
      catch (er) { L.rmsg[id] = { html: esc(`Kunne ikke endre: ${er.message}`), bad: true }; }
      delete L.busy[id]; repaintPage(); return;
    }
    if (ds.s62Run) {
      const id = ds.s62Run;
      L.busy[id] = 'run'; delete L.rmsg[id]; repaintPage();
      try {
        const r = await call(`${idPath(id)}/run-now`, 'POST', {});
        replaceItem(r.item);
        const run = r.run ?? {};
        L.rmsg[id] = { html: `<b>${esc(RUN62[run.status] ?? run.status ?? 'Ferdig')}</b>${run.result ? `<span data-no-i18n>${esc(run.result)}</span>` : ''}${delivery62(run) ? `<span>${esc(delivery62(run))}</span>` : ''}${run.error ? `<span>${esc(run.error)}</span>` : ''}`, bad: run.status === 'failed' };
        await loadDetail(id);
      } catch (er) { L.rmsg[id] = { html: esc(er.status === 409 ? er.message || 'Kjører allerede' : `Kunne ikke kjøre: ${er.message}`), bad: true }; }
      delete L.busy[id]; repaintPage(); return;
    }
    if (ds.s62Del) {
      const id = ds.s62Del;
      if (L.arm !== id) { L.arm = id; repaintPage(); return; }
      L.busy[id] = 'del'; repaintPage();
      try { await call(idPath(id), 'DELETE'); L.msg = 'Slettet ✓'; L.open = null; L.arm = null; delete L.det[id]; await loadSchedules62(true); }
      catch (er) { L.rmsg[id] = { html: esc(`Kunne ikke slette: ${er.message}`), bad: true }; L.arm = null; }
      delete L.busy[id]; repaintPage(); return;
    }
    if (ds.s62Bon) {
      const id = ds.s62Bon, b = (L.d?.builtin ?? []).find((x) => x.id === id);
      if (!b) return;
      L.busy[id] = 1; delete L.rmsg[id]; repaintPage();
      try { const r = await call(idPath(id), 'PATCH', { on: b.on === false }); Object.assign(b, r.item ?? { on: b.on === false }); L.rmsg[id] = { html: esc(b.on === false ? 'Slått av ✓' : 'Slått på ✓') }; }
      catch (er) { L.rmsg[id] = { html: esc(`Kunne ikke endre: ${er.message}`), bad: true }; }
      delete L.busy[id]; repaintPage();
    }
  }, true);
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest?.('[data-s62-form],[data-s62-bform]');
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    if (f.matches('[data-s62-bform]')) {
      const id = f.dataset.s62Bform, b = (L.d?.builtin ?? []).find((x) => x.id === id), at = hhmm62(fd.get('at'));
      if (!b) return;
      if (!at) { L.rmsg[id] = { html: 'Skriv klokkeslettet som TT:MM, f.eks. 06:30', bad: true }; repaintPage(); return; }
      if (at === b.at) { L.rmsg[id] = { html: 'Ingen endring' }; repaintPage(); return; }
      L.busy[id] = 1; delete L.rmsg[id]; repaintPage();
      try { const r = await call(idPath(id), 'PATCH', { at }); Object.assign(b, r.item ?? { at }); L.rmsg[id] = { html: esc(`Flyttet til ${b.at ?? at} ✓`) }; }
      catch (er) { L.rmsg[id] = { html: esc(`Kunne ikke lagre: ${er.message}`), bad: true }; }
      delete L.busy[id]; repaintPage(); return;
    }
    const id = f.dataset.s62Form, it = itemOf(id);
    if (!it) return;
    const raw = String(fd.get('when') ?? '');
    const { error, body } = checkWhen62(raw, it);
    if (error) { L.prev = { err: error }; repaintPage(); return; }
    if (!Object.keys(body).length) { L.edit = null; L.prev = null; L.rmsg[id] = { html: 'Ingen endring' }; repaintPage(); return; }
    L.busy[id] = 'when'; L.prev = { busy: true }; repaintPage();
    try { const r = await call(idPath(id), 'PATCH', body); replaceItem(r.item); L.edit = null; L.prev = null; L.rmsg[id] = { html: `Nytt tidspunkt: <span data-no-i18n>${esc(whenLabel62(r.item?.when))}</span> ✓` }; await loadSchedules62(true); }
    catch (er) { L.prev = { err: `Kunne ikke lagre: ${er.message}` }; }
    delete L.busy[id]; repaintPage();
    const again = document.querySelector(`[data-s62-form="${id}"] input[name=when]`); if (again && L.prev?.err) again.value = raw;
  });
  // Glimt laget/endret/stoppet en oppgave (Chat eller søket): lista og briefene hentes på nytt.
  document.addEventListener('hl:agent45', (e) => { if ((e.detail?.modules ?? []).includes('schedule')) { L.at = 0; if (L.slot?.isConnected) loadSchedules62(true).then(repaintPage); } });
  const boot = () => { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
}
