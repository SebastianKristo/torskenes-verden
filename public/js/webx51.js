// Prompt 51 (WEBX51): felles søk (⌘K / Ctrl+K på web, dra ned eller #/sok51 i PWA-en), tema per bruker synket mellom enheter
// (med automatisk tema etter sola/klokka) og offline-kø for skrivinger (IndexedDB, «siste skriving vinner» med varsel ved konflikt).
// Selvstendig modul: lastes i app.html og finans/index.html. API: /api/search51, /api/me/theme51, X-Offline51-* (SERVER51-API.md, WEBX51).
const ON_FINANS = location.pathname.startsWith('/finans');
const F0 = window.fetch.bind(window);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat modus */ } } };
let toastFn = null;
async function toast(text, opts = {}) {
  try { if (!toastFn) toastFn = (await import('./toast.js')).toast; toastFn(text, { ms: 3800, ...opts }); } catch { /* */ }
}

/* =====================================================================================================================
   Stil (papir, lys og mørk)
   ===================================================================================================================== */

const CSS = `
.x51{--x51-bg:#fbf9f4;--x51-ink:#17150f;--x51-mute:#5d5a52;--x51-line:rgba(23,21,15,.14);--x51-sel:#efe9dc;--x51-acc:#7a3b2a;--x51-mark:#f3dfa6;--x51-scrim:rgba(23,21,15,.38);
  position:fixed;inset:0;z-index:2147481000;display:flex;align-items:flex-start;justify-content:center;padding:10vh 16px 16px;font:400 15px/1.4 Manrope,system-ui,sans-serif;color:var(--x51-ink)}
html[data-mode="dark"] .x51,html[data-theme="mork"] .x51,html[data-theme="glod"] .x51,html[data-hl="cur"] .x51,html[data-theme51-eff="dark"] .x51{--x51-bg:#1d1b17;--x51-ink:#ece9e2;--x51-mute:#b4afa4;--x51-line:rgba(236,233,226,.16);--x51-sel:#2c2924;--x51-acc:#f0a58f;--x51-mark:#5b4a1c;--x51-scrim:rgba(0,0,0,.55)}
.x51[hidden]{display:none}
.x51-back{position:absolute;inset:0;background:var(--x51-scrim)}
.x51-box{position:relative;width:min(680px,100%);max-height:76vh;display:flex;flex-direction:column;background:var(--x51-bg);border:1px solid var(--x51-line);border-radius:16px;box-shadow:0 30px 80px -30px rgba(0,0,0,.55);overflow:hidden}
.x51-top{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--x51-line)}
.x51-top svg{flex:none;opacity:.7}
.x51-in{flex:1;min-width:0;border:0;background:transparent;color:inherit;font:500 18px/1.3 Manrope,system-ui,sans-serif;padding:8px 0;outline:none}
.x51-in::placeholder{color:var(--x51-mute)}
.x51-kbd{font:500 12px "IBM Plex Mono",monospace;color:var(--x51-mute);border:1px solid var(--x51-line);border-radius:6px;padding:2px 6px}
.x51-x{border:0;background:transparent;color:inherit;font:600 15px Manrope,system-ui,sans-serif;min-width:44px;min-height:44px;cursor:pointer}
.x51-list{overflow:auto;padding:6px 0 10px;overscroll-behavior:contain}
.x51-g{padding:10px 18px 4px;font:700 11px/1.2 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--x51-mute)}
.x51-o{display:flex;align-items:center;gap:12px;padding:9px 18px;cursor:pointer;min-height:48px;box-sizing:border-box}
.x51-o[aria-selected="true"]{background:var(--x51-sel)}
.x51-i{flex:none;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--x51-sel);color:var(--x51-acc);font:700 14px/1 system-ui}
.x51-o[aria-selected="true"] .x51-i{background:var(--x51-bg)}
.x51-t{flex:1;min-width:0}
.x51-t b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.x51-t b.x51-done{text-decoration:line-through;opacity:.7}
.x51-t span{display:block;font-size:13px;color:var(--x51-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.x51-t mark{background:var(--x51-mark);color:inherit;border-radius:3px;padding:0 1px}
.x51-amt{flex:none;font:500 13px "IBM Plex Mono",monospace;color:var(--x51-mute)}
.x51-acts{flex:none;display:flex;gap:6px}
.x51-a{border:1px solid var(--x51-line);background:var(--x51-bg);color:inherit;border-radius:999px;padding:6px 12px;font:600 13px Manrope,system-ui,sans-serif;cursor:pointer;min-height:36px}
.x51-a:focus-visible,.x51-o:focus-visible,.x51-x:focus-visible{outline:2px solid var(--x51-acc);outline-offset:2px}
.x51-empty{padding:26px 18px;color:var(--x51-mute);text-align:center}
.x51-foot{display:flex;gap:14px;flex-wrap:wrap;padding:8px 16px;border-top:1px solid var(--x51-line);font:500 12px "IBM Plex Mono",monospace;color:var(--x51-mute)}
.x51-recent{display:flex;flex-wrap:wrap;gap:6px;padding:4px 18px 8px}
.x51-pull{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 6px);transform:translate(-50%,-60px);z-index:2147480000;background:#17150f;color:#fff;border-radius:999px;padding:8px 14px;font:600 13px Manrope,system-ui,sans-serif;transition:transform .12s ease;pointer-events:none}
.x51-th{display:grid;gap:8px;padding:12px 18px 16px}
.x51-th label{display:flex;gap:10px;align-items:center;min-height:44px;cursor:pointer}
.x51-th input[type=radio]{width:20px;height:20px;accent-color:var(--x51-acc)}
.x51-th input[type=time]{font:500 15px "IBM Plex Mono",monospace;padding:6px 8px;border:1px solid var(--x51-line);border-radius:8px;background:var(--x51-bg);color:inherit}
.x51-th small{color:var(--x51-mute)}
@media (max-width:640px){.x51{padding:0}.x51-box{width:100%;max-height:none;height:100%;border-radius:0;border:0}.x51-o .x51-acts .x51-a:not(:first-child){display:none}.x51-foot{display:none}}
@media (prefers-reduced-motion:reduce){.x51-pull{transition:none}}`;
function injectCss() { if (document.getElementById('x51-css')) return; const s = document.createElement('style'); s.id = 'x51-css'; s.textContent = CSS; document.head.appendChild(s); }

