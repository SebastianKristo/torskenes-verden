// Prompt 48 (SERVER48): innstillingene for kvitteringskjeden og sperren for eksterne tjenester.
//   settings.macOcrUrl   – adressen til Mac-OCR-tjenesten (standard http://10.69.1.173:8765, bare admin, vises ikke til andre)
//   secret('macOcrKey')  – nøkkelen (kryptert som de andre hemmelighetene, sendes aldri ut og logges aldri)
//   settings.receipts48  – av/på per steg og modell: {deviceOcr, deviceParse, macOcr, tesseract, gemini, compareMac,
//                          textModel:'qwen3:8b', macOcrTimeoutS:30, modelTimeoutS:90}
import { settings, secret } from '../finans/db.js';
import { routing, budgetState } from '../ai-run.js';

export const MAC_OCR_DEFAULT_URL = 'http://10.69.1.173:8765';
export const R48_DEFAULTS = Object.freeze({ deviceOcr: true, deviceParse: true, macOcr: true, tesseract: true, gemini: true, compareMac: true, textModel: 'qwen3:8b', macOcrTimeoutS: 30, modelTimeoutS: 90 });
export const R48_STEPS = ['deviceParse', 'deviceOcr', 'macOcr', 'tesseract', 'gemini'];
const BOOL_KEYS = [...R48_STEPS, 'compareMac'];

/** Validerer (og fletter inn i base): ukjente felt droppes, ugyldige verdier beholder base. */
export function cleanReceipts48(v, base = {}) {
  const out = { ...R48_DEFAULTS, ...pick(base) };
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const k of BOOL_KEYS) if (typeof v[k] === 'boolean') out[k] = v[k];
  if (typeof v.textModel === 'string' && /^[a-z0-9._:\-/]{2,80}$/i.test(v.textModel.trim())) out.textModel = v.textModel.trim();
  if (Number.isFinite(+v.macOcrTimeoutS) && v.macOcrTimeoutS !== null) out.macOcrTimeoutS = Math.min(120, Math.max(3, Math.round(+v.macOcrTimeoutS)));
  if (Number.isFinite(+v.modelTimeoutS) && v.modelTimeoutS !== null) out.modelTimeoutS = Math.min(300, Math.max(10, Math.round(+v.modelTimeoutS)));
  return out;
}
const pick = (b) => (b && typeof b === 'object' ? Object.fromEntries(Object.entries(b).filter(([k]) => k in R48_DEFAULTS)) : {});

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
  return { ...cleanReceipts48(st.receipts48), macOcrUrl: cleanMacOcrUrl(st.macOcrUrl) ?? MAC_OCR_DEFAULT_URL, ollamaUrl: String(st.ollamaUrl ?? '').replace(/\/$/, ''), geminiModel: st.geminiModel || null };
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
