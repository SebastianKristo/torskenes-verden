// Prompt 71 (ANIWEB71, claude-code-animasjoner-jevne.md): jevne animasjoner på web/PWA.
// Statisk sjekk av public/ (utenom public/finans, som er en egen app og ikke var med i denne runden):
//   - ingen @keyframes animerer annet enn transform/translate/rotate/scale/opacity (hvitliste med begrunnelse under),
//   - skimmere flytter et ferdig lag med transform (ikke background-position), pulser er ferdige lag (ikke box-shadow),
//   - brytere glir med transform (ikke `transition: left`),
//   - mikrofon-bølgeformen skrives i et animasjonsbilde (ikke setInterval), og Glimt-orben roterer et ferdig lag.
// Målingene før/etter (Chromium + CDP, CPU 4×) ligger utenfor npm test (scratchpad), se rapporten for prompt 71.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUB = join(ROOT, 'public');
const SKIP_DIRS = new Set(['finans', 'vendor', 'node_modules']);

function files(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(f)) files(p, out); }
    else if (/\.(css|js|html)$/.test(f)) out.push(p);
  }
  return out;
}
const ALL = files(PUB).map((p) => ({ rel: relative(PUB, p).replaceAll('\\', '/'), text: readFileSync(p, 'utf8') }));

/** Alle @keyframes i en tekst (CSS-fil, CSS i JS-strenger, <style> i HTML): [{name, body}]. */
function keyframes(text) {
  const out = [], re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let i = re.lastIndex, depth = 1;
    while (i < text.length && depth) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
    out.push({ name: m[1], body: text.slice(re.lastIndex, i - 1) });
  }
  return out;
}
const propsOf = (body) => new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]));

const OK = new Set(['transform', 'translate', 'rotate', 'scale', 'opacity']);
// Unntak (fil → keyframes → begrunnelse). Hold lista kort.
const ALLOW = {
  'css/app.css': {
    'dx-open': 'Avgangsdetaljene folder seg ut (grid-template-rows 0fr→1fr, 200 ms, én gang): innholdet under skal skyves jevnt ned. Med transform ville det hoppe – utseendet skal ikke endres.',
  },
};

test('ingen @keyframes animerer layout-, maling- eller filteregenskaper (bare transform og opacity)', () => {
  const bad = [];
  let n = 0;
  for (const f of ALL) {
    for (const k of keyframes(f.text)) {
      n++;
      const extra = [...propsOf(k.body)].filter((p) => !OK.has(p));
      if (extra.length && !ALLOW[f.rel]?.[k.name]) bad.push(`${f.rel} @keyframes ${k.name}: ${extra.join(', ')}`);
    }
  }
  assert.ok(n > 100, `fant bare ${n} keyframes – feil i skanningen?`);
  assert.deepEqual(bad, [], `Animer bare transform/opacity (eller legg til et begrunnet unntak):\n${bad.join('\n')}`);
});

test('hvitlista er oppdatert (hvert unntak finnes fortsatt og har begrunnelse)', () => {
  for (const [rel, ks] of Object.entries(ALLOW)) {
    const f = ALL.find((x) => x.rel === rel);
    assert.ok(f, `${rel} finnes ikke`);
    for (const [name, why] of Object.entries(ks)) {
      assert.ok(keyframes(f.text).some((k) => k.name === name), `${rel}: @keyframes ${name} finnes ikke lenger – fjern unntaket`);
      assert.ok(why.length > 30, `${rel} ${name}: skriv en begrunnelse`);
    }
  }
});

test('skimmere flytter et ferdig lag med transform', () => {
  const css = (rel) => ALL.find((x) => x.rel === rel).text;
  for (const [rel, name, sel] of [['css/media43.css', 'm43sk', '.m43-skel::after'], ['css/media70.css', 'm70sk', '.m70-skel::after'], ['css/web32.css', 'dm-shim', '.dm-sum-sk span::after'], ['css/web38.css', 'k38shim', '.k38-map-wait::after'], ['css/ai-control.css', 'acStripe', '.ac-stripe::after'], ['css/chat70.css', 'ch70Sh', '.ch70-shim']]) {
    const t = css(rel);
    const k = keyframes(t).find((x) => x.name === name);
    assert.ok(k, `${rel}: ${name}`);
    assert.match(k.body, /translateX/, `${rel}: ${name} skal bruke translateX`);
    assert.ok(t.includes(sel), `${rel}: ${sel}`);
  }
});

