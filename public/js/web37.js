// Prompt 37 (web): små ting i skallet.
// - Vær åpnet fra briefen (brief35.js → openVaer): ✕ øverst til høyre på Vær-siden går tilbake til briefen på samme scroll-posisjon.
// - Onboarding med profil (onboard37.js) når den innloggede brukeren ikke er koblet til en profil.
const BACK = 'gb37_back';

function backInfo() {
  try { const v = JSON.parse(sessionStorage.getItem(BACK) ?? 'null'); return v && Date.now() - v.at < 30 * 60_000 ? v : null; } catch { return null; }
}
function vaerBack() {
  const onVaer = /^#\/vaer(\/|\?|$)/.test(location.hash);
  let b = document.getElementById('gb37-vback');
  const info = onVaer ? backInfo() : null;
  if (!onVaer) { b?.remove(); try { if (!/^#\/(dash)?$/.test(location.hash)) sessionStorage.removeItem(BACK); } catch { /* */ } return; }
  if (!info) { b?.remove(); return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'gb37-vback'; b.type = 'button'; b.className = 'gb37-vback'; b.setAttribute('aria-label', 'Lukk Vær og gå tilbake til briefen'); b.title = 'Tilbake til briefen';
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    b.addEventListener('click', goBack);
    document.body.appendChild(b);
  }
}
async function goBack() {
  const info = backInfo();
  try { sessionStorage.removeItem(BACK); } catch { /* */ }
  document.getElementById('gb37-vback')?.remove();
  location.hash = '#/dash';
  const m = await import('./brief35.js');
  setTimeout(() => m.reopenBrief?.(info?.sc ?? 0), 60);
}

export function initWeb37() {
  window.addEventListener('hashchange', vaerBack);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('gb37-vback') && !document.querySelector('.modal:not([hidden]), .tk-layer, .gb-layer')) { e.preventDefault(); goBack(); } });
  vaerBack();
  // Onboarding etter at siden er tegnet (ikke i veien for første visning).
  setTimeout(() => import('./onboard37.js').then((m) => m.maybeOnboard()).catch(() => {}), 1200);
}
