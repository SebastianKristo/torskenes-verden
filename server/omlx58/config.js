// Prompt 58 (OMLX58): oppsettet for oMLX på Mac mini-en (MLX-motor bak AI-gaten), bare admin.
// Lagret i kv(OWNER, 'omlx58'): {url, key (kryptert), fallbackOllama, engines:{oppgave:'omlx'|'ollama'}, models:{text, vision, <oppgave>?}}.
// Miljøvariabler er reserve (brukes også av eval): OMLX_URL, OMLX_API_KEY, OMLX_MODEL_TEXT, OMLX_MODEL_VISION, OMLX_FALLBACK=0,
// OMLX_TASKS=glimt,sok,… (eller all).
// Nøkkelen sendes aldri til klienten og logges aldri. Adressen må peke til en maskin i huset (LAN eller localhost), aldri ut.
// Ollama er fortsatt standard for alle oppgaver (engines tom = Ollama); oMLX velges per oppgave i AI-kontroll når eval har avgjort.
import { kv, OWNER } from '../db.js';
import { seal, unseal } from '../finans/db.js';
import { inHouseUrl53 } from '../fermion53/config.js';

const KEY = 'omlx58';
export const DEFAULT_TEXT58 = 'mlx-community/Qwen3-8B-4bit';
export const DEFAULT_VISION58 = 'mlx-community/Qwen2.5-VL-7B-Instruct-4bit';
/**
 * Oppgavene som går gjennom ai-run.run() og kan bytte motor. kb (embeddings) og chat (egen modellvelger) står alltid på Ollama, og
 * kat/bar går via finans/ai.js (gaten direkte med en Ollama-modell), så de følger ikke motorvalget ennå.
 */
export const ENGINE_TASKS58 = ['glimt', 'sok', 'brief', 'fsok', 'dom', 'rc'];
export const VISION_TASKS58 = ['rc'];
export const ENGINES58 = ['ollama', 'omlx'];

const raw = () => { try { return kv.get(OWNER, KEY, {}) ?? {}; } catch { return {}; } };
const cleanModel = (v) => { const s = String(v ?? '').trim(); return s.length <= 160 && /^[\w.:/@+-]*$/.test(s) ? s : null; };

/** Bare adresser i huset (samme regel som Fermion/NB-Whisper). → {ok, url, error} */
export function inHouseUrl58(u) {
  const v = inHouseUrl53(u);
  if (!v.ok && /i huset/.test(v.error ?? '')) return { ok: false, error: 'Adressen må være i huset (LAN eller localhost). oMLX skal aldri nås via internett eller Cloudflare.' };
  return v;
}

function envTasks() {
  const s = String(process.env.OMLX_TASKS ?? '').trim().toLowerCase();
  if (!s) return {};
  const list = s === 'all' ? ENGINE_TASKS58 : s.split(',').map((x) => x.trim()).filter((x) => ENGINE_TASKS58.includes(x));
  return Object.fromEntries(list.map((t) => [t, 'omlx']));
}

/** Det effektive oppsettet (lagret > miljø). Nøkkelen i klartekst – bare til bruk i serveren. */
export function omlxConf58() {
  const r = raw();
  const urlRaw = r.url !== undefined && r.url !== null ? r.url : process.env.OMLX_URL ?? '';
  const u = inHouseUrl58(urlRaw);
  const key = String((r.key !== undefined && r.key !== null ? unseal(r.key) : process.env.OMLX_API_KEY) ?? '').trim();
  const fallbackOllama = typeof r.fallbackOllama === 'boolean' ? r.fallbackOllama : process.env.OMLX_FALLBACK !== '0';
  const models = { text: cleanModel(r.models?.text) || cleanModel(process.env.OMLX_MODEL_TEXT) || DEFAULT_TEXT58, vision: cleanModel(r.models?.vision) || cleanModel(process.env.OMLX_MODEL_VISION) || DEFAULT_VISION58 };
  for (const t of ENGINE_TASKS58) { const m = cleanModel(r.models?.[t]); if (m) models[t] = m; }
  const engines = { ...envTasks(), ...Object.fromEntries(Object.entries(r.engines ?? {}).filter(([t, e]) => ENGINE_TASKS58.includes(t) && ENGINES58.includes(e))) };
  // Slått av (enabled:false): adresse, nøkkel og valg beholdes, men oMLX brukes ikke og sjekkes ikke (alt går til Ollama).
  const enabled = r.enabled !== false, savedUrl = u.ok ? u.url : '';
  return { url: enabled ? savedUrl : '', savedUrl, enabled, urlError: u.ok ? null : u.error, key, fallbackOllama, models, engines, label: 'oMLX' };
}
/** {url, key, label} når adressen er satt (nøkkelen kan mangle når oMLX bare lytter på localhost), ellers null. */
export const omlxReady58 = () => { const c = omlxConf58(); return c.url ? c : null; };

