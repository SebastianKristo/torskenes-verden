// Prompt 37 (SERVER37): profiler/onboarding, Gjøremål (felter, delte lister, Glimt), sporingsnøkler i husstanden, delte
// abonnementer, bibelvers (bare Sebastian), «hvor er X», skoleprøve ≠ prøveperiode, «i morgen?», fagfarger og brief.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p37-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-37s';
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
const { db, kv, OWNER } = await import('../server/db.js');
const assist = await import('../server/assist.js');
const glimt = await import('../server/tasks-glimt37.js');
const bible = await import('../server/bible37.js');
const kal = await import('../server/kal37.js');
const where = await import('../server/where37.js');
const { osloTodayISO } = await import('../public/js/quick-time.js');
const TODAY = osloTodayISO();
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = client({ cookie: await login('ingrid', 'ingridPassord123') });
const anon = client({});
const ingridId = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
const sebId = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();

/* ---------------- Bibelvers: data ---------------- */

test('bibelvers: ≥ 365 + 365 vers fra 1930-oversettelsen, nøyaktig ordlyd og henvisning', () => {
  assert.ok(bible.VERSES.morning.length >= 365 && bible.VERSES.evening.length >= 365, `${bible.VERSES.morning.length}/${bible.VERSES.evening.length}`);
  const all = [...bible.VERSES.morning, ...bible.VERSES.evening];
  assert.equal(new Set(all.map((v) => v.ref)).size, all.length, 'ingen vers to ganger');
  const by = (r) => all.find((v) => v.ref === r);
  assert.equal(by('Klagesangene 3,22–23').text, 'Herrens miskunnhet er det at det ikke er forbi med oss; for hans barmhjertighet har ennu ikke ende. Den er ny hver morgen, din trofasthet er stor.');
  assert.equal(by('Salme 4,9').text, 'I fred vil jeg både legge mig ned og sove inn; for du, Herre, lar mig bo for mig selv, i trygghet.');
  assert.equal(by('Matteus 11,28').text, 'Kom til mig, alle I som strever og har tungt å bære, og jeg vil gi eder hvile!');
  assert.equal(by('Salme 118,24').text, 'Dette er dagen som Herren har gjort; la oss fryde oss og glede oss på den!');
  assert.equal(by('Salme 42,12').short, 'Sal 42,12');
  assert.ok(by('Johannes 14,27') && by('1 Peter 5,7') && by('Filipperne 4,13') && by('Jesaja 41,10'));
  for (const v of all) assert.ok(v.text.length >= 20 && v.text.length <= 330 && /^\S/.test(v.text), v.ref);
  // Deterministisk: samme dag → samme vers.
  assert.deepEqual(bible.verseFor('2026-10-19', 'evening').ref, bible.verseFor('2026-10-19', 'evening').ref);
  assert.notEqual(bible.verseFor('2026-10-19', 'morning').ref, bible.verseFor('2026-10-20', 'morning').ref);
  assert.equal(bible.verseFor('2026-01-01', 'morning').ref, 'Klagesangene 3,22–23');
});

test('bibelvers: bare for sebastian, 403 for andre; today/next/settings, admin slår på per bruker', async () => {
  const t = await A('/api/bible/today?period=evening');
  assert.equal(t.status, 200, t.text);
  assert.deepEqual(Object.keys(t.body).filter((k) => ['enabled', 'ref', 'text', 'period', 'date', 'context', 'translation'].includes(k)).sort(), ['context', 'date', 'enabled', 'period', 'ref', 'text', 'translation']);
  assert.equal(t.body.enabled, true);
  assert.equal(t.body.translation, '1930');
  assert.equal(t.body.period, 'evening');
  assert.equal(t.body.kicker, 'KVELDSVERS · GLIMT');
  assert.ok(Array.isArray(t.body.context.before) && Array.isArray(t.body.context.after));
  const n = await A('/api/bible/next?offset=1&period=evening');
  assert.equal(n.body.date, addDays(TODAY, 1));
  const ig = await I('/api/bible/today');
  assert.equal(ig.status, 403);
  assert.equal(ig.body.enabled, false);
  assert.equal((await I('/api/bible/settings')).status, 403);
  assert.equal((await anon('/api/bible/today')).status, 401);
  const s = await A('/api/bible/settings', 'PUT', { evening: false, notify: true });
  assert.deepEqual([s.body.enabled, s.body.morning, s.body.evening, s.body.notify, s.body.translation], [true, true, false, true, '1930']);
  assert.equal((await A('/api/bible/settings', 'PUT', { translation: '2011' })).status, 400);
  await A('/api/bible/settings', 'PUT', { evening: true, notify: false });
  // Admin slår på for Ingrid, og av igjen.
  assert.equal((await I(`/api/bible/users/${ingridId}`, 'PUT', { allowed: true })).status, 403);
  assert.equal((await A(`/api/bible/users/${ingridId}`, 'PUT', { allowed: true })).body.enabled, true);
  assert.equal((await I('/api/bible/today')).status, 200);
  assert.equal((await A(`/api/bible/users/${ingridId}`, 'PUT', { allowed: false })).body.enabled, false);
  assert.equal((await I('/api/bible/today')).status, 403);
});

