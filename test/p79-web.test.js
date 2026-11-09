// Prompt 79 (PICKWEB): plukkliste og «Feilsøk LED» i Skjold Lab på web. De rene hjelperne (skjold79-logic.js) testes direkte, resten er kildesjekker.
// Oppførselen er sjekket i Chromium (Playwright, 1440 og 390 px, port 4804) mot ekte server og mocket WLED: + / ✓ i lista og på detaljsiden,
// plukklistelinja over mobilmenyen, «💡 Vis alle med LED» (én farge per del i WLED-payloaden og i lista), arket med ± / Fjern / Tøm,
// «Ta ut av lager» med angre, lista overlever omlasting (lokalt + GET|PUT /picklist), og Feilsøk LED trinn for trinn – uten JS-feil og uten vannrett scroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_LIT79, PALETTE79, palette79, colorAt79, hex79, normPick79, toggle79, setQty79, has79, pickBody79, locateBody79, colorsOf79, skippedOf79, hint79, steps79, report79 } from '../public/js/skjold79-logic.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('paletten: 8–12 tydelige farger, skapets farge først og ingen dobbel', () => {
  assert.ok(PALETTE79.length >= 8 && PALETTE79.length <= 12);
  assert.equal(new Set(PALETTE79).size, PALETTE79.length);
  assert.deepEqual(PALETTE79.slice(0, 4), ['#2F6BFF', '#FFD000', '#22C55E', '#EF4444'], 'blå, gul, grønn, rød');
  const p = palette79('ffd000');
  assert.equal(p[0], '#FFD000'); assert.equal(p.filter((c) => c === '#FFD000').length, 1);
  assert.equal(palette79(null)[0], '#2F6BFF');
  assert.equal(colorAt79(1, '#123456'), '#FFD000');
  assert.equal(colorAt79(PALETTE79.length, null), '#2F6BFF', 'går rundt');
  assert.equal(hex79('#abc'), null); assert.equal(hex79('a1b2c3'), '#A1B2C3');
});

test('plukklista leses romslig, uten doble og med antall ≥ 1', () => {
  const L = normPick79({ items: [{ partId: 5, qty: 2 }, { id: '7', take: 0 }, { partId: 5, qty: 9 }, { partId: null }, 9] });
  assert.deepEqual(L.map((x) => [x.id, x.qty]), [['5', 2], ['7', 1], ['9', 1]]);
  assert.deepEqual(normPick79({ picklist: [{ partId: 1 }] }).map((x) => x.id), ['1']);
  assert.deepEqual(normPick79(null), []);
  const snap = normPick79([{ id: 3, name: 'ESP32', loc: { cabinetId: 1, row: '2', col: 3 }, stock: '4', evil: '<x>' }])[0];
  assert.deepEqual(snap, { id: '3', qty: 1, name: 'ESP32', loc: { cabinetId: 1, row: 2, col: 3 }, stock: 4 });
});

test('+ / ✓, ± og body til serveren', () => {
  let L = toggle79([], { id: 4, name: 'Gul LED', qty: 30, unit: 'stk' });
  assert.ok(has79(L, 4)); assert.equal(L[0].name, 'Gul LED'); assert.equal(L[0].stock, 30);
  L = toggle79(L, { id: 8, name: 'ESP32' }); L = toggle79(L, { id: 2, name: 'Transistor' });
  assert.deepEqual(L.map((x) => x.id), ['4', '8', '2'], 'rekkefølgen delene ble lagt til');
  L = setQty79(L, 8, 3); assert.equal(L[1].qty, 3);
  assert.equal(setQty79(L, 8, 0)[1].qty, 3, 'aldri under 1');
  assert.ok(!has79(toggle79(L, 8), 8), 'nytt trykk fjerner');
  assert.deepEqual(pickBody79(L), { items: [{ partId: 4, qty: 1 }, { partId: 8, qty: 3 }, { partId: 2, qty: 1 }] });
  const many = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), qty: 1 }));
  const b = locateBody79(many);
  assert.equal(MAX_LIT79, 20); assert.equal(b.partIds.length, 20); assert.equal(b.colors, true); assert.equal(b.partIds[0], 1);
});

