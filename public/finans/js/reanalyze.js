// «✦ Analyser på nytt med Gemini»: sender originalbildet til Gemini og viser resultatet side om side med det forrige.
// Brukes av desktop (bekreftelsessiden og køen) og PWA-en. Brukeren velger hvilket resultat som beholdes.
import { api, esc, n2, dd } from './core.js';

/** Knappen, eller en deaktivert knapp med årsak når Gemini ikke er satt opp. Tom streng når den ikke trengs. */
export function reanalyzeBtn(r, cls = 'btn ghost', style = '') {
  if (!r) return '';
  const st = style ? ` style="${esc(style)}"` : '';
  if (r.canReanalyze) return `<button type="button" class="${cls} ra-btn"${st} data-reanalyze="${esc(r.id)}">✦ Analyser på nytt med Gemini</button>`;
  if (r.reanalyzeReason) return `<button type="button" class="${cls} ra-btn"${st} disabled title="${esc(r.reanalyzeReason)}">✦ Analyser på nytt med Gemini</button>`;
  return '';
}

/** Klikk på [data-reanalyze] innenfor root åpner dialogen. onDone(kvittering) kalles når et valg er gjort.
 *  Bind før sidens egen klikkhåndterer på samme element: klikket stoppes, så f.eks. et omsluttende køkort ikke åpnes. */
export function bindReanalyze(root, onDone) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-reanalyze]');
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault(); e.stopImmediatePropagation();
    openReanalyze(b.dataset.reanalyze, { onDone });
  });
}

const CSS = `
.ra-ov{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.ra-box{width:min(760px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--card,#141418);color:var(--text,#F2F2F4);border:1px solid var(--line,#24242A);border-radius:20px;padding:20px;font:14px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.ra-box h3{margin:0 0 4px;font-size:18px;font-weight:650}
.ra-sub{color:var(--muted,#8C8C96);font-size:13px;margin-bottom:16px}
.ra-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:560px){.ra-cols{grid-template-columns:1fr}}
.ra-col{background:var(--inner,#1B1B20);border:1px solid var(--line,#24242A);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
.ra-col.new{border-color:#4F6BFF66;box-shadow:inset 0 0 0 1px #4F6BFF33}
.ra-h{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:600}
.ra-tag{font-size:11.5px;padding:2px 8px;border-radius:99px;background:#24242A;color:var(--text2,#B9B9C2);font-weight:500}
.ra-col.new .ra-tag{background:#1C2450;color:#B6C3FF}
.ra-row{display:flex;justify-content:space-between;gap:8px;font-size:13.5px}
.ra-row span:first-child{color:var(--muted,#8C8C96)}
.ra-row b{font-weight:600;text-align:right}
.ra-row b.diff{color:#FFD27A}
.ra-items{border-top:1px solid var(--line,#24242A);padding-top:8px;font-size:12.5px;color:var(--text2,#B9B9C2);display:flex;flex-direction:column;gap:3px;max-height:180px;overflow:auto}
.ra-items div{display:flex;justify-content:space-between;gap:8px}
.ra-err{color:#FF8A80;font-size:12.5px}
.ra-act{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}
.ra-act button{height:44px;padding:0 18px;border-radius:12px;border:1px solid var(--line2,#2A2A31);background:var(--inner,#1B1B20);color:inherit;font:inherit;font-weight:600;cursor:pointer}
.ra-act button.pri{background:#4F6BFF;border-color:#4F6BFF;color:#fff}
.ra-act button:disabled{opacity:.5;cursor:default}
.ra-load{display:flex;align-items:center;gap:12px;padding:28px 4px;color:var(--text2,#B9B9C2)}
.ra-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid #4F6BFF44;border-top-color:#4F6BFF;animation:ra-s .8s linear infinite}
@keyframes ra-s{to{transform:rotate(360deg)}}`;

