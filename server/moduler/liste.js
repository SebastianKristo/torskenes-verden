// Modullisten (shared/schemas/moduler.json), lest én gang. Grupperingen av integrasjoner ligger i tilkoblinger.js.
// Én kilde for navn, ikon, gruppe, ruter og gamle ruter på alle plattformer (E-ia §4, Q1–Q12). Klientene leser lista fra
// GET /api/moduler (index.js) i stedet for å ha egne lister.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAdmin } from '../auth/session.js';
import { mediaAllowed43 } from '../media/arr.js';
import { bibleEnabled } from '../bibel/bible.js';

const SHARED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'schemas');
const read = (f) => { const j = JSON.parse(readFileSync(join(SHARED, f), 'utf8')); delete j.$schema; delete j.$comment; return j; };

export const MODULER = Object.freeze(read('moduler.json'));

const TILGANG = { media: (u) => mediaAllowed43(u), bibel: (u) => bibleEnabled(u) };

/** Har brukeren tilgang til modulen? Admin-moduler bare for admin, moduler med egen tilgang (Media, Bibel) bare med den. */
export function harTilgang(u, m) {
  if (!u || !m) return false;
  if (m.adminOnly && !isAdmin(u)) return false;
  if (m.tilgang && !TILGANG[m.tilgang]?.(u)) return false;
  return true;
}

/**
 * Modullisten for én bruker: bare modulene brukeren har tilgang til (og ev. bare én plattform). Grupper uten moduler tas ut,
 * og toppmeny/bunnmeny tar bare med moduler som er igjen. Innstillingssider for admin bare for admin.
 * @param {string} u bruker-id
 * @param {{plattform?: 'web'|'ios'|'android'}} [o]
 */
export function modulerFor(u, { plattform } = {}) {
  const admin = isAdmin(u);
  const moduler = MODULER.moduler.filter((m) => harTilgang(u, m) && (!plattform || m.plattformer.includes(plattform)));
  const ids = new Set(moduler.map((m) => m.id)), grp = new Set(moduler.map((m) => m.gruppe));
  return {
    versjon: MODULER.versjon,
    grupper: MODULER.grupper.filter((g) => grp.has(g.id)),
    toppmeny: MODULER.toppmeny.filter((id) => ids.has(id)),
    bunnmeny: MODULER.bunnmeny.filter((id) => ids.has(id)),
    moduler,
    innstillinger: MODULER.innstillinger.filter((s) => !s.adminOnly || admin),
  };
}
