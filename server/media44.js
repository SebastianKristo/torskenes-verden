// Prompt 44 (SERVER44): Media – flere servere per sted, felles status, interaktivt søk som jobb, slett fil, søk i biblioteket.
// Spesifikasjon: claude-code-media-arr.md, claude-code-media-interaktivt-sok-504.md, claude-code-media-mobil-ikke-innlogget.md.
//
// Den ekte årsaken til «ikke logget inn» i Media på mobil (se også mediaSource43 i media43.js):
//   Sonarr, Radarr, Plex og Jellyfin er «personlige» integrasjoner (ISO2). Innstillinger → Integrasjoner viser verdiene til den
//   som er innlogget, mens Media leste eierens (OWNER) – og de gamle rutene /api/media/now|recent|history (Plex/Jellyfin,
//   «Spilles nå») leste den innloggedes egne og svarte {configured:false} for alle andre. To kilder til samme spørsmål. Nå:
//   - Media bruker serverens oppsett for alle med tilgang (eierens verdier, ellers første admin som har lagt dem inn).
//   - GET /api/integrations/status og GET /api/media/status har samme felt: {service, site, connected, state, lastOk, error, source}.
//   - /api/media/now|recent|history: har brukeren ikke egne Plex/Jellyfin-verdier, men tilgang til Media, brukes serverens.
//   Den ekte årsaken til «Feil 504» i interaktivt søk: /release fikk samme grense (15 s) som alle andre kall. Se media43.js.
//
// Ruter (alle krever innlogging + modulen «media»; endringer av servere bare admin):
//   GET    /api/media/servers[?status=1]       → [{id, name, color, default, builtin, selected, sonarr, radarr, qbit, prowlarr}]
//            tjeneste: {configured, url?(admin), user?(admin, qbit), status?:{ok, ms, version, text}}
//   POST   /api/media/servers {name, color?, sonarr:{url,key}, radarr:{url,key}, qbit:{url,user,pass}, prowlarr:{url,key}} (admin) → {server}
//   PUT    /api/media/servers/:id {…samme, delvis; tom nøkkel = behold} (admin) → {server}
//   DELETE /api/media/servers/:id (admin, ikke «hjemme») → {ok}
//   PUT    /api/media/servers/select {id} → {selected, server}   (lagres per bruker, kv media44_site)
//   POST   /api/media/servers/:id/test → {id, results:{sonarr|radarr|qbittorrent|prowlarr:{ok, ms, version, message}}}
//   ?server=<id> på alle /api/media/*-kall velger sted for det kallet; uten bruker det brukerens valg. Mangler stedet en tjeneste,
//   brukes standard (Hjemme) og svaret har X-Media-Fallback: <tjeneste> (status: fallback:true, requestedSite).
//   GET    /api/integrations/status → {items:[{service, name, site, siteName, configured, connected, state:'ok'|'missing'|'down',
//            lastOk, error, version, ms, source:'server', fallback?}], site, sites:[{id,name}], restricted?}
//   POST   /api/media/release/search {service?, episodeId|movieId|seriesId+seasonNumber, force?} → 202 {jobId, cached, state}
//          (også POST /api/media/search {kind:'episode'|'movie'|'season', id, season?})
//   GET    /api/media/release/search/:jobId → jobb (se jobOut)  ·  GET …/:jobId/events (SSE)  ·  DELETE …/:jobId (avbryt)
//          SSE-hendelser: snapshot, indexer.start {id,name}, indexer.done {id,name,count,ms}, indexer.fail {id,name,error},
//          partial {count}, done {releases, result}, failed {error}
//   DELETE /api/media/episodes/:id/file (admin) → {ok, episodeId, episodeFileId, monitored:false, undo:{method,path,body}, message}
//   DELETE /api/media/movies/:id/file   (admin) → {ok, movieId, movieFileId, monitored:false, undo, message}
//   GET    /api/media/series?q= · /api/media/movies?q= → samme svar, items filtrert på tittel/nettverk/år (counts uten søk), q, matches
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomUUID } from 'node:crypto';
import { kv, OWNER } from './db.js';
import { isAdmin, sessionUser } from './auth.js';
import { tokenAccessOf } from './finans/routes.js';
import { authOrToken } from './mobile.js';
import { userCfgSet } from './settings.js';
import * as M from './media43.js';

const SERVICES = ['sonarr', 'radarr', 'qbit', 'prowlarr'];
const DEFAULT_SITE = 'hjemme';
const SITES = 'media44_sites';

