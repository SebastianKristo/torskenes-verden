// Prompt 51 (MEDFAM51): fase 4 – Familie og Media (server). API-formene står i SERVER51-API.md (seksjon MEDFAM51) og
// brukerveiledningen i docs/media-familie-51.md.
//   Familie: /api/famcal51/*  – felles familiekalender med «hvem kjører?» (henting/bringing, tildeling, varsel, Ruter-forslag)
//   Media:   /api/media51/*   – «Hva skal vi se i kveld?», norske undertekster (Bazarr), lagring med anbefaling (admin), lydbøker og
//                               podkaster (Audiobookshelf) med «fortsett der du slapp»
// Tilgang: familiekalenderen er felles for alle innloggede (familien = brukerne på serveren). Media krever Media-tilgang
// (mediaAllowed43); lagring og sletting bare admin. Nøkler til Bazarr/Audiobookshelf står bare i .env og sendes aldri ut.
import { Hono } from 'hono';
import { kv } from '../db.js';
import { isAdmin } from '../auth.js';
import { authOrToken as authOrToken0 } from '../mobile.js';
import { mediaAllowed43 } from '../media43.js';
import { body, bad, ymd, DAY, MIN, clean } from './common.js';
import * as FC from './famcal.js';
import { tonight51, whoHome51, plexNameOf51 } from './tonight.js';
import { subsStatus51, subsItem51, subsSearch51, subsWanted51 } from './subs.js';
import { storage51, scheduleDelete51, undoDelete51, deletions51, sweepDeletions51, trashList51, emptyTrash51 } from './storage.js';
import { audioStatus51, audioContinue51, audioCover51, setAbsUser51 } from './audio.js';

const authOrToken = (c, next) => authOrToken0(c, next); // sen binding
const idOf = (c, k = 'id') => { const n = +c.req.param(k); return Number.isInteger(n) && n > 0 ? n : null; };
const res = (c, r, ok = 200) => (r.error ? bad(c, r.error, r.status ?? 400, r.code ? { code: r.code } : {}) : c.json(r, ok));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------------- Familiekalender ---------------- */

export const famcal51Api = new Hono();
famcal51Api.use('*', authOrToken);
famcal51Api.get('/events', (c) => {
  const v = c.get('user');
  const from = DATE.test(c.req.query('from') ?? '') ? c.req.query('from') : ymd(Date.now() - DAY);
  const to = DATE.test(c.req.query('to') ?? '') ? c.req.query('to') : ymd(Date.parse(`${from}T12:00:00Z`) + 30 * DAY);
  if (Date.parse(to) - Date.parse(from) > 120 * DAY || to < from) return bad(c, 'Perioden kan være maks 120 dager');
  const events = FC.listEvents51(v, from, to);
  return c.json({ from, to, events, members: FC.members51(v), home: FC.homeOf51(v), needsDriver: events.reduce((a, e) => a + e.needsDriver, 0), kinds: Object.entries(FC.KINDS51).map(([id, label]) => ({ id, label })) });
});
famcal51Api.post('/events', async (c) => res(c, await FC.createEvent51(c.get('user'), await body(c)), 201));
famcal51Api.get('/events/:id', (c) => { const e = FC.getEvent51(idOf(c)); return e ? c.json({ event: FC.eventOut51(e, c.get('user')) }) : bad(c, 'Fant ikke hendelsen', 404); });
famcal51Api.patch('/events/:id', async (c) => res(c, FC.patchEvent51(c.get('user'), idOf(c), await body(c))));
famcal51Api.delete('/events/:id', (c) => res(c, FC.deleteEvent51(c.get('user'), idOf(c))));
famcal51Api.post('/events/:id/tasks', async (c) => res(c, await FC.addTask51(c.get('user'), idOf(c), await body(c)), 201));
famcal51Api.patch('/tasks/:id', async (c) => res(c, await FC.patchTask51(c.get('user'), idOf(c), await body(c))));
famcal51Api.post('/tasks/:id/claim', async (c) => res(c, await FC.patchTask51(c.get('user'), idOf(c), { assignee: c.get('user') })));
famcal51Api.post('/tasks/:id/release', async (c) => {
  const t = FC.getTask51(idOf(c));
  if (!t) return bad(c, 'Fant ikke oppgaven', 404);
  if (t.assignee && t.assignee !== c.get('user') && !isAdmin(c.get('user'))) return bad(c, 'Bare sjåføren selv kan si fra seg oppgaven', 403);
  return res(c, await FC.patchTask51(c.get('user'), t.id, { assignee: null }));
});
famcal51Api.post('/tasks/:id/done', async (c) => res(c, await FC.patchTask51(c.get('user'), idOf(c), { status: 'done' })));
famcal51Api.delete('/tasks/:id', (c) => res(c, FC.deleteTask51(c.get('user'), idOf(c))));
famcal51Api.get('/tasks/:id/ruter', async (c) => {
  const t = FC.getTask51(idOf(c));
  if (!t) return bad(c, 'Fant ikke oppgaven', 404);
  return c.json(await FC.ruterFor51(t, c.get('user')));
});
famcal51Api.get('/drives', (c) => c.json(FC.drives51(c.get('user'), { mine: c.req.query('mine') === '1', days: Math.max(1, Math.min(60, +(c.req.query('days') ?? 14) || 14)) })));
famcal51Api.get('/settings', (c) => c.json({ inCalendar: kv.get(c.get('user'), 'famcal51_in_calendar', true) !== false }));
famcal51Api.put('/settings', async (c) => { const b = await body(c); if (typeof b.inCalendar === 'boolean') kv.set(c.get('user'), 'famcal51_in_calendar', b.inCalendar); return c.json({ inCalendar: kv.get(c.get('user'), 'famcal51_in_calendar', true) !== false }); });

