// Økonomi følger Homelab-temaet (Q15, B-F1): public/finans/js/tema.js og loader.js (første tegning), og abonnementssyklusene
// som serveren sender (sykluser.js, Q40). Kjøres uten nettleser: document, localStorage og matchMedia er enkle stubber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const store = new Map();
const attrs = {};
let systemDark = false;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.matchMedia = () => ({ get matches() { return systemDark; }, addEventListener() {} });
globalThis.document = { documentElement: { dataset: attrs } };
const puts = [];
globalThis.fetch = async (url, init) => { puts.push({ url, body: JSON.parse(init?.body ?? 'null') }); return { ok: true }; };
const events = [];
globalThis.window = { dispatchEvent: (e) => events.push(e) };
globalThis.CustomEvent ??= class extends Event { constructor(t, o) { super(t); this.detail = o?.detail; } };

const T = await import('../public/finans/js/tema.js');
const reset = () => { store.clear(); for (const k of Object.keys(attrs)) delete attrs[k]; systemDark = false; puts.length = 0; events.length = 0; };

test('Papir lys, Papir mørk og Glass gir lys, mork og glod', () => {
  reset();
  assert.equal(T.fhDesign({ hlTheme: '2c', web_theme: 'light' }), 'lys');
  assert.equal(T.fhDesign({ hlTheme: '2c', web_theme: 'dark' }), 'mork');
  assert.equal(T.fhDesign({ hlTheme: 'cur', web_theme: 'light' }), 'glod', 'Glass har bare mørk modus (Q13)');
  systemDark = true;
  assert.equal(T.fhDesign({ hlTheme: '2c', web_theme: 'system' }), 'mork');
});

test('theme51 (sok-tema-offline.js) går foran oppsettet, og lokal Homelab-kopi brukes uten oppsett', () => {
  reset();
  attrs.theme51 = 'dark'; attrs.theme51Eff = 'dark';
  assert.equal(T.fhDesign({ hlTheme: '2c', web_theme: 'light' }), 'mork');
  reset();
  store.set('hl_theme', '2c'); store.set('papir_web_mode', 'dark');
  assert.equal(T.fhDesign(null), 'mork');
  store.set('hl_theme', 'cur');
  assert.equal(T.fhDesign(null), 'glod');
});

test('ukjent Homelab-modus: det gamle FinansHub-valget gjelder', () => {
  reset();
  assert.equal(T.fhDesign({ hlTheme: '2c' }, 'mork'), 'mork');
  assert.equal(T.fhDesign({ hlTheme: '2c' }, 'lys'), 'lys');
  assert.equal(T.homelabMorkt({ hlTheme: '2c' }), null);
});

test('Homelab-temaet endres aldri av det gamle FinansHub-valget', () => {
  const src = readFileSync(new URL('../public/finans/js/desktop.js', import.meta.url), 'utf8');
  assert.ok(!/flyttFinansValg/.test(src));
  assert.equal(typeof T.flyttFinansValg, 'undefined');
});

test('loader.js velger samme tema som tema.js før første tegning', () => {
  const src = readFileSync(new URL('../public/finans/js/loader.js', import.meta.url), 'utf8');
  const run = (ls, dark = false) => {
    const a = {};
    const html = { setAttribute: (k, v) => { a[k] = v; } };
    const ctx = { document: { documentElement: html, querySelector: () => null, readyState: 'complete', getElementById: () => null, body: {}, addEventListener() {} },
      location: { search: '' }, localStorage: { getItem: (k) => ls[k] ?? null }, matchMedia: (q) => ({ matches: /prefers-color-scheme: dark/.test(q) ? dark : false }),
      fetch: () => Promise.resolve(), MutationObserver: class { observe() {} disconnect() {} }, setTimeout: () => 0, window: {} };
    ctx.window = ctx;
    vm.runInNewContext(src, ctx);
    return a['data-theme'];
  };
  assert.equal(run({ hl_theme: '2c', papir_web_mode: 'light' }), 'lys');
  assert.equal(run({ hl_theme: '2c', papir_web_mode: 'dark' }), 'mork');
  assert.equal(run({ hl_theme: '2c', papir_web_mode: 'system' }, true), 'mork');
  assert.equal(run({ hl_theme: 'cur' }), 'glod');
  assert.equal(run({ fh_design: 'mork' }), 'mork', 'ukjent Homelab-modus: gammelt valg');
});

test('sykluser: serverens liste brukes, ukesykluser får et kjent trekk i Oslo-året', async () => {
  const S = await import('../public/finans/js/sykluser.js');
  const d = { cycles: [{ id: 'weekly', name: 'Ukentlig', perLabel: '/uke' }, { id: 'monthly', name: 'Månedlig', perLabel: '/mnd' }, { id: 'quarterly', name: 'Kvartalsvis', perLabel: '/kvartal' }] };
  assert.deepEqual(S.sykluser(d).map((c) => c.id), ['weekly', 'monthly', 'quarterly']);
  assert.equal(S.syklus(d, 'quarterly').perLabel, '/kvartal');
  assert.equal(S.syklusRang(d, 'weekly') < S.syklusRang(d, 'quarterly'), true);
  assert.deepEqual(S.sykluser(null).map((c) => c.id), ['monthly', 'yearly', 'biennial'], 'reserve mot eldre servere');
  assert.equal(S.erUkesyklus('biweekly'), true);
  assert.equal(S.erUkesyklus('quarterly'), false);
  assert.match(S.kjentTrekk(31, 2), /^\d{4}-02-(28|29)$/, 'dagen kappes til månedens lengde');
});

test('Abonnementer i appen gjør ikke ukentlig om til månedlig', () => {
  const src = readFileSync(new URL('../public/finans/js/mobile-subs.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\* 52\) \/ 12/);
  assert.doesNotMatch(src, /cycle: wk \? 'monthly'/);
});

// Fase 7 (E-B7): «Lagre» i e-postimporten (Innstillinger → Import) hadde mørk tekst på mørkegrønn knapp i Papir lys (1,99:1), fordi
// --on-acc ikke finnes og reserven var mørk. Teksten på aksentfargen er --acc-ink, som hører til --acc i hvert tema.
test('e-postimporten på desktop: knappeteksten bruker --acc-ink, ikke en mørk reserve', () => {
  const src = readFileSync(new URL('../public/finans/js/desktop.js', import.meta.url), 'utf8');
  const pane = src.match(/data-mailpane style="([^"]*)"/)[1];
  assert.match(pane, /--mp-acc:var\(--acc\);--mp-acc-ink:var\(--acc-ink\)/);
  assert.doesNotMatch(pane, /--on-acc|#1A0C04/i);
});
