// Prompt 48 (SERVER48): steg D – Gemini Flash med bildet og den beste OCR-teksten. Siste reserve, og bare når
// «Finansdata forlater aldri huset» er av (sjekkes her og i geminiJson48). Kallet går via AI-gaten: denne modulen
// registrerer backenden «gemini48» med gatens eksisterende registerBackend (ai-gate.js er ikke endret) og kaller
// gateChat({backend:'gemini48', noQueue:true}) – sky-kall venter ikke i Ollama-køen. Selve HTTP-kallet, nøkkelrotasjonen
// og modellvalget gjenbrukes fra finans/ai.js (geminiJson48).
import { gateChat, registerBackend, GateError } from '../../ai-gate.js';
import { geminiJson48 } from '../../finans/ai.js';
import { modelFormat48 } from '../schema.js';
import { externalBlocked48 } from '../settings.js';

export const GEMINI_BACKEND48 = 'gemini48';
const imgMime = (b64) => (String(b64).startsWith('iVBOR') ? 'image/png' : String(b64).startsWith('UklGR') ? 'image/webp' : String(b64).startsWith('AAAA') ? 'image/heic' : 'image/jpeg');

/** JSON-schema med type-lister (["string","null"]) → formen finans/ai.js sender til Gemini ({type, nullable}). */
export function geminiSchema48(s = modelFormat48()) {
  if (Array.isArray(s)) return s.map((x) => geminiSchema48(x));
  if (!s || typeof s !== 'object') return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'type' && Array.isArray(v)) { const t = v.filter((x) => x !== 'null'); o.type = t[0] ?? 'string'; if (v.includes('null')) o.nullable = true; }
    else o[k] = k === 'properties' ? Object.fromEntries(Object.entries(v).map(([p, x]) => [p, geminiSchema48(x)])) : geminiSchema48(v);
  }
  return o;
}

registerBackend(GEMINI_BACKEND48, {
  async chatStream(req, { onToken, signal, onRequest }) {
    const msgs = req.body?.messages ?? [];
    const parts = [];
    for (const m of msgs) {
      for (const b64 of m.images ?? []) parts.push({ inline_data: { mime_type: req.body.mime ?? imgMime(b64), data: b64 } });
      if (m.content) parts.push({ text: String(m.content) });
    }
    onRequest?.();
    let r;
    // Feil fra Gemini (manglende nøkkel, sperren, 4xx/5xx) går ut som GateError med egen tekst (ikke «Ollama kan ikke nås»).
    try { r = await geminiJson48(parts, req.body?.geminiSchema ?? geminiSchema48(), { timeout: req.body?.timeoutMs ?? 30_000, signal }); }
    catch (e) { if (signal?.aborted) throw e; throw new GateError('http', e.message, { status: e.status ?? 502, transient: false, blocked: !!e.blocked, timeout: !!e.timeout, backendName: 'Gemini' }); }
    const text = JSON.stringify(r.data);
    await onToken({ message: { content: text } });
    return { text, content: text, thinking: '', message: { role: 'assistant' }, final: { done: true, model: r.model }, usage: { tokIn: 0, tokOut: 0 }, timing: { loadMs: 0, promptMs: 0, genMs: 0 }, model: r.model };
  },
});

/**
 * Bildet + beste OCR-tekst → {data, model, ms}. Kaster {blocked:true} når sperren er på.
 */
export async function geminiParse48(image, mime, { rows = [], categories = [], feedback = null, prompt, timeoutS = 30, base, signal = null } = {}) {
  const b = externalBlocked48();
  if (b.blocked) throw Object.assign(new Error(`${b.text}, så Gemini brukes ikke`), { blocked: true });
  const t0 = Date.now();
  const text = `${prompt}\n\nKategorier: ${categories.join(', ') || 'Annet'}\n\nOCR-tekst (kan inneholde feil – bildet gjelder):\n${rows.length ? rows.join('\n') : '(ingen)'}${feedback ? `\n\n${feedback}` : ''}`;
  const ms = timeoutS * 1000;
  const out = await gateChat({ backend: GEMINI_BACKEND48, noQueue: true, model: 'gemini-flash', base: base || 'http://127.0.0.1:11434', signal, priority: 'interactive', retries: 0,
    body: { messages: [{ role: 'user', content: text, images: image ? [image.toString('base64')] : [] }], mime, timeoutMs: ms, geminiSchema: geminiSchema48() },
    loadMs: ms + 2000, warmMs: ms + 2000, idleMs: ms + 2000, label: 'Finans · kvittering (Gemini)' });
  let data;
  try { data = JSON.parse(out.text); } catch { throw Object.assign(new Error('Gemini svarte ikke med gyldig JSON'), { badJson: true }); }
  return { data, model: out.final?.model ?? 'gemini', ms: Date.now() - t0 };
}
