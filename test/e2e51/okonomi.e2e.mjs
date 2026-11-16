// Fase 6 (Q3, Q4, O3): Økonomi er en modul i Homelab med egen undermeny. Gamle adresser videresendes, Faste betalinger har tre
// filtre, og mobil-web er ikke et eget Homelab-skall. Kjøres med `npm run test:e2e` (ikke i `npm test`). Hoppes over uten Playwright.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, apiLogin, watchErrors, PASSWORD } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

async function open(path, { mobile = false } = {}) {
  const ctx = await E.browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await apiLogin(ctx, 'sebastian', PASSWORD);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}
const info = (page) => page.evaluate(() => ({
  url: location.pathname + location.hash, h1: document.querySelector('h1')?.textContent?.trim() ?? '',
  side: [...document.querySelectorAll('.side .nav a')].map((a) => a.textContent.trim().replace(/\d+$/, '')),
  tabs: [...document.querySelectorAll('.pp-nav[data-ctx=fin] a')].map((a) => a.getAttribute('aria-label') ?? a.textContent.trim()),
  filters: [...document.querySelectorAll('.fb-filter b, .fb-chip')].map((x) => x.textContent.trim()),
  cur: document.querySelector('.fb-filter.on b, .fb-chip.on')?.textContent?.trim() ?? null,
}));

test('desktop: sidemenyen har Økonomis sider med de nye navnene', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, errors } = await open('/finans/#/ov');
  const i = await info(page);
  for (const n of ['Oversikt', 'Transaksjoner', 'Budsjett', 'Faste betalinger', 'Sparing og planer', 'Kontoer og aksjer', 'Kvitteringer', 'Boliger', 'Finn-handler', 'Rapporter', 'Innstillinger']) assert.ok(i.side.includes(n), `mangler ${n} i ${i.side.join(', ')}`);
  for (const n of ['Subscription OS', 'Planlegging', 'Faste utgifter', 'Aksjer', 'Import']) assert.ok(!i.side.includes(n), `${n} skal ikke stå i sidemenyen`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('desktop: gamle adresser videresendes til den nye plassen', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, errors } = await open('/finans/#/ov');
  for (const [from, to, h1, cur] of [['#/sub', '#/fast/abonnementer', 'Faste betalinger', 'Abonnementer'], ['#/abonnement', '#/fast/abonnementer', 'Faste betalinger', 'Abonnementer'],
    ['#/fast/faste', '#/fast/faste', 'Faste betalinger', 'Faste utgifter'], ['#/fast/planlagte', '#/fast/planlagte', 'Faste betalinger', 'Planlagte trekk'],
    ['#/aks', '#/konto/aksjer', 'Kontoer og aksjer', 'Aksjer'], ['#/imp', '#/inn/imp', 'Innstillinger', null], ['#/planlegging', '#/plan', 'Sparing og planer', null]]) {
    await page.evaluate((h) => { location.hash = h; }, from);
    await page.waitForTimeout(900);
    const i = await info(page);
    assert.equal(i.url, `/finans/${to}`, from);
    assert.equal(i.h1, h1, from);
    if (cur) assert.equal(i.cur, cur, from);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mobil: /finans/ åpner Økonomi med egen undermeny og vei tilbake til Homelab', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, errors } = await open('/finans/', { mobile: true });
  const i = await info(page);
  assert.equal(i.h1, 'Økonomi');
  assert.deepEqual(i.tabs, ['Oversikt', 'Transaksjoner', 'Budsjett', 'Faste betalinger', 'Mer']);
  assert.equal(await page.locator('.pp-back[href="/"]').first().textContent(), '‹ Homelab');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mobil: Homelab-sider åpnes i Homelab-skallet, Faste betalinger har filtrene', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, errors } = await open('/finans/#/spor', { mobile: true });
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(new URL(page.url()).hash, '#/sporing');
  await page.goto(`${BASE}/finans/#/fast/abonnementer`);
  await page.waitForTimeout(2000);
  const i = await info(page);
  assert.deepEqual(i.filters, ['Abonnementer', 'Faste utgifter', 'Planlagte trekk']);
  assert.equal(i.cur, 'Abonnementer');
  assert.equal(i.h1, 'Faste betalinger');
  assert.deepEqual(errors.filter((e) => !/\/api\//.test(e)), []);
  await ctx.close();
});

// Runde 3: Innstillinger → Nyheter, Media, Ruter og Home Assistant tegnes av moduler som lastes etter oppstart. Startet appen
// rett på adressen, kastet settingsView «PAGE[page] is not a function» (fanget av hver modul og logget som advarsel) til
// modulen var lastet.
test('mobil: direkte start på Innstillinger-sider fra moduler som lastes senere gir ingen feil', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  await apiLogin(ctx, 'sebastian', PASSWORD);
  for (const [hash, tekst] of [['#/set/nyheter', 'Legg til adresse'], ['#/set/widgets', 'Widget'], ['#/set/media', ''], ['#/set/ruter', ''], ['#/set/helseha', '']]) {
    const page = await ctx.newPage();
    const feil = [];
    page.on('pageerror', (e) => feil.push(e.message));
    page.on('console', (m) => { if (/is not a function/.test(m.text())) feil.push(m.text().split('\n')[0]); });
    await page.goto(`${BASE}/finans/${hash}`);
    await page.waitForTimeout(2500);
    assert.equal(new URL(page.url()).hash, hash);
    if (tekst) assert.match(await page.locator('.m-scroll').innerText(), new RegExp(tekst, 'i'), hash);
    assert.deepEqual(feil, [], hash);
    await page.close();
  }
  await ctx.close();
});
