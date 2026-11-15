// Prompt 57 (VOX57): helsesjekk for VoxCPM2 på Mac mini-en. Bufret og i bakgrunnen (hvert minutt, maks 1,5 s), så ingen
// forespørsel venter på Mac-en: /api/tts leser bare siste kjente tilstand (vxReady57()).
//   GET {url}/health  med Authorization: Bearer <nøkkel>  (tools/voxcpm/voxcpm_service.py)
//   → 200 {status:'ok', model, engine, quant, device, loaded, idle_unload_min, memory, refs, version}  ·  503 {status:'error'}  ·  401/403
import { vxConf57, vxConfAll57 } from './config.js';

export const PROBE_MS57 = 1500;
export const POLL_MS57 = 60_000;

let F = (u, i) => globalThis.fetch(u, i);
/** Tester: egen fetch for alle kall til Mac mini-en (null = global fetch). */
export const _setVxFetch57 = (fn) => { F = fn ?? ((u, i) => globalThis.fetch(u, i)); reset57(); };
export const vxFetch57 = (u, i) => F(u, i);

const blank = () => ({ ok: false, status: 'off', ms: null, checkedAt: null, error: null, info: null, inflight: null, tag: null });
let S = blank();
export const reset57 = () => { S = blank(); };
export const vxState57 = () => S;
const str = (v, n = 80) => (v == null ? null : String(v).slice(0, n));
const num = (v) => (Number.isFinite(+v) ? +v : null);

/** Én sjekk (single-flight). → tilstanden */
export function probeVx57() {
  const c = vxConf57();
  const tag = c ? `${c.url}|${c.key}` : '';
  if (S.inflight && S.tag === tag) return S.inflight;
  S.tag = tag;
  if (!c) { Object.assign(S, { ok: false, status: 'off', error: 'Ikke satt opp', checkedAt: Date.now(), info: null, inflight: null }); return Promise.resolve(S); }
  const t0 = Date.now();
  const res = { ok: false, status: 'down', error: null, info: null };
  const p = (async () => {
    try {
      const r = await F(`${c.url}/health`, { headers: { authorization: `Bearer ${c.key}` }, signal: AbortSignal.timeout(PROBE_MS57) });
      const j = await r.json().catch(() => null);
      if (r.status === 401 || r.status === 403) Object.assign(res, { status: 'auth', error: r.status === 401 ? 'Mac mini-en godtok ikke nøkkelen' : 'Mac mini-en avviste avsenderen (IP-filteret)' });
      else if (j?.status === 'error') Object.assign(res, { status: 'error', error: 'VoxCPM er ikke klar på Mac mini-en (se ~/Library/Logs/voxcpm.log)' });
      else if (!r.ok || j?.status !== 'ok') Object.assign(res, { status: 'down', error: `Svarte ${r.status}` });
      else Object.assign(res, { ok: true, status: 'ok', info: { model: str(j.model), engine: str(j.engine, 12), quant: str(j.quant, 12), device: str(j.device, 40), version: str(j.version, 20),
        loaded: !!j.loaded, idleUnloadMin: num(j.idle_unload_min), memoryMb: num(j.memory?.model_estimate_mb) ?? null, peakRssMb: num(j.memory?.peak_rss_mb), ffmpeg: j.ffmpeg !== false } });
    } catch (e) {
      Object.assign(res, { status: 'down', error: e?.name === 'TimeoutError' ? `Svarte ikke på ${PROBE_MS57 / 1000} s` : `Kan ikke nås (${e?.cause?.code || e?.name || 'feil'})` });
    }
    if (S.tag === tag) Object.assign(S, res, { ms: Date.now() - t0, checkedAt: Date.now() });
    if (S.inflight === p) S.inflight = null;
    return S;
  })();
  S.inflight = p;
  return p;
}

/** Marker som nede etter en feil i et ekte kall (neste bakgrunnssjekk kan slå den på igjen). */
export function markVxDown57(status, error) { Object.assign(S, { ok: false, status: status ?? 'down', error: String(error ?? 'feil').slice(0, 200), checkedAt: Date.now() }); }

export const vxConfigured57 = () => !!vxConf57();
/** Klar til bruk: satt opp og siste sjekk OK. Blokkerer aldri. */
export const vxReady57 = () => !!vxConf57() && S.ok;

/** Til admin (aldri nøkkelen). */
export function vxHealthOut57() {
  const c = vxConfAll57();
  return { configured: !!vxConf57(), ok: S.ok, status: S.status, url: c.url || null, ms: S.ms, checkedAt: S.checkedAt ? new Date(S.checkedAt).toISOString() : null, error: S.error,
    model: S.info?.model ?? null, engine: S.info?.engine ?? null, quant: S.info?.quant ?? null, device: S.info?.device ?? null, loaded: S.info?.loaded ?? null,
    memoryMb: S.info?.memoryMb ?? null, idleUnloadMin: S.info?.idleUnloadMin ?? null, version: S.info?.version ?? null };
}

let timer = null;
/** Bakgrunnssjekk hvert minutt (bare når tjenesten er satt opp). Ikke i tester. */
export function startVxHealth57() {
  if (timer || process.env.NODE_ENV === 'test') return;
  const tick = () => { if (vxConf57()) probeVx57().catch(() => {}); };
  const t0 = setTimeout(tick, 3000); t0.unref?.();
  timer = setInterval(tick, POLL_MS57); timer.unref?.();
}
