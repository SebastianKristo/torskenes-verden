// Prompt 87 (pakke 57): NRK-nedlasteren i Media – hele API-et under /api/media/nrk/* (server/nrkdl.js) mot en mocket nrk-dl,
// og web-fanen (public/js/media-nrk.js, public/css/media-nrk.css). Fasit: «Media NRK.dc.html».
//  - Token og adresse til nrk-dl kommer aldri ut. Bare NRK-lenker, type/kvalitet fra listene, id = 12 hex, komprimer = boolean.
//  - Bibliotek-endepunktene finnes kanskje ikke i nrk-dl ennå: 404 uten {feil} → tilgjengelig:false, ikke en feil.
//  - Plakater hentes bare fra NRK sine verter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p87n-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-87n';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.NRK_DL_URL;
delete process.env.NRK_DL_TOKEN;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const { updateConfig } = await import('../server/settings.js');
const { OWNER } = await import('../server/db.js');
const nrk = await import('../server/nrkdl.js');

const TOKEN = 'hemmelig-token-87', ADR = 'http://nrk.p87:8020';
const LAN = { incoming: { socket: { remoteAddress: '192.168.1.20' } } };
const l = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) }, LAN);
assert.equal(l.status, 200);
const cookie = l.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
const req = async (path, method = 'GET', body, medCookie = true) => {
  const r = await app.request(`/api/media/nrk${path}`, { method, headers: { 'content-type': 'application/json', ...(medCookie ? { cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }, LAN);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* ikke JSON */ }
  return { status: r.status, body: j, text, headers: r.headers };
};

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
// nrk-dl sitt katalog-API (grenen «nrk-nedlaster»): /api/sok, /api/serie/{sid}, /api/serie/{sid}/sesong/{navn}, /api/episoder.
const prf = (n) => `MSUI${String(n).padStart(8, '0')}`;
const kep = (n, o = {}) => ({ id: prf(n), tittel: `${n}. episode`, undertittel: 'Noe skjer', varighet: 2520, bilde: 'https://gfx.nrk.no/ep', status: 'available', label: null, kan: true, dato: '2026-01-01', publisert: 1, lastetNed: false, url: `https://tv.nrk.no/program/${prf(n)}`, iKo: false, ...o });
const SERIER = {
  exit: { id: 'exit', type: 'standard', tittel: 'Exit', beskrivelse: 'Fire menn i finansbransjen', kategori: 'Drama', bilde: 'https://gfx.nrk.no/bak', plakat: 'https://gfx.nrk.no/abc123', url: 'https://tv.nrk.no/serie/exit', sesonger: [{ navn: '1', tittel: 'Sesong 1', tilgjengelig: false }, { navn: '2', tittel: 'Sesong 2', tilgjengelig: true }, { navn: '3', tittel: 'Sesong 3', tilgjengelig: true }], folger: true, internt: 'skal-ikke-ut' },
  lykkeland: { id: 'lykkeland', type: 'standard', tittel: 'Lykkeland', beskrivelse: '', kategori: null, bilde: 'https://gfx.nrk.no/lk', plakat: null, url: 'https://tv.nrk.no/serie/lykkeland', sesonger: [{ navn: '1', tittel: 'Sesong 1', tilgjengelig: true }, { navn: 'spesial', tittel: 'Spesial', tilgjengelig: true }], folger: false },
};
const SESONGER = {
  'exit/2': [kep(201, { lastetNed: true }), kep(202, { lastetNed: true })],
  'exit/3': [kep(301, { lastetNed: true }), kep(302, { iKo: true }), kep(303), kep(304, { kan: false, status: 'expired' }), kep(305, { kan: false, status: 'expired', lastetNed: true }), { id: 'tull', tittel: 'Ugyldig', kan: true }, null],
  'lykkeland/1': [kep(11), kep(12, { varighet: null })],
  'lykkeland/spesial': [kep(91, { lastetNed: true })],
};
const JOBBER = [
  { id: 'a1b2c3d4e5f6', url: 'https://tv.nrk.no/serie/exit', type: 'tv', status: 'ferdig', tittel: 'Exit', melding: 'Ferdig', prosent: 100, spart: 2.4e9, filer: ['tv/Exit/x.mkv'], opprettet: 100 },
  { id: 'b1b2c3d4e5f6', url: 'https://tv.nrk.no/serie/lykkeland', urls: [`https://tv.nrk.no/program/${prf(11)}`], type: 'tv', status: 'ko', tittel: 'Lykkeland (2 episoder)', opprettet: 200 },
  { id: 'c1b2c3d4e5f6', url: 'https://tv.nrk.no/program/KOID20001616', type: 'film', status: 'ferdig', tittel: 'Kongens nei', filer: ['movies/Kongens nei/Kongens nei.mkv'], opprettet: 50 },
  { id: 'd1b2c3d4e5f6', url: 'https://radio.nrk.no/podkast/abels_taarn', type: 'radio', status: 'ferdig', tittel: 'Abels tårn', filer: ['podcast/Abels tårn/x.m4a'], opprettet: 40 },
  { id: 'e1b2c3d4e5f6', url: 'https://tv.nrk.no/program/FEIL20001616', type: 'film', status: 'feil', tittel: 'Feilet film', opprettet: 30 },
  { id: 'f1b2c3d4e5f6', url: 'https://tv.nrk.no/serie/borte', type: 'tv', status: 'ferdig', tittel: 'Borte', opprettet: 10 },
];
let kall = [], M = { bib: true, komp: true, vpn: true, mange: false, treg: 0 }, samtidig = 0, maksSamtidig = 0;
const VPN_FEIL = { feil: 'VPN er ikke klar: VPN-en går ut i SE, ikke NO. Ingenting lastes ned.' };
function mock() {
  kall = []; samtidig = 0; maksSamtidig = 0;
  nrk._resetNrk();
  nrk._setFetchNrk(async (url, init = {}) => {
    const u = new URL(url), P = u.pathname, m = init.method ?? 'GET', b = init.body ? JSON.parse(init.body) : undefined;
    kall.push({ m, P, q: u.search, b, auth: init.headers?.Authorization, host: u.host });
    if (init.headers?.Authorization !== `Bearer ${TOKEN}`) return json({ feil: 'Mangler eller feil token' }, 401);
    if (P === '/api/status') return json({ vpn: M.vpn ? { ok: true, ip: '185.21.38.112', land: 'NO', tunnel: 'wg0', feil: null } : { ok: false, ip: '91.1.1.1', land: 'SE', feil: 'VPN-en går ut i SE, ikke NO.' }, ytdlp: '2026.10.26', ledig: 5e11, medier: '/data/media', mapper: { tv: 'tv', film: 'movies', radio: 'podcast' }, tall: { ko: 1, kjorer: 0, ferdig: 2, feil: 0, avbrutt: 0 }, folgTimer: 6, skrivbar: true, ...(M.komp ? { komprimer: { standard: true, crf: 26, preset: 'medium' } } : {}), token: TOKEN, internt: 'skal-ikke-ut' });
    if (P === '/api/jobber' && m === 'GET') return json({ jobber: M.mange ? [{ id: 'a1b2c3d4e5f6', url: 'https://tv.nrk.no/serie/mange', type: 'tv', status: 'ferdig' }] : JOBBER, folger: M.mange ? [] : [{ id: 'f1f1f1f1f1f1', url: 'https://tv.nrk.no/serie/exit', tittel: 'Exit', kvalitet: '1080', sjekket: 1, siste: 'Ingen nye' }] });
    if (P === '/api/jobber' && m === 'POST') return b.url.includes('duplikat') ? json({ feil: 'Lenken er allerede i køen' }, 409) : json({ id: 'abcdefabcdef', ...b, status: 'ko' });
    if (/^\/api\/jobber\/[a-f0-9]{12}(\/(avbryt|igjen))?$/.test(P)) return json({ ok: true });
    if (P === '/api/rydd') return json({ ok: true });
    if (P === '/api/folger' && m === 'POST') return json({ id: 'f2f2f2f2f2f2', ...b });
    if (/^\/api\/folger\/[a-f0-9]{12}(\/sjekk)?$/.test(P)) return json({ ok: true });
    if (M.bib) {
      if (P === '/api/episoder' && m === 'POST') return json({ id: 'abcdefabcdef', url: `https://tv.nrk.no/serie/${b.serie}`, type: 'tv', status: 'ko' });
      const katalog = P === '/api/sok' || P.startsWith('/api/serie/');
      if (katalog && !M.vpn) return json(VPN_FEIL, 503);
      if (P === '/api/sok') return json({ treff: u.searchParams.get('q').length < 2 ? [] : [
        { art: 'serie', id: 'exit', tittel: 'Exit', beskrivelse: 'Drama', bilde: 'https://gfx.nrk.no/abc123', url: 'https://tv.nrk.no/serie/exit', tilgjengelig: true, internt: 'skal-ikke-ut' },
        { art: 'film', id: 'KOID20001616', tittel: 'Kongens nei', beskrivelse: '', bilde: 'http://169.254.169.254/x', url: 'https://tv.nrk.no/program/KOID20001616', tilgjengelig: false },
        { art: 'serie', id: 'ond', tittel: 'Ond', url: 'https://evil.example/serie/ond' },
        { art: 'ukjent', id: 'x', tittel: 'X', url: 'https://tv.nrk.no/x' },
      ] });
      let x = P.match(/^\/api\/serie\/([a-z0-9][a-z0-9_-]{0,100})$/);
      if (x) {
        if (x[1] === 'mange') return json({ id: 'mange', tittel: 'Mange', url: 'https://tv.nrk.no/serie/mange', sesonger: Array.from({ length: 20 }, (_, i) => ({ navn: String(i + 1), tilgjengelig: true })) });
        return SERIER[x[1]] ? json(SERIER[x[1]]) : json({ feil: 'Fant ikke dette hos NRK' }, 404);
      }
      x = P.match(/^\/api\/serie\/([a-z0-9][a-z0-9_-]{0,100})\/sesong\/([A-Za-z0-9_-]{1,60})$/);
      if (x) {
        samtidig++; maksSamtidig = Math.max(maksSamtidig, samtidig);
        if (M.treg) await new Promise((r) => setTimeout(r, M.treg));
        samtidig--;
        if (x[1] === 'mange') return json({ serie: 'mange', navn: x[2], tittel: x[2], episoder: [kep(+x[2])] });
        const E = SESONGER[`${x[1]}/${x[2]}`];
        return E ? json({ serie: x[1], navn: x[2], tittel: `Sesong ${x[2]}`, episoder: E }) : json({ feil: 'Fant ikke dette hos NRK' }, 404);
      }
    }
    return json({ detail: 'Not Found' }, 404); // FastAPI sitt svar på en ukjent rute
  });
}
test.after(() => { nrk._setFetchNrk(null); nrk._setBildeNrk(null); });

test('ikke satt opp: tomtilstand på GET, ingen kall til nrk-dl, og innlogging kreves', async () => {
  mock();
  for (const p of ['/status', '/jobber', '/bibliotek', '/serie?url=https://tv.nrk.no/serie/exit', '/sok?q=exit']) {
    const r = await req(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.body.configured, false, p);
    assert.match(r.body.message, /ikke satt opp/);
  }
  assert.deepEqual((await req('/jobber')).body.jobber, []);
  assert.equal((await req('/bibliotek')).body.tilgjengelig, false);
  assert.deepEqual((await req('/sok?q=exit')).body.treff, []);
  assert.equal((await req('/jobber', 'POST', { url: 'https://tv.nrk.no/serie/exit' })).status, 503);
  assert.equal((await req('/jobber', 'POST', { url: 'https://tv.nrk.no/serie/exit', episoder: [`https://tv.nrk.no/program/${prf(1)}`] })).status, 503);
  assert.equal(kall.length, 0);
  assert.equal((await req('/status', 'GET', undefined, false)).status, 401);
  assert.equal((await req('/bilde?u=https://gfx.nrk.no/x', 'GET', undefined, false)).status, 401);
});

test('status: bare kjente felter, komprimer og bibliotek – aldri token eller adresse', async () => {
  updateConfig({ nrk_url: `${ADR}/`, nrk_token: TOKEN }, OWNER);
  M = { bib: true, komp: true, vpn: true }; mock();
  const r = await req('/status');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { configured: true, vpn: { ok: true, ip: '185.21.38.112', land: 'NO', feil: null }, komprimer: { standard: true, crf: 26, preset: 'medium' }, mapper: { tv: 'tv', film: 'movies', radio: 'podcast' }, tall: { ko: 1, kjorer: 0, ferdig: 2, feil: 0, avbrutt: 0 }, ledig: 5e11, bibliotek: true, ytdlp: '2026.10.26', medier: '/data/media', folgTimer: 6, skrivbar: true });
  assert.doesNotMatch(r.text, /hemmelig|nrk\.p87|skal-ikke-ut|wg0/);
  assert.ok(kall.every((k) => k.auth === `Bearer ${TOKEN}` && k.host === 'nrk.p87:8020'));
  // Eldre nrk-dl: ingen komprimering og ingen bibliotek-endepunkter
  M = { bib: false, komp: false, vpn: false }; mock();
  const g = await req('/status');
  assert.equal(g.body.komprimer, null);
  assert.equal(g.body.bibliotek, false);
  assert.equal(g.body.vpn.ok, false);
  assert.ok(kall.some((k) => k.P === '/api/sok' && k.q === '?q='), 'katalogen sjekkes med GET /api/sok?q=');
  const n = kall.filter((k) => k.P === '/api/sok').length;
  await req('/status');
  assert.equal(kall.filter((k) => k.P === '/api/sok').length, n, 'svaret huskes – ikke nytt forsøk for hver status');
  // VPN-en er nede: 503 {feil} fra /api/sok betyr at katalogen finnes
  M = { bib: true, komp: true, vpn: false }; mock();
  assert.equal((await req('/status')).body.bibliotek, true);
  M = { bib: true, komp: true, vpn: true };
});

test('jobber: liste med spart, og POST validerer lenke, type, kvalitet, komprimer og episoder', async () => {
  mock();
  const j = await req('/jobber');
  assert.equal(j.body.configured, true);
  assert.equal(j.body.jobber[0].spart, 2.4e9);
  assert.equal(j.body.folger[0].tittel, 'Exit');

  const post = () => kall.filter((k) => k.m === 'POST' && k.P === '/api/jobber');
  // Uten komprimer sendes ikke feltet videre (serverens standard gjelder)
  assert.equal((await req('/jobber', 'POST', { url: ' http://tv.nrk.no/serie/exit ', type: 'tv', kvalitet: '1080', folg: true })).status, 200);
  assert.deepEqual(post().pop().b, { url: 'https://tv.nrk.no/serie/exit', type: 'tv', kvalitet: '1080', folg: true });
  assert.equal((await req('/jobber', 'POST', { url: 'https://nrksuper.no/serie/fantorangen', komprimer: false })).status, 200);
  assert.deepEqual(post().pop().b, { url: 'https://nrksuper.no/serie/fantorangen', type: 'auto', kvalitet: 'best', komprimer: false, folg: false });
  assert.equal((await req('/jobber', 'POST', { url: 'https://radio.nrk.no/podkast/x', komprimer: true, kvalitet: 720 })).status, 200);
  assert.equal(post().pop().b.komprimer, true);
  assert.equal(post().pop().b.kvalitet, '720');

  const n = kall.length;
  for (const url of ['https://example.com/serie/x', 'https://nrk.no.evil.com/x', 'https://evilnrk.no/x', 'ftp://tv.nrk.no/x', 'https://bruker:pass@tv.nrk.no/x', 'https://tv.nrk.no:8443/x', 'javascript:alert(1)', '', null, 'http://10.69.1.244:8020/api/status']) {
    const r = await req('/jobber', 'POST', { url });
    assert.equal(r.status, 400, String(url));
    assert.equal(r.body.error, 'Bare lenker fra nrk.no og nrksuper.no.');
  }
  const ok = 'https://tv.nrk.no/serie/exit';
  for (const b of [{ url: ok, type: 'bok' }, { url: ok, kvalitet: '4k' }, { url: ok, komprimer: 'ja' }, { url: ok, komprimer: 1 }, { url: ok, episoder: 'alle' }, { url: ok, episoder: ['https://example.com/x'] }, { url: ok, episoder: Array.from({ length: 201 }, (_, i) => `https://tv.nrk.no/e/${i}`) }]) {
    assert.equal((await req('/jobber', 'POST', b)).status, 400, JSON.stringify(b).slice(0, 80));
  }
  assert.equal(kall.length, n, 'ugyldige kall når aldri nrk-dl');

  // Episoder: oversettes til POST /api/episoder {serie, episoder:[PRF]} (store bokstaver, uten duplikater)
  const E = [`https://tv.nrk.no/program/${prf(304).toLowerCase()}`, `https://tv.nrk.no/serie/exit/sesong/3/episode/${prf(305)}`, `https://tv.nrk.no/program/${prf(304)}`];
  const foer = post().length;
  assert.equal((await req('/jobber', 'POST', { url: ok, type: 'tv', episoder: E })).status, 200);
  assert.equal(post().length, foer, 'episoder går ikke til /api/jobber');
  const epi = () => kall.filter((k) => k.m === 'POST' && k.P === '/api/episoder');
  assert.deepEqual(epi().pop().b, { serie: 'exit', episoder: [prf(304), prf(305)], kvalitet: 'best', folg: false });
  assert.equal((await req('/jobber', 'POST', { url: 'https://tv.nrk.no/serie/exit/sesong/3', type: 'tv', kvalitet: '720', komprimer: true, folg: true, tittel: '  Exit  ', episoder: [`https://tv.nrk.no/program/${prf(303)}`] })).status, 200);
  assert.deepEqual(epi().pop().b, { serie: 'exit', tittel: 'Exit', episoder: [prf(303)], kvalitet: '720', komprimer: true, folg: true });
  assert.equal((await req('/jobber', 'POST', { url: ok, komprimer: false, episoder: [`https://tv.nrk.no/program/${prf(303)}`] })).status, 200);
  assert.equal(epi().pop().b.komprimer, false);
  assert.equal((await req('/jobber', 'POST', { url: ok, episoder: Array.from({ length: 200 }, (_, i) => `https://tv.nrk.no/program/${prf(i)}`) })).status, 200);
  assert.equal(epi().pop().b.episoder.length, 200);
  assert.equal((await req('/jobber', 'POST', { url: ok, episoder: [] })).status, 200);
  assert.equal('episoder' in post().pop().b, false);
  assert.equal((await req('/jobber', 'POST', { url: ok, tittel: 'Exit' })).status, 200);
  assert.deepEqual(post().pop().b, { url: ok, type: 'auto', kvalitet: 'best', folg: false }, 'tittel gjelder bare episoder');
  // Ugyldige episodelenker (nummer i stedet for PRF-id) eller en lenke som ikke er en serie → 400, ingen kall
  const m = kall.length;
  for (const b of [
    { url: ok, episoder: ['https://tv.nrk.no/serie/exit/sesong/3/episode/4'] },
    { url: ok, episoder: [`https://tv.nrk.no/program/${prf(1)}`, 'https://tv.nrk.no/serie/exit'] },
    { url: 'https://tv.nrk.no/program/KOID20001616', episoder: [`https://tv.nrk.no/program/${prf(1)}`] },
    { url: 'https://radio.nrk.no/serie/exit', episoder: [`https://tv.nrk.no/program/${prf(1)}`] },
    { url: 'https://tv.nrk.no/serie/Ex%20it', episoder: [`https://tv.nrk.no/program/${prf(1)}`] },
  ]) {
    const r = await req('/jobber', 'POST', b);
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.equal(r.body.error, 'Episodene må være lenker til enkeltprogrammer på tv.nrk.no');
  }
  assert.equal(kall.length, m);

  // 409 fra nrk-dl (allerede i køen) sendes videre som 409 med norsk tekst
  const d = await req('/jobber', 'POST', { url: 'https://tv.nrk.no/serie/duplikat' });
  assert.equal(d.status, 409);
  assert.match(d.body.error, /allerede i køen/);
});

test('eldre nrk-dl: episoder stoppes (ellers ville hele serien blitt lastet ned), bibliotek og serie sier tilgjengelig:false', async () => {
  M = { bib: false, komp: false, vpn: true }; mock();
  const r = await req('/jobber', 'POST', { url: 'https://tv.nrk.no/serie/exit', episoder: [`https://tv.nrk.no/program/${prf(304)}`] });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'Biblioteket krever en nyere versjon av nrk-dl.');
  assert.equal(kall.filter((k) => k.m === 'POST').length, 0);
  assert.equal((await req('/jobber', 'POST', { url: 'https://tv.nrk.no/serie/exit' })).status, 200, 'vanlig nedlasting virker som før');
  const b = await req('/bibliotek');
  assert.equal(b.status, 200);
  assert.deepEqual(b.body, { configured: true, tilgjengelig: false, elementer: [] });
  const s = await req('/serie?url=https://tv.nrk.no/serie/exit');
  assert.equal(s.status, 200);
  assert.deepEqual(s.body, { configured: true, tilgjengelig: false });
  assert.deepEqual((await req('/sok?q=exit')).body, { configured: true, tilgjengelig: false, treff: [] });
  assert.ok(!kall.some((k) => k.P.startsWith('/api/serie/')), 'ingen serieoppslag mot en nrk-dl uten katalog');
  M = { bib: true, komp: true, vpn: true };
});

