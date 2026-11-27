// Prompt 57 (claude-code-bakgrunnsvelger.md): bakgrunnsvelgeren øverst på Oversikt (Papir) vokser ut fra knappen («Oslo ▾»,
// «Vær nå ▾» …), står rett under den med en pil mot knappen, og viser de fire bakgrunnene som bilderuter i et 2×2-rutenett:
// Vær nå, Planeter, Oslo, Gradient («Nåværende»/«Ingen» heter nå Gradient). Under: Eget bilde og Google Photos-album.
// Samme velger på mobil (390 px) og desktop (1440 px).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, watchErrors, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

for (const [w, h, mobile] of [[390, 844, true], [1440, 900, false]]) {
  test(`bakgrunnsvelgeren (${w} px): under knappen, pil, 2×2, lukkes utenfor og ved valg`, async (t) => {
    if (!E) return t.skip('ingen nettleser');
    const ctx = await E.browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    await apiLogin(ctx, 'sebastian', PASSWORD);
    await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme: '2c', onboarded: true, bgType: 'oslo' } });
    const wn = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
    if (wn?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: wn.version } });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(`${BASE}/#/oversikt`);
    await page.waitForSelector('[data-bgdd]', { state: 'visible', timeout: 15_000 });
    const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(await noScroll(), 'den lukkede menyen gir ingen sidelengs rulling');
    await page.click('[data-bgdd]');
    await page.waitForSelector('.hl-bgdd-menu.open', { timeout: 3000 });
    await page.waitForTimeout(350);
    const g = await page.evaluate(() => {
      const b = document.querySelector('[data-bgdd]').getBoundingClientRect(), m = document.querySelector('.hl-bgdd-menu');
      const r = m.getBoundingClientRect(), cs = getComputedStyle(m);
      const ar = parseFloat(cs.getPropertyValue('--bgdd-arrow'));
      return { bl: b.left, br: b.right, bb: b.bottom, l: r.left, r: r.right, t: r.top, w: r.width, vw: innerWidth, ar, radius: cs.borderTopLeftRadius,
        head: m.querySelector('.hl-bgdd-h')?.textContent.trim(),
        tiles: [...m.querySelectorAll('.hl-bgdd-grid [data-photo]')].map((x) => [x.dataset.photo, x.querySelector('.hl-bgdd-n')?.textContent.trim(), x.getAttribute('aria-checked')]),
        rows: [...m.querySelectorAll('.hl-bgdd-row')].map((x) => x.querySelector('.hl-bgdd-n')?.textContent.trim()) };
    });
    assert.deepEqual(g.tiles.map((x) => x[1]), ['Vær nå', 'Planeter', 'Oslo', 'Gradient'], 'rekkefølgen og navnene');
    assert.deepEqual(g.tiles.find((x) => x[0] === 'oslo')[2], 'true', 'valgt bakgrunn er markert');
    assert.deepEqual(g.rows, ['Eget bilde', 'Google Photos-album']);
    assert.match(g.head, /^BAKGRUNN/);
    assert.equal(g.radius, '24px');
    assert.ok(g.t >= g.bb, 'menyen står under knappen');
    assert.ok(g.l >= 15.5 && g.r <= g.vw - 15.5, `innenfor skjermen med 16 px marg (${g.l}–${g.r} av ${g.vw})`);
    assert.ok(g.w <= Math.min(320, g.vw - 32) + 0.5, `bredde min(320, skjerm − 32) (${g.w})`);
    assert.ok(Math.abs(g.l + g.ar - (g.bl + g.br) / 2) <= 2, 'pila peker på midten av knappen');
    // Trykk utenfor lukker.
    await page.mouse.click(4, 4); // hjørnet i topplinja: ingen knapp eller lenke
    await page.waitForSelector('.hl-bgdd-menu:not(.open)', { state: 'attached', timeout: 2000 });
    assert.equal(await page.getAttribute('[data-bgdd]', 'aria-expanded'), 'false');
    // Velg Gradient: lukkes, knappen heter «Gradient ▾», og valget er lagret.
    await page.click('[data-bgdd]');
    await page.waitForSelector('.hl-bgdd-menu.open');
    await page.click('.hl-bgdd-grid [data-photo="none"]');
    await page.waitForSelector('.hl-bgdd-menu:not(.open)', { state: 'attached', timeout: 2000 });
    await page.waitForFunction(() => document.querySelector('[data-bgdd]')?.textContent.trim() === 'Gradient ▾', null, { timeout: 3000 });
    assert.ok(await noScroll(), 'heller ikke etter at den er lukket');
    // Esc lukker.
    await page.click('[data-bgdd]');
    await page.waitForSelector('.hl-bgdd-menu.open');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hl-bgdd-menu:not(.open)', { state: 'attached', timeout: 2000 });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
