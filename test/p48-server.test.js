// Prompt 48 (SERVER48): felles schema (OCR + kvittering), validering i kode, kjeden A→B→C→Tesseract→D på serveren
// (POST /finans/api/receipts/scan + alias /api/receipts/scan), alle reserveveiene, av/på per steg, sammenligning av totalen
// device-OCR mot Mac-OCR, sperren «Finansdata forlater aldri huset» (også i den gamle kjeden i finans/ai.js), Groq ute av
// kvitteringskjeden, GET /receipts/health, Mac-OCR-klienten, Tesseract med tsv og rettelser som testdata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p48s-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-48s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4281';
process.env.INSIDE_DOCKER = '1';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.OLLAMA_MODEL = 'qwen2.5vl:7b';
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.MAC_OCR_KEY;
delete process.env.MAC_OCR_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { todayOslo45, addDays45 } = await import('../server/glimt45/dates.js');
const TODAY = todayOslo45();
const D = addDays45(TODAY, -3);
const DMY = `${D.slice(8, 10)}.${D.slice(5, 7)}.${D.slice(0, 4)}`;
const MAC_KEY = 'a'.repeat(64);

// ---------- Falske tjenester ----------
const calls = []; // {host, path, body, t}
const llm = { queue: [], fallback: null }; // svar på kvitteringskall («Rader:»): tekst eller funksjon(body) → tekst; null = HTTP 500
const mac = { status: 200, json: null, fail: false };
const gem = { json: null };
const GOOD = (o = {}) => ({ merchant: 'REMA 1000', org_number: '911015838', date: D, time: '17:42', currency: 'NOK',
  items: [{ description: 'MELK 1L', quantity: null, unit_price: null, amount: 21.9 }, { description: 'BRØD', quantity: null, unit_price: null, amount: 34.5 }],
  discounts: [], subtotal: null, vat: [{ rate: 15, amount: 7.36 }], total: 56.4, payment_method: 'BankAxept', category_suggestion: 'Mat og dagligvarer', ...o });
const BAD_SUM = () => GOOD({ items: [{ description: 'MELK 1L', quantity: null, unit_price: null, amount: 21.9 }] });
const ocrOf = (source, rows) => ({ source, lines: rows.map((t, i) => ({ text: t, confidence: 0.95, bbox: [0.05, 0.04 + i * 0.06, 0.8, 0.04] })), rows, full_text: rows.join('\n'), image_size: [1200, 2400], ms: 120 });
const DEV_ROWS = ['REMA 1000', 'Org.nr 911 015 838', `Dato ${DMY} 17:42`, 'MELK 1L 21,90', 'BRØD 34,50', 'TOTAL 56,40', 'BANKAXEPT 56,40'];
const MAC_ROWS = DEV_ROWS;

