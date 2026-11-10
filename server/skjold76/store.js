// Prompt 76 (SKJSRV): Skjold Lab – database for sorteringsskapet (skap, skuffer, deler, historikk) og FTS5-søket.
// Alt er per bruker (user_id). Additiv migrering: tabellene opprettes hvis de mangler, kolonner som mangler legges til.
// Nummerering: rad 1 øverst, skuff (kolonne) 1 til venstre. Visning «Rad 4 · Skuff 2», kort «4-2».
import { db, kv } from '../db.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS skj_cabinets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL, rows INTEGER NOT NULL DEFAULT 12,
  cols INTEGER NOT NULL DEFAULT 5, kind TEXT NOT NULL DEFAULT 'kjøpt', sort INTEGER NOT NULL DEFAULT 0, photo TEXT, photo_corners TEXT, notes TEXT,
  created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS skj_cabinets_user ON skj_cabinets(user_id, sort);
CREATE TABLE IF NOT EXISTS skj_drawers (cabinet_id INTEGER NOT NULL, row INTEGER NOT NULL, col INTEGER NOT NULL, label TEXT, compartments INTEGER NOT NULL DEFAULT 1,
  color TEXT, PRIMARY KEY (cabinet_id, row, col));
CREATE TABLE IF NOT EXISTS skj_parts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT, description TEXT,
  specs TEXT NOT NULL DEFAULT '{}', qty REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'stk', min_qty REAL, tags TEXT NOT NULL DEFAULT '[]',
  cabinet_id INTEGER, row INTEGER, col INTEGER, compartment INTEGER, url TEXT, price REAL, supplier TEXT, photos TEXT NOT NULL DEFAULT '[]',
  created INTEGER NOT NULL, updated INTEGER NOT NULL, deleted_at INTEGER);
CREATE INDEX IF NOT EXISTS skj_parts_user ON skj_parts(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS skj_parts_loc ON skj_parts(cabinet_id, row, col);
CREATE TABLE IF NOT EXISTS skj_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, part_id INTEGER, at INTEGER NOT NULL, action TEXT NOT NULL,
  "from" TEXT, "to" TEXT);
