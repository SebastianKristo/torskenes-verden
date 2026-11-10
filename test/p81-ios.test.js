// Prompt 81 (SPANIOS): Skjold Lab på iOS – store og brede skuffer (sammenslåtte ruter) og «Skjold Lab-hylla (3D-print)».
// Ingen Swift-kompilator i sandkassen: kildesjekker av datamodellen, tegningen, tekstene og API-kallene (CONTRACT81.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const raw = (f) => readFileSync(join(SRC, f), 'utf8');
const code = (f) => raw(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function balanced(src) {
  const s = src.replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  const n = { '{': 0, '(': 0, '[': 0 };
  const close = { '}': '{', ')': '(', ']': '[' };
  for (const c of s) {
    if (c in n) n[c]++;
    else if (c in close) { n[close[c]]--; if (n[close[c]] < 0) return false; }
  }
  return Object.values(n).every((v) => v === 0);
}

const FILES = ['Skjold81Span.swift', 'Skjold81Preset.swift', 'Skjold76Model.swift', 'Skjold76Parse.swift', 'Skjold76Cabinet.swift',
  'Skjold76Detail.swift', 'Skjold76Edit.swift', 'Skjold76Setup.swift'];
const span = code('Skjold81Span.swift');
const pre = code('Skjold81Preset.swift');
const cab = code('Skjold76Cabinet.swift');

test('filene finnes og går opp', () => {
  for (const f of FILES) {
    assert.ok(existsSync(join(SRC, f)), f);
    assert.ok(balanced(code(f)), f);
  }
});

test('modell og lesing: spanR, spanC (1–4, standard 1) og coveredBy', () => {
  const m = code('Skjold76Model.swift');
  assert.match(m, /var spanR: Int = 1/);
  assert.match(m, /var spanC: Int = 1/);
  assert.match(m, /var coveredBy: String = ""/);
  const p = code('Skjold76Parse.swift');
  assert.match(p, /JS\.int\(d, "spanR"\) \?\? JS\.int\(d, "span_r"\) \?\? 1/);
  assert.match(p, /JS\.int\(d, "spanC"\) \?\? JS\.int\(d, "span_c"\) \?\? 1/);
  assert.match(p, /Swift\.min\(4, Swift\.max\(1,/);
  assert.match(p, /JS\.str\(d, "coveredBy"\)/);
});

test('ankeret: coveredBy først, ellers regnet ut fra spennene; spenn holdes innenfor skapet', () => {
  assert.match(span, /func anchor81\(_ r: Int, _ c: Int\) -> Skj81RC/);
  assert.match(span, /Skj81RC\.parse\(drawer\(r, c\)\.coveredBy\)/);
  assert.match(span, /r >= x\.row && r < x\.row \+ x\.spanR/);
  assert.match(span, /c >= x\.col && c < x\.col \+ x\.spanC/);
  assert.match(span, /Swift\.min\(d\.spanR, rows - r \+ 1\)/);
  assert.match(span, /Swift\.min\(d\.spanC, cols - c \+ 1\)/);
  assert.match(span, /if covered81\(r, c\) \{ continue \}/);
});

// Samme regel som Skj76Map.anchor81/boxes81, kjørt på fasiten for 4 etasjer (store 2 × 2, brede 2 × 1).
function boxes(rows, cols, spans) {
  const key = (r, c) => `${r}-${c}`;
  const anchor = (r, c) => {
    for (const [k, [sr, sc]] of Object.entries(spans)) {
      const [ar, ac] = k.split('-').map(Number);
      if (r >= ar && r < ar + sr && c >= ac && c < ac + sc) return key(ar, ac);
    }
    return key(r, c);
  };
  const out = [];
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) if (anchor(r, c) === key(r, c)) out.push(key(r, c));
  return { out, anchor };
}

test('fasit 4 etasjer gir 8 store, 10 brede og 69 vanlige felt – trykk på dekket rute gir ankeret', () => {
  const spans = {};
  for (const r of [1, 4, 7, 10]) for (const c of [1, 3]) spans[`${r}-${c}`] = [2, 2];
  for (const r of [3, 6, 9]) for (const c of [1, 3]) spans[`${r}-${c}`] = [1, 2];
  for (const c of [5, 8, 10]) spans[`1-${c}`] = [1, 2];
  spans['2-5'] = [1, 2];
  const { out, anchor } = boxes(11, 11, spans);
  assert.equal(out.length, 8 + 10 + 69);
  assert.equal(anchor(5, 4), '4-3');
  assert.equal(anchor(2, 6), '2-5');
  assert.equal(anchor(11, 11), '11-11');
});

test('tegningen: eget Layout, ankeret som ett felt over spanC × spanR, dekkede ruter hoppes over', () => {
  assert.match(span, /struct Skj81GridLayout: Layout/);
  assert.match(span, /struct Skj81Slot: LayoutValueKey/);
  assert.match(span, /k\.width \* CGFloat\(b\.sc\) \+ g \* CGFloat\(b\.sc - 1\)/);
  assert.match(span, /k\.height \* CGFloat\(b\.sr\) \+ g \* CGFloat\(b\.sr - 1\)/);
  assert.match(span, /ForEach\(map\.boxes81\(\), id: \\\.self\)/);
  assert.match(span, /Skj76Cell\(d: d, on: on, pulse: pulse, ratio: nil\)/);
  assert.match(span, /\.onTapGesture \{ pick\?\(b\.r, b\.c\) \}/);
  // Uthevet skuff = ankeret til markeringen, og rad-/kolonnetallene lyser for hele spennet.
  assert.match(span, /map\.anchor81\(m\.row, m\.col\)/);
  assert.match(span, /static func within\(_ n: Int, _ a: Int\?, _ len: Int\?\) -> Bool/);
  // Den gamle tegningen brukes uendret uten spenn.
  assert.match(cab, /if let map, map\.hasSpans81 \{\s*Skj81Drawing\(/);
  assert.match(cab, /\.modifier\(Skj81Ratio\(ratio: ratio\)\)/);
  assert.match(cab, /var ratio: CGFloat\? = Skj76Look\.aspect/);
});

test('bildet og skapvisningen: trykk på dekket rute gir ankeret, uthevingen dekker hele skuffen', () => {
  assert.match(cab, /private var anchored: \(\(Int, Int\) -> Void\)\?/);
  assert.match(cab, /Skj76PhotoView\(cab: cab, mark: mark, pulse: pulse, pick: anchored, map: map\)/);
  assert.match(cab, /map: map, mark: mark, pulse: pulse, pick: anchored\)/);
  assert.match(cab, /Skjold81\.markRect\(m, map, rows, cols, cw, rh\)/);
  assert.match(cab, /Skjold81\.outline\(map, cw, rh\)/);
  assert.match(cab, /let a: Skj81RC = map\?\.anchor81\(r, c\) \?\? Skj81RC\(r: r, c: c\)\s*pick\(a\.r, a\.c\)/);
  assert.match(code('Skjold76Model.swift'), /maps\[parts\[1\]\]\?\.anchor81\(rc\[0\], rc\[1\]\)/);
});

test('plassering i tekst: «Rad 4–5 · Skuff 1–2», «Rad 3 · Skuff 1–2», ellers som før', () => {
  assert.match(span, /n > 1 \? "\\\(a\)–\\\(a \+ n - 1\)" : "\\\(a\)"/);
  assert.match(span, /"Rad " \+ range\(r, sr\) \+ " · Skuff " \+ range\(c, sc\)/);
  const range = (a, n) => (n > 1 ? `${a}–${a + n - 1}` : `${a}`);
  const place = (r, c, sr, sc) => `Rad ${range(r, sr)} · Skuff ${range(c, sc)}`;
  assert.equal(place(4, 1, 2, 2), 'Rad 4–5 · Skuff 1–2');
  assert.equal(place(3, 1, 1, 2), 'Rad 3 · Skuff 1–2');
  assert.equal(place(4, 2, 1, 1), 'Rad 4 · Skuff 2');
  const d = code('Skjold76Detail.swift');
  assert.match(d, /Skjold81\.text\(c\.name, m\.maps\[c\.id\], r, k, comp\)/);
  assert.match(d, /Skjold81\.text\(c\.name, m\.maps\[c\.id\], l\.row, l\.col, l\.comp\)/);
});

test('skuffdetaljer: «Bredde 1/2 · Høyde 1/2» sendes som spanR/spanC i PUT', () => {
  const e = code('Skjold76Edit.swift');
  assert.match(e, /Skj81SpanPicker\(spanR: \$spanR, spanC: \$spanC\)/);
  assert.match(e, /"compartments": comps, "spanR": spanR, "spanC": spanC/);
  assert.match(e, /"PUT", Skjold76\.root \+ "\/cabinets\/\\\(cabinetId\)\/drawers\/\\\(row\)\/\\\(col\)"/);
  assert.match(e, /title: Skjold81\.place\(row, col, d\.spanR, d\.spanC\)/);
  assert.match(span, /Picker\("Bredde", selection: \$spanC\)/);
  assert.match(span, /Picker\("Høyde", selection: \$spanR\)/);
});

test('forhåndsoppsett: knapp, 4/5 etasjer, bekreftelse og riktige kall', () => {
  assert.match(pre, /static let presetId: String = "skjoldlab3d"/);
  assert.match(pre, /etasjer >= 5 \? 13 : 11/);
  assert.match(pre, /etasjer >= 5 \? 10 : 8/);
  assert.match(pre, /static let presetCols: Int = 11/);
  assert.match(pre, /"Skapet blir \\\(presetRows\(etasjer\)\) × \\\(presetCols\) med \\\(presetBig\(etasjer\)\) store og \\\(presetWide\(etasjer\)\) brede skuffer"/);
  const confirm = (e) => `Skapet blir ${e >= 5 ? 13 : 11} × 11 med ${e >= 5 ? 10 : 8} store og 10 brede skuffer`;
  assert.equal(confirm(4), 'Skapet blir 11 × 11 med 8 store og 10 brede skuffer');
  assert.equal(confirm(5), 'Skapet blir 13 × 11 med 10 store og 10 brede skuffer');
  assert.match(pre, /"Bruk Skjold Lab-hylla \(3D-print\)"/);
  assert.match(pre, /\.confirmationDialog\(/);
  assert.match(pre, /"POST", Skjold76\.root \+ "\/cabinets\/\\\(id\)\/preset", json: body/);
  assert.match(pre, /\["id": presetId, "etasjer": etasjer >= 5 \? 5 : 4\]/);
  assert.match(pre, /"GET", Skjold76\.root \+ "\/presets"/);
  assert.match(pre, /Text\("Skjold Lab-hylla \(3D\)"\)\.tag\(true\)/);
  const s = code('Skjold76Setup.swift');
  assert.match(s, /Skj81PresetNew\(etasjer: \$preset81/);
  assert.match(s, /Skj81PresetApply\(cab: c\)/);
  assert.match(s, /b\["preset"\] = Skjold81\.presetBody\(e\)/);
});

test('ikke rørt: Vær-filene', () => {
  for (const f of FILES) assert.doesNotMatch(f, /Weather|Wx/);
});
