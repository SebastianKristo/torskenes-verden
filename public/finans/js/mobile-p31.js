// Prompt 31 (PWA): Glimt – AI-agenten i Nordlys OS. Merket med fire tilstander (Klar/Tenker/Svarer/Ferdig), AI-toast
// med glassboble for alle AI-jobber (rask time, assist, kvittering), svarboble under søkefeltet på Hjem via /api/assist,
// Chat-kort (vær, kalender, avganger, pakker, finans, huskeliste), System-siden «Nordlys OS» (egen side fra
// PROGRAMVARE og fra oppdateringsbanneret), gratis prøveperioder, Web Push når appen er i bakgrunnen og banneret
// «Glimt svarte mens du var borte». Fasit: Mobil Papir App.dc.html (aiSpark, aiToastEl, hsAsk, chToolRun, chCardVals,
// aiBgNotify, System-siden), Glimt AI.dc.html, Abonnement Legg til ark.dc.html (Gratis prøveperiode).
// API (SERVER31): POST /api/assist {q, source, chatId?} → 200 svar | 202 {jobId}; GET /api/assist/:id; realtime `assist`
// og `calendar-quick` {jobId, state, steps[], fields[], progress, title, model, input}; POST /api/kalender/quick/:id/cancel;
// GET/POST /finans/api/subscriptions/trials, PATCH …/:id; GET /api/push/vapid, POST/DELETE /api/push/subscribe,
// POST /api/push/presence {visible}; /api/system/update/settings {require_password}; /api/system/version {name, tagline, sizeBytes, notes}.
// Eldre server (404): søk og Chat faller tilbake til Chat/LLM, prøver lagres på enheten, push slås ikke på.
import { esc, hlApi, api } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { hsTimeout, NAV_T } from './mobile-p32.js'; // prompt 32: GLIMT I SØKEFELTET
import * as P34 from './mobile-p34.js';
import * as P35 from './mobile-p35.js';
import * as P36 from './mobile-p36.js';
import * as P37B from './mobile-p37b.js'; // prompt 37: «hvor er X» // prompt 36: spørsmål vs. handling, dagslys lokalt // prompt 35: været for et sted i AI-søket // prompt 34: tydelige AI-feil i boblen

const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const svg = (d, s = 16, w = 2, col = 'currentColor') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const CK = 'M5 12.5l4.5 4.5L19 7';
/** **fet** → <b>, resten escapes. */
export const bold = (t) => esc(String(t ?? '')).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const plain = (t) => String(t ?? '').replace(/\*\*/g, '').trim();

/* =====================================================================
   1. Glimt-merket (ring + stjerne + to glimt). st: ready | think | answer | done
   ===================================================================== */
let gid = 0;
const STAR = 'M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5h-0c-.6-4.9-4.6-8.9-9.5-9.5v-2C7.4 10.4 11.4 6.4 12 1.5z';
export function glimt(S = 22, st = 'think', cls = '') {
  const id = `g31g${++gid}`, done = st === 'done', bw = Math.max(2, Math.round(S * 0.06 * 10) / 10 + (S < 30 ? 0.5 : 0));
  return `<span class="g31 g31-${st}${cls ? ` ${cls}` : ''}" style="--s:${S}px;--bw:${bw}px" aria-hidden="true">${S > 60 ? '<i class="g31-gl"></i>' : ''}<i class="g31-r"></i>${done
    ? `<svg class="g31-ck" viewBox="0 0 24 24" fill="none" stroke="#3fbf9a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${CK}"/></svg>`
    : `<svg class="g31-st" viewBox="0 0 24 24"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb38a"/><stop offset="1" stop-color="#ff5a3c"/></linearGradient></defs><path d="${STAR}" fill="url(#${id})"/></svg><i class="g31-t1"></i><i class="g31-t2"></i>`}</span>`;
}
const dots = '<span class="g31-dots" aria-hidden="true"><i></i><i></i><i></i></span>';

/* =====================================================================
   2. Søkemotor-logoer (ekte Google-G og DuckDuckGo-and, inline SVG)
   ===================================================================== */
export const GLOGO = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true" class="p29-gl"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
// DuckDuckGo: oransje sirkel #DE5833 med hvit ring, hvit and (svart øye, gult nebb, grønn sløyfe).
export const DLOGO = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true" class="p31-ddg"><defs><clipPath id="p31dc${s}"><circle cx="24" cy="24" r="20.2"/></clipPath></defs><circle cx="24" cy="24" r="24" fill="#DE5833"/><circle cx="24" cy="24" r="21.2" fill="none" stroke="#fff" stroke-width="2"/><g clip-path="url(#p31dc${s})"><path fill="#fff" d="M18.6 12.4c3.8-2.3 9.6-1.6 12.2 2.4 1.8 2.8 1.6 6.1.9 9.4-.6 2.8-.4 5.6.8 8.2l3.6 16.2H17.4l-1.6-14.6c-.5-4.4-2.6-8.2-2.4-12.6.2-3.8 2-7.2 5.2-9z"/><path fill="#DE5833" d="M19.2 12.1c-1.4-.9-3.6-.7-4.8.6 1.5-.2 2.8.3 3.6 1.1z"/><circle cx="21.6" cy="19.6" r="2.3" fill="#2d4f8e"/><circle cx="22.4" cy="18.9" r=".8" fill="#fff"/><circle cx="28.6" cy="19.4" r="1.8" fill="#2d4f8e"/><circle cx="29.2" cy="18.8" r=".6" fill="#fff"/><path fill="#FDD20A" d="M18.5 26.4c2.6-1.2 7-1.6 10.6-.7 1.5.4 1.8 1.8.4 2.4-3.2 1.4-7.8 1.4-11 .4-1.2-.4-1.2-1.6 0-2.1z"/><path fill="#65BC46" d="M21.5 33.2l3.4 1.6 3.4-1.8-.3 4-3.1-1.4-3.2 1.6z"/></g></svg>`;

/* =====================================================================
   3. Felles tilstand
   ===================================================================== */
// G.jobs: AI-jobber som vises i toasten. {id, kind:'quick'|'assist'|'hint', title, model, input, steps[], fields[], progress, state, t0, dur}
export const G = { jobs: new Map(), order: [], open: false, done: null, ans: null, aid: 0, banner: null, away: [], pushOn: null, vapid: null, trials: null, trialsT: 0, tr: null };
const STEPS_Q = ['Leser teksten', 'Finner dato og klokkeslett', 'Sjekker kalenderen for kollisjoner', 'Lagrer avtalen'];
const STEPS_A = ['Leser spørsmålet', 'Velger verktøy', 'Henter data', 'Skriver svaret'];
/** Legger til eller oppdaterer en jobb (fra rask time, assist eller sanntid). */
export function jobPut(id, patch) {
  const k = String(id), cur = G.jobs.get(k) ?? { id: k, t0: Date.now(), dur: 2600, steps: [], fields: [], progress: null, state: 'running' };
  const n = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null)) };
  G.jobs.set(k, n); if (!G.order.includes(k)) G.order.push(k);
  return n;
}
export function jobDrop(id) { const k = String(id); G.jobs.delete(k); G.order = G.order.filter((x) => x !== k); if (!G.order.length) G.open = false; }
export function jobRename(from, to) { const j = G.jobs.get(String(from)); if (!j) return; jobDrop(from); jobPut(to, { ...j, id: String(to) }); }
const curJob = () => { for (let i = G.order.length - 1; i >= 0; i--) { const j = G.jobs.get(G.order[i]); if (j && j.state !== 'done' && j.state !== 'failed') return j; } return null; };
const normStep = (s) => (typeof s === 'string' ? { t: s } : { t: s?.title ?? s?.label ?? s?.t ?? '', st: s?.state ?? s?.status ?? s?.st });
const normField = (f) => (Array.isArray(f) ? f : [f?.label ?? f?.k ?? f?.name ?? '', f?.value ?? f?.v ?? '']);
function jobPct(j) {
  if (Number.isFinite(+j.progress) && j.progress != null) { const p = +j.progress; return Math.max(0, Math.min(100, Math.round(p <= 1 ? p * 100 : p))); }
  return Math.min(92, Math.round(((Date.now() - j.t0) / (j.dur || 2600)) * 100));
}
function stepRows(j) {
  const L = (j.steps?.length ? j.steps : j.kind === 'quick' ? STEPS_Q : STEPS_A).map(normStep), pct = jobPct(j);
  const hasSt = L.some((s) => s.st);
  const cur = hasSt ? Math.max(0, L.findIndex((s) => !/done|ok|ferdig/.test(s.st ?? ''))) : Math.min(L.length - 1, Math.floor((pct / 100) * L.length));
  return L.map((s, i) => {
    const done = hasSt ? /done|ok|ferdig/.test(s.st ?? '') : i < cur, act = !done && i === cur;
    return `<div class="p31-step${done ? ' done' : act ? ' act' : ''}"><span class="p31-sd">${done ? svg(CK, 10, 3.6, '#fff') : ''}</span>${esc(s.t)}${act ? ' …' : ''}</div>`;
  }).join('');
}

