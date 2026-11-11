// Prompt 85 (IOS85): gjennomgang av iOS-appene (Homelab/FinansHub, Kalender, widgetene, Apple Watch).
// Ingen Swift-kompilator i sandkassen: kildesjekker av rettingene + en strukturell sjekk av alle Swift-filene
// (kommentarer, strenger, klammer og #if/#endif), så en fil som ikke kan kompilere fanges her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS = join(ROOT, 'apps/ios');
const FH = join(IOS, 'FinansHub/Sources');
const raw = (p) => readFileSync(join(IOS, p), 'utf8');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.swift')) out.push(p);
  }
  return out;
}

/** Fjerner kommentarer (Swift nester blokk-kommentarer) og strenginnhold (beholder interpolasjoner). */
function strip(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const errs = [];
  function str(hashes, multi) {
    const close = (multi ? '"""' : '"') + '#'.repeat(hashes);
    const esc = '\\' + '#'.repeat(hashes);
    while (i < n) {
      if (src.startsWith(close, i)) { i += close.length; return; }
      if (src.startsWith(esc, i)) {
        i += esc.length;
        if (src[i] === '(') {
          out += ' (';
          i++;
          let d = 1;
          while (i < n && d > 0) {
            const c = src[i];
            if (c === '"') { const m = src.startsWith('"""', i); i += m ? 3 : 1; str(0, m); out += '""'; continue; }
            if (c === '(') d++; else if (c === ')') d--;
            if (d > 0) out += c;
            i++;
          }
          out += ') ';
        } else i++;
        continue;
      }
      if (!multi && src[i] === '\n') { errs.push('uavsluttet streng, linje ' + src.slice(0, i).split('\n').length); return; }
      if (src[i] === '\n') out += '\n';
      i++;
    }
    errs.push('uavsluttet streng');
  }
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      let d = 1;
      i += 2;
      while (i < n && d > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { d++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { d--; i += 2; } else { if (src[i] === '\n') out += '\n'; i++; }
      }
      if (d > 0) errs.push('uavsluttet blokk-kommentar');
      continue;
    }
    if (c === '#' || c === '"') {
      let h = 0;
      let j = i;
      while (src[j] === '#') { h++; j++; }
      if (src[j] === '"') { const m = src.startsWith('"""', j); i = j + (m ? 3 : 1); str(h, m); out += '""'; continue; }
    }
    out += c;
    i++;
  }
  return { code: out, errs };
}

function structure(src) {
  const { code, errs } = strip(src);
  const st = [];
  const pair = { '}': '{', ')': '(', ']': '[' };
  let line = 1;
  for (const ch of code) {
    if (ch === '\n') line++;
    else if ('{(['.includes(ch)) st.push([ch, line]);
    else if (ch in pair) {
      const t = st.pop();
      if (!t || t[0] !== pair[ch]) { errs.push(`feil «${ch}» på linje ${line}`); break; }
    }
  }
  if (st.length && !errs.length) errs.push(`«${st[st.length - 1][0]}» fra linje ${st[st.length - 1][1]} lukkes ikke`);
  // Hver gren i #if / #else / #endif må være balansert for seg (ellers kompilerer den ene varianten ikke).
  const ifs = [];
  code.split('\n').forEach((l, idx) => {
    const t = l.trim();
    if (/^#if\b/.test(t)) { ifs.push({ line: idx + 1, d: 0, min: 0 }); return; }
    if (/^#(else|elseif|endif)\b/.test(t)) {
      const top = ifs[ifs.length - 1];
      if (!top) { errs.push('#' + t.slice(1, 6) + ' uten #if, linje ' + (idx + 1)); return; }
      if (top.d !== 0 || top.min < 0) errs.push(`#if-gren fra linje ${top.line} er ubalansert`);
      if (/^#endif/.test(t)) ifs.pop(); else { top.d = 0; top.min = 0; top.line = idx + 1; }
      return;
    }
    for (const s of ifs) {
      for (const ch of l) {
        if ('{(['.includes(ch)) s.d++;
        else if ('})]'.includes(ch)) { s.d--; s.min = Math.min(s.min, s.d); }
      }
    }
  });
  if (ifs.length) errs.push('#if uten #endif fra linje ' + ifs[0].line);
  return errs;
}

const FILES = walk(IOS);
const code = (p) => strip(raw(p)).code;

test('alle Swift-filene: kommentarer, strenger, klammer og #if-grener går opp', () => {
  assert.ok(FILES.length > 500, 'fant ' + FILES.length + ' filer');
  const bad = [];
  for (const f of FILES) {
    const e = structure(readFileSync(f, 'utf8'));
    if (e.length) bad.push(relative(IOS, f) + ': ' + e.join('; '));
  }
  assert.deepEqual(bad, []);
});

test('leksersjekken fanger feilene den skal fange', () => {
  assert.deepEqual(structure('struct A { func f() { let s = "a \\(b(1)) }" } }'), []);
  assert.deepEqual(structure('/* a /* b */ c */ struct A {}'), []);
  assert.ok(structure('struct A { func f() { }').length > 0);
  assert.ok(structure('/* a /* b */ struct A {}').length > 0);
  assert.ok(structure('struct A {\n#if X\nvar a: Int { 1\n#else\nvar a: Int { 2 }\n#endif\n}').length > 0);
  assert.ok(structure('let a = "abc\nlet b = 1').length > 0);
});

test('ingen tvungen utpakking av URL(string:) med innhold som ikke er en fast tekst', () => {
  const bad = [];
  for (const f of FILES) {
    const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    for (const m of src.matchAll(/URL\(string:\s*([^\n]*?)\)!/g)) {
      // Tillatt: en ren strengkonstant uten interpolasjon (reserven etter «??»).
      const tail = m[1].split('URL(string:').pop().trim();
      if (!/^"[^"\\]*"$/.test(tail)) bad.push(relative(IOS, f) + ': ' + m[0].slice(0, 90));
    }
  }
  assert.deepEqual(bad, []);
});

test('API: ugyldig serveradresse gir feilmelding, ikke krasj', () => {
  const api = code('FinansHub/Sources/API.swift');
  assert.doesNotMatch(api, /URL\(string:[^\n]*\)!/);
  assert.match(api, /static let badURL85: URL = URL\(string: ""\) \?\? URL\(fileURLWithPath: ""\)/);
  assert.match(api, /prefix \+ path\) \?\? API\.badURL85/);
  assert.match(api, /\+ path\) \?\? API\.badURL85/);
  assert.match(api, /case \.unsupportedURL, \.badURL: throw APIError\(message: "", status: 0\)/);
  assert.match(raw('FinansHub/Sources/API.swift'), /"ugyldig:\/\/adresse"/);
  assert.match(raw('FinansHub/Sources/API.swift'), /Ugyldig serveradresse\. Sjekk adressen\./);
});

