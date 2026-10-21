// AI-utlesing av kvitteringer. Felles prompt og skjema for Ollama (lokalt) og Gemini (sky).
// Svaret valideres; ugyldig svar gir ett nytt forsøk før bilaget markeres for manuell utfylling.
import { settings, secret, db, me, addUserCol } from './db.js';
import { geminiFetch, hasGemini, usableKeys } from './gemini-keys.js';
import { cleanBbox } from './bbox30.js';
import { shortBody } from '../ollama-opts.js';
import { gateChat } from '../ollama-gate.js'; // prompt 43: alle Ollama-kall via gaten
import { modelFor, routing as aiRouting, budgetState } from '../ai-run.js';
// Prompt 34: finans-oppgavene → oppgavene i AI-kontroll-rutingen.
const AI_TASK_OF = { search: 'fsok', categorize: 'kat', receipts: 'rc', barcode: 'bar', text: 'sok', test: 'sok', summary: 'fsok', mat: 'sok', rss: 'sok', finn: 'fsok' };
import { ocrEnabled, ocrReceipt, cropImage, decodeBarcodes, ocrTools } from '../ocr-fallback.js';
import { RULES39, normalizeLines39, extras39, verify39 } from './receipts39.js'; // prompt 39: varelinjer og sumkontroll

export const PROMPT = (cats) => `Du leser en norsk kvittering. Returner KUN JSON etter skjemaet.
- Beløp i kroner som tall med punktum som desimalskille (386.50).
- Dato i ISO-format (YYYY-MM-DD). Hvis året mangler, bruk ${new Date().getFullYear()}.
- vat: summer per sats (25, 15, 12, 0) hvis oppgitt.
- Foreslå kategori fra listen: ${cats.join(', ')}.
- Sett confidence (0–1) per felt (merchant, date, total). Gjett ikke: ukjent felt = null.
- Ta aldri med fullt kortnummer, bare de fire siste sifrene i card_last4.
- lines: hver varelinje med description, amount og bbox = [x, y, bredde, høyde] i prosent (0–100) av bildet, målt fra øvre venstre hjørne, rundt hele linjen (tekst og pris). bbox = null hvis du ikke ser bildet eller er usikker.
- lines har også name, nameRaw, qty, unitPrice, discount og vatRate. discounts = [{text, amount}], pant = pantebeløp.${RULES39}${cats?.feedback ? `\n\nTILBAKEMELDING: ${cats.feedback}` : ''}`;

const num = { type: 'number', nullable: true };
const str = { type: 'string', nullable: true };
// JSON-skjema (Ollama `format`). Gemini bruker samme struktur med OpenAPI-typer.
export const SCHEMA = {
  type: 'object',
  properties: {
    merchant: str, org_number: str, date: str, total: num, currency: { type: 'string' },
    vat: { type: 'array', items: { type: 'object', properties: { rate: { type: 'integer' }, amount: { type: 'number' } }, required: ['rate', 'amount'] } },
    // Prompt 30: bbox per linje i prosent av bildet ([x, y, w, h]) for markering av søketreff i kvitteringen.
    lines: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, name: str, nameRaw: str, quantity: num, qty: num, unitPrice: num, discount: num, vatRate: num, amount: { type: 'number' }, bbox: { type: 'array', items: { type: 'number' }, nullable: true } }, required: ['description', 'amount'] } },
    // Prompt 39: rabatter, pant, kvitteringsnummer og klokkeslett.
    discounts: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, amount: { type: 'number' } }, required: ['text', 'amount'] } }, pant: num, receipt_no: str, time: str,
    payment_method: str, card_last4: str, suggested_category: str,
    confidence: { type: 'object', properties: { merchant: { type: 'number' }, date: { type: 'number' }, total: { type: 'number' } } },
  },
  required: ['merchant', 'date', 'total', 'confidence'],
};

// Ollama tåler ikke `nullable`; fjern det og bruk ["x","null"] i stedet.
function forOllama(s) {
  if (Array.isArray(s)) return s.map(forOllama);
  if (!s || typeof s !== 'object') return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) if (k !== 'nullable') o[k] = forOllama(v);
  if (s.nullable) o.type = [s.type, 'null'];
  return o;
}
function forGemini(s) {
  if (Array.isArray(s)) return s.map(forGemini);
  if (!s || typeof s !== 'object') return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) o[k] = k === 'type' ? String(v).toUpperCase() : forGemini(v);
  return o;
}

export function validate(x) {
  if (!x || typeof x !== 'object') throw new Error('Svaret er ikke et objekt');
  const out = {
    merchant: typeof x.merchant === 'string' ? x.merchant.trim().slice(0, 120) || null : null,
    org_number: typeof x.org_number === 'string' ? x.org_number.replace(/\D/g, '').slice(0, 9) || null : null,
    date: typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null,
    total: Number.isFinite(+x.total) && x.total !== null ? Math.round(+x.total * 100) / 100 : null,
    currency: typeof x.currency === 'string' ? x.currency.slice(0, 3).toUpperCase() : 'NOK',
    vat: Array.isArray(x.vat) ? x.vat.filter((v) => Number.isFinite(+v.rate) && Number.isFinite(+v.amount)).map((v) => ({ rate: +v.rate, amount: +v.amount })) : [],
    // text/price godtas som alias for description/amount (prompt 30), bbox beholdes når den er gyldig.
    lines: Array.isArray(x.lines) ? x.lines.map((l) => (l && l.amount == null && l.price != null ? { ...l, amount: l.price } : l)).filter((l) => l && l.amount !== null && Number.isFinite(+l.amount)).slice(0, 80).map((l) => {
      const bbox = cleanBbox(l.bbox);
      return { description: String(l.description ?? l.text ?? '').slice(0, 120), quantity: Number.isFinite(+l.quantity) && l.quantity !== null ? +l.quantity : null, amount: +l.amount, ...(bbox ? { bbox } : {}) };
    }) : [],
    payment_method: typeof x.payment_method === 'string' ? x.payment_method.slice(0, 20) : null,
    card_last4: typeof x.card_last4 === 'string' && /^\d{4}$/.test(x.card_last4.slice(-4)) ? x.card_last4.slice(-4) : null,
    suggested_category: typeof x.suggested_category === 'string' ? x.suggested_category.slice(0, 60) : null,
    confidence: {},
  };
  // Prompt 39: name/nameRaw/qty/unitPrice/discount/vatRate per linje + discounts, pant, receipt_no, time.
  out.lines = normalizeLines39(x, out.lines);
  Object.assign(out, extras39(x));
  for (const k of ['merchant', 'date', 'total']) {
    const v = +(x.confidence?.[k]);
    out.confidence[k] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }
  if (out.total === null && !out.merchant) throw new Error('Fant verken butikk eller total');
  return out;
}

/* ---------------- Felles: motorer, reserve og «nede»-vakt ---------------- */

export const ENGINES = ['ollama', 'gemini', 'groq'];
export const providerName = (p) => ({ gemini: 'Gemini', groq: 'Groq', ollama: 'Ollama', tesseract: 'Lokal OCR', roboflow: 'Roboflow' }[p] ?? 'Ollama');
export const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b'];
export const ROBOFLOW_WORKSPACE = 'sebastians-workspace-y3jnc';

