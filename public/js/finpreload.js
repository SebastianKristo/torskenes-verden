// Økonomi (prompt 20): når pekeren eller fokus kommer på en lenke til /finans/, forhåndslastes FinansHub-modulene
// (<link rel="modulepreload">) og stilarket, så lasteskjermen i /finans/ står kortest mulig.
const MODULES = ['main.js', 'core.js', 'desktop.js', 'modules.js', 'reanalyze.js', 'finn-desktop.js', 'subs-desktop.js'];
let done = false;

export function preloadFinans() {
  if (done) return;
  done = true;
  const add = (rel, href, as) => {
    if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = rel; l.href = href;
    if (as) l.as = as;
    document.head.appendChild(l);
  };
  for (const m of MODULES) add('modulepreload', `/assets/finans/js/${m}`);
  add('preload', '/assets/finans/css/finans.css', 'style');
}

const hit = (e) => { if (e.target?.closest?.('a[href^="/finans"]')) preloadFinans(); };
document.addEventListener('pointerover', hit, { passive: true });
document.addEventListener('focusin', hit);
document.addEventListener('touchstart', hit, { passive: true });
