// Prompt 51 (RCPTSRV51): kvitteringsrettingen på serveren.
//   B4 forbehandling (originalen, EXIF, perspektiv, aldri under 2000 px) og kontekstvinduet til tekstmodellen,
//   B5 bilder i Glimt-chatten (aldri bilder til en modell uten bildestøtte, vei per bilde, bytt vei ved 400, ingen rå Ollama-feil,
//      vision fra /api/show også for modeller via Open WebUI), B6 (visjonsmodellen er aldri eneste kilde, ingen Gemini med sperren),
//   C org.nr. + lokal kopi av Enhetsregisteret + rekkefølgen org.nr. → kjent butikk → modellen + læring,
//   D ocr_raw per kvittering, og rask Mac-OCR-status når verten ikke svarer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p51r-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51r';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4601';
process.env.INSIDE_DOCKER = '1';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.OLLAMA_MODEL = 'qwen2.5vl:7b';
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MAC_OCR_KEY', 'MAC_OCR_URL', 'OPENWEBUI_URL', 'OPENWEBUI_KEY']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const MAC_KEY = 'b'.repeat(64);
const ORG = '911015838';
const ROWS = ['REMA 1000', `Org.nr NO ${ORG.slice(0, 3)} ${ORG.slice(3, 6)} ${ORG.slice(6)} MVA`, 'Dato 20.10.2026 17:42', 'MELK 1L 21,90', 'BRØD 34,50', 'TOTAL 56,40', 'BANKAXEPT 56,40'];
const GOOD = (o = {}) => ({ merchant: 'REMA', org_number: null, date: '2026-10-20', time: '17:42', currency: 'NOK',
  items: [{ description: 'MELK 1L', quantity: null, unit_price: null, amount: 21.9 }, { description: 'BRØD', quantity: null, unit_price: null, amount: 34.5 }],
  discounts: [], subtotal: null, vat: [], total: 56.4, payment_method: 'BankAxept', category_suggestion: 'Mat og dagligvarer', ...o });
const tsvOf = (rows) => ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext', `1\t1\t0\t0\t0\t0\t0\t0\t2000\t${Math.max(3000, 200 + rows.length * 90)}\t-1\t`,
  ...rows.flatMap((row, li) => row.split(' ').map((w, wi) => `5\t1\t1\t1\t${li + 1}\t${wi + 1}\t${100 + wi * 150}\t${100 + li * 90}\t120\t50\t91\t${w}`))].join('\n');

// ---------- Falskt nett ----------
const calls = [];
const net = { tags: ['qwen3:8b', 'qwen2.5vl:7b'], caps: { 'qwen3:8b': ['completion'], 'qwen2.5vl:7b': ['completion', 'vision'] }, mac: 'hang', llm: null, owui: null };
const VISION = new Set(['qwen2.5vl:7b']);
const enc = (s) => new TextEncoder().encode(s);
const nd = (lines) => new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(enc(`${JSON.stringify(l)}\n`)); c.close(); } }), { headers: { 'content-type': 'application/x-ndjson' } });
const BRREG_E = ['"organisasjonsnummer","navn","organisasjonsform.kode","forretningsadresse.adresse","forretningsadresse.postnummer","forretningsadresse.poststed","konkurs","underAvvikling","slettedato"',
  `"${ORG}","REMA 1000 GRÜNERLØKKA AS","AS","Thorvald Meyers gate 1","0555","OSLO","false","false",""`,
  '"923609016","KONKURS-BUTIKKEN AS","AS","","","","true","false",""',
  '"974760673","SLETTET, MED \\"KOMMA\\" AS","AS","","","","false","false","2020-01-01"'].join('\n');
const BRREG_U = ['organisasjonsnummer;navn;beliggenhetsadresse.adresse;beliggenhetsadresse.poststed;nedleggelsesdato',
  '912345670;KAFFEBAREN FILIAL;Storgata 2;OSLO;'].join('\n');
