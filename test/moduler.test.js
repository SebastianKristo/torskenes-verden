// Modullisten (shared/schemas/moduler.json) og grupperingen av integrasjoner (shared/schemas/tilkoblinger.json), Fase 6.
// - Filene følger skjemaene sine, id-er og adresser er unike, og navnene er de som er bestemt i Q1–Q12.
// - GET /api/moduler gir hver bruker bare modulene den har tilgang til (admin-moduler bare for admin, Media bare med tilgang).
// - /api/integrations og /api/config bruker samme gruppe for samme integrasjon (O8).
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validate, SCHEMA_DIR } from './lib/json-schema.mjs';

const M = JSON.parse(readFileSync(join(SCHEMA_DIR, 'moduler.json'), 'utf8'));
const T = JSON.parse(readFileSync(join(SCHEMA_DIR, 'tilkoblinger.json'), 'utf8'));

test('moduler.json følger skjemaet', () => {
  assert.deepEqual(validate('moduler.schema.json', M), []);
});

test('moduler.json: unike id-er, kjente grupper og faste faner som finnes', () => {
  const ids = M.moduler.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'modul-id-ene er unike');
  const grupper = new Set(M.grupper.map((g) => g.id));
  assert.equal(grupper.size, M.grupper.length);
  for (const m of M.moduler) assert.ok(grupper.has(m.gruppe), `${m.id}: ukjent gruppe ${m.gruppe}`);
  for (const g of M.grupper) assert.ok(M.moduler.some((m) => m.gruppe === g.id), `gruppen ${g.id} har ingen moduler`);
  assert.deepEqual(M.grupper.map((g) => g.navn), ['I dag', 'Hjemme', 'Tid', 'Ute', 'Økonomi', 'Fritid og læring', 'Verksted', 'Drift']);
  for (const id of [...M.toppmeny, ...M.bunnmeny]) assert.ok(ids.includes(id), `${id} i toppmeny/bunnmeny finnes ikke`);
  // Q6: de faste fanene på desktop, i rekkefølge.
  assert.deepEqual(M.toppmeny, ['oversikt', 'kalender', 'finans', 'media', 'familie', 'mat', 'gjoremal', 'skjold']);
  for (const m of M.moduler) {
    const sub = m.undersider.map((u) => u.id);
    assert.equal(new Set(sub).size, sub.length, `${m.id}: undersidene har unike id-er`);
    if (m.rute === null) assert.ok(!m.plattformer.includes('web') || m.type === 'ark', `${m.id}: på web uten adresse`);
  }
  const s = M.innstillinger.map((x) => x.id);
  assert.equal(new Set(s).size, s.length);
});

test('moduler.json: ingen adresse eller gammel rute brukes to ganger', () => {
  const seen = new Map();
  const note = (r, hvem) => { assert.ok(!seen.has(r), `${r} brukes av både ${seen.get(r)} og ${hvem}`); seen.set(r, hvem); };
  for (const m of M.moduler) {
    if (m.rute) note(m.rute, m.id);
    for (const a of m.aliaser) note(a, `${m.id} (alias)`);
    for (const u of m.undersider) for (const a of u.aliaser ?? []) note(a, `${m.id}/${u.id} (alias)`);
  }
  // Undersider kan dele adresse med modulen (en visning eller et filter på samme side), men et alias peker aldri på seg selv.
  for (const m of M.moduler) for (const u of m.undersider) for (const a of u.aliaser ?? []) assert.notEqual(a, u.rute, `${m.id}/${u.id}`);
});

test('moduler.json: navnene fra Q1–Q12, og ingen «Ikke bruk»-former fra ordlisten', () => {
  const navn = Object.fromEntries(M.moduler.map((m) => [m.id, m.navn]));
  assert.equal(navn.oversikt, 'Oversikt'); // Q1
  assert.equal(navn.smarthjem, 'Smarthjem'); // Q1
  assert.equal(navn.finans, 'Økonomi'); // Q2
  assert.equal(navn.brief, 'Brief'); // Q7
  assert.equal(navn.reise, 'Reise'); // Q8
  assert.equal(navn.nyheter, 'Nyheter'); // Q10
  assert.equal(navn.gjoremal, 'Gjøremål'); // O6
  assert.equal(M.innstillinger.find((x) => x.id === 'konto').navn, 'Konto og sikkerhet'); // Q12
  assert.equal(M.innstillinger.find((x) => x.id === 'enheter').navn, 'Enheter og widgets'); // O4
  const alle = JSON.stringify([M.moduler.map((m) => [m.navn, m.undersider.map((u) => u.navn)]), M.innstillinger.map((x) => x.navn), M.grupper.map((g) => g.navn)]);
  for (const bad of ['Dashboard', 'Huskeliste', 'Now Brief', 'Nyhetsleser', 'Subscription OS', 'Familiekalender', 'FinansHub', 'Hjem"', 'Ruter"', 'Familie og kart']) {
    assert.ok(!alle.includes(bad), `«${bad.replace('"', '')}» skal ikke brukes som navn`);
  }
  // Kart er en fane i Familie (Q9), og Reise har sitt eget kart; #/kart videresendes.
  assert.ok(M.moduler.find((m) => m.id === 'familie').undersider.some((u) => u.id === 'kart'));
  assert.ok(M.moduler.find((m) => m.id === 'reise').undersider.find((u) => u.id === 'kart').aliaser.includes('#/kart'));
  // Familiekalender og Bursdager er filtre i Kalender (Q5), med de gamle rutene som aliaser.
  const kal = M.moduler.find((m) => m.id === 'kalender').undersider;
  assert.deepEqual(kal.filter((u) => u.type === 'filter').map((u) => u.navn), ['Alle', 'Familie', 'Bursdager', 'Skole']);
  assert.deepEqual(kal.filter((u) => u.type === 'visning').map((u) => u.navn), ['År', 'Måned', 'Uke', '3 dager', 'Dag', 'Liste']);
  // Media-fanene: «Kalender» er byttet ut, så den ikke kolliderer med hovedkalenderen.
  assert.deepEqual(M.moduler.find((m) => m.id === 'media').undersider.filter((u) => u.type === 'fane').map((u) => u.navn), ['Nå', 'Kommer', 'Bibliotek', 'Nedlastinger', 'Kilder']);
});

