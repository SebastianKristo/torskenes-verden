// Rask time i bakgrunnen (prompt 29, claude-code-kalender-rask-time.md). Felles for Kalender («✦ Skriv time») og
// søkefeltet på Dashboard. Tolkeren er quick-time.js (samme som serveren og PWA-en).
// - addQuick(text): POST /api/kalender/quick {text} → 202 {jobId}. Mens jobben går: pillen «✦ Legger til i kalenderen …»
//   (flere: «Legger til 2 timer …»). Status fra GET /api/kalender/quick/jobs hvert 2. s og sanntid «calendar-quick».
// - Ferdig: banner «✓ Nina frisør · fre 25. sep · 14:30» med Angre (POST …/:id/undo) og Vis (hopper til dagen).
// - Feilet: Kalender åpner skjemaet ferdig utfylt (hook fra kalender.js); andre steder banner med «Fyll ut ›».
// - Eldre server uten køen (404): tolkes her med parseQuick og lagres med POST /api/kalender/events (Privat, varsel 1 t).
// Laget (#kq-layer) ligger fast øverst over alt annet, også fullskjerm-kalenderen.
import { esc } from './util.js';
import { onLive } from './realtime.js';
import { parseQuick, quickLabel } from './quick-time.js';
import { aiStart, aiUpdate, aiDone } from './ai-jobs.js';

export { parseQuick, quickLabel };
const Q = { mine: new Map(), toast: null, err: null, poll: 0, live: false };
const hooks = { show: null, fail: null, changed: null };
let toastT = 0;

/** kalender.js registrerer: show(dateISO), fail({found, text, error}), changed() (hent kalenderen på nytt). */
export function setQuickHooks(h) { Object.assign(hooks, h); }

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Tolker lokalt (for forhåndsvisning). */
export const preview = (text) => parseQuick(text, todayISO());

