// Prompt 48 (SERVER48): lokal tekstmodell (standard qwen3:8b) som gjør OCR-radene om til felles kvitteringsformat.
// Kallet går via AI-gaten (server/ai-gate.js: kø med interaktiv prioritet, gruppering per modell, strømming):
// temperature 0, think false, num_ctx 16384, `format` = JSON-schema (modelFormat48), tre norske eksempler (dagligvare med
// pant og rabatt, restaurant med tips, bensinstasjon). Modellen får `rows` (vare og pris på samme rad), aldri bildet.
import { gateChat } from '../../ai-gate.js';
import { modelFormat48 } from '../schema.js';

export const LLM_OPTIONS48 = Object.freeze({ temperature: 0, num_ctx: 16384, num_predict: 4096 });
export const _llmTest48 = { scale: 1 };

export const SYSTEM48 = `Du gjør OCR-teksten fra en norsk kvittering om til JSON etter skjemaet. Hver rad er én linje på kvitteringen (varenavn til venstre, pris til høyre).
Regler:
- Transkriber hver varelinje som én post i items. Hopp aldri over en linje. description = teksten slik den står (rett bare åpenbare OCR-feil).
- Pant er en egen varelinje (positivt beløp). Tips/driks er en egen varelinje. Rabatter er egne poster i discounts med NEGATIVT beløp.
- amount er linjens sum slik den står. quantity og unit_price bare når de står på kvitteringen (f.eks. «2 X 6,00»), ellers null.
- Ikke regn ut noe selv. Ikke finn på varer, beløp eller datoer. Ukjent felt = null (lister = []).
- Beløp i kroner som tall med punktum som desimalskille (1299.00). total = beløpet ved TOTAL / Å BETALE / SUM / BETALT.
- date = kjøpsdatoen som ÅÅÅÅ-MM-DD. time = klokkeslettet som TT:MM. org_number = organisasjonsnummeret med bare sifre.
- vat = mva per sats (25, 15 eller 12) slik det står. subtotal bare når det står en delsum.
- payment_method = betalingsmåten slik den står (BankAxept, Visa, Mastercard, Vipps, Kontant …) eller null.
- category_suggestion = én kategori fra listen brukeren gir. Aldri en kategori som ikke står i listen.`;

const CATS = 'Mat og dagligvarer, Restaurant og kafé, Transport og lading, Bolig, Hjem, Fritid og hobby, Abonnementer, Skole, Annet';
const userMsg = (rows, cats, feedback) => `Kategorier: ${cats}\n\nRader:\n${rows.join('\n')}${feedback ? `\n\n${feedback}` : ''}`;
export const FEWSHOTS48 = [
  {
    rows: ['REMA 1000 GRÜNERLØKKA', 'Org.nr NO 911 015 838 MVA', 'Kvittering 14.03.2026 17:42', 'TINE LETTMELK 1L 21,90', 'GROVBRØD 34,50', 'COCA-COLA 1,5L 32,90', 'PANT 3,00',
      '2 X BANAN 6,00 12,00', 'RABATT COCA-COLA -10,00', 'TOTAL 94,30', 'BANKAXEPT 94,30', 'MVA 15% 12,30'],
    out: { merchant: 'REMA 1000 Grünerløkka', org_number: '911015838', date: '2026-03-14', time: '17:42', currency: 'NOK',
      items: [{ description: 'TINE LETTMELK 1L', quantity: null, unit_price: null, amount: 21.9 }, { description: 'GROVBRØD', quantity: null, unit_price: null, amount: 34.5 },
        { description: 'COCA-COLA 1,5L', quantity: null, unit_price: null, amount: 32.9 }, { description: 'PANT', quantity: null, unit_price: null, amount: 3 },
        { description: 'BANAN', quantity: 2, unit_price: 6, amount: 12 }],
      discounts: [{ description: 'RABATT COCA-COLA', amount: -10 }], subtotal: null, vat: [{ rate: 15, amount: 12.3 }], total: 94.3, payment_method: 'BankAxept', category_suggestion: 'Mat og dagligvarer' },
  },
  {
    rows: ['OLIVIA AKER BRYGGE', 'Org.nr 911 063 352 MVA', 'Bord 12 Dato: 08.08.2026 Kl. 20:15', '2 PIZZA MARGHERITA 378,00', '1 HUSETS RØDVIN GLASS 145,00', 'SUBTOTAL 523,00',
      'TIPS 50,00', 'TOTALT Å BETALE 573,00', 'Herav mva 15% 49,30', 'Herav mva 25% 29,00', 'VISA ************1234'],
    out: { merchant: 'Olivia Aker Brygge', org_number: '911063352', date: '2026-08-08', time: '20:15', currency: 'NOK',
      items: [{ description: 'PIZZA MARGHERITA', quantity: 2, unit_price: null, amount: 378 }, { description: 'HUSETS RØDVIN GLASS', quantity: 1, unit_price: null, amount: 145 },
        { description: 'TIPS', quantity: null, unit_price: null, amount: 50 }],
      discounts: [], subtotal: 523, vat: [{ rate: 15, amount: 49.3 }, { rate: 25, amount: 29 }], total: 573, payment_method: 'Visa', category_suggestion: 'Restaurant og kafé' },
  },
  {
    rows: ['CIRCLE K SANDVIKA', 'Org.nr NO 911 118 785 MVA', '2026-05-02 07:58', 'DIESEL PUMPE 4', '42,31 L X 21,49 909,24', 'KAFFE STOR 39,00', 'SUM 948,24', 'BANKAXEPT 948,24',
      'MVA 25% 181,85', 'MVA 15% 5,09'],
    out: { merchant: 'Circle K Sandvika', org_number: '911118785', date: '2026-05-02', time: '07:58', currency: 'NOK',
      items: [{ description: 'DIESEL PUMPE 4', quantity: 42.31, unit_price: 21.49, amount: 909.24 }, { description: 'KAFFE STOR', quantity: null, unit_price: null, amount: 39 }],
      discounts: [], subtotal: null, vat: [{ rate: 25, amount: 181.85 }, { rate: 15, amount: 5.09 }], total: 948.24, payment_method: 'BankAxept', category_suggestion: 'Transport og lading' },
  },
];

