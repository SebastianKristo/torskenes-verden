// Prompt 82 (CHKAND): sjekk ut deler til et produkt i Skjold Lab på Android – kildesjekker og de rene reglene i Skjold82.kt oversatt til JS.
// De samme reglene er også kompilert og kjørt med kotlinc (stubber) mot fasiten under.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
/** Kode uten kommentarer. */
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ---- Speiler maxOut82 / clampOut82 / projectName82 / findActive82 / sortProjects82 / bom82 / returnPlan82 / canDelete82 ---- */
const maxOut = (stock) => (!(stock > 0) ? 0 : Math.min(9999, Math.floor(stock + 1e-9)));
const clampOut = (n, stock) => { const m = maxOut(stock); return m <= 0 ? 0 : Math.min(m, Math.max(1, n)); };
const projectName = (s) => { const t = String(s ?? '').trim().replace(/\s+/g, ' '); return t && t.length <= 80 ? t : null; };
const findActive = (list, name) => list.find((p) => p.status !== 'ferdig' && p.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;
const sortProjects = (list) => [...list.filter((p) => p.status !== 'ferdig'), ...list.filter((p) => p.status === 'ferdig')];
const net = (l) => Math.max(0, l.qty - l.returnedQty);
function bom(lines) {
  const g = new Map();
  for (const l of lines) { if (!g.has(l.partId)) g.set(l.partId, []); g.get(l.partId).push(l); }
  return [...g.entries()].map(([partId, ls]) => ({ partId, net: ls.reduce((a, l) => a + net(l), 0), lines: ls })).filter((b) => b.net > 1e-9);
}
function returnPlan(lines, qty) {
  let left = qty;
  const out = [];
  for (const l of lines.filter((x) => net(x) > 1e-9).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))) {
    if (left <= 1e-9) break;
    const n = Math.min(left, net(l));
    out.push([l.usageId, n]);
    left -= n;
  }
  return out;
}
const canDelete = (units) => units <= 1e-9;

test('filene finnes og er koblet inn', () => {
  assert.ok(existsSync(join(SRC, 'Skjold82.kt')));
  assert.ok(existsSync(join(SRC, 'ui/Skjold82Ui.kt')));
  const ui = code('ui/Skjold76Ui.kt');
  assert.match(ui, /"projects" -> ProjectsScreen82\(vm\)/, 'produktlista som egen skjerm');
  assert.match(ui, /"project" -> ProjectScreen82\(vm\)/, 'produktsiden');
  assert.match(ui, /"projects" -> "Produkter"/);
  assert.match(ui, /ProjectsEntry82\(vm\)/, '«Produkter» på forsiden');
  assert.match(ui, /CheckoutBtn82\(vm, pt\)/, '«Sjekk ut» på delsiden');
  assert.match(ui, /UsedIn82\(vm, pt\)/, '«Brukt i» på delsiden');
  assert.match(ui, /CheckoutSheet82\(vm\)/, 'arket');
  assert.match(code('ui/Skjold79Ui.kt'), /PickProject82\(\)/, '«Til produkt» i plukklista');
  const m = code('Skjold76.kt');
  assert.match(m, /Skjold82\.reset\(\)/);
  assert.match(m, /Skjold82\.modal -> Skjold82\.closeModal\(\)/, 'tilbake lukker arket først');
  assert.match(m, /loadProjects82\(quiet = true\)/);
  assert.match(m, /"produkt", "produkter"/, 'finanshub://skjold/produkt/<id>');
  const k79 = code('Skjold79.kt');
  assert.match(k79, /if \(takeOutTo82\(\)\) return/, 'Ta ut av lager med produkt går via utsjekking');
});

