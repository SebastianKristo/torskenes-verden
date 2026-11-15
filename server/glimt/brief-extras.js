// Brief: feltene som legges på GET /api/brief etter at briefen er laget (før: briefJul40 i api40.js og brief41 i api41.js, to
// mellomvarer etter hverandre). Nå én mellomvare, montert med mountBriefExtras(app) i index.js der de to sto (før mountGlimt,
// som har selve /api/brief-handleren).
//   ski:{text, chip:'Ski: blå', …, places[]}  når skiføret er relevant (vaer/week-glimt.js)
//   mai17:{title, text, items, active, greeting} på 17. mai (mai17-41.js)
//   minReise:{leftSchoolAt, title, homeCard}  når «forlot skolen» er aktiv (ruter41.js)
//   jul:{phase, label, outfit, countdown, countdownText, luke:{n, text}|null, aaret?, snow}  når julemodus er på (jul40.js)
// Skiføre i GET /api/weather/full ligger i server/vaer/layout.js.
import { sessionUser } from '../auth/session.js';
import { ski41 } from '../vaer/week-glimt.js';
import { glimtSettingsOf } from './settings.js';
import { mai17Active, mai17Day41 } from '../mai17-41.js';
import { journeyOf41 } from '../ruter41.js';
import { julBrief } from '../jul40.js';

const BRIEF = /^\/api\/brief\/?$/;
const AARET = { title: 'Året ditt', text: 'Glimt oppsummerer året ditt: økonomi, trening, serier og steder.' };

/** Ski, 17. mai og Min reise. Feiler én del, legges ingenting av disse til (som før). */
async function seasonal(u) {
  const out = {};
  const ski = await ski41(u);
  if (ski) out.ski = ski;
  const s = glimtSettingsOf(u), m = mai17Active(s, Date.now(), u);
  if (m.day) { const d = await mai17Day41(u, s); out.mai17 = { ...d.brief, active: m, greeting: d.greeting }; }
  const j = journeyOf41(u);
  if (j.showOnHome) out.minReise = { leftSchoolAt: j.leftSchoolAt, title: j.title, homeCard: j.homeCard };
  return out;
}

export async function briefExtras(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !BRIEF.test(c.req.path)) return;
  let u, j;
  try {
    u = c.get('user') ?? sessionUser(c);
    if (!u) return;
    j = await c.res.clone().json();
  } catch { return; } // svaret står
  let add = {};
  try { add = await seasonal(u); } catch { add = {}; }
  let jul = null;
  try { jul = julBrief(glimtSettingsOf(u), Date.now(), { aaret: AARET }); } catch { jul = null; }
  if (!Object.keys(add).length && !jul) return;
  c.res = c.json({ ...j, ...add, ...(jul ? { jul } : {}) }, 200, { 'Cache-Control': 'no-store' });
}

/** index.js: før mountGlimt (handleren for /api/brief), så feltene legges på det ferdige svaret. */
export function mountBriefExtras(app) {
  app.use('/api/brief', briefExtras);
}
