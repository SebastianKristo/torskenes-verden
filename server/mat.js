// Mat (tidligere Matplan): retter med ingredienser og fremgangsmåte, ukeplan (AI eller tilfeldig), faste retter per ukedag,
// kokker med «best på»-retter, HelloFresh-import, handleliste og ICS-kalender. Mapper, skanning og import fra
// nettsider ligger i mat-recipes.js.
//
// Per bruker (ISO2): hver bruker har sin egen Mat i kv(user,'mat'), matplan_fixed(user_id, weekday) og egne mapper,
// lenker, filer og skannejobber (user_id i mat-recipes.js). Eierens data ligger der de lå (OWNER).
//
// Datamodell (kv user/'mat', v: 2):
//   dishes: [{ id, name, src: 'own'|'hellofresh'|'scan'|'web', ing: [], steps: [], cost,
//              folderId, sourceUrl, image, time, servings, scanFile }]
//   cooks:  [{ name, best: [dishId] }]
//   plan:   { 'YYYY-MM-DD': { dish: id|null, cook, by: 'ai'|'user'|'auto' } }
//   fixed:  { 0–6 (mandag = 0): { dish: id, cook } } – lagret i SQLite-tabellen matplan_fixed, ikke i kv.
//           En rett kan være fast på flere ukedager; hver ukedag har høyst én fast rett.
//   shop:   { mandag: { done: [tekst i små bokstaver], extra: [{ id, text, price, done }] } }
import { Hono } from 'hono';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { kv, OWNER, db } from './db.js';
import { config } from './config.js';
import { userInfo } from './auth.js';
import { userGuard, readJson, bad, str, num, MOCK, aiJson } from './homeos-common.js';
import { activeUser, runAsUser } from './settings.js';
import { mountRecipes, ensureDefaultFolders, folders, folderById, guessFolderId, allLinks, linksFor, removeDishData } from './mat-recipes.js';

