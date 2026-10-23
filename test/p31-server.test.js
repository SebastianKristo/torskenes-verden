// Prompt 31 (SERVER31): Nordlys OS-oppdatering uten passord som standard (+ reauth for biometri), Glimt (/api/assist med
// verktøy før LLM, serverjobb, realtime-struktur, Chat-kort, sky bare med samtykke), gratis prøveperioder (API, varsler,
// Kalender, Subscription OS) og rask time med steg/avbryt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'hl-p31-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-31s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1'; // eksempeldata: vær, avganger, pakker, demoregnskap og lokal kalender
delete process.env.OLLAMA_URL;
delete process.env.UPDATE_REPO;
delete process.env.UPDATE_BRANCH;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const su = await import('../server/system-update.js');
const reauth = await import('../server/reauth.js');
const assist = await import('../server/assist.js');
const quick = await import('../server/calendar-quick.js');
const tn = await import('../server/trials-notify.js');
const trials = await import('../server/finans/trials.js');
const { db, kv, OWNER } = await import('../server/db.js');
const { osloTodayISO } = await import('../public/js/quick-time.js');
const { addDaysISO } = await import('../public/js/trial-parse.js');

const SHA = 'a'.repeat(40);
su._setFetch(async (url) => {
  const u = String(url);
  if (u.includes('/commits/')) return new Response(JSON.stringify({ sha: SHA, commit: { message: 'Prompt 31', committer: { date: '2026-10-19T10:00:00Z' } } }), { status: 200 });
  if (u.endsWith('/CHANGELOG.md')) return new Response('# Endringslogg\n\n## [99.22.0] – 19.10.2026 · Nordlys\n- **Nordlys OS:** ny System-side.\n- **Kalender:**\n- **Glimt:**\n  - Svarboble i søket.\n  - Kort i Chat.\n- \n\n## [1.0.0] – 01.01.2020\n- Gammel\n', { status: 200 });
  if (u.endsWith('/releases/latest')) return new Response(JSON.stringify({ assets: [{ name: 'homelab-99.22.0.tar.gz', size: 48_123_456 }, { name: 'app.apk', size: 1 }] }), { status: 200 });
  return new Response('nei', { status: 404 });
});

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const tokR = (await A('/finans/api/tokens', 'POST', { name: 'les', scopes: ['finance:read'] })).body.token;
const tokW = (await A('/finans/api/tokens', 'POST', { name: 'iPhone', scopes: ['finance:read', 'finance:write'] })).body.token;
const TR = client({ authorization: `Bearer ${tokR}` });
const TW = client({ authorization: `Bearer ${tokW}` });
const SEB = (await A('/api/me')).body.id;
const KARI = (await K('/api/me')).body.id;
assert.ok(SEB && KARI && SEB !== KARI);
await A('/api/me/notify', 'PUT', { quietOn: false });
await K('/api/me/notify', 'PUT', { quietOn: false });

const UPD = join(DIR, 'update');
const heartbeat = () => { mkdirSync(UPD, { recursive: true }); writeFileSync(join(UPD, 'heartbeat'), String(Math.floor(Date.now() / 1000))); };
const resetUpd = () => { rmSync(join(UPD, 'request.json'), { force: true }); writeFileSync(join(UPD, 'status.json'), JSON.stringify({ id: 'x', state: 'done' })); };
const TODAY = osloTodayISO();
const queueOf = (u, tag) => db.prepare('SELECT * FROM notify_queue WHERE user_id=? AND tag LIKE ? ORDER BY id').all(u, tag);

/* ---------------- 1. Oppdatering uten passord som standard ---------------- */

