// Prompt 53 (FERMION53): oppsettet for Fermion Research-tjenestene på Mac mini-en (Neutrino-1 8B og Phonon), bare admin.
// Lagret i kv(OWNER, 'fermion53'): {neutrinoUrl, neutrinoKey (kryptert), phononUrl, phononKey (kryptert), phononModel}.
// Miljøvariabler er reserve: FERMION_NEUTRINO_URL, FERMION_NEUTRINO_KEY, FERMION_PHONON_URL, FERMION_PHONON_KEY, FERMION_PHONON_MODEL.
// Nøklene sendes aldri til klienten og logges aldri. Adressene må peke til en maskin i huset (LAN), aldri ut.
import { kv, OWNER } from '../db.js';
import { seal, unseal } from '../finans/db.js';

const KEY = 'fermion53';
export const PHONON_MODELS53 = ['phonon-2.5', 'phonon-2', 'phonon-2.5-en'];
export const DEFAULT_PHONON_MODEL53 = 'phonon-2.5';

const raw = () => { try { return kv.get(OWNER, KEY, {}) ?? {}; } catch { return {}; } };
const trimUrl = (u) => String(u ?? '').trim().replace(/\/+$/, '');

/**
 * Bare adresser i huset: privat IPv4 (10/8, 172.16/12, 192.168/16, 100.64/10 – CGNAT/Tailscale), localhost, .local/.lan/.home.arpa/.internal
 * og enkle Docker-/vertsnavn uten punktum. http eller https. → {ok, url, error}
 */
export function inHouseUrl53(u) {
  const s = trimUrl(u);
  if (!s) return { ok: true, url: '' };
  let p;
  try { p = new URL(s); } catch { return { ok: false, error: 'Ugyldig adresse' }; }
  if (!/^https?:$/.test(p.protocol)) return { ok: false, error: 'Adressen må starte med http:// eller https://' };
  if (p.username || p.password) return { ok: false, error: 'Adressen kan ikke inneholde brukernavn eller passord' };
  if (p.pathname !== '/' && p.pathname !== '') return { ok: false, error: 'Bare vert og port, uten sti (f.eks. http://10.69.1.173:8000)' };
  const h = p.hostname.toLowerCase();
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  let ok = false;
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    ok = a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  } else ok = h === 'localhost' || /\.(local|lan|home\.arpa|internal)$/.test(h) || /^[a-z0-9][a-z0-9-]{0,62}$/.test(h);
  if (!ok) return { ok: false, error: 'Adressen må være i huset (LAN). Fermion-tjenestene skal aldri nås via internett eller Cloudflare.' };
  return { ok: true, url: `${p.protocol}//${p.host}` };
}

/** Det effektive oppsettet (lagret > miljø). Nøklene i klartekst – bare til bruk i serveren. */
export function fermionConf53() {
  const r = raw();
  const pick = (k, env) => (r[k] !== undefined && r[k] !== null ? r[k] : process.env[env] ?? '');
  const url = (k, env) => { const v = inHouseUrl53(pick(k, env)); return v.ok ? v.url : ''; };
  const key = (k, env) => { const v = r[k] !== undefined && r[k] !== null ? unseal(r[k]) : process.env[env] ?? ''; return String(v ?? '').trim(); };
  const pm = String(pick('phononModel', 'FERMION_PHONON_MODEL') || DEFAULT_PHONON_MODEL53).toLowerCase();
  return {
    neutrino: { url: url('neutrinoUrl', 'FERMION_NEUTRINO_URL'), key: key('neutrinoKey', 'FERMION_NEUTRINO_KEY') },
    phonon: { url: url('phononUrl', 'FERMION_PHONON_URL'), key: key('phononKey', 'FERMION_PHONON_KEY'), model: PHONON_MODELS53.includes(pm) ? pm : DEFAULT_PHONON_MODEL53 },
  };
}
export const neutrinoConf53 = () => { const c = fermionConf53().neutrino; return c.url && c.key ? c : null; };
export const phononConf53 = () => { const c = fermionConf53().phonon; return c.url && c.key ? c : null; };

/** Til admin-klienten: aldri nøklene, bare om de er satt. */
export function confOut53() {
  const c = fermionConf53();
  return { neutrinoUrl: c.neutrino.url || null, neutrinoKeySet: !!c.neutrino.key, phononUrl: c.phonon.url || null, phononKeySet: !!c.phonon.key, phononModel: c.phonon.model };
}

/** Lagrer et delvis oppsett. Tom streng fjerner (null = behold). → {ok, error?} */
export function saveConf53(patch = {}) {
  const cur = { ...raw() };
  for (const k of ['neutrinoUrl', 'phononUrl']) {
    if (patch[k] === undefined || patch[k] === null) continue;
    const v = inHouseUrl53(patch[k]);
    if (!v.ok) return { ok: false, error: `${k === 'neutrinoUrl' ? 'Neutrino' : 'Phonon'}: ${v.error}` };
    cur[k] = v.url;
  }
  for (const k of ['neutrinoKey', 'phononKey']) {
    if (patch[k] === undefined || patch[k] === null) continue;
    const v = String(patch[k]).trim();
    if (v && (v.length < 16 || v.length > 256 || /\s/.test(v))) return { ok: false, error: 'Nøkkelen må være 16–256 tegn uten mellomrom (den install.sh skrev ut)' };
    cur[k] = v ? seal(v) : '';
  }
  if (patch.phononModel !== undefined && patch.phononModel !== null) {
    const m = String(patch.phononModel).toLowerCase();
    if (!PHONON_MODELS53.includes(m)) return { ok: false, error: `Ukjent Phonon-modell (bruk ${PHONON_MODELS53.join(', ')})` };
    cur.phononModel = m;
  }
  kv.set(OWNER, KEY, cur);
  return { ok: true };
}
