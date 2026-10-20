// Prompt 40 (claude-code-kalender-web-tema.md): Kalender på web i lys og mørk modus.
// Én ikonknapp i verktøylinja (rett før søk) går i ring Auto → Mørk → Lys → Auto. Lagres i localStorage['kal_theme']
// ('auto' | 'lys' | 'mork', standard auto). hl-boot.js setter html[data-kal-theme] før første render (ingen flash);
// CSS-en (kal39.css + web40.css) bytter fargene. Auto følger prefers-color-scheme og bytter live med systemet.
const KEY = 'kal_theme';
const ORDER = ['auto', 'mork', 'lys'];
export function kalTheme() { try { const v = localStorage.getItem(KEY); return ORDER.includes(v) ? v : 'auto'; } catch { return 'auto'; } }
export function applyKalTheme(v = kalTheme()) {
  const h = document.documentElement;
  if (v === 'auto') h.removeAttribute('data-kal-theme'); else h.setAttribute('data-kal-theme', v);
}
const LBL = { auto: 'Tema: følger systemet', lys: 'Tema: lys', mork: 'Tema: mørk' };
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
