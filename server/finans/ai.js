// AI-utlesing av kvitteringer. Felles prompt og skjema for Ollama (lokalt) og Gemini (sky).
// Svaret valideres; ugyldig svar gir ett nytt forsøk før bilaget markeres for manuell utfylling.
import { settings, secret } from './db.js';

export const PROMPT = (cats) => `Du leser en norsk kvittering. Returner KUN JSON etter skjemaet.
- Beløp i kroner som tall med punktum som desimalskille (386.50).
- Dato i ISO-format (YYYY-MM-DD). Hvis året mangler, bruk ${new Date().getFullYear()}.
- vat: summer per sats (25, 15, 12, 0) hvis oppgitt.
- Foreslå kategori fra listen: ${cats.join(', ')}.
- Sett confidence (0–1) per felt (merchant, date, total). Gjett ikke: ukjent felt = null.
- Ta aldri med fullt kortnummer, bare de fire siste sifrene i card_last4.`;

const num = { type: 'number', nullable: true };
const str = { type: 'string', nullable: true };
// JSON-skjema (Ollama `format`). Gemini bruker samme struktur med OpenAPI-typer.
export const SCHEMA = {
  type: 'object',
  properties: {
    merchant: str, org_number: str, date: str, total: num, currency: { type: 'string' },
    vat: { type: 'array', items: { type: 'object', properties: { rate: { type: 'integer' }, amount: { type: 'number' } }, required: ['rate', 'amount'] } },
    lines: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, quantity: num, amount: { type: 'number' } }, required: ['description', 'amount'] } },
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
    lines: Array.isArray(x.lines) ? x.lines.filter((l) => l && Number.isFinite(+l.amount)).slice(0, 80).map((l) => ({ description: String(l.description ?? '').slice(0, 120), quantity: Number.isFinite(+l.quantity) && l.quantity !== null ? +l.quantity : null, amount: +l.amount })) : [],
    payment_method: typeof x.payment_method === 'string' ? x.payment_method.slice(0, 20) : null,
    card_last4: typeof x.card_last4 === 'string' && /^\d{4}$/.test(x.card_last4.slice(-4)) ? x.card_last4.slice(-4) : null,
    suggested_category: typeof x.suggested_category === 'string' ? x.suggested_category.slice(0, 60) : null,
    confidence: {},
  };
  for (const k of ['merchant', 'date', 'total']) {
    const v = +(x.confidence?.[k]);
    out.confidence[k] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }
  if (out.total === null && !out.merchant) throw new Error('Fant verken butikk eller total');
  return out;
}

/* ---------------- Felles: motorer, reserve og «nede»-vakt ---------------- */

export const ENGINES = ['ollama', 'gemini', 'groq'];
export const providerName = (p) => ({ gemini: 'Gemini', groq: 'Groq', ollama: 'Ollama' }[p] ?? 'Ollama');
export const GEMINI_DEFAULT = 'gemini-flash-latest';
export const GROQ_DEFAULT = 'llama-3.3-70b-versatile';
export const GROQ_VISION_DEFAULT = 'meta-llama/llama-4-scout-17b-16e-instruct';
const configured = (p) => (p === 'gemini' ? !!secret('geminiKey') : p === 'groq' ? !!secret('groqKey') : true);

// En motor som ikke svarte (nettverk/tidsavbrudd) hoppes over i 3 minutter, så ett kall ikke venter på samme tidsavbrudd igjen og igjen.
const downUntil = {};
const isDown = (p) => (downUntil[p] ?? 0) > Date.now();
const markDown = (p, e) => { if (e?.net) downUntil[p] = Date.now() + 3 * 60_000; };
export const _resetAi = () => { for (const k of Object.keys(downUntil)) delete downUntil[k]; for (const k of Object.keys(geminiResolved)) delete geminiResolved[k]; ollamaProbe.at = 0; };

