// Prompt 53 (FERMION53/DAL53): felles hjelper for modellflagg. Kontrakt 53: hver lokal modell står bak et feature flag (QA51) som er
// PÅ som standard når modellen er tilgjengelig, med stille reserve når den mangler. QA51 lager alle nye flagg AV (defineFlag51);
// denne hjelperen bruker defineFlag51 og slår flagget på bare første gang det opprettes, så et senere admin-valg (av) beholdes.
// Flaggnavnene slutter på «53».
import { db } from './db.js';
import { defineFlag51, flagOn51 } from './qa51.js';

const row = (key) => { try { return db.prepare('SELECT key, default_on FROM flags51 WHERE key=?').get(key) ?? null; } catch { return null; } };

/** Som defineFlag51, men PÅ ved første opprettelse. Idempotent. */
export function defineFlagOn53(key, description = '') {
  const existed = !!row(key);
  defineFlag51(key, description);
  if (!existed) {
    try { db.prepare('UPDATE flags51 SET default_on=1, updated=? WHERE key=?').run(Date.now(), key); } catch { /* QA51 mangler: flagget er av */ }
  }
}
/** Serverstandarden for flagget (admin kan endre den på Flagg-siden). Ukjent flagg = av. */
export const flagDefault53 = (key) => !!row(key)?.default_on;
/** Per bruker (og enhet): enhet > bruker > standard. */
export const flagOn53 = (key, user, device = null) => { try { return flagOn51(key, user, device); } catch { return false; } };
