// Prompt 41 (SERVER41): kobler sammen modulene for prompt 41 (montert i index.js).
//   Hjemlys «Si fra» + tur til valgfritt mål: /api/hjemlys/notice|status|notices|recipients, start {destination}            → hjemlys41.js (+ hjemlys40.js dest_*)
//   Min reise: /api/ruter/my-routes|my-trip|school-zones|left-school|journey|settings                                     → ruter41.js
//   PostNord uten nøkkel (recipientview), dynamisk polling, push ved endring, helsesjekk GET /api/tracking/postnord/health → tracking-carriers.js, tracking.js
//   Gjøremål-Glimt i bakgrunnen + «Laget med Glimt»: /api/tasks/glimt {async:true}, /glimt/jobs, /glimt/sources           → tasks-glimt41.js (+ tasks.js)
//     alias POST /api/huske/glimt-jobs; /api/assist gjenkjenner huskebeskjeder                                           → under, assist.js
//   Chat: «Mine data» på som standard, «✦ Auto»                                                                        → settings.js, chat41.js (+ chat.js)
//   Vær-uke via Glimt (Ollama + 7 dager), skiføre i brief/Vær                                                          → weather41.js (+ assist.js, chat.js), under
//   AI-jobber: createdAt/startedAt/endedAt + timeLabel                                                                 → ai41.js (+ ai-run.js)
//   Finans: Les på nytt for alle statuser, receipt_reads, /receipts/:id/reread, /receipts/:id/review                    → finans/routes.js
//   Bursdager: /api/birthdays/:id/photos                                                                               → birthdays41.js (+ birthdays.js)
//   17. mai: /api/glimt/settings mai17/mai17Active, /api/glimt/mai17, brief.mai17                                       → mai17-41.js (+ glimt35.js)
//   Innlogging uten adresse + Kalender-innlogging: /api/discovery, /api/me/server, /api/auth/device-*, app-code, token, /app-auth → auth41.js
//   Kalender: POST /api/kalender/glimt/search, /api/kalender/notify/test, /api/push/test                                 → kalender41.js
import { Hono } from 'hono';
import { kv } from './db.js';
import { authOrToken as authOrToken0 } from './mobile.js';
import { sessionUser } from './auth.js';
import { startJob41 } from './tasks-glimt41.js';
import { ski41 } from './weather41.js';
import { glimtSettingsOf } from './glimt35.js';
import { mai17Active, mai17Day41 } from './mai17-41.js';
import { postnordHealth41 } from './tracking-carriers.js';
import { journeyOf41 } from './ruter41.js';

const authOrToken = (c, next) => authOrToken0(c, next); // sen binding
export { hjemlys41Api, hjemlysGet41, hlPage41 } from './hjemlys41.js';
export { ruter41Api } from './ruter41.js';
export { birthdays41Api } from './birthdays41.js';
export { mai17Api } from './mai17-41.js';
export { kalender41Api } from './kalender41.js';
export { mountAuth41 } from './auth41.js';

/* ---------------- Huskeliste-alias ---------------- */
// POST /api/huske/glimt-jobs {text, list?, origin?:'huske'|'home_search'} → 202 {job_id, jobId, placeholder}
export const huske41Api = new Hono();
huske41Api.post('/glimt-jobs', authOrToken, async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  try { const j = startJob41(c.get('user'), String(b.text ?? b.q ?? ''), { list: b.list ?? null, origin: b.origin ?? 'huske' }); return c.json({ job_id: j.jobId, ...j }, 202); }
  catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
});

/* ---------------- Sporing: helsesjekk for PostNord ---------------- */
// GET /api/tracking/postnord/health → {endpoint, unofficial:true, ok, shapeOk, lastOkAt, lastErrorAt, lastError, blockedUntil, calls, text:'OK · offentlig endepunkt'}
export const tracking41Api = new Hono();
tracking41Api.get('/postnord/health', authOrToken, (c) => c.json(postnordHealth41()));

/* ---------------- Vær: rediger kort (vaer_layout) ---------------- */
// GET/PUT /api/weather/layout {order:[kort], hidden:[kort], ski:true|false, glimt:'top'|'bottom'} – per bruker, mobil og brett.
export const VAER_CARDS41 = ['na', 'ski', 'timer', 'dager10', 'yrstorm', 'vind', 'mane', 'detaljer', 'glimtuka'];
const layoutOut = (u) => { const l = kv.get(u, 'vaer_layout', {}) ?? {}; return { order: Array.isArray(l.order) ? l.order : VAER_CARDS41, hidden: Array.isArray(l.hidden) ? l.hidden : [], ski: l.ski !== false, glimt: l.glimt === 'top' ? 'top' : 'bottom', cards: VAER_CARDS41 }; };
export const weather41Api = new Hono();
weather41Api.get('/layout', authOrToken, (c) => c.json(layoutOut(c.get('user'))));
weather41Api.put('/layout', authOrToken, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ error: 'Forventet {order, hidden, ski, glimt}' }, 400);
  const cur = kv.get(u, 'vaer_layout', {}) ?? {};
  const list = (v) => (Array.isArray(v) ? [...new Set(v.map(String))].filter((x) => VAER_CARDS41.includes(x)) : null);
  if ('order' in b && !list(b.order)) return c.json({ error: 'order må være en liste med kort' }, 400);
  if ('ski' in b && typeof b.ski !== 'boolean') return c.json({ error: 'ski må være true eller false' }, 400);
  if ('glimt' in b && !['top', 'bottom'].includes(b.glimt)) return c.json({ error: 'glimt må være top eller bottom' }, 400);
  kv.set(u, 'vaer_layout', { ...cur, ...('order' in b ? { order: list(b.order) } : {}), ...('hidden' in b ? { hidden: list(b.hidden) ?? [] } : {}), ...('ski' in b ? { ski: b.ski } : {}), ...('glimt' in b ? { glimt: b.glimt } : {}), ...(b.reset ? { order: VAER_CARDS41, hidden: [], glimt: 'bottom' } : {}) });
  return c.json(layoutOut(u));
});

/* ---------------- Brief og Vær: skiføre, 17. mai og Min reise ---------------- */
// GET /api/brief får ski:{text, chip:'Ski: blå', …, places[]} når relevant, mai17:{title, text, items, active} på 17. mai og minReise når «forlot skolen» er aktiv.
// GET /api/weather/full får ski når relevant.
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
export async function weatherFull41(c, next) {
  await next();
  await augment(c, /^\/api\/weather\/full\/?$/, async (u) => { const ski = await ski41(u); return ski ? { ski } : {}; });
}
