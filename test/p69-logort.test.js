// Prompt 69 (LOGORT): Wikidata før Gemini (logo_wikidata), Gemini med alternativer og bedre favicon på serveren.
// Alt nett er mocket (containeren når ikke wikidata.org).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p69-logort-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p69-logofiles-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.GEMINI_API_KEY = 'gemini-test-key';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const png = (w, h = w) => { const b = Buffer.alloc(300); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const html = (title, head = '') => `<!doctype html><html><head><title>${title}</title>${head}</head><body></body></html>`;
const claim = (v, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value: v } } });
const item = (q) => claim({ id: q, 'numeric-id': +q.slice(1) });
const entity = (id, label, claims, aliases = []) => ({ id, labels: { nb: { language: 'nb', value: label } }, aliases: { nb: aliases.map((value) => ({ language: 'nb', value })) }, claims });

// Wikidata-verdenen: søk (navn → id-er) og entiteter.
const WD = {
  search: {
    'Bakeriet Lille': ['Q101'], // logo i Commons
    'Fjordkaffe': ['Q202'], // bare domene (P856)
    'Fjelltind': ['Q303', 'Q304'], // feil type, så feil land
    'Sylteboden': ['Q405'], // riktig, men brukes bare når steget er på
  },
  entities: {
    Q101: entity('Q101', 'Bakeriet Lille', { P31: [item('Q4830453')], P17: [item('Q20')], P154: [claim('Bakeriet Lille logo.svg', 'preferred')], P856: [claim('https://bakerietlille.no/')] }),
    Q202: entity('Q202', 'Fjordkaffe AS', { P31: [item('Q507619')], P856: [claim('https://www.fjordkaffe.no/')] }),
    Q303: entity('Q303', 'Fjelltind', { P31: [item('Q8502')], P17: [item('Q20')], P856: [claim('https://fjelltind.no')] }), // fjell, ikke virksomhet
    Q304: entity('Q304', 'Fjelltind', { P31: [item('Q4830453')], P17: [item('Q34')], P856: [claim('https://fjelltind.se')] }), // Sverige, .se
    Q405: entity('Q405', 'Syltebua', { P31: [item('Q213441')], P17: [item('Q20')], P8972: [claim('Sylteboden.png')] }, ['Sylteboden']),
  },
};
const SITES = {
  'https://fjordkaffe.no/': html('Fjordkaffe – kaffebar', '<link rel="icon" href="/f16.png" sizes="16x16"><link rel="manifest" href="/site.webmanifest">'),
  'https://fjelltind.no/': html('Fjelltind'),
  'https://alt-to.no/': html('Strikkeloftet på Hamar', '<link rel="icon" href="/i.png" sizes="96x96">'),
  'https://alt-en.no/': html('Domene til salgs'),
  'https://ikoner.no/': html('Ikoner', '<link rel="icon" href="/i16.png" sizes="16x16"><link rel="icon" href="/i48.png" sizes="48x48"><meta property="og:image" content="/wide.png">'),
  'https://smaa.no/': html('Smaa', '<link rel="icon" href="/i16.png" sizes="16x16">'),
  'https://svgbutikk.no/': html('Svgbutikk', '<link rel="icon" type="image/svg+xml" href="/i.svg"><link rel="icon" href="/i40.png" sizes="40x40">'),
};
const MANIFESTS = { 'https://fjordkaffe.no/site.webmanifest': JSON.stringify({ icons: [{ src: '/m192.png', sizes: '192x192' }, { src: '/m512.png', sizes: '512x512' }, { src: '/mono.png', sizes: '1024x1024', purpose: 'monochrome' }] }) };
const IMAGES = {
  'https://commons.wikimedia.org/wiki/Special:FilePath/Bakeriet_Lille_logo.svg?width=256': png(256),
  'https://commons.wikimedia.org/wiki/Special:FilePath/Sylteboden.png?width=256': png(256),
  'https://fjordkaffe.no/m512.png': png(512), 'https://fjordkaffe.no/m192.png': png(192), 'https://fjordkaffe.no/f16.png': png(16), 'https://fjordkaffe.no/mono.png': png(1024),
  'https://alt-to.no/i.png': png(96),
  'https://ikoner.no/i16.png': png(16), 'https://ikoner.no/i48.png': png(48), 'https://ikoner.no/wide.png': png(1200, 630),
  'https://smaa.no/i16.png': png(16),
  'https://svgbutikk.no/i.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>'.padEnd(200, ' ')),
  'https://svgbutikk.no/i40.png': png(40),
};
const calls = [];
const gemini = { answer: '{"domene":null,"sikkerhet":0}' };
let wdActive = 0, wdMax = 0;
async function mockFetch(url, init = {}) {
  const u = String(url);
  calls.push({ url: u, init });
  if (u.startsWith('https://www.wikidata.org/w/api.php')) {
    wdActive++; wdMax = Math.max(wdMax, wdActive);
    await new Promise((r) => setTimeout(r, 5));
    wdActive--;
    const p = new URL(u).searchParams;
    if (p.get('action') === 'wbsearchentities') return Response.json({ search: (p.get('language') === 'nb' ? WD.search[p.get('search')] ?? [] : []).map((id) => ({ id })) });
    if (p.get('action') === 'wbgetentities') return Response.json({ entities: Object.fromEntries(p.get('ids').split('|').map((id) => [id, WD.entities[id] ?? { id, missing: '' }])) });
    return new Response('{}', { status: 400 });
  }
  if (u.startsWith('https://data.brreg.no/enhetsregisteret/api/enheter?navn=')) return Response.json({ _embedded: { enheter: [] } });
  if (u.startsWith('https://data.brreg.no/')) return new Response('{}', { status: 404 });
  if (u.startsWith('https://generativelanguage.googleapis.com/')) return Response.json({ candidates: [{ content: { parts: [{ text: gemini.answer }] } }] });
  if (SITES[u]) return new Response(SITES[u], { status: 200, headers: { 'content-type': 'text/html' } });
  if (MANIFESTS[u]) return new Response(MANIFESTS[u], { status: 200, headers: { 'content-type': 'application/manifest+json' } });
  if (IMAGES[u]) return new Response(IMAGES[u], { status: 200, headers: { 'content-type': 'image/png' } });
  if (u.startsWith('https://')) return new Response('ikke funnet', { status: 404 });
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = mockFetch;
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const L = await import('../server/finans/logo-lookup.js');
L._setLogoFetch(mockFetch);
const { setUserCfg } = await import('../server/settings.js');
const { auditList } = await import('../server/finans/ai-audit.js');
const ocr = await import('../server/ocr-fallback.js');
ocr._setTools({ magick: null }); // standard i testene: ingen ImageMagick → SVG hoppes over

const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = r.headers.get('set-cookie').split(';')[0];
const S = async (path, method = 'GET', body) => { const x = await app.request(path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await x.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ } return { status: x.status, body: j }; };
const wdCalls = () => calls.filter((c) => c.url.startsWith('https://www.wikidata.org/'));
const gemCalls = () => calls.filter((c) => c.url.startsWith('https://generativelanguage.googleapis.com/'));
const find = (name, extra = {}) => L.findLogo(name, { u: 'owner', force: true, ...extra });
const reset = () => { calls.length = 0; L._clearWikidataCache(); };

test('logo_wikidata er på som standard og vises sammen med logo_gemini', async () => {
  const p = (await S('/finans/api/ai-privacy')).body;
  assert.equal(p.logo_wikidata, true);
  assert.equal(p.logo_gemini, false);
  assert.equal((await S('/finans/api/ai-privacy', 'PATCH', { logo_wikidata: false })).body.logo_wikidata, false);
  assert.equal((await S('/finans/api/ai-privacy', 'PATCH', { logo_wikidata: true })).body.logo_wikidata, true);
  const ui = readFileSync(new URL('../public/finans/js/mobile-p27.js', import.meta.url), 'utf8');
  assert.ok(ui.includes("'logo_wikidata'") && ui.indexOf('logo_wikidata') < ui.indexOf("tgRow('privacy', 'logo_gemini'"));
  assert.ok(readFileSync(new URL('../public/js/ai-glimt65.js', import.meta.url), 'utf8').includes('data-g65-ptog="logo_wikidata"'));
});

test('Wikidata gir logo: P154 hentes som PNG fra Commons (width=256), kilde wikidata, logget i ai_audit', async () => {
  reset();
  const out = await find('BAKERIET LILLE AS 9812 OSLO ****1234');
  assert.equal(out.source, 'wikidata');
  assert.equal(out.domain, 'bakerietlille.no');
  assert.match(out.logoUrl, /bakeriet-lille\.png/);
  const s = wdCalls();
  assert.equal(new URL(s[0].url).searchParams.get('action'), 'wbsearchentities');
  assert.equal(new URL(s[0].url).searchParams.get('language'), 'nb');
  assert.equal(new URL(s[1].url).searchParams.get('action'), 'wbgetentities');
  for (const c of s) {
    assert.match(c.init.headers['user-agent'], /kristo\.no/, 'User-Agent med kontaktadresse');
    for (const leak of ['9812', '1234', 'OSLO', 'Oslo']) assert.ok(!c.url.includes(leak), `«${leak}» sendes ikke`);
  }
  const commons = calls.find((c) => c.url.startsWith('https://commons.wikimedia.org/'));
  assert.equal(commons.url, 'https://commons.wikimedia.org/wiki/Special:FilePath/Bakeriet_Lille_logo.svg?width=256');
  assert.match(commons.init.headers['user-agent'], /kristo\.no/);
  const log = auditList('owner', 5).find((x) => x.engine === 'wikidata');
  assert.deepEqual(log.fieldsSent, { navn: 'Bakeriet Lille' });
  assert.equal(log.engineName, 'Wikidata');
  assert.equal(log.purpose, 'logo');
  // Hurtigbuffer: samme navn spør ikke Wikidata på nytt.
  calls.length = 0;
  await find('Bakeriet Lille');
  assert.equal(wdCalls().length, 0);
  // P8972 (small logo) brukes når P154 mangler, og aliaset matcher.
  reset();
  assert.equal((await find('Sylteboden')).source, 'wikidata');
});

test('Wikidata gir bare domene (P856): ikonet hentes fra nettstedet, manifest-ikonet (største) vinner over 16 px', async () => {
  reset();
  const out = await find('Fjordkaffe');
  assert.equal(out.source, 'wikidata');
  assert.equal(out.domain, 'fjordkaffe.no');
  assert.ok(calls.some((c) => c.url === 'https://fjordkaffe.no/m512.png'), 'største manifest-ikon');
  assert.ok(!calls.some((c) => c.url === 'https://fjordkaffe.no/mono.png'), 'monokromt ikon hoppes over');
  assert.ok(!calls.some((c) => c.url === 'https://fjordkaffe.no/f16.png'), '16 px prøves ikke når et større finnes');
});

test('feil type (fjell) og feil land (.se, Sverige) avvises', async () => {
  reset();
  const out = await find('Fjelltind');
  assert.equal(wdCalls().length, 2, 'søk + entiteter');
  assert.notEqual(out.source, 'wikidata');
  assert.notEqual(out.domain, 'fjelltind.se');
  // Direkte: typen må være virksomhet/kjede, landet Norge eller domenet .no/i registeret, og navnet må stemme.
  assert.equal(L.wdAccept(WD.entities.Q303, 'Fjelltind'), null);
  assert.equal(L.wdAccept(WD.entities.Q304, 'Fjelltind'), null);
  assert.deepEqual(L.wdAccept(WD.entities.Q202, 'Fjordkaffe'), { id: 'Q202', domain: 'fjordkaffe.no', logo: null });
  assert.equal(L.wdAccept(WD.entities.Q202, 'Fjordbakst'), null, 'navnet må stemme');
});

test('logo_wikidata av hopper over steget', async () => {
  setUserCfg('owner', { logo_wikidata: '0' });
  reset();
  const out = await find('Sylteboden');
  assert.equal(wdCalls().length, 0);
  assert.notEqual(out.source, 'wikidata');
  setUserCfg('owner', { logo_wikidata: '1' });
});

test('«Finansdata forlater aldri huset» stopper Wikidata og Gemini', async () => {
  setUserCfg('owner', { logo_gemini: '1' });
  gemini.answer = '{"domene":"alt-to.no","sikkerhet":0.9}';
  assert.equal((await S('/api/ai/routing', 'PUT', { rules: { finLocal: true } })).status, 200);
  reset();
  const before = auditList('owner', 500).length;
  const out = await find('Sylteboden');
  assert.equal(out.blocked, true);
  assert.equal(calls.length, 0, 'ingenting går ut');
  assert.equal(auditList('owner', 500).length, before);
  assert.equal((await S('/api/ai/routing', 'PUT', { rules: { finLocal: false } })).status, 200);
  setUserCfg('owner', { logo_gemini: '0' });
});

test('Gemini: alternativene prøves i rekkefølge (maks 3), lav sikkerhet gir ingen forsøk', async () => {
  setUserCfg('owner', { logo_gemini: '1' });
  gemini.answer = '{"domene":"alt-en.no","alternativer":["facebook.com","alt-to.no","alt-tre.no"],"sikkerhet":0.8}';
  reset();
  const out = await find('Strikkeloftet');
  assert.equal(out.source, 'gemini');
  assert.equal(out.domain, 'alt-to.no');
  const tried = calls.filter((c) => /^https:\/\/(www\.)?(alt-|facebook)/.test(c.url)).map((c) => new URL(c.url).host.replace(/^www\./, ''));
  assert.deepEqual([...new Set(tried)], ['alt-en.no', 'alt-to.no'], 'i rekkefølge, sosiale medier hoppes over, stopper ved første logo');
  const g = gemCalls();
  assert.equal(g.length, 1);
  const text = JSON.parse(g[0].init.body).contents[0].parts[0].text;
  assert.deepEqual(JSON.parse(text.split('\n').at(-1)), { butikk: 'Strikkeloftet', land: 'NO' });
  assert.match(text, /alternativer/);
  assert.deepEqual(L.geminiDomains({ domene: 'a.no', alternativer: ['b.no', 'c.no', 'd.no'] }), ['a.no', 'b.no', 'c.no']);
  // Lav sikkerhet: ingen domener prøves.
  gemini.answer = '{"domene":"alt-to.no","alternativer":[],"sikkerhet":0.3}';
  reset();
  const low = await find('Strikkeloftet');
  assert.notEqual(low.source, 'gemini');
  assert.ok(!calls.some((c) => c.url.includes('alt-to.no')));
  setUserCfg('owner', { logo_gemini: '0' });
});

test('favicon: aldri 16 px når større finnes, og:image bare kvadratisk, SVG bare med ImageMagick', async () => {
  setUserCfg('owner', { logo_verify: '0' });
  reset();
  const a = await L.setManualLogo('Ikoner', { domain: 'ikoner.no', u: 'owner' });
  assert.ok(a.logoUrl);
  assert.ok(calls.some((c) => c.url === 'https://ikoner.no/wide.png'), 'og:image prøvd');
  assert.ok(calls.some((c) => c.url === 'https://ikoner.no/i48.png'), '48 px valgt fordi og:image ikke er kvadratisk');
  // Bare 16 px: brukes som siste utvei uten «Sjekk logoen», aldri med.
  reset();
  assert.ok((await L.setManualLogo('Smaa', { domain: 'smaa.no', u: 'owner' })).logoUrl);
  setUserCfg('owner', { logo_verify: '1' });
  // Uten ImageMagick hoppes SVG over (og /favicon.svg prøves ikke).
  reset();
  await L.setManualLogo('Svgbutikk', { domain: 'svgbutikk.no', u: 'owner' });
  assert.ok(!calls.some((c) => c.url.endsWith('.svg')));
  assert.ok(calls.some((c) => c.url === 'https://svgbutikk.no/i40.png'));
  const withMagick = L.iconCandidates(SITES['https://svgbutikk.no/'], 'https://svgbutikk.no/', { svg: true }).map(([k, u]) => `${k} ${u}`);
  assert.deepEqual(withMagick, ['icon https://svgbutikk.no/i.svg', 'icon https://svgbutikk.no/i40.png', 'favicon.svg https://svgbutikk.no/favicon.svg', 'favicon https://svgbutikk.no/favicon.ico']);
});

test('Wikidata: maks 1 forespørsel om gangen, og tidsgrensen/hurtigbufferen gjelder', async () => {
  reset(); wdMax = 0;
  await Promise.all(['Bakeriet Lille', 'Fjordkaffe', 'Sylteboden', 'Fjelltind'].map((n) => L.wikidataLookup(n, { u: 'owner' })));
  assert.equal(wdMax, 1);
  const src = readFileSync(new URL('../server/finans/logo-lookup.js', import.meta.url), 'utf8');
  assert.match(src, /WD_TIMEOUT_MS = 6000/);
  assert.equal(src.match(/geminiFetch\(/g).length, 1, 'fortsatt bare én vei til Gemini');
  // Toppkommentaren beskriver den nye rekkefølgen.
  assert.ok(src.indexOf('3b. Wikidata') > 0 && src.indexOf('3b. Wikidata') < src.indexOf('4. Gemini'));
});
