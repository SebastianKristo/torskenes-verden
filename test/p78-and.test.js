// Prompt 78 (LEDAND): LED over hver skuff i Skjold Lab på Android – kildesjekker og de rene reglene oversatt til JS.
// Kotlin typesjekkes utenfor npm test (stubber, $S/kt/b78.sh): 0 nye feil mot grunnlinjen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
/** Kode uten kommentarer. */
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Speiler ledIndex78 / defaultRows78 / perRow78 / hostLocal78 / untilAt78 / normColor78 / litText78 / statusText78 i Skjold78.kt.
const ledIndex = (l, row, col) => {
  const o = l.overrides?.[`${row}-${col}`];
  if (o != null) return o;
  const r = l.rows.find((x) => x.row === row);
  if (!r || r.count <= 0) return null;
  const dp = l.drawerPitchMm > 0 ? l.drawerPitchMm : 60;
  const x = (l.firstDrawerXmm ?? 30) + (col - 1) * dp;
  const pitch = r.pitchMm > 0 ? r.pitchMm : (l.ledPitchMm > 0 ? l.ledPitchMm : 16.667);
  const k = Math.min(r.count - 1, Math.max(0, Math.round((x - r.offsetMm) / pitch + 1e-9)));
  return r.start + (r.reverse ? r.count - 1 - k : k);
};
const perRow = (cols, dp, pitch = 16.667) => Math.max(1, Math.round((cols * dp) / pitch));
const defaultRows = (rows, per, serp, pitch = 16.667, off = Math.round((pitch / 2) * 1000) / 1000, start0 = 0) =>
  Array.from({ length: rows }, (_, i) => ({ row: i + 1, start: start0 + i * per, count: per, reverse: serp && (i + 1) % 2 === 0, pitchMm: pitch, offsetMm: off }));