/* ---------------- Steder ---------------- */

const sitesRaw = () => { const v = kv.get(OWNER, SITES, []); return Array.isArray(v) ? v : []; };
const siteById = (id) => sitesRaw().find((x) => x.id === id) ?? null;
// media43 spør: (sted, tjeneste) → {url, key, user} | null. '*' = finnes stedet (og er ikke standard)?
M._setSiteConf43((site, svc) => {
  if (!site || site === DEFAULT_SITE) return null;
  const s = siteById(site);
  if (!s) return null;
  if (svc === '*') return true;
  const x = s[svc];
  return x?.url && x?.key ? { url: x.url, key: x.key, user: x.user ?? '' } : null;
});
const slug = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
const COLORS = ['#2f6b4a', '#2b5d8a', '#a0671a', '#6b3b2e', '#5a4a6b'];
const okUrl = (v) => /^https?:\/\/[^\s/]+(\/\S*)?$/i.test(String(v ?? '').trim());
const svcId = (s) => (s === 'qbittorrent' ? 'qbit' : s);
const svcOut = (s) => (s === 'qbit' ? 'qbittorrent' : s);
export const selectedSite44 = (u) => { const v = u ? kv.get(u, 'media44_site', null) : null; return v && (v === DEFAULT_SITE || siteById(v)) ? v : DEFAULT_SITE; };

