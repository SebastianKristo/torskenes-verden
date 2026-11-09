// Prompt 77 (SKJAISRV): Skjold Lab med smarte forslag. Dekoderne (fargebånd 3–6 bånd, SMD-koder, kondensatorkoder) og normaliseringen,
// AI-oppgaven «skj», /ai/suggest med mocket ai-run (eksisterende kategori, categoryNew, schema-avvisning → nytt forsøk → norsk feil),
// bildesøket med mocket SearXNG/Commons (proxy, signerte id-er, SSRF-avvisning, innstillingen av), Rydd opp (jobb, gjennomgang,
// apply med historikk og angre) og at alt er per bruker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-p77-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p77';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.SKJOLD76_DEMO = '0';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.SEARXNG_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const D = await import('../server/skjold76/decode77.js');
const AI = await import('../server/skjold76/ai77.js');
const IM = await import('../server/skjold76/images77.js');
const N73 = await import('../server/news73.js');
const RUN = await import('../server/ai-run.js');
const { updateConfig } = await import('../server/settings.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* */ }
  return { status: r.status, body: json, text: buf.toString('utf8'), buf, headers: r.headers };
}
async function login(username, password) {
  const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' }, body: JSON.stringify({ username, password }) });
  return r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const cookie = await login('sebastian', 'testpassord1');
auth.createUser({ username: 'ingrid', password: 'ingridpassord', role: 'bruker' });
const cookie2 = await login('ingrid', 'ingridpassord');
const A = (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });
const B = (path, method = 'GET', body) => req(path, { method, headers: { cookie: cookie2 }, body });
const mk = async (b, who = A) => { const r = await who('/api/skjold/parts', 'POST', b); assert.equal(r.status, 201, r.text); return r.body; };
const PNG = IM.mockPng77(40, 30, [200, 40, 40]);

/* ---------------- 1. Dekoderne ---------------- */

test('fargebånd: 3, 4, 5 og 6 bånd, norsk/engelsk, baklengs, feil', () => {
  const cases = [
    [['brun', 'svart', 'oransje', 'gull'], '10 kΩ', '5 %'],
    [['brown', 'black', 'orange', 'gold'], '10 kΩ', '5 %'],
    ['brun-svart-svart-rød-brun', '10 kΩ', '1 %'],
    [['gul', 'fiolett', 'rød', 'gull'], '4,7 kΩ', '5 %'],
    [['rød', 'rød', 'brun', 'gull'], '220 Ω', '5 %'],
    [['brun', 'svart', 'grønn', 'sølv'], '1 MΩ', '10 %'],
    [['gul', 'fiolett', 'gull', 'gull'], '4,7 Ω', '5 %'],
    [['gull', 'oransje', 'svart', 'brun'], '10 kΩ', '5 %'], // baklengs
    [['brun', 'svart', 'rød'], '1 kΩ', '20 %'],
    [['oransje', 'oransje', 'svart', 'svart', 'brun'], '330 Ω', '1 %'],
  ];
  for (const [bands, v, tol] of cases) {
    const r = D.resistorFromBands77(bands);
    assert.equal(r.value, v, JSON.stringify(bands));
    assert.equal(r.tolerance, tol, JSON.stringify(bands));
  }
  const six = D.resistorFromBands77(['brun', 'svart', 'svart', 'rød', 'brun', 'brun']);
  assert.equal(six.tempco, '100 ppm/K');
  assert.equal(D.resistorFromBands77(['svart']).value, '0 Ω');
  assert.equal(D.resistorFromBands77('brun svart oransje gull').text, '10 kΩ 5 %');
  assert.match(D.resistorFromBands77(['brun', 'turkis', 'rød']).error, /Ukjent farge/);
  assert.match(D.resistorFromBands77(['gull', 'sølv', 'rød', 'gull']).error, /Sifferbåndene|Ugyldig/);
});