/* =====================================================================
   4. AI-toast øverst + glassboble (alle AI-jobber)
   ===================================================================== */
let tick = null;
function ensureTick() {
  if (tick) return;
  tick = setInterval(() => {
    if (!curJob()) { clearInterval(tick); tick = null; return; }
    // Bare fremdriften og stegene oppdateres mellom tegningene, så tastatur og rulling står i ro.
    const b = document.querySelector('.p31-bub'); const j = curJob();
    if (b && j) { const p = b.querySelector('.p31-pct'); if (p) p.textContent = `${jobPct(j)} %`; const s = b.querySelector('.p31-steps'); if (s) s.innerHTML = stepRows(j); }
  }, 300);
}
/** Lag over alle sider: toast (lukket), glassboble (åpen) eller ferdig-pille. */
export function aiLayer() {
  const j = curJob();
  if (j) {
    ensureTick();
    if (G.open) {
      return `<div class="p31-bub" role="dialog" aria-label="${esc(j.title)}" data-p31="aitog">
        <div class="p31-bh">${glimt(28, 'think')}<span class="m-grow"><b>${esc(j.title)}</b><span>${esc(j.model || 'Glimt · lokal')}</span></span><span class="p31-pct">${jobPct(j)} %</span></div>
        ${j.input ? `<div class="p31-in">«${esc(j.input)}»</div>` : ''}
        <div class="p31-steps">${stepRows(j)}</div>
        ${j.fields?.length ? `<div class="p31-fl">${j.fields.map(normField).map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>` : ''}
        <div class="p31-bb"><button type="button" data-p31="aicancel">Avbryt</button><button type="button" class="ink" data-p31="aitog">Skjul</button></div></div>`;
    }
    const n = G.order.filter((k) => { const x = G.jobs.get(k); return x && x.state !== 'done' && x.state !== 'failed'; }).length;
    const txt = n > 1 && j.kind === 'quick' ? `Legger til ${n} timer` : j.title;
    return `<button type="button" class="p31-toast" data-p31="aitog" aria-expanded="false" aria-label="${esc(txt)} – trykk for å se hva Glimt gjør">${glimt(24, 'think')}<span class="p31-tt">${esc(txt)}</span>${dots}${svg('M6 9l6 6 6-6', 12, 2.6)}</button>`;
  }
  if (G.done) {
    const D = G.done;
    return `<div class="p31-toast done" role="status">${glimt(24, 'done')}<span class="p31-tt">${esc(D.t)}</span>${D.undo ? `<button type="button" class="p31-tb" data-p31="aiundo">Angre</button>` : ''}${D.show ? `<button type="button" class="p31-tb pri" data-p31="aishow">Vis</button>` : ''}</div>`;
  }
  return '';
}
let doneT = null;
/** Ferdig: haken spretter inn, toasten fader etter 3 s. */
export function aiDone(t, o = {}) {
  G.done = { t, ...o }; G.open = false; haptic('ok');
  clearTimeout(doneT); doneT = setTimeout(() => { G.done = null; draw(); }, o.ms ?? 3200);
  draw();
}
/** Flash-tekster som begynner med «✦ » og slutter med «…» vises som Glimt-toast (fasit: hint → aiToastEl). */
export function hintToast(t) {
  const s = String(t ?? '');
  if (!s.startsWith('✦ ') || curJob()) return null;
  const busy = /…\s*$/.test(s);
  return `<div class="p31-toast${busy ? '' : ' done'}" role="status">${glimt(24, busy ? 'think' : 'done')}<span class="p31-tt">${esc(s.slice(2).replace(/\s*…\s*$/, ''))}</span>${busy ? dots : ''}</div>`;
}

/* =====================================================================
   5. Svarboble under søkefeltet på Hjem (POST /api/assist, source:'search')
   ===================================================================== */
export function ansBubble() {
  const A = G.ans; if (!A) return '';
  if (A.busy) return `<div class="p31-ans" data-p31="ansx" role="status">${glimt(22, 'think')}<span class="p31-at busy">Tenker på «${esc(A.q)}» …</span></div>`;
  // Prompt 38: trykk i boblen lukker den ikke lenger (tekst kan markeres). ✕, sveip opp og trykk utenfor lukker (mobile-p38.js).
  return `<div class="p31-ans ready p38-ans" role="status" aria-live="polite"><button type="button" class="p38-ax" data-p31="ansx" aria-label="Lukk svar">${svg('M6 6l12 12M18 6L6 18', 12, 2.8)}</button><span class="p31-at">${bold(A.text)}</span>${A.card ? cardHtml(A.card, true) : ''}
    ${A.err ? P34.errButtons(A.q) : ''}${A.open ? (A.open.route === 'familie' ? P37B.famOpenBtn(A.open) : P35.wxOpenBtn(A.open)) : ''}<div class="p31-af"><span class="m-ell">✦ ${esc(A.src || 'Glimt')}</span>${A.apply?.count && !A.applied ? `<button type="button" data-p31="ansapply">Endre ${A.apply.count} ${A.apply.count === 1 ? 'avtale' : 'avtaler'} ›</button>` : ''}${A.src === 'Snarvei' ? '' : '<button type="button" data-p31="anschat">Fortsett i Chat ›</button>'}</div><span class="p38-ah" aria-hidden="true"></span></div>`;
}
const ASSIST_MISSING = { v: false };
async function assistCall(q, source, extra = {}) {
  if (ASSIST_MISSING.v) throw Object.assign(new Error('mangler'), { status: 404 });
  try { return await hlApi('/assist', { method: 'POST', json: { q, source, ...extra } }); }
  catch (e) { if (e.status === 404 || e.status === 405) ASSIST_MISSING.v = true; throw e; }
}
/** Venter på en serverjobb: sanntid (assist) eller polling hvert 1,2 s. Jobben fortsetter på serveren uansett. */
const waiters = new Map();
function waitJob(jobId, meta) {
  return new Promise((ok, no) => {
    const k = String(jobId), w = { ok, no, t: null, n: 0 };
    waiters.set(k, w);
    // Prompt 36: et spørsmål vises bare i kortet under søket (surface:'inline'), aldri også i pillen.
    if (!meta.inline) { jobPut(k, { kind: 'assist', title: meta.title ?? 'Glimt tenker', model: meta.model ?? 'Glimt · lokal', input: meta.q, dur: 6000 }); ensureTick(); draw(); }
    const poll = async () => {
      if (!waiters.has(k)) return;
      try {
        const r = await hlApi(`/assist/${encodeURIComponent(k)}`);
        const st = r?.state ?? r?.status;
        if (st === 'done' || (st == null && r?.text != null)) { finishJob(k, r?.answer ?? r?.result ?? r); return; }
        if (st === 'failed' || st === 'error' || st === 'cancelled') { failJob(k, r?.error ?? 'Glimt fikk ikke svar'); return; }
        if (r && !meta.inline) jobPut(k, { steps: r.steps, fields: r.fields, progress: r.progress, title: r.title, model: r.model });
      } catch (e) { if (++w.n > 4) { failJob(k, e.message); return; } }
      w.t = setTimeout(poll, 1200);
    };
    w.t = setTimeout(poll, 900);
  });
}
function finishJob(k, r) { const w = waiters.get(k); if (!w) return; clearTimeout(w.t); waiters.delete(k); jobDrop(k); w.ok(r ?? {}); }
function failJob(k, err) { const w = waiters.get(k); if (!w) return; clearTimeout(w.t); waiters.delete(k); jobDrop(k); w.no(Object.assign(new Error(err || 'Feil'), { soft: true })); }
/** Sanntid fra /api/ws: {type:'assist', jobId, state, steps, fields, progress, title, model, input, result?} */
export function onAssistRealtime(d) {
  const k = String(d.jobId ?? d.id ?? ''); if (!k) return;
  if (d.state === 'done' && waiters.has(k)) { if (d.answer || d.text) finishJob(k, d.answer ?? d); else hlApi(`/assist/${encodeURIComponent(k)}`).then((r) => finishJob(k, r?.answer ?? r)).catch(() => {}); return; }
  if ((d.state === 'failed' || d.state === 'error') && waiters.has(k)) { failJob(k, d.error); return; }
  if (G.jobs.has(k)) { jobPut(k, { steps: d.steps, fields: d.fields, progress: d.progress, title: d.title, model: d.model, input: d.input }); if (G.open) draw(); }
}
/** Rask time over sanntid (calendar-quick med steps/fields/progress/model/input). */
export function onQuickRealtime31(d) {
  const k = String(d.jobId ?? d.id ?? ''); if (!k || !G.jobs.has(k)) return;
  jobPut(k, { steps: d.steps, fields: d.fields, progress: d.progress, title: d.title, model: d.model, input: d.input, state: d.state === 'done' || d.state === 'failed' ? d.state : null });
  if (G.open) draw();
}
const normAns = (r) => ({ text: r?.text ?? r?.answer ?? (r?.bold ? `**${r.bold}**` : ''), src: r?.source ?? 'Glimt', card: r?.card ?? null, intent: r?.intent ?? '', tool: r?.tool ?? null, chatContext: r?.chatContext ?? null, chatId: r?.chatId ?? null, memory: r?.memory ?? null, apply: r?.apply ?? null, open: r?.open ?? (() => { const P = r?.place ?? r?.card?.place; return r?.intent === 'weather' && P?.lat != null ? { route: 'vaer', name: P.name, lat: P.lat, lon: P.lon, label: P.label } : null; })() });
/** Prompt 36: handling/beskjed – bare Glimt-pillen øverst («Glimt jobber …» → «✓ …» med Angre). Ingen kort under søket. */
async function askPill(q, jobId0 = null, r0 = null) {
  const tmp = jobId0 ? String(jobId0) : `p36a${Date.now()}`;
  jobPut(tmp, { kind: 'assist', title: r0?.title ?? 'Glimt jobber', model: r0?.model ?? 'Glimt · lokal', input: q, dur: 5000 }); ensureTick(); draw();
  let r = r0;
  try {
    if (!jobId0) { r = await assistCall(q, 'search', { kind: 'action' }); if (r?.jobId && r.text == null) { jobDrop(tmp); r = await waitJob(r.jobId, { q, title: r.title ?? 'Glimt jobber' }); } else jobDrop(tmp); }
    else { jobDrop(tmp); r = await waitJob(jobId0, { q, title: r0?.title ?? 'Glimt jobber' }); }
  } catch (e) {
    jobDrop(tmp);
    if (e.status === 404 || e.status === 405) { aiDone('Glimt fikk ikke gjort dette her. Prøv i Chat.', { ms: 4000 }); return; }
    haptic('err'); aiDone(`Fikk ikke til: ${String(e.message ?? '').slice(0, 60)}`, { ms: 4500 }); return;
  }
  const A = normAns(r);
  aiDone(String(A.text || 'Ferdig').replace(/\*\*/g, '').slice(0, 90), { undo: r?.undo ? async () => { try { await hlApi(r.undo.url ?? r.undo, { method: r.undo.method ?? 'POST', json: {} }); } catch {} } : null, ms: 4000 });
}
export async function ask(q, o = {}) {
  if (o.surface === 'pill') { G.ans = null; return askPill(q); }
  const id = ++G.aid; G.ans = { q, busy: true }; draw();
  // Prompt 36: dagslys, soloppgang og solnedgang for en dato regnes ut lokalt (suncalc), med «Åpne Vær ›».
  // Prompt 37: «hvor er Ingrid?» → posisjonen fra Familie (serverens family.where eller lokalt), med «Vis på kart ›».
  if (P37B.isWhereQ(q)) { const W0 = await P37B.whereAnswer(q).catch(() => null); if (W0 && G.aid === id) { G.ans = { q, busy: false, ...W0 }; haptic('ok'); draw(); bgNotify(q, W0.text, '#/fam'); return; } }
  if (P36.isSunQ(q)) { const S0 = await P36.sunAnswer(q).catch(() => null); if (S0 && G.aid === id) { G.ans = { q, busy: false, ...S0 }; haptic('ok'); draw(); return; } }
  const set = (o) => { if (G.aid !== id) return; G.ans = { q, busy: false, ...o }; haptic('ok'); draw(); bgNotify(q, o.text, '#/hl'); };
  // Prompt 32 (claude-code-sok-fullfor-forst.md): svaret skal komme i boblen. Tar det lengre enn grensen (hs_timeout_s,
  // standard 8 s), flyttes jobben til en Chat-tråd (POST /api/assist/:id/handoff → {chatId}) og Chat åpnes.
  let jobId = null, moved = false;
  const timer = setTimeout(() => { if (G.aid === id) { moved = true; handoff(q, id, () => jobId, 'Dette tar litt tid.'); } }, hsTimeout() * 1000);
  let r;
  try {
    r = await assistCall(q, 'search', P36.isQ(q) ? { kind: 'question' } : {});
    // Serveren klassifiserte innsendingen som handling: kortet under søket forsvinner, og jobben flyttes til pillen.
    if (r?.kind === 'action' && G.aid === id) { clearTimeout(timer); G.ans = null; draw(); if (r.jobId && r.text == null) { askPill(q, r.jobId, r); return; } aiDone(String(normAns(r).text || 'Ferdig').replace(/\*\*/g, '').slice(0, 90), { ms: 4000 }); return; }
    if (r?.jobId && r.text == null) { jobId = r.jobId; r = await waitJob(r.jobId, { q, title: 'Glimt tenker', inline: true }); }
  } catch (e) {
    clearTimeout(timer); if (moved) return;
    if (e.status === 404 || e.status === 405) {
      // Prompt 35: eldre server uten /api/assist – været for et sted tolkes her (claude-code-ai-sok-vaer-sted.md).
      if (P35.isWxQuery(q)) { const W = await P35.wxAnswer(q).catch(() => null); if (W) { set(W); return; } }
      if (/pr(ø|o)ve|gratis|trial|avslutt|si opp|oppsig/i.test(q)) { const T = await trialQuick(q).catch(() => null); if (T) { set(T); return; } }
      set({ text: 'Jeg svarer best på dette i Chat. **Trykk «Fortsett i Chat».**', src: 'Glimt' }); return;
    }
    // Prompt 34: en ekte feil fra modellen/serveren vises i boblen med Prøv igjen og Åpne AI-kontroll (ikke evig «tenker»).
    if (e.soft || (e.status >= 400 && e.status !== 408 && e.status !== 504)) { haptic('err'); if (G.aid === id) { G.ans = { q, busy: false, text: P34.aiErrText(e, e.model), src: 'Glimt', err: true }; draw(); } return; }
    handoff(q, id, () => jobId, 'Fikk ikke svar her.'); return;
  }
  clearTimeout(timer); if (moved) return;
  const A = normAns(r);
  if (!A.text && (r?.error || r?.ok === false)) { haptic('err'); if (G.aid === id) { G.ans = { q, busy: false, text: P34.aiErrText(r.error ?? 'tomt svar', r.model), src: 'Glimt', err: true }; draw(); } return; } // prompt 34
  if (/trial/.test(A.intent)) { G.trials = null; }
  // Serverens snarvei: {intent:'nav', target, text}.
  if (A.intent === 'nav' && (r?.target || r?.href)) { const href = r.href ?? NAV_T[r.target] ?? `#/${r.target}`; navAns(q, href, null, A.src || 'Snarvei', A.text, id); return; }
  set(A);
}
/** Boblen «Åpner **side**.» og siden åpnes etter 0,45 s. */
export function navAns(q, href, label, src = 'Snarvei', text = null, aid = null) {
  const id = aid ?? ++G.aid;
  G.ans = { q, busy: false, text: text || `Åpner **${label}**.`, src }; haptic('ok'); draw();
  setTimeout(() => { if (G.aid !== id) return; G.ans = null; if (location.hash !== href) location.hash = href; else draw(); }, 450);
}
async function handoff(q, id, jobOf, why) {
  if (G.aid !== id) return;
  G.aid = id + 0.5; // et sent svar skal ikke overskrive boblen
  G.ans = { q, busy: false, text: `${why} **Fortsetter i Chat** …`, src: 'Glimt' }; draw();
  let chatId = null;
  const jid = jobOf();
  if (jid) { try { chatId = (await hlApi(`/assist/${encodeURIComponent(jid)}/handoff`, { method: 'POST', json: {} }))?.chatId ?? null; } catch {} }
  if (jid && waiters.has(String(jid))) { const w = waiters.get(String(jid)); clearTimeout(w.t); waiters.delete(String(jid)); jobDrop(jid); }
  setTimeout(async () => {
    G.ans = null; draw();
    const CHAT = await import('./mobile-chat.js');
    if (chatId && CHAT.openChatId) CHAT.openChatId(chatId); else CHAT.openChat(q);
  }, 700);
}

/* =====================================================================
   6. Chat-kort (vær, kalender, avganger, pakker, finans, huskeliste)
   ===================================================================== */
const WX_IC = { clear: '☀️', night: '🌙', partly: '⛅', cloudy: '☁️', rain: '🌧️', snow: '🌨️', fog: '🌫️', thunder: '⛈️' };
function wxKind(c) {
  if (c == null) return 'cloudy';
  if (/^[☀-⟿\u{1F300}-\u{1FAFF}]/u.test(String(c))) return null;
  const s = String(c).toLowerCase();
  if (/^\d+$/.test(s)) { const n = +s; return n <= 1 ? 'clear' : n === 2 ? 'partly' : n === 3 ? 'cloudy' : n <= 48 ? 'fog' : n >= 95 ? 'thunder' : (n >= 71 && n <= 77) || n === 85 || n === 86 ? 'snow' : 'rain'; }
  return /snow|snø|sleet|sludd/.test(s) ? 'snow' : /thunder|torden/.test(s) ? 'thunder' : /rain|regn|shower|byge|yr\b/.test(s) ? 'rain' : /fog|tåke/.test(s) ? 'fog' : /night|natt/.test(s) ? 'night' : /clear|klar|fair|sol/.test(s) ? 'clear' : /partly|lett|delvis/.test(s) ? 'partly' : 'cloudy';
}
const wxIcon = (c) => { const k = wxKind(c); return k ? WX_IC[k] : String(c); };
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : Math.round(+v));
const deg = (v) => (num(v) == null ? '–' : `${num(v)}°`);
const WDS = ['SØN', 'MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR'], MNL = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const col = (c, d) => (!c ? d : /^[0-9a-f]{3,8}$/i.test(c) ? `#${c}` : c);
const go = (href) => `data-p31="go" data-href="${esc(href)}"`;
/** k: weather|wx, calendar|cal, departures, packages, finance, tasks. inBubble = mørk glassboble på Hjem (mindre kort). */
export function cardHtml(cd, inBubble = false) {
  if (!cd || typeof cd !== 'object') return '';
  const k = cd.k ?? cd.kind ?? cd.type;
  try {
    if (k === 'weather' || k === 'wx') return wxCard(cd);
    if (k === 'calendar' || k === 'cal') return calCard(cd);
    if (k === 'departures') return depCard(cd);
    if (k === 'packages') return pkgCard(cd);
    if (k === 'finance') return finCard(cd);
    if (k === 'tasks') return taskCard(cd);
  } catch (e) { console.warn('Glimt-kort', e); }
  return inBubble ? '' : '';
}
function wxCard(cd) {
  const desc = cd.d ?? cd.desc ?? cd.text ?? cd.description ?? '', code = cd.ic ?? cd.icon ?? cd.symbol ?? cd.code ?? desc;
  const night = cd.night ?? (wxKind(code) === 'night');
  // Mørkere nederst for kontrast: klart = blå, grått/regn = grå, natt = mørk blå (claude-code-ai-chat-vaerkort-fiks.md).
  const grey = /^(rain|drizzle|sleet|snow|cloudy|fog|thunder)$/.test(cd.icon ?? cd.kind ?? '') || (!cd.icon && /regn|byger|overskyet|tåke|sludd|snø/.test(String(desc).toLowerCase()));
  const bg = night ? 'linear-gradient(180deg,#0e1a33,#2b3a5c)' : grey ? 'linear-gradient(180deg,#46525f,#6f7b8a)' : 'linear-gradient(180deg,#134a86,#3f74ab 70%,#5f8fc0)';
  const H = (cd.h ?? cd.hours ?? []).slice(0, 6).map((h) => ({ h: h.l ?? h.h ?? h.label ?? '', ic: wxIcon(h.ic ?? h.icon ?? h.symbol ?? h.code), t: deg(h.t ?? h.temp) }));
  const city = cd.city ?? cd.place ?? cd.name ?? '';
  const href = `#/vaer`;
  return `<button type="button" class="p31-wx" style="background:${bg}" ${go(href)} aria-label="Åpne Vær${city ? ` for ${esc(city)}` : ''}">
    <span class="p31-wxt"><span class="p31-wxl"><b>${esc(city)}<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M21 3L3 10.5l7.5 2.5L13 21z"/></svg></b><span class="p31-wxdeg">${deg(cd.t ?? cd.temp)}</span></span>
    <span class="p31-wxr"><span class="p31-wxi">${wxIcon(code)}</span><span>${esc(desc)}</span><span>H:${deg(cd.hi ?? cd.max)} L:${deg(cd.lo ?? cd.min)}</span></span></span>
    ${H.length ? `<span class="p31-wxh">${H.map((x) => `<span><span>${esc(x.h)}</span><span class="p31-wxhi">${x.ic}</span><b>${esc(x.t)}</b></span>`).join('')}</span>` : ''}</button>`;
}
function calCard(cd) {
  const d = cd.date ? new Date(`${String(cd.date).slice(0, 10)}T12:00`) : new Date();
  const wd = cd.wd ?? WDS[d.getDay()], n = cd.n ?? cd.day ?? d.getDate();
  const items = (cd.items ?? cd.events ?? []).slice(0, 8);
  const title = cd.t ?? cd.title ?? cd.label ?? 'I dag';
  const sub = cd.sub ?? `${d.getDate()}. ${MNL[d.getMonth()]} · ${items.length ? `${items.length} hendelse${items.length > 1 ? 'r' : ''}` : 'tom'}`;
  const href = cd.date ? `#/kal?d=${String(cd.date).slice(0, 10)}` : '#/kal';
  return `<div class="p31-cal"><button type="button" class="p31-calh" ${go(href)} data-date="${esc(cd.date ?? '')}"><span class="p31-cali"><span>${esc(wd)}</span><b>${esc(n)}</b></span><span class="m-grow"><b>${esc(title)}</b><span>${esc(sub)}</span></span><span aria-hidden="true">›</span></button>
    ${items.map((x) => `<div class="p31-calr"><span class="p31-calb" style="background:${esc(col(x.c ?? x.color, '#b23a2a'))}"></span><span class="p31-calt">${esc(x.tm ?? x.time ?? (x.allDay ? 'Hele' : x.start ?? x.s ?? 'Hele'))}</span><span class="m-ell">${esc(x.t ?? x.title ?? '')}</span></div>`).join('')}
    ${items.length ? '' : '<span class="p31-none">Ingenting i kalenderen.</span>'}</div>`;
}
function depCard(cd) {
  const L = (cd.items ?? cd.departures ?? []).slice(0, 6);
  return `<div class="p31-gc"><button type="button" class="p31-gch" ${go('#/avg')}><b>${esc(cd.stop ?? cd.title ?? 'Avganger')}</b><span aria-hidden="true">›</span></button>
    ${L.map((x) => `<div class="p31-gcr"><span class="p31-line" style="background:${esc(col(x.color ?? x.c, '#2b5d8a'))};color:${esc(col(x.textColor, '#fff'))}">${esc(x.line ?? x.l ?? '')}</span><span class="m-ell m-grow">${esc(x.dest ?? x.to ?? x.destination ?? '')}</span><b class="p31-mono">${esc(x.min != null || x.minutes != null ? (+(x.min ?? x.minutes) <= 0 ? 'nå' : `${x.min ?? x.minutes} min`) : x.clock ?? x.time ?? '')}</b></div>`).join('') || '<span class="p31-none">Ingen avganger nå.</span>'}</div>`;
}
function pkgCard(cd) {
  const L = (cd.items ?? cd.packages ?? []).slice(0, 5);
  return `<div class="p31-gc"><button type="button" class="p31-gch" ${go('#/spor')}><b>${esc(cd.title ?? 'Pakker')}</b><span aria-hidden="true">›</span></button>
    ${L.map((x) => { const raw = x.progress ?? x.p ?? (x.steps ? (x.step ?? 0) / x.steps : 0), p = Math.max(0, Math.min(100, Math.round(raw <= 1 ? raw * 100 : raw))); return `<div class="p31-gcr col"><span class="p31-gcrt"><b class="m-ell m-grow">${esc(x.name ?? x.title ?? x.t ?? 'Pakke')}</b><span class="p31-mut">${esc(x.statusText ?? x.status ?? x.st ?? '')}</span></span><span class="p31-prog"><i style="width:${p}%"></i></span></div>`; }).join('') || '<span class="p31-none">Ingen pakker på vei.</span>'}</div>`;
}
function finCard(cd) {
  const L = (cd.items ?? cd.top ?? []).slice(0, 3);
  const kr = (v) => (v == null ? '' : `${Math.round(Math.abs(+v)).toLocaleString('nb-NO').replace(/\s/g, ' ')} kr`);
  return `<div class="p31-gc"><button type="button" class="p31-gch" ${go('#/hjem')}><span class="m-grow"><span class="p31-mut">${esc(cd.label ?? cd.title ?? `Brukt${cd.category ? ` på ${cd.category}` : ''}${cd.period?.label ? ` · ${cd.period.label}` : ''}`)}</span><b class="p31-big">${kr(cd.total ?? cd.sum ?? cd.amount)}</b></span><span aria-hidden="true">›</span></button>
    ${L.map((x) => `<div class="p31-gcr"><span class="m-ell m-grow">${esc(x.name ?? x.merchant ?? x.description ?? x.t ?? '')}</span><b class="p31-mono">${kr(x.amount ?? x.v)}</b></div>`).join('')}</div>`;
}
function taskCard(cd) {
  const L = (cd.items ?? cd.tasks ?? []).slice(0, 8);
  return `<div class="p31-gc"><button type="button" class="p31-gch" ${go('#/huske')}><b>${esc(cd.title ?? cd.list ?? 'Huskeliste')}</b><span aria-hidden="true">›</span></button>
    ${L.map((x) => `<button type="button" class="p31-gcr p31-task" data-p31="task" data-id="${esc(x.id ?? '')}" role="checkbox" aria-checked="${!!x.done}"><span class="p31-cb${x.done ? ' on' : ''}">${x.done ? svg(CK, 11, 3.4, '#fff') : ''}</span><span class="m-ell m-grow${x.done ? ' p31-strike' : ''}">${esc(x.title ?? x.t ?? x.text ?? '')}</span></button>`).join('') || '<span class="p31-none">Alt er gjort ✓</span>'}</div>`;
}

