// Prompt 77 (SKJAIWEB): Glimt i Skjold Lab på web. De rene hjelperne (skjold77-logic.js) testes direkte, resten er kildesjekker.
// Oppførselen er sjekket i Chromium (Playwright, 1440 og 390 px, port 4802): ✦ Foreslå med kort og ✓/«Bruk alle», auto-forslag ved
// nytt bilde («Glimt tenker …»), Finn bilde (rutenett, forhåndsvisning, lagring), ⋯ → Rydd opp med fremdrift og «Godta valgte»,
// ⚙-panelet og Innstillinger → Moduler → Skjold Lab – uten JS-feil og uten vannrett scroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeSpecs77, mergeTags77, conf77, decodedLines77, suggRows77, specsObj77, tidyChanged77, tidyDefaultOn77, tidyRunning77 } from '../public/js/skjold77-logic.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('specs og tags slås sammen uten dubletter', () => {
  assert.deepEqual(mergeSpecs77([['verdi', '10k'], ['', '']], { Verdi: '10 kΩ', toleranse: '5 %' }), [['verdi', '10 kΩ'], ['toleranse', '5 %']]);
  assert.deepEqual(mergeSpecs77([['', '']], {}), [['verdi', '']]);
  assert.deepEqual(mergeSpecs77([], { effekt: '¼ W', tom: '' }), [['effekt', '¼ W']]);
  assert.deepEqual(specsObj77([['verdi', ' 10 kΩ '], ['', 'x'], ['pakke', '']]), { verdi: '10 kΩ' });
  assert.equal(mergeTags77('motstand, THT', ['tht', 'smd', ' ', 'Motstand']), 'motstand, THT, smd');
  assert.equal(mergeTags77('', ['led', 'rød']), 'led, rød');
});

test('sikkerhet: 0–1 (eller 0–100) blir prosent og et ord', () => {
  assert.deepEqual(conf77(0.82), { pct: 82, word: 'ganske sikker', lvl: 'hi' });
  assert.equal(conf77(0.6).lvl, 'mid');
  assert.equal(conf77(0.2).word, 'usikker');
  assert.equal(conf77(73).pct, 73);
  assert.equal(conf77(undefined).pct, null);
});

test('dekodet: fargebånd, SMD og kondensatorkode forklares', () => {
  assert.deepEqual(decodedLines77({ resistor: { bands: ['brown', 'black', 'orange', 'gold'], value: '10 kΩ', tolerance: '5 %' } }), ['Fargebånd brun–svart–oransje–gull = 10 kΩ 5 %']);
  assert.deepEqual(decodedLines77({ smd: { code: '4R7', text: '4,7 Ω' }, cap: { code: '104', value: '100 nF' } }), ['SMD-kode 4R7 = 4,7 Ω', 'Kondensatorkode 104 = 100 nF']);
  assert.deepEqual(decodedLines77({ resistor: '10 kΩ 5 %' }), ['Fargebånd = 10 kΩ 5 %']);
  assert.deepEqual(decodedLines77(null), []);
});

test('forslagskortet: rader for navn, kategori («ny»), specs og tags; uendret er markert', () => {
  const F = { name: '10k motstand', category: 'Motstander', specs: [['verdi', '10k']], tags: 'motstand' };
  const rows = suggRows77(F, { name: 'Motstand 10 kΩ ¼ W', category: 'Motstander', specs: { verdi: '10 kΩ', effekt: '¼ W' }, tags: ['motstand'] });
  assert.deepEqual(rows.map((r) => [r.k, r.same]), [['name', false], ['category', true], ['specs', false], ['tags', true]]);
  const n = suggRows77({ ...F, category: '' }, { name: 'LED 5 mm rød', category: 'Lysdioder', categoryNew: true });
  assert.equal(n.find((r) => r.k === 'category').isNew, true);
  assert.deepEqual(suggRows77(F, null), []);
});

