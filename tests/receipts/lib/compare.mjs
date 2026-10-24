// EVALRCPT48: sammenligning med fasit per felt (butikk, dato, total, antall varelinjer).
// Fasit (<navn>.json): {"today"?, "notes"?, "receipt": {merchant, date, total, items[] | items_count, merchant_aliases?[]}}
// eller kort form uten «receipt»: {"merchant": "...", "date": "YYYY-MM-DD", "total": 123.45, "items_count": 7}.
export const FIELDS48 = ['merchant', 'date', 'total', 'items'];

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '');

/** Fasit-fila → {merchant, aliases[], date, total, items (antall) | null}. */
export function fasitOf(j) {
  const r = j?.receipt ?? j ?? {};
  const items = Array.isArray(r.items) ? r.items.length : Number.isFinite(+r.items_count) ? +r.items_count : null;
  return { merchant: r.merchant ?? null, aliases: Array.isArray(r.merchant_aliases) ? r.merchant_aliases : [], date: r.date ?? null,
    total: r.total == null ? null : Number(r.total), items };
}

/** Butikken stemmer når den normaliserte teksten inneholder fasit (eller et alias), eller omvendt (minst 4 tegn). */
export function merchantOk(got, want, aliases = []) {
  const g = norm(got);
  if (!g) return false;
  return [want, ...aliases].filter(Boolean).map(norm).some((w) => w && (g.includes(w) || (g.length >= 4 && w.includes(g))));
}

/** → {merchant:{ok, got, want}, date:{…}, total:{…}, items:{…}, all} (felt uten fasit: ok = null). */
export function compare48(receipt, fasit) {
  const r = receipt ?? {};
  const f = {
    merchant: { got: r.merchant ?? null, want: fasit.merchant, ok: fasit.merchant == null ? null : merchantOk(r.merchant, fasit.merchant, fasit.aliases) },
    date: { got: r.date ?? null, want: fasit.date, ok: fasit.date == null ? null : r.date === fasit.date },
    total: { got: r.total ?? null, want: fasit.total, ok: fasit.total == null ? null : Number.isFinite(+r.total) && r.total !== null && Math.abs(+r.total - fasit.total) < 0.005 },
    items: { got: Array.isArray(r.items) ? r.items.length : null, want: fasit.items, ok: fasit.items == null ? null : Array.isArray(r.items) && r.items.length === fasit.items },
  };
  f.all = FIELDS48.every((k) => f[k].ok !== false) && !!receipt;
  return f;
}
