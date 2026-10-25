// Prompt 52 (SRV52): Gemini ut av kvitteringer, Boliger på samme kvitteringsleser, «sist jeg var på X», kalenderkontekst,
// brief-kort per bruker, Glimt-figur per bruker, tankegang i chat, «Nytt i versjon» som punkter og butikklogoer fra lokal cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p52srv-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-52srv';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4641';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const CL = join(process.env.DATA_DIR, 'CHANGELOG.md');
writeFileSync(CL, `# Endringslogg

## [4.47.0] – 25.10.2026 · prompt 52 – kvitteringer lokalt og Glimt-figur per bruker
- **Kvitteringer leses lokalt:** Gemini er tatt helt ut (prompt 52). Kvitteringer leses av telefonen, Mac Vision eller Tesseract og tolkes av en lokal modell. Bildene forlater aldri huset. Boliger bruker samme leser og samme panel som Transaksjoner, så alt ser likt ut overalt. Dette er en lang setning som skal kuttes i den korte teksten.
- **Blekksprut:**
  - Ny Glimt-figur med seks armer.
  - Figuren lagres per bruker (SRV52).
- Glimt forstår «sist jeg var på Jem & Fix».

## [4.46.0] – 24.10.2026 · prompt 51
- Annet.
`);
process.env.CHANGELOG_PATH = CL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const S52 = await import('../server/srv52.js');
const guard = await import('../server/receipts48/cloud-guard52.js');
const fai = await import('../server/finans/ai.js');
const r48s = await import('../server/receipts48/settings.js');
const chain = await import('../server/receipts48/chain.js');
const health = await import('../server/receipts48/health.js');
const gem = await import('../server/receipts48/engines/gemini.js');
const tess = await import('../server/receipts48/engines/tesseract.js');
const C52 = await import('../server/chat52.js');
const W52 = await import('../server/whatsnew52.js');

const ROWS = ['JEM & FIX STORO', 'Org.nr 911 015 838', 'Dato 20.10.2026 17:42', 'MALING 10L 349,00', 'TOTAL 349,00', 'BANKAXEPT 349,00'];
const TSV = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext', '1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t',
  ...ROWS.flatMap((row, li) => row.split(' ').map((w, wi) => `5\t1\t1\t1\t${li + 1}\t${wi + 1}\t${100 + wi * 120}\t${100 + li * 80}\t100\t40\t90\t${w}`))].join('\n');
tess._setTesseract48({ tools: async () => ({ tesseract: 'tesseract 5', magick: null }), run: async () => TSV });

