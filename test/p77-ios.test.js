// Prompt 77 (SKJAIIOS): Glimt-forslag i Skjold Lab på iOS (apps/ios/FinansHub/Sources/Skjold77*.swift + små Edit i Skjold76*.swift).
// Ingen Swift-kompilator i sandkassen: kildesjekker av API-kontrakten, knappene, gjennomgangen og innstillingene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const NEW = ['Skjold77AI.swift', 'Skjold77Views.swift'];
const TOUCHED = ['Skjold76Model.swift', 'Skjold76Page.swift', 'Skjold76Edit.swift', 'Paper17.swift'];
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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
  for (const f of [...NEW, ...TOUCHED]) assert.ok(existsSync(join(SRC, f)), f);
  // Paper17.swift har strenger grovsjekken ikke tåler (også før prompt 77), så den sjekkes ikke her.
  for (const f of [...NEW, ...TOUCHED.filter((x) => x !== 'Paper17.swift')]) assert.ok(balanced(code(f)), `klammer i ${f}`);
});

test('API-kontrakten: suggest, images, from-search, tidy og settings under /api/skjold', () => {
  const s = code('Skjold77AI.swift');
  for (const re of [
    /Skjold76\.root \+ "\/ai\/suggest"/, /Skjold76\.root \+ "\/ai\/images", json: \["q": text\]/,
    /"\/parts\/\\\(partId\)\/photos\/from-search"/, /json: \["id": c\.id\]/,
    /Skjold76\.root \+ "\/ai\/tidy", json: body/, /\["all": true\]/, /\["partIds": ids\.map/,
    /"\/ai\/tidy\/\\\(id\)"/, /"\/ai\/tidy\/\\\(jobId\)\/apply"/,
    /"GET", Skjold76\.root \+ "\/ai\/settings"/, /"PUT", Skjold76\.root \+ "\/ai\/settings"/,
    /"webImages": webImages, "autoSuggestOnPhoto": autoSuggest/,
  ]) assert.match(s, re, String(re));
  // Svarfeltene leses som i kontrakten.
  for (const k of ['categoryNew', 'confidence', 'why', 'source', 'decoded', 'thumbUrl', 'jobId', 'state', 'done', 'total', 'partId', 'before', 'after'])
    assert.ok(s.includes(`"${k}"`), k);
  // Bilde som multipart (file + feltene), ellers lagret filnavn som «photo».
  assert.match(s, /API\.Part\(name: "file", filename: "del\.jpg", mime: "image\/jpeg"/);
  assert.match(s, /body\["photo"\] = photo/);
});

test('tidsavbrudd: 60 s med bilde, 30 s med tekst (litt slakk), og «Glimt tenker …»', () => {
  const s = code('Skjold77AI.swift');
  assert.match(s, /photoTimeout: TimeInterval = 65/);
  assert.match(s, /textTimeout: TimeInterval = 35/);
  assert.match(s, /thinkingText: String = "Glimt tenker …"/);
  assert.match(code('Skjold77Views.swift'), /Skjold77\.thinkingText/);
});

test('bildekandidater: bare serverens proxy og maks 12', () => {
  const s = code('Skjold77AI.swift');
  assert.match(s, /if !t\.hasPrefix\("\/"\) \{ return nil \}/);
  assert.match(s, /\.prefix\(12\)/);
  assert.match(s, /webOffText/);
});

test('Ny/Endre del: ✦ Foreslå ved navnet, kortet med ✓ og «Bruk alle», Finn bilde og auto-forslag', () => {
  const e = code('Skjold76Edit.swift');
  assert.match(e, /Skj76FormFields\(f: \$f, onSuggest: \{ suggestAI\(nil\) \}\)/);
  assert.match(e, /Text\("✦ Foreslå"\)/);
  assert.match(e, /Skj77SuggestCard\(f: \$f\)/);
  assert.match(e, /Skj76Button\(title: "Finn bilde"/);
  assert.match(e, /Skj77ImageFinder\(query: f\.name, partId: id\)/);
  assert.match(e, /if ai\.settingsLoaded && ai\.autoSuggest && !ai\.thinking \{ suggestAI\(img\) \}/);
  assert.match(e, /for c in form\.found \{ _ = await ai\.useImage\(c, partId: pid, store\) \}/, 'valgt bilde for ny del lagres etter POST /parts');
  const v = code('Skjold77Views.swift');
  assert.match(v, /Skj76Button\(title: "Bruk alle"/);
  assert.match(v, /if s\.categoryNew \{ Skj76Badge\(text: "ny"\) \}/);
  assert.match(v, /checkmark\.circle\.fill/);
  assert.match(v, /title: saving \? "Lagrer …" : "Bruk bildet"/, 'forhåndsvisning før lagring');
});

test('Rydd opp: menyen, gjennomgangen, «Godta valgte» og «Hopp over»', () => {
  const pg = code('Skjold76Page.swift');
  assert.match(pg, /Label\("Rydd opp med Glimt", systemImage: "sparkles"\)/);
  assert.match(pg, /case \.tidy\(let ids\): Skj77Tidy\(ids: ids\)/);
  assert.match(pg, /case \.ai: Skj77Settings\(\)/);
  assert.match(pg, /m\.sheet = \.ai/, '⚙ i Skjold Lab');
  const md = code('Skjold76Model.swift');
  assert.match(md, /case tidy\(\[String\]\)/);
  assert.match(md, /case ai\b/);
  const v = code('Skjold77Views.swift');
  assert.match(v, /"Godta valgte \(\\\(count\)\)"/);
  assert.match(v, /Skj76Button\(title: "Hopp over"/);
  assert.match(v, /checkmark\.square\.fill/);
  assert.match(v, /\\\(ai\.jobDone\) av \\\(ai\.jobTotal\)/);
  const s = code('Skjold77AI.swift');
  assert.match(s, /filter \{ chosen\.contains\(\$0\.id\) && \$0\.changed \}/, 'bare avkryssede deler sendes');
});

test('innstillingene: ⚙ i Skjold Lab og Innstillinger → Moduler → Skjold Lab', () => {
  const v = code('Skjold77Views.swift');
  assert.match(v, /toggle\("Finn bilder på nett"/);
  assert.match(v, /toggle\("Foreslå automatisk når jeg tar bilde"/);
  assert.match(code('Paper17.swift'), /PaperLinkRow\(name: "Skjold Lab", [^\n]*\{ Skjold77\.shared\.openSettings\(\) \}/);
  assert.match(code('Skjold77AI.swift'), /m\.sheet = \.ai/);
});

test('standard kategoriliste når brukeren ikke har noen', () => {
  const s = code('Skjold77AI.swift');
  for (const c of ['Motstander', 'Kondensatorer', 'Dioder og LED', 'Skruer og bolter', 'Mutre og skiver', 'Avstandsstykker', 'Diverse']) assert.ok(s.includes(`"${c}"`), c);
  assert.match(code('Skjold76Edit.swift'), /if m\.categories\.isEmpty \{/);
});