async function fake(url, init = {}) {
  const u = new URL(String(url));
  let body = null;
  if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
  const rec = { host: u.host, path: u.pathname, body, t: Date.now() };
  calls.push(rec);
  if (u.host === 'ollama.test:11434') {
    if (u.pathname === '/api/tags') return Response.json({ models: net.tags.map((name) => ({ name, size: 5e9 })) });
    if (u.pathname === '/api/show') { const c = net.caps[body?.model ?? body?.name]; return c ? Response.json({ capabilities: c }) : new Response('nei', { status: 404 }); }
    if (u.pathname === '/api/ps') return Response.json({ models: [] });
    if (u.pathname === '/api/version') return Response.json({ version: '0.12.0' });
    if (u.pathname === '/api/chat') {
      const hasImg = (body?.messages ?? []).some((m) => m.images?.length);
      if (hasImg && !VISION.has(body.model)) return new Response(JSON.stringify({ error: 'Multimodal data provided, but model does not support multimodal requests' }), { status: 400 });
      const last = body?.messages?.at(-1)?.content ?? '';
      if (/Rader:/.test(last)) return nd([{ model: body.model, message: { role: 'assistant', content: net.llm ? net.llm(body) : JSON.stringify(GOOD()) }, done: true, done_reason: 'stop' }]);
      const text = hasImg ? 'Jeg ser en katt på en sofa.' : /Tekst fra bildet/.test(last) ? '| Linje | Beløp |\n|---|---|\n| Strøm | 1 250,00 kr |' : 'Hei.';
      return nd([{ message: { content: text } }, { done: true, eval_count: 8, eval_duration: 1e9 }]);
    }
    return new Response('nei', { status: 404 });
  }
  if (u.host === 'mac.test:8765') {
    // Verten svarer ikke (henger til forespørselen avbrytes).
    // (Et ekte nettkall holder hendelsesløkken i live; AbortSignal.timeout gjør det ikke – derfor en ref-et timer her.)
    if (net.mac === 'hang') return new Promise((_, rej) => { const keep = setTimeout(() => {}, 60_000); init.signal?.addEventListener('abort', () => { clearTimeout(keep); rej(Object.assign(new Error('aborted'), { name: 'TimeoutError' })); }); });
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  }
  if (u.host === 'data.brreg.no') {
    if (/underenheter/.test(u.pathname)) return new Response(BRREG_U, { headers: { 'content-type': 'text/csv' } });
    return new Response(gzipSync(Buffer.from(BRREG_E)), { headers: { 'content-type': 'application/octet-stream' } });
  }
  if (u.host === 'owui.test:8080') {
    if (u.pathname === '/api/models') return Response.json({ data: net.owui ?? [] });
  }
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = fake;
test.after(() => { globalThis.fetch = realFetch; });

// Bilder: chat-vedleggene skaleres av img50 (ImageMagick erstattes).
const jpeg = (w, h, pad = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3]), Buffer.alloc(pad, 9)]);
const img50 = await import('../server/img50.js');
const webp = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };
img50._setImg50({ cmd: 'convert', run: (args) => (args.at(-1) === 'webp:-' ? webp(480, 360) : jpeg(1600, 1200, 1000)) });

const { default: app } = await import('../server/index.js');
const gate = await import('../server/ai-gate.js');
gate._gateTest.backoffMs = [5, 5];
const aiRun = await import('../server/ai-run.js');
const fdb = await import('../server/finans/db.js');
const ai = await import('../server/finans/ai.js');
const chain = await import('../server/receipts48/chain.js');
const tess = await import('../server/receipts48/engines/tesseract.js');
const brreg = await import('../server/receipts48/brreg51.js');
const pre = await import('../server/receipts48/preprocess51.js');
const ocrRaw = await import('../server/receipts48/ocr-raw51.js');
const chat = await import('../server/chat.js');
const chat50 = await import('../server/chat50.js');
const c51 = await import('../server/chat51.js');
chat._setChatFetch(fake);
brreg._setBrregFetch51(fake);

