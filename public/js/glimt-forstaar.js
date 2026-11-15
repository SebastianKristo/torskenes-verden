// Prompt 60 (prompt 49 del 3, D3WEB): «Forstår samtaler» i AI-kontroll (fanen Valg, under «Raskere svar»). Lastes av ai-control.js
// og fyller [data-understand60]. Tre brytere, hver for seg, standard på (se $S/SERVER60-API.md §5):
//   GET /api/glimt/agent/understand → {settings, server, user, admin, labels, help, ttl}
//   PUT /api/glimt/agent/understand {scope:'user'|'server', state?, entities?, choices?}  (user: null = følg serveren)
// Effektiv verdi = server OG bruker. Er en bryter av for alle, er den låst av for brukeren. Eldre server (404): ingenting vises.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const KEYS60 = ['state', 'entities', 'choices'];
const LAB = { state: 'Samtaletilstand', entities: 'Entitetsregister', choices: 'Valgknapper ved usikkerhet' };
const HELP = {
  state: 'Glimt husker forrige spørsmål i samtalen, så «og i Bergen?» og «flytt den til 11» forstås. Utløper etter 30 min i søket på Hjem og 12 t i Chat.',
  entities: 'Personer, steder, butikker, abonnementer og faste hendelser med aliaser («hytta», «jobben»), brukt i minne, kalendersøk, vær og finans.',
  choices: 'Glimt spør med konkrete valg («Mener du A eller B?») i stedet for å gjette, og forstår «den første».',
};
const S = { d: null, at: 0, busy: false, msg: '', missing: false, loading: null };

export async function loadUnderstand60(force = false) {
  if (!force && S.at && Date.now() - S.at < 20_000) return S.d;
  if (S.loading) return S.loading;
  S.loading = (async () => {
    try {
      const r = await fetch('/api/glimt/agent/understand', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404 || r.status === 405) S.missing = true;
      else if (r.ok) { S.d = await r.json(); S.missing = false; S.msg = ''; }
      else S.msg = (await r.json().catch(() => ({}))).error || `Feil ${r.status}`;
    } catch (e) { S.msg = e.message; }
    S.at = Date.now(); S.loading = null;
    return S.d;
  })();
  return S.loading;
}
async function put(body) {
  const r = await fetch('/api/glimt/agent/understand', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || (r.status === 403 ? 'Bare administrator kan endre dette for alle' : `Feil ${r.status}`));
  S.d = j; S.at = Date.now();
  return j;
}
/** Effektiv verdi for en nøkkel (server og bruker). Ukjent = på. */
export const understandOn60 = (k) => { const d = S.d; if (!d) return true; if (d.settings && typeof d.settings[k] === 'boolean') return d.settings[k]; const srv = d.server?.[k] !== false; return srv && (d.user?.[k] ?? srv); };

const sw = (on) => `<span class="ac-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
export function understandHtml60() {
  if (S.missing) return '';
  const d = S.d;
  if (!d) return `<div class="ac-sec"><span class="ac-lab">FORSTÅR SAMTALER</span><div class="ac-card ac-list"><div class="ac-mut" style="padding:12px 0">${S.msg ? esc(S.msg) : 'Laster …'}</div></div></div>`;
  const lab = (k) => esc(d.labels?.[k] ?? LAB[k]), help = (k) => esc(d.help?.[k] && d.help[k] !== '…' ? d.help[k] : HELP[k]);
  const mine = KEYS60.map((k) => {
    const srv = d.server?.[k] !== false, own = d.user?.[k], on = srv && (own ?? srv);
    const sub = !srv ? 'Slått av for alle av administrator' : own == null ? help(k) : `${help(k)} · Ditt eget valg`;
    return `<button type="button" class="ac-li" data-u60-user="${k}" role="switch" aria-checked="${on}"${S.busy || !srv ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(k)}</b><span>${sub}</span></span>${sw(on)}</button>`;
  }).join('');
  const ent = '<button type="button" class="ac-li" data-u60-ent><span class="ac-col ac-grow"><b>Se og rediger entitetsregisteret</b><span>Innstillinger → AI → Entitetsregister</span></span><span aria-hidden="true">›</span></button>';
  let admin = '';
  if (d.admin) {
    const rows = KEYS60.map((k) => { const on = d.server?.[k] !== false; return `<button type="button" class="ac-li" data-u60-server="${k}" role="switch" aria-checked="${on}"${S.busy ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(k)}</b><span>${help(k)}</span></span>${sw(on)}</button>`; }).join('');
    admin = `<div class="ac-sec"><span class="ac-lab">FORSTÅR SAMTALER · FOR ALLE (ADMIN)</span><div class="ac-card ac-list">${rows}</div><div class="ac-note">Av her slår funksjonen av for alle brukere. Hver bruker kan i tillegg slå av for seg selv over.</div></div>`;
  }
  return `<div class="ac-sec" data-u60-sec><span class="ac-lab">FORSTÅR SAMTALER · FOR MEG</span><div class="ac-card ac-list">${mine}${ent}</div>${S.msg ? `<div class="ac-note" role="status">${esc(S.msg)}</div>` : ''}</div>${admin}`;
}

const repaint = () => { for (const el of document.querySelectorAll('[data-understand60]')) el.innerHTML = understandHtml60(); };
let raf = 0;
function decorate() {
  const els = [...document.querySelectorAll('[data-understand60]:not([data-u60-done])')];
  if (!els.length) return;
  for (const el of els) { el.dataset.u60Done = '1'; el.innerHTML = understandHtml60(); }
  loadUnderstand60().then(repaint);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };

async function act(fn) {
  S.busy = true; S.msg = ''; repaint();
  try { S.msg = (await fn()) ?? ''; } catch (err) { S.msg = err.message; }
  S.busy = false; repaint();
  document.dispatchEvent(new CustomEvent('understand60:change', { detail: S.d }));
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const u = e.target.closest?.('[data-u60-user]'), s = e.target.closest?.('[data-u60-server]');
    if (u && !u.disabled) {
      const k = u.dataset.u60User, d = S.d, srv = d?.server?.[k] !== false, cur = srv && (d?.user?.[k] ?? srv), next = !cur;
      act(async () => { await put({ scope: 'user', [k]: next === srv ? null : next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for deg`; });
      return;
    }
    if (s && !s.disabled) {
      const k = s.dataset.u60Server, next = !(S.d?.server?.[k] !== false);
      act(async () => { await put({ scope: 'server', [k]: next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for alle`; });
      return;
    }
    if (e.target.closest?.('[data-u60-ent]')) {
      const el = document.querySelector('[data-ent60]');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      import('./settings.js').then((m) => m.openSettings('ai')).catch(() => { location.hash = '#/innstillinger/ai'; });
    }
  });
  const boot = () => { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
}
