// Tailscale: varsler (prompt 57, claude-code-tailscale.md §3). Sjekkes hver gang jobben tar prøver (hvert 5. minutt), og sendes til
// administratorene via notify.js (web push, appene og ntfy). Hvert varsel kan slås av globalt (Innstillinger → Tilkoblinger →
// Tailscale, «ts_varsler») og per enhet (enhetsdetaljen, PUT /api/tailscale/devices/:id/varsler).
//   offline  en server er offline i mer enn 10 min (én gang per gang den går ned)
//   nokkel   nøkkelen utløper om 7 dager eller mindre (én gang per utløpsdato)
//   ny       en ny enhet har dukket opp (ikke ved første runde, da er alle «nye»)
//   derp     en enhet har gått via DERP i mer enn 1 t (én gang per periode)
// evaluer() er ren (testes direkte); tilstanden lagres i kv(OWNER, 'ts_varsel_tilstand').
import { kv, OWNER } from '../db.js';
import { cfg } from '../settings.js';
import { listUsers } from '../auth/session.js';
import { notifyUser } from '../notify.js';

export const VARSLER = ['offline', 'nokkel', 'ny', 'derp'];
const MIN = 60_000;
export const GRENSER = { offlineMs: 10 * MIN, derpMs: 60 * MIN, nokkelDager: 7 };

/** Varslene som er på globalt (standard: alle). */
export function globalePa() {
  const v = String(cfg('ts_varsler') ?? '').trim();
  if (!v) return new Set(VARSLER);
  return new Set(v.split(',').map((x) => x.trim()).filter((x) => VARSLER.includes(x)));
}

const avMap = () => kv.get(OWNER, 'ts_varsel_av', {}) ?? {};
/** Varslene for én enhet: {offline, nokkel, ny, derp} (true = på). */
export function varslerFor(id) {
  const off = new Set(avMap()[id] ?? []);
  return Object.fromEntries(VARSLER.map((k) => [k, !off.has(k)]));
}
/** Slår varsler av/på for én enhet. changes = {offline: false, …}. → varslerFor(id) */
export function settVarsler(id, changes) {
  const m = avMap(), off = new Set(m[id] ?? []);
  for (const [k, on] of Object.entries(changes)) if (VARSLER.includes(k)) { if (on) off.delete(k); else off.add(k); }
  if (off.size) m[id] = [...off]; else delete m[id];
  kv.set(OWNER, 'ts_varsel_av', m);
  return varslerFor(id);
}

/**
 * Ren regel: → {alerts:[{type, id, name, title, body}], state}. state = {offlineSince, derpSince, sent} (id → ms / nøkkel → ms).
 * nye = enheter sett for første gang i denne runden; forste = første runde noensinne (ingen «ny enhet»-varsler).
 * pa = globale varsler som er på, av = (id) → Set med varsler slått av for enheten.
 */
export function evaluer(state0, devices, now, { nye = [], forste = false, pa = new Set(VARSLER), av = () => new Set() } = {}) {
  const state = { offlineSince: { ...(state0?.offlineSince ?? {}) }, derpSince: { ...(state0?.derpSince ?? {}) }, sent: { ...(state0?.sent ?? {}) } };
  const alerts = [];
  const want = (type, d) => pa.has(type) && !av(d.id).has(type);
  const send = (type, d, key, title, body) => {
    if (state.sent[key]) return;
    state.sent[key] = now;
    if (want(type, d)) alerts.push({ type, id: d.id, name: d.name, title, body });
  };
  for (const d of devices) {
    // Offline: fra «sist sett» hvis den finnes, ellers fra første gang vi så den offline.
    if (!d.online) {
      state.offlineSince[d.id] ??= d.lastSeen ? Math.min(now, Date.parse(d.lastSeen)) : now;
      if (d.kind === 'server' && now - state.offlineSince[d.id] > GRENSER.offlineMs) {
        send('offline', d, `offline:${d.id}:${state.offlineSince[d.id]}`, `${d.name} er offline`, `Serveren har vært offline i over ${Math.round((now - state.offlineSince[d.id]) / MIN)} min.`);
      }
    } else {
      delete state.offlineSince[d.id];
      for (const k of Object.keys(state.sent)) if (k.startsWith(`offline:${d.id}:`)) delete state.sent[k];
    }
    // DERP i over en time.
    if (d.online && d.tunnel?.startsWith('derp:')) {
      state.derpSince[d.id] ??= now;
      if (now - state.derpSince[d.id] > GRENSER.derpMs) send('derp', d, `derp:${d.id}:${state.derpSince[d.id]}`, `${d.name} går via DERP`, `Ingen direkte forbindelse på over en time (relay ${d.tunnel.slice(5)}).`);
    } else if (d.online && d.tunnel === 'direkte') {
      delete state.derpSince[d.id];
      for (const k of Object.keys(state.sent)) if (k.startsWith(`derp:${d.id}:`)) delete state.sent[k];
    }
    // Nøkkel som utløper snart (én gang per utløpsdato).
    if (d.expiresInDays != null && d.expiresInDays >= 0 && d.expiresInDays <= GRENSER.nokkelDager && d.keyExpiry) {
      send('nokkel', d, `nokkel:${d.id}:${d.keyExpiry}`, `Nøkkelen til ${d.name} utløper`, d.expiresInDays === 0 ? 'Nøkkelen utløper i dag.' : `Nøkkelen utløper om ${d.expiresInDays} ${d.expiresInDays === 1 ? 'dag' : 'dager'}.`);
    }
  }
  if (!forste) for (const id of nye) {
    const d = devices.find((x) => x.id === id);
    if (d) send('ny', d, `ny:${id}`, 'Ny enhet i tailnetet', `${d.name}${d.os ? ` (${d.os})` : ''} har dukket opp${d.ip ? ` på ${d.ip}` : ''}.`);
  }
  // Rydd gamle nøkler (over 60 dager) så tilstanden ikke vokser.
  for (const [k, t] of Object.entries(state.sent)) if (now - t > 60 * 24 * 60 * MIN) delete state.sent[k];
  return { alerts, state };
}

/** Sjekker reglene og sender varslene til administratorene. → antall varsler */
export async function sjekkVarsler(devices, { nye = [], forste = false, now = Date.now() } = {}) {
  const off = avMap();
  const r = evaluer(kv.get(OWNER, 'ts_varsel_tilstand', null), devices, now, { nye, forste, pa: globalePa(), av: (id) => new Set(off[id] ?? []) });
  kv.set(OWNER, 'ts_varsel_tilstand', r.state);
  const admins = listUsers().filter((u) => u.role === 'admin').map((u) => u.id);
  for (const a of r.alerts) {
    for (const u of admins) {
      await notifyUser(u, { title: a.title, body: a.body, url: '/#/nettverk', tag: `ts-${a.type}-${a.id}`, category: 'system', data: { kind: `tailscale.${a.type}`, deviceId: a.id } }).catch(() => {});
    }
  }
  return r.alerts.length;
}