test('nrk-dl byttet til en eldre versjon mens svaret er husket: episoder gir 409, ikke hele serien', async () => {
  M = { bib: true, komp: true, vpn: true }; mock();
  assert.equal((await req('/status')).body.bibliotek, true);
  M.bib = false;
  const r = await req('/jobber', 'POST', { url: 'https://tv.nrk.no/serie/exit', episoder: [`https://tv.nrk.no/program/${prf(304)}`] });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'Biblioteket krever en nyere versjon av nrk-dl.');
  assert.ok(!kall.some((k) => k.m === 'POST' && k.P === '/api/jobber'));
  assert.equal((await req('/status')).body.bibliotek, false);
  M = { bib: true, komp: true, vpn: true };
});

test('id-er må være 12 hex-tegn; handlingene går til riktig sti i nrk-dl', async () => {
  mock();
  for (const [p, m] of [['/jobber/../../etc/avbryt', 'POST'], ['/jobber/ABCDEF123456/igjen', 'POST'], ['/jobber/123', 'DELETE'], ['/folger/a1b2c3d4e5f6x/sjekk', 'POST'], ['/folger/zzzzzzzzzzzz', 'DELETE']]) {
    const r = await req(p, m, m === 'POST' ? {} : undefined);
    assert.ok(r.status === 400 || r.status === 404, `${p} → ${r.status}`);
  }
  assert.equal(kall.length, 0);
  assert.equal((await req('/jobber/a1b2c3d4e5f6/avbryt', 'POST', {})).status, 200);
  assert.equal((await req('/jobber/a1b2c3d4e5f6/igjen', 'POST', {})).status, 200);
  assert.equal((await req('/jobber/a1b2c3d4e5f6', 'DELETE')).status, 200);
  assert.equal((await req('/rydd', 'POST', {})).status, 200);
  assert.equal((await req('/folger/f1f1f1f1f1f1/sjekk', 'POST', {})).status, 200);
  assert.equal((await req('/folger/f1f1f1f1f1f1', 'DELETE')).status, 200);
  assert.deepEqual(kall.map((k) => `${k.m} ${k.P}`), ['POST /api/jobber/a1b2c3d4e5f6/avbryt', 'POST /api/jobber/a1b2c3d4e5f6/igjen', 'DELETE /api/jobber/a1b2c3d4e5f6', 'POST /api/rydd', 'POST /api/folger/f1f1f1f1f1f1/sjekk', 'DELETE /api/folger/f1f1f1f1f1f1']);
});

