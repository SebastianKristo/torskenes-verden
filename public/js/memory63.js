// Prompt 63 (prompt 49 del 5, D5WEB): «Minnet holder seg ryddig» på web. Formene står i $S/SERVER63-API.md (alt under /api/glimt/memory):
//   GET  /pending[?status=]            → {items:[Pending], counts, enabled}
//   POST /pending/:id/approve {subject?, object?, aliases?} → {ok, item, memory}   (409 {error, conflictId} ved åpen motstrid)
//   POST /pending/:id/reject           → {ok, item}
//   POST /pending/:id/edit {subject?, object?, aliases?} → {ok, item}   (forblir pending)
//   GET  /conflicts[?status=]          → {items:[Conflict], counts, enabled}
//   POST /conflicts/:id/resolve {choice:'keep_a'|'keep_b'|'both'} → {ok, item}
//   GET  /stale                        → {items:[Stale], staleDays, enabled}
//   POST /stale/:id/keep               → {ok, id, keptAt}
//   GET/PUT /hygiene {scope, nightly?, conflicts?, stale?, staleDays?} → Hygiene
//   POST /hygiene/run-now              → {ok, run}
// Tre deler: (1) i «Glimt husker» (Innstillinger → AI) fyller modulen [data-mem63]: Forslag (godkjenn / avvis / rediger før
// godkjenning), Motstrid (velg A / B / begge – samme valg som knappene fra del 3) og «Ikke brukt på lenge» (behold / slett – slett
// bare når brukeren trykker to ganger, via den vanlige DELETE /api/glimt/memory/:id). (2) Brytere i AI-kontroll → Valg som fyller
// [data-mem63set]. (3) Lenken fra morgen-pushen («Glimt har 3 forslag til minnet», url ROUTE63) åpner Innstillinger → AI og
// blar ned til forslagene. Ingenting kommer inn i minnet uten at brukeren trykker. Eldre server (404): ingenting vises.
import { loadMemory, deleteMemory } from './glimt-memory.js';
import { parseAliases60 } from './entities60.js';
import { when62 } from './sched62.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const ROUTE63 = '/#/innstillinger/glimt-husker';
export const KEYS63 = ['nightly', 'conflicts', 'stale'];
export const STALE_DAYS63 = [30, 60, 90, 180, 365];
const LAB = { nightly: 'Nattlig oppsummering', conflicts: 'Motstrid-sjekk', stale: 'Marker ubrukte fakta' };
const HELP = {
  nightly: 'Kl. 03 hver natt går Glimt gjennom dagens samtaler, rettelser og nye kalenderhendelser og foreslår nye fakta. Ingenting lagres før du godkjenner. Kjøres bare med lokal modell.',
  conflicts: 'Glimt sier fra når to ting motsier hverandre («Nina er frisør» og «Nina er tannlege») og spør hvilken som stemmer.',
  stale: 'Fakta som ikke er brukt på lenge får et merke. De slettes aldri automatisk – bare når du trykker Slett.',
};
const SRC = { conversation: 'Glimt-samtale', correction: 'Rettelse', calendar: 'Kalender' };
const TZ = 'Europe/Oslo';

