// Prompt 57 (iOS): Apple Helse til Helse-siden. Kildetester uten Xcode; CI-jobben «Mobilapper» bygger appen.
// Appen leser søvn, treningsøkter, distanse og vekt, sender rådata til POST /api/helse og viser det serveren regner ut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS = join(ROOT, 'apps', 'ios');
const SRC = join(IOS, 'FinansHub', 'Sources');
const read = (...p) => readFileSync(join(...p), 'utf8');
const code = (...p) => read(...p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:"])\/\/.*$/, '$1')).join('\n');

test('appen ber om lesetilgang til søvn, treningsøkter, distanse og vekt', () => {
  const d = code(SRC, 'HelseData.swift');
  for (const t of ['.sleepAnalysis', 'HKObjectType.workoutType()', '.distanceWalkingRunning', '.bodyMass']) assert.ok(d.includes(t), t);
  const s = code(SRC, 'HealthSync.swift');
  assert.match(s, /var out = HelseData\.readTypes\(\)/, 'alle typene er med i iOS-dialogen');
  assert.match(s, /let types = master \? allReadTypes\(\) : readTypes\(\)/);
  assert.match(s, /requestAuthorization\(toShare: \[\], read:/, 'appen skriver aldri til Apple Helse');
});

test('bakgrunnslevering også for søvn, økter, vekt og distanse', () => {
  const h = code(SRC, 'HealthSettings.swift');
  assert.match(h, /types\.append\(contentsOf: HelseData\.observedTypes\(\)\)/);
  assert.match(h, /enableBackgroundDelivery\(for: type, frequency: \.hourly\)/);
  const d = code(SRC, 'HelseData.swift');
  assert.match(d, /static func observedTypes\(\) -> \[HKSampleType\]/);
});

test('rådata sendes til POST /api/helse; serveren regner (ingen netter, snitt eller trender i appen)', () => {
  const s = code(SRC, 'HealthSync.swift');
  assert.match(s, /callAt\("\/api", "POST", "\/helse", json: body/);
  assert.match(s, /HelseData\.body\(days: full \? 3 : 30/);
  assert.match(s, /callAt\("\/api", "DELETE", "\/helse"/, 'hovedbryteren av sletter Helse-siden');
  const d = code(SRC, 'HelseData.swift');
  for (const k of ['"sleep"', '"workouts"', '"weight"', '"days"', '"stage"', '"distanceM"']) assert.ok(d.includes(k), k);
  for (const st of ['"inBed"', '"asleep"', '"awake"', '"core"', '"deep"', '"rem"']) assert.ok(d.includes(st), st);
  assert.doesNotMatch(d, /UserDefaults/, 'helsetall lagres ikke på enheten');
  assert.doesNotMatch(d, /print\(|NSLog|Logger\(/, 'helsedata logges ikke');
  const side = code(SRC, 'HelseSide.swift');
  assert.match(side, /callAt\("\/api", "GET", "\/helse\?periode=" \+ p/);
  assert.doesNotMatch(side, /Calendar\.|DateFormatter|\.reduce\(0\) \{ \$0 \+ \$1\.value/, 'siden viser serverens tekster og regner ikke datoer');
});

test('deling: Trening og Vekt er egne kategorier, av som standard', () => {
  const s = code(SRC, 'HealthSync.swift');
  assert.match(s, /\("workouts", "Trening", "figure\.run"\)/);
  assert.match(s, /\("weight", "Vekt", "scalemass"\)/);
  assert.match(s, /"workouts": false, "weight": false/);
  const h = code(SRC, 'HealthSettings.swift');
  assert.match(h, /keys: \["workouts"\]/);
  assert.match(h, /keys: \["weight"\]/);
});

test('Helse-siden finnes i appen: modullisten, Mer, fanelinja og fullskjerm-verten', () => {
  assert.match(code(SRC, 'ModulSider.swift'), /"helse": "helse"/);
  assert.match(code(SRC, 'ShellTabs.swift'), /case "helse": HelseModell\.shared\.show\(\)/);
  assert.match(code(SRC, 'MoreRows.swift'), /More28Row\(id: "helse"/);
  assert.match(code(SRC, 'Paper.swift'), /\.helseHost\(p\)/);
});

test('tillatelsestekstene stemmer med det appen leser', () => {
  const y = read(IOS, 'project.yml');
  const m = y.match(/NSHealthShareUsageDescription: "([^"]+)"/g);
  assert.ok(m && m.length >= 2);
  for (const line of m) for (const w of ['skritt', 'søvn', 'trening', 'vekt', 'Helse-siden']) assert.ok(line.toLowerCase().includes(w.toLowerCase()), `${w} mangler i ${line}`);
});
