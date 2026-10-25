// Prompt 51 (WEBX51): felles oppsett for tilgjengelighetssjekken (npm run a11y) og de visuelle regresjonstestene (npm run test:visual).
// Bruker mock-serveren og Playwright-oppslaget fra test/e2e51/lib.mjs (Playwright er ikke en npm-avhengighet; den hentes fra en global
// installasjon eller PLAYWRIGHT_MODULE). Egen port 4621 (UI51_PORT), egen tom DATA_DIR, ingen utgående kall – heller ikke fra nettleseren.
process.env.E2E_PORT ||= process.env.UI51_PORT || '4621';
const lib = await import('../e2e51/lib.mjs');
export const { BASE, PASSWORD, ROOT, loadPlaywright, startServer, apiLogin } = lib;

/** Hovedsidene. auth:false = uten innlogging. wait = tekst/selektor som må finnes før sjekken. */
export const PAGES51 = [
  { name: 'login', path: '/login', auth: false, wait: '#gate', mask: ['#g-qr .gq-code', '#g-qr svg', '#g-qr canvas', '#g-qr img', '.gq-ttl'] }, // QR-koden er ny hver gang
  { name: 'hjem', path: '/#/dash', wait: '#view' },
  { name: 'gjoremal', path: '/#/gjoremal', wait: '#view' },
  { name: 'kalender', path: '/#/kalender', wait: '#view' },
  { name: 'familie', path: '/#/familie', wait: '#view' },
  { name: 'familiekalender', path: '/#/familiekalender', wait: '#view' },
  { name: 'media', path: '/#/media', wait: '#view' },
  { name: 'innstillinger', path: '/#/innstillinger/konto', wait: 'body' },
  { name: 'finans', path: '/finans/', wait: 'body' },
  { name: 'planlegging', path: '/finans/plan51', wait: 'body' },
  { name: 'sok', path: '/#/dash', wait: '#view', palette: true },
];
export const VIEWPORTS51 = [{ name: '1440', width: 1440, height: 900, mobile: false }, { name: '390', width: 390, height: 844, mobile: true }];
export const THEMES51 = ['lys', 'mork'];

// Gjør sidene stabile: ingen animasjoner, ingen blinkende markør, ingen eksterne fonter/bilder (mock-serveren har ingen internett).
const STILL = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;

/** Server + nettleser. → {browser, server, close()} eller null (med forklaring) når Playwright/Chromium mangler. */
export async function start51() {
  const pw = await loadPlaywright();
  if (!pw) { console.log('Playwright finnes ikke (npm i -g playwright, eller sett PLAYWRIGHT_MODULE) – hopper over.'); return null; }
  const server = await startServer({ env: { UI51: '1' } });
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch (e) { await server.stop(); console.log(`Chromium kunne ikke startes: ${e.message.split('\n')[0]} – hopper over.`); return null; }
  return { pw, browser, server, async close() { await browser.close().catch(() => {}); await server.stop(); } };
}

/** Ny kontekst i riktig størrelse og tema (lys/mørk følger «Følg systemet» via prefers-color-scheme), innlogget. */
export async function context51(env, { viewport, theme, auth = true, freeze = false }) {
  const ctx = await env.browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.mobile, hasTouch: viewport.mobile,
    colorScheme: theme === 'mork' ? 'dark' : 'light', reducedMotion: 'reduce', locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  await ctx.addInitScript((css) => {
    try {
      localStorage.setItem('papir_web_mode', 'system');
      const s = document.createElement('style'); s.textContent = css;
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    } catch { /* */ }
  }, STILL);
  // Visuelle tester: fast klokke i nettleseren (hilsen, datoer og nedtellinger blir like hver gang).
  if (freeze && ctx.clock?.setFixedTime) await ctx.clock.setFixedTime(new Date('2026-10-25T10:00:00+01:00'));
  if (auth) {
    await apiLogin(ctx, 'sebastian', PASSWORD);
    await ctx.request.put(`${BASE}/api/me/theme51`, { data: { mode: 'system', updatedAt: Date.now() } });
    // Mobil-PWA-en: hopp over førstegangsvalget, papirdesign som følger systemet (lys/mørk).
    await ctx.request.put(`${BASE}/api/me/layout`, { data: { onboarded: true, mobileDesign: 'papir', paperMode: 'auto' } });
    // «Nytt i denne versjonen» (QA51) skal ikke ligge over sidene.
    try {
      const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json();
      if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } });
    } catch { /* ingen endringslogg */ }
  }
  return ctx;
}

/** Åpner siden og venter til den er ferdig tegnet. */
export async function open51(ctx, page51) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}${page51.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(page51.wait, { state: 'attached', timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {}); // sanntid/polling gjør at «idle» ofte aldri kommer
  if (page51.palette) {
    await page.keyboard.press('Control+K');
    await page.waitForSelector('.x51:not([hidden]) .x51-o', { timeout: 8_000 }).catch(() => {});
  }
  await page.waitForTimeout(400);
  return { page, errors };
}

export const slug51 = (p, v, t) => `${p.name}-${v.name}-${t}`;
export const args51 = () => new Set(process.argv.slice(2));
