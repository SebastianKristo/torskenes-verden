// Prompt 61 (prompt 49 del 1, D1WEB): web/PWA-delen av «Glimt lærer» (SERVER61-API.md). Siden «Glimt lærer» i Innstillinger → AI,
// tommel opp/ned på Glimt-svar i Chat og Glimt-søket på Hjem, og fire brytere i AI-kontroll → Valg. Nettleseren er sjekket med
// Playwright mot mock-serveren; her kjøres hjelperne og kildene sjekkes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const C = rd('public/js/chat.js');
const X = rd('public/js/extras.js');
const G = rd('public/js/glimt-agent45.js');
const A = rd('public/js/ai-control.js');
const SA = rd('public/js/settings-ai.js');
const R = rd('public/js/recipes61.js');

const r = await import('../public/js/recipes61.js');
const ga = await import('../public/js/glimt-agent45.js');

const IT = { id: 'r1', status: 'active', queryTemplate: 'når er neste gang jeg skal til {person}', plan: { calls: [{ tool: 'calendar.search', args: { terms: '{person.aliases}', direction: 'next' } }] }, writes: false, allowFastWrite: false,
  useCount: 7, successCount: 6, failCount: 1, last10: { success: 6, fail: 0, pending: 1 }, readable: 'Søk i kalenderen etter {person}', readableSteps: ['Søk i kalenderen etter {person}'] };

test('variabler: bare {person}, {person.aliases}, {place} og {when} er lov', () => {
  assert.deepEqual(r.badVars61('til {person} {when} i {place}'), []);
  assert.deepEqual(r.badVars61('{"terms":"{person.aliases}"}'), []);
  assert.deepEqual(r.badVars61('til {x} og {x} og {by}'), ['x', 'by']);
});

test('redigering: bare endrede felt sendes, og feil stoppes før PATCH', () => {
  const plan = JSON.stringify(IT.plan);
  assert.deepEqual(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: plan }, IT), { body: {} });
  assert.deepEqual(r.checkEdit61({ queryTemplate: 'når skal jeg til {person}', planText: plan }, IT), { body: { queryTemplate: 'når skal jeg til {person}' } });
  assert.match(r.checkEdit61({ queryTemplate: 'ab', planText: plan }, IT).error, /3–200 tegn/);
  assert.match(r.checkEdit61({ queryTemplate: 'til {x}', planText: plan }, IT).error, /Ukjent variabel i malen: \{x\}/);
  assert.match(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: '{ikke json' }, IT).error, /gyldig JSON/);
  assert.match(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: '{"calls":[]}' }, IT).error, /1–6 kall/);
  assert.match(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: JSON.stringify({ calls: Array(7).fill({ tool: 'a', args: {} }) }) }, IT).error, /1–6 kall/);
  assert.match(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: '{"calls":[{"args":{}}]}' }, IT).error, /«tool»/);
  assert.match(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: '{"calls":[{"tool":"weather.get","args":{"place":"{by}"}}]}' }, IT).error, /Ukjent variabel i planen: \{by\}/);
  const p2 = { calls: [{ tool: 'calendar.search', args: { terms: '{person.aliases}', direction: 'prev' } }] };
  assert.deepEqual(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: JSON.stringify(p2) }, IT), { body: { plan: p2 } });
  assert.deepEqual(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: JSON.stringify(p2.calls) }, IT), { body: { plan: p2 } }); // ren liste godtas
  assert.deepEqual(r.checkEdit61({ queryTemplate: IT.queryTemplate, planText: plan, allowFastWrite: true }, { ...IT, writes: true }), { body: { allowFastWrite: true } });
});

test('statistikk og lesbar plan', () => {
  assert.equal(r.statLine61(IT), 'Brukt 7 ganger · 6 vellykket · 1 feil · siste 10: 6/7');
  assert.equal(r.statLine61({}), 'Ikke brukt ennå');
  assert.deepEqual(r.readable61(IT), ['Søk i kalenderen etter {person}']);
  assert.deepEqual(r.readable61({ plan: { calls: [{ tool: 'weather.get', args: { place: '{place}' } }] } }), ['weather.get(place: {place})']);
  assert.equal(r.STATUS61.candidate, 'Kandidat');
});

