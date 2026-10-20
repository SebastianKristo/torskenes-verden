// Prompt 42 (SERVER42): Felles API – Glimt-søkedatabase (SQL før LLM, tankesteg, SSE), abonnement-hurtigvei, filter, avanserte oppgaver + PDF,
// Boliger web (årsbokser, kategorier, prosjekter med Glimt, kvitteringspanel, søk i bolig), import rett til Boliger, Abonnementer-kalenderen,
// aksje-logoer, Finn-bilder, AliExpress/Cainiao + PostNord-feilsøking, Gjøremål-Glimt del opp, helse fra Home Assistant, homeButton, Vel fremme-alias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p42-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-42s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4221';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
for (const k of Object.keys(process.env)) if (k.startsWith('AI_HOST_') || k.startsWith('AI_GPU_')) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv } = await import('../server/db.js');
const { db: fhDb } = await import('../server/finans/db.js');
const s42 = await import('../server/finans/search42.js');
const gt42 = await import('../server/finans/glimt-tasks42.js');
const h42 = await import('../server/finans/homes42.js');
const f42 = await import('../server/finans/finans42.js');
const finn42 = await import('../server/finans/finn42.js');
const pdf42 = await import('../server/finans/pdf42.js');
const carriers = await import('../server/tracking-carriers.js');
const trk42 = await import('../server/tracking42.js');
const tk42 = await import('../server/tasks-glimt42.js');
const tg41 = await import('../server/tasks-glimt41.js');
const hl42 = await import('../server/health42.js');
const sc42 = await import('../server/subs-cal42.js');

let ipN = 20;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, buf, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${ipN++}` }, body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const sebId = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
const ingridId = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
const today = new Date().toLocaleDateString('sv-SE');
const tok = (await A('/finans/api/tokens', 'POST', { name: 'p42', scopes: ['finance:read'] })).body.token;
const T = as({ authorization: `Bearer ${tok}` });

// Demo-data + noen kvitteringer med varelinjer (tomater på ICA, kaffe, batterier fra Jula).
await A('/finans/api/bootstrap');
const acc = fhDb.prepare('SELECT id FROM fh_accounts WHERE user_id=? ORDER BY id LIMIT 1').pluck().get(sebId);
const cat = (n) => fhDb.prepare('SELECT id FROM fh_categories WHERE user_id=? AND name=?').pluck().get(sebId, n);
const addTx = (date, desc, kr, catName) => fhDb.prepare("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,created,user_id) VALUES(?,?,?,?,?,?,'manual',?,?) RETURNING id").get(acc, date, Math.round(kr * 100), desc, desc, cat(catName), Date.now(), sebId).id;
const addRc = (id, merchant, date, total, lines, txId) => fhDb.prepare("INSERT INTO fh_receipts(id,status,extraction,merchant,date,total,transaction_id,created,user_id,file,mime) VALUES(?,'booked',?,?,?,?,?,?,?,?,?)")
  .run(id, JSON.stringify({ merchant, lines }), merchant, date, Math.round(total * 100), txId, Date.now(), sebId, `${id}.jpg`, 'image/jpeg');
const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toLocaleDateString('sv-SE'); };
const ica = addTx(d(2), 'ICA KVANTUM 1234', -312.4, 'Mat og dagligvarer');
addRc('rc-ica-1', 'ICA KVANTUM 1234', d(2), 312.4, [{ description: 'TOMATER CHERRY 250G', amount: 29.9 }, { description: 'LETTMELK 1,5L', amount: 24.5 }], ica);
const ica2 = addTx(d(9), 'ICA Nær Bislett', -88, 'Mat og dagligvarer');
addRc('rc-ica-2', 'ICA Nær Bislett', d(9), 88, [{ description: 'Plommetomater 400g', amount: 34.9 }], ica2);
const kaffe = addTx(d(4), 'Kaffebrenneriet', -129, 'Restaurant og kafé');
addRc('rc-kaffe', 'Kaffebrenneriet', d(4), 129, [{ description: 'Filterkaffe 250g', amount: 129 }], kaffe);
const jula = addTx(d(5), 'Jula', -199, 'Hjem');
addRc('rc-jula', 'Jula', d(5), 199, [{ description: 'Batterier AA 8PK', amount: 99 }, { description: 'Lyspærer LED E27', amount: 100 }], jula);

/* ---------------- 1. Glimt-søkedatabase ---------------- */

test('søkedatabase: search_items + FTS5, normalisering, synonymer, varekategori og butikk-alias', () => {
  assert.equal(s42.norm42('TOMATER CHERRY 250G'), 'tomat cherry');
  assert.equal(s42.stem42('lyspærer'), s42.stem42('lyspære'));
  assert.equal(s42.itemCategory42('TOMATER CHERRY 250G'), 'grønnsaker');
  assert.equal(s42.itemCategory42('Filterkaffe 250g'), 'kaffe');
  assert.ok(s42.synonymsOf42('tomater').includes('cherrytomat'));
  assert.equal(s42.merchantKey42('REMA 1000 Bislett').id, 'rema-1000');
  const n = s42.buildIndex42(sebId);
  assert.ok(n > 10);
  assert.ok(fhDb.prepare("SELECT count(*) FROM search_items WHERE user_id=? AND kind='line'").pluck().get(sebId) >= 6);
  assert.equal(fhDb.prepare("SELECT item_category FROM search_items WHERE ref='rc-ica-1:0'").pluck().get(), 'grønnsaker');
  assert.equal(fhDb.prepare("SELECT count(*) FROM item_synonyms WHERE canon='tomat'").pluck().get() >= 3, true);
  const p = s42.parseQuery42('kvittering til tomater på ica', { u: sebId });
  assert.deepEqual([p.intent, p.itemStem, p.merchant], ['find_receipt', 'tomat', 'ica']);
  assert.deepEqual(s42.weekRange42(50, 6, 2026), { from: '2026-12-07', to: '2027-02-15', label: 'uke 50–6' });
  assert.deepEqual(s42.parseAmount42('mellom 500 og 5 000 kr'), { min: 500, max: 5000 });
});

test('POST /finans/api/search/ask: fem kjente spørsmål < 300 ms, uten LLM, med tankesteg og svarform', async () => {
  s42._llm42.impl = async () => { throw new Error('LLM skal ikke brukes'); };
  try {
    for (const q of ['kvittering til tomater på ica', 'sist jeg kjøpte kaffe', 'hvor mye mat i oktober', 'batterier fra jula', 'lyspærer i år']) {
      s42._clearCache42();
      const t0 = Date.now();
      const r = await A('/finans/api/search/ask', 'POST', { q });
      assert.equal(r.status, 200, r.text);
      assert.ok(Date.now() - t0 < 300, `${q}: ${Date.now() - t0} ms`);
      assert.equal(r.body.engine, 'lokalt', q);
      assert.equal(r.body.path, 'fast', q);
      for (const k of ['text', 'cards', 'hits', 'steps', 'ms']) assert.ok(k in r.body, `${q}: ${k}`);
      assert.ok(r.body.steps.every((s) => typeof s.label === 'string' && typeof s.ms === 'number' && s.done === true));
      assert.equal(r.body.steps[0].label, 'Forstod spørsmålet');
      assert.match(r.body.doneText, /^Glimt tenkte i \d+,\d\d s · lokalt søk$/);
    }
    s42._clearCache42();
    const t = await A('/finans/api/search/ask', 'POST', { q: 'kvittering til tomater på ica' });
    assert.equal(t.body.hits, 2);
    assert.match(t.body.text, /tomater/);
    const card = t.body.cards.find((c) => c.receiptId === 'rc-ica-1');
    assert.match(card.line, /TOMATER CHERRY 250G · 29,9/);
    assert.equal(card.original.label, 'Vis original');
    const b = await A('/finans/api/search/ask', 'POST', { q: 'batterier fra jula' });
    assert.equal(b.body.cards[0].receiptId, 'rc-jula');
    const l = await A('/finans/api/search/ask', 'POST', { q: 'lyspærer i år' });
    assert.ok(l.body.cards.some((c) => c.receiptId === 'rc-jula'));
    const log = (await A('/finans/api/search/log')).body.items;
    assert.ok(log.length >= 5 && log.every((x) => 'parse_ms' in x && 'sql_ms' in x && x.llm_used === false));
  } finally { s42._llm42.impl = null; }
});

test('abonnement-spørsmålene går hurtigveien (< 1 s, path fast), også med token', async () => {
  for (const q of ['har jeg noen abonnementer', 'hvilke abonnementer har jeg?', 'hva betaler jeg hver måned', 'hvor mye bruker jeg på strømmetjenester']) {
    const t0 = Date.now();
    const r = await T('/finans/api/search/ask', 'POST', { q });
    assert.equal(r.status, 200, r.text);
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(r.body.path, 'fast');
    assert.equal(r.body.intent, 'subscriptions');
    assert.match(r.body.text, /^Du har \d+ aktive abonnementer, til sammen .* i måneden\. Dyrest:/);
    assert.equal(r.body.open.label, 'Åpne abonnementer ›');
  }
  // Ingen abonnementer og ingen faste trekk.
  const r = await I('/finans/api/search/ask', 'POST', { q: 'har jeg noen abonnementer' });
  assert.equal(r.status, 200);
});

test('fritekst går til Glimt (LLM) med maks 40 rader; svarer den ikke innen grensen, vises vanlig søk', async () => {
  let rows = null;
  s42._llm42.impl = async (prompt, o) => { rows = o.rows.length; return 'Du bruker mest på mat.'; };
  try {
    s42._clearCache42();
    const r = await A('/finans/api/search/ask', 'POST', { q: 'hva bør jeg kutte ned på?' });
    assert.equal(r.body.engine, 'ollama');
    assert.equal(r.body.path, 'llm');
    assert.equal(r.body.text, 'Du bruker mest på mat.');
    assert.ok(rows > 0 && rows <= 40);
    assert.match(r.body.doneText, /Ollama/);
    s42._llm42.impl = () => new Promise(() => {}); s42._llm42.ms = 60;
    const slow = await A('/finans/api/search/ask', 'POST', { q: 'hva burde jeg spare penger på' });
    assert.equal(slow.body.engine, 'lokalt');
    assert.equal(slow.body.llmPending, true);
  } finally { s42._llm42.impl = null; s42._llm42.ms = 6000; }
});

test('SSE /search/ask/stream: start, step-hendelser og answer', async () => {
  s42._clearCache42();
  const r = await A(`/finans/api/search/ask/stream?q=${encodeURIComponent('sist jeg kjøpte kaffe')}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  assert.match(r.text, /event: start/);
  assert.match(r.text, /event: step\ndata: \{"label":"Forstod spørsmålet"/);
  assert.match(r.text, /event: answer/);
  assert.match(r.text, /event: done/);
  assert.equal((await A('/finans/api/search/warm', 'POST', {})).body.ok, true);
});