/* ---------------- Media ---------------- */

export const media51Api = new Hono();
media51Api.use('*', authOrToken);
media51Api.use('*', async (c, next) => { if (!mediaAllowed43(c.get('user'))) return bad(c, 'Du har ikke tilgang til Media. Be en administrator om tilgang.', 403, { restricted: true }); await next(); });
const admin = async (c, next) => { if (!isAdmin(c.get('user'))) return bad(c, 'Bare administratorer kan se og rydde lagringen', 403, { restricted: true }); await next(); };
const fail = (c, e) => bad(c, e?.message ?? 'Noe gikk galt', e?.status && e.status >= 400 && e.status < 600 ? e.status : 502);

// I kveld
media51Api.get('/tonight', async (c) => {
  const who = String(c.req.query('who') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
  try {
    return c.json(await tonight51(c.get('user'), { minutes: c.req.query('minutes'), genre: c.req.query('genre'), kind: c.req.query('kind'), who, limit: c.req.query('limit'), phrase: c.req.query('phrase') === '1' }));
  } catch (e) { return fail(c, e); }
});
media51Api.get('/tonight/home', (c) => c.json(whoHome51(c.get('user'))));
media51Api.get('/tonight/profile', (c) => c.json({ plexUser: kv.get(c.get('user'), 'medfam51_plex_user', null), names: plexNameOf51(c.get('user')) }));
media51Api.put('/tonight/profile', async (c) => {
  const b = await body(c), n = clean(b.plexUser, 64);
  if (n) kv.set(c.get('user'), 'medfam51_plex_user', n); else kv.del(c.get('user'), 'medfam51_plex_user');
  return c.json({ plexUser: n || null, names: plexNameOf51(c.get('user')) });
});

// Undertekster
const KIND = { movie: 'movie', film: 'movie', episode: 'episode' };
media51Api.get('/subs/status', async (c) => c.json(await subsStatus51()));
media51Api.get('/subs/wanted', async (c) => { try { return c.json(await subsWanted51()); } catch (e) { return fail(c, e); } });
media51Api.get('/subs/:kind/:id', async (c) => {
  const k = KIND[c.req.param('kind')], id = idOf(c);
  if (!k || !id) return bad(c, 'Bruk /subs/movie/:radarrId eller /subs/episode/:sonarrEpisodeId');
  try { return c.json(await subsItem51(k, id)); } catch (e) { return fail(c, e); }
});
media51Api.post('/subs/:kind/:id/search', async (c) => {
  const k = KIND[c.req.param('kind')], id = idOf(c);
  if (!k || !id) return bad(c, 'Bruk /subs/movie/:radarrId/search eller /subs/episode/:sonarrEpisodeId/search');
  try { return c.json(await subsSearch51(k, id), 202); } catch (e) { return fail(c, e); }
});

// Lydbøker og podkaster
media51Api.get('/audio/status', async (c) => c.json(await audioStatus51()));
media51Api.get('/audio/continue', async (c) => { try { return c.json(await audioContinue51(c.get('user'), { limit: +(c.req.query('limit') ?? 10) || 10 })); } catch (e) { return fail(c, e); } });
media51Api.put('/audio/me', async (c) => { try { return res(c, await setAbsUser51(c.get('user'), (await body(c)).absUser)); } catch (e) { return fail(c, e); } });
media51Api.get('/audio/cover/:id', async (c) => {
  try {
    const r = await audioCover51(c.req.param('id'));
    if (!r) return c.body(null, 404);
    return c.body(r.buf, 200, { 'Content-Type': r.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  } catch { return c.body(null, 404); }
});

// Lagring (admin)
media51Api.get('/storage', admin, async (c) => { try { return c.json(await storage51()); } catch (e) { return fail(c, e); } });
media51Api.post('/storage/delete', admin, async (c) => { const r = await scheduleDelete51(c.get('user'), await body(c)); return res(c, r, 202); });
media51Api.get('/storage/deletions', admin, (c) => c.json({ deletions: deletions51() }));
media51Api.post('/storage/deletions/:id/undo', admin, async (c) => res(c, await undoDelete51(idOf(c))));
media51Api.get('/storage/trash', admin, async (c) => c.json(await trashList51()));
media51Api.post('/storage/trash/empty', admin, async (c) => res(c, await emptyTrash51(await body(c))));

// Samlet status (hvilke deler som er satt opp) for Media-siden
media51Api.get('/status', async (c) => {
  const [subs, audio] = await Promise.all([subsStatus51(), audioStatus51()]);
  return c.json({ subs: { configured: subs.configured, reachable: subs.reachable, text: subs.text, ...(subs.mock ? { mock: true } : {}) }, audio: { configured: audio.configured, reachable: audio.reachable, text: audio.text, ...(audio.mock ? { mock: true } : {}) }, admin: isAdmin(c.get('user')) });
});

/* ---------------- Montering og jobber ---------------- */

export function mountMedfam51(app) {
  app.route('/api/famcal51', famcal51Api);
  app.route('/api/media51', media51Api);
}
let timer = null;
export function startMedfam51() {
  if (timer) return;
  const tick = async () => {
    try { await FC.sweepFamcal51(); } catch (e) { console.warn('[famcal51] påminnelser:', e.message); }
    try { await sweepDeletions51(); } catch (e) { console.warn('[media51] sletting:', e.message); }
  };
  timer = setInterval(tick, 5 * MIN);
  timer.unref?.();
  setTimeout(tick, 30_000).unref?.();
}
export { sweepDeletions51 } from './storage.js';
export { sweepFamcal51 } from './famcal.js';