test('require_password er av som standard: admin starter uten passord (økt og admin-token med finance:write)', async () => {
  assert.deepEqual((await A('/api/system/update/settings')).body, { auto_update: false, notify_updates: true, require_password: false });
  heartbeat(); resetUpd();
  const o = (await A('/api/system/update')).body;
  assert.equal(o.needsPassword, false);
  assert.equal(o.name, 'Nordlys OS');
  const r = await A('/api/system/update/start', 'POST', {});
  assert.equal(r.status, 200, r.text);
  assert.ok(existsSync(join(UPD, 'request.json')));
  resetUpd();
  assert.equal((await TW('/api/system/update/start', 'POST', {})).status, 200);
  resetUpd();
  // Admin-only alltid: lesetoken og vanlige brukere får 403 uansett.
  assert.equal((await TR('/api/system/update/start', 'POST', {})).status, 403);
  assert.equal((await K('/api/system/update/start', 'POST', {})).status, 403);
  assert.equal((await K('/api/system/update/rollback', 'POST', {})).status, 403);
  assert.equal((await client({})('/api/system/update/start', 'POST', {})).status, 401);
  assert.equal(existsSync(join(UPD, 'request.json')), false);
  // Fortsatt JSON-krav (CSRF).
  const f = await app.request('/api/system/update/start', { method: 'POST', headers: { cookie: (await login('sebastian', 'testpassord1')), 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=1' });
  assert.equal(f.status, 415);
});

test('bryteren: bare admin, validering, endringen logges', async () => {
  assert.equal((await K('/api/system/update/settings', 'PUT', { require_password: true })).status, 403);
  assert.equal((await TR('/api/system/update/settings', 'PUT', { require_password: true })).status, 403);
  assert.equal((await A('/api/system/update/settings', 'PUT', { require_password: 'ja' })).status, 400);
  const r = await A('/api/system/update/settings', 'PUT', { require_password: true });
  assert.deepEqual(r.body, { auto_update: false, notify_updates: true, require_password: true });
  const log = su.updateAudit();
  assert.equal(log[0].key, 'require_password');
  assert.deepEqual([log[0].from, log[0].to, log[0].user], [false, true, SEB]);
  assert.match(log[0].via, /økt/);
  assert.equal((await A('/api/system/update')).body.settingsLog[0].key, 'require_password');
  assert.equal((await A('/api/system/update')).body.needsPassword, true);
});

test('require_password på: passord eller reauthToken (engangs, 5 min, bundet til brukeren)', async () => {
  heartbeat(); resetUpd();
  assert.equal((await A('/api/system/update/start', 'POST', {})).status, 403);
  assert.equal((await A('/api/system/update/start', 'POST', { password: 'feil' })).status, 403);
  assert.equal((await A('/api/system/update/start', 'POST', { password: 'testpassord1' })).status, 200);
  resetUpd();
  // Reauth: krever innlogging og riktig passord.
  assert.equal((await client({})('/api/auth/reauth', 'POST', { password: 'testpassord1' })).status, 401);
  assert.equal((await TW('/api/auth/reauth', 'POST', { password: 'feil' })).status, 403);
  const t = await TW('/api/auth/reauth', 'POST', { password: 'testpassord1' });
  assert.equal(t.status, 200, t.text);
  assert.match(t.body.reauthToken, /^ra_[\w-]{40,}$/);
  assert.equal(t.body.expiresIn, 300);
  assert.ok(Math.abs(Date.parse(t.body.expiresAt) - Date.now() - 300_000) < 5000);
  assert.equal((await TW('/api/system/update/start', 'POST', { reauthToken: t.body.reauthToken })).status, 200);
  resetUpd();
  const again = await TW('/api/system/update/start', 'POST', { reauthToken: t.body.reauthToken });
  assert.equal(again.status, 403, 'engangsbruk');
  assert.equal(again.body.needsPassword, true);
  // Bundet til brukeren: Karis token virker ikke for Sebastian.
  const kt = (await K('/api/auth/reauth', 'POST', { password: 'kariPassord123' })).body.reauthToken;
  assert.equal(reauth.consumeReauth(kt, SEB), false);
  // Utløper etter 5 min.
  const old = reauth.issueReauth(SEB);
  assert.equal(reauth.consumeReauth(old.reauthToken, SEB, Date.now() + 301_000), false);
  const ok = reauth.issueReauth(SEB);
  assert.equal(reauth.consumeReauth(ok.reauthToken, SEB), true);
  // Rollback følger samme regel.
  writeFileSync(join(UPD, 'history.json'), JSON.stringify({ entries: [{ sha: SHA, version: '99.22.0', at: 2 }, { sha: 'b'.repeat(40), version: '4.21.0', at: 1 }] }));
  assert.equal((await A('/api/system/update/rollback', 'POST', {})).status, 403);
  const rt = (await A('/api/auth/reauth', 'POST', { password: 'testpassord1' })).body.reauthToken;
  assert.equal((await A('/api/system/update/rollback', 'POST', { reauthToken: rt })).status, 200);
  resetUpd();
  await A('/api/system/update/settings', 'PUT', { require_password: false });
  assert.equal(su.updateAudit()[0].to, false);
});

test('GET /api/system/version: Nordlys OS, tagline, sizeBytes fra release, notes uten tomme punkter', async () => {
  const r = await TR('/api/system/version?force=1');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.name, 'Nordlys OS');
  assert.equal(r.body.codename, 'Nordlys');
  assert.equal(r.body.tagline, 'Lys i mørket, kjørt hjemme.');
  assert.equal(r.body.sizeBytes, 48_123_456);
  assert.equal(r.body.latest, '99.22.0');
  assert.deepEqual(r.body.notes, ['Nordlys OS: ny System-side.', 'Glimt: Svarboble i søket. Kort i Chat.']);
  assert.equal(su.shortName('4.22.0'), 'Nordlys 4.22');
});

test('varsel om ny versjon: «Nordlys 99.22 er klar» til administratorene (kø/Web Push), ikke til andre', async () => {
  kv.del(OWNER, 'update_notified');
  await A('/api/system/update/settings', 'PUT', { notify_updates: true });
  assert.equal(await su.checkAndNotify(), true);
  await new Promise((r) => setTimeout(r, 20));
  const q = queueOf(SEB, 'update-%');
  assert.equal(q.length, 1);
  assert.equal(q[0].title, 'Nordlys 99.22 er klar');
  assert.equal(q[0].category, 'system');
  assert.equal(queueOf(KARI, 'update-%').length, 0);
});

/* ---------------- 2. Glimt: /api/assist ---------------- */

test('intensjon før LLM', () => {
  const d = (s) => assist.detectIntent(s, '2026-10-19');
  assert.equal(d('blir det regn i dag?'), 'weather');
  assert.equal(d('trenger jeg paraply?'), 'weather');
  assert.equal(d('hvor varmt er det i morgen?'), 'weather');
  assert.equal(d('hva skjer i morgen?'), 'calendar.day');
  assert.equal(d('hva har jeg i dag'), 'calendar.day');
  assert.equal(d('når er neste frisør time'), 'calendar.next');
  assert.equal(d('når har jeg tannlege?'), 'calendar.next');
  assert.equal(d('når går 45?'), 'departures');
  assert.equal(d('hvor er pakken min'), 'packages');
  assert.equal(d('hva har jeg brukt på mat'), 'finance.spent');
  assert.equal(d('hva står på huskelisten'), 'tasks');
  assert.equal(d('Viaplay gratis i 14 dager, påminn meg om å avslutte'), 'trial.create');
  assert.equal(d('Storytel prøve til 25.11, 179 kr'), 'trial.create');
  assert.equal(d('når er neste prøve?'), 'calendar.next');
  assert.equal(d('time hos Nina frisør 14.30 25.09'), 'appointment.create');
  assert.equal(d('hvem skrev Peer Gynt?'), 'llm');
  assert.equal(assist.hasUserData('hva er hovedstaden i Peru'), false);
  assert.equal(assist.hasUserData('hva har jeg på kontoen'), true);
  assert.equal(assist.hasUserData('send til kari@example.com'), true);
});

test('vær: MET/Yr for valgt sted, uten LLM, kort med timerad; paraply ved ≥ 50 %', async () => {
  let llm = 0;
  assist._setAssistLlm(async () => { llm++; return 'nei'; });
  const r = await A('/api/assist', 'POST', { q: 'hvordan er været?', source: 'search' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.intent, 'weather');
  assert.equal(r.body.source, 'Open-Meteo · MET Norway');
  assert.equal(r.body.tool, 'Vær');
  assert.match(r.body.text, /^Det er \*\*-?\d+° og [a-zæøå ]+\*\* i Oslo nå, vind \d+ m\/s\. I dag -?\d+–-?\d+°\./);
  assert.deepEqual(r.body.bold, [r.body.text.match(/\*\*(.+?)\*\*/)[1], ...(/paraply/.test(r.body.text) ? ['Ta med paraply.'] : [])]);
  const c = r.body.card;
  assert.equal(c.k, 'weather');
  assert.equal(c.city, 'Oslo');
  assert.equal(c.day, 'today');
  assert.ok(c.h.length >= 1 && c.h.length <= 6);
  assert.equal(c.h[0].l, 'Nå');
  assert.ok(typeof c.ic === 'string' && typeof c.icon === 'string');
  assert.match(r.body.jobId, /^a[0-9a-f]{12}$/);
  assert.ok(Number.isInteger(r.body.ms));
  assert.deepEqual(r.body.chatContext.messages.map((m) => m.role), ['user', 'assistant']);
  assert.equal(r.body.chatContext.messages[1].card.k, 'weather');
  // Valgt sted (første i Mine steder).
  kv.set(SEB, 'wx_places', [{ id: 'bg', name: 'Bergen', lat: 60.39, lon: 5.32 }]);
  const u = await A('/api/assist', 'POST', { q: 'trenger jeg paraply i morgen?' });
  assert.match(u.body.text, /^I morgen er det \d+ % sjanse for nedbør i Bergen\. \*\*(Ta med paraply\.|Du klarer deg uten paraply\.)\*\* -?\d+–-?\d+°\.$/);
  assert.equal(u.body.card.day, 'tomorrow');
  assert.equal(u.body.card.umbrella, u.body.card.precipProb >= 50);
  kv.del(SEB, 'wx_places');
  assert.equal(llm, 0, 'verktøy går før LLM');
});

test('kalender: dag og neste time («når er neste frisør time»)', async () => {
  const d = addDaysISO(TODAY, 6);
  const ev = await A('/api/kalender/events', 'POST', { title: 'Nina frisør', date: d, start: '14:30', end: '15:15', calendar: 'privat' });
  assert.equal(ev.status, 201, ev.text);
  const n = await A('/api/assist', 'POST', { q: 'når er neste frisør time' });
  assert.equal(n.body.intent, 'calendar.next');
  assert.equal(n.body.tool, 'Kalender');
  assert.match(n.body.text, /^Nina frisør er \*\*[a-zæøå]+ \d+\. [a-zæøå]+ kl\. 14\.30\*\* \(om 6 dager\)\.$/);
  assert.equal(n.body.card.k, 'calendar');
  assert.equal(n.body.card.items[0].title, 'Nina frisør');
  const none = await A('/api/assist', 'POST', { q: 'når er neste tannlege time' });
  assert.equal(none.body.text, 'Fant ingen kommende tannlegetime i kalenderen.');
  const day = await A('/api/assist', 'POST', { q: `hva skjer ${d.slice(8, 10)}.${d.slice(5, 7)}?` });
  assert.equal(day.body.intent, 'calendar.day');
  assert.equal(day.body.card.date, d);
  assert.ok(day.body.card.items.some((x) => x.title === 'Nina frisør' && x.time === '14:30'));
  assert.match(day.body.card.sub, /hendelse/);
  assert.match(day.body.text, /i kalenderen\. Første er \*\*/);
  // Kari ser ikke Sebastians time.
  assert.match((await K('/api/assist', 'POST', { q: 'når er neste frisør time' })).body.text, /^Fant ingen/);
});

test('avganger, pakker, finans og huskeliste', async () => {
  await A('/api/me/stops', 'PUT', { stops: [{ id: 'NSR:StopPlace:58404', name: 'Majorstuen' }] });
  const dep = await A('/api/assist', 'POST', { q: 'når går 45?' });
  assert.equal(dep.body.intent, 'departures');
  assert.match(dep.body.text, /^\*\*45\*\* mot .+ går (om \*\*\d+ min\*\*|\*\*nå\*\*) fra Majorstuen\.$/);
  assert.equal(dep.body.card.k, 'departures');
  assert.ok(dep.body.card.items.length >= 1);
  const pk = await A('/api/assist', 'POST', { q: 'hvor er pakkene mine?' });
  assert.equal(pk.body.intent, 'packages');
  assert.equal(pk.body.card.k, 'packages');
  assert.match(pk.body.text, /\*\*(\d+ pakker?|ingen pakker)\*\*/);
  const fin = await A('/api/assist', 'POST', { q: 'hva har jeg brukt på mat i år?' });
  assert.equal(fin.body.intent, 'finance.spent');
  assert.equal(fin.body.card.k, 'finance');
  assert.equal(fin.body.card.category, 'Mat og dagligvarer');
  assert.equal(fin.body.card.period.label, 'i år');
  assert.ok(fin.body.card.items.length <= 3);
  assert.match(fin.body.text, /på mat og dagligvarer i år\./);
  const kFin = await K('/api/assist', 'POST', { q: 'hva har jeg brukt på mat i år?' });
  assert.notEqual(kFin.body.card.total, fin.body.card.total === 0 ? -1 : fin.body.card.total, 'eget regnskap per bruker');
  assert.equal((await A('/api/tasks', 'POST', { title: 'Kjøp melk', due: addDaysISO(TODAY, -1) })).status, 201);
  const ts = await A('/api/assist', 'POST', { q: 'hva står på huskelisten?' });
  assert.equal(ts.body.intent, 'tasks');
  assert.equal(ts.body.card.k, 'tasks');
  assert.ok(ts.body.card.items.some((x) => x.title === 'Kjøp melk'));
});

test('prøveperiode med Glimt: lagres, svar med uthevet tidspunkt; mangler noe → spør', async () => {
  const r = await A('/api/assist', 'POST', { q: 'Viaplay gratis i 14 dager, påminn meg om å avslutte' });
  assert.equal(r.body.intent, 'trial.create');
  assert.equal(r.body.source, 'Abonnementer · varsel planlagt');
  assert.equal(r.body.tool, 'Abonnementer');
  const end = addDaysISO(TODAY, 14);
  assert.equal(r.body.trial.endsAt, end);
  assert.equal(r.body.trial.service, 'Viaplay');
  assert.match(r.body.text, /^Jeg minner deg på å avslutte Viaplay \*\*[a-zæøå]+ \d+\. [a-zæøå]+ kl\. 09\*\*, dagen før prøven slutter [a-zæøå]+ \d+\. [a-zæøå]+\.$/);
  assert.ok((await A('/finans/api/subscriptions/trials')).body.items.some((t) => t.id === r.body.trial.id));
  const m = await A('/api/assist', 'POST', { q: 'Netflix prøveperiode, si opp i tide' });
  assert.deepEqual(m.body.missing, ['endsAt']);
  assert.match(m.body.text, /Når slutter prøven på Netflix/);
  assert.equal(m.body.source, 'Abonnementer');
});

// Prompt 45: rask time fra Hjem går gjennom Glimt-motoren (glimt45): hendelsen lagres og kontrolleres før Glimt sier at den er lagt inn.
// Før svarte Glimt «Legger til …» mens jobben fortsatt sto i kø (bekreftet før datakilden hadde bekreftet).
test('rask time via Glimt: lagres og bekreftes av kalenderen før svaret', async () => {
  const r = await A('/api/assist', 'POST', { q: 'time hos Nina frisør 14.30 25.09' });
  assert.equal(r.body.intent, 'appointment.create');
  assert.match(r.body.text, /^Lagt inn: \*\*«Nina frisør» [a-zæøå]+ 25\. september( \d{4})? kl\. 14:30–15:15\*\* i Personlig-kalenderen\./);
  const ev = r.body.created.event;
  assert.equal(r.body.agent.actions[0].status, 'done');
  const evs = (await A(`/api/kalender?from=${ev.date}&to=${ev.date}`)).body;
  assert.ok(JSON.stringify(evs).includes('Nina frisør'), 'hendelsen finnes i kalenderen');
});

test('LLM: lokal modell med systemprompten; sky (Gemini) bare med samtykke og uten brukerdata', async () => {
  const calls = [];
  assist._setAssistLlm(async ({ q, engine }) => { calls.push(engine); if (engine === 'ollama') throw new Error('nede'); return 'Henrik **Ibsen** skrev Peer Gynt.'; });
  let r = await A('/api/assist', 'POST', { q: 'hvem skrev Peer Gynt?' });
  assert.equal(r.body.intent, 'llm');
  assert.deepEqual(calls, ['ollama'], 'sky er av som standard');
  assert.equal(r.body.followUp, 'chat');
  assert.match(r.body.text, /Fortsett i Chat/);
  assert.equal(r.body.engine, 'none');
  assert.deepEqual((await A('/api/assist/settings', 'PUT', { cloud: true })).body, { ai_bg_notify: true, n_ai_in: false, cloud: true }); // prompt 39: + n_ai_in · prompt 45: utgått (alltid false)
  assert.equal((await A('/api/assist/settings', 'PUT', { cloud: 'ja' })).status, 400);
  calls.length = 0;
  r = await A('/api/assist', 'POST', { q: 'hvem skrev Peer Gynt?' });
  assert.deepEqual(calls, ['ollama', 'gemini']);
  assert.equal(r.body.source, 'Glimt · Gemini');
  assert.equal(r.body.text, 'Henrik **Ibsen** skrev Peer Gynt.');
  assert.deepEqual(r.body.bold, ['Ibsen']);
  assert.ok(db.prepare("SELECT count(*) FROM ai_audit WHERE purpose='assist' AND user_id=?").pluck().get(SEB) >= 1);
  calls.length = 0;
  r = await A('/api/assist', 'POST', { q: 'hva tror du om lønna mi?' });
  assert.deepEqual(calls, ['ollama'], 'brukerdata i spørsmålet → aldri sky');
  await A('/api/assist/settings', 'PUT', { cloud: false });
  assist._setAssistLlm(async ({ engine }) => (engine === 'ollama' ? 'Det er **Lima**. Hovedstaden i Peru. Tredje setning kuttes.' : 'x'));
  r = await A('/api/assist', 'POST', { q: 'hva er hovedstaden i Peru?' });
  assert.equal(r.body.source, 'Glimt');
  assert.equal(r.body.model, 'Glimt · lokal');
  assert.equal(r.body.text, 'Det er **Lima**. Hovedstaden i Peru.');
});

test('serverjobb: > 1,2 s → 202 {jobId}, fortsetter, GET /:id, varsel i køen; per bruker', async () => {
  assist._setDirectMs(30);
  assist._setAssistLlm(async ({ engine }) => { await new Promise((r) => setTimeout(r, 120)); return engine === 'ollama' ? 'Svaret er **42**.' : 'x'; });
  const r = await A('/api/assist', 'POST', { q: 'hva er meningen med livet?', source: 'search' });
  assert.equal(r.status, 202, r.text);
  assert.deepEqual(Object.keys(r.body), ['jobId', 'kind', 'surface', 'intent']); // prompt 36: kind/surface (spørsmål vs. handling) med en gang
  const mid = (await A(`/api/assist/${r.body.jobId}`)).body;
  assert.equal(mid.state, 'running');
  assert.deepEqual(Object.keys(mid).filter((k) => ['jobId', 'state', 'steps', 'fields', 'progress', 'title', 'model', 'input'].includes(k)).length, 8);
  assert.equal(mid.input, 'hva er meningen med livet?');
  assert.ok(mid.steps.some((s) => s.state === 'active'));
  await assist._drainAssist();
  await new Promise((res) => setTimeout(res, 20));
  const done = (await A(`/api/assist/${r.body.jobId}`)).body;
  assert.equal(done.state, 'done');
  assert.equal(done.progress, 100);
  assert.equal(done.answer.text, 'Svaret er **42**.');
  assert.ok(done.steps.every((s) => s.state === 'done'));
  assert.ok(done.fields.some((f) => f.k === 'Kilde'));
  const q = queueOf(SEB, `assist-${r.body.jobId}`);
  assert.equal(q.length, 1);
  assert.deepEqual([q[0].title, q[0].body, q[0].category, q[0].url], ['Glimt', 'Svaret er 42.', 'ai', '/#/hjem']);
  assert.equal(JSON.parse(q[0].data).deepLink, 'finanshub://hjem');
  assert.equal((await K(`/api/assist/${r.body.jobId}`)).status, 404);
  assert.equal((await A('/api/assist/ugyldig')).status, 400);
  // Svar direkte (200) gir ikke varsel.
  assist._setDirectMs(null);
  const fast = await A('/api/assist', 'POST', { q: 'hvordan er været?' });
  assert.equal(fast.status, 200);
  assert.equal(queueOf(SEB, `assist-${fast.body.jobId}`).length, 0);
  // Avbryt.
  assist._setDirectMs(10);
  const slow = await A('/api/assist', 'POST', { q: 'fortell en lang historie' });
  assert.equal(slow.status, 202);
  assert.deepEqual((await A(`/api/assist/${slow.body.jobId}/cancel`, 'POST', {})).body, { ok: true, state: 'cancelled' });
  await assist._drainAssist();
  assert.equal((await A(`/api/assist/${slow.body.jobId}`)).body.state, 'cancelled');
  assert.equal(queueOf(SEB, `assist-${slow.body.jobId}`).length, 0);
  assist._setDirectMs(null);
  assert.equal((await A('/api/assist', 'POST', { q: '' })).status, 400);
  assert.equal((await client({})('/api/assist', 'POST', { q: 'vær' })).status, 401);
  assert.equal((await TW('/api/assist', 'POST', { q: 'hvordan er været?' })).status, 200, 'app-token virker');
});

test('Chat: svaret og kortet lagres i samtalen', async () => {
  const r = await A('/api/assist', 'POST', { q: 'blir det regn i morgen?', source: 'chat' });
  assert.ok(r.body.chatId);
  const chat = (await A(`/api/chat/chats/${r.body.chatId}`)).body;
  const msgs = chat.messages ?? chat.chat?.messages;
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].card.k, 'weather');
  assert.equal(msgs[1].tool, 'Vær');
  const r2 = await A('/api/assist', 'POST', { q: 'hva skjer i dag?', source: 'chat', chatId: r.body.chatId });
  assert.equal(r2.body.chatId, r.body.chatId);
  const m2 = (await A(`/api/chat/chats/${r.body.chatId}`)).body;
  assert.equal((m2.messages ?? m2.chat?.messages).length, 4);
  // En annen brukers chatId gir ny samtale.
  const k = await K('/api/assist', 'POST', { q: 'hvordan er været?', source: 'chat', chatId: r.body.chatId });
  assert.notEqual(k.body.chatId, r.body.chatId);
});

/* ---------------- 3. Prøveperioder ---------------- */

test('trials: POST/GET/PATCH, validering, per bruker; kjente varseltider for lokale varsler', async () => {
  const end = addDaysISO(TODAY, 10);
  assert.equal((await A('/finans/api/subscriptions/trials', 'POST', { service: '', endsAt: end })).status, 400);
  assert.equal((await A('/finans/api/subscriptions/trials', 'POST', { service: 'Netflix', endsAt: '2020-01-01' })).status, 400);
  assert.equal((await A('/finans/api/subscriptions/trials', 'POST', { service: 'Netflix', endsAt: end, remindOffsetsDays: [99] })).status, 400);
  assert.equal((await TR('/finans/api/subscriptions/trials', 'POST', { service: 'Netflix', endsAt: end })).status, 403);
  const r = await A('/finans/api/subscriptions/trials', 'POST', { service: 'Storytel', endsAt: end, priceAfter: 179, remindOffsetsDays: [3, 1] });
  assert.equal(r.status, 201, r.text);
  const t = r.body;
  assert.deepEqual([t.service, t.endsAt, t.priceAfter, t.priceLabel, t.status, t.daysLeft, t.badge], ['Storytel', end, 179, '179 kr/mnd', 'active', 10, 'Prøve · 10 dager igjen']);
  assert.deepEqual(t.remindOffsetsDays, [1, 3]);
  assert.match(t.cancelUrl, /storytel/);
  assert.deepEqual(t.notifications.map((n) => n.key), ['d3', 'd1', 'final']);
  const n1 = t.notifications[1];
  assert.equal(n1.title, 'Storytel-prøven slutter i morgen');
  assert.match(n1.body, /^Avslutt før [a-zæøå]+ \d+\. [a-zæøå]+ for å slippe 179 kr\/mnd\. Trykk for å åpne oppsigelsessiden\.$/);
  assert.equal(n1.time, '09:00');
  assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(n1.at)), '09:00');
  assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t.notifications[2].at)), '18:00');
  assert.deepEqual(n1.actions.map((a) => a.id), ['cancel', 'keep', 'snooze']);
  const p = await A('/finans/api/subscriptions/trials/parse', 'POST', { text: 'Storytel prøve til 25.11, 179 kr', today: '2026-10-17' });
  assert.equal(p.body.endsAt, '2026-11-25');
  assert.equal(p.body.preview.title, 'Storytel-prøven slutter i morgen');
  const fromText = await A('/finans/api/subscriptions/trials', 'POST', { text: 'Disney+ gratis i 7 dager' });
  assert.equal(fromText.status, 201);
  assert.equal(fromText.body.endsAt, addDaysISO(TODAY, 7));
  const g = (await A('/finans/api/subscriptions/trials')).body;
  assert.ok(g.items.some((x) => x.id === t.id));
  assert.ok(g.cancelLinks.some((x) => x.name === 'Viaplay'));
  assert.deepEqual(g.remindOptions.map((x) => x.days), [0, 1, 3, 7]);
  assert.ok(!(await K('/finans/api/subscriptions/trials')).body.items.some((x) => x.id === t.id));
  assert.equal((await K(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { status: 'cancelled' })).status, 404);
  // Subscription OS: aktive prøver i abonnementslisten.
  assert.ok((await A('/finans/api/subscriptions')).body.trials.some((x) => x.id === t.id && x.badge === 'Prøve · 10 dager igjen'));
  // Snooze og status.
  const s = await A(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { snooze: 'tomorrow' });
  assert.equal(s.body.snoozeUntil, addDaysISO(TODAY, 1));
  assert.ok(s.body.notifications.some((n) => n.kind === 'snooze' && n.date === addDaysISO(TODAY, 1)));
  assert.equal((await A(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { snooze: 'neste uke' })).status, 400);
  assert.equal((await A(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { status: 'slettet' })).status, 400);
  const kept = await A(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { status: 'kept' });
  assert.equal(kept.body.status, 'kept');
  assert.equal(kept.body.subscription.name, 'Storytel');
  assert.equal(kept.body.subscription.price, 179);
  assert.equal(kept.body.subscription.nextDate, end);
  assert.deepEqual(kept.body.notifications, []);
  assert.ok((await A('/finans/api/subscriptions')).body.items.some((x) => x.id === kept.body.subscription.id));
  const c = await A(`/finans/api/subscriptions/trials/${fromText.body.id}`, 'PATCH', { status: 'cancelled' });
  assert.equal(c.body.status, 'cancelled');
  assert.ok(!(await A('/finans/api/subscriptions/trials')).body.items.some((x) => x.id === fromText.body.id));
  assert.ok((await A('/finans/api/subscriptions/trials?all=1')).body.items.some((x) => x.id === fromText.body.id));
});

