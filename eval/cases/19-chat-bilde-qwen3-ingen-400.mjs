// Prompt 51, Del E 14: bilde mens qwen3:8b er valgt (uten noe ord som sier hva bildet er) → aldri «Ollama svarte 400:
// Multimodal data provided …». Glimt bytter vei selv (visjonsmodell eller OCR-rader) og sier hvilken.
import { askImage51 } from './_chat51.mjs';
export default {
  id: '19-chat-bilde-qwen3-ingen-400', title: 'Chat: bilde med qwen3:8b valgt → ingen 400', area: 'dokument',
  seed: {},
  async run(h, ck) {
    for (const [file, text] of [['foto-51.png', 'Se her'], ['kvittering.png', 'Hva synes du?']]) {
      const r = await askImage51(h, file, text);
      ck(`${file}: ingen 400`, !/svarte 400|multimodal/i.test(`${r.text} ${r.error ?? ''}`), r.error ?? '');
      ck(`${file}: svar uten feil`, r.status === 200 && !r.error && r.text.trim().length > 0, r.error ?? `HTTP ${r.status}`);
      const rw = r.done?.readWith ?? null;
      ck(`${file}: veien vises`, !!rw?.route && !!rw?.label, JSON.stringify(rw));
      const models = h.modelCalls().filter((c) => /qwen3:8b/.test(JSON.stringify(c.model ?? c.body?.model ?? '')) && c.images);
      ck(`${file}: qwen3:8b fikk aldri bildet`, !models.length, `${models.length} kall`);
    }
  },
};
