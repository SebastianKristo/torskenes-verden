// Prompt 42 (SERVER42): kobler sammen modulene for prompt 42 (montert i index.js).
//   Finans: Glimt-søkedatabase + /search/ask (+ /stream), filter, avanserte oppgaver + PDF, Boliger web, import rett til Boliger, aksje-logoer → finans/finans42.js (+ search42, glimt-tasks42, homes42, pdf42)
//   Finn-bilder (bare annonsens egne, felles bilder fjernes)                                                                → finans/finn42.js (+ finn-routes.js)
//   Abonnementer som innebygd kalender                                                                                     → subs-cal42.js
//   Sporing: AliExpress (mappen «AliExpress») + Cainiao, PostNord-varianter/feilsøkingslogg/reserve, /api/tracking/debug/:id   → tracking42.js (+ tracking-carriers.js, tracking.js)
//   Gjøremål-Glimt deler opp: liste-kontrakt, prompt, lengdevakt, lokal forhåndsdeling, Angre                                → tasks-glimt42.js (+ tasks-glimt41.js)
//   Helse fra Home Assistant                                                                                                 → health42.js
//   Vel fremme: alias /api/velfremme/* → /api/hjemlys/*, admin kan avslutte andres økt (POST /api/hjemlys/:id/end)
//   Fanelinje: homeButton i /api/me/layout                                                                                    → mobile.js
import { Hono } from 'hono';
import { db } from './db.js';
import { isAdmin } from './auth.js';
import { authOrToken as authOrToken0 } from './mobile.js';
import { end40, sessionOut40 } from './hjemlys40.js';
import { glimtLog42 } from './tasks-glimt42.js';

const authOrToken = (c, next) => authOrToken0(c, next);
export { finans42Api } from './finans/finans42.js';
export { abCalendarsMw42, abApi42, calendarsEvents42, abIcs42 } from './subs-cal42.js';
export { tracking42Api } from './tracking42.js';
export { health42Api, familyHealthMw42, startHealth42 } from './health42.js';

/** POST /api/hjemlys/:id/end: eieren som før (hjemlys40.js); en administrator kan også avslutte andres økt («Avslutt for dem»). */
export const hjemlys42Api = new Hono();
hjemlys42Api.post('/:id/end', authOrToken, async (c, next) => {
  const s = db.prepare('SELECT * FROM hjemlys_sessions WHERE id=?').get(c.req.param('id'));
  if (!s || s.user_id === c.get('user')) return next();
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Fant ikke økta' }, 404);
  if (!['onTheWay', 'late'].includes(s.state)) return c.json({ session: await sessionOut40(s) });
  const n = await end40(s);
  try { db.prepare('INSERT INTO hjemlys_log(session_id, at, kind, text, who) VALUES(?,?,?,?,?)').run(s.id, Date.now(), 'end', 'Avsluttet av administrator', c.get('user')); } catch { /* */ }
  return c.json({ session: await sessionOut40(n), endedBy: 'admin' });
});
/** GET /api/tasks/glimt/log → {items:[{at, input_len, model, tasks_count, parse_ok, path}]} */
export const tasks42Api = new Hono();
tasks42Api.get('/glimt/log', authOrToken, (c) => c.json({ items: glimtLog42(c.get('user')) }));
