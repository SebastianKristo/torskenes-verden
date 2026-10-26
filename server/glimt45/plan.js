// Prompt 45 (GLIMT45): forstå → plan. Modellen (lokal Ollama via ai-run/ai-gate) tolker språket og velger verktøy med
// strukturerte argumenter: Ollama tool calling når modellen støtter det, ellers format:<JSON-skjema>. Én modellkall per
// forespørsel (+ ett nytt forsøk ved ugyldig JSON). Uten modell (nede / MOCK_DATA) brukes den lokale planleggeren under –
// samme planform, samme validering, så resultatet er det samme uansett vei.
//
// Plan = {intent:'ask'|'search'|'create'|'update'|'delete'|'summarize'|'multi'|'chat'|'nav', module, calls:[{tool, args}], ask?, engine, model?}
import { kv, OWNER } from '../db.js';
import { TOOLS45, TOOL45, ollamaTools45, merchantOf45, itemOf45 } from './tools.js';
import { whenOf45, parsePeriod45, parseAmount45, todayOslo45 } from './dates.js';
import { CANCEL_RE46 } from './tools46.js'; // prompt 46: registrerer vær, abonnementer, faste utgifter og avslutningsfrist i TOOLS45
import { analyzeWeather46, isCompoundWeather46, WEATHER_WORDS46 } from './weather46.js';
import { serviceOf } from '../../public/js/trial-parse.js';
import { serviceInText46 } from './subs46.js';

const MOCK = () => process.env.MOCK_DATA === '1';
export const INTENTS45 = ['ask', 'search', 'create', 'update', 'delete', 'summarize', 'multi', 'chat', 'nav'];
export const MODULES45 = ['home', 'calendar', 'tasks', 'finance', 'ruter', 'chat', 'weather', 'family', 'media', 'study'];
const MODULE_OF_TOOL = (name) => TOOL45[name]?.module ?? 'home';
const INTENT_OF_TOOL = { 'calendar.create': 'create', 'tasks.create': 'create', 'calendar.update': 'update', 'tasks.complete': 'update', 'calendar.delete': 'delete',
  'calendar.list': 'summarize', 'tasks.list': 'summarize', 'finance.summary': 'summarize', 'calendar.search': 'search', 'finance.search': 'search', 'nav.open': 'nav', 'app.answer': 'ask', 'chat.answer': 'chat',
  'weather.get': 'ask', 'finance.subscriptions': 'summarize', 'finance.fixed': 'summarize', 'subscriptions.trial': 'update',
  'schedule.create': 'create', 'schedule.list': 'summarize', 'schedule.update': 'update', 'schedule.delete': 'delete' }; // prompt 62
// Prompt 62 (del 2): lokal plan for planlagte oppgaver (sched62/tools.js registrerer seg; modellen nede / hint til planleggeren).
let localHook62 = null;
export const registerLocalPlan62 = (fn) => { localHook62 = typeof fn === 'function' ? fn : null; };
export const intentOfCalls45 = (calls) => (calls.length > 1 ? 'multi' : INTENT_OF_TOOL[calls[0]?.tool] ?? 'chat');

/* ---------------- Modell ---------------- */

let modelImpl = null, modeImpl = null;
/** Bare for tester: falsk modell ({mode, system, prompt, tools, schema, user}) → {toolCalls?:[{name, arguments}], text?, data?, model?}. */
export const _setGlimtModel45 = (fn) => { modelImpl = fn ?? null; };
/** Prompt 47: testkroken for planleggeren og svarsteget (engine.js). */
export const _glimtModel45 = () => modelImpl;
/** Bare for tester: tving 'tools' eller 'json'. */
export const _setToolMode45 = (m) => { modeImpl = m ?? null; };
export const modelAvailable45 = () => !!modelImpl || !MOCK(); // MOCK_DATA: ai-run svarer med en fast mock, så den lokale planleggeren brukes