// Rekkefølge: valgt motor først, deretter de andre som er satt opp (når reserve er på). force = bare den motoren.
export function engineOrder(st = settings(), { force = null, skipDown = true } = {}) {
  if (force) return [force];
  const first = ENGINES.includes(st.provider) ? st.provider : 'ollama';
  const rest = st.fallback ? ENGINES.filter((p) => p !== first && configured(p)) : [];
  const all = [first, ...rest];
  const live = skipDown ? all.filter((p) => !isDown(p)) : all;
  return live.length ? live : all;
}

// Nettverksfeil («fetch failed») sier lite; ta med årsaken (ECONNREFUSED, tidsavbrudd …).
const netErr = (name, url, e) => {
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return Object.assign(new Error(`${name} svarte ikke innen tidsfristen`), { noRetry: true, net: true });
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
async function ollamaChat(st, messages, schema, { timeout, temperature }) {
  const base = st.ollamaUrl.replace(/\/$/, '');
  const probe = await ollamaReachable(base);
  if (!probe.ok) throw Object.assign(new Error(probe.err ?? `Ollama kan ikke nås på ${base}`), { noRetry: true, net: true });
  let res;
  try { res = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ model: st.ollamaModel, stream: false, format: forOllama(lowerTypes(schema)), options: { temperature }, messages }),
  }); } catch (e) { ollamaProbe.at = 0; throw netErr('Ollama', base, e); }
  if (!res.ok) throw await httpErr('Ollama', res);
  return { model: st.ollamaModel, data: parseJson('Ollama', (await res.json()).message?.content) };
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
async function geminiGenerate(parts, { schema, timeout, temperature, model }) {
  const key = secret('geminiKey');
  if (!key) throw Object.assign(new Error('Gemini-nøkkel mangler (Innstillinger → AI-motor)'), { noRetry: true });
  const want = model || GEMINI_DEFAULT;
  let m = geminiResolved[want] ?? want;
  for (let round = 0; round < 3; round++) {
    // 2.5-flash og nyere «tenker» før svaret; for korte JSON-oppgaver gjør det bare kallet tregt (og ga tidsavbrudd i AI-søket).
    const think = /flash/.test(m) && !noThinking.has(m) ? { thinkingConfig: { thinkingBudget: 0 } } : {};
    let res;
    try { res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(timeout),
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, responseMimeType: 'application/json', ...(schema ? { responseSchema: forGemini(schema) } : {}), ...think } }),
    }); } catch (e) { throw netErr('Gemini', null, e); }
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
      try { names = await listGemini(key); } catch { /* bruk feilen under */ }
      const next = pickGemini(names.filter((n) => n !== m), want);
      if (next && next !== m) { console.warn(`[ai] Gemini-modellen «${m}» finnes ikke lenger, bruker «${next}»`); geminiResolved[want] = next; m = next; continue; }
      throw Object.assign(new Error(`Gemini-modellen «${m}» finnes ikke lenger. Velg en annen modell under Innstillinger → AI-motor.`), { noRetry: true, status: 404 });
    }
    throw err;
  }
  throw new Error('Gemini svarte ikke');
}

/* ---------------- Groq (OpenAI-kompatibelt) ---------------- */

async function groqChat(content, schema, { timeout, temperature, model }) {
  const key = secret('groqKey');
  if (!key) throw Object.assign(new Error('Groq-nøkkel mangler (Innstillinger → AI-motor)'), { noRetry: true });
  const sys = `Svar KUN med ett JSON-objekt, uten forklaring. Det skal følge dette JSON-skjemaet:\n${JSON.stringify(lowerTypes(schema))}`;
  let res;
  try { res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content }] }),
  }); } catch (e) { throw netErr('Groq', null, e); }
  if (!res.ok) throw await httpErr('Groq', res);
  const d = await res.json();
  return { model, data: parseJson('Groq', d.choices?.[0]?.message?.content) };
}

/* ---------------- Kvitteringer (bilde → JSON) ---------------- */

