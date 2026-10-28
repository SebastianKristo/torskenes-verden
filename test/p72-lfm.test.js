// Prompt 72 (LFM72): LFM3-VL-2B og LFM2.5-VL-3B som valgbare motorer i kvitteringskjeden (av som standard), og kvitterings-evalen.
// ai-run mockes (lfm72._setLfmRun72) der vi tester hva kjeden ber om; ett kall går hele veien gjennom ai-run → ai-gate → falsk Ollama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p72-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p72';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.p72:11434';
process.env.MAC_OCR_KEY = 'm'.repeat(64);
delete process.env.MOCK_DATA;
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MAC_OCR_URL', 'OPENWEBUI_URL', 'OPENWEBUI_KEY', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL', 'OMLX_URL', 'OMLX_API_KEY', 'OMLX_TASKS']) delete process.env[k];

// Falsk nett: Ollama på ollama.p72 (registrerer hver /api/chat), Mac-OCR på mac.p72, alt annet er «ute» og telles.
const seen = { chat: [], outside: [] };
let chatReply = () => '{}';
const enc = new TextEncoder();
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
async function fake(input, init = {}) {
  const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (u.host === 'ollama.p72:11434') {
    if (u.pathname === '/api/tags') return J({ models: [{ name: 'qwen3:8b', size: 5e9, details: {} }, { name: 'qwen2.5vl:7b', size: 6e9, details: { families: ['qwen25vl'] } }] });
    if (u.pathname === '/api/ps') return J({ models: [] });
    if (u.pathname === '/api/show') return J({ capabilities: ['completion', 'vision'] });
    if (u.pathname === '/api/chat') {
      const b = JSON.parse(init.body);
      seen.chat.push(b);
      const content = chatReply(b);
      return new Response(new ReadableStream({ start(c) {
        c.enqueue(enc.encode(`${JSON.stringify({ model: b.model, message: { role: 'assistant', content }, done: false })}\n`));
        c.enqueue(enc.encode(`${JSON.stringify({ model: b.model, message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 10, eval_count: 5, load_duration: 2e6 })}\n`));
        c.close();
      } }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    }
    return J({}, 404);
  }
  seen.outside.push(u.host);
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = fake;
test.after(() => { globalThis.fetch = realFetch; });

const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const ai = await import('../server/ai-run.js');
const gate = await import('../server/ai-gate.js');
const chain = await import('../server/receipts48/chain.js');
const tess = await import('../server/receipts48/engines/tesseract.js');
const mac = await import('../server/receipts48/engines/mac-vision.js');
const L = await import('../server/receipts48/lfm72.js');
const R = await import('../server/receipts48/settings.js');
const O51 = await import('../server/receipts48/ocr-raw51.js');
const G52 = await import('../server/receipts48/cloud-guard52.js');
const fdb = await import('../server/finans/db.js');
const opts = await import('../server/ollama-opts.js');
const omlx = await import('../server/omlx58/backend.js');
const E = await import('../eval/lib/receipts72.mjs');
ai._setAiFetch(fake);
gate._setGateFetch(fake);

const GOOD = { merchant: 'REMA 1000', org_number: null, date: '2026-10-20', time: '17:42', currency: 'NOK',
  items: [{ description: 'MELK 1L', quantity: null, unit_price: null, amount: 21.9 }, { description: 'BRØD', quantity: null, unit_price: null, amount: 34.5 }],
  discounts: [], subtotal: null, vat: [], total: 56.4, payment_method: 'BankAxept', category_suggestion: 'Mat og dagligvarer' };
const IMG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const LAYOUT = `<think>ser på bildet</think>image_index=0 page_header [300, 20, 700, 80] REMA 1000
image_index=0 text [300, 100, 700, 140]
20.10.2026 kl. 17:42
image_index=0 table [40, 200, 960, 600]
<otsl><fcel>MELK 1L<fcel>21,90<nl><fcel>BRØD<fcel>34,50<nl><fcel>TOTAL<fcel>56,40<nl></otsl>
image_index=0 page_footer [100, 900, 900, 950] Takk for handelen!`;
const OWN = 'owner';
const set48 = (r48) => { fdb.saveSettings({ ollamaUrl: 'http://ollama.p72:11434', macOcrUrl: 'http://mac.p72:8765', receipts48: r48 }, OWN); chain._resetChain48(); };
const NO_OCR = { macOcr: false, tesseract: false, deviceOcr: false, deviceParse: false, compareMac: false };
function lfmSpy(reply) {
  const calls = [];
  L._setLfmRun72(async (task, o) => { calls.push({ task, ...o }); const text = typeof reply === 'function' ? reply(o, calls.length) : reply; return { text, model: o.local72.id, timing: { loadMs: 5 } }; });
  return calls;
}
const reset = () => { L._setLfmRun72(null); L._setLfmText72(null); chain._setReceiptVision55(null); tess._setTesseract48(null); mac._setMacFetch48(null); };

/* ---------------- Standard er uendret ---------------- */

test('standard er uendret: qwen2.5vl i V, ingen ekstra totalkontroll, ingen L – og LFM kalles aldri', async () => {
  const cfg = R.r48Settings();
  assert.equal(cfg.visionEngine72, 'qwen25vl');
  assert.equal(cfg.crossCheck72, 'off');
  assert.equal(cfg.layoutStep72, false);
  assert.equal(cfg.lfmBackend72, 'ollama');
  assert.deepEqual(Object.keys(R.cleanReceipts48({})).filter((k) => k.endsWith('72')), [], 'lagres ikke før de settes');
  set48({ ...NO_OCR });
  const lfm = lfmSpy('{}');
  let qwen = 0;
  chain._setReceiptVision55(async () => { qwen++; return { data: GOOD, model: 'qwen2.5vl:7b' }; });
  try {
    const res = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: ['Mat og dagligvarer'] });
    assert.equal(res.used, 'V');
    assert.equal(qwen, 1);
    assert.equal(lfm.length, 0, 'LFM brukes ikke som standard');
    assert.ok(!res.pipeline.some((p) => p.step === 'L'));
    assert.equal(res.pipeline.find((p) => p.step === 'V').vision72, undefined);
  } finally { reset(); }
});

/* ---------------- Modell og think per motor ---------------- */

test('riktig modell og think:false per motor (Ollama og oMLX), anbefalte innstillinger', async () => {
  const calls = lfmSpy((o) => (o.schema ? JSON.stringify(GOOD) : LAYOUT));
  try {
    await L.lfm3Read72({ image: IMG, system: 'S', prompt: 'P', cfg: { lfmBackend72: 'ollama' } });
    await L.lfm25Layout72({ image: IMG, cfg: { lfmBackend72: 'ollama' } });
    await L.lfm3Read72({ image: IMG, system: 'S', prompt: 'P', cfg: { lfmBackend72: 'omlx' } });
    await L.lfm25Layout72({ image: IMG, cfg: { lfmBackend72: 'omlx', lfm25Model72: 'mlx-community/Eget-LFM' } });
    const [a, b, c, d] = calls;
    assert.equal(a.task, 'rc');
    assert.deepEqual(a.local72, { id: 'hf.co/LiquidAI/LFM3-VL-2B-GGUF', engine: 'ollama' });
    assert.equal(a.think, false); assert.equal(a.noThink, true); assert.equal(a.localOnly, true);
    assert.equal(a.temperature, 0.1);
    assert.deepEqual(a.extraOptions, { top_k: 50, repeat_penalty: 1.1 });
    assert.ok(a.schema?.properties?.items, 'samme schema som V (modelFormat48)');
    assert.equal(a.images.length, 1);
    assert.deepEqual(b.local72, { id: 'hf.co/LiquidAI/LFM2.5-VL-3B-GGUF', engine: 'ollama' });
    assert.equal(b.think, false); assert.equal(b.schema, undefined);
    assert.deepEqual(b.extraOptions, { repeat_penalty: 1.05 });
    assert.equal(b.prompt, L.LAYOUT_PROMPT72);
    assert.deepEqual(c.local72, { id: 'mlx-community/LFM3-VL-2B-4bit', engine: 'omlx' });
    assert.deepEqual(d.local72, { id: 'mlx-community/Eget-LFM', engine: 'omlx' }, 'eget modellnavn fra innstillingene');
  } finally { reset(); }
});

test('hele veien: ai-run → ai-gate → Ollama får modellen, think:false, top_k/repeat_penalty og bildet; <think> fjernes før JSON', async () => {
  seen.chat.length = 0;
  chatReply = () => `<think>Jeg leser {ikke dette}</think>${JSON.stringify(GOOD)}`;
  try {
    const r = await L.lfm3Read72({ image: IMG, system: 'S', prompt: 'P', cfg: { lfmBackend72: 'ollama' } });
    assert.equal(r.data.total, 56.4);
    const b = seen.chat.at(-1);
    assert.equal(b.model, 'hf.co/LiquidAI/LFM3-VL-2B-GGUF');
    assert.equal(b.think, false);
    assert.equal(b.options.temperature, 0.1);
    assert.equal(b.options.top_k, 50);
    assert.equal(b.options.repeat_penalty, 1.1);
    assert.ok(b.format?.properties?.total, 'schema som format');
    assert.equal(b.messages.at(-1).images.length, 1);
    assert.deepEqual(seen.outside, [], 'ingenting ut av huset');
  } finally { chatReply = () => '{}'; }
  // oMLX: LFM3 er en tenkemodell (THINKING_RE) → enable_thinking:false; LFM2.5 tenker ikke.
  assert.equal(opts.isThinkingModel('mlx-community/LFM3-VL-2B-4bit'), true);
  assert.equal(opts.isThinkingModel('hf.co/LiquidAI/LFM3-VL-2B-GGUF'), true);
  assert.equal(opts.isThinkingModel('hf.co/LiquidAI/LFM2.5-VL-3B-GGUF'), false);
  const { payload } = omlx.omlxBody58('chat', { model: 'mlx-community/LFM3-VL-2B-4bit', think: false, messages: [{ role: 'user', content: 'x' }], options: { temperature: 0.1, top_k: 50, repeat_penalty: 1.1 } }, { thinking: true });
  assert.deepEqual(payload.chat_template_kwargs, { enable_thinking: false });
  assert.equal(payload.repetition_penalty, 1.1);
  assert.equal('top_k' in payload, false);
});

test('<think> fjernes alltid før JSON leses (også uavsluttet og i ```-gjerder)', () => {
  assert.deepEqual(L.parseJson72('<think>{"total": 1}</think>{"total": 2}'), { total: 2 });
  assert.deepEqual(L.parseJson72('<think>tenker</think>\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(L.parseJson72('<|think|>x<|/think|>{"b":2}'), { b: 2 });
  assert.equal(L.stripThink72('svar <think>uavsluttet tenking'), 'svar');
  assert.throws(() => L.parseJson72('<think>{"a":1}</think>ikke json'), (e) => e.badJson === true);
});

/* ---------------- Layout-parseren ---------------- */

test('layout-parseren: image_index=… label [..] + innhold, tabeller som OTSL, rader i lesefølge', () => {
  const els = L.parseLayout72(LAYOUT);
  assert.deepEqual(els.map((e) => e.label), ['page_header', 'text', 'table', 'page_footer']);
  assert.deepEqual(els[0].bbox, [300, 20, 700, 80]);
  assert.equal(els[0].text, 'REMA 1000');
  assert.equal(els[1].text, '20.10.2026 kl. 17:42', 'innhold på linjene under overskriften');
  assert.deepEqual(els[2].table, [['MELK 1L', '21,90'], ['BRØD', '34,50'], ['TOTAL', '56,40']]);
  assert.deepEqual(L.layoutRows72(els), ['REMA 1000', '20.10.2026 kl. 17:42', 'MELK 1L 21,90', 'BRØD 34,50', 'TOTAL 56,40', 'Takk for handelen!']);
  // OTSL: tomme og sammenslåtte celler, kolonneoverskrift, <loc_>-tagger, uten image_index men kjent merkelapp.
  assert.deepEqual(L.parseOtsl72('<otsl><loc_1><ched>Vare<ched>Sum<nl><fcel>Pant<ecel><nl><fcel>Rabatt<lcel><nl><ecel><ecel><nl></otsl>'), [['Vare', 'Sum'], ['Pant', ''], ['Rabatt', '']]);
  const t2 = L.parseLayout72('table [0, 0, 1000, 1000] <otsl><fcel>A<fcel>1,00<nl></otsl>\nsnakk [1, 2, 3, 4] ikke et element');
  assert.equal(t2.length, 1);
  assert.deepEqual(t2[0].table, [['A', '1,00']]);
  // Koordinater klemmes til 0–1000 og ordnes.
  assert.deepEqual(L.parseLayout72('image_index=1 text [900, 1200, 100, -5] x')[0].bbox, [100, 0, 900, 1000]);
  // Steg L: OCR-linjene (bbox 0–1) legges i elementene og ordnes i rader; linjer utenfor havner etter høyden.
  const ocr = { lines: [
    { text: '34,50', bbox: [0.8, 0.39, 0.1, 0.03] }, { text: 'BRØD', bbox: [0.06, 0.4, 0.2, 0.03] },
    { text: 'MELK 1L', bbox: [0.06, 0.3, 0.2, 0.03] }, { text: '21,90', bbox: [0.8, 0.3, 0.1, 0.03] },
    { text: 'REMA 1000', bbox: [0.35, 0.03, 0.3, 0.04] }, { text: 'Org.nr 912 345 678', bbox: [0.3, 0.16, 0.4, 0.03] } ] };
  assert.deepEqual(L.orderOcrByLayout72(ocr, els), ['REMA 1000', 'Org.nr 912 345 678', 'MELK 1L 21,90', 'BRØD 34,50']);
  assert.equal(L.orderOcrByLayout72({ lines: [{ text: 'x' }] }, els), null, 'uten koordinater');
});

/* ---------------- V og crossCheck bruker valgt motor ---------------- */

test('V bruker valgt motor: lfm3vl (samme schema/validering) og lfm25layout (layout én gang → qwen3:8b)', async () => {
  set48({ ...NO_OCR, visionEngine72: 'lfm3vl' });
  let calls = lfmSpy(JSON.stringify(GOOD));
  let qwen = 0;
  chain._setReceiptVision55(async () => { qwen++; return { data: GOOD, model: 'qwen2.5vl:7b' }; });
  try {
    const res = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: ['Mat og dagligvarer'] });
    assert.equal(qwen, 0, 'qwen2.5vl brukes ikke');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].local72.id, 'hf.co/LiquidAI/LFM3-VL-2B-GGUF');
    assert.match(calls[0].prompt, /Kategorier: Mat og dagligvarer/);
    assert.equal(res.used, 'V');
    assert.equal(res.model, 'hf.co/LiquidAI/LFM3-VL-2B-GGUF');
    assert.equal(res.label, 'visjonsmodell (ingen OCR)');
    assert.notEqual(res.confidence, 'high', 'aldri høy uten OCR');
    assert.equal(res.pipeline.find((p) => p.step === 'V').vision72, 'lfm3vl');
    // Samme validering: feil total består ikke, og får ett nytt forsøk med tilbakemelding.
    calls = lfmSpy(JSON.stringify({ ...GOOD, total: 99 }));
    const bad = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: [] });
    assert.equal(calls.length, 2);
    assert.match(calls[1].prompt, /summerer/);
    assert.equal(bad.passed, false);

    set48({ ...NO_OCR, visionEngine72: 'lfm25layout' });
    calls = lfmSpy(LAYOUT);
    const texts = [];
    L._setLfmText72(async (rows, o) => { texts.push({ rows, o }); return { data: texts.length === 1 ? { ...GOOD, total: 99 } : GOOD, model: o.model }; });
    const r2 = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: [] });
    assert.equal(calls.length, 1, 'layouten leses én gang, også når tekststeget prøver igjen');
    assert.equal(texts.length, 2);
    assert.equal(texts[0].o.model, 'qwen3:8b');
    assert.ok(texts[0].rows.includes('MELK 1L 21,90'));
    assert.match(texts[1].o.feedback ?? '', /summerer/);
    assert.equal(r2.used, 'V');
    assert.equal(r2.model, 'hf.co/LiquidAI/LFM2.5-VL-3B-GGUF + qwen3:8b');
  } finally { reset(); }
});

