// Prompt 58: eval mot oMLX (MLX på Mac mini-en) – standardruting for MLX-modell-ID-ene og felles tidsmål (p50/p90) for alle motorer.

/** Oppgavene som kjører på oMLX i eval (samme som kan bytte motor i AI-kontroll). kb, chat, kat og bar blir på Ollama. */
export const OMLX_TASKS58 = Object.freeze(['glimt', 'sok', 'brief', 'dom', 'fsok', 'rc']);
/** --backend omlx: tekst = Qwen3-8B 4-bit (samme modell som qwen3:8b i Ollama, MLX-kvantisert), bilde = Qwen2.5-VL-7B 4-bit. */
export const STANDARD_OMLX58 = Object.freeze({ glimt: 'mlx-community/Qwen3-8B-4bit', sok: 'mlx-community/Qwen3-8B-4bit', brief: 'mlx-community/Qwen3-8B-4bit', dom: 'mlx-community/Qwen3-8B-4bit',
  fsok: 'mlx-community/Qwen3-8B-4bit', rc: 'mlx-community/Qwen2.5-VL-7B-Instruct-4bit' });
export const ENGINE_LABEL58 = Object.freeze({ ollama: 'Ollama', omlx: 'oMLX', openwebui: 'Open WebUI (Ollama)', mock: 'mock' });

/** Persentil (nærmeste rang) av en sortert liste med ms. Tom liste → 0. */
export function pct58(sorted, q) {
  const a = (sorted ?? []).filter((x) => Number.isFinite(x));
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/** ID-en oMLX selv oppgir for modellen: eksakt, uten store/små bokstaver, eller samme mappenavn uten organisasjon. → id | null */
export function resolveMlx58(id, ids = []) {
  const want = String(id ?? '').trim(), base = (x) => String(x).split('/').pop().toLowerCase();
  return ids.find((x) => x === want) ?? ids.find((x) => x.toLowerCase() === want.toLowerCase()) ?? ids.find((x) => base(x) === base(want)) ?? null;
}
