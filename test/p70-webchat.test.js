// Prompt 70 (WEBCHAT70): lasteside for Chat på web (claude-code-chat-laster-web.md) og Sporing → Innstillinger → Moduler → Sporing
// (claude-code-sporing-innstillinger.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as N from '../public/js/settings65.js';

const read = (p) => readFileSync(p, 'utf8');
const BOOT = read('public/js/chat70-boot.js');
const CH = read('public/js/chat.js');
const C70 = read('public/js/chat70.js');
const CSS = read('public/css/chat70.css');
const APP = read('public/app.html');
const TRK = read('public/js/tracking.js');
const SET = read('public/js/settings.js');
const SP = read('public/js/settings-track70.js');
const SS = read('public/js/settings-search.js');

/** Kjører chat70-boot.js i en liten falsk nettleser. Returnerer {win, view}. */
function runBoot({ hash = '#/chat', mobile = false, store = {} } = {}) {
  const view = { firstChild: null, innerHTML: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const win = {
    location: { hash },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    performance: { now: () => 1000 },
    matchMedia: () => ({ matches: mobile }),
    document: { getElementById: (id) => (id === 'view' ? view : null), documentElement: { hasAttribute: () => false }, body: { classList: { add() {} } } },
  };
  win.window = win;
  vm.runInNewContext(BOOT, win);
  return { win, view };
}

test('chat-laster: statisk skjelett i app.html før JS-bunten, egen css', () => {
  const iBoot = APP.indexOf('/assets/js/chat70-boot.js'), iMain = APP.indexOf('<main id="view">');
  assert.ok(iBoot > iMain, 'skriptet kjøres etter <main id="view">');
  assert.ok(!/chat70-boot\.js"[^>]*(type="module"|defer|async)/.test(APP), 'vanlig synkront skript');
  assert.match(APP, /\/assets\/css\/chat70\.css/);
  const { view } = runBoot();
  assert.match(view.innerHTML, /id="chat" class="ch ch-fs papir"/);
  for (const t of ['Laster Chat …', 'Henter samtalene dine og gjør klar Glimt.', 'Kobler til Homelab', 'Henter samtaler', 'Laster modell', 'Velger modell …', 'FESTET', 'SISTE 7 DAGER', 'Spør Glimt om hva som helst …']) assert.ok(view.innerHTML.includes(t), t);
  assert.match(view.innerHTML, /ch70-shim/, 'skimmer i sidemenyen');
  assert.equal(view.attrs['aria-busy'], 'true');
  // Andre sider: ingen skjelett for Chat.
  assert.equal(runBoot({ hash: '#/dash' }).view.innerHTML, '');
  // Smal skjerm: ingen sidemeny.
  assert.ok(!runBoot({ mobile: true }).view.innerHTML.includes('ch70-side'));
});

test('chat-laster: samtalelista fra cache (per bruker) i det statiske skjelettet', () => {
  const list = { pinned: [{ id: 'a', title: 'Festet <b>samtale</b>' }], folders: [], chats: [{ id: 'b', title: 'Middag i kveld' }] };
  const mine = runBoot({ store: { hl_uid: 'u1', hl_chat70: JSON.stringify({ uid: 'u1', list }) } }).view.innerHTML;
  assert.match(mine, /ch70-cached/);
  assert.ok(mine.includes('Middag i kveld'));
  assert.ok(mine.includes('Festet &lt;b&gt;samtale&lt;/b&gt;'), 'titler escapes');
  const other = runBoot({ store: { hl_uid: 'u2', hl_chat70: JSON.stringify({ uid: 'u1', list }) } }).view.innerHTML;
  assert.ok(!other.includes('Middag i kveld'), 'ikke en annen brukers cache');
});

test('chat-laster: tilstandene laster · treg · feil (tekst, steg, knapper, orb)', () => {
  const { win } = runBoot({ hash: '#/dash' });
  const H = win.HL70;
  const steps = [{ s: 'ok', t: 'home.kristo.no' }, { s: 'run', t: '9 s' }, { s: 'wait', t: '' }];
  const treg = H.html({ mode: 'treg', steps, t0: 0 });
  assert.ok(treg.includes('Tar litt lengre tid enn vanlig'));
  assert.ok(treg.includes('Homelab svarer sakte. Samtalene vises så snart de er hentet.'));
  assert.ok(treg.includes('Prøv igjen') && treg.includes('Bruk lokal modell'));
  assert.ok(!/data-l70-btns hidden/.test(treg), 'knappene vises i treg');
  assert.match(treg, /ch70-spin/);
  assert.ok(treg.includes('9 s'));
  const feil = H.html({ mode: 'feil', steps: [{ s: 'ok', t: 'x' }, { s: 'err', t: 'svarer ikke' }, { s: 'wait', t: '' }], t0: 0 });
  assert.ok(feil.includes('Fikk ikke kontakt med Homelab'));
  assert.match(feil, /ch70-orb sad/, 'orben grå og trist');
  assert.match(feil, /ch70-err">!/);
  assert.ok(!feil.includes('ch70-shim'), 'ingen skimmer ved feil');
  const ok = H.html({ mode: 'laster', steps, modelOk: true, model: 'llama3.1:8b', t0: 0 });
  assert.match(ok, /<i class="ok"><\/i><span data-no-i18n>llama3\.1:8b/, 'grønn prikk og modellnavn i pillen');
  assert.match(ok, /data-l70-btns hidden/, 'ingen knapper mens alt går normalt');
});

test('chat-laster: midten tones inn etter 300 ms (ingen blink), animasjoner bare transform/opacity', () => {
  assert.match(CSS, /\.ch70-mid\{[^}]*opacity:0;animation:ch70In/);
  assert.match(BOOT, /300 - Math\.round\(now\(\) - \(st\.t0 \|\| 0\)\)/);
  for (const [, body] of CSS.matchAll(/@keyframes \w+\{([^@]*?)\}\s*(?=@|\n)/g)) {
    const props = [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
    for (const p of props) assert.ok(['transform', 'opacity'].includes(p), `keyframes animerer ${p}`);
  }
  assert.match(CSS, /prefers-reduced-motion/);
});

test('chat-laster: tidsgrenser, steg og cache i chat70.js', async () => {
  const M = await import('../public/js/chat70.js');
  assert.equal(M.SLOW70, 8000);
  assert.equal(M.FAIL70, 20000);
  let failed = 0;
  M.start70(() => {}, () => { failed++; });
  assert.deepEqual(M.L70.steps.map((x) => x.s), ['run', 'wait', 'wait']);
  M.step70(0, 'ok', 'home.kristo.no');
  assert.deepEqual(M.L70.steps.map((x) => x.s), ['ok', 'run', 'run'], 'samtaler og modell hentes parallelt');
  M.step70(1, 'ok', '42 samtaler');
  M.fail70();
  assert.equal(M.L70.mode, 'feil');
  assert.equal(failed, 1);
  assert.deepEqual(M.L70.steps.map((x) => x.s), ['ok', 'ok', 'err']);
  assert.equal(M.L70.steps[2].t, 'svarer ikke');
  M.stop70();
  assert.equal(M.listCount70({ pinned: [1], chats: [1, 2], folders: [{ chats: [1, 2, 3] }] }), 6);
  const t = M.trimList70({ pinned: [], folders: [], chats: [{ id: 'x', title: 'T', updatedAt: 1, model: 'auto', messages: [{ content: 'hemmelig' }] }] });
  assert.deepEqual(t.chats[0], { id: 'x', title: 'T', updatedAt: 1, model: 'auto' }, 'bare titler og sist brukt i cachen');
  assert.match(C70, /localStorage\.setItem\(KEY/);
});

test('chat-laster: chat.js bruker lastesiden, henter parallelt, siste 30 meldinger først og fokus i skrivefeltet', () => {
  assert.ok(!CH.includes("'<div class=\"ch-miss\"><span>Laster Chat …</span></div>'"), 'ikke bare tekst midt på siden');
  assert.match(CH, /C\.ready70 \? body\(\) : loaderHtml70\(/);
  assert.match(CH, /call\('\/models', \{ signal \}\)\), ps = tap\(call\('\/settings', \{ signal \}\)\), pl = tap\(call\('\/chats', \{ signal \}\)\)/);
  assert.match(CH, /if \(C\.ready70\) \{ if \(C\.q\) searchChats\(C\.q, true\); paintSide\(\); \}/, 'samtalelista byttes ut i bakgrunnen');
  assert.match(CH, /cacheWrite70\(\{ list: v \}\)/);
  assert.match(CH, /Math\.max\(0, msgs\.length - C\.show70\)/);
  assert.match(CH, /show70: 30/);
  assert.match(CH, /Vis eldre meldinger/);
  assert.match(CH, /'l70Retry' in d\) \{ load70\(\)/);
  assert.match(CH, /'l70Local' in d\) \{ useLocal70\(\)/);
  assert.match(C70, /inp\.focus\(\{ preventScroll: true \}\)/);
  assert.match(C70, /ch70-out/, 'orben og stegene glir ut');
  assert.match(CSS, /\.ch70-fadein [^{]*\{animation:ch70In \.15s/, 'ekte rader tones inn på 150 ms');
});

test('sporing-innstillinger: ny side Moduler → Sporing mellom Ruter og Studie', () => {
  const mod = Object.fromEntries(N.MENU65).Moduler;
  assert.ok(mod.indexOf('sporing') === mod.indexOf('ruter') + 1 && mod.indexOf('studie') === mod.indexOf('sporing') + 1);
  assert.match(SET, /\.\.\.TABS70,/);
  assert.match(SET, /sporing: \(\) => sporView70\(H,/);
  assert.match(SET, /await click70\(e, render\)/);
  assert.match(SP, /\['sporing', 'Sporing', 'Kilder, transportører og varsler', 'Moduler', SP70_IC\]/);
  assert.match(SP, /SP70_COL = '#A8661A'/);
  for (const t of ['Kilde: e-post (Proton)', 'Kilde: Finn-handler', 'Arkiver leverte automatisk', 'Leverte pakker flyttes til arkivet', 'Varsler for pakker', 'Ny pakke, klar for henting, ute for levering, forsinket og levert',
    'Posten og Bring', 'PostNord', 'DHL', 'UPS', '17TRACK', 'Tilkoblet', 'Mangler nøkkel', 'Nøkler i Integrasjoner ›', 'Sjekk nå', 'Sist sjekket']) assert.ok(SP.includes(t), t);
  assert.match(SP, /'papir_spor_set'/);
  assert.match(SP, /api\('\/tracking\/sources', \{ method: 'PUT'/, 'synkes til serveren per bruker');
  assert.match(SP, /api\('\/tracking\/refresh', \{ method: 'POST' \}\)/, '«Sjekk nå» kjører innhentingen');
  assert.match(SP, /go: 'int\|cfg:Sporing'/, 'transportørene åpner nøklene i Integrasjoner');
  assert.ok(!SP.includes('/tracking/keys') && !/\.(tail|masked)\b/.test(SP), 'ingen API-nøkler hentes eller vises');
});

test('sporing-innstillinger: søk i Innstillinger finner sidene', () => {
  for (const w of ['sporing', 'pakke', 'transportør', 'postnord', 'bring', 'dhl', 'ups', '17track', 'proton', 'arkiv']) {
    assert.ok(SP.includes(w), `rad-søk: ${w}`);
    assert.ok(new RegExp(`'sporing70'[^\\n]*${w}`).test(SS), `indeks: ${w}`);
  }
  assert.match(SS, /'chat-regler', 'sporing70'\]/);
});

test('sporing-innstillinger: Sporing-siden har bare én rad til Innstillinger', () => {
  assert.ok(!/<b>KILDER<\/b>|<b>TRANSPORTØRER<\/b>|<b>Transportører<\/b>/.test(TRK), 'KILDER og TRANSPORTØRER er fjernet');
  assert.ok(!TRK.includes('trk-srcs'), 'kildeknappene er fjernet (mobil)');
  assert.ok(TRK.includes('Kilder, transportører og varsler') && TRK.includes('E-post, Finn, arkivering og API-nøkler ligger i Innstillinger') && TRK.includes('Innstillinger ›'));
  assert.match(TRK, /openSettings\('sporing'\)/);
  assert.match(TRK, /trk-gear70/, '⚙ i toppen');
});