test('steg L (valgfritt): LFM2.5-layouten ordner Mac-OCR-linjene før qwen3:8b; av → C som før', async () => {
  const lines = [{ text: 'REMA 1000', bbox: [0.35, 0.03, 0.3, 0.04] }, { text: 'MELK 1L', bbox: [0.06, 0.3, 0.2, 0.03] }, { text: '21,90', bbox: [0.8, 0.3, 0.1, 0.03] },
    { text: 'BRØD', bbox: [0.06, 0.4, 0.2, 0.03] }, { text: '34,50', bbox: [0.8, 0.39, 0.1, 0.03] }, { text: 'TOTAL 56,40', bbox: [0.06, 0.5, 0.8, 0.03] }, { text: '20.10.2026 17:42', bbox: [0.3, 0.12, 0.4, 0.03] }];
  mac._setMacFetch48(async (url) => (String(url).endsWith('/health') ? J({ ok: true, version: 't' }) : J({ source: 'mac_vision', lines, image_size: [1000, 2000] })));
  chatReply = () => JSON.stringify(GOOD);
  set48({ ...NO_OCR, macOcr: true, layoutStep72: true });
  const calls = lfmSpy(LAYOUT);
  try {
    seen.chat.length = 0;
    const res = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: [] });
    assert.equal(calls.length, 1);
    assert.equal(res.used, 'L');
    assert.equal(res.label, 'Mac + layout');
    const L1 = res.pipeline.find((p) => p.step === 'L');
    assert.equal(L1.status, 'ok');
    assert.ok(!res.pipeline.some((p) => p.step === 'C'), 'C trengs ikke når L besto');
    assert.equal(seen.chat.at(-1).model, 'qwen3:8b');
    assert.match(seen.chat.at(-1).messages.at(-1).content, /MELK 1L 21,90\nBRØD 34,50\nTOTAL 56,40/);
    // Av (standard): ingen layout, C som før.
    set48({ ...NO_OCR, macOcr: true });
    const before = calls.length;
    const res2 = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: [] });
    assert.equal(calls.length, before);
    assert.equal(res2.used, 'C');
  } finally { reset(); chatReply = () => '{}'; }
});