test('SMD-koder og kondensatorkoder', () => {
  const smd = [['103', '10 kΩ'], ['4R7', '4,7 Ω'], ['2R2', '2,2 Ω'], ['R47', '0,47 Ω'], ['1002', '10 kΩ'], ['472', '4,7 kΩ'], ['000', '0 Ω'], ['01C', '10 kΩ'], ['4K7', '4,7 kΩ'], ['100', '10 Ω']];
  for (const [c, v] of smd) assert.equal(D.smdCode77(c).value, v, c);
  assert.ok(D.smdCode77('99X').error);
  const cap = [['104', '100 nF'], ['103', '10 nF'], ['473', '47 nF'], ['229', '2,2 pF'], ['47', '47 pF'], ['4n7', '4,7 nF'], ['2u2', '2,2 µF'], ['p47', '0,47 pF'], ['101', '100 pF']];
  for (const [c, v] of cap) assert.equal(D.capCode77(c).value, v, c);
  const k = D.capCode77('104K');
  assert.deepEqual([k.value, k.tolerance], ['100 nF', '10 %']);
  const jv = D.capCode77('104J50V');
  assert.deepEqual([jv.value, jv.tolerance, jv.voltage], ['100 nF', '5 %', '50 V']);
  assert.ok(D.capCode77('107').error, 'multiplikator 7 finnes ikke');
});

/* ---------------- 2. Normaliseringen ---------------- */

test('normalisering: verdier, enheter, skruer og navnemalen', () => {
  const V = (s, k) => D.parseValue77(s, k)?.text;
  assert.equal(V('10k', 'R'), '10 kΩ');
  assert.equal(V('0.1uF'), '100 nF');
  assert.equal(V('0,1µF'), '100 nF');
  assert.equal(V('4k7'), '4,7 kΩ');
  assert.equal(V('1M', 'R'), '1 MΩ');
  assert.equal(V('1meg'), '1 MΩ');
  assert.equal(V('1000uF'), '1000 µF', 'aldri mF');
  assert.equal(V('1/4W'), '¼ W');
  assert.equal(V('0.5W'), '½ W');
  assert.equal(V('3.3v'), '3,3 V');
  assert.equal(V('500mA'), '500 mA');
  assert.equal(V('16MHz'), '16 MHz');
  assert.equal(V('220', 'R'), '220 Ω');
  assert.equal(V('220'), undefined, 'rent tall uten hint endres ikke');
  // Komma som desimaltegn (SKJAIWEB fant «Motstand 4,7 kΩ» → «4 Ω»).
  assert.equal(D.normValue77('4,7 kΩ'), '4,7 kΩ');
  assert.equal(D.normValue77('4,7k', 'R'), '4,7 kΩ');
  assert.equal(D.normValue77('0,1 uF'), '100 nF');
  assert.equal(D.normValue77('2,2 nF'), '2,2 nF');
  for (const [t, name, v] of [['Motstand 4,7 kΩ', 'Motstand 4,7 kΩ', '4,7 kΩ'], ['motstand 4,7k', 'Motstand 4,7 kΩ', '4,7 kΩ'], ['kondensator 0,1 uF', 'Kondensator 100 nF', '100 nF'],
    ['kondensator 2,2 nF', 'Kondensator 2,2 nF', '2,2 nF'], ['motstand 10k, 5%', 'Motstand 10 kΩ', '10 kΩ']]) {
    const f = D.finalize77({ ...D.heuristic77(t), name: t });
    assert.deepEqual([f.name, f.specs.verdi], [name, v], t);
  }
  assert.equal(D.screw77('M3x10').text, 'M3 × 10');
  assert.equal(D.screw77('m3 x 10mm').length, '10 mm');
  assert.equal(D.screw77('M2.5*6').text, 'M2,5 × 6');
  assert.equal(D.normText77('m3x10 skrue'), 'M3 × 10 skrue');
  assert.equal(D.normText77('10k resistor 1/4w', 'R'), '10 kΩ resistor ¼ W');
  assert.equal(D.normText77('ESP32-DevKitC V4'), 'ESP32-DevKitC V4', 'modellnavn røres ikke');
  assert.deepEqual(D.normSpecs77({ value: '10k', tolerance: '±5%', power: '0.25w', package: 'sot23', Thread: 'm3', Length: '10', color: 'red' }, 'R'),
    { verdi: '10 kΩ', toleranse: '5 %', effekt: '¼ W', pakke: 'SOT-23', gjenger: 'M3', lengde: '10 mm', farge: 'rød' });
  // Navnemalen «Type Verdi Variant»
  const fin = (raw, cats = []) => D.finalize77(raw, { userCats: cats });
  assert.equal(fin({ type: 'resistor', name: 'x', value: '10k', specs: { power: '1/4W' }, category: '', confidence: 0.8 }).name, 'Motstand 10 kΩ ¼ W');
  assert.equal(fin(D.heuristic77('M3x10 skrue umbraco')).name, 'Skrue M3 × 10 umbraco');
  assert.equal(fin(D.heuristic77('LED 5mm red')).name, 'LED 5 mm rød');
  assert.equal(fin({ type: 'Mikrokontroller', name: 'ESP32-DevKitC V4', category: 'Mikrokontrollere', confidence: 0.9 }).name, 'ESP32-DevKitC V4');
  assert.equal(fin({ type: 'kondensator', name: 'cap', value: '0.1uF', specs: { voltage: '50v' }, category: '', confidence: 0.7 }).name, 'Kondensator 100 nF 50 V');
  // Kategori: brukerens egen (synonym), standardlisten, ny
  assert.deepEqual(D.chooseCategory77('Resistorer', 'Motstander', ['Motstander', 'Skruer']), { category: 'Motstander', categoryNew: false });
  assert.deepEqual(D.chooseCategory77('Skruer og bolter', 'Skruer og bolter', ['Skruer']), { category: 'Skruer', categoryNew: false });
  assert.deepEqual(D.chooseCategory77('LED', 'Dioder og LED', []), { category: 'Dioder og LED', categoryNew: true });
  assert.deepEqual(D.chooseCategory77('3D-printerdeler', null, ['Motstander']), { category: '3D-printerdeler', categoryNew: true });
  assert.equal(D.DEFAULT_CATEGORIES77.length, 17);
});

