// Ytelsesmåling for web (npm run test:perf). Samme metode som auditen (docs/opprydding/detaljer/B-web.md §3): kald last i ny
// kontekst mot mock-serveren, uten nettverksstruping. Desktop er 1440 × 900; mobil er 390 × 844, DPR 3, iPhone-UA og 4× CPU-struping.
// Per rute og profil: CSS- og JS-filer (antall, overført og ukomprimert), forespørsler og API-kall ved lasting, FCP, LCP, CLS,
// lange oppgaver, Layout + Recalc (CDP Performance.getMetrics) og tvungne layouter (Layout/UpdateLayoutTree med JS-stakk i Chrome-tracen).
//
//   npm run test:perf                              – alle ruter, skriver docs/opprydding/ytelse-for.json
//   npm run test:perf -- --out docs/opprydding/ytelse-etter.json
//   npm run test:perf -- --idle                    – også 20 s i ro etter lasting (layouter og DOM-endringer)
//   PERF_ROUTES=dash,finans                        – bare noen ruter
//
// Tallene varierer noe mellom kjøringer (særlig LCP og lange oppgaver med CPU-struping); sammenlign med samme maskin.
import { writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { start51, BASE, PASSWORD, ROOT, apiLogin } from './common.mjs';

const ROUTES = [['dash', '/#/dash'], ['media', '/#/media'], ['finans', '/finans/'], ['skjold', '/#/skjold'], ['kalender', '/#/kalender']];
const PROFILES = [
  { name: 'desktop', cpu: 1, wait: 6000, ctx: { viewport: { width: 1440, height: 900 } } },
  { name: 'mobil', cpu: 4, wait: 10000, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } },
];
const argv = process.argv.slice(2);
const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'docs/opprydding/ytelse-for.json';
const OUT = isAbsolute(outArg) ? outArg : join(ROOT, outArg);
const IDLE = argv.includes('--idle');
const only = (process.env.PERF_ROUTES || '').split(',').filter(Boolean);

/** Kjøres før sidens egne skript: samler lange oppgaver, layoutskift, LCP og DOM-endringer. */
function observe() {
  window.__lt = []; window.__ls = 0; window.__mut = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch { /* */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* */ }
  try { new PerformanceObserver((l) => { const e = l.getEntries().at(-1); window.__lcp = Math.round(e.startTime); window.__lcpEl = `${e.element?.tagName ?? ''}.${String(e.element?.className ?? '').slice(0, 40)}`; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* */ }
  document.addEventListener('DOMContentLoaded', () => new MutationObserver((ms) => { window.__mut += ms.length; }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true }));
}

/** Tvungne layouter: Layout/UpdateLayoutTree-hendelser som har en JS-stakk (skriptet leste layout etter en endring). */
function forcedLayouts(trace) {
  const by = {}; let n = 0, ms = 0;
  for (const e of JSON.parse(trace.toString()).traceEvents) {
    if ((e.name !== 'Layout' && e.name !== 'UpdateLayoutTree') || !e.args?.beginData?.stackTrace?.length) continue;
    const d = (e.dur || 0) / 1000; n++; ms += d;
    const st = e.args.beginData.stackTrace[0];
    const k = `${e.name === 'Layout' ? 'L' : 'R'} ${String(st.url || '').replace(/^.*?\/(assets|js|finans)\//, '$1/').replace(/\?.*/, '')}:${st.lineNumber} ${st.functionName}`;
    (by[k] ??= [0, 0])[0]++; by[k][1] += d;
  }
  return { n, ms: +ms.toFixed(1), top: Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).map(([k, [c, t]]) => `${c}× ${t.toFixed(1)} ms ${k}`) };
}