/* ---------------- 2. Filter ---------------- */

test('filter: butikk, kategori, beløp, måneder/uker, facets og Glimt-utfylling', async () => {
  const from = d(10).slice(0, 7);
  const r = await A(`/finans/api/transactions?merchant[]=ica&from=${from}&to=${today.slice(0, 7)}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.count, 2);
  assert.ok(r.body.items.every((t) => /ICA/i.test(t.merchant)));
  assert.equal(r.body.items[0].receiptLabel, 'Kvittering ›');
  assert.ok(r.body.chips.some((c) => c.key === 'merchant'));
  const amt = await A('/finans/api/transactions?min=100&max=200');
  assert.ok(amt.body.items.every((t) => Math.abs(t.amount) >= 100 && Math.abs(t.amount) <= 200));
  assert.ok(amt.body.chips.some((c) => c.label === '100–200 kr'));
  const c = await A(`/finans/api/transactions?category[]=${cat('Hjem')}`);
  assert.ok(c.body.items.length && c.body.items.every((t) => t.category === 'Hjem'));
  const wk = await A('/finans/api/transactions?week=1-53');
  assert.equal(wk.status, 200);
  assert.ok(wk.body.chips.some((x) => x.label === 'Uke 1–53'));
  // Uten filter: som før (routes.js).
  const plain = await A('/finans/api/transactions?limit=5');
  assert.equal(plain.body.items.length, 5);
  assert.equal(plain.body.chips, undefined);
  const f = await A('/finans/api/filter/facets');
  assert.equal(f.body.top, 6);
  assert.ok(f.body.merchants.some((m) => m.key === 'ica'));
  assert.ok(!f.body.merchants.some((m) => m.key === 'bank-norwegian'), 'overføringer er ikke butikker');
  const g = await A('/finans/api/filter/glimt', 'POST', { q: 'ICA mellom 500 og 5000 kr i uke 34 til 50' });
  assert.deepEqual([g.body.filter.merchants, g.body.filter.min, g.body.filter.max, g.body.filter.week], [['ica'], 500, 5000, { from: 34, to: 50 }]);
  assert.match(g.body.text, /^✦ Glimt satte filteret: ICA · 500–5000 kr · uke 34–50 · \d+,\d\d s$/);
  assert.match(g.body.url, /^\/finans\/filter\?shop=ica&wk=34-50&min=500&max=5000$/);
});

/* ---------------- 3. Avanserte oppgaver + PDF ---------------- */

test('Glimt-oppgaver: bakgrunnsjobb, steg, maks 2 samtidige, forbruksrapport som PDF (A4, 2 sider)', async () => {
  const r = await A('/finans/api/glimt/tasks', 'POST', { kind: 'report' });
  assert.equal(r.status, 202, r.text);
  assert.match(r.body.jobId, /^gt/);
  const j = await gt42.waitTask42(r.body.jobId);
  assert.equal(j.state, 'done', j.error);
  assert.equal(j.steps.length, 4);
  assert.ok(j.steps.every((s) => s.done));
  assert.match(j.doneText, /^Ferdig · \d\d:\d\d$/);
  assert.equal(j.openLabel, 'Åpne rapport');
  assert.ok(j.result.spent > 0 && j.result.categories.length && j.result.largest.length);
  assert.match(j.result.fileName, /^Forbruksrapport-\d{4}-\d{2}\.pdf$/);
  const pdf = await A(j.pdfUrl);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(pdf.headers.get('content-disposition'), /Forbruksrapport-\d{4}-\d{2}\.pdf/);
  const s = pdf.buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.match(s, /\/Count 2/);
  assert.match(s, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(s, /%%EOF\n$/);
  assert.equal(pdf42.winAnsiHex('æøå'), 'e6f8e5');
  // Fritekst og de andre oppgavene.
  const ft = await A('/finans/api/glimt/tasks', 'POST', { text: 'lag en rapport over forbruket mitt i høst' });
  assert.equal(ft.body.job.kind, 'report');
  assert.ok(ft.body.job.params.period?.from);
  for (const kind of ['cut_subs', 'compare_year', 'clean_categories']) {
    const x = await A('/finans/api/glimt/jobs', 'POST', { type: kind });
    assert.equal(x.status, 202);
    const done = await gt42.waitTask42(x.body.jobId);
    assert.equal(done.state, 'done', kind);
    assert.equal(typeof done.result.text, 'string');
  }
  // Maks 2 samtidige: en tredje venter i kø.
  gt42._taskLlm42.delayMs = 150;
  try {
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await A('/finans/api/glimt/tasks', 'POST', { kind: 'cut_subs' })).body.jobId);
    await new Promise((res) => setTimeout(res, 40));
    const list = (await A('/finans/api/glimt/tasks')).body;
    assert.equal(list.max, 2);
    assert.ok(list.jobs.filter((x) => ids.includes(x.id) && x.state === 'running').length <= 2);
    for (const id of ids) assert.equal((await gt42.waitTask42(id)).state, 'done');
  } finally { gt42._taskLlm42.delayMs = 0; }
  assert.equal((await I(`/finans/api/glimt/tasks/${r.body.jobId}`)).status, 404, 'bare egne jobber');
  assert.equal((await A(`/finans/api/glimt/tasks/${r.body.jobId}`, 'DELETE')).body.ok, true);
  assert.equal((await A(j.pdfUrl)).status, 404);
  assert.equal((await A('/finans/api/glimt/tasks', 'POST', { kind: 'nei' })).status, 400);
});

/* ---------------- 4. Boliger ---------------- */

const homeId = fhDb.prepare("SELECT id FROM fh_folders WHERE name='Huset Bislett'").pluck().get();
test('Boliger: oversikt (2a), årsbokser, utgifter per år og kvitteringspanel', async () => {
  const o = await A('/finans/api/boliger/oversikt');
  assert.equal(o.status, 200, o.text);
  assert.equal(o.body.homes.length, 3);
  assert.match(o.body.text, /^3 boliger · .* brukt hittil i år$/);
  const h = o.body.homes.find((x) => x.id === homeId);
  assert.ok(h.spentYear > 0 && h.receipts && h.openLabel === 'Åpne Huset Bislett');
  assert.equal((await A('/api/boliger/oversikt')).status, 200, 'alias');
  const y = await A(`/finans/api/homes/${homeId}/years`);
  assert.ok(y.body.years.length >= 5);
  assert.equal(y.body.years.at(-1).label, 'Hittil i år');
  const e = await A(`/finans/api/homes/${homeId}/expenses?year=${today.slice(0, 4)}`);
  assert.ok(e.body.count > 3);
  assert.equal(e.body.sumLabel, `Sum ${today.slice(0, 4)}`);
  const one = await A(`/finans/api/homes/${homeId}/expenses/${e.body.items[0].id}`);
  assert.equal(one.status, 200);
  assert.ok(Array.isArray(one.body.chips) && one.body.chips.length >= 1 && one.body.logo);
  assert.equal((await A(`/finans/api/folders/${homeId}/years`)).status, 200, 'også under /folders');
  assert.equal((await I('/finans/api/homes/999/years')).status, 404);
  assert.equal((await A(`/finans/api/homes/${homeId}/expenses/${e.body.items[0].id}/reanalyze`, 'POST', {})).status, 409, 'uten original kvittering');
});

test('Boliger: kategorier (hva ble kjøpt), egne og Glimt-lagde, alle som kort, åpne en kategori', async () => {
  const k = await A(`/finans/api/homes/${homeId}/categories?year=${today.slice(0, 4)}`);
  assert.equal(k.status, 200);
  for (const n of ['Blomster', 'Møbler', 'Mat og drikke', 'Maling', 'Verktøy', 'Annet']) assert.ok(k.body.cards.some((c) => c.name === n), n);
  assert.ok(k.body.cards[0].sum >= k.body.cards.at(-1).sum, 'brukte først');
  assert.ok(k.body.cards.every((c) => Array.isArray(c.spark) && c.spark.length === 12));
  assert.ok(k.body.kpi.largest);
  const mk = await A(`/finans/api/homes/${homeId}/categories`, 'POST', { name: 'Peis' });
  assert.equal(mk.status, 201);
  assert.equal((await A(`/finans/api/homes/${homeId}/categories`, 'POST', { name: 'peis' })).status, 409);
  const g = await A(`/finans/api/homes/${homeId}/categories/glimt`, 'POST', { text: 'Pool & Spa · klor og pH-minus' });
  assert.equal(g.body.category.name, 'Basseng');
  const g2 = await A(`/finans/api/homes/${homeId}/categories/glimt`, 'POST', { text: 'Tennbriketter og ved fra Biltema' });
  assert.equal(g2.body.category.name, 'Ved og brensel');
  assert.equal(g2.body.created, true);
  assert.equal(g2.body.toast, 'Glimt laget kategorien «Ved og brensel»');
  const open = await A(`/finans/api/homes/${homeId}/categories/${g2.body.category.id}?range=all`);
  assert.equal(open.body.category.deletable, true);
  assert.equal(open.body.addLabel, '+ Legg til utgift i Ved og brensel');
  assert.equal((await A(`/finans/api/homes/${homeId}/categories/${mk.body.category.id}`, 'DELETE')).body.movedTo, 'Annet');
});

test('Boliger: prosjekter som samlemapper, Glimt finner relaterte kjøp, koble/fjerne/angre, sletting kobler fra', async () => {
  const p = await A(`/finans/api/homes/${homeId}/projects`, 'POST', { name: 'Basseng', status: 'Pågår' });
  assert.equal(p.status, 201, p.text);
  assert.equal(p.body.project.budget, null, 'budsjett er valgfritt');
  const pid = p.body.project.id;
  const g = await A(`/finans/api/homes/${homeId}/projects/${pid}/glimt`, 'POST', { q: 'Legg til alle kjøp relatert til basseng' });
  assert.equal(g.status, 200);
  assert.ok(g.body.terms.includes('pool') && g.body.terms.includes('klor'));
  assert.ok(g.body.items.length >= 1 && g.body.items.every((x) => x.checked));
  assert.match(g.body.text, /^Glimt fant \d+ kjøp om «basseng» · til sammen/);
  assert.equal(g.body.confirm, true);
  assert.equal((await A(`/finans/api/homes/${homeId}/projects/${pid}`)).body.project.count, 0, 'Glimt kobler aldri selv');
  const ids = g.body.action.body.entryIds;
  const link = await A(`/finans/api/homes/${homeId}/projects/${pid}/items`, 'POST', { entryIds: ids });
  assert.equal(link.body.linked, ids.length);
  const list = await A(`/finans/api/homes/${homeId}/projects`);
  const card = list.body.projects.find((x) => x.id === pid);
  assert.equal(card.count, ids.length);
  assert.match(list.body.text, /prosjekt(er)? · .* samlet$/);
  assert.equal((await A(`/finans/api/homes/${homeId}/projects/${pid}/items/undo`, 'POST', link.body.undo)).body.restored, ids.length);
  await A(`/finans/api/homes/${homeId}/projects/${pid}/items`, 'POST', { entryIds: ids });
  assert.equal((await A(`/finans/api/homes/${homeId}/projects/${pid}/items/${ids[0]}`, 'DELETE')).body.ok, true);
  const bilt = await A(`/finans/api/homes/${homeId}/projects/${pid}/glimt`, 'POST', { q: 'Legg til alt med kategori Vedlikehold' });
  assert.equal(bilt.status, 200);
  const del = await A(`/finans/api/homes/${homeId}/projects/${pid}`, 'DELETE');
  assert.ok(del.body.unlinked >= 1);
  assert.ok(fhDb.prepare('SELECT count(*) FROM fh_folder_entries WHERE id IN (' + ids.map(() => '?').join(',') + ')').pluck().get(...ids) === ids.length, 'utgiftene slettes ikke');
});

test('søk avgrenset til bolig: scope i /search/ask og /homes/:id/search', async () => {
  s42._clearCache42();
  const r = await A('/finans/api/search/ask', 'POST', { q: 'blomster', scope: { module: 'boliger', home_id: homeId } });
  assert.equal(r.status, 200);
  assert.equal(r.body.intent, 'boliger');
  assert.ok(r.body.cards.length && r.body.cards.every((c) => c.homeId === homeId));
  assert.match(r.body.text, /treff i Huset Bislett/);
  const all = await A('/finans/api/search/ask', 'POST', { q: 'vann og avløp', scope: { module: 'boliger' } });
  assert.ok(new Set(all.body.cards.map((c) => c.homeName)).size >= 1);
  const s = await A(`/finans/api/homes/${homeId}/search?q=plantasjen`);
  assert.ok(s.body.hits >= 1);
});

test('import rett til Boliger: regler (konto/butikk), mest spesifikke vinner, fil-import ?home=, ingen dobbel kobling', async () => {
  const geilo = fhDb.prepare("SELECT id FROM fh_folders WHERE name='Hytta Geilo'").pluck().get();
  const put = await A('/finans/api/import/home-rules', 'PUT', { rules: [{ accountId: acc, homeId, mode: 'review' }, { accountId: acc, homeId: geilo, merchants: ['Biltema'], mode: 'direct' }] });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.body.rules.length, 2);
  assert.match(put.body.rules[1].sub, /^Bare Biltema · legges rett inn$/);
  assert.equal(put.body.offer90.label, 'Importer også de siste 90 dagene?');
  const t1 = addTx(today, 'BILTEMA SANDVIKA', -450, 'Hjem'), t2 = addTx(today, 'Coop Extra', -210, 'Mat og dagligvarer');
  const r = h42.applyHomeRules42(sebId, [t1, t2]);
  assert.equal(r.sent, 2);
  assert.equal(fhDb.prepare('SELECT folder_id FROM fh_folder_entries WHERE tx_id=?').pluck().get(t1), geilo, 'butikk-regel før konto-regel');
  assert.equal(fhDb.prepare('SELECT status FROM fh_folder_entries WHERE tx_id=?').pluck().get(t2), 'review');
  assert.equal(h42.applyHomeRules42(sebId, [t1, t2]).sent, 0, 'ingen dobbel kobling');
  assert.match(r.text, /transaksjon sendt til/);
  const fd = new FormData();
  fd.append('text', `Dato;Forklaring;Ut fra konto\n${today.split('-').reverse().join('.')};Plantasjen Sandvika;349,00\n`);
  const res = await app.request(`/finans/api/import?commit=1&home=${homeId}`, { method: 'POST', headers: { cookie: (await login('sebastian', 'testpassord1')) }, body: fd });
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(j.home?.sent, 1, JSON.stringify(j));
  assert.equal((await I(`/finans/api/import?commit=1&home=${homeId}`, 'POST', {})).status, 404, 'ikke medlem');
});

/* ---------------- 5. Abonnementer-kalenderen ---------------- */

test('Abonnementer: innebygd kalender i /api/kalender/calendars, trekk som heldagshendelser, skjul/varsler', async () => {
  const c = await A('/api/kalender/calendars');
  assert.equal(c.status, 200, c.text);
  const ab = c.body.calendars.find((x) => x.id === 'abonnementer');
  assert.ok(ab);
  assert.deepEqual([ab.key, ab.name, ab.color, ab.source, ab.badge, ab.sourceLabel, ab.writable], ['ab', 'Abonnementer', '#3d7f8a', 'builtin', 'INNEBYGD', 'Finans', false]);
  const to = new Date(Date.now() + 92 * 86400_000).toLocaleDateString('sv-SE');
  const ev = await A(`/api/kalender/abonnementer/events?from=${today}&to=${to}`);
  const net = ev.body.events.filter((e) => /^Netflix · 149 kr$/.test(e.title));
  assert.ok(net.length >= 3, 'Netflix hver måned de neste 3 månedene');
  assert.ok(net.every((e) => e.allDay && e.kind === 'trekk' && e.badge === 'TREKK' && e.subId && e.amount === 149 && e.deepLink.startsWith('finans://abonnement/') && ![0, 6].includes(new Date(`${e.date}T12:00:00Z`).getUTCDay())));
  assert.equal(net[0].intervalText.startsWith('Hver måned den'), true);
  const yearly = ev.body.events.find((e) => e.renewal);
  if (yearly) assert.equal(yearly.badge, 'ÅRLIG');
  const alias = await A(`/api/calendars/events?cal=ab&start=${today}&end=${to}`);
  assert.equal(alias.body.events.length, ev.body.events.length);
  const all = await A(`/api/kalender?from=${today}&to=${new Date(Date.now() + 35 * 86400_000).toLocaleDateString('sv-SE')}`);
  assert.ok(all.body.events.some((e) => e.appCalendar === 'abonnementer' && e.source === 'abonnementer'), 'med i vanlige hendelseslister');
  assert.equal(sc42.bankDay42('2026-10-24'), '2026-10-26');
  const p = await A('/api/kalender/calendars/abonnementer', 'PATCH', { notifySubscriptions: 'dagen-for' });
  assert.equal(p.body.calendar.notify, 'day_before');
  assert.equal((await A('/api/kalender/calendars/abonnementer', 'PATCH', { notify: 'trials_yearly' })).body.calendar.notifySubscriptions, 'prove-arlige');
  assert.equal((await A('/api/kalender/calendars/prefs', 'PUT', { notifySubscriptions: 'av' })).body.prefs.notifySubscriptions, 'av');
  assert.equal((await A('/api/kalender/calendars')).body.calendars.find((x) => x.id === 'abonnementer').notify, 'off');
  assert.equal((await A('/api/kalender/calendars/abonnementer', 'PATCH', { visible: false })).body.calendar.visible, false);
  const hid = await A(`/api/kalender?from=${today}&to=${to}`);
  assert.ok(!hid.body.events.some((e) => e.source === 'abonnementer'), 'skjult kalender gir ingen trekk');
  await A('/api/kalender/calendars/abonnementer', 'PATCH', { visible: true });
  assert.equal((await A('/api/kalender/calendars/abonnementer', 'DELETE')).status, 403);
  const ics = await A('/api/kalender/abonnementer.ics');
  assert.match(ics.text, /BEGIN:VCALENDAR[\s\S]*SUMMARY:Netflix · 149 kr/);
});

/* ---------------- 6. Aksjer og Finn ---------------- */

test('aksje-logoer: utsteder for ETF-er med tickermerkelapp, selskap for aksjer, lesbar undertittel, monogram som reserve', async () => {
  assert.deepEqual(f42.instrument42('VUAGl_EQ'), { ticker: 'VUAG', exchange: 'London', raw: 'VUAGl_EQ' });
  const v = f42.stockLogo42({ ticker: 'VUAGl_EQ', name: 'Vanguard S&P 500', currency: 'USD' });
  assert.equal(v.subtitle, 'VUAG · London · USD');
  assert.equal(v.logo.issuer, 'Vanguard');
  assert.equal(v.tickerBadge, 'VUAG');
  assert.equal(f42.stockLogo42({ ticker: 'VHYLl_EQ', name: 'Vanguard FTSE All-World High Div' }).logo.domain, 'vanguard.com');
  assert.equal(f42.stockLogo42({ ticker: 'EQNRo_EQ', name: 'Equinor' }).logo.domain, 'equinor.com');
  assert.equal(f42.stockLogo42({ ticker: 'AAPL_US_EQ', name: 'Apple' }).subtitle, 'AAPL · USA');
  const x = f42.stockLogo42({ ticker: 'ZZZQl_EQ', name: 'Lite Selskap' });
  assert.equal(x.logo, null);
  assert.equal(x.monogram.text, 'ZZZQ');
  const s = await A('/finans/api/stocks');
  assert.equal(s.status, 200);
  assert.ok(s.body.positions.every((p) => p.subtitle && p.monogram));
  assert.ok(s.body.positions.find((p) => p.ticker === 'AAPL_US_EQ').logo.url.endsWith('/aksjer/logo/AAPL'));
  const img = await A('/finans/api/aksjer/logo/AAPL');
  assert.equal(img.status, 200, 'Apple-logoen ligger i logobiblioteket');
  assert.equal((await A('/finans/api/aksjer/logo/ZZZQ')).status, 404);
});

test('Finn-bilder: bare annonsens egne bilder (__NEXT_DATA__ → JSON-LD), største størrelse, uten reklame/og:image', () => {
  const html = `<meta property="og:image" content="https://images.finncdn.no/dynamic/1280w/ads/dame.jpg">
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { ad: { images: [{ uri: 'https://images.finncdn.no/dynamic/240w/item/412345678/a.jpg' }, { uri: 'https://images.finncdn.no/dynamic/default/item/412345678/b.jpg' }] },
      recommendations: { images: [{ uri: 'https://images.finncdn.no/dynamic/1280w/item/999/x.jpg' }] } } })}</script>
    <img src="https://images.finncdn.no/dynamic/1280w/banner/dame.jpg">`;
  const r = finn42.adImages42(html, '412345678');
  assert.deepEqual(r.images, ['https://images.finncdn.no/dynamic/1280w/item/412345678/a.jpg', 'https://images.finncdn.no/dynamic/1280w/item/412345678/b.jpg']);
  assert.equal(r.source, 'next_data');
  assert.ok(r.rejected.some((x) => /og:image/.test(x.why)));
  const ld = finn42.adImages42('<script type="application/ld+json">{"@type":"Product","name":"x","image":["https://images.finncdn.no/dynamic/1280w/item/1/a.jpg","https://images.finncdn.no/dynamic/1280w/adnami/b.jpg","https://evil.example.com/c.jpg"]}</script>');
  assert.deepEqual(ld.images, ['https://images.finncdn.no/dynamic/1280w/item/1/a.jpg']);
  assert.equal(ld.source, 'jsonld');
});

test('Finn-bilder: samme bilde i ≥ 2 annonser regnes som felles og fjernes (også fra lagrede annonser)', async () => {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const root = join(process.env.DATA_DIR, 'finn');
  for (const [dir, file, data] of [['111', 'a.jpg', 'DAME'], ['111', 'b.jpg', 'SYKKEL'], ['222', 'a.jpg', 'DAME'], ['222', 'c.jpg', 'STOL']]) { mkdirSync(join(root, dir), { recursive: true }); writeFileSync(join(root, dir, file), data); }
  const mk = (code) => fhDb.prepare("INSERT INTO fh_finn(role,item,counterpart,date,amount,steps,created,user_id,finn_code) VALUES('bought','x','y',?,100,'[]',?,?,?) RETURNING id").get(today, Date.now(), sebId, code).id;
  const a = mk('111'), b = mk('222');
  fhDb.prepare("INSERT INTO fh_finn_ad(finn_id,url,code,title,images,source,fetched) VALUES(?,?,?,?,?,'fetch',?)").run(a, 'u', '111', 'A', JSON.stringify(['111/a.jpg', '111/b.jpg']), Date.now());
  fhDb.prepare("INSERT INTO fh_finn_ad(finn_id,url,code,title,images,source,fetched) VALUES(?,?,?,?,?,'fetch',?)").run(b, 'u', '222', 'B', JSON.stringify(['222/a.jpg', '222/c.jpg']), Date.now());
  const r = await finn42.cleanStoredAds42(root, { force: true });
  assert.equal(r.removed, 2);
  assert.deepEqual(JSON.parse(fhDb.prepare('SELECT images FROM fh_finn_ad WHERE finn_id=?').pluck().get(a)), ['111/b.jpg']);
  assert.deepEqual(await finn42.dropShared42({ id: a, finn_code: '111' }, ['111/a.jpg', '111/b.jpg'], root), ['111/b.jpg']);
});

/* ---------------- 7. Sporing ---------------- */

test('AliExpress: LP… er AliExpress (ikke Posten), e-post fra mappen gir én sending per nummer, ingen duplikat', async () => {
  assert.equal(carriers.detect('LP00512345678901'), 'aliexpress');
  assert.equal(carriers.detect('LZ123456789012'), 'posten');
  assert.equal(carriers.detect('CV704411234NO'), 'posten');
  assert.equal(carriers.carrierId42('POSTNORD'), 'postnord');
  assert.equal(carriers.carrierId42('PostNord AB'), 'postnord');
  assert.equal(carriers.carrierId42('postnord_no'), 'postnord');
  assert.equal(carriers.cainiaoStatus42('Arrived at destination country'), 'in_transit');
  assert.equal(carriers.cainiaoStatus42('Accepted by carrier'), 'picked_up');
  assert.equal(carriers.cainiaoStatus42('Ready for collection at pickup point'), 'ready_for_pickup');
  const mail = { subject: 'Your order has shipped', text: 'Order number: 8195123456784402\nItem: USB-C-kabler 2 m 3-pakning\nTracking number: LP00512345678901\n', from: 'transaction@notice.aliexpress.com', uid: '77' };
  const r = await A('/api/tracking/aliexpress/mail', 'POST', mail);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.found, 1);
  const s = r.body.items[0];
  assert.equal(s.carrier, 'aliexpress');
  assert.match(s.name, /^AliExpress · USB-C-kabler/);
  assert.equal(s.orderId, '8195123456784402');
  assert.match(s.sourceNote, /^Funnet i e-postmappen AliExpress, .* · ordre 8195…4402$/);
  assert.match(s.orderUrl, /orderId=8195123456784402$/);
  assert.equal((await A('/api/tracking/aliexpress/mail', 'POST', mail)).body.duplicate, true);
  assert.equal((await A('/api/tracking/aliexpress/mail', 'POST', { ...mail, uid: '78' })).body.found, 0, 'samme nummer gir ikke ny sending');
  assert.equal((await A('/api/tracking/aliexpress', 'PUT', { folder: 'Folders/AliExpress' })).body.folder, 'Folders/AliExpress');
  assert.equal((await A('/api/tracking/aliexpress')).body.folder, 'Folders/AliExpress');
});

test('Cainiao-oppslag med overlevering til norsk transportør (lokalt nummer)', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith(carriers.CAINIAO_URL)) return new Response(JSON.stringify({ module: [{ mailNo: 'LP00512345678901', statusDesc: 'Arrived at destination country', detailList: [
      { time: '2026-10-19 10:00:00', desc: 'Handed over to local carrier, tracking CV704411234NO', group: { nodeDesc: 'Oslo' } }, { time: '2026-10-12 08:00:00', desc: 'Accepted by carrier' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new TypeError('fetch failed');
  };
  try {
    carriers._clearCainiaoCache();
    const r = await carriers.fetchStatus('aliexpress', 'LP00512345678901');
    assert.equal(r.status, 'in_transit');
    assert.equal(r.via, 'cainiao');
    assert.equal(r.localNo, 'CV704411234NO');
    assert.equal(r.localCarrier, 'posten');
    assert.equal(r.events.length, 2);
  } finally { globalThis.fetch = orig; carriers._clearCainiaoCache(); }
});

test('PostNord: varianter (uten 00, locale, itemId), feilsøkingslogg per kall, admin-endepunkt + «Test nå», riktige feiltekster', async () => {
  const NO = '00573132901912345678';
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes(`id=${NO.slice(2)}`)) return new Response(JSON.stringify({ TrackingInformationResponse: { shipments: [{ status: 'EN_ROUTE', items: [{ events: [{ eventTime: '2026-10-20T08:00:00', status: 'EN_ROUTE', eventDescription: 'Ankommet terminal', location: { displayName: 'Oslo' } }] }] }] } }), { status: 200 });
    if (String(url).includes('recipientview')) return new Response(JSON.stringify({ TrackingInformationResponse: { shipments: [] } }), { status: 200 });
    throw new TypeError('fetch failed');
  };
  try {
    carriers._clearPostnordWebCache();
    const v = carriers.pnVariants42(NO).map((x) => x.label);
    assert.deepEqual(v.slice(0, 3), ['slik det står · en', 'slik det står · no', 'uten 00 · en']);
    const r = await carriers.postnordWeb(NO);
    assert.equal(r.status, 'in_transit');
    assert.equal(r.variant, 'uten 00 · en');
    assert.equal(calls[0].init.headers.Origin, 'https://www.postnord.no');
    const log = carriers.pnDebugOf42(NO);
    assert.equal(log.length, 3);
    assert.ok(log.every((x) => x.url && x.status === 200 && typeof x.body === 'string' && x.body.length <= 500 && x.variant && x.layer === 'PostNord'));
    const add = await A('/api/tracking', 'POST', { trackingNo: NO, carrier: 'postnord' });
    const id = add.body.item?.id ?? add.body.shipment?.id ?? add.body.id;
    assert.ok(id, add.text);
    const dbg = await A(`/api/tracking/debug/${id}`);
    assert.equal(dbg.status, 200, dbg.text);
    assert.equal(dbg.body.title, 'Detaljer for feilsøking');
    assert.match(dbg.body.curl, /^curl -sS 'https:\/\/api2\.postnord\.com\/rest\/shipment\/v5\/trackandtrace\/recipientview\?id=/);
    assert.ok(dbg.body.calls.length >= 3);
    assert.equal((await I(`/api/tracking/debug/${id}`)).status, 403, 'bare admin');
    const t = await A(`/api/tracking/debug/${id}/test`, 'POST', {});
    assert.equal(t.status, 200);
    assert.equal(typeof t.body.result.ok, 'boolean');
  } finally { globalThis.fetch = orig; carriers._clearPostnordWebCache(); }
  const trk = await import('../server/tracking.js');
  assert.equal(trk.pnErrorText42('Fant ikke nummeret hos PostNord'), 'Fant ikke nummeret hos PostNord. Sjekk nummeret eller velg en annen transportør.');
  assert.equal(trk.pnErrorText42('PostNord svarer ikke akkurat nå', '20:45'), 'PostNord svarer ikke akkurat nå. Prøver igjen 20:45.');
  assert.match(trk.pnErrorText42('Nøkkelen ble avvist (401)'), /^PostNord krever nøkkel/);
});

test('PostNord: etter 2 mislykkede forsøk prøves ParcelsApp automatisk (også uten allowParcelsapp)', async () => {
  const { updateConfig } = await import('../server/settings.js');
  const { OWNER } = await import('../server/db.js');
  updateConfig({ trk_parcelsapp_key: 'pa-key' }, OWNER);
  kv.del(OWNER, 'parcelsapp_usage');
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('recipientview')) return new Response('feil', { status: 500 });
    if (String(url).startsWith('https://parcelsapp.com') && init?.method === 'POST') return new Response(JSON.stringify({ done: true, shipments: [{ status: 'delivered', states: [{ date: '2026-10-18T10:00:00Z', status: 'Delivered', location: 'Oslo' }] }] }), { status: 200 });
    throw new TypeError('fetch failed');
  };
  try {
    carriers._clearPostnordWebCache();
    const NO = '00370726201111111111';
    await assert.rejects(carriers.fetchStatus('postnord', NO));
    const r = await carriers.fetchStatus('postnord', NO);
    assert.equal(r.via, 'parcelsapp');
    assert.equal(r.viaLabel, 'via ParcelsApp');
  } finally { globalThis.fetch = orig; carriers._clearPostnordWebCache(); updateConfig({ trk_parcelsapp_key: null }, OWNER); }
});

test('PostNord-logo: kontrollert fil i logobiblioteket, carrierLogo.url finnes', async () => {
  const { packageLogo } = await import('../server/tracking.js');
  const l = packageLogo({ carrier: 'postnord', shop: '', shop_domain: '' });
  assert.equal(l.kind, 'carrier');
  assert.equal(l.url, '/finans/api/logos/file/postnord');
  assert.equal(l.hasFile, true);
  const f = await A('/finans/api/logos/file/postnord');
  assert.equal(f.status, 200);
  assert.equal(f.headers.get('content-type'), 'image/png');
});

/* ---------------- 8. Gjøremål-Glimt del opp ---------------- */

const LONG = 'Husk å ta med pakke de må pakke må sendes fra butikken før vi drar til Strømstad Strømstad må huske å ta med tilhengeren hjem siden vi skal ha med noen store ting opp til Toten og da må jeg ha ha tilhenger';
test('Gjøremål-Glimt: lokal forhåndsdeling (gjentatt stedsnavn, «og <verb>»), fyllord bort, én oppgave uendret', () => {
  const a = tk42.splitLocal42(LONG, '2026-10-20');
  assert.equal(a.length, 2);
  assert.equal(a[0].n, 'Ta med pakken som skal sendes fra butikken');
  assert.equal(a[0].dueText, 'før Strømstad-turen');
  assert.equal(a[1].n, 'Ta med tilhengeren hjem fra Strømstad');
  assert.equal(a[1].place, 'Strømstad');
  assert.match(a[1].note, /^Trengs til noen store ting opp til Toten/);
  const b = tk42.splitLocal42('kjøp melk egg og brød og hent pakken på kiwi i morgen', '2026-10-20');
  assert.deepEqual(b.map((x) => x.n), ['Kjøp melk, egg og brød', 'Hent pakken på Kiwi']);
  assert.equal(b[1].date, '2026-10-21');
  assert.deepEqual(tk42.splitLocal42('ring tannlegen', '2026-10-20').map((x) => x.n), ['Ring tannlegen']);
});

test('Gjøremål-Glimt: liste-kontrakt {tasks[]}, ```json-gjerder, lengdevakt + nytt forsøk, erstatter med alle tasks, én Angre, logg', async () => {
  assert.equal(tk42.normalize42('```json\n{"tasks":[{"title":"Ring tannlegen"}]}\n```').items[0].n, 'Ring tannlegen');
  assert.equal(tk42.guard42({ items: [{ n: 'Ta med pakke må sendes fra butikken før vi drar til Strømstad og ta med tilhengeren hjem' }] }), false);
  assert.equal(tk42.guard42({ items: [{ n: 'Ta med tilhengeren hjem fra Strømstad' }] }), true);
  assert.match(tk42.prompt42(LONG, { today: '2026-10-20' }), /"tasks":\[/);
  const prompts = [];
  tg41._ai41.impl = async (prompt, { attempt }) => {
    prompts.push(prompt);
    if (attempt === 0) return { tasks: [{ title: LONG }] }; // ikke delt opp → lengdevakten slår til
    return { tasks: [{ title: 'Ta med pakken som skal sendes fra butikken', dueText: 'før Strømstad-turen' }, { title: 'Ta med tilhengeren hjem fra Strømstad', place: 'Strømstad', note: 'Trengs til store ting opp til Toten' }], _engine: 'Gemini · test' };
  };
  tg41._ai41.ms = 200;
  try {
    const r = await A('/api/tasks/glimt', 'POST', { q: LONG, async: true });
    assert.equal(r.status, 202, r.text);
    const j = await tg41.waitJob41(r.body.jobId);
    assert.equal(j.state, 'done');
    assert.deepEqual(j.tasks.map((x) => x.title), ['Ta med pakken som skal sendes fra butikken', 'Ta med tilhengeren hjem fra Strømstad']);
    assert.equal(j.items.length, 2);
    assert.equal(j.splitText, 'Glimt delte beskjeden i 2 oppgaver');
    assert.equal(j.undo.token, r.body.jobId);
    assert.equal(j.placeholderId, r.body.jobId);
    assert.ok(prompts.length >= 2 && /Svar kun med gyldig JSON/.test(prompts[1]));
    assert.ok(j.items.every((x) => x.origin.text === LONG));
    const log = (await A('/api/tasks/glimt/log')).body.items[0];
    assert.deepEqual([log.input_len, log.tasks_count, log.parse_ok, log.path], [LONG.length, 2, true, 'ai']);
    const u = await A(`/api/tasks/glimt/jobs/${r.body.jobId}/undo`, 'POST', {});
    assert.equal(u.status, 200, u.text);
    assert.equal(u.body.deleted, 2);
    assert.match(u.body.restored.title, /^Husk å ta med pakke/);
    const items = (await A('/api/tasks')).body.items;
    assert.ok(!items.some((x) => x.id === j.items[0].id));
    assert.equal((await A(`/api/tasks/glimt/jobs/${r.body.jobId}/undo`, 'POST', {})).status, 409);
  } finally { tg41._ai41.impl = null; tg41._ai41.ms = null; }
});

