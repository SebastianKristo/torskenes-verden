// Matplan: ukeplan (Gemini/Ollama), faste retter, kokker, HelloFresh, handleliste og ICS-kalender.
import { Hono } from 'hono';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { kv, OWNER } from './db.js';
import { config } from './config.js';
import { userInfo } from './auth.js';
import { guard, readJson, bad, str, num, MOCK, aiJson } from './homeos-common.js';

const DN = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const SOURCES = new Set(['gemini', 'hellofresh', 'fixed', 'own']);
const day = (d) => d.toLocaleDateString('sv-SE');
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return day(d); };
const wd = (s) => (parse(s).getDay() + 6) % 7;
const monday = (s) => addDays(s, -wd(s));
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());
const id = () => randomBytes(5).toString('hex');

function demo() {
  const start = monday(day(new Date()));
  const plan = {};
  [['Kyllingwok med ris', 142, 'gemini', 'Sebastian'], ['Teriyakilaks med sesamris', 169, 'hellofresh', 'Ingrid'], ['Taco', 134, 'fixed', 'Pål'], ['Pasta bolognese', 96, 'gemini', 'Sebastian'],
    ['Hjemmelaget pizza', 110, 'fixed', 'Ingrid'], ['Restemiddag', 0, 'own', 'Pål'], ['Kokoskarri med kylling', 128, 'gemini', 'Sebastian']]
    .forEach(([name, cost, source, cook], i) => { plan[addDays(start, i)] = { name, cost, source, cook }; });
  return {
    people: ['Sebastian', 'Ingrid', 'Pål'], plan, auto: true, lastAuto: '',
    fixed: { 2: { name: 'Taco', cost: 134 }, 4: { name: 'Hjemmelaget pizza', cost: 110 } },
    lib: [['Fiskegrateng', 118], ['Kjøttkaker i brun saus', 132], ['Grønnsakssuppe', 74], ['Lasagne', 145], ['Fiskesuppe', 156]].map(([name, cost]) => ({ id: id(), name, cost })),
    hf: [['Kremet kyllinggryte med paprika', '30 min', 149], ['Teriyakilaks med sesamris', '25 min', 169], ['Halloumi-burger med søtpotet', '35 min', 139], ['Biff tagliata med rucola', '20 min', 189], ['Indisk linsedal med naan', '30 min', 119]]
      .map(([name, meta, cost]) => ({ id: id(), name, meta, cost })),
    shopping: { [start]: [['Kyllingfilet 1 kg', 129], ['Laks 4 stk', 149], ['Taco-krydder og lefser', 59], ['Grønnsaker', 120], ['Pasta og hermetiske tomater', 54], ['Melk, egg, smør', 98], ['Ris og kokosmelk', 62]]
      .map(([text, price]) => ({ id: id(), text, price, done: false })) },
  };
}

const EMPTY = { people: [], plan: {}, auto: false, lastAuto: '', fixed: {}, lib: [], hf: [], shopping: {} };
function state() {
  const s = kv.get(OWNER, 'mat', null) ?? (MOCK ? demo() : { ...structuredClone(EMPTY), people: [userInfo(OWNER)?.name || config.userName || 'Admin'] });
  if (!s.calKey) { s.calKey = randomBytes(18).toString('base64url'); kv.set(OWNER, 'mat', s); }
  return s;
}
const save = (s) => kv.set(OWNER, 'mat', s);

