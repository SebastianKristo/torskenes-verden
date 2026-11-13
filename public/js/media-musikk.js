// Musikk i Media (#/media/musikk). yubal laster ned album, spillelister og sanger fra YouTube Music til musikkbiblioteket
// (Navidrome). Alt går via /api/media/yubal/* (server/yubal.js); nettleseren ser aldri adressen til yubal.
// media43.js lager en vert-<div> (som NRK og avspillingssiden) og kaller mountMusikk(host) hver gang Media tegnes på nytt,
// så lenkefeltet ikke mister teksten. Fasit: «Media Musikk.dc.html» (pakke 58), sanger i spillelister du følger:
// «claude-code-musikk-spilleliste-sanger.md». Hvert kort tegnes på nytt bare når innholdet faktisk er endret.
import { esc } from './util.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-musikk-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media-musikk.css'; l.dataset.musikkCss = ''; document.head.appendChild(l);
}

export const YT_RE = /^https?:\/\/(music\.youtube\.com|youtube\.com|www\.youtube\.com|m\.youtube\.com|youtu\.be)\//i;
const BARE_YT = 'Bare lenker fra music.youtube.com, youtube.com eller youtu.be.';
const ST = { pending: ['VENTER', 'mt'], fetching_info: ['HENTER INFO', 'bl'], downloading: ['LASTER NED', 'bl'], importing: ['IMPORTERER', 'pu'], completed: ['FERDIG', 'ok'], failed: ['FEILET', 'rd'], cancelled: ['AVBRUTT', 'mt'] };
const KIND = { album: 'ALBUM', playlist: 'SPILLELISTE', track: 'SANG' };
const TST = { downloaded: ['LASTET NED', 'ok'], skipped: ['FINNES ALT', 'mt'], failed: ['FEILET', 'rd'], pending: ['IKKE SYNKET', 'mt'] };
const FLATER = ['#5a3b2e', '#2f3a46', '#6a2a22', '#3c4a3e', '#4a4036', '#2b3d52', '#2e5a5e', '#24414a'];
const SPOR_TTL = 60_000;

const S = {
  host: null, timer: 0, st: null, d: null, subs: null, err: '',
  url: '', ferr: '', laster: false, pv: null, typ: 'alle', maxN: 50, folg: false, starter: false,
  open: null, spor: {}, sy: null, tog: null, aerr: '',
};

const ferdig = (j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled';
const flate = (t) => { let h = 0; for (const c of String(t)) h = (h * 31 + c.codePointAt(0)) >>> 0; return FLATER[h % FLATER.length]; };
const omslag = (src, t, cls) => `<span class="mu-cv ${cls}" style="background:${flate(t)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ''}</span>`;
const siden = (iso) => {
  const t = Date.parse(iso ?? ''); if (!Number.isFinite(t)) return null;
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'nå nettopp' : m < 60 ? `${m} min siden` : m < 1440 ? `${Math.round(m / 60)} t siden` : `${Math.round(m / 1440)} d siden`;
};
function nar(iso) {
  const t = new Date(iso ?? ''); if (Number.isNaN(+t)) return '';
  const kl = t.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const dag = Math.floor((t - d0) / 864e5);
  return dag === 0 ? `i dag kl. ${kl}` : dag === 1 ? `i morgen kl. ${kl}` : `${t.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })} kl. ${kl}`;
}
const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
const ant = (n, en, fl) => `${n} ${n === 1 ? en : fl}`;

async function api(path, opt = {}) {
  const r = await fetch(`/api/media/yubal${path}`, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || (r.status === 404 ? 'Serveren har ikke Musikk ennå – oppdater Homelab.' : `Serveren svarte ${r.status}`)), { status: r.status });
  return d ?? {};
}
const send = (path, method, body) => api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

/* ---------------- Henting ---------------- */

async function load() {
  try {
    const [d, subs, st] = await Promise.all([api('/jobs'), api('/subscriptions'), S.st && Date.now() - (S.stAt ?? 0) < 60_000 ? S.st : api('/status')]);
    S.d = d; S.subs = subs; if (st !== S.st) { S.st = st; S.stAt = Date.now(); }
    S.err = '';
  } catch (e) { S.err = e.message; }
  render();
}
function schedule() {
  clearTimeout(S.timer);
  if (!S.host?.isConnected) return; // fanen vises ikke lenger: stopp
  const aktiv = (S.d?.jobs ?? []).some((j) => !ferdig(j));
  S.timer = setTimeout(async () => { if (!S.host?.isConnected) return; if (!document.hidden) await load(); schedule(); }, aktiv ? 2000 : 10000);
}
/** Sangene i en spilleliste: hentes først når lista åpnes, og huskes i 60 s. */
async function loadSpor(id, tving = false) {
  const c = S.spor[id];
  if (!tving && c && (c.laster || (c.d && Date.now() - c.at < SPOR_TTL))) return;
  S.spor[id] = { ...c, laster: true, feil: '' }; render();
  try { S.spor[id] = { d: await api(`/subscriptions/${id}/tracks`), at: Date.now(), laster: false }; } catch (e) { S.spor[id] = { ...S.spor[id], laster: false, feil: e.message }; }
  render();
}

