// Prompt 70 (GLIMTCAL70, claude-code-glimt-kalender-ikke-spor.md): kort A – «✓ LAGT I KALENDEREN» når Glimt har lagt en avtale i
// standardkalenderen. Kalender-pillen folder ut lista over kalendere INNE i kortet (B: ingen systemmeny, ikke ark); valget flytter
// avtalen med en gang (PATCH card.move.url {calendarId}). «Angre» i 10 s (POST card.undo.url). «Åpne i Kalender» → card.open.web.
// Samme kort på Hjem (inne i den mørke boblen), i Chat (eget mørkt kort) og i Kalender (C: lyse farger, «Vis i uka»).
// Selvstendig modul: data kommer fra serveren (actions[].result.card70), CSS injiseres her, klikk håndteres delegert på document.
//   cal70Of(a)            → kortdata fra et normalisert agentsvar (glimt-agent45 normAgent) eller null
//   cal70Html(card, opts) → HTML. opts.mode: 'in' (inne i mørk boble) | 'card' (eget mørkt kort) | 'kal' (C, lyse farger)
//   datePick70(btn, text, send) → «Velg dato» i spørsmålskortet: datovelger i kortet, send(text med {dato} byttet ut)
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const ST = new Map(); // nøkkel (første eventId) → {card, open, busy, undone, moved, err, until, mode}
const ALIAS = new Map(); // ny eventId (etter flytting) → nøkkel
let timer = 0;

// Knappene arver ikke farge fra sidene (.ch button {color:inherit} i Chat): reglene starter med .c70.
/** Kortdata fra agentsvaret: calendar.create som er utført og har card70. */
export function cal70Of(a) {
  const acts = Array.isArray(a?.actions) ? a.actions : [];
  const x = acts.find((y) => y?.tool === 'calendar.create' && y.status === 'done' && y.result?.card70?.eventId);
  return x ? x.result.card70 : (a?.card70?.eventId ? a.card70 : null);
}
const keyOf = (card) => { const id = String(card?.eventId ?? ''); return ALIAS.get(id) ?? id; };
function stateOf(card, mode) {
  const k = keyOf(card);
  let s = ST.get(k);
  if (!s) {
    const exp = Date.parse(card.undo?.expiresAt ?? '') || Date.now() + (card.undo?.ttlMs ?? 10_000);
    s = { card, open: false, busy: false, undone: false, moved: '', err: '', until: Math.min(exp, Date.now() + (card.undo?.ttlMs ?? 10_000)), mode };
    ST.set(k, s);
    if (ST.size > 30) ST.delete(ST.keys().next().value);
  }
  if (mode) s.mode = mode;
  return [k, s];
}
const leftOf = (s) => Math.max(0, Math.ceil((s.until - Date.now()) / 1000));

