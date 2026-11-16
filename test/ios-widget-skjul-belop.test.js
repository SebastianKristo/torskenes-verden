// iOS-widgetene følger «Skjul beløp»: appens personvernvalg sendes som ?hideAmounts=1 til widgetendepunktene, serverens
// hideAmounts (valget i /api/me/notify) leses fra svaret, og tallfeltene vises som «•••». Kildetester – CI bygger appen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IOS = join(import.meta.dirname, '..', 'apps', 'ios');
const raw = (p) => readFileSync(join(IOS, p), 'utf8');
const code = (p) => raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');

test('appens valg speiles til App Group og widgetene ber serveren skjule beløpene', () => {
  const ws = code('Shared/WidgetShared.swift');
  assert.match(ws, /forKey: "w\.hideAmounts"/);
  assert.match(ws, /static var skjulBelop: Bool \{ hideAmounts \|\| hideAmountsServer \}/);
  assert.match(ws, /"hideAmounts=1"/);
  assert.match(ws, /o\["hideAmounts"\] as\? Bool/);
  // Store: endring av «Skjul beløp» oppdaterer widgetene; syncWidgets skriver valget.
  assert.match(code('FinansHub/Sources/Store.swift'), /forKey: "fh_hide_amounts"\); Privacy\.shared\.hidden = hideAmounts; syncWidgets\(\)/);
  assert.match(code('FinansHub/Sources/AppWidgets.swift'), /WidgetShared\.hideAmounts = skjul/);
  // De tre endepunktene får valget.
  assert.match(code('FinansHubWidgets/Sources/WidgetData.swift'), /WidgetShared\.medBelopsvalg\("\/api\/mobile\/widgets"\)/);
  assert.match(code('FinansHubWidgets/Sources/WidgetData.swift'), /WidgetShared\.lesBelopsvalg\(data\)/);
  assert.match(code('FinansHubWidgets/Sources/TrialsWidget.swift'), /WidgetShared\.medBelopsvalg\("\/api\/widgets\/trials"\)/);
  assert.match(code('FinansHubWidgets/Sources/BriefWidget.swift'), /WidgetShared\.medBelopsvalg\("\/api\/brief\/widget\?size=medium"\)/);
  assert.match(code('FinansHubWidgets/Sources/BriefWidget.swift'), /if !WidgetShared\.skjulBelop, let d = await Trials32b\.request\("\/api\/brief\?kind="/);
});

test('tallfeltene i widgetene viser «•••» når beløpene er skjult', () => {
  const w = code('FinansHubWidgets/Sources/Widgets.swift');
  assert.match(w, /private func kr\(_ v: Double\?\) -> String \{\s*if WidgetShared\.skjulBelop \{ return WidgetShared\.skjultBelop \}/);
  assert.match(w, /private func signed2\(_ v: Double\) -> String \{\s*if WidgetShared\.skjulBelop \{ return WidgetShared\.skjultBelop \}/);
  const pw = code('FinansHubWidgets/Sources/PlatformWidgets.swift');
  assert.doesNotMatch(pw, /Plat51Net\.kr\(s\./, 'alle beløp går via platKr');
  assert.match(pw, /WidgetShared\.skjulBelop \? WidgetShared\.skjultBelop : Plat51Net\.kr\(v\)/);
  const tw = code('FinansHubWidgets/Sources/TrialsWidget.swift');
  assert.equal((tw.match(/t\.priceText/g) ?? []).length, 1, 'prisen vises bare via trPris');
  assert.match(tw, /WidgetShared\.skjulBelop \? WidgetShared\.skjultBelop : t\.priceText/);
  assert.match(code('Shared/WidgetShared.swift'), /static let skjultBelop: String = "•••"/);
});