/* ---------- Hjelpere (rene, testes i test/p63-web.test.js) ---------- */
/** Lenken fra pushen: «#/innstillinger/glimt-husker» (også under ai/). */
export const isRoute63 = (hash) => /^#\/innstillinger\/(?:ai\/)?glimt-husker\/?$/.test(String(hash ?? ''));
export const days63 = (n) => `${n} ${n === 1 ? 'dag' : 'dager'}`;
/** «18. jun» (samme år) / «18. jun 2025» (Europe/Oslo). '' for ugyldig. */
export function date63(iso, now = new Date()) {
  const d = new Date(iso ?? NaN);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const y = (x) => x.toLocaleDateString('sv-SE', { timeZone: TZ }).slice(0, 4);
  const s = d.toLocaleDateString('nb-NO', { timeZone: TZ, day: 'numeric', month: 'short' }).replace(/\.$/, '').replace(/\.\s*$/, '');
  return y(d) === y(now) ? s : `${s} ${y(d)}`;
}
/** «Ikke brukt på 131 dager · sist brukt 18. jun» / «Aldri brukt · lagt inn 3. feb 2025». */
export function staleLine63(it = {}, now = new Date()) {
  const n = Number.isFinite(it.daysUnused) ? it.daysUnused : null;
  const head = n == null ? 'Ikke brukt på lenge' : `Ikke brukt på ${days63(n)}`;
  const tail = it.lastUsedAt ? `sist brukt ${date63(it.lastUsedAt, now)}` : it.keptAt ? `beholdt ${date63(it.keptAt, now)}` : it.createdAt ? `aldri brukt · lagt inn ${date63(it.createdAt, now)}` : 'aldri brukt';
  return `${head} · ${tail}`;
}
/** «Nina → frisør» for et ubrukt faktum (tittelen når den finnes). */
export function staleTitle63(it = {}) {
  const s = String(it.subject ?? '').trim();
  if (it.title) return s && !String(it.title).toLowerCase().includes(s.toLowerCase()) ? `${s} → ${it.title}` : String(it.title);
  return `${s} → ${it.object ?? ''}`.trim();
}
/** Kilde og hvorfor: «Glimt-samtale · Du sa det i en samtale med Glimt i går». */
export const pendingSub63 = (p = {}) => [p.sourceLabel || SRC[p.source] || '', p.reason || ''].filter(Boolean).join(' · ');
/** Setningen som vises: serverens «Kari er søsteren din», ellers «Kari er søsteren min». */
export const sentence63 = (p = {}) => p.sentence || [p.subject, p.predicate || 'er', p.object].filter(Boolean).join(' ');
/** Feil i redigeringen før den sendes. '' = greit. */
export function checkEdit63({ subject, object, aliases = [] } = {}) {
  const s = String(subject ?? '').trim(), o = String(object ?? '').trim();
  if (s.length < 2 || s.length > 80) return 'Navnet må være 2–80 tegn';
  if (o.length < 1 || o.length > 120) return 'Hva det er må være 1–120 tegn';
  if (aliases.length > 20) return 'Maks 20 aliaser';
  const bad = aliases.find((a) => a.length < 2 || a.length > 60);
  return bad ? `Aliaset «${bad}» må være 2–60 tegn` : '';
}
/** Bare feltene som er endret ({} = ingen endring). */
export function editBody63(form = {}, p = {}) {
  const out = {}, s = String(form.subject ?? '').trim().replace(/\s+/g, ' '), o = String(form.object ?? '').trim().replace(/\s+/g, ' ');
  const al = Array.isArray(form.aliases) ? form.aliases : parseAliases60(form.aliases);
  if (s !== (p.subject ?? '')) out.subject = s;
  if (o !== (p.object ?? '')) out.object = o;
  if (al.join('\n') !== (p.aliases ?? []).join('\n')) out.aliases = al;
  return out;
}
/** Nattjobbens siste kjøring på én linje. */
export function runLine63(run, now = new Date()) {
  if (!run) return 'Ikke kjørt ennå';
  const at = when62(run.at, now);
  if (run.status === 'skipped') return `Hoppet over ${at}${run.reason ? `: ${run.reason}` : ''}`;
  if (run.status === 'failed') return `Feilet ${at}${run.reason ? `: ${run.reason}` : ''}`;
  const n = (k, one, many) => (Number.isFinite(run[k]) ? `${run[k]} ${run[k] === 1 ? one : many}` : '');
  return [`Kjørt ${at}`, n('proposals', 'forslag', 'forslag'), n('conflicts', 'motstrid', 'motstrid'), n('stale', 'ubrukt', 'ubrukte')].filter(Boolean).join(' · ');
}
/** Telleren i overskriften: «3 forslag · 1 motstrid». */
export function countsLine63(c = {}) {
  return [c.pending ? `${c.pending} forslag` : '', c.conflicts ? `${c.conflicts} motstrid` : '', c.stale ? `${c.stale} ikke brukt på lenge` : ''].filter(Boolean).join(' · ');
}
/** Valgknappene for en motstrid (serverens choices, ellers de tre faste). */
export function choices63(c = {}) {
  if (Array.isArray(c.choices) && c.choices.length) return c.choices.filter((x) => x && ['keep_a', 'keep_b', 'both'].includes(x.id));
  return [{ id: 'keep_a', label: `Behold «${c.a?.label ?? 'A'}»` }, { id: 'keep_b', label: `Behold «${c.b?.label ?? 'B'}»` }, { id: 'both', label: 'Begge stemmer' }];
}

