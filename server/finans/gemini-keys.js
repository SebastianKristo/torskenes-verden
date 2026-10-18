// Flere Gemini-nøkler: hovednøkkelen (geminiKey) og reserver i rekkefølge. Når en nøkkel svarer 429 (kvote brukt opp)
// eller 403 (ugyldig nøkkel), merkes den og neste nøkkel prøves med en gang. Merket varer til kvoten nullstilles:
// per minutt → 1 min, per dag → neste døgnskifte hos Google (midnatt Pacific ≈ 08:00 UTC), månedlig/fakturering → neste måned.
import { randomUUID } from 'node:crypto';
import { kv, OWNER } from '../db.js';
import { secret, setSecret } from './db.js';
const STATUS_KEY = 'fh_gemini_status';

function extras() {
  try { const v = JSON.parse(secret('geminiKeys') || '[]'); return Array.isArray(v) ? v.filter((x) => x && x.id && x.key) : []; } catch { return []; }
}
const saveExtras = (list) => setSecret('geminiKeys', list.length ? JSON.stringify(list) : '');
const statusAll = () => kv.get(OWNER, STATUS_KEY, {});
const setStatus = (id, patch) => { const s = statusAll(); s[id] = { ...(s[id] ?? {}), ...patch }; kv.set(OWNER, STATUS_KEY, s); };

/** Alle nøklene i rekkefølge: hovednøkkelen først (hvis satt), så reservene. */
export function geminiKeys() {
  const main = secret('geminiKey');
  return [...(main ? [{ id: 'main', label: 'Hovednøkkel', key: main }] : []), ...extras()];
}
export const hasGemini = () => geminiKeys().length > 0;

const nextDayReset = (now) => { const d = new Date(now); d.setUTCHours(8, 0, 0, 0); if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1); return d.getTime(); };
const nextMonth = (now) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0); };

/** Hvor lenge en nøkkel skal hvile, ut fra Googles feilmelding. */
export function restFor(status, detail = '', now = Date.now()) {
  const t = String(detail).toLowerCase();
  if (status === 403 || status === 401 || /api key not valid|api_key_invalid|permission_denied|has been suspended/.test(t)) return { until: now + 60 * 60_000, reason: 'Ugyldig eller sperret nøkkel' };
  if (/per\s*month|monthly|billing|prepay|credits|spend/.test(t)) return { until: nextMonth(now), reason: 'Månedskvoten er brukt opp' };
  if (/per\s*day|perday|daily|requests per day|per_day/.test(t)) return { until: nextDayReset(now), reason: 'Dagskvoten er brukt opp' };
  if (/per\s*minute|perminute|per_minute|rate/.test(t)) return { until: now + 65_000, reason: 'For mange kall i minuttet' };
  return { until: now + 5 * 60_000, reason: 'Kvote eller grense nådd' };
}
const isQuota = (status, detail) => status === 429 || ((status === 403 || status === 401) && /quota|api key not valid|api_key_invalid|permission_denied|suspended/i.test(String(detail)));

/** Nøklene som kan brukes nå (ikke hvilende). Er alle hvilende, prøves den som blir ledig først. */
export function usableKeys(now = Date.now()) {
  const st = statusAll(), all = geminiKeys();
  const ok = all.filter((k) => !(st[k.id]?.until > now));
  if (ok.length) return ok;
  return all.sort((a, b) => (st[a.id]?.until ?? 0) - (st[b.id]?.until ?? 0)).slice(0, 1);
}

/**
 * fetch mot Gemini med nøkkelrotasjon. init.headers får x-goog-api-key. Ved kvote- eller nøkkelfeil prøves neste nøkkel.
 * Returnerer Response (også en feilende, når alle nøklene er brukt opp) med res.geminiKeyId satt.
 */
