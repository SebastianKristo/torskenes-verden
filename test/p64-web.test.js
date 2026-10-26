// Prompt 64 (prompt 49 del 7, D7WEB): web-delen av «Kvalitet over tid» (SERVER64-API.md). Innstillinger → Kvalitet (ukerapporten
// og nattlige eval-kjøringer), bryterne i AI-kontroll → Valg og lenkene fra pushene. Nettleseren er sjekket med Playwright mot
// mock-serveren; her kjøres hjelperne og kildene sjekkes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const Q = rd('public/js/quality64.js');
const S64 = rd('public/js/settings64.js');
const ST = rd('public/js/settings.js');
const A = rd('public/js/ai-control.js');
const SS = rd('public/js/settings-search.js');
const q = await import('../public/js/quality64.js');

test('lenkene fra pushene (SERVER64-API.md §4) tolkes og skrives om til #/innstillinger/kvalitet', () => {
  assert.equal(q.ROUTE64, '/#/innstillinger/kvalitet');
  assert.deepEqual(q.parseRoute64('#/innstillinger/kvalitet'), {});
  assert.deepEqual(q.parseRoute64('#/innstillinger/kvalitet/run/q1a2b3c4d5e6f70'), { run: 'q1a2b3c4d5e6f70' });
  assert.deepEqual(q.parseRoute64('#/innstillinger/kvalitet/uke/2026-W44'), { week: '2026-W44' });
  assert.deepEqual(q.parseRoute64('#/innstillinger/ai/kvalitet/uke/2026-W44'), { week: '2026-W44' });
  assert.deepEqual(q.parseRoute64('#/innstillinger/kvalitet/run/ikke-en-id'), {});
  assert.deepEqual(q.parseRoute64('#/innstillinger/kvalitet/uke/44'), {});
  assert.equal(q.parseRoute64('#/innstillinger/ai'), null);
  assert.equal(q.parseRoute64(''), null);
  // settings.js leser bare to ledd, så modulen skriver om adressen før settings.js ser den.
  assert.match(Q, /takeRoute\(\); \/\/ før settings\.js leser adressen/);
  assert.match(Q, /history\.replaceState\(history\.state, '', `\$\{location\.pathname\}\$\{location\.search\}#\/innstillinger\/kvalitet`\)/);
});

test('tall og tekst: svartid, andeler, statuslinjer og regresjoner', () => {
  assert.equal(q.ms64(812), '812 ms');
  assert.equal(q.ms64(4100), '4,1 s');
  assert.equal(q.ms64(18_240), '18,2 s');
  assert.equal(q.ms64(812_345), '13 min 32 s');
  assert.equal(q.ms64(2 * 3600_000 + 14 * 60_000), '2 t 14 min');
  assert.equal(q.ms64(null), '–');
  assert.equal(q.pct64(0.876), '88 %');
  assert.equal(q.pct64(undefined), '–');
  assert.deepEqual(q.status64('regression'), ['Regresjon', 'bad']);
  assert.deepEqual(q.status64('skipped'), ['Hoppet over', 'mut']);
  assert.deepEqual(q.caseStatus64('env'), ['Miljøfeil', 'mut']);
  const run = { status: 'regression', passed: 120, total: 129, greenCases: 40, cases: 43, p50Ms: 4100, p90Ms: 18200, modelFailures: 6, envFailures: 3, improved: [{}], newCases: 2, notified: true };
  assert.equal(q.runLine64(run), '120/129 bestått · 40/43 caser grønne · p50 4,1 s · p90 18,2 s');
  assert.equal(q.extraLine64(run), '6 modellfeil · 3 miljøfeil (teller ikke) · 1 case bedre · 2 nye caser · push sendt');
  assert.equal(q.runLine64({ status: 'skipped', reason: 'Ollama svarte ikke på http://x:11434' }), 'Ollama svarte ikke på http://x:11434');
  assert.equal(q.runLine64({ status: 'running', progress: { done: 12, total: 129, current: '05-middag-fredag' } }), '12 av 129 · 05-middag-fredag');
  assert.equal(q.progress64({ status: 'running', progress: null }), 'Starter …');
  assert.equal(q.progressPct64({ progress: { done: 43, total: 129 } }), 33);
  assert.equal(q.regLine64({ caseId: '07-vaer-to-steder', before: '3/3', now: '1/3', reason: 'Svarte for Oslo' }), '07-vaer-to-steder 3/3 → 1/3: Svarte for Oslo');
  const sorted = q.sortCases64([{ id: 'a', status: 'green' }, { id: 'b', status: 'env' }, { id: 'c', status: 'red' }, { id: 'd', status: 'partial', regression: true }, { id: 'e', status: 'partial' }]);
  assert.deepEqual(sorted.map((c) => c.id), ['d', 'c', 'e', 'b', 'a']);
});

