// Prompt 44 (claude-code-oppdatering-hopper-mellom-skjermer.md): én innlasting når ny versjon svarer.
// Brukes av oppstartsskjermen (starting36.js) og oppdateringsløkka (sysupdate.js), så siden aldri lastes inn to ganger.
// - reloadOnce(to): location.replace med ?v=<to>, bare én gang per versjon (sessionStorage «hl_upd44_reload»).
// - Flere faner: BroadcastChannel('nordlys-update'). Fanen som melder seg først laster først; de andre venter litt.
// - Etter innlastingen: toast «Oppdatert til 4.38 · Se hva som er nytt» og ?v= fjernes fra adressen.
const KEY = 'hl_upd44_reload';
const ID = Math.random().toString(36).slice(2);
const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* privat modus */ } return null; };
let ch = null, firstClaim = null, done = false;
try {
  ch = new BroadcastChannel('nordlys-update');
  ch.onmessage = (e) => { const m = e.data ?? {}; if (m.type === 'claim' && m.id !== ID && (!firstClaim || m.at < firstClaim.at)) firstClaim = m; };
} catch { /* eldre nettleser */ }

/** Versjon uten «v» foran, for sammenligning («4.38.0» ≈ «4.38»). */
export const vnorm = (v) => String(v ?? '').trim().replace(/^v/i, '');
export const sameVer = (a, b) => {
  const x = vnorm(a).split('.'), y = vnorm(b).split('.');
  if (!x[0] || !y[0]) return false;
  const n = Math.min(x.length, y.length, 3);
  for (let i = 0; i < n; i++) if ((+x[i] || 0) !== (+y[i] || 0)) return false;
  return true;
};

/** Er siden allerede lastet på nytt for denne versjonen (de siste 2 min)? */
export function reloadedFor(to) {
  try { const j = JSON.parse(ss(KEY) || 'null'); return !!j && (j.v ?? '') === (to ?? '') && Date.now() - j.at < 120_000; } catch { return false; }
}

/** Laster siden på nytt én gang for versjonen `to`. Returnerer false hvis det allerede er gjort. */
export function reloadOnce(to, { before } = {}) {
  if (done || reloadedFor(to)) return false;
  done = true;
  const at = Date.now();
  try { ch?.postMessage({ type: 'claim', id: ID, at, v: to ?? null }); } catch { /* */ }
  // Fikk en annen fane meldt seg før oss, venter vi litt så den rekker å laste først.
  setTimeout(async () => {
    const wait = firstClaim && firstClaim.at <= at ? 1200 + Math.round(Math.random() * 600) : 0;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    ss(KEY, JSON.stringify({ v: to ?? '', at: Date.now() }));
    try { await before?.(); } catch { /* */ }
    const u = new URL(location.href);
    u.searchParams.set('v', vnorm(to) || String(Date.now()));
    location.replace(u.toString());
  }, 250);
  return true;
}

/** Kalles ved oppstart: kom vi hit etter reloadOnce, vis toasten og rydd adressen. */
export function afterReload() {
  let j = null; try { j = JSON.parse(ss(KEY) || 'null'); } catch { /* */ }
  const u = new URL(location.href);
  const v = u.searchParams.get('v');
  if (!v || !j || Date.now() - j.at > 120_000) return;
  u.searchParams.delete('v');
  try { history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash); } catch { /* */ }
  let rb = null; try { rb = JSON.parse(sessionStorage.getItem('hl_rb44') || 'null'); sessionStorage.removeItem('hl_rb44'); } catch { /* */ }
  setTimeout(() => (rb && Date.now() - rb.at < 30 * 60_000 ? toastRb(rb) : toast(v)), 600);
}
/** Prompt 44 (claude-code-rull-tilbake-versjon.md): «Kjører Nordlys 4.37 · automatiske oppdateringer er av til 28. okt» + «Oppdater til 4.38 igjen». */
function toastRb(rb) {
  toast(rb.to, { text: `Kjører Nordlys ${vnorm(rb.to).split('.').slice(0, 2).join('.')}${rb.until ? ` · automatiske oppdateringer er av til ${new Date(rb.until).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '')}` : ''}`,
    btn: rb.from ? `Oppdater til ${vnorm(rb.from).split('.').slice(0, 2).join('.')} igjen` : 'Se versjoner', go: () => document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'system' })) });
}

function toast(v, o = {}) {
  if (!document.getElementById('upd44-css')) {
    const st = document.createElement('style'); st.id = 'upd44-css';
    st.textContent = '.upd44t{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:8px 8px 8px 14px;border-radius:24px;background:#1b1a17;color:#fff;font:600 14px/1.3 Manrope,Outfit,system-ui,sans-serif;box-shadow:0 18px 40px -16px rgba(0,0,0,.55)}.upd44t button{flex:none;height:34px;padding:0 14px;border-radius:17px;border:0;background:#fff;color:#1b1a17;font:700 13px Manrope,system-ui,sans-serif;cursor:pointer}html[data-mode="dark"] .upd44t{background:#f3efe6;color:#16140f}html[data-mode="dark"] .upd44t button{background:#16140f;color:#fff}';
    document.head.appendChild(st);
  }
  const t = document.createElement('div'); t.className = 'upd44t'; t.setAttribute('role', 'status');
  const s = document.createElement('span'); s.textContent = o.text ?? `Oppdatert til ${vnorm(v).split('.').slice(0, 2).join('.')}`;
  const b = document.createElement('button'); b.type = 'button'; b.textContent = o.btn ?? 'Se hva som er nytt';
  b.onclick = () => { t.remove(); (o.go ?? (() => document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'system' }))))(); };
  t.append(s, b); document.body.appendChild(t);
  setTimeout(() => t.remove(), 8000);
}
