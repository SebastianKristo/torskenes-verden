// Chat (prompt 27): /api/chat/*, sesjon eller app-token (authOrToken). Alt er per bruker.
// Motor: Open WebUI når admin har satt openwebui_url + openwebui_key (Innstillinger → AI, serveroppsett). Serveren er en proxy:
// klientene snakker bare med oss. Uten Open WebUI (eller når den ikke svarer) går kallene direkte til Ollama (/api/chat),
// Gemini (streamGenerateContent) eller Groq (OpenAI-format) med nøklene fra Innstillinger → AI. Samtaler, mapper og vedlegg
// lagres alltid hos oss i SQLite (hl_chats, hl_chat_folders, hl_chat_files med user_id), så historikken er per bruker også
// når Open WebUI brukes med én servicenøkkel.
//
// Ruter (se CONTRACT27 / design_handoff_homelab/prompts/prompt-27-pakke/claude-code-chat.md):
//   GET    /models                    → {models:[{id,name,kind,provider,size?,vision,installed}], default, openwebui}
//   POST   /models/pull {name}        → SSE «progress» {status,completed,total} … «done» {ok} | «error» {error}   (admin)
//   DELETE /models/:name              → {ok}                                                                    (admin)
//   GET    /chats?q=                  → {pinned:[], folders:[{id,name,open,chats:[]}], chats:[]}
//   GET/PATCH/DELETE /chats/:id, GET /chats/:id/export (Markdown), POST /chats/:id/share → {url}
//   POST /folders {name}, PATCH/DELETE /folders/:id
//   POST   /send                      → SSE meta {chatId} · facts {facts, used}? · delta {text} · done {tokensPerSec, ms, used, facts?} · error {error}; 409 {needsConfirm}
//                                       (prompt 41: vær/tid/sol hentes før modellen, se server/chat-tools41.js; meta.facts lagres i svaret)
//   POST   /files (multipart file)    → {id,name,size};  GET /knowledge → [{id,name,size,source,type}]
//   GET    /mydata                    → {finans, kalender, huske};  GET/PATCH /settings
//   POST   /transcribe (multipart)    → {text} via Open WebUI; 501 uten
//   GET    /shared/:token             → delt samtale (Markdown, uten innlogging; tokenet er tilfeldig)
// Samtaleinnstillinger (chat.settings): persona, system, temperature, topP, numCtx, theme, skipCloudAsk og think (av som
// standard; på → Ollama får think:true, av → think:false, se server/ollama-opts.js).
import { Hono } from 'hono';
import { originOf46 } from './public-url46.js'; // prompt 46 (SERVER46)
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID, randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db, kv } from './db.js';
import { authOrToken, layoutOf } from './mobile.js';
import { isAdmin } from './auth.js';
import { cfg, userCfg, userBool, setUserCfg } from './settings.js';
import { settings, secret } from './finans/db.js';
import { geminiFetch, hasGemini } from './finans/gemini-keys.js';
import { aiTimeoutsOf, GEMINI_DEFAULT, GROQ_DEFAULT, GROQ_MODELS, GROQ_VISION_DEFAULT } from './finans/ai.js';
import { CATALOG } from './finans/ollama-models.js';
import { audit } from './finans/ai-audit.js';
import { finansSummary } from './finans/summary.js';
import { nextTasks } from './tasks.js';
import { chatBody, isThinkingModel } from './ollama-opts.js';
import { thinkSplit52, thinkState52, glimtSteps52, stripThink52, cleanAttTh52 } from './chat52.js'; // prompt 52 (SRV52): tankegang
import { gateChat, GateError } from './ai-gate.js'; // prompt 43: alle Ollama-kall via gaten
import { ensureScanFolder, scanFolderInfo, isSysFolder, upsertScanChat } from './chat-scans.js';
import { gatherFacts, factsPrompt, factsAnswer, hasFactWords } from './chat-tools41.js'; // prompt 41: Glimt henter fakta
import { AUTO_ID, pickAuto41, autoEntry41, recordAuto41, feedbackAuto41, autoSummary41 } from './chat41.js'; // prompt 41: «✦ Auto»
import { weekFact41, isWeekWeather41 } from './weather41.js'; // prompt 41: ukesvær til modellen
import { routeTools, routeTextOf, pickData, osloNowLine } from './tool-router44.js'; // prompt 44: ruting før hovedmodellen
import { webSearch, webPrompt, webMeta, webFact } from './web-search.js'; // prompt 44: eget nettsøk
import { powerFact, powerPrompt } from './power-price.js'; // prompt 44: strømpris
import { backendConfig, maskSecrets } from './ai-gate.js';
import { jobStart, jobUpdate, jobEnd } from './ai-run.js'; // prompt 44: Chat i jobbloggen (backend, verktøy, nettsøk)
import { memoryPrompt43 } from './ai-memory43.js'; // prompt 43: AI-minne i systemprompten
import { saveFile50, deleteFile50, desc50, mountFiles50, visionCaps50, bestVision50, prepareHistory50, stored50, dropImages50, ocrImages50, ocrNote50, receiptChat50, attIds50, RECEIPT_RE50, LIMITS50, kindOf50 } from './chat50.js'; // prompt 50 (SRVCHAT50): vedlegg, miniatyr, vision, kvittering i chat
import { rankFor41 } from './chat41.js';
import { externalBlocked48, r48Settings } from './receipts48/settings.js';
import { imageIntent51, looksLikeDocument51, documentNote51, readDocument51, visionModel51, textModel51, isMultimodalError51, markNoVision51, friendlyError51, owuiVision51 } from './chat51.js'; // prompt 51 (RCPTSRV51): bilder i chatten

const q = (sql) => db.prepare(sql);
const isMock = () => process.env.MOCK_DATA === '1' && !fx;

db.exec(`
CREATE TABLE IF NOT EXISTS hl_chat_folders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS hl_chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Ny samtale', model TEXT, pinned INTEGER NOT NULL DEFAULT 0,
  folder_id TEXT, settings TEXT NOT NULL DEFAULT '{}', messages TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL, updated INTEGER NOT NULL, share_token TEXT);
CREATE INDEX IF NOT EXISTS hl_chats_user ON hl_chats(user_id, updated);
CREATE TABLE IF NOT EXISTS hl_chat_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT, path TEXT, text TEXT, owui_id TEXT, created INTEGER NOT NULL);
`);

/* ---------------- Nett (injiserbart i tester) ---------------- */

let fx = null;
export const _setChatFetch = (fn) => { fx = fn; modelCache.at = 0; };
const F = (url, init = {}) => (fx ?? globalThis.fetch)(url, init);
export const _chatTest = { mockDelayMs: 12 };