/* ---------------- 3. AI-oppgaven og forslag ---------------- */

test('AI-oppgaven «skj» finnes, er lokal som standard og vises i AI-kontroll → Oppgaver', async () => {
  const t = RUN.AI_TASKS.find((x) => x.id === 'skj');
  assert.equal(t.name, 'Skjold Lab · gjenkjenning');
  assert.equal(t.kind, 'vision');
  assert.equal(RUN.taskId('skjold'), 'skj');
  const r = await A('/api/ai/routing');
  assert.equal(r.status, 200);
  const row = r.body.tasks.find((x) => x.id === 'skj');
  assert.ok(row, 'synlig i oppgavelisten');
  assert.equal(row.model, '', 'ingen sky-modell som standard (auto = lokal)');
});

const calls = [];
let replies = [];
AI._setAi77(async (task, o) => { calls.push({ task, o }); const x = replies.shift(); if (x instanceof Error) throw x; return typeof x === 'string' ? { text: x } : { data: x, text: JSON.stringify(x), model: 'gemma3:12b' }; });

test('suggest fra tekst: velger eksisterende kategori, verdien fra fargebånd regnes i kode, strukturert kall uten tenking', async () => {
  await mk({ name: 'Motstand 220 Ω', category: 'Motstander' });
  calls.length = 0;
  replies = [{ type: 'Motstand', name: 'Motstand 99 kΩ', bands: ['brun', 'svart', 'oransje', 'gull'], specs: { power: '0.25W' }, category: 'Resistorer', categoryNew: true, tags: ['THT'], confidence: 0.82, why: 'Leste fargebåndene' }];
  const r = await A('/api/skjold/ai/suggest', 'POST', { name: '10k motstand', description: 'kvart watt' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.name, 'Motstand 10 kΩ ¼ W', 'verdien fra båndene, ikke modellens tall');
  assert.equal(r.body.category, 'Motstander');
  assert.equal(r.body.categoryNew, false);
  assert.equal(r.body.specs.verdi, '10 kΩ');
  assert.equal(r.body.specs.toleranse, '5 %');
  assert.equal(r.body.decoded.resistor.value, '10 kΩ');
  assert.deepEqual(r.body.tags, ['tht']);
  assert.equal(r.body.confidence, 0.82);
  assert.equal(r.body.source, 'tekst');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].task, 'skj');
  assert.equal(calls[0].o.think, false);
  assert.ok(calls[0].o.schema && calls[0].o.json);
  assert.ok(!calls[0].o.images, 'ingen bilde');
  assert.match(calls[0].o.prompt, /Brukerens kategorier: Motstander/);
});

