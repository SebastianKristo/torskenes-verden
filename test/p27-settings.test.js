// Prompt 27: Chat- og logo-bryterne lagres per bruker via PUT /finans/api/settings (appene) og vises i /settings og /bootstrap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p27set-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');

const { token } = await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) })).json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

test('logo- og chat-brytere lagres og leses tilbake', async () => {
  const before = await (await fin.request('/settings', { headers: H })).json();
  assert.equal(before.chat_ask_cloud, true);
  assert.equal(before.user.logo_gemini, true);
  const r = await fin.request('/settings', { method: 'PUT', headers: H, body: JSON.stringify({ logo_gemini: false, chat_my_data: true, chat_theme: 'noytral' }) });
  assert.equal(r.status, 200);
  const s = await r.json();
  assert.equal(s.logo_gemini, false);
  assert.equal(s.chat_my_data, true);
  assert.equal(s.chat_theme, 'noytral');
  const p = await (await fin.request('/ai-privacy', { headers: H })).json();
  assert.equal(p.logo_gemini === false || p.logoGemini === false, true);
});