const owui = () => { const url = String(cfg('openwebui_url') || '').replace(/\/+$/, ''), key = cfg('openwebui_key') || ''; return url && key ? { url, key } : null; };
const owuiHeaders = (o, extra = {}) => ({ Authorization: `Bearer ${o.key}`, ...extra });
const ollamaBase = () => String(settings().ollamaUrl || '').replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** «Test tilkobling» for Open WebUI (Innstillinger → Integrasjoner). */
export async function testOpenWebui() {
  const o = owui();
  if (!o) return { ok: false, message: 'Adresse og API-nøkkel mangler.' };
  const t0 = Date.now();
  try {
    const r = await F(`${o.url}/api/models`, { headers: owuiHeaders(o), signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) return { ok: false, message: 'Open WebUI godtok ikke API-nøkkelen.' };
    if (!r.ok) return { ok: false, message: `Open WebUI svarte ${r.status}` };
    const n = ((await r.json().catch(() => ({}))).data ?? []).length;
    return { ok: true, ms: Date.now() - t0, message: `Open WebUI svarte med ${n} modeller.` };
  } catch (e) { return { ok: false, message: `Fikk ikke kontakt med Open WebUI (${e.cause?.code || e.name})` }; }
}

/* ---------------- Modeller ---------------- */

const VISION_RE = /vl|vision|llava|minicpm-v|gemma3|moondream|bakllava|llama-4|scout|gemini|gpt-4o/i;
const prettyLocal = (id) => id.replace(/:latest$/, '').replace(/^([a-z])/, (m) => m.toUpperCase()).replace(/:(\d+(?:\.\d+)?)b$/i, ' $1B').replace(/:/g, ' ');
const prettyGemini = (m) => m.replace(/^gemini-/, 'Gemini ').replace(/-latest$/, '').replace(/-/g, ' ').replace(/\b(flash|pro|lite)\b/g, (x) => x[0].toUpperCase() + x.slice(1));
const GROQ_NAMES = { 'llama-3.3-70b-versatile': 'Llama 3.3 70B (Groq)', 'llama-3.1-8b-instant': 'Llama 3.1 8B (Groq)', 'meta-llama/llama-4-scout-17b-16e-instruct': 'Llama 4 Scout (Groq)', 'qwen/qwen3-32b': 'Qwen3 32B (Groq)' };
const MOCK_MODELS = [
  { id: 'qwen3:8b', name: 'Qwen3 8B', kind: 'lokal', provider: 'ollama', size: '5.2 GB', vision: false, installed: true },
  { id: 'qwen2.5vl:7b', name: 'Qwen2.5 VL 7B', kind: 'lokal', provider: 'ollama', size: '6.0 GB', vision: true, installed: true },
  { id: 'gemma3:12b', name: 'Gemma3 12B', kind: 'lokal', provider: 'ollama', size: '8.1 GB', vision: true, installed: false },
  { id: 'gemini:gemini-2.5-flash', name: 'Gemini 2.5 Flash', kind: 'sky', provider: 'gemini', vision: true, installed: true },
  { id: 'groq:llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', kind: 'sky', provider: 'groq', vision: false, installed: true },
];
const gb = (bytes) => (bytes ? `${(bytes / 1e9).toFixed(1)} GB` : undefined);

function cloudModels() {
  const out = [];
  if (hasGemini()) {
    const st = settings();
    for (const m of [...new Set(['gemini-2.5-flash', st.geminiModel && st.geminiModel !== GEMINI_DEFAULT ? st.geminiModel : null, 'gemini-2.5-pro'].filter(Boolean))]) out.push({ id: `gemini:${m}`, name: prettyGemini(m), kind: 'sky', provider: 'gemini', vision: true, installed: true });
  }
  if (secret('groqKey')) for (const m of GROQ_MODELS) out.push({ id: `groq:${m}`, name: GROQ_NAMES[m] ?? `${m} (Groq)`, kind: 'sky', provider: 'groq', vision: /llama-4|scout/.test(m), installed: true });
  return out;
}
function catalogMissing(installed) {
  const has = (n) => installed.some((i) => i.id === n || i.id === `${n}:latest` || `${i.id}:latest` === n);
  return CATALOG.filter((c) => !c.tooBig && !c.use.includes('embed') && !has(c.name)).map((c) => ({ id: c.name, name: prettyLocal(c.name), kind: 'lokal', provider: 'ollama', size: `${c.size.toFixed(1)} GB`, vision: !!c.vision, installed: false }));
}
async function directLocal() {
  try {
    const r = await F(`${ollamaBase()}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const list = ((await r.json()).models ?? []).filter((m) => !/embed/i.test(m.name)).map((m) => ({ id: m.name, name: prettyLocal(m.name), kind: 'lokal', provider: 'ollama', size: gb(m.size),
      vision: VISION_RE.test(m.name) || (m.details?.families ?? []).includes('clip'), installed: true }));
    return await visionCaps50(list, ollamaBase(), F); // prompt 50: vision fra /api/show (capabilities), lagret
  } catch { return []; }
}
async function owuiModels(o) {
  const r = await F(`${o.url}/api/models`, { headers: owuiHeaders(o), signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`Open WebUI svarte ${r.status}`);
  return ((await r.json()).data ?? []).filter((m) => m?.id && !/embed/i.test(m.id)).map((m) => {
    const isOllama = m.owned_by === 'ollama' || !!m.ollama;
    const provider = isOllama ? 'ollama' : /gemini/i.test(m.id + (m.name ?? '')) ? 'gemini' : /groq|llama-3\.\d-\d+b-(versatile|instant)/i.test(m.id + (m.name ?? '') + (m.urlIdx ?? '')) ? 'groq' : 'openwebui';
    return { id: m.id, name: m.name || (isOllama ? prettyLocal(m.id) : m.id), kind: isOllama ? 'lokal' : 'sky', provider, size: gb(m.ollama?.size ?? m.size),
      // Prompt 51: Open WebUI sier vision:true for alle modeller som standard – for Ollama-modeller gjelder navnet/familien, så /api/show.
      vision: isOllama ? (VISION_RE.test(m.id) || (m.ollama?.details?.families ?? []).includes('clip')) : (!!(m.info?.meta?.capabilities?.vision) || VISION_RE.test(m.id)), installed: true, via: 'openwebui' };
  });
}
const modelCache = { at: 0, key: '', list: [] };
/** Alle modeller (Open WebUI når den er satt opp og svarer, ellers Ollama direkte + Gemini/Groq). Cachet 30 s. */
export async function listModels() {
  if (isMock()) return MOCK_MODELS;
  const o = owui(), key = `${o?.url ?? ''}|${ollamaBase()}|${hasGemini()}|${!!secret('groqKey')}`;
  if (modelCache.key === key && Date.now() - modelCache.at < 30_000) return modelCache.list;
  let list = null;
  if (o) { try { list = await owuiVision51(await owuiModels(o), ollamaBase(), F, visionCaps50); } catch { list = null; } }
  if (!list) { const local = await directLocal(); list = [...local, ...catalogMissing(local), ...cloudModels()]; }
  else list = [...list, ...catalogMissing(list.filter((m) => m.provider === 'ollama'))];
  Object.assign(modelCache, { at: Date.now(), key, list });
  return list;
}
/** Modellen for en id: fra listen, ellers ut fra prefikset (gemini:/groq:) eller som lokal Ollama-modell. */
function infer(id) {
  if (id.startsWith('gemini:')) return { id, name: prettyGemini(id.slice(7)), kind: 'sky', provider: 'gemini', vision: true, installed: true };
  if (id.startsWith('groq:')) return { id, name: GROQ_NAMES[id.slice(5)] ?? id.slice(5), kind: 'sky', provider: 'groq', vision: /llama-4|scout/.test(id), installed: true };
  return { id, name: prettyLocal(id), kind: 'lokal', provider: 'ollama', vision: VISION_RE.test(id), installed: true };
}
async function modelFor(id) { const list = await listModels(); return list.find((m) => m.id === id) ?? infer(id); }
async function defaultModel(u) {
  const list = await listModels();
  const want = userCfg(u, 'chat_default_model') || kv.get(u, 'chat_last_model', '');
  if (want && list.some((m) => m.id === want && m.installed)) return want;
  return (list.find((m) => m.kind === 'lokal' && m.installed && !m.vision) ?? list.find((m) => m.installed))?.id ?? null;
}

/* ---------------- Samtaler ---------------- */

export const PERSONAS = {
  standard: 'Du er en hjelpsom assistent i Homelab-appen. Svar kort og presist.',
  okonomi: 'Du er en nøktern økonomirådgiver. Gi konkrete råd om budsjett, sparing og forbruk. Ikke finn på tall.',
  homelab: 'Du er en erfaren homelab- og Linux-tekniker (Docker, nettverk, Home Assistant, Proxmox). Gi kommandoer og konkrete steg.',
  norsklarer: 'Du er norsklærer. Rett språk og grammatikk på norsk bokmål, forklar kort hvorfor, og foreslå bedre formuleringer.',
};
const num = (v, lo, hi, d) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, +v)) : d);
export function cleanSettings(s = {}) {
  const o = s && typeof s === 'object' ? s : {};
  const persona = String(o.persona ?? 'standard').toLowerCase().replace('ø', 'o');
  return {
    persona: PERSONAS[persona] ? persona : 'standard', system: String(o.system ?? '').slice(0, 4000),
    temperature: num(o.temperature, 0, 2, 0.7), topP: num(o.topP, 0, 1, 0.9), numCtx: Math.round(num(o.numCtx, 2048, 32768, 8192)),
    theme: /^n/i.test(String(o.theme ?? '')) ? 'noytral' : 'papir', skipCloudAsk: !!o.skipCloudAsk,
    // La modellen tenke (Ollama think:true). Av som standard: tenkemodeller bruker ellers hundrevis av tokens før svaret.
    think: o.think === true || /^(1|true|on|ja|yes)$/i.test(String(o.think ?? '')),
  };
}
const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const chatRow = (u, id) => q('SELECT * FROM hl_chats WHERE id=? AND user_id=?').get(String(id ?? ''), u);
const iso = (t) => new Date(t).toISOString();
const brief = (r) => ({ id: r.id, title: r.title, model: r.model, updatedAt: iso(r.updated), pinned: !!r.pinned, folderId: r.folder_id ?? null,
  ...(r.kind ? { kind: r.kind, ref: parse(r.ref, {}), status: parse(r.messages, [])[1]?.meta?.status ?? null } : {}) }); // prompt 34: skann-samtaler
const msgOut = (m) => ({ role: m.role, content: m.content, ...(m.images?.length && !m.attachments?.length ? { images: m.images } : {}), ...(m.attachments?.length ? { attachments: m.attachments } : {}), ...(m.files?.length ? { files: m.files } : {}), ...(m.ts ? { ts: m.ts } : {}), ...(m.meta ? { meta: m.meta } : {}),
  ...(m.card ? { card: m.card } : {}), ...(m.tool ? { tool: m.tool } : {}),
  ...(Array.isArray(m.think) && m.think.length ? { think: m.think, thS: m.thS ?? null, thinkSource: m.thinkSource ?? null } : {}), ...(Array.isArray(m.attTh) && m.attTh.length ? { attTh: m.attTh } : {}) }); // prompt 52: tankegang og miniatyr // prompt 31: Glimt-kort (vær, kalender …) og verktøy-chip lagres i meldingen
const full = (r) => ({ ...brief(r), createdAt: iso(r.created), settings: cleanSettings(parse(r.settings, {})), messages: parse(r.messages, []).map(msgOut), shared: !!r.share_token });
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function chatList(u, text = '') {
  ensureScanFolder(u); // prompt 34: «Kvitteringer og skanninger» (scanSeeded) for alle brukere
  let rows = q('SELECT * FROM hl_chats WHERE user_id=? ORDER BY updated DESC').all(u);
  const t = norm(text).trim();
  if (t) rows = rows.filter((r) => norm(r.title).includes(t) || parse(r.messages, []).some((m) => norm(m.content).includes(t)));
  const folders = q('SELECT * FROM hl_chat_folders WHERE user_id=? ORDER BY created').all(u);
  const fids = new Set(folders.map((f) => f.id));
  return {
    pinned: rows.filter((r) => r.pinned).map(brief),
    folders: folders.sort((a, b) => (b.sys ?? 0) - (a.sys ?? 0)).map((f) => { const chats = rows.filter((r) => !r.pinned && r.folder_id === f.id).map(brief); return { id: f.id, name: f.name, open: !!f.open, ...(f.sys ? scanFolderInfo(u, chats) : {}), chats }; }),
    chats: rows.filter((r) => !r.pinned && (!r.folder_id || !fids.has(r.folder_id))).map(brief),
  };
}
function toMarkdown(r) {
  const c = full(r);
  const lines = [`# ${c.title}`, '', `_${c.model ?? ''} · ${new Date(r.updated).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}_`, ''];
  for (const m of c.messages) {
    if (m.role === 'system') continue;
    lines.push(`## ${m.role === 'user' ? 'Du' : 'Assistent'}`, '', m.content, '');
    if (m.meta?.used?.length) lines.push(`_Brukte ${m.meta.used.join(', ')}_`, '');
  }
  return lines.join('\n');
}

/* ---------------- Mine data ---------------- */

const withTimeout = (p, ms, d) => Promise.race([p, sleep(ms).then(() => d)]);
const osloDate = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const hm = (isoStr) => (isoStr ? new Date(isoStr).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' }) : '');
async function kalenderSummary(u) {
  const { eventsFor } = await import('./calendar.js');
  const from = osloDate(), to = osloDate(Date.now() + 7 * 86400_000);
  const { events } = await eventsFor(u, from, to);
  const list = events.filter((e) => (e.allDay ? e.end > from : Date.parse(e.end ?? e.start) > Date.now())).slice(0, 15);
  if (!list.length) return 'Kalender neste 7 dager: ingen hendelser.';
  return `Kalender neste 7 dager: ${list.map((e) => `${e.date.slice(8, 10)}.${e.date.slice(5, 7)} ${e.allDay ? 'hele dagen' : `${hm(e.start)}–${hm(e.end)}`} ${e.title}${e.room || e.location ? ` (${e.room || e.location})` : ''}`).join('; ')}.`;
}
function huskeSummary(u) {
  const t = nextTasks(u, 10);
  if (!t.length) return 'Huskeliste: ingenting som venter.';
  return `Huskeliste (${t.length}): ${t.map((x) => `${x.title}${x.due ? ` (frist ${x.due.slice(8, 10)}.${x.due.slice(5, 7)}${x.overdue ? ', forfalt' : ''})` : ''}`).join('; ')}.`;
}
/** Korte sammendrag fra egne funksjoner (ikke rå tabeller ut til modellen), per bruker. */
export async function myData(u) {
  const safe = async (fn, d) => { try { return await withTimeout(Promise.resolve().then(fn), 5000, d); } catch { return d; } };
  const [finans, kalender, huske] = await Promise.all([safe(() => finansSummary(u, 30), 'Finans: ikke tilgjengelig.'), safe(() => kalenderSummary(u), 'Kalender: ikke tilgjengelig.'), safe(() => huskeSummary(u), 'Huskeliste: ikke tilgjengelig.')]);
  return { finans, kalender, huske };
}
const LEAVES = { finans: 'Sammendrag av Finans (siste 30 dager)', kalender: 'Sammendrag av Kalender (neste 7 dager)', huske: 'Sammendrag av Huskeliste' };
const USED = { finans: 'Finans', kalender: 'Kalender', huske: 'Huskeliste' };

/** Språket brukeren har valgt (SERVER-A eier feltet; vi leser de stedene det kan ligge). */
function langOf(u) {
  let v = '';
  try { v = userCfg(u, 'language') || ''; } catch { /* ukjent nøkkel */ }
  if (!v) { try { v = layoutOf(u)?.language || kv.get(u, 'language', '') || ''; } catch { /* ingen */ } }
  return /^en/i.test(String(v)) ? 'en' : 'nb';
}
function systemPrompt(u, s, { data = null, fileTexts = [] } = {}) {
  const lang = langOf(u);
  // Prompt 44: dato og klokkeslett i Oslo i alle svar («Nå: tirsdag 21. oktober 2026 kl. 10.42 (Europe/Oslo)»).
  const parts = [PERSONAS[s.persona] ?? PERSONAS.standard, lang === 'en' ? 'Answer in English.' : 'Svar på norsk bokmål.', `${osloNowLine()}.`];
  if (s.system) parts.push(s.system);
  const mem = memoryPrompt43(u); // prompt 43: AI-minnet (bl.a. importert fra Claude)
  if (mem) parts.push(mem);
  if (data) parts.push(`Brukerens egne data (sammendrag, bruk bare når det er relevant, ikke finn på tall):\n${Object.values(data).join('\n')}`);
  for (const f of fileTexts) parts.push(`Vedlegg «${f.name}»:\n${f.text}`);
  return parts.join('\n\n');
}

/* ---------------- Strømming fra motorene ---------------- */

// Tidsgrense = tid uten nye tokens (første token inkludert), fra Innstillinger → AI → Tidsgrenser.
function idleGuard(ms, outer) {
  const ctrl = new AbortController();
  let t = null, timedOut = false;
  const arm = () => { clearTimeout(t); t = setTimeout(() => { timedOut = true; ctrl.abort(new DOMException('tidsavbrudd', 'TimeoutError')); }, ms); };
  const onOuter = () => ctrl.abort(outer.reason);
  outer?.addEventListener('abort', onOuter, { once: true });
  arm();
  return { signal: ctrl.signal, arm, done: () => { clearTimeout(t); outer?.removeEventListener('abort', onOuter); }, get timedOut() { return timedOut; } };
}
async function* lines(res, guard) {
  const dec = new TextDecoder();
  let buf = '';
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    guard.arm();
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { yield buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); }
  }
  buf += dec.decode();
  if (buf) yield buf;
}
const engineError = (name, e, guard) => {
  if (guard?.timedOut) return Object.assign(new Error(`${name} svarte ikke innen tidsfristen`), { timeout: true, net: true });
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return Object.assign(new Error('Avbrutt'), { cancelled: true });
  return Object.assign(new Error(`${name} kan ikke nås (${e?.cause?.code || e?.message || e})`), { net: true });
};
async function httpError(name, res) {
  const t = await res.text().catch(() => '');
  let d = t; try { const j = JSON.parse(t); d = j.error?.message ?? j.error ?? j.detail ?? t; } catch { /* tekst */ }
  return Object.assign(new Error(`${name} svarte ${res.status}${d ? `: ${String(d).slice(0, 200)}` : ''}`), { status: res.status });
}
const imgMime = (b64) => (b64.startsWith('iVBOR') ? 'image/png' : b64.startsWith('UklGR') ? 'image/webp' : b64.startsWith('R0lG') ? 'image/gif' : 'image/jpeg');
const stripData = (s) => String(s).replace(/^data:[^;]+;base64,/, '');
const openaiMessages = (sys, msgs) => [{ role: 'system', content: sys }, ...msgs.map((m) => (m.images?.length && m.role === 'user'
  ? { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((b) => ({ type: 'image_url', image_url: { url: `data:${imgMime(b)};base64,${b}` } }))] }
  : { role: m.role, content: m.content }))];

/** OpenAI-kompatibel SSE (Open WebUI og Groq). */
async function openaiStream(name, url, headers, body, { onDelta, onThink = async () => {}, signal, idleMs }) {
  const g = idleGuard(idleMs, signal);
  let tokens = null, usedWeb = false;
  const tf52 = thinkSplit52(); // prompt 52: <think>…</think> til tankegangen, aldri i svaret
  try {
    let res;
    try { res = await F(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers }, body: JSON.stringify(body), signal: g.signal }); }
    catch (e) { throw engineError(name, e, g); }
    if (!res.ok) throw await httpError(name, res);
    try {
      for await (const line of lines(res, g)) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw Object.assign(new Error(`${name}: ${String(j.error.message ?? j.error).slice(0, 200)}`), { engine: true });
        if (j.sources?.length || j.citations?.length) usedWeb = true;
        const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
        const rc = j.choices?.[0]?.delta?.reasoning_content ?? j.choices?.[0]?.delta?.reasoning ?? ''; // prompt 52: tankegang
        if (rc) await onThink(rc);
        if (d) { const x = tf52.push(d); if (x.think) await onThink(x.think); if (x.text) await onDelta(x.text); }
        if (j.usage) tokens = { count: j.usage.completion_tokens ?? j.usage.eval_count ?? null, perSec: j.usage['response_token/s'] ?? null };
        if (j.x_groq?.usage) tokens = { count: j.x_groq.usage.completion_tokens, perSec: j.x_groq.usage.completion_tokens / (j.x_groq.usage.completion_time || 1) };
      }
    } catch (e) { if (e.engine) throw e; throw engineError(name, e, g); }
    { const x = tf52.end(); if (x.think) await onThink(x.think); if (x.text) await onDelta(x.text); }
    return { tokens, usedWeb };
  } finally { g.done(); }
}
// Prompt 43/44: Ollama og Open WebUI via gaten (interaktiv prioritet, kø, keep_alive per modell, tid til første token og tid uten
// nye tokens). Bitene sendes videre til klienten mens de kommer. backend: 'ollama' (direkte) | undefined (gaten velger:
// Open WebUI, eller Ollama direkte når Open WebUI ikke slo av tenkingen for modellen) | 'openwebui' (sky-modeller via Open WebUI,
// utenom køen). owuiExtra: files (kunnskapsbase) og features (Open WebUIs eget nettsøk) – bare til Open WebUI.
async function gateStream(model, sys, msgs, s, { onDelta, onThink = async () => {}, signal, backend, owuiExtra = null, noQueue = false, name = 'Ollama' }) {
  let tokens = null;
  const tf = thinkSplit52(); // <think>…</think> i selve teksten (eldre maler) og message.thinking går til tankegangen (prompt 52), aldri i svaret
  const idle = aiTimeoutsOf().ollama * 1000;
  const body = chatBody({ model, options: { temperature: s.temperature, top_p: s.topP, num_ctx: s.numCtx },
    messages: [{ role: 'system', content: sys }, ...msgs.map((m) => ({ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}) }))] }, s.think);
  try {
    const out = await gateChat({ model, body, base: ollamaBase(), fetch: F, signal, priority: 'interactive', short: false, allowThink: !!s.think, image: msgs.some((m) => m.images?.length),
      warmMs: idle, idleMs: idle, label: 'Chat', ...(backend ? { backend } : {}), ...(owuiExtra ? { owuiExtra } : {}), ...(noQueue ? { noQueue: true } : {}),
      onChunk: async (j) => {
        const th = j.message?.thinking ?? j.message?.reasoning_content ?? j.choices?.[0]?.delta?.reasoning_content ?? ''; // prompt 52
        if (th) await onThink(th);
        if (j.message?.content) { const x = tf.push(j.message.content); if (x.think) await onThink(x.think); if (x.text) await onDelta(x.text); }
        if (j.done && j.eval_count) tokens = { count: j.eval_count, perSec: j.eval_duration ? j.eval_count / (j.eval_duration / 1e9) : null };
      } });
    const rest = tf.end();
    if (rest.think) await onThink(rest.think);
    if (rest.text) await onDelta(rest.text);
    return { tokens, telemetry: out.telemetry, usedWeb: !!out.usedWeb };
  } catch (e) {
    if (e instanceof GateError) {
      const who = e.backendName ?? name;
      if (e.kind === 'cancelled' || signal?.aborted) throw Object.assign(new Error('Avbrutt'), { cancelled: true });
      if (e.kind === 'load_timeout' || e.kind === 'idle_timeout') throw Object.assign(new Error(`${who} svarte ikke innen tidsfristen`), { timeout: true, net: true, telemetry: e.telemetry });
      if (e.kind === 'nocontact') throw Object.assign(new Error(maskSecrets(`${who} kan ikke nås (${e.code || e.message})`)), { net: true, telemetry: e.telemetry });
      if ((e.kind === 'http' || e.kind === 'memory') && e.status) throw Object.assign(new Error(maskSecrets(`${who} svarte ${e.status}${e.ollamaError ? `: ${String(e.ollamaError).slice(0, 200)}` : ''}`)), { status: e.status, telemetry: e.telemetry });
      throw Object.assign(new Error(maskSecrets(`${who}: ${e.ollamaError ?? e.message}`)), { engine: true, telemetry: e.telemetry });
    }
    throw e;
  }
}
const ollamaStream = (model, sys, msgs, s, o) => gateStream(model, sys, msgs, s, { ...o, backend: 'ollama', name: 'Ollama' });
async function geminiStream(model, sys, msgs, s, { onDelta, signal, webSearch }) {
  const g = idleGuard(aiTimeoutsOf().gemini * 1000, signal);
  let tokens = null, usedWeb = false;
  try {
    const contents = msgs.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || ' ' }, ...(m.images ?? []).map((b) => ({ inline_data: { mime_type: imgMime(b), data: b } }))] }));
    let res;
    try {
      res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: g.signal,
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: sys }] }, generationConfig: { temperature: s.temperature, topP: s.topP }, ...(webSearch ? { tools: [{ google_search: {} }] } : {}) }) });
    } catch (e) { throw engineError('Gemini', e, g); }
    if (!res.ok) throw await httpError('Gemini', res);
    try {
      for await (const line of lines(res, g)) {
        if (!line.startsWith('data:')) continue;
        let j; try { j = JSON.parse(line.slice(5).trim()); } catch { continue; }
        const cand = j.candidates?.[0];
        const d = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
        if (d) await onDelta(d);
        if (cand?.groundingMetadata) usedWeb = true;
        if (j.usageMetadata?.candidatesTokenCount) tokens = { count: j.usageMetadata.candidatesTokenCount, perSec: null };
      }
    } catch (e) { throw engineError('Gemini', e, g); }
    return { tokens, usedWeb };
  } finally { g.done(); }
}
function mockAnswer(text, data, facts = null) {
  const t = String(text ?? '').toLowerCase();
  if (facts?.length) return factsAnswer(facts); // prompt 41: svar på alle delene ut fra faktaene
  if (data && /mat|brukte|penger|kr|finans|økonomi/.test(t)) return `Ut fra Finans-dataene dine: ${data.finans.split('. ').slice(0, 2).join('. ')}. Vil du at jeg setter opp et forslag til matbudsjett for neste måned?`;
  if (/hei|hallo/.test(t)) return 'Hei! Jeg er Homelab-assistenten. Jeg kan hjelpe med økonomi, kalender, huskelisten eller oppsett av serveren. Hva lurer du på?';
  return 'Her er et kort svar: Docker Compose samler tjenestene dine i én fil, så du kan starte alt med `docker compose up -d`. '
    + 'Legg Ollama og Open WebUI på samme nettverk, og bruk et volum for modellene, så slipper du å laste dem ned på nytt. Si fra hvis du vil ha et eksempel.';
}
async function mockStream(text, data, { onDelta, signal, facts = null }) {
  const words = mockAnswer(text, data, facts).split(/(?<=\s)/);
  for (const w of words) { if (signal.aborted) throw Object.assign(new Error('Avbrutt'), { cancelled: true }); await onDelta(w); await sleep(_chatTest.mockDelayMs); }
  return { tokens: { count: words.length, perSec: null } };
}