test('bibelvers: rekke, lest i dag, leseplan, lagrede vers og forklaring', async () => {
  const s0 = (await A('/api/bible/stats')).body;
  assert.equal(s0.readToday, false);
  assert.equal(s0.streak, 6, 'MOCK: de seks siste dagene er lest');
  assert.equal(s0.best, 12);
  assert.equal(s0.week.length, 7);
  assert.match(s0.hint, /Les dagens vers for å holde rekken på 7 dager/);
  assert.deepEqual([s0.plan.id, s0.plan.total, s0.plan.day, s0.plan.today.label], ['joh', 21, 8, 'Johannes 8']);
  const r = (await A('/api/bible/read', 'POST', { period: 'morning' })).body;
  assert.deepEqual([r.readToday, r.streak, r.hint], [true, 7, 'Bra! Kom tilbake i morgen.']);
  assert.ok(r.readDays.includes(TODAY));
  assert.equal((await A('/api/bible/read', 'POST', { date: '2020-01-01' })).status, 400);
  const p = (await A('/api/bible/plan', 'PUT', { plan: 'sal' })).body;
  assert.deepEqual([p.plan.id, p.plan.day, p.plan.today.label], ['sal', 1, 'Salme 1–5']);
  const d = (await A('/api/bible/plan/done', 'POST')).body;
  assert.deepEqual([d.plan.day, d.plan.doneToday], [2, true]);
  const today = (await A('/api/bible/today?period=morning')).body;
  assert.equal((await A('/api/bible/saved', 'POST', { ref: today.ref })).body.saved[0].ref, today.ref);
  assert.equal((await A('/api/bible/today?period=morning')).body.saved, true);
  assert.equal((await A(`/api/bible/saved?ref=${encodeURIComponent(today.ref)}`, 'DELETE')).body.saved.length, 0);
  const ex = (await A('/api/bible/explain', 'POST', { ref: 'Salme 4,9' })).body;
  assert.equal(ex.source, 'mal');
  assert.match(ex.text, /Salme 4,9/);
  assert.equal(bible.streakOf(['2026-10-17', '2026-10-18'], '2026-10-19'), 2, 'i dag teller ikke før lest, rekken vises fra i går');
  assert.equal(bible.streakOf(['2026-10-16', '2026-10-18'], '2026-10-19'), 1, 'en hel dag mangler bryter rekken');
});

/* ---------------- Profiler og onboarding ---------------- */

test('profiler: liste med forslag, koble (409 når koblet), ny profil, admin kobler og låser', async () => {
  const p = await I('/api/profiles');
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.me.profileId, null, 'ny bruker har ingen profil');
  const ing = p.body.profiles.find((x) => x.name === 'Ingrid');
  assert.ok(ing && ing.suggested && ing.userId === null, 'Glimt foreslår profilen med samme navn');
  const seb = p.body.profiles.find((x) => x.username === 'sebastian');
  assert.deepEqual([seb.linkedToOther, seb.linkedLabel], [true, 'Koblet til @sebastian']);
  for (const x of p.body.profiles) assert.deepEqual(Object.keys(x.has).sort(), ['lists', 'location', 'subs']);
  assert.equal((await I('/api/onboarding/link', 'POST', { profileId: seb.id })).status, 409);
  const l = await I('/api/onboarding/link', 'POST', { profileId: ing.id, consents: { location: true, lists: true, subs: true, calendars: true } });
  assert.equal(l.status, 200, l.text);
  assert.deepEqual([l.body.profile.name, l.body.profile.userId, l.body.consents.health, l.body.next.requestLocation], ['Ingrid', ingridId, false, true]);
  assert.equal((await I('/api/profiles')).body.me.profileId, ing.id);
  // Admin: koble fra, lås, og bare admin kan koble.
  assert.equal((await I('/api/profiles/settings', 'PUT', { adminOnlyLink: true })).status, 403);
  assert.equal((await A('/api/profiles/settings', 'PUT', { adminOnlyLink: true })).body.adminOnlyLink, true);
  assert.equal((await A(`/api/users/${ingridId}/profile`, 'PUT', { profileId: null })).body.profile, null);
  assert.equal((await I('/api/onboarding/link', 'POST', { profileId: ing.id })).status, 403);
  assert.equal((await I('/api/onboarding/link', 'POST', { newProfileName: 'Ny' })).status, 403);
  const al = await A(`/api/users/${ingridId}/profile`, 'PUT', { profileId: ing.id });
  assert.equal(al.body.profile.userId, ingridId);
  const p2 = (await I('/api/profiles')).body;
  assert.deepEqual([p2.locked, p2.adminLinked, p2.me.profileId], [true, true, ing.id]);
  assert.equal((await I('/api/onboarding/link', 'POST', { profileId: ing.id })).status, 200, 'bekreft koblingen admin har gjort');
  await A('/api/profiles/settings', 'PUT', { adminOnlyLink: false });
  assert.equal((await I(`/api/users/${sebId}/profile`, 'PUT', { profileId: null })).status, 403);
});

