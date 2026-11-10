// Prompt 81 (SPANWEB): Skjold Lab – sammenslåtte skuffer (store 2 × 2, brede 2 × 1) og forhåndsoppsettet «Skjold Lab-hylla (3D-print)».
// Serveren sender alle ruter i /cabinets/:id/map; et anker har spanR × spanC, og rutene det dekker har coveredBy «r-c».
// Tegningen viser ankeret som ett felt og hopper over dekkede ruter; trykk på en dekket rute = ankeret.
// Ingen import: modulen er ren (testes i Node, test/p81-web.test.js).
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Map «r-c» → skuff fra kartet. */
export const byKey81 = (map) => new Map((map?.drawers ?? []).map((d) => [`${d.row}-${d.col}`, d]));
const parseKey = (k) => { const m = /^(\d+)-(\d+)$/.exec(String(k ?? '')); return m ? { row: +m[1], col: +m[2] } : null; };

/** Ankeret for ruta (samme rute når den ikke er dekket). by = byKey81(map) eller map. → {row, col, spanR, spanC} */
export function anchor81(mapOrBy, row, col) {
  const by = mapOrBy instanceof Map ? mapOrBy : byKey81(mapOrBy);
  let d = by.get(`${row}-${col}`);
  const a = d?.coveredBy ? parseKey(d.coveredBy) : null;
  if (a) { d = by.get(`${a.row}-${a.col}`); return { row: a.row, col: a.col, spanR: Math.max(1, +d?.spanR || 1), spanC: Math.max(1, +d?.spanC || 1) }; }
  return { row: +row, col: +col, spanR: Math.max(1, +d?.spanR || 1), spanC: Math.max(1, +d?.spanC || 1) };
}
/** «Rad 4–5 · Skuff 1–2» (stor), «Rad 3 · Skuff 1–2» (bred), ellers «Rad 4 · Skuff 2». */
export const longSpan81 = (row, col, sr = 1, sc = 1) => `Rad ${sr > 1 ? `${row}–${row + sr - 1}` : row} · Skuff ${sc > 1 ? `${col}–${col + sc - 1}` : col}`;
/** Plassering i tekst ut fra kartet (dekket rute → ankeret). */
export function longAt81(map, row, col) { const a = anchor81(map, row, col); return longSpan81(a.row, a.col, a.spanR, a.spanC); }
/** Valget (sel) normalisert til ankeret, med spenn. */
export function normSel81(map, sel) {
  if (!sel || !sel.row || !sel.col) return sel ?? null;
  const a = anchor81(map, +sel.row, +sel.col);
  return { ...sel, row: a.row, col: a.col, spanR: a.spanR, spanC: a.spanC };
}
/** Skuffene (ankere og vanlige) i lesefølge – dekkede ruter er borte. */
export const anchors81 = (map) => (map?.drawers ?? []).filter((d) => !d.coveredBy);

/** Skjema-felt i skuffdetaljene: «Bredde 1/2 · Høyde 1/2». */
export function spanFieldsHtml81(d) {
  const sr = Math.min(2, Math.max(1, +d?.spanR || 1)), sc = Math.min(2, Math.max(1, +d?.spanC || 1));
  const opt = (cur) => [1, 2].map((v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`).join('');
  return `<div class="sk81-span" role="group" aria-label="Størrelse"><label>Bredde<select name="spanC" data-sk81-span>${opt(sc)}</select></label><span aria-hidden="true">·</span><label>Høyde<select name="spanR" data-sk81-span>${opt(sr)}</select></label></div>`;
}

/* ---------------- Forhåndsoppsettet ---------------- */

export const PRESET81 = { id: 'skjoldlab3d', name: 'Skjold Lab-hylla (3D-print)', short: 'Skjold Lab-hylla (3D)', etasjer: [4, 5] };
/** Tallene for bekreftelsen (samme som serveren: 4 etasjer = 11 rader, 5 = 13). */
export const PRESET_SIZES81 = { 4: { rows: 11, cols: 11, big: 8, wide: 10, single: 69 }, 5: { rows: 13, cols: 11, big: 10, wide: 10, single: 83 } };
/** «Skapet blir 11 × 11 med 8 store og 10 brede skuffer». */
export function presetConfirm81(etasjer) {
  const s = PRESET_SIZES81[etasjer] ?? PRESET_SIZES81[4];
  return `Skapet blir ${s.rows} × ${s.cols} med ${s.big} store og ${s.wide} brede skuffer`;
}
/** Boksen i skap-oppsettet: «Bruk Skjold Lab-hylla (3D-print)» med valget 4 eller 5 etasjer. */
export function presetBoxHtml81(etasjer = 4, { isNew = false } = {}) {
  const e = PRESET_SIZES81[etasjer] ? etasjer : 4;
  return `<div class="sk81-preset wide" data-sk81-preset>
    <span class="sk76-kick">${isNew ? 'FORHÅNDSVALG' : 'FORHÅNDSOPPSETT'}</span>
    <div class="sk81-prow"><span class="sk76-seg" role="group" aria-label="Etasjer">${PRESET81.etasjer.map((n) => `<button type="button" aria-pressed="${n === e}" data-sk81-et="${n}">${n} etasjer</button>`).join('')}</span>
    <button type="button" class="sk76-btn" data-sk81="preset">${isNew ? `Legg til ${esc(PRESET81.short)}` : `Bruk ${esc(PRESET81.name)}`}</button></div>
    <small class="sk76-mut">${esc(presetConfirm81(e))}. Store skuffer (2 × 2) og brede (2 × 1) som i 3D-modellen, LED-avstand 50 mm.</small>
  </div>`;
}
