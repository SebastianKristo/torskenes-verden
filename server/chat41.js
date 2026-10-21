// Prompt 41 (SERVER41): Chat «✦ Auto» – Glimt velger beste installerte/skymodell per melding (claude-code-chat-auto-modell.md).
// Raskt og uten ekstra AI-kall: regler på meldingen + vedlegg, så rangering (prompt 39-kandidatene i ai39.REC) blant installerte modeller.
//   1. Bilde/kvittering → Qwen 2.5 VL (lokalt), ellers Gemma 3 · 2. PDF/Word, sky tillatt og ingen egne data → Gemini 2.5 Flash
//   3. Kode, Docker, Proxmox, Home Assistant, feilmeldinger → Qwen 3 (eller DeepSeek R1) · 4. «regn ut, hvorfor, forklar, sammenlign, planlegg,
//   budsjett» eller lang melding → DeepSeek R1 · 5. veldig lang tekst, sky tillatt, ingen egne data → Gemini 2.5 Flash · 6. ellers Llama 3.1 8B.
//   Med «Mine data» holdes alt lokalt. Bare installerte modeller (Ollama) og sky-motorer med nøkkel.
// GET /api/chat/models får auto:{id:'auto', label:'✦ Auto', badge:'AUTO', desc, picks:{text, vision, long, code, reason}} og preferred:'auto'.
// POST /api/chat/send {model:'auto'} → meta-hendelsen og svaret får auto:{model, modelName, kind, label:'✦ Kode · Qwen3 8B', reason, candidates}.
// Lærer: chat_auto_stats (modell, oppgavetype, tid til første token, tok/s, «Prøv igjen»/byttet/👍/👎). Modeller med mange omforsøk (≥ 5 svar, > 30 %)
// flyttes ned i rangeringen for den oppgavetypen. GET /api/chat/auto → {picks, using:'Glimt bruker nå: Qwen3 8B til kode …', stats}.
import { db } from './db.js';
import { REC } from './ai39.js';

db.exec(`CREATE TABLE IF NOT EXISTS chat_auto_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, ts INTEGER NOT NULL, model TEXT NOT NULL, kind TEXT NOT NULL,
  ttft_ms INTEGER, tps REAL, retry INTEGER NOT NULL DEFAULT 0, switched INTEGER NOT NULL DEFAULT 0, vote INTEGER NOT NULL DEFAULT 0, chat_id TEXT);
CREATE INDEX IF NOT EXISTS chat_auto_stats_u ON chat_auto_stats(user_id, kind, ts);`);

