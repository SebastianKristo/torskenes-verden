// Prompt 78 (LEDWEB): LED over skuffene i Skjold Lab på web. De rene hjelperne (skjold78-logic.js) testes direkte, resten er kildesjekker.
// Oppførselen er sjekket i Chromium (Playwright, 1440 og 390 px, port 4803): 💡 Vis i skapet på detaljsiden og i trefflista,
// «Vis alle i skapet», lyslinja med nedtelling og «Slå av», LED-oppsett per skap (vert, rader, Fyll ut, test, lagre),
// kalibreringsveiviseren (trykk på skuffen som lyser → neste LED) og statusmerket – uten JS-feil og uten vannrett scroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normLeds78, autoRows78, ledIndex78, ledTotal78, hostOk78, ledsBody78, secsLeft78, statusText78, defRow78 } from '../public/js/skjold78-logic.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cab = { id: 1, rows: 3, cols: 5 };

test('oppsettet leses romslig og får standardverdier', () => {
  const L = normLeds78(null, cab);
  assert.equal(L.enabled, false);
  assert.equal(L.color, '#2F6BFF');
  assert.equal(L.durationS, 30);
  assert.equal(L.brightness, 128);
  assert.equal(L.rows.length, 3, 'én rad per skuffrad');
  assert.deepEqual(L.rows.map((r) => [r.start, r.count, r.reverse]), [[0, 18, false], [18, 18, true], [36, 18, false]], 'serpentine som serveren');
  const W = normLeds78({ leds: { host: ' 192.168.1.50 ', enabled: true, color: '2f6bff', rows: [{ row: 2, start: 40, count: 10, reverse: true, pitchMm: 16.667, offsetMm: 5 }], overrides: { '1-1': 7, x: 3, '2-2': -1 } } }, cab);
  assert.equal(W.host, '192.168.1.50');
  assert.equal(W.color, '#2F6BFF');
  assert.deepEqual(W.rows[1], { row: 2, start: 40, count: 10, reverse: true, pitchMm: 16.667, offsetMm: 5 });
  assert.deepEqual(W.overrides, { '1-1': 7 }, 'ugyldige overstyringer forkastes');
  assert.deepEqual(defRow78(1, cab), L.rows[0]);
});

test('indeksen: pitch, forskyvning, retning og overstyring (samme regel som serveren)', () => {
  const L = { drawerPitchMm: 60, firstDrawerXmm: 30, rows: [{ row: 1, start: 0, count: 18, reverse: false, pitchMm: 16.667, offsetMm: 8.333 }, { row: 2, start: 18, count: 18, reverse: true, pitchMm: 16.667, offsetMm: 8.333 }], overrides: {} };
  assert.equal(ledIndex78(L, 1, 1), 1, 'x=30 → (30−8,3)/16,7 = 1,3 → 1');
  assert.equal(ledIndex78(L, 1, 3), 8, 'x=150 → 8,49 → 8');
  assert.equal(ledIndex78(L, 2, 1), 18 + 17 - 1, 'baklengs');
  assert.equal(ledIndex78(L, 3, 1), null, 'raden mangler');
  assert.equal(ledIndex78({ ...L, overrides: { '2-1': 99 } }, 2, 1), 99, 'overstyring går foran');
  assert.equal(ledIndex78({ ...L, rows: [{ row: 1, start: 5, count: 3, reverse: false, pitchMm: 50, offsetMm: 0 }] }, 1, 5), 7, 'klemt til siste LED');
  assert.equal(ledTotal78(L), 36);
  assert.equal(ledTotal78({ rows: [], overrides: { '1-1': 40 } }), 41);
});

test('Fyll ut: serpentine og samme retning', () => {
  const rows = normLeds78(null, cab).rows;
  assert.deepEqual(autoRows78(rows, { perRow: 15, serpentine: true }).map((r) => [r.start, r.count, r.reverse]), [[0, 15, false], [15, 15, true], [30, 15, false]]);
  assert.deepEqual(autoRows78(rows, { perRow: 15, first: 60 }).map((r) => [r.start, r.reverse]), [[60, false], [75, false], [90, false]]);
});

