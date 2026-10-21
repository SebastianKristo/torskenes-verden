// Prompt 43 (PWA43): Media på mobil – Sonarr, Radarr, qBittorrent og Prowlarr (claude-code-media-arr.md, fasit
// design/Media.dc.html variant «mobile», retning 2a). Mer → Media, fullskjerm med «‹ Tilbake», pille-faner
// (Kommer snart · Sonarr · Radarr · qBittorrent · Prowlarr), Glimt (✦), innstillinger (⚙) og arkene fra fasiten.
// Alle tall kommer fra Homelab-backend (/api/media/*, SERVER43). Mangler et endepunkt (404) vises en rolig tomtilstand.
// API-nøklene ligger bare på serveren. Lastes med dynamisk import fra mobile.js (TDZ i sykliske importer).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { glimtOrb } from './mobile-orb43.js';

/* =====================================================================
   Tilstand, hjelpere og API
   ===================================================================== */
const LS = 'papir_media43';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
const lsPut = (o) => { try { localStorage.setItem(LS, JSON.stringify({ ...lsGet(), ...o })); } catch {} };
const SET0 = { nDone: true, nFail: true, cal: true, player: 'Jellyfin' };
export const M = {
  tab: 'kom', det: null, srch: null, libF: 'all', seg: 'all', fq: 'all', open: {}, sh: null, glM: false, gq: '', gl: null,
  add: null, act: null, edit: null, mag: null, ia: null, idxT: {}, grab: {}, set: { ...SET0, ...(lsGet().set ?? {}) },
  // Prompt 44: felles servervalg (media_site), søk i biblioteket, Uke · Liste i Kommer snart (media_komv), slett-bekreftelse.
  site: (() => { try { return localStorage.getItem('media_site') || null; } catch { return null; } })(), lq: { s: '', m: '' }, komv: (() => { try { return localStorage.getItem('media_komv') === 'uke' ? 'uke' : 'liste'; } catch { return 'liste'; } })(), fdel: null,
};
const D = { status: null, upc: null, ser: null, mov: null, prof: null, roots: null, tor: null, xfer: null, idx: null, schema: null, sd: {}, md: {}, rel: {}, files: {}, err: {}, miss: {}, t: {}, busy: {} };
const pad = (n) => String(n).padStart(2, '0');
const code = (s, e) => `S${pad(s)}E${pad(e)}`;
const nb = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const gbT = (g) => (g == null || !isFinite(g) || g <= 0 ? 'størrelse ukjent' : g < 1 ? `${Math.round(g * 1024)} MB` : `${nb(g)} GB`);
const mbT = (v) => `${nb(v)} MB/s`;
const etaT = (sec) => (!isFinite(sec) || sec <= 0 || sec >= 8640000 ? '∞' : sec < 60 ? 'under 1 min' : sec < 3600 ? `${Math.ceil(sec / 60)} min` : `${Math.floor(sec / 3600)} t ${Math.round((sec % 3600) / 60)} min`);
const tbT = (b) => (b >= 1024 ** 4 ? `${nb(b / 1024 ** 4)} TB` : b >= 1024 ** 3 ? `${nb(b / 1024 ** 3)} GB` : `${Math.round(b / 1024 ** 2)} MB`);
const C = ['#2e3b4a', '#3f5a4a', '#6b3b2e', '#7a5a2a', '#4a6b3a', '#5a4a6b', '#3c4a5c', '#2f2f36', '#6b4a3a', '#3a5a6b', '#5c3c4a', '#4a4a2e'];
const col = (s) => { let h = 0; for (const ch of String(s ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return C[h % C.length]; };
const tint = (c) => `color-mix(in srgb, ${c} 15%, transparent)`;
const ST = { ok: ['Lastet ned', '#2f6b4a'], dl: ['Lastes ned', 'var(--pp-lab)'], miss: ['Mangler', '#a0671a'], stall: ['Står fast', '#a0671a'], pause: ['Pauset', '#8a8478'], wait: ['Venter', '#8a8478'], ann: ['Annonsert', '#8a8478'], off: ['Ikke overvåket', '#8a8478'] };
const stv = (k, pc) => { const s = ST[k] ?? ST.wait; return { sT: (k === 'dl' || k === 'pause') && pc != null ? `${s[0]} ${Math.floor(pc)} %` : s[0], sC: s[1], dot: s[1] }; };
const PROF = ['Any', 'HD-720p', 'HD-1080p', 'HD - 720p/1080p', 'Ultra-HD'];
const PRES = { Any: 1080, 'HD-720p': 720, 'HD-1080p': 1080, 'HD - 720p/1080p': 1080, 'Ultra-HD': 2160 };
const MON = [['all', 'Alle episoder'], ['future', 'Fremtidige episoder'], ['missing', 'Manglende episoder'], ['existing', 'Eksisterende episoder'], ['firstSeason', 'Første sesong'], ['lastSeason', 'Siste sesong'], ['pilot', 'Bare pilot'], ['none', 'Ingen']];
const STY = [['standard', 'Standard'], ['daily', 'Daglig'], ['anime', 'Anime']];
const AV = [['announced', 'Annonsert'], ['inCinemas', 'På kino'], ['released', 'Utgitt digitalt']];
const lbl = (L, k) => (L.find((x) => x[0] === k) ?? L[0])[1];
const TABS = [['kom', 'Kommer snart'], ['son', 'Sonarr'], ['rad', 'Radarr'], ['qb', 'qBittorrent'], ['pro', 'Prowlarr'], ['avs', 'Avspilling']]; // prompt 44: Avspilling etter Prowlarr
const ITYP = { public: ['Offentlig', '#2f6b4a'], private: ['Privat', '#b23a2a'], semiPrivate: ['Semi-privat', '#a0671a'], usenet: ['Usenet', '#2b5d8a'] };
const svg = (d, s = 18, w = 2, fill = 'none') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const IC = {
  gear: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', dl: 'M12 4v11M7 10l5 5 5-5M5 20h14', srch: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  inter: 'M4 6h16M4 12h16M4 18h10', redl: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5', bm: 'M6 3h12v18l-6-4-6 4z', del: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', pause: 'M9 5v14M15 5v14', mag: 'M6 4v7a6 6 0 0 0 12 0V4M6 4h4v7a2 2 0 0 0 4 0V4h4M6 8h4M14 8h4',
};
const PLAY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const nbN = (n) => Number(n ?? 0).toLocaleString('nb-NO');
const wideOn = () => innerWidth >= 600; // stor skjerm (iPad, Fold): plakatvegg + valgt serie/film i høyre kolonne
const webCols = () => innerWidth >= 900; // Kommer snart som 7 kolonner (som web)

// Prompt 44: ?server= på alle Media-kall (felles sted for Sonarr, Radarr, qBittorrent og Prowlarr). Mangler valgt sted en
// tjeneste, brukes standardstedet (serverne sier fra med 'fallback' i svaret, eller vi ser det i /servers-lista).
const siteQ = (path) => (M.site && !/[?&]server=/.test(path) && !/^\/servers/.test(path) ? `${path}${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(M.site)}` : path);
async function mApi(path, opts) {
  try { return await hlApi(`/media${siteQ(path)}`, opts); }
  catch (e) {
    // Én ny runde ved 502/503/504 (proxy/indekser som er treg), med 2 s pause.
    if ([502, 503, 504].includes(e.status) && !(opts?.method && opts.method !== 'GET')) { await new Promise((r) => setTimeout(r, 2000)); return hlApi(`/media${siteQ(path)}`, opts); }
    throw e;
  }
}
/** Radarr: /movies (kontrakten) med /movie som reserve. */
let RADP = '/movies';
async function rApi(sub, opts) {
  try { return await mApi(`${RADP}${sub}`, opts); }
  catch (e) { if (e.status === 404 && RADP === '/movies') { try { const r = await mApi(`/movie${sub}`, opts); RADP = '/movie'; return r; } catch (e2) { throw e2; } } throw e; }
}
const errText = (e) => (e?.status === 401 ? 'Utlogget fra Homelab · logg inn igjen' : e?.status === 504 ? 'Tjenesten brukte for lang tid · prøv igjen' : e?.status === 404 ? 'Krever en nyere Homelab-server' : e?.status === 403 ? 'Du har ikke tilgang til Media. Be en administrator om tilgang.' : e?.status === 503 || /ECONNREFUSED|ikke konfigurert|not configured/i.test(e?.message ?? '') ? 'Tjenesten er ikke satt opp eller svarer ikke' : e?.message ?? 'Noe gikk galt');
async function load(key, fn, force = false, max = 20000) {
  if (D.busy[key] || (!force && D.t[key] && Date.now() - D.t[key] < max)) return;
  D.busy[key] = true;
  try { await fn(); D.err[key] = ''; D.miss[key] = false; }
  catch (e) { D.err[key] = errText(e); if (e.status === 404) D.miss[key] = true; if (e.status === 403) D.err.forbid = D.err[key]; }
  D.busy[key] = false; D.t[key] = Date.now();
}
const arr = (r, ...keys) => { if (Array.isArray(r)) return r; for (const k of keys) if (Array.isArray(r?.[k])) return r[k]; return []; };

/* ---------- Normalisering (tåler både Sonarr/Radarr/qBittorrent-felter og forenklede felter fra backend) ---------- */
const fan = (o) => o?.fanart ?? o?.fanartUrl ?? o?.backdrop ?? (o?.images ?? []).find((i) => (i.coverType ?? i.type) === 'fanart')?.remoteUrl ?? (o?.images ?? []).find((i) => (i.coverType ?? i.type) === 'fanart')?.url ?? null;
const img = (o) => o?.poster ?? o?.posterUrl ?? o?.image ?? (o?.images ?? []).find((i) => (i.coverType ?? i.type) === 'poster')?.remoteUrl ?? (o?.images ?? []).find((i) => (i.coverType ?? i.type) === 'poster')?.url ?? null;
const profList = (k) => (Array.isArray(D.prof) ? D.prof : (k === 'm' ? D.prof?.radarr : D.prof?.sonarr) ?? []);
const profName = (id, fb, k = 's') => profList(k).find((p) => String(p.id) === String(id))?.name ?? fb ?? (id != null ? `Profil ${id}` : 'HD-1080p');
const isPast = (iso) => !!iso && Date.parse(iso) <= Date.now();
const statKey = (s) => {
  const v = String(s ?? '').toLowerCase();
  if (ST[v]) return v; // SERVER43 sender nøklene direkte (ok, dl, miss, stall, pause, wait, ann, off)
  if (/^(ok|downloaded|hasfile|imported|done|completed|seed)/.test(v)) return 'ok';
  if (/stall|warning|fail|error|står/.test(v)) return 'stall';
  if (/paus|stopp/.test(v)) return 'pause';
  if (/download|lastes|grab/.test(v)) return 'dl';
  if (/miss|mangler/.test(v)) return 'miss';
  if (/unmon|off|ikke over/.test(v)) return 'off';
  if (/announ|annon|ann$/.test(v)) return 'ann';
  return v ? 'wait' : '';
};
function nSer(x) {
  if (!x) return null;
  const st = x.statistics ?? {}, E = x.episodes && !Array.isArray(x.episodes) ? x.episodes : {};
  const have = x.have ?? E.have ?? st.episodeFileCount ?? 0, aired = x.aired ?? E.total ?? st.episodeCount ?? have;
  const miss = x.missing ?? x.missingCount ?? E.missing ?? Math.max(0, aired - have);
  return { id: x.id, tvdbId: x.tvdbId, t: x.title ?? x.name ?? '', y: x.year ?? '', net: x.network ?? '', ended: x.ended ?? String(x.status ?? '').toLowerCase() === 'ended',
    poster: img(x), c: x.color ?? col(x.title), prof: x.profile ?? x.qualityProfile ?? profName(x.qualityProfileId ?? x.profileId), profId: x.qualityProfileId ?? x.profileId, typ: x.seriesType ?? (x.type !== 'series' ? x.type : null) ?? 'standard',
    mon: x.monitor ?? x.monitorNewItems ?? x.addOptions?.monitor ?? (x.monitored === false ? 'none' : 'all'), monitored: x.monitored !== false,
    have, aired, miss, next: x.nextAiring ?? x.next ?? null, nextCode: x.nextCode ?? null, seasons: x.seasons ?? [], path: x.path ?? '', play: x.play ?? null,
    fanart: fan(x), runtime: x.runtime ?? null, genres: x.genres ?? [], overview: x.overview ?? '', size: x.sizeOnDisk ?? st.sizeOnDisk ?? x.size ?? null, lang: x.originalLanguage?.name ?? x.language ?? '', yEnd: x.ended || String(x.status ?? '').toLowerCase() === 'ended' ? (x.lastAired ? new Date(x.lastAired).getFullYear() : '') : '' };
}
function nMov(x) {
  if (!x) return null;
  const f = x.movieFile ?? x.file ?? null, has = x.hasFile ?? x.downloaded ?? !!f;
  const q = f?.quality?.quality?.name ?? f?.quality?.name ?? f?.quality ?? x.quality ?? '';
  return { id: x.id, tmdbId: x.tmdbId, t: x.title ?? '', y: x.year ?? '', poster: img(x), c: x.color ?? col(x.title), prof: x.profile ?? x.qualityProfile ?? profName(x.qualityProfileId ?? x.profileId, null, 'm'), profId: x.qualityProfileId ?? x.profileId,
    st: ST[x.status] ? x.status : null, pc: x.progress ?? null, play: x.play ?? null,
    av: x.minimumAvailability ?? x.availability ?? 'released', has, mon: x.monitored !== false, q: String(q || ''), size: f?.size ?? x.sizeOnDisk ?? null, path: f?.path ?? f?.relativePath ?? x.path ?? '',
    fanart: fan(x), runtime: x.runtime ?? null, genres: x.genres ?? [], overview: x.overview ?? '', lang: x.originalLanguage?.name ?? x.language ?? '', fileId: f?.id ?? x.movieFileId ?? null, status: x.status ?? '', note: x.note ?? (x.inCinemas && !isPast(x.inCinemas) ? `På kino ${new Date(x.inCinemas).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}` : ''), queue: x.queue ?? null, digital: x.digitalRelease ?? null };
}
function movSt(x) {
  if (x.st) return [x.st, x.pc];
  if (x.has) return ['ok'];
  const q = x.queue;
  if (q) { const k = statKey(q.status ?? q.trackedDownloadState ?? 'downloading'); return [k === 'ok' ? 'dl' : k, q.progress ?? (q.size ? (1 - (q.sizeleft ?? 0) / q.size) * 100 : null)]; }
  if (!x.mon) return ['off'];
  if (/announced/i.test(x.status) && !x.has) return ['ann'];
  return ['miss'];
}
function nEp(e) {
  const air = e.airDateUtc ?? e.airUtc ?? e.airDate ?? e.date ?? e.air ?? null, en = e.episodeNumber ?? e.number ?? e.episode ?? e.e;
  return { id: e.id, s: e.seasonNumber ?? e.season ?? e.s, e: typeof en === 'number' ? en : +String(en ?? '').replace(/\D/g, '') || 0, n: e.title ?? e.name ?? `Episode ${en ?? ''}`, air, aired: e.aired ?? (air ? isPast(air) : false),
    has: e.hasFile ?? e.downloaded ?? e.has ?? false, mon: e.monitored !== false && e.mon !== false, queue: e.queue ?? null, status: e.status ?? null, progress: e.progress ?? null, fileId: e.episodeFileId ?? e.fileId ?? e.episodeFile?.id ?? null, q: e.episodeFile?.quality?.quality?.name ?? e.quality ?? '' };
}
function epSt(ep) {
  if (ep.has) return ['ok'];
  const q = ep.queue;
  if (q) { const k = statKey(q.status ?? q.trackedDownloadState ?? 'downloading'); return [k === 'ok' ? 'dl' : k, q.progress ?? (q.size ? (1 - (q.sizeleft ?? 0) / q.size) * 100 : null)]; }
  if (ep.status) { const k = statKey(ep.status); if (k) return [k, ep.progress ?? null]; }
  if (!ep.mon) return ['off'];
  return ep.aired ? ['miss'] : ['wait'];
}
const dateNo = (iso, o) => (iso ? new Date(iso).toLocaleDateString('nb-NO', o ?? { day: 'numeric', month: 'short' }).replace('.', '') : '');
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function nUpc(x) {
  const mv = x.kind === 'movie' || x.type === 'movie' || (x.tmdbId != null && x.seasonNumber == null && x.episodeNumber == null && !x.seriesId);
  if (mv) {
    const air = x.airDateUtc ?? x.airUtc ?? x.date ?? x.digitalRelease ?? x.physicalRelease ?? x.inCinemas;
    const [k, pc] = x.status ? [statKey(x.status), x.progress] : movSt(nMov(x));
    return { kind: 'm', id: x.movieId ?? x.id, t: x.title ?? '', e: 'Film', n: x.episodeTitle ?? x.note ?? 'Digital utgivelse', air, day: x.date ?? (air ? isoDay(new Date(air)) : null), tm: '', c: x.color ?? col(x.title), poster: img(x), k: k || 'miss', pc };
  }
  const ser = x.series ?? {}, t = x.seriesTitle ?? ser.title ?? x.show ?? x.title ?? '', ep = nEp(x);
  const [k, pc] = x.status && !x.queue ? [statKey(x.status), x.progress ?? null] : epSt(ep);
  const air = x.airUtc ?? ep.air;
  return { kind: 's', id: x.seriesId ?? ser.id, t, e: x.code ?? code(ep.s, ep.e), n: x.episodeTitle ?? (x.series ? x.title : ep.n) ?? '', air, day: x.date ?? (air ? isoDay(new Date(air)) : null), tm: x.time ?? hhmm(air), c: x.color ?? col(t), poster: img(ser) ?? img(x), k: k || 'wait', pc };
}
const qOf = (name) => (/2160p|4k|uhd/i.test(name) ? '2160p' : /1080p/i.test(name) ? '1080p' : /720p/i.test(name) ? '720p' : /480p/i.test(name) ? '480p' : '—');
const TST = { dl: 'dl', seed: 'seed', stall: 'stall', error: 'stall', meta: 'meta', pause: 'dl', queued: 'wait', check: 'dl' };
function nTor(x) {
  const name = x.name ?? x.title ?? '', state = String(x.state ?? x.status ?? ''), size = x.size ?? x.total_size ?? x.totalSize ?? 0;
  const srv = x.status != null && TST[x.status] != null; // SERVER43: status + progress i prosent
  const p = x.progress == null ? 0 : srv ? x.progress : x.progress <= 1 && !x.percent ? x.progress * 100 : x.progress;
  const done = srv ? x.status === 'seed' : p >= 100 || /^(uploading|stalledUP|pausedUP|stoppedUP|queuedUP|forcedUP|checkingUP|seed|done|completed)$/i.test(state);
  const st = srv ? TST[x.status] : /metaDL|meta/i.test(state) ? 'meta' : done ? 'seed' : /stalled|error|missingFiles|stall/i.test(state) ? 'stall' : /queued|wait/i.test(state) ? 'wait' : 'dl';
  const pz = srv ? x.status === 'pause' || x.paused === true : x.paused ?? /paused|stopped/i.test(state);
  const sm = name.match(/S(\d\d)E(\d\d)/i), ss = name.match(/\bS(\d\d)\b(?!E)/i);
  const nm = x.show ?? x.seriesTitle ?? x.movieTitle ?? (srv && x.title ? x.title : null) ?? (name.replace(/\./g, ' ').replace(/\s+(19|20)\d\d\b.*$|\s+S\d\d.*$/i, '').trim() || name);
  return { hash: x.hash ?? x.id, nm, ep: x.code || x.episode || (sm ? `S${sm[1]}E${sm[2]}`.toUpperCase() : ss ? `S${ss[1]}` : x.movieTitle || x.kind === 'movie' ? 'Film' : 'Egen'), rel: x.name ?? name, q: x.quality || qOf(name),
    gb: size ? size / 1024 ** 3 : x.gb ?? 0, p: Math.max(0, Math.min(100, p)), st, pz: !!pz && st !== 'seed', spd: (x.dlspeed ?? x.dlSpeed ?? 0) / 1024 ** 2, up: (x.upspeed ?? x.upSpeed ?? 0) / 1024 ** 2, eta: x.eta ?? null,
    c: x.color ?? col(nm), poster: img(x), cat: x.category ?? '', seeds: x.num_seeds ?? x.seeds ?? null, stT: srv ? x.statusText : null, open: x.open ?? null };
}
const torRow = (t) => {
  const short = t.stT && !(t.st === 'dl' && !t.pz) ? t.stT : t.st === 'meta' ? 'Henter metadata …' : t.st === 'seed' ? `Ferdig · deler ↑ ${mbT(t.up || 0)}` : t.st === 'stall' ? `Står fast · ${t.seeds ?? 0} seedere` : t.pz ? 'Pauset' : t.st === 'wait' ? 'Venter i køen' : `${mbT(t.spd)} · ${etaT(t.eta ?? (t.spd ? (t.gb * 1024 * (100 - t.p)) / 100 / t.spd : Infinity))}`;
  return { ...t, short, bc: t.st === 'seed' ? '#2f6b4a' : t.st === 'stall' ? '#c48a1a' : t.pz ? '#a39d90' : 'var(--pp-ink)', lc: t.st === 'stall' ? '#a0671a' : t.st === 'seed' ? '#2f6b4a' : 'var(--pp-mut)' };
};
function nRel(r, i) {
  const qn = typeof r.quality === 'string' ? r.quality : r.quality?.quality?.name ?? r.qualityName ?? '', res = r.quality?.quality?.resolution ?? r.resolution ?? (/2160/.test(qn) ? 2160 : /1080/.test(qn) ? 1080 : /720/.test(qn) ? 720 : /480/.test(qn) ? 480 : 0);
  const langs = (r.languages ?? []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  if (r.langText != null) r.lang = r.langText;
  const subs = r.subtitles ?? r.subs ?? (/nordic/i.test(r.title ?? '') ? ['NO', 'SV', 'DA'] : []);
  const lang = r.lang ?? [langs.length ? `Tale ${langs.map((x) => LNG[x] ?? x).join(' ')}` : '', subs.length ? `Tekst ${subs.join(' ')}` : ''].filter(Boolean).join(' · ');
  return { id: r.guid ?? r.id ?? i, guid: r.guid, indexerId: r.indexerId, rel: r.title ?? r.release ?? '', short: r.shortTitle ?? null, service: r.service ?? null, q: String(qn || `${res}p`), r: res, gb: (r.size ?? 0) / 1024 ** 3 || r.gb || 0, s: r.seeders ?? r.seeds ?? 0, l: r.leechers ?? r.peers ?? 0,
    ix: r.indexer ?? r.indexerName ?? '', partial: r.partial === true || r.canGrab === false, lang, no: r.norwegian ?? (/\bNO\b|norsk|nordic/i.test(lang) || /nordic/i.test(r.title ?? '')), rej: (r.rejections ?? []).map((x) => (typeof x === 'string' ? x : x.reason)).filter(Boolean), best: r.best === true, age: r.ageHours ?? r.age };
}
const LNG = { English: 'EN', Norwegian: 'NO', Swedish: 'SV', Danish: 'DA', Finnish: 'FI', German: 'DE', Japanese: 'JA', French: 'FR', Spanish: 'ES' };
const bestOf = (rows, prof) => { const pr = PRES[prof] ?? 1080; return rows.find((r) => r.best) ?? rows.filter((r) => r.r === pr && r.s > 0 && !r.rej.length).sort((a, b) => b.s - a.s)[0] ?? rows.filter((r) => r.s > 0).sort((a, b) => b.s - a.s)[0]; };

/* ---------- Lasting ---------- */
const loadProf = () => load('prof', async () => { const r = await mApi('/qualityprofiles'); D.prof = Array.isArray(r) ? r : { sonarr: arr(r?.sonarr), radarr: arr(r?.radarr), defaults: r?.defaults ?? {} }; }, false, 600000);
const loadRoots = () => load('roots', async () => { const r = await mApi('/rootfolders'); D.roots = Array.isArray(r) ? r : (r?.disk ?? arr(r, 'items', 'folders')).map((d) => ({ path: d.path, label: d.label, freeSpace: d.freeSpace ?? d.free ?? null, totalSpace: d.totalSpace ?? d.total ?? null, used: d.used ?? null, low: d.low })); D.rootsS = arr(r?.sonarr); D.rootsR = arr(r?.radarr); D.diskLow = r?.lowText ?? null; }, false, 60000);
const loadUpc = (f) => load('upc', async () => { const r = await mApi('/upcoming?days=7'); D.upc = arr(r, 'items', 'upcoming', 'calendar').map(nUpc).filter((x) => x.t); D.upcCfg = r?.configured !== false; }, f);
const loadSer = (f) => load('ser', async () => { await loadProf(); const r = await mApi('/series'); D.ser = arr(r, 'items', 'series').map(nSer); }, f);
const loadMov = (f) => load('mov', async () => { await loadProf(); const r = await rApi(''); D.mov = arr(r, 'items', 'movies').map(nMov); }, f);
const loadTor = (f) => load('tor', async () => {
  const r = await mApi('/torrents');
  D.tor = arr(r, 'items', 'torrents').map(nTor);
  const x = r?.transfer ?? r?.transferInfo ?? r?.server_state ?? null;
  if (x && x.dlSpeed != null) { x.dl_info_speed = x.dlSpeed; x.up_info_speed = x.upSpeed; x.use_alt_speed_limits = !!x.altSpeed; if (x.altLimit) x.alt_dl_limit = x.altLimit; }
  if (x) D.xfer = x; else mApi('/transferinfo').then((y) => { D.xfer = y; }).catch(() => {});
}, f, 1500);
const loadIdx = (f) => load('idx', async () => { const r = await mApi('/indexers'); D.idx = arr(r, 'items', 'indexers'); D.health = (r?.health ?? D.health ?? []).filter?.((h) => h?.message) ?? null; D.apps = r?.apps ?? D.apps ?? null; D.idxSum = r?.summary ?? null; }, f);
const loadStatus = (f) => load('status', async () => {
  D.status = await mApi('/status');
  const st = D.status?.settings; // innstillingene per bruker ligger på serveren
  if (st && !M.setLocal) { M.set = { nDone: st.notifyDone !== false, nFail: st.notifyFail !== false, cal: st.calendar !== false, player: String(st.player ?? 'jellyfin').toLowerCase() === 'plex' ? 'Plex' : 'Jellyfin' }; lsPut({ set: M.set }); }
}, f, 60000);
async function loadSerDet(id, f) {
  await load(`sd${id}`, async () => {
    const r = await mApi(`/series/${encodeURIComponent(id)}`);
    const s = nSer(r?.series ?? r);
    let eps = arr(r, 'episodes');
    if (!eps.length && Array.isArray(r?.seasons)) eps = r.seasons.flatMap((se) => (se.episodes ?? []).map((e) => ({ seasonNumber: se.seasonNumber ?? se.number ?? se.n, ...e })));
    const q = arr(r, 'queue');
    eps = eps.map(nEp).map((e) => ({ ...e, queue: e.queue ?? q.find((y) => y.episodeId === e.id) ?? null }));
    D.sd[id] = { ...s, eps, play: r?.play ?? null, seasonMon: Object.fromEntries((r?.seasons ?? r?.series?.seasons ?? []).map((x) => [x.seasonNumber ?? x.number, x.monitored !== false])) };
  }, f);
}
async function loadMovDet(id, f) { await load(`md${id}`, async () => { const r = await rApi(`/${encodeURIComponent(id)}`); D.md[id] = nMov(r?.movie ?? r); }, f); }
/* Prompt 44: steder/servere (GET /api/media/servers → [{id, name, default, sonarr, radarr, qbit, prowlarr}]). */
const SVC = { son: ['sonarr', 'Sonarr'], rad: ['radarr', 'Radarr'], qb: ['qbit', 'qBittorrent'], pro: ['prowlarr', 'Prowlarr'] };
const loadServers = () => load('servers', async () => {
  const r = await hlApi('/media/servers?status=1');
  D.servers = arr(r, 'items', 'servers', 'sites').map((x) => ({ id: String(x.id), name: x.name ?? x.id, def: !!(x.default ?? x.isDefault), sv: { sonarr: x.sonarr ?? null, radarr: x.radarr ?? null, qbit: x.qbit ?? x.qbittorrent ?? null, prowlarr: x.prowlarr ?? null } }));
  const sel = r?.selected ?? r?.current ?? arr(r, 'items', 'servers', 'sites').find((x) => x.selected)?.id ?? null;
  if (sel && !M.site) M.site = String(sel);
  if (M.site && !D.servers.some((x) => x.id === M.site)) M.site = null;
}, false, 60000);
const siteOf = () => (D.servers ?? []).find((x) => x.id === M.site) ?? (D.servers ?? []).find((x) => x.def) ?? (D.servers ?? [])[0] ?? null;
const svcOk = (sv) => !!sv && (typeof sv !== 'object' || (sv.configured !== false && (sv.url || sv.ok != null || sv.configured || sv.mock)));
const svSt = (sv) => (sv && typeof sv === 'object' ? sv.status ?? sv : null);
function srvRow() {
  const L = D.servers; if (!L?.length || !SVC[M.tab]) return '';
  const cur = siteOf(), [k, n] = SVC[M.tab], sv = cur?.sv?.[k], dflt = L.find((x) => x.def) ?? L[0];
  const miss = cur && !svcOk(sv) && dflt && dflt.id !== cur.id ? `<span class="p44m-miss">${esc(cur.name)} mangler ${esc(n)} · bruker ${esc(dflt.name)}</span>` : '';
  return `<button type="button" class="p44m-srv" data-p43m="srvsh"><i style="background:${svcOk(sv) ? (svSt(sv)?.ok === false ? '#b23a2a' : '#2f6b4a') : '#b9b2a4'}"></i><span>${esc(n)} · <b>${esc(cur?.name ?? 'Standard')}</b></span><span class="mut">Server ›</span></button>${miss}`;
}
function srvSheet() {
  const L = D.servers ?? [], [k, n] = SVC[M.tab] ?? SVC.son, cur = siteOf();
  const st = (sv) => { const z = svSt(sv); return !svcOk(sv) ? ['Ikke satt opp', 'var(--pp-mut)'] : z?.ok === false ? ['Svarer ikke', '#b23a2a'] : z?.ms > 1200 ? [`Treg · ${nb(z.ms / 1000)} s`, '#a0671a'] : ['Tilkoblet', '#2f6b4a']; };
  return sheetWrap(`${shHead('Velg server')}<span class="p43-k mut">VELG SERVER · GJELDER SONARR, RADARR, QBITTORRENT OG PROWLARR</span>
    <div class="p43-card p43-svcs">${L.map((x) => { const sv = x.sv[k], [t, c] = st(sv); return `<button type="button" class="p43-sv p44m-sr" data-p43m="srvpick" data-k="${esc(x.id)}" aria-pressed="${cur?.id === x.id}"><i style="background:${c}"></i><div class="m-grow"><b>${esc(x.name)}${x.def ? ' · standard' : ''}</b><span class="mono mut m-ell">${esc((sv && typeof sv === 'object' ? sv.url : typeof sv === 'string' ? sv : '') || `${n} ikke satt opp`)}</span></div><span class="p43-sm" style="font-weight:700;color:${c}">${esc(t)}</span>${cur?.id === x.id ? '<b class="p44m-ck">✓</b>' : ''}</button>`; }).join('')}</div>
    <a class="p43-btn ghost" href="#/set/integ" data-p43m="shx">+ Legg til ${esc(n)}-server</a>`, 'Velg server');
}
/** Kalles når Media åpnes (mobile.js load) og når fanen byttes. */
export async function mediaLoad43(force = false) {
  const t = M.tab;
  const jobs = [loadStatus(), loadServers()];
  if (t === 'kom') jobs.push(loadUpc(force), loadTor(force));
  if (t === 'son') jobs.push(M.det ? loadSerDet(M.det.id, force) : loadSer(force));
  if (t === 'rad') jobs.push(M.det ? loadMovDet(M.det.id, force) : loadMov(force));
  if (t === 'qb') jobs.push(loadTor(force), loadRoots());
  if (t === 'pro') jobs.push(loadIdx(force));
  if (t === 'avs') { const A = globalThis.P44?.avsMod?.(); if (A) jobs.push(A.avsLoad(force)); }
  await Promise.all(jobs);
}
const reload = (f = true) => mediaLoad43(f).then(() => { if (m.screen === 'media') draw(); }).catch(() => {});

/* =====================================================================
   Tegning
   ===================================================================== */
const chip = (on, n, attrs) => `<button type="button" class="p43-chip${on ? ' on' : ''}" aria-pressed="${on}" ${attrs}>${esc(n)}</button>`;
const poster = (x, w, h, cls = '', inner = '') => `<span class="p43-pst ${cls}" style="${w ? `width:${w}px;` : ''}${h ? `height:${h}px;` : ''}background-color:${esc(x.c ?? '#3c4a5c')}${x.poster ? `;background-image:url('${esc(x.poster)}')` : ''}">${inner}</span>`;
const toggle = (on) => `<span class="p43-tg${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const empty = (key, what) => {
  if (D.err.forbid) return `<div class="p43-empty"><b>Ingen tilgang</b><span>${esc(D.err.forbid)}</span></div>`;
  if (D.miss[key]) return `<div class="p43-empty"><b>${esc(what)} er ikke tilgjengelig ennå</b><span>Media krever en nyere Homelab-server. Oppdater serveren, og sett opp tjenestene under Innstillinger → Integrasjoner → Media.</span><a class="p43-btn" href="#/set/integ">Åpne Integrasjoner ›</a></div>`;
  // Prompt 44 (claude-code-media-mobil-ikke-innlogget.md): samme kilde som Innstillinger (backend-status). Skill mellom «Ikke satt opp»,
  // «Svarer ikke» og «Utlogget fra Homelab» – aldri «ikke logget inn» når backend bare er treg.
  const sk = { upc: 'sonarr', ser: 'sonarr', mov: 'radarr', tor: 'qbittorrent', idx: 'prowlarr' }[key];
  const so = sk && Array.isArray(D.status?.services) ? D.status.services.find((y) => String(y.id ?? y.name).toLowerCase().replace('qbit', 'qbittorrent').replace('qbittorrenttorrent', 'qbittorrent') === sk) : null;
  if (D.err[key] && /Utlogget/.test(D.err[key])) return `<div class="p43-empty"><b>Utlogget fra Homelab</b><span>Logg inn igjen for å se ${esc(what)}.</span><button type="button" class="p43-btn" data-p43m="relogin">Logg inn</button></div>`;
  if (D.err[key] && so && so.configured === false && !so.mock) return `<div class="p43-empty"><b>${esc(what)} er ikke satt opp</b><span>Legg inn adresse og API-nøkkel på serveren under Integrasjoner → Media.</span><a class="p43-btn" href="#/set/integ">Åpne Integrasjoner ›</a></div>`;
  if (D.err[key]) return `<div class="p43-empty"><b>${esc(what)} svarer ikke</b><span>${esc(D.err[key])}</span><span class="p43-row"><button type="button" class="p43-btn" data-p43m="retry">Prøv igjen</button><a class="p43-btn ghost" href="#/set/integ">Integrasjoner ›</a></span></div>`;
  return '<div class="m-spin"></div>';
};

function header() {
  return `<div class="p43-top"><div class="p43-tr"><button type="button" class="p43-back" data-p43m="back"><span aria-hidden="true">‹</span>Tilbake</button><span class="m-grow"></span>
      <button type="button" class="p43-ib lab${M.glM ? ' on' : ''}" data-p43m="gltog" aria-label="Spør Glimt" aria-expanded="${M.glM}">✦</button><button type="button" class="p43-ib" data-p43m="set" aria-label="Innstillinger for Media">${svg(IC.gear, 18)}</button></div>
    <b class="p43-h1">Media</b>
    ${M.glM ? `<form class="p43-glf" data-p43mf="gl"><span aria-hidden="true">✦</span><input id="p43-gq" name="q" value="${esc(M.gq)}" placeholder="«legg til Severance i 4K»" autocomplete="off" enterkeyhint="send" aria-label="Spør Glimt om Media"></form>` : ''}
    <div class="p43-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" class="p43-tab${M.tab === k ? ' on' : ''}" aria-selected="${M.tab === k}" data-p43m="tab" data-k="${k}">${n}</button>`).join('')}</div></div>`;
}

function glimtPanel() {
  const G = M.gl; if (!G) return '';
  const R = G.res;
  const steps = (G.steps ?? []).map((s) => `<div class="p43-gs"><span>✓ ${esc(s.n)}</span><span>${esc(s.ms != null ? `${s.ms} ms` : '')}</span></div>`).join('');
  let body = '';
  if (R?.text) body += `<b class="p43-gt">${esc(R.text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</b>`;
  if (R?.list?.length) body += `<b class="p43-gt">${esc(R.listH ?? '')}</b><div class="p43-gl">${R.list.map((o, i) => { const g = !!M.grab[`gl:${i}`]; return `<div class="p43-glr"><div class="m-grow"><span class="p43-glh"><b class="mono">${esc(o.cd ?? '')}</b><span style="color:${o.has ? 'var(--pp-mut)' : '#a0671a'}">${esc(o.en ?? '')}${o.en ? (o.has ? ' · har den' : ' · mangler') : ''}</span></span><span class="p43-rel">${esc(o.r.rel)}</span><span class="p43-rm"><span class="p43-q">${esc(o.r.q)}</span><b style="color:#2f6b4a">${gbT(o.r.gb)}</b><b>▲ ${nbN(o.r.s)} / ${nbN(o.r.l)}</b><span class="mut">${esc(o.r.ix)}</span></span></div><button type="button" class="p43-dlb${g ? ' ok' : ''}" data-p43m="glgrab" data-i="${i}" aria-label="Last ned">${g ? '✓' : svg(IC.dl, 18, 2.4)}</button></div>`; }).join('')}</div>`;
  if (R?.hit) { const h = R.hit; body += `<div class="p43-ghit">${poster(h, 48, 72)}<div class="m-grow"><b class="p43-serif22">${esc(h.t)}</b><span class="mut">${esc(h.meta ?? '')}</span><b class="p43-sm">${esc(h.line ?? '')}</b></div><div class="p43-row"><button type="button" class="p43-btn ink" data-p43m="glhit">${h.ex ? 'Åpne' : 'Legg til'}</button>${h.ex ? '' : '<button type="button" class="p43-btn ghost" data-p43m="gledit">Endre</button>'}</div></div>`; }
  if (R?.actions?.length) body += `<div class="p43-row wr">${R.actions.map((a, i) => `<button type="button" class="p43-btn${i ? ' ghost' : ' ink'}" data-p43m="glact" data-i="${i}">${esc(a.label ?? a.title ?? a.type ?? 'OK')}</button>`).join('')}</div>`;
  return `<div class="p43-glp" aria-live="polite"><div class="p43-glph"><span class="p43-k m-ell">✦ GLIMT · «${esc(G.q)}»</span><button type="button" class="p43-x" data-p43m="glx" aria-label="Lukk">×</button></div>
    <div class="p43-gss">${steps}${G.busy ? '<span class="mut">Tenker …</span>' : ''}</div>${body}</div>`;
}

/* ---------- Kommer snart ---------- */
function komView() {
  if (!D.upc) return empty('upc', 'Kommer snart');
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
    const it = D.upc.filter((x) => (x.day ?? (x.air ? isoDay(new Date(x.air)) : '')) === isoDay(d)).sort((a, b) => String(a.tm || '99').localeCompare(String(b.tm || '99')));
    const wd = d.toLocaleDateString('nb-NO', { weekday: 'long' });
    days.push({ k: i === 0 ? 'I DAG' : i === 1 ? 'I MORGEN' : wd.toUpperCase(), d: `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}`, w: d.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()) + ` ${d.getDate()}`, it, i });
  }
  const tors = (D.tor ?? []).filter((t) => t.st !== 'seed'), allP = tors.length > 0 && tors.every((t) => t.pz);
  const range = `${days[0].d.split(' ').slice(1).join(' ').replace(/\s\S+$/, '')}–${days[6].d.split(' ').slice(1).join(' ')}`;
  const item = (x) => { const s = stv(x.k, x.pc); return { ...x, ...s }; };
  const seg = webCols() ? `<span class="p44m-seg">${[['uke', 'Uke'], ['liste', 'Liste']].map(([v, n]) => `<button type="button" class="${M.komv === v ? 'on' : ''}" data-p43m="komv" data-k="${v}">${n}</button>`).join('')}</span>` : '';
  const pill = (x) => `<span class="p44m-pill" style="color:${x.sC};background:${tint(x.sC)}">${esc(x.k === 'ok' ? `Lastet ned · ▶ ${M.set.player}` : x.k === 'miss' ? 'Mangler · søker' : x.sT)}</span>`;
  if (webCols() && M.komv === 'uke') {
    // Prompt 44: liggende rader med plakat 64 × 96 (2:3, beskjæres ikke) i stedet for 150 px-kort.
    return `<div class="p43-kh"><b class="p43-h2 xl">Kommer snart</b><span class="p43-row">${seg}<span class="mut">${esc(range)}</span><button type="button" class="p43-btn ghost" data-p43m="cal">Vis i Kalender</button></span></div>
      <div class="p43-k7">${days.map((d) => `<div class="p43-kd"><div class="p43-kdh${d.i === 0 ? ' now' : d.it.length ? '' : ' none'}"><b>${esc(d.w)}</b><span>${d.it.length ? `${d.it.length} stk` : ''}</span></div>
        ${d.it.map(item).map((x) => `<button type="button" class="p44m-kr" data-p43m="open" data-kind="${x.kind}" data-id="${esc(x.id)}">${poster(x, 64, 96, '', `<i style="background:${x.dot}"></i>`)}<span class="m-grow"><b>${esc(x.t)}</b><span class="mut">${esc(x.e)}${x.tm ? ` · ${esc(x.tm)}` : ''}</span><span style="color:${x.sC};font-weight:700">${esc(x.sT)}</span></span></button>`).join('') || '<span class="mut p43-sm">Ingenting</span>'}</div>`).join('')}</div>${tors.length ? strip(tors, allP) : ''}`;
  }
  if (webCols()) {
    const L2 = days.filter((d) => d.it.length);
    return `<div class="p43-kh"><b class="p43-h2 xl">Kommer snart</b><span class="p43-row">${seg}<span class="mut">${esc(range)}</span><button type="button" class="p43-btn ghost" data-p43m="cal">Vis i Kalender</button></span></div>
      <div class="p44m-kl">${L2.map((d) => `<section><div class="p44m-klh"><span class="p43-k">${esc(d.k)}</span><b>${esc(d.d)}</b></div>${d.it.map(item).map((x) => `<button type="button" class="p44m-klr" data-p43m="open" data-kind="${x.kind}" data-id="${esc(x.id)}">${poster(x, 44, 66)}<span class="m-grow"><b>${esc(x.t)}</b><span class="mut">${esc(x.kind === 'm' ? `Film · ${x.n || 'Digital utgivelse'}` : `${x.e}${x.n ? ` · ${x.n}` : ''}`)}</span></span><span class="mono">${esc(x.tm)}</span>${pill(x)}</button>`).join('')}</section>`).join('') || '<div class="p43-empty"><b>Ingenting de neste 7 dagene</b></div>'}</div>${tors.length ? strip(tors, allP) : ''}`;
  }
  const L = days.filter((d) => d.it.length);
  return `<div class="p43-kh"><b class="p43-h2">Kommer snart</b><button type="button" class="p43-btn ghost sm" data-p43m="cal">Vis i Kalender</button></div>
    ${L.map((d) => `<section class="p43-day"><div class="p43-dayh"><span class="p43-k">${esc(d.k)}</span><b>${esc(d.d)}</b></div>
      ${d.it.map(item).map((x) => `<button type="button" class="p43-kc" data-p43m="open" data-kind="${x.kind}" data-id="${esc(x.id)}">${poster(x, 52, 78)}<span class="m-grow"><b>${esc(x.t)}</b><span class="mut">${esc(x.e)}${x.n ? ` · ${esc(x.n)}` : ''}</span><span class="p43-st" style="color:${x.sC}">${esc(x.sT)}</span></span><span class="p43-tm">${esc(x.tm)}</span></button>`).join('')}</section>`).join('')
    || '<div class="p43-empty"><b>Ingenting de neste 7 dagene</b><span>Nye episoder og filmer fra Sonarr og Radarr vises her.</span></div>'}
    ${tors.length ? strip(tors, allP) : ''}`;
}
function strip(tors, allP) {
  return `<div class="p43-strip"><button type="button" class="p43-stl" data-p43m="tab" data-k="qb">Lastes ned ›</button>${tors.slice(0, 3).map(torRow).map((r) => `<div class="p43-sti">${poster(r, 26, 38)}<div class="m-grow"><span class="m-ell">${esc(r.nm)} · ${esc(r.short)}</span><i class="p43-bar"><i style="width:${r.p}%"></i></i></div></div>`).join('')}<button type="button" class="p43-stb" data-p43m="pauseall">${allP ? 'Fortsett alt' : 'Pause alt'}</button></div>`;
}

