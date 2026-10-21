// Leses synkront i <head> før siden tegnes: Homelab-temaet («cur» eller «2c» = Vindu og papir) fra forrige besøk,
// så innlogging og forside ikke blinker i feil tema. Det lagrede valget hentes fra serveren etterpå (hltheme.js).
(function () {
  var t = 'cur';
  try { t = localStorage.getItem('hl_theme') === '2c' ? '2c' : 'cur'; } catch (e) { /* privat modus */ }
  // Prompt 38: /kalender?app=mac er Kalender.app for Mac (WKWebView): bare kalenderen i hele vinduet, uten Homelab-menyen,
  // papirtema som følger systemets lyse/mørke modus. Adressen får #/kalender så appen ruter rett dit.
  try {
    var q = new URLSearchParams(location.search), app = q.get('app');
    // Kalender.app setter også window.kalMac og html.kal-app-mac før skriptene (KAL38).
    if (!app && (document.documentElement.classList.contains('kal-app-mac') || window.kalMac)) app = 'mac';
    if (/^\/kalender\/?$/.test(location.pathname) && app && /^[a-z]{2,12}$/.test(app)) {
      document.documentElement.setAttribute('data-kal-app', app);
      t = '2c';
      if (!/^#\/kalender/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/kalender');
      var dk = matchMedia('(prefers-color-scheme: dark)').matches;
      var tc = document.querySelector('meta[name="theme-color"]');
      if (tc) tc.setAttribute('content', dk ? '#161513' : '#f3efe6');
    }
  } catch (e) { /* eldre nettleser */ }
  // Prompt 40: Kalender på web lys/mørk/auto (kal-theme40.js) – leses før første render så det ikke blinker.
  try { var kt = localStorage.getItem('kal_theme'); if (kt !== 'lys' && kt !== 'mork') kt = localStorage.getItem('kal_hl_mode'); /* prompt 43: «følger» = Homelab-temaet */ if ((kt === 'lys' || kt === 'mork') && !document.documentElement.hasAttribute('data-kal-app')) document.documentElement.setAttribute('data-kal-theme', kt); } catch (e) { /* privat modus */ }
  // Prompt 44 (claude-code-web-lys-mork-modus.md): Lys (standard) · Mørk · Følg systemet. Settes før første tegning,
  // så siden ikke blinker hvit. web44.js henter valget fra brukeren (web_theme) og lytter på systemet etterpå.
  try {
    var wm = localStorage.getItem('papir_web_mode'); if (wm !== 'dark' && wm !== 'system') wm = 'light';
    var dm = wm === 'dark' || (wm === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    if (!document.documentElement.hasAttribute('data-kal-app')) { document.documentElement.setAttribute('data-mode', dm); document.documentElement.setAttribute('data-web-mode', wm); }
  } catch (e) { /* privat modus */ }
  document.documentElement.setAttribute('data-hl', t);
  document.documentElement.setAttribute('data-hl-theme', t);
  if (t === '2c') {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
    l.setAttribute('data-hl-fonts', '');
    document.head.appendChild(l);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && !document.documentElement.hasAttribute('data-kal-app')) m.setAttribute('content', document.documentElement.getAttribute('data-mode') === 'dark' ? '#16140f' : '#f3efe6');
  }
})();

// Prompt 44 (as44.js): «Logg inn som X». Mens X-tokenet finnes, legges det på alle egne API-kall (før appen starter),
// og endringer (PUT/POST/PATCH/DELETE) telles for stripa. 401 på tokenet = utløpt → as44.js går ut.
(function () {
  var a = null;
  try { a = JSON.parse(sessionStorage.getItem('hl_as44') || 'null'); } catch (e) { /* privat modus */ }
  if (!a || !window.fetch) return;
  var f0 = window.fetch.bind(window);
  window.__hlFetch0 = f0;
  var api = /^\/(api|finans\/api|home\/api|mat\/api|domains\/api)(\/|$)/;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      var u = new URL(url, location.href);
      if (u.origin === location.origin && api.test(u.pathname) && !/^\/api\/admin\/impersonate/.test(u.pathname)) {
        init = Object.assign({}, init || {});
        var h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
        // Web (SERVER44 web:true): informasjonskapselen hl_imp gjør jobben; tokenet legges bare på når den mangler.
        if (a.token && !a.cookie && !h.has('Authorization')) h.set('Authorization', 'Bearer ' + a.token);
        init.headers = h;
        var m = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
        return f0(input, init).then(function (r) {
          if (r.status === 401) window.dispatchEvent(new Event('hl-as44-expired'));
          else if (r.ok && m !== 'GET' && m !== 'HEAD' && !/\/(presence|heartbeat|ping|webpush|assist|chat|glimt|search)/.test(u.pathname)) {
            try { var s = JSON.parse(sessionStorage.getItem('hl_as44') || 'null'); if (s) { s.n = (s.n || 0) + 1; sessionStorage.setItem('hl_as44', JSON.stringify(s)); window.dispatchEvent(new Event('hl-as44-change')); } } catch (e) { /* */ }
          }
          return r;
        });
      }
    } catch (e) { /* vanlig kall */ }
    return f0(input, init);
  };
})();
