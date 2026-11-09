// Prompt 76 (SKJIOS): Skjold Lab i iOS-appen (apps/ios/FinansHub/Sources/Skjold76*.swift).
// Ingen Swift-kompilator i sandkassen: kildesjekker av API-kontrakten, menyen, perspektivet og det som er lett å ødelegge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const FILES = ['Skjold76Model.swift', 'Skjold76Parse.swift', 'Skjold76Page.swift', 'Skjold76Cabinet.swift', 'Skjold76Detail.swift', 'Skjold76Edit.swift', 'Skjold76Setup.swift'];
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const all = () => FILES.map(code).join('\n');

/** Klammene går opp (grov sjekk uten kompilator; strenger telles ikke). */
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
  for (const f of FILES) {
    assert.ok(existsSync(join(SRC, f)), f);
    assert.ok(balanced(code(f)), `klammer i ${f}`);
  }
});

test('menyen, fullskjermen og dyplenkene', () => {
  assert.match(code('Paper.swift'), /\.feat51Host\(p\)\s*\.skjold76Host\(p\)/);
  assert.match(code('Skjold76Page.swift'), /func skjold76Host\(_ p: PaperPalette\) -> some View \{ modifier\(Skjold76Host\(p: p\)\) \}/);
  const mer = code('More44Rows.swift');
  assert.match(mer, /More28Row\(id: "skjold", name: "Skjold Lab", sub: Skjold76\.shared\.merSub, icon: "cabinet"\) \{ Skjold76\.shared\.show\(\) \}/);
  const s = code('Search51.swift');
  assert.match(s, /case "skjold", "skjoldlab", "deler":\s*Skjold76\.shared\.link\(url\)/, 'finanshub://skjold');
  assert.match(s, /case "part", "skjold", "deler": Skjold76\.shared\.show\(part: ref\.isEmpty \? nil : ref\)/, 'felles søk: typen «Deler» (part)');
  const m = code('Skjold76Model.swift');
  assert.match(m, /if kind == "del", parts\.count > 1 \{ show\(part: parts\[1\]\); return \}/, 'finanshub://skjold/del/<id> fra Glimt');
  assert.match(m, /sheet = \.drawer\(parts\[1\], rc\[0\], rc\[1\]\)/, 'QR på etiketten: skap/<id>/4-2');
});

