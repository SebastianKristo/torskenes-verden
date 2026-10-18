// Sanntid (prompt 17): én felles WebSocket på /api/ws for Huskeliste, Familie og Sporing.
// - Innlogging med sesjonscookien (nettleseren) eller ?token=<app-token> (appene). Sjekkes med de samme reglene som
//   resten av API-et (authOrToken), via en liten intern rute, så ingen tilgangslogikk dupliseres her.
// - Meldinger ut: {type: 'tasks' | 'family' | 'tracking' | 'hello' | 'pong', ...payload, ts}. Klienten kan sende «ping».
// - Serveren pinger hvert 30. sekund og kobler fra døde forbindelser.
// - Brukerskille (prompt 21): uten userIds går meldingen bare til administratorer (Sporing og annet serveroppsett).
//   Huskeliste og Familie sender alltid med en liste over dem som har tilgang.
import { WebSocketServer } from 'ws';
import { isAdmin } from './auth.js';

const clients = new Set(); // { ws, user, alive }
let wss = null;

/** Sender en melding til userIds, eller til administratorene når userIds mangler. Trygg å kalle uten at ws er startet (tester). */
export function broadcast(type, payload = {}, userIds = null) {
  if (!clients.size) return 0;
  const msg = JSON.stringify({ ...payload, type, ts: Date.now() });
  let n = 0;
  for (const c of clients) {
    if (userIds ? !userIds.includes(c.user) : !isAdmin(c.user)) continue;
    if (c.ws.readyState === 1) { c.ws.send(msg); n++; }
  }
  return n;
}

export const realtimeClients = () => clients.size;

/**
 * Kobler WebSocket-serveren til HTTP-serveren fra @hono/node-server.
 * authenticate(req, token) → userId | null (bruker cookie-headeren i req eller token fra ?token=).
 */
export function attachRealtime(server, authenticate) {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', async (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { socket.destroy(); return; }
    if (url.pathname !== '/api/ws') { socket.destroy(); return; }
    let user = null;
    try { user = await authenticate(req, url.searchParams.get('token')); } catch { user = null; }
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const c = { ws, user, alive: true };
      clients.add(c);
      ws.on('pong', () => { c.alive = true; });
      ws.on('message', (data) => {
        const t = String(data).slice(0, 200);
        if (t === 'ping' || /"type"\s*:\s*"ping"/.test(t)) ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      });
      ws.on('close', () => clients.delete(c));
      ws.on('error', () => clients.delete(c));
      ws.send(JSON.stringify({ type: 'hello', user, ts: Date.now() }));
    });
  });
  const timer = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); clients.delete(c); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* lukkes ved neste runde */ }
    }
  }, 30_000);
  timer.unref?.();
  return wss;
}