test('ukerapporten: egne tall i fliser, systemtall for admin', () => {
  const u = { requests: 42, firstTry: 37, firstTryShare: 0.88, corrections: 3, newRecipes: 2, fast: 5, fastShare: 0.12, cache: 4, cacheShare: 0.1, medianMs: 2400, p90Ms: 8100 };
  assert.deepEqual(q.weeklyRows64(u).map((r) => r.slice(0, 2)), [['Forespørsler', '42'], ['Løst på første forsøk', '88 %'], ['Rettelser', '3'], ['Nye oppskrifter', '2'], ['Hurtigvei', '12 %'], ['Svar-cache', '10 %'], ['Median svartid', '2,4 s']]);
  assert.equal(q.weeklyRows64(u)[1][2], '37 av 42');
  assert.equal(q.weeklyRows64(u)[6][2], 'p90 8,1 s');
  assert.deepEqual(q.weeklyRows64(null), []);
  assert.equal(q.systemLine64({ requests: 80, users: 3, firstTryShare: 0.86, corrections: 5, newRecipes: 4, fastShare: 0.1, medianMs: 2600 }), '80 forespørsler fra 3 brukere · 86 % første forsøk · 5 rettelser · 4 nye oppskrifter · hurtigvei 10 % · median 2,6 s');
  assert.equal(q.systemLine64(undefined), '');
  assert.equal(q.evalWeekLine64({ runs: 7, completed: 6, regressions: 1, aborted: 1, skipped: 0 }), '7 nattlige kjøringer · 6 fullført · 1 regresjon · 1 avbrutt');
});

test('valgene: samme grenser som serveren, brukerens valg null når det er lik standard', () => {
  assert.deepEqual(q.serverBody64('runs', '5'), { scope: 'server', runs: 5 });
  assert.equal(q.serverBody64('runs', 6), null);
  assert.equal(q.serverBody64('maxMinutes', 10), null);
  assert.deepEqual(q.serverBody64('interactiveWaitSec', 20), { scope: 'server', interactiveWaitSec: 20 });
  assert.deepEqual(q.serverBody64('keepDays', 30), { scope: 'server', keepDays: 30 });
  assert.equal(q.serverBody64('keepDays', 200), null);
  assert.deepEqual(q.serverBody64('nightly', false), { scope: 'server', nightly: false });
  assert.equal(q.serverBody64('slett', true), null);
  for (const [k, xs] of [['runs', q.RUNS64], ['maxMinutes', q.MAXMIN64], ['interactiveWaitSec', q.WAIT64], ['keepDays', q.KEEP64]]) for (const v of xs) assert.ok(q.serverBody64(k, v), `${k}=${v}`);
  assert.deepEqual(q.userWeeklyBody64(false, true), { scope: 'user', weekly: false });
  assert.deepEqual(q.userWeeklyBody64(true, true), { scope: 'user', weekly: null });
});

test('kildene: endepunktene, Kjør nå/Avbryt, rapporten som tekst og at eval-delen er admin-only', () => {
  for (const s of ["call('/settings')", 'call(`/weekly${wkQ()}`)', "call('/runs?limit=30')", 'call(`/runs/${encodeURIComponent(id)}`)', 'call(`/runs/${encodeURIComponent(id)}?format=md`',
    "call('/run-now', 'POST', {})", "call('/abort', 'POST')", "call('/settings', 'PUT'", '?format=json', 'Kjør nå', 'Avbryt', 'Åpne rapporten', 'Ukerapport', 'Nattlig eval', 'Miljøfeil', 'teller ikke']) assert.ok(Q.includes(s), s);
  // Rapporten (markdown fra serveren) settes inn escapet i <pre>, aldri som HTML.
  assert.match(Q, /<pre class="q64-md" data-no-i18n tabindex="0">\$\{esc\(/);
  // Ikke-admin (403 på /runs eller admin:false) ser bare ukerapporten.
  assert.match(Q, /if \(Q\.admin403 \|\| \(Q\.set && !Q\.set\.admin\)\) return '';/);
  assert.match(Q, /Q\.admin403 = r\.reason\.status === 403/);
  // Eldre server: ingenting i AI-kontroll, «Oppdater serveren» på siden.
  assert.match(Q, /if \(Q\.missing\) return '';/);
  assert.match(Q, /Oppdater serveren/);
  // Pollingen mens evalen kjører bruker /runs (ferskest), ikke en gammel settings.running.
  assert.match(Q, /const running = \(\) => \(Q\.runs \? Q\.runs\.running \?\? null : Q\.set\?\.running \?\? null\);/);
});

test('plassering: egen fane Innstillinger → Kvalitet (selvstendig modul) og bryterne i AI-kontroll → Valg', () => {
  assert.match(S64, /export const TABS64 = \[\['kvalitet', 'Kvalitet', [^\]]*'Glimt', P64\]\]/);
  assert.match(S64, /mount: \(slot\) => mountQuality64\(slot\)/);
  assert.match(ST, /import \{ TABS64, ALIAS64, kvalitetView64 \} from '\.\/settings64\.js';/);
  assert.match(ST, /\.\.\.TABS62, [^\n]*\n {2}\.\.\.TABS64,/);
  assert.match(ST, /Object\.assign\(ALIAS, ALIAS64\);/);
  assert.match(ST, /kvalitet: \(\) => kvalitetView64\(H\)/);
  assert.match(SS, /\['kvalitet', 'Kvalitet', 'Glimt → Kvalitet', 'kvalitet', '[^']*ukerapport[^']*'\]/);
  assert.match(A, /<div data-mem63set><\/div><div data-q64set><\/div>/);
  assert.match(A, /import\('\.\/quality64\.js'\)/);
  for (const s of ['data-q64-user="weekly"', 'data-q64-server="${k}"', "seg('runs'", "seg('maxMinutes'", "seg('interactiveWaitSec'", "seg('keepDays'", 'data-q64-go']) assert.ok(Q.includes(s), s);
});