/** Kjører modellen: Open WebUI først når den er satt opp (og modellen kommer derfra), ellers direkte. */
async function runEngine(m, ctx) {
  const { sys, s, webSearch, files, onDelta, signal, gotText } = ctx;
  const msgs = stripThink52(ctx.msgs); // prompt 52: tankegangen sendes aldri tilbake til modellen
  const onThink = ctx.onThink ?? (async () => {});
  if (isMock()) return { ...(await mockStream(msgs.at(-1)?.content, ctx.data, { onDelta, signal, facts: ctx.facts })), engine: 'mock' };
  const o = owui();
  // Prompt 44: Open WebUI via gaten (samme kø som Ollama). ai_backend = 'ollama' → Ollama-modeller går direkte.
  const viaOwui = o && (m.via === 'openwebui' || !/^(gemini|groq):/.test(m.id)) && (m.provider !== 'ollama' || backendConfig().effective === 'openwebui');
  if (viaOwui) {
    try {
      const owuiExtra = { ...(webSearch ? { features: { web_search: true } } : {}), ...(files.length ? { files } : {}) };
      const local = m.provider === 'ollama';
      const r = await gateStream(m.id, sys, msgs, s, { onDelta, onThink, signal, ...(local ? {} : { backend: 'openwebui', noQueue: true }), owuiExtra, name: 'Open WebUI' });
      return { ...r, engine: r.telemetry?.backend === 'ollama' ? 'ollama' : 'openwebui' };
    } catch (e) {
      // Open WebUI nede (og ingenting er strømmet ennå): prøv motoren direkte.
      if (!e.net || e.timeout || gotText() || signal.aborted) throw e;
      console.warn('[chat] Open WebUI svarte ikke, bruker motoren direkte:', maskSecrets(e.message));
    }
  }
  if (m.provider === 'gemini') return { ...(await geminiStream(m.id.replace(/^gemini:/, ''), sys, msgs, s, { onDelta, signal, webSearch })), engine: 'gemini' };
  if (m.provider === 'groq') {
    const key = secret('groqKey');
    if (!key) throw new Error('Groq-nøkkel mangler (Innstillinger → AI)');
    let model = m.id.replace(/^groq:/, '');
    if (msgs.some((x) => x.images?.length) && !/llama-4|scout/.test(model)) model = GROQ_VISION_DEFAULT;
    return { ...(await openaiStream('Groq', 'https://api.groq.com/openai/v1/chat/completions', { Authorization: `Bearer ${key}` },
      { model: model || GROQ_DEFAULT, stream: true, messages: openaiMessages(sys, msgs), temperature: s.temperature, top_p: s.topP }, { onDelta, onThink, signal, idleMs: aiTimeoutsOf().groq * 1000 })), engine: 'groq', usedWeb: false };
  }
  return { ...(await ollamaStream(m.id, sys, msgs, s, { onDelta, onThink, signal })), engine: 'ollama' };
}

