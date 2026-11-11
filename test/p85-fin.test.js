// Prompt 85 (FIN85): feil funnet i gjennomgangen av FinansHub web (public/finans/**) – én test per retting.
// Modulene i public/finans/js trenger en nettleser (document, /assets/-importer), så de fleste testene leser kildekoden
// og kjører de små, rene funksjonene derfra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
/** Henter «const navn = …;» / «function navn(…) {…}» fra en kildefil (til og med linja som slutter blokken). */
function pick(code, start, endLine) {
  const i = code.indexOf(start);
  assert.ok(i >= 0, `fant ikke «${start}»`);
  const j = code.indexOf(endLine, i);
  assert.ok(j > i, `fant ikke slutten «${endLine}»`);
  return code.slice(i, j + endLine.length);
}

test('Glimt-oppgaver: alle fire oppgavene sendes med et navn serveren kjenner', () => {
  const gj = src('public/finans/js/gj42.js'), srv = src('server/finans/glimt-tasks42.js');
  const kinds = [...pick(gj, 'export const TASKS = [', '];').matchAll(/\['([a-z_]+)',/g)].map((m) => m[1]);
  assert.equal(kinds.length, 4);
  const map = Function(`${pick(gj, 'export const SERVER_KIND', '};').replace('export ', '')} return SERVER_KIND;`)();
  const server = [...pick(srv, 'export const KINDS42 = {', '\n};').matchAll(/^\s{2}([a-z_]+): \{/gm)].map((m) => m[1]);
  assert.ok(server.length >= 4, 'leste KINDS42');
  for (const k of kinds) assert.ok(server.includes(map[k] ?? k), `«${k}» → «${map[k] ?? k}» finnes ikke i KINDS42 (${server.join(', ')})`);
  assert.match(gj, /json: \{ kind: SERVER_KIND\[kind\] \?\? kind,/, 'startTask oversetter før kallet');
});

test('Glimt-oppgaver: serverens jobb (state/stepLabel/endedAt) blir ferdig, ikke «kjører» for alltid', () => {
  const gj = src('public/finans/js/gj42.js');
  const code = pick(gj, 'const ms85 =', "pdf:").replace(/export /g, '').replace(/,\s*pdf:$/, ' });');
  const { norm, res85 } = Function('TASKS', 'kr', `${code}; return { norm, res85 };`)([['report', 'Forbruksrapport nå']], (v) => `${Math.round(v)} kr`);
  const done = norm({ id: 'gt1', kind: 'cut_subs', title: 'Abonnementer jeg kan kutte', state: 'done', step: 3, pct: 100, stepLabel: null, createdAt: '2026-11-11T12:00:00.000Z', endedAt: '2026-11-11T12:00:05.000Z', result: { items: [{ name: 'Viaplay', monthly: 449 }, { name: 'Netflix', monthly: 149 }], text: 'Glimt fant 2' } });
  assert.equal(done.status, 'done');
  assert.equal(done.step, null, 'tallet step er ikke en etikett («3 … 100 %»)');
  assert.equal(done.created, Date.parse('2026-11-11T12:00:00.000Z'), 'tider som tall, så lista kan sorteres');
  assert.equal(done.finished, Date.parse('2026-11-11T12:00:05.000Z'));
  assert.deepEqual(done.result.rows.map((r) => [r.n, r.v, r.w]), [['Viaplay', '449 kr', '100%'], ['Netflix', '149 kr', '33%']]);
  const run = norm({ id: 'gt2', kind: 'report', state: 'running', step: 1, pct: 40, stepLabel: 'Leser kvitteringer og varelinjer', createdAt: '2026-11-11T12:00:00.000Z' });
  assert.equal(run.status, 'running'); assert.equal(run.step, 'Leser kvitteringer og varelinjer'); assert.equal(run.title, 'Forbruksrapport nå');
  assert.equal(norm({ id: 'gt3', kind: 'report', state: 'failed', error: 'x' }).status, 'error');
  assert.equal(norm({ id: 'l1', kind: 'report', status: 'done', created: 5, finished: 9, result: { rows: [], kpis: [] } }).finished, 9, 'lokale jobber er uendret');
  const rep = res85({ spent: 13239.2, count: 8, avg: 1655, top: { name: 'Bolig' }, categories: [{ name: 'Bolig', sum: 9500 }, { name: 'Skole', sum: 950 }], advice: [{ title: 'Sjekk X.', text: 'Y' }], text: 'Du har brukt …' });
  assert.deepEqual(rep.kpis[0], ['Brukt totalt', '13239 kr']); assert.equal(rep.rows[1].w, '10%'); assert.deepEqual(rep.tips, [['Sjekk X.', 'Y']]);
  assert.equal(res85(null), null);
});

test('Planlegging (desktop): siden har en (tom) lasteliste, så åpningen ikke gir «Cannot read properties of undefined»', () => {
  const mod = src('public/finans/js/modules.js');
  const fn = [...pick(mod, 'export const MODULE_FN = {', '};').matchAll(/(\w+):/g)].map((m) => m[1]);
  const ld = [...pick(mod, 'export const MODULE_LOADERS = {', '};').matchAll(/(\w+): \[/g)].map((m) => m[1]);
  assert.ok(fn.includes('plan'));
  for (const k of fn) assert.ok(ld.includes(k), `MODULE_LOADERS mangler «${k}» (desktop.js load() gjør LOADERS[side].map)`);
});

test('«Nytt i versjon»: lang tekst vises én gang (serverens more er hele teksten)', async () => {
  const { body52 } = await import('../public/finans/js/whatsnew52.js');
  const full = 'Første setning. Andre setning. Tredje setning som er lang.';
  assert.equal(body52({ text: 'Første setning. Andre setning.', more: full }), full);
  assert.equal(body52({ text: 'Første setning. Andre …', more: full }), full, 'avkortet med …');
  assert.equal(body52({ text: 'Kort.', more: '' }), 'Kort.');
  assert.equal(body52({ text: 'Kort.', more: 'Noe helt annet.' }), 'Kort. Noe helt annet.', 'tillegg som ikke gjentar teksten beholdes');
});

test('Tidligere versjoner: «10.11.2026» er 10. november, ikke 11. oktober', () => {
  const p44 = src('public/finans/js/mobile-p44.js');
  const line = pick(p44, 'const vDate = (v) =>', "replace('.', ''); };");
  const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mk = (today) => Function('isoD', 'dayIso', 'hm', `${line} return vDate;`)(isoD, () => today, (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const out = mk('2026-11-11')('10.11.2026');
  assert.match(out, /^10\.? nov/, out); // ICU-avhengig: «10. nov» eller «10 nov.»
  assert.equal(mk('2026-11-10')('10.11.2026'), 'i dag', 'dato uten klokkeslett får ikke «i dag 00:00»');
  assert.match(mk('2026-11-11')('2026-10-03T08:15:00'), /^3\.? okt/);
  assert.equal(mk('2026-11-11')('tull'), 'tull');
});

test('Studie og Kontoer: bare én henting om gangen mens skjermen tegnes flere ganger', async () => {
  for (const [file, name] of [['public/finans/js/mobile-p44s.js', 'studieLoad'], ['public/finans/js/mobile-p44.js', 'usersLoad']]) {
    const code = src(file), busy = name === 'studieLoad' ? 'studieBusy' : 'usersBusy';
    const wrap = pick(code, `let ${busy} = null;`, `return (${busy} = p);\n}`).replace('export ', '');
    let calls = 0, release;
    const inner = () => { calls++; return new Promise((r) => { release = r; }); };
    const load = Function(`${name}1`, `${wrap}; return ${name};`)(inner);
    const a = load(), b = load(), c = load();
    assert.equal(calls, 1, `${name}: tre tegninger → én henting`);
    assert.equal(a, b); assert.equal(b, c);
    release(); await a; await Promise.resolve();
    load(); assert.equal(calls, 2, `${name}: ny henting når den forrige er ferdig`);
    load(true); assert.equal(calls, 3, `${name}: force henter alltid`);
    release();
  }
});

test('Oppstart uten nett: norsk forklaring i stedet for «Failed to fetch»', () => {
  const main = src('public/finans/js/main.js');
  const bootFailText = Function(`${pick(main, 'export const bootFailText', "'Ukjent feil') });").replace('export ', '')} return bootFailText;`)();
  assert.match(bootFailText(new TypeError('Failed to fetch'), false).text, /uten nett/);
  assert.match(bootFailText(new TypeError('Failed to fetch'), true).text, /Serveren svarer ikke/);
  assert.doesNotMatch(JSON.stringify(bootFailText(new TypeError('Failed to fetch'), true)), /Failed to fetch/);
  assert.equal(bootFailText(new Error('Feil 500'), true).text, 'Feil 500');
  assert.match(main, /if \(e\?\.auth\) return;/, 'innloggingen får skjermen ved 401');
  assert.match(main, /addEventListener\('online', \(\) => location\.reload\(\), \{ once: true \}\)/);
});

test('CSS: søkefeltet i Aksjer → Transaksjoner og statusbrikken i Abonnementer', () => {
  const css = src('public/finans/css/mobile.css');
  // html[data-v3] .search (finans.css) har flex-basis 280px og .pp-card er en kolonne → 280 × 280 px uten denne regelen.
  const ak = css.match(/\.m\.papir \.aks form\.ak-search\{([^}]*)\}/)?.[1] ?? '';
  assert.match(ak, /flex:none/); assert.match(ak, /flex-direction:row/); assert.match(ak, /width:auto/);
  // .m button{padding:0} slår .stchip{padding:…}; regelen må ha minst samme spesifisitet og stå etter.
  assert.ok(css.indexOf('.m .stchip{padding:4px 10px}') > css.indexOf('.m button{border:0;background:none;color:inherit;padding:0}'));
  assert.match(css, /\.m\.papir \.stchip\.warn\{color:var\(--pp-onLabC\)\}/);
});

test('Negative beløp beholder minustegnet (Total saldo, Spart, «igjen å bruke»)', () => {
  const pages = src('public/finans/js/mobile-pages.js');
  const n0 = (v) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(Math.abs(v ?? 0)));
  const krS = Function('n0', `${pick(pages, 'export const krS', 'kr`;').replace('export ', '')} return krS;`)(n0);
  assert.match(krS(-1091288), /^−1.091.288 kr$/); // n0() alene ga «1 091 288 kr»
  assert.match(krS(143905), /^143.905 kr$/);
  assert.equal(krS(0), '0 kr');
  assert.match(pages, /l: 'Total saldo', v: krS\(tot\)/);
  assert.match(pages, /l: 'Spart', v: krS\(inn - ut\)/);
  assert.match(src('public/finans/js/mobile-p45.js'), /\$\{bal < 0 \? '−' : ''\}\$\{n0\(bal\)\} kr disponibelt/);
  assert.match(src('public/finans/js/mobile-paper.js'), /\['FINANS', s \? neg0\(s\.left\)/);
  assert.match(src('public/finans/js/mobile-hl.js'), /\$\{neg0\(s\.left\)\} kr/);
});

test('main.js laster bare den visningen som brukes, og visningene tegner ikke over hverandre', () => {
  const main = src('public/finans/js/main.js');
  assert.doesNotMatch(main, /^import .* from '\.\/(desktop|mobile)\.js';/m, 'ingen statisk import av begge visningene');
  assert.match(main, /import\('\.\/mobile\.js'\)/); assert.match(main, /import\('\.\/desktop\.js'\)/);
  assert.match(main, /if \(n !== picking \|\| next === ui\) return;/, 'et eldre valg kan ikke ta over etter et nyere');
  assert.match(pick(src('public/finans/js/mobile.js'), 'export function draw() {', 'P39.holdDraw()'), /dataset\.ui === 'desktop'\) return;/);
  assert.match(pick(src('public/finans/js/desktop.js'), 'export function draw() {', 'const el = root();'), /dataset\.ui === 'mobile'\) return;/);
});

test('CSS (desktop): kompakt sidemeny viser ikonene, lange navn i Planlegging brytes, kontrast i mørkt/lyst tema', () => {
  const fin = src('public/finans/css/finans.css'), f42 = src('public/finans/css/fin42.css');
  // finans.css skjuler alle span-er i menylenkene i kompakt modus; ikonet (.n42-tile) er også en span og må vises igjen.
  assert.match(fin, /html\[data-compact\][^{]*\.nav a>span:not\(\.badge\)[^{]*\{display:none\}/);
  assert.match(f42, /html\[data-ui=desktop\]\[data-compact\] \.nav a>span\.n42-tile\{display:grid\}/);
  assert.match(f42, /html\[data-theme="mork"\] \.b42 \.b42-btn\.green,html\[data-theme="glod"\] \.b42 \.b42-btn\.green\{color:#fff\}/);
  assert.match(src('public/finans/css/plan51.css'), /\.p51-list li span\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(src('public/finans/js/modules.js'), /'#A9C3FF'/, 'Kjøp-merket bruker temaets blå');
  assert.doesNotMatch(src('public/finans/js/subs-desktop.js'), /color:#FF8A3D/, 'PRØVEPERIODER-etiketten bruker temaets etikettfarge');
});

test('CSS (mobil): lyse farger fra det mørke designet får papirfarger', () => {
  const css = src('public/finans/css/mobile.css');
  assert.match(css, /\.m\.papir \[style\*="color:#9FE3C6"\]:not\(\[style\*="background"\]\)\{color:var\(--pp-pos\)!important\}/);
  assert.match(css, /\.m\.papir \[style\*="color:#FFB08A"\]:not\(\[style\*="background"\]\)\{color:var\(--pp-lab\)!important\}/);
  assert.match(css, /\.m\.papir \.pp-cta,[^{]*\.m\.papir \.p43-gpill\{color:var\(--pp-onLab,#fff\)!important\}/);
  // Malene skriver fargen nøyaktig slik regelen leter etter den (store bokstaver, uten mellomrom).
  assert.match(src('public/finans/js/mobile-pages.js'), /c: '#9FE3C6'|vc: [^,]*'#FFB08A'/);
  assert.match(src('public/finans/js/mobile-pages.js'), /style="color:\$\{o\.vc \?\? 'inherit'\}"/);
});
