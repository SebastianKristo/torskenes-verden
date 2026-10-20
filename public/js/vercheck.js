// Prompt 32: ny versjon uten Cmd+Shift+R (claude-code-web-cache-fiks.md). Brukes av Homelab (app.js) og FinansHub desktop.
// - Bygget appen ble lastet med: <meta name="nordlys-build"> og ?v=<build> som serveren skriver inn i <script>/<link> og i
//   ES-modul-importene (SERVER32, server/cache-bust.js). Mangler de (eldre server), gjelder build fra første /version.json-svar.
// - /version.json?ts=… (cache: no-store) ved oppstart, når fanen får fokus og hvert 5. minutt. Ulik build →
//   banner nederst «Ny versjon av Nordlys er klar · Last inn på nytt». Er fanen skjult og ingenting er ulagret,
//   lastes siden på nytt med en gang fanen blir synlig igjen.
// - Service worker: registration.update() ved oppstart, ved fokus og hvert 10. minutt; controllerchange → én reload
//   (flagg i sessionStorage hindrer løkke). 404 på /version.json (eldre server) → bare SW-delen.
const fromUrl = (u) => { try { return new URL(u, location.href).searchParams.get('v') || null; } catch { return null; } };
function loadedBuild() {
  const meta = document.querySelector('meta[name="nordlys-build"]')?.content;
  if (meta) return meta;
  const own = fromUrl(import.meta.url);
  if (own) return own;
  for (const el of document.querySelectorAll('script[src*="v="],link[rel=stylesheet][href*="v="]')) {
    const u = el.getAttribute('src') || el.getAttribute('href') || '';
    if (u.startsWith('/') && !u.startsWith('//')) { const v = fromUrl(u); if (v) return v; }
  }
  return null;
}

const V = { base: null, latest: null, info: null, banner: false, pending: false, dead: false, started: false, reg: null, dismissed: null };
const RELOAD_KEY = 'hl_sw_reload';

/** Ulagrede endringer: et synlig skjemafelt som er endret (ikke søkefelt), eller window.hlDirty satt av en side. */
export function hasUnsaved() {
  if (window.hlDirty) return true;
  const sel = 'textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=search]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]):not([type=color])';
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('[data-sf],[data-search],[role=search],[data-vb-ignore]') || el.name === 'q') continue;
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
    // Tekstområder (Chat-utkast, notater) teller alltid når de har tekst; andre felt når de er endret.
    if (el.value && (el.tagName === 'TEXTAREA' || el.value !== el.defaultValue)) return true;
  }
  return false;
}

const CSS = `.vb{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:12px;max-width:min(560px,calc(100vw - 24px));box-sizing:border-box;padding:8px 8px 8px 12px;border-radius:24px;background:#1b1a17;color:#fff;font:600 14px/1.3 Manrope,Outfit,Geist,system-ui,sans-serif;box-shadow:0 18px 40px -16px rgba(0,0,0,.55);animation:vb-up .26s cubic-bezier(.2,.8,.2,1)}
.vb-ic{flex:none;width:30px;height:30px;border-radius:15px;background:#b23a2a;color:#fff;display:grid;place-items:center}
.vb-t{flex:1;min-width:0}.vb-t i{font-style:normal;opacity:.6;margin:0 2px}
.vb-b{flex:none;height:36px;padding:0 16px;border-radius:18px;border:0;background:#fff;color:#1b1a17;cursor:pointer;font:700 13.5px Manrope,Outfit,Geist,system-ui,sans-serif;white-space:nowrap}
.vb-x{flex:none;width:30px;height:30px;padding:0;border-radius:15px;border:0;background:rgba(255,255,255,.14);color:inherit;cursor:pointer;display:grid;place-items:center}
html[data-hl="cur"] .vb,html[data-theme="mork"] .vb,html[data-theme="glod"] .vb{background:#ece9e2;color:#11141b}
html[data-hl="cur"] .vb-b,html[data-theme="mork"] .vb-b,html[data-theme="glod"] .vb-b{background:#11141b;color:#fff}
html[data-hl="cur"] .vb-x,html[data-theme="mork"] .vb-x,html[data-theme="glod"] .vb-x{background:rgba(0,0,0,.08)}
@keyframes vb-up{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
@media (max-width:520px){.vb{left:12px;right:12px;transform:none;max-width:none;animation:none}}`;

