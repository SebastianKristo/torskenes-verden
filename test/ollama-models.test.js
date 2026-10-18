// Ollama-modeller: installerte fra /api/tags, katalog for 16 GB, og installering med fremdrift fra /api/pull.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-olm-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
const O = await import('../server/finans/ollama-models.js');

test('installerte modeller merkes i katalogen, og en installering følges til den er ferdig', async () => {
  const orig = globalThis.fetch;
  const lines = [{ status: 'pulling manifest' }, { status: 'pulling', total: 100, completed: 40 }, { status: 'pulling', total: 100, completed: 100 }, { status: 'success' }];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen2.5vl:7b', size: 6e9, details: { parameter_size: '8.3B' } }] }));
    if (u.endsWith('/api/version')) return new Response(JSON.stringify({ version: '0.12.3' }));
    if (u.endsWith('/api/pull')) return new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return new Response('{}', { status: 404 });
  };
  try {
    const m = await O.ollamaModels();
    assert.equal(m.version, '0.12.3');
    assert.equal(m.catalog.find((c) => c.name === 'qwen2.5vl:7b').installed, true);
    assert.equal(m.catalog.find((c) => c.name === 'qwen3:8b').installed, false);
    assert.ok(m.catalog.filter((c) => c.tooBig).every((c) => c.size > 14), 'store modeller merkes');
    O.startPull('qwen3:8b');
    for (let i = 0; i < 50 && !O.pullStatus()[0].done; i++) await new Promise((r) => setTimeout(r, 10));
    const p = O.pullStatus().find((x) => x.name === 'qwen3:8b');
    assert.equal(p.done, true);
    assert.equal(p.error, null);
    assert.equal(p.pct, 100);
    assert.throws(() => O.startPull('rm -rf /'), /Ugyldig/);
  } finally { globalThis.fetch = orig; }
});
