// Prompt 36 (SERVER36): felles matplan, oppstartsstatus, profilbilde, dashboard-layout, vær for alle steder, Domener i ett
// kall + ikke-blokkerende Glimt-oppsummering, spørsmål vs. handling i Glimt (dagslys lokalt) og endringsnotater/tidligere versjoner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p36-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-36s';
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
const mat = await import('../server/mat.js');
const boot = await import('../server/boot36.js');
const su = await import('../server/system-update.js');
const assist = await import('../server/assist.js');
const sun = await import('../server/sun36.js');
const api36 = await import('../server/api36.js');
const qt = await import('../public/js/quick-time.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body, extra = {}) => {
  const raw = body instanceof Uint8Array;
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}), ...extra }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* binær */ }
  return { status: r.status, body: json, buf, headers: r.headers, text: buf.toString('utf8') };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'nina', password: 'ninaPassord123', role: 'bruker', name: 'Nina' })).status, 200);
const N = client({ cookie: await login('nina', 'ninaPassord123') });
const anon = client({});
const ninaId = db.prepare("SELECT id FROM users WHERE username='nina'").pluck().get();

/* ---------------- Matplan felles ---------------- */

test('Matplan er felles: begge ser samme plan, updatedBy/updatedAt/sharedNote, optimistisk lås gir toast', async () => {
  const a = await A('/api/matplan/week');
  assert.equal(a.status, 200);
  assert.equal(a.body.shared, true);
  assert.equal(a.body.canShare, false);
  assert.match(a.body.sharedNote, /^Felles for husstanden/);
  const n = await N('/api/matplan/week');
  assert.deepEqual(n.body.dishes.map((d) => d.id), a.body.dishes.map((d) => d.id), 'samme retter');
  // Nina legger til en rett på tirsdag – Sebastian ser den med en gang.
  const tue = a.body.days[1].date;
  const add = await N('/api/matplan/dishes', 'POST', { name: 'Ninas suppe', date: tue });
  assert.equal(add.status, 201, add.text);
  const a2 = await A(`/api/matplan/week?start=${a.body.start}`);
  assert.equal(a2.body.days[1].name, 'Ninas suppe');
  assert.equal(a2.body.days[1].updatedBy, 'Nina');
  assert.equal(a2.body.updatedBy, 'Nina');
  assert.match(a2.body.sharedNote, /^Felles for husstanden · Endret av Nina \d\d\.\d\d$/);
  assert.ok(a2.body.updatedAt);
  // Sebastian redigerer med en gammel versjon → siste vinner, men svaret sier «Oppdatert av Nina».
  const v = a2.body.days[1].version;
  const patch = await A(`/api/matplan/day/${tue}`, 'PATCH', { cook: 'Sebastian', version: v - 1 });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.conflict, true);
  assert.equal(patch.body.toast, 'Oppdatert av Nina');
  assert.equal(patch.body.days[1].cook, 'Sebastian');
  assert.equal(patch.body.days[1].version, v + 1);
  // Uten versjon/ny versjon: ingen konflikt.
  assert.equal((await A(`/api/matplan/day/${tue}`, 'PATCH', { cook: 'Ingrid', version: v + 1 })).body.conflict, undefined);
  // Faste dager er like for alle.
  assert.deepEqual((await N('/api/matplan/week')).body.fixed, (await A('/api/matplan/week')).body.fixed);
  assert.equal(mat.sharedNote(null, null), 'Felles for husstanden');
});

