// Prompt 51 (QA51): mock-server for ende-til-ende-testene. Starter Hono-appen med MOCK_DATA=1 og NODE_ENV=test
// (ingen bakgrunnsjobber), egen tom DATA_DIR og fast port (E2E_PORT, standard 4605). Alle utgående kall stoppes,
// så testene aldri når internett. Brukes av lib.mjs; kan også startes for hånd: node test/e2e51/server.mjs
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), 'hl-e2e51-'));
process.env.SESSION_SECRET ||= 'e2e51-secret-e2e51-secret-e2e51-secret';
process.env.USER_NAME ||= 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = process.env.E2E_PORT || '4605';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.GLITCHTIP_DSN;
const { hashPassword } = await import('../../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword(process.env.E2E_PASSWORD || 'testpassord1');

const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  const u = typeof url === 'string' ? url : url?.url ?? String(url);
  if (local.test(u)) return realFetch(url, opt);
  throw new TypeError('fetch failed (e2e: ingen utgående kall)');
};

const { serve } = await import('@hono/node-server');
const { default: app, wsUser } = await import('../../server/index.js');
const { attachRealtime } = await import('../../server/realtime.js');
const port = Number(process.env.PORT);
const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  if (process.env.E2E_READY_FILE) writeFileSync(process.env.E2E_READY_FILE, String(port));
  console.log(`[e2e51] mock-server på http://127.0.0.1:${port} (data ${process.env.DATA_DIR})`);
});
attachRealtime(server, wsUser); // /api/ws som i produksjon (Familie og Sjekk inn oppdateres live)
