// Prompt 48 (PRIV48): «Finansdata forlater aldri huset» – INGEN vei sender kvitteringsdata ut av huset når sperren er på.
// All utgående trafikk i testprosessen avskjæres (globalThis.fetch, http(s).request/get, net.connect/createConnection,
// tls.connect, dns.lookup), og hvert kall noteres med mål og kallstabel. Deretter kjøres alle kvitteringsveiene (ny kjede
// /receipts/scan med og uten device_ocr/device_parse, gammel /receipts-opplasting, HEIC, e-post, ocr-text, parsed,
// «Les på nytt» (Gemini/Groq tvunget), reread (posisjoner), reanalyze (Gemini og lokal OCR), bulk lokal OCR, Les på nytt fra
// transaksjonen, Tesseract-reserven (med Brønnøysund-oppslag i ocr-fallback), kategorisering/sammendrag, bankmatch, logo-oppslag
// for kvitteringen, AI-søk/Glimt-søk/filter (med embeddings) – og all annen finansdata (brukerens avgjørelse): ✦ AI-mal for bankimport,
// «Les med Gemini» for abonnement fra skjermbilde, Roboflow for strekkoder/pakkelapper og favicon-tjenesten for butikklogoer –
// med alle eksterne nøkler satt og alle reserver slått på (verste fall).
// Påstand: bare tillatte interne mål (Ollama, Mac-OCR, localhost). Med sperren AV er Gemini/Brønnøysund tillatt (positiv kontroll,
// som også viser at fellene faktisk fanger trafikken).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire, syncBuiltinESMExports } from 'node:module';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p48priv-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-48p';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '1';
process.env.PORT = '4285';
process.env.INSIDE_DOCKER = '1';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.OLLAMA_MODEL = 'qwen2.5vl:7b';
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'ROBOFLOW_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'MAC_OCR_KEY', 'MAC_OCR_URL']) delete process.env[k];

// ---------- Falsk «tesseract» på PATH (den gamle reserven i ocr-fallback.js kjører binæren) ----------
const BIN = mkdtempSync(join(tmpdir(), 'hl-p48priv-bin-'));
const ORG = '911015838'; // gyldig mod11, ukjent kjede → ocr-fallback vil slå opp navnet i Brønnøysund når sperren er av
writeFileSync(join(BIN, 'tesseract'), `#!/bin/sh
if [ "$1" = "--version" ]; then echo "tesseract 5.3.0"; exit 0; fi
printf 'SNEKKERBUA HANSEN\\nOrg.nr ${ORG.slice(0, 3)} ${ORG.slice(3, 6)} ${ORG.slice(6)}\\nDato 20.10.2026 12:00\\nSKRUER 49,90\\nTOTAL 49,90\\nBANKAXEPT 49,90\\n'
`);
chmodSync(join(BIN, 'tesseract'), 0o755);
process.env.PATH = `${BIN}:${process.env.PATH}`;

// ---------- Fellene: all utgående trafikk ----------
const ALLOWED = new Set(['ollama.test:11434', 'mac.test:8765', 'localhost', '127.0.0.1', '::1', '[::1]']);
const allowed = (host) => ALLOWED.has(host) || ALLOWED.has(String(host).replace(/:\d+$/, ''));
const calls = []; // {via, host, path, stack}
const note = (via, host, path = '') => { const rec = { via, host: String(host ?? ''), path: String(path ?? ''), stack: new Error().stack.split('\n').slice(2, 14).join('\n') }; calls.push(rec); return rec; };
const blockedErr = (host) => Object.assign(new Error(`PRIV48: utgående trafikk til ${host} er sperret i testen`), { code: 'ECONNREFUSED' });

