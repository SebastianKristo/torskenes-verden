// Prompt 28 (SERVER28): abonnement fra skjermbilde (falsk Ollama for alle feiltilfellene, Gemini bare på forespørsel),
// stedssøk i Vær (Open-Meteo + foldet + Nominatim, mocket) og Mer-rekkefølge per konto (/api/prefs/mer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p28-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p28-logos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.OLLAMA_MODEL = 'qwen3:8b'; // Chat-/kvitteringsmodellen uten vision: skal aldri brukes til skjermbildet
process.env.VISION_PULL_POLL_MS = '10';
delete process.env.MOCK_DATA;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Global fetch (Gemini, Nominatim, Open-Meteo, /api/pull): styres per test. Standard: nettet er nede.
const realFetch = globalThis.fetch;
const netDown = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
let net = netDown;
const netCalls = [];
globalThis.fetch = async (url, init) => { netCalls.push(String(url)); return net(String(url), init); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const shot = await import('../server/finans/sub-screenshot.js');
const ai = await import('../server/finans/ai.js');
const { setSecret } = await import('../server/finans/db.js');
const places = await import('../server/weather-places.js');
const { clearCache } = await import('../server/cache.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body, headers = {}) => {
  const isForm = body instanceof FormData, raw = Buffer.isBuffer(body);
  const r = await app.request(path, { method, headers: { cookie, ...(body && !isForm && !raw ? { 'content-type': 'application/json' } : {}), ...headers }, body: isForm || raw ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text };
};
const S = client(await login('sebastian', 'testpassord1'));
assert.equal((await S('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client(await login('kari', 'kariPassord123'));
await S('/finans/api/transactions');
await K('/finans/api/transactions');

/* ---------------- Abonnement fra skjermbilde ---------------- */

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xc0, 0, 17, 8, 0x03, 0x20, 0x02, 0x58, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]); // 600×800
const PNG = (() => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b); b.writeUInt32BE(1290, 16); b.writeUInt32BE(2796, 20); return b; })();
const HEIC = (() => { const b = Buffer.alloc(64); b.writeUInt32BE(24, 0); b.write('ftypheic', 4); return b; })();
const form = (buf, name = 'skjerm.jpg', type = 'image/jpeg') => { const fd = new FormData(); fd.append('image', new File([buf], name, { type })); return fd; };
const URL_ = '/finans/api/subscriptions/from-screenshot';

// Falsk Ollama: tags = installerte modeller, caps = capabilities per modell, chat(body, init) = svaret på /api/chat.
function fakeOllama({ tags = ['qwen2.5vl:7b'], caps = {}, chat, down = false } = {}) {
  const calls = [];
  shot._setScreenshotFetch(async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (down) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (url.endsWith('/api/tags')) return Response.json({ models: tags.map((name) => ({ name })) });
    if (url.endsWith('/api/show')) { const m = JSON.parse(init.body).model; return Response.json({ capabilities: caps[m] ?? (/vl|vision|gemma/.test(m) ? ['completion', 'vision'] : ['completion']) }); }
    if (url.endsWith('/api/chat')) return chat(JSON.parse(init.body), init);
    return new Response('nei', { status: 404 });
  });
  return calls;
}
const reply = (content) => Response.json({ model: 'x', message: { role: 'assistant', content }, done: true });

