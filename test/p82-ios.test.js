// Prompt 82 (CHKIOS): Skjold Lab på iOS – sjekk ut deler til et produkt, «Brukt i», Produkter og sjekk inn igjen.
// Ingen Swift-kompilator i sandkassen: kildesjekker av API-kontrakten (CONTRACT82.md), knappene, tekstene og koblingene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const NEW = ['Skjold82Projects.swift', 'Skjold82Views.swift'];
const TOUCHED = ['Skjold76Model.swift', 'Skjold76Page.swift', 'Skjold76Detail.swift', 'Skjold79Pick.swift', 'Skjold79Views.swift'];
const raw = (f) => readFileSync(join(SRC, f), 'utf8');
const code = (f) => raw(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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

const mdl = code('Skjold82Projects.swift');
const v = code('Skjold82Views.swift');

test('filene finnes og klammene går opp', () => {
  for (const f of [...NEW, ...TOUCHED]) {
    assert.ok(existsSync(join(SRC, f)), f);
    assert.ok(balanced(code(f)), `klammer i ${f}`);
  }
});

test('API: /projects, /projects/:id, /checkout, /checkout/undo og /usage/:id/return under /api/skjold', () => {
  assert.match(mdl, /"GET", Skjold76\.root \+ "\/projects"/);
  assert.match(mdl, /"GET", Skjold76\.root \+ "\/projects\/\\\(id\)"/);
  assert.match(mdl, /"POST", Skjold76\.root \+ "\/projects", json: body/);
  assert.match(mdl, /"PATCH", Skjold76\.root \+ "\/projects\/\\\(id\)", json: body/);
  assert.match(mdl, /"DELETE", Skjold76\.root \+ "\/projects\/\\\(id\)"/);
  assert.match(mdl, /"POST", Skjold76\.root \+ "\/checkout", json: body/);
  assert.match(mdl, /"POST", Skjold76\.root \+ "\/checkout\/undo", json: \["undoToken": token\]/);
  assert.match(mdl, /"POST", Skjold76\.root \+ "\/usage\/\\\(line\.usageId\)\/return", json: \["qty": q\]/);
  // Kroppen: projectId eller projectName, items:[{partId, qty}], note valgfritt.
  assert.match(mdl, /\["projectId": Skjold76\.idv\(t\.projectId\)\]/);
  assert.match(mdl, /\["projectName": clean\(t\.newName\)\]/);
  assert.match(mdl, /body\["items"\] = list\.map/);
  assert.match(mdl, /\["partId": Skjold76\.idv\(x\.partId\), "qty": x\.qty\]/);
  assert.match(mdl, /body\["note"\] = n/);
  assert.match(mdl, /\$0\.qty > 0/);
  assert.match(mdl, /JS\.str\(o, "undoToken"\)/);
  assert.match(mdl, /\["status": s\]/);
  assert.match(mdl, /done \? "ferdig" : "aktiv"/);
  assert.match(mdl, /\["name": n\]/);
});

test('svarene: prosjekt-feltene, linjene (flate eller gruppert) og usedIn fra GET /parts/:id', () => {
  for (const k of ['"name"', '"status"', '"notes"', '"parts"', '"units"', '"cost"', '"updated"', '"usageId"', '"partId"', '"thumbUrl"',
    '"returnedQty"', '"at"', '"loc"', '"unit"', '"price"', '"usedIn"', '"projectId"']) assert.ok(mdl.includes(k), k);
  assert.match(mdl, /JS\.list\(it, "lines"\)/);
  assert.match(mdl, /var left: Double \{ Swift\.max\(0, qty - returnedQty\) \}/);
  assert.match(mdl, /\$0\.qty > 0/);
  assert.match(code('Skjold76Model.swift'), /Skjold82\.shared\.takeUsed\(id, o\)/);
});

test('regler: navn maks 80, antall 1 … lager, toast-tekstene', () => {
  assert.match(mdl, /maxName: Int = 80/);
  assert.match(mdl, /String\(t\.prefix\(Skjold82\.maxName\)\)/);
  assert.match(mdl, /Swift\.max\(1, Swift\.min\(top, n\)\)/);
  assert.match(mdl, /"Sjekket ut " \+ Skjold76\.num\(x\.qty\) \+ " " \+ x\.unit \+ " til «" \+ name \+ "»"/);
  assert.match(mdl, /"Sjekket inn " \+ Skjold76\.num\(q\)/);
  assert.match(mdl, /" fra «" \+ name \+ "»"/);
  // Regelen kjørt i JS (samme som clamp).
  const clamp = (n, stock) => Math.max(1, Math.min(Math.max(1, Math.floor(stock)), n));
  assert.equal(clamp(5, 3), 3);
  assert.equal(clamp(0, 3), 1);
  assert.equal(clamp(2, 2.5), 2);
});

test('alt eller ingenting: 409 viser feilen, ingenting endres lokalt; angre og haptikk', () => {
  assert.match(mdl, /catch let e as APIError where e\.status == 409/);
  assert.match(mdl, /Ikke nok på lager – ingenting ble sjekket ut\./);
  assert.match(mdl, /m\.offerUndo\(text\)/);
  assert.match(mdl, /Haptics\.shared\.success\(\)/);
  assert.match(mdl, /Haptics\.shared\.warning\(\)/);
  assert.match(mdl, /Sjekk inn alle delene før du sletter produktet/);
});

test('delsiden: «Sjekk ut»-arket (±, produktvalg med «Nytt produkt …», notat) og «Brukt i»', () => {
  for (const s of ['struct Skj82CheckoutButton', 'struct Skj82UsedIn', 'struct Skj82Checkout', 'struct Skj82ProjectPicker'])
    assert.ok(v.includes(s), s);
  assert.match(v, /Skj76Button\(title: "Sjekk ut", icon:/);
  assert.match(v, /m\.sheet = \.checkout\(part\.id\)/);
  assert.match(v, /PLabel\(text: "Brukt i"\)/);
  assert.match(v, /m\.sheet = \.project\(u\.projectId\)/);
  assert.match(v, /"Nytt produkt …"/);
  assert.match(v, /PLabel\(text: "Notat \(valgfritt\)"\)/);
  assert.match(v, /Skjold82\.clamp\(qty \+ d, stock: x\.qty\)/);
  assert.match(v, /k\.checkout\(\[take\], to: t, note: n, store\)/);
  const det = code('Skjold76Detail.swift');
  assert.match(det, /Skj82CheckoutButton\(part: x\)/);
  assert.match(det, /Skj82UsedIn\(id: x\.id, unit: x\.unit\)/);
});

test('Produkter: liste, produktside med stykkliste, «Sjekk inn», «Marker som ferdig», «Gi nytt navn» og «Slett»', () => {
  for (const s of ['struct Skj82Entry', 'struct Skj82ProjectsSheet', 'struct Skj82ProjectSheet', 'struct Skj82GroupRow', 'struct Skj82LineRow'])
    assert.ok(v.includes(s), s);
  for (const t of ['"Produkter"', '"Stykkliste"', '"Sjekk inn"', '"Marker som ferdig"', '"Gi nytt navn"', '"Slett"', '"Kostnad"'])
    assert.ok(v.includes(t), t);
  assert.match(v, /Skj76Thumb\(path: group\.thumbUrl/);
  assert.match(v, /group\.loc/);
  assert.match(v, /k\.giveBack\(line, qty: q, projectId: projectId, store\)/);
  assert.match(v, /k\.setDone\(id, !x\.done, store\)/);
  assert.match(v, /k\.rename\(id, n, store\)/);
  assert.match(v, /k\.delete\(id, store\)/);
  assert.match(v, /\.disabled\(locked\)/);
  const md = code('Skjold76Model.swift');
  assert.match(md, /case checkout\(String\)/);
  assert.match(md, /case projects\b/);
  assert.match(md, /case project\(String\)/);
  assert.match(md, /case \.projects: return "projects"/);
  const pg = code('Skjold76Page.swift');
  assert.match(pg, /case \.checkout\(let id\): Skj82Checkout\(partId: id\)/);
  assert.match(pg, /case \.projects: Skj82ProjectsSheet\(\)/);
  assert.match(pg, /case \.project\(let id\): Skj82ProjectSheet\(id: id\)/);
  assert.match(pg, /Skj82Entry\(\)/);
  assert.match(pg, /m\.sheet = \.projects/);
  assert.match(pg, /await Skjold82\.shared\.load\(store\)/);
});

test('plukklista: «Til produkt: [velg/ingen]» og «Ta ut av lager» sjekker ut til produktet', () => {
  assert.match(v, /struct Skj82PickTarget/);
  assert.match(v, /"Til produkt:"/);
  assert.match(v, /Button\("Ingen"\) \{ k\.pickTarget = nil \}/);
  assert.match(code('Skjold79Views.swift'), /Skj82PickTarget\(\)/);
  const pick = code('Skjold79Pick.swift');
  assert.match(pick, /if let t = Skjold82\.shared\.pickTarget, t\.valid \{/);
  assert.match(pick, /Skjold82\.shared\.checkout\(takes, to: t, note: "Fra plukklista", store\)/);
  // Uten produkt: som før.
  assert.match(pick, /adjust\(x\.partId, -Double\(x\.take\), store\)/);
});

test('Swift-hygiene: ingen tvungen utpakking og ingen try!', () => {
  for (const f of NEW) {
    const s = code(f);
    assert.doesNotMatch(s, /[A-Za-z0-9_)\]]!\./, `tvungen utpakking i ${f}`);
    assert.doesNotMatch(s, /try!/, f);
  }
});
