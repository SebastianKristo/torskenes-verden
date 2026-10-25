// Prompt 59 (prompt 49 del 4, D4SRV): «Varm modell». Hovedmodellen (ruten «glimt», f.eks. qwen3:8b) holdes lastet:
//   - ved oppstart (index.js, ikke i test) og etter at en bildejobb (visjonsmodellen) er ferdig, ett lite oppvarmingskall via den
//     felles AI-klienten (ai-run → ai-gate) med BAKGRUNNSPRIORITET: interaktive kall går alltid foran.
//   - Oppvarmingen er planleggerens faste prefiks (systemprompt med verktøy og eksempler) + «hei», num_predict 1. Da er både modellen
//     lastet og KV-/prefiks-cachen fylt med den statiske delen, så neste planleggerkall bare regner ut den dynamiske halen.
//   - Med OLLAMA_MAX_LOADED_MODELS=1 krangler vi ikke med visjonsmodellen: oppvarmingen venter til ingen bildejobb er i gang eller i kø
//     (gateBusyWith59), og den startes aldri midt i en bildejobb.
//   - keep_alive: hovedmodellen får minst 1 t (setKeepAliveHook59 i gaten), med mindre administratoren eksplisitt har valgt 0 eller «alltid».
// Av/på: innstillingen «warm» (fast59/settings.js, admin). Av → ingen oppvarming og ingen keep_alive-gulv.
import { OWNER } from '../db.js';
import { fastOn59 } from './settings.js';
import { onGateJobDone59, gateBusyWith59, setKeepAliveHook59, loadedModels } from '../ai-gate.js';

export const WARM_KEEP59 = '1h';
const KEEP_MS = { s: 1000, m: 60_000, h: 3_600_000 };
const kaMs = (v) => { if (v === -1 || v === '-1') return Infinity; const m = String(v ?? '').match(/^(\d+)(s|m|h)$/); return m ? +m[1] * KEEP_MS[m[2]] : v === 0 || v === '0' ? 0 : null; };
const state = { model: null, engine: 'ollama', lastAt: null, lastMs: null, reason: null, ok: null, error: null, keepAlive: WARM_KEEP59, running: false, timer: null, mainAt: 0 };
export const warmState59 = () => (state.lastAt ? { model: state.model, engine: state.engine, lastAt: new Date(state.lastAt).toISOString(), lastMs: state.lastMs, reason: state.reason, ok: state.ok, error: state.error, keepAlive: state.keepAlive } : null);
const enabled = () => process.env.NODE_ENV !== 'test' || process.env.FAST59_WARM === '1';
const on = () => { try { return fastOn59(OWNER, 'warm'); } catch { return false; } };

/** Hovedmodellen (første kandidat i glimt-ruten). → {id, engine} | null. Husket i 60 s. */
async function mainModel() {
  if (state.model && Date.now() - state.mainAt < 60_000) return { id: state.model, engine: state.engine };
  try {
    const ai = await import('../ai-run.js');
    const r = await ai.resolveTask('glimt', { user: OWNER, localOnly: true });
    const c = r.list[0];
    if (!c || c.provider !== 'ollama') return null;
    state.model = c.id; state.engine = c.engine ?? 'ollama'; state.mainAt = Date.now();
    return { id: c.id, engine: state.engine };
  } catch { return null; }
}

// keep_alive-gulv for hovedmodellen (synkront: gaten spør per kall).
setKeepAliveHook59((model, cur) => {
  if (!state.model || !on() || !enabled()) return cur;
  const same = model === state.model || model === `${state.model}:latest` || `${model}:latest` === state.model;
  if (!same) return cur;
  const c = kaMs(cur);
  if (c === 0 || c === Infinity) return cur; // eksplisitt «last ut» eller «alltid»: administratorens valg
  return c != null && c >= kaMs(WARM_KEEP59) ? cur : WARM_KEEP59;
});

