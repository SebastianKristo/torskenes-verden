// Prompt 53 (DAL53): lat lasting og helse for modellene fra Desert Ant Labs.
//
// Hver modell lastes i bakgrunnen første gang den trengs (eller med POST /api/admin/dal53/preload). Til den er klar, brukes
// reserven (dagens oppførsel) – en forespørsel venter aldri på at en modell lastes. Vektene lastes ned fra Hugging Face til
// DATA_DIR/models/dal53 (aldri i Docker-imaget eller repoet). Feiler lastingen, prøves den på nytt tidligst etter 10 minutter.
//
// Personvern: alt modellene gjør, skjer på serveren. Den native kjernen (koffi + libcurl) gjør to slags nettkall: nedlasting av
// vektene fra Hugging Face (første gang) og lisenskall til Desert Ant Labs (aktivering/telling av enheter – ingen tekst, bilder
// eller lyd). Enhets-id-en vi oppgir er en hash av serveren, aldri en bruker. Se docs/dal-53.md.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from '../config.js';

const require = createRequire(import.meta.url);

/** Modellene. flag = feature flag (QA51), PÅ som standard når pakke og vekter finnes. */
export const MODELS53 = [
  { id: 'eye', name: 'Eye', pkg: '@desert-ant-labs/eye', entry: '/native', cls: 'Eye', flag: 'dal_eye53', purpose: 'Klassifiserer bilder (kvittering/dokument/skjermbilde → OCR, foto → visjonsmodellen) og retter rotasjon før OCR' },
  { id: 'redact', name: 'Redact', pkg: '@desert-ant-labs/redact', entry: '/native', cls: 'Redact', flag: 'dal_redact53', purpose: 'Bytter personopplysninger med plassholdere før tekst går til en sky-modell eller et nettsøk' },
  { id: 'gist', name: 'Gist', pkg: '@desert-ant-labs/gist', entry: '/native', cls: 'Gist', flag: 'dal_gist53', purpose: 'Emner på nyhetssaker (kategorier og «For deg»)' },
  { id: 'tongue', name: 'Tongue', pkg: '@desert-ant-labs/tongue', entry: '', cls: 'Tongue', flag: 'dal_tongue53', purpose: 'Språket i meldingen til Glimt, så svaret kommer på samme språk' },
  { id: 'emo', name: 'Emo', pkg: '@desert-ant-labs/emo', entry: '/native', cls: 'Emo', flag: 'dal_emo53', purpose: 'Emoji-forslag for gjøremål, kalender og huskeliste' },
  { id: 'moderator', name: 'Moderator', pkg: '@desert-ant-labs/moderator', entry: '/native', cls: 'Moderator', flag: 'dal_moderator53', purpose: 'Skjuler upassende bilder for barnekontoer' },
  { id: 'clear', name: 'Clear', pkg: '@desert-ant-labs/clear', entry: '/native', cls: 'Clear', flag: 'dal_voice53', purpose: 'Renser lyd (støy og romklang) før tale til tekst' },
  { id: 'voz', name: 'Voz', pkg: '@desert-ant-labs/voz', entry: '', cls: 'Voz', flag: 'dal_voice53', purpose: 'Tale til tekst med ordtider (25 europeiske språk, ikke norsk)' },
];
const BY_ID = Object.fromEntries(MODELS53.map((m) => [m.id, m]));
export const CREDIT53 = 'Inneholder modeller fra Desert Ant Labs (license.desertant.com)';

export const cacheDir53 = () => resolve(config.dataDir, 'models', 'dal53');
const RETRY_MS = 10 * 60_000;

/** Stabil enhets-id for lisenstellingen: én enhet = denne serveren (aldri en bruker). */
const deviceId53 = () => `homelab-${createHash('sha256').update(`${hostname()}|${resolve(config.dataDir)}`).digest('hex').slice(0, 24)}`;

const state = new Map(); // id → {status, inst, error, loadedAt, loadMs, startedAt, failedAt, uses, fallbacks, lastUsed, promise}
const st = (id) => {
  let s = state.get(id);
  if (!s) { s = { status: 'idle', inst: null, error: null, loadedAt: null, loadMs: null, startedAt: null, failedAt: 0, uses: 0, fallbacks: 0, lastUsed: null, promise: null }; state.set(id, s); }
  return s;
};

/* ---------------- Testsømmer ---------------- */
const loaders = new Map(); // id → async () => instans (mock)
/** Bare for tester: erstatt lasteren for en modell (null fjerner). */
export const _setLoader53 = (id, fn) => { if (fn) loaders.set(id, fn); else loaders.delete(id); const s = st(id); Object.assign(s, { status: 'idle', inst: null, error: null, failedAt: 0, promise: null }); };
/** Bare for tester: nullstill all tilstand. */
export const _reset53 = () => { state.clear(); loaders.clear(); };
/** Autolasting: av i tester (ingen nedlasting fra nettet) med mindre en mock-laster er satt eller DAL53_AUTOLOAD=1. */
const autoload = (id) => loaders.has(id) || id === 'tongue' || process.env.DAL53_AUTOLOAD === '1' || (process.env.NODE_ENV !== 'test' && process.env.DAL53_AUTOLOAD !== '0');

