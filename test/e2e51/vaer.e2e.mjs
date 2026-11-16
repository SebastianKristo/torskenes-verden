// Vær: «Henter været …» skal ikke bli stående (E-B11). Før ventet siden på stedslista (/api/weather/places) før den i det hele
// tatt spurte etter været (/api/weather/full), mens skallet sendte rundt 40 andre kall samtidig; på en treg telefon sto
// «Henter været …» i flere sekunder selv om Oversikt allerede viste temperaturen. Nå hentes været for det sist valgte stedet
// (eller Oslo) samtidig med stedslista.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

const PROFILER = [
  { navn: 'desktop', cpu: 1, ctx: { viewport: { width: 1440, height: 900 } } },
  { navn: 'mobil', cpu: 4, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];

for (const p of PROFILER) {
  test(`Vær: været hentes uten å vente på stedslista, og «Henter været …» forsvinner (${p.navn})`, async (t) => {
    if (!E) return t.skip('ingen nettleser');
    const ctx = await E.browser.newContext({ ...p.ctx, serviceWorkers: 'block', locale: 'nb-NO', timezoneId: 'Europe/Oslo' });
    t.after(() => ctx.close());
    await apiLogin(ctx, 'sebastian', PASSWORD);
    await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme: '2c', onboarded: true } });
    const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json().catch(() => ({}));
    if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
    // Stedslista svarer tregt (som på en travel server): været skal likevel komme.
    await ctx.route((u) => u.pathname === '/api/weather/places' && !u.search, async (r) => { await new Promise((res) => setTimeout(res, 1500)); await r.continue(); });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    const seen = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (/^\/api\/weather\/(full|places)$/.test(u.pathname) && !u.searchParams.has('q')) seen.push(`${u.pathname}@${Date.now()}`); });
    page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname === '/api/weather/places' && !u.search) seen.push(`places-svar@${Date.now()}`); });
    await page.goto(`${BASE}/#/vaer`, { waitUntil: 'domcontentloaded' });
    const temp = page.locator(p.navn === 'mobil' ? '.wxp-temp' : '.wx36-temp').first();
    await temp.waitFor({ state: 'visible', timeout: 10_000 });
    assert.match(await temp.textContent(), /\d°/);
    assert.equal(await page.locator('#wxp', { hasText: 'Henter været' }).count(), 0, '«Henter været …» står ikke igjen');
    const at = (k) => Number(seen.find((x) => x.startsWith(k))?.split('@')[1]);
    assert.ok(at('/api/weather/full') < at('places-svar') || !seen.some((x) => x.startsWith('places-svar')), `været ble hentet først etter stedslista: ${seen.join(' ')}`);
  });
}
