// Prompt 53 (DAL53): tekstmodellene – Redact (personopplysninger før sky), Tongue (språket i meldingen) og Emo (emoji-forslag).
//
// Redact: før tekst med personopplysninger går til en sky-modell (chat) eller et nettsøk, byttes navn, adresser, e-post, telefon,
// kontonummer, fødselsnummer o.l. med plassholdere ([GIVEN_NAME_1] …). Svaret fra skyen får originalene tilbake lokalt, også mens
// det strømmer (en plassholder som er delt mellom to biter holdes tilbake til den er hel). Originalverdiene logges aldri.
// Reserve (ikke klar, flagget av, feil eller tidsavbrudd): dagens oppførsel, uendret tekst.
import { use53, ready53 } from './models.js';
import { on53 } from './flags.js';

/* ---------------- Redact ---------------- */

const SEP = '\n⁣⁣§53§⁣⁣\n'; // skille mellom delene i én felles redigering (samme plassholder = samme person)
const PH_RE = /\[[A-Z][A-Z_]*_\d+\]/;
export const PLACEHOLDER_NOTE53 = 'Noen navn og personopplysninger i samtalen er byttet med plassholdere som [GIVEN_NAME_1] eller [PHONE_1] for personvern. '
  + 'Bruk plassholderne nøyaktig som de står når du viser til dem, og ikke prøv å gjette hva de står for.';

/**
 * Rediger flere tekster i én kjøring (samme plassholder for samme verdi på tvers av delene).
 * → {parts:[…], restore(text), count, labels:{LABEL:n}} | null (reserve).
 */
export async function redactParts53(parts, { labels = null, timeoutMs = 5000, minimumConfidence = undefined } = {}) {
  const joined = parts.map((p) => String(p ?? '')).join(SEP);
  if (!joined.trim()) return null;
  const r = await use53('redact', (red) => red.redaction(joined, { ...(labels ? { labels } : {}), ...(minimumConfidence != null ? { minimumConfidence } : {}) }), { timeoutMs });
  if (!r || typeof r.redactedText !== 'string') return null;
  const out = r.redactedText.split(SEP);
  if (out.length !== parts.length) return null; // skillet ble endret – ikke stol på resultatet
  const counts = {};
  for (const it of r.items ?? []) counts[it.label] = (counts[it.label] ?? 0) + 1;
  return { parts: out, restore: (t) => (typeof r.restore === 'function' ? r.restore(String(t ?? '')) : String(t ?? '')), count: (r.items ?? []).length, labels: counts };
}