function showBanner() {
  if (V.dismissed === V.latest) return;
  V.banner = true;
  let el = document.getElementById('hl-vb');
  if (!document.getElementById('hl-vb-css')) { const st = document.createElement('style'); st.id = 'hl-vb-css'; st.textContent = CSS; document.head.appendChild(st); }
  if (!el) { el = document.createElement('div'); el.id = 'hl-vb'; el.className = 'vb'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.title = [V.info?.version ? `Nordlys ${V.info.version}` : '', V.latest ? `bygg ${V.latest}` : ''].filter(Boolean).join(' · ').replace(/[<>&"]/g, '');
  el.innerHTML = `<span class="vb-ic" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg></span><span class="vb-t" data-no-i18n>Ny versjon av Nordlys er klar</span><button type="button" class="vb-b" data-vb-reload>Last inn på nytt</button><button type="button" class="vb-x" data-vb-x aria-label="Skjul" title="Skjul"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  el.querySelector('[data-vb-reload]').onclick = () => reload();
  el.querySelector('[data-vb-x]').onclick = () => { V.dismissed = V.latest; V.banner = false; el.remove(); };
}

function reload() { try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* */ } location.reload(); }

function newBuild() {
  if (document.hidden && !hasUnsaved()) { V.pending = true; return; }
  showBanner();
}

/** Henter /version.json. Ulik build gir banner (eller reload når fanen blir synlig). */
export async function checkVersion() {
  if (V.dead) return null;
  try {
    const r = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (r.status === 404) { V.dead = true; return null; }
    if (!r.ok) return null;
    const j = await r.json();
    const b = j?.build != null ? String(j.build) : null;
    if (!b) return null;
    V.info = j;
    if (!V.base) { V.base = b; return j; }
    if (b !== V.base) { V.latest = b; newBuild(); }
    return j;
  } catch { return null; }
}

function swUpdate() { try { V.reg?.update?.().catch(() => {}); } catch { /* */ } }

/** Starter versjonssjekken og SW-oppdateringene. sw: stien til service workeren (null = ingen registrering her). */
export function startVersionCheck({ sw = '/sw.js', scope } = {}) {
  if (V.started) return;
  V.started = true;
  V.base = loadedBuild();
  window.hlBuild = () => ({ loaded: V.base, latest: V.latest ?? V.base, pending: V.pending, banner: V.banner });
  checkVersion();
  setInterval(() => { if (!document.hidden) checkVersion(); }, 5 * 60_000);
  const onFocus = () => { checkVersion(); swUpdate(); };
  window.addEventListener('focus', onFocus);
  window.addEventListener('pageshow', (e) => { if (e.persisted) onFocus(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (V.banner) V.pending = true; return; }
    if (V.pending && !hasUnsaved()) { reload(); return; }
    if (V.pending) { V.pending = false; showBanner(); }
    onFocus();
  });

  if (!sw || !('serviceWorker' in navigator)) return;
  let hadCtl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Første installasjon (clients.claim) gir også controllerchange; da er det ingenting nytt å laste.
    if (!hadCtl) { hadCtl = true; return; }
    let last = 0; try { last = +sessionStorage.getItem(RELOAD_KEY) || 0; } catch { /* */ }
    if (Date.now() - last < 30_000) return; // nettopp lastet på nytt: ingen løkke
    if (hasUnsaved()) { V.latest ??= 'sw'; showBanner(); return; }
    reload();
  });
  navigator.serviceWorker.register(sw, { ...(scope ? { scope } : {}), updateViaCache: 'none' }).then((reg) => { V.reg = reg; swUpdate(); }).catch(() => {});
  setInterval(swUpdate, 10 * 60_000);
}