test('skjermbilde: riktig Ollama-kall (vision-modell, ren base64, format json, num_ctx, keep_alive), <think> og engelske nøkler', async () => {
  const calls = fakeOllama({ chat: () => reply('<think>Jeg ser {kanskje} Netflix</think>\nHer er svaret: {"service":"Netflix","plan":"Standard","price":"129,00 kr","currency":"NOK","cycle":"monthly","next_charge":"2026-11-02","confidence":{"service":0.95,"price":0.9,"next_charge":0.9}} takk!') });
  const r = await S(URL_, 'POST', form(JPEG));
  assert.equal(r.status, 200, r.text);
  const chat = calls.find((x) => x.url.endsWith('/api/chat'));
  assert.equal(chat.url, 'http://ollama.test:11434/api/chat');
  assert.equal(chat.body.model, 'qwen2.5vl:7b');
  assert.equal(chat.body.stream, false);
  assert.equal(chat.body.format, 'json');
  assert.equal(chat.body.keep_alive, '10m');
  assert.deepEqual(chat.body.options, { temperature: 0, num_ctx: 8192 });
  const img = chat.body.messages[0].images[0];
  assert.ok(!img.startsWith('data:'), 'uten data:-prefiks');
  assert.deepEqual(Buffer.from(img, 'base64'), JPEG);
  assert.match(chat.body.messages[0].content, /^Du leser et skjermbilde av et abonnement \(App Store, e-post, kvittering eller kontoside\)\./);
  assert.match(chat.body.messages[0].content, /Ikke gjett pris\.$/);
  assert.equal(r.body.tjeneste, 'Netflix');
  assert.equal(r.body.pris, 12900);
  assert.equal(r.body.syklus, 'mnd');
  assert.equal(r.body.neste_trekk, '2026-11-02');
  assert.equal(r.body.engine, 'ollama');
  assert.equal(r.body.model, 'qwen2.5vl:7b');
  assert.deepEqual([r.body.image.w, r.body.image.h], [600, 800]);
  // Data-URL som tekstfelt og JSON-body virker også (prefikset fjernes).
  const fd = new FormData(); fd.append('image', `data:image/jpeg;base64,${JPEG.toString('base64')}`);
  assert.equal((await S(URL_, 'POST', fd)).status, 200);
  assert.equal((await S(URL_, 'POST', { image: `data:image/jpeg;base64,${JPEG.toString('base64')}` })).status, 200);
  assert.ok(!calls.filter((x) => x.url.endsWith('/api/chat')).some((x) => x.body.messages[0].images[0].startsWith('data:')));
  // AI-loggen (per bruker) har modell og status.
  const log = await S('/finans/api/ai/log?limit=5');
  assert.ok(log.body.items.some((x) => x.task === 'subscreenshot' && x.model === 'qwen2.5vl:7b' && x.status === 'ok'));
});

test('skjermbilde: Chat-modellen qwen3:8b uten vision brukes aldri; rekkefølge qwen2.5vl → gemma → llama3.2-vision', async () => {
  let calls = fakeOllama({ tags: ['qwen3:8b', 'llama3.2-vision:11b', 'gemma3:4b'], chat: () => reply('{"tjeneste":"Spotify","pris":119,"syklus":"mnd"}') });
  let r = await S(URL_, 'POST', form(JPEG));
  assert.equal(r.status, 200, r.text);
  assert.equal(calls.find((x) => x.url.endsWith('/api/chat')).body.model, 'gemma3:4b');
  assert.equal(r.body.tjeneste, 'Spotify');
  // capabilities avgjør, ikke navnet.
  calls = fakeOllama({ tags: ['qwen3:8b', 'minicpm-v:8b'], caps: { 'minicpm-v:8b': ['completion', 'vision'] }, chat: () => reply('{"tjeneste":"Tidal","pris":129}') });
  r = await S(URL_, 'POST', form(JPEG));
  assert.equal(calls.find((x) => x.url.endsWith('/api/chat')).body.model, 'minicpm-v:8b');
});

test('skjermbilde: feilkoder ollama_down, no_vision, timeout, not_found (canGemini) og Gemini aldri automatisk', async () => {
  netCalls.length = 0;
  fakeOllama({ down: true });
  let r = await S(URL_, 'POST', form(JPEG));
  assert.equal(r.status, 502);
  assert.deepEqual([r.body.code, r.body.error, r.body.canGemini], ['ollama_down', 'Får ikke kontakt med Ollama på hjemmeserveren.', false]);

  fakeOllama({ tags: ['qwen3:8b', 'nomic-embed-text'], chat: () => { throw new Error('skal ikke kalles'); } });
  r = await S(URL_, 'POST', form(JPEG));
  assert.equal(r.status, 409);
  assert.deepEqual([r.body.code, r.body.error, r.body.install], ['no_vision', 'Ingen bildemodell installert.', 'qwen2.5vl:7b']);

  ai._aiTest.scale = 0.002; // 120 s → 240 ms
  try {
    fakeOllama({ chat: (_b, init) => new Promise((_res, rej) => { const keep = setTimeout(() => {}, 5000); init.signal.addEventListener('abort', () => { clearTimeout(keep); rej(init.signal.reason); }); }) }); // AbortSignal.timeout holder ikke prosessen i live
    r = await S(URL_, 'POST', form(JPEG));
    assert.equal(r.status, 504);
    assert.deepEqual([r.body.code, r.body.error], ['timeout', 'Bildemodellen brukte for lang tid.']);
  } finally { ai._aiTest.scale = 1; }

  for (const content of ['ikke json i det hele tatt', '{}', '{"tjeneste":"Netflix","pris":0}', '{"tjeneste":null,"pris":99}']) {
    fakeOllama({ chat: () => reply(content) });
    r = await S(URL_, 'POST', form(JPEG));
    assert.equal(r.status, 422, content);
    assert.deepEqual([r.body.code, r.body.error], ['not_found', 'Fant ikke et abonnement i bildet.']);
  }
  assert.ok(!netCalls.some((u) => /generativelanguage/.test(u)), 'Gemini kalles aldri uten at brukeren ber om det');

  // Med Gemini-nøkkel: canGemini = true i feilsvaret, men fortsatt ingen Gemini-kall.
  setSecret('geminiKey', 'AIzaTEST');
  fakeOllama({ down: true });
  r = await S(URL_, 'POST', form(JPEG));
  assert.equal(r.body.canGemini, true);
  assert.ok(!netCalls.some((u) => /generativelanguage/.test(u)));
});

