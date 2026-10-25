// Prompt 60 (prompt 49 del 3, D3WEB): web/PWA-delen av «Glimt forstår samtaler» (SERVER60-API.md).
// Chat og Glimt-søket på Hjem sender conversationId (+ conversationKind), valgknapper for `choices` sender item.text + choice
// i samme samtale, brytere for del 3 i AI-kontroll og entitetsregisteret i Innstillinger → AI. Nettleseren er sjekket med
// Playwright mot mock-serveren; her kjøres hjelperne og kildene sjekkes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.location ??= { href: '' };

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const C = rd('public/js/chat.js');
const X = rd('public/js/extras.js');
const G = rd('public/js/glimt-agent45.js');
const ST = rd('public/js/stream59.js');
const A = rd('public/js/ai-control.js');
const SA = rd('public/js/settings-ai.js');
const U = rd('public/js/understand60.js');
const E = rd('public/js/entities60.js');

const cv = await import('../public/js/convo60.js');
const ga = await import('../public/js/glimt-agent45.js');
const en = await import('../public/js/entities60.js');

const CH = { setId: 'ch3f9a1c2b7d', question: 'Mener du «Frisør Nina» eller «Middag med Nina»?', items: [{ id: '1', label: 'Frisør Nina · fre 30. okt 14:00', text: 'Frisør Nina · fre 30. okt 14:00' }, { id: '2', label: 'Middag med Nina · fre 30. okt 18:00', text: 'Middag med Nina · fre 30. okt 18:00' }], expiresAt: '2099-01-01T00:00:00.000Z' };

test('conversationId: gyldige id-er, body-feltene og valget', () => {
  assert.equal(cv.validConv60('home-a1b2c3d4'), 'home-a1b2c3d4');
  assert.equal(cv.validConv60('g:abc.1_2'), 'g:abc.1_2');
  assert.equal(cv.validConv60('har mellomrom'), null);
  assert.equal(cv.validConv60('x'.repeat(81)), null);
  assert.deepEqual(cv.convBody60({}), {});
  assert.deepEqual(cv.convBody60({ conversationId: 'c-1', conversationKind: 'chat' }), { conversationId: 'c-1', conversationKind: 'chat' });
  assert.deepEqual(cv.convBody60({ conversationId: 'ugyldig id', conversationKind: 'chat' }), {}); // serveren bruker sin innebygde samtale
  assert.deepEqual(cv.convBody60({ conversationId: 'home-x', conversationKind: 'annet' }), { conversationId: 'home-x' });
  assert.deepEqual(cv.convBody60({ conversationId: 'home-x', choice: { setId: 'ch1', id: 2 } }), { conversationId: 'home-x', choice: { setId: 'ch1', id: '2' } });
  assert.deepEqual(cv.convBody60({ choice: { id: '1' } }), {}); // uten setId sendes ikke valget
});

test('Glimt-søket på Hjem: én kortlevd samtale, ny etter 30 min uten bruk eller når feltet tømmes', () => {
  cv.resetHomeConv60();
  const a = cv.homeConv60();
  assert.match(a, /^home-[a-z0-9]{8,16}$/);
  assert.equal(cv.homeConv60(), a);
  cv.resetHomeConv60();
  const b = cv.homeConv60();
  assert.notEqual(b, a);
  const real = Date.now;
  try { const t0 = real(); Date.now = () => t0 + cv.HOME_TTL60 + 1000; assert.notEqual(cv.homeConv60(), b); } finally { Date.now = real; }
});

test('Chat: ny chat får c-…, som beholdes når chatten får id (lokal og fra serveren)', () => {
  cv.newChatConv60();
  const p = cv.chatConv60(null);
  assert.match(p, /^c-[a-z0-9]{12}$/);
  assert.equal(cv.chatConv60(undefined), p); // samme til chatten har id
  cv.bindConv60('g:lokal1', p);
  assert.equal(cv.chatConv60('g:lokal1'), p);
  cv.rekeyConv60('g:lokal1', '4711');
  assert.equal(cv.chatConv60('4711'), p);
  assert.notEqual(cv.chatConv60(null), p); // neste nye chat får ny id
  assert.equal(cv.chatConv60('abc-123'), 'abc-123'); // chat-id-en selv når den er gyldig
  cv.newChatConv60();
});

