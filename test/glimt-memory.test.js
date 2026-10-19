// Prompt 33 (GLIMT-MEMORY): bedre rask time fra SMS (signatur → bedrift, støylinjer, type) og «Glimt husker» (alias per bruker):
// læring via Glimt, bruk i rask time og «neste frisørtime», apply som bare gir nytt navn til egne avtaler, per bruker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p33-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-33';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1'; // lokale hendelser i Privat uten Google
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const quick = await import('../server/calendar-quick.js');
const assist = await import('../server/assist.js');
const mem = await import('../server/glimt-memory.js');
const { OWNER } = await import('../server/db.js');
const { parseQuick, senderOf, niceCase, memoryMatch, osloTodayISO } = await import('../public/js/quick-time.js');
assist._setDirectMs(15000);
test.after(() => assist._setDirectMs(null));

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = JSON.parse(await r.text()); } catch { /* */ }
  return { status: r.status, body: json };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
assert.equal((await A('/api/users', 'POST', { username: 'ola', password: 'olaPassord1234', role: 'bruker', name: 'Ola' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const O = client({ cookie: await login('ola', 'olaPassord1234') });
const tokR = (await A('/finans/api/tokens', 'POST', { name: 'iPhone', scopes: ['finance:read'] })).body.token;
const tokW = (await A('/finans/api/tokens', 'POST', { name: 'Pixel', scopes: ['finance:read', 'finance:write'] })).body.token;
const TR = client({ authorization: `Bearer ${tokR}` });
const TW = client({ authorization: `Bearer ${tokW}` });

const SMS = 'NB! NY ADRESSE: HOFFSVEIEN 4, SKØYEN. Velkommen til oss torsdag 10.12.2026 kl. 14:45. Unngå gebyr og avbestill 24 timer før på tlf 22 49 01 73 Denne sms kan ikke besvares. Mvh PÅHÅRET Studio Hoff';
const TODAY = '2026-10-19';
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const today = osloTodayISO();
const pick = (o, ...k) => Object.fromEntries(k.map((x) => [x, o[x]]));
const jobOf = async (C, id) => (await C('/api/kalender/quick/jobs')).body.find((x) => x.id === id);
const eventsIn = async (C, from, to = from) => (await C(`/api/kalender?from=${from}&to=${to}`)).body.events;
const quickAdd = async (C, text) => { const r = await C('/api/kalender/quick', 'POST', { text }); assert.equal(r.status, 202, JSON.stringify(r.body)); await quick._drain(); return jobOf(C, r.body.jobId); };
const ask = async (C, q, extra = {}) => { const r = await C('/api/assist', 'POST', { q, ...extra }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

/* ---------------- 1. Rask time fra SMS ---------------- */

test('den eksakte SMS-en: tittel «Frisør · Påhåret Studio Hoff», sted fra NY ADRESSE', () => {
  const r = parseQuick(SMS, TODAY);
  assert.deepEqual(pick(r, 'ok', 'title', 'type', 'date', 'start', 'end', 'place', 'business', 'isAppointment'),
    { ok: true, title: 'Frisør · Påhåret Studio Hoff', type: 'frisør', date: '2026-12-10', start: '14:45', end: '15:30', place: 'Hoffsveien 4, Skøyen', business: 'Påhåret Studio Hoff', isAppointment: true });
  assert.ok(r.confidence >= 0.9);
  assert.doesNotMatch(r.title, /NB|ADRESSE|gebyr|22 49/i);
});

test('lignende SMS-er: legekontor, tannlege, Hår1, Cutters, uten type', () => {
  const P = (t) => pick(parseQuick(t, TODAY), 'title', 'type', 'date', 'start', 'place');
  assert.deepEqual(P('Påminnelse om time tirsdag 3.11 kl 08:15. Ta med legitimasjon. Avbestilling senest 24 t før, ellers gebyr. Hilsen Majorstuen Legekontor'),
    { title: 'Majorstuen Legekontor', type: 'lege', date: '2026-11-03', start: '08:15', place: null });
  assert.deepEqual(P('Viktig: Du har time 12.11 kl 10:00. Husk å avbestille innen 24 timer. Ring 22 33 44 55. Med vennlig hilsen Tannhelse Sør'),
    { title: 'Tannlege · Tannhelse Sør', type: 'tannlege', date: '2026-11-12', start: '10:00', place: null });
  assert.deepEqual(P('Hei! Velkommen til oss mandag 2. november kl. 17:30.\nAdresse: Bogstadveien 12\nAvbestill på nett.\n– HÅR1 MAJORSTUEN'),
    { title: 'Frisør · Hår1 Majorstuen', type: 'frisør', date: '2026-11-02', start: '17:30', place: 'Bogstadveien 12' });
  assert.deepEqual(P('Påminnelse fra Cutters Storo: Din time er fredag 23.10 kl 12:00. Oppmøte: Storo Storsenter. Denne meldingen kan ikke besvares.'),
    { title: 'Frisør · Cutters Storo', type: 'frisør', date: '2026-10-23', start: '12:00', place: 'Storo Storsenter' });
  assert.deepEqual(P('NB! Ny tid: onsdag 28.10 kl 09:00. Sted: Kirkeveien 64. Mvh Bislett Fysioterapi'),
    { title: 'Bislett Fysioterapi', type: 'fysio', date: '2026-10-28', start: '09:00', place: 'Kirkeveien 64' });
  // Uten type: bare bedriftsnavnet. Uten bedrift: den gamle regelen (og aldri NB!-linjen).
  assert.equal(parseQuick('Velkommen til Studio Nova fredag 23.10 kl 12:00. Mvh Studio Nova', TODAY).title, 'Studio Nova');
  assert.equal(parseQuick('NB! Husk avtale fredag 23.10 kl 12:00', TODAY).title, 'Avtale');
  assert.equal(parseQuick('time hos Nina frisør 14.30 25.09', TODAY).title, 'Nina frisør');
  assert.equal(parseQuick('lege fredag kl 9. Sted: Legesenteret Bislett. Hilsen', TODAY).title, 'Lege'); // tom signatur
  assert.equal(senderOf('Middag med Per fredag kl 18'), null);
  assert.equal(niceCase('PÅHÅRET Studio Hoff AS'), 'Påhåret Studio Hoff AS');
});

test('parseQuick med minnet: alias vinner (type + tittel, høy sikkerhet)', () => {
  const m = [{ id: 7, kind: 'alias', match: 'studio nova', type: 'frisør', title: null }];
  const r = parseQuick('Velkommen til Studio Nova fredag 23.10 kl 12:00. Mvh Studio Nova', TODAY, m);
  assert.deepEqual(pick(r, 'title', 'type', 'end'), { title: 'Frisør · Studio Nova', type: 'frisør', end: '12:45' });
  assert.ok(r.confidence >= 0.9);
  assert.deepEqual(r.memory, { id: 7, match: 'studio nova', type: 'frisør' });
  assert.equal(memoryMatch('novastudio 12.11', m), null); // hele ord
  assert.equal(parseQuick('PÅHÅRET 12.11 kl 10', TODAY, [{ kind: 'alias', match: 'påhåret', type: 'frisør', title: 'Frisør · Påhåret' }]).title, 'Frisør · Påhåret');
});

test('Ollama-prompten: tittel = type + bedrift, aldri NB!, og brukerens alias', async () => {
  const p = quick.PROMPT(SMS, TODAY, [{ kind: 'alias', match: 'påhåret', type: 'frisør', title: 'Frisør · Påhåret' }]);
  assert.match(p, /Frisør · Påhåret Studio Hoff/);
  assert.match(p, /ALDRI.*"NB!"/);
  assert.match(p, /«påhåret» = frisør/);
  assert.doesNotMatch(quick.PROMPT(SMS, TODAY), /Brukeren har lært/);
  // Ollama som svarer med overskriften: den lokale tittelen brukes.
  quick._setQuickOllama(async () => ({ tittel: 'NB! NY ADRESSE: HOFFSVEIEN', dato: '2026-12-10', start: '14:45', sted: null, type: 'annet', sikkerhet: 0.9 }));
  const j = await quickAdd(A, SMS);
  quick._setQuickOllama(null);
  assert.equal(j.engine, 'ollama');
  assert.equal(j.result.title, 'Frisør · Påhåret Studio Hoff');
  assert.equal(j.result.place, 'Hoffsveien 4, Skøyen');
  await A(`/api/kalender/quick/${j.id}/undo`, 'POST', {});
});

/* ---------------- 2. Glimt husker ---------------- */

test('API: GET/POST/DELETE per bruker, validering og token-scopes', async () => {
  assert.deepEqual((await A('/api/glimt/memory')).body.items, []);
  assert.equal((await A('/api/glimt/memory', 'POST', { match: 'x' })).status, 400);
  assert.equal((await A('/api/glimt/memory', 'POST', { match: 'Cutters', type: 'bilverksted' })).status, 400);
  const r = await A('/api/glimt/memory', 'POST', { match: 'Cutters', type: 'frisør' });
  assert.equal(r.status, 201);
  assert.deepEqual(pick(r.body.item, 'kind', 'match', 'type', 'title'), { kind: 'alias', match: 'cutters', type: 'frisør', title: 'Frisør · Cutters' });
  assert.equal(r.body.matches, 0);
  const again = await A('/api/glimt/memory', 'POST', { match: 'CUTTERS', type: 'frisør', title: 'Frisør · Cutters' });
  assert.equal(again.status, 200); // samme match oppdateres
  assert.equal(again.body.item.id, r.body.item.id);
  assert.equal((await A('/api/glimt/memory')).body.items.length, 1);
  // Kari ser ikke Sebastians minne og kan ikke slette/bruke det
  assert.deepEqual((await K('/api/glimt/memory')).body.items, []);
  assert.equal((await K(`/api/glimt/memory/${r.body.item.id}`, 'DELETE')).status, 404);
  assert.equal((await K(`/api/glimt/memory/${r.body.item.id}/apply`, 'POST', {})).status, 404);
  // Token: lese med finance:read, skrive krever finance:write
  assert.equal((await TR('/api/glimt/memory')).body.items.length, 1);
  assert.equal((await TR('/api/glimt/memory', 'POST', { match: 'Hår1', type: 'frisør' })).status, 401);
  assert.equal((await TW('/api/glimt/memory', 'POST', { match: 'Hår1', type: 'frisør' })).status, 201);
  assert.equal((await client({})('/api/glimt/memory')).status, 401);
  for (const it of (await A('/api/glimt/memory')).body.items) assert.equal((await A(`/api/glimt/memory/${it.id}`, 'DELETE')).status, 200);
  assert.equal((await A('/api/glimt/memory/abc', 'DELETE')).status, 400);
});

test('lært via Glimt («det var frisør») → neste raske time bruker det', async () => {
  const j1 = await quickAdd(A, 'Velkommen til Studio Nova fredag 23.10.2026 kl 12:00. Mvh Studio Nova');
  assert.equal(j1.result.title, 'Studio Nova');
  const a = await ask(A, 'det var frisør');
  assert.equal(a.intent, 'memory.add');
  assert.match(a.text, /^Ok, jeg husker at \*\*Studio Nova\*\* er frisøren din\./);
  assert.match(a.text, /endrer tittelen på \*\*1 avtale\*\*/);
  assert.deepEqual(pick(a.memory, 'match', 'type', 'title'), { match: 'studio nova', type: 'frisør', title: 'Frisør · Studio Nova' });
  assert.equal(a.apply.count, 1);
  // Neste raske time
  const j2 = await quickAdd(A, 'Studio Nova: ny time 30.10.2026 kl 10:00');
  assert.equal(j2.result.title, 'Frisør · Studio Nova');
  assert.equal(j2.result.end, '10:45');
  const pv = await A('/api/kalender/quick/parse', 'POST', { text: 'studio nova 6.11 kl 9', today: TODAY });
  assert.equal(pv.body.title, 'Frisør · Studio Nova');
  assert.equal(pv.body.type, 'frisør');
  // Kari har ikke lært det
  assert.equal((await K('/api/kalender/quick/parse', 'POST', { text: 'studio nova 6.11 kl 9', today: TODAY })).body.title, 'Studio nova');
  // used_at settes når minnet brukes
  assert.ok((await A('/api/glimt/memory')).body.items.find((m) => m.match === 'studio nova').used_at);
});

test('«husk at Påhåret er frisøren min» etter SMS-en: fullt navn i svaret; Ollama-reserven får aliasene lokalt', async () => {
  await quickAdd(A, SMS);
  const a = await ask(A, 'husk at Påhåret er frisøren min');
  assert.equal(a.intent, 'memory.add');
  assert.match(a.text, /^Ok, jeg husker at \*\*Påhåret Studio Hoff\*\* er frisøren din\./);
  assert.equal(a.memory.match, 'påhåret');
  assert.equal(a.memory.title, 'Frisør · Påhåret Studio Hoff');
  // «Påhåret er frisøren» uten kontekst for Ola: bare navnet
  const o = await ask(O, 'Påhåret er frisøren');
  assert.match(o.text, /^Ok, jeg husker at \*\*Påhåret\*\* er frisøren din\.$/);
  // Uten navn og uten kontekst: spør
  assert.match((await ask(K, 'dette er for frisøren')).text, /Hvilken avtale/);
  // LLM-reserven: lokal Ollama får aliasene, sky aldri
  const seen = [];
  assist._setAssistLlm(async ({ engine, system }) => { seen.push({ engine, system }); return 'Hei.'; });
  await ask(A, 'fortell en vits');
  assist._setAssistLlm(null);
  assert.equal(seen[0].engine, 'ollama');
  assert.match(seen[0].system, /«påhåret» = frisør/);
  assert.equal(assist.localSystem('kari').includes('påhåret'), false);
});

test('kontekst fra hendelsen som vises (GET /events/:id og context:{eventId})', async () => {
  const d = addDays(today, 5);
  const ev = (await A('/api/kalender/events', 'POST', { title: 'Klinikk Lysaker', date: d, start: '09:00', end: '09:30', allDay: false, note: 'Hilsen Lysaker Fysikalske' })).body.event;
  assert.ok(ev?.id);
  assert.equal((await K(`/api/kalender/events/${encodeURIComponent(ev.id)}`)).status, 404); // andres
  const g = await A(`/api/kalender/events/${encodeURIComponent(ev.id)}`);
  assert.equal(g.status, 200);
  assert.equal(g.body.event.title, 'Klinikk Lysaker');
  assert.equal(mem.getContext(OWNER)?.eventId, ev.id);
  const a = await ask(A, 'det var fysio');
  assert.match(a.text, /\*\*Lysaker Fysikalske\*\* er fysioterapeuten din/);
  // context:{eventId} i assist
  const ev2 = (await A('/api/kalender/events', 'POST', { title: 'Synsenteret', date: d, start: '11:00', allDay: false })).body.event;
  const b = await ask(A, 'dette er for optikeren', { context: { eventId: ev2.id } });
  assert.match(b.text, /\*\*Synsenteret\*\* er optikeren din/);
});

test('calendar.next finner Påhåret som frisør', async () => {
  const d = addDays(today, 3);
  const ev = (await O('/api/kalender/events', 'POST', { title: 'Påhåret', date: d, start: '15:00', end: '15:45', allDay: false })).body.event;
  assert.ok(ev?.id);
  // Ola har allerede lært «påhåret» = frisør (testen over). Uten aliaset ville det ikke vært funnet:
  const before = await ask(K, 'når er neste frisørtime');
  assert.match(before.text, /^Fant ingen/);
  const n = await ask(O, 'når er neste frisørtime');
  assert.equal(n.intent, 'calendar.next');
  assert.match(n.text, /^Påhåret er \*\*/);
  assert.equal(n.card.items[0].id, ev.id);
  // også når navnet bare står i notatet
  const ev3 = (await K('/api/kalender/events', 'POST', { title: 'Klipp', date: d, start: '10:00', allDay: false, note: 'Mvh Kutt & Krøll' })).body.event;
  assert.ok(ev3);
  assert.equal((await K('/api/glimt/memory', 'POST', { match: 'Kutt & Krøll', type: 'frisør' })).status, 201);
  assert.match((await ask(K, 'når skal jeg til frisøren?')).text, /^Klipp er/);
});

test('apply gir nytt navn bare til egne avtaler i Privat', async () => {
  const d = addDays(today, 10);
  const mine = (await A('/api/kalender/events', 'POST', { title: 'Time Hår1', date: d, start: '12:00', allDay: false })).body.event;
  const fam = (await A('/api/kalender/events', 'POST', { title: 'Hår1 med barna', date: d, start: '13:00', allDay: false, calendar: 'familie' })).body.event;
  const karis = (await K('/api/kalender/events', 'POST', { title: 'Hår1', date: d, start: '12:00', allDay: false })).body.event;
  assert.ok(mine && fam && karis);
  const r = await A('/api/glimt/memory', 'POST', { match: 'Hår1', type: 'frisør', title: 'Frisør · Hår1' });
  assert.equal(r.body.matches, 1);
  const dry = await A(`/api/glimt/memory/${r.body.item.id}/apply`, 'POST', { dryRun: true });
  assert.equal(dry.body.count, 1);
  assert.equal((await eventsIn(A, d)).find((e) => e.id === mine.id).title, 'Time Hår1'); // dryRun endrer ingenting
  const ap = await A(`/api/glimt/memory/${r.body.item.id}/apply`, 'POST', {});
  assert.equal(ap.status, 200);
  assert.equal(ap.body.count, 1);
  assert.deepEqual(ap.body.events.map((e) => [e.from, e.title]), [['Time Hår1', 'Frisør · Hår1']]);
  const evs = await eventsIn(A, d);
  assert.equal(evs.find((e) => String(e.id).startsWith(mine.id.split('~')[0])).title, 'Frisør · Hår1');
  assert.equal(evs.find((e) => String(e.id).startsWith(fam.id.split('~')[0])).title, 'Hår1 med barna'); // Familie røres ikke
  assert.equal((await eventsIn(K, d)).find((e) => e.id === karis.id).title, 'Hår1'); // Karis røres ikke
  assert.equal((await A(`/api/glimt/memory/${r.body.item.id}/apply`, 'POST', {})).body.count, 0); // allerede riktig
});

test('brukeren endrer tittelen på en rask time selv → forslag om alias (lagres ikke)', async () => {
  const j = await quickAdd(A, 'Velkommen til Salong Zara 4.12.2026 kl 13:00. Mvh Salong Zara');
  assert.equal(j.result.title, 'Frisør · Salong Zara');
  const before = (await A('/api/glimt/memory')).body.items.length;
  const p = await A(`/api/kalender/events/${encodeURIComponent(j.result.eventId)}`, 'PATCH', { title: 'Frisør · Zara' });
  assert.equal(p.status, 200);
  assert.deepEqual(pick(p.body.suggestMemory, 'match', 'name', 'type', 'title'), { match: 'salong zara', name: 'Salong Zara', type: 'frisør', title: 'Frisør · Zara' });
  assert.equal((await A('/api/glimt/memory')).body.items.length, before);
  // Vanlige hendelser (ikke rask time) gir ikke forslag
  const ev = (await A('/api/kalender/events', 'POST', { title: 'Middag', date: addDays(today, 2), start: '18:00', allDay: false })).body.event;
  assert.equal((await A(`/api/kalender/events/${encodeURIComponent(ev.id)}`, 'PATCH', { title: 'Middag med Per' })).body.suggestMemory, undefined);
});
