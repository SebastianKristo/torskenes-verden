// Låser svarene til Økonomi-rutene (status per rolle og feltene i svaret) før serverfilene samles i server/finans/ (Fase 2b).
// Omstruktureringen skal ikke endre stier, statuskoder eller felt. Rollene: A = admin (eier, har demodata), I = vanlig bruker (økt),
// TI = samme som I med app-token (mobil, POST /finans/api/login), N = ikke innlogget.
// OKONOMI_PRINT=1 skriver ut tabellen slik serveren svarer nå (brukes bare når tabellen skal lages på nytt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-okonomi-ruter-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-okr';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const PRINT = process.env.OKONOMI_PRINT === '1';

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'ingrid', password: 'ingridPassord123', device: 'iPhone' } })).json?.token;
assert.ok(tok);
const TI = as({ authorization: `Bearer ${tok}` });
const N = as({});
const WHO = { A, I, TI, N };

const one = (sql) => db.prepare(sql).pluck().get();
const txId = one("SELECT id FROM fh_transactions WHERE user_id=(SELECT id FROM users WHERE username='sebastian') ORDER BY id LIMIT 1");
const subId = one("SELECT id FROM fh_subscriptions WHERE user_id=(SELECT id FROM users WHERE username='sebastian') ORDER BY id LIMIT 1");
const folderId = one('SELECT id FROM fh_folders ORDER BY id LIMIT 1');
assert.ok(txId && subId && folderId, 'demodata finnes');

const keysOf = (j) => (Array.isArray(j) ? '[]' : j && typeof j === 'object' ? Object.keys(j).sort().join(' ') : '');

