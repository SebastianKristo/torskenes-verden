// Felles for Hjem, Matplan og Domener: tilgang (sesjon eller FinansHub-token) og en enkel JSON-AI-kall.
import { sessionUser, isAdmin } from './auth.js';
import * as fh from './finans/routes.js';
import { settings, secret } from './finans/db.js';

export const MOCK = process.env.MOCK_DATA === '1';
export const bad = (c, error, status = 400) => c.json({ error }, status);

// Lesing godtar token med finance:read, endringer krever finance:write.
// Hjem, Matplan og Domener viser eierens data, så bare administratorer slipper inn.
export const guard = async (c, next) => {
  const write = c.req.method !== 'GET';
  let id = sessionUser(c);
  if (!id && fh.bearerOk?.(c, write ? 'finance:write' : 'finance:read')) id = c.get('user');
  if (!id) return bad(c, 'Ikke innlogget', 401);
  if (!isAdmin(id)) return bad(c, 'Bare administratorer har tilgang', 403);
  await next();
};

export async function readJson(c) {
  try { const b = await c.req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
}

export const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

// Tekst → JSON med FinansHubs valgte motor (Gemini eller Ollama), med den andre som reserve.
export async function aiJson(prompt, schema) {
  const st = settings();
  const order = [...new Set([st.provider, ...(st.fallback ? [st.provider === 'ollama' ? 'gemini' : 'ollama'] : [])])];
  let last;
  for (const p of order) {
    try {
      if (p === 'gemini') {
        const key = secret('geminiKey');
        if (!key) throw new Error('Gemini-nøkkel mangler');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(st.geminiModel)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, responseMimeType: 'application/json', responseSchema: schema } }),
        });
        if (!res.ok) throw new Error(`Gemini svarte ${res.status}`);
        const d = await res.json();
        return { provider: 'Gemini', data: JSON.parse(d.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '') };
      }
      const res = await fetch(`${st.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({ model: st.ollamaModel, stream: false, format: lower(schema), options: { temperature: 0.7 }, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw new Error(`Ollama svarte ${res.status}`);
      return { provider: 'Ollama', data: JSON.parse((await res.json()).message.content) };
    } catch (e) { last = e; }
  }
  throw last ?? new Error('Ingen AI-motor');
}

// Gemini bruker OBJECT/STRING, Ollama vanlig JSON Schema.
function lower(s) {
  if (Array.isArray(s)) return s.map(lower);
  if (!s || typeof s !== 'object') return s;
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' ? String(v).toLowerCase() : lower(v)]));
}

// Butikk → domene for logoer.
const DOMAINS = { elkjøp: 'elkjop.no', elkjop: 'elkjop.no', ikea: 'ikea.no', power: 'power.no', biltema: 'biltema.no', bilema: 'biltema.no', 'clas ohlson': 'clasohlson.com',
  jysk: 'jysk.no', xxl: 'xxl.no', komplett: 'komplett.no', 'obs bygg': 'obsbygg.no', 'byggmax': 'byggmax.no', 'europris': 'europris.no', 'jernia': 'jernia.no', apple: 'apple.com', hellofresh: 'hellofresh.no' };
export function domainFor(name) {
  const l = String(name ?? '').toLowerCase();
  for (const k in DOMAINS) if (l.includes(k)) return DOMAINS[k];
  const w = l.replace(/[^a-z0-9æøå ]/g, '').split(' ')[0];
  return w ? `${w.replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')}.no` : null;
}