test('crossCheck51 bruker valgt motor: LFM3 leser totalen, avvik → til gjennomgang; av → ingen LFM-kall', async () => {
  set48({ ...NO_OCR, crossCheck72: 'lfm3vl' });
  const calls = lfmSpy((o) => (o.schema?.properties?.total && Object.keys(o.schema.properties).length === 1 ? '<think>…</think>{"total": 56.4}' : '{}'));
  try {
    const ok = { provider: 'ollama', data: { total: 56.4, merchant: 'REMA 1000', confidence: { total: 0.9 } } };
    await O51.crossCheck51(ok, { original: { buf: IMG, mime: 'image/jpeg' } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].local72.id, 'hf.co/LiquidAI/LFM3-VL-2B-GGUF');
    assert.equal(calls[0].think, false);
    assert.deepEqual(ok.data.ocr51.lfm72, { engine: 'lfm3vl', model: 'hf.co/LiquidAI/LFM3-VL-2B-GGUF', agree: true, total: 56.4 });
    const bad = { provider: 'ollama', data: { total: 66.4, merchant: 'REMA 1000', confidence: { total: 0.9 } } };
    await O51.crossCheck51(bad, { original: { buf: IMG, mime: 'image/jpeg' } });
    assert.equal(bad.data.ocr51.lfm72.agree, false);
    assert.equal(bad.data.needs_review, true);
    assert.ok(bad.data.confidence.total <= 0.4);
    set48({ ...NO_OCR });
    const n = calls.length;
    await O51.crossCheck51({ provider: 'ollama', data: { total: 56.4 } }, { original: { buf: IMG, mime: 'image/jpeg' } });
    assert.equal(calls.length, n, 'av som standard');
  } finally { reset(); }
});