// Familier der Ollama har verktøystøtte (capabilities «tools»). gemma3 har det ikke (bare JSON-modus); llava/vl-modeller brukes ikke.
const TOOL_FAMILY = /^(qwen3|qwen2\.5(?!-?vl)|llama3\.[123]|mistral|mistral-nemo|mistral-small|granite3|hermes3|command-r|firefunction|smollm2|phi4-mini|gpt-oss)/i;
const NOTOOLS = 'glimt45_notools';
export function toolModeFor45(model, backend = 'ollama') {
  if (modeImpl) return modeImpl;
  // Prompt 47: planleggeren svarer med JSON etter et skjema (Ollama `format`) for alle modeller – samme oppførsel uansett
  // verktøystøtte og backend (Open WebUI sender heller ikke tool_calls tilbake). Tools-modus finnes bare som testkrok.
  void model; void backend; void TOOL_FAMILY; void NOTOOLS;
  return 'json';
}
const markNoTools = (model) => { try { kv.set(OWNER, NOTOOLS, { ...(kv.get(OWNER, NOTOOLS, {}) ?? {}), [model]: Date.now() }); } catch { /* */ } };

async function defaultModel(o) {
  const ai = await import('../ai-run.js');
  const out = await ai.run('glimt', { user: o.user, system: o.system, prompt: o.prompt, ...(o.mode === 'tools' ? { ollamaTools: o.tools } : { schema: o.schema }), temperature: 0, numPredict: 320,
    localOnly: true, background: false, title: 'Glimt · forstår', timeoutMs: 45_000, noRetry: true });
  return { toolCalls: out.toolCalls ?? null, text: out.text, data: out.data, model: out.model };
}
/** Hvilken modell og modus Glimt vil bruke nå (uten å kalle modellen). */
export async function modelInfo45(user) {
  if (modelImpl) return { model: 'test', mode: modeImpl ?? 'json' };
  // Prompt 47: planleggeren bruker JSON-skjema (Ollama format) som standard; tools-modus bare når en test tvinger den.
  if (!modelAvailable45()) return { model: null, mode: 'json' };
  try {
    const ai = await import('../ai-run.js');
    const { backendConfig } = await import('../ai-gate.js');
    const r = await ai.resolveTask('glimt', { user, localOnly: true });
    const c = r.list.find((x) => x.provider === 'ollama');
    return { model: c?.id ?? null, mode: toolModeFor45(c?.id, backendConfig().effective) };
  } catch { return { model: null, mode: 'json' }; }
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS45 },
    module: { type: 'string', enum: MODULES45 },
    calls: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string', enum: TOOLS45.map((t) => t.name) }, args: { type: 'object' } }, required: ['tool', 'args'] } },
    ask: { type: ['string', 'null'] },
  },
  required: ['intent', 'calls'],
};
const toolLines = () => TOOLS45.map((t) => `- ${t.name} {${Object.keys(t.parameters.properties).join(', ')}}: ${t.description}`).join('\n');
export function systemPrompt45({ module, nowLine, ctxLine = '', mode }) {
  return `${nowLine}. Aktiv modul: ${module}.${ctxLine ? ` ${ctxLine}` : ''}
Du er Glimts tolker i en norsk app. Oversett brukerens melding til verktøykall. Du svarer ikke brukeren selv.
${mode === 'tools' ? '' : `Verktøy:\n${toolLines()}\n`}Regler:
- title er kort og ryddig, aldri hele setningen. «Legg til time 12.10 12:15 Kino se på dune» → calendar.create {title:"Kino – Dune", date:"12.10", time:"12:15"}.
- Skriv date/time/period slik brukeren skrev dem («fredag», «klokka sju», «forrige måned»). Ikke regn om og ikke finn på dato, tid eller beløp som ikke står i meldingen.
- «minn meg på», «husk», «må huske» og ting å gjøre → tasks.create (title «Kjøpe melk», due «i morgen», note «etter skolen»).
- Avtaler, timer, kino, møter med dag/tid → calendar.create. «hva har jeg …», «hva skjer …» → calendar.list.
- «flytt/endre/utsett» → calendar.update (target = det brukeren kalte avtalen, tomt for «den»/«avtalen»). «slett/avlys» → calendar.delete.
- Kvitteringer, kjøp, butikk, beløp, varer → finance.search {merchant, item, amount, period, kind}. Forbruk og «mest penger» → finance.summary.
- Vær med sted eller tid → weather.get, ett kall per (sted, tid): «været i Oslo i dag og temperaturen i New York i morgen» → weather.get {place:"Oslo", when:"i dag"} + weather.get {place:"New York", when:"i morgen", info:"temp"}.
- Abonnementer («dyreste abonnement», «hvor mye betaler jeg for abonnementer», «hvilke har blitt dyrere») → finance.subscriptions. Faste utgifter/betalinger → finance.fixed. Ikke svar fra egen kunnskap – hent dataene.
- «Minn meg på å avslutte/si opp X <dato>» → tasks.create OG subscriptions.trial {service:"X", date:"<dato>"}. Ikke finn på pris eller når prøveperioden slutter.
- Buss/trikk/avganger, pakker, sol, hvor er en person, registrere en ny prøveperiode («Viaplay gratis i 14 dager»), «neste time hos …», ledig tid → app.answer. Vanlige spørsmål og prat → chat.answer.
- Flere ting i én melding → flere kall. Er noe viktig uklart eller mangler: ingen kall, og ask = ett konkret spørsmål.${mode === 'tools' ? '\nMangler noe: svar bare med ett kort spørsmål.' : '\nSvar KUN med JSON: {"intent":"…","module":"…","calls":[{"tool":"…","args":{…}}],"ask":null}'}`;
}
const parseArgs = (a) => { if (a && typeof a === 'object' && !Array.isArray(a)) return a; try { const x = JSON.parse(String(a ?? '{}')); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } };
/** Rydder modellens svar til en plan, eller null når det ikke kan brukes. */
export function cleanModelPlan45(out, module) {
  if (!out) return null;
  if (Array.isArray(out.toolCalls) && out.toolCalls.length) {
    const calls = out.toolCalls.map((c) => ({ tool: String(c.function?.name ?? c.name ?? ''), args: parseArgs(c.function?.arguments ?? c.arguments) })).filter((c) => TOOL45[c.tool]).slice(0, 6);
    if (!calls.length) return null;
    return { intent: intentOfCalls45(calls), module: MODULE_OF_TOOL(calls[0].tool), calls };
  }
  let d = out.data;
  if (d === undefined && typeof out.text === 'string') {
    const s = out.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    if (s.startsWith('{')) { try { d = JSON.parse(s); } catch { d = null; } }
    else if (s && s.length <= 200 && /\?\s*$/.test(s)) return { intent: 'ask', module, calls: [], ask: s };
    else if (s) return { intent: 'chat', module, calls: [{ tool: 'chat.answer', args: {} }] };
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const calls = (Array.isArray(d.calls) ? d.calls : []).map((c) => ({ tool: String(c?.tool ?? c?.name ?? ''), args: parseArgs(c?.args ?? c?.arguments) })).filter((c) => TOOL45[c.tool]).slice(0, 6);
  const askQ = typeof d.ask === 'string' && d.ask.trim() ? d.ask.trim().slice(0, 300) : null;
  if (!calls.length && !askQ) return null;
  return { intent: INTENTS45.includes(d.intent) ? d.intent : calls.length ? intentOfCalls45(calls) : 'ask', module: MODULES45.includes(d.module) ? d.module : calls[0] ? MODULE_OF_TOOL(calls[0].tool) : module, calls, ...(askQ && !calls.length ? { ask: askQ } : {}) };
}

/** Modellens plan (maks to kall: ett, og ett nytt forsøk med feilmeldingen). → plan | null (modellen nede/ubrukelig). */
export async function modelPlan45(user, text, { module = 'home', nowLine, ctxLine = '' } = {}) {
  if (!modelAvailable45()) return null;
  const info = await modelInfo45(user);
  let mode = info.mode;
  const call = modelImpl ?? defaultModel;
  const base = { user, mode, tools: ollamaTools45(), schema: PLAN_SCHEMA, system: systemPrompt45({ module, nowLine, ctxLine, mode }) };
  let out, lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? `Melding: ${text}` : `Melding: ${text}\nForrige svar kunne ikke brukes (${lastErr}). Svar KUN med gyldig JSON etter skjemaet.`;
    try { out = await call({ ...base, mode, prompt, system: systemPrompt45({ module, nowLine, ctxLine, mode }) }); }
    catch (e) {
      // Modellen støtter ikke verktøy (Ollama 400 «does not support tools») → husk det og prøv JSON-modus én gang.
      if (mode === 'tools' && /support(s)? tools|does not support tools|tools.*not supported/i.test(String(e?.message ?? ''))) { if (info.model) markNoTools(info.model); mode = 'json'; lastErr = 'verktøy ikke støttet'; continue; }
      if (/JSON/i.test(String(e?.message ?? '')) && attempt === 0) { lastErr = 'ugyldig JSON'; continue; }
      console.warn('[glimt45] modell:', String(e?.message ?? e).slice(0, 160));
      return null;
    }
    const plan = cleanModelPlan45(out, module);
    if (plan) return { ...plan, engine: mode === 'tools' ? 'ollama-tools' : 'ollama-json', model: out?.model ?? info.model ?? null };
    lastErr = 'mangler intent/calls';
  }
  return { intent: 'ask', module, calls: [], ask: 'Jeg skjønte ikke helt. Kan du si det på en annen måte?', engine: 'ollama-json', model: info.model, invalid: true };
}

