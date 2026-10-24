// EVALRCPT48: én kvittering i en egen prosess – fersk DATA_DIR, klokka satt til fasitens «today» (ellers ekte tid),
// nettet bevoktet (lib/net.mjs), og hver vei kjørt SEPARAT gjennom serverens egen kjede (server/receipts48/chain.js:
// runChain48) med bare det ene steget slått på i innstillingene. Deretter reservetestene (bare på én kvittering).
// Startes av run.mjs: node tests/receipts/worker.mjs <resultat.json>   (oppsettet kommer som JSON på stdin)
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installNet48 } from './lib/net.mjs';
import { fakeOllama48, fakeMac48, fakeGemini48, fakeTesseract48 } from './lib/mock.mjs';
import { compare48, fasitOf } from './lib/compare.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const [outFile] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(0, 'utf8'));
const fx = cfg.fixture;
const t00 = performance.now(); // ikke Date (klokka settes til fasitens dag)

/* ---------------- Miljø (før serveren importeres) ---------------- */
const dataDir = mkdtempSync(join(cfg.tmpRoot || tmpdir(), 'rcpt48-'));
process.env.DATA_DIR = dataDir;
process.env.SESSION_SECRET = 'evalrcpt48-secret-evalrcpt48-secret-evalrcpt48';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test'; // ingen HTTP-lytter og ingen bakgrunnsjobber
process.env.TZ = 'Europe/Oslo';
process.env.AI_FALLBACK = 'none';
delete process.env.MOCK_DATA;
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'ROBOFLOW_API_KEY', 'AI_PROVIDER', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL', 'OPENWEBUI_URL', 'OPENWEBUI_KEY', 'AI_BACKEND', 'MAC_OCR_KEY', 'MAC_OCR_URL']) delete process.env[k];
process.env.OLLAMA_URL = cfg.ollamaUrl;
process.env.AI_BACKEND = 'ollama';
process.env.MAC_OCR_URL = cfg.macUrl;
if (cfg.macKey) process.env.MAC_OCR_KEY = cfg.macKey;
if (cfg.geminiAllowed && cfg.geminiKey) process.env.GEMINI_API_KEY = cfg.geminiKey;

// Klokka: fasitens «today» kl. 10:00 (Oslo) og videre i sanntid, så datokontrollen (ikke i fremtiden, ≤ 2 år) blir lik hver gang.
const fasitJson = JSON.parse(readFileSync(fx.fasit, 'utf8'));
const today = /^\d{4}-\d{2}-\d{2}$/.test(fasitJson.today ?? '') ? fasitJson.today : null;
if (today) {
  const RealDate = globalThis.Date;
  const off = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', timeZoneName: 'longOffset' }).formatToParts(new RealDate(`${today}T10:00:00Z`)).find((p) => p.type === 'timeZoneName').value.replace('GMT', '') || '+00:00';
  const frozen = RealDate.parse(`${today}T10:00:00${off}`), start = RealDate.now();
  const now = () => frozen + (RealDate.now() - start);
  function FakeDate(...a) { if (!new.target) return new RealDate(now()).toString(); return a.length ? new RealDate(...a) : new RealDate(now()); }
  FakeDate.prototype = RealDate.prototype; FakeDate.now = now; FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  globalThis.Date = FakeDate;
}

/* ---------------- Data for kvitteringen ---------------- */
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };
const image = readFileSync(fx.image);
const mime = MIME[extname(fx.image).toLowerCase()] ?? 'image/jpeg';
const deviceOcrRaw = fx.deviceOcr ? JSON.parse(readFileSync(fx.deviceOcr, 'utf8')) : null;
const deviceParseRaw = fx.deviceParse ? JSON.parse(readFileSync(fx.deviceParse, 'utf8')) : null;
const fasit = fasitOf(fasitJson);
// Mock: Mac-OCR, Tesseract og Gemini «leser» bildet via lagret OCR (fixture-OCR-en, ellers <navn>.mac_ocr.json).
const mockOcr = () => (fx.macOcr ? JSON.parse(readFileSync(fx.macOcr, 'utf8')) : deviceOcrRaw);

const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };
const net = installNet48({ ollamaHost: hostOf(cfg.ollamaUrl), macHost: hostOf(cfg.macUrl), geminiAllowed: !!cfg.geminiAllowed,
  mock: cfg.mock ? { ollama: fakeOllama48, mac: fakeMac48({ key: cfg.macKey, ocr: mockOcr }), gemini: fakeGemini48({ ocr: mockOcr }) } : null });

