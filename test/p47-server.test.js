// Prompt 47 (SERVER47): standard serveradresser (/api/config/servers, /api/me/server med defaults/reset/synk) og kvitteringer tolket på
// enheten (POST /finans/api/receipts/ocr-text fra Android ML Kit / iOS Vision, POST /finans/api/receipts/parsed fra Apple
// Foundation Models), med validering på serveren og per-bruker-data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p47s-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-47s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4271';
process.env.INSIDE_DOCKER = '1';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.OLLAMA_MODEL = 'qwen2.5vl:7b';
delete process.env.PUBLIC_URL;
delete process.env.LOCAL_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Falsk Ollama (strømming via gaten): chat-kallene lagres, svaret styres per test.
const chats = [];
let chatReply = JSON.stringify({ merchant: 'REMA 1000', date: '2026-10-20', total: 56.4, currency: 'NOK', lines: [{ description: 'Melk 1L', amount: 21.9 }, { description: 'Brød', amount: 34.5 }], card_last4: '1234', confidence: { merchant: 0.95, date: 0.9, total: 0.95 } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith('http://ollama.test:11434')) throw new TypeError('fetch failed');
  if (u.endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen2.5vl:7b' }] });
  if (u.endsWith('/api/ps')) return Response.json({ models: [] });
  if (u.endsWith('/api/show')) return Response.json({ capabilities: ['completion', 'vision'] });
  if (u.endsWith('/api/version')) return Response.json({ version: '0.6.0' });
  if (u.endsWith('/api/chat')) {
    const body = JSON.parse(init.body);
    chats.push(body);
    if (!chatReply) return new Response('nei', { status: 500 });
    const lines = [JSON.stringify({ model: body.model, message: { role: 'assistant', content: chatReply }, done: false }), JSON.stringify({ model: body.model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' })];
    return new Response(`${lines.join('\n')}\n`, { headers: { 'content-type': 'application/x-ndjson' } });
  }
  return new Response('nei', { status: 404 });
};
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const s47 = await import('../server/server47.js');
const r47 = await import('../server/finans/receipts47.js');

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

async function settled(C, id) {
  for (let i = 0; i < 200; i++) {
    const r = await C(`/finans/api/receipts/${id}`);
    if (r.status !== 200) return r;
    if (!['pending', 'processing'].includes(r.body.status)) return r;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error('kvitteringen ble aldri ferdig');
}

/* ---------------- Standard serveradresser ---------------- */

test('GET /api/config/servers: publicUrl uten innlogging (standard os.smarthjemexperten.no), localUrl bare etter innlogging', async () => {
  const pub = await req('/api/config/servers');
  assert.equal(pub.status, 200);
  assert.deepEqual(pub.body, { publicUrl: 'https://os.smarthjemexperten.no', defaults: { external: 'https://os.smarthjemexperten.no' }, app: 'homelab', api: 47 });
  assert.ok(!pub.text.includes('10.69.1.39'), 'den lokale IP-en vises aldri uten innlogging');
  assert.equal(pub.headers.get('cache-control'), 'no-store');
  const me = await A('/api/config/servers');
  assert.equal(me.body.publicUrl, 'https://os.smarthjemexperten.no');
  assert.equal(me.body.localUrl, 'http://10.69.1.39:3000');
  assert.deepEqual(me.body.defaults, { external: 'https://os.smarthjemexperten.no', local: 'http://10.69.1.39:3000' });
  assert.deepEqual(me.body.source, { publicUrl: 'default', localUrl: 'default' });
  assert.equal((await T('/api/config/servers')).body.localUrl, 'http://10.69.1.39:3000', 'også med app-token');
  assert.equal((await req('/api/config/servers', { headers: { authorization: 'Bearer fh_ugyldig' } })).body.localUrl, undefined, 'ugyldig token = uten innlogging');
});

test('regresjon: GET /api/config er fortsatt integrasjonslista i Innstillinger (en liste), og krever innlogging', async () => {
  const r = await A('/api/config');
  assert.equal(r.status, 200, r.text);
  assert.ok(Array.isArray(r.body), 'web-Innstillinger kaller cfg.filter(...)');
  assert.equal((await req('/api/config')).status, 401);
});

test('GET /api/config/servers: PUBLIC_URL/LOCAL_URL fra env overstyrer; Docker-interne adresser ignoreres', async () => {
  process.env.PUBLIC_URL = 'https://home.example.no/';
  process.env.LOCAL_URL = 'http://172.18.0.3:3000, http://192.168.1.40:3000';
  try {
    const me = (await A('/api/config/servers')).body;
    assert.equal(me.publicUrl, 'https://home.example.no');
    assert.equal(me.localUrl, 'http://192.168.1.40:3000');
    assert.deepEqual(me.source, { publicUrl: 'env', localUrl: 'env' });
    assert.equal((await K('/api/me/server')).body.local, 'http://192.168.1.40:3000', 'LOCAL_URL går foran oppdagede adresser i /api/me/server');
    process.env.LOCAL_URL = 'http://172.18.0.3:3000';
    assert.equal(s47.serverUrls47().localUrl, 'http://10.69.1.39:3000');
    assert.equal((await K('/api/me/server')).body.local, 'http://10.69.1.39:3000', 'aldri Docker-bridge');
  } finally { delete process.env.PUBLIC_URL; delete process.env.LOCAL_URL; }
});

test('/api/me/server: standardverdier, synk mellom enheter (samme konto), «Tilbakestill til standard», per bruker', async () => {
  const g = (await A('/api/me/server')).body;
  assert.equal(g.local, 'http://10.69.1.39:3000');
  assert.equal(g.external, 'https://os.smarthjemexperten.no');
  assert.deepEqual(g.defaults, { local: 'http://10.69.1.39:3000', external: 'https://os.smarthjemexperten.no' });
  assert.equal(g.isDefault, true);
  const p = await A('/api/me/server', 'PUT', { local: 'http://10.69.1.50:3000', external: 'https://annen.example.no', device: 'iPhone 16\u0007' });
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.isDefault, false);
  assert.equal(p.body.updatedBy, 'iPhone 16');
  assert.ok(Date.parse(p.body.updatedAt) > 0);
  const t = (await T('/api/me/server')).body; // en annen enhet på samme konto
  assert.deepEqual([t.local, t.external, t.updatedBy], ['http://10.69.1.50:3000', 'https://annen.example.no', 'iPhone 16']);
  assert.equal((await K('/api/me/server')).body.local, 'http://10.69.1.39:3000', 'Kari har sine egne (standard)');
  const r = await T('/api/me/server', 'PUT', { reset: true, local: 'http://10.0.0.9:1', device: 'Pixel' });
  assert.deepEqual([r.body.local, r.body.external, r.body.isDefault, r.body.updatedBy], ['http://10.69.1.39:3000', 'https://os.smarthjemexperten.no', true, 'Pixel']);
  assert.equal((await A('/api/me/server')).body.isDefault, true);
  assert.equal((await A('/api/me/server', 'PUT', { local: 'http://172.18.0.3:3000' })).status, 400, 'fortsatt ingen Docker-IP');
});

/* ---------------- OCR-tekst fra enheten ---------------- */

const OCR = 'REMA 1000 STORO\n2026-10-20 14:32\nMelk 1L\t21,90\nBrød\t34,50\nTOTALT\t56,40\nBankkort ****1234';

test('POST /receipts/ocr-text: validering (kilde, tom tekst, for lang, lines-type) og uten innlogging', async () => {
  assert.equal((await req('/finans/api/receipts/ocr-text', { method: 'POST', body: { text: OCR, source: 'android-mlkit' } })).status, 401);
  assert.equal((await A('/finans/api/receipts/ocr-text', 'POST', { text: OCR })).status, 400);
  assert.equal((await A('/finans/api/receipts/ocr-text', 'POST', { text: OCR, source: 'glimt' })).status, 400);
  assert.equal((await A('/finans/api/receipts/ocr-text', 'POST', { text: ' \n\t ', source: 'android-mlkit' })).status, 400);
  assert.equal((await A('/finans/api/receipts/ocr-text', 'POST', { lines: 'x', source: 'android-mlkit' })).status, 400);
  assert.equal((await A('/finans/api/receipts/ocr-text', 'POST', { text: 'x'.repeat(50_001), source: 'android-mlkit' })).status, 413);
  assert.equal((await A('/finans/api/receipts/ocr-text', 'POST', { lines: Array(501).fill('a'), source: 'ios-vision' })).status, 413);
  assert.equal((await A('/finans/api/receipts/ocr-text', 'POST', '[1]')).status, 400);
});

test('POST /receipts/ocr-text: teksten (linjer og tab bevart) går gjennom kvitteringskøen med OCR-instruksen → Til godkjenning', async () => {
  chats.length = 0;
  chatReply ??= JSON.stringify({ merchant: 'REMA 1000', date: '2026-10-20', total: 56.4, currency: 'NOK', lines: [{ description: 'Melk 1L', amount: 21.9 }, { description: 'Brød', amount: 34.5 }], card_last4: '1234', confidence: { merchant: 0.95, date: 0.9, total: 0.95 } });
  try {
    const r = await A('/finans/api/receipts/ocr-text', 'POST', { text: `${OCR}\r\n\u0000`, source: 'android-mlkit' });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.source, 'android-mlkit');
    assert.equal(r.body.mime, 'text/plain');
    assert.equal(r.body.tolketAv, 'glimt-ollama');
    assert.equal(r.body.tolketAvTekst, 'Tolket av Glimt');
    assert.equal(r.body.jobs.length, 1);
    const done = await settled(A, r.body.id);
    assert.equal(done.body.status, 'needs_review', done.text);
    assert.equal(done.body.merchant, 'REMA 1000');
    assert.equal(done.body.total, 56.4);
    assert.equal(done.body.rawProvider, 'ollama');
    assert.equal(done.body.verify.ok, true);
    const chat = chats.at(-1);
    assert.ok(chat, 'Ollama ble spurt');
    const prompt = chat.messages.map((m) => m.content).join('\n');
    assert.match(prompt, /lest med OCR på mobilen/);
    assert.doesNotMatch(prompt, /Kvitteringen er en e-post/);
    assert.ok(prompt.includes('Melk 1L\t21,90\nBrød\t34,50'), 'linjer og tab bevart');
    assert.ok(!prompt.includes('\u0000') && !prompt.includes('\r'), 'kontrolltegn fjernet');
    // Filen på serveren er teksten, og Kari ser den ikke.
    const row = (await import('../server/finans/db.js')).db.prepare('SELECT file, user_id FROM fh_receipts WHERE id=?').get(r.body.id);
    assert.equal(readFileSync(resolve(process.env.DATA_DIR, 'receipts', row.file), 'utf8'), OCR);
    assert.equal((await K(`/finans/api/receipts/${r.body.id}`)).status, 404);
  } finally { /* samme svar for resten */ }
});

test('POST /api/finans/kvitteringer/ocr (alias fra Android-instruksen): {ocrText, kilde}, lines når text mangler', async () => {
  const r = await T('/api/finans/kvitteringer/ocr', 'POST', { ocrText: OCR, kilde: 'android-mlkit' });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.source, 'android-mlkit');
  assert.equal((await req('/api/finans/kvitteringer/ocr', { method: 'POST', body: { ocrText: OCR, kilde: 'android-mlkit' } })).status, 401);
  const l = await K('/finans/api/receipts/ocr-text', 'POST', { lines: ['KIWI', { text: 'Ost\t89,90' }, 42], source: 'ios-vision' });
  assert.equal(l.status, 201, l.text);
  assert.equal(r47.ocrText47({ lines: ['KIWI', { text: 'Ost\t89,90' }, 42] }).text, 'KIWI\nOst\t89,90');
  await settled(T, r.body.id); await settled(K, l.body.id);
});

test('POST /receipts/ocr-text: multipart med originalbildet som «file» – bildet lagres, teksten tolkes (ikke bildet)', async () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  chats.length = 0;
  const fd = new FormData();
  fd.append('text', OCR); fd.append('source', 'android-mlkit');
  fd.append('file', new File([JPEG], 'kvittering.jpg', { type: 'image/jpeg' }));
  const r = await T('/finans/api/receipts/ocr-text', 'POST', fd);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.mime, 'image/jpeg');
  assert.match(r.body.file, /\/finans\/api\/receipts\/.+\/file$/);
  const done = await settled(T, r.body.id);
  assert.equal(done.body.status, 'needs_review', done.text);
  assert.equal(done.body.merchant, 'REMA 1000');
  const chat = chats.at(-1);
  assert.ok(chat && !chat.messages.some((m) => m.images?.length), 'teksten tolkes, ikke bildet');
  assert.match(chat.messages.map((m) => m.content).join('\n'), /lest med OCR på mobilen/);
  const file = await T(`/finans/api/receipts/${r.body.id}/file`);
  assert.equal(file.status, 200);
  const fd2 = new FormData(); fd2.append('text', OCR); fd2.append('source', 'android-mlkit'); fd2.append('file', new File(['x'], 'a.exe', { type: 'application/x-msdownload' }));
  assert.equal((await T('/finans/api/receipts/ocr-text', 'POST', fd2)).status, 400);
  const fd3 = new FormData(); fd3.append('lines', '["KIWI","Ost\\t89,90"]'); fd3.append('kilde', 'ios-vision');
  const l = await T('/finans/api/receipts/ocr-text', 'POST', fd3);
  assert.equal(l.status, 201, l.text);
  await settled(T, l.body.id);
});