/* ---------- Bibliotek (Sonarr / Radarr) ---------- */
function libView(k) {
  const L0 = k === 's' ? D.ser : D.mov;
  if (!L0) return empty(k === 's' ? 'ser' : 'mov', k === 's' ? 'Sonarr' : 'Radarr');
  const LF = k === 's' ? [['all', 'Alle'], ['miss', 'Mangler'], ['cont', 'Fortsetter'], ['end', 'Avsluttet']] : [['all', 'Alle'], ['has', 'Lastet ned'], ['miss', 'Mangler'], ['ann', 'Kommer']];
  const L = k === 's' ? L0.map((x) => { const line = x.miss ? `${x.miss} mangler` : x.ended ? 'Komplett · avsluttet' : x.next ? `Neste: ${x.nextCode ? `${x.nextCode} ` : ''}${dateNo(x.next)}` : 'Komplett';
    return { x, f: x.miss ? 'miss' : x.ended ? 'end' : 'cont', line, lc: x.miss ? '#a0671a' : 'var(--pp-mut)', dot: x.miss ? '#c48a1a' : x.ended ? '#8a8478' : '#2f6b4a', meta: [x.y, x.net].filter(Boolean).join(' · ') }; })
    : L0.map((x) => { const [sk, pc] = movSt(x), s = stv(sk, pc); return { x, f: sk === 'ok' ? 'has' : sk === 'ann' ? 'ann' : 'miss', line: sk === 'ok' ? `Lastet ned${x.q ? ` · ${x.q}` : ''}` : sk === 'ann' ? x.note || 'Annonsert' : s.sT, lc: s.sC, dot: s.dot, meta: [x.y, x.prof].filter(Boolean).join(' · ') }; });
  if (!LF.some(([f]) => f === M.libF)) M.libF = 'all';
  const qn = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9æøå]+/g, '');
  const q = qn(M.lq[k]), qRaw = M.lq[k].trim();
  const vis = L.filter((r) => (M.libF === 'all' || r.f === M.libF) && (!q || qn(`${r.x.t} ${r.x.net ?? ''} ${r.x.y ?? ''}`).includes(q) || qn(r.x.t).includes(q) || String(r.x.y ?? '') === qRaw || qn(r.x.net).includes(q)));
  const srch = `<label class="p44m-ls">${svg(IC.srch, 16, 2.2)}<input id="p44m-lq-${k}" data-p43mi="lq" data-k="${k}" value="${esc(M.lq[k])}" placeholder="Søk i ${L.length} ${k === 's' ? 'serier' : 'filmer'}" autocomplete="off" enterkeyhint="search" aria-label="Søk i biblioteket">${M.lq[k] ? `<button type="button" data-p43m="lqx" data-k="${k}" aria-label="Tøm søket">×</button>` : ''}</label>`;
  const none = q && !vis.length ? `<div class="p43-empty"><b>Ingen ${k === 's' ? 'serier' : 'filmer'} i biblioteket som heter «${esc(qRaw)}».</b><button type="button" class="p43-btn ink" data-p43m="lqadd" data-kind="${k}">Søk etter «${esc(qRaw)}» for å legge til</button></div>` : '';
  return `<div class="p43-kh"><span class="p43-row base"><b class="p43-h2">${k === 's' ? 'Serier' : 'Filmer'}</b><span class="mut">${L.length} ${k === 's' ? 'serier' : 'filmer'}</span></span><button type="button" class="p43-btn ink" data-p43m="add" data-kind="${k}">${k === 's' ? '+ Legg til serie' : '+ Legg til film'}</button></div>
    ${srch}<div class="p43-chips">${LF.map(([f, n]) => chip(M.libF === f, `${n} ${L.filter((r) => f === 'all' || r.f === f).length}`, `data-p43m="libf" data-k="${f}"`)).join('')}</div>${none}
    <div class="p43-lib">${vis.map((r) => `<button type="button" class="p43-li${M.det?.id === r.x.id && M.det?.k === k ? ' sel' : ''}" data-p43m="open" data-kind="${k}" data-id="${esc(r.x.id)}">${poster(r.x, 0, 0, 'lib', `<b>${esc(r.x.t)}</b><i style="background:${r.dot}"></i>`)}<span class="mut m-ell">${esc(r.meta)}</span><span class="p43-st" style="color:${r.lc}">${esc(r.line)}</span></button>`).join('') || (none ? '' : '<span class="mut">Ingenting her.</span>')}</div>`;
}

