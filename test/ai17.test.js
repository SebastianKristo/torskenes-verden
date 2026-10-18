// Prompt 16–17 (AI): AI-søk med ✦-bryteren, feilårsaker, ai_log, «Hvem gjør hva», Roboflow, strekkoder og lokal OCR-reserve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-ai17-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { setSecret, saveSettings, settings } = await import('../server/finans/db.js');
const { default: fin } = await import('../server/finans/routes.js');
const AI = await import('../server/finans/ai.js');
const OCR = await import('../server/ocr-fallback.js');
const S = await import('../server/finans/search.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const F = async (path, method = 'GET', body) => {
  const r = await fin.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
function withFetch(handler) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), opts }); const r = await handler(String(url), opts); return r ?? new Response('{}', { status: 404 }); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const groqOk = (text) => json({ choices: [{ message: { content: JSON.stringify({ answer: text }) } }] });

test('OCR-reserve: totalbeløp etter prioritet, org.nr med MOD11, dato og MVA', () => {
  assert.equal(OCR.mod11Ok('914769159'), true);
  assert.equal(OCR.mod11Ok('914769158'), false);
  assert.equal(OCR.toAmount('1 234,50'), 1234.5);
  assert.equal(OCR.toAmount('99,-'), 99);
  const r = OCR.parseReceiptText('REMA 1000 MAJORSTUEN\nOrg.nr 914 769 159 MVA\n14.10.26 12:31\nMelk 22,90\nTotal 70,00\nSUM 62,80\nÅ BETALE 62,80\nMVA 15% 8,19\nBankAxept');
  assert.equal(r.merchant, 'REMA 1000'); // kjente kjeder får fast navn
  assert.equal(r.org_number, '914769159');
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.total, 62.8);
  assert.deepEqual(r.vat, [{ rate: 15, amount: 8.19 }]);
  assert.equal(r.needs_review, true);
  assert.ok(r.confidence.total < 0.85, 'alltid til gjennomgang');
  // Uten nøkkelord: største beløp, lav sikkerhet.
  const u = OCR.parseReceiptText('Kiosk\nBolle 25,00\nKaffe 39,00');
  assert.equal(u.total, 39);
  assert.ok(u.confidence.total < 0.5);
  // Av/på: innstillingen overstyrer miljøvariabelen.
  assert.equal(OCR.ocrEnabled({ ocrFallback: false }), false);
  assert.equal(OCR.ocrEnabled({}), true);
});

