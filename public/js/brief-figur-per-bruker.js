// Brief og Glimt-figur per bruker (admin). Innstillinger → Brukere og familie → «Brief og Glimt-figur» (prompt 65; var System → Mer).
// Bruker API-et fra prompt 52: GET/PUT /api/admin/brief52/access og GET /api/admin/glimt-char52, PUT /api/admin/glimt-char52/:userId.
// Admin får alltid alle kortene; barn mister Regninger, Nytt i kveld, Homelab, Domener og Aksjer.
import { esc, api, overlay } from './dal53.js';

const COLS = [['children', 'Barn', 'Uten Regninger, Nytt i kveld, Homelab, Domener og Aksjer'], ['homelab', 'Homelab', 'Kortet med tjenestene og Start-knappen'],
  ['domains', 'Domener', 'Kortet med domener som går ut'], ['stocks', 'Aksjer', 'Kortet med aksjer']];
const SRC = { user: 'valgt selv', default: 'standard du har satt', standard: 'ingen standard satt' };
let ACC = null, CH = null, msg = '', busy = false;

function render(ov) {
  const body = ov.querySelector('.dal53-body');
  if (!ACC || !CH) { body.innerHTML = `<h2>Brukere: brief og figur</h2><p class="dal53-muted">${esc(msg || 'Henter …')}</p>`; return; }
  const chars = CH.chars ?? [];
  const byId = new Map((CH.users ?? []).map((u) => [u.id, u]));
  const rows = (ACC.users ?? []).map((u) => {
    const admin = u.role === 'admin', c = byId.get(u.id) ?? {};
    const boxes = COLS.map(([k, n]) => {
      const on = (ACC[k] ?? []).includes(u.id);
      const dis = admin || busy || (k !== 'children' && (ACC.children ?? []).includes(u.id));
      return `<label class="p55-chk"${admin ? ' title="Admin får alle kortene"' : ''}><input type="checkbox" data-p55-acc="${k}" data-p55-user="${esc(u.id)}"${(admin ? k !== 'children' : on) ? ' checked' : ''}${dis ? ' disabled' : ''}> ${esc(n)}</label>`;
    }).join('');
    const opts = [`<option value="">Ingen standard (Glimt)</option>`, ...chars.map((x) => `<option value="${esc(x.id)}"${c.default === x.id ? ' selected' : ''}>${esc(x.name ?? x.id)}</option>`)].join('');
    const now = chars.find((x) => x.id === c.char);
    return `<div class="dal53-row"><div class="grow"><b>${esc(u.name)}</b> ${admin ? '<span class="dal53-pill ok">admin</span>' : (ACC.children ?? []).includes(u.id) ? '<span class="dal53-pill warn">barn</span>' : ''}
      <div class="p55-boxes">${boxes}</div>
      <div class="p55-char"><label>Glimt-figur som standard <select data-p55-char="${esc(u.id)}"${busy ? ' disabled' : ''} aria-label="Glimt-figur som standard for ${esc(u.name)}">${opts}</select></label>
      <span class="dal53-muted">Nå: ${esc(now?.name ?? c.char ?? 'Glimt')} (${esc(SRC[c.source] ?? c.source ?? '')})</span></div></div></div>`;
  }).join('');
  body.innerHTML = `<h2>Brukere: brief og figur</h2>
    <p class="dal53-muted">Velg hvilke brief-kort hver bruker får, og hvilken Glimt-figur de starter med. Admin får alltid alle kortene. Figuren er bare en standard: velger brukeren en figur selv, gjelder den.</p>
    ${msg ? `<p class="dal53-muted" role="status">${esc(msg)}</p>` : ''}
    ${rows || '<p class="dal53-muted">Ingen brukere.</p>'}
    <p class="dal53-muted">${COLS.map(([, n, d]) => `<b>${esc(n)}</b>: ${esc(d)}`).join(' · ')}</p>`;
}
async function load(ov) {
  try { [ACC, CH] = await Promise.all([api('/api/admin/brief52/access'), api('/api/admin/glimt-char52')]); msg = ''; } catch (e) { msg = e.message; }
  render(ov);
}
export function openPeople55() {
  ACC = null; CH = null; msg = ''; busy = false;
  const ov = overlay('', 'Brukere: brief og figur');
  if (!document.getElementById('p55-css')) {
    const st = document.createElement('style'); st.id = 'p55-css';
    st.textContent = '.p55-boxes{display:flex;flex-wrap:wrap;gap:6px 16px;margin:8px 0}.p55-chk{display:inline-flex;align-items:center;gap:6px;cursor:pointer}.p55-chk input{width:16px;height:16px}'
      + '.p55-char{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}.p55-char select{margin-left:6px;border-radius:10px;padding:5px 8px;background:var(--row,#1d2738);color:inherit;border:1px solid var(--line,#232938);font:inherit}';
    document.head.appendChild(st);
  }
  render(ov);
  load(ov);
  ov.addEventListener('change', async (e) => {
    const a = e.target.closest('[data-p55-acc]'), c = e.target.closest('[data-p55-char]');
    if (!a && !c) return;
    busy = true; msg = 'Lagrer …'; render(ov);
    try {
      if (a) {
        const k = a.dataset.p55Acc, id = a.dataset.p55User, set = new Set(ACC[k] ?? []);
        if (a.checked) set.add(id); else set.delete(id);
        ACC = await api('/api/admin/brief52/access', { method: 'PUT', body: JSON.stringify({ [k]: [...set] }) });
      } else {
        await api(`/api/admin/glimt-char52/${encodeURIComponent(c.dataset.p55Char)}`, { method: 'PUT', body: JSON.stringify({ default: c.value || null }) });
        CH = await api('/api/admin/glimt-char52');
      }
      msg = 'Lagret.';
    } catch (x) { msg = x.message; }
    busy = false; render(ov);
  });
}

// Prompt 65: raden «Brief og Glimt-figur» står nå på Innstillinger → Brukere og familie (settings.js, data-p65-people) og
// åpner panelet via window.hlPeople55 (settes bare for admin). Ingen innsetting i System lenger.
async function init() {
  let me = null;
  try { me = await api('/api/me'); } catch { return; }
  if (me?.role !== 'admin') return;
  window.hlPeople55 = openPeople55;
}
if (!window.__hlPeople55) { window.__hlPeople55 = true; init(); }