const realFetch = globalThis.fetch;
const ndjson = (model, content) => new Response(`${JSON.stringify({ model, message: { role: 'assistant', content }, done: false })}\n${JSON.stringify({ model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' })}\n`, { headers: { 'content-type': 'application/x-ndjson' } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const rec = { host: u.host, path: u.pathname, init, t: calls.length };
  calls.push(rec);
  if (u.host === 'ollama.test:11434') {
    if (u.pathname === '/api/tags') return Response.json({ models: [{ name: 'qwen3:8b' }, { name: 'qwen2.5vl:7b' }] });
    if (u.pathname === '/api/ps') return Response.json({ models: [] });
    if (u.pathname === '/api/show') return Response.json({ capabilities: ['completion'] });
    if (u.pathname === '/api/version') return Response.json({ version: '0.6.0' });
    if (u.pathname === '/api/chat') {
      const body = JSON.parse(init.body);
      rec.body = body;
      const last = body.messages?.at(-1)?.content ?? '';
      if (!/Rader:/.test(last)) return ndjson(body.model, llm.fallback ?? '{}'); // sammendrag o.l. i køen
      const next = llm.queue.length ? llm.queue.shift() : JSON.stringify(GOOD());
      if (next === null) return new Response(JSON.stringify({ error: 'boom' }), { status: 400 });
      return ndjson(body.model, typeof next === 'function' ? next(body) : next);
    }
    return new Response('nei', { status: 404 });
  }
  if (u.host === 'mac.test:8765') {
    if (mac.fail) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const auth = new Headers(init.headers).get('authorization');
    if (auth !== `Bearer ${MAC_KEY}`) return new Response('', { status: 401 });
    if (u.pathname === '/health') return Response.json({ ok: true, languages: ['nb-NO', 'en-US'], version: '1.0.0' });
    if (u.pathname === '/ocr') { rec.form = init.body; return mac.status === 200 ? Response.json(mac.json ?? ocrOf('mac_vision', MAC_ROWS)) : new Response('nede', { status: mac.status }); }
  }
  if (u.host === 'generativelanguage.googleapis.com') {
    rec.body = init.body ? JSON.parse(init.body) : null;
    if (u.pathname.endsWith('/models')) return Response.json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(gem.json ?? GOOD()) }] } }] });
  }
  if (u.host === 'api.groq.com') return Response.json({ choices: [{ message: { content: JSON.stringify({ merchant: 'GROQ', total: 1, date: D, confidence: { merchant: 1, date: 1, total: 1 } }) } }] });
  throw new TypeError('fetch failed');
};
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const gate = await import('../server/ai-gate.js');
gate._gateTest.backoffMs = [5, 5];
const aiRun = await import('../server/ai-run.js');
const fdb = await import('../server/finans/db.js');
const ai = await import('../server/finans/ai.js');
const schema = await import('../server/receipts48/schema.js');
const norm = await import('../server/receipts48/normalize.js');
const val = await import('../server/receipts48/validate.js');
const chain = await import('../server/receipts48/chain.js');
const tess = await import('../server/receipts48/engines/tesseract.js');
const llmMod = await import('../server/receipts48/engines/llm.js');
const corr = await import('../server/receipts48/corrections.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : isForm ? body : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = as({ cookie: await login('kari', 'kariPassord123') });
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'sebastian', password: 'testpassord1', deviceName: 'iPhone' } })).body.token;
const T = as({ authorization: `Bearer ${tok}` });
await A('/finans/api/transactions');
await K('/finans/api/transactions');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]), Buffer.alloc(512, 7)]);
function form({ image = JPEG, deviceOcr, deviceParse, client = 'ios 1.48.0', imageType = 'image/jpeg', name = 'kvittering.jpg' } = {}) {
  const f = new FormData();
  if (image) f.append('image', new Blob([image], { type: imageType }), name);
  if (deviceOcr !== undefined) f.append('device_ocr', typeof deviceOcr === 'string' ? deviceOcr : JSON.stringify(deviceOcr));
  if (deviceParse !== undefined) f.append('device_parse', typeof deviceParse === 'string' ? deviceParse : JSON.stringify(deviceParse));
  if (client) f.append('client', client);
  return f;
}
const scan = (C, o) => C('/finans/api/receipts/scan', 'POST', form(o));
function setup({ macOcr = true, tesseract = true, gemini = true, deviceOcr = true, deviceParse = true, compareMac = true, finLocal = false, geminiKey = false } = {}) {
  chain._resetChain48(); ai._resetAi();
  llm.queue.length = 0; Object.assign(mac, { status: 200, json: null, fail: false }); gem.json = null;
  fdb.saveSettings({ macOcrUrl: 'http://mac.test:8765', receipts48: { macOcr, tesseract, gemini, deviceOcr, deviceParse, compareMac } }, 'owner');
  fdb.setSecret('macOcrKey', MAC_KEY);
  fdb.setSecret('geminiKey', geminiKey ? 'AIza-test-key-aaaaaaaaaaaaaaaaaaaa' : '');
  const r = aiRun.routing(); delete r.own; aiRun.saveServerRouting({ ...r, rules: { ...r.rules, finLocal } });
  tess._setTesseract48({ tools: async () => ({ tesseract: null }), run: async () => '' });
  calls.length = 0;
}
const hostCalls = (h, p = '') => calls.filter((c) => c.host === h && c.path.includes(p));
const steps = (b) => Object.fromEntries(b.pipeline.map((p) => [p.step, p.status]));
async function settled(C, id) {
  for (let i = 0; i < 300; i++) {
    const r = await C(`/finans/api/receipts/${id}`);
    if (r.status !== 200 || !['pending', 'processing'].includes(r.body.status)) return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('kvitteringen ble aldri ferdig');
}
const TSV = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t',
  ...DEV_ROWS.flatMap((row, li) => row.split(' ').map((w, wi) => `5\t1\t1\t1\t${li + 1}\t${wi + 1}\t${100 + wi * 120}\t${100 + li * 80}\t100\t40\t${90 - wi}\t${w}`))].join('\n');

/* ---------------- Schema ---------------- */

test('schema: felles OCR-format og kvitteringsformat (shared/schemas), feil med sti, modellens format krever alle felt', () => {
  assert.deepEqual(schema.checkOcr48(ocrOf('mac_vision', ['A 1,00'])), []);
  const bad = schema.checkOcr48({ source: 'ios-vision', lines: [{ text: 'x', bbox: [0, 0, 2, 0.1] }], rows: 'x', full_text: 3 });
  assert.ok(bad.some((e) => e.startsWith('source:')), bad.join('\n'));
  assert.ok(bad.some((e) => e.startsWith('lines[0].bbox[2]:')), 'bbox må være 0–1');
  assert.ok(bad.some((e) => e.startsWith('rows:')) && bad.some((e) => e.startsWith('full_text:')));
  assert.deepEqual(schema.checkReceipt48(GOOD()), []);
  const rb = schema.checkReceipt48({ merchant: 'X', date: '24.10.2026', total: '12', items: [{ description: 'a' }] });
  assert.ok(rb.includes('date: har feil format') && rb.includes('total: må være number') && rb.includes('items[0].amount: mangler'), rb.join('\n'));
  const f = schema.modelFormat48();
  assert.deepEqual(f.required.sort(), Object.keys(schema.RECEIPT_SCHEMA48.properties).sort());
  assert.deepEqual(f.properties.date.type, ['string', 'null']);
  assert.equal(JSON.stringify(f).includes('pattern'), false, 'Ollama-format uten pattern');
  assert.deepEqual(f.properties.items.items.required, ['description', 'quantity', 'unit_price', 'amount']);
});

/* ---------------- Normalisering ---------------- */