test('suggest: categoryNew når ingen kategori passer; SMD-kode dekodes', async () => {
  replies = [{ type: 'Motstand', name: 'SMD', code: '4R7', category: 'Shuntmotstander i bil', confidence: 0.6, why: 'Kode 4R7' }];
  const r = await A('/api/skjold/ai/suggest', 'POST', { name: 'smd 4r7' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.category, 'Motstander', 'typen passer til en eksisterende kategori');
  replies = [{ type: 'Verktøyholder', name: '3D-printet holder', category: '3D-print', confidence: 0.5, why: 'Ser printet ut' }];
  const n = await A('/api/skjold/ai/suggest', 'POST', { name: 'holder' });
  assert.deepEqual([n.body.category, n.body.categoryNew], ['3D-print', true]);
  replies = [{ type: 'kondensator', name: 'cap', code: '104', category: 'Kondensatorer', confidence: 0.7, why: 'Kode 104' }];
  const c = await A('/api/skjold/ai/suggest', 'POST', { name: 'keramisk 104' });
  assert.equal(c.body.specs.verdi, '100 nF');
  assert.equal(c.body.decoded.cap.value, '100 nF');
});

test('suggest: schema-avvisning gir ett nytt forsøk, to ugyldige gir norsk feil', async () => {
  calls.length = 0;
  replies = [{ name: 'x', type: 'Motstand', category: 'Motstander', confidence: 'høy', why: '' }, { type: 'Motstand', name: 'Motstand', value: '1k', category: 'Motstander', confidence: 0.7, why: 'ok' }];
  const r = await A('/api/skjold/ai/suggest', 'POST', { name: '1k' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.name, 'Motstand 1 kΩ');
  assert.equal(calls.length, 2);
  assert.match(calls[1].o.prompt, /Forrige svar var ugyldig \(confidence/);
  calls.length = 0;
  replies = [{ name: '', type: '', category: '', confidence: 2, why: '' }, 'ikke json i det hele tatt'];
  const bad = await A('/api/skjold/ai/suggest', 'POST', { name: 'noe' });
  assert.equal(bad.status, 502);
  assert.equal(bad.body.code, 'invalid');
  assert.match(bad.body.error, /ugyldig svar to ganger/);
  assert.equal(calls.length, 2);
  // Ugyldig farge i bands avvises også (modellen skal bare oppgi kjente farger).
  assert.equal(AI.validate77({ type: 'Motstand', name: 'x', category: 'y', confidence: 0.5, why: '', bands: ['brun', 'turkis'] }).ok, false);
  // Feil fra ai-run (ingen modell) → norsk feil, ikke nytt forsøk.
  calls.length = 0;
  replies = [Object.assign(new Error('Glimt fikk ikke svar fra noen modell: Ollama kan ikke nås'), { code: 'no_model' })];
  const nm = await A('/api/skjold/ai/suggest', 'POST', { name: 'noe' });
  assert.equal(nm.status, 503);
  assert.match(nm.body.error, /Glimt kunne ikke foreslå/);
  assert.equal(calls.length, 1);
});

test('suggest fra bilde: multipart file og lagret bilde (eier-sjekk), tidsgrense 60 s / 30 s', async () => {
  const p = await mk({ name: 'Ukjent', category: 'Motstander' });
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'x.png');
  fd.append('partId', String(p.id));
  fd.append('specs', JSON.stringify({ pakke: '0805' }));
  calls.length = 0;
  replies = [{ type: 'Motstand', name: 'Motstand', bands: ['gul', 'fiolett', 'rød', 'gull'], category: 'Motstander', confidence: 0.9, why: 'Bånd' }];
  const r = await A('/api/skjold/ai/suggest', 'POST', fd);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.source, 'begge');
  assert.equal(r.body.name, 'Motstand 4,7 kΩ');
  assert.equal(r.body.specs.pakke, '0805');
  assert.equal(calls[0].o.images.length, 1);
  assert.equal(AI.TIMEOUT_IMAGE77, 60_000);
  assert.equal(AI.TIMEOUT_TEXT77, 30_000);
  // Lagret bilde (filnavn fra skj_files): bare eieren.
  const up = new FormData();
  up.append('file', new Blob([PNG], { type: 'image/png' }), 'x.png');
  const withPhoto = await A(`/api/skjold/parts/${p.id}/photos`, 'POST', up);
  assert.equal(withPhoto.status, 201, withPhoto.text);
  const photo = withPhoto.body.photos[0].name;
  replies = [{ type: 'Motstand', name: 'Motstand', bands: ['brun', 'svart', 'oransje', 'gull'], category: 'Motstander', confidence: 0.9, why: 'Bånd' }];
  const r2 = await A('/api/skjold/ai/suggest', 'POST', { photo });
  assert.equal(r2.status, 200, r2.text);
  assert.equal(r2.body.source, 'bilde');
  assert.equal((await B('/api/skjold/ai/suggest', 'POST', { photo })).status, 404, 'andres bilde');
  assert.equal((await B('/api/skjold/ai/suggest', 'POST', { partId: p.id })).status, 404, 'andres del');
  assert.equal((await A('/api/skjold/ai/suggest', 'POST', {})).status, 400);
  // Tidsavbrudd: modellen svarer ikke innen grensen → 504 med norsk tekst.
  AI._setAi77((task, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('avbrutt')))));
  await assert.rejects(AI.suggest77('x', { name: 'tregt' }, { timeoutMs: 30 }), (e) => e.status === 504 && /mer enn 0 s|prøv igjen/.test(e.message));
  AI._setAi77(async (task, o) => { calls.push({ task, o }); const x = replies.shift(); if (x instanceof Error) throw x; return typeof x === 'string' ? { text: x } : { data: x, text: JSON.stringify(x) }; });
});

