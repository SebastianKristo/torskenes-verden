// Prompt 43 (claude-code-media-arr.md): Media på web – Sonarr, Radarr, qBittorrent og Prowlarr. Fasit: design/Media.dc.html
// (2a, variant web): pille-faner i topplinja (Kommer snart · Sonarr · Radarr · qBittorrent · Prowlarr), Glimt-felt, ⚙ og ×,
// alt i full bredde med 32 px marg. Egen fullskjerm-side (#/media) som Vær og Chat; × går tilbake til Dashboard.
// Alt går via serveren (SERVER43, server/media43.js): /api/media/* er en proxy, tjenestenøklene sendes aldri hit.
// Svarformene står ved hver rute i server/media43.js. 404 (eldre server) og «ikke satt opp» gir tomtilstander, ingen feil.
import { esc } from './util.js';
import { orb43 } from './orb43.js';
import { mountPlayback } from './playback44.js'; // prompt 44: fanen Avspilling (Plex/Jellyfin)
import { glimtSource } from './glimt-input44.js'; // prompt 44: forslag i Glimt-feltet (Tab)
import { agent, agentOn, isPlain, agentFull } from './glimt-agent45.js'; // prompt 45
// Prompt 50: plakater med ThumbHash-plassholder + srcset, og sann status etter søk (sporing) i stedet for «Søker».
import { bg50, img50, prefetch50, setup50, onToast50, startTrack50, trackGrab50, trackHtml50, multiTrackHtml50, click50 } from './media50.js';
// Prompt 70 (MEDIA70): nytt design – Oversikt, Kalender, Bibliotek og Nedlastinger som egne adresser (media70.js).
import { init70, top70, ov70, kal70, bib70, ned70, act70, enter70, outside70, esc70, setBibSort70, resetSite70, state70 } from './media70.js';
// Prompt 44 (claude-code-media-arr.md, -interaktivt-sok-504.md, -avspilling-plex-jellyfin.md, web):
// søk i biblioteket, plakater i 2:3 (Kommer snart som liggende rader), Kommer snart Uke · Liste, banner med fanart i serie/film,
// last ned på nytt / slett fil, felles servervalg («Hjemme/Hytta», ?server= på alle kall), frem/tilbake i nettleseren
// (#/media/sonarr/s/<id>/sok …), fanen Avspilling, og interaktivt søk som jobb med status per indekser (cache 10 min).

if (!document.querySelector('link[data-m43-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media43.css'; l.dataset.m43Css = ''; document.head.appendChild(l);
}
if (!document.querySelector('link[data-m70-css]')) { // prompt 70: nytt design (lastes etter media43.css så det vinner)
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media70.css'; l.dataset.m70Css = ''; document.head.appendChild(l);
}
if (!document.querySelector('link[data-m70-fonts]')) {
  const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.m70Fonts = '';
  f.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
  document.head.appendChild(f);
}
if (!document.querySelector('link[data-hl-fonts],link[data-m43-fonts]')) {
  const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.m43Fonts = '';
  f.href = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap';
  document.head.appendChild(f);
}

const lsg = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, lss = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };
const M = {
  tab: 'ov', bibK: 's', det: null, srch: null, libF: 'all', seg: 'all', fq: 'all', open: {}, grab: {}, busy: {}, toast: '', sh: null,
  add: null, act: null, edit: null, mag: null, ix: null, gq: '', gl: null, missing: false, restricted: '',
  up: null, ser: null, mov: null, tor: null, idx: null, disk: null, prof: null, status: null, prefs: null, access: null, detail: null, rel: null, files: null, idxT: {},
  err: {},
  libQ: '', komv: lsg('media_komv', 'uke') === 'liste' ? 'liste' : 'uke', site: lsg('media_site', '') || null, servers: null, srvOpen: false, job: null, undo: null,
};
const relCache = new Map(); // prompt 44: interaktivt søk caches i 10 min per episode/film
let root = null, pollT = 0, toastT = 0, magT = 0, lookT = 0, schT = 0, wasNarrow = null;
setup50((path, opt) => mapi(path, opt), () => paintMain()); onToast50((m) => toast(m)); // prompt 50
const narrow = () => innerWidth < 900;

/* ---------------- Data ---------------- */

async function mapi(path, { method = 'GET', json, quiet } = {}) {
  // Prompt 44: felles servervalg – ?server=<id> på alle Media-kall (ikke på selve serverlista).
  if (M.site && !/^\/servers(\/|\?|$)/.test(path)) path += `${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(M.site)}`;
  const r = await fetch(`/api/media${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: json !== undefined ? { 'Content-Type': 'application/json' } : {}, body: json !== undefined ? JSON.stringify(json) : undefined });
  if (r.status === 401) { location.href = '/login'; throw new Error('Logg inn på nytt'); }
  const j = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (r.status === 404 && /^(\/status|\/upcoming)/.test(path) && !j.error) M.missing = true;
  if (r.status === 403 && j.restricted && method === 'GET') M.restricted = j.error || 'Du har ikke tilgang til Media.';
  if (!r.ok) { const e = new Error(j.error || (r.status === 404 ? 'Serveren har ikke Media ennå.' : `Feil ${r.status}`)); e.status = r.status; e.body = j; if (!quiet) throw e; throw e; }
  return j;
}
const get = async (key, path, after) => {
  try { M[key] = await mapi(path); M.err[key] = ''; } catch (e) { M.err[key] = e.message; if (M[key] == null) M[key] = { error: e.message, status: e.status }; }
  after?.(); paint();
};
const loadUp = () => get('up', '/upcoming?days=7');
const loadSer = () => get('ser', '/series');
const loadMov = () => get('mov', '/movies');
const loadTor = () => get('tor', `/torrents?filter=all`);
const loadIdx = () => get('idx', '/indexers');
const loadDisk = () => get('disk', '/rootfolders');
const loadProf = () => (M.prof && !M.prof.error ? Promise.resolve() : get('prof', '/qualityprofiles'));
const loadStatus = () => get('status', '/status', () => { if (M.status?.settings) M.prefs = M.status.settings; });
function loadServers() {
  if (M.servers) return;
  M.servers = [];
  fetch('/api/media/servers?status=1', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const L = Array.isArray(j) ? j : j?.servers ?? j?.items ?? null;
    if (!Array.isArray(L)) return;
    M.servers = L.filter((x) => x && x.id != null);
    const sel = M.servers.find((x) => x.selected); if (sel) M.site = String(sel.id);
    if (!M.site || !M.servers.some((x) => String(x.id) === String(M.site))) { const d = M.servers.find((x) => x.default) ?? M.servers[0]; M.site = d ? String(d.id) : null; }
    paintTop();
  }).catch(() => {});
}
function enterTab() {
  if (M.missing || M.restricted) return;
  loadServers();
  // Prompt 70: Oversikt trenger litt av alt; Nedlastinger viser også lagring (serier/filmer) og kilder (Prowlarr).
  if (M.tab === 'ov') { loadUp(); loadTor(); loadIdx(); if (!M.ser) loadSer(); if (!M.mov) loadMov(); }
  if (M.tab === 'bib' && !M.det && !M.srch) { if (M.bibK === 'm') { loadMov(); if (!M.ser) loadSer(); } else { loadSer(); if (!M.mov) loadMov(); } if (!M.up) loadUp(); }
  if (M.tab === 'ned') { loadTor(); loadDisk(); loadIdx(); if (!M.up) loadUp(); if (!M.ser) loadSer(); if (!M.mov) loadMov(); }
  if (!M.det && !M.srch) enter70(M.tab);
}
async function loadDetail() {
  const d = M.det; if (!d) return;
  M.detail = null; paint();
  try { M.detail = await mapi(d.k === 's' ? `/series/${d.id}` : `/movies/${d.id}`); } catch (e) { M.detail = { error: e.message }; }
  paint();
}
// Prompt 44 (claude-code-media-interaktivt-sok-504.md): søket kjøres som jobb på serveren. POST /release/search → {jobId},
// så status per indekser (SSE …/events, ellers GET …/:jobId hvert 1,5 s) med delvise treff. Eldre server: GET /release med
// ett nytt forsøk ved 502/503/504 etter 2 s. Resultatet caches i 10 min per episode/film («Hentet for 2 min siden · Søk igjen»).
const relKey = (s) => (s.k === 'm' ? `m:${s.id}` : s.episodeId ? `e:${s.episodeId}` : `s:${s.id}:${s.season}`);
async function loadRel(force = false) {
  const s = M.srch; if (!s) return;
  const key = `${M.site ?? ''}|${relKey(s)}`, c = relCache.get(key);
  if (!force && c && Date.now() - c.at < 10 * 60_000) { M.rel = { ...c.data, cachedAt: c.at }; M.job = null; return paint(); }
  M.rel = null; M.job?.es?.close?.(); M.job = { t0: Date.now(), state: 'start', indexers: [], items: [] }; paint();
  const body = s.k === 'm' ? { movieId: s.id } : s.episodeId ? { episodeId: s.episodeId } : { seriesId: s.id, seasonNumber: s.season };
  if (s.re) body.redownload = true;
  if (force) body.force = true;
  let jobId = null;
  try { const r = await mapi('/release/search', { method: 'POST', json: body }); jobId = r.jobId ?? r.id ?? null; if (!jobId && r.items) { done(r); return; } if (jobId && r.cached) { try { const j0 = await mapi(`/release/search/${encodeURIComponent(jobId)}`); if (j0?.state === 'done' && j0.result) { done({ ...j0.result, indexers: j0.indexers }); return; } } catch { /* vanlig flyt */ } } }
  catch (e) { if (e.status !== 404 && e.status !== 405) { M.job = null; M.rel = { error: e.message }; return paint(); } }
  if (!jobId) return legacy();
  const job = M.job; job.id = jobId;
  const apply = (j) => {
    if (M.job !== job) return;
    job.indexers = (j.indexers ?? job.indexers).map(ixN); job.state = j.state ?? job.state;
    if (Array.isArray(j.partial) && j.partial.length) job.items = j.partial; else if (Array.isArray(j.items) || Array.isArray(j.releases)) job.items = j.items ?? j.releases;
    if (j.context) job.context = j.context;
    if (j.state === 'done' || j.done) return done(j.result ? { ...j.result, indexers: j.indexers } : j);
    if (j.state === 'failed' || j.state === 'error') { M.job = null; M.rel = { error: j.error || 'Søket feilet.', allFailed: true }; return paint(); }
    paintMain();
  };
  const ixN = (x) => ({ ...x, state: x.state === 'done' ? 'ok' : x.state === 'failed' ? 'fail' : x.state === 'running' || x.state === 'pending' || x.state === 'start' ? 'run' : x.state });
  const poll = async () => { while (M.job === job) { await new Promise((ok) => setTimeout(ok, 1500)); if (M.job !== job) return; try { apply(await mapi(`/release/search/${encodeURIComponent(jobId)}`)); } catch (e) { if (e.status === 404) { M.job = null; return legacy(); } } } };
  try {
    const es = new EventSource(`/api/media/release/search/${encodeURIComponent(jobId)}/events${M.site ? `?server=${encodeURIComponent(M.site)}` : ''}`, { withCredentials: true });
    job.es = es; let got = false;
    const on = (ev) => { got = true; let j; try { j = JSON.parse(ev.data); } catch { return; } const t = ev.type;
      if (t === 'indexer.start' || t === 'indexer.done' || t === 'indexer.fail') { const L = job.indexers.filter((x) => x.name !== j.name); job.indexers = [...L, { ...j, state: t === 'indexer.start' ? 'run' : t === 'indexer.done' ? 'ok' : 'fail' }]; if (Array.isArray(j.items)) job.items = [...job.items, ...j.items]; paintMain(); return; }
      if (t === 'done') { es.close(); return done(j.result ? { ...j.result, indexers: job.indexers } : { ...j, items: j.items ?? j.releases }); }
      if (t === 'failed') { es.close(); if (M.job !== job) return; M.job = null; M.rel = { error: j.error || 'Søket feilet.', allFailed: !!j.allFailed }; return paint(); }
      if (t === 'partial') { if (Array.isArray(j.items)) job.items = j.items; job.partialCount = j.count; paintMain(); return; }
      apply(j); };
    ['message', 'snapshot', 'status', 'partial', 'failed', 'indexer.start', 'indexer.done', 'indexer.fail', 'done'].forEach((t) => es.addEventListener(t, on));
    es.onerror = () => { es.close(); if (!got && M.job === job) poll(); };
  } catch { poll(); }
  function done(j) {
    const d = { ...j, items: j.items ?? j.releases ?? [], indexers: (j.indexers ?? job?.indexers ?? []).map((x) => ({ ...x, state: x.state === 'done' ? 'ok' : x.state === 'failed' ? 'fail' : x.state })) };
    const fails = d.indexers.filter((x) => x.state === 'fail' || x.error), all = d.indexers.length && fails.length === d.indexers.length && !d.items.length;
    if (all) { M.job = null; M.rel = { error: 'Ingen indeksere svarte. Sjekk Prowlarr → Helse.', allFailed: true }; return paint(); }
    relCache.set(key, { at: Date.now(), data: d }); M.job = null; M.rel = d; paint();
  }
  async function legacy() {
    M.job = { t0: Date.now(), state: 'legacy', indexers: [], items: [] }; paintMain();
    const q = s.k === 'm' ? `movieId=${s.id}` : s.episodeId ? `episodeId=${s.episodeId}` : `seriesId=${s.id}&seasonNumber=${s.season}`;
    for (let i = 0; i < 2; i++) {
      try { const r = await mapi(`/release?${q}`); M.job = null; done(r); return; }
      catch (e) { if (i === 0 && [502, 503, 504].includes(e.status)) { await new Promise((ok) => setTimeout(ok, 2000)); continue; } M.job = null; M.rel = { error: e.status === 504 ? 'Indekserne brukte for lang tid (504). Prøv igjen.' : e.message }; return paint(); }
    }
  }
}
function poll() {
  clearTimeout(pollT);
  if (!root?.isConnected) return;
  const fast = M.tab === 'ned' && !M.det && !M.srch && !document.hidden;
  pollT = setTimeout(async () => {
    if (!root?.isConnected) return;
    if (!document.hidden && !M.missing && !M.restricted && !M.det && !M.srch) {
      if (M.tab === 'ned' || M.tab === 'ov') { try { M.tor = await mapi('/torrents?filter=all'); } catch { /* beholder forrige */ } if (M.tab === 'ov') { try { M.up = await mapi('/upcoming?days=7'); } catch { /* */ } enter70('ov', true); } paintMain(); paintTop(); }
      if (M.tab === 'kal') enter70('kal', true);
    }
    poll();
  }, fast ? 2000 : 30_000);
}

/* ---------------- Hjelpere ---------------- */

// Prompt 45 (claude-code-media-mer-farger.md): Lastes ned blå, Venter gul, Ferdig grønn, Mangler rød, Uovervåket grå.
const SC = { ok: 'ok', dl: 'dl', miss: 'bad', stall: 'warn', pause: 'mut', wait: 'wait', ann: 'wait', off: 'mut', seed: 'ok', meta: 'mut', queued: 'wait', check: 'mut', error: 'bad' };
const tone = (st) => `t-${SC[st] ?? 'mut'}`;
/** Prompt 45 (claude-code-media-tilbakeknapp.md): samme tilbakeknapp som resten av systemet – rund 40 px glassknapp med ‹, og hvor den går som tekst ved siden av. */
const backBtn45 = (a, label) => `<div class="m45-bk"><button type="button" class="m45-back" data-m43="${a}" aria-label="Tilbake til ${esc(label)}" title="Tilbake (Esc)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><span class="m45-bkl">${esc(label)}</span></div>`;
const isAdm45 = () => !!M.status?.admin;
/** Prompt 44: plakat alltid i 2:3 (aspect-ratio), med statusprikk. */
// Prompt 50: plassholder fra ThumbHash med én gang, <img srcset> for riktig bredde (sizes = bredden i CSS-px).
const poster = (x, cls, sizes = '64px', high = false) => `<span class="${cls} m50-ph" style="${bg50(x)}">${img50(x, { sizes, high })}<span class="m43-dot ${tone(x?.status)}"></span></span>`;
const norm44 = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9æøå]+/g, '');
const art = (x, cls = 'm43-art') => `<div class="${cls} m50-ph" style="${bg50(x)}">${img50(x, { sizes: /\b(dp)\b/.test(cls) ? '150px' : /\bsp\b/.test(cls) ? '72px' : '52px' })}</div>`;
const pill = (on) => (on ? ' on' : '');
const chip = (n, on, attr) => `<button type="button" class="m43-chip${pill(on)}" ${attr}>${esc(n)}</button>`;
const sw = (on) => `<span class="m43-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const ic = {
  set: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  dl: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
  trash: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4"/></svg>',
  list: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  mark: (on, n = 18) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`,
  re: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  magnet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v7a6 6 0 0 0 12 0V4M6 4h4v7a2 2 0 0 0 4 0V4h4M6 8h4M14 8h4"/></svg>',
};
function toast(t) { clearTimeout(toastT); M.toast = t; paintToast(); toastT = setTimeout(() => { M.toast = ''; paintToast(); }, 3600); }
const nb = (n) => (+n || 0).toLocaleString('nb-NO');
const confOff = (d) => d && d.configured === false;
const emptySvc = (d, name) => `<div class="m43-empty"><b>${esc(name)} er ikke satt opp</b><span>${esc(d?.message || `Legg inn adresse og nøkkel under Innstillinger → Integrasjoner → Media.`)}</span><button type="button" class="m43-btn line" data-m43="integ">Åpne Integrasjoner</button></div>`;
const errBox = (e) => `<div class="m43-empty err"><b>Fikk ikke hentet data</b><span>${esc(e)}</span><button type="button" class="m43-btn line" data-m43="retry">Prøv igjen</button></div>`;
const skel = (h = 220) => `<div class="m43-skel" style="min-height:${h}px"></div>`;