/* ---------------- «Hvem gjør hva»: motor per oppgave ---------------- */

// Oppgavene og standardmotoren. Lagres som settings.aiTasks = { receipts:'gemini', … }. Strekkoder leses av Roboflow/zbar.
export const TASKS = {
  receipts: { name: 'Les kvitteringer', engine: 'gemini' },
  search: { name: 'AI-søk', engine: 'groq' },
  categorize: { name: 'Kategorisering', engine: 'groq' },
  barcode: { name: 'Strekkoder', engine: 'roboflow' },
};
/* ---------------- Tidsgrenser (prompt 23) ---------------- */
// settings.aiTimeouts = { gemini, groq, roboflow, ollama (sekunder, 5–120), retries (0–3), onTimeout: 'next' | 'ocr' | 'queue' }.
// Hvert kall avbrytes med AbortSignal.timeout per motor. Ved tidsavbrudd: nye forsøk med 1 s, 2 s, 4 s ventetid, deretter
// onTimeout: next = neste Gemini-nøkkel, så Groq, så Ollama, så lokal OCR; ocr = lokal OCR med en gang; queue = tilbake i køen.
export const TIMEOUT_STEPS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
export const ON_TIMEOUT = ['next', 'ocr', 'queue'];
const envOllama = Number(process.env.OLLAMA_TIMEOUT);
export const AI_TIMEOUT_DEFAULTS = { gemini: 20, groq: 15, roboflow: 15, ollama: Number.isFinite(envOllama) && envOllama >= 5 ? Math.min(120, Math.round(envOllama)) : 45, retries: 0, onTimeout: 'next' };
const TIMEOUT_ENGINES = ['gemini', 'groq', 'roboflow', 'ollama'];
/** Validerer (og fletter inn i base): sekunder 5–120 (heltall), retries 0–3, onTimeout fra listen. Ugyldige verdier beholder base. */
export function cleanAiTimeouts(v, base = AI_TIMEOUT_DEFAULTS) {
  const out = { ...AI_TIMEOUT_DEFAULTS, ...(base ?? {}) };
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const k of TIMEOUT_ENGINES) if (v[k] !== undefined && v[k] !== null && Number.isFinite(+v[k])) out[k] = Math.min(120, Math.max(5, Math.round(+v[k])));
  if (v.retries !== undefined && Number.isFinite(+v.retries)) out.retries = Math.min(3, Math.max(0, Math.round(+v.retries)));
  const ot = v.onTimeout ?? v.on_timeout;
  if (ON_TIMEOUT.includes(ot)) out.onTimeout = ot;
  return out;
}
export const aiTimeoutsOf = (st = settings()) => cleanAiTimeouts(st.aiTimeouts, AI_TIMEOUT_DEFAULTS);
// Tester: scale < 1 gjør tidsgrensene og ventetidene kortere (1 s → scale·1000 ms).
export const _aiTest = { scale: 1 };
const engineMs = (p, st) => aiTimeoutsOf(st)[p] * 1000 * _aiTest.scale;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const engineLabel = (p, keyLabel) => (p === 'gemini' && keyLabel ? `Gemini (${keyLabel})` : providerName(p));
/** «✦ Gemini svarte ikke innen 20 s · prøver Groq …» */
export const timeoutText = (p, secs, then) => `✦ ${providerName(p)} svarte ikke innen ${secs} s${then ? ` · ${then}` : ''}`;
// Rekkefølgen etter et tidsavbrudd med «neste motor»: de som gjenstår i ordren, så alle andre som er satt opp (Gemini → Groq → Ollama).
// Uten reserve («hold alt lokalt») legges ingen nye motorer til; da gjelder bare resten av ordren og lokal OCR.
const CHAIN = ['gemini', 'groq', 'ollama'];
const nextChain = (order, st = settings()) => [...order, ...(st.fallback ? CHAIN.filter((p) => configured(p)) : [])].filter((p, i, a) => a.indexOf(p) === i).sort((a, b) => CHAIN.indexOf(a) - CHAIN.indexOf(b));
// Etter et tidsavbrudd: resten av listen byttes ut med kjeden (Gemini → Groq → Ollama) uten motorene som allerede er prøvd.
const afterTimeout = (list, idx, st) => { const tried = list.slice(0, idx + 1); list.splice(idx + 1, Infinity, ...nextChain(list.slice(idx + 1), st).filter((x) => !tried.includes(x))); };

/**
 * Kjører call(ms, startKey) for motoren p med tidsgrense, nye forsøk ved tidsavbrudd (1 s, 2 s, 4 s) og, for Gemini med
 * onTimeout=next, neste nøkkel. status(text, {timeoutEngine}) får hver hendelse. Feilen etter siste forsøk har timeout=true.
 */
async function runEngine(p, st, call, { status = () => {}, onTimeout, task = 'receipts', signal = null } = {}) {
  const t = aiTimeoutsOf(st), mode = onTimeout ?? t.onTimeout;
  let startKey = null;
  for (;;) {
    let err;
    for (let i = 0; ; i++) {
      if (signal?.aborted) throw cancelled();
      const t0 = Date.now();
      try { return await call(engineMs(p, st), startKey); } catch (e) {
        if (signal?.aborted) throw cancelled();
        if (!e.timeout) throw e;
        const elapsed = (Date.now() - t0) / 1000;
        Object.assign(e, { timeoutEngine: p, timeoutSecs: t[p], elapsedS: Math.round(elapsed * 10) / 10, limitText: `${providerName(p)} svarte ikke innen ${t[p]} s` });
        // Prompt 25: hvilket lag som kuttet. Her er det kallet fra serveren til motoren (layer = motoren selv).
        console.warn(`[ai] tidsavbrudd engine=${p} limit_s=${t[p]} elapsed_s=${e.elapsedS} layer=${p} task=${task}`);
        if (i >= t.retries) { err = e; break; }
        const wait = 1000 * 2 ** i;
        status(timeoutText(p, t[p], `nytt forsøk om ${wait / 1000} s …`), { timeoutEngine: p });
        await sleep(wait * _aiTest.scale);
      }
    }
    if (p !== 'gemini' || mode !== 'next') throw err;
    // Gemini: neste nøkkel etter den som ikke svarte.
    const keys = usableKeys(), at = Math.max(0, keys.findIndex((k) => k.id === (err.keyId ?? startKey ?? keys[0]?.id)));
    const next = keys[at + 1];
    if (!next) throw err;
    logAi({ task, engine: 'gemini', model: null, ms: t.gemini * 1000, status: 'tidsavbrudd', error: `Nøkkel «${keys[at]?.label ?? '?'}» svarte ikke innen ${t.gemini} s`, timeoutEngine: 'gemini' });
    status(timeoutText('gemini', t.gemini, `prøver ${engineLabel('gemini', next.label)} …`), { timeoutEngine: 'gemini' });
    startKey = next.id;
  }
}

// Prompt 25: avbrutt av brukeren (Avbryt i AI-søket). Telles ikke som tidsavbrudd, og motoren merkes ikke som nede.
export class AiCancelled extends Error { constructor(msg = 'Avbrutt') { super(msg); this.cancelled = true; this.name = 'AiCancelled'; } }
const cancelled = () => new AiCancelled();
// Tidsgrense per motor kombinert med brukerens avbryt-signal.
const withSignal = (ms, signal) => (signal ? AbortSignal.any([AbortSignal.timeout(ms), signal]) : AbortSignal.timeout(ms));

