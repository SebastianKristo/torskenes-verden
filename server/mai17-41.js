// Prompt 41 (SERVER41): 17. mai – Glimt med flagg (14.–17. mai) og eget Hjem på selve dagen (claude-code-17-mai.md).
// Valget ligger i Glimt-innstillingene (glimt35.js): mai17:'auto'|'av'|'pa' (auto = 17. mai i Norge, pa = «Vis nå» som forhåndsvisning).
// Avledet mai17Active = {on, phase:'17mai'|null, day, home, label, mode, design, until, flag:{red, white, blue}} i GET/PUT /api/glimt/settings (sanntid glimt:settings).
// GET  /api/glimt/mai17 → {active, dateLabel:'Søndag 17. mai · Grunnlovsdagen', greeting:'Gratulerer med dagen, Sebastian!', city:'Oslo',
//                          program:[{time, title, kind:'city'|'calendar', past, next}], brief:{title, text, items[]}, hurra:{count, text}, design}
// PUT  /api/glimt/mai17/design {on} → {design, mai17Active}   (bryteren «17. mai-design» øverst på Hjem; gjelder bare i dag, nullstilles 18. mai)
// POST /api/glimt/mai17/hurra → {count, text:'Hurra nr. 3', sent}   («Hipp hipp hurra fra Sebastian!» til familien)
// Brief på dagen: brief.mai17 = {title:'17. MAI', text, items}.
import { Hono } from 'hono';
import { kv } from './db.js';
import { authOrToken as authOrToken0 } from './mobile.js';
const authOrToken = (c, next) => authOrToken0(c, next); // sen binding (mobile.js kan være midt i lastingen)
import { userInfo, listUsers } from './auth.js';
import { notifyUser } from './notify.js';

export const MAI17_MODES = ['auto', 'av', 'pa'];
export const MAI17_DEFAULTS = { mai17: 'auto' };
export const FLAG41 = { red: '#BA0C2F', white: '#FFFFFF', blue: '#00205B', ratio: '22:16', cross: '4/2' };
const ymd = (t = Date.now()) => { const [y, m, d] = new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }).split('-').map(Number); return { y, m, d, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }; };
const WD = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];

/** Renser mai17 i en Glimt-innstillingsendring. → {patch, errors} */
export function cleanMai17(b) {
  const patch = {}, errors = [];
  if (b.mai17 !== undefined) { if (!MAI17_MODES.includes(b.mai17)) errors.push('mai17 må være auto, av eller pa'); else patch.mai17 = b.mai17; }
  return { patch, errors };
}
const designKey = 'mai17_design';
/** Dagens valg for «17. mai-design» (null = på). Nullstilles automatisk neste dag. */
export function designToday41(u, t = Date.now()) { const v = u ? kv.get(u, designKey, null) : null; return v && v.date === ymd(t).iso ? !!v.on : true; }
/** Avledet tilstand. */
export function mai17Active(s = {}, t = Date.now(), u = null) {
  const mode = MAI17_MODES.includes(s.mai17) ? s.mai17 : 'auto';
  const { y, m, d } = ymd(t);
  const auto = m === 5 && d >= 14 && d <= 17;
  const theDay = m === 5 && d === 17;
  const on = mode === 'pa' ? true : mode === 'av' ? false : auto;
  const day = mode === 'pa' ? true : mode === 'av' ? false : theDay;
  const design = designToday41(u, t);
  return { on, phase: on ? '17mai' : null, day, home: day && design, design, mode, auto: mode === 'auto', until: on && mode === 'auto' ? `${y}-05-17` : null, flag: FLAG41,
    label: mode === 'av' ? 'Av' : mode === 'pa' ? 'Vis nå (forhåndsvisning)' : auto ? (theDay ? 'På i dag' : 'Flagg på figurene til 17. mai') : 'Automatisk 17. mai' };
}

