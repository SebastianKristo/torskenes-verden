// Prompt 81 (SPANAND): store skuffer (sammenslåtte ruter) og «Skjold Lab-hylla (3D-print)» i Skjold Lab på Android –
// kildesjekker og de rene reglene i Skjold81.kt oversatt til JS (de samme reglene er også kjørt med kotlinc mot fasiten).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
/** Kode uten kommentarer. */
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ---- Speiler parseShort81 / spanText81 / cells81 / cellOf81 / anchor81 / cellCount81 / spanProblem81 / presetSummary81 ---- */
const parseShort = (s) => {
  const p = String(s ?? '').trim().split('-').map((x) => Number.parseInt(x, 10));
  return s != null && p.length === 2 && p.every((n) => n > 0) ? [p[0], p[1]] : null;
};
const spanText = (row, col, sr = 1, sc = 1, comp = null) =>
  `Rad ${sr > 1 ? `${row}–${row + sr - 1}` : row} · Skuff ${sc > 1 ? `${col}–${col + sc - 1}` : col}` + (comp != null ? ` · Rom ${comp}` : '');
const at = (m, r, c) => m?.drawers.find((d) => d.row === r && d.col === c) ?? null;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const has = (cell, r, c) => r >= cell.row && r < cell.row + cell.spanR && c >= cell.col && c < cell.col + cell.spanC;
function cells(rows, cols, m) {
  const covered = new Set();
  const out = [];
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    if (covered.has(`${r}:${c}`)) continue;
    const d = at(m, r, c);
    const a = parseShort(d?.coveredBy);
    if (d?.coveredBy != null && !(a && a[0] === r && a[1] === c)) continue;
    const cell = { row: r, col: c, spanR: clamp(d?.spanR ?? 1, 1, rows - r + 1), spanC: clamp(d?.spanC ?? 1, 1, cols - c + 1) };
    for (let rr = r; rr < r + cell.spanR; rr++) for (let cc = c; cc < c + cell.spanC; cc++) covered.add(`${rr}:${cc}`);
    out.push(cell);
  }
  return out;
}
function cellOf(m, rows, cols, r, c) {
  const d = at(m, r, c);
  const a = parseShort(d?.coveredBy);
  if (a && !(a[0] === r && a[1] === c)) {
    const ad = at(m, a[0], a[1]);
    return { row: a[0], col: a[1], spanR: clamp(ad?.spanR ?? 1, 1, rows - a[0] + 1), spanC: clamp(ad?.spanC ?? 1, 1, cols - a[1] + 1) };
  }
  if (m && (d?.spanR ?? 1) === 1 && (d?.spanC ?? 1) === 1) {
    const hit = cells(rows, cols, m).find((x) => has(x, r, c));
    if (hit) return hit;
  }
  return { row: r, col: c, spanR: clamp(d?.spanR ?? 1, 1, Math.max(1, rows - r + 1)), spanC: clamp(d?.spanC ?? 1, 1, Math.max(1, cols - c + 1)) };
}
const anchor = (m, r, c) => { const x = cellOf(m, m?.rows ?? r, m?.cols ?? c, r, c); return [x.row, x.col]; };
const cellCount = (m, cell) => {
  let n = 0;
  for (let r = cell.row; r < cell.row + cell.spanR; r++) for (let c = cell.col; c < cell.col + cell.spanC; c++) n += at(m, r, c)?.count ?? 0;
  return n;
};
function spanProblem(m, r, c, sr, sc) {
  if (sr < 1 || sr > 4 || sc < 1 || sc > 4) return 'Spennet må være 1–4';
  if (r + sr - 1 > m.rows || c + sc - 1 > m.cols) return 'Skuffen går utenfor skapet';
  for (let rr = r; rr < r + sr; rr++) for (let cc = c; cc < c + sc; cc++) {
    const o = cellOf(m, m.rows, m.cols, rr, cc);
    if (!(o.row === r && o.col === c) && (o.spanR > 1 || o.spanC > 1)) return `Overlapper skuffen ${o.row}-${o.col}`;
  }
  return null;
}
const presetInfo = (e) => (e >= 5 ? [13, 10, 10] : [11, 8, 10]);
const presetSummary = (e) => { const [r, st, br] = presetInfo(e); return `Skapet blir ${r} × 11 med ${st} store og ${br} brede skuffer`; };

/** Kart som serveren gir det: alle ruter, spenn på ankeret, coveredBy «r-c» på dekkede ruter. */
function mkMap(rows, cols, spans, counts = {}) {
  const cov = new Map();
  for (const [r0, c0, sr, sc] of spans) for (let r = r0; r < r0 + sr; r++) for (let c = c0; c < c0 + sc; c++) if (r !== r0 || c !== c0) cov.set(`${r}:${c}`, `${r0}-${c0}`);
  const drawers = [];
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const s = spans.find((x) => x[0] === r && x[1] === c);
    drawers.push({ row: r, col: c, count: counts[`${r}:${c}`] ?? 0, spanR: s?.[2] ?? 1, spanC: s?.[3] ?? 1, coveredBy: cov.get(`${r}:${c}`) ?? null });
  }
  return { rows, cols, drawers };
}
/** Fasiten i CONTRACT81 (ordrett). */
function fasit(etasjer) {
  const big = etasjer === 5 ? [1, 3, 6, 9, 12] : [1, 4, 7, 10];
  const wideRows = etasjer === 5 ? [5, 8, 11] : [3, 6, 9];
  const sp = [];
  for (const r of big) for (const c of [1, 3]) sp.push([r, c, 2, 2]);
  for (const r of wideRows) for (const c of [1, 3]) sp.push([r, c, 1, 2]);
  for (const c of [5, 8, 10]) sp.push([1, c, 1, 2]);
  sp.push([2, 5, 1, 2]);
  return mkMap(etasjer === 5 ? 13 : 11, 11, sp);
}