/* ---------------- 9. Helse fra Home Assistant ---------------- */

test('helse fra HA: enheter, koble person, samtykke, synk til Familie (source, sourceDevice, limited)', async () => {
  const g = await A('/api/family/health/ha');
  assert.equal(g.status, 200, g.text);
  assert.equal(g.body.connected, true);
  const dev = g.body.devices.find((x) => x.id === 'sebastian_iphone_17_pro');
  assert.equal(dev.platform, 'ios');
  assert.equal(dev.limited, true);
  assert.equal(dev.suggestedPersonId, sebId);
  assert.ok(dev.sensors.some((s) => s.key === 'steps' && 'enabled' in s));
  assert.equal(g.body.devices.find((x) => x.id === 'sebastian_ipad_pro').noHealthText, 'Ingen helsesensorer');
  assert.ok(Array.isArray(g.body.people));
  assert.equal((await I('/api/family/health/ha', 'PUT', { devices: [] })).status, 403);
  const put = await A('/api/family/health/ha', 'PUT', { devices: [{ id: 'sebastian_iphone_17_pro', personId: sebId, sensors: ['steps', 'activity'] }] });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.body.devices.find((x) => x.id === 'sebastian_iphone_17_pro').personId, sebId);
  assert.equal(put.body.sync.stored, 0, 'uten samtykke lagres ingenting');
  assert.equal((await A('/api/family/health/ha/consent', 'POST', { allow: true })).body.consent.allow, true);
  const s = await A('/api/family/health/ha/sync', 'POST', {});
  assert.equal(s.body.stored, 1);
  assert.equal(db.prepare('SELECT steps FROM family_health WHERE user=? ORDER BY date DESC').pluck().get(sebId), 7310);
  const dv = await A('/api/family/health/ha/devices/rune_oneplus_8', 'PUT', { personId: ingridId, sensors: [{ key: 'steps', enabled: true }] });
  assert.equal(dv.status, 200);
  const src = hl42.haSourceOf42(sebId);
  assert.equal(src.source, 'ha:sebastian_iphone_17_pro');
  assert.equal(src.sourceDevice, 'Sebastian iPhone 17 Pro');
  assert.equal(src.limited, true);
  assert.equal(src.stale, false);
  assert.match(src.sourceText, /^Fra Home Assistant · iPhone 17 Pro · oppdatert /);
  const pos = await A('/api/family/members');
  const me = JSON.stringify(pos.body ?? {});
  if (/"health":\{/.test(me)) assert.match(me, /"source":"ha:sebastian_iphone_17_pro"/);
});