/* =====================================================================================================================
   Søkepalett
   ===================================================================================================================== */

const ICON = { check: '✓', cart: '🛒', list: '☰', calendar: '▦', car: '🚗', receipt: '🧾', card: '▭', pin: '⌖', person: '☺', box: '▣', book: '❑', chat: '✎', cake: '✱', home: '⌂', gear: '⚙', bolt: '↯' };
const P = { el: null, input: null, list: null, results: [], groups: [], sel: 0, seq: 0, timer: 0, q: '', lastFocus: null, open: false };

function build() {
  if (P.el) return;
  injectCss();
  const el = document.createElement('div');
  el.className = 'x51'; el.hidden = true;
  el.innerHTML = `<div class="x51-back" data-x51-close></div>
  <div class="x51-box" role="dialog" aria-modal="true" aria-label="Søk i alt">
    <div class="x51-top">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input class="x51-in" type="search" role="combobox" aria-expanded="true" aria-controls="x51-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" enterkeyhint="go"
        aria-label="Søk i gjøremål, kalender, kvitteringer, steder og mer" placeholder="Søk i alt – gjøremål, kvitteringer, steder …">
      <span class="x51-kbd" aria-hidden="true">Esc</span>
      <button type="button" class="x51-x" data-x51-close aria-label="Lukk søket">Lukk</button>
    </div>
    <div class="x51-list" id="x51-list" role="listbox" aria-label="Treff"></div>
    <div class="x51-foot" aria-hidden="true"><span>↑↓ velg</span><span>↵ åpne</span><span>⌥↵ neste handling</span><span>Esc lukk</span></div>
  </div>`;
  document.body.appendChild(el);
  P.el = el; P.input = el.querySelector('.x51-in'); P.list = el.querySelector('.x51-list');
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-x51-close]')) { close(); return; }
    const a = e.target.closest('[data-x51-act]');
    const o = e.target.closest('[data-x51-i]');
    if (a) { e.stopPropagation(); run(Number(a.dataset.x51I), Number(a.dataset.x51Act)); return; }
    if (o) run(Number(o.dataset.x51I), 0);
    const rq = e.target.closest('[data-x51-recent]');
    if (rq) { P.input.value = rq.dataset.x51Recent; query(); }
  });
  P.input.addEventListener('input', () => { clearTimeout(P.timer); P.timer = setTimeout(query, 110); });
  el.addEventListener('keydown', onKey);
}
function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); if (document.querySelector('.x51-th')) { query(); return; } close(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!P.results.length) return;
    P.sel = (P.sel + (e.key === 'ArrowDown' ? 1 : -1) + P.results.length) % P.results.length;
    paintSel(); return;
  }
  if (e.key === 'Enter' && e.target === P.input) { e.preventDefault(); if (P.results[P.sel]) run(P.sel, e.altKey ? 1 : 0); return; }
  if (e.key === 'Tab') {
    // Fokusfelle: hold Tab inne i dialogen.
    const f = [...P.el.querySelectorAll('input,button,[tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
}
function paintSel() {
  P.list.querySelectorAll('.x51-o').forEach((o) => {
    const on = Number(o.dataset.x51I) === P.sel;
    o.setAttribute('aria-selected', on ? 'true' : 'false');
    o.querySelector('.x51-acts')?.toggleAttribute('hidden', !on && matchMedia('(hover:hover)').matches);
    if (on) { P.input.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); }
  });
}
function hiTitle(r) {
  const t = String(r.title ?? ''); const m = Array.isArray(r.match) ? r.match : [];
  if (!m.length) return esc(t);
  let out = '', at = 0;
  for (const [a, b] of m) { if (a < at || a >= t.length) continue; out += esc(t.slice(at, a)) + `<mark>${esc(t.slice(a, b))}</mark>`; at = b; }
  return out + esc(t.slice(at));
}
function render(data) {
  P.results = []; P.sel = 0;
  const byType = new Map();
  for (const r of data.results ?? []) { if (!byType.has(r.type)) byType.set(r.type, []); byType.get(r.type).push(r); }
  const order = (data.groups ?? []).map((g) => g.type).filter((t) => byType.has(t));
  let html = '';
  if (!data.q && data.recent?.length) html += `<div class="x51-g">Nylige søk</div><div class="x51-recent">${data.recent.map((x) => `<button type="button" class="x51-a" data-x51-recent="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  for (const type of order) {
    const rows = byType.get(type);
    html += `<div class="x51-g" role="presentation">${esc(rows[0].typeLabel)}</div>`;
    for (const r of rows) {
      const i = P.results.push(r) - 1;
      const acts = (r.actions ?? []).slice(0, 3).map((a, j) => `<button type="button" class="x51-a" tabindex="-1" data-x51-i="${i}" data-x51-act="${j}"${a.destructive ? ' data-danger' : ''}>${esc(a.label)}</button>`).join('');
      html += `<div class="x51-o" role="option" id="x51-o-${i}" data-x51-i="${i}" aria-selected="false">
        <span class="x51-i" aria-hidden="true">${ICON[r.icon] ?? '•'}</span>
        <span class="x51-t"><b${r.done ? ' class="x51-done"' : ''}>${hiTitle(r)}</b>${r.subtitle ? `<span>${esc(r.subtitle)}</span>` : ''}</span>
        ${r.amountText ? `<span class="x51-amt">${esc(r.amountText)}</span>` : ''}
        <span class="x51-acts">${acts}</span></div>`;
    }
  }
  if (!P.results.length) html += `<div class="x51-empty">${data.q ? `Ingen treff på «${esc(data.q)}»` : 'Skriv for å søke'}</div>`;
  P.list.innerHTML = html;
  P.input.setAttribute('aria-expanded', P.results.length ? 'true' : 'false');
  paintSel();
}
async function query() {
  const q = P.input.value.trim();
  const seq = ++P.seq;
  P.q = q;
  try {
    const r = await fetch(`/api/search51?q=${encodeURIComponent(q)}&limit=30`, { credentials: 'same-origin' });
    if (seq !== P.seq) return;
    if (r.status === 401) { P.list.innerHTML = '<div class="x51-empty">Logg inn for å søke</div>'; return; }
    render(await r.json());
  } catch {
    if (seq === P.seq) P.list.innerHTML = `<div class="x51-empty">${navigator.onLine === false ? 'Uten nett – søket trenger serveren' : 'Søket svarte ikke'}</div>`;
  }
}
function go(url) {
  if (!url) return;
  const u = new URL(url, location.href);
  if (u.origin !== location.origin) return;
  close();
  if (u.pathname === location.pathname && u.hash) { if (location.hash !== u.hash) location.hash = u.hash; else window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
  location.href = u.pathname + u.search + u.hash;
}
async function run(i, j) {
  const r = P.results[i]; const a = r?.actions?.[j] ?? r?.actions?.[0];
  if (!r) return;
  if (P.q.length >= 2) fetch('/api/search51/recent', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: P.q }) }).catch(() => {});
  if (a?.id === 'theme') { themePanel(); return; }
  if (a?.id === 'invite') { invitePanel(); return; }
  if (!a || a.kind === 'open') { go(a?.url ?? r.link?.web); return; }
  if (a.kind === 'copy') { try { await navigator.clipboard.writeText(String(a.value ?? '')); toast('Kopiert'); } catch { toast('Kunne ikke kopiere'); } return; }
  if (a.kind === 'http') {
    if (a.confirm && !confirm(a.confirm)) return;
    try {
      const res = await fetch(a.url, { method: a.method || 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: a.body ? JSON.stringify(a.body) : undefined });
      const j2 = await res.clone().json().catch(() => ({}));
      if (j2?.queued) { /* offline-køen har allerede vist beskjed */ } else if (!res.ok) { toast(j2?.error || 'Det gikk ikke'); return; } else toast(`${a.label}: ${r.title}`);
      if (a.url === '/api/me/theme51' && res.ok && !j2?.queued) applyTheme(j2);
      window.dispatchEvent(new CustomEvent('webx51:changed', { detail: { url: a.url } }));
      query();
    } catch { toast('Det gikk ikke'); }
  }
}
export function openSearch(q = '') {
  build();
  if (P.open) { P.input.focus(); return; }
  P.lastFocus = document.activeElement;
  P.el.hidden = false; P.open = true;
  P.input.value = q;
  document.documentElement.style.overflow = 'hidden';
  setTimeout(() => P.input.focus({ preventScroll: true }), 10);
  query();
}
function close() {
  if (!P.open) return;
  P.el.hidden = true; P.open = false;
  document.documentElement.style.overflow = '';
  if (/^#\/sok51/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + (ON_FINANS ? '#/hjem' : '#/dash'));
  try { P.lastFocus?.focus?.({ preventScroll: true }); } catch { /* */ }
}

// På window (etter document-lytterne): sider som selv bruker ⌘K eller «/» (Kalender → Glimt, Gjøremål, Innstillinger, FinansHub)
// har allerede kalt preventDefault, og da får de beholde snarveien.
addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); P.open ? close() : openSearch(); }
  else if (e.key === '/' && !P.open && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') && !document.activeElement?.isContentEditable) { e.preventDefault(); openSearch(); }
});
const hashOpen = () => {
  if (/^#\/inviter51/.test(location.hash)) { history.replaceState(null, '', location.pathname + location.search + (ON_FINANS ? '#/hjem' : '#/dash')); openInvitePanel51(); return; }
  if (/^#\/sok51/.test(location.hash)) openSearch(decodeURIComponent((location.hash.split('?q=')[1] ?? '').split('&')[0])); };
addEventListener('hashchange', hashOpen);

/* ---------------- PWA: dra ned øverst for å søke ---------------- */

function scrollParentAtTop(t) {
  for (let n = t; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 2) return n.scrollTop <= 0;
  }
  return (document.scrollingElement?.scrollTop ?? 0) <= 0;
}
if (matchMedia('(pointer:coarse)').matches) {
  let y0 = null, x0 = 0, ok = false, pull = null;
  const hint = (d) => {
    if (!pull) { injectCss(); pull = document.createElement('div'); pull.className = 'x51-pull'; pull.setAttribute('aria-hidden', 'true'); document.body.appendChild(pull); }
    pull.textContent = d > 90 ? 'Slipp for å søke' : 'Dra ned for å søke';
    pull.style.transform = `translate(-50%,${Math.min(0, -60 + d * 0.7)}px)`;
  };
  addEventListener('touchstart', (e) => {
    if (P.open || e.touches.length !== 1 || e.target.closest?.('input,textarea,select,[contenteditable],.leaflet-container,[data-no-pull51]')) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; ok = y0 < innerHeight * 0.5 && scrollParentAtTop(e.target);
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null || !ok) return;
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (dx > 40 && dx > dy) { ok = false; if (pull) pull.style.transform = 'translate(-50%,-60px)'; return; }
    if (dy > 20) hint(dy);
  }, { passive: true });
  addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = (e.changedTouches[0]?.clientY ?? y0) - y0;
    if (pull) pull.style.transform = 'translate(-50%,-60px)';
    if (ok && dy > 90) openSearch();
    y0 = null;
  }, { passive: true });
}

