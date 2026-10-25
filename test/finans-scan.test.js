import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-scan-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { setSecret } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');
const { sniffMime } = await import('../server/finans/scan.js');

// Falske AI-motorer: svarene styres per test. Alt annet nett avvises.
const calls = [];
let ollamaReply = () => ({ merchant: 'Rema 1000', date: '2026-10-10', total: 123.5, currency: 'NOK', lines: [{ description: 'Melk', amount: 123.5 }], confidence: { merchant: 0.9, date: 0.9, total: 0.4 } });
let geminiReply = () => ({ merchant: 'REMA 1000 Lading', date: '2026-10-10', total: 132.5, currency: 'NOK', lines: [{ description: 'Melk', amount: 32.5 }, { description: 'Brød', amount: 100 }], confidence: { merchant: 0.98, date: 0.97, total: 0.96 }, suggested_category: 'Mat og dagligvarer' });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : {};
  if (u.includes('127.0.0.1:9')) {
    const img = body.messages?.[0]?.images;
    calls.push({ engine: 'ollama', image: !!img });
    const r = img ? ollamaReply() : {};
    if (r instanceof Response) return r;
    return new Response(JSON.stringify({ message: { content: JSON.stringify(r) } }), { status: 200 });
  }
  if (u.includes('generativelanguage.googleapis.com')) {
    const part = body.contents?.[0]?.parts?.find((p) => p.inline_data);
    calls.push({ engine: 'gemini', mime: part?.inline_data?.mime_type });
    const r = part ? geminiReply() : {};
    if (r instanceof Response) return r;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] } }] }), { status: 200 });
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) return realFetch(url, opts);
  throw new TypeError('fetch failed');
};

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}` };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: { ...H, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
await call('/settings', 'PUT', { ollamaUrl: 'http://127.0.0.1:9', provider: 'ollama', fallback: false });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]);
const upload = async (files) => {
  const fd = new FormData();
  for (const [buf, type, name] of files) fd.append('file', new Blob([buf], { type }), name);
  const r = await api.request('/receipts', { method: 'POST', headers: H, body: fd });
  return { status: r.status, body: await r.json() };
};
const settle = async (id) => {
  for (let i = 0; i < 100; i++) {
    const r = (await call(`/receipts/${id}`)).body;
    if (!['pending', 'processing'].includes(r.status)) return r;
    await new Promise((res) => setTimeout(res, 30));
  }
  throw new Error('kvitteringen ble aldri ferdig');
};

test('filtypen leses fra innholdet', () => {
  assert.equal(sniffMime(JPEG, 'application/octet-stream', 'x.bin'), 'image/jpeg');
  assert.equal(sniffMime(HEIC, '', 'IMG_0001.HEIC'), 'image/heic');
  assert.equal(sniffMime(Buffer.from('%PDF-1.7 …'), ''), 'application/pdf');
  assert.equal(sniffMime(Buffer.from('hei'), 'image/jpg'), 'image/jpeg');
  assert.equal(sniffMime(Buffer.from('<html>'), 'text/html', 'side.html'), null);
});

test('opplasting med feil filtype godtas, hvert steg logges, og usikker Ollama kan analyseres på nytt', async () => {
  const up = await upload([[JPEG, 'application/octet-stream', 'kvittering']]);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const r = await settle(up.body.id);
  assert.equal(r.mime, 'image/jpeg');
  assert.equal(r.status, 'needs_review');
  assert.equal(r.merchant, 'Rema 1000');
  const steps = r.log.map((l) => l.step);
  for (const s of ['mottatt', 'lest', 'ai', 'lest-ut', 'lagret']) assert.ok(steps.includes(s), `mangler steget ${s}: ${steps}`);
  // Prompt 52: «Analyser på nytt» er lokalt – ingen Gemini-nøkkel trengs, og engine:'gemini' (eldre klienter) leses også lokalt.
  assert.equal(r.canReanalyze, true, 'usikker Ollama kan analyseres på nytt lokalt');
  const jobs = (await call('/receipts/jobs')).body;
  assert.equal(jobs.find((j) => j.id === r.id).canReanalyze, true, 'knappen vises også i køen');

  setSecret('geminiKey', 'test-key'); // selv med nøkkel sendes ingenting til Gemini
  ollamaReply = () => geminiReply();
  const before = calls.length;
  const ra = await call(`/receipts/${r.id}/reanalyze`, 'POST', { engine: 'gemini' });
  assert.equal(ra.status, 200, JSON.stringify(ra.body));
  assert.equal(ra.body.engine_note, 'Gemini brukes ikke lenger til kvitteringer – lest lokalt');
  assert.equal(ra.body.previous.merchant, 'Rema 1000');
  assert.equal(ra.body.previous.engine, 'Ollama');
  assert.equal(ra.body.result.merchant, 'REMA 1000 Lading');
  assert.equal(ra.body.result.items.length, 2);
  assert.ok(ra.body.candidateId);
  assert.ok(!calls.slice(before).some((c) => c.engine === 'gemini'), 'aldri Gemini');
  assert.ok(calls.slice(before).some((c) => c.engine === 'ollama'));

  // Behold forrige: ingenting endres.
  const old = await call(`/receipts/${r.id}/reanalyze/apply`, 'POST', { candidateId: ra.body.candidateId, keep: 'old' });
  assert.equal(old.body.merchant, 'Rema 1000');
  assert.equal((await call(`/receipts/${r.id}/reanalyze/apply`, 'POST', { candidateId: ra.body.candidateId, keep: 'new' })).status, 400, 'kandidaten er brukt');

  const ra2 = await call(`/receipts/${r.id}/reanalyze`, 'POST', {});
  const nw = await call(`/receipts/${r.id}/reanalyze/apply`, 'POST', { candidateId: ra2.body.candidateId, keep: 'new' });
  assert.equal(nw.status, 200);
  assert.equal(nw.body.merchant, 'REMA 1000 Lading');
  assert.equal(nw.body.total, 132.5);
  assert.equal(nw.body.rawProvider, 'ollama');
  assert.equal(nw.body.source_label, 'Lokal AI');
  assert.equal(nw.body.error, null);
  assert.equal(nw.body.canReanalyze, false, 'sikker nok nå');
  assert.ok(!calls.some((c) => c.engine === 'gemini'));
  setSecret('geminiKey', '');
  ollamaReply = () => ({ merchant: 'Rema 1000', date: '2026-10-10', total: 123.5, currency: 'NOK', lines: [{ description: 'Melk', amount: 123.5 }], confidence: { merchant: 0.9, date: 0.9, total: 0.4 } });
});

test('feil i én kvittering stopper ikke køen, og årsaken vises på kvitteringen', async () => {
  let n = 0;
  ollamaReply = () => (n++ === 0 ? new Response('{"error":"model \\"qwen2.5vl:7b\\" not found"}', { status: 404 }) : { merchant: 'Kiwi', date: '2026-10-11', total: 50, currency: 'NOK', confidence: { merchant: 1, date: 1, total: 1 } });
  const up = await upload([[JPEG, 'image/jpeg', 'a.jpg'], [JPEG, 'image/jpeg', 'b.jpg']]);
  assert.equal(up.status, 200);
  const [a, b] = await Promise.all(up.body.jobs.map((j) => settle(j.id)));
  assert.match(a.error, /Ollama svarte 404: model "qwen2\.5vl:7b" not found/);
  assert.equal(a.log.at(-1).step, 'feil');
  assert.equal(b.merchant, 'Kiwi');
  assert.equal(b.error, null);
});

test('HEIC uten JPEG-kopi går aldri til Gemini (prompt 52), heller ikke med nøkkel – tydelig feil', async () => {
  const up = await upload([[HEIC, '', 'IMG_0001.HEIC']]);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const r = await settle(up.body.id);
  assert.equal(r.mime, 'image/heic');
  assert.match(r.error, /HEIC/);

  setSecret('geminiKey', 'test-key');
  const up2 = await upload([[HEIC, 'image/heic', 'IMG_0002.HEIC']]);
  const r2 = await settle(up2.body.id);
  assert.notEqual(r2.rawProvider, 'gemini');
  assert.ok(!calls.some((c) => c.engine === 'gemini'));
  setSecret('geminiKey', '');
});

test('filer som ikke er bilder avvises med navn og type', async () => {
  const up = await upload([[Buffer.from('<html>'), 'text/html', 'side.html']]);
  assert.equal(up.status, 400);
  assert.match(up.body.error, /side\.html.*text\/html/);
});
