// Uttrekk av Finn-handler fra e-postkvitteringer (Trygg betaling, Fiks ferdig, Tillit forsikring).
// AI først; regex-reserve når ingen motor svarer.
import { createHash } from 'node:crypto';
import { askJson } from './ai.js';

const SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' }, item: { type: 'string' }, counterpart: { type: 'string', nullable: true }, date: { type: 'string', nullable: true },
    amount: { type: 'number' }, order_id: { type: 'string', nullable: true },
    steps: { type: 'array', items: { type: 'object', properties: { t: { type: 'string' }, done: { type: 'boolean' } }, required: ['t', 'done'] } },
  },
  required: ['role', 'item', 'amount', 'steps'],
};
const PROMPT = (mail) => `Dette er en e-post fra FINN.no om en handel. Returner KUN JSON:
- role: "bought" hvis mottakeren kjøpte, "sold" hvis mottakeren solgte.
- item: gjenstanden (kort), counterpart: «selger <navn>» eller «kjøper <navn>», date: YYYY-MM-DD, amount: totalbeløp i kroner.
- order_id: ordre-/handelsnummer hvis oppgitt.
- steps: stegene i handelen i rekkefølge (Trygg betaling, Fiks ferdig · sendt/levert, Tillit forsikring, Godkjent/Utbetalt …) med done=true for fullførte.
E-post:
"""
${mail}
"""`;

const iso = (s) => {
  const m = String(s ?? '').match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/);
  if (!m) return null;
  return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};

export function regexFinn(mail) {
  const t = mail.replace(/\s+/g, ' ');
  const sold = /(du har solgt|utbetal|kjøper(en)? har betalt|din vare er solgt)/i.test(t);
  const amount = +(t.match(/(?:totalt|total|beløp|sum|pris)[^\d]{0,20}([\d\s.]+(?:,\d{2})?)\s*(?:kr|nok)/i)?.[1] ?? t.match(/([\d\s.]+(?:,\d{2})?)\s*kr/i)?.[1] ?? '')
    .replace(/[\s.]/g, '').replace(',', '.');
  const item = t.match(/du har (?:kjøpt|solgt)\s+(.{3,80}?)\s+(?:fra|til|for)\s/i)?.[1]?.trim() ?? t.match(/(?:annonse|gjenstand|vare|kjøpt|solgt)\s*[:–-]\s*([^.\n]{3,80}?)(?:\s{2}|\.|,| for | til |$)/i)?.[1]?.trim();
  const who = t.match(/(selger|kjøper)\s*[:–-]?\s*(\p{Lu}\p{L}+(?:\s\p{Lu}\.?)?)/u);
  const steps = [];
  if (/trygg betaling/i.test(t)) steps.push({ t: 'Trygg betaling', done: true });
  if (/fiks ferdig/i.test(t)) steps.push({ t: /levert|hentet/i.test(t) ? 'Fiks ferdig · levert' : /sendt/i.test(t) ? 'Fiks ferdig · sendt' : 'Fiks ferdig', done: /sendt|levert|hentet/i.test(t) });
  if (/tillit/i.test(t)) steps.push({ t: 'Tillit forsikring', done: true });
  if (/utbetalt/i.test(t)) steps.push({ t: 'Utbetalt', done: true });
  else if (/godkjent|(?<!når kjøper(en)? )har bekreftet mottatt/i.test(t)) steps.push({ t: 'Godkjent', done: true });
  else steps.push({ t: sold ? 'Venter på utbetaling' : 'Ikke mottatt', done: false });
  return { role: sold ? 'sold' : 'bought', item: item ?? null, counterpart: who ? `${who[1].toLowerCase()} ${who[2]}` : '', date: iso(t) ?? new Date().toLocaleDateString('sv-SE'),
    amount: Number.isFinite(amount) ? amount : NaN, order_id: t.match(/(?:ordre|handel|referanse)(?:nummer|nr\.?)?\s*[:#]?\s*([A-Z0-9-]{5,})/i)?.[1] ?? null, steps };
}

export async function parseFinnEmail(mail) {
  // Regex-uttrekket er alltid med som reserve: felter AI-en mangler eller svarer rart på, fylles fra det.
  const r = regexFinn(mail);
  let d = r;
  try {
    const x = await askJson(PROMPT(mail), SCHEMA, { timeout: 45_000 });
    const amount = typeof x.amount === 'number' ? x.amount : +String(x.amount ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    d = { role: x.role === 'sold' || x.role === 'bought' ? x.role : r.role, item: String(x.item ?? '').slice(0, 120) || r.item, counterpart: String(x.counterpart ?? '').slice(0, 80) || r.counterpart,
      date: /^\d{4}-\d{2}-\d{2}$/.test(x.date ?? '') ? x.date : r.date, amount: Number.isFinite(amount) && amount > 0 ? amount : r.amount, order_id: x.order_id || r.order_id,
      steps: Array.isArray(x.steps) && x.steps.length ? x.steps.slice(0, 8).map((s) => ({ t: String(s.t ?? s).slice(0, 60), done: !!s.done })) : r.steps };
  } catch { /* ingen AI – regex-uttrekket brukes */ }
  if (!d.item) throw new Error('Fant ikke gjenstanden i e-posten');
  // Samme ordrenummer i en senere statusmail oppdaterer samme handel.
  d.source = createHash('sha1').update(d.order_id ? 'o:' + d.order_id : `${d.role}|${d.item}|${d.amount}`).digest('hex').slice(0, 24);
  return d;
}
