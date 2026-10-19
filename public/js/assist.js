// Glimt-ruteren på klienten (prompt 31, claude-code-sok-ai-svarboble.md, claude-code-chat-kort-vaer-kalender.md,
// claude-code-ai-bakgrunnsvarsel.md). POST /api/assist {q, source:'search'|'chat', chatId?}:
// - 200 → svaret direkte {text (med **…**), source, intent, card?, tool?, ms, chatContext}.
// - 202 {jobId} → serverjobben fortsetter selv om fanen lukkes. Status fra sanntid «assist» ({jobId, state, steps,
//   fields, progress, title, model, input}) og GET /api/assist/:id (reserve hvert 1,5 s).
// - Mangler endepunktet (eldre server, 404/405): enkel reserve her (vær fra /api/weather, kalenderen fra /api/kalender,
//   prøveperioder med trial-parse.js, ellers /api/search/ask).
// Kommer svaret mens fanen er skjult, vises banneret «Glimt svarte mens du var borte» når brukeren kommer tilbake (4 s).
// Serveren sender selv Web Push når fanen ikke er synlig (presence, se webpush.js).
import { onLive } from './realtime.js';
import { aiStart, aiUpdate, aiDone } from './ai-jobs.js';
import { glimt } from './glimt.js';
import { parseTrial, trialSentence } from './trial-parse.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
/** Tekst med **uthevet** → HTML (alt annet escapes). */
export const boldHtml = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
/** Uten markdown (varsler, kopier). */
export const plain = (t) => String(t ?? '').replace(/\*\*(.+?)\*\*/g, '$1');

/* Ord som tyder på et verktøy (Chat sender bare disse til /api/assist; resten går til språkmodellen som før). */
export const TOOL_RE = {
  weather: /v(æ|ae)r(et|meldingen)?\b|regn(er|e)?\b|paraply|grader|temperatur|snø|vind|kaldt|varmt|jakke|weather/i,
  next: /\bnår (er|har jeg)\b.*\b(time|timen|avtale|tannlege|frisør|lege)|\bneste\b.*\b(time|avtale)\b|\bnår har jeg\b/i,
  calendar: /kalender|avtaler?\b|timeplan|hva skjer|hva har jeg|planer|møter?\b|i morgen\b|i dag\b/i,
  departures: /avgang|avganger|\bnår går\b|buss(en)?\b|trikk(en)?\b|t-?bane(n)?\b|\btog(et)?\b/i,
  packages: /pakke(n|r|ne)?\b|sending(en)?\b|levert\b|hentested/i,
  finance: /brukt på|bruker jeg på|forbruk|kostet|utgifter|hvor mye (har jeg )?brukt/i,
  tasks: /huskeliste|handleliste|gjøremål|oppgaver|må jeg huske/i,
  trial: /pr(ø|o)ve(periode)?|gratis i|avslutt|si opp|oppsig|trial/i,
  // Prompt 33: «husk at Påhåret er frisøren min», «det var frisør», «dette er for tannlegen»
  memory: /^(husk at\s+)?.{0,60}\b(er|var|gjelder)\s+(for\s+|hos\s+)?(min\s+|en\s+)?(frisør|frisøren|lege|legen|fastlegen|tannlege|tannlegen|fysio|fysioterapeut(en)?|optiker(en)?|psykolog(en)?)(\s+min)?[.!]?$/i,
};
export const looksLikeTool = (q) => Object.values(TOOL_RE).some((re) => re.test(String(q ?? '')));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waiters = new Map(); // jobId → fn(msg)
let liveOn = false;
function live() {
  if (liveOn) return; liveOn = true;
  onLive('assist', (m) => {
    const id = String(m?.jobId ?? m?.id ?? m?.job?.id ?? '');
    if (!id) return;
    aiUpdate(`as:${id}`, { steps: m.steps, fields: m.fields, progress: m.progress, title: m.title, model: m.model, input: m.input });
    waiters.get(id)?.(m);
  });
}

async function post(path, json, signal) {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) });
  if (r.status === 401) { location.href = '/login'; throw new Error('Ikke innlogget'); }
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  return { ok: r.ok, status: r.status, d };
}
const jget = async (path, signal) => { const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal }); return r.ok ? r.json() : Promise.reject(Object.assign(new Error(`Feil ${r.status}`), { status: r.status })); };