test('filene finnes og er koblet inn (tegning, kart, tilbake, oppsett)', () => {
  assert.ok(existsSync(join(SRC, 'Skjold81.kt')));
  assert.ok(existsSync(join(SRC, 'ui/Skjold81Ui.kt')));
  const m = code('Skjold76.kt');
  assert.match(m, /val spanR: Int = 1, val spanC: Int = 1, val coveredBy: String\? = null/, 'skuffen har spenn og coveredBy');
  assert.match(m, /d\.i76\("spanR"\)[\s\S]*?d\.i76\("spanC"\)[\s\S]*?d\.s43\("coveredBy"\)/, 'leses fra kartet');
  assert.match(m, /Skjold81\.reset\(\)/);
  assert.match(m, /Skjold81\.newAsk -> Skjold81\.newAsk = false/, 'tilbake lukker arket');
  assert.match(m, /loadPresets81\(\)/);
  assert.match(m, /locText81\(cabId,/, 'angre-teksten viser spenn');
  assert.match(m, /cellOf81\(m, m\.rows, m\.cols, r, c\)\.let \{ it\.row == r && it\.col == c && cellCount81\(m, it\) == 0 \}/, 'ledig skuff: bare ankre');
  const ui = code('ui/Skjold76Ui.kt');
  assert.match(ui, /for \(cell in cells81\(rows, cols, m\)\)/, 'tegningen: ett felt per skuff');
  assert.match(ui, /Size\(fw, fh\)/);
  assert.match(ui, /anchor81\(s\.maps\[cab\.id\], r, c\)\.let \{ a -> onTap\(a\.first, a\.second\) \}/, 'trykk på dekket rute = ankeret');
  assert.match(ui, /val hlA = hl\?\.let \{ anchor81\(m81, it\.first, it\.second\) \}/, 'uthevet skuff = ankeret');
  assert.match(ui, /Size\(cw \* hc\.spanC, ch \* hc\.spanR\)/, 'uthevingen dekker hele feltet');
  assert.match(ui, /quad76\(m, hc\.row, hc\.col, hc\.spanR, hc\.spanC\)/, 'også på bildet');
  assert.match(ui, /drawerText81\(cab\.id, hlA\.first, hlA\.second\)/);
  assert.match(ui, /Flytt til \$\{drawerText81\(t\.first, t\.second, t\.third, comp\)\}/, 'velg plassering: ett valg');
  assert.match(ui, /locText81\(d\.cabinetId,/);
  assert.match(ui, /SpanRow81\(vm, cab, d, r, c\)/, 'Bredde/Høyde i skuffkortet');
  assert.match(ui, /PresetCard81\(vm, cab\)/, 'forhåndsoppsett i Skap-oppsett');
  assert.match(ui, /NewPresetCard81\(\)/, 'forhåndsvalg for nytt skap');
  assert.match(ui, /if \(Skjold81\.newAsk\) NewPresetAsk81\(vm\)/);
});

test('API-kallene følger CONTRACT81', () => {
  const k = code('Skjold81.kt');
  assert.match(k, /PRESET_ID81 = "skjoldlab3d"/);
  assert.match(k, /PRESET_NAME81 = "Skjold Lab-hylla \(3D-print\)"/);
  assert.match(k, /put81\("\/cabinets\/\$cabId\/drawers\/\$row\/\$col", JSONObject\(\)\.put\("spanR", spanR\.coerceIn\(1, 4\)\)\.put\("spanC", spanC\.coerceIn\(1, 4\)\)\)/);
  assert.match(k, /post81\("\/cabinets\/\$cabId\/preset", JSONObject\(\)\.put\("id", PRESET_ID81\)\.put\("etasjer", if \(etasjer >= 5\) 5 else 4\)\)/);
  assert.match(k, /post81\("\/cabinets", JSONObject\(\)\.put\("name"[\s\S]*?\.put\("preset", JSONObject\(\)\.put\("id", PRESET_ID81\)\.put\("etasjer"/);
  assert.match(k, /get81\("\/presets"\)/);
  assert.match(k, /optJSONArray\("etasjer"\)/, 'options.etasjer');
  assert.match(k, /Kunne ikke lagre: \$\{e\.message/, '409 viser serverens forklaring');
  const u = code('ui/Skjold81Ui.kt');
  assert.match(u, /"Bruk \$PRESET_NAME81"/, 'knappen «Bruk Skjold Lab-hylla (3D-print)»');
  assert.match(u, /presetSummary81\(et\)/, 'bekreftelse');
  assert.match(u, /Text\("Bredde"/);
  assert.match(u, /Text\("Høyde"/);
  assert.match(u, /listOf\(1, 2\)\.forEach/, 'enkelt: 1 eller 2');
  assert.match(u, /Skjold Lab-hylla \(3D\)/);
  assert.match(u, /Egne rader × kolonner/);
});

test('plassering i tekst: stor, bred og vanlig skuff', () => {
  assert.equal(spanText(4, 1, 2, 2), 'Rad 4–5 · Skuff 1–2');
  assert.equal(spanText(3, 1, 1, 2), 'Rad 3 · Skuff 1–2');
  assert.equal(spanText(4, 2), 'Rad 4 · Skuff 2');
  assert.equal(spanText(4, 2, 1, 1, 1), 'Rad 4 · Skuff 2 · Rom 1');
  assert.deepEqual(parseShort('4-1'), [4, 1]);
  assert.equal(parseShort(null), null);
  assert.equal(parseShort('x'), null);
  const k = code('Skjold81.kt');
  assert.match(k, /"Rad \$r · Skuff \$c"/);
  assert.match(k, /"\$row–\$\{row \+ spanR - 1\}"/);
});

test('tegningen av fasiten: 4 etasjer = 8 store, 10 brede, 69 vanlige; 5 etasjer = 10, 10, 83', () => {
  for (const [e, st, br, va] of [[4, 8, 10, 69], [5, 10, 10, 83]]) {
    const m = fasit(e);
    const cs = cells(m.rows, m.cols, m);
    assert.equal(cs.filter((c) => c.spanR === 2 && c.spanC === 2).length, st, `${e}: store`);
    assert.equal(cs.filter((c) => c.spanR === 1 && c.spanC === 2).length, br, `${e}: brede`);
    assert.equal(cs.filter((c) => c.spanR === 1 && c.spanC === 1).length, va, `${e}: vanlige`);
    // Hver rute dekkes av nøyaktig ett felt.
    for (let r = 1; r <= m.rows; r++) for (let c = 1; c <= 11; c++) assert.equal(cs.filter((x) => has(x, r, c)).length, 1, `${e}: ${r}-${c}`);
  }
  assert.equal(presetSummary(4), 'Skapet blir 11 × 11 med 8 store og 10 brede skuffer');
  assert.equal(presetSummary(5), 'Skapet blir 13 × 11 med 10 store og 10 brede skuffer');
  assert.match(code('Skjold81.kt'), /Triple\(13, 10, 10\) else Triple\(11, 8, 10\)/);
});

test('trykk på dekket rute gir ankeret; antall på ankeret; eldre kart uten coveredBy', () => {
  const m = fasit(4);
  m.drawers.find((d) => d.row === 5 && d.col === 2).count = 3; // eldre deler i en dekket rute
  assert.deepEqual(anchor(m, 5, 2), [4, 1]);
  assert.deepEqual(anchor(m, 4, 1), [4, 1]);
  assert.deepEqual(anchor(m, 2, 6), [2, 5]);
  assert.deepEqual(anchor(m, 3, 5), [3, 5]);
  assert.equal(cellCount(m, cellOf(m, 11, 11, 4, 1)), 3);
  assert.deepEqual(cellOf(m, 11, 11, 5, 2), { row: 4, col: 1, spanR: 2, spanC: 2 });
  const old = { rows: 3, cols: 3, drawers: [{ row: 1, col: 1, count: 0, spanR: 2, spanC: 2, coveredBy: null }] };
  assert.deepEqual(anchor(old, 2, 2), [1, 1]);
  assert.equal(cells(3, 3, old).length, 6);
  // Spenn klippes til skapet.
  const edge = { rows: 2, cols: 2, drawers: [{ row: 2, col: 2, count: 0, spanR: 2, spanC: 2, coveredBy: null }] };
  assert.deepEqual(cells(2, 2, edge).at(-1), { row: 2, col: 2, spanR: 1, spanC: 1 });
});

test('slå sammen / dele: innenfor skapet og ingen overlapp (klientsjekk før PUT)', () => {
  const m = fasit(4);
  assert.equal(spanProblem(m, 3, 6, 2, 2), null);
  assert.equal(spanProblem(m, 2, 6, 2, 2), 'Overlapper skuffen 2-5');
  assert.equal(spanProblem(m, 11, 11, 2, 1), 'Skuffen går utenfor skapet');
  assert.equal(spanProblem(m, 4, 1, 1, 1), null, 'dele');
  assert.equal(spanProblem(m, 4, 1, 2, 2), null, 'uendret');
  assert.equal(spanProblem(m, 1, 1, 5, 1), 'Spennet må være 1–4');
});

test('ikke rørt: Hjem-filene (annen agent)', () => {
  for (const f of ['Skjold81.kt', 'ui/Skjold81Ui.kt']) assert.doesNotMatch(code(f), /Home70|Ui52B|Tiles50/);
});