test('pulser og ringer er ferdige lag (::after) som skaleres/tones – ikke animert box-shadow', () => {
  const t = (rel) => ALL.find((x) => x.rel === rel).text;
  assert.match(t('js/voice54.js'), /\.v54-mic\.v54-on::after,\.ch-mic\.v54-on::after\{[^}]*animation:v54p/);
  assert.match(t('css/web35.css'), /\.gb-ring::after\{[^}]*animation:gbRing/);
  assert.match(t('css/web34.css'), /#settings \.hl-ring::after\{[^}]*animation:hlRing/);
  assert.match(t('js/memory63.js'), /\.m63-flash::after\{[^}]*animation:m63f/);
  assert.match(t('css/web40.css'), /\.hl40-glow::after\{[^}]*mix-blend-mode:color-dodge[^}]*animation:hl40g/);
});

test('brytere glir med transform, ikke left', () => {
  // Unntak: .cp36 (web36.css) er figuren som rir på fremdriftslinjen i Oppdateringer; plassen er prosent av linjen (left), og den
  // flytter seg bare når prosenten endres (sjeldent), ikke per bilde.
  const bad = ALL.filter((f) => /\.css$/.test(f.rel)).flatMap((f) => [...f.text.matchAll(/([^{}]+)\{[^}]*transition:\s*left\b[^}]*\}/g)].map((m) => `${f.rel} ${m[1].trim()}`)).filter((x) => !/ \.cp36$/.test(x));
  assert.deepEqual(bad, []);
  assert.match(ALL.find((x) => x.rel === 'css/web35.css').text, /\.gs-sw\.on i\{transform:translateX\(18px\)\}/);
  assert.match(ALL.find((x) => x.rel === 'css/web65.css').text, /\.gs-sw\.on i\{transform:translateX\(14px\)\}/);
});

test('ark (Familie-kart og Kart på smal skjerm) glir med transform, ikke animert høyde', () => {
  const fam = ALL.find((x) => x.rel === 'css/family50.css').text;
  assert.match(fam, /\.f50-sheet:not\(\.tall\) \{[^}]*transition: transform/);
  assert.doesNotMatch(fam.replace(/\/\*[\s\S]*?\*\//g, ''), /\.f50-sheet \{[^}]*transition: height/);
  const famJs = ALL.find((x) => x.rel === 'js/family50.js').text;
  assert.match(famJs, /sh\.style\.transform = `translateY\(/);
  assert.doesNotMatch(famJs, /sh\.style\.height = `/);
  const k46 = ALL.find((x) => x.rel === 'css/web46.css').text;
  assert.doesNotMatch(k46, /\.k46-pan\{[^}]*transition:height/);
  assert.match(ALL.find((x) => x.rel === 'js/kart46.js').text, /pan\.style\.transform = `translateY\(/);
});

test('mikrofon-bølgeformen, Hjem-flisene og fanebyttet bruker animasjonsbilder (ikke setInterval/tvungen layout)', () => {
  const v = ALL.find((x) => x.rel === 'js/voice54.js').text;
  const wave = v.slice(v.indexOf('function waveStart'), v.indexOf('function waveStop')).replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(wave, /setInterval/);
  assert.match(wave, /requestAnimationFrame/);
  assert.match(wave, /if \(last\[i\] !== tf\)/, 'bare endrede streker skrives');
  const h = ALL.find((x) => x.rel === 'js/home52.js').text;
  assert.match(h, /function flip71\(/);
  assert.match(h, /\.animate\(\[\{ translate:/);
  const w = ALL.find((x) => x.rel === 'js/web52.js').text;
  const pe = w.slice(w.indexOf('function pageEnter'), w.indexOf('/* ---------------- Ruter: buffer')).replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(pe, /offsetWidth/);
  assert.match(pe, /view\.animate\(/);
  assert.match(ALL.find((x) => x.rel === 'css/web52.css').text, /\.h52\.edit \.h52-i\{[^}]*will-change:rotate,translate/);
});

test('Glimt-orbene roterer et ferdig lag (ingen animert conic-gradient-vinkel/@property)', () => {
  for (const f of ALL) assert.doesNotMatch(f.text, /@property\s+--/, `${f.rel}: @property`);
  const ch = ALL.find((x) => x.rel === 'css/chat70.css').text;
  assert.match(ch, /\.ch70-ring\{[^}]*conic-gradient[^}]*animation:ch70Sp/);
  assert.match(keyframes(ch).find((k) => k.name === 'ch70Sp').body, /rotate/);
});

test('«Reduser bevegelse»: ark og kort tones kort inn', () => {
  const w = ALL.find((x) => x.rel === 'css/web52.css').text;
  assert.match(w, /@media \(prefers-reduced-motion:reduce\)\{\.tk-sheet,\.k2-sheet,[^}]*animation:fade71 \.15s/);
});