/* ---------- Data ---------- */
const M = { pend: null, conf: null, stale: null, hyg: null, at: 0, loading: null, missing: false, err: '', msg: '', smsg: '', edit: null, emsg: '', arm: null, busy: {}, sbusy: false, flash: 0 };
async function call(path, method = 'GET', json) {
  const r = await fetch(`/api/glimt/memory${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status === 404 ? 'Fant ikke dette' : `Feil ${r.status}`)), { status: r.status, data: d });
  return d;
}
export async function loadMem63(force = false) {
  if (!force && M.at && Date.now() - M.at < 20_000) return M;
  if (M.loading) return M.loading;
  M.loading = (async () => {
    const [p, c, s, h] = await Promise.allSettled([call('/pending'), call('/conflicts'), call('/stale'), call('/hygiene')]);
    if (p.status === 'rejected' && (p.reason.status === 404 || p.reason.status === 405)) M.missing = true;
    else {
      M.missing = false;
      M.pend = p.status === 'fulfilled' ? p.value : M.pend; M.conf = c.status === 'fulfilled' ? c.value : M.conf;
      M.stale = s.status === 'fulfilled' ? s.value : M.stale; M.hyg = h.status === 'fulfilled' ? h.value : M.hyg;
      const bad = [p, c, s, h].find((x) => x.status === 'rejected');
      M.err = bad ? bad.reason.message : '';
    }
    M.at = Date.now(); M.loading = null;
    return M;
  })();
  return M.loading;
}

/* ---------- «Glimt husker»: Forslag, Motstrid, Ikke brukt på lenge ---------- */
const on = (k) => M.hyg?.settings?.[k] !== false;
const b = (attr, label, cls = '', dis = false, extra = '') => `<button type="button" class="m63-b${cls ? ` ${cls}` : ''}" ${attr}${dis ? ' disabled' : ''}${extra}>${label}</button>`;
function editHtml(p) {
  const id = esc(p.id), busy = !!M.busy[p.id];
  return `<form class="m63-form" data-m63-form="${id}" autocomplete="off">
    <label class="m63-fl"><span>Navn</span><input name="subject" required minlength="2" maxlength="80" value="${esc(p.subject ?? '')}" aria-label="Navn"></label>
    <label class="m63-fl"><span>${p.kind === 'alias' ? 'Er (type)' : 'Er'}</span><input name="object" required maxlength="120" value="${esc(p.object ?? '')}" aria-label="Hva det er"></label>
    <label class="m63-fl"><span>Aliaser</span><input name="aliases" maxlength="1400" value="${esc((p.aliases ?? []).join(', '))}" placeholder="søster, Kari B (skill med komma)" aria-label="Aliaser, skilt med komma"></label>
    ${M.emsg ? `<span class="m63-msg" role="status">${esc(M.emsg)}</span>` : ''}
    <div class="m63-acts"><button type="button" class="m63-b" data-m63-cancel>Avbryt</button><button type="submit" class="m63-b" name="act" value="save"${busy ? ' disabled' : ''}>Lagre forslaget</button><button type="submit" class="m63-b pri" name="act" value="approve"${busy || p.conflictId ? ' disabled' : ''}>Lagre og godkjenn</button></div></form>`;
}
function pendingHtml(p) {
  const id = esc(p.id), busy = !!M.busy[p.id], ev = (p.evidence ?? []).filter((x) => x?.text).slice(0, 3);
  const al = (p.aliases ?? []).length ? `<span class="m63-al">${p.aliases.map((a) => `<i data-no-i18n>${esc(a)}</i>`).join('')}</span>` : '';
  const conf = p.conflictId ? '<span class="m63-warn">Motsier noe Glimt allerede vet – velg under Motstrid først.</span>' : '';
  const evh = ev.length ? `<details class="m63-ev"><summary>Hvorfor Glimt tror det</summary><ul>${ev.map((x) => `<li data-no-i18n>«${esc(x.text)}»${x.at ? ` <small>${esc(when62(x.at))}</small>` : ''}</li>`).join('')}</ul></details>` : '';
  return `<div class="m63-item" data-m63-p="${id}"><span class="sg-txt"><b data-no-i18n>${esc(sentence63(p))}</b><span>${esc(pendingSub63(p))}${p.edited ? ' · redigert' : ''}</span>${al}${conf}${evh}</span>
    ${M.edit === p.id ? editHtml(p) : `<div class="m63-acts">${b(`data-m63-ok="${id}"`, 'Godkjenn', 'pri', busy || !!p.conflictId)}${b(`data-m63-edit="${id}"`, 'Rediger', '', busy)}${b(`data-m63-no="${id}"`, 'Avvis', '', busy)}</div>`}</div>`;
}
function conflictHtml(c) {
  const id = esc(c.id), busy = !!M.busy[c.id];
  const side = (x, k) => (x ? `<span class="m63-side"><i>${k}</i><span><b data-no-i18n>${esc(x.label ?? `${x.subject ?? ''} er ${x.object ?? ''}`)}</b>${x.sourceLabel ? `<small>${esc(x.sourceLabel)}</small>` : ''}</span></span>` : '');
  return `<div class="m63-item m63-c" data-m63-c="${id}"><span class="sg-txt"><b data-no-i18n>${esc(c.question || 'Hvilken stemmer?')}</b>${side(c.a, 'A')}${side(c.b, 'B')}</span>
    <div class="m63-acts m63-opts" role="group" aria-label="Velg">${choices63(c).map((x) => b(`data-m63-choice="${id}|${esc(x.id)}"`, `<span data-no-i18n>${esc(x.label)}</span>`, x.id === 'both' ? '' : 'pri', busy)).join('')}</div></div>`;
}
function staleHtml(it) {
  const id = esc(it.id), busy = !!M.busy[`s${it.id}`];
  return `<div class="m63-item" data-m63-s="${id}"><span class="sg-txt"><b data-no-i18n>${esc(staleTitle63(it))}</b><span><i class="m63-chip">ikke brukt på lenge</i>${esc(staleLine63(it))}</span></span>
    <div class="m63-acts">${b(`data-m63-keep="${id}"`, 'Behold', 'pri', busy)}${b(`data-m63-del="${id}"`, M.arm === it.id ? 'Trykk igjen for å slette' : 'Slett', 'bad', busy)}</div></div>`;
}
export function memHtml63() {
  if (M.missing) return '';
  if (!M.pend && !M.hyg) return `<div class="m63" data-m63><div class="sg-row"><span class="sg-txt"><span>${M.err ? `Serveren svarte: ${esc(M.err)}` : 'Laster forslag …'}</span></span></div></div>`;
  const P = (M.pend?.items ?? []).filter((x) => !x.status || x.status === 'pending'), C = (M.conf?.items ?? []).filter((x) => !x.status || x.status === 'open'), S = M.stale?.items ?? [];
  const h = M.hyg, sch = h?.schedule, cnt = countsLine63({ pending: P.length, conflicts: C.length, stale: S.length });
  const next = !on('nightly') ? 'Nattlig oppsummering er slått av' : sch?.status === 'paused' ? 'Nattjobben er satt på pause i Faste oppgaver' : sch?.nextRunAt ? `Neste ${when62(sch.nextRunAt)}` : 'Hver natt kl. 03';
  const head = `<div class="sg-row m63-head"><span class="sg-txt"><b>Glimt rydder minnet${cnt ? ` · <span>${esc(cnt)}</span>` : ''}</b><span>${esc(next)} · ${esc(runLine63(h?.lastRun))}</span></span>${b('data-m63-run', M.busy.run ? 'Kjører …' : 'Kjør nå', '', !!M.busy.run || !on('nightly'))}</div>`;
  const msg = M.msg ? `<div class="sg-row"><span class="sg-txt"><span role="status">${esc(M.msg)}</span></span></div>` : '';
  const empty = (t) => `<div class="sg-row"><span class="sg-txt"><span>${t}</span></span></div>`;
  const pend = `<h4 class="m63-t">Forslag${P.length ? ` <small>${P.length}</small>` : ''}</h4>${P.length ? P.map(pendingHtml).join('') : empty(on('nightly') ? 'Ingen nye forslag. Glimt foreslår nye fakta hver natt fra samtalene, rettelser og nye kalenderhendelser – ingenting lagres før du godkjenner.' : 'Nattlig oppsummering er av. Slå den på i AI → Oppgaver.')}`;
  const conf = on('conflicts') || C.length ? `<h4 class="m63-t">Motstrid${C.length ? ` <small>${C.length}</small>` : ''}</h4>${C.length ? C.map(conflictHtml).join('') : empty('Ingenting motsier hverandre.')}` : '';
  const days = M.stale?.staleDays ?? h?.staleDays ?? 90;
  const stale = on('stale') ? `<h4 class="m63-t">Ikke brukt på lenge${S.length ? ` <small>${S.length}</small>` : ''}</h4>${S.length ? S.map(staleHtml).join('') : empty(`Alt Glimt husker er brukt de siste ${days} dagene.`)}<div class="m63-note">Merket etter ${esc(days63(days))} uten bruk. Slettes aldri automatisk – trykk Behold for å fjerne merket.</div>` : '';
  return `<div class="m63${M.flash > Date.now() ? ' m63-flash' : ''}" data-m63>${head}${msg}${pend}${conf}${stale}</div>`;
}

/* ---------- AI-kontroll → Valg ---------- */
const sw = (v) => `<span class="ac-sw${v ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const lab = (k) => esc(M.hyg?.labels?.[k] ?? LAB[k]), help = (k) => esc(M.hyg?.help?.[k] && M.hyg.help[k] !== '…' ? M.hyg.help[k] : HELP[k]);
export function settingsHtml63() {
  if (M.missing) return '';
  const d = M.hyg;
  if (!d) return `<div class="ac-sec"><span class="ac-lab">MINNET HOLDER SEG RYDDIG</span><div class="ac-card ac-list"><div class="ac-mut" style="padding:12px 0">${M.err ? esc(M.err) : 'Laster …'}</div></div></div>`;
  const mine = KEYS63.map((k) => {
    const srv = d.server?.[k] !== false, own = d.user?.[k], v = srv && (own ?? srv);
    const sub = !srv ? 'Slått av for alle av administrator' : own == null ? help(k) : `${help(k)} · Ditt eget valg`;
    return `<button type="button" class="ac-li" data-m63-user="${k}" role="switch" aria-checked="${v}"${M.sbusy || !srv ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(k)}</b><span>${sub}</span></span>${sw(v)}</button>`;
  }).join('');
  const days = d.staleDays ?? 90;
  const seg = `<div class="ac-par"><span class="ac-row ac-sb"><span class="ac-col"><b>Ikke brukt på lenge etter</b><span>Når et faktum får merket. Det slettes aldri automatisk.</span></span><b class="ac-mono">${esc(days63(days))}</b></span><div class="ac-seg" role="group" aria-label="Dager uten bruk">${STALE_DAYS63.map((n) => `<button type="button" class="${n === days ? 'on' : ''}" data-m63-days="${n}" aria-pressed="${n === days}"${M.sbusy || d.settings?.stale === false ? ' disabled' : ''}>${n} d</button>`).join('')}</div></div>`;
  const cnt = countsLine63(d.counts ?? {});
  const link = `<button type="button" class="ac-li" data-m63-open><span class="ac-col ac-grow"><b>Se forslag og motstrid</b><span>${cnt ? `${esc(cnt)} · ` : ''}Innstillinger → AI → Glimt husker</span></span><span aria-hidden="true">›</span></button>`;
  let admin = '';
  if (d.admin) {
    const rows = KEYS63.map((k) => { const v = d.server?.[k] !== false; return `<button type="button" class="ac-li" data-m63-server="${k}" role="switch" aria-checked="${v}"${M.sbusy ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(k)}</b><span>${help(k)}</span></span>${sw(v)}</button>`; }).join('');
    admin = `<div class="ac-sec"><span class="ac-lab">MINNET · FOR ALLE (ADMIN)</span><div class="ac-card ac-list">${rows}</div><div class="ac-note">Av her slår funksjonen av for alle brukere. Hver bruker kan i tillegg slå av for seg selv over.</div></div>`;
  }
  return `<div class="ac-sec" data-m63-sec><span class="ac-lab">MINNET HOLDER SEG RYDDIG · FOR MEG</span><div class="ac-card ac-list">${mine}${seg}${link}</div><div class="ac-note">Nattjobben står også i Faste oppgaver som systemoppgave, der du kan sette den på pause.</div>${M.smsg ? `<div class="ac-note" role="status">${esc(M.smsg)}</div>` : ''}</div>${admin}`;
}

/* ---------- Tegning og hendelser ---------- */
const STYLE63 = `.m63,section:has([data-mem63]){scroll-margin-top:72px}.m63-head{border-bottom:1px solid rgba(127,127,127,.2)}.m63-head .sg-txt b span{font-weight:500;opacity:.8}
.m63-t{margin:0;padding:14px 26px 4px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.7}.m63-t small{font-size:12px;opacity:.8;margin-left:4px}
.m63-item{display:flex;flex-direction:column;gap:8px;padding:12px 26px;border-top:1px solid rgba(127,127,127,.15)}
.m63-item .sg-txt{display:flex;flex-direction:column;gap:3px;min-width:0}.m63-item .sg-txt b,.m63-item .sg-txt>span{overflow-wrap:anywhere}
.m63-acts{display:flex;gap:8px;flex-wrap:wrap}
.m63-b{min-height:38px;padding:0 14px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit;font:inherit;font-size:14.5px;cursor:pointer;text-align:left}
.m63-b:hover{background:rgba(127,127,127,.14)}.m63-b.pri{background:rgba(127,127,127,.22);font-weight:600}.m63-b.bad{color:#d0503c}.m63-b:disabled{opacity:.5;cursor:default}
.m63-al{display:flex!important;flex-wrap:wrap;gap:5px}.m63-al i{font-style:normal;font-size:13px;padding:2px 9px;border-radius:999px;border:1px solid rgba(127,127,127,.35)}
.m63-chip{font-style:normal;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;margin-right:6px;border:1px solid #b7871a;color:#b7871a;white-space:nowrap}
.m63-warn{color:#b7871a;font-size:13.5px}.m63-msg{font-size:13.5px;opacity:.85}
.m63-ev summary{cursor:pointer;font-size:13.5px;opacity:.8}.m63-ev ul{margin:4px 0 0;padding-left:18px;font-size:13.5px;opacity:.85}.m63-ev small{opacity:.7}
.m63-side{display:flex!important;gap:8px;align-items:flex-start;padding:6px 10px;border-radius:10px;background:rgba(127,127,127,.1)}
.m63-side>i{font-style:normal;font-weight:700;opacity:.6;flex:none}.m63-side>span{display:flex;flex-direction:column;min-width:0}.m63-side small{opacity:.7}
.m63-form{display:flex;flex-direction:column;gap:8px}.m63-fl{display:flex;flex-direction:column;gap:4px}.m63-fl span{font-weight:600;opacity:.8;font-size:14px}
.m63-fl input{min-width:0;height:42px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit;font:inherit}
.m63-note{padding:8px 26px 12px;font-size:13px;opacity:.7}
.m63-flash{position:relative}.m63-flash::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:0 0 0 3px rgba(122,59,107,.55);opacity:0;animation:m63f 2.4s ease-out}@keyframes m63f{0%,40%{opacity:1}100%{opacity:0}}
@media (max-width:600px){.m63-t{padding:12px 16px 4px}.m63-item{padding:12px 16px}.m63-note{padding:8px 16px 12px}.m63-head{flex-wrap:wrap;gap:10px}.m63-b{flex:1 1 auto}}`;
function css() { if (typeof document === 'undefined' || document.getElementById('m63-css')) return; const st = document.createElement('style'); st.id = 'm63-css'; st.textContent = STYLE63; document.head.appendChild(st); }

let want = false; // kom fra pushen → bla ned når seksjonen finnes
const repaint = () => {
  for (const el of document.querySelectorAll('[data-mem63]')) el.innerHTML = memHtml63();
  for (const el of document.querySelectorAll('[data-mem63set]')) el.innerHTML = settingsHtml63();
  if (want) reveal();
};
function reveal() {
  const el = document.querySelector('[data-mem63] [data-m63]');
  if (!el || !M.at) return;
  want = false; M.flash = Date.now() + 2400;
  el.classList.add('m63-flash');
  (el.closest('section') ?? el).scrollIntoView({ behavior: 'smooth', block: 'start' }); // med overskriften «Glimt husker»
}
let raf = 0;
function decorate() {
  const els = [...document.querySelectorAll('[data-mem63]:not([data-m63-done]),[data-mem63set]:not([data-m63-done])')];
  if (!els.length) return;
  css();
  for (const el of els) { el.dataset.m63Done = '1'; el.innerHTML = el.matches('[data-mem63]') ? memHtml63() : settingsHtml63(); }
  loadMem63().then(repaint);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };
const find = (k, id) => (k === 'p' ? M.pend?.items : k === 'c' ? M.conf?.items : M.stale?.items)?.find((x) => String(x.id) === String(id)) ?? null;
/** Etter en endring i minnet: last alt på nytt, også «Glimt husker»-lista (settings-ai.js lytter på mem63:changed). */
async function changed(msg, memory = false) {
  M.msg = msg; M.arm = null;
  await loadMem63(true);
  if (memory) { await loadMemory(true).catch(() => {}); document.dispatchEvent(new CustomEvent('mem63:changed')); }
  repaint();
}
async function act(key, fn) {
  M.busy[key] = true; M.msg = ''; repaint();
  try { await fn(); } catch (er) { M.msg = er.message; await loadMem63(true); }
  M.busy[key] = false; repaint();
}
async function approve(p, body = {}) {
  try {
    const r = await call(`/pending/${encodeURIComponent(p.id)}/approve`, 'POST', body);
    M.edit = null; M.emsg = '';
    await changed(`Lagret i minnet: «${sentence63(r.item ?? p)}» ✓`, true);
  } catch (er) {
    if (er.status === 409) { M.edit = null; await changed('Forslaget motsier noe Glimt allerede vet. Velg hva som stemmer under Motstrid.'); return; }
    throw er;
  }
}
async function putHyg(body) { M.hyg = await call('/hygiene', 'PUT', body); }
async function actSettings(fn) {
  M.sbusy = true; M.smsg = ''; repaint();
  try { M.smsg = (await fn()) ?? ''; } catch (er) { M.smsg = er.message; }
  M.sbusy = false;
  await loadMem63(true); repaint();
}
function openMem() {
  const el = document.querySelector('[data-mem63]');
  want = true;
  if (el?.isConnected && !el.closest('[hidden]')) { reveal(); return; }
  if (/^\/finans/.test(location.pathname)) { location.href = ROUTE63; return; }
  import('./settings.js').then((m) => m.openSettings('ai')).catch(() => { location.hash = '#/innstillinger/ai'; });
}

if (typeof document !== 'undefined') {
  // Lenken fra pushen. Sjekkes før settings.js leser adressen (denne modulen lastes først).
  if (isRoute63(location.hash)) want = true;
  window.addEventListener('hashchange', () => { if (isRoute63(location.hash)) { want = true; M.at = 0; } });
  document.addEventListener('click', async (e) => {
    const t = e.target.closest?.('[data-m63-ok],[data-m63-no],[data-m63-edit],[data-m63-cancel],[data-m63-choice],[data-m63-keep],[data-m63-del],[data-m63-run],[data-m63-user],[data-m63-server],[data-m63-days],[data-m63-open]');
    if (!t || t.disabled) return;
    e.preventDefault();
    const ds = t.dataset;
    if (ds.m63Open != null) { e.stopPropagation(); openMem(); return; }
    if (ds.m63User) {
      const k = ds.m63User, srv = M.hyg?.server?.[k] !== false, cur = srv && (M.hyg?.user?.[k] ?? srv), next = !cur;
      actSettings(async () => { await putHyg({ scope: 'user', [k]: next === srv ? null : next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for deg`; });
      return;
    }
    if (ds.m63Server) {
      const k = ds.m63Server, next = !(M.hyg?.server?.[k] !== false);
      actSettings(async () => { await putHyg({ scope: 'server', [k]: next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for alle`; });
      return;
    }
    if (ds.m63Days) {
      const n = Number(ds.m63Days);
      if (n === (M.hyg?.staleDays ?? 90)) return;
      actSettings(async () => { await putHyg({ scope: 'user', staleDays: n }); return `Merkes etter ${days63(n)} uten bruk`; });
      return;
    }
    if (ds.m63Run != null) {
      act('run', async () => { const r = await call('/hygiene/run-now', 'POST'); await changed(r.run?.status === 'ok' ? (r.run.proposals ? `Ferdig: ${r.run.proposals} ${r.run.proposals === 1 ? 'nytt forslag' : 'nye forslag'} under` : 'Ferdig: ingen nye forslag') : r.run ? runLine63(r.run) : 'Ferdig ✓'); });
      return;
    }
    if (ds.m63Edit) { M.edit = ds.m63Edit; M.emsg = ''; M.msg = ''; repaint(); document.querySelector(`[data-m63-form="${CSS.escape(ds.m63Edit)}"] input[name=object]`)?.focus(); return; }
    if (ds.m63Cancel != null) { M.edit = null; M.emsg = ''; repaint(); return; }
    if (ds.m63Ok) { const p = find('p', ds.m63Ok); if (p) act(p.id, () => approve(p)); return; }
    if (ds.m63No) { const id = ds.m63No; act(id, async () => { await call(`/pending/${encodeURIComponent(id)}/reject`, 'POST'); await changed('Avvist – Glimt lagrer det ikke'); }); return; }
    if (ds.m63Choice) {
      const [id, choice] = ds.m63Choice.split('|');
      act(id, async () => { await call(`/conflicts/${encodeURIComponent(id)}/resolve`, 'POST', { choice }); await changed(choice === 'both' ? 'Begge beholdes – Glimt spør ikke igjen ✓' : 'Lagret valget ✓', true); });
      return;
    }
    if (ds.m63Keep) { const id = ds.m63Keep; act(`s${id}`, async () => { await call(`/stale/${encodeURIComponent(id)}/keep`, 'POST'); await changed('Beholdt – merket er fjernet ✓', true); }); return; }
    if (ds.m63Del) {
      const id = Number(ds.m63Del);
      if (M.arm !== id) { M.arm = id; M.msg = ''; repaint(); return; }
      act(`s${id}`, async () => { await deleteMemory(id); await changed('Slettet fra minnet ✓', true); });
    }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest?.('[data-m63-form]');
    if (!f) return;
    e.preventDefault();
    const p = find('p', f.dataset.m63Form);
    if (!p) return;
    const fd = new FormData(f), form = { subject: fd.get('subject'), object: fd.get('object'), aliases: parseAliases60(fd.get('aliases')) };
    const bad = checkEdit63(form);
    if (bad) { M.emsg = bad; repaint(); return; }
    const body = editBody63(form, p), approveIt = (e.submitter?.value ?? 'save') === 'approve';
    act(p.id, async () => {
      if (approveIt) { await approve(p, body); return; }
      if (!Object.keys(body).length) { M.edit = null; M.emsg = ''; M.msg = 'Ingen endringer'; return; }
      const r = await call(`/pending/${encodeURIComponent(p.id)}/edit`, 'POST', body);
      M.edit = null; M.emsg = '';
      await changed(r.item?.conflictId ? 'Lagret forslaget – det motsier noe Glimt vet, se Motstrid' : 'Lagret forslaget – godkjenn når det stemmer');
    });
  });
  const boot = () => { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
}
