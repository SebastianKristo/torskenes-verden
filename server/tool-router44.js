// Prompt 44: rutingssteg før hovedmodellen (Chat /send og Glimt-søket på Hjem). Hvilke verktøy trenger spørsmålet?
//   web      aktuelle fakta, personer i embeter, nyheter, priser, «hvem er …», «siste …»
//   weather / time / sun   (prompt 41, server/chat-tools41.js)
//   power    strømpris (server/power-price.js)
//   finans / kalender / huske   delene av «Mine data» som legges ved (bare de valgte, ikke alt)
//   none     ingen verktøy
// Lokal regel først. Er den usikker, spør vi ruten «AI-søk» (hos brukeren llama3.2:3b) via gaten: interaktiv, JSON, maks 5 s,
// numPredict ~60, svar {"tools":[…], "query":"…"}. Feil eller tidsavbrudd → regelen.
import { planLocal, hasFactWords } from './chat-tools41.js';
import { isPowerQuestion } from './power-price.js';

export const TOOLS44 = ['web', 'weather', 'time', 'sun', 'power', 'finans', 'kalender', 'huske', 'none'];
export const DATA_TOOLS = ['finans', 'kalender', 'huske'];
export const ROUTER_MS = 5000;
let routerLlm = null;
/** Bare for tester: (tekst) → {tools, query} | null. */
export const _setRouterLlm = (fn) => { routerLlm = fn ?? null; };

/* ---------------- Dato og tid i Oslo ---------------- */

const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
/** «Nå: tirsdag 21. oktober 2026 kl. 10.42 (Europe/Oslo)» */
export function osloNowLine(now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return `Nå: ${WD[wd]} ${+p.day}. ${MON[+p.month - 1]} ${p.year} kl. ${p.hour}.${p.minute} (Europe/Oslo)`;
}

/* ---------------- Lokal regel ---------------- */

const R = (s) => new RegExp(s, 'iu');
const B = '(?<![\\p{L}\\d])', E = '(?![\\p{L}\\d])';
const NONE_RE = R(`^\\s*(hei|hallo|heisann|hei hei|god\\s+(morgen|dag|kveld|natt)|takk|tusen\\s+takk|ok(ei)?|ja|nei|flott|supert?|hade|ha\\s+det)${E}[\\s!.,?]*(glimt)?[\\s!.?]*$|${B}(hva\\s+kan\\s+du|hvem\\s+er\\s+du|hva\\s+heter\\s+du)${E}`);
const HOWTO_RE = R(`${B}(hvordan\\s+(lager|setter|installerer|bruker|skriver|fikser|konfigurerer|kobler)|forklar|skriv\\s+(en|et|meg)|oversett|lag\\s+(en|et)\\s+(dikt|tekst|liste|oppskrift|plan)|regex|docker|kubernetes|python|javascript|typescript|sql|bash|linux|kode(n)?|script)${E}`);
const FIN_RE = R(`${B}(brukte\\s+(jeg|vi)|bruker\\s+(jeg|vi)|har\\s+(jeg|vi)\\s+brukt|forbruk(et)?|utgift(er|ene)?|inntekt(er|ene)?|penger|budsjett(et)?|økonomi(en)?|finans|lønn(a|en)?|sparing|sparekonto|konto(en)?|regning(er|ene)?|faktura(er|ene)?|abonnement(er|ene)?|transaksjon(er|ene)?|kvittering(er|ene)?|matbudsjett|mest\\s+penger|hvor\\s+mye\\s+(brukte|bruker|har)\\s+(jeg|vi))${E}`);
const CAL_RE = R(`${B}(kalender(en)?|avtale(r|ne)?|møte(r|ne|t)?|timeplan(en)?|hva\\s+skjer\\s+(i\\s+dag|i\\s+morgen|i\\s+kveld|på|denne|neste)|hva\\s+har\\s+jeg\\s+(i\\s+dag|i\\s+morgen|i\\s+kveld|på|denne|neste)|når\\s+(er|har|skal)\\s+jeg|planer|ledig\\s+tid|er\\s+jeg\\s+ledig|bursdag(en|er)?|neste\\s+time)${E}`);
const HUSKE_RE = R(`${B}(huskelist(a|en|e)|gjøremål(ene)?|to-?do|oppgave(r|ne)\\s+mine|må\\s+jeg\\s+huske|hva\\s+må\\s+jeg\\s+gjøre|hva\\s+står\\s+på\\s+lista)${E}`);
const WEB_STRONG = R(`${B}(hvem\\s+(er|var|ble|blir|leder|styrer|eier|vant|regjerer|sitter\\s+som)|statsminister(en)?|president(en)?|utenriksminister(en)?|finansminister(en)?|minister(en)?|kong(en|e)|dronning(en)?|ordfører(en)?|generalsekretær(en)?|pave(n)?|direktør(en)?|konsernsjef(en)?|ceo|leder\\s+(av|for|i)|sjef(en)?\\s+(for|i)|nyhet(er|ene)?|siste\\s+nytt|nytt\\s+om|hva\\s+skjedde|aktuelt|who\\s+is|who\\s+won|latest\\s+news|prime\\s+minister)${E}`);
const WEB_WEAK = R(`${B}(siste|nylig|i\\s+år|i\\s+fjor|20[2-3]\\d|resultat(et|ene)?|vant|vinner(en)?|kamp(en)?|valg(et)?|kurs(en)?\\s+på|aksje(n|kurs(en)?)?|pris(en)?\\s+på|hva\\s+koster|befolkning(en)?|innbyggere|hovedstad(en)?|current|today'?s)${E}`);
const QUESTION_RE = R(`\\?\\s*$|^\\s*(hva|hvem|hvor|hvilk|hvordan|hvorfor|når|kan\\s+du|vet\\s+du|fortell|what|who|where|when|which|how|why|is|are|do|does)${E}`);
const PERSONAL_RE = R(`${B}(jeg|meg|min|mitt|mine|vi|oss|vår|vårt|våre)${E}`);

