// Prompt 78 (LEDIOS): LED over hver skuff i Skjold Lab på iOS (apps/ios/FinansHub/Sources/Skjold78*.swift + små Edit i Skjold76*.swift).
// Ingen Swift-kompilator i sandkassen: kildesjekker av API-kontrakten, knappene, oppsettet, veiviseren og utregningen av indeksen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const NEW = ['Skjold78LED.swift', 'Skjold78Views.swift'];
const TOUCHED = ['Skjold76Model.swift', 'Skjold76Page.swift', 'Skjold76Detail.swift', 'Skjold76Setup.swift'];
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Klammene går opp (grov sjekk uten kompilator; strenger telles ikke). */
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

test('filene finnes og klammene går opp', () => {
  for (const f of [...NEW, ...TOUCHED]) {
    assert.ok(existsSync(join(SRC, f)), f);
    assert.ok(balanced(code(f)), `klammer i ${f}`);
  }
});

test('API-kontrakten: leds, test, locate, off, status, calibrate, override og settings under /api/skjold', () => {
  const s = code('Skjold78LED.swift');
  for (const re of [
    /"GET", Skjold76\.root \+ "\/cabinets\/\\\(id\)\/leds"/,
    /"PUT", path, json: Skjold78\.body\(c\)/, /"\/cabinets\/\\\(id\)\/leds"/,
    /"\/cabinets\/\\\(id\)\/leds\/test", json: body/, /\["mode": mode\]/, /body\["row"\] = row/, /body\["index"\] = index/,
    /"POST", Skjold76\.root \+ "\/locate", json: body/, /\["partId": Skjold76\.idv\(p\.id\)\]/,
    /\["cabinetId": Skjold76\.idv\(cabinetId\), "row": row, "col": col\]/, /\["partIds": ids\]/, /\.prefix\(20\)/, // Prompt 79: maks 20 (før 10)
    /"POST", Skjold76\.root \+ "\/locate\/off"/,
    /"\/leds\/status\?cabinet=" \+ Skjold76\.enc\(id\)/,
    /"\/cabinets\/\\\(id\)\/leds\/calibrate"/, /json: \["index": index\]/,
    /"\/cabinets\/\\\(id\)\/leds\/override"/, /\["row": row, "col": col, "index": NSNull\(\)\]/,
    /"GET", Skjold76\.root \+ "\/leds\/settings"/, /"PUT", Skjold76\.root \+ "\/leds\/settings"/,
    /"autoLocateOpen": autoOpen, "autoLocateGlimt": autoGlimt/,
  ]) assert.match(s, re, String(re));
  // Feltene i oppsettet og svarene leses som i kontrakten.
  for (const k of ['host', 'enabled', 'color', 'durationS', 'blink', 'brightness', 'rows', 'overrides', 'row', 'start', 'count', 'reverse',
    'pitchMm', 'offsetMm', 'drawerPitchMm', 'firstDrawerXmm', 'lit', 'untilMs', 'ok', 'name', 'ledCount', 'version', 'cabinetId', 'index'])
    assert.ok(s.includes(`"${k}"`), k);
  assert.match(s, /color: String = "#2F6BFF"/);
  assert.match(s, /durationS: Int = 30/);
  assert.match(s, /brightness: Int = 128/);
  assert.match(s, /testSeconds: Int = 5/);
});

test('indeksen: overstyring først, nærmeste LED over midten, offset, reverse og serpentine (samme regel i JS)', () => {
  const s = code('Skjold78LED.swift');
  assert.match(s, /if let o = c\.overrides\["\\\(row\)-\\\(col\)"\] \{ return o \}/);
  assert.match(s, /let x: Double = c\.firstDrawerXmm \+ Double\(col - 1\) \* c\.drawerPitchMm/);
  assert.match(s, /\(\(x - r\.offsetMm\) \/ r\.pitchMm\)\.rounded\(\)/);
  assert.match(s, /r\.start \+ \(r\.reverse \? r\.count - 1 - i : i\)/);
  assert.match(s, /reverse: serpentine && r % 2 == 0/);
  assert.match(s, /1000 \/ perMeter/);

  // Speil av regelen i JS for å sjekke tallene for hånd (60/m, skuff 60 mm, første skuff midt på 30 mm).
  const idx = (c, row, col) => {
    const o = c.overrides[`${row}-${col}`];
    if (o !== undefined) return o;
    const r = c.rows.find((x) => x.row === row);
    const x = c.firstDrawerXmm + (col - 1) * c.drawerPitchMm;
    const i = Math.min(r.count - 1, Math.max(0, Math.round((x - r.offsetMm) / r.pitchMm)));
    return r.start + (r.reverse ? r.count - 1 - i : i);
  };
  const rows = [1, 2].map((r) => ({ row: r, start: (r - 1) * 18, count: 18, reverse: r % 2 === 0, pitchMm: 16.67, offsetMm: 0 }));
  const c = { firstDrawerXmm: 30, drawerPitchMm: 60, rows, overrides: { '2-5': 99 } };
  assert.equal(idx(c, 1, 1), 2);
  assert.equal(idx(c, 1, 5), 16);
  assert.equal(idx(c, 2, 1), 18 + 17 - 2);
  assert.equal(idx(c, 2, 5), 99);
});

