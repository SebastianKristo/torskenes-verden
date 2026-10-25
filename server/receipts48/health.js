// Prompt 48 (SERVER48): GET /finans/api/receipts/health – status for hvert steg i kjeden: Mac-OCR, lokal modell,
// og Tesseract (prompt 52: Gemini er fjernet fra kvitteringene), pluss kategorilisten appene skal
// velge category_suggestion fra. Adressene vises bare for admin; nøkkelen sendes aldri ut.
import { RECEIPT_SOURCE_LABEL52, RECEIPT_LOCAL_TEXT52 } from './cloud-guard52.js'; // prompt 52
import { ocrTools } from '../ocr-fallback.js';
import { r48Settings, macOcrKey48, externalBlocked48 } from './settings.js';
import { macHealth48 } from './engines/mac-vision.js';
import { macState51 } from './chain.js';
import { brregStatus51 } from './brreg51.js';
import { MIN_PX51 } from './preprocess51.js';

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
  return {
    ok: !!(mac.ok || (tools.tesseract && cfg.tesseract)) && !!model.ok,
    steps: { deviceParse: cfg.deviceParse, deviceOcr: cfg.deviceOcr, macOcr: cfg.macOcr, tesseract: cfg.tesseract },
    // Prompt 52 (SRV52): bare lokalt – ingen Gemini-steg, heller ikke som reserve.
    local_only: true, source_label: RECEIPT_SOURCE_LABEL52, reading_text: RECEIPT_LOCAL_TEXT52,
    compareMac: cfg.compareMac,
    macOcr: { enabled: cfg.macOcr, ...mac, ...macState51(), ...(admin ? { url: cfg.macOcrUrl, keySet: !!key } : {}) },
    model: { name: cfg.textModel, ...model, ...(admin ? { url: cfg.ollamaUrl } : {}) },
    tesseract: { enabled: cfg.tesseract, installed: !!tools.tesseract, version: tools.tesseract || null, imagemagick: !!tools.magick },
    external: blk,
    brreg: (({ count, updated }) => ({ count, updated }))(brregStatus51()),
    preprocess: { imagemagick: !!tools.magick, perspective: !!tools.magick, min_px: MIN_PX51 },
    categories,
    formats: { ocr: '/finans/api/receipts/schemas/ocr', receipt: '/finans/api/receipts/schemas/receipt' },
  };
}
