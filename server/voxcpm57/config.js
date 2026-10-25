// Prompt 57 (VOX57): oppsettet for VoxCPM2 på Mac mini-en (tools/voxcpm), bare admin.
// Lagret i kv(OWNER, 'voxcpm57'): {url, key (kryptert med seal)}. Miljøvariabler er reserve: VOXCPM_URL, VOXCPM_KEY.
// Nøkkelen sendes aldri til klienten og logges aldri. Adressen må være i huset (samme regel som FERMION53/WHISPER54: inHouseUrl53).
import { kv, OWNER } from '../db.js';
import { seal, unseal } from '../finans/db.js';
import { inHouseUrl53 } from '../fermion53/config.js';

const KEY = 'voxcpm57';
const raw = () => { try { return kv.get(OWNER, KEY, {}) ?? {}; } catch { return {}; } };

/** Det effektive oppsettet (lagret > miljø). Nøkkelen i klartekst – bare til bruk i serveren. */
export function vxConfAll57() {
  const r = raw();
  const u = r.url !== undefined && r.url !== null ? r.url : process.env.VOXCPM_URL ?? '';
  const v = inHouseUrl53(u);
  const k = r.key !== undefined && r.key !== null ? unseal(r.key) : process.env.VOXCPM_KEY ?? '';
  return { url: v.ok ? v.url : '', key: String(k ?? '').trim(), urlRejected: !v.ok };
}
/** {url, key} når begge er satt, ellers null. */
export const vxConf57 = () => { const c = vxConfAll57(); return c.url && c.key ? { url: c.url, key: c.key } : null; };

/** Til admin-klienten: aldri nøkkelen, bare om den er satt. */
export function vxConfOut57() {
  const c = vxConfAll57();
  return { url: c.url || null, keySet: !!c.key, ...(c.urlRejected ? { urlError: 'Adressen i VOXCPM_URL er ikke i huset og brukes ikke' } : {}) };
}

/** Lagrer et delvis oppsett {url?, key?}. Tom streng fjerner (null/undefined = behold). → {ok, error?} */
export function saveVxConf57(patch = {}) {
  const cur = { ...raw() };
  if (patch.url !== undefined && patch.url !== null) {
    const v = inHouseUrl53(patch.url);
    if (!v.ok) return { ok: false, error: `VoxCPM: ${v.error}` };
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