/* ---------------- Ferdig tolket på iPhone (Apple Foundation Models) ---------------- */

const FM = { source: 'apple-fm', butikk: 'Vinmonopolet', dato: '2026-10-21', totalsum: 449.8, valuta: 'NOK', mva: 89.96,
  varelinjer: [{ navn: 'Rødvin', antall: 2, pris: 399.8 }, { navn: 'Bærepose', pris: 50 }], kategori: 'Mat', betalingsmiddel: 'Kort' };

test('parsedReceipt47: felttyper, beløpsgrenser og datoer kontrolleres (stoler ikke blindt på klienten)', () => {
  const ok = r47.parsedReceipt47(FM);
  assert.equal(ok.errors, undefined);
  assert.equal(ok.data.merchant, 'Vinmonopolet');
  assert.equal(ok.data.total, 449.8);
  assert.equal(ok.data.lines.length, 2);
  assert.deepEqual(ok.warnings, []);
  const err = (patch) => r47.parsedReceipt47({ ...FM, ...patch }).errors?.[0] ?? null;
  assert.match(err({ totalsum: 'mye' }), /tall/);
  assert.match(err({ totalsum: -5 }), /større enn 0/);
  assert.match(err({ totalsum: 0 }), /større enn 0/);
  assert.match(err({ totalsum: 5_000_000 }), /urimelig/);
  assert.match(err({ totalsum: undefined }), /mangler/);
  assert.match(err({ dato: '2026-02-30' }), /gyldig dato/);
  assert.match(err({ dato: '21.10.2026' }), /gyldig dato/);
  assert.match(err({ dato: '2099-01-01' }), /fremtiden/);
  assert.match(err({ butikk: 42 }), /tekst/);
  assert.match(err({ valuta: 'kroner' }), /ISO/);
  assert.match(err({ mva: 9999 }), /større enn totalen/);
  assert.match(err({ varelinjer: 'x' }), /liste/);
  assert.match(err({ varelinjer: Array(81).fill({ navn: 'a', pris: 1 }) }), /maks 80/);
  assert.match(err({ varelinjer: [{ navn: 'a', pris: 'NaN' }] }), /pris/);
  assert.match(err({ varelinjer: [{ navn: 'a', pris: 1, antall: -1 }] }), /antall/);
  assert.match(err({ card_last4: '1234567812345678' }), /fire siffer/);
  assert.equal(r47.parsedReceipt47([]).errors.length, 1);
  assert.deepEqual(r47.parsedReceipt47({ ...FM, totalsum: 500 }).warnings, ['Varelinjene summerer 449.80 av 500.00 kr']);
  assert.equal(r47.parsedReceipt47({ merchant: 'X', total: '12,50', date: '2026-10-01' }).data.total, 12.5, 'engelske nøkler og desimalkomma');
});