/* ---------------- Serveren (bare modulene kjeden bruker) ---------------- */
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const fdb = await imp('server/finans/db.js');
const ai = await imp('server/ai-run.js');
const chain = await imp('server/receipts48/chain.js');
const tess = await imp('server/receipts48/engines/tesseract.js');
const llm = await imp('server/receipts48/engines/llm.js');
ai._setAiFetch?.((u, i) => globalThis.fetch(u, i));
if (cfg.mock) tess._setTesseract48(fakeTesseract48({ ocr: mockOcr }));
ai.migrateOnce?.();
const OWNER = fdb.OWNER;
const categories = fdb.DEFAULT_CATEGORIES.filter((c) => c[2] === 'expense').map((c) => c[0]);

function setRouting(finLocal) {
  const r = JSON.parse(JSON.stringify(ai.routing(OWNER)));
  delete r.own;
  r.rules = { ...r.rules, finLocal };
  ai.saveServerRouting(r);
  ai.invalidateInventory?.();
}
const OFF = { deviceParse: false, deviceOcr: false, macOcr: false, tesseract: false, gemini: false, compareMac: false };
function apply({ steps = {}, macUrl = cfg.macUrl, ollamaUrl = cfg.ollamaUrl, sperre = cfg.sperre, geminiKey = null }) {
  fdb.saveSettings({ ollamaUrl, macOcrUrl: macUrl, receipts48: { ...OFF, ...steps, textModel: cfg.model, macOcrTimeoutS: cfg.macTimeoutS, modelTimeoutS: cfg.modelTimeoutS } }, OWNER);
  setRouting(sperre);
  fdb.setSecret('geminiKey', geminiKey ?? '', OWNER); // '' = bare miljøvariabelen (GEMINI_API_KEY, satt bare når Gemini er tillatt)
  chain._resetChain48();
}

const slimPipe = (p) => p.map((e) => ({ step: e.step, status: e.status, engine: e.engine ?? null, ms: e.ms, ...(e.ocr_ms != null ? { ocr_ms: e.ocr_ms } : {}), ...(e.reason ? { reason: e.reason } : {}),
  ...(e.error ? { error: e.error } : {}), ...(e.failed_fields?.length ? { failed_fields: e.failed_fields } : {}), ...(e.attempts ? { attempts: e.attempts.length } : {}) }));
const callSummary = (calls) => ({
  model: calls.filter((c) => c.kind === 'model' && /\/api\/(chat|generate)$/.test(c.path)).length,
  mac: calls.filter((c) => c.kind === 'mac').length, gemini: calls.filter((c) => c.kind === 'gemini').length,
  blocked: calls.filter((c) => c.kind === 'blocked').map((c) => `${c.host}${c.path}`),
  macStatus: calls.filter((c) => c.kind === 'mac' && c.path === '/ocr').map((c) => c.status ?? c.error),
});

/** Kjører kjeden én gang med oppsettet o. */
async function runOnce(name, o, { deviceOcr = null, deviceParse = null } = {}) {
  apply(o);
  const mark = net.trace.length, logs = [];
  const t0 = performance.now();
  let res, crash = null;
  try {
    res = await chain.runChain48({ image, mime, deviceOcr, deviceParse, client: deviceOcr || deviceParse ? { platform: 'ios', version: 'eval48' } : null, categories, log: (k, m) => logs.push(`${k}: ${m}`) });
  } catch (e) { crash = String(e?.stack ?? e); }
  const ms = Math.round(performance.now() - t0);
  const calls = callSummary(net.trace.slice(mark));
  if (crash) return { name, crash, ms, calls, logs };
  return { name, ms, used: res.used, passed: res.passed, label: res.label, engine: res.engine, model: res.model, confidence: res.confidence,
    failed_fields: res.failed_fields, uncertain_fields: res.uncertain_fields, errors: res.errors, warnings: res.warnings, compare: res.compare,
    ocrRows: res.ocr?.rows?.length ?? null, pipeline: slimPipe(res.pipeline), fields: compare48(res.receipt, fasit), receipt: res.receipt, calls, logs };
}

const devOcr = (() => { if (!deviceOcrRaw) return null; const d = chain.deviceOcr48(deviceOcrRaw); return d.error ? { error: d.error } : d.ocr; })();
const out = { id: fx.id, real: !!fx.real, today: today ?? '(ekte dato)', image: { mime, kb: Math.round(image.length / 1024) }, fasit, routes: [], fallbacks: [], notes: [] };
if (devOcr?.error) out.notes.push(`device_ocr ble avvist: ${devOcr.error}`);