// Prompt 70: de nye sidene (media70.js) får tilstanden, datakallene og hjelperne herfra.
init70({ M, mapi, paint: () => paint(), paintMain: () => paintMain(), paintTop: () => paintTop(), toast: (t) => toast(t), cmd: (b, k, m) => cmd(b, k, m), openDet: (k, id) => openDet(k, id), nav: (r) => nav(r), go: (t) => goTab(t), search: (x) => search70(x),
  loadTor, loadUp, loadSer, loadMov, loadIdx, isAdm: () => isAdm45(), errBox, emptySvc, confOff, norm44, prefetch50, ic });

/* ---------------- Topplinja og Glimt ---------------- */

function topHtml() { return top70(srvHtml(), orb43(24, M.gl?.busy ? 'busy' : '')); } // prompt 70
/* Prompt 44: felles servervalg (Hjemme/Hytta) ved fanene for Sonarr, Radarr, qBittorrent og Prowlarr. */
const SVC = { son: ['sonarr', 'Sonarr'], rad: ['radarr', 'Radarr'], qb: ['qbit', 'qBittorrent'], pro: ['prowlarr', 'Prowlarr'] };
function srvHtml() {
  // Prompt 70: velgeren står alltid i topplinja ved varselknappen og gjelder alle tjenestene.
  const L = M.servers, sv = SVC[M.tab] ?? ['sonarr', 'Server'];
  if (!L?.length) return '';
  const cur = L.find((x) => String(x.id) === String(M.site)) ?? L[0];
  const st = (x) => { const c = x?.[sv[0]] ?? x?.[sv[0] === 'qbit' ? 'qbittorrent' : sv[0]]; const v0 = typeof c === 'object' && c ? c : {}, v = { ...v0, ...(typeof v0.status === 'object' && v0.status ? v0.status : {}) }; if (v0.configured === false) return { url: '', t: 'Ikke satt opp', c: 'mut' }; const ms = +v.ms || 0; const ok = v.ok ?? v.connected ?? (typeof v0.status === 'string' ? v0.status === 'ok' : null); return { url: v.url ?? '', t: ok === false ? 'Svarer ikke' : ms > 1500 ? `Treg · ${(ms / 1000).toFixed(1).replace('.', ',')} s` : ok ? 'Tilkoblet' : c ? 'Ukjent' : 'Ikke satt opp', c: ok === false || !c ? 'bad' : ms > 1500 ? 'warn' : ok ? 'ok' : 'mut' }; };
  const s0 = st(cur);
  return `<div class="m44-srv"><button type="button" class="m44-sb" data-m44="srv" aria-expanded="${M.srvOpen}" aria-haspopup="menu"><span class="m43-dot t-${s0.c}"></span>${esc(cur.name ?? cur.id)} <span aria-hidden="true">▾</span></button>${M.srvOpen ? `<div class="m44-sm" role="menu"><span class="m43-lab">VELG SERVER · GJELDER SONARR, RADARR, QBITTORRENT OG PROWLARR</span>${L.map((x) => { const t = st(x), on = String(x.id) === String(cur.id); return `<button type="button" role="menuitemradio" aria-checked="${on}" class="m44-si${on ? ' on' : ''}" data-m44-site="${esc(x.id)}"><span class="m43-dot t-${t.c}"></span><span class="m43-col grow mw0"><b>${esc(x.name ?? x.id)}</b><span class="mono m43-sm t-mut ell">${esc(t.url || '–')}</span></span><span class="m43-sm t-${t.c}">${esc(t.t)}</span><b class="acc">${on ? '✓' : ''}</b></button>`; }).join('')}<button type="button" class="m44-sadd" data-m43="integ">+ Legg til server</button></div>` : ''}</div>`;
}
function glHtml() {
  const g = M.gl; if (!g) return '';
  const r = g.res;
  const steps = (r?.steps ?? []).map((s) => `<div class="m43-gs${s.ok === false ? ' bad' : ''}"><span>${s.ok === false ? '✕' : '✓'} ${esc(s.t)}</span><span class="mono">${nb(s.ms)} ms</span></div>`).join('');
  let body = '';
  if (g.err) body = `<b class="m43-gtx t-bad">${esc(g.err)}</b>`;
  else if (r) {
    const list = (r.results ?? []).filter((x) => x.kind === 'release');
    if (list.length) {
      body = `<b class="m43-gtx">${esc(r.text)}</b><div class="m43-glist">${list.map((x, i) => { const rl = x.release ?? {}, k = `gl:${rl.guid}`, done = !!M.grab[k]; return `<div class="m43-gli"><div class="m43-col grow"><div class="m43-row xwrap"><b class="mono">${esc(x.code)}</b><span class="${x.has ? 't-mut' : 't-warn'}">${esc(`${x.episodeTitle ?? ''} · ${x.hasText ?? (x.has ? 'har den' : 'mangler')}`)}</span></div><span class="m43-rel">${esc(rl.shortTitle ?? rl.title ?? '')}</span>
        <div class="m43-row xwrap"><span class="m43-q">${esc(rl.quality ?? '')}</span><b class="t-ok">${esc(rl.sizeText ?? '')}</b><b>▲ ${nb(rl.seeders)} / ${nb(rl.leechers)}</b><span class="t-mut">${esc(rl.indexer ?? '')}</span></div></div>
        <button type="button" class="m43-grab${done ? ' done' : ''}" data-m43-glgrab="${i}" aria-label="Last ned"${done ? ' disabled' : ''}>${done ? '✓' : ic.dl}</button></div>`; }).join('')}</div>`;
    } else if ((r.results ?? []).length && (r.kind === 'add' || r.kind === 'exists')) {
      const h = r.results[0], acts = r.actions ?? [], go = acts.find((a) => a.type === 'add' || a.type === 'open');
      const line = h.exists ? `Finnes allerede i ${h.kind === 'series' ? 'Sonarr' : 'Radarr'}` : [h.profile, h.kind === 'series' ? h.monitorLabel : h.availabilityLabel].filter(Boolean).join(' · ');
      body = `<b class="m43-gtx">${esc(r.text)}</b><div class="m43-row xwrap m43-ghit">${art(h, 'm43-art sm')}<div class="m43-col grow"><b class="m43-st">${esc(h.title)}</b><span class="t-mut">${esc([h.kind === 'series' ? 'Serie' : 'Film', h.year, h.network].filter(Boolean).join(' · '))}</span><b>${esc(line)}</b></div>
        <div class="m43-row">${go ? `<button type="button" class="m43-btn ink" data-m43-glact="${acts.indexOf(go)}">${esc(go.label ?? (go.type === 'open' ? 'Åpne' : 'Legg til'))}</button>` : ''}${acts.some((a) => a.type === 'edit') ? `<button type="button" class="m43-btn line" data-m43-glact="${acts.findIndex((a) => a.type === 'edit')}">Endre</button>` : ''}</div></div>`;
    } else {
      const acts = (r.actions ?? []).filter((a) => a.type === 'pauseAll' || a.type === 'resumeAll');
      body = `<b class="m43-gtx">${esc(r.text ?? '')}</b>${acts.length ? `<div class="m43-row">${acts.map((a) => `<button type="button" class="m43-btn line" data-m43-glact="${(r.actions ?? []).indexOf(a)}">${esc(a.label)}</button>`).join('')}</div>` : ''}`;
    }
  }
  return `<div class="m43-glp"><div class="m43-card m43-glc"><div class="m43-row sb"><span class="m43-lab acc ell">✦ GLIMT · «${esc(g.q)}»</span><button type="button" class="m43-ib ghost" data-m43="glclose" aria-label="Lukk Glimt">${ic.x}</button></div>
    <div class="m43-col g3">${steps}${g.busy ? '<span class="t-mut m43-gs">Tenker …</span>' : ''}</div>${body}</div></div>`;
}
async function glimt(q) {
  q = q.trim(); if (!q) return;
  M.gl = { q, busy: true, res: null }; paint();
  // Prompt 45: den felles Glimt-agenten (module media) først. Ren prat eller eldre server → Media-Glimt som før.
  try {
    const a = agentOn() ? await agent(q, 'media') : null;
    if (a && !isPlain(a)) { if (M.gl) { M.gl.busy = false; M.gl.res = { text: agentFull(a), actions: [] }; } if (a.done.length) { M.tor = null; loadTor(); } paint(); return; }
  } catch { /* faller tilbake */ }
  try { M.gl.res = await mapi('/glimt', { method: 'POST', json: { q } }); } catch (e) { M.gl.err = e.status === 404 ? 'Serveren har ikke Glimt for Media ennå.' : e.message; }
  if (M.gl) M.gl.busy = false;
  const k = M.gl?.res?.kind;
  if (k === 'pause' || k === 'resume') { M.tor = null; loadTor(); }
  paint();
}
async function glAct(i) {
  const a = M.gl?.res?.actions?.[i]; if (!a) return;
  if (a.type === 'open') { M.gl = null; M.gq = ''; return openDet(a.tab === 'radarr' ? 'm' : 's', a.id); }
  if (a.type === 'pauseAll' || a.type === 'resumeAll') return allToggle(a.type === 'pauseAll');
  if (a.type === 'edit') {
    const p = a.prefill ?? {}, h = M.gl.res.results?.[0] ?? {};
    M.sh = 'add'; M.add = { k: a.kind === 'movie' ? 'm' : 's', q: h.title ?? '', list: null, sel: { ...h, title: h.title }, prof: p.profile ?? h.profile, mon: p.monitor ?? 'all', typ: p.seriesType ?? 'standard', av: p.minimumAvailability ?? 'released', go: p.searchNow !== false };
    loadProf(); return paint();
  }
  if (a.type === 'add') {
    try { const r = await mapi(a.path.replace(/^\/api\/media/, ''), { method: a.method ?? 'POST', json: a.body }); toast(r.message ?? 'Lagt til'); M.gl = null; M.gq = ''; const x = r.series ?? r.movie; if (x?.id) return openDet(r.series ? 's' : 'm', x.id); }
    catch (e) { toast(e.message); }
    return paint();
  }
}