// [sti, status for A I TI N, feltene i det første 200-svaret med JSON-objekt ("[]" = liste, "" = ikke sjekket)]
const GETS = [
  ['/finans/api/me', '200 200 200 401', 'admin avatarUrl id isMainAdmin name role serverName totp username version'],
  ['/finans/api/bootstrap', '200 200 200 401', 'accounts canEditServer categories firstRun goals hasData me month nav navDefault navFixed navHidden navLabels period profiles restricted reviewCount rules settings user'],
  ['/finans/api/settings', '200 200 200 401', 'aiSearchEmbed aiSummaries aiTimeoutOptions aiTimeouts ai_think autoCat canEditServer chat_ask_cloud chat_default_model chat_my_data chat_theme csvProfile currency embedModel fallback geminiKeySet geminiModel groqKeySet groqModel groqVisionModel imapDoneFolder imapFinnFolder imapFolder imapHost imapPassSet imapPin imapPollMinutes imapPort imapSecurity imapUser logo_gemini logo_local_receipts logo_verify logo_wikidata macOcrUrl mailOn minConf monthStart n100 n80 nFast nRc name ollamaModel ollamaTextModel ollamaUrl provider receipts48 roboflowKeySet roboflowWorkflow server serverKeys smbDb smbDir smbDomain smbEncrypt smbKeep smbOn smbReceipts smbSchedule smbSettings smbShare smbUser smbVersion t212Env t212Set user userKeys yearGoal'],
  ['/finans/api/prefs', '200 200 200 401', 'hidden labels nav navDefault navFixed'],
  ['/finans/api/summary', '200 200 200 401', 'balance balanceSeries budgetTotal budgetUsed budgets byCategory dailyOut day dayText daysInMonth daysLeft from inn innMonthly lastIncome left month monthName prevInn prevUt recent review ring savedYear series spentLabel spentMonth to upcoming ut yearGoal'],
  ['/finans/api/overview', '200 200 200 401', 'balance balanceSeries budgetTotal budgetUsed budgets byCategory dailyOut day dayText daysInMonth daysLeft from inn innMonthly lastIncome left month monthName prevInn prevUt recent review ring savedYear series spentLabel spentMonth to upcoming ut yearGoal'],
  ['/finans/api/transactions', '200 200 200 401', 'count items months net nextCursor'],
  ['/finans/api/transactions?limit=5', '200 200 200 401', 'count items months net nextCursor'],
  ['/finans/api/transactions/months', '200 200 200 401', 'months'],
  ['/finans/api/transactions/TX', '200 404 404 401', 'account accountId added aiLong aiShort aiSummary amount amountOre bank canReread canReset category categoryId color date description domain folder folderId hasBankRow history id kind lineCheck lines merchant note receipt receiptId source tags type'],
  ['/finans/api/transactions/TX/original', '200 404 404 401', 'bankRow receipt'],
  ['/finans/api/transactions.csv', '200 200 200 401', ''],
  ['/finans/api/recurring', '200 200 200 401', '[]'],
  ['/finans/api/reports', '200 200 200 401', 'byCategory from merchants mode months to total'],
  ['/finans/api/search?q=rema', '200 200 200 401', 'answer followUps hits interpreted mode query suggestions summary total'],
  ['/finans/api/search/suggestions', '200 200 200 401', 'groups items'],
  ['/finans/api/search/history', '200 200 200 401', '[]'],
  ['/finans/api/forslag?q=re', '200 200 200 401', '[]'],
  ['/finans/api/filter/facets', '200 200 200 401', 'amountPresets categories homes merchants moreCategories moreMerchants top'],
  ['/finans/api/receipts', '200 200 200 401', '[]'],
  ['/finans/api/receipts/analyzing', '200 200 200 401', 'count items'],
  ['/finans/api/receipts/jobs', '200 200 200 401', '[]'],
  ['/finans/api/receipts/health', '200 200 200 401', 'brreg categories compareMac external formats lfm72 local_only macOcr model ok preprocess reading_text source_label steps tesseract'],
  ['/finans/api/receipts/corrections', '200 200 200 401', 'items'],
  ['/finans/api/receipts/999999', '404 404 404 401', ''],
  ['/finans/api/subscriptions', '200 200 200 401', 'byMonth categories cycles health items lowUse month monthTotal monthly prevMonthTotal prevMonthly savings thisMonth today trials trialsSummary trialsVisible upcoming year yearly'],
  ['/finans/api/subscriptions/candidates', '200 200 200 401', '[]'],
  ['/finans/api/subscriptions/trials', '200 200 200 401', 'cancelLinks items remindOptions today'],
  ['/finans/api/subscriptions/log', '200 200 200 401', 'csv events filter filters months more summary'],
  ['/finans/api/subscriptions/log.csv', '200 200 200 401', ''],
  ['/finans/api/subscriptions/knowledge', '200 200 200 401', 'custom items'],
  ['/finans/api/subscriptions/SUB/logo', '404 404 404 401', ''],
  ['/finans/api/fin51/goals', '200 200 200 401', 'accounts items roundUp totals'],
  ['/finans/api/fin51/calendar', '200 200 200 401', 'accounts days from items lowest to total unassigned warnings'],
  ['/finans/api/fin51/hunter', '200 200 200 401', 'findings signals summary weeks'],
  ['/finans/api/fin51/prices', '200 200 200 401', 'basket count items raised receipts stores'],
  ['/finans/api/fin51/roundup', '200 200 200 401', 'amount count from goal goalId lastApplied purchases sample step steps text until'],
  ['/finans/api/fin51/tax', '200 200 200 401', 'disclaimer items profile rates ratesNote reminder total totalText year'],
  ['/finans/api/fin51/tax/export.csv', '200 200 200 401', ''],
  ['/finans/api/folders', '200 200 200 401', '[]'],
  ['/finans/api/folders/FOLDER', '200 404 404 401', 'address autoCat background backgroundDefault backgroundJpgUrl backgroundUrl balances bills budget canEdit catOptions catTree categories color count entries freqs id isOwner kpi layout mailAddress members months myRole name notices notify owners pending projects receipts review role spent split total type types upcoming weights yearTotal'],
  ['/finans/api/folders/FOLDER/expenses', '200 404 404 401', 'count empty items period sum sumLabel'],
  ['/finans/api/folders/FOLDER/years', '200 404 404 401', 'current first firstWithData years'],
  ['/finans/api/folders/FOLDER/shareable', '200 404 404 401', '[]'],
  ['/finans/api/boliger/categories', '200 200 200 401', 'aiNew canManage categories options'],
  ['/finans/api/boliger/oversikt', '200 200 200 401', 'count homes singleHomeId sumYear text todo year'],
  ['/finans/api/boliger/layout', '200 200 200 401', 'cards hid order'],
  ['/finans/api/users/shareable', '404 404 404 401', ''],
  ['/finans/api/users', '200 200 200 401', '[]'],
  ['/finans/api/tokens', '200 200 200 401', '[]'],
  ['/finans/api/glimt/tasks', '200 200 200 401', 'jobs kinds max running'],
  ['/finans/api/finn', '200 200 200 401', 'bought imap items months nBought nSold ongoing sold'],
  ['/finans/api/stocks', '200 200 200 401', 'base configured dividends env history keyHint keySource mock orders positions secretLength secretSource status summary syncedAt'],
  ['/finans/api/logos', '200 200 200 401', '[]'],
  ['/finans/api/logos/registry', '200 200 200 200', 'items version'],
  ['/finans/api/merchants/logo-overrides', '200 200 200 401', 'items names v'],
  ['/finans/api/ai-audit', '200 200 200 401', '[]'],
  ['/finans/api/ai/limits', '200 200 200 401', 'clientTimeoutS engines jobAfterS onTimeout retries'],
  ['/finans/api/ai/log', '200 200 200 401', 'items'],
  ['/finans/api/health/ai', '200 200 200 401', 'down gemini groq groqModels ocr ollama order provider roboflow tasks'],
  ['/finans/api/import/templates', '200 200 200 401', '[]'],
  ['/finans/api/import/home-rules', '200 200 200 401', 'accounts homes log modes rules'],
  ['/finans/api/backup/list', '200 403 403 401', 'error items'],
  ['/finans/api/mail/status', '200 200 200 401', 'recent status'],
  ['/finans/api/finnes-ikke', '404 404 404 401', ''],
  ['/api/receipts', '200 200 401 401', '[]'],
  ['/api/receipts.csv', '200 200 401 401', ''],
  ['/api/receipts/health', '200 200 200 401', 'brreg categories compareMac external formats lfm72 local_only macOcr model ok preprocess reading_text source_label steps tesseract'],
  ['/api/widgets/trials', '200 200 200 401', 'addLabel addUrl count deepLink empty emptyText items more next openUrl today updated'],
  ['/api/kalender/abonnementer/events', '200 200 200 401', 'calendar days events from to'],
  ['/api/kalender/abonnementer.ics', '200 200 200 401', ''],
  ['/api/calendars/events?cal=ab', '200 200 200 401', 'calendar events from to'],
  ['/api/boliger/oversikt', '200 200 200 401', 'count homes singleHomeId sumYear text todo year'],
  ['/api/homes/FOLDER/shareable', '200 404 404 401', '[]'],
];
const fill = (p) => p.replace('TX', txId).replace('SUB', subId).replace('FOLDER', folderId);

