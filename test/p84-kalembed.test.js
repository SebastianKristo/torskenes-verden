// Prompt 84 (iOS): «Kalender i appen» – hele Kalender-appen bygget inn i Homelab-appen (FinansHub-målet) bak flagget KAL_EMBED.
// Ingen Swift-kompilator i sandkassen: kildesjekker av project.yml, #if KAL_EMBED-portene, bryteren, tilbake-knappen, lenkene
// og en enkel skanner for navnekollisjoner mellom Kalender (+ SharedKal/Core) og Homelab (+ Shared, SharedKal/Group).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS = join(ROOT, 'apps/ios');
const read = (rel) => readFileSync(join(IOS, rel), 'utf8');
const swiftFiles = (dir) => readdirSync(join(IOS, dir)).filter((f) => f.endsWith('.swift')).sort().map((f) => `${dir}/${f}`);

const KAL_DIRS = ['Kalender/Sources', 'SharedKal/Core'];
const HL_DIRS = ['FinansHub/Sources', 'Shared', 'SharedKal/Group'];

/* ---------- Enkel Swift-skanner ---------- */

/** Fjerner kommentarer og strenginnhold ("…", """…""", #"…"#, \(…) med nøstede strenger). Linjeskift beholdes. */
export function strip(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const stack = [];
  while (i < n) {
    const c = src[i];
    const top = stack[stack.length - 1];
    if (top && top.parens === 0) {
      if (c === '\\' && src.startsWith('#'.repeat(top.hashes) + '(', i + 1)) { top.parens = 1; out += '('; i += 2 + top.hashes; continue; }
      if (c === '\\' && top.hashes === 0) { i += 2; continue; }
      const close = (top.multi ? '"""' : '"') + '#'.repeat(top.hashes);
      if (src.startsWith(close, i)) { stack.pop(); out += '""'; i += close.length; continue; }
      if (c === '\n') out += '\n';
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      let d = 1;
      i += 2;
      while (i < n && d > 0) {
        if (src.startsWith('/*', i)) { d++; i += 2; } else if (src.startsWith('*/', i)) { d--; i += 2; } else { if (src[i] === '\n') out += '\n'; i++; }
      }
      continue;
    }
    if (c === '"' || (c === '#' && /^#+"/.test(src.slice(i, i + 8)))) {
      let h = 0;
      while (src[i + h] === '#') h++;
      const multi = src.startsWith('"""', i + h);
      stack.push({ multi, hashes: h, parens: 0 });
      i += h + (multi ? 3 : 1);
      continue;
    }
    if (top && top.parens > 0) {
      if (c === '(') top.parens++;
      if (c === ')') { top.parens--; if (top.parens === 0) { out += ')'; i++; continue; } }
    }
    out += c;
    i++;
  }
  return out;
}

/** Linjene som kompileres med (embed = true) eller uten KAL_EMBED. Ukjente vilkår (canImport, compiler …): begge grener tas med. */
export function preprocess(code, embed) {
  const evalCond = (raw) => {
    const t = raw.trim();
    if (t === 'KAL_EMBED') return embed;
    if (t === '!KAL_EMBED') return !embed;
    if (t === 'os(macOS)') return false;
    if (t === 'os(iOS)') return true;
    return null;
  };
  const out = [];
  const stack = []; // {active, taken, unknown}
  const on = () => stack.every((s) => s.active);
  for (const line of code.split('\n')) {
    const m = line.match(/^\s*#(if|elseif|else|endif)\b(.*)$/);
    if (m) {
      const k = m[1];
      if (k === 'if') {
        const v = evalCond(m[2]);
        stack.push({ active: v !== false, taken: v === true, unknown: v === null });
      } else if (k === 'elseif') {
        const s = stack[stack.length - 1];
        const v = evalCond(m[2]);
        if (s.unknown || v === null) { s.active = true; s.unknown = true; } else { s.active = !s.taken && v; s.taken = s.taken || v; }
      } else if (k === 'else') {
        const s = stack[stack.length - 1];
        s.active = s.unknown ? true : !s.taken;
      } else {
        stack.pop();
      }
      out.push('');
      continue;
    }
    out.push(on() ? line : '');
  }
  return out.join('\n');
}

const code = (rel, embed = true) => preprocess(strip(read(rel)), embed);
/** Som code(), men med strenger og kommentarer. */
const rawpp = (rel, embed = true) => preprocess(read(rel), embed);

function labels(params) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const c of params) {
    if ('([<{'.includes(c)) depth++;
    if (')]>}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => (p.trim().match(/^(?:@\w+\s+)*([A-Za-z_]\w*)/) || [, '?'])[1]).join(':');
}

const DECL = /^\s*((?:@[\w.]+(?:\([^)]*\))?\s+)*)((?:(?:public|internal|private|fileprivate|static|class|final|nonisolated|override|mutating|convenience|required|lazy|weak|open|indirect|dynamic)\s+)*)(struct|class|enum|protocol|actor|typealias|func|let|var|extension|init|subscript)\b\s*([^\n]*)/;

/** Topp-nivå-deklarasjoner og medlemmer i extension på topp-nivå (ikke private/fileprivate). */
export function decls(src) {
  const top = [];
  const ext = [];
  let depth = 0;
  let cur = null;
  for (const line of src.split('\n')) {
    const m = line.match(DECL);
    if (m) {
      const priv = /\b(private|fileprivate)\b/.test(m[1] + ' ' + m[2]);
      const isStatic = /\bstatic\b/.test(m[2]) ? 'static ' : '';
      const kind = m[3];
      const rest = m[4];
      if (depth === 0) {
        if (kind === 'extension') {
          const em = rest.match(/^([\w.]+)\s*(?::\s*([^{]*?))?\s*(?:where[^{]*)?\{?\s*$/) || rest.match(/^([\w.]+)/);
          cur = { type: em[1], priv };
          const conf = em[2] ? em[2].split(',').map((x) => x.trim()).filter(Boolean) : [];
          for (const c of conf) if (!priv) ext.push(`${cur.type}: ${c}`);
        } else if (!priv) {
          const nm = rest.match(/^([A-Za-z_]\w*|`\w+`)/);
          if (nm) {
            let sig = nm[1];
            if (kind === 'func') { const pm = rest.match(/^[\w`]+\s*(?:<[^>]*>)?\s*\(([^)]*)\)/); sig += `(${pm ? labels(pm[1]) : ''})`; }
            top.push(sig);
          }
        }
      } else if (depth === 1 && cur && !priv && !cur.priv) {
        let sig = null;
        if (kind === 'init') { const pm = rest.match(/^\??\s*(?:<[^>]*>)?\s*\(([^)]*)\)/); sig = `init(${pm ? labels(pm[1]) : ''})`; }
        else if (kind === 'func') { const nm = rest.match(/^([\w`]+|[^\s(<]+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/); if (nm) sig = `${isStatic}${nm[1]}(${labels(nm[2])})`; }
        else if (kind === 'var' || kind === 'let') { const nm = rest.match(/^([\w`]+)/); if (nm) sig = isStatic + nm[1]; }
        else if (kind === 'subscript') { const pm = rest.match(/^\(([^)]*)\)/); sig = `subscript(${pm ? labels(pm[1]) : ''})`; }
        else if (['struct', 'class', 'enum', 'typealias', 'actor'].includes(kind)) { const nm = rest.match(/^(\w+)/); if (nm) sig = `type ${nm[1]}`; }
        if (sig) ext.push(`${cur.type}.${sig}`);
      }
    }
    for (const c of line) {
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) cur = null; }
    }
  }
  return { top, ext };
}

function collect(dirs) {
  const top = new Map();
  const ext = new Map();
  for (const d of dirs) {
    for (const f of swiftFiles(d)) {
      const r = decls(code(f, true));
      for (const t of r.top) top.set(t, [...(top.get(t) ?? []), f]);
      for (const e of r.ext) ext.set(e, [...(ext.get(e) ?? []), f]);
    }
  }
  return { top, ext };
}

function balanced(src) {
  let d = 0;
  for (const c of src) {
    if (c === '{') d++;
    if (c === '}') { d--; if (d < 0) return false; }
  }
  return d === 0;
}

/** Målets blokk i project.yml (fra «  Navn:» til neste mål på samme nivå). */
function target(name) {
  const y = read('project.yml');
  const i = y.indexOf(`\n  ${name}:\n`);
  assert.ok(i >= 0, `målet ${name}`);
  const rest = y.slice(i + 1);
  const j = rest.slice(3).search(/\n  [A-Za-z][\w]*:\n/);
  return (j < 0 ? rest : rest.slice(0, j + 3)).replace(/#.*$/gm, '');
}
const sources = (block) => {
  const s = block.slice(block.indexOf('    sources:'));
  const end = s.slice(12).search(/\n    [a-z]/);
  return (end < 0 ? s : s.slice(0, end + 12)).split('\n').map((l) => l.match(/^\s+- (?:path: )?(\S+)/)).filter(Boolean).map((m) => m[1]);
};

/* ---------- project.yml ---------- */

test('project.yml: FinansHub får Kalender/Sources og SharedKal/Core (ikke Fonts/Resources) og flagget KAL_EMBED', () => {
  const fh = target('FinansHub');
  const src = sources(fh);
  for (const s of ['FinansHub/Sources', 'FinansHub/Resources', 'Shared', 'SharedKal/Group', 'Kalender/Sources', 'SharedKal/Core']) assert.ok(src.includes(s), s);
  assert.ok(!src.includes('SharedKal/Fonts'), 'ikke SharedKal/Fonts (samme filnavn som FinansHub/Resources/Fonts)');
  assert.ok(!src.includes('Kalender/Resources'), 'ikke Kalender-katalogen (AppIcon/AccentColor)');
  assert.match(fh, /SWIFT_ACTIVE_COMPILATION_CONDITIONS: "\$\(inherited\) KAL_EMBED"/);
  // Kalender-appen er som før.
  const kal = target('Kalender');
  for (const s of ['Kalender/Sources', 'Kalender/Resources', 'SharedKal/Group', 'SharedKal/Core', 'SharedKal/Fonts']) assert.ok(sources(kal).includes(s), s);
  assert.doesNotMatch(kal, /KAL_EMBED/);
  for (const t of ['KalenderWidgets', 'KalenderMac', 'FinansHubWidgets']) assert.doesNotMatch(target(t), /KAL_EMBED/, t);
  assert.match(fh, /LSApplicationQueriesSchemes: \[kalender, finanshub, homelab\]/);
  // Fontene Kalender bruker finnes i Homelab.
  const fonts = readdirSync(join(IOS, 'FinansHub/Resources/Fonts'));
  for (const f of readdirSync(join(IOS, 'SharedKal/Fonts')).filter((x) => x.endsWith('.ttf'))) assert.ok(fonts.includes(f), f);
});

/* ---------- #if KAL_EMBED ---------- */

const ALL_FH = [...HL_DIRS, ...KAL_DIRS].flatMap(swiftFiles);

test('@main: KalApp bare uten KAL_EMBED – Homelab-målet har nøyaktig én @main', () => {
  const kalApp = read('Kalender/Sources/KalApp.swift');
  assert.match(kalApp, /#if !KAL_EMBED\n@main\nstruct KalApp: App \{/);
  assert.doesNotMatch(code('Kalender/Sources/KalApp.swift', true), /@main/);
  assert.match(code('Kalender/Sources/KalApp.swift', false), /@main\s+struct KalApp: App/);
  const mains = ALL_FH.filter((f) => /^\s*@main\b/m.test(code(f, true)));
  assert.deepEqual(mains, ['FinansHub/Sources/App.swift']);
  // Rotvisningen som begge bruker.
  assert.match(kalApp, /struct KalAppRoot: View \{/);
  assert.match(kalApp, /WindowGroup \{\n\s+KalAppRoot\(\)\n\s+\}/);
  assert.match(read('FinansHub/Sources/Kal84Embed.swift'), /KalAppRoot\(\)/);
});

test('én AppShortcutsProvider i Homelab, App Intents i Kalender bak #if !KAL_EMBED', () => {
  const prov = ALL_FH.filter((f) => /:\s*AppShortcutsProvider\b/.test(code(f, true)));
  assert.deepEqual(prov, ['FinansHub/Sources/Quick29Intent.swift']);
  assert.match(code('Kalender/Sources/KalIntent.swift', false), /struct KalShortcuts: AppShortcutsProvider/);
  assert.doesNotMatch(code('Kalender/Sources/KalIntent.swift', true), /struct|: AppIntent|AppShortcut/);
});

test('innebygd: ingen BGTask, varsel-delegat/-kategorier, kalender://-lenker, krasjfanger eller widget-reload fra Kalender-koden', () => {
  const kal = KAL_DIRS.flatMap(swiftFiles);
  const hits = (re) => kal.filter((f) => re.test(code(f, true)));
  assert.deepEqual(hits(/BGTaskScheduler\.shared\.(register|submit)/), []);
  assert.deepEqual(hits(/UNUserNotificationCenter\.current\(\)\.delegate\s*=/), []);
  assert.deepEqual(hits(/setNotificationCategories/), []);
  assert.deepEqual(hits(/\.onOpenURL\b|\.onContinueUserActivity\b/), []);
  assert.deepEqual(hits(/KalCrash51\.install\(\)/), []);
  assert.deepEqual(hits(/WidgetCenter\.shared/), []);
  assert.deepEqual(hits(/\.preferredColorScheme\(/), [], 'temaet settes bare på fullskjermen (KalEmbed84.apply)');
  // Uten flagget er alt som før.
  assert.ok(kal.some((f) => /BGTaskScheduler\.shared\.register/.test(code(f, false))));
  assert.match(code('Kalender/Sources/KalApp.swift', false), /UNUserNotificationCenter\.current\(\)\.delegate = KalNotifyDelegate\.shared/);
  assert.match(code('Kalender/Sources/KalApp.swift', false), /KalCrash51\.install\(\)/);
  assert.match(code('Kalender/Sources/KalApp.swift', false), /\.onOpenURL \{ \(url: URL\) in KalLinks\.handle\(url\) \}/);
  assert.match(code('Kalender/Sources/KalWidgets70.swift', false), /WidgetCenter\.shared\.reloadAllTimelines\(\)/);
  assert.match(code('Kalender/Sources/KalNotify.swift', false), /setNotificationCategories\(\[cat\]\)/);
  // Påminnelser: bare når den frittstående appen ikke er installert, og nye enheter varsles av Homelab selv.
  assert.match(code('Kalender/Sources/KalNotify.swift', true), /if !KalEmbed84\.shared\.notify \{ return \}/);
  assert.doesNotMatch(rawpp('SharedKal/Core/KalSec51Core.swift', true), /"kal51-approve-"/);
  assert.match(rawpp('SharedKal/Core/KalSec51Core.swift', false), /"kal51-approve-"/);
  // Innstillinger: Widgets og oppdateringsinfo (TestFlight/IPA) bare i den frittstående appen.
  const set = read('Kalender/Sources/KalSettings35.swift');
  assert.match(set, /if !KalEmbed84\.on \{\n\s+KalLabel\(text: "WIDGETS"\)/);
  assert.match(set, /if !KalEmbed84\.on \{ KalUpdateInfo43\(\) \}/);
});

/* ---------- Kollisjoner ---------- */

test('ingen like topp-nivå-navn, extension-medlemmer eller filnavn mellom Kalender og Homelab', () => {
  const A = collect(KAL_DIRS);
  const B = collect(HL_DIRS);
  assert.ok(A.top.size > 200 && B.top.size > 2000, 'skanneren fant deklarasjonene');
  assert.ok(A.ext.has('Color.init(kalHex:opacity)') && B.ext.has('Color.init(hex)'), 'skanneren fant extension-medlemmene');
  const top = [...A.top.keys()].filter((k) => B.top.has(k)).map((k) => `${k}: ${A.top.get(k)} ↔ ${B.top.get(k)}`);
  assert.deepEqual(top, []);
  const ext = [...A.ext.keys()].filter((k) => B.ext.has(k)).map((k) => `${k}: ${A.ext.get(k)} ↔ ${B.ext.get(k)}`);
  assert.deepEqual(ext, []);
  // Globale funksjoner med samme navn (andre etiketter) gir lett tvetydige kall.
  const fname = (k) => k.replace(/\(.*$/, '');
  const bNames = new Set([...B.top.keys()].map(fname));
  assert.deepEqual([...A.top.keys()].filter((k) => k.includes('(') && bNames.has(fname(k))), []);
  // Samme filnavn i ett mål gir byggefeil.
  const base = (dirs) => dirs.flatMap((d) => readdirSync(join(IOS, d)));
  const hl = new Set(base([...HL_DIRS, 'FinansHub/Resources']));
  assert.deepEqual(base(KAL_DIRS).filter((f) => hl.has(f)), []);
});

test('Homelabs extension-medlemmer på systemtyper brukes ikke av Kalender-koden (ingen tvetydige kall)', () => {
  const B = collect(HL_DIRS);
  const own = new Set();
  for (const f of [...HL_DIRS, ...KAL_DIRS].flatMap(swiftFiles)) {
    for (const m of code(f, true).matchAll(/^\s*(?:@\w+\s+)*(?:(?:public|private|fileprivate|final|indirect)\s+)*(?:struct|class|enum|protocol|actor|typealias)\s+(\w+)/gm)) own.add(m[1]);
  }
  const kal = KAL_DIRS.flatMap(swiftFiles).map((f) => code(f, true)).join('\n');
  const bad = [];
  for (const k of B.ext.keys()) {
    const type = k.slice(0, k.indexOf('.'));
    if (own.has(type) || k.includes(': ')) continue;
    const sig = k.slice(k.indexOf('.') + 1).replace(/^static /, '');
    if (sig.startsWith('init(')) {
      const lab = sig.slice(5).split(/[:)]/)[0];
      if (lab && lab !== '_' && new RegExp(`\\b${type}\\(${lab}:`).test(kal)) bad.push(k);
      continue;
    }
    const name = sig.replace(/\(.*$/, '').replace(/^type /, '');
    // Implisitte medlemmer (.navn uten objekt foran) – t.ink o.l. er Kalenders egne tokens.
    if (new RegExp(`(^|[^\\w)\\].])\\.${name}\\b`, 'm').test(kal)) bad.push(k);
  }
  assert.deepEqual(bad, []);
});

test('UserDefaults-nøkler: Kalender bruker kal*-nøkler; felles nøkler med Homelab betyr det samme (kal41.* fra Server41)', () => {
  // Kal84Embed.swift er selve innbyggingen og skriver Kalenders kal.noAuto med vilje (samme betydning).
  const keys = (dirs) => {
    const s = new Set();
    for (const f of dirs.flatMap(swiftFiles).filter((x) => !x.endsWith('/Kal84Embed.swift'))) {
      // Som kompilert i Homelab (iOS, KAL_EMBED); KVC-parametre (CIFilter setValue(_:forKey:)) er ikke innstillinger.
      const txt = rawpp(f, true).split('\n').filter((l) => !/\.setValue\(/.test(l)).join('\n');
      for (const m of txt.matchAll(/(?:forKey: *"([^"]+)"|AppStorage\("([^"]+)"|(?:let|var) \w*[kK]ey\w*(?:: String)? = "([^"]+)")/g)) s.add(m[1] ?? m[2] ?? m[3]);
    }
    return s;
  };
  const a = keys(KAL_DIRS);
  const b = keys(['FinansHub/Sources', 'Shared']);
  assert.ok(a.size > 30);
  const shared = [...a].filter((k) => b.has(k)).sort();
  assert.deepEqual(shared, ['kal41.auto', 'kal41.external', 'kal41.local', 'kal41.now']);
  assert.deepEqual([...a].filter((k) => !/^kal/.test(k)), [], 'alle Kalender-nøkler starter med kal');
  assert.ok(!b.has('kal84_embed') || /AppStorage\("kal84_embed"\)/.test(read('FinansHub/Sources/Kal84Embed.swift')));
  // Bildekatalogen: Kalender-koden bruker ingen navngitte bilder/farger (bare AppIcon/AccentColor i KalAssets).
  const kal = KAL_DIRS.flatMap(swiftFiles).map((f) => read(f)).join('\n');
  assert.doesNotMatch(kal, /Image\("|Color\("|UIImage\(named/);
});

/* ---------- Bryter, lenker og tilbake ---------- */

const emb = () => read('FinansHub/Sources/Kal84Embed.swift');

test('Innstillinger → «Kalender i appen» (kal84_embed, standard på) med forklaringen', () => {
  const s = emb();
  assert.match(s, /@AppStorage\("kal84_embed"\) private var embed: Bool = true/);
  assert.match(s, /static var on: Bool \{ \(UserDefaults\.standard\.object\(forKey: key\) as\? Bool\) \?\? true \}/);
  assert.match(s, /static let key: String = "kal84_embed"/);
  assert.match(s, /Text\("Kalender i appen"\)/);
  assert.match(s, /"Bruk hele Kalender-appen inni Homelab\. Nyttig når du sideloader og bare har plass til én app\."/);
  assert.match(read('FinansHub/Sources/Paper17.swift'), /group\(g\.title, g\.offset, g\.rows\)\n\s+\}\n\s+\/\/ Prompt 84[^\n]*\n\s+Kal84Settings\(\)/);
  assert.match(read('FinansHub/Sources/Settings50Wide.swift'), /if query\.isEmpty \{ Kal84Settings\(\) \}/);
  assert.match(read('FinansHub/Sources/Settings24.swift'), /add\("kal84", "Kalender i appen"/);
});

test('lenkene går via bryteren: KalLink33 åpner den innebygde Kalenderen før Kalender-appen', () => {
  const l = read('FinansHub/Sources/KalLink33.swift');
  const open = l.slice(l.indexOf('static func open('), l.indexOf('static func enc('));
  assert.ok(open.indexOf('if Kal84.on') > 0 && open.indexOf('if Kal84.on') < open.indexOf('installed else'), 'bryteren først');
  assert.match(open, /Kal84Host\.shared\.show\(e\)\n\s+return true/);
  assert.match(l, /if !installed && !Kal84\.on \{ return false \}/);
  assert.match(l, /guard KalGroup\.linked \|\| Kal84\.on, let a = store\.account/);
  // Hjem-kortet/-flisen, kalenderfanen og Mer, Chat-kort, briefen og widget-lenkene går via KalLink33 eller paperGo("kalender").
  assert.match(read('FinansHub/Sources/PaperStore.swift'), /if t == "kalender" && \(paperTab != "kalender" \|\| Kal84\.on\) && KalLink33\.today\(\) \{ return \}/);
  assert.match(read('FinansHub/Sources/More44Rows.swift'), /More28Row\(id: "kalender", name: "Kalender"[^\n]*store\.paperGo\("kalender"\)/);
  assert.match(read('FinansHub/Sources/Home52Grid.swift'), /KalLink33\.event\(e\) \{ return \}\n\s+store\.paperGo\("kalender"\)/);
  assert.match(read('FinansHub/Sources/Calendar26Home.swift'), /KalLink33\.day\(/);
  assert.match(read('FinansHub/Sources/AppWidgets.swift'), /KalLink33\.forward\(url\)/);
  assert.match(read('FinansHub/Sources/Notify31.swift'), /case "kalender":\n\s+store\.paperGo\("kalender"\)/);
  // Ingen andre steder i Homelab åpner kalender:// direkte.
  const direct = swiftFiles('FinansHub/Sources').filter((f) => f !== 'FinansHub/Sources/KalLink33.swift' && /UIApplication\.shared\.open\([^)]*kalender/.test(strip(read(f))));
  assert.deepEqual(direct, []);
});

test('fullskjerm med «‹ Homelab» øverst (ikke over innholdet) som lukker og går tilbake', () => {
  const s = emb();
  assert.match(s, /h\.modalPresentationStyle = \.fullScreen/);
  assert.match(s, /VStack\(spacing: 0\) \{\n\s+Kal84Bar\(t: t\) \{ Kal84Host\.shared\.close\(\) \}\n\s+KalAppRoot\(\)/);
  assert.match(s, /Text\("‹ Homelab"\)\n\s+\.font\(KalFont\.ui\(15, \.semibold\)\)\n\s+\.foregroundStyle\(t\.acc\)/);
  assert.match(s, /\.accessibilityLabel\("Tilbake til Homelab"\)/);
  assert.match(s, /if let p = h\.presentingViewController \{ p\.dismiss\(animated: true/);
  // Bare innebygd: Kal84Bar finnes ikke i Kalender-appens kode.
  assert.ok(KAL_DIRS.flatMap(swiftFiles).every((f) => !/Kal84Bar|‹ Homelab/.test(read(f))));
  // Over andre fullskjermer: presenteres fra øverste kontroller, venter til en som lukkes er borte.
  assert.match(s, /while let p = vc\?\.presentedViewController \{/);
  assert.match(s, /if p\.isBeingDismissed \{/);
  // Homelab-lenker fra Kalender (Bursdager ›, Kontoer og synk) og varsler om annet lukker Kalender først.
  assert.match(read('FinansHub/Sources/App.swift'), /if Kal84Host\.shared\.closeFirst\(u, \{ openLink84\(u\) \}\) \{ return \}/);
  assert.match(read('FinansHub/Sources/App.swift'), /\.kal84Host\(store\)/);
  assert.match(read('FinansHub/Sources/Notify31.swift'), /if go != "kalender" \{ Kal84Host\.shared\.close\(\) \}/);
});

test('innlogging: samme konto som Homelab uten egen innloggingsskjerm (enhets-token → device-exchange, ellers companion)', () => {
  const s = emb();
  assert.match(s, /"\/auth\/device-token", json: \["app": "kalender"\]/);
  assert.match(s, /KalShared41\.save\(KalDevice41\(token: tok/);
  assert.match(s, /KalLogin41Model\.shared\.quick\(\)/);
  assert.match(s, /await KalCompanion33\.ensure84\(st\)/);
  assert.match(s, /KalStore\.shared\.adoptHomelab\(\)/);
  assert.match(s, /UserDefaults\.standard\.set\(false, forKey: "kal\.noAuto"\)/);
  assert.match(read('FinansHub/Sources/KalLink33.swift'), /static func ensure84\(_ store: Store\) async \{/);
  // «Logg inn med Homelab-appen» innebygd → Homelab logger inn selv (ikke homelab://app-auth til seg selv).
  assert.match(read('Kalender/Sources/KalLogin41.swift'), /func viaApp\(\) \{\n[^\n]*\n\s+if let h = KalEmbed84\.shared\.login \{\n\s+h\(\)\n\s+return\n\s+\}/);
  assert.match(s, /e\.login = \{ Kal84Host\.shared\.login\(force: true\) \}/);
});

test('nye/endrede Swift-filer: klammene går opp (begge varianter av #if)', () => {
  const files = ['FinansHub/Sources/Kal84Embed.swift', 'Kalender/Sources/KalEmbed84.swift', 'Kalender/Sources/KalApp.swift', 'Kalender/Sources/KalIntent.swift',
    'Kalender/Sources/KalBg44.swift', 'Kalender/Sources/KalNotify.swift', 'Kalender/Sources/KalWidgets70.swift', 'Kalender/Sources/KalSettings35.swift',
    'Kalender/Sources/KalLogin41.swift', 'Kalender/Sources/KalStore.swift', 'SharedKal/Core/KalSec51Core.swift', 'FinansHub/Sources/KalLink33.swift',
    'FinansHub/Sources/App.swift', 'FinansHub/Sources/Notify31.swift', 'FinansHub/Sources/Paper17.swift', 'FinansHub/Sources/Settings50Wide.swift'];
  for (const f of files) {
    assert.ok(existsSync(join(IOS, f)), f);
    assert.ok(balanced(code(f, true)), `klammer med KAL_EMBED i ${f}`);
    assert.ok(balanced(code(f, false)), `klammer uten KAL_EMBED i ${f}`);
    const ifs = (read(f).match(/^\s*#if\b/gm) || []).length;
    const ends = (read(f).match(/^\s*#endif\b/gm) || []).length;
    assert.equal(ifs, ends, `#if/#endif i ${f}`);
  }
  // KalEmbed84: på i Homelab, av i Kalender-appen.
  const k = read('Kalender/Sources/KalEmbed84.swift');
  assert.match(k, /#if KAL_EMBED\n\s+return true\n\s+#else\n\s+return false\n\s+#endif/);
});