test('suggest uten modell (mock-serveren): tekstheuristikk', async () => {
  AI._setAi77(null);
  const r = await A('/api/skjold/ai/suggest', 'POST', { name: 'm3x10 skrue unbrako' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.name, 'Skrue M3 × 10 unbrako');
  assert.equal(r.body.mock, true);
  AI._setAi77(async (task, o) => { calls.push({ task, o }); const x = replies.shift(); if (x instanceof Error) throw x; return typeof x === 'string' ? { text: x } : { data: x, text: JSON.stringify(x) }; });
});

/* ---------------- 4. Bildesøket ---------------- */

const searchLog = [];
let searx = 'ok', commons = 'ok';
IM._setSearchFetch77(async (url, init) => {
  searchLog.push({ url: String(url), ua: init?.headers?.['User-Agent'] });
  if (String(url).startsWith('http://searx.test/')) {
    if (searx === 'fail') return new Response('nei', { status: 500 });
    return Response.json({ results: [
      { img_src: 'https://img.example.com/esp32.jpg', thumbnail_src: 'https://img.example.com/esp32_t.jpg', title: 'ESP32 DevKitC', url: 'https://example.com/esp32', resolution: '1200x800' },
      { img_src: 'http://10.0.0.5/intern.jpg', thumbnail_src: 'http://10.0.0.5/intern_t.jpg', title: 'Intern', url: 'http://10.0.0.5/' },
      { img_src: 'javascript:alert(1)', thumbnail_src: 'x', title: 'Søppel' },
    ] });
  }
  if (String(url).startsWith('https://commons.wikimedia.org/')) {
    if (commons === 'fail') throw new TypeError('fetch failed');
    return Response.json({ query: { pages: { 7: { index: 1, title: 'File:ESP32 board.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/a/esp32.jpg', thumburl: 'https://upload.wikimedia.org/a/320px-esp32.jpg', width: 3000, height: 2000, mime: 'image/jpeg' }] },
      8: { index: 2, title: 'File:Diagram.svg', imageinfo: [{ url: 'https://upload.wikimedia.org/a/d.svg', mime: 'image/svg+xml' }] } } } });
  }
  throw new TypeError('fetch failed');
});
// Nedlasting/miniatyrer: ekte guardedGet73 med injisert nett (DNS + fetch), så SSRF-vernet testes på ordentlig.
const dlLog = [];
N73._setNet73({
  resolve: async (host) => (host === 'img.example.com' || host === 'upload.wikimedia.org' ? ['93.184.216.34'] : host === 'evil.example.com' ? ['192.168.1.10'] : ['93.184.216.35']),
  fetch: async (url, init) => { dlLog.push({ url: String(url), ua: init?.headers?.['User-Agent'] }); return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }); },
});
test.after(() => { N73._setNet73(null); IM._setSearchFetch77(null); updateConfig({ searxng_url: '' }); });

