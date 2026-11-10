// Prompt 80 (IOS80): Vær – Temperatur / Nedbør / Vind-bryteren på iOS (pakke 56, ios.md).
// Ingen Swift-kompilator i sandkassen: kildesjekker av gesten, treffflatene, målene og lagringen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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

const seg = code('WxSeg46.swift');

test('filene går opp', () => {
  for (const f of ['WxSeg46.swift', 'Weather22Cards.swift', 'PaperWeather.swift']) assert.ok(balanced(code(f)), f);
});

test('1–2) én DragGesture(minimumDistance: 0) som highPriorityGesture, ingen ScrollView/onTapGesture/SpatialTap', () => {
  assert.match(seg, /DragGesture\(minimumDistance: 0/);
  assert.match(seg, /\.highPriorityGesture\(drag\)/);
  assert.match(seg, /\.contentShape\(Capsule\(\)\)/);
  assert.doesNotMatch(seg, /ScrollView/);
  assert.doesNotMatch(seg, /onTapGesture/);
  assert.doesNotMatch(seg, /SpatialTapGesture/);
  assert.doesNotMatch(seg, /simultaneousGesture/);
  assert.match(seg, /tapSlop: CGFloat = 5/);
  assert.equal((seg.match(/DragGesture\(/g) || []).length, 1);
});

test('3) pille, glans og ikoner slipper treff', () => {
  const n = (seg.match(/\.allowsHitTesting\(false\)/g) || []).length;
  assert.ok(n >= 4, String(n));
});

test('mål: 44 × 30, 2 pt mellom, 3 pt padding, x = 3 + i × 46, spor .18, gradient .34 → .16', () => {
  assert.match(seg, /segW: CGFloat = 44/);
  assert.match(seg, /segH: CGFloat = 30/);
  assert.match(seg, /gap: CGFloat = 2/);
  assert.match(seg, /pad: CGFloat = 3/);
  assert.match(seg, /step: CGFloat = 46/);
  assert.match(seg, /pad \+ CGFloat\(i\) \* step/);
  assert.match(seg, /Color\.black\.opacity\(0\.18\)/);
  assert.match(seg, /Color\.white\.opacity\(0\.34\), Color\.white\.opacity\(0\.16\)/);
  assert.match(seg, /ultraThinMaterial/);
  // x-formelen gir 3, 49, 95 for tre ikoner (ikonene ligger i HStack(spacing: 2) med padding 3).
  assert.deepEqual([0, 1, 2].map((i) => 3 + i * 46), [3, 49, 95]);
  assert.match(seg, /HStack\(spacing: Self\.gap\)/);
});

test('5) treffområdet er minst 44 × 44', () => {
  assert.match(seg, /\.frame\(width: Swift\.max\(44, trackW\), height: 44\)/);
});

test('animasjon: 0,42 s fjærkurve, strekk maks 1,18 / 0,9, sprett 1,12, lett haptikk, reduser bevegelse', () => {
  assert.match(seg, /\.timingCurve\(0\.34, 1\.32, 0\.5, 1, duration: 0\.42\)/);
  assert.match(seg, /Swift\.min\(0\.18,/);
  assert.match(seg, /1 - Swift\.min\(0\.10,/);
  assert.match(seg, /pop = 1\.12/);
  assert.match(seg, /UIImpactFeedbackGenerator\(style: \.light\)\.impactOccurred\(\)/);
  assert.match(seg, /accessibilityReduceMotion/);
  // Slipp: smetter på nærmeste; trykk: ikonet under x.
  assert.match(seg, /select\(nearest\(px\)\)/);
  assert.match(seg, /select\(hit\(v\.location\.x\)\)/);
});

test('trykk-/dra-logikken: x → ikon og nærmeste ikon (JS-speil av formlene)', () => {
  const hit = (x) => Math.min(2, Math.max(0, Math.floor((x - 3 + 1) / 46)));
  const nearest = (px) => Math.min(2, Math.max(0, Math.round((px - 3) / 46)));
  assert.deepEqual([10, 25, 47, 60, 90, 120, 139].map(hit), [0, 0, 0, 1, 1, 2, 2]);
  assert.deepEqual([3, 25, 27, 49, 70, 95].map(nearest), [0, 0, 1, 1, 1, 2]);
  assert.match(seg, /floor\(\(x - Self\.pad \+ Self\.gap \/ 2\) \/ Self\.step\)/);
  assert.match(seg, /\(\(px - Self\.pad\) \/ Self\.step\)\.rounded\(\)/);
});

test('4) «Forhold ›» har egen trykkflate til venstre, bryteren ligger utenfor knappen', () => {
  const c = code('Weather22Cards.swift');
  const card = c.slice(c.indexOf('struct WxHourCard22'), c.indexOf('struct WxHourCell22'));
  const btn = card.indexOf('Button(action: openToday)');
  const shape = card.indexOf('.contentShape(Rectangle())', btn);
  const plain = card.indexOf('.buttonStyle(.plain)', btn);
  const segAt = card.indexOf('WxSeg46(mode: $mode');
  assert.ok(btn > 0 && shape > btn && plain > shape && segAt > plain);
  assert.doesNotMatch(card.slice(segAt, segAt + 120), /onTapGesture|openToday/);
});

test('6) modus i én @AppStorage("vaer_mode") som bryter og timerader leser', () => {
  const p = code('PaperWeather.swift');
  assert.match(p, /@AppStorage\("vaer_mode"\) private var mode: String = "temp"/);
  assert.doesNotMatch(p, /@State private var mode: String = "temp"/);
  assert.match(p, /WxHourCard22\(w: w, mode: \$mode\)/);
  assert.match(p, /WxWide25\(w: w, width: g\.size\.width, mode: \$mode/);
  const c = code('Weather22Cards.swift');
  assert.match(c, /@Binding var mode: String/);
  assert.match(c, /WxSeg46\(mode: \$mode, items: WxHourCard22\.modes46\)/);
});

test('bygger med Xcode 16: ingen iOS 26-API', () => {
  assert.doesNotMatch(seg, /glassEffect|GlassEffectContainer|@available\(iOS 26/);
});