test('trials i Kalender: heldagshendelse i Privat på sluttdatoen (ikke skoleprøve), bare aktive', async () => {
  const end = addDaysISO(TODAY, 5);
  const t = (await A('/finans/api/subscriptions/trials', 'POST', { service: 'Tidal', endsAt: end, priceAfter: 129 })).body;
  const ev = (await A(`/api/kalender?from=${end}&to=${end}`)).body;
  const e = ev.events.find((x) => x.id === `trial-${t.id}`);
  assert.ok(e, JSON.stringify(ev.events.map((x) => x.id)));
  assert.deepEqual([e.title, e.allDay, e.date, e.calendar, e.editable, e.source], ['Tidal-prøven slutter', true, end, 'privat', false, 'trials']);
  assert.notEqual(e.type, 'prove');
  assert.ok(ev.sources.some((s) => s.id === 'trials'));
  assert.ok(!(await K(`/api/kalender?from=${end}&to=${end}`)).body.events.some((x) => x.id === `trial-${t.id}`));
  await A(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { status: 'cancelled' });
  assert.ok(!(await A(`/api/kalender?from=${end}&to=${end}`)).body.events.some((x) => x.id === `trial-${t.id}`));
});

test('scheduler: varsel kl. 09 dagen før og 18 på sluttdagen, én gang; forsinket > 12 t hoppes over', async () => {
  const end = addDaysISO(TODAY, 3);
  const t = (await K('/finans/api/subscriptions/trials', 'POST', { service: 'Viaplay', endsAt: end, priceAfter: 149 })).body;
  const at = (date, hm) => trials.osloMs(date, hm);
  assert.deepEqual((await tn.trialTick(at(addDaysISO(end, -1), '08:59'))).filter((x) => x.trialId === t.id), []);
  const s1 = (await tn.trialTick(at(addDaysISO(end, -1), '09:00'))).filter((x) => x.trialId === t.id);
  assert.deepEqual(s1, [{ trialId: t.id, key: 'd1', sent: true }]);
  assert.deepEqual((await tn.trialTick(at(addDaysISO(end, -1), '09:01'))).filter((x) => x.trialId === t.id), [], 'bare én gang');
  const q = queueOf(KARI, `trial-${t.id}`);
  assert.equal(q.length, 1);
  assert.equal(q[0].title, 'Viaplay-prøven slutter i morgen');
  assert.match(q[0].body, /for å slippe 149 kr\/mnd/);
  assert.equal(q[0].category, 'abonnement');
  const data = JSON.parse(q[0].data);
  assert.equal(data.trialId, t.id);
  assert.deepEqual(data.actions.map((a) => a.id), ['cancel', 'keep', 'snooze']);
  assert.equal(queueOf(SEB, `trial-${t.id}`).length, 0, 'bare den som la den inn');
  // Siste varsel kl. 18, men serveren var nede til neste morgen → markeres uten å sendes.
  const late = (await tn.trialTick(at(addDaysISO(end, 1), '08:00'))).filter((x) => x.trialId === t.id);
  assert.deepEqual(late, [{ trialId: t.id, key: 'final', sent: false }]);
  assert.equal(queueOf(KARI, `trial-${t.id}`).length, 1);
  // Kansellert prøve varsles ikke.
  const t2 = (await K('/finans/api/subscriptions/trials', 'POST', { service: 'Tidal', endsAt: end })).body;
  await K(`/finans/api/subscriptions/trials/${t2.id}`, 'PATCH', { status: 'cancelled' });
  assert.deepEqual((await tn.trialTick(at(end, '18:00'))).filter((x) => x.trialId === t2.id), []);
});

