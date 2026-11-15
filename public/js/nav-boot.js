// Faneoppsett ved oppstart (claude-code-web-oppstart-animasjon.md): kjøres synkront rett etter topplinjen og bunnmenyen, før første tegning.
// Faneoppsettet (rekkefølge, skjulte faner, navn) og logo-teksten leses fra forrige besøk (localStorage hl_tabs52, skrevet av
// startup.js), så skjulte faner aldri vises og riktig fane er markert fra første frame. Uten cache: fanepillen og innholdet vises
// som skjelett til appen har lest oppsettet. Innholdsområdet får skjelettkort til siden er tegnet.
(function () {
  var de = document.documentElement;
  if (de.hasAttribute('data-kal-app')) return;
  var c = null;
  try {
    c = JSON.parse(localStorage.getItem('hl_tabs52') || 'null');
    if (c && c.uid && String(c.uid) !== String(localStorage.getItem('hl_uid'))) c = null;
  } catch (e) { c = null; }
  var r = (location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0]) || 'oversikt';
  var mobile = false;
  try { mobile = matchMedia('(max-width: 767px)').matches; } catch (e) { /* */ }
  function apply(navSel, list) {
    var nav = document.querySelector(navSel);
    if (!nav || !list || !list.length) return false;
    var by = {};
    Array.prototype.forEach.call(nav.querySelectorAll('[data-r]'), function (a) { by[a.getAttribute('data-r')] = a; });
    list.forEach(function (t) {
      var a = by[t.r];
      if (!a) return;
      if (a.getAttribute('data-def') == null) a.setAttribute('data-def', a.textContent);
      if (t.t) a.textContent = t.t;
      a.hidden = !!t.h;
      nav.appendChild(a);
    });
    return true;
  }
  // Fase 6: modulen adressen hører til, fra modullisten (moduler.js cacher den i hl_mod6): gamle adresser (#/dash) via aliasene,
  // ellers modulen med samme adresse (#/hjem → smarthjem) eller en underside (#/kalender/bursdager → kalender).
  function moduleOf(seg) {
    var m6 = null;
    try { m6 = JSON.parse(localStorage.getItem('hl_mod6') || 'null'); } catch (e) { m6 = null; }
    if (!m6 || !m6.moduler) return seg;
    var to = m6.alias && m6.alias['#/' + seg];
    var s2 = to ? String(to).replace(/^#\/?/, '').split('/')[0] : seg;
    for (var i = 0; i < m6.moduler.length; i++) {
      var m = m6.moduler[i];
      if (m.rute === '#/' + s2 || m.id === s2) return m.id;
    }
    return s2;
  }
  function mark() {
    var key = moduleOf(r);
    if (mobile && key !== 'mer' && !document.querySelector('.bottomnav [data-r="' + key + '"]')) key = 'mer';
    Array.prototype.forEach.call(document.querySelectorAll('.pillnav [data-r], .bottomnav [data-r]'), function (a) {
      if (a.getAttribute('data-r') === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  if (c && Array.isArray(c.top) && c.top.length) {
    apply('.pillnav', c.top);
    apply('.bottomnav', c.bottom);
    var logo = document.querySelector('header.top .logo');
    if (logo && c.logo) { logo.setAttribute('data-os', logo.textContent); logo.textContent = c.logo; }
  } else {
    // Ingen cache (første besøk / inkognito): skjelett i stedet for hele standardlista.
    de.classList.add('boot52-nocache');
    var nav = document.querySelector('.pillnav');
    if (nav) {
      Array.prototype.forEach.call(nav.querySelectorAll('[data-r]'), function (a) { a.hidden = true; });
      for (var i = 0; i < 6; i++) { var s = document.createElement('span'); s.className = 'nav-skel52'; s.setAttribute('aria-hidden', 'true'); s.style.width = [74, 46, 50, 58, 44, 64][i] + 'px'; nav.appendChild(s); }
    }
  }
  mark();
  // Skjelettkort i innholdet til første side er tegnet (app.js bytter ut hele #view).
  var v = document.getElementById('view');
  if (v && !v.firstChild && r !== 'vaer' && r !== 'chat') {
    v.innerHTML = '<div class="skel52" aria-hidden="true"><div class="skel52-h"></div><div class="skel52-g"><div></div><div></div><div></div><div></div><div></div><div></div></div></div>';
    v.setAttribute('aria-busy', 'true');
  }
  de.classList.add('boot52');
})();
