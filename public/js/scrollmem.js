// Scrollposisjon per rute (prompt 23). Går du inn på en underside og tilbake, havner du der du var.
// Nye sider åpner øverst (eller på «top», prompt 87), og posisjonen til siden du gikk tilbake fra glemmes, så den åpner øverst neste gang.
// Hver historikkoppføring får et løpenummer i history.state; et lavere nummer enn forrige betyr «tilbake».
// Bruk: const sm = scrollMemory(); … i ruteren: sm.enter(nøkkel) etter at den nye siden er tegnet.

const NO_STATE = () => (history.state && typeof history.state === 'object' ? history.state : {});

export function scrollMemory({ el = () => document.scrollingElement || document.documentElement } = {}) {
  try { history.scrollRestoration = 'manual'; } catch { /* eldre nettlesere */ }
  const mem = new Map(); // løpenummer → scrollTop
  let cur = null, lastY = 0, seq = 0, userMoved = false;
  const target = () => el();
  const scroller = target() === document.scrollingElement || target() === document.documentElement ? window : target();
  const stop = () => { userMoved = true; guard = null; };
  for (const ev of ['wheel', 'touchstart', 'touchmove', 'keydown', 'mousedown', 'pointerdown']) window.addEventListener(ev, stop, { passive: true });

  // Fase 3 (B §3 P3/B6): før ble scrollTop lest og satt hvert 50.–60. ms i 1,5 s etter hver navigasjon (15–25 tvungne layouter per
  // rutebytte). Nå settes posisjonen én gang, og den rettes bare når noe faktisk flytter den: en scroll-hendelse som ikke kom fra
  // brukeren, eller at innholdet vokser (ResizeObserver, som kjører etter layout). Brukerinput (hjul, berøring, tast, mus) avbryter.
  //   keep: true  – hold posisjonen hele perioden (ny side øverst: deler som lastes etterpå skal ikke trekke den ned)
  //   keep: false – ferdig så snart posisjonen er nådd (tilbake: siden kan være for kort til innholdet er lastet)
  let guard = null;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fix()) : null;
  function fix() {
    const g = guard;
    if (!g) return;
    if (userMoved || Date.now() - g.t0 > 1500) { guard = null; ro?.disconnect(); return; }
    const s = target();
    if (Math.abs(s.scrollTop - g.y) >= (g.keep ? 1 : 2)) s.scrollTop = g.y;
    lastY = s.scrollTop;
    if (!g.keep && Math.abs(s.scrollTop - g.y) < 2) { guard = null; ro?.disconnect(); }
  }
  function hold(y, keep) {
    userMoved = false;
    guard = { y, keep, t0: Date.now() };
    const s = target();
    if (Math.abs(s.scrollTop - y) >= 1) s.scrollTop = y;
    lastY = s.scrollTop;
    if (!keep && Math.abs(s.scrollTop - y) < 2) { guard = null; return; }
    if (ro) {
      ro.disconnect();
      const box = s === document.documentElement || s === document.scrollingElement ? document.body : s;
      for (const c of box?.children ?? []) ro.observe(c);
    }
    setTimeout(fix, 1550); // slipper vakten selv om ingenting skjer
  }
  // Rettingen etter en scroll-hendelse venter til neste bilde (én gang per bilde, uansett hvor mange hendelser som kommer).
  let fixQ = 0;
  const later = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
  const track = () => { lastY = target().scrollTop; if (guard && !fixQ) fixQ = later(() => { fixQ = 0; fix(); }); };
  scroller.addEventListener('scroll', track, { passive: true });

  // Innholdet lastes ofte etter tegningen, så siden kan være for kort i starten. Prøv igjen når innholdet vokser.
  function restore(y) { hold(y, false); }

  // Prompt 50 (claude-code-web-fanebytte-scroll-topp.md): ny fane/side starter alltid øverst – også når deler som lastes etterpå
  // (Matplan, Media, Kart) monteres og trekker posisjonen ned, eller nettleseren klemmer den mot bunnen av en kortere side.
  // Toppen holdes i 1,5 s etter fanebyttet, men slippes straks brukeren selv scroller (hjul, berøring, tast, mus).
  // Prompt 87 (claude-code-web-navigasjon-uten-reload.md): y er 0 for en ny modul, og min(nåværende, heroHøyde) for en ny side i samme
  // modul (FinansHub: Oversikt → Boliger), så sidemenyen og toppen står der de er og innholdet starter øverst i innholdsområdet.
  function pinTop(y = 0) {
    hold(y, true);
    if (scroller === window && y === 0 && target().scrollTop !== 0) { try { window.scrollTo(0, 0); } catch { /* */ } }
  }

  return {
    /** Kalles etter at ruten er tegnet. key skiller sider (f.eks. «inn»); samme nøkkel som nå gjør ingenting.
     *  top (prompt 87): posisjonen en NY oppføring åpner på (tall eller funksjon), standard 0. Tilbake/frem bruker alltid den huskede. */
    enter(key, { top = 0 } = {}) {
      const st = NO_STATE();
      let idx = st.__sx;
      if (cur && cur.key === key && cur.idx === idx) return;
      if (cur) mem.set(cur.idx, lastY);
      if (idx == null) {
        // Ny oppføring (lenke eller location.hash = …): neste nummer, og øverst.
        idx = cur ? Math.max(cur.idx, seq) + 1 : 0;
        seq = idx;
        try { history.replaceState({ ...st, __sx: idx }, ''); } catch { /* sandkasse */ }
        // Oppføringer etter denne finnes ikke lenger.
        for (const k of [...mem.keys()]) if (k >= idx) mem.delete(k);
        const y = Math.max(0, Math.round(typeof top === 'function' ? top() : top) || 0);
        pinTop(y);
      } else if (cur && idx < cur.idx) {
        // Tilbake: siden vi forlot glemmes, og forrige side får posisjonen sin igjen.
        mem.delete(cur.idx);
        restore(mem.get(idx) ?? 0);
      } else {
        restore(mem.get(idx) ?? 0);
      }
      seq = Math.max(seq, idx);
      cur = { key, idx };
    },
    /** Lagrer posisjonen nå (før siden byttes uten ny historikk, f.eks. en fane i samme rute). */
    save() { if (cur) mem.set(cur.idx, target().scrollTop); },
  };
}

/**
 * For undersider inni en side (f.eks. en innstillingsliste med undersider) uten egen historikk:
 * husk posisjonen til listen når en underside åpnes, og gi den tilbake når brukeren går tilbake.
 */
export function subScroll() {
  const mem = new Map();
  return {
    /** Kalles når en underside åpnes fra parentKey med listens scrollTop. */
    leave(parentKey, top) { mem.set(parentKey, top); },
    /** Kalles når brukeren går tilbake til parentKey. Gir lagret posisjon (og glemmer den), eller 0. */
    back(parentKey) { const v = mem.get(parentKey) ?? 0; mem.delete(parentKey); return v; },
  };
}
