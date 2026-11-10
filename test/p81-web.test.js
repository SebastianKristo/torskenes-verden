// Prompt 81 (SPANWEB): Skjold Lab på web – tegningen med store/brede skuffer (ett felt over spanC × spanR ruter, dekkede ruter hoppes over,
// trykk på dekket rute = ankeret, uthevingen dekker hele feltet), plassering i tekst, skuffdetaljer «Bredde 1/2 · Høyde 1/2» og
// knappen «Bruk Skjold Lab-hylla (3D-print)» med 4/5 etasjer og bekreftelse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawCabinet76, overlayGrid76, CELL_W, CELL_H } from '../public/js/skjold76-draw.js';
import { anchor81, longSpan81, longAt81, normSel81, anchors81, spanFieldsHtml81, presetConfirm81, presetBoxHtml81, PRESET_SIZES81 } from '../public/js/skjold81-span.js';

// Fasiten fra kontrakten (4 etasjer). Serveren regner den ut (test/p81-span.test.js); her holder vi web-testen fri for databasen.
const FASIT4 = {
  rows: 11, cols: 11,
  spans: [
    ...[1, 4, 7, 10].flatMap((row) => [1, 3].map((col) => ({ row, col, spanR: 2, spanC: 2 }))),
    ...[3, 6, 9].flatMap((row) => [1, 3].map((col) => ({ row, col, spanR: 1, spanC: 2 }))),
    ...[5, 8, 10].map((col) => ({ row: 1, col, spanR: 1, spanC: 2 })), { row: 2, col: 5, spanR: 1, spanC: 2 },
  ],
};
const summary81 = (lay) => ({ big: lay.spans.filter((x) => x.spanR === 2).length, wide: lay.spans.filter((x) => x.spanR === 1).length,
  single: lay.rows * lay.cols - lay.spans.reduce((a, x) => a + x.spanR * x.spanC, 0) });

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Kart som serveren lager det: alle ruter, ankre med spenn, dekkede med coveredBy. */
function mapOf(rows, cols, spans, extra = {}) {
  const drawers = [];
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) drawers.push({ row: r, col: c, label: `R${r}·S${c}`, customLabel: null, compartments: 1, count: 0, spanR: 1, spanC: 1, coveredBy: null, ...(extra[`${r}-${c}`] ?? {}) });
  const at = (r, c) => drawers.find((d) => d.row === r && d.col === c);
  for (const s of spans) {
    Object.assign(at(s.row, s.col), { spanR: s.spanR, spanC: s.spanC });
    for (let r = s.row; r < s.row + s.spanR; r++) for (let c = s.col; c < s.col + s.spanC; c++) if (r !== s.row || c !== s.col) at(r, c).coveredBy = `${s.row}-${s.col}`;
  }
  return { rows, cols, drawers };
}

test('hjelpere: anker, tekst og valg', () => {
  const m = mapOf(5, 4, [{ row: 4, col: 1, spanR: 2, spanC: 2 }, { row: 3, col: 1, spanR: 1, spanC: 2 }]);
  assert.deepEqual(anchor81(m, 5, 2), { row: 4, col: 1, spanR: 2, spanC: 2 });
  assert.deepEqual(anchor81(m, 3, 2), { row: 3, col: 1, spanR: 1, spanC: 2 });
  assert.deepEqual(anchor81(m, 1, 4), { row: 1, col: 4, spanR: 1, spanC: 1 });
  assert.equal(longSpan81(4, 1, 2, 2), 'Rad 4–5 · Skuff 1–2');
  assert.equal(longAt81(m, 3, 2), 'Rad 3 · Skuff 1–2');
  assert.equal(longAt81(m, 2, 2), 'Rad 2 · Skuff 2');
  assert.equal(longAt81(null, 2, 2), 'Rad 2 · Skuff 2'); // uten kart (eldre klient/offline)
  assert.deepEqual(normSel81(m, { row: 5, col: 1, compartment: 1 }), { row: 4, col: 1, compartment: 1, spanR: 2, spanC: 2 });
  assert.equal(anchors81(m).length, 20 - 3 - 1);
});