const hostLocal = (h) => {
  const t = h.trim().toLowerCase().replace(/^http:\/\//, '').split('/')[0].split(':')[0];
  if (!t) return false;
  const ip = t.split('.').map((x) => (/^\d+$/.test(x) ? Number(x) : null));
  if (ip.length === 4 && ip.every((x) => x != null && x <= 255)) return ip[0] === 10 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(t)) return false;
  return !t.includes('.') || t.endsWith('.local') || t.endsWith('.lan');
};
const untilAt = (u, now) => (u <= 0 ? 0 : u > 1e12 ? u : now + u);
const normColor = (s) => { const t = s?.trim().replace(/^#/, '').toUpperCase(); return t && /^[0-9A-F]{6}$/.test(t) ? `#${t}` : null; };

test('filene finnes og er koblet inn i Skjold Lab', () => {
  assert.ok(existsSync(join(SRC, 'Skjold78.kt')));
  assert.ok(existsSync(join(SRC, 'ui/Skjold78Ui.kt')));
  const ui = code('ui/Skjold76Ui.kt');
  assert.match(ui, /"leds" -> LedScreen78\(vm\)/, 'LED-oppsett som egen skjerm');
  assert.match(ui, /"leds" -> "LED-oppsett"/);
  assert.match(ui, /LocateButton78\(vm, pt\)/, '💡 Vis i skapet på detaljsiden');
  assert.match(ui, /RowLed78\(vm, pt\)/, '💡 i trefflista');
  assert.match(ui, /HitsLed78\(vm\)/, 'vis treffene i skapet');
  assert.match(ui, /LitBar78\(vm, Modifier\.align\(Alignment\.BottomCenter\)\)/, 'nedtelling + Slå av');
  assert.match(ui, /LedPill78\(vm, cab\)/, 'LED med statusprikk på skapsiden');
  assert.match(ui, /DrawerLed78\(vm, cab, r, c\)/);
  assert.match(ui, /vm\.openLeds78\(cab\.id\)/, 'LED-oppsett fra skap-oppsettet');
  assert.match(code('ui/Skjold77Ui.kt'), /LedSettings78\(vm\)/, 'innstillingene i ⚙-arket');
  const m = code('Skjold76.kt');
  assert.match(m, /Skjold78\.reset\(\)/);
  assert.match(m, /Skjold78\.calOn -> stopCal78\(\)/, 'tilbake avslutter kalibreringen');
  assert.match(m, /loadAllLeds78\(\)/);
  assert.match(m, /partOpened78\(id\)/, 'auto-lys når et treff åpnes');
});

test('API-kallene følger CONTRACT78 / LEDSRV', () => {
  const k = code('Skjold78.kt');
  assert.match(k, /get78\("\/cabinets\/\$\{enc78\(cabId\)\}\/leds"\)/);
  assert.match(k, /put78\("\/cabinets\/\$\{enc78\(d\.cabId\)\}\/leds", ledsJson78\(l\)\)/);
  assert.match(k, /"\/cabinets\/\$\{enc78\(cabId\)\}\/leds\/test", body/);
  assert.match(k, /JSONObject\(\)\.put\("mode", mode\)/);
  assert.match(k, /\/leds\/calibrate", JSONObject\(\)\.put\("index", idx\)/);
  assert.match(k, /\/leds\/override", JSONObject\(\)\.put\("row", row\)\.put\("col", col\)\.put\("index", idx\)/);
  assert.match(k, /post78\("\/locate", JSONObject\(\)\.put\("partId"/);
  assert.match(k, /put\("partIds", JSONArray\(\)/);
  assert.match(k, /\.take\(10\)/, 'maks 10 samtidig');
  assert.match(k, /put\("cabinetId", idJson78\(cabId\)\)\.put\("row", row\)\.put\("col", col\)/);
  assert.match(k, /post78\("\/locate\/off"\)/);
  assert.match(k, /get78\("\/leds\/status\?cabinet=" \+ enc78\(cabId\)\)/);
  assert.match(k, /get78\("\/leds\/settings"\)/);
  assert.match(k, /put78\("\/leds\/settings", JSONObject\(\)\.put\("autoLocateOpen", s\.autoOpen\)\.put\("autoLocateGlimt", s\.autoGlimt\)\)/);
  assert.match(k, /status == 404/, 'lokal lagring av innstillingene som reserve');
  assert.match(k, /status == 429/, 'rate limit gir en forståelig melding');
  assert.doesNotMatch(k, /json\/state|json\/info/, 'appen snakker aldri med WLED direkte');
  assert.doesNotMatch(k, /put\("drawerPitchMm", l\.drawerPitchMm \?: JSONObject\.NULL/, 'null for geometri gir 400 på serveren');
});

test('indeksen: pitch, offset, retning, serpentine og overstyring (som serveren)', () => {
  // Raaco: 5 skuffer à 60 mm, første midt på 30 mm, 60 LED/m → 18 per rad, offset = pitch/2.
  const per = perRow(5, 60);
  assert.equal(per, 18);
  const rows = defaultRows(12, per, true);
  const l = { rows, overrides: {}, drawerPitchMm: 60, firstDrawerXmm: 30, ledPitchMm: 16.667 };
  assert.equal(ledIndex(l, 1, 1), 1); // (30 − 8,33)/16,667 = 1,3 → 1
  assert.equal(ledIndex(l, 1, 3), 8); // (150 − 8,33) / 16,667 = 8,4998 → 8
  // rad 2 er baklengs: start 18, count 18
  assert.equal(rows[1].reverse, true);
  assert.equal(ledIndex(l, 2, 1), 18 + 17 - 1);
  assert.equal(ledIndex({ ...l, overrides: { '2-1': 99 } }, 2, 1), 99);
  assert.equal(ledIndex({ ...l, rows: [] }, 1, 1), null);
  // Samme retning: rad 2 fremover.
  const same = { ...l, rows: defaultRows(12, per, false) };
  assert.equal(ledIndex(same, 2, 1), 18 + 1);
  // Klemmes til raden.
  assert.equal(ledIndex({ ...l, rows: [{ row: 1, start: 5, count: 3, reverse: false, pitchMm: 16.667, offsetMm: 0 }] }, 1, 5), 7);
});

test('indeksen stemmer med serverens autoIndex78 når den finnes', async () => {
  let srv;
  try { srv = readFileSync(join(ROOT, 'server/skjold76/leds78.js'), 'utf8'); } catch { return; }
  assert.match(srv, /firstDrawerXmm \+ \(col - 1\) \* cfg\.drawerPitchMm/, 'samme midtpunkt-regel');
  assert.match(srv, /offsetMm: Math\.round\(\(cfg\.ledPitchMm \/ 2\) \* 1000\) \/ 1000/, 'samme standard-offset');
});

test('verter i hjemmenettet, untilMs, farge', () => {
  for (const h of ['192.168.1.50', '10.0.0.7', '172.16.4.2', '172.31.255.1', 'wled-skap.local', 'wled.lan', 'wled', 'http://192.168.1.50/']) assert.ok(hostLocal(h), h);
  for (const h of ['8.8.8.8', '172.32.0.1', 'example.com', 'wled.local.evil.com', '', 'a b']) assert.ok(!hostLocal(h), h);
  assert.equal(untilAt(30000, 1000), 31000);
  assert.equal(untilAt(1_800_000_000_000, 1000), 1_800_000_000_000);
  assert.equal(untilAt(0, 1000), 0);
  assert.equal(normColor('2f6bff'), '#2F6BFF');
  assert.equal(normColor('#zzz'), null);
});

test('UI-tekstene og tilgjengelighet', () => {
  const u = code('ui/Skjold78Ui.kt');
  assert.match(u, /"💡 Vis i skapet"/);
  assert.match(u, /Lys opp automatisk når jeg åpner et treff/);
  assert.match(u, /Trykk på skuffen som lyser/);
  assert.match(u, /"‹ Forrige"/);
  assert.match(u, /"Neste ›"/);
  assert.match(u, /"Slå av"/);
  assert.match(u, /Fyll ut: serpentine/);
  assert.match(u, /"Test alle"/);
  assert.match(u, /vm\.calPick78\(r, c\)/);
  assert.match(u, /contentDescription = /);
  const k = code('Skjold78.kt');
  assert.match(k, /"WLED svarer"/);
  assert.match(k, /"WLED svarer ikke"/);
  assert.match(k, /Lyser i skapet/);
});
