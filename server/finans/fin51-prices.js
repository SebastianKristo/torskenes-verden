// Prompt 51 (FIN51): prishistorikk fra kvitteringsvarelinjene. Varenavnene normaliseres («TINE LETTMELK 1 L» = «Tine lettmelk 1l»),
// butikken samles til kjeden («REMA 1000 Majorstuen» → «REMA 1000»), og prisen per enhet følges over tid per butikk.
// Gir «har økt X % siden mars 2025» og hvilken butikk som er billigst for varene du faktisk kjøper. Bare brukerens egne kvitteringer.
//
//   GET /fin51/prices?q=&sort=change|count|name&limit=60 → {items:[PriceItem], basket, stores:[{store, receipts}], count, receipts}
//   GET /fin51/prices/item?key=<key>                     → {key, name, unit, points:[{date, store, price, receiptId}], stores:[…], change}
//   PriceItem: {key, name, unit:'stk'|'kg'|'l', count, first:{date, price, store}, last:{date, price, store}, min, max, changePct, changeText,
//               stores:[{store, last, lastDate, min, avg, count}], cheapest:{store, price, savingPct}|null}
import { q51 as q, r2, krText51, bad51 as bad, monthYear51 } from './fin51-util.js';
import { receiptLines } from './highlight30.js';

const CHAINS = ['REMA 1000', 'Kiwi', 'Coop Extra', 'Coop Prix', 'Coop Mega', 'Coop Obs', 'Obs Bygg', 'Obs', 'Extra', 'Meny', 'Spar', 'Joker', 'Bunnpris', 'Oda', 'Europris',
  'Normal', 'Clas Ohlson', 'Vinmonopolet', 'Lidl', 'Circle K', 'Esso', 'Shell', 'Uno-X', 'YX', 'Apotek 1', 'Vitusapotek', 'Boots', 'Elkjøp', 'Power', 'Biltema', 'Jula',
  'Nille', 'Tiger', 'Søstrene Grene', 'IKEA', 'Jernia', 'Princess', 'Kitch\'n', 'Holdbart', 'Matkroken', 'Nærbutikken', 'Mix', 'Narvesen', '7-Eleven', 'Deli de Luca'];
