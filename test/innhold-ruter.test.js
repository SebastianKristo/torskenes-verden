// Låser svarene til rutene i Skjold Lab, Rom, Studie, Nyheter, Reise, Bibel, Domener og Bilder/logoer (status per rolle og formen
// på svaret) før serverfilene samles i server/{skjold,rom,studie,nyheter,reise,bibel,domener,bilder,logos}/ (Fase 2b). Omstruktureringen
// skal ikke endre stier, statuskoder eller felt. Flere ruter går gjennom lag (mellomvare som legger på felt etter next()), så formen
// sjekkes to nivåer ned.
//
// Fasiten ligger i test/fixtures/innhold-ruter.json. Den lages på nytt med INNHOLD_RUTER_SKRIV=1 (bare når en endring i svarene er
// bevisst). Rollene: A = admin (eier), I = vanlig bruker (økt), TI = samme bruker med app-token (mobil), N = ikke innlogget.
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-innhold-ruter-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-innh';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const h = { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
  const r = await app.request(path, { method, redirect: 'manual', headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers, type: r.headers.get('content-type') ?? '' };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const ACOOKIE = await login('sebastian', 'testpassord1');
const A = as({ cookie: ACOOKIE });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const ICOOKIE = await login('ingrid', 'ingridPassord123');
const I = as({ cookie: ICOOKIE });
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'ingrid', password: 'ingridPassord123', device: 'iPhone' } })).json?.token;
assert.ok(tok);
const TI = as({ authorization: `Bearer ${tok}` });
const N = as({});

/**
 * Formen på et svar: nøklene to nivåer ned. En liste blir formen til alle elementene slått sammen (mockdata kan ha felt som bare
 * noen elementer har). Verdiene (tall, tekst, tider) er ikke med.
 */
function merge(a, b) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (Array.isArray(a) && Array.isArray(b)) return a.length || b.length ? [merge(a[0], b[0])] : [];
  if (a && typeof a === 'object' && b && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map((k) => [k, merge(a[k], b[k])]));
  }
  return typeof a === 'object' || (a && !b) ? a : b; // objekt/liste vinner over tom verdi (null)
}
// Lister med bare «…» eller enkle verdier (innholdet er ikke del av formen) og tomme lister er samme form: om dagens bibelvers har vers før
// seg, eller om «I kveld» har noen titler, avhenger av data og dato, ikke av koden.
const loose = (v) => Array.isArray(v) ? (v.every((x) => x === '…' || x === '') ? [] : v.map(loose)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, loose(x)])) : v;
function shape(v, depth = 2) {
  if (Array.isArray(v)) return v.length ? [v.map((x) => (depth > 0 ? shape(x, depth - 1) : '…')).reduce(merge)] : [];
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, depth > 0 ? shape(v[k], depth - 1) : (v[k] && typeof v[k] === 'object' ? (Array.isArray(v[k]) ? '[]' : '{}') : '')]));
  }
  return '';
}
const out = (r) => (r.json != null ? shape(r.json) : `${r.type.split(';')[0]}`);

// Rutene klientene bruker uten parametre (pluss noen med faste parametre). Ruter med svar som avhenger av klokka eller tilfeldig
// mockdata er tatt ut.
const GETS = [
  // Skjold Lab
  '/api/skjold', '/api/skjold/ai/settings', '/api/skjold/cabinets', '/api/skjold/categories', '/api/skjold/export.csv', '/api/skjold/free',
  '/api/skjold/history', '/api/skjold/labels', '/api/skjold/leds/settings', '/api/skjold/leds/status', '/api/skjold/parts', '/api/skjold/picklist',
  '/api/skjold/presets', '/api/skjold/projects', '/api/skjold/suggest?q=motstand', '/api/skjold/trash', '/api/skjold/parts?q=M3',
  // Rom
  '/api/space/tle', '/api/space/apod', '/api/space/apod?days=7', '/api/space/mars', '/api/rom/apod', '/api/rom/mars', '/api/rom/satellites',
  '/api/rom/settings', '/api/rom/tle', '/api/space/gallery/hubble',
  // Studie
  '/api/study/documents', '/api/study/overview', '/api/studie/docs', '/api/study/documents/999999/file',
  // Nyheter
  '/api/rss', '/api/rss/categories', '/api/rss/foryou', '/api/rss/interests', '/api/rss/settings', '/api/rss/summary?cat=siste',
  '/api/rss/favicon?domain=nrk.no', '/api/rss/article?url=https%3A%2F%2Fukjent.example%2Fa', '/api/news', '/api/news/glimt/prefs',
  '/api/news/glimt/sources', '/api/news/saved', '/api/news/saved/finnesikke',
  // Reise
  '/api/ruter', '/api/ruter/my-routes', '/api/ruter/my-trip', '/api/ruter/school-zones', '/api/ruter/school50', '/api/ruter/journey',
  '/api/ruter/settings',
  // Bibel
  '/api/bible/today', '/api/bible/next', '/api/bible/plan', '/api/bible/saved', '/api/bible/settings', '/api/bible/stats', '/api/bible/users',
  // Domener og Google Search Console
  '/api/domains/summary', '/api/domener/sammendrag', '/api/domains/overview', '/api/domains/overview?domain=kristo.no', '/api/domains/gsc/sites',
  '/api/domains/import', '/api/domains/kristo.no/gsc', '/api/domains/kristo.no/summary', '/api/domains/kristo.no/gsc/test', '/api/gsc',
  '/api/gsc/test?domain=kristo.no', '/domains/api/domains', '/domains/api/vendor/nordic.json',
  // Bilder og logoer
  '/api/bg/gphoto', '/api/background/gphoto', '/finans/api/logos52/match?q=Rema%201000', '/finans/api/logos/registry',
];

