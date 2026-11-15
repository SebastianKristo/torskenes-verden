// Prompt 40 (claude-code-kalender-web-tema.md): Kalender på web i lys og mørk modus.
// Én ikonknapp i verktøylinja (rett før søk) går i ring Auto → Mørk → Lys → Auto. Lagres i localStorage['kal_theme']
// ('auto' | 'lys' | 'mork', standard auto). hl-boot.js setter html[data-kal-theme] før første render (ingen flash);
// CSS-en (kal39.css + web40.css) bytter fargene. Auto følger prefers-color-scheme og bytter live med systemet.
const KEY = 'kal_theme';
const ORDER = ['auto', 'mork', 'lys'];
export function kalTheme() { try { const v = localStorage.getItem(KEY); return ORDER.includes(v) ? v : 'auto'; } catch { return 'auto'; } }
// Prompt 43 (claude-code-kalender-web-lukk-tema.md): «følger» betyr Homelab-temaet først (paperMode «lys»/«mork» i
// /api/me/layout, samme valg som Papir-appen), ellers systemet (prefers-color-scheme). Lytter på begge og bytter med en gang.
const HL = 'kal_hl_mode';
// Prompt 44: web-modusen (html[data-mode], Innstillinger → Utseende → Lys og mørk) gjelder først.
const hlMode = () => { const dm = document.documentElement.getAttribute('data-mode'); if (dm === 'dark' || dm === 'light') return dm === 'dark' ? 'mork' : 'lys'; try { const v = localStorage.getItem(HL); return v === 'lys' || v === 'mork' ? v : ''; } catch { return ''; } };
export function applyKalTheme(v = kalTheme()) {
  const h = document.documentElement;
  if (h.hasAttribute('data-kal-app')) return; // Kalender.app for Mac følger systemet
  const eff = v === 'auto' ? hlMode() : v;
  if (eff) h.setAttribute('data-kal-theme', eff); else h.removeAttribute('data-kal-theme');
}
function setHl(m) {
  const v = m === 'lys' || m === 'mork' ? m : '';
  if (v === hlMode()) return;
  try { if (v) localStorage.setItem(HL, v); else localStorage.removeItem(HL); } catch { /* privat modus */ }
  applyKalTheme();
}
let hlT = 0;
/** Henter Homelab-temaet (paperMode) fra profilen. Kalles ved oppstart, når fanen får fokus og når temaet byttes. */
export async function syncHlMode(force = false) {
  if (!force && Date.now() - hlT < 15_000) return;
  hlT = Date.now();
  try {
    const r = await fetch('/api/me/layout', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return;
    const l = await r.json();
    setHl(l?.paperMode);
  } catch { /* frakoblet: beholder siste kjente */ }
}
const LBL = { auto: 'Tema: følger Homelab', lys: 'Tema: lys', mork: 'Tema: mørk' };
const IC = {
  auto: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>',
  lys: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  mork: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
/** Knappen i verktøylinja (bare web; Kalender.app for Mac følger systemet). */
export function themeBtn() {
  const v = kalTheme();
  return `<button type="button" class="k39-ib" data-k40-theme="${v}" aria-label="${LBL[v]}" title="${LBL[v]}">${IC[v]}</button>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-k40-theme]');
  if (!b) return;
  e.preventDefault();
  const next = ORDER[(ORDER.indexOf(kalTheme()) + 1) % ORDER.length];
  try { localStorage.setItem(KEY, next); } catch { /* privat modus */ }
  applyKalTheme(next);
  // Bare knappen tegnes på nytt (resten av kalenderen bytter farge via CSS-variablene).
  b.outerHTML = themeBtn();
  document.querySelector('[data-k40-theme]')?.focus();
});
applyKalTheme();
window.addEventListener('papir-web-mode', () => applyKalTheme());
if (!document.documentElement.hasAttribute('data-kal-app') && !/^\/(login|app-auth)/.test(location.pathname)) {
  syncHlMode(true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncHlMode(); });
  window.addEventListener('focus', () => syncHlMode());
  // Papir-appen i en annen fane lagrer paperMode i profilen; samme nettleser kan også ha byttet kopien direkte.
  window.addEventListener('storage', (e) => { if (e.key === HL || e.key === KEY) applyKalTheme(); });
  document.addEventListener('hl:theme', () => syncHlMode(true));
  setInterval(() => { if (!document.hidden && /kalender/.test(location.hash + location.pathname)) syncHlMode(); }, 60_000);
  document.addEventListener('hl:paper', (e) => setHl(e.detail));
  // Systemet bytter lyst/mørkt: CSS-en følger prefers-color-scheme selv, men knappen og kartet tegnes på nytt.
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyKalTheme(); document.dispatchEvent(new Event('kal:theme')); }); } catch { /* eldre motor */ }
}
