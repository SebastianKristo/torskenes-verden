#!/usr/bin/env node
// EVALRCPT48: kvitterings-eval (make eval-receipts / npm run eval:receipts). Kjører hver kvittering i tests/receipts/fixtures/
// (syntetiske) og tests/receipts/real/ (dine egne, i .gitignore) gjennom hver vei SEPARAT via serverens egen kjede
// (server/receipts48/chain.js) med ekte modell, og rapporterer per vei og per felt. Se tests/receipts/README.md.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, extname, basename } from 'node:path';
import { tmpdir, homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const HELP = `Kvitterings-eval (prompt 48)

  make eval-receipts [OLLAMA=…] [MODEL=…] [ARGS="…"]      (eller: npm run eval:receipts -- [valg])
  make eval-receipts-mock                                  (mock-modus, for CI)

  --mock                 Falsk modell, Mac-OCR, Tesseract og Gemini (ingen nett). Viser at riggen virker, måler ikke kvalitet.
  --ollama URL           Ollama (standard $OLLAMA_URL eller http://localhost:11434). Modellkall går via serverens AI-gate.
  --model M              Tekstmodellen (standard qwen3:8b).
  --mac-url URL          Mac-OCR (standard $MAC_OCR_URL, ellers bind_ip/port fra Mac-ens config.json, ellers http://10.69.1.173:8765).
  --mac-key-file FIL     Les nøkkelen fra vision-ocr sin config.json. Standard: $MAC_OCR_KEY, ellers
                         ~/Library/Application Support/vision-ocr/config.json når evalen kjøres på Mac mini-en.
  --sperre på|av         «Finansdata forlater aldri huset» (standard på). Gemini (vei D) kjøres BARE når GEMINI_API_KEY
                         er satt OG --sperre av.
  --routes B,C,T,D,kjede Veiene (standard A,B,C,T,D,kjede). A = device_parse (krever <navn>.device_parse.json),
                         B = lagret device-OCR + modell, C = Mac-OCR + modell, T = Tesseract + modell, D = Gemini,
                         kjede = hele kjeden med alt på (bilde + device-OCR).
  --only syntetiske|ekte Bare fixtures/ eller bare real/.
  --case navn[,navn]     Bare kvitteringer der navnet inneholder dette.
  --runs N               Kjøringer per vei (standard 1; modellen kjører med temperature 0).
  --no-fallback          Hopp over reservetestene (Mac-OCR av, ugyldig device_parse, Gemini av, modell nede).
  --fallback-on navn     Kvitteringen reservetestene kjøres på (standard den første).
  --model-timeout SEK    Tidsgrense per modellkall (standard 90, som i serveren).
  --mac-timeout SEK      Tidsgrense for Mac-OCR (standard 30, som i serveren).
  --timeout SEK          Maks tid per kvittering (standard 1800).
  --out DIR              Resultatmappe (standard tests/receipts/results, i .gitignore).
  --keep                 Behold DATA_DIR for hver kvittering.
`;
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  if (!a.startsWith('--')) continue;
  const [k, inline] = a.slice(2).split(/=(.*)/s);
  opt[k] = ['mock', 'keep', 'no-fallback', 'quiet'].includes(k) ? true : inline ?? argv[++i];
}
const mock = !!opt.mock;
const model = opt.model || 'qwen3:8b';
const strip = (u) => String(u ?? '').trim().replace(/\/+$/, '');
const sperreArg = String(opt.sperre ?? 'på').toLowerCase();
if (!['på', 'pa', 'on', 'av', 'off'].includes(sperreArg)) { console.error('--sperre må være på eller av'); process.exit(2); }
const sperre = !['av', 'off'].includes(sperreArg);
const routes = String(opt.routes ?? 'A,B,C,T,D,kjede').split(',').map((s) => s.trim()).filter(Boolean);
const bad = routes.filter((r) => !['A', 'B', 'C', 'T', 'D', 'kjede'].includes(r));
if (bad.length) { console.error(`Ukjent vei: ${bad.join(', ')}`); process.exit(2); }
const runs = Math.max(1, +(opt.runs ?? 1) || 1);
const timeoutMs = Math.max(60, +(opt.timeout ?? 1800) || 1800) * 1000;
const clampN = (v, lo, hi, d) => (Number.isFinite(+v) && v !== undefined ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);

