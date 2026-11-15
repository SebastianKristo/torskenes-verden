// Media: sann status for et søk (sporing), diagnostikk ledd 2–6 og start av stoppede torrenter (fra prompt 50, SRVMEDIA50;
// claude-code-media-qbit-starter-ikke.md). Rotårsaken og hele kjeden er dokumentert i docs/media-nedlasting-50.md.
//
//   POST /api/media/track {episodeId|episodeIds|movieId|movieIds, commandId?, grabbed?} → 201 Track     (G)
//   GET  /api/media/track/:id → Track · GET /api/media/track?episodeId=|movieId= → Track (siste for elementet)  (G)
//   POST /api/media/torrents/:hash/start → {ok, torrent, message}  (qBittorrent 5.x /start, reserve /resume for 4.x)  (G)
//   GET  /api/media/diagnostics[?service=sonarr|radarr] · POST {episodeId?|movieId?} → Diagnostikk (bare admin)
//   POST /api/media/command og /api/media/glimt (media/arr.js) får `track` i svaret (mellomvare her).
// Sikkerhet: tjenestenøkler og passord logges aldri og sendes aldri ut (nedlastingsklienten vises som «passord satt/ikke satt»).
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth/session.js';
import * as M from './arr.js';
import { dtf } from '../intl-format.js'; // gjenbrukte Intl.DateTimeFormat

const TZ = 'Europe/Oslo';
const SVC_NAME = { sonarr: 'Sonarr', radarr: 'Radarr', qbit: 'qBittorrent', prowlarr: 'Prowlarr' };

/* =====================================================================================================================
   Sporing: sann status etter et søk (ikke evig «Søker»)
   ===================================================================================================================== */

