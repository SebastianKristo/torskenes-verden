#!/usr/bin/env node
// GLIMT47 eval: kjører Glimt-casene mot den EKTE modellen (eller en falsk med --backend mock), N ganger hver,
// med fryst klokke (2026-10-24 10:00 Europe/Oslo), fersk DATA_DIR per kjøring og mockede eksterne data.
// Se eval/README.md. Bruk: npm run eval -- [--backend ollama|openwebui|omlx|mock] [--url …] [--key …] [--runs 3] [--case 01,07] …
// Prompt 58: --backend omlx kjører de samme casene mot oMLX (MLX på Mac mini-en) med egen standardruting for MLX-modell-ID-ene, og
// rapporten har motoren i tittelen og p50/p90 per case og totalt (for alle motorer).
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { STANDARD_ROUTING, envFailure55 } from './lib/env.mjs';
import { STANDARD_OMLX58, OMLX_TASKS58, pct58, resolveMlx58, ENGINE_LABEL58 } from './lib/omlx58.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const require = createRequire(import.meta.url);

/* ---------------- Argumenter ---------------- */

const HELP = `Glimt eval (GLIMT47)

  npm run eval -- [valg]

  --backend ollama|openwebui|omlx|mock
                                    Modellen (standard ollama). mock = falsk modell uten nett (CI/rigg-sjekk).
                                    omlx = oMLX (OpenAI-kompatibel MLX-server) for oppgavene glimt, sok, brief, dom, fsok, rc.
  --url URL                         Ollama (standard $OLLAMA_URL eller http://localhost:11434), Open WebUI-adressen eller oMLX
                                    (standard $OMLX_URL eller http://127.0.0.1:18040 = oMLX bak vakten på Mac mini-en).
  --key KEY                         Open WebUI API-nøkkel (eller $OPENWEBUI_KEY) / oMLX-nøkkelen (eller $OMLX_API_KEY).
  --ollama-url URL                  Med openwebui/omlx: Ollama direkte (embeddings, Chat, kvitteringenes tekststeg; med omlx også
                                    reserven når --omlx-fallback er på). Valgfri (med omlx: standard $OLLAMA_URL).
  --omlx-fallback                   Med omlx: slå på «Bruk Ollama hvis oMLX ikke svarer» (standard AV i eval, så tallene er rene oMLX).
  --runs N                          Kjøringer per case (standard 3).
  --case 01,07,vaer                 Bare casene med id som starter med / inneholder dette.
  --routing prod-db|standard|auto|FIL.json
                                    Modellrutingen. prod-db = les ai_routing fra produksjonsbasen ($DATA_DIR/homelab.db,
                                    skrivebeskyttet; standard når den finnes, f.eks. i containeren). standard = alle tekstruter
                                    (glimt, sok, chat, brief, fsok, kat, dom) qwen3:8b, rc/bar qwen2.5vl:7b, kb nomic-embed-text.
                                    (Prompt 55: llama3.2:3b er tatt ut av standarden.)
                                    auto = appens standard (tomme ruter, appen velger). FIL = JSON fra GET /api/ai/routing.
  --db PATH                         homelab.db for --routing prod-db (standard $DATA_DIR/homelab.db).
  --model M                         Overstyr tekstrutene (glimt, sok, chat, brief, fsok, kat) med M.
  --vision-model M                  Overstyr bilderutene (rc, bar) med M.
  --timeout SEK                     Maks tid per kjøring (standard 900).
  --keep                            Behold DATA_DIR for hver kjøring (stien står i JSON-resultatet).
  --out DIR                         Resultatmappe (standard eval/results).
  --quiet                           Ikke skriv fremdrift per kjøring.

  Miljø (prompt 55): EVAL_MAC_OCR_URL + EVAL_MAC_OCR_KEY kobler på Mac-OCR (ellers har eval ingen Mac-OCR). Feil som skyldes
  miljøet (ingen OCR, modell ikke installert) får status «env» og telles ikke som modellfeil.
`;
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  if (!a.startsWith('--')) continue;
  const [k, inline] = a.slice(2).split('=');
  const flag = ['keep', 'quiet', 'omlx-fallback'].includes(k);
  opt[k] = flag ? true : inline ?? argv[++i];
}
const ORIG_DATA_DIR = process.env.DATA_DIR || join(REPO, 'data');
const backend = (opt.backend ?? 'ollama').toLowerCase();
if (!['ollama', 'openwebui', 'omlx', 'mock'].includes(backend)) { console.error(`Ukjent --backend ${backend}`); process.exit(2); }
const runs = Math.max(1, +(opt.runs ?? 3) || 3);
const timeoutMs = Math.max(30, +(opt.timeout ?? 900) || 900) * 1000;
let url = opt.url ?? (backend === 'openwebui' ? process.env.OPENWEBUI_URL : backend === 'omlx' ? process.env.OMLX_URL ?? 'http://127.0.0.1:18040' : process.env.OLLAMA_URL) ?? 'http://localhost:11434';
if (backend === 'mock') url = 'http://ollama.mock47:11434';
url = String(url).replace(/\/+$/, '');
const key = opt.key ?? (backend === 'omlx' ? process.env.OMLX_API_KEY : process.env.OPENWEBUI_KEY) ?? '';
if (backend === 'openwebui' && (!opt.url && !process.env.OPENWEBUI_URL || !key)) { console.error('--backend openwebui krever --url og --key'); process.exit(2); }
const ollamaUrl = backend === 'openwebui' ? (opt['ollama-url'] ?? '') : backend === 'omlx' ? String(opt['ollama-url'] ?? process.env.OLLAMA_URL ?? '').replace(/\/+$/, '') : url;