/* ---------------- Mac-OCR: adresse og nøkkel ---------------- */
const MAC_CONFIG = join(homedir(), 'Library', 'Application Support', 'vision-ocr', 'config.json');
let macCfg = null;
const keyFile = opt['mac-key-file'] ?? (platform() === 'darwin' && existsSync(MAC_CONFIG) ? MAC_CONFIG : null);
if (keyFile) { try { macCfg = JSON.parse(readFileSync(keyFile, 'utf8')); } catch (e) { console.error(`Kunne ikke lese ${keyFile}: ${e.message}`); process.exit(2); } }
let macUrl = strip(opt['mac-url'] ?? process.env.MAC_OCR_URL ?? (macCfg?.bind_ip ? `http://${macCfg.bind_ip}:${macCfg.port ?? 8765}` : 'http://10.69.1.173:8765'));
let macKey = process.env.MAC_OCR_KEY || macCfg?.key || '';
let ollamaUrl = strip(opt.ollama ?? process.env.OLLAMA_URL ?? 'http://localhost:11434');
const geminiKey = process.env.GEMINI_API_KEY || '';
let geminiAllowed = !!geminiKey && !sperre;
let geminiWhy = !geminiKey ? 'GEMINI_API_KEY er ikke satt' : sperre ? '«Finansdata forlater aldri huset» er på (bruk --sperre av for å teste Gemini)' : null;
if (mock) { ollamaUrl = 'http://ollama.mock48:11434'; macUrl = 'http://mac.mock48:8765'; macKey = 'm'.repeat(64); geminiAllowed = true; geminiWhy = null; }

/* ---------------- Kvitteringene ---------------- */
const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const dirs = [];
if (opt.only !== 'ekte') dirs.push({ dir: join(HERE, 'fixtures'), real: false });
if (opt.only !== 'syntetiske') dirs.push({ dir: join(HERE, 'real'), real: true });
const fixtures = [], warnings = [];
for (const { dir, real } of dirs) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).sort()) {
    if (!IMG.has(extname(f).toLowerCase())) continue;
    const id = basename(f, extname(f));
    const p = (s) => join(dir, `${id}${s}`);
    if (!existsSync(p('.json'))) { warnings.push(`${real ? 'real' : 'fixtures'}/${f}: mangler fasit ${id}.json – hoppet over`); continue; }
    fixtures.push({ id: real ? `ekte/${id}` : id, real, image: join(dir, f), fasit: p('.json'), deviceOcr: existsSync(p('.device_ocr.json')) ? p('.device_ocr.json') : null,
      deviceParse: existsSync(p('.device_parse.json')) ? p('.device_parse.json') : null, macOcr: existsSync(p('.mac_ocr.json')) ? p('.mac_ocr.json') : null });
  }
}
let chosen = fixtures;
if (opt.case) { const w = String(opt.case).toLowerCase().split(',').filter(Boolean); chosen = fixtures.filter((x) => w.some((s) => x.id.toLowerCase().includes(s))); }
if (!chosen.length) { console.error('Fant ingen kvitteringer (bilde + <navn>.json).'); for (const w of warnings) console.error(`  ${w}`); process.exit(2); }
const fallbackOn = opt['no-fallback'] ? null : (opt['fallback-on'] ? chosen.find((x) => x.id.includes(opt['fallback-on']))?.id : chosen[0].id);

