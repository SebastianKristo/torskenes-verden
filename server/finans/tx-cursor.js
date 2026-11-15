// Cursor-paginering for transaksjonslistene (GET /finans/api/transactions?limit&cursor).
// Listene sorteres alltid «t.date DESC, t.id DESC». Cursoren er posisjonen til siste rad på forrige side (dato + id),
// kodet som base64url, så klienten bare sender den tilbake uendret. Uten cursor er svaret som før (første side);
// nextCursor er null når det ikke finnes flere rader.

/** {date, id} → cursor-tekst. */
export const encodeTxCursor = (row) => Buffer.from(`${row.date}|${row.id}`, 'utf8').toString('base64url');

/** cursor-tekst → {date, id}, eller null når den mangler eller er ugyldig. */
export function decodeTxCursor(s) {
  if (!s || typeof s !== 'string' || s.length > 64) return null;
  const m = Buffer.from(s, 'base64url').toString('utf8').match(/^(\d{4}-\d{2}-\d{2})\|(\d{1,15})$/);
  return m ? { date: m[1], id: Number(m[2]) } : null;
}

/** SQL-vilkåret for «etter cursoren» i sorteringen date DESC, id DESC (alias t). */
export const TX_AFTER_SQL = '(t.date < ? OR (t.date = ? AND t.id < ?))';
export const txAfterParams = (cur) => [cur.date, cur.date, cur.id];

/** Samme vilkår i JS, for lister som filtreres etter SQL-en (butikkfilteret i finans42). */
export const isAfterTxCursor = (t, cur) => t.date < cur.date || (t.date === cur.date && t.id < cur.id);

/** rows er hentet med LIMIT limit + 1: → {rows (maks limit), nextCursor}. */
export function pageOf(rows, limit) {
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  return { rows: page, nextCursor: more && page.length ? encodeTxCursor(page[page.length - 1]) : null };
}
