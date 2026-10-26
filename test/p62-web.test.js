// Prompt 62 (prompt 49 del 2, D2WEB): web/PWA-delen av «Faste oppgaver» (SERVER62-API.md). Siden Innstillinger → Faste oppgaver,
// bekreftelseskortet i Chat og Glimt-søket, kvitteringen etter «Ja» og bryterne i AI-kontroll → Valg. Nettleseren er sjekket med
// Playwright mot mock-serveren; her kjøres hjelperne og kildene sjekkes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const C = rd('public/js/chat.js');
const X = rd('public/js/extras.js');
const G = rd('public/js/glimt-agent45.js');
const A = rd('public/js/ai-control.js');
const ST = rd('public/js/settings.js');
const S62 = rd('public/js/settings62.js');
const AS = rd('public/js/assist.js');
const R = rd('public/js/sched62.js');

const s = await import('../public/js/sched62.js');
const ga = await import('../public/js/glimt-agent45.js');

const NOW = new Date('2026-10-26T10:00:00Z'); // mandag 11:00 i Oslo (vintertid)
const PREVIEW = { title: 'Strømpriser', what: 'strømprisene for i dag', kind: 'power', when: { text: 'hver morgen kl. 7', label: 'Hver dag kl. 07:00', explicitTime: true, until: null, once: false },
  condition: null, params: { zone: 'NO1' }, nextRuns: ['2026-10-27T06:00:00.000Z', '2026-10-28T06:00:00.000Z', '2026-10-29T06:00:00.000Z'], summary: 'Hver dag kl. 07:00 sender jeg deg strømprisene for i dag (NO1).' };

test('tider i Europe/Oslo: i dag, i morgen, i går, ukedag og år (også over sommertidsskiftet)', () => {
  assert.equal(s.when62('2026-10-27T06:00:00Z', NOW), 'i morgen 07:00');
  assert.equal(s.when62('2026-10-26T16:30:00Z', NOW), 'i dag 17:30');
  assert.equal(s.when62('2026-10-25T06:00:00Z', NOW), 'i går 07:00');
  assert.equal(s.when62('2026-10-30T14:00:00Z', NOW), 'fre 30. okt 15:00');
  assert.equal(s.when62('2027-01-02T14:00:00Z', NOW), 'lør 2. jan 2027 15:00');
  assert.equal(s.when62('2026-10-24T05:00:00Z', NOW), 'lør 24. okt 07:00'); // sommertid før 25.10
  assert.equal(s.when62('2027-03-29T05:00:00Z', NOW), 'man 29. mars 2027 07:00'); // sommertid etter 28.03
  assert.equal(s.when62('ugyldig', NOW), '');
  assert.equal(s.when62(null, NOW), '');
  assert.equal(s.day62('2027-02-28'), '28. feb 2027');
  assert.equal(s.whenLabel62({ label: 'Hver fredag kl. 15:00', until: '2027-02-28' }), 'Hver fredag kl. 15:00 · til og med 28. feb 2027');
});

test('kjøringer: status, levering og én linje', () => {
  assert.equal(s.RUN62.condition_false, 'Betingelsen ikke oppfylt');
  assert.equal(s.runLine62(null), 'Ikke kjørt ennå');
  assert.equal(s.runLine62({ status: 'ok', finishedAt: '2026-10-26T06:00:01Z', ms: 1234 }, NOW), 'Levert i dag 07:00 · 1,2 s');
  assert.equal(s.runLine62({ status: 'missed', plannedAt: '2026-10-25T06:00:00Z' }, NOW), 'Tapt i går 07:00');
  assert.equal(s.delivery62({ delivery: { channel: 'push', delivered: true, pushed: 1 } }), 'Push sendt');
  assert.equal(s.delivery62({ delivery: { channel: 'push', delivered: true, pushed: 3 } }), 'Push sendt til 3 enheter');
  assert.equal(s.delivery62({ delivery: { channel: 'push', delivered: false, skipped: 'stille timer' } }), 'Ikke sendt: stille timer');
  assert.equal(s.delivery62({}), '');
});

test('endre tidspunkt og brief-klokkeslett sjekkes før de sendes', () => {
  const it = { when: { text: 'hver morgen kl. 7' } };
  assert.deepEqual(s.checkWhen62('hver morgen kl. 7', it), { body: {} });
  assert.deepEqual(s.checkWhen62('  hver  hverdag kl 6:30 ', it), { body: { when: 'hver hverdag kl 6:30' } });
  assert.match(s.checkWhen62('x', it).error, /2–200 tegn/);
  assert.match(s.checkWhen62('a'.repeat(201), it).error, /2–200 tegn/);
  assert.equal(s.hhmm62('6:30'), '06:30');
  assert.equal(s.hhmm62('06.30'), '06:30');
  assert.equal(s.hhmm62('0630'), '06:30');
  assert.equal(s.hhmm62('24:00'), null);
  assert.equal(s.hhmm62('7'), null);
});