async function snapshot() {
  const snap = {};
  for (const p of GETS) {
    const rs = { A: await A(p), I: await I(p), TI: await TI(p), N: await N(p) };
    snap[`GET ${p}`] = { status: Object.values(rs).map((r) => r.status).join(' '), A: out(rs.A), I: out(rs.I) };
  }
  const put = (k, r) => { snap[k] = { status: String(r.status), A: out(r) }; };
  // Skjold Lab: skap, del, endring, plukkliste, prosjekt og utsjekk
  const cab = await I('/api/skjold/cabinets', 'POST', { name: 'Låseskap', rows: 4, cols: 3 });
  put('POST /api/skjold/cabinets', cab);
  const cabId = cab.json?.id ?? cab.json?.cabinet?.id;
  const part = await I('/api/skjold/parts', 'POST', { name: 'Motstand 10 kΩ', category: 'Motstander', qty: 20, cabinetId: cabId, row: 1, col: 1 });
  put('POST /api/skjold/parts', part);
  const partId = part.json?.id ?? part.json?.part?.id;
  put('PATCH /api/skjold/parts/:id', await I(`/api/skjold/parts/${partId}`, 'PATCH', { qty: 15 }));
  put('GET /api/skjold/parts/:id', await I(`/api/skjold/parts/${partId}`));
  put('GET /api/skjold/parts/:id (annen bruker)', await A(`/api/skjold/parts/${partId}`));
  put('PUT /api/skjold/picklist', await I('/api/skjold/picklist', 'PUT', { items: [{ partId, qty: 2 }] }));
  const proj = await I('/api/skjold/projects', 'POST', { name: 'Låseprosjekt' });
  put('POST /api/skjold/projects', proj);
  put('POST /api/skjold/checkout', await I('/api/skjold/checkout', 'POST', { projectId: proj.json?.id ?? proj.json?.project?.id, items: [{ partId, qty: 1 }] }));
  put('POST /api/skjold/ai/suggest', await I('/api/skjold/ai/suggest', 'POST', { text: 'motstand brun svart oransje gull' }));
  put('DELETE /api/skjold/parts/:id', await I(`/api/skjold/parts/${partId}`, 'DELETE'));
  // Rom
  put('PUT /api/rom/settings', await I('/api/rom/settings', 'PUT', { marsNotify: false }));
  put('PUT /api/rom/settings (ugyldig)', await I('/api/rom/settings', 'PUT', { marsNotify: 'ja' }));
  // Studie: tekstfil med emner
  const fd = new FormData();
  fd.append('file', new Blob(['Vitnemål\nINF1000 Introduksjon til programmering 10 A\nMAT1100 Kalkulus 10 B\n'], { type: 'text/plain' }), 'vitnemal.txt');
  const sd = await req('/api/study/documents', { method: 'POST', headers: { cookie: ICOOKIE }, raw: fd });
  put('POST /api/study/documents', sd);
  const docId = sd.json?.doc?.id;
  put('GET /api/study/documents/:id', await I(`/api/study/documents/${docId}`));
  put('GET /api/study/documents/:id (annen bruker)', await A(`/api/study/documents/${docId}`));
  put('PUT /api/study/documents/:id/courses', await I(`/api/study/documents/${docId}/courses`, 'PUT', { emner: [{ kode: 'INF1000', navn: 'Programmering', sp: 10, karakter: 'A' }] }));
  const sf = await req(`/api/study/documents/${docId}/file`, { headers: { cookie: ICOOKIE } });
  snap['GET /api/study/documents/:id/file'] = { status: String(sf.status), A: `${sf.type.split(';')[0]} csp=${sf.headers.get('content-security-policy')} xfo=${sf.headers.get('x-frame-options')}` };
  put('DELETE /api/study/documents/:id', await I(`/api/study/documents/${docId}`, 'DELETE'));
  // Nyheter
  put('POST /api/rss/categories', await I('/api/rss/categories', 'POST', { name: 'Låsing', keywords: ['lås'] }));
  put('POST /api/rss/interests', await I('/api/rss/interests', 'POST', { word: 'fotball' }));
  put('PUT /api/rss/settings', await I('/api/rss/settings', 'PUT', { summary: false }));
  put('POST /api/rss/feeds (ugyldig)', await I('/api/rss/feeds', 'POST', { url: 'ikke en adresse' }));
  put('POST /api/news/glimt', await I('/api/news/glimt', 'POST', { period: 'uke' }));
  put('POST /api/glimt/news-digest', await I('/api/glimt/news-digest', 'POST', { period: 'uke' }));
  put('PUT /api/news/glimt/prefs', await I('/api/news/glimt/prefs', 'PUT', { length: 'lang' }));
  put('POST /api/news/saved (privat adresse)', await I('/api/news/saved', 'POST', { url: 'http://127.0.0.1/hemmelig', title: 'Lokal' }));
  // Reise
  put('PUT /api/ruter/settings', await I('/api/ruter/settings', 'PUT', { homeCard: 'off' }));
  put('POST /api/ruter/journey/hide', await I('/api/ruter/journey/hide', 'POST', {}));
  // Bibel
  put('PUT /api/bible/settings', await I('/api/bible/settings', 'PUT', { enabled: true }));
  put('POST /api/bible/read', await I('/api/bible/read', 'POST', {}));
  put('PUT /api/bible/users/:id (bruker)', await I('/api/bible/users/ingrid', 'PUT', { enabled: true }));
  // Domener
  put('POST /api/domains/token/verify (bruker)', await I('/api/domains/token/verify', 'POST', { token: 'x' }));
  put('POST /api/domains/token/verify (admin)', await A('/api/domains/token/verify', 'POST', { token: '' }));
  put('POST /api/gsc/site (admin, ugyldig)', await A('/api/gsc/site', 'POST', { domain: 'kristo.no', siteUrl: 'ikke gyldig' }));
  put('POST /api/gsc/site (bruker)', await I('/api/gsc/site', 'POST', { domain: 'kristo.no', siteUrl: 'sc-domain:kristo.no' }));
  put('POST /api/gsc/service-account (admin, ugyldig)', await A('/api/gsc/service-account', 'POST', { json: '{' }));
  put('POST /api/domains/:domain/gsc/refresh (admin)', await A('/api/domains/kristo.no/gsc/refresh', 'POST', {}));
  put('POST /domains/api/domains (bruker)', await I('/domains/api/domains', 'POST', { name: 'eksempel.no' }));
  // Logoer
  put('POST /finans/api/logos52/batch', await TI('/finans/api/logos52/batch', 'POST', { names: ['Rema 1000', 'Kiwi', 'Ukjent butikk'] }));
  return snap;
}

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'innhold-ruter.json');

test('Skjold Lab, Rom, Studie, Nyheter, Reise, Bibel, Domener og logoer: status og svarform er uendret', async () => {
  const snap = await snapshot();
  if (process.env.INNHOLD_RUTER_SKRIV === '1') { writeFileSync(FIX, JSON.stringify(snap, null, 1) + '\n'); return; }
  const want = JSON.parse(readFileSync(FIX, 'utf8'));
  assert.deepEqual(Object.keys(snap), Object.keys(want));
  for (const k of Object.keys(want)) assert.deepEqual(loose(snap[k]), loose(want[k]), k);
});

test('bakgrunnsjobbene i Rom, Nyheter, Domener og Bilder går via den felles planleggeren (ikke aktive i test)', async () => {
  const { listJobs } = await import('../server/jobs/index.js');
  const jobs = listJobs().filter((j) => /^(rom|nyheter|domener|bilder)\./.test(j.name));
  assert.deepEqual(jobs.map((j) => [j.name, j.everyMs]).sort(), [['bilder.gphoto', 3_600_000], ['domener.daglig', 60_000], ['domener.oppetid', 300_000], ['nyheter.rss', 600_000], ['rom.mars', 21_600_000]]);
  assert.ok(jobs.every((j) => !j.active));
});
