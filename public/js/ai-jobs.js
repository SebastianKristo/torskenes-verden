// AI-toast og glassboble for alle AI-jobber (prompt 31, claude-code-ai-boble.md + claude-code-ai-animasjon.md).
// Fasit: «Mobil Papir App.dc.html» → aiToastEl(). Felles for rask time (kal-quick.js), Glimt-svar (assist.js),
// skjermbilde og kvittering (FinansHub desktop).
// - Lukket: mørk glass-pille øverst, midtstilt: Glimt-merket (24 px, Tenker) · tekst · tre hoppende prikker · ▾.
// - Trykk: vokser til en glassboble (340 px, radius 28): merke (28 px) · tittel · modell («Glimt · lokal») · prosent,
//   det brukeren skrev (kursiv), steg (✓ ferdig · rød pulserende ring · grå ring), det AI har funnet (to kolonner),
//   Avbryt (stopper jobben, «Avbrutt · ingenting ble lagt til») og Skjul. Trykk på boblen = skjul; jobben fortsetter.
// - Ferdig: merket blir grønt med hake, teksten byttes, og toasten forsvinner etter 3 s.
// Jobben sender {title, model, input, steps[], fields[], progress} via sanntid (/api/ws: «assist», «calendar-quick»);
// uten steg/fremdrift fra serveren anslås de ut fra tiden (dur).
import { glimt, glimtDots, setGlimt } from './glimt.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const J = new Map();          // id → jobb
let openId = null, flash = null, flashT = 0, tick = 0, seq = 0;

const CSS = `.aij-layer{position:fixed;z-index:95;left:50%;top:calc(env(safe-area-inset-top,0px) + 16px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none;font-family:Manrope,Outfit,system-ui,sans-serif}
.aij-layer[hidden]{display:none}
.aij-layer>*{pointer-events:auto}
@keyframes aijIn{from{opacity:0;transform:translateY(-14px) scale(.96)}to{opacity:1;transform:none}}
@keyframes aijPop{from{opacity:.4;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes aijOut{to{opacity:0;transform:translateY(-8px)}}
@keyframes aijRing{0%,100%{transform:scale(.88);opacity:.75}50%{transform:scale(1.05);opacity:1}}
.aij-pill{display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);height:44px;box-sizing:border-box;padding:0 18px 0 10px;border:0;border-radius:999px;background:rgba(27,26,23,.92);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#f3efe6;font:600 14px Manrope,Outfit,system-ui,sans-serif;white-space:nowrap;box-shadow:0 12px 30px -10px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.06);cursor:pointer;animation:aijIn .28s cubic-bezier(.2,.8,.2,1)}
.aij-pill.static{cursor:default}
.aij-pill.out{animation:aijOut .3s ease forwards}
.aij-pill>.aij-t{min-width:0;overflow:hidden;text-overflow:ellipsis}
.aij-pill>.aij-cv{flex:none;opacity:.6;margin-left:-2px}
.aij-pill:focus-visible,.aij-bub:focus-visible{outline:2px solid #e8794a;outline-offset:2px}
.aij-bub{width:min(340px,calc(100vw - 32px));box-sizing:border-box;padding:14px 16px 16px;border-radius:28px;background:rgba(250,248,243,.72);-webkit-backdrop-filter:blur(28px) saturate(1.6);backdrop-filter:blur(28px) saturate(1.6);color:#1b1a17;box-shadow:0 24px 60px -18px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.6) inset,0 0 0 1px rgba(27,26,23,.08);display:flex;flex-direction:column;gap:12px;cursor:pointer;font:500 14px Manrope,Outfit,system-ui,sans-serif;transform-origin:50% 0;animation:aijPop .32s cubic-bezier(.2,.9,.2,1.15);text-align:left}
.aij-bub.still{animation:none}
.aij-h{display:flex;align-items:center;gap:10px}
.aij-ht{flex:1;min-width:0;display:flex;flex-direction:column}
.aij-ht b{font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aij-ht span,.aij-pct{font-size:12px;color:#6b6558}
.aij-pct{flex:none;white-space:nowrap;font:600 12px 'IBM Plex Mono',ui-monospace,monospace}
.aij-q{padding:8px 12px;border-radius:14px;background:rgba(27,26,23,.06);font-size:13px;color:#3d3a33;font-style:italic;overflow-wrap:anywhere}
.aij-steps{display:flex;flex-direction:column;gap:7px}
.aij-s{display:flex;align-items:center;gap:10px;font-size:13.5px;color:#a39c8e}
.aij-s.done,.aij-s.on{color:#1b1a17}.aij-s.on{font-weight:700}
.aij-s>i{flex:none;width:18px;height:18px;border-radius:9px;box-sizing:border-box;border:1.5px solid #c9c1b1;display:grid;place-items:center}
.aij-s.done>i{background:#2f7d4f;border:0}
.aij-s.on>i{border:2px solid #b23a2a;animation:aijRing 1.2s ease-in-out infinite}
.aij-f{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;row-gap:4px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.55)}
.aij-f span{font-size:12px;color:#8f897c}
.aij-f b{font-size:13px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aij-b{display:flex;gap:8px}
.aij-b button{flex:1;height:38px;border-radius:19px;border:0;background:rgba(27,26,23,.08);color:#1b1a17;font:700 13px Manrope,Outfit,system-ui,sans-serif;cursor:pointer}
.aij-b button.ink{background:#1b1a17;color:#f3efe6}
html:not([data-hl="2c"]) .aij-bub{background:rgba(22,26,36,.74);color:#eef0f4;box-shadow:0 24px 60px -18px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1) inset}
html:not([data-hl="2c"]) .aij-ht span,html:not([data-hl="2c"]) .aij-pct,html:not([data-hl="2c"]) .aij-f span{color:#a3abbb}
html:not([data-hl="2c"]) .aij-q{background:rgba(255,255,255,.07);color:#d6dae3}
html:not([data-hl="2c"]) .aij-s{color:#6f7788}
html:not([data-hl="2c"]) .aij-s.done,html:not([data-hl="2c"]) .aij-s.on{color:#eef0f4}
html:not([data-hl="2c"]) .aij-s>i{border-color:#4a5263}
html:not([data-hl="2c"]) .aij-s.on>i{border-color:#f26b5e}
html:not([data-hl="2c"]) .aij-f{background:rgba(255,255,255,.06)}
html:not([data-hl="2c"]) .aij-b button{background:rgba(255,255,255,.1);color:#eef0f4}
html:not([data-hl="2c"]) .aij-b button.ink{background:#eef0f4;color:#0c1119}
@media (prefers-reduced-motion:reduce){.aij-pill,.aij-bub{animation:none!important}.aij-s.on>i{animation:none!important}}`;