/** Svaret i felles form. */
export function normAnswer(d = {}, ms0 = 0) {
  const inner = d.answer && typeof d.answer === 'object' ? d.answer : d.result && typeof d.result === 'object' ? d.result : null;
  const r = inner ? { ...d, ...inner } : d;
  let text = r.text ?? (typeof r.answer === 'string' ? r.answer : '') ?? '';
  if (!text && (r.pre || r.b || r.post)) text = `${r.pre ?? ''}${r.b ? `**${r.b}**` : ''}${r.post ?? ''}`;
  if (!text && r.bold) text = `**${r.bold}**`;
  return { text: String(text), source: r.source ?? r.src ?? '', intent: r.intent ?? '', card: r.card ?? null, tool: r.tool ?? null, ms: r.ms ?? (ms0 ? Date.now() - ms0 : 0),
    chatId: r.chatId ?? r.chatContext?.chatId ?? null, chatContext: r.chatContext ?? null, question: r.question ?? null, jobId: r.jobId ?? null, error: r.error ?? null, memory: r.memory ?? null, apply: r.apply ?? null,
    // Prompt 34 (SERVER34 ai.run): modell, merknad («Sky-budsjettet er brukt opp …») og advarsler.
    // Prompt 35: «været i New York» → place {name, label, lat, lon …} og open {route:'vaer', name, lat, lon}.
    place: r.place ?? null, open: r.open ?? null,
    model: r.model ?? null, notice: r.notice ?? (Array.isArray(r.warnings) && r.warnings.length ? r.warnings.join(' · ') : null) };
}

/** Venter på en serverjobb: sanntid eller polling, maks 90 s. */
async function waitJob(jobId, signal) {
  live();
  return new Promise((resolve, reject) => {
    let done = false, timer = 0;
    const fin = (v, err) => { if (done) return; done = true; waiters.delete(jobId); clearTimeout(timer); if (err) reject(err); else resolve(v); };
    const t0 = Date.now();
    waiters.set(jobId, (m) => {
      if (m.state === 'done' || m.state === 'failed' || m.state === 'cancelled') {
        if (m.state !== 'done') return fin(null, new Error(m.error || (m.state === 'cancelled' ? 'Avbrutt' : 'Glimt fikk ikke svart.')));
        if (m.text || m.result || m.answer) fin(m); else jget(`/api/assist/${encodeURIComponent(jobId)}`, signal).then((d) => fin(d)).catch((e) => fin(null, e));
      }
    });
    signal?.addEventListener('abort', () => fin(null, Object.assign(new Error('Avbrutt'), { name: 'AbortError' })));
    const poll = async () => {
      if (done) return;
      if (Date.now() - t0 > 90_000) return fin(null, new Error('Glimt brukte for lang tid. Prøv igjen, eller fortsett i Chat.'));
      try {
        const d = await jget(`/api/assist/${encodeURIComponent(jobId)}`, signal);
        const st = d.state ?? d.status ?? (d.text || d.result ? 'done' : 'running');
        if (st === 'done') return fin(d);
        if (st === 'failed' || st === 'cancelled') return fin(null, new Error(d.error || 'Glimt fikk ikke svart.'));
        aiUpdate(`as:${jobId}`, { steps: d.steps, fields: d.fields, progress: d.progress, model: d.model, input: d.input, title: d.title });
      } catch (e) { if (e.name === 'AbortError') return; }
      timer = setTimeout(poll, 1500);
    };
    timer = setTimeout(poll, 1200);
  });
}

/**
 * Spør Glimt. o = { source:'search'|'chat', chatId?, signal?, onJob?(jobId), toast?: bool (vis Glimt-toasten for lange jobber),
 * hideToast?: () => bool }. → normAnswer(…) med text, source, card, tool …
 */
