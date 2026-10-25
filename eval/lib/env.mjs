// Prompt 55: miljøet i eval – standardrutingen og feil som skyldes miljøet (ikke modellen).

/** --routing standard: alle tekstruter qwen3:8b (llama3.2:3b er tatt ut: modellbytter med OLLAMA_MAX_LOADED_MODELS=1). */
export const STANDARD_ROUTING = Object.freeze({ glimt: 'qwen3:8b', chat: 'qwen3:8b', brief: 'qwen3:8b', fsok: 'qwen3:8b', dom: 'qwen3:8b', sok: 'qwen3:8b', kat: 'qwen3:8b', rc: 'qwen2.5vl:7b', bar: 'qwen2.5vl:7b', kb: 'nomic-embed-text' });

/**
 * En feilet kjøring er «env» når miljøet mangler noe OG kjøringen faktisk traff det: ingen OCR (Mac-OCR og Tesseract mangler) og
 * sporet/loggen nevner OCR, eller en modell i rutingen som ikke er installert og som sporet nevner. → grunn | null
 * r = resultatet fra worker.mjs ({ok, riggError, env:{macOcr, tesseract, notes}, trace:{steps}, reason}), logs = prosessens utskrift.
 */
export function envFailure55(r, logs = '', missing = []) {
  if (!r || r.ok || r.riggError) return null;
  const hay = `${JSON.stringify(r.trace?.steps ?? [])}\n${logs}\n${r.reason ?? ''}`;
  const why = [];
  const e = r.env ?? {};
  if (e.macOcr === false && e.tesseract === false && /\bOCR\b|Tesseract|Mac-OCR/i.test(hay)) why.push(`ingen OCR (${(e.notes ?? []).join(' · ') || 'Mac-OCR og Tesseract mangler'})`);
  const miss = (missing ?? []).filter((m) => hay.includes(m));
  if (miss.length && /finnes ikke på Ollama-serveren|not found|ikke installert/i.test(hay)) why.push(`modell ikke installert: ${miss.join(', ')}`);
  return why.length ? why.join('; ') : null;
}
