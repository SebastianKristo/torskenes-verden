// Web Push på web-dashboardet (prompt 31, claude-code-ai-bakgrunnsvarsel.md). Uten avhengigheter.
// - Innstillinger → Varsler → «Varsler på denne enheten»: spør om tillatelse, registrerer /sw.js og et push-abonnement
//   med serverens VAPID-nøkkel (GET /api/push/vapid) og sender det til POST /api/push/subscribe. Av: DELETE.
// - Presence: mens fanen er synlig sendes POST /api/push/presence {visible:true} hvert 20. s (serveren holder push
//   tilbake i 30 s etter siste synlige heartbeat). Skjult: {visible:false} med keepalive.
// - Service workeren (/sw.js) viser varselet og åpner riktig side ved trykk; AI-svar vises ikke når fanen er synlig.
const KEY = 'hl_push_on';
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext !== false;
const b64uToU8 = (s) => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

async function reg() {
  const r = await navigator.serviceWorker.getRegistration('/') ?? await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready.then(() => r).catch(() => r);
}
async function json(path, method = 'GET', body) {
  const r = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `Serveren svarte ${r.status}`), { status: r.status });
  return d;
}

/** {supported, permission, subscribed, missing (serveren mangler API-et)} */
export async function pushState() {
  if (!pushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  let subscribed = false;
  try { const r = await navigator.serviceWorker.getRegistration('/'); subscribed = !!(await r?.pushManager.getSubscription()); } catch { /* */ }
  return { supported: true, permission: Notification.permission, subscribed };
}

/** Slår på varsler på denne enheten. Returnerer {ok, error?}. */
export async function enablePush() {
  if (!pushSupported()) return { ok: false, error: 'Denne nettleseren støtter ikke push-varsler (krever https).' };
  const p = Notification.permission === 'default' ? await Notification.requestPermission().catch(() => 'denied') : Notification.permission;
  if (p !== 'granted') return { ok: false, error: p === 'denied' ? 'Varsler er blokkert i nettleseren. Tillat dem i nettleserens innstillinger for denne siden.' : 'Tillatelse ble ikke gitt.' };
  try {
    const { publicKey } = await json('/api/push/vapid');
    if (!publicKey) throw new Error('Serveren har ingen VAPID-nøkkel.');
    const r = await reg();
    let sub = await r.pushManager.getSubscription();
    // Ny nøkkel på serveren (eller annen server): abonner på nytt.
    const cur = sub?.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null, want = b64uToU8(publicKey);
    if (sub && cur && (cur.length !== want.length || cur.some((v, i) => v !== want[i]))) { await sub.unsubscribe().catch(() => {}); sub = null; }
    sub ??= await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
    await json('/api/push/subscribe', 'POST', sub.toJSON());
    try { localStorage.setItem(KEY, '1'); } catch { /* */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.status === 404 ? 'Serveren har ikke push-varsler ennå. Oppdater Nordlys.' : `Kunne ikke slå på varsler: ${e.message}` };
  }
}

export async function disablePush() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
  try {
    const r = await navigator.serviceWorker.getRegistration('/'), sub = await r?.pushManager.getSubscription();
    if (sub) { await json('/api/push/subscribe', 'DELETE', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ---------------- Presence ---------------- */

let beat = 0, started = false, missing = false;
function send(visible) {
  if (missing) return;
  fetch('/api/push/presence', { method: 'POST', credentials: 'same-origin', keepalive: !visible, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible }) })
    .then((r) => { if (r.status === 404 || r.status === 405) { missing = true; clearInterval(beat); } }).catch(() => {});
}
function onVis() {
  clearInterval(beat);
  if (document.visibilityState === 'visible') { send(true); beat = setInterval(() => send(true), 20_000); }
  else send(false);
}
/** Startes etter innlogging (app.js). Fornyer også abonnementet hvis det var slått på her og tillatelsen fortsatt gjelder. */
export function startPresence() {
  if (started) return; started = true;
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', () => send(false));
  onVis();
  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch { /* */ }
  if (on && pushSupported() && Notification.permission === 'granted') setTimeout(() => enablePush().catch(() => {}), 4000);
}