function week(s, start) {
  const days = DN.map((weekday, i) => {
    const date = addDays(start, i), p = s.plan[date], f = s.fixed[i];
    return { date, weekday, name: p?.name ?? null, cost: p?.cost ?? 0, source: p?.source ?? null, cook: p?.cook ?? null, fixed: !!f && f.name === p?.name, ingredients: p?.ingredients ?? [] };
  });
  return {
    start, week: isoWeek(start), days, cooks: s.people, fixed: Object.entries(s.fixed).map(([i, f]) => ({ weekday: DN[i], index: +i, name: f.name })),
    library: s.lib, hellofresh: s.hf, shopping: s.shopping[start] ?? [], weekCost: days.reduce((a, d) => a + (d.cost || 0), 0), auto: s.auto,
    calendarUrl: `/mat/calendar.ics?key=${s.calKey}`,
  };
}
function isoWeek(s) {
  const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

const SCHEMA = { type: 'OBJECT', properties: { days: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
  date: { type: 'STRING' }, name: { type: 'STRING' }, cost: { type: 'NUMBER' }, ingredients: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['date', 'name', 'cost'] } } }, required: ['days'] };

// Lager plan for de gitte datoene. Faste retter respekteres, og siste tre ukers retter unngås.
async function generate(s, dates) {
  const open = dates.filter((d) => !s.fixed[wd(d)]);
  for (const d of dates) { const f = s.fixed[wd(d)]; if (f) s.plan[d] = { ...s.plan[d], name: f.name, cost: f.cost, source: 'fixed', cook: s.plan[d]?.cook ?? cookFor(s, d) }; }
  if (!open.length) return 'Bare faste retter denne gangen';
  const recent = Object.entries(s.plan).filter(([d]) => d >= addDays(dates[0], -21) && d < dates[0]).map(([, p]) => p.name);
  const prompt = `Du planlegger middager for en norsk husholdning (${s.people.length} personer). Lag én middag for hver av disse datoene: ${open.join(', ')}.
Varier mellom fisk, kylling, kjøtt og vegetar. Unngå disse nylige rettene: ${recent.join(', ') || 'ingen'}.
Bruk gjerne retter fra biblioteket: ${s.lib.map((x) => `${x.name} (${x.cost} kr)`).join(', ') || 'tomt'}.
HelloFresh denne uka: ${s.hf.map((x) => x.name).join(', ') || 'ingen'}.
Hold kostnaden nøktern (typisk 80–180 kr per middag). Oppgi navn på norsk, estimert kostnad i kroner og 3–8 ingredienser.`;
  let rows, provider = 'Gemini';
  try { const r = await aiJson(prompt, SCHEMA); rows = r.data.days; provider = r.provider; }
  catch (e) { rows = null; provider = e.message; }
  const valid = Array.isArray(rows) ? rows.filter((r) => open.includes(r?.date) && str(r.name)) : [];
  // Uten AI: velg fra biblioteket og HelloFresh.
  const pool = [...s.lib.map((x) => ({ ...x, src: 'own' })), ...s.hf.map((x) => ({ ...x, src: 'hellofresh' }))].filter((x) => !recent.includes(x.name));
  open.forEach((d, i) => {
    const r = valid.find((x) => x.date === d);
    const cook = s.plan[d]?.cook ?? cookFor(s, d);
    if (r) {
      const hf = s.hf.find((x) => x.name.toLowerCase() === str(r.name).toLowerCase());
      s.plan[d] = { name: str(r.name, 80), cost: Math.round(Math.max(0, num(r.cost))), source: hf ? 'hellofresh' : 'gemini', cook, ingredients: (r.ingredients ?? []).map((x) => str(x, 60)).filter(Boolean).slice(0, 12) };
    } else if (pool.length) {
      const p = pool[(i + Math.floor(Date.now() / 86400000)) % pool.length];
      s.plan[d] = { name: p.name, cost: p.cost, source: p.src, cook };
    }
  });
  return valid.length ? `Ny plan fra ${provider}` : `AI utilgjengelig (${provider}) – valgte fra biblioteket`;
}
const cookFor = (s, d) => s.people[wd(d) % Math.max(1, s.people.length)] ?? null;

function shoppingFrom(s, start) {
  const items = new Map((s.shopping[start] ?? []).map((x) => [x.text.toLowerCase(), x]));
  for (let i = 0; i < 7; i++) for (const ing of s.plan[addDays(start, i)]?.ingredients ?? []) {
    if (!items.has(ing.toLowerCase())) items.set(ing.toLowerCase(), { id: id(), text: ing, price: 0, done: false });
  }
  s.shopping[start] = [...items.values()];
}

