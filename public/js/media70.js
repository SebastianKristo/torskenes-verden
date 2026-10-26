// Prompt 70 (MEDIA70, claude-code-media-web-nytt-design.md): Media på web i nytt design. Fasit: Media Web.dc.html (pakke 54).
// Fire faner som egne adresser: #/media (Oversikt), #/media/kalender, #/media/bibliotek[/filmer], #/media/nedlastinger.
// media43.js eier tilstanden (M), datakallene, arkene (legg til, magnet, indekser, torrent-valg), seriesiden og interaktivt søk;
// her tegnes de fire sidene og topplinja, og handlingene som er nye i designet håndteres (act70).
// Data er ekte verdier fra /api/media/* (Sonarr, Radarr, qBittorrent, Prowlarr) og /api/playback/sessions (Plex, Jellyfin).
//   Nytt på serveren (små lesefelt): GET /api/media/upcoming?days=7&from=YYYY-MM-DD (bla i uker), torrent.ratio, serie.nextAiring/added, film.added.
// Fartsgrafen (siste 2 t, 48 søyler à 2,5 min) bygges i nettleseren av målingene siden får (qBittorrent har ingen historikk).
import { esc } from './util.js';
import { bg50, img50 } from './media50.js';

let C = null; // fra media43.js: { M, mapi, paint, paintMain, paintTop, toast, cmd, openDet, nav, tor, loadTor, loadUp, loadSer, loadMov, loadIdx, isAdm, tone, errBox, emptySvc, skel, confOff, norm44, prefetch50, narrow, ic }
const lsg = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lss = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat vindu */ } };
const S = {
  wk: 0, calDay: null, cal: null, calKey: '', calBusy: false,
  nF: 'all', nSort: lsg('media70_nsort', 'new') === 'big' ? 'big' : 'new', sel: {}, showAll: false,
  menu: null, alerts: false, pb: null, now: null, hist: null, pbAt: 0,
  bibSort: { s: lsg('media70_bsort_s', 'next'), m: lsg('media70_bsort_m', 'title') },
};
export function init70(ctx) { C = ctx; }
export const state70 = S;

/* ---------------- Hjelpere ---------------- */

const DAYS = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const DAYS_L = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const nb = (n, d = 0) => (+n || 0).toLocaleString('nb-NO', { maximumFractionDigits: d });
function bytes(b) {
  b = +b || 0;
  if (b >= 1e12) return `${nb(b / 1e12, 2)} TB`;
  if (b >= 1e9) return `${nb(b / 1e9, 1)} GB`;
  return `${nb(b / 1e6)} MB`;
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dOf = (s) => new Date(`${s}T12:00:00`);
const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function monday(off = 0) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d; }
function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); }
const rangeTxt = (a, b) => (a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${MON[a.getMonth()]}` : `${a.getDate()}. ${MON[a.getMonth()]} – ${b.getDate()}. ${MON[b.getMonth()]}`);
const plural = (n, one, many) => `${nb(n)} ${n === 1 ? one : many}`;
/** «I dag 02:14», «I går 01:55», «Lør 01:04», ellers «12. okt». */
function whenTxt(iso) {
  if (!iso) return '';
  const d = new Date(iso), t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = Math.floor((t0 - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return `I dag ${hm(d)}`;
  if (days === 1) return `I går ${hm(d)}`;
  if (days < 7) return `${DAYS[d.getDay()]} ${hm(d)}`;
  return `${d.getDate()}. ${MON[d.getMonth()].slice(0, 3)}`;
}
const ageDays = (iso) => { if (!iso) return 9999; const d = new Date(iso), t0 = new Date(); t0.setHours(0, 0, 0, 0); return Math.floor((t0 - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000); };
const openAttr = (x) => {
  const o = x?.open; if (o?.id == null) return '';
  return ` data-m43-open="${o.tab === 'radarr' ? 'm' : 's'}:${+o.id}"`;
};
/** Plakatflate: ThumbHash/farge med én gang, <img srcset> når serveren har bildet, tittelen på flaten når det ikke finnes noe bilde. */
function art70(x, cls, sizes, label = '', sub = '') {
  const has = !!(x?.posterImg?.url || x?.poster);
  return `<span class="${cls} m50-ph" style="${bg50(x)}" aria-hidden="true">${img50(x, { sizes })}${!has && (label || sub) ? `<span class="m70-pa">${sub ? `<i>${esc(sub)}</i>` : ''}${label ? `<b>${esc(label)}</b>` : ''}</span>` : ''}</span>`;
}
function play70(title) {
  const p = C?.M.status?.play;
  if (!p?.url) return null;
  return { url: p.url + encodeURIComponent(title ?? ''), name: p.player === 'plex' ? 'Plex' : 'Jellyfin' };
}
const icPlay = (n = 12) => `<svg aria-hidden="true" width="${n}" height="${n}" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>`;
const icMore = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
const icPause = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M9 5v14M15 5v14"/></svg>';
const icTrash = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
const icCheck = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
const chev = (d) => `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}"/></svg>`;
const sec = (cls, inner, attrs = '') => `<section class="m70-card ${cls}"${attrs}>${inner}</section>`;
const loading = (h) => `<div class="m70-skel" style="min-height:${h}px"></div>`;

/* ---------------- Data som bare de nye sidene trenger ---------------- */

async function loadPb() {
  try {
    const r = await fetch('/api/playback/sessions?server=all', { credentials: 'same-origin', cache: 'no-store' });
    S.pb = r.ok ? await r.json() : { error: r.status };
  } catch { S.pb = { error: 'nett' }; }
  S.pbAt = Date.now(); C?.paintMain();
}
async function loadNow() { try { S.now = await C.mapi('/now'); } catch { S.now = null; } C?.paintMain(); }
async function loadHist() { try { S.hist = await C.mapi('/history'); } catch { S.hist = null; } C?.paintMain(); }
export async function loadCal(force = false) {
  const from = ymd(monday(S.wk)), key = `${C.M.site ?? ''}|${from}`;
  if (!force && S.cal && S.calKey === key && !S.cal.error) return;
  if (S.calKey !== key) S.cal = null;
  S.calKey = key; S.calBusy = true; C.paintMain();
  try { const r = await C.mapi(`/upcoming?days=7&from=${from}`); if (S.calKey === key) S.cal = r; }
  catch (e) { if (S.calKey === key) S.cal = { error: e.message }; }
  S.calBusy = false; C.paintMain();
}
/** Kalles når en fane åpnes (media43 enterTab) og fra pollingen. */
export function enter70(tab, tick = false) {
  if (!C) return;
  if (tab === 'ov') {
    if (!tick || Date.now() - S.pbAt > 25_000) loadPb();
    if (!tick) { loadNow(); loadHist(); }
  }
  if (tab === 'kal') loadCal(tick);
}
export function resetSite70() { S.cal = null; S.calKey = ''; S.sel = {}; S.menu = null; }

/* ---------------- Fartsgraf (siste 2 t) ---------------- */

const SLOT = 150_000, NSLOT = 48;
let lastTor = null;
function sparkKey() { return `media70_spark:${C?.M.site ?? 'std'}`; }
function sparkRead() { try { const a = JSON.parse(lsg(sparkKey(), '[]')); return Array.isArray(a) ? a : []; } catch { return []; } }
/** Lagrer høyeste nedlastingsfart per 2,5-minutters spor når nye tall fra qBittorrent kommer. */
function sparkSample(T) {
  if (!T?.transfer || T === lastTor) return;
  lastTor = T;
  const now = Date.now(), slot = Math.floor(now / SLOT), dl = +T.transfer.dlSpeed || 0;
  const a = sparkRead().filter((x) => Array.isArray(x) && x[0] > slot - NSLOT);
  const cur = a.find((x) => x[0] === slot);
  if (cur) { cur[1] = Math.max(cur[1], dl); cur[2] = cur[1] === dl ? now : cur[2]; } else a.push([slot, dl, now]);
  lss(sparkKey(), JSON.stringify(a));
}
function sparkHtml(T) {
  sparkSample(T);
  const a = sparkRead(), slot = Math.floor(Date.now() / SLOT);
  const by = new Map(a.map((x) => [x[0], x]));
  const vals = Array.from({ length: NSLOT }, (_, i) => by.get(slot - NSLOT + 1 + i) ?? null);
  const max = Math.max(1, ...vals.map((v) => v?.[1] ?? 0));
  const top = vals.reduce((b, v) => (v && (!b || v[1] > b[1]) ? v : b), null);
  const bars = vals.map((v, i) => {
    const h = v ? Math.max(4, Math.round((v[1] / max) * 100)) : 4;
    const c = i === NSLOT - 1 ? 'now' : v?.[1] ? 'on' : 'off';
    return `<span class="${c}" style="height:${h}%"></span>`;
  }).join('');
  const has = vals.filter(Boolean).length;
  const mid = top?.[1] ? `topp ${esc(speed(top[1]))} kl. ${hm(top[2])}` : has < 3 ? 'måles mens siden er åpen' : 'ingen nedlasting';
  return `<div class="m70-spark" role="img" aria-label="Nedlastingsfart siste 2 timer, ${esc(mid)}">${bars}</div>
    <div class="m70-spl"><span>for 2 t siden</span><span>${mid}</span><span>nå</span></div>`;
}
const speed = (b) => (b >= 1048576 ? `${nb(b / 1048576, 1)} MB/s` : b > 0 ? `${nb(b / 1024)} kB/s` : '0 MB/s');

