// Prompt 48 (SERVER48): innstillingene for kvitteringskjeden og sperren for eksterne tjenester.
//   settings.macOcrUrl   – adressen til Mac-OCR-tjenesten (standard http://10.69.1.173:8765, bare admin, vises ikke til andre)
//   secret('macOcrKey')  – nøkkelen (kryptert som de andre hemmelighetene, sendes aldri ut og logges aldri)
//   settings.receipts48  – av/på per steg og modell: {deviceOcr, deviceParse, macOcr, tesseract, compareMac, (gemini fjernet i prompt 52)
//                          textModel:'qwen3:8b', macOcrTimeoutS:30, modelTimeoutS:90,
//                          prompt 72 (LFM72, av som standard): visionEngine72 ('qwen25vl' | 'lfm3vl' | 'lfm25layout') for steg V,
//                          crossCheck72 ('off' | 'lfm3vl' | 'lfm25layout') for den ekstra totalkontrollen i crossCheck51,
//                          layoutStep72 (steg L: LFM2.5-layout ordner Mac-OCR-linjene før qwen3:8b), lfmBackend72 ('ollama' | 'omlx'),
//                          lfm3Model72 / lfm25Model72 (tom = standard for motoren, se lfm72.js). Bare admin (receipts48 er i SERVER_KEYS).}
import { settings, secret } from '../finans/db.js';
import { routing, budgetState } from '../ai-run.js';

export const MAC_OCR_DEFAULT_URL = 'http://10.69.1.173:8765';
// Prompt 52 (SRV52): steget «gemini» er fjernet (kvitteringer leses bare lokalt). Lagrede/innsendte gemini-verdier ignoreres.
export const R48_DEFAULTS = Object.freeze({ deviceOcr: true, deviceParse: true, macOcr: true, tesseract: true, compareMac: true, textModel: 'qwen3:8b', macOcrTimeoutS: 30, modelTimeoutS: 90 });
// Prompt 72: LFM-motorene er valgbare, men av som standard (dagens kjede: Apple Vision + qwen3:8b, V = qwen2.5vl). Lagres bare når de er satt;
// r48Settings fletter inn standarden.
export const R72_DEFAULTS = Object.freeze({ visionEngine72: 'qwen25vl', crossCheck72: 'off', layoutStep72: false, lfmBackend72: 'ollama', lfm3Model72: '', lfm25Model72: '' });
export const VISION_ENGINES72 = ['qwen25vl', 'lfm3vl', 'lfm25layout'];
export const CROSS_ENGINES72 = ['off', 'lfm3vl', 'lfm25layout'];
export const LFM_BACKENDS72 = ['ollama', 'omlx'];
/** Modellnavn som peker ut av huset (sky-leverandører eller Ollamas «:cloud»-modeller) godtas aldri for kvitteringer. */
export const CLOUD_MODEL72 = /(^|[:/-])cloud\b|^(models\/)?(gemini|gpt-(?!oss)|o\d\b|groq|openrouter|openai|meta-llama\/|moonshotai\/)|^(openrouter|groq|gemini|openai)\//i;
export const R48_STEPS = ['deviceParse', 'deviceOcr', 'macOcr', 'tesseract'];
const BOOL_KEYS = [...R48_STEPS, 'compareMac', 'layoutStep72'];

/** Validerer (og fletter inn i base): ukjente felt droppes, ugyldige verdier beholder base. */
export function cleanReceipts48(v, base = {}) {
  const out = { ...R48_DEFAULTS, ...pick(base) };
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const k of BOOL_KEYS) if (typeof v[k] === 'boolean') out[k] = v[k];
  if (typeof v.textModel === 'string' && /^[a-z0-9._:\-/]{2,80}$/i.test(v.textModel.trim())) out.textModel = v.textModel.trim();
  if (Number.isFinite(+v.macOcrTimeoutS) && v.macOcrTimeoutS !== null) out.macOcrTimeoutS = Math.min(120, Math.max(3, Math.round(+v.macOcrTimeoutS)));
  if (Number.isFinite(+v.modelTimeoutS) && v.modelTimeoutS !== null) out.modelTimeoutS = Math.min(300, Math.max(10, Math.round(+v.modelTimeoutS)));
  // Prompt 72: motorvalg og modellnavn for LFM. Ukjente verdier og sky-modeller beholder base.
  if (VISION_ENGINES72.includes(v.visionEngine72)) out.visionEngine72 = v.visionEngine72;
  if (CROSS_ENGINES72.includes(v.crossCheck72)) out.crossCheck72 = v.crossCheck72;
  if (LFM_BACKENDS72.includes(v.lfmBackend72)) out.lfmBackend72 = v.lfmBackend72;
  for (const k of ['lfm3Model72', 'lfm25Model72']) {
    if (typeof v[k] !== 'string') continue;
    const m = v[k].trim();
    if (!m) out[k] = '';
    else if (/^[a-z0-9._:\-/@+]{2,160}$/i.test(m) && !CLOUD_MODEL72.test(m)) out[k] = m;
  }
  return out;
}
const pick = (b) => (b && typeof b === 'object' ? Object.fromEntries(Object.entries(b).filter(([k]) => k in R48_DEFAULTS || k in R72_DEFAULTS)) : {});

/** http(s)://vert[:port] uten sti, brukernavn eller spørring. Ugyldig → null. */
export function cleanMacOcrUrl(v) {
  const s = String(v ?? '').trim().replace(/\/+$/, '');
  if (!s) return MAC_OCR_DEFAULT_URL;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) return null;
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

/** Innstillingene slik kjeden bruker dem. */
export function r48Settings(st = settings()) {
  return { ...R72_DEFAULTS, ...cleanReceipts48(st.receipts48), macOcrUrl: cleanMacOcrUrl(st.macOcrUrl) ?? MAC_OCR_DEFAULT_URL, ollamaUrl: String(st.ollamaUrl ?? '').replace(/\/$/, ''), geminiModel: st.geminiModel || null };
}
export const macOcrKey48 = () => secret('macOcrKey') || '';

/**
 * Sperren for eksterne tjenester (Gemini, Groq, Roboflow, Brønnøysund …) for finansdata: «Finansdata forlater aldri huset»
 * (AI-kontroll → Valg) eller et brukt opp sky-budsjett. Feiler oppslaget, regnes det som sperret (ingenting sendes ut).
 * → {blocked, reason:'finLocal'|'budget'|'error'|null, text}
 */
export function externalBlocked48() {
  try {
    const r = routing();
    if (r?.rules?.finLocal) return { blocked: true, reason: 'finLocal', text: '«Finansdata forlater aldri huset» er på' };
    if (budgetState(r).blocked) return { blocked: true, reason: 'budget', text: 'Sky-budsjettet er brukt opp' };
    return { blocked: false, reason: null, text: null };
  } catch (e) {
    return { blocked: true, reason: 'error', text: `Kunne ikke lese AI-rutingen (${e.message}), så ingen eksterne tjenester brukes` };
  }
}