CREATE INDEX IF NOT EXISTS skj_history_part ON skj_history(user_id, part_id, at);
CREATE TABLE IF NOT EXISTS skj_files (name TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS skj_parts_fts USING fts5(name, body, part_id UNINDEXED, user_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');`);

// Prompt 81 (SPANSRV): sammenslåtte skuffer. Ankeret (øverste venstre rute) dekker span_r × span_c ruter. Se layout81.js.
for (const c of ['span_r', 'span_c']) if (!q('PRAGMA table_info(skj_drawers)').all().some((x) => x.name === c)) db.exec(`ALTER TABLE skj_drawers ADD COLUMN ${c} INTEGER NOT NULL DEFAULT 1`);

export const KINDS76 = ['kjøpt', '3d'];
export const UNITS76 = ['stk', 'm', 'cm', 'mm', 'g', 'kg', 'ml', 'l', 'pk', 'sett', 'rull', 'par'];
export const TRASH_MS76 = 30 * 86400_000;
const J = (s, d) => { if (s == null) return d; try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
let clock = null;
/** Bare for tester: fast klokke (ms) eller null. */
export const _setClock76 = (ms) => { clock = ms ?? null; };
export const now76 = () => clock ?? Date.now();

/* ---------------- Normalisering for søket ---------------- */

/** Små bokstaver, æ→ae, ø→o, å→a, andre aksenter bort. «Ufølsomt for store/små bokstaver og æøå». */
export const fold76 = (s) => String(s ?? '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Verdier med enhet: «10 k», «10kΩ», «4,7 µF», «M3 × 10» → samme tokens («10k», «4p7uf», «m3x10»). */
export function normSpec76(s) {
  return fold76(s)
    .replace(/[Ωω]|\bohm\b/g, ' ohm ')
    .replace(/[µμ]/g, 'u')
    .replace(/(\d)[.,](\d)/g, '$1p$2')
    .replace(/(\d)\s*[×x*]\s*(\d)/g, '$1x$2')
    .replace(/\b([a-z]?\d+(?:p\d+)?)\s+(k|m|meg|g|u|n|p|v|mv|a|ma|w|mw|f|uf|nf|pf|mm|cm|mah|hz|khz|mhz|ohm)\b/g, '$1$2')
    .replace(/\s+/g, ' ').trim();
}
/** Ord i et søk (maks 8). */
export const words76 = (s) => normSpec76(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 8);
/** Enkel stamme for bestemt form/flertall («skruene» → «skru», «kondensatorene» → «kondensator»). */
export function stem76(w) {
  if (w.length < 5 || /\d/.test(w)) return w;
  for (const suf of ['ene', 'ane', 'ere', 'er', 'en', 'et', 'ar', 'a', 'e']) if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  return w;
}
const ftsExpr = (ws) => ws.map((w) => `"${w.replace(/"/g, '""')}"*`).join(' ');

/* ---------------- Skap ---------------- */

export const cabinetRow76 = (user, id) => q('SELECT * FROM skj_cabinets WHERE id=? AND user_id=?').get(Number(id) || -1, user) ?? null;
export const cabinetRows76 = (user) => q('SELECT * FROM skj_cabinets WHERE user_id=? ORDER BY sort, id').all(user);

/** Første gang: «Hovedskap» 12 × 5 (kjøpt). Demodata når MOCK_DATA=1 (e2e/web-mock) eller SKJOLD76_DEMO=1. */
export function ensureUser76(user) {
  if (kv.get(user, 'skjold76_init', null)) return;
  db.transaction(() => {
    if (!q('SELECT 1 FROM skj_cabinets WHERE user_id=?').get(user)) insertCabinet76(user, { name: 'Hovedskap', rows: 12, cols: 5, kind: 'kjøpt' });
    kv.set(user, 'skjold76_init', { at: now76() });
  })();
  const demo = process.env.SKJOLD76_DEMO === '1' || (process.env.MOCK_DATA === '1' && process.env.SKJOLD76_DEMO !== '0');
  if (demo && !q('SELECT 1 FROM skj_parts WHERE user_id=?').get(user)) seedDemo76(user);
}

export function insertCabinet76(user, { name, rows = 12, cols = 5, kind = 'kjøpt', notes = null }) {
  const t = now76();
  const sort = (q('SELECT max(sort) FROM skj_cabinets WHERE user_id=?').pluck().get(user) ?? -1) + 1;
  const id = q('INSERT INTO skj_cabinets(user_id, name, rows, cols, kind, sort, notes, created, updated) VALUES(?,?,?,?,?,?,?,?,?)').run(user, name, rows, cols, kind, sort, notes, t, t).lastInsertRowid;
  return cabinetRow76(user, id);
}
export function updateCabinet76(user, id, patch) {
  const cols = Object.keys(patch);
  if (!cols.length) return cabinetRow76(user, id);
  q(`UPDATE skj_cabinets SET ${cols.map((c) => `${c}=@${c}`).join(', ')}, updated=@updated WHERE id=@id AND user_id=@user`).run({ ...patch, updated: now76(), id: Number(id), user });
  return cabinetRow76(user, id);
}

/* ---------------- Skuffer ---------------- */

export const shortLoc76 = (row, col) => `${row}-${col}`;
export const defaultLabel76 = (row, col) => `R${row}·S${col}`;
export const drawerRow76 = (cabId, row, col) => q('SELECT * FROM skj_drawers WHERE cabinet_id=? AND row=? AND col=?').get(cabId, row, col) ?? null;
export const drawerRows76 = (cabId) => q('SELECT * FROM skj_drawers WHERE cabinet_id=?').all(cabId);
/** Prompt 81: ankeret som dekker ruta (en annen rute), eller null. */
export const coverOf81 = (cabId, row, col) => q('SELECT * FROM skj_drawers WHERE cabinet_id=? AND row<=? AND row+span_r>? AND col<=? AND col+span_c>? AND (span_r>1 OR span_c>1) AND NOT (row=? AND col=?) LIMIT 1')
  .get(cabId, row, row, col, col, row, col) ?? null;
/** Prompt 81: rute → ankerets {row, col} (samme rute når den ikke er dekket). */
export function anchorOf81(cabId, row, col) { const a = coverOf81(cabId, row, col); return a ? { row: a.row, col: a.col } : { row, col }; }
/** Prompt 81: Map «r:c» → ankerraden for alle dekkede ruter i skapet. */
export function coverMap81(cabId) {
  const m = new Map();
  for (const a of q('SELECT * FROM skj_drawers WHERE cabinet_id=? AND (span_r>1 OR span_c>1)').all(cabId)) {
    for (let r = a.row; r < a.row + a.span_r; r++) for (let c = a.col; c < a.col + a.span_c; c++) if (r !== a.row || c !== a.col) m.set(`${r}:${c}`, a);
  }
  return m;
}
/** Prompt 81: «Rad 4–5 · Skuff 1–2» (stor), «Rad 3 · Skuff 1–2» (bred), ellers «Rad 4 · Skuff 2». */
export const spanText81 = (row, col, sr = 1, sc = 1) => `Rad ${sr > 1 ? `${row}–${row + sr - 1}` : row} · Skuff ${sc > 1 ? `${col}–${col + sc - 1}` : col}`;
export function drawerOut76(cab, row, col, d = undefined, cover = undefined) {
  const r = d === undefined ? drawerRow76(cab.id, row, col) : d;
  const cv = cover === undefined ? coverOf81(cab.id, row, col) : cover?.get?.(`${row}:${col}`) ?? null;
  return { row, col, short: shortLoc76(row, col), label: r?.label || defaultLabel76(row, col), customLabel: r?.label || null, compartments: r?.compartments ?? 1, color: r?.color ?? null,
    spanR: cv ? 1 : r?.span_r ?? 1, spanC: cv ? 1 : r?.span_c ?? 1, coveredBy: cv ? shortLoc76(cv.row, cv.col) : null };
}
export function setDrawer76(cabId, row, col, { label, compartments, color, spanR, spanC }) {
  const cur = drawerRow76(cabId, row, col) ?? { label: null, compartments: 1, color: null, span_r: 1, span_c: 1 };
  const next = { label: label === undefined ? cur.label : label || null, compartments: compartments === undefined ? cur.compartments : compartments, color: color === undefined ? cur.color : color || null,
    span_r: spanR === undefined ? cur.span_r ?? 1 : spanR, span_c: spanC === undefined ? cur.span_c ?? 1 : spanC };
  if (!next.label && next.compartments === 1 && !next.color && next.span_r === 1 && next.span_c === 1) q('DELETE FROM skj_drawers WHERE cabinet_id=? AND row=? AND col=?').run(cabId, row, col);
  else q('INSERT INTO skj_drawers(cabinet_id, row, col, label, compartments, color, span_r, span_c) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(cabinet_id, row, col) DO UPDATE SET label=excluded.label, compartments=excluded.compartments, color=excluded.color, span_r=excluded.span_r, span_c=excluded.span_c')
    .run(cabId, row, col, next.label, next.compartments, next.color, next.span_r, next.span_c);
}
/** Prompt 81: plassering i en dekket rute → ankeret (eldre data eller klienter som sender ruta). Endrer f på stedet. */
export function normLoc81(f) {
  if (!f?.cabinet_id || !f.row || !f.col) return f;
  const a = coverOf81(f.cabinet_id, f.row, f.col);
  if (a) { f.row = a.row; f.col = a.col; if (f.compartment && f.compartment > (a.compartments ?? 1)) f.compartment = null; }
  return f;
}

/* ---------------- Deler ---------------- */

export const partRow76 = (user, id, { withDeleted = false } = {}) => q(`SELECT * FROM skj_parts WHERE id=? AND user_id=? ${withDeleted ? '' : 'AND deleted_at IS NULL'}`).get(Number(id) || -1, user) ?? null;
export const partsIn76 = (user, cabId, row, col) => q('SELECT * FROM skj_parts WHERE user_id=? AND cabinet_id=? AND row=? AND col=? AND deleted_at IS NULL ORDER BY compartment, name').all(user, cabId, row, col);

/** Plassering som tekst: «Hovedskap · Rad 4 · Skuff 2 · Rom 1». */
export function locationOf76(row, cabCache = null) {
  if (!row.cabinet_id || !row.row || !row.col) return { cabinetId: null, cabinet: null, row: null, col: null, compartment: null, short: null, label: null, text: 'Uten plass' };
  const cab = cabCache?.get?.(row.cabinet_id) ?? q('SELECT id, name FROM skj_cabinets WHERE id=?').get(row.cabinet_id);
  if (!cab) return { cabinetId: null, cabinet: null, row: null, col: null, compartment: null, short: null, label: null, text: 'Uten plass' };
  const d = drawerRow76(cab.id, row.row, row.col);
  const text = `${cab.name} · ${spanText81(row.row, row.col, d?.span_r ?? 1, d?.span_c ?? 1)}${row.compartment ? ` · Rom ${row.compartment}` : ''}`;
  return { cabinetId: cab.id, cabinet: cab.name, row: row.row, col: row.col, compartment: row.compartment ?? null, short: shortLoc76(row.row, row.col), label: d?.label ?? null, text };
}

let fileUrl = (name) => `/api/skjold/files/${name}`;
/** api.js setter signerte URL-er per bruker (bilder i appene uten header). */
export const setFileUrl76 = (fn) => { fileUrl = fn; };
export const thumbOf76 = (name) => String(name).replace(/\.(jpg|png|webp)$/, '_t.$1');

export function partOut76(r, { user = r.user_id, cabCache = null } = {}) {
  const photos = J(r.photos, []);
  const low = r.min_qty != null && r.qty <= r.min_qty;
  return {
    id: r.id, name: r.name, category: r.category ?? null, description: r.description ?? null, specs: J(r.specs, {}),
    qty: r.qty, unit: r.unit, min_qty: r.min_qty ?? null, minQty: r.min_qty ?? null, low, tags: J(r.tags, []),
    cabinet_id: r.cabinet_id ?? null, row: r.row ?? null, col: r.col ?? null, compartment: r.compartment ?? null,
    location: locationOf76(r, cabCache),
    url: r.url ?? null, price: r.price ?? null, supplier: r.supplier ?? null,
    photos: photos.map((p, n) => ({ n, name: p, url: fileUrl(p, user), thumbUrl: fileUrl(thumbOf76(p), user) })),
    thumbUrl: photos.length ? fileUrl(thumbOf76(photos[0]), user) : null,
    created: iso(r.created), updated: iso(r.updated), ...(r.deleted_at ? { deletedAt: iso(r.deleted_at), purgeAt: iso(r.deleted_at + TRASH_MS76) } : {}),
  };
}
export const cabCache76 = (user) => new Map(cabinetRows76(user).map((c) => [c.id, c]));

/** Indeksen for én del (navn + kategori, beskrivelse, specs, tags og skuffens etikett). */
export function indexPart76(id) {
  q('DELETE FROM skj_parts_fts WHERE part_id=?').run(id);
  const r = q('SELECT * FROM skj_parts WHERE id=?').get(id);
  if (!r || r.deleted_at) return;
  const specs = J(r.specs, {}), tags = J(r.tags, []);
  const d = r.cabinet_id && r.row && r.col ? drawerRow76(r.cabinet_id, r.row, r.col) : null;
  const specTxt = Object.entries(specs).map(([k, v]) => `${k} ${v}`).join(' ');
  const body = [r.category, r.description, specTxt, tags.join(' '), d?.label, r.supplier].filter(Boolean).join(' ');
  q('INSERT INTO skj_parts_fts(name, body, part_id, user_id) VALUES(?,?,?,?)').run(normSpec76(r.name), normSpec76(body), r.id, r.user_id);
}
export const reindexDrawer76 = (user, cabId, row, col) => { for (const p of partsIn76(user, cabId, row, col)) indexPart76(p.id); };

export function addHistory76(user, partId, action, from = null, to = null) {
  q('INSERT INTO skj_history(user_id, part_id, at, action, "from", "to") VALUES(?,?,?,?,?,?)').run(user, partId, now76(), action, from == null ? null : JSON.stringify(from), to == null ? null : JSON.stringify(to));
}
export const historyOut76 = (h) => ({ id: h.id, partId: h.part_id, at: iso(h.at), action: h.action, from: J(h.from, null), to: J(h.to, null), ...(h.name ? { name: h.name } : {}) });
export const historyOf76 = (user, partId, limit = 50) => q('SELECT * FROM skj_history WHERE user_id=? AND part_id=? ORDER BY at DESC, id DESC LIMIT ?').all(user, partId, limit).map(historyOut76);
export const historyAll76 = (user, limit = 100) => q('SELECT h.*, p.name FROM skj_history h LEFT JOIN skj_parts p ON p.id=h.part_id WHERE h.user_id=? ORDER BY h.at DESC, h.id DESC LIMIT ?').all(user, limit).map(historyOut76);

const COLS = ['name', 'category', 'description', 'specs', 'qty', 'unit', 'min_qty', 'tags', 'cabinet_id', 'row', 'col', 'compartment', 'url', 'price', 'supplier', 'photos'];
/** Ny del (felt allerede validert). */
export function insertPart76(user, f, { history = true } = {}) {
  const t = now76();
  const v = normLoc81({ specs: '{}', tags: '[]', photos: '[]', qty: 0, unit: 'stk', ...f });
  for (const k of ['specs', 'tags', 'photos']) if (typeof v[k] !== 'string') v[k] = JSON.stringify(v[k]);
  const cols = COLS.filter((c) => v[c] !== undefined);
  const id = q(`INSERT INTO skj_parts(user_id, ${cols.join(', ')}, created, updated) VALUES(@user, ${cols.map((c) => `@${c}`).join(', ')}, @t, @t)`).run({ ...Object.fromEntries(cols.map((c) => [c, v[c]])), user, t }).lastInsertRowid;
  indexPart76(id);
  if (history) addHistory76(user, id, 'opprettet', null, locSnap76(partRow76(user, id)));
  return partRow76(user, id);
}
export function updatePart76(user, id, f) {
  const v = { ...f };
  if (v.row !== undefined || v.col !== undefined || v.cabinet_id !== undefined) {
    const cur = q('SELECT cabinet_id, row, col, compartment FROM skj_parts WHERE id=?').get(Number(id)) ?? {};
    const loc = normLoc81({ cabinet_id: v.cabinet_id !== undefined ? v.cabinet_id : cur.cabinet_id, row: v.row !== undefined ? v.row : cur.row, col: v.col !== undefined ? v.col : cur.col, compartment: v.compartment !== undefined ? v.compartment : cur.compartment });
    if (loc.cabinet_id) Object.assign(v, { row: loc.row, col: loc.col, compartment: loc.compartment ?? null });
  }
  for (const k of ['specs', 'tags', 'photos']) if (v[k] !== undefined && typeof v[k] !== 'string') v[k] = JSON.stringify(v[k]);
  const cols = COLS.filter((c) => v[c] !== undefined);
  if (cols.length) q(`UPDATE skj_parts SET ${cols.map((c) => `${c}=@${c}`).join(', ')}, updated=@t WHERE id=@id AND user_id=@user`).run({ ...Object.fromEntries(cols.map((c) => [c, v[c]])), t: now76(), id: Number(id), user });
  indexPart76(Number(id));
  return partRow76(user, id, { withDeleted: true });
}
export const locSnap76 = (r) => ({ cabinetId: r.cabinet_id ?? null, row: r.row ?? null, col: r.col ?? null, compartment: r.compartment ?? null, text: locationOf76(r).text });

/** Myk sletting (30 dager), gjenoppretting og opprydding. */
export function softDelete76(user, id) {
  const r = partRow76(user, id);
  if (!r) return null;
  q('UPDATE skj_parts SET deleted_at=? WHERE id=?').run(now76(), r.id);
  q('DELETE FROM skj_parts_fts WHERE part_id=?').run(r.id);
  addHistory76(user, r.id, 'slettet', locSnap76(r), null);
  return partRow76(user, id, { withDeleted: true });
}
export function restore76(user, id) {
  const r = partRow76(user, id, { withDeleted: true });
  if (!r || !r.deleted_at) return null;
  // Skapet kan være slettet i mellomtiden: da blir delen «Uten plass».
  const cabOk = !r.cabinet_id || cabinetRow76(user, r.cabinet_id);
  q(`UPDATE skj_parts SET deleted_at=NULL, updated=? ${cabOk ? '' : ', cabinet_id=NULL, row=NULL, col=NULL, compartment=NULL'} WHERE id=?`).run(now76(), r.id);
  indexPart76(r.id);
  addHistory76(user, r.id, 'endret', { deleted: true }, { deleted: false, ...locSnap76(partRow76(user, id)) });
  return partRow76(user, id);
}
/** Sletter deler som har ligget i papirkurven i over 30 dager. → liste av bildefiler som kan fjernes. */
export function purge76(user = null) {
  const rows = q(`SELECT * FROM skj_parts WHERE deleted_at IS NOT NULL AND deleted_at < ? ${user ? 'AND user_id=?' : ''}`).all(...[now76() - TRASH_MS76, ...(user ? [user] : [])]);
  const files = [];
  for (const r of rows) {
    files.push(...J(r.photos, []));
    q('DELETE FROM skj_parts WHERE id=?').run(r.id);
    q('DELETE FROM skj_parts_fts WHERE part_id=?').run(r.id);
  }
  return files;
}

/* ---------------- Søk ---------------- */

/**
 * FTS5-søket. Rangering: eksakt navn, så navn-prefiks, så resten (bm25, navn vektet 4×).
 * Tomt søk → alle (navn). Filter: category, cabinet, row, col, low. → {rows, total}
 */
export function searchParts76(user, { q: text = '', category = null, cabinet = null, row = null, col = null, low = false, limit = 50, offset = 0, stem = true } = {}) {
  const where = ['p.user_id=@user', 'p.deleted_at IS NULL'];
  const P = { user };
  if (category) { where.push('lower(p.category)=lower(@category)'); P.category = category; }
  if (cabinet === 'none') where.push('p.cabinet_id IS NULL');
  else if (cabinet != null) { where.push('p.cabinet_id=@cabinet'); P.cabinet = Number(cabinet); }
  if (row != null) { where.push('p.row=@row'); P.row = Number(row); }
  if (col != null) { where.push('p.col=@col'); P.col = Number(col); }
  if (low) where.push('p.min_qty IS NOT NULL AND p.qty <= p.min_qty');
  const ws = words76(text);
  let rows;
  if (!ws.length) rows = q(`SELECT p.*, 0 AS r FROM skj_parts p WHERE ${where.join(' AND ')} ORDER BY p.name COLLATE NOCASE, p.id`).all(P);
  else {
    const run = (w) => { try { return q(`SELECT p.*, bm25(skj_parts_fts, 4.0, 1.0) AS r FROM skj_parts_fts f JOIN skj_parts p ON p.id=f.part_id WHERE skj_parts_fts MATCH @m AND f.user_id=@user AND ${where.join(' AND ')}`).all({ ...P, m: ftsExpr(w) }); } catch { return []; } };
    rows = run(ws);
    if (!rows.length && stem) { const st = ws.map(stem76); if (st.some((w, i) => w !== ws[i])) rows = run(st); }
    // Delord («skrue» i «maskinskrue»): FTS-prefikset finner bare ordstart.
    if (!rows.length && ws.some((w) => w.length >= 3)) {
      const st = ws.map((w) => (stem ? stem76(w) : w));
      rows = q(`SELECT p.*, f.name AS fn, f.body AS fb, 0 AS r FROM skj_parts_fts f JOIN skj_parts p ON p.id=f.part_id WHERE f.user_id=@user AND ${where.join(' AND ')}`).all(P)
        .filter((x) => st.every((w) => `${x.fn} ${x.fb}`.includes(w)));
    }
    const qf = normSpec76(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const tier = (x) => { const n = normSpec76(x.name).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); return n === qf ? 0 : n.startsWith(qf) ? 1 : 2; };
    rows = rows.map((x) => ({ ...x, tier: tier(x) })).sort((a, b) => a.tier - b.tier || a.r - b.r || a.name.localeCompare(b.name, 'nb'));
  }
  const total = rows.length;
  return { rows: rows.slice(offset, offset + limit), total };
}

/* ---------------- Demodata (mock-serveren) ---------------- */

export const DEMO76 = [
  ['Motstand 10 kΩ', 'Motstander', { verdi: '10kΩ', toleranse: '1%', pakke: '0805' }, 200, 50, 1, 1, ['smd', 'motstand']],
  ['Motstand 220 Ω', 'Motstander', { verdi: '220 Ω', toleranse: '5%', pakke: 'THT' }, 80, 20, 1, 2, ['led', 'motstand']],
  ['Motstand 4,7 kΩ', 'Motstander', { verdi: '4,7 k', toleranse: '1%', pakke: '0805' }, 15, 20, 1, 3, ['i2c', 'pull-up']],
  ['Motstand 1 MΩ', 'Motstander', { verdi: '1M', pakke: 'THT' }, 40, null, 1, 4, []],
  ['Keramisk kondensator 100 nF', 'Kondensatorer', { verdi: '100nF', spenning: '50V', pakke: '0805' }, 150, 30, 2, 1, ['avkobling']],
  ['Elektrolytt 100 µF 25 V', 'Kondensatorer', { verdi: '100µF', spenning: '25V' }, 25, 10, 2, 2, ['elko']],
  ['Elektrolytt 1000 µF 16 V', 'Kondensatorer', { verdi: '1000µF', spenning: '16V' }, 6, 5, 2, 3, ['elko']],
  ['LED rød 5 mm', 'LED', { farge: 'rød', diameter: '5 mm', spenning: '2V' }, 60, 20, 3, 1, ['led']],
  ['LED grønn 5 mm', 'LED', { farge: 'grønn', diameter: '5 mm' }, 45, 20, 3, 2, ['led']],
  ['WS2812B LED-stripe', 'LED', { type: 'WS2812B', tetthet: '60/m' }, 2.5, 1, 3, 3, ['neopixel', 'adresserbar']],
  ['ESP32 DevKitC', 'Mikrokontrollere', { brikke: 'ESP32-WROOM-32', flash: '4MB' }, 4, 2, 5, 1, ['wifi', 'bluetooth']],
  ['ESP32-C3 SuperMini', 'Mikrokontrollere', { brikke: 'ESP32-C3', flash: '4MB' }, 1, 2, 5, 2, ['wifi']],
  ['Arduino Nano', 'Mikrokontrollere', { brikke: 'ATmega328P' }, 3, null, 5, 3, []],
  ['M3 × 10 skruer', 'Skruer', { gjenge: 'M3', lengde: '10 mm', hode: 'unbrako' }, 50, 20, 4, 2, ['skrue', 'm3']],
  ['M3 mutter', 'Skruer', { gjenge: 'M3' }, 120, 30, 4, 3, ['mutter', 'm3']],
  ['M2.5 × 6 skruer', 'Skruer', { gjenge: 'M2.5', lengde: '6 mm' }, 35, 10, 4, 4, ['skrue']],
  ['Kabelsko 6,3 mm hun', 'Kabelsko', { størrelse: '6,3 mm', farge: 'blå', tverrsnitt: '1,5–2,5 mm²' }, 70, 25, 6, 1, ['krympesko']],
  ['Ringkabelsko M5', 'Kabelsko', { hull: 'M5', farge: 'rød' }, 40, 10, 6, 2, ['krympesko']],
  ['Krympestrømpe sortiment', 'Kabel', { diameter: '2–10 mm' }, 1, null, 7, 1, ['krymp']],
  ['Silikonledning 22 AWG svart', 'Kabel', { tverrsnitt: '22 AWG', farge: 'svart' }, 10, 2, null, null, ['ledning']],
];
export function seedDemo76(user) {
  const cab = cabinetRows76(user)[0] ?? insertCabinet76(user, { name: 'Hovedskap', rows: 12, cols: 5, kind: 'kjøpt' });
  db.transaction(() => {
    for (const [name, category, specs, qty, min, row, col, tags] of DEMO76) {
      insertPart76(user, { name, category, specs, qty, min_qty: min, unit: name.includes('stripe') || name.includes('ledning') ? 'm' : 'stk', tags,
        cabinet_id: row ? cab.id : null, row, col, compartment: null, description: null });
    }
    setDrawer76(cab.id, 1, 1, { label: 'Motstander', compartments: 2 });
    setDrawer76(cab.id, 4, 2, { label: 'M3-skruer' });
    reindexDrawer76(user, cab.id, 1, 1); reindexDrawer76(user, cab.id, 4, 2);
  })();
}