test('API-kallene følger CONTRACT82', () => {
  const k = code('Skjold82.kt');
  assert.match(k, /get82\("\/projects"\)/);
  assert.match(k, /get82\("\/projects\/\$\{enc82\(id\)\}"\)/);
  assert.match(k, /post82\("\/projects", JSONObject\(\)\.put\("name", n\)\)/);
  assert.match(k, /patch82\("\/projects\/\$\{enc82\(proj\.id\)\}", body\)/);
  assert.match(k, /put\("status", next\)/);
  assert.match(k, /del82\("\/projects\/\$\{enc82\(proj\.id\)\}"\)/);
  assert.match(k, /post82\("\/checkout", checkoutBody82\(/);
  assert.match(k, /put\("projectId", projectId[\s\S]{0,60}else put\("projectName"/, 'projectId eller projectName');
  assert.match(k, /put\("partId", id[\s\S]{0,40}\.put\("qty", q\)/);
  assert.match(k, /post82\("\/checkout\/undo", JSONObject\(\)\.put\("undoToken", token\)\)/, 'angre');
  assert.match(k, /offerUndo76\(outText82\(/, 'toast med Angre');
  assert.match(k, /post82\("\/usage\/\$\{enc82\(uid\)\}\/return", JSONObject\(\)\.put\("qty", n\)\)/, 'sjekk inn');
  assert.match(k, /optJSONArray\("usedIn"\)/, 'usedIn fra GET /parts/:id');
  assert.match(k, /status == 409/, '409 håndteres');
  assert.match(k, /MAX_NAME82 = 80/);
  assert.match(k, /Haptics\.success\(\)/);
  assert.match(k, /Haptics\.error\(\)/);
});

test('antall: 1 … lager, aldri under 0', () => {
  assert.equal(maxOut(3), 3);
  assert.equal(maxOut(2.5), 2);
  assert.equal(maxOut(0), 0);
  assert.equal(maxOut(-1), 0);
  assert.equal(clampOut(5, 3), 3);
  assert.equal(clampOut(0, 3), 1);
  assert.equal(clampOut(2, 0), 0);
});

test('produktnavn og valg av produkt', () => {
  assert.equal(projectName('  Vær  stasjon '), 'Vær stasjon');
  assert.equal(projectName(''), null);
  assert.equal(projectName('x'.repeat(81)), null);
  assert.equal(projectName('x'.repeat(80)).length, 80);
  const ps = [
    { id: '1', name: 'Gammel', status: 'ferdig' },
    { id: '2', name: 'Værstasjon', status: 'aktiv' },
    { id: '3', name: 'værstasjon', status: 'ferdig' },
  ];
  assert.equal(findActive(ps, 'VÆRSTASJON').id, '2', 'case-uavhengig');
  assert.equal(findActive(ps, 'gammel'), null, 'ferdige teller ikke');
  assert.deepEqual(sortProjects(ps).map((p) => p.id), ['2', '1', '3'], 'aktive først');
});

test('stykkliste, sjekk inn (nyeste først) og sletting', () => {
  const l = (usageId, partId, qty, returnedQty, at) => ({ usageId, partId, qty, returnedQty, at });
  const lines = [l('a', 'p1', 3, 0, '2026-11-01'), l('b', 'p2', 2, 2, '2026-11-02'), l('c', 'p1', 2, 1, '2026-11-03')];
  const b = bom(lines);
  assert.equal(b.length, 1, 'ferdig innsjekket del vises ikke');
  assert.equal(b[0].net, 4);
  assert.deepEqual(returnPlan(b[0].lines, 2), [['c', 1], ['a', 1]]);
  assert.equal(returnPlan(b[0].lines, 9).reduce((a, x) => a + x[1], 0), 4, 'aldri mer enn netto');
  assert.ok(canDelete(0));
  assert.ok(!canDelete(1));
});

test('UI-tekstene', () => {
  const u = code('ui/Skjold82Ui.kt');
  for (const t of ['Sjekk ut', 'Nytt produkt …', 'Til produkt', 'Brukt i', 'Produkter', 'Stykkliste', 'Sjekk inn', 'Marker som ferdig', 'Gi nytt navn', 'Slett', 'Ingen', 'Notat (valgfritt)']) {
    assert.ok(u.includes(t), t);
  }
  assert.match(u, /contentDescription = /);
  assert.match(u, /Haptics\./);
  const k = code('Skjold82.kt');
  assert.match(k, /"Sjekket ut \$\{qtyText76\(n\)\} stk til «\$project»"/);
  assert.match(k, /Sjekket inn/);
});