/* ---------------- Sperren ---------------- */

test('sperren holder: sky-modeller avvises i innstillingene, stoppes av cloud-guard52 og av ai-run; «Finansdata forlater aldri huset» uendret', async () => {
  const c = R.cleanReceipts48({ lfm3Model72: 'gemini-2.5-flash', lfm25Model72: 'gpt-oss:120b-cloud', visionEngine72: 'gemini', crossCheck72: 'tull', lfmBackend72: 'openai' });
  assert.equal(c.lfm3Model72, undefined);
  assert.equal(c.lfm25Model72, undefined);
  assert.equal(c.visionEngine72, undefined);
  assert.equal(R.cleanReceipts48({ lfm3Model72: 'hf.co/LiquidAI/LFM3-VL-2B-GGUF:Q8_0' }).lfm3Model72, 'hf.co/LiquidAI/LFM3-VL-2B-GGUF:Q8_0');
  G52._resetCloudGuard52();
  const calls = lfmSpy('{}');
  try {
    await assert.rejects(L.lfm3Read72({ image: IMG, system: 'S', prompt: 'P', cfg: { lfm3Model72: 'gemini-2.5-flash' } }), (e) => e.blocked === true && e.cloud52 === true);
    await assert.rejects(L.lfm25Layout72({ image: IMG, cfg: { lfm25Model72: 'qwen3:480b-cloud' } }), (e) => e.blocked === true);
    assert.equal(calls.length, 0, 'ingenting ble sendt');
    assert.equal(G52.cloudReceiptWarnings52().length, 2);
  } finally { reset(); }
  assert.throws(() => ai.forcedLocal72('rc', { id: 'gemini-2.5-flash' }), (e) => e.blocked === true);
  assert.throws(() => ai.forcedLocal72('rc', { id: 'meta-llama/llama-4-scout-17b-16e-instruct' }), (e) => e.blocked === true);
  assert.equal(ai.forcedLocal72('rc', { id: 'mlx-community/LFM3-VL-2B-4bit', engine: 'omlx' }).list[0].engine, 'omlx');
  // Med sperren på går LFM fortsatt bare til Ollama i huset.
  const r = JSON.parse(JSON.stringify(ai.routing(OWN))); delete r.own; r.rules = { ...r.rules, finLocal: true }; ai.saveServerRouting(r);
  assert.equal(R.externalBlocked48().blocked, true);
  seen.outside.length = 0;
  chatReply = () => '{"total": 1}';
  try { await L.lfmTotal72('lfm3vl', { image: IMG, cfg: {} }); } finally { chatReply = () => '{}'; }
  assert.deepEqual(seen.outside, []);
});