/* ---------------- Ruting ---------------- */

// Prompt 55: sok og kat er qwen3:8b (ikke llama3.2:3b): ingen modellbytter mellom tolkning og svar med OLLAMA_MAX_LOADED_MODELS=1.
const STANDARD = STANDARD_ROUTING;
const TEXT_TASKS = ['glimt', 'sok', 'chat', 'brief', 'fsok', 'kat'], VISION_TASKS = ['rc', 'bar'];
function readProdRouting(dbPath) {
  const Database = require(join(REPO, 'node_modules', 'better-sqlite3'));
  const d = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const get = (u, k) => { const r = d.prepare('SELECT value FROM kv WHERE user=? AND key=?').get(u, k); return r ? JSON.parse(r.value) : null; };
    const full = get('owner', 'ai_routing');
    // Personlige valg (glimt, sok, chat, brief) ligger per bruker: ta administratoren (eieren) sine.
    let users = [];
    try { users = d.prepare("SELECT id, username, role FROM users ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END, rowid").all(); } catch { users = d.prepare('SELECT id, username FROM users').all(); }
    const who = users.find((u) => u.username?.toLowerCase() === String(process.env.USER_NAME ?? '').toLowerCase()) ?? users[0];
    const user = who ? get(who.id, 'ai_routing_user') : null;
    return { full, user, who: who?.username ?? null };
  } finally { d.close(); }
}
let routingMode = opt.routing ?? null;
const dbPath = opt.db ?? join(ORIG_DATA_DIR, 'homelab.db');
if (!routingMode) routingMode = backend !== 'mock' && existsSync(dbPath) ? 'prod-db' : 'standard';
let tasks = {}, routingFull = null, userRouting = null, routingNote = '';
if (routingMode === 'prod-db') {
  const r = readProdRouting(dbPath);
  routingFull = r.full; userRouting = r.user;
  routingNote = `produksjonsbasen ${dbPath}${r.who ? ` (personlige valg fra ${r.who})` : ''}`;
  if (!routingFull) routingNote += ' – fant ingen ai_routing, appens standard brukes';
} else if (routingMode === 'standard') {
  tasks = Object.fromEntries(Object.entries(STANDARD).map(([k, m]) => [k, { model: m, fallback: '' }]));
  routingNote = 'standard (tekst qwen3:8b, rc/bar qwen2.5vl:7b, kb nomic-embed-text)';
} else if (routingMode === 'auto') {
  routingNote = 'auto (appens standard: tomme ruter)';
} else {
  const j = JSON.parse(readFileSync(resolve(routingMode), 'utf8'));
  routingFull = j.routing ?? j; userRouting = j.user ?? null;
  routingNote = `fil ${routingMode}`;
}
const setTasks = (ids, m) => { for (const k of ids) { tasks[k] = { model: m, fallback: '' }; if (userRouting?.tasks?.[k]) delete userRouting.tasks[k]; } };
// Prompt 58: med omlx har MLX-modellene egen ruting (oMLX-motoren per oppgave); Ollama-rutene over gjelder Chat, embeddings og reserven.
const omlxModels = backend === 'omlx' ? { ...STANDARD_OMLX58 } : null;
if (omlxModels) {
  if (opt.model) for (const k of OMLX_TASKS58.filter((t) => !['rc', 'bar'].includes(t))) omlxModels[k] = opt.model;
  if (opt['vision-model']) omlxModels.rc = opt['vision-model'];
} else {
  if (opt.model) setTasks(TEXT_TASKS, opt.model);
  if (opt['vision-model']) setTasks(VISION_TASKS, opt['vision-model']);
}

