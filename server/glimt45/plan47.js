// Prompt 47 (GLIMT47) Steg C – planleggeren. ETT modellkall som returnerer KUN JSON etter et skjema (Ollama `format`):
//   {intent, calls:[{tool, args}], needs_clarification, clarification_question}
// («calls» er stegene; flere steg er lov – værspørsmål med to steder/tider = to weather.get).
// Regler: modellen velger bare verktøy og trekker ut parametre. Datoer/tider kommer som RÅTEKST fra brukeren («17.12 17.30»,
// «neste time») – koden tolker dem (dates.js). Systemprompten er kort og på engelsk, med instruks om at spørsmål til brukeren skal
// være på norsk, og few-shots (de fem eksemplene fra oppdraget + flere). Etter planen filtreres kallene på intent: et spørsmål om
// britisk politikk kan ikke ende i Finans/Kalender/Gjøremål.
// Feil (prompt 55): ugyldig JSON/plan ELLER tidsavbrudd → ett nytt forsøk med think på (samme modell, lengre grense med tak,
// params47.plannerRetry), deretter {failed:'timeout'|'invalid'} – motoren stiller da et kort oppfølgingsspørsmål med konkrete valg
// (aldri den gamle veien, aldri lagring ut fra en gjetning). null bare når modellen er nede/ikke finnes (motoren bruker den lokale
// planen). Tekstmønstre (localPlan45) er bare HINT i meldingen, aldri portvakt.
import { TOOLS45, TOOL45, ollamaTools45 } from './tools.js';
import { STEP47, fitParts47, estTokens47 } from './params47.js';
import { contextBlock47 } from './context.js';

export const INTENTS47 = ['calendar_query', 'calendar_create', 'calendar_change', 'weather', 'finance_query', 'todo', 'web_search', 'media', 'memory_save', 'chat', 'app'];
/** Hvilke verktøy hver intent får utføre (verktøyutvalg per intent i utførelsen). */
export const INTENT_TOOLS47 = {
  calendar_query: ['calendar.search', 'calendar.next', 'calendar.list'],
  calendar_create: ['calendar.create'],
  calendar_change: ['calendar.update', 'calendar.delete'],
  weather: ['weather.get'],
  finance_query: ['finance.search', 'finance.summary', 'finance.subscriptions', 'finance.fixed'],
  todo: ['tasks.create', 'tasks.list', 'tasks.complete', 'subscriptions.trial'],
  web_search: ['web.search'],
  media: ['media.episode'],
  memory_save: ['memory.save'],
  chat: ['chat.answer'],
  app: ['app.answer', 'nav.open'],
};
const INTENT_OF_TOOL47 = Object.fromEntries(Object.entries(INTENT_TOOLS47).flatMap(([i, ts]) => ts.map((t) => [t, i])));
export const intentOfTool47 = (t) => INTENT_OF_TOOL47[t] ?? null;

