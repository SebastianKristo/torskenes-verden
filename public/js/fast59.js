// Prompt 59 (prompt 49 del 4, D4WEB): «Raskere svar» i AI-kontroll (fanen Valg). Lastes av ai-control.js og fyller [data-fast59].
// Fire brytere, hver for seg, standard på (se $S/SERVER59-API.md §2):
//   GET  /api/glimt/agent/fast → {settings, server, user, admin, labels, help, ttl, cacheEntries, warmState}
//   PUT  /api/glimt/agent/fast {scope:'user'|'server', cache?, stream?, parallel?, warm?}  (user: null = følg serveren)
//   DELETE /api/glimt/agent/fast/cache → {ok, removed}   ·   POST /api/glimt/agent/fast/warm (admin) → {ok, ms, model, already?}
// «For meg» (alle brukere): Svar-cache, Strømming, Parallelle verktøy. «For alle» (bare admin): de samme + Varm modell.
// Effektiv verdi = server OG bruker. Er en bryter av for alle, er den låst av for brukeren.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const LAB = { cache: 'Svar-cache', warm: 'Varm modell', stream: 'Strømming', parallel: 'Parallelle verktøy' };
const HELP = {
  cache: 'Gjenbruker ferske svar: vær 15 min, strømpris til neste hele time, nettsøk og nyheter 30 min. Kalender, gjøremål, finans og minne caches aldri.',
  warm: 'Holder hovedmodellen lastet: varmes opp ved oppstart og etter bildejobber, med lang keep_alive. Bakgrunnsprioritet i køen.',
  stream: 'Ordene dukker opp mens Glimt skriver, med statuslinje mens verktøyene jobber («Sjekker kalenderen …»).',
  parallel: 'Uavhengige oppslag (kalender, vær, finans, nettsøk) kjøres samtidig. Modellkall går fortsatt ett om gangen.',
};
const USER_KEYS = ['cache', 'stream', 'parallel'], SERVER_KEYS = ['cache', 'warm', 'stream', 'parallel'];
const S = { d: null, at: 0, busy: false, msg: '', missing: false, loading: null };

async function load(force = false) {
  if (!force && S.at && Date.now() - S.at < 20_000) return;
  if (S.loading) return S.loading;
  S.loading = (async () => {
    try {
      const r = await fetch('/api/glimt/agent/fast', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404 || r.status === 405) S.missing = true;
      else if (r.ok) { S.d = await r.json(); S.missing = false; }
      else S.msg = (await r.json().catch(() => ({}))).error || `Feil ${r.status}`;
    } catch (e) { S.msg = e.message; }
    S.at = Date.now(); S.loading = null;
  })();
  return S.loading;
}
async function put(body) {
  const r = await fetch('/api/glimt/agent/fast', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || (r.status === 403 ? 'Bare administrator kan endre dette for alle' : `Feil ${r.status}`));
  S.d = j; S.at = Date.now();
  return j;
}