/* ---------------- Oppvarming (laster modellen før tidtakingen) ---------------- */
if (cfg.warmup && !cfg.mock) {
  apply({});
  const t0 = performance.now();
  try { await llm.parseRows48(['OPPVARMING', 'TOTAL 1,00'], { categories, model: cfg.model, base: cfg.ollamaUrl, timeoutS: 300 }); out.notes.push(`Oppvarming av ${cfg.model}: ${Math.round(performance.now() - t0)} ms (ikke med i tidene)`); }
  catch (e) { out.notes.push(`Oppvarming feilet: ${e.message}`); }
}

/* ---------------- Veiene, hver for seg ---------------- */
const want = (r) => cfg.routes.includes(r);
const skipRoute = (route, reason) => out.routes.push({ route, skipped: reason });
for (let run = 1; run <= cfg.runs; run++) {
  // Steget for veien svarte ikke (Mac-OCR nede, Tesseract mangler …): vises som «utilgjengelig», ikke som feil i feltene.
  const tag = (x) => { const own = x.pipeline?.find((e) => e.step === (x.route === 'kjede' ? null : x.route)); return { ...x, run, ...(own && ['unavailable', 'skipped'].includes(own.status) ? { unavailable: own.error ?? own.reason ?? own.status } : {}) }; };
  if (want('A')) {
    if (!deviceParseRaw) { if (run === 1) skipRoute('A', 'ingen <navn>.device_parse.json'); }
    else out.routes.push(tag({ route: 'A', ...(await runOnce('A', { steps: { deviceParse: true } }, { deviceParse: deviceParseRaw, deviceOcr: devOcr?.error ? null : devOcr })) }));
  }
  if (want('B')) {
    if (!devOcr || devOcr.error) { if (run === 1) skipRoute('B', devOcr?.error ?? 'ingen lagret device-OCR (<navn>.device_ocr.json)'); }
    else out.routes.push(tag({ route: 'B', ...(await runOnce('B', { steps: { deviceOcr: true } }, { deviceOcr: devOcr })) }));
  }
  if (want('C')) {
    if (!cfg.macKey && !cfg.mock) { if (run === 1) skipRoute('C', 'MAC_OCR_KEY er ikke satt'); }
    else out.routes.push(tag({ route: 'C', ...(await runOnce('C', { steps: { macOcr: true } })) }));
  }
  if (want('T')) out.routes.push(tag({ route: 'T', ...(await runOnce('T', { steps: { tesseract: true } })) }));
  if (want('D')) {
    if (!cfg.geminiAllowed) { if (run === 1) skipRoute('D', cfg.geminiWhy); }
    else out.routes.push(tag({ route: 'D', ...(await runOnce('D', { steps: { gemini: true }, sperre: false })) }));
  }
  if (want('kjede')) {
    const all = { deviceParse: true, deviceOcr: true, macOcr: true, tesseract: true, gemini: true, compareMac: true };
    out.routes.push(tag({ route: 'kjede', ...(await runOnce('kjede', { steps: all }, { deviceOcr: devOcr?.error ? null : devOcr })) }));
  }
}

