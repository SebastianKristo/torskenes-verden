// Prompt 48 (SERVER48): GET /finans/api/receipts/health – status for hvert steg i kjeden: Mac-OCR, lokal modell,
// Tesseract og Gemini (og om sperren «Finansdata forlater aldri huset» hindrer Gemini), pluss kategorilisten appene skal
// velge category_suggestion fra. Adressene vises bare for admin; nøkkelen sendes aldri ut.
import { hasGemini } from '../finans/gemini-keys.js';
import { ocrTools } from '../ocr-fallback.js';
import { r48Settings, macOcrKey48, externalBlocked48 } from './settings.js';
import { macHealth48 } from './engines/mac-vision.js';

let F = (u, i) => fetch(u, i);
export const _setHealthFetch48 = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); };
const sameModel = (a, b) => a === b || a === `${b}:latest` || b === `${a}:latest`;

export async function health48({ admin = false, categories = [] } = {}) {
  const cfg = r48Settings();
  const blk = externalBlocked48();
  const key = macOcrKey48();
  const [mac, model, tools] = await Promise.all([
    cfg.macOcr ? macHealth48({ url: cfg.macOcrUrl, key }) : Promise.resolve({ configured: !!key, ok: false, error: 'Slått av' }),
    (async () => {
      if (!cfg.ollamaUrl) return { ok: false, error: 'Ollama-adressen er ikke satt' };
      try {
        const r = await F(`${cfg.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) return { ok: false, error: `Ollama svarte ${r.status}` };
        const names = ((await r.json()).models ?? []).map((m) => m.name);
        return { ok: true, installed: names.some((n) => sameModel(n, cfg.textModel)) };
      } catch (e) { return { ok: false, error: `Ollama kan ikke nås (${e?.cause?.code || e?.name || e?.message})` }; }
    })(),
    ocrTools().catch(() => ({})),
  ]);
  const gemini = { enabled: cfg.gemini, configured: hasGemini(), blocked: blk.blocked, blockedReason: blk.text };
  gemini.usable = gemini.enabled && gemini.configured && !gemini.blocked;
  return {
    ok: !!(mac.ok || (tools.tesseract && cfg.tesseract)) && !!model.ok,
    steps: { deviceParse: cfg.deviceParse, deviceOcr: cfg.deviceOcr, macOcr: cfg.macOcr, tesseract: cfg.tesseract, gemini: cfg.gemini },
    compareMac: cfg.compareMac,
    macOcr: { enabled: cfg.macOcr, ...mac, ...(admin ? { url: cfg.macOcrUrl, keySet: !!key } : {}) },
    model: { name: cfg.textModel, ...model, ...(admin ? { url: cfg.ollamaUrl } : {}) },
    tesseract: { enabled: cfg.tesseract, installed: !!tools.tesseract, version: tools.tesseract || null, imagemagick: !!tools.magick },
    gemini,
    external: blk,
    categories,
    formats: { ocr: '/finans/api/receipts/schemas/ocr', receipt: '/finans/api/receipts/schemas/receipt' },
  };
}
