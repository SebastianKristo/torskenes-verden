// Prompt 87 (NAV87, claude-code-web-navigasjon-uten-reload.md): testlista fra spesifikasjonen i en ekte nettleser.
// Kjøres med `npm run test:e2e` (ikke i `npm test`). Hoppes over når Playwright ikke finnes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, apiLogin, watchErrors, PASSWORD } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

async function open(path) {
  const ctx = await E.browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await apiLogin(ctx, 'sebastian', PASSWORD);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const docs = [];
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelectorAll('[class*="-veil"]').forEach((n) => n.remove())); // «Nytt i denne versjonen»
  page.on('request', (r) => { if (r.resourceType() === 'document') docs.push(r.url()); });
  return { ctx, page, errors, docs };
}
// Merker skallet, og måler den laveste synligheten (opacity) fotovinduet har mens siden byttes.
const mark = (page, sels) => page.evaluate((s) => {
  window.__n87 = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, document.querySelector(v)]));
  window.__op87 = 1;
  const t0 = performance.now();
  const f = () => { const pw = document.querySelector('#view .pw-img'); let o = 1; for (let n = pw; n && n !== document.documentElement; n = n.parentElement) o *= +getComputedStyle(n).opacity; if (pw && !pw.style.backgroundImage) o = 0; window.__op87 = Math.min(window.__op87, o); if (performance.now() - t0 < 900) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}, sels);
const still = (page) => page.evaluate(() => Object.fromEntries(Object.entries(window.__n87).map(([k, n]) => [k, !!n && n.isConnected])));

test('Homelab: Hjem → Studie → Hjem uten at skallet tegnes på nytt, uten bakgrunnskall og uten dokument-forespørsel', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, errors, docs } = await open('/#/hjem');
  const bg = [];
  page.on('request', (r) => { if (/\/api\/(background|photo-window)|\/api\/bg\//.test(r.url())) bg.push(r.url()); });
  for (const r of ['studie', 'hjem']) {
    await mark(page, { toppmeny: 'header.top', faner: '.pillnav', bakgrunn: '.bg', hero: '#view > .pw', heroBilde: '#view > .pw > .pw-img' });
    await page.click(`.pillnav a[data-r="${r}"]`);
    await page.waitForTimeout(1000);
    assert.deepEqual(await still(page), { toppmeny: true, faner: true, bakgrunn: true, hero: true, heroBilde: true }, `skallet står etter bytte til ${r}`);
    assert.equal(await page.evaluate(() => window.__op87), 1, 'fotovinduet blinker ikke');
    assert.equal(await page.evaluate(() => document.body.dataset.route), r);
  }
  assert.deepEqual(bg, [], 'ingen nettverkskall for bakgrunnen');
  assert.deepEqual(docs, [], 'ingen dokument-forespørsel');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Homelab: tilbake-knappen gir forrige fane med samme scroll-posisjon', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, docs } = await open('/#/dash');
  await page.evaluate(() => window.scrollTo(0, 350));
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '#/studie'; });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => scrollY), 0, 'ny modul åpner øverst');
  await page.goBack();
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => Math.round(scrollY)), 350);
  assert.deepEqual(docs, []);
  await ctx.close();
});

test('FinansHub: Oversikt → Boliger med sidemenyen i ro, innholdet fra toppen av innholdsområdet, og tilbake gir samme scroll', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, errors, docs } = await open('/finans/?desktop#/ov');
  await page.waitForSelector('.side .nav a[href="#/dir"]');
  const start = await page.evaluate(() => Math.round(document.querySelector('header.head').nextElementSibling.getBoundingClientRect().top + scrollY));
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  await mark(page, { sidemeny: '.side', menyliste: '.side .nav', merke: '.side .brand', topp: 'header.head', sok: 'header.head form.search input' });
  await page.click('.side .nav a[href="#/dir"]');
  await page.waitForTimeout(1500);
  assert.deepEqual(await still(page), { sidemeny: true, menyliste: true, merke: true, topp: true, sok: true }, 'sidemenyen og toppen er de samme elementene');
  const s = await page.evaluate(() => ({ y: Math.round(scrollY), side: Math.round(document.querySelector('.side').getBoundingClientRect().top), cur: document.querySelector('.side .nav a[aria-current="page"]')?.getAttribute('href'), head: Math.round(document.querySelector('header.head').getBoundingClientRect().bottom) }));
  assert.equal(s.cur, '#/dir');
  assert.equal(s.side, 0, 'sidemenyen står stille');
  assert.ok(s.y > 0 && s.y <= start, `Boliger vises fra toppen av innholdet (scroll ${s.y}, innholdet starter på ${start})`);
  assert.ok(s.head <= 30, 'toppen hopper ikke inn igjen');
  await page.goBack();
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => Math.round(scrollY)), 600, 'tilbake gir samme posisjon i Oversikt');
  assert.deepEqual(docs, [], 'ingen dokument-forespørsel');
  assert.deepEqual(errors, []);
  await ctx.close();
});