function rowsHtml(k, s) {
  const c = s.card;
  const rows = (c.calendars ?? []).map((x) => {
    const sub = x.suggested ? `Foreslått${c.with?.length ? ` · du nevnte ${c.with[0]}` : ''}` : x.default ? 'Standardkalender' : (x.source || '');
    const on = x.id === c.calendar?.id;
    return `<button type="button" class="c70-row${on ? ' on' : ''}" role="option" aria-selected="${on}" data-c70="${esc(k)}" data-c70-a="pick" data-c70-id="${esc(x.id)}"${s.busy ? ' disabled' : ''}><i style="background:${esc(x.color || '#7a7468')}"></i><span class="c70-rt"><b data-no-i18n>${esc(x.name)}</b>${sub ? `<span data-no-i18n>${esc(sub)}</span>` : ''}</span><span class="c70-ck" aria-hidden="true">${on ? '✓' : ''}</span></button>`;
  }).join('');
  return `<div class="c70-list" role="listbox" aria-label="Legg i kalender"><span class="c70-lh">LEGG I</span>${rows}</div>`;
}
/** HTML for kortet. */
export function cal70Html(card, opts = {}) {
  if (!card?.eventId) return '';
  injectCss();
  const [k, s] = stateOf(card, opts.mode ?? 'card');
  const c = s.card, mode = s.mode;
  tick();
  if (s.undone) return `<div class="c70 c70-${mode} c70-gone" data-c70-box="${esc(k)}" role="status"><span class="c70-k c70-kn">↶ ANGRET</span><span class="c70-msg" data-no-i18n>«${esc(c.title)}» er fjernet fra kalenderen.</span></div>`;
  const left = leftOf(s);
  const head = mode === 'kal' ? '<span class="c70-k"><i aria-hidden="true">✓</i>LAGT INN</span>' : '<span class="c70-k"><i aria-hidden="true">✓</i>LAGT I KALENDEREN</span>';
  const ev = mode === 'kal'
    ? `<div class="c70-ev c70-evk"><span class="c70-bar" style="background:${esc(c.calendar?.color || '#b23a2a')}"></span><span class="c70-t"><b data-no-i18n>${esc(c.title)}</b><span data-no-i18n>${esc([`${c.day?.wd ?? ''} ${c.day?.n ?? ''}. ${String(c.day?.mon ?? '').toLowerCase()}`, c.timeText, c.place, c.withText ? c.withText.toLowerCase() : ''].filter((x) => x && x.trim()).join(' · '))}</span></span></div>`
    : `<div class="c70-ev"><span class="c70-d" aria-hidden="true"><span>${esc(c.day?.mon)}</span><b>${esc(c.day?.n)}</b><span>${esc(c.day?.wd)}</span></span><span class="c70-t"><b data-no-i18n>${esc(c.title)}</b><span data-no-i18n>${esc(c.line)}</span>${c.withText ? `<span data-no-i18n>${esc(c.withText)}</span>` : ''}</span></div>`;
  const pill = `<button type="button" class="c70-p c70-pc" data-c70="${esc(k)}" data-c70-a="cal" aria-expanded="${s.open}" aria-label="Kalender: ${esc(c.calendar?.name)}. Bytt kalender"${s.busy ? ' disabled' : ''}><i style="background:${esc(c.calendar?.color || '#b23a2a')}"></i><span data-no-i18n>${esc(c.calendar?.name)}</span><span class="c70-car" aria-hidden="true">▾</span></button>`;
  const second = mode === 'kal' ? `<button type="button" class="c70-p" data-c70="${esc(k)}" data-c70-a="open">Vis i uka</button>` : `<span class="c70-p">${esc(c.reminder?.label || 'Varsel 1 t før')}</span>`;
  const undo = left > 0 ? `<button type="button" class="${mode === 'kal' ? 'c70-p' : 'c70-b2'}" data-c70="${esc(k)}" data-c70-a="undo"${s.busy ? ' disabled' : ''}>Angre <span class="c70-left" data-c70-left="${esc(k)}" aria-hidden="true">${left}</span></button>` : '';
  const btns = mode === 'kal' ? '' : `<div class="c70-btns"><button type="button" class="c70-b1" data-c70="${esc(k)}" data-c70-a="open">Åpne i Kalender</button>${undo}</div>`;
  const note = s.err ? `<span class="c70-err" role="alert" data-no-i18n>${esc(s.err)}</span>` : s.moved ? `<span class="c70-note" role="status" data-no-i18n>${esc(s.moved)}</span>` : '';
  return `<div class="c70 c70-${mode}" data-c70-box="${esc(k)}">${head}${ev}<div class="c70-pills">${pill}${second}${mode === 'kal' ? undo : ''}</div>${s.open ? rowsHtml(k, s) : ''}${note}${btns}</div>`;
}

function repaint(k) {
  const s = ST.get(k);
  if (!s) return;
  document.querySelectorAll(`[data-c70-box="${CSS.escape(k)}"]`).forEach((el) => {
    const t = document.createElement('div');
    t.innerHTML = cal70Html(s.card, { mode: s.mode });
    const n = t.firstElementChild;
    if (n) el.replaceWith(n);
  });
}
function tick() {
  if (timer) return;
  timer = setInterval(() => {
    let any = false;
    for (const [k, s] of ST) {
      if (s.undone) continue;
      const left = leftOf(s);
      const els = document.querySelectorAll(`[data-c70-left="${CSS.escape(k)}"]`);
      if (!els.length) continue;
      if (left <= 0) { repaint(k); continue; }
      any = true;
      els.forEach((e) => { e.textContent = String(left); });
    }
    if (!any) { clearInterval(timer); timer = 0; }
  }, 1000);
}