test('POST /receipts/parsed: lagres uten nytt AI-kall, går gjennom køen (kategori, sumkontroll) → «Tolket på iPhone»', async () => {
  assert.equal((await A('/finans/api/receipts/parsed', 'POST', { ...FM, source: 'glimt' })).status, 400);
  const bad = await A('/finans/api/receipts/parsed', 'POST', { ...FM, totalsum: -1 });
  assert.equal(bad.status, 400);
  assert.ok(Array.isArray(bad.body.errors));
  chats.length = 0;
  const r = await A('/finans/api/receipts/parsed', 'POST', { ...FM, ocrText: 'VINMONOPOLET\nRødvin\t399,80' });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.source, 'apple-fm');
  assert.deepEqual(r.body.warnings, []);
  const done = await settled(A, r.body.id);
  assert.equal(done.body.status, 'needs_review', done.text);
  assert.equal(done.body.rawProvider, 'apple-fm');
  assert.equal(done.body.provider, 'Apple Intelligence');
  assert.equal(done.body.tolketAv, 'apple-on-device');
  assert.equal(done.body.tolketAvTekst, 'Tolket på iPhone');
  assert.equal(done.body.merchant, 'Vinmonopolet');
  assert.equal(done.body.total, 449.8);
  assert.equal(done.body.date, '2026-10-21');
  assert.equal(done.body.verify.ok, true);
  assert.equal(done.body.error, null);
  assert.equal(chats.length, 0, 'ingen Ollama-tolkning av en kvittering som er tolket på iPhone');
  assert.equal((await K(`/finans/api/receipts/${r.body.id}`)).status, 404, 'per bruker');
});