/* Prompt 70: Kommer snart, Sonarr, Radarr, qBittorrent og Prowlarr er erstattet av Oversikt, Kalender, Bibliotek og Nedlastinger (media70.js). */

/* ---------------- Serie- og filmside ---------------- */
/** Prompt 44: banner med fanart (uskarp), mørk gradient, plakat 2:3, tittel, ←/→ i biblioteket, fakta og info-brikker. */
function banner(d, x) {
  const s = d.k === 's', lib = (s ? M.ser : M.mov)?.items ?? [], i = lib.findIndex((y) => String(y.id) === String(x.id));
  const nav = lib.length > 1 && i >= 0 ? `<div class="m44-bn"><button type="button" class="m44-bnb" data-m44-step="-1" aria-label="Forrige i biblioteket">←</button><button type="button" class="m44-bnb" data-m44-step="1" aria-label="Neste i biblioteket">→</button></div>` : '';
  const genres = Array.isArray(x.genres) ? x.genres.slice(0, 2).join(', ') : x.genre ?? '';
  const yrs = s ? (x.year ? `${x.year}${x.status === 'ended' ? (x.endYear ? `–${x.endYear}` : '') : '–'}` : '') : x.year ?? '';
  const runtime = x.runtime ? `${x.runtime} min` : x.runtimeText ?? '';
  const aired = (x.seasons ?? []).reduce((a, se) => a + se.episodes.filter((e) => e.aired).length, 0), got = (x.seasons ?? []).reduce((a, se) => a + (se.have ?? 0), 0);
  const have = s ? (x.seasons ? (aired ? `${got} av ${aired} episoder · ${x.missingCount ? `${x.missingCount} mangler` : 'komplett'}` : 'Ikke sendt ennå') : x.episodesText ?? '') : x.hasFile ? `Lastet ned${x.file?.quality ? ` · ${x.file.quality}` : ''}` : x.statusText ?? '';
  const facts = [runtime, genres, yrs].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('<i>·</i>') + (have ? `<i>·</i><span class="${(s ? x.missingCount || !aired : !x.hasFile) ? 'warn' : 'ok'}">${esc(have)}</span>` : '');
  const chips = [['MAPPE', x.path], ['STR.', x.sizeText], ['PROFIL', x.profile, 'prof'], [null, x.monitored ? 'Overvåket' : 'Ikke overvåket', s ? 'mon' : 'mmon'], s ? [null, x.statusLabel ?? (x.status === 'ended' ? 'Avsluttet' : 'Fortsetter')] : null, ['SPRÅK', x.language ?? x.originalLanguage], [s ? 'KANAL' : 'STUDIO', s ? x.network : x.studio]].filter((c) => c && c[1]);
  const bg = x.fanart ? `background-image:url('${esc(x.fanart)}')` : x.poster ? `background-image:url('${esc(x.poster)}')` : '';
  return `<section class="m44-ban${x.fanart ? '' : ' nofan'}" style="--pc:${esc(x.color || '#3c4a5c')}"><div class="m44-bbg" style="${bg}"></div><div class="m44-bgr"></div>
    <div class="m44-bin">${poster(x, 'm44-bpo', '(max-width: 899px) 104px, 168px', true)}<div class="m43-col grow mw0 g8"><div class="m43-row sb xtop"><span class="m44-bk">${s ? 'SONARR · SERIE' : 'RADARR · FILM'}</span>${nav}</div><b class="m44-bt">${esc(x.title)}</b><div class="m44-bf">${facts}</div>
      <div class="m44-bc">${chips.map(([l, v, f]) => f ? `<button type="button" class="m44-gc" data-m43-edit="${f}">${l ? `<span>${esc(l)}</span>` : ''}<b>${esc(v)}</b></button>` : `<span class="m44-gc">${l ? `<span>${esc(l)}</span>` : ''}<b class="mono">${esc(v)}</b></span>`).join('')}</div></div></div>
    ${x.overview && !/^\S.*\(\d{4}\) ·/.test(x.overview) ? `<p class="m44-bo">${esc(x.overview)}</p>` : ''}<span class="m44-bm">Metadata fra ${s ? 'TheTVDB' : 'TMDb'}</span></section>`;
}

/** Antall episoder uten overvåking som har fil (seriedetaljen). */
const unmonN45 = (x) => (x?.seasons ?? []).reduce((a, se) => a + (se.episodes ?? []).filter((e) => e.hasFile && e.monitored === false).length, 0);
function detHtml() {
  const d = M.det, x = M.detail, back = backBtn45('detback', d.k === 's' ? 'Serier' : 'Filmer');
  if (!x) return back + skel(300);
  if (x.error) return back + errBox(x.error);
  const chips = (L) => `<div class="m43-row xwrap g8">${L.map(([l, v, f]) => `<button type="button" class="m43-dchip" data-m43-edit="${f}"><span class="m43-lab">${esc(l)}</span><b>${esc(v)} ›</b></button>`).join('')}</div>`;
  const head = banner(d, x) + `<div class="m43-dh2 m44-dh">${'<div class="m43-col grow g6">'}<span class="t-mut m43-15">${esc(x.subtitle ?? '')}</span>`;
  if (d.k === 'm') {
    const st = x.status === 'ann' ? x.note || 'Annonsert' : x.statusText;
    const file = x.file ? `${x.file.quality ?? ''} · ${x.file.sizeText ?? ''} · ${x.file.path ?? x.path ?? ''}` : `Ingen fil ennå · lagres i ${x.path ?? x.rootFolder ?? '/data/media/film'}`;
    const acts = [x.hasFile && x.play ? `<a class="m43-btn ink" href="${esc(x.play.url)}" target="_blank" rel="noopener">${esc(x.play.label)}</a>` : '', `<button type="button" class="m43-btn ${x.hasFile ? 'line' : 'ink'}" data-m43="mauto"${M.busy.mauto ? ' disabled' : ''}>${M.busy.mauto ? 'Søker …' : 'Automatisk søk'}</button>`, x.hasFile && x.monitored === false && isAdm45() ? '<button type="button" class="m43-btn line red-t" data-m45-unmon="movie">Slett fil (ikke overvåket)</button>' : '', x.hasFile ? '<button type="button" class="m43-btn line" data-m44="mre">⟳ Last ned på nytt</button>' : '<button type="button" class="m43-btn line" data-m43="minter">Interaktivt søk</button>', x.hasFile ? '<button type="button" class="m43-btn line red-t" data-m44="mdel">Slett fil</button>' : ''].join('');
    return `${back}${head}<b class="m43-s ${tone(x.status)} m43-14">${esc(st ?? '')}</b></div></div>
      ${chips([['PROFIL', x.profile ?? '–', 'prof'], ['LAST NED NÅR DEN ER', x.availabilityLabel ?? '–', 'av'], ['OVERVÅKET', x.monitored ? 'Ja' : 'Nei', 'mmon']])}
      <div class="m43-row xwrap g8">${acts}</div>${trackHtml50(`m:${x.id}`, { movieId: x.id, cls: 'movie' })}
      <div class="m43-card m43-col g4"><span class="m43-lab">FIL</span><span class="m43-rel">${esc(file)}</span></div>`;
  }
  const miss = x.missingCount ?? 0, aired = (x.seasons ?? []).reduce((a, se) => a + se.episodes.filter((e) => e.aired).length, 0), have = (x.seasons ?? []).reduce((a, se) => a + se.have, 0);
  const epTxt = x.seasons ? `${have} av ${aired} episoder · ${miss ? `${miss} mangler` : 'komplett'}` : x.episodesText ?? '';
  const acts = [`<button type="button" class="m43-btn ${miss ? 'ink' : 'line'}" data-m43="sall"${miss && !M.busy.sall ? '' : ' disabled'}>${M.busy.sall ? 'Søker …' : x.searchLabel ?? 'Ingenting mangler'}</button>`, x.play ? `<a class="m43-btn line" href="${esc(x.play.url)}" target="_blank" rel="noopener">${esc(x.play.label)}</a>` : '', unmonN45(x) && isAdm45() ? `<button type="button" class="m43-btn line red-t" data-m45-unmon="series">Slett uovervåkede (${unmonN45(x)})</button>` : ''].join('');
  const seasons = (x.seasons ?? []).map((se, si) => {
    const open = M.open[`${x.id}-${se.number}`] ?? si === 0, aired = se.episodes.filter((e) => e.aired).length;
    const sub = aired ? `${se.have} av ${aired} sendt${se.missing ? ` · ${se.missing} mangler` : ''}` : `Ikke sendt ennå · ${se.total} episoder`;
    const eps = open ? se.episodes.map((e) => {
      const air = e.airDateText ? (e.aired ? `Sendt ${e.airDateText}` : e.airDateText) : e.aired ? 'Sendt' : 'Ikke sendt';
      const n = narrow() && e.canSearch;
      return `<div class="m43-ep"><button type="button" class="m43-ib ghost mk" data-m43-epmon="${e.id}" aria-label="Overvåk episoden" aria-pressed="${e.monitored}">${ic.mark(e.monitored, 16)}</button><span class="m43-ec mono">${esc(e.e)}</span>
        <div class="m43-col grow"><b class="ell">${esc(e.title)}</b><span class="m43-sm ${n ? tone(e.status) : 't-mut'}">${esc(n ? `${air} · ${e.statusText}` : air)}</span></div>
        ${!n ? `<span class="m43-stc ${tone(e.status)}">${esc(e.statusText ?? '')}</span>` : ''}
        ${e.canSearch ? `<button type="button" class="m43-ib line" data-m43-epauto="${e.id}" aria-label="Automatisk søk" title="Automatisk søk"${M.busy[`ep${e.id}`] ? ' disabled' : ''}>${ic.search}</button><button type="button" class="m43-ib ink" data-m43-epint="${e.id}" aria-label="Interaktivt søk" title="Interaktivt søk">${ic.list}</button>` : ''}
        ${e.hasFile ? `<button type="button" class="m43-ib line" data-m44-epre="${e.id}" aria-label="Last ned ${esc(e.e)} på nytt" title="Last ned på nytt (interaktivt søk)">${ic.re}</button><button type="button" class="m43-ib line red-t" data-m44-epdel="${e.id}" aria-label="Slett filen til ${esc(e.e)}" title="Slett filen">${ic.trash}</button>` : ''}</div>${trackHtml50(`e:${e.id}`, { episodeId: e.id })}`;
    }).join('') : '';
    return `<div class="m43-se"><div class="m43-seh"><button type="button" class="m43-ib ghost mk" data-m43-semon="${se.number}" aria-label="Overvåk sesongen" aria-pressed="${se.monitored}">${ic.mark(se.monitored)}</button><button type="button" class="m43-set" data-m43-setog="${se.number}" aria-expanded="${open}"><b>${esc(se.label)}</b><span class="${se.missing ? 't-warn' : 't-mut'}">${esc(sub)}</span></button>
      ${se.canSearch ? `<button type="button" class="m43-btn sm line" data-m43-sesearch="${se.number}">Søk sesong</button>` : ''}${se.have > 0 ? `<button type="button" class="m43-btn sm line" data-m44-sere="${se.number}" title="Last ned sesongen på nytt (sesongpakke)">⟳ Sesong</button><button type="button" class="m43-btn sm line red-t" data-m44-sedel="${se.number}" title="Slett alle filer i sesongen">Slett filer</button>` : ''}${isAdm45() && unmonN45({ seasons: [se] }) ? `<button type="button" class="m43-btn sm line red-t" data-m45-unmon="season:${se.number}" title="Slett filene til episoder i sesongen som ikke er overvåket">Slett uovervåkede</button>` : ''}<span class="m43-chev">${open ? '▴' : '▾'}</span></div>${eps}</div>`;
  }).join('');
  return `${back}${head}<b class="m43-s ${miss ? 't-warn' : 't-ok'} m43-14">${esc(epTxt)}</b></div></div>
    ${chips([['PROFIL', x.profile ?? '–', 'prof'], ['OVERVÅKING', x.monitorLabel ?? monLbl(x.monitor), 'mon'], ['SERIETYPE', x.seriesTypeLabel ?? 'Standard', 'typ']])}
    <div class="m43-row xwrap g8">${acts}</div>${multiTrackHtml50((x.seasons ?? []).flatMap((se) => se.episodes.map((e) => e.id)))}<div class="m43-col">${seasons}</div>`;
}
const MON0 = [['all', 'Alle episoder'], ['future', 'Fremtidige episoder'], ['missing', 'Manglende episoder'], ['existing', 'Eksisterende episoder'], ['firstSeason', 'Første sesong'], ['latestSeason', 'Siste sesong'], ['pilot', 'Bare pilot'], ['none', 'Ingen']];
const TYP0 = [['standard', 'Standard'], ['daily', 'Daglig'], ['anime', 'Anime']];
const AV0 = [['announced', 'Annonsert'], ['inCinemas', 'På kino'], ['released', 'Utgitt digitalt']];
const monLbl = (k) => (MON0.find((m) => m[0] === k) ?? MON0[0])[1];
const listOf = (k) => (k === 'mon' ? (M.prof?.monitor?.map((x) => [x.id, x.label]) ?? MON0) : k === 'typ' ? (M.prof?.seriesTypes?.map((x) => [x.id, x.label]) ?? TYP0) : k === 'av' ? (M.prof?.availability?.map((x) => [x.id, x.label]) ?? AV0) : null);
const profsOf = (k) => (M.prof?.[k === 's' ? 'sonarr' : 'radarr'] ?? []).map((p) => p.name);

