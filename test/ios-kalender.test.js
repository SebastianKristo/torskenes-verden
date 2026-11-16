// Q26 og Q34 i appene: den gamle kalenderen i Homelab-appen er erstattet av den delte Kalender-koden (Kalender/, SharedKal/),
// og alt den kunne, finnes der. Kildetester – ingen Swift-kompilator her; CI-jobben «Mobilapper» bygger alle mål.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const IOS = join(import.meta.dirname, '..', 'apps', 'ios');
const raw = (p) => readFileSync(join(IOS, p), 'utf8');
// Uten kommentarer (// og /* */), så forklaringer ikke teller.
const code = (p) => raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');
const swiftFiles = (dir = IOS) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n.endsWith('.xcassets') ? [] : swiftFiles(p);
  return n.endsWith('.swift') ? [p] : [];
});

test('Q26: hendelsene har lærer, fag, type, MazeMap, gjentakelse og nedtelling fra serveren (valgfrie felt, gamle buffere kan leses)', () => {
  const core = code('SharedKal/Core/KalCore.swift');
  for (const f of ['teacher', 'subject', 'serverType', 'mazemap', 'repeatRule']) assert.match(core, new RegExp(`var ${f}: String\\? = nil`), f);
  assert.match(core, /var daysLeft: Int\? = nil/);
  assert.match(core, /KalSchool\.decorate\(&ev, o\)\n\s+return ev/);
  const s = code('SharedKal/Core/KalSchoolCore.swift');
  for (const k of ['"teacher"', '"subject"', '"type"', '"mazemap"', '"recurrence"', '"daysLeft"']) assert.ok(s.includes(`KalParse.${k === '"daysLeft"' ? 'int' : 'str'}(o, ${k})`), k);
  // Ingen UIKit/SwiftUI i kjernen (widgetene og Mac har den også).
  assert.doesNotMatch(s, /import (UIKit|SwiftUI)/);
});

test('Q26: detaljarket viser lærer, fag, merknad, gjentakelse og typen (Prøve/Innlevering)', () => {
  const d = code('Kalender/Sources/KalSheets.swift');
  assert.match(d, /KalInfoRow\(label: "Lærer", value: te\)/);
  assert.match(d, /KalInfoRow\(label: "Fag", value: subjectText\)/);
  assert.match(d, /KalInfoRow\(label: "Merknad", value: noteText\)/);
  assert.match(d, /KalInfoRow\(label: "Gjentas", value: KalSchool\.repeatName\(e\.repeatRule\)\)/);
  assert.match(d, /Text\(calLabel\(c\)\)/);
  assert.match(code('SharedKal/Core/KalSchoolCore.swift'), /case "prove": return "Prøve"\n\s+case "innl": return "Innlevering"/);
  assert.match(d, /KalDetailExtras\(e: e\)/);
});

