// Prompt 34 (SERVER34): én felles AI-ruter. Alle korte AI-oppgaver (Glimt/assist, rask time, kalender-Glimt, domener, logo,
// skjermbilder, kategorisering, finans-søk, settings-ask, brief, selvtest) går gjennom run(task, {...}).
//
// HVORFOR (den ekte feilen bak «Glimt står som tilkoblet, men svarer ikke»):
//   - Alle modulene brukte `ollamaTextModel || ollamaModel`, og standarden for ollamaModel er `qwen2.5vl:7b`. Har Ollama-serveren
//     bare f.eks. gemma4:12b / qwen3:8b, svarer Ollama `404 model "qwen2.5vl:7b" not found` – og assist/kalender svelget feilen
//     (`catch {}`) og viste «fikk ikke svar i tide» / «fant ikke noe svar». Ingen validering mot /api/tags.
//   - «Tilkoblet» kom fra at GET /api/tags svarte, ikke fra en ekte generering.
//   - Kalender-Glimt hadde 12 s grense; en 12B-modell som delvis kjører på CPU bruker lenger tid på å laste inn.
//   Nå: ruting per oppgave, validering mot /api/tags (ukjent modell → reserve → første installerte tekstmodell, med advarsel),
//   20 s per forsøk når det finnes en reserve (siste kandidat får aiTimeouts.ollama, standard 45 s), tydelig feiltekst
//   («Glimt fikk ikke svar fra {modell}: {feil}») og logging av hvert kall i jobbloggen (tabell ai_runs).
//
// run(task, {prompt, system?, images?:[Buffer|base64], json?:bool, schema?, user?, temperature?, numPredict?, signal?,
//            localOnly?:bool, title?, timeoutMs?, kind?, ref?, background?})
//   → {text, data?, model, provider:'ollama'|'gemini'|'groq'|'openrouter', ms, tokens:{in,out}, costKr, jobId,
//      fallbackFrom?:'modell-id', warnings:['Modellen «x» finnes ikke på Ollama-serveren · bruker «y»'], notice?}
//   kaster AiRunError {message:'Glimt fikk ikke svar fra {modell}: {feil}', code, model, task, fix:'model'|'api'|'valg'|'nett'|null,
//                      errors:[{model, provider, error}], jobId}
//   task: chat | sok | glimt | brief | rc | kat | fsok | bar | dom | kb, eller et alias (assist, calendar, receipts, categorize …).
//
// Ruting (kv(OWNER,'ai_routing') = serverstandard av admin, kv(bruker,'ai_routing_user') = egne valg for chat/sok/glimt/brief):
//   {tasks:{<id>:{model:'qwen3:8b'|''(auto), fallback:''}}, rules:{localFirst, finLocal, think},
//    params:{keepAlive:'5m'|'30m'|-1|0, numCtx:8192|32768|131072, temperature:0.7, parallel:1–4, minConf:70–95},
//    budget:{monthlyKr:0 (= ingen grense), hardStop:true, warn80:true}, cloudOn:{'gemini-2.5-flash':true, …}, migratedAt}
import { randomUUID } from 'node:crypto';
import { db, kv, OWNER } from './db.js';
import { settings as fhSettings, secret, me } from './finans/db.js';
import { geminiFetch, hasGemini } from './finans/gemini-keys.js';
import { ollamaPost, shortBody, ollamaContent, stripThink, SHORT_NUM_CTX } from './ollama-opts.js';
import { broadcast } from './realtime.js';

/* ---------------- Oppgaver ---------------- */

// [id, navn, beskrivelse, type, finans, personlig]
export const AI_TASKS = [
  { id: 'chat', name: 'Chat', desc: 'Standardmodell i nye samtaler', kind: 'text', fin: false, personal: true },
  { id: 'sok', name: 'AI-søk', desc: 'Søkefeltet og spørsmål i hele appen', kind: 'text', fin: false, personal: true },
  { id: 'glimt', name: 'Glimt · kalender', desc: 'Forstå hendelser og svare om kalenderen', kind: 'text', fin: false, personal: true },
  { id: 'brief', name: 'Glimt · brief', desc: 'Morgen-, dags- og kveldsbrief', kind: 'text', fin: false, personal: true },
  { id: 'rc', name: 'Kvitteringer (bilde)', desc: 'Leser butikk, beløp og varelinjer', kind: 'vision', fin: true, personal: false },
  { id: 'kat', name: 'Kategorisering', desc: 'Foreslår kategori for transaksjoner', kind: 'text', fin: true, personal: false },
  { id: 'fsok', name: 'Finans · spør', desc: '«Har jeg et musikkabonnement?»', kind: 'text', fin: true, personal: false },
  { id: 'bar', name: 'Strekkoder og pakkelapper', desc: 'Bildefelt fra kamera', kind: 'vision', fin: true, personal: false },
  { id: 'dom', name: 'Domener · oppsummering', desc: 'Daglig sammendrag', kind: 'text', fin: false, personal: false },
  { id: 'kb', name: 'Kunnskapsbase', desc: 'Embeddings for dokumenter', kind: 'embed', fin: false, personal: false },
];
const TASK = Object.fromEntries(AI_TASKS.map((t) => [t.id, t]));
export const TASK_ALIAS = { assist: 'sok', search: 'sok', text: 'sok', 'settings-ask': 'sok', settings: 'sok', test: 'sok', calendar: 'glimt', kalender: 'glimt',
  'calendar-quick': 'glimt', 'calendar-glimt': 'glimt', receipts: 'rc', receipt: 'rc', screenshot: 'rc', logo: 'rc', categorize: 'kat', 'finance-search': 'fsok',
  finans: 'fsok', barcode: 'bar', label: 'bar', domains: 'dom', domener: 'dom', embed: 'kb', embeddings: 'kb' };
// Prompt 35: oppgaver som ikke går gjennom run() (ingen ruting), men logges i jobbloggen og forbruket.
export const EXTRA_TASKS = { tts: 'Glimt · stemme (TTS)' };
export const taskId = (t) => (TASK[t] || EXTRA_TASKS[t] ? t : TASK_ALIAS[t] ?? 'sok');
export const taskName = (t) => TASK[taskId(t)]?.name ?? EXTRA_TASKS[t] ?? String(t);

/* ---------------- Nett (injiserbart i tester) ---------------- */

let F = (u, i) => fetch(u, i);
export const _setAiFetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); invalidateInventory(); statusCache.clear(); };
// Tester: kortere tidsgrenser.
export const _aiRunTest = { attemptMs: 20_000, lastMs: null, statusMs: 15_000 };
const MOCK = () => process.env.MOCK_DATA === '1' && !process.env.OLLAMA_URL;

/* ---------------- Ruting ---------------- */