test('skjermbilde: «Les med Gemini» (?engine=gemini) med gemini-2.5-flash og JSON, logges i ai_audit', async () => {
  setSecret('geminiKey', 'AIzaTEST');
  fakeOllama({ chat: () => { throw new Error('Ollama skal ikke brukes'); } });
  let sent = null;
  net = async (url, init) => {
    if (/generativelanguage/.test(url)) { sent = { url, body: JSON.parse(init.body) }; return Response.json({ candidates: [{ content: { parts: [{ text: '{"tjeneste":"Viaplay","pris":"449,00 kr","syklus":"mnd"}' }] } }] }); }
    return netDown();
  };
  try {
    const r = await S(`${URL_}?engine=gemini`, 'POST', form(JPEG));
    assert.equal(r.status, 200, r.text);
    assert.match(sent.url, /models\/gemini-2\.5-flash:generateContent$/);
    assert.equal(sent.body.generationConfig.responseMimeType, 'application/json');
    assert.ok(!sent.body.contents[0].parts[0].inline_data.data.startsWith('data:'));
    assert.match(sent.body.contents[0].parts[1].text, /^Du leser et skjermbilde av et abonnement/);
    assert.deepEqual([r.body.tjeneste, r.body.pris, r.body.engine], ['Viaplay', 44900, 'gemini']);
    const a = await S('/finans/api/ai-audit');
    const row = a.body.find((x) => x.purpose === 'subscreenshot');
    assert.ok(row && row.engine === 'gemini' && row.purposeName === 'Abonnement fra skjermbilde');
    assert.ok(!(await K('/finans/api/ai-audit')).body.some((x) => x.purpose === 'subscreenshot'), 'per bruker');
  } finally { net = netDown; }
});

test('skjermbilde: HEIC og stor PNG konverteres til JPEG ≤1600 px; uten ImageMagick sendes bildet som det er', async () => {
  const conv = [];
  shot._setMagick(async (buf, kind) => { conv.push(kind); return Buffer.from(JPEG); }); // kopi: serveren nullstiller bufferen etterpå
  try {
    const calls = fakeOllama({ chat: () => reply('{"tjeneste":"iCloud+","pris":39,"syklus":"mnd"}') });
    let r = await S(URL_, 'POST', form(HEIC, 'IMG_0001.HEIC', 'image/heic'));
    assert.equal(r.status, 200, r.text);
    r = await S(URL_, 'POST', form(PNG, 'skjerm.png', 'image/png'));
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(conv, ['image/heic', 'image/png']);
    assert.equal(r.body.image.converted, true);
    for (const c of calls.filter((x) => x.url.endsWith('/api/chat'))) assert.deepEqual(Buffer.from(c.body.messages[0].images[0], 'base64'), JPEG);
    // Rått image/jpeg-innhold godtas også.
    assert.equal((await S(URL_, 'POST', JPEG, { 'content-type': 'image/jpeg' })).status, 200);
  } finally { shot._setMagick(null); }
  shot._setMagick(async () => null); // ImageMagick mangler
  try {
    const calls = fakeOllama({ chat: () => reply('{"tjeneste":"Netflix","pris":129}') });
    const r = await S(URL_, 'POST', form(PNG, 'skjerm.png', 'image/png'));
    assert.equal(r.status, 200);
    assert.deepEqual(Buffer.from(calls.find((x) => x.url.endsWith('/api/chat')).body.messages[0].images[0], 'base64'), PNG);
  } finally { shot._setMagick(null); }
  const bad = new FormData(); bad.append('image', new File(['hei'], 'x.txt', { type: 'text/plain' }));
  const r = await S(URL_, 'POST', bad);
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'bad_image');
});

