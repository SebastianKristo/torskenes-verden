#!/usr/bin/env node
// Prompt 72 (LFM72): kvitterings-eval for LFM-visjonsmodellene mot dagens kjede. Kjøres LOKALT på Mac mini-en mot en mappe med
// dine egne kvitteringer (bilde + <navn>.json-fasit ved siden av) – bildene og fasiten ligger aldri i repoet. Repoet har bare de
// syntetiske eksemplene i eval/fixtures/receipts72/. Se tools/lfm72/README.md.
//
// Kombinasjonene (samme kjede som serveren: server/receipts48/chain.js og ocr-raw51.js, alle modellkall via ai-run/ai-gate):
//   C        dagens kjede: Apple Vision OCR (Mac-OCR) + qwen3:8b
//   V-qwen   steg V med qwen2.5vl (ingen OCR)
//   V-lfm3   steg V med LFM3-VL-2B (ingen tenking)
//   V-lfm25  steg V med LFM2.5-VL-3B layout → qwen3:8b
//   CL       C med layout-steget L (LFM2.5-layouten ordner Apple Vision-linjene før qwen3:8b; består ikke L, kjøres C)
//   X-lfm3   crossCheck51 med LFM3-VL-2B: leser totalen; skal godta riktig total og flagge en feil total (fasit + 10 kr)
//
// Rapport i eval/results/ (gitignored): <dato>-receipts72-<motor>.md og .json, én tabell per motor. Ingen kvitteringsinnhold – bare
// hash av filnavnet og tall. --dry kjører alt mot en falsk Ollama og falsk Mac-OCR (CI og riggsjekk, måler ikke kvalitet).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, extname, basename } from 'node:path';
import { tmpdir, homedir, platform } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { COMBOS72, COMBO_IDS72, fileHash72, fasit72, score72, envKind72, summarize72, report72, slimRun72 } from './lib/receipts72.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const HELP = `Kvitterings-eval for LFM (prompt 72)

  node eval/receipts72.mjs [valg]            (npm run eval:receipts72 -- [valg])

  --dir MAPPE[,MAPPE]     Bilder (jpg/png/webp/heic) + <navn>.json-fasit. Standard eval/fixtures/receipts72 (syntetiske).
                          Fasit: {"butikk", "avdeling"?, "dato":"ÅÅÅÅ-MM-DD", "total", "linjer":[{"navn","belop"}]}
                          (eller merchant/date/total/items:[{description, amount}]).
  --combos C,V-qwen,V-lfm3,V-lfm25,CL,X-lfm3
                          Kombinasjonene (standard alle).
  --runs N                Kjøringer per kvittering og kombinasjon (standard 1).
  --case tekst            Bare kvitteringer der filnavnet inneholder teksten.
  --ollama URL            Ollama (standard $OLLAMA_URL eller http://localhost:11434). Aldri eksponert ut av huset.
  --lfm-backend ollama|omlx
                          Motor for LFM-modellene (standard ollama). omlx = oMLX bak vakten (--omlx, --omlx-key).
  --omlx URL              oMLX (standard $OMLX_URL eller http://127.0.0.1:18040). Nøkkel: $OMLX_API_KEY (anbefalt) eller --omlx-key KEY.
  --lfm3 M / --lfm25 M    Modellnavn (standard: se server/receipts48/lfm72.js – hf.co/LiquidAI/… for Ollama, mlx-community/… for oMLX).
  --text-model M          Tekstmodellen (standard qwen3:8b). --vision-model M: visjonsmodellen for V-qwen (standard qwen2.5vl:7b).
  --mac-url URL           Mac-OCR (standard $MAC_OCR_URL, ellers config.json på Mac-en, ellers http://10.69.1.173:8765).
  --mac-key-file FIL      vision-ocr sin config.json (standard ~/Library/Application Support/vision-ocr/config.json på Mac-en),
                          eller $MAC_OCR_KEY. Uten nøkkel får C og CL status «miljø».
  --model-timeout SEK     Tidsgrense per modellkall (standard 120). --mac-timeout SEK (standard 30).
  --no-warmup             Ikke kjør én oppvarming per kombinasjon (lastetiden måles da i første kjøring).
  --dry                   Falsk Ollama og Mac-OCR (ingen nett). Viser at riggen virker, måler ikke kvalitet.
  --out MAPPE             Resultatmappe (standard eval/results, i .gitignore).
`;
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  if (!a.startsWith('--')) continue;
  const [k, inline] = a.slice(2).split(/=(.*)/s);
  opt[k] = ['dry', 'no-warmup', 'quiet'].includes(k) ? true : inline ?? argv[++i];
}
const dry = !!opt.dry;
const strip = (u) => String(u ?? '').trim().replace(/\/+$/, '');
const combos = String(opt.combos ?? COMBO_IDS72.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const badCombo = combos.filter((c) => !COMBO_IDS72.includes(c));
if (badCombo.length) { console.error(`Ukjent kombinasjon: ${badCombo.join(', ')} (gyldige: ${COMBO_IDS72.join(', ')})`); process.exit(2); }
const runs = Math.max(1, +(opt.runs ?? 1) || 1);
const lfmBackend = String(opt['lfm-backend'] ?? 'ollama').toLowerCase();
if (!['ollama', 'omlx'].includes(lfmBackend)) { console.error('--lfm-backend må være ollama eller omlx'); process.exit(2); }
const textModel = opt['text-model'] || 'qwen3:8b', visionModel = opt['vision-model'] || 'qwen2.5vl:7b';
const clampN = (v, lo, hi, d) => (v !== undefined && Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
const modelTimeoutS = clampN(opt['model-timeout'], 10, 300, 120), macTimeoutS = clampN(opt['mac-timeout'], 3, 120, 30);

/* ---------------- Adresser og nøkler (nøklene skrives aldri ut) ---------------- */
const MAC_CONFIG = join(homedir(), 'Library', 'Application Support', 'vision-ocr', 'config.json');
const keyFile = opt['mac-key-file'] ?? (platform() === 'darwin' && existsSync(MAC_CONFIG) ? MAC_CONFIG : null);
let macCfg = null;
if (keyFile) { try { macCfg = JSON.parse(readFileSync(keyFile, 'utf8')); } catch (e) { console.error(`Kunne ikke lese ${keyFile}: ${e.message}`); process.exit(2); } }
let ollamaUrl = strip(opt.ollama ?? process.env.OLLAMA_URL ?? 'http://localhost:11434');
let macUrl = strip(opt['mac-url'] ?? process.env.MAC_OCR_URL ?? (macCfg?.bind_ip ? `http://${macCfg.bind_ip}:${macCfg.port ?? 8765}` : 'http://10.69.1.173:8765'));
let macKey = process.env.MAC_OCR_KEY || macCfg?.key || '';
let omlxUrl = strip(opt.omlx ?? process.env.OMLX_URL ?? 'http://127.0.0.1:18040');
const omlxKey = opt['omlx-key'] ?? process.env.OMLX_API_KEY ?? '';
if (dry) { ollamaUrl = 'http://ollama.dry72:11434'; macUrl = 'http://mac.dry72:8765'; macKey = 'k'.repeat(64); }

/* ---------------- Kvitteringene ---------------- */
const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };
const dirs = String(opt.dir ?? join(HERE, 'fixtures', 'receipts72')).split(',').map((d) => resolve(d.trim())).filter(Boolean);
const receipts = [], skipped = [];
for (const dir of dirs) {
  if (!existsSync(dir)) { console.error(`Fant ikke mappen ${dir}`); process.exit(2); }
  for (const f of readdirSync(dir).sort()) {
    if (!IMG.has(extname(f).toLowerCase())) continue;
    const id = basename(f, extname(f)), fasitPath = join(dir, `${id}.json`);
    if (opt.case && !id.toLowerCase().includes(String(opt.case).toLowerCase())) continue;
    if (!existsSync(fasitPath)) { skipped.push(fileHash72(f)); continue; }
    receipts.push({ hash: fileHash72(f), image: join(dir, f), mime: MIME[extname(f).toLowerCase()], fasit: fasit72(JSON.parse(readFileSync(fasitPath, 'utf8'))) });
  }
}
if (!receipts.length) { console.error('Fant ingen kvitteringer (bilde + <navn>.json).'); process.exit(2); }

/* ---------------- Miljø (før serveren importeres) ---------------- */
const dataDir = mkdtempSync(join(tmpdir(), 'rcpt72-'));
process.env.DATA_DIR = dataDir;
process.env.SESSION_SECRET = 'evalrcpt72-secret-evalrcpt72-secret-evalrcpt72';
process.env.USER_NAME = process.env.USER_NAME || 'Sebastian';
process.env.NODE_ENV = 'test'; // ingen HTTP-lytter og ingen bakgrunnsjobber
process.env.TZ = 'Europe/Oslo';
process.env.AI_FALLBACK = 'none';
delete process.env.MOCK_DATA;
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'ROBOFLOW_API_KEY', 'AI_PROVIDER', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL', 'OPENWEBUI_URL', 'OPENWEBUI_KEY', 'AI_BACKEND', 'MAC_OCR_KEY', 'MAC_OCR_URL', 'OMLX_URL', 'OMLX_API_KEY', 'OMLX_TASKS']) delete process.env[k];
process.env.OLLAMA_URL = ollamaUrl;
process.env.AI_BACKEND = 'ollama';
process.env.MAC_OCR_URL = macUrl;
if (macKey) process.env.MAC_OCR_KEY = macKey;
if (lfmBackend === 'omlx') { process.env.OMLX_URL = omlxUrl; if (omlxKey) process.env.OMLX_API_KEY = omlxKey; process.env.OMLX_FALLBACK = '0'; }

/* ---------------- Nettet: bare Ollama, Mac-OCR og oMLX i huset; alt annet blokkeres og telles ---------------- */
const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };
const HOSTS = { [hostOf(ollamaUrl)]: 'ollama', [hostOf(macUrl)]: 'mac', ...(lfmBackend === 'omlx' ? { [hostOf(omlxUrl)]: 'omlx' } : {}) };
const realFetch = globalThis.fetch.bind(globalThis);
const net = { blocked: [], loadMs: 0, calls: 0, pending: new Set() };
let CURRENT = null; // kvitteringen som kjøres (bare --dry bruker den, til den falske modellen)
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url), kind = HOSTS[u.host];
  if (!kind) { net.blocked.push(u.host); throw Object.assign(new TypeError(`fetch failed (eval: ${u.host} er blokkert – kvitteringer leses bare i huset)`), { cause: { code: 'EBLOCKED72' } }); }
  const res = dry ? await fakeServer(kind, u, init) : await realFetch(input, init);
  if (kind !== 'mac' && /\/(api\/chat|v1\/chat\/completions)$/.test(u.pathname)) {
    net.calls++;
    // Ollama oppgir load_duration (ns) i siste bit av strømmen: lastetiden telles for seg.
    if (kind === 'ollama' && res.ok && res.body) {
      const p = res.clone().text().then((t) => { for (const l of t.split('\n')) { try { const j = JSON.parse(l); if (j.done && j.load_duration) net.loadMs += j.load_duration / 1e6; } catch { /* */ } } }).catch(() => {}).finally(() => net.pending.delete(p));
      net.pending.add(p);
    }
  }
  return res;
};

