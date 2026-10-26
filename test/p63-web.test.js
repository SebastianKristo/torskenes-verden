// Prompt 63 (prompt 49 del 5, D5WEB): web-delen av «Minnet holder seg ryddig» (SERVER63-API.md). Forslag, Motstrid og «Ikke brukt
// på lenge» i Innstillinger → AI → Glimt husker, bryterne i AI-kontroll → Valg, lenken fra morgen-pushen og systemoppgaven i
// Faste oppgaver. Nettleseren er sjekket med Playwright mot mock-serveren; her kjøres hjelperne og kildene sjekkes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const M = rd('public/js/memory63.js');
const SA = rd('public/js/settings-ai.js');
const A = rd('public/js/ai-control.js');
const ST = rd('public/js/settings.js');
const R = rd('public/js/sched62.js');
const m = await import('../public/js/memory63.js');

const NOW = new Date('2026-10-26T10:00:00Z');

test('ubrukte fakta: dager, «sist brukt» og tittel (Europe/Oslo)', () => {
  assert.equal(m.days63(1), '1 dag');
  assert.equal(m.days63(90), '90 dager');
  assert.equal(m.date63('2026-06-17T10:00:00Z', NOW), '17. juni');
  assert.equal(m.date63('2025-12-31T23:30:00Z', NOW), '1. jan'); // 00:30 i Oslo
  assert.equal(m.date63('2025-02-03T10:00:00Z', NOW), '3. feb 2025');
  assert.equal(m.date63(null, NOW), '');
  assert.equal(m.staleLine63({ daysUnused: 131, lastUsedAt: '2026-06-17T10:00:00Z' }, NOW), 'Ikke brukt på 131 dager · sist brukt 17. juni');
  assert.equal(m.staleLine63({ daysUnused: 200, createdAt: '2025-02-03T10:00:00Z' }, NOW), 'Ikke brukt på 200 dager · aldri brukt · lagt inn 3. feb 2025');
  assert.equal(m.staleLine63({ daysUnused: 95, keptAt: '2026-07-01T10:00:00Z' }, NOW), 'Ikke brukt på 95 dager · beholdt 1. juli');
  assert.equal(m.staleTitle63({ subject: 'Påhåret', title: 'Frisør · Påhåret' }), 'Frisør · Påhåret');
  assert.equal(m.staleTitle63({ subject: 'Nina', title: 'Frisør · Studio' }), 'Nina → Frisør · Studio');
  assert.equal(m.staleTitle63({ subject: 'Tante Berit', object: 'Gjøvik' }), 'Tante Berit → Gjøvik');
});

test('forslag: setning, kilde og redigering (bare endrede felt, samme grenser som serveren)', () => {
  const p = { subject: 'Kari', predicate: 'er', object: 'søster', aliases: ['søster'], sourceLabel: 'Glimt-samtale', reason: 'Du sa det i går' };
  assert.equal(m.sentence63({ ...p, sentence: 'Kari er søsteren din' }), 'Kari er søsteren din');
  assert.equal(m.sentence63(p), 'Kari er søster');
  assert.equal(m.pendingSub63(p), 'Glimt-samtale · Du sa det i går');
  assert.equal(m.pendingSub63({ source: 'calendar' }), 'Kalender');
  assert.deepEqual(m.editBody63({ subject: 'Kari', object: 'søster', aliases: 'søster' }, p), {});
  assert.deepEqual(m.editBody63({ subject: ' Kari  B ', object: 'søsteren min', aliases: 'søster, Søster, KB' }, p), { subject: 'Kari B', object: 'søsteren min', aliases: ['søster', 'KB'] });
  assert.deepEqual(m.editBody63({ subject: 'Kari', object: 'søster', aliases: '' }, p), { aliases: [] });
  assert.equal(m.checkEdit63({ subject: 'Kari', object: 'søster', aliases: [] }), '');
  assert.match(m.checkEdit63({ subject: 'K', object: 'x' }), /2–80 tegn/);
  assert.match(m.checkEdit63({ subject: 'Kari', object: '' }), /1–120 tegn/);
  assert.match(m.checkEdit63({ subject: 'Kari', object: 'x', aliases: ['k'] }), /Aliaset «k» må være 2–60 tegn/);
});