/** Tjenestedelen av et sted til klienten. Nøkler sendes aldri; adresse og bruker bare til admin. */
function serviceOut(site, svc, admin) {
  if (site === DEFAULT_SITE) {
    const c = M.runMediaSite43(null, () => M.svcConf43(svc));
    return { configured: !!c.configured || !!c.mock, ...(c.mock ? { mock: true } : {}), ...(admin && c.configured ? { url: c.url, ...(svc === 'qbit' ? { user: c.user } : {}) } : {}) };
  }
  const x = siteById(site)?.[svc] ?? {};
  return { configured: !!(x.url && x.key), ...(admin && x.url ? { url: x.url, ...(svc === 'qbit' ? { user: x.user ?? '' } : {}) } : {}) };
}
async function statusOf(site, svc) {
  return M.runMediaSite43(site === DEFAULT_SITE ? null : site, async () => {
    const c = M.svcConf43(svc);
    if (!c.on || (site !== DEFAULT_SITE && c.fallback)) return { ok: false, text: 'Ikke satt opp' };
    const t = await M.mediaTest43(svc);
    return { ok: t.ok, ms: t.ms ?? null, version: t.version ?? null, text: t.ok ? `Tilkoblet · ${t.ms} ms` : t.message };
  });
}
async function serversOut(u, withStatus = false) {
  const admin = isAdmin(u), sel = selectedSite44(u);
  const list = [{ id: DEFAULT_SITE, name: kv.get(OWNER, 'media44_default_name', 'Hjemme'), color: COLORS[0], default: true, builtin: true }, ...sitesRaw().map((s) => ({ id: s.id, name: s.name, color: s.color, default: false, builtin: false }))];
  return Promise.all(list.map(async (s) => {
    const out = { ...s, selected: s.id === sel };
    for (const svc of SERVICES) {
      out[svc] = serviceOut(s.id, svc, admin);
      if (withStatus) out[svc].status = await statusOf(s.id, svc).catch((e) => ({ ok: false, text: e.message }));
    }
    out.qbittorrent = out.qbit; // samme objekt under begge navn
    out.missing = SERVICES.filter((svc) => !out[svc].configured).map(svcOut);
    return out;
  }));
}
function siteInput(b, cur = {}) {
  const out = { ...cur };
  if (b.name !== undefined) { const n = String(b.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 30); if (!n) throw Object.assign(new Error('Gi serveren et navn'), { status: 400 }); out.name = n; }
  if (b.color !== undefined) { if (!/^#[0-9a-f]{6}$/i.test(String(b.color))) throw Object.assign(new Error('Fargen må være #rrggbb'), { status: 400 }); out.color = b.color; }
  for (const svc0 of [...SERVICES, 'qbittorrent']) {
    const v = b[svc0]; if (v === undefined) continue;
    const svc = svcId(svc0);
    if (v === null) { delete out[svc]; continue; }
    if (typeof v !== 'object' || Array.isArray(v)) throw Object.assign(new Error(`${svc0} må være et objekt {url, key}`), { status: 400 });
    const x = { ...(out[svc] ?? {}) };
    if (v.url !== undefined) { const url = String(v.url ?? '').trim().replace(/\/+$/, ''); if (url && !okUrl(url)) throw Object.assign(new Error(`${M.SERVICES43[svc].name}: ugyldig adresse`), { status: 400, field: `${svc0}.url` }); x.url = url; }
    const key = v.key ?? v.apiKey ?? v.pass ?? v.password;
    if (key !== undefined && String(key).trim() !== '') x.key = String(key).trim().slice(0, 400); // tom = behold
    if (v.user !== undefined) x.user = String(v.user ?? '').trim().slice(0, 80);
    out[svc] = x;
  }
  return out;
}
const publicSite = (s, admin) => ({ id: s.id, name: s.name, color: s.color, ...Object.fromEntries(SERVICES.map((svc) => [svc, serviceOut(s.id, svc, admin)])) });

/* ---------------- Felles status (Innstillinger og Media) ---------------- */

/** GET /api/integrations/status – samme felt som /api/media/status, for valgt sted. */
export async function integrationsStatus44(u, site = selectedSite44(u)) {
  if (!M.mediaAllowed43(u)) return { items: [], restricted: true, site, sites: [] };
  const st = await M.runMediaSite43(site === DEFAULT_SITE ? null : site, () => M.mediaStatusOut43(u));
  const sites = [{ id: DEFAULT_SITE, name: kv.get(OWNER, 'media44_default_name', 'Hjemme') }, ...sitesRaw().map((s) => ({ id: s.id, name: s.name }))];
  const siteName = sites.find((s) => s.id === site)?.name ?? 'Hjemme';
  const items = st.services.map((x) => ({ service: x.service, name: x.name, site: x.fallback ? DEFAULT_SITE : site, siteName: x.fallback ? 'Hjemme' : siteName, configured: x.configured, connected: !!x.connected,
    state: x.state, lastOk: x.lastOk, error: x.error ?? null, version: x.version ?? null, ms: x.ms ?? null, source: 'server', ...(x.fallback ? { fallback: true, requestedSite: x.requestedSite } : {}), ...(x.mock ? { mock: true } : {}) }));
  const down = items.filter((x) => x.configured && !x.connected).map((x) => x.name);
  return { items, site, siteName, sites, text: down.length ? `${down.join(', ')} svarer ikke` : 'Alt er koblet til' };
}

/* ---------------- Interaktivt søk som jobb ---------------- */

const CACHE_MS = 10 * 60_000;
const jobs = new Map();
const byKey = new Map();
const secText = (ms) => (ms < 1000 ? `${ms} ms` : `${M.nb143(ms / 1000)} s`);
const ageText = (ms) => (ms < 60_000 ? 'Hentet nå nettopp' : `Hentet for ${Math.round(ms / 60_000)} min siden`);
function prune() {
  const now = Date.now();
  for (const [id, j] of jobs) if (j.finishedAt && now - j.finishedAt > CACHE_MS) { jobs.delete(id); if (byKey.get(j.key) === id) byKey.delete(j.key); }
  if (jobs.size > 200) for (const id of [...jobs.keys()].slice(0, jobs.size - 200)) jobs.delete(id);
}
function jobOut(j) {
  const now = Date.now(), elapsed = (j.finishedAt ?? now) - j.startedAt;
  const done = j.indexers.filter((x) => x.state === 'done' || x.state === 'failed').length;
  const partial = M.rankReleases43(j.partial, j.profileRes ?? 1080).map((r) => ({ ...r, partial: true, canGrab: false }));
  const running = j.state === 'running';
  return { jobId: j.id, state: j.state, service: j.svc, query: j.query, site: j.site ?? DEFAULT_SITE, startedAt: new Date(j.startedAt).toISOString(), finishedAt: j.finishedAt ? new Date(j.finishedAt).toISOString() : null,
    elapsedMs: elapsed, elapsedText: secText(elapsed), indexers: j.indexers.map(({ id, name, state, count, ms, error }) => ({ id, name, state, count, ms, error: error ?? null, line: state === 'done' ? `✓ ${count} treff · ${secText(ms)}` : state === 'failed' ? `✕ ${error ?? 'feilet'}` : '⟳' })),
    indexersTotal: j.indexers.length, indexersDone: done, partial: running ? partial : [], partialCount: j.partial.length, result: j.result, error: j.error,
    cached: !running && !!j.finishedAt, cachedAt: j.finishedAt ? new Date(j.finishedAt).toISOString() : null, ageText: j.finishedAt ? ageText(now - j.finishedAt) : null,
    text: running ? `Søker i ${j.indexers.length || 'alle'} indeksere … ${Math.round(elapsed / 1000)} s` : j.state === 'done' ? (j.result?.text ?? `${j.partial.length} treff`) : j.error ?? 'Avbrutt',
    ...(j.state === 'failed' && j.allFailed ? { allFailed: true, actions: [{ id: 'retry', label: 'Prøv igjen' }, { id: 'prowlarr', label: 'Åpne Prowlarr', open: { tab: 'prowlarr' } }] } : {}) };
}
function emit(j, event, data) { for (const fn of j.subs) { try { fn(event, data); } catch { /* lytteren er borte */ } } }
function queryOf(b) {
  const int = (v) => (v === undefined || v === null || v === '' ? null : Number.isInteger(+v) && +v >= 0 ? +v : NaN);
  let svc = b.service ?? b.svc ?? null;
  const kind = b.kind;
  let episodeId = int(b.episodeId ?? (kind === 'episode' ? b.id : null)), movieId = int(b.movieId ?? (kind === 'movie' ? b.id : null));
  const seriesId = int(b.seriesId ?? (kind === 'season' ? b.id : null)), seasonNumber = int(b.seasonNumber ?? b.season);
  if ([episodeId, movieId, seriesId, seasonNumber].some(Number.isNaN)) throw Object.assign(new Error('Id-ene må være heltall'), { status: 400 });
  if (movieId != null) { svc = 'radarr'; return { svc, query: { movieId } }; }
  if (episodeId != null) return { svc: 'sonarr', query: { episodeId } };
  if (seriesId != null && seasonNumber != null) return { svc: 'sonarr', query: { seriesId, seasonNumber } };
  throw Object.assign(new Error('Mangler episodeId, movieId eller seriesId + seasonNumber'), { status: 400 });
}
async function searchTerm(svc, query) {
  if (svc === 'radarr') { const m = await M.arr43('radarr', 'GET', `/movie/${query.movieId}`); return { term: `${m.title} ${m.year ?? ''}`.trim(), cats: [2000] }; }
  const e = query.episodeId ? await M.arr43('sonarr', 'GET', `/episode/${query.episodeId}`) : null;
  const s = await M.arr43('sonarr', 'GET', `/series/${e?.seriesId ?? query.seriesId}`);
  const code = e ? M.epCode43(e.seasonNumber, e.episodeNumber) : `S${String(query.seasonNumber).padStart(2, '0')}`;
  return { term: `${s.title} ${code}`, cats: [5000] };
}
async function runJob(j) {
  const ctx = { svc: j.svc };
  const pOn = M.svcConf43('prowlarr').on;
  let idx = [];
  if (pOn) { try { idx = (await M.indexersRaw43()).filter((x) => x.enable !== false); } catch { idx = []; } }
  j.indexers = idx.map((x) => ({ id: x.id, name: x.name, state: 'pending', count: 0, ms: 0, error: null }));
  emit(j, 'snapshot', jobOut(j));
  const per = (async () => {
    if (!idx.length) return;
    let term;
    try { term = await searchTerm(j.svc, j.query); } catch { return; }
    await Promise.all(j.indexers.map(async (x) => {
      if (j.ctrl.signal.aborted) return;
      x.state = 'running'; const t0 = Date.now();
      emit(j, 'indexer.start', { id: x.id, name: x.name });
      try {
        const rows = await M.arr43('prowlarr', 'GET', '/search', { query: { query: term.term, indexerIds: x.id, categories: term.cats[0], type: 'search' }, timeout: 90_000 });
        if (j.state !== 'running') return;
        const list = (Array.isArray(rows) ? rows : []).map((r) => ({ ...M.releaseOut43({ ...r, indexer: r.indexer ?? x.name, indexerId: r.indexerId ?? x.id }, j.svc, ctx), viaProwlarr: true }));
        x.state = 'done'; x.count = list.length; x.ms = Date.now() - t0;
        const seen = new Set(j.partial.map((r) => r.title));
        for (const r of list) if (!seen.has(r.title)) j.partial.push(r);
        emit(j, 'indexer.done', { id: x.id, name: x.name, count: x.count, ms: x.ms });
        emit(j, 'partial', { count: j.partial.length });
      } catch (e) {
        x.state = 'failed'; x.ms = Date.now() - t0; x.error = /i tide|timeout/i.test(e.message) ? 'tidsavbrudd' : String(e.message).replace(/^Prowlarr svarte \d+:?\s*/, '').slice(0, 120) || 'feilet';
        emit(j, 'indexer.fail', { id: x.id, name: x.name, error: `${x.name} svarte ikke · 0 treff` });
      }
    }));
  })();
  try {
    const result = await M.interactive(j.svc, j.query, { signal: j.ctrl.signal });
    await Promise.race([per, new Promise((r) => setTimeout(r, 1500))]); // la de siste indekserne rapportere
    if (j.state !== 'running') return;
    // Indeksere uten Prowlarr-svar: les dem fra resultatet.
    if (!j.indexers.length) j.indexers = [...new Set(result.items.map((r) => r.indexer).filter(Boolean))].map((name, i) => ({ id: -(i + 1), name, state: 'done', count: result.items.filter((r) => r.indexer === name).length, ms: result.tookMs, error: null }));
    for (const x of j.indexers) if (x.state === 'pending' || x.state === 'running') { const n = result.items.filter((r) => r.indexer === x.name).length; Object.assign(x, { state: 'done', count: n, ms: result.tookMs }); }
    j.profileRes = result.context?.profileRes;
    j.result = result; j.state = 'done'; j.finishedAt = Date.now();
    emit(j, 'done', { releases: result.items, result });
  } catch (e) {
    await per.catch(() => {});
    if (j.state !== 'running') return;
    j.finishedAt = Date.now();
    if (j.partial.length) {
      // Sonarr/Radarr ga opp, men noen indeksere svarte: vis treffene (kan ikke sendes direkte – søk igjen for å laste ned).
      j.state = 'done';
      j.result = { context: null, items: M.rankReleases43(j.partial, 1080).map((r) => ({ ...r, partial: true, canGrab: false })), best: null, tookMs: j.finishedAt - j.startedAt, indexers: j.indexers.filter((x) => x.state === 'done').length,
        indexersTotal: j.indexers.length, filters: [], text: `${j.partial.length} treff fra ${j.indexers.filter((x) => x.state === 'done').length} indeksere · ${M.SERVICES43[j.svc].name}: ${e.message}`, warning: e.message };
      emit(j, 'done', { releases: j.result.items, result: j.result });
    } else {
      j.state = 'failed'; j.allFailed = true;
      j.error = j.indexers.length && j.indexers.every((x) => x.state === 'failed') ? 'Ingen indeksere svarte. Sjekk Prowlarr → Helse' : e.message;
      emit(j, 'failed', { error: j.error });
    }
  } finally {
    const ok = j.indexers.filter((x) => x.state === 'done').length, bad = j.indexers.filter((x) => x.state === 'failed').length;
    console.log(`media.search jobId=${j.id} service=${j.svc} indexers=${j.indexers.length} ok=${ok} fail=${bad} state=${j.state} ms=${(j.finishedAt ?? Date.now()) - j.startedAt}`);
    emit(j, 'end', null);
    j.subs.clear();
  }
}
/** Starter (eller gjenbruker fra cache, 10 min) et interaktivt søk. → {job, cached} */
export function startSearch44(u, b, site = null) {
  prune();
  const { svc, query } = queryOf(b ?? {});
  const key = `${site ?? DEFAULT_SITE}|${svc}|${JSON.stringify(query)}`;
  const prev = jobs.get(byKey.get(key));
  if (prev && !b.force && (prev.state === 'running' || (prev.state === 'done' && Date.now() - prev.finishedAt < CACHE_MS))) return { job: prev, cached: prev.state === 'done' };
  if (prev?.state === 'running') prev.ctrl.abort();
  const j = { id: randomUUID(), key, svc, query, site, user: u, state: 'running', startedAt: Date.now(), finishedAt: null, indexers: [], partial: [], result: null, error: null, subs: new Set(), ctrl: new AbortController() };
  jobs.set(j.id, j); byKey.set(key, j.id);
  M.runMediaSite43(site, () => runJob(j)).catch((e) => { j.state = 'failed'; j.error = e.message; j.finishedAt = Date.now(); });
  return { job: j, cached: false };
}
export const searchJob44 = (id) => jobs.get(id) ?? null;
export const _searchJobs44 = jobs;

/* ---------------- Slett fil ---------------- */

async function deleteEpisodeFile(id) {
  const e = await M.arr43('sonarr', 'GET', `/episode/${id}`);
  if (!e.hasFile || !e.episodeFileId) throw new M.MediaError('Episoden har ingen fil', 409);
  await M.arr43('sonarr', 'DELETE', `/episodefile/${e.episodeFileId}`);
  // Slå av overvåking, så den ikke lastes ned igjen med en gang (Angre slår den på igjen).
  await M.arr43('sonarr', 'PUT', '/episode/monitor', { body: { episodeIds: [e.id], monitored: false } }).catch(() => {});
  M.clearMedia43('sonarr:'); M.clearMedia43('cal');
  const code = M.epCode43(e.seasonNumber, e.episodeNumber);
  console.log(`media.delete episodefile=${e.episodeFileId} episode=${e.id} ${code}`);
  return { ok: true, episodeId: e.id, episodeFileId: e.episodeFileId, monitored: false, message: `Slettet ${code}${e.title ? ` · ${e.title}` : ''} · overvåking er av`,
    undo: { label: 'Angre', method: 'PUT', path: `/api/media/episodes/${e.id}`, body: { monitored: true }, ms: 5000 } };
}
async function deleteMovieFile(id) {
  const m = await M.arr43('radarr', 'GET', `/movie/${id}`);
  const fid = m.movieFile?.id;
  if (!m.hasFile || !fid) throw new M.MediaError('Filmen har ingen fil', 409);
  await M.arr43('radarr', 'DELETE', `/moviefile/${fid}`);
  await M.arr43('radarr', 'PUT', `/movie/${m.id}`, { body: { ...m, monitored: false } }).catch(() => {});
  M.clearMedia43('radarr:'); M.clearMedia43('cal');
  console.log(`media.delete moviefile=${fid} movie=${m.id}`);
  return { ok: true, movieId: m.id, movieFileId: fid, monitored: false, message: `Slettet filen til ${m.title} · overvåking er av`,
    undo: { label: 'Angre', method: 'PUT', path: `/api/media/movies/${m.id}`, body: { monitored: true }, ms: 5000 } };
}

/* ---------------- Søk i biblioteket ---------------- */

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/[^a-z0-9]/g, '');
export const libraryMatch44 = (x, q) => { const f = fold(q); return !f || [x.title, x.network, x.year].some((v) => fold(v).includes(f)); };
/** Middleware for GET /api/media/series og /movies: ?q= filtrerer items (counts beholdes uten søk). */
export async function librarySearchMw44(c, next) {
  await next();
  const q = String(c.req.query('q') ?? c.req.query('search') ?? '').trim().slice(0, 100);
  if (c.req.method !== 'GET' || !q || c.res.status !== 200) return;
  try {
    const j = await c.res.clone().json();
    if (!Array.isArray(j?.items)) return;
    const items = j.items.filter((x) => libraryMatch44(x, q));
    const kind = /movies/.test(c.req.path) ? 'filmer' : 'serier';
    c.res = c.json({ ...j, items, q, matches: items.length, ...(items.length ? {} : { empty: `Ingen ${kind} i biblioteket som heter «${q}».`, addAction: { label: `Søk etter «${q}» for å legge til`, path: `/api/media/${kind === 'filmer' ? 'movies' : 'series'}/lookup?term=${encodeURIComponent(q)}` } }) });
  } catch { /* lar svaret stå */ }
}

/* ---------------- Gamle Plex/Jellyfin-ruter: serverens oppsett for alle med tilgang ---------------- */

const OWN_KEYS = ['plex_token', 'jf_key'];
/** Wrapper for /api/media/now|recent|history: uten egne Plex/Jellyfin-verdier og med tilgang til Media → serverens oppsett. */
export const legacyMedia44 = (handler) => async (c) => {
  const u = c.get('user');
  if (!u || u === OWNER || OWN_KEYS.some((k) => userCfgSet(u, k)) || !M.mediaAllowed43(u)) return handler(c);
  // cfg() leser brukeren fra forespørselen (c.get('user')), så den byttes mens svaret lages og settes tilbake etterpå.
  const src = M.mediaSource43(userCfgSet(OWNER, 'plex_token') || !userCfgSet(OWNER, 'jf_key') ? 'plex' : 'jellyfin').user;
  c.set('user', src);
  try { const r = await handler(c); try { r.headers.set('X-Media-Source', 'server'); } catch { /* */ } return r; } finally { c.set('user', u); }
};

/* ---------------- Ruter ---------------- */

const H = (fn) => async (c) => { try { const r = await fn(c); return r instanceof Response ? r : c.json(r); } catch (e) { return M.mediaFail43(c, e instanceof M.MediaError ? e : Object.assign(new M.MediaError(e.message, e.status ?? 500), e.field ? { field: e.field } : {})); } };
const G = [authOrToken, M.mediaGuard43], A = [authOrToken, M.mediaGuard43, M.mediaAdmin43];

/** Middleware for alle /api/media/*: velger sted (?server= eller brukerens valg) for hele forespørselen. */
export async function mediaSiteMw44(c, next) {
  const q = c.req.query('server') ?? c.req.query('site');
  let site = q && (q === DEFAULT_SITE || siteById(q)) ? q : null;
  if (!site) {
    // Brukeren er ikke satt ennå (authOrToken kjører i rutene); økt eller token leses her bare for å finne valget.
    let u = null;
    try { u = sessionUser(c) ?? tokenAccessOf(c)?.user ?? null; } catch { u = null; }
    site = selectedSite44(u);
  }
  const s = site === DEFAULT_SITE ? null : site;
  await M.runMediaSite43(s, async () => {
    await next();
    if (s) {
      try { c.res.headers.set('X-Media-Server', site); const miss = SERVICES.filter((svc) => !siteById(site)?.[svc]?.url || !siteById(site)?.[svc]?.key); if (miss.length) c.res.headers.set('X-Media-Fallback', miss.map(svcOut).join(',')); } catch { /* uforanderlige headere */ }
    }
  });
}

export const media44Api = new Hono();
media44Api.get('/servers', ...G, H((c) => serversOut(c.get('user'), c.req.query('status') === '1')));
media44Api.put('/servers/select', ...G, H(async (c) => {
  const b = await M.mediaBody43(c), id = String(b.id ?? b.server ?? '');
  if (id !== DEFAULT_SITE && !siteById(id)) throw new M.MediaError('Ukjent server', 404);
  kv.set(c.get('user'), 'media44_site', id);
  const list = await serversOut(c.get('user'));
  return { selected: id, server: list.find((x) => x.id === id) };
}));
media44Api.post('/servers', ...A, H(async (c) => {
  const b = await M.mediaBody43(c);
  const list = sitesRaw();
  if (list.length >= 8) throw new M.MediaError('Maks 8 servere', 400);
  const s = siteInput(b, { color: COLORS[(list.length + 1) % COLORS.length] });
  if (!s.name) throw new M.MediaError('Gi serveren et navn', 400);
  let id = slug(s.name) || 'server'; if (id === DEFAULT_SITE || list.some((x) => x.id === id)) id = `${id}-${list.length + 2}`;
  kv.set(OWNER, SITES, [...list, { id, ...s, created: Date.now() }]);
  M.clearMedia43();
  return c.json({ server: publicSite({ id, ...s }, true) }, 201);
}));
media44Api.put('/servers/:id', ...A, H(async (c) => {
  const id = c.req.param('id'), b = await M.mediaBody43(c);
  if (id === DEFAULT_SITE) {
    if (b.name !== undefined) { const n = String(b.name ?? '').trim().slice(0, 30); if (!n) throw new M.MediaError('Gi serveren et navn', 400); kv.set(OWNER, 'media44_default_name', n); }
    return { server: { id, name: kv.get(OWNER, 'media44_default_name', 'Hjemme'), builtin: true, note: 'Tjenestene for Hjemme endres under Innstillinger → Integrasjoner → MEDIA.' } };
  }
  const list = sitesRaw(), i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new M.MediaError('Ukjent server', 404);
  list[i] = { ...siteInput(b, list[i]), id };
  kv.set(OWNER, SITES, list);
  M.clearMedia43();
  return { server: publicSite(list[i], true) };
}));
media44Api.delete('/servers/:id', ...A, H((c) => {
  const id = c.req.param('id');
  if (id === DEFAULT_SITE) throw new M.MediaError('Hjemme kan ikke slettes', 400);
  const list = sitesRaw();
  if (!list.some((x) => x.id === id)) throw new M.MediaError('Ukjent server', 404);
  kv.set(OWNER, SITES, list.filter((x) => x.id !== id));
  M.clearMedia43();
  return { ok: true, id };
}));
media44Api.post('/servers/:id/test', ...A, H(async (c) => {
  const id = c.req.param('id');
  if (id !== DEFAULT_SITE && !siteById(id)) throw new M.MediaError('Ukjent server', 404);
  const results = {};
  for (const svc of SERVICES) {
    const x = id === DEFAULT_SITE ? null : siteById(id)[svc];
    results[svcOut(svc)] = id === DEFAULT_SITE ? await M.mediaTest43(svc) : x?.url && x?.key ? await M.mediaTest43(svc, { [M.SERVICES43[svc].url]: x.url, [M.SERVICES43[svc].key]: x.key, ...(M.SERVICES43[svc].user ? { [M.SERVICES43[svc].user]: x.user ?? '' } : {}) }) : { ok: false, code: 'missing', message: 'Ikke satt opp' };
  }
  return { id, results };
}));

// Interaktivt søk som jobb
const startRoute = H(async (c) => {
  const b = await M.mediaBody43(c);
  const { job, cached } = startSearch44(c.get('user'), b, M.mediaSite43());
  return c.json({ jobId: job.id, cached, state: job.state, events: `/api/media/release/search/${job.id}/events`, poll: `/api/media/release/search/${job.id}`, ...(cached ? { ageText: ageText(Date.now() - job.finishedAt) } : {}) }, cached ? 200 : 202);
});
media44Api.post('/release/search', ...G, startRoute);
media44Api.post('/search', ...G, startRoute);
const ownJob = (c) => { const j = searchJob44(c.req.param('jobId')); if (!j || (j.user !== c.get('user') && !isAdmin(c.get('user')))) return null; return j; };
const getJob = (c) => { const j = ownJob(c); return j ? c.json(jobOut(j)) : c.json({ error: 'Fant ikke søket (utløpt etter 10 min)' }, 404); };
const sseJob = (c) => {
  const j = ownJob(c);
  if (!j) return c.json({ error: 'Fant ikke søket (utløpt etter 10 min)' }, 404);
  return streamSSE(c, async (s) => {
    await s.writeSSE({ event: 'snapshot', data: JSON.stringify(jobOut(j)) });
    if (j.state !== 'running') { await s.writeSSE({ event: j.state === 'done' ? 'done' : 'failed', data: JSON.stringify(j.state === 'done' ? { releases: j.result?.items ?? [], result: j.result } : { error: j.error }) }); return; }
    await new Promise((resolve) => {
      const ping = setInterval(() => s.writeSSE({ event: 'ping', data: JSON.stringify({ elapsedMs: Date.now() - j.startedAt }) }).catch(() => {}), 15_000);
      const fn = (event, data) => { if (event === 'end') { clearInterval(ping); j.subs.delete(fn); resolve(); return; } s.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {}); };
      j.subs.add(fn);
      s.onAbort(() => { clearInterval(ping); j.subs.delete(fn); resolve(); }); // søket fortsetter og caches
    });
  });
};
media44Api.get('/release/search/:jobId', ...G, getJob);
media44Api.get('/search/:jobId', ...G, getJob);
media44Api.get('/release/search/:jobId/events', ...G, sseJob);
media44Api.get('/search/:jobId/events', ...G, sseJob);
const cancelJob = (c) => {
  const j = ownJob(c);
  if (!j) return c.json({ error: 'Fant ikke søket' }, 404);
  if (j.state === 'running') { j.state = 'cancelled'; j.error = 'Avbrutt'; j.finishedAt = Date.now(); j.ctrl.abort(); emit(j, 'failed', { error: 'Avbrutt', cancelled: true }); emit(j, 'end', null); byKey.delete(j.key); }
  return c.json({ ok: true, jobId: j.id, state: j.state });
};
media44Api.delete('/release/search/:jobId', ...G, cancelJob);
media44Api.delete('/search/:jobId', ...G, cancelJob);

// Slett fil (admin)
media44Api.delete('/episodes/:id{[0-9]+}/file', ...A, H((c) => deleteEpisodeFile(+c.req.param('id'))));
media44Api.delete('/movies/:id{[0-9]+}/file', ...A, H((c) => deleteMovieFile(+c.req.param('id'))));

/** GET /api/integrations/status (montert i index.js før /api/integrations). */
export const integrationsStatusApi44 = new Hono();
integrationsStatusApi44.get('/status', authOrToken, async (c) => {
  const q = c.req.query('server') ?? c.req.query('site');
  const site = q && (q === DEFAULT_SITE || siteById(q)) ? q : selectedSite44(c.get('user'));
  return c.json(await integrationsStatus44(c.get('user'), site));
});