/* ---------------- Cases ---------------- */

const caseDir = join(HERE, 'cases');
let caseFiles = readdirSync(caseDir).filter((f) => /^\d.*\.mjs$/.test(f)).sort();
if (opt.case) { const want = String(opt.case).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); caseFiles = caseFiles.filter((f) => want.some((w) => f.toLowerCase().startsWith(w) || f.toLowerCase().includes(w))); }
if (!caseFiles.length) { console.error('Ingen caser valgt.'); process.exit(2); }
const metas = [];
for (const f of caseFiles) { const m = (await import(pathToFileURL(join(caseDir, f)).href)).default; metas.push({ file: f, id: m.id, title: m.title, area: m.area }); }

/* ---------------- Modellsjekk ---------------- */

const mask = (s) => String(s ?? '').replace(/(sk-)[A-Za-z0-9_\-.]{4,}/g, '$1••••');
let inventory = null, inventoryErr = null;
if (backend === 'ollama') {
  try { const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) }); inventory = (await r.json()).models?.map((m) => m.name) ?? []; }
  catch (e) { inventoryErr = `Fikk ikke kontakt med Ollama på ${url} (${e?.cause?.code ?? e.message}).`; }
} else if (backend === 'openwebui') {
  try { const r = await fetch(`${url}/api/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) }); const j = await r.json(); inventory = (j.data ?? j.models ?? []).map((m) => m.id ?? m.name); }
  catch (e) { inventoryErr = `Fikk ikke kontakt med Open WebUI på ${url} (${e?.cause?.code ?? e.message}).`; }
} else if (backend === 'omlx') {
  try {
    const r = await fetch(`${url}/v1/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) inventoryErr = `oMLX på ${url} avviste nøkkelen (HTTP ${r.status}). Bruk --key (nøkkelen fra tools/omlx/install.sh).`;
    else { const j = await r.json(); inventory = (j.data ?? j.models ?? []).map((m) => m.id ?? m.name).filter(Boolean); }
  } catch (e) { inventoryErr = `Fikk ikke kontakt med oMLX på ${url} (${e?.cause?.code ?? e.message}). Kjører LaunchAgenten? (tools/omlx/README.md)`; }
  // Bruk ID-ene oMLX selv oppgir (med eller uten «mlx-community/»).
  if (inventory) for (const [k, m] of Object.entries(omlxModels)) omlxModels[k] = resolveMlx58(m, inventory) ?? m;
}
if (inventoryErr) { console.error(inventoryErr); process.exit(3); }
const wanted = new Set(backend === 'omlx' ? Object.values(omlxModels) : [...Object.values(tasks).map((t) => t.model), ...Object.values(routingFull?.tasks ?? {}).map((t) => t?.model), ...Object.values(userRouting?.tasks ?? {}).map((t) => t?.model)].filter(Boolean));
const has = (m) => inventory?.some((x) => x === m || x === `${m}:latest` || `${x}:latest` === m);
const missing = inventory ? [...wanted].filter((m) => !has(m)) : [];

/* ---------------- Kjør ---------------- */