test('tilkoblinger.json følger skjemaet, og alle integrasjoner peker på en gruppe som finnes', () => {
  assert.deepEqual(validate('tilkoblinger.schema.json', T), []);
  const g = new Set(T.grupper.map((x) => x.id));
  for (const [id, grp] of Object.entries(T.integrasjoner)) assert.ok(g.has(grp), `${id} → ${grp}`);
});

/* ---------------- Serveren ---------------- */

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-moduler-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-moduler';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.251' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
const ny = await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' });
assert.equal(ny.status, 200, ny.text);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'ingrid', password: 'ingridPassord123', deviceName: 'Modultest' } })).json?.token;
const TI = as({ authorization: `Bearer ${tok}` });

test('GET /api/moduler krever innlogging og følger kontrakten', async () => {
  assert.equal((await req('/api/moduler')).status, 401);
  const r = await A('/api/moduler');
  assert.equal(r.status, 200);
  assert.deepEqual(validate('api/moduler.schema.json', r.json), []);
  assert.equal((await A('/api/moduler?plattform=tv')).status, 400);
});

test('GET /api/moduler: admin ser alt, en vanlig bruker ikke Domener og ikke Media uten tilgang', async () => {
  const a = (await A('/api/moduler')).json, i = (await I('/api/moduler')).json;
  const ids = (x) => x.moduler.map((m) => m.id);
  assert.ok(ids(a).includes('domener') && ids(a).includes('media'));
  assert.ok(!ids(i).includes('domener'), 'Domener er bare for admin');
  assert.ok(!ids(i).includes('media'), 'Media krever tilgang');
  assert.ok(!i.toppmeny.includes('media'), 'toppmenyen tar bare med moduler brukeren har');
  assert.ok(!i.innstillinger.some((s) => s.id === 'server'), 'Server er bare for admin');
  assert.ok(a.innstillinger.some((s) => s.id === 'server'));
  // Media-tilgang gitt av admin → Media kommer med, også med app-token.
  const id = (await I('/api/me')).json?.id ?? (await I('/api/me')).json?.me?.id;
  assert.equal((await A('/api/media/access', 'PUT', { userId: id, allowed: true })).status, 200);
  assert.ok(ids((await TI('/api/moduler')).json).includes('media'));
  assert.equal((await A('/api/media/access', 'PUT', { userId: id, allowed: false })).status, 200);
});

test('GET /api/moduler?plattform= tar bare med moduler for den plattformen, i standardrekkefølgen', async () => {
  const web = (await A('/api/moduler?plattform=web')).json, ios = (await A('/api/moduler?plattform=ios')).json;
  assert.ok(web.moduler.every((m) => m.plattformer.includes('web')));
  assert.ok(ios.moduler.every((m) => m.plattformer.includes('ios')));
  assert.ok(!ios.moduler.some((m) => m.id === 'rom'));
  assert.ok(web.moduler.some((m) => m.id === 'brief'), 'Brief har en vei inn på web (#/brief)');
  const order = M.moduler.map((m) => m.id);
  assert.deepEqual(web.moduler.map((m) => m.id), order.filter((id) => web.moduler.some((m) => m.id === id)));
});

test('Integrasjonene har samme gruppe i /api/integrations og /api/config (én gruppering, O8)', async () => {
  const navn = T.grupper.map((g) => g.navn);
  const list = (await A('/api/integrations')).json;
  for (const x of list) {
    assert.ok(navn.includes(x.group), `${x.id}: ${x.group}`);
    assert.equal(x.category, x.group, x.id);
    assert.ok(Object.hasOwn(T.integrasjoner, x.id), `${x.id} mangler i tilkoblinger.json`);
  }
  const cfg = (await A('/api/config')).json;
  const groups = Array.isArray(cfg) ? cfg : cfg.groups ?? cfg.config ?? [];
  assert.ok(groups.length > 5, 'fikk gruppene fra /api/config');
  for (const g of groups) {
    assert.ok(navn.includes(g.category), `${g.name}: ${g.category}`);
    assert.ok(Object.hasOwn(T.integrasjoner, g.id), `${g.id} (${g.name}) mangler i tilkoblinger.json`);
  }
  const by = Object.fromEntries(list.map((x) => [x.id, x.group]));
  assert.equal(by.google, 'Kalender og e-post', 'Google Kalender ligger ikke under «Hjem»');
  assert.equal(by.ha, 'Smarthjem');
});