async function ollama(image, mime, cats, st) {
  if (mime === 'application/pdf') throw Object.assign(new Error('Ollama kan ikke lese PDF'), { noRetry: true });
  if (mime === 'image/heic' || mime === 'image/heif') throw Object.assign(new Error('Ollama kan ikke lese HEIC-bilder (bruk Gemini, eller last opp som JPEG)'), { noRetry: true });
  return (await ollamaChat(st, [{ role: 'user', content: PROMPT(cats), images: [image.toString('base64')] }], SCHEMA,
    { timeout: Number(process.env.OLLAMA_TIMEOUT ?? 120) * 1000, temperature: 0 })).data;
}
async function gemini(image, mime, cats, st) {
  return (await geminiGenerate([{ inline_data: { mime_type: mime, data: image.toString('base64') } }, { text: PROMPT(cats) }], { schema: SCHEMA, timeout: 60_000, temperature: 0, model: st.geminiModel })).data;
}
async function groq(image, mime, cats, st) {
  if (!/^image\/(jpe?g|png|webp|gif)$/.test(mime)) throw Object.assign(new Error('Groq kan bare lese JPEG, PNG og WebP'), { noRetry: true });
  return (await groqChat([{ type: 'text', text: PROMPT(cats) }, { type: 'image_url', image_url: { url: `data:${mime};base64,${image.toString('base64')}` } }], SCHEMA,
    { timeout: 60_000, temperature: 0, model: st.groqVisionModel || GROQ_VISION_DEFAULT })).data;
}

const PROVIDERS = { ollama, gemini, groq };
const modelOf = (p, st) => (p === 'gemini' ? (geminiResolved[st.geminiModel || GEMINI_DEFAULT] ?? (st.geminiModel || GEMINI_DEFAULT)) : p === 'groq' ? (st.groqVisionModel || GROQ_VISION_DEFAULT) : st.ollamaModel);

// Leser kvitteringen med valgt motor (eller tvunget motor ved «Les på nytt»), med reserve og ett nytt forsøk.
// HEIC går rett til Gemini når nøkkelen finnes (Ollama og Groq kan ikke lese det). log(steg, detalj) får hvert forsøk.
// Feilmeldingen tar med årsaken fra hver motor, ikke bare den siste.
export async function extract(image, mime, cats, force, { log = () => {} } = {}) {
  const st = settings();
  let order = engineOrder(st, { force });
  if (!force && (mime === 'image/heic' || mime === 'image/heif') && secret('geminiKey')) order = ['gemini', ...order];
  let lastErr;
  const errors = [];
  for (const p of [...new Set(order)]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        log('ai', `${providerName(p)} (${modelOf(p, st)})${attempt ? ', nytt forsøk' : ''}`);
        const raw = await PROVIDERS[p](image, mime, cats, st);
        const data = validate(raw);
        // Lav sikkerhet hos primærmotoren: prøv reserven hvis den finnes.
        if (!force && p === st.provider && st.fallback && data.confidence.total < st.minConf / 100 && order.length > 1 && attempt === 0) {
          lastErr = new Error('Lav sikkerhet'); lastErr.partial = { provider: p, model: modelOf(p, st), data, seconds: (Date.now() - t0) / 1000 };
          break;
        }
        return { provider: p, model: modelOf(p, st), data, seconds: (Date.now() - t0) / 1000 };
      } catch (e) {
        lastErr = e;
        markDown(p, e);
        log('ai-feil', `${providerName(p)}: ${e.message}`);
        if (attempt === 1 || e.noRetry || /mangler|kan ikke|svarte 4/.test(e.message)) { errors.push(`${providerName(p)}: ${e.message}`); break; } // ikke vits å prøve igjen
      }
    }
  }
  if (lastErr?.partial) return lastErr.partial;
  if (errors.length > 1) throw new Error(errors.join(' · '));
  throw lastErr ?? new Error('Ingen AI-motor tilgjengelig');
}

/* ---------------- Tekst → JSON (sammendrag, søk, Mat, RSS, Finn …) ---------------- */