async function call(path, method = 'GET', json) {
  const r = await fetch('/api' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (r.status === 401) location.href = '/login';
  return { ok: r.ok, status: r.status, d };
}

const busyN = () => [...Q.mine.values()].filter((j) => j.state === 'queued' || j.state === 'running').length;

/* Prompt 31: Glimt-toasten og glassboblen (ai-jobs.js) viser jobben mens den går. Steg og felt kommer fra serveren
   (calendar-quick-hendelsen: steps, fields, progress, model, input); ellers anslås de her. Avbryt:
   POST /api/kalender/quick/:id/cancel (eldre server: angre hvis den rakk å lagre). */
const QSTEPS = ['Leser teksten', 'Finner dato og klokkeslett', 'Sjekker kalenderen for kollisjoner', 'Lagrer avtalen'];
function qFields(text) {
  const p = preview(text);
  if (!p?.ok) return [];
  return [['Hva', p.title || 'Time'], ['Når', quickLabel(p) || ''], ['Kalender', 'Privat'], ['Varsel', p.start ? '1 time før' : 'Ingen']].filter(([, v]) => v);
}
const cancelled = new Set();
function startAi(key, text) {
  return aiStart({ id: `kq:${key}`, title: 'Legger til i kalenderen', toast: 'Legger til i kalenderen …', model: 'Glimt · lokal', input: text, steps: QSTEPS, fields: qFields(text), dur: 2600,
    cancel: () => cancelQuick(key) });
}
async function cancelQuick(key) {
  const id = String(key);
  cancelled.add(id); Q.mine.delete(id); paint();
  if (id.startsWith('t') || id.startsWith('l')) return;
  const r = await call(`/kalender/quick/${encodeURIComponent(id)}/cancel`, 'POST').catch(() => null);
  if (!r?.ok) await call(`/kalender/quick/${encodeURIComponent(id)}/undo`, 'POST').catch(() => null);
  hooks.changed?.();
}

/** Legger teksten til i bakgrunnen. Returnerer med en gang (arket lukkes). */
export async function addQuick(text) {
  text = String(text ?? '').trim();
  if (!text) return;
  const tmp = `t${Date.now()}`;
  const ai = startAi(tmp, text);
  Q.mine.set(tmp, { id: tmp, state: 'queued', text, ai });
  paint();
  let r;
  try { r = await call('/kalender/quick', 'POST', { text }); } catch (e) { r = { ok: false, status: 0, d: { error: e.message } }; }
  Q.mine.delete(tmp);
  if (cancelled.has(tmp)) {
    // Avbrutt før serveren svarte: stopp jobben der også.
    if (r.ok && (r.d?.jobId || r.d?.id)) { const jid = String(r.d.jobId ?? r.d.id); cancelled.add(jid); call(`/kalender/quick/${encodeURIComponent(jid)}/cancel`, 'POST').then((x) => { if (!x.ok) return call(`/kalender/quick/${encodeURIComponent(jid)}/undo`, 'POST'); }).catch(() => {}); }
    return;
  }
  if (r.ok && (r.d?.jobId || r.d?.id)) {
    const id = String(r.d.jobId ?? r.d.id);
    Q.mine.set(id, { id, state: 'queued', text, ai });
    aiUpdate(ai, { cancel: () => cancelQuick(id) });
    paint(); watch();
    return;
  }
  if (r.status === 404 || r.status === 405) return localAdd(text, ai);
  finish({ id: tmp, state: 'failed', text, ai, error: r.d?.error || `Kunne ikke legge til timen (feil ${r.status || 'nett'}).`, found: null });
}

/** Reserve uten køen på serveren: tolk her og lagre som vanlig hendelse. */
async function localAdd(text, ai) {
  const tmp = `l${Date.now()}`;
  Q.mine.set(tmp, { id: tmp, state: 'running', text, ai });
  if (ai) aiUpdate(ai, { cancel: () => cancelQuick(tmp) });
  paint();
  const p = preview(text);
  if (!p.ok || !p.date) { Q.mine.delete(tmp); return finish({ id: tmp, state: 'failed', text, ai, error: p.why || 'Fant ikke dato.', found: p }); }
  const body = { title: p.title, allDay: !p.start, date: p.date, start: p.start || '', end: p.start ? p.end || '' : '', location: p.place || '', calendar: 'privat', repeat: 'none', reminder: p.start ? '1h' : 'day', note: text.length > 60 ? text : '' };
  const r = await call('/kalender/events', 'POST', body).catch((e) => ({ ok: false, status: 0, d: { error: e.message } }));
  Q.mine.delete(tmp);
  if (cancelled.has(tmp)) { const eid = r.d?.id ?? r.d?.event?.id; if (r.ok && eid) await call(`/kalender/events/${encodeURIComponent(eid)}`, 'DELETE').catch(() => null); hooks.changed?.(); return; }
  if (!r.ok) return finish({ id: tmp, state: 'failed', text, ai, error: r.d?.error || `Kunne ikke lagre (feil ${r.status}).`, found: p });
  finish({ id: tmp, state: 'done', text, ai, local: true, result: { eventId: r.d?.id ?? r.d?.event?.id, title: p.title, date: p.date, start: p.start, label: quickLabel(p) } });
}

function finish(j) {
  if (cancelled.has(String(j.id))) return;
  // Glimt-toasten forsvinner; banneret under (Angre · Vis eller Fyll ut ›) viser resultatet.
  if (j.state === 'cancelled') { if (j.ai) aiDone(j.ai, { text: 'Avbrutt · ingenting ble lagt til', ok: false }); paint(); return; }
  if (j.ai) aiDone(j.ai, { silent: true });
  if (j.state === 'done') {
    const res = j.result ?? {};
    clearTimeout(toastT);
    Q.err = null;
    Q.toast = { id: j.id, local: !!j.local, eventId: res.eventId, t: res.title || 'Time', l: res.label || quickLabel(res), k: res.date, w: res.warning || (res.date && !res.start ? 'Fant ikke klokkeslett, lagt inn som hele dagen.' : '') };
    toastT = setTimeout(() => { Q.toast = null; paint(); }, 6000);
    hooks.changed?.();
  } else if (j.state === 'failed') {
    const f = j.found ?? {};
    const info = { text: j.text, error: j.error || 'Kunne ikke tolke teksten.', found: { title: f.title || f.tittel || '', date: f.date || f.dato || null, start: f.start || null, end: f.end || f.slutt || null, place: f.place || f.sted || '' } };
    // I Kalender åpnes skjemaet med en gang; ellers et banner med «Fyll ut ›».
    if (document.body.dataset.route === 'kalender' && hooks.fail) { Q.err = null; hooks.fail(info); }
    else { clearTimeout(toastT); Q.toast = null; Q.err = info; toastT = setTimeout(() => { Q.err = null; paint(); }, 10000); }
  }
  paint();
}

async function refreshJobs() {
  const r = await call('/kalender/quick/jobs').catch(() => null);
  if (!r?.ok) { if (r && (r.status === 404 || r.status === 405)) { for (const [id, j] of Q.mine) if (!id.startsWith('t') && !id.startsWith('l')) { Q.mine.delete(id); finish({ ...j, state: 'failed', error: 'Serveren mistet jobben.' }); } } return; }
  const list = Array.isArray(r.d) ? r.d : r.d?.jobs ?? [];
  for (const x of list) handleJob(x);
}
function handleJob(x) {
  const id = String(x?.id ?? ''), mine = Q.mine.get(id);
  if (!mine) return;
  if (mine.ai && (x.steps || x.fields || x.progress != null || x.model || x.input)) aiUpdate(mine.ai, { steps: x.steps, fields: x.fields, progress: x.progress, model: x.model, input: x.input, title: x.title });
  if (x.state === 'done' || x.state === 'failed' || x.state === 'cancelled') { Q.mine.delete(id); finish({ ...x, id, ai: mine.ai, text: x.text ?? mine.text }); }
  else if (x.state && x.state !== mine.state) { mine.state = x.state; paint(); }
}

function watch() {
  if (!Q.live) { Q.live = true; onLive('calendar-quick', (m) => { const x = m?.job ? { ...m, ...m.job } : (m?.jobId ? { ...m, id: m.jobId } : null); if (x?.id && x.state) handleJob(x); else refreshJobs(); }); }
  if (Q.poll) return;
  Q.poll = setInterval(() => {
    if (![...Q.mine.keys()].some((k) => !k.startsWith('t') && !k.startsWith('l'))) { clearInterval(Q.poll); Q.poll = 0; return; }
    refreshJobs();
  }, 2000);
}

async function undo() {
  const T = Q.toast;
  if (!T) return;
  Q.toast = null; paint();
  const r = T.local ? await call(`/kalender/events/${encodeURIComponent(T.eventId)}`, 'DELETE').catch(() => null)
    : await call(`/kalender/quick/${encodeURIComponent(T.id)}/undo`, 'POST').catch(() => null);
  if (!r?.ok && !T.local && T.eventId) await call(`/kalender/events/${encodeURIComponent(T.eventId)}`, 'DELETE').catch(() => null);
  hooks.changed?.();
}

/* ---------------- Laget: pille og banner ---------------- */

function layer() {
  let el = document.getElementById('kq-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kq-layer'; el.className = 'kal kq-layer';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kq]');
      if (!b) return;
      const a = b.dataset.kq;
      if (a === 'undo') undo();
      else if (a === 'show') { const k = Q.toast?.k; Q.toast = null; paint(); if (k) hooks.show?.(k); else location.hash = '#/kalender'; }
      else if (a === 'fill') { const info = Q.err; Q.err = null; paint(); if (info) hooks.fail?.(info); }
      else if (a === 'x') { Q.err = null; Q.toast = null; paint(); }
    });
  }
  return el;
}

