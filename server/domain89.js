// Prompt 89 (WEB89, claude-code-standard-serveradresser.md): standarddomenet er os.smarthjemeksperten.no (med k).
// Eldre versjoner lagret den feilstavede «…experten.no» som standard. En lagret adresse som er NØYAKTIG den gamle standarden
// (evt. med / til slutt eller store bokstaver) byttes til den nye – første gang den leses – og skrives tilbake. Andre adresser røres ikke.
import { kv } from './db.js';

export const OLD_PUBLIC_URL89 = 'https://os.smarthjem' + 'experten.no';
export const NEW_PUBLIC_URL89 = 'https://os.smarthjemeksperten.no';

/** Den nye standarden hvis v er nøyaktig den gamle, ellers v uendret. */
export function migrateUrl89(v) {
  if (typeof v !== 'string') return v;
  return v.trim().replace(/\/+$/, '').toLowerCase() === OLD_PUBLIC_URL89 ? NEW_PUBLIC_URL89 : v;
}

/** Leser kv(user,key) og migrerer feltet «external» (lagres tilbake ved endring). → objektet (aldri null). */
export function kvServer89(user, key) {
  const s = kv.get(user, key, {}) ?? {};
  if (s && typeof s === 'object' && typeof s.external === 'string') {
    const n = migrateUrl89(s.external);
    if (n !== s.external) { const next = { ...s, external: n }; try { kv.set(user, key, next); } catch { /* lesing skal aldri feile */ } return next; }
  }
  return s;
}