/* ---------------- Gjøremål ---------------- */

test('Gjøremål: «Mine» per bruker, felter fra detaljarket, gjentagelse lager neste, todo:changed-felt', async () => {
  const g = (await A('/api/tasks')).body;
  const mine = g.lists.find((l) => l.kind === 'mine');
  assert.ok(mine && mine.private && !mine.shared && mine.name === 'Mine');
  assert.deepEqual(mine.members.map((m) => m.role), ['owner']);
  assert.ok(mine.members[0].color && mine.members[0].userId === sebId && mine.ownerId === sebId);
  const r = await A('/api/tasks', 'POST', { n: 'Kanseller Overleaf', notes: 'https://overleaf.com', due: '2026-10-21', time: '09:00', urgent: true, rep: 'monthly', early: '1d', prio: 3, flag: true, tags: ['#Abo', 'jobb'], subs: [{ n: 'Logg inn' }, { n: 'Si opp', done: true }], place: 'work' });
  assert.equal(r.status, 201, r.text);
  const it = r.body.item;
  assert.equal(it.l, mine.id, 'standardlisten er «Mine»');
  assert.deepEqual([it.n, it.title, it.notes, it.time, it.urgent, it.rep, it.early, it.prio, it.flag, it.tags, it.subs, it.place, it.by, it.arch],
    ['Kanseller Overleaf', 'Kanseller Overleaf', 'https://overleaf.com', '09:00', true, 'monthly', '1d', 3, true, ['abo', 'jobb'], [{ n: 'Logg inn', done: false }, { n: 'Si opp', done: true }], 'work', sebId, false]);
  assert.equal((await A('/api/tasks', 'POST', { n: 'x', rep: 'sometimes' })).status, 400);
  assert.equal((await A('/api/tasks', 'POST', { n: 'x', time: '25:00' })).status, 400);
  const d = await A(`/api/tasks/${it.id}`, 'PATCH', { done: true });
  assert.equal(d.body.item.done, true);
  assert.equal(d.body.item.doneBy, sebId);
  assert.equal(d.body.next.due, '2026-11-21', 'neste forekomst hver måned');
  assert.deepEqual(d.body.next.subs.map((x) => x.done), [false, false]);
  const t2 = await A('/api/tasks', 'POST', { n: 'Bare tid', time: '18:30' });
  assert.equal(t2.body.item.due, TODAY, 'tid slår på dato');
  const s = await A('/api/tasks/settings');
  assert.equal(s.body.defaultList, mine.id);
});

test('Gjøremål: delte lister med medlemmer, forlat, privat liste vises aldri for andre', async () => {
  const c = await A('/api/tasks/lists', 'POST', { name: 'Starlink-hytta', color: '#3e6fa8', members: [ingridId] });
  assert.equal(c.status, 201, c.text);
  assert.deepEqual(c.body.list.members.map((m) => [m.userId, m.role]), [[sebId, 'owner'], [ingridId, 'member']]);
  assert.equal(c.body.list.shared, true);
  const mine = (await A('/api/tasks')).body.lists.find((l) => l.kind === 'mine');
  await A('/api/tasks', 'POST', { n: 'Hemmelig', l: mine.id });
  const il = (await I('/api/tasks')).body;
  assert.ok(il.lists.some((l) => l.id === c.body.list.id));
  assert.ok(!il.lists.some((l) => l.id === mine.id) && !il.items.some((x) => x.title === 'Hemmelig'));
  assert.ok(il.lists.some((l) => l.kind === 'mine' && l.ownerId === ingridId), 'Ingrid har sin egen «Mine»');
  assert.equal((await I('/api/tasks', 'POST', { n: 'Melk', l: c.body.list.id })).status, 201);
  assert.equal((await I(`/api/tasks/lists/${c.body.list.id}`, 'PATCH', { name: 'X' })).status, 403);
  const lv = await I(`/api/tasks/lists/${c.body.list.id}/leave`, 'POST');
  assert.equal(lv.status, 200);
  assert.ok(!(await I('/api/tasks')).body.lists.some((l) => l.id === c.body.list.id));
  assert.equal((await A(`/api/tasks/lists/${c.body.list.id}/leave`, 'POST')).status, 400, 'eieren kan ikke forlate');
  const p = await A(`/api/tasks/lists/${c.body.list.id}`, 'PATCH', { members: [ingridId] });
  assert.equal(p.body.list.members.length, 2);
  const del = await A(`/api/tasks/lists/${c.body.list.id}?deleteTasks=1`, 'DELETE');
  assert.equal(del.status, 200);
  assert.ok(del.body.deleted >= 1);
});

