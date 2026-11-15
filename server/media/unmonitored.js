// Prompt 45 (SERVER45): Media – slett filer som ikke er overvåket (claude-code-media-slett-uovervakede-episoder.md). Se SERVER45-API.md.
// (Avspillingssammendraget for mobil, GET /api/playback/summary, ligger i playback.js.)
//   GET    /api/media/unmonitored?service=sonarr|radarr&seriesId=&season= (admin) → liste + «Slette 12 episodefiler (8,4 GB) …?»
//   POST   /api/media/unmonitored/delete {service, fileIds, confirm:true, delaySec?} (admin) → 202 med Angre (eller 200 med delaySec:0)
//   GET    /api/media/unmonitored/pending/:id · DELETE …/:id (Angre)
// Bare filer som FORTSATT er uovervåket når slettingen kjører, slettes (hentes på nytt fra Sonarr/Radarr). ?server= respekteres via
// mediaSiteMw44 (stedet huskes for den utsatte slettingen).
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { authOrToken } from '../mobile.js';
import * as M from './arr.js';

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