test('Chat: korte oppfølgere etter et ferskt Glimt-svar går til Glimt', () => {
  const now = Date.now(), g = { role: 'assistant', content: 'Oslo: 6 grader', ts: now - 60_000, meta: { glimt: true } };
  assert.equal(cv.followsGlimt60([{ role: 'user', content: 'vær Oslo' }, g], 'og i Bergen?', now), true);
  assert.equal(cv.followsGlimt60([g], 'den første', now), true);
  assert.equal(cv.followsGlimt60([{ ...g, meta: {} }], 'og i Bergen?', now), false); // vanlig modellsvar
  assert.equal(cv.followsGlimt60([g, { role: 'user', content: 'x' }], 'og i Bergen?', now), false);
  assert.equal(cv.followsGlimt60([{ ...g, ts: now - cv.CHAT_TTL60 - 1 }], 'og i Bergen?', now), false); // utløpt
  assert.equal(cv.followsGlimt60([g], 'x'.repeat(81), now), false);
  assert.equal(cv.followsGlimt60([{ ...g, meta: { glimt: true, stopped: true } }], 'og i Bergen?', now), false);
});

test('choices: normaliseres, knappene vises, og valget gir text + choice (utløpt: bare teksten)', () => {
  const n = cv.normChoices60(CH);
  assert.equal(n.items.length, 2);
  assert.equal(n.items[0].text, CH.items[0].text);
  assert.equal(cv.normChoices60({ items: [] }), null);
  assert.equal(cv.normChoices60(null), null);
  assert.equal(cv.normChoices60({ items: Array.from({ length: 8 }, (_, i) => ({ id: String(i), label: `v${i}` })) }).items.length, 5);
  assert.deepEqual(cv.choicePick60(n, n.items[1]), { text: CH.items[1].text, choice: { setId: CH.setId, id: '2' } });
  assert.deepEqual(cv.choicePick60({ ...n, expiresAt: '2000-01-01T00:00:00Z' }, n.items[0]), { text: CH.items[0].text });
  const a = ga.normAgent({ reply: CH.question, intent: 'ask', choices: CH, ask: { question: CH.question, options: [{ id: 'x', label: 'gammel' }] }, conversationId: 'home-abc12345' });
  assert.equal(a.conversationId, 'home-abc12345');
  assert.equal(ga.isPlain(a), false);
  const h = ga.agentExtras(a, {});
  assert.equal((h.match(/data-ga60-i="/g) ?? []).length, 2);
  assert.ok(!h.includes('gammel')); // choices erstatter ask.options
  assert.ok(!h.includes(`<b data-no-i18n>${CH.question}`)); // spørsmålet står allerede i svaret
  assert.match(ga.agentFull(a), /Frisør Nina · fre 30\. okt 14:00/);
  // Uten choices: de gamle valgene som før.
  assert.match(ga.agentExtras(ga.normAgent({ reply: 'Hvilken?', ask: { question: 'Hvilken?', options: [{ id: 'x', label: 'gammel' }] } }), {}), /data-ga45-o="0"/);
});

test('agent() og strømmen sender conversationId, conversationKind og choice', () => {
  assert.match(G, /\.\.\.convBody60\(\{ conversationId, conversationKind, choice \}\)/);
  assert.match(G, /cb\.resend\?\.\(pick\.text, \{\}, \{ choice: pick\.choice \?\? null/);
  assert.match(ST, /\.\.\.convBody60\(o\) \};/);
  assert.match(ST, /return agent\(text, module, context, \{ signal: o\.signal, requestId: o\.requestId, conversationId: o\.conversationId, conversationKind: o\.conversationKind, choice: o\.choice \}\)/);
});

test('Glimt-søket på Hjem: samme samtale for spørsmål og valg, ny når feltet tømmes', () => {
  assert.match(X, /import \{ homeConv60, resetHomeConv60 \} from '\.\/convo60\.js'/);
  assert.match(X, /ag = await agentLive59\(q, 'home', \{\}, \{ signal: ctl\.signal, conversationId: homeConv60\(\), conversationKind: 'search'/);
  assert.match(X, /agent\(t, 'home', ctx, \{ conversationId: homeConv60\(\), conversationKind: 'search', choice: o60\?\.choice \?\? null \}\)/);
  assert.match(X, /resend: \(t, ctx, o60\) => \{ const f = ansForm; agentFollow\(t, ctx, f, o60\); \}/);
  assert.match(X, /resetHomeConv60\(\); \/\/ prompt 60/);
});

test('Chat: samtale-id, oppfølgere, valgknapper og bekreftelse', () => {
  assert.match(C, /from '\.\/convo60\.js'/);
  assert.match(C, /conv60 = chatConv60\(C\.cur\);\n    s59 = await agentStream59\(t, 'chat', \{\}, \{ signal: ctl\.signal, conversationId: conv60, conversationKind: 'chat', choice: o60\.choice \?\? null,/);
  assert.match(C, /\(opt\.choice60 \|\| looksLikeTool\(t\) \|\| followsGlimt60\(C\.chat\?\.messages, t\)\) && await sendTool\(t, \{ choice: opt\.choice60\?\.setId \? opt\.choice60 : null \}\)/);
  assert.match(C, /bindConv60\(C\.cur, conv60\)/);
  assert.match(C, /function toolsRekey\(from, to\) \{ rekeyConv60\(from, to\);/);
  assert.match(C, /newChatConv60\(\); \/\/ prompt 60/);
  assert.match(C, /forgetConv60\(chatConv60\(id\)\)/);
  assert.match(C, /choices: g\.choices, confirm: g\.confirm/);
  assert.match(C, /\.\.\.\(a\.choices \? \{ choices: a\.choices \} : \{\}\), \.\.\.\(a\.confirm \? \{ confirm: a\.confirm \} : \{\}\)/);
  assert.match(C, /\$\{i === lastA && !busyHere \? choices60Html\(meta, i\) : ''\}/);
  assert.match(C, /data-ch-ch60="\$\{i\}:\$\{j\}"/);
  assert.match(C, /send\(pick\.text, \{ choice60: pick\.choice \?\? \{ text: pick\.text \} \}\)/);
  assert.match(C, /const a = await agentConfirm\(token\)/);
  assert.match(C, /data-ch-cf60="yes:\$\{i\}">Ja, gjør det</);
});

test('AI-kontroll: «Forstår samtaler» med tre brytere (bruker + admin)', () => {
  assert.match(A, /import\('\.\/understand60\.js'\)/);
  assert.match(A, /<div data-fast59><\/div><div data-understand60><\/div>/);
  assert.match(U, /fetch\('\/api\/glimt\/agent\/understand', \{ credentials: 'same-origin'/);
  assert.match(U, /method: 'PUT'/);
  assert.match(U, /put\(\{ scope: 'user', \[k\]: next === srv \? null : next \}\)/);
  assert.match(U, /put\(\{ scope: 'server', \[k\]: next \}\)/);
  assert.match(U, /KEYS60 = \['state', 'entities', 'choices'\]/);
  for (const n of ['Samtaletilstand', 'Entitetsregister', 'Valgknapper ved usikkerhet', 'Slått av for alle av administrator']) assert.ok(U.includes(n), n);
  assert.match(U, /role="switch" aria-checked/);
});

test('Entitetsregisteret i Innstillinger → AI: liste, filter, rediger, legg til, slett og oppslag', () => {
  assert.match(SA, /import '\.\/entities60\.js';/);
  assert.match(SA, /groups\.push\(memoryGroup\(group, row\)\);\n  \/\/ Prompt 60/);
  assert.match(SA, /<div data-ent60 data-hl="ai-ent60"><\/div>/);
  assert.match(E, /fetch\('\/api\/glimt\/entities', \{ credentials: 'same-origin'/);
  for (const m of ["'PATCH'", "'DELETE'", "'POST'", '/resolve?q=']) assert.ok(E.includes(m), m);
  assert.match(E, /const body = derived \? \{ aliases \} :/); // avledede: bare aliaser (én sannhet)
  assert.match(E, /d\.enabled === false/);
  assert.deepEqual(en.parseAliases60('hytta, Hytta ,  landstedet;  jobben\n'), ['hytta', 'landstedet', 'jobben']);
  assert.equal(en.parseAliases60(Array.from({ length: 30 }, (_, i) => `a${i}`).join(',')).length, 20);
  assert.equal(en.checkEntity60({ type: 'person', name: 'Nina', aliases: ['frisør'] }), '');
  assert.equal(en.checkEntity60({ type: 'ufo', name: 'Nina' }), 'Velg en type');
  assert.equal(en.checkEntity60({ type: 'place', name: 'H' }), 'Navnet må være 2–80 tegn');
  assert.match(en.checkEntity60({ type: 'place', name: 'Hytta', aliases: ['x'] }), /2–60 tegn/);
  assert.equal(en.checkEntity60({ aliases: ['toten'] }, { derived: true }), '');
});
