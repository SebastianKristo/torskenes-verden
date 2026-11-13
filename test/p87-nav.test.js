// Prompt 87 (NAV87, claude-code-web-navigasjon-uten-reload.md): navigasjon skal ikke oppføre seg som en ny sidelasting.
// Målt i Playwright før rettingen: fotovinduet øverst ble fjernet og laget på nytt ved hvert fanebytte og tonet inn fra opacity 0
// sammen med resten av siden (ca. 250–300 ms), og FinansHub byttet hele skallet (sidemeny, topp) med innerHTML og hoppet til toppen.
// Testene her låser reglene; nettlesersjekken ligger i test/e2e51/nav87.e2e.mjs (npm run test:e2e).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, 'public', p), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ---------- scrollmem.js i en liten falsk nettleser ---------- */
async function fakeBrowser() {
  const scroller = { scrollTop: 0 };
  const listeners = {};
  const hist = { state: null, scrollRestoration: 'auto', replaceState(s) { this.state = s; } };
  const saved = { history: globalThis.history, document: globalThis.document, window: globalThis.window };
  globalThis.history = hist;
  globalThis.document = { scrollingElement: scroller, documentElement: scroller };
  globalThis.window = { addEventListener: (ev, fn) => { (listeners[ev] ??= []).push(fn); }, scrollTo: (x, y) => { scroller.scrollTop = y; } };
  const { scrollMemory } = await import(`${pathToFileURL(join(ROOT, 'public/js/scrollmem.js')).href}?t=${Math.random()}`);
  const sm = scrollMemory();
  const scrollTo = (y) => { scroller.scrollTop = y; for (const f of listeners.scroll ?? []) f(); };
  const user = () => { for (const f of listeners.wheel ?? []) f(); }; // stopper «hold posisjonen»-tidtakeren
  return { sm, hist, scroller, scrollTo, user, restore() { user(); Object.assign(globalThis, saved); } };
}

test('scrollmem: nettleserens egen gjenoppretting er slått av, ny modul åpner øverst og tilbake gir samme posisjon', async () => {
  const b = await fakeBrowser();
  try {
    assert.equal(b.hist.scrollRestoration, 'manual');
    b.sm.enter('dash');
    assert.equal(b.hist.state.__sx, 0);
    b.scrollTo(350);
    // Ny oppføring (lenke): historikken har ikke noe løpenummer ennå.
    b.hist.state = null;
    b.sm.enter('studie');
    assert.equal(b.scroller.scrollTop, 0, 'ny modul starter øverst');
    assert.equal(b.hist.state.__sx, 1);
    b.user(); b.scrollTo(120);
    // Tilbake-knappen: nettleseren gir tilbake state for forrige oppføring.
    b.hist.state = { __sx: 0 };
    b.sm.enter('dash');
    assert.equal(b.scroller.scrollTop, 350, 'tilbake gir samme scroll-posisjon');
    // Frem igjen: siden vi gikk tilbake fra er glemt og åpner øverst.
    b.user();
    b.hist.state = { __sx: 1 };
    b.sm.enter('studie');
    assert.equal(b.scroller.scrollTop, 0);
  } finally { b.restore(); }
});

test('scrollmem: ny side i samme modul åpner på «top» (min(nåværende, heroHøyde)), ikke øverst på siden', async () => {
  const b = await fakeBrowser();
  try {
    b.sm.enter('ov');
    b.scrollTo(600);
    b.hist.state = null;
    b.sm.enter('dir', { top: Math.min(600, 110) });
    assert.equal(b.scroller.scrollTop, 110, 'innholdet starter øverst i innholdsområdet');
    b.user();
    // Lite scroll fra før: posisjonen beholdes.
    b.scrollTo(40);
    b.hist.state = null;
    b.sm.enter('kv', { top: () => Math.min(40, 110) });
    assert.equal(b.scroller.scrollTop, 40);
    b.user();
    // Tilbake bruker den huskede posisjonen, ikke «top».
    b.hist.state = { __sx: 0 };
    b.sm.enter('ov', { top: 110 });
    assert.equal(b.scroller.scrollTop, 600);
  } finally { b.restore(); }
});

