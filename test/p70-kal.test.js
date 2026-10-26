// Prompt 70 (KAL70): Kalender-appene – NÅ-kortet fjernet, widgets etter Kalender Widgets.dc.html (iOS, Material You, One UI),
// Innstillinger → Widgets og «Kalender på hjemskjermen». Swift/Kotlin bygges ikke her (Kotlin typesjekkes med stubber utenfor
// npm test); dette er kildesjekker av det som er lett å ødelegge igjen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
const IOS = 'apps/ios';
const AND = 'apps/android/kalender/src/main';
const KT = `${AND}/java/no/kristo/kalender`;

test('NÅ/NESTE-kortet øverst er borte på Mac, iPad og web', () => {
  const mac = code(`${IOS}/KalenderMac/Sources/MacRoot.swift`);
  assert.doesNotMatch(mac, /MacNextBanner/);
  assert.match(mac, /MacToolbar\(win: win\)\s*Rectangle\(\)\.fill\(t\.line\)\.frame\(height: 1\)/, 'rutenettet rett under verktøylinjen');
  assert.doesNotMatch(code(`${IOS}/Kalender/Sources/KalPad42.swift`), /KalPad42Next/);
  const web = code('public/js/kalender.js');
  assert.doesNotMatch(web, /nextBanner\(\)/);
  assert.match(web, /k39\.toolbar\(!!k38\.appMode\(\)\)\}<div class="k39-line">/);
  assert.doesNotMatch(code('public/js/kal39.js'), /export function nextBanner|k39-nx/);
  assert.doesNotMatch(read('public/css/kal39.css'), /\.k39-nx/);
});