test('følg: tittel og komprimer sendes videre når de er satt', async () => {
  mock();
  assert.equal((await req('/folger', 'POST', { url: 'https://tv.nrk.no/serie/exit', type: 'tv', kvalitet: '1080', tittel: '  Exit  ', komprimer: true })).status, 200);
  assert.deepEqual(kall.pop().b, { url: 'https://tv.nrk.no/serie/exit', type: 'tv', kvalitet: '1080', komprimer: true, tittel: 'Exit' });
  assert.equal((await req('/folger', 'POST', { url: 'https://tv.nrk.no/serie/exit' })).status, 200);
  assert.deepEqual(kall.pop().b, { url: 'https://tv.nrk.no/serie/exit', type: 'auto', kvalitet: 'best' });
  assert.equal((await req('/folger', 'POST', { url: 'https://vg.no/x' })).status, 400);
  assert.equal((await req('/folger', 'POST', { url: 'https://tv.nrk.no/serie/exit', komprimer: 'nei' })).status, 400);
});

test('bibliotek: bygges fra følger + jobber via katalogen, status oversatt, uten utilgjengelige episoder', async () => {
  mock();
  const r = await req('/bibliotek');
  assert.equal(r.status, 200);
  assert.equal(r.body.tilgjengelig, true);
  assert.equal('feil' in r.body, false);
  assert.deepEqual(r.body.elementer.map((x) => x.id), ['exit', 'lykkeland', 'https://tv.nrk.no/program/KOID20001616', 'https://radio.nrk.no/podkast/abels_taarn'], 'følger først, så jobbene (nyeste først); serien som ikke finnes hoppes over; feilet film tas ikke med');
  const [exit, lk, film, abel] = r.body.elementer;
  assert.deepEqual(Object.keys(exit), ['id', 'tittel', 'type', 'url', 'bilde', 'meta', 'beskrivelse', 'sesonger']);
  assert.equal(exit.type, 'tv');
  assert.equal(exit.url, 'https://tv.nrk.no/serie/exit');
  assert.equal(exit.meta, 'Drama · 3 sesonger');
  assert.equal(exit.beskrivelse, 'Fire menn i finansbransjen');
  assert.equal(exit.bilde, `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/abc123')}`, 'plakaten foran bakgrunnsbildet');
  assert.deepEqual(exit.sesonger.map((x) => x.nr), [2, 3], 'sesong 1 er ikke tilgjengelig og hentes ikke');
  assert.ok(!kall.some((k) => k.P === '/api/serie/exit/sesong/1'));
  const s3 = exit.sesonger[1].episoder;
  assert.deepEqual(s3.map((e) => [e.nr, e.status]), [[1, 'lastet'], [2, 'ko'], [3, 'mangler'], [5, 'lastet']], 'utgått og ikke lastet ned (nr 4) er borte; ugyldige id-er hoppes over');
  assert.deepEqual(s3[2], { nr: 3, tittel: '303. episode', varighet: 2520, varighetTekst: '42 min', url: `https://tv.nrk.no/program/${prf(303)}`, fil: null, status: 'mangler' });
  assert.equal(lk.meta, '2 sesonger');
  assert.equal(lk.bilde, `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/lk')}`, 'uten plakat brukes bildet');
  assert.deepEqual(lk.sesonger.map((x) => x.nr), [1, 2], 'sesongnavn uten tall får indeks + 1');
  assert.equal(lk.sesonger[0].episoder[1].varighet, null);
  assert.equal(film.type, 'film');
  assert.equal(film.bilde, null);
  assert.deepEqual(film.sesonger, [{ nr: 1, episoder: [{ nr: 1, tittel: 'Kongens nei', varighet: null, varighetTekst: '', url: 'https://tv.nrk.no/program/KOID20001616', fil: 'movies/Kongens nei/Kongens nei.mkv', status: 'lastet' }] }]);
  assert.equal(abel.type, 'radio');
  assert.deepEqual(abel.sesonger[0].episoder.map((e) => e.status), ['lastet']);
  assert.deepEqual(['1 t 32 min', '1:32:00', '45:30', 90.4, '120', 'ukjent', '', null, -5].map(nrk.sekunder), [5520, 5520, 2730, 90, 120, null, null, null, null]);
  assert.doesNotMatch(r.text, /skal-ikke-ut|hemmelig|nrk\.p87/);
  assert.ok(kall.every((k) => k.auth === `Bearer ${TOKEN}`));
});