/* ---------- Chat: verktøy før LLM (fasit chToolRun) ---------- */
// Bare spørsmål som ser ut som et verktøy går til /api/assist; resten strømmer som før via /api/chat/send.
const TOOL_RE = [
  ['Vær', /v(æ|ae)r(et)?\b|regn|paraply|grader|temperatur|snø|vind|kaldt|varmt|weather|yr\b/],
  ['Abonnementer', /pr(ø|o)ve(periode)?|gratis i|avslutt|si opp|oppsig|trial/],
  ['Kalender', /kalender|avtale|timeplan|hva skjer|hva har jeg|planer|møte|time hos|neste .*time|når (er|skal|har) .*(time|frisør|lege|tannlege|møte|trening)|i morgen\b|i dag\b/],
  ['Avganger', /avgang|når går|buss|trikk|t-bane|tog\b|ruter/],
  ['Pakker', /pakke|sending|posten|bring|postnord|helthjem/],
  ['Finans', /brukt på|hva har jeg brukt|forbruk|budsjett/],
  ['Gjøremål', /huskeliste|oppgaver|gjøremål|handleliste|to-?do/],
  // Prompt 33: «husk at Påhåret er frisøren min», «det var frisør»
  ['Glimt husker', /^(husk at\s+)?.{0,60}\b(er|var|gjelder)\s+(for\s+|hos\s+)?(min\s+|en\s+)?(frisør|frisøren|lege|legen|fastlegen|tannlege|tannlegen|fysio|fysioterapeut(en)?|optiker(en)?|psykolog(en)?)(\s+min)?[.!]?$/],
];
export function toolGuess(q) { const n = String(q ?? '').toLowerCase(); return TOOL_RE.find(([, re]) => re.test(n))?.[0] ?? null; }
/**
 * Prøver Glimt-ruteren for en Chat-melding. cb: { busy(tool), put(msg), done() }.
 * Returnerer true når svaret kom fra et verktøy (meldingen er lagt til), false → vanlig LLM.
 */
