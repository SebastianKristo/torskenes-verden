// Prompt 70 (GLIMTCAL70): Glimt spør ikke «Hvilken kalender?» – avtalen legges i standardkalenderen og bekreftes med kort A
// (claude-code-glimt-kalender-ikke-spor.md). Fast «i dag»: mandag 26. oktober 2026. Film og stedssøk er mocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p70c-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-70c';
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
const C46 = await import('../server/glimt45/calendar46.js');
const C70 = await import('../server/glimt45/cal70.js');

const TODAY = '2026-10-26';
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
for (const [u, name] of [['ola', 'Ola'], ['kari', 'Kari']]) assert.equal((await A('/api/users', 'POST', { username: u, password: `${u}Passord123`, role: 'bruker', name })).status, 200);
const O = as(await login('ola', 'olaPassord123'));
const K = as(await login('kari', 'kariPassord123'));
const idOf = (u) => db.prepare('SELECT id FROM users WHERE username=?').pluck().get(u);
const OLA = idOf('ola');
let rid = 0;
const RID = () => `t70-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
const agent = (who, text, extra = {}) => who('/api/glimt/agent', 'POST', { text, module: 'home', requestId: RID(), ...extra });
const localEvents = (u) => kv.get(u, 'kal_local_events', []) ?? [];

C46._setPlace46(async (name) => (/colosseum/i.test(name) ? { address: 'Fridtjof Nansens vei 6, 0369 Oslo', label: 'Fridtjof Nansens vei 6, Majorstuen', lat: 59.9296, lon: 10.7116 } : null));
C46._setMovie46(async (t) => (/^dune$/i.test(t) ? { title: 'Dune: Part Two', year: 2024, runtime: 166, poster: null } : null));

const EX = 'legg til i kalender at jeg og pappa skal se på dune på colosseum kino 17 desember kl 17:30';

const TL = await import('../server/glimt45/tools.js');

test('«i kalender at …» er ikke en kalender som heter «at»; navn etter «kalenderen» må ha stor forbokstav', () => {
  assert.equal(C46.calendarMention46(EX), null);
  assert.equal(C46.calendarMention46('legg til i kalenderen at vi skal på kino'), null);
  assert.equal(C46.calendarMention46('legg til tannlege i familiekalenderen fredag'), 'familie');
  assert.equal(C46.calendarMention46('legg inn i kalenderen Trening fredag kl 18'), 'Trening');
  assert.equal(C46.calendarMention46('legg til i jobbkalenderen møte fredag'), 'jobb');
  const sp = C46.splitTitlePlace46('at jeg og pappa skal se på dune på colosseum kino');
  assert.deepEqual([sp.title, sp.location, sp.with], ['Kino: Dune', 'Colosseum Kino', ['pappa']]);
  assert.equal(TL.typeTitle70('Dune – Kino'), 'Kino: Dune');
  assert.equal(TL.typeTitle70('Kino – Dune'), 'Kino: Dune');
  assert.equal(TL.typeTitle70('Tannlege'), 'Tannlege');
});

let made = null;
test('eksempelsetningen → lagt inn i standardkalenderen tor 17. des 17:30–20:15, kort A, ingen spørsmål', async () => {
  const r = await agent(O, EX);
  assert.equal(r.status, 200, r.text);
  assert.ok(!r.body.ask && !r.body.choices, 'ingen spørsmål/valg');
  assert.ok(!/Hvilken/.test(r.body.reply), r.body.reply);
  const a = r.body.actions[0];
  assert.equal(a.status, 'done', r.text);
  assert.deepEqual([a.args.title, a.args.date, a.args.start, a.args.end, a.args.location, a.result.calendar.id], ['Kino: Dune', '2026-12-17', '17:30', '20:15', 'Colosseum Kino', 'personlig']);
  const c = a.result.card70;
  assert.ok(c, 'card70');
  assert.deepEqual([c.title, c.day.mon, c.day.n, c.day.wd, c.line, c.withText, c.calendar.id, c.reminder.label], ['Kino: Dune', 'DES', 17, 'tor', '17:30–20:15 · Colosseum Kino', 'Med pappa', 'personlig', 'Varsel 1 t før']);
  assert.equal(c.calendars[0].id, 'familie', 'Familie foreslått øverst (pappa)');
  assert.equal(c.calendars[0].suggested, true);
  assert.ok(c.calendars.find((x) => x.id === 'personlig').selected);
  assert.equal(c.undo.ttlMs, 10000);
  assert.match(c.move.url, /^\/api\/glimt\/agent\/calendar70\//);
  const saved = localEvents(OLA).find((x) => x.title === 'Kino: Dune');
  assert.deepEqual([saved.date, saved.start, saved.end, saved.calendar], ['2026-12-17', '17:30', '20:15', 'privat']);
  made = c;
  // /api/assist (eldre klienter) får samme kort i created.card70.
  const as = await O('/api/assist', 'POST', { q: 'legg til i kalender at jeg og mamma skal på konsert 18 desember kl 19' });
  if (as.status === 200 && as.body?.created) assert.ok(as.body.created.card70?.eventId, as.text);
});

test('bytt kalender i kortet (PATCH calendarId) → avtalen flytter seg; Angre fjerner den; andre brukere kommer ikke til', async () => {
  assert.ok(made);
  assert.equal((await K(made.move.url, 'PATCH', { calendarId: 'familie' })).status, 404, 'Kari kan ikke flytte Olas avtale');
  const mv = await O(made.move.url, 'PATCH', { calendarId: 'familie' });
  assert.equal(mv.status, 200, mv.text);
  assert.equal(mv.body.card70.calendar.id, 'familie');
  const now = localEvents(OLA).filter((x) => x.title === 'Kino: Dune');
  assert.equal(now.length, 1, 'ikke duplikat');
  assert.equal(now[0].calendar, 'familie');
  const back = await O(mv.body.card70.move.url, 'PATCH', { calendarId: 'personlig' });
  assert.equal(back.status, 200, back.text);
  assert.equal(localEvents(OLA).find((x) => x.title === 'Kino: Dune').calendar, 'privat');
  assert.equal((await O(back.body.card70.move.url, 'PATCH', { calendarId: 'helligdager' })).status, 400, 'skrivebeskyttet');
  assert.equal((await K(back.body.card70.undo.url, 'POST', {})).status, 404);
  const u = await O(back.body.card70.undo.url, 'POST', {});
  assert.equal(u.status, 200, u.text);
  assert.ok(!localEvents(OLA).some((x) => x.title === 'Kino: Dune'));
  assert.equal((await O(back.body.card70.undo.url, 'POST', {})).status, 404, 'allerede angret');
});

test('nevnt kalender: familiekalenderen → Familie uten spørsmål; skrivebeskyttet/ukjent → ett kort spørsmål med knapper', async () => {
  const f = await agent(O, 'legg til middag i familiekalenderen fredag kl 18');
  assert.equal(f.body.actions[0].status, 'done', f.text);
  assert.equal(f.body.actions[0].result.calendar.id, 'familie');
  assert.equal(f.body.actions[0].result.card70.calendar.id, 'familie');
  const ro = await agent(O, 'legg til lunsj i helligdager-kalenderen fredag 12');
  assert.equal(ro.body.reply, 'Helligdager er skrivebeskyttet. Legg i Personlig?');
  assert.deepEqual([ro.body.ask.type, ro.body.ask.field, ro.body.ask.options.map((o) => o.id)], ['ask', 'calendar', ['personlig', 'cancel']]);
  const unk = await agent(O, 'legg til lunsj i hagekalenderen fredag 12');
  assert.ok(!/Hvilken kalender/.test(unk.body.reply), unk.body.reply);
  assert.equal(unk.body.ask.type, 'ask');
  assert.equal(unk.body.reply, 'Fant ingen kalender som heter «Hage». Legg i Personlig?');
  assert.equal(unk.body.ask.options[0].id, 'personlig');
});

test('mangler dato → «Hvilken dag?» med I dag · I morgen · Velg dato (strukturert, ikke fritekst)', async () => {
  const r = await agent(O, 'legg til tannlege');
  assert.equal(r.body.intent, 'ask', r.text);
  assert.equal(r.body.ask.type, 'ask');
  assert.equal(r.body.ask.field, 'date');
  assert.deepEqual(r.body.ask.options.map((o) => o.label), ['I dag', 'I morgen', 'Velg dato']);
  assert.equal(r.body.ask.options[0].value, TODAY);
});

test('dagknappene sender meldingen med dagen («… i morgen»), og Velg dato har {dato} som klienten fyller inn', async () => {
  const r = await agent(O, 'legg til frisør kl 14');
  const o = r.body.ask.options;
  assert.equal(o[1].text, 'legg til frisør kl 14 i morgen');
  assert.equal(o[2].text, 'legg til frisør kl 14 {dato}');
  const ok = await agent(O, o[1].text);
  assert.equal(ok.body.actions[0].status, 'done', ok.text);
  assert.equal(ok.body.actions[0].args.date, '2026-10-27');
  const picked = await agent(O, o[2].text.replace('{dato}', '17.12.2026'));
  assert.equal(picked.body.actions[0].args.date, '2026-12-17', picked.text);
});

test('Kalender-appen (C): samme motor (module calendar) → samme kort, ingen tekstspørsmål', async () => {
  const r = await agent(K, 'legg til at jeg og pappa skal se på dune på colosseum kino 17 desember kl 17:30', { module: 'calendar' });
  assert.equal(r.body.actions[0].status, 'done', r.text);
  assert.ok(!r.body.ask);
  assert.equal(r.body.actions[0].result.card70.title, 'Kino: Dune');
  assert.equal(r.body.actions[0].result.card70.withText, 'Med pappa');
});

test('svar på kalenderspørsmålet: samme melding + context.calendarId → lagt inn der', async () => {
  const ro = await agent(O, 'legg til lunsj i helligdager-kalenderen torsdag 12');
  assert.equal(ro.body.ask.text, 'legg til lunsj i helligdager-kalenderen torsdag 12');
  const ok = await agent(O, ro.body.ask.text, { context: { calendarId: ro.body.ask.options[0].id } });
  assert.equal(ok.body.actions[0].status, 'done', ok.text);
  assert.equal(ok.body.actions[0].result.calendar.id, 'personlig');
});