/* ---------------- Forhåndssjekk (ekte modus) ---------------- */
const pre = { ollama: null, model: null, mac: null, tesseract: null };
if (!mock) {
  try {
    const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const names = ((await r.json()).models ?? []).map((m) => m.name);
    pre.ollama = 'ok';
    pre.model = names.some((n) => n === model || n === `${model}:latest`) ? 'installert' : `MANGLER (ollama pull ${model})`;
  } catch (e) { console.error(`Fikk ikke kontakt med Ollama på ${ollamaUrl} (${e?.cause?.code ?? e.message}). Bruk --ollama URL.`); process.exit(3); }
  if (!macKey) pre.mac = 'ingen nøkkel (MAC_OCR_KEY eller --mac-key-file) – vei C hoppes over';
  else {
    try {
      const r = await fetch(`${macUrl}/health`, { headers: { authorization: `Bearer ${macKey}` }, signal: AbortSignal.timeout(4000) });
      if (r.ok) { const j = await r.json(); pre.mac = `ok (versjon ${j.version ?? '?'}, språk ${(j.languages ?? []).join(', ')})`; }
      else if (r.status === 403) pre.mac = `403 – denne maskinens IP er ikke på tjenestens tillatelseslista. Se «Kjøre på Mac mini-en» i tests/receipts/README.md (midlertidig ./install.sh --allow 10.69.1.39,10.69.1.173).`;
      else if (r.status === 401) pre.mac = '401 – feil nøkkel';
      else pre.mac = `svarte ${r.status}`;
    } catch (e) { pre.mac = `kan ikke nås på ${macUrl} (${e?.cause?.code ?? e.message})`; }
  }
  try { pre.tesseract = execFileSync('tesseract', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().split('\n')[0]; }
  catch { pre.tesseract = `ikke installert – vei T viser «unavailable»${platform() === 'darwin' ? ' (brew install tesseract tesseract-lang)' : ''}`; }
}

/* ---------------- Kjør ---------------- */
const tmpRoot = mkdtempSync(join(tmpdir(), 'rcpt48-run-'));
const mask = (s) => (macKey ? String(s).split(macKey).join('•••') : String(s));
console.log(`Kvitterings-eval · ${mock ? 'MOCK (falsk modell/Mac/Tesseract/Gemini – måler ikke kvalitet)' : `Ollama ${ollamaUrl} · ${model} (${pre.model})`} · ${chosen.length} kvittering(er) · veier ${routes.join(', ')} · ${runs} kjøring(er)`);
if (!mock) {
  console.log(`  Mac-OCR ${macUrl}: ${pre.mac}`);
  console.log(`  Tesseract: ${pre.tesseract}`);
  console.log(`  Gemini: ${geminiAllowed ? 'TILLATT (GEMINI_API_KEY satt og --sperre av) – bildene sendes til Google' : `av – ${geminiWhy}`}`);
}
for (const w of warnings) console.log(`  Advarsel: ${w}`);

function cleanEnv() {
  const keep = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LANGUAGE|LC_\w+|TMPDIR|TMP|TEMP|SystemRoot|ComSpec|PATHEXT|TESSDATA_PREFIX|NODE_OPTIONS|NODE_EXTRA_CA_CERTS)$/;
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.test(k)));
}
function runOne(fx, i) {
  return new Promise((res) => {
    const out = join(tmpRoot, `${i}.json`);
    const cfg = { fixture: fx, mock, ollamaUrl, macUrl, macKey, geminiAllowed, geminiKey: mock ? 'AIza-mock48' : geminiAllowed ? geminiKey : '', geminiWhy, sperre, model,
      macTimeoutS: clampN(opt['mac-timeout'], 3, 120, 30), modelTimeoutS: clampN(opt['model-timeout'], 10, 300, 90), runs, routes, fallback: fx.id === fallbackOn,
      warmup: i === 0, tmpRoot, keep: !!opt.keep };
    const child = spawn(process.execPath, [join(HERE, 'worker.mjs'), out], { cwd: REPO, env: cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(JSON.stringify(cfg)); // nøkler via stdin, ikke miljø/argumenter
    let logs = '';
    child.stdout.on('data', (d) => { logs += d; });
    child.stderr.on('data', (d) => { logs += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('exit', (code, sig) => {
      clearTimeout(timer);
      let r;
      try { r = JSON.parse(readFileSync(out, 'utf8')); }
      catch { r = { id: fx.id, real: fx.real, rigg: sig ? `tidsavbrudd etter ${timeoutMs / 1000} s` : `worker avsluttet med kode ${code}`, log: mask(logs.slice(-3000)), routes: [], fallbacks: [] }; }
      res(r);
    });
  });
}
const results = [];
for (let i = 0; i < chosen.length; i++) {
  const fx = chosen[i];
  process.stdout.write(`  ${fx.id} … `);
  const r = await runOne(fx, i);
  results.push(r);
  const done = r.routes.filter((x) => !x.skipped && !x.unavailable);
  console.log(r.rigg ? `RIGGFEIL: ${r.rigg}` : `${done.filter((x) => x.fields?.all).length}/${done.length} veier helt riktige${r.fallbacks.length ? ` · reserve ${r.fallbacks.filter((f) => f.ok).length}/${r.fallbacks.length}` : ''} · ${((r.ms ?? 0) / 1000).toFixed(1)} s`);
}

/* ---------------- Rapport ---------------- */
const ROUTE_NAME = { A: 'A device_parse', B: 'B device-OCR+modell', C: 'C Mac-OCR+modell', T: 'T Tesseract+modell', D: 'D Gemini', kjede: 'kjede (alt på)' };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const sec = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const frac = (xs, f) => { const v = xs.map(f).filter((x) => x !== null && x !== undefined); return v.length ? `${v.filter(Boolean).length}/${v.length}` : '–'; };
const perRoute = routes.map((rt) => {
  const xs = results.flatMap((r) => r.routes.filter((x) => x.route === rt && !x.skipped));
  const skipped = results.flatMap((r) => r.routes.filter((x) => x.route === rt && x.skipped).map((x) => x.skipped));
  const ok = xs.filter((x) => !x.crash && !x.unavailable);
  const unavail = [...new Set(xs.filter((x) => x.unavailable).map((x) => x.unavailable))];
  return { route: rt, n: ok.length, unavail, skipped: [...new Set(skipped)], crash: xs.filter((x) => x.crash).length,
    all: frac(ok, (x) => x.fields?.all), merchant: frac(ok, (x) => x.fields?.merchant.ok), date: frac(ok, (x) => x.fields?.date.ok), total: frac(ok, (x) => x.fields?.total.ok),
    items: frac(ok, (x) => x.fields?.items.ok), passed: frac(ok, (x) => x.passed), median: median(ok.map((x) => x.ms)), max: ok.length ? Math.max(...ok.map((x) => x.ms)) : null,
    modelCalls: ok.reduce((a, x) => a + (x.calls?.model ?? 0), 0), used: [...new Set(ok.map((x) => x.used ?? '–'))].join(',') };
});
const pad = (s, n) => { s = String(s); return s.length > n ? `${s.slice(0, n - 1)}…` : s + ' '.repeat(n - s.length); };
const table = (head, widths, rows) => [head.map((h, i) => pad(h, widths[i])).join(' '), widths.map((w) => '-'.repeat(w)).join(' '), ...rows.map((r) => r.map((x, i) => pad(x, widths[i])).join(' '))].join('\n');
const routeRows = perRoute.map((p) => [ROUTE_NAME[p.route], p.n ? p.all : '–', p.merchant, p.date, p.total, p.items, p.passed, sec(p.median), sec(p.max), p.n ? p.modelCalls : '–', [p.n ? p.used : '', p.unavail.length ? `utilgjengelig: ${p.unavail.join('; ')}` : '', !p.n && p.skipped.length ? `hoppet over: ${p.skipped.join('; ')}` : ''].filter(Boolean).join(' · ') || '–']);
console.log(`\nPer vei (riktige / kjørt)\n${table(['Vei', 'Alle felt', 'Butikk', 'Dato', 'Total', 'Varelinjer', 'Besto kontroll', 'Median', 'Maks', 'Modellkall', 'Valgt steg / merknad'], [20, 9, 7, 7, 7, 10, 14, 8, 8, 10, 60], routeRows)}`);

const mark = (f) => (f == null ? '–' : f.ok === null ? '·' : f.ok ? '✓' : '✗');
const cell = (x) => (!x ? '' : x.skipped ? 'hoppet over' : x.crash ? 'KRASJ' : x.unavailable ? 'utilgjengelig' : `${mark(x.fields.merchant)}${mark(x.fields.date)}${mark(x.fields.total)}${mark(x.fields.items)} ${sec(x.ms)}`);
const recRows = results.map((r) => [r.id, ...(r.rigg ? [`RIGGFEIL: ${r.rigg}`] : routes.map((rt) => cell(r.routes.find((x) => x.route === rt && (x.run ?? 1) === 1) ?? r.routes.find((x) => x.route === rt))))]);
console.log(`\nPer kvittering (butikk, dato, total, varelinjer · tid; første kjøring)\n${table(['Kvittering', ...routes.map((r) => ROUTE_NAME[r])], [26, ...routes.map(() => 20)], recRows)}`);

const misses = results.flatMap((r) => r.routes.filter((x) => x.fields && !x.fields.all && !x.unavailable).map((x) => `${r.id} · ${x.route}: ${['merchant', 'date', 'total', 'items'].filter((k) => x.fields[k].ok === false).map((k) => `${k} ${JSON.stringify(x.fields[k].got)} ≠ ${JSON.stringify(x.fields[k].want)}`).join(', ') || 'ingen kvittering'}${x.failed_fields?.length ? ` (kontroll: ${x.failed_fields.join(', ')})` : ''}`));
if (misses.length) console.log(`\nAvvik\n${misses.map((m) => `  ${m}`).join('\n')}`);

const fb = results.flatMap((r) => r.fallbacks.map((f) => ({ ...f, id: r.id })));
if (fb.length) {
  console.log(`\nReserveløsningene (på ${fallbackOn})\n${table(['Test', 'OK', 'Detaljer'], [44, 4, 90], fb.map((f) => [f.title, f.ok ? 'OK' : 'FEIL', [f.failed.length ? `feilet: ${f.failed.join('; ')}` : '', ...f.info, `steg: ${(f.result.pipeline ?? []).map((e) => `${e.step}=${e.status}`).join(' ')}`].filter(Boolean).join(' · ')]))}`);
}
const blocked = [...new Set(results.flatMap((r) => r.blockedTotal ?? []))];
console.log(blocked.length ? `\nBLOKKERTE KALL UT AV HUSET: ${blocked.join(', ')}` : '\nIngen forsøk på kall ut av huset (bortsett fra tillatt Gemini).');
const rigg = results.filter((r) => r.rigg || r.routes.some((x) => x.crash));
const fbFail = fb.filter((f) => !f.ok);

const date = new Date().toISOString().slice(0, 10);
const outDir = resolve(opt.out ?? join(HERE, 'results'));
mkdirSync(outDir, { recursive: true });
let base = join(outDir, `${date}-${mock ? 'mock' : model.replace(/[^\w.-]+/g, '_')}`);
for (let n = 2; existsSync(`${base}.json`); n++) base = join(outDir, `${date}-${mock ? 'mock' : model.replace(/[^\w.-]+/g, '_')}-${n}`);
let commit = null;
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* */ }
const meta = { date: new Date().toISOString(), mode: mock ? 'mock' : 'ekte', model, ollama: mock ? null : ollamaUrl, macUrl: mock ? null : macUrl, sperre, geminiAllowed, routes, runs, pre, commit, node: process.version };
writeFileSync(`${base}.json`, mask(JSON.stringify({ meta, perRoute, fallbacks: fb.map(({ result, ...f }) => ({ ...f, pipeline: result.pipeline })), results }, null, 2)));
const md = [`# Kvitterings-eval ${date} · ${meta.mode} · ${model}`, '', `- Ollama: ${meta.ollama ?? 'mock'} · Mac-OCR: ${meta.macUrl ?? 'mock'} (${pre.mac ?? 'mock'}) · Tesseract: ${pre.tesseract ?? 'mock'}`,
  `- Sperren «Finansdata forlater aldri huset»: ${sperre ? 'på' : 'av'} · Gemini: ${geminiAllowed ? 'tillatt' : `av (${geminiWhy})`} · commit ${commit ?? '?'}`, '',
  '## Per vei', '', '| Vei | Alle felt | Butikk | Dato | Total | Varelinjer | Besto kontroll | Median | Maks | Modellkall | Valgt steg / merknad |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...routeRows.map((r) => `| ${r.map((x) => String(x).replace(/\|/g, '\\|')).join(' | ')} |`), '',
  '## Per kvittering', '', `| Kvittering | ${routes.map((r) => ROUTE_NAME[r]).join(' | ')} |`, `|---|${routes.map(() => '---').join('|')}|`,
  ...recRows.map((r) => `| ${r.join(' | ')} |`), '', '✓/✗ i rekkefølgen butikk, dato, total, antall varelinjer.', '',
  ...(misses.length ? ['## Avvik', '', ...misses.map((m) => `- ${m}`), ''] : []),
  ...(fb.length ? ['## Reserveløsningene', '', ...fb.map((f) => `- ${f.ok ? '✓' : '✗'} ${f.title}${f.failed.length ? ` – feilet: ${f.failed.join('; ')}` : ''}${f.info.length ? ` (${f.info.join('; ')})` : ''} · ${(f.result.pipeline ?? []).map((e) => `${e.step}=${e.status}`).join(' ')}`), ''] : []),
  blocked.length ? `**Blokkerte kall ut av huset:** ${blocked.join(', ')}` : 'Ingen forsøk på kall ut av huset.'].join('\n');
writeFileSync(`${base}.md`, mask(md));
console.log(`Resultat: ${base}.json og ${base}.md${chosen.some((x) => x.real) ? ' (inneholder data fra dine ekte kvitteringer – ligger i .gitignore)' : ''}`);
try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ }
if (rigg.length) console.error(`Riggfeil i: ${rigg.map((r) => r.id).join(', ')}${rigg[0].log ? `\n${rigg[0].log}` : ''}`);
if (fbFail.length) console.error(`Reservetester som feilet: ${fbFail.map((f) => f.name).join(', ')}`);
// 0 = riggen virket og reservetestene besto (veiene er en måling, ikke en port). 1 = riggfeil eller reservetest feilet.
process.exit(rigg.length || fbFail.length || blocked.length ? 1 : 0);