export async function chatTool(q, chatId, cb) {
  const guess = toolGuess(q); if (!guess || ASSIST_MISSING.v) return false;
  const t0 = performance.now();
  cb.busy([guess]);
  let r;
  try {
    r = await assistCall(q, 'chat', chatId ? { chatId } : {});
    if (r?.jobId && r.text == null) r = await waitJob(r.jobId, { q, title: `Glimt bruker ${guess}` });
  } catch { cb.done(); return false; }
  const A = normAns(r);
  // Fritekst (intent llm) som serveren ikke lagret i samtalen: la den valgte modellen svare som før.
  if (!A.text || r?.followUp === 'chat' || (/^(llm|chat)$/i.test(A.intent) && !A.chatId) || (!A.card && !A.tool && !A.intent)) { cb.done(); return false; }
  const sec = (performance.now() - t0) / 1000;
  const tool = A.tool ? [].concat(A.tool) : [guess];
  cb.put({ r: 'a', t: A.text, m: 'glimt', tool, card: A.card, st: `Verktøy · ${sec.toFixed(1).replace('.', ',')} s`, chatId: A.chatId });
  bgNotify(q, A.text, '#/chat');
  return true;
}

/* =====================================================================
   7. Varsel når appen er i bakgrunnen + «Glimt svarte mens du var borte»
   ===================================================================== */