/* ---------------- Serveren (bare modulene kjeden bruker) ---------------- */
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const fdb = await imp('server/finans/db.js');
const ai = await imp('server/ai-run.js');
const chain = await imp('server/receipts48/chain.js');
const ocr51 = await imp('server/receipts48/ocr-raw51.js');
const lfm = await imp('server/receipts48/lfm72.js');
ai._setAiFetch?.((u, i) => globalThis.fetch(u, i));
ai.migrateOnce?.();
const OWNER = fdb.OWNER;
const categories = fdb.DEFAULT_CATEGORIES.filter((c) => c[2] === 'expense').map((c) => c[0]);
const lfm3 = opt.lfm3 || lfm.LFM_MODELS72[lfmBackend].lfm3, lfm25 = opt.lfm25 || lfm.LFM_MODELS72[lfmBackend].lfm25;
const MODELS = { text: textModel, vision: visionModel, lfm3, lfm25 };
const NEEDS = { C: [textModel], 'V-qwen': [visionModel], 'V-lfm3': [lfm3], 'V-lfm25': [lfm25, textModel], CL: [lfm25, textModel], 'X-lfm3': [lfm3] };

// Ruting: rc = visjonsmodellen (V-qwen), «Finansdata forlater aldri huset» PÅ (sperren skal holde også i evalen).
{
  const r = JSON.parse(JSON.stringify(ai.routing(OWNER)));
  delete r.own;
  r.tasks = { ...r.tasks, rc: { model: visionModel, fallback: '' } };
  r.rules = { ...r.rules, finLocal: true };
  ai.saveServerRouting(r);
  ai.invalidateInventory?.();
}
const OFF = { deviceOcr: false, deviceParse: false, compareMac: false, macOcr: false, tesseract: false, layoutStep72: false, visionEngine72: 'qwen25vl', crossCheck72: 'off' };
const STEPS = { C: { macOcr: true }, 'V-qwen': {}, 'V-lfm3': { visionEngine72: 'lfm3vl' }, 'V-lfm25': { visionEngine72: 'lfm25layout' }, CL: { macOcr: true, layoutStep72: true }, 'X-lfm3': { crossCheck72: 'lfm3vl' } };
function apply(combo) {
  fdb.saveSettings({ ollamaUrl, macOcrUrl: macUrl, receipts48: { ...OFF, ...STEPS[combo], textModel, macOcrTimeoutS: macTimeoutS, modelTimeoutS, lfmBackend72: lfmBackend, lfm3Model72: lfm3, lfm25Model72: lfm25 } }, OWNER);
  chain._resetChain48();
}

