// Prompt 54 (WHISPER54): helsesjekk for NB-Whisper på Mac mini-en. Bufret og i bakgrunnen (hvert minutt, maks 1,5 s), så ingen
// forespørsel venter på Mac-en: ruteren i voice53 leser bare siste kjente tilstand (nbReady54()).
//   GET {url}/health  med Authorization: Bearer <nøkkel>  (tools/nb-whisper/nbwhisper.py)
//   → 200 {status:'ok', model, engine, languages, device, version}  ·  503 {status:'starting'|'error'}  ·  401/403 feil nøkkel/IP
import { nbConf54, nbConfAll54 } from './config.js';
import { defineFlagOn53, flagDefault53, flagOn53 } from '../flags53.js';
import { currentUser } from '../settings.js';

export const FLAG_NB54 = 'whisper_nb54';
try { defineFlagOn53(FLAG_NB54, 'NB-Whisper (Nasjonalbiblioteket) på Mac mini-en: tale til tekst på norsk og engelsk, og språkdeteksjon. Stille reserve når den ikke svarer.'); } catch (e) { console.warn('[whisper54] flagg:', e.message); }
export const PROBE_MS54 = 1500;
export const POLL_MS54 = 60_000;

let F = (u, i) => globalThis.fetch(u, i);
/** Tester: egen fetch for alle kall til Mac mini-en (null = global fetch). */
export const _setNbFetch54 = (fn) => { F = fn ?? ((u, i) => globalThis.fetch(u, i)); reset54(); };
export const nbFetch54 = (u, i) => F(u, i);

const blank = () => ({ ok: false, status: 'off', ms: null, checkedAt: null, error: null, info: null, inflight: null, tag: null });
let S = blank();
export const reset54 = () => { S = blank(); };
export const nbState54 = () => S;
const str = (v, n = 80) => (v == null ? null : String(v).slice(0, n));

/** Én sjekk (single-flight). → tilstanden */
export function probeNb54() {
  const c = nbConf54();
  const tag = c ? `${c.url}|${c.key}` : '';
  if (S.inflight && S.tag === tag) return S.inflight;
  S.tag = tag;
  if (!c) { Object.assign(S, { ok: false, status: 'off', error: 'Ikke satt opp', checkedAt: Date.now(), info: null, inflight: null }); return Promise.resolve(S); }
  const t0 = Date.now();
  const res = { ok: false, status: 'down', error: null, info: null };
  const p = (async () => {
    try {
      const r = await F(`${c.url}/health`, { headers: { authorization: `Bearer ${c.key}` }, signal: AbortSignal.timeout(PROBE_MS54) });
      const j = await r.json().catch(() => null);
      if (r.status === 401 || r.status === 403) Object.assign(res, { status: 'auth', error: r.status === 401 ? 'Mac mini-en godtok ikke nøkkelen' : 'Mac mini-en avviste avsenderen (IP-filteret)' });
      else if (j?.status === 'error') Object.assign(res, { status: 'error', error: 'Modellen kunne ikke lastes på Mac mini-en (se ~/Library/Logs/nb-whisper.log)' });
      else if (r.status === 503 || j?.status === 'starting') Object.assign(res, { status: 'starting', error: 'Starter (laster modellen)' });
      else if (!r.ok || j?.status !== 'ok') Object.assign(res, { status: 'down', error: `Svarte ${r.status}` });
      else Object.assign(res, { ok: true, status: 'ok', info: { model: str(j.model), engine: str(j.engine, 12), device: str(j.device, 40), version: str(j.version, 20),
        languages: Array.isArray(j.languages) ? j.languages.slice(0, 8).map((x) => str(x, 8)) : null } });
    } catch (e) {
      Object.assign(res, { status: 'down', error: e?.name === 'TimeoutError' ? `Svarte ikke på ${PROBE_MS54 / 1000} s` : `Kan ikke nås (${e?.cause?.code || e?.name || 'feil'})` });
    }
    if (S.tag === tag) Object.assign(S, res, { ms: Date.now() - t0, checkedAt: Date.now() });
    if (S.inflight === p) S.inflight = null;
    return S;
  })();
  S.inflight = p;
  return p;
}

/** Marker som nede etter en feil i et ekte kall (neste bakgrunnssjekk kan slå den på igjen). */
export function markNbDown54(status, error) { Object.assign(S, { ok: false, status: status ?? 'down', error: String(error ?? 'feil').slice(0, 200), checkedAt: Date.now() }); }

/** Flagget (PÅ som standard): for brukeren i forespørselen, ellers serverstandarden. */
export function nbFlag54(user = undefined) {
  const u = user === undefined ? (() => { try { return currentUser(); } catch { return null; } })() : user;
  try { return u ? flagOn53(FLAG_NB54, u) : flagDefault53(FLAG_NB54); } catch { return false; }
}
export const nbConfigured54 = () => !!nbConf54();
/** Klar til bruk: satt opp, flagget på og siste sjekk OK. Blokkerer aldri. */
export const nbReady54 = (user) => !!nbConf54() && nbFlag54(user) && S.ok;

/** Til admin (aldri nøkkelen). */
export function nbHealthOut54() {
  const c = nbConfAll54();
  return { configured: !!nbConf54(), flag: nbFlag54(null), ok: S.ok, status: nbFlag54(null) ? S.status : 'off', url: c.url || null, ms: S.ms,
    checkedAt: S.checkedAt ? new Date(S.checkedAt).toISOString() : null, error: S.error, model: S.info?.model ?? null, engine: S.info?.engine ?? null,
    device: S.info?.device ?? null, version: S.info?.version ?? null };
}

let timer = null;
/** Bakgrunnssjekk hvert minutt (bare når tjenesten er satt opp). Ikke i tester. */
export function startNbHealth54() {
  if (timer || process.env.NODE_ENV === 'test') return;
  const tick = () => { if (nbConf54()) probeNb54().catch(() => {}); };
  const t0 = setTimeout(tick, 2500); t0.unref?.();
  timer = setInterval(tick, POLL_MS54); timer.unref?.();
}
