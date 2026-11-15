// Laster Leaflet (kartbiblioteket) én gang for hele PWA-en: Familie-kartet, Soner og Kart bruker samme løfte.
// Leaflet ligger på serveren (/api/family/vendor). Den gamle reserven fra unpkg.com er fjernet: alle servere har hatt
// vendor-filene lenge, og et eksternt CDN brøt med at appen ikke skal hente kode utenfra.
let LF = null;
export function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (LF) return LF;
  LF = new Promise((res, rej) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/api/family/vendor/leaflet.css'; css.dataset.leaflet = '1';
      document.head.appendChild(css);
    }
    const s = document.createElement('script'); s.src = '/api/family/vendor/leaflet.js'; s.async = true;
    s.onload = () => res(window.L);
    s.onerror = () => { LF = null; s.remove(); rej(new Error('Kartet kunne ikke lastes')); };
    document.head.appendChild(s);
  });
  return LF;
}