let commit = null;
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* ikke et git-repo (container) */ }
const tmpRoot = mkdtempSync(join(tmpdir(), 'glimt-eval-run-'));
const omlx = backend === 'omlx' ? { models: omlxModels, tasks: OMLX_TASKS58, fallback: !!opt['omlx-fallback'] } : null;
const cfg = { backend, url, key, ollamaUrl, tasks, routingFull, userRouting, keepData: !!opt.keep, tmpRoot, omlx };
const engineLabel = ENGINE_LABEL58[backend] ?? backend;
const log = (...a) => { if (!opt.quiet) console.log(...a); };
console.log(`Glimt eval · motor ${engineLabel} · backend ${backend}${backend !== 'mock' ? ` · ${mask(url)}` : ''} · ruting: ${backend === 'omlx' ? `oMLX ${Object.entries(omlxModels).map(([k, m]) => `${k}=${m}`).join(', ')}${omlx.fallback ? ' · reserve Ollama på' : ' · uten Ollama-reserve'}` : routingNote} · ${runs} kjøring(er) × ${metas.length} caser · klokke 2026-10-24 10:00 Europe/Oslo`);
if (missing.length) console.log(`ADVARSEL: modeller i rutingen som ikke er installert${backend === 'omlx' ? ' på oMLX' : ''}: ${missing.join(', ')} (appen faller da til reserve/auto)`);

