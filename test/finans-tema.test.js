// Økonomi følger Homelab-temaet (Q15, B-F1): public/finans/js/tema.js og loader.js (første tegning),.
// Kjøres uten nettleser: document, localStorage og matchMedia er enkle stubber.
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

test('theme51 (webx51.js) går foran oppsettet, og lokal Homelab-kopi brukes uten oppsett', () => {
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

test('FinansHub-valget flyttes til Homelab én gang (mork → Papir mørk, glod → Glass)', () => {
  reset();
  const l = { hlTheme: '2c', web_theme: 'light', design: 'mork' };
  assert.equal(T.flyttFinansValg(l), true);
  assert.equal(store.get('papir_web_mode'), 'dark');
  assert.equal(events.at(-1)?.type, 'papir-web-mode', 'webx51.js lagrer modusen i /api/me/theme51');
  assert.equal(T.flyttFinansValg({ hlTheme: '2c', web_theme: 'light', design: 'mork' }), false, 'bare én gang');
  reset();
  assert.equal(T.flyttFinansValg({ hlTheme: '2c', web_theme: 'light', design: 'glod' }), true);
  assert.equal(store.get('hl_theme'), 'cur');
  assert.deepEqual(puts.at(-1), { url: '/api/me/layout', body: { hlTheme: 'cur' } });
  reset();
  assert.equal(T.flyttFinansValg({ hlTheme: 'cur', web_theme: 'light', design: 'mork' }), false, 'Glass er alt mørkt');
  assert.equal(store.get('fh_design_flyttet'), '1');
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