/* ---------------- Rask time: steg, felt og avbryt ---------------- */

test('rask time: quickProgress-struktur og POST /:id/cancel («Avbrutt · ingenting ble lagt til»)', async () => {
  const p = quick.quickProgress({ id: 'q1', state: 'running', text: 'time hos nina', engine: 'ollama', found: { title: 'Nina', date: '2026-10-23', start: '14:30', label: 'fre 23. okt · 14:30' } }, 2);
  assert.deepEqual(Object.keys(p), ['jobId', 'state', 'steps', 'fields', 'progress', 'title', 'model', 'input']);
  assert.deepEqual(p.steps.map((s) => s.state), ['done', 'done', 'active', 'pending']);
  assert.deepEqual(p.fields.map((f) => f.k), ['Hva', 'Når', 'Kalender', 'Varsel']);
  assert.equal(p.model, 'Glimt · lokal');
  quick._setQuickOllama(async () => { await new Promise((r) => setTimeout(r, 150)); return { tittel: 'Lege', dato: addDaysISO(TODAY, 3), start: '10:00', type: 'lege', sikkerhet: 0.9 }; });
  const r = await A('/api/kalender/quick', 'POST', { text: 'legetime om tre dager kl 10' });
  assert.equal(r.status, 202);
  await new Promise((res) => setTimeout(res, 20));
  const c = await A(`/api/kalender/quick/${r.body.jobId}/cancel`, 'POST', {});
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.cancelled, true);
  await quick._drain();
  const j = (await A('/api/kalender/quick/jobs')).body.find((x) => x.id === r.body.jobId);
  assert.equal(j.state, 'failed');
  assert.equal(j.error, quick.CANCELLED);
  assert.equal(j.cancelled, true);
  assert.ok(!(await A(`/api/kalender?from=${addDaysISO(TODAY, 3)}&to=${addDaysISO(TODAY, 3)}`)).body.events.some((e) => e.title === 'Lege' && e.origin));
  // Ferdig jobb kan ikke avbrytes (bruk Angre); andres jobber finnes ikke.
  quick._setQuickOllama(null);
  const d = await A('/api/kalender/quick', 'POST', { text: 'frisør 25.12.2026 kl 11' });
  await quick._drain();
  assert.equal((await A(`/api/kalender/quick/${d.body.jobId}/cancel`, 'POST', {})).status, 409);
  assert.equal((await K(`/api/kalender/quick/${d.body.jobId}/cancel`, 'POST', {})).status, 404);
  // Ferdig rask time havner i køen for appene.
  assert.equal(queueOf(SEB, `quick-${d.body.jobId}`).length, 1);
});
