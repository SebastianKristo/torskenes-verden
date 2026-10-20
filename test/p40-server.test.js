// Prompt 40 (SERVER40): «Starter opp» bare ved ekte omstart, 2FA i appen, Finans (lagt til, rediger alt, søk med kort),
// Gjøremål-Glimt (flere punkter med rekkefølge, sted og person), Nyheter Glimt-side, julemodus, Hjemlys og fanelinja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p40-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-40s';
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
const { db } = await import('../server/db.js');
const { db: fhDb } = await import('../server/finans/db.js');
const totp = await import('../server/totp.js');
const jul = await import('../server/jul40.js');
const hj = await import('../server/hjemlys40.js');
const news = await import('../server/news40.js');
const tg40 = await import('../server/tasks-glimt40.js');
const { osloTodayISO } = await import('../public/js/quick-time.js');
const TODAY = osloTodayISO();

let ipN = 40;
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
const as = (h) => (path, method = 'GET', body, extra = {}) => req(path, { method, headers: { ...h, ...extra }, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const ingridId = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
const sebId = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
const tok = (await A('/finans/api/tokens', 'POST', { name: 'Home Assistant', scopes: ['finance:read', 'finance:write'] })).body.token;
const T = as({ authorization: `Bearer ${tok}` });

/* ---------------- Oppstartssiden ---------------- */

test('/api/health: restarting bare når serveren faktisk starter eller oppdaterer (ikke ved vanlig sideoppdatering)', async () => {
  const anon = await req('/api/health');
  assert.equal(anon.body.ready, true);
  assert.equal(anon.body.restarting, false);
  assert.equal(anon.body.state, 'ready');
  assert.equal(anon.headers.get('x-homelab-state'), 'ready');
  const full = await A('/api/health');
  assert.equal(full.body.restarting, false);
  assert.equal(full.body.updating, false);
  const boot = await A('/api/health?boot=1');
  assert.equal(boot.headers.get('x-homelab-state'), 'ready');
  assert.ok(!('restarting' in boot.body), 'starting.html beholder den gamle formen');
  // Mens serveren starter: 503 + X-Homelab-State: starting og restarting:true.
  const boot36 = await import('../server/boot36.js');
  boot36._resetBoot();
  const st = await req('/api/health');
  assert.deepEqual([st.status, st.headers.get('x-homelab-state'), st.body.restarting, st.body.state], [503, 'starting', true, 'starting']);
  for (const id of ['db', 'migrate', 'api', 'ai', 'integrations']) boot36.bootStep(id, 'ok');
  assert.equal((await req('/api/health')).status, 200);
  const g = await A('/gjoremal');
  assert.equal(g.status, 302);
  assert.equal(g.headers.get('location'), '/#/gjoremal');
});

/* ---------------- 2FA i appen ---------------- */

test('2FA i appen: status → setup (fersk økt eller passord) → enable med kode → 10 reservekoder → regenerate → disable', async () => {
  let s = await A('/api/auth/2fa/status');
  assert.deepEqual(s.body, { enabled: false, method: 'totp', backupLeft: 0, enabledAt: null, pending: false });
  // App-token er ikke en fersk økt: krever passord.
  const noPw = await T('/api/auth/2fa/setup', 'POST', {});
  assert.equal(noPw.status, 403);
  assert.equal(noPw.body.needsPassword, true);
  const setup = await T('/api/auth/2fa/setup', 'POST', { password: 'testpassord1' });
  assert.equal(setup.status, 200, setup.text);
  assert.equal(setup.body.issuer, 'Nordlys OS');
  assert.equal(setup.body.account, 'sebastian');
  assert.match(setup.body.otpauth, /^otpauth:\/\/totp\/Nordlys%20OS:sebastian\?secret=[A-Z2-7]+&issuer=Nordlys%20OS&algorithm=SHA1&digits=6&period=30$/);
  assert.equal(setup.body.otpauth_uri, setup.body.otpauth);
  assert.match(setup.body.qrSvg, /^<svg/);
  assert.match(setup.body.qrPng, /^data:image\/svg\+xml;base64,/);
  assert.match(setup.body.secretGrouped, /^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/);
  // Fersk økt (nettopp logget inn) trenger ikke passordet på nytt.
  const fresh = await A('/api/auth/2fa/setup', 'POST', {});
  assert.equal(fresh.status, 200, fresh.text);
  const secret = totp.base32Decode(fresh.body.secret);
  assert.equal((await A('/api/auth/2fa/enable', 'POST', { code: '000000' })).body.error, 'Koden stemmer ikke. Prøv den neste som vises.');
  const en = await A('/api/auth/2fa/enable', 'POST', { code: totp.totpNow(secret) });
  assert.equal(en.status, 200, en.text);
  assert.equal(en.body.backupCodes.length, 10);
  s = await A('/api/auth/2fa/status');
  assert.equal(s.body.enabled, true);
  assert.equal(s.body.backupLeft, 10);
  assert.ok(Date.parse(s.body.enabledAt));
  // Innlogging krever nå kode.
  const lg = await req('/api/login', { method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${ipN++}` }, body: { username: 'sebastian', password: 'testpassord1' } });
  assert.equal(lg.body.needsTotp, true);
  assert.equal((await A('/api/auth/2fa/backup/regenerate', 'POST', {})).status, 403);
  const rg = await A('/api/auth/2fa/backup/regenerate', 'POST', { password: 'testpassord1' });
  assert.equal(rg.body.backupCodes.length, 10);
  assert.ok(!rg.body.backupCodes.some((x) => en.body.backupCodes.includes(x)));
  assert.equal((await A('/api/auth/2fa/disable', 'POST', { password: 'feil' })).status, 403);
  const off = await A('/api/auth/2fa/disable', 'POST', { password: 'testpassord1' });
  assert.deepEqual(off.body, { ok: true, enabled: false });
  assert.equal((await A('/api/auth/2fa/status')).body.enabled, false);
  // Den gamle innloggingsruten POST /api/auth/2fa (steg 2) virker fortsatt.
  assert.equal((await req('/api/auth/2fa', { method: 'POST', body: { ticket: 'x', code: '123456' } })).status, 401);
});

/* ---------------- Finans ---------------- */

test('Finans: added på transaksjoner og kvitteringer («Lagt til … · skannet kvittering · Sebastian», bankimport, Glimt, API-nøkkel)', async () => {
  const list = await A('/finans/api/transactions?limit=20');
  assert.equal(list.status, 200);
  for (const t of list.body.items) { assert.match(t.added.text, /^Lagt til \d\d\.\d\d\.\d{4} kl\. \d\d\.\d\d · /); assert.ok(['scan', 'bank', 'manual', 'email', 'import'].includes(t.added.source)); }
  const g = await A('/finans/api/transactions', 'POST', { date: TODAY, amount: -129, description: 'Kiwi', type: 'expense' }, { 'x-homelab-via': 'glimt' });
  assert.equal(g.status, 200, g.text);
  assert.equal(g.body.added.sourceLabel, 'lagt til av Glimt fra chat');
  assert.match(g.body.added.text, / · lagt til av Glimt fra chat · Sebastian$/);
  const api = await T('/finans/api/transactions', 'POST', { date: TODAY, amount: -50, description: 'Strøm', type: 'expense' });
  assert.equal(api.body.added.sourceLabel, 'via API-nøkkel «Home Assistant»');
  const m = await A('/finans/api/transactions', 'POST', { date: TODAY, amount: -10, description: 'Kaffe' });
  assert.match(m.body.added.text, / · lagt inn manuelt · Sebastian$/);
  // Bankimport: «bankimport fra DNB» uten navn.
  const b = fhDb.prepare("INSERT INTO fh_transactions(date,amount,description,source,raw_bank_row,created,user_id) VALUES(?,?,?,?,?,?,?) RETURNING id").get(TODAY, -9900, 'REMA 1000', 'csv', JSON.stringify({ bank: 'DNB' }), Date.parse('2026-10-14T04:00:00Z'), sebId).id;
  const bt = await A(`/finans/api/transactions/${b}`);
  assert.equal(bt.body.added.text, 'Lagt til 14.10.2026 kl. 06.00 · bankimport fra DNB');
  assert.equal(bt.body.added.source, 'import');
  // Kvittering: skannet.
  fhDb.prepare("INSERT INTO fh_receipts(id,status,created,user_id,uploaded_by,source,merchant,total) VALUES('rc40a','needs_review',?,?,?,'upload','Kiwi',12900)").run(Date.parse('2026-10-16T15:46:00Z'), sebId, sebId);
  const rc = await A('/finans/api/receipts/rc40a');
  assert.equal(rc.body.added.text, 'Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian');
});

test('Finans: PATCH godtar alle felt (dato, beløp, motpart, kategori som navn, notat, tagger, varelinjer) med historikk og «Sist endret … av»', async () => {
  const t = (await A('/finans/api/transactions', 'POST', { date: TODAY, amount: -386.5, description: 'Rema 1000' })).body;
  fhDb.prepare("INSERT INTO fh_receipts(id,status,created,user_id,transaction_id,file,extraction) VALUES('rc40b','booked',?,?,?,'x.jpg',?)").run(Date.now(), sebId, t.id, JSON.stringify({ lines: [{ description: 'Melk', amount: 22.9 }, { description: 'Brød', amount: 363.6 }] }));
  const cat = fhDb.prepare('SELECT name FROM fh_categories WHERE user_id=? LIMIT 1').pluck().get(sebId);
  const p = await A(`/finans/api/transactions/${t.id}`, 'PATCH', { date: '2026-10-18', amount: 386.5, type: 'expense', merchant: 'REMA 1000 Majorstuen', category: cat, note: 'Helg', tags: ['#Hytte', 'mat'],
    lines: [{ name: 'Melk', price: 22.9 }, { name: 'Brød', price: 39.9 }, { name: 'Kaffe', price: 323.7 }] });
  assert.equal(p.status, 200, p.text);
  assert.deepEqual([p.body.date, p.body.amount, p.body.merchant, p.body.note, p.body.category], ['2026-10-18', -386.5, 'REMA 1000 Majorstuen', 'Helg', cat]);
  assert.deepEqual(p.body.tags, ['hytte', 'mat']);
  assert.equal(p.body.lines.length, 3);
  assert.deepEqual(p.body.lineCheck, { sum: 386.5, total: 386.5, ok: true, text: 'Sum linjer 386,50 kr · stemmer' });
  const fields = p.body.changes.map((x) => x.field);
  for (const f of ['date', 'merchant', 'note', 'tags', 'lines']) assert.ok(fields.includes(f), f);
  assert.match(p.body.added.edited.text, /^Sist endret \d\d\.\d\d\.\d{4} kl\. \d\d\.\d\d av Sebastian$/);
  assert.equal(p.body.history.length, 1);
  const d = await A(`/finans/api/transactions/${t.id}`);
  assert.equal(d.body.history[0].byName, 'Sebastian');
  assert.equal(d.body.canReset, true);
  // Tilbakestill til slik Glimt leste den.
  const rs = await A(`/finans/api/transactions/${t.id}/reset`, 'POST', {});
  assert.deepEqual(rs.body.lines.map((l) => l.description), ['Melk', 'Brød']);
  assert.equal(rs.body.history.length, 2);
  // «Les på nytt» på bokført kvittering: reanalyze med apply:false avvises ikke lenger som «allerede bokført».
  const ra = await A('/finans/api/receipts/rc40b/reanalyze', 'POST', { apply: false });
  assert.doesNotMatch(ra.body.error ?? '', /allerede bokført/);
  assert.match((await A('/finans/api/receipts/rc40b/reanalyze', 'POST', {})).body.error, /allerede bokført/);
  // «Bruk endringene»: kandidaten tas i bruk på kvitteringen og transaksjonen (fortegnet beholdes), med historikk.
  fhDb.prepare('UPDATE fh_receipts SET candidate=? WHERE id=?').run(JSON.stringify({ id: 'cand40', at: Date.now(), provider: 'gemini', model: 'g', data: { merchant: 'Rema 1000 Bislett', date: '2026-10-17', total: 400, lines: [{ description: 'Ost', amount: 400 }] } }), 'rc40b');
  assert.equal((await A(`/finans/api/transactions/${t.id}/reread/apply`, 'POST', { candidateId: 'feil' })).status, 409);
  const ap = await A(`/finans/api/transactions/${t.id}/reread/apply`, 'POST', { candidateId: 'cand40' });
  assert.equal(ap.status, 200, ap.text);
  assert.deepEqual([ap.body.merchant, ap.body.date, ap.body.amount, ap.body.kept], ['Rema 1000 Bislett', '2026-10-17', -400, 'new']);
  assert.ok(ap.body.changes.some((x) => x.field === 'lines'));
  // Andre brukere ser den ikke; ukjent kategori avvises.
  assert.equal((await I(`/finans/api/transactions/${t.id}`, 'PATCH', { note: 'x' })).status, 404);
  assert.equal((await A(`/finans/api/transactions/${t.id}`, 'PATCH', { category: 'Finnes ikke' })).status, 400);
  // «Les på nytt» uten kvittering → 409.
  const noRc = (await A('/finans/api/transactions', 'POST', { date: TODAY, amount: -1, description: 'Uten' })).body;
  const rr = await A(`/finans/api/transactions/${noRc.id}/reread`, 'POST', {});
  assert.equal(rr.status, 409);
  assert.equal(rr.body.noReceipt, true);
});

test('Finans → Søk: «Abonnementer» gir kort svar uten markdown, tre nøkkeltall og kort per abonnement sortert etter neste trekk', async () => {
  fhDb.prepare('DELETE FROM fh_subscriptions WHERE user_id=?').run(sebId);
  const add = (name, price, cycle, next) => fhDb.prepare('INSERT INTO fh_subscriptions(name,price,cycle,next_date,active,created,user_id) VALUES(?,?,?,?,1,?,?)').run(name, price, cycle, next, Date.now(), sebId);
  const inDays = (n) => { const [y, m, d] = TODAY.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  add('Spotify', 12900, 'monthly', inDays(12)); add('TV 2 Play', 19900, 'monthly', inDays(5)); add('iCloud', 120000, 'yearly', inDays(40));
  const r = await A('/finans/api/search/ask', 'POST', { q: 'Abonnementer' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.source, 'Subscription OS');
  assert.equal(r.body.sourceLabel, 'fra Subscription OS');
  assert.equal(r.body.text, 'Du har tre abonnementer. Til sammen 428 kr i måneden. Neste trekk er TV 2 Play om 5 dager.');
  assert.ok(!/\*\*|\[\d\]/.test(r.body.text));
  assert.deepEqual(r.body.cards.filter((c) => c.kind === 'stat').map((c) => [c.label, c.value]), [['PER MÅNED', '428 kr'], ['PER ÅR', '5 136 kr'], ['NESTE TREKK', r.body.cards.find((c) => c.key === 'next').value]]);
  const subs = r.body.cards.filter((c) => c.kind === 'sub');
  assert.deepEqual(subs.map((s) => s.name), ['TV 2 Play', 'Spotify', 'iCloud']);
  assert.equal(subs[0].soon, true);
  assert.match(subs[0].nextLabel, /^Neste trekk \d+\. \w+ · om 5 dager$/);
  assert.equal(subs[2].perLabel, 'per år · 100/mnd');
  assert.equal(r.body.open.label, 'Åpne Subscription OS ›');
  assert.equal(r.body.total, 428);
  const sp = await A('/finans/api/search/ask', 'POST', { q: 'hvor mye brukte jeg på Kiwi' });
  assert.equal(sp.status, 200);
  assert.equal(sp.body.source, 'Transaksjoner');
  assert.ok(Array.isArray(sp.body.cards));
  const bu = await A('/finans/api/search/ask', 'POST', { q: 'budsjett' });
  assert.equal(bu.body.intent, 'budget');
  assert.equal((await A('/finans/api/search/ask', 'POST', {})).status, 400);
  assert.equal((await req('/finans/api/search/ask', { method: 'POST', body: { q: 'abo' } })).status, 401);
});

/* ---------------- Gjøremål-Glimt ---------------- */

test('Gjøremål-Glimt: «… til Strømstad men først må jeg levere pakken» → 2 punkter i riktig rekkefølge med sted og tagg; Angre fjerner begge', async () => {
  const r = await A('/api/tasks/glimt', 'POST', { q: 'Jeg må huske å ta med noen pakker og møbeler til Strømstad men først må jeg levere pakken' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.text, 'Lagde 2 punkter for Strømstad, i riktig rekkefølge.');
  const [a, b] = r.body.items;
  assert.equal(a.title, 'Lever pakken');
  assert.deepEqual(a.tags, ['pakke', 'strømstad']);
  assert.equal(a.after, null);
  assert.equal(a.step.label, '1 · først');
  assert.equal(b.title, 'Ta med noen pakker og møbler til Strømstad');
  assert.equal(b.placeName, 'Strømstad');
  assert.deepEqual(b.tags, ['strømstad']);
  assert.equal(b.after, a.id);
  assert.equal(b.step.label, '2 · etter «Lever pakken»');
  assert.equal(a.list, b.list);
  const u = await A('/api/tasks/glimt/undo', 'POST', { token: r.body.undo.token });
  assert.equal(u.status, 200, u.text);
  assert.equal(db.prepare('SELECT count(*) FROM hl_tasks WHERE id IN (?,?)').pluck().get(a.id, b.id), 0);
});

test('Gjøremål-Glimt: person lenket til brukeren (liste dere begge ser), dato og tid; «Deretter» → etter; varsel ved nevnt og «Nå kan du»', async () => {
  const lists = (await A('/api/tasks/lists')).body.lists;
  const hjem = lists.find((l) => l.name === 'Hjem');
  assert.equal((await A(`/api/tasks/lists/${hjem.id}/members`, 'PUT', { userIds: [ingridId] })).status, 200);
  const r = await A('/api/tasks/glimt', 'POST', { q: 'Husk å gi Ingrid nøklene på fredag kl 17' });
  assert.equal(r.status, 200, r.text);
  const it = r.body.items[0];
  assert.equal(it.title, 'Gi Ingrid nøklene');
  assert.deepEqual(it.who, { userId: ingridId, name: 'Ingrid' });
  assert.deepEqual(it.mentions, [ingridId]);
  assert.equal(it.list, hjem.id);
  assert.equal(it.time, '17:00');
  const [y, m, d] = it.due.split('-').map(Number);
  assert.equal(new Date(Date.UTC(y, m - 1, d)).getUTCDay(), 5, 'fredag');
  assert.ok(db.prepare("SELECT 1 FROM notify_queue WHERE user_id=? AND title='Sebastian nevnte deg i Huskeliste'").get(ingridId));
  const two = await A('/api/tasks/glimt', 'POST', { q: 'Hent pakke på Kiwi i morgen. Deretter kjøre til hytta' });
  const [p1, p2] = two.body.items;
  assert.equal(p1.title, 'Hent pakke på Kiwi');
  assert.equal(p1.placeName, 'Kiwi');
  assert.equal(p2.title, 'Kjør til hytta');
  assert.equal(lists.find((l) => l.id === p2.list)?.name, 'Hytta');
  assert.equal(p2.after, p1.id);
  assert.ok(p1.due && !p2.due, 'datoen gjelder setningen den står i');
  // Når «Hent pakke …» er gjort: «Nå kan du: Kjør til hytta».
  assert.equal((await A(`/api/tasks/${p1.id}`, 'PATCH', { done: true })).status, 200);
  assert.ok(db.prepare("SELECT 1 FROM notify_queue WHERE user_id=? AND body='Nå kan du: Kjør til hytta'").get(sebId));
  // Glimt (AI) brukes først når svaret er gyldig; ukjente lister/personer valideres bort.
  const v = tg40.validateAi40({ items: [{ n: 'Lever pakken', list: 'Ukjent', who: 'Ola', date: '2026-13-01', after: 5 }, { n: 'Kjør', list: 'Hytta', after: 0 }] }, { lists: [{ name: 'Hytta' }], people: [{ id: 'x', first: 'Ingrid' }] });
  assert.deepEqual(v.map((x) => [x.n, x.list, x.who, x.date, x.after]), [['Lever pakken', null, null, null, null], ['Kjør', 'Hytta', null, null, 0]]);
  // POST /api/tasks og PATCH godtar placeName og after.
  const t1 = await A('/api/tasks', 'POST', { title: 'Lever nøkkel', placeName: 'Strømstad' });
  assert.equal(t1.status, 201, t1.text);
  assert.equal(t1.body.item.placeName, 'Strømstad');
  const t2 = await A('/api/tasks', 'POST', { title: 'Kjør hjem', after: t1.body.item.id });
  assert.equal(t2.body.item.after, t1.body.item.id);
  const t3 = await A(`/api/tasks/${t2.body.item.id}`, 'PATCH', { placeName: 'Hytta', after: null });
  assert.deepEqual([t3.body.item.placeName, t3.body.item.after], ['Hytta', null]);
  assert.equal((await A('/api/tasks', 'POST', { title: 'x', after: 'abc' })).status, 400);
  // Enkle ting går fortsatt via den raske tolkeren.
  const s = await A('/api/tasks/glimt', 'POST', { q: 'melk i morgen' });
  assert.equal(s.body.items.length, 1);
  assert.equal(s.body.intent, 'tasks.add');
});

/* ---------------- Nyheter ---------------- */

test('Nyheter Glimt-side: seksjoner med referanser, bilder, kilder og cache; AI-svar valideres (ukjente referanser fjernes)', async () => {
  await A('/api/rss'); // lager standardkildene
  const feeds = db.prepare('SELECT id, name FROM rss_feed WHERE user=? ORDER BY sort').all(sebId);
  const nrk = feeds.find((f) => f.name === 'NRK'), e24 = feeds.find((f) => f.name === 'E24');
  const now = new Date().toISOString();
  const ins = db.prepare('INSERT INTO rss_item(feed_id, guid, title, url, published, category, image, excerpt) VALUES(?,?,?,?,?,?,?,?)');
  ins.run(nrk.id, 'g1', 'Ny T-banetunnel åpner i Oslo', 'https://nrk.no/1', now, 'Norge', 'https://nrk.no/1.jpg', 'Tunnelen åpner i dag.');
  ins.run(nrk.id, 'g2', 'Valg i Tyskland', 'https://nrk.no/2', now, 'Utenriks', null, '');
  ins.run(e24.id, 'g3', 'Renten står stille', 'https://e24.no/3', now, 'Økonomi', 'https://e24.no/3.jpg', 'Norges Bank holder renten.');
  const ids = db.prepare("SELECT id FROM rss_item WHERE guid IN ('g1','g2','g3') ORDER BY id").pluck().all();
  const r = await A('/api/news/glimt', 'POST', { ids, length: 'kort', force: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.title, 'Siste døgn');
  assert.equal(r.body.engine, 'lokal');
  assert.equal(r.body.refs.length, 3);
  assert.deepEqual(r.body.refs.map((x) => x.n), [1, 2, 3]);
  for (const s of r.body.sections) { assert.ok(s.h && s.text && s.refs.length); for (const n of s.refs) assert.ok(r.body.refs.some((x) => x.n === n)); }
  assert.match(r.body.images[0].caption, /^Bilde fra saken \[\d\] · (NRK|E24)$/);
  assert.ok(r.body.sources.find((s) => s.name === 'NRK').count >= 2);
  assert.match(r.body.foot, /^Laget av Glimt kl\. \d\d:\d\d fra kildene du har valgt\./);
  assert.equal((await A('/api/news/glimt', 'POST', { ids, length: 'kort' })).body.cached, true);
  // Bare én kilde.
  const only = await A('/api/news/glimt', 'POST', { ids, sources: [e24.id], length: 'lang' });
  assert.deepEqual(only.body.refs.map((x) => x.source), ['E24']);
  assert.equal(only.body.sources.find((s) => s.name === 'NRK').on, false);
  // AI: referanse 99 finnes ikke og fjernes.
  news._setNewsLlm(async () => ({ ingress: 'To saker. Mest om Oslo.', seksjoner: [{ tittel: 'Norge og Oslo', avsnitt: [{ tekst: 'NRK melder at tunnelen åpner [1].', ref: [1, 99] }], bilde: 1 }] }));
  const g = await A('/api/glimt/news-digest', 'POST', { ids, length: 'lang', force: true });
  news._setNewsLlm(null);
  assert.equal(g.body.engine, 'glimt');
  assert.deepEqual(g.body.sections[0].refs, [1]);
  assert.equal(g.body.sections[0].text, 'NRK melder at tunnelen åpner.');
  assert.equal(g.body.refs.length, 1);
  const src = await A('/api/news/glimt/sources');
  assert.ok(src.body.sources.length >= 2);
  assert.equal((await A('/api/news/glimt/prefs', 'PUT', { length: 'lang', period: 'uke' })).body.period, 'uke');
  assert.equal((await A('/api/news/glimt/prefs', 'PUT', { period: 'år' })).status, 400);
});

/* ---------------- Julemodus ---------------- */

test('julemodus: Auto (1. des–13. jan, fire faser), Av, På med fase; /api/glimt/settings og brief.jul', async () => {
  const at = (s) => Date.parse(`${s}T12:00:00Z`);
  assert.deepEqual(['2026-12-05', '2026-12-24', '2026-12-31', '2027-01-01', '2027-01-05', '2027-01-13', '2027-01-14', '2026-11-30'].map((d) => jul.julActive({}, at(d)).phase),
    ['advent', 'jul', 'nyttar', 'nyttar', 'vinter', 'vinter', null, null]);
  const a = jul.julActive({}, at('2026-12-05'));
  assert.deepEqual([a.on, a.until, a.label, a.outfit], [true, '2027-01-13', 'På nå · slås av 13. januar', 'nisse']);
  assert.equal(jul.julActive({}, at('2026-10-20')).label, 'Slås på 1. desember');
  assert.equal(jul.julActive({ jul: 'av' }, at('2026-12-05')).label, 'Av hele året');
  assert.deepEqual(jul.julBrief({}, at('2026-12-13')).luke, { n: 13, text: 'Luciadagen – lussekatter til frokost?' });
  assert.equal(jul.julBrief({}, at('2026-12-13')).countdownText, '11 dager til jul');
  const s0 = await A('/api/glimt/settings');
  assert.deepEqual([s0.body.jul, s0.body.julPhase, s0.body.snow, s0.body.julSound], ['auto', null, true, 'av']);
  const p = await A('/api/glimt/settings', 'PUT', { jul: 'pa', julPhase: 'nyttar', snow: false, julSound: 'bjelle' });
  assert.equal(p.status, 200, p.text);
  assert.deepEqual([p.body.julActive.on, p.body.julActive.phase, p.body.julActive.label, p.body.julActive.outfit], [true, 'nyttar', 'På · Nyttår', 'nyttar']);
  assert.equal((await I('/api/glimt/settings')).body.julActive.on, false, 'per bruker');
  const b = await A('/api/brief');
  assert.equal(b.status, 200);
  assert.equal(b.body.jul.phase, 'nyttar');
  assert.equal((await A('/api/glimt/settings', 'PUT', { jul: 'ja' })).status, 400);
  assert.equal((await A('/api/glimt/settings', 'PUT', { julPhase: 'sommer' })).status, 400);
  await A('/api/glimt/settings', 'PUT', { jul: 'auto', julPhase: null });
});

/* ---------------- Hjemlys ---------------- */

test('Hjemlys: start, husstanden ser bare at det er aktivt, posisjon maks 30 s/50 m, sen → deling + varsel, Alt OK, hjemme via geofence', async () => {
  assert.deepEqual((await I('/api/hjemlys/phone', 'PUT', { phone: '+47 912 34 567' })).body, { phone: '+4791234567' });
  assert.equal((await I('/api/hjemlys/phone', 'PUT', { phone: 'abc' })).status, 400);
  const st = await I('/api/hjemlys/start', 'POST', { eta: 20, waitMin: 5, mode: 'transit', pos: { lat: 59.9139, lon: 10.7522 } });
  assert.equal(st.status, 200, st.text);
  const s = st.body.session;
  assert.deepEqual([s.state, s.waitMin, s.mode, s.name], ['onTheWay', 5, 'transit', 'Ingrid']);
  assert.deepEqual(s.recipients.map((x) => x.userId), [sebId]);
  assert.ok(!('share' in s));
  assert.deepEqual(Object.keys(s.live).sort(), ['eta', 'from', 'homeAt', 'lateMinutes', 'leg', 'progress', 'state']);
  assert.deepEqual([s.live.state, s.live.from, s.live.eta], ['onTheWay', 'Ingrid', Math.round(Date.parse(s.eta) / 1000)]);
  let h = await A('/api/hjemlys');
  const ing = h.body.household.find((x) => x.userId === ingridId);
  assert.deepEqual([ing.state, ing.name], ['onTheWay', 'Ingrid']);
  assert.ok(ing.eta && !('share' in ing), 'ingenting deles før sen');
  assert.equal(h.body.mine, null);
  // Posisjon: maks hvert 30. s / 50 m.
  const p1 = await I(`/api/hjemlys/${s.id}`, 'PATCH', { pos: { lat: 59.9140, lon: 10.7523, acc: 12 }, battery: 42, signal: '4G' });
  assert.equal(p1.body.stored.pos, false, 'under 30 s og 50 m');
  const p2 = await I(`/api/hjemlys/${s.id}`, 'PATCH', { pos: { lat: 59.9200, lon: 10.7600, acc: 10 }, unlockedAt: new Date().toISOString() });
  assert.equal(p2.body.stored.pos, true);
  assert.equal((await A(`/api/hjemlys/${s.id}`, 'PATCH', { plus: 10 })).status, 404, 'bare eieren');
  // Jobben: eta passert → «Alt OK?» til Ingrid; eta + waitMin passert → late + varsel til Sebastian med delingsdata.
  const etaMs = Date.parse(s.eta);
  assert.equal((await hj.tick40(etaMs + 60_000)).prompted, 1);
  assert.ok(db.prepare("SELECT 1 FROM notify_queue WHERE user_id=? AND title='Hjemlys · Alt OK?'").get(ingridId));
  assert.equal((await hj.tick40(etaMs + 6 * 60_000)).late, 1);
  const n = db.prepare("SELECT * FROM notify_queue WHERE user_id=? AND title='Ingrid er ikke hjemme ennå' ORDER BY id DESC").get(sebId);
  assert.match(n.body, /min over forventet tid · batteri 42 % · dekning 4G/);
  h = await A('/api/hjemlys');
  const late = h.body.household.find((x) => x.userId === ingridId);
  assert.equal(late.state, 'late');
  assert.deepEqual([late.share.pos.lat, late.share.battery, late.share.signal], [59.92, 0.42, '4G']);
  assert.equal(late.share.phone, '+4791234567');
  assert.equal(late.phone, '+4791234567', 'telefon per person i household');
  assert.equal(late.share.route.length, 2);
  assert.ok(late.share.unlockedAt);
  // Alt OK → på vei igjen.
  const ok = await I(`/api/hjemlys/${s.id}/ok`, 'POST', {});
  assert.equal(ok.body.session.state, 'onTheWay');
  assert.ok(!('share' in ok.body.session));
  // Hjemme (geofence 60 m rundt «Hjem» i Familie).
  db.prepare("INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created, icon) VALUES('Hjem', 59.9275, 10.7160, 150, '#2f7a4f', ?, ?, 'home')").run(ingridId, Date.now());
  const home = await I(`/api/hjemlys/${s.id}`, 'PATCH', { pos: { lat: 59.92752, lon: 10.71602, acc: 5 } });
  assert.equal(home.body.session.state, 'home');
  assert.match(home.body.session.homeLabel, /^Ingrid er hjemme \d\d:\d\d$/);
  assert.ok(db.prepare("SELECT 1 FROM notify_queue WHERE user_id=? AND body LIKE 'Ingrid er hjemme %'").get(sebId));
  // Ruten slettes 24 t etter slutt.
  assert.ok((await hj.tick40(Date.now() + 25 * 3600_000)).pruned >= 2);
  // Tokens og forslag.
  assert.deepEqual((await I('/api/hjemlys/tokens', 'POST', { platform: 'ios', kind: 'liveactivity', token: 'abcdef0123456789', sessionId: s.id })).body, { ok: true });
  assert.equal((await I('/api/hjemlys/tokens', 'POST', { platform: 'web', kind: 'x', token: 'y' })).status, 400);
  hj._setHjemlysCalendar(async () => [{ title: 'Kino med Sebastian', start: new Date(Date.now() - 3600_000).toISOString(), end: new Date(Date.now() + 3600_000).toISOString(), allDay: false }]);
  const sg = await A('/api/hjemlys/suggest');
  assert.equal(sg.body.suggest, true);
  assert.match(sg.body.reason, /^Kino med Sebastian slutter \d\d:\d\d$/);
  assert.match(sg.body.text, /^Kino er ferdig \d\d:\d\d\. Skal jeg si fra til Ingrid når du er hjemme\?$/);
  assert.deepEqual(sg.body.recipients, [{ userId: ingridId, name: 'Ingrid' }]);
  // Familiens logg (eieren og mottakerne).
  const log = (await A(`/api/hjemlys/${s.id}/log`)).body;
  assert.deepEqual(log.map((x) => x.kind), ['start', 'prompt', 'late', 'ok', 'home']);
  assert.match(log.at(-1).text, /^Ingrid er hjemme \d\d\.\d\d$/);
  assert.match(log[2].text, /^Ingrid er 6 min forsinket · familien har fått beskjed$/);
  // Rute hjem (anslag uten reiseplanlegger): fra siste posisjon til «Hjem».
  db.prepare("INSERT INTO family_pos(user, ts, lat, lon) VALUES(?,?,?,?)").run(ingridId, Date.now(), 59.9296, 10.7146);
  const rt = await I('/api/hjemlys/route');
  assert.equal(rt.status, 200);
  assert.deepEqual(rt.body.options.map((o) => o.mode), ['kollektiv', 'gå', 'sykkel']);
  assert.ok(rt.body.from.km > 0 && rt.body.options.every((o) => o.minutes > 0 && Date.parse(o.eta)));
  assert.deepEqual((await I('/api/hjemlys/route?mode=sykkel')).body.options.map((o) => o.mode), ['sykkel']);
  hj._setHjemlysCalendar(null);
  // Ny økt avslutter den gamle; end.
  const s2 = (await A('/api/hjemlys/start', 'POST', { eta: new Date(Date.now() + 30 * 60_000).toISOString() })).body.session;
  assert.deepEqual(s2.recipients.map((x) => x.userId), [ingridId]);
  assert.equal((await A(`/api/hjemlys/${s2.id}/end`, 'POST', {})).body.session.state, 'ended');
  assert.equal((await A('/api/hjemlys/start', 'POST', { eta: 'snart' })).status, 400);
});

/* ---------------- Fanelinja ---------------- */

test('fanelinja: GET /api/app/pages er én kilde for Mer (Bibel bare med modulen), og homeNav godtar alle nøklene', async () => {
  const p = await A('/api/app/pages');
  assert.equal(p.status, 200);
  const keys = p.body.pages.map((x) => x.key);
  for (const k of ['hjem', 'finans', 'mat', 'sporing', 'domener', 'media', 'abo', 'kart', 'huske', 'chat', 'fsok', 'vaer', 'nyheter', 'kalender', 'bursdag', 'brief', 'rss', 'aksjer', 'nordlys', 'innst']) assert.ok(keys.includes(k), k);
  assert.equal(p.body.pages.find((x) => x.key === 'brief').kind, 'sheet');
  assert.equal(p.body.pages.find((x) => x.key === 'rss').kind, 'sheet');
  assert.equal(p.body.maxTabs, 5);
  const bibleSeb = keys.includes('bibel'), bibleIng = (await I('/api/app/pages')).body.pages.some((x) => x.key === 'bibel');
  assert.notEqual(bibleSeb && bibleIng, true, 'bibel bare for brukere med modulen');
  const l = await A('/api/me/layout', 'PUT', { homeNav: ['kalender', 'bursdager', 'brief', 'nordlys', 'innstillinger', 'mer'] });
  assert.equal(l.status, 200, l.text);
  assert.deepEqual(l.body.homeNav, ['kalender', 'bursdager', 'brief', 'nordlys', 'innstillinger', 'mer']);
  assert.equal((await A('/api/me/layout', 'PUT', { homeNav: ['abo', 'kart', 'fsok', 'rss', 'innst'] })).status, 200);
  assert.equal((await A('/api/me/layout', 'PUT', { homeNav: ['ukjent'] })).status, 400);
});