export const aiBgOn = () => { const NT = m.nt31; if (NT && NT.on === false) return false; return (m.nt31?.ai_bg_notify ?? lsGet('p31_aibg', true)) !== false; };
let awayAt = 0;
function bgNotify(q, txt, url) {
  const body = plain(txt);
  if (!body) return;
  if (!(document.hidden || (awayAt && Date.now() - awayAt < 2000))) return;
  if (!aiBgOn()) return;
  G.away.push({ q, body, url });
  // Med Web Push sender serveren varselet (den vet at klienten ikke er synlig). Ellers: lokalt varsel fra appen.
  if (G.pushOn) return;
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      // Prompt 39: tittel «Glimt» og Glimt-logoen som ikon (badge: hvit silhuett på Android).
      const opts = { body: body.length > 160 ? `${body.slice(0, 157)}…` : body, tag: `glimt-${Date.now()}`, icon: '/assets/glimt-varsel.png', badge: '/assets/glimt-badge.png', data: { url: `/finans/${url}` } };
      navigator.serviceWorker?.getRegistration?.('/finans/').then((r) => (r ? r.showNotification('Glimt', opts) : new Notification('Glimt', opts))).catch(() => { try { new Notification('Glimt', opts); } catch {} });
    }
  } catch {}
}
let banT = null;
function showAway() {
  const p = G.away.pop(); G.away = [];
  if (!p || !aiInOn()) return; // prompt 39: «Vis svaret i appen også» av → ingen banner
  G.banner = { t: 'Glimt svarte mens du var borte', b: p.body, url: p.url };
  clearTimeout(banT); banT = setTimeout(() => { G.banner = null; draw(); }, 4200); draw();
}
export function bannerHtml() {
  const B = G.banner; if (!B) return '';
  return `<button type="button" class="p31-away" data-p31="away" role="status">${glimt(26, 'done')}<span class="m-grow"><b>${esc(B.t)}</b><span>${esc(B.b)}</span></span></button>`;
}

