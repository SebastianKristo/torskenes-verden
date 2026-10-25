// Prompt 58 (OMLX58): modellisten og helsa til oMLX på Mac mini-en. GET {url}/v1/models med Bearer-nøkkelen (fungerer både mot vakten
// i tools/omlx/guard.py og mot oMLX direkte på localhost). Bufret i 60 s, kort tidsgrense, så ingen forespørsel venter lenge på Mac-en.
// Modell-ID-er: oMLX oppgir mappenavnet (eller et alias). Ligger modellen i en organisasjonsmappe (mlx-community/Qwen3-8B-4bit/), kan
// ID-en være med eller uten «mlx-community/» – resolveModel58 godtar begge (samme regel som oMLX selv: alias og mappenavn).
import { omlxConf58 } from './config.js';

let F = (u, i) => globalThis.fetch(u, i);
/** Tester: egen fetch for kall til oMLX (null = global fetch). */
export const _setOmlxFetch58 = (fn) => { F = fn ?? ((u, i) => globalThis.fetch(u, i)); invalidate58(); };
export const omlxFetch58 = (u, i) => F(u, i);
export const PROBE_MS58 = 3000;
export const INV_TTL58 = 60_000;

const inv = { at: 0, tag: '', ok: false, status: 'off', error: null, models: [], loaded: null, ms: null, checkedAt: null, inflight: null };
export const invalidate58 = () => { inv.at = 0; inv.tag = ''; };
const mask = (s, key) => { let t = String(s ?? ''); if (key && key.length >= 4) t = t.split(key).join('••••'); return t.replace(/(Bearer\s+)[^\s"',}]+/gi, '$1••••').slice(0, 200); };

/** Lastet-status fra /v1/models når oMLX oppgir den (feltene er ikke dokumentert; null = ukjent). */
function loadedOf(m) {
  if (typeof m?.loaded === 'boolean') return m.loaded;
  if (typeof m?.is_loaded === 'boolean') return m.is_loaded;
  const s = String(m?.status ?? m?.state ?? '').toLowerCase();
  if (/^(loaded|ready|running|active)$/.test(s)) return true;
  if (/^(unloaded|idle|available|not_loaded)$/.test(s)) return false;
  return null;
}
const ctxOf = (m) => Number(m?.max_context ?? m?.context_length ?? m?.max_model_len ?? m?.context_window) || null;

/** Modellisten (/v1/models), bufret. → {ok, status:'ok'|'auth'|'down'|'off', error, models:[{id, maxContext, loaded}], loaded:[id]|null, ms} */
export async function omlxModels58({ force = false } = {}) {
  const c = omlxConf58();
  const tag = c.url ? `${c.url}|${c.key}` : '';
  if (!tag) return Object.assign(inv, { ok: false, status: 'off', error: 'Ikke satt opp', models: [], loaded: null, tag: '' });
  if (!force && inv.tag === tag && Date.now() - inv.at < INV_TTL58) return inv;
  if (inv.inflight && inv.tag === tag) return inv.inflight;
  inv.tag = tag;
  const t0 = Date.now();
  const p = (async () => {
    const out = { ok: false, status: 'down', error: null, models: [], loaded: null };
    try {
      const r = await F(`${c.url}/v1/models`, { headers: c.key ? { authorization: `Bearer ${c.key}` } : {}, signal: AbortSignal.timeout(PROBE_MS58) });
      const j = await r.json().catch(() => null);
      if (r.status === 401 || r.status === 403) Object.assign(out, { status: 'auth', error: r.status === 401 ? 'oMLX godtok ikke nøkkelen' : 'Mac mini-en avviste avsenderen (IP-filteret)' });
      else if (r.status === 503) Object.assign(out, { status: 'starting', error: 'oMLX starter' });
      else if (!r.ok) Object.assign(out, { error: `Svarte ${r.status}${j?.error?.message ? `: ${mask(j.error.message, c.key)}` : ''}` });
      else {
        const list = (Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : []).map((m) => ({ id: String(m.id ?? m.name ?? ''), maxContext: ctxOf(m), loaded: loadedOf(m) })).filter((m) => m.id);
        const known = list.filter((m) => m.loaded !== null);
        Object.assign(out, { ok: true, status: 'ok', models: list, loaded: known.length ? known.filter((m) => m.loaded).map((m) => m.id) : null });
      }
    } catch (e) {
      Object.assign(out, { error: e?.name === 'TimeoutError' ? `Svarte ikke på ${PROBE_MS58 / 1000} s` : `Kan ikke nås (${e?.cause?.code || e?.name || 'feil'})` });
    }
    if (inv.tag === tag) Object.assign(inv, out, { at: Date.now(), ms: Date.now() - t0, checkedAt: Date.now() });
    if (inv.inflight === p) inv.inflight = null;
    return inv;
  })();
  inv.inflight = p;
  return p;
}
/** Siste kjente tilstand uten nytt kall. */
export const omlxState58 = () => inv;
/** Marker oMLX som nede etter en feil i et ekte kall (neste sjekk kan slå den på igjen). */
export function markDown58(error) { Object.assign(inv, { ok: false, status: 'down', error: String(error ?? 'feil').slice(0, 200), checkedAt: Date.now(), at: Date.now() }); }

const base = (id) => String(id ?? '').split('/').pop().toLowerCase();
/** Finn den ekte ID-en i listen: eksakt, uten store/små bokstaver, eller samme mappenavn (uten organisasjon). → id | null */
export function resolveModel58(id, list = inv.models) {
  const want = String(id ?? '').trim();
  if (!want || !list?.length) return null;
  const ids = list.map((m) => (typeof m === 'string' ? m : m.id));
  return ids.find((x) => x === want) ?? ids.find((x) => x.toLowerCase() === want.toLowerCase()) ?? ids.find((x) => base(x) === base(want)) ?? null;
}
/** max_context for modellen fra /v1/models (bufret), eller null. */
export const maxContext58 = (id) => { const r = resolveModel58(id); return r ? inv.models.find((m) => m.id === r)?.maxContext ?? null : null; };