/* ---------- Serie-/filmside ---------- */
/** Prompt 44: banner med fanart (16:9, uskarp), mørk gradient, plakat 2:3, tittel, ←/→ i biblioteket, fakta og info-brikker. */
function banner(x, k, facts, chips) {
  const L = (k === 's' ? D.ser : D.mov) ?? [], i = L.findIndex((y) => String(y.id) === String(x.id));
  const pv = i > 0 ? L[i - 1] : null, nx = i >= 0 && i < L.length - 1 ? L[i + 1] : null;
  const bg = x.fanart || x.poster;
  return `<div class="p44m-ban">${bg ? `<span class="p44m-bg${x.fanart ? '' : ' pst'}" style="background-image:url('${esc(bg)}')"></span>` : `<span class="p44m-bg" style="background:${esc(x.c ?? '#3c4a5c')}"></span>`}<span class="p44m-gr"></span>
    <div class="p44m-bt"><span class="p43-k">${k === 's' ? 'SONARR · SERIE' : 'RADARR · FILM'}</span><span class="p44m-nav"><button type="button" data-p43m="detnav" data-id="${esc(pv?.id ?? '')}" ${pv ? '' : 'disabled'} aria-label="Forrige">←</button><button type="button" data-p43m="detnav" data-id="${esc(nx?.id ?? '')}" ${nx ? '' : 'disabled'} aria-label="Neste">→</button></span></div>
    <div class="p44m-bm">${poster(x, wideOn() ? 120 : 104, 0, 'det')}<div class="m-grow"><b class="p44m-bh">${esc(x.t)}</b><span class="p44m-bf">${facts}</span></div></div>
    <div class="p44m-chips">${chips.filter(Boolean).map(([l, v, a]) => `<${a ? 'button type="button"' : 'span'} class="p44m-gl"${a ? ` ${a}` : ''}>${l ? `<small>${esc(l)}</small>` : ''}<b>${esc(v)}</b></${a ? 'button' : 'span'}>`).join('')}</div>
    ${x.overview ? `<p class="p44m-ov">${esc(x.overview)}</p>` : ''}<span class="p44m-src">Metadata fra ${k === 's' ? 'TheTVDB' : 'TMDb'}</span></div>`;
}
const runT = (min) => (min ? (min >= 60 ? `${Math.floor(min / 60)} t ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`) : '');
function fdelSheet() {
  const F = M.fdel;
  return sheetWrap(`${shHead(F.k === 'e' ? 'Slette episodefilen?' : 'Slette filmfilen?')}<span class="mut">${esc(F.label)}. Filen slettes fra disken, og overvåkingen slås av så den ikke lastes ned igjen med en gang.</span>
    <div class="p43-row two"><button type="button" class="p43-btn ghost" data-p43m="shx">Avbryt</button><button type="button" class="p43-btn red" data-p43m="fdelgo">Slett</button></div>`, 'Slett fil');
}
function detView() {
  const { k, id } = M.det, x = k === 's' ? D.sd[id] ?? (D.ser ?? []).find((y) => String(y.id) === String(id)) : D.md[id] ?? (D.mov ?? []).find((y) => String(y.id) === String(id));
  const back = `<button type="button" class="p43-bk" data-p43m="detx">‹ ${k === 's' ? 'Serier' : 'Filmer'}</button>`;
  if (!x) return back + (D.err[`${k === 's' ? 'sd' : 'md'}${id}`] ? `<div class="p43-empty"><b>Fant ikke ${k === 's' ? 'serien' : 'filmen'}</b><span>${esc(D.err[`${k === 's' ? 'sd' : 'md'}${id}`])}</span></div>` : '<div class="m-spin"></div>');
  const player = M.set.player;
  const actBtn = (n, a, pri, extra = '') => `<button type="button" class="p43-btn${pri ? ' ink' : ' ghost'}" data-p43m="${a}" ${extra}>${esc(n)}</button>`;
  const chipB = (l, v, f) => `<button type="button" class="p43-dch" data-p43m="${f === 'mmon' ? 'mmon' : 'edit'}" data-f="${f}"><span>${esc(l)}</span><b>${esc(v)} ›</b></button>`;
  if (k === 's') {
    const eps = x.eps ?? [];
    const aired = eps.filter((e) => e.aired), have = aired.filter((e) => e.has).length, miss = aired.filter((e) => !e.has && e.mon && ['miss', 'stall'].includes(epSt(e)[0])).length;
    const missEps = aired.filter((e) => !e.has && e.mon && ['miss', 'stall'].includes(epSt(e)[0]));
    const seasons = [...new Set(eps.map((e) => e.s))].filter((n) => n > 0 || eps.every((e) => e.s === 0)).sort((a, b) => b - a);
    const A = eps.length ? aired.length : x.aired, H = eps.length ? have : x.have, MI = eps.length ? miss : x.miss;
    const facts = `${esc([runT(x.runtime), (x.genres ?? []).slice(0, 2).join(', '), x.y ? `${x.y}–${x.yEnd || ''}` : '', x.net].filter(Boolean).join(' · '))}<b style="color:${MI ? '#f0b56a' : '#8fd3a5'}">${H} av ${A} episoder · ${MI ? `${MI} mangler` : 'komplett'}</b>`;
    const head = banner(x, 's', facts, [x.path ? ['MAPPE', x.path] : null, x.size ? ['STR.', gbT(x.size / 1024 ** 3)] : null, ['PROFIL', x.prof, 'data-p43m="edit" data-f="prof"'], ['', x.monitored ? 'Overvåket' : 'Ikke overvåket', 'data-p43m="edit" data-f="mon"'], ['', x.ended ? 'Avsluttet' : 'Fortsetter'], x.lang ? ['SPRÅK', x.lang] : null, x.net ? ['KANAL', x.net] : null]);
    const sez = seasons.map((sn, si) => {
      const se = eps.filter((e) => e.s === sn).sort((a, b) => a.e - b.e), ok = M.open[`${id}-${sn}`] ?? si === 0;
      const sh = se.filter((e) => e.has).length, sa = se.filter((e) => e.aired).length, sm = se.filter((e) => e.aired && !e.has && e.mon && ['miss', 'stall'].includes(epSt(e)[0])).length, smon = x.seasonMon?.[sn] ?? se.some((e) => e.mon);
      const rows = ok ? se.map((e) => { const [sk, pc] = epSt(e), s = stv(sk, pc), canS = e.aired && !e.has && ['miss', 'stall', 'off'].includes(sk); const airT = e.air ? `${e.aired ? 'Sendt ' : ''}${dateNo(e.air, { day: 'numeric', month: 'short' })}` : e.aired ? 'Sendt' : 'Ikke sendt';
        return `<div class="p43-ep"><button type="button" class="p43-bm" data-p43m="epmon" data-ep="${esc(e.id)}" aria-label="Overvåk episoden" aria-pressed="${e.mon}">${svg(IC.bm, 16, 2, e.mon ? 'currentColor' : 'none')}</button><span class="p43-epc">E${pad(e.e)}</span>
          <div class="m-grow"><b class="m-ell">${esc(e.n)}</b><span style="color:${canS ? s.sC : 'var(--pp-mut)'}">${esc(canS ? `${airT} · ${s.sT}` : airT)}</span></div>
          ${canS ? `<button type="button" class="p43-rb" data-p43m="auto" data-ep="${esc(e.id)}" aria-label="Automatisk søk">${svg(IC.srch, 17, 2.2)}</button><button type="button" class="p43-rb ink" data-p43m="inter" data-ep="${esc(e.id)}" aria-label="Interaktivt søk">${svg(IC.inter, 17, 2.2)}</button>` : e.has ? `<button type="button" class="p43-rb" data-p43m="redl" data-ep="${esc(e.id)}" aria-label="Last ned på nytt (interaktivt søk)">${svg(IC.redl, 17, 2.2)}</button><button type="button" class="p43-rb red" data-p43m="fdel" data-ep="${esc(e.id)}" aria-label="Slett episodefilen">${svg(IC.del, 17, 2)}</button>` : `<span class="p43-sc" style="background:${tint(s.sC)};color:${s.sC}">${esc(s.sT)}</span>`}</div>`; }).join('') : '';
      return `<div class="p43-se"><div class="p43-seh"><button type="button" class="p43-bm" data-p43m="semon" data-s="${sn}" aria-label="Overvåk sesongen" aria-pressed="${smon}">${svg(IC.bm, 18, 2, smon ? 'currentColor' : 'none')}</button><button type="button" class="p43-set" data-p43m="setog" data-s="${sn}" aria-expanded="${ok}"><b>${sn === 0 ? 'Spesialer' : `Sesong ${sn}`}</b><span style="color:${sm ? '#a0671a' : 'var(--pp-mut)'}">${sa ? `${sh} av ${sa} sendt${sm ? ` · ${sm} mangler` : ''}` : `Ikke sendt ennå · ${se.length} episoder`}</span></button>${sm ? `<button type="button" class="p43-btn ghost sm" data-p43m="ssearch" data-s="${sn}">Søk sesong</button>` : ''}<span class="p43-chev" aria-hidden="true">${ok ? '▴' : '▾'}</span></div>${rows}</div>`;
    }).join('');
    return `${back}${head}<div class="p43-chips wr">${chipB('PROFIL', x.prof, 'prof')}${chipB('OVERVÅKING', lbl(MON, x.mon), 'mon')}${chipB('SERIETYPE', lbl(STY, x.typ), 'typ')}</div>
      <div class="p43-row wr">${actBtn(missEps.length ? `Søk alle manglende (${missEps.length})` : 'Ingenting mangler', 'missall', true, missEps.length ? '' : 'disabled')}${actBtn(`▶ Spill av i ${player}`, 'play', false)}</div>
      ${eps.length ? `<div class="p43-ses">${sez}</div>` : D.err[`sd${id}`] ? `<div class="p43-empty"><span>${esc(D.err[`sd${id}`])}</span></div>` : '<div class="m-spin"></div>'}`;
  }
  const [sk, pc] = movSt(x), s = stv(sk, pc);
  const folder = x.path || `/data/media/film/${x.t} (${x.y})/`;
  const facts = `${esc([runT(x.runtime), (x.genres ?? []).slice(0, 2).join(', '), x.y].filter(Boolean).join(' · '))}<b style="color:${sk === 'ok' ? '#8fd3a5' : '#f0b56a'}">${esc(sk === 'ann' ? x.note || 'Annonsert' : s.sT)}</b>`;
  return `${back}${banner(x, 'm', facts, [x.has ? ['MAPPE', folder] : null, x.size ? ['STR.', gbT(x.size / 1024 ** 3)] : null, ['PROFIL', x.prof, 'data-p43m="edit" data-f="prof"'], ['', x.mon ? 'Overvåket' : 'Ikke overvåket', 'data-p43m="mmon"'], x.q ? ['KVALITET', x.q] : null, x.lang ? ['SPRÅK', x.lang] : null])}
    <div class="p43-chips wr">${chipB('PROFIL', x.prof, 'prof')}${chipB('LAST NED NÅR DEN ER', lbl(AV, x.av), 'av')}${chipB('OVERVÅKET', x.mon ? 'Ja' : 'Nei', 'mmon')}</div>
    <div class="p43-row wr">${x.has ? actBtn(`▶ Spill av i ${player}`, 'play', true) : ''}${x.has ? actBtn('⟳ Last ned på nytt', 'mredl', false) : actBtn('Automatisk søk', 'mauto', true)}${x.has ? '' : actBtn('Interaktivt søk', 'minter', false)}${x.has ? '<button type="button" class="p43-btn ghost p44m-red" data-p43m="fdel" data-m="1">Slett fil</button>' : ''}</div>
    <div class="p43-file"><span class="p43-k mut">FIL</span><span class="mono">${esc(x.has ? `${x.q || 'Fil'} · ${x.size ? gbT(x.size / 1024 ** 3) : ''} · ${folder}` : `Ingen fil ennå · lagres i ${folder}`)}</span></div>`;
}

