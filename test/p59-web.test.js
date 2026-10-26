// Prompt 59 (prompt 49 del 4, D4WEB): statisk sjekk av web/PWA-delen for raskere Glimt-svar – strømming i Glimt-søket og
// Glimt i Chat (SSE fra POST /api/glimt/agent/stream, se SERVER59-API.md), statuslinje, Stopp, reserve til de ikke-strømmende
// kallene, og «Raskere svar»-bryterne i AI-kontroll. Nettleseren er sjekket med Playwright mot mock-serveren; her sjekkes kildene
// og SSE-leseren kjøres mot en ekte strøm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ST = rd('public/js/stream59.js');
const F = rd('public/js/fast59.js');
const X = rd('public/js/extras.js');
const C = rd('public/js/chat.js');
const A = rd('public/js/ai-control.js');

test('stream59.js bruker SSE-endepunktet og hendelsene fra SERVER59', () => {
  assert.match(ST, /fetch\('\/api\/glimt\/agent\/stream', \{ method: 'POST'/);
  assert.match(ST, /Accept: 'text\/event-stream'/);
  for (const ev of ["ev === 'start'", "ev === 'status'", "ev === 'token'", "ev === 'done'", "ev === 'error'"]) assert.ok(ST.includes(ev), ev);
  assert.match(ST, /line\.startsWith\(':'\)\) continue/); // «: ping»
  // done er fasit: svaret normaliseres som POST /api/glimt/agent.
  assert.match(ST, /const a = normAgent\(d\)/);
  // Reserve: 404/405 → null (kalleren bruker de gamle kallene), og agentLive59 faller tilbake til agent().
  assert.match(ST, /r\.status === 404 \|\| r\.status === 405\) \{ offUntil = Date\.now\(\) \+ OFF_MS; return null; \}/);
  assert.match(ST, /return agent\(text, module, context/);
  // Stopp = AbortController; 499 fra /stream/stop behandles som avbrutt.
  assert.match(ST, /signal: o\.signal/);
  assert.match(ST, /err\.status === 499/);
  assert.match(ST, /requestId: o\.requestId \?\? rid59\(\)/);
});

test('SSE-leseren tåler biter delt midt i linjer, ping-kommentarer og CRLF', async () => {
  globalThis.location ??= { href: '' };
  const { readEvents59, tidy59 } = await import('../public/js/stream59.js');
  const raw = 'event: start\r\ndata: {"requestId":"w59-x","stream":true}\r\n\r\n: ping\n\nevent: status\ndata: {"stage":"tool","tool":"weather.get","text":"Henter været …"}\n\nevent: token\ndata: {"t":"Det","source":"mal"}\n\nevent: token\ndata: {"t":" blir **6","source":"mal"}\n\nevent: done\ndata: {"reply":"Det blir **6 grader**.","intent":"weather.get","actions":[]}\n\n';
  const enc = new TextEncoder().encode(raw);
  const parts = [];
  for (let i = 0; i < enc.length; i += 7) parts.push(enc.slice(i, i + 7));
  const body = new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } });
  const got = [];
  await readEvents59({ body }, (e, d) => got.push([e, d]));
  assert.deepEqual(got.map((x) => x[0]), ['start', 'status', 'token', 'token', 'done']);
  assert.equal(got[1][1].text, 'Henter været …');
  assert.equal(got.filter((x) => x[0] === 'token').map((x) => x[1].t).join(''), 'Det blir **6');
  assert.equal(got[4][1].reply, 'Det blir **6 grader**.');
  // Halv fet skrift vises ikke som «**» mens ordene kommer.
  assert.equal(tidy59('Det blir **6'), 'Det blir 6');
  assert.equal(tidy59('Det **6 g**'), 'Det **6 g**');
  assert.equal(tidy59('Det *'), 'Det ');
});