/** Prompt 25: grensene klientene skal bruke. clientTimeoutS = maks(motor) × (forsøk + 1) + 10. */
export function aiLimits(st = settings()) {
  const t = aiTimeoutsOf(st);
  const engines = { gemini: t.gemini, groq: t.groq, ollama: t.ollama, roboflow: t.roboflow };
  return { engines, retries: t.retries, onTimeout: t.onTimeout, clientTimeoutS: Math.max(...Object.values(engines)) * (t.retries + 1) + 10, jobAfterS: 4 };
}

export const taskEngines = (st = settings()) => Object.fromEntries(Object.entries(TASKS).map(([k, t]) => [k, st.aiTasks?.[k] ?? t.engine]));

/* ---------------- ai_log: hvert kall, så feil kan feilsøkes ---------------- */

db.exec(`CREATE TABLE IF NOT EXISTS ai_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, task TEXT, engine TEXT, model TEXT,
  prompt_len INTEGER, ms INTEGER, status TEXT, error TEXT)`);
if (!db.prepare('PRAGMA table_info(ai_log)').all().some((c) => c.name === 'timeout_engine')) db.exec('ALTER TABLE ai_log ADD COLUMN timeout_engine TEXT'); // prompt 23
// Prompt 25: grensen som gjaldt (limit_s) og laget som kuttet (layer: ollama/gemini/groq = kallet til motoren, worker = jobben).
for (const [col, def] of [['limit_s', 'INTEGER'], ['layer', 'TEXT']]) if (!db.prepare('PRAGMA table_info(ai_log)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE ai_log ADD COLUMN ${col} ${def}`);
// ISO2: loggen er per bruker (AI-motorene er felles serveroppsett, men kallene og svarene hører til brukeren som gjorde dem).
addUserCol('ai_log');
const insLog = db.prepare('INSERT INTO ai_log(ts,task,engine,model,prompt_len,ms,status,error,timeout_engine,limit_s,layer,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
let logCount = 0;
export function logAi({ task = 'text', engine, model = null, promptLen = 0, ms = 0, status = 'ok', error = null, timeoutEngine = null, limitS = null, layer = null }) {
  try {
    const lim = limitS ?? (TIMEOUT_ENGINES.includes(engine) ? aiTimeoutsOf()[engine] : null);
    insLog.run(Date.now(), task, engine, model, promptLen, Math.round(ms), status, error ? String(error).slice(0, 500) : null, timeoutEngine, lim, layer ?? (timeoutEngine ? timeoutEngine : null), me());
    if (++logCount % 200 === 0) db.prepare('DELETE FROM ai_log WHERE id <= (SELECT max(id) - 2000 FROM ai_log)').run();
  } catch (e) { console.warn('[ai] logg', e.message); }
}
export const aiLog = (limit = 50, u = me()) => db.prepare('SELECT ts, task, engine, model, prompt_len AS promptLen, ms, round(ms / 100.0) / 10.0 AS elapsedS, limit_s AS limitS, layer, status, error, timeout_engine AS timeoutEngine FROM ai_log WHERE user_id=? ORDER BY id DESC LIMIT ?').all(u, Math.min(500, Math.max(1, limit)));
export const GEMINI_DEFAULT = 'gemini-flash-latest';
export const GROQ_DEFAULT = 'llama-3.3-70b-versatile';
export const GROQ_VISION_DEFAULT = 'meta-llama/llama-4-scout-17b-16e-instruct';
const configured = (p) => (p === 'gemini' ? hasGemini() : p === 'groq' ? !!secret('groqKey') : true);

// En motor som ikke svarte (nettverk/tidsavbrudd) hoppes over i 3 minutter, så ett kall ikke venter på samme tidsavbrudd igjen og igjen.
const downUntil = {};
const isDown = (p) => (downUntil[p] ?? 0) > Date.now();
const markDown = (p, e) => { if (e?.net) downUntil[p] = Date.now() + 3 * 60_000; };
export const _resetAi = () => { for (const k of Object.keys(downUntil)) delete downUntil[k]; for (const k of Object.keys(geminiResolved)) delete geminiResolved[k]; ollamaProbe.at = 0; };

// Rekkefølge: motoren for oppgaven (eller valgt motor) først, deretter de andre som er satt opp (når reserve er på).
// force = bare den motoren. Uten reserve («hold alt lokalt») brukes standardmotorene per oppgave ikke; da gjelder bare valgt motor,
// med mindre brukeren selv har valgt motor for oppgaven.
export function engineOrder(st = settings(), { force = null, skipDown = true, task = null } = {}) {
  if (force) return [force];
  const main = ENGINES.includes(st.provider) ? st.provider : 'ollama';
  const pick = task ? (st.aiTasks?.[task] ?? (st.fallback ? TASKS[task]?.engine : null)) : null;
  const first = ENGINES.includes(pick) && configured(pick) ? pick : main;
  const rest = st.fallback ? [main, ...ENGINES].filter((p, i, a) => p !== first && a.indexOf(p) === i && configured(p)) : [];
  const all = [first, ...rest];
  const live = skipDown ? all.filter((p) => !isDown(p)) : all;
  return live.length ? live : all;
}

// Nettverksfeil («fetch failed») sier lite; ta med årsaken (ECONNREFUSED, tidsavbrudd …).
const netErr = (name, url, e) => {
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return Object.assign(new Error(`${name} svarte ikke innen tidsfristen`), { noRetry: true, net: true, timeout: true });
  const code = e.cause?.code || e.cause?.message || e.message;
  return Object.assign(new Error(`${name} kan ikke nås${url ? ` på ${url}` : ''} (${code})`), { noRetry: true, net: true });
};
// Feilmeldingen fra API-et (Gemini: error.message, Ollama: error, Groq: error.message) i stedet for bare statuskoden.
async function httpErr(name, res) {
  let detail = '';
  try { const t = await res.text(); try { const j = JSON.parse(t); detail = j.error?.message ?? j.error ?? t; } catch { detail = t; } } catch { /* tomt svar */ }
  detail = String(typeof detail === 'string' ? detail : JSON.stringify(detail)).replace(/\s+/g, ' ').trim().slice(0, 200);
  return Object.assign(new Error(`${name} svarte ${res.status}${detail ? `: ${detail}` : ''}`), { noRetry: res.status >= 400 && res.status < 500, status: res.status, detail });
}
const parseJson = (name, text) => {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { throw new Error(`${name} svarte ikke med gyldig JSON`); }
};

// Skjema: Gemini vil ha OBJECT/STRING, Ollama og Groq vanlig JSON Schema (små bokstaver, ["x","null"]).
const lowerTypes = (s) => {
  if (Array.isArray(s)) return s.map(lowerTypes);
  if (!s || typeof s !== 'object') return s;
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : lowerTypes(v)]));
};

/* ---------------- Ollama ---------------- */