/* ---------- Interaktivt søk (stil fra 1a) ---------- */
function relKey() { const c = M.srch; return c.k === 's' ? `e${c.ep}` : `m${c.id}`; }
// Prompt 44 (claude-code-media-interaktivt-sok-504.md): søket kjøres som jobb på serveren. POST /api/media/release/search
// {kind, id, episodeId?, server?} → {jobId}; GET …/release/search/:jobId → {status, indexers:[{name, state, count, ms, error}],
// releases, cachedAt}. Treff vises etter hvert som indekserne svarer, én indekser som feiler stopper ikke resten, og
// resultatet huskes i 10 min. Eldre server (404): det gamle GET /release med ett nytt forsøk ved 502/503/504.
const JOB = {};
async function relLoad(force) {
  const c = M.srch; if (!c) return;
  const key = relKey(), R0 = D.rel[key];
  if (!force && R0 && (R0.done || R0.running) && Date.now() - (R0.at ?? 0) < 600000) return;
  if (JOB[key]?.on) return;
  const J = JOB[key] = { on: true, t0: Date.now() };
  D.rel[key] = { rows: [], ix: [], running: true, at: Date.now(), t0: Date.now(), ms: 0, n: null, cached: false };
  delete D.err[`rel${key}`]; draw();
  let jobId = null;
  try {
    const r = await mApi('/release/search', { method: 'POST', json: c.k === 's' ? { kind: 'episode', episodeId: +c.ep || c.ep, force: !!force, re: !!c.re } : { kind: 'movie', movieId: +c.id || c.id, force: !!force, re: !!c.re } });
    jobId = r?.jobId ?? r?.id ?? null;
    if (!jobId && (r?.releases || r?.items)) { relTake(key, r, true); J.on = false; return; }
  } catch (e) {
    if (e.status !== 404 && e.status !== 405) { J.on = false; D.rel[key] = null; D.err[`rel${key}`] = errText(e); draw(); return; }
  }
  if (!jobId) { // eldre server
    try {
      const t0 = performance.now();
      const r = c.k === 's' ? await mApi(`/release?episodeId=${encodeURIComponent(c.ep)}`) : await mApi(`/release?movieId=${encodeURIComponent(c.id)}&service=radarr`);
      D.rel[key] = { rows: arr(r, 'items', 'releases').map(nRel), ix: [], ms: r?.tookMs ?? r?.ms ?? Math.round(performance.now() - t0), n: r?.indexersTotal ?? r?.indexers ?? r?.indexerCount ?? null, done: true, at: Date.now() };
    } catch (e) { D.rel[key] = null; D.err[`rel${key}`] = errText(e); }
    J.on = false; draw(); return;
  }
  J.id = jobId; if (D.rel[key]) D.rel[key].jobId = jobId;
  while (J.on && M.srch && relKey() === key) {
    await new Promise((ok) => setTimeout(ok, 1000));
    if (!J.on) break;
    try { const r = await mApi(`/release/search/${encodeURIComponent(jobId)}`); relTake(key, r, /done|ferdig|complete|failed|error|cancel/i.test(r?.state ?? r?.status ?? '') || r?.done === true); if (D.rel[key]?.done) break; }
    catch (e) { if (e.status === 404) { D.rel[key] = null; D.err[`rel${key}`] = 'Søket forsvant på serveren · prøv igjen'; break; } }
    if (Date.now() - J.t0 > 240000) { relTake(key, { status: 'done' }, true); break; }
  }
  J.on = false; if (m.screen === 'media') draw();
}
function relTake(key, r, done) {
  const P = D.rel[key] ?? { rows: [], ix: [], t0: Date.now() };
  const rows = done ? (arr(r?.result, 'items', 'releases').length ? arr(r.result, 'items', 'releases') : arr(r, 'releases', 'items', 'results')) : arr(r, 'partial', 'releases', 'items');
  const ix = arr(r, 'indexers').map((x) => ({ n: x.name ?? x.indexer ?? '', st: /fail|error|timeout|cancel/i.test(x.state ?? x.status ?? '') || x.ok === false ? 'fail' : /done|ok|ferdig/i.test(x.state ?? x.status ?? '') || x.ok === true ? 'ok' : 'run', c: x.count ?? x.hits ?? 0, ms: x.ms ?? null, e: x.error ?? '' }));
  D.rel[key] = { ...P, rows: rows.length || done ? rows.map(nRel) : P.rows, ix: ix.length ? ix : P.ix, running: !done, done: !!done, at: P.at ?? Date.now(), cached: !!(r?.cached ?? r?.cachedAt), cachedAt: r?.cachedAt ?? null,
    ms: r?.elapsedMs ?? r?.tookMs ?? r?.ms ?? Date.now() - (P.t0 ?? Date.now()), n: r?.indexersTotal ?? (ix.length || P.n), jobId: r?.jobId ?? P.jobId };
  if (done && (r?.allFailed || (ix.length && ix.every((x) => x.st === 'fail'))) && !rows.length) { D.rel[key] = null; D.err[`rel${key}`] = 'allfail'; }
  if (m.screen === 'media') draw();
}
function srchView() {
  const c = M.srch, x = c.k === 's' ? D.sd[c.id] ?? (D.ser ?? []).find((y) => String(y.id) === String(c.id)) : D.md[c.id] ?? (D.mov ?? []).find((y) => String(y.id) === String(c.id));
  if (!x) return '<div class="m-spin"></div>';
  const ep = c.k === 's' ? (x.eps ?? []).find((e) => String(e.id) === String(c.ep)) : null;
  const R = D.rel[relKey()], all = R?.rows ?? [], b = bestOf(all, x.prof);
  let rows = all;
  if (M.fq === '1080') rows = rows.filter((r) => r.r === 1080); else if (M.fq === '2160') rows = rows.filter((r) => r.r === 2160); else if (M.fq === 'no') rows = rows.filter((r) => r.no);
  rows = M.fq === 'seed' ? [...rows].sort((p, q) => q.s - p.s) : [...rows].sort((p, q) => (q === b) - (p === b) || q.s - p.s);
  const mx = Math.max(1, ...rows.map((r) => r.s));
  const sc = (r) => (r.s === 0 || r.s < mx * 0.1 ? '#b23a2a' : r.s >= mx * 0.5 ? '#2f6b4a' : 'var(--pp-ink)');
  const title = c.k === 's' ? `${ep ? `${code(ep.s, ep.e)} · ${ep.n}` : 'Episode'}` : `${x.t}${x.y ? ` (${x.y})` : ''}`;
  const info = `${c.re ? 'Last ned på nytt · ' : ''}Profil ${x.prof} · ${c.k === 's' ? `Overvåker ${lbl(MON, x.mon).toLowerCase()}` : lbl(AV, x.av)}${R ? ` · ${all.length} treff${R.n ? ` fra ${R.n} indeksere` : ''} · ${nb(R.ms / 1000)} s` : ''}`;
  const relS = (r) => (r.short ? r.short : c.k === 's' ? r.rel.replace(new RegExp(`^.*?(?=S${pad(ep?.s ?? 0)}E${pad(ep?.e ?? 0)})`, 'i'), '') : r.rel);
  const er = D.err[`rel${relKey()}`];
  const prog = R?.running ? `<div class="p44m-job"><div class="p43-row"><span class="m-spin sm"></span><b class="m-grow">Søker i ${R.ix.length || R.n || 'alle'} indeksere … ${Math.round((Date.now() - (R.t0 ?? Date.now())) / 1000)} s</b><button type="button" class="p43-btn ghost sm" data-p43m="relstop">Avbryt</button></div>${R.ix.map((x) => `<span class="p44m-ix ${x.st}">${x.st === 'ok' ? '✓' : x.st === 'fail' ? '✕' : '⟳'} ${esc(x.n)}<span class="mut">${x.st === 'ok' ? `${x.c} treff${x.ms != null ? ` · ${nb(x.ms / 1000)} s` : ''}` : x.st === 'fail' ? esc(x.e || 'tidsavbrudd') : ''}</span></span>`).join('')}</div>`
    : R?.done ? `<span class="mut p43-sm">${(() => { const age = Date.now() - (R.cachedAt ? Date.parse(R.cachedAt) : R.at); return age >= 60000 ? `Hentet for ${Math.round(age / 60000)} min siden · ` : ''; })()}<button type="button" class="p44m-lnk" data-p43m="relretry">Søk igjen</button>${R.ix.some((x) => x.st === 'fail') ? ` · ${R.ix.filter((x) => x.st === 'fail').map((x) => `${esc(x.n)} svarte ikke`).join(', ')}` : ''}</span>` : '';
  const list = !R ? (er === 'allfail' ? `<div class="p43-empty"><b>Ingen indeksere svarte</b><span>Sjekk Prowlarr → Helse.</span><span class="p43-row"><button type="button" class="p43-btn" data-p43m="relretry">Prøv igjen</button><button type="button" class="p43-btn ghost" data-p43m="tab" data-k="pro">Åpne Prowlarr</button></span></div>` : er ? `<div class="p43-empty"><b>Søket feilet</b><span>${esc(er)}</span><button type="button" class="p43-btn" data-p43m="relretry">Prøv igjen</button></div>` : '<div class="p43-srl"><div class="m-spin"></div><span class="mut">Søker i indekserne via Prowlarr …</span></div>')
    : !rows.length && R.running ? prog
    : rows.length ? `<div class="p43-rl">${rows.map((r) => { const g = !!M.grab[`${relKey()}:${r.id}`]; return `<div class="p43-rr"><div class="m-grow"><span class="p43-rel">${esc(relS(r))}</span><span class="p43-rm"><span class="p43-q">${esc(r.q)}</span><b>${gbT(r.gb)}</b><b style="color:${sc(r)}">▲ ${nbN(r.s)} / ${nbN(r.l)}</b><span class="mut">${esc(r.ix)}</span></span>${r.lang ? `<span class="mut p43-sm">${esc(r.lang)}</span>` : ''}${r === b ? '<b class="p43-best">Best treff for profilen</b>' : ''}${r.rej.length ? `<span class="p43-rej">${esc(r.rej.slice(0, 2).join(' · '))}</span>` : ''}</div><button type="button" class="p43-dlb${g ? ' ok' : ''}" data-p43m="grab" data-g="${esc(r.id)}" aria-label="Last ned ${esc(r.q)}" ${r.partial ? 'disabled title="Kan lastes ned når søket er ferdig"' : ''}>${g ? '✓' : svg(IC.dl, 18, 2.4)}</button></div>`; }).join('')}</div>`
      : '<span class="mut">Ingen treff med dette filteret.</span>';
  const list2 = R && rows.length && R.running ? prog + list : R?.done ? prog + list : list;
  return `<button type="button" class="p43-bk" data-p43m="srchx">‹ ${esc(x.t)}</button>
    <div class="p43-dh">${poster(x, 56, 0, 'det')}<div class="m-grow"><span class="p43-k">INTERAKTIVT SØK</span><b class="p43-dt s">${esc(title)}</b><span class="mut">${esc(info)}</span></div></div>
    <div class="p43-chips">${[['all', `Alle ${all.length}`], ['1080', '1080p'], ['2160', '2160p'], ['no', 'Norsk tekst'], ['seed', 'Flest seedere']].map(([f, n]) => chip(M.fq === f, n, `data-p43m="fq" data-k="${f}"`)).join('')}</div>${list2}`;
}

/* ---------- qBittorrent ---------- */
function qbView() {
  if (!D.tor) return empty('tor', 'qBittorrent');
  const T = D.tor, X = D.xfer ?? {};
  const tot = X.dl_info_speed != null ? X.dl_info_speed / 1024 ** 2 : T.filter((t) => t.st === 'dl' && !t.pz).reduce((a, t) => a + t.spd, 0);
  const up = X.up_info_speed != null ? X.up_info_speed / 1024 ** 2 : T.reduce((a, t) => a + (t.up || 0), 0);
  const alt = !!(X.use_alt_speed_limits ?? X.altSpeed ?? X.alt), altLim = X.alt_dl_limit ? X.alt_dl_limit / 1024 ** 2 : 5;
  const cand = T.filter((t) => t.st !== 'seed'), allP = cand.length > 0 && cand.every((t) => t.pz);
  const SEG = [['all', 'Alle', () => true], ['act', 'Aktive', (t) => t.st === 'dl' && !t.pz], ['pz', 'Pauset', (t) => t.pz && t.st !== 'seed'], ['done', 'Ferdige', (t) => t.st === 'seed'], ['fail', 'Står fast', (t) => t.st === 'stall']];
  const f = (SEG.find((s) => s[0] === M.seg) ?? SEG[0])[2], tors = T.filter(f).map(torRow);
  const R = D.roots ?? [];
  const uniq = [...new Map(R.filter((r) => r.totalSpace).map((r) => [r.totalSpace, r])).values()];
  const used = uniq.reduce((a, r) => a + (r.totalSpace - (r.freeSpace ?? 0)), 0), total = uniq.reduce((a, r) => a + (r.totalSpace ?? 0), 0);
  const free = R.length ? Math.min(...R.map((r) => r.freeSpace ?? Infinity)) : null;
  const disk = R.length ? `<div class="p43-card p43-disk"><div class="p43-kh"><b class="p43-serif22">Diskplass</b>${total ? `<span class="mono mut">${tbT(used)} av ${tbT(total)} brukt</span>` : ''}</div>
      ${R.map((r, i) => { const u = r.used ?? null, w = r.totalSpace && r.freeSpace != null ? Math.max(1, Math.round(((r.totalSpace - r.freeSpace) / r.totalSpace) * 100)) : 0; return `<div class="p43-dk"><span class="p43-dkh"><span class="mono">${esc(r.path)}</span><b>${u != null ? tbT(u) : r.freeSpace != null ? `${tbT(r.freeSpace)} ledig` : ''}</b></span><i class="p43-bar t"><i style="width:${w}%;background:${['var(--pp-ink)', 'var(--pp-lab)', 'var(--pp-mut)'][i % 3]}"></i></i></div>`; }).join('')}
      ${free != null && isFinite(free) ? `<span class="mut p43-sm"${free < 1024 ** 4 ? ' style="color:#b23a2a;font-weight:700"' : ''}>Ledig ${tbT(free)} · Varsel når under 1 TB</span>` : ''}</div>` : '';
  return `<div class="p43-qsum"><div><b class="p43-qsp">↓ ${mbT(tot)}</b><span class="p43-qsub">${T.filter((t) => t.st === 'dl' && !t.pz).length} AKTIVE · ↑ ${mbT(up)} · ${T.length} I KØEN${alt ? ` · GRENSE ${nb(altLim)} MB/s` : ''}</span></div>
      <div class="p43-qb"><button type="button" data-p43m="pauseall">${allP ? 'Fortsett alt' : 'Pause alt'}</button><button type="button" class="alt${alt ? ' on' : ''}" data-p43m="alt" aria-pressed="${alt}">${alt ? 'Alt-hastighet på' : 'Alt-hastighet'}</button></div></div>
    <div class="p43-row"><button type="button" class="p43-btn line" data-p43m="mag">${svg(IC.mag, 16, 2.2)}Legg til magnet-lenke</button><span class="mut p43-sm">eller .torrent-adresse</span></div>
    <div class="p43-chips">${SEG.map(([k, n, g]) => chip(M.seg === k, `${n} ${T.filter(g).length}`, `data-p43m="seg" data-k="${k}"`)).join('')}</div>
    <div class="p43-tors">${tors.map((r) => `<div class="p43-tor" id="p43-t-${esc(r.hash)}">${poster(r, 58, 86)}<div class="m-grow"><div class="p43-th"><div class="m-grow"><b class="m-ell">${esc(r.nm)}</b><span class="mut">${esc([r.ep, r.q, gbT(r.gb)].filter(Boolean).join(' · '))}</span></div><b class="p43-pt">${Math.floor(r.p)} %</b></div>
      <i class="p43-bar t"><i style="width:${r.p}%;background:${r.bc}"></i></i><div class="p43-tf"><span style="color:${r.lc}">${esc(r.short)}</span><span class="p43-row">
      ${r.st !== 'seed' ? `<button type="button" class="p43-rb" data-p43m="ttog" data-h="${esc(r.hash)}" aria-label="${r.pz ? 'Fortsett' : 'Pause'}">${r.pz ? PLAY : svg(IC.pause, 16, 2.4)}</button>` : ''}<button type="button" class="p43-rb" data-p43m="tmore" data-h="${esc(r.hash)}" aria-label="Flere valg">⋯</button><button type="button" class="p43-rb red" data-p43m="tdel" data-h="${esc(r.hash)}" aria-label="Slett">${svg(IC.del, 17, 2)}</button></span></div></div></div>`).join('') || '<span class="mut">Ingenting her.</span>'}</div>${disk}`;
}