test('motstrid: valgknappene (behold A / behold B / begge) og nattjobbens linje', () => {
  const c = { a: { label: 'Nina er frisør' }, b: { label: 'Nina er tannlege' } };
  assert.deepEqual(m.choices63(c).map((x) => x.id), ['keep_a', 'keep_b', 'both']);
  assert.equal(m.choices63(c)[0].label, 'Behold «Nina er frisør»');
  assert.deepEqual(m.choices63({ choices: [{ id: 'keep_a', label: 'A' }, { id: 'slett_alt', label: 'X' }] }), [{ id: 'keep_a', label: 'A' }]);
  assert.equal(m.runLine63(null, NOW), 'Ikke kjørt ennå');
  assert.equal(m.runLine63({ at: '2026-10-26T02:00:00Z', status: 'ok', proposals: 3, conflicts: 1, stale: 2 }, NOW), 'Kjørt i dag 03:00 · 3 forslag · 1 motstrid · 2 ubrukte');
  assert.equal(m.runLine63({ at: '2026-10-25T02:00:00Z', status: 'skipped', reason: 'slått av' }, NOW), 'Hoppet over i går 03:00: slått av');
  assert.equal(m.countsLine63({ pending: 3, conflicts: 1, stale: 0 }), '3 forslag · 1 motstrid');
  assert.equal(m.countsLine63({}), '');
});

