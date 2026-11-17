// Prompt 51 (QA51) E2E: kvittering fra nettleseren – skann (multipart som web-klienten), rett felt, bokfør, og se den i FinansHub.
// Mock-serveren har ingen OCR-motor eller modell, så kjeden lagrer kvitteringen til gjennomgang; flyten er det som testes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, BASE, PASSWORD, json, watchErrors, apiLogin } from './lib.mjs';

let E = null;
before(async (t) => { E = await setup(t); });
after(async () => { await E?.close(); });

test('kvittering: skann fra nettleseren → til gjennomgang → rett butikk og sum → bokført som transaksjon', async (t) => {
  if (!E) return t.skip('ingen nettleser');
  const ctx = await E.browser.newContext({ viewport: { width: 1280, height: 860 } });
  await apiLogin(ctx, 'sebastian', PASSWORD);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/finans/`);
  await page.waitForLoadState('networkidle');
  // Et kvitteringsbilde tegnet i nettleseren (2000 px lang side, som originalen fra kameraet) sendes som web-klienten gjør.
  const scan = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 2000;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1000, 2000); g.fillStyle = '#000'; g.font = '64px monospace';
    ['REMA 1000 GRUNERLOKKA', 'Org.nr 914 803 893 MVA', 'MELK 1L        24,90', 'BROD           39,90', 'TOTAL          64,80'].forEach((l, i) => g.fillText(l, 60, 160 + i * 110));
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const fd = new FormData();
    fd.append('image', new File([blob], 'e2e51-kvittering.png', { type: 'image/png' }));
    fd.append('client', JSON.stringify({ platform: 'web', version: 'e2e51' }));
    const r = await fetch('/api/receipts/scan', { method: 'POST', body: fd, credentials: 'same-origin' });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(scan.status, 201, JSON.stringify(scan.body));
  const id = scan.body.receipt_id;
  assert.ok(id);
  assert.ok(Array.isArray(scan.body.pipeline) && scan.body.pipeline.length, 'kjeden rapporterer stegene');
  const got = await json(ctx, 'GET', `/finans/api/receipts/${id}`);
  assert.equal(got.status, 200);
  // Brukeren retter skjemaet og bokfører.
  const today = new Date().toISOString().slice(0, 10);
  const p = await json(ctx, 'PATCH', `/finans/api/receipts/${id}`, { merchant: 'REMA 1000 Grünerløkka', total: 64.8, date: today });
  assert.equal(p.status, 200, p.text);
  const b = await json(ctx, 'POST', `/finans/api/receipts/${id}/book`, {});
  assert.equal(b.status, 200, b.text);
  const after = await json(ctx, 'GET', `/finans/api/receipts/${id}`);
  assert.equal(after.body.status, 'booked');
  // Og den vises i FinansHub (Kvitteringer) i nettleseren.
  await page.goto(`${BASE}/finans/#/kv`);
  await page.waitForFunction(() => /REMA 1000 Grünerløkka|e2e51-kvittering/.test(document.body.innerText), null, { timeout: 15_000 });
  // Bokføringen laget en utgift på 64,80.
  const tx = await json(ctx, 'GET', '/finans/api/transactions');
  const list = Array.isArray(tx.body) ? tx.body : tx.body?.items ?? tx.body?.transactions ?? [];
  assert.ok(list.some((x) => /REMA 1000/.test(x.merchant ?? x.description ?? '') && Math.abs(x.amount + 64.8) < 0.001 && x.source === 'receipt'), JSON.stringify(list.slice(0, 3)));
  assert.deepEqual(errors, [], 'ingen JS-feil i FinansHub');
  await ctx.close();
});