/* =====================================================================================================================
   Tema per bruker (GET/PUT /api/me/theme51)
   ===================================================================================================================== */

const T = { cur: null, applied: null, applying: false, timer: 0 };
const mq = (() => { try { return matchMedia('(prefers-color-scheme: dark)'); } catch { return null; } })();
const effOf = (t) => (t.mode === 'system' ? (mq?.matches ? 'dark' : 'light') : t.effective || 'light');
export function applyTheme(t) {
  if (!t || !t.mode) return;
  T.cur = t;
  const h = document.documentElement;
  const eff = effOf(t);
  h.dataset.theme51 = t.mode;
  h.dataset.theme51Eff = eff;
  T.applying = true;
  try {
    if (ON_FINANS) {
      // FinansHub-PWA-en: papirmodus (auto/lys/mork) leses ved neste tegning.
      let p = {}; try { p = JSON.parse(ls.get('fh_mprefs') || '{}') ?? {}; } catch { p = {}; }
      const pm = t.mode === 'system' ? 'auto' : eff === 'dark' ? 'mork' : 'lys';
      if (p.paperMode !== pm) { p.paperMode = pm; ls.set('fh_mprefs', JSON.stringify(p)); }
    } else if (!h.hasAttribute('data-kal-app')) {
      const wm = t.mode === 'system' ? 'system' : eff;
      T.applied = wm;
      ls.set('papir_web_mode', wm);
      const was = h.getAttribute('data-mode');
      h.setAttribute('data-mode', eff); h.setAttribute('data-web-mode', wm);
      if (h.dataset.hl === '2c') document.querySelector('meta[name="theme-color"]')?.setAttribute('content', eff === 'dark' ? '#16140f' : '#f3efe6');
      if (was !== eff) window.dispatchEvent(new CustomEvent('papir-web-mode', { detail: { mode: wm, eff, source: 'theme51' } }));
    }
  } finally { T.applying = false; }
  clearTimeout(T.timer);
  if (t.mode === 'auto' && t.next?.at) {
    const ms = Math.max(5_000, Math.min(6 * 3600_000, Date.parse(t.next.at) - Date.now() + 3_000));
    T.timer = setTimeout(syncTheme, ms);
  }
}
async function syncTheme() {
  try {
    const r = await F0('/api/me/theme51', { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) applyTheme(await r.json());
  } catch { /* frakoblet: forrige valg gjelder */ }
}
async function putTheme(patch) {
  const r = await fetch('/api/me/theme51', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, updatedAt: Date.now() }) });
  const j = await r.json().catch(() => null);
  if (j?.mode) applyTheme(j);
  else if (r.status === 409 && j?.theme) applyTheme(j.theme);
  return j;
}
// Brukeren byttet lys/mørk/system i Innstillinger (mode44.js): lagres også her, så alle enheter får det.
addEventListener('papir-web-mode', (e) => {
  const m = e.detail?.mode;
  if (T.applying || e.detail?.source === 'theme51' || !['light', 'dark', 'system'].includes(m) || m === T.applied) return;
  T.applied = m;
  putTheme({ mode: m }).catch(() => {});
});
mq?.addEventListener?.('change', () => { if (T.cur?.mode === 'system') applyTheme(T.cur); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncTheme(); });