test('Sammenslåing av gamle private planer: dedup på navn, konflikt → historikk, lenker følger med, originalen beholdes', async () => {
  const s = kv.get(OWNER, 'mat');
  const taco = s.dishes.find((d) => d.name === 'Taco');
  const date = '2026-11-03';
  s.plan[date] = { dish: taco.id, cook: 'Sebastian', by: 'user', at: 1000 };
  kv.set(OWNER, 'mat', s);
  // En privat plan fra før prompt 36 (Nina), med en lik rett (taco), en ny rett, en lenke og en konflikt samme dag.
  const priv = { v: 2, dishes: [{ id: 'ninataco', name: 'TACO', src: 'own', ing: ['Lefser'], steps: ['Stek'], cost: 0 }, { id: 'ninalaks', name: 'Ninas laks', src: 'own', ing: [], steps: [], cost: 150 }],
    cooks: [{ name: 'Nina', best: ['ninalaks'] }], plan: { [date]: { dish: 'ninalaks', cook: 'Nina', by: 'user', at: 2000 }, '2026-11-04': { dish: 'ninataco', cook: 'Nina', by: 'user' } },
    fixed: {}, fixedDb: true, foldersInit: true, auto: false, lastAuto: '', shop: {}, calKey: 'ninas-gamle-kalender-nokkel-1' };
  kv.set(ninaId, 'mat', priv);
  db.prepare("INSERT INTO dish_link(id, dish_id, title, url, kind, created, user_id) VALUES('lnk36', 'ninataco', 'Tacooppskrift', 'https://example.no/taco', 'link', 1, ?)").run(ninaId);
  const w = await A('/api/matplan/week?start=2026-11-02');
  assert.equal(w.status, 200);
  const names = w.body.dishes.map((d) => d.name);
  assert.equal(names.filter((x) => x.toLowerCase() === 'taco').length, 1, 'taco deduplisert');
  assert.ok(names.includes('Ninas laks'));
  assert.equal(w.body.days[1].name, 'Ninas laks', 'nyeste endring vinner');
  assert.equal(w.body.days[2].name, 'Taco', 'Ninas taco peker på husstandens taco');
  const h = kv.get(OWNER, 'mat').history;
  assert.ok(h.some((x) => x.date === date && x.name === 'Taco'), 'taperen ligger i historikken');
  assert.ok(w.body.dishes.find((d) => d.name === 'Taco').links.some((l) => l.url === 'https://example.no/taco'), 'lenken følger med');
  assert.deepEqual(kv.get(ninaId, 'mat_pre36'), priv, 'originalen beholdes');
  assert.equal(kv.get(ninaId, 'mat'), null);
  assert.ok(w.body.chefs.some((c) => c.name === 'Nina'));
  const log = kv.get(OWNER, 'mat_merge36');
  assert.equal(log.at(-1).user, ninaId);
  assert.deepEqual(log.at(-1).dishesMerged, ['TACO']);
  // Den gamle kalendernøkkelen virker fortsatt.
  assert.equal((await app.request('/mat/calendar.ics?key=ninas-gamle-kalender-nokkel-1')).status, 200);
  assert.equal(mat.mergeHousehold36(), null, 'idempotent');
});

/* ---------------- Oppstartsstatus og starting.html ---------------- */