/* ---------- Prowlarr ---------- */
function proView() {
  if (!D.idx) return empty('idx', 'Prowlarr');
  const L = D.idx.map((x) => ({ ...x, fail: x.ok === false || (x.ok == null && (x.fail ?? x.failing ?? !!x.lastError)), lastError: x.error ?? x.lastError, ms: x.ms ?? x.responseTime ?? x.averageResponseTime ?? null, q: x.queries ?? x.numberOfQueries ?? 0, g: x.grabs ?? x.numberOfGrabs ?? 0 }));
  const ok = L.filter((x) => !x.fail).length;
  const tline = (x) => { const t = M.idxT[x.id]; if (t?.st === 'run') return ['Tester …', 'var(--pp-mut)']; if (t?.st === 'fail') return [t.msg || 'Testen feilet', '#b23a2a']; if (x.fail) return [x.lastError ?? x.error ?? 'Svarer ikke', '#b23a2a']; return [`${x.ms != null ? `${x.ms} ms · ` : ''}${x.q} søk · ${x.g} hentet i dag${t?.st === 'ok' ? ` · test OK${t.ms ? ` (${t.ms} ms)` : ''}` : ''}`, 'var(--pp-mut)']; };
  const apps = (D.apps?.length ? D.apps : [{ name: 'Sonarr' }, { name: 'Radarr' }]).map((a) => ({ ...a, sub: a.sub ?? `${a.label || 'Full synk'} · ${ok} indeksere · ${/radarr/i.test(a.name) ? 'film' : 'TV'}` }));
  return `<div class="p43-card p43-psum"><div><b class="p43-psh">${ok} av ${L.length} indeksere svarer</b><span class="mut">Prowlarr · ${L.reduce((a, x) => a + x.q, 0)} søk og ${L.reduce((a, x) => a + x.g, 0)} hentet i dag</span></div><div class="p43-row wr"><button type="button" class="p43-btn ghost" data-p43m="testall">Test alle</button><button type="button" class="p43-btn ink" data-p43m="idxadd">+ Legg til indekser</button></div></div>
    ${D.health?.length ? `<div class="p43-card p43-health">${D.health.map((h) => `<span style="color:${/error/i.test(h.type ?? '') ? '#b23a2a' : '#a0671a'}">${esc(h.message ?? h)}</span>`).join('')}</div>` : ''}
    <div class="p43-card p43-idx">${L.map((x) => { const [line, lc] = tline(x); return `<div class="p43-ix"><i style="background:${x.fail || M.idxT[x.id]?.st === 'fail' ? '#b23a2a' : '#2f6b4a'}"></i><div class="m-grow"><b>${esc(x.name)}</b><span style="color:${lc}">${esc(line)}</span></div><button type="button" class="p43-btn ghost sm" data-p43m="itest" data-id="${esc(x.id)}">${M.idxT[x.id]?.st === 'run' ? 'Tester …' : 'Test'}</button></div>`; }).join('') || '<span class="mut">Ingen indeksere ennå.</span>'}</div>
    <div class="p43-card p43-idx">${apps.map((a) => `<div class="p43-ix"><i style="background:#2f6b4a"></i><div class="m-grow"><b>${esc(a.name)}</b><span class="mut">${esc(a.sub ?? a.syncLevel ?? '')}</span></div><button type="button" class="p43-btn ghost sm" data-p43m="sync" data-n="${esc(a.name)}" data-id="${esc(a.id ?? '')}">Synk nå</button></div>`).join('')}</div>`;
}

/* ---------- Ark ---------- */
const sheetWrap = (inner, label) => `<div class="p43-scrim${M.shSeen === M.sh ? ' still' : ''}" data-p43m="shx"></div><div class="p43-sheet${wideOn() ? ' win' : ''}${M.shSeen === M.sh ? ' still' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}"><span class="p43-grab" aria-hidden="true"></span>${inner}</div>`;
const shHead = (t) => `<div class="p43-shh"><b>${esc(t)}</b><button type="button" class="p43-x" data-p43m="shx" aria-label="Lukk">×</button></div>`;
const optChips = (L, cur, f) => `<div class="p43-chips wr">${L.map((o) => { const k = Array.isArray(o) ? o[0] : o, n = Array.isArray(o) ? o[1] : o; return chip(String(cur) === String(k), n, `data-p43m="${f}" data-k="${esc(k)}"`); }).join('')}</div>`;
const sec = (t, inner) => `<div class="p43-sec"><span class="p43-k mut">${esc(t)}</span>${inner}</div>`;
const togRow = (n, sub, on, a, k) => `<button type="button" class="p43-tr2" data-p43m="${a}" data-k="${k}" aria-pressed="${on}"><span class="m-grow"><b>${esc(n)}</b>${sub ? `<span class="mut">${esc(sub)}</span>` : ''}</span>${toggle(on)}</button>`;
function addSheet() {
  const a = M.add, ser = a.k === 's', PL = profList(a.k), profs = PL.length ? PL.map((p) => [p.name, p.name]) : PROF.map((p) => [p, p]);
  if (!a.sel) {
    const L = a.res ?? [];
    return sheetWrap(`${shHead(ser ? 'Legg til serie' : 'Legg til film')}<form data-p43mf="lookup"><input id="p43-aq" name="q" class="p43-in" value="${esc(a.q)}" placeholder="${ser ? 'Søk etter serie, f.eks. Severance' : 'Søk etter film, f.eks. Frankenstein'}" autocomplete="off" enterkeyhint="search"></form>
      ${a.busy ? '<div class="m-spin"></div>' : ''}${a.err ? `<span class="p43-err">${esc(a.err)}</span>` : ''}
      <div class="p43-al">${L.map((x, i) => `<button type="button" class="p43-ar" data-p43m="apick" data-i="${i}">${poster(x, 40, 60)}<span class="m-grow"><b>${esc(x.t)}</b><span class="mut">${esc([x.y, x.net, x.nS ? `${x.nS} sesonger` : ''].filter(Boolean).join(' · '))}</span></span><span class="p43-arr" style="color:${x.ex ? 'var(--pp-mut)' : 'var(--pp-lab)'}">${x.ex ? 'Finnes' : 'Velg ›'}</span></button>`).join('')}
      ${!a.busy && a.q && a.done && !L.length ? '<span class="mut">Fant ingenting.</span>' : ''}</div>`, ser ? 'Legg til serie' : 'Legg til film');
  }
  const x = a.sel, root = a.root ?? (ser ? '/data/media/tv' : '/data/media/film');
  return sheetWrap(`${shHead(ser ? 'Legg til serie' : 'Legg til film')}<div class="p43-ahit">${poster(x, 48, 72)}<div><b class="p43-serif22">${esc(x.t)}</b><span class="mut">${esc([x.y, x.net].filter(Boolean).join(' · '))}</span></div></div>
    ${sec('KVALITETSPROFIL', optChips(profs, a.prof, 'aprof'))}
    ${ser ? sec('OVERVÅKING', optChips(MON, a.mon, 'amon')) + sec('SERIETYPE', optChips(STY, a.typ, 'atyp')) : sec('LAST NED NÅR DEN ER', optChips(AV, a.av, 'aav'))}
    <div class="p43-kv"><span class="mut">Rotmappe</span><b class="mono">${esc(root)}</b></div>
    ${togRow(ser ? 'Søk etter manglende episoder med en gang' : 'Søk etter filmen med en gang', '', a.go, 'ago', '1')}
    ${a.err ? `<span class="p43-err">${esc(a.err)}</span>` : ''}
    <div class="p43-row two"><button type="button" class="p43-btn ghost lg" data-p43m="aback">Tilbake</button><button type="button" class="p43-btn ink lg" data-p43m="aok" ${a.busy ? 'disabled' : ''}>${a.busy ? 'Legger til …' : 'Legg til'}</button></div>`, ser ? 'Legg til serie' : 'Legg til film');
}
function actSheet() {
  const t = (D.tor ?? []).find((y) => y.hash === M.act); if (!t) return '';
  const F = D.files[t.hash];
  const btns = [[t.pz ? 'Fortsett' : 'Pause', 'tog'], ['Tving start', 'forceStart'], ['Opp i køen', 'up'], ['Ned i køen', 'down'], ['Øverst i køen', 'top'], ['Nederst i køen', 'bottom'], ['Sjekk filene på nytt', 'recheck']].filter((b) => t.st !== 'seed' || b[1] === 'recheck');
  return sheetWrap(`<div class="p43-shh"><div class="m-grow"><b>${esc(t.nm)}${t.ep && !['Film', 'Egen'].includes(t.ep) ? ` ${esc(t.ep)}` : ''}</b><span class="p43-rel">${esc(t.rel)}</span></div><button type="button" class="p43-x" data-p43m="shx" aria-label="Lukk">×</button></div>
    <div class="p43-g2">${btns.map(([n, op]) => `<button type="button" data-p43m="top" data-op="${op}">${esc(n)}</button>`).join('')}<button type="button" class="red" data-p43m="tdel" data-h="${esc(t.hash)}">Slett …</button></div>
    <span class="p43-k mut">FILER · TRYKK FOR Å VELGE BORT</span>
    <div class="p43-files">${!F ? '<div class="m-spin"></div>' : F.err ? `<span class="mut">${esc(F.err)}</span>` : F.list.map((f, i) => `<button type="button" class="p43-fr" data-p43m="file" data-i="${i}" aria-pressed="${f.on}"><span class="p43-ck${f.on ? ' on' : ''}" aria-hidden="true">${f.on ? '✓' : ''}</span><span class="m-grow mono m-ell" style="opacity:${f.on ? 1 : 0.45}">${esc(f.n)}</span><span class="mut">${esc(f.s)}</span></button>`).join('') || '<span class="mut">Ingen filer ennå (henter metadata).</span>'}</div>`, 'Valg for nedlasting');
}
function delSheet() {
  const t = (D.tor ?? []).find((y) => y.hash === M.act); if (!t) return '';
  return sheetWrap(`<b class="p43-serif24">Slette ${esc(t.nm)}${t.ep && !['Film', 'Egen'].includes(t.ep) ? ` ${esc(t.ep)}` : ''}?</b><span class="mut">Fjernes fra qBittorrent. Velg om filene på disken skal bli liggende.</span>
    <button type="button" class="p43-btn ghost lg" data-p43m="tdelgo" data-files="0">Slett, behold filene</button><button type="button" class="p43-btn red lg" data-p43m="tdelgo" data-files="1">Slett med filene</button><button type="button" class="p43-btn plain" data-p43m="shx">Avbryt</button>`, 'Slett nedlasting');
}
function editSheet() {
  const { k, id } = M.det ?? {}, x = k === 's' ? D.sd[id] ?? (D.ser ?? []).find((y) => String(y.id) === String(id)) : D.md[id] ?? (D.mov ?? []).find((y) => String(y.id) === String(id));
  if (!x) return '';
  const f = M.edit, PL = profList(k), L = f === 'prof' ? (PL.length ? PL.map((p) => [p.name, p.name]) : PROF.map((p) => [p, p])) : f === 'mon' ? MON : f === 'typ' ? STY : AV, cur = f === 'prof' ? x.prof : x[f];
  return sheetWrap(`${shHead({ prof: 'Kvalitetsprofil', mon: 'Overvåking', typ: 'Serietype', av: 'Last ned når den er' }[f])}<div class="p43-card p43-opts">${L.map(([kk, n]) => `<button type="button" class="${String(cur) === String(kk) ? 'on' : ''}" data-p43m="editv" data-k="${esc(kk)}"><span>${esc(n)}</span><b>${String(cur) === String(kk) ? '✓' : ''}</b></button>`).join('')}</div>`, 'Endre');
}
function parseMag(q) {
  q = String(q ?? '').trim(); if (!q) return {};
  if (/^magnet:\?/i.test(q)) {
    const h = q.match(/xt=urn:btih:([a-z0-9]{32,40})/i);
    if (!h) return { err: 'Magnet-lenken mangler xt=urn:btih:… (info-hash).' };
    let dn = (q.match(/[?&]dn=([^&]+)/i) || [])[1]; try { dn = dn ? decodeURIComponent(dn.replace(/\+/g, ' ')) : ''; } catch {}
    const tr = (q.match(/[?&]tr=/gi) || []).length;
    return { ok: true, hash: h[1].toLowerCase(), name: dn || `Magnet ${h[1].slice(0, 8).toLowerCase()}`, info: `btih ${h[1].slice(0, 12).toLowerCase()}… · ${tr} trackere${dn ? '' : ' · navnet hentes fra metadata'}` };
  }
  if (/^https?:\/\/\S+\.torrent(\?\S*)?$/i.test(q)) { let f = q.split('?')[0].split('/').pop(); try { f = decodeURIComponent(f); } catch {} return { ok: true, hash: `url:${q}`, name: f.replace(/\.torrent$/i, ''), info: '.torrent-fil · lastes ned av qBittorrent' }; }
  return { err: 'Det ser ikke ut som en magnet-lenke (magnet:?xt=urn:btih:…) eller en adresse som slutter på .torrent.' };
}
function magSheet() {
  const g = M.mag, pr = parseMag(g.q), path = g.cat === 'tv-sonarr' ? '/data/downloads/tv' : g.cat === 'radarr' ? '/data/downloads/film' : '/data/downloads';
  return sheetWrap(`${shHead('Legg til torrent')}<div class="p43-sec"><span class="p43-kh"><span class="p43-k mut">MAGNET-LENKE ELLER .TORRENT-ADRESSE</span><button type="button" class="p43-btn ghost sm" data-p43m="paste">Lim inn</button></span>
      <textarea id="p43-mq" class="p43-in ta mono" rows="4" placeholder="magnet:?xt=urn:btih:…&amp;dn=…" data-p43mi="mq" autocapitalize="off" spellcheck="false">${esc(g.q)}</textarea>
      ${pr.ok ? `<div class="p43-mok"><b>✓ ${esc(pr.name)}</b><span class="mono mut">${esc(pr.info)}</span></div>` : ''}</div>
    ${sec('KATEGORI', `${optChips([['', 'Ingen'], ['tv-sonarr', 'tv-sonarr'], ['radarr', 'radarr']], g.cat, 'mcat')}<span class="mut p43-sm">Lagres i <b class="mono">${path}</b>. Med tv-sonarr eller radarr importeres filen av Sonarr/Radarr når den er ferdig.</span>`)}
    <div class="p43-card p43-togs">${togRow('Start pauset', 'Legges i køen uten å starte', g.paused, 'mtog', 'paused')}${togRow('Sekvensiell nedlasting', 'Laster ned i rekkefølge, så du kan se mens den lastes', g.seq, 'mtog', 'seq')}${togRow('Første og siste del først', 'Gir raskere forhåndsvisning', g.fl, 'mtog', 'fl')}</div>
    ${g.err ? `<span class="p43-err">${esc(g.err)}</span>` : ''}<button type="button" class="p43-btn ink lg" data-p43m="magadd" ${g.busy ? 'disabled' : ''}>${g.busy ? 'Legger til …' : 'Legg til i qBittorrent'}</button>`, 'Legg til torrent');
}
const ityp = (x) => { if (ITYP[x.type]) return x.type; const t = /usenet/i.test(x.protocol ?? '') ? 'usenet' : x.privacy === 'semiPrivate' || /semi/i.test(x.privacy ?? '') ? 'semiPrivate' : /priv/i.test(x.privacy ?? '') ? 'private' : 'public'; return ITYP[t] ? t : 'public'; };
const authOf = (x) => { const F = (x.fields ?? []).map((f) => String(f.name ?? '').toLowerCase()); if (x.auth) return x.auth === 'none' ? '' : x.auth; if (F.some((f) => /cookie/.test(f))) return 'cookie'; if (F.some((f) => /apikey|api_key|passkey|rsskey/.test(f))) return 'key'; if (F.some((f) => /username/.test(f)) && F.some((f) => /password/.test(f))) return 'user'; return ''; };
function idxSheet() {
  const a = M.ia;
  if (!a.pick) {
    const S0 = D.schema, qq = a.q.trim().toLowerCase(), has = (n) => (S0 ?? []).find((x) => x.name === n)?.added || (D.idx ?? []).some((x) => String(x.name).toLowerCase() === String(n).toLowerCase());
    const L = (S0 ?? []).filter((x) => (a.typ === 'all' || ityp(x) === a.typ) && (!qq || String(x.name).toLowerCase().includes(qq) || String(x.language ?? '').toLowerCase().includes(qq))).slice(0, 80);
    return sheetWrap(`${shHead('Legg til indekser')}<input id="p43-iq" class="p43-in" data-p43mi="iq" value="${esc(a.q)}" placeholder="Søk blant ${S0?.length ? `${S0.length}` : '500+'} indeksere, f.eks. Nordic" autocomplete="off">
      <div class="p43-chips">${[['all', 'Alle'], ['public', 'Offentlig'], ['private', 'Privat'], ['semiPrivate', 'Semi-privat'], ['usenet', 'Usenet']].map(([k, n]) => chip(a.typ === k, n, `data-p43m="ityp" data-k="${k}"`)).join('')}</div>
      <div class="p43-al">${!S0 ? (D.err.schema ? `<span class="p43-err">${esc(D.err.schema)}</span>` : '<div class="m-spin"></div>') : L.map((x) => { const ex = has(x.name), [tn, tc] = ITYP[ityp(x)], cats = (x.capabilities?.categories ?? x.categories ?? []).slice(0, 3).map((c) => (typeof c === 'string' ? c : c.name)).join(', ');
        return `<button type="button" class="p43-ar" data-p43m="ipick" data-n="${esc(x.name)}" ${ex ? 'aria-disabled="true"' : ''}><span class="p43-ty" style="background:${tint(tc)};color:${tc}">${tn}</span><span class="m-grow"><b>${esc(x.name)}</b><span class="mut">${esc([cats, x.language, /usenet/i.test(x.protocol ?? '') ? 'Usenet' : 'Torrent'].filter(Boolean).join(' · '))}</span></span><span class="p43-arr" style="color:${ex ? 'var(--pp-mut)' : 'var(--pp-lab)'}">${ex ? 'Lagt til' : 'Velg ›'}</span></button>`; }).join('') || '<span class="mut">Fant ingen indeksere som passer.</span>'}</div>`, 'Legg til indekser');
  }
  const x = (D.schema ?? []).find((y) => y.name === a.pick) ?? { name: a.pick }, au = authOf(x), [tn, tc] = ITYP[ityp(x)];
  const help = (n) => (x.fields ?? []).find((f) => new RegExp(n, 'i').test(f.name ?? ''))?.help || (x.fields ?? []).find((f) => new RegExp(n, 'i').test(f.name ?? ''))?.helpText || x.authHelp;
  return sheetWrap(`${shHead('Legg til indekser')}<div class="p43-ahit"><span class="p43-ty" style="background:${tint(tc)};color:${tc}">${tn}</span><div><b class="p43-serif22">${esc(x.name)}</b><span class="mut">${esc([x.language, /usenet/i.test(x.protocol ?? '') ? 'Usenet' : 'Torrent'].filter(Boolean).join(' · '))}</span></div></div>
    ${au === 'user' ? sec('INNLOGGING', `<input class="p43-in" data-p43mi="iuser" value="${esc(a.user)}" placeholder="Brukernavn" autocomplete="off" autocapitalize="off"><input class="p43-in" type="password" data-p43mi="ipw" value="${esc(a.pw)}" placeholder="Passord" autocomplete="off">`) : ''}
    ${au === 'key' || au === 'cookie' ? sec(au === 'cookie' ? 'COOKIE' : 'API-NØKKEL', `<input class="p43-in mono" data-p43mi="ikey" value="${esc(a.key)}" placeholder="${au === 'cookie' ? 'uid=…; pass=…' : 'Lim inn nøkkelen'}" autocomplete="off" autocapitalize="off" spellcheck="false"><span class="mut p43-sm">${esc(help(au === 'cookie' ? 'cookie' : 'key') ?? (au === 'cookie' ? `Kopier cookien fra nettleseren mens du er logget inn på ${x.name}.` : `Finnes under Profil → Sikkerhet / API på ${x.name}.`))}</span>`) : ''}
    ${!au ? '<span class="mut">Offentlig indekser. Ingen innlogging trengs.</span>' : ''}
    ${sec(`PRIORITET · ${a.pri}`, `${optChips([1, 10, 25, 40, 50].map((n) => [n, String(n)]), a.pri, 'ipri')}<span class="mut p43-sm">Lavere tall brukes først når flere har samme utgivelse.</span>`)}
    <div class="p43-card p43-togs">${togRow('Sonarr', 'Bruk til serier', a.son, 'itog', 'son')}${togRow('Radarr', 'Bruk til filmer', a.rad, 'itog', 'rad')}</div>
    ${a.err ? `<span class="p43-err">${esc(a.err)}</span>` : ''}<div class="p43-row two"><button type="button" class="p43-btn ghost lg" data-p43m="iback">Tilbake</button><button type="button" class="p43-btn ink lg" data-p43m="isave" ${a.busy ? 'disabled' : ''}>${a.busy ? 'Tester …' : 'Test og lagre'}</button></div>`, 'Legg til indekser');
}
function setSheet() {
  const S0 = D.status, sv = (n) => { const o = (Array.isArray(S0?.services) ? S0.services.find((y) => String(y.id ?? y.name).toLowerCase() === n) : null) ?? S0?.[n] ?? S0?.services?.[n]; return o; };
  const svcs = [['sonarr', 'Sonarr'], ['radarr', 'Radarr'], ['qbittorrent', 'qBittorrent'], ['prowlarr', 'Prowlarr'], ['jellyfin', 'Jellyfin'], ['plex', 'Plex']].map(([k, n]) => { const o = sv(k) ?? (k === 'qbittorrent' ? sv('qbit') : null); return { n, o }; }).filter((x) => x.o || ['Sonarr', 'Radarr', 'qBittorrent', 'Prowlarr'].includes(x.n));
  return sheetWrap(`${shHead('Innstillinger for Media')}<div class="p43-card p43-togs">${togRow('Varsel når en nedlasting er ferdig', 'Push til telefonen og Glimt-briefen', M.set.nDone, 'stog', 'nDone')}${togRow('Varsel når noe feiler eller står fast', '0 seedere i 30 min, feil fra indekser, full disk', M.set.nFail, 'stog', 'nFail')}${togRow('Vis i Kalender-appen', 'Nye episoder og filmer som egen kalender «Media»', M.set.cal, 'stog', 'cal')}</div>
    ${sec('SPILL AV MED', `<div class="p43-row two">${['Jellyfin', 'Plex'].map((n) => `<button type="button" class="p43-chip lg${M.set.player === n ? ' on' : ''}" data-p43m="player" data-k="${n}" aria-pressed="${M.set.player === n}">${n}</button>`).join('')}</div>`)}
    ${sec('TJENESTER', `<div class="p43-card p43-svcs">${svcs.map(({ n, o }) => { const conf = o ? o.configured !== false : false, ok = o?.ok ?? (o ? conf : false); return `<div class="p43-sv"><i style="background:${ok ? '#2f6b4a' : conf ? '#b23a2a' : 'var(--pp-line)'}"></i><div class="m-grow"><b>${esc(n)}</b><span class="mono mut m-ell">${esc(o?.url ?? o?.host ?? (o?.mock && ok ? 'Demodata (MOCK)' : conf || ok ? '' : 'Ikke satt opp'))}</span></div><span class="p43-sm" style="font-weight:700;color:${ok ? '#2f6b4a' : conf ? '#b23a2a' : 'var(--pp-mut)'}">${esc(o ? (ok ? `${o.version ? `v${String(o.version).split('.')[0]} · ` : ''}OK${o.ms != null ? ` · ${o.ms} ms` : ''}${o.mock ? ' · demo' : ''}` : conf ? 'Svarer ikke' : 'Ikke satt opp') : D.miss.status ? '–' : '…')}</span></div>`; }).join('')}</div>
      <span class="mut p43-sm">API-nøklene lagres på serveren. Appen snakker bare med home.kristo.no. Adresser, nøkler og oppsett steg for steg: <a href="#/set/integ" class="lab">Innstillinger → Integrasjoner → Media</a>.</span>`)}`, 'Innstillinger for Media');
}
export function layer43m() {
  const sh = M.sh; requestAnimationFrame(() => { M.shSeen = sh; }); // arket glir bare inn første gang
  if (m.screen !== 'media' || !M.sh) return '';
  if (M.sh === 'add' && M.add) return addSheet();
  if (M.sh === 'act') return actSheet();
  if (M.sh === 'del') return delSheet();
  if (M.sh === 'edit') return editSheet();
  if (M.sh === 'mag' && M.mag) return magSheet();
  if (M.sh === 'idx' && M.ia) return idxSheet();
  if (M.sh === 'set') return setSheet();
  if (M.sh === 'srv') return srvSheet();
  if (M.sh === 'fdel' && M.fdel) return fdelSheet();
  return '';
}