// Bare et lite, kjent miljø går videre til kjøringene: ingen produksjonsnøkler (Google, HA, IMAP, Cloudflare …) og ingen
// produksjons-DATA_DIR (worker.mjs lager sin egen). Slik kan eval trygt kjøres inne i containeren.
function cleanEnv() {
  const keep = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LANGUAGE|LC_\w+|TMPDIR|TMP|TEMP|SystemRoot|ComSpec|PATHEXT|TESSDATA_PREFIX|OCR_FALLBACK|EVAL_\w+|NODE_OPTIONS|NODE_EXTRA_CA_CERTS)$/; // EVAL_MAC_OCR_URL/KEY går med
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.test(k)));
}
// Andre klienter på samme Ollama (f.eks. Homelab-serveren eller Open WebUI) gir kø og modellbytter med OLLAMA_MAX_LOADED_MODELS=1.
// /api/ps leses hvert 2. sekund mens casen kjører; modeller eval ikke bruker selv blir notert per kjøring og vist i rapporten.
const OURS = new Set([...Object.values(cfg?.tasks ?? {}).map((t) => (typeof t === "string" ? t : t?.model ?? "")), ...Object.values(STANDARD_ROUTING)].map((m) => String(m).replace(/:latest$/, '')));
async function psModels() {
  if (backend === 'omlx') return omlxForeign();
  if (backend !== 'ollama') return [];
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 1500);
    const j = await fetch(`${url.replace(/\/$/, '')}/api/ps`, { signal: ac.signal }).then((r) => r.json()).finally(() => clearTimeout(t));
    return (j?.models ?? []).map((m) => String(m.name ?? m.model ?? '').replace(/:latest$/, '')).filter(Boolean);
  } catch { return []; }
}
// Prompt 58: oMLX – /v1/models viser lastede modeller bare hvis oMLX oppgir det (loaded/status); ellers droppes sjekken. Det som teller
// mest på 16 GB er om Ollama holder en modell samtidig (to motorer om samme minne), så /api/ps på --ollama-url sjekkes også.
const OURS_MLX = new Set(Object.values(omlxModels ?? {}));
async function omlxForeign() {
  const out = [];
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 1500);
    const j = await fetch(`${url}/v1/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: ac.signal }).then((r) => r.json()).finally(() => clearTimeout(t));
    for (const m of j?.data ?? []) { const ld = typeof m.loaded === 'boolean' ? m.loaded : /^(loaded|ready|running|active)$/i.test(String(m.status ?? '')) ? true : null; if (ld && !OURS_MLX.has(m.id)) out.push(`oMLX:${m.id}`); }
  } catch { /* */ }
  if (ollamaUrl) {
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 1500);
      const j = await fetch(`${ollamaUrl}/api/ps`, { signal: ac.signal }).then((r) => r.json()).finally(() => clearTimeout(t));
      for (const m of j?.models ?? []) { const n = String(m.name ?? m.model ?? '').replace(/:latest$/, ''); if (n && !/embed/i.test(n)) out.push(`Ollama:${n}`); }
    } catch { /* */ }
  }
  return out;
}
function watchForeign() {
  const seen = new Set();
  const tick = async () => { for (const m of await psModels()) if (!OURS.has(m)) seen.add(m); };
  tick();
  const iv = setInterval(tick, 2000);
  return () => { clearInterval(iv); return [...seen]; };
}
{
  const pre = (await psModels()).filter((m) => !OURS.has(m));
  if (pre.length && backend === 'omlx') console.log(`  ADVARSEL: ${pre.join(', ')} er lastet. På 16 GB bør ikke Ollama og oMLX holde en modell samtidig: kjør «ollama stop <modell>» (eller keep_alive 0) og pause AI-køen i Homelab, ellers blir tidene feil.`);
  else if (pre.length) console.log(`  ADVARSEL: Ollama har ${pre.join(', ')} lastet – noe annet (Homelab-serveren, Open WebUI) bruker den. Pause AI-køen i Homelab (AI-kontroll → Jobber) eller stopp klienten, ellers blir tidene og tidsavbruddene feil.`);
}
function runOne(meta, i) {
  const stopWatch = watchForeign();
  return new Promise((res) => {
    const out = join(tmpRoot, `${meta.id}-${i}.json`);
    const t0 = Date.now();
    const child = spawn(process.execPath, [join(HERE, 'worker.mjs'), join(caseDir, meta.file), out], { cwd: REPO, env: { ...cleanEnv(), EVAL47_CONFIG: JSON.stringify(cfg) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    child.stdout.on('data', (d) => { logs += d; });
    child.stderr.on('data', (d) => { logs += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.on('exit', (code, sig) => {
      clearTimeout(timer);
      let r;
      try { r = JSON.parse(readFileSync(out, 'utf8')); }
      catch { r = { case: meta.id, ok: false, checks: [], reason: sig ? `Tidsavbrudd etter ${Math.round(timeoutMs / 1000)} s` : `Riggfeil: worker avsluttet med kode ${code}`, error: logs.slice(-2000), riggError: true, ms: Date.now() - t0, trace: {} }; }
      if (r.error && /^Riggfeil/.test(r.reason ?? '')) r.riggError = true;
      r.log = logs.split('\n').filter((l) => l.trim()).slice(-60);
      r.run = i;
      r.foreign = stopWatch();
      const env = envFailure(r, logs) ?? (!r.ok && !r.riggError && r.foreign.length ? `${backend === 'omlx' ? 'Annen modell lastet samtidig' : 'Ollama ble brukt av noe annet samtidig'} (${r.foreign.join(', ')})` : null);
      if (env) { r.status = 'env'; r.envReason = env; } else r.status = r.ok ? 'ok' : r.riggError ? 'rigg' : 'feil';
      res(r);
    });
  });
}

// Prompt 58: med omlx uten --ollama-url går Chat, embeddings og kvitteringenes tekststeg fortsatt til Ollama (finnes ikke) → miljøfeil.
const noOllama58 = (r, logs) => (backend === 'omlx' && !ollamaUrl && !r.ok && !r.riggError && /ollama\.eval-unset/.test(`${logs}\n${JSON.stringify(r.trace?.model ?? [])}\n${JSON.stringify(r.trace?.steps ?? [])}`)
  ? 'trenger Ollama (Chat/embeddings/kvitteringstekst går ikke via oMLX) – kjør med --ollama-url' : null);
const envFailure = (r, logs) => noOllama58(r, logs) ?? envFailure55(r, logs, missing); // prompt 55: miljøfeil (eval/lib/env.mjs)
const all = [];
for (const meta of metas) {
  const results = [];
  for (let i = 1; i <= runs; i++) {
    const r = await runOne(meta, i);
    results.push(r);
    log(`  ${r.ok ? 'OK  ' : r.riggError ? 'RIGG' : r.status === 'env' ? 'ENV ' : 'FEIL'} ${meta.id} #${i} ${(r.ms / 1000).toFixed(1)} s${r.ok ? '' : r.status === 'env' ? ` – miljø: ${r.envReason} (${String(r.reason ?? '').slice(0, 140)})` : ` – ${String(r.reason ?? '').slice(0, 220)}`}`);
  }
  const ms = results.map((r) => r.ms ?? 0).sort((a, b) => a - b);
  all.push({ ...meta, passes: results.filter((r) => r.ok).length, envRuns: results.filter((r) => r.status === 'env').length, envReasons: [...new Set(results.filter((r) => r.status === 'env').map((r) => r.envReason))], runs, medianMs: ms[Math.floor((ms.length - 1) / 2)],
    p50Ms: pct58(ms, 0.5), p90Ms: pct58(ms, 0.9), models: [...new Set(results.flatMap((r) => r.models ?? []))],
    maxPromptTokens: Math.max(0, ...results.map((r) => r.tokens?.maxPrompt ?? 0)), riggErrors: results.filter((r) => r.riggError).length, results });
}