/* ---------------- 10. Diverse ---------------- */

test('homeButton i /api/me/layout (synk), gamle design migreres til Papir, Vel fremme-alias', async () => {
  assert.equal((await A('/api/me/layout')).body.homeButton, 'standard');
  assert.equal((await A('/api/me/layout', 'PUT', { homeButton: '1c' })).status, 200);
  assert.equal((await A('/api/me/layout')).body.homeButton, '1c');
  assert.equal((await A('/api/me/layout', 'PUT', { homeButton: '2x' })).status, 400);
  await A('/api/me/layout', 'PUT', { mobileDesign: 'klassisk', design: 'v2' });
  const l = (await A('/api/me/layout')).body;
  assert.deepEqual([l.mobileDesign, l.design], ['papir', 'lys']);
  const a = await A('/api/velfremme');
  const b = await A('/api/hjemlys');
  assert.equal(a.status, b.status);
  assert.deepEqual(Object.keys(a.body ?? {}).sort(), Object.keys(b.body ?? {}).sort());
  assert.equal((await A('/api/hjemlys/finnesikke/end', 'POST', {})).status, 404);
  const ic = await A('/api/icons/search?q=boat&prefixes=lucide,tabler');
  assert.equal(ic.status, 200, ic.text);
});

test('FinansHub web-alias: /folders/:id/projects/:pid/candidates, /entries/:eid/receipt + /reanalyze, backfill, ISIN-logo, status og mailAddress, scope {home}', async () => {
  const p = await A(`/finans/api/folders/${homeId}/projects`, 'POST', { name: 'Hage', status: 'Planlagt' });
  assert.equal(p.status, 201, p.text);
  const c = await A(`/finans/api/folders/${homeId}/projects/${p.body.project.id}/candidates`, 'POST', { q: 'blomster fra Plantasjen' });
  assert.equal(c.status, 200);
  assert.ok(Array.isArray(c.body.candidates));
  const full = await A(`/finans/api/folders/${homeId}`);
  assert.equal(full.body.projects.find((x) => x.id === p.body.project.id).status, 'Planlagt');
  assert.match(full.body.mailAddress, /@/);
  assert.ok((await A('/finans/api/boliger/oversikt')).body.homes.every((h) => h.mailAddress && Array.isArray(h.categories) && 'lastPurchase' in h));
  const eid = full.body.entries[0].id;
  assert.equal((await A(`/finans/api/folders/${homeId}/entries/${eid}/receipt`)).status, 200);
  assert.equal((await A(`/finans/api/folders/${homeId}/entries/${eid}/reanalyze`, 'POST', {})).status, 409);
  assert.equal((await A('/finans/api/import/home-rules/backfill', 'POST', { days: 30 })).status, 200);
  assert.equal((await A('/finans/api/aksjer/logo/US0378331005')).status, 200);
  s42._clearCache42();
  const r = await A('/finans/api/search/ask', 'POST', { q: 'blomster', scope: { home: homeId } });
  assert.equal(r.body.intent, 'boliger');
});