function injectCss() {
  if (document.getElementById('aij-css')) return;
  const s = document.createElement('style');
  s.id = 'aij-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

const CK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const CV = '<svg class="aij-cv" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/** Steg fra serveren: tekst eller {label|title|t|name, state|done}. */
function normSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((s) => (typeof s === 'string' ? { t: s, st: '' }
    : { t: String(s?.label ?? s?.title ?? s?.t ?? s?.name ?? s?.text ?? ''), st: s?.state ?? (s?.done ? 'done' : '') })).filter((s) => s.t);
}
/** Felt fra serveren: [k, v] eller {k|label|key, v|value}. */
function normFields(f) {
  if (f && !Array.isArray(f) && typeof f === 'object') return Object.entries(f).map(([k, v]) => [k, String(v ?? '')]);
  return (Array.isArray(f) ? f : []).map((x) => (Array.isArray(x) ? [String(x[0]), String(x[1] ?? '')] : [String(x?.k ?? x?.label ?? x?.key ?? ''), String(x?.v ?? x?.value ?? '')])).filter(([k, v]) => k && v);
}

/** Fremdrift 0–1 og indeks for steget som pågår. */
function prog(j) {
  const n = j.steps.length;
  let p = Number.isFinite(j.progress) ? j.progress : null;
  if (p != null && p > 1) p /= 100;
  if (p == null) p = Math.min(0.92, (Date.now() - j.t0) / (j.dur || 2600));
  p = Math.max(0, Math.min(1, p));
  let cur = j.steps.findIndex((s) => s.st === 'running' || s.st === 'active');
  if (cur < 0) { const d = j.steps.filter((s) => s.st === 'done').length; cur = d && d >= n ? n - 1 : d || Math.min(n - 1, Math.floor(p * n)); }
  if (j.state === 'done') { p = 1; cur = n; }
  return { p, cur };
}