test('Info.plist: «Arkiver bilde» i delingsarket har tillatelsestekst (ellers avslutter iOS appen)', () => {
  const yml = readFileSync(join(IOS, 'project.yml'), 'utf8');
  const fh = yml.slice(yml.indexOf('\n  FinansHub:'), yml.indexOf('\n  FinansHubWidgets:'));
  // Appen deler bildefiler med delingsarket …
  assert.match(raw('FinansHub/Sources/Chat50Attach.swift'), /jpegData[\s\S]{0,400}ChatShare27\(url: u\)/);
  assert.match(raw('FinansHub/Sources/Paper.swift'), /UIActivityViewController\(activityItems: \[url\]/);
  // … og da må begge stedene ha teksten (INFOPLIST_KEY_ og info.properties, som de andre personverntekstene).
  assert.match(fh, /INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription: ".+"/);
  assert.match(fh, /\n        NSPhotoLibraryAddUsageDescription: ".+"/);
  // Alle API-er som krever tekst har en.
  const need = [
    [/AVCaptureDevice\.requestAccess|UIImagePickerController\(\)/, 'NSCameraUsageDescription'],
    [/requestRecordPermission/, 'NSMicrophoneUsageDescription'],
    [/SFSpeechRecognizer\.requestAuthorization/, 'NSSpeechRecognitionUsageDescription'],
    [/requestWhenInUseAuthorization/, 'NSLocationWhenInUseUsageDescription'],
    [/requestAlwaysAuthorization/, 'NSLocationAlwaysAndWhenInUseUsageDescription'],
    [/CMMotionActivityManager\(\)/, 'NSMotionUsageDescription'],
    [/HKHealthStore\(\)/, 'NSHealthShareUsageDescription'],
    [/LAContext\(\)/, 'NSFaceIDUsageDescription'],
  ];
  const all = walk(FH).map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const [re, key] of need) {
    if (re.test(all)) assert.ok(fh.includes(key + ':'), key);
  }
});

