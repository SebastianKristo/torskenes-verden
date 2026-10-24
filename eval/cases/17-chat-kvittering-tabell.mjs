// Prompt 51, Del E 14: kvitteringsbilde i Glimt-chatten (qwen3:8b valgt) → tabell med riktige varelinjer og total.
// Veien skal være kvitteringskjeden (OCR → qwen3:8b), aldri bildet til en modell uten bildestøtte.
import { norm } from '../lib/match.mjs';
import { askImage51 } from './_chat51.mjs';
const kr = (v) => Number(v).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default {
  id: '17-chat-kvittering-tabell', title: 'Chat: kvitteringsbilde → tabell (qwen3:8b)', area: 'dokument',
  seed: {},
  async run(h, ck) {
    const exp = h.fixture('kvittering.json');
    const r = await askImage51(h, 'kvittering.png', 'Les kvitteringen og skriv varene i en tabell');
    if (!ck('svarte uten feil', r.status === 200 && !r.error, r.error ?? `HTTP ${r.status}`)) return;
    ck('ingen 400 fra Ollama', !/svarte 400|multimodal/i.test(`${r.text} ${r.error ?? ''}`), r.error ?? '');
    ck('veien er kvitteringskjeden', r.done?.readWith?.route === 'receipt', JSON.stringify(r.done?.readWith ?? null));
    ck('tabell', /\|\s*Vare\s*\|/.test(r.text) && /\|---/.test(r.text), r.text.slice(0, 200));
    const rows = r.text.split('\n').filter((l) => l.startsWith('|'));
    const missing = exp.linjer.filter((l) => !rows.some((row) => norm(row).includes(norm(l.navn).split(' ')[0]) && row.includes(kr(l.belop))));
    ck(`alle ${exp.linjer.length} varelinjer med riktig beløp`, !missing.length, missing.map((l) => `${l.navn} ${l.belop}`).join(', '));
    ck('total', r.text.includes(kr(exp.total)), `fasit ${kr(exp.total)}`);
  },
};