test('normalisering: norske beløp, rows på overlappende y-intervall (sortert på x, mellomrom), kilde-alias og formatoversetting', () => {
  const cases = { '24,90': 24.9, '24.90': 24.9, '1 299,00': 1299, 'kr 1.299,00': 1299, '-10,00': -10, '−10,00': -10, '10,00-': -10, '24,-': 24, 'NOK 99': 99, '1.299': 1299, '1,5': 1.5, abc: null, '': null };
  for (const [k, v] of Object.entries(cases)) assert.equal(norm.amount48(k), v, k);
  assert.equal(norm.amount48(12.345), 12.35);
  const rows = norm.rows48([{ text: '24,90', bbox: [0.7, 0.101, 0.2, 0.03] }, { text: 'MELK 1L', bbox: [0.05, 0.1, 0.3, 0.03] }, { text: 'BRØD', bbox: [0.05, 0.2, 0.2, 0.03] }, { text: '34,50', bbox: [0.7, 0.205, 0.2, 0.03] }, { text: 'uten boks' }]);
  assert.deepEqual(rows, ['MELK 1L 24,90', 'BRØD 34,50', 'uten boks']);
  const o = norm.normalizeOcr48({ source: 'android-mlkit', lines: [{ text: 'A', bbox: [0, 0, 0.1, 0.1] }, { text: '1,00', bbox: [0.5, 0, 0.1, 0.1] }] });
  assert.deepEqual([o.source, o.rows, o.full_text], ['android_mlkit', ['A 1,00'], 'A 1,00']);
  const leg = norm.toLegacy48({ ...GOOD(), discounts: [{ description: 'Rabatt', amount: -5 }] }, { confidence: 'high', bboxes: [[0.1, 0.2, 0.5, 0.05]] });
  assert.equal(leg.lines[0].unitPrice, null);
  assert.deepEqual(leg.lines[0].bbox, [10, 20, 50, 5], 'bbox i prosent i DB');
  assert.deepEqual(leg.discounts, [{ text: 'Rabatt', amount: 5 }]);
  assert.equal(leg.suggested_category, 'Mat og dagligvarer');
  assert.equal(leg.confidence.total, 0.95);
  const back = norm.fromLegacy48({ ...ai.validate(leg), pant: 3 });
  assert.equal(back.items.at(-1).description, 'Pant');
  assert.equal(back.discounts[0].amount, -5);
  assert.equal(back.category_suggestion, 'Mat og dagligvarer');
});

/* ---------------- Validering ---------------- */

test('validering: sum ±1 kr, total-regex (TOTAL/Å BETALE/SUM/BETALT), dato, org.nr mod11, mva-satser, kategori fra listen, confidence + failed_fields', () => {
  const cats = ['Mat og dagligvarer', 'Restaurant og kafé', 'Annet'];
  const text = DEV_ROWS.join('\n');
  const ok = val.validateReceipt48(GOOD(), { ocrText: text, categories: cats });
  assert.equal(ok.ok, true, ok.errors.join('\n'));
  assert.equal(ok.confidence, 'high');
  assert.deepEqual(ok.failed_fields, []);
  assert.equal(ok.checks.totalVerified, true);
  // Beløp som tekst normaliseres; rabatter blir negative.
  const t = val.validateReceipt48({ ...GOOD(), total: '66,40', items: [...GOOD().items, { description: 'OST', amount: '20,00' }], discounts: [{ description: 'Rabatt', amount: '10,00' }] }, { categories: cats });
  assert.equal(t.ok, true, t.errors.join('\n'));
  assert.equal(t.receipt.discounts[0].amount, -10);
  // Sum stemmer ikke → medium, feedback til nytt forsøk.
  const s = val.validateReceipt48(BAD_SUM(), { ocrText: text, categories: cats });
  assert.equal(s.confidence, 'medium');
  assert.deepEqual(s.failed_fields, ['items']);
  assert.match(s.feedback, /summerer 21,90.*totalen er 56,40/s);
  // Total som ikke står ved TOTAL → feilet total (alvorlig).
  const r = val.validateReceipt48(GOOD({ total: 65.4, items: [{ description: 'A', amount: 65.4 }], vat: [] }), { ocrText: text, categories: cats });
  assert.ok(r.failed_fields.includes('total'));
  assert.equal(r.confidence, 'low');
  assert.deepEqual(val.totalCandidates48('SUBTOTAL 50,00\nÅ BETALE kr 1 299,00\nBetalt 1.299,00\nSum 12,00'), [1299, 12]);
  // Dato: fremtid, for gammel, ugyldig, normalisert, fra OCR-teksten.
  assert.ok(val.validateReceipt48(GOOD({ date: addDays45(TODAY, 2) }), { categories: cats }).failed_fields.includes('date'));
  assert.ok(val.validateReceipt48(GOOD({ date: addDays45(TODAY, -800) }), { categories: cats }).failed_fields.includes('date'));
  assert.ok(val.validateReceipt48(GOOD({ date: '2026-02-30' }), { categories: cats }).failed_fields.includes('date'));
  assert.equal(val.validateReceipt48(GOOD({ date: DMY }), { categories: cats }).receipt.date, D);
  const fromOcr = val.validateReceipt48(GOOD({ date: null }), { ocrText: text, categories: cats });
  assert.equal(fromOcr.receipt.date, D);
  assert.ok(fromOcr.warnings.some((w) => /OCR-teksten/.test(w)));
  // Org.nr: mod11, ellers null (advarsel, ikke feil).
  const org = val.validateReceipt48(GOOD({ org_number: '911015839' }), { categories: cats });
  assert.equal(org.receipt.org_number, null);
  assert.equal(org.ok, true);
  assert.equal(val.validateReceipt48(GOOD({ org_number: 'NO 911 015 838 MVA' }), { categories: cats }).receipt.org_number, '911015838');
  // Mva: ukjent sats og for høyt beløp.
  assert.deepEqual(val.validateReceipt48(GOOD({ vat: [{ rate: 20, amount: 9 }] }), { categories: cats }).failed_fields, ['vat']);
  assert.deepEqual(val.validateReceipt48(GOOD({ vat: [{ rate: 15, amount: 20 }] }), { categories: cats }).failed_fields, ['vat']);
  assert.equal(val.validateReceipt48(GOOD({ vat: [{ rate: 25, amount: 5 }, { rate: 15, amount: 2 }] }), { categories: cats }).ok, true);
  // Kategori: fra listen (nærmeste navn), ellers tom – aldri fritekst.
  assert.equal(val.validateReceipt48(GOOD({ category_suggestion: 'mat' }), { categories: cats }).receipt.category_suggestion, 'Mat og dagligvarer');
  assert.equal(val.validateReceipt48(GOOD({ category_suggestion: 'Romfart' }), { categories: cats }).receipt.category_suggestion, '');
  // Mangler butikk og total → low.
  const low = val.validateReceipt48({ items: [] }, { categories: cats });
  assert.equal(low.confidence, 'low');
  assert.ok(['merchant', 'total', 'date', 'items'].every((k) => low.failed_fields.includes(k)));
});