// Korte engelske verktøybeskrivelser for planleggeren (registeret har norske beskrivelser for klientene).
const TOOL_LINES47 = {
  'calendar.search': '{terms:[string], direction:"next"|"past", limit} find the user\'s events by words (OR). Use the person\'s name AND the alias terms from Memory facts.',
  'calendar.next': '{terms:[string]} the next upcoming event matching any of the terms.',
  'calendar.list': '{period} events in a period ("i morgen", "neste uke", "fredag").',
  'calendar.create': '{title, date, time, end_time, location, note} create one event. title max 60 chars ("Dune", "Tannlege", "Middag hos mamma"), never the whole message; location separate.',
  'calendar.update': '{target, date, time, title} move or change an event.',
  'calendar.delete': '{target} delete an event (the app asks for confirmation).',
  'tasks.create': '{title, due, time, note, list} a to-do or reminder ("minn meg på", "husk å", "jeg må").',
  'tasks.list': '{filter:"today"|"overdue"|"open"|"week"} list to-dos.',
  'tasks.complete': '{target} mark a to-do as done.',
  'weather.get': '{place, when, info:"summary"|"temp"|"precip"|"wind"} weather for ONE place and ONE time. Two places or times = two calls.',
  'finance.subscriptions': '{mode:"top"|"bottom"|"total"|"list"|"increased", limit} the user\'s subscriptions. The code normalises prices to per month and ranks them.',
  'finance.fixed': '{mode:"top"|"month"|"total", month} fixed monthly costs.',
  'finance.summary': '{period, category, group_by:"total"|"category"|"merchant"} spending sums computed from transactions.',
  'finance.search': '{merchant, item, amount, period, kind:"receipt"|"transaction"|"any"} find purchases and receipts.',
  'subscriptions.trial': '{service, date} a subscription or free trial must be cancelled by a date.',
  'memory.save': '{subject, object} remember a fact the user states about someone/something ("Nina er frisøren min" → subject "Nina", object "frisør").',
  'web.search': '{query} current facts that may have changed: people in office, news, prices, results, events.',
  'media.episode': '{title, pick:"latest"|"next", season, episode} TV episodes in Sonarr ("last ned siste episode av X").',
  'nav.open': '{target} open a page in the app (only when asked to open/go to a page).',
  'app.answer': '{topic:"departures"|"packages"|"sun"|"family"|"trial"|"school"|"other"} public transport departures, package tracking, sunrise/daylight, where family members are, registering a free trial, school tests.',
  'chat.answer': '{} general knowledge, explanations or small talk that need no app data and no fresh facts.',
};
const J = (o) => JSON.stringify(o);
const ex = (u, intent, calls, ask = null) => `User: ${u}\n${J({ intent, calls, needs_clarification: !!ask, clarification_question: ask })}`;
const FEWSHOTS47 = [
  ex('Når er neste gang jeg skal til Nina?   [Memory: Nina = frisør]', 'calendar_query', [{ tool: 'calendar.search', args: { terms: ['Nina', 'frisør'], direction: 'next', limit: 1 } }]),
  ex('Skal se Dune på Colosseum kino 17.12 17.30', 'calendar_create', [{ tool: 'calendar.create', args: { title: 'Dune', location: 'Colosseum kino', date: '17.12', time: '17.30' } }]),
  ex('Hvordan er været i Oslo neste time og i New York i morgen?', 'weather', [{ tool: 'weather.get', args: { place: 'Oslo', when: 'neste time' } }, { tool: 'weather.get', args: { place: 'New York', when: 'i morgen' } }]),
  ex('Hva er det dyreste abonnementet jeg har?', 'finance_query', [{ tool: 'finance.subscriptions', args: { mode: 'top', limit: 3 } }]),
  ex('Hvem er statsminister i Storbritannia?', 'web_search', [{ tool: 'web.search', args: { query: 'statsminister Storbritannia' } }]),
  ex('Middag hos mamma på fredag kl 18', 'calendar_create', [{ tool: 'calendar.create', args: { title: 'Middag hos mamma', date: 'fredag', time: 'kl 18' } }]),
  ex('Tannlege 3/2 kl 0815', 'calendar_create', [{ tool: 'calendar.create', args: { title: 'Tannlege', date: '3/2', time: 'kl 0815' } }]),
  ex('Hvor mye har jeg brukt på mat denne måneden?', 'finance_query', [{ tool: 'finance.summary', args: { period: 'denne måneden', category: 'mat', group_by: 'total' } }]),
  ex('Nina er frisøren min', 'memory_save', [{ tool: 'memory.save', args: { subject: 'Nina', object: 'frisør' } }]),
  ex('Minn meg på å kjøpe melk i morgen', 'todo', [{ tool: 'tasks.create', args: { title: 'Kjøpe melk', due: 'i morgen' } }]),
  ex('Hva er hovedstaden i Frankrike?', 'chat', [{ tool: 'chat.answer', args: {} }]),
  ex('Last ned siste episode fra 9-1-1', 'media', [{ tool: 'media.episode', args: { title: '9-1-1', pick: 'latest' } }]),
  ex('Hva skjer i morgen?', 'calendar_query', [{ tool: 'calendar.list', args: { period: 'i morgen' } }]),
  ex('Når går neste buss?', 'app', [{ tool: 'app.answer', args: { topic: 'departures' } }]),
  ex('Flytt den', 'calendar_change', [], 'Hvilken avtale vil du flytte, og til når?'),
];
const buildSystem47 = () => `You are the planner for Glimt, a personal assistant in a Norwegian app. Turn the user's message into tool calls. You never answer the user yourself.
Reply with ONLY JSON: {"intent": one of ${INTENTS47.join('|')}, "calls": [{"tool": "...", "args": {...}}], "needs_clarification": bool, "clarification_question": string or null}.
Rules:
- Choose tools and extract arguments. Never compute dates, sums, maxima or sort lists: the tools do that.
- Copy dates and times exactly as the user wrote them ("17.12", "fredag", "neste time", "kl 1730"). Do not convert them.
- One call per sub-request. Several places or times = several weather.get calls.
- Titles are short (max 60 characters), never the whole message. Put the place in location.
- Use Memory facts: when a person or alias is mentioned, search with the name AND the related terms.
- Fresh facts (people in office, news, prices, results) → web.search. Timeless knowledge → chat.answer. Never call calendar, finance or to-do tools for general questions.
- If the request is genuinely ambiguous, set needs_clarification true, no calls, and ask ONE short question in Norwegian (bokmål).
Tools:
${TOOLS45.filter((t) => TOOL_LINES47[t.name]).map((t) => `- ${t.name} ${TOOL_LINES47[t.name]}`).join('\n')}
Examples:
${FEWSHOTS47.join('\n')}`;
// Bygges ved første kall (verktøyene fra tools46/tools47 registreres i TOOLS45 når de importeres). Stabil tekst først = prefiks-cache.
let SYSTEM47 = null;
export const plannerSystem47 = () => (SYSTEM47 ??= buildSystem47());