test('BGTask-identifikatorene som registreres står i BGTaskSchedulerPermittedIdentifiers', () => {
  const yml = readFileSync(join(IOS, 'project.yml'), 'utf8');
  const fh = yml.slice(yml.indexOf('\n  FinansHub:'), yml.indexOf('\n  FinansHubWidgets:'));
  const kal = yml.slice(yml.indexOf('\n  Kalender:'), yml.indexOf('\n  KalenderUITests47:'));
  for (const id of ['no.kristo.finanshub.health', 'no.kristo.finanshub.family', 'no.kristo.finanshub.notify']) {
    assert.ok(new RegExp('BGTaskSchedulerPermittedIdentifiers: \\[[^\\]]*' + id.replace(/\./g, '\\.')).test(fh), id);
  }
  assert.match(kal, /BGTaskSchedulerPermittedIdentifiers: \[no\.kristo\.kalender\.refresh44\]/);
  // Kalenders oppgave registreres aldri i Homelab-appen (står ikke i Homelabs liste).
  assert.match(raw('Kalender/Sources/KalBg44.swift'), /#if !KAL_EMBED\s+_ = BGTaskScheduler\.shared\.register/);
});

test('innebygd Kalender: økten følger Homelab-kontoen (aldri en annen brukers kalender)', () => {
  const k = code('FinansHub/Sources/Kal84Embed.swift');
  const login = k.slice(k.indexOf('func login(force: Bool)'), k.indexOf('static let acctDef85'));
  const iStale = login.indexOf('KalCompanion33.clear()');
  const iBoot = login.indexOf('s.bootstrap()');
  const iDrop = login.indexOf('dropForeign85(s)');
  const iRet = login.indexOf('if s.loggedIn { return }');
  assert.ok(iStale > 0 && iStale < iBoot && iBoot < iDrop && iDrop < iRet, 'rekkefølgen i login()');
  assert.match(login, /KalGroup\.homelabFor != KalGroup\.fingerprint\(a\.token\)/);
  assert.match(k, /nonisolated static func foreign85\(saved: String, key: String, kalUser: String, names: \[String\]\) -> Bool \{\s+if !saved\.isEmpty \{ return saved != key \}/);
  assert.match(k, /if Kal84Host\.foreign85\(saved: saved, key: key, kalUser: KalGroup\.user, names: names\) \{\s+s\.dropSession85\(\)/);
  assert.match(k, /let names: \[String\] = \[a\.username, a\.name, a\.label, st\.displayName\]/);
  const s = code('Kalender/Sources/KalStore.swift');
  const drop = s.slice(s.indexOf('func dropSession85()'), s.indexOf('func load(force: Bool'));
  for (const w of ['KalKeychain41.delete("")', 'KalGroup.clearSession()', 'KalCache44.clear()', 'loggedIn = false', 'events = []', 'rebuild()']) {
    assert.ok(drop.includes(w), w);
  }
  // Ikke «kal.noAuto» (da ville Homelab ikke logget inn den nye kontoen automatisk).
  assert.ok(!drop.includes('UserDefaults'));
});

test('widgetene: alle bufre med personlige data tømmes ved kontobytte', () => {
  const shared = raw('Shared/WidgetShared.swift');
  const clear = shared.slice(shared.indexOf('static func clearCaches()'), shared.indexOf('static var token'));
  const cleared = new Set([...clear.matchAll(/"(w\.[a-z0-9.]+)"/g)].map((m) => m[1]));
  // Ikke personlig (innstillinger på enheten, offentlige data) eller håndtert for seg (offline-køen bindes til kontoen).
  const allow = new Set(['w.bible37', 'w.ruter52.buf', 'w.glimt35.cfg', 'w.glimt40.jul', 'w.glimt40.julP', 'w.glimt40.snow', 'w.glimt40.julSound',
    'w.glimt41.mai17', 'w.brief34.poke', 'w.brief34.tip', 'w.offline51', 'w.offline51.notices', 'w.offline51.owner',
    'w.server', 'w.external', 'w.local', 'w.token', 'w.scan']);
  const missing = [];
  for (const dir of ['Shared', 'FinansHubWidgets/Sources']) {
    for (const f of walk(join(IOS, dir))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/static let \w*[kK]ey\w*(?:: String)? = "(w\.[A-Za-z0-9.]+)"/g)) {
        if (!cleared.has(m[1]) && !allow.has(m[1])) missing.push(relative(IOS, f) + ': ' + m[1]);
      }
    }
  }
  assert.deepEqual(missing, []);
  for (const k of ['w.plan51', 'w.checkin51', 'w.media43', 'w.hjemlys40']) assert.ok(cleared.has(k), k);
});

test('offline-køen følger kontoen: bindes før widget-tokenet byttes', () => {
  const p = code('Shared/Plat51Shared.swift');
  const bind = p.slice(p.indexOf('static func bind(_ owner: String)'), p.indexOf('static func module('));
  assert.match(bind, /if old == owner \|\| owner\.isEmpty \{ return \}/);
  assert.match(bind, /if let q = d\.data\(forKey: key\) \{ d\.set\(q, forKey: key \+ "" \+ old\) \}/);
  assert.match(bind, /d\.removeObject\(forKey: key\)/);
  assert.match(bind, /d\.removeObject\(forKey: noticeKey\)/);
  const w = code('FinansHub/Sources/AppWidgets.swift');
  const iBind = w.indexOf('Offline51.bind(');
  const iSave = w.indexOf('WidgetShared.save(');
  assert.ok(iBind > 0 && iBind < iSave, 'bind før save');
  // Køen sendes alltid med widget-tokenet (kontoen som er i bruk) – derfor må de to byttes samtidig.
  assert.match(raw('Shared/Plat51Shared.swift'), /WidgetShared\.token/);
});

test('kontobytte tømmer også nyere modeller med personlige data', () => {
  const iso = code('FinansHub/Sources/Isolation21.swift');
  const fn = iso.slice(iso.indexOf('private func resetSharedModels21()'));
  assert.match(fn, /plan\.goals = nil; plan\.cal = nil; plan\.tax = nil/);
  assert.match(fn, /mem\.pending = \[\]; mem\.conflicts = \[\]; mem\.stale = \[\]; mem\.hygiene = nil/);
  assert.match(fn, /Skjold76\.shared\.resetForAccount85\(\)/);
  assert.match(fn, /sk\.projects = \[\]; sk\.details = \[:\]; sk\.lines = \[:\]; sk\.usedIn = \[:\]/);
  const m = code('FinansHub/Sources/Skjold76Model.swift');
  const r = m.slice(m.indexOf('func resetForAccount85()'), m.indexOf('func load(_ store: Store) async'));
  for (const w of ['cabinets = []', 'items = []', 'details = [:]', 'history = [:]', 'all = []', 'maps = [:]']) assert.ok(r.includes(w), w);
});

test('Apple Watch: Glimt prøver neste adresse, og «Hent meg» venter på posisjonstillatelsen', () => {
  const w = code('Watch51/Sources/Watch51Store.swift');
  const ask = w.slice(w.indexOf('func ask(_ text: String) async'), w.indexOf('private func handle('));
  assert.match(ask, /for b in list \{/);
  assert.match(ask, /var started: Bool = false/);
  assert.match(ask, /catch \{\s+if started \{ break \}\s+\}/);
  assert.match(ask, /call\("", "", bases: list, auth: false, timeout: 4\)/);
  assert.doesNotMatch(ask, /list\.first/);
  const fix = w.slice(w.indexOf('func fix() async -> CLLocation?'), w.indexOf('private func finish('));
  assert.match(fix, /m\.requestWhenInUseAuthorization\(\)\s+for _ in 0\.\.<40 \{\s+if m\.authorizationStatus != \.notDetermined \{ break \}/);
  assert.match(fix, /if m\.authorizationStatus == \.notDetermined \{ return nil \}/);
  // Klokka får aldri token fra iPhone (bare adressene) – regelen «QR-innlogging bærer aldri token».
  const pair = w.slice(w.indexOf('func pair() async'), w.indexOf('private func poll('));
  assert.doesNotMatch(pair, /\["token"\]/);
});

test('VoiceOver og trykkflater: symbolknappene som manglet tekst', () => {
  assert.equal((raw('FinansHub/Sources/Modules.swift').match(/\.accessibilityLabel\(adding \? "Lukk" : "Legg til"\)/g) || []).length, 2);
  assert.match(raw('FinansHub/Sources/SearchField27.swift'), /\.accessibilityLabel\("Tøm søket"\)/);
  assert.match(raw('FinansHub/Sources/SubsMobile.swift'), /chevron\.left[^\n]*\.accessibilityLabel\("Tilbake"\)/);
  assert.match(raw('FinansHub/Sources/Tasks37Detail.swift'), /contentShape\(Rectangle\(\)\)\.padding\(\.vertical, -10\)[\s\S]{0,160}\.accessibilityLabel\(s\.done \? "Ferdig" : "Ikke ferdig"\)/);
  assert.match(raw('FinansHub/Sources/Tasks41Glimt.swift'), /\.padding\(11\)\.contentShape\(Rectangle\(\)\)\.padding\(-11\)[\s\S]{0,160}\.accessibilityLabel\(t\.done \? "Ferdig" : "Ikke ferdig"\)/);
});

test('faste regler: token og passord skrives aldri til loggen', () => {
  const bad = [];
  for (const f of FILES) {
    const src = strip(readFileSync(f, 'utf8')).code;
    for (const m of src.matchAll(/\b(?:print|NSLog|os_log)\(([^\n]*)/g)) {
      if (/token|password|passord|secret/i.test(m[1])) bad.push(relative(IOS, f) + ': ' + m[0].slice(0, 80));
    }
  }
  assert.deepEqual(bad, []);
});