const req = createRequire(import.meta.url);
const http = req('node:http'), https = req('node:https'), net = req('node:net'), tls = req('node:tls'), dns = req('node:dns');
const hostOfReq = (a, b) => {
  if (typeof a === 'string' || a instanceof URL) { const u = new URL(String(a)); return [u.host, u.pathname]; }
  const o = a ?? b ?? {};
  return [`${o.hostname ?? o.host ?? 'localhost'}${o.port ? `:${o.port}` : ''}`, o.path ?? ''];
};
for (const [name, mod] of [['http', http], ['https', https]]) {
  for (const fn of ['request', 'get']) {
    const orig = mod[fn];
    mod[fn] = function trapped(a, b, c) {
      const [host, path] = hostOfReq(a, b);
      note(`${name}.${fn}`, host, path);
      if (allowed(host)) return orig.call(this, a, b, c);
      throw blockedErr(host);
    };
  }
}
const sockHost = (a, b) => (typeof a === 'object' && a ? `${a.host ?? a.servername ?? (a.path ? `unix:${a.path}` : 'localhost')}${a.port ? `:${a.port}` : ''}` : typeof a === 'number' || /^\d+$/.test(String(a)) ? `${typeof b === 'string' ? b : 'localhost'}:${a}` : String(a));
for (const [name, mod, fns] of [['net', net, ['connect', 'createConnection']], ['tls', tls, ['connect']]]) {
  for (const fn of fns) {
    const orig = mod[fn];
    mod[fn] = function trapped(...args) {
      const host = sockHost(args[0], args[1]);
      note(`${name}.${fn}`, host);
      if (allowed(host)) return orig.apply(this, args);
      throw blockedErr(host);
    };
  }
}
{
  const orig = dns.lookup;
  dns.lookup = function trapped(host, ...rest) { note('dns.lookup', host); if (allowed(host)) return orig.call(this, host, ...rest); const cb = rest.at(-1); if (typeof cb === 'function') process.nextTick(cb, blockedErr(host)); };
  const origP = dns.promises.lookup;
  dns.promises.lookup = async function trapped(host, ...rest) { note('dns.promises.lookup', host); if (allowed(host)) return origP.call(this, host, ...rest); throw blockedErr(host); };
}
syncBuiltinESMExports();

// ---------- Falske tjenester bak globalThis.fetch ----------
const { todayOslo45, addDays45 } = await import('../server/glimt45/dates.js');
const D = addDays45(todayOslo45(), -3);
const DMY = `${D.slice(8, 10)}.${D.slice(5, 7)}.${D.slice(0, 4)}`;
const MAC_KEY = 'c'.repeat(64);
const GOOD = (o = {}) => ({ merchant: 'REMA 1000', org_number: ORG, date: D, time: '17:42', currency: 'NOK',
  items: [{ description: 'MELK 1L', quantity: null, unit_price: null, amount: 21.9 }, { description: 'BRØD', quantity: null, unit_price: null, amount: 34.5 }],
  discounts: [], subtotal: null, vat: [{ rate: 15, amount: 7.36 }], total: 56.4, payment_method: 'BankAxept', category_suggestion: 'Mat og dagligvarer', ...o });
const BAD_SUM = () => GOOD({ items: [{ description: 'MELK 1L', quantity: null, unit_price: null, amount: 21.9 }] });
const ROWS = ['REMA 1000', `Org.nr ${ORG}`, `Dato ${DMY} 17:42`, 'MELK 1L 21,90', 'BRØD 34,50', 'TOTAL 56,40', 'BANKAXEPT 56,40'];
const ocrOf = (source, rows = ROWS) => ({ source, lines: rows.map((t, i) => ({ text: t, confidence: 0.95, bbox: [0.05, 0.04 + i * 0.06, 0.8, 0.04] })), rows, full_text: rows.join('\n'), image_size: [1200, 2400], ms: 120 });
const TSV = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  ...ROWS.flatMap((row, li) => row.split(' ').map((w, wi) => `5\t1\t1\t1\t${li + 1}\t${wi + 1}\t${100 + wi * 120}\t${100 + li * 80}\t100\t40\t90\t${w}`))].join('\n');

