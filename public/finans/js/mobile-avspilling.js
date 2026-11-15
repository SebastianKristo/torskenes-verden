// Prompt 44 (PWA44): Avspilling – Plex og Jellyfin, Tautulli-lignende (claude-code-avspilling-plex-jellyfin.md, fasit
// design/Avspilling.dc.html). Egen side (Mer → Avspilling, #/avspilling) og fane i Media etter Prowlarr (uten egen tittel).
// Faner: Spilles nå · Historikk · Statistikk · Biblioteker. «Logg inn med Plex» med PIN-flyt (token lagres på serveren).
// API (SERVER44): POST /api/playback/plex/pin → {id, code, authUrl}, GET /api/playback/plex/pin/:id, GET /api/playback/sessions,
// /history?q=&user=&page=, /stats?range=, /libraries. Alt tåler 404.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { loadCtl51, ctlBar51, audioNow51, linksHtml51, mountCtl51 } from '/assets/js/medctl51.js'; // prompt 51 (MEDCTL51): fjernkontroll i «Spilles nå»

const A = { tab: 'now', srv: 'plex', d: {}, err: {}, miss: false, t: {}, q: '', user: '', range: '30d', sumMiss: false, pin: null, poll: null, live: null };
const TABS = [['now', 'Spilles nå'], ['hist', 'Historikk'], ['stat', 'Statistikk'], ['lib', 'Biblioteker']];
const SC = { plex: '#e5a00d', jellyfin: '#aa5cc3' }; // prompt 45: tjenestefargene fra claude-code-media-mer-farger.md
const arr = (r, ...k) => { if (Array.isArray(r)) return r; for (const x of k) if (Array.isArray(r?.[x])) return r[x]; return []; };
const nbN = (n) => Number(n ?? 0).toLocaleString('nb-NO');
const AVC = ['#3b5d8a', '#7a5ad6', '#2f6b4a', '#b23a2a', '#a0671a', '#c2477a'];
const colOf = (s) => AVC[[...String(s ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVC.length];
const qsrv = () => `server=${encodeURIComponent(A.srv)}`;
async function get(key, path, max = 15000) {
  if (A.t[key] && Date.now() - A.t[key] < max) return;
  A.t[key] = Date.now();
  try { A.d[key] = await hlApi(path); A.err[key] = ''; A.miss = false; } catch (e) { if (e.status === 404) A.miss = true; A.err[key] = e.status === 404 ? '' : e.message; A.d[key] ??= null; }
}
export async function avsLoad(force = false) {
  if (force) A.t = {};
  const jobs = [get('now', `/playback/sessions?${qsrv()}`, 9000), loadCtl51(force)];
  if (A.tab === 'hist') jobs.push(get(`hist:${A.q}:${A.user}`, `/playback/history?${qsrv()}&q=${encodeURIComponent(A.q)}&user=${encodeURIComponent(A.user)}&page=1`));
  // Prompt 45 (claude-code-avspilling-statistikk-mobil.md): GET /api/playback/summary?range=7d|30d|year|all (alle servere), ellers /stats.
  if (A.tab === 'stat') jobs.push(A.sumMiss ? get(`stat:${A.range}`, `/playback/stats?${qsrv()}&range=${A.range === 'year' ? '12m' : A.range === 'all' ? '12m' : A.range}`, 60000) : getSum());
  if (A.tab === 'lib') jobs.push(get('lib', `/playback/libraries?${qsrv()}`, 60000));
  await Promise.all(jobs);
}
async function getSum() {
  const key = `sum:${A.range}`;
  if (A.t[key] && Date.now() - A.t[key] < 60000) return;
  A.t[key] = Date.now();
  try { A.d[key] = await hlApi(`/playback/summary?range=${A.range}`); A.err[key] = ''; }
  catch (e) { if (e.status === 404) { A.sumMiss = true; A.t[key] = 0; return get(`stat:${A.range}`, `/playback/stats?${qsrv()}&range=${A.range === '30d' || A.range === '7d' ? A.range : '12m'}`, 60000); } A.err[key] = e.message; A.d[key] ??= null; }
}
const reload = () => avsLoad().then(() => { if (vis()) draw(); }).catch(() => {});
if (typeof document !== 'undefined') mountCtl51(() => { if (vis()) draw(); });
const vis = () => m.screen === 'avspilling' || (m.screen === 'media' && globalThis.P43?.media?.M?.tab === 'avs');
const pst = (x, w = 64) => `<span class="p44a-pst" style="width:${w}px;background-color:${colOf(x.title ?? x.t)}${x.poster || x.thumb ? `;background-image:url('${esc(x.poster ?? x.thumb)}')` : ''}"></span>`;
const pct = (v) => Math.max(0, Math.min(100, Math.round(+v || 0)));
function srvState() {
  const S = A.d.now?.servers ?? {};
  return ['plex', 'jellyfin'].map((k) => ({ k, n: k === 'plex' ? 'Plex' : 'Jellyfin', on: !!(S[k]?.connected ?? S[k]?.ok), v: S[k]?.version ?? '', name: S[k]?.name ?? '', n2: S[k]?.streams ?? null }));
}
function nowView() {
  const r = A.d.now; if (r === undefined) return '<div class="m-spin"></div>';
  const S = srvState().find((s) => s.k === A.srv);
  if (S && !S.on && A.srv === 'plex') return plexLogin();
  if (S && !S.on) return `<div class="p44a-empty"><b>Jellyfin er ikke koblet til</b><span>Legg inn adresse og API-nøkkel (eller Quick Connect) under Integrasjoner → Jellyfin.</span><a class="p44a-btn" href="#/set/integ">Åpne Integrasjoner ›</a></div>`;
  const L = arr(r, 'items', 'sessions').filter((x) => !x.server || x.server === A.srv), K = r?.kpi ?? r?.summary ?? {};
  const bw = K.bandwidth ?? L.reduce((a, x) => a + (+x.bitrate || 0), 0);
  const kpi = [[String(L.length), 'strømmer nå'], [K.bandwidthText ?? (bw ? `${Math.round(bw * 10) / 10} Mbit/s` : '0'), 'båndbredde'], [nbN(K.weekPlays ?? K.week ?? 0), 'sett denne uka'], [nbN(K.users ?? new Set(L.map((x) => x.user)).size), 'brukere']];
  return `<div class="p44a-kpi">${kpi.map(([v, l]) => `<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>
    ${L.length ? L.map((x) => { const tr = /trans/i.test(x.decision ?? x.transcode?.video ?? x.video ?? ''), p = pct((x.progress ?? x.percent) <= 1 && (x.progress ?? 0) > 0 ? x.progress * 100 : x.progress ?? x.percent), bf = pct((x.buffer ?? 0) <= 1 && x.buffer > 0 ? x.buffer * 100 : x.buffer ?? p);
      const chips = Array.isArray(x.chips) ? x.chips.map((c) => (typeof c === 'string' ? c : c.text ?? c.t ?? '')).filter(Boolean) : [x.resolution ?? x.quality, x.hdr, x.audio, x.bitrate ? `${x.bitrate} Mbit/s` : ''].filter(Boolean);
      return `<div class="p44a-ses">${pst(x, 70)}<div class="m-grow"><span class="p44a-st ${tr ? 'tr' : 'dp'}">${esc(x.decisionText ?? (tr ? 'Omkoder' : 'Direkte avspilling'))}</span><small class="p44a-dev">${esc([x.device, x.platform, x.player].filter(Boolean).join(' · '))}</small>
        <b class="p44a-t">${esc(x.show ?? x.title ?? '')}</b>${x.subtitle || x.show ? `<small>${esc(x.subtitle ?? [x.episode ?? '', x.title].filter(Boolean).join(' · '))}</small>` : ''}
        ${chips.length ? `<span class="p44a-chips">${chips.map((c) => `<i>${esc(c)}</i>`).join('')}</span>` : ''}
        <span class="p44a-bar" style="--c:${SC[A.srv]}"><i class="b" style="width:${bf}%"></i><i class="p" style="width:${p}%"></i></span>
        <span class="p44a-u"><span class="p44a-av" style="background:${colOf(x.user)}">${esc(x.userInitial ?? String(x.user ?? '?').slice(0, 1).toUpperCase())}</span>${esc(x.user ?? '')}<span class="m-grow"></span>${x.remainingText ? esc(x.remainingText) : x.left ?? x.minutesLeft ? `${esc(String(x.left ?? `${x.minutesLeft} min`))} igjen` : `${p} %`}</span>${ctlBar51(x.id)}</div></div>`; }).join('') : '<div class="p44a-empty"><b>Ingen spiller noe akkurat nå</b><span>Strømmene vises her med en gang noen begynner å se.</span></div>'}${audioNow51()}${linksHtml51()}`;
}
function plexLogin() {
  const P = A.pin;
  return `<div class="p44a-empty plex"><b>Koble til Plex</b><span>Logg inn hos Plex – vi får aldri passordet ditt. Tokenet lagres kryptert på hjemmeserveren.</span>
    ${P ? `<span class="p44a-code">Venter på godkjenning … kode <b>${esc(P.code)}</b></span><a class="p44a-btn plexb" href="${esc(P.authUrl)}" target="_blank" rel="noopener">Åpne Plex igjen</a><button type="button" class="p44a-btn ghost" data-p44a="pinx">Avbryt</button>`
      : '<button type="button" class="p44a-btn plexb" data-p44a="pin">Logg inn med Plex</button>'}</div>`;
}
function histView() {
  const k = `hist:${A.q}:${A.user}`, r = A.d[k];
  const items = arr(r, 'items', 'history'), users = arr(r, 'users').map((u) => (typeof u === 'string' ? u : u.name ?? u.user));
  return `<form class="p44a-q" data-p44af="hq"><span aria-hidden="true">⌕</span><input name="q" value="${esc(A.q)}" placeholder="Søk i tittel, bruker eller enhet" autocomplete="off" enterkeyhint="search" aria-label="Søk i historikken"></form>
    ${users.length ? `<div class="p44a-users"><button type="button" class="${A.user ? '' : 'on'}" data-p44a="user" data-k="">Alle</button>${users.map((u) => `<button type="button" class="${A.user === u ? 'on' : ''}" data-p44a="user" data-k="${esc(u)}"><span class="p44a-av" style="background:${colOf(u)}">${esc(String(u).slice(0, 1).toUpperCase())}</span>${esc(u)}</button>`).join('')}</div>` : ''}
    ${r === undefined ? '<div class="m-spin"></div>' : items.length ? `<div class="p44a-hist">${items.map((x) => { const p = pct(x.percent ?? x.watched); const d = new Date(x.when ?? x.at ?? x.started ?? x.date ?? '');
      return `<div class="p44a-hr">${pst(x, 40)}<span class="m-grow"><b>${esc(x.show ?? x.title ?? '')}</b><small>${esc([x.subtitle ?? (x.show ? x.episode ?? x.title : ''), x.user, x.device].filter(Boolean).join(' · '))}</small><span class="p44a-w"><span class="p44a-wb"><i style="width:${p}%;background:${p >= 90 ? '#2f6b4a' : 'var(--pp-mut)'}"></i></span>${p} %</span></span><small class="p44a-when">${esc(x.whenText ?? (isNaN(d) ? '' : d.toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })))}${x.durationText || x.duration ? `<br>${esc(String(x.durationText ?? x.duration))}` : ''}</small></div>`; }).join('')}</div>` : `<div class="p44a-empty"><b>Ingen historikk${A.q ? ` for «${esc(A.q)}»` : ''}</b><span>Avspillinger logges hvert minutt fra Plex og Jellyfin.</span></div>`}`;
}
const RANGES = [['7d', '7 d'], ['30d', '30 d'], ['year', 'År'], ['all', 'Alt']];
function statView() {
  const seg = `<span class="p44a-seg p45-aseg" role="radiogroup" aria-label="Periode">${RANGES.map(([k, n]) => `<button type="button" role="radio" aria-checked="${A.range === k}" class="${A.range === k ? 'on' : ''}" data-p44a="range" data-k="${k}">${n}</button>`).join('')}</span>`;
  if (!A.sumMiss) return seg + sumView(A.d[`sum:${A.range}`], A.err[`sum:${A.range}`]);
  const r = A.d[`stat:${A.range}`];
  if (r === undefined) return seg + '<div class="m-spin"></div>';
  const per = arr(r, 'perDay', 'days', 'plays'), mx = Math.max(1, ...per.map((x) => +(x.n ?? x.count ?? 0)));
  const list = (t, L, f) => (L.length ? `<span class="p44a-lab">${t}</span><div class="p44a-card">${L.slice(0, 6).map(f).join('')}</div>` : '');
  return `${seg}<span class="p44a-lab">AVSPILLINGER PER DAG</span><div class="p44a-chart">${per.map((x) => { const n = +(x.n ?? x.count ?? 0); return `<span title="${esc(String(x.d ?? x.date))}: ${n}"><i style="height:${Math.round((n / mx) * 100)}%"></i><small>${esc(String(x.l ?? x.label ?? x.d ?? x.date ?? '').slice(-2))}</small></span>`; }).join('') || '<small class="p44a-dim">Ingen data ennå.</small>'}</div>
    ${list('MEST SETTE SERIER', arr(r, 'topShows', 'shows'), (x, i) => `<div class="p44a-li"><b>${i + 1}</b><span class="m-grow">${esc(x.t ?? x.title ?? x.name)}</span><small>${nbN(x.plays ?? x.n)} avspillinger</small></div>`)}
    ${list('MEST AKTIVE BRUKERE', arr(r, 'topUsers', 'users'), (x) => `<div class="p44a-li"><span class="p44a-av" style="background:${colOf(x.name ?? x.user)}">${esc(String(x.name ?? x.user ?? '?').slice(0, 1).toUpperCase())}</span><span class="m-grow">${esc(x.name ?? x.user)}</span><small>${esc(x.hoursText ?? `${String(x.hours ?? x.h ?? 0).replace('.', ',')} t`)}</small></div>`)}
    ${list('PLATTFORMER', arr(r, 'platforms'), (x) => `<div class="p44a-li"><span class="m-grow">${esc(x.name ?? x.platform)}</span><span class="p44a-wb wide"><i style="width:${pct(x.pct ?? x.percent)}%;background:${SC[A.srv]}"></i></span><small>${pct(x.pct ?? x.percent)} %</small></div>`)}`;
}
/** Prompt 45: mobilversjonen av statistikksiden (én kolonne, kort i Papir-stil). Fasit: Avspilling.dc.html (web). */
function sumView(r, err) {
  if (r === undefined) return '<div class="m-spin"></div>';
  if (!r) return `<div class="p44a-empty"><b>Fikk ikke hentet statistikken</b><span>${esc(err || 'Prøv igjen om litt.')}</span><button type="button" class="p44a-btn" data-p44a="retry">Prøv igjen</button></div>`;
  const T = r.total ?? {}, per = arr(r, 'perDay'), mx = Math.max(1, ...per.map((x) => +(x.count ?? x.n ?? 0)));
  const tile = (v, l, c) => `<span class="p45-at"><b style="color:${c}">${esc(v)}</b><small>${esc(l)}</small></span>`;
  const top = (t, L) => (L.length ? `<span class="p44a-lab">${t}</span><div class="p44a-card">${L.slice(0, 5).map((x, i) => `<div class="p44a-li"><b class="p45-an">${i + 1}</b><span class="m-grow m-ell">${esc(x.title ?? x.name ?? '')}</span><small>${nbN(x.plays ?? x.n)} ${(x.plays ?? x.n) === 1 ? 'gang' : 'ganger'}</small></div>`).join('')}</div>` : '');
  const users = arr(r, 'perUser'), devs = arr(r, 'perDevice'), hist = arr(r, 'history');
  return `<div class="p45-atiles">${tile(nbN(T.plays ?? 0), 'avspillinger', '#e5a00d')}${tile(T.hoursText ?? `${nbN(T.hours ?? 0)} t`, 'sett totalt', '#aa5cc3')}${tile(nbN(T.titles ?? 0), 'titler', '#35c5f4')}${tile(nbN(T.users ?? 0), T.users === 1 ? 'bruker' : 'brukere', '#2f6b4a')}</div>
    <span class="p44a-lab">AVSPILLINGER PER DAG</span><div class="p44a-chart">${per.slice(-31).map((x) => { const n = +(x.count ?? x.n ?? 0); return `<span title="${esc(String(x.date ?? ''))}: ${n}"><i style="height:${Math.round((n / mx) * 100)}%"></i><small>${esc(String(x.date ?? '').slice(-2))}</small></span>`; }).join('') || '<small class="p44a-dim">Ingen avspillinger i perioden.</small>'}</div>
    ${top('MEST SETTE SERIER', arr(r, 'topShows'))}${top('MEST SETTE FILMER', arr(r, 'topMovies'))}
    ${users.length ? `<span class="p44a-lab">PER BRUKER</span><div class="p44a-card">${users.slice(0, 8).map((x) => `<div class="p44a-li"><span class="p44a-av" style="background:${colOf(x.name)}">${esc(String(x.name ?? '?').slice(0, 1).toUpperCase())}</span><span class="m-grow m-ell">${esc(x.name ?? '')}</span><small>${nbN(x.plays)} · ${esc(x.hoursText ?? `${x.hours ?? 0} t`)}</small></div>`).join('')}</div>` : ''}
    ${devs.length ? `<span class="p44a-lab">PER ENHET</span><div class="p44a-card">${devs.slice(0, 8).map((x) => `<div class="p44a-li"><span class="m-grow m-ell">${esc(x.name ?? x.platform ?? '')}<small class="p45-adim"> ${esc(x.platform && x.name ? x.platform : '')}</small></span><span class="p44a-wb wide"><i style="width:${pct(x.pct)}%;background:#3d7dd6"></i></span><small>${pct(x.pct)} %</small></div>`).join('')}</div>` : ''}
    ${hist.length ? `<span class="p44a-lab">HISTORIKK</span><div class="p44a-card">${hist.slice(0, 12).map((x) => `<div class="p44a-li"><span class="p45-asrv" style="background:${x.server === 'jellyfin' ? '#aa5cc3' : '#e5a00d'}" aria-hidden="true"></span><span class="m-grow"><b class="m-ell">${esc(x.title ?? '')}</b><small class="p45-adim">${esc([x.subtitle, x.user, x.device].filter(Boolean).join(' · '))}</small></span><small>${esc(x.whenText ?? '')}${x.percent != null ? `<br>${pct(x.percent)} %` : ''}</small></div>`).join('')}</div>` : ''}`;
}
function libView() {
  const r = A.d.lib; if (r === undefined) return '<div class="m-spin"></div>';
  const L = arr(r, 'items', 'libraries');
  return L.length ? `<div class="p44a-libs">${L.map((x) => `<div class="p44a-lib"><span class="p44a-lab">${esc(String(x.type ?? '').toUpperCase())}</span><b>${esc(x.title ?? x.name)}</b><span class="p44a-big">${esc(x.countText ?? nbN(x.count ?? x.items))}</span><small>${esc([x.sizeText ?? x.size, x.duration ?? x.playtime, x.lastAdded ? `sist lagt til: ${typeof x.lastAdded === 'string' ? x.lastAdded : x.lastAdded.title ?? ''}` : ''].filter(Boolean).join(' · '))}</small></div>`).join('')}</div>` : '<div class="p44a-empty"><b>Ingen biblioteker</b><span>Koble til Plex eller Jellyfin først.</span></div>';
}
export function avsView(embedded = false) {
  if (!A.t.now) reload();
  if (A.miss && !A.d.now) return `${embedded ? '' : ''}<div class="p44a-empty"><b>Avspilling er ikke tilgjengelig ennå</b><span>Krever en nyere Homelab-server.</span></div>`;
  const S = srvState(), on = S.find((s) => s.k === A.srv);
  return `<div class="p44a${embedded ? ' emb' : ''}">
    <div class="p44a-srv">${S.map((s) => `<button type="button" class="${A.srv === s.k ? 'on' : ''}" data-p44a="srv" data-k="${s.k}"><i style="background:${s.on ? '#3fbf7a' : '#b9b2a4'}"></i>${s.n}</button>`).join('')}</div>
    ${on?.on ? `<span class="p44a-line">${esc([on.name || on.n, on.v ? `v${on.v}` : '', on.n2 != null ? `${on.n2} strømmer` : ''].filter(Boolean).join(' · '))}</span>` : ''}
    <div class="p44a-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" aria-selected="${A.tab === k}" class="${A.tab === k ? 'on' : ''}" data-p44a="tab" data-k="${k}">${n}</button>`).join('')}</div>
    ${A.err.now && A.tab === 'now' ? `<div class="p44a-empty"><b>Svarer ikke</b><span>${esc(A.err.now)}</span><button type="button" class="p44a-btn" data-p44a="retry">Prøv igjen</button></div>` : A.tab === 'now' ? nowView() : A.tab === 'hist' ? histView() : A.tab === 'stat' ? statView() : libView()}</div>`;
}
export function avsAfter() {
  const v = vis();
  if (v && !A.live) A.live = setInterval(() => { if (!vis()) return; if (A.tab === 'now') { A.t.now = 0; reload(); } }, 10000);
  if (!v && A.live) { clearInterval(A.live); A.live = null; }
}
async function pinStart() {
  try {
    const r = await hlApi('/playback/plex/pin', { method: 'POST', json: {} });
    A.pin = { id: r.id, code: r.code, authUrl: r.authUrl, t0: Date.now() }; draw();
    try { window.open(r.authUrl, '_blank', 'noopener'); } catch {}
    clearInterval(A.poll);
    A.poll = setInterval(async () => {
      if (!A.pin || Date.now() - A.pin.t0 > 5 * 60e3) { clearInterval(A.poll); if (A.pin) { A.pin = null; flash('Plex-innloggingen gikk ut på tid'); draw(); } return; }
      try { const s = await hlApi(`/playback/plex/pin/${encodeURIComponent(A.pin.id)}`); if (s?.status === 'expired') { clearInterval(A.poll); A.pin = null; flash('Plex-koden gikk ut · prøv igjen'); draw(); return; } if (s?.status === 'ok' || s?.ok === true || s?.done || s?.connected) { clearInterval(A.poll); A.pin = null; haptic('ok'); flash('Koblet til Plex ✓'); A.t = {}; reload(); } } catch {}
    }, 2000);
  } catch (e) { flash(e.status === 404 ? 'Krever en nyere Homelab-server' : e.message, 'err'); }
}
export function avsInput() { return false; }
export async function avsSubmit(e, f) { if (!f.matches?.('[data-p44af="hq"]')) return false; e.preventDefault(); A.q = String(f.q.value ?? '').trim(); draw(); await avsLoad(); draw(); return true; }
export async function avsBind(e, t) {
  const x = t.closest?.('[data-p44a]'); if (!x) return false;
  e.preventDefault(); const a = x.dataset.p44a, k = x.dataset.k;
  if (a === 'tab') { A.tab = k; haptic('tab'); draw(); reload(); return true; }
  if (a === 'srv') { A.srv = k; A.t = {}; A.d = {}; haptic('tab'); draw(); reload(); return true; }
  if (a === 'user') { A.user = k; draw(); reload(); return true; }
  if (a === 'range') { A.range = k; draw(); reload(); return true; }
  if (a === 'retry') { A.t = {}; reload(); return true; }
  if (a === 'pin') { await pinStart(); return true; }
  if (a === 'pinx') { clearInterval(A.poll); A.pin = null; draw(); return true; }
  return false;
}
