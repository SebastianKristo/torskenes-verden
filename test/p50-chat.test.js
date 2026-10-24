// Prompt 50 (SRVCHAT50): vedlegg i Chat med miniatyr (480 px WebP) lagret med samtalen, vision fra Ollama /api/show,
// riktig modell for bilder (vision-modell eller lokal OCR, «Lest med …»), kvittering i chat via kvitteringskjeden (tabell +
// «Legg i Finans ›»), og «Les på nytt» av kvitteringer uten 502: nedskalering til 2048 px, jobb/202 og tydelige feilkoder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p50-chat-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-50c';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENWEBUI_URL;
delete process.env.OPENWEBUI_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

/* ---------- Falske bilder (ImageMagick erstattes, så testen ikke avhenger av verktøyet) ---------- */
const webp = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };
const jpeg = (w, h, pad = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3]), Buffer.alloc(pad, 9)]);
const BIG = jpeg(4032, 3024, 600_000); // «full oppløsning»
const magickCalls = [];
const img50 = await import('../server/img50.js');
img50._setImg50({ cmd: 'convert', run: (args) => { magickCalls.push(args); const size = args[args.indexOf('-resize') + 1]; const max = parseInt(size, 10); return args.at(-1) === 'webp:-' ? webp(480, 360) : jpeg(max, Math.round(max * 0.75), 2000); } });

/* ---------- Falskt nett ---------- */
const calls = [];
const net = { tags: [], caps: {}, gemini: 'ok', geminiDelay: 0 };
const GOOD48 = { merchant: 'REMA 1000', org_number: '911015838', date: '2026-10-20', time: '17:42', currency: 'NOK',
  items: [{ description: 'MELK 1L', quantity: 1, unit_price: 21.9, amount: 21.9 }, { description: 'BRØD', quantity: 1, unit_price: 34.5, amount: 34.5 }],
  discounts: [], subtotal: null, vat: [{ rate: 15, amount: 7.36 }], total: 56.4, payment_method: 'BankAxept', category_suggestion: 'Mat og dagligvarer' };
const enc = (s) => new TextEncoder().encode(s);
const streamOf = (chunks) => new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc(x)); c.close(); } });
async function fake(url, init = {}) {
  const u = new URL(String(url));
  let body = null;
  if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
  calls.push({ host: u.host, path: u.pathname, body });
  if (u.host === 'ollama.test:11434') {
    if (u.pathname === '/api/tags') return Response.json({ models: net.tags.map((name) => ({ name, size: 5e9 })) });
    if (u.pathname === '/api/show') { const c = net.caps[body?.model]; return c ? Response.json({ capabilities: c }) : new Response('nei', { status: 404 }); }
    if (u.pathname === '/api/ps') return Response.json({ models: [] });
    if (u.pathname === '/api/version') return Response.json({ version: '0.12.0' });
    if (u.pathname === '/api/chat') {
      const last = body?.messages?.at(-1)?.content ?? '';
      if (/Rader:/.test(last)) return new Response(`${JSON.stringify({ model: body.model, message: { role: 'assistant', content: JSON.stringify(GOOD48) }, done: true, done_reason: 'stop' })}\n`, { headers: { 'content-type': 'application/x-ndjson' } });
      return new Response(streamOf([{ message: { content: 'Jeg ser ' } }, { message: { content: 'kvitteringen.' } }, { done: true, eval_count: 10, eval_duration: 1e9 }].map((l) => `${JSON.stringify(l)}\n`)));
    }
  }
  if (u.host === 'generativelanguage.googleapis.com') {
    if (u.pathname.endsWith('/models')) return Response.json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
    if (net.geminiDelay) await new Promise((r) => setTimeout(r, net.geminiDelay));
    if (net.gemini === 'down') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (net.gemini === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ merchant: 'Clas Ohlson', date: '2026-10-12', total: 249, currency: 'NOK', lines: [{ description: 'Skrutrekker', amount: 249 }], confidence: { merchant: 0.97, date: 0.96, total: 0.96 }, suggested_category: 'Diverse' }) }] } }] });
  }
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = fake;
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const chat = await import('../server/chat.js');
chat._setChatFetch(fake);
const chat50 = await import('../server/chat50.js');
const fdb = await import('../server/finans/db.js');
const tess = await import('../server/receipts48/engines/tesseract.js');
const aiRun = await import('../server/ai-run.js');
const { _reread50 } = await import('../server/finans/reread50.js');
const { _resetAi } = await import('../server/finans/ai.js');
const gate = await import('../server/ai-gate.js');
gate._gateTest.backoffMs = [5, 5];

