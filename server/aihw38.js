// Prompt 38 (SERVER38): AI-maskinen (Ollama-verten) – Mac mini M4 · 16 GB samlet minne · 2 TB ekstern disk – i stedet for
// det hardkodede «RTX 2080». Brukes av /api/ai/status, /api/ai/models, /api/ai/library og ai-run.js (tidsavbrudd).
//
// server.hw = {model:'Mac mini M4', chip:'Apple M4', memGb:16, gpuBudgetGb:10.7, unified:true,
//              disk:{name, totalGb, freeGb|null, usedGb, external:true, mounted:true}, source:'host'|'env'|'standard', warnings:[…]}
//   Kilde: AI_HOST_INFO_URL (JSON fra et lite skript på Ollama-verten: system_profiler / sysctl hw.memsize / df) når den svarer,
//   ellers miljøet AI_HOST_MODEL, AI_HOST_CHIP, AI_HOST_MEM_GB, AI_HOST_DISK_GB, AI_HOST_DISK_NAME, AI_HOST_DISK_FREE_GB,
//   AI_HOST_DISK_EXTERNAL, AI_HOST_GPU_BUDGET_GB, ellers standard Mac mini M4 16 GB / 2 TB.
//   gpuBudgetGb: Apple Silicon gir GPU-en ca. ⅔ av samlet minne (16 GB → 10,7 GB).
// fit (av gpuBudget): PASSER ≤ 75 % (8 GB), TRANGT ≤ budsjett − 0,2 (10,5 GB, bare én om gangen), FOR STOR over.
import { cached } from './cache.js';

const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : +v);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const bool = (v, d) => (v === undefined || v === '' ? d : !/^(0|false|nei|no|off)$/i.test(String(v)));
export const DEFAULT_HW = { model: 'Mac mini M4', chip: 'Apple M4', memGb: 16, disk: { name: 'Ekstern HDD', totalGb: 2000, external: true } };

let F = (u, i) => fetch(u, i);
export const _setHwFetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); };