// Er Ollama på nettet? En rask sjekk (2,5 s, husket i 60 s), så en adresse som ikke finnes ikke gir 120 s venting.
const ollamaProbe = { at: 0, ok: true, err: null };
async function ollamaReachable(base) {
  if (Date.now() - ollamaProbe.at < 60_000) return ollamaProbe;
  try { const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) }); Object.assign(ollamaProbe, { at: Date.now(), ok: r.ok, err: r.ok ? null : `svarte ${r.status}` }); }
  catch (e) { Object.assign(ollamaProbe, { at: Date.now(), ok: false, err: netErr('Ollama', base, e).message }); }
  return ollamaProbe;
}
// Prompt 25: Ollama strømmer (stream: true). Tidsgrensen gjelder tid uten nye tokens (første token inkludert, som også dekker
// innlasting av modellen), ikke total tid. keep_alive: 10m holder modellen i minnet mellom søkene. Et svar som strømmer i det
// uendelige stoppes etter OLLAMA_MAX_TOTAL (10 min).
const OLLAMA_MAX_TOTAL = 10 * 60_000;
export const OLLAMA_KEEP_ALIVE = '10m';
// Prompt 43: via Ollama-gaten (kø, gruppering per modell, keep_alive per modell, strømming). Tidsgrensen her er fortsatt «tid uten
// nye tokens (første token inkludert)» fra Innstillinger → AI → Tidsgrenser; tidsavbrudd gir ikke nye forsøk i gaten (motorkjeden
// har egen reserve), men «modellen ble lastet ut», 5xx og ECONNRESET prøves på nytt (maks 2).
async function ollamaChat(st, messages, schema, { timeout, temperature, model, signal = null, priority = null }) {
  const useModel = model || st.ollamaModel;
  const base = st.ollamaUrl.replace(/\/$/, '');
  const probe = await ollamaReachable(base);
  if (!probe.ok) throw Object.assign(new Error(probe.err ?? `Ollama kan ikke nås på ${base}`), { noRetry: true, net: true });
  if (signal?.aborted) throw cancelled();
  const image = messages.some((m) => m.images?.length);
  const body = shortBody({ model: useModel, format: forOllama(lowerTypes(schema)), options: { temperature }, messages });
  try {
    const out = await gateChat({ model: useModel, body, base, signal, priority: priority ?? (image ? 'background' : 'interactive'), short: true, allowThink: !('think' in body), image,
      loadMs: timeout, warmMs: timeout, idleMs: timeout, deadlineMs: Math.max(timeout, OLLAMA_MAX_TOTAL), retryTimeouts: false, label: image ? 'Finans · kvittering' : 'Finans · spør' });
    return { model: useModel, data: parseJson('Ollama', out.text) };
  } catch (e) {
    if (signal?.aborted || e?.kind === 'cancelled') throw cancelled();
    if (e?.timeout || e?.kind === 'load_timeout' || e?.kind === 'idle_timeout') throw Object.assign(new Error('Ollama svarte ikke innen tidsfristen'), { noRetry: true, net: true, timeout: true });
    if (e?.kind === 'nocontact') { ollamaProbe.at = 0; throw Object.assign(new Error(e.message), { noRetry: true, net: true }); }
    if (e?.kind === 'http' || e?.kind === 'memory') throw Object.assign(new Error(`Ollama svarte ${e.status}${e.ollamaError ? `: ${e.ollamaError}` : ''}`), { noRetry: e.status >= 400 && e.status < 500, status: e.status, detail: e.ollamaError ?? '' });
    if (e?.kind === 'unloaded') throw Object.assign(new Error('Ollama svarte: modellen ble lastet ut underveis'), { noRetry: true });
    throw e;
  }
}

/* ---------------- Gemini ---------------- */

// Google slår av gamle modeller (gemini-1.5 og 2.0 er borte, 2.5 følger etter). Svarer en modell 404, slår vi opp
// hvilke modeller nøkkelen har tilgang til og bruker den nyeste «flash»-modellen i stedet. Valget huskes til omstart.
const geminiResolved = {};
const noThinking = new Set();
async function listGemini(key) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw await httpErr('Gemini', res);
  return ((await res.json()).models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => String(m.name).replace(/^models\//, ''));
}
export function pickGemini(names, want = '') {
  if (names.includes(want)) return want;
  const ver = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? +m[1] : 0; };
  const bad = /(image|tts|live|audio|embedding|vision|aqa|learnlm|gemma|computer|robotics|exp)/;
  const pool = names.filter((n) => n.startsWith('gemini') && !bad.test(n));
  const rank = (n) => (n === GEMINI_DEFAULT ? 1000 : 0) + ver(n) * 10 + (/flash/.test(n) ? 5 : 0) - (/lite/.test(n) ? 3 : 0) - (/preview/.test(n) ? 2 : 0);
  return pool.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}
async function geminiGenerate(parts, { schema, timeout, temperature, model, startKey = null, signal = null }) {
  if (!hasGemini()) throw Object.assign(new Error('Gemini-nøkkel mangler (Innstillinger → AI-motor)'), { noRetry: true });
  const want = model || GEMINI_DEFAULT;
  let m = geminiResolved[want] ?? want;
  for (let round = 0; round < 3; round++) {
    // 2.5-flash og nyere «tenker» før svaret; for korte JSON-oppgaver gjør det bare kallet tregt (og ga tidsavbrudd i AI-søket).
    const think = /flash/.test(m) && !noThinking.has(m) ? { thinkingConfig: { thinkingBudget: 0 } } : {};
    let res;
    // geminiFetch prøver reservenøklene når en nøkkel har brukt opp kvoten (429) eller er ugyldig.
    try { res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: withSignal(timeout, signal), startKey,
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, responseMimeType: 'application/json', ...(schema ? { responseSchema: forGemini(schema) } : {}), ...think } }),
    }); } catch (e) { throw Object.assign(netErr('Gemini', null, e), { keyId: e.geminiKeyId ?? startKey }); }
    if (res.ok) {
      const d = await res.json();
      const text = d.candidates?.[0]?.content?.parts?.filter((x) => !x.thought).map((x) => x.text ?? '').join('') ?? '';
      if (!text) throw new Error(`Gemini ga tomt svar${d.candidates?.[0]?.finishReason ? ` (${d.candidates[0].finishReason})` : d.promptFeedback?.blockReason ? ` (${d.promptFeedback.blockReason})` : ''}`);
      return { model: m, data: parseJson('Gemini', text) };
    }
    const err = await httpErr('Gemini', res);
    if (res.status === 400 && /think/i.test(err.detail ?? '') && think.thinkingConfig) { noThinking.add(m); continue; }
    if (res.status === 404 || (res.status === 400 && /not (?:found|supported)|is not available|deprecated|retired/i.test(err.detail ?? ''))) {
      let names = [];
      try { names = await listGemini(usableKeys()[0]?.key); } catch { /* bruk feilen under */ }
      const next = pickGemini(names.filter((n) => n !== m), want);
      if (next && next !== m) { console.warn(`[ai] Gemini-modellen «${m}» finnes ikke lenger, bruker «${next}»`); geminiResolved[want] = next; m = next; continue; }
      throw Object.assign(new Error(`Gemini-modellen «${m}» finnes ikke lenger. Velg en annen modell under Innstillinger → AI-motor.`), { noRetry: true, status: 404 });
    }
    throw err;
  }
  throw new Error('Gemini svarte ikke');
}

