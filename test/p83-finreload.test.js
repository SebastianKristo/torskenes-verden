// Prompt 83 (FINRELOAD83): Økonomi på web blinket og lastet seg inn på nytt ~1–2 s etter innlasting. Rotårsak: siden ble
// først styrt av Homelabs service worker (/sw.js, scope /), og når /finans/sw.js ble installert og tok over (clients.claim),
// tolket vercheck.js (desktop) og mobile-p32.js (mobil/PWA) controllerchange som «ny versjon» og kalte location.reload().
// Nå laster bare en oppdatering av den samme service workeren (samme skript-sti) siden på nytt – én gang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const O = 'http://127.0.0.1:4810';

test('isSwUpdate: bare samme skript-sti teller som ny versjon', async () => {
  const { isSwUpdate } = await import('../public/js/vercheck.js');
  assert.equal(isSwUpdate(null, `${O}/finans/sw.js`), false, 'første installasjon');
  assert.equal(isSwUpdate(`${O}/sw.js`, `${O}/finans/sw.js`), false, 'Homelab-SW → FinansHub-SW');
  assert.equal(isSwUpdate(`${O}/finans/sw.js`, `${O}/finans/sw.js`), true, 'oppdatert FinansHub-SW');
  assert.equal(isSwUpdate(`${O}/sw.js`, `${O}/sw.js`), true, 'oppdatert Homelab-SW');
  assert.equal(isSwUpdate(`${O}/finans/sw.js`, null), false, 'avregistrert');
});

/** Kjører startVersionCheck med en minimal falsk nettleser og returnerer hvor mange ganger siden ble lastet på nytt. */
async function simulate(initial, changes) {
  const listeners = {}, ss = new Map();
  let reloads = 0;
  const sw = { controller: initial ? { scriptURL: initial } : null, addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, register: () => Promise.resolve({ update: () => Promise.resolve() }) };
  const saved = {};
  const set = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); };
  set('window', { addEventListener() {} });
  set('document', { hidden: false, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null });
  set('navigator', { serviceWorker: sw });
  set('location', { href: `${O}/finans/`, reload: () => { reloads++; } });
  set('sessionStorage', { getItem: (k) => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, String(v)) });
  set('fetch', async () => ({ status: 404, ok: false }));
  set('setInterval', () => 0);
  try {
    const { startVersionCheck } = await import(`../public/js/vercheck.js?sim=${Math.random()}`);
    startVersionCheck({ sw: '/finans/sw.js', scope: '/finans/' });
    for (const next of changes) { sw.controller = next ? { scriptURL: next } : null; for (const f of listeners.controllerchange || []) f(); }
  } finally {
    for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  }
  return reloads;
}

test('vercheck: overtakelse fra /sw.js laster ikke siden på nytt, ny versjon av /finans/sw.js gjør det én gang', async () => {
  assert.equal(await simulate(`${O}/sw.js`, [`${O}/finans/sw.js`]), 0, 'Økonomi åpnet fra Homelab (feilen)');
  assert.equal(await simulate(null, [`${O}/finans/sw.js`]), 0, 'første besøk uten service worker');
  assert.equal(await simulate(`${O}/finans/sw.js`, [`${O}/finans/sw.js`]), 1, 'ny versjon tas i bruk');
  assert.equal(await simulate(`${O}/sw.js`, [`${O}/finans/sw.js`, `${O}/finans/sw.js`]), 1, 'overtakelse, så oppdatering');
  assert.equal(await simulate(`${O}/finans/sw.js`, [`${O}/finans/sw.js`, `${O}/finans/sw.js`]), 1, 'aldri to ganger på rad (løkkevern)');
});

test('mobile-p32.js bruker samme regel (ingen reload ved overtakelse fra en annen service worker)', () => {
  const src = readFileSync(join(ROOT, 'public/finans/js/mobile-p32.js'), 'utf8');
  assert.match(src, /import \{ isSwUpdate \} from '\.\.\/\.\.\/js\/vercheck\.js'/);
  const body = src.slice(src.indexOf('function swBoot'), src.indexOf('location.reload()', src.indexOf('function swBoot')));
  assert.match(body, /if \(!isSwUpdate\(prev, ctl\)\) return;/);
  assert.doesNotMatch(body, /const had = !!sw\.controller/);
});

// Ende-til-ende (hoppes over uten Playwright/Chromium): Homelab først (/sw.js styrer), så /finans/ – siden skal lastes én gang.
test('Playwright: Økonomi åpnet fra Homelab lastes bare én gang (desktop og mobil)', { timeout: 120_000 }, async (t) => {
  process.env.E2E_PORT ||= String(4830 + Math.floor(Math.random() * 60));
  const lib = await import('./e2e51/lib.mjs');
  const pw = await lib.loadPlaywright();
  if (!pw) return t.skip('Playwright er ikke installert');
  let browser;
  try { browser = await pw.chromium.launch(); } catch { return t.skip('Chromium mangler'); }
  const srv = await lib.startServer();
  try {
    for (const mobile of [false, true]) {
      const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' } : { viewport: { width: 1400, height: 900 } });
      await lib.apiLogin(ctx, 'Sebastian', lib.PASSWORD);
      const home = await ctx.newPage();
      await home.goto(`${lib.BASE}/`);
      await home.waitForFunction(() => navigator.serviceWorker?.controller?.scriptURL?.endsWith('/sw.js'), null, { timeout: 20_000 });
      await home.close();
      for (const visit of [1, 2]) {
        const page = await ctx.newPage();
        let loads = 0; page.on('load', () => { loads++; });
        await page.goto(`${lib.BASE}/finans/`);
        await page.waitForFunction(() => navigator.serviceWorker?.controller?.scriptURL?.endsWith('/finans/sw.js'), null, { timeout: 20_000 });
        await page.waitForTimeout(2500);
        assert.equal(loads, 1, `${mobile ? 'mobil' : 'desktop'}, besøk ${visit}: siden skal ikke lastes på nytt`);
        await page.close();
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    await srv.stop();
    rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
