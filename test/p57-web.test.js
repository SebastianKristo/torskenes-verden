// Prompt 57 (WEB57): statisk sjekk av web/PWA-delen for VoxCPM2-stemmer (Innstillinger → Glimt → Stemmer, nyhetsleseren,
// «Les høyt» i chat, admin-kortet). Nettleseren er sjekket for hånd med Playwright mot mock-serveren; her sjekkes kildene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const V = rd('public/js/voices57.js');
const G = rd('public/js/glimt35.js');
const N = rd('public/js/news.js');
const C = rd('public/js/chat.js');

test('voices57.js bruker stemme-API-et fra SERVER57 (per bruker, preview, sletting, klon med samtykke)', () => {
  for (const s of ["api('/voices57')", "fetch('/api/voices57', { method: 'POST', body: fd", '/api/voices57/${encodeURIComponent(id)}/preview', "/voices57/${encodeURIComponent(id)}`, { method: 'DELETE' }"]) assert.ok(V.includes(s), s);
  assert.match(V, /fd\.append\('kind', 'clone'\); fd\.append\('consent', 'true'\)/);
  assert.match(V, /kind: 'design', prompt/);
  assert.match(V, /Dette er min egen stemme, eller jeg har samtykke fra personen/);
  // Lagre-knappen er av uten avkrysset samtykke, og kloning stoppes i koden også.
  assert.match(V, /!c\.consent \|\| c\.rec \? ' disabled'/);
  assert.match(V, /if \(!c\.consent\) \{ V\.msg/);
  assert.match(V, /MediaRecorder/);
  assert.match(V, /REC_MIN = 10, REC_MAX = 30/);
});

test('admin-kortet for VoxCPM bruker admin-rutene og viser aldri nøkkelen', () => {
  for (const s of ['/api/admin/voxcpm57/health', '/api/admin/voxcpm57/config', '/api/admin/voxcpm57/test']) assert.ok(V.includes(s), s);
  assert.match(V, /name="key" type="password" value=""/);
  assert.doesNotMatch(V, /value="\$\{esc\(c\.key/);
  assert.match(V, /\[data-v54-ai\]/);
});

test('Glimt-innstillingene har VoxCPM-motoren, Stemmer-seksjonen og egen stemme for nyhetsleseren', () => {
  assert.match(G, /\['voxcpm', 'VoxCPM2 \(Mac mini, lokal\)'/);
  assert.match(G, /voicesHtml57\(\)/);
  assert.match(G, /newsVoice: null/);
  assert.match(G, /engineSwitched57\(en\.dataset\.gsEngine\)/);
  assert.match(V, /data-v57-news/);
  assert.match(V, /saveGlimt\(\{ tts: \{ newsVoice: t\.value \|\| null \} \}\)/);
});

test('nyhetsleseren og chat leser opp via /api/tts med valgt stemme og faller tilbake til speechSynthesis', () => {
  assert.match(N, /speak57\(txt, \{ purpose: 'news'/);
  assert.match(C, /speak57\(txt, \{ purpose: 'chat'/);
  assert.doesNotMatch(N, /new SpeechSynthesisUtterance/);
  assert.doesNotMatch(C, /new SpeechSynthesisUtterance/);
  assert.match(V, /fetch\('\/api\/tts'/);
  assert.match(V, /purpose = 'news' \? 'news' : 'glimt'|apiPurpose = purpose === 'news' \? 'news' : 'glimt'/);
  assert.match(V, /if \(got\.fail !== undefined\) \{ browserSay/);
  assert.match(V, /new SpeechSynthesisUtterance/);
  assert.match(V, /KI-stemme/);
  assert.match(N, /aiTag57\(\)/);
  assert.match(C, /aiTag57\(\)/);
});

test('lyd spilles med Web Audio (CSP uten media-src blokkerer blob:-lyd i <audio>)', () => {
  assert.match(V, /decodeAudioData/);
  assert.doesNotMatch(G, /new Audio\(/);
  assert.doesNotMatch(V, /<audio controls/);
  assert.equal((V.match(/new Audio\(/g) ?? []).length, 1); // bare reserven uten Web Audio
});

test('chunks57 deler lang tekst i biter under serverens grense på 1500 tegn', () => {
  const src = V.slice(V.indexOf('export function chunks57'), V.indexOf('function setState'));
  const chunks57 = new Function(`const MAXC = 1400; ${src.replace('export function', 'function')}; return chunks57;`)();
  assert.deepEqual(chunks57(''), []);
  assert.deepEqual(chunks57('Hei. Hallo!'), ['Hei. Hallo!']);
  const long = Array.from({ length: 80 }, (_, i) => `Dette er setning nummer ${i + 1} i en lang nyhetsoppsummering.`).join(' ');
  const parts = chunks57(long, 1400);
  assert.ok(parts.length >= 3);
  assert.ok(parts.every((p) => p.length <= 1400 && p.length > 0));
  assert.ok(parts.every((p) => /\.$/.test(p)), 'bitene slutter ved setningsslutt');
  assert.equal(parts.join(' '), long);
  const word = 'a'.repeat(3000);
  assert.ok(chunks57(word, 1400).every((p) => p.length <= 1400));
});