test('Tesseract med tsv: ord → linjer med bbox 0–1 (origo øverst til venstre), konfidens 0–1, rows og image_size', () => {
  const o = tess.tsvToOcr48(TSV);
  assert.equal(o.source, 'tesseract');
  assert.deepEqual(o.image_size, [1000, 2000]);
  assert.equal(o.lines.length, DEV_ROWS.length);
  assert.equal(o.lines[3].text, 'MELK 1L 21,90');
  assert.deepEqual(o.lines[0].bbox, [0.1, 0.05, 0.22, 0.02]);
  assert.equal(o.lines[0].confidence, 0.895);
  assert.deepEqual(o.rows, DEV_ROWS);
  assert.deepEqual(schema.checkOcr48(o), []);
});

test('modellkallet: qwen3:8b via gaten med temperature 0, think false, num_ctx 16384, format = schema, tre norske eksempler og rows', () => {
  const m = llmMod.messages48(['A 1,00'], ['Mat og dagligvarer']);
  assert.equal(m.filter((x) => x.role === 'assistant').length, 3);
  assert.match(m[0].content, /Rabatter er egne poster i discounts med NEGATIVT beløp/);
  assert.match(JSON.stringify(m), /PANT/); assert.match(JSON.stringify(m), /TIPS/); assert.match(JSON.stringify(m), /DIESEL/);
  for (const f of llmMod.FEWSHOTS48) assert.equal(val.validateReceipt48(f.out, { ocrText: f.rows.join('\n'), today: '2026-10-24', categories: ['Mat og dagligvarer', 'Restaurant og kafé', 'Transport og lading'] }).ok, true, `eksemplet ${f.out.merchant} består selv kontrollen`);
  assert.match(m.at(-1).content, /Kategorier: Mat og dagligvarer\n\nRader:\nA 1,00/);
});

/* ---------------- Kjeden via HTTP ---------------- */