let ipN = 20;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* SSE */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck }, body });
const sse = (text) => text.split(/\n\n+/).filter(Boolean).map((blk) => ({ event: blk.match(/^event: (.+)$/m)?.[1] ?? 'message', data: (() => { const d = blk.match(/^data: (.*)$/m)?.[1]; return d ? JSON.parse(d) : null; })() }));
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
assert.equal((await A('/api/users', 'POST', { username: 'pal', password: 'palPassord12345', role: 'bruker', name: 'Pål' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const P = as(await cookie('pal', 'palPassord12345'));
const sebId = (await A('/api/me')).body.id;
const ingridId = (await I('/api/me')).body.id;
const palId = (await P('/api/me')).body.id;
await A('/finans/api/transactions'); await I('/finans/api/transactions');
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
const daysAgo = (n) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date(Date.now() - n * 86400000));
const addTx = (u, date, kr, merchant) => db.prepare("INSERT INTO fh_transactions(date, amount, description, merchant, source, created, user_id) VALUES(?,?,?,?,'manual',?,?)").run(date, -Math.round(kr * 100), merchant, merchant, Date.now(), u);

/* ---------------- 1. Kvitteringer: bare lokalt ---------------- */

test('kvitteringer: Gemini og Groq er ute av motorrekkefølgen, også når sperren er av', () => {
  assert.deepEqual(fai.receiptEngines48(['gemini', 'groq', 'ollama']).list, ['ollama']);
  assert.deepEqual(fai.receiptEngines48(['gemini']).list, []);
  assert.equal(fai.TASKS.receipts.engine, 'ollama');
  assert.ok(!r48s.R48_STEPS.includes('gemini'));
  assert.ok(!('gemini' in r48s.cleanReceipts48({ gemini: true, tesseract: false })));
  assert.equal(r48s.cleanReceipts48({ gemini: true, tesseract: false }).tesseract, false);
  assert.ok(!Object.values(chain.STEP_NAMES48).some((n) => /gemini/i.test(n)));
});

test('kvitteringer: forsøk på å sende kvitteringsbilde til Gemini stoppes og logges som advarsel', async () => {
  guard._resetCloudGuard52();
  await assert.rejects(() => gem.geminiParse48(Buffer.from('x'), 'image/jpeg', {}), (e) => e.blocked === true && e.cloud52 === true);
  await assert.rejects(() => fai.geminiJson48([{ text: 'x' }], {}), (e) => e.blocked === true);
  const w = guard.cloudReceiptWarnings52();
  assert.ok(w.length >= 2 && w.every((x) => x.provider === 'gemini'));
});

test('kvitteringer: kjeden har ikke lenger steg D, og helsesjekken sier «Lokal AI»', async () => {
  const res = await chain.runChain48({ image: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mime: 'image/jpeg', categories: ['Annet'] });
  assert.ok(!res.pipeline.some((p) => p.step === 'D'), JSON.stringify(res.pipeline.map((p) => p.step)));
  const h = await health.health48({ admin: true, categories: [] });
  assert.equal(h.local_only, true);
  assert.equal(h.source_label, 'Lokal AI');
  assert.equal(h.reading_text, 'Glimt leser lokalt …');
  assert.ok(!('gemini' in h));
  assert.ok(!('gemini' in h.steps));
});

test('kvitteringer: lagrede valg migreres (aiTasks.receipts gemini → ollama, receipts48.gemini fjernes)', () => {
  kv.set(OWNER, 'fh_settings', { ...(kv.get(OWNER, 'fh_settings', {}) ?? {}), aiTasks: { receipts: 'gemini', search: 'groq' }, receipts48: { gemini: true, macOcr: false } });
  const r = S52.migrateReceipts52();
  assert.equal(r.changed, true);
  const st = kv.get(OWNER, 'fh_settings', {});
  assert.equal(st.aiTasks.receipts, 'ollama');
  assert.equal(st.aiTasks.search, 'groq', 'andre oppgaver røres ikke');
  assert.ok(!('gemini' in st.receipts48));
  assert.equal(st.receipts48.macOcr, false);
  assert.equal(S52.migrateReceipts52().changed, false, 'idempotent');
});

test('kvitteringer: «Finn logo med Gemini» (bare butikknavnet) er av som standard', async () => {
  const p = await I('/finans/api/ai-privacy');
  assert.equal(p.status, 200);
  assert.equal(p.body.logo_gemini === false || p.body.logoGemini === false, true);
});

/* ---------------- 2. Boliger på samme kvitteringsleser ---------------- */

test('Boliger: /receipts/scan med home_id gir samme kvittering og en post i boligen', async () => {
  const f = await A('/finans/api/folders', 'POST', { name: 'Strømstad', type: 'Hytte' });
  assert.equal(f.status, 200, f.text);
  const fid = f.body.id ?? f.body.folder?.id;
  assert.ok(fid);
  const fd = new FormData();
  fd.append('image', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 5])], { type: 'image/jpeg' }), 'kvittering.jpg');
  fd.append('home_id', String(fid));
  const r = await A('/finans/api/receipts/scan', 'POST', fd);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.home.id, fid);
  assert.equal(r.body.source_label, 'Lokal AI');
  assert.ok(!r.body.pipeline.some((p) => p.step === 'D'));
  const entry = db.prepare('SELECT * FROM fh_folder_entries WHERE folder_id=? AND receipt_id=?').get(fid, r.body.receipt_id);
  assert.ok(entry, 'posten finnes i boligen');
  assert.equal(r.body.home.expense_id, entry.id);
  // Ingrid er ikke medlem: 404, og ingenting lagres.
  const fd2 = new FormData();
  fd2.append('image', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9])], { type: 'image/jpeg' }), 'k.jpg');
  fd2.append('home_id', String(fid));
  assert.equal((await I('/finans/api/receipts/scan', 'POST', fd2)).status, 404);
  scannedId = r.body.receipt_id;
});