export function planSchema47() {
  return {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: INTENTS47 },
      calls: { type: 'array', maxItems: 6, items: { type: 'object', properties: { tool: { type: 'string', enum: TOOLS45.filter((t) => TOOL_LINES47[t.name]).map((t) => t.name) }, args: { type: 'object' } }, required: ['tool', 'args'] } },
      needs_clarification: { type: 'boolean' },
      clarification_question: { type: ['string', 'null'] },
    },
    required: ['intent', 'calls', 'needs_clarification'],
  };
}

const parseArgs = (a) => { if (a && typeof a === 'object' && !Array.isArray(a)) return a; try { const x = JSON.parse(String(a ?? '{}')); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } };
const toolName = (n) => { const s = String(n ?? '').trim(); if (TOOL45[s]) return s; const d = s.replace(/_/, '.'); return TOOL45[d] ? d : s; };
/**
 * Modellens svar → plan {intent, calls, ask?, dropped:[…]} eller {error} (forklaringen går inn i neste forsøk).
 * Godtar også tool_calls (testkrok / tools-modus) og eldre {intent, module, calls, ask}.
 */
export function cleanPlan47(out) {
  if (!out) return { error: 'no answer' };
  let d = out.data;
  if (Array.isArray(out.toolCalls) && out.toolCalls.length) d = { calls: out.toolCalls.map((c) => ({ tool: c.function?.name ?? c.name, args: c.function?.arguments ?? c.arguments })) };
  if (d === undefined && typeof out.text === 'string') {
    const s = out.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    try { d = JSON.parse(s.match(/\{[\s\S]*\}/)?.[0] ?? s); } catch { return { error: 'the answer was not valid JSON' }; }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'the answer was not a JSON object' };
  const raw = Array.isArray(d.calls) ? d.calls : Array.isArray(d.steps) ? d.steps : [];
  const unknown = [];
  let calls = raw.map((c) => ({ tool: toolName(c?.tool ?? c?.name), args: parseArgs(c?.args ?? c?.arguments) })).filter((c) => (TOOL45[c.tool] ? true : (unknown.push(c.tool), false))).slice(0, 6);
  const q0 = typeof d.clarification_question === 'string' ? d.clarification_question : typeof d.ask === 'string' ? d.ask : '';
  const askQ = q0.trim() ? q0.trim().slice(0, 300) : null;
  const intent = INTENTS47.includes(d.intent) ? d.intent : null;
  // Verktøy per intent: kall som ikke hører til intentens verktøy, utføres ikke (f.eks. Finans på et politikkspørsmål).
  const dropped = [];
  if (intent && calls.length) {
    const ok = INTENT_TOOLS47[intent];
    const keep = calls.filter((c) => ok.includes(c.tool));
    for (const c of calls) if (!ok.includes(c.tool)) dropped.push(c.tool);
    calls = keep;
  }
  if ((d.needs_clarification === true || (!calls.length && askQ)) && askQ) return { intent: intent ?? 'chat', calls: [], ask: askQ, dropped };
  if (!calls.length) return { error: dropped.length ? `the tools ${dropped.join(', ')} do not belong to intent ${intent}` : unknown.length ? `unknown tools: ${unknown.join(', ')}` : 'no calls and no clarification question' };
  return { intent: intent ?? intentOfTool47(calls[0].tool) ?? 'chat', calls, dropped };
}