test('okonomi-ruter: status per rolle og felt i svaret er uendret', async () => {
  const out = [];
  for (const [path, statuses, keys] of GETS) {
    const want = statuses.split(' ').map(Number);
    const got = [];
    let ok200;
    for (const [i, [w, f]] of Object.entries(Object.entries(WHO))) {
      const r = await f(fill(path));
      got.push(r.status);
      if (PRINT) { if (r.status === 200 && ok200 === undefined && r.json && typeof r.json === 'object') ok200 = r.json; continue; }
      assert.equal(r.status, want[i], `${w} GET ${path}: ${r.text.slice(0, 160)}`);
      if (r.status >= 400) assert.equal(typeof r.json?.error, 'string', `${w} GET ${path}: feilsvar har {error}`);
      if (r.status === 200 && ok200 === undefined && r.json && typeof r.json === 'object') ok200 = r.json;
    }
    if (PRINT) { out.push(`  [${JSON.stringify(path)}, '${got.join(' ')}', '${keysOf(ok200)}'],`); continue; }
    if (!keys) continue;
    assert.equal(keysOf(ok200), keys, `GET ${path}: feltene`);
  }
  if (PRINT) console.log(out.join('\n').replaceAll('"', "'"));
});

test('okonomi-ruter: kalenderlista har «Abonnementer» (innebygd kalender fra Økonomi)', async () => {
  const r = await I('/api/kalender/calendars');
  assert.equal(r.status, 200);
  const list = r.json.calendars ?? r.json.items ?? r.json;
  assert.ok(Array.isArray(list) && list.some((x) => x.id === 'abonnementer'), 'Abonnementer i kalenderlista');
});

