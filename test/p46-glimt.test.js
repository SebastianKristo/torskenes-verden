// Prompt 46 (GLIMT46): Glimt-oppfølgingene bygget på motoren i server/glimt45/. Fast «i dag»: fredag 23. oktober 2026.
// Abonnementer og faste utgifter, avslutningsfrist i Subscription OS + påminnelse, sammensatte værspørsmål, standardkalender,
// rask time («Dune – Kino» + Colosseum Kino), Gjøremål uten omskriving av norsken, og Chat uten nett når Nettsøk er av.
// Mock av Ollama/værtjeneste/stedssøk/film for determinisme. Testene sjekker lagrede/hentede data, ikke bare svartekst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p46g-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-46g';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv } = await import('../server/db.js');
const E = await import('../server/glimt45/engine.js');
const P = await import('../server/glimt45/plan.js');
const W = await import('../server/glimt45/weather46.js');
const SB = await import('../server/glimt45/subs46.js');
const C46 = await import('../server/glimt45/calendar46.js');
const T46 = await import('../server/glimt45/tasks46.js');
const tg41 = await import('../server/tasks-glimt41.js');
const gate = await import('../server/ai-gate.js');
const web = await import('../server/web-search.js');

const TODAY = '2026-10-23';
E._setClock45({ today: TODAY, nowMin: 600 });
let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (cookie) => (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });
const A = as(await login('sebastian', 'testpassord1'));
for (const [u, name] of [['ola', 'Ola'], ['kari', 'Kari'], ['per', 'Per']]) assert.equal((await A('/api/users', 'POST', { username: u, password: `${u}Passord123`, role: 'bruker', name })).status, 200);
const O = as(await login('ola', 'olaPassord123'));
const K = as(await login('kari', 'kariPassord123'));
const PR = as(await login('per', 'perPassord123'));
const idOf = (u) => db.prepare('SELECT id FROM users WHERE username=?').pluck().get(u);
const OLA = idOf('ola'), KARI = idOf('kari'), PER = idOf('per');
let rid = 0;
const RID = () => `t46-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
const agent = (who, text, extra = {}) => who('/api/glimt/agent', 'POST', { text, module: 'home', requestId: RID(), ...extra });
const tasksOf = (u) => db.prepare('SELECT * FROM hl_tasks WHERE created_by=? AND archived_at IS NULL ORDER BY id').all(u);
const trialsOf = (u) => db.prepare('SELECT * FROM trials WHERE user_id=? ORDER BY id').all(u);
const localEvents = (u) => kv.get(u, 'kal_local_events', []) ?? [];

/* ---------------- Testdata: abonnementer og faste trekk ---------------- */

await O('/api/glimt/agent', 'POST', { text: 'Hva brukte jeg på mat forrige måned?', module: 'finance' }); // lager ledger/kategorier
const subIns = db.prepare('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,created,user_id,active) VALUES(?,?,?,?,?,?,?,1) RETURNING id');
const SUBS = {
  netflix: subIns.get('Netflix', 'Standard', 14900, 'monthly', '2026-11-05', Date.now(), OLA).id,
  spotify: subIns.get('Spotify', 'Premium', 11900, 'monthly', '2026-11-01', Date.now(), OLA).id,
  domene: subIns.get('Domeneboks', '', 120000, 'yearly', '2027-03-01', Date.now(), OLA).id, // 1 200 kr/år = 100 kr/mnd
  ukjent: subIns.get('Avisa', '', 0, 'monthly', null, Date.now(), OLA).id, // mangler pris
};
db.prepare('UPDATE fh_subscriptions SET prev_price=9900, price_changed=? WHERE id=?').run('2026-09-01', SUBS.spotify);
db.prepare('INSERT INTO fh_recurring(name, amount, interval, day, active, user_id) VALUES(?,?,?,?,1,?)').run('Husleie', -950000, 'monthly', 1, OLA);

test('abonnementer: dyreste (årskostnad), månedlig mot årlig, total, prisøkning, manglende pris – fra faktiske data', async () => {
  const r = await agent(O, 'Hva er det dyreste abonnementet jeg har?');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.actions[0].tool, 'finance.subscriptions');
  const res = r.body.actions[0].result;
  assert.equal(res.ranked[0].name, 'Netflix');
  assert.deepEqual([res.ranked[0].monthly, res.ranked[0].yearly], [149, 1788]);
  assert.deepEqual(res.ranked.map((x) => x.name), ['Netflix', 'Spotify', 'Domeneboks'], 'årlig 1 200 kr = 100 kr/mnd, under Spotify');
  assert.deepEqual(res.uncertain.map((x) => x.name), ['Avisa']);
  assert.match(r.body.reply, /Det dyreste abonnementet ditt er \*\*Netflix\*\*, som koster \*\*149 kr per måned\*\*.*\*\*149 kr per måned\*\* og \*\*1 788 kr per år\*\*/);
  assert.match(r.body.reply, /«Avisa» mangler pris/);
  // Flere naturlige formuleringer → samme verktøy og samme svar.
  for (const q of ['Hvilket av abonnementene mine koster mest?', 'Hva er den største årlige abonnementskostnaden min?', 'Hvilket abonnement er dyrest hvis vi regner per måned?', 'Hva bruker jeg mest på abonnementer?']) {
    const x = await agent(O, q);
    assert.equal(x.body.actions[0].tool, 'finance.subscriptions', q);
    assert.equal(x.body.actions[0].result.ranked[0].name, 'Netflix', q);
  }
  assert.equal((await agent(O, 'Hvilket abonnement er dyrest hvis vi regner per måned?')).body.actions[0].args.basis, 'monthly');
  const tot = await agent(O, 'Hvor mye betaler jeg totalt for abonnementer hver måned?');
  assert.equal(tot.body.actions[0].args.mode, 'total');
  assert.deepEqual(tot.body.actions[0].result.total, { monthly: 368, yearly: 4416 });
  assert.match(tot.body.reply, /\*\*368 kr per måned\*\*/);
  const up = await agent(O, 'Hvilke abonnementer har blitt dyrere?');
  assert.deepEqual(up.body.actions[0].result.ranked.map((x) => x.name), ['Spotify']);
  assert.match(up.body.reply, /Spotify\*\* 99 kr → 119 kr per måned \(\+20 %/);
});

test('abonnementer: tom liste, datakilden nede og samme spørsmål fra Hjem (/api/assist)', async () => {
  const k = await agent(K, 'Hva er det dyreste abonnementet jeg har?');
  assert.match(k.body.reply, /ingen registrerte abonnementer/);
  SB._setSubsFail46(() => { throw new Error('Finans svarer ikke'); });
  try {
    const f = await agent(O, 'Hva er det dyreste abonnementet jeg har?');
    assert.equal(f.body.actions[0].status, 'failed');
    assert.match(f.body.reply, /Fikk ikke lest abonnementene fra Subscription OS: Finans svarer ikke/);
    assert.equal(f.body.joke, null);
  } finally { SB._setSubsFail46(null); }
  const h = await O('/api/assist', 'POST', { q: 'Hva er det dyreste abonnementet mitt?' });
  assert.equal(h.status, 200, h.text);
  assert.match(h.body.text, /Netflix/);
  assert.equal(h.body.agent.actions[0].tool, 'finance.subscriptions');
});

test('modellen vil svare uten data (finance.summary/chat) → etterkontrollen henter abonnementene', async () => {
  P._setGlimtModel45(async () => ({ data: { intent: 'summarize', module: 'finance', calls: [{ tool: 'finance.summary', args: { category: 'Abonnementer' } }] }, model: 'mock' }));
  P._setToolMode45('json');
  try {
    const r = await agent(O, 'Hva er det dyreste abonnementet jeg har?');
    assert.equal(r.body.engine, 'ollama-json');
    assert.deepEqual(r.body.actions.map((x) => x.tool), ['finance.subscriptions']);
    assert.equal(r.body.actions[0].result.ranked[0].name, 'Netflix');
  } finally { P._setGlimtModel45(null); P._setToolMode45(null); }
});

test('faste utgifter: de fem største og betalinger denne måneden (abonnementer + faste trekk)', async () => {
  const r = await agent(O, 'Hva er de fem største faste utgiftene mine?');
  assert.equal(r.body.actions[0].tool, 'finance.fixed');
  assert.deepEqual(r.body.actions[0].result.top.map((x) => x.name), ['Husleie', 'Netflix', 'Spotify', 'Domeneboks']);
  const m = await agent(O, 'Hvilke faste betalinger har jeg denne måneden?');
  assert.equal(m.body.actions[0].args.month, '2026-10');
  assert.ok(m.body.actions[0].result.items.some((x) => x.name === 'Husleie' && x.date === '2026-10-01'));
});

/* ---------------- Avslutningsfrist i Subscription OS + påminnelse ---------------- */

test('«Minn meg på å avslutte Spotify 15.11»: påminnelse i Gjøremål OG Prøveperioder, koblet til abonnementet, uten duplikater', async () => {
  const r = await agent(O, 'Minn meg på å avslutte Spotify 15.11');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.actions.map((x) => [x.tool, x.status]), [['tasks.create', 'done'], ['subscriptions.trial', 'done']]);
  const task = tasksOf(OLA).find((x) => x.title === 'Avslutte Spotify');
  assert.ok(task, JSON.stringify(tasksOf(OLA).map((x) => x.title)));
  assert.equal(task.due, '2026-11-15');
  let tr = trialsOf(OLA).filter((x) => x.service === 'Spotify');
  assert.equal(tr.length, 1);
  assert.deepEqual([tr[0].cancel_by, tr[0].ends_at, tr[0].subscription_id, tr[0].price_after, tr[0].status], ['2026-11-15', '2026-11-15', SUBS.spotify, 119, 'active']);
  // Abonnementet selv er uendret (pris, syklus, neste trekk).
  const sub = db.prepare('SELECT price, cycle, next_date, active FROM fh_subscriptions WHERE id=?').get(SUBS.spotify);
  assert.deepEqual(sub, { price: 11900, cycle: 'monthly', next_date: '2026-11-01', active: 1 });
  // Vises i Subscription OS → Prøveperioder (samme liste som appene henter).
  const list = await O('/finans/api/subscriptions/trials');
  assert.ok(list.body.items.some((x) => x.service === 'Spotify' && x.endsAt === '2026-11-15'));
  // Subscription-loggen (SERVER46) har trial_start for prøven.
  assert.ok(db.prepare("SELECT 1 FROM subscription_events WHERE user_id=? AND type='trial_start' AND service='Spotify'").get(OLA), 'trial_start i loggen');
  assert.match(r.body.reply, /Lagt i Gjøremål.*\*\*Avslutte Spotify\*\*.*Registrert i Abonnementer → Prøveperioder: \*\*Spotify\*\* må avsluttes innen \*\*søndag 15\. november\*\*/);
  // Gjentatt forespørsel (ny requestId): ingen ny påminnelse og ingen ny prøve.
  const again = await agent(O, 'Minn meg på å avslutte Spotify 15.11');
  assert.equal(again.body.actions[1].result.status, 'unchanged');
  assert.equal(tasksOf(OLA).filter((x) => x.title === 'Avslutte Spotify').length, 1);
  assert.equal(trialsOf(OLA).filter((x) => x.service === 'Spotify').length, 1);
  // Ny frist → oppdaterer den eksisterende raden.
  const upd = await agent(O, 'Minn meg på å avslutte Spotify 20.11');
  assert.equal(upd.body.actions[1].result.status, 'updated');
  tr = trialsOf(OLA).filter((x) => x.service === 'Spotify');
  assert.equal(tr.length, 1);
  assert.deepEqual([tr[0].cancel_by, tr[0].ends_at], ['2026-11-20', '2026-11-20']);
  assert.match(upd.body.reply, /avsluttes innen \*\*fredag 20\. november\*\* \(var søndag 15\. november\)/);
});

test('ny tjeneste uten pris, kjent prøveslutt beholdes, manglende dato → spørsmål, år og passerte datoer', async () => {
  const d = await agent(K, 'Jeg må kansellere Disney+ 15.11');
  assert.deepEqual(d.body.actions.map((x) => x.status), ['done', 'done']);
  const t = trialsOf(KARI).find((x) => x.service === 'Disney+');
  assert.deepEqual([t.ends_at, t.cancel_by, t.ends_kind, t.price_after], ['2026-11-15', '2026-11-15', 'cancel_by', null], 'ingen oppdiktet pris');
  assert.match(d.body.reply, /Når prøven faktisk slutter, vet jeg ikke/);
  // Kjent prøve (fra skjemaet) med sluttdato og pris: «før prøveperioden går ut» bruker sluttdatoen, og ingenting overskrives.
  const tr = await import('../server/finans/trials.js');
  const v = tr.createTrial(KARI, { service: 'Viaplay', endsAt: '2026-11-30', priceAfter: 449 }, { today: TODAY }).row;
  const r = await agent(K, 'Minn meg på å avslutte Viaplay før prøveperioden går ut');
  assert.equal(r.body.actions.at(-1).status, 'done', r.text);
  const row = trialsOf(KARI).find((x) => x.id === v.id);
  assert.deepEqual([row.ends_at, row.cancel_by, row.price_after, row.ends_kind], ['2026-11-30', '2026-11-30', 449, 'trial_end']);
  assert.equal(tasksOf(KARI).find((x) => /Viaplay/.test(x.title)).due, '2026-11-30', 'påminnelsen får fristen');
  // Ingen dato og ingen kjent prøve → ett spørsmål, ingenting lagret.
  const n0 = tasksOf(KARI).length, t0 = trialsOf(KARI).length;
  const q = await agent(K, 'Minn meg på å avslutte Netflix');
  assert.match(q.body.reply, /Når må Netflix avsluttes\?/);
  assert.ok(q.body.ask);
  assert.deepEqual([tasksOf(KARI).length, trialsOf(KARI).length], [n0, t0]);
  // Uten tjeneste → spør hvilken.
  assert.match((await agent(K, 'Minn meg på å avslutte abonnementet 15.11')).body.reply, /Hvilken tjeneste/);
  // 15.10 er passert i år → neste år (appens regel); 15.10.2026 med år er passert → feil, ingenting lagret.
  const y = await agent(K, 'Minn meg på å avslutte Storytel 15.10');
  assert.equal(trialsOf(KARI).find((x) => x.service === 'Storytel').cancel_by, '2027-10-15');
  const past = await agent(K, 'Minn meg på å avslutte Audible 15.10.2026');
  assert.equal(past.body.actions.at(-1).status, 'failed');
  assert.ok(!trialsOf(KARI).some((x) => x.service === 'Audible'));
  assert.ok(!tasksOf(KARI).some((x) => /Audible/.test(x.title)), 'ingen halv handling');
  assert.ok(y.body.reply);
});

test('feil i én av oppdateringene: påminnelsen lagres, Glimt sier at Prøveperioder feilet', async () => {
  SB._setSubsFail46((src) => { if (src === 'trials') throw new Error('Abonnementsdatabasen er låst'); });
  try {
    const r = await agent(PR, 'Minn meg på å avslutte HBO Max 12.11');
    assert.deepEqual(r.body.actions.map((x) => [x.tool, x.status]), [['tasks.create', 'done'], ['subscriptions.trial', 'failed']]);
    assert.match(r.body.reply, /Lagt i Gjøremål/);
    assert.match(r.body.reply, /Fikk ikke registrert det i Abonnementer → Prøveperioder: Abonnementsdatabasen er låst/);
    assert.ok(!/Registrert i Abonnementer/.test(r.body.reply));
    assert.equal(r.body.joke, null);
    assert.ok(tasksOf(PER).some((x) => x.title === 'Avslutte HBO Max'));
    assert.ok(!trialsOf(PER).some((x) => x.service === 'HBO Max'));
  } finally { SB._setSubsFail46(null); }
});

test('ikke enhver oppgave med «abonnement»: «Husk å fornye abonnementet på avisen» er bare et gjøremål', async () => {
  const r = await agent(PR, 'Husk å fornye abonnementet på avisen');
  assert.deepEqual(r.body.actions.map((x) => x.tool), ['tasks.create']);
  const p = P.localPlan45('Minn meg på å avslutte Spotify 15.10', { today: TODAY });
  assert.deepEqual(p.calls.map((c) => c.tool), ['tasks.create', 'subscriptions.trial']);
  // Selve prøveregistreringen («gratis i 14 dager») går som før.
  assert.deepEqual(P.localPlan45('Viaplay gratis i 14 dager, påminn meg om å avslutte', { today: TODAY, legacyIntent: 'trial.create' }).calls.map((c) => c.tool), ['app.answer']);
});

/* ---------------- Vær: sammensatte spørsmål ---------------- */

const wxCalls = [];
let inflight = 0, maxInflight = 0;
const WX = {
  Oslo: { tz: 'Europe/Oslo', start: '2026-10-23', now: 9, hi: [10, 8, 7, 9, 11, 6, 5], lo: [4, 3, 1, 2, 5, 0, -1], pp: [10, 80, 20, 0, 60, 30, 10], cond: 'Lettskyet' },
  'New York': { tz: 'America/New_York', start: '2026-10-22', now: 17, hi: [18, 19, 21, 16, 15, 14, 13], lo: [11, 12, 13, 9, 8, 8, 7], pp: [0, 10, 0, 40, 70, 10, 0], cond: 'Klart' }, // stedets egne datoer
  Stockholm: { tz: 'Europe/Stockholm', start: '2026-10-23', now: 7, hi: [8, 6, 5, 7, 8, 4, 3], lo: [2, 1, 0, 1, 2, -2, -3], pp: [20, 90, 10, 0, 50, 20, 0], cond: 'Skyet' },
  Bergen: { tz: 'Europe/Oslo', start: '2026-10-23', now: 8, hi: [9, 10, null, 8, 9, 7, 6], lo: [5, 6, null, 4, 5, 3, 2], pp: [90, 95, 0, 80, 70, 60, 50], cond: 'Regn' },
  London: { tz: 'Europe/London', start: '2026-10-23', now: 12, hi: [13, 14, 15, 16, 12], lo: [8, 9, 10, 9, 7], pp: [10, 20, 30, 60, 80], cond: 'Overskyet' }, // bare 5 dager
};
const addD = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
W._setWeather46(async (name) => {
  wxCalls.push(name);
  inflight++; maxInflight = Math.max(maxInflight, inflight);
  await new Promise((r) => setTimeout(r, 20));
  inflight--;
  if (name === 'Tokyo') throw new Error('Open-Meteo svarte 503');
  const w = WX[name];
  if (!w) throw Object.assign(new Error(`Fant ikke stedet «${name}»`), { status: 404, suggest: /yrok/i.test(name) ? 'New York' : null });
  return { place: { name, label: name === 'New York' ? 'New York, USA' : name, tz: w.tz }, now: { temp: w.now, cond: w.cond, wind: 4 }, source: 'test',
    days: w.hi.map((hi, i) => ({ date: addD(w.start, i), hi, lo: w.lo[i], cond: w.cond, precipProb: w.pp[i] })) };
});

test('vær: «Oslo i dag og temperaturen i New York i morgen» → to kall (parallelt) med riktige steder og datoer, samlet svar', async () => {
  wxCalls.length = 0; maxInflight = 0;
  const r = await agent(O, 'Hvordan er været i Oslo i dag og temperaturen i New York i morgen?');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.actions.map((x) => [x.tool, x.status, x.args.place, x.args.when.from, x.args.info]), [['weather.get', 'done', 'Oslo', '2026-10-23', 'summary'], ['weather.get', 'done', 'New York', '2026-10-24', 'temp']]);
  assert.deepEqual(wxCalls.sort(), ['New York', 'Oslo']);
  assert.equal(maxInflight, 2, 'kallene går parallelt');
  // New York sin «i morgen» er datoen 24.10 i stedets egen liste (ikke indeks 1 = 23.10 der).
  assert.deepEqual(r.body.actions[1].result.days.map((d) => [d.date, d.hi, d.lo]), [['2026-10-24', 21, 13]]);
  assert.match(r.body.reply, /I dag i Oslo: \*\*lettskyet, 4–10°\*\* \(min–maks\).*I morgen i New York, USA: maks \*\*21°\*\*, min 13°/);
  // Samme fra Hjem-søket (/api/assist): motoren tar det, ikke det gamle én-sted-svaret.
  const h = await O('/api/assist', 'POST', { q: 'Hvordan er været i Oslo i dag og temperaturen i New York i morgen?' });
  assert.match(h.body.text, /Oslo.*New York/);
  assert.deepEqual(h.body.agent.actions.map((x) => x.tool), ['weather.get', 'weather.get']);
});

test('vær: to byer samme dag, sammenligning, nå + i morgen (arver sted), periode, ukedag og regn', async () => {
  const s = await agent(O, 'Sammenlign været i Oslo og Stockholm i morgen.');
  assert.deepEqual(s.body.actions.map((x) => [x.args.place, x.args.when.from]), [['Oslo', '2026-10-24'], ['Stockholm', '2026-10-24']]);
  assert.match(s.body.reply, /Varmest blir det i \*\*Oslo\*\* \(8° mot 6° i Stockholm\)/);
  const c = await agent(O, 'Er det varmere i Oslo eller New York i morgen?');
  assert.match(c.body.reply, /Varmest blir det i \*\*New York, USA\*\* \(21° mot 8° i Oslo\)/);
  const n = await agent(O, 'Hva er temperaturen i Oslo nå, og hvordan blir den i morgen?');
  assert.deepEqual(n.body.actions.map((x) => [x.args.place, x.args.when.kind, x.args.when.from]), [['Oslo', 'now', '2026-10-23'], ['Oslo', 'day', '2026-10-24']]);
  assert.match(n.body.reply, /I Oslo er det \*\*9°\*\* nå.*I morgen i Oslo: maks \*\*8°\*\*/, 'i morgen ≠ dagens temperatur');
  const b = await agent(O, 'Hvordan blir været i Oslo i morgen, og regner det i Stockholm på lørdag?');
  assert.deepEqual(b.body.actions.map((x) => [x.args.place, x.args.when.from, x.args.info]), [['Oslo', '2026-10-24', 'summary'], ['Stockholm', '2026-10-24', 'precip']]);
  assert.match(b.body.reply, /Ja, det ser ut til å bli nedbør \(\*\*90 %\*\*\)/);
  const both = await agent(O, 'Hva er temperaturen i Oslo og New York akkurat nå?');
  assert.deepEqual(both.body.actions.map((x) => [x.args.place, x.args.when.kind]), [['Oslo', 'now'], ['New York', 'now']]);
  const ask = await agent(O, 'Sammenlign været i tre byer i helgen.');
  assert.match(ask.body.reply, /Hvilke tre byer/);
  assert.equal(ask.body.actions.length, 0);
});

test('vær: periode der prognosen er kortere, manglende data, ugyldig sted og feil fra værtjenesten', async () => {
  const l = await agent(O, 'Hvor varmt blir det i London neste uke?');
  assert.equal(l.body.actions[0].status, 'done');
  assert.match(l.body.reply, /Neste uke i London \(prognosen går til tirsdag\): maks \*\*16°\*\* \(mandag\)/);
  const m = await agent(O, 'Hva blir temperaturen i Bergen søndag, og i Oslo i morgen?');
  assert.deepEqual(m.body.actions.map((x) => x.status), ['failed', 'done']);
  assert.match(m.body.reply, /Værtjenesten ga ingen prognose for Bergen/);
  assert.match(m.body.reply, /I morgen i Oslo/);
  const bad = await agent(O, 'Hva er temperaturen i Oslo og Nwe Yrok nå?');
  assert.deepEqual(bad.body.actions.map((x) => x.status), ['done', 'failed']);
  assert.match(bad.body.reply, /Fant ikke stedet «Nwe Yrok»\. Mente du New York\?/);
  assert.ok(!/\?\./.test(bad.body.reply));
  const down = await agent(O, 'Hva er temperaturen i Tokyo og Oslo i morgen?');
  assert.match(down.body.reply, /Fikk ikke hentet været for Tokyo \(Open-Meteo svarte 503\)/);
  assert.match(down.body.reply, /I morgen i Oslo/);
});

test('vær: relative datoer ved månedsskifte og årsskifte, helg og ukedag (deterministisk oppdeling)', () => {
  const a = W.analyzeWeather46('Temperaturen i Oslo i morgen og i Bergen i overmorgen?', '2026-10-31');
  assert.deepEqual(a.requests.map((r) => [r.place, r.when.from]), [['Oslo', '2026-11-01'], ['Bergen', '2026-11-02']]);
  const y = W.analyzeWeather46('Været i Oslo i dag og i Stockholm i morgen', '2026-12-31');
  assert.deepEqual(y.requests.map((r) => [r.place, r.when.from]), [['Oslo', '2026-12-31'], ['Stockholm', '2027-01-01']]);
  const h = W.analyzeWeather46('været i oslo og bergen til helgen', TODAY);
  assert.deepEqual(h.requests.map((r) => [r.place, r.when.from, r.when.to]), [['Oslo', '2026-10-24', '2026-10-25'], ['Bergen', '2026-10-24', '2026-10-25']]);
  assert.equal(W.isCompoundWeather46('Hvordan er været i Oslo i dag?', TODAY), false, 'ett sted, én dag: det gamle svaret');
  assert.equal(W.analyzeWeather46('Blir det regn i Bergen på fredag?', TODAY).requests[0].when.from, '2026-10-30');
});

/* ---------------- Kalender: standardkalender ---------------- */

test('kalender: standardkalenderen brukes (ingen «må være privat eller familie»), nevnt kalender, skrivebeskyttet og ukjent', async () => {
  const r = await agent(K, 'Legg til kino fredag kl 19', { module: 'calendar' });
  assert.equal(r.body.actions[0].status, 'done', r.text);
  assert.equal(r.body.actions[0].result.calendar.id, 'personlig');
  assert.ok(!/privat eller familie/i.test(r.body.reply));
  // Bytt standardkalender (Innstillinger → Kalender → Standardkalender) → nye avtaler havner der.
  const cal = await K('/api/kalender/calendars', 'POST', { name: 'Fritid', color: '#336699' });
  assert.equal(cal.status, 201, cal.text);
  assert.equal((await K('/api/kalender/calendars/prefs', 'PUT', { defaultCalendar: cal.body.calendar.id })).status, 200);
  const f = await agent(K, 'Legg til padel lørdag kl 10', { module: 'calendar' });
  assert.equal(f.body.actions[0].result.calendar.id, cal.body.calendar.id);
  assert.match(f.body.reply, /i Fritid-kalenderen/);
  const ev = (await K(`/api/kalender?from=2026-10-24&to=2026-10-24`)).body?.events?.find((x) => x.title === 'Padel') ?? null;
  if (ev) assert.equal(ev.appCalendar, cal.body.calendar.id);
  // «i familiekalenderen» → Familie (lagringen), og ordet havner ikke i tittelen.
  const fam = await agent(K, 'Legg til middag i familiekalenderen fredag 18', { module: 'calendar' });
  assert.equal(fam.body.actions[0].result.calendar.id, 'familie');
  const saved = localEvents(KARI).find((x) => x.title === 'Middag');
  assert.equal(saved.calendar, 'familie');
  // Skrivebeskyttet → tydelig spørsmål, ingenting lagret.
  const n0 = localEvents(KARI).length;
  const ro = await agent(K, 'Legg til lunsj i helligdager-kalenderen fredag 12', { module: 'calendar' });
  assert.match(ro.body.reply, /Kan ikke legge til i «Helligdager», den er skrivebeskyttet\. Legge i Fritid i stedet\?/);
  assert.equal(localEvents(KARI).length, n0);
  const unk = await agent(K, 'Legg til lunsj i jobbkalenderen fredag 12', { module: 'calendar' });
  assert.match(unk.body.reply, /^Hvilken kalender\? /);
  assert.ok(unk.body.ask.options.some((o) => o.id === 'personlig'));
  // Svar på spørsmålet: samme tekst med context.calendarId.
  const pick = await agent(K, 'Legg til lunsj i jobbkalenderen fredag 12', { module: 'calendar', context: { calendarId: 'personlig' } });
  assert.equal(pick.body.actions[0].result.calendar.id, 'personlig');
  // GET /api/glimt/agent/calendars → skrivbare kalendere og standard.
  const list = await K('/api/glimt/agent/calendars');
  assert.equal(list.body.defaultCalendar, cal.body.calendar.id);
  assert.ok(list.body.calendars.some((x) => x.id === 'personlig') && list.body.readOnly.some((x) => x.id === 'helligdager'));
  await K('/api/kalender/calendars/prefs', 'PUT', { defaultCalendar: 'personlig' });
});

test('kalender-API: appens kalender-id i «calendar» (som appene sender) gir ikke lenger 400', async () => {
  const p = await K('/api/kalender/events', 'POST', { title: 'Fra appen', date: '2026-11-02', start: '10:00', end: '11:00', allDay: false, calendar: 'personlig' });
  assert.equal(p.status, 201, p.text);
  assert.equal(p.body.event.appCalendar, 'personlig');
  const ro = await K('/api/kalender/events', 'POST', { title: 'x', date: '2026-11-02', allDay: true, calendar: 'helligdager' });
  assert.equal(ro.status, 400);
  assert.match(ro.body.error, /skrivebeskyttet/);
  assert.equal((await K('/api/kalender/events', 'POST', { title: 'x', date: '2026-11-02', allDay: true, calendar: 'timeplan' })).status, 400, 'ukjent id som før');
});

/* ---------------- Rask time: «Dune – Kino» ---------------- */

C46._setPlace46(async (name) => (/colosseum/i.test(name) ? { address: 'Fridtjof Nansens vei 6, 0369 Oslo', label: 'Fridtjof Nansens vei 6, Majorstuen', lat: 59.9296, lon: 10.7116 } : null));
C46._setMovie46(async (t) => (/^dune$/i.test(t) ? { title: 'Dune', year: 2021, runtime: 150, poster: 'https://image.tmdb.org/t/p/w500/dune.jpg' } : null));

test('rask time: forhåndsvisning (lagrer ingenting) og lagring – «Dune – Kino», Colosseum Kino, 17.12 17:30–20:15', async () => {
  const before = localEvents(OLA).length;
  const pv = await O('/api/glimt/agent/preview', 'POST', { text: 'vi skal se på dune på coluseum kino 17.12 kl 17:30', module: 'calendar', context: { today: TODAY, defaultCalendarId: 'personlig', local: { date: '2026-12-17', start: '17:30' } } });
  assert.equal(pv.status, 200, pv.text);
  assert.deepEqual([pv.body.title, pv.body.location, pv.body.address, pv.body.date, pv.body.start, pv.body.end, pv.body.calendarId, pv.body.reminder, pv.body.saved],
    ['Dune – Kino', 'Colosseum Kino', 'Fridtjof Nansens vei 6, 0369 Oslo', '2026-12-17', '17:30', '20:15', 'personlig', 60, false]);
  assert.equal(pv.body.poster, 'https://image.tmdb.org/t/p/w500/dune.jpg');
  assert.equal(pv.body.preview.line2, 'Torsdag 17. desember · 17:30–20:15 · 1 t før');
  assert.equal(pv.body.actions[0].status, 'proposed');
  assert.equal(localEvents(OLA).length, before, 'forhåndsvisningen lagrer aldri');
  // Lagring etterpå (samme tekst) blir ikke stoppet av forhåndsvisningen (egen nøkkel).
  const r = await agent(O, 'vi skal se på dune på coluseum kino 17.12 kl 17:30', { module: 'calendar' });
  assert.equal(r.body.actions[0].status, 'done', r.text);
  const e = localEvents(OLA).find((x) => x.title === 'Dune – Kino');
  assert.deepEqual([e.date, e.start, e.end, e.location], ['2026-12-17', '17:30', '20:15', 'Colosseum Kino']);
  // Flere eksempler uten modell.
  const t = await O('/api/glimt/agent/preview', 'POST', { text: 'tannlege hos Nina fredag kl 9', module: 'calendar' });
  assert.deepEqual([t.body.title, t.body.location, t.body.date, t.body.start], ['Tannlege', 'Nina', '2026-10-30', '09:00']);
  const m = await O('/api/glimt/agent/preview', 'POST', { text: 'middag med mormor søndag 18', module: 'calendar' });
  assert.deepEqual([m.body.title, m.body.location, m.body.date, m.body.start], ['Middag med mormor', null, '2026-10-25', '18:00']);
  // Ikke en avtale → ingen forhåndsvisning, og ingenting gjøres (heller ikke de gamle svarene).
  const no = await O('/api/glimt/agent/preview', 'POST', { text: 'Viaplay gratis i 14 dager', module: 'calendar' });
  assert.equal(no.body.preview, null);
  assert.ok(!trialsOf(OLA).some((x) => x.service === 'Viaplay'));
});

test('rask time med modell: modellen bestemmer tittel og sted, teksten bestemmer dato/tid; sted som ikke står i teksten forkastes', async () => {
  P._setGlimtModel45(async () => ({ data: { intent: 'create', module: 'calendar', calls: [{ tool: 'calendar.create', args: { title: 'Dune – Kino', location: 'Colosseum Kino', date: '2026-12-18', time: '18:00' } }] }, model: 'mock' }));
  P._setToolMode45('json');
  try {
    const pv = await O('/api/glimt/agent/preview', 'POST', { text: 'vi skal se på dune på coluseum kino 17.12 kl 17:30', module: 'calendar' });
    assert.equal(pv.body.engine, 'ollama-json');
    assert.deepEqual([pv.body.title, pv.body.location, pv.body.date, pv.body.start], ['Dune – Kino', 'Colosseum Kino', '2026-12-17', '17:30']);
    P._setGlimtModel45(async () => ({ data: { intent: 'create', module: 'calendar', calls: [{ tool: 'calendar.create', args: { title: 'Tannlege', location: 'Storgata 1' } }] }, model: 'mock' }));
    const t = await O('/api/glimt/agent/preview', 'POST', { text: 'tannlege hos Nina fredag kl 9', module: 'calendar' });
    assert.equal(t.body.location, 'Nina', 'oppdiktet sted forkastes');
  } finally { P._setGlimtModel45(null); P._setToolMode45(null); }
});

/* ---------------- Gjøremål: plukk ut, ikke skriv om ---------------- */

test('Gjøremål: titlene klippes ut av brukerens tekst; omskrevet/feil norsk byttes med brukerens ord', async () => {
  const text = 'Husk å kjøpe melk, brød og egg i morgen';
  // Posisjoner + ordrett tekst (ny kontrakt).
  const a = T46.normalize46({ items: [{ start: 7, slutt: 39, tekst: 'kjøpe melk, brød og egg i morgen', frist: 'i morgen' }] }, text);
  assert.deepEqual(a.items.map((x) => x.n), ['Kjøpe melk, brød og egg']);
  // Feil posisjoner (vanlig for små modeller) → teksten finnes i originalen.
  const b = T46.normalize46({ items: [{ start: 0, slutt: 3, tekst: 'kjøpe melk' }] }, text);
  assert.deepEqual(b.items.map((x) => x.n), ['Kjøpe melk']);
  // Etterkontroll: «Köpa mjölk» / «Ring tannlege for Pål» finnes ikke i originalen → brukerens egne ord.
  const local = [{ n: 'Ringe tannlegen og bestille time til Pål' }];
  assert.deepEqual(T46.keepUserWords46('Ringe tannlegen og bestille time til Pål', [{ n: 'Ring tannlege og bestill time for Pål' }], local).map((x) => x.n), ['Ringe tannlegen og bestille time til Pål']);
  assert.deepEqual(T46.keepUserWords46(text, [{ n: 'Köpa mjölk, bröd och ägg' }], []).map((x) => x.n), ['Kjøpe melk, brød og egg'], 'svensk omskriving → originalteksten');
  assert.ok(!T46.inOriginal46('Köpa mjölk', text));
  // Hele jobben (Gjøremål → Glimt i bakgrunnen) med en modell som skriver om: titlene blir brukerens.
  tg41._ai41.impl = async () => ({ tasks: [{ title: 'Ring tannlege for Pål' }, { title: 'Vask bil' }], _engine: 'Ollama · test' });
  tg41._ai41.ms = 200;
  try {
    const r = await tg41.understand41(OLA, 'Ringe tannlegen og bestille time til Pål, og så vaske bilen i morgen', { today: TODAY });
    assert.equal(r.engine, 'glimt');
    assert.ok(r.items.every((x) => !/for Pål|^Vask bil$/.test(x.n)), JSON.stringify(r.items.map((x) => x.n)));
  } finally { tg41._ai41.impl = null; tg41._ai41.ms = null; }
  // Den nye prompten er på bokmål og ber om posisjoner, ikke omskriving.
  const p = T46.prompt46(text, { today: TODAY });
  assert.match(p, /IKKE skriv om teksten/);
  assert.ok(!/imperativ/i.test(p));
  // Motoren (Hjem): modellens omskrevne tittel brukes ikke.
  P._setGlimtModel45(async () => ({ data: { intent: 'create', module: 'tasks', calls: [{ tool: 'tasks.create', args: { title: 'Ring tannlege for Pål', due: 'i morgen' } }] }, model: 'mock' }));
  P._setToolMode45('json');
  try {
    const r = await agent(PR, 'Husk å ringe tannlegen for Pål i morgen');
    assert.equal(r.body.actions[0].args.title, 'Ringe tannlegen for Pål');
  } finally { P._setGlimtModel45(null); P._setToolMode45(null); }
});

/* ---------------- Chat: ingen nett når Nettsøk er av ---------------- */

test('Chat: Nettsøk av → ingen eget nettsøk, Open WebUI får web_search:false og tool_ids:[], Glimt sier fra', async () => {
  const body = gate.owuiBody('chat', { model: 'qwen3:8b', messages: [{ role: 'user', content: 'hei' }] });
  assert.deepEqual([body.features, body.tool_ids], [{ web_search: false }, []]);
  assert.deepEqual(gate.owuiBody('chat', { model: 'x', messages: [] }, { extra: { features: { web_search: true } } }).features, { web_search: true });
  let searches = 0;
  web._setWebFetch(async () => { searches++; throw new Error('nett'); });
  try {
    const r = await app.request('/api/chat/send', { method: 'POST', headers: { cookie: await login('per', 'perPassord123'), 'content-type': 'application/json' }, body: JSON.stringify({ model: 'qwen3:8b', webSearch: false, messages: [{ role: 'user', content: 'hvem er statsminister i England' }] }) });
    const txt = await r.text();
    assert.equal(r.status, 200, txt);
    assert.equal(searches, 0, 'ingen nettkall');
    const done = JSON.parse(/event: done\ndata: (.*)/.exec(txt)[1]);
    assert.deepEqual(done.tools, ['none']);
    assert.ok(!done.used.includes('Nettsøk'));
    assert.equal(done.webSearch, false);
    assert.equal(done.webSearchOff.action.label, 'Søk denne gangen');
    assert.match(txt, /event: websearch_off/);
  } finally { web._setWebFetch(null); }
  // Glimt-motoren: webSearch:false videre til de gamle svarene (ingen nettsøk der heller).
  const g = await agent(PR, 'hvem er statsminister i England', { webSearch: false });
  assert.equal(g.status, 200);
  assert.ok(!g.body.legacyAnswer?.web);
});

test('modellen glemmer et delspørsmål (bare Oslo) → etterkontrollen legger til New York', async () => {
  P._setGlimtModel45(async () => ({ toolCalls: [{ function: { name: 'weather.get', arguments: { place: 'Oslo', when: 'i dag' } } }], text: '', model: 'mock' }));
  P._setToolMode45('tools');
  try {
    const r = await agent(O, 'Hvordan er været i Oslo i dag og temperaturen i New York i morgen?');
    assert.equal(r.body.engine, 'ollama-tools');
    assert.deepEqual(r.body.actions.map((x) => [x.args.place, x.args.when.from]), [['Oslo', '2026-10-23'], ['New York', '2026-10-24']]);
  } finally { P._setGlimtModel45(null); P._setToolMode45(null); }
});