test('API-kontrakten: alle endepunktene under /api/skjold', () => {
  const s = all();
  assert.match(s, /static let prefix: String = "\/api"/);
  assert.match(s, /static let root: String = "\/skjold"/);
  const paths = [
    /"\/cabinets"/, /"\/cabinets" \+ \(new \? "" : "\/\\\(cabId\)"\)/, /"\/cabinets\/\\\(id\)" \+ q/, /"\/cabinets\/\\\(cab\.id\)\/photo"/,
    /"\/cabinets\/\\\(cab\.id\)\/corners"/, /"\/cabinets\/\\\(id\)\/map"/, /"\/cabinets\/\\\(cabinetId\)\/drawers\/\\\(row\)\/\\\(col\)"/,
    /"\/parts\?limit=500"/, /"&low=1"/, /"\/parts\/\\\(id\)"/, /"\/parts\/\\\(p\.id\)\/restore"/, /"\/parts\/\\\(p\.id\)\/move"/,
    /"\/parts\/\\\(p\.id\)\/qty"/, /"\/parts\/\\\(id\)\/photos"/, /"\/parts\/\\\(id\)\/photos\/\\\(n\)"/,
    /"\/categories"/, /"\/suggest\?q="/, /"\/free"/, /"\/labels" \+ q/, /"\/history\/\\\(h\.id\)\/undo"/,
  ];
  for (const re of paths) assert.match(s, re, String(re));
  // Metodene.
  assert.match(s, /"DELETE", Skjold76\.root \+ "\/parts\/\\\(p\.id\)"/);
  assert.match(s, /let method: String = id\.isEmpty \? "POST" : "PATCH"/);
  assert.match(s, /"PUT", Skjold76\.root \+ "\/cabinets\/\\\(cab\.id\)\/corners"/);
  assert.match(s, /"DELETE", Skjold76\.root \+ "\/cabinets\/\\\(cab\.id\)\/photo"/);
  // Opplasting som multipart «file».
  assert.match(s, /API\.Part\(name: "file", filename: "del\.jpg", mime: "image\/jpeg"/);
  assert.match(s, /API\.Part\(name: "file", filename: "skap\.jpg", mime: "image\/jpeg"/);
});

test('svarene leses som SKJSRV sender dem', () => {
  const p = code('Skjold76Parse.swift');
  assert.match(p, /\["tl", "tr", "br", "bl"\]\.compactMap \{ point\(JS\.dict\(k, \$0\)\) \}/, 'hjørner {tl,tr,br,bl}');
  assert.match(p, /JS\.dict\(n, "parts"\)|JS\.int\(n, "parts"\)/);
  assert.match(p, /JS\.int\(n, "usedDrawers"\)/);
  assert.match(p, /d\.keys\.contains\("customLabel"\)/, 'egen etikett vs. standard «R4·S2»');
  assert.match(p, /JS\.num\(o, "minQty"\) \?\? JS\.num\(o, "min_qty"\)/);
  assert.match(p, /JS\.str\(o, "text"\) \?\? fallback/, 'plasseringsteksten fra serveren');
  assert.match(p, /\(JS\.str\(o, "kind"\) \?\? "part"\) == "part"/, 'forslag: del åpnes direkte');
  const m = code('Skjold76Model.swift');
  assert.match(m, /JS\.list\(o, "occupied"\)\.compactMap \{ JS\.str\(\$0, "name"\) \}/, 'advarsel om andre deler i skuffen');
  assert.match(code('Skjold76Setup.swift'), /move\.map \{ "\?move=" \+ Skjold76\.enc\(\$0\) \}/, '?move=<id|none>');
  assert.match(code('Skjold76Setup.swift'), /catch let e as APIError where e\.status == 409 \{\s*blocked = true/, '409 ved sletting av skap med deler');
  assert.match(code('Skjold76Setup.swift'), /Button\("La delene stå uten plass", role: \.destructive\) \{ remove\("none"\) \}/);
});

test('perspektiv: homografi med ProjectionTransform (ikke CGAffineTransform)', () => {
  const p = code('Skjold76Parse.swift');
  assert.match(p, /func projection\(_ w: CGFloat, _ hgt: CGFloat\) -> ProjectionTransform/);
  for (const k of ['m11 = a / w', 'm12 = d / w', 'm13 = g / w', 'm21 = b / hgt', 'm22 = e / hgt', 'm23 = h / hgt', 'm31 = c', 'm32 = f', 'm33 = 1']) {
    assert.ok(p.includes('t.' + k), k);
  }
  const c = code('Skjold76Cabinet.swift') + code('Skjold76Setup.swift');
  assert.equal((c.match(/\.projectionEffect\(projection\(s\)\)/g) || []).length, 2, 'bildet og hjørneoppsettet');
  assert.doesNotMatch(all(), /CGAffineTransform/);
  assert.match(code('Skjold76Cabinet.swift'), /h\.invert\(pt\)/, 'trykk på bildet regnes tilbake til skuff');

  // Samme formel som i Swift (Heckbert kvadrat → firkant) treffer hjørnene og kan inverteres.
  const sq = (q) => {
    const [p0, p1, p2, p3] = q;
    const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    return { a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + h * p3.x, c: p0.x, d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + h * p3.y, f: p0.y, g, h };
  };
  assert.match(p, /let g: CGFloat = \(sx \* dy2 - dx2 \* sy\) \/ den/);
  assert.match(p, /let h: CGFloat = \(dx1 \* sy - sx \* dy1\) \/ den/);
  assert.match(p, /let a: CGFloat = p1\.x - p0\.x \+ g \* p1\.x/);
  assert.match(p, /let e: CGFloat = p3\.y - p0\.y \+ h \* p3\.y/);
  const q = [{ x: 30, y: 12 }, { x: 290, y: 25 }, { x: 300, y: 560 }, { x: 18, y: 540 }];
  const H = sq(q);
  const ap = (u, v) => { const w = H.g * u + H.h * v + 1; return [(H.a * u + H.b * v + H.c) / w, (H.d * u + H.e * v + H.f) / w]; };
  const near = (a, b) => Math.abs(a[0] - b.x) < 1e-6 && Math.abs(a[1] - b.y) < 1e-6;
  assert.ok(near(ap(0, 0), q[0]) && near(ap(1, 0), q[1]) && near(ap(1, 1), q[2]) && near(ap(0, 1), q[3]));
  const [X, Y] = ap(0.3, 0.65);
  const m11 = H.a - X * H.g, m12 = H.b - X * H.h, m21 = H.d - Y * H.g, m22 = H.e - Y * H.h, r1 = X - H.c, r2 = Y - H.f, det = m11 * m22 - m12 * m21;
  assert.ok(Math.abs((r1 * m22 - m12 * r2) / det - 0.3) < 1e-9 && Math.abs((m11 * r2 - m21 * r1) / det - 0.65) < 1e-9);
});

test('tegningen: rad 1 øverst, tall langs kanten, puls i 2 s bare med scale/opacity', () => {
  const c = code('Skjold76Cabinet.swift');
  assert.match(c, /ForEach\(1\.\.\.Swift\.max\(1, rows\), id: \\\.self\)/);
  assert.match(c, /static let aspect: CGFloat = 1\.33/);
  assert.match(c, /Capsule\(\)\.fill\(on \? Color\.white\.opacity\(0\.85\) : Skj76Look\.handle\)/, 'håndtak');
  assert.equal((c.match(/withAnimation\(\.easeOut\(duration: 0\.5\)\.repeatCount\(4, autoreverses: false\)\) \{ ring = true \}/g) || []).length, 2, '4 × 0,5 s = 2 s');
  // ring brukes bare i scaleEffect/opacity.
  const uses = c.match(/ring \?[^:]+:[^)]+\)/g) || [];
  assert.ok(uses.length >= 4);
  for (const u of uses) assert.match(c, new RegExp('\\.(scaleEffect|opacity)\\(' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(c, /Picker\("Visning", selection: \$photoMode\)/);
  assert.match(c, /Text\("Bilde"\)\.tag\(true\)/);
});

test('bilder: kamera og PhotosPicker, JPEG maks 1600 px, bilder med app-token', () => {
  const e = code('Skjold76Edit.swift'), s = code('Skjold76Setup.swift');
  for (const f of [e, s]) {
    assert.match(f, /PhotosPicker\(selection: \$pick/);
    assert.match(f, /CameraView \{/);
    assert.match(f, /loadTransferable\(type: Data\.self\)/);
  }
  const m = code('Skjold76Model.swift');
  assert.match(m, /side > 1600 \? 1600 \/ side : 1/);
  assert.match(code('Skjold76Cabinet.swift'), /await store\.image\(path\)/, 'filene hentes med token (eier-sjekk)');
});

test('flytt med angre i 10 s, foreslå ledig, lavt lager og etiketter', () => {
  const m = code('Skjold76Model.swift');
  assert.match(m, /try\? await Task\.sleep\(nanoseconds: 10_000_000_000\)/);
  assert.match(m, /offerUndo\(msg\)/);
  assert.match(m, /func moveBack\(/);
  assert.match(m, /var low: Bool \{ minQty > 0 && qty <= minQty \}/);
  assert.match(code('Skjold76Edit.swift'), /Skj76Button\(title: "Foreslå ledig", icon: "sparkles"\) \{ suggest\(\) \}/);
  assert.match(code('Skjold76Page.swift'), /chip\("Lavt lager", on: m\.lowOnly\)/);
  const e = code('Skjold76Edit.swift');
  assert.match(e, /UIPrintInteractionController\.shared/);
  assert.match(e, /loadHTMLString\(html, baseURL: URL\(string: base\)\)/);
  assert.match(code('Skjold76Setup.swift'), /name = "Tilleggsskap \(3D-print\)"/);
  assert.match(code('Skjold76Setup.swift'), /cols = Skj76Setup\.colsFor\(widthMm: 270\)/);
  assert.equal(Math.max(1, Math.floor((270 - 6) / 64)), 4, '27 cm → 4 skuffer');
});

test('offline: siste liste caches per konto, endringer krever nett', () => {
  const m = code('Skjold76Model.swift'), p = code('Skjold76Parse.swift');
  assert.match(m, /Skj76Cache\.put\("parts", d\)/);
  assert.match(m, /func searchOffline\(\)/);
  assert.match(m, /static let netMsg: String = "Endringer krever nett\./);
  assert.match(m, /if let a = e as\? APIError, a\.status == 0 \{ flash\(Skjold76\.netMsg\); return \}/);
  assert.match(p, /AcctScope\.current/);
  assert.match(p, /\.cachesDirectory/);
  // Lokalt søk: «10k» treffer «10kΩ» og «10 k», æøå og store/små bokstaver likt.
  assert.match(m, /let tight: String = hay\.replacingOccurrences\(of: " ", with: ""\)/);
  assert.match(m, /replacingOccurrences\(of: "æ", with: "ae"\)/);
});

test('Xcode 16/26: ingen logging av data, ingen await i ternary, ingen fanget var i Task', () => {
  const s = all();
  assert.doesNotMatch(s, /\bprint\(|NSLog\(|os_log\(/);
  assert.doesNotMatch(s, /\? [^:\n]*: await /);
  assert.doesNotMatch(s, /: await /);
});