/* ---------------- Kort 1: Last ned musikk ---------------- */

function pvHtml() {
  const p = S.pv; if (!p) return '';
  const mange = p.kind !== 'track', pl = p.kind === 'playlist';
  const meta = [p.artist, p.year, p.track_count != null ? ant(p.track_count, 'spor', 'spor') : ''].filter(Boolean).join(' · ');
  const kilde = p.audio_codec || p.audio_bitrate ? `Kilde: ${[p.audio_codec, p.audio_bitrate ? `${p.audio_bitrate} kbps` : ''].filter(Boolean).join(' · ')}` : '';
  const typ = [['alle', 'Alle spor'], ['max', 'Bare de første']].map(([v, t]) => `<button type="button" class="mu-seg${S.typ === v ? ' on' : ''}" data-mu-typ="${v}" aria-pressed="${S.typ === v}">${t}</button>`).join('');
  return `<div class="mu-pv">${omslag(p.thumbnail, p.title, 'stor')}<div class="mu-pvi">
      <div class="mu-pvt"><span class="mu-lbl">${KIND[p.kind] ?? 'SPILLELISTE'}</span><b class="mu-pvh">${esc(p.title)}</b>${meta ? `<span class="mu-pvm">${esc(meta)}</span>` : ''}${kilde ? `<span class="mu-mono">${esc(kilde)}</span>` : ''}</div>
      ${mange ? `<div class="mu-typ"><div class="mu-segs" role="group" aria-label="Hvor mange spor">${typ}</div>${S.typ === 'max' ? `<input type="number" name="mumax" min="1" max="10000" inputmode="numeric" value="${S.maxN}" aria-label="Antall spor"><span class="mu-dim">spor</span>` : ''}</div>` : ''}
      ${pl ? `<button type="button" class="mu-chk" role="switch" aria-checked="${S.folg}" data-mu-a="folg"><span class="mu-sw${S.folg ? ' on' : ''}" aria-hidden="true"><i></i></span><b>Følg spillelisten (nye sanger lastes ned automatisk)</b></button>` : ''}
      <div class="mu-go"><button type="button" class="mu-b ink" data-mu-a="start"${S.starter ? ' disabled' : ''}>${S.starter ? 'Legger til …' : pl && S.folg ? 'Følg og last ned' : 'Last ned'}</button><span class="mu-dim">Lagres som ${esc(S.st?.format ?? 'm4a')} i musikkbiblioteket (Navidrome)</span></div>
    </div></div>`;
}
function formHtml() {
  return `<h2 class="mu-h">Last ned musikk</h2>
    <form data-mu-f class="mu-in${S.ferr ? ' bad' : ''}" autocomplete="off" novalidate>
      <input name="muurl" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="Album, spilleliste eller sang fra music.youtube.com" aria-label="Lenke fra YouTube Music"${S.ferr ? ' aria-invalid="true"' : ''}>
      <button type="submit" class="mu-hent"${S.laster ? ' disabled' : ''}>${S.laster ? 'Henter …' : 'Forhåndsvis'}</button>
    </form>
    ${S.ferr ? `<div class="mu-ferr" role="alert">${esc(S.ferr)}</div>` : ''}
    ${pvHtml()}`;
}

/* ---------------- Kort 2: Køen ---------------- */

