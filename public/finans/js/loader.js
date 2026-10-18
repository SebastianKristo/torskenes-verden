// Lasteskjermen for Økonomi (prompt 20). Vanlig skript i <head> (CSP tillater ikke inline-skript), så det kjører før
// <body> tegnes: velger Papir eller mørk variant ut fra Homelab-temaet og viser skjermen bare på desktop
// (mobilappen har egen oppstart). Skjermen fjernes når appen har tegnet noe i #app.
(function () {
  var h = document.documentElement;
  var q = location.search;
  // Hent oversikten (/finans/api/bootstrap) parallelt med at modulene lastes; core.js loadBoot() bruker svaret (prompt 21).
  try { window.__fhBoot = fetch('/finans/api/bootstrap', { credentials: 'same-origin' }); window.__fhBoot.catch(function () {}); } catch (e) { window.__fhBoot = null; }
  var mobile = q.indexOf('desktop') < 0 && (matchMedia('(max-width: 899px)').matches || (matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1100px)').matches));
  if (mobile) return;
  var t = 'cur';
  try { t = localStorage.getItem('hl_theme') === '2c' ? '2c' : 'cur'; } catch (e) { /* privat modus */ }
  h.setAttribute('data-fhl', t === '2c' ? 'paper' : 'dark');

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
