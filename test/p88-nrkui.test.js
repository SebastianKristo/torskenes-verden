// Prompt 88 (NRKUI, fasit «Media NRK.dc.html» i pakke 58): søk og serieside på web, og bilde på «Serier du følger».
//  - GET /serie/:sid og /serie/:sid/sesong/:navn sendes videre fra nrk-dl (id-ene valideres, bilder via bildeproxyen, cache).
//  - GET /jobber legger bilde (bildeproxyen) og radio på hvert følg-objekt; bildet huskes per følg-id på serveren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p88ui-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-88u';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.NRK_DL_URL;
delete process.env.NRK_DL_TOKEN;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const { updateConfig } = await import('../server/settings.js');
const { OWNER, kv } = await import('../server/db.js');
const nrk = await import('../server/nrkdl.js');

const TOKEN = 'hemmelig-token-88u', ADR = 'http://nrk.p88u:8020';
const LAN = { incoming: { socket: { remoteAddress: '192.168.1.20' } } };
const l = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) }, LAN);
assert.equal(l.status, 200);
const cookie = l.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
const req = async (path, method = 'GET', body) => {
  const r = await app.request(`/api/media/nrk${path}`, { method, headers: { 'content-type': 'application/json', cookie }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }, LAN);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: j, text };
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const vent = (ms = 20) => new Promise((r) => setTimeout(r, ms));

const SERIE = { id: 'exit', tittel: 'Exit', beskrivelse: 'Fire venner', kategori: 'Drama', bilde: 'https://gfx.nrk.no/exit-bak', plakat: 'https://gfx.nrk.no/exit-plakat',
  sesonger: [{ navn: '1', tittel: 'Sesong 1', tilgjengelig: false }, { navn: '2', tittel: 'Sesong 2', tilgjengelig: true }, { navn: '../x', tittel: 'Ond' }], folger: true, internt: 'skal-ikke-ut' };
const EP = (n, o = {}) => ({ id: `MSUI${String(n).padStart(8, '0')}`, tittel: `${n}. Pilot`, undertittel: 'Noe skjer', dato: '2026-01-05', varighet: 2520, bilde: 'https://gfx.nrk.no/ep', kan: true, label: null, lastetNed: false, iKo: false, url: 'https://evil.example/x', ...o });
let kall = [], folger = [];
function mock() {
  kall = [];
  nrk._resetNrk();
  nrk._setFetchNrk(async (url, init = {}) => {
    const u = new URL(url), P = u.pathname, m = init.method ?? 'GET';
    kall.push(`${m} ${P}${u.search}`);
    if (init.headers?.Authorization !== `Bearer ${TOKEN}`) return json({ feil: 'Mangler eller feil token' }, 401);
    if (P === '/api/sok') return json({ treff: [
      { art: 'radio', id: 'abels_taarn', tittel: 'Abels tårn', bilde: 'https://gfx.nrk.no/abel', url: 'https://radio.nrk.no/podkast/abels_taarn' },
      { art: 'serie', id: 'skam', tittel: 'Skam', bilde: 'https://gfx.nrk.no/skam', url: 'https://tv.nrk.no/serie/skam' },
    ] });
    if (P === '/api/serie/exit') return json(SERIE);
    if (P === '/api/serie/skam') return json({ id: 'skam', tittel: 'Skam', bilde: null, plakat: null, sesonger: [] });
    if (P === '/api/serie/lykkeland') return json({ id: 'lykkeland', tittel: 'Lykkeland', bilde: 'https://gfx.nrk.no/lk', plakat: null, sesonger: [] });
    if (P === '/api/serie/exit/sesong/2') return json({ serie: 'exit', navn: '2', tittel: 'Sesong 2', episoder: [EP(1, { lastetNed: true }), EP(2, { iKo: true }), EP(3, { kan: false, label: 'Kommer 24. nov.' }), EP(4, { bilde: 'http://169.254.169.254/x' }), { id: 'tull' }, null] });
    if (P.startsWith('/api/serie/')) return json({ feil: 'Fant ikke dette hos NRK' }, 404);
    if (P === '/api/jobber' && m === 'GET') return json({ jobber: [], folger });
    if (P === '/api/folger' && m === 'POST') { const b = JSON.parse(init.body); const f = { id: b.url.includes('radio') ? 'a2a2a2a2a2a2' : 'a1a1a1a1a1a1', url: b.url, type: b.type, tittel: b.tittel }; folger.push(f); return json(f); }
    if (/^\/api\/folger\/[a-f0-9]{12}$/.test(P) && m === 'DELETE') { folger = folger.filter((f) => !P.endsWith(f.id)); return json({ ok: true }); }
    return json({ detail: 'Not Found' }, 404);
  });
}
test.after(() => { nrk._setFetchNrk(null); });