/* ---------------- Lokal planlegger (uten modell) ---------------- */

const L = (s) => String(s ?? '').toLowerCase().trim();
const QUESTION = /\?\s*$|^(hva|hvor|hvem|hvilk\w*|hvordan|hvorfor|når|kan jeg|har jeg|er jeg|blir det|finnes det|vis|finn|oppsummer)(?![a-zæøå])/;
const DELETE_RE = /^(?:kan du\s+)?(slett|fjern|avlys|kanseller|stryk)(?![a-zæøå])/;
const UPDATE_RE = /^(?:kan du\s+)?(flytt|endre|utsett|forskyv|bytt\s+tid)(?![a-zæøå])/;
const COMPLETE_RE = /^(?:kryss av|merk .* som ferdig|ferdig med|jeg har (?:kjøpt|gjort|fikset|levert))(?![a-zæøå])/;
const TASK_RE = /^(?:(?:kan du\s+)?(?:minn meg|påminn meg|påminn|husk|ikke glem|jeg må huske|vi må huske|må huske|jeg må|vi må|ny oppgave|nytt gjøremål|gjøremål:|oppgave:))(?![a-zæøå])|(?:i|på|til)\s+(?:huskelist|handlelist|gjøremål)/;
const CREATE_RE = /^(?:(?:kan du\s+)?(?:legg(?:e)?\s+(?:til|inn)|sett\s+opp|book(?:e)?|lag|opprett|registrer|ny|nytt))(?![a-zæøå])|^(?:time|avtale)\s/;
const EVENT_NOUN = /(?<![a-zæøå])(kalender\w*|time|timen|avtale|møte|kino|konsert|teater|middag|lunsj|fest|bursdagsfeiring|trening|kamp|frisør|tannlege|lege|fysio|date|forelesning|eksamen|prøve|reise|fly|tog|hytte\w*|ferie|besøk)(?![a-zæøå])/;
const FIN_SEARCH = /kvittering|transaksjon|(?<![a-zæøå])(?:hva|når)\s+kjøpte\s+(?:jeg|vi)|(?:kjøpte|betalte|handlet)\s+(?:jeg|vi)|har\s+(?:jeg|vi)\s+kjøpt|kjøpet\s+(?:hos|fra|på)/;
const FIN_SUM = /(?:hva|hvor\s+mye)\s+(?:har\s+(?:jeg|vi)\s+)?(?:brukte|brukt|bruker|bruke|kostet)|mest\s+penger|forbruk(?:et)?|utgift(?:er|ene)?|hvor\s+mye\s+penger/;
const CAL_LIST = /kalender|avtaler|hva\s+skjer|hva\s+har\s+(?:jeg|vi)\s+(?:på|i|planlagt|i\s+morgen|i\s+dag|neste|denne|på\s+fredag)|hva\s+står\s+på|planer|program(?:met)?|er\s+jeg\s+opptatt|travel/;
const TASK_LIST = /gjøremål|huskelist|oppgaver|å\s+gjøre|forfalt|to-?do/;
const TASKS37 = /slå sammen|forfalt|forfalte|pakkeliste|matplan|ukas middag|middagene|(?:ved|på) (?:mat)?butikken|lagt til i|kjøpte vi sist|sist kjøpt|når kjøpte|del opp/;
const TASK_LIST_SIMPLE = /^(?:hva|hvilke)\s+(?:har jeg|står|er)\s+(?:på|i)\s+(?:lista|listen|gjøremål|huskelist)|^hva\s+har\s+jeg\s+(?:igjen\s+)?(?:å\s+gjøre)/;
const LEGACY_FIRST = /(?<![a-zæøå])(når\s+går|avgang|buss(?:en)?|trikk(?:en)?|t-?bane|tog(?:et)?\s+til|vær(?:et)?|regn|paraply|grader|temperatur|snø|vind|pakke(?:n|r|ne)?|sporing|soloppgang|solnedgang|dagslys|hvor\s+er|prøveperiode|gratis|abonnement|si\s+opp|neste\s+(?:time|frisør|tannlege|lege)|ledig\s+tid|når\s+er\s+neste|strømpris)(?![a-zæøå])/;