/* ---------------- Meldinger inn ---------------- */

const B64 = /^[A-Za-z0-9+/=\s]+$/;
function cleanMessages(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const m of list.slice(-200)) {
    if (!m || !['user', 'assistant', 'system'].includes(m.role)) continue;
    const images = Array.isArray(m.images) ? m.images.slice(0, 4).map(stripData).filter((b) => b.length < 12_000_000 && B64.test(b.slice(0, 200))) : [];
    const att = attIds50(m.attachments); // prompt 50: vedlegg (id-er) – beskrivelsen hentes fra databasen
    const attTh = m.role === 'user' ? cleanAttTh52(m.attTh) : []; // prompt 52: miniatyr (maks 220 px) lagres på meldingen
    out.push({ role: m.role, content: String(m.content ?? '').slice(0, 100_000), ...(images.length ? { images } : {}), ...(att.length ? { attachments: att } : {}), ...(attTh.length ? { attTh } : {}) });
  }
  return out;
}
const sameMsg = (a, b) => a.role === b.role && a.content === b.content;

/* ---------------- Ruter ---------------- */

const api = new Hono();
// Delt samtale: offentlig med tilfeldig token (før innloggingen).
api.get('/shared/:token', (c) => {
  const t = c.req.param('token');
  const r = /^[A-Za-z0-9_-]{16,64}$/.test(t) ? q('SELECT * FROM hl_chats WHERE share_token=?').get(t) : null;
  if (!r) return c.text('Fant ikke samtalen', 404);
  return c.body(toMarkdown(r), 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
});
api.use('*', authOrToken);
mountFiles50(api); // prompt 50: GET /files/:id, /files/:id/thumb, POST /files/:id/finans
const adminOnly = async (c, next) => { if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan endre modellene på serveren' }, 403); await next(); };
const bad = (c, error, code = 400) => c.json({ error }, code);

api.get('/models', async (c) => {
  const models = await listModels();
  // Prompt 41: auto = «✦ Auto» (øverst i velgeren), preferred = 'auto' for nye samtaler. default er fortsatt en ekte modell (eldre klienter).
  return c.json({ models, default: await defaultModel(c.get('user')), preferred: AUTO_ID, auto: autoEntry41(models, c.get('user')), openwebui: !!owui(), mock: isMock() || undefined });
});
// Hent en modell fra ollama.com med fremdrift (SSE). Via Open WebUI når den er satt opp, ellers direkte til Ollama.
api.post('/models/pull', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._\-/]*(?::[a-z0-9._-]+)?$/i.test(name) || name.length > 80) return bad(c, 'Ugyldig modellnavn');
  return streamSSE(c, async (sse) => {
    const ctrl = new AbortController();
    sse.onAbort(() => ctrl.abort());
    const send = (event, d) => sse.writeSSE({ event, data: JSON.stringify(d) });
    if (isMock()) {
      for (const p of [0, 25, 60, 100]) { await send('progress', { status: p < 100 ? 'pulling' : 'success', completed: p * 1e7, total: 1e9 }); await sleep(_chatTest.mockDelayMs); }
      await send('done', { ok: true, name }); return;
    }
    const o = owui();
    const g = idleGuard(120_000, ctrl.signal);
    try {
      const res = await F(o ? `${o.url}/ollama/api/pull` : `${ollamaBase()}/api/pull`, { method: 'POST', signal: g.signal, headers: { 'content-type': 'application/json', ...(o ? owuiHeaders(o) : {}) }, body: JSON.stringify({ name, model: name, stream: true }) });
      if (!res.ok) throw await httpError(o ? 'Open WebUI' : 'Ollama', res);
      for await (const line of lines(res, g)) {
        const l = line.replace(/^data:\s*/, '').trim();
        if (!l) continue;
        let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.error) throw new Error(String(j.error));
        await send('progress', { status: j.status ?? '', completed: j.completed ?? 0, total: j.total ?? 0 });
      }
      modelCache.at = 0;
      await send('done', { ok: true, name });
    } catch (e) { if (!sse.aborted) await send('error', { error: e.status ? e.message : engineError(o ? 'Open WebUI' : 'Ollama', e, g).message }); } finally { g.done(); }
  });
});
api.delete('/models/:name', adminOnly, async (c) => {
  const name = c.req.param('name');
  if (isMock()) return c.json({ ok: true });
  const o = owui();
  try {
    const res = await F(o ? `${o.url}/ollama/api/delete` : `${ollamaBase()}/api/delete`, { method: 'DELETE', headers: { 'content-type': 'application/json', ...(o ? owuiHeaders(o) : {}) }, body: JSON.stringify({ name, model: name }), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return bad(c, `Kunne ikke slette: ${o ? 'Open WebUI' : 'Ollama'} svarte ${res.status}`, res.status === 404 ? 404 : 502);
  } catch (e) { return bad(c, `${o ? 'Open WebUI' : 'Ollama'} kan ikke nås (${e.cause?.code || e.name})`, 502); }
  modelCache.at = 0;
  return c.json({ ok: true });
});

api.get('/chats', (c) => c.json(chatList(c.get('user'), String(c.req.query('q') ?? '').slice(0, 100))));
api.get('/chats/:id', (c) => { const r = chatRow(c.get('user'), c.req.param('id')); return r ? c.json(full(r)) : c.json({ error: 'Fant ikke samtalen' }, 404); });
api.patch('/chats/:id', async (c) => {
  const u = c.get('user'), r = chatRow(u, c.req.param('id'));
  if (!r) return c.json({ error: 'Fant ikke samtalen' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const n = { title: r.title, pinned: r.pinned, folder_id: r.folder_id, settings: r.settings, model: r.model };
  if (typeof b.title === 'string') n.title = b.title.trim().slice(0, 120) || r.title;
  if ('pinned' in b) n.pinned = b.pinned ? 1 : 0;
  if ('folderId' in b) {
    if (b.folderId && !q('SELECT 1 FROM hl_chat_folders WHERE id=? AND user_id=?').get(String(b.folderId), u)) return bad(c, 'Ukjent mappe');
    n.folder_id = b.folderId || null;
  }
  if (b.settings && typeof b.settings === 'object') n.settings = JSON.stringify(cleanSettings({ ...parse(r.settings, {}), ...b.settings }));
  if (typeof b.model === 'string' && b.model.length <= 120) n.model = b.model;
  q('UPDATE hl_chats SET title=?, pinned=?, folder_id=?, settings=?, model=? WHERE id=?').run(n.title, n.pinned, n.folder_id, n.settings, n.model, r.id);
  return c.json(full(chatRow(u, r.id)));
});
api.delete('/chats/:id', (c) => { q('DELETE FROM hl_chats WHERE id=? AND user_id=?').run(c.req.param('id'), c.get('user')); return c.json({ ok: true }); });
api.get('/chats/:id/export', (c) => {
  const r = chatRow(c.get('user'), c.req.param('id'));
  if (!r) return c.json({ error: 'Fant ikke samtalen' }, 404);
  const file = (r.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'samtale').replace(/\s+/g, '-');
  return c.body(toMarkdown(r), 200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${encodeURIComponent(file)}.md"` });
});
api.post('/chats/:id/share', (c) => {
  const r = chatRow(c.get('user'), c.req.param('id'));
  if (!r) return c.json({ error: 'Fant ikke samtalen' }, 404);
  const token = r.share_token || randomBytes(18).toString('base64url');
  if (!r.share_token) q('UPDATE hl_chats SET share_token=? WHERE id=?').run(token, r.id);
  const origin = originOf46(c) || (() => { try { return new URL(c.req.url).origin; } catch { return ''; } })(); // prompt 46: PUBLIC_URL / klarert X-Forwarded-Host, aldri Docker-IP
  return c.json({ url: `${origin}/api/chat/shared/${token}`, token });
});
api.delete('/chats/:id/share', (c) => { q('UPDATE hl_chats SET share_token=NULL WHERE id=? AND user_id=?').run(c.req.param('id'), c.get('user')); return c.json({ ok: true }); });

api.post('/folders', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim().slice(0, 80);
  if (!name) return bad(c, 'Gi mappen et navn');
  const id = randomUUID();
  q('INSERT INTO hl_chat_folders(id,user_id,name,open,created) VALUES(?,?,?,1,?)').run(id, c.get('user'), name, Date.now());
  return c.json({ id, name, open: true, chats: [] });
});
api.patch('/folders/:id', async (c) => {
  const u = c.get('user'), f = q('SELECT * FROM hl_chat_folders WHERE id=? AND user_id=?').get(c.req.param('id'), u);
  if (!f) return c.json({ error: 'Fant ikke mappen' }, 404);
  const b = await c.req.json().catch(() => ({}));
  if (f.sys && typeof b.name === 'string' && b.name.trim() && b.name.trim() !== f.name) return c.json({ error: 'Systemmappen kan ikke få nytt navn' }, 403);
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 80) : f.name;
  const open = 'open' in b ? (b.open ? 1 : 0) : f.open;
  q('UPDATE hl_chat_folders SET name=?, open=? WHERE id=?').run(name, open, f.id);
  return c.json({ id: f.id, name, open: !!open });
});
api.delete('/folders/:id', (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (isSysFolder(id)) return c.json({ error: 'Systemmappen «Kvitteringer og skanninger» kan ikke slettes' }, 403);
  if (q('DELETE FROM hl_chat_folders WHERE id=? AND user_id=?').run(id, u).changes) q('UPDATE hl_chats SET folder_id=NULL WHERE folder_id=? AND user_id=?').run(id, u);
  return c.json({ ok: true });
});

// Prompt 34: skann-samtaler (se server/chat-scans.js). POST /system {kind, ref?, title, source?, attachment?, model?, text?, tools?, status?}
api.post('/system', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return bad(c, 'Forventet {kind, title}');
  try { return c.json(upsertScanChat(c.get('user'), b)); } catch (e) { return c.json({ error: e.message }, e.status ?? 500); }
});

const settingsOut = (u) => ({ chat_my_data: userBool(u, 'chat_my_data'), chat_ask_cloud: userBool(u, 'chat_ask_cloud'), chat_default_model: userCfg(u, 'chat_default_model') || '',
  chat_theme: userCfg(u, 'chat_theme') || 'papir', openwebui: !!owui(), language: langOf(u) });
api.get('/settings', (c) => c.json(settingsOut(c.get('user'))));
api.patch('/settings', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const ch = {};
  for (const k of ['chat_my_data', 'chat_ask_cloud']) if (k in b) ch[k] = b[k] ? '1' : '0';
  if ('chat_default_model' in b) ch.chat_default_model = b.chat_default_model ? String(b.chat_default_model) : null;
  if ('chat_theme' in b) ch.chat_theme = /^n/i.test(String(b.chat_theme)) ? 'noytral' : 'papir';
  try { setUserCfg(c.get('user'), ch); } catch (e) { return bad(c, e.message); }
  return c.json(settingsOut(c.get('user')));
});

api.get('/mydata', async (c) => c.json(await myData(c.get('user'))));
// Prompt 41: «✦ Auto» – hva Glimt bruker nå, og tilbakemelding på siste Auto-svar (Prøv igjen / byttet modell / 👍 👎).
api.get('/auto', async (c) => c.json(autoSummary41(c.get('user'), await listModels())));
api.post('/chats/:id/feedback', async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  if (!chatRow(c.get('user'), c.req.param('id'))) return c.json({ error: 'Fant ikke samtalen' }, 404);
  return c.json({ ok: feedbackAuto41(c.get('user'), c.req.param('id'), { retry: !!b.retry, switched: !!b.switched, vote: b.vote }) });
});