const ROWS = ['REMA 1000', 'Org.nr 911 015 838', 'Dato 20.10.2026 17:42', 'MELK 1L 21,90', 'BRØD 34,50', 'TOTAL 56,40', 'BANKAXEPT 56,40'];
const TSV = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext', '1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t',
  ...ROWS.flatMap((row, li) => row.split(' ').map((w, wi) => `5\t1\t1\t1\t${li + 1}\t${wi + 1}\t${100 + wi * 120}\t${100 + li * 80}\t100\t40\t90\t${w}`))].join('\n');
tess._setTesseract48({ tools: async () => ({ tesseract: 'tesseract 5', magick: null }), run: async () => TSV });

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.50' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body, headers = {}) => {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { cookie, ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...headers }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* SSE eller binært */ }
  return { status: r.status, body: json, text: buf.toString('utf8'), buf, headers: r.headers };
};
const sse = (text) => text.split(/\n\n+/).filter(Boolean).map((blk) => ({ event: blk.match(/^event: (.+)$/m)?.[1] ?? 'message', data: (() => { const d = blk.match(/^data: (.*)$/m)?.[1]; return d ? JSON.parse(d) : null; })() }));
const S = client(await login('sebastian', 'testpassord1'));
assert.equal((await S('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client(await login('kari', 'kariPassord123'));
await S('/finans/api/transactions');
const r48off = () => { fdb.saveSettings({ receipts48: { macOcr: false, gemini: false, tesseract: true, deviceOcr: true, deviceParse: true } }, 'owner'); const r = aiRun.routing(); delete r.own; aiRun.saveServerRouting({ ...r, rules: { ...r.rules, finLocal: true } }); };
const upload = async (C, buf, name = 'Bruktefile.jpeg', type = 'image/jpeg') => { const fd = new FormData(); fd.append('file', new Blob([buf], { type }), name); return C('/api/chat/files', 'POST', fd); };
const resetModels = (tags, caps = {}) => { net.tags = tags; net.caps = caps; chat50._resetCaps50(); chat._setChatFetch(fake); };

/* ---------------- Vedlegg ---------------- */

let imgId;
test('vedlegg: bilde lagres med miniatyr (480 px WebP), originalen hentes ved behov, bare eieren ser det', async () => {
  magickCalls.length = 0;
  const r = await upload(S, jpeg(3000, 2000, 4000));
  assert.equal(r.status, 200, r.text);
  imgId = r.body.id;
  assert.deepEqual([r.body.kind, r.body.mime, r.body.w, r.body.h], ['image', 'image/jpeg', 480, 360]);
  assert.equal(r.body.thumb, `/api/chat/files/${imgId}/thumb`);
  assert.equal(r.body.url, `/api/chat/files/${imgId}`);
  assert.ok(magickCalls.some((a) => a.includes('480x480>') && a.at(-1) === 'webp:-'), 'miniatyr med ImageMagick');
  const t = await S(r.body.thumb);
  assert.equal(t.status, 200);
  assert.equal(t.headers.get('content-type'), 'image/webp');
  assert.match(t.headers.get('cache-control'), /immutable/);
  const etag = t.headers.get('etag');
  assert.equal((await S(r.body.thumb, 'GET', undefined, { 'if-none-match': etag })).status, 304);
  const o = await S(r.body.url);
  assert.equal(o.status, 200);
  assert.equal(o.buf.length, 4012);
  assert.equal((await K(r.body.thumb)).status, 404, 'andre brukere får ikke se vedlegget');
  assert.equal((await K(r.body.url)).status, 404);
  // For stor fil og falsk «bilde» (ikke et bilde i innholdet).
  const big = await upload(S, Buffer.alloc(21 * 1024 * 1024, 1), 'stor.bin', 'application/octet-stream');
  assert.equal(big.status, 413);
  assert.match(big.body.error, /maks 20 MB/);
  const fakeImg = await upload(S, Buffer.from('<svg onload=alert(1)>'), 'x.png', 'image/png');
  assert.equal(fakeImg.body.kind, 'file');
  assert.equal((await S(fakeImg.body.url)).headers.get('content-type'), 'application/octet-stream');
});

test('ImageMagick mangler: miniatyren er originalen (JS-reserve)', async () => {
  img50._setImg50({ cmd: null });
  const r = await upload(S, jpeg(800, 600, 100), 'liten.jpg');
  assert.deepEqual([r.body.kind, r.body.w, r.body.h], ['image', 800, 600]);
  const t = await S(r.body.thumb);
  assert.equal(t.headers.get('content-type'), 'image/jpeg');
  assert.equal(t.buf.length, 112);
  img50._setImg50({ cmd: 'convert' });
});

/* ---------------- Modeller og vision ---------------- */

test('modellisten: vision fra Ollama /api/show (capabilities), lagret; navnegjetning når /api/show feiler', async () => {
  resetModels(['gpt-oss:latest', 'mystisk:7b', 'gemma3:12b', 'qwen2.5vl:7b'], { 'gpt-oss:latest': ['completion', 'tools'], 'mystisk:7b': ['completion', 'vision'], 'gemma3:12b': ['completion', 'vision'] });
  const r = await S('/api/chat/models');
  const v = Object.fromEntries(r.body.models.filter((m) => m.installed && m.kind === 'lokal').map((m) => [m.id, m.vision]));
  assert.deepEqual(v, { 'gpt-oss:latest': false, 'mystisk:7b': true, 'gemma3:12b': true, 'qwen2.5vl:7b': true });
  const rows = (await import('../server/db.js')).db.prepare('SELECT model, vision FROM chat_model_caps50 ORDER BY model').all();
  assert.deepEqual(rows.map((x) => [x.model, x.vision]), [['gemma3:12b', 1], ['gpt-oss:latest', 0], ['mystisk:7b', 1]]);
});

/* ---------------- Riktig modell for bilder ---------------- */

let chatId;
test('gpt-oss + bilde: beste lokale vision-modell svarer («Lest med gemma3:12b fordi gpt-oss ikke kan se bilder»), samtalen lagrer bare miniatyren', async () => {
  resetModels(['gpt-oss:latest', 'gemma3:12b'], { 'gpt-oss:latest': ['completion'], 'gemma3:12b': ['completion', 'vision'] });
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { model: 'gpt-oss:latest', messages: [{ role: 'user', content: 'Hva står det på bildet?', attachments: [imgId] }] });
  assert.equal(r.status, 200, r.text);
  const ev = sse(r.text);
  const meta = ev.find((e) => e.event === 'meta').data, done = ev.find((e) => e.event === 'done')?.data;
  chatId = meta.chatId;
  assert.ok(done, r.text);
  assert.equal(meta.model, 'gemma3:12b');
  assert.equal(done.readWith.label, 'Lest med gemma3:12b fordi gpt-oss ikke kan se bilder');
  const oc = calls.filter((x) => x.path === '/api/chat').at(-1);
  assert.equal(oc.body.model, 'gemma3:12b');
  const imgs = oc.body.messages.at(-1).images;
  assert.equal(imgs.length, 1);
  assert.ok(Buffer.from(imgs[0], 'base64').length < 3000, 'modellen får det nedskalerte bildet (1600 px)');
  const c = await S(`/api/chat/chats/${chatId}`);
  assert.equal(c.body.model, 'gpt-oss:latest', 'samtalen beholder valgt modell');
  const u = c.body.messages[0];
  assert.equal(u.images, undefined, 'ingen base64 i historikken');
  assert.deepEqual(u.attachments.map((a) => [a.id, a.kind, a.thumb]), [[imgId, 'image', `/api/chat/files/${imgId}/thumb`]]);
  assert.equal(c.body.messages[1].meta.readWith.engine, 'vision');
  const raw = (await import('../server/db.js')).db.prepare('SELECT messages FROM hl_chats WHERE id=?').get(chatId).messages;
  assert.ok(raw.length < 4000 && !raw.includes(imgs[0].slice(0, 40)), 'lagret som beskrivelse, ikke bilde');
});

test('oppfølging i samme samtale: bildet hentes fra vedlegget igjen for vision-modellen', async () => {
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { chatId, model: 'gemma3:12b', messages: [{ role: 'user', content: 'Og hva kostet det?' }] });
  assert.equal(r.status, 200);
  const oc = calls.filter((x) => x.path === '/api/chat').at(-1);
  assert.equal(oc.body.messages.find((m) => m.role === 'user').images?.length, 1);
});

test('ingen vision-modell installert: lokal OCR → «[Tekst fra bilde: …]» til gpt-oss, «Lest med lokal OCR»', async () => {
  resetModels(['gpt-oss:latest'], { 'gpt-oss:latest': ['completion'] });
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { model: 'gpt-oss:latest', messages: [{ role: 'user', content: 'Hva står det her?' }], files: [imgId] });
  const done = sse(r.text).find((e) => e.event === 'done')?.data;
  assert.ok(done, r.text);
  assert.equal(done.readWith.label, 'Lest med lokal OCR');
  const oc = calls.filter((x) => x.path === '/api/chat').at(-1);
  assert.equal(oc.body.model, 'gpt-oss:latest');
  const last = oc.body.messages.at(-1);
  assert.equal(last.images, undefined);
  assert.match(last.content, /^Hva står det her\?\n\n\[Tekst fra bilde: REMA 1000\n/);
  const c = await S(`/api/chat/chats/${done.chatId}`);
  assert.equal(c.body.messages[0].content, 'Hva står det her?', 'OCR-teksten lagres ikke i brukerens melding');
});

test('eldre apper (base64 i images) lagres som vedlegg med miniatyr', async () => {
  resetModels(['gemma3:12b'], { 'gemma3:12b': ['completion', 'vision'] });
  const b64 = jpeg(1200, 900, 300).toString('base64');
  const r = await S('/api/chat/send', 'POST', { model: 'gemma3:12b', messages: [{ role: 'user', content: 'Se', images: [b64] }] });
  const id = sse(r.text).find((e) => e.event === 'meta').data.chatId;
  const c = await S(`/api/chat/chats/${id}`);
  assert.equal(c.body.messages[0].images, undefined);
  assert.equal(c.body.messages[0].attachments[0].kind, 'image');
  assert.equal((await S(c.body.messages[0].attachments[0].thumb)).status, 200);
});

/* ---------------- Kvittering i chat ---------------- */

test('kvittering i chat: kvitteringskjeden (lokalt), markdown-tabell + «Legg i Finans ›», ingen sky; Legg i Finans legger den i køen', async () => {
  resetModels(['gpt-oss:latest', 'qwen3:8b'], { 'gpt-oss:latest': ['completion'], 'qwen3:8b': ['completion'] });
  r48off();
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { model: 'gpt-oss:latest', messages: [{ role: 'user', content: 'les kvitteringen og skriv det i en tabell', attachments: [{ id: imgId }] }] });
  const done = sse(r.text).find((e) => e.event === 'done')?.data;
  assert.ok(done, r.text);
  assert.equal(done.engine, 'receipt');
  assert.equal(done.receipt.action.label, 'Legg i Finans ›');
  assert.equal(done.receipt.action.url, `/api/chat/files/${imgId}/finans`);
  assert.match(done.readWith.label, /^Lest med Glimt \(Tesseract\)/);
  const text = sse(r.text).filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.match(text, /\| Vare \| Antall \| Pris \|/);
  assert.match(text, /\| MELK 1L \| 1 \| 21,90 kr \|/);
  assert.match(text, /\*\*Totalt\*\* \|  \| \*\*56,40 kr\*\*/);
  assert.equal(calls.filter((x) => x.host.includes('googleapis')).length, 0, 'ingenting til skyen');
  assert.ok(!calls.some((x) => x.path === '/api/chat' && x.body?.messages?.at(-1)?.images), 'ingen språkmodell fikk bildet');
  const fin = await S(`/api/chat/files/${imgId}/finans`, 'POST');
  assert.equal(fin.status, 201, fin.text);
  assert.ok(fin.body.receiptId);
  assert.ok(fdb.db.prepare('SELECT 1 FROM fh_receipts WHERE id=?').get(fin.body.receiptId));
  assert.equal((await K(`/api/chat/files/${imgId}/finans`, 'POST')).status, 404);
});