let ITEMS = null;
test('bildesøk via SearXNG: maks 12, signerte id-er uten rå URL-er, miniatyr via proxyen, per bruker', async () => {
  updateConfig({ searxng_url: 'http://searx.test' });
  const r = await A('/api/skjold/ai/images', 'POST', { q: 'ESP32-DevKitC V4' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.provider, 'searxng');
  assert.ok(searchLog.some((x) => /categories=images/.test(x.url) && /q=ESP32-DevKitC%20V4/.test(x.url)));
  ITEMS = r.body.items;
  assert.equal(ITEMS.length, 2, 'javascript:-adressen er filtrert bort');
  assert.ok(!/https?:|img\.example\.com|esp32_t|intern\.jpg/.test(r.text), 'ingen tredjeparts-URL-er til klienten');
  for (const it of ITEMS) for (const k of ['id', 'thumbUrl', 'title', 'source', 'width', 'height']) assert.ok(k in it, k);
  assert.equal(ITEMS[0].width, 1200);
  assert.ok(ITEMS[0].thumbUrl.startsWith('/api/skjold/ai/thumb/'));
  const th = await A(ITEMS[0].thumbUrl);
  assert.equal(th.status, 200);
  assert.match(th.headers.get('content-type'), /^image\//);
  assert.ok(dlLog.some((x) => x.url === 'https://img.example.com/esp32_t.jpg'), 'proxyen hentet miniatyren');
  // Bildelastere uten header: id-en er nok (bundet til brukeren).
  assert.equal((await req(ITEMS[0].thumbUrl)).status, 200);
  assert.equal((await req('/api/skjold/ai/thumb/tull')).status, 401);
  assert.equal((await B(`/api/skjold/parts/1/photos/from-search`, 'POST', { id: ITEMS[0].id })).status, 404);
  const pB = await mk({ name: 'Ingrids del' }, B);
  const stolen = await B(`/api/skjold/parts/${pB.id}/photos/from-search`, 'POST', { id: ITEMS[0].id });
  assert.equal(stolen.status, 404, 'andres id virker ikke');
  assert.match(stolen.body.error, /søk på nytt/);
  // En id som er tuklet med avvises.
  assert.equal(IM.openId77(`${ITEMS[0].id.slice(0, -3)}AAA`), null);
});

test('velg bilde: lastes ned med SSRF-vern og samme bildebehandling som opplasting; interne adresser avvises', async () => {
  const p = await mk({ name: 'ESP32-DevKitC V4', category: 'Mikrokontrollere' });
  const r = await A(`/api/skjold/parts/${p.id}/photos/from-search`, 'POST', { id: ITEMS[0].id });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.photos.length, 1);
  assert.equal(r.body.from.title, 'ESP32 DevKitC');
  assert.equal((await A(r.body.photos[0].url)).status, 200);
  // SearXNG-treffet på 10.0.0.5: proxyen og nedlastingen nekter.
  const internal = await A(`/api/skjold/parts/${p.id}/photos/from-search`, 'POST', { id: ITEMS[1].id });
  assert.equal(internal.status, 400);
  assert.equal(internal.body.code, 'ssrf');
  assert.equal((await A(ITEMS[1].thumbUrl)).status, 400);
  // DNS som peker internt (rebinding) avvises også.
  const evil = IM.sealId77(db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get(), { url: 'https://evil.example.com/a.jpg', thumb: 'https://evil.example.com/t.jpg', title: 'x', src: 'x' });
  const ev = await A(`/api/skjold/parts/${p.id}/photos/from-search`, 'POST', { id: evil });
  assert.equal(ev.status, 400);
  assert.ok(!dlLog.some((x) => x.url.includes('evil.example.com')), 'ingen forespørsel til intern adresse');
  // Feil innholdstype (HTML) avvises.
  N73._setNet73({ resolve: async () => ['93.184.216.34'], fetch: async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }) });
  const html = await A(`/api/skjold/parts/${p.id}/photos/from-search`, 'POST', { id: ITEMS[0].id });
  assert.equal(html.status, 415);
  N73._setNet73({ resolve: async (host) => (host === 'evil.example.com' ? ['192.168.1.10'] : ['93.184.216.34']), fetch: async (url, init) => { dlLog.push({ url: String(url), ua: init?.headers?.['User-Agent'] }); return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }); } });
});

