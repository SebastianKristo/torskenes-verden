// Prompt 51, Del E 14: vanlig foto i Glimt-chatten mens qwen3:8b er valgt → beskrivelse fra visjonsmodellen (qwen2.5vl:7b),
// lastet ved behov. Ingen 400, og veien vises (readWith.route = vision).
import { askImage51 } from './_chat51.mjs';
export default {
  id: '18-chat-foto-visjon', title: 'Chat: vanlig foto → visjonsmodellen beskriver', area: 'dokument',
  seed: {},
  async run(h, ck) {
    const r = await askImage51(h, 'foto-51.png', 'Hva er dette et bilde av?');
    if (!ck('svarte uten feil', r.status === 200 && !r.error, r.error ?? `HTTP ${r.status}`)) return;
    ck('ingen 400 fra Ollama', !/svarte 400|multimodal/i.test(`${r.text} ${r.error ?? ''}`));
    const rw = r.done?.readWith ?? null;
    ck('visjonsmodellen svarte', rw?.route === 'vision' && /vl|vision|llava|gemma3/i.test(rw?.model ?? ''), JSON.stringify(rw));
    ck('veien vises', !!rw?.label, rw?.label ?? '');
    ck('en beskrivelse', r.text.trim().length >= 20 && /tre|himmel|sol|gress|eng|landskap|tree|sky|sun/i.test(r.text), r.text.slice(0, 200));
  },
};