function jobbHtml(j) {
  const [st, c] = ST[j.status] ?? ST.pending, ci = j.content_info ?? {}, d = j.download_stats ?? {};
  const tittel = [ci.title, ci.artist].filter(Boolean).join(' – ') || j.url || 'Ukjent';
  const deler = j.status === 'pending' ? [ci.track_count != null ? ant(ci.track_count, 'spor', 'spor') : 'Venter på tur'] : [`${d.success ?? 0} lastet ned`, d.failed ? `${d.failed} feilet` : '', d.skipped ? `${d.skipped} hoppet over` : ''].filter(Boolean);
  const bar = !ferdig(j) && j.status !== 'pending', w = Math.round(j.progress ?? 0);
  const knapp = ferdig(j) ? `<button type="button" class="mu-b mt" data-mu-a="fjern" data-id="${esc(j.id)}">Fjern</button>` : `<button type="button" class="mu-b rd" data-mu-a="avbryt" data-id="${esc(j.id)}">Avbryt</button>`;
  return `<article class="mu-job">${omslag(ci.thumbnail, tittel, 'sm')}<div class="mu-jb">
    <div class="mu-jt"><b>${esc(tittel)}</b><span class="mu-chip ${c}">${st}</span></div>
    ${bar ? `<div class="mu-bar ${c}" role="progressbar" aria-label="Fremdrift" aria-valuenow="${w}" aria-valuemin="0" aria-valuemax="100"><i style="width:${w}%"></i></div>` : ''}
    <div class="mu-mono mu-row"><span>${esc(deler.join(' · '))}</span><span>${j.source === 'scheduler' ? 'Automatisk' : 'Manuell'}</span></div>
    <div class="mu-acts">${knapp}</div></div></article>`;
}
function koHtml() {
  const J = S.d?.jobs ?? [];
  return `<div class="mu-hd"><h2 class="mu-h">Køen</h2>${J.some(ferdig) ? '<button type="button" class="mu-b" data-mu-a="rydd">Fjern ferdige</button>' : ''}</div>
    ${S.err ? `<div class="mu-ban" role="alert">${esc(S.err)}</div>` : ''}
    ${S.aerr ? `<div class="mu-ban" role="alert">${esc(S.aerr)}</div>` : ''}
    ${J.length ? J.map(jobbHtml).join('') : '<p class="mu-tom">Ingenting i køen.</p>'}`;
}

/* ---------------- Kort 3: Spillelister du følger ---------------- */

function sporHtml(x) {
  const c = S.spor[x.id], d = c?.d;
  if (!d) return `<div class="mu-spor"><span class="mu-mono">${c?.feil ? esc(c.feil) : 'Henter sangene …'}</span>${c?.feil ? `<div class="mu-acts"><button type="button" class="mu-b" data-mu-a="spor" data-id="${esc(x.id)}">Prøv igjen</button></div>` : ''}</div>`;
  const T = d.tracks ?? [], s = d.summary ?? {};
  let sum;
  if (d.available && T.length) {
    const n = (k) => T.filter((t) => t.status === k).length;
    sum = [ant(T.length, 'sang', 'sanger'), `${n('downloaded')} lastet ned`, n('skipped') ? `${n('skipped')} fantes fra før` : '', n('failed') ? `${n('failed')} feilet` : '', n('pending') ? `${n('pending')} ikke synket` : ''];
  } else {
    const andre = Math.max(0, (s.skipped ?? 0) - (s.existing ?? 0));
    sum = [d.total != null ? ant(d.total, 'sang', 'sanger') : '', s.last_status ? `${s.success ?? 0} lastet ned` : 'Ikke synket ennå', s.existing ? `${s.existing} fantes fra før` : '', andre ? `${andre} hoppet over` : '', s.failed ? `${s.failed} feilet` : ''];
  }
  const rader = T.map((t, i) => { const b = TST[t.status]; return `<div class="mu-tr"><span class="mu-trn">${i + 1}</span><span class="mu-trt"><b>${esc(t.title)}</b>${t.artist ? `<span>${esc(t.artist)}</span>` : ''}</span><span class="mu-trd">${mmss(t.duration)}</span>${b ? `<span class="mu-chip sm ${b[1]}">${b[0]}</span>` : ''}</div>`; }).join('');
  return `<div class="mu-spor"><span class="mu-mono">${esc(sum.filter(Boolean).join(' · '))}</span>
    ${rader ? `<div class="mu-trs">${rader}</div>` : `<p class="mu-tom sm">${esc(d.message || 'Sanglista er ikke tilgjengelig fra yubal')}</p>`}</div>`;
}
function subHtml(x) {
  const apen = S.open === x.id, synk = siden(x.last_synced_at);
  const sub = [synk ? `Synket ${synk}` : 'Ikke synket ennå', x.max_items ? `de første ${x.max_items}` : ''].filter(Boolean).join(' · ');
  return `<div class="mu-sub${x.enabled ? '' : ' av'}">
    <button type="button" class="mu-so" data-mu-a="apne" data-id="${esc(x.id)}" aria-expanded="${apen}">${omslag(x.thumbnail, x.name, 'sub')}<span class="mu-st"><b>${esc(x.name)}</b><span>${esc(sub)}</span></span><span class="mu-pil${apen ? ' on' : ''}" aria-hidden="true">›</span></button>
    <div class="mu-acts"><button type="button" class="mu-tog${x.enabled ? ' on' : ''}" role="switch" aria-checked="${x.enabled}" aria-label="${x.enabled ? 'Slå av automatisk synk' : 'Slå på automatisk synk'}" data-mu-a="tog" data-id="${esc(x.id)}"${S.tog === x.id ? ' disabled' : ''}><i></i></button>
      <button type="button" class="mu-b" data-mu-a="synk" data-id="${esc(x.id)}"${S.sy === x.id ? ' disabled' : ''}>${S.sy === x.id ? 'Synker …' : 'Synk nå'}</button>
      <button type="button" class="mu-b rd" data-mu-a="slett" data-id="${esc(x.id)}">Slutt å følge</button></div>
    ${apen ? sporHtml(x) : ''}</div>`;
}
function subsHtml() {
  const L = S.subs?.items ?? [], sc = S.st?.scheduler;
  const plan = !sc ? '' : sc.enabled ? `Neste automatiske sjekk: ${sc.next_run_at ? nar(sc.next_run_at) : 'ukjent'} · ${L.filter((x) => x.enabled).length} av ${L.length} på` : 'Automatisk synk er slått av i yubal';
  return `<div class="mu-hd wrap"><h2 class="mu-h">Spillelister du følger</h2>${L.length ? `<button type="button" class="mu-b" data-mu-a="synkalle"${S.sy === 'alle' ? ' disabled' : ''}>${S.sy === 'alle' ? 'Synker …' : 'Synk alle'}</button>` : ''}</div>
    ${plan ? `<span class="mu-dim mu-plan">${esc(plan)}</span>` : ''}
    ${L.length ? L.map(subHtml).join('') : '<p class="mu-tom">Du følger ingen spillelister.</p>'}`;
}

