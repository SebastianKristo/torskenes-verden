// Prompt 51 (QA51): krasjrapporter fra web og PWA. Vanlig (ikke-modul) skript som lastes tidlig i <head>, så også feil
// mens modulene lastes fanges. Fanger window «error» og «unhandledrejection» og sender dem til POST /api/crash (serveren
// vasker bort hemmeligheter, lagrer lokalt og videresender til GlitchTip i huset når den finnes).
// Vern: maks 10 rapporter per sidevisning, samme feil bare én gang, ingen spørring/fragment-parametre i URL-en, ingen
// tekst fra skjemafelt. Brødsmuler (siste 20 ruter/klikk, bare element-type og data-attributt) sendes bare når
// flagget crash_breadcrumbs51 er på (window.hlFlags51 settes av qa51.js).
(function () {
  if (window.__hlCrash51) return;
  var sent = 0, seen = {}, crumbs = [], MAX = 10;
  var release = (document.querySelector('meta[name="nordlys-build"]') || {}).content || null;
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function crumb(type, data) { crumbs.push({ t: Date.now(), type: type, data: String(data || '').slice(0, 80) }); if (crumbs.length > 20) crumbs.shift(); }
  window.addEventListener('hashchange', function () { crumb('route', location.hash.split('?')[0]); });
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('button,a,[data-act],[data-go],[role=button]') : null;
    if (!el) return;
    var id = el.getAttribute('data-act') || el.getAttribute('data-go') || el.getAttribute('data-r') || el.id || '';
    crumb('click', el.tagName.toLowerCase() + (id ? '[' + id + ']' : ''));
  }, true);
  function route() { return location.pathname + (location.hash ? location.hash.split('?')[0] : ''); }
  function send(rep) {
    if (sent >= MAX) return;
    var key = rep.message + '|' + String(rep.stack || '').slice(0, 200);
    if (seen[key]) return;
    seen[key] = 1; sent++;
    rep.platform = standalone ? 'pwa' : 'web';
    rep.release = rep.release || release || (window.hlVersion51 || null);
    rep.url = route();
    rep.userAgent = navigator.userAgent;
    if (window.hlFlags51 && window.hlFlags51.crash_breadcrumbs51) rep.breadcrumbs = crumbs.slice();
    var body = JSON.stringify(rep);
    if (body.length > 60000) { rep.stack = String(rep.stack || '').slice(0, 4000); rep.breadcrumbs = undefined; body = JSON.stringify(rep); }
    try {
      fetch('/api/crash', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body: body }).catch(function () {});
    } catch (e) { /* aldri en ny feil fra rapporteringen */ }
  }
  function ignorable(msg, src) {
    if (!msg) return true;
    // Støy fra utvidelser og avbrutte nettverkskall er ikke feil i appen.
    if (/^Script error\.?$/.test(msg) || /ResizeObserver loop/.test(msg)) return true;
    if (src && /^(chrome|moz|safari(-web)?)-extension:/.test(src)) return true;
    return /AbortError|The user aborted a request|Load failed$|NetworkError when attempting/.test(msg);
  }
  window.addEventListener('error', function (e) {
    if (e && e.target && e.target !== window && e.target.tagName) return; // bilde/skript som ikke lastet: ikke en krasj
    var msg = (e && (e.message || (e.error && e.error.message))) || '';
    if (ignorable(msg, e && e.filename)) return;
    send({ level: 'error', message: String(msg), stack: e && e.error && e.error.stack ? String(e.error.stack) : (e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : null), extra: { kind: 'error' } });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var msg = r && r.message ? r.message : typeof r === 'string' ? r : (function () { try { return JSON.stringify(r); } catch (x) { return String(r); } })();
    if (ignorable(String(msg || ''))) return;
    send({ level: 'error', message: 'Unhandled rejection: ' + String(msg).slice(0, 900), stack: r && r.stack ? String(r.stack) : null, extra: { kind: 'unhandledrejection' } });
  });
  window.__hlCrash51 = { report: function (err, extra) { send({ level: 'error', message: String((err && err.message) || err), stack: err && err.stack ? String(err.stack) : null, extra: extra || {} }); }, crumb: crumb };
})();