test('bibliotek: serien caches i 10 min og sesongene i 60 s', async () => {
  mock();
  await req('/bibliotek');
  const tell = (re) => kall.filter((k) => re.test(k.P)).length;
  const [serier, sesonger] = [tell(/^\/api\/serie\/[^/]+$/), tell(/\/sesong\//)];
  assert.equal(serier, 3);
  assert.equal(sesonger, 4);
  await req('/bibliotek');
  assert.equal(tell(/^\/api\/serie\/[^/]+$/), serier, 'serien fra cachen');
  assert.equal(tell(/\/sesong\//), sesonger, 'sesongene fra cachen');
  const ekte = Date.now;
  try {
    Date.now = () => ekte() + 61_000;
    await req('/bibliotek');
    assert.equal(tell(/\/sesong\//), sesonger * 2, 'sesongene hentes på nytt etter 60 s');
    assert.equal(tell(/^\/api\/serie\/[^/]+$/), serier, 'seriene (også «fant ikke») fra cachen');
    Date.now = () => ekte() + 601_000;
    await req('/bibliotek');
    assert.equal(tell(/^\/api\/serie\/[^/]+$/), serier * 2, 'serien hentes på nytt etter 10 min');
  } finally { Date.now = ekte; }
  // Episoder lagt i køen: sesongene til den serien hentes på nytt neste gang
  const n = tell(/\/sesong\//);
  await req('/jobber', 'POST', { url: 'https://tv.nrk.no/serie/exit', episoder: [`https://tv.nrk.no/program/${prf(303)}`] });
  await req('/serie?url=https://tv.nrk.no/serie/lykkeland');
  assert.equal(tell(/\/sesong\//), n, 'andre serier fra cachen');
  await req('/serie?url=https://tv.nrk.no/serie/exit');
  assert.equal(tell(/\/sesong\//), n + 2);
});

test('bibliotek: høyst 15 sesonger per serie og høyst 6 kall samtidig', async () => {
  M = { bib: true, komp: true, vpn: true, mange: true, treg: 15 }; mock();
  const r = await req('/bibliotek');
  M = { bib: true, komp: true, vpn: true };
  assert.equal(r.status, 200);
  const S = r.body.elementer[0].sesonger;
  assert.equal(S.length, 15);
  assert.deepEqual([S[0].nr, S[14].nr], [6, 20], 'de nyeste 15');
  assert.equal(kall.filter((k) => /\/sesong\//.test(k.P)).length, 15);
  assert.ok(maksSamtidig <= 6 && maksSamtidig >= 2, `samtidige kall: ${maksSamtidig}`);
});

test('bibliotek og serie: VPN nede (503) gir det som finnes pluss feil, uten krasj', async () => {
  M = { bib: true, komp: true, vpn: false }; mock();
  const r = await req('/bibliotek');
  assert.equal(r.status, 200);
  assert.equal(r.body.tilgjengelig, true);
  assert.deepEqual(r.body.elementer.map((x) => x.type), ['film', 'radio']);
  assert.match(r.body.feil, /^Fikk ikke hentet seriene fra NRK\. VPN er ikke klar: /);
  const s = await req('/serie?url=https://tv.nrk.no/serie/exit');
  assert.equal(s.status, 502);
  assert.match(s.body.error, /VPN er ikke klar/);
  assert.notEqual(s.body.configured, false, 'VPN-feil er ikke «ikke satt opp»');
  M = { bib: true, komp: true, vpn: true };
});

test('serie: fra serie- og episodelenker, bare tv.nrk.no-serier, og «fant ikke» fra nrk-dl er en ekte feil', async () => {
  mock();
  const r = await req(`/serie?url=${encodeURIComponent('https://tv.nrk.no/serie/exit/sesong/3/episode/4')}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.tilgjengelig, true);
  assert.equal(r.body.id, 'exit');
  assert.equal(r.body.tittel, 'Exit');
  assert.deepEqual(r.body.element.sesonger.map((s) => s.nr), [2, 3]);
  assert.deepEqual(r.body.sesonger, r.body.element.sesonger);
  assert.deepEqual(kall.map((k) => k.P).filter((p) => p !== '/api/sok'), ['/api/serie/exit', '/api/serie/exit/sesong/2', '/api/serie/exit/sesong/3']);
  const n = kall.length;
  assert.equal((await req('/serie?url=https://example.com/serie/exit')).status, 400);
  assert.equal((await req('/serie')).status, 400);
  for (const u of ['https://tv.nrk.no/program/KOID20001616', 'https://radio.nrk.no/serie/exit', 'https://tv.nrk.no/', 'https://tv.nrk.no/serie/%2e%2e']) {
    const x = await req(`/serie?url=${encodeURIComponent(u)}`);
    assert.equal(x.status, 404, u);
    assert.equal(x.body.error, 'Bare serier fra tv.nrk.no kan vises');
  }
  assert.equal(kall.length, n);
  const f = await req('/serie?url=https://tv.nrk.no/serie/finnes-ikke');
  assert.equal(f.status, 404);
  assert.match(f.body.error, /Fant ikke/);
  assert.equal((await req('/status')).body.bibliotek, true, '404 med {feil} betyr ikke «for gammel nrk-dl»');
  assert.equal(nrk.serieId('https://tv.nrk.no/serie/Exit/sesong/1'), 'exit');
  assert.equal(nrk.prfId('https://tv.nrk.no/serie/exit/sesong/1/episode/msui22000123/avspiller'), 'MSUI22000123');
  assert.equal(nrk.prfId('https://tv.nrk.no/serie/exit/sesong/1/episode/1'), null);
});

test('søk: oversatt fra /api/sok, bare NRK-lenker, plakater via bildeproxyen', async () => {
  mock();
  const r = await req(`/sok?q=${encodeURIComponent(`  ${'e'.repeat(150)}  `)}`);
  assert.equal(r.status, 200);
  assert.equal(kall.pop().q, `?q=${'e'.repeat(100)}`, 'høyst 100 tegn videre');
  assert.deepEqual(r.body, { configured: true, tilgjengelig: true, treff: [
    { art: 'serie', id: 'exit', tittel: 'Exit', beskrivelse: 'Drama', bilde: `/api/media/nrk/bilde?u=${encodeURIComponent('https://gfx.nrk.no/abc123')}`, url: 'https://tv.nrk.no/serie/exit', tilgjengelig: true },
    { art: 'film', id: 'KOID20001616', tittel: 'Kongens nei', beskrivelse: '', bilde: null, url: 'https://tv.nrk.no/program/KOID20001616', tilgjengelig: false },
  ] });
  assert.doesNotMatch(r.text, /skal-ikke-ut|169\.254|evil/);
  assert.deepEqual((await req('/sok?q=e')).body.treff, []);
  M = { bib: true, komp: true, vpn: false }; mock();
  const v = await req('/sok?q=exit');
  assert.equal(v.status, 502);
  assert.match(v.body.error, /VPN er ikke klar/);
  M = { bib: true, komp: true, vpn: true };
});

test('bilde: bare NRK sine verter over https, bare bilder, og svaret caches', async () => {
  mock();
  let hentet = [];
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  nrk._setBildeNrk(async (url) => { hentet.push(url); if (url.includes('html')) return { buf: Buffer.from('<html>'), type: 'text/html' }; if (url.includes('svg')) return { buf: Buffer.from('<svg/>'), type: 'image/svg+xml' }; if (url.includes('nede')) throw new Error('ECONNREFUSED 10.0.0.1'); return { buf: PNG, type: 'image/png; charset=binary' }; });
  const u = encodeURIComponent('https://gfx.nrk.no/abc123');
  const r = await app.request(`/api/media/nrk/bilde?u=${u}`, { headers: { cookie } }, LAN);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('cache-control'), /private, max-age=\d+/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  assert.equal((await app.request(`/api/media/nrk/bilde?u=${u}`, { headers: { cookie } }, LAN)).status, 200);
  assert.deepEqual(hentet, ['https://gfx.nrk.no/abc123'], 'andre gang kommer fra cachen');
  hentet = [];
  for (const bad of ['http://gfx.nrk.no/abc', 'https://example.com/a.jpg', 'https://gfx.nrk.no.evil.com/a.jpg', 'http://127.0.0.1:8020/api/status', 'http://169.254.169.254/latest/meta-data', 'https://gfx.nrk.no:8443/a', 'https://a:b@gfx.nrk.no/a', 'file:///etc/passwd', '']) {
    const b = await req(`/bilde?u=${encodeURIComponent(bad)}`);
    assert.equal(b.status, 400, bad);
  }
  assert.equal(hentet.length, 0, 'avviste adresser hentes aldri');
  assert.equal((await req(`/bilde?u=${encodeURIComponent('https://gfx.nrk.no/html')}`)).status, 502);
  assert.equal((await req(`/bilde?u=${encodeURIComponent('https://gfx.nrk.no/svg')}`)).status, 502, 'SVG slippes ikke gjennom');
  const nede = await req(`/bilde?u=${encodeURIComponent('https://gfx.nrk.no/nede')}`);
  assert.equal(nede.status, 502);
  assert.doesNotMatch(nede.text, /10\.0\.0\.1|ECONNREFUSED/);
});

test('bilde: standardhenteren godtar bare NRK-verter også ved omdirigering (vertssjekken i guardedGet46)', async () => {
  const src = readFileSync(new URL('../server/nrkdl.js', import.meta.url), 'utf8');
  assert.match(src, /guardedGet46\(url, \{ hostOk: \(u\) => nrkBilde\(u\.href\) != null, maxBytes: BILDE_MAX/);
  assert.equal(nrk.bildeUrl('https://gfx.nrk.no/x'), '/api/media/nrk/bilde?u=https%3A%2F%2Fgfx.nrk.no%2Fx');
  for (const v of ['http://gfx.nrk.no/x', 'https://localhost/x', 'https://10.0.0.1/x', '/api/bilde/1', null, 42]) assert.equal(nrk.bildeUrl(v), null, String(v));
});

test('401 fra nrk-dl blir 502 med forklaring om tokenet (aldri «utlogget fra Homelab»)', async () => {
  mock();
  updateConfig({ nrk_token: 'feil-token' }, OWNER);
  const r = await req('/jobber');
  assert.equal(r.status, 502);
  assert.match(r.body.error, /avviste tokenet/);
  assert.doesNotMatch(r.text, /feil-token/);
  updateConfig({ nrk_token: TOKEN }, OWNER);
});

/* ---------------- Web ---------------- */

const web = readFileSync(new URL('../public/js/media-nrk.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/media-nrk.css', import.meta.url), 'utf8');
const m43 = readFileSync(new URL('../public/js/media43.js', import.meta.url), 'utf8');

test('web: hele bredden – rutenettet fra designet, NRK øverst og Bibliotek i full bredde (pakke 58)', () => {
  assert.match(css, /\.nrk87\{[^}]*display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,max\(460px,34%\)\),1fr\)\)/);
  assert.match(css, /\.nrk87 \.nrk-card\.full\{grid-column:1 \/ -1\}/);
  assert.doesNotMatch(css, /\.nrk87\{[^}]*max-width/, 'ingen smal maksbredde (NRK fylte bare venstre halvdel)');
  assert.match(css, /\.nrk87 \.nrk-grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(150px,1fr\)\)/);
  assert.match(css, /\.nrk87 \.nrk-pl\{[^}]*aspect-ratio:2 \/ 3/);
  assert.match(css, /--n-bl:#2b5d8a;--n-ok:#2f7a4f/);
  assert.match(css, /\.m43\.m70\.dk \.nrk87\{/);
  // rekkefølgen i DOM = rekkefølgen på mobil: NRK (søk) → Køen → Serier → Bibliotek → bunnlinja (prompt 88)
  assert.match(web, /\[\['form', 'full form', \[toppHtml\(\), kroppHtml\(\)\]\], \['ko', 'ko', koHtml\(\)\], \['folg', 'folg', folgerHtml\(\)\], \['lib', 'full lib', libHtml\(\)\], \['bunn', 'full bunn', bunnHtml\(\)\]\]/);
});

test('web: tekstene fra designet', () => {
  for (const t of ['Bare lenker fra nrk.no og nrksuper.no.', 'Lenken ligger allerede i køen.', 'VPN nede – stoppet', 'VPN nede: tunnelen er ikke i Norge. Køen står stille.', 'Følg serien', 'Komprimer (H.265, ca. halv størrelse)', 'som standard på serveren', 'Fjern ferdige', 'Slutt å følge', 'Sjekker …', 'NRK-nedlasteren er ikke satt opp', 'Åpne Integrasjoner', 'Biblioteket krever en nyere versjon av nrk-dl.', 'Åpne på NRK', '‹ Bibliotek', 'som mangler', 'Se etter nye', 'LASTET NED', 'MANGLER', 'VENTER', 'med komprimering']) {
    assert.ok(web.includes(t), t);
  }
  assert.match(web, /e\.status === 409 \? I_KO/);
  assert.match(web, /j\.status === 'ferdig' && j\.type !== 'film' && knapp\('igjen', 'Se etter nye'\)/, 'ferdig film har bare «Fjern»');
});

test('web: komprimer sendes bare når valget er endret fra serverens standard; episoder fra biblioteket', () => {
  assert.match(web, /S\.st\?\.komprimer && kompNa\(\) !== kompStd\(\) \? \{ komprimer: kompNa\(\) \} : \{\}/);
  assert.match(web, /folg: false, \.\.\.kompValg\(\)/);
  assert.match(web, /const k = S\.st\?\.komprimer;\n\s*const komp = k \? /, 'ingen avkrysningsboks når status mangler komprimer');
  assert.match(web, /episoder: episoder\.map\(\(e\) => e\.url\)/);
  assert.match(web, /\.slice\(0, 200\)/);
  assert.match(web, /\/serie\?url=\$\{encodeURIComponent\(x\.url\)\}/);
});

test('web: oppdatering 2 s / 10 s, stopper når fanen ikke vises, og lenkefeltet tegnes ikke på nytt uten grunn', () => {
  assert.match(web, /if \(!S\.host\?\.isConnected\) return; \/\/ fanen vises ikke lenger: stopp/);
  assert.match(web, /aktiv \? 2000 : 10000/);
  assert.match(web, /if \(el\.nrkHtml === html\) return;/);
  assert.match(web, /u\.value = S\.url;/);
  assert.match(web, /q\.value = S\.q;/);
  assert.doesNotMatch(web, /nrk_token|Authorization|10\.69\./);
  assert.doesNotMatch(web, /confirm\(/);
});

test('web: fanelinja holder den valgte fanen i midten', () => {
  assert.match(m43, /function paintTop\(\) \{[^\n]*centerTab87\(t\)/);
  assert.match(m43, /bar\.scrollLeft \+= a\.left - b\.left - \(b\.width - a\.width\) \/ 2;/);
});

test('dokumentasjon: nye endepunkter og README-linja', () => {
  const doc = readFileSync(new URL('../docs/nrk-nedlaster.md', import.meta.url), 'utf8');
  for (const t of ['/api/media/nrk/bibliotek', '/api/media/nrk/serie', '/api/media/nrk/bilde', 'komprimer', 'episoder', 'nyere versjon av nrk-dl', 'hele sekunder', 'homelab://media/nrk?url=', '/api/media/nrk/sok', '/api/episoder', 'grenen `nrk-nedlaster`', 'GET /api/sok?q=']) assert.ok(doc.includes(t), t);
  assert.match(readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /NRK-nedlaster/);
});
