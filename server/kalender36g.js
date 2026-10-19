// Prompt 36b: Google Kalender i Kalender-appen – velg hovedkalender (Personlig) og vis flere Google-kalendere som egne kalendere.
// Per bruker (samme Google-kobling som Bursdager, kv 'bd_google': mainCalendarId + extraCalendars).
//
// GET /api/kalender/calendars/google
//   → {connected, configured, email, main:{id, name}|null,
//      calendars:[{id:'primary'|'<google-id>', name, primary, color, writable, access, main, shown, appId:'g-…'|null}]}
//   Uten kobling: {connected:false, configured, calendars:[]}.
// PUT /api/kalender/calendars/google {main?:'primary'|'<google-id>', show?:['<google-id>', …]} → samme som GET
//   main = hovedkalenderen: hendelsene vises i Personlig, og nye hendelser i Personlig/Jobb/Helse … lagres der.
//   show = andre Google-kalendere som vises som egne kalendere (id 'g-…', badge 'Google', farge fra Google).
//   Lesetilgang gir writable:false. Hovedkalenderen kan ikke også stå i show.
// PATCH/DELETE /api/kalender/calendars/:id for 'g-…' (farge, visible, hidMenu / fjern fra visning) går via patchGoogleCal/removeGoogleCal.
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { googleConnected, googleConfOf, googleConfSet, googleCalendarList, calendarLinks } from './birthdays.js';
import { clearCalendarCache, googleExtraOf } from './calendar.js';
import { shades, PALETTE } from './kalender35.js';

const COLOR = /^#[0-9a-f]{6}$/i;
const MAX = 20;
const appIdOf = (calId) => `g-${createHash('sha1').update(String(calId)).digest('hex').slice(0, 10)}`;
export const isGoogleCalId = (id) => /^g-[0-9a-f]{10}$/.test(String(id ?? ''));

/** Google-kalendrene som vises i Kalender (samme form som appCalendarsOf). */
export function googleCalendarsOf(user) {
  if (!googleConnected(user)) return [];
  return googleExtraOf(user).map((x) => ({ id: x.id, key: x.id, name: x.name, color: x.color, ...shades(x.color), backend: 'privat', sources: ['google'],
    visible: x.visible !== false, hidMenu: !!x.hidMenu, builtin: false, writable: false, source: 'google', badge: 'Google', calId: x.calId, readOnly: !x.writable }));
}

const mainOf = (user) => { const g = googleConfOf(user); return g.mainCalendarId || g.calendarId || 'primary'; };

async function overview(user) {
  const links = calendarLinks(user).google;
  if (!googleConnected(user)) return { connected: false, configured: links.configured, email: null, main: null, calendars: [] };
  const list = await googleCalendarList(user);
  const main = mainOf(user);
  const shown = new Map(googleExtraOf(user).map((x) => [x.calId, x]));
  const calendars = list.map((x) => ({ ...x, main: x.id === main || x.googleId === main, shown: shown.has(x.id) || shown.has(x.googleId), appId: shown.get(x.id)?.id ?? shown.get(x.googleId)?.id ?? null }));
  const m = calendars.find((x) => x.main) ?? calendars.find((x) => x.primary) ?? null;
  return { connected: true, configured: links.configured, email: links.email, main: m ? { id: m.id, name: m.name } : null, calendars };
}

export const googleKalApi = new Hono();
const bad = (c, error, status = 400) => c.json({ error }, status);

googleKalApi.get('/', async (c) => {
  try { return c.json(await overview(c.get('user'))); } catch (e) { return bad(c, e.message || 'Kunne ikke hente Google-kalendere', e.status && e.status < 500 ? e.status : 502); }
});

googleKalApi.put('/', async (c) => {
  const user = c.get('user');
  if (!googleConnected(user)) return bad(c, 'Logg inn med Google først (Innstillinger → Kalendere)', 409);
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return bad(c, 'Ugyldig forespørsel');
  let list;
  try { list = await googleCalendarList(user); } catch (e) { return bad(c, e.message || 'Kunne ikke hente Google-kalendere', 502); }
  const find = (id) => list.find((x) => x.id === id || x.googleId === id);
  const patch = {};
  if (b.main !== undefined) {
    const m = find(String(b.main ?? ''));
    if (!m) return bad(c, 'Fant ikke kalenderen i Google-kontoen');
    if (!m.writable) return bad(c, 'Hovedkalenderen må være en kalender du kan skrive i');
    patch.mainCalendarId = m.id;
  }
  const main = patch.mainCalendarId ?? mainOf(user);
  if (b.show !== undefined) {
    if (!Array.isArray(b.show) || b.show.length > MAX || b.show.some((x) => typeof x !== 'string')) return bad(c, 'show må være en liste med kalender-id-er');
    const old = new Map(googleExtraOf(user).map((x) => [x.calId, x]));
    const used = new Set();
    const out = [];
    for (const id of b.show) {
      const g = find(id);
      if (!g) return bad(c, `Fant ikke kalenderen «${id}» i Google-kontoen`);
      if (g.id === main || out.some((x) => x.calId === g.id)) continue;
      const prev = old.get(g.id);
      let color = prev?.color ?? (COLOR.test(g.color ?? '') ? g.color.toLowerCase() : null);
      if (!color) color = PALETTE.find((p) => !used.has(p)) ?? PALETTE[out.length % PALETTE.length];
      used.add(color);
      out.push({ id: prev?.id ?? appIdOf(g.id), calId: g.id, name: g.name, color, visible: prev?.visible !== false, hidMenu: !!prev?.hidMenu, writable: g.writable });
    }
    patch.extraCalendars = out;
  } else if (patch.mainCalendarId) {
    patch.extraCalendars = googleExtraOf(user).filter((x) => x.calId !== patch.mainCalendarId);
  }
  googleConfSet(user, patch);
  clearCalendarCache(user);
  return c.json(await overview(user));
});

/** PATCH /api/kalender/calendars/g-… {name?, color?, visible?, hidMenu?} */
export function patchGoogleCal(user, id, b) {
  const list = googleExtraOf(user);
  const x = list.find((y) => y.id === id);
  if (!x) return { error: 'Fant ikke kalenderen', status: 404 };
  if (b.color !== undefined) { if (!COLOR.test(String(b.color))) return { error: 'Ugyldig farge' }; x.color = String(b.color).toLowerCase(); }
  if (b.name !== undefined) { const n = String(b.name ?? '').trim(); if (!n || n.length > 60) return { error: 'Ugyldig navn' }; x.name = n; }
  if (b.visible !== undefined) x.visible = !!b.visible;
  if (b.hidMenu !== undefined) x.hidMenu = !!b.hidMenu;
  googleConfSet(user, { extraCalendars: list });
  clearCalendarCache(user);
  return { calendar: googleCalendarsOf(user).find((y) => y.id === id) };
}
/** DELETE /api/kalender/calendars/g-… – slutter å vise kalenderen (ingenting slettes i Google). */
export function removeGoogleCal(user, id) {
  const list = googleExtraOf(user);
  if (!list.some((x) => x.id === id)) return false;
  googleConfSet(user, { extraCalendars: list.filter((x) => x.id !== id) });
  clearCalendarCache(user);
  return true;
}
