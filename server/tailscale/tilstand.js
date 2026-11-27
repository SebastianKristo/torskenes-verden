// Tailscale: det serveren holder mellom kallene – siste latens per enhet (bakgrunnspingen), forrige online-status (for sanntid)
// og siste endring. hent() er den ene veien til den normaliserte listen med latens, og sender «tailscale.node» over /api/ws
// (bare til administratorer) når en enhet går online eller offline.
import { kv, OWNER } from '../db.js';
import { broadcast } from '../realtime.js';
import { getTailnet, pingIp, chooseSource } from './kilde.js';

const latens = new Map(); // id → {ms, tunnel, at}
let forrige = null; // id → online (null før første henting)
let sistSett = null; // updatedAt for listen forrige ble regnet ut fra

/** Lagrer en måling (bakgrunnspingen eller «Ping nå»). ok:false = ingen svar (latensen blir ukjent). */
export function settLatens(id, r, now = Date.now()) {
  if (r?.ok && Number.isFinite(r.latencyMs)) latens.set(id, { ms: r.latencyMs, tunnel: r.tunnel ?? null, at: now });
  else latens.delete(id);
}
export const latensFor = (id) => latens.get(id) ?? null;

/** Siste endring (online/offline): {id, name, online, at} eller null. */
export const sisteEndring = () => kv.get(OWNER, 'ts_siste_endring', null);

function merk(t, now) {
  if (t.updatedAt === sistSett) return;
  sistSett = t.updatedAt;
  const na = new Map(t.devices.map((d) => [d.id, d.online]));
  if (forrige) {
    for (const d of t.devices) {
      if (!forrige.has(d.id) || forrige.get(d.id) === d.online) continue;
      const e = { id: d.id, name: d.name, online: d.online, at: new Date(now).toISOString() };
      kv.set(OWNER, 'ts_siste_endring', e);
      broadcast('tailscale.node', { id: d.id, name: d.name, online: d.online, lastSeen: d.lastSeen }); // uten userIds: bare administratorer
      if (!d.online) latens.delete(d.id);
    }
  }
  forrige = na;
}

/** Den normaliserte listen med siste kjente latens (null = ukjent). Kaster når ingen kilde er satt opp. */
export async function hent(now = Date.now()) {
  const t = await getTailnet();
  merk(t, now);
  const devices = t.devices.map((d) => {
    const l = d.online ? latens.get(d.id) : null;
    // Latensen fra en ping eldre enn 15 min regnes som ukjent.
    const fresh = l && now - l.at < 15 * 60_000;
    return { ...d, latencyMs: fresh ? l.ms : null, tunnel: fresh && l.tunnel ? l.tunnel : d.tunnel };
  });
  return { ...t, devices };
}

/** Enheter som pinges i bakgrunnen: online, ikke seg selv, ikke mobil eller nettbrett (de sover og skal ikke vekkes). */
export const pingbare = (devices) => devices.filter((d) => d.online && !d.self && d.ip && d.kind !== 'mobile' && d.kind !== 'tablet');

/** Pinger alle pingbare enheter (to om gangen). → antall med svar */
export async function pingAlle(now = Date.now()) {
  if (chooseSource() !== 'localapi' && chooseSource() !== 'demo') return 0;
  const list = pingbare((await hent(now)).devices);
  let ok = 0;
  for (let i = 0; i < list.length; i += 2) {
    const rs = await Promise.all(list.slice(i, i + 2).map((d) => pingIp(d.ip).then((r) => [d, r])));
    for (const [d, r] of rs) { settLatens(d.id, r, now); if (r.ok) ok++; }
  }
  return ok;
}

/** Bare for tester. */
export const _resetTilstand = () => { latens.clear(); forrige = null; sistSett = null; };
