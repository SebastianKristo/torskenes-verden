// Kalenderryddingen er et forslag (Q34, E-B12): «Slå sammen kalenderne: 6 → 4?» vises, og oppryddingen kjøres først når brukeren
// trykker «Slå sammen». Etterpå kan den angres. Serverens svar styres her (route), så testen ser bare hva web gjør med forslaget.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, watchErrors, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

test('kalenderryddingen: forslag først, kjøres bare ved ja, og kan angres etterpå', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext({ viewport: { width: 1280, height: 860 } });
  t.after(() => ctx.close());
  await apiLogin(ctx, 'sebastian', PASSWORD);
  await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme: '2c', onboarded: true } });
  const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
  if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
  const calls = [];
  let migration = { done: false, proposed: true, from: 6, to: 4, moved: 3, merged: [] };
  await ctx.route((u) => u.pathname.startsWith('/api/kalender/calendars'), async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'POST' && path === '/api/kalender/calendars/migration') {
      calls.push('ja');
      migration = { done: true, from: 6, to: 4, moved: 3, merged: [], undoUntil: new Date(Date.now() + 86400_000).toISOString(), undone: false };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, migration, calendars: [] }) });
    }
    if (req.method() === 'POST' && path === '/api/kalender/calendars/migration/undo') {
      calls.push('angre');
      migration = { ...migration, done: false, undone: true };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, migration, calendars: [] }) });
    }
    if (req.method() !== 'GET' || path !== '/api/kalender/calendars') return route.continue();
    const resp = await route.fetch(); const j = await resp.json().catch(() => ({}));
    return route.fulfill({ response: resp, contentType: 'application/json', body: JSON.stringify({ ...j, migration }) });
  });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/#/kalender`);
  const toast = page.locator('.k39-toast');
  await toast.waitFor({ timeout: 15_000 });
  assert.match(await toast.innerText(), /Slå sammen kalenderne: 6 → 4\?/);
  assert.deepEqual(calls, [], 'ingenting kjøres før brukeren svarer');
  assert.equal(await page.locator('[data-k39-undo]').count(), 0, 'ingen «Angre» før noe er gjort');
  await page.click('[data-k39-merge]');
  await page.waitForFunction(() => /Vi ryddet kalenderne: 6 → 4/.test(document.querySelector('.k39-toast')?.textContent ?? ''), null, { timeout: 5_000 });
  assert.deepEqual(calls, ['ja']);
  await page.click('[data-k39-undo]');
  await page.waitForFunction(() => !document.querySelector('.k39-toast'), null, { timeout: 5_000 });
  assert.deepEqual(calls, ['ja', 'angre']);
  assert.deepEqual(errors, []);
});

test('kalenderryddingen: ✕ på forslaget kjører ingenting og skjuler det på enheten', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  t.after(() => ctx.close());
  await apiLogin(ctx, 'sebastian', PASSWORD);
  await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme: '2c', onboarded: true } });
  const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
  if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
  const posts = [];
  await ctx.route((u) => u.pathname.startsWith('/api/kalender/calendars'), async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { posts.push(new URL(req.url()).pathname); return route.fulfill({ status: 500, body: '{}' }); }
    const resp = await route.fetch(); const j = await resp.json().catch(() => ({}));
    return route.fulfill({ response: resp, contentType: 'application/json', body: JSON.stringify({ ...j, migration: { done: false, proposed: true, from: 9, to: 5, moved: 4, merged: [] } }) });
  });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/#/kalender`);
  await page.locator('.k39-toast').waitFor({ timeout: 15_000 });
  await page.click('.k39-toast [data-k39-migok]');
  await page.waitForFunction(() => !document.querySelector('.k39-toast'), null, { timeout: 5_000 });
  await page.reload();
  await page.waitForSelector('.k39-line', { state: 'attached', timeout: 15_000 });
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.k39-toast').count(), 0, 'forslaget er skjult på denne enheten');
  assert.deepEqual(posts, [], 'ingen opprydding kjørt');
  assert.deepEqual(errors, []);
});