export async function assist(q, o = {}) {
  q = String(q ?? '').trim();
  const t0 = Date.now(), hiddenAtStart = document.hidden;
  let r;
  try { r = await post('/api/assist', { q, source: o.source ?? 'search', ...(o.chatId ? { chatId: o.chatId } : {}) }, o.signal); }
  catch (e) { if (e.name === 'AbortError') throw e; r = { ok: false, status: 0, d: { error: e.message } }; }
  let ans;
  if (r.status === 404 || r.status === 405) ans = await localAssist(q, o);
  else if (r.status === 202) {
    const jobId = String(r.d.jobId ?? r.d.id);
    o.onJob?.(jobId);
    const aid = o.toast === false ? null : aiStart({ id: `as:${jobId}`, title: r.d.title || 'Glimt tenker', toast: r.d.toast || `Glimt tenker på «${q.length > 28 ? `${q.slice(0, 27)}…` : q}»`, model: r.d.model || 'Glimt · lokal', input: q,
      steps: r.d.steps ?? ['Forstår spørsmålet', 'Henter data', 'Skriver svaret'], fields: r.d.fields, dur: 6000, hideToast: o.hideToast,
      cancel: () => { fetch(`/api/assist/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', credentials: 'same-origin' }).catch(() => {}); o.onCancel?.(); } });
    try { ans = normAnswer(await waitJob(jobId, o.signal), t0); } catch (e) { if (aid) aiDone(aid, { silent: true }); throw e; }
    if (aid) aiDone(aid, { silent: true });
  } else if (!r.ok) throw new Error(r.d?.error || `Glimt svarte ikke (feil ${r.status || 'nett'}).`);
  else ans = normAnswer(r.d, t0);
  // Prompt 35: eldre server svarte med Oslo-været på «været i New York» (uten place): hent været for stedet selv.
  if (/^weather/.test(ans.intent ?? '') && !ans.place && !ans.open) {
    const pl = wxPlaceOf(q);
    if (pl && !new RegExp(pl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(ans.text)) ans = { ...ans, ...(await weatherFor(pl, q.toLowerCase(), t0).catch(() => ({}))) };
  }
  // Svarte Glimt mens fanen var skjult: banner når brukeren kommer tilbake (varselet sendes av serveren).
  if (document.hidden || hiddenAtStart) awayAnswer(q, ans.text);
  return ans;
}

/* ---------------- «Glimt svarte mens du var borte» ---------------- */

let away = null;
function awayAnswer(q, text) {
  if (!text) return;
  away = { q, text };
  if (!document.hidden) showAway();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && away) setTimeout(showAway, 250); });
function showAway() {
  const a = away; away = null;
  if (!a) return;
  let el = document.getElementById('glimt-away');
  if (!el) {
    el = document.createElement('div'); el.id = 'glimt-away'; el.className = 'glimt-away'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
    el.addEventListener('click', () => el.classList.remove('on'));
  }
  el.innerHTML = `${glimt(26, 'ferdig', { dark: true })}<span class="glimt-away-t"><b>Glimt svarte mens du var borte</b><span data-no-i18n>${boldHtml(a.text)}</span></span>`;
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(showAway.t); showAway.t = setTimeout(() => el.classList.remove('on'), 4000);
}

/* ---------------- Prompt 35: været for et sted (claude-code-ai-sok-vaer-sted.md) ---------------- */
// Stedet står etter «i / på / in / for / at / ved / rundt», fram til «i morgen / i dag / i kveld / nå / tomorrow …» eller slutten.
const TIME_RE = /\b(i\s+(morgen|morra|dag|kveld|natt|helgen|overmorgen|ettermiddag|formiddag)|imorgen|idag|nå|natt|tomorrow|today|tonight|now|this\s+(weekend|week|evening|morning)|neste\s+uke|denne\s+uka)\b/gi;
const TIME_W = /^(morgen|morra|dag|kveld|natt|helgen|helga|overmorgen|uka|uken|ettermiddag|formiddag|tomorrow|today|the weekend|weekend|week|norge|nå)$/i;
/** «hvordan er været i Strømstad i morgen» → «Strømstad». null når teksten ikke nevner et sted. */
export function wxPlaceOf(q) {
  const t = ` ${String(q ?? '')} `.replace(TIME_RE, ' | ');
  for (const m of t.matchAll(/\b(?:i|på|in|for|at|ved|rundt)\s+([^|?.!,;:]+)/gi)) {
    const v = m[1].replace(/\s+(da|egentlig|nå|eller|og)\s*$/i, '').replace(/\b(været|weather|vær)\b/gi, '').trim();
    if (v.length >= 2 && !TIME_W.test(v) && !/^\d/.test(v)) return v.replace(/\s+/g, ' ').replace(/(^|[\s-])(\p{Ll})/gu, (x, a, c) => a + c.toUpperCase());
  }
  return null;
}
const wxTxt = (c) => String(c ?? '').toLowerCase();
/** Været for et navngitt sted (GET /api/weather/place?q=). Eldre server: stedsøket + /api/weather/full med koordinatene. */
async function weatherFor(name, n, t0) {
  const tm = /i\s*morgen|tomorrow/.test(n);
  let r = await fetch(`/api/weather/place?q=${encodeURIComponent(name)}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
  let d = r && r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (r?.status === 404 && d?.error) return { text: d.error + (d.suggest ? ` Mente du **${d.suggest}**?` : ''), source: 'Vær', intent: 'weather', tool: 'Vær', card: null, ms: Date.now() - t0 };
  if (!r?.ok || !d?.place) {
    // Eldre server: finn stedet med stedsøket og hent været for koordinatene.
    const hits = await jget(`/api/weather/places?q=${encodeURIComponent(name)}`).catch(() => []);
    const h = (Array.isArray(hits) ? hits : hits?.items ?? [])[0];
    if (!h) return { text: `Fant ikke stedet «${name}». Prøv en annen stavemåte.`, source: 'Vær', intent: 'weather', tool: 'Vær', card: null, ms: Date.now() - t0 };
    const f = await jget(`/api/weather/full?lat=${h.lat}&lon=${h.lon}&name=${encodeURIComponent(h.name)}`).catch(() => null);
    if (!f?.current) return { text: `Fikk ikke hentet været for ${h.name} akkurat nå.`, source: 'Vær', intent: 'weather', tool: 'Vær', card: null, ms: Date.now() - t0 };
    const norway = /^(no|norge|norway)$/i.test(h.country ?? '') || !h.country;
    d = { place: { name: h.name, label: norway ? h.name : `${h.name}, ${h.country}`, lat: h.lat, lon: h.lon, norway }, now: { temp: f.current.temp, cond: f.current.text, code: f.current.code, wind: f.current.wind }, today: { hi: f.today?.hi, lo: f.today?.lo }, tomorrow: null };
  }
  const P = d.place, N = d.now ?? {}, D = (tm ? d.tomorrow : null) ?? d.today ?? {}, lbl = P.label || P.name;
  const text = d.text || (tm && d.tomorrow ? `I morgen blir det **${Math.round(D.lo)}–${Math.round(D.hi)}°** og ${wxTxt(D.cond)} i ${lbl}.`
    : `${String(N.cond ?? '').replace(/^./, (c) => c.toUpperCase())} og **${Math.round(N.temp)}°** i ${lbl} nå${N.wind != null ? `, vind ${Math.round(N.wind)} m/s` : ''}.${D.hi != null ? ` I dag ${Math.round(D.lo)}–${Math.round(D.hi)}°.` : ''}`);
  const card = { k: 'weather', city: lbl, t: Math.round(N.temp), d: N.cond, hi: Math.round(d.today?.hi ?? N.temp), lo: Math.round(d.today?.lo ?? N.temp), h: [] };
  return { text, source: P.norway ? 'MET Norway' : 'Open-Meteo', intent: 'weather', tool: 'Vær', card, place: P, open: { route: 'vaer', name: P.name, lat: P.lat, lon: P.lon, country: P.country }, ms: Date.now() - t0 };
}
/** Adressen som åpner Vær for stedet (legges midlertidig i bylista). */
export function wxRoute(open) {
  if (!open || open.lat == null || open.lon == null) return '#/vaer';
  const q = new URLSearchParams({ name: open.name ?? '', lat: String(open.lat), lon: String(open.lon), ...(open.country ? { country: open.country } : {}) });
  return `#/vaer?${q}`;
}

/* ---------------- Reserve uten /api/assist ---------------- */

const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'], MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hmOf = (s) => { const d = new Date(s); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const STOP = /\b(når|er|neste|time(n)?|timer|hos|min|mitt|jeg|har|en|et|til|på|i|kalenderen|avtale(n)?|for)\b|\?/gi;

export async function localAssist(q, o = {}) {
  const n = q.toLowerCase(), t0 = Date.now();
  try {
    if (TOOL_RE.trial.test(n)) {
      const p = parseTrial(q);
      if (p.ok) {
        const body = { service: p.service, endsAt: p.endsAt, priceAfter: p.priceAfter, remindOffsetsDays: p.remindOffsetsDays, source: 'glimt' };
        const r = await post('/finans/api/subscriptions/trials', body).catch(() => ({ ok: false }));
        return { text: trialSentence({ service: p.service, endsAt: p.endsAt, priceAfter: p.priceAfter, remindOffsetsDays: p.remindOffsetsDays }), source: r.ok ? 'Abonnementer · varsel planlagt' : 'Abonnementer · ikke lagret', intent: 'trial.create', tool: 'Abonnementer', card: null, ms: Date.now() - t0 };
      }
      if (p.isTrial && p.question) return { text: p.question, source: 'Abonnementer', intent: 'trial.create', tool: 'Abonnementer', card: null, ms: Date.now() - t0 };
    }
    if (TOOL_RE.weather.test(n)) {
      const pl = wxPlaceOf(q);
      if (pl) return await weatherFor(pl, n, t0);
      const w = await jget('/api/weather');
      const tm = /i morgen/.test(n), um = /paraply|regn/.test(n), place = w.place || 'Oslo';
      const day = tm ? w.days?.[1] ?? w.daily?.[1] : null;
      const hi = Math.round(day?.hi ?? day?.max ?? w.hi), lo = Math.round(day?.lo ?? day?.min ?? w.lo);
      const pp = Math.round(day?.precipProb ?? day?.pop ?? (w.precip24 > 1 ? 70 : w.precip > 0 ? 50 : 10));
      const text = um ? `${tm ? 'I morgen' : 'I dag'} er det ${pp} % sjanse for nedbør i ${place}. **${pp >= 50 ? 'Ta med paraply.' : 'Du klarer deg uten paraply.'}** ${lo}–${hi}°.`
        : tm ? `I morgen blir det **${lo}–${hi}°** i ${place}.` : `Det er **${Math.round(w.temp)}° og ${String(w.text || '').toLowerCase()}** i ${place} nå, vind ${Math.round(w.wind ?? 0)} m/s. I dag ${lo}–${hi}°.`;
      const card = { k: 'weather', city: place, t: Math.round(w.temp), d: w.text, hi: Math.round(w.hi), lo: Math.round(w.lo), icon: w.icon, night: /night|moon/.test(String(w.symbol ?? w.icon ?? '')),
        h: (w.hours ?? []).slice(0, 6).map((x) => ({ h: x.label ?? x.t, icon: x.icon, t: Math.round(x.temp) })) };
      return { text, source: 'MET Norway', intent: 'weather', tool: 'Vær', card, ms: Date.now() - t0 };
    }
    if (TOOL_RE.next.test(n) || TOOL_RE.calendar.test(n)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const next = TOOL_RE.next.test(n);
      const from = isoOf(today), to = isoOf(new Date(today.getTime() + (next ? 90 : 2) * 864e5));
      const d = await jget(`/api/kalender?from=${from}&to=${to}`);
      const ev = (d.events ?? []).filter((e) => e.type !== 'bursdag' || !next);
      if (next) {
        const words = n.replace(STOP, ' ').split(/\s+/).filter((w) => w.length > 2);
        const now = Date.now();
        const hit = ev.filter((e) => new Date(e.start).getTime() >= now - 60_000).sort((a, b) => new Date(a.start) - new Date(b.start)).find((e) => words.every((w) => `${e.title} ${e.note ?? ''} ${e.room ?? ''}`.toLowerCase().includes(w)));
        if (!hit) return { text: `Fant ingen kommende ${words.join(' ')}time i kalenderen.`, source: 'Kalender', intent: 'calendar.next', tool: 'Kalender', card: null, ms: Date.now() - t0 };
        const s = new Date(hit.start), dd = Math.round((new Date(s).setHours(0, 0, 0, 0) - today) / 864e5);
        return { text: `${hit.title} er **${WD[s.getDay()]} ${s.getDate()}. ${MN[s.getMonth()]}${hit.allDay ? '' : ` kl. ${hmOf(hit.start).replace(':', '.')}`}** (${dd === 0 ? 'i dag' : dd === 1 ? 'i morgen' : `om ${dd} dager`}).`, source: 'Kalender', intent: 'calendar.next', tool: 'Kalender', card: null, ms: Date.now() - t0 };
      }
      const tm = /i morgen/.test(n), day = new Date(today.getTime() + (tm ? 864e5 : 0)), key = isoOf(day);
      const L = ev.filter((e) => (e.date ?? String(e.start).slice(0, 10)) === key).sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || String(a.start).localeCompare(String(b.start)));
      const lbl = tm ? 'I morgen' : 'I dag', first = L.find((e) => !e.allDay) ?? L[0];
      const text = L.length ? `${lbl} har du **${L.length} ting** i kalenderen. Første er ${first.title}${first.allDay ? ' (hele dagen)' : ` kl. ${hmOf(first.start)}`}.` : `${lbl} er kalenderen tom.`;
      const card = { k: 'calendar', date: key, label: lbl, items: L.map((e) => ({ t: e.title, tm: e.allDay ? 'Hele' : hmOf(e.start), c: e.color })) };
      return { text, source: 'Kalender', intent: 'calendar.day', tool: 'Kalender', card, ms: Date.now() - t0 };
    }
  } catch (e) { if (e.name === 'AbortError') throw e; /* faller tilbake til språkmodellen */ }
  if (o.source === 'chat') return { text: '', source: '', intent: 'llm', card: null, tool: null, ms: 0 };
  const r = await post('/api/search/ask', { q, force: true }, o.signal).catch(() => ({ ok: false, d: {} }));
  if (r.ok && r.d?.answer) return { text: String(r.d.answer), source: 'Glimt', intent: 'llm', card: null, tool: null, ms: Date.now() - t0 };
  return { text: 'Jeg svarer best på dette i Chat. **Trykk «Fortsett i Chat».**', source: '', intent: 'llm', card: null, tool: null, ms: Date.now() - t0 };
}