/* ---------------- Rapport ---------------- */

const pad = (s, n) => { s = String(s); return s.length > n ? `${s.slice(0, n - 1)}…` : s + ' '.repeat(n - s.length); };
const firstReason = (c) => { const r = c.results.find((x) => !x.ok && x.status !== 'env') ?? c.results.find((x) => !x.ok); return r ? `${r.status === 'env' ? `[miljø: ${r.envReason}] ` : ''}${r.reason ?? ''}` : ''; };
const okText = (c) => `${c.passes}/${c.runs}${c.envRuns ? ` (${c.envRuns} env)` : ''}`;
const sec = (v) => `${((v ?? 0) / 1000).toFixed(1)} s`;
const rows = all.map((c) => [c.id, okText(c), sec(c.medianMs), sec(c.p50Ms), sec(c.p90Ms), c.models.join(', ') || '–', c.maxPromptTokens || '–', c.passes === c.runs ? '' : firstReason(c)]);
const head = ['Case', 'OK', 'Median', 'p50', 'p90', 'Modell(er)', 'Maks prompt-tok', 'Grunn (første feil)'];
const widths = [26, 11, 8, 8, 8, 26, 15, 90];
console.log(`\n${head.map((h, i) => pad(h, widths[i])).join(' ')}\n${widths.map((w) => '-'.repeat(w)).join(' ')}`);
for (const r of rows) console.log(r.map((x, i) => pad(x, widths[i])).join(' '));
const totalPass = all.reduce((a, c) => a + c.passes, 0), total = all.reduce((a, c) => a + c.runs, 0);
const green = all.filter((c) => c.passes === c.runs).length;
// Prompt 55: miljøfeil på egen linje – ikke talt som modellfeil (de er med i «total», men ikke i «modellfeil»).
const envTotal = all.reduce((a, c) => a + c.envRuns, 0);
const modelFails = total - totalPass - envTotal;
const envLine = envTotal ? `Miljøfeil (ikke modellfeil): ${envTotal} kjøring(er) · ${[...new Set(all.flatMap((c) => c.envReasons))].join(' | ')} · caser: ${all.filter((c) => c.envRuns).map((c) => c.id).join(', ')}` : null;
// Prompt 58: p50/p90 over alle kjøringer (samme mål for alle motorer, så Ollama og oMLX kan sammenlignes).
const allMs = all.flatMap((c) => c.results.map((r) => r.ms ?? 0)).sort((a, b) => a - b);
const p50All = pct58(allMs, 0.5), p90All = pct58(allMs, 0.9);
console.log(`\nTotalt ${totalPass}/${total} kjøringer bestått · ${green}/${all.length} caser ${runs}/${runs} · modellfeil ${modelFails}${envTotal ? ` · miljøfeil ${envTotal}` : ''} · motor ${engineLabel} · p50 ${sec(p50All)} · p90 ${sec(p90All)}`);
if (envLine) console.log(envLine);

// Prompt 55: tid per modellkall (modell, steg/tittel, total, lasting fra Ollama) – modellbytter og kald lasting synes i rapporten.
function modelTimes(calls) {
  const list = calls.filter((m) => m.kind !== 'embed').map((m) => `${m.model}${m.think ? ' (think)' : ''} ${((m.ms ?? 0) / 1000).toFixed(1)} s${m.loadMs > 500 ? ` [lasting ${(m.loadMs / 1000).toFixed(1)} s]` : ''}${m.error ? ' ✗' : ''}`);
  const swaps = calls.filter((m, i) => m.kind !== 'embed' && i && calls[i - 1].model !== m.model).length;
  return `kall: ${list.join(' → ')}${swaps ? ` · ${swaps} modellbytte(r)` : ''}`;
}
const date = new Date().toISOString().slice(0, 10);
const modelTag = ((backend === 'omlx' ? String(omlxModels.glimt).split('/').pop() : null) || tasks.glimt?.model || routingFull?.tasks?.glimt?.model || userRouting?.tasks?.glimt?.model || (backend === 'mock' ? 'mock' : 'auto')).replace(/[^\w.-]+/g, '_');
const outDir = resolve(opt.out ?? join(HERE, 'results'));
mkdirSync(outDir, { recursive: true });
let base = join(outDir, `${date}-${backend}-${modelTag}`);
for (let n = 2; existsSync(`${base}.json`); n++) base = join(outDir, `${date}-${backend}-${modelTag}-${n}`);
const meta = { date: new Date().toISOString(), frozenClock: '2026-10-24T10:00:00+02:00 (Europe/Oslo)', backend, engine: engineLabel, url: backend === 'mock' ? null : mask(url), ollamaUrl: backend === 'openwebui' || backend === 'omlx' ? (ollamaUrl || null) : undefined,
  ...(omlx ? { omlx: { models: omlxModels, tasks: OMLX_TASKS58, fallbackOllama: omlx.fallback } } : {}),
  routing: { mode: routingMode, note: routingNote, effective: all[0]?.results?.[0]?.routing ?? null }, missingModels: missing, runs, commit, node: process.version };