/* ---------------- Tegning ---------------- */

function kort() {
  if (S.err && !S.d) return [['feil', 'full tomt', `<b class="mu-h">Fikk ikke kontakt med yubal</b><p>${esc(S.err)}</p><button type="button" class="mu-b ink stor" data-mu-a="last">Prøv igjen</button>`]];
  if (!S.d) return [['venter', 'full tomt', '<p>Laster …</p>']];
  if (S.d.configured === false) return [['tomt', 'full tomt', '<b class="mu-h stor">Musikk er ikke satt opp</b><p>Legg inn adressen til yubal under Integrasjoner. Da kan du laste ned album og spillelister fra YouTube Music til musikkbiblioteket.</p><button type="button" class="mu-b ink stor" data-m43="integ">Åpne Integrasjoner</button>']];
  return [['form', 'full form', formHtml()], ['ko', 'ko', koHtml()], ['subs', 'subs', subsHtml()]];
}
function render() {
  const h = S.host; if (!h?.isConnected) return;
  let w = h.firstElementChild;
  if (!w?.classList.contains('mu88')) { h.innerHTML = '<div class="mu88"></div>'; w = h.firstElementChild; }
  const K = kort();
  if ([...w.children].map((c) => c.dataset.k).join(',') !== K.map((k) => k[0]).join(',')) w.innerHTML = K.map(([k, cls]) => `<section class="mu-card ${cls}" data-k="${k}"></section>`).join('');
  K.forEach(([k, , html], i) => {
    const el = w.children[i];
    if (el.muHtml === html) return; // uendret: la kortet (og lenkefeltet) stå i fred
    const a = document.activeElement, navn = el.contains(a) ? a.getAttribute('name') : null, pos = navn ? a.selectionStart : 0;
    const rull = el.querySelector('.mu-trs')?.scrollTop ?? 0;
    el.innerHTML = html; el.muHtml = html;
    if (k === 'form') { el.querySelector('input[name="muurl"]').value = S.url; gyldig(el); }
    const trs = el.querySelector('.mu-trs'); if (trs && rull) trs.scrollTop = rull;
    if (navn) { const f = el.querySelector(`[name="${navn}"]`); if (f) { f.focus({ preventScroll: true }); try { f.setSelectionRange(pos, pos); } catch { /* number-felt */ } } }
  });
}
/** «Forhåndsvis» er dempet til lenken ser ut som en YouTube-lenke (uten å tegne skjemaet på nytt for hvert tastetrykk). */
function gyldig(el) { el?.querySelector('.mu-hent')?.classList.toggle('klar', YT_RE.test(S.url.trim())); }

/* ---------------- Handlinger ---------------- */