const TRACKS = new Map();
const TRACK_TTL = 6 * 3600_000;
const NO_GRAB_MS = 60_000;
let noGrabMs = NO_GRAB_MS;
/** Bare for tester: hvor lenge et søk kan gå uten grab før diagnostikken kjøres (standard 60 s). */
export const _setNoGrabMs50 = (ms) => { noGrabMs = ms ?? NO_GRAB_MS; };
export const _tracks50 = TRACKS;
const ints = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
const osloHm = (t) => dtf('nb-NO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const short = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const tlog = (t, ledd, msg) => console.log(`media.track id=${t.id.slice(0, 8)} svc=${t.svc} ${t.episodeIds.length ? `episodeIds=${t.episodeIds.slice(0, 5).join(',')}` : `movieIds=${t.movieIds.slice(0, 5).join(',')}`} ledd=${ledd} ${msg}`);

function prune() { const now = Date.now(); for (const [id, t] of TRACKS) if (now - t.startedAt > TRACK_TTL) TRACKS.delete(id); if (TRACKS.size > 500) for (const id of [...TRACKS.keys()].slice(0, TRACKS.size - 500)) TRACKS.delete(id); }
/** Ny sporing. svc utledes fra id-ene. */
export function newTrack50({ user, episodeIds, movieIds, seriesId = null, seasonNumber = null, commandId = null, name = null, grabbed = false }) {
  prune();
  const ep = ints(episodeIds), mv = ints(movieIds);
  if (!ep.length && !mv.length && seriesId == null) throw new M.MediaError('Mangler episodeId, movieId eller seriesId', 400);
  const t = { id: randomUUID(), user, site: M.mediaSite43(), svc: mv.length ? 'radarr' : 'sonarr', episodeIds: ep, movieIds: mv, seriesId, seasonNumber, commandId: commandId != null && Number.isInteger(+commandId) ? +commandId : null, name,
    startedAt: Date.now(), grabbedAt: grabbed ? Date.now() : null, autoStarted: new Set(), cmd: null, rel: null, relP: null, diag: null, diagP: null, last: null, lastAt: 0, hist: null, histAt: 0, logged: '' };
  TRACKS.set(t.id, t);
  tlog(t, 1, `start command=${t.commandId ?? '-'} name=${name ?? '-'}`);
  return t;
}
const REJ = [[/existing file|already|equal or higher|is not an upgrade/i, 'har allerede like god fil'], [/not wanted in profile|quality|cutoff|upgrade/i, 'under kvalitetskrav'], [/seeder|peers/i, 'for få seedere'],
  [/size|larger|smaller|maximum|minimum/i, 'feil størrelse'], [/language/i, 'feil språk'], [/blocklist|blacklist/i, 'svartelistet'], [/must contain|must not contain|restricted|release profile|custom format|score/i, 'stoppet av egne regler'],
  [/delay|not yet|available|aired/i, 'ikke tilgjengelig ennå'], [/match|parse|unknown|series|episode|season|movie/i, 'passet ikke episoden/filmen']];
const rejCat = (s) => REJ.find(([re]) => re.test(s))?.[1] ?? short(s, 60);
/** Oppsummerer /release: {total, accepted, rejected, reason, top:[{label, count}], items:[…5 første]} */
export function releaseSummary50(rows) {
  const L = Array.isArray(rows) ? rows : [];
  const rej = L.filter((r) => r.rejected || (r.rejections ?? []).length);
  const counts = new Map();
  for (const r of rej) { const cats = new Set((r.rejections ?? []).map((x) => rejCat(typeof x === 'string' ? x : x?.reason ?? ''))); for (const c of cats) counts.set(c, (counts.get(c) ?? 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  const reason = !L.length ? 'Indekserne ga ingen treff' : rej.length === L.length ? (top.length === 1 || top[0]?.count === L.length ? `alle ${L.length} ${top[0]?.label ?? 'avvist'}` : `alle ${L.length} avvist: ${top.slice(0, 3).map((x) => `${x.label} (${x.count})`).join(', ')}`) : null;
  return { total: L.length, accepted: L.length - rej.length, rejected: rej.length, reason, top: top.slice(0, 5),
    items: L.slice(0, 5).map((r) => ({ title: r.title, sizeText: M.sizeText43(r.size), seeders: r.seeders ?? null, quality: r.quality?.quality?.name ?? null, indexer: r.indexer ?? '', rejections: (r.rejections ?? []).map((x) => (typeof x === 'string' ? x : x?.reason ?? '')).slice(0, 3) })) };
}
async function rawQueue(svc) {
  return M.cached43(`queue50:${svc}`, 5000, async () => (await M.arr43(svc, 'GET', '/queue', { query: { pageSize: 500, includeUnknownSeriesItems: false, ...(svc === 'sonarr' ? { includeEpisode: false } : {}) } }))?.records ?? []);
}
async function qbList() { return M.cached43('qbit:info', 2000, () => M.qb43('GET', '/torrents/info')); }
const qbErrKind = (e) => (e?.upstream === 401 || /passord|sperret|innlogging/i.test(e?.message ?? '') ? 'auth' : 'down');
const ACT = {
  manual: (t) => ({ id: 'manual', label: 'Velg manuelt', ...(t.movieIds.length ? { movieId: t.movieIds[0] } : t.episodeIds.length ? { episodeId: t.episodeIds[0] } : { seriesId: t.seriesId, seasonNumber: t.seasonNumber }) }),
  start: (hash) => ({ id: 'start', label: 'Start', hash, method: 'POST', path: `/api/media/torrents/${hash}/start` }),
  settings: () => ({ id: 'settings', label: 'Innstillinger → Media', route: 'innstillinger/media', hash: '#/innstillinger/media' }),
  retry: (t) => ({ id: 'retry', label: 'Søk igjen', method: 'POST', path: '/api/media/command', body: t.movieIds.length ? { name: 'MoviesSearch', movieIds: t.movieIds } : { name: 'EpisodeSearch', episodeIds: t.episodeIds } }),
};
const TONE = { searching: 'mut', checking: 'mut', sent: 'dl', downloading: 'dl', starting: 'dl', queued: 'wait', delayed: 'wait', importing: 'ok', done: 'ok', stopped: 'warn', stalled: 'warn', none: 'bad', rejected: 'bad', not_grabbed: 'bad',
  qbit_down: 'bad', qbit_auth: 'bad', client_error: 'bad', missing_torrent: 'bad', error: 'bad', failed: 'bad' };
const FINAL = new Set(['done', 'none', 'rejected', 'failed', 'not_grabbed', 'qbit_down', 'qbit_auth', 'client_error', 'missing_torrent', 'error']);
function torrentState(t, tor, now) {
  const st = M.TSTATE43[tor.state] ?? 'dl', pct = Math.floor((tor.progress ?? 0) * 100), name = tor.name;
  const torrent = { hash: tor.hash, name, state: tor.state, progress: pct, size: tor.size ?? tor.total_size ?? 0, category: tor.category ?? '' };
  if (st === 'seed' || (tor.progress ?? 0) >= 1) return { state: 'importing', text: 'Lastet ned · importeres', torrent };
  if (st === 'pause') return { state: 'stopped', text: 'Lagt til, men stoppet', detail: 'qBittorrent la torrenten til uten å starte den («Start torrent automatically» er av, eller Initial State er Stop/Pause).', torrent, actions: [ACT.start(tor.hash), ACT.settings()] };
  if (st === 'queued') return { state: 'queued', text: 'I kø i qBittorrent', detail: 'Maks aktive nedlastinger er nådd (qBittorrent → Innstillinger → BitTorrent → Torrent-kø).', torrent, actions: [ACT.settings()] };
  if (st === 'stall') return { state: 'stalled', text: `Står fast · ${tor.num_seeds ?? 0} seedere`, detail: (tor.num_seeds ?? 0) === 0 ? 'Ingen seedere. Velg en annen utgivelse, eller sjekk at qBittorrent har nett (VPN).' : null, torrent, actions: [ACT.manual(t), ACT.settings()] };
  if (st === 'error') return { state: 'error', text: tor.state === 'missingFiles' ? 'Feil i qBittorrent: filene mangler' : 'Feil i qBittorrent', detail: 'Ofte en lagringsmappe som ikke finnes eller ikke er skrivbar for containeren (PUID/PGID).', torrent, actions: [ACT.settings()] };
  if (st === 'meta') return { state: 'downloading', text: 'Sendt til qBittorrent · henter metadata …', torrent, progress: pct };
  if (st === 'check') return { state: 'downloading', text: `Sjekker filene … ${pct} %`, torrent, progress: pct };
  const speed = tor.dlspeed ?? 0, eta = M.etaText43(tor.eta);
  return { state: 'downloading', text: `Laster ned ${pct} % · ${M.speedText43(speed)}${eta !== '∞' ? ` · ${eta}` : ''}`, progress: pct, speedText: M.speedText43(speed), etaText: eta, torrent };
}
/** Én vurdering av sporingen (kjeden ledd 2–6). */
async function evaluate(t) {
  const now = Date.now(), svc = t.svc, name = SVC_NAME[svc], age = now - t.startedAt;
  // Ledd 2: kommandoen i Sonarr/Radarr.
  if (t.commandId && !['completed', 'failed', 'aborted', 'cancelled', 'orphaned'].includes(t.cmd?.status)) {
    try { const c = await M.arr43(svc, 'GET', `/command/${t.commandId}`); t.cmd = { status: c?.status ?? null, message: c?.message ?? null, result: c?.result ?? null }; } catch (e) { t.cmd = { ...(t.cmd ?? {}), error: e.message }; }
  }
  // Ledd 4 og 5: køen i Sonarr/Radarr (grab som ligger i nedlastingsklienten, eller venter på forsinkelsesprofil).
  let rec = null, qErr = null;
  try {
    const recs = await rawQueue(svc);
    rec = recs.find((r) => (t.movieIds.length ? t.movieIds.includes(r.movieId) : t.episodeIds.length ? t.episodeIds.includes(r.episodeId) : r.seriesId === t.seriesId && (t.seasonNumber == null || r.seasonNumber === t.seasonNumber || r.episode?.seasonNumber === t.seasonNumber))) ?? null;
  } catch (e) { qErr = e; }
  // Ledd 6: qBittorrent.
  let tors = null, qbErr = null;
  if (M.svcConf43('qbit').on) { try { tors = await qbList(); } catch (e) { qbErr = e; } }
  let hash = rec?.downloadId ? String(rec.downloadId).toLowerCase() : null;
  // Ledd 4: grab i historikken (når køen ikke viser noe).
  if (!rec && (now - t.histAt > 8000 || !t.hist)) {
    t.histAt = now;
    try {
      const recs = [];
      if (svc === 'radarr') for (const id of t.movieIds.slice(0, 3)) { const h = await M.arr43('radarr', 'GET', '/history/movie', { query: { movieId: id, eventType: 1 } }); recs.push(...(Array.isArray(h) ? h : h?.records ?? [])); }
      else for (const id of t.episodeIds.slice(0, 3)) { const h = await M.arr43('sonarr', 'GET', '/history', { query: { episodeId: id, eventType: 1, pageSize: 10, sortKey: 'date', sortDirection: 'descending' } }); recs.push(...(Array.isArray(h) ? h : h?.records ?? [])); }
      t.hist = recs.filter((r) => (r.eventType === 'grabbed' || r.eventType === 1) && Date.parse(r.date) >= t.startedAt - 10_000).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    } catch { t.hist = t.hist ?? []; }
  }
  const grab = t.hist?.[0] ?? null;
  if (!hash && grab?.downloadId) hash = String(grab.downloadId).toLowerCase();
  if ((rec || grab) && !t.grabbedAt) { t.grabbedAt = grab ? Date.parse(grab.date) || now : now; tlog(t, 4, `grab ${short(rec?.title ?? grab?.sourceTitle ?? '', 80)} client=${rec?.downloadClient ?? grab?.data?.downloadClient ?? '-'}`); }
  const tor = hash && tors ? tors.find((x) => String(x.hash).toLowerCase() === hash) : null;
  const out = { command: t.cmd };
  if (tor) {
    Object.assign(out, torrentState(t, tor, now));
    // qBittorrent 5.x med «start automatisk» av (eller Initial State: Stop): appen starter torrenten selv – én gang.
    if (out.state === 'stopped' && !t.autoStarted.has(tor.hash) && (tor.added_on ?? 0) * 1000 >= t.startedAt - 120_000) {
      t.autoStarted.add(tor.hash);
      try { await M.qbVerb43('start', 'resume', tor.hash); M.clearMedia43('qbit:'); tlog(t, 6, `auto-start hash=${tor.hash.slice(0, 8)} state=${tor.state}`); Object.assign(out, { state: 'starting', text: 'Lagt til stoppet · starter den nå', detail: 'qBittorrent la torrenten til stoppet, så Homelab startet den (torrents/start, reserve resume).', actions: [] }); }
      catch (e) { out.detail = `Fikk ikke startet torrenten: ${e.message}`; }
    }
    return out;
  }
  if (rec) {
    const st = String(rec.status ?? '').toLowerCase(), tds = String(rec.trackedDownloadState ?? ''), msgs = (rec.statusMessages ?? []).flatMap((m) => m.messages ?? []).concat(rec.errorMessage ? [rec.errorMessage] : []);
    if (st === 'delay' || st === 'pending') return { ...out, state: 'delayed', text: `Venter på forsinkelsesprofilen i ${name}${rec.estimatedCompletionTime ? ` (til ${osloHm(rec.estimatedCompletionTime)})` : ''}`, detail: 'Utgivelsen er valgt, men sendes først når forsinkelsen (Settings → Profiles → Delay Profiles) er over.' };
    if (st === 'downloadclientunavailable') return { ...out, state: 'client_error', text: `${name} får ikke kontakt med qBittorrent`, detail: short(msgs.join(' · ')) || 'Nedlastingsklienten er utilgjengelig.', actions: [ACT.settings()] };
    if (/import/i.test(tds)) return { ...out, state: 'importing', text: 'Lastet ned · venter på import', detail: short(msgs.join(' · ')) || null };
    if (st === 'failed' || rec.trackedDownloadStatus === 'error') return { ...out, state: 'error', text: `${name}: nedlastingen feilet`, detail: short(msgs.join(' · ')) || null, actions: [ACT.manual(t)] };
    if (qbErr) return { ...out, state: qbErrKind(qbErr) === 'auth' ? 'qbit_auth' : 'qbit_down', text: qbErrKind(qbErr) === 'auth' ? 'Innlogging avvist' : 'qBittorrent svarer ikke', detail: qbErr.message, actions: [ACT.settings()] };
    if (tors && hash && now - (t.grabbedAt ?? now) > 30_000) return { ...out, state: 'missing_torrent', text: 'Sendt til qBittorrent, men torrenten finnes ikke der', detail: `${name} og Homelab ser kanskje på forskjellige qBittorrent (adresse/kategori).`, actions: [ACT.settings()] };
    return { ...out, state: 'sent', text: 'Sendt til qBittorrent', detail: short(rec.title, 120) };
  }
  if (grab) {
    if (qbErr) return { ...out, state: qbErrKind(qbErr) === 'auth' ? 'qbit_auth' : 'qbit_down', text: qbErrKind(qbErr) === 'auth' ? 'Innlogging avvist' : 'qBittorrent svarer ikke', detail: qbErr.message, actions: [ACT.settings()] };
    // Ferdig og importert? (køen er tom igjen)
    const has = await hasFile(t).catch(() => false);
    if (has) return { ...out, state: 'done', text: 'Lastet ned' };
    if (now - (t.grabbedAt ?? now) < 30_000) return { ...out, state: 'sent', text: 'Sendt til qBittorrent', detail: short(grab.sourceTitle, 120) };
    return { ...out, state: 'missing_torrent', text: 'Sendt til qBittorrent, men torrenten finnes ikke der', detail: `${name} fikk ikke lagt den til, eller qBittorrent fjernet den. Sjekk nedlastingsklienten i ${name}.`, actions: [ACT.settings(), ACT.manual(t)] };
  }
  // Ingen grab.
  if (await hasFile(t).catch(() => false) && !t.commandId) return { ...out, state: 'done', text: 'Lastet ned' };
  if (t.cmd?.status === 'failed' || t.cmd?.status === 'aborted') return { ...out, state: 'failed', text: `Søket feilet i ${name}`, detail: short(t.cmd.message ?? t.cmd.result ?? ''), actions: [ACT.retry(t), ACT.manual(t)] };
  const cmdDone = t.cmd?.status === 'completed';
  if (!cmdDone && age < noGrabMs) return { ...out, state: 'searching', text: `Søker i indekserne via ${name} …`, detail: t.cmd?.status === 'queued' ? `Kommandoen venter i køen i ${name}` : null };
  // Søket er ferdig (eller 60 s uten grab): hvorfor? Utgivelsene (ledd 3) og diagnostikken (ledd 2–6) kjøres én gang.
  if (!t.rel && !t.relP && (t.episodeIds.length === 1 || t.movieIds.length === 1)) {
    const q = t.movieIds.length ? { movieId: t.movieIds[0] } : { episodeId: t.episodeIds[0] };
    t.relP = M.runMediaSite43(t.site, () => M.arr43(svc, 'GET', '/release', { query: q, timeout: 180_000 })).then((rows) => { t.rel = releaseSummary50(rows); tlog(t, 3, `releases total=${t.rel.total} accepted=${t.rel.accepted} rejected=${t.rel.rejected}${t.rel.reason ? ` reason="${t.rel.reason}"` : ''}`); },
      (e) => { t.rel = { error: e.message }; }).finally(() => { t.relP = null; });
  }
  if (!t.diag && !t.diagP && age >= noGrabMs) {
    t.diagP = M.runMediaSite43(t.site, () => diagnose50({ service: svc })).then((d) => { t.diag = d; tlog(t, d.failed?.n ?? 0, `diagnostikk ok=${d.ok}${d.failed ? ` feil="${d.failed.title}: ${short(d.failed.text, 80)}"` : ''}`); }, (e) => { t.diag = { ok: false, error: e.message, steps: [] }; }).finally(() => { t.diagP = null; });
  }
  const R = t.rel, D = t.diag;
  if (R && !R.error && R.total === 0) return { ...out, state: 'none', text: 'Fant ingen utgivelser', detail: R.reason, releases: R, actions: [ACT.manual(t), ACT.retry(t)] };
  if (R && !R.error && R.accepted === 0) return { ...out, state: 'rejected', text: 'Fant ingen utgivelser', detail: R.reason, releases: R, actions: [ACT.manual(t)] };
  const bad = D?.steps?.find((s) => s.state === 'fail');
  if (bad) {
    const kind = bad.id === 'qbit' ? (/innlogging|passord|sperret/i.test(bad.text) ? 'qbit_auth' : 'qbit_down') : bad.id.endsWith(':client') ? 'client_error' : null;
    if (kind) return { ...out, state: kind, text: kind === 'qbit_auth' ? 'Innlogging avvist' : kind === 'qbit_down' ? 'qBittorrent svarer ikke' : `${name} får ikke kontakt med qBittorrent`, detail: bad.text, releases: R ?? null, actions: [ACT.settings(), ACT.manual(t)] };
  }
  if (R && !R.error && R.accepted > 0 && (cmdDone || age >= noGrabMs) && D) return { ...out, state: 'not_grabbed', text: `Fant ${R.accepted} utgivelse${R.accepted === 1 ? '' : 'r'}, men ingen ble sendt`, detail: bad ? `${bad.title}: ${bad.text}` : `Sjekk nedlastingsklienten i ${name}.`, releases: R, actions: [ACT.manual(t), ACT.settings()] };
  if (cmdDone && !t.relP && !t.diagP && (R || t.episodeIds.length !== 1) && D && !bad && age >= noGrabMs) return { ...out, state: 'not_grabbed', text: 'Søket ga ingen nedlasting', detail: short(t.cmd?.message ?? ''), releases: R ?? null, actions: [ACT.manual(t), ACT.retry(t)] };
  return { ...out, state: 'checking', text: cmdDone ? 'Søket er ferdig · sjekker hvorfor ingenting ble hentet …' : `Ingen grab etter ${Math.round(age / 1000)} s · sjekker kjeden …`, detail: t.cmd?.message ? short(t.cmd.message) : null };
}
async function hasFile(t) {
  if (t.movieIds.length) { const m = await M.arr43('radarr', 'GET', `/movie/${t.movieIds[0]}`); return !!m?.hasFile; }
  if (t.episodeIds.length) { const e = await M.arr43('sonarr', 'GET', `/episode/${t.episodeIds[0]}`); return !!e?.hasFile; }
  return false;
}
/** Sporingen som JSON. admin = får hint og detaljer fra diagnostikken. */
async function trackOut(t, admin) {
  if (!t.last || Date.now() - t.lastAt > 2500) {
    let r;
    try { r = await M.runMediaSite43(t.site, () => evaluate(t)); } catch (e) { r = { state: 'checking', text: 'Sjekker status …', detail: e.message }; }
    t.last = r; t.lastAt = Date.now();
    if (t.logged !== r.state) { tlog(t, { searching: 2, checking: 3, sent: 5, downloading: 6, starting: 6, stopped: 6, queued: 6, stalled: 6, error: 6, qbit_down: 6, qbit_auth: 6, client_error: 5, missing_torrent: 5, none: 3, rejected: 3, not_grabbed: 4, delayed: 4, importing: 6, done: 6, failed: 2 }[r.state] ?? 0, `state=${r.state} "${short(r.text, 80)}"`); t.logged = r.state; }
  }
  const r = t.last;
  const diag = t.diag ? { ok: !!t.diag.ok, at: t.diag.at ?? null, failed: t.diag.failed ? { id: t.diag.failed.id, n: t.diag.failed.n, title: t.diag.failed.title, text: t.diag.failed.text, ...(admin ? { hint: t.diag.failed.hint ?? null } : {}) } : null,
    steps: (t.diag.steps ?? []).map((s) => ({ id: s.id, n: s.n, title: s.title, state: s.state, text: s.text, ...(admin ? { hint: s.hint ?? null } : {}) })) } : null;
  const final = FINAL.has(r.state);
  return { id: t.id, service: t.svc, episodeIds: t.episodeIds, movieIds: t.movieIds, seriesId: t.seriesId, seasonNumber: t.seasonNumber, commandId: t.commandId, startedAt: new Date(t.startedAt).toISOString(), ageSec: Math.round((Date.now() - t.startedAt) / 1000),
    grabbedAt: t.grabbedAt ? new Date(t.grabbedAt).toISOString() : null, state: r.state, tone: TONE[r.state] ?? 'mut', text: r.text, detail: r.detail ?? null, progress: r.progress ?? null, speedText: r.speedText ?? null, etaText: r.etaText ?? null,
    torrent: r.torrent ?? null, releases: r.releases ?? null, command: r.command ?? null, diagnostics: diag, actions: r.actions ?? [], final, pollMs: final ? 0 : r.state === 'downloading' ? 5000 : 2500, url: `/api/media/track/${t.id}` };
}

/* =====================================================================================================================
   Diagnostikk: ledd 2–6 med grønt/rødt per ledd
   ===================================================================================================================== */

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i;
const step = (id, n, title, state, text, extra = {}) => ({ id, n, title, state, ok: state === 'ok' || state === 'warn' || state === 'skip', text, ...extra });
const fieldOf = (cl, name) => (cl?.fields ?? []).find((f) => f.name === name)?.value;
const gbText = (b) => M.sizeText43(b);
async function timed(fn) { const t0 = Date.now(); try { return { v: await fn(), ms: Date.now() - t0 }; } catch (e) { return { e, ms: Date.now() - t0 }; } }
/** Kjører ledd 2–6 for Sonarr og/eller Radarr + qBittorrent. Ingen nøkler/passord i svaret. */
export async function diagnose50({ service = null, episodeId = null, movieId = null } = {}) {
  const steps = [], cats = new Set();
  const svcs = (service ? [service] : ['sonarr', 'radarr']).filter((s) => M.svcConf43(s).on);
  if (!svcs.length) steps.push(step('arr', 2, 'Sonarr/Radarr', 'fail', 'Verken Sonarr eller Radarr er satt opp.', { hint: 'Innstillinger → Integrasjoner → Media.' }));
  for (const svc of svcs) {
    const N = SVC_NAME[svc];
    // Ledd 2: tjenesten og siste søkekommando.
    const st = await timed(() => M.arr43(svc, 'GET', '/system/status'));
    if (st.e) { steps.push(step(`${svc}:arr`, 2, `${N} og kommandoen`, 'fail', st.e.message, { ms: st.ms, hint: `Sjekk adressen og API-nøkkelen til ${N} (Innstillinger → Integrasjoner → Media).` })); continue; }
    const cmds = await M.arr43(svc, 'GET', '/command').catch(() => []);
    const last = (Array.isArray(cmds) ? cmds : []).filter((c) => /Search$/.test(c.name ?? c.commandName ?? '')).sort((a, b) => Date.parse(b.queued ?? b.started ?? 0) - Date.parse(a.queued ?? a.started ?? 0))[0];
    const cmdTxt = last ? ` · siste søk: ${last.commandName ?? last.name} ${last.status}${last.message ? ` («${short(last.message, 80)}»)` : ''}` : '';
    steps.push(step(`${svc}:arr`, 2, `${N} og kommandoen`, last?.status === 'failed' ? 'warn' : 'ok', `${N} v${String(st.v?.version ?? '?').split('.').slice(0, 2).join('.')} svarer (${st.ms} ms)${cmdTxt}`, { ms: st.ms }));
    // Ledd 3: indeksere (i Sonarr/Radarr og Prowlarr), og utgivelsene for elementet når det er oppgitt.
    const ix = await timed(() => M.arr43(svc, 'GET', '/indexer'));
    const list = Array.isArray(ix.v) ? ix.v : [];
    const auto = list.filter((x) => x.enableAutomaticSearch !== false && x.enable !== false);
    let ixState = ix.e ? 'fail' : auto.length ? 'ok' : 'fail';
    let ixTxt = ix.e ? ix.e.message : auto.length ? `${auto.length} av ${list.length} indeksere brukes i automatisk søk` : list.length ? `Ingen av ${list.length} indeksere har automatisk søk på` : `${N} har ingen indeksere`;
    let ixHint = !auto.length && !ix.e ? `Synk indekserne fra Prowlarr (Prowlarr → Apps → ${N} → Sync), og slå på «Enable Automatic Search».` : null;
    if (M.svcConf43('prowlarr').on) {
      const ps = await M.arr43('prowlarr', 'GET', '/indexerstatus').catch(() => null);
      if (Array.isArray(ps) && ps.length) { ixTxt += ` · Prowlarr: ${ps.length} indekser${ps.length === 1 ? '' : 'e'} midlertidig avslått etter feil`; if (ixState === 'ok') ixState = 'warn'; }
    }
    let rel = null;
    if ((svc === 'sonarr' && episodeId) || (svc === 'radarr' && movieId)) {
      const r = await timed(() => M.arr43(svc, 'GET', '/release', { query: svc === 'radarr' ? { movieId } : { episodeId }, timeout: 180_000 }));
      if (r.e) { ixTxt += ` · søket feilet: ${r.e.message}`; ixState = 'fail'; }
      else { rel = releaseSummary50(r.v); ixTxt += ` · ${rel.total} utgivelser, ${rel.accepted} godtatt${rel.reason ? ` (${rel.reason})` : ''}`; if (rel.total && !rel.accepted && ixState === 'ok') ixState = 'warn'; if (!rel.total && ixState === 'ok') ixState = 'warn'; }
    }
    steps.push(step(`${svc}:indexers`, 3, 'Indeksere og utgivelser', ixState, ixTxt, { ms: ix.ms, ...(ixHint ? { hint: ixHint } : {}), ...(rel ? { releases: rel } : {}) }));
    // Ledd 4: grab i historikken.
    const h = await timed(() => (svc === 'radarr' && movieId ? M.arr43('radarr', 'GET', '/history/movie', { query: { movieId, eventType: 1 } }) : M.arr43(svc, 'GET', '/history', { query: { page: 1, pageSize: 5, sortKey: 'date', sortDirection: 'descending', eventType: 1, ...(svc === 'sonarr' && episodeId ? { episodeId } : {}) } })));
    const recs = (Array.isArray(h.v) ? h.v : h.v?.records ?? []).filter((r) => r.eventType === 'grabbed' || r.eventType === 1).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const g = recs[0];
    const gAge = g ? Date.now() - Date.parse(g.date) : Infinity;
    steps.push(step(`${svc}:grab`, 4, 'Grab', h.e ? 'fail' : !g ? 'warn' : 'ok', h.e ? h.e.message : g ? `Siste grab ${dtf('nb-NO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(g.date))}: ${short(g.sourceTitle, 80)}${gAge > 7 * 86400_000 ? ' (over en uke siden)' : ''}` : `Ingen grab i historikken${episodeId || movieId ? ' for denne' : ''} – feilen ligger før qBittorrent`, { ms: h.ms }));
    // Ledd 5: nedlastingsklienten i Sonarr/Radarr.
    const dc = await timed(() => M.arr43(svc, 'GET', '/downloadclient'));
    const clients = (Array.isArray(dc.v) ? dc.v : []).filter((x) => /qbittorrent/i.test(x.implementation ?? x.implementationName ?? ''));
    const on = clients.filter((x) => x.enable !== false);
    if (dc.e) steps.push(step(`${svc}:client`, 5, 'Nedlastingsklient', 'fail', dc.e.message, { ms: dc.ms }));
    else if (!on.length) steps.push(step(`${svc}:client`, 5, 'Nedlastingsklient', 'fail', clients.length ? `qBittorrent er slått av i ${N}` : `${N} har ingen qBittorrent-klient`, { ms: dc.ms, hint: `${N} → Settings → Download Clients → + → qBittorrent.` }));
    else {
      const tests = await M.arr43(svc, 'POST', '/downloadclient/testall').catch((e) => ({ error: e.message }));
      const health = await M.arr43(svc, 'GET', '/health').catch(() => []);
      const hMsgs = (Array.isArray(health) ? health : []).filter((x) => /DownloadClient/i.test(x.source ?? '')).map((x) => x.message);
      const res = on.map((cl) => {
        const t = Array.isArray(tests) ? tests.find((x) => x.id === cl.id) : null;
        const fails = (t?.validationFailures ?? []).filter((v) => !v.isWarning).map((v) => v.errorMessage);
        const warns = (t?.validationFailures ?? []).filter((v) => v.isWarning).map((v) => v.errorMessage);
        const host = String(fieldOf(cl, 'host') ?? ''), port = fieldOf(cl, 'port'), cat = String(fieldOf(cl, svc === 'radarr' ? 'movieCategory' : 'tvCategory') ?? ''), initial = fieldOf(cl, 'initialState');
        if (cat) cats.add(cat);
        return { id: cl.id, name: cl.name, host, port: port ?? null, useSsl: !!fieldOf(cl, 'useSsl'), urlBase: fieldOf(cl, 'urlBase') || null, category: cat || null, initialState: initial ?? null, password: fieldOf(cl, 'password') ? 'satt' : 'ikke satt',
          ok: t ? t.isValid !== false && !fails.length : !tests?.error, errors: fails, warnings: warns };
      });
      const bad = res.filter((x) => !x.ok);
      const local = res.find((x) => LOCAL.test(x.host));
      const stopped = res.find((x) => x.initialState === 2 || /stop|pause/i.test(String(x.initialState)));
      const msg = bad.length ? `${bad[0].name} (${bad[0].host}:${bad[0].port}): ${bad[0].errors[0] ?? tests?.error ?? 'testen feilet'}` : hMsgs.length ? hMsgs[0] : `${res.map((x) => `${x.name} → ${x.host}:${x.port}${x.category ? ` · kategori ${x.category}` : ''}`).join(' · ')} · testen er grønn`;
      const hint = bad.length && local ? `${N} peker på ${local.host}:${local.port}. I Docker er det ${N}-containeren selv – bruk containernavnet (f.eks. qbittorrent:8080, eller gluetun:8080 når qBittorrent går gjennom VPN-containeren) eller vertens IP.`
        : bad.length ? 'Sjekk adresse, port, brukernavn og passord i nedlastingsklienten. Legg Docker-nettet i «Bypass authentication for clients in whitelisted IP subnets» i qBittorrent, eller sjekk at IP-en ikke er utestengt.'
          : stopped ? `Initial State er Stop/Pause i ${N} – sett «Initial State: Start».` : null;
      steps.push(step(`${svc}:client`, 5, 'Nedlastingsklient', bad.length ? 'fail' : hMsgs.length || stopped ? 'warn' : 'ok', stopped && !bad.length && !hMsgs.length ? `${msg} · nye torrenter legges til stoppet` : msg, { ms: dc.ms, clients: res, ...(hint ? { hint } : {}) }));
    }
  }
  // Ledd 6: qBittorrent (Homelabs egen tilkobling).
  const qc = M.svcConf43('qbit');
  if (!qc.on) steps.push(step('qbit', 6, 'qBittorrent', 'skip', 'qBittorrent er ikke satt opp i Homelab, så køen kan ikke leses herfra.', { hint: 'Innstillinger → Integrasjoner → Media → qBittorrent.' }));
  else {
    const t = await M.mediaTest43('qbit');
    if (!t.ok) {
      const auth = /passord|sperret/i.test(t.message ?? '');
      steps.push(step('qbit', 6, 'qBittorrent', 'fail', auth ? `Innlogging avvist: ${t.message}` : `qBittorrent svarer ikke: ${t.message}`, { ms: t.ms,
        hint: auth ? 'Riktig brukernavn og passord, eller legg Docker-nettet i «Bypass authentication for clients in whitelisted IP subnets». For mange feil gir utestengt IP en stund.' : 'Kjører containeren? Går den gjennom VPN-containeren (gluetun), bruk dens navn og port.' }));
    } else {
      const major = +(String(t.version ?? '').match(/^(\d+)/)?.[1] ?? 0);
      const [prefs, info, catsQ, main] = await Promise.all([M.qb43('GET', '/app/preferences').catch(() => ({})), M.qb43('GET', '/transfer/info').catch(() => ({})), M.qb43('GET', '/torrents/categories').catch(() => ({})), M.qb43('GET', '/sync/maindata', { query: { rid: '0' } }).catch(() => null)]);
      const problems = [], warns = [], hints = [];
      const conn = info?.connection_status;
      if (conn === 'disconnected') { problems.push(`ingen nettforbindelse${prefs?.current_network_interface ? ` (bundet til ${prefs.current_network_interface} – VPN nede?)` : ''}`); hints.push('qBittorrent er bundet til VPN-grensesnittet, men VPN er nede. Start VPN-containeren på nytt.'); }
      const addStopped = prefs?.add_stopped_enabled ?? prefs?.start_paused_enabled;
      if (addStopped === true) { warns.push('nye torrenter legges til stoppet («Start torrent automatically» er av)'); hints.push('qBittorrent → Innstillinger → Nedlastinger: slå på «Start torrent automatically». Homelab starter torrenter fra Media selv i mellomtiden.'); }
      if (prefs?.queueing_enabled && (prefs.max_active_downloads === 0 || prefs.max_active_torrents === 0)) { problems.push('maks aktive nedlastinger er 0'); hints.push('qBittorrent → Innstillinger → BitTorrent → Torrent-kø: sett «Maks aktive nedlastinger» til minst 3.'); }
      const free = main?.server_state?.free_space_on_disk;
      if (Number.isFinite(free) && free < 2 * 1024 ** 3) { problems.push(`lite diskplass (${gbText(free)} igjen)`); hints.push('qBittorrent stopper nedlastinger når disken er nesten full. Rydd plass.'); }
      const missingCats = [...cats].filter((c) => catsQ && typeof catsQ === 'object' && !(c in catsQ));
      if (missingCats.length) { warns.push(`kategorien ${missingCats.join(', ')} finnes ikke`); hints.push('Kategorien opprettes vanligvis av Sonarr/Radarr ved første grab. Sjekk lagringsstien (skrivbar for containeren, PUID/PGID).'); }
      const torrents = main?.torrents ? Object.entries(main.torrents).map(([hash, x]) => ({ hash, ...x })) : await M.qb43('GET', '/torrents/info').catch(() => []);
      const inCat = (Array.isArray(torrents) ? torrents : []).filter((x) => !cats.size || cats.has(x.category));
      const stoppedT = inCat.filter((x) => /^(stoppedDL|pausedDL)$/.test(x.state)), errT = inCat.filter((x) => /^(error|missingFiles)$/.test(x.state)), queuedT = inCat.filter((x) => x.state === 'queuedDL'), stalledT = inCat.filter((x) => x.state === 'stalledDL');
      if (errT.length) { problems.push(`${errT.length} torrent${errT.length === 1 ? '' : 'er'} med feil (${errT[0].state})`); hints.push('Ofte en lagringsmappe som ikke finnes eller ikke er skrivbar for containeren.'); }
      if (stoppedT.length) warns.push(`${stoppedT.length} stoppet`);
      if (queuedT.length) warns.push(`${queuedT.length} i kø`);
      if (stalledT.length) warns.push(`${stalledT.length} står fast`);
      const head = `qBittorrent ${t.version ?? ''} svarer (${t.ms} ms)${major >= 5 ? ' · 5.x (stop/start)' : major ? ' · 4.x (pause/resume)' : ''}${conn ? ` · ${conn === 'connected' ? 'tilkoblet' : conn === 'firewalled' ? 'bak brannmur' : 'frakoblet'}` : ''}`;
      steps.push(step('qbit', 6, 'qBittorrent', problems.length ? 'fail' : warns.length ? 'warn' : 'ok', [head, ...problems, ...warns].join(' · '), { ms: t.ms, version: t.version ?? null, ...(hints.length ? { hint: hints.join(' ') } : {}),
        torrents: [...errT, ...stoppedT, ...queuedT, ...stalledT].slice(0, 10).map((x) => ({ hash: x.hash, name: x.name, state: x.state, progress: Math.floor((x.progress ?? 0) * 100), category: x.category ?? '', ...(/^(stoppedDL|pausedDL)$/.test(x.state) ? { action: ACT.start(x.hash) } : {}) })) }));
    }
  }
  const failed = steps.find((s) => s.state === 'fail') ?? null;
  return { ok: !failed, at: new Date().toISOString(), summary: failed ? `Ledd ${failed.n} feiler: ${failed.title} – ${short(failed.text, 120)}` : steps.some((s) => s.state === 'warn') ? 'Kjeden virker, men noe bør sjekkes' : 'Hele kjeden er grønn', failed, steps,
    legend: { 2: 'Sonarr/Radarr og kommandoen', 3: 'Indeksere (Prowlarr) og utgivelser', 4: 'Grab', 5: 'Nedlastingsklient i Sonarr/Radarr', 6: 'qBittorrent' } };
}

/* =====================================================================================================================
   Ruter og mellomvare
   ===================================================================================================================== */

export const trackingApi = new Hono();
const H = (fn) => async (c) => { try { const r = await fn(c); return r instanceof Response ? r : c.json(r); } catch (e) { return M.mediaFail43(c, e instanceof M.MediaError ? e : Object.assign(new M.MediaError(e.message, e.status ?? 500))); } };
const G = [authOrToken, M.mediaGuard43], A = [authOrToken, M.mediaGuard43, M.mediaAdmin43];
const own = (c, t) => t && (t.user === c.get('user') || isAdmin(c.get('user')));

// Sporing
trackingApi.post('/track', ...G, H(async (c) => {
  const b = await M.mediaBody43(c);
  const t = newTrack50({ user: c.get('user'), episodeIds: b.episodeIds ?? b.episodeId, movieIds: b.movieIds ?? b.movieId, seriesId: b.seriesId != null ? +b.seriesId : null, seasonNumber: b.seasonNumber != null ? +b.seasonNumber : null, commandId: b.commandId ?? null, grabbed: !!b.grabbed });
  return c.json(await trackOut(t, isAdmin(c.get('user'))), 201);
}));
trackingApi.get('/track/:id', ...G, H(async (c) => {
  const t = TRACKS.get(c.req.param('id'));
  if (!own(c, t)) throw new M.MediaError('Fant ikke sporingen (den varer i 6 timer)', 404);
  return trackOut(t, isAdmin(c.get('user')));
}));
trackingApi.get('/track', ...G, H(async (c) => {
  const ep = +c.req.query('episodeId') || null, mv = +c.req.query('movieId') || null;
  if (!ep && !mv) throw new M.MediaError('Bruk episodeId eller movieId', 400);
  const u = c.get('user');
  let t = [...TRACKS.values()].reverse().find((x) => (x.user === u || isAdmin(u)) && (ep ? x.episodeIds.includes(ep) : x.movieIds.includes(mv)));
  if (!t) t = newTrack50({ user: u, episodeIds: ep, movieIds: mv });
  return trackOut(t, isAdmin(u));
}));
// qBittorrent 5.x: start (4.x: resume). Brukes av «Start» på kortet og i diagnostikken.
trackingApi.post('/torrents/:hash{[a-fA-F0-9]{40}|[a-fA-F0-9]{64}}/start', ...G, H(async (c) => {
  const h = c.req.param('hash').toLowerCase();
  await M.qbVerb43('start', 'resume', h);
  M.clearMedia43('qbit:'); M.clearMedia43('queue');
  const t = (await qbList().catch(() => [])).find((x) => String(x.hash).toLowerCase() === h) ?? null;
  return { ok: true, hash: h, torrent: t ? { hash: h, name: t.name, state: t.state } : null, message: 'Startet' };
}));
// Diagnostikk (bare admin)
trackingApi.get('/diagnostics', ...A, H(async (c) => M.cached43(`diag50:${c.req.query('service') ?? ''}`, 8000, () => diagnose50({ service: ['sonarr', 'radarr'].includes(c.req.query('service')) ? c.req.query('service') : null }))));
trackingApi.post('/diagnostics', ...A, H(async (c) => {
  const b = await M.mediaBody43(c);
  const ep = +b.episodeId || null, mv = +b.movieId || null;
  return diagnose50({ service: mv ? 'radarr' : ep ? 'sonarr' : ['sonarr', 'radarr'].includes(b.service) ? b.service : null, episodeId: ep, movieId: mv });
}));

/** Etter POST /api/media/command og /api/media/glimt: legg `track` i svaret (sann status i stedet for «Søker»). */
export const trackMw = async (c, next) => {
  await next();
  if (c.req.method !== 'POST' || c.res?.status !== 200) return;
  let j;
  try { j = await c.res.clone().json(); } catch { return; }
  const u = c.get('user');
  if (!u || !j || typeof j !== 'object') return;
  let t = null;
  try {
    if (/\/command$/.test(c.req.path) && j.ok && j.id != null) {
      const b = await c.req.json().catch(() => ({}));
      const name = String(b?.name ?? j.name ?? '');
      if (!/Search$/.test(name)) return;
      t = newTrack50({ user: u, episodeIds: b.episodeIds, movieIds: b.movieIds ?? b.movieId, seriesId: b.seriesId != null ? +b.seriesId : null, seasonNumber: b.seasonNumber != null ? +b.seasonNumber : null, commandId: j.id, name });
    } else if (/\/glimt$/.test(c.req.path) && j.commandId != null && (j.episode?.episodeId ?? j.episode?.id)) {
      t = newTrack50({ user: u, episodeIds: [j.episode.episodeId ?? j.episode.id], commandId: j.commandId, name: 'EpisodeSearch' });
    }
  } catch { return; }
  if (!t) return;
  const headers = new Headers(c.res.headers);
  headers.delete('content-length');
  c.res = new Response(JSON.stringify({ ...j, track: { id: t.id, url: `/api/media/track/${t.id}`, state: 'searching', text: `Søker i indekserne via ${SVC_NAME[t.svc]} …`, pollMs: 2500 } }), { status: 200, headers });
};