test('Glimt i Gjøremål: tolkning, handleliste, lim inn, angre', async () => {
  const p = glimt.parseTask37('Påminn meg å kansellere Overleaf 21.09 kl 9, viktig, hver måned', '2026-10-19');
  assert.deepEqual([p.title, p.due, p.time, p.urgent, p.rep], ['Kansellere Overleaf', '2027-09-21', '09:00', true, 'monthly']);
  const p2 = glimt.parseTask37('Ring rørlegger i morgen kl 14.30 #hus påminn meg 30 min før', '2026-10-19');
  assert.deepEqual([p2.title, p2.due, p2.time, p2.tags, p2.early], ['Ring rørlegger', '2026-10-20', '14:30', ['hus'], '30m']);
  const p3 = glimt.parseTask37('Bytt filter neste uke Ingrid', '2026-10-19', { people: [{ id: 'u-i', first: 'Ingrid' }] });
  assert.deepEqual([p3.title, p3.due, p3.who, p3.listHint], ['Bytt filter', '2026-10-26', 'u-i', 'hjem']);
  assert.deepEqual(glimt.shoppingItems('Kjøp melk, egg og kaffe'), ['Melk', 'Egg', 'Kaffe']);
  assert.deepEqual(glimt.pastedLines('- Melk\n• Egg\n1. Smør\n'), ['Melk', 'Egg', 'Smør']);

  const r = await A('/api/tasks/glimt', 'POST', { q: 'Påminn meg å kansellere Overleaf 21.09 kl 9, viktig, hver måned' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.kind, r.body.items.length, r.body.items[0].urgent, r.body.items[0].glimt], ['add', 1, true, true]);
  assert.ok(r.body.undo.token);
  const shop = await A('/api/tasks/glimt', 'POST', { q: 'Kjøp melk, egg og kaffe' });
  assert.deepEqual(shop.body.items.map((x) => x.title), ['Melk', 'Egg', 'Kaffe']);
  const handel = (await A('/api/tasks')).body.lists.find((l) => l.name === 'Handel');
  assert.ok(shop.body.items.every((x) => x.list === handel.id), 'i Handel');
  const u = await A('/api/tasks/glimt/undo', 'POST', { token: shop.body.undo.token });
  assert.deepEqual([u.body.ok, u.body.restored], [true, 3]);
  assert.ok(!(await A('/api/tasks')).body.items.some((x) => x.id === shop.body.items[0].id));
  assert.equal((await A('/api/tasks/glimt/undo', 'POST', { token: shop.body.undo.token })).status, 404);
  assert.equal((await I('/api/tasks/glimt/undo', 'POST', { token: r.body.undo.token })).status, 404, 'bare egen angring');
  const paste = await A('/api/tasks/glimt', 'POST', { q: '- Melk\n- Brød\n- Egg' });
  assert.deepEqual([paste.body.intent, paste.body.items.length, paste.body.items[0].list], ['tasks.paste', 3, handel.id]);
  const img = await A('/api/tasks/glimt', 'POST', { image: 'aGVp' });
  assert.equal(img.body.example, true);
  assert.ok(img.body.items.every((x) => x.tags.includes('handlelapp')));
});