/* ---------------- Groq (OpenAI-kompatibelt) ---------------- */

async function groqChat(content, schema, { timeout, temperature, model, signal = null }) {
  const key = secret('groqKey');
  if (!key) throw Object.assign(new Error('Groq-nøkkel mangler (Innstillinger → AI-motor)'), { noRetry: true });
  const sys = `Svar KUN med ett JSON-objekt, uten forklaring. Det skal følge dette JSON-skjemaet:\n${JSON.stringify(lowerTypes(schema))}`;
  let res;
  try { res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal: withSignal(timeout, signal),
    body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content }] }),
  }); } catch (e) { throw netErr('Groq', null, e); }
  if (!res.ok) throw await httpErr('Groq', res);
  const d = await res.json();
  return { model, data: parseJson('Groq', d.choices?.[0]?.message?.content) };
}

/* ---------------- Kvitteringer (bilde → JSON) ---------------- */

async function ollama(image, mime, cats, st, ms = engineMs('ollama', st)) {
  if (mime === 'application/pdf') throw Object.assign(new Error('Ollama kan ikke lese PDF'), { noRetry: true });
  if (mime === 'image/heic' || mime === 'image/heif') throw Object.assign(new Error('Ollama kan ikke lese HEIC-bilder (bruk Gemini, eller last opp som JPEG)'), { noRetry: true });
  const model = await modelFor('rc', 'ollama', st.ollamaModel, { images: [1] }); // prompt 34: ruten «Kvitteringer (bilde)», validert
  return (await ollamaChat(st, [{ role: 'user', content: PROMPT(cats), images: [image.toString('base64')] }], SCHEMA,
    { timeout: ms, temperature: 0, model })).data;
}
async function gemini(image, mime, cats, st, ms = engineMs('gemini', st), startKey = null) {
  return (await geminiGenerate([{ inline_data: { mime_type: mime, data: image.toString('base64') } }, { text: PROMPT(cats) }], { schema: SCHEMA, timeout: ms, temperature: 0, model: st.geminiModel, startKey })).data;
}
async function groq(image, mime, cats, st, ms = engineMs('groq', st)) {
  if (!/^image\/(jpe?g|png|webp|gif)$/.test(mime)) throw Object.assign(new Error('Groq kan bare lese JPEG, PNG og WebP'), { noRetry: true });
  return (await groqChat([{ type: 'text', text: PROMPT(cats) }, { type: 'image_url', image_url: { url: `data:${mime};base64,${image.toString('base64')}` } }], SCHEMA,
    { timeout: ms, temperature: 0, model: st.groqVisionModel || GROQ_VISION_DEFAULT })).data;
}

const PROVIDERS = { ollama, gemini, groq };
const modelOf = (p, st) => (p === 'gemini' ? (geminiResolved[st.geminiModel || GEMINI_DEFAULT] ?? (st.geminiModel || GEMINI_DEFAULT)) : p === 'groq' ? (st.groqVisionModel || GROQ_VISION_DEFAULT) : st.ollamaModel);

// Leser kvitteringen med valgt motor (eller tvunget motor ved «Les på nytt»), med reserve og ett nytt forsøk.
// HEIC går rett til Gemini når nøkkelen finnes (Ollama og Groq kan ikke lese det). log(steg, detalj) får hvert forsøk.
// Feilmeldingen tar med årsaken fra hver motor, ikke bare den siste.
export async function extract(image, mime, cats, force, { log = () => {}, status = () => {}, onTimeout } = {}) {
  const st = settings();
  const mode = onTimeout ?? aiTimeoutsOf(st).onTimeout;
  let order = engineOrder(st, { force, task: 'receipts' });
  // Roboflow (valgfritt): finn kvitteringen i bildet og beskjær før AI/OCR leser den.
  if (!force && /^image\/(jpe?g|png|webp)$/.test(mime)) {
    const crop = await roboflowCrop(image, mime, st).catch((e) => { log('roboflow', `hoppet over: ${e.timeout ? `svarte ikke innen ${aiTimeoutsOf(st).roboflow} s` : e.message}`); return null; });
    if (crop) { log('roboflow', `kvitteringen funnet og beskåret (${Math.round(crop.box.confidence * 100)} %)`); image = crop.image; }
  }
  if (!force && (mime === 'image/heic' || mime === 'image/heif') && hasGemini()) order = ['gemini', ...order];
  let lastErr, timedOut = null, ocrNow = false;
  const errors = [];
  const done = (r) => (timedOut ? { ...r, timeoutEngine: timedOut.engine } : r);
  const onStatus = (text, info) => { log('tidsavbrudd', text); status(text, info); };
  const list = [...new Set(order)];
  for (let idx = 0; idx < list.length && !ocrNow; idx++) {
    const p = list[idx];
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        log('ai', `${providerName(p)} (${modelOf(p, st)})${attempt ? ', nytt forsøk' : ''}`);
        const raw = await runEngine(p, st, (ms, key) => PROVIDERS[p](image, mime, cats, st, ms, key), { status: onStatus, onTimeout: mode, task: 'receipts' });
        const data = validate(raw);
        logAi({ task: 'receipts', engine: p, model: modelOf(p, st), promptLen: image.length, ms: Date.now() - t0, status: data.confidence.total < st.minConf / 100 ? 'lav-sikkerhet' : 'ok', timeoutEngine: timedOut?.engine ?? null });
        // Lav sikkerhet hos primærmotoren: prøv reserven hvis den finnes.
        if (!force && p === order[0] && st.fallback && data.confidence.total < st.minConf / 100 && order.length > 1 && attempt === 0) {
          lastErr = new Error('Lav sikkerhet'); lastErr.partial = { provider: p, model: modelOf(p, st), data, seconds: (Date.now() - t0) / 1000 };
          break;
        }
        return done(await lowConfCheck(await sumRetry39({ provider: p, model: modelOf(p, st), data, seconds: (Date.now() - t0) / 1000 }, p, st, image, mime, cats, log, mode), image, mime, st, log));
      } catch (e) {
        lastErr = e;
        logAi({ task: 'receipts', engine: p, model: modelOf(p, st), promptLen: image.length, ms: Date.now() - t0, status: e.timeout ? 'tidsavbrudd' : 'feil', error: e.message, timeoutEngine: e.timeout ? p : null });
        markDown(p, e);
        log('ai-feil', `${providerName(p)}: ${e.message}`);
        if (e.timeout) {
          const secs = e.timeoutSecs ?? aiTimeoutsOf(st)[p];
          timedOut = { engine: p, secs };
          errors.push(`${providerName(p)}: svarte ikke innen tidsfristen (${secs} s)`);
          if (mode === 'queue' && !force) throw Object.assign(new Error(timeoutText(p, secs)), { queue: true, timeout: true, timeoutEngine: p, timeoutSecs: secs });
          if (mode === 'ocr' && !force) { ocrNow = true; onStatus(timeoutText(p, secs, 'prøver lokal OCR …'), { timeoutEngine: p }); break; }
          // Neste motor: resten av rekkefølgen, så alle andre som er satt opp (Gemini → Groq → Ollama), så lokal OCR.
          if (!force) afterTimeout(list, idx, st);
          const nx = list.slice(idx + 1).find((x) => !isDown(x)) ?? list[idx + 1];
          onStatus(timeoutText(p, secs, nx ? `prøver ${providerName(nx)} …` : !force && ocrEnabled(st) ? 'prøver lokal OCR …' : null), { timeoutEngine: p });
          break;
        }
        if (attempt === 1 || e.noRetry || /mangler|kan ikke|svarte 4/.test(e.message)) { errors.push(`${providerName(p)}: ${e.message}`); break; } // ikke vits å prøve igjen
      }
    }
  }
  if (lastErr?.partial) return done(await lowConfCheck(lastErr.partial, image, mime, st, log));
  // Alle AI-motorene feilet: lokal OCR-reserve (Tesseract) hvis den er på og installert, eller med en gang ved onTimeout=ocr.
  const why = errors.length > 1 ? errors.join(' · ') : (lastErr?.message ?? 'Ingen AI-motor tilgjengelig');
  if (!force && (ocrEnabled(st) || ocrNow)) {
    const t0 = Date.now();
    try {
      log('ocr', timedOut ? `${providerName(timedOut.engine)} svarte ikke innen ${timedOut.secs} s, prøver lokal OCR (Tesseract)` : 'AI feilet, prøver lokal OCR (Tesseract)');
      const data = validate(await ocrReceipt(image, mime));
      data.needs_review = true;
      logAi({ task: 'receipts', engine: 'tesseract', model: 'tesseract-nor', promptLen: image.length, ms: Date.now() - t0, timeoutEngine: timedOut?.engine ?? null });
      return done({ provider: 'tesseract', model: 'tesseract-nor', data, seconds: (Date.now() - t0) / 1000, aiError: why });
    } catch (e) {
      logAi({ task: 'receipts', engine: 'tesseract', model: 'tesseract-nor', promptLen: image.length, ms: Date.now() - t0, status: e.missing ? 'mangler' : 'feil', error: e.message, timeoutEngine: timedOut?.engine ?? null });
      log('ocr-feil', e.message);
      if (!e.missing) throw Object.assign(new Error(`${why} · Lokal OCR: ${e.message}`), { timeoutEngine: timedOut?.engine ?? null });
    }
  }
  if (errors.length > 1) throw Object.assign(new Error(errors.join(' · ')), { timeoutEngine: timedOut?.engine ?? null });
  if (lastErr && timedOut) lastErr.timeoutEngine = timedOut.engine;
  throw lastErr ?? new Error('Ingen AI-motor tilgjengelig');
}

