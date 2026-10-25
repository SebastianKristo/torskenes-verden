// Prompt 59 (prompt 49 del 4, D4SRV): statuslinja mens Glimt jobber («Sjekker kalenderen …», «Henter været for Oslo …») og
// små hjelpere for strømmingen (tekstbiter fra modellen, ord for ord fra kodemalene). Se $S/SERVER59-API.md §1.
import { thinkFilter } from '../ollama-opts.js';

const TOOL_TEXT = {
  'calendar.search': 'Sjekker kalenderen …', 'calendar.next': 'Sjekker kalenderen …', 'calendar.list': 'Sjekker kalenderen …',
  'calendar.create': 'Legger inn i kalenderen …', 'calendar.update': 'Flytter avtalen …', 'calendar.delete': 'Sletter avtalen …',
  'tasks.create': 'Legger inn gjøremålet …', 'tasks.list': 'Sjekker gjøremålene …', 'tasks.complete': 'Krysser av …',
  'finance.search': 'Ser i Finans …', 'finance.summary': 'Regner på forbruket …', 'finance.subscriptions': 'Ser på abonnementene …', 'finance.fixed': 'Ser på de faste utgiftene …',
  'subscriptions.trial': 'Ser på prøveperioden …', 'weather.get': 'Henter været …', 'web.search': 'Søker på nettet …', 'memory.save': 'Husker det …',
  'media.episode': 'Spør Sonarr …', 'nav.open': 'Åpner siden …', 'chat.answer': 'Tenker på svaret …', 'app.answer': 'Finner svaret …',
};
const LEGACY_TEXT = { weather: 'Henter været …', departures: 'Sjekker avgangene …', packages: 'Sporer pakken …', 'sun.daylight': 'Regner ut dagslyset …', 'family.where': 'Ser hvor familien er …',
  'calendar.day': 'Sjekker kalenderen …', 'calendar.next': 'Sjekker kalenderen …', 'finance.spent': 'Ser i Finans …', tasks: 'Sjekker gjøremålene …', 'memory.add': 'Husker det …', nav: 'Åpner siden …' };
/** Status for ett verktøykall. → {stage:'tool', tool, text} */
export function toolStatus59(call) {
  const a = call?.args ?? {};
  let text = TOOL_TEXT[call?.tool] ?? 'Jobber …';
  if (call?.tool === 'weather.get' && a.place) text = `Henter været for ${String(a.place).slice(0, 40)} …`;
  return { stage: 'tool', tool: call?.tool ?? null, text };
}
export const legacyStatus59 = (legacyIntent) => ({ stage: 'legacy', text: LEGACY_TEXT[legacyIntent] ?? 'Finner svaret …' });
export const PLAN_STATUS59 = { stage: 'plan', text: 'Forstår spørsmålet …' };
export const ANSWER_STATUS59 = { stage: 'answer', text: 'Skriver svaret …' };
export const CACHE_STATUS59 = { stage: 'cache', text: 'Fant et ferskt svar …' };

/** Tekstbit fra en strømbit (Ollama NDJSON, OpenAI/oMLX/Open WebUI SSE). Tenking (message.thinking, reasoning) er aldri med. */
export function deltaOf59(j) {
  if (!j || typeof j !== 'object') return '';
  if (j.message && typeof j.message.content === 'string') return j.message.content;
  if (typeof j.response === 'string') return j.response;
  const ch = j.choices?.[0];
  if (ch) return String(ch.delta?.content ?? ch.message?.content ?? '');
  return typeof j.delta === 'string' ? j.delta : '';
}
/** onChunk-adapter for gaten: kaller onText(bit) med ren tekst (uten <think>…</think>). → {onChunk, end} */
export function tokenSink59(onText) {
  const f = thinkFilter();
  return {
    onChunk: (j) => { const s = f.push(deltaOf59(j)); if (s) { try { onText(s); } catch { /* lytteren er borte */ } } },
    end: () => { const s = f.end(); if (s) { try { onText(s); } catch { /* */ } } },
  };
}
/** Ferdig tekst ord for ord (kodemalene): ['Lagt ', 'inn: ', '**Dune** ', …]. Mellomrommene følger med. */
export const wordsOf59 = (text) => String(text ?? '').match(/\S+\s*|\s+/g) ?? [];
