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

// Nettverksfeil («fetch failed») sier lite; ta med årsaken (ECONNREFUSED, tidsavbrudd …).
const netErr = (name, url, e) => {
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return Object.assign(new Error(`${name} svarte ikke innen tidsfristen`), { noRetry: true });
  const code = e.cause?.code || e.cause?.message || e.message;
  return Object.assign(new Error(`${name} kan ikke nås${url ? ` på ${url}` : ''} (${code})`), { noRetry: true });
};
// Feilmeldingen fra API-et (Gemini: error.message, Ollama: error) i stedet for bare statuskoden.
async function httpErr(name, res) {
  let detail = '';
  try { const t = await res.text(); try { const j = JSON.parse(t); detail = j.error?.message ?? j.error ?? t; } catch { detail = t; } } catch { /* tomt svar */ }
  detail = String(detail ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return Object.assign(new Error(`${name} svarte ${res.status}${detail ? `: ${detail}` : ''}`), { noRetry: res.status >= 400 && res.status < 500 });
}

async function ollama(image, mime, cats, st) {
  if (mime === 'application/pdf') throw Object.assign(new Error('Ollama kan ikke lese PDF'), { noRetry: true });
  if (mime === 'image/heic' || mime === 'image/heif') throw Object.assign(new Error('Ollama kan ikke lese HEIC-bilder (bruk Gemini, eller last opp som JPEG)'), { noRetry: true });
  const base = st.ollamaUrl.replace(/\/$/, '');
  let res;
  try { res = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT ?? 120) * 1000),
    body: JSON.stringify({ model: st.ollamaModel, stream: false, format: forOllama(SCHEMA), options: { temperature: 0 },
      messages: [{ role: 'user', content: PROMPT(cats), images: [image.toString('base64')] }] }),
  }); } catch (e) { throw netErr('Ollama', base, e); }
  if (!res.ok) throw await httpErr('Ollama', res);
  const content = (await res.json()).message?.content ?? '';
  try { return JSON.parse(content); } catch { throw new Error('Ollama svarte ikke med gyldig JSON'); }
}

async function gemini(image, mime, cats, st) {
  const key = secret('geminiKey');
  if (!key) throw Object.assign(new Error('Gemini-nøkkel mangler (Innstillinger → AI-motor)'), { noRetry: true });
  let res;
  try { res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(st.geminiModel)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: image.toString('base64') } }, { text: PROMPT(cats) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: forGemini(SCHEMA) },
    }),
  }); } catch (e) { throw netErr('Gemini', null, e); }
  if (!res.ok) throw await httpErr('Gemini', res);
  const d = await res.json();
  const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error(`Gemini ga tomt svar${d.candidates?.[0]?.finishReason ? ` (${d.candidates[0].finishReason})` : d.promptFeedback?.blockReason ? ` (${d.promptFeedback.blockReason})` : ''}`);
  try { return JSON.parse(text); } catch { throw new Error('Gemini svarte ikke med gyldig JSON'); }
}

const PROVIDERS = { ollama, gemini };
export const providerName = (p) => (p === 'gemini' ? 'Gemini' : 'Ollama');

