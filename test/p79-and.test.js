// Prompt 79 (PICKAND): plukkliste og «Feilsøk LED» i Skjold Lab på Android – kildesjekker og de rene reglene oversatt til JS.
// Kotlin typesjekkes utenfor npm test (stubber, $S/kt/b79.sh): 0 nye feil mot grunnlinjen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
/** Kode uten kommentarer. */
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Speiler PALETTE79 / pickColor79 / toggle79 / setTake79 / locatablePick79 / merge79 / diagHint79 / diagAsk79 i Skjold79.kt.
const PALETTE = ['#2F6BFF', '#FFD000', '#00C853', '#FF1744', '#AA00FF', '#FF6D00', '#00E5FF', '#FF4081', '#FFFFFF', '#C6FF00'];
const pickColor = (i, first) => {
  const f = first || PALETTE[0];
  const all = [f, ...PALETTE.filter((c) => c !== f)];
  return all[((i % all.length) + all.length) % all.length];
};
const toggle = (list, p) => (list.some((x) => x.id === p.id) ? list.filter((x) => x.id !== p.id) : [...list, p]);
const setTake = (list, id, n) => list.map((x) => (x.id === id ? { ...x, take: Math.min(999, Math.max(1, n)) } : x));
const placed = (p) => p.cabinetId != null && p.row != null && p.col != null;
const locatable = (list, ready) => list.filter((p) => placed(p) && ready(p.cabinetId)).slice(0, 20);
const merge = (local, srv) => [...local, ...srv.filter((s) => !local.some((l) => l.id === s.id))];
const hint = (red, blue) => {
  if (red == null || blue == null) return null;
  if (!red && !blue) return 'hw';
  if (red && !blue) return 'oss';
  if (red && blue) return 'kal';
  return 'strøm';
};