test('Glimt i Gjøremål: spørsmål, slå sammen, forfalte, butikk, matplan, pakkeliste, del opp, sortere, kort og brief', async () => {
  const q1 = await A('/api/tasks/glimt', 'POST', { q: 'Hva er forfalt?' });
  assert.equal(q1.body.kind, 'question');
  assert.equal(q1.body.intent, 'tasks.overdue');
  const q2 = await A('/api/tasks/glimt', 'POST', { q: 'Hva har jeg igjen i dag?' });
  assert.equal(q2.body.intent, 'tasks.today');
  const handel = (await A('/api/tasks')).body.lists.find((l) => l.name === 'Handel');
  await A(`/api/tasks/lists/${handel.id}/members`, 'PUT', { userIds: [ingridId] });
  await I('/api/tasks', 'POST', { n: 'Kaffe', l: handel.id });
  const q3 = await A('/api/tasks/glimt', 'POST', { q: 'Hva har Ingrid lagt til i Handel?' });
  assert.match(q3.body.text, /^Ingrid har lagt til ett ting i Handel: Kaffe/);
  const k = (await A('/api/tasks', 'POST', { n: 'Kaffe', l: handel.id })).body.item;
  await A(`/api/tasks/${k.id}`, 'PATCH', { done: true });
  const q4 = await A('/api/tasks/glimt', 'POST', { q: 'Når kjøpte vi sist kaffe?' });
  assert.match(q4.body.text, /Kaffe ble sist krysset av i dag av Sebastian/);
  assert.equal((await A('/api/tasks/glimt', 'POST', { q: 'Hvorfor er himmelen blå?' })).body.text, 'Spør meg i Chat for mer.');
  // Like oppgaver
  await A('/api/tasks', 'POST', { n: 'Melk', l: handel.id, tags: ['a'] });
  await A('/api/tasks', 'POST', { n: 'melk', l: handel.id, tags: ['b'] });
  const cards = (await A(`/api/tasks/glimt/cards?list=${handel.id}`)).body.cards;
  const mc = cards.find((x) => x.kind === 'merge' && /Melk/i.test(x.text));
  assert.ok(mc, JSON.stringify(cards));
  assert.ok(cards.some((x) => x.kind === 'store'));
  const m = await A('/api/tasks/glimt', 'POST', { action: 'merge', list: handel.id });
  assert.ok(m.body.items.some((x) => x.title === 'Melk' && x.tags.includes('a') && x.tags.includes('b')));
  assert.equal((await A('/api/tasks')).body.items.filter((x) => !x.done && x.list === handel.id && /^melk$/i.test(x.title)).length, 1);
  assert.ok((await A('/api/tasks/glimt/undo', 'POST', { token: m.body.undo.token })).body.restored >= 2);
  // Forfalte
  await A('/api/tasks', 'POST', { n: 'Forfalt 1', due: addDays(TODAY, -3) });
  await A('/api/tasks', 'POST', { n: 'Forfalt 2', due: addDays(TODAY, -2) });
  const oc = (await A('/api/tasks/glimt/cards')).body.cards.find((x) => x.kind === 'overdue');
  assert.ok(oc.count >= 2 && /gjøremål er forfalt$/.test(oc.text));
  const mv = await A('/api/tasks/glimt', 'POST', { q: 'Flytt forfalte til i morgen' });
  assert.ok(mv.body.items.every((x) => x.due === addDays(TODAY, 1)));
  assert.ok((await A('/api/tasks/glimt/undo', 'POST', { token: mv.body.undo.token })).body.restored >= 2);
  // Butikk
  const st = await A('/api/tasks/glimt', 'POST', { action: 'store', list: handel.id });
  assert.equal(st.body.intent, 'tasks.store');
  assert.ok(st.body.items.every((x) => x.place === 'store'));
  assert.match(st.body.notification.title, /butikken/);
  // Matplan
  const mp = await A('/api/tasks/glimt', 'POST', { q: 'Legg ukas matplan i handlelisten' });
  assert.equal(mp.body.intent, 'tasks.matplan');
  assert.match(mp.body.text, /^(La til|Det er ingen retter)/);
  if (mp.body.items.length) assert.ok(mp.body.items.every((x) => x.tags.includes('matplan')));
  const mp2 = await A('/api/tasks/glimt', 'POST', { action: 'matplan' });
  if (mp.body.items.length) assert.equal(mp2.body.skipped >= mp.body.items.length, true, 'åpne varer hoppes over');
  // Pakkeliste (ingen hyttetur i kalenderen: mal for hytte)
  const pk = await A('/api/tasks/glimt', 'POST', { q: 'Lag pakkeliste til hytta' });
  assert.equal(pk.body.intent, 'tasks.packlist');
  assert.ok(pk.body.items.length >= 6);
  // Del opp og sortere
  const t = (await A('/api/tasks', 'POST', { n: 'Bytt filter i ventilasjonen' })).body.item;
  const sp = await A(`/api/tasks/${t.id}/split`, 'POST', { apply: true });
  assert.deepEqual([sp.body.source, sp.body.subs.length >= 3, sp.body.item.subs.length >= 3], ['mal', true, true]);
  const t2 = (await A('/api/tasks', 'POST', { n: 'Kjøp ved til hytta' })).body.item;
  const sg = await A(`/api/tasks/${t2.id}/suggest`, 'POST');
  assert.ok(sg.body.text.startsWith('✦ Glimt foreslår:'), sg.text);
  // Brief
  const b = (await A('/api/tasks/brief')).body;
  assert.ok(b.count >= 1 && b.items.length <= 3 && /^Du har/.test(b.text));
  assert.equal((await A('/api/tasks/glimt/cards/dismiss', 'POST', { key: oc.key })).body.ok, true);
  assert.ok(!(await A('/api/tasks/glimt/cards')).body.cards.some((x) => x.key === oc.key));
});

