// Familie: delingsvalgene (posisjon, helse, kalender) – i onboardingen og etterpå. Før i webx51.js; montert fra system/index.js
// (mountSystemEarly), og onboardingen (auth/invites.js) bruker setShare51.
//   GET/PUT /api/me/share51 → {location, health, calendar}
// Familie har én delingsbryter (positions.js, family_prefs.sharing); helse deles bare sammen med posisjon.
import { Hono } from 'hono';
import { kv } from '../db.js';
import { authOrToken } from '../mobile.js';
import { listUsers } from '../auth/session.js';
import { broadcast } from '../realtime.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };

const HEALTH_SHARE = { steps: true, restingHr: true, hr: false, sleep: true, activeKcal: true, week: true };
export function shareOf51(u) {
  const p = kv.get(u, 'family_prefs', {}) ?? {};
  const s = kv.get(u, 'share51', {}) ?? {};
  return { location: p.sharing === 'on', health: p.sharing === 'on' && Object.entries(p.shareHealth ?? {}).some(([k, v]) => k !== 'week' && v), calendar: s.calendar === true };
}
export function setShare51(u, b) {
  const cur = shareOf51(u);
  const next = { location: typeof b.location === 'boolean' ? b.location : cur.location, health: typeof b.health === 'boolean' ? b.health : cur.health, calendar: typeof b.calendar === 'boolean' ? b.calendar : cur.calendar };
  // Familie har én delingsbryter (familie/positions.js): helse deles bare når deling med familien er på. Personvern først – uten posisjon
  // deles heller ikke helse (klientene viser «Helse deles sammen med posisjon»).
  if (!next.location) next.health = false;
  const p = { ...(kv.get(u, 'family_prefs', {}) ?? {}) };
  p.sharing = next.location ? 'on' : (p.sharing === 'paused' ? 'paused' : 'off');
  p.shareHealth = next.health ? (cur.health ? { ...(p.shareHealth ?? {}) } : { ...HEALTH_SHARE }) : Object.fromEntries(Object.keys(HEALTH_SHARE).map((k) => [k, false]));
  kv.set(u, 'family_prefs', p);
  kv.set(u, 'share51', { ...(kv.get(u, 'share51', {}) ?? {}), calendar: next.calendar, location: next.location, health: next.health, at: Date.now() });
  try { broadcast('family', { kind: 'prefs', userId: u }, listUsers().map((x) => x.id)); } catch { /* */ }
  return shareOf51(u);
}

export const shareApi = new Hono();
shareApi.get('/me/share51', authOrToken, (c) => c.json(shareOf51(c.get('user')), 200, NO_STORE));
shareApi.put('/me/share51', authOrToken, async (c) => c.json(setShare51(c.get('user'), await body(c)), 200, NO_STORE));