// Prompt 39: sumkontroll. Summerer ikke linjene til totalen (±1 kr), leses kvitteringen én gang til med tilbakemelding.
// Feiler den igjen, beholdes det beste svaret med status «usikker».
async function sumRetry39(res, p, st, image, mime, cats, log, mode) {
  let v = verify39(res.data);
  res.data.verify = v; res.data.status = v.status;
  if (v.ok || !res.data.lines?.length || res.data.total == null || cats?.feedback) return res;
  log('kontroll', `${v.text} · leser på nytt med tilbakemelding`);
  try {
    const fb = Object.assign([...cats], { feedback: v.feedback });
    const raw = await runEngine(p, st, (ms, key) => PROVIDERS[p](image, mime, fb, st, ms, key), { status: () => {}, onTimeout: mode, task: 'receipts' });
    const data = validate(raw), v2 = verify39(data);
    if (v2.ok || Math.abs(v2.diff ?? 1e9) < Math.abs(v.diff ?? 1e9)) { data.verify = v2; data.status = v2.status; data.retried = true; log('kontroll', v2.text); return { ...res, data }; }
    log('kontroll', `fortsatt usikker: ${v2.text}`);
  } catch (e) { log('kontroll', `nytt forsøk feilet: ${e.message}`); }
  res.data.retried = true;
  return res;
}

/** Les en kvittering med lokal OCR (Tesseract) direkte, f.eks. på eldre kvitteringer som AI ikke klarte. */
export async function extractOcr(image, mime) {
  const t0 = Date.now();
  try {
    const data = validate(await ocrReceipt(image, mime));
    data.needs_review = true;
    logAi({ task: 'receipts', engine: 'tesseract', model: 'tesseract-nor', promptLen: image.length, ms: Date.now() - t0, status: 'manuell' });
    return { provider: 'tesseract', model: 'tesseract-nor', data, seconds: (Date.now() - t0) / 1000 };
  } catch (e) {
    logAi({ task: 'receipts', engine: 'tesseract', model: 'tesseract-nor', promptLen: image.length, ms: Date.now() - t0, status: e.missing ? 'mangler' : 'feil', error: e.message });
    throw e;
  }
}

// «Bruk ved lav AI-sikkerhet»: les også med lokal OCR. Er totalen lik, økes sikkerheten litt; mangler AI totalen, brukes OCR-ens.
async function lowConfCheck(res, image, mime, st, log) {
  if (!st.ocrLowConf || !ocrEnabled(st) || res.data.confidence.total >= st.minConf / 100) return res;
  const t0 = Date.now();
  try {
    const o = await ocrReceipt(image, mime);
    logAi({ task: 'receipts', engine: 'tesseract', model: 'tesseract-nor', promptLen: image.length, ms: Date.now() - t0, status: 'kontroll' });
    const d = res.data;
    const agree = o.total != null && d.total != null && Math.abs(o.total - d.total) < 0.01;
    if (agree) d.confidence.total = Math.min(0.95, Math.max(d.confidence.total, st.minConf / 100));
    else if (d.total == null && o.total != null) { d.total = o.total; d.confidence.total = o.confidence.total; }
    if (!d.org_number && o.org_number) d.org_number = o.org_number;
    log('ocr', agree ? `lokal OCR fant samme total (${o.total} kr)` : `lokal OCR fant ${o.total ?? 'ingen'} total`);
    return { ...res, ocrCheck: { total: o.total, agree } };
  } catch (e) { log('ocr-feil', e.message); return res; }
}

/* ---------------- Tekst → JSON (sammendrag, søk, Mat, RSS, Finn …) ---------------- */