/* ---------------- Interaktivt søk ---------------- */

function srchHtml() {
  const s = M.srch, R = M.rel, back = backBtn45('srback', s.backL ?? 'Tilbake');
  if (!R) return back + jobHtml();
  if (R.error) return back + (R.allFailed ? `<div class="m43-empty err"><b>${esc(R.error)}</b><div class="m43-row g8"><button type="button" class="m43-btn ink" data-m44="relagain">Prøv igjen</button><button type="button" class="m43-btn line" data-m43-tab="ned">Se kilder i Prowlarr</button></div></div>` : `<div class="m43-empty err"><b>Fikk ikke hentet data</b><span>${esc(R.error)}</span><button type="button" class="m43-btn line" data-m44="relagain">Prøv igjen</button></div>`);
  const c = R.context ?? {};
  let rows = R.items ?? [];
  if (M.fq === '1080p') rows = rows.filter((r) => r.resolution === 1080);
  else if (M.fq === '2160p') rows = rows.filter((r) => r.resolution === 2160);
  else if (M.fq === 'no') rows = rows.filter((r) => r.norwegian);
  else if (M.fq === 'seeders') rows = [...rows].sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
  const seedC = (r) => (r.seedTone === 'good' ? 't-ok' : r.seedTone === 'bad' ? 't-bad' : '');
  const gb = (r) => { const k = `${r.guid}`, g = !!M.grab[k]; return `<button type="button" class="m43-grab${g ? ' done' : ''}" data-m43-grab="${esc(r.guid)}" aria-label="Last ned ${esc(r.quality)}"${g || M.busy[k] ? ' disabled' : ''}>${g ? '✓' : ic.dl}</button>`; };
  const rej = (r) => (r.rejections?.length ? `<span class="m43-sm t-bad">${esc(r.rejections.slice(0, 2).join(' · '))}</span>` : '');
  const table = narrow()
    ? `<div class="m43-col">${rows.map((r) => `<div class="m43-rr"><div class="m43-col grow g7"><span class="m43-rel">${esc(r.shortTitle ?? r.title)}</span><div class="m43-row xwrap g5x"><span class="m43-q">${esc(r.quality)}</span><b>${esc(r.sizeText)}</b><b class="${seedC(r)}">▲ ${esc(r.peersText ?? `${nb(r.seeders)} / ${nb(r.leechers)}`)}</b><span class="t-mut">${esc(r.indexer)}</span></div><span class="m43-sm t-mut">${esc(r.langText ?? '')}</span>${r.best ? '<b class="m43-sm t-ok">Best treff for profilen</b>' : ''}${rej(r)}</div>${gb(r)}</div>`).join('')}</div>`
    : `<div class="m43-tbl"><div class="m43-tr th"><span>UTGIVELSE</span><span>KVALITET</span><span>STØRRELSE</span><span>SEEDERE / PEERS</span><span>INDEKSER</span><span>SPRÅK</span><span></span></div>${rows.map((r) => `<div class="m43-tr"><div class="m43-col g3"><span class="m43-rel">${esc(r.title)}</span>${r.best ? '<b class="m43-sm t-ok">Best treff for profilen</b>' : ''}${rej(r)}</div><span><span class="m43-q">${esc(r.quality)}</span></span><b>${esc(r.sizeText)}</b><b class="${seedC(r)}">▲ ${esc(r.peersText ?? `${nb(r.seeders)} / ${nb(r.leechers)}`)}</b><span class="t-mut">${esc(r.indexer)}</span><span class="t-mut m43-sm">${esc(r.langText ?? '')}</span>${gb(r)}</div>`).join('')}</div>`;
  return `${back}<div class="m43-dh2">${art(c, 'm43-art sp')}<div class="m43-col grow g4"><span class="m43-lab acc">INTERAKTIVT SØK</span><b class="m43-srt">${esc(c.header ?? c.title ?? '')}</b><span class="t-mut">${esc([c.sub, R.text].filter(Boolean).join(' · '))}</span></div></div>
    ${R.cachedAt ? `<div class="m43-row g8 m43-sm t-mut">Hentet for ${Math.max(1, Math.round((Date.now() - R.cachedAt) / 60000))} min siden · <button type="button" class="m44-lk" data-m44="relagain">Søk igjen</button></div>` : ''}
    ${(R.indexers ?? []).some((x) => x.state === 'fail' || x.error) ? `<div class="m43-sm t-warn b7">${esc(R.indexers.filter((x) => x.state === 'fail' || x.error).map((x) => `${x.name} svarte ikke`).join(' · '))}</div>` : ''}
    <div class="m43-chips">${(R.filters ?? []).map((f) => chip(f.id === 'all' ? `${f.label} ${f.count}` : f.label, M.fq === f.id, `data-m43-fq="${esc(f.id)}"`)).join('')}</div>
    ${rows.length ? table : '<span class="t-mut">Ingen treff med dette filteret.</span>'}`;
}

/** Søket pågår: «Søker i 8 indeksere … 23 s», én rad per indekser, treffene som har kommet, og Avbryt. */
function jobHtml() {
  const J = M.job; if (!J) return '<div class="m43-card m43-gs">Søker …</div>';
  const sec = Math.round((Date.now() - J.t0) / 1000), I = J.indexers ?? [];
  const n = I.length;
  const ir = I.map((x) => `<div class="m44-ir"><span class="${x.state === 'ok' ? 't-ok' : x.state === 'fail' ? 't-bad' : 't-mut'}">${x.state === 'ok' ? '✓' : x.state === 'fail' ? '✕' : '⟳'}</span><b>${esc(x.name ?? '')}</b><span class="m43-sm t-mut">${x.state === 'ok' ? `${nb(x.count ?? 0)} treff · ${((+x.ms || 0) / 1000).toFixed(1).replace('.', ',')} s` : x.state === 'fail' ? esc(x.error || 'tidsavbrudd') : 'søker …'}</span></div>`).join('');
  const part = (J.items ?? []).slice(0, 8).map((r) => `<div class="m44-pr"><span class="m43-rel ell">${esc(r.title ?? '')}</span><span class="m43-q">${esc(r.quality ?? '')}</span><b>${esc(r.sizeText ?? '')}</b></div>`).join('');
  return `<div class="m43-card m43-col g8 m44-job" role="status"><div class="m43-row sb"><b>${J.state === 'legacy' ? 'Søker i indekserne via Sonarr/Radarr' : n ? `Søker i ${n} indeksere` : 'Starter søket'} … ${sec} s</b><button type="button" class="m43-btn sm line" data-m44="relstop">Avbryt</button></div>${ir}${part ? `<span class="m43-lab">TREFF SÅ LANGT · ${J.partialCount ?? (J.items ?? []).length}</span>${part}` : ''}${J.state === 'legacy' ? '<span class="m43-sm t-mut">Det kan ta opptil 3 minutter når mange indeksere svarer sakte.</span>' : ''}</div>`;
}

/* ---------------- Ark ---------------- */