const svc = { ollama: 'fail', mac: 'ok' }; // ollama: 'fail' (HTTP 500 → alle reserver prøves) | 'bad' (ugyldig svar) | 'ok'
const ndjson = (model, content) => new Response(`${JSON.stringify({ model, message: { role: 'assistant', content }, done: false })}\n${JSON.stringify({ model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' })}\n`, { headers: { 'content-type': 'application/x-ndjson' } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url instanceof Request ? url.url : url));
  const rec = note('fetch', u.host, u.pathname);
  if (u.host === 'ollama.test:11434') {
    if (u.pathname === '/api/tags') return Response.json({ models: [{ name: 'qwen3:8b' }, { name: 'qwen2.5vl:7b' }, { name: 'nomic-embed-text:latest' }] });
    if (u.pathname === '/api/ps') return Response.json({ models: [] });
    if (u.pathname === '/api/show') return Response.json({ capabilities: ['completion', 'vision'] });
    if (u.pathname === '/api/version') return Response.json({ version: '0.6.0' });
    if (u.pathname === '/api/embed') return Response.json({ embeddings: [[0.1, 0.2, 0.3]] });
    if (u.pathname === '/api/chat' || u.pathname === '/api/generate') {
      const body = JSON.parse(init.body);
      if (svc.ollama === 'fail') return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
      const last = body.messages?.at(-1)?.content ?? body.prompt ?? '';
      if (svc.ollama === 'bad' || !/Rader:/.test(last)) return ndjson(body.model, '{}');
      return ndjson(body.model, JSON.stringify(GOOD()));
    }
    return new Response('nei', { status: 404 });
  }
  if (u.host === 'mac.test:8765') {
    if (svc.mac !== 'ok') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (new Headers(init.headers).get('authorization') !== `Bearer ${MAC_KEY}`) return new Response('', { status: 401 });
    if (u.pathname === '/health') return Response.json({ ok: true, languages: ['nb-NO'], version: '1.0.0' });
    if (u.pathname === '/ocr') return Response.json(ocrOf('mac_vision'));
  }
  // Under: eksterne mål. De besvares (så positiv kontroll kan fullføres), men hvert kall er notert og sjekkes etterpå.
  if (u.host === 'generativelanguage.googleapis.com') {
    if (u.pathname.endsWith('/models')) return Response.json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
    if (/embed/i.test(u.pathname)) return Response.json({ embeddings: [{ values: [0.1, 0.2, 0.3] }] });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD()) }] } }] });
  }
  if (u.host === 'data.brreg.no') return Response.json({ navn: 'SNEKKERBUA HANSEN AS', hjemmeside: 'snekkerbua.no' });
  if (u.host === 'api.groq.com') return Response.json({ choices: [{ message: { content: '{}' } }] });
  if (u.host === 'detect.roboflow.com') return Response.json({ predictions: [] });
  rec.refused = true;
  throw Object.assign(new TypeError('fetch failed'), { cause: blockedErr(u.host) });
};
test.after(() => { globalThis.fetch = realFetch; });

const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const gate = await import('../server/ai-gate.js');
gate._gateTest.backoffMs = [5, 5];
const aiRun = await import('../server/ai-run.js');
const fdb = await import('../server/finans/db.js');
const ai = await import('../server/finans/ai.js');
const chain = await import('../server/receipts48/chain.js');
const tess = await import('../server/receipts48/engines/tesseract.js');
const ocrFb = await import('../server/ocr-fallback.js');
const routes = await import('../server/finans/routes.js');
const enrich = await import('../server/finans/enrich.js');

let ipN = 10;
async function request(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : isForm ? body : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
const loginRes = await request('/api/login', { method: 'POST', body: { username: 'sebastian', password: 'testpassord1' } });
assert.equal(loginRes.status, 200, loginRes.text);
const cookie = (await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.251' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) }))
  .headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
const A = (path, method = 'GET', body) => request(path, { method, headers: { cookie }, body });
const tok = (await request('/finans/api/login', { method: 'POST', body: { username: 'sebastian', password: 'testpassord1', deviceName: 'iPhone' } })).body.token;
const T = (path, method = 'GET', body) => request(path, { method, headers: { authorization: `Bearer ${tok}` }, body });
await A('/finans/api/transactions');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]), Buffer.alloc(512, 7)]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(0x0c), Buffer.alloc(512, 3)]);
const blob = (buf, type) => new Blob([buf], { type });
function scanForm({ deviceOcr, deviceParse, client = 'ios 1.48.0' } = {}) {
  const f = new FormData();
  f.append('image', blob(JPEG, 'image/jpeg'), 'kvittering.jpg');
  f.append('scan', blob(JPEG, 'image/jpeg'), 'scan.jpg');
  if (deviceOcr !== undefined) f.append('device_ocr', JSON.stringify(deviceOcr));
  if (deviceParse !== undefined) f.append('device_parse', JSON.stringify(deviceParse));
  if (client) f.append('client', client);
  return f;
}
const fileForm = (buf, type, name, field = 'file') => { const f = new FormData(); f.append(field, blob(buf, type), name); return f; };

