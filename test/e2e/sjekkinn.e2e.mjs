// Prompt 51 (QA51) E2E: Sjekk inn – Sebastian ber Ingrid sjekke inn, Ingrid svarer «👍 Alt bra» i nettleseren,
// og svaret kommer tilbake til Sebastian (forespørselen er besvart, og innsjekken ligger i loggen).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, json, watchErrors, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

test('sjekk inn: forespørsel → svar fra nettleseren → avsender ser svaret', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const seb = await E.browser.newContext();
  await apiLogin(seb, 'sebastian', PASSWORD);
  const mk = await json(seb, 'POST', '/api/users', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' });
  assert.equal(mk.status, 200, mk.text);
  const ing = await E.browser.newContext({ viewport: { width: 1280, height: 860 } });
  await apiLogin(ing, 'ingrid', 'ingridPassord123');
  const ingridId = (await json(ing, 'GET', '/api/me')).body.id;
  // Ny bruker: onboardingen («Koble til profil») er gjort, så dialogen ikke ligger over siden.
  const onb = await json(ing, 'POST', '/api/onboarding/link', { newProfileName: 'Ingrid', consents: { location: true } });
  assert.equal(onb.status, 200, onb.text);
  const rq = await json(seb, 'POST', '/api/family/checkin/request', { to: [ingridId], text: 'Kom du fram?' });
  assert.equal(rq.status, 201, rq.text);
  const reqId = rq.body.request.id;

  const page = await ing.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/#/familie/sjekk`);
  // «Nytt i denne versjonen» kan ligge over siden første gang – lukk det.
  const wn = page.locator('[data-qa51="whatsnew"] [data-qa51-ok]');
  await wn.click({ timeout: 8000 }).catch(() => {});
  const ok = page.locator(`[data-f50="rqok"][data-id="${reqId}"]`);
  await ok.waitFor({ timeout: 15_000 });
  await ok.click();
  let ans = null;
  for (let i = 0; i < 50 && !ans; i++) {
    await page.waitForTimeout(200);
    const r = await json(seb, 'GET', `/api/family/checkin/${reqId}`);
    if (r.body?.checkin?.status === 'answered') ans = r.body.checkin;
  }
  assert.ok(ans, 'Sebastian ser at Ingrid har sjekket inn');
  const t0 = ans.to.find((x) => x.userId === ingridId || x.id === ingridId) ?? ans.to[0];
  assert.equal(t0.answered, true);
  assert.ok(t0.answerId, 'svaret er en egen innsjekk koblet til forespørselen');
  const answer = await json(seb, 'GET', `/api/family/checkin/${t0.answerId}`);
  assert.equal(answer.body.checkin.kind, 'checkin');
  assert.equal(answer.body.checkin.requestId, reqId);
  // Forespørselen er ikke lenger ventende for Ingrid.
  const mine = await json(ing, 'GET', '/api/family/checkin');
  assert.ok(!(mine.body.requests ?? []).some((r) => r.id === reqId));
  assert.deepEqual(errors, []);
  await seb.close(); await ing.close();
});
