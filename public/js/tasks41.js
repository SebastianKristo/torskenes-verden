// Prompt 41 (claude-code-huskeliste-glimt-ai-bakgrunn.md): Glimt deler opp lange beskjeder med AI i bakgrunnen.
// POST /api/tasks/glimt {q, list?, async:true, origin?} → {jobId, placeholder}. Jobben går i køen på serveren (LLM-kjeden),
// og punktene kommer via sanntid «todo:changed» + «glimt-job» {jobId, status:'done'|'failed', count, items?}.
// Punktene får origin:{text, at, engine} (+ srcId), som gir fanen «Laget med Glimt». Mangler serveren jobben (404),
// deles beskjeden opp lokalt på «før vi skal / hvor vi må / og så / siden».
import { api, esc } from './util.js';
import { onLive } from './realtime.js';
import { aiStart, aiUpdate, aiDone } from './ai-jobs.js';

/** Når skal AI dele opp? ≥ 12 ord med må/skal/huske, koblinger som «før vi skal», «hvor vi må», «og så», «siden/fordi», eller flere setninger. */
export function needsAi41(q) {
  const s = String(q ?? '').trim();
  if (!s || /\?\s*$/.test(s)) return false;
  const words = s.split(/\s+/).length;
  const verb = /\b(må|skal|huske|husk)\b/i.test(s);
  const link = /\b(før vi skal|før jeg skal|hvor vi må|hvor jeg må|og så|deretter|siden|fordi|etterpå)\b/i.test(s);
  const sentences = s.split(/[.!]\s+(?=[A-ZÆØÅa-zæøå])/).filter((x) => x.trim().length > 3).length;
  return (words >= 12 && (verb || link)) || (link && words >= 8) || sentences >= 2;
}

/** Lokal reserve: én handling per ledd, begrunnelser («siden», «fordi») blir note på punktet før. */
export function splitLocal41(q) {
  let s = ` ${String(q ?? '').trim().replace(/\s+/g, ' ')} `;
  s = s.replace(/^\s*(husk( å)?|påminn meg( om)?( å)?|legg til i huskeliste(n)?:?|ny oppgave:?)\s+/i, ' ');
  const parts = s.split(/\s*(?:[.;!]\s+|,?\s+før (?:vi|jeg) skal\s+|,?\s+hvor (?:vi|jeg) må\s+|,?\s+og så\s+|,?\s+deretter\s+|,?\s+etterpå\s+)/i).map((x) => x.trim()).filter((x) => x.length > 2);
  const out = [];
  for (let p of parts) {
    let note = '';
    const m = p.match(/\s*,?\s+(siden|fordi)\s+(.+)$/i);
    if (m) { note = m[2].trim(); p = p.slice(0, m.index).trim(); }
    p = p.replace(/^(vi|jeg) (skal|må) (huske å )?/i, '').replace(/^(til|på) /i, (w) => `Dra ${w}`).replace(/^huske å /i, '');
    const cap = (x) => x.replace(/(^|[^a-zæøå])(oslo|toten|strømstad|bergen|trondheim|hafjell|sverige)(?![a-zæøå])/gi, (_, a, w) => a + w[0].toUpperCase() + w.slice(1));
    p = cap(p); note = cap(note.replace(/^(vi|jeg) /i, '').replace(/[.,]$/, ''));
    if (!p) continue;
    out.push({ n: p[0].toUpperCase() + p.slice(1).replace(/[.,]$/, ''), note: note ? note[0].toUpperCase() + note.slice(1) : '' });
  }
  return out.length ? out : [{ n: String(q).trim(), note: '' }];
}

const J = { jobs: [], done: null, doneT: 0 };
let paintCb = () => {}, loadCb = () => {}, bound = false;