/** Hele siden (#/media). */
export function mediaView43() {
  if (!D.t.status && !D.busy.status) reload(false);
  const wide = wideOn();
  let body;
  if (M.srch) body = srchView();
  else if (M.tab === 'kom') body = komView();
  else if (M.tab === 'son' || M.tab === 'rad') {
    const k = M.tab === 'son' ? 's' : 'm';
    body = M.det && wide ? `<div class="p43-split"><div class="p43-sl">${libView(k)}</div><aside class="p43-sr">${detView()}</aside></div>` : M.det ? detView() : libView(k);
  } else if (M.tab === 'qb') body = qbView();
  else if (M.tab === 'avs') body = globalThis.P44?.avsView ? globalThis.P44.avsView(true) : '<div class="m-spin"></div>'; // prompt 44
  else body = proView();
  if (M.tab !== 'avs' && M.tab !== 'kom' && !M.srch) body = srvRow() + body; // prompt 44: servervalg øverst i fanen
  const enter = Date.now() - (M.enterAt ?? 0) < 350; // inn-animasjonen bare når siden åpnes, ikke ved hver ny tegning
  return `<div class="p43m${wide ? ' wide' : ''}${enter ? ' enter' : ''}">${header()}${glimtPanel()}<div class="p43-body">${body}</div></div>`;
}
export function afterDraw43m() {
  const r = document.querySelector('#app > .m');
  if (r) r.classList.toggle('p43-mpg', m.screen === 'media');
}

/* =====================================================================
   Handlinger
   ===================================================================== */
function curSer() { const id = M.det?.id; return D.sd[id] ?? (D.ser ?? []).find((y) => String(y.id) === String(id)); }
function curMov() { const id = M.det?.id; return D.md[id] ?? (D.mov ?? []).find((y) => String(y.id) === String(id)); }
async function cmd(body, msg) { try { await mApi('/command', { method: 'POST', json: body }); if (msg) flash(msg); return true; } catch (e) { flash(errText(e)); return false; } }
async function torOp(hash, op, body) { try { await mApi(`/torrents/${encodeURIComponent(hash)}/${op}`, { method: 'POST', json: body ?? {} }); } catch (e) { flash(errText(e)); } await loadTor(true); draw(); }
async function pauseAll() {
  const c = (D.tor ?? []).filter((t) => t.st !== 'seed'), allP = c.length > 0 && c.every((t) => t.pz);
  haptic('tap'); try { navigator.vibrate?.(8); } catch {}
  for (const t of D.tor ?? []) if (t.st !== 'seed') t.pz = !allP; draw();
  try { await mApi(`/torrents/${allP ? 'resumeAll' : 'pauseAll'}`, { method: 'POST', json: {} }); flash(allP ? 'Alle nedlastinger går igjen' : 'Alt er pauset'); } catch (e) { flash(errText(e)); }
  await loadTor(true); draw();
}
async function grabRel(r, key, auto) {
  M.grab[key] = true; haptic('ok'); try { navigator.vibrate?.(10); } catch {} draw();
  try {
    await mApi('/release', { method: 'POST', json: { guid: r.guid ?? r.id, indexerId: r.indexerId, service: M.srch?.k === 'm' || r.service === 'radarr' ? 'radarr' : 'sonarr' } });
    flash(auto ? `Automatisk søk · sendte ${r.q} fra ${r.ix} til qBittorrent` : `Sendt til qBittorrent: ${r.q} · ${gbT(r.gb)}`);
    loadTor(true);
  } catch (e) { M.grab[key] = false; flash(errText(e)); draw(); }
}
async function lookup(q) {
  const a = M.add; if (!a) return;
  a.q = q; a.busy = true; a.err = ''; a.done = false; draw();
  try {
    const r = a.k === 's' ? await mApi(`/series/lookup?term=${encodeURIComponent(q)}`) : await rApi(`/lookup?term=${encodeURIComponent(q)}`);
    a.res = arr(r, 'items', 'results').map((x) => ({ ...(a.k === 's' ? nSer(x) : nMov(x)), raw: x, ex: !!(x.exists ?? x.added ?? (x.id && x.id > 0) ?? false), nS: (x.seasons ?? []).filter((s) => (s.seasonNumber ?? 1) > 0).length || null, net: x.network ?? '' }));
  } catch (e) { a.err = errText(e); a.res = []; }
  a.busy = false; a.done = true; draw();
}
async function addConfirm() {
  const a = M.add; if (!a?.sel || a.busy) return;
  a.busy = true; a.err = ''; draw();
  const x = a.sel, ser = a.k === 's', pid = profList(a.k).find((p) => p.name === a.prof)?.id;
  const body = ser ? { tvdbId: x.tvdbId ?? x.raw?.tvdbId, title: x.t, year: x.y, profile: a.prof, profileId: pid, monitor: a.mon, seriesType: a.typ, rootFolder: a.root ?? undefined, searchNow: a.go }
    : { tmdbId: x.tmdbId ?? x.raw?.tmdbId, title: x.t, year: x.y, profile: a.prof, profileId: pid, minimumAvailability: a.av, rootFolder: a.root ?? undefined, searchNow: a.go, monitored: true };
  try {
    const r = ser ? await mApi('/series', { method: 'POST', json: body }) : await rApi('', { method: 'POST', json: body });
    const nid = r?.id ?? r?.series?.id ?? r?.movie?.id;
    haptic('ok'); flash(r?.message ?? `Lagt til ${x.t} · ${a.prof}${a.go ? (ser ? ' · søker etter manglende episoder' : ' · søker nå') : ''}`);
    M.sh = null; M.add = null; M.gl = null; M.tab = ser ? 'son' : 'rad'; M.srch = null; M.det = nid != null ? { k: a.k, id: nid } : null;
    if (ser) { D.t.ser = 0; await loadSer(true); if (nid != null) await loadSerDet(nid, true); } else { D.t.mov = 0; await loadMov(true); if (nid != null) await loadMovDet(nid, true); }
  } catch (e) { a.err = e.status === 409 ? `${x.t} finnes allerede` : errText(e); a.busy = false; }
  draw();
}
async function editSave(f, v) {
  const { k, id } = M.det ?? {}; if (!k) return;
  const x = k === 's' ? curSer() : curMov(); if (!x) return;
  const label = (f === 'prof' ? v : f === 'mon' ? lbl(MON, v) : f === 'typ' ? lbl(STY, v) : lbl(AV, v));
  const body = f === 'prof' ? { profile: v, profileId: profList(k).find((p) => p.name === v)?.id } : f === 'mon' ? { monitor: v } : f === 'typ' ? { seriesType: v } : { minimumAvailability: v };
  if (f === 'prof') x.prof = v; else if (f === 'av') x.av = v; else x[f] = v;
  M.sh = null; draw();
  try { if (k === 's') await mApi(`/series/${encodeURIComponent(id)}`, { method: 'PUT', json: body }); else await rApi(`/${encodeURIComponent(id)}`, { method: 'PUT', json: body }); flash(`${{ prof: 'Profil', mon: 'Overvåking', typ: 'Serietype', av: 'Tilgjengelighet' }[f]}: ${label}`); }
  catch (e) { flash(errText(e)); }
  if (k === 's') loadSerDet(id, true).then(draw); else loadMovDet(id, true).then(draw);
}
async function monSet(ids, on, season) {
  const x = curSer(); if (!x) return;
  for (const e of x.eps ?? []) if (ids.includes(String(e.id)) || (season != null && e.s === season)) e.mon = on;
  if (season != null) { x.seasonMon = { ...(x.seasonMon ?? {}), [season]: on }; }
  haptic('tap'); draw();
  try { if (season != null) await mApi(`/series/${encodeURIComponent(x.id)}`, { method: 'PUT', json: { seasons: [{ seasonNumber: season, monitored: on }] } }); else await mApi('/episode/monitor', { method: 'PUT', json: { episodeIds: ids.map((i) => +i || i), monitored: on } }); }
  catch (e) { flash(errText(e)); loadSerDet(x.id, true).then(draw); }
}
async function filesLoad(hash) {
  try { const r = await mApi(`/torrents/${encodeURIComponent(hash)}/files`); D.files[hash] = { list: arr(r, 'items', 'files').map((f, i) => ({ i: f.index ?? f.id ?? i, n: f.name ?? f.n, s: f.sizeText ?? (f.size != null ? gbT(f.size / 1024 ** 3) : f.s ?? ''), on: f.wanted ?? (f.priority ?? 1) > 0 })) }; }
  catch (e) { D.files[hash] = { list: [], err: errText(e) }; }
  draw();
}
async function testIdx(id) {
  M.idxT[id] = { st: 'run' }; draw();
  const t0 = performance.now();
  try { const r = await mApi(`/indexers/${encodeURIComponent(id)}/test`, { method: 'POST', json: {} }); M.idxT[id] = r?.ok === false ? { st: 'fail', msg: r.error ?? r.message ?? 'Testen feilet' } : { st: 'ok', ms: r?.ms ?? Math.round(performance.now() - t0) }; loadIdx(true).then(draw); }
  catch (e) { M.idxT[id] = { st: 'fail', msg: e.status === 404 ? 'Krever en nyere server' : e.message }; }
  draw();
}