test('Commons som reserve (User-Agent uten e-post), tydelig melding når alt feiler, og innstillingen av', async () => {
  searx = 'fail';
  searchLog.length = 0;
  const r = await A('/api/skjold/ai/images', 'POST', { q: 'ESP32' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.provider, 'commons');
  assert.equal(r.body.items.length, 1, 'SVG filtrert bort');
  assert.equal(r.body.items[0].source, 'Wikimedia Commons');
  const cm = searchLog.find((x) => x.url.startsWith('https://commons.wikimedia.org/'));
  assert.equal(cm.ua, 'KristoHomelab/1.0 (+https://kristo.no)');
  assert.ok(!/@/.test(cm.ua));
  dlLog.length = 0;
  assert.equal((await A(r.body.items[0].thumbUrl)).status, 200);
  assert.equal(dlLog[0].ua, 'KristoHomelab/1.0 (+https://kristo.no)', 'nedlasting fra Commons med samme User-Agent');
  // Uten SearXNG og Commons nede → tydelig melding.
  updateConfig({ searxng_url: '' });
  commons = 'fail';
  const down = await A('/api/skjold/ai/images', 'POST', { q: 'ESP32' });
  assert.equal(down.status, 502);
  assert.equal(down.body.code, 'unavailable');
  assert.match(down.body.error, /SearXNG er ikke satt opp.*Wikimedia Commons svarte ikke/);
  commons = 'ok'; searx = 'ok';
  // Innstillingen «Finn bilder på nett» av (per bruker).
  const s0 = await A('/api/skjold/ai/settings');
  assert.deepEqual([s0.body.webImages, s0.body.autoSuggestOnPhoto], [true, true]);
  assert.equal((await A('/api/skjold/ai/settings', 'PUT', { webImages: 'ja' })).status, 400);
  const s1 = await A('/api/skjold/ai/settings', 'PUT', { webImages: false });
  assert.equal(s1.body.webImages, false);
  const off = await A('/api/skjold/ai/images', 'POST', { q: 'ESP32' });
  assert.equal(off.status, 409);
  assert.equal(off.body.code, 'off');
  assert.match(off.body.error, /Finn bilder på nett» er slått av/);
  assert.equal((await B('/api/skjold/ai/settings')).body.webImages, true, 'per bruker');
  await A('/api/skjold/ai/settings', 'PUT', { webImages: true, autoSuggestOnPhoto: false });
  assert.equal((await A('/api/skjold/ai/settings')).body.autoSuggestOnPhoto, false);
});

/* ---------------- 5. Rydd opp ---------------- */

const waitJob = async (id, who = A) => { for (let i = 0; i < 200; i++) { const r = await who(`/api/skjold/ai/tidy/${id}`); if (r.body?.state !== 'running') return r.body; await new Promise((res) => setTimeout(res, 5)); } throw new Error('jobben ble ikke ferdig'); };

test('Rydd opp: bakgrunnsjobb én del om gangen, gjennomgang før/etter, apply med historikk, angre', async () => {
  const a = await mk({ name: '10k', category: 'Motstander', specs: { pakke: '0805' }, tags: ['smd'] });
  const b2 = await mk({ name: 'skruer m3', category: 'Diverse' });
  const c2 = await mk({ name: 'Motstand 220 Ω', category: 'Motstander' });
  calls.length = 0;
  replies = [
    { type: 'Motstand', name: 'Motstand', value: '10k', category: 'Motstander', tags: ['motstand'], confidence: 0.9, why: '10k i navnet' },
    { type: 'Skrue', name: 'Skrue', value: 'M3', category: 'Skruer og bolter', confidence: 0.6, why: 'M3' },
    { type: 'Motstand', name: 'Motstand 220 Ω', value: '220', category: 'Motstander', confidence: 0.9, why: '' },
  ];
  const st = await A('/api/skjold/ai/tidy', 'POST', { partIds: [a.id, b2.id, c2.id] });
  assert.equal(st.status, 202, st.text);
  assert.ok(st.body.jobId);
  const job = await waitJob(st.body.jobId);
  assert.equal(job.state, 'done');
  assert.deepEqual([job.done, job.total], [3, 3]);
  assert.ok(calls.every((x) => x.o.background === true), 'viker for Glimt (bakgrunnsprioritet i gaten)');
  const ia = job.items.find((x) => x.partId === a.id);
  assert.deepEqual(ia.before, { name: '10k', category: 'Motstander', specs: { pakke: '0805' }, tags: ['smd'] });
  assert.equal(ia.after.name, 'Motstand 10 kΩ');
  assert.deepEqual(ia.after.specs, { pakke: '0805', verdi: '10 kΩ' });
  assert.deepEqual(ia.after.tags, ['smd', 'motstand']);
  assert.equal(ia.status, 'ready');
  assert.equal(ia.confidence, 0.9);
  const ib = job.items.find((x) => x.partId === b2.id);
  assert.equal(ib.after.name, 'Skrue M3');
  assert.deepEqual([ib.after.category, ib.after.categoryNew], ['Skruer og bolter', true], 'ingen skrue-kategori hos brukeren → standardlisten, merket ny');
  // Ingenting er endret før godkjenning.
  assert.equal((await A(`/api/skjold/parts/${a.id}`)).body.name, '10k');
  // Andre brukere ser ikke jobben.
  assert.equal((await B(`/api/skjold/ai/tidy/${st.body.jobId}`)).status, 404);
  assert.equal((await B(`/api/skjold/ai/tidy/${st.body.jobId}/apply`, 'POST', { partIds: [a.id] })).status, 404);
  // Hopp over én, godta én.
  const sk = await A(`/api/skjold/ai/tidy/${st.body.jobId}/skip`, 'POST', { partIds: [b2.id] });
  assert.equal(sk.body.job.items.find((x) => x.partId === b2.id).status, 'skipped');
  const ap = await A(`/api/skjold/ai/tidy/${st.body.jobId}/apply`, 'POST', { partIds: [a.id, b2.id] });
  assert.equal(ap.status, 200, ap.text);
  assert.deepEqual(ap.body.applied.map((x) => x.partId), [a.id]);
  assert.deepEqual(ap.body.skipped, [{ partId: b2.id, reason: 'hoppet over' }]);
  assert.equal(ap.body.parts[0].name, 'Motstand 10 kΩ');
  assert.equal(ap.body.parts[0].specs.verdi, '10 kΩ');
  const h = (await A(`/api/skjold/parts/${a.id}/history`)).body.items[0];
  assert.equal(h.action, 'endret');
  assert.equal(h.from.name, '10k');
  assert.equal(h.to.name, 'Motstand 10 kΩ');
  assert.equal(h.id, ap.body.applied[0].historyId);
  // Angre via historikken.
  const un = await A(`/api/skjold/history/${h.id}/undo`, 'POST');
  assert.equal(un.status, 200, un.text);
  assert.equal(un.body.part.name, '10k');
  assert.deepEqual(un.body.part.specs, { pakke: '0805' });
  assert.deepEqual(un.body.part.tags, ['smd']);
  // To ganger godtatt = ingenting nytt.
  const again = await A(`/api/skjold/ai/tidy/${st.body.jobId}/apply`, 'POST', { partIds: [a.id] });
  assert.equal(again.body.applied.length, 0);
  replies = [{ type: 'Skrue', name: 'Skrue', value: 'M3', category: 'Skruer og bolter', confidence: 0.6, why: 'M3' }];
  const st2 = await A('/api/skjold/ai/tidy', 'POST', { partIds: [b2.id] });
  const j2 = await waitJob(st2.body.jobId);
  // Delen er endret siden forslaget → hoppes over.
  await A(`/api/skjold/parts/${b2.id}`, 'PATCH', { description: 'endret i mellomtiden' });
  const ap2 = await A(`/api/skjold/ai/tidy/${st2.body.jobId}/apply`, 'POST', { partIds: [b2.id] });
  assert.equal(j2.state, 'done');
  assert.deepEqual(ap2.body.skipped, [{ partId: b2.id, reason: 'delen er endret siden forslaget' }]);
});

test('Rydd opp: all:true, én jobb om gangen, feil uten modell stopper jobben, avbryt', async () => {
  replies = [];
  AI._setAi77(async () => { throw Object.assign(new Error('Glimt fikk ikke svar fra noen modell: Ollama kan ikke nås'), { code: 'no_model' }); });
  const st = await A('/api/skjold/ai/tidy', 'POST', { all: true });
  assert.equal(st.status, 202, st.text);
  const job = await waitJob(st.body.jobId);
  assert.equal(job.state, 'failed');
  assert.match(job.error, /Glimt kunne ikke foreslå/);
  assert.equal((await A('/api/skjold/ai/tidy', 'POST', {})).status, 400);
  // Treg modell: én jobb om gangen (409 med jobId), så avbryt.
  AI._setAi77((task, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('avbrutt')))));
  const s1 = await A('/api/skjold/ai/tidy', 'POST', { all: true });
  const s2 = await A('/api/skjold/ai/tidy', 'POST', { all: true });
  assert.equal(s2.status, 409);
  assert.equal(s2.body.jobId, s1.body.jobId);
  const del = await A(`/api/skjold/ai/tidy/${s1.body.jobId}`, 'DELETE');
  assert.equal(del.body.state, 'cancelled');
  assert.equal((await waitJob(s1.body.jobId)).state, 'cancelled');
  AI._setAi77(null);
});