/** Maskinen fra miljøet (eller standard). Synkront, uten nettkall. */
export function envHw(env = process.env) {
  const has = ['AI_HOST_MODEL', 'AI_HOST_CHIP', 'AI_HOST_MEM_GB', 'AI_HOST_DISK_GB', 'AI_HOST_DISK_NAME', 'AI_HOST_GPU_BUDGET_GB'].some((k) => env[k]);
  const memGb = num(env.AI_HOST_MEM_GB) ?? DEFAULT_HW.memGb;
  return normHw({
    model: env.AI_HOST_MODEL || DEFAULT_HW.model, chip: env.AI_HOST_CHIP || (env.AI_HOST_MODEL && !/M4/.test(env.AI_HOST_MODEL) ? null : DEFAULT_HW.chip), memGb,
    gpuBudgetGb: num(env.AI_HOST_GPU_BUDGET_GB),
    disk: { name: env.AI_HOST_DISK_NAME || DEFAULT_HW.disk.name, totalGb: num(env.AI_HOST_DISK_GB) ?? DEFAULT_HW.disk.totalGb, freeGb: num(env.AI_HOST_DISK_FREE_GB),
      external: bool(env.AI_HOST_DISK_EXTERNAL, true), mounted: env.AI_HOST_DISK_MOUNTED === undefined ? null : bool(env.AI_HOST_DISK_MOUNTED, true) },
  }, has ? 'env' : 'standard');
}
/** Rensker svaret fra vertsskriptet (eller miljøet). memBytes/totalBytes godtas også. */
export function normHw(h, source) {
  const memGb = num(h?.memGb) ?? (num(h?.memBytes) ? num(h.memBytes) / 2 ** 30 : null) ?? DEFAULT_HW.memGb;
  const d = h?.disk ?? {};
  const totalGb = num(d.totalGb) ?? (num(d.totalBytes) ? num(d.totalBytes) / 1e9 : null) ?? DEFAULT_HW.disk.totalGb;
  const freeGb = num(d.freeGb) ?? (num(d.freeBytes) ? num(d.freeBytes) / 1e9 : null);
  const apple = /apple|m\d/i.test(`${h?.chip ?? ''} ${h?.model ?? ''}`);
  return {
    model: String(h?.model ?? DEFAULT_HW.model).slice(0, 60), chip: h?.chip ? String(h.chip).slice(0, 40) : null, memGb: r1(memGb), unified: apple,
    gpuBudgetGb: r1(num(h?.gpuBudgetGb) ?? (apple ? memGb * 2 / 3 : memGb)),
    disk: { name: String(d.name ?? DEFAULT_HW.disk.name).slice(0, 60), totalGb: Math.round(totalGb), freeGb: freeGb == null ? null : r1(freeGb), external: d.external !== false, mounted: d.mounted ?? null },
    source,
  };
}
/** Maskinen: vertsskriptet (AI_HOST_INFO_URL, cache 5 min) når det svarer, ellers miljøet. */
export async function hostHw({ force = false } = {}) {
  const url = process.env.AI_HOST_INFO_URL;
  if (url && /^https?:\/\//.test(url)) {
    try {
      const j = await cached(`aihw38:${url}${force ? `:${Date.now()}` : ''}`, 5 * 60_000, async () => {
        const r = await F(url, { signal: AbortSignal.timeout(2500), headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      if (j && typeof j === 'object') return normHw(j, 'host');
    } catch { /* faller tilbake til miljøet */ }
  }
  return envHw();
}
export const gpuBudget = () => envHw().gpuBudgetGb;
/** PASSER ≤ 75 % av budsjettet (8 GB av 10,7), TRANGT ≤ budsjett − 0,2 (10,5 GB), ellers FOR STOR. */
export const fit38 = (sizeGb, budget = gpuBudget()) => (sizeGb == null || !Number.isFinite(+sizeGb) ? null : +sizeGb <= Math.round(budget * 0.75 * 10) / 10 ? 'PASSER' : +sizeGb <= budget - 0.2 ? 'TRANGT' : 'FOR STOR');
export const FIT_LABEL = { PASSER: 'Passer i minnet', TRANGT: 'Trangt · bare én om gangen', 'FOR STOR': 'For stor · bruk sky' };

/** Fullt maskinkort for /api/ai/status (med bruk fra Ollama). */
export function hwOut(hw, { modelsGb = 0, vramUsedGb = 0, ollamaOk = true, modelCount = null, mock = false } = {}) {
  const mounted = hw.disk.mounted ?? (ollamaOk && !mock && modelCount === 0 && hw.disk.external ? false : true);
  const warnings = [];
  if (hw.disk.external && !mounted) warnings.push('Ekstern disk mangler · Ollama finner ikke modellene');
  if (vramUsedGb > 9.5 * (hw.gpuBudgetGb / 10.7)) warnings.push(`Minnet til modeller er nesten fullt (${String(vramUsedGb).replace('.', ',')} av ${String(hw.gpuBudgetGb).replace('.', ',')} GB)`);
  const memLabel = `${hw.memGb} GB samlet minne`, diskLabel = `${hw.disk.totalGb >= 1000 ? `${String(Math.round(hw.disk.totalGb / 100) / 10).replace('.', ',')} TB` : `${hw.disk.totalGb} GB`}${hw.disk.external ? ' ekstern disk' : ' disk'}`;
  return { ...hw, label: `${hw.model} · ${memLabel} · ${diskLabel}`,
    gpu: { usedGb: vramUsedGb, budgetGb: hw.gpuBudgetGb, warnAtGb: r1(9.5 * (hw.gpuBudgetGb / 10.7)), label: `${String(vramUsedGb).replace('.', ',')} / ${String(hw.gpuBudgetGb).replace('.', ',')} GB` },
    disk: { ...hw.disk, usedGb: r1(modelsGb), mounted, label: `${String(r1(modelsGb)).replace('.', ',')} / ${hw.disk.totalGb.toLocaleString('nb-NO').replace(/\s/g, ' ')} GB` },
    warnings };
}

/** Anbefalte innstillinger for maskinen. routing = ai.routing(OWNER). */
export function recommendFor(hw, routing = null) {
  const p = routing?.params ?? {};
  return [
    { key: 'maxLoaded', text: 'Én stor modell lastet om gangen', env: 'OLLAMA_MAX_LOADED_MODELS=1' },
    { key: 'numParallel', text: 'Ett kall om gangen per modell', env: 'OLLAMA_NUM_PARALLEL=1' },
    { key: 'kvCache', text: 'KV-cache i q8_0 sparer minne', env: 'OLLAMA_KV_CACHE_TYPE=q8_0' },
    { key: 'flashAttention', text: 'Flash attention sparer minne', env: 'OLLAMA_FLASH_ATTENTION=1' },
    { key: 'keepAlive', text: 'Hold modellene lastet i 30 min (lasting fra HDD tar 5–20 s)', env: 'OLLAMA_KEEP_ALIVE=30m', setting: { keepAlive: '30m' }, applied: p.keepAlive === '30m' || p.keepAlive === -1 },
    { key: 'parallel', text: 'Samtidige kvitteringer: 1 (maks 2 med 7B)', setting: { parallel: 1 }, applied: p.parallel === 1 },
    { key: 'numCtx', text: 'Kontekst 8k (32k gir mye mer KV-cache)', setting: { numCtx: 8192 }, applied: p.numCtx === 8192 },
    ...(hw.disk.external ? [
      { key: 'models', text: 'Lagre modellene på den eksterne disken', env: `OLLAMA_MODELS=/Volumes/${hw.disk.name && !/ekstern/i.test(hw.disk.name) ? hw.disk.name : '<disk>'}/ollama` },
      { key: 'ssd', text: 'Legg de 1–2 mest brukte modellene på intern SSD (~/.ollama/models) og resten eksternt (symlink)' },
    ] : []),
    { key: 'pmset', text: 'Mac-en skal ikke sove (ellers spinner HDD-en ned)', cmd: 'sudo pmset -a sleep 0 disksleep 0' },
    ...(hw.unified ? [{ key: 'wiredLimit', text: 'Avansert: gi GPU-en 12 GB i stedet for ⅔ av minnet', cmd: 'sudo sysctl iogpu.wired_limit_mb=12288', advanced: true,
      warning: 'Gir mindre minne til macOS og serveren. Kan gjøre maskinen ustabil, og gjelder til neste omstart.' }] : []),
  ];
}
/** Modellvalg som passer maskinen. */
export const SUGGESTED_MODELS = { rc: 'qwen2.5vl:7b', kat: 'llama3.2:3b', chat: 'gemma3:12b', fsok: 'gemma3:12b', glimt: 'qwen3:8b', kb: 'nomic-embed-text' };
export const TIMEOUTS = { coldS: 60, warmS: 30, loadingText: 'Laster modellen fra disk …' };
