// Idempotency-Key på opplastinger av kvitteringer (P85 G). En app som laster opp på nytt etter et brutt svar (dårlig nett,
// prosessdød, kø uten nett), sender samme nøkkel, og serveren gir det første svaret i stedet for å lage en kvittering til.
//
//   Idempotency-Key: <8–128 tegn: a–z, A–Z, 0–9, . _ : ->   (valgfri; uten nøkkel er alt som før)
//
// - Første forespørsel med en nøkkel kjøres som vanlig. Et vellykket svar (2xx, JSON) lagres per bruker og rute i 24 timer.
// - Samme nøkkel igjen fra samme bruker på samme rute → samme status og innhold, med «Idempotent-Replayed: true». Ingen ny
//   kvittering, ingen ny jobb.
// - Mens den første fortsatt kjører → 409 {code:'IDEMPOTENCY_IN_PROGRESS'} (appen prøver igjen litt senere).
// - Feilet den første (4xx/5xx), slettes nøkkelen, så et nytt forsøk kjøres på nytt.
// - Ugyldig nøkkel → 400 {code:'IDEMPOTENCY_KEY_INVALID'}.
// Nøkkelen er per bruker: samme nøkkel fra en annen bruker gir aldri den førstes svar.
import { db, q } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS fh_idempotency (
  user_id TEXT NOT NULL,
  route TEXT NOT NULL,
  key TEXT NOT NULL,
  status INTEGER,             -- NULL mens den første forespørselen kjører
  body TEXT,
  created INTEGER NOT NULL,
  PRIMARY KEY (user_id, route, key)
)`);

export const IDEMPOTENCY_TTL_MS = 24 * 3600_000;
const STALE_MS = 10 * 60_000; // en reservasjon som aldri ble fullført (krasj), slippes etter 10 min
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

const prune = (now) => q('DELETE FROM fh_idempotency WHERE created < ? OR (status IS NULL AND created < ?)').run(now - IDEMPOTENCY_TTL_MS, now - STALE_MS);

/** Hono-mellomvare. Settes etter tilgangskontrollen (c.get('user') må være satt). Nøkkelen gjelder per bruker og sti
 *  (/finans/api/receipts/scan og aliaset /api/receipts/scan regnes som samme sti). */
export const idempotent = async (c, next) => {
  const key = c.req.header('idempotency-key');
  const route = `${c.req.method} ${c.req.path.replace(/^\/finans\/api(?=\/)/, '')}`;
  if (key == null || key === '') return next();
  if (!KEY_RE.test(key)) return c.json({ error: 'Idempotency-Key må være 8–128 tegn (bokstaver, tall, punktum, kolon, bindestrek eller understrek)', code: 'IDEMPOTENCY_KEY_INVALID' }, 400);
  const user = String(c.get('user') ?? ''), now = Date.now();
  prune(now);
  const reserved = q('INSERT OR IGNORE INTO fh_idempotency(user_id, route, key, status, body, created) VALUES(?,?,?,NULL,NULL,?)').run(user, route, key, now).changes === 1;
  if (!reserved) {
    const row = q('SELECT status, body FROM fh_idempotency WHERE user_id=? AND route=? AND key=?').get(user, route, key);
    if (row?.status == null) return c.json({ error: 'En opplasting med samme Idempotency-Key pågår. Prøv igjen om litt.', code: 'IDEMPOTENCY_IN_PROGRESS' }, 409, { 'Retry-After': '2' });
    return c.body(row.body, row.status, { 'Content-Type': 'application/json; charset=UTF-8', 'Idempotent-Replayed': 'true', 'Cache-Control': 'no-store' });
  }
  let stored = false;
  try {
    await next();
    const res = c.res;
    if (res && res.status >= 200 && res.status < 300 && /json/i.test(res.headers.get('content-type') ?? '')) {
      const body = await res.clone().text();
      q('UPDATE fh_idempotency SET status=?, body=? WHERE user_id=? AND route=? AND key=?').run(res.status, body, user, route, key);
      stored = true;
    }
  } finally {
    if (!stored) q('DELETE FROM fh_idempotency WHERE user_id=? AND route=? AND key=?').run(user, route, key);
  }
};