/** Meldingene modellen får: system, tre eksempler (bruker → svar) og kvitteringen. */
export function messages48(rows, categories = [], feedback = null) {
  const msgs = [{ role: 'system', content: SYSTEM48 }];
  for (const f of FEWSHOTS48) msgs.push({ role: 'user', content: userMsg(f.rows, CATS, null) }, { role: 'assistant', content: JSON.stringify(f.out) });
  msgs.push({ role: 'user', content: userMsg(rows, categories.length ? categories.join(', ') : CATS, feedback) });
  return msgs;
}
const parseJson = (text) => {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { throw Object.assign(new Error('Modellen svarte ikke med gyldig JSON'), { badJson: true }); }
};

/**
 * rows → {data, model, ms, telemetry}. Feil: {net:true} når Ollama ikke kan nås (kjeden hopper da over modellstegene),
 * {timeout:true} ved tidsavbrudd, {badJson:true} ved ugyldig svar.
 */
export async function parseRows48(rows, { categories = [], feedback = null, model = 'qwen3:8b', base, timeoutS = 90, signal = null } = {}) {
  if (!base) throw Object.assign(new Error('Ollama-adressen er ikke satt'), { net: true });
  const t0 = Date.now();
  // Prompt 51: kontekstvinduet måles før kallet. Ollama kutter stille fra starten av prompten (systemteksten og eksemplene!) når den
  // er lengre enn num_ctx, så lange kvitteringer får 32768, og radene kortes inn (aldri systemteksten) hvis det fortsatt ikke er plass.
  let sendRows = rows.slice(0, 400).map((r) => String(r).slice(0, 300));
  let messages = messages48(sendRows, categories, feedback);
  const est = (ms) => Math.ceil(ms.reduce((n, m) => n + String(m.content).length, 0) / 3) + 64;
  let numCtx = LLM_OPTIONS48.num_ctx;
  if (est(messages) + LLM_OPTIONS48.num_predict > numCtx * 0.9) numCtx = 32768;
  while (est(messages) + LLM_OPTIONS48.num_predict > numCtx * 0.9 && sendRows.length > 20) { sendRows = sendRows.slice(0, Math.floor(sendRows.length * 0.85)); messages = messages48(sendRows, categories, feedback); }
  const promptEst = est(messages);
  const body = { model, messages, format: modelFormat48(), options: { ...LLM_OPTIONS48, num_ctx: numCtx }, think: false };
  const ms = timeoutS * 1000 * _llmTest48.scale;
  try {
    const out = await gateChat({ model, body, base, signal, priority: 'interactive', short: true, allowThink: false, label: 'Finans · kvittering (tekst)',
      loadMs: ms, warmMs: Math.min(ms, 60_000 * _llmTest48.scale), idleMs: Math.min(ms, 30_000 * _llmTest48.scale), deadlineMs: ms * 3, retryTimeouts: false, retries: 1 });
    return { data: parseJson(out.text), model, ms: Date.now() - t0, telemetry: out.telemetry ?? null, numCtx, promptEst, rowsSent: sendRows.length };
  } catch (e) {
    if (e.badJson) throw e;
    if (e?.kind === 'nocontact') throw Object.assign(new Error(`Ollama kan ikke nås (${e.message})`), { net: true });
    if (e?.timeout || e?.kind === 'load_timeout' || e?.kind === 'idle_timeout') throw Object.assign(new Error(`${model} svarte ikke innen tidsfristen`), { timeout: true });
    if (e?.kind === 'http' || e?.kind === 'memory') throw Object.assign(new Error(`Ollama svarte ${e.status ?? ''}${e.ollamaError ? `: ${e.ollamaError}` : ''}`.trim()), { status: e.status, model: e.status === 404 });
    throw e;
  }
}