// Vedlegg: lagres hos oss (per bruker); tekst leses ut lokalt. Med Open WebUI lastes filen også opp dit (RAG).
const TEXTY = /^(text\/|application\/(json|xml|csv|x-yaml|yaml|javascript|x-sh))/;
api.post('/files', bodyLimit({ maxSize: 25 * 1024 * 1024, onError: (c) => bad(c, 'Filen kan være maks 25 MB', 413) }), async (c) => {
  const u = c.get('user');
  let f;
  try { f = (await c.req.parseBody()).file; } catch { f = null; }
  if (!(f instanceof File) || !f.size) return bad(c, 'Velg en fil');
  if (f.size > LIMITS50.maxBytes) return bad(c, 'Filen er for stor (maks 20 MB)', 413); // prompt 50
  const name = String(f.name || 'vedlegg').replace(/[\\/\0]/g, '_').slice(0, 120), buf = Buffer.from(await f.arrayBuffer());
  const mime = f.type || 'application/octet-stream';
  const text = TEXTY.test(mime) || /\.(md|txt|csv|json|ya?ml|log|ini|conf|sh|js|py)$/i.test(name) ? buf.toString('utf8').slice(0, 60_000) : null;
  let owuiId = null;
  const o = owui();
  if (o && !isMock() && !/^image\//.test(mime)) { // prompt 50: bilder går til modellen som bilder, ikke som RAG-fil
    try {
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type: mime }), name);
      const r = await F(`${o.url}/api/v1/files/`, { method: 'POST', headers: owuiHeaders(o), body: fd, signal: AbortSignal.timeout(60_000) });
      if (r.ok) owuiId = (await r.json()).id ?? null;
    } catch { /* lokalt vedlegg holder */ }
  }
  // Prompt 50: original + miniatyr (maks 480 px, WebP) for bilder; typen leses fra innholdet.
  const row = await saveFile50(u, { buf, name, mime, text, owuiId });
  const d = desc50(row);
  return c.json({ ...d, readable: !!text || !!owuiId || d.kind === 'image' });
});
api.delete('/files/:id', async (c) => {
  const r = q('SELECT * FROM hl_chat_files WHERE id=? AND user_id=?').get(c.req.param('id'), c.get('user'));
  if (r) { q('DELETE FROM hl_chat_files WHERE id=?').run(r.id); await unlink(r.path).catch(() => {}); await deleteFile50(r); }
  return c.json({ ok: true });
});
api.get('/knowledge', async (c) => {
  const u = c.get('user');
  const own = q('SELECT id, name, size, mime, created FROM hl_chat_files WHERE user_id=? ORDER BY created DESC LIMIT 200').all(u)
    .map((f) => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, source: 'lokal', type: 'file', createdAt: iso(f.created) }));
  const o = owui();
  if (!o || isMock()) return c.json(own);
  try {
    const r = await F(`${o.url}/api/v1/knowledge/`, { headers: owuiHeaders(o), signal: AbortSignal.timeout(6000) });
    const list = r.ok ? await r.json() : [];
    return c.json([...own, ...(Array.isArray(list) ? list : list.items ?? []).map((k) => ({ id: `kb:${k.id}`, name: k.name, size: null, source: 'openwebui', type: 'collection', description: k.description ?? '' }))]);
  } catch { return c.json(own); }
});

