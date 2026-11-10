// Prompt 82 (CHKWEB): «Sjekk ut / Sjekk inn» og Produkter i Skjold Lab på web.
// De rene hjelperne (skjold82-logic.js) testes direkte, resten er kildesjekker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { qtyFmt82, money82, clampQty82, target82, checkoutBody82, normProjects82, activeProjects82, summary82, lines82, hasActive82, usedIn82, historyText82, csv82, csvName82, shortText82, esc82, MAX_NAME82 } from '../public/js/skjold82-logic.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('antall: 1 … lager, desimaler for meter, aldri over lager', () => {
  assert.equal(clampQty82(3, 4), 3);
  assert.equal(clampQty82(9, 4), 4);
  assert.equal(clampQty82(0, 4), 1);
  assert.equal(clampQty82('2,5', 10), 2.5);
  assert.equal(clampQty82(1, 0.5), 0.5, 'under 1 på lager (meter) → maks det som finnes');
  assert.equal(clampQty82('x', 4), 1);
  assert.equal(qtyFmt82(2.5, 'm'), '2,5 m'); assert.equal(qtyFmt82(3), '3 stk');
  assert.equal(money82(null), ''); assert.match(money82(179), /^179 kr$/); assert.match(money82(2.5), /^2,50 kr$/);
});

test('valg av produkt og body til /checkout', () => {
  assert.deepEqual(target82(''), {});
  assert.deepEqual(target82('7'), { projectId: 7 });
  assert.deepEqual(target82('new', '  Vær  stasjon '), { projectName: 'Vær stasjon' });
  assert.ok(target82('new', '').error);
  assert.ok(target82('new', 'x'.repeat(MAX_NAME82 + 1)).error);
  const b = checkoutBody82({ partId: '12', qty: 9, max: 4, choice: 'new', newName: 'Værstasjon', note: ' v1 ' });
  assert.deepEqual(b.body, { projectName: 'Værstasjon', items: [{ partId: 12, qty: 4 }], note: 'v1' });
  assert.deepEqual(checkoutBody82({ partId: 3, qty: 1, max: 5, choice: '2' }).body, { projectId: 2, items: [{ partId: 3, qty: 1 }] });
  assert.ok(checkoutBody82({ partId: 3, qty: 1, max: 5, choice: '' }).error, 'produkt må velges');
  assert.ok(checkoutBody82({ partId: 3, qty: 1, max: 0, choice: '2' }).error, 'tomt lager');
});

test('produktlista: aktive først, sammendrag og linjer', () => {
  const L = normProjects82([{ id: 1, name: 'Gammel', status: 'ferdig', parts: 1, units: 2, cost: null }, { id: 2, name: 'Ny', status: 'aktiv', parts: 3, units: 12, cost: 245.5 }, { name: 'uten id' }]);
  assert.deepEqual(L.map((p) => p.id), ['2', '1']);
  assert.deepEqual(activeProjects82(L).map((p) => p.name), ['Ny']);
  assert.match(summary82(L[0]), /^3 deler · 12 stk · 245,50 kr$/);
  assert.equal(summary82({ parts: 1, units: 2, cost: null }), '1 del · 2 stk');
  const P = { items: [{ usageId: 1, qty: 3, returnedQty: 1 }, { usageId: 2, qty: 2, returnedQty: 2 }, { usageId: 3, qty: 1, returnedQty: 0, net: 1 }] };
  const { live, done } = lines82(P);
  assert.deepEqual(live.map((x) => [x.usageId, x.net]), [[1, 2], [3, 1]]);
  assert.deepEqual(done.map((x) => x.usageId), [2]);
  assert.equal(hasActive82(P), true); assert.equal(hasActive82({ items: [P.items[1]] }), false);
});

test('«Brukt i», historikk og 409-melding', () => {
  assert.deepEqual(usedIn82({ usedIn: [{ projectId: 1, name: 'A', qty: 2 }, { projectId: 2, name: 'B', qty: 0 }] }).map((x) => x.name), ['A']);
  assert.deepEqual(usedIn82({}), []);
  assert.equal(historyText82({ action: 'sjekket ut', from: { qty: 4 }, to: { qty: 2, text: 'Sjekket ut 2 stk til «Værstasjon»' } }), 'Sjekket ut 2 stk til «Værstasjon»');
  assert.equal(historyText82({ action: 'antall', from: { qty: 4 }, to: { qty: 3 } }), 'antall 4 → 3', 'ikke [object Object]');
  assert.equal(shortText82({ short: [{ name: 'ESP32', have: 1, want: 3, unit: 'stk' }] }), 'Ikke nok «ESP32» på lager (1 stk)');
  assert.equal(shortText82({ error: 'Noe' }), 'Noe');
  assert.equal(esc82('<b>"'), '&lt;b&gt;&quot;');
});

test('CSV: semikolon, desimalkomma, sitering og filnavn', () => {
  const csv = csv82({ items: [{ name: 'Motstand; 10k', qty: 5, returnedQty: 1, unit: 'stk', price: 0.25, loc: 'Hovedskap · Rad 1 · Skuff 1', at: '2026-11-10T10:00:00Z', note: 'v1' }] });
  const rows = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(rows[0], 'Del;Antall;Enhet;Sjekket inn;I bruk;Pris;Sum;Plassering;Dato;Notat');
  assert.equal(rows[1], '"Motstand; 10k";5;stk;1;4;0,25;1;Hovedskap · Rad 1 · Skuff 1;2026-11-10;v1');
  assert.equal(csvName82('Værstasjon «v2»'), 'produkt-vaerstasjon-v2.csv');
});

test('kilde: delsiden har «Sjekk ut» og «Brukt i», shell har Produkter, ruter og hendelser er koblet', () => {
  const s76 = read('public/js/skjold76.js');
  for (const k of ['partBtn82(p)', 'usedInHtml82(p)', 'headBtn82()', 'route82(seg)', 'isView82(v) ? html82()', 'click82(t)', 'submit82(e)', 'start82(r)', 'historyText82(h)'])
    assert.ok(s76.includes(k), k);
  const m = read('public/js/skjold82-projects.js');
  for (const k of ["'/checkout'", "'/checkout/undo'", '/return`', "'/projects'", "method: 'PATCH'", "method: 'DELETE'", 'Marker som ferdig', 'Gi nytt navn', 'Sjekk inn', 'Nytt produkt …', 'Eksporter CSV', "action: 'Angre'", 'haptic(', 'role="dialog"', 'aria-modal="true"', "e.key === 'Escape'", '#/skjold/produkt/', '#/skjold/produkter', 'Brukt i'.toUpperCase()])
    assert.ok(m.includes(k), k);
  assert.ok(/disabled title="Sjekk inn delene først"/.test(m), 'Slett er av med aktive utsjekkinger');
  assert.ok(!/innerHTML\s*=\s*[^;]*\$\{(?!esc|sheetHtml|html)/.test(m), 'ingen urensket innerHTML');
  const pick = read('public/js/skjold79-pick.js');
  assert.ok(pick.includes('pickTargetHtml82()') && pick.includes('...to') && pick.includes("'/checkout/undo'"), 'plukklista: Til produkt + angre med undoToken');
  const css = read('public/css/skjold82.css');
  assert.ok(css.includes('@media (max-width:767px)') && css.includes('.sk82-sheet') && css.includes('focus-visible'));
});