test('gjenkjenner faste oppgaver i søket og i Chat (eksemplene fra oppdraget)', () => {
  for (const q of ['Send meg strømprisene hver morgen kl. 7', 'Minn meg på å betale husleia den 1. hver måned', 'Hver fredag kl. 16: oppsummer hva jeg har brukt penger på denne uka',
    'Si fra hvis strømprisen går over 2 kr i morgen', 'Gi meg værmeldingen for Toten hver fredag kl. 15 i vinter', 'Stopp strømprisvarselet', 'Hvilke faste oppgaver har jeg?', 'Flytt morgenbriefen til 06:30', 'Annenhver tirsdag kl 18: søppel']) assert.ok(s.isSched62(q), q);
  for (const q of ['Tannlege fredag kl 10', 'Minn meg på å kjøpe melk i morgen', 'Hvordan er været i morgen?', 'Skriv et dikt om høsten']) assert.ok(!s.isSched62(q), q);
  assert.match(AS, /schedule: \/\\bhver\\s\+\(dag\|morgen/); // looksLikeTool → Chat sender dem til Glimt
  assert.match(C, /trial\|appointment\|schedule\)\/\.test\(a\.intent/);
  assert.match(X, /import \{ isSched62 \} from '\.\/sched62\.js'/);
  assert.match(X, /if \(!it && ag && isSched62\(q\)\) \{ if \(aiOn\(\)\) askAi\(e\.target, q\); else runSearch\(q\); return; \}/);
  assert.match(X, /isSched62\(v\)\) \{ ap = null; hu = null; \}/);
  assert.ok(X.indexOf('isSched62(q)') < X.indexOf('waitParse52(q)'), 'før AI-tolkningen av avtaler/huskebeskjeder');
});

test('bekreftelseskortet: ny oppgave, flytt, stopp og slett', () => {
  const a = ga.normAgent({ reply: `${PREVIEW.summary} Stemmer det?`, confirm: { token: 'c1', summary: PREVIEW.summary }, actions: [{ tool: 'schedule.create', status: 'needs_confirm', args: PREVIEW }], schedule62: { action: 'create', preview: PREVIEW } });
  assert.equal(a.schedule62.action, 'create');
  const p = s.preview62(a);
  assert.equal(p.action, 'create');
  assert.equal(s.yesLabel62(p), 'Ja, lagre');
  const h = s.schedCard62Html(p, { now: NOW });
  for (const t of ['data-s62-card="create"', 'Ny fast oppgave', 'strømprisene for i dag', 'Hver dag kl. 07:00', 'NO1 (Øst)', 'i morgen 07:00 · ons 28. okt 07:00 · tor 29. okt 07:00', 'Push i appen', 'Ingenting lagres før du svarer ja']) assert.ok(h.includes(t), t);
  assert.ok(!h.includes('Stille timer'), 'eget klokkeslett → ingen merknad om stille timer');
  // Uten schedule62: args fra handlingen som venter på bekreftelse
  const b = s.preview62(ga.normAgent({ confirm: { token: 'c2' }, actions: [{ tool: 'schedule.create', status: 'needs_confirm', args: { ...PREVIEW, when: { label: 'Den 1. hver måned', explicitTime: false }, condition: { label: 'høyeste strømpris i morgen er over 2,00 kr/kWh', expr: 'max(price_nok_kwh) > 2', source: 'power' } } }] }));
  const hb = s.schedCard62Html(b, { now: NOW });
  assert.match(hb, /Bare hvis/); assert.match(hb, /max\(price_nok_kwh\) &gt; 2/); assert.match(hb, /Sjekkes i koden/); assert.match(hb, /flyttes til 07:00/);
  const mv = s.preview62({ actions: [{ tool: 'schedule.update', status: 'needs_confirm', args: { id: 'brief:morning', title: 'Morgenbrief', action: 'move', from: { label: 'Hver dag kl. 06:45' }, to: { label: 'Hver dag kl. 06:30' }, builtin: 'brief:morning' } }] });
  assert.equal(s.yesLabel62(mv), 'Ja, flytt');
  const hm = s.schedCard62Html(mv);
  assert.match(hm, /Fra<\/b><span data-no-i18n>Hver dag kl\. 06:45/); assert.match(hm, /Til<\/b><span data-no-i18n>Hver dag kl\. 06:30/); assert.match(hm, /det lages ingen ny oppgave/);
  // Briefene (v2): from/to {at, on} uten label
  const bm = s.preview62({ actions: [{ tool: 'schedule.update', status: 'needs_confirm', args: { builtin: 'brief:morning', brief: 'morning', title: 'Morgenbrief', action: 'move', from: { at: '06:45', on: true }, to: { at: '06:30', on: true } } }] });
  assert.match(s.schedCard62Html(bm), /Fra<\/b><span data-no-i18n>Hver dag kl\. 06:45<\/span>[\s\S]*Til<\/b><span data-no-i18n>Hver dag kl\. 06:30</);
  const bs = s.preview62({ actions: [{ tool: 'schedule.update', status: 'needs_confirm', args: { builtin: 'brief:evening', title: 'Kveldsbrief', action: 'stop', from: { at: '21:00', on: true }, to: { at: '21:00', on: false } } }] });
  assert.equal(s.yesLabel62(bs), 'Ja, stopp'); assert.match(s.schedCard62Html(bs), /Hver dag kl\. 21:00[\s\S]*brief-innstillingen/);
  assert.match(s.schedCard62Html({ ...p, private: true }, { now: NOW }), /detaljene står bare i appen/);
  const st = s.preview62({ actions: [{ tool: 'schedule.delete', status: 'needs_confirm', args: { id: 's1', title: 'Strømvarsel', action: 'stop', label: 'I morgen kl. 14:00' } }] });
  assert.equal(s.yesLabel62(st), 'Ja, stopp'); assert.match(s.schedCard62Html(st), /kan slås på igjen/);
  assert.equal(s.yesLabel62(s.preview62({ actions: [{ tool: 'schedule.delete', status: 'needs_confirm', args: { id: 's1', title: 'X', action: 'delete' } }] })), 'Ja, slett');
  assert.equal(s.preview62(ga.normAgent({ reply: 'Ja', confirm: { token: 'c3' }, actions: [{ tool: 'calendar.delete', status: 'needs_confirm' }] })), null);
  assert.equal(s.yesLabel62(null), 'Ja, gjør det');
  assert.equal(s.schedCard62Html(null), '');
});