export function paint() {
  const el = layer(), n = busyN();
  // Prompt 31: pillen «✦ Legger til …» er erstattet av Glimt-toasten (ai-jobs.js). Flere samtidige: teksten sier hvor mange.
  for (const j of Q.mine.values()) if (j.ai) aiUpdate(j.ai, { toast: n > 1 ? `Legger til ${n} timer …` : 'Legger til i kalenderen …' });
  const pill = '';
  const T = Q.toast, E = Q.err;
  const toast = T ? `<div class="kq-toast" role="status"><span class="kq-tx"><b><span>✓ </span><span data-no-i18n>${esc(T.t)}</span></b><span>${esc(T.l)}</span>${T.w ? `<span>${esc(T.w)}</span>` : ''}</span><button type="button" class="kq-b" data-kq="undo">Angre</button><button type="button" class="kq-b on" data-kq="show">Vis</button></div>`
    : E ? `<div class="kq-toast err" role="alert"><span class="kq-tx"><b>Fant ikke timen</b><span>${esc(E.error)}</span></span><button type="button" class="kq-b on" data-kq="fill">Fyll ut ›</button><button type="button" class="kq-b" data-kq="x" aria-label="Lukk">✕</button></div>` : '';
  el.innerHTML = pill + toast;
  el.hidden = !pill && !toast;
}
