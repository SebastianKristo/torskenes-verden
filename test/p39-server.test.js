// Prompt 39 (SERVER39): fire kalendere (opprydding 12 → 4 + angre, helligdager, nye felt, Google-velgeren), Glimt følger opp og
// forklarer fag, Glimt anbefaler modeller, Glimt-varsel (n_ai_in, ikon, draape), briefGlimt, Gjøremål uten pakkeliste for bursdager,
// ukas vær, Domener + Search Console, ikonene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p39-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-39s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
for (const k of Object.keys(process.env)) if (k.startsWith('AI_HOST_') || k.startsWith('AI_GPU_')) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv } = await import('../server/db.js');
const k39 = await import('../server/kal39.js');
const fag = await import('../server/glimt39-fag.js');
const k33 = await import('../server/kalender33.js');
const tg = await import('../server/tasks-glimt37.js');
const w39 = await import('../server/weather39.js');
const { osloTodayISO } = await import('../public/js/quick-time.js');
const TODAY = osloTodayISO();
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

let ipN = 30;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${ipN++}` }, body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (cookie) => (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });
const A = as(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await login('ingrid', 'ingridPassord123'));
const ingridId = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
const sebId = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();

/* ---------------- Kalendere ---------------- */

test('kalendere: standard bare fire (Personlig · Bursdager · Skole · Helligdager) med kilde, merke og nye felt', async () => {
  const r = await A('/api/kalender/calendars');
  assert.equal(r.status, 200, r.text);
  const four = r.body.calendars.slice(0, 4);
  assert.deepEqual(four.map((c) => [c.id, c.key, c.color, c.source, c.badge]), [
    ['personlig', 'p', '#b23a2a', 'google', 'GOOGLE'], ['bursdager', 'b', '#8a3fa0', 'google', 'GOOGLE'], ['skole', 's', '#2f7a4f', 'url', 'URL'], ['helligdager', 'h', '#a39d90', 'builtin', 'INNEBYGD']]);
  assert.equal(r.body.calendars.length, 4);
  const [p, b, s, h] = four;
  assert.equal(p.sourceLabel, 'Ikke koblet');
  assert.deepEqual([p.notify, b.notify, h.notify], [true, true, false]);
  assert.equal(b.notifyLabel, 'kl. 09:00 samme dag');
  assert.equal(p.showInBrief, true);
  assert.equal(p.relinkOnly, true);
  assert.match(s.sourceLabel, / · hver time$/);
  assert.equal(s.interval, '1h');
  assert.ok(Array.isArray(s.subjectColors));
  assert.deepEqual([h.sourceLabel, h.country], ['Norge', 'NO']);
  assert.equal(typeof p.count, 'number');
  assert.equal(r.body.migration.done, true);
  assert.deepEqual([r.body.migration.from, r.body.migration.to], [6, 4]);
  assert.ok(Date.parse(r.body.migration.undoUntil) > Date.now());
  // PATCH med de nye feltene.
  assert.equal((await A('/api/kalender/calendars/helligdager', 'PATCH', { notify: true, showInBrief: false })).body.calendar.notify, true);
  assert.equal((await A('/api/kalender/calendars/helligdager', 'PATCH', { country: 'SE' })).status, 400);
  assert.equal((await A('/api/kalender/calendars/personlig', 'PATCH', { url: 'https://x.no/a.ics' })).status, 400);
  const sk = await A('/api/kalender/calendars/skole', 'PATCH', { url: 'webcal://tp.uio.no/ical?id=abc', interval: '6h', name: 'Skole UiO', subjectColors: { FYS1000: '#2b5d8a' } });
  assert.equal(sk.status, 200, sk.text);
  assert.equal(sk.body.calendar.name, 'Skole UiO');
  assert.equal(sk.body.calendar.interval, '6h');
  assert.equal(sk.body.calendar.url, 'https://tp.uio.no/ical?id=abc');
  assert.equal(sk.body.calendar.sourceLabel, 'tp.uio.no · hver 6. time');
  assert.equal(sk.body.calendar.subjectColors.find((x) => x.key === 'FYS1000').color, '#2b5d8a');
  assert.ok(!(await A('/api/kalender/calendars')).body.calendars.some((c) => c.kind === 'ical'), 'skolens iCal er kilden til Skole, ikke en egen rad');
  assert.equal((await A('/api/kalender/calendars/skole/refresh', 'POST')).status, 200);
  assert.equal((await A('/api/kalender/calendars/skole', 'PATCH', { interval: '2h' })).status, 400);
  const pv = await A('/api/kalender/calendars/url/preview', 'POST', { url: 'webcal://tp.uio.no/ical' });
  assert.deepEqual([pv.body.ok, typeof pv.body.count, Array.isArray(pv.body.subjects)], [true, 'number', true]);
  // Gamle id-er godtas: Jobb → Personlig.
  const ev = await A('/api/kalender/events', 'POST', { title: 'Møte med Kari', allDay: false, date: addDays(TODAY, 2), start: '10:00', end: '11:00', appCalendar: 'jobb' });
  assert.equal(ev.status, 201, ev.text);
  assert.equal(ev.body.event.appCalendar, 'personlig');
  assert.equal(ev.body.event.appKind, 'jobb');
});

test('helligdager: innebygd Norge (bevegelige beregnet), heldag i Helligdager', async () => {
  assert.equal(k39.easter(2026), '2026-04-05');
  assert.equal(k39.easter(2027), '2027-03-28');
  const h26 = k39.holidaysNO(2026);
  assert.equal(h26.length, 12);
  assert.deepEqual(h26.find((x) => x.name === 'Kristi himmelfartsdag').date, '2026-05-14');
  const r = await A('/api/kalender?from=2026-12-20&to=2026-12-31');
  const hol = (r.body.events ?? []).filter((e) => e.appCalendar === 'helligdager');
  assert.deepEqual(hol.map((e) => [e.date, e.title, e.allDay, e.type]), [['2026-12-25', 'Første juledag', true, 'helligdag'], ['2026-12-26', 'Andre juledag', true, 'helligdag']]);
});

test('opprydding 12 → 4: egne duplikater og gamle id-er flyttes (ingenting slettes), kan angres og kjøres på nytt', async () => {
  kv.set(ingridId, 'kal33_cals', { builtin: {}, custom: [{ id: 'c-0123456789', name: 'Studie 40', color: '#123456' }, { id: 'c-abcdefabcd', name: 'Korps', color: '#654321' }, { id: 'c-1111111111', name: 'Personlig', color: '#111111' }], prefs: { defaultCalendar: 'helse' } });
  kv.set(ingridId, 'kal33_evcal', { 'loc-a': 'jobb', 'loc-b': 'c-0123456789', 'loc-c': 'c-abcdefabcd', 'loc-d': 'helse', 'loc-e': 'c-1111111111' });
  const r = await I('/api/kalender/calendars');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.calendars.map((c) => c.id), ['personlig', 'bursdager', 'skole', 'helligdager', 'c-abcdefabcd']);
  const m = r.body.migration;
  assert.deepEqual([m.done, m.from, m.to, m.moved], [true, 9, 5, 4]);
  assert.deepEqual(m.merged.map((x) => [x.name, x.into]), [['Studie 40', 'skole'], ['Personlig', 'personlig']]);
  assert.equal(r.body.defaultCalendar, 'personlig');
  assert.deepEqual(kv.get(ingridId, 'kal33_evcal', {}), { 'loc-a': 'personlig', 'loc-b': 'skole', 'loc-c': 'c-abcdefabcd', 'loc-d': 'personlig', 'loc-e': 'personlig' });
  assert.equal(kv.get(ingridId, 'kal33_cals', {}).custom.length, 3, 'de egne kalenderne slettes ikke');
  assert.ok((kv.get(ingridId, 'kal39_log', []) ?? []).some((l) => /9 → 5/.test(l.text)));
  // Angre: tilbake til de seks fra før med hendelsene der de var.
  const u = await I('/api/kalender/calendars/migration/undo', 'POST');
  assert.equal(u.status, 200, u.text);
  assert.deepEqual([u.body.ok, u.body.migration.undone, u.body.restored], [true, true, 4]);
  assert.deepEqual(u.body.calendars.slice(0, 6).map((c) => c.id), ['personlig', 'jobb', 'studie', 'familie', 'helse', 'bursdager']);
  assert.ok(u.body.calendars.some((c) => c.id === 'c-0123456789'));
  assert.equal(kv.get(ingridId, 'kal33_evcal', {})['loc-a'], 'jobb');
  assert.equal((await I('/api/kalender/calendars')).body.migration.undone, true, 'kjører ikke automatisk igjen');
  assert.equal((await I('/api/kalender/calendars/migration/undo', 'POST')).status, 409);
  const again = await I('/api/kalender/calendars/migration', 'POST');
  assert.equal(again.body.migration.done, true);
  assert.equal(again.body.calendars.length, 5);
});

test('Google-velgeren «Hvilken kalender er hva?»: GET/PUT /api/kalender/google/mapping med forslag, forhåndsvisning og synk-jobb', async () => {
  let r = await A('/api/kalender/google/mapping');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.connected, false);
  assert.equal((await A('/api/kalender/google/mapping', 'PUT', { map: {} })).status, 409);
  r = await A('/api/birthdays/google/start', 'POST', { return: '/innstillinger' });
  r = await A(r.body.url);
  let loc = r.headers.get('location');
  if (!loc.startsWith('/api/birthdays/google/callback')) loc = new URL(loc, 'http://x').pathname + new URL(loc, 'http://x').search;
  assert.equal((await A(loc)).status, 302);
  r = await A('/api/kalender/google/mapping');
  assert.equal(r.body.connected, true, r.text);
  const prim = r.body.calendars.find((x) => x.primary), fam = r.body.calendars.find((x) => !x.primary);
  assert.deepEqual([prim.access, prim.role, prim.suggested], ['primær · eier', 'p', 'p']);
  assert.equal(fam.role, 'p');
  assert.deepEqual(r.body.preview.map((p) => p.id), ['personlig', 'bursdager', 'skole', 'helligdager']);
  assert.match(r.body.preview[0].summary, /slått sammen/);
  assert.deepEqual(r.body.holidays, { country: 'NO', name: 'Norge' });
  assert.match(r.body.note, /primær Google-kalender/);
  assert.equal((await A('/api/kalender/google/mapping', 'PUT', { map: { [prim.googleId]: 'x' } })).status, 400);
  assert.equal((await A('/api/kalender/google/mapping', 'PUT', { map: { [prim.googleId]: null, [fam.googleId]: null } })).status, 400, 'Personlig må ha en kalender');
  const put = await A('/api/kalender/google/mapping', 'PUT', { map: { [fam.googleId]: null } });
  assert.equal(put.status, 200, put.text);
  assert.ok(put.body.job.id);
  assert.equal(put.body.calendars.find((x) => x.googleId === fam.googleId).role, null);
  for (let i = 0; i < 50; i++) { const j = await A(`/api/kalender/google/mapping/jobs/${put.body.job.id}`); if (j.body.state !== 'running') { assert.equal(j.body.state, 'done', j.text); assert.equal(j.body.pct, 100); break; } await new Promise((res) => setTimeout(res, 20)); }
  const cals = (await A('/api/kalender/calendars')).body.calendars;
  assert.equal(cals.find((c) => c.id === 'personlig').sourceLabel, 'sebastian@gmail.com');
  assert.equal(cals.length, 4, 'ingen Google-rader i lista');
  const put2 = await A('/api/kalender/google/mapping', 'PUT', { map: { [fam.googleId]: 'p' } });
  assert.equal(put2.status, 200);
  assert.ok(!(await A('/api/kalender/calendars')).body.calendars.some((c) => c.kind === 'google'), 'Familie er slått inn i Personlig');
});

/* ---------------- Glimt: oppfølging og fag ---------------- */

test('Glimt følger opp: «hva slags timer har jeg i dag» → fagene, «hva slags fag er det» → faget + forklaring, ukjent tittel, «hva er fysikk»', async () => {
  const at = (hm) => new Date(`${TODAY}T${hm}:00+02:00`).toISOString();
  const evs = [{ id: 'l1', title: 'Fysikk 1', date: TODAY, start: at('08:15'), end: at('10:00'), type: 'time', calendar: 'timeplan', allDay: false },
    { id: 'l2', title: 'Matematikk R2', date: TODAY, start: at('10:15'), end: at('12:00'), type: 'time', calendar: 'timeplan', allDay: false }];
  const load = async () => evs;
  fag._forgetCtx();
  const a = await fag.fagAnswer('u1', 'hva slags timer har jeg i dag', { today: TODAY, load });
  assert.equal(a.kind, 'lessons');
  assert.equal(a.text, 'I dag har du fysikk kl. 08.15 og matematikk kl. 10.15.');
  fag.rememberCtx('u1', 'hva slags timer har jeg i dag', [evs[0]]);
  const b = await fag.fagAnswer('u1', 'hva slags fag er det', { today: TODAY, load });
  assert.match(b.text, /^Det er \*\*fysikk\*\* kl\. 08\.15\. Fysikk er naturvitenskapen om materie, energi, bevegelse og krefter/);
  assert.equal(b.followUp, true);
  fag.rememberCtx('u1', 'x', evs);
  assert.match((await fag.fagAnswer('u1', 'Hva slags fag er det?', { today: TODAY, load })).text, /^I dag har du fysikk kl\. 08\.15 og matematikk kl\. 10\.15\. Fysikk er/);
  fag.rememberCtx('u1', 'x', [{ ...evs[0], title: 'test' }]);
  assert.equal((await fag.fagAnswer('u1', 'hva slags fag er det', { today: TODAY, load })).text, 'Jeg vet ikke hvilket fag «test» er. Gi hendelsen et fagnavn, så kan jeg forklare.');
  const d = await fag.fagAnswer('u2', 'hva er fysikk', { today: TODAY, load: async () => [{ ...evs[0], date: addDays(TODAY, 1), start: new Date(`${addDays(TODAY, 1)}T08:15:00+02:00`).toISOString(), end: new Date(`${addDays(TODAY, 1)}T10:00:00+02:00`).toISOString() }] });
  assert.match(d.text, /^Fysikk er naturvitenskapen .* Neste gang du har det er i morgen kl\. 08\.15\.$/);
  assert.equal(await fag.fagAnswer('u2', 'hva er klokka', { today: TODAY, load }), null);
  // Uten ctx i Homelab-søket: ingen kapring av «hva er det».
  assert.equal(await fag.fagAnswer('u3', 'hva er det', { today: TODAY, load, followNeedsCtx: true }), null);
  // Hele veien gjennom Kalender-Glimt (POST /api/assist source:'calendar').
  const r = await A('/api/assist', 'POST', { q: 'hva lærer man i kjemi', source: 'calendar' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.intent, 'calendar.fag');
  assert.match(r.body.text, /^Kjemi er læren om stoffene/);
  assert.deepEqual(r.body.subjects.map((x) => x.name), ['kjemi']);
  // Ingen generisk hjelpetekst på oppfølging: forrige svar huskes (10 min).
  const s = await A('/api/assist', 'POST', { q: 'hva skjer i morgen', source: 'calendar' });
  assert.equal(s.status, 200);
  const f = await A('/api/assist', 'POST', { q: 'fortell mer', source: 'calendar' });
  assert.equal(f.status, 200);
  assert.doesNotMatch(f.body.text, /Jeg kan svare på ting som/);
});

/* ---------------- AI: Glimt anbefaler modeller ---------------- */

test('AI: GET /api/ai/recommend (Mac mini M4 16 GB), ask, plan, apply + angre', async () => {
  const r = await A('/api/ai/recommend');
  assert.equal(r.status, 200, r.text);
  assert.ok(Array.isArray(r.body));
  const by = Object.fromEntries(r.body.map((x) => [x.task, x]));
  assert.equal(by.rc.model, 'qwen2.5vl:7b');
  assert.equal(by.kat.model, 'llama3.2:3b');
  assert.equal(by.kb.model, 'nomic-embed-text');
  assert.ok(r.body.every((x) => ['PASSER', 'TRANGT'].includes(x.fit)), 'ingen FOR STOR');
  for (const k of ['task', 'model', 'why', 'alt', 'fit', 'installed', 'inUse', 'sizeGb', 'pullCmd']) assert.ok(k in by.rc, k);
  assert.equal(by.rc.installed, true);
  assert.equal(by.kat.installed, false);
  assert.equal(by.kat.pullCmd, 'ollama pull llama3.2:3b');
  const full = await A('/api/ai/recommend?full=1');
  assert.equal(full.body.title, '✦ GLIMT ANBEFALER · Mac mini M4 · 16 GB');
  assert.ok(full.body.missing.some((m) => m.model === 'llama3.2:3b'));
  const q = await A('/api/ai/recommend/ask', 'POST', { q: 'lese kvitteringer' });
  assert.match(q.body.text, /^Til kvitteringer anbefaler jeg qwen2\.5vl:7b \(6 GB, passer\)\. .*Alternativ: /);
  assert.deepEqual(q.body.tasks, ['rc']);
  const unk = await A('/api/ai/recommend/ask', 'POST', { q: 'blablabla' });
  assert.match(unk.body.text, /allrounder/);
  assert.equal((await A('/api/ai/recommend/ask', 'POST', {})).status, 400);
  const plan = await A('/api/ai/recommend/plan');
  assert.match(plan.body.text, /^(Fyller ut \d+ oppgaver? med beste installerte modell|✓ Ferdig)/);
  assert.equal((await I('/api/ai/recommend/apply', 'POST', {})).status, 403);
  const ap = await A('/api/ai/recommend/apply', 'POST', {});
  assert.equal(ap.status, 200, ap.text);
  assert.ok(ap.body.changed.length >= 1);
  assert.match(ap.body.text, /^✦ Glimt fylte ut \d+ valg$/);
  const rt = await A('/api/ai/routing');
  assert.equal(rt.body.tasks.find((t) => t.id === 'rc').model, 'qwen2.5vl:7b');
  assert.equal((await A('/api/ai/recommend/plan')).body.done, true);
  const un = await A('/api/ai/recommend/apply/undo', 'POST', { token: ap.body.undo.token });
  assert.deepEqual([un.body.ok, un.body.restored], [true, ap.body.changed.length]);
});

/* ---------------- Varsler, brief, ikoner ---------------- */

test('Glimt-varsel: n_ai_in (standard på), draape standardlyd, Glimt-ikon på AI-varsler, ikonfilene serveres', async () => {
  const n = await A('/api/me/notify');
  assert.deepEqual([n.body.n_ai_in, n.body.sound, n.body.volume], [true, 'draape', 50]);
  assert.equal(n.body.sounds[0].id, 'draape');
  assert.equal(n.body.glimtIcon.icon, '/assets/glimt-varsel.png');
  assert.equal((await A('/api/me/notify', 'PUT', { n_ai_in: false })).body.n_ai_in, false);
  assert.equal((await A('/api/me/notify', 'PUT', { n_ai_in: 'nei' })).status, 400);
  assert.equal((await A('/api/assist/settings')).body.n_ai_in, false);
  const { notifyUser } = await import('../server/notify.js');
  await notifyUser(sebId, { title: 'Homelab · AI', body: 'Svaret er klart', category: 'ai', data: { kind: 'assist' } });
  const p = (await A('/api/notify/pending')).body.items.at(-1);
  assert.deepEqual([p.title, p.icon, p.badge, p.data.inApp, p.data.channel], ['Glimt', '/assets/glimt-varsel.png', '/assets/glimt-badge.png', false, 'glimt_ai']);
  for (const f of ['/assets/glimt-varsel.png', '/assets/glimt-badge.png', '/assets/glimt-varsel-rund.png', '/assets/sounds/draape.wav', '/assets/icons/app-icon-192.png', '/assets/icons/app-icon-180.png']) assert.equal((await req(f)).status, 200, f);
  assert.ok(existsSync('public/icons/app-icon-maskable-512.png'));
  assert.equal((await A('/api/app')).body.icons.includes('hus-gammel'), true);
  assert.equal((await A('/api/me/layout', 'PUT', { vs_cmp_layout: { order: ['hero', 'glimt', 'list'], hidden: [] } })).status, 200);
});

test('briefGlimt i /api/glimt/settings (standard på) og i /api/brief (ingen figur/guide når av)', async () => {
  assert.equal((await A('/api/glimt/settings')).body.briefGlimt, true);
  assert.equal((await A('/api/glimt/settings', 'PUT', { briefGlimt: 'ja' })).status, 400);
  assert.equal((await A('/api/glimt/settings', 'PUT', { briefGlimt: false })).body.briefGlimt, false);
  const { buildBrief } = await import('../server/brief34.js');
  const b = await buildBrief(sebId, { kind: 'morning' });
  assert.deepEqual([b.briefGlimt, b.showFigure, b.guide.length, b.figure.hidden], [false, false, 0, true]);
  assert.ok(b.summary);
  await A('/api/glimt/settings', 'PUT', { briefGlimt: true });
  const b2 = await buildBrief(sebId, { kind: 'morning' });
  assert.equal(b2.showFigure, true);
  assert.ok(b2.guide.length > 0);
});

/* ---------------- Gjøremål ---------------- */

test('Gjøremål-Glimt: pakkeliste bare for reise/hytte (≥ 2 dager eller reiseord, 1–14 dager frem), aldri for bursdager', async () => {
  const t0 = TODAY;
  const ev = (o) => ({ id: 'x', title: 'X', date: addDays(t0, 3), end: addDays(t0, 4), allDay: true, ...o });
  assert.equal(tg.packEligible39(ev({ title: 'Sebastian 12 år', appCalendar: 'bursdager', type: 'bursdag', date: addDays(t0, 1), end: addDays(t0, 2) }), t0), false);
  assert.equal(tg.packEligible39(ev({ title: 'Ingrid har bursdag', end: addDays(t0, 6) }), t0), false);
  assert.equal(tg.packEligible39(ev({ title: 'Hytta · Hafjell', date: addDays(t0, 12), end: addDays(t0, 15) }), t0), true);
  assert.equal(tg.packEligible39(ev({ title: 'Tannlege', allDay: false, start: `${addDays(t0, 2)}T08:00:00Z`, end: `${addDays(t0, 2)}T09:00:00Z`, date: addDays(t0, 2) }), t0), false);
  assert.equal(tg.packEligible39(ev({ title: 'Ferie i Spania', date: addDays(t0, 20), end: addDays(t0, 27) }), t0), false, 'mer enn 14 dager frem');
  assert.equal(tg.packEligible39(ev({ title: 'Eksamen', date: addDays(t0, 3), end: addDays(t0, 5) }), t0), false);
  // Ende til ende: bursdag i morgen gir intet forslag, hytta gjør.
  const bd = await A('/api/kalender/events', 'POST', { title: 'Sebastian har bursdag', allDay: true, date: addDays(t0, 1), endDate: addDays(t0, 3), appCalendar: 'bursdager' });
  assert.equal(bd.status, 201, bd.text);
  let cards = (await A('/api/tasks/glimt/cards')).body.cards.filter((c) => c.kind === 'packlist');
  assert.ok(cards.every((c) => !/bursdag/i.test(c.event.title)), JSON.stringify(cards));
  const pk = await A('/api/tasks/glimt', 'POST', { action: 'packlist', eventId: bd.body.event.id });
  assert.equal(pk.status, 200, pk.text);
  assert.equal(pk.body.skipped, 'bursdag');
  assert.equal(pk.body.items.length, 0);
  const hy = await A('/api/kalender/events', 'POST', { title: 'Hytta · Hafjell', allDay: true, date: addDays(t0, 5), endDate: addDays(t0, 7), location: 'Hafjell' });
  assert.equal(hy.status, 201, hy.text);
  cards = (await A('/api/tasks/glimt/cards')).body.cards.filter((c) => c.kind === 'packlist');
  assert.equal(cards.length, 1);
  assert.match(cards[0].event.title, /Hytta/);
  assert.ok(cards[0].actions.some((a) => a.action === 'tipoff' && a.label === 'Ikke foreslå slike'));
  // «Ikke foreslå slike».
  assert.deepEqual((await A('/api/tasks/glimt/cards/dismiss', 'POST', { off: 'pack' })).body.tips.pack, false);
  assert.equal((await A('/api/tasks/glimt/cards')).body.cards.filter((c) => c.kind === 'packlist').length, 0);
  assert.equal((await A('/api/tasks/glimt/tips', 'PUT', { pack: true })).body.pack, true);
  assert.equal((await A('/api/tasks/glimt/tips', 'PUT', { nei: true })).status, 400);
});

/* ---------------- Vær ---------------- */

test('Vær: GET /api/weather/week-summary – denne uka mot forrige, tre ruter, tre rader, personlighet (char)', async () => {
  const r = await A('/api/weather/week-summary?place=oslo&char=ugle');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.char, r.body.charName, r.body.place.name, r.body.engine], ['ugle', 'Ugle', 'Oslo', 'lokal']);
  assert.equal(r.body.thisWeek.days.length, 7);
  assert.equal(r.body.lastWeek.days.length, 7);
  assert.equal(r.body.thisWeek.from, TODAY);
  assert.deepEqual(r.body.tiles.map((t) => t.label), ['TEMP', 'NEDBØR', 'SOL']);
  assert.match(r.body.tiles[0].sub, /mot forrige uke$/);
  assert.deepEqual(r.body.highlights.map((h) => h.label), ['Beste dag ute', 'Paraply', 'Klær']);
  assert.match(r.body.text, /^Snittet denne uka er/);
  assert.match((await A('/api/weather/week-summary?char=sky')).body.text, /^Uka blir/);
  assert.equal((await A('/api/weather/week-summary?place=Finnesikkeby')).status, 404);
  assert.deepEqual((await A('/api/weather/week-summary', 'PUT', { char: 'spire' })).body, { char: 'spire' });
  assert.equal((await A('/api/weather/week-summary')).body.char, 'spire');
  assert.equal(w39.clothesFor(10), 'Lett jakke');
  assert.equal(w39.bestDayOf([{ date: 'a', max: 10, mm: 5, wind: 3, sunH: 0 }, { date: 'b', max: 9, mm: 0, wind: 2, sunH: 6 }]).date, 'b');
});

/* ---------------- Domener + Search Console ---------------- */

test('Domener: GET /api/domains/gsc/sites (slått sammen), hent domener (GSC + Cloudflare), «Legg inn for meg» (TXT)', async () => {
  let r = await A('/api/domains/gsc/sites');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.connected, false);
  assert.equal(r.body.steps.length, 6);
  r = await A('/api/gsc/auth?return=/');
  assert.equal(r.status, 302);
  const cb = r.headers.get('location');
  assert.equal((await A(cb)).status, 302);
  r = await A('/api/domains/gsc/sites');
  assert.equal(r.body.connected, true, r.text);
  assert.ok(r.body.count >= 1);
  const kr = r.body.sites.find((s) => s.domain === 'kristo.no');
  assert.ok(kr);
  assert.deepEqual([kr.permission, kr.added, kr.siteUrls[0]], ['eier', true, 'sc-domain:kristo.no']);
  assert.match(r.body.label, /eiendomm?e?r? · kun lesetilgang/);
  const imp = await A('/api/domains/import');
  assert.equal(imp.status, 200);
  assert.equal(imp.body.cloudflare.connected, true);
  const nyZone = imp.body.cloudflare.items.find((x) => !x.added);
  assert.ok(nyZone, JSON.stringify(imp.body.cloudflare));
  const add = await A('/api/domains/import', 'POST', { source: 'cloudflare', domains: [nyZone.name] });
  assert.equal(add.status, 201, add.text);
  assert.deepEqual(add.body.added, [nyZone.name]);
  const add2 = await A('/api/domains/import', 'POST', { source: 'gsc', domains: ['nytt-fra-gsc.no'] });
  assert.deepEqual(add2.body.added, ['nytt-fra-gsc.no']);
  const list = await A('/domains/api/domains');
  const g = list.body.find((d) => d.name === 'nytt-fra-gsc.no');
  assert.deepEqual([g.source, g.sourceLabel], ['gsc', 'Google Search Console']);
  assert.equal((await A('/api/domains/import', 'POST', { source: 'x', domains: ['a.no'] })).status, 400);
  const v = await A('/api/domains/kristo.no/gsc/verify', 'POST');
  assert.equal(v.status, 200, v.text);
  assert.deepEqual([v.body.state, v.body.verified, v.body.txt.created], ['verified', true, true]);
  assert.match(v.body.txt.content, /^google-site-verification=/);
  assert.equal((await I('/api/domains/gsc/sites')).status, 403);
  const ov = await A('/api/domains/overview?domain=*');
  assert.equal(ov.body.gsc.all, true);
});