test('Glimt-søket strømmer: ord, statuslinje, Stopp og reserve', () => {
  assert.match(X, /import \{ agentLive59, cacheNote59 \} from '\.\/stream59\.js'/);
  assert.match(X, /ag = await agentLive59\(q, 'home', \{\}, \{ signal: ctl\.signal,/);
  assert.match(X, /onStatus: \(st\) => \{ if \(my !== GL\.seq\) return; GL\.status = st\.text;/);
  assert.match(X, /onToken: \(all\) => \{ if \(my !== GL\.seq\) return; GL\.live = all;/);
  assert.match(X, /data-gl-live/);
  assert.match(X, /data-gl-status/);
  assert.equal((X.match(/data-gl-stop aria-label="Stopp svaret"/g) ?? []).length, 2); // både før og etter første ord
  assert.match(X, /if \(e\.target\.closest\('\[data-gl-stop\]'\)\) \{ haptic\(6\); if \(GL\.busy && GL\.ctl\) \{ GL\.stopped = true; GL\.ctl\.abort\(\); \}/);
  assert.match(X, /stopped: true \}/);
  // Strømmer svaret, flyttes det ikke til Chat etter tidsgrensen.
  assert.match(X, /if \(GL\.live \|\| GL\.status\) return; \/\/ prompt 59/);
  // Prat uten handling går fortsatt til /api/assist (ikke-strømmende reserve).
  assert.match(X, /const a = await assist\(q, \{ source: 'search'/);
  assert.match(X, /notice: cacheNote59\(ag\)/);
});

test('Glimt i Chat strømmer verktøysvarene, beholder kortene og faller tilbake til /api/assist', () => {
  assert.match(C, /import \{ agentStream59, cacheNote59 \} from '\.\/stream59\.js'/);
  assert.match(C, /s59 = await agentStream59\(t, 'chat', \{\}, \{ signal: ctl\.signal,/);
  assert.match(C, /C\.busy\.status59 = st\.text/);
  assert.match(C, /data-ch-status59/);
  assert.match(C, /if \(s59\) \{\n    a = fromAgent59\(s59, t\);/);
  assert.match(C, /\n  else \{\n    try \{ a = await assist\(t, \{ source: 'chat'/);
  // Verktøysvarene lagres i samtalen på serveren (som /api\/assist gjorde), så appene ser dem.
  assert.match(C, /\/api\/glimt\/agent\/stream\/save/);
  // Gamle svar (vær, avganger …) har kortet sitt i legacyAnswer.
  assert.match(C, /raw\.legacyAnswer && typeof raw\.legacyAnswer === 'object'/);
  assert.match(C, /const L = normAnswer\(raw\.legacyAnswer\)/);
  // Stopp beholder teksten som er kommet, merket «Stoppet».
  assert.match(C, /meta: \{ glimt: true, stopped: true, model: 'Glimt' \}/);
  assert.match(C, /meta\.stopped \? 'Stoppet' : '', `Verktøy/);
  assert.match(C, /meta\.cached \? 'Fra cachen' : ''/);
  // Ren prat går videre til språkmodellen som før.
  assert.match(C, /isPlain\(g\) && \['chat', 'ask', ''\]\.includes\(g\.intent\)\) return \{ text: agentText\(g\), intent: 'chat' \}/);
});

test('AI-kontroll har «Raskere svar» med de fire bryterne (bruker + admin)', () => {
  assert.match(A, /import\('\.\/fast59\.js'\)/);
  // Prompt 65: «Motor per oppgave» (omlx58) er slått sammen inn i oppgavetabellen (engine58), så plassen står nå rett etter tabellen.
  assert.match(A, /<div class="ac-slots"><div data-fast59><\/div>/);
  assert.match(F, /fetch\('\/api\/glimt\/agent\/fast', \{ credentials: 'same-origin'/);
  assert.match(F, /method: 'PUT'/);
  assert.match(F, /put\(\{ scope: 'user', \[k\]: next === srv \? null : next \}\)/);
  assert.match(F, /put\(\{ scope: 'server', \[k\]: next \}\)/);
  assert.match(F, /USER_KEYS = \['cache', 'stream', 'parallel'\], SERVER_KEYS = \['cache', 'warm', 'stream', 'parallel'\]/);
  for (const n of ['Svar-cache', 'Varm modell', 'Strømming', 'Parallelle verktøy']) assert.ok(F.includes(n), n);
  assert.match(F, /'\/api\/glimt\/agent\/fast\/cache', \{ method: 'DELETE'/);
  assert.match(F, /'\/api\/glimt\/agent\/fast\/warm', \{ method: 'POST'/);
  assert.match(F, /if \(d\.admin\)/);
  assert.match(F, /Slått av for alle av administrator/);
  assert.match(F, /role="switch" aria-checked/);
});
