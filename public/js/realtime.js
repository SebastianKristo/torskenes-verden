// Sanntid fra serveren: én felles WebSocket på /api/ws (sesjonscookien autentiserer).
// Meldinger er {type:'tasks'|'family'|'tracking', ...}. Sidene abonnerer med onLive(type, fn).
// Kobler til igjen med økende pause. Finnes ikke endepunktet (eldre server), prøves det sjelden, og sidene
// faller tilbake til vanlig henting.
const subs = new Map();
let ws = null, wait = 2000, timer = null, opened = false;

function connect() {
  clearTimeout(timer);
  if (ws || !subs.size) return;
  try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`); } catch { return retry(); }
  ws.onopen = () => { opened = true; wait = 2000; };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    for (const fn of subs.get(m?.type) ?? []) { try { fn(m); } catch (err) { console.warn('[sanntid]', err); } }
  };
  ws.onclose = () => { ws = null; retry(); };
  ws.onerror = () => { /* onclose kommer etterpå */ };
}

function retry() {
  // Uten et eneste vellykket oppsett (endepunktet finnes kanskje ikke) ventes det lenger mellom forsøkene.
  wait = Math.min(opened ? 30_000 : 120_000, wait * 2);
  timer = setTimeout(connect, wait);
}

/** Abonnerer på én meldingstype. Returnerer en funksjon som avslutter abonnementet. */
export function onLive(type, fn) {
  if (!subs.has(type)) subs.set(type, new Set());
  subs.get(type).add(fn);
  connect();
  return () => { subs.get(type)?.delete(fn); };
}

/** true når tilkoblingen er åpen (sidene kan da hente sjeldnere). */
export const liveOn = () => ws?.readyState === 1;

document.addEventListener('visibilitychange', () => { if (!document.hidden && !ws) { wait = 2000; connect(); } });