/* ---------------- Topplinja ---------------- */

const TABS70 = [['ov', 'Oversikt'], ['kal', 'Kalender'], ['bib', 'Bibliotek'], ['ned', 'Nedlastinger']];
const PH = { ov: 'Spør Glimt: «legg til Severance i 4K»', kal: 'Spør Glimt: «hva kommer på fredag?»', bib: 'Spør Glimt: «legg til Severance i 4K»', ned: 'Spør Glimt: «slett ferdige over 30 dager»', av: 'Spør Glimt: «hvem ser på noe nå?»' };
/** Varsler: tjenester som svarer ikke, helsemeldinger fra Prowlarr, nedlastinger som står fast og lite diskplass. */
function alerts70() {
  const M = C.M, L = [];
  for (const s of M.status?.services ?? []) if (s.configured && s.ok === false) L.push({ t: `${s.name} svarer ikke${s.error ? `: ${s.error}` : ''}`, go: ['sonarr', 'radarr'].includes(s.id) ? 'bib' : 'ned' });
  for (const h of M.idx?.health ?? []) L.push({ t: `Prowlarr: ${h.message}`, go: 'ned' });
  const st = (M.tor?.items ?? []).filter((t) => t.status === 'stall' || t.status === 'error');
  if (st.length) L.push({ t: `${plural(st.length, 'nedlasting står', 'nedlastinger står')} fast`, go: 'ned', f: 'stuck' });
  if (M.disk?.low) L.push({ t: M.disk.lowText || 'Lite diskplass igjen', go: 'ned' });
  return L;
}
export function top70(srvHtml, orb) {
  const M = C.M, cur = M.tab === 'av' ? 'ov' : M.tab;
  const tabs = TABS70.map(([k, n]) => `<button type="button" class="m70-tab${cur === k ? ' on' : ''}" data-m43-tab="${k}" aria-current="${cur === k ? 'page' : 'false'}">${n}</button>`).join('');
  const A = alerts70();
  const al = `<div class="m70-alw"><button type="button" class="m70-alb" data-m70="alerts" aria-expanded="${S.alerts}" aria-haspopup="true"><span class="m70-dot ${A.length ? 'warn' : 'ok'}" aria-hidden="true"></span>${A.length ? plural(A.length, 'varsel', 'varsler') : 'Ingen varsler'}</button>${S.alerts ? `<div class="m70-alm" role="menu">${A.length ? A.map((a, i) => `<button type="button" role="menuitem" class="m70-ali" data-m70-al="${i}"><span class="m70-dot warn" aria-hidden="true"></span><span>${esc(a.t)}</span></button>`).join('') : '<span class="m70-mut m70-alx">Alt ser bra ut. Sonarr, Radarr, qBittorrent og Prowlarr svarer.</span>'}</div>` : ''}</div>`;
  return `<header class="m70-top"><div class="m70-tl">
    <button type="button" class="m70-back" data-m43="close" title="Lukk Media (Esc)">‹ Tilbake</button>
    <b class="m70-h">Media</b>
    <nav class="m70-tabs" aria-label="Media">${tabs}</nav>
    <form class="m70-gl" data-m43-glf role="search"><span class="m70-glo">${orb}</span><input name="gq" value="${esc(M.gq)}" placeholder="${esc(PH[M.tab] ?? PH.ov)}" aria-label="Spør Glimt" autocomplete="off"><span class="m70-kbd" aria-hidden="true">⌘K</span></form>
    ${srvHtml}${al}
    <button type="button" class="m70-ib" data-m43="set" aria-label="Innstillinger for Media" title="Innstillinger for Media">${C.ic.set}</button>
  </div></header>`;
}

/* ---------------- Oversikt ---------------- */