/** Motoren for en oppgave: 'omlx' bare når den er valgt OG oMLX er satt opp. */
export function engineFor58(task) {
  const c = omlxConf58();
  return c.url && c.engines[task] === 'omlx' ? 'omlx' : 'ollama';
}
/** MLX-modell-ID for oppgaven (egen rute per motor): oppgavens eget valg → visjon/tekst. */
export function omlxModelFor58(task, { images = false } = {}) {
  const c = omlxConf58();
  if (c.models[task]) return c.models[task];
  return VISION_TASKS58.includes(task) || images ? c.models.vision : c.models.text;
}

/** Til admin-klienten: aldri nøkkelen, bare om den er satt. */
export function confOut58() {
  const c = omlxConf58();
  return { url: c.savedUrl || null, enabled: c.enabled, keySet: !!c.key, fallbackOllama: c.fallbackOllama, models: c.models, engines: Object.fromEntries(ENGINE_TASKS58.map((t) => [t, c.engines[t] === 'omlx' ? 'omlx' : 'ollama'])),
    tasks: ENGINE_TASKS58, defaults: { text: DEFAULT_TEXT58, vision: DEFAULT_VISION58 }, standard: 'ollama', urlError: c.urlError };
}

/** Lagrer et delvis oppsett. url/key: tom streng fjerner, null/undefined = behold. → {ok, error?} */
export function saveConf58(patch = {}) {
  const cur = { ...raw() };
  if (patch.url !== undefined && patch.url !== null) {
    const v = inHouseUrl58(patch.url);
    if (!v.ok) return { ok: false, error: v.error };
    cur.url = v.url;
  }
  if (patch.key !== undefined && patch.key !== null) {
    const v = String(patch.key).trim();
    if (v && (v.length < 16 || v.length > 256 || /\s/.test(v))) return { ok: false, error: 'Nøkkelen må være 16–256 tegn uten mellomrom (den tools/omlx/install.sh skrev ut)' };
    cur.key = v ? seal(v) : '';
  }
  if (patch.enabled !== undefined && patch.enabled !== null) {
    if (typeof patch.enabled !== 'boolean') return { ok: false, error: 'enabled må være true eller false' };
    cur.enabled = patch.enabled;
  }
  if (patch.fallbackOllama !== undefined && patch.fallbackOllama !== null) {
    if (typeof patch.fallbackOllama !== 'boolean') return { ok: false, error: 'fallbackOllama må være true eller false' };
    cur.fallbackOllama = patch.fallbackOllama;
  }
  if (patch.models && typeof patch.models === 'object') {
    const m = { ...(cur.models ?? {}) };
    for (const [k, v] of Object.entries(patch.models)) {
      if (k !== 'text' && k !== 'vision' && !ENGINE_TASKS58.includes(k)) return { ok: false, error: `Ukjent modellfelt ${k}` };
      const id = cleanModel(v);
      if (id === null) return { ok: false, error: `Ugyldig modell-ID for ${k}` };
      if (id) m[k] = id; else delete m[k];
    }
    cur.models = m;
  }
  if (patch.engines && typeof patch.engines === 'object') {
    const e = { ...(cur.engines ?? {}) };
    for (const [t, v] of Object.entries(patch.engines)) {
      if (!ENGINE_TASKS58.includes(t)) return { ok: false, error: `Oppgaven ${t} kan ikke bytte motor (embeddings og Chat går alltid til Ollama)` };
      if (!ENGINES58.includes(v)) return { ok: false, error: `Motoren må være ${ENGINES58.join(' eller ')}` };
      e[t] = v;
    }
    cur.engines = e;
  }
  kv.set(OWNER, KEY, cur);
  return { ok: true };
}
