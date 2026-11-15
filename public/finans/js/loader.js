// Lasteskjermen for Økonomi (prompt 20). Vanlig skript i <head> (CSP tillater ikke inline-skript), så det kjører før
// <body> tegnes: velger Papir lys eller mørk variant ut fra Homelab-temaet og viser skjermen bare på desktop
// (mobilappen har egen oppstart). Skjermen fjernes når appen har tegnet noe i #app.
(function () {
  var h = document.documentElement;
  var q = location.search;
  // Hent oversikten (/finans/api/bootstrap) parallelt med at modulene lastes; core.js loadBoot() bruker svaret (prompt 21).
  try { window.__fhBoot = fetch('/finans/api/bootstrap', { credentials: 'same-origin' }); window.__fhBoot.catch(function () {}); } catch (e) { window.__fhBoot = null; }
  var mobile = q.indexOf('desktop') < 0 && (matchMedia('(max-width: 899px)').matches || (matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1100px)').matches));
  // Tema før første tegning: Økonomi følger Homelab (Q15, B-F1). Samme regel som tema.js fhDesign(), skrevet ut her fordi
  // dette er et vanlig skript: Glass (hl_theme «cur») → «glod», ellers Papir lys/mørk etter papir_web_mode. Er Homelab-modusen
  // ukjent (aldri åpnet Homelab i denne nettleseren), brukes det gamle FinansHub-valget fh_design.
  var hl = null, wm = null, old = null;
  try { hl = localStorage.getItem('hl_theme'); wm = localStorage.getItem('papir_web_mode'); old = localStorage.getItem('fh_design'); } catch (e) { /* privat modus */ }
  var dark = wm === 'dark' || (wm === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  var d = hl === 'cur' ? 'glod' : (wm === 'light' || wm === 'dark' || wm === 'system') ? (dark ? 'mork' : 'lys') : (old === 'mork' ? 'mork' : 'lys');
  if (!mobile) {
    h.setAttribute('data-ui', 'desktop');
    h.setAttribute('data-theme', d);
    h.setAttribute('data-v3', '');
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', { lys: '#f4f1ea', mork: '#121210', glod: '#16110e' }[d]);
  }
  if (mobile) {
    // mobile.css (stor) står avslått i index.html og slås på av main.js. Forhåndslast den med en gang, med samme ?v som lenken.
    try {
      var b = document.querySelector('meta[name=nordlys-build]'), pl = document.createElement('link');
      pl.rel = 'preload'; pl.as = 'style'; pl.href = '/assets/finans/css/mobile.css' + (b ? '?v=' + encodeURIComponent(b.content) : '');
      document.head.appendChild(pl);
    } catch (e) { /* main.js laster den uansett */ }
    return;
  }
  h.setAttribute('data-fhl', d === 'lys' ? 'paper' : 'dark');

  var gone = false, obs = null;
  function hide() {
    if (gone) return;
    gone = true;
    if (obs) obs.disconnect();
    var el = document.getElementById('fh-load');
    if (!el) { h.removeAttribute('data-fhl'); return; }
    el.classList.add('out');
    setTimeout(function () { el.remove(); h.removeAttribute('data-fhl'); }, 260);
  }
  function drawn() {
    var app = document.getElementById('app');
    if (!app || !app.firstChild) return false;
    var f = app.firstElementChild;
    return !(f && f.hasAttribute('data-boot'));
  }
  window.fhLoaded = hide;
  function watch() {
    if (drawn()) return hide();
    obs = new MutationObserver(function () { if (drawn()) hide(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(hide, 20000); // aldri bli stående
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