test('ikke satt opp: serie og sesong svarer configured:false uten kall; ugyldige id-er gir 400', async () => {
  mock();
  for (const p of ['/serie/exit', '/serie/exit/sesong/2']) {
    const r = await req(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.body.configured, false);
  }
  for (const p of ['/serie/Exit', '/serie/_x', '/serie/exit/sesong/a.b', `/serie/${'a'.repeat(102)}`, '/serie/exit/sesong/%2E%2E']) assert.ok([400, 404].includes((await req(p)).status), p);
  assert.equal((await req('/serie/Exit')).status, 400);
  assert.equal((await req('/serie/exit/sesong/a.b')).status, 400);
  assert.equal(kall.length, 0);
});

test('GET /serie/:sid: bare kjente felter, bilder via proxyen, sesonger validert, cache', async () => {
  updateConfig({ nrk_url: ADR, nrk_token: TOKEN }, OWNER);
  mock();
  const r = await req('/serie/exit');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { configured: true, tilgjengelig: true, id: 'exit', tittel: 'Exit', beskrivelse: 'Fire venner', kategori: 'Drama',
    bilde: `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/exit-bak')}`, plakat: `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/exit-plakat')}`,
    url: 'https://tv.nrk.no/serie/exit', sesonger: [{ navn: '1', tittel: 'Sesong 1', tilgjengelig: false }, { navn: '2', tittel: 'Sesong 2', tilgjengelig: true }], folger: true });
  assert.doesNotMatch(r.text, /skal-ikke-ut|nrk\.p88u|hemmelig/);
  await req('/serie/exit');
  assert.equal(kall.filter((k) => k === 'GET /api/serie/exit').length, 1, 'katalog-cachen gjenbrukes');
  assert.equal((await req('/serie/finnes-ikke')).status, 404);
});

test('GET /serie/:sid/sesong/:navn: episoder med kan/label/lastetNed/iKo, egne lenker og trygge bilder', async () => {
  mock();
  const r = await req('/serie/exit/sesong/2');
  assert.equal(r.status, 200);
  assert.equal(r.body.tilgjengelig, true);
  const E = r.body.episoder;
  assert.equal(E.length, 4);
  assert.deepEqual(E[0], { id: 'MSUI00000001', tittel: '1. Pilot', undertittel: 'Noe skjer', dato: '2026-01-05', varighet: 2520, varighetTekst: '42 min', bilde: `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/ep')}`, kan: true, label: '', lastetNed: true, iKo: false, url: 'https://tv.nrk.no/program/MSUI00000001' });
  assert.equal(E[1].iKo, true);
  assert.deepEqual([E[2].kan, E[2].label], [false, 'Kommer 24. nov.']);
  assert.equal(E[3].bilde, null, 'bare bilder fra NRK');
  assert.doesNotMatch(r.text, /evil\.example|169\.254/);
});

test('eldre nrk-dl uten katalog: tilgjengelig:false, ikke en feil', async () => {
  nrk._resetNrk();
  nrk._setFetchNrk(async () => json({ detail: 'Not Found' }, 404));
  assert.deepEqual((await req('/serie/exit')).body, { configured: true, tilgjengelig: false });
  assert.equal((await req('/serie/exit/sesong/2')).body.tilgjengelig, false);
});

