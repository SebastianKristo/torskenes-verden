// Prompt 70 (MEDIA70): Media på web i nytt design – Oversikt, Kalender, Bibliotek og Nedlastinger som egne adresser.
// Serverdelen: små lesefelt de nye sidene trenger (?from= i /upcoming, torrent.ratio, serie.nextAiring/added, film.added).
// Klientdelen: statiske sjekker av rutene og at alle funksjonene fra før fortsatt er koblet til (Playwright-sjekken ligger utenfor npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p70m-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-70m';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4570';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.DOCKER_HOST;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
const login = async () => {
  const r = await req('/api/login', { method: 'POST', body: { username: 'Sebastian', password: 'testpassord1' } });
  assert.equal(r.status, 200, r.text);
  return { cookie: (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid=')) };
};
const addDays = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

test('upcoming: ?from= gir en hel uke fra valgt dag, today følger ekte dato', async () => {
  const h = await login();
  const a = await req('/api/media/upcoming?days=7', { headers: h });
  assert.equal(a.status, 200, a.text);
  const today = a.body.from;
  assert.equal(a.body.days[0].today, true);
  const from = addDays(today, -7);
  const b = await req(`/api/media/upcoming?days=7&from=${from}`, { headers: h });
  assert.equal(b.status, 200, b.text);
  assert.equal(b.body.from, from);
  assert.equal(b.body.days.length, 7);
  assert.equal(b.body.days.some((d) => d.today), false, 'forrige uke har ingen «i dag»');
  for (const x of b.body.items) assert.ok(x.date >= from && x.date <= addDays(from, 6), x.date);
  // Ugyldig eller langt unna → som før (fra i dag)
  const c = await req('/api/media/upcoming?days=7&from=1999-01-01', { headers: h });
  assert.equal(c.body.from, today);
  const d = await req('/api/media/upcoming?days=7&from=tull', { headers: h });
  assert.equal(d.body.from, today);
});

test('torrents har ratio, serier har nextAiring/added og filmer added (felt finnes)', async () => {
  const h = await login();
  const t = await req('/api/media/torrents?filter=all', { headers: h });
  assert.equal(t.status, 200, t.text);
  assert.ok(t.body.items.length > 0);
  for (const x of t.body.items) assert.ok('ratio' in x, 'ratio');
  const s = await req('/api/media/series', { headers: h });
  for (const x of s.body.items) { assert.ok('nextAiring' in x); assert.ok('added' in x); }
  const m = await req('/api/media/movies', { headers: h });
  for (const x of m.body.items) assert.ok('added' in x);
});

test('web: fire faner som egne adresser, gamle adresser virker, funksjonene er koblet til', () => {
  const m43 = readFileSync(new URL('../public/js/media43.js', import.meta.url), 'utf8');
  const m70 = readFileSync(new URL('../public/js/media70.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/css/media70.css', import.meta.url), 'utf8');
  // Ruter
  assert.match(m43, /TAB_SLUG = \{ ov: '', kal: 'kalender', bib: 'bibliotek', ned: 'nedlastinger', av: 'avspilling' \}/);
  for (const old of ['kommer', 'sonarr', 'radarr', 'qbittorrent', 'prowlarr', 'avspilling']) assert.match(m43, new RegExp(`${old}: '(kal|bib|ned|av)'`), old);
  assert.match(m43, /'\/filmer'/);
  // Topplinja: Tilbake, fanene i rekkefølge, Glimt med ⌘K, servervelger og varsler
  assert.match(m70, /\[\['ov', 'Oversikt'\], \['kal', 'Kalender'\], \['bib', 'Bibliotek'\], \['ned', 'Nedlastinger'\]\]/);
  assert.match(m70, /‹ Tilbake/);
  assert.match(m70, /⌘K/);
  assert.match(m43, /e\.key\?\.toLowerCase\(\) === 'k'/);
  assert.match(m43, /top70\(srvHtml\(\)/);
  // Funksjonene fra før: legg til, serieside, interaktivt søk, magnet, indekser, slett, rydd uovervåkede, servervalg
  for (const a of ['data-m43="add"', 'data-m43-open', 'data-m43="mag"', 'data-m43="ixadd"', 'data-m43="testall"', 'data-m43-tmore', 'data-m43-tdel', 'data-m43-ttog', 'data-m45-unmon="all"', 'data-m43="alt"', 'data-m43="pauseall"', 'data-m43-itest', 'data-m43-sync']) assert.ok(m70.includes(a), a);
  for (const f of ['function srchHtml', 'function detHtml', 'function sheetHtml', 'function glimt(', 'data-m44-site']) assert.ok(m43.includes(f), f);
  // Nedlastinger: filtre, sortering, avkrysning med handlingslinje, grupper, lagring og kilder
  for (const s of ["'Laster ned'", "'I kø'", "'Ferdige'", "'Står fast'", "'Nyeste'", "'Størst'", 'Stopp deling', 'Slett med filer', "'I dag'", "'I går'", "'Tidligere denne uka'", 'Rydd ferdige over 30 dager', 'Nedlastinger som bare deles', 'Test alle', '+ Indekser', '+ Magnet-lenke', 'Neste ventede']) assert.ok(m70.includes(s), s);
  // Kalender og Oversikt
  for (const s of ['Uka i tall', 'Ikke overvåket', 'Spilles nå', 'Tjenester', 'Klar til å se', 'Neste 7 dager', 'Åpne kalenderen', '&from=']) assert.ok(m70.includes(s), s);
  // Design: farger, maks bredde og mørkt tema
  for (const s of ['#F3F0E9', '#FCFBF7', '#E3DED3', 'max-width:1360px', '.m43.m70.dk', '@media (max-width:900px)']) assert.ok(css.includes(s), s);
  // Bare transform/opacity animeres
  for (const m of css.matchAll(/transition:([^;}]+)/g)) assert.match(m[1], /^(transform|opacity)\b/, m[1]);
  // Ingen nøkler eller tjenesteadresser i klienten utover det serveren gir admin
  assert.doesNotMatch(m70, /api[_-]?key|X-Api-Key/i);
});