test('iOS-widgets: fasitens tekster, farger og lenker', () => {
  const w = code(`${IOS}/KalenderWidgets/Sources/KalWidgets.swift`);
  const t = code(`${IOS}/KalenderWidgets/Sources/KalWText70.swift`);
  assert.match(w, /#8a8a8e/);
  assert.match(w, /#f2f2f7/, '+ i lys grå sirkel');
  assert.match(w, /"\+" \+ String\(today\.count - 1\) \+ " til"/, '«+N til» i liten');
  assert.match(w, /\.frame\(width: 96, alignment: \.leading\)/, 'medium: datokolonne 96 pt');
  assert.match(w, /KalWList70\(entry: entry, pal: pal, max: 3, spacing: 9\)/);
  assert.match(w, /KalWList70\(entry: entry, pal: pal, max: 2, spacing: 12\)/, 'stor: to neste under måneden');
  assert.match(w, /KalWPlus70\(pal: pal\)/);
  assert.match(w, /"Ingen flere i dag"/);
  assert.match(w, /\.accessoryRectangular, \.accessoryCircular, \.accessoryInline/);
  assert.match(w, /"  ▦ "/, 'inline: «Man 26.  ▦ 15:15 Tannlege»');
  assert.match(w, /\.widgetAccentable\(\)/);
  assert.match(w, /containerBackground\(\.fill\.tertiary, for: \.widget\)/, 'tonet modus / StandBy');
  assert.match(t, /"Frist " \+ KalD\.hm\(s\)/);
  assert.match(t, /"Hele dagen"/);
  assert.match(t, /return wd \+ " " \+ String\(KalD\.dayOfMonth\(d\)\) \+ "\."/, '«Tir 28.»');
  assert.match(w, /if start > now && start < limit \{ out\.append\(start\) \}/, 'tidslinje ved start og slutt');
  assert.match(w, /hidden\.formUnion\(KalWPrefs70\.off\)/, 'Innstillinger → Widgets');
});

test('iOS/Mac: Innstillinger → Widgets og kortet én gang etter oppdateringen', () => {
  const p = code(`${IOS}/SharedKal/Core/KalWPrefs70.swift`);
  assert.match(p, /"kal70\.w\.off"/);
  assert.match(p, /if KalGroup\.defaults\.object\(forKey: doneKey\) == nil \{ return true \}/, '«Skjul fullførte i dag» er på som standard');
  const s = code(`${IOS}/Kalender/Sources/KalSettings35.swift`);
  assert.match(s, /KalLabel\(text: "WIDGETS"\)[\s\S]*?KalWSettings70\(\)/);
  const k = code(`${IOS}/Kalender/Sources/KalWidgets70.swift`);
  assert.match(k, /"Kalender på hjemskjermen"/);
  assert.match(k, /"Hold inne på hjemskjermen og legg til Kalender-widgeten\."/);
  assert.match(k, /"Senere"/);
  assert.match(k, /"Legg til widget"/);
  assert.match(k, /!seen && s\.loggedIn && m\.whatsNew == nil/);
  assert.match(code(`${IOS}/Kalender/Sources/KalApp.swift`), /\.overlay \{ KalWIntro70Host\(\) \}/);
  assert.match(code(`${IOS}/KalenderMac/Sources/MacSettings.swift`), /section\("WIDGETS"\) \{ MacWidgets70Section\(\) \}/);
});

test('Android: Material You (Glance) og One UI med samme mottakere', () => {
  const w = code(`${KT}/widget/KalWidgets70.kt`);
  assert.match(w, /GlanceTheme\.colors/, 'dynamiske farger');
  assert.match(w, /Build\.MANUFACTURER\.equals\("samsung", ignoreCase = true\)/);
  assert.match(w, /0xFF1259C3/, 'One UI-blå');
  assert.match(w, /0xC7FFFFFF/, 'hvit 78 %');
  assert.match(w, /cornerRadius\(28\.dp\)/);
  assert.match(w, /LazyColumn\(/, 'agendaen kan scrolles');
  assert.match(w, /actionRunCallback<KalMonthNav70>/, '‹ › uten å åpne appen');
  assert.match(w, /"Ingen flere i dag"/);
  assert.match(w, /hendelser igjen i dag/);
  assert.match(w, /requestPinAppWidget/);
  const old = code(`${KT}/widget/KalWidgets.kt`);
  assert.match(old, /SizeMode\.Responsive\(AGENDA_SIZES\)/);
  assert.match(old, /KalWeek70Widget\(\), KalMonth70Widget\(\)/);
  assert.match(old, /KalSync\.scheduleEdges\(ctx\)/);
  const m = read(`${AND}/AndroidManifest.xml`);
  assert.match(m, /\.widget\.KalWeek70Receiver/);
  assert.match(m, /\.widget\.KalMonth70Receiver/);
  for (const f of ['xml/kal_widget_week70.xml', 'xml/kal_widget_month70.xml', 'layout/kal_prev_week70.xml', 'layout/kal_prev_month70.xml']) {
    assert.ok(existsSync(join(ROOT, AND, 'res', f)), f);
  }
  assert.match(read(`${AND}/res/xml/kal_widget_month70.xml`), /android:targetCellHeight="4"/);
  assert.match(read(`${AND}/res/values/strings.xml`), /kal_widget_week70_desc/);
});

test('Android: Innstillinger → Widgets og introkortet', () => {
  const s = code(`${KT}/ui/Kal35Ui.kt`);
  assert.match(s, /Label\("WIDGETS"[^\n]*\)\s*Widgets70Section\(vm\)/);
  assert.doesNotMatch(s, /LinkRow35\("Widgets"/, 'den gamle toast-raden er borte');
  const u = code(`${KT}/ui/Kal70Ui.kt`);
  assert.match(u, /"Skjul fullførte i dag"/);
  assert.match(u, /"Kalender på hjemskjermen"/);
  assert.match(u, /if \(seen \|\| vm\.k51\.news != null\) return/);
  assert.match(code(`${KT}/ui/KalRoot.kt`), /Intro70Host\(vm\)/);
});

test('versjonsnumre er ikke endret (CI og releasene setter dem)', () => {
  assert.match(read('apps/android/kalender/build.gradle.kts'), /\?: "4\.0"/);
  assert.doesNotMatch(read(`${IOS}/project.yml`), /MARKETING_VERSION: "1\.1/);
});
