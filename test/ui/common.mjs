// Felles oppsett for tilgjengelighetssjekken (npm run a11y) og de visuelle regresjonstestene (npm run test:visual).
// Bruker mock-serveren og Playwright-oppslaget fra test/e2e/lib.mjs (Playwright er ikke en npm-avhengighet; den hentes fra en global
// installasjon eller PLAYWRIGHT_MODULE). Egen port 4621 (UI_PORT, eller det gamle navnet UI51_PORT), egen tom DATA_DIR, ingen utgående kall – heller ikke fra nettleseren.
process.env.E2E_PORT ||= process.env.UI_PORT || process.env.UI51_PORT || '4621';
const lib = await import('../e2e/lib.mjs');
export const { BASE, PASSWORD, ROOT, loadPlaywright, startServer, apiLogin } = lib;
const { readFileSync } = await import('node:fs');
const BG_FIXTURE = readFileSync(new URL('../visual/bakgrunn.jpg', import.meta.url));

/** Hovedsidene (grunnlinjen for Fase 3). auth:false = uten innlogging. wait = selektor som må finnes før sjekken.
 *  mask = selektorer som dekkes over i skjermbildet (QR). hide = selektorer som skjules (tilfeldige animasjoner i lerret).
 *  open = handling etter lasting (f.eks. åpne et ark). themes = bare disse temaene. nologo = logoene svarer 404 (plassholderne vises). */
const HL = (name, hash, extra = {}) => ({ name, path: `/#/${hash}`, wait: '#view', ...extra });
const SET = (name, tab) => ({ name: `innst-${name}`, path: `/#/innstillinger/${tab}`, wait: 'body' });
const FIN = (name, hash) => ({ name: `finans-${name}`, path: `/finans/#/${hash}`, wait: 'body' });
export const PAGES51 = [
  // Innloggingssiden følger ikke brukerens tema (ingen er innlogget), så ett tema holder. QR-koden er ny hver gang, og
  // #g-kick og #g-foot viser adressen (porten varierer).
  { name: 'login', path: '/login', auth: false, wait: '#gate', themes: ['papir-lys'], mask: ['#g-qr .gq-code', '#g-qr svg', '#g-qr canvas', '#g-qr img', '.gq-ttl', '#g-kick', '#g-foot'] },
  HL('oversikt', 'oversikt'), // Fase 6: adressene er de nye fra modullisten (#/dash, #/bursdager … videresendes)
  { ...HL('sok', 'oversikt'), palette: true },
  { ...HL('nyheter', 'oversikt'), open: 'news' }, // Nyheter er et ark over siden (news.js)
  HL('kalender', 'kalender'),
  HL('familiekalender', 'kalender/familie'),
  HL('media', 'media'),
  HL('media-kommer', 'media/kommer'),
  HL('media-bibliotek', 'media/bibliotek'),
  HL('media-nedlastinger', 'media/nedlastinger'),
  HL('media-avspilling', 'media/avspilling'),
  HL('media-nrk', 'media/nrk'),
  HL('media-musikk', 'media/musikk'),
  HL('familie', 'familie'),
  HL('familie-kart', 'familie/kart'),
  HL('reise', 'reise', { mask: ['#trips'] }), // avgangene i mock-dataene kommer i ulik rekkefølge
  HL('reise-kart', 'reise/kart'),
  HL('mat', 'matplan'),
  HL('gjoremal', 'gjoremal'),
  HL('skjold', 'skjold'),
  HL('studie', 'studie'),
  HL('vaer', 'vaer', { hide: ['.wxp-fx'] }), // skyene/nedbøren tegnes tilfeldig i et lerret
  HL('domener', 'domener'),
  HL('rom', 'rom'),
  HL('bursdager', 'kalender/bursdager'),
  HL('smarthjem', 'hjem'),
  HL('helse', 'helse'), // prompt 57: egen Helse-side (eksempeldata)
  HL('helse-maned', 'helse/maned'),
  // Mer på mobil (bunnmenyen): alle sidene og Snarveier (E-B6). Logoene hentes ikke, så forbokstavene (plassholderne) måles.
  { ...HL('mer', 'mer'), nologo: true },
  SET('utseende', 'look'),
  SET('integrasjoner', 'int'),
  SET('konto', 'konto'),
  SET('backup', 'backup'),
  SET('varsler', 'varsel'),
  SET('enheter', 'app'),
  SET('husstand', 'users'),
  SET('reise', 'ruter'),
  SET('nyheter', 'nyheter'),
  FIN('oversikt', 'ov'),
  FIN('transaksjoner', 'tx'),
  FIN('budsjett', 'bud'),
  FIN('abonnementer', 'sub'),
  FIN('faste', 'fast/faste'), // Fase 6: Faste utgifter er et filter i Faste betalinger (#/fast alene åpner sist brukte filter)
  FIN('kvitteringer', 'kv'),
  FIN('boliger', 'dir'),
  FIN('aksjer', 'aks'),
  FIN('import', 'imp'),
  { name: 'finans-planlegging', path: '/finans/plan51', wait: 'body' },
];
export const VIEWPORTS51 = [{ name: '1440', width: 1440, height: 900, mobile: false }, { name: '390', width: 390, height: 844, mobile: true }];
/** Temaene som finnes: stil (Papir = «2c», Glass = «cur») × modus. Glass har bare mørk modus (Q13). */
export const THEMES51 = [
  { name: 'papir-lys', hl: '2c', mode: 'light' },
  { name: 'papir-mork', hl: '2c', mode: 'dark' },
  { name: 'glass', hl: 'cur', mode: 'dark' },
];
const themeOf = (t) => (typeof t === 'string' ? THEMES51.find((x) => x.name === t) ?? THEMES51[0] : t);