test('tommel: vises bare med traceId, og stemmen sendes til /api/glimt/recipes/feedback', async () => {
  assert.equal(r.thumbs61Html(null), '');
  assert.equal(r.thumbs61Html('ugyldig id med mellomrom'), '');
  const h = r.thumbs61Html('t1a2b3');
  assert.match(h, /data-th61="up" data-th61-id="t1a2b3" aria-pressed="false"/);
  assert.match(h, /data-th61="down"/);
  assert.match(r.thumbs61Html('t1a2b3', { dark: true }), /class="th61 dark"/);
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, o) => { calls.push({ url, body: JSON.parse(o.body) }); return new Response(JSON.stringify({ ok: true, vote: 'up', recipe: { status: 'active' }, run: { state: 'success' } }), { headers: { 'content-type': 'application/json' } }); };
  try {
    await r.sendVote61('t1a2b3', 'up');
    assert.deepEqual(calls[0], { url: '/api/glimt/recipes/feedback', body: { traceId: 't1a2b3', vote: 'up' } });
    assert.equal(r.vote61('t1a2b3'), 'up');
    assert.match(r.thumbs61Html('t1a2b3'), /class="th61-b on" data-th61="up"/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Fant ikke svaret (eller det er for gammelt)' }), { status: 404, headers: { 'content-type': 'application/json' } });
    await assert.rejects(r.sendVote61('t1a2b3', 'down'));
    assert.equal(r.vote61('t1a2b3'), 'up'); // feil → forrige stemme står
    assert.match(r.thumbs61Html('t1a2b3'), /for gammelt/);
  } finally { globalThis.fetch = real; }
  assert.match(R, /if \(th\) \{[\s\S]*?next = vote61\(id\) === k \? null : k/); // nytt trykk på samme = angre (null)
});

test('Glimt-svaret: traceId og recipe tas vare på', () => {
  const a = ga.normAgent({ reply: 'Ja', traceId: 't9', recipe: { id: 'r1', use: 'fast', status: 'active' } });
  assert.equal(a.traceId, 't9');
  assert.equal(a.recipe.use, 'fast');
  assert.equal(ga.normAgent({ reply: 'x' }).traceId, null);
  assert.match(G, /traceId: d\.traceId \?\? null, recipe:/);
});

test('Chat og Glimt-søket på Hjem viser tommel opp/ned', () => {
  assert.match(C, /import \{ thumbs61Html \} from '\.\/recipes61\.js'/);
  assert.match(C, /\$\{meta\.glimt && meta\.traceId && !meta\.stopped \? thumbs61Html\(meta\.traceId\) : ''\}/);
  assert.match(C, /\.\.\.\(a\.traceId \? \{ traceId: a\.traceId \} : \{\}\)/);
  assert.equal((C.match(/traceId: g\.traceId \?\? raw\.traceId \?\? null/g) ?? []).length, 2);
  assert.match(C, /if \(a\.traceId\) meta\.traceId = a\.traceId;/);
  assert.match(X, /import \{ thumbs61Html \} from '\.\/recipes61\.js'/);
  assert.match(X, /GL\.ans\.agent\?\.traceId && !GL\.ans\.stopped \? thumbs61Html\(GL\.ans\.agent\.traceId, \{ dark: true \}\)/);
});

test('AI-kontroll → Valg: «Glimt lærer» med fire brytere (bruker + admin)', () => {
  assert.match(A, /import\('\.\/recipes61\.js'\)/);
  assert.match(A, /<div data-understand60><\/div><div data-recipes61><\/div>/);
  assert.match(R, /fetch\('\/api\/glimt\/recipes\/settings'/);
  assert.match(R, /putSettings\(\{ scope: 'user', \[k\]: next === srv \? null : next \}\)/);
  assert.match(R, /putSettings\(\{ scope: 'server', \[k\]: next \}\)/);
  assert.deepEqual(r.KEYS61, ['save', 'fewshot', 'fast', 'learn']);
  for (const n of ['Lagre oppskrifter', 'Bruk som eksempler', 'Hurtigvei', 'Lær av rettelser', 'Slått av for alle av administrator']) assert.ok(R.includes(n), n);
});

test('Innstillinger → AI: siden «Glimt lærer» med liste, test, rediger, slå av og slett', () => {
  assert.match(SA, /import '\.\/recipes61\.js';/);
  assert.match(SA, /groups\.push\(\{ t: 'Glimt lærer'/);
  assert.match(SA, /<div data-learn61 data-hl="ai-learn61"><\/div>/);
  assert.ok(SA.indexOf('data-ent60') < SA.indexOf('data-learn61'), 'rett under entitetsregisteret');
  for (const m of ["'/stats'", "/test`, 'POST'", "'PATCH', { status: ds.r61St }", "'DELETE'", 'Trykk igjen for å slette', 'Rediger mal', 'Slå av', 'Slå på', 'Negative eksempler', 'Siste kjøringer', 'Hurtigvei også for endringer']) assert.ok(R.includes(m), m);
});