test('POST /receipts/parsed: multipart med bildet som vedlegg, og aliaset /api/finans/kvitteringer {tolketAv:"apple-on-device"}', async () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const fd = new FormData();
  fd.append('data', JSON.stringify({ ...FM, totalsum: 500 }));
  fd.append('file', new File([JPEG], 'kvittering.jpg', { type: 'image/jpeg' }));
  const r = await T('/finans/api/receipts/parsed', 'POST', fd);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.mime, 'image/jpeg');
  assert.match(r.body.file, /\/finans\/api\/receipts\/.+\/file$/);
  assert.equal(r.body.warnings.length, 1);
  const done = await settled(T, r.body.id);
  assert.equal(done.body.verify.ok, false, 'sumkontrollen markerer avviket');
  const fd2 = new FormData(); fd2.append('data', '{nei'); assert.equal((await T('/finans/api/receipts/parsed', 'POST', fd2)).status, 400);
  const fd3 = new FormData(); fd3.append('data', JSON.stringify(FM)); fd3.append('file', new File(['x'], 'a.exe', { type: 'application/x-msdownload' }));
  assert.equal((await T('/finans/api/receipts/parsed', 'POST', fd3)).status, 400);
  const al = await K('/api/finans/kvitteringer', 'POST', { ...FM, source: undefined, tolketAv: 'apple-on-device' });
  assert.equal(al.status, 201, al.text);
  assert.equal(al.body.source, 'apple-fm');
  await settled(K, al.body.id);
});
