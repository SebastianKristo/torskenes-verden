// Skjold Lab hopper ikke under lasting (M5). Før: innholdet ble tegnet uten stil, og lista og skapet byttet plass mens delene
// ble hentet (CLS 0,49 på desktop og 0,57 på mobil). Målingen tar bare med layoutskift inne i siden (#sk76), ikke topplinjen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

const PROFILER = [
  { navn: 'desktop', cpu: 1, vent: 5000, ctx: { viewport: { width: 1440, height: 900 } } },
  { navn: 'mobil', cpu: 4, vent: 8000, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];
function observe() {
  window.__sk = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      const inne = (e.sources ?? []).filter((s) => s.node?.closest?.('#sk76') || (s.node && s.node.id === 'sk76'));
      if (inne.length) window.__sk.push({ v: e.value, n: inne.map((s) => `${s.node.tagName}.${s.node.className}`).join(', ') });
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

for (const p of PROFILER) {
  test(`Skjold Lab: ingen layoutskift i siden under lasting (${p.navn})`, async (t) => {
    if (!E) return t.skip('ingen nettleser');
    const ctx = await E.browser.newContext({ ...p.ctx, serviceWorkers: 'block' });
    t.after(() => ctx.close());
    await apiLogin(ctx, 'sebastian', PASSWORD);
    await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme: '2c', onboarded: true } });
    const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
    if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
    await ctx.addInitScript(observe);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    await page.goto(`${BASE}/#/skjold`, { waitUntil: 'load' });
    await page.waitForTimeout(p.vent);
    const skift = await page.evaluate(() => window.__sk);
    const sum = skift.reduce((a, x) => a + x.v, 0);
    assert.ok(sum < 0.05, `CLS i Skjold Lab ${sum.toFixed(3)}: ${skift.map((x) => `${x.v.toFixed(3)} ${x.n}`).join(' | ')}`);
    assert.equal(await page.locator('#sk76 .sk76-empty b', { hasText: 'Ingen deler ennå' }).count(), 0, 'mock-dataene har deler');
  });
}
