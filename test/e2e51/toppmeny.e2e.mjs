// Toppmenyen på desktop (B-B1/B2): fanene står på én linje, og de som ikke får plass, ligger under «Mer ▾».
// Alle synlige faner kan nås, og fanen for siden som er åpen, står alltid i menyen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, watchErrors, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

for (const hlTheme of ['2c', 'cur']) {
  test(`toppmenyen (${hlTheme === '2c' ? 'Papir' : 'Glass'}, 1280 px): én linje, resten under «Mer ▾»`, async (t) => {
    if (!E) return t.skip('ingen nettleser');
    const ctx = await E.browser.newContext({ viewport: { width: 1280, height: 860 } });
    await apiLogin(ctx, 'sebastian', PASSWORD);
    await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme, onboarded: true } });
    // «Nytt i denne versjonen» skal ikke ligge over menyen.
    const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
    if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(`${BASE}/#/skjold`);
    await page.waitForSelector('.nav-more:not([hidden])', { timeout: 15_000 });
    // Menyen måles på nytt når noe i topplinjen endrer bredde etter første tegning (skrift, profil, «Vær ▾»).
    // Vent til fanefordelingen har stått stille i 400 ms, ellers kan målingen og «Mer»-menyen komme fra hver sin runde.
    const state = () => page.evaluate(() => [...document.querySelectorAll('.pillnav > a[data-r]')].map((a) => `${a.dataset.r}:${a.classList.contains('nav-ovf')}`).join());
    for (let prev = '', i = 0; i < 20; i++) { const cur = await state(); if (cur === prev) break; prev = cur; await page.waitForTimeout(400); }
    const s = await page.evaluate(() => {
      const nav = document.querySelector('.pillnav');
      const all = [...nav.querySelectorAll(':scope > a[data-r]')].filter((a) => !a.hidden);
      const shown = all.filter((a) => getComputedStyle(a).display !== 'none');
      const tops = new Set(shown.map((a) => Math.round(a.getBoundingClientRect().top)));
      return { total: all.length, shown: shown.length, lines: tops.size, fits: nav.scrollWidth <= nav.clientWidth + 1, cur: shown.some((a) => a.dataset.r === 'skjold') };
    });
    assert.equal(s.lines, 1, 'fanene står på én linje');
    assert.ok(s.fits, 'ingen fane er skjult bak rullefelt');
    assert.ok(s.cur, 'fanen for siden som er åpen, vises');
    await page.click('.nav-more');
    const menu = await page.$$eval('.nav-more-menu:not([hidden]) a', (as) => as.map((a) => a.getAttribute('href')));
    assert.equal(s.shown + menu.length, s.total, 'hver fane finnes enten i menyen eller under «Mer»');
    await page.click('.nav-more-menu a >> nth=0');
    await page.waitForFunction((h) => location.hash === h || location.pathname === h, menu[0]);
    assert.ok(await page.$eval('.nav-more-menu', (m) => m.hidden), 'menyen lukkes etter valg');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