test('kvitteringen etter «Ja» med lenke til Faste oppgaver', () => {
  const sch = { id: 's1', title: 'Strømpriser', when: { label: 'Hver dag kl. 07:00' }, status: 'active', nextRunAt: '2026-10-27T06:00:00Z' };
  const d = s.done62({ actions: [{ tool: 'schedule.create', status: 'done', result: { schedule: sch, created: true } }] });
  assert.deepEqual(d, { schedule: sch, how: 'created' });
  const h = s.schedDone62Html(d, { now: NOW });
  assert.match(h, /Lagret: <span data-no-i18n>Strømpriser/); assert.match(h, /Hver dag kl\. 07:00 · neste i morgen 07:00/); assert.match(h, /data-s62-open>Se faste oppgaver ›/);
  assert.match(s.schedDone62Html({ schedule: { ...sch, status: 'paused' }, how: 'stopped' }, { now: NOW }), /Stoppet: /);
  assert.equal(s.done62({ actions: [{ tool: 'calendar.create', status: 'done', result: {} }] }), null);
  assert.equal(s.ROUTE62, '/#/innstillinger/faste-oppgaver');
});

test('Glimt-søket og Chat bruker kortet med de vanlige Ja/Avbryt-knappene fra del 3', () => {
  assert.match(G, /import \{ preview62, schedCard62Html, yesLabel62, done62, schedDone62Html \} from '\.\/sched62\.js'/);
  assert.match(G, /schedule62: d\.schedule62 && typeof d\.schedule62 === 'object' \? d\.schedule62 : null/);
  assert.match(G, /\$\{p62 \? schedCard62Html\(p62, \{ dark: opts\.dark \}\) : ''\}<div class="ga45-opts">/);
  assert.match(G, /data-ga45-c="yes">\$\{esc\(yesLabel62\(p62\)\)\}/);
  assert.match(G, /schedule: \['Fast oppgave', '#7a3b6b'\]/);
  assert.match(C, /import \{ preview62, schedCard62Html, yesLabel62, done62, schedDone62Html \} from '\.\/sched62\.js'/);
  assert.match(C, /data-ch-cf60="yes:\$\{i\}">\$\{esc\(yesLabel62\(p62\)\)\}/);
  assert.match(C, /data-ch-cf60="yes:\$\{i\}">Ja, gjør det</); // andre bekreftelser som før
  assert.equal((C.match(/s62: g\.confirm \? preview62\(g\) : null/g) ?? []).length, 2);
  assert.match(C, /\.\.\.\(a\.s62 \? \{ s62: a\.s62 \} : \{\}\)/);
  assert.match(C, /d62 = done62\(a\); if \(p62\) meta\.s62 = p62; if \(d62\) meta\.s62done = d62;/);
  assert.match(C, /\$\{meta\.s62done \? schedDone62Html\(meta\.s62done\) : ''\}/);
  // Andre bekreftelser (si opp, slett avtale) er uendret: «Ja, gjør det» og rød knapp
  const h = ga.agentExtras(ga.normAgent({ reply: 'Si opp Netflix?', confirm: { token: 'c9', summary: 'Si opp Netflix' } }));
  assert.match(h, /class="ga45-o danger"[^>]*data-ga45-c="yes">Ja, gjør det</);
  const h2 = ga.agentExtras(ga.normAgent({ reply: `${PREVIEW.summary} Stemmer det?`, confirm: { token: 'c1', summary: `${PREVIEW.summary} Stemmer det?` }, schedule62: { action: 'create', preview: PREVIEW } }), {}, { dark: true });
  assert.match(h2, /class="ga45-o" data-ga45="\d+" data-ga45-c="yes">Ja, lagre</);
  assert.match(h2, /class="s62-card dark"/);
  assert.ok(!h2.includes('<b data-no-i18n>Hver dag kl. 07:00 sender'), 'oppsummeringen står allerede i svaret');
  const h3 = ga.agentExtras(ga.normAgent({ reply: 'Lagret.', actions: [{ tool: 'schedule.create', status: 'done', result: { schedule: { id: 's1', title: 'Strømpriser', when: { label: 'Hver dag kl. 07:00' } }, created: true } }], results: [{ kind: 'schedule', id: 's1', title: 'Strømpriser' }, { kind: 'schedule', id: 's2', title: 'Husleie' }] }));
  assert.match(h3, /s62-done/);
  assert.equal((h3.match(/class="ga45-r"/g) ?? []).length, 1, 'samme oppgave vises ikke også som treff');
});

