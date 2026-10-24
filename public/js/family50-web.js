// Prompt 50 (FAMWEB50): Familie på web i nytt design (family50.js). Ruten #/familie og undersidene #/familie/kart,
// /person/<id>, /steder(/<id>), /helse(/<id>), /sjekk(/<id>) og /hjem (På vei hjem = dagens Vel fremme, hjemlys41.js).
// Undersidene håndteres av family50.js (ownsHash), så hele ruten ikke tegnes på nytt ved hver navigering.
import { mount50, ownsHash50, live50 } from './family50.js';
import { api } from './util.js';
import { onLive } from './realtime.js';
import { bindHjemlys, loadHjemlys } from './hjemlys40.js';
import { hl41Html, bindHl41 } from './hjemlys41.js';
import { zoneEvent45 } from './family45.js'; // prompt 45: sonevarsel-banneret mens siden er åpen

let unLive = null;
const subOfHash = () => location.hash.replace(/^#\/?familie/, '').replace(/^\//, '');
export function render() {
  bindHjemlys(); bindHl41();
  if (!unLive) unLive = onLive('family', (m) => { live50(m); if (location.hash.startsWith('#/familie')) for (const e of m.events ?? (m.event ? [m.event] : [])) zoneEvent45(e, null, null); });
  setTimeout(() => {
    const slot = document.getElementById('f50-slot');
    if (!slot) return;
    mount50(slot, {
      env: 'web', base: '#/familie', sub: subOfHash(), api, ownHash: true, wide: 900,
      dark: () => document.documentElement.dataset.mode === 'dark',
      home: () => { location.hash = '#/dash'; },
      settings: (tab) => import('./settings.js').then((m) => m.openSettings(tab || 'familie')).catch(() => {}),
      velfremme: (fam, repaint) => { if (!fam) return null; loadHjemlys(); return hl41Html(fam, repaint); },
    });
  });
  return '<div id="f50-slot"></div>';
}
export const ownsHash = ownsHash50;
document.addEventListener('hl40:update', () => { if (location.hash.startsWith('#/familie/hjem')) live50({ type: 'family', kind: 'hjemlys' }); });
