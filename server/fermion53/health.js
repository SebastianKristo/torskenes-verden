// Prompt 53 (FERMION53): helsesjekk for Neutrino og Phonon på Mac mini-en. Bufret og i bakgrunnen, så ingen forespørsel venter på
// Mac-en: modellvalget og ASR-valget leser bare siste kjente tilstand (ready()). Sjekken tar maks 1,5 s per tjeneste.
//   GET {url}/health  med Authorization: Bearer <nøkkel>  (vakten i tools/fermion/guard.py)
//   → 200 {status:'ok', model, kind, backend?, context?, profile?}  ·  503 {status:'starting'}  ·  401/403 feil nøkkel/IP
import { neutrinoConf53, phononConf53, fermionConf53 } from './config.js';
import { flagDefault53 } from '../flags53.js';

export const FLAG_NEUTRINO53 = 'fermion_neutrino53';
export const FLAG_PHONON53 = 'fermion_phonon53';
export const PROBE_MS53 = 1500;
export const POLL_MS53 = 60_000;

let F = (u, i) => globalThis.fetch(u, i);
/** Tester: egen fetch for alle kall til Mac mini-en (null = global fetch). */
export const _setFermionFetch53 = (fn) => { F = fn ?? ((u, i) => globalThis.fetch(u, i)); reset53(); };
export const fermionFetch53 = (u, i) => F(u, i);

const blank = () => ({ ok: false, status: 'off', ms: null, checkedAt: null, error: null, info: null, inflight: null, tag: null });
const S = { neutrino: blank(), phonon: blank() };
export const reset53 = () => { S.neutrino = blank(); S.phonon = blank(); };
const confOf = (svc) => (svc === 'neutrino' ? neutrinoConf53() : phononConf53());

/** Én sjekk (single-flight per tjeneste). → tilstanden */
export function probe53(svc) {
  const st = S[svc];
  const c = confOf(svc);
  const tag = c ? `${c.url}|${c.key}` : '';
  if (st.inflight && st.tag === tag) return st.inflight;
  st.tag = tag; // nytt oppsett: en sjekk med det gamle som fortsatt pågår, skal ikke overskrive resultatet
  if (!c) { Object.assign(st, { ok: false, status: 'off', error: 'Ikke satt opp', checkedAt: Date.now(), info: null, inflight: null }); return Promise.resolve(st); }
  const t0 = Date.now();
  const res = { ok: false, status: 'down', error: null, info: null };
  const p = (async () => {
    const st = res;
    try {
      const r = await F(`${c.url}/health`, { headers: { authorization: `Bearer ${c.key}` }, signal: AbortSignal.timeout(PROBE_MS53) });
      const j = await r.json().catch(() => null);
      if (r.status === 401 || r.status === 403) Object.assign(st, { ok: false, status: 'auth', error: r.status === 401 ? 'Mac mini-en godtok ikke nøkkelen' : 'Mac mini-en avviste avsenderen (IP-filteret)', info: null });
      else if (r.status === 503 || j?.status === 'starting') Object.assign(st, { ok: false, status: 'starting', error: 'Starter (laster ned eller inn modellen)', info: null });
      else if (!r.ok || j?.status !== 'ok') Object.assign(st, { ok: false, status: 'down', error: `Svarte ${r.status}`, info: null });
      else Object.assign(st, { ok: true, status: 'ok', error: null, info: { model: str(j.model), kind: str(j.kind), backend: str(j.backend), context: Number(j.context) || null, profile: str(j.profile), version: str(j.version) } });
    } catch (e) {
      Object.assign(st, { ok: false, status: 'down', error: e?.name === 'TimeoutError' ? `Svarte ikke på ${PROBE_MS53 / 1000} s` : `Kan ikke nås (${e?.cause?.code || e?.name || 'feil'})`, info: null });
    }
    const cur = S[svc];
    if (cur.tag === tag) Object.assign(cur, res, { ms: Date.now() - t0, checkedAt: Date.now() });
    if (cur.inflight === p) cur.inflight = null;
    return cur;
  })();
  st.inflight = p;
  return p;
}
const str = (v) => (v == null ? null : String(v).slice(0, 120));

/** Marker tjenesten som nede etter en feil i et ekte kall (neste bakgrunnssjekk kan slå den på igjen). */
export function markDown53(svc, error) { Object.assign(S[svc], { ok: false, status: 'down', error: String(error ?? 'feil').slice(0, 200), checkedAt: Date.now() }); }
export const state53 = (svc) => S[svc];

export const flagOnNeutrino53 = () => flagDefault53(FLAG_NEUTRINO53);
export const flagOnPhonon53 = () => flagDefault53(FLAG_PHONON53);
/** Klar til bruk: satt opp, flagget på og siste sjekk OK. Blokkerer aldri. */
export const neutrinoReady53 = () => !!neutrinoConf53() && flagOnNeutrino53() && S.neutrino.ok;
export const phononReady53 = () => !!phononConf53() && flagOnPhonon53() && S.phonon.ok;

/** Til admin. */
export function healthOut53() {
  const c = fermionConf53();
  const one = (svc, flag) => {
    const st = S[svc];
    return { configured: !!confOf(svc), flag, ok: st.ok, status: flag ? st.status : 'off', url: c[svc].url || null, ms: st.ms, checkedAt: st.checkedAt ? new Date(st.checkedAt).toISOString() : null, error: st.error, info: st.info };
  };
  return { neutrino: one('neutrino', flagOnNeutrino53()), phonon: one('phonon', flagOnPhonon53()) };
}

let timer = null;
/** Bakgrunnssjekk hvert minutt (bare når tjenesten er satt opp). Ikke i tester. */
export function startHealth53() {
  if (timer || process.env.NODE_ENV === 'test') return;
  const tick = () => { for (const svc of ['neutrino', 'phonon']) if (confOf(svc)) probe53(svc).catch(() => {}); };
  const t0 = setTimeout(tick, 2000); t0.unref?.();
  timer = setInterval(tick, POLL_MS53); timer.unref?.();
}
