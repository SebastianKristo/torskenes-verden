// Prompt 86 (IOS86): lenker som UTFØRER noe (URL-skjemaene kan åpnes fra nettsider og andre apper) må bekreftes først.
// Funn: kalender://glimt?q=… (iOS og Mac) sendte spørsmålet til Glimt, og kalender://ny?text=… (Mac) la til hendelsen direkte.
// Homelab (finanshub:// / homelab:// / papir://) har bare lenker som åpner en side eller en innlogging med egen bekreftelse.
// Ingen Swift-kompilator i sandkassen: kildesjekker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const IOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps/ios');
const raw = (p) => readFileSync(join(IOS, p), 'utf8');
/** Uten linjekommentarer (nok for disse filene). */
const code = (p) => raw(p).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.swift')) out.push(p);
  }
  return out;
}

test('Kalender iOS: handlingslenker utenfra spør først, appens egne kall er trusted', () => {
  const links = code('Kalender/Sources/KalLinks.swift');
  // Sikker standard: uten trusted regnes lenken som utenfra.
  assert.match(links, /static func handle\(_ url: URL, trusted: Bool = false\) \{\n\s+if !trusted, let text = actionText86\(url\) \{\n\s+KalLinkAsk86\.shared\.ask\(url, text\)\n\s+return\n\s+\}/);
  // Sjekken står før noe annet i handle (også før arkene lukkes).
  const body = links.slice(links.indexOf('static func handle('));
  assert.ok(body.indexOf('actionText86(url)') < body.indexOf('KalStore.shared'));
  // Eneste sted Glimt får tekst fra en lenke.
  assert.equal((links.match(/KalGlimtModel\.shared\.send\(/g) || []).length, 1);
  assert.match(links, /static func actionText86\(_ url: URL\) -> String\? \{[\s\S]*?guard host == "glimt" \|\| host == "spor" else \{ return nil \}[\s\S]*?i\.name == "q"[\s\S]*?return v\.isEmpty \? nil : v/);
  // «Utfør» kjører lenken én gang som bekreftet; «Avbryt» kaster den.
  assert.match(links, /func run\(\) \{\n\s+shown = false\n\s+guard let u = url else \{ return \}\n\s+url = nil\n\s+KalLinks\.handle\(u, trusted: true\)/);
  assert.match(links, /func cancel\(\) \{\n\s+shown = false\n\s+url = nil/);

  const app = code('Kalender/Sources/KalApp.swift');
  assert.match(app, /\.onOpenURL \{ \(url: URL\) in KalLinks\.handle\(url\) \}/);
  assert.match(app, /if let u = a\.webpageURL \{ KalLinks\.handle\(u\) \}/);
  assert.match(app, /\.alert\("Vil du sende dette til Glimt\?", isPresented: on86\) \{\n\s+Button\("Avbryt", role: \.cancel\) \{ KalLinkAsk86\.shared\.cancel\(\) \}\n\s+Button\("Utfør"\) \{ KalLinkAsk86\.shared\.run\(\) \}/);
  // body leser tilstanden selv (Observation), ikke bare inni Binding-en.
  assert.match(app, /let shown86: Bool = ask86\.shown/);

  // Varsler (UNNotificationResponse) og den innebygde Kalenderen i Homelab virker som før.
  assert.match(code('Kalender/Sources/KalNotify.swift'), /Task \{ @MainActor in KalLinks\.handle\(url, trusted: true\) \}/);
  const embed = code('FinansHub/Sources/Kal84Embed.swift');
  assert.equal((embed.match(/KalLinks\.handle\(url, trusted: true\)/g) || []).length, 2);
  assert.doesNotMatch(embed, /KalLinks\.handle\(url\)/);
});

test('trusted: true brukes bare av appens egne kall (aldri fra onOpenURL / universelle lenker)', () => {
  const hits = [];
  for (const f of walk(IOS)) {
    const src = readFileSync(f, 'utf8');
    if (src.includes('trusted: true')) hits.push(relative(IOS, f));
    for (const l of src.split('\n')) {
      if (/onOpenURL|webpageURL/.test(l) && !l.trim().startsWith('//')) assert.doesNotMatch(l, /trusted: true/, f);
    }
  }
  assert.deepEqual(hits.sort(), ['FinansHub/Sources/Kal84Embed.swift', 'Kalender/Sources/KalLinks.swift', 'Kalender/Sources/KalNotify.swift']);
});

test('Kalender Mac: ny?text=… og glimt?q=… bekreftes før MacLinks.handle', () => {
  const m = code('KalenderMac/Sources/MacLinks45.swift');
  assert.match(m, /if let a = MacLinks45\.action86\(url\), !MacLinks45\.confirm86\(a\.0, a\.1\) \{ return \}\n\s+MacLinks\.handle\(url, win: w, animated: false\)/);
  assert.match(m, /if \(host == "ny" \|\| host == "new"\) && !text\.isEmpty \{ return \("Vil du legge til denne hendelsen\?", text\) \}/);
  assert.match(m, /if \(host == "glimt" \|\| host == "spor"\) && !ask\.isEmpty \{ return \("Vil du sende dette til Glimt\?", ask\) \}/);
  // Avbryt er standardknappen.
  assert.match(m, /a\.addButton\(withTitle: "Avbryt"\)\n\s+a\.addButton\(withTitle: "Utfør"\)\n\s+return a\.runModal\(\) == \.alertSecondButtonReturn/);
  // MacLinks.handle har ingen andre innganger enn MacLinks45.flush.
  const callers = walk(join(IOS, 'KalenderMac')).filter((f) => /MacLinks\.handle\(/.test(readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')));
  assert.deepEqual(callers.map((f) => relative(IOS, f)), ['KalenderMac/Sources/MacLinks45.swift']);
});

test('widgetene: ingen lenker med handlingsparametre (bare sider), handlinger går via App Intents', () => {
  const dirs = ['FinansHubWidgets/Sources', 'KalenderWidgets/Sources', 'Watch51/Sources', 'Shared'];
  for (const d of dirs) {
    for (const f of walk(join(IOS, d))) {
      const src = readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      assert.doesNotMatch(src, /kalender:\/\/(glimt|spor|ny\?|new\?)/, f);
      assert.doesNotMatch(src, /(finanshub|homelab|papir):\/\/[^"]*[?&](act|action|do)=/, f);
      assert.doesNotMatch(src, /(finanshub|homelab):\/\/hjemlys\/(start|home|ok)/, f);
    }
  }
  assert.match(raw('KalenderWidgets/Sources/KalWidgets.swift'), /static let newURL: URL = URL\(string: "kalender:\/\/ny"\)!/);
});

test('Homelab: dyplenkene åpner sider; innlogging har egen bekreftelse (uendret)', () => {
  const w = code('FinansHub/Sources/AppWidgets.swift');
  // Hjemlys-lenken laster bare kortet (GET), ingen start/hjemme/ok fra lenker.
  assert.match(w, /case "hjemlys": paperGo\("familie"\); Task \{ await Hjemlys40Model\.shared\.load\(self\) \}/);
  const deep = w.slice(w.indexOf('func openDeepLink'));
  assert.doesNotMatch(deep, /"POST"|"DELETE"|"PUT"|"PATCH"|\.start\(|\.checkIn|\.arrived|\.send\(/);
  // QR: lenken henter bare enhetsinfo og viser «ask» (Godkjenn / Avvis). App-auth: arket + Face ID før koden lages.
  const qr = code('FinansHub/Sources/QrLogin38.swift');
  assert.match(qr, /"\/auth\/qr\/scan"/);
  assert.match(qr, /self\.phase = "ask"/);
  assert.match(qr, /func approve\(_ store: Store\) \{\n\s+guard phase == "ask" else \{ return \}/);
  const auth = code('FinansHub/Sources/AppAuth41.swift');
  assert.match(auth, /guard AppAuth41\.allowed\(r\.redirect, store\) else \{/);
  assert.match(auth, /let ok: Bool = await AppAuth41\.verifyOwner\(\)\n\s+guard ok else \{/);
  // Magnet-lenker fyller bare ut arket.
  assert.match(code('FinansHub/Sources/Media43Model.swift'), /magnetPrefill = s/);
});
