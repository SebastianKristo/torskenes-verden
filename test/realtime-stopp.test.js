// Nedstenging med åpne WebSocket-forbindelser (AUDIT A §6 B7): server.close() venter til alle forbindelser er lukket. Uten
// closeRealtime() holdt /api/ws-forbindelsene serveren oppe til tidsgrensen på 5 s i server/index.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { attachRealtime, closeRealtime, realtimeClients } from '../server/realtime.js';

test('closeRealtime() lukker /api/ws-forbindelsene, så server.close() blir ferdig med en gang', async () => {
  const server = createServer((req, res) => { res.statusCode = 404; res.end(); });
  attachRealtime(server, async () => 'owner');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
  const closed = new Promise((r) => ws.on('close', (code) => r(code)));
  await new Promise((r, j) => { ws.on('message', r); ws.on('error', j); });
  assert.equal(realtimeClients(), 1);

  const t0 = Date.now();
  closeRealtime();
  await new Promise((r) => server.close(r));
  assert.ok(Date.now() - t0 < 1000, `server.close() tok ${Date.now() - t0} ms`);
  assert.equal(await closed, 1001, 'klienten får «going away» og kan koble til igjen når serveren er oppe');
  assert.equal(realtimeClients(), 0);
});
