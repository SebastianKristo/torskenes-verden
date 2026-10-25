// Prompt 51 (WEBX51): felles søk, onboarding med engangskode, tema per bruker og konfliktvarsel for offline-køen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p51webx-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51webx';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4621';
process.env.PUBLIC_URL = 'https://home.example.no';
delete process.env.OLLAMA_URL;
delete process.env.OLLAMA_EMBED_MODEL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const W = await import('../server/webx51.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck, extra = {}) => (path, method = 'GET', body, h = {}) => req(path, { method, headers: { cookie: ck, ...extra, ...h }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));

/* ---------------- Søk ---------------- */

test('søk: krever innlogging, tom q gir hurtighandlinger', async () => {
  assert.equal((await req('/api/search51?q=melk')).status, 401);
  const r = await A('/api/search51');
  assert.equal(r.status, 200);
  assert.ok(r.body.results.some((x) => x.type === 'action' && x.id === 'action:checkin'));
  assert.ok(Array.isArray(r.body.recent));
  for (const x of r.body.results) { assert.ok(x.link?.web && x.link?.app); assert.ok(Array.isArray(x.actions)); }
});

test('søk: gjøremål og handleliste med dyp lenke og handlinger, bare egne/delte', async () => {
  const lists = (await A('/api/tasks/lists')).body.lists;
  const shop = lists.find((l) => /handel/i.test(l.name)) ?? (await A('/api/tasks/lists', 'POST', { name: 'Handel', color: '#2f7a4f' })).body.list;
  const mine = lists.find((l) => l.kind === 'mine');
  assert.ok(shop && mine);
  const t1 = (await A('/api/tasks', 'POST', { title: 'Melk lettmelk', list: shop.id })).body;
  const t2 = (await A('/api/tasks', 'POST', { title: 'Ring tannlegen', list: mine.id, note: 'hemmelig avtale' })).body;
  const id1 = t1.item?.id ?? t1.id, id2 = t2.item?.id ?? t2.id;
  assert.ok(id1 && id2);
  const r = await A('/api/search51?q=melk');
  const hit = r.body.results.find((x) => x.id === `shopping:${id1}`);
  assert.ok(hit, JSON.stringify(r.body.results.map((x) => x.id)));
  assert.equal(hit.link.web, `/#/gjoremal?task=${id1}`);
  assert.equal(hit.link.app, `papir://open?type=shopping&id=${id1}`);
  assert.equal(hit.actions[0].method, 'PATCH');
  assert.deepEqual(hit.actions[0].body, { done: true });
  assert.deepEqual(hit.match[0], [0, 4]);
  // Delord: «lege» finner «tannlegen».
  assert.ok((await A('/api/search51?q=lege')).body.results.some((x) => x.id === `task:${id2}`));
  // Ingrid ser ikke Sebastians private liste «Mine».
  const ri = await I('/api/search51?q=tannlege');
  assert.ok(!ri.body.results.some((x) => x.id === `task:${id2}`));
  // Filter på type
  const only = await A('/api/search51?q=melk&types=task');
  assert.ok(only.body.results.every((x) => x.type === 'task'));
  // Handling «legg i handlelisten» foreslås for fri tekst
  const add = await A('/api/search51?q=bananer');
  const a = add.body.results.find((x) => x.id === 'action:shop');
  assert.ok(a);
  assert.deepEqual(a.actions[0].body, { title: 'bananer', list: shop.id });
});

test('søk: sider, folk og nylige søk', async () => {
  const r = await A('/api/search51?q=kalender');
  assert.ok(r.body.results.some((x) => x.type === 'page' && x.link.web === '/#/kalender'));
  const p = await A('/api/search51?q=ingrid');
  assert.ok(p.body.results.some((x) => x.type === 'person' && x.title === 'Ingrid'));
  assert.equal((await A('/api/search51/recent', 'POST', { q: 'melk' })).status, 200);
  assert.deepEqual((await A('/api/search51')).body.recent, ['melk']);
  assert.equal((await A('/api/search51/types')).body.types.find((t) => t.type === 'receipt').label, 'Kvitteringer');
});

/* ---------------- Onboarding ---------------- */

test('onboarding: bare admin lager invitasjon; QR har aldri token; engangs; alltid vanlig bruker', async () => {
  assert.equal((await I('/api/onboard51/invites', 'POST', { name: 'Kari' })).status, 403);
  const c = await A('/api/onboard51/invites', 'POST', { name: 'Kari Nordmann', share: { location: true, health: false, calendar: true }, ttlHours: 24 });
  assert.equal(c.status, 201);
  const { invite, code, url, qr, qrSvg } = c.body;
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(url, `https://home.example.no/join/${invite.id}.${code}`);
  assert.match(qr, /^papir:\/\/join\?i=inv51_[^&]+&c=[A-Z0-9-]+&srv=https%3A%2F%2Fhome\.example\.no$/);
  assert.ok(!/token|fh_pat|hlr_/i.test(qr));
  assert.match(qrSvg, /^<svg/);
  // Koden lagres bare som hash
  const row = db.prepare('SELECT * FROM onboard51_invites WHERE id=?').get(invite.id);
  assert.ok(!JSON.stringify(row).includes(code.replace('-', '')) && !JSON.stringify(row).includes(code));
  assert.ok(!JSON.stringify((await A('/api/onboard51/invites')).body).includes(code));
  // Feil kode
  assert.equal((await req('/api/onboard51/preview', { method: 'POST', body: { id: invite.id, code: 'AAAA-AAAA' } })).status, 404);
  const pv = await req('/api/onboard51/preview', { method: 'POST', body: { link: qr } });
  assert.equal(pv.status, 200);
  assert.equal(pv.body.usernameSuggestion, 'kari.nordmann');
  assert.deepEqual(pv.body.share, { location: true, health: false, calendar: true });
  // Aksepter (web) – rolle kan ikke smugles inn
  const ac = await req('/api/onboard51/accept', { method: 'POST', body: { link: url, username: 'kari', password: 'kariPassord123', role: 'admin', share: { location: true, health: true } } });
  assert.equal(ac.status, 201, ac.text);
  assert.equal(ac.body.user.role, 'bruker');
  assert.deepEqual(ac.body.share, { location: true, health: true, calendar: true });
  assert.ok(ac.headers.getSetCookie().some((x) => x.startsWith('hl_sid=')));
  // Engangs
  const again = await req('/api/onboard51/accept', { method: 'POST', body: { link: url, username: 'kari2', password: 'kariPassord123' } });
  assert.equal(again.status, 410);
  assert.equal(again.body.code, 'used');
  assert.equal((await A('/api/onboard51/invites')).body.invites.find((x) => x.id === invite.id).state, 'used');
});

test('onboarding: app får token med vanlige scopes; tilbaketrukket invitasjon virker ikke', async () => {
  const c = (await A('/api/onboard51/invites', 'POST', { name: 'Pål' })).body;
  const ap = await req('/api/onboard51/accept', { method: 'POST', body: { id: c.invite.id, code: c.code.toLowerCase(), username: 'pal', password: 'palPassord1234', client: 'app', platform: 'ios', device: 'Påls iPhone' } });
  assert.equal(ap.status, 201, ap.text);
  assert.match(ap.body.token, /^fh_pat_/);
  assert.ok(ap.body.scopes.every((s) => ['finance:read', 'finance:write', 'receipts:write', 'read:transactions', 'read:summary', 'read:budget', 'write:transactions'].includes(s)));
  const me = await req('/api/me', { headers: { authorization: `Bearer ${ap.body.token}` } });
  assert.equal(me.body.username, 'pal');
  const d = (await A('/api/onboard51/invites', 'POST', { name: 'Ola' })).body;
  assert.equal((await A(`/api/onboard51/invites/${d.invite.id}`, 'DELETE')).status, 200);
  const r = await req('/api/onboard51/preview', { method: 'POST', body: { id: d.invite.id, code: d.code } });
  assert.equal(r.status, 410);
  assert.equal(r.body.code, 'revoked');
});

test('onboarding: /join/<id>.<kode> gir veiviseren', async () => {
  const r = await req('/join/inv51_abcdefgh.ABCD-EFGH');
  assert.equal(r.status, 200);
  assert.match(r.text, /join51/);
});

/* ---------------- Tema ---------------- */

test('tema: standard system, PUT synker, eldre updatedAt → 409, auto etter tid og sol', async () => {
  const g = await I('/api/me/theme51');
  assert.equal(g.status, 200);
  assert.equal(g.body.mode, 'system');
  assert.equal(g.body.effective, null);
  const p = await I('/api/me/theme51', 'PUT', { mode: 'dark', updatedAt: Date.now() });
  assert.equal(p.status, 200);
  assert.equal(p.body.effective, 'dark');
  assert.equal((await I('/api/me/layout')).body.web_theme, 'dark');
  assert.equal((await I('/api/me/theme51', 'PUT', { mode: 'light', updatedAt: p.body.updatedAt - 10_000 })).status, 409);
  assert.equal((await I('/api/me/theme51', 'PUT', { mode: 'rosa' })).status, 400);
  assert.equal((await I('/api/me/theme51', 'PUT', { auto: { by: 'time', lightAt: '25:00' } })).status, 400);
  const t = await I('/api/me/theme51', 'PUT', { mode: 'auto', auto: { by: 'time', lightAt: '07:00', darkAt: '21:00' } });
  assert.equal(t.status, 200);
  assert.ok(['light', 'dark'].includes(t.body.effective));
  assert.ok(t.body.next?.at && ['light', 'dark'].includes(t.body.next.mode));
  const s = await I('/api/me/theme51', 'PUT', { auto: { by: 'sun', place: { lat: 59.91, lon: 10.75, name: 'Oslo' } } });
  assert.equal(s.status, 200);
  assert.ok(s.body.sun && (s.body.sun.sunrise || s.body.sun.polar));
  // Ren funksjon: midt på dagen i juni i Oslo er det lyst, ved midnatt i desember mørkt.
  const th = { mode: 'auto', auto: { by: 'sun', place: { lat: 59.91, lon: 10.75 } }, palette: 'papir', updatedAt: 1 };
  assert.equal(W.computeTheme('ingen-bruker', th, Date.parse('2026-06-21T10:00:00Z')).effective, 'light');
  assert.equal(W.computeTheme('ingen-bruker', th, Date.parse('2026-12-21T23:00:00Z')).effective, 'dark');
  const tt = { mode: 'auto', auto: { by: 'time', lightAt: '07:00', darkAt: '21:00' } };
  assert.equal(W.computeTheme('x', tt, Date.parse('2026-10-25T12:00:00Z')).effective, 'light');
  assert.equal(W.computeTheme('x', tt, Date.parse('2026-10-25T22:30:00Z')).effective, 'dark');
});

/* ---------------- Offline-konflikt ---------------- */

test('offline: siste skriving vinner, konflikt meldes med header', async () => {
  const lists = (await A('/api/tasks/lists')).body.lists;
  const mine = lists.find((l) => l.kind === 'mine');
  const t = (await A('/api/tasks', 'POST', { title: 'Konflikt', list: mine.id })).body;
  const id = t.item?.id ?? t.id;
  const v0 = (await A(`/api/offline51/versions?tasks=${id}`)).body.tasks[id];
  assert.ok(v0);
  // Ingen konflikt når base er lik serverens
  const ok = await A(`/api/tasks/${id}`, 'PATCH', { title: 'Konflikt A' }, { 'x-offline51-base': String(v0), 'x-offline51-queued': String(Date.now()) });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('x-offline51-conflict'), null);
  const v1 = Number(ok.headers.get('x-offline51-updated'));
  assert.ok(v1 >= v0);
  // Noen andre endret etter at vi så den: skrivingen går gjennom, men varsles
  db.prepare('UPDATE hl_tasks SET updated_at=? WHERE id=?').run(v1 + 60_000, id);
  const late = await A(`/api/tasks/${id}`, 'PATCH', { title: 'Konflikt B' }, { 'x-offline51-base': String(v1), 'x-offline51-queued': String(Date.now()) });
  assert.equal(late.status, 200);
  assert.equal(late.headers.get('x-offline51-conflict'), '1');
  assert.equal(db.prepare('SELECT title FROM hl_tasks WHERE id=?').pluck().get(id), 'Konflikt B');
});

/* ---------------- Deling ---------------- */

test('deling: GET/PUT /api/me/share51 skriver Familie-innstillingene', async () => {
  const r = await I('/api/me/share51', 'PUT', { location: true, health: true, calendar: false });
  assert.deepEqual(r.body, { location: true, health: true, calendar: false });
  // Helse uten posisjon deles ikke (Familie har én delingsbryter)
  assert.deepEqual((await I('/api/me/share51', 'PUT', { location: false, health: true })).body, { location: false, health: false, calendar: false });
  const off = await I('/api/me/share51', 'PUT', { location: false, health: false });
  assert.deepEqual(off.body, { location: false, health: false, calendar: false });
});