// Valgt motor først, så reservene. Svarer { provider, model, data }. Feilen sier hva hver motor svarte.
// Prompt 25: ingen fast tidsgrense her lenger. Grensen per motor slås opp i Innstillinger → AI → Tidsgrenser ved hvert kall
// (timeout fra eldre kallere ignoreres). signal = brukerens Avbryt; onEngine(engine, limitS) når en motor starter;
// status(text, info) ved tidsavbrudd («✦ Ollama svarte ikke innen 60 s · prøver Groq …»).
export async function textJson(prompt, schema, { temperature = 0.2, force = null, task = 'text', status = () => {}, signal = null, onEngine = () => {} } = {}) {
  const st = settings();
  const errors = [], timeouts = [];
  let list = engineOrder(st, { force, task: TASKS[task] ? task : null });
  // Prompt 34: «Finansdata forlater aldri huset» og sky-budsjettet (0 = ingen grense) gjelder også her.
  if (!force) {
    try {
      const r = aiRouting(), t = AI_TASK_OF[task] ?? 'sok';
      const local = (r.rules.finLocal && ['fsok', 'kat', 'rc'].includes(t)) || budgetState(r).blocked;
      if (local) {
        list = list.filter((p) => p === 'ollama');
        if (!list.length) list = ['ollama'];
        status(r.rules.finLocal ? '✦ Finansdata forlater aldri huset · bruker lokal modell' : '✦ Sky-budsjettet er brukt opp · bruker lokal modell', {});
      }
    } catch { /* ruting er valgfri */ }
  }
  const limits = aiTimeoutsOf(st);
  for (let idx = 0; idx < list.length; idx++) {
    if (signal?.aborted) throw cancelled();
    const p = list[idx];
    const t0 = Date.now();
    // Prompt 34: modellen fra AI-kontroll-rutingen (validert mot /api/tags for Ollama), ellers de gamle feltene.
    const model = await modelFor(AI_TASK_OF[task] ?? 'sok', p, p === 'groq' ? (st.groqModel || GROQ_DEFAULT) : p === 'gemini' ? (st.geminiModel || GEMINI_DEFAULT) : (st.ollamaTextModel || st.ollamaModel));
    try { onEngine(p, limits[p]); } catch { /* bare visning */ }
    try {
      const r = await runEngine(p, st, (ms, startKey) => (p === 'gemini' ? geminiGenerate([{ text: prompt }], { schema, timeout: ms, temperature, model, startKey, signal })
        : p === 'groq' ? groqChat(prompt, schema, { timeout: ms, temperature, model, signal })
        : ollamaChat(st, [{ role: 'user', content: prompt }], schema, { timeout: ms, temperature, model, signal })), { status, task, onTimeout: 'next', signal });
      logAi({ task, engine: p, model: r.model, promptLen: prompt.length, ms: Date.now() - t0, timeoutEngine: timeouts[0]?.engine ?? null, layer: null });
      return { provider: providerName(p), engine: p, model: r.model, data: r.data, timeouts };
    } catch (e) {
      if (e.cancelled || signal?.aborted) { logAi({ task, engine: p, model, promptLen: prompt.length, ms: Date.now() - t0, status: 'avbrutt', error: 'Avbrutt av brukeren', layer: 'client' }); throw cancelled(); }
      logAi({ task, engine: p, model, promptLen: prompt.length, ms: Date.now() - t0, status: errKind(e), error: e.timeout ? e.limitText ?? e.message : e.message, timeoutEngine: e.timeout ? p : null, layer: e.timeout ? p : null });
      markDown(p, e); errors.push(`${providerName(p)}: ${e.timeout ? `svarte ikke innen tidsfristen (${e.timeoutSecs ?? limits[p]} s)` : e.message}`);
      if (e.timeout) timeouts.push({ engine: p, limitS: e.timeoutSecs ?? limits[p], elapsedS: e.elapsedS ?? Math.round((Date.now() - t0) / 100) / 10, text: e.limitText ?? `${providerName(p)} svarte ikke innen ${limits[p]} s` });
      // Tidsavbrudd: neste motor, også når reserve er av (gjelder ikke «Test tilkobling», som tvinger én motor).
      if (e.timeout && !force) afterTimeout(list, idx, st);
      if (e.timeout) { const nx = list[idx + 1]; status(timeoutText(p, e.timeoutSecs ?? limits[p], nx ? `prøver ${providerName(nx)} …` : 'bruker vanlig søk …'), { timeoutEngine: p, next: nx ?? null }); }
    }
  }
  const err = new Error(errors.length ? errors.join(' · ') : 'Ingen AI-motor tilgjengelig');
  err.errors = errors;
  err.timeouts = timeouts;
  throw err;
}

// Eldre navn: gir bare dataene. Kallerne har alltid en heuristisk reserve. timeout ignoreres (grensen per motor gjelder).
export async function askJson(prompt, schema, { task = 'text', signal = null } = {}) {
  return (await textJson(prompt, schema, { task, signal })).data;
}

// Hva slags feil? Brukes i ai_log og i feilmeldingen i AI-søket.
export function errKind(e) {
  const m = String(e?.message ?? '');
  if (/nøkkel mangler/i.test(m)) return 'mangler-nøkkel';
  if (e?.status === 401 || e?.status === 403 || /svarte 40[13]|API key not valid|invalid api key|permission/i.test(m)) return 'nøkkel-avvist';
  if (/tidsfristen|timeout|tidsavbrudd/i.test(m)) return 'tidsavbrudd';
  if (e?.net || /kan ikke nås/i.test(m)) return 'nett';
  if (e?.status === 404 || /modell/i.test(m)) return 'modell';
  if (e?.status === 429 || /quota|rate/i.test(m)) return 'kvote';
  return 'feil';
}

/* ---------------- Status og tilkoblingstest ---------------- */

export async function health() {
  const st = settings();
  const out = { provider: st.provider, order: engineOrder(st, { skipDown: false }), down: ENGINES.filter(isDown),
    ollama: { ok: false }, gemini: { ok: false, configured: hasGemini(), keys: usableKeys().length, model: st.geminiModel || GEMINI_DEFAULT, resolved: geminiResolved[st.geminiModel || GEMINI_DEFAULT] ?? null },
    groq: { ok: false, configured: !!secret('groqKey'), model: st.groqModel || GROQ_DEFAULT, visionModel: st.groqVisionModel || GROQ_VISION_DEFAULT },
    roboflow: { configured: !!secret('roboflowKey'), workspace: st.roboflowWorkspace || ROBOFLOW_WORKSPACE, model: roboflowModelOf(st) || null, barcodeModel: st.roboflowBarcodeModel || null, workflow: st.roboflowWorkflow || null },
    tasks: Object.entries(TASKS).map(([id, t]) => ({ id, name: t.name, engine: taskEngines(st)[id], default: t.engine })),
    groqModels: GROQ_MODELS, ocr: null };
  { const tl = await ocrTools(); out.ocr = { enabled: ocrEnabled(st), lowConf: !!st.ocrLowConf, tesseract: tl.tesseract, imagemagick: !!tl.magick, zbar: !!tl.zbar }; }
  try {
    const r = await fetch(`${st.ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const models = r.ok ? (await r.json()).models?.map((m) => m.name) ?? [] : [];
    out.ollama = { ok: r.ok, models, hasModel: models.some((m) => m === st.ollamaModel || m.startsWith(st.ollamaModel + ':')) };
  } catch (e) { out.ollama = { ok: false, error: e.cause?.code || e.name }; }
  if (out.gemini.configured) {
    try {
      const names = await listGemini(usableKeys()[0]?.key);
      const want = st.geminiModel || GEMINI_DEFAULT;
      out.gemini = { ...out.gemini, ok: true, hasModel: names.includes(want), suggested: pickGemini(names, want), models: names.filter((n) => n.startsWith('gemini')).slice(0, 40) };
    } catch (e) { out.gemini = { ...out.gemini, ok: false, error: e.message ?? e.cause?.code ?? e.name }; }
  }
  if (out.groq.configured) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${secret('groqKey')}` }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw await httpErr('Groq', r);
      const ids = ((await r.json()).data ?? []).map((m) => m.id);
      out.groq = { ...out.groq, ok: true, hasModel: ids.includes(out.groq.model), models: ids.slice(0, 40) };
    } catch (e) { out.groq = { ...out.groq, ok: false, error: e.message ?? e.cause?.code ?? e.name }; }
  }
  return out;
}

