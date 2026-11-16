// iOS: valget mellom systemets fanelinje (Liquid Glass) og Papir-pillen (klassisk). Kildetester – ingen Swift-kompilator her;
// CI-jobben «Mobilapper» bygger appen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'apps', 'ios', 'FinansHub', 'Sources');
const raw = (f) => readFileSync(join(SRC, f), 'utf8');
// Uten kommentarer (// og /* */), så forklaringer ikke teller.
const code = (f) => raw(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');

test('innstillingen: to valg, systemets er standard, lagres per enhet og byttes straks', () => {
  assert.ok(existsSync(join(SRC, 'FanelinjeValg.swift')));
  const s = code('FanelinjeValg.swift');
  assert.match(s, /enum FanelinjeStil: String/);
  assert.match(s, /case system\b/);
  assert.match(s, /case papir\b/);
  assert.match(s, /"Systemets \(Liquid Glass\)"/);
  assert.match(s, /"Papir \(klassisk\)"/);
  // Ukjent eller manglende verdi gir systemets fanelinje.
  assert.match(s, /FanelinjeStil\(rawValue: raw\) \?\? \.system/);
  // Per enhet i UserDefaults (et visningsvalg, ingen hemmelighet), lest av en @Observable modell (bytter uten omstart).
  assert.match(s, /@Observable\s+final class FanelinjeValg/);
  assert.match(s, /UserDefaults\.standard\.set\(stil\.rawValue, forKey: FanelinjeValg\.nokkel\)/);
  assert.match(s, /static let nokkel: String = "fh_fanelinje_stil"/);
  // Bare i kompakt bredde.
  assert.match(s, /func klassisk\(regular: Bool\) -> Bool \{\s*!regular && stil == \.papir/);
  // Ingen token eller annen hemmelighet i nøkkelen.
  assert.doesNotMatch(s, /token|passord|secret/i);
});

test('innstillingen ligger i Innstillinger → Utseende (Tilpass) under FANELINJE', () => {
  const s = code('SettingsCustomize.swift');
  const i = s.indexOf('PLabel(text: "Fanelinje")');
  assert.ok(i > 0);
  assert.ok(s.indexOf('FanelinjeValgRad()', i) > i, 'valget står under FANELINJE');
  // «Utseende» i Innstillinger åpner Tilpass-siden.
  assert.match(code('PaperAppSettings.swift'), /PaperLinkRow\(name: "Utseende"[^\n]*innst-tilpass/);
  // Valgradene er knapper med «valgt» for VoiceOver og minst 44 pt høye.
  const v = code('FanelinjeValg.swift');
  assert.match(v, /accessibilityAddTraits\(on \? \[\.isButton, \.isSelected\] : \.isButton\)/);
  assert.match(v, /minHeight: 44/);
});

test('begge fanelinjene bruker samme fanekilde, samme valg og samme merker', () => {
  const shell = code('AppShell.swift');
  // Én liste: ShellTabs.all → compact i kompakt bredde, brukt av både TabView og Papir-pillen.
  assert.match(shell, /let tabs: \[ShellTab\] = regular \? all : ShellTabs\.compact\(all\)/);
  assert.match(shell, /PapirFanelinje\(tabs: tabs, current: cur\) \{ \(id: String\) in ShellTabs\.select\(id, store, current: cur\) \}/);
  assert.match(shell, /set: \{ \(v: String\) in ShellTabs\.select\(v, store, current: cur\) \}/);
  // Merkene: samme tall i systemets linje (iOS 17 og 18+, og sidekolonnen) og i pillen.
  assert.equal((shell.match(/\.badge\(t\.badge\)/g) ?? []).length, 3);
  const pill = code('PapirFanelinje.swift');
  assert.match(pill, /tab\.badge > 0/);
  // Pillen har ingen egen faneliste og ingen egen navigasjon.
  assert.doesNotMatch(pill, /mainTabItems|PaperTabItem\.all|ModulListe|paperMainTab|paperGo\(/);
  const tabs = code('ShellTabs.swift');
  assert.match(tabs, /badge: badge\(id, store\)/);
  assert.match(tabs, /more\.badge \+= hidden/);
});

test('Papir-pillen: systemets linje skjules, stakken per fane og tilbake beholdes, sidene får luft nederst', () => {
  const shell = code('AppShell.swift');
  assert.match(shell, /let klassisk: Bool = FanelinjeValg\.shared\.klassisk\(regular: regular\)/);
  assert.match(shell, /\.toolbar\(store\.shellTabBarShown && !klassisk \? \.visible : \.hidden, for: \.tabBar\)/);
  assert.match(shell, /\.environment\(\\\.shellKlassiskFanelinje, klassisk\)/);
  assert.match(shell, /\.safeAreaInset\(edge: \.bottom, spacing: 0\) \{\s*Color\.clear\.frame\(height: klassiskHoyde\)/);
  // Samme TabView og NavigationStack per fane i begge variantene (pillen ligger over, den erstatter ikke skallet).
  assert.match(shell, /NavigationStack\(path: path\)/);
  // Pillen vises bare der systemets linje ville vist seg.
  assert.match(shell, /let pill: Bool = klassisk && store\.shellTabBarShown/);
});

test('Papir-pillen: tokens, Dynamic Type, VoiceOver og 44 pt trykkflater', () => {
  const s = code('PapirFanelinje.swift');
  assert.doesNotMatch(s, /#[0-9a-fA-F]{6}\b|Color\(hex/);
  assert.doesNotMatch(s, /\.system\(size:/);
  assert.match(s, /\.font\(\.ds\(/);
  assert.match(s, /dynamicTypeSize/);
  assert.match(s, /\.frame\(minWidth: 44, minHeight: 46\)/);
  assert.match(s, /\.accessibilityLabel\(t\.title\)/);
  assert.match(s, /\.isSelected/);
  assert.match(s, /accessibilityShowsLargeContentViewer/);
  assert.match(s, /accessibilityAction\(named: Text\("Rediger fanelinjen"\)\)/);
  // Hold inne = «Rediger fanelinjen», og klikket etterpå navigerer ikke (Nav26).
  assert.match(s, /store\.tabBarEditing = true/);
  assert.match(s, /Nav26\.shared\.consumeHold\(\)/);
  // Papir-/Glass-utseendet og «Fanelinje-stil».
  assert.match(s, /\.glass50Bg\(p, p\.nav, Capsule\(\)\)/);
  assert.match(s, /store\.navStyle25/);
});