let scannedId = null;
test('«Analyser på nytt»: engine gemini, tom og ukjent leses lokalt – aldri Gemini, og eldre klienter får ikke feil', async () => {
  assert.ok(scannedId);
  let cloud = 0;
  globalThis.fetch = async (u) => { if (/googleapis|groq/.test(String(u))) cloud++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
  for (const body of [{ engine: 'gemini', async: true }, { provider: 'gemini', async: true }, { async: true }, { engine: 'ollama', async: true }, { engine: 'noe-rart', async: true }]) {
    db.prepare("UPDATE fh_receipts SET status='needs_review' WHERE id=?").run(scannedId);
    const r = await A(`/finans/api/receipts/${scannedId}/reanalyze`, 'POST', body);
    assert.equal(r.status, 202, `${JSON.stringify(body)}: ${r.text}`);
    assert.notEqual(r.body.kode, 'gemini_mangler');
    assert.ok(!JSON.stringify(r.body.steps ?? []).includes('Gemini'), JSON.stringify(r.body.steps));
    for (let i = 0; i < 100; i++) { const j = await A(`/finans/api/jobs/${r.body.jobId}`); if (j.body?.status && j.body.status !== 'running') break; await new Promise((res) => setTimeout(res, 20)); }
  }
  // Synkront med engine:'gemini' (eldre klient): aldri 400 «legg inn Gemini-nøkkel».
  db.prepare("UPDATE fh_receipts SET status='needs_review' WHERE id=?").run(scannedId);
  const s = await A(`/finans/api/receipts/${scannedId}/reanalyze`, 'POST', { engine: 'gemini' });
  assert.notEqual(s.body?.kode, 'gemini_mangler', s.text);
  assert.doesNotMatch(s.text, /Gemini-nøkkel/);
  const rr = await A('/finans/api/receipts/' + scannedId);
  assert.equal(rr.body.canReread, true);
  assert.equal(cloud, 0, 'ingen kall til sky-API');
  globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
});

/* ---------------- 3. «Sist jeg var på X» ---------------- */

test('minne bare eksplisitt: «husk at», «Nina er frisøren min» – aldri spørsmål', () => {
  assert.equal(S52.isExplicitMemory52('Nina er frisøren min'), true);
  assert.equal(S52.isExplicitMemory52('husk at Pål har fotball tirsdag'), true);
  assert.equal(S52.isExplicitMemory52('noter at bilen skal på service'), true);
  assert.equal(S52.isExplicitMemory52('Sist jeg var på jem & fix'), false);
  assert.equal(S52.isExplicitMemory52('når var jeg på biltema'), false);
  assert.equal(S52.isExplicitMemory52('Nina er frisøren min?'), false);
  assert.equal(S52.isExplicitMemory52('hva er frisøren min'), false);
});

test('last_visit: tolkning og normalisering av butikknavn', () => {
  assert.deepEqual(S52.parseLastVisit52('Sist jeg var på jem & fix'), { type: 'last_visit', merchant: 'jem & fix' });
  assert.deepEqual(S52.parseLastVisit52('når var jeg på biltema'), { type: 'last_visit', merchant: 'biltema' });
  assert.deepEqual(S52.parseLastVisit52('forrige gang jeg handlet hos ica?'), { type: 'last_visit', merchant: 'ica' });
  assert.equal(S52.parseLastVisit52('Nina er frisøren min'), null);
  for (const s of ['jem & fix', 'Jem og Fix', 'JEM&FIX']) assert.equal(S52.normMerchant52(s), 'jemogfix');
  assert.equal(S52.dlev52('jemogfix', 'jemogfx'), 1);
});

test('last_visit: svar uten LLM med dato, dager siden og beløp (Glimt og Finans-søket)', async () => {
  addTx(sebId, daysAgo(40), 120, 'JEM & FIX STORO');
  addTx(sebId, daysAgo(8), 349, 'Jem & Fix');
  addTx(sebId, daysAgo(3), 99, 'Biltema Alnabru');
  addTx(sebId, daysAgo(2), 250, 'ICA Supermarked');
  addTx(ingridId, daysAgo(1), 999, 'Jem & Fix'); // Ingrids kjøp er hennes egne
  const r = await A('/api/glimt/agent', 'POST', { text: 'Sist jeg var på jem & fix', module: 'home' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.intent, 'last_visit');
  assert.equal(r.body.last_visit.date, daysAgo(8));
  assert.equal(r.body.last_visit.days_ago, 8);
  assert.equal(r.body.last_visit.amount, 349);
  assert.match(r.body.reply, /^Sist du var på \*\*Jem & Fix\*\* var \*\*\p{L}+ \d{1,2}\. \p{L}+\*\* \(8 dager siden\)\. Du handlet for 349,00 kr\.$/u);
  assert.equal(r.body.results.length, 1);
  assert.doesNotMatch(r.text, /Jeg lagrer bare det du faktisk sa/);
  const b = await A('/api/glimt/agent', 'POST', { text: 'når var jeg på biltema', module: 'home' });
  assert.equal(b.body.last_visit.merchant, 'Biltema Alnabru');
  const i = await A('/api/glimt/agent', 'POST', { text: 'forrige gang jeg handlet hos ica?', module: 'home' });
  assert.equal(i.body.last_visit.days_ago, 2);
  const f = await A('/finans/api/search/ask', 'POST', { q: 'Sist jeg var på JEM&FIX' });
  assert.equal(f.status, 200);
  assert.equal(f.body.intent, 'last_visit');
  assert.equal(f.body.last_visit.amount, 349);
  assert.match(f.body.text, /Sist du var på Jem & Fix/);
  const ing = await I('/api/glimt/agent', 'POST', { text: 'Sist jeg var på jem & fix', module: 'home' });
  assert.equal(ing.body.last_visit.amount, 999);
});

test('last_visit: 0 treff gir forslag, aldri minnehjelp', async () => {
  const r = await A('/api/glimt/agent', 'POST', { text: 'sist jeg var på jem fikx storo', module: 'home' });
  assert.equal(r.body.intent, 'last_visit');
  const z = await A('/api/glimt/agent', 'POST', { text: 'sist jeg var på jernia', module: 'home' });
  assert.equal(z.body.results.length, 0);
  assert.match(z.body.reply, /^Fant ingen kjøp på «jernia»\./);
  assert.doesNotMatch(z.body.reply, /lagrer|frisøren/);
  const s = S52.lastVisit52(sebId, 'sist jeg var på jemfiks');
  assert.ok(s.hits > 0 || s.last_visit.suggestions.length > 0);
});

test('minne: eksplisitte minnesetninger går fortsatt til minnet (ikke last_visit)', async () => {
  const r = await A('/api/glimt/agent', 'POST', { text: 'Nina er frisøren min', module: 'home' });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.intent, 'last_visit');
  const h = await A('/api/glimt/agent', 'POST', { text: 'husk at Pål har fotball tirsdag', module: 'home' });
  assert.notEqual(h.body.intent, 'last_visit');
});

/* ---------------- 4. Kalenderkontekst ---------------- */

test('quickparse52: regelparseren retter navn/steder og skiller ut sted', async () => {
  S52._setQuickAi52(() => { throw new Error('nede'); });
  const r = await A('/api/glimt/quickparse52', 'POST', { text: 'jeg skal ha møte med lalila på olvia' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.source, 'rule');
  assert.equal(r.body.result.title, 'Møte med Laila');
  assert.equal(r.body.result.location, 'Olivia');
  assert.equal(r.body.result.date, today);
  assert.equal(r.body.result.type, 'kalender');
  assert.deepEqual(r.body.result.people, ['Laila']);
  assert.equal(r.body.result.date_label, 'i dag');
  assert.ok(r.body.ai_error);
  const k = await A('/api/glimt/quickparse52', 'POST', { text: 'lunsj med kari på egon kl 11:30' });
  assert.equal(k.body.result.title, 'Lunsj med Kari');
  assert.equal(k.body.result.location, 'Egon');
  assert.equal(k.body.result.start, '11:30');
  assert.equal(k.body.result.end, '12:30');
  const i = await A('/api/glimt/quickparse52', 'POST', { text: 'husk at jeg skal på kino med ingird fredag' });
  assert.equal(i.body.result.title, 'Kino med Ingrid');
  assert.equal(i.body.result.type, 'kalender');
});

test('quickparse52: AI-svaret overstyrer regelen; tidsavbrudd → regelresultatet', async () => {
  let prompt = null;
  S52._setQuickAi52((p) => { prompt = p; return { type: 'kalender', title: 'Møte med Laila', date: today, start: '14:00', end: null, location: 'Olivia', people: ['Laila'] }; });
  const r = await A('/api/glimt/quickparse52', 'POST', { text: 'møte m laila olivia kl 14' });
  assert.equal(r.body.source, 'ai');
  assert.equal(r.body.result.start, '14:00');
  assert.equal(r.body.result.end, '15:00');
  assert.match(prompt, /Kjente personer: .*Ingrid/);
  assert.match(prompt, /I dag: \p{L}+ \d{4}-\d{2}-\d{2}, klokka \d{2}:\d{2}/u);
  S52.QUICK_AI_MS52.ms = 150;
  S52._setQuickAi52(() => new Promise(() => {}));
  const t = await A('/api/glimt/quickparse52', 'POST', { text: 'jeg skal ha møte med lalila på olvia' });
  assert.equal(t.body.source, 'rule');
  assert.equal(t.body.timed_out, true);
  assert.equal(t.body.result.title, 'Møte med Laila');
  S52.QUICK_AI_MS52.ms = 5000;
  S52._setQuickAi52(null);
});

test('lex52: rettede ord læres per bruker og brukes av regelparseren', async () => {
  S52._setQuickAi52(() => { throw new Error('nede'); });
  const l = await A('/api/glimt/lex52', 'POST', { from: 'tobbe', to: 'Torbjørn', kind: 'person' });
  assert.equal(l.status, 200);
  assert.equal(l.body.words[0].to, 'Torbjørn');
  const r = await A('/api/glimt/quickparse52', 'POST', { text: 'middag med tobbe i morgen' });
  assert.equal(r.body.result.title, 'Middag med Torbjørn');
  assert.equal((await I('/api/glimt/lex52')).body.words.length, 0, 'per bruker');
  assert.equal((await A(`/api/glimt/lex52/${encodeURIComponent('tobbe')}`, 'DELETE')).body.words.length, 0);
  S52._setQuickAi52(null);
});

/* ---------------- 5. Brief-kort per bruker ---------------- */

test('brief52: admin får alle kortene (unntatt reise uten ruter), vanlig bruker uten Homelab/Domener/Aksjer/Media', async () => {
  const a = await A('/api/brief52');
  assert.equal(a.status, 200, a.text);
  assert.match(a.body.greeting, /Sebastian$/);
  const ids = a.body.cards.map((c) => c.id);
  for (const id of ['focus', 'todo', 'bills', 'clothes', 'tonight', 'homelab', 'domains', 'stocks']) assert.ok(ids.includes(id), `${id} mangler: ${ids}`);
  assert.deepEqual(a.body.cards.map((c) => c.variant), a.body.cards.map((c) => ({ focus: '1b', trip: '3b', todo: '4a', bills: '2a', clothes: '9b', tonight: '5b', homelab: '6a', domains: '7a', stocks: '8b' }[c.id])));
  const i = await I('/api/brief52');
  const iids = i.body.cards.map((c) => c.id);
  for (const id of ['homelab', 'domains', 'stocks', 'tonight']) assert.ok(!iids.includes(id), `${id} skal ikke vises for Ingrid`);
  assert.ok(iids.includes('bills'));
  assert.match(i.body.greeting, /Ingrid$/);
});

test('brief52: barn (admin-innstilling) uten Regninger og Media; tilgang kan gis per kort', async () => {
  assert.equal((await I('/api/admin/brief52/access')).status, 403);
  const put = await A('/api/admin/brief52/access', 'PUT', { children: [palId], domains: [ingridId] });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body.children, [palId]);
  const p = await P('/api/brief52');
  const pids = p.body.cards.map((c) => c.id);
  for (const id of ['bills', 'tonight', 'homelab', 'domains', 'stocks']) assert.ok(!pids.includes(id), `${id} for barn`);
  assert.equal(p.body.user.child, true);
  assert.ok((await I('/api/brief52')).body.cards.some((c) => c.id === 'domains'), 'Ingrid har fått Domener');
  assert.equal((await A('/api/admin/brief52/access', 'PUT', { children: ['finnes-ikke'] })).status, 400);
});

test('brief52: Start er bare for admin', async () => {
  assert.equal((await I('/api/brief52/homelab/abc/start', 'POST', {})).status, 403);
  const r = await A('/api/brief52/homelab/finnes-ikke/start', 'POST', {});
  assert.ok([404, 503].includes(r.status), r.text);
});

/* ---------------- 6. Glimt-figur per bruker ---------------- */

test('glimt_char: Blekksprut finnes, admin setter standard per bruker, eget valg vinner', async () => {
  const s = await I('/api/glimt/settings');
  assert.ok(s.body.chars.some((c) => c.id === 'blekk' && c.name === 'Blekksprut'));
  assert.equal((await I('/api/me')).body.glimt_char, 'glimt');
  assert.equal((await I(`/api/admin/glimt-char52/${palId}`, 'PUT', { default: 'blekk' })).status, 403);
  const d = await A(`/api/admin/glimt-char52/${ingridId}`, 'PUT', { default: 'blekk' });
  assert.equal(d.status, 200, d.text);
  const me = await I('/api/me');
  assert.equal(me.body.glimt_char, 'blekk');
  assert.equal(me.body.glimt_char_source, 'default');
  assert.equal((await I('/api/glimt/settings')).body.char, 'blekk');
  const g = await I('/api/me/glimt-char52');
  assert.equal(g.body.source, 'default');
  assert.equal(g.body.chars.find((c) => c.id === 'blekk').color, '#f1a3ad');
  assert.equal((await I('/api/me/glimt-char52', 'PUT', { char: 'sky' })).body.char, 'sky');
  assert.equal((await I('/api/me')).body.glimt_char_source, 'user');
  assert.equal((await I('/api/me/glimt-char52', 'PUT', { char: 'drage' })).status, 400);
  assert.equal((await A('/api/me')).body.glimt_char, 'glimt', 'per bruker');
  const list = await A('/api/admin/glimt-char52');
  assert.equal(list.body.users.find((u) => u.id === ingridId).default, 'blekk');
});

/* ---------------- 7. Chat: tankegang ---------------- */

test('tankegang: thinkSplit52 og splitThoughts52', () => {
  const t = C52.thinkSplit52();
  const a = t.push('<thi'), b = t.push('nk>Jeg leser spørsmålet.\n\nSå sjekker jeg dataene.</think>Svaret er 42.'), c = t.end();
  assert.equal(a.text + b.text + c.text, 'Svaret er 42.');
  assert.equal(C52.splitThoughts52(a.think + b.think + c.think).length, 2);
  const msgs = C52.stripThink52([{ role: 'assistant', content: '<think>x</think>Hei', think: ['x'], thS: 1 }, { role: 'user', content: 'Hei', attTh: ['data:image/jpeg;base64,AA=='] }]);
  assert.deepEqual(msgs, [{ role: 'assistant', content: 'Hei' }, { role: 'user', content: 'Hei' }]);
});

test('tankegang: Glimts egne steg strømmes, lagres på meldingen og sendes ikke tilbake', async () => {
  const r = await A('/api/chat/send', 'POST', { messages: [{ role: 'user', content: 'Hei, hva kan du?', attTh: ['data:image/jpeg;base64,/9j/AAAA'] }] });
  assert.equal(r.status, 200, r.text);
  const ev = sse(r.text);
  const th = ev.filter((e) => e.event === 'thinking');
  assert.ok(th.length >= 2, r.text.slice(0, 400));
  assert.equal(th[0].data.source, 'glimt');
  assert.match(th[0].data.step, /^Leser spørsmålet/);
  const doneIdx = ev.findIndex((e) => e.event === 'thinking_done'), deltaIdx = ev.findIndex((e) => e.event === 'delta');
  assert.ok(doneIdx >= 0 && doneIdx < deltaIdx, 'tankegangen lukkes før svaret strømmer');
  const done = ev.find((e) => e.event === 'done').data;
  assert.ok(Array.isArray(done.think) && done.think.length === th.length);
  assert.equal(typeof done.thS, 'number');
  assert.equal(done.thinkSource, 'glimt');
  const c = await A(`/api/chat/chats/${done.chatId}`);
  const msgs = c.body.messages;
  const last = msgs.at(-1);
  assert.equal(last.role, 'assistant');
  assert.deepEqual(last.think, done.think);
  assert.equal(last.thS, done.thS);
  assert.deepEqual(msgs[0].attTh, ['data:image/jpeg;base64,/9j/AAAA']);
});

/* ---------------- 8. «Nytt i versjon» ---------------- */

test('whatsnew: strukturerte punkter, renset tittel og dato', async () => {
  const r = await A('/api/whatsnew');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.version, '4.47.0');
  assert.equal(r.body.title, 'Kvitteringer lokalt og Glimt-figur per bruker');
  assert.doesNotMatch(JSON.stringify(r.body.points), /prompt \d+|SRV52/i);
  assert.equal(r.body.date_label, '25. oktober 2026');
  assert.equal(r.body.heading, 'Versjon 4.47.0');
  assert.equal(r.body.points.length, 3);
  assert.equal(r.body.points[0].title, 'Kvitteringer leses lokalt');
  assert.ok(r.body.points[0].text.length <= 230);
  assert.ok(r.body.points[0].more.length > r.body.points[0].text.length);
  assert.equal(r.body.points[1].title, 'Blekksprut');
  assert.match(r.body.points[1].text, /seks armer\. Figuren lagres per bruker\.$/);
  assert.ok(r.body.items.every((x) => !/prompt \d+/i.test(x)));
  assert.equal(W52.cleanTitle52('kvitteringsrettingen og prompt 51 – backup'), 'Kvitteringsrettingen – backup');
});