/* ---------------- Sporing: delte nøkler ---------------- */

test('sporing: nøkler deles i husstanden, maskert, bare admin endrer; kvote per bruker', async () => {
  const r = await A('/api/tracking/keys/parcelsapp', 'PUT', { key: 'pa-secret-key-a91f' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.provider.set, r.body.provider.tail, r.body.provider.masked], [true, 'a91f', '••••a91f']);
  assert.equal((await I('/api/tracking/keys/parcelsapp', 'PUT', { key: 'x' })).status, 403);
  const k = await I('/api/tracking/keys');
  assert.equal(k.status, 200);
  assert.ok(!k.text.includes('pa-secret-key'), 'aldri i klartekst');
  const pa = k.body.providers.find((p) => p.id === 'parcelsapp');
  assert.deepEqual([pa.set, pa.tail, pa.status, pa.addedBy.name, pa.addedByText], [true, 'a91f', 'ok', 'Sebastian', 'Delt i husstanden · lagt inn av Sebastian']);
  assert.deepEqual(Object.keys(k.body.quota).filter((x) => ['used', 'mine', 'limit', 'perUserPct'].includes(x)).sort(), ['limit', 'mine', 'perUserPct', 'used']);
  assert.equal(k.body.quota.perUserPct, 50);
  assert.equal(k.body.admin, false);
  const { householdValue, quotaBlock37 } = await import('../server/tracking37.js');
  assert.equal(householdValue('trk_parcelsapp_key'), 'pa-secret-key-a91f');
  const { runAsUser } = await import('../server/settings.js');
  const C = await import('../server/tracking-carriers.js');
  assert.equal(runAsUser(ingridId, () => C.parcelsappUsage().configured), true, 'Ingrid kan spore uten egen nøkkel');
  kv.set(ingridId, 'parcelsapp_usage', { month: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }).slice(0, 7), used: 1 });
  assert.match(runAsUser(ingridId, () => quotaBlock37(3)), /din del av husstandens kvote/);
  assert.equal(runAsUser(sebId, () => quotaBlock37(3)), null);
  kv.del(ingridId, 'parcelsapp_usage');
  // Pakker er private.
  const p = await I('/api/tracking', 'POST', { trackingNo: 'CP555666777NO', name: 'Ingrids pakke' });
  assert.ok([200, 201].includes(p.status), p.text);
  assert.ok(!(await A('/api/tracking')).text.includes('Ingrids pakke'));
  assert.equal((await A('/api/tracking/keys/parcelsapp', 'DELETE')).body.provider.set, false);
});

/* ---------------- Abonnementer ---------------- */

test('abonnementer: delt Starlink, din del i totaler, medlem ser og kan forlate, bare eier/betaler endrer', async () => {
  const s = (await A('/finans/api/subscriptions', 'POST', { name: 'Starlink', price: 1200, cycle: 'monthly', billDay: 5 })).body;
  const before = (await I('/finans/api/subscriptions')).body.monthly;
  const m = await A(`/finans/api/subscriptions/${s.id}/members`, 'PUT', { members: [ingridId], split: 'equal' });
  assert.equal(m.status, 200, m.text);
  assert.deepEqual([m.body.shared, m.body.split, m.body.myShare, m.body.members.length, m.body.shareLabel], [true, 'equal', 600, 2, 'Delt · din del 600 kr/mnd']);
  const il = (await I('/finans/api/subscriptions')).body;
  const row = il.items.find((x) => x.id === s.id);
  assert.ok(row && !row.mine && !row.canEdit && row.myShare === 600);
  assert.equal(Math.round((il.monthly - before) * 100) / 100, 600, 'Ingrids total bruker hennes del');
  assert.equal((await I(`/finans/api/subscriptions/${s.id}`, 'PATCH', { price: 1 })).status, 404);
  assert.equal((await I(`/finans/api/subscriptions/${s.id}/members`, 'PUT', { members: [] })).status, 403);
  const pay = await A(`/finans/api/subscriptions/${s.id}/members`, 'PUT', { split: 'payer', payerId: ingridId });
  assert.equal(pay.body.myShare, 0);
  assert.equal((await I('/finans/api/subscriptions')).body.items.find((x) => x.id === s.id).myShare, 1200);
  assert.equal((await I(`/finans/api/subscriptions/${s.id}`, 'PATCH', { price: 1300 })).status, 200, 'betaleren kan endre pris');
  assert.equal((await I(`/finans/api/subscriptions/${s.id}/leave`, 'POST')).body.ok, true);
  assert.ok(!(await I('/finans/api/subscriptions')).body.items.some((x) => x.id === s.id));
  const tr = await A('/finans/api/subscriptions/trials', 'POST', { service: 'Viaplay', endsAt: addDays(TODAY, 5), priceAfter: 149 });
  assert.equal(tr.status, 201);
  const all = (await A('/finans/api/subscriptions')).body;
  assert.deepEqual([all.trialsSummary.count >= 1, all.trialsSummary.label], [true, `+${Math.round(all.trials.reduce((a, t) => a + (t.priceAfter ?? 0), 0))} kr/mnd hvis du beholder`]);
  const kept = await A(`/finans/api/subscriptions/trials/${tr.body.id}`, 'PATCH', { status: 'cancelled' });
  assert.equal(kept.body.res, 'avsluttet');
});

