// Prompt 51 (QA51): web/PWA-delen av kvalitet.
//  - Feature flags: GET /api/flags ved oppstart → window.hlFlags51 + hendelsen «hl:flags51». hlFlag51('nøkkel') i andre moduler.
//  - «Nytt i denne versjonen»: kort første gang etter en oppdatering (GET /api/whatsnew → show), «Ok» markerer som sett.
//  - Admin: Innstillinger → System får seksjonen «Kvalitet» med Feature flags og Krasjrapporter (eget panel).
// Krasjfangeren (error/unhandledrejection) er crash51.js, som lastes tidligere som vanlig skript.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
async function api(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opt, headers: { ...(opt.body ? { 'content-type': 'application/json' } : {}), ...(opt.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Feil ${r.status}`), { status: r.status });
  return j;
}

const CSS = `
.qa51-card{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:2147481000;width:min(420px,calc(100vw - 32px));max-height:min(70vh,560px);display:flex;flex-direction:column;box-sizing:border-box;border-radius:24px;background:var(--card,#121926);color:var(--text,#eef0f4);border:1px solid var(--line,#232938);box-shadow:0 24px 60px -20px rgba(0,0,0,.6);font:400 14px/1.45 Outfit,Geist,system-ui,sans-serif;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.qa51-card header{padding:20px 22px 6px}.qa51-card h2{margin:0;font:600 18px/1.25 Outfit,Geist,system-ui,sans-serif}
.qa51-card .qa51-sub{color:var(--muted,#8a93a6);font-size:13px;margin-top:4px}
.qa51-card ul{margin:0;padding:8px 22px 4px 40px;overflow:auto;flex:1}.qa51-card li{margin:0 0 8px}
.qa51-card footer{display:flex;gap:10px;justify-content:flex-end;padding:12px 18px 18px}
.qa51-btn{border:0;border-radius:999px;padding:9px 18px;font:600 14px Outfit,Geist,system-ui,sans-serif;cursor:pointer;background:var(--row,#1d2738);color:var(--text,#eef0f4)}
.qa51-btn.pri{background:var(--blue,#a8d4fb);color:#0b1220}.qa51-btn.danger{background:transparent;color:var(--red,#f59a8f)}
.qa51-btn:focus-visible,.qa51-panel button:focus-visible,.qa51-panel select:focus-visible{outline:2px solid var(--blue,#a8d4fb);outline-offset:2px}
.qa51-ov{position:fixed;inset:0;z-index:2147481500;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}
.qa51-panel{width:min(880px,100%);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;border-radius:24px;background:var(--page,#1a1d25);color:var(--text,#eef0f4);border:1px solid var(--line,#232938);padding:22px;font:400 14px/1.45 Outfit,Geist,system-ui,sans-serif}
.qa51-panel h2{margin:0 0 4px;font:600 20px Outfit,Geist,system-ui,sans-serif}.qa51-panel h3{margin:18px 0 8px;font:600 15px Outfit,Geist,system-ui,sans-serif}
.qa51-tabs{display:flex;gap:8px;margin:12px 0}.qa51-tabs button[aria-selected=true]{background:var(--blue,#a8d4fb);color:#0b1220}
.qa51-row{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line,#232938)}.qa51-row:first-child{border-top:0}
.qa51-row .grow{flex:1;min-width:0}.qa51-row code,.qa51-mono{font:500 12px/1.4 var(--mono,'JetBrains Mono',monospace)}
.qa51-muted{color:var(--muted,#8a93a6);font-size:13px}.qa51-ov input,.qa51-ov select{background:var(--field,#0b0e15);color:inherit;border:1px solid var(--line,#232938);border-radius:10px;padding:7px 10px;font:inherit}
.qa51-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;background:var(--row,#1d2738)}.qa51-pill.on{background:#1F3A2F;color:var(--green,#8fe0b0)}
.qa51-ovr{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.qa51-pre{white-space:pre-wrap;word-break:break-word;background:var(--field,#0b0e15);border-radius:12px;padding:10px;max-height:260px;overflow:auto}
@media (max-width:600px){.qa51-card{right:16px;left:16px;width:auto}.qa51-row{flex-wrap:wrap}}
html[data-theme="lys"] .qa51-card,html[data-hl="cur"] .qa51-card{background:#fff;color:#11141b;border-color:#e3e5ea}
`;
function css() { if (!document.getElementById('qa51-css')) { const s = document.createElement('style'); s.id = 'qa51-css'; s.textContent = CSS; document.head.appendChild(s); } }

/* ---------------- Feature flags ---------------- */

let flags = {};
export const hlFlag51 = (key) => !!flags[key];
async function loadFlags() {
  try {
    const r = await api('/api/flags');
    flags = r.flags ?? {};
    window.hlFlags51 = flags;
    window.hlFlag51 = hlFlag51;
    document.dispatchEvent(new CustomEvent('hl:flags51', { detail: flags }));
  } catch { /* uten innlogging eller eldre server: alt av */ }
}

/* ---------------- Nytt i denne versjonen ---------------- */

// Prompt 52 (claude-code-nytt-i-versjon-lesbar.md): ugjennomsiktig papirkort med slør bak, fast hode og bunn,
// grå dato, ett punkt per blokk med overskrift, mørk Ok-knapp. På mobil et bunnark i full bredde.
// Punktene kan komme som {title, text} (SRV52) eller som tekst («Overskrift: brødtekst»). Interne merknader («prompt 51») vises aldri.
const CSS52 = `
.wn52-veil{position:fixed;inset:0;z-index:2147481000;background:rgba(27,26,23,.35);display:flex;align-items:center;justify-content:center;padding:24px 16px}
.wn52:focus{outline:none}
.wn52{background:#fbf8f2;color:#1b1a17;border:1px solid #d8d1c2;border-radius:24px;box-shadow:0 24px 60px -20px rgba(27,26,23,.45);width:min(440px,calc(100vw - 32px));max-height:min(640px,calc(100vh - 48px));display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;font:400 14px/1.55 Manrope,Geist,system-ui,sans-serif;text-align:left}
.wn52-head{padding:22px 24px 14px;border-bottom:1px solid #d8d1c2;flex:none}
.wn52-lbl{font:600 10.5px/1.2 'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace;letter-spacing:.12em;color:#b23a2a;text-transform:uppercase}
.wn52 h2{margin:6px 0 0;font:500 28px/1.1 Newsreader,Georgia,serif;color:#1b1a17}
.wn52-date{margin-top:6px;font:500 13px/1.4 Manrope,Geist,system-ui,sans-serif;color:#6b665c}
.wn52-body{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}
.wn52-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 24px 8px;margin:0;list-style:none}
.wn52-list li{padding:14px 0;border-top:1px solid #e6dfd2}.wn52-list li:first-child{border-top:0;padding-top:0}
.wn52-list h3{margin:0 0 4px;font:700 15px/1.35 Manrope,Geist,system-ui,sans-serif;color:#1b1a17}
.wn52-list p{margin:0;font:400 14px/1.55 Manrope,Geist,system-ui,sans-serif;color:#3d3a34}
.wn52-list p.wn52-x{margin-top:6px}
.wn52-list p.wn52-clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.wn52-more{margin-top:4px;border:0;background:none;padding:6px 0;min-height:24px;font:600 13px Manrope,Geist,system-ui,sans-serif;color:#8f2e21;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.wn52-fade{position:absolute;left:0;right:0;bottom:0;height:28px;background:linear-gradient(rgba(251,248,242,0),#fbf8f2);pointer-events:none}
.wn52-foot{flex:none;display:flex;justify-content:flex-end;padding:14px 24px 20px;border-top:1px solid #d8d1c2}
.wn52-ok{height:46px;padding:0 26px;border-radius:23px;background:#1b1a17;color:#f3efe6;font:700 14.5px Manrope,Geist,system-ui,sans-serif;border:0;cursor:pointer}
.wn52-ok:focus{outline:none}.wn52-ok:focus-visible,.wn52-more:focus-visible{outline:2px solid #b23a2a;outline-offset:3px}
@media (max-width:600px){.wn52-veil{align-items:flex-end;padding:0}.wn52{width:100%;max-width:none;border-radius:24px 24px 0 0;border-bottom:0;max-height:calc(100vh - 56px)}.wn52-foot{padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))}}
@keyframes wn52In{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
.wn52{animation:wn52In .28s cubic-bezier(.22,.9,.28,1) both}
@media (prefers-reduced-motion:reduce){.wn52{animation:none}}
`;
function css52() { if (!document.getElementById('wn52-css')) { const s = document.createElement('style'); s.id = 'wn52-css'; s.textContent = CSS52; document.head.appendChild(s); } }
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
// «25.10.2026» / «2026-10-25» → «25. oktober 2026».
export function wnDate52(d) {
  const s = String(d ?? '').trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${+m[1]}. ${MONTHS[+m[2] - 1] ?? m[2]} ${m[3]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${+m[3]}. ${MONTHS[+m[2] - 1] ?? m[2]} ${m[1]}`;
  return s;
}
// Fjerner interne merknader: «prompt 51 – …», «(prompt 47)», «Prompt 52:».
export function wnClean52(t) {
  return String(t ?? '').replace(/\(\s*prompt\s*\d+[a-z]?\s*\)/gi, '').replace(/^\s*prompt\s*\d+[a-z]?\s*(runde\s*\d+\s*)?[–—:\-·]*\s*/i, '').replace(/\s*[–—·]\s*prompt\s*\d+[a-z]?\b/gi, '').replace(/\bprompt\s*\d+[a-z]?\b\s*/gi, '').replace(/\s{2,}/g, ' ').trim();
}
// Ett punkt → {title, text}. Tekst med «Overskrift: …» deles ved første kolon når overskriften er kort.
export function wnItem52(it) {
  if (it && typeof it === 'object') return { title: wnClean52(it.title ?? it.heading ?? ''), text: wnClean52(it.text ?? it.body ?? it.summary ?? ''), more: it.more ? wnClean52(it.more) : '' };
  const s = wnClean52(it);
  const m = s.match(/^([^:.!?]{3,60}):\s+(.+)$/s);
  if (m) return { title: m[1].trim(), text: m[2].trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase()) };
  // Ellers: første setning som overskrift når den er kort.
  const f = s.match(/^(.{6,70}?[.!?])\s+(.+)$/s);
  if (f) return { title: f[1].replace(/[.]$/, ''), text: f[2] };
  return { title: s, text: '' };
}

export function showWhatsNew51(w, { manual = false } = {}) {
  css52();
  document.querySelector('.wn52-veil')?.remove();
  const veil = document.createElement('div');
  veil.className = 'wn52-veil';
  const el = document.createElement('section');
  el.className = 'wn52';
  el.tabIndex = -1;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'qa51-wn-t');
  el.dataset.qa51 = 'whatsnew';
  const raw = Array.isArray(w.points) && w.points.length ? w.points : (w.items ?? []);
  const items = raw.map(wnItem52).filter((x) => x.title || x.text);
  const date = w.date_label || wnDate52(w.date);
  el.innerHTML = `<header class="wn52-head"><div class="wn52-lbl">${esc(w.label || 'Nytt i Homelab')}</div><h2 id="qa51-wn-t">${esc(w.heading || `Versjon ${w.version}`)}</h2>${date ? `<div class="wn52-date">${esc(date)}</div>` : ''}</header>
    <div class="wn52-body"><ul class="wn52-list" tabindex="0" aria-label="Endringer">${items.map((x, i) => `<li>${x.title ? `<h3>${esc(x.title)}</h3>` : ''}${x.text ? `<p${x.text.length > 220 ? ` class="wn52-clamp"` : ''}>${esc(x.text)}</p>` : ''}${x.more ? `<p class="wn52-x" id="wn52-p${i}" hidden>${esc(x.more)}</p>` : ''}${x.more || x.text.length > 220 ? `<button type="button" class="wn52-more"${x.more ? ` aria-controls="wn52-p${i}"` : ''} aria-expanded="false">Les mer</button>` : ''}</li>`).join('')}</ul><div class="wn52-fade" aria-hidden="true"></div></div>
    <footer class="wn52-foot"><button type="button" class="wn52-ok" data-qa51-ok>Ok</button></footer>`;
  veil.appendChild(el);
  document.body.appendChild(veil);
  const ok = el.querySelector('[data-qa51-ok]');
  const prev = document.activeElement;
  const close = () => {
    veil.remove();
    try { prev?.focus?.({ preventScroll: true }); } catch { /* */ }
    if (!manual) api('/api/whatsnew/seen', { method: 'POST', body: JSON.stringify({ version: w.version }) }).catch(() => {});
  };
  ok.addEventListener('click', close);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.wn52-more');
    if (!b) return;
    const li = b.closest('li'), open = b.getAttribute('aria-expanded') !== 'true';
    const x = li.querySelector('.wn52-x'), clamp = li.querySelector('p:not(.wn52-x)');
    if (x) x.hidden = !open;
    if (clamp && clamp.textContent.length > 220) clamp.classList.toggle('wn52-clamp', !open);
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? 'Vis mindre' : 'Les mer';
  });
  veil.addEventListener('click', (e) => { if (e.target === veil) close(); });
  veil.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { // fokus blir i dialogen
      const f = [...el.querySelectorAll('button,[tabindex="0"]')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // Fokus på dialogen (ikke Ok-knappen), så ringen bare vises når brukeren tabber dit.
  el.focus({ preventScroll: true });
}
async function checkWhatsNew() {
  try {
    const w = await api('/api/whatsnew');
    window.hlVersion51 = w.current ?? w.version;
    if (w.show) showWhatsNew51(w);
  } catch { /* ingen endringslogg eller ikke innlogget */ }
}
window.hlWhatsNew51 = async () => { try { showWhatsNew51(await api('/api/whatsnew'), { manual: true }); } catch { /* */ } };

/* ---------------- Admin: panel for flagg og krasjrapporter ---------------- */

const P = { tab: 'flags', data: null, crashes: null, status: null, detail: null, err: null };
function overlay() {
  let ov = document.getElementById('qa51-ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'qa51-ov';
    ov.className = 'qa51-ov';
    ov.addEventListener('click', (e) => { if (e.target === ov) closePanel(); else onPanelClick(e); });
    ov.addEventListener('change', onPanelChange);
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
    document.body.appendChild(ov);
  }
  return ov;
}
function closePanel() { document.getElementById('qa51-ov')?.remove(); }
export async function openQa51(tab = 'flags') {
  css();
  P.tab = tab; P.detail = null; P.err = null;
  renderPanel();
  overlay().querySelector('[data-qa51-close]')?.focus();
  await reloadPanel();
}
window.hlOpenQa51 = openQa51;
async function reloadPanel() {
  try {
    if (P.tab === 'flags') P.data = await api('/api/admin/flags51');
    else { const [c, s] = await Promise.all([api('/api/admin/crashes51?limit=200'), api('/api/admin/crashes51/status')]); P.crashes = c.crashes; P.status = s; }
    P.err = null;
  } catch (e) { P.err = e.message; }
  renderPanel();
}
const userName = (id) => P.data?.users.find((u) => u.id === id)?.name ?? id;
function flagsHtml() {
  const d = P.data;
  if (!d) return '<p class="qa51-muted">Laster …</p>';
  const userOpts = d.users.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('');
  const devOpts = d.devices.map((x) => `<option value="${esc(x.user)}|${esc(x.device)}">${esc(userName(x.user))} · ${esc(x.name)} (${esc(x.platform ?? '')})</option>`).join('');
  return `<p class="qa51-muted">Nye flagg er alltid av som standard. Rekkefølge: enhet › bruker › standard. Klientene henter dem med GET /api/flags.</p>
  <div>${d.flags.map((f) => `<div class="qa51-row"><div class="grow"><b class="qa51-mono">${esc(f.key)}</b> <span class="qa51-pill${f.default ? ' on' : ''}">Standard ${f.default ? 'på' : 'av'}</span>${f.builtin ? ' <span class="qa51-pill">innebygd</span>' : ''}
      <div class="qa51-muted">${esc(f.description || '–')}</div>
      <div class="qa51-ovr">${f.overrides.map((o) => `<span class="qa51-pill${o.value ? ' on' : ''}">${esc(userName(o.user))}${o.device ? ` · ${esc(d.devices.find((x) => x.device === o.device)?.name ?? o.device)}` : ''}: ${o.value ? 'på' : 'av'} <button type="button" class="qa51-btn danger" style="padding:0 4px" aria-label="Fjern overstyring" data-qa51-rm="${esc(f.key)}|${o.device ? 'device' : 'user'}|${esc(o.user)}|${esc(o.device ?? '')}">×</button></span>`).join('')}</div>
      <div class="qa51-ovr"><select data-qa51-who="${esc(f.key)}" aria-label="Velg bruker eller enhet"><option value="">Overstyr for …</option><optgroup label="Brukere">${userOpts.replace(/value="/g, 'value="user|')}</optgroup>${devOpts ? `<optgroup label="Enheter">${devOpts.replace(/value="/g, 'value="device|')}</optgroup>` : ''}</select>
        <button type="button" class="qa51-btn" data-qa51-set="${esc(f.key)}|1">På</button><button type="button" class="qa51-btn" data-qa51-set="${esc(f.key)}|0">Av</button></div></div>
    <div><button type="button" class="qa51-btn" role="switch" aria-checked="${f.default}" data-qa51-def="${esc(f.key)}">${f.default ? 'Slå av for alle' : 'Slå på for alle'}</button>${f.builtin ? '' : ` <button type="button" class="qa51-btn danger" data-qa51-del="${esc(f.key)}">Slett</button>`}</div></div>`).join('')}</div>
  <h3>Nytt flagg</h3><form data-qa51-new class="qa51-ovr"><input name="key" placeholder="navn_51" pattern="[a-z][a-z0-9_]{1,47}" required aria-label="Navn"><input name="description" placeholder="Hva flagget styrer" style="flex:1;min-width:200px" aria-label="Beskrivelse"><button class="qa51-btn pri">Legg til (av)</button></form>`;
}
function crashesHtml() {
  const s = P.status;
  if (!P.crashes || !s) return '<p class="qa51-muted">Laster …</p>';
  const g = s.glitchtip;
  const head = `<p class="qa51-muted">${g.active ? `Videresendes til GlitchTip på ${esc(g.host)}${g.reachable === false ? ` – <b style="color:var(--red)">svarer ikke</b> (${esc(g.lastError ?? '')}), ${s.pending} venter` : ''}.` : esc(g.note ?? 'Lagres lokalt.')} Siste døgn: ${s.last24h}. Totalt: ${s.total}.</p>
    <div class="qa51-ovr">${g.active ? '<button type="button" class="qa51-btn" data-qa51-flush>Send ventende nå</button>' : ''}<button type="button" class="qa51-btn danger" data-qa51-clear>Tøm alle</button></div>`;
  if (P.detail) {
    const c = P.detail;
    return `${head}<h3>${esc(c.message)}</h3><p class="qa51-muted">${esc(c.platform)} · ${esc(c.release ?? 'ukjent versjon')} · ${c.count}× · sist ${esc(new Date(c.lastSeen).toLocaleString('nb-NO'))}${c.user ? ` · ${esc(c.user.name)}` : ''}${c.url ? ` · ${esc(c.url)}` : ''}</p>
      ${c.stack ? `<div class="qa51-pre qa51-mono">${esc(c.stack)}</div>` : ''}<h3>Detaljer</h3><div class="qa51-pre qa51-mono">${esc(JSON.stringify(c.extra ?? {}, null, 2))}</div>
      <div class="qa51-ovr"><button type="button" class="qa51-btn" data-qa51-back>‹ Tilbake</button><button type="button" class="qa51-btn" data-qa51-copy>Kopier</button></div>`;
  }
  if (!P.crashes.length) return `${head}<p>Ingen krasjrapporter. 🎉</p>`;
  return `${head}<div>${P.crashes.map((c) => `<button type="button" class="qa51-row" style="all:unset;display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--line,#232938);cursor:pointer;width:100%" data-qa51-crash="${c.id}">
    <span class="qa51-pill">${esc(c.platform)}</span><span class="grow"><b>${esc(c.message.slice(0, 160))}</b><span class="qa51-muted" style="display:block">${esc(c.release ?? '')} · ${c.count}× · ${esc(new Date(c.lastSeen).toLocaleString('nb-NO'))}${c.user ? ` · ${esc(c.user.name)}` : ''}${c.forwardError ? ' · ikke sendt' : ''}</span></span></button>`).join('')}</div>`;
}
function renderPanel() {
  const ov = overlay();
  ov.innerHTML = `<div class="qa51-panel" role="dialog" aria-modal="true" aria-labelledby="qa51-p-t"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2 id="qa51-p-t">Kvalitet</h2><button type="button" class="qa51-btn" data-qa51-close>Ferdig</button></div>
    <div class="qa51-tabs" role="tablist"><button type="button" role="tab" class="qa51-btn" aria-selected="${P.tab === 'flags'}" data-qa51-tab="flags">Feature flags</button><button type="button" role="tab" class="qa51-btn" aria-selected="${P.tab === 'crashes'}" data-qa51-tab="crashes">Krasjrapporter</button><button type="button" class="qa51-btn" data-qa51-wn>Nytt i denne versjonen</button></div>
    ${P.err ? `<p style="color:var(--red,#f59a8f)">${esc(P.err)}</p>` : ''}${P.tab === 'flags' ? flagsHtml() : crashesHtml()}</div>`;
  ov.querySelector('[data-qa51-new]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await act(() => api('/api/admin/flags51', { method: 'POST', body: JSON.stringify({ key: fd.get('key'), description: fd.get('description') }) }));
  });
}
async function act(fn) { try { await fn(); } catch (e) { P.err = e.message; renderPanel(); return; } await reloadPanel(); }
const pendingWho = {};
function onPanelChange(e) { const s = e.target.closest('[data-qa51-who]'); if (s) pendingWho[s.dataset.qa51Who] = s.value; }
async function onPanelClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.qa51Close !== undefined) return closePanel();
  if (d.qa51Tab) { P.tab = d.qa51Tab; P.detail = null; renderPanel(); return reloadPanel(); }
  if (d.qa51Wn !== undefined) return window.hlWhatsNew51();
  if (d.qa51Def) { const f = P.data.flags.find((x) => x.key === d.qa51Def); return act(() => api(`/api/admin/flags51/${encodeURIComponent(f.key)}`, { method: 'PATCH', body: JSON.stringify({ default: !f.default }) })); }
  if (d.qa51Del) { if (!confirm(`Slette flagget ${d.qa51Del}?`)) return; return act(() => api(`/api/admin/flags51/${encodeURIComponent(d.qa51Del)}`, { method: 'DELETE' })); }
  if (d.qa51Set) {
    const [key, v] = d.qa51Set.split('|');
    const who = pendingWho[key];
    if (!who) { P.err = 'Velg en bruker eller enhet først.'; return renderPanel(); }
    const [scope, user, device] = who.split('|');
    return act(() => api(`/api/admin/flags51/${encodeURIComponent(key)}/override`, { method: 'PUT', body: JSON.stringify({ scope, user, device: device || undefined, value: v === '1' }) }));
  }
  if (d.qa51Rm) {
    const [key, scope, user, device] = d.qa51Rm.split('|');
    return act(() => api(`/api/admin/flags51/${encodeURIComponent(key)}/override`, { method: 'PUT', body: JSON.stringify({ scope, user, device: device || undefined, value: null }) }));
  }
  if (d.qa51Crash) { try { P.detail = (await api(`/api/admin/crashes51/${d.qa51Crash}`)).crash; } catch (x) { P.err = x.message; } return renderPanel(); }
  if (d.qa51Back !== undefined) { P.detail = null; return renderPanel(); }
  if (d.qa51Copy !== undefined && P.detail) { const c = P.detail; navigator.clipboard?.writeText(`${c.message}\n${c.platform} ${c.release ?? ''} (${c.count}×)\n${c.url ?? ''}\n\n${c.stack ?? ''}`).catch(() => {}); b.textContent = 'Kopiert'; return; }
  if (d.qa51Flush !== undefined) return act(() => api('/api/admin/crashes51/flush', { method: 'POST' }));
  if (d.qa51Clear !== undefined) { if (!confirm('Slette alle krasjrapportene?')) return; return act(() => api('/api/admin/crashes51', { method: 'DELETE' })); }
}

// Innstillinger → System: seksjonen «Kvalitet» legges til nederst (siden tegnes på nytt ofte, så en observatør legger den inn igjen).
function injectSettings() {
  const body = document.querySelector('#settings .set-body[data-key^="system|null"] .set-inner, #settings .set-body[data-key^="system||"] .set-inner');
  if (!body || body.querySelector('[data-qa51-sec]')) return;
  const sec = document.createElement('section');
  sec.className = 'sg';
  sec.dataset.qa51Sec = '1';
  sec.innerHTML = `<h3 class="sg-t">Kvalitet</h3><div class="sg-box">
    <button type="button" class="sg-row" data-qa51-open="flags"><span class="sg-txt"><b>Feature flags</b><span>Slå nye funksjoner på per bruker eller enhet</span></span><span class="sg-btn2">Åpne</span></button>
    <button type="button" class="sg-row" data-qa51-open="crashes"><span class="sg-txt"><b>Krasjrapporter</b><span>Feil fra web, appene og serveren (GlitchTip eller lokalt)</span></span><span class="sg-btn2">Åpne</span></button>
    <button type="button" class="sg-row" data-qa51-open="whatsnew"><span class="sg-txt"><b>Nytt i denne versjonen</b><span>Vis endringene i installert versjon</span></span><span class="sg-btn2">Vis</span></button></div>`;
  sec.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qa51-open]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.qa51Open === 'whatsnew') window.hlWhatsNew51(); else openQa51(b.dataset.qa51Open);
  });
  body.appendChild(sec);
}

async function init() {
  css();
  await loadFlags();
  checkWhatsNew();
  let me = null;
  try { me = await api('/api/me'); } catch { /* */ }
  if (me?.role === 'admin') {
    const watch = () => { const m = document.getElementById('settings'); if (!m) return false; new MutationObserver(injectSettings).observe(m, { childList: true, subtree: true }); injectSettings(); return true; };
    if (!watch()) { const t = setInterval(() => { if (watch()) clearInterval(t); }, 1000); setTimeout(() => clearInterval(t), 30_000); }
  }
}
if (!window.__hlQa51) { window.__hlQa51 = true; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