const DN = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const day = (d) => d.toLocaleDateString('sv-SE');
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return day(d); };
const wd = (s) => (parse(s).getDay() + 6) % 7;
const monday = (s) => addDays(s, -wd(s));
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());
const id = () => randomBytes(5).toString('hex');
const low = (s) => String(s ?? '').trim().toLowerCase();
const lines = (v, max = 40, len = 160) => (Array.isArray(v) ? v : String(v ?? '').split(/\r?\n/)).map((x) => str(String(x ?? ''), len)).filter(Boolean).slice(0, max);
const weekDates = (start) => DN.map((_, i) => addDays(start, i));
export function isoWeek(s) {
  const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

/* ---------------- Eksempeldata ---------------- */

const DEMO_DISHES = [
  ['Fiskesuppe', 'own', ['600 g torsk og laks', '2 gulrøtter', '1 purre', '3 dl matfløte', '1 l fiskekraft'], ['Kok opp kraft og fløte.', 'Ha i grønnsakene og kok i 5 minutter.', 'Legg i fisken og trekk i 4 minutter.'], 156],
  ['Spaghetti bolognese', 'own', ['400 g kjøttdeig', '1 løk', '2 fedd hvitløk', '1 boks hakkede tomater', '2 ss tomatpuré', '400 g spaghetti'], ['Brun kjøttdeig med løk og hvitløk.', 'Ha i tomater og puré, og småkok i 20 minutter.', 'Kok spaghetti og server med sausen.'], 96],
  ['Kyllingwok', 'own', ['500 g kyllingfilet', '1 pose wokgrønnsaker', '2 ss soyasaus', '1 ss sweet chili', 'Ris'], ['Kok risen.', 'Stek kyllingen i strimler.', 'Ha i grønnsaker og saus, og wok i 3 minutter.'], 142],
  ['Fiskeboller i hvit saus', 'own', ['1 boks fiskeboller', '3 ss smør', '3 ss hvetemel', 'Poteter'], ['Kok potetene.', 'Lag hvit saus av smør, mel og kraften fra boksen.', 'Varm fiskebollene i sausen.'], 78],
  ['Taco', 'own', ['400 g kjøttdeig', 'Tacokrydder', 'Tortillalefser', 'Mais', 'Agurk og tomat', 'Rømme', 'Revet ost'], ['Brun kjøttdeigen, tilsett krydder og vann.', 'Kutt grønnsakene.', 'Sett alt på bordet.'], 134],
  ['Pizza', 'own', ['Pizzadeig', 'Tomatsaus', 'Mozzarella', 'Skinke', 'Paprika'], ['Kjevle ut deigen.', 'Ha på saus og fyll.', 'Stek på 250 °C i 12 minutter.'], 110],
  ['Ovnsbakt laks med poteter', 'own', ['4 laksefileter', '800 g småpoteter', '1 brokkoli', 'Sitron', 'Olivenolje'], ['Del potetene og stek dem på 220 °C i 20 minutter.', 'Legg på laks og brokkoli.', 'Stek videre i 12 minutter.'], 169],
  ['Kremet kyllinggryte med ris', 'hellofresh', ['Kyllinglår', 'Matfløte', 'Paprika', 'Jasminris'], ['Kok risen.', 'Brun kyllingen.', 'Ha i paprika og fløte, og la det småkoke.'], 149],
];

// Brukeren Mat gjelder: den innloggede (eller brukeren en bakgrunnsjobb kjører for).
export const matUser = () => { const u = activeUser(); if (!u) throw Object.assign(new Error('Ikke innlogget'), { status: 401 }); return u; };

function demo(u) {
  const me = (u && userInfo(u)?.name) || 'Sebastian';
  const dishes = DEMO_DISHES.map(([name, src, ing, steps, cost]) => ({ id: id(), name, src, ing, steps, cost }));
  const by = (n) => dishes.find((d) => d.name === n).id;
  const cooks = [{ name: me, best: [by('Taco'), by('Spaghetti bolognese')] }, { name: 'Ingrid', best: [by('Fiskesuppe'), by('Ovnsbakt laks med poteter')] }, { name: 'Pål', best: [by('Pizza')] }];
  const start = monday(day(new Date())), plan = {};
  [['Kyllingwok', me], ['Kremet kyllinggryte med ris', 'Ingrid'], ['Ovnsbakt laks med poteter', 'Ingrid'], ['Fiskesuppe', 'Ingrid'], ['Taco', me], ['Pizza', 'Pål'], ['Spaghetti bolognese', me]]
    .forEach(([n, cook], i) => { plan[addDays(start, i)] = { dish: by(n), cook, by: 'user' }; });
  return { v: 2, dishes, cooks, plan, fixed: { 4: { dish: by('Taco'), cook: me } }, auto: false, lastAuto: '', shop: {} };
}

/* ---------------- Lagring og migrering ---------------- */

// v1 (prompt 04b): { people, plan: {dato: {name, cost, source, cook, ingredients}}, fixed: {wd: {name, cost}}, lib, hf, shopping }
export function migrate(old) {
  if (old?.v === 2) return old;
  const o = old ?? {};
  const s = { v: 2, dishes: [], cooks: [], plan: {}, fixed: {}, auto: !!o.auto, lastAuto: o.lastAuto ?? '', shop: {}, calKey: o.calKey };
  const add = (name, src, cost, ing) => {
    const n = str(name, 80); if (!n) return null;
    let d = s.dishes.find((x) => low(x.name) === low(n));
    if (!d) { d = { id: id(), name: n, src, ing: [], steps: [], cost: Math.max(0, Math.round(num(cost))) }; s.dishes.push(d); }
    if (ing?.length && !d.ing.length) d.ing = lines(ing);
    if (!d.cost && cost) d.cost = Math.max(0, Math.round(num(cost)));
    return d;
  };
  for (const x of o.lib ?? []) add(x.name, 'own', x.cost);
  for (const x of o.hf ?? []) add(x.name, 'hellofresh', x.cost);
  for (const [date, p] of Object.entries(o.plan ?? {})) {
    if (!isDate(date)) continue;
    const d = p?.name ? add(p.name, p.source === 'hellofresh' ? 'hellofresh' : 'own', p.cost, p.ingredients) : null;
    s.plan[date] = { dish: d?.id ?? null, cook: p?.cook ?? null, by: p?.source === 'gemini' ? 'ai' : 'user' };
  }
  for (const [k, f] of Object.entries(o.fixed ?? {})) { const d = add(f?.name, 'own', f?.cost); if (d && +k >= 0 && +k < 7) s.fixed[+k] = { dish: d.id, cook: null }; }
  s.cooks = [...new Set((o.people ?? []).map((x) => str(x, 40)).filter(Boolean))].map((name) => ({ name, best: [] }));
  for (const [start, list] of Object.entries(o.shopping ?? {})) {
    if (!isDate(start) || !Array.isArray(list)) continue;
    s.shop[start] = { done: [], extra: list.map((x) => ({ id: x.id ?? id(), text: str(x.text, 80), price: Math.max(0, Math.round(num(x.price))), done: !!x.done })).filter((x) => x.text) };
  }
  return s;
}

/* Faste retter per ukedag (prompt 10): egen tabell. cook_id er kokkens navn (kokkene ligger i kv). Per bruker fra ISO2. */
db.exec(`CREATE TABLE IF NOT EXISTS matplan_fixed (
  user_id TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  dish_id TEXT NOT NULL,
  cook_id TEXT,
  PRIMARY KEY (user_id, weekday)
)`);
// ISO2: den gamle tabellen hadde weekday som primærnøkkel (én felles plan). Radene kopieres til OWNER i den nye. Idempotent.
if (!db.prepare("SELECT 1 FROM pragma_table_info('matplan_fixed') WHERE name='user_id'").get()) {
  db.transaction(() => {
    const n = db.prepare('SELECT COUNT(*) n FROM matplan_fixed').get().n;
    db.exec(`CREATE TABLE matplan_fixed_iso2 (user_id TEXT NOT NULL, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), dish_id TEXT NOT NULL, cook_id TEXT, PRIMARY KEY (user_id, weekday))`);
    db.prepare('INSERT INTO matplan_fixed_iso2(user_id, weekday, dish_id, cook_id) SELECT ?, weekday, dish_id, cook_id FROM matplan_fixed').run(OWNER);
    if (db.prepare('SELECT COUNT(*) n FROM matplan_fixed_iso2').get().n !== n) throw new Error('Mat: kopien av faste retter stemmer ikke');
    db.exec('DROP TABLE matplan_fixed');
    db.exec('ALTER TABLE matplan_fixed_iso2 RENAME TO matplan_fixed');
  })();
}
const fixedRows = db.prepare('SELECT weekday, dish_id AS dish, cook_id AS cook FROM matplan_fixed WHERE user_id=?');
const fixedClear = db.prepare('DELETE FROM matplan_fixed WHERE user_id=?');
const fixedPut = db.prepare('INSERT INTO matplan_fixed(user_id, weekday, dish_id, cook_id) VALUES(?,?,?,?)');
const loadFixed = (u) => Object.fromEntries(fixedRows.all(u).map((r) => [r.weekday, { dish: r.dish, cook: r.cook ?? null }]));
const writeFixed = db.transaction((u, fixed) => {
  fixedClear.run(u);
  for (const [k, f] of Object.entries(fixed ?? {})) if (+k >= 0 && +k < 7 && f?.dish) fixedPut.run(u, +k, f.dish, f.cook ?? null);
});

function fresh(u) {
  if (MOCK) return demo(u);
  return { v: 2, dishes: [], cooks: [{ name: userInfo(u)?.name || (u === OWNER ? config.userName : '') || 'Meg', best: [] }], plan: {}, fixed: {}, auto: false, lastAuto: '', shop: {} };
}
export function state(u = matUser()) {
  const raw = kv.get(u, 'mat', null);
  let s = raw ? migrate(raw) : fresh(u), dirty = !raw || raw.v !== 2;
  if (!s.calKey) { s.calKey = randomBytes(18).toString('base64url'); dirty = true; }
  // Engangsmigrering: faste retter flyttes fra kv til matplan_fixed.
  if (!s.fixedDb) { if (!fixedRows.all(u).length) writeFixed(u, s.fixed); s.fixedDb = true; dirty = true; }
  s.fixed = Object.fromEntries(Object.entries(loadFixed(u)).filter(([, f]) => s.dishes.some((d) => d.id === f.dish)));
  // Prompt 13: standardmappene opprettes én gang, og eksisterende retter får en gjettet mappe.
  if (!s.foldersInit) {
    ensureDefaultFolders(u);
    for (const d of s.dishes) if (d.folderId === undefined) d.folderId = guessFolderId(d.name, d.ing);
    s.foldersInit = true; dirty = true;
  }
  if (dirty) save(s, u);
  return s;
}
const save = (s, u = matUser()) => { writeFixed(u, s.fixed); kv.set(u, 'mat', { ...s, fixed: {} }); };

/* ---------------- Hjelpere ---------------- */

const dishOf = (s, dishId) => s.dishes.find((d) => d.id === dishId) ?? null;
const dishByName = (s, name) => s.dishes.find((d) => low(d.name) === low(name)) ?? null;
const bestOf = (s, dishId) => s.cooks.find((c) => c.best.includes(dishId))?.name ?? null;
// Det som står på en dag. Fra og med denne uka går faste retter foran planen (AI og «Lag ny for uka» endrer dem ikke);
// tidligere uker viser det som faktisk ble planlagt.
const thisMonday = () => monday(day(new Date()));
function entry(s, date) {
  const p = s.plan[date], f = s.fixed[wd(date)];
  const fx = f && dishOf(s, f.dish) ? f : null;
  if (fx && (date >= thisMonday() || !p?.dish)) {
    const cook = p?.dish === fx.dish && p.cook ? p.cook : fx.cook ?? bestOf(s, fx.dish);
    return { dish: fx.dish, cook, by: 'fixed' };
  }
  return p ?? { dish: null, cook: null, by: null };
}
const isFixed = (s, date, e = entry(s, date)) => !!e.dish && s.fixed[wd(date)]?.dish === e.dish;

// Kokk for en dag: den som er best på retten, ellers den som har færrest middager i uka.
function pickCook(s, date, dishId, skipDate = date) {
  const b = bestOf(s, dishId);
  if (b) return b;
  if (!s.cooks.length) return null;
  const cnt = Object.fromEntries(s.cooks.map((c) => [c.name, 0]));
  for (const d of weekDates(monday(date))) if (d !== skipDate) { const c = entry(s, d).cook; if (c in cnt) cnt[c]++; }
  const min = Math.min(...Object.values(cnt));
  return s.cooks.map((c) => c.name).filter((n) => cnt[n] === min)[wd(date) % s.cooks.filter((c) => cnt[c.name] === min).length] ?? s.cooks[0].name;
}

// Legger en rett på en dag. Er dagen fast, følger den faste retten med.
function place(s, date, dishId, by = 'user') {
  const was = entry(s, date), fixedNow = isFixed(s, date, was);
  const cook = dishId ? (bestOf(s, dishId) ?? (was.cook && s.cooks.some((c) => c.name === was.cook) ? was.cook : pickCook(s, date, dishId))) : was.cook;
  s.plan[date] = { dish: dishId, cook, by };
  if (fixedNow) { if (dishId) s.fixed[wd(date)] = { dish: dishId, cook }; else delete s.fixed[wd(date)]; }
}

function shopping(s, start) {
  const st = s.shop[start] ?? { done: [], extra: [] };
  const done = new Set(st.done), items = new Map();
  for (const d of weekDates(start)) {
    const dish = dishOf(s, entry(s, d).dish);
    for (const ing of dish?.ing ?? []) {
      const k = low(ing), it = items.get(k);
      if (it) { it.count++; if (!it.dishes.includes(dish.name)) it.dishes.push(dish.name); }
      else items.set(k, { id: 'g' + createHash('sha1').update(k).digest('hex').slice(0, 10), text: ing, price: 0, done: done.has(k), count: 1, dishes: [dish.name], auto: true });
    }
  }
  return [...items.values(), ...st.extra.map((x) => ({ ...x, auto: false }))];
}

// Retten slik klientene får den: eldre felt (ing) og nye (ingredients, folder, links …).
export function dishOut(s, d, links = null) {
  const f = d.folderId ? folderById(d.folderId) : null;
  return { ...d, ingredients: d.ing, folderId: f ? f.id : null, folder: f?.name ?? null, sourceUrl: d.sourceUrl ?? null, image: d.image ?? null,
    time: d.time ?? null, servings: d.servings ?? null, links: links ? (links.get(d.id) ?? []) : linksFor(d.id) };
}

const fixedDaysOf = (s, dishId) => Object.entries(s.fixed).filter(([, f]) => f.dish === dishId).map(([k]) => +k).sort((a, b) => a - b);

// Ukekostnaden trekkes fra budsjettet for «Mat og dagligvarer» (på serveren, uten FinansHub-grensesnittet):
// igjen = budsjett − brukt hittil i måneden − planlagte middager fra i dag til måneden er slutt.
const FOOD_CAT = 'Mat og dagligvarer';
export function foodBudget(s, today = day(new Date())) {
  try {
    // Brukerens eget regnskap (ISO2): user_id på fh_* når kolonnen finnes; uten den er regnskapet eierens alene.
    const u = matUser(), own = (t) => !!db.prepare(`SELECT 1 FROM pragma_table_info('${t}') WHERE name='user_id'`).get();
    if (!own('fh_categories') && u !== OWNER) return null;
    const by = (t) => (own(t) ? ' AND user_id=?' : ''), arg = (t) => (own(t) ? [u] : []);
    const cat = db.prepare(`SELECT id FROM fh_categories WHERE name=?${by('fh_categories')}`).get(FOOD_CAT, ...arg('fh_categories'));
    if (!cat) return null;
    const ms = Math.min(28, Math.max(1, +(kv.get(u, 'fh_settings', null) ?? (u === OWNER || !own('fh_categories') ? kv.get(OWNER, 'fh_settings', {}) : {}) ?? {}).monthStart || 1));
    const t = parse(today);
    if (t.getDate() < ms) t.setMonth(t.getMonth() - 1, 1);
    const month = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    const from = `${month}-${String(ms).padStart(2, '0')}`, n = new Date(t.getFullYear(), t.getMonth() + 1, ms, 12), to = day(n);
    const b = db.prepare(`SELECT amount FROM fh_budgets WHERE category_id=? AND month IN (?, 'default')${by('fh_budgets')} ORDER BY month = 'default'`).get(cat.id, month, ...arg('fh_budgets'));
    const used = -(db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM fh_transactions WHERE category_id=? AND amount<0 AND date>=? AND date<?${by('fh_transactions')}`).get(cat.id, from, to, ...arg('fh_transactions')).s) / 100;
    let planned = 0;
    for (let d = today; d < to; d = addDays(d, 1)) planned += dishOf(s, entry(s, d).dish)?.cost ?? 0;
    const budget = b ? b.amount / 100 : null;
    return { category: FOOD_CAT, month, from, to, budget, used: Math.round(used), planned, left: budget == null ? null : Math.round(budget - used - planned) };
  } catch { return null; }
}

function week(s, start) {
  const today = day(new Date()), dates = weekDates(start);
  const days = dates.map((date, i) => {
    const e = entry(s, date), dish = dishOf(s, e.dish), fixed = isFixed(s, date, e);
    const best = dish ? (s.cooks.find((c) => c.name === e.cook && c.best.includes(dish.id)) ?? s.cooks.find((c) => c.best.includes(dish.id))) : null;
    return {
      date, weekday: DN[i], index: i, today: date === today, dishId: dish?.id ?? null, name: dish?.name ?? null, cook: e.cook ?? null, fixed,
      // source beholdes for eldre klienter (mobil): gemini | hellofresh | fixed | own
      source: !dish ? null : fixed ? 'fixed' : dish.src === 'hellofresh' ? 'hellofresh' : e.by === 'ai' ? 'gemini' : 'own',
      tag: best ? 'best' : dish?.src === 'hellofresh' ? 'hellofresh' : null, bestCook: best?.name ?? null,
      cost: dish?.cost ?? 0, ingredients: dish?.ing ?? [],
    };
  });
  const used = (dishId) => days.filter((d) => d.dishId === dishId).map((d) => d.index);
  const end = dates[6];
  return {
    start, end, week: isoWeek(start), today,
    days,
    dishes: (() => { const links = allLinks(); return s.dishes.map((d) => ({ ...dishOut(s, d, links), days: used(d.id), fixedDays: fixedDaysOf(s, d.id) })); })(),
    folders: (() => { const cnt = {}; for (const d of s.dishes) if (d.folderId) cnt[d.folderId] = (cnt[d.folderId] ?? 0) + 1; return folders().map((f) => ({ ...f, count: cnt[f.id] ?? 0 })); })(),
    chefs: s.cooks.map((c) => ({ name: c.name, best: c.best.map((x) => dishOf(s, x)).filter(Boolean).map((d) => ({ id: d.id, name: d.name })) })),
    cooks: s.cooks.map((c) => c.name),
    fixed: Object.entries(s.fixed).map(([i, f]) => ({ weekday: DN[i], index: +i, dishId: f.dish, name: dishOf(s, f.dish)?.name ?? null, cook: f.cook ?? bestOf(s, f.dish) })).filter((x) => x.name).sort((a, b) => a.index - b.index),
    food: foodBudget(s),
    // Eldre felter (mobil og apper)
    library: s.dishes.filter((d) => d.src !== 'hellofresh').map((d) => ({ id: d.id, name: d.name, cost: d.cost })),
    hellofresh: s.dishes.filter((d) => d.src === 'hellofresh').map((d) => ({ id: d.id, name: d.name, meta: '', cost: d.cost })),
    shopping: shopping(s, start),
    weekCost: days.reduce((a, d) => a + (d.cost || 0), 0),
    auto: s.auto, calendarUrl: `/mat/calendar.ics?key=${s.calKey}`,
  };
}

/* ---------------- Ny plan ---------------- */

const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const SCHEMA = { type: 'OBJECT', properties: { days: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
  date: { type: 'STRING' }, name: { type: 'STRING' }, ingredients: { type: 'ARRAY', items: { type: 'STRING' } }, steps: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['date', 'name'] } } }, required: ['days'] };
const AI_TIMEOUT = Number(process.env.MAT_AI_TIMEOUT_MS ?? 25_000);

// Fyller dagene som ikke er faste. mode 'ai' spør Gemini/Ollama (velger helst blant rettene), ellers tilfeldig.
// Retter fra forrige uke legges sist i køen, og samme rett brukes ikke to ganger i uka hvis det går.
export async function generate(s, dates, mode = 'shuffle') {
  const start = monday(dates[0]), all = weekDates(start);
  const open = dates.filter((d) => !isFixed(s, d));
  if (!open.length) return { filled: 0, message: 'Alle dagene er faste. Ingenting å endre.' };
  const keep = new Set(all.filter((d) => !open.includes(d)).map((d) => entry(s, d).dish).filter(Boolean));
  const prev = new Set(weekDates(addDays(start, -7)).map((d) => entry(s, d).dish).filter(Boolean));
  let names = null, provider = null, note = '';
  if (mode === 'ai') {
    const prompt = `Du lager en middagsplan for en norsk husholdning. Lag én middag for hver av disse datoene: ${open.join(', ')}.
Velg helst blant disse rettene: ${s.dishes.map((d) => d.name).join(', ') || 'ingen ennå'}.
Faste dager som beholdes: ${all.filter((d) => !open.includes(d)).map((d) => `${DN[wd(d)]} = ${dishOf(s, entry(s, d).dish)?.name ?? '–'}`).join(', ') || 'ingen'}.
Unngå disse fra forrige uke hvis mulig: ${[...prev].map((x) => dishOf(s, x)?.name).filter(Boolean).join(', ') || 'ingen'}.
Varier mellom fisk, kylling, kjøtt og vegetar, og ikke bruk samme rett to ganger. Foreslår du en ny rett, gi 3–8 ingredienser og 2–4 korte steg på norsk.`;
    try {
      const r = await Promise.race([aiJson(prompt, SCHEMA), new Promise((_, rej) => setTimeout(() => rej(new Error('tidsavbrudd')), AI_TIMEOUT).unref?.())]);
      names = Object.fromEntries((r.data?.days ?? []).filter((x) => open.includes(x?.date) && str(x.name)).map((x) => [x.date, x]));
      provider = r.provider;
    } catch (e) { note = ` AI var utilgjengelig (${e.message}), så rettene er valgt fra listen.`; }
  }
  const pool = shuffle(s.dishes.map((d) => d.id)).sort((a, b) => (prev.has(a) ? 1 : 0) - (prev.has(b) ? 1 : 0));
  const usedIds = new Set(keep);
  let filled = 0;
  for (const [i, date] of open.entries()) {
    let dishId = null;
    const ai = names?.[date];
    if (ai) {
      let d = dishByName(s, ai.name);
      if (!d) { d = { id: id(), name: str(ai.name, 80), src: 'own', ing: lines(ai.ingredients, 12), steps: lines(ai.steps, 8), cost: 0 }; s.dishes.push(d); }
      if (!usedIds.has(d.id)) dishId = d.id;
    }
    dishId ??= pool.find((x) => !usedIds.has(x)) ?? pool[i % Math.max(1, pool.length)] ?? null;
    if (!dishId) continue;
    usedIds.add(dishId);
    s.plan[date] = { dish: dishId, cook: pickCook(s, date, dishId), by: ai ? 'ai' : 'auto' };
    filled++;
  }
  const label = `uke ${isoWeek(start)}`;
  if (!filled) return { filled, message: 'Legg til noen retter først, så kan planen fylles.' };
  return { filled, provider, message: provider
    ? `Ny plan for ${label} fra ${provider}: ${filled} ${filled === 1 ? 'rett' : 'retter'} valgt, faste dager er beholdt.`
    : `${filled} ${filled === 1 ? 'dag har' : 'dager har'} fått nye retter i ${label}. Faste dager er beholdt.${note}` };
}

// ✦ på én dag: en annen rett som ikke er brukt i uka (eller i det minste en annen enn i dag).
function regenDay(s, date) {
  const inWeek = new Set(weekDates(monday(date)).map((d) => entry(s, d).dish));
  const cur = entry(s, date).dish;
  const opts = s.dishes.filter((d) => !inWeek.has(d.id)), pool = opts.length ? opts : s.dishes.filter((d) => d.id !== cur);
  if (!pool.length) return null;
  const d = pool[Math.floor(Math.random() * pool.length)];
  place(s, date, d.id, 'auto');
  return d;
}

// HelloFresh har ingen offentlig API: lim inn ukesmenyen (én rett per linje, gjerne «Navn – 30 min – 149 kr»).
export function parseHelloFresh(text) {
  return String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 2 && !/^https?:/i.test(l)).slice(0, 30).map((l) => {
    const cost = +(l.match(/(\d{2,4})\s*kr/i)?.[1] ?? 0);
    const name = l.replace(/^[-•*\d.)\s]+/, '').replace(/[-–·|,]?\s*\d{2,4}\s*kr.*$/i, '').replace(/[-–·|,]?\s*\d{1,3}\s*min\w*/i, '').replace(/\s*[-–·|,]\s*$/, '').trim();
    return { name: name.slice(0, 80), cost };
  }).filter((x) => x.name.length > 1);
}

/* ---------------- ICS ---------------- */

const icsText = (v) => String(v ?? '').replace(/[\\;,]/g, '\\$&').replace(/\r?\n/g, '\\n');
function ics(s, dates) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = dates.map((d) => [d, entry(s, d)]).filter(([, e]) => dishOf(s, e.dish)).map(([d, e]) => {
    const dt = d.replace(/-/g, ''), dish = dishOf(s, e.dish);
    return ['BEGIN:VEVENT', `UID:middag-${dt}@homelab-os`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Oslo:${dt}T170000`, `DTEND;TZID=Europe/Oslo:${dt}T180000`,
      `SUMMARY:${icsText(dish.name)}`, `DESCRIPTION:${icsText(`Kokk: ${e.cook ?? '–'}${dish.ing.length ? `\nIngredienser: ${dish.ing.join(', ')}` : ''}`)}`, 'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//homelab-os//Mat//NO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Middag', 'X-WR-TIMEZONE:Europe/Oslo', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
// Feeden: alt som er planlagt siste 30 dager og fremover, pluss faste retter de neste fire ukene.
function feedDates(s) {
  const from = addDays(day(new Date()), -30), set = new Set(Object.keys(s.plan).filter((d) => d >= from));
  const m = monday(day(new Date()));
  for (let i = 0; i < 28; i++) set.add(addDays(m, i));
  return [...set].sort();
}

/* ---------------- API ---------------- */

export const matApi = new Hono();
matApi.use('*', userGuard);

const startOf = (c, b = {}) => { const q = b.start ?? b.date ?? c.req.query('start'); return monday(isDate(q) ? q : day(new Date())); };
const reply = (c, s, start, extra = {}, status = 200) => c.json({ ...week(s, start), ...extra }, status);

matApi.get('/week', (c) => reply(c, state(), startOf(c)));

matApi.get('/week.ics', (c) => {
  const s = state(), start = startOf(c);
  return c.body(ics(s, weekDates(start)), 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="mat-uke-${isoWeek(start)}.ics"` });
});

// Ny plan: scope 'week' fyller uka (mode 'ai' eller 'shuffle'), scope 'day' bytter én dag.
matApi.post('/plan', async (c) => {
  const b = await readJson(c), s = state();
  const date = isDate(b.date) ? b.date : isDate(b.start) ? b.start : day(new Date()), start = monday(date);
  if (b.scope === 'day') {
    if (isFixed(s, date)) return reply(c, s, start, { status: `${DN[wd(date)]} er fast (${dishOf(s, entry(s, date).dish)?.name}). Endre «Alltid på» i retten for å bytte.` });
    const d = regenDay(s, date); save(s);
    return reply(c, s, start, { status: d ? `${DN[wd(date)]}: ${d.name}` : 'Legg til flere retter først.' });
  }
  const r = await generate(s, weekDates(start), b.mode === 'shuffle' ? 'shuffle' : 'ai');
  save(s);
  return reply(c, s, start, { status: r.message, filled: r.filled });
});

matApi.patch('/day/:date', async (c) => {
  const date = c.req.param('date');
  if (!isDate(date)) return bad(c, 'Ugyldig dato');
  const b = await readJson(c), s = state();
  if (b.dishId !== undefined) {
    if (b.dishId !== null && !dishOf(s, b.dishId)) return bad(c, 'Fant ikke retten', 404);
    place(s, date, b.dishId ?? null);
  } else if (b.name !== undefined) {
    // Eldre klienter sender navn: finn retten eller lag den.
    const n = str(b.name, 80);
    let d = n ? dishByName(s, n) : null;
    if (n && !d) { d = { id: id(), name: n, src: 'own', ing: [], steps: [], cost: Math.max(0, Math.round(num(b.cost))) }; s.dishes.push(d); }
    place(s, date, d?.id ?? null);
  }
  if (b.cost !== undefined && b.name === undefined) { const d = dishOf(s, entry(s, date).dish); if (d) d.cost = Math.max(0, Math.round(num(b.cost))); }
  if (b.cook !== undefined) {
    const e = entry(s, date), cook = str(b.cook, 40) || null;
    s.plan[date] = { ...e, by: e.by === 'fixed' ? 'user' : e.by, cook };
    if (isFixed(s, date)) s.fixed[wd(date)].cook = cook;
  }
  if (b.fixed === true) {
    const e = entry(s, date);
    if (!e.dish) return bad(c, 'Velg en rett før du gjør dagen fast.');
    s.fixed[wd(date)] = { dish: e.dish, cook: e.cook ?? null };
    s.plan[date] = { ...e, by: e.by === 'fixed' ? 'user' : e.by };
  }
  if (b.fixed === false) {
    // Dagen beholder retten denne uka, men den gjentas ikke lenger.
    const e = entry(s, date);
    if (e.dish) s.plan[date] = { ...e, by: e.by === 'fixed' ? 'user' : e.by };
    delete s.fixed[wd(date)];
  }
  save(s);
  return reply(c, s, monday(date));
});

// Bytt retter (og kokker) mellom to dager.
matApi.post('/swap', async (c) => {
  const b = await readJson(c), s = state();
  if (!isDate(b.a) || !isDate(b.b) || b.a === b.b) return bad(c, 'Ugyldige datoer');
  const ea = entry(s, b.a), eb = entry(s, b.b);
  place(s, b.a, eb.dish); s.plan[b.a].cook = eb.cook ?? s.plan[b.a].cook;
  place(s, b.b, ea.dish); s.plan[b.b].cook = ea.cook ?? s.plan[b.b].cook;
  if (isFixed(s, b.a)) s.fixed[wd(b.a)].cook = s.plan[b.a].cook;
  if (isFixed(s, b.b)) s.fixed[wd(b.b)].cook = s.plan[b.b].cook;
  save(s);
  return reply(c, s, monday(b.a));
});

/* Retter */

function dishInput(b, old = {}) {
  return {
    name: b.name !== undefined ? str(b.name, 80) : old.name,
    src: b.src !== undefined ? (b.src === 'hellofresh' || b.hellofresh === true ? 'hellofresh' : ['scan', 'web'].includes(b.src) ? b.src : (b.src === 'own' && ['scan', 'web'].includes(old.src) ? old.src : 'own'))
      : b.hellofresh !== undefined ? (b.hellofresh ? 'hellofresh' : (['scan', 'web'].includes(old.src) ? old.src : 'own')) : old.src ?? 'own',
    ing: b.ing !== undefined || b.ingredients !== undefined ? lines(b.ing ?? b.ingredients, 60, 200) : old.ing ?? [],
    steps: b.steps !== undefined ? lines(b.steps, 40, 600) : old.steps ?? [],
    cost: b.cost !== undefined ? Math.max(0, Math.round(num(b.cost))) : old.cost ?? 0,
    folderId: b.folderId !== undefined ? (folderById(b.folderId)?.id ?? null) : old.folderId ?? null,
    time: b.time !== undefined ? (str(String(b.time ?? ''), 30) || null) : old.time ?? null,
    servings: b.servings !== undefined ? (str(String(b.servings ?? ''), 20) || null) : old.servings ?? null,
    sourceUrl: b.sourceUrl !== undefined ? httpUrl(b.sourceUrl) : old.sourceUrl ?? null,
  };
}
const httpUrl = (v) => { try { const u = new URL(String(v ?? '').trim()); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 500) : null; } catch { return null; } };

matApi.post('/dishes', async (c) => {
  const b = await readJson(c), s = state(), v = dishInput(b);
  if (!v.name) return bad(c, 'Skriv et navn på retten.');
  if (dishByName(s, v.name)) return bad(c, `${v.name} finnes allerede.`, 409);
  if (s.dishes.length >= 500) return bad(c, 'Maks 500 retter');
  const d = { id: id(), ...v, folderId: b.folderId !== undefined ? v.folderId : guessFolderId(v.name, v.ing) };
  s.dishes.push(d);
  if (isDate(b.date)) place(s, b.date, d.id);
  save(s);
  return reply(c, s, startOf(c, b), { dish: dishOut(s, d) }, 201);
});

matApi.patch('/dishes/:id', async (c) => {
  const b = await readJson(c), s = state(), d = dishOf(s, c.req.param('id'));
  if (!d) return bad(c, 'Fant ikke retten', 404);
  const v = dishInput(b, d);
  if (!v.name) return bad(c, 'Skriv et navn på retten.');
  const twin = dishByName(s, v.name);
  if (twin && twin.id !== d.id) return bad(c, `${v.name} finnes allerede.`, 409);
  Object.assign(d, v);
  save(s);
  return reply(c, s, startOf(c, b), { dish: dishOut(s, d) });
});

// «Alltid på» Ma–Sø for en rett: dagene i listen får retten som fast rett (en annen fast rett på samme dag byttes ut),
// dager som ikke er med lenger mister den. Valgfri kokk per dag: cooks { '4': 'Sebastian' }.
export function setFixedDays(s, dishId, days, cooks = {}) {
  const want = new Set((Array.isArray(days) ? days : []).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < 7));
  const replaced = [];
  for (const [k, f] of Object.entries(s.fixed)) if (f.dish === dishId && !want.has(+k)) delete s.fixed[k];
  for (const k of want) {
    const cur = s.fixed[k];
    if (cur && cur.dish !== dishId) replaced.push({ weekday: DN[k], name: dishOf(s, cur.dish)?.name ?? null });
    const cook = cooks[k] !== undefined ? (str(cooks[k], 40) || null) : cur?.dish === dishId ? cur.cook : bestOf(s, dishId);
    s.fixed[k] = { dish: dishId, cook: cook && s.cooks.some((c) => c.name === cook) ? cook : null };
  }
  return { days: [...want].sort((a, b) => a - b), replaced };
}
matApi.put('/dishes/:id/fixed', async (c) => {
  const b = await readJson(c), s = state(), d = dishOf(s, c.req.param('id'));
  if (!d) return bad(c, 'Fant ikke retten', 404);
  if (!Array.isArray(b.days)) return bad(c, 'days må være en liste med ukedager (0 = mandag)');
  const r = setFixedDays(s, d.id, b.days, b.cooks && typeof b.cooks === 'object' ? b.cooks : {});
  save(s);
  const names = r.days.map((i) => DN[i].toLowerCase());
  const msg = !r.days.length ? `${d.name} er ikke lenger fast.` : `${d.name} hver ${names.length > 1 ? names.slice(0, -1).join(', ') + ' og ' + names.at(-1) : names[0]}.${r.replaced.length ? ` Erstattet ${r.replaced.map((x) => `${x.name} (${x.weekday.toLowerCase()})`).join(', ')}.` : ''}`;
  return reply(c, s, startOf(c, b), { status: msg, fixedDays: r.days });
});

function deleteDish(s, dishId) {
  const d = dishOf(s, dishId);
  if (!d) return null;
  s.dishes = s.dishes.filter((x) => x.id !== dishId);
  for (const [date, p] of Object.entries(s.plan)) if (p.dish === dishId) s.plan[date] = { ...p, dish: null };
  for (const [k, f] of Object.entries(s.fixed)) if (f.dish === dishId) delete s.fixed[k];
  for (const c of s.cooks) c.best = c.best.filter((x) => x !== dishId);
  removeDishData(d);
  return d;
}
matApi.delete('/dishes/:id', (c) => {
  const s = state(), d = deleteDish(s, c.req.param('id'));
  if (!d) return bad(c, 'Fant ikke retten', 404);
  save(s);
  return reply(c, s, startOf(c), { status: `${d.name} er slettet.` });
});

// Eldre: /meals = retter
matApi.post('/meals', async (c) => {
  const b = await readJson(c), s = state(), name = str(b.name, 80);
  if (!name) return bad(c, 'Navn mangler');
  const d = dishByName(s, name) ?? (() => { const x = { id: id(), name, src: 'own', ing: [], steps: [], cost: Math.max(0, Math.round(num(b.cost))) }; s.dishes.push(x); return x; })();
  if (isDate(b.date)) { place(s, b.date, d.id); if (b.fixed) s.fixed[wd(b.date)] = { dish: d.id, cook: entry(s, b.date).cook }; }
  save(s);
  return reply(c, s, startOf(c, b), {}, 201);
});
matApi.delete('/meals/:id', (c) => { const s = state(); deleteDish(s, c.req.param('id')); save(s); return c.json({ ok: true }); });

/* Kokker */

const cookByName = (s, n) => s.cooks.find((x) => low(x.name) === low(n));
function removeCook(s, name) {
  const ck = cookByName(s, name);
  if (!ck) return false;
  s.cooks = s.cooks.filter((x) => x !== ck);
  const alt = s.cooks[0]?.name ?? null;
  for (const p of Object.values(s.plan)) if (p.cook === ck.name) p.cook = alt;
  for (const f of Object.values(s.fixed)) if (f.cook === ck.name) f.cook = alt;
  return true;
}

matApi.post('/cooks', async (c) => {
  const b = await readJson(c), s = state(), name = str(b.name, 40);
  if (!name) return bad(c, 'Skriv et navn.');
  if (cookByName(s, name)) return bad(c, `${name} finnes allerede.`, 409);
  if (s.cooks.length >= 12) return bad(c, 'Maks 12 kokker');
  s.cooks.push({ name, best: [] });
  save(s);
  return reply(c, s, startOf(c, b), {}, 201);
});
matApi.delete('/cooks/:name', (c) => {
  const s = state();
  if (!removeCook(s, c.req.param('name'))) return bad(c, 'Fant ikke kokken', 404);
  save(s);
  return reply(c, s, startOf(c));
});
// «Best på»: retter som setter kokken automatisk når de havner på planen. En rett har én beste kokk.
matApi.put('/cooks/:name/best', async (c) => {
  const b = await readJson(c), s = state(), ck = cookByName(s, c.req.param('name'));
  if (!ck) return bad(c, 'Fant ikke kokken', 404);
  if (!Array.isArray(b.best)) return bad(c, 'best må være en liste');
  ck.best = [...new Set(b.best.filter((x) => dishOf(s, x)))].slice(0, 50);
  for (const o of s.cooks) if (o !== ck) o.best = o.best.filter((x) => !ck.best.includes(x));
  save(s);
  return reply(c, s, startOf(c, b));
});
// Eldre: hele listen med navn
matApi.put('/cooks', async (c) => {
  const b = await readJson(c), s = state();
  if (!Array.isArray(b.cooks)) return bad(c, 'cooks må være en liste');
  const names = [...new Set(b.cooks.map((x) => str(x, 40)).filter(Boolean))].slice(0, 12);
  for (const ck of [...s.cooks]) if (!names.some((n) => low(n) === low(ck.name))) removeCook(s, ck.name);
  for (const n of names) if (!cookByName(s, n)) s.cooks.push({ name: n, best: [] });
  save(s);
  return c.json({ cooks: s.cooks.map((x) => x.name) });
});

matApi.put('/auto', async (c) => {
  const b = await readJson(c), s = state(); s.auto = !!b.auto; save(s);
  return c.json({ auto: s.auto, status: s.auto ? 'En ny plan lages hver søndag kl. 18:00 for uka etter.' : 'Automatisk ukeplan er slått av.' });
});

/* HelloFresh */

matApi.post('/hellofresh', async (c) => {
  const b = await readJson(c), s = state(), list = parseHelloFresh(b.text ?? '');
  if (!list.length) return bad(c, 'Fant ingen retter i teksten');
  let added = 0;
  for (const x of list) if (!dishByName(s, x.name)) { s.dishes.push({ id: id(), name: x.name, src: 'hellofresh', ing: [], steps: [], cost: x.cost }); added++; }
  save(s);
  return reply(c, s, startOf(c, b), { added, status: added ? `${added} ${added === 1 ? 'rett' : 'retter'} lagt til fra HelloFresh.` : 'Ingen nye retter. Alle fantes fra før.' });
});
matApi.post('/hellofresh/:id/add', async (c) => {
  const b = await readJson(c), s = state(), d = dishOf(s, c.req.param('id'));
  if (!d || !isDate(b.date)) return bad(c, 'Ukjent rett eller dato');
  place(s, b.date, d.id); save(s);
  return reply(c, s, monday(b.date));
});

/* Handleliste */

matApi.post('/shopping', async (c) => {
  const b = await readJson(c), s = state(), text = str(b.text, 80), start = startOf(c, b);
  if (!text) return bad(c, 'Tekst mangler');
  const st = (s.shop[start] ??= { done: [], extra: [] });
  st.extra.push({ id: id(), text, price: Math.max(0, Math.round(num(b.price))), done: false });
  save(s);
  return reply(c, s, start);
});
matApi.post('/shopping/:id/toggle', async (c) => {
  const s = state(), sid = c.req.param('id');
  const b = await readJson(c);
  const starts = isDate(b.start) ? [monday(b.start)] : [...new Set([monday(day(new Date())), ...Object.keys(s.shop)])];
  for (const start of starts) {
    const st = (s.shop[start] ??= { done: [], extra: [] });
    const x = st.extra.find((i) => i.id === sid);
    if (x) { x.done = !x.done; save(s); return c.json(x); }
    const g = shopping(s, start).find((i) => i.id === sid);
    if (g) {
      const k = low(g.text);
      st.done = st.done.includes(k) ? st.done.filter((y) => y !== k) : [...st.done, k];
      save(s);
      return c.json({ ...g, done: st.done.includes(k) });
    }
    if (!st.done.length && !st.extra.length) delete s.shop[start];
  }
  return bad(c, 'Fant ikke varen', 404);
});
matApi.delete('/shopping/:id', (c) => {
  const s = state();
  for (const st of Object.values(s.shop)) { const n = st.extra.length; st.extra = st.extra.filter((x) => x.id !== c.req.param('id')); if (st.extra.length !== n) { save(s); return c.json({ ok: true }); } }
  return bad(c, 'Fant ikke varen', 404);
});

matApi.post('/calendar/rotate', (c) => { const s = state(); s.calKey = randomBytes(18).toString('base64url'); save(s); return c.json({ calendarUrl: `/mat/calendar.ics?key=${s.calKey}` }); });

/* Mapper, oppskrifter fra nettsider og skanning, lenker og filer (mat-recipes.js) */

// Ny rett fra import eller skanning. Finnes navnet fra før, får den nye retten «(2)» bak.
function addDish(f) {
  const s = state();
  if (s.dishes.length >= 500) throw Object.assign(new Error('Maks 500 retter'), { status: 400 });
  let name = str(f.name, 80) || 'Ny rett';
  for (let i = 2; dishByName(s, name); i++) name = `${str(f.name, 74)} (${i})`;
  const d = { id: id(), name, src: f.src ?? 'own', ing: lines(f.ingredients ?? f.ing, 60, 200), steps: lines(f.steps, 40, 600), cost: 0,
    folderId: f.folderId ?? null, sourceUrl: f.sourceUrl ?? null, image: f.image ?? null, time: f.time ?? null, servings: f.servings ?? null, ...(f.scanFile ? { scanFile: f.scanFile } : {}) };
  s.dishes.push(d);
  save(s);
  return d;
}
mountRecipes(matApi, { state, save, dishOf, addDish, dishOut, reply, startOf });

/* ---------------- ICS-feed (abonneres fra Google/Apple Kalender) ---------------- */

// Nøkkelen avgjør hvem sin kalender det er (ISO2: hver bruker har sin egen calKey).
export function matCalendar(c) {
  const key = String(c.req.query('key') ?? '');
  if (key.length < 16 || !/^[\w-]+$/.test(key)) return c.text('Ugyldig nøkkel', 403);
  for (const row of db.prepare("SELECT user FROM kv WHERE key='mat' AND instr(value, ?) > 0").all(key)) {
    const out = runAsUser(row.user, () => {
      const s = state(row.user);
      const a = Buffer.from(key), b = Buffer.from(s.calKey ?? '');
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      return c.body(ics(s, feedDates(s)), 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' });
    });
    if (out) return out;
  }
  return c.text('Ugyldig nøkkel', 403);
}

/* ---------------- Automatisk plan søndag kl. 18 ---------------- */

export function startMatScheduler() {
  // Hver bruker med automatisk plan, i sin egen kontekst.
  const tickFor = async (u) => {
    const today = day(new Date());
    const s = state(u);
    if (!s.auto || s.lastAuto === today) return;
    s.lastAuto = today; save(s, u);
    try { const s2 = state(u); await generate(s2, weekDates(addDays(today, 1)), 'ai'); s2.lastAuto = today; save(s2, u); }
    catch (e) { console.error('[mat]', e.message); }
  };
  const tick = async () => {
    const now = new Date();
    if (now.getDay() !== 0 || now.getHours() < 18) return;
    for (const { user } of db.prepare("SELECT user FROM kv WHERE key='mat'").all()) await runAsUser(user, () => tickFor(user)).catch(() => {});
  };
  setInterval(tick, 10 * 60_000).unref();
}
