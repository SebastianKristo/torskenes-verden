// Prompt 45 (SERVER45): Media – slett filer som ikke er overvåket (claude-code-media-slett-uovervakede-episoder.md) og
// avspillingsstatistikk for mobil (claude-code-avspilling-statistikk-mobil.md). Se SERVER45-API.md.
//   GET    /api/media/unmonitored?service=sonarr|radarr&seriesId=&season= (admin) → liste + «Slette 12 episodefiler (8,4 GB) …?»
//   POST   /api/media/unmonitored/delete {service, fileIds, confirm:true, delaySec?} (admin) → 202 med Angre (eller 200 med delaySec:0)
//   GET    /api/media/unmonitored/pending/:id · DELETE …/:id (Angre)
//   GET    /api/playback/summary?range=7d|30d|year|all (tilgang til Media)
// Bare filer som FORTSATT er uovervåket når slettingen kjører, slettes (hentes på nytt fra Sonarr/Radarr). ?server= respekteres via
// mediaSiteMw44 (stedet huskes for den utsatte slettingen).
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { authOrToken } from './mobile.js';
import * as M from './media43.js';
import { stats44 } from './playback44.js';

const q = (sql) => db.prepare(sql);
const fail = (c, e) => M.mediaFail43(c, e instanceof M.MediaError ? e : Object.assign(new M.MediaError(e.message, e.status ?? 500)));
const A = [authOrToken, M.mediaGuard43, M.mediaAdmin43];

async function sonarrList({ seriesId = null, season = null } = {}) {
  const series = seriesId ? [await M.arr43('sonarr', 'GET', `/series/${+seriesId}`)] : await M.arr43('sonarr', 'GET', '/series');
  const items = [];
  for (const s of (Array.isArray(series) ? series : []).slice(0, 500)) {
    const eps = await M.arr43('sonarr', 'GET', '/episode', { query: { seriesId: s.id, includeEpisodeFile: true } });
    for (const e of Array.isArray(eps) ? eps : []) {
      if (e.monitored || !e.hasFile || !e.episodeFileId) continue;
      if (season != null && e.seasonNumber !== +season) continue;
      const size = e.episodeFile?.size ?? null;
      items.push({ fileId: e.episodeFileId, episodeId: e.id, seriesId: s.id, series: s.title, title: e.title ?? '', code: M.epCode43(e.seasonNumber, e.episodeNumber), season: e.seasonNumber, size, sizeText: M.sizeText43(size), quality: e.episodeFile?.quality?.quality?.name ?? null });
    }
  }
  return items;
}
async function radarrList({ movieId = null } = {}) {
  const movies = movieId ? [await M.arr43('radarr', 'GET', `/movie/${+movieId}`)] : await M.arr43('radarr', 'GET', '/movie');
  return (Array.isArray(movies) ? movies : []).filter((m) => m.monitored === false && m.hasFile && m.movieFile?.id).map((m) => ({ fileId: m.movieFile.id, movieId: m.id, title: m.title, year: m.year ?? null, size: m.movieFile.size ?? m.sizeOnDisk ?? null, sizeText: M.sizeText43(m.movieFile.size ?? m.sizeOnDisk), quality: m.movieFile.quality?.quality?.name ?? null }));
}
const nb = (n) => new Intl.NumberFormat('nb-NO').format(n);
function listOut(service, items, scope) {
  const size = items.reduce((a, x) => a + (x.size ?? 0), 0), n = items.length;
  const what = service === 'radarr' ? (n === 1 ? 'filmfil' : 'filmfiler') : n === 1 ? 'episodefil' : 'episodefiler';
  return { service, items, count: n, size, sizeText: M.sizeText43(size), scope, text: n ? `Slette ${nb(n)} ${what} (${M.sizeText43(size)}) som ikke er overvåket?` : `Ingen ${service === 'radarr' ? 'filmer' : 'episoder'} uten overvåking har filer.` };
}
export async function unmonitored45(service, qy = {}) {
  if (service === 'radarr') return listOut('radarr', await radarrList(qy), qy.movieId ? 'movie' : 'all');
  return listOut('sonarr', await sonarrList(qy), qy.season != null && qy.seriesId ? 'season' : qy.seriesId ? 'series' : 'all');
}

