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

async function ollama(image, mime, cats, st) {
  if (mime === 'application/pdf') throw new Error('Ollama kan ikke lese PDF');
  const res = await fetch(`${st.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT ?? 120) * 1000),
    body: JSON.stringify({ model: st.ollamaModel, stream: false, format: forOllama(SCHEMA), options: { temperature: 0 },
      messages: [{ role: 'user', content: PROMPT(cats), images: [image.toString('base64')] }] }),
  });
  if (!res.ok) throw new Error(`Ollama svarte ${res.status}`);
  return JSON.parse((await res.json()).message.content);
}

async function gemini(image, mime, cats, st) {
  const key = secret('geminiKey');
  if (!key) throw new Error('Gemini-nøkkel mangler');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(st.geminiModel)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: image.toString('base64') } }, { text: PROMPT(cats) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: forGemini(SCHEMA) },
    }),
  });
  if (!res.ok) throw new Error(`Gemini svarte ${res.status}`);
  const d = await res.json();
  const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return JSON.parse(text);
}

const PROVIDERS = { ollama, gemini };
export const providerName = (p) => (p === 'gemini' ? 'Gemini' : 'Ollama');

// Leser kvitteringen med valgt motor (eller tvunget motor ved «Les på nytt»), med reserve og ett nytt forsøk.
export async function extract(image, mime, cats, force) {
  const st = settings();
  const order = force ? [force] : [st.provider, ...(st.fallback ? [st.provider === 'ollama' ? 'gemini' : 'ollama'] : [])];
  let lastErr;
  for (const p of [...new Set(order)]) {
    const model = p === 'gemini' ? st.geminiModel : st.ollamaModel;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
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
        if (/mangler|kan ikke|svarte 4/.test(e.message)) break; // ikke vits å prøve igjen
      }
    }
  }
  if (lastErr?.partial) return lastErr.partial;
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