function themePanel() {
  build();
  const t = T.cur ?? { mode: 'system', auto: { by: 'sun', lightAt: '07:00', darkAt: '21:00' } };
  const opt = (v, label, sub) => `<label><input type="radio" name="x51m" value="${v}"${t.mode === v ? ' checked' : ''}><span><b>${label}</b><br><small>${sub}</small></span></label>`;
  const nxt = t.mode === 'auto' && t.next?.at ? `Neste bytte: ${t.next.mode === 'dark' ? 'mørkt' : 'lyst'} kl. ${new Date(t.next.at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : '';
  P.list.innerHTML = `<div class="x51-g">Tema – følger deg på alle enheter</div><div class="x51-th" role="radiogroup" aria-label="Tema">
    ${opt('light', 'Lys', 'Lyst papir')}${opt('dark', 'Mørk', 'Mørkt papir, lys tekst')}${opt('system', 'Følg systemet', 'Bytter med enheten')}
    ${opt('auto', 'Automatisk', t.auto?.by === 'time' ? 'Etter klokka' : 'Etter soloppgang og solnedgang der du er')}
    <div data-x51-auto ${t.mode === 'auto' ? '' : 'hidden'}>
      <label><input type="radio" name="x51b" value="sun"${t.auto?.by !== 'time' ? ' checked' : ''}> Sola (posisjon fra Familie, ellers Oslo)</label>
      <label><input type="radio" name="x51b" value="time"${t.auto?.by === 'time' ? ' checked' : ''}> Klokka: lyst fra <input type="time" data-x51-l value="${esc(t.auto?.lightAt ?? '07:00')}" aria-label="Lyst fra"> mørkt fra <input type="time" data-x51-d value="${esc(t.auto?.darkAt ?? '21:00')}" aria-label="Mørkt fra"></label>
      <small data-x51-next>${esc(nxt)}</small>
    </div></div>`;
  const save = async () => {
    const mode = P.list.querySelector('input[name=x51m]:checked')?.value;
    const by = P.list.querySelector('input[name=x51b]:checked')?.value ?? 'sun';
    P.list.querySelector('[data-x51-auto]').hidden = mode !== 'auto';
    const j = await putTheme(mode === 'auto' ? { mode, auto: { by, lightAt: P.list.querySelector('[data-x51-l]').value || '07:00', darkAt: P.list.querySelector('[data-x51-d]').value || '21:00' } } : { mode }).catch(() => null);
    const n = P.list.querySelector('[data-x51-next]');
    if (n) n.textContent = j?.error ? j.error : j?.next?.at ? `Neste bytte: ${j.next.mode === 'dark' ? 'mørkt' : 'lyst'} kl. ${new Date(j.next.at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : '';
  };
  P.list.querySelectorAll('input').forEach((x) => x.addEventListener('change', save));
  P.list.querySelector('input[name=x51m]:checked')?.focus();
}
export const openThemePanel51 = () => { openSearch(''); setTimeout(themePanel, 60); };

/* ---------------- Invitasjon (bare admin) ---------------- */

async function invitePanel(created = null) {
  build();
  P.seq++; // et søk som er på vei skal ikke tegne over skjemaet
  let list = [];
  try { const r = await fetch('/api/onboard51/invites', { credentials: 'same-origin' }); if (r.status === 403) { P.list.innerHTML = '<div class="x51-empty">Bare en administrator kan invitere.</div>'; return; } list = (await r.json()).invites ?? []; } catch { /* */ }
  const ST = { open: 'Åpen', used: 'Brukt', expired: 'Utløpt', revoked: 'Trukket tilbake' };
  P.list.innerHTML = `<div class="x51-g">Inviter et familiemedlem</div>
  ${created ? `<div class="x51-th" aria-live="polite"><div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
      <div style="background:#fff;padding:8px;border-radius:12px;line-height:0">${created.qrSvg}</div>
      <div style="min-width:0;flex:1"><b>Skann med Papir-appen, eller åpne lenken</b><br><small>Engangskode ${esc(created.code)} · gyldig til ${esc(new Date(created.invite.expiresAt).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }))}</small>
      <div style="margin-top:8px;font:500 13px 'IBM Plex Mono',monospace;word-break:break-all">${esc(created.url)}</div>
      <div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="x51-a" data-x51-copy="${esc(created.url)}">Kopier lenken</button>${navigator.share ? `<button type="button" class="x51-a" data-x51-share="${esc(created.url)}">Del …</button>` : ''}</div></div></div></div>` : ''}
  <form class="x51-th" data-x51-inv>
    <label style="display:grid;gap:4px"><small>Navn</small><input class="x51-in" style="font-size:16px;border:1px solid var(--x51-line);border-radius:8px;padding:8px 10px" name="name" required maxlength="60" autocomplete="off"></label>
    <span id="x51-share-l"><small>Foreslå hva som deles (personen kan endre det)</small></span>
    <div role="group" aria-labelledby="x51-share-l">
      <label><input type="checkbox" name="location"> Posisjon</label>
      <label><input type="checkbox" name="health"> Helse (sammen med posisjon)</label>
      <label><input type="checkbox" name="calendar" checked> Kalender</label>
    </div>
    <label style="min-height:44px"><small>Gyldig i</small> <select name="ttl" style="font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--x51-line);background:var(--x51-bg);color:inherit"><option value="24">1 døgn</option><option value="48" selected>2 døgn</option><option value="168">1 uke</option></select></label>
    <div><button type="submit" class="x51-a">Lag invitasjon</button> <small data-x51-inv-err role="alert"></small></div>
  </form>
  ${list.length ? `<div class="x51-g">Invitasjoner</div>${list.slice(0, 12).map((x) => `<div class="x51-o" style="cursor:default"><span class="x51-i" aria-hidden="true">☺</span><span class="x51-t"><b>${esc(x.name)}</b><span>${esc(ST[x.state] ?? x.state)} · ${esc(new Date(x.createdAt).toLocaleDateString('nb-NO'))}${x.createdByName ? ` · ${esc(x.createdByName)}` : ''}</span></span>${x.state === 'open' ? `<span class="x51-acts"><button type="button" class="x51-a" data-x51-revoke="${esc(x.id)}">Trekk tilbake</button></span>` : ''}</div>`).join('')}` : ''}
`;
  const f = P.list.querySelector('[data-x51-inv]');
  const loc = f.querySelector('[name=location]'), hl = f.querySelector('[name=health]');
  const sync = () => { hl.disabled = !loc.checked; if (!loc.checked) hl.checked = false; };
  loc.addEventListener('change', sync); sync();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('[data-x51-inv-err]');
    const body = { name: f.name.value.trim(), ttlHours: Number(f.ttl.value), share: { location: loc.checked, health: hl.checked, calendar: f.querySelector('[name=calendar]').checked } };
    if (!body.name) { err.textContent = 'Skriv navnet.'; return; }
    try {
      const r = await fetch('/api/onboard51/invites', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { err.textContent = j.error || 'Det gikk ikke'; return; }
      invitePanel(j);
    } catch { err.textContent = 'Uten nett – prøv igjen'; }
  });
  P.list.querySelectorAll('[data-x51-copy]').forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.x51Copy); toast('Lenken er kopiert'); } catch { toast('Kunne ikke kopiere'); } }));
  P.list.querySelectorAll('[data-x51-share]').forEach((b) => b.addEventListener('click', () => navigator.share({ title: 'Bli med i Homelab', url: b.dataset.x51Share }).catch(() => {})));
  P.list.querySelectorAll('[data-x51-revoke]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Trekke tilbake invitasjonen? Lenken og QR-koden slutter å virke.')) return;
    await fetch(`/api/onboard51/invites/${encodeURIComponent(b.dataset.x51Revoke)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    invitePanel(created);
  }));
  if (!created) f.name.focus();
}
export const openInvitePanel51 = () => { openSearch(''); setTimeout(() => invitePanel(), 60); };

/* =====================================================================================================================
   Offline-kø (IndexedDB) – gjøremål, handleliste, notater, kvittering-opplasting, sjekk inn, familiekalender
   ===================================================================================================================== */

const QUEUE = [
  [/^\/api\/tasks(\/\d+)?$/, ['POST', 'PATCH', 'DELETE'], 'Gjøremål'],
  [/^\/api\/tasks\/\d+\/subs(\/[\w-]+)?$/, ['POST', 'PATCH', 'DELETE'], 'Deloppgave'],
  [/^\/(finans\/)?api\/receipts(\/scan)?$/, ['POST'], 'Kvittering'],
  [/^\/api\/family\/checkin(\/request|\/\d+\/reply)?$/, ['POST'], 'Sjekk inn'],
  [/^\/api\/famcal51\/events(\/\d+)?$/, ['POST', 'PATCH'], 'Familiekalender'],
];
const versions = new Map(); // «tasks:<id>» → updatedAt (fra GET /api/tasks)
// Køen merkes med brukeren, så en annen bruker i samme nettleser aldri sender noen andres endringer.
let ME = null;
async function meId() {
  if (ME) return ME;
  try { const r = await F0('/api/me', { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) ME = (await r.json())?.id ?? null; } catch { /* uten nett */ }
  return ME;
}
const DBN = 'webx51', ST = 'queue';
let dbp = null;
function idb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB mangler'));
  dbp ??= new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id', autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbp;
}
const tx = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(ST, mode); const out = fn(t.objectStore(ST)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
const qAdd = (item) => tx('readwrite', (s) => s.add(item));
const qAll = async () => { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction(ST).objectStore(ST).getAll(); r.onsuccess = () => res(r.result ?? []); r.onerror = () => rej(r.error); }); };
const qDel = (id) => tx('readwrite', (s) => s.delete(id));
export const queueSize51 = async () => (await qAll().catch(() => [])).length;

function rememberVersions(path, j) {
  if (!j || typeof j !== 'object') return;
  if (/^\/api\/tasks/.test(path)) for (const it of [...(Array.isArray(j.items) ? j.items : []), j.item].filter(Boolean)) if (it.id != null && it.updatedAt) versions.set(`tasks:${it.id}`, it.updatedAt);
}
async function serializeBody(b) {
  if (b == null) return null;
  if (typeof b === 'string') return { kind: 'text', v: b };
  if (b instanceof URLSearchParams) return { kind: 'text', v: b.toString() };
  if (b instanceof FormData) return { kind: 'form', entries: [...b.entries()].map(([k, v]) => (v instanceof Blob ? [k, v, v.name ?? 'fil'] : [k, String(v)])) };
  if (b instanceof Blob) return { kind: 'blob', v: b };
  return undefined; // strømmer o.l. kan ikke køes
}
function bodyOf(s) {
  if (!s) return undefined;
  if (s.kind === 'text') return s.v;
  if (s.kind === 'blob') return s.v;
  const f = new FormData(); for (const [k, v, n] of s.entries) v instanceof Blob ? f.append(k, v, n) : f.append(k, v); return f;
}
function labelOf(rule, s) {
  if (s?.kind === 'text') { try { const j = JSON.parse(s.v); if (j?.title) return `${rule[2]}: «${String(j.title).slice(0, 40)}»`; if (j?.note !== undefined) return `${rule[2]}: notat`; } catch { /* */ } }
  return rule[2];
}
async function enqueue(path, method, init, rule) {
  const s = await serializeBody(init.body);
  if (s === undefined) return null;
  const headers = {};
  new Headers(init.headers || {}).forEach((v, k) => { if (!/^(authorization|cookie)$/i.test(k)) headers[k] = v; });
  const m = path.match(/^\/api\/tasks\/(\d+)$/);
  const item = { path, search: '', method, headers, body: s, queuedAt: Date.now(), base: m ? versions.get(`tasks:${m[1]}`) ?? null : null, label: labelOf(rule, s), user: ME };
  try { const id = await qAdd(item); item.id = id; } catch { return null; }
  try { (await navigator.serviceWorker?.ready)?.sync?.register('webx51-queue').catch(() => {}); } catch { /* */ }
  const n = await queueSize51();
  toast(`Uten nett – ${item.label.toLowerCase().startsWith('sjekk') ? 'innsjekken' : 'endringen'} er lagret og sendes når nettet er tilbake (${n} i kø)`);
  window.dispatchEvent(new CustomEvent('webx51:queued', { detail: { label: item.label, size: n } }));
  let fake = {};
  try { fake = s?.kind === 'text' ? JSON.parse(s.v) : {}; } catch { fake = {}; }
  return new Response(JSON.stringify({ ok: true, queued: true, offline: true, queueId: item.id, item: { ...fake, id: null, pending: true },
    receipt_id: null, stored: null, pending48: true, message: 'Uten nett – kvitteringen sendes når nettet er tilbake' }), { status: 202, headers: { 'Content-Type': 'application/json', 'X-Offline51-Queued': '1' } });
}

window.fetch = async function fetch51(input, init = {}) {
  let url, method;
  try {
    url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
    method = String(init.method || (typeof input === 'object' && !(input instanceof URL) ? input.method : '') || 'GET').toUpperCase();
  } catch { return F0(input, init); }
  if (url.origin !== location.origin) return F0(input, init);
  const path = url.pathname;
  const rule = QUEUE.find(([re, ms]) => re.test(path) && ms.includes(method));
  const replay = new Headers(init.headers || {}).has('x-offline51-replay');
  if (!rule || replay || (typeof input === 'object' && !(input instanceof URL))) {
    const res = await F0(input, init);
    if (method === 'GET' && /^\/api\/tasks/.test(path) && res.ok) res.clone().json().then((j) => rememberVersions(path, j)).catch(() => {});
    return res;
  }
  if (navigator.onLine === false) { const q = await enqueue(path + url.search, method, init, rule); if (q) return q; }
  try {
    const res = await F0(input, init);
    if (res.ok && /^\/api\/tasks/.test(path)) res.clone().json().then((j) => rememberVersions(path, j)).catch(() => {});
    return res;
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    const q = await enqueue(path + url.search, method, init, rule);
    if (q) return q;
    throw e;
  }
};

let flushing = false;
export async function flush51() {
  if (flushing || navigator.onLine === false) return;
  flushing = true;
  const run = async () => {
    let items = (await qAll().catch(() => [])).sort((a, b) => a.id - b.id);
    if (!items.length) return;
    const me = await meId();
    if (!me) return; // ikke innlogget (eller fortsatt uten nett)
    items = items.filter((it) => !it.user || it.user === me);
    let sent = 0; const conflicts = [], failed = [];
    const chain = new Map();
    for (const it of items) {
      const h = new Headers(it.headers || {});
      h.set('X-Offline51-Replay', '1');
      h.set('X-Offline51-Queued', String(it.queuedAt));
      const base = chain.get(it.path) ?? it.base;
      if (base) h.set('X-Offline51-Base', String(base));
      let res;
      try { res = await F0(it.path, { method: it.method, credentials: 'same-origin', headers: h, body: bodyOf(it.body) }); } catch { break; } // fortsatt uten nett
      if (res.status === 401) break; // logget ut – prøv igjen etter innlogging
      if (res.status >= 500 || res.status === 429 || res.status === 408) break;
      await qDel(it.id).catch(() => {});
      if (res.ok) {
        sent++;
        const up = res.headers.get('X-Offline51-Updated'); if (up) chain.set(it.path, up);
        if (res.headers.get('X-Offline51-Conflict') === '1') conflicts.push(it);
      } else failed.push(it);
    }
    if (conflicts.length) toast(conflicts.length === 1 ? `${conflicts[0].label}: endringen din overskrev en nyere endring fra en annen enhet` : `${conflicts.length} endringer overskrev nyere endringer fra andre enheter (siste skriving vinner)`, { ms: 6000 });
    else if (failed.length) toast(`${failed.length} endring${failed.length === 1 ? '' : 'er'} fra offline kunne ikke lagres (${failed[0].label})`, { ms: 6000 });
    else if (sent) toast(`Tilbake på nett – ${sent} endring${sent === 1 ? '' : 'er'} sendt`);
    if (sent) { window.dispatchEvent(new CustomEvent('webx51:synced', { detail: { sent, conflicts: conflicts.length } })); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  };
  try { if (navigator.locks?.request) await navigator.locks.request('webx51-queue', run); else await run(); } finally { flushing = false; }
}
addEventListener('online', () => setTimeout(flush51, 400));
navigator.serviceWorker?.addEventListener?.('message', (e) => { if (e.data?.type === 'webx51-flush') flush51(); });
setInterval(() => { if (document.visibilityState === 'visible') flush51(); }, 30_000);

/* ---------------- Oppstart ---------------- */

injectCss();
syncTheme();
meId();
setTimeout(flush51, 1500);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hashOpen, { once: true }); else hashOpen();
window.webx51 = { openSearch, openThemePanel: openThemePanel51, flush: flush51, queueSize: queueSize51, applyTheme };
