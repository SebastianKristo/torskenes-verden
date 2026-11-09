// Prompt 79 (PICKIOS): plukkliste med +, «Vis alle med LED» med farge per del, plukklistelinje/ark og «Feilsøk LED» på iOS
// (apps/ios/FinansHub/Sources/Skjold79*.swift + små Edit i Skjold76*/Skjold78*.swift).
// Ingen Swift-kompilator i sandkassen: kildesjekker av API-kontrakten, knappene, lagringen og hint-reglene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const NEW = ['Skjold79Pick.swift', 'Skjold79Views.swift'];
const TOUCHED = ['Skjold76Model.swift', 'Skjold76Page.swift', 'Skjold76Detail.swift', 'Skjold78LED.swift', 'Skjold78Views.swift'];
const read = (f) => readFileSync(join(SRC, f), 'utf8');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function balanced(src) {
  const s = src.replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  const n = { '{': 0, '(': 0, '[': 0 };
  const close = { '}': '{', ')': '(', ']': '[' };
  for (const c of s) {
    if (c in n) n[c]++;
    else if (c in close) { n[close[c]]--; if (n[close[c]] < 0) return false; }
  }
  return Object.values(n).every((v) => v === 0);
}

test('filene finnes og klammene går opp', () => {
  for (const f of [...NEW, ...TOUCHED]) {
    assert.ok(existsSync(join(SRC, f)), f);
    assert.ok(balanced(code(f)), `klammer i ${f}`);
  }
});

test('locate med farger: {partIds, colors:true}, maks 20, partId og color leses per skuff', () => {
  const led = code('Skjold78LED.swift');
  assert.match(led, /func locateMany\(_ ids: \[Any\], colors: Bool, _ store: Store\) async -> \[String: Any\]/);
  assert.match(led, /body\["colors"\] = true/);
  assert.match(led, /\.prefix\(20\)/);
  assert.doesNotMatch(led, /\.prefix\(10\)/);
  assert.match(led, /var partId: String = ""/);
  assert.match(led, /var color: String = ""/);
  assert.match(led, /x\.partId = JS\.str\(o, "partId"\)/);
  assert.match(led, /JS\.str\(o, "color"\)/);
  const pick = code('Skjold79Pick.swift');
  assert.match(pick, /maxLit: Int = 20/);
  assert.match(pick, /\.prefix\(Skjold79\.maxLit\)/);
  assert.match(pick, /l\.locateMany\(ids, colors: true, store\)/);
  assert.match(pick, /JS\.list\(o, "skipped"\)/);
  assert.match(pick, /"out_of_range"/);
  // Paletten: blå (skapfargen) først, så gul, grønn, rød, lilla, oransje, cyan, rosa – 8–12 farger.
  const pal = pick.match(/palette: \[String\] = \[([^\]]+)\]/)[1].match(/#[0-9A-F]{6}/g);
  assert.ok(pal.length >= 8 && pal.length <= 12, String(pal.length));
  assert.equal(pal[0], '#2F6BFF');
  assert.equal(new Set(pal).size, pal.length);
});

