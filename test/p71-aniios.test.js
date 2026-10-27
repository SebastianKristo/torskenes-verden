// Prompt 71 (ANIIOS71): jevne animasjoner i iOS-appene (claude-code-animasjoner-jevne.md).
// Ingen Swift-kompilator i sandkassen: kildesjekker av filene som er endret – ingen Timer driver animasjoner, evige
// animasjoner er avgrenset til én egenskap eller går på TimelineView, og 120 Hz-nøkkelen er satt for FinansHub og Kalender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS = join(ROOT, 'apps/ios');
const read = (f) => readFileSync(join(IOS, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const FH = 'FinansHub/Sources/';
const TOUCHED = [
  FH + 'Anim71.swift',
  FH + 'Fin43.swift',
  FH + 'Glimt31.swift',
  FH + 'Home70Mic.swift',
  FH + 'WiggleList43.swift',
  FH + 'Wiggle30.swift',
  FH + 'Vaer41.swift',
  FH + 'Departures16.swift',
  FH + 'Convo67.swift',
  FH + 'Media44Banner.swift',
  FH + 'Family50Views.swift',
  FH + 'HomeSearch29.swift',
  FH + 'Home70Assist.swift',
  'Kalender/Sources/KalSpark.swift',
];

test('ingen Timer.publish / Timer.scheduledTimer / sleep-løkker driver animasjoner i filene som er endret', () => {
  for (const f of TOUCHED) {
    const c = code(f);
    assert.doesNotMatch(c, /Timer\.publish/, f);
    assert.doesNotMatch(c, /Timer\.scheduledTimer/, f);
  }
  // Bølgeformen: ingen egen sleep-løkke som endrer @State; TimelineView + Canvas i en liten visning.
  const m = code(FH + 'Home70Mic.swift');
  assert.doesNotMatch(m, /Task\.sleep/);
  assert.doesNotMatch(m, /@State private var samples/);
  assert.match(m, /TimelineView\(\.animation\(minimumInterval: slow \? Home70WaveBuf\.every : nil\)\)/);
  assert.match(m, /struct Home70WaveFrame: View/);
  assert.match(m, /Canvas \{[\s\S]*?\}\s*\.frame\(height: 24\)[\s\S]*?\.drawingGroup\(\)/, 'drawingGroup på bølgen');
  assert.match(m, /\.pulse71\(from: 1, to: 0\.1, half: 0\.5\)/, 'markøren blinker i egen liten tilstand');
});

test('evig repeatForever er alltid avgrenset til én egenskap (ikke .animation(…, value:) / withAnimation)', () => {
  for (const f of TOUCHED) {
    const c = code(f);
    assert.doesNotMatch(c, /repeatForever[^\n]*value:/, f + ': repeatForever med value: lekker inn i layout');
    assert.doesNotMatch(c, /withAnimation\([^\n]*repeatForever/, f + ': withAnimation(repeatForever) lekker inn i layout');
  }
  const a = code(FH + 'Anim71.swift');
  assert.match(a, /content\.animation\(anim\) \{ \$0\.rotationEffect\(\.degrees\(deg\)\) \}/);
  assert.match(a, /\.animation\(anim\) \{ \$0\.opacity\(o\) \}/);
  assert.match(a, /static let sheet: Animation = \.spring\(response: 0\.35, dampingFraction: 0\.85\)/);
});

test('orb: TimelineView(.animation) i full takt, ferdig ringlag med drawingGroup, Reduser bevegelse', () => {
  const o = code(FH + 'Fin43.swift');
  assert.match(o, /TimelineView\(\.animation\(minimumInterval: nil, paused: reduceMotion\)\)/);
  assert.match(o, /struct Orb43Ring: View[\s\S]*?\.drawingGroup\(\)/);
  assert.doesNotMatch(o, /@State private var spin/);
  const g = code(FH + 'Glimt31.swift');
  assert.match(g, /struct Glimt31Ring: View[\s\S]*?\.drawingGroup\(\)/);
  assert.doesNotMatch(g, /minimumInterval: 1\.0 \/ 30\.0/, 'ikke låst til 30 bilder/s');
  const k = code('Kalender/Sources/KalSpark.swift');
  assert.doesNotMatch(k, /minimumInterval: 1\.0 \/ 30\.0/);
  assert.match(k, /struct KalOrbGlow: View[\s\S]*?\.blur\(radius: r\)\s*\.drawingGroup\(\)/, 'gløden er et ferdig lag');
  assert.match(k, /struct KalSparkRing: View[\s\S]*?\.drawingGroup\(\)/);
  // Skimmer: masken flyttes med offset, teksten tegnes ikke med ny gradient per bilde.
  assert.match(k, /\.mask \{ KalShimmerBand\(reduce: reduce\) \}/);
  assert.match(k, /\.offset\(x: \(KalShimmerBand\.pos\(/);
  assert.doesNotMatch(k, /startPoint: UnitPoint\(x: p - 1/);
  // Ingen animert blur-radius i filene som er endret.
  for (const f of TOUCHED) {
    assert.doesNotMatch(code(f), /\.blur\(radius:[^)\n]*(?:phase|wave|ctx\.date|timeInterval)/, f);
  }
  assert.match(code(FH + 'Media44Banner.swift'), /\.animation\(nil\) \{ \$0\.blur\(radius:/);
});

test('wiggle: fast fase per flis (nøkkelen), stabile id-er, bare rotasjonen animeres', () => {
  const w = code(FH + 'WiggleList43.swift');
  assert.match(w, /Edit28\.angle \* Anim71\.sign\(k\)/);
  assert.doesNotMatch(w, /Wiggle43\.sign\(i\)/);
  assert.match(w, /\.wiggle71\(editing, up: wig, angle: a, half: Edit28\.half\)/);
  assert.match(w, /ForEach\(Array\(o\.enumerated\(\)\), id: \\\.element\)/);
  assert.match(w, /\.id\("card37-" \+ k\)/);
  assert.doesNotMatch(w, /\.id\((?:UUID|Date)\(/);
  assert.match(code(FH + 'Wiggle30.swift'), /\.wiggle71\(on, up: phase/);
  assert.match(code(FH + 'Vaer41.swift'), /\.wiggle71\(v\.editing, up: on/);
});

test('ark og fade: designets fjær, Reduser bevegelse gir fade', () => {
  assert.match(code(FH + 'Family50Views.swift'), /withAnimation\(Anim71\.sheet\)/);
  assert.match(code(FH + 'HomeSearch29.swift'), /reduce71 \? AnyTransition\.opacity :/);
  assert.match(code(FH + 'Home70Assist.swift'), /reduce \? AnyTransition\.opacity :/);
});

test('120 Hz: CADisableMinimumFrameDurationOnPhone i Info.plist for FinansHub og Kalender', () => {
  const y = read('project.yml');
  for (const plist of ['FinansHub/Info.plist', 'Kalender/Info.plist']) {
    const i = y.indexOf('path: ' + plist);
    assert.ok(i > 0, plist);
    // Nøkkelen står i properties-blokka til denne Info.plist (før neste mål).
    const next = y.slice(i).search(/\n {2}[A-Za-z]+:\n/);
    const own = y.slice(i, next > 0 ? i + next : y.length);
    assert.match(own, /CADisableMinimumFrameDurationOnPhone: true/, plist);
  }
});

test('Anim71.sign gir fast fortegn per nøkkel (samme regel som i Swift)', () => {
  const sign = (k) => { let n = 0; for (const ch of k) n += ch.codePointAt(0); return n % 2 === 0 ? 1 : -1; };
  assert.equal(sign('h17'), sign('h17'));
  // Naboflisene på Hjem vugger ikke alle samme vei.
  const s = ['h17', 'h18', 'h19', 'h20', 'h21'].map(sign);
  assert.ok(s.includes(1) && s.includes(-1));
});

test('kommentarer er balanserte i de nye/endrede Swift-filene', () => {
  for (const f of TOUCHED) {
    const t = read(f);
    assert.equal((t.match(/\/\*/g) || []).length, (t.match(/\*\//g) || []).length, f);
  }
});