// Byens program (manuell liste per by i serveren). Fallback: bare egne kalenderhendelser.
export const CITY_PROGRAM41 = {
  oslo: [['07:00', 'Salutt fra Akershus festning'], ['10:00', 'Barnetoget går fra Akershus festning'], ['13:00', 'Folketoget'], ['18:00', 'Kveldsarrangement på Rådhusplassen']],
  bergen: [['06:00', 'Salutt fra Bergenhus festning'], ['11:00', 'Barnetoget'], ['15:00', 'Buekorps-tog']],
  trondheim: [['07:00', 'Salutt fra Kristiansten festning'], ['10:30', 'Barnetoget'], ['14:00', 'Folketoget']],
};
async function calendarToday(u, iso) {
  try {
    const { eventsFor } = await import('./calendar.js');
    const { runAsUser } = await import('./settings.js');
    const { events } = await runAsUser(u, () => eventsFor(u, iso, iso));
    return (events ?? []).filter((e) => !e.allDay).map((e) => ({ time: new Date(Date.parse(e.start)).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' }), title: e.title, kind: 'calendar' }));
  } catch { return []; }
}
const cityOf = (u) => { const p = (kv.get(u, 'wx_places', null) ?? [])[0]; const n = String(p?.name ?? 'Oslo').toLowerCase(); return CITY_PROGRAM41[n] ? n : CITY_PROGRAM41[n.split(/[ ,]/)[0]] ? n.split(/[ ,]/)[0] : 'oslo'; };
/** Programmet i dag med passerte (grå) og neste (rød). */
export async function program41(u, t = Date.now()) {
  const city = cityOf(u);
  const iso = ymd(t).iso;
  const items = [...CITY_PROGRAM41[city].map(([time, title]) => ({ time, title, kind: 'city' })), ...(await calendarToday(u, iso))].sort((a, b) => a.time.localeCompare(b.time));
  const nowHm = new Date(t).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
  let nextSet = false;
  for (const it of items) { it.past = it.time < nowHm; it.next = !it.past && !nextSet; if (it.next) nextSet = true; }
  return { city: city.charAt(0).toUpperCase() + city.slice(1), items };
}
const first = (u) => String(userInfo(u)?.displayName ?? userInfo(u)?.name ?? 'deg').split(/\s+/)[0];
function untilText(items, t) {
  const tog = items.find((x) => x.kind === 'city' && /barnetog/i.test(x.title));
  if (!tog) return null;
  const [h, m] = tog.time.split(':').map(Number);
  const nowP = new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':').map(Number);
  const mins = h * 60 + m - (nowP[0] * 60 + nowP[1]);
  if (mins <= 0) return `Barnetoget gikk ${tog.time}`;
  return `Barnetoget om ${mins >= 60 ? `${Math.floor(mins / 60)} t ` : ''}${mins % 60} min`.replace(' 0 min', '');
}
export async function mai17Day41(u, s, t = Date.now()) {
  const a = mai17Active(s, t, u);
  const { m, d } = ymd(t);
  const wd = WD[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Date(t).toLocaleDateString('en-US', { timeZone: 'Europe/Oslo', weekday: 'short' }))];
  const p = await program41(u, t);
  const h = kv.get(u, 'mai17_hurra', null);
  const count = h && h.date === ymd(t).iso ? h.count : 0;
  const tog = untilText(p.items, t);
  return { active: a, dateLabel: m === 5 && d === 17 ? `${wd} 17. mai · Grunnlovsdagen` : '17. mai · Grunnlovsdagen', greeting: `Gratulerer med dagen, ${first(u)}!`, city: p.city, program: p.items,
    brief: { title: '17. MAI', text: [tog ? `${tog}.` : null, 'Trikk og buss er omlagt i sentrum, sjekk Ruter før du drar.'].filter(Boolean).join(' '), items: p.items.filter((x) => x.kind === 'city').slice(0, 3) },
    widget: { title: '17. MAI', line: tog }, hurra: { count, text: count ? `Hurra nr. ${count}` : null }, design: a.design };
}

export const mai17Api = new Hono();
mai17Api.use('*', authOrToken);
mai17Api.get('/', async (c) => { const { glimtSettingsOf } = await import('./glimt35.js'); return c.json(await mai17Day41(c.get('user'), glimtSettingsOf(c.get('user')))); });
mai17Api.put('/design', async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({}));
  if (typeof b?.on !== 'boolean') return c.json({ error: 'on må være true eller false' }, 400);
  kv.set(u, designKey, { date: ymd().iso, on: b.on });
  const { glimtSettingsOf } = await import('./glimt35.js');
  return c.json({ design: b.on, mai17Active: mai17Active(glimtSettingsOf(u), Date.now(), u) });
});
mai17Api.post('/hurra', async (c) => {
  const u = c.get('user'), today = ymd().iso;
  const h = kv.get(u, 'mai17_hurra', null);
  const count = (h && h.date === today ? h.count : 0) + 1;
  kv.set(u, 'mai17_hurra', { date: today, count });
  let sent = 0;
  for (const x of listUsers().filter((x) => x.id !== u)) { try { await notifyUser(x.id, { title: '17. mai', body: `Hipp hipp hurra fra ${first(u)}!`, category: 'familie', tag: `mai17-${u}-${count}`, url: '/#/hjem', data: { kind: 'mai17.hurra', from: u } }); sent++; } catch { /* */ } }
  return c.json({ count, text: `Hurra nr. ${count}`, sent });
});