export const KEEP_ALIVE = ['5m', '30m', -1, 0];
export const NUM_CTX = [4096, 8192, 32768, 131072];
const DEFAULT_ROUTING = () => ({
  tasks: Object.fromEntries(AI_TASKS.map((t) => [t.id, { model: '', fallback: '' }])),
  rules: { localFirst: true, finLocal: false, think: false },
  params: { keepAlive: '30m', numCtx: 8192, temperature: 0.7, parallel: 2, minConf: 85 },
  budget: { monthlyKr: 0, hardStop: true, warn80: true },
  cloudOn: {},
});
/** «alltid» → -1, «aldri» → 0, «30 min» → '30m'. Ugyldig → null. */
export function cleanKeepAlive(v) {
  if (v === -1 || v === '-1' || /^(alltid|always|forever)$/i.test(String(v))) return -1;
  if (v === 0 || v === '0' || /^(aldri|never)$/i.test(String(v))) return 0;
  const m = String(v ?? '').trim().toLowerCase().match(/^(\d{1,4})\s*(m|min|minutter|h|t|timer)?$/);
  if (!m) return null;
  const n = +m[1];
  return /^(h|t|timer)$/.test(m[2] ?? '') ? `${n}h` : `${n}m`;
}
/** «32k» → 32768, 8192 → 8192. Ugyldig → null. */
export function cleanNumCtx(v) {
  const m = String(v ?? '').trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(k)?$/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[1].replace(',', '.')) * (m[2] ? 1024 : 1));
  return n >= 1024 && n <= 262144 ? n : null;
}
const cleanModelId = (v) => {
  const s = String(v ?? '').trim().replace(/^models\//, '');
  return s.length <= 120 && /^[\w.:/@+-]*$/.test(s) ? s : null;
};

/** Rensker en routing-del. Ukjente felt ignoreres; ugyldige verdier beholder base. errors får meldingene. */
export function cleanRouting(b, base = DEFAULT_ROUTING(), errors = []) {
  const out = JSON.parse(JSON.stringify(base));
  if (!b || typeof b !== 'object') return out;
  if (b.tasks && typeof b.tasks === 'object') {
    for (const [k, v] of Object.entries(b.tasks)) {
      const id = TASK[k] ? k : TASK_ALIAS[k];
      if (!id) { errors.push(`Ukjent oppgave ${k}`); continue; }
      const cur = out.tasks[id] ?? { model: '', fallback: '' };
      const val = typeof v === 'string' ? { model: v } : v ?? {};
      for (const f of ['model', 'fallback']) if (val[f] !== undefined) { const m = cleanModelId(val[f] ?? ''); if (m === null) errors.push(`Ugyldig modell for ${id}`); else cur[f] = m; }
      out.tasks[id] = cur;
    }
  }
  if (b.rules && typeof b.rules === 'object') for (const k of ['localFirst', 'finLocal', 'think']) if (typeof b.rules[k] === 'boolean') out.rules[k] = b.rules[k];
  const p = b.params ?? {};
  if (p.keepAlive !== undefined) { const v = cleanKeepAlive(p.keepAlive); if (v === null) errors.push('keepAlive må være 5m, 30m, -1 (alltid) eller 0 (aldri)'); else out.params.keepAlive = v; }
  if (p.numCtx !== undefined) { const v = cleanNumCtx(p.numCtx); if (v === null) errors.push('numCtx må være et tall (8192, 32768 eller 131072)'); else out.params.numCtx = v; }
  if (p.temperature !== undefined) { const v = Number(String(p.temperature).replace(',', '.')); if (!Number.isFinite(v) || v < 0 || v > 2) errors.push('temperature må være et tall mellom 0 og 2'); else out.params.temperature = Math.round(v * 100) / 100; }
  if (p.parallel !== undefined) { const v = Math.round(+p.parallel); if (!(v >= 1 && v <= 4)) errors.push('parallel må være 1–4'); else out.params.parallel = v; }
  if (p.minConf !== undefined) { const v = Math.round(+p.minConf); if (!(v >= 50 && v <= 99)) errors.push('minConf må være 50–99'); else out.params.minConf = v; }
  const bu = b.budget ?? {};
  if (bu.monthlyKr !== undefined) { const v = Number(bu.monthlyKr); if (!Number.isFinite(v) || v < 0 || v > 100000) errors.push('monthlyKr må være 0 eller mer'); else out.budget.monthlyKr = Math.round(v); }
  for (const k of ['hardStop', 'warn80']) if (typeof bu[k] === 'boolean') out.budget[k] = bu[k];
  if (b.cloudOn && typeof b.cloudOn === 'object') for (const [k, v] of Object.entries(b.cloudOn)) { const m = cleanModelId(k); if (m && typeof v === 'boolean') out.cloudOn[m] = v; }
  return out;
}

const PERSONAL_TASKS = AI_TASKS.filter((t) => t.personal).map((t) => t.id);
function serverRouting() {
  const raw = kv.get(OWNER, 'ai_routing', null);
  const base = cleanRouting(raw ?? {}, DEFAULT_ROUTING());
  if (raw?.migratedAt) base.migratedAt = raw.migratedAt;
  return base;
}
export function saveServerRouting(r) { const cur = kv.get(OWNER, 'ai_routing', {}) ?? {}; kv.set(OWNER, 'ai_routing', { ...r, migratedAt: cur.migratedAt ?? Date.now(), legacy: cur.legacy ?? legacyOf() }); invalidateStatus(); }
const userOverrides = (u) => kv.get(u, 'ai_routing_user', {}) ?? {};
export function saveUserRouting(u, patch) {
  const cur = userOverrides(u);
  const next = { tasks: { ...(cur.tasks ?? {}) }, rules: { ...(cur.rules ?? {}) }, params: { ...(cur.params ?? {}) } };
  for (const [k, v] of Object.entries(patch.tasks ?? {})) if (PERSONAL_TASKS.includes(k)) next.tasks[k] = v;
  if (typeof patch.rules?.think === 'boolean') next.rules.think = patch.rules.think;
  if (patch.params?.temperature !== undefined) next.params.temperature = patch.params.temperature;
  kv.set(u, 'ai_routing_user', next);
  invalidateStatus(u);
}
/** Rutingen slik brukeren u ser den: serverstandard + egne valg. own[task]=true der brukeren har eget valg. */
export function routing(u = me()) {
  migrateOnce();
  const r = serverRouting(), o = userOverrides(u), own = {};
  for (const [k, v] of Object.entries(o.tasks ?? {})) if (PERSONAL_TASKS.includes(k) && v && (v.model || v.fallback)) { r.tasks[k] = { model: v.model ?? '', fallback: v.fallback ?? '' }; own[k] = true; }
  if (typeof o.rules?.think === 'boolean') r.rules.think = o.rules.think;
  if (o.params?.temperature !== undefined && Number.isFinite(+o.params.temperature)) r.params.temperature = +o.params.temperature;
  return { ...r, own };
}

/* ---------------- Migrering (én gang) ---------------- */

/**
 * Gamle innstillinger → routing, én gang (kv(OWNER,'ai_routing').migratedAt). Bare verdier brukeren faktisk har satt (eller
 * miljøvariabler) brukes; standarden «qwen2.5vl:7b» blir ikke tvunget inn som tekstmodell.
 *   ollamaTextModel || ollamaModel → chat, sok, glimt, brief, kat, fsok, dom · ollamaModel → rc · embedModel → kb
 *   provider/aiTasks (receipts/search/categorize/barcode) og Finans-rutene rRc/rSok/rKat/rBar → modell eller reserve per oppgave
 *   geminiModel/groqModel → sky-modellen for oppgavene som brukte den motoren · chat: eierens chat_settings.model → chat.
 */
const legacyOf = (fh = kv.get(OWNER, 'fh_settings', {}) ?? {}) => {
  const env = process.env;
  return { text: fh.ollamaTextModel || env.OLLAMA_TEXT_MODEL || fh.ollamaModel || env.OLLAMA_MODEL || '', vision: fh.ollamaModel || env.OLLAMA_MODEL || '', embed: fh.embedModel || env.OLLAMA_EMBED_MODEL || '' };
};
// Etter migreringen: endres de gamle feltene (Integrasjoner / FinansHub), følger rutene som fortsatt har den gamle verdien med.
function syncLegacy(raw) {
  const cur = legacyOf(), old = raw.legacy ?? {};
  if (old.text === cur.text && old.vision === cur.vision && old.embed === cur.embed) return;
  const tasks = { ...(raw.tasks ?? {}) };
  const swap = (ids, a, b) => { if (a === b) return; for (const id of ids) { const t = { ...(tasks[id] ?? { model: '', fallback: '' }) }; if (t.model === (a ?? '') && b) t.model = b; if (a && t.fallback === a && b) t.fallback = b; tasks[id] = t; } };
  swap(['chat', 'sok', 'glimt', 'brief', 'kat', 'fsok', 'dom'], old.text, cur.text);
  swap(['rc'], old.vision, cur.vision);
  swap(['kb'], old.embed, cur.embed);
  kv.set(OWNER, 'ai_routing', { ...raw, tasks, legacy: cur });
}
export function migrateOnce() {
  const raw = kv.get(OWNER, 'ai_routing', null);
  if (raw?.migratedAt) { syncLegacy(raw); return false; }
  const fh = kv.get(OWNER, 'fh_settings', {}) ?? {};
  const env = process.env;
  const { text, vision } = legacyOf(fh);
  const gem = fh.geminiModel || env.GEMINI_MODEL || 'gemini-flash-latest';
  const groq = fh.groqModel || env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const groqV = fh.groqVisionModel || env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
  const engineModel = (e, vis) => (e === 'gemini' ? gem : e === 'groq' ? (vis ? groqV : groq) : e === 'ollama' ? (vis ? vision : text) : '');
  const at = fh.aiTasks ?? {};
  const eng = { rc: fh.rRc ?? at.receipts, sok: fh.rSok ?? at.search, fsok: fh.rSok ?? at.search, kat: fh.rKat ?? at.categorize };
  const main = ['gemini', 'groq'].includes(fh.provider) ? fh.provider : 'ollama';
  const r = cleanRouting(raw ?? {}, DEFAULT_ROUTING());
  const set = (id, model, fallback) => { const cur = r.tasks[id]; if (!cur.model && model) cur.model = model; if (!cur.fallback && fallback && fallback !== cur.model) cur.fallback = fallback; };
  for (const id of ['chat', 'sok', 'glimt', 'brief', 'kat', 'fsok', 'dom']) {
    const e = eng[id] ?? main;
    const m = engineModel(e, false) || text;
    set(id, m, e !== 'ollama' ? text : fh.fallback !== false && main !== 'ollama' ? engineModel(main, false) : '');
  }
  { const e = eng.rc ?? main; set('rc', engineModel(e, true) || vision, e !== 'ollama' ? vision : ''); }
  if (fh.embedModel || env.OLLAMA_EMBED_MODEL) set('kb', fh.embedModel || env.OLLAMA_EMBED_MODEL, '');
  const bar = fh.rBar ?? at.barcode;
  if (bar === 'roboflow' && (fh.roboflowBarcodeModel || fh.roboflowModel)) set('bar', `roboflow/${String(fh.roboflowBarcodeModel || fh.roboflowModel).split('/').filter(Boolean).slice(-2).join('/')}`, '');
  try { const cs = kv.get(OWNER, 'chat_settings', null); if (cs?.model) r.tasks.chat.model = cleanModelId(cs.model) ?? r.tasks.chat.model; } catch { /* valgfritt */ }
  for (const id of Object.keys(r.tasks)) for (const f of ['model', 'fallback']) if (r.tasks[id][f] === null) r.tasks[id][f] = '';
  kv.set(OWNER, 'ai_routing', { ...r, migratedAt: Date.now(), legacy: legacyOf(fh) });
  console.info(`[ai] migrerte gamle AI-innstillinger til ruting: ${AI_TASKS.map((t) => `${t.id}=${r.tasks[t.id].model || 'auto'}`).join(' ')}`);
  return true;
}

/* ---------------- Leverandører og modeller ---------------- */

export const GROQ_IDS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'qwen/qwen3-32b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'moonshotai/kimi-k2-instruct'];
export const CLOUD_MODELS = [
  { id: 'gemini-2.5-flash', provider: 'gemini', desc: 'Gemini · rask, leser bilder', vision: true },
  { id: 'gemini-2.5-pro', provider: 'gemini', desc: 'Gemini · best på lange dokumenter', vision: true },
  { id: 'gemini-flash-latest', provider: 'gemini', desc: 'Gemini · nyeste flash', vision: true },
  { id: 'llama-3.3-70b-versatile', provider: 'groq', desc: 'Groq · svært rask tekst', vision: false },
  { id: 'qwen/qwen3-32b', provider: 'groq', desc: 'Groq · resonnering', vision: false },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq', desc: 'Groq · bilde', vision: true },
];
/** Hvilken leverandør en modell-id hører til. Prefiks (gemini/…, groq/…, openrouter/…) fjernes i id. */
export function providerOf(raw) {
  let id = String(raw ?? '').trim().replace(/^models\//, '');
  let m;
  if ((m = id.match(/^(gemini|groq|openrouter|ollama|roboflow)\/(.+)$/i)) && !/^(qwen|meta-llama|openai|moonshotai)$/i.test(m[1])) {
    const p = m[1].toLowerCase();
    if (p === 'gemini' && !/^gemini/.test(m[2])) return { provider: 'gemini', id: m[2] };
    if (p !== 'gemini') return { provider: p, id: p === 'roboflow' ? id : m[2] };
    id = m[2];
  }
  if (/^gemini[-\w.]*$/i.test(id)) return { provider: 'gemini', id };
  if (GROQ_IDS.includes(id) || /^(llama-3\.\d+-\d+b-|meta-llama\/|qwen\/|openai\/gpt-oss|moonshotai\/|deepseek-r1-distill|gemma2-9b-it|mixtral-8x7b)/i.test(id)) return { provider: 'groq', id };
  return { provider: 'ollama', id };
}
// Prompt 35: TTS-leverandørene (OpenAI, ElevenLabs, Azure) regnes også som sky (budsjett og forbruk).
export const CLOUD_PROVIDERS = ['gemini', 'groq', 'openrouter', 'openai', 'elevenlabs', 'azure'];
export const isCloud = (p) => CLOUD_PROVIDERS.includes(p);
export const providerLabel = (p) => ({ ollama: 'Ollama', gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', roboflow: 'Roboflow', openai: 'OpenAI', elevenlabs: 'ElevenLabs', azure: 'Azure' }[p] ?? p);
const sameModel = (a, b) => a === b || a === `${b}:latest` || `${a}:latest` === b;
export const modelKind = (name, details = {}) => {
  const n = String(name).toLowerCase(), fam = (details.families ?? []).map((x) => String(x).toLowerCase());
  if (/embed|bge-|nomic|mxbai|e5-|minilm/.test(n) || fam.includes('bert') || fam.includes('nomic-bert')) return 'embedding';
  // Rene bildemodeller (vl, llava, -vision, moondream …) er 'bilde' og brukes aldri som tekstmodell. Multimodale allround-modeller
  // (gemma3/gemma4/llama4) er 'tekst', men kan også lese bilder (canSee).
  if (/vl\b|vl:|vision|llava|minicpm-v|moondream|bakllava|qwen2\.5vl|qwen3-vl|granite3\.2-vision/.test(n) || fam.includes('clip') || fam.includes('mllama')) return 'bilde';
  if (/deepseek-r1|qwq|phi4-reasoning|magistral|-thinking/.test(n)) return 'resonnering';
  return 'tekst';
};
export const canSee = (name, kind = modelKind(name)) => kind === 'bilde' || /gemma3(?!n)|gemma4|llama4|mistral-small3\.[12]/i.test(String(name));

const inv = { at: 0, ok: false, err: null, models: [], url: null };
export function invalidateInventory() { inv.at = 0; }
const ollamaBase = () => String(fhSettings(OWNER).ollamaUrl || '').replace(/\/+$/, '');
/** Installerte Ollama-modeller (/api/tags, husket i 60 s). → {ok, err, url, models:[{name, kind, sizeGb, quant, params, family}]} */
export async function ollamaInventory({ force = false } = {}) {
  if (MOCK()) return { ok: true, err: null, url: 'mock', mock: true, models: [{ name: 'qwen3:8b', kind: 'tekst', sizeGb: 5.2, quant: 'Q4_K_M', params: '8.2B', family: 'qwen3' }, { name: 'qwen2.5vl:7b', kind: 'bilde', sizeGb: 6, quant: 'Q4_K_M', params: '8.3B', family: 'qwen25vl' }, { name: 'nomic-embed-text:latest', kind: 'embedding', sizeGb: 0.3, quant: 'F16', params: '137M', family: 'nomic-bert' }] };
  const url = ollamaBase();
  if (!force && inv.url === url && Date.now() - inv.at < 60_000) return inv;
  Object.assign(inv, { at: Date.now(), url });
  if (!url) return Object.assign(inv, { ok: false, err: 'Ollama-adressen er ikke satt (AI → API og nøkler)', models: [] });
  try {
    const r = await F(`${url}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return Object.assign(inv, { ok: false, err: `Ollama svarte ${r.status} på /api/tags`, models: [] });
    const j = await r.json();
    inv.models = (j.models ?? []).map((m) => ({ name: m.name ?? m.model, kind: modelKind(m.name ?? m.model, m.details), sizeGb: m.size ? Math.round(m.size / 1e8) / 10 : null,
      quant: m.details?.quantization_level ?? null, params: m.details?.parameter_size ?? null, family: m.details?.family ?? null, modified: m.modified_at ?? null })).filter((m) => m.name);
    return Object.assign(inv, { ok: true, err: null });
  } catch (e) {
    return Object.assign(inv, { ok: false, err: `Ollama kan ikke nås på ${url} (${e.cause?.code || e.name || e.message})`, models: [] });
  }
}
const cloudKey = (p) => (p === 'gemini' ? hasGemini() : p === 'groq' ? !!secret('groqKey') : p === 'openrouter' ? !!secret('openrouterKey') : p === 'roboflow' ? !!secret('roboflowKey') : false);

/* ---------------- Forbruk og budsjett ---------------- */

// Omtrentlige priser (USD per million tokens, inn/ut). Kroner = USD × 11. Ukjente sky-modeller regnes som gemini-2.5-flash.
const PRICES = { 'gemini-2.5-flash': [0.3, 2.5], 'gemini-flash-latest': [0.3, 2.5], 'gemini-2.5-flash-lite': [0.1, 0.4], 'gemini-2.5-pro': [1.25, 10],
  'llama-3.3-70b-versatile': [0.59, 0.79], 'llama-3.1-8b-instant': [0.05, 0.08], 'qwen/qwen3-32b': [0.29, 0.59], 'meta-llama/llama-4-scout-17b-16e-instruct': [0.11, 0.34], 'openai/gpt-oss-120b': [0.15, 0.6] };
export const USD_NOK = 11;
export function costKr(provider, model, tin = 0, tout = 0) {
  if (!isCloud(provider)) return 0;
  const p = PRICES[model] ?? (provider === 'groq' ? [0.59, 0.79] : [0.3, 2.5]);
  return Math.round(((tin * p[0] + tout * p[1]) / 1e6) * USD_NOK * 10000) / 10000;
}
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
export const monthCloudKr = () => db.prepare(`SELECT COALESCE(sum(cost_kr),0) FROM ai_runs WHERE ts>=? AND provider IN (${CLOUD_PROVIDERS.map((p) => `'${p}'`).join(',')})`).pluck().get(monthStart()) || 0;
/** Budsjett: 0 (eller ugyldig/NaN) = ingen grense. → {monthlyKr, monthCostKr, pct, blocked, warn} */
export function budgetState(r = serverRouting()) {
  const lim = Number(r.budget?.monthlyKr);
  const used = Number(monthCloudKr()) || 0;
  if (!Number.isFinite(lim) || lim <= 0) return { monthlyKr: 0, monthCostKr: Math.round(used * 100) / 100, pct: null, blocked: false, warn: false, hardStop: !!r.budget?.hardStop };
  const pct = Math.round((used / lim) * 100);
  return { monthlyKr: lim, monthCostKr: Math.round(used * 100) / 100, pct, blocked: !!r.budget.hardStop && used >= lim, warn: !!r.budget.warn80 && pct >= 80, hardStop: !!r.budget.hardStop };
}

/* ---------------- Jobblogg (ai_runs) ---------------- */

db.exec(`CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ts INTEGER NOT NULL, task TEXT, kind TEXT, title TEXT, provider TEXT, model TEXT,
  status TEXT NOT NULL DEFAULT 'run', ms INTEGER, tok_in INTEGER, tok_out INTEGER, cost_kr REAL, error TEXT, fallback_from TEXT, ref TEXT,
  progress INTEGER, step TEXT, partial TEXT, updated INTEGER);
CREATE INDEX IF NOT EXISTS ai_runs_user_ts ON ai_runs(user_id, ts);
CREATE INDEX IF NOT EXISTS ai_runs_ts ON ai_runs(ts);`);
// Jobber som kjørte da serveren stoppet, er ikke ferdige.
db.prepare("UPDATE ai_runs SET status='fail', error=COALESCE(error,'Avbrutt av omstart') WHERE status IN ('run','queue')").run();
const live = new Map(); // id → {ctrl, user, retry?}
const subs = new Set(); // {user, fn}
let pruneN = 0;
const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
export const jobOut = (r) => ({
  id: r.id, task: r.task, taskName: taskName(r.task), kind: r.kind ?? 'ai', title: r.title, model: r.model, provider: r.provider,
  status: r.status, progress: r.progress ?? (r.status === 'ok' ? 100 : 0), step: r.step ?? null, partial: parseJ(r.partial, null),
  startedAt: new Date(r.ts).toISOString(), ms: r.ms ?? null, tokens: { in: r.tok_in ?? 0, out: r.tok_out ?? 0 }, costKr: r.cost_kr ?? 0,
  error: r.error ?? null, fallbackFrom: r.fallback_from ?? null, ref: r.ref ?? null, retryable: !!live.get(r.id)?.retry,
  cancellable: r.status === 'run' || r.status === 'queue',
  ...(/^receipt:/.test(r.ref ?? '') ? { receiptId: r.ref.slice(8), file: String(r.title ?? '').replace(/^Kvittering · /, ''), thumb: `/finans/api/receipts/${encodeURIComponent(r.ref.slice(8))}/thumb` } : {}),
});
const emitJob = (id) => {
  const r = db.prepare('SELECT * FROM ai_runs WHERE id=?').get(id);
  if (!r) return;
  const j = jobOut(r);
  for (const s of subs) if (s.user === r.user_id && (!s.kind || s.kind === j.kind)) { try { s.fn(j); } catch { /* lytteren er borte */ } }
  try { broadcast('ai-job', j, [r.user_id]); } catch { /* realtime er valgfritt */ }
};
export function subscribeJobs(user, fn, kind = null) { const s = { user, fn, kind }; subs.add(s); return () => subs.delete(s); }
/** Starter en jobb i loggen (også for jobber som kjøres av andre moduler, f.eks. kvitteringskøen). → id */
export function jobStart({ user = me(), task = 'sok', kind = 'ai', title = null, model = null, provider = null, ref = null, status = 'run', ctrl = null, retry = null } = {}) {
  const id = 'j' + randomUUID().replace(/-/g, '').slice(0, 15), now = Date.now();
  db.prepare('INSERT INTO ai_runs(id,user_id,ts,task,kind,title,provider,model,status,progress,ref,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, user, now, taskId(task), kind, title ? String(title).slice(0, 160) : taskName(task), provider, model, status, 0, ref, now);
  if (ctrl || retry) { live.set(id, { ctrl, user, retry }); setTimeout(() => live.delete(id), 10 * 60_000).unref?.(); }
  if (++pruneN % 100 === 0) db.prepare('DELETE FROM ai_runs WHERE ts < ? AND status NOT IN (\'run\',\'queue\')').run(Date.now() - 90 * 86400_000);
  emitJob(id);
  return id;
}
/** Oppdaterer en jobb: {status, progress, step, partial, model, provider, ms, tokIn, tokOut, costKr, error, fallbackFrom, title}. */
export function jobUpdate(id, p = {}) {
  const cols = { status: p.status, progress: p.progress, step: p.step, partial: p.partial !== undefined ? JSON.stringify(p.partial) : undefined, model: p.model, provider: p.provider,
    ms: p.ms, tok_in: p.tokIn, tok_out: p.tokOut, cost_kr: p.costKr, error: p.error !== undefined ? (p.error ? String(p.error).slice(0, 500) : null) : undefined, fallback_from: p.fallbackFrom, title: p.title };
  const ks = Object.keys(cols).filter((k) => cols[k] !== undefined);
  if (!ks.length) return;
  db.prepare(`UPDATE ai_runs SET ${ks.map((k) => `${k}=?`).join(',')}, updated=? WHERE id=?`).run(...ks.map((k) => cols[k]), Date.now(), id);
  emitJob(id);
}
export const jobEnd = (id, p = {}) => { jobUpdate(id, { status: 'ok', progress: 100, ...p }); const l = live.get(id); if (l && !l.retry) live.delete(id); };
export const jobGet = (id, user) => { const r = db.prepare('SELECT * FROM ai_runs WHERE id=? AND user_id=?').get(id, user); return r ? jobOut(r) : null; };
/** Jobblisten for brukeren: kjører, i kø og siste N (nyeste først). kind/task filtrerer. */
export function jobList(user, { limit = 50, kind = null, task = null } = {}) {
  const w = ['user_id=?'], a = [user];
  if (kind) { w.push('kind=?'); a.push(kind); }
  if (task) { w.push('task=?'); a.push(taskId(task)); }
  const rows = db.prepare(`SELECT * FROM ai_runs WHERE ${w.join(' AND ')} ORDER BY ts DESC LIMIT ?`).all(...a, Math.min(500, Math.max(1, +limit || 50))).map(jobOut);
  return { running: rows.filter((j) => j.status === 'run'), queued: rows.filter((j) => j.status === 'queue'), recent: rows.filter((j) => !['run', 'queue'].includes(j.status)), paused: queue.paused };
}
export function jobCancel(id, user) {
  const r = db.prepare('SELECT * FROM ai_runs WHERE id=? AND user_id=?').get(id, user);
  if (!r) return null;
  if (!['run', 'queue'].includes(r.status)) return { ok: false, status: r.status };
  try { live.get(id)?.ctrl?.abort(new Error('Avbrutt')); } catch { /* */ }
  jobUpdate(id, { status: 'cancelled', error: 'Avbrutt av brukeren' });
  return { ok: true, status: 'cancelled' };
}
export async function jobRetry(id, user) {
  const l = live.get(id);
  if (!l?.retry || l.user !== user) return null;
  const r = await l.retry();
  return { ok: true, jobId: r?.jobId ?? null };
}
export const jobsClear = (user) => db.prepare("DELETE FROM ai_runs WHERE user_id=? AND status NOT IN ('run','queue')").run(user).changes;

/* ---------------- Kø (Samtidige jobber) ---------------- */

const queue = { active: 0, waiting: [], paused: false };
export function setQueuePaused(v) { queue.paused = !!v; pump(); return queue.paused; }
function pump() {
  const lim = serverRouting().params.parallel || 2;
  while (!queue.paused && queue.waiting.length && queue.active < lim) { const w = queue.waiting.shift(); queue.active++; w.go(); }
}
// Interaktive kall (Glimt, søk, selvtest) venter aldri i køen; bakgrunnsjobber (background:true) respekterer «Samtidige jobber» og pause.
const slot = (background, onQueue) => new Promise((resolve) => {
  const go = () => resolve(() => { queue.active = Math.max(0, queue.active - 1); pump(); });
  if (!background || (!queue.paused && queue.active < (serverRouting().params.parallel || 2))) { queue.active++; go(); return; }
  onQueue?.();
  queue.waiting.push({ go, background });
});

/* ---------------- Feil ---------------- */

export class AiRunError extends Error {
  constructor(message, extra = {}) { super(message); this.name = 'AiRunError'; Object.assign(this, extra); }
}
const shortErr = (e) => String(e?.message ?? e ?? 'ukjent feil').replace(/\s+/g, ' ').trim().slice(0, 220);
/** fix: model (Bytt modell → Valg), api (Legg inn → API og nøkler), valg (regler), nett (adresse/nettverk). */
export function fixOf(e) {
  const m = String(e?.message ?? e ?? '');
  if (e?.status === 401 || e?.status === 403 || /401|403|invalid api key|api key not valid|nøkkel mangler|mangler.*nøkkel|unauthor/i.test(m)) return 'api';
  if (e?.status === 404 || /not found|finnes ikke|no such model|pull/i.test(m)) return 'model';
  if (/lokal|finansdata|budsjett/i.test(m)) return 'valg';
  if (/kan ikke nås|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed|adressen/i.test(m)) return 'nett';
  return null;
}
async function httpError(name, res) {
  let detail = '';
  try { const t = await res.text(); try { const j = JSON.parse(t); detail = j.error?.message ?? j.error ?? t; } catch { detail = t; } } catch { /* tomt */ }
  detail = String(typeof detail === 'string' ? detail : JSON.stringify(detail)).replace(/\s+/g, ' ').trim().slice(0, 200);
  return Object.assign(new Error(`${res.status}${detail ? ` ${detail}` : ''}`), { status: res.status, provider: name });
}
const netError = (name, e, url) => {
  if (e?.name === 'TimeoutError' || e?.timeout) return Object.assign(new Error('svarte ikke innen tidsgrensen'), { timeout: true });
  if (e?.name === 'AbortError' && !e.timeout) return Object.assign(new Error('avbrutt'), { cancelled: true });
  return Object.assign(new Error(`${name} kan ikke nås${url ? ` på ${url}` : ''} (${e?.cause?.code || e?.message || e?.name})`), { net: true });
};

/* ---------------- Kall per leverandør ---------------- */

const b64 = (img) => (Buffer.isBuffer(img) ? img.toString('base64') : String(img).replace(/^data:[^,]*,/, ''));
const mimeOf = (img) => { const s = b64(img).slice(0, 12); return s.startsWith('/9j') ? 'image/jpeg' : s.startsWith('iVBOR') ? 'image/png' : s.startsWith('UklGR') ? 'image/webp' : 'image/jpeg'; };
const parseJsonText = (t) => {
  const s = String(t ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch { /* */ } } }
  throw new Error('svarte ikke med gyldig JSON');
};

async function callOllama(model, o, signal, r) {
  const base = ollamaBase();
  if (!base) throw new Error('Ollama-adressen er ikke satt');
  const msgs = [];
  const sys = typeof o.system === 'function' ? o.system('ollama') : o.system;
  if (sys) msgs.push({ role: 'system', content: sys });
  msgs.push({ role: 'user', content: String(o.prompt ?? ''), ...(o.images?.length ? { images: o.images.map(b64) } : {}) });
  const t = taskId(o.task);
  const options = { temperature: o.temperature ?? r.params.temperature, num_ctx: t === 'chat' ? r.params.numCtx : Math.min(r.params.numCtx || SHORT_NUM_CTX, SHORT_NUM_CTX) };
  if (o.numPredict) options.num_predict = o.numPredict;
  const body = shortBody({ model, stream: false, keep_alive: r.params.keepAlive, messages: msgs, options, ...(o.schema ? { format: o.schema } : o.json ? { format: 'json' } : {}) }, { user: o.user, think: r.rules.think ? true : undefined });
  let res;
  try { res = await ollamaPost(F, `${base}/api/chat`, body, { signal }); } catch (e) { throw netError('Ollama', e, base); }
  if (!res.ok) {
    const err = await httpError('Ollama', res);
    if (res.status === 404) invalidateInventory();
    throw err;
  }
  const j = await res.json();
  if (j.error) throw new Error(String(j.error).slice(0, 200));
  return { text: ollamaContent(j), tin: j.prompt_eval_count ?? 0, tout: j.eval_count ?? 0 };
}
async function callGemini(model, o, signal, r) {
  if (!hasGemini()) throw Object.assign(new Error('Gemini-nøkkel mangler'), { status: 401 });
  const parts = [...(o.images ?? []).map((img) => ({ inline_data: { mime_type: mimeOf(img), data: b64(img) } })), { text: String(o.prompt ?? '') }];
  const sys = typeof o.system === 'function' ? o.system('gemini') : o.system;
  const gc = { temperature: o.temperature ?? r.params.temperature, ...(o.numPredict ? { maxOutputTokens: Math.max(16, o.numPredict * 4) } : {}), ...(o.json || o.schema ? { responseMimeType: 'application/json' } : {}),
    ...(/flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) };
  let res;
  try {
    res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), contents: [{ role: 'user', parts }], generationConfig: gc }) });
  } catch (e) { throw netError('Gemini', e); }
  if (!res.ok) throw await httpError('Gemini', res);
  const d = await res.json();
  const text = d.candidates?.[0]?.content?.parts?.filter((x) => !x.thought).map((x) => x.text ?? '').join('') ?? '';
  if (!text) throw new Error(`tomt svar${d.candidates?.[0]?.finishReason ? ` (${d.candidates[0].finishReason})` : ''}`);
  return { text: stripThink(text), tin: d.usageMetadata?.promptTokenCount ?? 0, tout: d.usageMetadata?.candidatesTokenCount ?? 0 };
}
async function callOpenAi(provider, model, o, signal, r) {
  const key = secret(provider === 'groq' ? 'groqKey' : 'openrouterKey');
  if (!key) throw Object.assign(new Error(`${providerLabel(provider)}-nøkkel mangler`), { status: 401 });
  const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const sys = typeof o.system === 'function' ? o.system(provider) : o.system;
  const content = o.images?.length ? [{ type: 'text', text: String(o.prompt ?? '') }, ...o.images.map((img) => ({ type: 'image_url', image_url: { url: `data:${mimeOf(img)};base64,${b64(img)}` } }))] : String(o.prompt ?? '');
  let res;
  try {
    res = await F(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: o.temperature ?? r.params.temperature, ...(o.numPredict ? { max_tokens: Math.max(8, o.numPredict * 2) } : {}),
        ...(o.json || o.schema ? { response_format: { type: 'json_object' } } : {}), messages: [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content }] }) });
  } catch (e) { throw netError(providerLabel(provider), e); }
  if (!res.ok) throw await httpError(providerLabel(provider), res);
  const d = await res.json();
  return { text: stripThink(d.choices?.[0]?.message?.content ?? ''), tin: d.usage?.prompt_tokens ?? 0, tout: d.usage?.completion_tokens ?? 0 };
}
const CALL = { ollama: callOllama, gemini: callGemini, groq: (m, o, s, r) => callOpenAi('groq', m, o, s, r), openrouter: (m, o, s, r) => callOpenAi('openrouter', m, o, s, r) };

/* ---------------- Oppløsning: rute → kandidater ---------------- */

/**
 * Kandidatene for oppgaven, i rekkefølge: modell, reserve, så første installerte (tekst-/bilde-/embedding-)modell.
 * Ukjente modeller hoppes over med advarsel. → {list:[{id, provider, from}], warnings:[], notices:[], reason?}
 */
export async function resolveTask(task, { user = me(), images = null, localOnly = false } = {}) {
  const t = TASK[taskId(task)];
  const r = routing(user);
  const route = r.tasks[t.id] ?? { model: '', fallback: '' };
  const invn = await ollamaInventory();
  const warnings = [], notices = [], list = [];
  const wantKind = t.kind === 'embed' ? 'embedding' : t.kind === 'vision' || images?.length ? 'bilde' : 'tekst';
  const fitsKindOf = (m) => (wantKind === 'embedding' ? m.kind === 'embedding' : wantKind === 'bilde' ? canSee(m.name, m.kind) : m.kind === 'tekst' || m.kind === 'resonnering');
  const budget = budgetState(r);
  const finLocal = r.rules.finLocal && t.fin;
  const noCloud = localOnly || finLocal || budget.blocked;
  const add = (id, from) => {
    if (!id) return;
    const pv = providerOf(id);
    if (pv.provider === 'roboflow') return;
    if (pv.provider === 'ollama') {
      if (!invn.ok) { if (!list.some((x) => x.provider === 'ollama' && x.id === pv.id)) list.push({ ...pv, from, unverified: true }); return; }
      const hit = invn.models.find((m) => sameModel(m.name, pv.id));
      if (!hit) { warnings.push(`Modellen «${pv.id}» finnes ikke på Ollama-serveren`); return; }
      if (!fitsKindOf(hit)) { warnings.push(`Modellen «${pv.id}» passer ikke til ${t.name.toLowerCase()} (${hit.kind})`); return; }
      if (!list.some((x) => x.id === hit.name)) list.push({ provider: 'ollama', id: hit.name, from });
      return;
    }
    if (noCloud) {
      notices.push(finLocal ? `«Finansdata forlater aldri huset» er på, så ${pv.id} (sky) brukes ikke` : budget.blocked ? `Sky-budsjettet er brukt opp (${budget.monthCostKr} av ${budget.monthlyKr} kr)` : `Spørsmålet har egne data, så ${pv.id} (sky) brukes ikke`);
      return;
    }
    if (!cloudKey(pv.provider)) { warnings.push(`${providerLabel(pv.provider)}-nøkkel mangler for «${pv.id}»`); return; }
    if (r.cloudOn[pv.id] === false) { warnings.push(`Sky-modellen «${pv.id}» er slått av`); return; }
    if (!list.some((x) => x.id === pv.id)) list.push({ ...pv, from });
  };
  add(route.model, 'model');
  add(route.fallback, 'fallback');
  // Den gamle innstillingen (Integrasjoner/FinansHub: ollamaTextModel/ollamaModel/embedModel) når den faktisk er installert.
  if (invn.ok && !list.some((x) => x.provider === 'ollama')) {
    const lg = legacyOf(); // bare verdier brukeren (eller env) har satt, ikke standarden qwen2.5vl:7b
    const legacy = wantKind === 'embedding' ? lg.embed : wantKind === 'bilde' ? lg.vision : lg.text;
    const hit = legacy && invn.models.find((m) => sameModel(m.name, legacy) && fitsKindOf(m));
    if (hit) { if (warnings.length && !list.length) warnings.push(`bruker «${hit.name}»`); list.push({ provider: 'ollama', id: hit.name, from: 'legacy' }); }
  }
  // Første installerte modell av riktig type (lokalt først). Embedding-modeller brukes aldri til tekst.
  if (invn.ok && !list.some((x) => x.provider === 'ollama')) {
    // Første installerte modell som passer: tekst = tekst/resonnering (aldri bilde- eller embedding-modeller); bilde = rene bildemodeller først.
    // Modeller som får plass i VRAM (AI_GPU_VRAM_GB, standard 8) går foran: gemma4:12b (9,6 GB) kjører delvis på CPU og er treg.
    const vram = Number(process.env.AI_GPU_VRAM_GB) > 0 ? Number(process.env.AI_GPU_VRAM_GB) : 8;
    const byFit = [...invn.models].sort((a, b) => ((a.sizeGb ?? 0) > vram - 0.5) - ((b.sizeGb ?? 0) > vram - 0.5));
    const auto = (wantKind === 'tekst' ? byFit.find((m) => m.kind === 'tekst') : wantKind === 'bilde' ? byFit.find((m) => m.kind === 'bilde') : null) ?? byFit.find(fitsKindOf);
    if (auto) {
      if (warnings.length && !list.length) warnings.push(`bruker «${auto.name}» (første installerte ${wantKind === 'embedding' ? 'embedding-' : wantKind === 'bilde' ? 'bilde' : 'tekst'}modell)`);
      list.push({ provider: 'ollama', id: auto.name, from: 'auto' });
    }
  }
  if (budget.blocked && list.length && list[0].provider === 'ollama' && (providerOf(route.model).provider !== 'ollama')) notices.push(`Sky-budsjettet er brukt opp, bruker ${list[0].id} lokalt`);
  let reason = null;
  if (!list.length) {
    reason = finLocal ? '«Finansdata forlater aldri huset» er på, men ingen lokal tekstmodell er installert. Last ned en modell eller slå av regelen under Valg.'
      : !invn.ok && !route.model ? invn.err ?? 'Ollama kan ikke nås'
        : warnings[0] ?? `Ingen modell er valgt for ${t.name}, og ingen passende modell er installert`;
  }
  return { list, warnings, notices, reason, route, ollama: { ok: invn.ok, err: invn.err } };
}

/**
 * For de eldre motorene i finans/ai.js (textJson/extract): hvilken modell leverandøren p skal bruke for oppgaven.
 * Eksplisitt valg i rutingen vinner. For Ollama: er den gamle modellen ikke installert, brukes rutens første gyldige
 * Ollama-kandidat (med advarsel i loggen). Ellers den gamle modellen. → modell-id
 */
export async function modelFor(task, p, oldModel, { user = me(), images = null } = {}) {
  const t = taskId(task);
  let r;
  try { r = routing(user); } catch { return oldModel; }
  const route = r.tasks[t] ?? {};
  for (const m of [route.model, route.fallback]) { const pv = m ? providerOf(m) : null; if (pv && pv.provider === p) { if (p !== 'ollama' || MOCK()) return pv.id; break; } }
  if (p !== 'ollama' || MOCK()) return oldModel;
  try {
    const invn = await ollamaInventory();
    if (!invn.ok) return oldModel;
    const res = await resolveTask(t, { user, images, localOnly: true });
    const c = res.list.find((x) => x.provider === 'ollama');
    if (oldModel && invn.models.some((m) => sameModel(m.name, oldModel)) && (!c || c.from !== 'model')) return oldModel;
    if (c && c.id !== oldModel) console.warn(`[ai] ${t}: bruker «${c.id}»${oldModel ? ` i stedet for «${oldModel}» (${invn.models.some((m) => sameModel(m.name, oldModel)) ? 'valgt i rutingen' : 'finnes ikke på Ollama-serveren'})` : ''}`);
    return c?.id ?? oldModel;
  } catch { return oldModel; }
}

/* ---------------- run ---------------- */

/**
 * Kjører en kort AI-oppgave gjennom ruteren. Se toppen av fila for felt og svar.
 * Hvert forsøk logges i jobbloggen (én jobb per run, modell og fallbackFrom oppdateres).
 */
export async function run(task, o = {}) {
  const tid = taskId(task), user = o.user ?? me();
  const opts = { ...o, task: tid, user };
  const res = await resolveTask(tid, { user, images: o.images, localOnly: o.localOnly });
  const ctrl = new AbortController();
  const onUser = () => ctrl.abort(o.signal.reason ?? new Error('Avbrutt'));
  o.signal?.addEventListener?.('abort', onUser, { once: true });
  const first = res.list[0] ?? providerOf(res.route.model || '');
  const jobId = jobStart({ user, task: tid, kind: o.kind ?? 'ai', title: o.title ?? taskName(tid), model: first?.id ?? null, provider: first?.provider ?? null, ref: o.ref ?? null, ctrl,
    retry: o.noRetry ? null : () => run(task, { ...o, noRetry: true }).catch((e) => ({ jobId: e.jobId })) });
  const t0 = Date.now();
  const errors = [];
  if (!res.list.length) {
    const msg = `Glimt fikk ikke svar fra ${res.route.model || 'noen modell'}: ${res.reason}`;
    jobUpdate(jobId, { status: 'fail', error: msg, ms: 0 });
    o.signal?.removeEventListener?.('abort', onUser);
    throw new AiRunError(msg, { code: 'no_model', task: tid, model: res.route.model || null, fix: fixOf({ message: res.reason }) ?? 'model', errors, jobId, warnings: res.warnings });
  }
  const release = await slot(!!o.background, () => jobUpdate(jobId, { status: 'queue' }));
  if (ctrl.signal.aborted) { release(); throw new AiRunError('Avbrutt', { cancelled: true, jobId, task: tid }); }
  jobUpdate(jobId, { status: 'run' });
  const r = routing(user);
  try {
    for (let i = 0; i < res.list.length; i++) {
      const c = res.list[i], last = i === res.list.length - 1;
      const limitMs = o.timeoutMs ?? (last ? (_aiRunTest.lastMs ?? Math.max(_aiRunTest.attemptMs, (fhSettings(OWNER).aiTimeouts?.ollama ?? 45) * 1000)) : _aiRunTest.attemptMs);
      const sig = AbortSignal.any([ctrl.signal, AbortSignal.timeout(limitMs)]);
      const ta = Date.now();
      jobUpdate(jobId, { model: c.id, provider: c.provider, ...(i ? { fallbackFrom: res.list[0].id } : {}), step: `Spør ${c.id}` });
      try {
        const out = MOCK() && c.provider === 'ollama' ? { text: o.json || o.schema ? '{"ok":true}' : 'ok', tin: 4, tout: 1 } : await CALL[c.provider](c.id, opts, sig, r);
        if (!String(out.text ?? '').trim()) throw new Error('tomt svar');
        const data = o.json || o.schema ? parseJsonText(out.text) : undefined;
        const ms = Date.now() - ta, cost = costKr(c.provider, c.id, out.tin, out.tout);
        jobEnd(jobId, { ms: Date.now() - t0, tokIn: out.tin, tokOut: out.tout, costKr: cost, step: null, error: errors.length ? errors.map((x) => `${x.model}: ${x.error}`).join(' · ').slice(0, 400) : null });
        const warnings = [...res.warnings, ...errors.map((x) => `${x.model} svarte ikke (${x.error}) · brukte ${c.id}`)];
        if (warnings.length) console.warn(`[ai] ${tid}: ${warnings.join(' · ')}`);
        return { text: out.text, ...(data !== undefined ? { data } : {}), model: c.id, provider: c.provider, ms, tokens: { in: out.tin, out: out.tout }, costKr: cost, jobId,
          ...(i || c.from !== 'model' ? { fallbackFrom: res.route.model || (i ? res.list[0].id : null) } : {}), warnings, notice: res.notices[0] ?? null };
      } catch (e) {
        if (ctrl.signal.aborted) { jobUpdate(jobId, { status: 'cancelled', error: 'Avbrutt', ms: Date.now() - t0 }); throw new AiRunError('Avbrutt', { cancelled: true, jobId, task: tid }); }
        const timedOut = e?.timeout || e?.name === 'TimeoutError' || (sig.aborted && !ctrl.signal.aborted);
        const err = timedOut ? `svarte ikke innen ${Math.round(limitMs / 1000)} s` : shortErr(e);
        errors.push({ model: c.id, provider: c.provider, error: err, status: e?.status ?? null });
        console.warn(`[ai] ${tid} ${c.provider}/${c.id} feilet etter ${Date.now() - ta} ms: ${err}${last ? '' : ' · prøver reserven'}`);
      }
    }
    const f = errors[0];
    const msg = `Glimt fikk ikke svar fra ${f.model}: ${f.error}${errors.length > 1 ? ` (reserven ${errors.slice(1).map((x) => `${x.model}: ${x.error}`).join(' · ')})` : ''}`;
    jobUpdate(jobId, { status: 'fail', error: msg, ms: Date.now() - t0, step: null });
    throw new AiRunError(msg, { code: f.status === 404 ? 'model_not_found' : 'failed', task: tid, model: f.model, fix: fixOf({ message: f.error, status: f.status }) ?? (res.notices.length ? 'valg' : null), errors, jobId, warnings: res.warnings });
  } finally {
    release();
    o.signal?.removeEventListener?.('abort', onUser);
  }
}

/** Embeddings (Kunnskapsbase): Ollama /api/embed med kb-ruten. → {model, vectors, ms} */
export async function embed(texts, { user = me(), title = 'Kunnskapsbase · embeddings' } = {}) {
  const res = await resolveTask('kb', { user });
  const c = res.list.find((x) => x.provider === 'ollama');
  const jobId = jobStart({ user, task: 'kb', title, model: c?.id ?? null, provider: 'ollama' });
  const t0 = Date.now();
  if (!c) { const msg = `Glimt fikk ikke svar fra ${res.route.model || 'embedding-modellen'}: ${res.reason ?? 'ingen embedding-modell er installert'}`; jobUpdate(jobId, { status: 'fail', error: msg }); throw new AiRunError(msg, { fix: 'model', jobId, task: 'kb' }); }
  try {
    if (MOCK()) { jobEnd(jobId, { ms: 1 }); return { model: c.id, vectors: [].concat(texts).map(() => [0.1, 0.2, 0.3]), ms: 1 }; }
    let r;
    try { r = await F(`${ollamaBase()}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(_aiRunTest.statusMs), body: JSON.stringify({ model: c.id, input: [].concat(texts), keep_alive: routing(user).params.keepAlive }) }); }
    catch (e) { throw netError('Ollama', e, ollamaBase()); }
    if (!r.ok) throw await httpError('Ollama', r);
    const j = await r.json();
    jobEnd(jobId, { ms: Date.now() - t0, tokIn: j.prompt_eval_count ?? 0 });
    return { model: c.id, vectors: j.embeddings ?? [], ms: Date.now() - t0 };
  } catch (e) {
    const msg = `Glimt fikk ikke svar fra ${c.id}: ${shortErr(e)}`;
    jobUpdate(jobId, { status: 'fail', error: msg, ms: Date.now() - t0 });
    throw new AiRunError(msg, { fix: fixOf(e), jobId, task: 'kb', model: c.id });
  }
}

/* ---------------- Mini-generering (status) ---------------- */

const statusCache = new Map(); // nøkkel → {at, value}
export function invalidateStatus() { statusCache.clear(); }
/** «Svar bare: ok», num_predict 3, 15 s. Logges ikke i jobbloggen. → {ok, ms, error?} */
export async function miniGenerate(provider, model, { user = me(), image = false } = {}) {
  if (MOCK() && provider === 'ollama') return { ok: true, ms: 5, mock: true };
  const t0 = Date.now();
  try {
    const r = routing(user);
    const out = await CALL[provider](model, { task: 'sok', user, prompt: 'Svar bare: ok', numPredict: 3, temperature: 0, ...(image ? { images: [PIXEL] } : {}) },
      AbortSignal.timeout(_aiRunTest.statusMs), r);
    if (!String(out.text ?? '').trim()) throw new Error('tomt svar');
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    const timedOut = e?.timeout || e?.name === 'TimeoutError';
    return { ok: false, ms: Date.now() - t0, error: timedOut ? `svarte ikke innen ${Math.round(_aiRunTest.statusMs / 1000)} s` : shortErr(e), status: e?.status ?? null };
  }
}
// 1×1 hvit PNG (selvtesten for bildeoppgaver).
export const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const tail = (s) => (s ? String(s).slice(-4) : null);

/**
 * Status per leverandør med ekte mini-generering (cache 5 min). state: 'ok' (Svarer, grønn) | 'degraded' (Nås, men genererer
 * ikke, oransje) | 'off' (Ikke tilkoblet, grå).
 * → {checkedAt, cached, providers:[{id, name, state, label, ms, model, error, keyTail, url?}], routes:[{task, name, model, provider, state, ms, error, warning}]}
 */
export async function providerStatus({ user = me(), force = false } = {}) {
  const key = `${user}`;
  const hit = statusCache.get(key);
  if (!force && hit && Date.now() - hit.at < 5 * 60_000) return { ...hit.value, cached: true };
  const r = routing(user);
  const invn = await ollamaInventory({ force });
  const label = { ok: 'Svarer', degraded: 'Nås, men genererer ikke', off: 'Ikke tilkoblet' };
  // Modellene rutene faktisk bruker (etter validering).
  const resolved = {};
  for (const t of AI_TASKS) if (t.kind !== 'embed') { try { resolved[t.id] = await resolveTask(t.id, { user }); } catch { resolved[t.id] = { list: [], warnings: [], reason: 'feil' }; } }
  const pick = (p) => { for (const t of AI_TASKS) { const c = resolved[t.id]?.list.find((x) => x.provider === p); if (c) return c.id; } return null; };
  const minis = new Map();
  const mini = (p, m) => { const k = `${p}|${m}`; if (!minis.has(k)) minis.set(k, miniGenerate(p, m, { user })); return minis.get(k); };
  const prov = [];
  // Ollama
  {
    const m = pick('ollama') ?? invn.models.find((x) => x.kind === 'tekst')?.name ?? null;
    if (!invn.ok) prov.push({ id: 'ollama', name: 'Ollama', state: 'off', ms: null, model: null, error: invn.err, url: ollamaBase() || null });
    else if (!m) prov.push({ id: 'ollama', name: 'Ollama', state: 'degraded', ms: null, model: null, error: 'Ingen tekstmodell er installert', url: ollamaBase() || null });
    else { const g = await mini('ollama', m); prov.push({ id: 'ollama', name: 'Ollama', state: g.ok ? 'ok' : 'degraded', ms: g.ms, model: m, error: g.error ?? null, url: ollamaBase() || null }); }
  }
  for (const p of ['gemini', 'groq', 'openrouter']) {
    const keyName = { gemini: 'geminiKey', groq: 'groqKey', openrouter: 'openrouterKey' }[p];
    if (!cloudKey(p)) { prov.push({ id: p, name: providerLabel(p), state: 'off', ms: null, model: null, error: 'Ingen nøkkel', keyTail: null }); continue; }
    const m = pick(p) ?? (p === 'gemini' ? 'gemini-flash-latest' : p === 'groq' ? 'llama-3.1-8b-instant' : 'openrouter/auto');
    const g = await mini(p, providerOf(m).id);
    prov.push({ id: p, name: providerLabel(p), state: g.ok ? 'ok' : 'degraded', ms: g.ms, model: m, error: g.error ?? null, keyTail: tail(secret(keyName)) });
  }
  prov.push({ id: 'roboflow', name: 'Roboflow', state: cloudKey('roboflow') ? 'ok' : 'off', ms: null, model: fhSettings(OWNER).roboflowBarcodeModel || fhSettings(OWNER).roboflowModel || null, error: cloudKey('roboflow') ? null : 'Ingen nøkkel', keyTail: tail(secret('roboflowKey')), note: 'Nøkkelen testes under API og nøkler' });
  const routes = [];
  for (const t of AI_TASKS) {
    if (t.kind === 'embed') {
      const kb = await resolveTask('kb', { user });
      const c = kb.list[0];
      routes.push({ task: t.id, name: t.name, model: c?.id ?? null, provider: c?.provider ?? null, state: c ? 'ok' : invn.ok ? 'degraded' : 'off', ms: null, error: c ? null : kb.reason, warning: kb.warnings[0] ?? null });
      continue;
    }
    const rs = resolved[t.id];
    const c = rs.list[0];
    if (!c) { routes.push({ task: t.id, name: t.name, model: r.tasks[t.id]?.model || null, provider: null, state: invn.ok ? 'degraded' : 'off', ms: null, error: rs.reason, warning: rs.warnings[0] ?? null }); continue; }
    const g = await mini(c.provider, c.id);
    routes.push({ task: t.id, name: t.name, model: c.id, provider: c.provider, state: g.ok ? 'ok' : 'degraded', ms: g.ms, error: g.error ?? null, warning: rs.warnings[0] ?? null });
  }
  const value = { checkedAt: new Date().toISOString(), cached: false, providers: prov.map((p) => ({ ...p, label: label[p.state] })), routes: routes.map((x) => ({ ...x, label: label[x.state] })) };
  statusCache.set(key, { at: Date.now(), value });
  return value;
}

/* ---------------- Selvtest ---------------- */

const SELFTEST = ['chat', 'sok', 'glimt', 'rc', 'kat', 'fsok', 'bar', 'dom', 'kb', 'brief'];
/**
 * Mini-prompt gjennom hver rute (ingen brukerdata). onResult får én rad per oppgave:
 * {task, name, model, provider, ok, ms, error, fix:'model'|'api'|'valg'|'nett'|null, warning?, fallbackFrom?}
 * → {ok, failed, total, results}
 */
export async function selftest({ user = me(), onResult = () => {} } = {}) {
  const results = [];
  const push = (x) => { results.push(x); try { onResult(x); } catch { /* */ } };
  await Promise.all(SELFTEST.map(async (id) => {
    const t = TASK[id], t0 = Date.now();
    try {
      if (id === 'kb') { const e = await embed('test', { user, title: 'Selvtest · Kunnskapsbase' }); push({ task: id, name: t.name, model: e.model, provider: 'ollama', ok: true, ms: Date.now() - t0, error: null, fix: null }); return; }
      if (id === 'bar') {
        const route = routing(user).tasks.bar;
        if (providerOf(route.model).provider === 'roboflow' || !route.model) {
          const has = cloudKey('roboflow');
          push({ task: id, name: t.name, model: route.model || 'zbar (lokalt)', provider: route.model ? 'roboflow' : 'zbar', ok: !route.model || has, ms: Date.now() - t0, error: route.model && !has ? 'Mangler Roboflow-nøkkel' : null, fix: route.model && !has ? 'api' : null });
          return;
        }
      }
      const out = await run(id, { user, prompt: 'Svar bare: ok', numPredict: 3, temperature: 0, title: `Selvtest · ${t.name}`, noRetry: true, timeoutMs: _aiRunTest.statusMs,
        ...(t.kind === 'vision' ? { images: [PIXEL] } : {}) });
      push({ task: id, name: t.name, model: out.model, provider: out.provider, ok: true, ms: Date.now() - t0, error: null, fix: out.fallbackFrom && out.warnings.length ? 'model' : null,
        ...(out.warnings.length ? { warning: out.warnings.join(' · ') } : {}), ...(out.fallbackFrom ? { fallbackFrom: out.fallbackFrom } : {}), ...(out.notice ? { notice: out.notice } : {}) });
    } catch (e) {
      push({ task: id, name: t.name, model: e.model ?? null, provider: null, ok: false, ms: Date.now() - t0, error: String(e.message ?? e).replace(/^Glimt fikk ikke svar fra [^:]+: /, ''), fix: e.fix ?? fixOf(e) });
    }
  }));
  const failed = results.filter((x) => !x.ok).length;
  invalidateStatus();
  return { ok: failed === 0, failed, total: results.length, results: SELFTEST.map((id) => results.find((x) => x.task === id)).filter(Boolean) };
}

/* ---------------- Forbruk ---------------- */

const dayKey = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
/**
 * Tokens og kostnad for brukeren (scope 'all' = alle brukere, bare admin) siste `days` dager.
 * → {days, from, totals:{tokIn, tokOut, costKr, localShare, avgMs, count, failed}, byDay:[{date, localTok, cloudTok, costKr}],
 *    byProvider:[{provider, name, tokIn, tokOut, costKr, count}], byTask:[{task, name, costKr, tokens, models[], count}], budget}
 */
export function usage(user, { days = 30, all = false } = {}) {
  const d = [1, 7, 30, 90].includes(+days) ? +days : 30;
  // Prompt 37: midnatt i Oslo uavhengig av serverens tidssone (før ble UTC-midnatt brukt, så «i dag» var tom rett etter midnatt i Oslo).
  const osloMidnight = () => { const now = Date.now(), ds = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
    const off = (t) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t; };
    const utc = Date.parse(ds + 'T00:00:00Z'); return utc - off(utc); };
  const from = d === 1 ? osloMidnight() : Date.now() - d * 86400_000;
  const rows = db.prepare(`SELECT ts, task, provider, model, status, ms, COALESCE(tok_in,0) AS tin, COALESCE(tok_out,0) AS tout, COALESCE(cost_kr,0) AS cost FROM ai_runs WHERE ts>=? ${all ? '' : 'AND user_id=?'} AND status IN ('ok','fail')`).all(...(all ? [from] : [from, user]));
  const tot = { tokIn: 0, tokOut: 0, costKr: 0, localTok: 0, ms: 0, count: rows.length, failed: 0 };
  const byDay = new Map(), byP = new Map(), byT = new Map();
  for (const x of rows) {
    const tok = x.tin + x.tout, cloud = isCloud(x.provider);
    tot.tokIn += x.tin; tot.tokOut += x.tout; tot.costKr += x.cost; tot.ms += x.ms ?? 0; if (!cloud) tot.localTok += tok; if (x.status === 'fail') tot.failed++;
    const dk = dayKey(x.ts), dd = byDay.get(dk) ?? { date: dk, localTok: 0, cloudTok: 0, costKr: 0 };
    dd[cloud ? 'cloudTok' : 'localTok'] += tok; dd.costKr += x.cost; byDay.set(dk, dd);
    const p = x.provider ?? 'ukjent', pp = byP.get(p) ?? { provider: p, name: providerLabel(p), tokIn: 0, tokOut: 0, costKr: 0, count: 0 };
    pp.tokIn += x.tin; pp.tokOut += x.tout; pp.costKr += x.cost; pp.count++; byP.set(p, pp);
    const tt = byT.get(x.task) ?? { task: x.task, name: taskName(x.task), costKr: 0, tokens: 0, models: [], count: 0 };
    tt.costKr += x.cost; tt.tokens += tok; tt.count++; if (x.model && !tt.models.includes(x.model)) tt.models.push(x.model); byT.set(x.task, tt);
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const allTok = tot.tokIn + tot.tokOut;
  const b = budgetState();
  const dom = new Date().getDate(), dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  return { days: d, from: new Date(from).toISOString(),
    totals: { tokIn: tot.tokIn, tokOut: tot.tokOut, costKr: r2(tot.costKr), localShare: allTok ? Math.round((tot.localTok / allTok) * 100) : null, avgMs: rows.length ? Math.round(tot.ms / rows.length) : null, count: tot.count, failed: tot.failed },
    byDay: [...byDay.values()].sort((a, c) => a.date.localeCompare(c.date)).map((x) => ({ ...x, costKr: r2(x.costKr) })),
    byProvider: [...byP.values()].map((x) => ({ ...x, costKr: r2(x.costKr) })).sort((a, c) => c.costKr - a.costKr || c.count - a.count),
    byTask: [...byT.values()].map((x) => ({ ...x, costKr: r2(x.costKr) })).sort((a, c) => c.costKr - a.costKr || c.tokens - a.tokens),
    budget: { ...b, forecastKr: r2((b.monthCostKr / Math.max(1, dom)) * dim) } };
}