function sheetHtml() {
  if (!M.sh) return '';
  let b = '';
  const x = `<button type="button" class="m43-ib ghost" data-m43="shclose" aria-label="Lukk">${ic.x}</button>`;
  const opts = (L, cur, attr) => `<div class="m43-row xwrap g6">${L.map(([k, n]) => chip(n, cur === k, `${attr}="${esc(k)}"`)).join('')}</div>`;
  const tog = (n, sub, on, attr) => `<button type="button" class="m43-tg" ${attr} role="switch" aria-checked="${!!on}"><span class="m43-col g2"><b>${esc(n)}</b>${sub ? `<span class="m43-sm t-mut">${esc(sub)}</span>` : ''}</span>${sw(on)}</button>`;
  if (M.sh === 'add' && M.add) {
    const a = M.add, s = a.k === 's';
    b = `<div class="m43-row sb"><b class="m43-sht">${s ? 'Legg til serie' : 'Legg til film'}</b>${x}</div>`;
    if (!a.sel) {
      const L = a.list;
      b += `<input class="m43-in" name="aq" value="${esc(a.q)}" placeholder="${s ? 'Søk etter serie, f.eks. Severance' : 'Søk etter film, f.eks. Frankenstein'}" autocomplete="off" aria-label="Søk">
        <div class="m43-col">${L == null ? (a.q.trim().length > 1 ? '<span class="t-mut m43-pad">Søker …</span>' : '') : L.error ? `<span class="t-bad">${esc(L.error)}</span>` : L.length ? L.map((r, i) => `<button type="button" class="m43-ar" data-m43-apick="${i}">${art(r, 'm43-art ap')}<div class="m43-col grow"><b>${esc(r.title)}</b><span class="m43-sm t-mut">${esc([r.year, r.network, r.seasons ? `${r.seasons} sesonger` : ''].filter(Boolean).join(' · '))}</span></div><span class="m43-13 b7 ${r.exists ? 't-mut' : 'acc'}">${r.exists ? 'Finnes' : 'Velg ›'}</span></button>`).join('') : '<span class="t-mut m43-pad">Ingen treff.</span>'}</div>`;
    } else {
      const P = profsOf(a.k), pl = (P.length ? P : ['Any', 'HD-720p', 'HD-1080p', 'HD - 720p/1080p', 'Ultra-HD']).map((n) => [n, n]);
      b += `<div class="m43-row g12">${art(a.sel, 'm43-art sm')}<div class="m43-col"><b class="m43-st">${esc(a.sel.title)}</b><span class="m43-sm t-mut">${esc([a.sel.year, a.sel.network].filter(Boolean).join(' · '))}</span></div></div>
        <div class="m43-col g8"><span class="m43-lab">KVALITETSPROFIL</span>${opts(pl, a.prof, 'data-m43-aprof')}</div>
        ${s ? `<div class="m43-col g8"><span class="m43-lab">OVERVÅKING</span>${opts(listOf('mon'), a.mon, 'data-m43-amon')}</div><div class="m43-col g8"><span class="m43-lab">SERIETYPE</span>${opts(listOf('typ'), a.typ, 'data-m43-atyp')}</div>`
    : `<div class="m43-col g8"><span class="m43-lab">LAST NED NÅR DEN ER</span>${opts(listOf('av'), a.av, 'data-m43-aav')}</div>`}
        <div class="m43-kv"><span class="t-mut">Rotmappe</span><b class="mono">${esc((s ? M.prof?.defaults?.sonarrRoot : M.prof?.defaults?.radarrRoot) ?? (s ? '/data/media/tv' : '/data/media/film'))}</b></div>
        ${tog(s ? 'Søk etter manglende episoder med en gang' : 'Søk etter filmen med en gang', '', a.go, 'data-m43="ago"')}
        ${a.err ? `<span class="t-bad b7">${esc(a.err)}</span>` : ''}
        <div class="m43-row g8"><button type="button" class="m43-btn line grow" data-m43="aback">Tilbake</button><button type="button" class="m43-btn ink grow2" data-m43="aok"${a.busy ? ' disabled' : ''}>${a.busy ? 'Legger til …' : 'Legg til'}</button></div>`;
    }
  } else if ((M.sh === 'act' || M.sh === 'del') && M.act) {
    const t = (M.tor?.items ?? []).find((y) => y.hash === M.act);
    if (!t) { M.sh = null; return ''; }
    const nm = `${t.title}${t.code && t.code !== 'Film' ? ` ${t.code}` : ''}`;
    if (M.sh === 'del') b = `<b class="m43-sht">Slette ${esc(nm)}?</b><span class="t-mut m43-14">Fjernes fra qBittorrent. Velg om filene på disken skal bli liggende.</span>
      <button type="button" class="m43-btn line xbig" data-m43-del="0">Slett, behold filene</button><button type="button" class="m43-btn xred xbig" data-m43-del="1">Slett med filene</button><button type="button" class="m43-btn ghost" data-m43="shclose">Avbryt</button>`;
    else {
      const F = M.files;
      const btns = [[t.status === 'pause' ? 'Fortsett' : 'Pause', 'tog'], ['Tving start', 'force'], ['Opp i køen', 'up'], ['Ned i køen', 'down'], ['Øverst i køen', 'top'], ['Nederst i køen', 'bottom'], ['Sjekk filene på nytt', 'check']].filter(([, op]) => t.status !== 'seed' || op === 'check');
      b = `<div class="m43-row sb xtop"><div class="m43-col g4 mw0"><b class="m43-sht">${esc(nm)}</b><span class="m43-rel t-mut">${esc(t.name)}</span></div>${x}</div>
        <div class="m43-g2">${btns.map(([n, op]) => `<button type="button" class="m43-btn xcard" data-m43-top="${op}">${esc(n)}</button>`).join('')}<button type="button" class="m43-btn xcard red-t" data-m43="todel">Slett …</button></div>
        <span class="m43-lab">FILER · TRYKK FOR Å VELGE BORT</span>
        <div class="m43-col">${!F ? '<span class="t-mut m43-pad">Henter filene …</span>' : F.error ? `<span class="t-bad">${esc(F.error)}</span>` : (F.items ?? []).map((f) => `<button type="button" class="m43-fr" data-m43-file="${f.index}" aria-pressed="${f.wanted}"><span class="m43-ck${f.wanted ? ' on' : ''}">${f.wanted ? '✓' : ''}</span><span class="mono ell grow${f.wanted ? '' : ' off'}">${esc(f.name)}</span><span class="m43-sm t-mut">${esc(f.sizeText)}</span></button>`).join('')}</div>`;
    }
  } else if (M.sh === 'edit' && M.det && M.detail) {
    const f = M.edit, d = M.detail, k = M.det.k;
    const L = f === 'prof' ? (profsOf(k).length ? profsOf(k) : [d.profile]).map((n) => [n, n]) : listOf(f);
    const cur = f === 'prof' ? d.profile : f === 'mon' ? d.monitor ?? 'all' : f === 'typ' ? d.seriesType : d.minimumAvailability;
    b = `<div class="m43-row sb"><b class="m43-sht">${{ prof: 'Kvalitetsprofil', mon: 'Overvåking', typ: 'Serietype', av: 'Last ned når den er' }[f]}</b>${x}</div>
      <div class="m43-card nopad m43-col">${(L ?? []).map(([kk, n]) => `<button type="button" class="m43-opt${cur === kk ? ' on' : ''}" data-m43-eopt="${esc(kk)}"><span>${esc(n)}</span><b class="acc">${cur === kk ? '✓' : ''}</b></button>`).join('')}</div>`;
  } else if (M.sh === 'mag' && M.mag) {
    const g = M.mag, pr = g.check;
    const cats = [['', 'Ingen', '/data/downloads'], ['tv-sonarr', 'tv-sonarr', '/data/downloads/tv'], ['radarr', 'radarr', '/data/downloads/film']];
    b = `<div class="m43-row sb"><b class="m43-sht">Legg til torrent</b>${x}</div>
      <div class="m43-col g8"><div class="m43-row sb"><span class="m43-lab">MAGNET-LENKE ELLER .TORRENT-ADRESSE</span><button type="button" class="m43-btn sm line xbg" data-m43="paste">Lim inn</button></div>
        <textarea class="m43-ta" name="mq" rows="4" placeholder="magnet:?xt=urn:btih:…&amp;dn=…" spellcheck="false">${esc(g.q)}</textarea>
        ${pr?.ok && !pr.exists ? `<div class="m43-okb"><b>✓ ${esc(pr.name)}</b><span class="mono m43-sm t-mut">${esc(pr.info ?? '')}</span></div>` : ''}</div>
      <div class="m43-col g8"><span class="m43-lab">KATEGORI</span><div class="m43-row xwrap g6">${cats.map(([k, n]) => chip(n, g.cat === k, `data-m43-mcat="${esc(k)}"`)).join('')}</div><span class="m43-sm t-mut">Lagres i <b class="mono">${esc(cats.find((c) => c[0] === g.cat)?.[2] ?? '/data/downloads')}</b>. Med tv-sonarr eller radarr importeres filen av Sonarr/Radarr når den er ferdig.</span></div>
      <div class="m43-card nopad m43-col">${tog('Start pauset', 'Legges i køen uten å starte', g.paused, 'data-m43-mt="paused"')}${tog('Sekvensiell nedlasting', 'Laster ned i rekkefølge, så du kan se mens den lastes', g.sequential, 'data-m43-mt="sequential"')}${tog('Første og siste del først', 'Gir raskere forhåndsvisning', g.firstLast, 'data-m43-mt="firstLast"')}</div>
      ${g.err || (pr && (pr.error)) ? `<span class="t-bad b7">${esc(g.err || pr.error)}</span>` : ''}
      <button type="button" class="m43-btn ink xbig" data-m43="magadd"${g.busy ? ' disabled' : ''}>${g.busy ? 'Legger til …' : 'Legg til i qBittorrent'}</button>
      ${'registerProtocolHandler' in navigator ? '<button type="button" class="m43-btn ghost" data-m43="maghandler">Åpne magnet-lenker i Homelab</button>' : ''}`;
  } else if (M.sh === 'ix' && M.ix) {
    const I = M.ix;
    b = `<div class="m43-row sb"><b class="m43-sht">Legg til indekser</b>${x}</div>`;
    if (!I.sel) {
      const S = I.list;
      b += `<input class="m43-in" name="iq" value="${esc(I.q)}" placeholder="Søk blant 500+ indeksere, f.eks. Nordic" autocomplete="off" aria-label="Søk etter indekser">
        <div class="m43-chips">${(S?.filters ?? [{ id: 'all', label: 'Alle' }, { id: 'public', label: 'Offentlig' }, { id: 'private', label: 'Privat' }, { id: 'semi', label: 'Semi-privat' }, { id: 'usenet', label: 'Usenet' }]).map((f) => chip(f.label, I.type === f.id, `data-m43-itype="${esc(f.id)}"`)).join('')}</div>
        <div class="m43-col">${!S ? '<span class="t-mut m43-pad">Henter indeksere …</span>' : S.error ? `<span class="t-bad">${esc(S.error)}</span>` : (S.items ?? []).length ? S.items.slice(0, 80).map((r, i) => `<button type="button" class="m43-ar" data-m43-ipick="${i}"${r.added ? ' disabled' : ''}><span class="m43-typ" style="background:${esc(r.typeColor)}">${esc(r.typeLabel)}</span><div class="m43-col grow"><b>${esc(r.name)}</b><span class="m43-sm t-mut">${esc([(r.categories ?? []).slice(0, 3).join(', '), r.language, r.protocolLabel].filter(Boolean).join(' · '))}</span></div><span class="m43-13 b7 ${r.added ? 't-mut' : 'acc'}">${r.added ? 'Lagt til' : 'Velg ›'}</span></button>`).join('') : '<span class="t-mut m43-pad">Fant ingen indeksere som passer.</span>'}</div>`;
    } else {
      const r = I.sel, fld = (n, label, type, ph) => `<input class="m43-in${type === 'secret' ? ' mono' : ''}" name="if_${n}" type="${type === 'secret' ? 'password' : 'text'}" value="${esc(I.f[n] ?? '')}" placeholder="${esc(ph ?? label)}" autocomplete="off" aria-label="${esc(label)}">`;
      const F = r.fields ?? [];
      const auth = r.auth ?? 'none';
      const fieldsHtml = auth === 'none' ? '<span class="t-mut m43-14">Offentlig indekser. Ingen innlogging trengs.</span>'
        : `<div class="m43-col g8"><span class="m43-lab">${auth === 'user' ? 'INNLOGGING' : auth === 'key' ? 'API-NØKKEL' : 'COOKIE'}</span>${(F.length ? F : auth === 'user' ? [{ name: 'username', label: 'Brukernavn' }, { name: 'password', label: 'Passord', type: 'secret' }] : [{ name: auth === 'key' ? 'apiKey' : 'cookie', label: auth === 'key' ? 'API-nøkkel' : 'Cookie', type: 'secret' }]).map((f) => fld(f.name, f.label, f.type)).join('')}${r.authHelp ? `<span class="m43-sm t-mut">${esc(r.authHelp)}</span>` : ''}</div>`;
      b += `<div class="m43-row g12"><span class="m43-typ" style="background:${esc(r.typeColor)}">${esc(r.typeLabel)}</span><div class="m43-col"><b class="m43-st">${esc(r.name)}</b><span class="m43-sm t-mut">${esc([(r.categories ?? []).slice(0, 3).join(', '), r.language, r.protocolLabel].filter(Boolean).join(' · '))}</span></div></div>
        ${fieldsHtml}
        <div class="m43-col g8"><span class="m43-lab">PRIORITET · ${I.pri}</span><div class="m43-row xwrap g6">${(I.list?.priorities ?? [1, 10, 25, 40, 50]).map((p) => chip(String(p), I.pri === p, `data-m43-ipri="${p}"`)).join('')}</div><span class="m43-sm t-mut">Lavere tall brukes først når flere har samme utgivelse.</span></div>
        <div class="m43-card nopad m43-col">${tog('Sonarr', 'Serier · synkes med app-profilen', I.sonarr, 'data-m43-isync="sonarr"')}${tog('Radarr', 'Filmer · synkes med app-profilen', I.radarr, 'data-m43-isync="radarr"')}</div>
        ${I.err ? `<span class="t-bad b7">${esc(I.err)}</span>` : ''}
        <div class="m43-row g8"><button type="button" class="m43-btn line grow" data-m43="iback">Tilbake</button><button type="button" class="m43-btn ink grow2" data-m43="isave"${I.busy ? ' disabled' : ''}>${I.busy ? 'Tester …' : 'Test og lagre'}</button></div>`;
    }
  } else if (M.sh === 'set') {
    const p = M.prefs ?? M.status?.settings ?? {}, S = M.status;
    b = `<div class="m43-row sb"><b class="m43-sht">Innstillinger for Media</b>${x}</div>
      <div class="m43-card nopad m43-col">${tog('Varsel når en nedlasting er ferdig', 'Push og Glimt-brief: «Ferdig: Shrinking S03E08 · klar i Jellyfin»', p.notifyDone !== false, 'data-m43-pref="notifyDone"')}${tog('Varsel når noe feiler eller står fast', '0 seedere i 30 min, indekser nede, full disk', p.notifyFail !== false, 'data-m43-pref="notifyFail"')}${tog('Vis i Kalender', 'Egen kalender «Media» i Kalender-appen', p.calendar !== false, 'data-m43-pref="calendar"')}</div>
      <div class="m43-col g8"><span class="m43-lab">SPILL AV MED</span><div class="m43-row g6">${[['jellyfin', 'Jellyfin'], ['plex', 'Plex']].map(([k, n]) => `<button type="button" class="m43-chip grow${pill((p.player ?? 'jellyfin') === k)}" data-m43-player="${k}">${n}</button>`).join('')}</div></div>
      <div class="m43-col g8"><span class="m43-lab">TJENESTER</span><div class="m43-card nopad m43-col">${!S ? '<span class="t-mut m43-pad">Henter …</span>' : S.error ? `<span class="t-bad m43-pad">${esc(S.error)}</span>` : (S.services ?? []).map((s) => `<div class="m43-svc"><span class="m43-dot t-${s.ok ? 'ok' : s.configured ? 'bad' : 'mut'}"></span><div class="m43-col grow mw0"><b>${esc(s.name)}</b><span class="mono m43-sm t-mut ell">${esc(s.url ?? (s.configured ? '' : 'Ikke satt opp'))}</span></div><span class="m43-sm b7 ${s.ok ? 't-ok' : s.configured ? 't-bad' : 't-mut'}">${esc(s.ok ? s.text ?? '' : s.configured ? s.error ?? s.text ?? 'Feil' : s.mock ? 'demodata' : 'Mangler')}</span></div>`).join('')}</div>
        <span class="m43-sm t-mut">API-nøklene lagres på serveren. Appen snakker bare med Homelab. Adresser, nøkler og oppsett steg for steg: <button type="button" class="m43-link" data-m43="integ">Innstillinger → Integrasjoner → Media</button>.</span></div>
      ${S?.admin ? `<div class="m43-col g8"><span class="m43-lab">TILGANG TIL MEDIA</span><div class="m43-card nopad m43-col">${!M.access ? '<span class="t-mut m43-pad">Henter …</span>' : M.access.error ? `<span class="t-bad m43-pad">${esc(M.access.error)}</span>` : (M.access.users ?? []).map((u) => (u.admin ? `<div class="m43-svc"><div class="m43-col grow"><b>${esc(u.name)}</b><span class="m43-sm t-mut">Administrator · har alltid tilgang</span></div></div>` : tog(u.name, u.allowed ? 'Har tilgang' : 'Ingen tilgang', u.allowed, `data-m43-acc="${esc(u.id)}"`))).join('')}</div></div>` : ''}`;
  }
  if (!b) return '';
  return `<div class="m43-shb" data-m43-shbg><div class="m43-sh" role="dialog" aria-modal="true">${b}</div></div>`;
}

/* ---------------- Tegning ---------------- */

