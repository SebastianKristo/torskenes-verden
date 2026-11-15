// Bibel: dagens bibelvers (1930-oversettelsen i server/data/bible1930-*.json), leserekke, leseplan, lagrede vers og påminnelse.
// Personlig modul: uten den svarer alle rutene 403 {enabled:false}. server/index.js kaller mountBibel(app) der /api/bible sto
// (etter dashbord-oppsettet, før profilene). Briefen (bibleForBrief) og fanelinja i Mer (bibleEnabled) bruker bible.js direkte.
import bibleApi from './bible.js';

export function mountBibel(app) {
  app.route('/api/bible', bibleApi); // sesjon eller app-token; admin ser og styrer hvem som har modulen (/users)
}