writeFileSync(`${base}.json`, JSON.stringify({ meta, summary: { passed: totalPass, total, greenCases: green, cases: all.length, modelFailures: modelFails, envFailures: envTotal, engine: engineLabel, p50Ms: p50All, p90Ms: p90All }, cases: all }, null, 2));
const md = [`# Glimt eval ${date} · motor ${engineLabel} · ${backend} · ${modelTag}`, '',
  `- Klokke: ${meta.frozenClock}`, `- Motor: ${engineLabel} · backend: ${backend}${meta.url ? ` (${meta.url})` : ''}`, `- Ruting: ${routingNote}`,
  ...(omlx ? [`- oMLX-ruting: ${Object.entries(omlxModels).map(([k, m]) => `${k}=${m}`).join(', ')} · Ollama-reserve ${omlx.fallback ? 'på' : 'av'}${ollamaUrl ? ` · Ollama (Chat, embeddings, kvitteringstekst) ${mask(ollamaUrl)}` : ''}`] : []),
  `- Tid per kjøring: p50 ${sec(p50All)} · p90 ${sec(p90All)} (alle kjøringer)`,
  `- Effektiv ruting: ${Object.entries(meta.routing.effective ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')}`,
  ...(missing.length ? [`- Mangler i ${backend === 'omlx' ? 'oMLX' : 'Ollama'}: ${missing.join(', ')}`] : []), `- Commit: ${commit ?? 'ukjent'} · Node ${process.version}`, '',
  `**${totalPass}/${total} kjøringer bestått · ${green}/${all.length} caser ${runs}/${runs} · modellfeil ${modelFails}${envTotal ? ` · miljøfeil ${envTotal}` : ''}**`, '',
  ...(envLine ? [`> ${envLine}`, ''] : []),
  `- Miljø: ${(all[0]?.results?.[0]?.env?.notes ?? []).join(' · ') || 'OCR tilgjengelig'}`, '',
  '| Case | OK | Median | p50 | p90 | Modell(er) | Maks prompt-tok | Grunn (første feil) |', '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.map((x) => String(x).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`), '',
  '## Per case', '',
  ...all.flatMap((c) => [`### ${c.id} – ${c.title} (${c.passes}/${c.runs})`, '', ...c.results.flatMap((r) => [
    `- Kjøring ${r.run}: ${r.ok ? 'OK' : r.status === 'env' ? `ENV (${r.envReason})` : 'FEIL'}${r.foreign?.length && r.ok ? ` (andre på Ollama: ${r.foreign.join(', ')})` : ''} · ${(r.ms / 1000).toFixed(1)} s · modellkall ${r.tokens?.calls ?? 0} · prompt-tok maks ${r.tokens?.maxPrompt ?? '–'}${r.trace?.model?.length ? ` · ${modelTimes(r.trace.model)}` : ''}`,
    ...(r.checks ?? []).map((k) => `  - ${k.info ? 'ℹ' : k.ok ? '✓' : '✗'} ${k.name}${k.detail ? `: ${String(k.detail).replace(/\n/g, ' ')}` : ''}`),
    ...(r.riggError ? [`  - Riggfeil: ${String(r.error ?? '').split('\n')[0]}`] : []),
  ]), '']),
].join('\n');
writeFileSync(`${base}.md`, md);
console.log(`Resultat: ${base}.json og ${base}.md`);
if (!opt.keep) { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } }
process.exit(all.some((c) => c.riggErrors) ? 1 : 0);
