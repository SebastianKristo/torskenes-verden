// Prompt 47 (GLIMT47) Steg F – svarformulering for fritekst (chat.answer og web.search). Eget modellkall med konteksten fra Steg A,
// brukerens spørsmål og verktøyresultatene (bare dem). Verktøysvar med tall og datoer (kalender, finans, vær, abonnementer) lages
// fortsatt av kodemalene i engine.js – der regner og sorterer koden, og modellen skal ikke formulere om tallene.
// Parametre: params47.answer (num_ctx 8192, num_predict 600, temperatur 0,3, think av). Ruten er «glimt» (hovedmodellen).
// Grounding: systemprompten er på engelsk med instruks om å svare på norsk; med nettsøk står regelen fra oppdraget først, og
// koden sjekker at egennavn i svaret finnes i treffene (ellers brukes treffet direkte). Ingen spøk ved feil.
import { STEP47, fitParts47 } from './params47.js';
import { contextBlock47 } from './context.js';

const SYSTEM_ANSWER47 = `You are Glimt, a personal assistant in a Norwegian app. Answer in Norwegian (bokmål), short and direct (1–3 sentences). Answer what was asked first.
Rules:
- Use ONLY the tool results and the context below for facts about the user and about the world right now. The current date and time are in the context.
- If the answer is not in the data, say so and say what you searched for. Do not guess.
- Write dates naturally ("tirsdag 3. november kl. 14:00"), never ISO.
- Mark the single most important fact with **bold**.
- No jokes when something failed or nothing was found.`;
const WEB_RULE47 = 'The search results below are newer than your training data. When they conflict with what you believe, the search results are correct. Base your answer on them and name the source briefly.';
export const answerSystem47 = (hasWeb) => (hasWeb ? `${WEB_RULE47}\n\n${SYSTEM_ANSWER47}` : SYSTEM_ANSWER47);

const hitsText = (hits) => hits.map((h, i) => `[${i + 1}] ${h.title} – ${h.source || 'ukjent kilde'}${h.published ? ` – ${h.published}` : ''} – ${h.snippet}`).join('\n');
// Egennavn i svaret (to+ ord med stor forbokstav, ikke første ord i en setning alene): «Eleanor Whitcombe».
const NAMES = /(?<![\p{L}])(\p{Lu}[\p{Ll}'-]+(?:\s+\p{Lu}[\p{Ll}'-]+)+)/gu;
const IGNORE = /^(Glimt|Storbritannia|Norge|Frankrike|Statsminister|Det|Den|Ifølge|I|NRK|BBC)$/;
/** Står egennavnene i svaret i søketreffene? → {ok, missing:[navn]} */
export function groundedIn47(answer, hits) {
  const hay = hits.map((h) => `${h.title} ${h.snippet} ${h.source}`).join('\n').toLowerCase();
  const names = [...String(answer ?? '').replace(/\*\*/g, '').matchAll(NAMES)].map((m) => m[1]).filter((n) => !n.split(/\s+/).every((w) => IGNORE.test(w)));
  const missing = names.filter((n) => !hay.includes(n.toLowerCase()));
  return { ok: !missing.length, missing };
}

/**
 * Svaret. → {text, model, grounded?, error?}. call(o) = modellkallet ({system, prompt, step:'answer', user}) → {text, model, tokens, params}.
 * web = {query, hits} fra web.search (eller null). ctx = buildContext47-resultatet. trace = trace47-objektet.
 */
export async function answer47(user, text, { ctx, web = null, call, trace = null } = {}) {
  const hits = web?.hits ?? [];
  const system = answerSystem47(hits.length > 0);
  const sp = STEP47.answer;
  const fit = fitParts47({ fixed: `${system}\n${text}\n${ctx.nowLine}`, parts: [{ key: 'history', text: ctx.historyText, fromStart: true }, { key: 'web', text: hits.length ? hitsText(hits) : '' }, { key: 'facts', text: ctx.factsText, minChars: 200 }], numCtx: sp.numCtx, numPredict: sp.numPredict });
  const sys = `${system}\n\n# Context\n${contextBlock47(ctx, fit.parts)}${hits.length ? `\n\n# Search results for «${web.query}» (fetched now)\n${fit.parts.web}` : web ? `\n\n# Search\nThe web search for «${web.query}» gave no results.` : ''}`;
  const t0 = Date.now();
  let out;
  try { out = await call({ user, system: sys, prompt: text, step: 'answer' }); }
  catch (e) {
    if (e?.cancelled || e?.kind === 'cancelled') throw e; // prompt 59: Stopp
    trace?.model({ step: 'answer', ms: Date.now() - t0, ok: false, error: e?.message ?? e, trimmed: fit.trimmed, promptEst: fit.est });
    // Modellen nede: med søketreff svarer vi med treffet direkte (kilden er med), ellers en ærlig feilmelding.
    if (hits.length) return { text: `Ifølge ${hits[0].source || 'søket'}: ${hits[0].title}. ${String(hits[0].snippet ?? '').slice(0, 220)}`, model: null, grounded: true, fallback: true };
    return { text: `Glimt fikk ikke svar fra den lokale modellen akkurat nå (${String(e?.message ?? e).slice(0, 120)}). Prøv igjen om litt.`, model: null, error: String(e?.message ?? e).slice(0, 200) };
  }
  trace?.model({ step: 'answer', model: out?.model ?? null, params: out?.params ?? { ...sp, promptEst: fit.est }, tokens: out?.tokens, ms: Date.now() - t0, trimmed: fit.trimmed, timing: out?.timing ?? null });
  let t = String(out?.text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (hits.length) {
    const g = groundedIn47(t, hits);
    if (!g.ok) {
      // Navn som ikke står i treffene = trolig treningskunnskap. Bruk treffet i stedet for å gjette.
      trace?.norm({ grounding: 'feilet', missing: g.missing });
      t = `Ifølge ${hits[0].source || 'søket'}: ${hits[0].title}. ${String(hits[0].snippet ?? '').slice(0, 220)}`;
      return { text: t, model: out?.model ?? null, grounded: false, replaced: true };
    }
  }
  return { text: t || 'Jeg fant ikke noe svar på det.', model: out?.model ?? null, grounded: hits.length ? true : null };
}
