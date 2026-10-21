// Prompt 44 (claude-code-avspilling-plex-jellyfin.md): «Avspilling» – fanen etter Prowlarr i Media (innhold som siden, uten tittel).
// Fasit: design/Avspilling.dc.html. Plex · Jellyfin (prikk = tilkoblet), faner Spilles nå · Historikk · Statistikk · Biblioteker,
// serverlinje i mono. Logg inn med Plex (PIN-flyt): POST /api/playback/plex/pin → {id, code, authUrl}, GET …/pin/:id til
// tokenet er lagret på serveren (det kommer aldri hit). Data: GET /api/playback/sessions · history?q=&user=&page= · stats?range= ·
// libraries (alle med ?server=plex|jellyfin). 404 (eldre server): tomtilstand.
import { esc } from './util.js';

const P = { srv: 'plex', sec: 'now', hq: '', user: '', range: '7d', d: {}, err: {}, login: null, t: 0, host: null };
try { const s = localStorage.getItem('pb44_srv'); if (s === 'plex' || s === 'jellyfin') P.srv = s; } catch { /* */ }
const SEC = [['now', 'Spilles nå'], ['hist', 'Historikk'], ['stat', 'Statistikk'], ['lib', 'Biblioteker']];
const COL = { plex: '#e5a00d', jellyfin: '#7a5ad6' };
async function j(path, opt = {}) {
  const r = await fetch(`/api/playback${path}`, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers ?? {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Feil ${r.status}`), { status: r.status, data: d });
  return d;
}
const q = (o) => { const u = new URLSearchParams({ server: P.srv, ...o }); return `?${u}`; };
async function load(k, path) {
  try { P.d[k] = await j(path); P.err[k] = ''; } catch (e) { P.err[k] = e.status === 404 ? 'missing' : e.message; if (e.data?.needLogin || e.data?.configured === false) P.d[k] = { configured: false, ...(e.data ?? {}) }; }
  paint();
}
function enter() {
  if (P.sec === 'now') load('now', `/sessions${q()}`);
  if (P.sec === 'hist') load('hist', `/history${q({ q: P.hq, user: P.user, page: '1' })}`);
  if (P.sec === 'stat') load('stat', `/stats${q({ range: P.range })}`);
  if (P.sec === 'lib') load('lib', `/libraries${q()}`);
}
const arr = (x, k) => (Array.isArray(x) ? x : x?.[k] ?? x?.items ?? []);
const ini = (n) => String(n ?? '?').trim().slice(0, 1).toUpperCase();
const pct = (v) => Math.max(0, Math.min(100, Math.round(+v || 0)));
const dur = (s) => { s = +s || 0; if (s > 1e5) s = Math.round(s / 1000); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} t ${m} min` : `${m} min`; };
const poster = (u, cls = 'pb44-po') => `<span class="${cls}"${u ? ` style="background-image:url('${esc(u)}')"` : ''}></span>`;

function needLogin(d) { const sv = d?.servers?.[P.srv]; return !!d && (d.configured === false || d.needLogin || d.loggedIn === false || (sv && (sv.configured === false || sv.connected === false && sv.needLogin))); }
function loginHtml() {
  const L = P.login;
  if (P.srv === 'jellyfin') return `<div class="pb44-login"><div><span class="pb44-k" style="color:${COL.jellyfin}">JELLYFIN</span><b>Koble til Jellyfin</b><span>Legg inn adressen og en API-nøkkel (Jellyfin → Kontrollpanel → API-nøkler) under Innstillinger → Integrasjoner → Jellyfin.</span></div><button type="button" class="pb44-b" data-pb44="integ">Åpne Integrasjoner</button></div>`;
  return `<div class="pb44-login"><div><span class="pb44-k" style="color:${COL.plex}">PLEX</span><b>Koble til Plex-kontoen din</b><span>Du logger inn hos Plex i et nytt vindu. Homelab får en nøkkel, finner serverne dine og henter historikk, brukere og biblioteker. Passordet ditt ser vi aldri.</span></div>
    <div class="pb44-lr"><button type="button" class="pb44-plex" data-pb44="plex"${L?.busy ? ' disabled' : ''}>${L?.code ? 'Åpne Plex igjen' : 'Logg inn med Plex'}</button>${L?.code ? `<span class="pb44-mut">Venter på godkjenning i Plex-vinduet … kode <b class="mono">${esc(L.code)}</b></span>` : ''}${L?.err ? `<span class="pb44-err">${esc(L.err)}</span>` : ''}</div></div>`;
}
function nowHtml() {
  const d = P.d.now; if (!d) return '<div class="pb44-skel"></div>';
  if (needLogin(d)) return loginHtml();
  const S = arr(d, 'sessions').filter((s) => !s.server || s.server === P.srv), K = d.kpi ?? d.kpis ?? d.summary ?? {};
  const kp = [['STRØMMER NÅ', String(K.streams ?? S.length), K.streamsSub ?? `${S.filter((s) => /transcod|omkod/i.test(s.decision ?? s.state ?? '')).length} omkodes`], ['BÅNDBREDDE', K.bandwidthText ?? K.bandwidth ?? '–', K.bandwidthSub ?? 'nå'], ['SETT DENNE UKA', String(K.weekText ?? K.weekPlays ?? K.week ?? '–'), K.weekSub ?? 'avspillinger'], ['BRUKERE', String(K.users ?? new Set(S.map((s) => s.user)).size), K.usersSub ?? 'aktive nå']];
  const card = (s) => {
    const tr = /transcod|omkod/i.test(s.decision ?? s.videoDecision ?? s.stream ?? ''), c = COL[s.server] ?? COL[P.srv];
    const tags = [s.resolution, s.hdr, s.audio, s.bitrateText, s.transcodeText, s.cpuText].concat(s.chips ?? s.tags ?? []).map((x) => (typeof x === 'string' ? x : x?.text ?? x?.t ?? '')).filter(Boolean);
    return `<div class="pb44-s"><div class="pb44-sh">${poster(s.poster ?? s.thumb)}<div class="pb44-st"><div class="pb44-sr"><span class="pb44-dec ${tr ? 'tr' : 'dp'}">${esc(s.decisionText ?? (tr ? 'Omkoder' : 'Direkte avspilling'))}</span><span class="pb44-mut">${esc(s.device ?? s.player ?? '')}</span></div><b>${esc(s.title ?? '')}</b><span class="pb44-mut">${esc(s.subtitle ?? s.episode ?? '')}</span><div class="pb44-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div></div></div>
      <div class="pb44-pr"><span class="pb44-bar"><i class="buf" style="width:${pct(s.buffer ?? s.bufferPct ?? s.progress)}%"></i><i style="width:${pct(s.progress)}%;background:${c}"></i></span><div class="pb44-pm"><span class="mono">${esc(s.positionText ?? (s.position != null ? dur(s.position) : ''))}</span><span class="pb44-u"><span class="pb44-av">${esc(ini(s.user))}</span>${esc(s.user ?? '')}</span><span class="mono">${esc(s.remainingText ?? s.leftText ?? s.durationText ?? '')}</span></div></div></div>`;
  };
  return `<div class="pb44-kpis">${kp.map(([l, v, s]) => `<div class="pb44-kpi"><span class="pb44-k">${l}</span><b>${esc(v)}</b><span class="pb44-mut">${esc(s)}</span></div>`).join('')}</div>
    <div class="pb44-h"><b>Spilles nå</b><span class="pb44-mut">${S.length} ${S.length === 1 ? 'strøm' : 'strømmer'}</span></div>
    ${S.length ? `<div class="pb44-ss">${S.map(card).join('')}</div>` : '<span class="pb44-mut pb44-pad">Ingen ser på noe akkurat nå.</span>'}`;
}
function histHtml() {
  const d = P.d.hist; if (!d) return '<div class="pb44-skel"></div>';
  if (needLogin(d)) return loginHtml();
  const H = arr(d, 'history'), U = (d.users ?? [...new Set(H.map((h) => h.user).filter(Boolean))].map((n) => ({ name: n }))).map((u) => ({ id: u.id ?? u.name, name: u.name }));
  return `<div class="pb44-hf"><label class="pb44-q"><span aria-hidden="true">⌕</span><input name="pb44q" value="${esc(P.hq)}" placeholder="Søk i historikk: tittel, bruker eller enhet" autocomplete="off" data-glimt="off"></label>${[{ id: '', name: 'Alle' }, ...U].map((u) => `<button type="button" class="pb44-up${P.user === (u.id ?? u.name) ? ' on' : ''}" data-pb44-user="${esc(u.id ?? u.name)}">${u.id ? `<span class="pb44-av">${esc(ini(u.name))}</span>` : ''}${esc(u.name)}</button>`).join('')}</div>
    <div class="pb44-tbl"><div class="pb44-tr th"><span>NÅR</span><span></span><span>TITTEL</span><span>BRUKER</span><span>ENHET</span><span>VARIGHET</span><span>SETT</span></div>
    ${H.map((h) => { const pc = pct(h.percent ?? h.watched); return `<div class="pb44-tr"><span class="mono pb44-mut">${esc(h.whenText ?? h.when ?? '')}</span>${poster(h.poster ?? h.thumb, 'pb44-po sm')}<span class="pb44-tt"><b>${esc(h.title ?? '')}</b><span class="pb44-mut">${esc(h.subtitle ?? h.episode ?? '')}</span></span><span class="pb44-u"><span class="pb44-av">${esc(ini(h.user))}</span>${esc(h.user ?? '')}</span><span class="pb44-mut">${esc(h.device ?? h.platform ?? '')}</span><span class="mono">${esc(h.durationText ?? dur(h.duration))}</span><span class="pb44-pc"><span class="pb44-bar sm"><i style="width:${pc}%;background:${pc >= 90 ? '#2f8a5a' : COL[P.srv]}"></i></span><span class="mono">${pc} %</span></span></div>`; }).join('') || '<div class="pb44-mut pb44-pad">Ingen treff.</div>'}</div>`;
}
function statHtml() {
  const d = P.d.stat; if (!d) return '<div class="pb44-skel"></div>';
  if (needLogin(d)) return loginHtml();
  const B = (d.perDay ?? arr(d, 'days')).map((b) => ({ ...b, plays: b.plays ?? b.count, label: b.label ?? (b.date ? String(b.date).slice(8, 10) : '') })), max = Math.max(1, ...B.map((b) => +b.plays || +b.count || 0));
  const tops = [['MEST SETTE SERIER', (d.topShows ?? d.top ?? []).map((r) => ({ name: r.title ?? r.name, v: r.plays != null ? `${r.plays}` : r.v }))], ['MEST AKTIVE BRUKERE', (d.topUsers ?? []).map((r) => ({ name: r.name, v: r.hoursText ?? r.v }))], ['PLATTFORMER', (d.platforms ?? []).map((r) => ({ name: r.name, v: r.pct != null ? `${r.pct} %` : r.v }))]];
  return `<div class="pb44-seg">${[['7d', '7 dager'], ['30d', '30 dager'], ['12m', '12 mnd']].map(([k, n]) => `<button type="button" class="${P.range === k ? 'on' : ''}" data-pb44-range="${k}">${n}</button>`).join('')}</div>
    <div class="pb44-card"><div class="pb44-h"><span class="pb44-k">AVSPILLINGER PER DAG</span><span class="pb44-mut">${esc(d.playsText ?? `${d.total ?? B.reduce((a, b) => a + (+b.plays || 0), 0)} avspillinger`)}</span></div><div class="pb44-bars">${B.map((b) => { const v = +b.plays || +b.count || 0; return `<div class="pb44-bc"><div style="height:${Math.round((v / max) * 100)}%;background:${COL[P.srv]}" title="${v}"></div><span class="mono">${esc(b.label ?? b.l ?? '')}</span></div>`; }).join('') || '<span class="pb44-mut">Ingen data ennå.</span>'}</div></div>
    <div class="pb44-tops">${tops.map(([h, L]) => `<div class="pb44-card"><span class="pb44-k">${h}</span>${(L ?? []).slice(0, 6).map((r, i) => `<div class="pb44-trw"><span class="mono pb44-mut">${i + 1}</span><span class="pb44-tn">${esc(r.name ?? r.title ?? r.n ?? '')}</span><span class="mono">${esc(r.valueText ?? r.v ?? r.value ?? '')}</span></div>`).join('') || '<span class="pb44-mut">Ingen data ennå.</span>'}</div>`).join('')}</div>`;
}
function libHtml() {
  const d = P.d.lib; if (!d) return '<div class="pb44-skel"></div>';
  if (needLogin(d)) return loginHtml();
  const L = arr(d, 'libraries').filter((l) => !l.server || l.server === P.srv).map((l) => ({ ...l, name: l.name ?? l.title }));
  return `<div class="pb44-libs">${L.map((l) => `<div class="pb44-card"><div class="pb44-lh"><span class="pb44-li">${esc(l.icon ?? (/(film|movie)/i.test(l.type ?? l.name) ? '▶' : /musikk|music/i.test(l.type ?? l.name) ? '♪' : '▦'))}</span><b>${esc(l.name ?? '')}</b></div><div class="pb44-lx">${[[l.countText ?? l.count, l.countLabel ?? 'titler'], [l.sizeText, 'på disk'], [l.durationText, 'spilletid']].filter(([v]) => v != null && v !== '').map(([v, s]) => `<div><b>${esc(String(v))}</b><span class="pb44-mut">${esc(s)}</span></div>`).join('')}</div><span class="pb44-mut">${esc(l.lastAddedText ?? (l.lastAdded ? `Sist lagt til: ${l.lastAdded}` : ''))}</span></div>`).join('') || '<span class="pb44-mut">Ingen biblioteker.</span>'}</div>`;
}
export function pbHtml() {
  const k = P.sec, e = P.err[k];
  const srvLine = P.d[k]?.serverLine ?? P.d.now?.serverLine ?? '';
  const head = `<div class="pb44-top"><div class="pb44-srv">${[['plex', 'Plex'], ['jellyfin', 'Jellyfin']].map(([s, n]) => `<button type="button" class="${P.srv === s ? 'on' : ''}" data-pb44-srv="${s}"><span style="background:${P.d.status?.[s]?.connected === false ? '#a39d90' : COL[s]}"></span>${n}</button>`).join('')}</div>
    <div class="pb44-secs" role="tablist">${SEC.map(([s, n]) => `<button type="button" role="tab" aria-selected="${k === s}" data-pb44-sec="${s}">${n}</button>`).join('')}</div><span class="pb44-sp"></span><span class="mono pb44-mut">${esc(srvLine)}</span></div>`;
  let body;
  if (e === 'missing') body = '<div class="pb44-login"><div><b>Avspilling er ikke klart på serveren ennå</b><span>Serveren mangler /api/playback. Oppdater Nordlys, og logg inn med Plex eller legg inn Jellyfin under Integrasjoner.</span></div></div>';
  else if (e) body = `<div class="pb44-login"><div><b>Fikk ikke hentet data</b><span>${esc(e)}</span></div><button type="button" class="pb44-b" data-pb44="retry">Prøv igjen</button></div>`;
  else body = k === 'hist' ? histHtml() : k === 'stat' ? statHtml() : k === 'lib' ? libHtml() : nowHtml();
  return `<div class="pb44">${head}${body}</div>`;
}
function paint() {
  const h = P.host; if (!h?.isConnected) return;
  const a = document.activeElement, keep = h.contains(a) && a.name ? { n: a.name, p: a.selectionStart } : null;
  h.innerHTML = pbHtml();
  if (keep) { const n = h.querySelector(`[name="${keep.n}"]`); if (n) { n.focus(); try { n.setSelectionRange(keep.p, keep.p); } catch { /* */ } } }
}
async function plexLogin() {
  const w = window.open('about:blank', 'plexauth', 'width=600,height=720');
  P.login = { busy: true }; paint();
  try {
    const r = await j('/plex/pin', { method: 'POST', body: JSON.stringify({ forwardUrl: `${location.origin}/#/media/avspilling` }) });
    P.login = { id: r.id, code: r.code, busy: false };
    if (w) w.location.href = r.authUrl; else window.open(r.authUrl, '_blank', 'noopener');
    paint();
    const t0 = Date.now();
    while (P.login?.id === r.id && Date.now() - t0 < 5 * 60_000) {
      await new Promise((ok) => setTimeout(ok, 2000));
      const s = await j(`/plex/pin/${encodeURIComponent(r.id)}`).catch(() => null);
      if (s?.status === 'ok' || s?.ok || s?.linked || s?.authorized) { P.login = null; try { w?.close(); } catch { /* */ } P.d = {}; enter(); return; }
      if (s?.status === 'expired' || s?.expired) { P.login = { err: 'Koden gikk ut. Prøv igjen.' }; paint(); return; }
    }
    if (P.login?.id === r.id) { P.login = { err: 'Fikk ikke svar fra Plex innen 5 minutter. Prøv igjen.' }; paint(); }
  } catch (e) { try { w?.close(); } catch { /* */ } P.login = { err: e.status === 404 ? 'Serveren har ikke Plex-innlogging ennå.' : e.message }; paint(); }
}
let qT = 0;
/** Monteres i Media-fanen (host er et element som beholdes mellom tegningene). */
export function mountPlayback(host) {
  if (P.host === host && host.dataset.pb44) { enter(); return; }
  P.host = host; host.dataset.pb44 = '1';
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.pb44Srv) { P.srv = d.pb44Srv; try { localStorage.setItem('pb44_srv', P.srv); } catch { /* */ } P.d = { status: P.d.status }; P.err = {}; paint(); enter(); return; }
    if (d.pb44Sec) { P.sec = d.pb44Sec; paint(); enter(); return; }
    if (d.pb44User != null) { P.user = d.pb44User; enter(); return; }
    if (d.pb44Range) { P.range = d.pb44Range; enter(); return; }
    if (d.pb44 === 'plex') { plexLogin(); return; }
    if (d.pb44 === 'retry') { P.err = {}; enter(); return; }
    if (d.pb44 === 'integ') { import('./settings.js').then((m) => m.openSettings('int')).catch(() => {}); }
  });
  host.addEventListener('input', (e) => { if (e.target.name !== 'pb44q') return; P.hq = e.target.value; clearTimeout(qT); qT = setTimeout(enter, 300); });
  paint(); enter();
  clearInterval(P.t);
  P.t = setInterval(() => { if (!host.isConnected) { clearInterval(P.t); return; } if (!document.hidden && P.sec === 'now') load('now', `/sessions${q()}`); }, 10_000);
}
