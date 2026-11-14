// Prompt 89 (IOS89): iOS – riktig domene (os.smarthjemeksperten.no) + migrering, tannhjul for serveradresse på innloggingen
// (Homelab, Kalender, Kalender for Mac) og Live Activities for fem aktiviteter fra /api/live (fasit pakke 59: Live Activities.dc.html).
// Ingen Swift-kompilator i sandkassen: kildesjekker (struktur, tekster, API-stier, mål fra fasiten og klammebalanse).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS = join(ROOT, 'apps/ios');
const raw = (f) => readFileSync(join(IOS, f), 'utf8');
/** Uten linjekommentarer. */
const code = (f) => raw(f).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('///')).join('\n');

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Liten Swift-lekser (som i p87/p88): nestede blokk-kommentarer, strenger med interpolasjon, så klammebalanse. */
function lex(src) {
  let out = ''; let i = 0; const n = src.length;
  function str() {
    while (i < n) {
      const c = src[i];
      if (c === '"') { i++; return ''; }
      if (c === '\n') return 'uavsluttet streng';
      if (c === '\\' && src[i + 1] === '(') {
        i += 2; let d = 1; out += '(';
        while (i < n && d > 0) {
          if (src[i] === '"') { i++; const e = str(); if (e) return e; continue; }
          if (src[i] === '(') d++; else if (src[i] === ')') d--;
          i++;
        }
        out += ')';
        continue;
      }
      i += c === '\\' ? 2 : 1;
    }
    return 'uavsluttet streng';
  }
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      let d = 1; i += 2;
      while (i < n && d > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { d++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { d--; i += 2; } else i++;
      }
      if (d > 0) return 'uavsluttet blokk-kommentar';
      continue;
    }
    if (c === '"') { i++; const e = str(); if (e) return e + ' ved linje ' + src.slice(0, i).split('\n').length; out += '""'; continue; }
    out += c; i++;
  }
  const st = []; const pair = { '}': '{', ')': '(', ']': '[' };
  let line = 1;
  for (const ch of out) {
    if (ch === '\n') line++;
    else if ('{(['.includes(ch)) st.push(ch);
    else if (ch in pair && st.pop() !== pair[ch]) return 'feil ' + ch + ' ved linje ' + line;
  }
  return st.length ? 'ulukket ' + st[st.length - 1] : '';
}

const NEW = ['FinansHub/Sources/Login89.swift', 'FinansHub/Sources/Live89Host.swift', 'Shared/Live89.swift',
  'FinansHubWidgets/Sources/Live89Live.swift', 'SharedKal/Core/KalSrv89Core.swift', 'Kalender/Sources/KalLogin89.swift',
  'KalenderMac/Sources/MacLogin89.swift'];
const CHANGED = ['FinansHub/Sources/Store.swift', 'FinansHub/Sources/Server41.swift', 'FinansHub/Sources/PaperGate.swift',
  'FinansHub/Sources/App.swift', 'FinansHub/Sources/Notify31.swift', 'FinansHub/Sources/Paper17.swift', 'Shared/Plat51Intents.swift',
  'FinansHubWidgets/Sources/Plat51Live.swift', 'Kalender/Sources/KalLogin41.swift', 'Kalender/Sources/KalStore.swift',
  'KalenderMac/Sources/MacLogin.swift', 'KalenderMac/Sources/MacStore.swift'];

/* ---------- 1. Domenet ---------- */

// Den gamle stavemåten bygges av deler, så den aldri står hel i kildekoden (p89-web søker i hele repoet).
const OLD_RE = new RegExp('smarthjem' + 'experten', 'i');