test('GET /api/health: oppstartsstatus uten innlogging, flettes inn for innloggede; starting.html med egen CSP', async () => {
  const h = await anon('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.ready, true);
  assert.deepEqual(h.body.steps.map((s) => s.id), ['db', 'migrate', 'api', 'ai', 'integrations']);
  assert.ok(h.body.steps.every((s) => s.status === 'ok' && typeof s.label === 'string'));
  assert.match(h.body.version, /^\d+\.\d+\.\d+$/);
  assert.equal(h.headers.get('cache-control'), 'no-store');
  const b = await A('/api/health?boot=1');
  assert.deepEqual(Object.keys(b.body).sort(), ['ready', 'startedAt', 'steps', 'uptimeMs', 'version']);
  const full = await A('/api/health');
  assert.ok('services' in full.body || 'ready' in full.body);
  assert.equal(full.body.ready, true);
  const p = await anon('/starting.html');
  assert.equal(p.status, 200);
  assert.match(p.text, /STARTER OPP/);
  assert.match(p.text, /\/api\/health\?boot=1/);
  assert.ok(!/<script[^>]+src=/.test(p.text), 'ingen eksterne skript');
  assert.match(p.headers.get('content-security-policy'), /script-src 'unsafe-inline'/);
});

test('boot36: steg går wait → run → ok med ms, ready når alle er ok', () => {
  boot._resetBoot();
  assert.equal(boot.bootState().ready, false);
  assert.ok(boot.bootState().steps.every((s) => s.status === 'wait'));
  boot.bootStep('db', 'run', 1000); boot.bootStep('db', 'ok', 1500);
  let st = boot.bootState().steps;
  assert.deepEqual([st[0].status, st[0].ms, st[1].status], ['ok', 500, 'run']);
  for (const id of ['migrate', 'api', 'ai', 'integrations']) boot.bootStep(id, 'ok');
  assert.equal(boot.bootState().ready, true);
});

/* ---------------- Profilbilde ---------------- */

const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(24, 1)]);
test('PUT /api/me/avatar (rå WebP) → {url:/api/me/avatar?v=<hash>}, GET gir bildet, DELETE fjerner; POST virker fortsatt', async () => {
  const r = await A('/api/me/avatar', 'PUT', new Uint8Array(WEBP), { 'content-type': 'image/webp' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.url, /^\/api\/me\/avatar\?v=[0-9a-f]{12}$/);
  assert.equal(r.body.avatarUrl, r.body.url);
  const g = await A(r.body.url);
  assert.equal(g.status, 200);
  assert.equal(g.headers.get('content-type'), 'image/webp');
  assert.ok(g.buf.equals(WEBP));
  assert.equal((await A('/api/me/avatar', 'PUT', new Uint8Array(Buffer.from('ikke et bilde')), { 'content-type': 'image/webp' })).status, 400);
  const j = await A('/api/me/avatar', 'PUT', { image: `data:image/webp;base64,${WEBP.toString('base64')}` });
  assert.equal(j.status, 200);
  const fd = new FormData(); fd.append('file', new File([WEBP], 'a.webp', { type: 'image/webp' }));
  const p = await app.request('/api/me/avatar', { method: 'POST', headers: { cookie: (await login('sebastian', 'testpassord1')) }, body: fd });
  assert.equal(p.status, 200);
  const d = await A('/api/me/avatar', 'DELETE');
  assert.equal(d.body.avatarUrl, null);
  assert.equal(d.body.url, null);
  assert.equal((await A('/api/me/avatar')).status, 404);
});

/* ---------------- Dashboard-layout ---------------- */

test('GET/PUT /api/dashboard/layout per bruker og enhet, validert', async () => {
  const e = await A('/api/dashboard/layout?device=web');
  assert.equal(e.status, 200);
  assert.deepEqual([e.body.cols, e.body.items.length, e.body.empty], [12, 0, true]);
  const body = { device: 'web', cols: 8, gap: 16, snap: true, items: [{ id: 'weather', x: 0, y: 0, w: 4, h: 3 }, { id: 'brief', x: 4, y: 0, w: 4, h: 2, hidden: true, auto: true }], v: 1, alt: { cur: { cols: 12, items: [{ id: 'weather', x: 0, y: 0, w: 6, h: 3 }] } } };
  const p = await A('/api/dashboard/layout', 'PUT', body);
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.cols, 8);
  assert.deepEqual(p.body.items[1], { id: 'brief', x: 4, y: 0, w: 4, h: 2, auto: true, hidden: true });
  assert.equal(p.body.alt.cur.items[0].w, 6);
  const g = await A('/api/dashboard/layout?device=web');
  assert.deepEqual(g.body.items, p.body.items);
  assert.equal((await N('/api/dashboard/layout?device=web')).body.items.length, 0, 'per bruker');
  assert.equal((await A('/api/dashboard/layout?device=mobile')).body.items.length, 0, 'per enhet');
  assert.equal((await A('/api/dashboard/layout', 'PUT', { cols: 5 })).status, 400);
  assert.equal((await A('/api/dashboard/layout', 'PUT', { cols: 4, items: [{ id: 'x', x: 3, y: 0, w: 2, h: 1 }] })).status, 400, 'utenfor kolonnene');
  assert.equal((await A('/api/dashboard/layout', 'PUT', { cols: 4, items: [{ id: 'x', x: 0, y: 0, w: 1, h: 1 }, { id: 'x', x: 1, y: 0, w: 1, h: 1 }] })).status, 400, 'dobbel id');
  assert.equal((await anon('/api/dashboard/layout')).status, 401);
});

/* ---------------- Vær for alle steder ---------------- */