const pending = new Map(); // id → {state, service, fileIds, site, user, timer, deleted, failed, at}
async function execDelete(service, fileIds) {
  // Hent på nytt: slett bare det som fortsatt er uovervåket med fil.
  const now = new Set((await unmonitored45(service)).items.map((x) => x.fileId));
  const ok = [], failed = [];
  for (const id of fileIds) {
    if (!now.has(id)) { failed.push({ fileId: id, error: 'Ikke lenger uovervåket (eller allerede slettet)' }); continue; }
    try { await M.arr43(service, 'DELETE', service === 'radarr' ? `/moviefile/${id}` : `/episodefile/${id}`); ok.push(id); } catch (e) { failed.push({ fileId: id, error: e.message }); }
  }
  M.clearMedia43(`${service}:`); M.clearMedia43('cal');
  console.log(`media.delete-unmonitored service=${service} deleted=${ok.length} failed=${failed.length}`);
  return { deleted: ok.length, deletedIds: ok, failed };
}
const sweep = () => { const t = Date.now(); for (const [k, v] of pending) if (t - v.at > 3600_000) pending.delete(k); };

export const media45Api = new Hono();
media45Api.get('/unmonitored', ...A, async (c) => {
  const service = c.req.query('service') === 'radarr' ? 'radarr' : 'sonarr';
  const qs = c.req.query();
  try { return c.json(await unmonitored45(service, { seriesId: qs.seriesId ? +qs.seriesId : null, season: qs.season !== undefined && qs.season !== '' ? +qs.season : null, movieId: qs.movieId ? +qs.movieId : null })); } catch (e) { return fail(c, e); }
});
media45Api.post('/unmonitored/delete', ...A, async (c) => {
  if (c.get('actor')) return c.json({ error: 'Ikke tilgjengelig mens du er logget inn som en annen bruker' }, 403);
  const b = await c.req.json().catch(() => ({})) ?? {};
  if (b.confirm !== true) return c.json({ error: 'Bekreft slettingen ({confirm:true})', needsConfirm: true }, 400);
  const service = b.service === 'radarr' ? 'radarr' : 'sonarr';
  const ids = [...new Set((Array.isArray(b.fileIds) ? b.fileIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 2000);
  if (!ids.length) return c.json({ error: 'Velg minst én fil (fileIds)' }, 400);
  const delay = b.delaySec === undefined ? 8 : Math.max(0, Math.min(30, Math.round(Number(b.delaySec) || 0)));
  let list; try { list = await unmonitored45(service); } catch (e) { return fail(c, e); }
  const byId = new Map(list.items.map((x) => [x.fileId, x]));
  const valid = ids.filter((id) => byId.has(id));
  if (!valid.length) return c.json({ error: 'Ingen av filene er uovervåket lenger' }, 409);
  const size = valid.reduce((a, id) => a + (byId.get(id).size ?? 0), 0);
  const what = service === 'radarr' ? 'filmfiler' : 'episodefiler';
  if (!delay) { try { const r = await execDelete(service, valid); return c.json({ ok: true, ...r, sizeText: M.sizeText43(size), message: `Slettet ${r.deleted} ${what} (${M.sizeText43(size)})` }); } catch (e) { return fail(c, e); } }
  sweep();
  const id = randomBytes(9).toString('base64url'), site = M.mediaSite43();
  const p = { state: 'pending', service, fileIds: valid, site, user: c.get('user'), at: Date.now(), deleted: 0, failed: [] };
  p.timer = setTimeout(() => {
    if (p.state !== 'pending') return;
    p.state = 'running';
    M.runMediaSite43(site, () => execDelete(service, valid)).then((r) => Object.assign(p, r, { state: 'done' })).catch((e) => Object.assign(p, { state: 'failed', error: e.message }));
  }, delay * 1000);
  p.timer.unref?.();
  pending.set(id, p);
  return c.json({ ok: true, pendingId: id, executesAt: new Date(Date.now() + delay * 1000).toISOString(), count: valid.length, sizeText: M.sizeText43(size), skipped: ids.length - valid.length,
    undo: { label: 'Angre', method: 'DELETE', path: `/api/media/unmonitored/pending/${id}`, ms: delay * 1000 }, message: `Sletter ${valid.length} ${what} (${M.sizeText43(size)}) om ${delay} s` }, 202);
});
const pendOut = (p) => ({ state: p.state, service: p.service, count: p.fileIds.length, deleted: p.deleted, failed: p.failed, ...(p.error ? { error: p.error } : {}),
  message: p.state === 'cancelled' ? 'Slettingen er angret' : p.state === 'done' ? `Slettet ${p.deleted} ${p.service === 'radarr' ? 'filmfiler' : 'episodefiler'}` : p.state === 'failed' ? `Slettingen feilet: ${p.error}` : 'Venter …' });
media45Api.get('/unmonitored/pending/:id', ...A, (c) => { const p = pending.get(c.req.param('id')); return p ? c.json(pendOut(p)) : c.json({ error: 'Fant ikke slettingen' }, 404); });
media45Api.delete('/unmonitored/pending/:id', ...A, (c) => {
  const p = pending.get(c.req.param('id'));
  if (!p) return c.json({ error: 'Fant ikke slettingen' }, 404);
  if (p.state !== 'pending') return c.json({ error: p.state === 'cancelled' ? 'Allerede angret' : 'For sent å angre – filene er slettet', ...pendOut(p) }, 409);
  clearTimeout(p.timer); p.state = 'cancelled';
  return c.json({ ok: true, ...pendOut(p) });
});

/* ---------------- Avspilling: mobilstatistikk ---------------- */

const RANGES = [['7d', '7 d', 7], ['30d', '30 d', 30], ['year', 'År', 365], ['all', 'Alt', null]];
const WD = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const hrs = (ms) => Math.round((ms / 3600_000) * 10) / 10;
const hText = (h) => `${String(h).replace('.', ',')} t`;
export function playbackSummary45(range = '7d', now = Date.now()) {
  try { stats44('7d'); } catch { /* sår demodata i MOCK */ }
  const r = RANGES.find((x) => x[0] === range) ?? RANGES[0];
  const since = r[2] ? now - r[2] * 86400_000 : 0;
  const rows = q('SELECT * FROM plays44 WHERE started>? ORDER BY started DESC').all(since);
  const dur = (x) => Math.max(0, (x.stopped ?? x.seen) - x.started);
  const group = (key) => { const m = new Map(); for (const x of rows) { const k = key(x); if (!k) continue; const g = m.get(k) ?? { plays: 0, ms: 0, x }; g.plays++; g.ms += dur(x); m.set(k, g); } return [...m.entries()].sort((a, b) => b[1].plays - a[1].plays || b[1].ms - a[1].ms); };
  const perDay = new Map();
  const days = r[2] && r[2] <= 31 ? r[2] : null;
  if (days) for (let i = days - 1; i >= 0; i--) perDay.set(new Date(now - i * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }), 0);
  for (const x of rows) { const d = new Date(x.started).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }); const k = days ? d : d.slice(0, 7); if (days && !perDay.has(k)) continue; perDay.set(k, (perDay.get(k) ?? 0) + 1); }
  const totalMs = rows.reduce((a, x) => a + dur(x), 0), n = rows.length || 1;
  const users = group((x) => x.user), devices = group((x) => `${x.device ?? ''}|${x.platform ?? ''}`);
  return { range: r[0], ranges: RANGES.map(([id, label]) => ({ id, label, selected: id === r[0] })),
    total: { plays: rows.length, hours: hrs(totalMs), hoursText: hText(hrs(totalMs)), users: users.length, titles: new Set(rows.map((x) => x.title)).size },
    perDay: [...perDay.entries()].sort().map(([date, count]) => ({ date, count, label: days ? WD[new Date(`${date}T12:00:00Z`).getUTCDay()] : date.slice(5) })),
    topShows: group((x) => (x.kind === 'episode' ? x.title : null)).slice(0, 8).map(([title, g]) => ({ title, plays: g.plays, hours: hrs(g.ms), poster: g.x.poster ?? null })),
    topMovies: group((x) => (x.kind === 'movie' ? x.title : null)).slice(0, 8).map(([title, g]) => ({ title, plays: g.plays, hours: hrs(g.ms), poster: g.x.poster ?? null })),
    perUser: users.map(([name, g]) => ({ name, initial: String(name)[0]?.toUpperCase() ?? '?', plays: g.plays, hours: hrs(g.ms), hoursText: hText(hrs(g.ms)) })),
    perDevice: devices.map(([k, g]) => { const [name, platform] = k.split('|'); return { name: name || platform || 'Ukjent', platform: platform || null, plays: g.plays, pct: Math.round((g.plays / n) * 100) }; }).slice(0, 10),
    history: rows.slice(0, 20).map((x) => ({ id: x.id, server: x.server, when: new Date(x.started).toISOString(), whenText: new Date(x.started).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), title: x.title, subtitle: x.subtitle ?? null, user: x.user, device: x.device ?? null, platform: x.platform ?? null, percent: x.percent ?? 0, poster: x.poster ?? null })),
    empty: !rows.length, emptyText: rows.length ? null : 'Ingen avspillinger i perioden' };
}
export const playback45Api = new Hono();
playback45Api.get('/summary', authOrToken, async (c, next) => { if (!M.mediaAllowed43(c.get('user'))) return c.json({ error: 'Du har ikke tilgang til Avspilling. Be en administrator om tilgang.', restricted: true }, 403); return c.json(playbackSummary45(c.req.query('range'))); });