// Valgt motor først, så reservene. Svarer { provider, model, data }. Feilen sier hva hver motor svarte.
export async function textJson(prompt, schema, { timeout = 30_000, temperature = 0.2, force = null } = {}) {
  const st = settings();
  const errors = [];
  for (const p of engineOrder(st, { force })) {
    try {
      const r = p === 'gemini' ? await geminiGenerate([{ text: prompt }], { schema, timeout, temperature, model: st.geminiModel })
        : p === 'groq' ? await groqChat(prompt, schema, { timeout, temperature, model: st.groqModel || GROQ_DEFAULT })
        : await ollamaChat(st, [{ role: 'user', content: prompt }], schema, { timeout, temperature });
      return { provider: providerName(p), engine: p, model: r.model, data: r.data };
    } catch (e) { markDown(p, e); errors.push(`${providerName(p)}: ${e.message}`); }
  }
  const err = new Error(errors.length ? errors.join(' · ') : 'Ingen AI-motor tilgjengelig');
  err.errors = errors;
  throw err;
}

// Eldre navn: gir bare dataene. Kallerne har alltid en heuristisk reserve.
export async function askJson(prompt, schema, { timeout = 30_000 } = {}) {
  return (await textJson(prompt, schema, { timeout })).data;
}

/* ---------------- Status og tilkoblingstest ---------------- */

export async function health() {
  const st = settings();
  const out = { provider: st.provider, order: engineOrder(st, { skipDown: false }), down: ENGINES.filter(isDown),
    ollama: { ok: false }, gemini: { ok: false, configured: !!secret('geminiKey'), model: st.geminiModel || GEMINI_DEFAULT, resolved: geminiResolved[st.geminiModel || GEMINI_DEFAULT] ?? null },
    groq: { ok: false, configured: !!secret('groqKey'), model: st.groqModel || GROQ_DEFAULT, visionModel: st.groqVisionModel || GROQ_VISION_DEFAULT },
    roboflow: { configured: !!secret('roboflowKey'), workflow: st.roboflowWorkflow || null } };
  try {
    const r = await fetch(`${st.ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const models = r.ok ? (await r.json()).models?.map((m) => m.name) ?? [] : [];
    out.ollama = { ok: r.ok, models, hasModel: models.some((m) => m === st.ollamaModel || m.startsWith(st.ollamaModel + ':')) };
  } catch (e) { out.ollama = { ok: false, error: e.cause?.code || e.name }; }
  if (out.gemini.configured) {
    try {
      const names = await listGemini(secret('geminiKey'));
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
    const r = await textJson('Svar med JSON {"ok": true, "svar": "hei"}.', { type: 'object', properties: { ok: { type: 'boolean' }, svar: { type: 'string' } }, required: ['ok'] }, { timeout: 25_000, force: p });
    delete downUntil[p];
    return { ok: true, engine: p, model: r.model, seconds: (Date.now() - t0) / 1000, message: `${providerName(p)} svarte (${r.model}) på ${((Date.now() - t0) / 1000).toFixed(1)} s` };
  } catch (e) { return { ok: false, engine: p, message: e.message.replace(/^\w+: /, '') }; }
}

// Roboflow: nøkkelen sjekkes mot API-et. Brukes valgfritt til kvitteringsdeteksjon via en workflow.
export async function testRoboflow() {
  const key = secret('roboflowKey');
  if (!key) return { ok: false, message: 'Roboflow-nøkkel mangler' };
  try {
    const r = await fetch(`https://api.roboflow.com/?api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw await httpErr('Roboflow', r);
    const d = await r.json().catch(() => ({}));
    return { ok: true, workspace: d.workspace ?? null, message: `Roboflow er koblet til${d.workspace ? ` (arbeidsområde ${d.workspace})` : ''}` };
  } catch (e) { return { ok: false, message: e.net ? e.message : e.message ?? 'Roboflow svarte ikke' }; }
}

// Kvittering fra e-posttekst (nettbutikker sender ofte kvitteringen som HTML uten vedlegg). Samme skjema som bildelesingen.
export async function extractText(text, cats) {
  const t0 = Date.now();
  const raw = await askJson(`${PROMPT(cats)}\n\nKvitteringen er en e-post. Les beløp, dato, butikk og varelinjer fra teksten under. Ignorer reklame og bunntekst.\n\n---\n${String(text).slice(0, 15000)}`, SCHEMA, { timeout: 60_000 });
  return { provider: 'tekst', model: 'e-post', data: validate(raw), seconds: (Date.now() - t0) / 1000 };
}
