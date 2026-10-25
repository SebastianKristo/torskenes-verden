// Prompt 47 (GLIMT47): én sentral config for modellparametre per steg. ai-run.js slår opp her når et kall har `step`
// (eller når oppgaven har et standardsteg, f.eks. brief), og num_ctx sendes ALLTID eksplisitt – vi stoler aldri på
// Ollamas standard. Verdiene følger tabellen i oppdraget («Gjør Glimt faktisk forståelsesfull»):
//
//   steg           temperature  think                                  num_ctx  num_predict
//   planner        0            av                                     8192     512
//   plannerRetry   0.1          PÅ (andre forsøk, med token-/tidsgrense) 8192   2560
//   answer         0.3          av                                     8192     600
//   document       0            av                                     16384    4096
//   brief          0.4          av                                     16384    1500
//   short          (kallerens)  av                                     8192     (kallerens)   ← alle andre korte kall
//
// Prompt-lengden måles før kallet (estTokens47: tegn / 3,5, som passer norsk + JSON). Er prompt + num_predict nær num_ctx,
// trimmes historikk og verktøyresultater (fitParts47) – aldri systemprompten.
export const STEP47 = {
  planner: { numCtx: 8192, numPredict: 512, temperature: 0, think: false, timeoutMs: 45_000 },
  // Prompt 55: tankene teller med i num_predict – 1536 kunne brukes opp av tenkingen før JSON-en kom («tomt svar»). 2560, tak 90 s.
  plannerRetry: { numCtx: 8192, numPredict: 2560, temperature: 0.1, think: true, timeoutMs: 90_000 },
  answer: { numCtx: 8192, numPredict: 600, temperature: 0.3, think: false, timeoutMs: 60_000 },
  document: { numCtx: 16384, numPredict: 4096, temperature: 0, think: false, timeoutMs: 240_000 },
  brief: { numCtx: 16384, numPredict: 1500, temperature: 0.4, think: false },
  short: { numCtx: 8192 },
};
/** Standardsteg per AI-oppgave (når kalleren ikke sier noe selv). */
export const TASK_STEP47 = { brief: 'brief' };
export const stepOf47 = (step) => (step && STEP47[step] ? { name: step, ...STEP47[step] } : null);

/** Grovt token-anslag (norsk + JSON ≈ 3,5 tegn per token). Brukes før kallet; prompt_eval_count fra Ollama er fasit etterpå. */
export const estTokens47 = (s) => Math.ceil(String(s ?? '').length / 3.5);
/** Sikkerhetsmargin: maks andel av num_ctx prompten (+ num_predict) får bruke før vi trimmer. */
export const CTX_MARGIN47 = 0.9;

/**
 * Får prompten plass? fixed = det som aldri trimmes (systemprompt, brukerens melding, verktøyskjema), parts = [{key, text, minChars?}]
 * i rekkefølgen de skal trimmes (først i lista trimmes først: eldste historikk, deretter verktøyresultater).
 * → {parts:{key:text}, est, budget, trimmed:[key], fits}
 */
export function fitParts47({ fixed = '', parts = [], numCtx = 8192, numPredict = 512 } = {}) {
  const budget = Math.floor(numCtx * CTX_MARGIN47) - numPredict;
  const cur = parts.map((p) => ({ ...p, text: String(p.text ?? '') }));
  const total = () => estTokens47(fixed) + cur.reduce((s, p) => s + estTokens47(p.text), 0);
  const trimmed = [];
  for (const p of cur) {
    if (total() <= budget) break;
    const over = (total() - budget) * 3.5;
    const keep = Math.max(p.minChars ?? 0, p.text.length - Math.ceil(over) - 20);
    if (keep < p.text.length) {
      // Eldste først: kutt fra starten (historikk) eller slutten (resultater), og si at noe er utelatt.
      p.text = keep <= 0 ? '' : p.fromStart ? `…${p.text.slice(p.text.length - keep)}` : `${p.text.slice(0, keep)}…`;
      trimmed.push(p.key);
    }
  }
  const est = total();
  return { parts: Object.fromEntries(cur.map((p) => [p.key, p.text])), est, budget, trimmed, fits: est <= budget };
}