/* ---------- Homelab web ---------- */
test('Homelab: fanene er hash-lenker (klientruting) – ingen target, reload eller full sidelasting ved fanebytte', () => {
  const html = read('app.html');
  const links = [...html.matchAll(/<a\s[^>]*data-r="([a-z]+)"[^>]*>/g)];
  assert.ok(links.length >= 20);
  for (const [tag, r] of links) {
    assert.doesNotMatch(tag, /target=/, `fanen ${r} skal ikke ha target`);
    const href = /href="([^"]+)"/.exec(tag)[1];
    // Økonomi er FinansHub – en egen app under /finans/ (dokumentert unntak, se docs/navigasjon-uten-reload.md).
    if (r === 'okonomi') assert.equal(href, '/finans/'); else assert.match(href, /^#\//, `fanen ${r} skal være en hash-lenke`);
  }
  const app = noComments(read('js/app.js'));
  assert.doesNotMatch(app, /location\.reload\(/);
  assert.equal((app.match(/location\.(replace|assign)\(/g) ?? []).length, 1, 'bare omdirigeringen fra den gamle #/okonomi-lenken');
});

test('Homelab: fotovinduet hører til skallet – visningen byttes med swapView, ikke view.innerHTML rett i ruteren', () => {
  const app = noComments(read('js/app.js'));
  const rr = app.slice(app.indexOf('function renderRoute()'), app.indexOf('function swapView('));
  assert.match(rr, /swapView\(/);
  assert.doesNotMatch(rr, /view\.innerHTML\s*=/);
  const sv = app.slice(app.indexOf('function swapView('), app.indexOf('const TITLES'));
  assert.match(sv, /classList\.contains\('pw-low'\)/, 'lavt vindu → lavt vindu beholder elementet');
  assert.match(sv, /oldBottom\.replaceWith\(nextBottom\)/, 'bare kicker og tittel byttes');
  assert.match(sv, /img\.replaceWith\(oldImg\)/, 'bildelaget som er malt flyttes over når vinduet må lages på nytt');
});

test('Homelab: overgangen gjelder bare innholdet, er maks 220 ms og av ved «Reduser bevegelse»', async () => {
  const w = read('js/web52.js');
  const pe = noComments(w.slice(w.indexOf('function pageEnter'), w.indexOf('/* ---------------- Ruter: buffer')));
  assert.match(pe, /if \(reduced\(\)\) return;/);
  assert.ok(pe.indexOf('if (reduced()) return;') < pe.indexOf('.animate('), 'ingen animasjon når bevegelse er redusert');
  assert.doesNotMatch(pe, /view\.animate\(/, 'hele visningen (med fotovinduet) animeres ikke');
  assert.match(pe, /classList\.contains\('pw'\)\) continue;/);
  const ms = +/export const PAGE_MS87 = (\d+);/.exec(w)[1];
  assert.ok(ms > 0 && ms <= 220, `overgangen er ${ms} ms`);
  assert.match(pe, /duration: PAGE_MS87/);
});

test('Homelab: bakgrunnsmenyen i topplinjen tegnes bare når den er endret, og Oslo-bildet byttes når været kommer – ikke ved fanebytte', () => {
  const h = read('js/hltheme.js'); // ikke noComments: «image/*» i menyen ser ut som starten på en kommentar
  const m = h.slice(h.indexOf('export function renderBgMenu'), h.indexOf('export async function pickPhoto'));
  assert.match(m, /if \(host\.__html87 !== html87\)/);
  assert.equal((m.match(/host\.innerHTML = /g) ?? []).length, 2);
  const w41 = noComments(read('js/web41.js'));
  assert.match(w41, /lastKey = bgState\(\)\.type === 'oslo' \? osloKey41\(\) : null;/);
  assert.match(w41, /on\?\.\('weather', \(\) => \{ sunFromWeather\(\); osloTick\(\); \}\)/);
});

/* ---------- FinansHub web ---------- */
test('FinansHub: skallet (sidemeny og topp) blir stående – draw() fletter inn endringene i stedet for å bytte hele #app', () => {
  const d = noComments(read('finans/js/desktop.js'));
  const draw = d.slice(d.indexOf('export function draw()'), d.indexOf('const focusSel'));
  assert.match(draw, /paintShell87\(el, shell\(PAGE_FN\[u\.page\]\(\)\)\)/);
  assert.doesNotMatch(draw, /el\.innerHTML\s*=\s*shell\(/);
  const ps = d.slice(d.indexOf('export function paintShell87'), d.indexOf('function contentTop87'));
  assert.match(ps, /morph87\(side, nSide\)/);
  assert.match(ps, /morph87\(head, nHead\)/);
  assert.match(ps, /while \(head\.nextSibling\) head\.nextSibling\.remove\(\)/, 'bare innholdet under toppen byttes');
  // Første tegning (ingen .app ennå) og ukjent oppbygning faller tilbake til full tegning.
  assert.match(ps, /\{ el\.innerHTML = html; return; \}/);
});

test('FinansHub: sidemenyen er hash-lenker og sticky, og ny side bruker min(nåværende, toppen av innholdet)', () => {
  const d = noComments(read('finans/js/desktop.js'));
  const nav = d.slice(d.indexOf('function sideNav()'), d.indexOf('function aiPanel()'));
  assert.match(nav, /<a href="#\/\$\{p\}"/);
  assert.doesNotMatch(nav, /target=/);
  const route = d.slice(d.indexOf('export function route()'), d.indexOf('const busyWrap'));
  assert.match(route, /const y87 = window\.scrollY;\s*\n\s*draw\(\);/);
  assert.match(route, /top87 = Math\.min\(y87, contentTop87\(\)\)/);
  assert.match(route, /\.enter\(next, \{ top: top87 \}\)/);
  assert.doesNotMatch(route, /location\.reload\(/);
  assert.match(read('finans/css/finans.css'), /\.side\{[^}]*position:sticky;top:0/);
  // Cachet data vises straks: siden tegnes før load() henter på nytt.
  assert.ok(route.indexOf('draw();') < route.indexOf('load();'));
});

test('Dokumentasjonen forklarer unntaket Homelab → Økonomi (egen app, ekte sidelasting)', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'navigasjon-uten-reload.md'), 'utf8');
  assert.match(doc, /\/finans\//);
  assert.match(doc, /sidelasting/);
  assert.match(doc, /prefers-reduced-motion|Reduser bevegelse/);
});