test('skjermbilde: hjelpere (pris, nøkler, think, bildestørrelse)', () => {
  assert.deepEqual(shot.parsePrice('129,00 kr'), { amount: 129, currency: 'NOK' });
  assert.deepEqual(shot.parsePrice('$9.99'), { amount: 9.99, currency: 'USD' });
  assert.equal(shot.parsePrice('1 290,50').amount, 1290.5);
  assert.equal(shot.parsePrice('1.290,50 NOK').amount, 1290.5);
  assert.equal(shot.parsePrice('149,-').amount, 149);
  assert.equal(shot.parsePrice('kr 1 049').amount, 1049);
  assert.deepEqual(shot.parseModelJson('<think>{"a":1}</think>```json\n{"b":2}\n```'), { b: 2 });
  assert.equal(shot.parseModelJson('<think>bare tenking</think>'), null);
  const n = shot.normalizeSub({ service: 'Netflix', price: 15.49, currency: 'USD', cycle: 'year', next_charge: '2027-01-01' }, { now: '2026-10-19', u: 'nobody' });
  assert.deepEqual([n.tjeneste, n.syklus, n.neste_trekk, n.approx], ['Netflix', 'år', '2027-01-01', true]);
  const w = shot.normalizeSub({ tjeneste: 'Avis', pris: 30, syklus: 'uke' }, { now: '2026-10-19', u: 'nobody' });
  assert.deepEqual([w.syklus, w.syklusOriginal, w.pris], ['mnd', 'uke', 13000]);
  assert.deepEqual(shot.imageSize(PNG), { w: 1290, h: 2796 });
  assert.equal(shot.imageKind(HEIC), 'image/heic');
});

test('vision: GET /ai/vision og POST /ai/vision/install (admin, SSE-fremdrift)', async () => {
  fakeOllama({ tags: ['qwen3:8b'], chat: () => reply('{}') });
  let r = await S('/finans/api/ai/vision');
  assert.deepEqual([r.body.ok, r.body.code], [false, 'no_vision']);
  assert.equal((await K('/finans/api/ai/vision/install', 'POST')).status, 403);
  net = async (url) => {
    if (url.endsWith('/api/pull')) {
      const lines = [{ status: 'pulling manifest' }, { status: 'downloading', total: 100, completed: 40 }, { status: 'downloading', total: 100, completed: 100 }, { status: 'success' }];
      return new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } });
    }
    return netDown();
  };
  try {
    r = await S('/finans/api/ai/vision/install', 'POST');
    assert.equal(r.status, 200);
    const events = r.text.split('\n\n').filter(Boolean);
    const last = events.at(-1);
    assert.match(last, /event: done/);
    assert.deepEqual(JSON.parse(last.match(/data: (.*)/)[1]), { ok: true, model: 'qwen2.5vl:7b', error: null });
    const first = JSON.parse(events[0].match(/data: (.*)/)[1]);
    assert.equal(first.name, 'qwen2.5vl:7b');
    assert.ok('pct' in first && 'status' in first && 'done' in first);
  } finally { net = netDown; }
  fakeOllama({ tags: ['qwen3:8b', 'qwen2.5vl:7b'], chat: () => reply('{}') });
  r = await S('/finans/api/ai/vision?fresh=1');
  assert.deepEqual([r.body.ok, r.body.model], [true, 'qwen2.5vl:7b']);
});

/* ---------------- Stedssøk ---------------- */

