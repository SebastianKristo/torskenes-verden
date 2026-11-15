// Fase 4 (bølge 1, iOS-fundamentet): kildetester som holder fast det skjermene i bølge 2 bygger på. Ingen Swift-kompilator her;
// CI-jobben «Mobilapper» bygger og kjører HomelabTests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const IOS = join(import.meta.dirname, '..', 'apps', 'ios');
const raw = (p) => readFileSync(join(IOS, p), 'utf8');
const swiftFiles = (dir = IOS) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n.endsWith('.xcassets') ? [] : swiftFiles(p);
  return n.endsWith('.swift') ? [p] : [];
});
// Uten kommentarer (// og /* */), så forklaringer ikke teller.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');

test('nettverk: én felles URLSession (HomelabHTTP.session), ingen URLSession.shared', () => {
  const bad = swiftFiles().filter((f) => /URLSession\.shared/.test(code(readFileSync(f, 'utf8')))).map((f) => relative(IOS, f));
  assert.deepEqual(bad, []);
  const client = raw('SharedNet/APIClient.swift');
  assert.match(client, /^actor APIClient \{/m);
  assert.match(client, /tokenExpiredNotification/);
  assert.match(client, /func compatibility\(base: String/);
  assert.match(raw('FinansHub/Sources/API.swift'), /typealias APIError = HomelabError/);
  assert.match(raw('SharedKal/Core/KalNet.swift'), /struct KalNetError: LocalizedError, HomelabFailure/);
});

test('nettverk: SharedNet er med i alle mål (også klokka og testene)', () => {
  const yml = raw('project.yml');
  const targets = ['FinansHub', 'FinansHubWidgets', 'Kalender', 'KalenderWidgets', 'KalenderMac', 'KalenderMacWidgets', 'FinansHubWatch51', 'HomelabTests'];
  for (const t of targets) {
    const start = yml.indexOf(`\n  ${t}:\n`);
    assert.ok(start > 0, t);
    const next = yml.slice(start + 3).search(/\n  [A-Za-z0-9]+:\n/);
    const block = yml.slice(start, next < 0 ? undefined : start + 3 + next);
    assert.match(block, /- SharedNet\n/, `${t} mangler SharedNet`);
  }
});

test('logikk: ingen egen trekkdato, påske, Time44-tolker eller Open-Meteo direkte', () => {
  const all = swiftFiles().map((f) => [relative(IOS, f), code(readFileSync(f, 'utf8'))]);
  assert.ok(!existsSync(join(IOS, 'FinansHub/Sources/Time44Parse.swift')));
  for (const [f, s] of all) {
    assert.doesNotMatch(s, /api\.open-meteo\.com/, f);
    assert.doesNotMatch(s, /static func easter\(/, f);
    assert.doesNotMatch(s, /static func nextCharge\(/, f);
  }
  assert.match(raw('FinansHub/Sources/QuickDates.swift'), /\/api\/dates\/parse/);
  assert.match(raw('SharedKal/Core/KalCals39.swift'), /\/api\/dates\/holidays\?year=/);
  assert.match(raw('FinansHub/Sources/Proveperioder.swift'), /dedupeKey/);
});

test('design: PF skalerer med Dynamic Type, paletten settes ikke under body, ingen tvunget mørk stil', () => {
  const pf = raw('FinansHub/Sources/Typography.swift');
  for (const fn of ['serif', 'italic', 'ui', 'mono']) assert.match(pf, new RegExp(`static func ${fn}\\(`), fn);
  assert.equal((code(pf).match(/\.custom\(/g) ?? []).length, (code(pf).match(/relativeTo: style\(size\)/g) ?? []).length);
  assert.doesNotMatch(code(raw('FinansHub/Sources/Shell.swift')), /let _ = PaperSkin\.use/);
  assert.match(raw('FinansHub/Sources/PaperTheme.swift'), /@Observable\s+final class PaperTheme/);
  assert.doesNotMatch(code(raw('project.yml').replace(/#.*$/gm, '')), /UIUserInterfaceStyle/);
  assert.doesNotMatch(code(raw('FinansHub/Sources/Paper.swift')), /static let (light|night) = PaperPalette\(dark:/);
});

test('design: evige animasjoner respekterer Reduser bevegelse (MotionTimeline)', () => {
  const bad = [];
  for (const f of swiftFiles()) {
    const s = code(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/TimelineView\(\.animation\(([^)]*)\)\)/g)) {
      if (/SharedUI\/MotionTimeline\.swift$/.test(f)) continue;
      if (!/paused:/.test(m[1]) && !/slow \?/.test(m[1])) bad.push(`${relative(IOS, f)}: ${m[0]}`);
    }
  }
  // Brief34Page er død (C-ios vedlegg B) og fjernes i bølge 2.
  assert.deepEqual(bad.filter((b) => !b.startsWith('FinansHub/Sources/Brief34Page.swift')), []);
});

test('navigasjon: TabView + NavigationStack per fane, ingen egen fanelinje eller eget kantsveip', () => {
  const shell = raw('FinansHub/Sources/AppShell.swift');
  assert.match(shell, /NavigationStack\(path: path\)/);
  assert.match(shell, /TabView\(selection: selection\)/);
  assert.match(shell, /NavigationSplitView \{/);
  assert.match(shell, /if #available\(iOS 18\.0, \*\)/);
  assert.match(shell, /\.tabViewStyle\(\.sidebarAdaptable\)/);
  assert.match(raw('FinansHub/Sources/ShellTabs.swift'), /static let compactMax: Int = 5/);
  const all = swiftFiles().map((f) => code(readFileSync(f, 'utf8'))).join('\n');
  assert.doesNotMatch(all, /struct PaperTabBar\b/);
  assert.doesNotMatch(all, /struct EdgeSwipeBack\b/);
  assert.doesNotMatch(all, /\.edgeSwipeBack\(/);
  assert.ok(!existsSync(join(IOS, 'FinansHub/Sources/Paper16.swift')));
  assert.ok(!existsSync(join(IOS, 'FinansHub/Sources/Nav23Swipe.swift')));
});

test('tester: HomelabTests-målet finnes og kjøres i CI', () => {
  const yml = raw('project.yml');
  assert.match(yml, /\n  HomelabTests:\n    type: bundle\.unit-test\n/);
  for (const f of ['ServerAddressTests.swift', 'DateVectorTests.swift', 'ContractDecodingTests.swift']) assert.ok(existsSync(join(IOS, 'HomelabTests', f)), f);
  const ci = readFileSync(join(IOS, '..', '..', '.github', 'workflows', 'mobile.yml'), 'utf8');
  assert.match(ci, /xcodebuild test -project FinansHub\.xcodeproj -scheme HomelabTests/);
});