// Gjør sidene stabile: ingen animasjoner, ingen blinkende markør, ingen eksterne fonter/bilder (mock-serveren har ingen internett).
const STILL = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;

/** Det faste tidspunktet de visuelle testene ser (onsdag formiddag, vanlig uke, ikke sommertidsskifte). */
export const CLOCK51 = '2026-11-11T10:00:00+01:00';

/** Server + nettleser. → {browser, server, close()} eller null (med forklaring) når Playwright/Chromium mangler.
 *  clock: true = serverens klokke starter på CLOCK51 (samme tid som nettleseren får med freeze). */
export async function start51({ clock = false } = {}) {
  const pw = await loadPlaywright();
  if (!pw) { console.log('Playwright finnes ikke (npm i -g playwright, eller sett PLAYWRIGHT_MODULE) – hopper over.'); return null; }
  const server = await startServer({ env: { UI51: '1', ...(clock ? { E2E_CLOCK: CLOCK51 } : {}) } });
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch (e) { await server.stop(); console.log(`Chromium kunne ikke startes: ${e.message.split('\n')[0]} – hopper over.`); return null; }
  return { pw, browser, server, async close() { await browser.close().catch(() => {}); await server.stop(); } };
}

/** Ny kontekst i riktig størrelse og tema, innlogget. Modus (lys/mørk) følger «Følg systemet» via prefers-color-scheme;
 *  stilen (Papir/Glass) og FinansHub-designet overstyres i svaret fra GET /api/me/layout, så hver kontekst ser sitt eget tema
 *  uansett hva siden selv lagrer (PUT til layout svares ok uten å nå serveren). */
export async function context51(env, { viewport, theme, auth = true, freeze = false }) {
  const t = themeOf(theme);
  const ctx = await env.browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.mobile, hasTouch: viewport.mobile,
    colorScheme: t.mode, reducedMotion: 'reduce', locale: 'nb-NO', timezoneId: 'Europe/Oslo', serviceWorkers: 'block',
  });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  // Bakgrunnsbildet velges av serveren (dag/vær/tilfeldig) og er tungt i PNG: alle får det samme lille, uskarpe bildet,
  // så fargene og lagene over bildet testes uten at referansene blir store eller skifter.
  await ctx.route((u) => u.href.startsWith(BASE) && (/^\/api\/background\/img\//.test(u.pathname) || /^\/bg\/[^/]+\.(jpe?g|png|webp)$/.test(u.pathname)), (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: BG_FIXTURE }));
  const LAYOUT = { hlTheme: t.hl, web_theme: 'system', design: t.mode === 'dark' ? 'mork' : 'lys', onboarded: true, mobileDesign: 'papir', paperMode: 'auto' };
  await ctx.route((u) => /^\/api\/me\/layout$/.test(u.pathname), async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const resp = await route.fetch(); let j = {}; try { j = await resp.json(); } catch { /* tomt */ }
    return route.fulfill({ response: resp, contentType: 'application/json', body: JSON.stringify({ ...j, ...LAYOUT }) });
  });
  await ctx.addInitScript(([css, hl, design]) => {
    try {
      localStorage.setItem('hl_theme', hl);
      localStorage.setItem('papir_web_mode', 'system');
      localStorage.setItem('fh_design', design);
      const s = document.createElement('style'); s.textContent = css;
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    } catch { /* */ }
  }, [STILL, t.hl, LAYOUT.design]);
  // Visuelle tester: fast klokke i nettleseren (hilsen, datoer og nedtellinger blir like hver gang).
  if (freeze && ctx.clock?.setFixedTime) await ctx.clock.setFixedTime(new Date(CLOCK51));
  if (auth) {
    await apiLogin(ctx, 'sebastian', PASSWORD);
    await ctx.request.put(`${BASE}/api/me/theme51`, { data: { mode: 'system', updatedAt: Date.now() } });
    await ctx.request.put(`${BASE}/api/me/layout`, { data: LAYOUT });
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
  if (page51.nologo) await ctx.route((u) => u.pathname.startsWith('/finans/api/logo/'), (r) => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}${page51.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(page51.wait, { state: 'attached', timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {}); // sanntid/polling gjør at «idle» ofte aldri kommer
  if (page51.hide?.length) await page.addStyleTag({ content: `${page51.hide.join(',')}{visibility:hidden!important}` });
  if (page51.open === 'news') {
    // Nyheter åpnes fra «Siste nytt» (stripen eller flisen); finnes ingen av dem, åpnes modulen direkte.
    await page.evaluate(async () => {
      const b = document.querySelector('[data-t52-news], .ticker-label');
      if (b) b.click();
      else { const src = [...document.scripts].map((x) => x.src).find((x) => /\/js\/app\.js/.test(x)); if (src) (await import(new URL('news.js', src).href)).openNews?.(); }
    });
    await page.waitForTimeout(1200);
  }
  if (page51.palette) {
    await page.keyboard.press('Control+K');
    await page.waitForSelector('.x51:not([hidden]) .x51-o', { timeout: 8_000 }).catch(() => {});
  }
  await page.waitForTimeout(400);
  return { page, errors };
}

export const slug51 = (p, v, t) => `${p.name}-${v.name}-${themeOf(t).name}`;
export const args51 = () => new Set(process.argv.slice(2));