/* ---------------- 9. Butikklogoer fra lokal cache ---------------- */

test('logos52: batch gir logo fra biblioteket eller forbokstav, uten nettkall', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
  const r = await A('/finans/api/logos52/batch', 'POST', { names: ['REMA 1000 Grünerløkka', 'Jem & Fix', 'Ukjent butikk xyz'] });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.items['REMA 1000 Grünerløkka'].id, 'rema-1000');
  assert.match(r.body.items['REMA 1000 Grünerløkka'].url, /^\/finans\/api\/logos\/file\//);
  assert.equal(r.body.items['Ukjent butikk xyz'].url, null);
  assert.equal(r.body.items['Ukjent butikk xyz'].initial, 'U');
  assert.equal(calls, 0, 'ingen nettkall');
  assert.equal((await A('/finans/api/logos52/batch', 'POST', { names: 'x' })).status, 400);
  assert.equal((await req('/finans/api/logos52/batch', { method: 'POST', body: { names: ['a'] } })).status, 401);
});

/* ---------------- 10. Mer- og saldokortvalg: én fasit for web og appene ---------------- */

test('layout: salSty ⇄ mer45.salsty og pages.mer45* ⇄ mer45.fmerVis/merVis speiles begge veier', async () => {
  // Web lagrer.
  assert.equal((await I('/api/me/layout', 'PUT', { salSty: 'glass', pages: { mer45fin: { order: ['a', 'b', 'c', 'd'], hidden: ['_sok', '_tools'] } } })).status, 200);
  let l = (await I('/api/me/layout')).body;
  assert.equal(l.salSty, 'glass');
  assert.equal(l.mer45.salsty, 'glass');
  assert.deepEqual(l.mer45.fmerVis, { sok: false, tit: true, vkt: false });
  assert.deepEqual(l.mer45.merVis, undefined, 'Homelab-Mer er ikke satt ennå');
  // Appen lagrer (hele mer45-objektet, som iOS/Android).
  const r = await I('/api/me/layout', 'PUT', { mer45: { ...l.mer45, salsty: 'kvitt', merVis: { sok: true, tit: false, vkt: true }, fmerVis: { sok: true, tit: true, vkt: true } } });
  assert.equal(r.status, 200, r.text);
  l = (await I('/api/me/layout')).body;
  assert.equal(l.salSty, 'kvitt');
  assert.deepEqual(l.pages.mer45hl.hidden, ['_title']);
  assert.deepEqual(l.pages.mer45fin.hidden, []);
  assert.deepEqual(l.pages.mer45fin.order, ['a', 'b', 'c', 'd'], 'rekkefølgen beholdes');
  assert.deepEqual(l.mer45.merVis, { sok: true, tit: false, vkt: true });
  // Web igjen: bare salSty → appenes felt følger.
  await I('/api/me/layout', 'PUT', { salSty: 'farge' });
  l = (await I('/api/me/layout')).body;
  assert.equal(l.mer45.salsty, 'farge');
  assert.deepEqual(l.mer45.merVis, { sok: true, tit: false, vkt: true }, 'resten av mer45 beholdes');
  assert.equal((await I('/api/me/layout', 'PUT', { salSty: 'neon' })).status, 400);
  assert.equal((await A('/api/me/layout')).body.salSty, undefined, 'per bruker');
});
