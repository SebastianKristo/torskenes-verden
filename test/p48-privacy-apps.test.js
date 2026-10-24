// Prompt 48 (PRIV48): statisk personverntest av appene (iOS/Swift og Android/Kotlin) for kvitteringsflyten.
// Testen sjekker EGENSKAPER, ikke eksakte linjer, så den virker både mot dagens kode og mot koden IOS48/ANDROID48 skriver nå:
//  1. Ingen tredjeparts AI-/OCR-tjenester er hardkodet noe sted i appene (Gemini, OpenAI, Groq, Roboflow, Google Cloud Vision,
//     Brønnøysund …), og ingen sky-AI-SDK-er (Gemini/Firebase AI/Vertex AI/OpenAI/ML Kit GenAI) er importert eller avhengigheter.
//  2. Kvitteringsflyten (filene som leser, tolker eller laster opp kvitteringer) sender bare til den innloggede Homelab-serveren:
//     endepunktene er relative stier, og ingen ekstern vert står i de egne kvitteringsfilene.
//  3. OCR og tolkning på enheten er on-device: Vision/VisionKit og Foundation Models (bak #if canImport) på iOS, ML Kit
//     tekstgjenkjenning/dokumentskanner (on-device-artefakter) på Android.
//  4. Bryterne for OCR og tolkning på enheten («Tolk kvitteringer på iPhone», «Les teksten på iPhone», «Les teksten på telefonen»
//     og evt. nye) er AV som standard, og ingen migrering slår dem på.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SKIP = new Set(['build', '.gradle', '.build', 'DerivedData', 'Pods', '.idea', 'node_modules', '.swiftpm', 'xcuserdata']);
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n)) continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => n.endsWith(e))) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p);
const read = (p) => readFileSync(p, 'utf8');
// Kommentarer fjernes (// … og /* … */), men ikke «//» inne i strenger (https://).
function code(src) {
  let out = '', i = 0, str = null;
  while (i < src.length) {
    const ch = src[i], nx = src[i + 1];
    if (str) {
      out += ch;
      if (ch === '\\') { out += nx ?? ''; i += 2; continue; }
      if (src.startsWith(str, i)) { out += str.slice(1); i += str.length; str = null; continue; }
      if (str === '"' && ch === '\n') str = null;
      i++; continue;
    }
    if (src.startsWith('"""', i)) { str = '"""'; out += '"""'; i += 3; continue; }
    if (ch === '"') { str = '"'; out += ch; i++; continue; }
    if (ch === '/' && nx === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && nx === '*') { const e = src.indexOf('*/', i + 2); const chunk = src.slice(i, e < 0 ? src.length : e + 2); out += chunk.replace(/[^\n]/g, ''); i = e < 0 ? src.length : e + 2; continue; }
    out += ch; i++;
  }
  return out;
}

const IOS = join(ROOT, 'apps/ios'), AND = join(ROOT, 'apps/android');
const swift = walk(IOS, ['.swift']);
const kotlin = walk(AND, ['.kt', '.kts']);
const buildFiles = [...walk(AND, ['.gradle', '.kts', '.toml', '.xml', '.properties']), ...walk(IOS, ['.yml', '.yaml', '.plist', '.pbxproj', '.resolved', 'Package.swift', '.entitlements'])];
const srcOf = new Map([...swift, ...kotlin].map((p) => [p, read(p)]));
const codeOf = new Map([...srcOf].map(([p, s]) => [p, code(s)]));

// Tredjeparts AI-/OCR-/oppslagstjenester (API-vertene) som kvitteringsdata aldri skal sendes til fra appene. Lenker til sidene der
// brukeren lager en nøkkel (app.roboflow.com, openrouter.ai/keys, aistudio.google.com) er ikke API-kall og er lov i AI-kontroll.
const FORBIDDEN_HOSTS = [/generativelanguage\.googleapis\.com/i, /aiplatform\.googleapis\.com/i, /vision\.googleapis\.com/i, /firebaseml\.googleapis\.com/i,
  /documentai\.googleapis\.com/i, /firebasevertexai\.googleapis\.com/i, /api\.openai\.com/i, /api\.groq\.com/i, /(?:detect|api|infer|serverless|classify|outline|segment)\.roboflow\.com/i, /data\.brreg\.no/i,
  /openrouter\.ai\/api/i, /api\.anthropic\.com/i, /api\.mistral\.ai/i, /api\.cohere\.ai/i, /cognitiveservices\.azure\.com/i, /api\.ocr\.space/i,
  /api\.mindee\.net/i, /api\.veryfi\.com/i, /api\.taggun\.io/i, /textract\.[a-z0-9-]+\.amazonaws\.com/i];
