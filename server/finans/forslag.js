// Prompt 27: søkeforslag mens du skriver (Google-stil) i Finans → Søk.
// GET /finans/api/forslag?q=bloms&limit=6 → [{type:'butikk'|'kategori'|'vare', navn, antall, sum (øre, negativ for utgift), ikon, farge, logoUrl?}]
// Kilder: butikker (merchant/bankteksten i transaksjonene), kategorier og varelinjer fra kvitteringer. Listen bygges én gang per
// bruker og holdes i minnet; den bygges på nytt når transaksjoner, kvitteringer eller kategorier endrer seg (signaturen under).
import { db, me } from './db.js';
import { norm, matchScore } from './search.js';
import { domainFor } from './enrich.js';
import { cachedLogoUrl } from './logo-lookup.js';

const q = (sql) => db.prepare(sql);
const TYPE_ORDER = { butikk: 0, kategori: 1, vare: 2 };
const PALETTE = ['#2b5d8a', '#b23a2a', '#3f7a6e', '#a8743a', '#6d4aff', '#13a37f', '#d0605a', '#4b6cf0', '#7b4fd6', '#e0a325'];
const hashColor = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
/** Initialer: «Blomsterlandet» → «BL», «Rema 1000» → «R1», «Mat og dagligvarer» → «MD». */
export function initials(name) {
  const w = String(name ?? '').split(/[\s\-_/*.]+/).filter((x) => x && !/^(og|i|på|av|as|asa)$/i.test(x));
  if (!w.length) return '?';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}

const cache = new Map(); // bruker → { sig, at, entries }
const sigOf = (u) => q(`SELECT (SELECT count(*)||':'||ifnull(max(id),0)||':'||total(amount)||':'||total(ifnull(category_id,0)) FROM fh_transactions WHERE user_id=@u)||'|'||
  (SELECT count(*)||':'||ifnull(max(created),0)||':'||total(length(extraction)) FROM fh_receipts WHERE user_id=@u)||'|'||
  (SELECT count(*)||':'||ifnull(max(id),0)||':'||group_concat(name) FROM fh_categories WHERE user_id=@u)`).pluck().get({ u });
/** Tøm cachen (kalles når transaksjoner endres; signaturen fanger også endringer fra andre veier). */
export const invalidateForslag = (u) => { if (u) cache.delete(u); else cache.clear(); };

function build(u) {
  const out = [];
  // Butikker: navnet som vises i appen (merchant, ellers bankteksten). Fargen fra den vanligste kategorien.
  const stores = q(`SELECT coalesce(nullif(t.merchant,''), t.description) AS n, count(*) AS antall, sum(t.amount) AS sum,
      (SELECT c.color FROM fh_transactions x JOIN fh_categories c ON c.id=x.category_id WHERE x.user_id=@u AND coalesce(nullif(x.merchant,''), x.description)=coalesce(nullif(t.merchant,''), t.description)
        GROUP BY c.id ORDER BY count(*) DESC LIMIT 1) AS color
    FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=@u AND coalesce(c.kind,'expense')<>'transfer' AND coalesce(nullif(t.merchant,''), t.description)<>''
    GROUP BY n`).all({ u });
  for (const s of stores) {
    const domain = domainFor(s.n);
    const logoUrl = cachedLogoUrl(s.n, u) ?? (domain ? `/finans/api/logo/${domain}` : null);
    out.push({ type: 'butikk', navn: s.n, antall: s.antall, sum: s.sum, ikon: initials(s.n), farge: s.color || hashColor(s.n), ...(logoUrl ? { logoUrl } : {}), _n: norm(s.n) });
  }
  // Kategorier med antall og sum.
  for (const c of q(`SELECT c.name AS n, c.color, count(t.id) AS antall, total(t.amount) AS sum FROM fh_categories c
      LEFT JOIN fh_transactions t ON t.category_id=c.id AND t.user_id=@u WHERE c.user_id=@u GROUP BY c.id`).all({ u })) {
    out.push({ type: 'kategori', navn: c.n, antall: c.antall, sum: Math.round(c.sum), ikon: initials(c.n), farge: c.color || hashColor(c.n), _n: norm(c.n) });
  }
  // Varelinjer: samme beskrivelse (normalisert) samles, sum er negativ (utgift).
  const items = new Map();
  for (const r of q("SELECT extraction FROM fh_receipts WHERE user_id=@u AND status NOT IN ('rejected') AND extraction IS NOT NULL").all({ u })) {
    let lines = [];
    try { lines = JSON.parse(r.extraction)?.lines ?? []; } catch { /* ugyldig */ }
    for (const l of lines) {
      const d = String(l?.description ?? '').replace(/\s+/g, ' ').trim();
      if (d.length < 2) continue;
      const k = norm(d);
      const cur = items.get(k) ?? { navn: d, antall: 0, sum: 0 };
      cur.antall++; cur.sum -= Math.round(Math.abs(Number(l.amount) || 0) * 100);
      items.set(k, cur);
    }
  }
  for (const [k, v] of items) out.push({ type: 'vare', ...v, ikon: initials(v.navn), farge: '#FFB08A', _n: k });
  return out;
}

function entriesFor(u) {
  const sig = sigOf(u);
  const c = cache.get(u);
  if (c && c.sig === sig && Date.now() - c.at < 10 * 60_000) return c.entries;
  const entries = build(u);
  cache.set(u, { sig, at: Date.now(), entries });
  return entries;
}

/** Forslag for q (minst 1 tegn). Score 4/3/2/1, så butikk før kategori/vare, så flest kjøp. */
export function forslag(text, { limit = 6, u = me() } = {}) {
  const qn = norm(String(text ?? '').trim()).replace(/\s+/g, ' ');
  if (!qn) return [];
  const lim = Math.min(20, Math.max(1, Math.round(Number(limit) || 6)));
  const scored = [];
  for (const e of entriesFor(u)) {
    const s = matchScore(e._n, qn);
    if (s) scored.push([s, e]);
  }
  scored.sort((a, b) => b[0] - a[0] || TYPE_ORDER[a[1].type] - TYPE_ORDER[b[1].type] || b[1].antall - a[1].antall || a[1].navn.localeCompare(b[1].navn, 'nb'));
  return scored.slice(0, lim).map(([, { _n, ...e }]) => e);
}
