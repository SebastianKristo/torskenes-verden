// Lange lister i porsjoner (Fase 3, B §3 P6). Den som tegner, tar med de første radene i HTML-en; resten legges til her:
// når den siste raden nærmer seg skjermen (IntersectionObserver, 1200 px før) eller når nettleseren er ledig. Sluttresultatet
// er det samme som å tegne alt på én gang, men første tegning blir mye mindre.
//
//   appendChunks(tbody, antallIgjen, (fra, n) => html, { step: 200 }) → stop()
//
// Stopper av seg selv når alt er lagt til, eller når beholderen er byttet ut (en ny tegning starter en ny runde).
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
const unidle = (id) => (window.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id));

export function appendChunks(box, remaining, next, { step = 200 } = {}) {
  let left = remaining, io = null, idleId = 0;
  const stop = () => { io?.disconnect(); io = null; if (idleId) unidle(idleId); idleId = 0; };
  const more = () => {
    if (!box.isConnected || left <= 0) return stop();
    const n = Math.min(step, left);
    box.insertAdjacentHTML('beforeend', next(remaining - left, n));
    left -= n;
    if (left <= 0) return stop();
    watch(); schedule();
  };
  const watch = () => {
    io?.disconnect();
    if (typeof IntersectionObserver !== 'function') return;
    io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) more(); }, { rootMargin: '1200px 0px' });
    if (box.lastElementChild) io.observe(box.lastElementChild);
  };
  const schedule = () => { if (!idleId) idleId = idle(() => { idleId = 0; more(); }); };
  if (left > 0) { watch(); schedule(); }
  return stop;
}