/** Følg en jobb serveren allerede har startet (f.eks. «✦ Del opp på nytt»). */
export function trackJob41(jobId, q, { paint, load } = {}) {
  paintCb = paint ?? paintCb; loadCb = load ?? loadCb; bind();
  const job = { id: String(jobId), q, at: Date.now() };
  J.jobs.unshift(job); paintCb(); watch(job);
}
/** Start bakgrunnsjobb. Returnerer true når serveren tok den (202), false ved 404 (lokal reserve). */
export async function startJob41(q, { list, origin = 'huskeliste', paint, load } = {}) {
  paintCb = paint ?? paintCb; loadCb = load ?? loadCb;
  bind();
  const tmp = { id: `tmp${Date.now()}`, q, at: Date.now() };
  J.jobs.unshift(tmp); paintCb();
  try {
    const r = await api('/tasks/glimt', { method: 'POST', json: { q, list, async: true, origin } });
    if (r?.jobId) { tmp.id = String(r.jobId); tmp.placeholder = r.placeholder ?? null; paintCb(); watch(tmp); return { ok: true, sync: null }; }
    // Serveren svarte med en gang (uten jobb): vanlig svar.
    J.jobs = J.jobs.filter((x) => x !== tmp); paintCb();
    return { ok: true, sync: r };
  } catch (e) {
    J.jobs = J.jobs.filter((x) => x !== tmp); paintCb();
    if ([404, 405, 501].includes(e.status)) return { ok: false };
    throw e;
  }
}
function finish(job, d) {
  J.jobs = J.jobs.filter((x) => x !== job);
  job.onDone?.(d);
  const n = d?.count ?? d?.items?.length ?? 0;
  J.done = d?.status === 'failed' || d?.error ? { text: `Glimt fikk ikke delt opp beskjeden: ${d.error ?? 'ukjent feil'}`, err: true } : { text: n ? `Glimt lagde ${n} ${n === 1 ? 'punkt' : 'punkter'} i riktig rekkefølge` : 'Glimt er ferdig', src: d?.srcId ?? null };
  try { navigator.vibrate?.(12); } catch { /* */ }
  clearTimeout(J.doneT); J.doneT = setTimeout(() => { J.done = null; paintCb(); }, 10_000);
  loadCb(); paintCb();
}
// Reserve hvis sanntid ikke kommer: spør etter jobben hvert 3. sekund i inntil 2 minutter.
function watch(job) {
  let n = 0;
  const tick = async () => {
    if (!J.jobs.includes(job) || n++ > 40) { if (J.jobs.includes(job)) { J.jobs = J.jobs.filter((x) => x !== job); paintCb(); loadCb(); } return; }
    try {
      const d = await api(`/tasks/glimt/jobs/${encodeURIComponent(job.id)}`);
      const st = d?.state ?? d?.status;
      if (st === 'done' || st === 'failed' || st === 'ok') { finish(job, { ...d, status: st === 'failed' ? 'failed' : 'done' }); return; }
    } catch (e) { if (e.status === 404) { setTimeout(tick, 6000); return; } }
    setTimeout(tick, 3000);
  };
  setTimeout(tick, 3000);
}
function bind() {
  if (bound) return;
  bound = true;
  onLive('glimt-job', (d) => {
    const job = J.jobs.find((x) => String(x.id) === String(d?.jobId ?? d?.id));
    if (!job) return;
    const st = d.state ?? d.status;
    if (st === 'done' || st === 'failed' || st === 'ok' || d.done) finish(job, { ...d, status: st === 'failed' ? 'failed' : 'done' });
    else { job.step = d.step ?? d.msg ?? job.step; paintCb(); }
  });
}
export function lastDoneSrc41() { return J.done?.src ?? null; }
export function clearDone41() { J.done = null; clearTimeout(J.doneT); }