/* ---------- Glimt i Media ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function glimt(q) {
  q = String(q ?? '').trim(); if (!q) return;
  const G = { q, steps: [], res: null, busy: true }; M.gl = G; M.gq = q; draw();
  const step = (n, ms) => { if (M.gl === G) { G.steps.push({ n, ms }); draw(); } };
  const t0 = performance.now();
  try {
    const r = await mApi('/glimt', { method: 'POST', json: { q } });
    if (M.gl !== G) return;
    (r?.steps ?? []).forEach((s) => G.steps.push({ n: s.t ?? s.n ?? s.text ?? s.name ?? String(s), ms: s.ms ?? null }));
    if (!r?.steps?.length) G.steps.push({ n: 'Forstår forespørselen', ms: Math.round(performance.now() - t0) });
    G.res = fromServer(r); G.busy = false; haptic('ok'); draw();
    if ((r?.actions ?? []).some((a) => a.done || a.executed)) { loadTor(true).then(draw); }
    return;
  } catch (e) { if (e.status !== 404 && e.status !== 405) { if (M.gl === G) { G.busy = false; G.res = { text: errText(e) }; draw(); } return; } }
  // Reserve (eldre server uten /api/media/glimt): samme forståelse som fasiten, med de vanlige endepunktene.
  const low = q.toLowerCase(), t = () => Math.round(performance.now() - t0);
  step('Forstår forespørselen', t());
  if (/^(pause|stopp)\s+alt/.test(low)) { await pauseAllTo(true); step('Pauser nedlastinger i qBittorrent', t()); G.res = { text: 'Alt er pauset.' }; }
  else if (/^(fortsett|start)\s+alt/.test(low)) { await pauseAllTo(false); step('Starter nedlastinger i qBittorrent', t()); G.res = { text: 'Alle nedlastinger går igjen.' }; }
  else if (/lastes|laster ned|nedlasting/.test(low) && !/legg til/.test(low)) { await loadTor(true); step('Leser køen i qBittorrent', t()); const a = (D.tor ?? []).filter((x) => x.st === 'dl' && !x.pz); G.res = { text: a.length ? `Lastes ned nå: ${a.map((x) => `${x.nm}${['Film', 'Egen'].includes(x.ep) ? '' : ` ${x.ep}`} (${Math.floor(x.p)} %)`).join(', ')}` : 'Ingenting lastes ned nå.' }; }
  else if (/episode/.test(low) && /(under|over|mindre enn|større enn|maks|minst)\s*[\d.,]+\s*(mb|gb)/.test(low)) G.res = await sizeSearch(low, step, t);
  else {
    const mm = q.match(/(?:legg til|last ned|hent|finn)\s+(.+?)(?:\s+i\s+(4k|uhd|2160p?|1080p?|720p?|hd))?\s*$/i);
    if (!mm) G.res = { text: 'Prøv «legg til Severance i 4K», «finn en episode av The Rookie som er under 500 MB», «pause alt» eller «hva lastes ned».' };
    else {
      const qq = (mm[2] || '').toLowerCase(), pf0 = /4k|uhd|2160/.test(qq) ? 'Ultra-HD' : /720/.test(qq) ? 'HD-720p' : qq ? 'HD-1080p' : null, term = mm[1].trim();
      const [rs, rm] = await Promise.all([mApi(`/series/lookup?term=${encodeURIComponent(term)}`).catch(() => []), rApi(`/lookup?term=${encodeURIComponent(term)}`).catch(() => [])]);
      step('Søker i Sonarr og Radarr', t());
      const P = [...arr(rs, 'items').map((x) => ({ k: 's', x: nSer(x), raw: x })), ...arr(rm, 'items').map((x) => ({ k: 'm', x: nMov(x), raw: x }))], low2 = term.toLowerCase();
      const hit = P.find((p) => p.x.t.toLowerCase() === low2) ?? P.find((p) => p.x.t.toLowerCase().includes(low2)) ?? P[0];
      if (!hit) G.res = { text: `Fant ingenting som heter «${term}».` };
      else { const ex = !!(hit.raw.id && hit.raw.id > 0) || !!hit.raw.exists, pf = pf0 ?? (hit.k === 's' ? 'HD-1080p' : 'Ultra-HD'); step(ex ? 'Fant den i biblioteket' : `Valgte profil ${pf}`, t());
        G.res = { hit: { ...hit.x, raw: hit.raw, k: hit.k, ex, prof: pf, meta: `${hit.k === 's' ? 'Serie' : 'Film'} · ${[hit.x.y, hit.x.net].filter(Boolean).join(' · ')}`, line: ex ? `Finnes allerede i ${hit.k === 's' ? 'Sonarr' : 'Radarr'}` : `${pf} · ${hit.k === 's' ? 'Alle episoder · /data/media/tv' : 'Utgitt digitalt · /data/media/film'}` } }; }
    }
  }
  if (M.gl === G) { G.busy = false; haptic('ok'); draw(); }
}
async function pauseAllTo(p) { try { await mApi(`/torrents/${p ? 'pauseAll' : 'resumeAll'}`, { method: 'POST', json: {} }); } catch {} await loadTor(true); }
async function sizeSearch(low, step, t) {
  const mm = low.match(/episode[rn]?\s+(?:av|fra|i)\s+(.+?)\s+(?:som\s+er\s+|på\s+)?(under|over|mindre enn|større enn|maks|minst)\s*([\d.,]+)\s*(mb|gb)/);
  if (!mm) return { text: 'Prøv «finn en episode av The Rookie som er under 500 MB».' };
  const ttl = mm[1].replace(/^(en|ei|et)\s+/, '').trim(), lt = /under|mindre|maks/.test(mm[2]), lim = parseFloat(mm[3].replace(',', '.')) * (mm[4] === 'gb' ? 1024 : 1), limT = `${mm[3]} ${mm[4].toUpperCase()}`;
  await loadSer();
  const x = (D.ser ?? []).find((s) => s.t.toLowerCase() === ttl) ?? (D.ser ?? []).find((s) => s.t.toLowerCase().includes(ttl));
  step('Søker i Sonarr', t());
  if (!x) return { text: `${ttl.replace(/^./, (c) => c.toUpperCase())} er ikke i biblioteket. Skriv «legg til ${ttl}» for å legge den til.` };
  await loadSerDet(x.id);
  const d = D.sd[x.id], eps = (d?.eps ?? []).filter((e) => e.aired), miss = eps.filter((e) => !e.has).reverse(), rest = eps.filter((e) => e.has).reverse(), pick = [...miss, ...rest].slice(0, 3);
  step(`Fant ${x.t} i Sonarr`, t());
  const t1 = performance.now(), list = [];
  for (const e of pick) {
    try { const r = await mApi(`/release?episodeId=${encodeURIComponent(e.id)}`); arr(r, 'items', 'releases').map(nRel).filter((y) => y.s > 0 && (lt ? y.gb * 1024 <= lim : y.gb * 1024 >= lim)).sort((p, q) => q.s - p.s).slice(0, 2).forEach((y) => list.push({ r: y, cd: code(e.s, e.e), en: e.n, has: e.has, ep: e.id })); } catch {}
  }
  step('Søker i indekserne via Prowlarr', Math.round(performance.now() - t1));
  step(`Filtrerer på ${lt ? 'under' : 'over'} ${limT} · ${list.length} treff`, 2);
  return list.length ? { list, listH: `${list.length} utgivelser av ${x.t} ${lt ? 'under' : 'over'} ${limT}${miss.length ? ' · manglende episoder først' : ''}` } : { text: `Fant ingen utgivelser av ${x.t} ${lt ? 'under' : 'over'} ${limT} med seedere.` };
}
/** Svar fra POST /api/media/glimt → {text, actions[], results[]} til visningen over. */
function fromServer(r) {
  const res = { text: r?.text ?? r?.answer ?? '', actions: (r?.actions ?? []).filter((a) => !(a.done || a.executed) && (a.label || a.title) && !['grab', 'add', 'edit', 'open'].includes(a.type)) };
  const R = arr(r, 'results', 'items');
  const rels = R.filter((x) => x.guid || x.release), hits = R.filter((x) => !(x.guid || x.release) && ['series', 'movie'].includes(x.kind ?? 'series') && (x.title || x.t));
  if (rels.length) { res.list = rels.map((x) => { const rr = nRel(x.release ?? x); return { r: { ...rr, service: x.service }, cd: x.code ?? (x.seasonNumber != null ? code(x.seasonNumber, x.episodeNumber) : x.episode ?? ''), en: x.episodeTitle ?? x.en ?? '', has: !!(x.has ?? x.hasFile), ep: x.episodeId }; }); res.listH = r?.listTitle ?? r?.title ?? `${rels.length} utgivelser`; }
  if (hits.length) { const h = hits[0], k = h.kind === 'movie' || h.type === 'movie' || h.tmdbId != null && h.tvdbId == null ? 'm' : 's', x = k === 's' ? nSer(h) : nMov(h); res.hit = { ...x, raw: h.lookup ?? h, k, ex: !!(h.exists ?? (h.id && h.id > 0)), id: h.id ?? x.id, prof: h.profile ?? h.qualityProfile ?? (k === 's' ? 'HD-1080p' : 'Ultra-HD'), line0: h.monitorLabel ?? h.availabilityLabel, meta: `${k === 's' ? 'Serie' : 'Film'} · ${[x.y, x.net].filter(Boolean).join(' · ')}`, line: h.line ?? (h.exists ? h.existsLabel ?? `Finnes allerede i ${k === 's' ? 'Sonarr' : 'Radarr'}` : `${h.profile ?? (k === 's' ? 'HD-1080p' : 'Ultra-HD')} · ${h.monitorLabel ?? h.availabilityLabel ?? (k === 's' ? 'Alle episoder' : 'Utgitt digitalt')} · ${k === 's' ? '/data/media/tv' : '/data/media/film'}`), mon: h.monitor ?? 'all' }; }
  if (!res.text && !res.list && !res.hit) res.text = 'Ferdig.';
  return res;
}
async function glAct(a) {
  const ty = String(a.type ?? a.kind ?? '').toLowerCase();
  try {
    if (/pauseall/.test(ty)) await pauseAllTo(true);
    else if (/resumeall/.test(ty)) await pauseAllTo(false);
    else if (/open/.test(ty)) { M.gl = null; openDet(a.media === 'movie' || a.k === 'm' ? 'm' : 's', a.id); return; }
    else if ((a.url || a.path) && a.method) await hlApi(String(a.url ?? a.path).replace(/^\/api/, ''), { method: a.method, json: a.body ?? a.payload ?? {} });
    else if (/add/.test(ty)) { const mv = a.media === 'movie' || a.k === 'm'; if (mv) await rApi('', { method: 'POST', json: a.body ?? a.payload ?? a }); else await mApi('/series', { method: 'POST', json: a.body ?? a.payload ?? a }); }
    flash(a.doneText ?? 'Ferdig'); haptic('ok');
  } catch (e) { flash(errText(e)); }
  if (M.gl?.res) M.gl.res.actions = (M.gl.res.actions ?? []).filter((y) => y !== a);
  draw();
}
function openDet(k, id) {
  M.tab = k === 's' ? 'son' : 'rad'; M.det = { k, id }; M.srch = null; M.fq = 'all';
  draw(); (k === 's' ? loadSerDet(id) : loadMovDet(id)).then(draw);
  if (k === 's' && !D.ser) loadSer().then(draw); if (k === 'm' && !D.mov) loadMov().then(draw);
  requestAnimationFrame(() => { if (!wideOn()) window.scrollTo({ top: 0 }); });
}
function openAdd(k, pre) {
  M.add = { k, q: pre?.q ?? '', res: null, sel: pre?.sel ?? null, prof: pre?.prof ?? (k === 's' ? 'HD-1080p' : 'Ultra-HD'), mon: pre?.mon ?? 'all', typ: 'standard', av: 'released', go: true, busy: false, err: '', root: null };
  M.sh = 'add'; loadProf().then(draw); loadRoots().then(() => { const r = (D.roots ?? []).find((y) => (k === 's' ? /tv/i : /film|movie/i).test(y.path)); if (r && M.add) { M.add.root = r.path; draw(); } });
  draw(); setTimeout(() => document.getElementById('p43-aq')?.focus(), 80);
}
function goBack() {
  if (M.srch) { M.srch = null; draw(); return; }
  if (M.det) { M.det = null; draw(); return; }
  const prev = globalThis.P43?.mediaFrom;
  location.hash = prev ? `#/${prev}` : '#/mer';
}