// «Test tilkobling» for én motor: et lite JSON-kall gjennom samme vei som resten av appen.
export async function testEngine(p) {
  if (!ENGINES.includes(p)) return { ok: false, message: 'Ukjent motor' };
  const t0 = Date.now();
  try {
    const r = await textJson('Svar med JSON {"ok": true, "svar": "hei"}.', { type: 'object', properties: { ok: { type: 'boolean' }, svar: { type: 'string' } }, required: ['ok'] }, { timeout: 25_000, force: p, task: 'test' });
    delete downUntil[p];
    const ms = Date.now() - t0;
    return { ok: true, engine: p, model: r.model, ms, seconds: ms / 1000, message: `${providerName(p)} svarte (${r.model}) på ${ms} ms` };
  } catch (e) { return { ok: false, engine: p, message: e.message.replace(/^\w+: /, '') }; }
}

/* ---------------- Roboflow ---------------- */

// Modell for kvitteringsdeteksjon: «prosjekt/versjon» eller «arbeidsområde/prosjekt/versjon» (arbeidsområdet trengs ikke i URL-en).
const roboflowModelOf = (st) => {
  const v = String(st.roboflowModel || st.roboflowWorkflow || '').trim().replace(/^\/+|\/+$/g, '');
  const parts = v.split('/').filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/') : '';
};

// Objektdeteksjon: https://detect.roboflow.com/<prosjekt>/<versjon>?api_key=… med base64-bildet i kroppen.
export async function roboflowDetect(image, model, { timeout = 15_000 } = {}) {
  const key = secret('roboflowKey');
  if (!key) throw Object.assign(new Error('Roboflow-nøkkel mangler (Innstillinger → AI og tolkning)'), { noRetry: true });
  if (!model) throw Object.assign(new Error('Roboflow-modell er ikke satt opp'), { noRetry: true });
  const t0 = Date.now();
  let res;
  try { res = await fetch(`https://detect.roboflow.com/${model}?api_key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: image.toString('base64'), signal: AbortSignal.timeout(timeout),
  }); } catch (e) { throw netErr('Roboflow', null, e); }
  if (!res.ok) { const err = await httpErr('Roboflow', res); logAi({ task: 'barcode', engine: 'roboflow', model, promptLen: image.length, ms: Date.now() - t0, status: errKind(err), error: err.message }); throw err; }
  const d = await res.json();
  return { predictions: (d.predictions ?? []).filter((p) => Number.isFinite(+p.width) && Number.isFinite(+p.height)).sort((a, b) => b.confidence - a.confidence), ms: Date.now() - t0 };
}

// Kvitteringen i bildet → beskåret bilde (krever ImageMagick). null når Roboflow ikke er satt opp eller ingenting ble funnet.
async function roboflowCrop(image, mime, st) {
  const model = roboflowModelOf(st);
  if (!secret('roboflowKey') || !model || !(await ocrTools()).magick) return null;
  const { predictions, ms } = await roboflowDetect(image, model, { timeout: engineMs('roboflow', st) });
  const box = predictions.find((p) => /receipt|kvittering|bong/i.test(p.class ?? '')) ?? predictions[0];
  logAi({ task: 'receipts', engine: 'roboflow', model, promptLen: image.length, ms, status: box ? 'ok' : 'ingen-treff' });
  if (!box || box.confidence < 0.4) return null;
  const cropped = await cropImage(image, mime, box);
  return cropped ? { image: cropped, box } : null;
}

/**
 * Strekkoder, QR og pakkelapper (Sporing → «Skann strekkode»). Leses med zbar på serveren; er en Roboflow-modell for
 * strekkoder satt opp (roboflowBarcodeModel), beskjæres hver funnet kode først, så små koder på store bilder også leses.
 */
export async function barcode(image, mime) {
  const st = settings(), t0 = Date.now();
  const codes = [];
  let engine = 'zbar';
  const add = (list) => { for (const c of list) if (!codes.some((x) => x.value === c.value)) codes.push(c); };
  const bcModel = String(st.roboflowBarcodeModel || '').split('/').filter(Boolean).slice(-2).join('/');
  if (secret('roboflowKey') && bcModel) {
    try {
      const { predictions } = await roboflowDetect(image, bcModel, { timeout: engineMs('roboflow', st) });
      engine = 'roboflow+zbar';
      for (const p of predictions.slice(0, 6)) {
        const crop = await cropImage(image, mime, { ...p, width: p.width * 1.15, height: p.height * 1.3 });
        if (crop) add(await decodeBarcodes(crop, 'image/jpeg').catch(() => []));
      }
    } catch (e) { if (e.missing) throw e; /* bruk hele bildet under */ }
  }
  try { add(await decodeBarcodes(image, mime)); }
  catch (e) {
    logAi({ task: 'barcode', engine, model: bcModel || null, promptLen: image.length, ms: Date.now() - t0, status: e.missing ? 'mangler' : 'feil', error: e.message });
    if (!codes.length) throw e;
  }
  logAi({ task: 'barcode', engine, model: bcModel || null, promptLen: image.length, ms: Date.now() - t0, status: codes.length ? 'ok' : 'ingen-treff' });
  return { codes, engine };
}

// Roboflow: nøkkelen sjekkes mot API-et, og arbeidsområdet vises. Med modell satt opp sjekkes også at modellen finnes.
export async function testRoboflow() {
  const key = secret('roboflowKey');
  if (!key) return { ok: false, message: 'Roboflow-nøkkel mangler' };
  const st = settings(), t0 = Date.now();
  try {
    const r = await fetch(`https://api.roboflow.com/?api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw await httpErr('Roboflow', r);
    const d = await r.json().catch(() => ({}));
    const ms = Date.now() - t0;
    logAi({ task: 'test', engine: 'roboflow', model: roboflowModelOf(st) || null, ms });
    const want = st.roboflowWorkspace || ROBOFLOW_WORKSPACE;
    const ws = d.workspace ?? null;
    return { ok: true, workspace: ws, ms, model: roboflowModelOf(st) || null,
      message: `Roboflow er koblet til${ws ? ` (arbeidsområde ${ws})` : ''} på ${ms} ms${ws && want && ws !== want ? ` · obs: nøkkelen hører til «${ws}», ikke «${want}»` : ''}` };
  } catch (e) {
    logAi({ task: 'test', engine: 'roboflow', ms: Date.now() - t0, status: errKind(e), error: e.message });
    return { ok: false, message: e.message ?? 'Roboflow svarte ikke' };
  }
}

// Kvittering fra e-posttekst (nettbutikker sender ofte kvitteringen som HTML uten vedlegg). Samme skjema som bildelesingen.
export async function extractText(text, cats) {
  const t0 = Date.now();
  const raw = await askJson(`${PROMPT(cats)}\n\nKvitteringen er en e-post. Les beløp, dato, butikk og varelinjer fra teksten under. Ignorer reklame og bunntekst.\n\n---\n${String(text).slice(0, 15000)}`, SCHEMA, { timeout: 60_000, task: 'receipts' });
  return { provider: 'tekst', model: 'e-post', data: validate(raw), seconds: (Date.now() - t0) / 1000 };
}