async function forhandsvis() {
  const u = S.url.trim();
  if (S.laster) return;
  if (!YT_RE.test(u)) { S.ferr = BARE_YT; S.pv = null; render(); return; }
  S.laster = true; S.ferr = ''; S.pv = null; render();
  try { S.pv = (await api(`/info?url=${encodeURIComponent(u)}`)).info ?? null; S.pv = S.pv && { ...S.pv, kilde: u }; S.typ = 'alle'; S.folg = false; } catch (e) { S.ferr = e.message; }
  S.laster = false; render();
}
async function start() {
  const p = S.pv; if (!p || S.starter) return;
  const max = p.kind !== 'track' && S.typ === 'max' ? Math.max(1, Math.min(10000, Math.round(+S.maxN) || 1)) : null;
  const url = p.kilde || p.url;
  S.starter = true; S.ferr = ''; render();
  try {
    if (p.kind === 'playlist' && S.folg) {
      const r = await send('/subscriptions', 'POST', { url, ...(max ? { max_items: max } : {}) });
      if (r.item?.id) await send(`/subscriptions/${r.item.id}/sync`, 'POST'); // last ned med en gang, ikke vent på planleggeren
    } else await send('/jobs', 'POST', { url, ...(max ? { max_items: max } : {}) });
    S.pv = null; S.url = ''; S.folg = false; S.typ = 'alle';
  } catch (e) { S.ferr = e.message; }
  S.starter = false; render();
  await load(); schedule();
}
async function act(a, id, b) {
  if (a === 'folg') { S.folg = !S.folg; return render(); }
  if (a === 'start') return start();
  if (a === 'last') { S.err = ''; S.d = null; render(); return load().then(schedule); }
  if (a === 'apne') { S.open = S.open === id ? null : id; render(); if (S.open) loadSpor(id); return; }
  if (a === 'spor') return loadSpor(id, true);
  b.disabled = true; S.aerr = '';
  try {
    if (a === 'avbryt') await send(`/jobs/${id}/cancel`, 'POST');
    if (a === 'fjern') await send(`/jobs/${id}`, 'DELETE');
    if (a === 'rydd') await send('/jobs', 'DELETE');
    if (a === 'tog') { S.tog = id; render(); const x = S.subs?.items?.find((y) => y.id === id); await send(`/subscriptions/${id}`, 'PATCH', { enabled: !x?.enabled }); delete S.spor[id]; }
    if (a === 'synk') { S.sy = id; render(); await send(`/subscriptions/${id}/sync`, 'POST'); delete S.spor[id]; }
    if (a === 'synkalle') { S.sy = 'alle'; render(); await send('/subscriptions/sync', 'POST'); S.spor = {}; }
    if (a === 'slett') { await send(`/subscriptions/${id}`, 'DELETE'); if (S.open === id) S.open = null; delete S.spor[id]; }
  } catch (e) { S.aerr = e.message; }
  S.sy = null; S.tog = null; S.stAt = 0;
  await load(); schedule();
  if (S.open && !S.spor[S.open]) loadSpor(S.open);
}

function wire(h) {
  h.addEventListener('submit', (e) => { if (!e.target.closest('[data-mu-f]')) return; e.preventDefault(); forhandsvis(); });
  h.addEventListener('input', (e) => {
    if (e.target.name === 'mumax') { S.maxN = e.target.value; return; }
    if (e.target.name !== 'muurl') return;
    S.url = e.target.value; gyldig(e.target.closest('[data-k]'));
    if (S.ferr || S.pv) { S.ferr = ''; S.pv = null; render(); }
  });
  h.addEventListener('change', (e) => { if (e.target.name === 'mumax') { S.maxN = Math.max(1, Math.min(10000, parseInt(e.target.value, 10) || 1)); render(); } });
  h.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mu-typ]');
    if (t) { S.typ = t.dataset.muTyp; render(); return; }
    const b = e.target.closest('[data-mu-a]'); if (!b || b.disabled) return;
    act(b.dataset.muA, b.dataset.id, b);
  });
  // Omslag som ikke lar seg hente: fargeflaten står igjen.
  h.addEventListener('error', (e) => { if (e.target.tagName === 'IMG' && e.target.closest('.mu-cv')) e.target.remove(); }, true);
}

/** Kalles av media43.js hver gang Musikk-siden tegnes. Verten gjenbrukes, så lyttere legges på bare én gang. */
export function mountMusikk(host) {
  if (!host) return;
  if (!host.dataset.musikk) { host.dataset.musikk = '1'; host.style.cssText = 'flex:1 1 100%;min-width:0'; wire(host); }
  S.host = host;
  render();
  if (Date.now() - (S.lastMount ?? 0) > 1500) { S.lastMount = Date.now(); load().then(schedule); } else schedule();
}