export async function bind43m(e, t) {
  if (m.screen !== 'media') return false;
  const x = t.closest?.('[data-p43m]'); if (!x) return false;
  const a = x.dataset.p43m, k = x.dataset.k;
  if (x.tagName !== 'A') e.preventDefault();
  if (x.getAttribute('aria-disabled') === 'true' && a === 'ipick') { flash(`${x.dataset.n} er allerede lagt til`); return true; }
  switch (a) {
    case 'back': haptic('tap'); goBack(); return true;
    case 'tab': if (M.tab === k && !M.det && !M.srch) { window.scrollTo({ top: 0, behavior: 'smooth' }); return true; } M.tab = k; M.det = null; M.srch = null; haptic('tab'); draw(); reload(false); return true;
    case 'gltog': M.glM = !M.glM; haptic('tap'); draw(); if (M.glM) setTimeout(() => document.getElementById('p43-gq')?.focus(), 60); return true;
    case 'glx': M.gl = null; M.gq = ''; draw(); return true;
    case 'glgrab': { const o = M.gl?.res?.list?.[+x.dataset.i]; if (o && !M.grab[`gl:${x.dataset.i}`]) { M.grab[`gl:${x.dataset.i}`] = true; draw(); try { await mApi('/release', { method: 'POST', json: { guid: o.r.guid ?? o.r.id, indexerId: o.r.indexerId, service: o.r.service ?? 'sonarr' } }); haptic('ok'); flash(`Sendt til qBittorrent: ${o.r.q} · ${gbT(o.r.gb)}`); loadTor(true); } catch (err) { M.grab[`gl:${x.dataset.i}`] = false; flash(errText(err)); draw(); } } return true; }
    case 'glhit': { const h = M.gl?.res?.hit; if (!h) return true; if (h.ex) { M.gl = null; M.gq = ''; openDet(h.k, h.raw?.id ?? h.id); return true; } openAdd(h.k, { sel: h, prof: h.prof, mon: h.mon }); M.add.go = true; await addConfirm(); return true; }
    case 'gledit': { const h = M.gl?.res?.hit; if (h) openAdd(h.k, { sel: h, prof: h.prof, mon: h.mon, q: h.t }); return true; }
    case 'glact': { const ac = M.gl?.res?.actions?.[+x.dataset.i]; if (ac) await glAct(ac); return true; }
    case 'set': M.sh = 'set'; loadStatus(true).then(draw); haptic('tap'); draw(); return true;
    case 'shx': M.sh = null; draw(); return true;
    case 'retry': D.t = {}; D.err = {}; D.miss = {}; delete D.err.forbid; reload(true); draw(); return true;
    case 'cal': flash(M.set.cal ? 'Kommer snart vises i Kalender-appen under «Media»' : 'Slå på «Vis i Kalender» i innstillingene for Media'); return true;
    case 'open': openDet(x.dataset.kind, x.dataset.id); haptic('tap'); return true;
    case 'detx': M.det = null; draw(); return true;
    case 'libf': M.libF = k; haptic('tab'); draw(); return true;
    case 'add': openAdd(x.dataset.kind); haptic('tap'); return true;
    case 'apick': { const s = M.add?.res?.[+x.dataset.i]; if (!s) return true; if (s.ex) { const kk = M.add.k; M.sh = null; M.add = null; openDet(kk, s.raw?.id ?? s.id); return true; } M.add.sel = s; haptic('tap'); draw(); return true; }
    case 'aprof': M.add.prof = k; draw(); return true;
    case 'amon': M.add.mon = k; draw(); return true;
    case 'atyp': M.add.typ = k; draw(); return true;
    case 'aav': M.add.av = k; draw(); return true;
    case 'ago': M.add.go = !M.add.go; draw(); return true;
    case 'aback': M.add.sel = null; draw(); return true;
    case 'aok': await addConfirm(); return true;
    case 'edit': M.edit = x.dataset.f; M.sh = 'edit'; if (x.dataset.f === 'prof') loadProf().then(draw); haptic('tap'); draw(); return true;
    case 'editv': await editSave(M.edit, k); return true;
    case 'mmon': { const mv = curMov(); if (!mv) return true; mv.mon = !mv.mon; draw(); try { await rApi(`/${encodeURIComponent(mv.id)}`, { method: 'PUT', json: { monitored: mv.mon } }); flash(mv.mon ? 'Overvåket' : 'Ikke overvåket'); } catch (err) { flash(errText(err)); } return true; }
    case 'play': { const it = M.det?.k === 'm' ? curMov() : curSer(); const u = it?.play?.url ?? D.status?.play?.url; if (u) window.open(u, '_blank', 'noopener'); flash(`Åpner ${it?.t ?? ''} i ${M.set.player}`); return true; }
    case 'missall': { const s = curSer(); const ids = (s?.eps ?? []).filter((e) => e.aired && !e.has && e.mon && ['miss', 'stall'].includes(epSt(e)[0])).map((e) => e.id); if (!ids.length) return true; haptic('tap'); await cmd(ids.length > 6 ? { name: 'MissingEpisodeSearch', seriesId: s.id } : { name: 'EpisodeSearch', episodeIds: ids }, `Søker etter ${ids.length} manglende episoder`); return true; }
    case 'setog': { const id = M.det?.id, kk = `${id}-${x.dataset.s}`, cur = M.open[kk] ?? (x.closest('.p43-se') === x.closest('.p43-ses')?.firstElementChild); M.open[kk] = !cur; draw(); return true; }
    case 'semon': { const s = curSer(); const sn = +x.dataset.s, on = !(s?.seasonMon?.[sn] ?? (s?.eps ?? []).some((e) => e.s === sn && e.mon)); await monSet([], on, sn); return true; }
    case 'epmon': { const s = curSer(); const ep = (s?.eps ?? []).find((y) => String(y.id) === x.dataset.ep); if (ep) await monSet([String(ep.id)], !ep.mon); return true; }
    case 'ssearch': { const s = curSer(); haptic('tap'); await cmd({ name: 'SeasonSearch', seriesId: s?.id, seasonNumber: +x.dataset.s }, `Søker etter sesong ${x.dataset.s}`); return true; }
    case 'auto': { const s = curSer(); const ep = (s?.eps ?? []).find((y) => String(y.id) === x.dataset.ep); haptic('tap'); await cmd({ name: 'EpisodeSearch', episodeIds: [+x.dataset.ep || x.dataset.ep] }, `Automatisk søk: ${ep ? code(ep.s, ep.e) : 'episode'} · sendes til qBittorrent når et treff passer profilen`); return true; }
    case 'inter': M.srch = { k: 's', id: M.det.id, ep: x.dataset.ep }; M.fq = 'all'; haptic('tap'); draw(); relLoad().then(draw); window.scrollTo({ top: 0 }); return true;
    case 'mauto': { const mv = curMov(); haptic('tap'); await cmd({ name: 'MoviesSearch', movieIds: [mv?.id], service: 'radarr' }, `Automatisk søk: ${mv?.t ?? 'filmen'}`); return true; }
    case 'minter': M.srch = { k: 'm', id: M.det.id }; M.fq = 'all'; haptic('tap'); draw(); relLoad().then(draw); window.scrollTo({ top: 0 }); return true;
    case 'srchx': { const kk = M.srch ? relKey() : null; if (kk && JOB[kk]) JOB[kk].on = false; M.srch = null; draw(); return true; }
    /* Prompt 44 */
    case 'relstop': { const kk = relKey(); if (JOB[kk]) { JOB[kk].on = false; if (JOB[kk].id) mApi(`/release/search/${encodeURIComponent(JOB[kk].id)}`, { method: 'DELETE' }).catch(() => {}); } if (D.rel[kk]) { D.rel[kk].running = false; D.rel[kk].done = true; } draw(); return true; }
    case 'relogin': location.href = `/?next=${encodeURIComponent('/finans/#/media')}`; return true;
    case 'srvsh': M.sh = 'srv'; loadServers().then(draw); haptic('tap'); draw(); return true;
    case 'srvpick': { M.site = k; try { localStorage.setItem('media_site', k); } catch {} hlApi('/me/layout', { method: 'PUT', json: { media_site: k } }).catch(() => {}); hlApi('/media/servers/select', { method: 'PUT', json: { id: k } }).catch(() => {}); M.sh = null; M.det = null; M.srch = null; Object.keys(D.t).forEach((kk) => { if (kk !== 'servers' && kk !== 'status') delete D.t[kk]; }); D.ser = null; D.mov = null; D.tor = null; D.idx = null; D.upc = null; D.rel = {}; haptic('tab'); flash(`Bruker ${(D.servers ?? []).find((y) => y.id === k)?.name ?? k} for Sonarr, Radarr, qBittorrent og Prowlarr`); reload(true); return true; }
    case 'lqx': M.lq[k] = ''; draw(); setTimeout(() => document.getElementById(`p44m-lq-${k}`)?.focus(), 30); return true;
    case 'lqadd': { const kk = x.dataset.kind, q = M.lq[kk].trim(); openAdd(kk, { q }); if (q) lookup(q); return true; }
    case 'komv': M.komv = k === 'uke' ? 'uke' : 'liste'; try { localStorage.setItem('media_komv', M.komv); } catch {} haptic('tab'); draw(); return true;
    case 'detnav': if (x.dataset.id) { openDet(M.det.k, x.dataset.id); haptic('tab'); } return true;
    case 'redl': M.srch = { k: 's', id: M.det.id, ep: x.dataset.ep, re: true }; M.fq = 'all'; haptic('tap'); draw(); relLoad(true).then(draw); window.scrollTo({ top: 0 }); return true;
    case 'mredl': M.srch = { k: 'm', id: M.det.id, re: true }; M.fq = 'all'; haptic('tap'); draw(); relLoad(true).then(draw); window.scrollTo({ top: 0 }); return true;
    case 'fdel': {
      if (x.dataset.m) { const mv = curMov(); if (!mv) return true; M.fdel = { k: 'm', id: mv.id, fileId: mv.fileId, label: `${mv.t}${mv.q ? ` · ${mv.q}` : ''}` }; }
      else { const se = curSer(), ep = (se?.eps ?? []).find((y) => String(y.id) === x.dataset.ep); if (!ep) return true; M.fdel = { k: 'e', id: ep.id, sid: se.id, fileId: ep.fileId, label: `${se.t} ${code(ep.s, ep.e)} · ${ep.n}` }; }
      M.sh = 'fdel'; haptic('tap'); draw(); return true;
    }
    case 'fdelgo': {
      const F = M.fdel; M.sh = null; M.fdel = null; if (!F) return true; haptic('err'); draw();
      try {
        const r = await mApi(F.k === 'e' ? `/episodes/${encodeURIComponent(F.id)}/file` : `/movies/${encodeURIComponent(F.id)}/file`, { method: 'DELETE' });
        if (F.k === 'e') { delete D.t[`sd${F.sid}`]; await loadSerDet(F.sid, true); } else { delete D.t[`md${F.id}`]; await loadMovDet(F.id, true); }
        const U = r?.undo;
        const undo = async () => { try { if (U?.path) await hlApi(U.path.replace(/^\/api/, ''), { method: U.method ?? 'POST', json: U.body ?? {} }); else if (F.k === 'e') await monSet([String(F.id)], true); else await rApi(`/${encodeURIComponent(F.id)}`, { method: 'PUT', json: { monitored: true } }); if (F.k === 'e') await loadSerDet(F.sid, true); else await loadMovDet(F.id, true); draw(); } catch (err) { flash(errText(err)); } };
        if (globalThis.P44?.toast) globalThis.P44.toast(`Slettet ${F.label}`, { label: 'Angre', fn: undo }, 5000); else flash(`Slettet ${F.label}`);
      } catch (err) { flash(err.status === 403 ? 'Bare admin kan slette filer' : errText(err)); }
      draw(); return true;
    }
    case 'relretry': delete D.t[`rel${relKey()}`]; relLoad(true).then(draw); draw(); return true;
    case 'fq': M.fq = k; haptic('tab'); draw(); return true;
    case 'grab': { const R = D.rel[relKey()], r = R?.rows.find((y) => String(y.id) === x.dataset.g), key = `${relKey()}:${x.dataset.g}`; if (r && !M.grab[key]) await grabRel(r, key); return true; }
    case 'pauseall': await pauseAll(); return true;
    case 'alt': { const X = D.xfer ?? (D.xfer = {}); const on = !(X.use_alt_speed_limits ?? X.altSpeed ?? X.alt); X.use_alt_speed_limits = on; haptic('tap'); draw(); try { const r = await mApi('/altSpeed', { method: 'POST', json: { on } }); if (r && typeof r === 'object' && ('use_alt_speed_limits' in r || 'on' in r)) X.use_alt_speed_limits = r.use_alt_speed_limits ?? r.on; } catch (err) { X.use_alt_speed_limits = !on; flash(errText(err)); } draw(); return true; }
    case 'seg': M.seg = k; haptic('tab'); draw(); return true;
    case 'ttog': { const tt = (D.tor ?? []).find((y) => y.hash === x.dataset.h); if (!tt) return true; tt.pz = !tt.pz; haptic('tap'); try { navigator.vibrate?.(8); } catch {} draw(); await torOp(tt.hash, tt.pz ? 'pause' : 'resume'); return true; }
    case 'tmore': M.act = x.dataset.h; M.sh = 'act'; delete D.files[M.act]; filesLoad(M.act); haptic('tap'); draw(); return true;
    case 'tdel': M.act = x.dataset.h; M.sh = 'del'; haptic('tap'); draw(); return true;
    case 'tdelgo': { const tt = (D.tor ?? []).find((y) => y.hash === M.act), wf = x.dataset.files === '1'; M.sh = null; haptic('err'); try { navigator.vibrate?.([10, 40, 10]); } catch {} try { await mApi(`/torrents/${encodeURIComponent(M.act)}${wf ? '?files=true' : ''}`, { method: 'DELETE' }); D.tor = (D.tor ?? []).filter((y) => y.hash !== M.act); flash(wf ? `Slettet ${tt?.nm ?? ''} med filene · ${gbT(tt?.gb)} frigjort` : 'Slettet fra qBittorrent · filene er beholdt'); } catch (err) { flash(errText(err)); } await loadTor(true); draw(); return true; }
    case 'top': { const op = x.dataset.op, tt = (D.tor ?? []).find((y) => y.hash === M.act); if (!tt) return true;
      if (op === 'tog') { tt.pz = !tt.pz; await torOp(tt.hash, tt.pz ? 'pause' : 'resume'); return true; }
      if (op === 'forceStart') { flash(tt.st === 'stall' ? 'Tvunget start · venter fortsatt på seedere' : `Tvunget start: ${tt.nm}`); await torOp(tt.hash, 'forceStart'); return true; }
      if (op === 'recheck') { flash('Sjekker filene på nytt …'); await torOp(tt.hash, 'recheck'); return true; }
      flash({ up: 'Flyttet opp i køen', down: 'Flyttet ned i køen', top: 'Øverst i køen', bottom: 'Nederst i køen' }[op]); await torOp(tt.hash, 'priority', { dir: op }); return true; }
    case 'file': { const F = D.files[M.act]; const f = F?.list?.[+x.dataset.i]; if (!f) return true; f.on = !f.on; haptic('tap'); draw(); try { await mApi(`/torrents/${encodeURIComponent(M.act)}/files`, { method: 'POST', json: { files: [{ index: f.i, priority: f.on ? 1 : 0 }] } }); } catch (err) { f.on = !f.on; flash(errText(err)); draw(); } return true; }
    case 'mag': M.mag = { q: '', cat: '', paused: false, seq: false, fl: false, err: '', busy: false }; M.sh = 'mag'; haptic('tap'); draw(); setTimeout(() => document.getElementById('p43-mq')?.focus(), 80); return true;
    case 'paste': try { const v = await navigator.clipboard.readText(); M.mag.q = String(v ?? '').trim(); M.mag.err = ''; draw(); } catch { flash('Fikk ikke lest utklippstavlen · lim inn selv'); } return true;
    case 'mcat': M.mag.cat = k; draw(); return true;
    case 'mtog': M.mag[k] = !M.mag[k]; draw(); return true;
    case 'magadd': await magAdd(); return true;
    case 'testall': (D.idx ?? []).forEach((ix, i) => setTimeout(() => testIdx(ix.id), i * 140)); haptic('tap'); return true;
    case 'itest': haptic('tap'); await testIdx(x.dataset.id); return true;
    case 'sync': { haptic('tap'); const id = x.dataset.id; try { if (id) await mApi(`/apps/${encodeURIComponent(id)}/sync`, { method: 'POST', json: {} }); else await mApi('/command', { method: 'POST', json: { name: 'ApplicationIndexerSync' } }); flash(`${x.dataset.n} er synket med Prowlarr`); } catch (err) { flash(errText(err)); } return true; }
    case 'idxadd': M.ia = { q: '', typ: 'all', pick: null, user: '', pw: '', key: '', pri: 25, son: true, rad: true, err: '', busy: false }; M.sh = 'idx'; haptic('tap'); draw();
      if (!D.schema) load('schema', async () => { const r = await mApi('/indexers/schema'); D.schema = arr(r, 'items', 'schema').sort((p, q) => String(p.name).localeCompare(String(q.name), 'nb')); }, true).then(draw); else load('schema', async () => { const r = await mApi('/indexers/schema'); D.schema = arr(r, 'items', 'schema').sort((p, q) => String(p.name).localeCompare(String(q.name), 'nb')); }, false, 300000).then(draw);
      return true;
    case 'ityp': M.ia.typ = k; draw(); return true;
    case 'ipick': M.ia.pick = x.dataset.n; M.ia.err = ''; haptic('tap'); draw(); return true;
    case 'ipri': M.ia.pri = +k; draw(); return true;
    case 'itog': M.ia[k] = !M.ia[k]; draw(); return true;
    case 'iback': Object.assign(M.ia, { pick: null, user: '', pw: '', key: '', err: '' }); draw(); return true;
    case 'isave': await idxSave(); return true;
    case 'stog': M.setLocal = true; M.set[k] = !M.set[k]; lsPut({ set: M.set }); draw(); mApi('/settings', { method: 'PUT', json: { notifyDone: M.set.nDone, notifyFail: M.set.nFail, calendar: M.set.cal, player: M.set.player.toLowerCase() } }).catch(() => {}); return true;
    case 'player': M.setLocal = true; M.set.player = k; lsPut({ set: M.set }); draw(); mApi('/settings', { method: 'PUT', json: { player: k.toLowerCase() } }).catch(() => {}); return true;
    default: return false;
  }
}
async function magAdd() {
  const g = M.mag, pr = parseMag(g.q);
  if (!g.q.trim()) { g.err = 'Lim inn en magnet-lenke eller en .torrent-adresse.'; draw(); return; }
  if (!pr.ok) { g.err = pr.err; haptic('err'); draw(); return; }
  if ((D.tor ?? []).some((t) => String(t.hash).toLowerCase() === pr.hash)) { g.err = 'Denne torrenten ligger allerede i qBittorrent.'; haptic('err'); draw(); return; }
  g.busy = true; draw();
  try {
    await mApi('/torrents/magnet', { method: 'POST', json: { url: g.q.trim(), category: g.cat || undefined, paused: g.paused, sequential: g.seq, firstLast: g.fl } });
    haptic('ok'); flash(`Lagt til i qBittorrent${g.cat ? ` · ${g.cat}` : ''} · henter metadata …`);
    M.sh = null; M.mag = null; M.seg = 'all'; M.tab = 'qb';
    (D.tor ??= []).push(nTor({ hash: pr.hash, name: pr.name, state: 'metaDL', size: 0, progress: 0, paused: g.paused }));
    draw(); setTimeout(() => loadTor(true).then(draw), 1500);
  } catch (e) { g.busy = false; g.err = e.status === 409 ? 'Denne torrenten ligger allerede i qBittorrent.' : errText(e); haptic('err'); draw(); }
}
async function idxSave() {
  const a = M.ia; if (a.busy) return;
  const x = (D.schema ?? []).find((y) => y.name === a.pick) ?? { name: a.pick }, au = authOf(x);
  if (au === 'user' && (!a.user.trim() || !a.pw)) { a.err = 'Skriv inn brukernavn og passord.'; draw(); return; }
  if ((au === 'key' || au === 'cookie') && a.key.trim().length < 8) { a.err = au === 'cookie' ? 'Cookien ser for kort ut.' : 'API-nøkkelen ser for kort ut.'; draw(); return; }
  a.busy = true; a.err = ''; draw();
  const t0 = performance.now();
  try {
    const fields = { ...(au === 'user' ? { username: a.user.trim(), password: a.pw } : {}), ...(au === 'key' ? { apiKey: a.key.trim() } : {}), ...(au === 'cookie' ? { cookie: a.key.trim() } : {}) };
    const r = await mApi('/indexers', { method: 'POST', json: { key: x.key ?? x.definitionName ?? x.name, name: x.name, priority: a.pri, fields, sonarr: a.son, radarr: a.rad } });
    if (r?.ok === false) throw Object.assign(new Error(r.error ?? r.message ?? 'Testen feilet'), { status: 400 });
    const ms = r?.ms ?? Math.round(performance.now() - t0), apps = [a.son && 'Sonarr', a.rad && 'Radarr'].filter(Boolean);
    haptic('ok'); flash(r?.message ?? `${x.name} lagt til · svarte på ${ms} ms${apps.length ? ` · synket til ${apps.join(' og ')}` : ''}`);
    M.sh = null; M.ia = null; await loadIdx(true);
  } catch (e) { a.busy = false; a.err = e.status === 404 ? 'Krever en nyere Homelab-server' : e.message; haptic('err'); }
  draw();
}
export function input43m(e, t) {
  if (m.screen !== 'media') return false;
  if (t.id === 'p43-gq') { M.gq = t.value; return true; }
  const k = t.dataset?.p43mi; if (!k) return false;
  if (k === 'mq') { M.mag.q = t.value; M.mag.err = ''; const pr = parseMag(t.value); const box = t.parentElement.querySelector('.p43-mok'); if (!!pr.ok !== !!box) draw(); else if (box && pr.ok) box.querySelector('b').textContent = `✓ ${pr.name}`; return true; }
  if (k === 'iq') { M.ia.q = t.value; draw(); return true; }
  if (k === 'lq') { M.lq[t.dataset.k] = t.value; draw(); return true; } // prompt 44: søk i biblioteket
  if (k === 'iuser') { M.ia.user = t.value; return true; }
  if (k === 'ipw') { M.ia.pw = t.value; return true; }
  if (k === 'ikey') { M.ia.key = t.value; return true; }
  return false;
}
export async function submit43m(e, t) {
  if (m.screen !== 'media') return false;
  const f = t.dataset?.p43mf; if (!f) return false;
  e.preventDefault();
  if (f === 'gl') { const q = t.q.value; t.q.blur(); await glimt(q); return true; }
  if (f === 'lookup') { const q = t.q.value.trim(); if (q) await lookup(q); return true; }
  return false;
}
/** Hjem-widget og Widgets-siden: data til «MEDIA · LASTES NED / KOMMER» (GET /api/widgets/media, med reserve fra /api/media). */
export const MW = { d: null, t: 0, err: '' };
export async function widgetLoad(force = false) {
  if (!force && Date.now() - MW.t < 60000) return;
  MW.t = Date.now();
  try {
    let r; try { r = await hlApi('/widgets/media'); } catch (e0) { if (e0.status !== 404) throw e0; r = await mApi('/widget'); }
    MW.d = { tor: arr(r, 'downloads', 'active', 'torrents').map(nTor), upc: arr(r, 'upcoming', 'next').map(nUpc), speed: r?.speed ?? r?.dl_info_speed ?? null, hide: r?.hide === true, tab: r?.tab === 'kom' ? 'kom' : 'qb' };
  } catch (e) {
    if (e.status !== 404) { MW.err = e.message; return; }
    try { await Promise.all([loadTor(), loadUpc()]); MW.d = { tor: D.tor ?? [], upc: D.upc ?? [], speed: D.xfer?.dl_info_speed ?? null }; } catch {}
  }
}
/** Trykk fra widgeten: qBittorrent-fanen når noe lastes ned, ellers Kommer snart. */
export function openFrom(tab, hash) { M.tab = tab; M.det = null; M.srch = null; if (location.hash !== '#/media') location.hash = '#/media'; if (hash) setTimeout(() => document.getElementById(`p43-t-${hash}`)?.scrollIntoView({ block: 'center' }), 400); }
export const torRows = (L) => L.map(torRow);
export { stv, poster, gbT, code, mbT };

export function boot43m() {
  let was = m.screen;
  addEventListener('hashchange', () => setTimeout(() => { if (m.screen === 'media' && was !== 'media') M.enterAt = Date.now(); was = m.screen; }, 0));
  // Oppdater hvert 2. sekund på qBittorrent-fanen, ellers hvert 30. sekund mens Media er åpen.
  let last = 0;
  setInterval(() => {
    if (m.screen !== 'media' || document.hidden || M.sh === 'act' || M.sh === 'mag') return;
    const now = Date.now(), qb = M.tab === 'qb' || M.tab === 'kom';
    if (M.tab === 'qb' && now - last >= 2000) { last = now; loadTor(true).then(() => { if (m.screen === 'media' && !document.activeElement?.matches?.('input,textarea')) draw(); }); }
    else if (!qb && now - last >= 30000) { last = now; reload(true); }
    else if (M.tab === 'kom' && now - last >= 30000) { last = now; reload(true); }
  }, 1000);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.screen === 'media' && M.sh) { M.sh = null; draw(); } });
  // Media som mottaker av magnet-lenker (web: registerProtocolHandler). #/media?magnet=… åpner arket ferdig utfylt.
  try { if (navigator.registerProtocolHandler && !localStorage.getItem('p43_magreg')) { navigator.registerProtocolHandler('magnet', `${location.origin}/finans/#/media?magnet=%s`); localStorage.setItem('p43_magreg', '1'); } } catch {}
  // mobile.js route() fjerner ?-delen og legger lenken i globalThis.__p43mag.
  const takeMag = () => { const q = globalThis.__p43mag; if (!q) return; globalThis.__p43mag = null; M.tab = 'qb'; M.det = null; M.srch = null; M.mag = { q, cat: '', paused: false, seq: false, fl: false, err: '', busy: false }; M.sh = 'mag'; if (location.hash !== '#/media') location.hash = '#/media'; draw(); };
  addEventListener('hashchange', () => setTimeout(takeMag, 0)); takeMag();
}