/** Strømmende gjenoppretting: holder tilbake en påbegynt «[PLASSHOLDER» til den er hel. */
export function streamRestorer53(restore, emit) {
  let buf = '';
  const cut = () => {
    const i = buf.lastIndexOf('[');
    if (i >= 0 && buf.indexOf(']', i) < 0 && buf.length - i <= 40 && /^\[[A-Z_0-9]*$/.test(buf.slice(i))) return i;
    return buf.length;
  };
  return {
    async push(d) {
      if (!d) return;
      buf += d;
      const n = cut();
      if (!n) return;
      const out = restore(buf.slice(0, n)); buf = buf.slice(n);
      if (out) await emit(out);
    },
    async flush() { if (buf) { const out = restore(buf); buf = ''; await emit(out); } },
  };
}

/**
 * Wrapper rundt chattens runEngine(m, ctx): Tongue (språknotat i systeminstruksen) for alle modeller, og Redact for sky-modeller.
 * raw = den opprinnelige runEngine. ctx som i chat.js ({sys, msgs, onDelta, onThink, …}).
 */
export async function engine53(raw, m, ctx) {
  let c = ctx;
  try {
    const last = [...(ctx.msgs ?? [])].reverse().find((x) => x.role === 'user');
    const note = langNote53(last?.content);
    if (note) c = { ...c, sys: `${c.sys ?? ''}\n\n${note}` };
  } catch { /* reserve */ }
  if (m?.kind !== 'sky' || !on53('dal_redact53') || !ready53('redact')) return raw(m, c);
  const msgs = c.msgs ?? [];
  const idx = msgs.map((x, i) => (typeof x.content === 'string' && x.content ? i : -1)).filter((i) => i >= 0).slice(-16);
  const red = await redactParts53([c.sys ?? '', ...idx.map((i) => msgs[i].content)]).catch(() => null);
  if (!red || !red.count) return raw(m, c);
  const [sys, ...contents] = red.parts;
  const nextMsgs = msgs.map((x, i) => { const k = idx.indexOf(i); return k >= 0 ? { ...x, content: contents[k] } : x; });
  const out = streamRestorer53(red.restore, c.onDelta);
  const think = c.onThink ? streamRestorer53(red.restore, c.onThink) : null;
  console.info(`[dal53] redact: ${red.count} personopplysninger byttet med plassholdere før ${m.provider ?? 'sky'} (${Object.entries(red.labels).map(([k, v]) => `${k}×${v}`).join(', ')})`);
  try {
    const r = await raw(m, { ...c, sys: `${sys}\n\n${PLACEHOLDER_NOTE53}`, msgs: nextMsgs, onDelta: (d) => out.push(d), ...(think ? { onThink: (d) => think.push(d) } : {}) });
    await out.flush(); if (think) await think.flush();
    return { ...r, redacted53: { count: red.count, labels: red.labels } };
  } catch (e) { await out.flush().catch(() => {}); throw e; }
}

/**
 * Wrapper rundt ai-run.js run(task, o) for kall som KAN gå til en sky-modell (o.localOnly er ikke satt): brukerteksten (o.prompt)
 * får plassholdere før kallet, og svaret (text) får originalene tilbake. Går kallet til Ollama likevel (reserve), er plassholderne
 * også gjenopprettet. localOnly, flagget av eller Redact ikke klar → uendret kall.
 */
export async function aiRun53(run, task, o = {}) {
  if (o.localOnly || typeof o.prompt !== 'string' || !on53('dal_redact53', o.user) || !ready53('redact')) return run(task, o);
  const red = await redactParts53([o.prompt], { timeoutMs: 3000 }).catch(() => null);
  if (!red?.count) return run(task, o);
  const sys = o.system;
  const note = (x) => (typeof x === 'string' && x ? `${x}\n\n${PLACEHOLDER_NOTE53}` : x);
  const out = await run(task, { ...o, prompt: red.parts[0], system: typeof sys === 'function' ? (p) => note(sys(p)) : note(sys) });
  console.info(`[dal53] redact: ${red.count} personopplysninger byttet med plassholdere i ${task}`);
  return out && typeof out.text === 'string' ? { ...out, text: red.restore(out.text), redacted53: { count: red.count, labels: red.labels } } : out;
}

// Nettsøk: navn beholdes (å søke etter en person eller et firma er ofte selve poenget); kontakt- og id-opplysninger fjernes.
const WEB_LABELS53 = ['EMAIL', 'PHONE', 'CREDIT_CARD', 'BANK_ACCOUNT', 'ROUTING_NUMBER', 'IP_ADDRESS', 'GOVERNMENT_ID', 'PASSPORT', 'DRIVERS_LICENSE', 'TAX_ID', 'SSN', 'IMEI', 'BUILDING_NUMBER', 'SECONDARY_ADDRESS'];
/** Søkeordene før de går ut av huset. → {query, removed} */
export async function cleanWebQuery53(query) {
  const q = String(query ?? '');
  if (!q.trim() || !on53('dal_redact53') || !ready53('redact')) return { query: q, removed: 0 };
  const r = await redactParts53([q], { labels: WEB_LABELS53, timeoutMs: 1500 }).catch(() => null);
  if (!r || !r.count) return { query: q, removed: 0 };
  const cleaned = r.parts[0].replace(new RegExp(PH_RE.source, 'g'), ' ').replace(/\s+/g, ' ').trim();
  return { query: cleaned || q, removed: r.count };
}

/** webSearch med rensede søkeord (samme svar som webSearch). */
export async function webSearch53(webSearch, query, opts) {
  const c = await cleanWebQuery53(query);
  if (c.removed) console.info(`[dal53] nettsøk: ${c.removed} personopplysninger fjernet fra søkeordene`);
  return webSearch(c.query, opts);
}

/* ---------------- Tongue ---------------- */

const LANG_NB = { en: 'engelsk', sv: 'svensk', da: 'dansk', de: 'tysk', fr: 'fransk', es: 'spansk', it: 'italiensk', pt: 'portugisisk', nl: 'nederlandsk', pl: 'polsk', fi: 'finsk', is: 'islandsk',
  uk: 'ukrainsk', ru: 'russisk', ar: 'arabisk', fa: 'persisk', ur: 'urdu', tr: 'tyrkisk', so: 'somali', ti: 'tigrinja', lt: 'litauisk', lv: 'latvisk', et: 'estisk', ro: 'rumensk', hu: 'ungarsk', cs: 'tsjekkisk',
  sk: 'slovakisk', hr: 'kroatisk', sr: 'serbisk', bg: 'bulgarsk', el: 'gresk', zh: 'kinesisk', ja: 'japansk', ko: 'koreansk', th: 'thai', vi: 'vietnamesisk', hi: 'hindi', tl: 'tagalog' };
export const langName53 = (code) => LANG_NB[code] ?? (() => { try { return new Intl.DisplayNames(['nb'], { type: 'language' }).of(code) ?? code; } catch { return code; } })();
const NORDIC = new Set(['da', 'sv']);

/**
 * Språket i teksten. → {language, reliability, sure:bool} | null (ikke klar/flagget av). «no» = norsk (Tongue skiller ikke nb/nn).
 * sure: trygt nok til å bytte svarspråk. Dansk/svensk krever «confident», minst 20 tegn og at norsk ikke er nest mest sannsynlig
 * (korte norske setninger forveksles lett).
 */
export function detectLang53(text) {
  const t = String(text ?? '').trim();
  if (!t || !on53('dal_tongue53')) return null;
  const tg = ready53('tongue');
  if (!tg) return null;
  try {
    const d = tg.detect(t.slice(0, 600), 3);
    if (!d?.language) return null;
    const second = d.candidates?.[1]?.language;
    let sure = (d.reliability === 'confident' || d.reliability === 'likely') && !d.isTooCloseToCall && t.length >= 8;
    if (NORDIC.has(d.language)) sure = sure && d.reliability === 'confident' && t.length >= 20 && second !== 'no';
    return { language: d.language, reliability: d.reliability, sure };
  } catch { return null; }
}

/** Systemnotat for svarspråket, eller '' (usikker → systeminstruksens standard, norsk). */
export function langNote53(text) {
  const d = detectLang53(text);
  if (!d?.sure) return '';
  if (d.language === 'no') return 'Brukerens siste melding er på norsk: svar på norsk (bokmål, eller nynorsk hvis brukeren skrev nynorsk).';
  const n = langName53(d.language);
  return `Brukerens siste melding er på ${n}. Svar på ${n} (samme språk som brukeren), med mindre brukeren ber om et annet språk.`;
}

/* ---------------- Emo ---------------- */

// Reserve (og påfyll når Emo ikke har noe): norske nøkkelord → emoji. Bare forslag.
const EMO_RULES53 = [
  [/\b(regning|betal|faktura|skatt|bank|penger|lån|budsjett)/i, '💰'], [/\b(handle|butikk|kjøp|matbutikk|rema|kiwi|meny|coop)/i, '🛒'],
  [/\b(lege|tannlege|sykehus|medisin|vaksine|resept)/i, '🩺'], [/\b(trening|løp|jogg|gym|treningssenter|fotball|ski)/i, '🏃'],
  [/\b(bursdag|fødselsdag|kake|feiring|fest)/i, '🎂'], [/\b(møte|jobb|kontor|prosjekt|presentasjon)/i, '💼'], [/\b(skole|lekse|prøve|eksamen|foreldremøte)/i, '📚'],
  [/\b(fly|reise|ferie|hotell|tog|pass)/i, '✈️'], [/\b(bil|service|eu-kontroll|dekk|verksted|vask bil)/i, '🚗'], [/\b(middag|lunsj|frokost|lag mat|oppskrift|pizza|taco)/i, '🍽️'],
  [/\b(rydd|vask|støvsug|klesvask|oppvask)/i, '🧹'], [/\b(ring|telefon|samtale)/i, '📞'], [/\b(e-post|mail|epost|svar på)/i, '✉️'], [/\b(pakke|post|hente|levere)/i, '📦'],
  [/\b(hund|katt|veterinær|dyr)/i, '🐾'], [/\b(hage|plante|blomst|gress|klipp)/i, '🌱'], [/\b(frisør|klipp håret)/i, '💇'], [/\b(kino|film|konsert|teater)/i, '🎬'],
];
export function ruleEmoji53(text) {
  const t = String(text ?? '');
  return EMO_RULES53.filter(([re]) => re.test(t)).map(([, e]) => ({ emoji: e, confidence: 0.4 }));
}

/** → {suggestions:[{emoji, confidence}], engine:'emo'|'regler', language} */
export async function suggestEmoji53(text, { limit = 3, user = undefined } = {}) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const n = Math.max(1, Math.min(8, Number(limit) || 3));
  const language = detectLang53(t)?.language ?? null;
  if (!t) return { suggestions: [], engine: 'regler', language };
  const fromEmo = on53('dal_emo53', user) ? await use53('emo', (e) => e.suggestions(t, { limit: n }), { timeoutMs: 1500 }) : null;
  if (Array.isArray(fromEmo) && fromEmo.length) {
    const s = fromEmo.filter((x) => x && typeof x.emoji === 'string').map((x) => ({ emoji: x.emoji, confidence: Math.round(Number(x.confidence) * 1000) / 1000 }));
    // Norsk er ikke blant språkene Emo er trent på: fyll på med reglene når modellen er usikker.
    if (language === 'no' && (s[0]?.confidence ?? 0) < 0.3) for (const r of ruleEmoji53(t)) if (!s.some((x) => x.emoji === r.emoji)) s.push(r);
    return { suggestions: s.slice(0, n), engine: 'emo', language };
  }
  return { suggestions: ruleEmoji53(t).slice(0, n), engine: 'regler', language };
}