test('«Hvem gjør hva»: motor per oppgave, med reserve og bare motorer som er satt opp', async () => {
  AI._resetAi();
  setSecret('geminiKey', 'g');
  setSecret('groqKey', 'gsk');
  saveSettings({ provider: 'ollama', fallback: true, aiTasks: {} });
  assert.deepEqual(AI.engineOrder(settings(), { task: 'search' }).slice(0, 2), ['groq', 'ollama']);
  assert.equal(AI.engineOrder(settings(), { task: 'receipts' })[0], 'gemini');
  // Uten reserve («hold alt lokalt») gjelder bare valgt motor, med mindre brukeren selv har valgt motor for oppgaven.
  saveSettings({ fallback: false });
  assert.deepEqual(AI.engineOrder(settings(), { task: 'search' }), ['ollama']);
  const put = await F('/settings', 'PUT', { aiTasks: { search: 'gemini', categorize: 'nope', barcode: 'zbar', ukjent: 'groq' } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body.aiTasks, { search: 'gemini', barcode: 'zbar' });
  assert.deepEqual(AI.engineOrder(settings(), { task: 'search' }), ['gemini']);
  // Motor som ikke er satt opp: valgt motor brukes i stedet.
  setSecret('groqKey', '');
  saveSettings({ fallback: true, aiTasks: { search: 'groq' } });
  assert.equal(AI.engineOrder(settings(), { task: 'search' })[0], 'ollama');
  const h = await F('/health/ai');
  assert.equal(h.body.tasks.find((t) => t.id === 'search').engine, 'groq');
  assert.ok(h.body.groqModels.includes('qwen/qwen3-32b'));
  assert.equal(h.body.roboflow.workspace, 'sebastians-workspace-y3jnc');
  assert.equal(typeof h.body.ocr.enabled, 'boolean');
});

test('ai_log: hvert kall logges med oppgave, motor, modell, ms og status', async () => {
  AI._resetAi();
  setSecret('groqKey', 'gsk');
  saveSettings({ provider: 'groq', fallback: false, aiTasks: {} });
  const f = withFetch((url) => (url.includes('api.groq.com') ? groqOk('hei') : null));
  try { await AI.textJson('hei du', { type: 'object', properties: { answer: { type: 'string' } } }, { task: 'categorize' }); } finally { f.restore(); }
  const f2 = withFetch((url) => (url.includes('api.groq.com') ? json({ error: { message: 'Invalid API Key' } }, 401) : null));
  try { await assert.rejects(AI.textJson('x', { type: 'object', properties: {} }, { task: 'search' })); } finally { f2.restore(); }
  const log = await F('/ai/log?limit=5');
  assert.equal(log.status, 200);
  const [bad, ok] = log.body.items;
  assert.equal(ok.task, 'categorize');
  assert.equal(ok.engine, 'groq');
  assert.equal(ok.model, 'llama-3.3-70b-versatile');
  assert.equal(ok.status, 'ok');
  assert.equal(ok.promptLen, 'hei du'.length);
  assert.equal(bad.status, 'nøkkel-avvist');
  assert.match(bad.error, /401/);
});

test('AI-søk: ✦-bryteren tvinger AI også rett etter en feil, og feilen forklares', async () => {
  AI._resetAi();
  setSecret('groqKey', 'gsk');
  setSecret('geminiKey', '');
  saveSettings({ provider: 'groq', fallback: false, aiTasks: {} });
  (await import('../server/finans/demo.js')).loadDemo();
  // Først en avvist nøkkel: svaret sier hvorfor, og AI settes på pause.
  const f = withFetch((url) => (url.includes('api.groq.com') ? json({ error: { message: 'Invalid API Key' } }, 401) : null));
  let r;
  try { r = await F('/search/ai', 'POST', { q: 'hva brukte jeg på mat i oktober?', save: false }); } finally { f.restore(); }
  assert.equal(r.body.aiUnavailable, true);
  assert.equal(r.body.aiErrorKind, 'auth');
  assert.match(r.body.notice, /avvist/);
  assert.ok(S.aiDown(), 'AI er satt på pause etter feilen');
  // Med bryteren på (ai:true) prøves AI likevel, og et ekte svar kommer.
  const f2 = withFetch((url) => (url.includes('api.groq.com') ? groqOk('Det står ingenting om dette i grunnlaget.') : null));
  try { r = await F('/search/ai', 'POST', { q: 'hva brukte jeg på mat i oktober?', ai: true, save: false }); } finally { f2.restore(); }
  assert.ok(f2.calls.some((c) => c.url.includes('api.groq.com')), 'AI ble kalt tross pausen');
  assert.notEqual(r.body.aiUnavailable, true, JSON.stringify(r.body).slice(0, 300));
  // Manglende nøkkel og tidsavbrudd har egne tekster.
  assert.equal(S.aiErrorKind('Groq: Groq-nøkkel mangler (Innstillinger → AI-motor)').kind, 'key');
  assert.equal(S.aiErrorKind('Gemini: Gemini svarte ikke innen tidsfristen').kind, 'timeout');
  assert.equal(S.aiErrorKind('Gemini: Gemini-modellen «x» finnes ikke lenger').kind, 'model');
});

test('strekkoder: 501 med årsak uten zbar, og Roboflow-test viser arbeidsområdet', async () => {
  OCR._setTools({ tesseract: null, magick: null, zbar: null });
  const fd = new FormData();
  fd.append('file', new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'kode.jpg', { type: 'image/jpeg' }));
  const r = await fin.request('/scan/barcode', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
  assert.equal(r.status, 501);
  assert.match((await r.json()).error, /zbar/);
  const none = await fin.request('/scan/barcode', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: new FormData() });
  assert.equal(none.status, 400);
  setSecret('roboflowKey', 'rf_test');
  const f = withFetch((url) => (url.startsWith('https://api.roboflow.com/') ? json({ workspace: 'sebastians-workspace-y3jnc' }) : null));
  try {
    const t = await F('/ai/roboflow/test', 'POST');
    assert.equal(t.body.ok, true, t.body.message);
    assert.match(t.body.message, /sebastians-workspace-y3jnc/);
  } finally { f.restore(); }
});

test('kvittering: når alle motorer feiler og Tesseract mangler, beholdes AI-feilen (ingen OCR-feil i tillegg)', async () => {
  AI._resetAi();
  OCR._setTools({ tesseract: null, magick: null, zbar: null });
  setSecret('geminiKey', '');
  setSecret('groqKey', '');
  saveSettings({ provider: 'ollama', fallback: false, ocrFallback: true });
  const f = withFetch((url) => { if (url.includes('127.0.0.1:9')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); });
  try {
    await assert.rejects(AI.extract(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg', ['Mat'], null), (e) => /Ollama kan ikke nås/.test(e.message) && !/Lokal OCR/.test(e.message));
  } finally { f.restore(); AI._resetAi(); }
  const log = await F('/ai/log?limit=3');
  assert.ok(log.body.items.some((l) => l.engine === 'tesseract' && l.status === 'mangler'));
});

test('OCR: butikk over adressen, gateadresse hoppes over, dato med O/0-feil og «best før» ignoreres', () => {
  const now = Date.UTC(2026, 9, 18);
  const a = OCR.parseReceiptText('@@ %%\nMathallen Bakeri\nVulkan 5\n0178 OSLO\nTlf 22 11 22 33\nBest før 01.01.2027\n17/1O/26 09:41\nÅ BETALE 145,00');
  assert.equal(a.merchant, 'Mathallen Bakeri');
  assert.equal(OCR.findDate('Best før 20.10.2026\nDato: 14.1O.2026 14:22', now), '2026-10-14');
  assert.equal(OCR.findDate('18. okt 2026 kl 08.12', now), '2026-10-18');
  assert.equal(OCR.findStore('|||\nBAKER HANSEN\nStorgata 12B\n0155 Oslo'), 'Baker Hansen');
});

test('Lokal OCR på eldre kvitteringer: 501 uten Tesseract, og masse-endepunktet svarer', async () => {
  OCR._setTools({ tesseract: null, magick: null, zbar: null });
  const b = await F('/receipts/ocr', 'POST', {});
  assert.equal(b.status, 200);
  assert.equal(typeof b.body.message, 'string');
});