/* ---------------- Reserveløsningene (eksplisitt) ---------------- */
const ALL = { deviceParse: true, deviceOcr: true, macOcr: true, tesseract: true, gemini: true, compareMac: true };
const MAC_DOWN = 'http://mac.nede.invalid:8765', OLLAMA_DOWN = 'http://ollama.nede.invalid:11434';
const FAKE_GEMINI_KEY = 'AIza-evalrcpt48-falsk-nokkel-brukes-aldri';
const step = (r, s) => r.pipeline?.find((e) => e.step === s) ?? null;
function check(name, title, r, conds) {
  const failed = conds.filter((c) => !c[1]).map((c) => c[0]);
  out.fallbacks.push({ name, title, ok: !r.crash && !failed.length, failed: r.crash ? ['krasjet'] : failed, info: conds.filter((c) => c[2]).map((c) => c[2]), result: r });
}
if (cfg.fallback) {
  // 1) Mac-OCR av (tjenesten svarer ikke) → C «unavailable», Tesseract prøves (T), Gemini ikke (sperren på).
  {
    const r = await runOnce('mac-av', { steps: ALL, macUrl: MAC_DOWN, sperre: true });
    const C = step(r, 'C'), T = step(r, 'T');
    check('mac-av', 'Mac-OCR utilgjengelig → Tesseract', r, [
      ['C er «unavailable»', C?.status === 'unavailable'],
      ['T ble prøvd (ikke hoppet over)', !!T && T.status !== 'skipped', T?.status === 'unavailable' ? `Tesseract er ikke installert her: ${T.error}` : null],
      ['ingen kall ut av huset', !r.calls?.blocked?.length && !r.calls?.gemini],
    ]);
  }
  // 2) device_parse ugyldig (feil total, dato i fremtiden) → A «failed», kjeden går videre (B med device-OCR).
  {
    const base = fasitJson.receipt ?? { merchant: fasit.merchant, date: fasit.date, total: fasit.total, items: [] };
    const bad = { ...base, total: (Number(base.total) || 100) + 137, date: '2031-01-01', items: (base.items ?? []).slice(0, 1) };
    const r = await runOnce('device-parse-ugyldig', { steps: ALL, macUrl: MAC_DOWN, sperre: true }, { deviceParse: bad, deviceOcr: devOcr?.error ? null : devOcr });
    const A = step(r, 'A');
    check('device-parse-ugyldig', 'Ugyldig device_parse → neste steg', r, [
      ['A er «failed»', A?.status === 'failed'],
      ['A ble ikke brukt', r.used !== 'A'],
      ['B ble prøvd', !devOcr || !!step(r, 'B') && step(r, 'B').status !== 'skipped'],
      ['den ugyldige totalen ble ikke valgt', r.receipt?.total !== bad.total],
    ]);
  }
  // 3) Gemini av fordi «Finansdata forlater aldri huset» er på – selv med nøkkel og alle lokale veier nede.
  {
    const r = await runOnce('gemini-sperret', { steps: { ...ALL, tesseract: false }, macUrl: MAC_DOWN, sperre: true, geminiKey: FAKE_GEMINI_KEY });
    const D = step(r, 'D');
    check('gemini-sperret', 'Sperren på → ingen Gemini, ingen kall ut', r, [
      ['D hoppet over pga. sperren', D?.status === 'skipped' && /forlater aldri huset/.test(D.reason ?? '')],
      ['ingen kall til Gemini eller andre eksterne', !r.calls?.gemini && !r.calls?.blocked?.length],
      ['ingen kvittering (til manuell godkjenning)', r.used === null && r.receipt === null],
    ]);
  }
  // 4) Gemini uten nøkkel (sperren av) → D hoppes over med «nøkkel mangler».
  {
    const keep = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const r = await runOnce('gemini-uten-nokkel', { steps: { ...ALL, tesseract: false }, macUrl: MAC_DOWN, sperre: false });
    if (keep) process.env.GEMINI_API_KEY = keep;
    const D = step(r, 'D');
    check('gemini-uten-nokkel', 'Sperren av, men ingen nøkkel → D hoppes over', r, [
      ['D hoppet over (nøkkel mangler)', D?.status === 'skipped' && /nøkkel mangler/i.test(D.reason ?? '')],
      ['ingen kall til Gemini', !r.calls?.gemini && !r.calls?.blocked?.length],
    ]);
  }
  // 5) Lokal modell nede → modellstegene hoppes over videre (bare ett mislykket forsøk), ingen sky-reserve med sperren på.
  {
    const r = await runOnce('modell-nede', { steps: ALL, ollamaUrl: OLLAMA_DOWN, sperre: true }, { deviceOcr: devOcr?.error ? null : devOcr });
    const later = (r.pipeline ?? []).filter((e) => ['C', 'T'].includes(e.step) && e.status === 'skipped' && /lokal modell utilgjengelig/.test(e.reason ?? ''));
    check('modell-nede', 'Ollama nede → modellstegene hoppes over', r, [
      ['B feilet med feil (ikke tidsavbrudd per steg)', !devOcr || step(r, 'B')?.status === 'error'],
      ['senere modellsteg hoppet over', later.length > 0],
      ['ingen kall ut av huset', !r.calls?.blocked?.length && !r.calls?.gemini],
    ]);
  }
}

// Kvitteringsdata fra ekte kvitteringer blir i resultatfila (tests/receipts/results/ er i .gitignore).
out.ms = Math.round(performance.now() - t00);
out.blockedTotal = net.trace.filter((c) => c.kind === 'blocked').map((c) => `${c.host}${c.path}`);
writeFileSync(outFile, JSON.stringify(out, null, 2));
if (!cfg.keep) { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* */ } }
process.exit(0);
