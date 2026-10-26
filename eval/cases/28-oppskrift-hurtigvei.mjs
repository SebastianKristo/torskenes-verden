// Prompt 49 del 1: gjentatte forespørsler går hurtigveien. Etter 5 vellykkede bruk (aktiv, 0 feil av de siste 10, likhet ≥ 0,92 og
// alle variabler fylt i kode) hopper Glimt over planleggeren – svarformuleringen kjøres fortsatt, og sporet viser det.
import { checkNextNina } from './_nina.mjs';
import { did } from '../lib/match.mjs';
export default {
  id: '28-oppskrift-hurtigvei', title: 'Samme spørsmål 7 ganger → hurtigvei uten planlegger', area: 'oppskrift', intent: 'calendar_query (hurtigvei)',
  seed: { memory: ['nina'], calendar: ['frisor', 'frisor-forbi'] },
  async run(h, ck) {
    const Q = 'Når er neste gang jeg skal til Nina?';
    const steps = [];
    for (let i = 0; i < 7; i++) steps.push(await h.ask(Q));
    const last = steps[6];
    checkNextNina(last, ck);
    const t = h.glimtTrace(last);
    ck('7. gang: hurtigvei (oppskrift)', last.recipe?.use === 'fast' && last.engine === 'oppskrift', `${JSON.stringify(last.recipe)} · ${JSON.stringify(t?.recipe?.fast ?? null)}`);
    ck('ingen planlegger-kall 7. gang', t && !(t.models ?? []).some((m) => /^planner/.test(m.step ?? '')), JSON.stringify(t?.models ?? []).slice(0, 300));
    ck('de første gikk via planleggeren', steps.slice(0, 6).every((s) => s.recipe?.use !== 'fast'), steps.map((s) => s.recipe?.use).join(','));
    ck.info('bruk per gang', steps.map((s, i) => `${i + 1}:${s.recipe?.use ?? '-'}`).join(' '));
    ck.info('svartid 1. vs 7. gang', `${steps[0].ms} ms → ${last.ms} ms · ${did(last)}`);
  },
};