/** Stiplede rader øverst: «Glimt deler opp beskjeden …» og ferdig-raden (10 s). */
export function jobsHtml41() {
  const rows = J.jobs.map((j) => `<div class="tk41-job" role="status"><span class="tk41-spk" aria-hidden="true">✦</span><span class="tk41-jt"><b>Glimt deler opp beskjeden …</b><span>«${esc(j.q.length > 140 ? `${j.q.slice(0, 140)} …` : j.q)}»${j.step ? ` · ${esc(j.step)}` : ''}</span></span></div>`).join('');
  const d = J.done ? `<div class="tk41-done${J.done.err ? ' err' : ''}" role="status"><span>${J.done.err ? '' : '✓ '}${esc(J.done.text)}</span>${J.done.err ? '' : '<button type="button" class="tk-gbtn" data-tk41="see">Se</button>'}<button type="button" class="tk-gbtn" data-tk41="x" aria-label="Lukk">✕</button></div>` : '';
  return rows + d;
}

/* ---------- «Laget med Glimt» ---------- */
const srcKey = (t) => { const o = t.origin; if (!o || !o.text) return null; return String(t.srcId ?? t.src_id ?? o.id ?? `${o.at ?? ''}|${o.text}`); };
export function glimtSources41(items) {
  const m = new Map();
  for (const t of items) {
    const k = srcKey(t);
    if (!k) continue;
    if (!m.has(k)) m.set(k, { key: k, text: t.origin.text, at: t.origin.at ?? t.createdAt ?? null, engine: t.origin.engine ?? '', by: t.origin.byName ?? t.byName ?? '', items: [] });
    m.get(k).items.push(t);
  }
  const L = [...m.values()].sort((a, b) => (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0));
  for (const s of L) s.items.sort((a, b) => (a.origin?.order ?? a.order ?? 0) - (b.origin?.order ?? b.order ?? 0));
  return L.slice(0, 60);
}
const when = (t) => { const d = new Date(t); return Number.isFinite(d.getTime()) ? `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : ''; };
const engName = (e) => (/ollama|llama|qwen|deepseek|gemma/i.test(e) ? 'Glimt lokalt' : /gemini/i.test(e) ? 'Glimt · Gemini' : /groq/i.test(e) ? 'Glimt · Groq' : /lokal|regex|local/i.test(e) ? 'Glimt uten AI' : 'Glimt AI');

/** Fanen: ett kort per beskjed med original tekst og punktene den lagde. */
export function madeWithHtml41(items, { listName, title }) {
  const S = glimtSources41(items);
  if (!S.length) return '<div class="tk-empty">Ingen beskjeder er delt opp av Glimt ennå.</div>';
  return `<div class="tk41-mw">${S.map((s) => `<section class="tk41-src"><div class="tk41-sh"><span class="tk41-lab">ORIGINAL BESKJED</span><span class="tk41-t">${esc(when(s.at))}</span></div>
    <p class="tk41-q">«${esc(s.text)}»</p>
    <span class="tk41-meta">${esc([`${s.items.length} ${s.items.length === 1 ? 'punkt' : 'punkter'} · ${engName(s.engine)}`, s.by ? `av ${s.by}` : ''].filter(Boolean).join(' · '))}</span>
    <ol class="tk41-items">${s.items.map((t) => `<li><button type="button" class="tk-chk" data-tk-tick="${esc(t.id)}" aria-pressed="${!!t.done}" aria-label="${t.done ? 'Marker som ikke gjort' : 'Fullfør'}">${t.done ? '✓' : ''}</button><button type="button" class="tk41-it" data-tk-ed="${esc(t.id)}"><b class="${t.done ? 'done' : ''}">${esc(title(t))}</b><span>${esc([listName(t), t.place, t.notes ?? t.note].filter(Boolean).join(' · '))}</span></button></li>`).join('')}</ol>
    <div class="tk-opts"><button type="button" class="tk-gbtn" data-tk41="redo" data-k="${esc(s.key)}">✦ Del opp på nytt</button><button type="button" class="tk-gbtn" data-tk41="forget" data-k="${esc(s.key)}">Glem beskjeden</button></div></section>`).join('')}</div>`;
}
/** Kortet i redigeringsarket for et punkt laget av Glimt. */
export function originCard41(t) {
  if (!t?.origin?.text) return '';
  return `<button type="button" class="tk41-oc" data-tk41="open"><span class="tk41-lab">LAGET MED GLIMT · ORIGINAL BESKJED</span><span class="tk41-q">«${esc(t.origin.text)}»</span></button>`;
}
export const srcItems41 = (items, key) => items.filter((t) => srcKey(t) === key);

/* ---------- Fra søkefeltet på Hjem ---------- */
/** Huskebeskjed i søket: starter med husk/påminn meg/legg til i huskeliste/ny oppgave, eller ≥ 6 ord med må/skal/huske og vi/jeg/meg/oss. */
export function isHuske41(q) {
  const s = String(q ?? '').trim();
  if (!s || /\?\s*$/.test(s) || /^(hva|hvem|hvor|når|hvorfor|hvordan|kan|er|blir)\b/i.test(s)) return false;
  if (/^(husk|påminn meg|legg til i huskeliste(n)?|ny oppgave)\b/i.test(s)) return true;
  return s.split(/\s+/).length >= 6 && /\b(må|skal|huske)\b/i.test(s) && /\b(vi|jeg|meg|oss)\b/i.test(s);
}
const STEPS41 = ['Leser beskjeden', 'Deler opp i punkter', 'Finner rekkefølge og steder', 'Lagrer i Huskeliste'];
/** Legg i Huskeliste med samme Glimt-animasjon som rask time. Bakgrunnsjobb på serveren (origin home_search). */
export async function addFromSearch41(q) {
  const id = aiStart({ title: 'Legger til i Huskeliste', toast: 'Glimt deler opp beskjeden …', model: 'Glimt', input: q, steps: STEPS41, fields: { Beskjed: q.length > 80 ? `${q.slice(0, 80)} …` : q, Liste: 'Huskeliste', Original: 'Lagres i «Laget med Glimt»' }, dur: 4200 });
  let shown = true;
  const slow = setTimeout(() => { if (shown) { shown = false; aiDone(id, { text: '✦ Glimt deler opp i bakgrunnen …' }); } }, 6000);
  const done = (text, ok = true) => {
    clearTimeout(slow);
    if (shown) { shown = false; aiDone(id, { text, ok }); return; }
    const id2 = aiStart({ title: 'Huskeliste', toast: text, input: q, dur: 300 }); aiDone(id2, { text, ok });
  };
  try {
    const r = await startJob41(q, { origin: 'home_search' });
    if (r.ok && !r.sync) {
      const job = J.jobs.find((x) => x.q === q);
      if (job) job.onDone = (d) => { const n = d?.count ?? d?.items?.length ?? 0; if (shown && d?.items?.length) aiUpdate(id, { fields: d.items.slice(0, 6).map((x, i) => [`${i + 1}.`, x.title ?? x.n ?? '']) }); done(d?.status === 'failed' ? 'Glimt fikk ikke delt opp beskjeden' : `✓ Glimt lagde ${n || 'nye'} ${n === 1 ? 'punkt' : 'punkter'} i Huskeliste`, d?.status !== 'failed'); };
      return;
    }
    if (r.ok && r.sync) { const n = r.sync.items?.length ?? 0; done(`✓ Glimt lagde ${n || 'nye'} ${n === 1 ? 'punkt' : 'punkter'} i Huskeliste`); return; }
    // Eldre server: del opp lokalt og legg inn med vanlig POST /api/tasks.
    const P = splitLocal41(q), at = new Date().toISOString();
    for (const p of P) await api('/tasks', { method: 'POST', json: { title: p.n, ...(p.note ? { notes: p.note } : {}), origin: { text: q, at, engine: 'lokal' } } });
    done(`✓ Glimt lagde ${P.length} ${P.length === 1 ? 'punkt' : 'punkter'} i Huskeliste`);
  } catch (e) { done(`Fikk ikke lagt i Huskeliste: ${e.message}`, false); }
}
