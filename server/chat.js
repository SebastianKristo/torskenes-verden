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
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db, kv } from './db.js';
import { authOrToken, layoutOf } from './mobile.js';
import { isAdmin } from './auth.js';
import { cfg, userCfg, userBool, setUserCfg } from './settings.js';
import { settings, secret } from './finans/db.js';
import { geminiFetch, hasGemini } from './finans/gemini-keys.js';
import { aiTimeoutsOf, GEMINI_DEFAULT, GROQ_DEFAULT, GROQ_MODELS, GROQ_VISION_DEFAULT, OLLAMA_KEEP_ALIVE } from './finans/ai.js';
import { CATALOG } from './finans/ollama-models.js';
import { audit } from './finans/ai-audit.js';
import { finansSummary } from './finans/summary.js';
import { nextTasks } from './tasks.js';
import { chatBody, ollamaPost, thinkFilter } from './ollama-opts.js';
import { ensureScanFolder, scanFolderInfo, isSysFolder, upsertScanChat } from './chat-scans.js';
import { gatherFacts, factsPrompt, factsAnswer, hasFactWords } from './chat-tools41.js'; // prompt 41: Glimt henter fakta
import { AUTO_ID, pickAuto41, autoEntry41, recordAuto41, feedbackAuto41, autoSummary41 } from './chat41.js'; // prompt 41: «✦ Auto»
import { weekFact41, isWeekWeather41 } from './weather41.js'; // prompt 41: ukesvær til modellen