test('💡 Vis i skapet: detaljsiden, trefflista, «Vis alle» og linja med «Slå av»', () => {
  const v = code('Skjold78Views.swift');
  assert.match(v, /"💡 Vis i skapet"/);
  assert.match(v, /Text\("💡"\)/);
  assert.match(v, /"💡 Vis alle \(\\\(n\)\)"/);
  assert.match(v, /"Lyser i skapet · " \+ where_/);
  assert.match(v, /Button\("Slå av"\) \{ Task \{ @MainActor in await l\.off\(store\) \} \}/);
  assert.match(v, /TimelineView\(\.periodic\(from: \.now, by: 1\)\)/);
  const d = code('Skjold76Detail.swift');
  assert.match(d, /Skj78LocateButton\(part: x\)/);
  assert.match(d, /await Skjold78\.shared\.autoOnOpen\(x, store\)/);
  const pg = code('Skjold76Page.swift');
  assert.match(pg, /Skj78RowButton\(part: part\)/);
  assert.match(pg, /Skj78AllButton\(parts: m\.items\)/);
  assert.match(pg, /Skj78LitBar\(\)/);
  assert.match(pg, /await Skjold78\.shared\.load\(store\)/);
  // Auto-lys bare når innstillingen er på og skapet har LED.
  assert.match(code('Skjold78LED.swift'), /if !autoOpen \|\| !canLocate\(p\) \|\| lastAuto == p\.id \{ return \}/);
});

test('LED-oppsett per skap: vert, test, rader, status og veiviseren', () => {
  const pg = code('Skjold76Page.swift');
  assert.match(pg, /Label\("LED-oppsett", systemImage: "lightbulb"\)/);
  assert.match(pg, /case \.leds\(let c\): Skj78Setup\(startId: c\)/);
  assert.match(pg, /case \.calibrate\(let c\): Skj78Calibrate\(cabinetId: c\)/);
  const md = code('Skjold76Model.swift');
  assert.match(md, /case leds\(String\)/);
  assert.match(md, /case calibrate\(String\)/);
  assert.match(code('Skjold76Setup.swift'), /m\.sheet = \.leds\(c\.id\)/);
  const v = code('Skjold78Views.swift');
  for (const t of ['Vert (IP eller navn i hjemmenettet)', 'Test hele stripa', 'Samme retning', 'Serpentine', 'Avstand mellom skuffene (mm)',
    'LED-er per meter', 'Lagre LED-oppsettet', 'Kalibrer: trykk på skuffen som lyser', 'Forrige LED', 'Neste LED', 'Trykk på skuffen som lyser',
    'Lys opp automatisk når jeg åpner et treff', 'Lys opp når Glimt svarer', 'Sjekker WLED …'])
    assert.ok(v.includes(`"${t}"`), t);
  assert.match(v, /l\.test\(id, mode: mode, row: row, index: index, store\)/);
  assert.match(v, /runTest\("all", nil, nil\)/);
  assert.match(v, /runTest\("row", r, nil\)/);
  assert.match(v, /runTest\("index", nil, testIndex\)/);
  assert.match(v, /l\.checkStatus\(cabId, store\)/);
  assert.match(v, /l\.override\(cabinetId, row: r, col: k, index: i, store\)/);
  assert.match(v, /l\.calibrate\(cabinetId, index: index, store\)/);
});

test('feil: 404 skjuler knappene, 429 og tidsavbrudd gir norsk tekst; innstillingene faller tilbake til lokal lagring', () => {
  const s = code('Skjold78LED.swift');
  assert.match(s, /var anyEnabled: Bool \{ !missing && /);
  assert.match(s, /a\.status == 429 \{ return "Vent litt/);
  assert.match(s, /WLED svarte ikke i tide/);
  assert.match(s, /localSettings = true\n\s+readLocal\(\)/);
  assert.match(s, /UserDefaults\.standard\.set\(o, forKey: Skjold78\.localKey\)/);
  // untilMs: epoch-ms eller varighet.
  assert.match(s, /if v > 1_000_000_000_000 \{ return Date\(timeIntervalSince1970: v \/ 1000\) \}/);
});