function mainHtml() {
  if (M.restricted) return `<div class="m43-empty"><b>Ingen tilgang</b><span>${esc(M.restricted)}</span></div>`;
  if (M.missing) return '<div class="m43-empty"><b>Media er ikke klart på serveren ennå</b><span>Serveren mangler /api/media. Oppdater Homelab-serveren, og sett opp Sonarr, Radarr, qBittorrent og Prowlarr under Innstillinger → Integrasjoner → Media.</span><button type="button" class="m43-btn line" data-m43="integ">Åpne Integrasjoner</button></div>';
  if (M.srch) return srchHtml();
  if (M.det) return detHtml();
  if (M.tab === 'kal') return kal70();
  if (M.tab === 'bib') return bib70();
  if (M.tab === 'ned') return ned70();
  if (M.tab === 'av') return `${backBtn45('avback', 'Oversikt')}<div data-pb44-slot></div>`; // Avspilling (Plex/Jellyfin): fra «Spilles nå»
  return ov70();
}
let pbHost = null;
const keepFocus = (el, fn) => {
  const a = document.activeElement, n = el.contains(a) ? a.getAttribute('name') : null, pos = n ? a.selectionStart : 0;
  fn();
  if (n) { const f = el.querySelector(`[name="${n}"]`); if (f) { f.focus({ preventScroll: true }); try { f.setSelectionRange(pos, pos); } catch { /* */ } } }
};
function paintMain() {
  const c = root?.querySelector('[data-m43-main]'); if (!c) return;
  const y = c.scrollTop;
  keepFocus(c, () => { c.innerHTML = `<div class="m43-in-w m70-w">${mainHtml()}</div>`; });
  const slot = c.querySelector('[data-pb44-slot]');
  if (slot) { if (!pbHost) pbHost = document.createElement('div'); slot.replaceWith(pbHost); mountPlayback(pbHost); }
  c.scrollTop = y;
}
function paintTop() { const t = root?.querySelector('[data-m43-top]'); if (t) keepFocus(t, () => { t.innerHTML = topHtml(); }); }
function paintGl() { const g = root?.querySelector('[data-m43-gl]'); if (g) g.innerHTML = glHtml(); }
function paintSheet() {
  const s = root?.querySelector('[data-m43-sh]'); if (!s) return;
  const sc = s.querySelector('.m43-sh')?.scrollTop ?? 0;
  keepFocus(s, () => { s.innerHTML = sheetHtml(); });
  const n = s.querySelector('.m43-sh'); if (n) n.scrollTop = sc;
  document.body.classList.toggle('m43-modal', !!M.sh);
}
function paintToast() { const t = root?.querySelector('[data-m43-toast]'); if (t) t.innerHTML = M.undo ? `<div class="m43-toast" role="status"><span>${esc(M.undo.text)}</span><button type="button" class="m44-undo" data-m44="undo">Angre</button></div>` : M.toast ? `<div class="m43-toast" role="status">${esc(M.toast)}</div>` : ''; }
function paint() { if (!root?.isConnected) return; paintTop(); paintGl(); paintMain(); paintSheet(); paintToast(); }

/* ---------------- Handlinger ---------------- */

/** Prompt 70: bytt fane (Oversikt, Kalender, Bibliotek, Nedlastinger, Avspilling) – eget steg i historikken. */
function goTab(tab) {
  M.tab = tab; M.det = null; M.srch = null; M.job = null; M.libF = 'all'; M.srvOpen = false; state70.menu = null; state70.alerts = false;
  enterTab(); poll(); paint(); root?.querySelector('[data-m43-main]')?.scrollTo(0, 0); nav();
}
/** Prompt 70: interaktivt søk fra Kalender (uten å gå via serie-/filmsiden). */
function search70(srch) { M.srch = srch; M.fq = 'all'; loadRel(); nav(); paint(); root?.querySelector('[data-m43-main]')?.scrollTo(0, 0); }
function openDet(k, id, fromHist) { M.tab = 'bib'; M.bibK = k === 'm' ? 'm' : 's'; M.det = { k, id: +id }; M.srch = null; M.libF = 'all'; loadProf(); loadDetail(); if (!(k === 's' ? M.ser : M.mov)) (k === 's' ? loadSer : loadMov)(); paint(); root?.querySelector('[data-m43-main]')?.scrollTo(0, 0); if (!fromHist) nav(); }

/* ---------------- Prompt 44: frem og tilbake i nettleseren ----------------
   #/media/<fane>[/s|m/<id>[/sok[/<episodeId>|/sesong-<n>]]]. Hver navigasjon er et steg i historikken (pushState); popstate
   (musens sideknapper, ⌘[ ⌘], Alt+←/→, nettleserknappene) går mellom stegene. Ark og menyer lukkes. */
