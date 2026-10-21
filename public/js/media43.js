// Prompt 43 (claude-code-media-arr.md): Media på web – Sonarr, Radarr, qBittorrent og Prowlarr. Fasit: design/Media.dc.html
// (2a, variant web): pille-faner i topplinja (Kommer snart · Sonarr · Radarr · qBittorrent · Prowlarr), Glimt-felt, ⚙ og ×,
// alt i full bredde med 32 px marg. Egen fullskjerm-side (#/media) som Vær og Chat; × går tilbake til Dashboard.
// Alt går via serveren (SERVER43, server/media43.js): /api/media/* er en proxy, tjenestenøklene sendes aldri hit.
// Svarformene står ved hver rute i server/media43.js. 404 (eldre server) og «ikke satt opp» gir tomtilstander, ingen feil.
import { esc } from './util.js';
import { orb43 } from './orb43.js';

if (!document.querySelector('link[data-m43-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media43.css'; l.dataset.m43Css = ''; document.head.appendChild(l);
}
if (!document.querySelector('link[data-hl-fonts],link[data-m43-fonts]')) {
  const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.m43Fonts = '';
  f.href = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap';
  document.head.appendChild(f);
}

const TABS = [['kom', 'Kommer snart'], ['son', 'Sonarr'], ['rad', 'Radarr'], ['qb', 'qBittorrent'], ['pro', 'Prowlarr']];
const M = {
  tab: 'kom', det: null, srch: null, libF: 'all', seg: 'all', fq: 'all', open: {}, grab: {}, busy: {}, toast: '', sh: null,
  add: null, act: null, edit: null, mag: null, ix: null, gq: '', gl: null, missing: false, restricted: '',
  up: null, ser: null, mov: null, tor: null, idx: null, disk: null, prof: null, status: null, prefs: null, access: null, detail: null, rel: null, files: null, idxT: {},
  err: {},
};
let root = null, pollT = 0, toastT = 0, magT = 0, lookT = 0, schT = 0, wasNarrow = null;
const narrow = () => innerWidth < 900;

/* ---------------- Data ---------------- */

async function mapi(path, { method = 'GET', json, quiet } = {}) {
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
function enterTab() {
  if (M.missing || M.restricted) return;
  if (M.tab === 'kom') { loadUp(); }
  if (M.tab === 'son' && !M.det && !M.srch) loadSer();
  if (M.tab === 'rad' && !M.det && !M.srch) loadMov();
  if (M.tab === 'qb') { loadTor(); loadDisk(); }
  if (M.tab === 'pro') loadIdx();
}
async function loadDetail() {
  const d = M.det; if (!d) return;
  M.detail = null; paint();
  try { M.detail = await mapi(d.k === 's' ? `/series/${d.id}` : `/movies/${d.id}`); } catch (e) { M.detail = { error: e.message }; }
  paint();
}
async function loadRel() {
  const s = M.srch; if (!s) return;
  M.rel = null; paint();
  const q = s.k === 'm' ? `movieId=${s.id}` : s.episodeId ? `episodeId=${s.episodeId}` : `seriesId=${s.id}&seasonNumber=${s.season}`;
  try { M.rel = await mapi(`/release?${q}`); } catch (e) { M.rel = { error: e.message }; }
  paint();
}
function poll() {
  clearTimeout(pollT);
  if (!root?.isConnected) return;
  const fast = M.tab === 'qb' && !document.hidden;
  pollT = setTimeout(async () => {
    if (!root?.isConnected) return;
    if (!document.hidden && !M.missing && !M.restricted) {
      if (M.tab === 'qb' || M.tab === 'kom') { try { M.tor = await mapi('/torrents?filter=all'); } catch { /* beholder forrige */ } if (M.tab === 'kom') { try { M.up = await mapi('/upcoming?days=7'); } catch { /* */ } } paintMain(); }
    }
    poll();
  }, fast ? 2000 : 30_000);
}

/* ---------------- Hjelpere ---------------- */

const SC = { ok: 'ok', dl: 'bad', miss: 'warn', stall: 'warn', pause: 'mut', wait: 'mut', ann: 'mut', off: 'mut', seed: 'ok', meta: 'mut', queued: 'mut', check: 'mut', error: 'bad' };
const tone = (st) => `t-${SC[st] ?? 'mut'}`;
const art = (x, cls = 'm43-art') => `<div class="${cls}" style="background-color:${esc(x?.color || '#3c4a5c')}${x?.poster ? `;background-image:url('${esc(x.poster)}')` : ''}"></div>`;
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
  magnet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v7a6 6 0 0 0 12 0V4M6 4h4v7a2 2 0 0 0 4 0V4h4M6 8h4M14 8h4"/></svg>',
};
function toast(t) { clearTimeout(toastT); M.toast = t; paintToast(); toastT = setTimeout(() => { M.toast = ''; paintToast(); }, 3600); }
const nb = (n) => (+n || 0).toLocaleString('nb-NO');
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const rangeTxt = (a, b) => { if (!a || !b) return ''; const [, m1, d1] = a.split('-').map(Number), [, m2, d2] = b.split('-').map(Number); return m1 === m2 ? `${d1}.–${d2}. ${MON[m1 - 1]}` : `${d1}. ${MON[m1 - 1]} – ${d2}. ${MON[m2 - 1]}`; };
const confOff = (d) => d && d.configured === false;
const emptySvc = (d, name) => `<div class="m43-empty"><b>${esc(name)} er ikke satt opp</b><span>${esc(d?.message || `Legg inn adresse og nøkkel under Innstillinger → Integrasjoner → Media.`)}</span><button type="button" class="m43-btn line" data-m43="integ">Åpne Integrasjoner</button></div>`;
const errBox = (e) => `<div class="m43-empty err"><b>Fikk ikke hentet data</b><span>${esc(e)}</span><button type="button" class="m43-btn line" data-m43="retry">Prøv igjen</button></div>`;
const skel = (h = 220) => `<div class="m43-skel" style="min-height:${h}px"></div>`;

/* ---------------- Topplinja og Glimt ---------------- */

function topHtml() {
  const tabs = TABS.map(([k, n]) => `<button type="button" class="m43-tab${pill(M.tab === k)}" data-m43-tab="${k}" aria-current="${M.tab === k ? 'page' : 'false'}">${n}</button>`).join('');
  return `<div class="m43-top"><div class="m43-tl">
    <b class="m43-h">Media</b>
    <div class="m43-tabs" role="tablist" aria-label="Media">${tabs}</div>
    <form class="m43-gl" data-m43-glf role="search"><span class="m43-glo">${orb43(20, M.gl?.busy ? 'busy' : '')}</span><input name="gq" value="${esc(M.gq)}" placeholder="Spør Glimt: «legg til Severance i 4K»" aria-label="Spør Glimt" autocomplete="off"></form>
    <button type="button" class="m43-ib" data-m43="set" aria-label="Innstillinger for Media" title="Innstillinger for Media">${ic.set}</button>
    <button type="button" class="m43-ib ink" data-m43="close" aria-label="Lukk Media" title="Lukk (Esc)">${ic.x}</button>
  </div></div>`;
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

/* ---------------- Kommer snart ---------------- */

function komHtml() {
  const U = M.up;
  if (!U) return skel(360);
  if (U.error) return errBox(U.error);
  if (confOff(U)) return emptySvc({ message: 'Sonarr og Radarr er ikke satt opp. Legg dem inn under Innstillinger → Integrasjoner → Media.' }, 'Media');
  const days = U.days ?? [];
  const goCal = `<button type="button" class="m43-btn line" data-m43="cal">Vis i Kalender</button>`;
  const item = (x, mob) => {
    const go = `data-m43-open="${x.kind === 'movie' ? 'm' : 's'}:${x.kind === 'movie' ? x.movieId : x.seriesId}"`;
    if (mob) return `<button type="button" class="m43-kmi" ${go}>${art(x, 'm43-art kp')}<div class="m43-col grow"><b>${esc(x.title)}</b><span class="t-mut">${esc([x.code, x.episodeTitle].filter(Boolean).join(' · '))}</span><b class="m43-s ${tone(x.status)}">${esc(x.statusText ?? '')}</b></div><span class="mono t-mut">${esc(x.time ?? '')}</span></button>`;
    return `<button type="button" class="m43-ki" ${go}><div class="m43-kp" style="background-color:${esc(x.color || '#3c4a5c')}${x.poster ? `;background-image:url('${esc(x.poster)}')` : ''}"><b>${esc(x.title)}</b><span class="m43-dot ${tone(x.status)}"></span></div>
      <span class="m43-ke"><b>${esc(x.code)}</b> <span class="t-mut">${esc(x.time ?? '')}</span></span><b class="m43-s ${tone(x.status)}">${esc(x.statusText ?? '')}</b></button>`;
  };
  const head = `<div class="m43-row sb xwrap"><b class="m43-h1">Kommer snart</b><div class="m43-row g16"><span class="t-mut">${esc(rangeTxt(U.from, U.to))}</span>${goCal}</div></div>`;
  let body;
  if (narrow()) {
    const L = days.filter((d) => d.items?.length);
    body = L.length ? L.map((d) => `<div class="m43-col g8"><div class="m43-kdh"><span class="m43-lab acc">${esc(d.label)}</span><b>${esc(d.title)}</b></div>${d.items.map((x) => item(x, true)).join('')}</div>`).join('') : '<div class="m43-empty"><span>Ingenting kommer de neste 7 dagene.</span></div>';
  } else {
    body = `<div class="m43-week">${days.map((d) => `<div class="m43-day"><div class="m43-dh${d.today ? ' today' : d.items?.length ? ' has' : ''}"><b>${esc(d.short)}</b><span class="mono">${esc(d.countText ?? '')}</span></div>${(d.items ?? []).map((x) => item(x)).join('') || '<span class="t-mut m43-sm">Ingenting</span>'}</div>`).join('')}</div>`;
  }
  const act = (U.downloading ?? []);
  const strip = act.length ? `<div class="m43-strip"><button type="button" class="m43-sgo" data-m43-tab="qb">Lastes ned ›</button>${act.map((t) => `<div class="m43-sit">${art(t, 'm43-art xs')}<div class="m43-col grow g5"><span class="ell b7">${esc(`${t.title}${t.code ? ` · ${t.code}` : ''} · ${t.statusText ?? ''}`)}</span><div class="m43-sbar"><i style="width:${Math.max(0, Math.min(100, t.progress ?? 0))}%"></i></div></div></div>`).join('')}<button type="button" class="m43-btn inv" data-m43="pauseall">${M.tor?.allPausedLabel ?? (U.allPaused ? 'Fortsett alt' : 'Pause alt')}</button></div>` : '';
  return `${head}${body}${strip}`;
}

/* ---------------- Bibliotek (Sonarr / Radarr) ---------------- */

function libHtml(k) {
  const D = k === 's' ? M.ser : M.mov, name = k === 's' ? 'Sonarr' : 'Radarr';
  if (!D) return skel(360);
  if (D.error) return errBox(D.error);
  if (confOff(D)) return emptySvc(D, name);
  const items = D.items ?? [];
  const fx = k === 's' ? { all: () => true, missing: (x) => x.episodes?.missing > 0, continuing: (x) => x.status === 'continuing', ended: (x) => x.status === 'ended' } : { all: () => true, has: (x) => x.hasFile, missing: (x) => !x.hasFile && x.status !== 'ann', announced: (x) => x.status === 'ann' };
  const filters = D.filters ?? Object.keys(fx).map((id) => ({ id, label: id, count: items.filter(fx[id]).length }));
  const L = items.filter(fx[M.libF] ?? fx.all);
  const card = (x) => {
    let line, lc, dot;
    if (k === 's') { const miss = x.episodes?.missing ?? 0; line = miss ? `${miss} mangler` : x.status === 'ended' ? 'Komplett · avsluttet' : x.nextText ?? 'Komplett'; lc = miss ? 't-warn' : 't-mut'; dot = miss ? 'warn' : x.status === 'ended' ? 'mut' : 'ok'; }
    else { line = x.hasFile ? `Lastet ned${x.file?.quality ? ` · ${x.file.quality}` : ''}` : x.status === 'ann' ? x.note || 'Annonsert' : x.statusText; lc = tone(x.status); dot = SC[x.status] ?? 'mut'; }
    const meta = k === 's' ? [x.year, x.network].filter(Boolean).join(' · ') : [x.year, x.profile].filter(Boolean).join(' · ');
    return `<button type="button" class="m43-lc" data-m43-open="${k}:${x.id}"><div class="m43-lp" style="background-color:${esc(x.color || '#3c4a5c')}${x.poster ? `;background-image:url('${esc(x.poster)}')` : ''}"><b>${esc(x.title)}</b><span class="m43-dot t-${dot}"></span></div><span class="m43-lm ell">${esc(meta)}</span><b class="m43-s ${lc}">${esc(line)}</b></button>`;
  };
  return `<div class="m43-row sb xwrap"><div class="m43-row g10 base"><b class="m43-h1">${k === 's' ? 'Serier' : 'Filmer'}</b><span class="t-mut">${nb(items.length)} ${k === 's' ? 'serier' : 'filmer'}</span></div><button type="button" class="m43-btn ink" data-m43="add">${k === 's' ? '+ Legg til serie' : '+ Legg til film'}</button></div>
    <div class="m43-chips">${filters.map((f) => chip(`${f.label} ${f.count ?? ''}`.trim(), M.libF === f.id, `data-m43-libf="${esc(f.id)}"`)).join('')}</div>
    <div class="m43-grid">${L.map(card).join('') || '<span class="t-mut">Ingenting her.</span>'}</div>`;
}

/* ---------------- Serie- og filmside ---------------- */

function detHtml() {
  const d = M.det, x = M.detail, back = `<button type="button" class="m43-back" data-m43="detback">‹ ${d.k === 's' ? 'Serier' : 'Filmer'}</button>`;
  if (!x) return back + skel(300);
  if (x.error) return back + errBox(x.error);
  const chips = (L) => `<div class="m43-row xwrap g8">${L.map(([l, v, f]) => `<button type="button" class="m43-dchip" data-m43-edit="${f}"><span class="m43-lab">${esc(l)}</span><b>${esc(v)} ›</b></button>`).join('')}</div>`;
  const head = `<div class="m43-dh2">${art(x, 'm43-art dp')}<div class="m43-col grow g6"><span class="m43-lab acc">${d.k === 's' ? 'SONARR · SERIE' : 'RADARR · FILM'}</span><b class="m43-dt">${esc(x.title)}</b><span class="t-mut m43-15">${esc(x.subtitle ?? '')}</span>`;
  if (d.k === 'm') {
    const st = x.status === 'ann' ? x.note || 'Annonsert' : x.statusText;
    const file = x.file ? `${x.file.quality ?? ''} · ${x.file.sizeText ?? ''} · ${x.file.path ?? x.path ?? ''}` : `Ingen fil ennå · lagres i ${x.path ?? x.rootFolder ?? '/data/media/film'}`;
    const acts = [x.hasFile && x.play ? `<a class="m43-btn ink" href="${esc(x.play.url)}" target="_blank" rel="noopener">${esc(x.play.label)}</a>` : '', `<button type="button" class="m43-btn ${x.hasFile ? 'line' : 'ink'}" data-m43="mauto"${M.busy.mauto ? ' disabled' : ''}>${M.busy.mauto ? 'Søker …' : 'Automatisk søk'}</button>`, '<button type="button" class="m43-btn line" data-m43="minter">Interaktivt søk</button>'].join('');
    return `${back}${head}<b class="m43-s ${tone(x.status)} m43-14">${esc(st ?? '')}</b></div></div>
      ${chips([['PROFIL', x.profile ?? '–', 'prof'], ['LAST NED NÅR DEN ER', x.availabilityLabel ?? '–', 'av'], ['OVERVÅKET', x.monitored ? 'Ja' : 'Nei', 'mmon']])}
      <div class="m43-row xwrap g8">${acts}</div>
      <div class="m43-card m43-col g4"><span class="m43-lab">FIL</span><span class="m43-rel">${esc(file)}</span></div>`;
  }
  const miss = x.missingCount ?? 0, aired = (x.seasons ?? []).reduce((a, se) => a + se.episodes.filter((e) => e.aired).length, 0), have = (x.seasons ?? []).reduce((a, se) => a + se.have, 0);
  const epTxt = x.seasons ? `${have} av ${aired} episoder · ${miss ? `${miss} mangler` : 'komplett'}` : x.episodesText ?? '';
  const acts = [`<button type="button" class="m43-btn ${miss ? 'ink' : 'line'}" data-m43="sall"${miss && !M.busy.sall ? '' : ' disabled'}>${M.busy.sall ? 'Søker …' : x.searchLabel ?? 'Ingenting mangler'}</button>`, x.play ? `<a class="m43-btn line" href="${esc(x.play.url)}" target="_blank" rel="noopener">${esc(x.play.label)}</a>` : ''].join('');
  const seasons = (x.seasons ?? []).map((se, si) => {
    const open = M.open[`${x.id}-${se.number}`] ?? si === 0, aired = se.episodes.filter((e) => e.aired).length;
    const sub = aired ? `${se.have} av ${aired} sendt${se.missing ? ` · ${se.missing} mangler` : ''}` : `Ikke sendt ennå · ${se.total} episoder`;
    const eps = open ? se.episodes.map((e) => {
      const air = e.airDateText ? (e.aired ? `Sendt ${e.airDateText}` : e.airDateText) : e.aired ? 'Sendt' : 'Ikke sendt';
      const n = narrow() && e.canSearch;
      return `<div class="m43-ep"><button type="button" class="m43-ib ghost mk" data-m43-epmon="${e.id}" aria-label="Overvåk episoden" aria-pressed="${e.monitored}">${ic.mark(e.monitored, 16)}</button><span class="m43-ec mono">${esc(e.e)}</span>
        <div class="m43-col grow"><b class="ell">${esc(e.title)}</b><span class="m43-sm ${n ? tone(e.status) : 't-mut'}">${esc(n ? `${air} · ${e.statusText}` : air)}</span></div>
        ${!n ? `<span class="m43-stc ${tone(e.status)}">${esc(e.statusText ?? '')}</span>` : ''}
        ${e.canSearch ? `<button type="button" class="m43-ib line" data-m43-epauto="${e.id}" aria-label="Automatisk søk" title="Automatisk søk"${M.busy[`ep${e.id}`] ? ' disabled' : ''}>${ic.search}</button><button type="button" class="m43-ib ink" data-m43-epint="${e.id}" aria-label="Interaktivt søk" title="Interaktivt søk">${ic.list}</button>` : ''}</div>`;
    }).join('') : '';
    return `<div class="m43-se"><div class="m43-seh"><button type="button" class="m43-ib ghost mk" data-m43-semon="${se.number}" aria-label="Overvåk sesongen" aria-pressed="${se.monitored}">${ic.mark(se.monitored)}</button><button type="button" class="m43-set" data-m43-setog="${se.number}" aria-expanded="${open}"><b>${esc(se.label)}</b><span class="${se.missing ? 't-warn' : 't-mut'}">${esc(sub)}</span></button>
      ${se.canSearch ? `<button type="button" class="m43-btn sm line" data-m43-sesearch="${se.number}">Søk sesong</button>` : ''}<span class="m43-chev">${open ? '▴' : '▾'}</span></div>${eps}</div>`;
  }).join('');
  return `${back}${head}<b class="m43-s ${miss ? 't-warn' : 't-ok'} m43-14">${esc(epTxt)}</b></div></div>
    ${chips([['PROFIL', x.profile ?? '–', 'prof'], ['OVERVÅKING', x.monitorLabel ?? monLbl(x.monitor), 'mon'], ['SERIETYPE', x.seriesTypeLabel ?? 'Standard', 'typ']])}
    <div class="m43-row xwrap g8">${acts}</div><div class="m43-col">${seasons}</div>`;
}
const MON0 = [['all', 'Alle episoder'], ['future', 'Fremtidige episoder'], ['missing', 'Manglende episoder'], ['existing', 'Eksisterende episoder'], ['firstSeason', 'Første sesong'], ['latestSeason', 'Siste sesong'], ['pilot', 'Bare pilot'], ['none', 'Ingen']];
const TYP0 = [['standard', 'Standard'], ['daily', 'Daglig'], ['anime', 'Anime']];
const AV0 = [['announced', 'Annonsert'], ['inCinemas', 'På kino'], ['released', 'Utgitt digitalt']];
const monLbl = (k) => (MON0.find((m) => m[0] === k) ?? MON0[0])[1];
const listOf = (k) => (k === 'mon' ? (M.prof?.monitor?.map((x) => [x.id, x.label]) ?? MON0) : k === 'typ' ? (M.prof?.seriesTypes?.map((x) => [x.id, x.label]) ?? TYP0) : k === 'av' ? (M.prof?.availability?.map((x) => [x.id, x.label]) ?? AV0) : null);
const profsOf = (k) => (M.prof?.[k === 's' ? 'sonarr' : 'radarr'] ?? []).map((p) => p.name);

/* ---------------- Interaktivt søk ---------------- */

function srchHtml() {
  const s = M.srch, R = M.rel, back = `<button type="button" class="m43-back" data-m43="srback">‹ ${esc(s.backL ?? 'Tilbake')}</button>`;
  if (!R) return `${back}<div class="m43-card m43-gs">Søker i indekserne via Prowlarr …</div>`;
  if (R.error) return back + errBox(R.error);
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
    <div class="m43-chips">${(R.filters ?? []).map((f) => chip(f.id === 'all' ? `${f.label} ${f.count}` : f.label, M.fq === f.id, `data-m43-fq="${esc(f.id)}"`)).join('')}</div>
    ${rows.length ? table : '<span class="t-mut">Ingen treff med dette filteret.</span>'}`;
}

/* ---------------- qBittorrent ---------------- */

function qbHtml() {
  const T = M.tor;
  if (!T) return skel(300);
  if (T.error) return errBox(T.error);
  if (confOff(T)) return emptySvc(T, 'qBittorrent');
  const tr = T.transfer ?? {};
  const fx = { all: () => true, active: (t) => ['dl', 'meta', 'check', 'queued'].includes(t.status), paused: (t) => t.status === 'pause', done: (t) => t.status === 'seed', stalled: (t) => t.status === 'stall' || t.status === 'error' };
  const L = (T.items ?? []).filter(fx[M.seg] ?? fx.all);
  const card = (t) => {
    const bc = t.status === 'seed' ? 'ok' : t.status === 'stall' || t.status === 'error' ? 'warn' : t.status === 'pause' ? 'mut' : 'ink';
    return `<div class="m43-tc">${art(t, 'm43-art tp')}<div class="m43-col grow g6"><div class="m43-row sb xtop g8"><div class="m43-col mw0"><b class="ell m43-15">${esc(t.title)}</b><span class="m43-sm t-mut">${esc([t.code, t.quality, t.sizeText].filter(Boolean).join(' · '))}</span></div><b class="m43-pct">${esc(t.progressText ?? `${Math.floor(t.progress ?? 0)} %`)}</b></div>
      <div class="m43-bar"><i class="b-${bc}" style="width:${Math.max(0, Math.min(100, t.progress ?? 0))}%"></i></div>
      <div class="m43-row sb g8"><span class="m43-sm b7 ${t.status === 'stall' || t.status === 'error' ? 't-warn' : t.status === 'seed' ? 't-ok' : 't-mut'} mw0">${esc(t.statusText ?? '')}</span><div class="m43-row g6">
        ${t.canToggle !== false && t.status !== 'seed' ? `<button type="button" class="m43-ib line xbg" data-m43-ttog="${esc(t.hash)}" aria-label="${t.status === 'pause' ? 'Fortsett' : 'Pause'}" title="${t.status === 'pause' ? 'Fortsett' : 'Pause'}">${t.status === 'pause' ? ic.play : ic.pause}</button>` : ''}
        <button type="button" class="m43-ib line xbg" data-m43-tmore="${esc(t.hash)}" aria-label="Flere valg" title="Flere valg">⋯</button>
        <button type="button" class="m43-ib line xbg xred" data-m43-tdel="${esc(t.hash)}" aria-label="Slett" title="Slett">${ic.trash}</button></div></div></div></div>`;
  };
  const Dk = M.disk, disk = Dk?.disk?.length ? (() => {
    const tot = Dk.disk.find((d) => d.total)?.total, used = tot ? tot - (Dk.disk.find((d) => d.total)?.free ?? 0) : null;
    const big = (b) => (b >= 1024 ** 4 ? `${(b / 1024 ** 4).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} TB` : `${Math.round(b / 1024 ** 3)} GB`);
    return `<div class="m43-card m43-col g12"><div class="m43-row sb base"><b class="m43-h3">Diskplass</b><span class="mono t-mut m43-sm">${tot ? `${big(used)} av ${big(tot)} brukt` : ''}</span></div>
      ${Dk.disk.map((d, i) => { const w = d.total ? Math.round(((d.total - (d.free ?? 0)) / d.total) * 100) : 0; return `<div class="m43-col g5"><div class="m43-row sb m43-13"><span class="mono">${esc(d.path)}</span><b class="${d.low ? 't-bad' : ''}">${esc(d.freeText ?? '')}</b></div><div class="m43-bar thin"><i class="b-${['ink', 'bad', 'mut'][i % 3]}" style="width:${w}%"></i></div></div>`; }).join('')}
      <span class="m43-sm ${Dk.low ? 't-bad b7' : 't-mut'}">${esc(Dk.lowText ?? 'Varsel når under 1 TB')}</span></div>`;
  })() : '';
  return `<div class="m43-qs"><div class="m43-col g4"><b class="m43-sp">↓ ${esc(tr.dlText ?? '0 MB/s')}</b><span class="m43-lab inv">${esc(`${tr.summary ?? ''}${tr.altSpeed && tr.altLimitText ? ` · ${tr.altLimitText}` : ''}`.toUpperCase())}</span></div>
      <div class="m43-row g8 m43-qsb"><button type="button" class="m43-btn inv grow" data-m43="pauseall">${esc(T.allPausedLabel ?? 'Pause alt')}</button><button type="button" class="m43-btn alt grow${tr.altSpeed ? ' on' : ''}" data-m43="alt" aria-pressed="${!!tr.altSpeed}">${tr.altSpeed ? 'Alt-hastighet på' : 'Alt-hastighet'}</button></div></div>
    <div class="m43-row xwrap g8"><button type="button" class="m43-btn line ink-b" data-m43="mag">${ic.magnet}Legg til magnet-lenke</button><span class="t-mut m43-13">eller .torrent-adresse</span></div>
    <div class="m43-chips">${(T.filters ?? []).map((f) => chip(`${f.label} ${f.count}`, M.seg === f.id, `data-m43-seg="${esc(f.id)}"`)).join('')}</div>
    <div class="m43-tgrid">${L.map(card).join('')}</div>${L.length ? '' : '<span class="t-mut">Ingenting her.</span>'}
    ${disk}`;
}

/* ---------------- Prowlarr ---------------- */

function proHtml() {
  const P = M.idx;
  if (!P) return skel(300);
  if (P.error) return errBox(P.error);
  if (confOff(P)) return emptySvc(P, 'Prowlarr');
  const S = P.summary ?? {};
  const row = (x) => { const t = M.idxT[x.id]; const ok = t ? t.ok : x.ok; const line = t && !t.busy ? (t.ok ? `${t.ms ?? '–'} ms · test OK` : t.message) : x.line; return `<div class="m43-ix"><span class="m43-dot t-${ok ? 'ok' : 'bad'}"></span><div class="m43-col grow mw0"><b>${esc(x.name)}</b><span class="m43-sm ${ok ? 't-mut' : 't-bad'}">${esc(line ?? '')}</span></div><button type="button" class="m43-btn sm line xbg" data-m43-itest="${x.id}"${t?.busy ? ' disabled' : ''}>${t?.busy ? 'Tester …' : 'Test'}</button></div>`; };
  return `<div class="m43-card m43-row sb xwrap g14"><div class="m43-col g4"><b class="m43-psum">${esc(S.text ?? '')}</b><span class="t-mut">Prowlarr · ${esc(S.line ?? '')}</span></div><div class="m43-row xwrap g8"><button type="button" class="m43-btn line" data-m43="testall"${M.busy.testall ? ' disabled' : ''}>${M.busy.testall ? 'Tester …' : 'Test alle'}</button><button type="button" class="m43-btn ink" data-m43="ixadd">+ Legg til indekser</button></div></div>
    ${(P.health ?? []).length ? `<div class="m43-card m43-col g4">${P.health.map((h) => `<span class="m43-sm ${h.type === 'error' ? 't-bad' : 't-warn'} b7">${esc(h.message)}</span>`).join('')}</div>` : ''}
    <div class="m43-card m43-ixs">${(P.items ?? []).map(row).join('') || '<span class="t-mut m43-pad">Ingen indeksere ennå. Trykk «+ Legg til indekser».</span>'}</div>
    ${(P.apps ?? []).length ? `<div class="m43-card m43-col">${P.apps.map((a) => `<div class="m43-ix"><span class="m43-dot t-ok"></span><div class="m43-col grow"><b>${esc(a.name)}</b><span class="m43-sm t-mut">${esc([a.label, `${S.ok ?? 0} indeksere`, /radarr/i.test(a.implementation) ? 'film' : 'TV'].filter(Boolean).join(' · '))}</span></div><button type="button" class="m43-btn sm line xbg" data-m43-sync="${a.id}">Synk nå</button></div>`).join('')}</div>` : ''}`;
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
  if (M.tab === 'kom') return komHtml();
  if (M.tab === 'son') return libHtml('s');
  if (M.tab === 'rad') return libHtml('m');
  if (M.tab === 'qb') return qbHtml();
  return proHtml();
}
const keepFocus = (el, fn) => {
  const a = document.activeElement, n = el.contains(a) ? a.getAttribute('name') : null, pos = n ? a.selectionStart : 0;
  fn();
  if (n) { const f = el.querySelector(`[name="${n}"]`); if (f) { f.focus({ preventScroll: true }); try { f.setSelectionRange(pos, pos); } catch { /* */ } } }
};
function paintMain() {
  const c = root?.querySelector('[data-m43-main]'); if (!c) return;
  const y = c.scrollTop;
  c.innerHTML = `<div class="m43-in-w">${mainHtml()}</div>`;
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
function paintToast() { const t = root?.querySelector('[data-m43-toast]'); if (t) t.innerHTML = M.toast ? `<div class="m43-toast" role="status">${esc(M.toast)}</div>` : ''; }
function paint() { if (!root?.isConnected) return; paintTop(); paintGl(); paintMain(); paintSheet(); paintToast(); }

/* ---------------- Handlinger ---------------- */

function openDet(k, id) { M.tab = k === 's' ? 'son' : 'rad'; M.det = { k, id: +id }; M.srch = null; M.libF = 'all'; loadProf(); loadDetail(); paint(); root?.querySelector('[data-m43-main]')?.scrollTo(0, 0); }
async function cmd(body, key, okMsg) {
  M.busy[key] = true; paint();
  try { const r = await mapi('/command', { method: 'POST', json: body }); toast(okMsg ?? r.message ?? 'Søk startet'); } catch (e) { toast(e.message); }
  M.busy[key] = false; paint();
}
async function allToggle(pause) {
  const p = pause ?? !(M.tor?.allPaused ?? M.up?.allPaused);
  try { const r = await mapi(p ? '/torrents/pauseAll' : '/torrents/resumeAll', { method: 'POST' }); if (r.items) M.tor = r; toast(r.message ?? (p ? 'Alt er pauset' : 'Alle nedlastinger går igjen')); } catch (e) { toast(e.message); }
  if (M.tab === 'kom') loadUp();
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
  try { const j = await mapi('/release', { method: 'POST', json: { guid, indexerId: r.indexerId, service: r.service } }); M.grab[guid] = true; toast(j.message ?? `Sendt til qBittorrent: ${r.quality} · ${r.sizeText}`); try { navigator.vibrate?.(10); } catch { /* */ } }
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
  try { const r = await mapi('/torrents/magnet', { method: 'POST', json: { url: g.q.trim(), category: g.cat, paused: g.paused, sequential: g.sequential, firstLast: g.firstLast } }); M.sh = null; M.mag = null; toast(r.message ?? 'Lagt til i qBittorrent'); M.tab = 'qb'; loadTor(); }
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
function close() { location.hash = '#/dash'; }
async function openIntegrations() { try { const m = await import('./settings.js'); closeSheet(); m.openSettings('int'); } catch { location.hash = '#/innstillinger/integrasjoner'; } }

/* ---------------- Hendelser ---------------- */

function bind(r) {
  r.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.matches?.('[data-m43-shbg]')) return closeSheet();
    const b = t.closest('button,a[data-m43]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.m43Tab) { M.tab = d.m43Tab; M.det = null; M.srch = null; M.libF = 'all'; enterTab(); poll(); paint(); r.querySelector('[data-m43-main]')?.scrollTo(0, 0); return; }
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
    if (d.m43Epint) { const ep = M.detail.seasons.flatMap((x) => x.episodes).find((x) => String(x.id) === d.m43Epint); M.srch = { k: 's', id: M.detail.id, episodeId: ep.id, backL: M.detail.title }; M.fq = 'all'; loadRel(); return paintMain(); }
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
    if (a === 'set') { M.sh = 'set'; paintSheet(); loadStatus().then(() => { if (M.status?.admin && !M.access) mapi('/access').then((j) => { M.access = j; paintSheet(); }).catch((er) => { M.access = { error: er.message }; paintSheet(); }); }); return; }
    if (a === 'shclose') return closeSheet();
    if (a === 'glclose') { M.gl = null; M.gq = ''; return paint(); }
    if (a === 'retry') { M.up = M.ser = M.mov = M.tor = M.idx = null; enterTab(); if (M.det) loadDetail(); if (M.srch) loadRel(); return paint(); }
    if (a === 'integ') return openIntegrations();
    if (a === 'cal') { const on = (M.prefs ?? M.status?.settings ?? {}).calendar !== false; if (!on) return toast('Slå på «Vis i Kalender» i innstillingene for Media'); location.hash = '#/kalender'; return; }
    if (a === 'pauseall') return allToggle();
    if (a === 'alt') { try { const tr = await mapi('/altSpeed', { method: 'POST', json: { on: !M.tor?.transfer?.altSpeed } }); if (M.tor) M.tor.transfer = tr; toast(tr.altSpeed ? `Alt-hastighet på${tr.altLimitText ? ` · ${tr.altLimitText}` : ''}` : 'Alt-hastighet av'); } catch (er) { toast(er.message); } return paintMain(); }
    if (a === 'detback') { M.det = null; M.detail = null; enterTab(); return paint(); }
    if (a === 'srback') { M.srch = null; M.rel = null; return paint(); }
    if (a === 'sall') { const ids = (M.detail?.seasons ?? []).flatMap((s) => s.episodes).filter((x) => x.canSearch).map((x) => x.id); if (ids.length) return cmd({ name: 'EpisodeSearch', episodeIds: ids }, 'sall', `Søker etter ${ids.length} manglende episoder …`); return; }
    if (a === 'mauto') return cmd({ name: 'MoviesSearch', movieIds: [M.detail.id] }, 'mauto');
    if (a === 'minter') { M.srch = { k: 'm', id: M.detail.id, backL: M.detail.title }; M.fq = 'all'; loadRel(); return paintMain(); }
    if (a === 'add') { const k = M.tab === 'rad' ? 'm' : 's'; M.sh = 'add'; M.add = { k, q: '', list: null, sel: null, prof: k === 's' ? M.prof?.defaults?.sonarr ?? 'HD-1080p' : M.prof?.defaults?.radarr ?? 'Ultra-HD', mon: 'all', typ: 'standard', av: 'released', go: true }; Promise.resolve(loadProf()).then(() => { if (M.add && !M.add.sel) { const dflt = k === 's' ? M.prof?.defaults?.sonarr : M.prof?.defaults?.radarr; if (dflt) M.add.prof = dflt; } }); paintSheet(); root.querySelector('[name="aq"]')?.focus(); return; }
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
    if (n === 'aq' && M.add) { M.add.q = e.target.value; clearTimeout(lookT); lookT = setTimeout(lookup, 300); }
    if (n === 'mq' && M.mag) { M.mag.q = e.target.value; M.mag.err = ''; clearTimeout(magT); magT = setTimeout(magCheck, 250); }
    if (n === 'iq' && M.ix) { M.ix.q = e.target.value; clearTimeout(schT); schT = setTimeout(ixSchema, 300); }
    if (n?.startsWith('if_') && M.ix) M.ix.f[n.slice(3)] = e.target.value;
  });
  if (!keyBound) { keyBound = true; document.addEventListener('keydown', onKey, true); }
}
let keyBound = false;
function onKey(e) {
    if (e.key !== 'Escape' || !root?.isConnected || document.querySelector('#settings:not([hidden]),.ac-ov')) return;
    e.preventDefault(); e.stopPropagation();
    if (M.sh) return closeSheet();
    if (M.gl) { M.gl = null; return paint(); }
    if (M.srch) { M.srch = null; return paint(); }
    if (M.det) { M.det = null; enterTab(); return paint(); }
    close();
}

/* ---------------- Rute ---------------- */

function applyTheme() {
  if (!root) return;
  let mode = ''; try { mode = localStorage.getItem('kal_hl_mode') || ''; } catch { /* */ }
  const hl = document.documentElement.dataset.hl;
  const dark = hl !== '2c' || mode === 'mork' || (mode !== 'lys' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dk', dark);
}
let themeBound = false;
export function render() {
  setTimeout(() => {
    const r = document.getElementById('m43');
    if (!r || r.dataset.bound) return;
    r.dataset.bound = '1'; root = r;
    applyTheme();
    if (!themeBound) { themeBound = true; try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch { /* */ } addEventListener('storage', (e) => { if (e.key === 'kal_hl_mode') applyTheme(); }); document.addEventListener('hl:theme', applyTheme); }
    bind(r);
    wasNarrow = narrow();
    const onRz = () => { if (!root?.isConnected) { removeEventListener('resize', onRz); return; } if (narrow() !== wasNarrow) { wasNarrow = narrow(); paintMain(); } };
    addEventListener('resize', onRz);
    // #/media?tab=qb, ?magnet=… (registerProtocolHandler) eller ?open=sonarr:12
    const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const tab = { kom: 'kom', sonarr: 'son', son: 'son', radarr: 'rad', rad: 'rad', qbittorrent: 'qb', qb: 'qb', prowlarr: 'pro', pro: 'pro' }[q.get('tab') ?? ''];
    if (tab) M.tab = tab;
    M.det = null; M.srch = null;
    const op = q.get('open'); if (op) { const [svc, id] = op.split(':'); if (id) { openDet(svc === 'radarr' || svc === 'm' ? 'm' : 's', id); } }
    const mg = q.get('magnet'); if (mg) { M.tab = 'qb'; M.sh = 'mag'; M.mag = { q: decodeURIComponent(mg), cat: '', paused: false, sequential: false, firstLast: false, check: null, err: '' }; setTimeout(magCheck, 50); }
    M.missing = false; M.restricted = '';
    mapi('/status').then((s) => { M.status = s; M.prefs = s.settings ?? null; }).catch(() => {}).finally(() => paint());
    enterTab(); poll(); paint();
    if (!r.contains(document.activeElement)) r.focus({ preventScroll: true });
  });
  return `<div id="m43" class="m43" tabindex="-1" aria-label="Media"><div data-m43-top></div><div data-m43-gl></div><div class="m43-main" data-m43-main></div><div data-m43-toast></div><div data-m43-sh></div></div>`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && root?.isConnected) { enterTab(); poll(); } });