/** Søkeordet: spørsmålet uten høflighetsfraser og spørsmålstegn. */
export function webQueryOf(text) {
  return String(text ?? '').replace(/^\s*(kan\s+du\s+(si|fortelle)\s+(meg\s+)?|vet\s+du\s+|glimt\s*,?\s*|søk\s+(etter|på)\s+|google\s+)/i, '').replace(/[?!.]+\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Lokal regel. → {tools:[…], query, confident, reason}
 * confident:false = ingen regel slo til, men det ser ut som et spørsmål om verden (da kan LLM-en avgjøre).
 */
export function routeLocal(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { tools: ['none'], query: '', confident: true, reason: 'tomt' };
  const tools = new Set();
  const reasons = [];
  if (isPowerQuestion(t)) { tools.add('power'); reasons.push('strømpris'); }
  if (hasFactWords(t)) { for (const x of planLocal(t).tasks ?? []) tools.add(x.tool); if (tools.has('weather') || tools.has('time') || tools.has('sun')) reasons.push('vær/tid/sol'); }
  if (FIN_RE.test(t)) { tools.add('finans'); reasons.push('finans'); }
  if (CAL_RE.test(t)) { tools.add('kalender'); reasons.push('kalender'); }
  if (HUSKE_RE.test(t)) { tools.add('huske'); reasons.push('huskeliste'); }
  const strong = WEB_STRONG.test(t), weak = WEB_WEAK.test(t);
  const data = DATA_TOOLS.some((x) => tools.has(x));
  if (strong && !(data && PERSONAL_RE.test(t) && !/\b(statsminister|president|minister|hvem\s+er)\b/i.test(t))) { tools.add('web'); reasons.push('aktuelle fakta'); }
  else if (weak && !tools.size && !PERSONAL_RE.test(t) && t.split(/\s+/).length >= 4) { tools.add('web'); reasons.push('aktuelt'); }
  if (tools.has('power')) { tools.delete('web'); } // «pris på strøm» er power, ikke nettsøk
  const query = tools.has('web') ? webQueryOf(t) : '';
  if (tools.size) return { tools: [...tools], query, confident: true, reason: reasons.join(', ') };
  if (NONE_RE.test(t) || HOWTO_RE.test(t)) return { tools: ['none'], query: '', confident: true, reason: NONE_RE.test(t) ? 'hilsen' : 'forklaring/oppgave' };
  const words = t.split(/\s+/).length;
  if (QUESTION_RE.test(t) && words >= 3 && !PERSONAL_RE.test(t)) return { tools: ['none'], query: webQueryOf(t), confident: false, reason: 'usikker' };
  return { tools: ['none'], query: '', confident: true, reason: 'ingen verktøy' };
}

/** Sjekker modellens svar. → {tools, query} | null */
export function cleanRoute(data, text) {
  const list = Array.isArray(data?.tools) ? data.tools : typeof data?.tools === 'string' ? [data.tools] : Array.isArray(data) ? data : [];
  const tools = [...new Set(list.map((x) => String(x).toLowerCase().trim()).map((x) => ({ vær: 'weather', tid: 'time', sol: 'sun', strøm: 'power', strømpris: 'power', nett: 'web', nettsøk: 'web', search: 'web', calendar: 'kalender', tasks: 'huske', finance: 'finans' }[x] ?? x)).filter((x) => TOOLS44.includes(x)))];
  if (!tools.length) return null;
  const clean = tools.length > 1 ? tools.filter((x) => x !== 'none') : tools;
  const q = typeof data?.query === 'string' && data.query.trim() ? data.query.trim().slice(0, 200) : webQueryOf(text);
  return { tools: clean, query: clean.includes('web') ? q : '' };
}
export const ROUTER_SYSTEM = 'Du velger verktøy for et spørsmål før en assistent svarer. Verktøy: web (aktuelle fakta, personer i embeter, nyheter, priser, «hvem er», «siste»), weather, time, sun, power (strømpris), finans (brukerens egen økonomi), kalender (brukerens avtaler), huske (brukerens huskeliste), none. '
  + 'Velg bare det spørsmålet trenger. Svar KUN med JSON {"tools":["…"],"query":"søkeord for web, ellers tom"}.';

/**
 * Rutingen. → {tools:[…], query, via:'regel'|'llm'|'tvunget', confident, reason, ms}
 * forceWeb: Chat-knappen «Nettsøk» (b.webSearch) tvinger web. useLlm:false → bare regelen.
 */
export async function routeTools(text, { user = null, forceWeb = false, useLlm = true, localOnly = true, signal = null } = {}) {
  const t0 = Date.now();
  const loc = routeLocal(text);
  const done = (r, via) => {
    let tools = r.tools;
    if (forceWeb && !tools.includes('web')) tools = [...tools.filter((x) => x !== 'none'), 'web'];
    return { tools: tools.length ? tools : ['none'], query: tools.includes('web') ? r.query || webQueryOf(text) : '', via: forceWeb && !r.tools.includes('web') ? 'tvunget' : via, confident: loc.confident, reason: loc.reason, ms: Date.now() - t0 };
  };
  if (loc.confident || forceWeb || !useLlm || (process.env.MOCK_DATA === '1' && !routerLlm && !process.env.OLLAMA_URL)) return done(loc, 'regel');
  const call = routerLlm ? Promise.resolve().then(() => routerLlm(text))
    : (async () => {
      const { run } = await import('./ai-run.js');
      const r = await run('sok', { user, system: ROUTER_SYSTEM, prompt: `${osloNowLine()}\nSpørsmål: ${String(text).slice(0, 400)}`, json: true, temperature: 0, numPredict: 60, timeoutMs: ROUTER_MS,
        localOnly, title: 'Glimt · ruting', noRetry: true, signal });
      return r.data ?? null;
    })();
  const res = await Promise.race([call.catch(() => null), new Promise((r) => { const tm = setTimeout(() => r(null), ROUTER_MS); tm.unref?.(); })]);
  const c = cleanRoute(res, text);
  return c ? done(c, 'llm') : done(loc, 'regel');
}

/** Teksten rutingen skal se på: korte oppfølginger («Og i fjor?») får med forrige spørsmål. */
export function routeTextOf(history) {
  const users = (history ?? []).filter((m) => m.role === 'user').map((m) => String(m.content ?? ''));
  const last = users.at(-1) ?? '';
  const prev = users.at(-2);
  if (prev && (/^\s*(og|men|hva\s+med|enn|and|what\s+about)\b/i.test(last) || last.trim().split(/\s+/).length <= 3) && routeLocal(last).tools.includes('none')) return `${prev} ${last}`;
  return last;
}

/** Bare delene av «Mine data» som rutingen valgte. */
export function pickData(data, tools) {
  if (!data) return null;
  const want = DATA_TOOLS.filter((k) => tools.includes(k));
  if (!want.length) return null;
  return Object.fromEntries(want.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
}