test('domenet: ingen gammel stavemåte igjen i iOS-appene; ny standard i konstanter og project.yml', () => {
  const bad = walk(IOS).filter((p) => /\.(swift|yml|plist|json|md|entitlements)$/.test(p)).filter((p) => OLD_RE.test(readFileSync(p, 'utf8')));
  assert.deepEqual(bad, []);
  assert.match(raw('FinansHub/Sources/Server41.swift'), /return "https:\/\/os\.smarthjemeksperten\.no"/);
  assert.match(raw('SharedKal/Core/KalAuth41Core.swift'), /static let standardExternal47: String = "https:\/\/os\.smarthjemeksperten\.no"/);
  assert.match(raw('SharedKal/Core/KalAuth41Core.swift'), /static let standardLocal47: String = "http:\/\/10\.69\.1\.39:3000"/);
  const yml = raw('project.yml');
  assert.equal((yml.match(/HomelabServer: https:\/\/os\.smarthjemeksperten\.no/g) || []).length, 2);
  assert.equal((yml.match(/KalDefaultServer41: "https:\/\/os\.smarthjemeksperten\.no"/g) || []).length, 2);
  assert.match(yml, /HomelabLocal47: http:\/\/10\.69\.1\.39:3000/);
  // ATS: bare lokalt nett (ikke slått av globalt).
  assert.doesNotMatch(yml, /NSAllowsArbitraryLoads/);
  assert.match(raw('KalenderMac/Sources/MacLogin.swift'), /os\.smarthjemeksperten\.no eller 10\.69\.1\.39:3000/);
  // Ingen nye targets.
  assert.doesNotMatch(yml, /89/);
});