/* ---------------- Hvor er X ---------------- */

test('«hvor er Ingrid»: posisjon med sone/sted, personvern, ukjent navn, hvor er jeg', async () => {
  assert.deepEqual(where.whereIntent('Hvor er Ingrid?'), { kind: 'where', name: 'Ingrid', zone: null });
  assert.equal(where.whereIntent('kor er Pål')?.name, 'Pål');
  assert.equal(where.whereIntent('hvor befinner Kari seg')?.name, 'Kari');
  assert.equal(where.whereIntent('er Pål på skolen?')?.zone, 'på skolen');
  assert.equal(where.whereIntent('posisjonen til Ingrid')?.name, 'Ingrid');
  assert.equal(where.whereIntent('where is Ingrid')?.name, 'Ingrid');
  assert.equal(where.whereIntent('hvor er jeg')?.kind, 'self');
  assert.equal(where.whereIntent('hvor er pakkene mine?'), null);
  assert.equal(assist.detectIntent('Hvor er Ingrid?', TODAY), 'family.where');
  assert.equal(assist.detectIntent('hvor er pakkene mine?', TODAY), 'packages');
  // Den ekte brukeren Ingrid deler ikke (standard av).
  const off = await A('/api/assist', 'POST', { q: 'hvor er Ingrid?' });
  assert.equal(off.body.intent, 'family.where');
  assert.equal(off.body.text, '**Ingrid** deler ikke posisjon med deg.');
  assert.deepEqual(off.body.open, { route: 'familie', person: ingridId });
  // Jonas (mock) deler: sted, avstand, alder og batteri.
  const j = await A('/api/assist', 'POST', { q: 'Hvor er Jonas?' });
  assert.match(j.body.text, /^\*\*Jonas\*\* er \*\*.+\*\*.*Oppdatert .* · batteri 22 %\.$/);
  assert.equal(j.body.source, 'Familie · posisjon');
  assert.ok(j.body.place && j.body.place.battery === 22 && j.body.person.name === 'Jonas');
  assert.deepEqual(j.body.open, { route: 'familie', person: 'mock-jonas' });
  const mm = await A('/api/assist', 'POST', { q: 'hvor er Mormor' });
  assert.equal(mm.body.text, '**Mormor** deler ikke posisjon med deg.');
  const nf = await A('/api/assist', 'POST', { q: 'hvor er Gunnar?' });
  assert.match(nf.body.text, /^Jeg finner ikke Gunnar i Familie\. Personer med deling: .*Jonas/);
  const me = await A('/api/assist', 'POST', { q: 'hvor er jeg' });
  assert.equal(me.body.intent, 'family.where');
});

/* ---------------- Kalender ---------------- */