const foldc = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');
// Varenavn: små bokstaver uten aksenter, men æ, ø og å beholdes («Lyspære», ikke «lyspaere»).
const foldn = (s) => String(s ?? '').toLowerCase().replace(/å/g, '\u0001').replace(/æ/g, '\u0002').replace(/ø/g, '\u0003').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\u0001/g, 'å').replace(/\u0002/g, 'æ').replace(/\u0003/g, 'ø');
const CHAIN_RE = CHAINS.map((c) => [c, new RegExp(`(^|[^a-z0-9])${foldc(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}([^a-z0-9]|$)`)]);
/** Kjeden for et butikknavn, ellers navnet uten filial/nummer. */
export function storeOf51(merchant) {
  const raw = String(merchant ?? '').trim();
  if (!raw) return 'Ukjent butikk';
  const f = foldc(raw);
  // «Coop Extra» før «Extra», «Obs Bygg» før «Obs»: listen står i den rekkefølgen.
  const hit = CHAIN_RE.find(([, re]) => re.test(f));
  if (hit) return hit[0];
  const w = raw.replace(/\b(as|asa|avd\.?|filial|ans|da)\b/gi, '').replace(/\d{3,}/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
  return w ? w[0].toUpperCase() + w.slice(1) : raw;
}
const SKIP = /^(pant|panto|rabatt|tilbud|sum|total|totalt|subtotal|mva|moms|betalt|bankaxept|visa|mastercard|kort|kontant|veksel|bærepose|baerepose|pose|avrunding|øreavrunding|oreavrunding|kvittering|rest)\b/;
/**
 * Normalisert varenavn: små bokstaver, uten priser, antall («2 x», «x2», «2 stk»), vekt i kg (prisen regnes per kg) og
 * tegn; størrelser skrives likt («1 L» → «1l», «1,75 L» → «1.75l», «500 G» → «500g»).
 */
export function itemKey51(text) {
  let s = foldn(text).replace(/[×✕]/g, ' x ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b\d+(?:[,.]\d+)?\s*kg\s*(x|a|@|\*)\s*\d+[,.]\d+\b.*$/, ' '); // «1,234 kg x 24,90» (prisen regnes per kg)
  s = s.replace(/\b\d+[,.]\d{2}\s*(kr|nok)?\s*$/, ' ');                 // pris til slutt
  s = s.replace(/\b(\d+)\s*(x|stk|pk|pakk)\b(?!\w)/g, ' ').replace(/\bx\s*\d+\b/g, ' ').replace(/^\d+\s+/, ' ');
  s = s.replace(/(\d+)[,.](\d+)\s*(l|ltr|liter|kg|g|gr|ml|cl|dl)\b/g, '$1.$2$3').replace(/(\d+)\s+(l|ltr|liter|kg|g|gr|ml|cl|dl)\b/g, '$1$2')
    .replace(/(\d)(ltr|liter)\b/g, '$1l').replace(/(\d)gr\b/g, '$1g');
  s = s.replace(/[^a-z0-9æøå.%+ ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 3 || SKIP.test(s) || /^\d/.test(s)) return null;
  return s;
}
const titleCase = (s) => s.replace(/(^|\s)([a-zæøå])/g, (m, a, b) => a + b.toUpperCase());
/** Pris per enhet for en varelinje: vektvarer per kg, ellers per stk (unitPrice, ellers beløp / antall). → {price, unit} | null */
export function unitPrice51(line) {
  const amt = Number.isFinite(+line.amount) ? +line.amount : Number.isFinite(+line.price) ? +line.price : null;
  if (amt == null || amt <= 0) return null;
  const text = foldc(line.description ?? line.text ?? line.name ?? '').replace(/[×✕]/g, ' x ');
  const kg = text.match(/(\d+[,.]\d+|\d+)\s*kg\s*(x|a|@|\*)\s*(\d+[,.]\d+)/);
  if (kg) return { price: +kg[3].replace(',', '.'), unit: 'kg' };
  const qty = +(line.qty ?? line.quantity ?? 0);
  const up = +(line.unitPrice ?? line.unit_price ?? 0);
  if (up > 0) return { price: up, unit: 'stk' };
  if (qty > 1 && Number.isInteger(qty)) return { price: amt / qty, unit: 'stk' };
  const n = text.match(/\b(\d+)\s*(x|stk)\b|\bx\s*(\d+)\b/);
  const cnt = n ? +(n[1] ?? n[3]) : 1;
  return { price: cnt > 1 && cnt < 50 ? amt / cnt : amt, unit: 'stk' };
}
/** Alle prisobservasjoner for brukeren: [{key, name, unit, date, store, price, receiptId}] */
export function pricePoints51(u) {
  const rows = q("SELECT id, merchant, date, extraction, line_boxes FROM fh_receipts WHERE user_id=? AND status IN ('booked','needs_review') AND date IS NOT NULL ORDER BY date, created").all(u);
  const out = [];
  for (const r of rows) {
    let ex = null;
    try { ex = JSON.parse(r.extraction ?? 'null'); } catch { ex = null; }
    // Fulle linjer fra tolkningen (med antall og enhetspris); ellers linjene fra line_boxes.
    const lines = Array.isArray(ex?.lines) && ex.lines.length ? ex.lines : receiptLines(r).map((l) => ({ description: l.text, amount: l.price }));
    const store = storeOf51(r.merchant);
    for (const l of lines) {
      const name = String(l?.name || l?.description || l?.text || '');
      const key = itemKey51(name);
      if (!key) continue;
      const p = unitPrice51(l);
      if (!p) continue;
      out.push({ key: `${key}|${p.unit}`, name: titleCase(key), unit: p.unit, date: r.date, store, price: r2(p.price), receiptId: r.id });
    }
  }
  return out;
}
function summarize(key, pts) {
  pts.sort((a, b) => a.date.localeCompare(b.date));
  const first = pts[0], last = pts.at(-1);
  const byStore = new Map();
  for (const p of pts) (byStore.get(p.store) ?? byStore.set(p.store, []).get(p.store)).push(p);
  const stores = [...byStore.entries()].map(([store, l]) => ({ store, last: l.at(-1).price, lastDate: l.at(-1).date, min: Math.min(...l.map((x) => x.price)), avg: r2(l.reduce((a, x) => a + x.price, 0) / l.length), count: l.length }))
    .sort((a, b) => a.last - b.last);
  // Endring: samme butikk når det går (første og siste kjøp der), ellers første og siste kjøp totalt.
  const home = stores.slice().sort((a, b) => b.count - a.count)[0];
  const hp = byStore.get(home.store);
  const [a, b] = hp.length >= 2 ? [hp[0], hp.at(-1)] : [first, last];
  const changePct = a.price > 0 && a !== b ? Math.round(((b.price - a.price) / a.price) * 1000) / 10 : 0;
  const changeText = !changePct || Math.abs(changePct) < 1 ? (pts.length > 1 ? `Samme pris siden ${monthYear51(a.date)}` : 'Kjøpt én gang')
    : `${changePct > 0 ? 'Har økt' : 'Har sunket'} ${String(Math.abs(changePct)).replace('.', ',')} % siden ${monthYear51(a.date)}${hp.length >= 2 ? ` hos ${home.store}` : ''}`;
  const cheapest = stores.length >= 2 && stores[0].last < stores.at(-1).last ? { store: stores[0].store, price: stores[0].last, savingPct: Math.round(((stores.at(-1).last - stores[0].last) / stores.at(-1).last) * 100) } : null;
  const [k, unit] = key.split('|');
  return { key, name: first.name, unit, count: pts.length, first: { date: first.date, price: first.price, store: first.store }, last: { date: last.date, price: last.price, store: last.store },
    min: Math.min(...pts.map((x) => x.price)), max: Math.max(...pts.map((x) => x.price)), changePct, changeText, stores, cheapest, slug: k };
}
/**
 * Billigste butikk for varene du kjøper: for varer kjøpt i minst to butikker sammenlignes siste pris i hver butikk med den
 * laveste. Indeks 100 = alltid billigst. Butikker med færre enn 3 sammenlignbare varer er ikke med.
 */
export function basket51(items) {
  const multi = items.filter((i) => i.stores.length >= 2);
  const per = new Map();
  for (const i of multi) {
    const lo = Math.min(...i.stores.map((s) => s.last));
    for (const s of i.stores) { const e = per.get(s.store) ?? { store: s.store, items: 0, sum: 0, cheapestFor: 0, extra: 0 }; e.items++; e.sum += s.last / lo; if (s.last === lo) e.cheapestFor++; e.extra += (s.last - lo) * Math.max(1, s.count); per.set(s.store, e); }
  }
  const stores = [...per.values()].filter((e) => e.items >= 3).map((e) => ({ store: e.store, items: e.items, index: Math.round((e.sum / e.items) * 100), cheapestFor: e.cheapestFor, extra: r2(e.extra) }))
    .sort((a, b) => a.index - b.index || b.items - a.items);
  const best = stores[0] ?? null;
  return { compared: multi.length, stores, cheapest: best?.store ?? null,
    text: best ? `${best.store} er billigst for varene du kjøper (${best.cheapestFor} av ${best.items} varer)${stores[1] ? ` – ${stores[1].store} er i snitt ${stores[1].index - best.index} % dyrere` : ''}`
      : 'Kjøp de samme varene i minst to butikker for å sammenligne' };
}
export function prices51(u, { query = '', sort = 'change', limit = 60 } = {}) {
  const pts = pricePoints51(u);
  const by = new Map();
  for (const p of pts) (by.get(p.key) ?? by.set(p.key, []).get(p.key)).push(p);
  let items = [...by.entries()].map(([k, l]) => summarize(k, l));
  const basket = basket51(items);
  const f = foldc(query).trim();
  const fn = foldn(query).trim();
  if (f) items = items.filter((i) => i.slug.includes(fn) || foldc(i.slug).includes(f) || i.stores.some((s) => foldc(s.store).includes(f)));
  const S = { change: (a, b) => (b.count > 1) - (a.count > 1) || b.changePct - a.changePct || b.count - a.count, count: (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'nb'), name: (a, b) => a.name.localeCompare(b.name, 'nb') };
  items.sort(S[sort] ?? S.change);
  const storesAll = new Map();
  for (const p of pts) { const s = storesAll.get(p.store) ?? new Set(); s.add(p.receiptId); storesAll.set(p.store, s); }
  return { items: items.slice(0, Math.min(300, Math.max(1, +limit || 60))), count: items.length, basket, receipts: new Set(pts.map((p) => p.receiptId)).size,
    stores: [...storesAll.entries()].map(([store, s]) => ({ store, receipts: s.size })).sort((a, b) => b.receipts - a.receipts),
    raised: items.filter((i) => i.changePct >= 5).length };
}
export function mountPrices51(api, { R }) {
  api.get('/fin51/prices', R, (c) => c.json(prices51(c.get('user'), { query: String(c.req.query('q') ?? '').slice(0, 80), sort: c.req.query('sort'), limit: c.req.query('limit') })));
  api.get('/fin51/prices/item', R, (c) => {
    const key = String(c.req.query('key') ?? '').slice(0, 200);
    const pts = pricePoints51(c.get('user')).filter((p) => p.key === key);
    if (!pts.length) return bad(c, 'Fant ikke varen', 404);
    const s = summarize(key, pts);
    return c.json({ ...s, points: pts.map(({ date, store, price, receiptId }) => ({ date, store, price, receiptId })), priceText: `${krText51(s.last.price, true)} per ${s.unit}` });
  });
}