// Tale → tekst via Open WebUI (Whisper). Uten Open WebUI bruker klientene systemets talegjenkjenning (nb-NO).
api.post('/transcribe', bodyLimit({ maxSize: 25 * 1024 * 1024, onError: (c) => bad(c, 'Lydfilen kan være maks 25 MB', 413) }), async (c) => {
  let f;
  try { const b = await c.req.parseBody(); f = b.file ?? b.audio; } catch { f = null; }
  if (!(f instanceof File) || !f.size) return bad(c, 'Mangler lydfil');
  if (isMock()) return c.json({ text: 'Hvor mye brukte jeg på mat i forrige måned?', mock: true });
  const o = owui();
  if (!o) return c.json({ error: 'Tale til tekst krever Open WebUI. Bruk talegjenkjenningen på enheten (nb-NO).', useDevice: true }, 501);
  try {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from(await f.arrayBuffer())], { type: f.type || 'audio/webm' }), f.name || 'tale.webm');
    fd.append('language', langOf(c.get('user')) === 'en' ? 'en' : 'no');
    const r = await F(`${o.url}/api/v1/audio/transcriptions`, { method: 'POST', headers: owuiHeaders(o), body: fd, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return bad(c, `Open WebUI svarte ${r.status}`, 502);
    return c.json({ text: String((await r.json()).text ?? '').trim() });
  } catch (e) { return bad(c, `Open WebUI kan ikke nås (${e.cause?.code || e.name})`, 502); }
});