/**
 * Planleggeren. ctx = buildContext47-resultatet, hint = kort tekst fra tekstmønstrene (kan være feil). call(o) = modellkallet
 * ({mode, system, prompt, schema, tools, step, user}) → {data|text|toolCalls, model, tokens, params}. trace = trace47-objektet.
 * → {intent, calls, ask?, engine, model, attempts} | null
 */
export async function modelPlan47(user, text, { ctx, hint = '', mode: mode0 = 'json', call, trace = null } = {}) {
  let mode = mode0;
  const sys0 = plannerSystem47();
  const schema = planSchema47();
  const tools = mode === 'tools' ? ollamaTools45(TOOLS45.filter((t) => TOOL_LINES47[t.name]).map((t) => t.name)) : null;
  let lastErr = null, lastFail = null, lastModel = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const sp = attempt === 0 ? STEP47.planner : STEP47.plannerRetry;
    const user0 = `Melding: ${text}${hint ? `\nHints (from simple text patterns, may be wrong): ${hint}` : ''}${lastErr ? `\nYour previous answer could not be used (${lastErr}). Reply with valid JSON that follows the schema.` : ''}`;
    // Mål prompten før kallet; trim eldste historikk og så fakta – aldri systemprompten eller meldingen.
    const fit = fitParts47({ fixed: `${sys0}\n${user0}\n${JSON.stringify(schema)}${tools ? JSON.stringify(tools) : ''}\n${ctx.nowLine}\n${ctx.profileText}`, parts: [{ key: 'history', text: ctx.historyText, fromStart: true }, { key: 'facts', text: ctx.factsText, minChars: 200 }], numCtx: sp.numCtx, numPredict: sp.numPredict });
    const system = `${sys0}\n\n# Context\n${contextBlock47(ctx, fit.parts)}`;
    const t0 = Date.now();
    let out;
    try {
      out = await call({ user, mode, system, prompt: user0, schema, tools: mode === 'tools' ? tools : null, step: attempt === 0 ? 'planner' : 'plannerRetry' });
    } catch (e) {
      const kind = plannerErrKind55(e);
      trace?.model({ step: attempt === 0 ? 'planner' : 'plannerRetry', model: e?.model ?? null, ms: Date.now() - t0, ok: false, error: e?.message ?? e, errKind: kind, trimmed: fit.trimmed, promptEst: fit.est, timing: e?.timing ?? e?.telemetry ?? null });
      // Tools-modus (bare testkrok/eldre oppsett) mot en modell uten verktøystøtte: samme forespørsel i JSON-modus.
      if (mode === 'tools' && /support(s)? tools|does not support tools|tools.*not supported/i.test(String(e?.message ?? ''))) { mode = 'json'; lastErr = null; attempt--; continue; }
      console.warn(`[glimt47] planlegger (${attempt === 0 ? 'planner' : 'plannerRetry'}, ${kind}):`, String(e?.message ?? e).slice(0, 160));
      // Modellen nede / ikke installert: ingen vits i et nytt forsøk – motoren bruker den lokale planen.
      if (kind === 'down') return null;
      // Prompt 55: tidsavbrudd eller ugyldig svar → ett nytt forsøk med thinking (plannerRetry), så {failed}.
      lastErr = kind === 'timeout' ? 'the previous attempt timed out; answer with the JSON plan directly' : 'the answer was not valid JSON';
      lastFail = kind === 'timeout' ? 'timeout' : 'invalid';
      continue;
    }
    trace?.model({ step: attempt === 0 ? 'planner' : 'plannerRetry', model: out?.model ?? null, params: out?.params ?? { ...sp, promptEst: fit.est }, tokens: out?.tokens, ms: Date.now() - t0, trimmed: fit.trimmed, timing: out?.timing ?? null });
    const p = cleanPlan47(out);
    if (!p.error) return { ...p, engine: mode === 'tools' ? 'ollama-tools' : 'ollama-json', model: out?.model ?? null, attempts: attempt + 1, raw: out?.data ?? null };
    lastErr = p.error; lastFail = 'invalid'; lastModel = out?.model ?? lastModel;
  }
  return { failed: lastFail ?? 'invalid', error: lastErr, attempts: 2, model: lastModel, engine: 'ollama-json' };
}
/** Prompt 55: hva slags feil planleggerkallet fikk. → 'down' (modellen nede/mangler) | 'timeout' | 'invalid' */
export function plannerErrKind55(e) {
  const m = String(e?.message ?? e ?? '');
  const kinds = [e?.kind, e?.code, ...(Array.isArray(e?.errors) ? e.errors.map((x) => x?.kind) : [])].filter(Boolean).map(String);
  if (kinds.some((k) => /^(no_model|model_not_found|nocontact|memory)$/.test(k))) return 'down';
  if (e?.timeout || kinds.some((k) => /timeout/.test(k)) || /svarte ikke innen|ingen nye tokens|lastet ikke inn|tidsavbrudd/i.test(m)) return 'timeout';
  if (/kan ikke nås|ikke satt|not found|ECONNREFUSED|ENOTFOUND|fetch failed|ingen modell|Ingen modell|for lite minne|ikke installert/i.test(m)) return 'down';
  return 'invalid';
}
export const _planner47 = { estTokens: estTokens47 };

