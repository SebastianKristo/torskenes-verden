// Prompt 27 (SERVER-B): logo-oppslag uten at AI gjetter. merchant_logos → rydd navnet → Brreg → Gemini (bare navn + land)
// → gjett domene (200 + <title>) → ikon → klipp fra kvitteringen → ingen treff. Alt nett er mocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p27b-logo-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p27b-logofiles-')); // tomt bibliotek: kjente kjeder må hentes fra domenet
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.GEMINI_API_KEY = 'gemini-test-key';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// PNG med gitt størrelse (IHDR) + fyll, nok til at koden godtar den som bilde.
const png = (px) => { const b = Buffer.alloc(300); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(px, 16); b.writeUInt32BE(px, 20); return b; };
const html = (title, head = '') => `<!doctype html><html><head><title>${title}</title>${head}</head><body></body></html>`;
const SITES = {
  'https://blomsterlandet.no/': html('Blomsterlandet – Norges største blomsterkjede', '<link rel="icon" href="/favicon-16.png" sizes="16x16"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">'),
  'https://hageglede.no/': html('Hageglede hagesenter', '<link rel="icon" type="image/png" sizes="192x192" href="https://cdn.hageglede.no/i192.png">'),
  'https://kiwi.no/': html('KIWI', '<meta property="og:image" content="/og.png">'),
  'https://fjellbua.no/': html('Domene til salgs'),
  'https://plantasjen.no/': html('Plantasjen', '<link rel="apple-touch-icon" href="/a.png">'),
};
const IMAGES = { 'https://blomsterlandet.no/apple-touch-icon.png': png(180), 'https://cdn.hageglede.no/i192.png': png(192), 'https://kiwi.no/og.png': png(256), 'https://plantasjen.no/a.png': png(180), 'https://blomsterlandet.no/favicon-16.png': png(16) };
const calls = [];
const gemini = { answer: '{"domene":"hageglede.no","sikkerhet":0.9}' };
async function mockFetch(url, init = {}) {
  const u = String(url);
  calls.push({ url: u, init });
  if (u.startsWith('https://data.brreg.no/enhetsregisteret/api/enheter?navn=')) {
    const navn = decodeURIComponent(u.match(/navn=([^&]+)/)[1]).toLowerCase();
    const list = navn === 'blomsterlandet' ? [{ navn: 'BLOMSTERLANDET AS', hjemmeside: 'www.blomsterlandet.no' }, { navn: 'BLOMSTERLANDET SKI AS' }] : [];
    return Response.json({ _embedded: { enheter: list } });
  }
  if (u.startsWith('https://data.brreg.no/')) return new Response('{}', { status: 404 });
  if (u.startsWith('https://generativelanguage.googleapis.com/')) return Response.json({ candidates: [{ content: { parts: [{ text: `Her er svaret: ${gemini.answer}` }] }, groundingMetadata: {} }] });
  if (SITES[u]) return new Response(SITES[u], { status: 200, headers: { 'content-type': 'text/html' } });
  if (IMAGES[u]) return new Response(IMAGES[u], { status: 200, headers: { 'content-type': 'image/png' } });
  if (u.startsWith('https://www.google.com/s2/favicons')) return new Response('nei', { status: 404 });
  if (u.startsWith('https://')) return new Response('ikke funnet', { status: 404 });
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = mockFetch; // geminiFetch bruker global fetch
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const L = await import('../server/finans/logo-lookup.js');
L._setLogoFetch(mockFetch);
const { db } = await import('../server/db.js');
const { setUserCfg } = await import('../server/settings.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { cookie, ...(body && !isForm ? { 'content-type': 'application/json' } : {}) }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* bilde */ }
  return { status: r.status, body: json, text, headers: r.headers };
};
const S = client(await login('sebastian', 'testpassord1'));
assert.equal((await S('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client(await login('kari', 'kariPassord123'));
const kariId = (await K('/api/me')).body?.id ?? (await K('/api/me')).body?.user?.id;
const geminiCalls = () => calls.filter((c) => c.url.startsWith('https://generativelanguage.googleapis.com/'));

test('rydd navnet uten AI (kjente kjeder, AS, org.nr., kortnr., butikknummer, sted)', () => {
  const n = (s) => L.cleanName(s).name;
  assert.equal(n('BLOMSTERLANDET SKI AS'), 'Blomsterlandet');
  assert.equal(n('BLOMSTERLANDET SKI AS 9812'), 'Blomsterlandet');
  assert.equal(n('PLANTASJEN LAMBERTSETER'), 'Plantasjen');
  assert.equal(n('KIWI 123 PILESTREDET'), 'Kiwi');
  assert.equal(n('VINMONOPOLET MAJORSTUEN'), 'Vinmonopolet');
  assert.equal(n('CIRCLE K LADING'), 'Circle K');
  assert.equal(n('VIPPS*REMA 1000 MAJORSTUEN'), 'Rema 1000');
  assert.equal(n('HAGEGLEDE SANDVIKA AS NO 981 234 567 MVA ****1234'), 'Hageglede');
  assert.equal(L.cleanName('Blomsterlandet Ski').key, 'blomsterlandet');
  assert.equal(L.slug('Elkjøp Bærum'), 'elkjop-baerum');
});

test('BLOMSTERLANDET SKI AS → Brreg → blomsterlandet.no → apple-touch-icon (lagret lokalt, uten Gemini)', async () => {
  calls.length = 0;
  const r = await S('/finans/api/merchants/logo', 'POST', { name: 'BLOMSTERLANDET SKI AS' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.domain, 'blomsterlandet.no');
  assert.equal(r.body.source, 'brreg');
  assert.match(r.body.logoUrl, /^\/finans\/api\/merchants\/logo\/file\/blomsterlandet\.png\?v=\d+$/);
  assert.ok(calls.some((c) => c.url === 'https://blomsterlandet.no/apple-touch-icon.png'), 'apple-touch-icon hentet');
  assert.equal(geminiCalls().length, 0, 'Gemini brukes ikke når Brreg gir svaret');
  // Filen vises uten innlogging (som /logo/:domain), og ikke-filnavn avvises.
  const img = await app.request(r.body.logoUrl.split('?')[0]);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await app.request('/finans/api/merchants/logo/file/..%2Fhomelab.db')).status, 404);
  // Ett oppslag per kjede: en annen butikk i kjeden bruker samme rad uten nettkall.
  calls.length = 0;
  const again = await S('/finans/api/merchants/logo', 'POST', { name: 'Blomsterlandet Lillestrøm' });
  assert.equal(again.body.domain, 'blomsterlandet.no');
  assert.equal(calls.length, 0, 'cachet i merchant_logos');
  const row = db.prepare("SELECT * FROM merchant_logos WHERE key='blomsterlandet' AND user_id='owner'").get();
  assert.equal(row.source, 'brreg');
  assert.ok(readFileSync(join(process.env.DATA_DIR, 'logos', 'blomsterlandet.png')).length > 0);
  // Etter 90 dager sjekkes det på nytt.
  db.prepare("UPDATE merchant_logos SET checked_at=? WHERE key='blomsterlandet'").run(Date.now() - 91 * 86400_000);
  calls.length = 0;
  await S('/finans/api/merchants/logo', 'POST', { name: 'Blomsterlandet' });
  assert.ok(calls.length > 0);
});

test('kjente kjeder: PLANTASJEN, KIWI 123 PILESTREDET, VINMONOPOLET og CIRCLE K får riktig domene', async () => {
  const p = await S('/finans/api/merchants/logo', 'POST', { name: 'PLANTASJEN LAMBERTSETER' });
  assert.deepEqual([p.body.domain, p.body.source], ['plantasjen.no', 'bibliotek']);
  const k = await S('/finans/api/merchants/logo', 'POST', { name: 'KIWI 123 PILESTREDET' });
  assert.equal(k.body.domain, 'kiwi.no');
  assert.ok(calls.some((c) => c.url === 'https://kiwi.no/og.png'), 'og:image når siden mangler ikoner');
  for (const name of ['VINMONOPOLET MAJORSTUEN', 'CIRCLE K LADING']) {
    const r = await S('/finans/api/merchants/logo', 'POST', { name });
    // Sidene finnes ikke i den falske nettverdenen: da blir det ingen treff, men nøkkelen er kjeden.
    assert.equal(r.status, 200);
    assert.equal(r.body.key, L.cleanName(name).key);
  }
});

test('Gemini får BARE {butikk, land} via logoLookup – aldri org.nr., kortnr., beløp, varelinjer eller bilde', async () => {
  calls.length = 0;
  setUserCfg('owner', { logo_gemini: '1' }); // prompt 52: «Finn logo med Gemini» er av som standard – slås på her
  const r = await L.findLogo('HAGEGLEDE SANDVIKA AS NO 981 234 567 MVA ****1234 KVITTERING 549,00', { orgnr: '981234567', u: 'owner', force: true });
  assert.equal(r.domain, 'hageglede.no');
  assert.equal(r.source, 'gemini');
  const g = geminiCalls();
  assert.equal(g.length, 1);
  const body = JSON.parse(g[0].init.body);
  assert.deepEqual(Object.keys(body).sort(), ['contents', 'generationConfig', 'tools']);
  assert.deepEqual(body.tools, [{ google_search: {} }], 'Google Search grounding');
  assert.equal(body.contents.length, 1);
  assert.equal(body.contents[0].parts.length, 1);
  assert.deepEqual(Object.keys(body.contents[0].parts[0]), ['text'], 'bare tekst, ingen bilder');
  const text = body.contents[0].parts[0].text;
  assert.deepEqual(JSON.parse(text.split('\n').at(-1)), { butikk: 'Hageglede', land: 'NO' });
  for (const leak of ['981', '1234', '549', 'Sandvika', 'SANDVIKA', 'MVA', 'KVITTERING']) assert.ok(!g[0].init.body.includes(leak), `«${leak}» skal ikke sendes`);
  assert.doesNotMatch(text, /https?:\/\/|logo-?url/i);
  // Loggen viser nøyaktig hva som ble sendt.
  const log = (await S('/finans/api/ai-audit')).body;
  assert.deepEqual(log[0].fieldsSent, { butikk: 'Hageglede', land: 'NO' });
  assert.equal(log[0].engine, 'gemini');
  assert.equal(log[0].purpose, 'logo');
  assert.deepEqual((await K('/finans/api/ai-audit')).body, [], 'AI-loggen er per bruker');
  // Saneringen i logoLookup: maks 60 tegn, bare bokstaver, tall, mellomrom og &-.
  assert.equal(L.sanitizeLogoName('Ica <script>"x"</script>\n{"orgnr":1}'), 'Ica script x script orgnr 1');
  assert.equal(L.sanitizeLogoName('A'.repeat(100)).length, 60);
  calls.length = 0;
  await L.logoLookup('Hage & Fritid {"belop":549}', 'norge');
  const b2 = JSON.parse(geminiCalls()[0].init.body).contents[0].parts[0].text;
  assert.deepEqual(JSON.parse(b2.split('\n').at(-1)), { butikk: 'Hage & Fritid belop 549', land: 'NO' });
});

test('logoLookup er den eneste veien til Gemini i logo-modulen', () => {
  const src = readFileSync(new URL('../server/finans/logo-lookup.js', import.meta.url), 'utf8');
  assert.equal(src.match(/geminiFetch\(/g).length, 1);
  assert.equal(src.match(/generativelanguage/g).length, 1);
  const fn = src.slice(src.indexOf('export async function logoLookup'), src.indexOf('/* ---------------- Nett'));
  assert.ok(fn.includes('geminiFetch(') && fn.includes('generativelanguage'), 'kallet ligger inne i logoLookup');
  assert.ok(fn.includes('sanitizeLogoName(name)'), 'navnet saneres før det brukes');
  assert.ok(!/image|inline_data|orgnr|lines|amount|card/i.test(fn.replace(/Ikke oppgi logo- eller bilde-URL|Ingen logo-URL, bilder, varelinjer, beløp, org\.nr\. eller kortdata kan sendes herfra/g, '')), 'ingen andre felt i kallet');
});

test('brytere: «Finn logo med Gemini» av hopper rett til gjetting; gjetting krever <title> med navnet', async () => {
  setUserCfg('owner', { logo_gemini: '0' });
  assert.equal((await S('/finans/api/ai-privacy')).body.logo_gemini, false);
  calls.length = 0;
  const r = await L.findLogo('Hageglede', { u: 'owner', force: true });
  assert.equal(geminiCalls().length, 0);
  assert.equal(r.domain, 'hageglede.no');
  assert.equal(r.source, 'favicon');
  // fjellbua.no svarer 200, men tittelen inneholder ikke navnet → ingen treff.
  const f = await L.findLogo('Fjellbua', { u: 'owner', force: true });
  assert.equal(f.none, true);
  assert.equal((await S('/finans/api/ai-privacy', 'PATCH', { logo_gemini: true })).body.logo_gemini, true);
  // «Sjekk logoen før den lagres»: Gemini-domenet som ikke svarer brukes ikke.
  gemini.answer = '{"domene":"finnesikke-hage.no","sikkerhet":0.95}';
  const g = await L.findLogo('Fjellhage', { u: 'owner', force: true });
  assert.equal(g.none, true);
  gemini.answer = '{"domene":"hageglede.no","sikkerhet":0.9}';
});

test('Velg logo: manuelt domene eller opplastet bilde vinner alltid; per bruker', async () => {
  const m = await S('/finans/api/merchants/logo/manual', 'POST', { name: 'Fjellbua', domain: 'https://www.fjellbua.no/om' });
  assert.equal(m.status, 200, m.text);
  assert.deepEqual([m.body.domain, m.body.source, m.body.manual], ['fjellbua.no', 'manuell', true]);
  const fd = new FormData();
  fd.append('name', 'Bakeriet Hos Ola');
  fd.append('file', new File([png(128)], 'logo.png', { type: 'image/png' }));
  const up = await S('/finans/api/merchants/logo/manual', 'POST', fd);
  assert.equal(up.status, 200, up.text);
  assert.match(up.body.logoUrl, /^\/finans\/api\/merchants\/logo\/file\/m-[0-9a-f]+\.png/);
  calls.length = 0;
  const again = await S('/finans/api/merchants/logo', 'POST', { name: 'BAKERIET HOS OLA OSLO', force: true });
  assert.equal(again.body.source, 'manuell');
  assert.equal(calls.length, 0);
  // Kari har sin egen tabell.
  const k = await K('/finans/api/merchants/logo', 'POST', { name: 'Bakeriet Hos Ola' });
  assert.notEqual(k.body.source, 'manuell');
  assert.equal(db.prepare('SELECT count(*) n FROM merchant_logos WHERE user_id=?').get(kariId).n >= 1, true);
  const bad = new FormData();
  bad.append('name', 'X'); bad.append('file', new File(['hei'], 'x.txt', { type: 'text/plain' }));
  assert.equal((await S('/finans/api/merchants/logo/manual', 'POST', bad)).status, 400);
});

test('«Prøv med AI» på abonnement og kvittering bruker den nye kjeden', async () => {
  const s = await S('/finans/api/subscriptions', 'POST', { name: 'Hageglede', price: 99, cycle: 'monthly' });
  assert.equal(s.status, 200, s.text);
  const id = s.body.id ?? s.body.subscription?.id;
  const r = await S(`/finans/api/subscriptions/${id}/logo/ai`, 'POST');
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.logoUrl, /^\/finans\/api\/merchants\/logo\/file\/hageglede\.png/);
  assert.equal(r.body.subscription.logoUrl, r.body.logoUrl);
  // Kvittering: org.nr. fra utlesingen brukes mot Brreg; ingen treff → 404 med «Velg logo».
  db.prepare("INSERT INTO fh_receipts(id,status,merchant,extraction,created,user_id) VALUES('rc-p27','needs_review','FJELLBUA AS',?,?, 'owner')").run(JSON.stringify({ merchant: 'FJELLBUA AS', org_number: '999888777', lines: [{ description: 'Kaffe', amount: 45 }] }), Date.now());
  db.prepare("DELETE FROM merchant_logos WHERE key='fjellbua'").run();
  calls.length = 0;
  const rc = await S('/finans/api/receipts/rc-p27/logo/ai', 'POST');
  assert.ok(calls.some((c) => c.url === 'https://data.brreg.no/enhetsregisteret/api/enheter/999888777'), 'org.nr. først');
  assert.equal(rc.status, 404);
  assert.match(rc.body.error, /Velg logo/);
  assert.equal(JSON.parse(geminiCalls()[0]?.init.body ?? '{"contents":[{"parts":[{"text":"{}"}]}]}').contents[0].parts[0].text.includes('999888777'), false);
  assert.equal((await K('/finans/api/receipts/rc-p27/logo/ai', 'POST')).status, 404);
});

test('klipp logoen fra kvitteringen lokalt (Ollama-boks + ImageMagick) når alt annet feiler', async (t) => {
  const { ocrTools } = await import('../server/ocr-fallback.js');
  if (!(await ocrTools()).magick) return t.skip('ImageMagick mangler');
  const { execFileSync } = await import('node:child_process');
  const dir = join(process.env.DATA_DIR, 'receipts');
  mkdirSync(dir, { recursive: true });
  const tl = await ocrTools();
  execFileSync(tl.magick, ['-size', '400x600', 'xc:white', '-fill', 'red', '-draw', 'rectangle 100,20 300,80', join(dir, 'rc2.jpg')]);
  db.prepare("INSERT INTO fh_receipts(id,file,scan,mime,status,merchant,extraction,created,user_id) VALUES('rc-p27b','rc2.jpg','rc2.jpg','image/jpeg','needs_review','SMÅBUTIKKEN TRYSIL',?,?, 'owner')").run(JSON.stringify({ merchant: 'SMÅBUTIKKEN TRYSIL' }), Date.now());
  let sawImage = false;
  L._setLogoOllama(async (img) => { sawImage = img.length > 100; return { funnet: true, x1: 100, y1: 20, x2: 300, y2: 80 }; });
  const before = geminiCalls().length;
  const r = await S('/finans/api/receipts/rc-p27b/logo/ai', 'POST');
  L._setLogoOllama(null);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.source, 'kvittering');
  assert.ok(sawImage, 'bildet går bare til den lokale modellen');
  for (const c of geminiCalls().slice(before)) assert.ok(!c.init.body.includes('/9j/') && !c.init.body.includes('inline_data'), 'bildet sendes aldri til Gemini');
});