function layer() {
  injectCss();
  let el = document.getElementById('aij-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aij-layer'; el.className = 'aij-layer'; el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-aij]');
      const a = b?.dataset.aij;
      if (a === 'cancel') { e.stopPropagation(); cancel(openId); return; }
      if (a === 'hide' || e.target.closest('.aij-bub')) { e.stopPropagation(); openId = null; haptic(); paint(); return; }
      if (e.target.closest('.aij-pill')) { const j = top(); if (j && j.state === 'running') { openId = j.id; haptic(); paint(); } }
    });
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.aij-pill,.aij-bub')) { e.preventDefault(); e.target.click(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) { openId = null; paint(); } });
  }
  return el;
}
const haptic = () => { try { navigator.vibrate?.(6); } catch { /* */ } };
/** Jobben som vises: siste som går (og ikke er skjult av eieren). */
function top() {
  const L = [...J.values()].filter((j) => j.state === 'running' && !(j.hideToast?.()));
  return L.at(-1) ?? null;
}

function bubHtml(j, still = false) {
  const { p, cur } = prog(j);
  const steps = j.steps.map((s, i) => { const cls = i < cur || s.st === 'done' ? 'done' : i === cur ? 'on' : ''; return `<div class="aij-s ${cls}" data-k="${cls}"><i>${cls === 'done' ? CK : ''}</i><span>${esc(s.t)}${cls === 'on' ? ' …' : ''}</span></div>`; }).join('');
  const f = j.fields.length ? `<div class="aij-f">${j.fields.map(([k, v]) => `<span>${esc(k)}</span><b data-no-i18n>${esc(v)}</b>`).join('')}</div>` : '';
  return `<div class="aij-bub${still ? ' still' : ''}" role="dialog" aria-label="${esc(j.title)}" tabindex="0" title="Trykk for å skjule">
    <div class="aij-h">${glimt(28, 'tenker')}<span class="aij-ht"><b>${esc(j.title)}</b><span>${esc(j.model)}</span></span><span class="aij-pct">${Math.round(p * 100)} %</span></div>
    ${j.input ? `<div class="aij-q" data-no-i18n>«${esc(j.input)}»</div>` : ''}
    ${steps ? `<div class="aij-steps">${steps}</div>` : ''}${f}
    <div class="aij-b">${j.cancel ? '<button type="button" data-aij="cancel">Avbryt</button>' : ''}<button type="button" class="ink" data-aij="hide">Skjul</button></div></div>`;
}

export function paint() {
  const el = layer(), j = top();
  if (openId && !J.get(openId)?.state?.startsWith('run')) openId = null;
  if (openId && J.get(openId)) { const still = el.dataset.open === openId; el.innerHTML = bubHtml(J.get(openId), still); el.dataset.open = openId; el.hidden = false; return; }
  delete el.dataset.open;
  if (j) {
    const txt = j.toast || `${j.title} …`;
    const prev = el.querySelector('.aij-pill[data-id]');
    if (prev && prev.dataset.id === j.id) { const t = prev.querySelector('.aij-t'); if (t && t.textContent !== txt) t.textContent = txt; el.hidden = false; return; }
    el.innerHTML = `<div class="aij-pill" data-id="${esc(j.id)}" role="button" tabindex="0" aria-label="${esc(txt)} · trykk for detaljer" title="Se hva Glimt gjør">${glimt(24, 'tenker', { dark: true })}<span class="aij-t">${esc(txt)}</span>${glimtDots()}${CV}</div>`;
    el.hidden = false; return;
  }
  if (flash) {
    if (!el.querySelector('.aij-pill.static')) el.innerHTML = `<div class="aij-pill static" role="status">${glimt(24, flash.ok ? 'tenker' : 'klar', { dark: true })}<span class="aij-t">${esc(flash.text)}</span></div>`;
    if (flash.ok) setGlimt(el, 'ferdig');
    el.hidden = false; return;
  }
  el.innerHTML = ''; el.hidden = true;
}

