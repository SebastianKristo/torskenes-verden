// Prompt 39 (SERVER39): kvitteringer – varelinjer og sumkontroll (nytt forsøk med tilbakemelding), ny AI-kategori når ingen passer,
// bekreftelse/regel ved godkjenning, og «✦ På nytt» som jobb med fremdrift (upload → ocr → llm → verify → done) og avbryt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-p39-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-39f';
process.env.NODE_ENV = 'test';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { setSecret, db } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');
const r39 = await import('../server/finans/receipts39.js');

const calls = [];
let ollamaReplies = [];
let geminiReply = () => ({ merchant: 'Clas Ohlson', date: '2026-10-12', total: 249, currency: 'NOK', lines: [{ description: 'Skrutrekker', name: 'Skrutrekker', amount: 249 }], confidence: { merchant: 0.97, date: 0.96, total: 0.96 }, suggested_category: 'Diverse' });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : {};
  if (u.includes('127.0.0.1:9')) {
    const msg = body.messages?.[0];
    calls.push({ engine: 'ollama', image: !!msg?.images, prompt: msg?.content ?? '' });
    const r = msg?.images ? (ollamaReplies.shift() ?? {}) : {};
    return new Response(JSON.stringify({ message: { content: JSON.stringify(r) } }), { status: 200 });
  }
  if (u.includes('generativelanguage.googleapis.com')) {
    const part = body.contents?.[0]?.parts?.find((p) => p.inline_data);
    calls.push({ engine: 'gemini' });
    await new Promise((res) => setTimeout(res, 60));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(part ? geminiReply() : {}) }] } }] }), { status: 200 });
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) return realFetch(url, opts);
  throw new TypeError('fetch failed');
};
test.after(() => { globalThis.fetch = realFetch; });

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}` };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: { ...H, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
await call('/settings', 'PUT', { ollamaUrl: 'http://127.0.0.1:9', provider: 'ollama', fallback: false });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const upload = async () => {
  const fd = new FormData();
  fd.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'kvittering.jpg');
  const r = await api.request('/receipts', { method: 'POST', headers: H, body: fd });
  return (await r.json()).id;
};
const settle = async (id) => {
  for (let i = 0; i < 150; i++) {
    const r = (await call(`/receipts/${id}`)).body;
    if (!['pending', 'processing'].includes(r.status)) return r;
    await new Promise((res) => setTimeout(res, 30));
  }
  throw new Error('kvitteringen ble aldri ferdig');
};
const AKADEMIKA = (lines) => ({ merchant: 'Akademika', date: '2026-10-12', total: 135, currency: 'NOK', payment_method: 'Visa', lines, confidence: { merchant: 0.95, date: 0.95, total: 0.95 }, suggested_category: 'Annet' });

test('verify39 og nameSim: sum − rabatter + pant = total (±1 kr), «Skole» = «Skole og studier»', () => {
  const ok = r39.verify39({ total: 135, lines: [{ name: 'Grunnleggende fysikk', amount: 129 }, { name: 'Blyant', amount: 6 }] });
  assert.deepEqual([ok.ok, ok.status, ok.text], [true, 'ok', '✦ Glimt leste 2 varer · sum stemmer']);
  const bad = r39.verify39({ total: 135, lines: [{ name: 'Grunnleggende fysikk', amount: 120 }] });
  assert.deepEqual([bad.ok, bad.status, bad.text], [false, 'usikker', 'Usikker · linjene summerer 120 av 135 kr']);
  assert.match(bad.feedback, /Linjene summerer 120,00, total er 135,00/);
  assert.equal(r39.verify39({ total: 50, lines: [{ amount: 55 }], discounts: [{ text: 'TRUMF', amount: 7 }], pant: 2 }).ok, true);
  assert.equal(r39.verify39({ total: 135, lines: [] }).text, 'Usikker · Glimt fant bare totalen, ingen varelinjer');
  assert.equal(r39.nameSim('Skole', 'Skole og studier'), 1);
  assert.ok(r39.nameSim('Kjæledyr', 'Mat og dagligvarer') < 0.85);
});

test('Akademika: mangler en linje → leses på nytt med tilbakemelding; bokhandel → Skole; Musti → ny AI-kategori «Kjæledyr»', async () => {
  ollamaReplies = [AKADEMIKA([{ description: 'GRUNNL FYSIKK', name: 'Grunnleggende fysikk', nameRaw: 'GRUNNL FYSIKK', qty: 1, unitPrice: 129, amount: 129 }]),
    AKADEMIKA([{ description: 'GRUNNL FYSIKK', name: 'Grunnleggende fysikk', amount: 129 }, { description: 'BLYANT HB', name: 'Blyant', qty: 1, unitPrice: 6, amount: 6 }])];
  calls.length = 0;
  const ida = await upload();
  const r = await settle(ida);
  const img = calls.filter((x) => x.engine === 'ollama' && x.image);
  assert.equal(img.length, 2, 'ett nytt forsøk');
  assert.match(img[0].prompt, /Komma er desimaltegn/);
  assert.match(img[1].prompt, /TILBAKEMELDING: Linjene summerer 129,00, total er 135,00/);
  assert.equal(r.lines.length, 2);
  assert.equal(r.extraction.lines[1].name, 'Blyant');
  assert.equal(r.extraction.lines[1].unitPrice, 6);
  assert.deepEqual([r.verify.ok, r.verify.text], [true, '✦ Glimt leste 2 varer · sum stemmer']);
  assert.equal(r.payment, 'Visa');
  // Bokhandel → den eksisterende «Skole» (ingen «Skole» + «Skole og studier»).
  assert.deepEqual(r.aiCategory, { category: 'Skole', isNew: false, confidence: 0.8, reason: 'Bokhandel · pensum' });
  assert.equal(r.category, 'Skole');
  const dup = await call('/categories', 'POST', { name: 'Skole og studier', source: 'ai' });
  assert.equal(dup.status, 200);
  assert.deepEqual([dup.body.existing, dup.body.category.name], [true, 'Skole']);
  // Musti (dyrebutikk) passer ingen kategori → ny AI-kategori «Kjæledyr».
  const MUSTI = { merchant: 'Musti Majorstuen', date: '2026-10-13', total: 349, currency: 'NOK', lines: [{ description: 'KATTEMAT 2KG', name: 'Kattemat 2 kg', amount: 349 }], confidence: { merchant: 0.93, date: 0.9, total: 0.95 }, suggested_category: 'Annet' };
  ollamaReplies = [MUSTI];
  const id = await upload();
  const m = await settle(id);
  assert.deepEqual(m.aiCategory, { category: 'Kjæledyr', isNew: true, confidence: 0.75, reason: 'Dyrebutikk · fôr og utstyr' });
  assert.equal(m.categoryInfo.newCategory.confirmed, false);
  assert.equal(m.category, 'Kjæledyr');
  const boot = (await call('/bootstrap')).body;
  const cat = boot.categories.find((c) => c.name === 'Kjæledyr');
  assert.deepEqual([cat.source, cat.confirmed, cat.icon], ['ai', false, 'paw']);
  const nw = await call('/categories', 'POST', { name: 'Gaver', color: '#8a3fa0', icon: 'gift', source: 'ai' });
  assert.equal(nw.status, 201);
  assert.deepEqual([nw.body.category.source, nw.body.category.confirmed, nw.body.category.icon], ['ai', false, 'gift']);
  const usr = await call('/categories', 'POST', { name: 'Hobby', icon: 'star' });
  assert.deepEqual([usr.body.category.source, usr.body.category.confirmed], ['user', true]);
  // Godkjenning gjør kategorien permanent; to like godkjenninger gir regelen MUSTI* (source ai).
  assert.equal((await call(`/receipts/${id}/book`, 'POST', {})).status, 200);
  assert.equal(db.prepare("SELECT confirmed FROM fh_categories WHERE name='Kjæledyr'").pluck().get(), 1);
  ollamaReplies = [MUSTI];
  const id2 = await upload();
  const r2 = await settle(id2);
  assert.equal(r2.category, 'Kjæledyr');
  assert.ok(!r2.aiCategory?.isNew, 'ingen ny kategori andre gang (regel eller eksisterende)');
  await call(`/receipts/${id2}/book`, 'POST', {});
  const rule = db.prepare("SELECT * FROM fh_rules WHERE pattern='MUSTI*'").get();
  assert.ok(rule);
  assert.equal(rule.source, 'ai');
});

test('maks 3 nye AI-kategorier per uke uten godkjenning, deretter bare forslag (suggestNew) og «Annet»', () => {
  const u = db.prepare('SELECT user_id FROM fh_categories LIMIT 1').pluck().get();
  db.prepare("UPDATE fh_categories SET created=? WHERE source='ai' AND confirmed=0").run(Date.now());
  const n0 = r39.newThisWeek(u);
  for (let i = n0; i < 3; i++) r39.createAiCategory(u, { name: `Test ${i} kategori` });
  const k = r39.classify39(u, { merchant: 'Vinmonopolet', lines: [{ name: 'Rødvin' }], confidence: { merchant: 0.9 } });
  assert.equal(k.isNew, false);
  assert.equal(k.suggestNew, 'Vin og brennevin');
  assert.equal(k.category, 'Annet');
  // Rydding: ubrukte, ubekreftede etter 24 t.
  assert.ok(r39.sweepAiCategories(Date.now() + 2 * 86400_000) >= 3);
});

test('«✦ På nytt» som jobb: 202 {jobId}, fremdrift upload→llm→verify→done, tatt i bruk (changed), synk-svar har jobId', async () => {
  ollamaReplies = [{ merchant: 'Clas', date: '2026-10-12', total: 200, currency: 'NOK', lines: [{ description: 'X', amount: 200 }], confidence: { merchant: 0.3, date: 0.3, total: 0.3 } }];
  const id = await upload();
  await settle(id);
  setSecret('geminiKey', 'test-key');
  ollamaReplies = Array.from({ length: 6 }, () => geminiReply()); // prompt 52: «På nytt» leses lokalt (engine:'gemini' fra eldre klienter → Ollama)
  const start = await call(`/receipts/${id}/reanalyze`, 'POST', { engine: 'gemini', async: true });
  assert.equal(start.status, 202, JSON.stringify(start.body));
  const { jobId } = start.body;
  assert.ok(jobId);
  assert.equal(start.body.channel, `job:${jobId}`);
  assert.deepEqual(start.body.steps.map((s) => s.k), ['upload', 'ocr', 'llm', 'verify']);
  const seen = new Set();
  let j;
  for (let i = 0; i < 100; i++) {
    j = (await call(`/receipts/reanalyze/${jobId}`)).body;
    if (j.step) seen.add(j.step);
    if (j.status !== 'running') break;
    await new Promise((res) => setTimeout(res, 15));
  }
  assert.equal(j.status, 'done', JSON.stringify(j));
  assert.deepEqual([j.step, j.pct], ['done', 100]);
  assert.match(j.msg, /^✦ Glimt har analysert på nytt · 96 % sikker$/); // prompt 41: «Glimt» i teksten
  assert.ok(seen.has('llm') || seen.has('done'), [...seen].join()); // prompt 52: lokal lesing i testen er så rask at llm-steget kan passeres mellom to avlesninger
  assert.equal(j.result.applied, true);
  assert.ok(j.result.changed.includes('merchant') && j.result.changed.includes('total'));
  assert.equal(j.result.receipt.merchant, 'Clas Ohlson');
  assert.equal(j.result.receipt.aiCategory.category, 'Verktøy og jernvare');
  // Samme jobb via /finans/api/jobs/:id.
  assert.equal((await call(`/jobs/${jobId}`)).body.step, 'done');
  // Synk-formen er uendret + jobId.
  const s = await call(`/receipts/${id}/reanalyze`, 'POST', { engine: 'gemini' });
  assert.equal(s.status, 200);
  assert.ok(s.body.jobId && s.body.candidateId && s.body.previous && s.body.result);
  // Avbryt: ukjent jobb → 404.
  assert.equal((await call(`/receipts/${id}/reanalyze/finnes-ikke/cancel`, 'POST')).status, 404);
  assert.equal((await call('/receipts/reanalyze/finnes-ikke', 'DELETE')).status, 404);
  // Avbryt en jobb som kjører.
  const st2 = await call(`/receipts/${id}/reanalyze`, 'POST', { engine: 'gemini', async: true, apply: false });
  const c = await call(`/receipts/${id}/reanalyze/${st2.body.jobId}/cancel`, 'POST');
  assert.equal(c.status, 200);
  assert.deepEqual([c.body.status, c.body.msg], ['cancelled', 'Avbrutt · ingenting ble endret']);
  setSecret('geminiKey', '');
});
