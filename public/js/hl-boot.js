// Leses synkront i <head> før siden tegnes: Homelab-temaet («cur» eller «2c» = Vindu og papir) fra forrige besøk,
// så innlogging og forside ikke blinker i feil tema. Det lagrede valget hentes fra serveren etterpå (hltheme.js).
(function () {
  var t = 'cur';
  try { t = localStorage.getItem('hl_theme') === '2c' ? '2c' : 'cur'; } catch (e) { /* privat modus */ }
  document.documentElement.setAttribute('data-hl', t);
  document.documentElement.setAttribute('data-hl-theme', t);
  if (t === '2c') {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
    l.setAttribute('data-hl-fonts', '');
    document.head.appendChild(l);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#f3efe6');
  }
})();
