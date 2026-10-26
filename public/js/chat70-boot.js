// Prompt 70 (WEBCHAT70, claude-code-chat-laster-web.md, fasit «Chat Laster Web.dc.html»): lasteside for Chat på web.
// Vanlig (ikke-modul) skript som kjøres synkront rett etter <main id="view">, før JS-bunten (app.js) er lastet:
//   - window.HL70.html(st) bygger lastesiden (skjelett av hele Chat + Glimt-orb + steg). chat70.js bruker samme bygger,
//     så det statiske skjelettet og lastesiden fra modulen er like (ingen hopp når app.js tar over).
//   - Er adressen #/chat, tegnes skjelettet i #view med en gang. Samtalelista vises fra cache (hl_chat70, per bruker) hvis den finnes.
// Animasjonene (orb, skimmer, pust) får negativ forsinkelse ut fra performance.now(), så de fortsetter i samme fase når siden tegnes på nytt.
// Midten (orb, tittel, steg) tones inn først etter 300 ms, så lastesiden ikke blinker når alt er klart med en gang.
(function () {
  var W = window;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function now() { try { return performance.now(); } catch (e) { return 0; } }
  /** Fase for en uendelig animasjon med periode p ms (negativ forsinkelse). */
  function ph(p) { return 'animation-delay:-' + Math.round(now() % p) + 'ms'; }
  function cacheRead() {
    try {
      var c = JSON.parse(localStorage.getItem('hl_chat70') || 'null');
      if (!c || !c.list) return null;
      if (c.uid && String(c.uid) !== String(localStorage.getItem('hl_uid') || '')) return null;
      return c;
    } catch (e) { return null; }
  }
  function skelRows(ws) {
    return ws.map(function (w) { return '<span class="ch70-sr"><i style="width:' + w[0] + '%"></i><i style="width:' + w[1] + '%"></i></span>'; }).join('');
  }
  function sideSkel(sh) {
    return '<aside class="ch-side ch70-side" aria-hidden="true"><div class="ch70-sh"><b>Chat</b><span class="ch70-c34"></span></div>' +
      '<span class="ch70-new"></span><span class="ch70-sq"></span>' +
      '<span class="ch70-gh">FESTET</span><div class="ch70-rows">' + skelRows([[72, 40], [58, 30]]) + '</div>' +
      '<span class="ch70-gh">SISTE 7 DAGER</span><div class="ch70-rows">' + skelRows([[80, 46], [64, 34], [76, 28], [52, 38], [68, 44]]) + '</div>' +
      (sh ? '<span class="ch70-shim" style="' + ph(1600) + '"></span>' : '') + '</aside>';
  }
  /** Samtalelista fra cache (bare titler, statisk; byttes ut av den ekte lista når appen er klar). */
  function sideCached(list) {
    function rowsOf(L) { return L.map(function (x) { return '<div class="ch-row"><span class="ch-grow"><b data-no-i18n>' + esc(x.title) + '</b><span>&nbsp;</span></span></div>'; }).join(''); }
    var P = (list.pinned || []).slice(0, 8), F = (list.folders || []).slice(0, 8), C = (list.chats || []).slice(0, 24);
    var rows = (P.length ? '<div class="ch-gh">FESTET</div>' + rowsOf(P) : '') +
      (F.length ? '<div class="ch-gh">MAPPER</div>' + F.map(function (f) { return '<div class="ch-fold"><span class="ch-arr">▸</span><span class="ch-grow" data-no-i18n>' + esc(f.name) + '</span><span class="ch-n">' + ((f.chats || []).length) + '</span></div>'; }).join('') : '') +
      (C.length ? '<div class="ch-gh">SAMTALER</div>' + rowsOf(C) : '');
    return '<aside class="ch-side ch70-side ch70-cached"><div class="ch70-sh"><b>Chat</b><span class="ch70-c34"></span></div>' +
      '<span class="ch70-new"></span><span class="ch70-sq"></span><div class="ch-groups">' + rows + '</div></aside>';
  }
  var OK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function stepIc(s) {
    if (s === 'ok') return '<span class="ch70-ok">' + OK + '</span>';
    if (s === 'run') return '<span class="ch70-spin" style="' + ph(800) + '"></span>';
    if (s === 'err') return '<span class="ch70-err">!</span>';
    return '<span class="ch70-wait"></span>';
  }
  var TXT = {
    laster: ['Laster Chat …', 'Henter samtalene dine og gjør klar Glimt.'],
    treg: ['Tar litt lengre tid enn vanlig', 'Homelab svarer sakte. Samtalene vises så snart de er hentet.'],
    feil: ['Fikk ikke kontakt med Homelab', 'Sjekk at serveren kjører, eller bruk en lokal modell i mellomtiden.']
  };
  var NAMES = ['Kobler til Homelab', 'Henter samtaler', 'Laster modell'];
  /** Stegene: [{s:'wait'|'run'|'ok'|'err', t:'tekst til høyre'}]. */
  function stepsHtml(steps) {
    return steps.map(function (x, i) {
      return '<span class="ch70-step ' + x.s + '" data-l70-step="' + i + '"><span class="ch70-si">' + stepIc(x.s) + '</span><span class="ch70-sn">' + NAMES[i] + '</span><span class="ch70-st">' + esc(x.t || '') + '</span></span>';
    }).join('');
  }
  function orbHtml(sad) {
    return '<span class="ch70-orb' + (sad ? ' sad' : '') + '" style="' + ph(2400) + '" aria-hidden="true"><span class="ch70-ring" style="' + ph(3200) + '"></span>' +
      '<span class="ch70-face"><span class="ch70-fc" style="' + ph(2400) + '"><span class="ch70-eyes"><i></i><i></i></span><span class="ch70-mouth"></span></span></span></span>';
  }
  /** Midten: orb, tittel, undertekst, steg og knapper. */
  function centerHtml(st) {
    var mode = st.mode || 'laster', T = TXT[mode] || TXT.laster;
    var wait = Math.max(0, 300 - Math.round(now() - (st.t0 || 0)));
    return '<div class="ch70-mid' + (st.instant ? ' now' : '') + '" data-l70-mid style="animation-delay:' + wait + 'ms" role="status" aria-live="polite">' + orbHtml(mode === 'feil') +
      '<div class="ch70-tt"><b data-l70-title>' + T[0] + '</b><span data-l70-sub>' + T[1] + '</span></div>' +
      '<div class="ch70-steps" data-l70-steps>' + stepsHtml(st.steps) + '</div>' +
      '<div class="ch70-btns" data-l70-btns' + (mode === 'laster' ? ' hidden' : '') + '><button type="button" class="ch70-b ink" data-l70-retry>Prøv igjen</button><button type="button" class="ch70-b line" data-l70-local>Bruk lokal modell</button></div></div>';
  }
  function pillHtml(st) {
    var c = st.modelOk ? 'ok' : st.mode === 'feil' ? 'err' : '';
    return '<span class="ch70-pill" data-l70-pill><i class="' + c + '"></i><span data-no-i18n>' + esc(st.modelOk ? st.model : 'Velger modell …') + '</span></span>';
  }
  /** Hele lastesiden (innholdet i #chat). st = {mode, steps, model, modelOk, t0, wide, side} */
  function html(st) {
    var mode = st.mode || 'laster', wide = st.wide !== false;
    var side = !wide ? '' : st.side ? st.side : st.cache && st.cache.list ? sideCached(st.cache.list) : sideSkel(mode !== 'feil');
    return '<div class="ch70 ' + mode + '" data-l70>' + side + '<div class="ch-main ch70-main">' +
      '<div class="ch70-top">' + pillHtml(st) + '<span class="ch70-rb"><span></span><span></span></span></div>' +
      centerHtml(st) +
      '<div class="ch70-comp" aria-hidden="true"><div class="ch70-box"><span class="ch70-ph">Spør Glimt om hva som helst …</span><div class="ch70-bar"><span class="c36"></span><span class="p96"></span><span class="g"></span><span class="c36"></span><span class="c36 ink"></span></div></div></div>' +
      '</div></div>';
  }
  function firstSteps() { return [{ s: 'run', t: '' }, { s: 'wait', t: '' }, { s: 'wait', t: '' }]; }
  W.HL70 = { html: html, centerHtml: centerHtml, stepsHtml: stepsHtml, pillHtml: pillHtml, orbHtml: orbHtml, sideSkel: sideSkel, cacheRead: cacheRead, TXT: TXT, firstSteps: firstSteps };

  // Statisk skjelett når siden åpnes direkte på #/chat.
  var r = (location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0]) || '';
  var v = document.getElementById('view');
  if (r !== 'chat' || !v || v.firstChild || document.documentElement.hasAttribute('data-kal-app')) return;
  var theme = 'papir';
  try { theme = (JSON.parse(localStorage.getItem('hl_chat_v1') || 'null') || {}).theme === 'noytral' ? 'noytral' : 'papir'; } catch (e) { /* privat modus */ }
  var mobile = false;
  try { mobile = matchMedia('(max-width: 767px)').matches; } catch (e) { /* */ }
  v.innerHTML = '<div id="chat" class="ch ch-fs ' + theme + '">' + html({ mode: 'laster', steps: firstSteps(), t0: 0, wide: !mobile, cache: cacheRead() }) + '</div>';
  v.setAttribute('aria-busy', 'true');
  document.body.classList.add('chat-fs');
  W.HL70.staticAt = 0; // chat70.js fortsetter fra navigasjonsstart, så midten ikke tones inn på nytt
})();