const q = (sql) => db.prepare(sql);
const FILES = resolve(config.dataDir, 'chat', 'files');
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
    return ((await r.json()).models ?? []).filter((m) => !/embed/i.test(m.name)).map((m) => ({ id: m.name, name: prettyLocal(m.name), kind: 'lokal', provider: 'ollama', size: gb(m.size),
      vision: VISION_RE.test(m.name) || (m.details?.families ?? []).includes('clip'), installed: true }));
  } catch { return []; }
}
async function owuiModels(o) {
  const r = await F(`${o.url}/api/models`, { headers: owuiHeaders(o), signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`Open WebUI svarte ${r.status}`);
  return ((await r.json()).data ?? []).filter((m) => m?.id && !/embed/i.test(m.id)).map((m) => {
    const isOllama = m.owned_by === 'ollama' || !!m.ollama;
    const provider = isOllama ? 'ollama' : /gemini/i.test(m.id + (m.name ?? '')) ? 'gemini' : /groq|llama-3\.\d-\d+b-(versatile|instant)/i.test(m.id + (m.name ?? '') + (m.urlIdx ?? '')) ? 'groq' : 'openwebui';
    return { id: m.id, name: m.name || (isOllama ? prettyLocal(m.id) : m.id), kind: isOllama ? 'lokal' : 'sky', provider, size: gb(m.ollama?.size ?? m.size),
      vision: !!(m.info?.meta?.capabilities?.vision) || VISION_RE.test(m.id), installed: true, via: 'openwebui' };
  });
}
const modelCache = { at: 0, key: '', list: [] };
/** Alle modeller (Open WebUI når den er satt opp og svarer, ellers Ollama direkte + Gemini/Groq). Cachet 30 s. */
export async function listModels() {
  if (isMock()) return MOCK_MODELS;
  const o = owui(), key = `${o?.url ?? ''}|${ollamaBase()}|${hasGemini()}|${!!secret('groqKey')}`;
  if (modelCache.key === key && Date.now() - modelCache.at < 30_000) return modelCache.list;
  let list = null;
  if (o) { try { list = await owuiModels(o); } catch { list = null; } }
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
const msgOut = (m) => ({ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}), ...(m.files?.length ? { files: m.files } : {}), ...(m.ts ? { ts: m.ts } : {}), ...(m.meta ? { meta: m.meta } : {}),
  ...(m.card ? { card: m.card } : {}), ...(m.tool ? { tool: m.tool } : {}) }); // prompt 31: Glimt-kort (vær, kalender …) og verktøy-chip lagres i meldingen
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
  const parts = [PERSONAS[s.persona] ?? PERSONAS.standard, lang === 'en' ? 'Answer in English.' : 'Svar på norsk bokmål.', `I dag er ${osloDate()}.`];
  if (s.system) parts.push(s.system);
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
async function openaiStream(name, url, headers, body, { onDelta, signal, idleMs }) {
  const g = idleGuard(idleMs, signal);
  let tokens = null, usedWeb = false;
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
        if (d) await onDelta(d);
        if (j.usage) tokens = { count: j.usage.completion_tokens ?? j.usage.eval_count ?? null, perSec: j.usage['response_token/s'] ?? null };
        if (j.x_groq?.usage) tokens = { count: j.x_groq.usage.completion_tokens, perSec: j.x_groq.usage.completion_tokens / (j.x_groq.usage.completion_time || 1) };
      }
    } catch (e) { if (e.engine) throw e; throw engineError(name, e, g); }
    return { tokens, usedWeb };
  } finally { g.done(); }
}
async function ollamaStream(model, sys, msgs, s, { onDelta, signal }) {
  const g = idleGuard(aiTimeoutsOf().ollama * 1000, signal);
  let tokens = null;
  const tf = thinkFilter(); // <think>…</think> i selve teksten (eldre maler) vises aldri; message.thinking sendes ikke videre
  try {
    let res;
    try {
      res = await ollamaPost(F, `${ollamaBase()}/api/chat`, chatBody({
        model, stream: true, keep_alive: OLLAMA_KEEP_ALIVE, options: { temperature: s.temperature, top_p: s.topP, num_ctx: s.numCtx },
        messages: [{ role: 'system', content: sys }, ...msgs.map((m) => ({ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}) }))] }, s.think), { signal: g.signal });
    } catch (e) { throw engineError('Ollama', e, g); }
    if (!res.ok) throw await httpError('Ollama', res);
    try {
      for await (const line of lines(res, g)) {
        if (!line.trim()) continue;
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (j.error) throw Object.assign(new Error(`Ollama: ${String(j.error).slice(0, 200)}`), { engine: true });
        if (j.message?.content) { const d = tf.push(j.message.content); if (d) await onDelta(d); }
        if (j.done && j.eval_count) tokens = { count: j.eval_count, perSec: j.eval_duration ? j.eval_count / (j.eval_duration / 1e9) : null };
      }
      const rest = tf.end();
      if (rest) await onDelta(rest);
    } catch (e) { if (e.engine) throw e; throw engineError('Ollama', e, g); }
    return { tokens };
  } finally { g.done(); }
}
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
  const { sys, msgs, s, webSearch, files, onDelta, signal, gotText } = ctx;
  if (isMock()) return { ...(await mockStream(msgs.at(-1)?.content, ctx.data, { onDelta, signal, facts: ctx.facts })), engine: 'mock' };
  const o = owui();
  if (o && (m.via === 'openwebui' || !/^(gemini|groq):/.test(m.id))) {
    try {
      const body = { model: m.id, stream: true, messages: openaiMessages(sys, msgs), temperature: s.temperature, top_p: s.topP, params: { num_ctx: s.numCtx, temperature: s.temperature, top_p: s.topP },
        ...(webSearch ? { features: { web_search: true } } : {}), ...(files.length ? { files } : {}), stream_options: { include_usage: true } };
      const idle = aiTimeoutsOf()[m.provider === 'gemini' ? 'gemini' : m.provider === 'groq' ? 'groq' : 'ollama'] * 1000;
      return { ...(await openaiStream('Open WebUI', `${o.url}/api/chat/completions`, owuiHeaders(o), body, { onDelta, signal, idleMs: idle })), engine: 'openwebui', usedWeb: webSearch };
    } catch (e) {
      // Open WebUI nede (og ingenting er strømmet ennå): prøv motoren direkte.
      if (!e.net || e.timeout || gotText() || signal.aborted) throw e;
      console.warn('[chat] Open WebUI svarte ikke, bruker motoren direkte:', e.message);
    }
  }
  if (m.provider === 'gemini') return { ...(await geminiStream(m.id.replace(/^gemini:/, ''), sys, msgs, s, { onDelta, signal, webSearch })), engine: 'gemini' };
  if (m.provider === 'groq') {
    const key = secret('groqKey');
    if (!key) throw new Error('Groq-nøkkel mangler (Innstillinger → AI)');
    let model = m.id.replace(/^groq:/, '');
    if (msgs.some((x) => x.images?.length) && !/llama-4|scout/.test(model)) model = GROQ_VISION_DEFAULT;
    return { ...(await openaiStream('Groq', 'https://api.groq.com/openai/v1/chat/completions', { Authorization: `Bearer ${key}` },
      { model: model || GROQ_DEFAULT, stream: true, messages: openaiMessages(sys, msgs), temperature: s.temperature, top_p: s.topP }, { onDelta, signal, idleMs: aiTimeoutsOf().groq * 1000 })), engine: 'groq', usedWeb: false };
  }
  return { ...(await ollamaStream(m.id, sys, msgs, s, { onDelta, signal })), engine: 'ollama' };
}

