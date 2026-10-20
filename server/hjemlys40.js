// Prompt 40 (SERVER40): Hjemlys – «Et lite lys som står på til du er hjemme.» (claude-code-hjemlys.md, kontrakten «Hjemlys»).
// Byggesteinene: server-API, jobb hvert minutt, varsler, sanntid «hjemlys», tokens for Live Activity (iOS) / Live Update (Android) og Glimt-forslag.
// Flyten (1a/1b/1c) er ikke valgt; klientene lager en enkel start (forventet tid, mottakere = husstanden, ventetid 5/15/30).
//
// Personvern: ingenting (posisjon, rute, batteri, dekning, siste opplåsing, hvem du var med) deles før økta er «late».
// Husstanden ser bare at Hjemlys er aktivt (navn, tilstand, forventet tid). Ruten slettes 24 t etter at økta er slutt.
//
// Sesjon: {id, userId, name, avatar, state:'onTheWay'|'late'|'home'|'ended', eta, startedAt, waitMin, mode, progress, leg, lateMinutes, okAt,
//          recipients:[{userId, name}], homeAt?, endedAt?, share?(bare når late:{pos:{lat,lon,acc,at}, route:[[lat,lon,ts]], phone, battery, signal, unlockedAt, with:{event, people[]}|null}),
//          live:{eta(Unix s), progress, leg, state:'onTheWay'|'late'|'home', lateMinutes, homeAt(Unix s)|null, from} – content-state for Live Activity/Live Update}
// POST  /api/hjemlys/start {eta:ISO|minutter, mode?:'walk'|'transit'|'car'|'bike', waitMin?:5|15|30, recipients?:[bruker-id]} → {session}  (avslutter en tidligere aktiv økt)
// GET   /api/hjemlys → {mine:session|null, household:[{userId, name, avatar, phone, state:'onTheWay'|'late'|'home'|'off', eta, since, sessionId?, share?}]}
// PATCH /api/hjemlys/:id {eta?, pos?:{lat,lon,acc}, battery?, signal?, unlockedAt?, plus?:10, wifiHome?:true, leg?} → {session, stored:{pos:bool}}
//        Posisjon lagres maks hvert 30. s eller ved 50 m flytting. Innenfor 60 m av hjemmet (sonen «Hjem» i Familie) eller wifiHome → home.
// POST  /api/hjemlys/:id/ok · /home · /end → {session}
// POST  /api/hjemlys/tokens {platform:'ios'|'android', kind:'liveactivity'|'pushtostart'|'fcm', token, sessionId?} → {ok}
// GET   /api/hjemlys/suggest → {suggest, reason, text:'Kino er ferdig. Skal jeg si fra til Rune og Cybele når du er hjemme?', recipients:[{userId, name}], eta, event?}
// GET   /api/hjemlys/route?mode=kollektiv|gå|sykkel[&lat=&lon=] → {from:{name, km}, fromText, to, options:[{mode, label, legs:[{kind, minutes}], eta, etaLabel, minutes}], geometry, estimated}
// GET   /api/hjemlys/:id/log → [{at, text, who, kind}]  (familiens logg: «Sebastian er hjemme 23.36»)
// Jobb hvert minutt (tick40): eta passert → «Alt OK?» til deg; eta + waitMin passert → late + varsel med delingsdata til mottakerne.
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { userInfo, listUsers } from './auth.js';
import { notifyUser } from './notify.js';
import { broadcast } from './realtime.js';

db.exec(`
CREATE TABLE IF NOT EXISTS hjemlys_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, state TEXT NOT NULL, eta INTEGER NOT NULL, wait_min INTEGER NOT NULL DEFAULT 15, mode TEXT,
  recipients TEXT NOT NULL DEFAULT '[]', started_at INTEGER NOT NULL, ended_at INTEGER, home_at INTEGER, late_at INTEGER, ok_at INTEGER, ok_prompt_at INTEGER,
  leg TEXT, battery REAL, signal TEXT, unlocked_at INTEGER, start_lat REAL, start_lon REAL, last_lat REAL, last_lon REAL, last_acc REAL, last_pos_at INTEGER, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS hjemlys_sessions_user ON hjemlys_sessions(user_id, state);
CREATE TABLE IF NOT EXISTS hjemlys_pos (session_id TEXT NOT NULL, ts INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, acc REAL);
CREATE INDEX IF NOT EXISTS hjemlys_pos_s ON hjemlys_pos(session_id, ts);
CREATE TABLE IF NOT EXISTS hjemlys_log (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, who TEXT);
CREATE INDEX IF NOT EXISTS hjemlys_log_s ON hjemlys_log(session_id, at);
CREATE TABLE IF NOT EXISTS hjemlys_tokens (user_id TEXT NOT NULL, platform TEXT NOT NULL, kind TEXT NOT NULL, token TEXT NOT NULL, session_id TEXT, updated INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, token));`);