test('filene finnes og er koblet inn', () => {
  assert.ok(existsSync(join(SRC, 'Skjold79.kt')));
  assert.ok(existsSync(join(SRC, 'ui/Skjold79Ui.kt')));
  const ui = code('ui/Skjold76Ui.kt');
  assert.match(ui, /"pick" -> PickScreen79\(vm\)/, 'plukklista som egen skjerm');
  assert.match(ui, /"pick" -> "Plukkliste"/);
  assert.match(ui, /PickBtn79\(vm, pt\)/, '+ på hvert treff');
  assert.match(ui, /PickBtn79\(vm, pt, big = true\)/, '+ på detaljsiden');
  assert.match(ui, /PickBar79\(vm, Modifier\.align\(Alignment\.BottomCenter\)\)/, 'linja nederst');
  const u78 = code('ui/Skjold78Ui.kt');
  assert.match(u78, /if \(pickBarOn79\(\)\) return/, 'LitBar78 viker for plukklistelinja');
  assert.match(u78, /LitDots79\(col\)/, 'én prikk per farge');
  assert.match(u78, /drawerColor79\(/, 'fargen per del i trefflista');
  assert.match(u78, /Diagnose79\(vm\)/, 'veiviseren i LED-oppsettet');
  assert.match(u78, /Feilsøk LED/);
  assert.match(u78, /vm\.startDiag79\(cab\.id\)/);
  const m = code('Skjold76.kt');
  assert.match(m, /Skjold79\.reset\(\)/);
  assert.match(m, /Skjold79\.diagOn -> stopDiag79\(\)/, 'tilbake lukker feilsøkingen');
  assert.match(m, /loadPick79\(\)/, 'plukklista lastes når Skjold Lab åpnes');
});

test('API-kallene følger CONTRACT79', () => {
  const k = code('Skjold79.kt');
  assert.match(k, /post79\("\/locate", JSONObject\(\)\.put\("partIds", JSONArray\(\)[\s\S]*?\.put\("colors", true\)/, 'partIds + colors:true');
  assert.match(k, /MAX_LIT79 = 20/, 'maks 20 skuffer');
  assert.match(k, /get79\("\/picklist"\)/);
  assert.match(k, /put79\("\/picklist", body\)/);
  assert.match(k, /put\("partId", idJson79\(it\.id\)\)\.put\("qty", it\.take\)\.put\("take", it\.take\)/);
  assert.match(k, /status == 404\) s\.serverSync = false/, 'uten /picklist: bare lokalt');
  assert.match(k, /getSharedPreferences\("skjold79"/, 'lokal lagring');
  assert.match(k, /"pick-" \+ \(account\?\.id/, 'per bruker');
  assert.match(k, /post79\("\/parts\/\$\{p\.id\}\/qty", JSONObject\(\)\.put\("delta", -p\.take\.toDouble\(\)\)\)/, 'ta ut av lager');
  assert.match(k, /offerUndo76\("Tok ut/, 'med angre');
  assert.match(k, /offerUndo76\("Plukklista er tømt"/, 'tøm med angre');
  assert.match(k, /\/leds\/diagnose", JSONObject\(\)\)/, 'diagnose');
  assert.match(k, /normColor78\(j\.s43\("color"\)\) \?: pickColor79\(/, 'serverens farge, ellers paletten');
  assert.doesNotMatch(k, /json\/state|json\/info/, 'appen snakker aldri med WLED direkte');
  const k78 = code('Skjold78.kt');
  assert.match(k78, /take\(MAX_LIT79\)/, 'Vis treffene: også maks 20');
});

test('farger: første er skapets egen, så lett skillbare farger uten gjentak', () => {
  assert.equal(PALETTE.length, 10);
  assert.equal(new Set(PALETTE).size, 10);
  assert.equal(pickColor(0), '#2F6BFF');
  assert.equal(pickColor(1), '#FFD000');
  assert.equal(pickColor(0, '#00C853'), '#00C853');
  assert.equal(pickColor(2, '#00C853'), '#FFD000');
  const ten = Array.from({ length: 10 }, (_, i) => pickColor(i, '#FF1744'));
  assert.equal(new Set(ten).size, 10, 'ti deler, ti farger');
  const k = code('Skjold79.kt');
  for (const c of PALETTE) assert.ok(k.includes(`"${c}"`), c);
  // Samme palett som serveren (PICKSRV), når den finnes.
  let srv;
  try { srv = readFileSync(join(ROOT, 'server/skjold76/leds78.js'), 'utf8'); } catch { return; }
  const m = srv.match(/PALETTE79 = \[([^\]]+)\]/);
  if (m) assert.deepEqual(m[1].match(/#[0-9A-F]{6}/gi).map((x) => x.toUpperCase()), PALETTE, 'samme palett som serveren');
});

test('plukklista: +/✓, antall, rekkefølge, sammenslåing', () => {
  const diode = { id: '1', cabinetId: 'a', row: 1, col: 1, take: 1 };
  const esp = { id: '2', cabinetId: 'a', row: 2, col: 3, take: 1 };
  const tr = { id: '3', cabinetId: null, row: null, col: null, take: 1 };
  let l = toggle(toggle(toggle([], diode), esp), tr);
  assert.deepEqual(l.map((x) => x.id), ['1', '2', '3']);
  l = toggle(l, esp);
  assert.deepEqual(l.map((x) => x.id), ['1', '3'], 'nytt trykk fjerner');
  assert.equal(setTake(l, '1', 0)[0].take, 1);
  assert.equal(setTake(l, '1', 5)[0].take, 5);
  assert.deepEqual(locatable([diode, esp, tr], (c) => c === 'a').map((x) => x.id), ['1', '2']);
  assert.deepEqual(locatable([diode, esp], () => false), []);
  const many = Array.from({ length: 25 }, (_, i) => ({ ...diode, id: String(i) }));
  assert.equal(locatable(many, () => true).length, 20);
  assert.deepEqual(merge([esp, diode], [diode, tr]).map((x) => x.id), ['2', '1', '3']);
});

test('feilsøk: hint ut fra svarene', () => {
  assert.equal(hint(null, true), null);
  assert.equal(hint(false, false), 'hw');
  assert.equal(hint(true, false), 'oss');
  assert.equal(hint(true, true), 'kal');
  assert.equal(hint(false, true), 'strøm');
  assert.match(code('Skjold79.kt'), /hints\[it\]/, 'serverens hint for utfallet brukes når det finnes');
  const k = code('Skjold79.kt');
  assert.match(k, /GPIO/);
  assert.match(k, /WS2812B/);
  assert.match(k, /felles jord/);
  assert.match(k, /nivåskifter/);
  assert.match(k, /LED Preferences/);
  assert.match(k, /feilen hos oss/);
  assert.match(k, /kalibreringen eller indeksen/);
});

test('UI-tekstene og tilgjengelighet', () => {
  const u = code('ui/Skjold79Ui.kt');
  assert.match(u, /💡 Vis alle med LED/);
  assert.match(u, /"Ta ut av lager"/);
  assert.match(u, /"Tøm"/);
  assert.match(u, /"Fjern"/);
  assert.match(u, /"Slå av"/);
  assert.match(u, /Lyste stripa rødt\?/);
  assert.match(u, /Lyste én LED blått\?/);
  assert.match(u, /"Ja" to|to "Ja"/);
  assert.match(u, /contentDescription = /);
  assert.match(u, /if \(on\) "✓" else "\+"/);
  assert.match(code('Skjold79.kt'), /"Plukkliste \(\$n\)"/);
});
