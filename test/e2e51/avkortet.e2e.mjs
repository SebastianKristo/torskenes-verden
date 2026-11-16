// Avkortede titler (E-B13): i Sporing og Media får tekst som er kuttet med «…» hele teksten som tooltip (title) når pekeren
// kommer dit. Smal skjerm, så mock-dataene har noe som kuttes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, watchErrors, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

for (const hash of ['#/sporing', '#/media']) {
  test(`avkortet tekst får tooltip (${hash})`, async (t) => {
    if (!E) return t.skip('ingen nettleser');
    const ctx = await E.browser.newContext({ viewport: { width: 340, height: 780 }, isMobile: true, hasTouch: false });
    t.after(() => ctx.close());
    await apiLogin(ctx, 'sebastian', PASSWORD);
    await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme: '2c', onboarded: true } });
    const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
    if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(`${BASE}/${hash}`);
    await page.waitForSelector('#view', { state: 'attached', timeout: 15_000 });
    // Vent til siden har tekst med ellipse. Er ingen kuttet i mock-dataene (Media), får den første en lang tittel. Alt skjer i én
    // runde i siden, siden Media tegner seg selv på nytt med jevne mellomrom.
    const res = await page.waitForFunction(() => {
      const ell = [...document.querySelectorAll('body *')].filter((el) => !el.hasAttribute('title') && getComputedStyle(el).textOverflow === 'ellipsis' && el.textContent.trim()
        && el.getBoundingClientRect().width > 20 && !el.closest('header,nav,.ticker,[hidden]'));
      if (!ell.length) return null;
      let el = ell.find((x) => x.scrollWidth > x.clientWidth + 1);
      if (!el) { el = ell[0]; el.textContent = 'En svært lang tittel som ikke får plass på én linje i denne bredden – den kuttes med ellipse'; }
      const tekst = el.textContent.replace(/\s+/g, ' ').trim();
      el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      return { tekst, title: el.getAttribute('title') };
    }, null, { timeout: 15_000 }).then((h) => h.jsonValue()).catch(() => null);
    if (!res) return t.skip('ingen tekst med ellipse her');
    assert.equal(res.title, res.tekst);
    assert.deepEqual(errors, []);
  });
}