test('A: gyldig device_parse brukes uten modellkall; ugyldig device_parse går videre til B', async () => {
  setup();
  const r = await scan(T, { deviceParse: GOOD(), deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.used, 'A');
  assert.equal(r.body.label, 'iPhone');
  assert.equal(r.body.confidence, 'high');
  assert.deepEqual(steps(r.body), { A: 'ok', C: 'skipped' });
  assert.equal(hostCalls('ollama.test:11434', '/api/chat').length, 0, 'ingen modell for A');
  assert.equal(hostCalls('mac.test:8765').length, 0);
  assert.equal(r.body.receipt.items.length, 2);
  assert.ok(r.body.receipt_id);
  const done = await settled(T, r.body.receipt_id);
  assert.equal(done.body.status, 'needs_review');
  assert.equal(done.body.merchant, 'REMA 1000');
  assert.equal(done.body.total, 56.4);
  assert.equal(done.body.extraction.receipt48.used, 'A');
  assert.ok(done.body.log.some((l) => l.step === 'vei'), 'veien logges i scanLog');
  // Ugyldig device_parse (dato i fremtiden) → B.
  setup();
  const b = await scan(T, { deviceParse: GOOD({ date: addDays45(TODAY, 5) }), deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.equal(b.body.used, 'B', b.text);
  assert.equal(b.body.pipeline[0].status, 'failed');
  assert.deepEqual(b.body.pipeline[0].failed_fields, ['date']);
});

test('B: device_ocr + qwen3:8b (riktige modellvalg), Mac-OCR sammenligner totalen; ett nytt forsøk med feilbeskrivelse før C', async () => {
  setup();
  const r = await scan(T, { deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.used, 'B');
  assert.equal(r.body.model, 'qwen3:8b');
  assert.deepEqual(steps(r.body), { A: 'skipped', B: 'ok', C: 'compare' });
  assert.deepEqual(r.body.compare, { device: 56.4, mac: 56.4, agree: true, chosen: null });
  const chat = hostCalls('ollama.test:11434', '/api/chat').find((c) => /Rader:/.test(c.body.messages.at(-1).content));
  assert.equal(chat.body.model, 'qwen3:8b');
  assert.equal(chat.body.options.temperature, 0);
  assert.equal(chat.body.options.num_ctx, 16384);
  assert.equal(chat.body.think, false);
  assert.deepEqual(chat.body.format.required.sort(), Object.keys(schema.RECEIPT_SCHEMA48.properties).sort());
  assert.match(chat.body.messages.at(-1).content, /MELK 1L 21,90\nBRØD 34,50/);
  assert.ok(chat.body.messages.at(-1).content.includes('Mat og dagligvarer'), 'brukerens kategoriliste');
  // B feiler to ganger (sum) → C (Mac) med modellen.
  setup();
  llm.queue.push(JSON.stringify(BAD_SUM()), JSON.stringify(BAD_SUM()), JSON.stringify(GOOD()));
  const c = await scan(T, { deviceOcr: ocrOf('android_mlkit', DEV_ROWS), client: 'android/2.0' });
  assert.equal(c.body.used, 'C', c.text);
  assert.equal(c.body.label, 'Mac');
  assert.equal(c.body.pipeline.find((p) => p.step === 'B').attempts.length, 2);
  const rx = hostCalls('ollama.test:11434', '/api/chat').filter((x) => /Rader:/.test(x.body.messages.at(-1).content));
  assert.match(rx[1].body.messages.at(-1).content, /Kontrollen fant feil:[\s\S]*summerer 21,90/, 'nytt forsøk med feilbeskrivelse');
  assert.equal(hostCalls('mac.test:8765', '/ocr')[0].init.headers.authorization, `Bearer ${MAC_KEY}`);
  const mreq = hostCalls('mac.test:8765', '/ocr')[0].init;
  assert.ok(Buffer.isBuffer(mreq.body) && !mreq.headers['content-length'], 'Buffer-kropp → fetch setter Content-Length selv (tjenesten godtar ikke chunked; egen header avvises av undici 8)');
  assert.match(mreq.body.toString('latin1'), /name="image"; filename="kvittering\.jpg"\r\nContent-Type: image\/jpeg/);
});

test('sammenligning: device-OCR og Mac-OCR har ulik total → resultatet som består sumsjekken brukes, ellers usikker total', async () => {
  setup();
  const macRows = MAC_ROWS.map((r) => r.replace('TOTAL 56,40', 'TOTAL 65,40'));
  mac.json = ocrOf('mac_vision', macRows);
  const r = await scan(T, { deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.equal(r.body.used, 'B');
  assert.deepEqual(r.body.compare, { device: 56.4, mac: 65.4, agree: false, chosen: 'device' });
  assert.ok(!r.body.uncertain_fields.includes('total'), 'B består sumsjekken');
  // Begge feiler sumsjekken → usikker total.
  setup();
  mac.json = ocrOf('mac_vision', macRows);
  llm.queue.push(JSON.stringify(BAD_SUM()), JSON.stringify(BAD_SUM()), JSON.stringify(GOOD({ total: 65.4, items: [{ description: 'MELK 1L', amount: 21.9 }], vat: [] })), JSON.stringify(GOOD({ total: 65.4, items: [{ description: 'MELK 1L', amount: 21.9 }], vat: [] })));
  const u = await scan(T, { deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.equal(u.body.compare.agree, false);
  assert.ok(u.body.uncertain_fields.includes('total'), u.text);
  assert.notEqual(u.body.confidence, 'high');
});

test('C → Tesseract: Mac-OCR utilgjengelig (nettverk, 401, 503) → Tesseract (tsv) + modell; Mac hoppes over en stund etter feil', async () => {
  setup();
  mac.fail = true;
  tess._setTesseract48({ tools: async () => ({ tesseract: 'tesseract 5.3.0', magick: null }), run: async (cmd, args) => { assert.equal(cmd, 'tesseract'); assert.equal(args.at(-1), 'tsv'); return TSV; } });
  const r = await scan(T, {});
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.used, 'T');
  assert.equal(r.body.label, 'Glimt (Tesseract)');
  assert.deepEqual(steps(r.body), { A: 'skipped', B: 'skipped', C: 'unavailable', T: 'ok' });
  assert.match(r.body.pipeline.find((p) => p.step === 'C').error, /kan ikke nås/);
  assert.equal(r.body.ocr.source, 'tesseract');
  const n = hostCalls('mac.test:8765').length;
  const again = await scan(T, {});
  assert.equal(hostCalls('mac.test:8765').length, n, 'Mac-OCR hoppes over i to minutter etter feil');
  assert.match(again.body.pipeline.find((p) => p.step === 'C').reason, /utilgjengelig/);
  // Feil nøkkel → 401 → beskjed uten nøkkelen.
  setup();
  fdb.setSecret('macOcrKey', 'feil-nokkel');
  tess._setTesseract48({ tools: async () => ({ tesseract: 'tesseract 5.3.0' }), run: async () => TSV });
  const k = await scan(T, {});
  assert.match(k.body.pipeline.find((p) => p.step === 'C').error, /401: feil nøkkel/);
  assert.ok(!k.text.includes('feil-nokkel') && !k.text.includes(MAC_KEY), 'nøkkelen sendes aldri ut');
  assert.equal(k.body.used, 'T');
});

// Prompt 52: steg D (Gemini) er fjernet – også med nøkkel og uten sperre brukes beste lokale forsøk.
test('ingen steg D: Mac-OCR og Tesseract av → beste lokale forsøk med lav sikkerhet, aldri Gemini (prompt 52)', async () => {
  setup({ macOcr: false, tesseract: false, geminiKey: true });
  llm.queue.push(JSON.stringify(BAD_SUM()), JSON.stringify(BAD_SUM()));
  const n = await scan(T, { deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.equal(n.body.used, 'B', n.text);
  assert.equal(n.body.confidence, 'medium');
  assert.deepEqual(n.body.uncertain_fields, ['items']);
  assert.deepEqual(steps(n.body), { A: 'skipped', B: 'failed', C: 'skipped', T: 'skipped' });
  assert.equal(n.body.source_label, 'Lokal AI');
  assert.equal(hostCalls('generativelanguage.googleapis.com').length, 0);
});

test('sperren: «Finansdata forlater aldri huset» → Gemini (bilde og tekst) og Groq brukes aldri – ny kjede og gammel kjede', async () => {
  setup({ macOcr: false, tesseract: false, geminiKey: true, finLocal: true });
  fdb.setSecret('groqKey', 'gsk_test');
  llm.queue.push(JSON.stringify(BAD_SUM()), JSON.stringify(BAD_SUM()));
  const r = await scan(T, { deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.ok(!r.body.pipeline.some((p) => p.step === 'D'), 'prompt 52: ingen Gemini-steg');
  assert.equal(r.body.used, 'B');
  const h = await T('/finans/api/receipts/health');
  assert.equal(h.body.external.blocked, true);
  assert.equal(h.body.local_only, true);
  // Gammel kjede (bilde): provider=gemini med reserve → bare Ollama, ingen Gemini/Groq/Roboflow.
  fdb.saveSettings({ provider: 'gemini', fallback: true, aiTasks: {} }, 'owner');
  calls.length = 0; ai._resetAi();
  llm.fallback = '{}';
  await assert.rejects(() => ai.extract(JPEG, 'image/jpeg', ['Annet'], undefined));
  assert.equal(hostCalls('generativelanguage.googleapis.com').length, 0, 'bildesporet sjekker sperren');
  assert.equal(hostCalls('api.groq.com').length, 0);
  assert.ok(hostCalls('ollama.test:11434', '/api/chat').length >= 1, 'lokal modell');
  await assert.rejects(() => ai.extract(JPEG, 'image/jpeg', ['Annet'], 'gemini')); // prompt 52: «Les på nytt med Gemini» leses lokalt
  assert.equal(hostCalls('generativelanguage.googleapis.com').length, 0, '«Les på nytt med Gemini» går aldri til Gemini');
  // Gammel kjede (tekst): OCR-tekst/e-post.
  calls.length = 0;
  await assert.rejects(() => ai.extractText('REMA 1000\nTOTAL 56,40', ['Annet'], { kind: 'ocr' }));
  assert.equal(hostCalls('generativelanguage.googleapis.com').length + hostCalls('api.groq.com').length, 0);
  llm.fallback = null;
});

test('gammel kjede uten sperre: Gemini og Groq er ute av kvitteringskjeden – bare Ollama (prompt 52)', async () => {
  setup({ geminiKey: true });
  fdb.setSecret('groqKey', 'gsk_test');
  fdb.saveSettings({ provider: 'gemini', fallback: true, aiTasks: {} }, 'owner');
  ai._resetAi(); calls.length = 0;
  llm.fallback = '{}'; // Ollama svarer uten butikk og total → ugyldig → ingen sky-reserve
  await assert.rejects(() => ai.extract(JPEG, 'image/jpeg', ['Annet'], undefined));
  assert.ok(calls.some((c) => c.host === 'ollama.test:11434' && c.path === '/api/chat'), 'lokal modell');
  await assert.rejects(() => ai.extract(JPEG, 'image/jpeg', ['Annet'], 'groq'));
  await assert.rejects(() => ai.extract(JPEG, 'image/jpeg', ['Annet'], 'gemini'));
  assert.equal(hostCalls('generativelanguage.googleapis.com').length, 0, 'Gemini brukes ikke til kvitteringer');
  assert.equal(hostCalls('api.groq.com').length, 0, 'Groq brukes ikke til kvitteringer');
  assert.deepEqual(ai.receiptEngines48(['gemini', 'groq', 'ollama']).list, ['ollama']);
  llm.fallback = null;
  fdb.saveSettings({ provider: 'ollama', fallback: true }, 'owner');
  fdb.setSecret('groqKey', '');
});

test('av/på per steg: device-parse og device-OCR av hoppes over; modell utilgjengelig → hopper over modellstegene', async () => {
  setup({ deviceParse: false, deviceOcr: false });
  const r = await scan(T, { deviceParse: GOOD(), deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.equal(r.body.pipeline.find((p) => p.step === 'A').reason, 'slått av i innstillingene');
  assert.equal(r.body.pipeline.find((p) => p.step === 'B').reason, 'slått av i innstillingene');
  assert.equal(r.body.used, 'C');
  // Modellen svarer 400 → B feiler og C/T hopper over modellen (ingen nye ventetider).
  setup({ tesseract: false });
  llm.queue.push(null);
  const m = await scan(T, { deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  assert.equal(m.body.pipeline.find((p) => p.step === 'B').status, 'error');
  assert.match(m.body.pipeline.find((p) => p.step === 'C').reason, /lokal modell utilgjengelig/);
  assert.equal(m.body.used, null);
  assert.equal(m.body.receipt, null);
  assert.equal(m.body.confidence, 'low');
  const done = await settled(T, m.body.receipt_id);
  assert.equal(done.body.status, 'needs_review');
  assert.match(done.body.error, /Kunne ikke leses automatisk/);
});

test('inndata: bilde påkrevd, filtype sjekkes, ugyldig device_ocr/device_parse ignoreres med advarsel, tilgang som resten av Finans', async () => {
  setup();
  assert.equal((await A('/finans/api/receipts/scan', 'POST', form({ image: null }))).status, 400);
  assert.match((await A('/finans/api/receipts/scan', 'POST', form({ image: Buffer.from('hei'), imageType: 'text/plain', name: 'notat.txt' }))).body.error, /JPEG, PNG, WebP eller HEIC/);
  assert.equal((await req('/finans/api/receipts/scan', { method: 'POST', body: form() })).status, 401);
  const w = await scan(A, { deviceOcr: '{ikke json', deviceParse: '[1]', client: 'palm' });
  assert.equal(w.status, 201, w.text);
  assert.ok(w.body.warnings.some((x) => /device_ocr er ikke gyldig JSON/.test(x)));
  assert.ok(w.body.warnings.some((x) => /device_parse er ikke et gyldig JSON-objekt/.test(x)));
  assert.ok(w.body.warnings.some((x) => /client ble ikke forstått/.test(x)));
  const s = await scan(A, { deviceOcr: { source: 'mac_vision', lines: [], rows: ['x'], full_text: 'x' } });
  assert.ok(s.body.warnings.some((x) => /device_ocr.source må være/.test(x)));
  // Token med bare receipts:write.
  const mk = await A('/finans/api/tokens', 'POST', { name: 'Skanner', scopes: ['receipts:write'], expiry: '30d' });
  assert.equal(mk.status, 200, mk.text);
  const S = as({ authorization: `Bearer ${mk.body.token}` });
  assert.equal((await scan(S, {})).status, 201);
  assert.equal((await S('/finans/api/receipts/health')).status, 200);
  // Alias /api/receipts/scan og /api/receipts/health.
  const al = await req('/api/receipts/scan', { method: 'POST', headers: { authorization: `Bearer ${tok}` }, body: form({ deviceParse: GOOD() }) });
  assert.equal(al.status, 201, al.text);
  assert.equal(al.body.used, 'A');
  assert.equal((await req('/api/receipts/health', { headers: { authorization: `Bearer ${tok}` } })).status, 200);
  assert.equal((await req('/api/receipts/health')).status, 401);
  // Per bruker: Kari ser ikke Sebastians kvittering.
  assert.equal((await K(`/finans/api/receipts/${al.body.receipt_id}`)).status, 404);
});

test('health: Mac-OCR, modell, Tesseract, Gemini og sperren, kategorilisten; adresser bare for admin, nøkkelen aldri', async () => {
  setup({ geminiKey: true });
  tess._setTesseract48({ tools: async () => ({ tesseract: 'tesseract 5.3.0', magick: 'convert' }) });
  const h = await A('/finans/api/receipts/health');
  assert.equal(h.status, 200, h.text);
  assert.equal(h.body.macOcr.ok, true);
  assert.deepEqual(h.body.macOcr.languages, ['nb-NO', 'en-US']);
  assert.equal(h.body.macOcr.url, 'http://mac.test:8765');
  assert.equal(h.body.macOcr.keySet, true);
  assert.deepEqual([h.body.model.name, h.body.model.ok, h.body.model.installed], ['qwen3:8b', true, true]);
  assert.equal(h.body.gemini, undefined, 'prompt 52: ingen Gemini i kvitteringskjeden');
  assert.equal(h.body.local_only, true);
  assert.ok(h.body.categories.includes('Mat og dagligvarer'));
  assert.deepEqual(Object.keys(h.body.steps), ['deviceParse', 'deviceOcr', 'macOcr', 'tesseract']);
  assert.ok(!h.text.includes(MAC_KEY));
  const k = await K('/finans/api/receipts/health');
  assert.equal(k.body.macOcr.url, undefined, 'adressen vises ikke for vanlige brukere');
  assert.equal(k.body.model.url, undefined);
  mac.status = 200; mac.fail = true;
  const down = await A('/finans/api/receipts/health');
  assert.equal(down.body.macOcr.ok, false);
  assert.match(down.body.macOcr.error, /Kan ikke nås/);
  mac.fail = false;
  const mt = await A('/finans/api/receipts/mac-ocr/test', 'POST', {});
  assert.deepEqual([mt.body.ok, mt.body.version, mt.body.url], [true, '1.0.0', 'http://mac.test:8765']);
  assert.equal((await K('/finans/api/receipts/mac-ocr/test', 'POST', {})).status, 403);
  const sch = await T('/finans/api/receipts/schemas/ocr');
  assert.equal(sch.body.$id, 'receipt-ocr.schema.json');
});

test('innstillinger: macOcrUrl (standard 10.69.1.173:8765), macOcrKey kryptert og aldri ut, receipts48 av/på – bare admin', async () => {
  const st0 = (await A('/finans/api/settings')).body;
  assert.equal(st0.server.macOcrKeySet, true);
  assert.equal(st0.macOcrKey, undefined);
  assert.equal(st0.server.macOcrKey, undefined);
  const p = await A('/finans/api/settings', 'PUT', { macOcrUrl: 'http://10.69.1.173:8765/', macOcrKey: 'b'.repeat(64), receipts48: { gemini: false, textModel: 'qwen3:8b', macOcrTimeoutS: 999, tull: 1 } });
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.server.macOcrUrl, 'http://10.69.1.173:8765');
  assert.deepEqual(p.body.server.receipts48, { deviceOcr: true, deviceParse: true, macOcr: true, tesseract: true, compareMac: true, textModel: 'qwen3:8b', macOcrTimeoutS: 120, modelTimeoutS: 90 }); // prompt 52: gemini-steget er fjernet
  assert.equal(fdb.secret('macOcrKey'), 'b'.repeat(64));
  assert.ok(String(fdb.kv?.get?.('owner', 'fh_secret', {})?.macOcrKey ?? 'enc:').startsWith('enc:'), 'kryptert');
  assert.equal((await A('/finans/api/settings', 'PUT', { macOcrUrl: 'ftp://x' })).body.server.macOcrUrl, 'http://10.69.1.173:8765', 'ugyldig adresse beholder lagret');
  assert.ok(!JSON.stringify((await A('/finans/api/settings')).body).includes('b'.repeat(64)));
  assert.equal((await K('/finans/api/settings', 'PUT', { macOcrUrl: 'http://10.0.0.1:8765' })).status, 403);
  assert.equal((await K('/finans/api/settings', 'PUT', { macOcrKey: 'x' })).status, 403);
  assert.equal((await K('/finans/api/settings')).body.server.macOcrUrl, undefined, 'skjult for vanlige brukere');
  const { MAC_OCR_DEFAULT_URL } = await import('../server/receipts48/settings.js');
  assert.equal(MAC_OCR_DEFAULT_URL, 'http://10.69.1.173:8765');
  assert.equal(fdb.DEFAULT_SETTINGS.macOcrUrl, 'http://10.69.1.173:8765');
});

test('rettelser: modellsvar + rettelse lagres per bruker (eksplisitt og ved bokføring), admin-eksport som JSONL', async () => {
  setup();
  const r = await scan(A, { deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  const id = r.body.receipt_id;
  await settled(A, id);
  const c1 = await A(`/finans/api/receipts/${id}/corrections`, 'POST', { receipt: { ...GOOD(), merchant: 'REMA 1000 Grünerløkka', total: 56.4 } });
  assert.equal(c1.status, 201, c1.text);
  assert.deepEqual(c1.body.fields, ['merchant']);
  assert.equal((await A(`/finans/api/receipts/${id}/corrections`, 'POST', { receipt: GOOD() })).body.saved, false, 'ingen endring');
  assert.equal((await A(`/finans/api/receipts/${id}/corrections`, 'POST', { receipt: { merchant: 'X', date: 'i går', total: 1, items: [] } })).status, 400);
  assert.equal((await K(`/finans/api/receipts/${id}/corrections`, 'POST', { receipt: GOOD() })).status, 404, 'per bruker');
  // Bokføring med rettet total.
  assert.equal((await A(`/finans/api/receipts/${id}`, 'PATCH', { total: 60.4 })).status, 200);
  assert.equal((await A(`/finans/api/receipts/${id}/book`, 'POST', {})).status, 200);
  const list = (await A('/finans/api/receipts/corrections')).body.items;
  assert.equal(list.length, 2);
  assert.equal(list[0].kind, 'book');
  assert.ok(list[0].fields.includes('total'));
  assert.equal(list[0].modelAnswer.total, 56.4);
  assert.equal(list[0].corrected.total, 60.4);
  assert.equal(list[0].usedStep, 'B');
  assert.ok(list[0].ocr.rows.includes('MELK 1L 21,90'), 'OCR-radene følger med (eval)');
  assert.deepEqual((await K('/finans/api/receipts/corrections')).body.items, []);
  const ex = await A('/finans/api/receipts/corrections/export');
  assert.equal(ex.status, 200);
  assert.match(ex.headers.get('content-type'), /ndjson/);
  const rows = ex.text.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.length, 2);
  assert.match(rows[0].user, /^[0-9a-f]{12}$/);
  assert.equal((await K('/finans/api/receipts/corrections/export')).status, 403);
  assert.equal((await T('/finans/api/receipts/corrections/export')).status, 403, 'krever innlogget økt');
  assert.deepEqual(corr.changedFields48(GOOD(), { total: 56.4, merchant: 'rema 1000' }), []);
});

test('rettelser: bokføring med samme verdier som appens rettelse lagrer ikke dobbelt', async () => {
  setup();
  const r = await scan(A, { deviceOcr: ocrOf('ios_vision', DEV_ROWS) });
  const id = r.body.receipt_id;
  await settled(A, id);
  const fixed = { ...GOOD(), merchant: 'REMA 1000 Grünerløkka', total: 56.4 };
  assert.equal((await A(`/finans/api/receipts/${id}/corrections`, 'POST', { receipt: fixed })).status, 201);
  assert.equal((await A(`/finans/api/receipts/${id}`, 'PATCH', { merchant: fixed.merchant, total: 56.4 })).status, 200);
  assert.equal((await A(`/finans/api/receipts/${id}/book`, 'POST', {})).status, 200);
  const list = (await A('/finans/api/receipts/corrections')).body.items;
  assert.deepEqual(list.filter((x) => x.receiptId === id).map((x) => x.kind), ['edit']);
});