test('stedssøk: Strømstad → «Västra Götaland, Sverige» (Open-Meteo + foldet + Nominatim, duplikater slått sammen)', async () => {
  clearCache(); places._resetNominatim();
  const seen = [];
  net = async (url, init) => {
    seen.push({ url, headers: init?.headers ?? {} });
    if (url.startsWith('https://geocoding-api.open-meteo.com/v1/search')) {
      const name = new URL(url).searchParams.get('name');
      assert.equal(new URL(url).searchParams.get('count'), '10');
      assert.equal(new URL(url).searchParams.get('language'), 'nb');
      if (name === 'Stromstad') return Response.json({ results: [{ name: 'Strömstad', latitude: 58.93945, longitude: 11.17124, country: 'Sverige', country_code: 'SE', admin1: 'Västra Götaland', population: 6288, feature_code: 'PPLA2' }] });
      return Response.json({}); // «Strømstad» med ø gir ingen treff hos Open-Meteo
    }
    if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
      return Response.json([
        { lat: '58.9366', lon: '11.1735', name: 'Strömstad', category: 'place', type: 'town', addresstype: 'town', importance: 0.45, address: { town: 'Strömstad', municipality: 'Strömstads kommun', county: 'Västra Götalands län', country: 'Sverige', country_code: 'se' } },
        { lat: '58.95', lon: '11.2', name: 'Strømstad Pizza', category: 'amenity', type: 'restaurant', addresstype: 'amenity', address: { country: 'Sverige' } },
        { lat: '59.2', lon: '10.9', name: 'Strømstadveien', category: 'highway', type: 'residential', addresstype: 'road', address: { road: 'Strømstadveien', country: 'Norge' } },
      ]);
    }
    return netDown();
  };
  try {
    const r = await S('/api/weather/places?q=Str%C3%B8mstad');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.length, 1, JSON.stringify(r.body));
    assert.deepEqual(r.body[0], { name: 'Strömstad', sub: 'Västra Götaland, Sverige', lat: 58.9395, lon: 11.1712, country: 'Sverige', source: 'open-meteo', region: 'Västra Götaland' });
    const nom = seen.find((x) => x.url.includes('nominatim'));
    const p = new URL(nom.url).searchParams;
    assert.deepEqual([p.get('format'), p.get('addressdetails'), p.get('limit'), p.get('accept-language'), p.get('q')], ['jsonv2', '1', '8', 'nb', 'Strømstad']);
    assert.match(nom.headers['User-Agent'], /Homelab/);
    assert.ok(nom.headers.Referer);
    assert.ok(seen.some((x) => x.url.includes('name=Stromstad')), 'foldet variant');
    // Cache i 24 t: nytt søk gir ingen nye kall.
    const n = seen.length;
    await S('/api/weather/places?q=Str%C3%B8mstad');
    assert.equal(seen.length, n);
    // Under 2 tegn: tom liste. Uten q: lagrede steder som før.
    assert.deepEqual((await S('/api/weather/places?q=S')).body, []);
    const saved = await S('/api/weather/places');
    assert.ok(Array.isArray(saved.body) && saved.body.some((x) => x.id === 'oslo'));
  } finally { net = netDown; }
  clearCache();
  const fail = await S('/api/weather/places?q=Bergen');
  assert.equal(fail.status, 502);
  assert.equal(fail.body.error, 'Får ikke søkt nå. Prøv igjen.');
});

test('stedssøk: sortering (starter med søket, så folketall), maks 10, fold()', () => {
  assert.equal(places.fold('Strømstad Ærø Åsgårdstrand Västra'), 'Stromstad Aero Asgardstrand Vastra');
  const mk = (name, lat, pop, source = 'open-meteo') => ({ name, region: 'R', country: 'Norge', lat, lon: 10, pop, source });
  const out = places.mergePlaces('ber', [[mk('Nye Berg', 60, 900000), mk('Bergen', 61, 280000), mk('Berlevåg', 70, 900)], [mk('Bergen', 61.01, 0, 'osm'), ...Array.from({ length: 12 }, (_, i) => mk(`Berg ${i}`, 50 + i, i))]]);
  assert.equal(out.length, 10);
  assert.deepEqual(out.slice(0, 2).map((x) => x.name), ['Bergen', 'Berlevåg']);
  assert.equal(out.filter((x) => x.name === 'Bergen').length, 1);
  assert.ok(out.every((x) => x.sub === 'R, Norge'));
});

/* ---------------- Mer-rekkefølge ---------------- */

test('Mer: /api/prefs/mer per konto, validering, Innstillinger kan ikke skjules, abonnementer gyldig, scope fin', async () => {
  let r = await S('/api/prefs/mer');
  assert.deepEqual([r.body.o, r.body.h, r.body.scope], [[], [], 'hl']);
  assert.ok(r.body.keys.includes('abonnementer') && r.body.keys.includes('abo') && r.body.locked.includes('innst'));
  r = await S('/api/prefs/mer', 'PUT', { o: ['finans', 'abonnementer', 'chat', 'chat', 'hacker<script>', 'innst'], h: ['media', 'innst', 'Innstillinger', 'tull'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.o, ['finans', 'abonnementer', 'chat', 'innst']);
  assert.deepEqual(r.body.h, ['media']);
  assert.deepEqual(r.body.ignored, ['hacker<script>', 'tull']);
  assert.deepEqual((await S('/api/prefs/mer')).body.o, ['finans', 'abonnementer', 'chat', 'innst']);
  assert.deepEqual((await K('/api/prefs/mer')).body.o, [], 'per konto');
  assert.equal((await S('/api/prefs/mer', 'PUT', { o: 'finans' })).status, 400);
  r = await S('/api/prefs/mer?scope=fin', 'PUT', { o: ['kvitt', 'fliste', 'abo'], h: ['boliger'] });
  assert.deepEqual([r.body.o, r.body.h, r.body.scope], [['kvitt', 'fliste', 'abo'], ['boliger'], 'fin']);
  assert.deepEqual((await S('/api/prefs/mer')).body.h, ['media'], 'hl uendret');
  assert.equal((await app.request('/api/prefs/mer')).status, 401);
});