/**
 * Steg G (selvsjekk av planen): har tekstmønstrene sett deler av meldingen som planen ikke dekker (et sted i et værspørsmål,
 * abonnementsdata, en avslutningsfrist)? Da får planleggeren ETT nytt forsøk med det som hint. Mønstrene legger aldri inn kall selv.
 * → hinttekst | null
 */
export function planGap47(local, plan) {
  const lc = local?.calls ?? [], pc = plan?.calls ?? [];
  const out = [];
  const wl = lc.filter((c) => c.tool === 'weather.get' && c.args?._req);
  if (wl.length) {
    const covered = (p) => pc.some((c) => c.tool === 'weather.get' && String(c.args?.place ?? c.args?.location ?? '').toLowerCase() === String(p ?? '').toLowerCase());
    const miss = wl.filter((c) => c.args._req.place && !covered(c.args._req.place));
    if (miss.length && pc.some((c) => c.tool === 'weather.get')) out.push(`The message also asks about the weather in ${miss.map((c) => `${c.args._req.place} (${c.args._req.when?.label ?? ''})`).join(' and ')}: use one weather.get per place and time.`);
    else if (miss.length && !pc.some((c) => c.tool === 'weather.get')) out.push('This is a weather question: use one weather.get per place and time.');
  }
  if (lc.some((c) => c.tool === 'finance.subscriptions' || c.tool === 'finance.fixed') && !pc.some((c) => c.tool === 'finance.subscriptions' || c.tool === 'finance.fixed')) out.push("This is about the user's registered subscriptions or fixed costs: use finance.subscriptions (or finance.fixed). Never answer from your own knowledge.");
  if (lc.some((c) => c.tool === 'subscriptions.trial') && !pc.some((c) => c.tool === 'subscriptions.trial')) out.push('The user wants to cancel a subscription by a date: include subscriptions.trial (and tasks.create if they asked for a reminder).');
  return out.length ? out.join(' ') : null;
}