test('migrering: bare nøyaktig den gamle standarden skrives om (Homelab, Kalender, Mac)', () => {
  const l = code('FinansHub/Sources/Login89.swift');
  assert.match(l, /static let oldExternal: String = "https:\/\/os\.smarthjem" \+ "experten\.no"/);
  assert.match(l, /return s\.lowercased\(\) == oldExternal \? newExternal : nil/);
  assert.match(l, /for k in \[extKey, "hl41_manual_server"\]/);
  assert.match(l, /if let v = Keychain\.get\("server"\), let n = fixed\(v\) \{ Keychain\.set\("server", n\) \}/);
  assert.match(l, /g\.string\(forKey: "kal41\.external"\), let n = fixed\(v\)/);
  assert.match(l, /b\.server = fix\(a\.server\)\n\s+b\.external = fix\(a\.external\)/);
  const st = code('FinansHub/Sources/Store.swift');
  const load = st.slice(st.indexOf('private static func loadAccounts()'), st.indexOf('private func saveAccounts()'));
  assert.ok(load.indexOf('Server89.migrate()') > 0 && load.indexOf('Server89.migrate()') < load.indexOf('Keychain.get("accounts")'), 'migrering før kontoene leses');
  assert.match(load, /let fixed: \[LoginAccount\] = Server89\.migrateAccounts\(list\)\n\s+if fixed != list/);
  const k = code('SharedKal/Core/KalSrv89Core.swift');
  assert.match(k, /static let oldExternal: String = "https:\/\/os\.smarthjem" \+ "experten\.no"/);
  assert.match(k, /for k in \["kal41\.manual", "kal\.lastServer"\]/);
  assert.match(k, /for k in \["kal41\.external", "kal47\.defExt", "kal\.server"\]/);
  assert.match(k, /for k in \["kal\.bases", "kal41\.local"\]/);
  assert.match(code('Kalender/Sources/KalStore.swift'), /init\(\) \{\n\s+KalSrv89\.migrate\(\)/);
  assert.match(code('KalenderMac/Sources/MacStore.swift'), /init\(\) \{\n\s+KalSrv89\.migrate\(\)\n\s+MacLogin89\.migrate\(\)/);
  assert.match(code('KalenderMac/Sources/MacLogin89.swift'), /u\.string\(forKey: "mac\.lastServer"\), let n = KalSrv89\.fixed\(v\)/);
});

test('migrering (samme regel i JS): nøyaktig gammel standard → ny, egendefinert urørt', () => {
  // Speiler Server89.fixed / KalSrv89.fixed: mellomrom og avsluttende / fjernes, sammenlignes uten store bokstaver.
  const OLD = 'https://os.smarthjem' + 'experten.no';
  const clean = (s) => { let x = s.trim().replace(/ /g, ''); while (x.endsWith('/')) x = x.slice(0, -1); return x; };
  const fixed = (s) => { const x = clean(s); if (!x) return null; return x.toLowerCase() === OLD ? 'https://os.smarthjemeksperten.no' : null; };
  assert.equal(fixed(OLD), 'https://os.smarthjemeksperten.no');
  assert.equal(fixed(OLD + '/'), 'https://os.smarthjemeksperten.no');
  assert.equal(fixed(' ' + OLD + ' '), 'https://os.smarthjemeksperten.no');
  assert.equal(fixed(OLD + ':8443'), null);
  assert.equal(fixed('https://home.kristo.no'), null);
  assert.equal(fixed('http://10.69.1.39:3000'), null);
  assert.equal(fixed(''), null);
});

/* ---------- 2. Tannhjulet ---------- */

test('Homelab: tannhjul (gearshape, 44×44) øverst til høyre → arket «Server» med begge felt, test, tilbakestill, lagre/avbryt', () => {
  const l = code('FinansHub/Sources/Login89.swift');
  assert.match(l, /Image\(systemName: "gearshape"\)/);
  assert.match(l, /\.frame\(width: 44, height: 44\)/);
  assert.match(l, /\.accessibilityLabel\("Server"\)/);
  assert.match(l, /Text\("Server"\)\.font\(PF\.serif\(26, medium: true\)\)/);
  assert.match(l, /field\("Ekstern adresse", Server47\.defaultExternal, \$external, extResult\)/);
  assert.match(l, /field\("Lokal adresse", Server47\.defaultLocal, \$local, locResult\)/);
  assert.match(l, /\.keyboardType\(\.URL\)/);
  assert.match(l, /"Test tilkobling"/);
  assert.match(l, /URL\(string: s \+ "\/api\/health"\)/);
  assert.match(l, /"Tilkoblet · \\\(ms\) ms"/);
  assert.match(l, /Circle\(\)\.fill\(r\.ok \? p\.pos : p\.lab\)/);
  assert.match(l, /Text\("Tilbakestill til standard"\)/);
  assert.match(l, /external = Server47\.defaultExternal\n\s+local = Server47\.defaultLocal/);
  assert.match(l, /PLineButton\(title: "Avbryt"/);
  assert.match(l, /PInkButton\(title: "Lagre"/);
  // Validering: http(s)://, mellomrom og avsluttende / fjernes.
  assert.match(l, /s = s\.replacingOccurrences\(of: " ", with: ""\)\n\s+while s\.hasSuffix\("\/"\) \{ s\.removeLast\(\) \}/);
  assert.match(l, /if !\(l\.hasPrefix\("http:\/\/"\) \|\| l\.hasPrefix\("https:\/\/"\)\) \{ return false \}/);
  assert.match(l, /"Ekstern adresse må starte med http:\/\/ eller https:\/\/"/);
  const g = code('FinansHub/Sources/PaperGate.swift');
  assert.match(g, /\.overlay\(alignment: \.topTrailing\) \{\n\s+if store\.pending == nil && Sec51Model\.shared\.wait == nil \{\n\s+Login89Gear\(\)/);
  assert.match(g, /\.login89Host\(p\)/);
  // «Server: os.smarthjemeksperten.no» under knappen.
  const form = g.slice(g.indexOf('private func form('), g.indexOf('private func twoFactor('));
  assert.ok(form.indexOf('Login89ServerLine()') > form.indexOf('PInkButton(title: store.busy'), 'under innloggingsknappen');
  assert.match(l, /Text\("Server: " \+ Server89\.displayHost\(store\)\)\n\s+\.font\(PF\.ui\(12\.5\)\)\.foregroundStyle\(p\.mut\)/);
  // Feilkortet «Endre serveradresse» åpner samme ark.
  assert.match(code('FinansHub/Sources/Server41.swift'), /Button \{ Login89Model\.shared\.open = true \} label: \{\n\s+Text\("Endre serveradresse"\)/);
});

test('Homelab: én felles lagring med Innstillinger → Server', () => {
  const l = code('FinansHub/Sources/Login89.swift');
  assert.match(l, /Server89\.remember\(local: l, external: e\)/);
  assert.match(l, /if store\.account != nil \{\n\s+store\.updateAddresses\(local: l, external: e\)\n\s+s41\.push\(store\)/);
  assert.match(l, /if let a = store\.account \{\n\s+external = a\.external\.isEmpty \? a\.server : a\.external\n\s+local = a\.local/);
  const st = code('FinansHub/Sources/Store.swift');
  const upd = st.slice(st.indexOf('func updateAddresses('), st.indexOf('private func resolveBase()'));
  assert.match(upd, /Server89\.remember\(local: a\.local, external: a\.external\.isEmpty \? a\.server : a\.external\)/);
  assert.match(st, /local: same\?\.local \?\? seed\.local, external: same\?\.external \?\? seed\.external/);
  // Innloggingen prøver lagret lokal adresse og den lagrede eksterne (manual) før kjente kontoer, så standardene.
  const c = code('FinansHub/Sources/Server41.swift');
  const cand = c.slice(c.indexOf('func candidates('), c.indexOf('func pick('));
  assert.ok(cand.indexOf('add(Server89.savedLocal)') < cand.indexOf('add(manual)'));
  assert.ok(cand.indexOf('add(Server47.defaultLocal)') < cand.indexOf('add(Server41.defaultServer)'));
});

test('Kalender (iOS): tannhjul og arket «Server» med samme lagring som Innstillinger → Server', () => {
  const v = code('Kalender/Sources/KalLogin89.swift');
  assert.match(v, /Image\(systemName: "gearshape"\)/);
  assert.match(v, /\.frame\(width: 44, height: 44\)/);
  assert.match(v, /field\("Ekstern adresse", KalSrv47\.standardExternal, \$external, extText, extOk\)/);
  assert.match(v, /field\("Lokal adresse", KalSrv47\.standardLocal, \$local, locText, locOk\)/);
  assert.match(v, /\.keyboardType\(\.URL\)/);
  assert.match(v, /"Test tilkobling"/);
  assert.match(v, /Text\("Tilbakestill til standard"\)/);
  assert.match(v, /KalPill\(title: "Avbryt"/);
  assert.match(v, /KalPill\(title: busy \? "Lagrer …" : "Lagre"/);
  assert.match(v, /foregroundStyle\(ok \? t\.green : t\.red\)/);
  assert.match(v, /Text\("Server: " \+ m\.server89\)/);
  const k = code('SharedKal/Core/KalSrv89Core.swift');
  assert.match(k, /URL\(string: s \+ "\/api\/health"\)/);
  assert.match(k, /if loggedIn \{ return await KalSrv47\.save\(external: ext, local: loc, device: device\) \}\n\s+KalSrv47\.storeLocally\(external: ext, local: loc\)/);
  assert.match(k, /static var external: String \{ KalServer41\.external \}/);
  const l = code('Kalender/Sources/KalLogin41.swift');
  assert.match(l, /KalLogin89Gear\(\)\.padding\(\.trailing, 8\)/);
  assert.match(l, /KalLogin89Sheet\(\)\.environment\(\\\.kal, t\)/);
  assert.equal((l.match(/KalLogin89Line\(\)/g) || []).length, 2);
  assert.match(l, /m\.gear89 = true/);
});

test('Kalender for Mac: tannhjul og arket «Server», feltet fylles med standarden', () => {
  const v = code('KalenderMac/Sources/MacLogin89.swift');
  assert.match(v, /Image\(systemName: "gearshape"\)/);
  assert.match(v, /\.frame\(width: 44, height: 44\)/);
  assert.match(v, /"Test tilkobling"/);
  assert.match(v, /MacPill\(title: "Tilbakestill til standard"/);
  assert.match(v, /MacPill\(title: "Avbryt"/);
  assert.match(v, /return v\.isEmpty \? KalSrv89\.external : v/);
  const l = code('KalenderMac/Sources/MacLogin.swift');
  assert.match(l, /@State private var server: String = MacLogin89\.initialServer/);
  assert.match(l, /MacLogin89Gear \{ serverSheet = true \}/);
  assert.match(l, /Text\("Server: " \+ KalSrv89\.host/);
  // Mac-nøkkelen ligger i Mac-målet (SharedKal\/Core har bare kal*-nøkler, se p84).
  assert.doesNotMatch(code('SharedKal/Core/KalSrv89Core.swift'), /mac\./);
});

/* ---------- 3. Live Activities ---------- */

test('Live Activities: bygger på Plat51Attributes; ContentState leser API-feltene (Akt) og egne nøkler', () => {
  const s = code('Shared/Plat51Intents.swift');
  assert.match(s, /struct Plat51Attributes: ActivityAttributes \{/);
  assert.equal((s.match(/ActivityAttributes/g) || []).length, 1, 'ingen ny ActivityAttributes');
  assert.match(s, /case tittel, undertittel, verdi, status, start, slutt, segmenter, handlinger/);
  assert.match(s, /state = st1 \?\? Live89\.state\(st2 \?\? ""\)/);
  assert.match(s, /endAt = e1 \?\? Live89\.unix\(e2 \?\? ""\)/);
  assert.match(s, /segTotal = n1 \?\? seg\?\.antall \?\? 0/);
  assert.match(s, /actions = \(b1 \?\? b2 \?\? \[\]\)\.filter/);
  assert.match(s, /progress = p\.map \{ \(x: Double\) -> Double in x < 0 \? -1 : Swift\.min\(1, x\) \} \?\? -1/);
  // Push-to-start: attributes {type, id} eller {kind, key, color}.
  assert.match(s, /case kind, key, color, type, id/);
  // Gamle pakker/nedlastinger fra Plat51 bare når serveren mangler /api/live.
  assert.equal((s.match(/if Live89Sync\.serverHasLive \{ return \}/g) || []).length, 2);
  const l = code('Shared/Live89.swift');
  assert.match(l, /static let types: \[String\] = \["nedlasting", "backup", "spiller", "avtale", "pakke"\]/);
  assert.match(l, /static let actionIds: \[String\] = \["pause", "fortsett", "stopp", "rute", "utsett"\]/);
  assert.match(l, /case "pause": return "paused"\n\s+case "ferdig": return "done"/);
});

test('Live Activities: farger, symboler og avslutning etter fasiten', () => {
  const l = code('Shared/Live89.swift');
  for (const [t, hex] of [['nedlasting', '#5ac8fa'], ['backup', '#30d158'], ['spiller', '#ffb340'], ['avtale', '#ff6a4d'], ['pakke', '#bf8cff']]) {
    assert.match(l, new RegExp(`case "${t}": return "${hex}"`), t);
  }
  assert.match(l, /case "pakke": return now\.addingTimeInterval\(30 \* 60\)/);
  assert.match(l, /case "avtale": return endAt > now\.timeIntervalSince1970 \? Date\(timeIntervalSince1970: endAt\) : now/);
  assert.match(l, /default: return now\.addingTimeInterval\(15 \* 60\)/);
  assert.match(l, /let policy: ActivityUIDismissalPolicy = when\.timeIntervalSinceNow > 1 \? \.after\(when\) : \.immediate/);
});

test('Live Activities: polling (GET /api/live/aktiviteter), knapper (POST /api/live/handling) og tokens (POST /api/live/tokens)', () => {
  const l = code('Shared/Live89.swift');
  assert.match(l, /Plat51Net\.request\("GET", "\/api\/live\/aktiviteter", timeout: 10\)/);
  assert.match(l, /Plat51Net\.request\("POST", "\/api\/live\/handling", body: \["id": id, "handling": handling\], timeout: 12\)/);
  assert.match(l, /struct Live89ActionIntent: LiveActivityIntent \{/);
  assert.match(l, /_ = await Live89Sync\.act\(id, handling\)/);
  assert.match(l, /if !Live89\.validId\(id\) \|\| !Live89\.isNew\(type\) \|\| !Live89\.on\(type\) \{ continue \}/);
  assert.match(l, /if fast \{ return 5 \}/, 'nedlasting\/backup hvert 5. s');
  assert.match(l, /pushType: \.token\)\n\s+\} catch \{\n\s+made = try\? Activity<Plat51Attributes>\.request\(attributes: attr, content: content\(st, kind: kind\), pushType: nil\)/);
  assert.match(l, /if a\.content\.state != st \{ await a\.update/);
  const h = code('FinansHub/Sources/Live89Host.swift');
  assert.match(h, /Activity<Plat51Attributes>\.pushToStartTokenUpdates/);
  assert.match(h, /if #available\(iOS 17\.2, \*\) \{/);
  assert.match(h, /await post\(d, kind: "pushtostart", id: nil, type: nil\)/);
  assert.match(h, /await post\(d, kind: "liveactivity", id: key, type: kind\)/);
  assert.match(h, /\["platform": "ios", "kind": kind, "token": hex\]/);
  assert.match(h, /body\["aktivitetId"\] = id/);
  assert.match(h, /Plat51Net\.request\("POST", "\/api\/live\/tokens", body: body, timeout: 15\)/);
  // Appen: løkke mens aktiv, bakgrunnshenting, «Vis rute».
  assert.match(code('FinansHub/Sources/App.swift'), /\.live89Host\(\)/);
  assert.match(code('FinansHub/Sources/App.swift'), /if Live89Link\.handle\(u, store\) \{ return \}\n\s+store\.openDeepLink\(u\)/);
  assert.match(code('FinansHub/Sources/Notify31.swift'), /await Live89Model\.background\(\)/);
  assert.match(h, /content\.task\(id: key\) \{\n\s+await Live89Model\.shared\.run\(store, active: phase == \.active\)/);
  assert.match(h, /if s == "https" \|\| s == "maps" \|\| s == "comgooglemaps" \{ return u \}/);
  // Ingen nøkler i appen.
  assert.doesNotMatch(h + l, /\.p8|BEGIN PRIVATE KEY|apns-topic/i);
});

test('Live Activities: visningene etter fasiten (låseskjerm, kompakt, minimal, utvidet, StandBy)', () => {
  const v = code('FinansHubWidgets/Sources/Live89Live.swift');
  assert.match(v, /static let background: Color = Color\(white: 0\.11\)\.opacity\(0\.86\)/);
  assert.match(v, /\.padding\(\.horizontal, 16\)\.padding\(\.vertical, 14\)/);
  assert.match(v, /Live89Tile\(kind: attr\.kind, st: st, size: 40\)/);
  assert.match(v, /\.background\(ac\.opacity\(0\.18\)/);
  assert.match(v, /Text\(st\.title\)\.font\(\.system\(size: 17, weight: \.semibold\)\)/);
  assert.match(v, /Text\(st\.sub\)\.font\(\.system\(size: 13\)\)/);
  assert.match(v, /\.font\(\.system\(size: 22, weight: \.semibold\)\)\.monospacedDigit\(\)/);
  assert.match(v, /Capsule\(\)\.fill\(i < st\.segDone \? ac : Live89Look\.track\)\.frame\(height: 6\)/);
  assert.match(v, /\.frame\(height: 40\)/);
  assert.match(v, /Button\(intent: Live89ActionIntent\(id: attr\.key, handling: b\.id\)\)/);
  assert.match(v, /Link\(destination: Live89\.routeLink\(attr\.key\)\)/);
  assert.match(v, /Text\(timerInterval: st\.startDate\.\.\.st\.endDate, countsDown: false\)/);
  assert.match(v, /ProgressView\(timerInterval: Live89Look\.hourRange\(st\)/);
  assert.match(v, /\.progressViewStyle\(\.circular\)\.tint\(ac\)/);
  assert.match(v, /@Environment\(\\\.isLuminanceReduced\) private var dim/);
  assert.match(v, /\.font\(\.system\(size: 64, weight: \.semibold\)\)\.monospacedDigit\(\)/);
  assert.match(v, /\.background\(Color\.black\)/);
  // Utvidet: aldri bredere enn skjermen (ingen faste bredder over 326 − 24).
  for (const m of v.matchAll(/\.frame\((?:maxW|w)idth: (\d+)/g)) assert.ok(Number(m[1]) <= 302, m[0]);
  const w = code('FinansHubWidgets/Sources/Plat51Live.swift');
  assert.match(w, /Live89Tile\(kind: ctx\.attributes\.kind, st: ctx\.state, size: 44\)/);
  assert.match(w, /\.font\(\.system\(size: 26, weight: \.semibold\)\)\.monospacedDigit\(\)/);
  assert.match(w, /Live89ExpandedBottom\(attr: ctx\.attributes, st: ctx\.state\)/);
  assert.match(w, /Live89Ring\(kind: ctx\.attributes\.kind, st: ctx\.state\)/);
  assert.match(w, /\.activityBackgroundTint\(Live89Look\.background\)/);
  assert.match(w, /Live89\.link\(ctx\.state\.url, kind: ctx\.attributes\.kind\)/);
  for (const m of w.matchAll(/\.frame\((?:maxW|w)idth: (\d+)/g)) assert.ok(Number(m[1]) <= 302, m[0]);
  assert.match(code('FinansHubWidgets/Sources/Widgets.swift'), /Plat51LiveWidget\(\)/);
});

test('Innstillinger → Varsler → Live Activities: én bryter per aktivitet, backup bare for admin', () => {
  const h = code('FinansHub/Sources/Live89Host.swift');
  assert.match(h, /PLabel\(text: "Live Activities"\)/);
  assert.match(h, /store\.api\.callAt\("\/api", "GET", "\/live\/innstillinger", timeout: 10\)/);
  assert.match(h, /store\.api\.callAt\("\/api", "PUT", "\/live\/innstillinger", json: body, timeout: 10\)/);
  assert.match(h, /t != "backup" \|\| Update28Model\.isAdmin\(store\)/);
  assert.match(h, /if !on \{ await Live89Sync\.endAll\(type\) \}/);
  const p = code('FinansHub/Sources/Paper17.swift');
  const n = p.slice(p.indexOf('struct PaperNotifySettings'), p.indexOf('private var sep: some View', p.indexOf('struct PaperNotifySettings')));
  assert.match(n, /Live89Settings\(\)\n\s+PaperLinkList/);
});

/* ---------- 4. Filene ---------- */

test('nye og endrede Swift-filer: klammebalanse, ingen tvungen utpakking, iOS 17.2-API bak #available', () => {
  for (const f of [...NEW, ...CHANGED]) assert.equal(lex(raw(f)), '', f);
  for (const f of NEW) {
    assert.doesNotMatch(code(f), /try!|as!|fatalError\(|\.first!|\.last!|\)!\s/, f);
    assert.doesNotMatch(raw(f), /\/\*[^\n]*\/\*/, f);
    const ifs = (raw(f).match(/^\s*#if\b/gm) || []).length;
    const ends = (raw(f).match(/^\s*#endif\b/gm) || []).length;
    assert.equal(ifs, ends, `#if/#endif i ${f}`);
  }
  // SharedKal/Core bygges også i Mac-widgetene: bare Foundation.
  assert.doesNotMatch(raw('SharedKal/Core/KalSrv89Core.swift'), /import (SwiftUI|UIKit|AppKit)/);
  // ActivityKit-koden i Shared er bak canImport (widgetene bygges også for Mac Catalyst-løse mål).
  const sh = raw('Shared/Live89.swift');
  assert.ok(sh.indexOf('#if canImport(ActivityKit)\nenum Live89Sync') > 0);
});