// HelloFresh har ingen offentlig API: lim inn ukesmenyen (én rett per linje, gjerne «Navn – 30 min – 149 kr»).
function parseHelloFresh(text) {
  return String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 3 && !/^https?:/.test(l)).slice(0, 20).map((l) => {
    const cost = +(l.match(/(\d{2,4})\s*kr/i)?.[1] ?? 0), min = l.match(/(\d{1,3})\s*min/i)?.[1];
    const name = l.replace(/[-–·|,]?\s*\d{2,4}\s*kr.*$/i, '').replace(/[-–·|,]?\s*\d{1,3}\s*min\w*/i, '').replace(/[-–·|]\s*$/, '').trim();
    return { id: id(), name: name.slice(0, 80), meta: min ? `${min} min` : '', cost };
  }).filter((x) => x.name);
}

export const matApi = new Hono();
matApi.use('*', guard);

matApi.get('/week', (c) => {
  const q = c.req.query('start');
  return c.json(week(state(), monday(isDate(q) ? q : day(new Date()))));
});

matApi.post('/plan', async (c) => {
  const b = await readJson(c), s = state();
  const date = isDate(b.date) ? b.date : day(new Date());
  const start = monday(date);
  const dates = b.scope === 'day' ? [date] : DN.map((_, i) => addDays(start, i));
  const status = await generate(s, dates);
  shoppingFrom(s, start);
  save(s);
  return c.json({ ...week(s, start), status });
});

matApi.patch('/day/:date', async (c) => {
  const date = c.req.param('date');
  if (!isDate(date)) return bad(c, 'Ugyldig dato');
  const b = await readJson(c), s = state(), p = { ...(s.plan[date] ?? {}) };
  if (b.name !== undefined) { p.name = str(b.name, 80) || null; p.ingredients = []; if (!b.source) p.source = 'own'; }
  if (b.cost !== undefined) p.cost = Math.max(0, Math.round(num(b.cost)));
  if (b.cook !== undefined) p.cook = str(b.cook, 40) || null;
  if (SOURCES.has(b.source)) p.source = b.source;
  if (b.fixed === true && p.name) { s.fixed[wd(date)] = { name: p.name, cost: p.cost ?? 0 }; p.source = 'fixed'; }
  if (b.fixed === false) { delete s.fixed[wd(date)]; if (p.source === 'fixed') p.source = 'own'; }
  if (p.name) s.plan[date] = p; else delete s.plan[date];
  save(s);
  return c.json(week(s, monday(date)));
});

matApi.post('/meals', async (c) => {
  const b = await readJson(c), s = state(), name = str(b.name, 80);
  if (!name) return bad(c, 'Navn mangler');
  const meal = { id: id(), name, cost: Math.max(0, Math.round(num(b.cost))) };
  s.lib.push(meal);
  if (isDate(b.date)) {
    s.plan[b.date] = { name, cost: meal.cost, source: b.fixed ? 'fixed' : 'own', cook: s.plan[b.date]?.cook ?? cookFor(s, b.date) };
    if (b.fixed) s.fixed[wd(b.date)] = { name, cost: meal.cost };
  }
  save(s);
  return c.json(week(s, monday(isDate(b.date) ? b.date : day(new Date()))), 201);
});
matApi.delete('/meals/:id', (c) => { const s = state(); s.lib = s.lib.filter((x) => x.id !== c.req.param('id')); save(s); return c.json({ ok: true }); });

matApi.put('/cooks', async (c) => {
  const b = await readJson(c), s = state();
  if (!Array.isArray(b.cooks)) return bad(c, 'cooks må være en liste');
  s.people = [...new Set(b.cooks.map((x) => str(x, 40)).filter(Boolean))].slice(0, 10);
  save(s);
  return c.json({ cooks: s.people });
});