async function settled(id) {
  for (let i = 0; i < 400; i++) {
    const r = await T(`/finans/api/receipts/${id}`);
    if (r.status !== 200 || !['pending', 'processing'].includes(r.body.status)) return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error(`kvitteringen ${id} ble aldri ferdig`);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Verste fall: alle eksterne nøkler satt, alle reserver og skystøtter slått på, Gemini/Groq valgt per oppgave. */
function setup({ finLocal = true, ollama = 'fail', mac = 'ok' } = {}) {
  chain._resetChain48(); ai._resetAi();
  Object.assign(svc, { ollama, mac });
  fdb.saveSettings({ provider: 'gemini', fallback: true, aiTasks: { receipts: 'gemini', categorize: 'groq', search: 'groq', barcode: 'roboflow' },
    ocrFallback: true, ocrLowConf: true, minConf: 99, aiSummaries: true, aiSearchEmbed: true, autoCat: false,
    roboflowModel: 'kvittering/1', roboflowBarcodeModel: 'strekkode/1', macOcrUrl: 'http://mac.test:8765',
    receipts48: { macOcr: true, tesseract: true, gemini: true, deviceOcr: true, deviceParse: true, compareMac: true } }, 'owner');
  fdb.setSecret('macOcrKey', MAC_KEY);
  fdb.setSecret('geminiKey', 'AIza-test-key-aaaaaaaaaaaaaaaaaaaa');
  fdb.setSecret('groqKey', 'gsk_test');
  fdb.setSecret('roboflowKey', 'rf_test');
  const r = aiRun.routing(); delete r.own; aiRun.saveServerRouting({ ...r, rules: { ...r.rules, finLocal } });
  ocrFb._setTools({ tesseract: 'tesseract 5.3.0', magick: 'convert' }); // magick: Roboflow-beskjæringen prøves (feiler ImageMagick, brukes originalen)
  tess._setTesseract48({ tools: async () => ({ tesseract: 'tesseract 5.3.0', magick: null }), run: async () => TSV });
}
const mark = () => calls.length;
const outside = (from) => calls.slice(from).filter((c) => !allowed(c.host));
const show = (list) => list.map((c) => `${c.via} ${c.host}${c.path}\n${c.stack}`).join('\n---\n');
function assertInside(from, what) {
  const bad = outside(from);
  assert.deepEqual(bad.map((c) => `${c.via} ${c.host}${c.path}`), [], `${what}: data sendt ut med sperren på:\n${show(bad)}`);
}

/* ---------------- Fellene virker ---------------- */

test('fellene: fetch, http(s).request/get, net/tls.connect og dns.lookup til eksterne mål fanges og stoppes', async () => {
  const m = mark();
  assert.throws(() => https.request('https://example.com/x'), /PRIV48/);
  assert.throws(() => http.get({ hostname: 'example.org', port: 80, path: '/' }), /PRIV48/);
  assert.throws(() => net.connect(443, 'api.groq.com'), /PRIV48/);
  assert.throws(() => tls.connect({ host: 'detect.roboflow.com', port: 443 }), /PRIV48/);
  const { request: namedRequest } = await import('node:https');
  assert.throws(() => namedRequest('https://example.net/'), /PRIV48/, 'også navngitt ESM-import');
  await assert.rejects(() => dns.promises.lookup('data.brreg.no'), /PRIV48/);
  await assert.rejects(() => fetch('https://ukjent.example/'), /fetch failed/);
  assert.deepEqual(outside(m).map((c) => c.host), ['example.com', 'example.org:80', 'api.groq.com:443', 'detect.roboflow.com:443', 'example.net', 'data.brreg.no', 'ukjent.example']);
  // undici (avhengighet i package.json) går via net/tls, og fanges der.
  const undici = await import('undici').catch(() => null);
  if (undici) {
    const n = mark();
    await assert.rejects(() => undici.request('https://undici.example/'));
    assert.ok(outside(n).some((c) => /undici\.example/.test(c.host)), 'undici.request fanges');
  }
});

/* ---------------- Sperren PÅ: ny kjede ---------------- */

test('sperren på · /receipts/scan: uten device-data, med device_ocr, med device_parse (gyldig og ugyldig), begge – Mac-OCR, Tesseract og modellfeil → ingenting ut', async () => {
  const variants = [
    ['bare bildet', {}],
    ['device_ocr (iOS)', { deviceOcr: ocrOf('ios_vision') }],
    ['device_ocr (Android)', { deviceOcr: ocrOf('android_mlkit'), client: 'android/2.0' }],
    ['device_parse gyldig', { deviceParse: GOOD() }],
    ['device_parse ugyldig + device_ocr', { deviceParse: BAD_SUM(), deviceOcr: ocrOf('ios_vision') }],
  ];
  for (const ollama of ['fail', 'bad', 'ok']) {
    for (const mac of ['ok', 'down']) {
      for (const [name, o] of variants) {
        setup({ ollama, mac });
        const m = mark();
        const r = await T('/finans/api/receipts/scan', 'POST', scanForm(o));
        assert.equal(r.status, 201, `${name}: ${r.text}`);
        const d = r.body.pipeline.find((p) => p.step === 'D');
        if (d) assert.notEqual(d.status, 'ok', `${name}: Gemini (D) skal aldri brukes`);
        assert.notEqual(r.body.used, 'D');
        await settled(r.body.receipt_id);
        assertInside(m, `scan ${name} (ollama ${ollama}, mac ${mac})`);
      }
    }
  }
  // Også alias /api/receipts/scan og health.
  setup();
  const m = mark();
  const al = await request('/api/receipts/scan', { method: 'POST', headers: { authorization: `Bearer ${tok}` }, body: scanForm({ deviceOcr: ocrOf('ios_vision') }) });
  assert.equal(al.status, 201, al.text);
  await settled(al.body.receipt_id);
  const h = await T('/finans/api/receipts/health');
  assert.equal(h.body.external.blocked, true);
  assert.equal(h.body.local_only, true); // prompt 52
  assertInside(m, 'alias + health');
});

/* ---------------- Sperren PÅ: gammel kjede og alle «Les på nytt»-veier ---------------- */

test('sperren på · gammel /receipts-opplasting (JPEG og HEIC), Roboflow, Tesseract-reserven (uten Brønnøysund), kategori og bankmatch → ingenting ut', async () => {
  for (const ollama of ['fail', 'bad']) {
    setup({ ollama });
    const m = mark();
    const up = await T('/finans/api/receipts', 'POST', fileForm(JPEG, 'image/jpeg', 'kvittering.jpg'));
    assert.equal(up.status, 200, up.text);
    const done = await settled(up.body.id);
    assert.equal(done.body.rawProvider ?? done.body.provider, 'tesseract', `reserven er lokal OCR (${done.text.slice(0, 300)})`);
    assert.equal(done.body.merchant, 'Snekkerbua Hansen', 'navnet fra OCR, ikke fra Brønnøysund');
    const heic = await T('/finans/api/receipts', 'POST', fileForm(HEIC, 'image/heic', 'kvittering.heic'));
    assert.equal(heic.status, 200, heic.text);
    await settled(heic.body.id);
    // Vedlegg på en transaksjon (bankmatch/«Legg ved kvittering»).
    const tx = (await T('/finans/api/transactions')).body;
    const txId = (tx.items ?? tx.transactions ?? tx)[0]?.id;
    assert.ok(txId, 'demo-transaksjon');
    const t = await T(`/finans/api/transactions/${txId}/receipt`, 'POST', fileForm(JPEG, 'image/jpeg', 'vedlegg.jpg'));
    assert.equal(t.status, 200, t.text);
    await settled(t.body.id);
    assertInside(m, `gammel opplasting (ollama ${ollama})`);
  }
});

test('sperren på · e-post, /receipts/ocr-text og /receipts/parsed → bare lokal modell', async () => {
  setup({ ollama: 'bad' });
  const m = mark();
  const id = await routes.ingestReceipt({ buffer: Buffer.from(`Takk for handelen!\nREMA 1000\nOrg.nr ${ORG}\nTOTAL 56,40\n`), mime: 'text/plain', name: 'E-post' });
  await settled(id);
  const o = await T('/finans/api/receipts/ocr-text', 'POST', { text: ROWS.join('\n'), source: 'ios-vision' });
  assert.equal(o.status, 201, o.text);
  await settled(o.body.id);
  const f = new FormData();
  f.append('text', ROWS.join('\n')); f.append('source', 'android-mlkit'); f.append('file', blob(JPEG, 'image/jpeg'), 'k.jpg');
  const o2 = await T('/finans/api/receipts/ocr-text', 'POST', f);
  assert.equal(o2.status, 201, o2.text);
  await settled(o2.body.id);
  const p = await T('/finans/api/receipts/parsed', 'POST', { source: 'apple-fm', merchant: 'REMA 1000', date: D, total: 56.4, lines: [{ description: 'MELK 1L', amount: 21.9 }, { description: 'BRØD', amount: 34.5 }], ocrText: ROWS.join('\n') });
  assert.equal(p.status, 201, p.text);
  await settled(p.body.id);
  assertInside(m, 'e-post/ocr-text/parsed');
});

test('sperren på · «Les på nytt» (valgt motor, tvunget Gemini/Groq), reread, reanalyze (Gemini/lokal OCR), bulk lokal OCR og Les på nytt fra transaksjonen', async () => {
  setup({ ollama: 'fail' });
  const up = await T('/finans/api/receipts', 'POST', fileForm(JPEG, 'image/jpeg', 'kvittering.jpg'));
  const id = up.body.id;
  await settled(id);
  const mail = await routes.ingestReceipt({ buffer: Buffer.from('REMA 1000\nTOTAL 56,40\n'), mime: 'text/plain', name: 'E-post' });
  await settled(mail);
  const m = mark();
  for (const p of ['', 'gemini', 'groq', 'ollama']) {
    const r = await T(`/finans/api/receipts/${id}/reprocess${p ? `?provider=${p}` : ''}`, 'POST', {});
    assert.equal(r.status, 200, r.text);
    const s = await settled(id);
    if (p === 'gemini' || p === 'groq') assert.doesNotMatch(String(s.body.error ?? ''), /Gemini|Groq/, `tvunget ${p} leses lokalt (prompt 52)`);
  }
  const rr = await T(`/finans/api/receipts/${id}/reread`, 'POST', {});
  assert.equal(rr.status, 202, rr.text);
  await pause(300);
  const g = await T(`/finans/api/receipts/${id}/reanalyze`, 'POST', { engine: 'gemini' });
  assert.ok(g.status >= 400, `Les på nytt med Gemini avvises med sperren på (${g.status} ${g.text.slice(0, 200)})`);
  const gm = await T(`/finans/api/receipts/${mail}/reanalyze`, 'POST', { engine: 'gemini' });
  assert.ok(gm.status !== 200 || !/gemini/i.test(gm.body?.result?.engine ?? ''), 'e-post: «Gemini» blir lokal modell eller feil');
  const ga = await T(`/finans/api/receipts/${id}/reanalyze`, 'POST', { engine: 'gemini', async: true });
  if (ga.status === 202) { for (let i = 0; i < 200; i++) { const j = await T(`/finans/api/jobs/${ga.body.jobId}`); if (j.body?.status !== 'running') break; await pause(20); } }
  const t = await T(`/finans/api/receipts/${id}/reanalyze`, 'POST', { engine: 'tesseract' });
  assert.equal(t.status, 200, t.text);
  const bulk = await T('/finans/api/receipts/ocr', 'POST', { ids: [id] });
  assert.equal(bulk.status, 200, bulk.text);
  // Les på nytt fra transaksjonen (p40 → reanalyze).
  const tx = (await T('/finans/api/transactions')).body;
  const txId = (tx.items ?? tx.transactions ?? tx)[1]?.id;
  if (txId) {
    const att = await T(`/finans/api/transactions/${txId}/receipt`, 'POST', fileForm(JPEG, 'image/jpeg', 'vedlegg.jpg'));
    if (att.status === 200) { await settled(att.body.id); await T(`/finans/api/transactions/${txId}/reread`, 'POST', { engine: 'gemini' }); await T(`/finans/api/transactions/${txId}/reread`, 'POST', { engine: 'tesseract' }); }
  }
  // Den gamle kjeden direkte: bilde (med og uten tvang), tekst (OCR og e-post), lokal OCR.
  await assert.rejects(() => ai.extract(JPEG, 'image/jpeg', ['Annet'], 'gemini')); // prompt 52: leses lokalt (Ollama feiler her)
  await assert.rejects(() => ai.extract(JPEG, 'image/jpeg', ['Annet'], 'groq'));
  await ai.extract(JPEG, 'image/jpeg', ['Annet'], undefined).catch(() => {});
  await ai.extract(HEIC, 'image/heic', ['Annet'], undefined).catch(() => {});
  await ai.extractText(ROWS.join('\n'), ['Annet'], { kind: 'ocr' }).catch(() => {});
  await ai.extractText(ROWS.join('\n'), ['Annet']).catch(() => {});
  const lo = await ai.extractOcr(JPEG, 'image/jpeg');
  assert.equal(lo.data.merchant, 'Snekkerbua Hansen');
  assert.notEqual(lo.data.confidence.merchant, 0.7, 'navnet fra OCR, ikke fra Brønnøysund');
  assertInside(m, 'les på nytt-veiene');
});

test('sperren på · kategorisering og sammendrag (AI), AI-søk, Glimt-søk og filter (embeddings) → bare lokal modell', async () => {
  setup({ ollama: 'bad' });
  const m = mark();
  const mock = process.env.MOCK_DATA;
  process.env.MOCK_DATA = '0'; // summarizeReceipt hopper over AI i mock-modus
  try { await enrich.summarizeReceipt({ merchant: 'REMA 1000', total: 56.4, lines: [{ description: 'MELK 1L', amount: 21.9 }] }, 'Mat og dagligvarer'); } finally { process.env.MOCK_DATA = mock; }
  await ai.textJson('Kategoriser: REMA 1000 MELK 1L', { type: 'object', properties: {} }, { task: 'categorize' }).catch(() => {});
  await ai.textJson('Har jeg kjøpt melk?', { type: 'object', properties: {} }, { task: 'search' }).catch(() => {});
  await ai.textJson('Sammendrag: REMA 1000', { type: 'object', properties: {} }, { task: 'summary' }).catch(() => {});
  await T('/finans/api/search/ai', 'POST', { q: 'hvor mye brukte jeg på melk hos rema' });
  await T('/finans/api/search/ask', 'POST', { q: 'hvor mye brukte jeg på melk hos rema' });
  await T('/finans/api/filter/glimt', 'POST', { q: 'melk hos rema' });
  await T('/finans/api/search?q=melk');
  await pause(800); // embeddings i bakgrunnen (embedLater, 500 ms)
  assertInside(m, 'kategorisering/søk');
});

test('sperren på · logo for kvitteringen («Prøv med AI», org.nr. → Brønnøysund, Gemini, domenegjetting) → ingenting ut', async () => {
  setup({ ollama: 'bad' });
  await A('/finans/api/ai-privacy', 'PATCH', { logo_gemini: true, logo_verify: true, logo_local_receipts: false });
  const up = await T('/finans/api/receipts/parsed', 'POST', { source: 'apple-fm', merchant: 'Snekkerbua Hansen', org_number: ORG, date: D, total: 49.9, lines: [{ description: 'SKRUER', amount: 49.9 }] });
  assert.equal(up.status, 201, up.text);
  await settled(up.body.id);
  const m = mark();
  await T(`/finans/api/receipts/${up.body.id}/logo/ai`, 'POST', {});
  await T('/finans/api/merchants/logo', 'POST', { name: 'Snekkerbua Hansen', orgnr: ORG, receiptId: up.body.id, force: true });
  assertInside(m, 'logo-oppslag');
});

/* ---------------- Sperren PÅ: all annen finansdata (brukerens avgjørelse: sperren gjelder ALL finansdata) ---------------- */

const BANK_ROWS = [['20.10.2026', 'REMA 1000 GRÜNERLØKKA', '-56,40', 'Varekjøp', '1234.56.78901'], ['21.10.2026', 'Lønn', '32 000,00', 'Overføring', '1234.56.78901']];
const shotMod = await import('../server/finans/sub-screenshot.js');
const importTpl = await import('../server/finans/import-templates.js');
async function screenshot(engine = 'gemini') {
  shotMod._setScreenshotFetch((u, i) => globalThis.fetch(u, i)); // ut av mock-modus (samme feller)
  shotMod._setMagick(async () => Buffer.from(JPEG)); // kopi: tjenesten nullstiller bildebufferen etterpå
  try { return await T(`/finans/api/subscriptions/from-screenshot?engine=${engine}`, 'POST', fileForm(JPEG, 'image/jpeg', 'skjermbilde.jpg', 'image')); }
  finally { shotMod._setScreenshotFetch(null); shotMod._setMagick(null); }
}

test('sperren på · bankimport: ✦ AI-mal for ukjent kontoutskrift går bare til lokal Ollama', async () => {
  setup({ ollama: 'bad' });
  const m = mark();
  await importTpl.detectFormat(BANK_ROWS, { ai: true, save: false });
  assertInside(m, 'bankimport (✦ AI-mal)');
  assert.ok(calls.slice(m).some((c) => c.host === 'ollama.test:11434' && c.path === '/api/chat'), 'den lokale modellen ble spurt');
});

test('sperren på · «Les med Gemini» for abonnement fra skjermbilde avvises med norsk melding og canGemini:false', async () => {
  setup({ ollama: 'bad' });
  const m = mark();
  const r = await screenshot('gemini');
  assertInside(m, 'abonnement fra skjermbilde (Gemini)');
  assert.ok(r.status >= 400, r.text);
  assert.match(r.body.error, /Finansdata forlater aldri huset/);
  assert.equal(r.body.canGemini, false);
  // Feil med den lokale modellen tilbyr heller ikke Gemini.
  const loc = await screenshot('ollama');
  if (loc.status >= 400) assert.equal(loc.body.canGemini, false, loc.text);
  assert.equal((await T('/finans/api/ai/vision')).body.canGemini, false);
  assertInside(m, 'abonnement fra skjermbilde (lokalt)');
});

test('sperren på · strekkoder/pakkelapper: Roboflow hoppes over (lokal zbar som reserve)', async () => {
  setup({ ollama: 'bad' });
  const m = mark();
  await T('/finans/api/scan/barcode', 'POST', fileForm(JPEG, 'image/jpeg', 'pakkelapp.jpg'));
  await ai.barcode(JPEG, 'image/jpeg').catch(() => {});
  assertInside(m, 'strekkoder (Roboflow)');
});

test('sperren på · butikklogoer: ingen favicon-oppslag hos Google (klienten viser bokstavikon)', async () => {
  setup({ ollama: 'bad' });
  const m = mark();
  const r = await request('/finans/api/logo/snekkerbua-paa.no');
  assert.equal(r.status, 404);
  assert.equal(await enrich.logo('snekkerbua-paa.no'), null);
  assertInside(m, 'favicon');
});

/* ---------------- Sperren AV: positiv kontroll ---------------- */

test('sperren AV (positiv kontroll): kvitteringer aldri ut (prompt 52); Brønnøysund, Roboflow, embeddings, logo, bankimport, skjermbilde og favicon går ut – fellene ser trafikken', async () => {
  setup({ finLocal: false, ollama: 'fail', mac: 'down' });
  tess._setTesseract48({ tools: async () => ({ tesseract: null }), run: async () => '' });
  const m0 = mark();
  let m = mark();
  const r = await T('/finans/api/receipts/scan', 'POST', scanForm({ deviceOcr: ocrOf('ios_vision') }));
  assert.equal(r.status, 201, r.text);
  // Prompt 52: Gemini er tatt helt ut av kvitteringene – også når sperren er av (ny og gammel kjede, «Les på nytt med Gemini»).
  assert.equal(r.body.used, null, r.text);
  assert.ok(!outside(m).some((c) => c.host === 'generativelanguage.googleapis.com'), 'ny kjede: aldri Gemini, heller ikke uten sperre');
  await settled(r.body.receipt_id);
  m = mark();
  await assert.rejects(() => ai.extract(JPEG, 'image/jpeg', ['Annet'], 'gemini'));
  assert.ok(!outside(m).some((c) => c.host === 'generativelanguage.googleapis.com' || c.host === 'detect.roboflow.com'), 'gammel kjede: «Les på nytt med Gemini» leses lokalt');
  const o = await ai.extractOcr(JPEG, 'image/jpeg');
  // Oppslaget huskes per org.nr. (brregCache), så det kan ha skjedd i lav-sikkerhet-kontrollen i extract over.
  assert.ok(outside(m0).some((c) => c.host === 'data.brreg.no'), 'Tesseract-reserven slår opp org.nr. i Brønnøysund når sperren er av');
  assert.equal(o.data.confidence.merchant, 0.7, 'navnet kom fra Brønnøysund');
  // Prompt 52: Roboflow-beskjæringen av kvitteringsbildet er tatt ut. Gemini-embeddings i AI-søket og logo-oppslaget går ut når sperren er av.
  m = mark();
  await ai.extract(JPEG, 'image/jpeg', ['Annet'], undefined).catch(() => {});
  assert.ok(!outside(m).some((c) => c.host === 'detect.roboflow.com' || c.host === 'generativelanguage.googleapis.com'), 'kvitteringsbildet går aldri til Roboflow/Gemini');
  m = mark();
  await T('/finans/api/search/ai', 'POST', { q: 'hvor mye brukte jeg på skruer' });
  await pause(800);
  assert.ok(outside(m).some((c) => /embed/i.test(c.path)), 'Gemini-embeddings i AI-søket');
  m = mark();
  await T('/finans/api/merchants/logo', 'POST', { name: 'Snekkerbua Hansen', orgnr: ORG, force: true });
  assert.ok(outside(m).some((c) => c.host === 'data.brreg.no'), 'logo-oppslaget i Brønnøysund');
  // Annen finansdata: bankimport, abonnement fra skjermbilde, Roboflow for strekkoder, favicon-tjenesten.
  m = mark();
  await importTpl.detectFormat(BANK_ROWS.map((r) => [...r, 'x']), { ai: true, save: false });
  assert.ok(outside(m).some((c) => c.host === 'generativelanguage.googleapis.com'), 'bankimport: Gemini (valgt motor) når sperren er av');
  m = mark();
  await screenshot('gemini');
  assert.ok(outside(m).some((c) => c.host === 'generativelanguage.googleapis.com'), 'abonnement fra skjermbilde: «Les med Gemini»');
  m = mark();
  await ai.barcode(JPEG, 'image/jpeg').catch(() => {});
  assert.ok(outside(m).some((c) => c.host === 'detect.roboflow.com'), 'strekkoder: Roboflow');
  m = mark();
  await enrich.logo('snekkerbua-av.no');
  assert.ok(outside(m).some((c) => c.host === 'www.google.com'), 'favicon-tjenesten');
});