let ip = 20;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ip++ % 250}`, ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* SSE */ }
  return { status: r.status, body: json, text };
}
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (cookie) => (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });
const A = as(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = as(await login('kari', 'kariPassord123'));
await A('/finans/api/transactions'); await K('/finans/api/transactions');
const sse = (text) => text.split(/\n\n+/).filter(Boolean).map((blk) => ({ event: blk.match(/^event: (.+)$/m)?.[1] ?? 'message', data: (() => { const d = blk.match(/^data: (.*)$/m)?.[1]; try { return d ? JSON.parse(d) : null; } catch { return d; } })() }));

// Tesseract (falsk): husker hvilken fil den fikk.
const tessSeen = [];
function fakeTess(rows = ROWS) {
  tess._setTesseract48({ tools: async () => ({ tesseract: 'tesseract 5.3.0', magick: null }), run: async (cmd, args) => { tessSeen.push({ cmd, file: args[0], size: existsSync(args[0]) ? statSync(args[0]).size : null }); return tsvOf(rows); } });
}
function setup({ finLocal = true, macOcr = true } = {}) {
  chain._resetChain48(); ai._resetAi();
  fdb.saveSettings({ macOcrUrl: 'http://mac.test:8765', receipts48: { macOcr, tesseract: true, gemini: true, deviceOcr: true, deviceParse: true, compareMac: true } }, 'owner');
  fdb.setSecret('macOcrKey', MAC_KEY);
  const r = aiRun.routing(); delete r.own; aiRun.saveServerRouting({ ...r, rules: { ...r.rules, finLocal } });
  fakeTess(); tessSeen.length = 0; net.llm = null; net.mac = 'hang'; calls.length = 0;
}
const BIG = jpeg(4032, 3024, 300_000), SMALL = jpeg(1600, 1200, 5000);
function scanForm({ image = BIG, scan = SMALL } = {}) {
  const f = new FormData();
  f.append('image', new Blob([image], { type: 'image/jpeg' }), 'kvittering.jpg');
  if (scan) f.append('scan', new Blob([scan], { type: 'image/jpeg' }), 'scan.jpg');
  f.append('client', 'ios 1.51.0');
  return f;
}

/* ---------------- Org.nr. og Enhetsregisteret ---------------- */

test('org.nr.: mod11, etter «Org.nr»/«Foretaksregisteret»/«NO … MVA», OCR-feil (O→0), over linjeskift; visningsnavn', () => {
  assert.equal(brreg.mod11Ok(ORG), true);
  assert.equal(brreg.mod11Ok('912345674'), false);
  assert.deepEqual(brreg.findOrgs51('REMA 1000\nOrg.nr NO 911 015 838 MVA').map((c) => c.org_number), [ORG]);
  assert.equal(brreg.findOrgs51('Foretaksregisteret NO 9l1O15838 MVA')[0].org_number, ORG, 'l→1, O→0');
  assert.equal(brreg.findOrgs51('Org.nr:\n911.015.838')[0].org_number, ORG);
  assert.equal(brreg.findOrgs51('911 015 838 MVA')[0].score, 2);
  assert.deepEqual(brreg.findOrgs51('Org.nr 912 345 674'), [], 'ugyldig mod11 forkastes');
  assert.equal(brreg.displayName51('REMA 1000 GRÜNERLØKKA AS'), 'REMA 1000 Grünerløkka');
  assert.equal(brreg.displayName51('Kaffebrenneriet AS'), 'Kaffebrenneriet');
  const rows = []; const p = brreg.csvParser51((r) => rows.push(r));
  p.push('a,"b, ""c"""\n1,"to\nlinjer"'); p.end();
  assert.deepEqual(rows, [['a', 'b, "c"'], ['1', 'to\nlinjer']]);
});

test('Enhetsregisteret: ukentlig bulk-nedlasting (gzip + ren CSV, komma/semikolon) → lokal kopi med bare aktive enheter; oppslag er lokale', async () => {
  calls.length = 0;
  const r = await brreg.updateBrreg51({ log: () => {} });
  assert.equal(r.count, 2);
  assert.deepEqual(calls.filter((c) => c.host === 'data.brreg.no').map((c) => c.path), ['/enhetsregisteret/api/underenheter/lastned/csv', '/enhetsregisteret/api/enheter/lastned/csv']);
  const hit = brreg.brregLookup51(ORG);
  assert.deepEqual([hit.name, hit.display_name, hit.kind], ['REMA 1000 GRÜNERLØKKA AS', 'REMA 1000 Grünerløkka', 'enhet']);
  assert.match(hit.address, /Thorvald Meyers gate 1, 0555 OSLO/);
  assert.equal(brreg.brregLookup51('923609016'), null, 'konkurs er ikke aktiv');
  assert.equal(brreg.brregLookup51('912345670').display_name, 'Kaffebaren Filial');
  const st = brreg.brregStatus51();
  assert.equal(st.count, 2);
  assert.ok(st.updated && st.next && !st.running);
  calls.length = 0;
  const s = await A('/finans/api/receipts/brreg');
  assert.equal(s.body.count, 2);
  assert.equal((await A(`/finans/api/receipts/brreg/${ORG}`)).body.display_name, 'REMA 1000 Grünerløkka');
  assert.equal((await K('/finans/api/receipts/brreg/update', 'POST')).status, 403, 'bare admin starter nedlastingen');
  assert.equal(calls.filter((c) => c.host === 'data.brreg.no').length, 0, 'oppslag går aldri på nett');
});

/* ---------------- Forbehandling ---------------- */

const hasConvert = (() => { try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
test('forbehandling: perspektiv rettes og beskjæres, lengste side aldri under 2000 px (ImageMagick)', { skip: !hasConvert && 'ImageMagick mangler' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p51pre-'));
  const f = join(dir, 'skjev.jpg');
  execFileSync('convert', ['-size', '1500x2000', 'xc:#3a3a3a', '-fill', 'white', '-draw', 'polygon 300,200 1150,260 1250,1850 220,1780', '-fill', 'black', '-pointsize', '40', '-draw', "text 400,400 'REMA 1000'", f]);
  const { readFileSync } = await import('node:fs');
  const r = await pre.preprocess51(readFileSync(f), 'image/jpeg', { tools: { magick: 'convert' } });
  assert.ok(r, 'forbehandlingen ga et bilde');
  assert.equal(r.preprocess.perspective, true);
  assert.equal(r.preprocess.cropped, true);
  assert.ok(Math.max(...r.size) >= 2000, `lengste side ${r.size}`);
  const g = join(dir, 'liten.jpg');
  execFileSync('convert', ['-size', '600x800', 'xc:white', g]);
  const s = await pre.preprocess51(readFileSync(g), 'image/jpeg', { tools: { magick: 'convert' } });
  assert.equal(s.preprocess.upscaled, true);
  assert.equal(Math.max(...s.size), 2000);
});

test('findDocument51: lyst ark på mørk bakgrunn → firkant; helt hvitt bilde → null', () => {
  const w = 100, h = 120, px = new Uint8Array(w * h).fill(40);
  for (let y = 20; y < 100; y++) for (let x = 25; x < 80; x++) px[y * w + x] = 230;
  const d = pre.findDocument51({ w, h, px });
  assert.deepEqual(d.quad, [[25, 20], [79, 20], [79, 99], [25, 99]]);
  assert.equal(pre.findDocument51({ w, h, px: new Uint8Array(w * h).fill(250) }), null);
  assert.equal(pre.parsePgm51(Buffer.concat([Buffer.from('P5\n2 1\n255\n'), Buffer.from([1, 2])])).px.length, 2);
});

/* ---------------- Kjeden: original, Mac-status, butikknavn, rådata ---------------- */

let firstId;
test('scan: Tesseract leser ORIGINALEN (ikke 1600 px-kopien), Mac-OCR som ikke svarer feiler raskt og huskes; butikk fra org.nr.; ocr_raw lagres', async () => {
  setup();
  const t0 = Date.now();
  const r = await A('/finans/api/receipts/scan', 'POST', scanForm());
  assert.equal(r.status, 201, r.text);
  assert.ok(Date.now() - t0 < 6000, `Mac-OCR som henger skal ikke gi 30 s venting (${Date.now() - t0} ms)`);
  const c = r.body.pipeline.find((p) => p.step === 'C');
  assert.equal(c.status, 'unavailable');
  assert.match(c.error, /svarte ikke innen 1\.5 s/);
  assert.equal(r.body.used, 'T');
  assert.equal(tessSeen[0].size, BIG.length, 'Tesseract fikk originalen');
  assert.equal(r.body.merchant_source, 'orgnr');
  assert.equal(r.body.merchant_label, 'fra org.nr.');
  assert.equal(r.body.org_number, ORG);
  assert.equal(r.body.receipt.merchant, 'REMA 1000 Grünerløkka');
  const t = r.body.pipeline.find((p) => p.step === 'T');
  assert.equal(t.num_ctx, 16384, 'kontekstvinduet sendes eksplisitt');
  const llmCall = calls.find((x) => x.path === '/api/chat' && /Rader:/.test(x.body?.messages?.at(-1)?.content ?? ''));
  assert.equal(llmCall.body.model, 'qwen3:8b');
  assert.equal(llmCall.body.options.num_ctx, 16384);
  assert.ok(!llmCall.body.messages.some((m) => m.images), 'tekstmodellen får aldri bildet');
  const s = r.body.stored;
  assert.equal(s.ocr_raw.engine, 'tesseract');
  assert.equal(s.ocr_raw.engine_label, 'Tesseract');
  assert.deepEqual(s.ocr_raw.rows, ROWS);
  assert.deepEqual(s.ocr_raw.image_size, [2000, 3000]);
  assert.equal(s.merchant_source, 'orgnr');
  firstId = r.body.receipt_id;
  const d = await A(`/finans/api/receipts/${firstId}`);
  assert.equal(d.body.ocr_raw.rows.length, ROWS.length);
  // Neste skann: Mac-OCR er husket som nede – ingen nye kall dit.
  const n = calls.filter((x) => x.host === 'mac.test:8765').length;
  const again = await A('/finans/api/receipts/scan', 'POST', scanForm());
  assert.equal(calls.filter((x) => x.host === 'mac.test:8765').length, n);
  assert.match(again.body.pipeline.find((p) => p.step === 'C').reason, /utilgjengelig/);
  const h = await A('/finans/api/receipts/health');
  assert.ok(h.body.macOcr.down_until, 'helse viser at Mac-OCR er nede');
  assert.equal(h.body.brreg.count, 2);
  assert.equal(h.body.preprocess.min_px, 2000);
  assert.ok(!h.text.includes(MAC_KEY));
  assert.equal(calls.filter((x) => x.host === 'data.brreg.no' || x.host.includes('googleapis')).length, 0, 'ingen eksterne kall per kvittering');
});

test('lange kvitteringer: num_ctx 32768, og radene kortes inn heller enn at systemteksten kuttes', async () => {
  setup({ macOcr: false });
  fakeTess(Array.from({ length: 400 }, (_, i) => `VARE NUMMER ${i} MED EN LANG BESKRIVELSE SOM TAR PLASS ${i},00`.padEnd(290, ' X')));
  const r = await A('/finans/api/receipts/scan', 'POST', scanForm());
  const t = r.body.pipeline.find((p) => p.step === 'T');
  assert.equal(t.num_ctx, 32768, JSON.stringify(t));
  assert.ok(t.rows_sent < 400 && t.rows_sent > 20, `${t.rows_sent}`);
  assert.ok(t.prompt_tokens_est + 4096 <= 32768 * 0.9, `${t.prompt_tokens_est}`);
  const llmCall = calls.find((x) => x.path === '/api/chat' && /Rader:/.test(x.body?.messages?.at(-1)?.content ?? ''));
  assert.match(llmCall.body.messages[0].content, /^Du gjør OCR-teksten/, 'systemteksten er med');
});

test('læring: rettet navn (POST …/merchant og PATCH) → org.nr. → visningsnavn per bruker; neste kvittering bruker det', async () => {
  setup({ macOcr: false });
  const m = await A(`/finans/api/receipts/${firstId}/merchant`, 'POST', { merchant: 'Rema Grünerløkka' });
  assert.equal(m.status, 200, m.text);
  assert.deepEqual([m.body.learned, m.body.org_number, m.body.receipt.merchant, m.body.receipt.merchant_source, m.body.receipt.merchant_label], [true, ORG, 'Rema Grünerløkka', 'user', 'rettet av deg']);
  const r = await A('/finans/api/receipts/scan', 'POST', scanForm());
  assert.equal(r.body.receipt.merchant, 'Rema Grünerløkka');
  assert.equal(r.body.merchant_source, 'orgnr');
  // PATCH fra skjemaet lærer også.
  const p = await A(`/finans/api/receipts/${r.body.receipt_id}`, 'PATCH', { merchant: 'REMA Grüner' });
  assert.equal(p.body.merchant_source, 'user');
  assert.equal(brreg.learnedName51(fdb.db.prepare('SELECT user_id FROM fh_receipts WHERE id=?').get(firstId).user_id, ORG), 'REMA Grüner');
  // Kari har ikke lært noe: hun får registerets navn.
  const k = await K('/finans/api/receipts/scan', 'POST', scanForm());
  assert.equal(k.body.receipt.merchant, 'REMA 1000 Grünerløkka');
  assert.equal((await K(`/finans/api/receipts/${firstId}/merchant`, 'POST', { merchant: 'x' })).status, 404, 'andres kvittering');
});

test('rekkefølgen: org.nr. → kjent butikk (bokført, samme org.nr. eller tekst øverst) → modellens forslag', async () => {
  const u = fdb.db.prepare('SELECT user_id FROM fh_receipts WHERE id=?').get(firstId).user_id;
  const unknownOrg = '974760673'; // gyldig, men ikke i den lokale kopien (slettet)
  const model = brreg.resolveMerchant51({ user: u, receipt: { merchant: 'Modellbutikken' }, ocrText: 'MODELLBUTIKKEN\nTOTAL 10,00' });
  assert.deepEqual([model.merchant, model.merchant_source], ['Modellbutikken', 'model']);
  fdb.db.prepare("UPDATE fh_receipts SET status='booked', merchant='Hjørnebutikken Lille', extraction=json_set(extraction, '$.org_number', ?) WHERE id=?").run(unknownOrg, firstId);
  const known = brreg.resolveMerchant51({ user: u, receipt: { merchant: 'Hjornebutikk' }, ocrText: `HJØRNEBUTIKKEN\nOrg.nr ${unknownOrg}` });
  assert.deepEqual([known.merchant, known.merchant_source, known.detail], ['Hjørnebutikken Lille', 'known', 'previous']);
  const byText = brreg.resolveMerchant51({ user: u, receipt: { merchant: 'H. Lille' }, ocrText: 'Velkommen til\nHJØRNEBUTIKKEN LILLE\nTOTAL 10,00' });
  assert.deepEqual([byText.merchant, byText.merchant_source, byText.detail], ['Hjørnebutikken Lille', 'known', 'text']);
  const org = brreg.resolveMerchant51({ user: 'ingen', receipt: { merchant: 'Feil navn' }, ocrText: `Org.nr ${ORG}` });
  assert.deepEqual([org.merchant, org.merchant_source], ['REMA 1000 Grünerløkka', 'orgnr']);
  // Modellens org.nr. teller bare når sifrene står i OCR-teksten.
  assert.equal(brreg.resolveMerchant51({ user: 'ingen', receipt: { merchant: 'X', org_number: ORG }, ocrText: 'X\nTOTAL 1,00' }).merchant_source, 'model');
});

test('B6, den gamle kjeden: visjonsmodellens total kontrolleres mot Tesseract på originalen; avvik → til gjennomgang; rådata lagres', async () => {
  setup();
  const r = await A('/finans/api/receipts/scan', 'POST', scanForm());
  const id = r.body.receipt_id;
  fdb.db.prepare('UPDATE fh_receipts SET ocr48=NULL WHERE id=?').run(id);
  const logs = [];
  const res = { provider: 'ollama', model: 'qwen2.5vl:7b', data: { merchant: 'REMA', total: 99.9, org_number: null, confidence: { merchant: 0.9, date: 0.9, total: 0.95 }, lines: [] } };
  await ocrRaw.crossCheck51(res, { id, user: 'p51-annen', original: { buf: BIG, mime: 'image/jpeg' }, log: (s, d) => logs.push(`${s}: ${d}`) });
  assert.equal(res.data.ocr51.check, 'disagree');
  assert.equal(res.data.needs_review, true);
  assert.ok(res.data.confidence.total <= 0.4);
  assert.equal(res.data.merchant, 'REMA 1000 Grünerløkka');
  assert.equal(res.data.merchant51.source, 'orgnr');
  assert.equal(tessSeen.at(-1).size, BIG.length);
  const row = fdb.db.prepare('SELECT * FROM fh_receipts WHERE id=?').get(id);
  assert.equal(ocrRaw.ocrRaw51(row).engine, 'tesseract');
  const ok = { provider: 'ollama', model: 'qwen2.5vl:7b', data: { merchant: 'REMA', total: 56.4, confidence: { total: 0.9 }, lines: [] } };
  await ocrRaw.crossCheck51(ok, { id, user: 'owner', original: { buf: BIG, mime: 'image/jpeg' } });
  assert.equal(ok.data.ocr51.check, 'agree');
  // Uten OCR: aldri høy sikkerhet på visjonsmodellen alene.
  tess._setTesseract48({ tools: async () => ({ tesseract: null }) });
  const alone = { provider: 'ollama', model: 'qwen2.5vl:7b', data: { merchant: 'REMA', total: 56.4, confidence: { total: 0.95 }, lines: [] } };
  const { ocrTools, _setTools } = await import('../server/ocr-fallback.js');
  void ocrTools; _setTools({ tesseract: null });
  await ocrRaw.crossCheck51(alone, { id: null, user: 'owner', original: { buf: BIG, mime: 'image/jpeg' } });
  assert.equal(alone.data.ocr51.check, 'no_ocr');
  assert.equal(alone.data.needs_review, true);
  assert.ok(alone.data.confidence.total <= 0.5);
});

test('B6: Gemini får aldri bildet når «Finansdata forlater aldri huset» er på', async () => {
  setup({ finLocal: true, macOcr: false });
  fdb.setSecret('geminiKey', 'AIza-test-key-aaaaaaaaaaaaaaaaaaaa');
  tess._setTesseract48({ tools: async () => ({ tesseract: null }) });
  const r = await A('/finans/api/receipts/scan', 'POST', scanForm());
  assert.ok(!r.body.pipeline.some((p) => p.step === 'D'), 'prompt 52: Gemini-steget finnes ikke');
  assert.equal(calls.filter((x) => x.host.includes('googleapis')).length, 0);
  fdb.setSecret('geminiKey', '');
});

/* ---------------- Glimt-chatten ---------------- */

const upload = async (buf) => { const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'image/jpeg' }), 'bilde.jpg'); return (await A('/api/chat/files', 'POST', fd)).body.id; };
const send = (content, id, model = 'qwen3:8b') => A('/api/chat/send', 'POST', { model, messages: [{ role: 'user', content, attachments: [id] }] });
const chatCalls = () => calls.filter((x) => x.path === '/api/chat' && !/Rader:/.test(x.body?.messages?.at(-1)?.content ?? ''));

test('chat: modellisten – vision fra /api/show, også for Ollama-modeller via Open WebUI (Open WebUI sier vision:true for alle)', async () => {
  chat50._resetCaps50(); chat._setChatFetch(fake);
  process.env.OPENWEBUI_URL = 'http://owui.test:8080'; process.env.OPENWEBUI_KEY = 'owui-key-test';
  net.owui = [{ id: 'qwen3:8b', name: 'qwen3:8b', owned_by: 'ollama', ollama: { size: 5e9 }, info: { meta: { capabilities: { vision: true } } } },
    { id: 'qwen2.5vl:7b', name: 'qwen2.5vl:7b', owned_by: 'ollama', ollama: { size: 6e9 }, info: { meta: { capabilities: { vision: true } } } }];
  try {
    const r = await A('/api/chat/models');
    const list = r.body.models ?? r.body;
    const byId = Object.fromEntries(list.map((m) => [m.id, m]));
    assert.equal(byId['qwen3:8b'].vision, false, 'qwen3:8b ser ikke bilder');
    assert.equal(byId['qwen2.5vl:7b'].vision, true);
    assert.ok(calls.some((x) => x.path === '/api/show' && (x.body?.model ?? x.body?.name) === 'qwen3:8b'));
  } finally { delete process.env.OPENWEBUI_URL; delete process.env.OPENWEBUI_KEY; chat._setChatFetch(fake); }
});

test('chat: qwen3:8b + vanlig foto → qwen2.5vl beskriver det (ingen 400), veien vises', async () => {
  setup({ macOcr: false }); chat50._resetCaps50(); chat._setChatFetch(fake);
  fakeTess(['~ .', 'ii']); // nesten ingen tekst i bildet
  const id = await upload(jpeg(3000, 2000, 4000));
  const r = await send('Hva er dette?', id);
  const ev = sse(r.text);
  assert.ok(!ev.some((e) => e.event === 'error'), r.text);
  const done = ev.find((e) => e.event === 'done').data;
  assert.equal(done.readWith.route, 'vision');
  assert.equal(done.readWith.model, 'qwen2.5vl:7b');
  assert.match(done.readWith.label, /qwen2\.5vl:7b fordi qwen3:8b ikke kan se bilder/);
  assert.ok(!chatCalls().some((x) => x.body.model === 'qwen3:8b' && x.body.messages.some((m) => m.images)), 'qwen3:8b fikk aldri bildet');
  assert.ok(chatCalls().some((x) => x.body.model === 'qwen2.5vl:7b' && x.body.messages.at(-1).images?.length));
});

test('chat: kvitteringsbilde → kvitteringskjeden, tabell med varelinjer og total; JSON når brukeren ber om det', async () => {
  setup({ macOcr: false }); chat50._resetCaps50(); chat._setChatFetch(fake);
  const id = await upload(jpeg(3000, 2000, 4000));
  const r = await send('Les kvitteringen og lag en tabell', id);
  const ev = sse(r.text);
  const text = ev.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.match(text, /\| Vare \| Antall \| Pris \|/);
  assert.match(text, /\| MELK 1L \| 1 \| 21,90 kr \|/);
  assert.match(text, /\| BRØD \| 1 \| 34,50 kr \|/);
  assert.match(text, /\*\*Totalt\*\* \|  \| \*\*56,40 kr\*\*/);
  const done = ev.find((e) => e.event === 'done').data;
  assert.equal(done.readWith.route, 'receipt');
  assert.equal(done.receipt.merchant_source, 'orgnr');
  assert.ok(!calls.some((x) => x.path === '/api/chat' && x.body?.messages?.some((m) => m.images)), 'ingen modell fikk bildet');
  const j = await send('Les kvitteringen og gi meg json', id);
  assert.match(sse(j.text).filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), /```json[\s\S]*"total": 56\.4/);
});