test('tegningen: ett felt per sammenslått skuff, dekkede ruter hoppes over, uthevingen dekker hele feltet', () => {
  const lay = FASIT4;
  const m = mapOf(11, 11, lay.spans, { '5-2': {}, '4-1': { count: 3, customLabel: 'Store skruer', label: 'Store skruer' } });
  const cab = { rows: 11, cols: 11, kind: '3d', name: 'Hylla' };
  const svg = drawCabinet76(cab, m, { sel: { row: 5, col: 2 } }); // dekket rute → ankeret 4-1
  const groups = svg.match(/data-sk76-dr="\d+-\d+"/g);
  const s = summary81(lay);
  assert.equal(groups.length, s.big + s.wide + s.single); // 87
  assert.ok(!svg.includes('data-sk76-dr="5-2"') && !svg.includes('data-sk76-dr="1-2"') && !svg.includes('data-sk76-dr="1-6"'));
  const g41 = svg.slice(svg.indexOf('data-sk76-dr="4-1"'), svg.indexOf('</g>', svg.indexOf('data-sk76-dr="4-1"')));
  assert.match(g41, /aria-current="true"/);
  assert.match(svg, /class="sk76-dr has sel sk81-big" data-sk76-dr="4-1"/);
  assert.match(g41, /aria-label="Rad 4–5 · Skuff 1–2 \(stor skuff\) · Store skruer · 3 deler"/);
  assert.match(g41, new RegExp(`class="sk76-box"[^>]*width="${2 * CELL_W - 4}" height="${2 * CELL_H - 5}"`));
  assert.match(g41, new RegExp(`class="sk76-hlb"[^>]*width="${2 * CELL_W - 1}" height="${2 * CELL_H - 2}"`));
  assert.match(g41, /class="sk76-dotn"[^>]*>3</); // antallet vises på ankeret
  // Rad- og kolonnetallene for hele feltet er uthevet (rad 4 og 5, kolonne 1 og 2)
  assert.equal((svg.match(/class="sk76-num on"/g) ?? []).length, 4);
  // Bred skuff øverst til høyre
  assert.match(svg, /data-sk76-dr="1-5"[^>]*aria-label="Rad 1 · Skuff 5–6 \(bred skuff\)/);
  // Vanlig skuff som før
  assert.match(svg, /data-sk76-dr="5-5"[^>]*aria-label="Rad 5 · Skuff 5 · tom"/);
  // Uten spenn i kartet (eldre server): rutenett som før
  const plain = drawCabinet76({ rows: 3, cols: 3 }, { drawers: [] }, {});
  assert.equal(plain.match(/data-sk76-dr=/g).length, 9);
});

test('overlegget på bildet: spenn via grid-row/grid-column, valgt felt dekker hele skuffen', () => {
  const m = mapOf(3, 3, [{ row: 1, col: 1, spanR: 2, spanC: 2 }]);
  const ov = overlayGrid76({ rows: 3, cols: 3 }, { row: 2, col: 2 }, { map: m });
  assert.equal((ov.match(/data-sk76-ovc=/g) ?? []).length, 6);
  assert.match(ov, /<i class="on" style="grid-row:1 \/ span 2;grid-column:1 \/ span 2" data-sk76-ovc="1-1"><b class="pulse"><\/b><\/i>/);
  assert.equal((overlayGrid76({ rows: 3, cols: 3 }, null).match(/data-sk76-ovc=/g) ?? []).length, 9);
});

test('skuffdetaljer og forhåndsoppsett', () => {
  const f = spanFieldsHtml81({ spanR: 2, spanC: 1 });
  assert.match(f, /Bredde<select name="spanC"[^>]*><option value="1" selected>1<\/option><option value="2">2<\/option>/);
  assert.match(f, /Høyde<select name="spanR"[^>]*><option value="1">1<\/option><option value="2" selected>2<\/option>/);
  assert.equal(presetConfirm81(4), 'Skapet blir 11 × 11 med 8 store og 10 brede skuffer');
  assert.equal(presetConfirm81(5), 'Skapet blir 13 × 11 med 10 store og 10 brede skuffer');
  const s4 = summary81(FASIT4);
  assert.deepEqual([PRESET_SIZES81[4].big, PRESET_SIZES81[4].wide, PRESET_SIZES81[4].single], [s4.big, s4.wide, s4.single]);
  assert.deepEqual([PRESET_SIZES81[5].big, PRESET_SIZES81[5].wide, PRESET_SIZES81[5].single], [10, 10, 83]);
  const box = presetBoxHtml81(5);
  assert.match(box, /Bruk Skjold Lab-hylla \(3D-print\)/);
  assert.match(box, /aria-pressed="true" data-sk81-et="5">5 etasjer/);
  assert.match(presetBoxHtml81(4, { isNew: true }), /Legg til Skjold Lab-hylla \(3D\)/);
});

test('koblingen i appen: tegning, valg, skuffdetaljer, oppsett og CSS', () => {
  const app = read('public/js/skjold76.js'), ed = read('public/js/skjold76-edit.js'), css = read('public/css/skjold76.css'), dr = read('public/js/skjold76-draw.js');
  assert.match(dr, /import \{ normSel81, longSpan81 \} from '\.\/skjold81-span\.js'/);
  assert.match(app, /from '\.\/skjold81-span\.js'/);
  assert.match(app, /overlayGrid76\(cab, sel, \{ map \}\)/);
  assert.match(app, /anchor81\(S\.maps\[cab\.id\], r0, c0\)/); // trykk på dekket rute = ankeret
  assert.match(app, /spanFieldsHtml81\(d\)/);
  assert.match(app, /body\.spanC = sc; body\.spanR = sr/);
  assert.match(ed, /presetBoxHtml81\(U\.etasjer, \{ isNew \}\)/);
  assert.match(ed, /\/preset`, \{ method: 'POST', json: \{ id: PRESET81\.id, etasjer: e \} \}/);
  assert.match(ed, /preset: \{ id: PRESET81\.id, etasjer: e \}/);
  assert.match(ed, /confirm\(`\$\{presetConfirm81\(e\)\}/);
  assert.match(css, /\.sk81-preset\{/);
  assert.match(css, /\.sk76-dform \.sk81-span\{/);
});