test('plukklista: +/✓ på rad og detalj, linja nederst, arket med ±, Fjern, Tøm og Ta ut av lager med angre', () => {
  const v = code('Skjold79Views.swift');
  for (const s of ['struct Skj79AddButton', 'struct Skj79DetailButton', 'struct Skj79Bar', 'struct Skj79Sheet', 'struct Skj79Line', 'struct Skj79Dot'])
    assert.ok(v.includes(s), s);
  assert.match(v, /on \? "checkmark" : "plus"/);
  assert.match(v, /"Plukkliste \(\\\(k\.count\)\)"/);
  assert.match(v, /"💡 Vis alle med LED"/);
  assert.match(v, /m\.sheet = \.pick/);
  assert.match(v, /"Fjern"/);
  assert.match(v, /"Tøm plukklista"/);
  assert.match(v, /"Ta ut av lager"/);
  assert.match(v, /"Slå av"/);
  assert.match(v, /l\.secondsLeft/);
  assert.match(v, /Skj79Dot\(hex: k\.color\(item\.partId\)/);
  const pick = code('Skjold79Pick.swift');
  assert.match(pick, /Haptics\.shared\.success\(\)/);
  assert.match(pick, /m\.offerUndo\(text\)/);
  assert.match(pick, /m\.offerUndo\("Tømte plukklista"\)/);
  assert.match(pick, /"\/parts\/\\\(id\)\/qty"/);
  assert.match(pick, /json: \["delta": delta\]/);
  assert.match(pick, /adjust\(x\.partId, -Double\(x\.take\), store\)/);
  assert.match(pick, /adjust\(x\.partId, Double\(x\.take\), store\)/);

  const pg = code('Skjold76Page.swift');
  assert.match(pg, /Skj79AddButton\(part: part\)/);
  assert.match(pg, /Skj79Bar\(\)/);
  assert.match(pg, /case \.pick: Skj79Sheet\(\)/);
  assert.match(pg, /case \.diagnose\(let c\): Skj79Diagnose\(cabinetId: c\)/);
  assert.match(pg, /await Skjold79\.shared\.load\(store\)/);
  assert.match(code('Skjold76Detail.swift'), /Skj79DetailButton\(part: x\)/);
  const md = code('Skjold76Model.swift');
  assert.match(md, /case pick\b/);
  assert.match(md, /case diagnose\(String\)/);
  assert.match(md, /case \.pick: return "pick"/);
});

test('lagring: lokalt per konto og GET|PUT /picklist {items:[{partId, qty}]}, 404 = bare lokalt', () => {
  const pick = code('Skjold79Pick.swift');
  assert.match(pick, /"skj79\.pick\." \+ s/);
  assert.match(pick, /AcctScope\.current/);
  assert.match(pick, /UserDefaults\.standard\.set\(/);
  assert.match(pick, /"GET", Skjold76\.root \+ "\/picklist"/);
  assert.match(pick, /"PUT", Skjold76\.root \+ "\/picklist", json: body/);
  assert.match(pick, /\["items": items\.map \{ Skjold79\.remote\(\$0\) \}\]/);
  assert.match(pick, /\["partId": Skjold76\.idv\(x\.partId\), "qty": x\.take\]/);
  assert.match(pick, /e\.status == 404/);
  assert.match(pick, /localOnly = true/);
});

test('Feilsøk LED: knapp i oppsettet, POST /cabinets/:id/leds/diagnose, Ja/Nei-spørsmål og hint etter kontrakten', () => {
  const sv = code('Skjold78Views.swift');
  assert.match(sv, /"Feilsøk LED"/);
  assert.match(sv, /m\.sheet = \.diagnose\(id\)/);
  const led = code('Skjold78LED.swift');
  assert.match(led, /"\/cabinets\/\\\(id\)\/leds\/diagnose"/);
  const v = code('Skjold79Views.swift');
  assert.match(v, /"Lyste stripa rødt\?"/);
  assert.match(v, /"Lyste én LED blått\?"/);
  assert.match(v, /choice\("Ja", true, b\)/);
  assert.match(v, /choice\("Nei", false, b\)/);
  assert.match(v, /JS\.dict\(o, "hints"\)/);
  const pick = read('Skjold79Pick.swift');
  assert.match(pick, /JS\.list\(o, "steps"\)/);
  for (const k of ['"name"', '"ok"', '"detail"']) assert.ok(pick.includes(k), k);
  // Hint-reglene: ingen lyser → maskinvare; bare rødt → feil hos oss; begge → kalibrering.
  assert.match(pick, /if !red && !blue \{[\s\S]*?GPIO[\s\S]*?WS2812B[\s\S]*?felles jord[\s\S]*?nivåskifter[\s\S]*?LED Preferences/);
  assert.match(pick, /if red && !blue \{[\s\S]*?feil hos oss/);
  assert.match(pick, /kalibreringen/);
  assert.match(pick, /red \? \(blue \? "both" : "red"\) : \(blue \? "blue" : "none"\)/);
});

test('Swift-hygiene: eksplisitte typer i lukningene og ingen tvungen utpakking', () => {
  for (const f of NEW) {
    const s = code(f);
    assert.doesNotMatch(s, /[A-Za-z0-9_)\]]!\./, `tvungen utpakking i ${f}`);
    assert.doesNotMatch(s, /try!/, f);
  }
});