test('kalender: skoleprøve ≠ prøveperiode, «i morgen?», fagfarger, kind trial, adresse + kart', async () => {
  const pi = kal.parseIntent37('Neste prøve på skolen');
  assert.deepEqual(pi, { trial: false, schoolTest: true, schoolContext: true });
  assert.equal(kal.parseIntent37('Når slutter Viaplay-prøveperioden?').trial, true);
  assert.equal(assist.detectIntent('Neste prøve på skolen', TODAY), 'calendar.school');
  assert.equal(assist.detectIntent('neste prøve på universitetet?', TODAY), 'calendar.school');
  assert.equal(assist.detectIntent('Storytel prøve til 25.11', TODAY), 'trial.create');
  assert.equal(assist.detectIntent('i morgen?', TODAY), 'calendar.day');
  assert.equal(kal.fagKey('MEK1300 Forelesning'), 'MEK1300');
  assert.equal(kal.fagKey('Forelesning TRE 1400'), 'TRE1400');
  assert.equal(kal.fagKey('Frist: Fysikk labrapport'), 'Fysikk');
  assert.equal(kal.fagKey('Prøve · Matematikk'), 'Matematikk');
  // Faste farger: nye fag får neste ledige farge, og det samme faget beholder sin.
  const c1 = kal.subjectColor(sebId, 'MEK1300'), c2 = kal.subjectColor(sebId, 'ELI1300'), c3 = kal.subjectColor(sebId, 'MEK1300');
  assert.notEqual(c1.c, c2.c);
  assert.equal(c1.c, c3.c);
  // Appenes overstyring i layout.subjectColors.
  assert.equal((await A('/api/me/layout', 'PUT', { subjectColors: { MEK1300: '#c2477a' } })).status, 200);
  assert.equal(kal.subjectColor(sebId, 'MEK1300').c, '#c2477a');
  const sj = await A('/api/kalender/subjects');
  assert.ok(sj.body.subjects.some((x) => x.key === 'MEK1300' && x.color === '#c2477a' && x.own) && sj.body.palette.length === 8);
  const tr = await A('/finans/api/subscriptions/trials', 'POST', { service: 'Viaplay', endsAt: addDays(TODAY, 3), priceAfter: 149 });
  assert.equal(tr.status, 201);
  const { eventsFor } = await import('../server/calendar.js');
  const { runAsUser } = await import('../server/settings.js');
  const { events } = await runAsUser(sebId, () => eventsFor(sebId, TODAY, addDays(TODAY, 60)));
  const te = events.find((e) => e.source === 'trials');
  assert.equal(te.kind, 'trial');
  assert.ok(!te.subjectColor);
  const ans = kal.schoolTestAnswer(events, TODAY);
  assert.ok(!/Viaplay/.test(ans.text) && !ans.events.some((e) => e.kind === 'trial'), ans.text);
  const study = events.filter((e) => e.subjectKey);
  for (const e of study) assert.match(e.subjectColor, /^#[0-9a-f]{6}$/i);
  const a = await A('/api/assist', 'POST', { q: 'Neste prøve på skolen' });
  assert.equal(a.body.intent, 'calendar.school');
  assert.ok(!/Viaplay/.test(a.body.text) && !/skol\b/.test(a.body.text), a.body.text);
  assert.ok(/^(Neste prøve på skolen er|Jeg finner ingen prøver)/.test(a.body.text), a.body.text);
  const k = await A('/api/assist', 'POST', { q: 'Neste prøve på skolen?', source: 'calendar' });
  assert.ok(!/Viaplay/.test(k.body.text), k.body.text);
  const tm = await A('/api/assist', 'POST', { q: 'i morgen?', source: 'calendar' });
  assert.equal(tm.body.intent, 'calendar.summary');
  assert.match(tm.body.text, /^I morgen /);
  // Glimt legger til med sted → adresse og kart.
  assert.equal(kal.addressIn('Time hos Frisør Nina, Thorvald Meyers gate 40, 0555 Oslo'), 'Thorvald Meyers gate 40, 0555 Oslo');
  const cr = await A('/api/assist', 'POST', { q: 'Frisør hos Frisør Nina fredag kl 14', source: 'calendar' });
  if (cr.body.created) {
    const ev = cr.body.created.event;
    assert.equal(ev.address, 'Thorvald Meyers gate 40, 0555 Oslo', JSON.stringify(ev));
    assert.deepEqual([typeof ev.map.lat, typeof ev.map.lon, /^https:/.test(ev.map.url)], ['number', 'number', true]);
    const again = (await runAsUser(sebId, () => eventsFor(sebId, ev.date, ev.date))).events.find((e) => e.id === ev.id);
    assert.equal(again.address, ev.address, 'adressen følger hendelsen');
  }
  const g = await A('/api/kalender/geo?q=Hoffsveien 4');
  assert.deepEqual([g.body.found, g.body.label], [true, 'Hoffsveien 4, Sofienlund']);
});

/* ---------------- Brief ---------------- */

test('brief: Gjøremål-kort, bibelvers for Sebastian (ikke Ingrid), Vær åpner Vær, profilnavnet i hilsenen', async () => {
  const b = await A('/api/brief?kind=evening');
  assert.equal(b.status, 200, b.text);
  assert.ok(b.body.todos && typeof b.body.todos.count === 'number' && Array.isArray(b.body.todos.items) && b.body.todos.items.length <= 3);
  assert.ok(b.body.bible && b.body.bible.period === 'evening' && b.body.bible.translation === '1930' && b.body.bible.ref);
  assert.equal(b.body.bible.placement, 'bottom', 'lest i dag (testen over) → nederst');
  if (b.body.weather) assert.deepEqual(b.body.weather.open, { route: 'vaer', overlay: true });
  assert.equal(b.body.showKicker, false);
  const day = await A('/api/brief?kind=day');
  assert.ok(day.body.bible?.placement === 'bottom');
  const ib = await I('/api/brief?kind=morning');
  assert.equal(ib.body.bible, null);
  assert.match(ib.body.greeting, /^God morgen, Ingrid\./);
});

test('assist: «gjøremål»/«to-do» går til Gjøremål', () => {
  assert.equal(assist.navTarget('gjøremål')?.label, 'Gjøremål');
  assert.equal(assist.navTarget('todo')?.target, 'huskeliste');
});
