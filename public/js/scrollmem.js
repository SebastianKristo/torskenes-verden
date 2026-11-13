// Scrollposisjon per rute (prompt 23). Går du inn på en underside og tilbake, havner du der du var.
// Nye sider åpner øverst (eller på «top», prompt 87), og posisjonen til siden du gikk tilbake fra glemmes, så den åpner øverst neste gang.
// Hver historikkoppføring får et løpenummer i history.state; et lavere nummer enn forrige betyr «tilbake».
// Bruk: const sm = scrollMemory(); … i ruteren: sm.enter(nøkkel) etter at den nye siden er tegnet.

const NO_STATE = () => (history.state && typeof history.state === 'object' ? history.state : {});

export function scrollMemory({ el = () => document.scrollingElement || document.documentElement } = {}) {
  try { history.scrollRestoration = 'manual'; } catch { /* eldre nettlesere */ }
  const mem = new Map(); // løpenummer → scrollTop
  let cur = null, lastY = 0, seq = 0, timer = 0, userMoved = false;
  const target = () => el();
  const track = () => { lastY = target().scrollTop; };
  const scroller = target() === document.scrollingElement || target() === document.documentElement ? window : target();
  scroller.addEventListener('scroll', track, { passive: true });
  const stop = () => { userMoved = true; };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'mousedown']) window.addEventListener(ev, stop, { passive: true });

  // Innholdet lastes ofte etter tegningen, så siden kan være for kort i starten. Prøv igjen en liten stund.
  function restore(y) {
    clearTimeout(timer);
    userMoved = false;
    const t0 = Date.now();
    const step = () => {
      const s = target();
      s.scrollTop = y;
      lastY = s.scrollTop;
      if (userMoved || Math.abs(s.scrollTop - y) < 2 || Date.now() - t0 > 1500) return;
      timer = setTimeout(step, 50);
    };
    step();
  }

  // Prompt 50 (claude-code-web-fanebytte-scroll-topp.md): ny fane/side starter alltid øverst – også når deler som lastes etterpå
  // (Matplan, Media, Kart) monteres og trekker posisjonen ned, eller nettleseren klemmer den mot bunnen av en kortere side.
  // Toppen holdes i 1,5 s etter fanebyttet, men slippes straks brukeren selv scroller (hjul, berøring, tast, mus).
  // Prompt 87 (claude-code-web-navigasjon-uten-reload.md): y er 0 for en ny modul, og min(nåværende, heroHøyde) for en ny side i samme
  // modul (FinansHub: Oversikt → Boliger), så sidemenyen og toppen står der de er og innholdet starter øverst i innholdsområdet.
  function pinTop(y = 0) {
    clearTimeout(timer);
    userMoved = false;
    const t0 = Date.now();
    const s0 = target();
    if (Math.abs(s0.scrollTop - y) >= 1) s0.scrollTop = y;
    lastY = y;
    if (scroller === window && y === 0) { try { window.scrollTo(0, 0); } catch { /* */ } }
    const step = () => {
      if (userMoved || Date.now() - t0 > 1500) return;
      const s = target();
      if (Math.abs(s.scrollTop - y) >= 1) { s.scrollTop = y; lastY = s.scrollTop; }
      timer = setTimeout(step, 60);
    };
    timer = setTimeout(step, 30);
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
