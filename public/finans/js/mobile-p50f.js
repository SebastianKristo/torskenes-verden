// Prompt 50 (FAMWEB50): Familie i nytt design i PWA-en (Mobil Papir App → Familie, fasit Familie App.dc.html).
// Selve siden er felles med web: /assets/js/family50.js (Folk · Steder · Helse · Sjekk inn, Kart, Personside, Sted med flere
// områder, Helse for personen og Sjekk inn med 6b). Her: kroker fra mobile.js og sanntid fra WebSocket-en i mobile-p17.js.
//   #/fam            Folk (startside)            #/fam/kart          Kart med ark
//   #/fam/person/<id>[/kart|/helse/<id>]          Personside (tilbake går dit du kom fra)
//   #/fam/steder     Steder · /steder/<id> · /steder/ny/<type>  (4b: flere områder)
//   #/fam/helse      Helse · /helse/<id> (5b)    #/fam/sjekk         Sjekk inn · /sjekk/<id> (6b)
// Fullskjerm med egen fanelinje (som Media/Kalender): ingen bunnmeny, ingen skanneknapp. «‹ Hjem» går til Hjem.
// «På vei hjem» åpner dagens Vel fremme-ark (mobile-p40h.js, data-p40="hjopen").
import { hlApi } from './core.js';
import { m, draw } from './mobile.js';

let F = null;
export const on50 = () => !!F;
export function boot50() {
  import('/assets/js/family50.js').then((x) => {
    F = x;
    if (m.screen === 'fam') draw();
  }).catch((e) => console.warn('family50', e));
}
/** Plassholder; selve siden (og kartene) beholdes mellom tegningene og legges inn i afterDraw50. */
export function view50(scr) {
  if (scr !== 'fam' || !F) return null;
  return '<div class="f50-slot" data-f50-slot></div>';
}
export function afterDraw50() {
  if (m.screen !== 'fam' || !F) return;
  const slot = document.querySelector('#app [data-f50-slot]');
  if (!slot) return;
  F.mount50(slot, {
    env: 'pwa', base: '#/fam', sub: m.sub ?? '', api: hlApi, wide: 700, ownHash: false,
    dark: () => !m.light,
    home: () => { location.hash = '#/hl'; },
    settings: () => { location.hash = '#/set'; },
  });
}
/** WebSocket (mobile-p17.js): type 'family' – steder, innsjekker, posisjoner. Ruter › Min reise henter skolen på nytt ved endrede steder. */
export function live50(d) {
  if (d?.type !== 'family') return;
  if (d.kind === 'places') import('./mobile-p41b.js').then((x) => { if (x.RT) { x.RT.zonesT = 0; x.RT.s50 = null; } if (m.screen === 'avg') draw(); }).catch(() => {});
  if (F && m.screen === 'fam') F.live50(d);
}
