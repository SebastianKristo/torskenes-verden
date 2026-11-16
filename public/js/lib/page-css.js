// Side-CSS lastes ved behov: pageCss('media') legger inn /assets/css/pages/media.css én gang (sist i <head>, så siden vinner
// over skallet som før). ?v=<build> følger med fra denne modulens adresse (server/cache-bust.js), så service workeren kan cache fila.
// Sidene bruker designtokens (--ds-*). Mangler tokens.css på siden (f.eks. når Økonomi bruker en Homelab-modul), legges den inn først.
const V = (() => { try { return new URL(import.meta.url).search; } catch { return ''; } })();

function link(href, attr, value) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.setAttribute(attr, value);
  document.head.appendChild(l);
  return l;
}

function ensureTokens() {
  if (document.querySelector('link[href*="/assets/css/tokens.css"]')) return;
  link(`/assets/css/tokens.css${V}`, 'data-tokens-css', '');
}

/** Legger inn side-stilarket hvis det ikke finnes. → <link> */
export function pageCss(name) {
  if (typeof document === 'undefined') return null;
  const found = document.querySelector(`link[data-page-css="${name}"]`);
  if (found) return found;
  ensureTokens();
  return link(`/assets/css/pages/${name}.css${V}`, 'data-page-css', name);
}

/**
 * Venter til side-stilarket er lastet (eller feilet, eller maks ms har gått). Brukes før en side tegner innholdet sitt, så det ikke
 * vises uten stil først og så hopper på plass (M5: CLS på Skjold Lab). → Promise<void>
 */
export function pageCssReady(name, ms = 3000) {
  const l = pageCss(name);
  if (!l || l.sheet) return Promise.resolve();
  return new Promise((r) => {
    const done = () => { clearTimeout(t); r(); };
    const t = setTimeout(done, ms);
    l.addEventListener('load', done, { once: true });
    l.addEventListener('error', done, { once: true });
  });
}