test('Rydd opp: endret, avkrysset som standard og om jobben kjører', () => {
  const it = { partId: 3, before: { name: '10k', category: null }, after: { name: 'Motstand 10 kΩ', category: 'Motstander' }, confidence: 0.9 };
  assert.ok(tidyChanged77(it));
  assert.ok(tidyDefaultOn77(it));
  assert.ok(!tidyDefaultOn77({ ...it, confidence: 0.3 }), 'usikre forslag er ikke krysset av');
  assert.ok(!tidyChanged77({ before: { name: 'A', category: 'B', specs: { verdi: '1' } }, after: { name: 'A', category: 'B', specs: { verdi: '1' } } }));
  assert.ok(tidyChanged77({ before: { name: 'A', tags: [] }, after: { name: 'A', tags: ['ny'] } }));
  assert.ok(!tidyChanged77({ partId: 9, status: 'pending', before: { name: 'A' } }), 'venter');
  assert.ok(!tidyChanged77({ status: 'ready', changed: false, before: { name: 'A' }, after: { name: 'B' } }), 'serverens changed gjelder');
  assert.ok(!tidyDefaultOn77({ ...it, status: 'applied', changed: true }), 'allerede godtatt');
  for (const s of ['running', 'queued', 'waiting']) assert.ok(tidyRunning77(s), s);
  for (const s of ['done', 'ferdig', 'error', 'failed', 'completed']) assert.ok(!tidyRunning77(s), s);
});

test('modulen: API-kontrakten, tekster og sikkerhet', () => {
  const js = read('public/js/skjold77-ai.js');
  for (const s of ["'/ai/suggest'", "'/api/skjold/ai/suggest'", "'/ai/images'", '/photos/from-search`', "'/api/skjold/ai/tidy'", '/ai/tidy/${', '/skip`', '/apply`', '/history/${']) assert.ok(js.includes(s), `mangler ${s}`);
  for (const s of ['✦ Foreslå', 'Glimt tenker …', 'Bruk alle', 'Finn bilde', 'Bruk bildet', 'Rydd opp med Glimt', 'Godta valgte', 'Hopp over', 'class="sk77-new">ny<', 'Finn bilder på nett', 'Foreslå automatisk når jeg tar bilde']) assert.ok(js.includes(s), `mangler «${s}»`);
  assert.match(js, /75_000 : 40_000/, 'tidsavbrudd med og uten bilde');
  assert.match(js, /fd\.append\('file'/, 'nytt bilde sendes som multipart file');
  assert.match(js, /\/\^\\\/\(\?!\\\/\)\/\.test\(String\(x\?\.thumbUrl/, 'bare miniatyrer via serverens proxy');
  assert.match(js, /autoSuggestOnPhoto === false/);
  assert.doesNotMatch(js, /\son(error|load|click)="[a-z]/, 'CSP: ingen inline hendelser');
  const set = read('public/js/settings-skjold77.js');
  assert.match(set, /'\/skjold\/ai\/settings'/);
  assert.match(set, /webImages: true, autoSuggestOnPhoto: true/, 'begge på som standard');
});

test('koblet inn i Skjold Lab, skjemaet og Innstillinger', () => {
  const m = read('public/js/skjold76.js'), ed = read('public/js/skjold76-edit.js');
  assert.match(m, /from '\.\/skjold77-ai\.js'/);
  assert.match(m, /tidyRoute77\(seg\)/);
  assert.match(m, /v === 'tidy' \? tidyHtml77\(\)/);
  assert.match(m, /data-sk77-head/);
  assert.match(ed, /suggestBtn77\(F\)/);
  assert.match(ed, /suggestCard77\(F\)/);
  assert.match(ed, /finderHtml77\(F\)/);
  assert.match(ed, /onNewPhotos77\(F, added\)/);
  assert.match(ed, /saveWeb77\(F, id\)/);
  assert.match(ed, /default: return aiClick77\(a, F\)/);
  const s = read('public/js/settings.js');
  assert.match(s, /\.\.\.TABS77/);
  assert.match(s, /skjold: \(\) => skjView77\(H/);
  assert.match(s, /clickSkj77\(e, render\)/);
  assert.match(read('public/js/settings65.js'), /'studie', 'vaer', 'skjold'\]/);
  const css = read('public/css/skjold77.css');
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /transition:[^;}]*(width|height|top|left|margin|background)/);
});