const FORBIDDEN_SWIFT_IMPORTS = /^\s*(?:@preconcurrency\s+)?import\s+(GoogleGenerativeAI|GoogleAI|FirebaseAI|FirebaseVertexAI|FirebaseMLModelDownloader|FirebaseML\w*|OpenAI|SwiftOpenAI|Anthropic\w*|MLKitTextRecognition\w*Cloud|AWSTextract|GoogleCloud\w*)\b/m;
const FORBIDDEN_KOTLIN_IMPORTS = /^\s*import\s+(com\.google\.ai\.client|com\.google\.firebase\.(ai|vertexai|ml)|com\.google\.mlkit\.genai|com\.google\.cloud|com\.google\.api\.services\.vision|com\.aallam\.openai|com\.openai|com\.anthropic|com\.roboflow|com\.amazonaws\.services\.textract)\b/m;
const FORBIDDEN_DEPS = /["'](com\.google\.ai\.client\.generativeai|com\.google\.firebase:firebase-(ai|vertexai|ml-\w+)|com\.google\.mlkit:genai[\w-]*|com\.google\.cloud:|com\.aallam\.openai|com\.openai:|com\.anthropic:|com\.google\.apis:google-api-services-vision)[^"']*["']/;
// ML Kit-artefakter som kjører på enheten (godkjent: tekstgjenkjenning, dokumentskanner, strekkoder/kodeskanner).
const MLKIT_ON_DEVICE = /^(com\.google\.mlkit:(text-recognition[\w-]*|barcode-scanning)|com\.google\.android\.gms:play-services-(mlkit-(text-recognition[\w-]*|document-scanner|barcode-scanning)|code-scanner))$/;

/* ---------------- Kvitteringsflyten: hvilke filer ---------------- */

const FLOW_MARK = /VNRecognizeTextRequest|VNDocumentCameraViewController|DataScannerViewController|LanguageModelSession|@Generable|TextRecognition\.getClient|GmsDocumentScanning|device_ocr|device_parse|receipts\/scan|receipts\/ocr-text|receipts\/parsed|ReceiptOcrScanner|extractTextFromReceipt|["']\/receipts["']/;
const flowFiles = [...codeOf].filter(([, c]) => FLOW_MARK.test(c)).map(([p]) => p);
// Egne kvitteringsfiler (navnet sier det): her skal det ikke stå noen ekstern vert i det hele tatt.
const DEDICATED = /(receipt|rc4\d|kvitt|ocr|scan4\d|upload)/i;
const dedicated = flowFiles.filter((p) => DEDICATED.test(basename(p)));
// Store, delte filer (Store.swift, AppViewModel.kt …) har også andre funksjoner. Der godtas bare disse vertene, som er lenker og
// kartdata uten kvitteringsdata (åpne et nettsøk / en FINN-annonse i nettleseren, verdenskart). Ny vert her = vurder personvernet.
const SHARED_OK_HOSTS = new Set(['www.google.com', 'cdn.jsdelivr.net', 'www.finn.no']);
const PRIVATE = (h) => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(h);
// Brukerens egne Homelab-adresser (standard serveradresser i appene, f.eks. DEFAULT_EXTERNAL47). Hentes fra koden, ikke hardkodet her.
const OWN_HOSTS = new Set();
for (const c of codeOf.values()) for (const m of c.matchAll(/(?:DEFAULT_\w*|default\w*(?:Server|Url|URL|Host)\w*|\w*(?:Server|Base)(?:Url|URL)\w*)\s*(?::\s*\w+)?\s*=\s*"https?:\/\/([^/":]+)/g)) OWN_HOSTS.add(m[1].toLowerCase());
const hostsIn = (c) => [...c.matchAll(/"[^"\n]*?\bhttps?:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,}|\d+\.\d+\.\d+\.\d+|localhost)/g)].map((m) => m[1].toLowerCase());

test('kvitteringsflyten finnes i begge appene (testen ser på riktige filer)', () => {
  assert.ok(swift.length > 50 && kotlin.length > 50, 'fant kildene');
  const iosFlow = flowFiles.filter((p) => p.startsWith(IOS)), andFlow = flowFiles.filter((p) => p.startsWith(AND));
  assert.ok(iosFlow.length >= 2, `iOS-filer i kvitteringsflyten: ${iosFlow.map(rel)}`);
  assert.ok(andFlow.length >= 2, `Android-filer i kvitteringsflyten: ${andFlow.map(rel)}`);
  assert.ok(iosFlow.some((p) => /VNRecognizeTextRequest|DataScannerViewController/.test(codeOf.get(p))), 'iOS leser tekst med Vision');
  assert.ok(andFlow.some((p) => /TextRecognition\.getClient|com\.google\.mlkit\.vision\.text/.test(srcOf.get(p))), 'Android leser tekst med ML Kit');
});