/** Ett oppvarmingskall nå (bakgrunn). → {ok, ms, model, already?, skipped?} */
export async function warmNow59(reason = 'manuelt', { force = false } = {}) {
  if (!force && (!on() || !enabled())) return { ok: false, skipped: 'av' };
  if (state.running) return { ok: false, skipped: 'pågår' };
  const m = await mainModel();
  if (!m) return { ok: false, skipped: 'ingen lokal hovedmodell' };
  if (gateBusyWith59({ image: true })) return { ok: false, skipped: 'bildejobb pågår' };
  if (gateBusyWith59({ model: m.id })) return { ok: true, already: true, model: m.id, skipped: 'modellen er i bruk' };
  if (m.engine === 'ollama') {
    try { const { settings } = await import('../finans/db.js'); const base = String(settings(OWNER).ollamaUrl || '').replace(/\/+$/, ''); const ps = await loadedModels({ base });
      if (ps?.some((x) => (x.name ?? x.model) === m.id || (x.name ?? x.model) === `${m.id}:latest`)) { Object.assign(state, { lastAt: Date.now(), lastMs: 0, reason, ok: true, error: null }); return { ok: true, already: true, model: m.id }; } } catch { /* sjekken er valgfri */ }
  }
  state.running = true;
  const t0 = Date.now();
  try {
    const ai = await import('../ai-run.js');
    const { plannerSystem47 } = await import('../glimt45/plan47.js');
    // Samme statiske prefiks som planleggeren sender (systemprompten starter alltid med plannerSystem47()).
    await ai.run('glimt', { user: OWNER, system: `${plannerSystem47()}\n\n# Context\n`, prompt: 'Melding: hei', step: 'planner', numPredict: 1, localOnly: true, background: true,
      title: 'Glimt · varm modell', noRetry: true, retries: 0, timeoutMs: 60_000, deadlineAfterLoad: true });
    Object.assign(state, { lastAt: Date.now(), lastMs: Date.now() - t0, reason, ok: true, error: null });
    console.info(`[fast59] varmet opp ${m.id} (${reason}) på ${Date.now() - t0} ms`);
    return { ok: true, ms: Date.now() - t0, model: m.id };
  } catch (e) {
    // «tomt svar» etter 1 token er ikke en feil – modellen er lastet.
    const empty = /tomt svar/.test(String(e?.message ?? ''));
    Object.assign(state, { lastAt: Date.now(), lastMs: Date.now() - t0, reason, ok: empty, error: empty ? null : String(e?.message ?? e).slice(0, 200) });
    if (!empty) console.warn(`[fast59] oppvarming (${reason}) feilet: ${String(e?.message ?? e).slice(0, 160)}`);
    return { ok: empty, ms: Date.now() - t0, model: m.id, ...(empty ? {} : { error: state.error }) };
  } finally { state.running = false; }
}

/** Etter en bildejobb: vent til ingen bildejobb er i gang eller i kø, så varm opp (maks ett forsøk per 20 s). */
function scheduleAfterVision(delayMs = 2500, tries = 0) {
  if (state.timer) return;
  state.timer = setTimeout(async () => {
    state.timer = null;
    if (gateBusyWith59({ image: true })) { if (tries < 40) scheduleAfterVision(3000, tries + 1); return; }
    await warmNow59('etter bildejobb').catch(() => {});
  }, delayMs);
  state.timer.unref?.();
}
let unsub = null;
function hook() {
  if (unsub) return;
  unsub = onGateJobDone59((j) => {
    if (!enabled() || !on()) return;
    if (!j.image || j.kind === 'load' || j.kind === 'embed') return;
    if (state.model && (j.model === state.model)) return; // hovedmodellen leste selv bildet (f.eks. gemma) – ingenting å varme
    scheduleAfterVision();
  });
}
hook();

/** index.js (ikke i test): oppvarming ved oppstart (etter 15 s, når boot-sjekkene er ferdige). */
export function startWarm59({ delayMs = 15_000 } = {}) {
  mainModel().catch(() => {}); // keep_alive-gulvet vet hvilken modell som er hovedmodellen
  const t = setTimeout(() => { warmNow59('oppstart').catch(() => {}); }, delayMs);
  t.unref?.();
}
/** Bare for tester. */
export const _warm59 = { state, scheduleAfterVision, reset: () => { if (state.timer) clearTimeout(state.timer); Object.assign(state, { model: null, mainAt: 0, lastAt: null, running: false, timer: null }); } };
