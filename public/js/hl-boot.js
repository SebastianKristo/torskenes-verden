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
  document.documentElement.setAttribute('data-hl', t);
  document.documentElement.setAttribute('data-hl-theme', t);
  if (t === '2c') {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
    l.setAttribute('data-hl-fonts', '');
    document.head.appendChild(l);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && !document.documentElement.hasAttribute('data-kal-app')) m.setAttribute('content', '#f3efe6');
  }
})();