api.post('/send', bodyLimit({ maxSize: 40 * 1024 * 1024, onError: (c) => bad(c, 'Meldingen er for stor (maks 40 MB med bilder)', 413) }), async (c) => {
  const u = c.get('user');
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return bad(c, 'Forventet JSON');
  const incoming = cleanMessages(b.messages);
  if (!incoming?.length) return bad(c, 'Mangler meldinger');
  let chat = b.chatId ? chatRow(u, b.chatId) : null;
  if (b.chatId && !chat) return c.json({ error: 'Fant ikke samtalen' }, 404);
  const wantModel = String(b.model || chat?.model || (await defaultModel(u)) || '').slice(0, 120);
  if (!wantModel) return bad(c, 'Ingen modell er tilgjengelig. Installer en Ollama-modell eller legg inn en Gemini-/Groq-nøkkel.');
  const s = cleanSettings({ ...parse(chat?.settings ?? '{}', {}), ...(b.settings && typeof b.settings === 'object' ? b.settings : {}) });
  const wantData = !!b.myData && !b.withoutMyData && userBool(u, 'chat_my_data');
  let files = (Array.isArray(b.files) ? b.files : []).slice(0, 10).map((id) => String(id)).map((id) => (id.startsWith('kb:') ? { kb: id.slice(3), name: 'Kunnskapsbase' } : q('SELECT * FROM hl_chat_files WHERE id=? AND user_id=?').get(id, u))).filter(Boolean);
  // Prompt 50: bildefiler (files eller attachments i siste melding) teller som bilder, så Auto velger en modell som ser bilder.
  const isImgRow50 = (f) => !!f && !f.kb && (f.kind ?? kindOf50(f.mime)) === 'image';
  const attRows50 = attIds50(incoming.at(-1)?.attachments).map((id) => q('SELECT * FROM hl_chat_files WHERE id=? AND user_id=?').get(id, u)).filter(Boolean);
  const imgCount = incoming.reduce((n, x) => n + (x.images?.length ?? 0), 0) + new Set([...files, ...attRows50].filter(isImgRow50).map((f) => f.id)).size;
  // Prompt 41: «✦ Auto» – Glimt velger modell for denne meldingen (samtalen står fortsatt på Auto).
  let auto = null;
  if (wantModel === AUTO_ID) {
    auto = pickAuto41(await listModels(), { text: incoming.at(-1)?.content ?? '', images: imgCount, files, wantData, user: u });
    if (!auto) return bad(c, 'Ingen modell er tilgjengelig. Installer en Ollama-modell eller legg inn en Gemini-/Groq-nøkkel.');
  }
  const modelId = auto ? auto.model : wantModel;
  let m = await modelFor(modelId);
  const chatModelId = auto ? AUTO_ID : m.id; // prompt 50: samtalen beholder valgt modell selv om en vision-modell svarer på bildet

  // Historikk: lagret samtale (kuttet ved editFrom) + nye meldinger. Sender klienten hele historikken, brukes den.
  let base = chat ? parse(chat.messages, []) : [];
  if (Number.isInteger(b.editFrom) && b.editFrom >= 0) base = base.slice(0, b.editFrom);
  let history;
  if (!base.length) history = incoming;
  else if (incoming.length > base.length && base.every((x, i) => sameMsg(x, incoming[i]))) history = [...base, ...incoming.slice(base.length)];
  else if (incoming.length <= 2 && incoming.at(-1).role === 'user') history = [...base, incoming.at(-1)];
  else history = incoming;
  if (history.at(-1)?.role !== 'user') return bad(c, 'Siste melding må være fra deg');

  // Prompt 50 (SRVCHAT50): vedlegg → lagrede bilder med miniatyr; modellen får nedskalerte bilder. Kan valgt modell ikke se bilder,
  // svarer beste lokale vision-modell på denne meldingen, ellers lokal OCR. Kvitteringer går aldri til sky når sperren er på.
  const prep50 = await prepareHistory50(u, history, files);
  { const ids = new Set(prep50.imageFiles.map((r) => r.id)); files = files.filter((f) => !ids.has(f.id)); }
  const last50 = history.at(-1);
  const hasImg50 = !!last50.images?.length;
  const wantReceipt50 = hasImg50 && RECEIPT_RE50.test(last50.content ?? '') && !b.noTools && b.imageMode !== 'model';
  const finBlocked50 = wantReceipt50 && externalBlocked48().blocked;
  let readWith50 = null, modelMsgs = history;
  // Prompt 51 (RCPTSRV51): vei per bilde – kvittering (kjeden), dokument (OCR-rader → tekstmodell), foto (visjonsmodell) eller modellen selv.
  // Aldri bilder til en modell uten bildestøtte; veien som ble brukt står i readWith (route, label).
  const intent51 = hasImg50 && !wantReceipt50 ? (b.imageMode === 'ocr' ? 'document' : imageIntent51(last50.content)) : null;
  const toDocument51 = async (doc, why = null) => {
    const tm = textModel51(m, await listModels(), { blocked: externalBlocked48().blocked, fallbackId: r48Settings().textModel || 'qwen3:8b' });
    const from = m.id;
    m = tm;
    const { images, ...rest } = last50; void images;
    modelMsgs = [...history.slice(0, -1), { ...rest, content: `${last50.content ?? ''}\n\n${documentNote51(doc.ocr, doc.engine)}`.trim() }];
    readWith50 = { route: 'document', engine: 'ocr', ocr_engine: doc.engine, model: tm.id, from, rows: doc.ocr.rows.length,
      label: `Lest med ${doc.engine === 'mac_vision' ? 'Mac Vision' : 'Tesseract'} + ${tm.id.replace(/:latest$/, '')}${why ? ` (${why})` : ' (dokument)'}` };
  };
  if (hasImg50 && !wantReceipt50) {
    let doc = null;
    if (intent51 === 'document' || (!m.vision && intent51 !== 'photo')) {
      doc = await readDocument51(prep50.imageFiles).catch((e) => ({ ok: false, error: e.message }));
      if (doc.ok && (intent51 === 'document' || looksLikeDocument51(doc.ocr))) await toDocument51(doc);
      else doc = doc.ok ? doc : null;
    }
    if (!readWith50 && (!m.vision || (finBlocked50 && m.kind === 'sky'))) {
      const models51 = await listModels();
      const vm = visionModel51(models51, () => bestVision50(models51, rankFor41));
      const who = (m.kind === 'sky' ? m.name : m.id).replace(/:latest$/, '');
      if (vm) {
        readWith50 = { route: 'vision', engine: 'vision', model: vm.id, modelName: vm.name, from: m.id, label: `Lest med ${vm.id.replace(/:latest$/, '')} fordi ${who} ikke kan se bilder` };
        m = vm;
      } else {
        // Ingen visjonsmodell: teksten i bildet (OCR) til valgt modell.
        const o = doc?.ok ? { ok: true, text: doc.ocr.rows.join('\n').slice(0, 12_000) } : await ocrImages50(prep50.imageFiles);
        readWith50 = { route: 'document', engine: 'ocr', ocr_engine: doc?.engine ?? 'tesseract', model: m.id, from: m.id, label: o.ok ? 'Lest med lokal OCR' : `Kunne ikke lese bildet (${o.error})` };
        const note = o.ok ? ocrNote50(o.text) : `[Bildet kunne ikke leses: ingen installert modell ser bilder, og lokal OCR ga ingen tekst (${o.error}). Si det kort til brukeren.]`;
        const { images, ...rest } = last50; void images;
        modelMsgs = [...history.slice(0, -1), { ...rest, content: `${last50.content ?? ''}\n\n${note}`.trim() }];
      }
    }
    if (!readWith50) readWith50 = { route: 'model', engine: 'vision', model: m.id, from: m.id, label: `${m.name ?? m.id} ser bildet selv` };
  } else if (hasImg50 && wantReceipt50 && (!m.vision || (finBlocked50 && m.kind === 'sky'))) {
    // Kvittering: kjeden svarer i strømmen. Feiler den, leses teksten som et dokument (aldri bildet til en modell uten bildestøtte).
    const { images, ...rest } = last50; void images;
    modelMsgs = [...history.slice(0, -1), rest];
  }
  if (!m.vision) modelMsgs = modelMsgs.map((x) => { if (!x.images) return x; const { images, ...rest } = x; void images; return rest; });

  // Spør før sky: modellen er SKY og mine data eller vedlegg er med.
  if (m.kind === 'sky' && (wantData || files.length || imgCount) && !b.confirmCloud && userBool(u, 'chat_ask_cloud') && !s.skipCloudAsk) {
    const leaves = [...(wantData ? Object.values(LEAVES) : []), ...files.map((f) => `Vedlegg: ${f.name}`), ...(imgCount ? [`${imgCount === 1 ? 'Bilde' : `${imgCount} bilder`} fra samtalen`] : [])];
    return c.json({ needsConfirm: true, model: m.name, modelId: m.id, provider: m.provider, leaves, error: `Sende til ${m.name}?` }, 409);
  }
  if (b.confirmCloud && b.settings?.skipCloudAsk) s.skipCloudAsk = true;

  // Prompt 44: rutingen før hovedmodellen. Bare delene av «Mine data» rutingen valgte legges ved (ikke Finans, Kalender og
  // Huskeliste på «hvem er statsminister i England»). «Nettsøk»-knappen (b.webSearch) tvinger web.
  const route = b.noTools ? { tools: ['none'], query: '', via: 'av', ms: 0 } : await routeTools(routeTextOf(history), { user: u, forceWeb: !!b.webSearch, localOnly: m.kind !== 'sky', useLlm: !isMock() }).catch(() => ({ tools: ['none'], query: '', via: 'feil', ms: 0 }));
  // Prompt 46 (GLIMT46): Nettsøk av (webSearch:false fra appene) = ingen nettkall i det hele tatt – heller ikke vårt eget søk eller
  // Open WebUIs (features.web_search:false, tool_ids:[] i hvert kall, se ai-gate owuiBody). Ville rutingen søke, sier Glimt fra.
  const webOff = b.webSearch === false;
  const wantedWeb = webOff && route.tools.includes('web');
  if (webOff) { route.tools = route.tools.filter((x) => x !== 'web'); if (!route.tools.length) route.tools = ['none']; route.query = ''; }
  const data = wantData ? (b.noTools ? await myData(u) : pickData(await myData(u), route.tools)) : null; // noTools: uten ruting, som før
  const fileTexts = files.filter((f) => f.text).map((f) => ({ name: f.name, text: f.text.slice(0, 20_000) }));
  const owuiFiles = files.map((f) => (f.kb ? { type: 'collection', id: f.kb } : f.owui_id ? { type: 'file', id: f.owui_id } : null)).filter(Boolean);
  const sys = systemPrompt(u, s, { data, fileTexts: owui() ? files.filter((f) => f.text && !f.owui_id).map((f) => ({ name: f.name, text: f.text.slice(0, 20_000) })) : fileTexts });
  const used = [...(data ? Object.entries(data).filter(([, v]) => !/^[^:]*: (ingen|ingenting|ikke tilgjengelig)\b/.test(v)).map(([k]) => USED[k]) : []), ...files.map((f) => f.name)];

  const now = Date.now();
  if (!chat) {
    const id = randomUUID();
    const first = history.find((x) => x.role === 'user')?.content ?? 'Ny samtale';
    const title = first.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Ny samtale';
    q('INSERT INTO hl_chats(id,user_id,title,model,settings,messages,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(id, u, title, chatModelId, JSON.stringify(s), JSON.stringify(history.map((x) => stored50({ ...x, ts: now }))), now, now);
    chat = chatRow(u, id);
  }
  kv.set(u, 'chat_last_model', chatModelId);
  if (m.kind === 'sky') audit(m.provider === 'openwebui' ? 'openwebui' : m.provider, 'chat', { modell: m.name, meldinger: history.length, mineData: data ? Object.keys(data) : [], vedlegg: files.map((f) => f.name), bilder: imgCount, nettsok: !!b.webSearch }, u);
  const chatId = chat.id;
  let think52 = null; // prompt 52: tankegangen for svaret (settes i strømmen)
  const saveMsgs = (answer, meta) => {
    const stored = history.map((x) => stored50({ ...x, ts: x.ts ?? now })); // prompt 50: vedlegg lagres som beskrivelse + miniatyr, ikke base64
    if (answer) stored.push({ role: 'assistant', content: answer, ts: Date.now(), ...(think52?.out() ?? {}), meta: readWith50 && !meta?.readWith ? { ...meta, readWith: readWith50 } : meta });
    q('UPDATE hl_chats SET messages=?, model=?, settings=?, updated=? WHERE id=? AND user_id=?').run(JSON.stringify(stored), chatModelId, JSON.stringify(s), Date.now(), chatId, u);
  };
  saveMsgs(null);

  return streamSSE(c, async (sse) => {
    const ctrl = new AbortController();
    sse.onAbort(() => ctrl.abort());
    let text = '', first = null;
    const t0 = Date.now();
    // Prompt 52: tankegang – modellens egne steg (thinking/<think>/reasoning_content) eller Glimts egne steg; lukkes ved første svartekst.
    think52 = thinkState52({ t0, emit: async (event, data) => { if (!sse.aborted) await sse.writeSSE({ event, data: JSON.stringify(data) }); } });
    const onThink = (d) => think52.onThink(d);
    const onDelta = async (d) => { if (!d) return; if (first == null) await think52.finish(); first ??= Date.now(); text += d; if (!sse.aborted) await sse.writeSSE({ event: 'delta', data: JSON.stringify({ text: d }) }); };
    const autoMeta = auto ? { auto: { model: auto.model, modelName: auto.modelName, kind: auto.kind, label: auto.label, reason: auto.reason, candidates: auto.candidates } } : {};
    await sse.writeSSE({ event: 'meta', data: JSON.stringify({ chatId, model: m.id, modelName: m.name, kind: m.kind, title: chat.title, ...autoMeta, ...(readWith50 ? { readWith: readWith50 } : {}),
      ...(last50.attachments?.length ? { attachments: last50.attachments } : {}) }) });
    // Prompt 50: kvittering i chat – samme kvitteringskjede som Finans, svaret er en tabell + «Legg i Finans ›». Ingen språkmodell i skyen.
    if (wantReceipt50 && prep50.imageFiles.length) {
      try {
        const rc = await receiptChat50(u, prep50.imageFiles[0], { signal: ctrl.signal, text: last50.content ?? '' });
        if (rc.ok) {
          await onDelta(rc.markdown);
          const ms = Date.now() - t0, used = ['Kvitteringsleser'];
          saveMsgs(text, { model: rc.meta.receipt.model ?? 'Glimt', ms, used, ...rc.meta });
          await sse.writeSSE({ event: 'done', data: JSON.stringify({ chatId, ms, used, engine: 'receipt', tokensPerSec: null, ...rc.meta }) });
          return;
        }
        console.warn('[chat] kvittering (prompt 50):', rc.error);
      } catch (e) { if (ctrl.signal.aborted) return; console.warn('[chat] kvittering (prompt 50):', e.message); }
      // Prompt 51: kjeden ga ingen kvittering – les teksten som et dokument (OCR-rader → tekstmodell), aldri bildet til en tekstmodell.
      if (!m.vision || m.kind === 'sky') {
        const doc = await readDocument51(prep50.imageFiles, { signal: ctrl.signal }).catch((e) => ({ ok: false, error: e.message }));
        if (doc.ok) await toDocument51(doc, 'kvitteringen kunne ikke tolkes');
        else readWith50 = { route: 'document', engine: 'ocr', model: m.id, from: m.id, label: `Kunne ikke lese bildet (${doc.error})` };
        if (!sse.aborted) await sse.writeSSE({ event: 'meta', data: JSON.stringify({ chatId, model: m.id, modelName: m.name, kind: m.kind, title: chat.title, readWith: readWith50 }) });
      }
    }
    // Prompt 41: Glimt henter fakta (vær, tid, sol) før modellen svarer. Feil her stopper aldri svaret.
    let facts = [], factUsed = [], sysAll = sys;
    if (!b.noTools && hasFactWords(history.at(-1)?.content)) {
      try {
        const g = await gatherFacts(history.at(-1).content, { user: u, localOnly: m.kind !== 'sky', signal: ctrl.signal });
        facts = g.facts; factUsed = g.used;
        if (facts.length) {
          sysAll = `${sys}\n\n${factsPrompt(facts)}`;
          if (!sse.aborted) await sse.writeSSE({ event: 'facts', data: JSON.stringify({ facts, used: factUsed }) });
        }
      } catch (e) { console.warn('[chat] fakta (prompt 41):', e.message); }
    }
    // Prompt 41: værspørsmål om uka (beste dag, mest regn …) får 7 dager med data, så modellen svarer på det som ble spurt (ikke en mal).
    if (!b.noTools && isWeekWeather41(history.at(-1)?.content)) {
      try {
        const wf = await weekFact41(u, history.at(-1).content);
        if (wf) { facts = [...facts, wf]; factUsed = [...new Set([...factUsed, 'Vær · 7 dager'])]; sysAll = `${sysAll}\n\n${wf.prompt}`; if (!sse.aborted) await sse.writeSSE({ event: 'facts', data: JSON.stringify({ facts, used: factUsed }) }); }
      } catch (e) { console.warn('[chat] ukesvær (prompt 41):', e.message); }
    }
    // Prompt 44: strømpris (power) og eget nettsøk (web). «Nettsøk» i used og meta.web bare når søket faktisk ga treff.
    let web = null;
    if (route.tools.includes('power')) {
      try {
        const pf = await powerFact(history.at(-1).content);
        facts = [...facts, pf]; sysAll = `${sysAll}\n\n${powerPrompt(pf)}`;
        if (!pf.error) factUsed = [...new Set([...factUsed, `Strømpris · ${pf.zone}`])];
        if (!sse.aborted) await sse.writeSSE({ event: 'facts', data: JSON.stringify({ facts, used: factUsed }) });
      } catch (e) { console.warn('[chat] strømpris (prompt 44):', e.message); }
    }
    if (route.tools.includes('web')) {
      try {
        web = await webSearch(route.query || history.at(-1).content, { signal: ctrl.signal });
        if (web.hits.length) {
          facts = [...facts, webFact(web)]; factUsed = [...new Set([...factUsed, 'Nettsøk'])];
          sysAll = `${sysAll}\n\n${webPrompt(web)}`;
          s.numCtx = Math.max(s.numCtx, 8192); // søkejobber: num_ctx minst 8192
          if (!sse.aborted) await sse.writeSSE({ event: 'facts', data: JSON.stringify({ facts, used: factUsed, web: webMeta(web) }) });
        }
      } catch (e) { console.warn('[chat] nettsøk (prompt 44):', e.message); }
    }
    if (wantedWeb) {
      sysAll = `${sysAll}\n\nNettsøk er slått av av brukeren. Ikke søk på nettet og ikke finn på ferske nyheter eller tall. Trenger svaret fersk informasjon fra nettet, si kort: «Nettsøk er av. Skal jeg søke på nettet for dette?»`;
      if (!sse.aborted) await sse.writeSSE({ event: 'websearch_off', data: JSON.stringify({ question: 'Nettsøk er av. Skal jeg søke på nettet for dette?', action: { label: 'Søk denne gangen', webSearch: true, once: true } }) });
    }
    const webHits = !!web?.hits?.length;
    const metaFacts = { ...(facts.length ? { facts } : {}), ...(webHits ? { web: webMeta(web) } : {}) };
    // Prompt 44: Chat i jobbloggen med backend, rutingsvalget og nettsøket.
    const jobId = jobStart({ user: u, task: 'chat', kind: 'ai', title: `Chat · «${String(history.at(-1)?.content ?? '').replace(/\s+/g, ' ').slice(0, 60)}»`, model: m.id, provider: m.provider === 'openwebui' ? 'openwebui' : m.provider });
    jobUpdate(jobId, { tools: route.tools, step: `Ruting (${route.via}): ${route.tools.join(', ')}`, ...(web ? { web: { query: web.query, hits: web.hits.length, provider: web.provider } } : {}) });
    try {
      let r, used41 = m;
      // Open WebUIs eget nettsøk (features.web_search) bare når vårt eget søk ikke ga treff.
      const owuiWeb = !!b.webSearch && !webHits;
      // Prompt 52: Glimts egne steg når modellen ikke tenker selv (tenkemodell + think:true gir modellens egne steg i stedet).
      if (!(s.think && isThinkingModel(m.id))) {
        await think52.glimt(glimtSteps52({ text: history.at(-1)?.content ?? '', images: imgCount, files: files.map((f) => f.name), tools: route.tools, used: [...factUsed, ...used],
          model: m.name ?? m.id, reason: auto?.reason ?? (readWith50?.label ?? null), readWith: readWith50 }));
      }
      try { r = await runEngine(m, { sys: sysAll, msgs: modelMsgs, s, webSearch: owuiWeb, files: owuiFiles, onDelta, onThink, signal: ctrl.signal, data, facts, gotText: () => !!text }); }
      catch (e0) {
        let e = e0;
        // Prompt 51: modellen avviste bildet («does not support multimodal») – lagre det og bytt vei: foto → visjonsmodellen,
        // ellers OCR-rader → tekstmodellen. Brukeren ser aldri den rå feilen.
        if (!text && !ctrl.signal.aborted && isMultimodalError51(e) && modelMsgs.some((x) => x.images?.length)) {
          markNoVision51(m.id, ollamaBase()); modelCache.at = 0;
          try {
            const models51 = await listModels();
            const vm = intent51 !== 'document' ? visionModel51(models51.filter((x) => x.id !== m.id), null) : null;
            if (vm) {
              readWith50 = { route: 'vision', engine: 'vision', model: vm.id, modelName: vm.name, from: m.id, switched: true, label: `Lest med ${vm.id.replace(/:latest$/, '')} fordi ${m.id.replace(/:latest$/, '')} ikke kan se bilder` };
              used41 = vm;
              r = await runEngine(vm, { sys: sysAll, msgs: modelMsgs, s, webSearch: owuiWeb, files: owuiFiles, onDelta, onThink, signal: ctrl.signal, data, facts, gotText: () => !!text });
            } else {
              const doc = await readDocument51(prep50.imageFiles, { signal: ctrl.signal });
              if (!doc.ok) throw Object.assign(new Error(`Bildet kunne ikke leses: ${doc.error}`), { handled51: true });
              const from = m.id;
              await toDocument51(doc, `${from.replace(/:latest$/, '')} kan ikke se bilder`);
              readWith50.switched = true;
              used41 = m;
              r = await runEngine(m, { sys: sysAll, msgs: modelMsgs.map((x) => { if (!x.images) return x; const { images, ...rest } = x; void images; return rest; }), s, webSearch: owuiWeb, files: owuiFiles, onDelta, onThink, signal: ctrl.signal, data, facts, gotText: () => !!text });
            }
            if (!sse.aborted) await sse.writeSSE({ event: 'meta', data: JSON.stringify({ chatId, model: used41.id, modelName: used41.name, kind: used41.kind, title: chat.title, readWith: readWith50 }) });
            e = null;
          } catch (e2) { e = e2; }
        }
        if (e) {
        // Prompt 41: Auto – svarer ikke valgt modell (og ingenting er strømmet), prøv neste beste og si det i svaret.
        const next = auto && !text && !ctrl.signal.aborted ? auto.candidates.find((id) => id !== m.id) : null;
        if (!next) throw e;
        used41 = await modelFor(next);
        auto.fallbackFrom = m.id; auto.model = used41.id; auto.modelName = used41.name; auto.label = `${auto.label.split(' · ')[0]} · ${used41.name}`; auto.reason = `${m.name} svarte ikke · bruker ${used41.name}`;
        r = await runEngine(used41, { sys: sysAll, msgs: used41.vision ? modelMsgs : modelMsgs.map((x) => { if (!x.images) return x; const { images, ...rest } = x; void images; return rest; }), s, webSearch: owuiWeb, files: owuiFiles, onDelta, onThink, signal: ctrl.signal, data, facts, gotText: () => !!text });
        }
      }
      const ms = Date.now() - t0;
      const genS = Math.max(0.001, (Date.now() - (first ?? t0)) / 1000);
      const tokensPerSec = Math.round((r.tokens?.perSec ?? (r.tokens?.count ?? Math.ceil(text.length / 4)) / genS) * 10) / 10;
      const allUsed = [...new Set([...factUsed, ...used, ...(r.usedWeb && !webOff ? ['Nettsøk'] : [])])]; // usedWeb: Open WebUI sendte kilder (sources); prompt 46: aldri når Nettsøk er av
      const autoDone = auto ? { auto: { model: used41.id, modelName: used41.name, kind: auto.kind, label: `${auto.label} · ${String(tokensPerSec).replace('.', ',')} tok/s · ${String(Math.round(ms / 100) / 10).replace('.', ',')} s`, reason: auto.reason, ...(auto.fallbackFrom ? { fallbackFrom: auto.fallbackFrom } : {}) } } : {};
      if (auto) recordAuto41(u, { model: used41.id, kind: auto.kind, ttftMs: first ? first - t0 : null, tps: tokensPerSec, chatId });
      saveMsgs(text, { model: used41.id, tokensPerSec, ms, used: allUsed, ...metaFacts, ...autoDone });
      const tl = r.telemetry;
      jobEnd(jobId, { model: used41.id, ms, step: null, ...(tl ? { backend: tl.backend, backendNote: tl.backendNote ?? null, queueMs: tl.queueMs, loadMs: tl.loadMs, genMs: tl.genMs, attempts: tl.attempts, tokIn: tl.tokIn, tokOut: tl.tokOut } : { backend: r.engine }) });
      await think52.finish(); // prompt 52: tomt svar – tankegangen lukkes likevel
      await sse.writeSSE({ event: 'done', data: JSON.stringify({ chatId, tokensPerSec, ms, used: allUsed, engine: r.engine, ...think52.out(), ...(readWith50 ? { readWith: readWith50 } : {}), tools: route.tools, ...(tl?.backend ? { backend: tl.backend } : {}), ...metaFacts, ...autoDone, ...(webOff ? { webSearch: false } : {}), ...(wantedWeb ? { webSearchOff: { question: 'Nettsøk er av. Skal jeg søke på nettet for dette?', action: { label: 'Søk denne gangen', webSearch: true, once: true } } } : {}) }) });
    } catch (e) {
      const tl = e.telemetry;
      jobUpdate(jobId, { status: ctrl.signal.aborted || e.cancelled ? 'cancelled' : 'fail', error: ctrl.signal.aborted || e.cancelled ? 'Avbrutt av bruker' : e.message, ms: Date.now() - t0, step: null,
        ...(tl ? { backend: tl.backend, backendNote: tl.backendNote ?? null, queueMs: tl.queueMs, loadMs: tl.loadMs, attempts: tl.attempts } : {}) });
      if (ctrl.signal.aborted || e.cancelled) { if (text) saveMsgs(text, { model: m.id, stopped: true, used: [...factUsed, ...used], ...metaFacts }); return; }
      const msg51 = friendlyError51(e.message); // prompt 51: aldri rå Ollama-feil til brukeren
      if (msg51 !== e.message) console.warn('[chat] modellfeil:', maskSecrets(String(e.message).slice(0, 300)));
      if (text) saveMsgs(text, { model: m.id, error: msg51, used: [...factUsed, ...used], ...metaFacts });
      await sse.writeSSE({ event: 'error', data: JSON.stringify({ error: msg51, chatId, ...(isMultimodalError51(e) ? { kode: 'ingen_bildestotte' } : {}) }) });
    }
  });
});

export default api;