test('lenken fra pushen (url i SERVER63-API.md §3) åpner Innstillinger → AI og blar til forslagene', () => {
  assert.equal(m.ROUTE63, '/#/innstillinger/glimt-husker');
  assert.ok(m.isRoute63('#/innstillinger/glimt-husker'));
  assert.ok(m.isRoute63('#/innstillinger/ai/glimt-husker'));
  assert.ok(!m.isRoute63('#/innstillinger/ai'));
  assert.match(ST, /'glimt-husker': 'ai', minne: 'ai'/);
  assert.match(M, /if \(isRoute63\(location\.hash\)\) want = true;/);
  assert.match(M, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});

test('«Glimt husker»: plassen for forslag/motstrid/ubrukte, merket på minneradene og ny lasting etter endringer', () => {
  assert.match(SA, /import '\.\/memory63\.js';/);
  assert.match(SA, /rows\.unshift\(\{ q: 'glimt husker forslag[^']*', html: '<div data-mem63 data-hl="ai-mem63"><\/div>' \}\)/);
  assert.match(SA, /m\.stale \? '<i class="m63-chip">ikke brukt på lenge<\/i>' : ''/);
  assert.match(SA, /document\.addEventListener\('mem63:changed'/);
  for (const s of ["call(`/pending/${encodeURIComponent(p.id)}/approve`, 'POST', body)", "call(`/pending/${encodeURIComponent(id)}/reject`, 'POST')", "call(`/pending/${encodeURIComponent(p.id)}/edit`, 'POST', body)",
    "call(`/conflicts/${encodeURIComponent(id)}/resolve`, 'POST', { choice })", "call(`/stale/${encodeURIComponent(id)}/keep`, 'POST')", "call('/hygiene/run-now', 'POST')", 'await deleteMemory(id)',
    'Godkjenn', 'Rediger', 'Avvis', 'Lagre og godkjenn', 'Motstrid', 'Ikke brukt på lenge', 'Behold', 'Trykk igjen for å slette', 'Slettes aldri automatisk', "new CustomEvent('mem63:changed')"]) assert.ok(M.includes(s), s);
  // Slett krever to trykk, og godkjenning er låst når forslaget har åpen motstrid (serveren svarer 409).
  assert.match(M, /if \(M\.arm !== id\) \{ M\.arm = id;/);
  assert.match(M, /'Godkjenn', 'pri', busy \|\| !!p\.conflictId\)/);
  assert.match(M, /if \(er\.status === 409\)/);
  // Eldre server: ingenting vises
  assert.match(M, /if \(M\.missing\) return '';/);
});

test('HTML: forslag, motstrid og ubrukte tegnes fra serverens former', async () => {
  const P = { id: 'p00000000000001', status: 'pending', subject: 'Kari', object: 'søsteren min', kind: 'fact', aliases: ['søster'], sentence: 'Kari er søsteren din', sourceLabel: 'Glimt-samtale', reason: 'Du sa det i går', evidence: [{ text: 'Middag med Kari, søsteren min' }], conflictId: null };
  const C = { id: 'c00000000000001', status: 'open', question: 'Glimt har to ting om Nina. Hvilken stemmer?', a: { label: 'Nina er frisør', sourceLabel: 'Glimt husker' }, b: { label: 'Nina er tannlege' } };
  const S = { id: 77, subject: 'Påhåret', title: 'Frisør · Påhåret', daysUnused: 131, lastUsedAt: '2026-06-17T10:00:00Z' };
  const res = { '/pending': { items: [P, { ...P, id: 'p00000000000002', conflictId: C.id }] }, '/conflicts': { items: [C] }, '/stale': { items: [S], staleDays: 90 },
    '/hygiene': { settings: { nightly: true, conflicts: true, stale: true }, server: { nightly: true, conflicts: true, stale: true }, user: { nightly: false }, admin: true, staleDays: 90, counts: { pending: 2, conflicts: 1, stale: 1 } } };
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => res[String(u).replace('/api/glimt/memory', '')] });
  try { await m.loadMem63(true); } finally { globalThis.fetch = orig; }
  const h = m.memHtml63();
  for (const t of ['Kari er søsteren din', 'Glimt-samtale · Du sa det i går', '<i data-no-i18n>søster</i>', 'Hvorfor Glimt tror det', 'data-m63-ok="p00000000000001"', 'data-m63-edit="p00000000000001"', 'data-m63-no="p00000000000001"',
    'Motsier noe Glimt allerede vet', 'data-m63-choice="c00000000000001|keep_a"', 'data-m63-choice="c00000000000001|keep_b"', 'data-m63-choice="c00000000000001|both"', 'Begge stemmer',
    'data-m63-keep="77"', 'data-m63-del="77"', 'ikke brukt på lenge', 'Ikke brukt på 131 dager', '2 forslag · 1 motstrid · 1 ikke brukt på lenge']) assert.ok(h.includes(t), t);
  assert.match(h, /data-m63-ok="p00000000000002" disabled/);
  const s = m.settingsHtml63();
  for (const t of ['MINNET HOLDER SEG RYDDIG · FOR MEG', 'Nattlig oppsummering', 'Motstrid-sjekk', 'Marker ubrukte fakta', 'Ditt eget valg', 'data-m63-days="180"', 'Se forslag og motstrid', 'MINNET · FOR ALLE (ADMIN)', 'systemoppgave']) assert.ok(s.includes(t), t);
  assert.match(s, /data-m63-user="nightly" role="switch" aria-checked="false"/);
  assert.equal((s.match(/data-m63-server=/g) ?? []).length, 3);
});

test('AI-kontroll → Valg: tre brytere (nattlig oppsummering, motstrid, ubrukte) + dager, og admin', () => {
  assert.deepEqual(m.KEYS63, ['nightly', 'conflicts', 'stale']);
  assert.deepEqual(m.STALE_DAYS63, [30, 60, 90, 180, 365]);
  assert.match(A, /import\('\.\/memory63\.js'\)/);
  assert.match(A, /<div data-sched62><\/div><div data-mem63set><\/div>/);
  assert.match(M, /putHyg\(\{ scope: 'user', \[k\]: next === srv \? null : next \}\)/);
  assert.match(M, /putHyg\(\{ scope: 'server', \[k\]: next \}\)/);
  assert.match(M, /putHyg\(\{ scope: 'user', staleDays: n \}\)/);
  assert.match(M, /call\('\/hygiene', 'PUT', body\)/);
});

test('Faste oppgaver: nattjobben er en systemoppgave som kan pauses, ikke slettes eller flyttes', () => {
  assert.match(R, /memory: 'Nattlig oppsummering av minnet'/);
  assert.match(R, /const del = it\.system \? '' :/);
  assert.match(R, /\$\{it\.system \? '' : `<button type="button" class="s62-b" data-s62-edit=/);
  assert.match(R, /\$\{it\.system \? '<i class="s62-st s62-sys">System<\/i>' : ''\}/);
});
