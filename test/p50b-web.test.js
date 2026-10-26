// Prompt 50b: statiske sjekker for to små web-fikser.
//  - claude-code-web-mikrofonknapp.md: mikrofonen i søkefeltet på Dashboard (voice54.js) er en 40×40 sirkel med sentrert
//    18 px strek-ikon, gjennomsiktig i hvile, rød under opptak, 0,18 s overgang – og ligger mellom «✦ AI» og «Søk».
//    Funksjonen er den samme som før: opptak til /api/voice53/transcribe (NB-Whisper/Voz/Phonon), ikke Web Speech i søket.
//  - claude-code-vaer-dra-piller-mobil.md: dra-pillene i Vær (wx52.js) virker med finger: touch-action:none på containerne,
//    ikke-passiv touchmove på document mens et drag pågår, tidlig fangst for Temp/Regn/Vind og 5 px-terskel for resten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('mikrofonknappen i søket følger md-en (utseende) og beholder tale til tekst via serveren', () => {
  const v = read('public/js/voice54.js');
  const rule = v.match(/form\[data-search\]\.sbar button\.v54-mic\{([^}]*)\}/)?.[1] ?? '';
  for (const s of ['width:40px', 'height:40px', 'padding:0', 'border-radius:50%', 'display:grid', 'place-items:center', 'border:1px solid #e4ddcf', 'background:transparent', 'color:#1b1a17', 'transition:background-color .18s,color .18s,border-color .18s']) {
    assert.ok(rule.includes(s), `mangler ${s}`);
  }
  assert.match(v, /form\[data-search\]\.sbar button\.v54-mic:hover\{background:#f3efe6\}/);
  assert.match(v, /button\.v54-mic\.v54-on\{background:#b23a2a!important;border-color:#b23a2a;color:#fff!important\}/);
  assert.match(v, /button\.v54-mic svg\{display:block;width:18px;height:18px\}/);
  assert.match(v, /const MIC = '<svg width="18" height="18"[^']*stroke-width="2"[^']*stroke-linecap="round"[^']*style="display:block"/);
  // Plassering: rett før «Søk» (submit), og «✦ AI» står før submit i extras.js.
  assert.match(v, /f\.insertBefore\(b, f\.querySelector\('button\[type="submit"\]'\)\)/);
  assert.match(read('public/js/extras.js'), /data-sq-ai[^`]*✦ AI<\/button><button type="submit">Søk<\/button>/);
  // Funksjonen er ikke byttet til Web Speech: opptaket sendes til serveren.
  assert.match(v, /fetch\('\/api\/voice53\/transcribe'/);
  assert.doesNotMatch(v, /SpeechRecognition/);
});

test('dra-pillene i Vær virker med finger', () => {
  const css = read('public/css/web52.css');
  const g = css.match(/\.g52\{([^}]*)\}/)?.[1] ?? '';
  for (const s of ['touch-action:none', 'user-select:none', '-webkit-user-select:none', '-webkit-touch-callout:none']) assert.ok(g.includes(s), `.g52 mangler ${s}`);
  assert.doesNotMatch(g, /pan-y/);
  const js = read('public/js/wx52.js');
  assert.match(js, /document\.addEventListener\('touchmove', \(e\) => \{ if \(active\.size && e\.cancelable\) e\.preventDefault\(\); \}, \{ passive: false, capture: true \}\)/);
  assert.match(js, /const early = k === 'modes';/);
  assert.match(js, /down\.cap = early && down\.touch;/);
  assert.match(js, /e\.pointerType !== 'mouse'/);
  assert.match(js, /if \(down\.cap\) \{ try \{ ctl\.setPointerCapture\(e\.pointerId\);/);
  assert.match(js, /Math\.abs\(e\.clientX - down\.x\) < 5/);
  // Knappens implisitte fangst (finger) som slippes skal ikke avslutte draget.
  assert.match(js, /lostpointercapture', \(e\) => \{ if \(e\.target === ctl &&/);
  // En container som tegnes bort midt i et drag skal ikke låse rullingen.
  assert.match(js, /addEventListener\('touchend', clear, true\)/);
});