/* ---------------- Meldinger inn ---------------- */

const B64 = /^[A-Za-z0-9+/=\s]+$/;
function cleanMessages(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const m of list.slice(-200)) {
    if (!m || !['user', 'assistant', 'system'].includes(m.role)) continue;
    const images = Array.isArray(m.images) ? m.images.slice(0, 4).map(stripData).filter((b) => b.length < 12_000_000 && B64.test(b.slice(0, 200))) : [];
    out.push({ role: m.role, content: String(m.content ?? '').slice(0, 100_000), ...(images.length ? { images } : {}) });
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
  const origin = (() => { try { const u = new URL(c.req.url); const host = c.req.header('x-forwarded-host') ?? u.host; return `${c.req.header('x-forwarded-proto') ?? u.protocol.replace(':', '')}://${host}`; } catch { return ''; } })();
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
  const id = randomUUID(), name = String(f.name || 'vedlegg').replace(/[\\/\0]/g, '_').slice(0, 120), buf = Buffer.from(await f.arrayBuffer());
  const mime = f.type || 'application/octet-stream';
  const dir = join(FILES, String(u).replace(/[^\w-]/g, '_'));
  await mkdir(dir, { recursive: true });
  const path = join(dir, id);
  await writeFile(path, buf);
  const text = TEXTY.test(mime) || /\.(md|txt|csv|json|ya?ml|log|ini|conf|sh|js|py)$/i.test(name) ? buf.toString('utf8').slice(0, 60_000) : null;
  let owuiId = null;
  const o = owui();
  if (o && !isMock()) {
    try {
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type: mime }), name);
      const r = await F(`${o.url}/api/v1/files/`, { method: 'POST', headers: owuiHeaders(o), body: fd, signal: AbortSignal.timeout(60_000) });
      if (r.ok) owuiId = (await r.json()).id ?? null;
    } catch { /* lokalt vedlegg holder */ }
  }
  q('INSERT INTO hl_chat_files(id,user_id,name,size,mime,path,text,owui_id,created) VALUES(?,?,?,?,?,?,?,?,?)').run(id, u, name, buf.length, mime, path, text, owuiId, Date.now());
  return c.json({ id, name, size: buf.length, mime, readable: !!text || !!owuiId });
});
api.delete('/files/:id', async (c) => {
  const r = q('SELECT * FROM hl_chat_files WHERE id=? AND user_id=?').get(c.req.param('id'), c.get('user'));
  if (r) { q('DELETE FROM hl_chat_files WHERE id=?').run(r.id); await unlink(r.path).catch(() => {}); }
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
  const files = (Array.isArray(b.files) ? b.files : []).slice(0, 10).map((id) => String(id)).map((id) => (id.startsWith('kb:') ? { kb: id.slice(3), name: 'Kunnskapsbase' } : q('SELECT * FROM hl_chat_files WHERE id=? AND user_id=?').get(id, u))).filter(Boolean);
  const imgCount = incoming.reduce((n, x) => n + (x.images?.length ?? 0), 0);
  // Prompt 41: «✦ Auto» – Glimt velger modell for denne meldingen (samtalen står fortsatt på Auto).
  let auto = null;
  if (wantModel === AUTO_ID) {
    auto = pickAuto41(await listModels(), { text: incoming.at(-1)?.content ?? '', images: imgCount, files, wantData, user: u });
    if (!auto) return bad(c, 'Ingen modell er tilgjengelig. Installer en Ollama-modell eller legg inn en Gemini-/Groq-nøkkel.');
  }
  const modelId = auto ? auto.model : wantModel;
  const m = await modelFor(modelId);

  // Historikk: lagret samtale (kuttet ved editFrom) + nye meldinger. Sender klienten hele historikken, brukes den.
  let base = chat ? parse(chat.messages, []) : [];
  if (Number.isInteger(b.editFrom) && b.editFrom >= 0) base = base.slice(0, b.editFrom);
  let history;
  if (!base.length) history = incoming;
  else if (incoming.length > base.length && base.every((x, i) => sameMsg(x, incoming[i]))) history = [...base, ...incoming.slice(base.length)];
  else if (incoming.length <= 2 && incoming.at(-1).role === 'user') history = [...base, incoming.at(-1)];
  else history = incoming;
  if (history.at(-1)?.role !== 'user') return bad(c, 'Siste melding må være fra deg');

  // Spør før sky: modellen er SKY og mine data eller vedlegg er med.
  if (m.kind === 'sky' && (wantData || files.length || imgCount) && !b.confirmCloud && userBool(u, 'chat_ask_cloud') && !s.skipCloudAsk) {
    const leaves = [...(wantData ? Object.values(LEAVES) : []), ...files.map((f) => `Vedlegg: ${f.name}`), ...(imgCount ? [`${imgCount === 1 ? 'Bilde' : `${imgCount} bilder`} fra samtalen`] : [])];
    return c.json({ needsConfirm: true, model: m.name, modelId: m.id, provider: m.provider, leaves, error: `Sende til ${m.name}?` }, 409);
  }
  if (b.confirmCloud && b.settings?.skipCloudAsk) s.skipCloudAsk = true;

  const data = wantData ? await myData(u) : null;
  const fileTexts = files.filter((f) => f.text).map((f) => ({ name: f.name, text: f.text.slice(0, 20_000) }));
  const owuiFiles = files.map((f) => (f.kb ? { type: 'collection', id: f.kb } : f.owui_id ? { type: 'file', id: f.owui_id } : null)).filter(Boolean);
  const sys = systemPrompt(u, s, { data, fileTexts: owui() ? files.filter((f) => f.text && !f.owui_id).map((f) => ({ name: f.name, text: f.text.slice(0, 20_000) })) : fileTexts });
  const used = [...(data ? Object.entries(data).filter(([, v]) => !/^[^:]*: (ingen|ingenting|ikke tilgjengelig)\b/.test(v)).map(([k]) => USED[k]) : []), ...files.map((f) => f.name)];

  const now = Date.now();
  if (!chat) {
    const id = randomUUID();
    const first = history.find((x) => x.role === 'user')?.content ?? 'Ny samtale';
    const title = first.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Ny samtale';
    q('INSERT INTO hl_chats(id,user_id,title,model,settings,messages,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(id, u, title, auto ? AUTO_ID : m.id, JSON.stringify(s), JSON.stringify(history.map((x) => ({ ...x, ts: now }))), now, now);
    chat = chatRow(u, id);
  }
  kv.set(u, 'chat_last_model', auto ? AUTO_ID : m.id);
  if (m.kind === 'sky') audit(m.provider === 'openwebui' ? 'openwebui' : m.provider, 'chat', { modell: m.name, meldinger: history.length, mineData: data ? Object.keys(data) : [], vedlegg: files.map((f) => f.name), bilder: imgCount, nettsok: !!b.webSearch }, u);
  const chatId = chat.id;
  const saveMsgs = (answer, meta) => {
    const stored = history.map((x) => ({ ...x, ts: x.ts ?? now }));
    if (answer) stored.push({ role: 'assistant', content: answer, ts: Date.now(), meta });
    q('UPDATE hl_chats SET messages=?, model=?, settings=?, updated=? WHERE id=? AND user_id=?').run(JSON.stringify(stored), auto ? AUTO_ID : m.id, JSON.stringify(s), Date.now(), chatId, u);
  };
  saveMsgs(null);

  return streamSSE(c, async (sse) => {
    const ctrl = new AbortController();
    sse.onAbort(() => ctrl.abort());
    let text = '', first = null;
    const t0 = Date.now();
    const onDelta = async (d) => { if (!d) return; first ??= Date.now(); text += d; if (!sse.aborted) await sse.writeSSE({ event: 'delta', data: JSON.stringify({ text: d }) }); };
    const autoMeta = auto ? { auto: { model: auto.model, modelName: auto.modelName, kind: auto.kind, label: auto.label, reason: auto.reason, candidates: auto.candidates } } : {};
    await sse.writeSSE({ event: 'meta', data: JSON.stringify({ chatId, model: m.id, modelName: m.name, kind: m.kind, title: chat.title, ...autoMeta }) });
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
    const metaFacts = facts.length ? { facts } : {};
    try {
      let r, used41 = m;
      try { r = await runEngine(m, { sys: sysAll, msgs: history, s, webSearch: !!b.webSearch, files: owuiFiles, onDelta, signal: ctrl.signal, data, facts, gotText: () => !!text }); }
      catch (e) {
        // Prompt 41: Auto – svarer ikke valgt modell (og ingenting er strømmet), prøv neste beste og si det i svaret.
        const next = auto && !text && !ctrl.signal.aborted ? auto.candidates.find((id) => id !== m.id) : null;
        if (!next) throw e;
        used41 = await modelFor(next);
        auto.fallbackFrom = m.id; auto.model = used41.id; auto.modelName = used41.name; auto.label = `${auto.label.split(' · ')[0]} · ${used41.name}`; auto.reason = `${m.name} svarte ikke · bruker ${used41.name}`;
        r = await runEngine(used41, { sys: sysAll, msgs: history, s, webSearch: !!b.webSearch, files: owuiFiles, onDelta, signal: ctrl.signal, data, facts, gotText: () => !!text });
      }
      const ms = Date.now() - t0;
      const genS = Math.max(0.001, (Date.now() - (first ?? t0)) / 1000);
      const tokensPerSec = Math.round((r.tokens?.perSec ?? (r.tokens?.count ?? Math.ceil(text.length / 4)) / genS) * 10) / 10;
      const allUsed = [...factUsed, ...used, ...(b.webSearch && (r.usedWeb || r.engine === 'openwebui') ? ['Nettsøk'] : [])];
      const autoDone = auto ? { auto: { model: used41.id, modelName: used41.name, kind: auto.kind, label: `${auto.label} · ${String(tokensPerSec).replace('.', ',')} tok/s · ${String(Math.round(ms / 100) / 10).replace('.', ',')} s`, reason: auto.reason, ...(auto.fallbackFrom ? { fallbackFrom: auto.fallbackFrom } : {}) } } : {};
      if (auto) recordAuto41(u, { model: used41.id, kind: auto.kind, ttftMs: first ? first - t0 : null, tps: tokensPerSec, chatId });
      saveMsgs(text, { model: used41.id, tokensPerSec, ms, used: allUsed, ...metaFacts, ...autoDone });
      await sse.writeSSE({ event: 'done', data: JSON.stringify({ chatId, tokensPerSec, ms, used: allUsed, engine: r.engine, ...metaFacts, ...autoDone }) });
    } catch (e) {
      if (ctrl.signal.aborted || e.cancelled) { if (text) saveMsgs(text, { model: m.id, stopped: true, used: [...factUsed, ...used], ...metaFacts }); return; }
      if (text) saveMsgs(text, { model: m.id, error: e.message, used: [...factUsed, ...used], ...metaFacts });
      await sse.writeSSE({ event: 'error', data: JSON.stringify({ error: e.message, chatId }) });
    }
  });
});

export default api;