test('Q26: «Kopier til Personlig» kaller POST /api/kalender/events/:id/copy, og «Finn rommet i MazeMap» bruker serverens lenke', () => {
  const x = code('Kalender/Sources/KalDetailExtras.swift');
  assert.match(x, /KalNet\.send\("POST", "\/api\/kalender\/events\/" \+ KalNet\.enc\(id\) \+ "\/copy"/);
  assert.match(x, /Text\("Kopier til Personlig"\)/);
  assert.match(x, /!e\.editable && !e\.pending/);
  assert.match(x, /KalSchool\.mapURL\(e\)/);
  assert.match(code('SharedKal/Core/KalSchoolCore.swift'), /if let m = e\.mazemap \{ return URL\(string: m\) \}/);
});

test('Q26: «Lær Glimt hva dette er…» finnes i den delte Kalenderen (Glimt husker, per bruker på serveren)', () => {
  const l = code('Kalender/Sources/KalLearn.swift');
  assert.match(l, /KalNet\.send\("POST", "\/api\/glimt\/memory", json: body/);
  assert.match(l, /"\/api\/glimt\/memory\/" \+ String\(id\) \+ "\/apply"/);
  assert.match(l, /"\/api\/kalender\/events\/" \+ KalNet\.enc\(id\)/);
  assert.match(code('Kalender/Sources/KalEdit.swift'), /KalLearnModel\.shared\.suggest\(o\["suggestMemory"\] as\? \[String: Any\]\)/);
  assert.match(code('Kalender/Sources/KalApp.swift'), /KalLearnSheet\(\)/);
  assert.match(code('Kalender/Sources/KalDetailExtras.swift'), /KalLearnModel\.shared\.open\(e\)/);
});

test('Q26: Ny hendelse har Gjenta, Merknad og «✦ Beskriv med Glimt» (POST /api/kalender/describe), og et utfylt skjema fra lenke', () => {
  const st = code('Kalender/Sources/KalStore.swift');
  assert.match(st, /var note: String = ""\n\s+var repeatRule: String = "none"\n\s+var error: String = ""/);
  assert.match(st, /if let r = ev\.repeatRule, r != "none" \{ body\["repeat"\] = r \}/);
  assert.match(st, /else if !ev\.note\.isEmpty \{ body\["note"\] = ev\.note \}/);
  const x = code('Kalender/Sources/KalNewExtras.swift');
  assert.match(x, /KalLabel\(text: "GJENTA"\)/);
  assert.match(x, /TextField\("Merknad", text: \$f\.note/);
  assert.match(x, /KalNet\.send\("POST", "\/api\/kalender\/describe", json: \["text": text, "today": KalD\.todayKey\(\)\]/);
  const sh = code('Kalender/Sources/KalSheets.swift');
  assert.match(sh, /if !editing \{ KalDescribeBox\(f: \$f\) \}/);
  assert.match(sh, /KalNewMore\(f: \$f\)/);
  // Rediger: merknad og gjentakelse sendes bare når de er endret.
  const ed = code('Kalender/Sources/KalEdit.swift');
  assert.match(ed, /if noteChanged \{ body\["note"\] = f\.note \}/);
  assert.match(ed, /if repeatChanged \{ body\["repeat"\] = f\.repeatRule \}/);
  // kalender://ny?title=… åpner skjemaet utfylt (lagrer ingenting).
  const l = code('Kalender/Sources/KalLinks.swift');
  assert.match(l, /if let t = q\("title"\) \{\n\s+s\.openPrefilled\(title: t, date: q\("date"\)/);
  assert.match(x, /presentNew46\(f\)/);
});

test('Q34 (E-B12): appene viser «Slå sammen kalenderne: N → 4?» med ja/nei når serveren sender migration.proposed (iPhone, iPad, Mac)', () => {
  const core = code('SharedKal/Core/KalCalendarsCore.swift');
  assert.match(core, /out\.proposed = KalParse\.bool\(m, "proposed"\) \?\? false/);
  assert.match(core, /out\.moved = KalParse\.int\(m, "moved"\) \?\? 0/);
  assert.match(core, /"Slå sammen kalenderne: " \+ String\(m\.from\) \+ " → " \+ String\(m\.to\) \+ "\?"/);
  assert.match(core, /guard m\.proposed, !m\.done else \{ return nil \}/);
  // Ja = POST …/migration (samme som web). Ingenting kjøres uten ja.
  assert.match(core, /KalNet\.send\("POST", "\/api\/kalender\/calendars\/migration", json: \[:\]/);
  const web = readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'kalender-oppsett.js'), 'utf8');
  assert.match(web, /fetch\('\/api\/kalender\/calendars\/migration', \{ method: 'POST'/);
  // iPhone/iPad (og Homelab, KAL_EMBED): over kalenderen og i Kalendere.
  const st = code('Kalender/Sources/KalStore.swift');
  assert.match(st, /mergeProposal = KalMergeOffer\.pending\(KalCals39\.migration, seenKey: KalStore\.mergeSeenKey\)/);
  const k = code('Kalender/Sources/KalMerge.swift');
  assert.match(k, /KalPill\(title: s\.merging \? "Slår sammen …" : "Slå sammen"/);
  assert.match(k, /KalPill\(title: "Ikke nå"/);
  assert.match(k, /KalCalAPI39\.acceptMigration\(\)/);
  assert.match(code('Kalender/Sources/KalApp.swift'), /KalMergeBanner\(\)/);
  assert.match(code('Kalender/Sources/KalCalendars.swift'), /KalMergeBanner\(floating: false\)/);
  // Mac.
  assert.match(code('KalenderMac/Sources/MacStore.swift'), /mergeProposal = KalMergeOffer\.pending\(KalCals39\.migration, seenKey: MacStore\.mergeSeenKey\)/);
  const mac = code('KalenderMac/Sources/MacMerge.swift');
  assert.match(mac, /KalCalAPI39\.acceptMigration\(\)/);
  assert.match(mac, /MacPill\(title: "Ikke nå"/);
  assert.match(code('KalenderMac/Sources/MacRoot.swift'), /MacMergeBanner\(\)/);
});

test('Q26: Oversikt har kortene A–E fra den gamle kalendersiden, som kan flyttes og skjules (kalOrder/kalHidden i /api/me/layout)', () => {
  const o = code('Kalender/Sources/KalOverview.swift');
  assert.match(o, /static let cardKeys: \[String\] = \["A", "B", "C", "D", "E"\]/);
  // Samme kortnøkler som serveren godtar (KAL_CARDS i server/mobile.js).
  const srv = readFileSync(join(import.meta.dirname, '..', 'server', 'mobile.js'), 'utf8');
  assert.match(srv, /const KAL_CARDS = \['A', 'B', 'C', 'D', 'E'\]/);
  assert.match(o, /KalNet\.get\("\/api\/me\/layout"/);
  assert.match(o, /let body: \[String: Any\] = \["kalOrder": order, "kalHidden": Array\(hidden\)\.sorted\(\)\]/);
  assert.match(o, /KalNet\.send\("PUT", "\/api\/me\/layout", json: body/);
  for (const f of ['func move(', 'func hide(', 'func show(', 'func reset(']) assert.ok(o.includes(f), f);
  assert.match(o, /if visible\.count <= 1 \{ return \}/, 'minst ett kort synlig');
  for (const c of ['KalNowCard(now: now)', 'KalTestsCard()', 'KalCalsCard()', 'KalViewsCard()', 'KalWidgetsCard()']) assert.ok(o.includes(c), c);
  // Prøver og frister med nedtelling (serverens daysLeft når den finnes) og rødt den siste uka.
  const sc = code('SharedKal/Core/KalSchoolCore.swift');
  assert.match(sc, /if let d = e\.daysLeft \{ return d \}/);
  assert.match(sc, /static func urgent\(_ n: Int\) -> Bool \{ n <= 7 \}/);
  assert.match(o, /KalSchool\.inText\(n\)/);
  // Innganger: sidemenyen (iPhone), sidepanelet (iPad) og kalender://oversikt.
  assert.match(code('Kalender/Sources/KalDrawer.swift'), /s\.overviewOpen = true/);
  assert.match(code('Kalender/Sources/KalPad.swift'), /s\.overviewOpen = true/);
  assert.match(code('Kalender/Sources/KalLinks.swift'), /case "oversikt", "prover":\n\s+s\.overviewOpen = true/);
  assert.match(code('Kalender/Sources/KalApp.swift'), /if s\.overviewOpen \{\n\s+KalOverviewView\(\)/);
});
