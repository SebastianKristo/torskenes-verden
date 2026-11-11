// Prompt 86: én felles kilde for serverens hemmelighet (økter, app-tokens og krypterte innstillinger).
//
// Rekkefølge:
//   1. SESSION_SECRET fra miljøet (.env) – uendret, vinner alltid.
//   2. Lagret hemmelighet i DATA_DIR/session-secret (rettigheter 0600).
//   3. Ny installasjon: 48 tilfeldige byte lages, lagres i fila og brukes.
//   4. Eksisterende installasjon uten hemmelighet: de gamle reservenøklene i koden brukes nøyaktig som før (ellers ville alle blitt
//      logget ut og lagrede nøkler blitt uleselige) – med advarsel i oppstartsloggen og varsel til admin under Innstillinger → Sikkerhet.
//
// «Ny installasjon» = databasen (DATA_DIR/homelab.db) finnes ikke når serveren starter. Da finnes det verken brukere, økter eller
// krypterte verdier, så en ny nøkkel kan ikke gjøre noe uleselig. Avgjøres her, før db.js åpner (og dermed lager) databasen –
// db.js importerer denne modulen først. Finnes databasen fra før, røres ingenting.
//
// Tester (NODE_ENV=test eller kjørt av node --test) oppfører seg som før: ingen fil lages, og reservenøklene brukes når
// SESSION_SECRET ikke er satt. Fila følger med i restic-backupen (hele DATA_DIR); se docs/backup.md.
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { config } from './config.js';

export const SECRET_FILE86 = 'session-secret';
export const SECRET_HELP86 = 'Sett SESSION_SECRET i .env (lag en med: openssl rand -hex 32) og start serveren på nytt. NB: da blir alle logget ut, og lagrede integrasjonsnøkler må legges inn på nytt.';

const isTest = (env) => env.NODE_ENV === 'test' || !!env.NODE_TEST_CONTEXT;

/** Finner hemmeligheten for en data-mappe. → {source: 'env'|'file'|'legacy', secret, generated?, problem?} */
export function resolveSecret86({ env = process.env, dataDir = config.dataDir } = {}) {
  if (env.SESSION_SECRET) return { source: 'env', secret: '' }; // leses fra miljøet/config ved bruk
  if (isTest(env)) return { source: 'legacy', secret: '', test: true };
  const file = join(dataDir, SECRET_FILE86);
  if (existsSync(file)) {
    try {
      const s = readFileSync(file, 'utf8').trim();
      if (s.length < 32) return { source: 'legacy', secret: '', problem: `${file} er tom eller for kort` };
      try { if (statSync(file).mode & 0o077) chmodSync(file, 0o600); } catch { /* f.eks. filsystem uten rettigheter */ }
      return { source: 'file', secret: s };
    } catch (e) { return { source: 'legacy', secret: '', problem: `kunne ikke lese ${file} (${e.code ?? e.message})` }; }
  }
  if (existsSync(join(dataDir, 'homelab.db'))) return { source: 'legacy', secret: '' }; // eksisterende installasjon
  try {
    mkdirSync(dataDir, { recursive: true });
    const s = randomBytes(48).toString('base64url');
    writeFileSync(file, `${s}\n`, { mode: 0o600, flag: 'wx' });
    chmodSync(file, 0o600);
    return { source: 'file', secret: s, generated: true };
  } catch (e) {
    // To prosesser startet samtidig mot en tom mappe: den andre leser fila den første skrev.
    if (e.code === 'EEXIST') { try { const s = readFileSync(file, 'utf8').trim(); if (s.length >= 32) return { source: 'file', secret: s }; } catch { /* faller til reserve */ } }
    return { source: 'legacy', secret: '', problem: `kunne ikke lagre ${file} (${e.code ?? e.message})` };
  }
}

const state = resolveSecret86();

/**
 * Hemmeligheten alle moduler bruker. `legacy` er modulens gamle reservenøkkel og brukes bare på en eksisterende installasjon
 * uten hemmelighet. live=true leser SESSION_SECRET fra miljøet ved hvert kall (som modulene som brukte process.env direkte).
 */
export function sessionSecret86(legacy = '', live = false) {
  return (live ? process.env.SESSION_SECRET : config.sessionSecret) || state.secret || legacy;
}

/** Til admin (Innstillinger → Sikkerhet) og oppstartsloggen. Hemmeligheten selv er aldri med. */
export function secretStatus86() {
  const source = config.sessionSecret ? 'env' : state.source;
  if (source !== 'legacy' || state.test) return { source, warning: null };
  return { source, warning: `SESSION_SECRET er ikke satt. Økter, app-tokens og lagrede nøkler beskyttes med en fast reservenøkkel som står i kildekoden. ${SECRET_HELP86}` };
}

if (state.generated) console.log(`[secret] Ny installasjon: laget en tilfeldig hemmelighet i ${join(config.dataDir, SECRET_FILE86)} (0600). Ta den med i backupen, eller sett SESSION_SECRET i .env.`);
else if (state.problem) console.warn(`[secret] ADVARSEL: ${state.problem}.`);
if (!state.test) { const w = secretStatus86().warning; if (w) console.warn(`[secret] ADVARSEL: ${w}`); }
if (config.sessionSecret && config.sessionSecret.length < 32) console.warn('[config] SESSION_SECRET bør være minst 32 tegn.');