test('chat: faktura → OCR-rader til qwen3:8b (uten bildet), formatert som brukeren ba om', async () => {
  setup({ macOcr: false }); chat50._resetCaps50(); chat._setChatFetch(fake);
  fakeTess(['FAKTURA', 'Elvia AS', 'Strøm oktober 1 250,00', 'Forfall 01.11.2026', 'Å betale 1 250,00']);
  const id = await upload(jpeg(3000, 2000, 4000));
  const r = await send('Les fakturaen og sett det opp i en tabell', id, 'qwen2.5vl:7b');
  const done = sse(r.text).find((e) => e.event === 'done').data;
  assert.equal(done.readWith.route, 'document');
  assert.equal(done.readWith.model, 'qwen3:8b');
  assert.equal(done.readWith.ocr_engine, 'tesseract');
  const c = chatCalls().at(-1);
  assert.equal(c.body.model, 'qwen3:8b');
  assert.ok(!c.body.messages.some((m) => m.images));
  assert.match(c.body.messages.at(-1).content, /Tekst fra bildet, lest med OCR \(Tesseract\), 5 rader[\s\S]*Strøm oktober 1 250,00/);
});

test('chat: bilde mens qwen3:8b er valgt og bufret som «vision» (feil) → 400 fanges, vei byttes, aldri rå Ollama-feil', async () => {
  setup({ macOcr: false }); chat50._resetCaps50(); chat._setChatFetch(fake);
  fakeTess(['~']);
  const { db } = await import('../server/db.js');
  const now = Date.now();
  db.prepare('INSERT OR REPLACE INTO chat_model_caps50(model, base, vision, caps, checked) VALUES(?,?,1,?,?)').run('qwen3:8b', 'http://ollama.test:11434', '["vision"]', now);
  chat._setChatFetch(fake);
  const id = await upload(jpeg(3000, 2000, 4000));
  const r = await send('Se her', id);
  const ev = sse(r.text);
  assert.ok(!ev.some((e) => e.event === 'error'), r.text);
  assert.ok(!r.text.includes('Ollama svarte 400') && !r.text.includes('Multimodal'), 'ingen rå feil');
  const done = ev.find((e) => e.event === 'done').data;
  assert.equal(done.readWith.route, 'vision');
  assert.equal(done.readWith.switched, true);
  assert.equal(db.prepare('SELECT vision FROM chat_model_caps50 WHERE model=?').get('qwen3:8b').vision, 0, 'evnen er rettet');
  // Uten visjonsmodell og uten tekst i bildet: norsk feiltekst, ingen 400.
  net.tags = ['qwen3:8b']; VISION.delete('qwen2.5vl:7b');
  db.prepare('UPDATE chat_model_caps50 SET vision=1 WHERE model=?').run('qwen3:8b');
  tess._setTesseract48({ tools: async () => ({ tesseract: null }) });
  chat._setChatFetch(fake);
  const id2 = await upload(jpeg(3000, 2000, 4000));
  const r2 = await send('Se her', id2);
  assert.ok(!r2.text.includes('Ollama svarte 400') && !r2.text.includes('Multimodal data'), r2.text);
  net.tags = ['qwen3:8b', 'qwen2.5vl:7b']; VISION.add('qwen2.5vl:7b');
});

test('friendlyError51 og intensjon: norske feiltekster, dokument/foto fra teksten', () => {
  assert.doesNotMatch(c51.friendlyError51('Ollama svarte 400: Multimodal data provided, but model does not support multimodal requests'), /Ollama|Multimodal/);
  assert.match(c51.friendlyError51('Ollama svarte 404: model "x" not found, try pulling it first'), /ikke installert/);
  assert.match(c51.friendlyError51('Ollama svarte 500: CUDA out of memory'), /minne/);
  assert.equal(c51.friendlyError51('Ollama svarte ikke innen tidsfristen'), 'Ollama svarte ikke innen tidsfristen');
  assert.equal(c51.imageIntent51('Kan du lese vitnemålet mitt?'), 'document');
  assert.equal(c51.imageIntent51('Hvilken plante er dette?'), 'photo');
  assert.equal(c51.imageIntent51('Se her'), null);
  assert.equal(c51.wantedFormat51('lag en punktliste'), 'list');
  assert.equal(c51.looksLikeDocument51({ rows: ['~', 'ii'] }), false);
});
