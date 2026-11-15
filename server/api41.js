// Prompt 41 (SERVER41): kobler sammen modulene for prompt 41 (montert i index.js).
//   Hjemlys «Si fra» + tur til valgfritt mål: /api/hjemlys/notice|status|notices|recipients, start {destination}            → server/familie/ (mountFamilie)
//   Min reise: /api/ruter/my-routes|my-trip|school-zones|left-school|journey|settings                                     → ruter41.js
//   PostNord uten nøkkel (recipientview), dynamisk polling, push ved endring, helsesjekk GET /api/tracking/postnord/health → server/sporing/ (mountSporing)
//   Gjøremål-Glimt i bakgrunnen + «Laget med Glimt»: /api/tasks/glimt {async:true}, /glimt/jobs, /glimt/sources           → server/gjoremal/
//     alias POST /api/huske/glimt-jobs; /api/assist gjenkjenner huskebeskjeder                                           → server/gjoremal/, assist.js
//   Chat: «Mine data» på som standard, «✦ Auto»                                                                        → settings.js, chat41.js (+ chat.js)
//   Vær-uke via Glimt (Ollama + 7 dager), skiføre i brief/Vær, Rediger Vær                                               → server/vaer/ (+ assist.js, chat.js), brief under
//   AI-jobber: createdAt/startedAt/endedAt + timeLabel                                                                 → ai41.js (+ ai-run.js)
//   Finans: Les på nytt for alle statuser, receipt_reads, /receipts/:id/reread, /receipts/:id/review                    → finans/routes.js
//   17. mai: /api/glimt/settings mai17/mai17Active, /api/glimt/mai17, brief.mai17                                       → mai17-41.js (+ glimt35.js)
//   Innlogging uten adresse + Kalender-innlogging: /api/discovery, /api/me/server, /api/auth/device-*, app-code, token, /app-auth → auth/app-login.js (montert fra auth/index.js)
import { sessionUser } from './auth/session.js';
import { ski41 } from './vaer/week-glimt.js';
import { glimtSettingsOf } from './glimt35.js';
import { mai17Active, mai17Day41 } from './mai17-41.js';
import { journeyOf41 } from './ruter41.js';

export { ruter41Api } from './ruter41.js';
export { mai17Api } from './mai17-41.js';

/* ---------------- Brief: skiføre, 17. mai og Min reise ---------------- */
// GET /api/brief får ski:{text, chip:'Ski: blå', …, places[]} når relevant, mai17:{title, text, items, active} på 17. mai og minReise når «forlot skolen» er aktiv.
// (Skiføre i GET /api/weather/full ligger i server/vaer/layout.js.)
async function augment(c, path, fn) {
  if (c.req.method !== 'GET' || c.res.status !== 200 || !path.test(c.req.path)) return;
  try {
    const u = c.get('user') ?? sessionUser(c);
    if (!u) return;
    const j = await c.res.clone().json();
    const add = await fn(u, j);
    if (add && Object.keys(add).length) c.res = c.json({ ...j, ...add }, 200, { 'Cache-Control': 'no-store' });
  } catch { /* svaret står */ }
}
export async function brief41(c, next) {
  await next();
  await augment(c, /^\/api\/brief\/?$/, async (u) => {
    const out = {};
    const ski = await ski41(u);
    if (ski) out.ski = ski;
    const s = glimtSettingsOf(u), m = mai17Active(s, Date.now(), u);
    if (m.day) { const d = await mai17Day41(u, s); out.mai17 = { ...d.brief, active: m, greeting: d.greeting }; }
    const j = journeyOf41(u);
    if (j.showOnHome) out.minReise = { leftSchoolAt: j.leftSchoolAt, title: j.title, homeCard: j.homeCard };
    return out;
  });
}