// Leser kvitteringen med valgt motor (eller tvunget motor ved «Les på nytt»), med reserve og ett nytt forsøk.
// HEIC går rett til Gemini når nøkkelen finnes (Ollama kan ikke lese det). log(steg, detalj) får hvert forsøk.
// Feilmeldingen tar med årsaken fra hver motor, ikke bare den siste.
export async function extract(image, mime, cats, force, { log = () => {} } = {}) {
  const st = settings();
  let order = force ? [force] : [st.provider, ...(st.fallback ? [st.provider === 'ollama' ? 'gemini' : 'ollama'] : [])];
  if (!force && (mime === 'image/heic' || mime === 'image/heif') && secret('geminiKey')) order = ['gemini', ...order];
  let lastErr;
  const errors = [];
  for (const p of [...new Set(order)]) {
    const model = p === 'gemini' ? st.geminiModel : st.ollamaModel;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        log('ai', `${providerName(p)} (${model})${attempt ? ', nytt forsøk' : ''}`);
        const raw = await PROVIDERS[p](image, mime, cats, st);
        const data = validate(raw);
        // Lav sikkerhet hos primærmotoren: prøv reserven hvis den finnes.
        if (!force && p === st.provider && st.fallback && data.confidence.total < st.minConf / 100 && order.length > 1 && attempt === 0) {
          lastErr = new Error('Lav sikkerhet'); lastErr.partial = { provider: p, model, data, seconds: (Date.now() - t0) / 1000 };
          break;
        }
        return { provider: p, model, data, seconds: (Date.now() - t0) / 1000 };
      } catch (e) {
        lastErr = e;
        log('ai-feil', `${providerName(p)}: ${e.message}`);
        if (attempt === 1 || e.noRetry || /mangler|kan ikke|svarte 4/.test(e.message)) { errors.push(`${providerName(p)}: ${e.message}`); break; } // ikke vits å prøve igjen
      }
    }
  }
  if (lastErr?.partial) return lastErr.partial;
  if (errors.length > 1) throw new Error(errors.join(' · '));
  throw lastErr ?? new Error('Ingen AI-motor tilgjengelig');
}

export async function health() {
  const st = settings();
  const out = { provider: st.provider, ollama: { ok: false }, gemini: { ok: false, configured: !!secret('geminiKey') } };
  try {
    const r = await fetch(`${st.ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const models = r.ok ? (await r.json()).models?.map((m) => m.name) ?? [] : [];
    out.ollama = { ok: r.ok, models, hasModel: models.some((m) => m === st.ollamaModel || m.startsWith(st.ollamaModel + ':')) };
  } catch (e) { out.ollama = { ok: false, error: e.cause?.code || e.name }; }
  if (out.gemini.configured) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(st.geminiModel)}`, { headers: { 'x-goog-api-key': secret('geminiKey') }, signal: AbortSignal.timeout(6000) });
      out.gemini = { ok: r.ok, configured: true, status: r.status };
    } catch (e) { out.gemini = { ok: false, configured: true, error: e.cause?.code || e.name }; }
  }
  return out;
}

// Generelt tekst → JSON-kall (sammendrag, domenegjetting, Finn-e-post). Gemini først hvis nøkkel finnes, ellers Ollama.
// Kaster ved feil; kallerne har alltid en heuristisk reserve.
export async function askJson(prompt, schema, { timeout = 30_000 } = {}) {
  const st = settings();
  const order = [...new Set([secret('geminiKey') ? 'gemini' : null, st.provider, st.fallback ? 'ollama' : null].filter(Boolean))];
  let lastErr;
  for (const p of order) {
    try {
      if (p === 'gemini') {
        const key = secret('geminiKey');
        if (!key) throw new Error('Gemini-nøkkel mangler');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(st.geminiModel)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(timeout),
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: forGemini(schema) } }),
        });
        if (!res.ok) throw new Error(`Gemini svarte ${res.status}`);
        const d = await res.json();
        return JSON.parse(d.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '');
      }
      const res = await fetch(`${st.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeout),
        body: JSON.stringify({ model: st.ollamaModel, stream: false, format: forOllama(schema), options: { temperature: 0.2 }, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw new Error(`Ollama svarte ${res.status}`);
      return JSON.parse((await res.json()).message.content);
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('Ingen AI-motor tilgjengelig');
}

// Kvittering fra e-posttekst (nettbutikker sender ofte kvitteringen som HTML uten vedlegg). Samme skjema som bildelesingen.
export async function extractText(text, cats) {
  const t0 = Date.now();
  const raw = await askJson(`${PROMPT(cats)}\n\nKvitteringen er en e-post. Les beløp, dato, butikk og varelinjer fra teksten under. Ignorer reklame og bunntekst.\n\n---\n${String(text).slice(0, 15000)}`, SCHEMA, { timeout: 60_000 });
  return { provider: 'tekst', model: 'e-post', data: validate(raw), seconds: (Date.now() - t0) / 1000 };
}
