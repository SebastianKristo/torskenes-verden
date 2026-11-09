// Prompt 76 (SKJWEB): Skjold Lab på web/PWA. Tegningen og perspektiv-matematikken testes direkte (ren modul),
// resten er kildesjekker. Oppførselen er sjekket i Chromium (Playwright, 1440 og 390 px) mot ekte server på port 4801:
// søk (forslag, «10k»), detalj, antall ±, flytt + angre, skuffvisning, hjørnehåndtak, perspektiv-overlegg, ny del med bilde,
// sletting, søk uten nett og flisen på Hjem – uten JS-feil og uten vannrett scroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homography76, mapPt76, matrix3d76, cornersOk76, drawCabinet76, overlayGrid76, ownLabel76 } from '../public/js/skjold76-draw.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('homografi: enhetskvadratet treffer de fire hjørnene', () => {
  const p = [{ x: 170, y: 85 }, { x: 622, y: 55 }, { x: 628, y: 995 }, { x: 172, y: 1060 }];
  const H = homography76(p);
  const near = (a, b) => assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  near(mapPt76(H, 0, 0), p[0]); near(mapPt76(H, 1, 0), p[1]); near(mapPt76(H, 1, 1), p[2]); near(mapPt76(H, 0, 1), p[3]);
  // Rektangel gir ren skalering (g = h = 0).
  const R = homography76([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 480 }, { x: 0, y: 480 }]);
  assert.equal(R.g, 0); assert.equal(R.h, 0);
  assert.match(matrix3d76(p, 300, 480), /^matrix3d\((-?[\d.e-]+,){15}-?[\d.e-]+\)$/);
});

test('hjørner: konveks firkant kreves', () => {
  assert.ok(cornersOk76({ tl: { x: 0.24, y: 0.07 }, tr: { x: 0.89, y: 0.05 }, br: { x: 0.9, y: 0.87 }, bl: { x: 0.25, y: 0.92 } }));
  assert.ok(!cornersOk76({ tl: { x: 0.9, y: 0.07 }, tr: { x: 0.2, y: 0.05 }, br: { x: 0.9, y: 0.87 }, bl: { x: 0.25, y: 0.92 } }), 'krysset');
  assert.ok(!cornersOk76(null));
  assert.ok(!cornersOk76({ tl: { x: 0, y: 0 } }));
});

test('tegning: 12 × 5 skuffer, valgt skuff uthevet med puls, rad og kolonne merket', () => {
  const svg = drawCabinet76({ rows: 12, cols: 5, name: 'Hovedskap', kind: 'kjøpt' }, { drawers: [{ row: 4, col: 2, label: 'M3-skruer', customLabel: 'M3-skruer', compartments: 2, count: 3 }] }, { sel: { row: 4, col: 2, compartment: 1 } });
  assert.equal((svg.match(/data-sk76-dr="/g) ?? []).length, 60);
  assert.match(svg, /data-sk76-dr="4-2"[^>]*aria-label="Rad 4 · Skuff 2 · M3-skruer · 3 deler"[^>]*aria-current="true"/);
  assert.match(svg, /class="sk76-hl pulse"/);
  assert.equal((svg.match(/sk76-num on/g) ?? []).length, 2, 'rad 4 og kolonne 2');
  assert.equal((svg.match(/class="sk76-wall"/g) ?? []).length, 1, 'to rom = én skillevegg');
  assert.equal(ownLabel76({ label: 'R1·S2' }), '');
  assert.equal(ownLabel76({ label: 'R1·S2', customLabel: null }), '');
  const ov = overlayGrid76({ rows: 12, cols: 5 }, { row: 4, col: 2 });
  assert.equal((ov.match(/data-sk76-ovc=/g) ?? []).length, 60);
  assert.match(ov, /data-sk76-ovc="4-2"><b class="pulse">/);
});

test('animasjon: bare opacity/transform, 2 s puls, redusert bevegelse respekteres', () => {
  const css = read('public/css/skjold76.css');
  assert.match(css, /animation:sk76pulse \.5s ease-in-out 4 alternate/);
  assert.match(css, /@keyframes sk76pulse\{from\{opacity:[\d.]+\}to\{opacity:[\d.]+\}\}/);
  assert.doesNotMatch(css, /transition:[^;}]*(width|height|top|left|margin|background)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /html\[data-mode="dark"\] \.sk76/);
});

test('modulen: API-kontrakten, matrix3d, offline-cache, angre', () => {
  const js = read('public/js/skjold76.js'), ed = read('public/js/skjold76-edit.js');
  for (const s of ["'/cabinets'", '/map`', '/parts?', '/suggest?q=', "'/categories'", '/qty`', '/move`', '/restore`', '/drawers/']) assert.ok(js.includes(s), `mangler ${s}`);
  for (const s of ["'/free'", '/corners`', '/photo`', '/photos`', '/import', '/api/skjold/export.csv']) assert.ok(ed.includes(s), `mangler ${s}`);
  assert.match(js, /\/api\/skjold\/labels/);
  assert.match(js, /ms: 10_000/, 'angre i 10 s');
  assert.match(js, /const LS = 'sk76_cache'/);
  assert.match(js, /Endringer krever nett/);
  assert.match(js, /data-sk76-mode="tegning">Tegning<\/button>.*data-sk76-mode="bilde">Bilde/);
  assert.match(read('public/js/skjold76-draw.js'), /return `matrix3d\(/);
  assert.match(ed, /capture="environment"/, 'kamera på mobil');
  assert.match(ed, /addEventListener\('drop'/, 'dra-og-slipp');
  assert.match(ed, /colsFromWidth76\(270\)/, 'tilleggsskap fra 27 cm');
  assert.doesNotMatch(js + ed, /\son(error|load|click)="[a-z]/, 'CSP: ingen inline hendelser');
  assert.match(read('public/js/usercache.js'), /'sk76_cache'/);
});

test('ruting, meny, Mer og flis på Hjem', () => {
  const app = read('public/js/app.js');
  assert.match(app, /skjold: renderSkjold76/);
  assert.match(app, /import\('\.\/skjold76\.js'\)\.then\(\(m\) => m\.mount\(view\)\)/);
  assert.match(app, /!\(route === 'skjold' && current\(\) === 'skjold'\)/);
  assert.match(read('public/app.html'), /<a href="#\/skjold" data-r="skjold">Skjold Lab<\/a>/);
  assert.match(read('public/js/profile.js'), /\['skjold', 'Skjold Lab'\]\]/);
  assert.match(read('public/js/net.js'), /'kart', 'skjold', 'domener'/);
  assert.match(read('public/js/boot52.js'), /'mediakveld', 'skjold'\]/);
  const h = read('public/js/home52.js');
  assert.match(h, /w52skj: \['Skjold Lab', 'h'\]/);
  assert.match(h, /'w52hus', 'w52skj'/);
  assert.match(h, /tile\('w52skj', 't52-card', '#\/skjold'/);
});