/* ---------------- Forhåndssjekk (ekte modus): samme miljøsjekker som eval-riggen ---------------- */
const warnings = [];
let inventory = null;
if (!dry) {
  try { inventory = ((await (await globalThis.fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })).json()).models ?? []).map((m) => m.name); }
  catch (e) { console.error(`Fikk ikke kontakt med Ollama på ${ollamaUrl} (${e?.cause?.code ?? e.message}). Bruk --ollama URL.`); process.exit(3); }
  const has = (m) => inventory.some((n) => n === m || n === `${m}:latest` || n.split(':')[0] === m);
  const want = new Set(combos.flatMap((c) => NEEDS[c]).filter((m) => lfmBackend === 'ollama' || ![lfm3, lfm25].includes(m)));
  const missing = [...want].filter((m) => !has(m));
  if (missing.length) warnings.push(`Mangler i Ollama: ${missing.join(', ')} (kjøringene som trenger dem får status «miljø» – se tools/lfm72/README.md)`);
  if (!macKey && combos.some((c) => c === 'C' || c === 'CL')) warnings.push('Ingen Mac-OCR-nøkkel (MAC_OCR_KEY eller --mac-key-file): C og CL får status «miljø»');
}
const psModels = async () => { try { return ((await (await globalThis.fetch(`${ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(3000) })).json()).models ?? []).map((m) => m.name ?? m.model); } catch { return null; } };
const sameM = (a, b) => a === b || a === `${b}:latest` || b === `${a}:latest`;

/* ---------------- Én kjøring ---------------- */
const texts = (res) => [res.macError, ...(res.errors ?? []), ...(res.pipeline ?? []).flatMap((e) => [e.error, e.reason, ...(e.attempts ?? []).map((a) => a.error)])].filter(Boolean).join(' · ');
async function settle() { while (net.pending.size) await Promise.all([...net.pending]); }

async function runOne(combo, rc, run) {
  CURRENT = rc;
  apply(combo);
  const image = readFileSync(rc.image);
  net.loadMs = 0; net.calls = 0;
  const base = { receipt: rc.hash, combo, run };
  if ((combo === 'C' || combo === 'CL') && !macKey) return { ...base, env: 'Mac-OCR utilgjengelig' };
  const t0 = performance.now();
  if (combo === 'X-lfm3') {
    // crossCheck51 med LFM3: riktig total skal godtas, feil total (fasit + 10 kr) skal flagges. Tesseract er av, så LFM står alene.
    const one = async (total) => { const res = { provider: 'ollama', data: { total, merchant: null, org_number: null, confidence: { total: 0.9 } } }; const logs = []; await ocr51.crossCheck51(res, { original: { buf: image, mime: rc.mime }, log: (k, m) => logs.push(`${k}: ${m}`) }); return { d: res.data, logs }; };
    const a = await one(rc.fasit.total), b = await one(Math.round((rc.fasit.total + 10) * 100) / 100);
    await settle();
    const ms = Math.round(performance.now() - t0), l72 = a.d.ocr51?.lfm72;
    if (!l72) { const env = envKind72(a.logs.join(' · ')); return { ...base, ...(env ? { env } : { total: false, passed: false }), ms, loadMs: Math.round(net.loadMs), modelCalls: net.calls }; }
    const flagged = !!b.d.ocr51?.lfm72 && b.d.ocr51.lfm72.agree === false;
    return { ...base, total: l72.total != null && Math.abs(l72.total - rc.fasit.total) < 0.005, date: null, merchant: null, items: null, passed: l72.agree === true && flagged, ms, loadMs: Math.round(net.loadMs), modelCalls: net.calls };
  }
  let res;
  try { res = await chain.runChain48({ image, mime: rc.mime, categories, log: () => {} }); }
  catch (e) { await settle(); const env = envKind72(e.message); return { ...base, ...(env ? { env } : { total: false, passed: false }), ms: Math.round(performance.now() - t0) }; }
  await settle();
  const ms = Math.round(performance.now() - t0);
  const out = { ...base, ms, loadMs: lfmBackend === 'omlx' && combo !== 'C' && combo !== 'V-qwen' ? null : Math.round(net.loadMs), modelCalls: net.calls, used: res.used ?? null, confidence: res.confidence ?? null, failedFields: res.failed_fields ?? [], merchantSource: res.merchant51?.source ?? null };
  const C = res.pipeline?.find((e) => e.step === 'C');
  if ((combo === 'C' || combo === 'CL') && C?.status === 'unavailable') return { ...out, env: 'Mac-OCR utilgjengelig' };
  if (!res.passed && !res.receipt) { const env = envKind72(texts(res)); if (env) return { ...out, env }; }
  const s = score72(res.receipt, rc.fasit, { passed: res.passed });
  return { ...out, ...s };
}

/* ---------------- Kjør ---------------- */
const label = dry ? 'DRY (falsk Ollama og Mac-OCR – måler ikke kvalitet)' : `Ollama ${ollamaUrl}${lfmBackend === 'omlx' ? ` · LFM på oMLX ${omlxUrl}` : ''}`;
console.log(`Kvitterings-eval (prompt 72) · ${label} · ${receipts.length} kvittering(er) · ${combos.join(', ')} · ${runs} kjøring(er)`);
for (const w of warnings) console.log(`  Advarsel: ${w}`);
if (skipped.length) console.log(`  ${skipped.length} bilde(r) uten fasit hoppet over`);
const all = [], warmup = {};
const known = new Set(Object.values(MODELS));
for (const combo of combos) {
  const ps = await psModels();
  const others = (ps ?? []).filter((m) => ![...known].some((k) => sameM(m, k)));
  if (others.length) warnings.push(`Før «${COMBOS72[combo]}»: andre modeller i Ollama-minnet (${others.join(', ')}) – en annen klient bruker Ollama, tidene kan bli påvirket`);
  if (!opt['no-warmup']) { const w = await runOne(combo, receipts[0], 0); warmup[combo] = { loadMs: w.loadMs ?? null, ms: w.ms ?? null, env: w.env ?? null }; }
  for (let run = 1; run <= runs; run++) {
    for (const rc of receipts) {
      const r = await runOne(combo, rc, run);
      all.push(r);
      if (!opt.quiet) console.log(`  ${combo.padEnd(8)} ${rc.hash} #${run}: ${r.env ? `miljø (${r.env})` : `total ${r.total ? 'ok' : 'feil'} · dato ${r.date == null ? '–' : r.date ? 'ok' : 'feil'} · butikk ${r.merchant == null ? '–' : r.merchant ? 'ok' : 'feil'}${r.items ? ` · linjer ${r.items.tp}/${r.items.want}` : ''} · ${((r.ms ?? 0) / 1000).toFixed(1)} s`}`);
    }
  }
}
const after = await psModels();
const othersAfter = (after ?? []).filter((m) => ![...known].some((k) => sameM(m, k)));
if (othersAfter.length) warnings.push(`Etter kjøringen: andre modeller i Ollama-minnet (${othersAfter.join(', ')})`);
if (net.blocked.length) warnings.push(`BLOKKERTE KALL UT AV HUSET: ${[...new Set(net.blocked)].join(', ')}`);

/* ---------------- Rapport ---------------- */
const slim = all.map(slimRun72);
const summary = summarize72(slim);
let commit = null;
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* */ }
const meta = { date: new Date().toISOString().slice(0, 10), dry, runs, receipts: receipts.length, source: dirs.map((d) => (d.startsWith(REPO) ? d.slice(REPO.length + 1) : 'lokal mappe')).join(', '),
  combos, lfmBackend, models: MODELS, mac: dry ? 'falsk' : macKey ? 'nøkkel satt' : 'ingen nøkkel', commit, node: process.version };
const md = report72({ meta, summary, runs: slim, warmup, warnings });
const outDir = resolve(opt.out ?? join(HERE, 'results'));
mkdirSync(outDir, { recursive: true });
let stem = `${meta.date}-receipts72-${dry ? 'dry' : lfmBackend}`;
for (let n = 2; existsSync(join(outDir, `${stem}.json`)); n++) stem = `${meta.date}-receipts72-${dry ? 'dry' : lfmBackend}-${n}`;
writeFileSync(join(outDir, `${stem}.json`), JSON.stringify({ meta, summary, warmup, warnings, runs: slim }, null, 2));
writeFileSync(join(outDir, `${stem}.md`), md);
console.log(`\n${md.split('\n## ')[0]}${md.split('\n## ')[1] ? `\n## ${md.split('\n## ')[1]}` : ''}`);
console.log(`Resultat: ${join(outDir, `${stem}.md`)} og .json`);
try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* */ }
process.exit(0);

/* ---------------- --dry: falsk Ollama og Mac-OCR ---------------- */
function fakeServer(kind, u, init) {
  const enc = new TextEncoder();
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
  const f = CURRENT?.fasit ?? { merchant: 'Butikk', date: null, total: 0, items: [] };
  const kr = (v) => Number(v).toFixed(2).replace('.', ',');
  const nb = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
  if (kind === 'mac') {
    if (u.pathname === '/health') return J({ ok: true, version: 'dry72', languages: ['nb-NO'] });
    // Linjer med bbox [x, y, w, h] (0–1): navn til venstre, beløp til høyre på samme høyde.
    const lines = [{ text: f.aliases?.[0] ?? f.merchant ?? 'Butikk', bbox: [0.3, 0.04, 0.4, 0.04] }, { text: `${nb(f.date)} kl. 12:00`, bbox: [0.3, 0.2, 0.4, 0.03] }];
    f.items.forEach((l, i) => { const y = 0.3 + i * 0.05; lines.push({ text: l.name, bbox: [0.06, y, 0.45, 0.03] }, { text: kr(l.amount), bbox: [0.8, y, 0.14, 0.03] }); });
    const ty = 0.32 + f.items.length * 0.05;
    lines.push({ text: 'TOTALT', bbox: [0.06, ty, 0.2, 0.035] }, { text: `kr ${kr(f.total)}`, bbox: [0.72, ty, 0.22, 0.035] });
    return Promise.resolve(J({ source: 'mac_vision', lines: lines.map((l) => ({ ...l, confidence: 0.99 })), image_size: [640, 1000], ms: 40 }));
  }
  const p = u.pathname;
  const models = [textModel, visionModel, lfm3, lfm25];
  if (p === '/api/tags') return Promise.resolve(J({ models: models.map((name) => ({ name, model: name, size: 3e9, details: { family: 'dry', parameter_size: '3B' } })) }));
  if (p === '/api/ps') return Promise.resolve(J({ models: [] }));
  if (p === '/api/show') return Promise.resolve(J({ capabilities: ['completion', 'vision'], details: {}, model_info: {} }));
  if (p === '/api/chat') {
    const b = JSON.parse(init.body);
    const last = b.messages?.at(-1) ?? {};
    const prompt = String(last.content ?? '');
    const receipt = { merchant: f.aliases?.[0] ?? f.merchant, org_number: null, date: f.date, time: null, currency: 'NOK', items: f.items.map((l) => ({ description: l.name, quantity: null, unit_price: null, amount: l.amount })),
      discounts: [], subtotal: null, vat: [], total: f.total, payment_method: null, category_suggestion: 'Mat og dagligvarer' };
    let content;
    if (prompt.startsWith(lfm.LAYOUT_PROMPT72.slice(0, 20))) {
      const cells = [...f.items.map((l) => `<fcel>${l.name}<fcel>${kr(l.amount)}<nl>`), `<fcel>TOTALT<fcel>${kr(f.total)}<nl>`].join('');
      const ty = 320 + f.items.length * 50;
      content = `image_index=0 page_header [300, 40, 700, 80] ${f.aliases?.[0] ?? f.merchant}\nimage_index=0 text [300, 200, 700, 230] ${nb(f.date)} kl. 12:00\nimage_index=0 table [40, 290, 960, ${ty + 40}]\n<otsl>${cells}</otsl>`;
    } else if (b.format?.properties && Object.keys(b.format.properties).length === 1) content = JSON.stringify({ total: f.total });
    else content = JSON.stringify(receipt);
    // LFM3 kan tenke: <think> skal fjernes før JSON leses (her alltid med, så fjerningen testes).
    if (/lfm3/i.test(b.model)) content = `<think>Leser kvitteringen.</think>${content}`;
    const first = !fakeServer.loaded?.has(b.model);
    (fakeServer.loaded ??= new Set()).add(b.model);
    return Promise.resolve(new Response(new ReadableStream({ start(c) {
      c.enqueue(enc.encode(`${JSON.stringify({ model: b.model, message: { role: 'assistant', content }, done: false })}\n`));
      c.enqueue(enc.encode(`${JSON.stringify({ model: b.model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 500, eval_count: 200, load_duration: first ? 1.5e9 : 1e6 })}\n`));
      c.close();
    } }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } }));
  }
  return Promise.resolve(J({ error: 'ukjent' }, 404));
}
