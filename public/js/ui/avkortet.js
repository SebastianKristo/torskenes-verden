// Avkortet tekst (E-B13): tekst som kuttes med «…» (text-overflow: ellipsis) får hele teksten som tooltip (title) når pekeren
// eller fokus kommer dit. Bare elementer som faktisk er avkortet, og aldri over en title som står der fra før. Blir teksten
// synlig igjen (bredere vindu), fjernes tooltipen vi satte. I Homelab gjelder det sidene i SIDER (body[data-route]), også arkene de
// åpner. Økonomi (public/finans/js/main.js) kobler den til Kvitteringer med egen sjekk.
const SIDER = new Set(['sporing', 'media', 'mediakveld']);
const MERKE = 'avkortet';

/** Er elementet kuttet med ellipse akkurat nå? */
export const erAvkortet = (el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;

function oppdater(el) {
  // Fra elementet under pekeren og noen nivåer opp (pekeren står ofte på et barn av det avkortede elementet).
  for (let n = el, i = 0; n && n.nodeType === 1 && n !== document.body && i < 4; n = n.parentElement, i++) {
    const egen = n.dataset[MERKE] === '1';
    if (n.hasAttribute('title') && !egen) return;
    if (erAvkortet(n)) {
      const tekst = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
      if (tekst) { n.setAttribute('title', tekst); n.dataset[MERKE] = '1'; }
      return;
    }
    if (egen) { n.removeAttribute('title'); delete n.dataset[MERKE]; }
  }
}

let bundet = false;
/** Kobles på én gang per side (app.js, finans/js/main.js). Lytter på pekeren og fokus i hele dokumentet, men gjør bare noe når
 *  gjelder() er sann (standard: sidene i SIDER). */
export function bindAvkortet(gjelder = () => SIDER.has(document.body.dataset.route)) {
  if (bundet) return;
  bundet = true;
  const på = (e) => { if (e.target instanceof Element && gjelder()) oppdater(e.target); };
  document.addEventListener('pointerover', på, { passive: true });
  document.addEventListener('focusin', på);
}
