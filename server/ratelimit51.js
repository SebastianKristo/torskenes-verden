// Prompt 51 (SEC51): felles rate limiting og midlertidig sperre for innlogging, QR og app-token-utveksling.
// Per IP og per konto, eksponentiell: når antall feil når terskelen, sperres nøkkelen i base · 2^(feil − terskel), opp til et tak.
// Feiltelleren nullstilles etter vellykket innlogging, eller av seg selv når det ikke har vært feil på DECAY_MS.
// Tilstanden ligger i SQLite (sec51_limits), så en omstart ikke åpner for nye forsøk. Vises (og kan låses opp) i Innstillinger →
// Sikkerhet → Sperrer (bare admin, sec51.js). Avhenger bare av db.js, så auth.js kan bruke den uten sirkulær import.
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS sec51_limits (key TEXT PRIMARY KEY, scope TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0, locks INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, first_fail INTEGER, last_fail INTEGER);`);

export const SCOPES51 = { login: 'Innlogging', qr: 'QR-innlogging', token: 'App-token' };
// threshold = feil før første sperre, base = første sperre, max = tak. Konto-sperren er kortere (den kan misbrukes mot eieren).
export const POLICY51 = {
  ip: { threshold: 5, base: 60_000, max: 6 * 3600_000 },
  acct: { threshold: 10, base: 60_000, max: 3600_000 },
  decayMs: 24 * 3600_000,
};
const keyOf = (scope, kind, subject) => `${scope}:${kind}:${String(subject ?? '').slice(0, 120)}`;
const row = (k) => db.prepare('SELECT * FROM sec51_limits WHERE key=?').get(k);
const listeners = new Set();
/** fn({scope, kind, subject, fails, lockedUntil, lockMs}) kalles hver gang en nøkkel blir sperret. */
export const onLock51 = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Sekunder til sperren slipper (0 = ikke sperret). */
export function blocked51(scope, kind, subject, now = Date.now()) {
  if (!subject) return 0;
  const r = row(keyOf(scope, kind, subject));
  return r && r.locked_until > now ? Math.ceil((r.locked_until - now) / 1000) : 0;
}

/** Registrerer en feil. → {fails, lockedUntil, lockMs} */
export function fail51(scope, kind, subject, now = Date.now()) {
  if (!subject) return { fails: 0, lockedUntil: 0, lockMs: 0 };
  const k = keyOf(scope, kind, subject), p = POLICY51[kind] ?? POLICY51.ip;
  const r = row(k);
  const fresh = !r || (r.last_fail ?? 0) < now - POLICY51.decayMs;
  const fails = fresh ? 1 : r.fails + 1;
  let lockedUntil = fresh ? 0 : r.locked_until, locks = fresh ? 0 : r.locks, lockMs = 0;
  if (fails >= p.threshold) {
    lockMs = Math.min(p.max, p.base * 2 ** Math.min(30, fails - p.threshold));
    lockedUntil = now + lockMs;
    locks++;
  }
  db.prepare(`INSERT INTO sec51_limits(key, scope, kind, subject, fails, locks, locked_until, first_fail, last_fail) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET fails=excluded.fails, locks=excluded.locks, locked_until=excluded.locked_until, first_fail=excluded.first_fail, last_fail=excluded.last_fail`)
    .run(k, scope, kind, String(subject).slice(0, 120), fails, locks, lockedUntil, fresh ? now : r.first_fail ?? now, now);
  if (lockMs) for (const fn of listeners) { try { fn({ scope, kind, subject: String(subject), fails, lockedUntil, lockMs }); } catch { /* lytteren skal aldri stoppe innloggingen */ } }
  return { fails, lockedUntil, lockMs };
}

/** Vellykket: nøkkelen glemmes. */
export function clear51(scope, kind, subject) {
  if (!subject) return 0;
  return db.prepare('DELETE FROM sec51_limits WHERE key=?').run(keyOf(scope, kind, subject)).changes;
}

/** Aktive nøkler (feil siste døgn eller sperret nå), nyeste først. Brukes av Sperrer-visningen. */
export function list51(now = Date.now()) {
  return db.prepare('SELECT * FROM sec51_limits WHERE locked_until>? OR last_fail>? ORDER BY locked_until DESC, last_fail DESC LIMIT 500').all(now, now - POLICY51.decayMs)
    .map((r) => ({ key: r.key, scope: r.scope, scopeLabel: SCOPES51[r.scope] ?? r.scope, kind: r.kind, subject: r.subject, fails: r.fails, locks: r.locks,
      locked: r.locked_until > now, lockedUntil: r.locked_until > now ? new Date(r.locked_until).toISOString() : null,
      secondsLeft: r.locked_until > now ? Math.ceil((r.locked_until - now) / 1000) : 0,
      firstFail: r.first_fail ? new Date(r.first_fail).toISOString() : null, lastFail: r.last_fail ? new Date(r.last_fail).toISOString() : null }));
}
/** Lås opp (admin). */
export const unlock51 = (key) => db.prepare('DELETE FROM sec51_limits WHERE key=?').run(String(key ?? '')).changes;

// Gamle nøkler ryddes hver time.
setInterval(() => { try { db.prepare('DELETE FROM sec51_limits WHERE locked_until<? AND COALESCE(last_fail,0)<?').run(Date.now(), Date.now() - POLICY51.decayMs); } catch { /* */ } }, 3600_000).unref();
