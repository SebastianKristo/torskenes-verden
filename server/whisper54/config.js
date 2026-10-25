// Prompt 54 (WHISPER54): oppsettet for NB-Whisper på Mac mini-en (tools/nb-whisper), bare admin.
// Lagret i kv(OWNER, 'whisper54'): {url, key (kryptert med seal)}. Miljøvariabler er reserve: NBWHISPER_URL, NBWHISPER_KEY.
// Nøkkelen sendes aldri til klienten og logges aldri. Adressen må være i huset (samme regel som FERMION53: inHouseUrl53).
import { kv, OWNER } from '../db.js';
import { seal, unseal } from '../finans/db.js';
import { inHouseUrl53 } from '../fermion53/config.js';

const KEY = 'whisper54';
const raw = () => { try { return kv.get(OWNER, KEY, {}) ?? {}; } catch { return {}; } };

/** Det effektive oppsettet (lagret > miljø). Nøkkelen i klartekst – bare til bruk i serveren. */
export function nbConfAll54() {
  const r = raw();
  const u = r.url !== undefined && r.url !== null ? r.url : process.env.NBWHISPER_URL ?? '';
  const v = inHouseUrl53(u);
  const k = r.key !== undefined && r.key !== null ? unseal(r.key) : process.env.NBWHISPER_KEY ?? '';
  return { url: v.ok ? v.url : '', key: String(k ?? '').trim(), urlRejected: !v.ok };
}
/** {url, key} når begge er satt, ellers null. */
export const nbConf54 = () => { const c = nbConfAll54(); return c.url && c.key ? { url: c.url, key: c.key } : null; };

/** Til admin-klienten: aldri nøkkelen, bare om den er satt. */
export function nbConfOut54() {
  const c = nbConfAll54();
  return { url: c.url || null, keySet: !!c.key, ...(c.urlRejected ? { urlError: 'Adressen i NBWHISPER_URL er ikke i huset og brukes ikke' } : {}) };
}

/** Lagrer et delvis oppsett {url?, key?}. Tom streng fjerner (null/undefined = behold). → {ok, error?} */
export function saveNbConf54(patch = {}) {
  const cur = { ...raw() };
  if (patch.url !== undefined && patch.url !== null) {
    const v = inHouseUrl53(patch.url);
    if (!v.ok) return { ok: false, error: `NB-Whisper: ${v.error}` };
    cur.url = v.url;
  }
  if (patch.key !== undefined && patch.key !== null) {
    const v = String(patch.key).trim();
    if (v && (v.length < 16 || v.length > 256 || /\s/.test(v))) return { ok: false, error: 'Nøkkelen må være 16–256 tegn uten mellomrom (den install.sh skrev ut)' };
    cur.key = v ? seal(v) : '';
  }
  kv.set(OWNER, KEY, cur);
  return { ok: true };
}
