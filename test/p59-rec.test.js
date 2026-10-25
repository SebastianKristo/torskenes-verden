// «Glimt anbefaler» etter eval på Mac mini-en (16 GB): qwen3:8b til all tekst, qwen2.5vl:7b til bilder, ingen store modeller som
// gir modellbytter, aldri llama3.2:3b (heller ikke som alternativ), og embeddings-modellen i bruk beholdes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p59rec-'));
process.env.MOCK_DATA = '1';
process.env.SESSION_SECRET ||= 'p59rec-secret-p59rec-secret-p59rec-secret';
const r39 = await import('../server/ai39.js');
const HW = { model: 'Mac mini M4', memGb: 16, gpuBudgetGb: 10.67 };

test('16 GB: modellene fra eval vinner, store modeller og llama3.2:3b anbefales ikke', async () => {
  const { items } = await r39.recommend('owner', { hw: HW, withWhy: false });
  const by = Object.fromEntries(items.map((x) => [x.task, x]));
  for (const t of ['chat', 'sok', 'glimt', 'brief', 'kat', 'fsok', 'dom']) assert.equal(by[t].model, 'qwen3:8b', t);
  for (const t of ['rc', 'bar']) assert.equal(by[t].model, 'qwen2.5vl:7b', t);
  for (const x of items) {
    assert.ok(!/gemma4|gemma3:12b|gemma3:27b/.test(x.model), `${x.task}: ${x.model}`);
    assert.ok(!/^llama3\.2(:3b)?$/.test(x.alt ?? ''), `${x.task} alt ${x.alt}`);
  }
  assert.match(by.glimt.why, /Testet i eval/);
});

test('stor maskin: store modeller kan fortsatt anbefales (ingen straff over 12 GB GPU-budsjett)', async () => {
  const { items } = await r39.recommend('owner', { hw: { model: 'Mac Studio', memGb: 64, gpuBudgetGb: 42 }, withWhy: false });
  assert.ok(items.length > 0);
});

test('oppgraderingen setter de beste installerte modellene én gang (serverrutingen), og ikke på nytt', async () => {
  const ai = await import('../server/ai-run.js');
  const inv = await ai.ollamaInventory({ force: true });
  const r1 = await r39.applyBest59();
  if (!inv.ok || !inv.models?.length) { assert.equal(r1.skipped, 'Ollama svarer ikke'); return; }
  assert.ok(Array.isArray(r1.changes));
  const routes = ai.routing('owner').tasks;
  for (const c of r1.changes) assert.equal(routes[c.task].model, c.to, c.task);
  assert.ok(!r1.changes.some((c) => /gemma4|llama3\.2:3b/.test(c.to)));
  assert.ok(!r1.changes.some((c) => c.task === 'kb'), 'kunnskapsbasen røres ikke (ny indeksering)');
  const r2 = await r39.applyBest59();
  assert.equal(r2.skipped, 'allerede gjort');
});
