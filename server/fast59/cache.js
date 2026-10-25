// Prompt 59 (prompt 49 del 4, D4SRV): svar-cache med utløp per datatype. Nøkkel = normalisert plan (validerte verktøykall med
// tolkede argumenter: sted, tidsrom, søkeord …) + bruker (+ modul). Per bruker, aldri delt mellom brukere.
//   vær (weather.get)            15 min
//   strømpris (gamle svar)       til neste hele time
//   nettsøk/nyheter (web.search) 30 min   (svaret bygger på treffene; spørsmålsteksten er med i nøkkelen)
//   kalender, gjøremål, finans, minne, media og alt som endrer data: ALDRI (ingen cache – «til data endres» trengs da ikke).
// Tabell fast59_cache (user_id, key, kind, created, expires, response). Ryddes ved oppstart og ved hver lagring (utløpte rader).
import { createHash } from 'node:crypto';
import { db } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS fast59_cache (user_id TEXT NOT NULL, key TEXT NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, response TEXT NOT NULL, PRIMARY KEY (user_id, key));
CREATE INDEX IF NOT EXISTS fast59_cache_exp ON fast59_cache(expires);`);
const q = (sql) => db.prepare(sql);

export const TTL59 = { weather: 15 * 60_000, web: 30 * 60_000, news: 30 * 60_000 };
/** Til neste hele time (strømprisen endres hver time). Oslo har hele timers forskyvning fra UTC, så timegrensen er den samme. */
export const untilNextHour59 = (now = Date.now()) => 3_600_000 - (now % 3_600_000);
const TOOL_KIND = { 'weather.get': 'weather', 'web.search': 'web' };
const TALK = new Set(['chat.answer']);

/**
 * Hvilken datatype planen er, og hvor lenge svaret kan gjenbrukes. Bare planer der ALLE kall er cachebare lesekall.
 * checked = validerte kall [{tool, args}]. → {kind, ttlMs, needsText} | null
 */
export function cacheKindOf59(checked = []) {
  if (!checked.length) return null;
  const kinds = new Set();
  let talk = false;
  for (const c of checked) {
    if (TALK.has(c.tool)) { talk = true; continue; }
    const k = TOOL_KIND[c.tool];
    if (!k) return null;
    kinds.add(k);
  }
  if (!kinds.size) return null; // ren prat caches ikke
  if (talk && !kinds.has('web')) return null; // prat uten søk bygger ikke på data med kjent levetid
  const ttlMs = Math.min(...[...kinds].map((k) => TTL59[k]));
  return { kind: [...kinds].sort().join('+'), ttlMs, needsText: kinds.has('web') || talk };
}
/** Strømpris / vær fra de gamle svarene (app.answer). → {kind, ttlMs} | null */
export function legacyKindOf59(a, legacyIntent, now = Date.now()) {
  if (!a || a.error || a.fix) return null;
  if (a.tool === 'Strømpris' || /^Strømpris/.test(String(a.source ?? ''))) return { kind: 'power', ttlMs: untilNextHour59(now) };
  if (legacyIntent === 'weather' || /^weather/.test(String(a.intent ?? '')) || a.tool === 'Vær') return { kind: 'weather', ttlMs: TTL59.weather };
  return null;
}
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => !k.startsWith('_') && v[k] !== undefined).map((k) => [k, stable(v[k])])) : v);
/** Nøkkel for en plan. → hex */
export function planKey59(user, { module = 'home', calls = [], text = null, compare = null, extra = null } = {}) {
  const body = JSON.stringify(stable({ u: user, m: module, c: calls.map((c) => ({ t: c.tool, a: c.args ?? {} })), x: text != null ? norm(text) : null, cmp: compare ?? null, e: extra }));
  return createHash('sha256').update(body).digest('hex').slice(0, 40);
}
export const legacyKey59 = (user, { module = 'home', topic = null, legacyIntent = null, text = '' } = {}) => planKey59(user, { module, calls: [{ tool: 'app.answer', args: { topic, legacyIntent } }], text });

/** → {response, ageMs, ttlMs, kind} | null */
export function cacheGet59(user, key, now = Date.now()) {
  const r = q('SELECT * FROM fast59_cache WHERE user_id=? AND key=?').get(user, key);
  if (!r) return null;
  if (r.expires <= now) { q('DELETE FROM fast59_cache WHERE user_id=? AND key=?').run(user, key); return null; }
  try { return { response: JSON.parse(r.response), ageMs: now - r.created, ttlMs: r.expires - r.created, kind: r.kind }; } catch { return null; }
}
export function cachePut59(user, key, kind, ttlMs, response, now = Date.now()) {
  if (!(ttlMs > 0)) return false;
  try {
    q('INSERT OR REPLACE INTO fast59_cache(user_id, key, kind, created, expires, response) VALUES(?,?,?,?,?,?)').run(user, key, kind, now, now + ttlMs, JSON.stringify(response));
    q('DELETE FROM fast59_cache WHERE expires <= ?').run(now);
    return true;
  } catch (e) { console.warn('[fast59] cache:', e.message); return false; }
}
export const cacheCount59 = (user) => q('SELECT count(*) FROM fast59_cache WHERE user_id=? AND expires>?').pluck().get(user, Date.now());
export const cacheClear59 = (user) => q('DELETE FROM fast59_cache WHERE user_id=?').run(user).changes;
try { q('DELETE FROM fast59_cache WHERE expires <= ?').run(Date.now()); } catch { /* */ }
