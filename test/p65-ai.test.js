// Prompt 65 (prompt 50b, SETAI): kompakt, uniform AI-side (claude-code-ai-innstillinger-kompakt.md) og Glimt-delen som egen
// innebyggbar visning (claude-code-innstillinger-samlet.md). Nettleseren er sjekket med Playwright mot mock-serveren
// (1440 og 390 px, ingen JS-feil, ingen sidelengs scroll); her sjekkes faner, nøkler, rad-komponenten, kontrollene og at
// ingen innstilling er fjernet eller finnes to steder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const A = rd('public/js/ai-control.js');
const CSS = rd('public/css/ai-control.css');
const SA = rd('public/js/settings-ai.js');
const G65 = rd('public/js/ai-glimt65.js');
const O58 = rd('public/js/omlx58.js');
const V54 = rd('public/js/voice54.js');
const V57 = rd('public/js/voices57.js');
const R48 = rd('public/js/receipts48-set.js');
const ai = await import('../public/js/ai-control.js');

test('fanene: Oversikt · Modeller · Oppgaver · Kvitteringer · Tjenester · Jobber · Forbruk – «Glimt og chat» er borte', () => {
  assert.deepEqual(ai.AI_TABS65.map((t) => t[1]), ['Oversikt', 'Modeller', 'Oppgaver', 'Kvitteringer', 'Tjenester', 'Jobber', 'Forbruk']);
  assert.deepEqual(ai.AI_TABS65.map((t) => t[0]), ['ov', 'mod', 'task', 'rcpt', 'svc', 'job', 'use']);
  // Ikon på hver fane (puls, brikke, gren, kvittering, server, liste, stolper)
  assert.deepEqual(ai.AI_TABS65.map((t) => t[2]), ['pulse', 'chip', 'branch', 'receipt', 'server', 'list', 'bars']);
  assert.ok(!A.includes("'Glimt og chat'"));
  // Ingen vertikal undermeny: fanelinjen er horisontal (role=tablist) og sticky
  assert.ok(!/class="ac-nav"/.test(A));
  assert.match(A, /<nav class="ac-tabs" role="tablist"/);
  assert.match(CSS, /\.ac-top\{position:sticky;top:var\(--ac-sticky-top,0\)/);
  assert.match(CSS, /\.ac-tabs button\{[^}]*height:38px[^}]*font:600 13\.5px/);
  assert.match(CSS, /\.ac-tabs button\.on\{color:var\(--ink\);border-bottom-color:var\(--ink\)\}/);
  assert.match(CSS, /\.ac-main\{width:100%;max-width:940px;[^}]*gap:20px;padding:16px/);
  // Tellere: Jobber (feilede, rød) og Tjenester (feiler, oransje)
  assert.match(A, /const b = k === 'job' \? failN : k === 'svc' \? svcN : 0;/);
  assert.match(A, /class="ac-badge \$\{k === 'job' \? 'b-bad' : 'b-warn'\}"/);
});