export const HOME_RADIUS_M = 60, POS_MIN_S = 30, POS_MIN_M = 50, ROUTE_KEEP_MS = 24 * 3600_000;
const ACTIVE = ['onTheWay', 'late'];
const MODES = ['walk', 'transit', 'car', 'bike', 'other'];
// Prompt 40 (tillegg 1a): reisemåtene i startarket heter kollektiv | gå | sykkel.
const MODE_ALIAS = { kollektiv: 'transit', 'gå': 'walk', ga: 'walk', sykkel: 'bike', bil: 'car' };
const q = (s) => db.prepare(s);
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const nameOf = (id) => { const u = userInfo(id); return u?.displayName || u?.name || u?.username || 'Ukjent'; };
const first = (id) => String(nameOf(id)).split(/\s+/)[0];
const avatarOf = (id) => userInfo(id)?.avatarUrl ?? null;
const hhmm = (ms) => new Date(ms).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
/** Avstand i meter (haversine). */
export function distM(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Hjemmet: sonen «Hjem» (ikon home) i Familie, helst brukerens egen. → {lat, lon, radius}|null */
export function homeOf(user) {
  try {
    const z = q("SELECT * FROM family_zone WHERE icon='home' OR lower(name) LIKE 'hjem%' ORDER BY (created_by=?) DESC, id LIMIT 1").get(user);
    return z ? { lat: z.lat, lon: z.lon, radius: z.radius, name: z.name } : null;
  } catch { return null; }
}
const household = (u) => listUsers().map((x) => x.id).filter((id) => id !== u);

let calImpl = null;
/** Bare for tester: (user, fromDate, toDate) → [hendelse]. */
export const _setHjemlysCalendar = (fn) => { calImpl = fn; };
async function eventsOf(user, from, to) {
  if (calImpl) return calImpl(user, from, to);
  try { const { eventsFor } = await import('./calendar.js'); return (await eventsFor(user, from, to)).events ?? []; } catch { return []; }
}
const osloDate = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const endMsOf = (e) => Date.parse(e.end ?? e.start ?? '') || null;
/** Hvem du var med: deltakerne (eller familie nevnt i tittel/beskrivelse) i hendelsen som slutter rett før start. */
async function withWhom(user, startedAt) {
  const evs = (await eventsOf(user, osloDate(startedAt - 86400_000), osloDate(startedAt))).filter((e) => !e.allDay);
  const near = evs.map((e) => ({ e, end: endMsOf(e) })).filter((x) => x.end && x.end <= startedAt + 30 * 60_000 && x.end >= startedAt - 4 * 3600_000).sort((a, b) => b.end - a.end)[0]?.e;
  if (!near) return null;
  const att = (near.attendees ?? near.people ?? []).map((a) => (typeof a === 'string' ? a : a?.name ?? a?.cn ?? a?.mail)).filter(Boolean);
  const fam = listUsers().filter((u) => u.id !== user).map((u) => String(u.displayName ?? u.name ?? '').split(/\s+/)[0]).filter((n) => n && new RegExp(`\\b${n}\\b`, 'i').test(`${near.title ?? ''} ${near.desc ?? ''}`));
  return { event: near.title ?? null, endedAt: near.end ?? null, place: near.room || near.location || null, people: [...new Set([...att, ...fam])] };
}

function progressOf(s, now = Date.now()) {
  const home = homeOf(s.user_id);
  if (home && s.start_lat != null && s.last_lat != null) {
    const total = distM({ lat: s.start_lat, lon: s.start_lon }, home), left = distM({ lat: s.last_lat, lon: s.last_lon }, home);
    if (total > 100) return Math.max(0, Math.min(1, Math.round((1 - left / total) * 100) / 100));
  }
  if (s.state === 'home' || s.state === 'ended') return 1;
  const span = s.eta - s.started_at;
  return span > 0 ? Math.max(0, Math.min(0.99, Math.round(((now - s.started_at) / span) * 100) / 100)) : 0;
}
/** Telefonnummeret til «Ring …» (lagres per bruker: PUT /api/hjemlys/phone eller phone i /start). Deles bare når økta er late. */
export const phoneOf40 = (u) => kv.get(u, 'hjemlys_phone', null) || null;
const cleanPhone = (v) => { const t = String(v ?? '').replace(/[^\d+]/g, ''); return /^\+?\d{5,15}$/.test(t) ? t : null; };
/** Delingsdata (bare når late). */
async function shareOf(s) {
  const route = q('SELECT lat, lon, ts FROM hjemlys_pos WHERE session_id=? ORDER BY ts').all(s.id).map((p) => [p.lat, p.lon, p.ts]);
  return { pos: s.last_lat != null ? { lat: s.last_lat, lon: s.last_lon, acc: s.last_acc, at: s.last_pos_at ? new Date(s.last_pos_at).toISOString() : null } : null, route,
    phone: phoneOf40(s.user_id), battery: s.battery ?? null, signal: s.signal ?? null, unlockedAt: s.unlocked_at ? new Date(s.unlocked_at).toISOString() : null, with: await withWhom(s.user_id, s.started_at) };
}
/** Sesjonen slik API-et viser den. share bare når late. */
export async function sessionOut40(s, { now = Date.now() } = {}) {
  if (!s) return null;
  const late = s.state === 'late';
  return { id: s.id, userId: s.user_id, name: first(s.user_id), avatar: avatarOf(s.user_id), state: s.state, eta: new Date(s.eta).toISOString(), etaLabel: hhmm(s.eta),
    startedAt: new Date(s.started_at).toISOString(), waitMin: s.wait_min, mode: s.mode ?? null, progress: progressOf(s, now), leg: s.leg ?? null,
    lateMinutes: late ? Math.max(0, Math.round((now - s.eta) / 60_000)) : 0, okAt: s.ok_at ? new Date(s.ok_at).toISOString() : null,
    recipients: parse(s.recipients, []).map((id) => ({ userId: id, name: first(id) })),
    ...(s.home_at ? { homeAt: new Date(s.home_at).toISOString(), homeLabel: `${first(s.user_id)} er hjemme ${hhmm(s.home_at)}` } : {}),
    ...(s.ended_at ? { endedAt: new Date(s.ended_at).toISOString() } : {}), ...(late ? { share: await shareOf(s) } : {}), live: liveState40(s, now) };
}
/**
 * Content-state for Live Activity (APNs liveactivity) / Live Update: {eta, progress, leg, state, lateMinutes, homeAt, from}
 * eta og homeAt i Unix-sekunder (homeAt null til hjemme), from = navnet på den som er på vei. state 'ended' sendes som 'home'.
 */
export function liveState40(s, now = Date.now()) {
  return { eta: Math.round(s.eta / 1000), progress: progressOf(s, now), leg: s.leg ?? null, state: s.state === 'ended' ? 'home' : s.state,
    lateMinutes: s.state === 'late' ? Math.max(0, Math.round((now - s.eta) / 60_000)) : 0, homeAt: s.home_at ? Math.round(s.home_at / 1000) : null, from: first(s.user_id) };
}
const row = (id) => q('SELECT * FROM hjemlys_sessions WHERE id=?').get(id);
const activeOf = (u) => q(`SELECT * FROM hjemlys_sessions WHERE user_id=? AND state IN ('onTheWay','late') ORDER BY started_at DESC LIMIT 1`).get(u);
/** Sanntid til eieren og mottakerne. Mottakerne får bare delingsdata når økta er late. */
/** Familiens logg (1b): «Sebastian er hjemme 23.36». */
const LOG_TEXT = { start: (s) => `${first(s.user_id)} startet Hjemlys · hjemme ca. ${hhmm(s.eta).replace(':', '.')}`, ok: (s) => `${first(s.user_id)} svarte «Alt OK»`,
  home: (s) => `${first(s.user_id)} er hjemme ${hhmm(s.home_at ?? Date.now()).replace(':', '.')}`, end: (s) => `${first(s.user_id)} avsluttet Hjemlys`,
  late: (s) => `${first(s.user_id)} er ${Math.max(0, Math.round(((s.late_at ?? Date.now()) - s.eta) / 60_000))} min forsinket · familien har fått beskjed`, prompt: () => 'Glimt spurte: «Alt OK?»',
  plus: (s) => `Ny tid · hjemme ca. ${hhmm(s.eta).replace(':', '.')}` };
export function log40(s, kind, now = Date.now()) {
  const t = LOG_TEXT[kind]?.(s);
  if (t) q('INSERT INTO hjemlys_log(session_id, at, kind, text, who) VALUES(?,?,?,?,?)').run(s.id, now, kind, t, kind === 'prompt' ? 'glimt' : s.user_id);
}
async function emit(s, action) {
  log40(s, action === 'update' ? null : action);
  try {
    const out = await sessionOut40(s);
    broadcast('hjemlys', { action, session: out }, [s.user_id, ...parse(s.recipients, [])]);
  } catch { /* sanntid er best effort */ }
  pushLive(s, action);
}
/**
 * Live Activity / Live Update: registrerte tokens for eieren (og mottakerne med «Følg … hjem»). APNs/FCM sendes ikke fra serveren
 * ennå (ingen nøkler i oppsettet); hendelsen logges, og appene oppdaterer seg fra sanntid/varsel.
 */
function pushLive(s, action) {
  try {
    const n = q('SELECT count(*) FROM hjemlys_tokens WHERE (user_id=? OR session_id=?)').pluck().get(s.user_id, s.id);
    if (n && process.env.NODE_ENV !== 'test') console.info(`[hjemlys] ${action} ${s.id}: ${n} live-token(s) (push-sending ikke satt opp)`);
  } catch { /* */ }
}
const touch = (id, set) => {
  const keys = Object.keys(set);
  q(`UPDATE hjemlys_sessions SET ${keys.map((k) => `${k}=?`).join(', ')}, updated=? WHERE id=?`).run(...keys.map((k) => set[k]), Date.now(), id);
  return row(id);
};

/* ---------------- Tilstander ---------------- */

export async function start40(u, b = {}, now = Date.now()) {
  let eta = typeof b.eta === 'number' && b.eta > 0 && b.eta < 24 * 60 ? now + Math.round(b.eta) * 60_000 : Date.parse(b.eta ?? '');
  if (!Number.isFinite(eta)) throw Object.assign(new Error('Sett forventet tid hjem (eta)'), { status: 400 });
  if (eta < now - 60_000 || eta > now + 24 * 3600_000) throw Object.assign(new Error('Forventet tid må være innen 24 timer'), { status: 400 });
  const waitMin = [5, 10, 15, 30].includes(+b.waitMin) ? +b.waitMin : 15; // 1c: 5/10/15/30
  const mode = MODES.includes(b.mode) ? b.mode : MODE_ALIAS[b.mode] ?? null;
  const all = household(u);
  const recipients = Array.isArray(b.recipients) && b.recipients.length ? b.recipients.map(String).filter((id) => all.includes(id)) : all;
  if (b.phone !== undefined) { const ph = cleanPhone(b.phone); if (ph) kv.set(u, 'hjemlys_phone', ph); }
  const old = activeOf(u);
  if (old) touch(old.id, { state: 'ended', ended_at: now });
  const id = 'hl' + randomUUID().replace(/-/g, '').slice(0, 14);
  const pos = b.pos && Number.isFinite(+b.pos.lat) && Number.isFinite(+b.pos.lon) ? { lat: +b.pos.lat, lon: +b.pos.lon } : null;
  q('INSERT INTO hjemlys_sessions(id,user_id,state,eta,wait_min,mode,recipients,started_at,leg,start_lat,start_lon,last_lat,last_lon,last_pos_at,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, u, 'onTheWay', eta, waitMin, mode, JSON.stringify(recipients), now, b.leg ? String(b.leg).slice(0, 60) : null, pos?.lat ?? null, pos?.lon ?? null, pos?.lat ?? null, pos?.lon ?? null, pos ? now : null, now);
  if (pos) q('INSERT INTO hjemlys_pos(session_id, ts, lat, lon, acc) VALUES(?,?,?,?,?)').run(id, now, pos.lat, pos.lon, Number(b.pos.acc) || null);
  const s = row(id);
  await emit(s, 'start');
  return s;
}
async function goHome(s, now = Date.now(), why = 'manual') {
  const n = touch(s.id, { state: 'home', home_at: now, ended_at: now });
  await emit(n, 'home');
  for (const r of parse(s.recipients, [])) { try { await notifyUser(r, { title: 'Hjemlys', body: `${first(s.user_id)} er hjemme ${hhmm(now)}`, url: '/#/familie', category: 'familie', tag: `hjemlys-${s.id}`, data: { kind: 'hjemlys.home', sessionId: s.id, why } }); } catch { /* */ } }
  return n;
}
export async function patch40(s, b = {}, now = Date.now()) {
  const set = {}, stored = { pos: false };
  if (b.eta !== undefined) { const e = Date.parse(b.eta); if (!Number.isFinite(e) || e < now - 3600_000 || e > now + 24 * 3600_000) throw Object.assign(new Error('Ugyldig eta'), { status: 400 }); set.eta = e; }
  if (b.plus !== undefined) { const p = Math.round(+b.plus); if (!(p >= 1 && p <= 120)) throw Object.assign(new Error('plus må være 1–120 minutter'), { status: 400 }); set.eta = Math.max(s.eta, now) + p * 60_000; }
  if (set.eta && s.state === 'late') { set.state = 'onTheWay'; set.late_at = null; set.ok_prompt_at = null; }
  if (b.battery !== undefined) { const v = +b.battery; if (Number.isFinite(v)) set.battery = v > 1 ? Math.min(100, v) / 100 : Math.max(0, v); }
  if (b.signal !== undefined) set.signal = String(b.signal).slice(0, 20);
  if (b.unlockedAt !== undefined) { const t = Date.parse(b.unlockedAt); if (Number.isFinite(t)) set.unlocked_at = t; }
  if (b.leg !== undefined) set.leg = b.leg ? String(b.leg).slice(0, 60) : null;
  let home = b.wifiHome === true;
  if (b.pos && Number.isFinite(+b.pos.lat) && Number.isFinite(+b.pos.lon)) {
    const p = { lat: +b.pos.lat, lon: +b.pos.lon, acc: Number(b.pos.acc) || null };
    const last = s.last_lat != null ? { lat: s.last_lat, lon: s.last_lon } : null;
    const moved = last ? distM(last, p) : Infinity, age = s.last_pos_at ? (now - s.last_pos_at) / 1000 : Infinity;
    if (age >= POS_MIN_S || moved >= POS_MIN_M) {
      Object.assign(set, { last_lat: p.lat, last_lon: p.lon, last_acc: p.acc, last_pos_at: now, ...(s.start_lat == null ? { start_lat: p.lat, start_lon: p.lon } : {}) });
      q('INSERT INTO hjemlys_pos(session_id, ts, lat, lon, acc) VALUES(?,?,?,?,?)').run(s.id, now, p.lat, p.lon, p.acc);
      stored.pos = true;
    }
    const h = homeOf(s.user_id);
    if (h && distM(p, h) <= HOME_RADIUS_M) home = true;
  }
  let n = Object.keys(set).length ? touch(s.id, set) : s;
  if (home && ACTIVE.includes(n.state)) n = await goHome(n, now, b.wifiHome ? 'wifi' : 'geofence');
  else if (Object.keys(set).length) { if (set.eta) log40(n, 'plus'); await emit(n, 'update'); }
  return { s: n, stored };
}
export async function ok40(s, now = Date.now()) {
  const wasLate = s.state === 'late';
  const n = touch(s.id, { ok_at: now, ...(wasLate ? { state: 'onTheWay', late_at: null, eta: now + s.wait_min * 60_000 } : {}), ok_prompt_at: null });
  await emit(n, 'ok');
  if (wasLate) for (const r of parse(s.recipients, [])) { try { await notifyUser(r, { title: 'Hjemlys', body: `${first(s.user_id)} sier at alt er OK`, url: '/#/familie', category: 'familie', tag: `hjemlys-${s.id}`, data: { kind: 'hjemlys.ok', sessionId: s.id } }); } catch { /* */ } }
  return n;
}
export async function end40(s, now = Date.now()) { const n = touch(s.id, { state: 'ended', ended_at: now }); await emit(n, 'end'); return n; }

/** Jobben hvert minutt. → {prompted, late, pruned} */
export async function tick40(now = Date.now()) {
  let prompted = 0, late = 0;
  for (const s of q("SELECT * FROM hjemlys_sessions WHERE state='onTheWay'").all()) {
    if (now >= s.eta + s.wait_min * 60_000) {
      const n = touch(s.id, { state: 'late', late_at: now });
      late++;
      log40({ ...n, eta: n.eta }, 'late', now);
      const out = await sessionOut40(n, { now });
      broadcast('hjemlys', { action: 'late', session: out }, [s.user_id, ...parse(s.recipients, [])]);
      pushLive(n, 'late');
      const sh = out.share ?? {};
      const bits = [sh.battery != null ? `batteri ${Math.round(sh.battery * 100)} %` : null, sh.signal ? `dekning ${sh.signal}` : null, sh.with?.event ? `var på «${sh.with.event}»${sh.with.people?.length ? ` med ${sh.with.people.join(', ')}` : ''}` : null].filter(Boolean);
      for (const r of parse(s.recipients, [])) {
        try { await notifyUser(r, { title: `${first(s.user_id)} er ikke hjemme ennå`, body: `${out.lateMinutes} min over forventet tid${bits.length ? ` · ${bits.join(' · ')}` : ''}. Trykk for siste posisjon.`, url: '/#/familie', category: 'familie', tag: `hjemlys-${s.id}`, data: { kind: 'hjemlys.late', sessionId: s.id } }); } catch { /* */ }
      }
    } else if (now >= s.eta && !s.ok_prompt_at) {
      touch(s.id, { ok_prompt_at: now });
      prompted++;
      log40(s, 'prompt', now);
      try { await notifyUser(s.user_id, { title: 'Hjemlys · Alt OK?', body: `Du skulle vært hjemme ${hhmm(s.eta)}. Svar innen ${s.wait_min} min, ellers får familien beskjed.`, url: '/#/familie', category: 'familie', tag: `hjemlys-ok-${s.id}`, data: { kind: 'hjemlys.prompt', sessionId: s.id, actions: ['ok', 'plus10', 'home'] } }); } catch { /* */ }
    }
  }
  const pruned = q('DELETE FROM hjemlys_pos WHERE session_id IN (SELECT id FROM hjemlys_sessions WHERE ended_at IS NOT NULL AND ended_at < ?)').run(now - ROUTE_KEEP_MS).changes;
  return { prompted, late, pruned };
}

/** Glimt-forslag: kino/fest/konsert som slutter sent, etter kl. 22, eller natt. → {suggest, reason, eta, event?} */
export async function suggest40(u, now = Date.now()) {
  const h = +new Date(now).toLocaleString('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' });
  if (activeOf(u)) return { suggest: false, reason: 'Hjemlys er allerede på', eta: null };
  const evs = (await eventsOf(u, osloDate(now), osloDate(now))).filter((e) => !e.allDay);
  const SOCIAL = /\b(kino|fest|party|konsert|teater|bursdag|middag|vors|nachspiel|bar|pub|julebord|forestilling|kamp|date)\b/i;
  const late = evs.map((e) => ({ e, end: endMsOf(e) })).filter((x) => x.end && x.end >= now - 30 * 60_000 && x.end <= now + 4 * 3600_000)
    .filter((x) => SOCIAL.test(`${x.e.title ?? ''} ${x.e.desc ?? ''}`) || +new Date(x.end).toLocaleString('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }) >= 22)
    .sort((a, b) => a.end - b.end)[0];
  const recipients = household(u).map((id) => ({ userId: id, name: first(id) }));
  const names = recipients.map((r) => r.name);
  const who = names.length <= 1 ? names[0] ?? 'familien' : `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`;
  if (late) { const what = String(late.e.title ?? 'Avtalen').split(/\s+(?:med|på|hos)\s+/i)[0];
    return { suggest: true, reason: `${late.e.title ?? 'Avtalen'} slutter ${hhmm(late.end)}`, text: `${what} er ${late.end <= now ? 'ferdig' : `ferdig ${hhmm(late.end)}`}. Skal jeg si fra til ${who} når du er hjemme?`,
      recipients, eta: new Date(late.end + 30 * 60_000).toISOString(), event: { title: late.e.title ?? null, end: new Date(late.end).toISOString() } }; }
  if (h >= 22 || h < 4) return { suggest: true, reason: 'Sent på kvelden', text: `Det er sent. Skal jeg si fra til ${who} når du er hjemme?`, recipients, eta: new Date(now + 30 * 60_000).toISOString() };
  return { suggest: false, reason: null, eta: null };
}

/* ---------------- Rute hjem (1a) ---------------- */
// Uten reiseplanlegger-nøkkel: anslag fra luftlinje (× 1,3) – gå 5 km/t, sykkel 15 km/t, kollektiv 22 km/t + 6 min gange/venting.
// Ingen eksisterende Entur-reiseplanlegger i serveren (bare avganger), så legs er generelle («Kollektiv + gå»).
const MOCK_FROM = { name: 'Majorstuen', lat: 59.9296, lon: 10.7146 };
export function route40(u, { mode = null, lat = null, lon = null, from = null } = {}, now = Date.now()) {
  let pos = Number.isFinite(+lat) && lat !== null && Number.isFinite(+lon) && lon !== null ? { lat: +lat, lon: +lon, name: from ? String(from).slice(0, 60) : 'Din posisjon' } : null;
  if (!pos) { try { const p = q('SELECT lat, lon FROM family_pos WHERE user=? ORDER BY ts DESC LIMIT 1').get(u); if (p) pos = { ...p, name: 'Din posisjon' }; } catch { /* */ } }
  if (!pos && process.env.MOCK_DATA === '1') pos = MOCK_FROM;
  const home = homeOf(u) ?? (process.env.MOCK_DATA === '1' ? { lat: 59.9275, lon: 10.7160, name: 'Hjem' } : null);
  if (!pos || !home) return { from: pos ? { name: pos.name, km: null } : null, to: home ? { name: home.name ?? 'Hjem' } : null, options: [], error: !home ? 'Legg inn hjemmet som sone «Hjem» i Familie' : 'Fant ikke posisjonen din' };
  const km = Math.round((distM(pos, home) * 1.3) / 100) / 10;
  const opt = (m, label, legs, minutes) => ({ mode: m, label, legs, minutes, eta: new Date(now + minutes * 60_000).toISOString(), etaLabel: hhmm(now + minutes * 60_000).replace(':', '.') });
  const all = [
    opt('kollektiv', 'Kollektiv + gå', [{ kind: 'gå', minutes: 3 }, { kind: 'kollektiv', minutes: Math.max(2, Math.round((km / 22) * 60)) }, { kind: 'gå', minutes: 3 }], Math.max(5, Math.round((km / 22) * 60) + 6)),
    opt('gå', 'Gå', [{ kind: 'gå', minutes: Math.max(1, Math.round((km / 5) * 60)) }], Math.max(1, Math.round((km / 5) * 60))),
    opt('sykkel', 'Sykkel', [{ kind: 'sykkel', minutes: Math.max(1, Math.round((km / 15) * 60)) }], Math.max(1, Math.round((km / 15) * 60))),
  ];
  const want = MODE_ALIAS[mode] ? Object.entries(MODE_ALIAS).find(([k, v]) => v === MODE_ALIAS[mode] && ['kollektiv', 'gå', 'sykkel'].includes(k))?.[0] : mode;
  return { from: { name: pos.name, km }, fromText: `Fra ${pos.name} · ${String(km).replace('.', ',')} km`, to: { name: home.name ?? 'Hjem' }, estimated: true,
    options: want && all.some((o) => o.mode === want) ? all.filter((o) => o.mode === want) : all, geometry: [[pos.lat, pos.lon], [home.lat, home.lon]] };
}

/* ---------------- Ruter ---------------- */

export const hjemlys40Api = new Hono();
hjemlys40Api.use('*', authOrToken);
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const fail = (c, e) => c.json({ error: e.message }, e.status ?? 400);
const own = (c) => { const s = row(c.req.param('id')); return s && s.user_id === c.get('user') ? s : null; };

hjemlys40Api.post('/start', async (c) => { try { return c.json({ session: await sessionOut40(await start40(c.get('user'), await body(c))) }); } catch (e) { return fail(c, e); } });
hjemlys40Api.get('/', async (c) => {
  const u = c.get('user');
  const mine = activeOf(u) ?? q("SELECT * FROM hjemlys_sessions WHERE user_id=? AND state='home' AND home_at > ? ORDER BY home_at DESC LIMIT 1").get(u, Date.now() - 10 * 60_000);
  const hh = [];
  for (const id of household(u)) {
    const s = activeOf(id) ?? q("SELECT * FROM hjemlys_sessions WHERE user_id=? AND state='home' AND home_at > ? ORDER BY home_at DESC LIMIT 1").get(id, Date.now() - 10 * 60_000);
    const forMe = s && parse(s.recipients, []).includes(u);
    hh.push({ userId: id, name: first(id), avatar: avatarOf(id), phone: phoneOf40(id), state: s ? s.state : 'off', eta: s ? new Date(s.eta).toISOString() : null,
      since: s ? new Date(s.state === 'home' ? s.home_at : s.state === 'late' ? s.late_at : s.started_at).toISOString() : null,
      ...(s ? { sessionId: s.id } : {}), ...(s?.state === 'late' && forMe ? { share: await shareOf(s), lateMinutes: Math.max(0, Math.round((Date.now() - s.eta) / 60_000)) } : {}) });
  }
  return c.json({ mine: await sessionOut40(mine), household: hh });
});
// PUT /api/hjemlys/phone {phone} → {phone} (null fjerner)
hjemlys40Api.put('/phone', async (c) => {
  const b = await body(c);
  if (b.phone === null || b.phone === '') { kv.del(c.get('user'), 'hjemlys_phone'); return c.json({ phone: null }); }
  const ph = cleanPhone(b.phone);
  if (!ph) return c.json({ error: 'Ugyldig telefonnummer' }, 400);
  kv.set(c.get('user'), 'hjemlys_phone', ph);
  return c.json({ phone: ph });
});
hjemlys40Api.get('/suggest', async (c) => c.json(await suggest40(c.get('user'))));
hjemlys40Api.get('/route', async (c) => c.json(route40(c.get('user'), { mode: c.req.query('mode') ?? null, lat: c.req.query('lat'), lon: c.req.query('lon'), from: c.req.query('from') })));
// GET /api/hjemlys/:id/log → [{at, text, who, kind}] (eieren og mottakerne)
hjemlys40Api.get('/:id/log', (c) => {
  const s = row(c.req.param('id')), u = c.get('user');
  if (!s || (s.user_id !== u && !parse(s.recipients, []).includes(u))) return c.json({ error: 'Fant ikke økta' }, 404);
  return c.json(q('SELECT at, text, who, kind FROM hjemlys_log WHERE session_id=? ORDER BY id').all(s.id).map((x) => ({ at: new Date(x.at).toISOString(), text: x.text, who: x.who, kind: x.kind })));
});
hjemlys40Api.post('/tokens', async (c) => {
  const b = await body(c);
  if (!['ios', 'android'].includes(b.platform) || !['liveactivity', 'pushtostart', 'fcm'].includes(b.kind) || typeof b.token !== 'string' || !/^[\w:.\-+/=]{8,4096}$/.test(b.token)) return c.json({ error: 'Forventet {platform:ios|android, kind:liveactivity|pushtostart|fcm, token}' }, 400);
  const sid = b.sessionId ? String(b.sessionId).slice(0, 40) : null;
  q('INSERT INTO hjemlys_tokens(user_id, platform, kind, token, session_id, updated) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id, kind, token) DO UPDATE SET session_id=excluded.session_id, platform=excluded.platform, updated=excluded.updated')
    .run(c.get('user'), b.platform, b.kind, b.token, sid, Date.now());
  return c.json({ ok: true });
});
hjemlys40Api.patch('/:id', async (c) => {
  const s = own(c);
  if (!s) return c.json({ error: 'Fant ikke økta' }, 404);
  if (!ACTIVE.includes(s.state)) return c.json({ error: 'Økta er avsluttet', session: await sessionOut40(s) }, 409);
  try { const r = await patch40(s, await body(c)); return c.json({ session: await sessionOut40(r.s), stored: r.stored }); } catch (e) { return fail(c, e); }
});
for (const [path, fn] of [['ok', ok40], ['home', goHome], ['end', end40]]) {
  hjemlys40Api.post(`/:id/${path}`, async (c) => {
    const s = own(c);
    if (!s) return c.json({ error: 'Fant ikke økta' }, 404);
    if (!ACTIVE.includes(s.state)) return c.json({ session: await sessionOut40(s) });
    return c.json({ session: await sessionOut40(await fn(s)) });
  });
}

let timer = null;
export function startHjemlys40() { if (timer) return; timer = setInterval(() => { tick40().catch((e) => console.warn('[hjemlys]', e.message)); }, 60_000); timer.unref?.(); }