const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)} %`);
const money = (v) => (v == null ? '–' : `${n2(v)} kr`);

function column(x, other, title, isNew) {
  const row = (label, v, ov) => `<div class="ra-row"><span>${label}</span><b class="${isNew && String(v) !== String(ov) ? 'diff' : ''}">${esc(v)}</b></div>`;
  const items = (x.items ?? []).map((l) => `<div><span>${esc(l.description || '–')}</span><span>${money(l.amount)}</span></div>`).join('');
  return `<div class="ra-col${isNew ? ' new' : ''}">
    <div class="ra-h"><span>${esc(title)}</span><span class="ra-tag">${esc(x.engine ?? 'Ukjent motor')}</span></div>
    ${row('Butikk', x.merchant ?? '–', other.merchant ?? '–')}
    ${row('Dato', x.date ? dd(x.date) + '.' + x.date.slice(0, 4) : '–', other.date ? dd(other.date) + '.' + other.date.slice(0, 4) : '–')}
    ${row('Total', money(x.total), money(other.total))}
    ${row('Kategori', x.category ?? '–', other.category ?? '–')}
    ${row('Sikkerhet', pct(x.confidence), pct(other.confidence))}
    ${row('Varelinjer', String((x.items ?? []).length), String((other.items ?? []).length))}
    ${x.error ? `<div class="ra-err">${esc(x.error)}</div>` : ''}
    ${items ? `<div class="ra-items">${items}</div>` : ''}
  </div>`;
}

/** Åpner dialogen og starter analysen. Returnerer et løfte med kvitteringen etter valget (eller null ved avbryt). */
export function openReanalyze(id, { onDone } = {}) {
  if (!document.getElementById('ra-css')) { const s = document.createElement('style'); s.id = 'ra-css'; s.textContent = CSS; document.head.appendChild(s); }
  const ov = document.createElement('div');
  ov.className = 'ra-ov';
  ov.innerHTML = `<div class="ra-box" role="dialog" aria-modal="true" aria-label="Analyser på nytt med Gemini"><h3>✦ Analyser på nytt med Gemini</h3>
    <div class="ra-sub">Originalbildet sendes til Gemini. Du velger selv hvilket resultat som beholdes.</div>
    <div class="ra-body"><div class="ra-load"><span class="ra-spin"></span>Gemini leser kvitteringen …</div></div>
    <div class="ra-act"><button type="button" data-ra="cancel">Avbryt</button></div></div>`;
  document.body.appendChild(ov);
  let busy = true, data = null, resolve;
  const done = new Promise((r) => { resolve = r; });
  const close = (r = null) => { ov.remove(); document.removeEventListener('keydown', key); resolve(r); if (r) onDone?.(r); };
  const key = (e) => { if (e.key === 'Escape' && !busy) close(); };
  document.addEventListener('keydown', key);
  const body = ov.querySelector('.ra-body'), act = ov.querySelector('.ra-act');
  ov.addEventListener('click', async (e) => {
    if (e.target === ov && !busy) return close();
    const b = e.target.closest('[data-ra]');
    if (!b) return;
    const k = b.dataset.ra;
    if (k === 'cancel') return close();
    if (k === 'retry') return run();
    if (k === 'old' || k === 'new') {
      act.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try { close(await api(`/receipts/${encodeURIComponent(id)}/reanalyze/apply`, { method: 'POST', json: { candidateId: data.candidateId, keep: k } })); }
      catch (err) { body.insertAdjacentHTML('beforeend', `<div class="ra-err" style="margin-top:10px">${esc(err.message)}</div>`); act.querySelectorAll('button').forEach((x) => { x.disabled = false; }); }
    }
  });
  async function run() {
    busy = true;
    body.innerHTML = '<div class="ra-load"><span class="ra-spin"></span>Gemini leser kvitteringen …</div>';
    act.innerHTML = '<button type="button" data-ra="cancel">Avbryt</button>';
    try {
      data = await api(`/receipts/${encodeURIComponent(id)}/reanalyze`, { method: 'POST', json: { engine: 'gemini' } });
      body.innerHTML = `<div class="ra-cols">${column(data.previous, data.result, 'Forrige', false)}${column(data.result, data.previous, 'Gemini', true)}</div>`;
      act.innerHTML = '<button type="button" data-ra="old">Behold forrige</button><button type="button" class="pri" data-ra="new">Bruk Gemini-resultatet</button>';
    } catch (err) {
      body.innerHTML = `<div class="ra-err" style="padding:12px 0">${esc(err.message)}</div>`;
      act.innerHTML = '<button type="button" data-ra="cancel">Lukk</button><button type="button" class="pri" data-ra="retry">Prøv igjen</button>';
    } finally { busy = false; }
  }
  run();
  return done;
}
