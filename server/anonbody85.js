// Prompt 85 (SRVSEC85): store kropper tas bare imot fra innloggede klienter.
// Bakgrunn: serveren hadde ingen øvre grense for kroppen på ruter uten egen bodyLimit, og flere ruter leser kroppen FØR de
// sjekker innloggingen (POST /api/login, /api/auth/*, /finans/api/login, aliasene /api/homes/*, /api/receipts/scan,
// /api/velfremme/* og mellomvaren foran /api/tasks og /api/assist). En klient uten innlogging kunne dermed sende 150 MB til
// /api/login: hele kroppen ble lest inn i minnet (+570 MB per forespørsel) og passordet hashet (3,6 s CPU) før svaret «401».
// Noen få slike forespørsler samtidig er nok til at containeren går tom for minne.
// Nå: en kropp over 1 MB (eller uten oppgitt lengde) slipper bare gjennom når forespørselen har en gyldig økt eller et gyldig
// app-token. Ellers stoppes den ved 1 MB med 413. Vanlige forespørsler (opp til 1 MB) berøres ikke, og innloggingen sjekkes
// bare her når kroppen faktisk er stor – rutene gjør sin egen tilgangskontroll akkurat som før.
import { bodyLimit } from 'hono/body-limit';
import { sessionUser } from './auth.js';
import { tokenAccessOf } from './finans/routes.js';

export const ANON_BODY_MAX85 = 1024 * 1024;
const cap = bodyLimit({ maxSize: ANON_BODY_MAX85, onError: (c) => c.json({ error: 'Forespørselen er for stor. Logg inn først.' }, 413) });

export async function anonBodyCap85(c, next) {
  const m = c.req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
  const chunked = !!c.req.header('transfer-encoding');
  const len = c.req.header('content-length');
  if (!chunked && (len === undefined || Number(len) <= ANON_BODY_MAX85)) return next(); // ingen eller liten kropp
  let known = false;
  try { known = !!c.get('impersonation')?.target || !!sessionUser(c) || !!tokenAccessOf(c); } catch { /* ukjent klient */ }
  if (known) return next();
  return cap(c, next);
}