function loop() {
  if (tick) return;
  tick = setInterval(() => {
    if (![...J.values()].some((j) => j.state === 'running')) { clearInterval(tick); tick = 0; return; }
    const j = openId && J.get(openId), b = j && document.querySelector('#aij-layer .aij-bub');
    if (!b) return;
    // Bare tallet og stegene oppdateres på stedet, så knappene i boblen kan trykkes mens jobben går.
    const { p, cur } = prog(j), pc = b.querySelector('.aij-pct');
    if (pc) pc.textContent = `${Math.round(p * 100)} %`;
    b.querySelectorAll('.aij-s').forEach((el, i) => {
      const want = i < cur || j.steps[i]?.st === 'done' ? 'done' : i === cur ? 'on' : '';
      if (el.dataset.k === want) return;
      el.dataset.k = want; el.className = `aij-s ${want}`;
      el.querySelector('i').innerHTML = want === 'done' ? CK : '';
      el.querySelector('span').textContent = (j.steps[i]?.t ?? '') + (want === 'on' ? ' …' : '');
    });
  }, 250);
}

/**
 * Starter en jobb. o = { id?, title, toast?, model?, input?, steps?, fields?, progress?, dur?, cancel?: () => void,
 * hideToast?: () => bool (eieren viser jobben selv, f.eks. svarboblen) }. Returnerer id.
 */
export function aiStart(o = {}) {
  const id = String(o.id ?? `aij${++seq}`);
  J.set(id, { id, title: o.title || 'Glimt jobber', toast: o.toast || '', model: o.model || 'Glimt · lokal', input: o.input || '', steps: normSteps(o.steps), fields: normFields(o.fields),
    progress: o.progress ?? null, t0: Date.now(), dur: o.dur || 2600, cancel: o.cancel || null, hideToast: o.hideToast || null, state: 'running' });
  clearTimeout(flashT); flash = null;
  paint(); loop();
  return id;
}

/** Oppdaterer en jobb (fra sanntid). Ukjent id: ingenting skjer, med mindre o.create er satt. */
export function aiUpdate(id, o = {}) {
  let j = J.get(String(id));
  if (!j) { if (!o.create) return; aiStart({ ...o, id }); j = J.get(String(id)); }
  if (o.title) j.title = o.title;
  if (o.toast) j.toast = o.toast;
  if (o.model) j.model = o.model;
  if (o.input) j.input = o.input;
  if (Array.isArray(o.steps) && o.steps.length) j.steps = normSteps(o.steps);
  if (o.fields && (Array.isArray(o.fields) ? o.fields.length : Object.keys(o.fields).length)) j.fields = normFields(o.fields);
  if (o.progress != null && Number.isFinite(+o.progress)) j.progress = +o.progress;
  if (o.cancel) j.cancel = o.cancel;
  paint();
}

/** Ferdig: viser text (med grønn hake) i 3 s. silent = eieren viser resultatet selv. */
export function aiDone(id, { text = '', silent = false, ok = true } = {}) {
  const j = J.get(String(id));
  if (!j) return;
  j.state = ok ? 'done' : 'failed';
  J.delete(j.id);
  if (openId === j.id) openId = null;
  if (!silent && text) {
    flash = { text, ok };
    clearTimeout(flashT);
    flashT = setTimeout(() => { const p = document.querySelector('#aij-layer .aij-pill.static'); if (p) p.classList.add('out'); setTimeout(() => { flash = null; paint(); }, 300); }, 3000);
    try { navigator.vibrate?.([10, 40, 10]); } catch { /* */ }
  }
  paint();
}
export const aiFail = (id, text) => aiDone(id, { text, ok: false });

/** Avbryt fra boblen: eierens cancel() kalles, og toasten sier fra. */
export function cancel(id) {
  const j = J.get(String(id));
  if (!j) return;
  try { j.cancel?.(); } catch (e) { console.warn('[glimt] avbryt', e); }
  aiDone(j.id, { text: j.cancelText || 'Avbrutt · ingenting ble lagt til', ok: false });
}
export const aiJob = (id) => J.get(String(id)) ?? null;
export const aiRunning = () => [...J.values()].filter((j) => j.state === 'running');
