// Felles Ollama-valg for korte oppgaver (Glimt/assist, rask time, logo, kvitteringer og skjermbilder, oppsummeringer,
// kategorisering, kalender og domener). Tenkemodeller (qwen3, gemma4 …) bruker ellers hundrevis av tokens på «tenking»
// før et svar på tre setninger, så vi sender think:false og et lite kontekstvindu (num_ctx 4096) som får plass på et 8 GB-kort.
//
// Reserve: modeller uten tenkestøtte kan svare 400 «… does not support thinking» når think er med. Da prøver vi én gang til
// uten think, og husker modellen (i minnet, til omstart), så neste kall går rett uten think.
//
// Prompt 43: tenkemodeller (qwen3, deepseek-r1, gemma4, qwq m.fl., og modeller Ollama melder «thinking» for i capabilities)
// får ALLTID think:false på korte kall. 400-minnet gjelder bare modeller som ikke er tenkemodeller: før kunne et 400-svar
// som lignet få qwen3 husket som «uten think», og da tenkte den igjen på hvert kall (og brukte opp num_predict).
//
// Personlig innstilling ai_think (av som standard): når den er på, sendes think ikke for korte oppgaver (modellen bestemmer).
// Chat har sin egen samtaleinnstilling (settings.think) og bruker chatThink().
import { activeUser, userBool } from './settings.js';

export const SHORT_NUM_CTX = 4096;
const noThink = new Set(); // modellnavn som har svart «does not support thinking» (aldri tenkemodeller)
const caps = new Map(); // modell → capabilities fra /api/show (når en modul har slått dem opp)

/** Tenkemodeller etter navn. Bildemodellene qwen3-vl/qwen2.5vl regnes ikke med. */
export const THINKING_RE = /(^|\/)(qwen3(?![-.]?vl)|lfm3|qwq|deepseek-r1|deepseek-v3\.1|gemma4|magistral|phi4-reasoning|gpt-oss|cogito|exaone-deep|openthinker|smallthinker|saluki)|-thinking\b|:thinking\b/i;
/** Husker capabilities fra /api/show (f.eks. ['completion','vision','thinking']). */
export function noteCapabilities(model, list) { if (model && Array.isArray(list)) caps.set(model, list.map(String)); }
/** Er modellen en tenkemodell? Navnet, eller «thinking» i capabilities når de er kjent. */
export function isThinkingModel(model) {
  const c = caps.get(model) ?? caps.get(`${model}:latest`) ?? caps.get(String(model).replace(/:latest$/, ''));
  if (c?.includes('thinking')) return true;
  return THINKING_RE.test(String(model ?? ''));
}
/** 400-minnet: bare for modeller som ikke er tenkemodeller. */
export function rememberNoThink(model) { if (model && !isThinkingModel(model)) noThink.add(model); }
export const hasNoThink = (model) => !isThinkingModel(model) && noThink.has(model);

/** Ser 400-teksten ut som «modellen støtter ikke tenking»? */
export const THINK_UNSUPPORTED = /does not support think|doesn'?t support think|not support(?:s|ed)? think|think(?:ing)? (?:is )?not supported|unknown field "?think|invalid .*think/i;

/** Brukerens valg ai_think (av som standard). user undefined → innlogget bruker / eier i bakgrunnsjobber. */
export function userWantsThink(user) {
  try { return userBool(user === undefined ? activeUser() : user, 'ai_think'); } catch { return false; }
}

/** Modeller som er husket som uten tenkestøtte (for tester og feilsøking). */
export const modelsWithoutThink = () => [...noThink];
export const _resetThinkMemory = () => noThink.clear();

/**
 * Body for en kort Ollama-oppgave (/api/chat eller /api/generate): think:false (med mindre brukeren har slått på ai_think,
 * eller modellen ikke støtter think) og options.num_ctx = 4096 hvis den ikke er satt.
 */
export function shortBody(body, { user, think } = {}) {
  const wants = think ?? userWantsThink(user);
  const out = { ...body, options: { num_ctx: SHORT_NUM_CTX, ...(body.options ?? {}) } };
  delete out.think;
  if (!wants && (isThinkingModel(body.model) || !noThink.has(body.model))) out.think = false;
  return out;
}

/** Body for Chat: think:true bare når samtaleinnstillingen er på, ellers think:false (raskt). */
export function chatBody(body, on) {
  const out = { ...body };
  delete out.think;
  if (isThinkingModel(body.model) || !noThink.has(body.model)) out.think = !!on;
  return out;
}

/**
 * POST til Ollama med reserve: svarer Ollama 400 «does not support thinking» på en body med think, huskes modellen og
 * kallet prøves én gang til uten think. Andre svar returneres som de er (400-teksten er fortsatt lesbar).
 * fetchFn er modulens egen fetch (så tester kan bytte den ut); init får method/headers/signal/timeout.
 */
export async function ollamaPost(fetchFn, url, body, init = {}) {
  const send = (b) => fetchFn(url, { method: 'POST', ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }, body: JSON.stringify(b) });
  const res = await send(body);
  if (res.status !== 400 || !('think' in body)) return res;
  const text = await res.text().catch(() => '');
  if (!THINK_UNSUPPORTED.test(text)) return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  rememberNoThink(body.model); // tenkemodeller huskes ikke: neste kall sender think:false igjen
  console.warn(`[ollama] ${body.model} støtter ikke think, prøver uten${isThinkingModel(body.model) ? ' (bare dette kallet)' : ''}`);
  const { think: _drop, ...rest } = body;
  return send(rest);
}

/** Fjerner tenketekst: <think>…</think>-blokker, alt før en løs </think>, og løse tagger. */
export function stripThink(text) {
  let t = String(text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  const close = t.search(/<\/think(?:ing)?>/i);
  if (close >= 0) t = t.slice(close).replace(/^<\/think(?:ing)?>/i, '');
  if (/<think(?:ing)?>/i.test(t)) t = t.replace(/<think(?:ing)?>[\s\S]*$/i, ''); // uavsluttet (avkuttet) tenking
  return t.trim();
}

/** Svarteksten fra et Ollama-svar (/api/chat eller /api/generate) uten tenking. message.thinking / thinking ignoreres. */
export const ollamaContent = (j) => stripThink(j?.message?.content ?? j?.response ?? '');

/**
 * Strømfilter for Chat: tar biter og gir tilbake bare det som ikke er inne i <think>…</think>.
 * Holder igjen en mulig halv tagg til neste bit.
 */
export function thinkFilter() {
  let inside = false, buf = '';
  const OPEN = /<think(?:ing)?>/i, CLOSE = /<\/think(?:ing)?>/i;
  const partial = (s) => { const i = s.lastIndexOf('<'); return i >= 0 && s.length - i < 12 && !s.slice(i).includes('>') && /^<\/?t?h?i?n?k?i?n?g?$/i.test(s.slice(i)) ? i : -1; };
  const step = (flush = false) => {
    let out = '';
    for (;;) {
      const re = inside ? CLOSE : OPEN, m = buf.match(re);
      if (m) { if (!inside) out += buf.slice(0, m.index); buf = buf.slice(m.index + m[0].length); inside = !inside; continue; }
      const p = flush ? -1 : partial(buf);
      const take = p >= 0 ? buf.slice(0, p) : buf;
      if (!inside) out += take;
      buf = p >= 0 ? buf.slice(p) : '';
      return out;
    }
  };
  return { push: (chunk) => { buf += String(chunk ?? ''); return step(); }, end: () => step(true) };
}