async function call(method, url, body) {
  const r = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  if (r.status === 401) { location.href = '/login'; throw new Error('Ikke innlogget'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Feil ${r.status}`);
  return d;
}
function changed() { try { document.dispatchEvent(new CustomEvent('hl:agent45', { detail: { modules: ['calendar'], actions: [] } })); } catch { /* */ } }

async function act(b) {
  const k = b.dataset.c70, s = ST.get(k);
  if (!s) return;
  const a = b.dataset.c70A;
  if (a === 'cal') { s.open = !s.open; s.err = ''; repaint(k); document.querySelector(`[data-c70-box="${CSS.escape(k)}"] ${s.open ? '.c70-row.on, .c70-row' : '.c70-pc'}`)?.focus(); return; }
  if (a === 'open') { const w = s.card.open?.web; if (w) { if (w.startsWith('#')) location.hash = w; else location.href = w; } return; }
  if (a === 'pick') {
    const id = b.dataset.c70Id;
    if (!id || id === s.card.calendar?.id) { s.open = false; repaint(k); return; }
    s.busy = true; s.err = ''; repaint(k);
    try {
      const d = await call(s.card.move?.method ?? 'PATCH', s.card.move.url, { calendarId: id });
      if (d.card70?.eventId) { ALIAS.set(String(d.card70.eventId), k); s.card = { ...d.card70, undo: s.card.undo && d.card70.undo ? { ...d.card70.undo } : d.card70.undo }; }
      s.moved = `Flyttet til ${s.card.calendar?.name ?? ''}`; s.open = false; changed();
    } catch (e) { s.err = e.message; }
    s.busy = false; repaint(k);
    return;
  }
  if (a === 'undo') {
    s.busy = true; s.err = ''; repaint(k);
    try { await call(s.card.undo?.method ?? 'POST', s.card.undo.url, {}); s.undone = true; changed(); }
    catch (e) { s.err = e.message; }
    s.busy = false; repaint(k);
  }
}

/** «Velg dato» i spørsmålskortet: knappen blir en datovelger i kortet; valgt dato settes inn i teksten ({dato} → 17.12.2026). */
export function datePick70(btn, text, send) {
  if (!btn || !String(text ?? '').includes('{dato}')) return false;
  const inp = document.createElement('input');
  inp.type = 'date'; inp.className = 'c70-date'; inp.setAttribute('aria-label', 'Velg dato');
  inp.min = new Date().toISOString().slice(0, 10);
  inp.addEventListener('change', () => {
    const v = inp.value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    const [y, m, d] = v.split('-');
    inp.disabled = true;
    send(String(text).replace('{dato}', `${d}.${m}.${y}`));
  });
  injectCss();
  btn.replaceWith(inp);
  try { inp.showPicker?.(); } catch { /* ikke alle nettlesere */ }
  inp.focus();
  return true;
}

let bound = false;
export function initCal70() {
  if (bound) return; bound = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-c70-a]');
    if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    act(b);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const box = e.target.closest?.('[data-c70-box]');
    const s = box && ST.get(box.dataset.c70Box);
    if (s?.open) { e.stopPropagation(); s.open = false; repaint(box.dataset.c70Box); box.ownerDocument.querySelector(`[data-c70-box="${CSS.escape(box.dataset.c70Box)}"] .c70-pc`)?.focus(); }
  }, true);
}
if (typeof document !== 'undefined') initCal70();

const CSS70 = `
.c70{display:flex;flex-direction:column;gap:12px;margin-top:2px;color:#f6f2ea;font-family:Manrope,system-ui,sans-serif;text-align:left}
.c70-card{padding:16px 16px 14px 18px;border-radius:26px;background:rgba(22,20,18,.9);box-shadow:0 20px 50px -18px rgba(0,0,0,.6);max-width:420px}
.c70-k{display:flex;align-items:center;gap:8px;font:600 10.5px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.12em;color:#8fd1a6}
.c70-k i{width:18px;height:18px;border-radius:9px;background:#2f7a4f;color:#fff;display:grid;place-items:center;font:700 11px Manrope,system-ui,sans-serif;font-style:normal}
.c70-kn{color:rgba(246,242,234,.7)}
.c70-msg{font-size:14px;color:rgba(246,242,234,.85)}
.c70-ev{display:flex;gap:12px;align-items:stretch}
.c70-d{flex:none;width:52px;border-radius:14px;background:#fffdf8;color:#1b1a17;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;padding:8px 0}
.c70-d span:first-child{font:700 10px Manrope,system-ui,sans-serif;color:#b23a2a}
.c70-d b{font:500 26px Newsreader,Georgia,serif;margin-top:2px}
.c70-d span:last-child{font:600 10px Manrope,system-ui,sans-serif;color:#6b6558;margin-top:2px}
.c70-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.c70-t b{font:500 21px/1.15 Newsreader,Georgia,serif;overflow-wrap:anywhere}
.c70-t span{font-size:13px;color:rgba(246,242,234,.8)}
.c70-pills{display:flex;gap:6px;flex-wrap:wrap}
.c70 .c70-p{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:17px;border:0;background:rgba(255,255,255,.12);color:inherit;font:600 12.5px Manrope,system-ui,sans-serif;cursor:default}
.c70 button.c70-p{cursor:pointer}
.c70-p i{width:9px;height:9px;border-radius:5px;flex:none}
.c70-car{opacity:.7;display:inline-block;transition:transform .18s ease}
.c70-pc[aria-expanded="true"] .c70-car{transform:rotate(180deg)}
.c70-list{display:flex;flex-direction:column;gap:4px;animation:c70in .18s ease both;transform-origin:top}
.c70-lh{font:600 10px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.12em;color:rgba(246,242,234,.55);margin:2px 0 2px}
.c70 .c70-row{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:14px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}
.c70 .c70-row.on{background:rgba(255,255,255,.12)}
.c70 .c70-row:hover{background:rgba(255,255,255,.08)}
.c70-row i{width:11px;height:11px;border-radius:6px;flex:none}
.c70-rt{flex:1;min-width:0;display:flex;flex-direction:column}
.c70-rt b{font:600 14px Manrope,system-ui,sans-serif}
.c70-rt span{font-size:11.5px;color:rgba(246,242,234,.6)}
.c70-ck{font:700 14px Manrope,system-ui,sans-serif;color:#8fd1a6;min-width:14px}
.c70-btns{display:flex;gap:8px}
.c70 .c70-b1{flex:1;height:40px;border-radius:20px;border:0;background:#f6f2ea;color:#1b1a17;font:700 13.5px Manrope,system-ui,sans-serif;cursor:pointer}
.c70 .c70-b2{height:40px;padding:0 16px;border-radius:20px;border:0;background:rgba(255,255,255,.12);color:inherit;font:700 13.5px Manrope,system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.c70-left{font:600 11px 'IBM Plex Mono',ui-monospace,monospace;opacity:.65}
.c70-note{font-size:12.5px;color:#8fd1a6}
.c70-err{font-size:12.5px;color:#ffc2b6}
.c70 button:focus-visible{outline:2px solid #8fd1a6;outline-offset:2px}
.c70 button:disabled{opacity:.6}
.c70-kal{padding:14px;border-radius:20px;background:#f3efe6;color:#1b1a17;gap:10px}
.c70-kal .c70-k{color:#2f7a4f}
.c70-kal .c70-kn,.c70-kal .c70-msg{color:#6b6558}
.c70-evk{gap:10px;align-items:center}
.c70-bar{flex:none;width:4px;align-self:stretch;border-radius:2px}
.c70-kal .c70-t b{font-size:19px}
.c70-kal .c70-t span{font-size:12.5px;color:#6b6558}
.c70-kal .c70-p{background:#fffdf8;border:1px solid #d8d1c2;color:#1b1a17}
.c70-kal .c70-row.on{background:#fffdf8}
.c70-kal .c70-row:hover{background:rgba(0,0,0,.04)}
.c70-kal .c70-lh,.c70-kal .c70-rt span{color:#6b6558}
.c70-kal .c70-ck,.c70-kal .c70-note{color:#2f7a4f}
.c70-kal .c70-err{color:#b23a2a}
.c70-kal button:focus-visible{outline-color:#2f7a4f}
html[data-mode="dark"] .c70-kal{background:#24211c;color:#f3efe6}
html[data-mode="dark"] .c70-kal .c70-p,html[data-mode="dark"] .c70-kal .c70-row.on{background:#2e2a24;border-color:#4a443a;color:#f3efe6}
html[data-mode="dark"] .c70-kal .c70-t span,html[data-mode="dark"] .c70-kal .c70-lh,html[data-mode="dark"] .c70-kal .c70-rt span{color:#b9b1a2}
.c70-date{height:34px;padding:0 10px;border-radius:17px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:600 13px Manrope,system-ui,sans-serif;color-scheme:light dark}
@keyframes c70in{from{opacity:0;transform:translateY(-4px) scaleY(.96)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.c70-list{animation:none}.c70-car{transition:none}}
`;
let cssOn = false;
function injectCss() {
  if (cssOn || typeof document === 'undefined') return; cssOn = true;
  const st = document.createElement('style');
  st.id = 'cal70-css'; st.textContent = CSS70;
  document.head.appendChild(st);
}