export async function geminiFetch(url, init = {}) {
  const keys = usableKeys();
  if (!keys.length) throw Object.assign(new Error('Gemini-nøkkel mangler (Innstillinger → AI og tolkning)'), { noRetry: true });
  let last = null;
  for (const k of keys) {
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), 'x-goog-api-key': k.key } });
    res.geminiKeyId = k.id;
    if (res.ok) { setStatus(k.id, { until: 0, reason: null, lastOk: Date.now() }); return res; }
    if (!isQuota(res.status, '')) {
      // Les teksten for å avgjøre om det er kvote (403 kan også være noe annet); lag et nytt Response med samme innhold.
      const body = await res.text();
      const copy = new Response(body, { status: res.status, headers: res.headers });
      copy.geminiKeyId = k.id;
      if (!isQuota(res.status, body)) return copy;
      const r = restFor(res.status, body); setStatus(k.id, { ...r, lastErr: Date.now(), detail: body.slice(0, 200) });
      if (keys.length > 1) console.warn(`[ai] Gemini-nøkkel «${k.label}»: ${r.reason}, prøver neste`);
      last = copy; continue;
    }
    const body = await res.text();
    const r = restFor(res.status, body); setStatus(k.id, { ...r, lastErr: Date.now(), detail: body.slice(0, 200) });
    if (keys.length > 1) console.warn(`[ai] Gemini-nøkkel «${k.label}»: ${r.reason}, prøver neste`);
    last = new Response(body, { status: res.status, headers: res.headers }); last.geminiKeyId = k.id;
  }
  return last;
}

/* ---------------- Administrasjon (Innstillinger → AI og tolkning) ---------------- */

export function listKeysOut(now = Date.now()) {
  const st = statusAll();
  return geminiKeys().map((k, i) => {
    const s = st[k.id] ?? {};
    const resting = s.until > now;
    return { id: k.id, label: k.label, last4: k.key.slice(-4), main: k.id === 'main', order: i,
      status: resting ? (/ugyldig/i.test(s.reason ?? '') ? 'invalid' : 'exhausted') : 'ok', reason: resting ? s.reason : null, until: resting ? s.until : null, lastOk: s.lastOk ?? null };
  });
}
export function addKey(label, key) {
  const k = String(key ?? '').trim();
  if (!/^[A-Za-z0-9_\-]{20,}$/.test(k)) throw Object.assign(new Error('Det ser ikke ut som en Gemini API-nøkkel (AIza…)'), { status: 400 });
  if (geminiKeys().some((x) => x.key === k)) throw Object.assign(new Error('Nøkkelen er allerede lagt inn'), { status: 409 });
  const list = extras();
  const item = { id: randomUUID().slice(0, 8), label: String(label ?? '').trim().slice(0, 40) || `Reserve ${list.length + 1}`, key: k };
  list.push(item); saveExtras(list);
  return item.id;
}
export function removeKey(id) {
  if (id === 'main') { setSecret('geminiKey', ''); } else saveExtras(extras().filter((x) => x.id !== id));
  const s = statusAll(); delete s[id]; kv.set(OWNER, STATUS_KEY, s);
}
export function renameKey(id, label) {
  const list = extras(); const x = list.find((y) => y.id === id);
  if (!x) throw Object.assign(new Error('Fant ikke nøkkelen'), { status: 404 });
  x.label = String(label ?? '').trim().slice(0, 40) || x.label; saveExtras(list);
}
/** Rekkefølgen på reservene (hovednøkkelen står alltid først). */
export function orderKeys(ids) {
  const list = extras(), by = new Map(list.map((x) => [x.id, x]));
  const out = [...ids.map((id) => by.get(id)).filter(Boolean), ...list.filter((x) => !ids.includes(x.id))];
  saveExtras(out);
}
export const resetKey = (id) => setStatus(id, { until: 0, reason: null });

/** Ekte, minimalt kall med én bestemt nøkkel (listing av modeller). */
export async function testKey(id) {
  const k = geminiKeys().find((x) => x.id === id);
  if (!k) throw Object.assign(new Error('Fant ikke nøkkelen'), { status: 404 });
  const t0 = Date.now();
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=5', { headers: { 'x-goog-api-key': k.key }, signal: AbortSignal.timeout(8000) });
  const ms = Date.now() - t0;
  if (res.ok) { setStatus(id, { until: 0, reason: null, lastOk: Date.now() }); return { ok: true, ms, message: `Nøkkelen virker (${ms} ms)` }; }
  const body = await res.text();
  let msg = body; try { msg = JSON.parse(body).error?.message ?? body; } catch { /* tekst */ }
  if (isQuota(res.status, body)) setStatus(id, { ...restFor(res.status, body), lastErr: Date.now() });
  return { ok: false, ms, status: res.status, message: `Gemini svarte ${res.status}: ${String(msg).slice(0, 160)}` };
}
