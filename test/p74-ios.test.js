// Prompt 74 (G74IOS): Glimt på Hjem – hold inne i søkefeltet/svarkortet gir tekstmarkering (ikke wiggle), og scroll
// lukker aldri Glimt-svaret. Ingen Swift-kompilator i sandkassen: kildesjekker av det som er lett å ødelegge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Klammene går opp (grov sjekk uten kompilator; strenger og tegn telles ikke). */
function balanced(src) {
  const s = src.replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  let n = 0;
  for (const c of s) {
    if (c === '{') n++;
    else if (c === '}') n--;
    if (n < 0) return false;
  }
  return n === 0;
}

test('wiggle: søkekortet (h1) har ingen hold-gest, de andre kortene har', () => {
  const w = code('WiggleList43.swift');
  assert.match(w, /static let noHold: Set<String> = \["h1"\]/);
  assert.match(w, /content\(k\)\.wiggle43Hold\(editing: !Wiggle43\.holds\(k\)\)/, 'listen hopper over h1');
  assert.doesNotMatch(w, /content\(k\)\.wiggle43Hold\(editing: false\)/, 'ingen ubetinget hold på cellene');
  const p = code('Paper15.swift');
  assert.match(p, /cardView\(k, vis, keys\)\.wiggle43Hold\(editing: !Wiggle43\.holds\(k\)\)/, 'bred skjerm hopper over h1');
  // Søkefeltet, svarkortet og opptakskortet ligger alle i h1 (HomeSearch29).
  assert.match(code('PaperPages.swift'), /PaperCardDef\(key: "h1", label: "Søk", view: AnyView\(HomeSearch29\(\)\)\)/);
  const hs = code('HomeSearch29.swift');
  assert.match(hs, /Assist31Bubble\(\)/);
  assert.match(hs, /recCard70/);
  // Ingen hold-gest i selve søkefeltet / svarkortet.
  for (const f of ['HomeSearch29.swift', 'Home70Assist.swift', 'Assist38.swift']) {
    assert.doesNotMatch(code(f), /LongPressGesture|onLongPressGesture/, f);
  }
});

test('svar- og opptakskortet: tekstmarkering', () => {
  const a = code('Assist31.swift');
  const bubble = a.slice(a.indexOf('struct Assist31Bubble'), a.indexOf('struct Assist31BubbleFoot'));
  assert.match(bubble, /Assist31BoldText\(text: a\.text, size: 17, [^\n]*\n\s*\.fixedSize\(horizontal: false, vertical: true\)\s*\.textSelection\(\.enabled\)/);
  const m = code('Home70Mic.swift');
  const rec = m.slice(m.indexOf('struct Home70RecText'));
  assert.match(rec, /\.textSelection\(\.enabled\)/);
});

test('trykk utenfor: bare et ekte trykk (Touch74), aldri etter scroll', () => {
  const h = code('Home70Assist.swift');
  // Stedet kommer fortsatt fra SpatialTapGesture, men avgjøres etter hele berøringen.
  assert.match(h, /\.simultaneousGesture\(\s*SpatialTapGesture/);
  assert.match(h, /func tapped\(_ pt: CGPoint\) \{\s*Task \{ @MainActor in Assist70\.shared\.decide\(pt\) \}\s*\}/);
  const decide = h.slice(h.indexOf('private func decide'), h.indexOf('func answered'));
  assert.match(decide, /guard Touch74\.shared\.cleanTap\(\) else \{ return \}/);
  assert.match(decide, /guard a\.homeAnswer != nil, !a\.homeBusy else \{ return \}/, 'svaret er ferdig');
  assert.match(decide, /searchRect\.insetBy\(dx: -4, dy: -4\)\.contains\(pt\)/, 'ikke i søkefeltet');
  assert.match(decide, /Assist38\.shared\.rect\.contains\(pt\)/, 'ikke i kortet');
  // Scroll måles: søkefeltet flytter seg loddrett.
  assert.match(h, /func track\(_ r: CGRect\)/);
  assert.match(h, /\.onChange\(of: g\.frame\(in: \.global\)\) \{ \(_: CGRect, r: CGRect\) in Assist70\.shared\.track\(r\) \}/);
  // Regelen for et ekte trykk.
  assert.match(h, /static let slop: CGFloat = 10/);
  assert.match(h, /static let maxTime: TimeInterval = 0\.5/);
  assert.match(h, /clean = !far && !scrolled && !kb && still && t - t0 < Touch74\.maxTime/);
  assert.match(h, /let still: Bool = abs\(Assist70\.shared\.searchRect\.minY - y0\) < 1/, 'scrollposisjonen er lik ved ned og opp');
  assert.match(h, /scrolled = ProcessInfo\.processInfo\.systemUptime - a\.movedAt < 0\.12/, 'trykk som stopper en scroll');
  assert.match(h, /kb = Kb32b\.shared\.frame\.height > 0/, 'tastaturet oppe: trykket lukker bare tastaturet');
  // Observatøren tar aldri berøringen.
  const r = h.slice(h.indexOf('final class Touch74Recognizer'), h.indexOf('struct Touch74Host'));
  assert.match(r, /cancelsTouchesInView = false/);
  assert.match(r, /delaysTouchesBegan = false/);
  assert.match(r, /delaysTouchesEnded = false/);
  assert.doesNotMatch(r, /state = \.(recognized|ended|began)/, 'blir aldri gjenkjent');
  assert.equal((r.match(/state = \.failed/g) || []).length, 2);
  assert.match(read('Home70Assist.swift'), /^import UIKit\.UIGestureRecognizerSubclass$/m);
  assert.match(h, /\.background\(Touch74Host\(\)\.allowsHitTesting\(false\)\)/);
  assert.match(h, /g is Touch74Recognizer/, 'én observatør per vindu');
  // Ingen TapGesture/DragGesture på hele Hjem.
  assert.doesNotMatch(h, /simultaneousGesture\(\s*TapGesture|DragGesture\(/);
});

test('sveip opp lukker bare fra grepet, over 60 pt og raskt', () => {
  const a = code('Assist38.swift');
  assert.match(a, /nonisolated static func swipeCloses\(_ t: CGFloat, _ predicted: CGFloat\) -> Bool \{\s*t < -60 && predicted - t < -40\s*\}/);
  assert.match(a, /if Assist38\.swipeCloses\(v\.translation\.height, v\.predictedEndTranslation\.height\)/);
  assert.doesNotMatch(a, /translation\.height < -40/);
  const swipe = a.slice(a.indexOf('struct Assist38Swipe'));
  assert.equal((swipe.match(/DragGesture\(/g) || []).length, 1, 'én drag-gest, på grepet');
});

test('tastatur og fokus lukker ikke Glimt', () => {
  const all = ['HomeSearch29.swift', 'Home70Assist.swift', 'Assist38.swift', 'Assist31.swift'].map(code).join('\n');
  assert.doesNotMatch(all, /keyboardWill[A-Za-z]*Notification[\s\S]{0,200}closeHome/);
  assert.doesNotMatch(code('HomeSearch29.swift'), /onChange\(of: focused\)[^\n]*closeHome/);
});

test('klammene går opp i de endrede filene', () => {
  for (const f of ['Home70Assist.swift', 'Assist38.swift', 'WiggleList43.swift', 'Paper15.swift', 'Assist31.swift', 'Home70Mic.swift']) {
    assert.ok(balanced(code(f)), f);
  }
});