const svcOf = (id) => (C.M.status?.services ?? []).find((s) => s.id === id);
function servicesRows() {
  const M = C.M, rows = [];
  const base = (id) => { const s = svcOf(id); if (!s) return { st: 'mut', info: 'Henter …' }; if (!s.configured) return { st: 'mut', info: 'Ikke satt opp' }; if (s.ok === false) return { st: 'bad', info: s.error || 'Svarer ikke' }; return { st: 'ok', info: s.text || 'I orden' }; };
  // Sonarr
  let b = base('sonarr');
  if (b.st === 'ok' && M.ser?.items) { const miss = M.ser.counts?.missing ?? M.ser.items.filter((x) => x.episodes?.missing > 0).length; b.info = `${plural(M.ser.items.length, 'serie', 'serier')}${miss ? ` · ${miss} mangler episoder` : ' · komplett'}`; }
  rows.push(['Sonarr', b]);
  b = base('radarr');
  if (b.st === 'ok' && M.mov?.items) { const miss = M.mov.items.filter((x) => !x.hasFile && x.status === 'miss').length; b.info = miss ? `${plural(M.mov.items.length, 'film', 'filmer')} · ${miss} mangler` : 'I orden'; }
  rows.push(['Radarr', b]);
  b = base('qbittorrent');
  if (b.st === 'ok' && M.tor?.counts) { const c = M.tor.counts; b.info = `${nb(c.active)} aktive · ${nb(c.done)} ferdige${c.stalled ? ` · ${c.stalled} står fast` : ''}`; if (c.stalled) b.st = 'warn'; }
  rows.push(['qBittorrent', b]);
  b = base('prowlarr');
  if (b.st === 'ok' && M.idx?.summary) { const s = M.idx.summary, h = M.idx.health ?? []; b.info = `${nb(s.ok)}/${nb(s.total)} svarer${h.length ? ` · ${h.length === 1 ? '1 advarsel' : `${h.length} advarsler`}` : ''}`; if (h.length || s.ok < s.total) b.st = 'warn'; }
  rows.push(['Prowlarr', b]);
  for (const [id, name] of [['plex', 'Plex'], ['jellyfin', 'Jellyfin']]) {
    const s = svcOf(id), ns = (S.now?.servers ?? []).find((x) => x.src === id), ps = S.pb?.servers?.[id];
    const conf = !!(s?.configured || ns || ps?.connected), ok = !!(s?.ok || ns?.ok || ps?.connected);
    const L = (S.pb?.items ?? []).filter((x) => x.server === id), bw = L.reduce((a, x) => a + (+x.bitrate || 0), 0);
    const info = !conf ? 'Ikke satt opp' : !ok ? (s?.error || ns?.error || 'Svarer ikke') : L.length ? `${plural(L.length, 'strøm', 'strømmer')}${bw ? ` · ${nb(bw / 1000, 1)} Mbit/s` : ''}` : 'Ingen strømmer';
    rows.push([name, { st: !conf ? 'mut' : ok ? 'ok' : 'bad', info }]);
  }
  return rows;
}
function nowCard() {
  const P = S.pb, items = P?.items?.length ? P.items : (S.now?.items ?? []).map((n) => ({ server: n.src, title: n.title, subtitle: n.sub, user: n.user, device: n.device, decisionText: n.mode === 'transcode' ? 'Omkoder' : 'Direkte avspilling', chips: [n.quality].filter(Boolean), progress: n.pct, remainingText: n.leftMs ? `${Math.round(n.leftMs / 60000)} min igjen` : '', state: n.state, poster: n.poster }));
  if (!P && !S.now) return `<section class="m70-np empty" aria-label="Spilles nå">${loading(160)}</section>`;
  if (!items.length) return `<section class="m70-np empty" aria-labelledby="m70np"><h2 id="m70np" class="m70-npk">Spilles nå</h2><p class="m70-npe">Ingen ser på noe akkurat nå.</p><button type="button" class="m70-lnk inv" data-m43-tab="av">Historikk og statistikk ›</button></section>`;
  const x = items[0], srv = x.server === 'jellyfin' ? 'Jellyfin' : 'Plex';
  const pct = Math.max(0, Math.min(100, +x.progress || 0));
  const el = x.position ? `${Math.round(x.position / 60000)} min` : `${pct} %`;
  const sub = String(x.subtitle ?? '');
  const show = x.kind === 'episode' || / · /.test(String(x.title)) ? String(x.title).split(' · ')[0] : x.title;
  const epLine = sub || String(x.title).split(' · ').slice(1).join(' · ');
  const meta = [srv, x.decisionText, x.device, x.user].filter(Boolean).join(' · ');
  const more = items.length > 1 ? `<button type="button" class="m70-lnk inv" data-m43-tab="av">+ ${plural(items.length - 1, 'strøm', 'strømmer')} til ›</button>` : '<button type="button" class="m70-lnk inv" data-m43-tab="av">Avspilling ›</button>';
  return `<section class="m70-np" aria-labelledby="m70np">
    ${art70({ ...x, color: x.color && x.color !== '#e5a00d' && x.color !== '#7b4fd6' ? x.color : '#3C4A5C' }, 'm70-npa', '148px', show, x.kind === 'movie' ? 'Film' : srv)}
    <div class="m70-npb">
      <div class="m70-npm"><h2 id="m70np" class="m70-npk">Spilles nå${x.state === 'paused' ? ' · pauset' : ''}</h2><span>${esc(meta)}</span></div>
      <div><p class="m70-npt">${esc(show)}</p>${epLine ? `<p class="m70-nps">${esc(epLine)}</p>` : ''}</div>
      ${(x.chips ?? []).length ? `<div class="m70-chips">${x.chips.slice(0, 4).map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="m70-npp"><div class="m70-bar dk" role="progressbar" aria-label="Avspilt" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <div class="m70-npr"><span>${esc(el)}</span>${more}<span>${esc(x.remainingText ?? '')}</span></div></div>
    </div></section>`;
}
function statsRow() {
  const M = C.M, k = S.pb?.kpi, tr = M.tor?.transfer, c = M.tor?.counts;
  const week = Math.max(+k?.weekPlays || 0, (S.hist?.items ?? []).filter((x) => Date.now() - Date.parse(x.playedAt) < 7 * 86400000).length);
  const trans = (S.pb?.items ?? []).filter((x) => x.decision === 'transcode').length;
  const T = [
    ['Strømmer nå', k ? nb(k.streams) : '–', k ? `${trans} omkodes` : 'Plex og Jellyfin'],
    ['Båndbredde', k?.bandwidthText ?? '–', 'nå'],
    ['Sett denne uka', S.pb || S.hist ? nb(week) : '–', 'avspillinger'],
    ['Nedlastinger', tr?.dlText ?? '–', c ? `${nb((tr?.queued ?? 0) + (c.paused ?? 0))} i kø · ${nb(c.done)} ferdige` : 'qBittorrent'],
  ];
  return `<div class="m70-stats">${T.map(([l, v, s]) => `<div class="m70-stat"><div class="m70-mut m70-13">${esc(l)}</div><div class="m70-sv">${esc(v)}</div><div class="m70-mut m70-13">${esc(s)}</div></div>`).join('')}</div>`;
}
function readyList() {
  const M = C.M;
  const done = (M.tor?.items ?? []).filter((t) => t.done && t.completedAt).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  let L = done.filter((t) => ageDays(t.completedAt) <= 0), label = 'Lastet ned i dag';
  const seen = new Set(L.map((t) => `${t.title}|${t.code}`));
  for (const x of M.up?.items ?? []) if (x.status === 'ok' && x.date <= ymd(new Date()) && !seen.has(`${x.title}|${x.code}`)) { L.push({ ...x, fromCal: true }); seen.add(`${x.title}|${x.code}`); }
  if (!L.length) { L = done.filter((t) => ageDays(t.completedAt) <= 6); label = 'Lastet ned denne uka'; }
  return { L: L.slice(0, 6), label };
}
function readyHtml() {
  const { L, label } = readyList();
  if (!C.M.tor && !C.M.up) return loading(150);
  const card = (x) => {
    const p = play70(x.title), meta = x.fromCal ? [x.code, x.episodeTitle].filter(Boolean).join(' · ') : [x.code && x.code !== 'Film' ? x.code : 'Film', x.quality, x.sizeText].filter(Boolean).join(' · ');
    const t = openAttr(x) ? `<button type="button" class="m70-rt"${openAttr(x)}>${esc(x.title)}</button>` : `<span class="m70-rt">${esc(x.title)}</span>`;
    return `<div class="m70-rc">${art70(x, 'm70-rpa', '84px', x.title)}<div class="m70-rb">${t}<span class="m70-mut m70-13">${esc(meta)}</span>${p ? `<a class="m70-btn ink sm" href="${esc(p.url)}" target="_blank" rel="noopener">${icPlay()}Spill på ${esc(p.name)}</a>` : ''}</div></div>`;
  };
  return `<section class="m70-ready" aria-labelledby="m70rd"><div class="m70-sh"><h2 id="m70rd" class="m70-h2">Klar til å se</h2><button type="button" class="m70-lnk" data-m43-tab="ned">${esc(label)}</button></div>
    ${L.length ? `<div class="m70-rg">${L.map(card).join('')}</div>` : '<p class="m70-mut">Ingenting nytt er lastet ned de siste dagene.</p>'}</section>`;
}
function servicesHtml() {
  const rows = servicesRows(), ok = rows.filter(([, b]) => b.st === 'ok').length;
  const M = C.M, H = M.idx?.health ?? [], down = (M.status?.services ?? []).filter((s) => s.configured && s.ok === false);
  const upd = H.find((h) => /update/i.test(h.source ?? '') || /oppdater|update/i.test(h.message ?? ''));
  const pxUrl = svcOf('prowlarr')?.url;
  let warn = '';
  if (H.length || down.length) {
    const txt = down.length ? `<strong>${esc(down.map((s) => s.name).join(', '))}:</strong> svarer ikke. ${esc(down[0].error ?? '')}` : `<strong>Prowlarr:</strong> ${esc(H.slice(0, 2).map((h) => h.message).join(' · '))}`;
    warn = `<div class="m70-warn" role="status">${txt}<div class="m70-row g8 mt10"><button type="button" class="m70-btn wk sm" data-m43-tab="ned">Se kilder</button>${upd && pxUrl && C.isAdm() ? '<button type="button" class="m70-btn wl sm" data-m70="pxupd">Oppdater</button>' : ''}</div></div>`;
  }
  return sec('m70-svc', `<div class="m70-sh"><h2 class="m70-h2 s26">Tjenester</h2><span class="m70-mut m70-13">${ok} av ${rows.length} i orden</span></div>
    ${rows.map(([n, b]) => `<div class="m70-sr"><span class="m70-dot ${b.st}" aria-hidden="true"></span><span class="m70-sn">${esc(n)}</span><span class="m70-13 ${b.st === 'warn' || b.st === 'bad' ? 'm70-wt' : 'm70-mut'} m70-si">${esc(b.info)}</span></div>`).join('')}${warn}`, ' aria-label="Tjenester"');
}
function weekHtml() {
  const U = C.M.up;
  if (!U) return sec('', loading(200));
  if (U.error || C.confOff(U)) return sec('', `<h2 class="m70-h2 s26">Neste 7 dager</h2><p class="m70-mut">${esc(U.error ?? 'Sonarr og Radarr er ikke satt opp.')}</p>`);
  const days = U.days ?? [], max = Math.max(1, ...days.map((d) => d.items?.length ?? d.count ?? 0)), tot = days.reduce((a, d) => a + (d.items?.length ?? 0), 0);
  const cols = days.map((d, i) => { const n = d.items?.length ?? 0; return `<div class="m70-wc"><span class="m70-mono m70-12 m70-mut">${n}</span><div class="m70-wb${i === 0 ? ' now' : n ? '' : ' zero'}" style="height:${Math.max(4, Math.round((n / max) * 110))}px"></div></div>`; }).join('');
  const lab = days.map((d, i) => `<span class="${i === 0 ? 'now' : ''}">${esc(DAYS[dOf(d.date).getDay()])}</span>`).join('');
  return sec('', `<div class="m70-sh"><h2 class="m70-h2 s26">Neste 7 dager</h2><span class="m70-mut m70-13">${plural(tot, 'episode', 'episoder')}</span></div>
    <div class="m70-wk" role="img" aria-label="${esc(days.map((d) => `${DAYS[dOf(d.date).getDay()]} ${d.items?.length ?? 0}`).join(', '))}">${cols}</div><div class="m70-wl">${lab}</div>
    <button type="button" class="m70-btn line wide mt20" data-m43-tab="kal">Åpne kalenderen</button>`, ' aria-label="Neste 7 dager"');
}
export function ov70() {
  return `<div class="m70-cols"><div class="m70-main">${nowCard()}${statsRow()}${readyHtml()}</div><div class="m70-side">${servicesHtml()}${weekHtml()}</div></div>`;
}

/* ---------------- Kalender ---------------- */

const CAT = (x) => (x.monitored === false || x.status === 'off' ? 'off' : x.status === 'ok' ? 'ok' : x.status === 'miss' ? 'miss' : x.status === 'dl' ? 'dl' : 'wait');
const CAT_T = { ok: 'Lastet ned', wait: 'Venter', off: 'Ikke overvåket', miss: 'Mangler', dl: 'Lastes ned' };
function calRow(x, di) {
  const c = CAT(x), key = `${di}:${x.id}`, open = S.menu === key, adm = C.isAdm();
  const ep = x.kind === 'movie' ? `Film · ${x.episodeTitle || 'utgivelse'}` : [x.code, x.episodeTitle].filter(Boolean).join(' · ');
  const st = c === 'off' ? CAT_T.off : x.statusText || CAT_T[c];
  const menu = open ? `<div class="m70-menu" role="menu">
      <button type="button" role="menuitem"${openAttr(x)}>Åpne ${x.kind === 'movie' ? 'filmen' : 'serien'}</button>
      ${c !== 'ok' ? `<button type="button" role="menuitem" data-m70-cal="auto:${esc(x.id)}">Automatisk søk</button><button type="button" role="menuitem" data-m70-cal="int:${esc(x.id)}">Interaktivt søk</button>` : `<button type="button" role="menuitem" data-m70-cal="int:${esc(x.id)}">Last ned på nytt …</button>`}
      ${adm ? `<button type="button" role="menuitem" data-m70-cal="mon:${esc(x.id)}">${x.monitored === false ? 'Overvåk' : 'Ikke overvåk'}</button>` : ''}</div>` : '';
  return `<div class="m70-cr"><span class="m70-mono m70-13 m70-mut">${esc(x.time || (x.kind === 'movie' ? 'Film' : '–'))}</span>${art70(x, 'm70-cpa', '48px', x.title)}
    <div class="m70-mw0"><button type="button" class="m70-ct"${openAttr(x)}>${esc(x.title)}</button><div class="m70-13 m70-mut">${esc(ep)}</div></div>
    <div class="m70-row g8 m70-rel"><span class="m70-chip c-${c}">${esc(st)}</span><button type="button" class="m70-ib ghost" data-m70-menu="${esc(key)}" aria-label="Valg for ${esc(x.title)}" aria-expanded="${open}">${icMore}</button>${menu}</div></div>`;
}
export function kal70() {
  const D = S.cal, mo = monday(S.wk), su = new Date(mo); su.setDate(mo.getDate() + 6);
  const items = D?.items ?? (D?.days ?? []).flatMap((d) => d.items ?? []);
  const head = `<div class="m70-ph"><div><h1 class="m70-h1">Uke ${isoWeek(mo)}</h1><p class="m70-mut m70-sub">${esc(rangeTxt(mo, su))}${D && !D.error ? ` · ${plural(items.length, 'episode', 'episoder')}` : ''}</p></div>
    <div class="m70-row g8 xwrap"><button type="button" class="m70-rb44" data-m70="wkprev" aria-label="Forrige uke">${chev(-1)}</button><button type="button" class="m70-btn line" data-m70="wknow"${S.wk === 0 ? ' aria-pressed="true"' : ''}>I dag</button><button type="button" class="m70-rb44" data-m70="wknext" aria-label="Neste uke">${chev(1)}</button><button type="button" class="m70-btn line" data-m43="cal" title="Vis episodene i Kalender-appen">Vis i Kalender</button></div></div>`;
  if (!D) return head + loading(420);
  if (D.error) return head + C.errBox(D.error);
  if (C.confOff(D)) return head + C.emptySvc({ message: 'Sonarr og Radarr er ikke satt opp. Legg dem inn under Innstillinger → Integrasjoner → Media.' }, 'Media');
  // Eldre server uten ?from=: dagene starter i dag i stedet for mandag.
  const days = (D.days ?? []).map((d) => ({ ...d, items: d.items ?? [] }));
  const strip = `<div class="m70-days" role="tablist" aria-label="Dager">${days.map((d, i) => { const dt = dOf(d.date), on = S.calDay === i; return `<button type="button" role="tab" aria-selected="${on}" class="m70-day${on ? ' on' : ''}${d.today ? ' today' : ''}" data-m70-day="${i}"><span class="m70-13 b5">${DAYS[dt.getDay()]}</span><span class="m70-dn">${dt.getDate()}</span><span class="m70-dots">${d.items.slice(0, 10).map((x) => `<i class="c-${CAT(x)}"></i>`).join('')}</span></button>`; }).join('')}</div>`;
  const shown = S.calDay == null ? days.map((d, i) => [d, i]) : [[days[S.calDay], S.calDay]].filter(([d]) => d);
  const secs = shown.map(([d, i]) => `<section class="m70-cd"><div class="m70-cdh"><h2 class="m70-h2 s26">${esc(d.title ?? '')}</h2><span class="m70-13 m70-mut">${plural(d.items.length, 'episode', 'episoder')}</span>${d.today ? '<span class="m70-today">I dag</span>' : ''}</div>
    ${d.items.length ? d.items.map((x) => calRow(x, i)).join('') : '<p class="m70-mut mt16">Ingenting planlagt.</p>'}</section>`).join('');
  const n = { ok: 0, wait: 0, off: 0, miss: 0 };
  for (const x of items) { const c = CAT(x); n[c === 'dl' ? 'wait' : c]++; }
  const parts = [['ok', 'Lastet ned'], ['wait', 'Venter'], ['miss', 'Mangler'], ['off', 'Ikke overvåket']].filter(([k]) => k !== 'miss' || n.miss);
  const sum = sec('', `<h2 class="m70-h2 s24 mb16">Uka i tall</h2><div class="m70-stack" role="img" aria-label="${esc(parts.map(([k, l]) => `${n[k]} ${l.toLowerCase()}`).join(', '))}">${parts.filter(([k]) => n[k]).map(([k]) => `<div class="c-${k}" style="flex:${n[k]}"></div>`).join('') || '<div class="c-none" style="flex:1"></div>'}</div>
    <div class="m70-leg">${parts.map(([k, l]) => `<div><span class="m70-sq c-${k}" aria-hidden="true"></span>${l}<span class="m70-mono">${n[k]}</span></div>`).join('')}</div>`);
  const off = new Map();
  for (const x of items) if (CAT(x) === 'off') { const k = x.kind === 'movie' ? `m:${x.movieId}` : `s:${x.seriesId}`; const g = off.get(k) ?? { title: x.title, kind: x.kind, ids: [], open: x.open }; g.ids.push(x.kind === 'movie' ? x.movieId : x.episodeId); off.set(k, g); }
  const offH = sec('', `<h2 class="m70-h2 s24 mb6">Ikke overvåket</h2>${off.size ? '<p class="m70-mut m70-14 mb16">Disse lastes ikke ned automatisk.</p>' : ''}
    ${off.size ? [...off.entries()].map(([k, g]) => `<div class="m70-or"><span>${esc(g.title)} <span class="m70-mut m70-13">· ${g.kind === 'movie' ? 'film' : `${g.ids.length} ep.`}</span></span>${C.isAdm() ? `<button type="button" class="m70-btn line sm" data-m70-mon="${esc(k)}">Overvåk</button>` : ''}</div>`).join('') : '<p class="m70-mut m70-14">Alt denne uka overvåkes.</p>'}`);
  return `${head}${strip}<div class="m70-cols g32"><div class="m70-main g32">${secs}</div><aside class="m70-side g16">${sum}${offH}</aside></div>`;
}

/* ---------------- Bibliotek ---------------- */

const SORTS = { s: [['next', 'Neste episode'], ['title', 'Tittel'], ['added', 'Sist lagt til']], m: [['title', 'Tittel'], ['added', 'Sist lagt til'], ['size', 'Størst']] };
function nextBadge(x) {
  if (!x.nextAiring) return '';
  const t = Date.parse(x.nextAiring), d = new Date(t), days = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
  if (!Number.isFinite(t) || days < 0 || days > 6) return '';
  return days === 0 ? 'I dag' : DAYS[d.getDay()];
}
export function bib70() {
  const M = C.M, k = M.bibK === 'm' ? 'm' : 's', D = k === 's' ? M.ser : M.mov;
  const nS = M.ser?.items?.length, nM = M.mov?.items?.length;
  const seg = `<div class="m70-seg" role="tablist" aria-label="Type"><button type="button" role="tab" aria-selected="${k === 's'}" class="${k === 's' ? 'on' : ''}" data-m70-bib="s">Serier${nS != null ? ` <span class="m70-mut">${nb(nS)}</span>` : ''}</button><button type="button" role="tab" aria-selected="${k === 'm'}" class="${k === 'm' ? 'on' : ''}" data-m70-bib="m">Filmer${nM != null ? ` <span class="m70-mut">${nb(nM)}</span>` : ''}</button></div>`;
  const head = `<div class="m70-ph"><div class="m70-row g20 xwrap base"><h1 class="m70-h1">Bibliotek</h1>${seg}</div>
    <div class="m70-row g8 xwrap">${C.isAdm() ? `<button type="button" class="m70-btn line" data-m45-unmon="all" title="Slett filer som ikke er overvåket, på tvers av alle ${k === 's' ? 'serier' : 'filmer'}">Rydd uovervåkede</button>` : ''}<button type="button" class="m70-btn ink" data-m43="add">${k === 's' ? '+ Legg til serie' : '+ Legg til film'}</button></div></div>`;
  if (!D) return head + loading(420);
  if (D.error) return head + C.errBox(D.error);
  if (C.confOff(D)) return head + C.emptySvc(D, k === 's' ? 'Sonarr' : 'Radarr');
  const items = D.items ?? [];
  const fx = k === 's' ? { all: () => true, missing: (x) => x.episodes?.missing > 0, continuing: (x) => x.status === 'continuing', ended: (x) => x.status === 'ended' } : { all: () => true, has: (x) => x.hasFile, missing: (x) => !x.hasFile && x.status !== 'ann', announced: (x) => x.status === 'ann' };
  const filters = D.filters ?? Object.keys(fx).map((id) => ({ id, label: id, count: items.filter(fx[id]).length }));
  const q = C.norm44(M.libQ);
  let L = items.filter(fx[M.libF] ?? fx.all).filter((x) => !q || C.norm44(`${x.title} ${x.network ?? ''} ${x.year ?? ''} ${x.studio ?? ''}`).includes(q));
  // Neste episode: Sonarr sitt nextAiring, ellers første ventede episode i Kommer snart-dataene.
  if (k === 's') { const up = new Map(); for (const y of M.up?.items ?? []) if (y.kind === 'episode' && y.airUtc && y.status !== 'ok' && Date.parse(y.airUtc) > Date.now() && !up.has(y.seriesId)) up.set(y.seriesId, y.airUtc); L = L.map((x) => (x.nextAiring || !up.has(x.id) ? x : { ...x, nextAiring: up.get(x.id) })); }
  const so = S.bibSort[k];
  const tt = (x) => String(x.title ?? '').replace(/^The /, '');
  if (so === 'title') L = [...L].sort((a, b) => tt(a).localeCompare(tt(b), 'nb'));
  if (so === 'added') L = [...L].sort((a, b) => String(b.added ?? '').localeCompare(String(a.added ?? '')));
  if (so === 'size') L = [...L].sort((a, b) => (+b.file?.size || 0) - (+a.file?.size || 0));
  if (so === 'next') L = [...L].sort((a, b) => (a.nextAiring ? Date.parse(a.nextAiring) : Infinity) - (b.nextAiring ? Date.parse(b.nextAiring) : Infinity) || tt(a).localeCompare(tt(b), 'nb'));
  const sorts = SORTS[k];
  const bar = `<div class="m70-bbar"><label class="m70-q">${C.ic.search}<input type="search" name="lq" value="${esc(M.libQ)}" placeholder="Søk i ${nb(items.length)} ${k === 's' ? 'serier' : 'filmer'}" autocomplete="off" spellcheck="false" aria-label="Søk i biblioteket" data-glimt="off"></label>
    <div class="m70-row g6 xwrap">${filters.map((f) => `<button type="button" class="m70-fc${M.libF === f.id ? ' on' : ''}" aria-pressed="${M.libF === f.id}" data-m43-libf="${esc(f.id)}">${esc(f.label)} <span>${nb(f.count ?? 0)}</span></button>`).join('')}</div>
    <label class="m70-sort">Sorter<select name="bsort" aria-label="Sorter">${sorts.map(([v, n]) => `<option value="${v}"${so === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
  const card = (x, i) => {
    let note, pct, bad;
    if (k === 's') { const e = x.episodes ?? {}, miss = e.missing ?? 0; pct = e.total ? Math.round(((e.have ?? 0) / e.total) * 100) : 100; note = miss ? `${miss} mangler` : e.total ? 'Komplett' : 'Ikke sendt ennå'; bad = miss > 0; }
    else { pct = x.hasFile ? 100 : x.progress ?? 0; note = x.hasFile ? [x.file?.quality?.replace(/^WEBDL-|^Bluray-/i, ''), x.file?.sizeText].filter(Boolean).join(' · ') || 'Lastet ned' : x.status === 'ann' ? x.note || 'Annonsert' : x.statusText || 'Mangler'; bad = !x.hasFile && x.status !== 'ann'; }
    const st = k === 's' ? x.statusLabel ?? (x.status === 'ended' ? 'Avsluttet' : 'Fortsetter') : x.profile ?? '';
    const nx = k === 's' ? nextBadge(x) : '';
    const has = !!(x.posterImg?.url || x.poster);
    return `<button type="button" class="m70-lc" data-m43-open="${k}:${x.id}"><span class="m70-lp m50-ph" style="${bg50(x)}">${img50(x, { sizes: '(max-width: 600px) 46vw, 200px', high: i < 12 })}${has ? '' : `<span class="m70-lpk">${esc(k === 's' ? x.network ?? '' : x.year ?? '')}</span><span class="m70-lpt">${esc(x.title)}</span>`}${nx ? `<span class="m70-nx">${esc(nx)}</span>` : ''}</span>
      <span class="m70-lt">${esc(x.title)}</span><span class="m70-13 m70-mut">${esc([x.year, st].filter(Boolean).join(' · '))}</span>
      <span class="m70-lb"><span class="m70-bar thin"><i class="${bad ? 'warn' : 'ok'}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span class="m70-12 ${bad ? 'm70-wt' : 'm70-mut'}">${esc(note)}</span></span></button>`;
  };
  const grid = L.length ? `<div class="m70-grid">${L.map(card).join('')}</div>${C.prefetch50(L, 12, 24) ?? ''}`
    : M.libQ.trim() ? `<div class="m70-empty"><span>Ingen ${k === 's' ? 'serier' : 'filmer'} i biblioteket som heter «${esc(M.libQ.trim())}».</span><button type="button" class="m70-btn ink" data-m44="lqadd">Søk etter «${esc(M.libQ.trim())}» for å legge til</button></div>`
      : '<div class="m70-empty"><span>Ingenting her.</span></div>';
  return head + bar + grid;
}
export function setBibSort70(v) { const k = C.M.bibK === 'm' ? 'm' : 's'; if (!SORTS[k].some(([x]) => x === v)) return; S.bibSort[k] = v; lss(`media70_bsort_${k}`, v); }

/* ---------------- Nedlastinger ---------------- */

const NF = { all: () => true, dl: (t) => ['dl', 'meta', 'check'].includes(t.status), q: (t) => t.status === 'queued' || t.status === 'pause', done: (t) => t.done || t.status === 'seed', stuck: (t) => t.status === 'stall' || t.status === 'error' };
function torRow(t) {
  const on = !!S.sel[t.hash], done = t.done || t.status === 'seed';
  const cb = `<button type="button" role="checkbox" class="m70-cb${on ? ' on' : ''}" aria-checked="${on}" aria-label="Velg ${esc(t.title)}" data-m70-sel="${esc(t.hash)}">${on ? '✓' : ''}</button>`;
  const ttl = `<div class="m70-tt"><span class="b6">${esc(t.title)}</span>${t.code && t.code !== 'Film' ? `<span class="m70-mono m70-125 m70-mut">${esc(t.code)}</span>` : t.code === 'Film' ? '<span class="m70-125 m70-mut">Film</span>' : ''}</div>`;
  const p = play70(t.title);
  const more = `<button type="button" class="m70-ib ghost" data-m43-tmore="${esc(t.hash)}" aria-label="Flere valg for ${esc(t.title)}" title="Flere valg">${icMore}</button>`;
  if (done) {
    const sharing = (+t.upSpeed || 0) > 0 || /UP$/i.test(t.state ?? '') && !/^(paused|stopped)/i.test(t.state ?? '');
    const seedTxt = `${sharing ? 'Deler' : 'Deling stoppet'}${t.ratio != null ? ` · ratio ${nb(t.ratio, 2)}` : ''}`;
    return `<div class="m70-tr${on ? ' sel' : ''}">${cb}${art70(t, 'm70-tpa', '36px')}<div class="m70-tb">${ttl}<div class="m70-tm"><span>${esc(t.quality || '–')}</span><span class="m70-mono">${esc(t.sizeText ?? '')}</span><span class="${sharing ? 'm70-seed' : 'm70-mut'}"><i class="m70-dot ${sharing ? 'ok' : 'mut'} sm" aria-hidden="true"></i>${esc(seedTxt)}</span><span>${esc(whenTxt(t.completedAt))}</span></div></div>
      <div class="m70-row g2">${p ? `<a class="m70-ib ghost" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Spill ${esc(t.title)} på ${esc(p.name)}" title="Spill på ${esc(p.name)}">${icPlay(14)}</a>` : ''}${more}</div></div>`;
  }
  const pct = Math.max(0, Math.min(100, +t.progress || 0)), stall = t.status === 'stall' || t.status === 'error';
  return `<div class="m70-tr act${on ? ' sel' : ''}">${cb}${art70(t, 'm70-tpa', '36px')}<div class="m70-tb">${ttl}
      <div class="m70-tpr"><span class="m70-bar"><i class="${stall ? 'warn' : t.status === 'pause' || t.status === 'queued' ? 'mut' : 'ink'}" style="width:${pct}%"></i></span><span class="m70-mono m70-12">${esc(t.progressText ?? `${Math.floor(pct)} %`)}</span></div>
      <div class="m70-tm"><span class="${stall ? 'm70-wt b5' : ''}">${esc(t.statusText ?? '')}</span><span>${esc(t.quality || '')}</span><span class="m70-mono">${esc(t.sizeText ?? '')}</span></div></div>
    <div class="m70-row g2">${t.canToggle !== false ? `<button type="button" class="m70-ib ghost" data-m43-ttog="${esc(t.hash)}" aria-label="${t.status === 'pause' ? 'Fortsett' : 'Pause'} ${esc(t.title)}" title="${t.status === 'pause' ? 'Fortsett' : 'Pause'}">${t.status === 'pause' ? icPlay(14) : icPause}</button>` : ''}${more}<button type="button" class="m70-ib ghost red" data-m43-tdel="${esc(t.hash)}" aria-label="Slett ${esc(t.title)}" title="Slett">${icTrash}</button></div></div>`;
}
function group(n, sub, rows) { return rows.length ? `<section class="m70-card m70-tg"><div class="m70-tgh"><h2 class="m70-h2 s22">${esc(n)}</h2><span class="m70-13 m70-mut">${esc(sub)}</span></div>${rows.map(torRow).join('')}</section>` : ''; }
const sumSize = (L) => bytes(L.reduce((a, t) => a + (+t.size || 0), 0));
function nextLine() {
  const now = Date.now();
  const x = (C.M.up?.items ?? []).find((y) => y.monitored !== false && y.status !== 'ok' && y.status !== 'dl' && (y.airUtc ? Date.parse(y.airUtc) > now : y.date > ymd(new Date())));
  if (!x) return 'Ingenting laster ned.';
  const d = x.airUtc ? new Date(x.airUtc) : dOf(x.date), today = ymd(new Date()) === ymd(d);
  const when = `${today ? 'i dag' : DAYS_L[d.getDay()]}${x.airUtc ? ` kl. ${hm(d)}` : ''}`;
  return `Ingenting laster ned. Neste ventede: <strong>${esc(x.title)}${x.code && x.code !== 'Film' ? ` ${esc(x.code)}` : ''}</strong>, ${esc(when)}.`;
}
function storageHtml() {
  const M = C.M, Dk = M.disk, T = M.tor;
  if (!Dk) return sec('', loading(180));
  const disk = (Dk.disk ?? []).find((d) => d.total) ?? null;
  const total = disk?.total ?? 0, used = total ? total - (disk.free ?? 0) : 0;
  const ser = (M.ser?.items ?? []).reduce((a, x) => a + (+x.sizeOnDisk || 0), 0), mov = (M.mov?.items ?? []).reduce((a, x) => a + (+x.file?.size || 0), 0);
  const seedOnly = (T?.items ?? []).filter((t) => t.done).reduce((a, t) => a + (+t.size || 0), 0);
  const w = (b) => (total ? Math.max(0, Math.min(100, (b / total) * 100)).toFixed(1) : 0);
  const old = (T?.items ?? []).filter((t) => t.done && ageDays(t.completedAt) > 30);
  return sec('m70-stor', `<div class="m70-sh"><h2 class="m70-h2 s26">Lagring</h2><span class="m70-mono m70-13 m70-mut">${total ? `${esc(bytes(used))} av ${esc(bytes(total))}` : ''}</span></div>
    <div class="m70-sbar" role="img" aria-label="Serier ${esc(bytes(ser))}, filmer ${esc(bytes(mov))}, nedlastinger som bare deles ${esc(bytes(seedOnly))}"><span class="s1" style="width:${w(ser)}%"></span><span class="s2" style="width:${w(mov)}%"></span><span class="s3" style="width:${w(seedOnly)}%"></span></div>
    <div class="m70-sl"><div><span class="m70-sq s1"></span><span class="grow">Serier</span><span class="m70-mono m70-mut">${esc(bytes(ser))}</span></div><div><span class="m70-sq s2"></span><span class="grow">Filmer</span><span class="m70-mono m70-mut">${esc(bytes(mov))}</span></div><div><span class="m70-sq s3"></span><span class="grow">Nedlastinger som bare deles</span><span class="m70-mono m70-mut">${esc(bytes(seedOnly))}</span></div></div>
    ${Dk.low ? `<p class="m70-wt m70-13 b5">${esc(Dk.lowText ?? 'Lite diskplass igjen')}</p>` : ''}
    ${C.isAdm() ? `<button type="button" class="m70-btn line sm wide" data-m70="clean30"${old.length ? '' : ' disabled title="Ingen ferdige nedlastinger er eldre enn 30 dager"'}>Rydd ferdige over 30 dager${old.length ? ` (${old.length})` : ''}</button>` : ''}`);
}
function sourcesHtml() {
  const M = C.M, P = M.idx;
  if (!P) return sec('', loading(200));
  if (P.error) return sec('', `<h2 class="m70-h2 s26">Kilder</h2>${C.errBox(P.error)}`);
  if (C.confOff(P)) return sec('', `<h2 class="m70-h2 s26">Kilder</h2>${C.emptySvc(P, 'Prowlarr')}`);
  const Su = P.summary ?? {}, H = P.health ?? [];
  const upd = H.find((h) => /update/i.test(h.source ?? '') || /oppdater|update/i.test(h.message ?? ''));
  const pxUrl = svcOf('prowlarr')?.url;
  const al = H.length ? `<div class="m70-warn" role="alert">${H.slice(0, 3).map((h, i) => `${i ? '<br>' : ''}<strong>${esc(h.message)}</strong>`).join('')}${upd && pxUrl && C.isAdm() ? '<div class="m70-row g8 mt10"><button type="button" class="m70-btn wk sm" data-m70="pxupd">Oppdater</button></div>' : ''}</div>` : '';
  const row = (x) => {
    const t = C.M.idxT[x.id], ok = t && !t.busy ? t.ok : x.ok, ms = t && !t.busy && t.ms != null ? t.ms : x.ms;
    const p = Math.min(100, Math.round(((+ms || 0) / 500) * 100));
    const sub = t?.busy ? 'Tester …' : t && !t.ok ? t.message : ok === false ? x.error || 'Svarer ikke' : `${nb(x.grabs ?? 0)} hentet i dag`;
    return `<button type="button" class="m70-ix" data-m43-itest="${x.id}" title="Test ${esc(x.name)}"${t?.busy ? ' disabled' : ''}><span class="m70-dot ${ok === false ? 'bad' : 'ok'}" aria-hidden="true"></span><span class="grow m70-mw0"><span class="b5 m70-ell">${esc(x.name)}</span><span class="m70-125 ${ok === false ? 'm70-wt' : 'm70-mut'} m70-ell">${esc(sub)}</span></span><span class="m70-mono m70-12 m70-mut">${ms != null ? `${nb(ms)} ms` : '–'}</span><span class="m70-bar w44"><i class="${(+ms || 0) < 250 ? 'ok' : 'amb'}" style="width:${p}%"></i></span></button>`;
  };
  const apps = (P.apps ?? []).map((a) => a.name);
  return sec('', `<div class="m70-sh"><h2 class="m70-h2 s26">Kilder</h2><span class="m70-13 m70-mut">Prowlarr · ${nb(Su.grabsToday ?? 0)} hentet i dag</span></div>${al}
    <div class="m70-ixs">${(P.items ?? []).map(row).join('') || '<p class="m70-mut m70-14">Ingen indeksere ennå.</p>'}</div>
    <div class="m70-ixf"><span class="grow">${apps.length ? `Synket til ${esc(apps.join(' og '))}` : 'Ikke koblet til Sonarr eller Radarr'}${(P.apps ?? []).length ? ` · ${(P.apps ?? []).map((a) => `<button type="button" class="m70-lnk sm" data-m43-sync="${a.id}">Synk ${esc(a.name)}</button>`).join(' ')}` : ''}</span>
      <button type="button" class="m70-btn line sm" data-m43="testall"${C.M.busy.testall ? ' disabled' : ''}>${C.M.busy.testall ? 'Tester …' : 'Test alle'}</button>${C.isAdm() ? '<button type="button" class="m70-btn ink sm" data-m43="ixadd">+ Indekser</button>' : ''}</div>`);
}
export function ned70() {
  const M = C.M, T = M.tor;
  if (!T) return loading(160) + loading(400);
  if (T.error) return C.errBox(T.error);
  if (C.confOff(T)) return `${C.emptySvc(T, 'qBittorrent')}<div class="m70-cols"><div class="m70-main"></div><aside class="m70-side">${sourcesHtml()}</aside></div>`;
  const tr = T.transfer ?? {}, all = T.items ?? [];
  const topCard = `<section class="m70-xfer" aria-label="Overføring"><div class="m70-row g36 xwrap"><div><div class="m70-xk">Ned</div><div class="m70-xv">${esc(tr.dlText ?? '0 MB/s')}</div></div><div><div class="m70-xk">Opp</div><div class="m70-xv">${esc(tr.upText ?? '0 MB/s')}</div></div></div>
    <div class="m70-col g8 m70-mw0">${sparkHtml(T)}</div>
    <div class="m70-row g8 xwrap jend"><button type="button" class="m70-btn dl${tr.altSpeed ? ' on' : ''}" data-m43="alt" aria-pressed="${!!tr.altSpeed}" title="${esc(tr.altLimitText ?? 'Begrens farten')}">${tr.altSpeed ? `Alt-hastighet på${tr.altLimitText ? ` · ${esc(tr.altLimitText.replace(/^grense /, ''))}` : ''}` : 'Alt-hastighet'}</button><button type="button" class="m70-btn dl" data-m43="pauseall">${esc(T.allPausedLabel ?? 'Pause alt')}</button><button type="button" class="m70-btn lt" data-m43="mag">+ Magnet-lenke</button></div></section>`;
  const cnt = Object.fromEntries(Object.entries(NF).map(([k, f]) => [k, all.filter(f).length]));
  const NFL = [['all', 'Alle'], ['dl', 'Laster ned'], ['q', 'I kø'], ['done', 'Ferdige'], ['stuck', 'Står fast']];
  const tabs = `<div class="m70-seg sm" role="tablist" aria-label="Filter">${NFL.map(([k, n]) => `<button type="button" role="tab" aria-selected="${S.nF === k}" class="${S.nF === k ? 'on' : ''}" data-m70-nf="${k}">${n}<span class="m70-mono">${nb(cnt[k])}</span></button>`).join('')}</div>`;
  const sorts = `<div class="m70-row g6 mlauto">${[['new', 'Nyeste'], ['big', 'Størst']].map(([k, n]) => `<button type="button" class="m70-fc sm${S.nSort === k ? ' on' : ''}" aria-pressed="${S.nSort === k}" data-m70-ns="${k}">${n}</button>`).join('')}</div>`;
  const L = all.filter(NF[S.nF] ?? NF.all);
  const act = L.filter((t) => !NF.done(t)), done = L.filter(NF.done);
  const bySort = (a) => (S.nSort === 'big' ? [...a].sort((x, y) => (+y.size || 0) - (+x.size || 0)) : a);
  const doneS = [...done].sort((a, b) => String(b.completedAt ?? b.addedAt ?? '').localeCompare(String(a.completedAt ?? a.addedAt ?? '')));
  const actAll = all.filter((t) => NF.dl(t));
  const line = !actAll.length ? `<div class="m70-line">${icCheck}<span class="grow">${nextLine()}</span><button type="button" class="m70-lnk sm" data-m43-tab="kal">Se kalender</button></div>` : '';
  const nSel = Object.keys(S.sel).filter((h) => all.some((t) => t.hash === h)).length;
  const selBar = nSel ? `<div class="m70-selb" role="toolbar" aria-label="Valgte nedlastinger"><span class="grow b5">${nb(nSel)} valgt</span><button type="button" class="m70-btn dl sm" data-m70="selstop">Stopp deling</button>${C.isAdm() ? '<button type="button" class="m70-btn red sm" data-m70="seldel">Slett med filer</button>' : ''}<button type="button" class="m70-ib ghost inv" data-m70="selclr" aria-label="Fjern valg">×</button></div>` : '';
  let groups = '';
  if (act.length) groups += group(S.nF === 'q' ? 'I kø' : S.nF === 'stuck' ? 'Står fast' : S.nF === 'dl' ? 'Laster ned' : 'Aktive', `${act.length} · ${sumSize(act)}`, bySort(act));
  if (done.length) {
    if (S.nSort === 'big') { const r = bySort(done), sh = S.showAll ? r : r.slice(0, 20); groups += group('Størst først', `${sh.length} av ${done.length}`, sh); }
    else {
      const G = [['I dag', (t) => ageDays(t.completedAt) <= 0], ['I går', (t) => ageDays(t.completedAt) === 1], ['Tidligere denne uka', (t) => ageDays(t.completedAt) > 1 && ageDays(t.completedAt) < 7], ['Eldre', (t) => ageDays(t.completedAt) >= 7]];
      for (const [n, f] of G) { if (n === 'Eldre' && !S.showAll) continue; const r = doneS.filter(f); groups += group(n, `${r.length} · ${sumSize(r)}`, r); }
    }
  }
  const hidden = S.nSort === 'big' ? done.length - Math.min(done.length, 20) : doneS.filter((t) => ageDays(t.completedAt) >= 7).length;
  const showAll = !S.showAll && hidden > 0 ? `<button type="button" class="m70-btn line center" data-m70="showall">Vis alle ${nb(done.length)}</button>` : '';
  const empty = !act.length && !done.length ? `<div class="m70-empty"><span>${S.nF === 'all' ? 'qBittorrent har ingen nedlastinger.' : 'Ingenting her.'}</span></div>` : '';
  return `${topCard}<div class="m70-cols"><div class="m70-main g16"><div class="m70-row g12 xwrap">${tabs}${sorts}</div>${line}${selBar}${groups}${empty}${showAll}</div>
    <aside class="m70-side g16">${storageHtml()}${sourcesHtml()}</aside></div>`;
}

/* ---------------- Handlinger ---------------- */

async function each(list, fn) { let ok = 0, err = null; for (const x of list) { try { await fn(x); ok++; } catch (e) { err = e; } } return { ok, err }; }
async function refreshTor() { try { C.M.tor = await C.mapi('/torrents?filter=all'); } catch { /* beholder forrige */ } C.paint(); }
function calItem(id) { return (S.cal?.items ?? (S.cal?.days ?? []).flatMap((d) => d.items ?? [])).find((x) => String(x.id) === String(id)); }
/** Klikk på knapper med data-m70*. → true når klikket er håndtert. */
export async function act70(b, d) {
  if (!C) return false;
  const M = C.M;
  if (d.m70Day != null) { const i = +d.m70Day; S.calDay = S.calDay === i ? null : i; S.menu = null; C.paintMain(); return true; }
  if (d.m70Bib) { if (M.bibK !== d.m70Bib) { M.bibK = d.m70Bib; M.libF = 'all'; M.libQ = ''; if (!(M.bibK === 'm' ? M.mov : M.ser)) (M.bibK === 'm' ? C.loadMov : C.loadSer)(); C.nav(); } C.paint(); return true; }
  if (d.m70Nf) { S.nF = d.m70Nf; S.showAll = false; C.paintMain(); return true; }
  if (d.m70Ns) { S.nSort = d.m70Ns; lss('media70_nsort', S.nSort); C.paintMain(); return true; }
  if (d.m70Sel) { if (S.sel[d.m70Sel]) delete S.sel[d.m70Sel]; else S.sel[d.m70Sel] = 1; C.paintMain(); return true; }
  if (d.m70Menu) { S.menu = S.menu === d.m70Menu ? null : d.m70Menu; C.paintMain(); return true; }
  if (d.m70Al != null) { const a = alerts70()[+d.m70Al]; S.alerts = false; if (a) { if (a.f) S.nF = a.f; C.go(a.go); } else C.paintTop(); return true; }
  if (d.m70Cal) {
    const [op, ...rest] = d.m70Cal.split(':'), x = calItem(rest.join(':')); S.menu = null;
    if (!x) { C.paintMain(); return true; }
    const film = x.kind === 'movie';
    if (op === 'auto') { await C.cmd(film ? { name: 'MoviesSearch', movieIds: [x.movieId] } : { name: 'EpisodeSearch', episodeIds: [x.episodeId] }, `cal${x.id}`, `Søker etter ${x.title}${film ? '' : ` ${x.code}`} …`); return true; }
    if (op === 'int') { C.search(film ? { k: 'm', id: x.movieId, re: x.status === 'ok', backL: 'Kalender' } : { k: 's', id: x.seriesId, episodeId: x.episodeId, re: x.status === 'ok', backL: 'Kalender' }); return true; }
    if (op === 'mon') {
      const on = x.monitored === false;
      try { await C.mapi(film ? `/movies/${x.movieId}` : `/episodes/${x.episodeId}`, { method: 'PUT', json: { monitored: on } }); C.toast(on ? `${x.title} overvåkes` : `${x.title} overvåkes ikke`); } catch (e) { C.toast(e.message); }
      loadCal(true); return true;
    }
    return true;
  }
  if (d.m70Mon) {
    const [k, id] = d.m70Mon.split(':'), L = (S.cal?.items ?? []).filter((x) => x.monitored === false && (k === 'm' ? String(x.movieId) === id : String(x.seriesId) === id));
    b.disabled = true;
    const r = await each(L, (x) => C.mapi(k === 'm' ? `/movies/${x.movieId}` : `/episodes/${x.episodeId}`, { method: 'PUT', json: { monitored: true } }));
    C.toast(r.err ? r.err.message : `${L[0]?.title ?? 'Serien'}: ${r.ok === 1 ? 'overvåkes' : `${r.ok} episoder overvåkes`}`);
    loadCal(true); return true;
  }
  const a = d.m70;
  if (!a) return false;
  if (a === 'wkprev' || a === 'wknext' || a === 'wknow') { S.wk = a === 'wknow' ? 0 : S.wk + (a === 'wkprev' ? -1 : 1); S.calDay = null; S.menu = null; loadCal(); C.nav(true); return true; }
  if (a === 'alerts') { S.alerts = !S.alerts; C.paintTop(); return true; }
  if (a === 'showall') { S.showAll = true; C.paintMain(); return true; }
  if (a === 'selclr') { S.sel = {}; C.paintMain(); return true; }
  if (a === 'selstop') {
    const L = (M.tor?.items ?? []).filter((t) => S.sel[t.hash] && t.status !== 'pause');
    const r = await each(L, (t) => C.mapi(`/torrents/${t.hash}/pause`, { method: 'POST', json: {} }));
    C.toast(r.err ? r.err.message : `Deling stoppet for ${plural(r.ok, 'nedlasting', 'nedlastinger')}`); S.sel = {}; await refreshTor(); return true;
  }
  if (a === 'seldel') {
    const L = (M.tor?.items ?? []).filter((t) => S.sel[t.hash]);
    if (!L.length || !confirm(`Slette ${plural(L.length, 'nedlasting', 'nedlastinger')} med filene i nedlastingsmappen?\nFiler som allerede er flyttet inn i biblioteket (Sonarr/Radarr) blir liggende.`)) return true;
    const r = await each(L, (t) => C.mapi(`/torrents/${t.hash}?files=1`, { method: 'DELETE' }));
    C.toast(r.err ? r.err.message : `Slettet ${plural(r.ok, 'nedlasting', 'nedlastinger')} med filene`); S.sel = {}; await refreshTor(); return true;
  }
  if (a === 'clean30') {
    const L = (M.tor?.items ?? []).filter((t) => t.done && ageDays(t.completedAt) > 30);
    if (!L.length) { C.toast('Ingen ferdige nedlastinger er eldre enn 30 dager'); return true; }
    if (!confirm(`Rydde ${plural(L.length, 'ferdig nedlasting', 'ferdige nedlastinger')} eldre enn 30 dager (${sumSize(L)})?\nDe fjernes fra qBittorrent med filene i nedlastingsmappen. Biblioteket i Sonarr/Radarr blir som før.`)) return true;
    b.disabled = true;
    const r = await each(L, (t) => C.mapi(`/torrents/${t.hash}?files=1`, { method: 'DELETE' }));
    C.toast(r.err ? r.err.message : `Ryddet ${plural(r.ok, 'nedlasting', 'nedlastinger')} · ${sumSize(L)} frigjort`); await refreshTor(); return true;
  }
  if (a === 'pxupd') { const u = svcOf('prowlarr')?.url; if (u) open(`${u.replace(/\/+$/, '')}/system/updates`, '_blank', 'noopener'); return true; }
  return false;
}
/** Klikk utenfor lukker ⋯-menyen og varsel-lista. */
export function outside70(t) {
  let hit = false;
  if (S.menu && !t.closest?.('.m70-menu,[data-m70-menu]')) { S.menu = null; hit = true; C.paintMain(); }
  if (S.alerts && !t.closest?.('.m70-alw')) { S.alerts = false; C.paintTop(); }
  return hit;
}
export function esc70() { if (S.menu) { S.menu = null; C.paintMain(); return true; } if (S.alerts) { S.alerts = false; C.paintTop(); return true; } if (S.calDay != null && C.M.tab === 'kal') { S.calDay = null; C.paintMain(); return true; } return false; }