const env = await start51();
if (!env) process.exit(0);
const res = [];
try {
  for (const prof of PROFILES) {
    for (const [route, path] of ROUTES) {
      if (only.length && !only.includes(route)) continue;
      const ctx = await env.browser.newContext({ ...prof.ctx, locale: 'nb-NO', timezoneId: 'Europe/Oslo', serviceWorkers: 'block' });
      await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
      // Innlogget, Papir-tema på serveren (som standardbrukeren), uten «Nytt i versjonen»-arket. Ingenting i localStorage (kald last).
      await apiLogin(ctx, 'sebastian', PASSWORD);
      await ctx.request.put(`${BASE}/api/me/layout`, { data: { hlTheme: '2c', onboarded: true, mobileDesign: 'papir', paperMode: 'auto' } });
      try { const w = await (await ctx.request.get(`${BASE}/api/whatsnew`)).json(); if (w?.version) await ctx.request.post(`${BASE}/api/whatsnew/seen`, { data: { version: w.version } }); } catch { /* */ }
      await ctx.addInitScript(observe);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Performance.enable'); await cdp.send('Network.enable');
      if (prof.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
      const net = {};
      cdp.on('Network.responseReceived', (e) => { net[e.requestId] = { url: e.response.url, type: e.type }; });
      cdp.on('Network.loadingFinished', (e) => { if (net[e.requestId]) net[e.requestId].enc = e.encodedDataLength; });
      cdp.on('Network.dataReceived', (e) => { if (net[e.requestId]) net[e.requestId].dec = (net[e.requestId].dec || 0) + e.dataLength; });
      const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
      await env.browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'blink.user_timing'] });
      await page.goto(BASE + path, { waitUntil: 'load', timeout: 60_000 }).catch((e) => errs.push(`goto ${e.message.slice(0, 80)}`));
      await page.waitForTimeout(prof.wait);
      const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      const nav = await page.evaluate(() => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return { fcp: Math.round(fcp?.startTime ?? 0), lcp: window.__lcp ?? null, lcpEl: window.__lcpEl ?? null, cls: +window.__ls.toFixed(3), lt: window.__lt, dom: document.getElementsByTagName('*').length };
      });
      const forced = forcedLayouts(await env.browser.stopTracing());
      const rs = Object.values(net);
      const pick = (f) => { const l = rs.filter(f); return { n: l.length, enc: l.reduce((a, x) => a + (x.enc || 0), 0), dec: l.reduce((a, x) => a + (x.dec || 0), 0) }; };
      const r = {
        profile: prof.name, route, fcp: nav.fcp, lcp: nav.lcp, lcpEl: nav.lcpEl, cls: nav.cls,
        longTasks: { n: nav.lt.length, sum: nav.lt.reduce((a, x) => a + x[1], 0), max: Math.max(0, ...nav.lt.map((x) => x[1])) },
        css: pick((x) => x.type === 'Stylesheet'), js: pick((x) => x.type === 'Script'), requests: rs.length, api: rs.filter((x) => x.type === 'Fetch' || x.type === 'XHR').length,
        layoutMs: Math.round(m.LayoutDuration * 1000), layoutCount: m.LayoutCount, recalcMs: Math.round(m.RecalcStyleDuration * 1000), recalcCount: m.RecalcStyleCount,
        scriptMs: Math.round(m.ScriptDuration * 1000), heapMB: Math.round(m.JSHeapUsedSize / 1e6), dom: nav.dom, forced, errors: errs,
      };
      if (IDLE) {
        await page.evaluate(() => { window.__mut = 0; window.__lt = []; });
        await page.waitForTimeout(20_000);
        const m2 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
        const idle = await page.evaluate(() => ({ mutations: window.__mut, longTasks: window.__lt.length }));
        r.idle20s = { ...idle, layoutCount: m2.LayoutCount - m.LayoutCount, layoutMs: Math.round((m2.LayoutDuration - m.LayoutDuration) * 1000), recalcCount: m2.RecalcStyleCount - m.RecalcStyleCount };
      }
      res.push(r);
      const kb = (b) => `${Math.round(b / 1024)} KB`;
      console.log(`${prof.name.padEnd(7)} ${route.padEnd(8)} CSS ${r.css.n}/${kb(r.css.enc)}  JS ${r.js.n}/${kb(r.js.enc)}  req ${r.requests}/api ${r.api}  FCP ${r.fcp} LCP ${r.lcp}  CLS ${r.cls}  LT ${r.longTasks.n}/${r.longTasks.sum}/${r.longTasks.max}  L+R ${r.layoutMs}+${r.recalcMs}  tvungne ${forced.n}/${forced.ms} ms${errs.length ? `  feil ${errs.length}` : ''}`);
      await ctx.close();
    }
  }
} finally { await env.close(); }
writeFileSync(OUT, `${JSON.stringify({ at: new Date().toISOString(), method: 'test/ui51/perf.mjs (mock-server, kald last, desktop 1440×900 1× CPU, mobil 390×844 DPR 3 4× CPU)', results: res }, null, 1)}\n`);
console.log(`\nLagret ${OUT}`);
