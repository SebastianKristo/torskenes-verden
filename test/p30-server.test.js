// Prompt 30 (SERVER30): oppdatering fra mobil (token + passord, versjon, steg, brukervalg, varsel, auto, rollback),
// ✦ AI-søk i innstillingene (indeks, lokal → Gemini → nøkkelord, ai_audit), profilmeny/Finans → Mer i layout,
// Cloudflare-tokentest (mocket), Boliger (del med brukere uten e-post/brukernavn, rediger med historikk),
// kvitteringsmarkering (bbox, søk med lineIndex, ?hl=, les på nytt) og logoene i public/assets/brands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'hl-p30-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-30';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.UPDATE_REPO;
delete process.env.UPDATE_BRANCH;
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const su = await import('../server/system-update.js');
const ask = await import('../server/settings-ask30.js');
const dom = await import('../server/domains.js');
const fr = await import('../server/finans/routes.js');
const { db, kv, OWNER } = await import('../server/db.js');
const { validate } = await import('../server/finans/ai.js');

const SHA = 'a'.repeat(40);
su._setFetch(async (url) => {
  if (String(url).includes('/commits/')) return new Response(JSON.stringify({ sha: SHA, commit: { message: 'Prompt 30', committer: { date: '2026-10-19T10:00:00Z' } } }), { status: 200 });
  if (String(url).endsWith('/CHANGELOG.md')) return new Response('# Endringslogg\n\n## [99.1.0] – 19.10.2026 · neste\n- Oppdater fra mobilen\n- Rollback\n\n## [1.0.0] – 01.01.2020\n- Gammel\n', { status: 200 });
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
assert.equal((await A('/api/users', 'POST', { username: 'per.hemmelig', password: 'perPassord123', role: 'bruker', name: 'Per' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const tokR = (await A('/finans/api/tokens', 'POST', { name: 'les', scopes: ['finance:read'] })).body.token;
const tokW = (await A('/finans/api/tokens', 'POST', { name: 'iPhone', scopes: ['finance:read', 'finance:write'] })).body.token;
const TR = client({ authorization: `Bearer ${tokR}` });
const TW = client({ authorization: `Bearer ${tokW}` });
const users = (await A('/api/users')).body;
const kari = (users.users ?? users).find((u) => u.username === 'kari');
const per = (users.users ?? users).find((u) => u.username === 'per.hemmelig');
assert.ok(kari && per);

const UPD = join(DIR, 'update');
const heartbeat = () => { mkdirSync(UPD, { recursive: true }); writeFileSync(join(UPD, 'heartbeat'), String(Math.floor(Date.now() / 1000))); };
const status = (s) => writeFileSync(join(UPD, 'status.json'), JSON.stringify(s));

/* ---------------- 1. Oppdatering fra mobil ---------------- */

test('GET /api/system/version: kort svar med notes fra nyere versjoner, bare admin', async () => {
  const r = await TR('/api/system/version');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(Object.keys(r.body).sort(), ['current', 'latest', 'notes', 'publishedAt', 'updateAvailable']);
  assert.equal(r.body.latest, '99.1.0');
  assert.deepEqual(r.body.notes, ['Oppdater fra mobilen', 'Rollback']);
  assert.equal(r.body.publishedAt, '2026-10-19T10:00:00Z');
  assert.equal(r.body.updateAvailable, true);
  assert.equal((await K('/api/system/version')).status, 403);
});

test('start fra app: admin-token med finance:write + passord; uten passord 403, lesetoken 403', async () => {
  heartbeat();
  rmSync(join(UPD, 'request.json'), { force: true });
  assert.equal((await TW('/api/system/update/start', 'POST', {})).status, 403);
  assert.equal((await TW('/api/system/update/start', 'POST', { password: 'feil' })).status, 403);
  const ro = await TR('/api/system/update/start', 'POST', { password: 'testpassord1' });
  assert.equal(ro.status, 403);
  assert.match(ro.body.error, /finance:write/);
  assert.equal(existsSync(join(UPD, 'request.json')), false);
  const ok = await TW('/api/system/update/start', 'POST', { password: 'testpassord1', sha: 'f'.repeat(40), repo: 'evil/evil', command: 'rm -rf /' });
  assert.equal(ok.status, 200, ok.text);
  const req = JSON.parse(readFileSync(join(UPD, 'request.json'), 'utf8'));
  assert.deepEqual(Object.keys(req).sort(), ['at', 'id', 'requestedBy']);
  assert.ok(!JSON.stringify(req).includes('evil'));
  // Venter på updateren: queued + steg.
  const s = await TW('/api/system/update/status');
  assert.equal(s.body.state, 'queued');
  assert.equal(s.body.running, true);
  assert.deepEqual(s.body.steps.map((x) => x.key), ['download', 'backup', 'install', 'restart']);
  assert.equal(s.body.steps[0].state, 'active');
  assert.ok(s.body.pct > 0 && s.body.pct < 10);
});

test('status: steg og prosent følger updaterens tilstand', async () => {
  const req = JSON.parse(readFileSync(join(UPD, 'request.json'), 'utf8'));
  status({ id: req.id, state: 'building', step: 'Bygger ny versjon', startedAt: Date.now() });
  let s = (await A('/api/system/update/status')).body;
  assert.deepEqual(s.steps.map((x) => x.state), ['done', 'done', 'active', 'pending']);
  assert.equal(s.pct, 55);
  status({ id: req.id, state: 'restarting', step: 'Starter på nytt' });
  s = (await A('/api/system/update/status')).body;
  assert.deepEqual(s.steps.map((x) => x.state), ['done', 'done', 'done', 'active']);
  status({ id: req.id, state: 'done', step: 'Ferdig' });
  s = (await A('/api/system/update/status')).body;
  assert.equal(s.pct, 100);
  assert.ok(s.steps.every((x) => x.state === 'done'));
  assert.equal(s.running, false);
  status({ id: req.id, state: 'failed', step: 'Feilet', error: 'Bygget feilet. Den gamle versjonen kjører videre' });
  s = (await A('/api/system/update/status')).body;
  assert.equal(s.steps[2].state, 'failed');
  // Oversikten har også status med steg.
  assert.ok(Array.isArray((await A('/api/system/update')).body.status.steps));
});

test('rollback: action i request.json, aldri sha/repo; 409 uten tidligere versjon', async () => {
  heartbeat();
  status({ id: 'ferdig', state: 'done' });
  rmSync(join(UPD, 'request.json'), { force: true });
  rmSync(join(UPD, 'history.json'), { force: true });
  const none = await TW('/api/system/update/rollback', 'POST', { password: 'testpassord1' });
  assert.equal(none.status, 409);
  assert.equal((await A('/api/system/update')).body.rollback.available, false);
  writeFileSync(join(UPD, 'history.json'), JSON.stringify({ entries: [{ sha: SHA, version: '99.1.0', at: 2 }, { sha: 'b'.repeat(40), version: '2.3.1', at: 1 }] }));
  const o = (await A('/api/system/update')).body;
  assert.deepEqual(o.rollback, { available: true, version: '2.3.1' });
  assert.ok(!JSON.stringify(o.rollback).includes('bbbb'));
  assert.equal((await TR('/api/system/update/rollback', 'POST', { password: 'testpassord1' })).status, 403);
  assert.equal((await TW('/api/system/update/rollback', 'POST', {})).status, 403);
  assert.equal((await K('/api/system/update/rollback', 'POST', { password: 'kariPassord123' })).status, 403);
  const r = await TW('/api/system/update/rollback', 'POST', { password: 'testpassord1', sha: 'c'.repeat(40) });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.target, { version: '2.3.1' });
  assert.match(r.body.backup, /^pre-update-/);
  const req = JSON.parse(readFileSync(join(UPD, 'request.json'), 'utf8'));
  assert.deepEqual(Object.keys(req).sort(), ['action', 'at', 'id', 'requestedBy']);
  assert.equal(req.action, 'rollback');
  assert.ok(!JSON.stringify(req).includes('cccc'));
  assert.equal((await A('/api/system/update/status')).body.action, 'rollback');
});

test('brukervalg: auto_update av og notify_updates på som standard; validering', async () => {
  assert.deepEqual((await A('/api/system/update/settings')).body, { auto_update: false, notify_updates: true });
  assert.equal((await K('/api/system/update/settings')).status, 403);
  assert.equal((await TR('/api/system/update/settings', 'PUT', { auto_update: true })).status, 403);
  assert.equal((await A('/api/system/update/settings', 'PUT', { auto_update: 'ja' })).status, 400);
  assert.equal((await A('/api/system/update/settings', 'PUT', { annet: true })).status, 400);
  assert.deepEqual((await TW('/api/system/update/settings', 'PUT', { auto_update: true })).body, { auto_update: true, notify_updates: true });
});

test('varsel om ny versjon sendes én gang; auto-oppdatering 03:30 Oslo', async () => {
  kv.del(OWNER, 'update_notified');
  assert.equal(await su.checkAndNotify(), true);
  assert.equal(await su.checkAndNotify(), false, 'samme versjon varsles ikke igjen');
  await A('/api/system/update/settings', 'PUT', { notify_updates: false });
  kv.del(OWNER, 'update_notified');
  assert.equal(await su.checkAndNotify(), false);
  // Auto: 03:35 Oslo (vintertid UTC+1 / sommertid UTC+2). 19.10.2026 er sommertid → 01:35Z.
  heartbeat();
  status({ id: 'x', state: 'done' });
  rmSync(join(UPD, 'request.json'), { force: true });
  assert.equal(await su.autoUpdateTick(Date.parse('2026-10-19T00:35:00Z')), null, '02:35 er for tidlig');
  const id = await su.autoUpdateTick(Date.parse('2026-10-19T01:35:00Z'));
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(JSON.parse(readFileSync(join(UPD, 'request.json'), 'utf8')).requestedBy, 'auto');
  assert.equal(await su.autoUpdateTick(Date.parse('2026-10-19T01:36:00Z')), null, 'bare én gang per natt');
  await A('/api/system/update/settings', 'PUT', { auto_update: false, notify_updates: true });
});

/* ---------------- 2. ✦ AI-søk i innstillingene ---------------- */

test('GET /api/settings/index: statisk indeks med sti og ruter; admin-sider skjult for andre', async () => {
  const r = await A('/api/settings/index');
  assert.equal(r.status, 200);
  const bg = r.body.find((x) => x.id === 'utseende.bakgrunn');
  assert.equal(bg.path, 'Utseende → Bakgrunn');
  assert.deepEqual(bg.route, { web: '#/innstillinger/look/bg', mobile: '#/set/bakgrunn' });
  assert.ok(Array.isArray(bg.keywords) && bg.description);
  assert.ok(r.body.some((x) => x.id === 'system'));
  const k = (await K('/api/settings/index')).body;
  assert.ok(!k.some((x) => x.id === 'system' || x.id === 'backup' || x.id === 'domener'));
  assert.ok(k.some((x) => x.id === 'utseende.bakgrunn'));
  assert.equal((await TR('/api/settings/index')).status, 200);
  assert.equal((await client({})('/api/settings/index')).status, 401);
});

test('POST /api/settings/ask: lokal modell først, så Gemini (logges i ai_audit), så nøkkelord; bare spørsmål + indeks', async () => {
  const seen = [];
  ask._setAsk30(async (prompt, schema, { engine }) => {
    seen.push({ engine, prompt });
    if (engine === 'ollama') return { data: { answer: 'Under Utseende → Bakgrunn.', targetId: 'utseende.bakgrunn' }, provider: 'Ollama' };
    throw new Error('ikke brukt');
  });
  let r = await A('/api/settings/ask', 'POST', { q: 'hvor bytter jeg bakgrunnsbilde?' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.targetId, 'utseende.bakgrunn');
  assert.equal(r.body.mode, 'ai');
  assert.equal(r.body.answer, 'Under Utseende → Bakgrunn.');
  assert.deepEqual(seen.map((x) => x.engine), ['ollama']);
  // Ingen brukerdata i prompten: ikke brukernavn, navn eller e-post.
  assert.ok(!/sebastian|kari|per\.hemmelig|@/i.test(seen[0].prompt.replace(/«[^»]*»/, '')));
  const auditN = () => db.prepare("SELECT count(*) n FROM ai_audit WHERE purpose='settings'").get().n;
  const before = auditN();
  seen.length = 0;
  ask._setAsk30(async (prompt, schema, { engine }) => {
    seen.push({ engine });
    if (engine === 'ollama') throw new Error('Ollama kan ikke nås');
    return { data: { answer: 'Det ligger under Konto → Innlogging.', targetId: 'konto.2fa' }, provider: 'Gemini' };
  });
  r = await A('/api/settings/ask', 'POST', { q: 'slå på tofaktor' });
  assert.deepEqual(seen.map((x) => x.engine), ['ollama', 'gemini']);
  assert.equal(r.body.targetId, 'konto.2fa');
  assert.equal(auditN(), before + 1);
  // Ukjent id fra modellen tas ikke med.
  ask._setAsk30(async () => ({ data: { answer: 'Prøv System.', targetId: 'finnes-ikke' } }));
  r = await A('/api/settings/ask', 'POST', { q: 'noe rart' });
  assert.equal(r.body.targetId, null);
  // Begge motorer feiler → nøkkelordmatch.
  ask._setAsk30(async () => { throw new Error('nede'); });
  r = await A('/api/settings/ask', 'POST', { q: 'hvor endrer jeg passordet' });
  assert.equal(r.body.mode, 'text');
  assert.equal(r.body.targetId, 'konto.passord');
  assert.match(r.body.answer, /Konto → Innlogging/);
  // Kari får ikke admin-sider som svar.
  r = await K('/api/settings/ask', 'POST', { q: 'oppdatering ny versjon' });
  assert.notEqual(r.body.targetId, 'system.oppdatering');
  assert.equal((await A('/api/settings/ask', 'POST', { q: '' })).status, 400);
  ask._setAsk30(null);
});

/* ---------------- 3. Personlige layout-felt ---------------- */

test('profile_menu og finance_more_hidden lagres per bruker', async () => {
  let l = (await A('/api/me/layout')).body;
  assert.deepEqual(l.profile_menu, { order: ['innstillinger', 'tema', 'sprak', 'sokebar', 'nyhetslinje', 'tilpass', 'cv', 'las'], hidden: ['sokebar', 'nyhetslinje', 'las'] });
  assert.deepEqual(l.finance_more_hidden, []);
  assert.equal((await A('/api/me/layout', 'PUT', { profile_menu: { order: ['logg-ut'] } })).status, 400);
  assert.equal((await A('/api/me/layout', 'PUT', { profile_menu: { hidden: ['cv', 'cv'] } })).status, 400);
  assert.equal((await A('/api/me/layout', 'PUT', { finance_more_hidden: ['innst'] })).status, 400, 'Innstillinger kan ikke skjules');
  const r = await TW('/api/me/layout', 'PUT', { profile_menu: { hidden: ['cv'] }, finance_more_hidden: ['aksjer', 'rapp'] });
  assert.equal(r.status, 200, r.text);
  l = (await A('/api/me/layout')).body;
  assert.deepEqual(l.profile_menu.hidden, ['cv']);
  assert.equal(l.profile_menu.order.length, 8, 'order beholdes');
  assert.deepEqual(l.finance_more_hidden, ['aksjer', 'rapp']);
  assert.deepEqual((await K('/api/me/layout')).body.finance_more_hidden, [], 'per bruker');
});

/* ---------------- 4. Cloudflare-tokentest ---------------- */

test('POST /api/domains/token/verify: verify + fem tillatelser (mocket), bare admin', async () => {
  const calls = [];
  dom._setCfFetch(async (url, init) => {
    const u = String(url); calls.push({ u, auth: init?.headers?.Authorization });
    const j = (o, st = 200) => new Response(JSON.stringify(o), { status: st });
    if (u.endsWith('/user/tokens/verify')) return j({ success: true, result: { id: 't', status: 'active' } });
    if (u.includes('/zones?')) return j({ success: true, result: [{ id: 'z1', name: 'kristo.no', account: { id: 'acc1' } }] });
    if (u.includes('/dns_records')) return j({ success: true, result: [] });
    if (u.endsWith('/graphql')) return j({ data: { viewer: { zones: [] } } });
    if (u.includes('/firewall/')) return j({ success: false, errors: [{ message: 'Authentication error' }] }, 403);
    if (u.includes('/registrar/')) return j({ success: true, result: [] });
    return j({ success: false }, 404);
  });
  const r = await A('/api/domains/token/verify', 'POST', { token: 'abc123', domain: 'home.kristo.no' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.active, true);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.total, 5);
  assert.equal(r.body.okCount, 4);
  assert.deepEqual(r.body.permissions.map((p) => [p.name, p.ok]), [['Zone · Zone', true], ['Zone · DNS', true], ['Zone · Analytics', true], ['Zone · Firewall Services', false], ['Account · Registrar: Domains', true]]);
  assert.match(r.body.message, /Firewall/);
  assert.ok(calls.every((c) => c.auth === 'Bearer abc123'));
  assert.ok(!r.text.includes('abc123'), 'tokenet sendes ikke tilbake');
  // Tomt token og ingen standard-token: 400.
  assert.equal((await A('/api/domains/token/verify', 'POST', {})).status, 400);
  assert.equal((await K('/api/domains/token/verify', 'POST', { token: 'x' })).status, 403);
  // Ugyldig token.
  dom._setCfFetch(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'Invalid API Token' }] }), { status: 401 }));
  const bad = await A('/api/domains/token/verify', 'POST', { token: 'feil' });
  assert.equal(bad.body.active, false);
  assert.equal(bad.body.okCount, 0);
  dom._setCfFetch(null);
});

/* ---------------- 5. Boliger ---------------- */

test('Boliger: shareable uten e-post/brukernavn, del med flere + push, rediger utgift med historikk', async () => {
  const f = (await A('/finans/api/folders', 'POST', { name: 'Hytta', type: 'Hytte' })).body;
  assert.ok(f.id);
  let s = await A(`/finans/api/users/shareable?home=${f.id}`);
  assert.equal(s.status, 200, s.text);
  assert.deepEqual(s.body.map((u) => u.name).sort(), ['Kari', 'Per']);
  for (const u of s.body) {
    assert.deepEqual(Object.keys(u).filter((k) => !['id', 'name', 'initial', 'color', 'avatarUrl', 'relation'].includes(k)), []);
    assert.match(u.color, /^#[0-9a-f]{6}$/);
    assert.equal(u.initial, u.name[0]);
  }
  assert.ok(!s.text.includes('per.hemmelig') && !s.text.includes('@'));
  assert.equal((await K(`/finans/api/users/shareable?home=${f.id}`)).status, 404, 'ikke medlem');
  // Alias under /api/homes.
  assert.equal((await A(`/api/homes/${f.id}/shareable`)).body.length, 2);
  const shared = await A(`/api/homes/${f.id}/members`, 'POST', { userIds: [kari.id, per.id], role: 'Kan laste opp' });
  assert.equal(shared.status, 200, shared.text);
  assert.equal(shared.body.members.filter((m) => m.login).length, 3);
  assert.equal(shared.body.members.find((m) => m.userId === kari.id).role, 'editor');
  assert.deepEqual((await A(`/finans/api/users/shareable?home=${f.id}`)).body, []);
  assert.equal((await K(`/finans/api/folders/${f.id}/members`, 'POST', { userIds: [per.id] })).status, 403, 'bare eier deler');
  assert.equal((await A(`/finans/api/folders/${f.id}/members`, 'POST', { userIds: ['finnes-ikke'] })).status, 400);
  // Rediger utgift.
  const withE = (await A(`/finans/api/folders/${f.id}/entries`, 'POST', { description: 'Biltema', amount: 199, date: '2026-10-01' })).body;
  const e = withE.entries[0];
  const p = await K(`/api/homes/${f.id}/expenses/${e.id}`, 'PATCH', { merchant: 'Biltema Alnabru', amount: '249,50', date: '2026-10-02' });
  assert.equal(p.status, 200, p.text);
  const e2 = p.body.entries.find((x) => x.id === e.id);
  assert.deepEqual({ d: e2.description, a: e2.amount, dt: e2.date, by: e2.editedBy }, { d: 'Biltema Alnabru', a: 249.5, dt: '2026-10-02', by: 'Kari' });
  const h = await A(`/finans/api/folders/${f.id}/entries/${e.id}/history`);
  assert.equal(h.body.length, 1);
  assert.equal(h.body[0].by, 'Kari');
  assert.deepEqual(h.body[0].changes.amount, { from: 199, to: 249.5 });
  assert.equal((await K(`/finans/api/folders/${f.id}/entries/${e.id}`, 'PATCH', { amount: 'mye' })).status, 400);
  assert.equal((await K(`/finans/api/folders/${f.id}/entries/${e.id}`, 'PATCH', { date: '2026-13-45' })).status, 400);
  assert.equal((await K(`/finans/api/folders/${f.id}/entries/${e.id}`, 'PATCH', { merchant: '  ' })).status, 400);
});

/* ---------------- 6. Kvitteringsmarkering ---------------- */

test('validate beholder gyldig bbox (prosent) og godtar text/price', () => {
  const d = validate({ merchant: 'Rema', date: '2026-10-01', total: 50, confidence: {}, lines: [
    { description: 'TOMATER CHERRY', amount: 24.9, bbox: [5, 30.5, 90, 4] }, { text: 'AGURK', price: 15, bbox: [0.05, 0.4, 0.9, 0.04] }, { description: 'MELK', amount: 10, bbox: [1, 2] }] });
  assert.deepEqual(d.lines[0].bbox, [5, 30.5, 90, 4]);
  assert.equal(d.lines[1].description, 'AGURK');
  assert.deepEqual(d.lines[1].bbox, [5, 40, 90, 4], '0–1 skaleres til prosent');
  assert.equal(d.lines[2].bbox, undefined);
});

test('søk gir txId, receiptId, lineIndex[] og matchedText; ?hl= og /forslag; les på nytt', async () => {
  const now = Date.now();
  const tx = db.prepare("INSERT INTO fh_transactions(date,amount,description,merchant,source,created,user_id) VALUES('2026-10-10',-5000,'REMA 1000 ALNA','Rema 1000','csv',?,?) RETURNING id").get(now, OWNER).id;
  const ex = { merchant: 'Rema 1000', date: '2026-10-10', total: 50, lines: [{ description: 'MELK 1L', amount: 20 }, { description: 'Agurk', amount: 5.1 }, { description: 'TOMATER CHERRY', amount: 24.9, bbox: [4, 50, 92, 5] }] };
  db.prepare("INSERT INTO fh_receipts(id,status,extraction,merchant,date,total,transaction_id,created,user_id,file,mime) VALUES('rc30','booked',?,?,?,?,?,?,?,'receipts/rc30.jpg','image/jpeg')")
    .run(JSON.stringify(ex), 'Rema 1000', '2026-10-10', 5000, tx, now, OWNER);
  const s = await A('/finans/api/search?q=tomat');
  assert.equal(s.status, 200, s.text);
  const hit = s.body.hits.find((h) => h.receiptId === 'rc30');
  assert.ok(hit, JSON.stringify(s.body.hits));
  assert.equal(hit.txId, tx);
  assert.deepEqual(hit.lineIndex, [2]);
  assert.equal(hit.matchedText, 'TOMATER');
  // Aksenter og store bokstaver: «AGÜRK» finner «Agurk».
  const s2 = await A(`/finans/api/search?q=${encodeURIComponent('AGÜRK')}`);
  assert.deepEqual(s2.body.hits.find((h) => h.receiptId === 'rc30')?.lineIndex, [1]);
  // Transaksjonstreff («rema») peker på kvitteringen, uten linjer.
  const s3 = await A('/finans/api/search?q=rema');
  const t3 = s3.body.hits.find((h) => h.txId === tx);
  assert.equal(t3.receiptId, 'rc30');
  assert.deepEqual(t3.lineIndex, []);
  // Transaksjonsdetalj med ?hl=.
  const d = await A(`/finans/api/transactions/${tx}?hl=tomat`);
  assert.equal(d.status, 200, d.text);
  assert.deepEqual(d.body.receipt.highlight, { query: 'tomat', lineIndex: [2], matchedText: 'TOMATER', hasBoxes: true });
  assert.deepEqual(d.body.receipt.lines[2].bbox, [4, 50, 92, 5]);
  assert.equal(d.body.receipt.lines[0].bbox, undefined);
  // Forslag for varer.
  const fo = await A('/finans/api/forslag?q=tomat');
  const v = fo.body.find((x) => x.type === 'vare');
  assert.deepEqual({ r: v.receiptId, t: v.txId, l: v.lineIndex }, { r: 'rc30', t: tx, l: [2] });
  // Andre brukere ser ikke kvitteringen.
  assert.ok(!(await K('/finans/api/search?q=tomat')).body.hits.some((h) => h.receiptId === 'rc30'));
  // Les på nytt: bare linjene (med bbox) byttes, status og beløp røres ikke.
  mkdirSync(join(DIR, 'receipts', 'receipts'), { recursive: true });
  writeFileSync(join(DIR, 'receipts', 'receipts', 'rc30.jpg'), 'jpeg');
  fr._setReread(async () => ({ data: { lines: [{ description: 'MELK 1L', amount: 20, bbox: [4, 30, 92, 5] }, { description: 'Agurk', amount: 5.1, bbox: [4, 40, 92, 5] }, { description: 'TOMATER CHERRY', amount: 24.9, bbox: [4, 50, 92, 5] }] } }));
  const rr = await A('/finans/api/receipts/rc30/reread', 'POST', {});
  assert.equal(rr.status, 202, rr.text);
  const after = (await A('/finans/api/receipts/rc30')).body;
  assert.equal(after.status, 'booked');
  assert.equal(after.total, 50);
  assert.equal(after.hasBoxes, true);
  assert.deepEqual(after.lines.map((l) => l.bbox?.[1]), [30, 40, 50]);
  assert.equal((await K('/finans/api/receipts/rc30/reread', 'POST', {})).status, 404);
  fr._setReread(null);
});

/* ---------------- 7. Logoer ---------------- */

test('Yr- og Storm-logo: 256×256 PNG med gjennomsiktige hjørner, serveres fra /assets/brands', async () => {
  for (const f of ['yr', 'storm']) {
    const b = readFileSync(`public/assets/brands/${f}.png`);
    assert.equal(b.subarray(1, 4).toString(), 'PNG');
    assert.equal(b.readUInt32BE(16), 256);
    assert.equal(b.readUInt32BE(20), 256);
    assert.equal(b[25], 6, 'RGBA (fargetype 6)');
  }
  const r = await app.request('/assets/brands/yr.png');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /image\/png/);
});