/**
 * Den lokale planleggeren. own = verktøyene kalleren selv vil utføre (resten → app.answer/chat).
 * → plan {intent, module, calls, ask?, engine:'lokal'}
 */
export function localPlan45(text, { module = 'home', today = todayOslo45(), legacyIntent = null, user = null, nowMin = null } = {}) {
  const t = L(text);
  const P = (tool, args = {}) => ({ intent: INTENT_OF_TOOL[tool], module: MODULE_OF_TOOL(tool), calls: [{ tool, args }], engine: 'lokal' });
  const askP = (q) => ({ intent: 'ask', module, calls: [], ask: q, engine: 'lokal' });
  const q = QUESTION.test(t);
  const w = whenOf45(text, today, { timeWithoutDate: 'none' });
  const hasWhen = !!(w.date || w.start || w.errors.length);
  if (!t) return askP('Hva kan jeg hjelpe med?');
  if (localHook62 && module !== 'tasks' && module !== 'calendar') { try { const s62 = localHook62(text, { today }); if (s62) return s62; } catch { /* prompt 62: best effort */ } }
  // Gjøremål-funksjonene fra prompt 37–42 (slå sammen, forfalte, pakkeliste, matplan, butikk, spørsmål om lista, limt inn flere linjer).
  if (module === 'tasks' && (TASKS37.test(t) || String(text).includes('\n') || (q && !/kalender/.test(t) && !TASK_LIST_SIMPLE.test(t)))) return P('app.answer', { topic: 'tasks37' });
  // Prompt 46: sammensatte værspørsmål (flere steder/tider, periode, sammenligning) → ett weather.get per delspørsmål.
  if (WEATHER_WORDS46.test(t) && !CREATE_RE.test(t) && !TASK_RE.test(t) && isCompoundWeather46(text, today, nowMin)) {
    const a = analyzeWeather46(text, today, nowMin);
    if (a.ask) return { ...askP(a.ask), module: 'weather' };
    const calls = a.requests.map((r) => ({ tool: 'weather.get', args: { _req: { place: r.place, when: r.when, info: r.info }, compare: a.compare?.mode ?? null } }));
    return { intent: calls.length > 1 ? 'multi' : 'ask', module: 'weather', calls, compare: a.compare?.mode ?? null, engine: 'lokal' };
  }
  // Prompt 46: «Minn meg på å avslutte Spotify 15.10» → påminnelse i Gjøremål OG frist i Subscription OS (Prøveperioder).
  // Bare når det gjelder en tjeneste/et abonnement (ikke enhver oppgave med ordet «abonnement»), og ikke spørsmål («hvordan sier jeg opp …»).
  // En beskrivelse av selve prøven («Viaplay gratis i 14 dager, påminn meg om å avslutte», «Netflix prøveperiode, si opp i tide») er
  // den eksisterende prøveregistreringen (sluttdato + varsler) – den går videre som før.
  const trialDesc = /gratis|trial|prøve/.test(t.replace(/før\s+(?:prøve\w*|gratisperiode\w*)\s+(?:går\s+ut|slutter|utløper)/g, ' '));
  if (CANCEL_RE46.test(t) && !trialDesc && !/^(hvordan|hva|hvor|hvorfor|kan jeg|når)\b/.test(t)) {
    const own = user ? serviceInText46(user, text) : null;
    if (own || serviceOf(text) || /abonnement|prøveperiode|prøvetid|gratisperiode|gratis\s+prøve/.test(t)) {
      const remind = /(?<![a-zæøå])(minn|påminn\w*|husk|ikke\s+glem|jeg\s+må|vi\s+må|må\s+huske)(?![a-zæøå])/.test(t);
      const calls = [...(remind ? [{ tool: 'tasks.create', args: {} }] : []), { tool: 'subscriptions.trial', args: {} }];
      return { intent: calls.length > 1 ? 'multi' : 'update', module: 'finance', calls, engine: 'lokal' };
    }
  }
  // Prompt 46: abonnementer og faste utgifter (data fra Subscription OS / Budsjett, ikke modellens kunnskap).
  if ((q || /^(finn|vis|list|regn)/.test(t)) && /abonnement|abonomang|abbonement|strømmetjenest|faste\s+(?:utgift|betaling|trekk|kostnad)/.test(t) && !/prøveperiode|gratis/.test(t)) {
    return P(/faste\s+(?:utgift|betaling|trekk|kostnad)/.test(t) ? 'finance.fixed' : 'finance.subscriptions', {});
  }
  if (/(?<![a-zæøå])(dyrest|billigst|størst)\w*\s+(?:kjøp\w*|kvittering\w*|transaksjon\w*|handel)/.test(t)) return P('finance.search', {});
  if (legacyIntent === 'trial.create' || legacyIntent === 'memory.add') return P('app.answer', { topic: legacyIntent === 'trial.create' ? 'trial' : 'memory' });
  if (DELETE_RE.test(t) && !/abonnement|prøveperiode/.test(t)) return P('calendar.delete', {});
  if (UPDATE_RE.test(t)) return P('calendar.update', {});
  if (COMPLETE_RE.test(t)) return P('tasks.complete', {});
  if (FIN_SEARCH.test(t)) {
    const merchant = merchantOf45(text), item = itemOf45(text, merchant), am = parseAmount45(text), per = parsePeriod45(text, today);
    if (merchant || item || am || per || /kvittering/.test(t)) return P('finance.search', { merchant: merchant || undefined, item: item || undefined });
  }
  if (FIN_SUM.test(t) && !/kalender/.test(t)) return P('finance.summary', {});
  if (q && /^(hva|hvilke|hvor\s+mange|har\s+jeg|vis)(?![a-zæøå])/.test(t) && TASK_LIST.test(t) && !/kalender/.test(t)) return P('tasks.list', {});
  if (TASK_RE.test(t) && !/(?:i|på|til)\s+kalender/.test(t)) {
    // Lange beskjeder med flere ting («… men først må jeg …») deles opp av den eksisterende Gjøremål-jobben.
    if (t.length > 140 || /(?<![a-zæøå])(men først|og så|etterpå|deretter)(?![a-zæøå])/.test(t)) return P('app.answer', { topic: 'other' });
    return P('tasks.create', {});
  }
  if (CREATE_RE.test(t) || (module === 'calendar' && hasWhen && !q)) {
    const rest = L(w.rest).replace(/^(?:kan du\s+)?(?:legg(?:e)?\s+(?:til|inn)|sett\s+opp|book(?:e)?|lag|opprett|ny|nytt)\s*/, '').replace(/^(?:en|et|ei)\s+/, '').trim();
    if (!rest || /^(noe|noen ting|en ting|det)$/.test(rest)) return askP('Hva vil du legge til – en avtale i kalenderen eller et gjøremål?');
    if (/(?:i|på|til)\s+(?:huskelist|handlelist|gjøremål)/.test(t) || (module === 'tasks' && !/kalender/.test(t))) return P('tasks.create', {});
    if (hasWhen || EVENT_NOUN.test(t) || module === 'calendar') return P('calendar.create', {});
    return P('tasks.create', {});
  }
  if (q && TASK_LIST.test(t) && !/kalender/.test(t)) return P('tasks.list', {});
  if (q && CAL_LIST.test(t) && !/neste\s+(?:time|frisør|tannlege|lege)|ledig/.test(t)) return P('calendar.list', {});
  if (q && (legacyIntent === 'calendar.day') && !LEGACY_FIRST.test(t)) return P('calendar.list', {});
  if (module === 'tasks' && !q) return P('tasks.create', {});
  if (module === 'finance' && q && !LEGACY_FIRST.test(t)) {
    const merchant = merchantOf45(text), am = parseAmount45(text);
    if (merchant || am) return P('finance.search', { merchant: merchant || undefined });
  }
  if (legacyIntent === 'llm' || legacyIntent == null) return P(module === 'chat' ? 'chat.answer' : 'app.answer', { topic: 'other' });
  return P('app.answer', { topic: 'other' });
}
/** Trenger forespørselen motoren (handling eller data-søk), eller holder de eksisterende svarene? */
export const legacyFirst45 = (text) => LEGACY_FIRST.test(L(text));