matApi.put('/auto', async (c) => { const b = await readJson(c), s = state(); s.auto = !!b.auto; save(s); return c.json({ auto: s.auto }); });

matApi.post('/hellofresh', async (c) => {
  const b = await readJson(c), s = state(), list = parseHelloFresh(b.text ?? '');
  if (!list.length) return bad(c, 'Fant ingen retter i teksten');
  s.hf = list; save(s);
  return c.json({ hellofresh: s.hf });
});
matApi.post('/hellofresh/:id/add', async (c) => {
  const b = await readJson(c), s = state(), h = s.hf.find((x) => x.id === c.req.param('id'));
  if (!h || !isDate(b.date)) return bad(c, 'Ukjent rett eller dato');
  s.plan[b.date] = { name: h.name, cost: h.cost, source: 'hellofresh', cook: s.plan[b.date]?.cook ?? cookFor(s, b.date) };
  save(s);
  return c.json(week(s, monday(b.date)));
});

matApi.post('/shopping', async (c) => {
  const b = await readJson(c), s = state(), text = str(b.text, 80), start = monday(isDate(b.start) ? b.start : day(new Date()));
  if (!text) return bad(c, 'Tekst mangler');
  (s.shopping[start] ??= []).push({ id: id(), text, price: Math.max(0, Math.round(num(b.price))), done: false });
  save(s);
  return c.json(week(s, start));
});
matApi.post('/shopping/:id/toggle', (c) => {
  const s = state();
  for (const list of Object.values(s.shopping)) { const x = list.find((i) => i.id === c.req.param('id')); if (x) { x.done = !x.done; save(s); return c.json(x); } }
  return bad(c, 'Fant ikke varen', 404);
});

matApi.post('/calendar/rotate', (c) => { const s = state(); s.calKey = randomBytes(18).toString('base64url'); save(s); return c.json({ calendarUrl: `/mat/calendar.ics?key=${s.calKey}` }); });

/* ---------------- ICS-feed (abonneres fra Google/Apple Kalender) ---------------- */

const icsText = (v) => String(v ?? '').replace(/[\;,]/g, '\\$&').replace(/\r?\n/g, '\\n');
export function matCalendar(c) {
  const s = state(), key = String(c.req.query('key') ?? '');
  const a = Buffer.from(key), b = Buffer.from(s.calKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return c.text('Ugyldig nøkkel', 403);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = Object.entries(s.plan).filter(([d, p]) => p?.name && d >= addDays(day(new Date()), -30)).map(([d, p]) => {
    const dt = d.replace(/-/g, '');
    return ['BEGIN:VEVENT', `UID:middag-${dt}@homelab-os`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Oslo:${dt}T170000`, `DTEND;TZID=Europe/Oslo:${dt}T180000`,
      `SUMMARY:${icsText(p.name)}`, `DESCRIPTION:${icsText(`Kokk: ${p.cook ?? '–'}${p.cost ? ` · ca. ${p.cost} kr` : ''}`)}`, 'END:VEVENT'].join('\r\n');
  });
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//homelab-os//Matplan//NO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Middag', 'X-WR-TIMEZONE:Europe/Oslo', ...ev, 'END:VCALENDAR'].join('\r\n');
  return c.body(body + '\r\n', 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' });
}

/* ---------------- Automatisk plan søndag kl. 18 ---------------- */

export function startMatScheduler() {
  const tick = async () => {
    const now = new Date(), today = day(now);
    if (now.getDay() !== 0 || now.getHours() < 18) return;
    const s = state();
    if (!s.auto || s.lastAuto === today) return;
    s.lastAuto = today; save(s);
    const start = addDays(today, 1);
    try { await generate(s, DN.map((_, i) => addDays(start, i))); shoppingFrom(s, start); s.lastAuto = today; save(s); }
    catch (e) { console.error('[matplan]', e.message); }
  };
  setInterval(tick, 10 * 60_000).unref();
}
