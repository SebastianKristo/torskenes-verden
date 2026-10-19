// Prompt 30 (SERVER30): marker hvor i kvitteringen søketreffet er (claude-code-kvittering-highlight.md).
// - AI-tolkningen ber om bbox per varelinje: lines:[{description|text, amount|price, bbox:[x,y,w,h]}] i prosent av bildet
//   (SCHEMA/validate i ai.js). Linjene lagres i fh_receipts.line_boxes som [{text, price, bbox|null}] (ny kolonne).
// - Søket (/finans/api/search, /search/ai, /forslag) får per treff {txId, receiptId?, lineIndex[], matchedText}.
//   Match er uavhengig av store/små bokstaver og aksenter («tomat» → «TOMATER CHERRY»).
// - GET /finans/api/transactions/:id?hl=tomat → receipt.highlight {query, lineIndex[], matchedText, hasBoxes}.
// - POST /finans/api/receipts/:id/reread → les kvitteringen på nytt (samme kø som «Les på nytt») for å få posisjoner.
import { db } from './db.js';
import { fold, stem } from './search.js';
import { cleanBbox } from './bbox30.js';

export { cleanBbox };

const q = (sql) => db.prepare(sql);
if (!q('PRAGMA table_info(fh_receipts)').all().some((c) => c.name === 'line_boxes')) db.exec('ALTER TABLE fh_receipts ADD COLUMN line_boxes TEXT');

/** Linjene som [{text, price, bbox}] fra line_boxes, ellers fra extraction (eldre kvitteringer: bbox null). */
export function receiptLines(r) {
  if (r?.line_boxes) { try { const l = JSON.parse(r.line_boxes); if (Array.isArray(l)) return l; } catch { /* ugyldig */ } }
  let ex = null;
  try { ex = typeof r?.extraction === 'string' ? JSON.parse(r.extraction) : r?.extraction ?? null; } catch { ex = null; }
  return (ex?.lines ?? []).map((l) => ({ text: String(l?.description ?? l?.text ?? ''), price: Number.isFinite(+l?.amount) ? +l.amount : Number.isFinite(+l?.price) ? +l.price : null, bbox: cleanBbox(l?.bbox) }));
}
/** Skriver line_boxes fra extraction (kalles etter at en tolkning er lagret). */
export function storeLines(id) {
  const r = q('SELECT extraction FROM fh_receipts WHERE id=?').get(id);
  if (!r) return;
  const lines = receiptLines({ extraction: r.extraction });
  q('UPDATE fh_receipts SET line_boxes=? WHERE id=?').run(lines.length ? JSON.stringify(lines) : null, id);
}

const STOP = new Set(['i', 'pa', 'på', 'av', 'og', 'til', 'for', 'med', 'jeg', 'hva', 'hvor', 'mye', 'kvittering', 'kvitteringer', 'kvitteringen', 'vare', 'varer', 'kjopt', 'kjøpt', 'brukte', 'brukt', 'sist']);
/** Søkeordene (foldet + stammet). */
export function termsOf(query) {
  return String(query ?? '').split(/[^\p{L}\p{N}&+]+/u).map((w) => fold(w)).filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem).filter((w) => w.length >= 2);
}
const wordAt = (text, st) => {
  const f = fold(text);
  const m = new RegExp(`(^|[^\\p{L}\\p{N}])(${st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'u').exec(f);
  if (!m) return null;
  const start = m.index + m[1].length;
  // Hele ordet som traff (original skrivemåte når foldingen ikke endret lengden).
  const src = f.length === text.length ? text : f;
  const rest = src.slice(start).match(/^[\p{L}\p{N}&+-]+/u);
  return rest ? rest[0] : src.slice(start, start + st.length);
};
/** Hvilke linjer matcher alle søkeordene? → {lineIndex[], matchedText} */
export function matchLines(lines, query) {
  const terms = Array.isArray(query) ? query : termsOf(query);
  const lineIndex = [];
  let matchedText = '';
  if (!terms.length) return { lineIndex, matchedText };
  lines.forEach((l, i) => {
    const words = terms.map((t) => wordAt(l.text ?? l.description ?? '', t));
    if (words.every(Boolean)) { lineIndex.push(i); if (!matchedText) matchedText = words.join(' '); }
  });
  return { lineIndex, matchedText };
}

const rcById = q('SELECT id, transaction_id, extraction, line_boxes FROM fh_receipts WHERE id=? AND user_id=?');
const rcByTx = q("SELECT id, transaction_id, extraction, line_boxes FROM fh_receipts WHERE transaction_id=? AND user_id=? AND status<>'rejected' ORDER BY created DESC LIMIT 1");

/** Legger til {txId, receiptId, lineIndex[], matchedText} på hvert treff i et søkesvar (muterer ikke input). */
export function annotateSearch(result, query, u) {
  if (!result || !Array.isArray(result.hits)) return result;
  const terms = termsOf(result.interpreted?.item ?? query);
  const cache = new Map();
  const linesOf = (r) => { if (!cache.has(r.id)) cache.set(r.id, receiptLines(r)); return cache.get(r.id); };
  const hits = result.hits.map((h) => {
    let r = null;
    try { r = h.receiptId ? rcById.get(String(h.receiptId), u) : h.txId ? rcByTx.get(+h.txId, u) : null; } catch { r = null; }
    const base = { txId: h.txId ?? r?.transaction_id ?? null, receiptId: r?.id ?? h.receiptId ?? null };
    if (!r) return { ...h, ...base, lineIndex: [], matchedText: '' };
    const m = matchLines(linesOf(r), terms);
    // Et varelinje-treff peker alltid på sin egen linje først.
    const own = h.type === 'line' ? Number(String(h.id).split(':').pop()) : NaN;
    const lineIndex = Number.isInteger(own) ? [own, ...m.lineIndex.filter((i) => i !== own)] : m.lineIndex;
    return { ...h, ...base, lineIndex, matchedText: m.matchedText || (Number.isInteger(own) ? String(h.description ?? '') : '') };
  });
  return { ...result, hits };
}

/** /forslag: varelinje-forslag får det nyeste treffet {txId, receiptId, lineIndex[], matchedText} og matches[] (maks 5). */
export function annotateForslag(list, query, u) {
  if (!Array.isArray(list)) return list;
  const rows = list.some((x) => x.type === 'vare')
    ? q("SELECT id, transaction_id, extraction, line_boxes FROM fh_receipts WHERE user_id=? AND status NOT IN ('rejected') AND extraction IS NOT NULL ORDER BY date DESC, created DESC LIMIT 2000").all(u) : [];
  return list.map((x) => {
    if (x.type !== 'vare') return x;
    const terms = termsOf(x.navn);
    const matches = [];
    for (const r of rows) {
      const m = matchLines(receiptLines(r), terms);
      if (m.lineIndex.length) matches.push({ txId: r.transaction_id ?? null, receiptId: r.id, lineIndex: m.lineIndex, matchedText: m.matchedText });
      if (matches.length >= 5) break;
    }
    return { ...x, ...(matches[0] ?? { txId: null, receiptId: null, lineIndex: [], matchedText: '' }), matches };
  });
}
