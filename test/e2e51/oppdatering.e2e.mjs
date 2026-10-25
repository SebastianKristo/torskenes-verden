// Prompt 51 (QA51) E2E: oppdatering – Innstillinger › System i nettleseren, «Oppdater» legger bare en id i request.json
// (aldri repo/branch/sha/kommandoer), updateren (simulert med filer i data/update) melder fremdrift, og etter
// «omstart» med ny versjon vises «Nytt i denne versjonen» én gang. Også: admin-panelet for feature flags.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, BASE, PASSWORD, ROOT, json, watchErrors, apiLogin } from './lib.mjs';

const CL_DIR = mkdtempSync(join(tmpdir(), 'hl-e2e51-cl-'));
const CL = join(CL_DIR, 'CHANGELOG.md');
writeFileSync(CL, readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'));
const OLD = readFileSync(CL, 'utf8').match(/^##\s*\[?v?(\d+\.\d+\.\d+)/m)[1];
const NEXT = OLD.replace(/\.(\d+)$/, (_, n) => `.${Number(n) + 1}`);

let E = null;
before(async (t) => { E = await setup(t, { env: { CHANGELOG_PATH: CL } }); });
after(async () => { await E?.close(); rmSync(CL_DIR, { recursive: true, force: true }); });

const upd = () => join(E.server.dataDir, 'update');
const beat = () => { mkdirSync(upd(), { recursive: true }); writeFileSync(join(upd(), 'heartbeat'), String(Date.now())); };

test('oppdatering: System viser versjonen, start sender bare en id, fremdrift fra updateren, og «Nytt i» etter ny versjon', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext({ viewport: { width: 1280, height: 900 } });
  await apiLogin(ctx, 'sebastian', PASSWORD);
  assert.equal((await json(ctx, 'POST', '/api/whatsnew/seen', { version: OLD })).status, 200);
  beat();
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/#/innstillinger/system`);
  await page.waitForSelector('#settings .set-body[data-key^="system|"]', { timeout: 15_000 });
  await page.waitForFunction((v) => document.querySelector('#settings .set-body')?.innerText.includes(v), OLD, { timeout: 15_000 });
  // QA51-seksjonen «Kvalitet» er lagt til for admin.
  await page.waitForSelector('#settings [data-qa51-sec] [data-qa51-open="flags"]', { timeout: 10_000 });

  // Start oppdateringen (samme kall som knappen «Oppdater nå»).
  beat();
  const st = await json(ctx, 'POST', '/api/system/update/start', { password: PASSWORD, repo: 'ondsinnet/repo', branch: 'x', sha: 'deadbeef', cmd: 'rm -rf /' });
  assert.equal(st.status, 200, st.text);
  const req = JSON.parse(readFileSync(join(upd(), 'request.json'), 'utf8'));
  assert.deepEqual(Object.keys(req).sort(), ['at', 'id', 'requestedBy'], 'bare id, hvem og når – aldri repo/branch/sha/kommandoer');
  let s = await json(ctx, 'GET', '/api/update/status');
  assert.equal(s.body.state, 'queued');

  // Updateren plukker forespørselen og melder fremdrift.
  rmSync(join(upd(), 'request.json'));
  writeFileSync(join(upd(), 'status.json'), JSON.stringify({ id: req.id, state: 'building', step: 'Bygger', startedAt: Date.now(), updatedAt: Date.now(), progressAt: Date.now() }));
  beat();
  s = await json(ctx, 'GET', '/api/update/status');
  assert.equal(s.body.state, 'building');
  assert.equal(s.body.running, true);

  // Ny versjon kjører (CHANGELOG fra den nye releasen) og updateren er ferdig.
  writeFileSync(CL, readFileSync(CL, 'utf8').replace(/^## /m, `## [${NEXT}] – 25.10.2026 · e2e51 – testversjon\n- **E2E51:** ny funksjon fra testen.\n- Rettet en feil.\n\n## `));
  writeFileSync(join(upd(), 'status.json'), JSON.stringify({ id: req.id, state: 'done', step: 'Ferdig', version: NEXT, startedAt: Date.now() - 5000, finishedAt: Date.now(), updatedAt: Date.now() }));
  s = await json(ctx, 'GET', '/api/update/status');
  assert.equal(s.body.current, NEXT);
  assert.equal(s.body.running, false);
  await page.goto(`${BASE}/`);
  const card = page.locator('[data-qa51="whatsnew"]');
  await card.waitFor({ timeout: 15_000 });
  const txt = await card.innerText();
  assert.match(txt, new RegExp(`Nytt i versjon ${NEXT.replace(/\./g, '\\.')}`));
  assert.match(txt, /E2E51: ny funksjon fra testen\./);
  await card.getByRole('button', { name: 'Ok' }).click();
  await page.waitForFunction(async () => (await (await fetch('/api/whatsnew')).json()).seen === true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('feature flags: admin slår på et flagg for én bruker i panelet, og klienten får det via /api/flags', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext({ viewport: { width: 1280, height: 900 } });
  await apiLogin(ctx, 'sebastian', PASSWORD);
  await json(ctx, 'POST', '/api/whatsnew/seen', { version: NEXT });
  // Prompt 52: «Nytt i versjon» er nå et modalt kort med slør; marker gjeldende versjon som sett (også når forrige test ikke byttet versjon).
  const wn = (await json(ctx, 'GET', '/api/whatsnew')).body;
  if (wn?.version) await json(ctx, 'POST', '/api/whatsnew/seen', { version: wn.version });
  const me = (await json(ctx, 'GET', '/api/me')).body;
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/#/innstillinger/system`);
  await page.click('#settings [data-qa51-sec] [data-qa51-open="flags"]', { timeout: 15_000 });
  await page.waitForSelector('#qa51-ov [data-qa51-new]');
  await page.fill('#qa51-ov [data-qa51-new] input[name=key]', 'e2e_flagg51');
  await page.fill('#qa51-ov [data-qa51-new] input[name=description]', 'Laget av E2E');
  await page.click('#qa51-ov [data-qa51-new] button');
  await page.waitForSelector('#qa51-ov [data-qa51-who="e2e_flagg51"]');
  assert.equal((await json(ctx, 'GET', '/api/flags')).body.flags.e2e_flagg51, false, 'nytt flagg er av');
  await page.selectOption('#qa51-ov [data-qa51-who="e2e_flagg51"]', `user|${me.id}`);
  await page.click('#qa51-ov [data-qa51-set="e2e_flagg51|1"]');
  await page.waitForFunction(() => /: på/.test(document.querySelector('#qa51-ov')?.innerText ?? ''));
  assert.equal((await json(ctx, 'GET', '/api/flags')).body.flags.e2e_flagg51, true);
  // Klienten (web) leser flaggene ved oppstart.
  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => window.hlFlags51?.e2e_flagg51 === true, null, { timeout: 15_000 });
  // Krasjrapport-fanen åpner uten feil (GlitchTip ikke satt opp → lokalt).
  await page.goto(`${BASE}/#/innstillinger/system`);
  await page.click('#settings [data-qa51-sec] [data-qa51-open="crashes"]', { timeout: 15_000 });
  await page.waitForFunction(() => /lagres bare lokalt/i.test(document.querySelector('#qa51-ov')?.innerText ?? ''));
  assert.ok(!existsSync(join(upd(), 'request.json')));
  assert.deepEqual(errors, []);
  await ctx.close();
});