/* ---------------- Les på nytt uten 502 ---------------- */

const RDIR = join(process.env.DATA_DIR, 'receipts', 't50');
mkdirSync(RDIR, { recursive: true });
let rn = 0;
function receipt({ file = true } = {}) {
  const id = `rc50-${++rn}`;
  if (file) writeFileSync(join(RDIR, `${id}.jpg`), BIG);
  fdb.db.prepare("INSERT INTO fh_receipts(id,file,mime,status,merchant,date,total,created,user_id) VALUES(?,?,?,'needs_review','Clas','2026-10-12',20000,?,'owner')").run(id, file ? `t50/${id}.jpg` : null, 'image/jpeg', Date.now());
  return id;
}
async function waitJob(path) {
  for (let i = 0; i < 200; i++) { const j = await S(path); if (j.body?.status !== 'running') return j; await new Promise((r) => setTimeout(r, 15)); }
  throw new Error('jobben ble aldri ferdig');
}
const geminiImage = () => { const g = calls.filter((x) => x.host === 'generativelanguage.googleapis.com' && x.body?.contents).at(-1); return g?.body.contents[0].parts.find((p) => p.inline_data)?.inline_data; };

test('«Les på nytt»: originalen nedskaleres til 2048 px (small: 1280, maxSide) før Gemini; jobben kan følges på alle tre stiene', async () => {
  fdb.setSecret('geminiKey', 'AIza-test-key-aaaaaaaaaaaaaaaaaaaa');
  const r = aiRun.routing(); delete r.own; aiRun.saveServerRouting({ ...r, rules: { ...r.rules, finLocal: false } });
  _resetAi(); net.gemini = 'ok'; calls.length = 0; magickCalls.length = 0;
  const id = receipt();
  const st = await S(`/finans/api/receipts/${id}/reanalyze`, 'POST', { engine: 'gemini', async: true, apply: false });
  assert.equal(st.status, 202, st.text);
  const j = await waitJob(`/finans/api/jobs/${st.body.jobId}`);
  assert.equal(j.body.status, 'done', j.text);
  assert.ok(j.body.result.candidateId);
  for (const p of [`/finans/api/receipts/reanalyze/${st.body.jobId}`, `/finans/api/receipts/jobs/${st.body.jobId}`]) assert.equal((await S(p)).body.status, 'done', p);
  const g = geminiImage();
  assert.equal(g.mime_type, 'image/jpeg');
  assert.ok(Buffer.from(g.data, 'base64').length < 10_000, 'ikke originalen (600 kB)');
  assert.ok(magickCalls.some((a) => a.includes('2048x2048>')));
  magickCalls.length = 0;
  await waitJob(`/finans/api/jobs/${(await S(`/finans/api/receipts/${id}/reanalyze`, 'POST', { engine: 'gemini', async: true, apply: false, small: true })).body.jobId}`);
  assert.ok(magickCalls.some((a) => a.includes('1280x1280>')), 'Les mindre versjon');
  magickCalls.length = 0;
  await waitJob(`/finans/api/jobs/${(await S(`/finans/api/receipts/${id}/reanalyze`, 'POST', { engine: 'gemini', async: true, apply: false, maxSide: 1024 })).body.jobId}`);
  assert.ok(magickCalls.some((a) => a.includes('1024x1024>')), 'maxSide');
});