test('okonomi-ruter: skriving og tilgangskrav', async () => {
  // Ny transaksjon, endring og sletting (I), med A som ikke ser den.
  const acc = (await I('/finans/api/bootstrap')).json.accounts[0];
  const t = await I('/finans/api/transactions', 'POST', { date: '2026-11-02', amount: -123.45, description: 'Testbutikk', account_id: acc?.id });
  assert.equal(t.status, 200, t.text);
  const id = t.json.id ?? t.json.transaction?.id;
  assert.ok(id);
  assert.equal((await A(`/finans/api/transactions/${id}`)).status, 404);
  const p = await I(`/finans/api/transactions/${id}`, 'PATCH', { description: 'Testbutikk 2' });
  assert.equal(p.status, 200, p.text);
  if (PRINT) console.log('PATCH tx', keysOf(p.json), '| POST tx', keysOf(t.json));
  assert.equal((await N(`/finans/api/transactions/${id}`, 'DELETE')).status, 401);
  assert.equal((await I(`/finans/api/transactions/${id}`, 'DELETE')).status, 200);
  // Abonnement og prøveperiode.
  const s = await I('/finans/api/subscriptions', 'POST', { name: 'Testabo', price: 99, cycle: 'month', next_date: '2026-12-01' });
  assert.equal(s.status, 200, s.text);
  const tr = await I('/finans/api/subscriptions/trials', 'POST', { service: 'Testprøve', endsAt: '2026-12-10' });
  assert.equal(tr.status, 201, tr.text);
  if (PRINT) console.log('POST sub', keysOf(s.json), '| POST trial', keysOf(tr.json));
  // Gammel kvitteringsliste (Q30: tabellen receipts beholdes).
  const fd = new FormData(); fd.set('store', 'Kiwi'); fd.set('date', '2026-11-03'); fd.set('amount', '42.5'); fd.set('category', 'Mat');
  const g = await app.request('/api/receipts', { method: 'POST', headers: { cookie: (await login('ingrid', 'ingridPassord123')), 'x-forwarded-for': '198.51.100.3' }, body: fd });
  assert.equal(g.status, 200);
  const gj = await g.json();
  assert.deepEqual(Object.keys(gj).sort(), ['amount', 'category', 'date', 'file', 'id', 'mime', 'store', 'thumb']);
  assert.equal((await I(`/api/receipts/${gj.id}`, 'PATCH', { amount: 50 })).json.amount, 50);
  assert.equal((await A(`/api/receipts/${gj.id}`, 'PATCH', { amount: 1 })).status, 404);
  assert.deepEqual((await I(`/api/receipts/${gj.id}`, 'DELETE')).json, { ok: true });
  // Skriving uten innlogging.
  for (const [m, path] of [['POST', '/finans/api/subscriptions'], ['POST', '/finans/api/transactions'], ['POST', '/api/widgets/trials/1'], ['POST', '/finans/api/fin51/goals']]) {
    assert.equal((await N(path, m, {})).status, 401, `${m} ${path}`);
  }
});
