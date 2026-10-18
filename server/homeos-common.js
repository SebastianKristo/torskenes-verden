// Felles for Hjem, Matplan og Domener: tilgang (sesjon eller FinansHub-token) og en enkel JSON-AI-kall.
import { sessionUser, isAdmin } from './auth.js';
import * as fh from './finans/routes.js';
import { textJson } from './finans/ai.js';

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

// Per bruker (ISO2): Sporing, Matplan og Home OS har egne data for hver bruker, så alle innloggede slipper inn.
// Brukeren legges i c.get('user').
export const userGuard = async (c, next) => {
  const write = c.req.method !== 'GET';
  let id = sessionUser(c);
  if (!id && fh.bearerOk?.(c, write ? 'finance:write' : 'finance:read')) id = c.get('user');
  if (!id) return bad(c, 'Ikke innlogget', 401);
  c.set('user', id);
  await next();
};

export async function readJson(c) {
  try { const b = await c.req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
}

export const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

// Tekst → JSON med FinansHubs valgte motor (Ollama, Gemini eller Groq), med de andre som reserve.
// Samme vei som FinansHub (modelloppslag, «nede»-vakt og feilmelding fra hver motor). Svarer { provider, data }.
// task: «categorize» (RSS-kategorier o.l.) eller «search» velger motor fra «Hvem gjør hva»; ellers valgt motor.
export async function aiJson(prompt, schema, { timeout = 60_000, temperature = 0.7, task = 'text' } = {}) {
  const r = await textJson(prompt, schema, { timeout, temperature, task });
  return { provider: r.provider, model: r.model, data: r.data };
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
