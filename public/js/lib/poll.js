// Periodisk henting som bare går når resultatet vises (Fase 3, B §3 P2/B7).
//
//   const p = poll(() => load('trading'), 60_000, { visible: () => route === 'dash' });
//
// - Pauser når fanen er skjult (document.hidden) eller visible() gir false. Ingen tidtaker går mens den er pauset.
// - Når siden blir synlig igjen (visibilitychange) eller noen kaller wakePolls() (f.eks. ruteren etter et fanebytte),
//   hentes det med en gang hvis intervallet har gått siden forrige henting, ellers når resten av intervallet har gått.
// - first: 'now' henter med en gang (også når den ikke vises), 'visible' (standard) venter til den vises,
//   'idle' henter én gang når nettleseren er ledig hvis den ikke vises (så siden er klar når brukeren går dit),
//   'wait' henter først når ett intervall har gått (den som kaller har nettopp hentet selv).
// Returnerer { stop(), now() }: now() henter med en gang og starter intervallet på nytt.

const all = new Set();

const idle = (fn, timeout = 4000) => (globalThis.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 1500));

export function poll(fn, ms, { visible = () => true, first = 'visible' } = {}) {
  let last = 0, timer = 0, stopped = false;
  const shown = () => !document.hidden && visible();
  const run = () => {
    last = Date.now();
    try { Promise.resolve(fn()).catch(() => { /* hentefeil vises av den som henter */ }); } catch (e) { console.warn('[poll]', e); }
  };
  const fire = () => { timer = 0; check(); };
  function check() {
    if (stopped || timer || !shown()) return;
    const due = last + ms - Date.now();
    if (due <= 0) { run(); timer = setTimeout(fire, ms); } else timer = setTimeout(fire, due);
  }
  const p = {
    check,
    stop() { stopped = true; clearTimeout(timer); timer = 0; all.delete(p); },
    now() { clearTimeout(timer); timer = 0; run(); if (!stopped) timer = setTimeout(fire, ms); },
  };
  all.add(p);
  if (first === 'wait') { last = Date.now(); check(); }
  else if (first === 'now') p.now();
  else if (shown()) check();
  else if (first === 'idle') idle(() => { if (!stopped && !last) run(); });
  return p;
}

/** Ser etter om noen pausede hentinger skal i gang igjen (kalles etter rutebytte). */
export function wakePolls() { for (const p of all) p.check(); }

document.addEventListener('visibilitychange', () => { if (!document.hidden) wakePolls(); });
