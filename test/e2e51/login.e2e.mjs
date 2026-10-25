// Prompt 51 (QA51) E2E: innlogging i nettleseren, «Nytt i denne versjonen» og krasjrapporter fra web.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, json, watchErrors, apiLogin, showPasswordForm } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

test('innlogging: feil passord gir feilmelding, riktig passord åpner appen', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/`);
  await page.waitForURL(/\/login/);
  await showPasswordForm(page);
  await page.fill('#f-u', 'sebastian');
  await page.fill('#f-pw', 'feilpassord');
  await page.press('#f-pw', 'Enter');
  await page.waitForFunction(() => /feil|ugyldig/i.test(document.querySelector('.gate-form')?.innerText ?? ''), null, { timeout: 10_000 });
  assert.match(page.url(), /\/login/);
  await page.fill('#f-pw', PASSWORD);
  await page.press('#f-pw', 'Enter');
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15_000 });
  await page.waitForSelector('.shell .pillnav', { timeout: 15_000 });
  const me = await json(ctx, 'GET', '/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.username, 'sebastian');
  assert.deepEqual(errors, [], 'ingen JS-feil under innloggingen');
  await ctx.close();
});

test('«Nytt i denne versjonen»: vises første gang, ikke etter «Ok», og igjen etter en oppdatering', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext({ viewport: { width: 1280, height: 860 } });
  await apiLogin(ctx, 'sebastian', PASSWORD);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/`);
  const card = page.locator('[data-qa51="whatsnew"]');
  await card.waitFor({ timeout: 15_000 });
  const w = await json(ctx, 'GET', '/api/whatsnew');
  // Prompt 52: papirkortet har etiketten «NYTT I HOMELAB» og tittelen «Versjon x.y.z».
  const txt = await card.innerText();
  assert.match(txt, /nytt i homelab/i);
  assert.match(txt, new RegExp(`Versjon ${w.body.version.replace(/\./g, '\\.')}`));
  await card.getByRole('button', { name: 'Ok' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-qa51="whatsnew"]'));
  await page.waitForFunction(async () => (await (await fetch('/api/whatsnew')).json()).seen === true);
  await page.reload();
  await page.waitForSelector('.shell .pillnav');
  await page.waitForTimeout(800);
  assert.equal(await card.count(), 0, 'ikke vist igjen for samme versjon');
  // «Oppdatering»: brukeren har sist sett en eldre versjon → kortet kommer igjen.
  assert.equal((await json(ctx, 'POST', '/api/whatsnew/seen', { version: '0.0.1' })).status, 200);
  await page.reload();
  await card.waitFor({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-qa51="whatsnew"]'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('krasjrapport: en ufanget feil og et avvist løfte i nettleseren havner hos admin uten hemmeligheter', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext();
  await apiLogin(ctx, 'sebastian', PASSWORD);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.waitForSelector('.shell .pillnav');
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('E2E51 krasj med token=hemmelig123'); }, 0);
    Promise.reject(new Error('E2E51 avvist løfte'));
  });
  let crashes = [];
  for (let i = 0; i < 50 && crashes.length < 2; i++) {
    await page.waitForTimeout(200);
    crashes = (await json(ctx, 'GET', '/api/admin/crashes51?q=E2E51')).body.crashes;
  }
  assert.equal(crashes.length, 2, JSON.stringify(crashes));
  assert.ok(crashes.every((c) => c.platform === 'web' && c.user?.name));
  assert.ok(!JSON.stringify(crashes).includes('hemmelig123'));
  assert.ok(crashes.some((c) => /Unhandled rejection: E2E51 avvist løfte/.test(c.message)));
  await ctx.close();
});

test('krasjrapport fra innloggingssiden (uten innlogging) kommer også fram', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const anon = await E.browser.newContext();
  const page = await anon.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#g-brand');
  await page.evaluate(() => { setTimeout(() => { throw new Error('E2E51 feil på innloggingen'); }, 0); });
  const admin = await E.browser.newContext();
  await apiLogin(admin, 'sebastian', PASSWORD);
  let found = [];
  for (let i = 0; i < 50 && !found.length; i++) { await page.waitForTimeout(200); found = (await json(admin, 'GET', '/api/admin/crashes51?q=innloggingen')).body.crashes; }
  assert.equal(found.length, 1);
  assert.equal(found[0].user, null);
  assert.equal(found[0].url, '/login');
  await anon.close(); await admin.close();
});