test('gamle fane-nøkler og dyplenker peker til nye steder', () => {
  const K = ai.aiTabKey65;
  assert.equal(K('rt'), 'task');
  assert.equal(K('valg'), 'task');
  assert.equal(K('api'), 'svc');
  assert.equal(K('imp'), 'svc:import');
  assert.equal(K('keys'), 'svc');
  assert.equal(K('api:gemini'), 'svc:gemini');
  assert.equal(K('r48'), 'rcpt');
  assert.equal(K('kvitteringer'), 'rcpt');
  assert.equal(K('glimt'), 'glimt');
  for (const k of ['ov', 'mod', 'task', 'rcpt', 'svc', 'job', 'use']) assert.equal(K(k), k);
  assert.equal(K(''), '');
  // Overlegget sender «glimt» til Innstillinger → Glimt
  assert.match(A, /if \(t === 'glimt'\) \{ location\.hash = '#\/innstillinger\/glimt';/);
  // settings-ai.js mapper søke-ankrene (setAiTab) med samme funksjon
  assert.match(SA, /export function setAiTab\(t\) \{ acTab = aiTabKey65\(t\) \|\| null; \}/);
});

test('én rad-komponent: 28 px ikonflis med statusmerke, tittel, mono-tag, undertekst på én linje, kontroller og chevron', () => {
  const h = ai.ui65.row({ ic: 'chip', dot: 'ok', t: 'qwen3:8b', mono: true, tag: 'STANDARD', s: '8.2B · 5,2 GB', right: ai.ui65.btn('Last ut', 'data-x'), x: 'm.test' });
  assert.match(h, /^<div class="ac-r ac-rx ctl" data-ac-xrow="m\.test"/);
  assert.match(h, /<span class="ac-ic" aria-hidden="true"><svg class="ac-i" width="15" height="15"[^>]*stroke-width="1\.9"/);
  assert.match(h, /<i class="ac-icd ok"><\/i><\/span>/);
  assert.match(h, /<b class="ac-ell ac-mono">qwen3:8b<\/b><i class="ac-tg">STANDARD<\/i>/);
  assert.match(h, /<span class="ac-rs ac-ell" title="8\.2B · 5,2 GB">8\.2B · 5,2 GB<\/span>/);
  assert.match(h, /<button type="button" class="ac-chev" data-ac-x="m\.test" aria-expanded="false"/);
  // Bokstavflis (sky-modeller G / GQ, nettsøk-rekkefølge)
  assert.match(ai.ui65.row({ tile: 'GQ', t: 'x' }), /<span class="ac-ic txt" aria-hidden="true"><b>GQ<\/b><\/span>/);
  assert.match(CSS, /\.ac-r,\.ac-li,\.ac-par\{[^}]*min-height:46px;padding:var\(--r-pad\) 0/);
  assert.match(CSS, /\.ac-ic\{[^}]*width:28px;height:28px;border-radius:8px;background:var\(--fld\);color:#4a463f/);
  assert.match(CSS, /\.ac-icd\{[^}]*width:9px;height:9px;[^}]*box-shadow:0 0 0 2px var\(--card\)/);
  assert.match(CSS, /\.ac-card>\*\+\*:not\(\.ac-xp\)[^{]*\{border-top:1px solid var\(--line\)\}/);
  assert.match(CSS, /\.ac-ell\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
  assert.match(CSS, /\.ac-chev\.on\{transform:rotate\(90deg\)\}/);
  // Rader modulene tegner selv (fast59 … quality64) får samme ikonflis
  assert.match(A, /for \(const li of root\.querySelectorAll\('\.ac-li:not\(\[data-ic65\]\),\.ac-par:not\(\[data-ic65\]\)'\)\)/);
  // Papirtemaet har fargene fra spesifikasjonen
  assert.match(A, /papir: \{ bg: '#f3efe6', card: '#fffdf8', fld: '#ece6da', line: '#ddd5c5', ink: '#1b1a17'[^}]*ok: '#2f7a4f'/);
});

test('kontroller: knapp 30 · segment 30 · select 30 · bryter 36×22 · felt 34 · kort radius 14 · grå etikett · banner', () => {
  assert.match(CSS, /\.ac-b\{[^}]*height:30px;padding:0 13px;border-radius:15px;border:1px solid var\(--line\)/);
  assert.match(CSS, /\.ac-b\.ink\{border-color:var\(--ink\);background:var\(--ink\)/);
  assert.match(CSS, /\.ac-b\.red\{border-color:transparent;color:var\(--bad\)/);
  assert.match(CSS, /\.ac-seg\{[^}]*height:30px;padding:2px;border-radius:15px;background:var\(--fld\)/);
  assert.match(CSS, /\.ac-selp\{[^}]*height:30px;[^}]*border-radius:15px;[^}]*font:500 12px 'IBM Plex Mono'/);
  assert.match(CSS, /\.ac-sw\{[^}]*width:36px;height:22px/);
  assert.match(CSS, /\.ac-sw\.on\{background:var\(--ok\)\}/);
  assert.match(CSS, /\.ac-f\{display:grid;grid-template-columns:96px minmax\(0,1fr\)/);
  assert.match(CSS, /\.ac-f input,[^{]*\{[^}]*height:34px;padding:0 12px;border-radius:10px;[^}]*font:500 12\.5px 'IBM Plex Mono'/);
  assert.match(CSS, /\.ac-card\{border-radius:14px;background:var\(--card\);padding:0 14px;/);
  assert.match(CSS, /\.ac-lab\{[^}]*font:500 10\.5px 'IBM Plex Mono'[^}]*letter-spacing:\.12em;color:var\(--mut\)/);
  assert.match(CSS, /\.ac-note\{font-size:12px;line-height:1\.5;color:var\(--mut\);padding:0 2px\}/); // ingen grå notatboks
  assert.match(CSS, /\.ac-kpis\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);border-radius:14px;background:var\(--card\)/);
  const seg = ai.ui65.seg([[1, 'Én'], [2, 'To']], 2, (v) => `data-v="${v}"`, 'Test');
  assert.match(seg, /<span class="ac-seg" role="group" aria-label="Test"><button type="button" class="" aria-pressed="false" data-v="1">Én<\/button><button type="button" class="on" aria-pressed="true" data-v="2">To<\/button><\/span>/);
  assert.match(ai.ui65.swb(true, 'data-k', 'Bryter'), /<button type="button" class="ac-swb" role="switch" aria-checked="true" aria-label="Bryter" data-k><span class="ac-sw on"/);
  assert.match(ai.ui65.banner('bad', 'Feil', 'Sub', ''), /<div class="ac-ban t-bad" role="alert"><i class="ac-band"><\/i>/);
  // Ingen rød «Lagre» (Mac-OCR) og ingen «Åpne→ / Vis→ / Lagre→»-tekstlenker
  assert.ok(!/r48s-btn pri/.test(A));
  assert.ok(!/(Åpne|Vis|Lagre) ?→/.test(A));
});

test('mobil (< 600 px): samme komponenter, kontrollene wrapper under teksten, fanelinjen scroller', () => {
  assert.match(CSS, /@media \(max-width:600px\)\{[\s\S]*\.ac-r\.ctl\{flex-wrap:wrap\}[\s\S]*\.ac-r\.ctl>\.ac-rr\{flex:1 1 100%;max-width:none;justify-content:flex-start;padding-left:40px\}/);
  assert.match(CSS, /\.ac-tabs\{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none/);
  assert.match(CSS, /\.ac-tr,\.ac-tbl\.fin \.ac-tr\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});

test('embed / only: ingen dobbel overskrift, Glimt-delen uten faner, overlegget scroller og har Ferdig', () => {
  assert.match(A, /const hd = o\.embedded \? '' : `<div class="ac-hd">/);
  assert.match(A, /const nav = only \? '' : `<nav class="ac-tabs"/);
  assert.match(A, /const main = only === 'glimt' \? glimtTab\(\) : TABS_FN\[p\.tab\]\(o\);/);
  assert.match(A, /export const mountAiGlimt = \(el, o = \{\}\) => mountAiControl\(el, \{[^}]*only: 'glimt', embedded: true \}\);/);
  assert.match(A, /mountAiControl\(box, \{ variant: mob \? 'mobile' : 'web', scope: 'alle', theme: 'papir', \.\.\.o, embedded: false, onClose: close \}\);/);
  assert.match(CSS, /\.ac-ovbox\{[^}]*overflow-y:auto/);
  assert.match(CSS, /\.ac \.ac-title\{font:500 26px\/1\.1 var\(--hf\)/);
  assert.match(CSS, /\.ac-hic\{flex:none;width:36px;height:36px/);
  assert.ok(!/100vh/.test(CSS), 'ingen 100vh-høyde');
  // settings-ai.js: AI-siden er bare kontrollen; Glimt-delen er egen visning for SETNAV
  assert.match(SA, /export function aiView\(\) \{\n  const pre = '<div class="set-aictl" data-mount-host data-hl="ai-mod"><\/div>';\n  return \{ pre, mount: \(slot\) => acMount\(slot\), groups: \[\] \};/);
  assert.match(SA, /export function glimtAiView\(\) \{/);
  assert.match(SA, /only: 'glimt', embedded: true/);
  assert.match(SA, /export const aiGlimtView = glimtAiView;/);
  assert.match(SA, /data-ai-glimt65/);
  for (const f of ['loadAi', 'aiClick', 'aiChange', 'aiSubmit', 'setAiTab']) assert.match(SA, new RegExp(`export (async )?function ${f}\\(`), f);
});

test('Glimt-delen (Innstillinger → Glimt): Personlighet, Send til Chat etter, nettsøk, Glimt husker, entitetsregister, Glimt lærer', () => {
  const body = A.slice(A.indexOf('function glimtTab()'), A.indexOf('function webSec()'));
  for (const s of ['PERSONLIGHET', 'GLIMT I SØKEFELTET', 'g.memorySec65(ui65)', 'ENTITETSREGISTER', 'data-ent60', 'GLIMT LÆRER', 'data-learn61', 'webSec()']) assert.ok(body.includes(s), s);
  assert.ok(!/people55|p55/.test(body), 'Brief og Glimt-figur ligger under Brukere og familie (SETNAV)');
  assert.match(G65, /const head = '<div class="ac-slot" data-mem63 data-hl="ai-mem63"><\/div>';/);
  assert.match(G65, /right: ui\.seg\(HS65\.map\(\(v\) => \[v, `\$\{v\} s`\]\), A\.hs \?\? 8, \(v\) => `data-g65-hs="\$\{v\}"`/);
  assert.match(G65, /api\('\/me\/layout', \{ method: 'PUT', json: \{ hs_timeout_s: v \} \}\)/);
  assert.match(A, /sec\('NETTSØK I GLIMT', order \+ test, \{ hl: 'glimt-web65'/);
});

test('ingenting er fjernet – alt er flyttet (samme API-er og lagrede felt)', () => {
  // Chat-brytere, standardmodell og AI-logg → Oppgaver → Regler
  for (const k of ['data-g65-tog="chat_my_data"', 'data-g65-tog="chat_ask_cloud"', 'data-g65-def', "api('/chat/settings', { method: 'PATCH'", "fin('/ai-audit?limit=50')", "x: 'g65.log'"]) assert.ok(G65.includes(k), k);
  assert.match(A, /sec\('REGLER', rules \+ fbRow \+ chat, \{ hl: 'ai-rules65' \}\)/);
  // Personvern og logoer → Kvitteringer (Tolking / Logoer)
  for (const k of ['logo_local_receipts', 'logo_gemini', 'logo_verify', "fin('/ai-privacy', { method: 'PATCH'"]) assert.ok(G65.includes(k), k);
  assert.match(A, /sec\('TOLKING', model \+ L\.tolk\.join\(''\)/);
  assert.match(A, /sec\('LOGOER', L\.logo\.join\(''\)/);
  // Kvitteringer: status og steg i samme rad (bryter), Mac-OCR-oppsett under Tjenester
  assert.match(A, /right: swb\(!!st\[k\], `data-ac-r48tog="\$\{k\}"`/);
  assert.match(A, /id: 'macocr', group: 'MAC MINI'/);
  assert.match(R48, /export const r48Act = \{ save: \(clearKey = false\) => save\(clearKey\), test: \(\) => test\(\), toggle: \(k\) => toggle\(k\)/);
  // keep_alive per modell er en select i Modeller-raden (7-valgs segment fjernet)
  assert.match(A, /data-ac-mkas="\$\{esc\(m\.id\)\}"/);
  assert.match(A, /saveRouting\(\{ params: \{ modelKeepAlive: \{ \[t\.dataset\.acMkas\]: v \} \} \}/);
  assert.ok(!A.includes('function mkaCard'));
  // Motor per oppgave er en kolonne i oppgavetabellen; «Bruk Ollama hvis oMLX ikke svarer» under Regler
  assert.match(A, /const e = o58\?\.engine58\?\.\(t\.id\);/);
  assert.match(A, /data-o58-engine="\$\{esc\(t\.id\)\}" data-v="\$\{v\}"/);
  assert.match(A, /swb\(fb\.on, 'data-o58-fb', 'Bruk Ollama hvis oMLX ikke svarer'/);
  assert.match(O58, /export function engine58\(task\)/);
  assert.match(O58, /export const fallback58 = /);
  // Modulene som før lå i Valg, ligger i Oppgaver (samme plasser)
  assert.match(A, /<div class="ac-slots"><div data-fast59><\/div><div data-understand60><\/div><div data-recipes61><\/div><div data-sched62><\/div><div data-mem63set><\/div><div data-q64set><\/div><\/div>/);
  // Desert Ant Labs (fra System → Mer) under Modeller
  assert.match(A, /sec\('LOKALE MODELLER · DESERT ANT LABS'/);
  assert.match(A, /fetch\('\/api\/admin\/dal53\/health'/);
  // Importer og Glimt-API under Tjenester → Andre
  assert.match(A, /id: 'import', group: 'ANDRE'/);
  assert.match(A, /id: 'glimtapi', group: 'ANDRE'/);
});

test('Tjenester: alle tjenestekort som én utvidbar rad med adresse/nøkkel/test', () => {
  for (const id of ['ollama', 'owui', 'omlx', 'macocr', 'nbwhisper', 'voxcpm', 'neutrino', 'phonon', 'voz', 'searxng', 'brave', 'glimtapi', 'import']) assert.match(A, new RegExp(`id: '${id}', group: '`), id);
  for (const id of ['gemini', 'groq', 'openrouter', 'roboflow']) assert.match(A, new RegExp(`keySvc\\('${id}'`), id);
  assert.match(A, /x: `svc\.\$\{x\.id\}`, hl: `ai-svc-\$\{x\.id\}`/);
  // Nøkkel vises aldri, bare «SATT», og kan fjernes
  assert.match(A, /keyInput\(attr, label, isSet, ph, admin, extra = ''\) \{ return fld\(`\$\{label\}\$\{isSet \? ' <i class="ac-tg">SATT<\/i>' : ''\}`/);
  assert.match(A, /data-ac-keydel="\$\{k\}"/);
  assert.match(A, /call\(`\/keys\/\$\{p\}`, \{ method: 'PUT', json: \{ key: '' \} \}\)/);
  // Open WebUI har ett sted: /api/ai/backend (det gamle skjemaet mot /api/integrations/openwebui er borte fra AI-siden)
  assert.match(A, /data-ac-besave="openwebuiUrl,openwebuiKey"/);
  assert.ok(!SA.includes('/integrations/openwebui'));
  // Søkeankeret for Gemini-nøkkelen finnes fortsatt
  assert.match(A, /data-ac-key="\$\{k\}" data-f="key"/);
  // Modulenes skjema uten eget kort inni raden
  assert.match(O58, /el\.dataset\.omlx58Ai === 'row'/);
  assert.match(V54, /part === 'nb' \? nbRowHtml\(\) : part === 'fermion'/);
  assert.match(V54, /export function voiceStatus54\(\)/);
  assert.match(V57, /export function voxStatus57\(\)/);
  assert.match(V57, /\[data-v54-ai=""\]/); // VoxCPM-kortet legges bare etter det gamle «Tale til tekst»-kortet
});

test('hver innstilling ett sted: settings-ai.js har ingen kopi av kontrollene', () => {
  for (const k of ['chat_my_data', 'chat_ask_cloud', 'logo_gemini', 'hs_timeout_s', 'memoryGroup', 'data-ent60', 'data-learn61']) assert.ok(!SA.includes(k), k);
  // Feltene finnes bare i ai-glimt65.js (ikke i ai-control.js)
  for (const k of ['chat_my_data', 'logo_local_receipts', 'hs_timeout_s']) assert.ok(!A.includes(k), k);
});

test('innstillinger som Integrasjoner nå bare lenker til: ai_think, chat_theme og web_order kan endres på AI-siden', () => {
  // ai_think («Lokal AI · La modellen tenke») → Oppgaver → Regler, samme lagring som Integrasjoner brukte (GET/PUT /api/config)
  assert.match(G65, /api\('\/config'\)\]\);/);
  assert.match(G65, /api\('\/config', \{ method: 'PUT', json: \{ ai_think: v \? '1' : '0' \} \}\)/);
  assert.match(G65, /t: 'La modellen tenke før den svarer'/);
  // chat_theme → Oppgaver → Regler (PATCH /api/chat/settings, samme felt som Chat bruker)
  assert.match(G65, /data-g65-theme="\$\{v\}"/);
  assert.match(G65, /api\('\/chat\/settings', \{ method: 'PATCH', json: \{ chat_theme: d\.g65Theme \} \}\)/);
  // web_order → Innstillinger → Glimt → Nettsøk (PUT /api/ai/backend {web:{order}})
  assert.match(A, /return saveBackend\(\{ web: \{ order: o2 \} \}, 'Rekkefølgen er lagret'\);/);
  // Søkeankeret for Desert Ant Labs-seksjonen
  assert.match(A, /\{ hl: 'ai-dal53', note: H \?/);
});
