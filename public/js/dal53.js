// Prompt 53 (DAL53): web/PWA-delen av de lokale modellene.
//  - «Om / Lisenser» (alle): #/om eller #/lisenser åpner siden med krediteringen (Desert Ant Labs, Fermion Research m.fl.).
//    Innstillinger → Konto får raden «Om / Lisenser».
//  - Admin: Innstillinger → System får kortet «Lokale modeller» med helse per modell og «Forhåndslast» (GET/POST /api/admin/dal53/*).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
async function api(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opt, headers: { ...(opt.body ? { 'content-type': 'application/json' } : {}), ...(opt.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Feil ${r.status}`), { status: r.status });
  return j;
}

const CSS = `
.dal53-ov{position:fixed;inset:0;z-index:2147481400;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}
.dal53-panel{position:relative;width:min(760px,100%);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;border-radius:24px;background:var(--page,#1a1d25);color:var(--text,#eef0f4);border:1px solid var(--line,#232938);padding:24px;font:400 14px/1.5 Outfit,Geist,system-ui,sans-serif}
.dal53-panel h2{margin:0 0 4px;font:600 20px/1.25 Outfit,Geist,system-ui,sans-serif}.dal53-panel h3{margin:20px 0 6px;font:600 15px Outfit,Geist,system-ui,sans-serif}
.dal53-panel p{margin:6px 0}.dal53-panel a{color:var(--blue,#a8d4fb)}.dal53-muted{color:var(--muted,#8a93a6);font-size:13px}
.dal53-x{position:absolute;top:14px;right:14px;border:0;background:var(--row,#1d2738);color:inherit;border-radius:999px;width:34px;height:34px;font-size:18px;cursor:pointer}
.dal53-btn{border:0;border-radius:999px;padding:8px 16px;font:600 13px Outfit,Geist,system-ui,sans-serif;cursor:pointer;background:var(--row,#1d2738);color:var(--text,#eef0f4)}
.dal53-btn.pri{background:var(--blue,#a8d4fb);color:#0b1220}.dal53-btn[disabled]{opacity:.5;cursor:default}
.dal53-btn:focus-visible,.dal53-x:focus-visible{outline:2px solid var(--blue,#a8d4fb);outline-offset:2px}
.dal53-row{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line,#232938)}.dal53-row:first-of-type{border-top:0}
.dal53-row .grow{flex:1;min-width:0}.dal53-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;background:var(--row,#1d2738);white-space:nowrap}
.dal53-pill.ok{background:#1F3A2F;color:var(--green,#8fe0b0)}.dal53-pill.warn{background:#3a321f;color:#f3d38b}.dal53-pill.err{background:#3a1f22;color:var(--red,#f59a8f)}
.dal53-lic li{margin:0 0 10px}.dal53-mono{font:500 12px/1.4 var(--mono,'JetBrains Mono',monospace);word-break:break-all}
@media (max-width:600px){.dal53-panel{padding:20px 16px}.dal53-row{flex-wrap:wrap}}
html[data-theme="lys"] .dal53-panel,html[data-hl="cur"] .dal53-panel{background:#fff;color:#11141b;border-color:#e3e5ea}
`;
function css() { if (!document.getElementById('dal53-css')) { const s = document.createElement('style'); s.id = 'dal53-css'; s.textContent = CSS; document.head.appendChild(s); } }

function overlay(html, label) {
  css();
  document.querySelector('.dal53-ov')?.remove();
  const ov = document.createElement('div');
  ov.className = 'dal53-ov';
  ov.innerHTML = `<div class="dal53-panel" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button type="button" class="dal53-x" aria-label="Lukk">×</button><div class="dal53-body">${html}</div></div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); if (/^#\/(om|lisenser)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.dal53-x')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  ov.querySelector('.dal53-x').focus();
  return ov;
}

/* ---------------- Om / Lisenser ---------------- */

const LICENSES53 = [
  { name: 'Desert Ant Labs', what: 'Eye, Redact, Gist, Tongue, Emo, Moderator, Clear og Voz – lokale modeller for bilder, personvern, nyhetsemner, språk, emoji, barnevern og tale.',
    lic: 'Desert Ant Labs Source-Available License 1.0', url: 'https://license.desertant.com/1.0', credit: 'Inneholder modeller fra Desert Ant Labs (license.desertant.com)' },
  { name: 'Fermion Research – Phonon-2 / Phonon-2.5', what: 'Tale til tekst på Mac mini-en.', lic: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/', credit: 'Phonon © Fermion Research' },
  { name: 'Fermion Research – Neutrino-1 8B', what: 'Valgfri tekstmotor på Mac mini-en (bygger på Qwen3-8B).', lic: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0', credit: 'Neutrino-1 © Fermion Research (Qwen3 © Alibaba Cloud)' },
];
export function openAbout53() {
  overlay(`<h2>Om / Lisenser</h2>
    <p class="dal53-muted">Homelab bruker modeller som kjører lokalt i huset. Tekst, bilder og lyd sendes ikke ut for å bli behandlet.</p>
    <h3>Tredjepartsmodeller</h3>
    <ul class="dal53-lic">${LICENSES53.map((l) => `<li><b>${esc(l.name)}</b><br>${esc(l.what)}<br><span class="dal53-muted">${esc(l.credit)} · <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.lic)}</a></span></li>`).join('')}</ul>
    <p class="dal53-muted">Desert Ant Labs-modellene er gratis under 100 000 aktive enheter per plattform per modell. Modellene, svarene og loggene deres brukes ikke til å trene en konkurrerende modell.
    Hele lista står i <span class="dal53-mono">docs/lisenser-tredjepart.md</span>.</p>`, 'Om / Lisenser');
}
window.hlAbout53 = openAbout53;
const hashOpen = () => { if (/^#\/(om|lisenser)$/.test(location.hash)) openAbout53(); };
addEventListener('hashchange', hashOpen);

/* ---------------- Admin: lokale modeller ---------------- */

const STATUS = { ready: ['Klar', 'ok'], loading: ['Lastes …', 'warn'], idle: ['Ikke lastet', ''], error: ['Feil', 'err'], missing: ['Mangler pakken', 'err'] };
let H = null, msg = '', poll = null;
const kb = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} GB` : n > 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.round((n || 0) / 1e3)} kB`);
function renderModels(ov) {
  const body = ov.querySelector('.dal53-body');
  if (!H) { body.innerHTML = '<h2>Lokale modeller</h2><p class="dal53-muted">Henter …</p>'; return; }
  const any = H.models.some((m) => m.status === 'loading');
  body.innerHTML = `<h2>Lokale modeller</h2>
    <p class="dal53-muted">Desert Ant Labs-modellene kjører på serveren. Vektene lastes ned fra Hugging Face første gang til <span class="dal53-mono">${esc(H.cache_dir)}</span> (${esc(kb(H.cache_bytes))} nå). Til en modell er klar, brukes dagens oppførsel. Flaggene slås av under Kvalitet → Feature flags.</p>
    ${H.native_ok ? '' : `<p class="dal53-pill err">Plattformen ${esc(H.platform)} har ingen native kjerne – bare Tongue og Voz kan kjøre.</p>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><button type="button" class="dal53-btn pri" data-dal53-preload="">Forhåndslast alle</button><button type="button" class="dal53-btn" data-dal53-refresh>Oppdater</button></div>
    ${msg ? `<p class="dal53-muted" role="status">${esc(msg)}</p>` : ''}
    ${H.models.map((m) => { const [t, cls] = STATUS[m.status] ?? [m.status, '']; return `<div class="dal53-row"><div class="grow"><b>${esc(m.name)}</b> <span class="dal53-pill ${cls}">${esc(t)}</span> <span class="dal53-pill ${m.flag_on ? 'ok' : ''}">${m.flag_on ? 'flagg på' : 'flagg av'}</span>
      <div class="dal53-muted">${esc(m.purpose)}</div>
      <div class="dal53-muted dal53-mono">${esc(m.package)}${m.version ? `@${esc(m.version)}` : ''}${m.load_ms != null ? ` · lastet på ${(m.load_ms / 1000).toFixed(1).replace('.', ',')} s` : ''} · brukt ${m.uses} · reserve ${m.fallbacks}</div>
      ${m.error ? `<div class="dal53-muted" style="color:var(--red,#f59a8f)">${esc(m.error)}</div>` : ''}</div>
      ${m.status !== 'ready' && m.status !== 'missing' ? `<button type="button" class="dal53-btn" data-dal53-preload="${esc(m.id)}" ${m.status === 'loading' ? 'disabled' : ''}>Last</button>` : ''}</div>`; }).join('')}
    <h3>Tale til tekst</h3>
    ${(H.asr?.backends ?? []).map((b) => `<div class="dal53-row"><div class="grow"><b>${esc(b.label)}</b> <span class="dal53-pill ${b.available ? 'ok' : ''}">${b.available ? 'klar' : 'ikke klar'}</span>
      <div class="dal53-muted">${b.languages ? `Språk: ${esc(b.languages.join(', '))}` : 'Alle språk'}${b.languages && !b.languages.includes('no') ? ' · ikke norsk' : ''}</div></div></div>`).join('') || '<p class="dal53-muted">Ingen backends.</p>'}
    <p class="dal53-muted">${esc(H.credit)} · <a href="#/om">Om / Lisenser</a></p>`;
  clearTimeout(poll);
  if (any && document.body.contains(ov)) poll = setTimeout(() => load(ov), 3000);
}
async function load(ov) {
  try { H = await api('/api/admin/dal53/health'); } catch (e) { msg = e.message; }
  renderModels(ov);
}
export function openModels53() {
  H = null; msg = '';
  const ov = overlay('', 'Lokale modeller');
  renderModels(ov);
  load(ov);
  ov.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-dal53-preload]');
    if (p) {
      const id = p.dataset.dal53Preload;
      try { const r = await api('/api/admin/dal53/preload', { method: 'POST', body: JSON.stringify(id ? { models: [id] } : {}) }); msg = r.started.length ? `Laster ${r.started.join(', ')} i bakgrunnen …` : `Ingenting å laste${r.skipped.length ? ` (${r.skipped.map((s) => `${s.id}: ${s.reason}`).join(' · ')})` : ''}`; }
      catch (x) { msg = x.message; }
      return load(ov);
    }
    if (e.target.closest('[data-dal53-refresh]')) load(ov);
  });
}

/* ---------------- Innstillinger ---------------- */

function inject(isAdmin) {
  const konto = document.querySelector('#settings .set-body[data-key="konto|null|"] .set-inner');
  if (konto && !konto.querySelector('[data-dal53-about]')) {
    const sec = document.createElement('section');
    sec.className = 'sg'; sec.dataset.dal53About = '1';
    sec.innerHTML = '<h3 class="sg-t">Om</h3><div class="sg-box"><button type="button" class="sg-row"><span class="sg-txt"><b>Om / Lisenser</b><span>Modeller og programvare fra andre, og lisensene deres</span></span><span class="sg-btn2">Vis</span></button></div>';
    sec.addEventListener('click', (e) => { if (e.target.closest('button')) { e.stopPropagation(); openAbout53(); } });
    konto.appendChild(sec);
  }
  if (!isAdmin) return;
  const sys = document.querySelector('#settings .set-body[data-key^="system|null"] .set-inner, #settings .set-body[data-key^="system||"] .set-inner');
  if (sys && !sys.querySelector('[data-dal53-sec]')) {
    const sec = document.createElement('section');
    sec.className = 'sg'; sec.dataset.dal53Sec = '1';
    sec.innerHTML = '<h3 class="sg-t">Lokale modeller</h3><div class="sg-box"><button type="button" class="sg-row"><span class="sg-txt"><b>Desert Ant Labs-modellene</b><span>Helse per modell og forhåndslasting (Eye, Redact, Gist, Tongue, Emo, Moderator, Clear, Voz)</span></span><span class="sg-btn2">Åpne</span></button></div>';
    sec.addEventListener('click', (e) => { if (e.target.closest('button')) { e.stopPropagation(); openModels53(); } });
    sys.appendChild(sec);
  }
}
async function init() {
  hashOpen();
  let me = null;
  try { me = await api('/api/me'); } catch { /* ikke innlogget */ }
  const admin = me?.role === 'admin';
  const watch = () => { const m = document.getElementById('settings'); if (!m) return false; new MutationObserver(() => inject(admin)).observe(m, { childList: true, subtree: true }); inject(admin); return true; };
  if (!watch()) { const t = setInterval(() => { if (watch()) clearInterval(t); }, 1000); setTimeout(() => clearInterval(t), 30_000); }
}
if (!window.__hlDal53) { window.__hlDal53 = true; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