/* ---------------- Pakkene ---------------- */
const pkgInfo = new Map();
/** {installed, version, path} for pakken (uten å laste den). */
export function packageInfo53(id) {
  if (pkgInfo.has(id)) return pkgInfo.get(id);
  const m = BY_ID[id];
  let out = { installed: false, version: null };
  try {
    const pj = require(`${m.pkg}/package.json`);
    out = { installed: true, version: pj.version };
  } catch {
    try { require.resolve(m.pkg + (m.entry || '')); out = { installed: true, version: null }; } catch { /* mangler */ }
  }
  pkgInfo.set(id, out);
  return out;
}

async function realLoad(id) {
  const m = BY_ID[id];
  const cacheRoot = cacheDir53();
  mkdirSync(cacheRoot, { recursive: true });
  // Vertsinnstillingene leses av den native kjernen fra miljøet ved første lasting.
  process.env.DAL_DEVICE_ID ||= deviceId53();
  if (id === 'tongue') {
    const { Tongue } = await import(m.pkg);
    return Tongue.load();
  }
  if (id === 'voz') {
    process.env.DAL_CACHE_ROOT ||= cacheRoot;
    const [{ Voz }, ort] = await Promise.all([import(m.pkg), import('onnxruntime-node')]);
    return Voz.load({ ort, ep: 'cpu' });
  }
  const mod = await import(m.pkg + m.entry);
  return mod[m.cls].load({ cacheRoot });
}

/** Start lasting i bakgrunnen (idempotent). → promise (løses med instansen eller null). */
export function load53(id, { force = false } = {}) {
  const m = BY_ID[id];
  if (!m) return Promise.resolve(null);
  const s = st(id);
  if (s.status === 'ready') return Promise.resolve(s.inst);
  if (s.promise) return s.promise;
  if (!loaders.has(id) && !packageInfo53(id).installed) { s.status = 'missing'; s.error = `Pakken ${m.pkg} er ikke installert`; return Promise.resolve(null); }
  if (!force && s.status === 'error' && Date.now() - s.failedAt < RETRY_MS) return Promise.resolve(null);
  s.status = 'loading'; s.error = null; s.startedAt = Date.now();
  const fn = loaders.get(id) ?? (() => realLoad(id));
  s.promise = (async () => {
    try {
      const inst = await fn();
      Object.assign(s, { status: 'ready', inst, loadedAt: Date.now(), loadMs: Date.now() - s.startedAt, error: null });
      console.info(`[dal53] ${m.name} er klar (${s.loadMs} ms)`);
      return inst;
    } catch (e) {
      const msg = String(e?.message ?? e).replace(/(token|key|authorization)=\S+/gi, '$1=***').slice(0, 300);
      Object.assign(s, { status: 'error', inst: null, error: msg, failedAt: Date.now() });
      console.warn(`[dal53] ${m.name} kunne ikke lastes: ${msg}`);
      return null;
    } finally { s.promise = null; }
  })();
  return s.promise;
}

/**
 * Instansen hvis den er klar, ellers null (og lasting startes i bakgrunnen). Blokkerer aldri.
 * Kalleren bruker reserven når svaret er null.
 */
export function ready53(id) {
  const s = st(id);
  if (s.status === 'ready') return s.inst;
  if (s.status !== 'loading' && autoload(id)) load53(id).catch(() => {});
  return null;
}

/**
 * Kjør fn(instans) med tidsgrense. → resultatet, eller null (ikke klar, feil eller tidsavbrudd = reserven).
 * Feil i selve kjøringen logges uten innholdet.
 */
export async function use53(id, fn, { timeoutMs = 2000 } = {}) {
  const s = st(id);
  const inst = ready53(id);
  if (!inst) { s.fallbacks++; return null; }
  s.uses++; s.lastUsed = Date.now();
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(() => fn(inst)), new Promise((res) => { timer = setTimeout(() => res(null), timeoutMs); timer.unref?.(); })]);
  } catch (e) {
    s.fallbacks++;
    console.warn(`[dal53] ${BY_ID[id]?.name ?? id} feilet: ${String(e?.message ?? e).slice(0, 160)}`);
    return null;
  } finally { clearTimeout(timer); }
}

function dirSize(dir) {
  let n = 0;
  try { for (const f of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, f.name); n += f.isDirectory() ? dirSize(p) : statSync(p).size; } } catch { /* tom */ }
  return n;
}

/** Helse per modell (til admin). flagOn: (flag) → bool. */
export function health53({ flagOn = () => true } = {}) {
  const models = MODELS53.map((m) => {
    const s = st(m.id), p = packageInfo53(m.id);
    const status = !p.installed && !loaders.has(m.id) ? 'missing' : s.status;
    return { id: m.id, name: m.name, package: m.pkg, version: p.version, installed: p.installed || loaders.has(m.id), status, ready: status === 'ready',
      error: status === 'missing' ? `Pakken ${m.pkg} er ikke installert` : s.error, flag: m.flag, flag_on: !!flagOn(m.flag), purpose: m.purpose,
      loaded_at: s.loadedAt ? new Date(s.loadedAt).toISOString() : null, load_ms: s.loadMs, uses: s.uses, fallbacks: s.fallbacks,
      last_used: s.lastUsed ? new Date(s.lastUsed).toISOString() : null, retry_at: s.status === 'error' ? new Date(s.failedAt + RETRY_MS).toISOString() : null };
  });
  return { models, cache_dir: cacheDir53(), cache_bytes: dirSize(cacheDir53()), platform: `${process.platform}-${process.arch}`,
    native_ok: ['linux-x64', 'linux-arm64', 'darwin-arm64'].includes(`${process.platform}-${process.arch}`), credit: CREDIT53 };
}

export const model53 = (id) => BY_ID[id] ?? null;
