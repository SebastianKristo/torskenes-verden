// Innstillinger på web: fanetittelen følger siden som er åpen (E-B10), Haptikk er en egen bryter under varselgruppene (O9),
// og søket viser stier som begynner med navnene fra modullisten (`innstillinger` i shared/schemas/moduler.json, O10).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, BASE, PASSWORD, ROOT, watchErrors, apiLogin } from './lib.mjs';

const M = JSON.parse(readFileSync(join(ROOT, 'shared/schemas/moduler.json'), 'utf8'));
const TOPP = new Set(M.innstillinger.map((x) => x.navn));

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

async function open(t) {
  const ctx = await E.browser.newContext({ viewport: { width: 1280, height: 860 } });
  await apiLogin(ctx, 'sebastian', PASSWORD);
  await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme: '2c', onboarded: true } });
  const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
  if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
  const page = await ctx.newPage();
  t.after(() => ctx.close());
  return { page, errors: watchErrors(page) };
}
const heading = (page) => page.waitForFunction(() => document.querySelector('#set-title')?.textContent.trim() || null, null, { timeout: 15_000 }).then((h) => h.jsonValue());

test('fanetittelen følger Innstillinger og settes tilbake når de lukkes (E-B10)', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const { page, errors } = await open(t);
  await page.goto(`${BASE}/#/kalender`);
  await page.waitForFunction(() => document.title === 'Kalender · Homelab', null, { timeout: 15_000 });
  // Slik åpner menyene innstillingene (openSettings), med siden under i historikken.
  await page.evaluate(async () => { const src = [...document.scripts].map((x) => x.src).find((x) => /\/js\/app\.js/.test(x)); (await import(new URL('settings.js', src).href)).openSettings('look'); });
  assert.equal(await heading(page), 'Utseende');
  await page.waitForFunction(() => document.title === 'Utseende · Innstillinger · Homelab', null, { timeout: 5_000 });
  await page.click('.set-nav [data-tab="varsel"]');
  await page.waitForFunction(() => document.title === 'Varsler · Innstillinger · Homelab', null, { timeout: 5_000 });
  await page.click('[data-set-done]');
  await page.waitForFunction(() => document.title === 'Kalender · Homelab', null, { timeout: 5_000 });
  // Direkte lenke til en side i innstillingene.
  await page.goto(`${BASE}/#/innstillinger/konto`);
  await heading(page);
  await page.waitForFunction(() => document.title === 'Konto og sikkerhet · Innstillinger · Homelab', null, { timeout: 5_000 });
  assert.deepEqual(errors, []);
});