test('feilkoder: 503 modell_utilgjengelig, 504 tidsavbrudd, 404 bilde_mangler – aldri 502; jobben har kode/code/httpStatus/melding', async () => {
  _resetAi(); net.gemini = 'down';
  const a = await S(`/finans/api/receipts/${receipt()}/reanalyze`, 'POST', { engine: 'gemini', apply: false });
  assert.equal(a.status, 503, a.text);
  assert.deepEqual([a.body.kode, a.body.code], ['modell_utilgjengelig', 'modell_utilgjengelig']);
  const st = await S(`/finans/api/receipts/${receipt()}/reanalyze`, 'POST', { engine: 'gemini', async: true, apply: false });
  const j = await waitJob(`/finans/api/jobs/${st.body.jobId}`);
  assert.deepEqual([j.body.status, j.body.kode, j.body.code, j.body.httpStatus], ['error', 'modell_utilgjengelig', 'modell_utilgjengelig', 503]);
  assert.equal(j.body.melding, 'Glimt er ikke tilgjengelig akkurat nå. Prøv igjen om litt.');
  _resetAi(); net.gemini = 'timeout';
  const t = await S(`/finans/api/receipts/${receipt()}/reanalyze`, 'POST', { engine: 'gemini', apply: false });
  assert.equal(t.status, 504, t.text);
  assert.equal(t.body.kode, 'tidsavbrudd');
  _resetAi(); net.gemini = 'ok';
  const m = await S(`/finans/api/receipts/${receipt({ file: false })}/reanalyze`, 'POST', { engine: 'gemini', apply: false });
  assert.equal(m.status, 404);
  assert.equal(m.body.kode, 'bilde_mangler');
});

test('uten async: svarer høyst etter syncMaxMs med 202 {jobId, pending} i stedet for å holde forespørselen (proxy-502)', async () => {
  const old = _reread50.syncMaxMs;
  _reread50.syncMaxMs = 40; net.geminiDelay = 250; _resetAi();
  const t0 = Date.now();
  const r = await S(`/finans/api/receipts/${receipt()}/reanalyze`, 'POST', { engine: 'gemini', apply: false });
  assert.equal(r.status, 202, r.text);
  assert.ok(r.body.pending && r.body.jobId);
  assert.ok(Date.now() - t0 < 240, 'svarte før modellen var ferdig');
  const j = await waitJob(`/finans/api/jobs/${r.body.jobId}`);
  assert.equal(j.body.status, 'done');
  assert.ok(j.body.result.candidateId);
  _reread50.syncMaxMs = old; net.geminiDelay = 0;
});