test('følg-bilde: fra søketreffet eller katalogen, huskes per følg-id, radio markeres, ryddes ved «Slutt å følge»', async () => {
  mock(); folger = [];
  await req('/sok?q=ab');
  // Følger en podkast fra søket og en serie som allerede ligger i katalog-cachen.
  await req('/serie/exit');
  assert.equal((await req('/folger', 'POST', { url: 'https://radio.nrk.no/podkast/abels_taarn', type: 'radio' })).status, 200);
  assert.equal((await req('/folger', 'POST', { url: 'https://tv.nrk.no/serie/exit', type: 'tv', tittel: 'Exit' })).status, 200);
  await vent();
  const lagret = kv.get(OWNER, 'nrk_folg_bilder', {});
  assert.deepEqual(lagret, { a2a2a2a2a2a2: { u: 'https://gfx.nrk.no/abel', radio: true }, a1a1a1a1a1a1: { u: 'https://gfx.nrk.no/exit-plakat', radio: false } });
  // Uten cache (ny server): bildet kommer fra det som er lagret, uten nye katalogkall.
  nrk._resetNrk(); kall = [];
  const j = await req('/jobber');
  const F = Object.fromEntries(j.body.folger.map((f) => [f.id, f]));
  assert.equal(F.a2a2a2a2a2a2.bilde, `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/abel')}`);
  assert.equal(F.a2a2a2a2a2a2.radio, true);
  assert.equal(F.a1a1a1a1a1a1.bilde, `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/exit-plakat')}`);
  assert.equal(F.a1a1a1a1a1a1.radio, false);
  assert.deepEqual(kall, ['GET /api/jobber']);
  await req('/folger/a2a2a2a2a2a2', 'DELETE');
  assert.deepEqual(Object.keys(kv.get(OWNER, 'nrk_folg_bilder', {})), ['a1a1a1a1a1a1']);
});

test('følg-bilde: ukjent serie hentes én gang i bakgrunnen, så har neste kall bildet', async () => {
  mock(); kv.set(OWNER, 'nrk_folg_bilder', {});
  folger = [{ id: 'b1b1b1b1b1b1', url: 'https://tv.nrk.no/serie/lykkeland', type: 'tv', tittel: 'Lykkeland' }, { id: 'b2b2b2b2b2b2', url: 'https://tv.nrk.no/serie/skam', type: 'tv', tittel: 'Skam' }];
  const a = await req('/jobber');
  assert.equal(a.body.folger[0].bilde, null, 'første kall venter ikke på katalogen');
  await vent();
  const b = await req('/jobber');
  assert.equal(b.body.folger[0].bilde, `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/lk')}`);
  assert.equal(b.body.folger[1].bilde, null, 'serie uten bilde: reserveflaten');
  await req('/jobber');
  assert.equal(kall.filter((k) => k === 'GET /api/serie/skam').length, 1, 'serie uten bilde spørres ikke på hvert kall');
  assert.equal(kv.get(OWNER, 'nrk_folg_bilder', {}).b1b1b1b1b1b1.u, 'https://gfx.nrk.no/lk');
});

/* ---------------- Web ---------------- */

const web = readFileSync(new URL('../public/js/media-nrk.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/media-nrk.css', import.meta.url), 'utf8');

test('web: kort 1 «NRK» med søk, serieside og lenkefelt som sekundært valg (tekstene fra designet)', () => {
  for (const t of ['Søk i NRK TV og NRK Radio', 'Søk etter serier, filmer og podkaster.', 'Har du en lenke?', 'Legg i køen', 'Komprimer (H.265, ca. halv størrelse)',
    'VPN nede – stoppet', '‹ Søk', 'Velg alle tilgjengelige (', 'Fjern valg', 'Følg serien', '✓ Følger serien', 'Lastet ned', 'I kø', 'Ingen episoder tilgjengelig',
    'Følg serien laster ned nye episoder fremover (de to nyeste sesongene), ikke hele arkivet.', 'Du følger ingen serier. Åpne en serie og trykk «Følg serien».']) assert.ok(web.includes(t), t);
  assert.match(web, /\/serie\/\$\{encodeURIComponent\(sid\)\}\/sesong\/\$\{encodeURIComponent\(navn\)\}/);
  assert.match(web, /episoder: valgte\.map\(\(e\) => e\.url\)/);
  assert.match(web, /<details class="nrk-lenke"/);
});

test('web: plakat på «Serier du følger» (48×72, radio 72×72, reserve i Newsreader 12 px) og knapper som brytes på mobil', () => {
  assert.match(css, /\.nrk87 \.nrk-fp\{[^}]*width:48px;height:72px;border-radius:8px/);
  assert.match(css, /\.nrk87 \.nrk-fp\.sq\{width:72px\}/);
  assert.match(css, /\.nrk87 \.nrk-fp b\{[^}]*font:500 12px\/1\.05 Newsreader/);
  assert.match(css, /\.nrk87 \.nrk-fp img\{[^}]*object-fit:cover/);
  assert.match(web, /f\.radio \? ' sq' : ''/);
});