const sw = (on) => `<span class="ac-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const ago = (iso) => { const t = Date.parse(iso ?? ''); if (!t) return ''; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'nå nettopp' : m < 60 ? `for ${m} min siden` : m < 1440 ? `for ${Math.round(m / 60)} t siden` : `for ${Math.round(m / 1440)} d siden`; };

export function fastHtml59() {
  if (S.missing) return '';
  const d = S.d;
  if (!d) return `<div class="ac-sec"><span class="ac-lab">RASKERE SVAR</span><div class="ac-card ac-list"><div class="ac-mut" style="padding:12px 0">${S.msg ? esc(S.msg) : 'Laster …'}</div></div></div>`;
  const lab = (k) => esc(d.labels?.[k] ?? LAB[k]), help = (k) => esc(d.help?.[k] && d.help[k] !== '…' ? d.help[k] : HELP[k]);
  const mine = USER_KEYS.map((k) => {
    const srv = d.server?.[k] !== false, own = d.user?.[k], on = srv && (own ?? srv);
    const sub = !srv ? 'Slått av for alle av administrator' : own == null ? `${help(k)}` : `${help(k)} · Ditt eget valg`;
    return `<button type="button" class="ac-li" data-f59-user="${k}" role="switch" aria-checked="${on}"${S.busy || !srv ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(k)}</b><span>${sub}</span></span>${sw(on)}</button>`;
  }).join('');
  const n = Number(d.cacheEntries ?? 0);
  const clear = `<div class="ac-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0"><span class="ac-col ac-grow" style="flex:1 1 200px;min-width:0"><b>Lagrede svar</b><span>${n === 1 ? '1 svar' : `${n} svar`} i din svar-cache</span></span><button type="button" class="ac-b" data-f59-clear${S.busy || !n ? ' disabled' : ''}>Tøm</button></div>`;
  let admin = '';
  if (d.admin) {
    const rows = SERVER_KEYS.map((k) => { const on = d.server?.[k] !== false; return `<button type="button" class="ac-li" data-f59-server="${k}" role="switch" aria-checked="${on}"${S.busy ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(k)}</b><span>${help(k)}</span></span>${sw(on)}</button>`; }).join('');
    const w = d.warmState;
    const wl = w ? `${esc(w.model ?? '')} · ${w.ok === false ? 'oppvarming feilet' : 'varmet opp'} ${esc(ago(w.lastAt))}${w.lastMs != null ? ` (${(w.lastMs / 1000).toFixed(1).replace('.', ',')} s)` : ''}${w.reason ? ` · ${esc(w.reason)}` : ''}${w.keepAlive ? ` · keep_alive ${esc(w.keepAlive)}` : ''}` : 'Ikke varmet opp ennå';
    admin = `<div class="ac-sec"><span class="ac-lab">RASKERE SVAR · FOR ALLE (ADMIN)</span><div class="ac-card ac-list">${rows}
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0"><span class="ac-col ac-grow" style="flex:1 1 200px;min-width:0"><b>Hovedmodellen</b><span data-f59-warm>${wl}</span></span><button type="button" class="ac-b" data-f59-warmnow${S.busy || d.server?.warm === false ? ' disabled' : ''}>Varm opp nå</button></div></div>
      <div class="ac-note">Av her slår funksjonen av for alle brukere. Hver bruker kan i tillegg slå av for seg selv over.</div></div>`;
  }
  return `<div class="ac-sec" data-f59-sec><span class="ac-lab">RASKERE SVAR · FOR MEG</span><div class="ac-card ac-list">${mine}${clear}</div>${S.msg ? `<div class="ac-note" role="status">${esc(S.msg)}</div>` : ''}</div>${admin}`;
}

const repaint = () => { for (const el of document.querySelectorAll('[data-fast59]')) el.innerHTML = fastHtml59(); };
let raf = 0;
function decorate() {
  const els = [...document.querySelectorAll('[data-fast59]:not([data-f59-done])')];
  if (!els.length) return;
  for (const el of els) { el.dataset.f59Done = '1'; el.innerHTML = fastHtml59(); }
  load().then(repaint);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };

async function act(fn) {
  S.busy = true; S.msg = ''; repaint();
  try { S.msg = (await fn()) ?? ''; } catch (err) { S.msg = err.message; }
  S.busy = false; repaint();
}
document.addEventListener('click', (e) => {
  const u = e.target.closest?.('[data-f59-user]'), s = e.target.closest?.('[data-f59-server]');
  if (u && !u.disabled) {
    const k = u.dataset.f59User, d = S.d, srv = d?.server?.[k] !== false, cur = srv && (d?.user?.[k] ?? srv), next = !cur;
    // Samme som serveren → null (følg serveren), ellers eget valg.
    act(async () => { await put({ scope: 'user', [k]: next === srv ? null : next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for deg`; });
    return;
  }
  if (s && !s.disabled) {
    const k = s.dataset.f59Server, next = !(S.d?.server?.[k] !== false);
    act(async () => { await put({ scope: 'server', [k]: next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for alle`; });
    return;
  }
  if (e.target.closest?.('[data-f59-clear]')) {
    act(async () => {
      const r = await fetch('/api/glimt/agent/fast/cache', { method: 'DELETE', credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Feil ${r.status}`);
      await load(true);
      return `Tømte ${j.removed ?? 0} lagrede svar`;
    });
    return;
  }
  if (e.target.closest?.('[data-f59-warmnow]')) {
    act(async () => {
      const r = await fetch('/api/glimt/agent/fast/warm', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || `Oppvarmingen feilet (${r.status})`);
      await load(true);
      return j.already ? `${j.model ?? 'Modellen'} var allerede lastet` : `${j.model ?? 'Modellen'} er varm (${((j.ms ?? 0) / 1000).toFixed(1).replace('.', ',')} s)`;
    });
  }
});

function boot() { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); }
if (typeof document !== 'undefined') { if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot); }