/* ---------- Web Push: abonnement og presence ---------- */
const b64u = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function swReg() { try { return (await navigator.serviceWorker.getRegistration('/finans/')) ?? (await navigator.serviceWorker.ready); } catch { return null; } }
export async function pushState() {
  if (!pushSupported()) { G.pushOn = false; return false; }
  const r = await swReg(); const s = await r?.pushManager?.getSubscription?.().catch(() => null);
  G.pushOn = !!s && Notification.permission === 'granted';
  return G.pushOn;
}
/** Ber om tillatelse (må kalles fra et trykk) og registrerer abonnementet på serveren. */
export async function pushEnable() {
  if (!pushSupported()) { flash('Denne nettleseren støtter ikke push. På iPhone: legg appen på Hjem-skjermen først.'); return false; }
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; } }
  if (perm !== 'granted') { flash('Varsler er ikke tillatt for appen'); draw(); return false; }
  try {
    if (!G.vapid) { const v = await hlApi('/push/vapid'); G.vapid = v?.publicKey ?? v?.key ?? null; }
    if (!G.vapid) throw new Error('Serveren har ikke push-nøkkel');
    const reg = await swReg(); if (!reg) throw new Error('Appen er ikke installert ennå');
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(G.vapid) }));
    await hlApi('/push/subscribe', { method: 'POST', json: { ...(sub.toJSON?.() ?? sub), app: 'pwa' } }); // PushSubscription.toJSON(): {endpoint, keys}
    G.pushOn = true; presence(true); flash('Varsler på denne enheten ✓'); draw(); return true;
  } catch (e) { G.pushOn = false; flash(e.status === 404 ? 'Serveren støtter ikke push ennå' : e.message, 'err'); draw(); return false; }
}
export async function pushDisable() {
  try { const reg = await swReg(), sub = await reg?.pushManager?.getSubscription(); if (sub) { await hlApi('/push/subscribe', { method: 'DELETE', json: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); } } catch {}
  G.pushOn = false; flash('Varsler på denne enheten er av'); draw();
}
let presT = null, presMissing = false;
function presence(visible) {
  if (presMissing || !G.pushOn) return;
  const body = JSON.stringify({ visible });
  try {
    if (!visible && navigator.sendBeacon) { navigator.sendBeacon('/api/push/presence', new Blob([body], { type: 'application/json' })); return; }
    fetch('/api/push/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).then((r) => { if (r.status === 404) presMissing = true; }).catch(() => {});
  } catch {}
}
function presLoop() { clearInterval(presT); if (document.hidden) return; presT = setInterval(() => { if (!document.hidden) presence(true); }, 15000); }

/* ---------- Innstillinger → Varsler: «AI-svar i bakgrunnen» og «Varsler på denne enheten» ---------- */
export function varslerRows(tg) {
  const on = aiBgOn(), perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const st = !pushSupported() ? 'Ikke støttet i denne nettleseren' : G.pushOn ? 'På · Glimt kan varsle når appen er lukket' : perm === 'denied' ? 'Blokkert i nettleseren' : 'Av · trykk for å slå på';
  return tg('data-p31="aibg"', 'AI-svar i bakgrunnen', 'Får du svar mens du er ute av appen, kommer det som varsel', on)
    // Prompt 39 (claude-code-glimt-varsel-ikon.md): banneret i appen kan slås av (n_ai_in, synkes med kontoen).
    + tg('data-p31="aiin"', 'Vis svaret i appen også', 'Banner øverst når du kommer tilbake til appen', aiInOn())
    + tg('data-p31="pushtog"', 'Varsler på denne enheten', st, !!G.pushOn);
}
export const aiInOn = () => (m.nt31?.n_ai_in ?? lsGet('p39_ai_in', true)) !== false;
async function aiInToggle() {
  const v = !aiInOn(); lsSet('p39_ai_in', v);
  m.nt31 = { ...(m.nt31 ?? {}), n_ai_in: v }; draw();
  try { await hlApi('/me/notify', { method: 'PUT', json: { n_ai_in: v } }); } catch (e) { if (e.status !== 404) flash(e.message); }
  flash(v ? 'Glimt viser svaret i appen også ✓' : 'Svaret vises bare i chatten og i varselet');
}
async function aiBgToggle() {
  const v = !aiBgOn(); lsSet('p31_aibg', v);
  m.nt31 = { ...(m.nt31 ?? {}), ai_bg_notify: v }; draw();
  try { await hlApi('/me/notify', { method: 'PUT', json: { ai_bg_notify: v } }); } catch (e) { if (e.status !== 404) flash(e.message); }
  flash(v ? 'Glimt varsler når du er borte ✓' : 'AI-svar i bakgrunnen er av');
  if (v && !G.pushOn && pushSupported() && Notification.permission !== 'denied') pushEnable();
}

/* =====================================================================
   8. Gratis prøveperioder (Legg til abonnement → Gratis prøveperiode)
   ===================================================================== */
const KN = ['Viaplay', 'Netflix', 'HBO Max', 'Max', 'Disney+', 'Spotify', 'TV 2 Play', 'Storytel', 'BookBeat', 'Apple TV+', 'Apple Music', 'YouTube Premium', 'Amazon Prime', 'Audible', 'Strava', 'Tidal', 'Duolingo', 'ChatGPT', 'Adobe', 'Canva', 'Discovery+', 'SkyShowtime', 'Nextory'];
/** Reserve-tolker (samme regler som fasiten). Felles tolker fra serveren: /assets/js/trial-parse.js (parseTrial). */
function trpLocal(txt) {
  const raw = String(txt ?? '').trim(); if (!raw) return null;
  const t = raw.toLowerCase(), now = new Date(); now.setHours(12, 0, 0, 0); let end = null;
  const m1 = t.match(/(\d+)\s*(dag|dager|døgn|uke|uker|måned|måneder|mnd)/);
  if (m1) { const n = +m1[1], u = m1[2]; end = new Date(now); if (/uke/.test(u)) end.setDate(end.getDate() + 7 * n); else if (/m(å|a)ned|mnd/.test(u)) end.setMonth(end.getMonth() + n); else end.setDate(end.getDate() + n); }
  const m2 = t.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (!end && m2) { end = new Date(m2[3] ? (+m2[3] < 100 ? 2000 + +m2[3] : +m2[3]) : now.getFullYear(), +m2[2] - 1, +m2[1], 12); if (!m2[3] && end < now) end.setFullYear(end.getFullYear() + 1); }
  if (!end && /en måned|1 måned|månedlig prøve/.test(t)) { end = new Date(now); end.setMonth(end.getMonth() + 1); }
  if (!end && /en uke/.test(t)) { end = new Date(now); end.setDate(end.getDate() + 7); }
  if (!end) return null;
  let n = KN.find((k) => t.includes(k.toLowerCase()));
  if (!n) { const w = raw.split(/\s+/).find((x) => /^[A-ZÆØÅ]/.test(x) && !/^(Gratis|Påminn|Prøve|Minn|Husk|Jeg|Si)$/i.test(x)); n = w ? w.replace(/[,.:!]/g, '') : ''; }
  if (!n) return null;
  const pm = raw.match(/(\d+[.,]?\d*)\s*(kr|,-)/i);
  return { service: n, ends_at: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`, price: pm ? `${pm[1]} kr/mnd` : '' };
}
let TP = null;
async function parseTrialAny(txt) {
  if (TP === null) TP = await import('/assets/js/trial-parse.js').then((x) => x.parseTrial ?? x.default ?? false).catch(() => false);
  if (TP) {
    try {
      const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const r = TP(txt, iso);
      if (r && (r.service || r.name) && (r.endsAt || r.ends_at)) { const e = r.ends_at ?? r.endsAt ?? r.end ?? ''; const p = r.price_after ?? r.priceAfter ?? r.price; return { service: r.service ?? r.name, ends_at: String(e instanceof Date ? e.toISOString() : e).slice(0, 10), price: p != null && p !== '' ? (typeof p === 'number' ? `${p} kr/mnd` : String(p)) : '' }; }
    } catch {}
  }
  return trpLocal(txt);
}
const REMS = [[0, 'Samme dag'], [1, '1 dag før'], [3, '3 dager før'], [7, '1 uke før']];
const WD3 = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'], MN3 = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const fd = (iso) => { if (!iso) return ''; const d = new Date(`${String(iso).slice(0, 10)}T12:00`); return Number.isNaN(+d) ? '' : `${WD3[d.getDay()]} ${d.getDate()}. ${MN3[d.getMonth()]}`; };
export function trialOpen() { G.tr = { ai: '', service: '', end: '', price: '', rem: [1], busy: false }; }
export function trialBody() {
  const T = G.tr ?? (trialOpen(), G.tr);
  const first = Math.max(0, ...T.rem), pvd = T.end ? new Date(new Date(`${T.end}T09:00`).getTime() - first * 864e5) : null;
  const pvWhen = pvd ? `${fd(`${pvd.getFullYear()}-${String(pvd.getMonth() + 1).padStart(2, '0')}-${String(pvd.getDate()).padStart(2, '0')}`)} 09:00` : '';
  const pvT = `${T.service || 'Tjenesten'}-prøven ${first === 0 ? 'slutter i dag' : first === 1 ? 'slutter i morgen' : `slutter om ${first} dager`}`;
  const pvB = `Avslutt før ${fd(T.end) || 'sluttdato'} for å slippe ${T.price || 'å betale'}. Trykk for å åpne oppsigelsessiden.`;
  const fld = (l, id, v, ph, type, im, i) => `<label class="s28-fld${i ? ' bt' : ''} p31-tf"><span>${l}</span><input id="${id}" type="${type}" data-p31in="${id}" value="${esc(v)}" placeholder="${esc(ph)}" inputmode="${im}" autocomplete="off"></label>`;
  return `<form class="p31-trai" data-p31f="trparse"><span class="p31-trl">✦ SKRIV DET MED EGNE ORD</span><div><input id="p31-trai" data-p31in="ai" value="${esc(T.ai)}" placeholder="Viaplay gratis i 14 dager, påminn meg" enterkeyhint="go" autocomplete="off" aria-label="Beskriv prøveperioden"><button type="submit">Fyll ut</button></div></form>
    <div class="s28-list">${fld('Tjeneste', 'p31-trs', T.service, 'Viaplay', 'text', 'text', 0)}${fld('Prøven slutter', 'p31-tre', T.end, '', 'date', 'text', 1)}${fld('Pris etterpå', 'p31-trp', T.price, '149 kr/mnd', 'text', 'decimal', 2)}</div>
    <div class="s28-cyc"><span class="s28-lab">VARSLE MEG</span><div class="p31-rems">${REMS.map(([d, n]) => `<button type="button" data-p31="trrem" data-d="${d}" aria-pressed="${T.rem.includes(d)}">${n}</button>`).join('')}</div></div>
    <div class="p31-pv" aria-label="Forhåndsvisning av varselet"><span class="p31-pvi">H</span><span class="m-grow"><span class="p31-pvh"><b>HOMELAB</b><span>${esc(pvWhen)}</span></span><b>${esc(pvT)}</b><span>${esc(pvB)}</span></span></div>
    <button type="button" class="s28-pri" data-p31="trsave" ${T.busy ? 'disabled' : ''}>${T.busy ? 'Lagrer …' : 'Lagre påminnelse'}</button>`;
}
async function trialSave(after) {
  const T = G.tr; if (!T) return;
  if (!T.service.trim() || !T.end) { haptic('err'); flash('Fyll inn tjeneste og sluttdato'); return; }
  const pr = parseFloat(String(T.price).replace(/\s/g, '').replace(',', '.'));
  const body = { service: T.service.trim(), endsAt: T.end, priceAfter: Number.isFinite(pr) ? pr : null, remindOffsetsDays: [...T.rem].sort((a, b) => b - a), source: 'form' };
  T.busy = true; draw();
  try { await api('/subscriptions/trials', { method: 'POST', json: body }); }
  catch (e) {
    if (e.status !== 404 && e.status !== 405) { T.busy = false; flash(e.message, 'err'); return; }
    const L = lsGet('papir_trials', []); L.push({ id: `t${Date.now()}`, ...body, status: 'active', local: true }); lsSet('papir_trials', L);
  }
  G.tr = null; G.trials = null; trialsLoad(true);
  flash(`Påminnelse lagret · ${body.service} ✓`); after?.(); draw();
}
/** Prompt 35: «Viaplay gratis i 14 dager, påminn meg om å avslutte» uten /api/assist (intent trial.create lokalt). Varsel 1 dag før kl. 09. */
const MNL2 = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], WDL = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
async function trialQuick(q) {
  const r = await parseTrialAny(q); if (!r) return null;
  const pr = parseFloat(String(r.price ?? '').replace(/\s/g, '').replace(',', '.'));
  const body = { service: r.service, endsAt: r.ends_at, priceAfter: Number.isFinite(pr) ? pr : null, remindOffsetsDays: [1], source: 'ai' };
  try { await api('/subscriptions/trials', { method: 'POST', json: body }); }
  catch (e) { if (e.status !== 404 && e.status !== 405) return null; const L = lsGet('papir_trials', []); L.push({ id: `t${Date.now()}`, ...body, status: 'active', local: true }); lsSet('papir_trials', L); }
  G.trials = null; trialsLoad(true).catch(() => {});
  const end = new Date(`${r.ends_at}T12:00`), rem = new Date(end.getTime() - 864e5), long = (d) => `${WDL[d.getDay()]} ${d.getDate()}. ${MNL2[d.getMonth()]}`;
  return { text: `Jeg minner deg på å avslutte ${r.service} **${long(rem)} kl. 09**, dagen før prøven slutter ${long(end)}.`, src: 'Abonnementer · varsel planlagt', intent: 'trial.create' };
}
/** Aktive prøver (server eller enheten) for merket «Prøve · N dager igjen». */
export async function trialsLoad(force = false) {
  if (!force && G.trials && Date.now() - G.trialsT < 60000) return G.trials;
  G.trialsT = Date.now();
  try { const r = await api('/subscriptions/trials'); G.trials = (Array.isArray(r) ? r : r?.items ?? r?.trials ?? []).filter((x) => (x.status ?? 'active') === 'active'); }
  catch { G.trials = lsGet('papir_trials', []).filter((x) => (x.status ?? 'active') === 'active'); }
  return G.trials;
}
export const daysLeft = (iso) => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(`${String(iso).slice(0, 10)}T00:00`) - t) / 864e5); };
export function trialBadge(n) { return `<span class="p31-trb">Prøve · ${n < 0 ? 'utløpt' : n === 0 ? 'slutter i dag' : n === 1 ? '1 dag igjen' : `${n} dager igjen`}</span>`; }
/** Kort på Subscription OS → Hjem: prøveperiodene med merke og handlinger. */
export function trialCard() {
  if (G.trials === null) { trialsLoad().then(() => { if (m.screen === 'sub') draw(); }).catch(() => {}); return ''; }
  const L = G.trials ?? []; if (!L.length) return '';
  const kr = (v) => (v == null || v === '' ? '' : ` · ${typeof v === 'number' ? `${Math.round(v)} kr/mnd` : esc(v)} etterpå`);
  return `<div class="sb-blk p31-trc"><div class="sec">Prøveperioder</div><div class="p31-trlist">${L.map((x) => { const n = x.daysLeft ?? daysLeft(x.ends_at ?? x.endsAt); return `<div class="p31-trr"><span class="p31-trli">${esc((x.service ?? '?').slice(0, 1).toUpperCase())}</span><span class="m-grow"><b class="m-ell">${esc(x.service)}</b><span class="p31-mut">Slutter ${esc(fd(x.ends_at ?? x.endsAt))}${x.priceLabel ? ` · ${esc(x.priceLabel)} etterpå` : kr(x.price_after ?? x.priceAfter)}</span></span>${x.badge ? `<span class="p31-trb">${esc(x.badge)}</span>` : trialBadge(n)}${x.cancelUrl || x.cancel_url ? `<a class="p31-trx" href="${esc(x.cancelUrl ?? x.cancel_url)}" target="_blank" rel="noopener">Avslutt ↗</a>` : ''}${x.local ? '' : `<button type="button" class="p31-trx" data-p31="trkeep" data-id="${esc(x.id)}">Behold</button>`}</div>`; }).join('')}</div></div>`;
}

/* =====================================================================
   9. Navigasjon og hendelser
   ===================================================================== */
export function input31(e, t) {
  const k = t.dataset?.p31in; if (!k) return false;
  const T = G.tr; if (!T) return true;
  if (k === 'ai') T.ai = t.value;
  else if (k === 'p31-trs') T.service = t.value;
  else if (k === 'p31-tre') T.end = t.value;
  else if (k === 'p31-trp') T.price = t.value;
  if (e.type === 'change' || k === 'p31-tre') { const pv = document.querySelector('.p31-pv'); if (pv) { const tmp = document.createElement('div'); tmp.innerHTML = trialBody(); const n = tmp.querySelector('.p31-pv'); if (n) pv.replaceWith(n); } }
  return true;
}
export async function submit31(e, t) {
  if (!t.matches?.('[data-p31f="trparse"]')) return false;
  e.preventDefault();
  const T = G.tr; if (!T) return true;
  const r = await parseTrialAny(T.ai);
  if (!r) { haptic('err'); flash('Fant ikke tjeneste eller dato'); return true; }
  T.service = r.service; T.end = r.ends_at; T.price = r.price || T.price; haptic('ok'); draw(); return true;
}
/** cb: { quickCancel(job) } fra mobile-p29.js (rask time). */
let CB = {};
export function hooks31(cb) { CB = { ...CB, ...cb }; }
export async function bind31(e, t) {
  const x = t.closest?.('[data-p31]'); if (!x) return false;
  const a = x.dataset.p31;
  if (a === 'ansx' && t.closest('button') && !x.matches('button')) return false;
  e.preventDefault(); e.stopPropagation?.();
  switch (a) {
    case 'aitog': { if (!curJob()) return true; try { navigator.vibrate?.(6); } catch {} haptic('tap'); G.open = !G.open; draw(); return true; }
    case 'aicancel': {
      const j = curJob(); if (!j) return true;
      if (j.kind === 'quick') await CB.quickCancel?.(j);
      else { const w = waiters.get(j.id); if (w) { clearTimeout(w.t); waiters.delete(j.id); w.no(Object.assign(new Error('Avbrutt'), { cancelled: true })); } jobDrop(j.id); hlApi(`/assist/${encodeURIComponent(j.id)}/cancel`, { method: 'POST', json: {} }).catch(() => {}); }
      jobDrop(j.id); G.open = false; flash('Avbrutt · ingenting ble lagt til'); return true;
    }
    case 'aiundo': { const D = G.done; G.done = null; draw(); await D?.undo?.(); return true; }
    case 'aishow': { const D = G.done; G.done = null; draw(); D?.show?.(); return true; }
    case 'ansx': G.ans = null; G.aid++; draw(); return true;
    // Prompt 33: «Endre tittel på N avtaler?» etter «husk at Påhåret er frisøren min».
    case 'ansapply': {
      const A = G.ans, ap = A?.apply; if (!ap?.memoryId) return true;
      A.applied = true; draw();
      try { const d = await hlApi(`/glimt/memory/${encodeURIComponent(ap.memoryId)}/apply`, { method: 'POST', json: {} }); if (G.ans === A) { A.text = `Ferdig: **${d.count ?? 0} ${d.count === 1 ? 'avtale' : 'avtaler'}** heter nå «${ap.title}».`; draw(); } haptic('ok'); }
      catch (err) { flash(err.message); }
      return true;
    }
    case 'anschat': { const q = G.ans?.q; G.ans = null; draw(); const CHAT = await import('./mobile-chat.js'); CHAT.openChat(q ?? ''); return true; }
    case 'away': { const B = G.banner; G.banner = null; draw(); if (B?.url && location.hash !== B.url) location.hash = B.url; return true; }
    case 'go': {
      const h = x.dataset.href, dt = x.dataset.date;
      if (dt && /^#\/kal/.test(h)) { const KAL = await import('./mobile-kal.js'); KAL.kalShowDay(dt); return true; }
      if (/^#\/vaer/.test(h) && G.ans?.open) { const o = G.ans.open; G.ans = null; await P35.openWx(o); return true; } // prompt 35: Vær for stedet
      location.hash = h.replace(/\?.*$/, ''); return true;
    }
    case 'task': {
      const id = x.dataset.id; if (!id) return true;
      const on = x.getAttribute('aria-checked') !== 'true';
      x.setAttribute('aria-checked', String(on)); x.querySelector('.p31-cb')?.classList.toggle('on', on); x.querySelector('.m-grow')?.classList.toggle('p31-strike', on);
      haptic(on ? 'ok' : 'tap');
      hlApi(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: { done: on } }).catch((err) => flash(err.message));
      return true;
    }
    case 'aibg': await aiBgToggle(); return true;
    case 'aiin': await aiInToggle(); return true; // prompt 39
    case 'pushtog': if (G.pushOn) await pushDisable(); else await pushEnable(); return true;
    case 'trrem': { const T = G.tr; if (!T) return true; const d = +x.dataset.d; T.rem = T.rem.includes(d) ? T.rem.filter((v) => v !== d) : [...T.rem, d]; if (!T.rem.length) T.rem = [d === 1 ? 0 : 1]; haptic('tab'); draw(); return true; }
    case 'trsave': await trialSave(CB.trialSaved); return true;
    case 'trkeep': {
      const id = x.dataset.id;
      try { await api(`/subscriptions/trials/${encodeURIComponent(id)}`, { method: 'PATCH', json: { status: 'kept' } }); G.trials = null; await trialsLoad(true); await CB.subsReload?.(); flash('Beholdt · lagt til som abonnement ✓'); }
      catch (err) { flash(err.message, 'err'); }
      draw(); return true;
    }
    default: return false;
  }
}

/* =====================================================================
   10. Oppstart: synlighet, meldinger fra service workeren, presence
   ===================================================================== */
let booted = false;
export function boot31() {
  if (booted) return; booted = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { awayAt = Date.now(); presence(false); clearInterval(presT); return; }
    awayAt = 0; presence(true); presLoop();
    if (G.away.length) setTimeout(showAway, 250);
  });
  addEventListener('pagehide', () => { awayAt = Date.now(); presence(false); });
  navigator.serviceWorker?.addEventListener?.('message', (ev) => {
    const d = ev.data ?? {};
    if (d.type === 'p31-open' && d.url) { try { const u = new URL(d.url); if (u.pathname.startsWith('/finans')) { if (location.hash !== u.hash) location.hash = u.hash || '#/hl'; G.away = []; return; } } catch {} location.href = d.url; }
    if (d.type === 'p31-push' && d.payload) {
      const P = d.payload;
      // Svaret kom som push mens appen var skjult: vis banneret når brukeren kommer tilbake (hvis hun ikke trykket på varselet).
      if (document.hidden && (P.category === 'ai' || /glimt/i.test(P.title ?? ''))) G.away.push({ q: '', body: plain(P.body), url: (() => { try { return new URL(P.url, location.origin).hash || '#/hl'; } catch { return '#/hl'; } })() });
      if (P.category === 'trial') G.trials = null;
    }
  });
  pushState().then((on) => { if (on) { presence(true); presLoop(); } }).catch(() => {});
  hlApi('/me/notify').then((r) => { if (r && typeof r === 'object') m.nt31 = r; }).catch(() => {});
}