test('GET /api/weather/places/summary: alle lagrede steder i ett kall med temperatur, H/L, beskrivelse og kortfarge', async () => {
  const r = await A('/api/weather/places/summary');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.places.map((p) => p.id), ['oslo', 'bergen', 'trondheim', 'tromso']);
  for (const p of r.body.places) {
    assert.equal(typeof p.temp, 'number');
    assert.ok(p.hi >= p.lo);
    assert.equal(typeof p.text, 'string');
    assert.ok(api36.CARD_BG[p.kind]);
    assert.equal(p.cardBg, api36.CARD_BG[p.kind]);
  }
  // Ren funksjon: regnsjanse ≥ 60 % de neste 4 dagene, og lokal tid når tidssonen er en annen.
  const row = api36.summaryRow({ id: 'ny', name: 'New York', lat: 40.7, lon: -74 }, { current: { temperature_2m: 12.4, weather_code: 61, is_day: 1 }, timezone: 'America/New_York', utc_offset_seconds: -4 * 3600,
    daily: { time: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'], temperature_2m_max: [14, 15, 16, 17], temperature_2m_min: [8, 9, 9, 10], precipitation_probability_max: [10, 20, 30, 85] } }, Date.parse('2026-10-19T19:49:00Z'));
  assert.equal(row.temp, 12);
  assert.equal(row.rainNote, '85 % sjanse for regn på torsdag');
  assert.equal(row.localTime, '15:49');
  assert.equal(row.otherTz, true);
  assert.equal(row.kind, 'rain');
});

/* ---------------- Domener ---------------- */

test('GET /api/domains/overview: alt i ett svar (KPI-er, grafer, land, sider, oppetid, per domene), bare admin', async () => {
  const r = await A('/api/domains/overview?per=24t');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.selected, '*');
  assert.ok(r.body.kpi.requests > 0 && r.body.kpi.visitors > 0);
  assert.ok(r.body.series.length > 0);
  assert.ok(r.body.countries.length > 0);
  assert.ok(r.body.topPages.length > 0);
  assert.equal(r.body.uptime.days.length, 90);
  assert.equal(r.body.perDomain.length, r.body.domains.length);
  assert.equal(r.body.summaryUrl, '/api/domains/*/summary');
  const one = await A('/api/domains/overview?per=7d&domain=kristo.no');
  assert.equal(one.body.selected, 'kristo.no');
  assert.equal(one.body.range, '7d');
  assert.ok(one.body.detail);
  assert.equal((await A('/api/domains/overview?domain=finnes.ikke')).status, 404);
  assert.equal((await N('/api/domains/overview')).status, 403);
  // Andre kall er fra cache (5 min).
  const t0 = Date.now(); await A('/api/domains/overview?per=24t'); assert.ok(Date.now() - t0 < 200);
});

test('Glimt-oppsummeringen blokkerer aldri: dagens fra cache, ellers regler/siste med pending', async () => {
  const dg = await import('../server/domains-glimt.js');
  let release;
  dg._setSummaryLlm(() => new Promise((r) => { release = () => r('{"head":"AI-hode","pts":[{"t":"punkt","tone":"pos"}]}'); }));
  const t0 = Date.now();
  const s = await A('/api/domains/kristo.no/summary');
  assert.ok(Date.now() - t0 < 1500, 'svarer raskt');
  assert.equal(s.status, 200);
  assert.equal(s.body.pending, true);
  assert.ok(s.body.head);
  release();
  await new Promise((r) => setTimeout(r, 50));
  const s2 = await A('/api/domains/kristo.no/summary');
  assert.equal(s2.body.head, 'AI-hode');
  assert.equal(s2.body.pending, undefined);
  assert.equal((await A('/api/domains/overview?domain=kristo.no&per=30d')).body.summary.head, 'AI-hode');
  dg._setSummaryLlm(null);
});

/* ---------------- Glimt: spørsmål vs. handling ---------------- */

test('spørsmålsvakt: spørsmål med dato er ikke en avtale, «timer/timeplan» er ikke «time»', async () => {
  const T = '2026-10-19';
  const cases = [
    ['spørsmål, hvor mange timer med dagslys er det den 29.06.2027', 'sun.daylight', 'question'],
    ['når er neste frisørtime?', 'calendar.next', 'question'],
    ['hva skjer 25.10?', 'calendar.day', 'question'],
    ['frisør 14.30 25.10', 'appointment.create', 'action'],
    ['legg til tannlege 12.11 kl 9', 'appointment.create', 'action'],
    ['Frisør time hos Nina 14.30 25.10', 'appointment.create', 'action'],
    ['hvor mange timer jobbet jeg 25.10', 'llm', 'question'],
    ['hva blir været i morgen', 'weather', 'question'],
  ];
  for (const [q, intent, kind] of cases) {
    assert.equal(assist.detectIntent(q, T), intent, q);
    assert.equal(assist.classifyLocal(q, assist.detectIntent(q, T)).kind, kind, q);
  }
  assert.equal(qt.parseQuick('3 timer trening 25.10', T).isAppointment, false);
  assert.equal(qt.parseQuick('timeplan 25.10', T).isAppointment, false);
  assert.equal(qt.parseQuick('time 25.10 kl 10', T).isAppointment, true);
  // Uklart → kort LLM-klassifisering (maks 300 ms); uten svar brukes reglene.
  assist._setClassifyLlm(() => '{"type":"action"}');
  assert.equal((await assist.classify(OWNER, 'melk og brød')).kind, 'action');
  assist._setClassifyLlm(() => new Promise(() => {}));
  const t0 = Date.now();
  const slow = await assist.classify(OWNER, 'melk og brød');
  assert.ok(Date.now() - t0 < 600);
  assert.deepEqual([slow.kind, slow.via], ['question', 'regler']);
  assist._setClassifyLlm(null);
  const c = await A('/api/assist/classify', 'POST', { q: 'Frisør time hos Nina 14.30 25.10' });
  assert.deepEqual([c.body.kind, c.body.surface], ['action', 'pill']);
  assert.deepEqual([(await A('/api/assist/classify', 'POST', { q: 'Når er neste frisørtime?' })).body.surface], ['inline']);
});

test('dagslys for dato og sted lokalt, med Åpne Vær', async () => {
  const d = sun.daylight('2027-06-29');
  assert.match(d.sunrise, /^03:5\d$/);
  assert.match(d.sunset, /^22:4\d$/);
  assert.ok(d.daylightMin > 18 * 60 + 30 && d.daylightMin < 18 * 60 + 55, String(d.daylightMin));
  assert.match(d.text, /^29\. juni 2027 i Oslo: soloppgang 03:5\d, solnedgang 22:4\d, \*\*18 t \d+ min dagslys\*\*\.$/);
  assert.equal(sun.daylight('2026-12-24', { name: 'Tromsø', lat: 69.6492, lon: 18.9553 }).polar, 'mørketid');
  assert.equal(sun.daylight('2027-06-21', { name: 'Tromsø', lat: 69.6492, lon: 18.9553 }).polar, 'midnattssol');
  const r = await A('/api/assist', 'POST', { q: 'spørsmål, hvor mange timer med dagslys er det den 29.06.2027' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.intent, 'sun.daylight');
  assert.equal(r.body.kind, 'question');
  assert.equal(r.body.surface, 'inline');
  assert.equal(r.body.open.route, 'vaer');
  assert.equal(r.body.card.k, 'sun');
  assert.ok(!r.body.quickJobId, 'ingen avtale');
  const t = await A('/api/assist', 'POST', { q: 'når går sola ned 24.12 i tromsø' });
  assert.match(t.body.text, /Tromsø: \*\*mørketid\*\*/);
});

/* ---------------- Endringsnotater og tidligere versjoner ---------------- */

test('CHANGELOG: ## [x], ## x, ## vx – dato; underpunkter flates ut; tomme punkter hoppes over', () => {
  const s = su.parseChangelog('# Endringslogg\n\n## v4.31.0 – 20.10.2026\n- **Kalender:**\n- **Glimt:**\n  - Svarboble.\n- **Backup** virker.\n  - Undermapper\n  - \n- \n\n## 4.30.0\n- Ny\n\n## [4.29.0] - 2026-10-19 · tittel\n- Gammel\n');
  assert.deepEqual(s.map((x) => x.version), ['4.31.0', '4.30.0', '4.29.0']);
  assert.equal(s[0].date, '20.10.2026');
  assert.deepEqual(s[0].items, ['Glimt: Svarboble.', 'Backup virker.', 'Backup: Undermapper']);
  assert.equal(s[2].title, 'tittel');
  assert.deepEqual(su.commitNotes(['feat: Ny side', 'chore: deps', 'ci: bygg', 'Merge pull request #1', 'Fiks backup\n\nlang tekst']), ['feat: Ny side', 'Fiks backup']);
  assert.deepEqual(su.releaseBodyNotes('## Nytt\n- **A** ny\n- \n* B'), ['A ny', 'B']);
});

test('GET /api/system/version: notater for den NYE versjonen (fallback commits når seksjonen mangler), og /api/system/changelog', async () => {
  const UPD = su._paths.UPD;
  mkdirSync(UPD, { recursive: true });
  const own = readFileSync('CHANGELOG.md', 'utf8').match(/^## \[(\d+\.\d+\.\d+)\]/m)[1];
  const SHA_OLD = 'a'.repeat(40), SHA_NEW = 'b'.repeat(40);
  writeFileSync(join(UPD, 'installed.json'), JSON.stringify({ sha: SHA_OLD, version: own, at: Date.parse('2026-10-19T19:40:00Z') }));
  writeFileSync(join(UPD, 'history.json'), JSON.stringify({ entries: [{ sha: SHA_OLD, version: own, at: Date.parse('2026-10-19T19:40:00Z') }] }));
  // Samme versjonsnummer på main, men ny commit og ingen ny seksjon → notatene genereres fra commits.
  const local = readFileSync('CHANGELOG.md', 'utf8');
  su._setFetch(async (url) => {
    if (url.includes('/commits/')) return new Response(JSON.stringify({ sha: SHA_NEW, commit: { message: 'Backup: verifisering', committer: { date: '2026-10-20T10:00:00Z' } } }), { status: 200 });
    if (url.endsWith('/CHANGELOG.md')) return new Response(local, { status: 200 });
    if (url.includes('/compare/')) return new Response(JSON.stringify({ commits: [{ commit: { message: 'Mat: felles matplan' } }, { commit: { message: 'chore: deps' } }, { commit: { message: 'Backup: verifisering' } }] }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
  const v = await A('/api/system/version?force=1');
  assert.equal(v.status, 200, v.text);
  assert.equal(v.body.name, 'Nordlys OS');
  assert.equal(v.body.codename, 'Nordlys');
  assert.equal(v.body.tagline, 'Lys i mørket, kjørt hjemme.');
  assert.ok('sizeBytes' in v.body);
  assert.equal(v.body.updateAvailable, true);
  assert.deepEqual(v.body.notes, ['Backup: verifisering', 'Mat: felles matplan']);
  assert.equal(v.body.notesSource, 'commits');
  assert.equal(v.body.notesLabel, 'Generert fra commits');
  // Ny versjon med egen seksjon → notatene fra den nye CHANGELOG-en.
  su._setFetch(async (url) => {
    if (url.includes('/commits/')) return new Response(JSON.stringify({ sha: 'c'.repeat(40), commit: { message: 'x' } }), { status: 200 });
    if (url.endsWith('/CHANGELOG.md')) return new Response(`# Endringslogg\n\n## v99.0.0 – 21.10.2026\n- **Kalender:**\n- Ny ting\n\n${local.replace(/^# Endringslogg/, '')}`, { status: 200 });
    return new Response('{}', { status: 404 });
  });
  const v2 = await A('/api/system/version?force=1');
  assert.deepEqual(v2.body.notes, ['Ny ting']);
  assert.equal(v2.body.notesVersion, '99.0.0');
  assert.equal(v2.body.notesSource, 'changelog');
  // Tom CHANGELOG fra GitHub caches ikke (TTL 1 min) og gir ikke «ingen notater» når release/commits finnes.
  // Tidligere versjoner.
  const c = await A('/api/system/changelog?limit=3');
  assert.equal(c.status, 200);
  assert.equal(c.body.items.length, 3);
  assert.equal(c.body.items[0].version, '99.0.0');
  assert.equal(c.body.more, true);
  const inst = c.body.items.find((x) => x.version === own);
  assert.ok(inst.installedAt);
  assert.equal(inst.installed, true);
  assert.ok(inst.notes.length && inst.count === inst.notes.length);
  const b = await A(`/api/system/changelog?limit=2&before=${own}`);
  assert.ok(b.body.items.every((x) => su.compareVersions(x.version, own) < 0));
  // Feilede forsøk merkes.
  writeFileSync(join(UPD, 'status.json'), JSON.stringify({ id: 'f1', state: 'failed', step: 'Feilet', version: '99.0.0', error: 'Bygget feilet', finishedAt: Date.now() }));
  await A('/api/system/update/status');
  const f = (await A('/api/system/changelog?limit=1')).body.items[0];
  assert.deepEqual([f.version, f.failed, f.error], ['99.0.0', true, 'Bygget feilet']);
  assert.equal((await N('/api/system/changelog')).status, 403);
  su._setFetch(async () => { throw new TypeError('fetch failed'); });
});
