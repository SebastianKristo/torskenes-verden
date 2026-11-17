// mobile.css (Økonomi på mobil-web): død kode og !important. Tallet for !important skal bare gå ned (CLAUDE.md: ingen
// !important uten begrunnelse; STATUS «!important i CSS»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/finans/css/mobile.css', import.meta.url), 'utf8');
const js = (f) => readFileSync(new URL(`../public/finans/js/${f}`, import.meta.url), 'utf8');
const utenKommentarer = css.replace(/\/\*[\s\S]*?\*\//g, '');

test('Papir er alltid på, så temaet er alltid «and» og .ios settes aldri', () => {
  assert.match(js('mobile-paper.js'), /export const paper = \(\) => true;/);
  assert.match(js('mobile.js'), /export const theme = \(\) => \{ if \(paper\(\)\) return 'and';/);
});

test('mobile.css har ingen regler for det slettede iOS-temaet (.ios)', () => {
  assert.doesNotMatch(utenKommentarer, /\.ios(?![\w-])/);
});

test('mobile.css har ingen regler for rotklasser .m aldri får (Papir er alltid på: .two, .nobar, .backtop, :not(.papir))', () => {
  // Roten får alltid «m and papir» (mobile.js draw). To paneler (.two), «uten fanelinje» (.nobar) og «tilbake øverst» (.backtop)
  // fantes bare i det slettede Klassisk-designet.
  assert.doesNotMatch(utenKommentarer, /\.(?:m|and)(?:\.[\w-]+)*(?:\.two|\.nobar|\.backtop|\.nobg)(?![\w-])/);
  assert.doesNotMatch(utenKommentarer, /\.m(?:\.[\w-]+)*:not\(\.papir\)/);
});

test('stegprikkene i Mat og fargene i Kvitteringer/Finn er klasser, ikke inline stil som CSS må overstyre', () => {
  assert.match(js('mobile-mat.js'), /<i\$\{i <= k \? ' class="on"' : ''\}><\/i>/);
  assert.doesNotMatch(utenKommentarer, /mp2-dots i\[style/);
  for (const f of ['mobile.js', 'mobile-finn.js']) assert.doesNotMatch(js(f), /style="[^"]*color:#(9FE3C6|FFB08A)/i, f);
});

test('kategorifargene fra serveren blir papirfarger i JS, ikke med !important mot inline stil', async () => {
  assert.doesNotMatch(utenKommentarer, /\[style\*="color:/, 'mobile.css skal ikke overstyre inline stil');
  const { papirTekst } = await import('../public/finans/js/mobile-theme.js');
  assert.equal(papirTekst('#9FE3C6'), 'var(--pp-pos)'); // Inntekt
  assert.equal(papirTekst('#FFB08A'), 'var(--pp-lab)'); // Vedlikehold, Maling
  assert.equal(papirTekst('#B79CFF'), '#B79CFF');
  assert.match(js('mobile.js'), /export const amtC = \(v, th\) => \(v > 0 \? 'var\(--pp-pos\)'/);
  assert.match(js('mobile-mods.js'), /color:\$\{esc\(papirTekst\(e\.color/);
  for (const f of ['mobile.js', 'mobile-pages.js', 'mobile-tx.js', 'mobile-mods.js']) assert.doesNotMatch(js(f), /vc: '#9FE3C6'|> 0 \? '#9FE3C6'/, f);
});

test('antall !important i mobile.css går bare ned', () => {
  const n = (utenKommentarer.match(/!important/g) || []).length;
  assert.ok(n <= 561, `${n} !important (maks 561; 861 før oppryddingen, 582 etter runde 3)`);
});

test('hver linje i mobile.css med !important har en begrunnelse på linja over (CLAUDE.md)', () => {
  const KJENTE = ['Reduser bevegelse', 'animasjon', 'inline stil fra JS', 'målt: temaregler', 'konkurrerer med annen !important', 'ikke målt'];
  assert.match(css, /!important i denne fila/, 'forklaringen av kategoriene øverst i fila');
  const linjer = css.split('\n'), kode = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n'), mangler = [];
  linjer.forEach((l, i) => {
    if (!/!important/.test(kode[i])) return;
    const m = (linjer[i - 1] ?? '').match(/^\/\* !important: (.+) \*\/$/);
    if (!m || !m[1].split(', ').every((k) => KJENTE.includes(k))) mangler.push(`${i + 1}: ${l.slice(0, 70)}`);
  });
  assert.deepEqual(mangler, []);
});

test('butikkfargen bak logoen i Papir-radene er en CSS-variabel (--ti), så hvit bunn under logoen trenger ikke !important', () => {
  assert.match(js('mobile-posisjon-og-logoer.js'), /class="pp-ti\$\{ov \? ' p20-lg' : ''\}" style="--ti:/);
  assert.doesNotMatch(js('mobile-posisjon-og-logoer.js'), /class="pp-ti[^"]*" style="background:/);
  assert.match(utenKommentarer, /\.pp-ti\{[^}]*background:var\(--ti\)/);
  assert.match(utenKommentarer, /\.pp-ti\.p20-lg\{[^}]*background:#fff;/);
});

// STATUS «Unike hex i CSS»: fargene i mobile.css kommer fra tokens der et token har samme farge. På mobil står <html> alltid i
// Papir lys (data-theme="lys"), og mørk modus går via --pp-*/--m3-* fra mobile-theme.js, så --ds-* er Papir lys-verdiene her.
test('mobilvisningen setter data-theme="lys", så --ds-* i mobile.css alltid er Papir lys (også etter at vinduet har vært bredt)', () => {
  assert.match(js('main.js'), /if \(mob\) document\.documentElement\.dataset\.theme = 'lys';/);
});

test('mobile.css har ingen hex-reserve i var(--m3-…) og var(--pp-…): applyPaper setter dem alltid før første tegning', async () => {
  assert.doesNotMatch(utenKommentarer, /var\(--m3-[0-9A-Fa-f]{6},#/);
  const papir = js('mobile-theme.js').match(/light: \{([^}]*)\}/)[1];
  const pp = new Set([...papir.matchAll(/(\w+):/g)].map((x) => x[1]));
  assert.deepEqual([...utenKommentarer.matchAll(/var\(--pp-(\w+),\s*#/g)].map((x) => x[1]).filter((n) => pp.has(n)), []);
  const roller = js('mobile-theme.js').match(/const ROLE = \{([\s\S]*?)\};/)[1];
  const kjente = new Set([...roller.matchAll(/'?([0-9A-F]{6})'?\s*:/g)].map((x) => x[1]));
  const brukt = new Set([...utenKommentarer.matchAll(/var\(--m3-([0-9A-Fa-f]{6})\)/g)].map((x) => x[1].toUpperCase()));
  assert.deepEqual([...brukt].filter((h) => !kjente.has(h)), []);
});

test('mobile.css: tokenfargene fra Papir lys står ikke som hex i regler utenfor mørk modus', () => {
  // Fargene som har et token med samme verdi i Papir lys, brukes via tokenet (unntatt #fff, mørke regler (.pd) og verdier i
  // gradienter og skygger, der fargen ikke er en flate- eller tekstfarge).
  const rest = [];
  for (const m of utenKommentarer.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (/\.pd\b/.test(m[1])) continue;
    for (const d of m[2].split(';')) {
      const [p, ...v] = d.split(':'); const val = v.join(':');
      if (!/^\s*(color|background-color|border-color|border(-top|-right|-bottom|-left)?-color)\s*$/.test(p)) continue;
      if (/#(1b1a17|b23a2a|2f7a4f|5c5850|8f897c)\b/i.test(val) && /^\s*color\s*$/.test(p)) rest.push(`${m[1].trim().slice(0, 60)} { ${d.trim()} }`);
      if (/#(f3efe6|fffdf8|ebe5d8|ece6da)\b/i.test(val) && /background-color/.test(p)) rest.push(`${m[1].trim().slice(0, 60)} { ${d.trim()} }`);
    }
  }
  assert.deepEqual(rest, []);
});

test('antall hex-farger i mobile.css går bare ned', () => {
  const n = (utenKommentarer.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  assert.ok(n <= 1741, `${n} hex (maks 1741)`);
});