/* ---------------- Innstillingene er bare for admin ---------------- */

test('innstillingene er bare for admin (serverinfrastruktur); helsesvaret viser valget', async () => {
  const login = async (username, password) => { const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; };
  const call = (cookie) => async (path, method = 'GET', body) => { const r = await app.request(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ } return { status: r.status, body: j }; };
  const A = call(await login('sebastian', 'testpassord1'));
  assert.equal((await A('/api/users', 'POST', { username: 'kari72', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
  const K = call(await login('kari72', 'kariPassord123'));
  set48({ ...NO_OCR, macOcr: true, tesseract: true });
  const no = await K('/finans/api/settings', 'PUT', { receipts48: { visionEngine72: 'lfm3vl' } });
  assert.equal(no.status, 403);
  assert.equal(R.r48Settings().visionEngine72, 'qwen25vl');
  const yes = await A('/finans/api/settings', 'PUT', { receipts48: { visionEngine72: 'lfm3vl', layoutStep72: true, lfmBackend72: 'omlx', lfm3Model72: 'mlx-community/LFM3-VL-2B-8bit' } });
  assert.equal(yes.status, 200);
  assert.equal(yes.body.server.receipts48.visionEngine72, 'lfm3vl');
  const cfg = R.r48Settings();
  assert.equal(cfg.visionEngine72, 'lfm3vl'); assert.equal(cfg.layoutStep72, true); assert.equal(cfg.lfmBackend72, 'omlx');
  assert.equal(cfg.macOcr, true, 'de andre stegene er urørt');
  assert.equal(cfg.tesseract, true);
  const h = await A('/finans/api/receipts/health');
  assert.equal(h.body.lfm72.visionEngine, 'lfm3vl');
  assert.equal(h.body.lfm72.models.lfm3.name, 'mlx-community/LFM3-VL-2B-8bit');
  assert.equal(h.body.lfm72.models.lfm25.name, 'mlx-community/LFM2.5-VL-3B-4bit');
  assert.equal(h.body.lfm72.active, true);
  assert.equal(h.body.model.names, undefined, 'modellisten fra Ollama sendes ikke ut');
  // Tilbake til standard.
  assert.equal((await A('/finans/api/settings', 'PUT', { receipts48: { visionEngine72: 'qwen25vl', layoutStep72: false, lfmBackend72: 'ollama', lfm3Model72: '' } })).status, 200);
  assert.equal(R.r48Settings().lfm3Model72, '');
});

/* ---------------- Evalen ---------------- */

test('evalens poengberegning: total, dato, butikk (normalisert) og varelinjer (navn omtrent, beløp eksakt)', () => {
  const f = E.fasit72({ butikk: 'REMA 1000', avdeling: 'REMA 1000 Grünerløkka', dato: '2026-10-22', total: 333.58,
    linjer: [{ navn: 'TINE Lettmelk 1L', belop: 22.9 }, { navn: 'Kneippbrød', belop: 34.9 }, { navn: 'Bærepose', belop: 2 }] });
  assert.equal(f.items.length, 3);
  const s = E.score72({ merchant: 'Rema 1000 Grunerlokka', date: '2026-10-22', total: 333.58,
    items: [{ description: 'TINE LETTMELK 1 L', amount: 22.9 }, { description: 'KNEIPPBROD', amount: 34.0 }, { description: 'BAEREPOSE', amount: 2 }, { description: 'EKSTRA', amount: 9 }] }, f, { passed: false });
  assert.equal(s.total, true); assert.equal(s.date, true); assert.equal(s.merchant, true); assert.equal(s.passed, false);
  assert.deepEqual({ tp: s.items.tp, pred: s.items.pred, want: s.items.want }, { tp: 2, pred: 4, want: 3 }, 'feil beløp teller ikke');
  assert.equal(s.items.precision, 0.5);
  assert.ok(Math.abs(s.items.recall - 2 / 3) < 1e-9);
  const s2 = E.score72({ merchant: 'KIWI', date: '2026-10-23', total: 333.5, items: [] }, f);
  assert.deepEqual([s2.total, s2.date, s2.merchant, s2.items.recall, s2.passed], [false, false, false, 0, null]);
  assert.equal(E.score72(null, f).total, false);
  assert.equal(E.merchantOk72('Coop Extra Danmarksplass', E.fasit72({ butikk: 'Coop Extra' })), true);
  assert.equal(E.merchantOk72('', E.fasit72({ butikk: 'Coop Extra' })), false);
  assert.equal(E.nameOk72('Bananer', 'BANANER ØKO'), true);
  assert.equal(E.nameOk72('Grandiosa', 'Bærepose'), false);
  // Kvitteringsformatet som fasit.
  assert.equal(E.fasit72({ merchant: 'X', date: '2026-01-01', total: '12,50', items: [{ description: 'A', amount: 12.5 }] }).total, 12.5);
  // Miljøfeil (ikke modellfeil) og oppsummering.
  assert.equal(E.envKind72('Mac-OCR-nøkkelen er ikke satt'), 'Mac-OCR utilgjengelig');
  assert.equal(E.envKind72('Glimt fikk ikke svar fra hf.co/x: Ollama svarte 404: model "x" not found'), 'modell ikke hentet');
  assert.equal(E.envKind72('Ollama kan ikke nås (ECONNREFUSED)'), 'motor kan ikke nås');
  assert.equal(E.envKind72('Totalen summerer ikke'), null);
  const sum = E.summarize72([
    { combo: 'V-lfm3', receipt: 'a', run: 1, total: true, date: true, merchant: true, passed: true, items: { tp: 2, pred: 2, want: 3 }, ms: 1000, loadMs: 500 },
    { combo: 'V-lfm3', receipt: 'b', run: 1, total: false, date: true, merchant: false, passed: false, items: { tp: 1, pred: 2, want: 2 }, ms: 3000, loadMs: 0 },
    { combo: 'V-lfm3', receipt: 'c', run: 1, env: 'modell ikke hentet' }]);
  const v = sum['V-lfm3'];
  assert.deepEqual([v.runs, v.measured, v.env], [3, 2, 1]);
  assert.deepEqual(v.total, { ok: 1, n: 2 });
  assert.equal(v.items.precision, 0.75);
  assert.equal(v.items.recall, 0.6);
  assert.equal(v.p50Ms, 1000); assert.equal(v.p90Ms, 3000);
  assert.deepEqual(v.envKinds, ['modell ikke hentet']);
});

test('rapporten har ikke kvitteringstekst (hviteliste per kjøring, og --dry-kjøringen av evalen)', () => {
  const run = E.slimRun72({ receipt: E.fileHash72('rema-grunerlokka.jpg'), combo: 'C', run: 1, total: true, date: true, merchant: true, passed: true,
    items: { tp: 1, pred: 1, want: 1, precision: 1, recall: 1, matched: ['TINE Lettmelk'] }, failedFields: ['total', 'Totalen 333,58 finnes ikke'], ms: 10,
    receiptText: 'REMA 1000 TOTAL 333,58', merchantName: 'REMA 1000', error: 'Totalen 333,58 finnes ikke i OCR-teksten' });
  const s = JSON.stringify(run) + E.report72({ meta: { date: '2026-10-28' }, summary: E.summarize72([run]), runs: [run] });
  for (const bad of ['REMA', 'rema', '333', 'TINE', 'grunerlokka']) assert.ok(!s.includes(bad), `«${bad}» lekket`);
  assert.match(run.receipt, /^[0-9a-f]{10}$/);
  // Hele evalen i --dry (falsk Ollama og Mac-OCR) mot de syntetiske kvitteringene.
  const out = mkdtempSync(join(tmpdir(), 'hl-p72-eval-'));
  const p = spawnSync(process.execPath, ['eval/receipts72.mjs', '--dry', '--quiet', '--out', out], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8', timeout: 120_000, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  assert.equal(p.status, 0, p.stderr || p.stdout);
  const files = readdirSync(out);
  const md = readFileSync(join(out, files.find((f) => f.endsWith('.md'))), 'utf8'), js = readFileSync(join(out, files.find((f) => f.endsWith('.json'))), 'utf8');
  const j = JSON.parse(js);
  assert.deepEqual(Object.keys(j.summary), E.COMBO_IDS72, 'alle kombinasjonene');
  assert.ok(Object.values(j.summary).every((x) => x.measured === 4 && x.env === 0), JSON.stringify(j.summary));
  assert.equal(j.runs.find((r) => r.combo === 'CL').used, 'L');
  assert.ok(md.includes('| V · LFM3-VL-2B (ingen OCR) |'));
  for (const fx of readdirSync(join(import.meta.dirname, '..', 'eval', 'fixtures', 'receipts72')).filter((f) => f.endsWith('.json'))) {
    const fj = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'eval', 'fixtures', 'receipts72', fx), 'utf8'));
    const needles = [fj.butikk, fj.avdeling, fj.adresse, fj.dato, fx.replace('.json', ''), String(fj.total).replace('.', ','), fj.total.toFixed(2), ...fj.linjer.map((l) => l.navn)];
    for (const n of needles) { assert.ok(!md.includes(n), `rapporten har «${n}»`); assert.ok(!js.includes(n), `JSON-fila har «${n}»`); }
  }
});