// Prompt 70: #/media (Oversikt), #/media/kalender, #/media/bibliotek[/filmer], #/media/nedlastinger, #/media/avspilling.
// De gamle adressene (#/media/kommer|sonarr|radarr|qbittorrent|prowlarr …) virker fortsatt.
const TAB_SLUG = { ov: '', kal: 'kalender', bib: 'bibliotek', ned: 'nedlastinger', av: 'avspilling' };
const SLUG_TAB = { oversikt: 'ov', ov: 'ov', kalender: 'kal', kal: 'kal', kommer: 'kal', kom: 'kal', bibliotek: 'bib', bib: 'bib', sonarr: 'bib', son: 'bib', radarr: 'bib', rad: 'bib', nedlastinger: 'ned', ned: 'ned', qbittorrent: 'ned', qb: 'ned', prowlarr: 'ned', pro: 'ned', avspilling: 'av', av: 'av' };
const SLUG_BIB = { radarr: 'm', rad: 'm', sonarr: 's', son: 's' };
function hashNow() {
  const sl = TAB_SLUG[M.tab] ?? '';
  let h = M.tab === 'bib' && M.det ? '#/media/bibliotek' : `#/media${sl ? `/${sl}` : ''}`;
  if (M.det) h += `/${M.det.k}/${M.det.id}`;
  else if (M.tab === 'bib' && M.bibK === 'm' && !M.srch) h += '/filmer';
  if (M.srch) { if (!M.det) h += `${sl ? '' : '/oversikt'}/${M.srch.k}/${M.srch.id}`; h += '/sok'; if (M.srch.episodeId) h += `/${M.srch.episodeId}`; else if (M.srch.season != null) h += `/sesong-${M.srch.season}`; if (M.srch.re) h += '?re=1'; }
  return h;
}
let depth = 0;
function nav(replace = false) {
  const h = hashNow();
  if (location.hash === h) return;
  try { if (replace || !/^#\/media/.test(location.hash)) history.replaceState({ m44: depth }, '', h); else { depth++; history.pushState({ m44: depth }, '', h); } } catch { /* */ }
}
/** Leser adressen og viser riktig visning (oppstart, oppfrisking og popstate). */
function applyHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?'), seg = path.split('/');
  if (seg[0] !== 'media') return false;
  const tab = SLUG_TAB[seg[1] ?? ''];
  if (!tab && seg[1]) return false;
  M.sh = null; M.srvOpen = false; M.add = null;
  const qt = new URLSearchParams(qs ?? '').get('tab') ?? ''; // #/media?tab=qb (eldre lenker)
  M.tab = tab ?? SLUG_TAB[qt] ?? 'ov';
  if (SLUG_BIB[seg[1]] || SLUG_BIB[qt]) M.bibK = SLUG_BIB[seg[1]] ?? SLUG_BIB[qt];
  if (M.tab === 'bib' && !seg[2] && seg[1]) M.bibK = SLUG_BIB[seg[1]] ?? SLUG_BIB[qt] ?? 's';
  if (M.tab === 'bib' && seg[2] === 'filmer') M.bibK = 'm';
  const k = seg[2] === 's' || seg[2] === 'm' ? seg[2] : null, id = k ? +seg[3] : null;
  if (k && M.tab === 'bib') M.bibK = k;
  const wasDet = M.det ? `${M.det.k}:${M.det.id}` : '';
  M.det = k && id ? { k, id } : null;
  if (M.det && wasDet !== `${k}:${id}`) { loadProf(); loadDetail(); }
  if (k && id && seg[4] === 'sok') {
    const ep = seg[5] && /^\d+$/.test(seg[5]) ? +seg[5] : null, se = seg[5]?.startsWith('sesong-') ? +seg[5].slice(7) : null;
    const was = M.srch ? relKey(M.srch) : '';
    M.srch = { k, id, ...(ep ? { episodeId: ep } : {}), ...(se != null ? { season: se } : {}), re: /(^|&)re=1/.test(qs ?? ''), backL: M.detail?.title ?? 'Tilbake' };
    if (was !== relKey(M.srch)) { M.fq = 'all'; loadRel(); }
  } else { M.srch = null; M.job = null; }
  if (!M.det && !M.srch) enterTab();
  return true;
}
/** app.js spør før den tegner siden på nytt ved hashchange: Media styrer sin egen adresse. */
export const ownsHash = () => !!root?.isConnected && /^#\/media(\/|$|\?)/.test(location.hash);
addEventListener('popstate', () => { if (!root?.isConnected || !/^#\/media/.test(location.hash)) return; if (typeof history.state?.m44 === 'number') depth = history.state.m44; applyHash(); poll(); paint(); });
/** «‹ Serier», tilbake fra søk og ✕: history.back() når forrige steg er i Media, ellers vanlig navigasjon. */
function back(fallback) { if (depth > 0 && typeof history.state?.m44 === 'number') { history.back(); return; } fallback(); nav(true); }
async function cmd(body, key, okMsg) {
  M.busy[key] = true; paint();
  // Prompt 50: svaret har `track` – statuslinja under episoden/filmen følger søket til det er ferdig (ikke bare «Søk startet»).
  try { const r = await mapi('/command', { method: 'POST', json: body }); if (!startTrack50(r, { episodeIds: body.episodeIds ?? [], movieIds: body.movieIds ?? [], seriesId: body.seriesId ?? null, seasonNumber: body.seasonNumber ?? null })) toast(okMsg ?? r.message ?? 'Søk startet'); } catch (e) { toast(e.message); }
  M.busy[key] = false; paint();
}
async function allToggle(pause) {
  const p = pause ?? !(M.tor?.allPaused ?? M.up?.allPaused);
  try { const r = await mapi(p ? '/torrents/pauseAll' : '/torrents/resumeAll', { method: 'POST' }); if (r.items) M.tor = r; toast(r.message ?? (p ? 'Alt er pauset' : 'Alle nedlastinger går igjen')); } catch (e) { toast(e.message); }
  if (M.tab === 'ov' || M.tab === 'ned') loadUp();
  paint();
}
async function tor(hash, op, json) {
  try { const r = await mapi(`/torrents/${hash}/${op}`, { method: 'POST', json: json ?? {} }); if (r.message) toast(r.message); } catch (e) { toast(e.message); }
  M.tor = await mapi('/torrents?filter=all').catch(() => M.tor); paint();
}
async function patchDet(json, msg) {
  const d = M.det; if (!d) return;
  try { await mapi(d.k === 's' ? `/series/${d.id}` : `/movies/${d.id}`, { method: 'PUT', json }); if (msg) toast(msg); } catch (e) { toast(e.message); }
  M.sh = null; loadDetail(); if (d.k === 's') M.ser = null; else M.mov = null;
}
async function grab(guid) {
  const r = (M.rel?.items ?? []).find((x) => x.guid === guid); if (!r) return;
  M.busy[guid] = true; paintMain();
  try { const j = await mapi('/release', { method: 'POST', json: { guid, indexerId: r.indexerId, service: r.service } }); M.grab[guid] = true; toast(j.message ?? `Sendt til qBittorrent: ${r.quality} · ${r.sizeText}`); if (M.srch?.k === 'm' || M.srch?.episodeId) trackGrab50(M.srch.k === 'm' ? { movieId: M.srch.id } : { episodeId: M.srch.episodeId }); try { navigator.vibrate?.(10); } catch { /* */ } }
  catch (e) { toast(e.message); }
  M.busy[guid] = false; M.tor = null; paintMain();
}
async function lookup() {
  const a = M.add; if (!a) return;
  const q = a.q.trim();
  if (q.length < 2) { a.list = null; return paintSheet(); }
  a.list = null; paintSheet();
  try { const r = await mapi(`/${a.k === 's' ? 'series' : 'movies'}/lookup?term=${encodeURIComponent(q)}`); if (M.add === a && a.q.trim() === q) a.list = r.items ?? []; }
  catch (e) { if (M.add === a) a.list = { error: e.message }; }
  paintSheet();
}
async function addOk() {
  const a = M.add; if (!a?.sel) return;
  a.busy = true; a.err = ''; paintSheet();
  const s = a.k === 's';
  const body = s ? { tvdbId: a.sel.tvdbId, title: a.sel.title, profile: a.prof, monitor: a.mon, seriesType: a.typ, searchNow: a.go } : { tmdbId: a.sel.tmdbId, title: a.sel.title, profile: a.prof, minimumAvailability: a.av, searchNow: a.go };
  try {
    const r = await mapi(s ? '/series' : '/movies', { method: 'POST', json: body });
    M.sh = null; M.add = null; M.gl = null; toast(r.message ?? 'Lagt til'); if (s) M.ser = null; else M.mov = null;
    const x = r.series ?? r.movie; if (x?.id) return openDet(a.k, x.id);
  } catch (e) { a.busy = false; a.err = e.message; if (e.body?.exists && e.body.id) { M.sh = null; return openDet(a.k, e.body.id); } }
  paint();
}
async function magCheck() {
  const g = M.mag; if (!g) return;
  const q = g.q.trim(); if (!q) { g.check = null; return paintSheet(); }
  try { const r = await mapi('/torrents/magnet/check', { method: 'POST', json: { url: q } }); if (M.mag === g && g.q.trim() === q) g.check = r; } catch (e) { if (M.mag === g) g.check = { ok: false, error: e.message }; }
  paintSheet();
}
async function magAdd() {
  const g = M.mag; if (!g) return;
  if (!g.q.trim()) { g.err = 'Lim inn en magnet-lenke eller en .torrent-adresse.'; return paintSheet(); }
  g.busy = true; g.err = ''; paintSheet();
  try { const r = await mapi('/torrents/magnet', { method: 'POST', json: { url: g.q.trim(), category: g.cat, paused: g.paused, sequential: g.sequential, firstLast: g.firstLast } }); M.sh = null; M.mag = null; toast(r.message ?? 'Lagt til i qBittorrent'); if (M.tab !== 'ned') goTab('ned'); else loadTor(); }
  catch (e) { g.busy = false; g.err = e.message; }
  paint();
}
async function ixSchema() {
  const I = M.ix; if (!I) return;
  try { const r = await mapi(`/indexers/schema?q=${encodeURIComponent(I.q.trim())}&type=${encodeURIComponent(I.type)}`); if (M.ix === I) I.list = r; } catch (e) { if (M.ix === I) I.list = { error: e.message }; }
  paintSheet();
}
async function ixSave() {
  const I = M.ix; if (!I?.sel) return;
  I.busy = true; I.err = ''; paintSheet();
  try {
    const r = await mapi('/indexers', { method: 'POST', json: { key: I.sel.key, fields: I.f, priority: I.pri, sonarr: I.sonarr, radarr: I.radarr } });
    M.sh = null; M.ix = null; toast(r.message ?? `${I.sel.name} lagt til`); loadIdx();
  } catch (e) { I.busy = false; I.err = e.message; }
  paint();
}
async function testIdx(id) {
  M.idxT[id] = { busy: true }; paintMain();
  try { M.idxT[id] = await mapi(`/indexers/${id}/test`, { method: 'POST' }); } catch (e) { M.idxT[id] = { ok: false, message: e.message }; }
  paintMain();
}
async function setPref(k, v) {
  M.prefs = { ...(M.prefs ?? {}), [k]: v }; paintSheet();
  try { M.prefs = await mapi('/settings', { method: 'PUT', json: { [k]: v } }); if (M.status) M.status.settings = M.prefs; } catch (e) { toast(e.message); }
  paintSheet();
}
function closeSheet() { M.sh = null; M.add = null; M.mag = null; M.ix = null; M.files = null; paint(); }
function close() { if (depth > 0 && typeof history.state?.m44 === 'number') { const n = depth; depth = 0; history.go(-n); setTimeout(() => { if (/^#\/media/.test(location.hash)) location.hash = '#/dash'; }, 120); return; } location.hash = '#/dash'; }
async function openIntegrations() { try { const m = await import('./settings.js'); closeSheet(); m.openSettings('int'); } catch { location.hash = '#/innstillinger/integrasjoner'; } }

/* ---------------- Prompt 44: handlinger ---------------- */
async function act44(b, d) {
  const a = d.m44;
  if (d.m44Komv) { M.komv = d.m44Komv; lss('media_komv', M.komv); paintMain(); return true; }
  if (d.m44Site) { M.site = d.m44Site; lss('media_site', M.site); mapi('/servers/select', { method: 'PUT', json: { id: M.site } }).catch(() => {}); M.srvOpen = false; M.up = M.ser = M.mov = M.tor = M.idx = M.disk = M.prof = null; M.det = null; M.srch = null; relCache.clear(); resetSite70(); const n = M.servers?.find((x) => String(x.id) === String(M.site))?.name; toast(`Bruker ${n ?? 'serveren'} for Sonarr, Radarr, qBittorrent og Prowlarr`); enterTab(); paint(); nav(true); return true; }
  if (d.m44Step) { const L = (M.det?.k === 's' ? M.ser : M.mov)?.items ?? [], i = L.findIndex((y) => String(y.id) === String(M.det?.id)); const n = L[(i + +d.m44Step + L.length) % L.length]; if (n) openDet(M.det.k, n.id); return true; }
  if (d.m44Epre) { M.srch = { k: 's', id: M.detail.id, episodeId: +d.m44Epre, re: true, backL: M.detail.title }; M.fq = 'all'; loadRel(); nav(); paintMain(); return true; }
  if (d.m44Sere) { M.srch = { k: 's', id: M.detail.id, season: +d.m44Sere, re: true, backL: M.detail.title }; M.fq = 'all'; loadRel(); nav(); paintMain(); return true; }
  if (d.m44Epdel) { const ep = M.detail?.seasons?.flatMap((x) => x.episodes).find((x) => String(x.id) === d.m44Epdel); if (ep) await delFiles([ep], `${ep.code ?? ep.e} · ${ep.title}`); return true; }
  if (d.m44Sedel) { const se = M.detail?.seasons?.find((x) => String(x.number) === d.m44Sedel); const L = (se?.episodes ?? []).filter((x) => x.hasFile); if (L.length) await delFiles(L, `${L.length} filer i ${se.label}`); return true; }
  if (!a) return false;
  if (a === 'srv') { M.srvOpen = !M.srvOpen; paintTop(); return true; }
  if (a === 'lqx') { M.libQ = ''; paintMain(); root?.querySelector('[name="lq"]')?.focus(); return true; }
  if (a === 'lqadd') { const k = M.bibK === 'm' ? 'm' : 's', q = M.libQ.trim(); M.sh = 'add'; M.add = { k, q, list: null, sel: null, prof: k === 's' ? M.prof?.defaults?.sonarr ?? 'HD-1080p' : M.prof?.defaults?.radarr ?? 'Ultra-HD', mon: 'all', typ: 'standard', av: 'released', go: true }; loadProf(); paintSheet(); lookup(); return true; }
  if (a === 'mre') { M.srch = { k: 'm', id: M.detail.id, re: true, backL: M.detail.title }; M.fq = 'all'; loadRel(); nav(); paintMain(); return true; }
  if (a === 'mdel') {
    const x = M.detail; if (!x || !confirm(`Slette filen til «${x.title}»?\nFilmen slutter å overvåkes, så den ikke lastes ned igjen med en gang.`)) return true;
    try { const r = await mapi(`/movies/${x.id}/file`, { method: 'DELETE' }); undoToast(r?.message ?? `Filen til «${x.title}» er slettet`, () => (r?.undo?.path ? mapi(r.undo.path.replace(/^\/api\/media/, ''), { method: r.undo.method ?? 'PUT', json: r.undo.body ?? { monitored: true } }) : mapi(`/movies/${x.id}`, { method: 'PUT', json: { monitored: true } }))); M.mov = null; loadDetail(); }
    catch (e) { toast(e.status === 404 ? 'Serveren kan ikke slette filer ennå.' : e.status === 403 ? 'Bare admin kan slette filer.' : e.message); }
    return true;
  }
  if (a === 'relagain') { loadRel(true); return true; }
  if (a === 'relstop') { M.job?.es?.close?.(); const id = M.job?.id; M.job = null; if (id) mapi(`/release/search/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}); M.rel = { error: 'Søket ble avbrutt.' }; paintMain(); return true; }
  if (a === 'undo') { const f = M.undo?.fn; M.undo = null; clearTimeout(undoT); paintToast(); if (f) { try { await f(); toast('Angret · overvåkes igjen'); loadDetail(); } catch (e) { toast(e.message); } } return true; }
  return false;
}
let undoT = 0;
/** Toast med «Angre» i 5 s. */
function undoToast(text, fn) { clearTimeout(toastT); clearTimeout(undoT); M.toast = ''; M.undo = { text, fn }; paintToast(); undoT = setTimeout(() => { M.undo = null; paintToast(); }, 5000); }
async function delFiles(eps, label) {
  if (!confirm(`Slette ${label}?\nOvervåkingen slås av, så de ikke lastes ned igjen med en gang.`)) return;
  try {
    for (const ep of eps) await mapi(`/episodes/${ep.id}/file`, { method: 'DELETE' }); // slår også av overvåkingen (SERVER44)
    undoToast(`Slettet ${label}`, async () => { for (const ep of eps) await mapi(`/episodes/${ep.id}`, { method: 'PUT', json: { monitored: true } }); });
    M.ser = null; loadDetail();
  } catch (e) { toast(e.status === 404 ? 'Serveren kan ikke slette filer ennå.' : e.status === 403 ? 'Bare admin kan slette filer.' : e.message); }
}

/* ---------------- Hendelser ---------------- */

function bind(r) {
  r.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.matches?.('[data-m43-shbg]')) return closeSheet();
    outside70(t); // prompt 70: lukk ⋯-meny og varsel-lista ved klikk utenfor
    const b = t.closest('button,a[data-m43]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (await click50(b)) return; // prompt 50: Start / Søk igjen / Innstillinger → Media i statuslinja
    if (d.m43Tab) return goTab(d.m43Tab);
    if (await act44(b, d)) return; // prompt 44
    if (await act70(b, d)) return; // prompt 70: kalenderuker, filtre, avkrysning, ⋯-menyer, varsler
    if (d.m45Unmon) { // prompt 45: slett uovervåkede
      const v = d.m45Unmon, film = v === 'movie' || (v === 'all' && M.bibK === 'm');
      const q = { service: film ? 'radarr' : 'sonarr', server: M.site ?? undefined };
      if (v === 'series' || v.startsWith('season:')) { q.seriesId = M.detail?.id; q.label = M.detail?.title; if (v.startsWith('season:')) { q.season = +v.slice(7); q.label = `${M.detail?.title} · sesong ${q.season}`; } }
      else if (v === 'movie') { q.movieId = M.detail?.id; q.label = M.detail?.title; }
      else q.label = film ? 'alle filmer' : 'alle serier';
      import('./media45.js').then((m) => m.openUnmonitored(q, () => { if (M.det) openDet(M.det.k, M.det.id, true); else { M.ser = M.mov = null; enterTab(); paint(); } }));
      return;
    }
    if (d.m43Open) { const [k, id] = d.m43Open.split(':'); return openDet(k, id); }
    if (d.m43Libf) { M.libF = d.m43Libf; return paintMain(); }
    if (d.m43Seg) { M.seg = d.m43Seg; return paintMain(); }
    if (d.m43Fq) { M.fq = d.m43Fq; return paintMain(); }
    if (d.m43Grab) return grab(d.m43Grab);
    if (d.m43Glgrab != null) { const x = (M.gl?.res?.results ?? []).filter((y) => y.kind === 'release')[+d.m43Glgrab]; if (!x) return; try { const j = await mapi('/release', { method: 'POST', json: x.action?.body ?? { guid: x.release.guid, indexerId: x.release.indexerId, service: 'sonarr' } }); M.grab[`gl:${x.release.guid}`] = true; toast(j.message ?? 'Sendt til qBittorrent'); } catch (er) { toast(er.message); } return paintGl(); }
    if (d.m43Glact != null) return glAct(+d.m43Glact);
    if (d.m43Edit) { if (d.m43Edit === 'mmon') return patchDet({ monitored: !M.detail?.monitored }, M.detail?.monitored ? 'Ikke overvåket' : 'Overvåket'); M.sh = 'edit'; M.edit = d.m43Edit; loadProf(); return paintSheet(); }
    if (d.m43Eopt != null) { const f = M.edit, v = d.m43Eopt, L = f === 'prof' ? null : listOf(f); const n = L ? (L.find((x) => x[0] === v)?.[1] ?? v) : v; const json = f === 'prof' ? { profile: v } : f === 'mon' ? { monitor: v } : f === 'typ' ? { seriesType: v } : { minimumAvailability: v }; return patchDet(json, `${{ prof: 'Profil', mon: 'Overvåking', typ: 'Serietype', av: 'Tilgjengelighet' }[f]}: ${n}`); }
    if (d.m43Setog) { const k = `${M.detail.id}-${d.m43Setog}`, se = M.detail.seasons?.find((x) => String(x.number) === d.m43Setog), cur = M.open[k] ?? (M.detail.seasons?.[0] === se); M.open[k] = !cur; return paintMain(); }
    if (d.m43Semon) { const se = M.detail.seasons.find((x) => String(x.number) === d.m43Semon); return patchDet({ seasons: [{ number: se.number, monitored: !se.monitored }], episodes: se.episodes.map((x) => ({ id: x.id, monitored: !se.monitored })) }, !se.monitored ? `${se.label} overvåkes` : `${se.label} overvåkes ikke`); }
    if (d.m43Epmon) { const ep = M.detail.seasons.flatMap((x) => x.episodes).find((x) => String(x.id) === d.m43Epmon); try { await mapi(`/episodes/${ep.id}`, { method: 'PUT', json: { monitored: !ep.monitored } }); ep.monitored = !ep.monitored; } catch (er) { toast(er.message); } return paintMain(); }
    if (d.m43Sesearch) return cmd({ name: 'SeasonSearch', seriesId: M.detail.id, seasonNumber: +d.m43Sesearch }, `se${d.m43Sesearch}`, `Søker etter sesong ${d.m43Sesearch} …`);
    if (d.m43Epauto) return cmd({ name: 'EpisodeSearch', episodeIds: [+d.m43Epauto] }, `ep${d.m43Epauto}`);
    if (d.m43Epint) { const ep = M.detail.seasons.flatMap((x) => x.episodes).find((x) => String(x.id) === d.m43Epint); M.srch = { k: 's', id: M.detail.id, episodeId: ep.id, backL: M.detail.title }; M.fq = 'all'; loadRel(); nav(); return paintMain(); }
    if (d.m43Ttog) { const x = (M.tor?.items ?? []).find((y) => y.hash === d.m43Ttog); return tor(d.m43Ttog, x?.status === 'pause' ? 'resume' : 'pause'); }
    if (d.m43Tmore) { M.sh = 'act'; M.act = d.m43Tmore; M.files = null; paintSheet(); try { M.files = await mapi(`/torrents/${d.m43Tmore}/files`); } catch (er) { M.files = { error: er.message }; } return paintSheet(); }
    if (d.m43Tdel) { M.sh = 'del'; M.act = d.m43Tdel; return paintSheet(); }
    if (d.m43Top) { const h = M.act, op = d.m43Top; if (op === 'tog') { const x = (M.tor?.items ?? []).find((y) => y.hash === h); await tor(h, x?.status === 'pause' ? 'resume' : 'pause'); } else if (op === 'force') await tor(h, 'forceStart', { value: true }); else if (op === 'check') await tor(h, 'recheck'); else await tor(h, 'priority', { dir: op }); return paintSheet(); }
    if (d.m43Del != null) { const h = M.act, files = d.m43Del === '1'; try { const j = await mapi(`/torrents/${h}?files=${files ? 1 : 0}`, { method: 'DELETE' }); toast(j.message ?? 'Slettet'); } catch (er) { toast(er.message); } M.sh = null; M.tor = await mapi('/torrents?filter=all').catch(() => M.tor); return paint(); }
    if (d.m43File != null) { const F = M.files, f = F?.items?.find((x) => String(x.index) === d.m43File); if (!f) return; f.wanted = !f.wanted; paintSheet(); try { M.files = await mapi(`/torrents/${M.act}/files`, { method: 'POST', json: { files: [{ index: f.index, priority: f.wanted ? 1 : 0 }] } }); } catch (er) { f.wanted = !f.wanted; toast(er.message); } return paintSheet(); }
    if (d.m43Mcat != null) { M.mag.cat = d.m43Mcat; return paintSheet(); }
    if (d.m43Mt) { M.mag[d.m43Mt] = !M.mag[d.m43Mt]; return paintSheet(); }
    if (d.m43Itype) { M.ix.type = d.m43Itype; M.ix.list = null; paintSheet(); return ixSchema(); }
    if (d.m43Ipick != null) { const x = M.ix.list?.items?.[+d.m43Ipick]; if (!x || x.added) return; M.ix.sel = x; M.ix.f = {}; M.ix.err = ''; return paintSheet(); }
    if (d.m43Ipri) { M.ix.pri = +d.m43Ipri; return paintSheet(); }
    if (d.m43Isync) { M.ix[d.m43Isync] = !M.ix[d.m43Isync]; return paintSheet(); }
    if (d.m43Itest) return testIdx(d.m43Itest);
    if (d.m43Sync) { try { const j = await mapi(`/apps/${d.m43Sync}/sync`, { method: 'POST' }); toast(j.message ?? 'Synker …'); } catch (er) { toast(er.message); } return; }
    if (d.m43Apick != null) { const x = M.add.list?.[+d.m43Apick]; if (!x) return; if (x.exists && x.id) { const k = M.add.k; closeSheet(); return openDet(k, x.id); } M.add.sel = x; loadProf(); return paintSheet(); }
    if (d.m43Aprof) { M.add.prof = d.m43Aprof; return paintSheet(); }
    if (d.m43Amon) { M.add.mon = d.m43Amon; return paintSheet(); }
    if (d.m43Atyp) { M.add.typ = d.m43Atyp; return paintSheet(); }
    if (d.m43Aav) { M.add.av = d.m43Aav; return paintSheet(); }
    if (d.m43Pref) { const p = M.prefs ?? {}; return setPref(d.m43Pref, !(p[d.m43Pref] !== false)); }
    if (d.m43Player) return setPref('player', d.m43Player);
    if (d.m43Acc) { const u = M.access?.users?.find((x) => x.id === d.m43Acc); if (!u) return; u.allowed = !u.allowed; paintSheet(); try { await mapi('/access', { method: 'PUT', json: { userId: u.id, allowed: u.allowed } }); } catch (er) { u.allowed = !u.allowed; toast(er.message); paintSheet(); } return; }
    const a = d.m43;
    if (!a) return;
    if (a === 'close') return close();
    // Prompt 45 (claude-code-innstillinger-samlet.md): innstillingene for Media ligger i Innstillinger → Media.
    if (a === 'set') { import('./settings.js').then((m) => m.openSettings('media')).catch(() => { location.hash = '#/innstillinger/media'; }); return; }
    if (a === 'set43') { M.sh = 'set'; paintSheet(); loadStatus().then(() => { if (M.status?.admin && !M.access) mapi('/access').then((j) => { M.access = j; paintSheet(); }).catch((er) => { M.access = { error: er.message }; paintSheet(); }); }); return; }
    if (a === 'shclose') return closeSheet();
    if (a === 'glclose') { M.gl = null; M.gq = ''; return paint(); }
    if (a === 'retry') { M.up = M.ser = M.mov = M.tor = M.idx = null; enterTab(); if (M.det) loadDetail(); if (M.srch) loadRel(); return paint(); }
    if (a === 'integ') return openIntegrations();
    if (a === 'cal') { const on = (M.prefs ?? M.status?.settings ?? {}).calendar !== false; if (!on) return toast('Slå på «Vis i Kalender» i innstillingene for Media'); location.hash = '#/kalender'; return; }
    if (a === 'pauseall') return allToggle();
    if (a === 'alt') { try { const tr = await mapi('/altSpeed', { method: 'POST', json: { on: !M.tor?.transfer?.altSpeed } }); if (M.tor) M.tor.transfer = tr; toast(tr.altSpeed ? `Alt-hastighet på${tr.altLimitText ? ` · ${tr.altLimitText}` : ''}` : 'Alt-hastighet av'); } catch (er) { toast(er.message); } return paintMain(); }
    if (a === 'avback') return goTab('ov');
    if (a === 'detback') return back(() => { M.det = null; M.detail = null; enterTab(); paint(); });
    if (a === 'srback') return back(() => { M.srch = null; M.rel = null; M.job = null; paint(); });
    if (a === 'sall') { const ids = (M.detail?.seasons ?? []).flatMap((s) => s.episodes).filter((x) => x.canSearch).map((x) => x.id); if (ids.length) return cmd({ name: 'EpisodeSearch', episodeIds: ids }, 'sall', `Søker etter ${ids.length} manglende episoder …`); return; }
    if (a === 'mauto') return cmd({ name: 'MoviesSearch', movieIds: [M.detail.id] }, 'mauto');
    if (a === 'minter') { M.srch = { k: 'm', id: M.detail.id, backL: M.detail.title }; M.fq = 'all'; loadRel(); nav(); return paintMain(); }
    if (a === 'add') { const k = M.bibK === 'm' ? 'm' : 's'; M.sh = 'add'; M.add = { k, q: '', list: null, sel: null, prof: k === 's' ? M.prof?.defaults?.sonarr ?? 'HD-1080p' : M.prof?.defaults?.radarr ?? 'Ultra-HD', mon: 'all', typ: 'standard', av: 'released', go: true }; Promise.resolve(loadProf()).then(() => { if (M.add && !M.add.sel) { const dflt = k === 's' ? M.prof?.defaults?.sonarr : M.prof?.defaults?.radarr; if (dflt) M.add.prof = dflt; } }); paintSheet(); root.querySelector('[name="aq"]')?.focus(); return; }
    if (a === 'ago') { M.add.go = !M.add.go; return paintSheet(); }
    if (a === 'aback') { M.add.sel = null; return paintSheet(); }
    if (a === 'aok') return addOk();
    if (a === 'mag') { M.sh = 'mag'; M.mag = { q: '', cat: '', paused: false, sequential: false, firstLast: false, check: null, err: '' }; paintSheet(); root.querySelector('[name="mq"]')?.focus(); return; }
    if (a === 'paste') { try { const tx = await navigator.clipboard.readText(); M.mag.q = (tx || '').trim(); paintSheet(); magCheck(); } catch { toast('Fikk ikke lest utklippstavlen · lim inn selv'); } return; }
    if (a === 'magadd') return magAdd();
    if (a === 'maghandler') { try { navigator.registerProtocolHandler('magnet', `${location.origin}/#/media?magnet=%s`); toast('Nettleseren spør om Homelab skal åpne magnet-lenker'); } catch (er) { toast(`Nettleseren tillot det ikke: ${er.message}`); } return; }
    if (a === 'todel') { M.sh = 'del'; return paintSheet(); }
    if (a === 'testall') { M.busy.testall = true; paintMain(); try { const j = await mapi('/indexers/testall', { method: 'POST' }); (j.items ?? []).forEach((x) => { M.idxT[x.id] = x; }); toast(j.text ?? 'Testet alle'); } catch (er) { toast(er.message); } M.busy.testall = false; return loadIdx(); }
    if (a === 'ixadd') { M.sh = 'ix'; M.ix = { q: '', type: 'all', list: null, sel: null, f: {}, pri: 25, sonarr: true, radarr: true, err: '' }; paintSheet(); ixSchema(); root.querySelector('[name="iq"]')?.focus(); return; }
    if (a === 'iback') { M.ix.sel = null; M.ix.err = ''; return paintSheet(); }
    if (a === 'isave') return ixSave();
  });
  r.addEventListener('submit', (e) => { if (!e.target.matches('[data-m43-glf]')) return; e.preventDefault(); glimt(M.gq); });
  r.addEventListener('input', (e) => {
    const n = e.target.name;
    if (n === 'gq') M.gq = e.target.value;
    if (n === 'lq') { M.libQ = e.target.value; paintMain(); }
    if (n === 'bsort') { setBibSort70(e.target.value); paintMain(); }
    if (n === 'aq' && M.add) { M.add.q = e.target.value; clearTimeout(lookT); lookT = setTimeout(lookup, 300); }
    if (n === 'mq' && M.mag) { M.mag.q = e.target.value; M.mag.err = ''; clearTimeout(magT); magT = setTimeout(magCheck, 250); }
    if (n === 'iq' && M.ix) { M.ix.q = e.target.value; clearTimeout(schT); schT = setTimeout(ixSchema, 300); }
    if (n?.startsWith('if_') && M.ix) M.ix.f[n.slice(3)] = e.target.value;
  });
  if (!keyBound) { keyBound = true; document.addEventListener('keydown', onKey, true); }
}
let keyBound = false;
function onKey(e) {
    // Prompt 44: «/» setter fokus i søket i biblioteket (Serier/Filmer).
    if (e.key === '/' && root?.isConnected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '') && !M.sh) { const i = root.querySelector('[name="lq"]'); if (i) { e.preventDefault(); i.focus(); return; } }
    // Prompt 70: ⌘K / Ctrl+K setter fokus i Spør Glimt.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key?.toLowerCase() === 'k' && root?.isConnected && !M.sh && !document.querySelector('#settings:not([hidden])')) { const i = root.querySelector('[name="gq"]'); if (i) { e.preventDefault(); e.stopPropagation(); i.focus(); i.select(); return; } }
    if (e.key !== 'Escape' || !root?.isConnected || document.querySelector('#settings:not([hidden]),.ac-ov,.gi44-list:not([hidden])')) return;
    e.preventDefault(); e.stopPropagation();
    if (M.srvOpen) { M.srvOpen = false; return paintTop(); }
    if (!M.sh && esc70()) return;
    if (document.activeElement?.name === 'lq' && M.libQ) { M.libQ = ''; return paintMain(); }
    if (M.sh) return closeSheet();
    if (M.gl) { M.gl = null; return paint(); }
    if (M.srch) return back(() => { M.srch = null; M.job = null; paint(); });
    if (M.det) return back(() => { M.det = null; enterTab(); paint(); });
    close();
}

/* ---------------- Rute ---------------- */

function applyTheme() {
  if (!root) return;
  // Prompt 44: følger web-modusen (Innstillinger → Utseende → Lys og mørk). «Nåværende» er alltid mørk.
  const hl = document.documentElement.dataset.hl, dm = document.documentElement.getAttribute('data-mode');
  const dark = hl !== '2c' || dm === 'dark';
  root.classList.toggle('dk', dark);
}
let themeBound = false;
export function render() {
  setTimeout(() => {
    const r = document.getElementById('m43');
    if (!r || r.dataset.bound) return;
    r.dataset.bound = '1'; root = r;
    applyTheme();
    if (!themeBound) { themeBound = true; addEventListener('papir-web-mode', applyTheme); document.addEventListener('hl:theme', applyTheme); }
    bind(r);
    wasNarrow = narrow();
    const onRz = () => { if (!root?.isConnected) { removeEventListener('resize', onRz); return; } if (narrow() !== wasNarrow) { wasNarrow = narrow(); paintMain(); } };
    addEventListener('resize', onRz);
    // #/media?tab=qb, ?magnet=… (registerProtocolHandler) eller ?open=sonarr:12
    const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const tab = SLUG_TAB[q.get('tab') ?? ''];
    if (tab) M.tab = tab;
    // Prompt 44: adressen bestemmer visningen (#/media/sonarr/s/12/sok …), også ved oppfrisking og direkte lenke.
    if (!applyHash()) { M.det = null; M.srch = null; }
    const op = q.get('open'); if (op) { const [svc, id] = op.split(':'); if (id) { openDet(svc === 'radarr' || svc === 'm' ? 'm' : 's', id, true); nav(true); } }
    const mg = q.get('magnet'); if (mg) { M.tab = 'ned'; M.det = null; M.srch = null; M.sh = 'mag'; M.mag = { q: decodeURIComponent(mg), cat: '', paused: false, sequential: false, firstLast: false, check: null, err: '' }; setTimeout(magCheck, 50); }
    M.missing = false; M.restricted = '';
    mapi('/status').then((s) => { M.status = s; M.prefs = s.settings ?? null; }).catch(() => {}).finally(() => paint());
    enterTab(); poll(); paint(); nav(true);
    if (!r.contains(document.activeElement)) r.focus({ preventScroll: true });
  });
  return `<div id="m43" class="m43 m70" tabindex="-1" aria-label="Media"><div data-m43-top></div><div data-m43-gl></div><div class="m43-main" data-m43-main></div><div data-m43-toast></div><div data-m43-sh></div></div>`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && root?.isConnected) { enterTab(); poll(); } });

// Prompt 44 (claude-code-web-tab-godta-forslag.md): forslag i Glimt-feltet fra biblioteket.
glimtSource('media', () => {
  const T = [...(M.ser?.items ?? []), ...(M.mov?.items ?? [])].map((x) => x.title).filter(Boolean).slice(0, 60);
  const U = (M.up?.items ?? []).map((x) => x.title).filter(Boolean);
  return [...T.flatMap((t) => [`finn ${t}`, `hvor langt har ${t} kommet`, `last ned ${t} på nytt`]), ...U.map((t) => `når kommer ${t}`)];
});