test('Innstillinger → Faste oppgaver (/#/innstillinger/faste-oppgaver) under Glimt', () => {
  assert.match(ST, /import \{ TABS62, ALIAS62, fasteView62 \} from '\.\/settings62\.js'/);
  assert.match(ST, /\['glimt', 'Glimt', [^\n]*\n {2}\.\.\.TABS62,/);
  assert.match(ST, /'faste-oppgaver': \(\) => fasteView62\(H\)/);
  assert.match(ST, /\.\.\.ALIAS51, \.\.\.ALIAS62 \}/);
  assert.match(S62, /\['faste-oppgaver', 'Faste oppgaver', '[^']+', 'Glimt'/);
  assert.match(S62, /mount: \(slot\) => mountSched62\(slot\)/);
  for (const m of ["call(idPath(id), 'PATCH', { status: ds.s62St })", "`${idPath(id)}/run-now`, 'POST'", "call(idPath(id), 'DELETE')", "call('/parse', 'POST'", "call(idPath(id), 'PATCH', { at })", "call(idPath(id), 'PATCH', { on: b.on === false })",
    'Trykk igjen for å slette', 'Kjør nå', 'Pause', 'Fortsett', 'Endre tidspunkt', 'Forhåndsvis', 'Siste kjøringer', 'Briefer', 'Planlagte oppgaver er slått av', 'Sjekkes i koden']) assert.ok(R.includes(m), m);
  assert.match(R, /const idPath = \(id\) => \(\/\^brief:\[a-z\]\+\$\/\.test\(id\) \? `\/\$\{id\}` : `\/\$\{encodeURIComponent\(id\)\}`\)/);
});

test('AI-kontroll → Valg: «Faste oppgaver» med tre brytere, prisområde og admin', () => {
  assert.match(A, /import\('\.\/sched62\.js'\)/);
  assert.match(A, /<div data-recipes61><\/div><div data-sched62><\/div>/);
  assert.deepEqual(s.KEYS62, ['enabled', 'conditions', 'quiet']);
  assert.match(R, /fetch\('\/api\/glimt\/schedules\/settings'/);
  assert.match(R, /putSettings\(\{ scope: 'user', \[k\]: next === srv \? null : next \}\)/);
  assert.match(R, /putSettings\(\{ scope: 'server', \[k\]: next \}\)/);
  assert.match(R, /putSettings\(\{ scope: 'user', zone \}\)/);
  for (const n of ['Planlagte oppgaver', 'Betingede varsler', 'Stille timer 23–07', 'Prisområde for strøm', 'Slått av for alle av administrator', 'FASTE OPPGAVER · FOR ALLE (ADMIN)']) assert.ok(R.includes(n), n);
});