/* ---------------- 1. Ingen tredjeparts AI/OCR i appene ---------------- */

test('ingen tredjeparts AI-/OCR-tjenester hardkodet i appene (kode, byggefiler, plist/manifest)', () => {
  const hits = [];
  for (const [p, c] of codeOf) for (const re of FORBIDDEN_HOSTS) if (re.test(c)) hits.push(`${rel(p)}: ${c.match(re)[0]}`);
  for (const p of buildFiles) { const c = read(p); for (const re of FORBIDDEN_HOSTS) if (re.test(c)) hits.push(`${rel(p)}: ${c.match(re)[0]}`); }
  assert.deepEqual(hits, []);
});

test('ingen sky-AI-SDK-er: ingen import av Gemini/Firebase AI/Vertex/OpenAI/ML Kit GenAI, og ingen slike avhengigheter', () => {
  const hits = [];
  for (const p of swift) { const m = codeOf.get(p).match(FORBIDDEN_SWIFT_IMPORTS); if (m) hits.push(`${rel(p)}: ${m[0].trim()}`); }
  for (const p of kotlin) { const m = codeOf.get(p).match(FORBIDDEN_KOTLIN_IMPORTS); if (m) hits.push(`${rel(p)}: ${m[0].trim()}`); }
  for (const p of buildFiles) { const m = read(p).match(FORBIDDEN_DEPS); if (m) hits.push(`${rel(p)}: ${m[0]}`); }
  assert.deepEqual(hits, []);
  // ML Kit: bare on-device-artefakter.
  const gradle = walk(AND, ['.gradle', '.gradle.kts', '.toml']).map((p) => [p, read(p)]);
  const ml = gradle.flatMap(([p, c]) => [...c.matchAll(/["'](com\.google\.(?:mlkit|android\.gms):[a-z0-9-]*(?:mlkit|scanner|text-recognition|barcode)[a-z0-9-]*)(?::[^"']*)?["']/g)].map((m) => [p, m[1]]));
  for (const [p, a] of ml) assert.match(a, MLKIT_ON_DEVICE, `${rel(p)}: ${a} er ikke en kjent on-device ML Kit-artefakt`);
});

/* ---------------- 2. Bare til den innloggede serveren ---------------- */

test('kvitteringsflyten sender bare til den innloggede Homelab-serveren: ingen ekstern vert i kvitteringsfilene, relative endepunkter', () => {
  const bad = [];
  for (const p of flowFiles) {
    const c = codeOf.get(p);
    for (const h of hostsIn(c)) {
      if (PRIVATE(h) || OWN_HOSTS.has(h)) continue;
      if (!dedicated.includes(p) && SHARED_OK_HOSTS.has(h)) continue;
      bad.push(`${rel(p)}: ${h}`);
    }
    // Kvitteringsendepunktene er relative stier (lagt til serverens adresse fra innloggingen), aldri en full adresse.
    for (const m of c.matchAll(/"([^"\n]*\/receipts(?:\/[^"\n]*)?)"/g)) if (/^https?:/i.test(m[1]) && !OWN_HOSTS.has(new URL(m[1]).hostname)) bad.push(`${rel(p)}: ${m[1]}`);
  }
  assert.deepEqual(bad, [], `eksterne verter i kvitteringsflyten (dedikerte: ${dedicated.map(rel).join(', ')})`);
  assert.ok(OWN_HOSTS.size >= 1, `fant standard serveradresser (${[...OWN_HOSTS]})`);
  // Opplastingen går via appens egen API-klient: kvitteringsendepunktene finnes, som relative stier.
  for (const [dir, name] of [[IOS, 'iOS'], [AND, 'Android']]) {
    const ep = flowFiles.filter((p) => p.startsWith(dir)).flatMap((p) => [...codeOf.get(p).matchAll(/"(\/?(?:finans\/api\/)?receipts(?:\/[a-z-]+)?)[/"?]/g)].map((m) => m[1]));
    assert.ok(ep.length > 0, `${name}: fant kvitteringsendepunkter (${ep})`);
  }
});

/* ---------------- 3. On-device ---------------- */

