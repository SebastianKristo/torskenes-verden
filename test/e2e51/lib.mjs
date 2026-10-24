// Prompt 51 (QA51): felles hjelpere for ende-til-ende-testene (Playwright + Chromium mot mock-serveren i server.mjs).
// Playwright er ikke en avhengighet i package.json: den hentes fra en global installasjon (npm i -g playwright) eller
// fra PLAYWRIGHT_MODULE. Finnes den ikke, hoppes testene over med en forklaring (de kjøres ikke i `npm test`).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const PORT = Number(process.env.E2E_PORT || 4605);
export const BASE = `http://127.0.0.1:${PORT}`;
export const PASSWORD = process.env.E2E_PASSWORD || 'testpassord1';

export async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* ikke lokalt */ }
  const cands = [process.env.PLAYWRIGHT_MODULE, join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright'), '/usr/local/lib/node_modules/playwright', '/usr/lib/node_modules/playwright'].filter(Boolean);
  for (const c of cands) {
    if (!existsSync(join(c, 'package.json'))) continue;
    try { return createRequire(join(c, 'package.json'))(c); } catch { /* neste */ }
  }
  return null;
}

/** Starter mock-serveren som egen prosess og venter til den svarer. → {proc, dataDir, stop()} */
export async function startServer({ env = {} } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'hl-e2e51-'));
  const ready = join(dataDir, 'ready');
  const proc = spawn(process.execPath, [join(HERE, 'server.mjs')], { cwd: ROOT, env: { ...process.env, DATA_DIR: dataDir, E2E_PORT: String(PORT), E2E_READY_FILE: ready, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const t0 = Date.now();
  while (!existsSync(ready)) {
    if (proc.exitCode != null) throw new Error(`Mock-serveren stoppet:\n${log.slice(-3000)}`);
    if (Date.now() - t0 > 30_000) { proc.kill(); throw new Error(`Mock-serveren startet ikke innen 30 s:\n${log.slice(-3000)}`); }
    await new Promise((r) => setTimeout(r, 100));
  }
  readFileSync(ready);
  return { proc, dataDir, log: () => log, stop: () => new Promise((r) => { if (proc.exitCode != null) return r(); proc.once('exit', r); proc.kill('SIGTERM'); setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* */ } r(); }, 3000).unref(); }) };
}

/** Logger inn via API-et i en egen nettleserkontekst (cookien havner i konteksten). */
export async function apiLogin(ctx, username, password) {
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { username, password } });
  if (r.status() !== 200) throw new Error(`Innlogging for ${username} feilet: ${r.status()} ${await r.text()}`);
  return r.json();
}
export async function json(ctx, method, path, data) {
  const r = await ctx.request.fetch(`${BASE}${path}`, { method, ...(data !== undefined ? { data } : {}) });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch { /* */ }
  return { status: r.status(), body, text };
}

/** Innloggingssiden viser QR-koden først når serveren kan QR-innlogging; bytt til passordskjemaet. */
export async function showPasswordForm(page) {
  await page.waitForFunction(() => !!document.querySelector('[data-qr-pw]') || (document.querySelector('#f-u')?.offsetParent != null), null, { timeout: 15_000 });
  const pw = page.locator('[data-qr-pw]').first();
  if (await pw.count() && await pw.isVisible()) await pw.click();
  await page.waitForSelector('#f-u', { state: 'visible', timeout: 10_000 });
}

/** Feil i nettleserkonsollen og sider som krasjer samles, så hver test kan si «ingen JS-feil». */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_|status of 40[134]|status of 50[23]/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}

/** Felles oppsett for en testfil: server + nettleser, eller skip når Playwright mangler. */
export async function setup(t, { env } = {}) {
  const pw = await loadPlaywright();
  if (!pw) { t.skip('Playwright finnes ikke (npm i -g playwright, eller sett PLAYWRIGHT_MODULE)'); return null; }
  const server = await startServer({ env });
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch (e) { await server.stop(); t.skip(`Chromium kunne ikke startes: ${e.message.split('\n')[0]}`); return null; }
  return { pw, server, browser, async close() { await browser.close().catch(() => {}); await server.stop(); } };
}
