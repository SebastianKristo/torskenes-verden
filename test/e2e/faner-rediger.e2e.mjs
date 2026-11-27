// Prompt 57 (15.11): toppmenyen redigeres som på iOS. Hold inne en fane i 0,5 s → redigeringsmodus: fanene vibrerer og kan dras,
// rødt «−» skjuler en fane (ikke Oversikt), «+» sist åpner «Legg til fane» med de skjulte, «Ferdig» eller Esc avslutter.
// «Rediger faner» i profilmenyen åpner samme modus. Tastaturet kan flytte fanene med knappene ‹ ›.
// Oppsettet lagres per bruker på serveren (rekkefølgen i layout_tabs, de skjulte i /api/me/layout → hiddenTabs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, watchErrors, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

// «Reduser bevegelse» i den første testen: fanene vibrerer ellers, og Playwright klikker bare på elementer som står stille.
async function open(hlTheme = '2c', reducedMotion = 'no-preference') {
  const ctx = await E.browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  await apiLogin(ctx, 'sebastian', PASSWORD);
  await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme, onboarded: true } });
  const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
  if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/#/oversikt`);
  await page.waitForSelector('.pillnav > a[data-r="oversikt"]', { timeout: 15_000 });
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}
// Synlige faner i den rekkefølgen brukeren ser dem.
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('.pillnav > a[data-r]')].filter((a) => !a.hidden)
  .sort((a, b) => (Number(a.style.order) || 0) - (Number(b.style.order) || 0)).map((a) => a.dataset.r));
const hiddenOnServer = async (ctx) => (await (await ctx.request.get(`${BASE}/api/me/layout`)).json()).homelab?.hiddenTabs ?? null;

test('hold inne en fane: redigeringsmodus, skjul med «−», legg til med «+», Ferdig', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, errors } = await open('2c', 'reduce');
  const before = await shown(page);
  assert.ok(before.length >= 3, `minst tre faner (${before})`);
  const victim = before[1];
  // Et kort trykk navigerer som før og starter ikke redigeringen.
  const box = await page.locator(`.pillnav > a[data-r="${victim}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.waitForSelector('.pillnav.nav-edit', { timeout: 2000 });
  assert.equal(await page.evaluate(() => location.hash), '#/oversikt', 'å holde inne åpner ikke fanen');
  // Oversikt har ikke «−»; de andre har det.
  assert.equal(await page.locator('.pillnav > a[data-r="oversikt"] .nav-x').count(), 0, 'Oversikt kan ikke skjules');
  assert.equal(await page.locator(`.pillnav > a[data-r="${victim}"] .nav-x`).count(), 1);
  assert.equal(await page.locator('.nav-edit-bar .nav-add').count(), 1, '«+» finnes');
  assert.equal(await page.locator('.nav-edit-bar .nav-done').count(), 1, '«Ferdig» finnes');
  // Et trykk på fanen i redigeringsmodus navigerer ikke.
  await page.click(`.pillnav > a[data-r="${victim}"]`, { position: { x: 30, y: 10 } });
  assert.equal(await page.evaluate(() => location.hash), '#/oversikt');

  await page.click(`.pillnav > a[data-r="${victim}"] .nav-x`);
  await page.waitForFunction((v) => document.querySelector(`.pillnav > a[data-r="${v}"]`)?.hidden, victim);
  await page.waitForTimeout(300);
  assert.ok((await hiddenOnServer(ctx))?.includes(victim), 'den skjulte fanen er lagret på serveren');

  await page.click('.nav-edit-bar .nav-add');
  await page.waitForSelector('.nav-add-menu:not([hidden])');
  assert.equal(await page.locator('.nav-add-menu [role="heading"], .nav-add-menu h2').first().textContent(), 'Legg til fane');
  await page.click(`.nav-add-menu [data-nav-add="${victim}"]`);
  await page.waitForFunction((v) => !document.querySelector(`.pillnav > a[data-r="${v}"]`)?.hidden, victim);
  const after = await shown(page);
  assert.equal(after.at(-1), victim, 'fanen som legges til, kommer sist');
  await page.waitForTimeout(300);
  assert.ok(!(await hiddenOnServer(ctx))?.includes(victim));

  await page.click('.nav-edit-bar .nav-done');
  assert.equal(await page.locator('.pillnav.nav-edit').count(), 0, 'Ferdig avslutter');
  assert.equal(await page.locator('.pillnav .nav-x').count(), 0);
  // Rekkefølgen er lagret på serveren og står etter en ny innlasting.
  await page.reload();
  await page.waitForSelector('.pillnav > a[data-r="oversikt"]');
  await page.waitForTimeout(600);
  assert.equal((await shown(page)).at(-1), victim, 'rekkefølgen står etter innlasting');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('«Rediger faner» i profilmenyen, tastatur (‹ ›) og Esc', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { ctx, page, errors } = await open('cur');
  await page.click('#profile-btn');
  const items = await page.$$eval('#menu .pm-it span:last-child', (s) => s.map((x) => x.textContent));
  const i = items.indexOf('Rediger faner');
  assert.ok(i > 0, `«Rediger faner» finnes i profilmenyen (${items})`);
  assert.equal(items[i - 1], 'Utseende og faner', 'rett etter «Tilpass forside og meny»');
  assert.equal(items[i + 1], 'Tilpass Oversikt', 'rett før «Rediger widgets»');
  await page.click('#menu [data-act="nav-edit"]');
  await page.waitForSelector('.pillnav.nav-edit');
  assert.equal(await page.$eval('.pillnav.nav-edit > a[data-r]', (a) => getComputedStyle(a).animationName), 'nav-wiggle', 'fanene vibrerer');
  const before = await shown(page);
  const second = before[1];
  // Knappene for å flytte nås med tastaturet og har navn for skjermleseren.
  const right = page.locator(`.pillnav > a[data-r="${second}"] .nav-mv[data-nav-mv="1"]`);
  assert.match(await right.getAttribute('aria-label'), /Flytt .+ til høyre/);
  await right.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const moved = await shown(page);
  assert.equal(moved[2], second, 'fanen flyttet ett steg til høyre');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('a[data-r]')?.dataset.r), second, 'fokus følger fanen');
  assert.match(await page.locator('#nav-edit-live').textContent(), /flyttet/i, 'skjermleseren får beskjed');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.pillnav.nav-edit').count(), 0, 'Esc avslutter');
  const st = await (await ctx.request.get(`${BASE}/api/state`)).json();
  assert.ok(Array.isArray(st.layouts?.tabs) && st.layouts.tabs.length >= before.length, 'rekkefølgen er lagret på serveren');
  assert.deepEqual(errors, []);
  await ctx.close();
});