test('farge per del: fra serveren, ellers paletten; samme skuff deler farge', () => {
  const items = normPick79([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
  const lit = [{ partId: 1, cabinetId: 1, row: 1, col: 1, color: '#2f6bff' }, { partId: 2, cabinetId: 1, row: 1, col: 2 }, { partId: 3, cabinetId: 1, row: 1, col: 2 }];
  assert.deepEqual(colorsOf79(items, lit, null), { 1: '#2F6BFF', 2: '#FFD000', 3: '#FFD000' }, 'del 3 deler skuff med 2 – første farge vinner; del 4 lyser ikke');
  assert.deepEqual(skippedOf79([{ partId: 4, code: 'max' }, { partId: 5, reason: 'Noe annet' }, { cabinetId: 1, code: 'no_led' }]), { 4: 'Over 20 samtidig', 5: 'Noe annet' });
});

test('Feilsøk LED: hint ut fra svarene og rapporten', () => {
  assert.equal(hint79(null, true), null);
  assert.match(hint79(false, false).title, /maskinvaren/); assert.ok(hint79(false, false).items.some((x) => /GPIO/.test(x)) && hint79(false, false).items.some((x) => /jord/.test(x)) && hint79(false, false).items.some((x) => /Nivåskifter/.test(x)));
  assert.match(hint79(true, false).title, /feil hos oss/);
  assert.match(hint79(true, true).title, /kalibreringen eller indeksen/);
  assert.equal(hint79(true, true).cls, 'ok');
  const s = steps79({ steps: [{ key: 'info', name: 'Kontakt', ok: true, detail: 'WLED 0.15' }, { name: 'Rødt', ok: false }, {}] });
  assert.deepEqual(s.map((x) => x.ok), [true, false, null]); assert.equal(s[2].name, 'Steg 3');
  const r = report79({ name: 'Hovedskap' }, s, true, false, 'Feil hos oss');
  assert.match(r, /Hovedskap/); assert.match(r, /✓ Kontakt: WLED 0\.15/); assert.match(r, /Lyste stripa rødt: ja/); assert.match(r, /Lyste én LED blått: nei/);
});

test('modulen: API-kontrakten, tekster og sikkerhet', () => {
  const js = read('public/js/skjold79-pick.js');
  for (const s of ["'/picklist'", "'/picklist/take'", "'/picklist/undo'", '/leds/diagnose`', "step: 'check'", "step: 'red'", "step: 'blue'", "step: 'restore'", 'locateBody79(P.items)', "localStorage.getItem(LS)", "'sk79_pick'", 'e?.status === 404']) assert.ok(js.includes(s), `mangler ${s}`);
  for (const s of ['Plukkliste (', 'Vis alle med LED', 'Slå av', 'Ta ut av lager', 'Tøm', 'Fjern', 'Angre', 'Feilsøk LED', 'Lyste stripa rødt?', 'Lyste én LED blått?', 'Kopier rapport', '+ Plukkliste', '✓ I plukklista']) assert.ok(js.includes(s), `mangler «${s}»`);
  assert.match(js, /haptic\(/, 'haptikk på + der det finnes');
  assert.match(js, /aria-modal="true"/); assert.match(js, /e\.key === 'Escape'/);
  assert.doesNotMatch(js, /\son(error|load|click|input)="[a-z]/, 'CSP: ingen inline hendelser');
  const css = read('public/css/skjold79.css');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.sk79-bar\{position:sticky/, 'linja er sticky nederst');
  assert.match(css, /\.sk76\.sk79-port\{display:contents\}/, 'arket ligger over mobilmenyen');
});

test('koblet inn i Skjold Lab og LED-oppsettet', () => {
  const m = read('public/js/skjold76.js'), l = read('public/js/skjold78-leds.js');
  assert.match(m, /from '\.\/skjold79-pick\.js'/);
  assert.match(m, /\$\{lb\}\$\{pickBtn79\(p\)\}/, '+ ved hvert treff');
  assert.match(m, /pickBtn79\(p, true\)/, '+ på detaljsiden');
  assert.match(m, /pickShellHtml79\(\)/);
  assert.match(m, /if \(click79\(t\)\) return;/); assert.match(m, /if \(key79\(e\)\) return;/); assert.match(m, /route79\(r\)/); assert.match(m, /loadPick79\(\)/);
  assert.match(l, /\$\{diagBtn79\(c\)\}/); assert.match(l, /\$\{diagHtml79\(c\)\}/);
  assert.match(l, /x\.color/, 'lyslinja viser fargen per del');
  assert.match(l, /export async function off78/);
});