test('OCR og tolkning på enheten er on-device: Vision/VisionKit, Foundation Models bak #if canImport, ML Kit lokalt', () => {
  for (const p of swift) {
    const c = srcOf.get(p);
    if (!/^\s*import\s+FoundationModels\b/m.test(c)) continue;
    const before = c.slice(0, c.search(/^\s*import\s+FoundationModels\b/m));
    assert.match(before, /#if\s+canImport\(FoundationModels\)\s*$/m, `${rel(p)}: import FoundationModels må stå bak #if canImport(FoundationModels)`);
  }
  // Ingen sky-variant av tekstgjenkjenning (Firebase ML cloud) eller Private Cloud-AI i kvitteringsflyten.
  for (const p of flowFiles) assert.doesNotMatch(codeOf.get(p), /getCloudTextRecognizer|cloudTextRecognizer|FirebaseVision|CloudTextRecognizerOptions/, rel(p));
  // Android: ML Kit tekstgjenkjenning brukes via TextRecognition (on-device), ikke via egne HTTP-kall.
  for (const p of flowFiles.filter((x) => x.startsWith(AND) && /com\.google\.mlkit\.vision\.text/.test(srcOf.get(x)))) {
    assert.doesNotMatch(codeOf.get(p), /HttpURLConnection|OkHttpClient\(\)\.newCall\(Request\.Builder\(\)\.url\("http/, `${rel(p)}: OCR-filen gjør ikke egne nettkall`);
  }
});

/* ---------------- 4. Bryterne er av som standard ---------------- */

const ON_DEVICE_KEY = /(ocr|parse|tolk|on_?device|ondevice|device_?(ocr|parse)|fm\b|_fm|fm_)/i;
function iosToggleKeys() {
  const keys = [];
  for (const p of swift) {
    const c = codeOf.get(p), s = srcOf.get(p);
    if (!/kvittering|receipt|Rc4\d|Receipt4\d/i.test(s)) continue;
    for (const m of c.matchAll(/static\s+let\s+(\w+)\s*(?::\s*String)?\s*=\s*"([^"\s]+)"/g)) {
      const [, ident, value] = m;
      if (!ON_DEVICE_KEY.test(ident) && !ON_DEVICE_KEY.test(value)) continue;
      if (!new RegExp(`(?:bool|object|set)\\([^)]*forKey:\\s*(?:\\w+\\.)?${ident}\\b`).test(c) && !new RegExp(`forKey:\\s*"${value}"`).test(c)) continue;
      // Typen nøkkelen står i (Receipt47.key, Receipt48Flow.ocrKey …), så et generisk navn som «key» ikke treffer andre typer.
      const type = [...c.slice(0, m.index).matchAll(/\b(?:enum|struct|class|extension|actor)\s+(\w+)/g)].at(-1)?.[1] ?? null;
      keys.push({ file: p, ident, value, type });
    }
    for (const m of c.matchAll(/@AppStorage\("([^"]+)"\)\s*(?:private\s+)?var\s+(\w+)\s*(?::\s*Bool)?\s*=\s*(true|false)/g)) if (ON_DEVICE_KEY.test(m[1]) || ON_DEVICE_KEY.test(m[2])) keys.push({ file: p, ident: m[2], value: m[1], appStorage: m[3] });
  }
  return keys;
}
function androidToggleKeys() {
  const keys = new Map();
  for (const p of kotlin) {
    const c = codeOf.get(p);
    for (const m of c.matchAll(/const\s+val\s+(\w+)\s*=\s*"([^"\s/]+)"/g)) if (/OCR|PARSE|TOLK|ON_?DEVICE|DEVICE_?(OCR|PARSE)|MLKIT/i.test(m[1]) && !/URL|HOST|PATH|ENDPOINT|MIME/i.test(m[1])) keys.set(m[1], { file: p, ident: m[1], value: m[2] });
    // Brytere med tekst om lesing/tolkning på telefonen: nøkkelen i flag(…)/pref(…).
    for (const m of c.matchAll(/Toggle\(\s*"([^"]*(?:på telefonen|på enheten|Tolk kvittering|Les teksten)[^"]*)"[^\n]*?\b(?:flag|bool|pref)\(\s*([\w.]+|"[^"]+")/g)) {
      const k = m[2].replace(/^.*\./, '');
      if (!keys.has(k)) keys.set(k, { file: p, ident: k.startsWith('"') ? null : k, value: k.startsWith('"') ? k.slice(1, -1) : null, label: m[1] });
    }
  }
  return [...keys.values()];
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('iOS: «Tolk kvitteringer på iPhone», «Les teksten på iPhone» (og evt. nye) er av som standard og slås ikke på av noen migrering', () => {
  const keys = iosToggleKeys();
  assert.ok(keys.length >= 1, 'fant bryternøklene');
  assert.ok(keys.some((k) => /rc47|fm|tolk|parse|on_?device/i.test(`${k.ident} ${k.value}`)), `bryteren for tolkning på iPhone (${keys.map((k) => k.value)})`);
  const all = [...codeOf].map(([p, c]) => [p, c]);
  const bad = [];
  for (const k of keys) {
    if (k.appStorage === 'true') bad.push(`${rel(k.file)}: @AppStorage("${k.value}") = true`);
    for (const [p, c] of all) {
      // Referanser: strengen, Type.ident overalt, og bare «ident» i samme fil (inne i typen).
      const refs = [`"${esc(k.value)}"`, k.type ? `\\b${esc(k.type)}\\.${esc(k.ident)}\\b` : null, p === k.file || !k.type ? `(?<![\\w.])${esc(k.ident)}\\b` : null].filter(Boolean).join('|');
      for (const m of c.matchAll(new RegExp(`\\.set\\(\\s*true\\s*,\\s*forKey:\\s*(?:${refs})`, 'g'))) bad.push(`${rel(p)}: ${m[0]} (slår på bryteren)`);
      for (const m of c.matchAll(new RegExp(`(?:${refs})[^\\n]*\\?\\?\\s*true`, 'g'))) bad.push(`${rel(p)}: ${m[0]} (standard på)`);
      for (const m of c.matchAll(/register\(defaults:\s*\[([\s\S]*?)\]\s*\)/g)) if (new RegExp(`(?:${refs})\\s*:\\s*true`).test(m[1])) bad.push(`${rel(p)}: register(defaults:) med ${k.value}: true`);
      for (const m of c.matchAll(new RegExp(`@AppStorage\\(\\s*(?:${refs})\\s*\\)[^\\n=]*=\\s*true`, 'g'))) bad.push(`${rel(p)}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], `nøkler: ${keys.map((k) => `${k.ident}=${k.value}`).join(', ')}`);
});

test('Android: «Les teksten på telefonen» (og evt. nye brytere for lesing/tolkning på telefonen) er av som standard og slås ikke på av noen migrering', () => {
  const keys = androidToggleKeys();
  assert.ok(keys.length >= 1, 'fant bryternøklene');
  const bad = [];
  for (const k of keys) {
    const refs = [k.ident ? `(?:\\w+\\.)?\\b${esc(k.ident)}\\b` : null, k.value ? `"${esc(k.value)}"` : null].filter(Boolean).join('|');
    for (const [p, c] of codeOf) {
      if (!p.endsWith('.kt')) continue;
      // Lesing med standard true: flag(K, true), bool(K, true), getBoolean(K, true), pref(K, true) …
      for (const m of c.matchAll(new RegExp(`\\b(?:flag|bool|getBoolean|boolean|pref|optBoolean)\\(\\s*(?:${refs})\\s*,\\s*(?:def\\s*=\\s*)?true\\s*\\)`, 'g'))) bad.push(`${rel(p)}: ${m[0]} (standard på)`);
      // Migrering/oppstart som slår på: setPref(K, true), putBoolean(K, true), set(K, true), [K] = true.
      for (const m of c.matchAll(new RegExp(`\\b(?:setPref|putBoolean|setBool|set|edit\\(\\)\\.putBoolean)\\(\\s*(?:${refs})\\s*,\\s*true\\s*\\)`, 'g'))) bad.push(`${rel(p)}: ${m[0]} (slår på bryteren)`);
      for (const m of c.matchAll(new RegExp(`\\[\\s*(?:${refs})\\s*\\]\\s*(?:\\?:\\s*true|=\\s*true)`, 'g'))) bad.push(`${rel(p)}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], `nøkler: ${keys.map((k) => `${k.ident ?? ''}=${k.value ?? ''}`).join(', ')}`);
  // Standardverdien i preferanse-hjelperen er av (flag(k) uten standard = false).
  const vm = [...codeOf].find(([p, c]) => p.endsWith('.kt') && /fun\s+flag\(\s*k:\s*String\s*,\s*def:\s*Boolean\s*=\s*(true|false)/.test(c));
  if (vm) assert.match(vm[1], /fun\s+flag\(\s*k:\s*String\s*,\s*def:\s*Boolean\s*=\s*false/, `${rel(vm[0])}: flag(k) er av som standard`);
});