export const AUTO_ID = 'auto';
export const KIND_LABEL = { text: 'Rask', vision: 'Bilde', long: 'Langt dokument', code: 'Kode', reason: 'Tenker', };
const CODE_RE = /\b(kode|code|docker|compose|proxmox|home ?assistant|yaml|json|regex|bash|python|javascript|typescript|node|sql|kubernetes|nginx|traceback|stack ?trace|exception|error|feilmelding|kompiler|function|funksjon|script|skript|api)\b|```|\bat [\w.]+\(/i;
const ERRCODE_RE = /\bE[A-Z]{3,}\b/; // ECONNREFUSED o.l. – med store bokstaver (ikke «England»)
const REASON_RE = /\b(regn ut|beregn|hvorfor|forklar|sammenlign|planlegg|plan for|budsjett|analyser|vurder|fordeler og ulemper|resonner|bevis)\b/i;
const IMAGE_RE = /\b(bilde|bildet|foto|kvittering|skjermbilde|screenshot)\b/i;
const DOC_RE = /\.(pdf|docx?|odt|pptx?|xlsx?)$/i;

const PREF = {
  vision: [/qwen2\.5-?vl/i, /gemma3/i, /gemma4/i, /llava/i, /minicpm-v/i, /llama-?4|scout/i],
  code: [/qwen3/i, /coder/i, /deepseek-r1/i, /qwen2\.5/i],
  reason: [/deepseek-r1/i, /qwen3/i, /phi4/i],
  text: [/llama3\.1:8b/i, /llama3\.1/i, /llama3/i, /qwen3/i, /gemma/i, /mistral/i],
  long: [/gemini-2\.5-flash/i, /gemini/i],
};
const recScore = (id) => { const c = REC.find((x) => x.id === id || x.id.replace(/:latest$/, '') === String(id).replace(/:latest$/, '')); return c ? c.norsk * 0.5 + (c.fart / 10) * 0.3 : 0; };

/** Oppgavetype for meldingen. */
export function kindOf41(text, { images = 0, files = [], wantData = false } = {}) {
  const t = String(text ?? '');
  if (images > 0 || (IMAGE_RE.test(t) && /\b(vedlagt|her er|se på|les)\b/i.test(t))) return 'vision';
  const docs = files.filter((f) => DOC_RE.test(String(f?.name ?? f ?? '')));
  if (docs.length && !wantData) return 'long';
  if (CODE_RE.test(t) || ERRCODE_RE.test(t)) return 'code';
  if (REASON_RE.test(t) || t.length > 1200) return t.length > 6000 && !wantData ? 'long' : 'reason';
  return 'text';
}
function demoted(user, kind) {
  try {
    return new Set(db.prepare('SELECT model, count(*) n, sum(retry + switched + (vote < 0)) bad FROM chat_auto_stats WHERE user_id=? AND kind=? AND ts > ? GROUP BY model').all(user, kind, Date.now() - 30 * 86400_000)
      .filter((r) => r.n >= 5 && r.bad / r.n > 0.3).map((r) => r.model));
  } catch { return new Set(); }
}
/** Kandidatene i rekkefølge for en oppgavetype. models = listModels() fra chat.js. */
export function rankFor41(kind, models, { cloudOk = true, user = null } = {}) {
  const inst = models.filter((m) => m.installed !== false);
  const local = inst.filter((m) => m.kind === 'lokal');
  const cloud = cloudOk ? inst.filter((m) => m.kind === 'sky') : [];
  const bad = user ? demoted(user, kind) : new Set();
  const order = (list, pats) => list.map((m) => ({ m, p: (() => { const i = pats.findIndex((re) => re.test(m.id)); return i < 0 ? 99 : i; })(), s: recScore(m.id) }))
    .sort((a, b) => (bad.has(a.m.id) - bad.has(b.m.id)) || a.p - b.p || b.s - a.s).map((x) => x.m);
  if (kind === 'vision') return [...order(local.filter((m) => m.vision), PREF.vision), ...order(cloud.filter((m) => m.vision), PREF.long)];
  if (kind === 'long') return [...order(cloud, PREF.long), ...order(local.filter((m) => !m.vision || /gemma/i.test(m.id)), PREF.text)];
  const pats = PREF[kind] ?? PREF.text;
  const text = local.filter((m) => !/vl\b|vl:|minicpm-v|llava/i.test(m.id));
  return [...order(text, pats), ...order(local.filter((m) => !text.includes(m)), pats), ...order(cloud, PREF.long)];
}
/** Velger modell for meldingen. → {model, modelName, kind, label, reason, candidates[]} | null */
export function pickAuto41(models, { text = '', images = 0, files = [], wantData = false, user = null } = {}) {
  let kind = kindOf41(text, { images, files, wantData });
  const cloudOk = !wantData;
  let cands = rankFor41(kind, models, { cloudOk, user });
  if (!cands.length && kind !== 'text') { kind = 'text'; cands = rankFor41('text', models, { cloudOk, user }); }
  const m = cands[0];
  if (!m) return null;
  const why = { vision: 'leser bilder', long: 'lange dokumenter', code: 'kode og feilmeldinger', reason: 'tenker før den svarer', text: wantData ? 'raskest, og dine data holdes lokalt' : 'raskest' }[kind];
  return { model: m.id, modelName: m.name, kind, label: `✦ ${KIND_LABEL[kind]} · ${m.name}`, reason: `${m.name}: ${why}`, local: m.kind === 'lokal', candidates: cands.slice(0, 4).map((x) => x.id) };
}
/** auto-feltet i GET /api/chat/models. */
export function autoEntry41(models, user = null) {
  const pick = (k) => rankFor41(k, models, { cloudOk: true, user })[0]?.id ?? null;
  return { id: AUTO_ID, label: '✦ Auto', name: '✦ Auto', badge: 'AUTO', kind: 'auto', provider: 'glimt', installed: true, vision: true,
    desc: 'Glimt velger beste modell for hver melding · lokalt når dine data er med', picks: { text: pick('text'), vision: pick('vision'), long: pick('long'), code: pick('code'), reason: pick('reason') } };
}
/** Lagrer målingen for et Auto-svar. */
export function recordAuto41(user, { model, kind, ttftMs = null, tps = null, chatId = null }) {
  try { db.prepare('INSERT INTO chat_auto_stats(user_id, ts, model, kind, ttft_ms, tps, chat_id) VALUES(?,?,?,?,?,?,?)').run(user, Date.now(), model, kind, ttftMs, tps, chatId); } catch { /* best effort */ }
}
/** «Prøv igjen» / byttet modell / 👍👎 på siste Auto-svar i samtalen. */
export function feedbackAuto41(user, chatId, { retry = false, switched = false, vote = 0 } = {}) {
  const r = db.prepare('SELECT id FROM chat_auto_stats WHERE user_id=? AND chat_id=? ORDER BY ts DESC LIMIT 1').get(user, chatId);
  if (!r) return false;
  db.prepare('UPDATE chat_auto_stats SET retry=retry+?, switched=switched+?, vote=? WHERE id=?').run(retry ? 1 : 0, switched ? 1 : 0, Math.sign(+vote || 0), r.id);
  return true;
}
/** Oversikt for Innstillinger → AI og tolkning → Chat. */
export function autoSummary41(user, models) {
  const picks = autoEntry41(models, user).picks;
  const name = (id) => models.find((m) => m.id === id)?.name ?? id;
  const rows = db.prepare('SELECT kind, model, count(*) n, avg(tps) tps, avg(ttft_ms) ttft, sum(retry) retries FROM chat_auto_stats WHERE user_id=? AND ts > ? GROUP BY kind, model').all(user, Date.now() - 30 * 86400_000);
  return { picks, using: picks.code ? `Glimt bruker nå: ${name(picks.code)} til kode${rows.some((r) => r.kind === 'code' && r.model === picks.code && r.n >= 5) ? ' (raskest og færrest omforsøk)' : ''}` : null,
    stats: rows.map((r) => ({ kind: r.kind, model: r.model, count: r.n, tokensPerSec: r.tps ? Math.round(r.tps * 10) / 10 : null, ttftMs: r.ttft ? Math.round(r.ttft) : null, retries: r.retries })) };
}