test('verten må være i hjemmenettet (klientsjekk)', () => {
  for (const h of ['', '192.168.1.50', '10.0.0.7', '172.16.4.2', '172.31.255.1', 'wled', 'wled-skap.local', 'skap.lan', 'http://192.168.1.50/', '192.168.1.50:8080', 'wled-test:4813']) assert.ok(hostOk78(h), h);
  for (const h of ['8.8.8.8', '172.32.0.1', 'example.com', 'wled.example.no', '192.168.1.300', 'a b', '127.0.0.1', 'https://192.168.1.50', '192.168.1.50/json']) assert.ok(!hostOk78(h), h);
});

test('body til PUT, nedtelling og statusmerke', () => {
  const L = normLeds78({ host: 'wled.local', enabled: true, drawerPitchMm: 55 }, cab);
  const b = ledsBody78(L);
  assert.deepEqual(Object.keys(b).sort(), ['blink', 'brightness', 'color', 'drawerPitchMm', 'durationS', 'enabled', 'firstDrawerXmm', 'host', 'overrides', 'rows'].sort());
  assert.equal(b.drawerPitchMm, 55);
  assert.equal(secsLeft78(1_000_000_030_000, 1_000_000_000_000), 30, 'epoke-ms');
  assert.equal(secsLeft78(5000, 1_000_000_000_000), 5, 'varighet i ms');
  assert.equal(secsLeft78(0), 0);
  assert.deepEqual(statusText78({ ok: true, name: 'WLED-Skap', ledCount: 216, version: '0.15.0' }), { cls: 'ok', text: 'WLED-Skap · 216 LED · v0.15.0' });
  assert.equal(statusText78({ ok: false, error: 'WLED svarte ikke innen 3 s' }).cls, 'bad');
  assert.equal(statusText78(null).cls, 'wait');
});

test('modulen: API-kontrakten, tekster og sikkerhet', () => {
  const js = read('public/js/skjold78-leds.js');
  for (const s of ["'/locate'", "'/locate/off'", '/leds`', '/leds/test`', '/leds/calibrate`', '/leds/override`', '/leds/status?cabinet=', "'/leds/settings'", 'partIds: ids', 'json: { row, col, index }', 'json: { index: W.index }']) assert.ok(js.includes(s), `mangler ${s}`);
  for (const s of ['💡 Vis i skapet', 'Lys opp automatisk når jeg åpner et treff', 'Vis alle i skapet', 'Slå av', 'Trykk på skuffen som lyser', 'Forrige LED', 'Neste LED', 'Test alle', 'Fyll ut', 'Kalibrer', 'WLED-vert', 'Glimt lyser opp skuffen']) assert.ok(js.includes(s), `mangler «${s}»`);
  assert.match(js, /autoLocateOpen: false, autoLocateGlimt: false/, 'begge av som standard');
  assert.match(js, /status === 429/, 'rate limit gir en forståelig melding');
  assert.match(js, /slice\(0, 20\)/, 'maks 20 treff samtidig (prompt 79)');
  assert.doesNotMatch(js, /\son(error|load|click|input)="[a-z]/, 'CSP: ingen inline hendelser');
  const css = read('public/css/skjold78.css');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.sk78-tw\{position:relative;overflow-x:auto/, 'radtabellen ruller innenfor kortet på mobil');
});

test('koblet inn i Skjold Lab og skap-oppsettet', () => {
  const m = read('public/js/skjold76.js'), ed = read('public/js/skjold76-edit.js');
  assert.match(m, /from '\.\/skjold78-leds\.js'/);
  assert.match(m, /\$\{locateBtn78\(p\)\}/);
  assert.match(m, /listBtn78\(p\)/);
  assert.match(m, /listAllBtn78\(S\.items\)/);
  assert.match(m, /litBarHtml78\(\)/);
  assert.match(m, /afterPart78\(p\)/);
  assert.match(m, /if \(click78\(t\)\) return;/);
  assert.match(m, /if \(input78\(e\.target\)\) return;/);
  assert.match(m, /if \(submit78\(e\)\) return;/);
  assert.match(ed, /\$\{c \? ledSetupHtml78\(c\) : ''\}/);
});
