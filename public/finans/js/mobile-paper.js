// Papir (prompt 13): det nye felles mobildesignet «Forside med kort» (Mobil Nytt Design 2a / Mobil Papir App).
// Lyst papir (#f3efe6) eller kveldspapir (#14130f), Newsreader, Manrope og IBM Plex Mono, et fotovindu øverst og en svart
// pillefanelinje nederst med Hjem, Finans, Mat, Sporing, Mer og +Skann. Ingen Liquid Glass og ingen Material You.
// Alle eksisterende sider tegnes i Papir ved at Android-fargerollene (--m3-*) får papirfarger (se mobile-theme.js).
// Her ligger skallet (fotovindu og fanelinje), Papir-forsiden, Finans-oversikten, Mer, Media og nyhetsleseren.
import { S, esc, n0, hlApi, ini, today } from './core.js';
import { m, draw, flash, pref, setPref, meName, avInner, avatarUrl, openSheet } from './mobile.js';
import { hlData, hlDom, yrUrl, ruterUrl } from './mobile-hl.js';
import { TR, active, badge, carName } from './mobile-track.js';
import { matToday, matTitle } from './mobile-mat.js';

/* ---------- Valg (per bruker i /api/me/layout, med lokal kopi) ---------- */

export const paper = () => pref('mDesign') === 'papir';
export const paperDark = () => { const v = pref('paperMode'); return v === 'mork' || (v === 'auto' && !!matchMedia('(prefers-color-scheme: dark)').matches); };
const PHOTOS = [['cur', 'Nåværende'], ['oslo', 'Oslo'], ['weather', 'Vær nå'], ['planets', 'Planeter']];
export const photoKind = () => pref('photo') || 'cur';

// Lagres i /api/me/layout (designfeltene ligger på toppnivå). Eldre servere avviser feltene; da gjelder valget bare her.
export function saveDesign(patch, redraw = true) {
  for (const [k, v] of Object.entries(patch)) setPref({ mobileDesign: 'mDesign' }[k] ?? k, v);
  hlApi('/me/layout', { method: 'PUT', json: patch }).catch(() => {});
  if (redraw) draw();
}
/** Leser designvalgene fra serveren (kalles når /api/me/layout er hentet). */
export function takeDesign(r) {
  if (!r) return;
  if (r.mobileDesign === 'papir' || r.mobileDesign === 'klassisk') setPref('mDesign', r.mobileDesign);
  if (['auto', 'lys', 'mork'].includes(r.paperMode)) setPref('paperMode', r.paperMode);
  if (['cur', 'oslo', 'weather', 'planets', 'custom'].includes(r.photo)) setPref('photo', r.photo);
}

/* ---------- Fotovindu ---------- */

const P = { photo: {}, open: false, news: null, newsErr: '', cat: 'siste', set: false, nf: '', media: null, busy: false };
const FALLBACK = {
  cur: 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)',
  oslo: 'linear-gradient(170deg,#f2b36b 0%,#d7766a 45%,#4a3a5e 100%)',
  weather: 'linear-gradient(170deg,#4a5a6c 0%,#7d8b99 55%,#b7c0c8 100%)',
  planets: 'linear-gradient(170deg,#05060d 0%,#141a33 100%)',
  custom: 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)',
};
const OV = 'linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0) 38%,rgba(0,0,0,.48))';

export async function photoLoad(kind = photoKind()) {
  if (P.photo[kind]?.t > Date.now() - 10 * 60000) return;
  try { const r = await hlApi(`/photo-window?kind=${kind}`); P.photo[kind] = { ...r, t: Date.now() }; }
  catch { P.photo[kind] = { url: null, gradient: FALLBACK[kind], t: Date.now() }; }
}
const bgOf = (kind) => {
  const p = P.photo[kind];
  if (p?.url) return `background-image:${OV},url('${esc(p.url)}')`;
  return `background-image:${OV},${p?.gradient || FALLBACK[kind] || FALLBACK.cur}`;
};
const thumbOf = (kind) => { const p = P.photo[kind]; return p?.url ? `background-image:url('${esc(p.url)}')` : `background-image:${p?.gradient || FALLBACK[kind]}`; };

/* ---------- Skall: fotovindu og fanelinje ---------- */

const PAGE = {
  hjem: ['Finans', () => { const s = S.summary; return s ? `${cap(new Date(s.month + '-15').toLocaleDateString('nb-NO', { month: 'long' }))} · ${s.daysLeft} dager igjen` : 'Denne måneden'; }],
  liste: ['Transaksjoner', 'Alle kontoer'], budsjett: ['Budsjett', 'Denne måneden'], sok: ['Søk', '✦ Spør om alt'],
  mat: ['Mat', () => { const t = matToday(); return t?.week ? `Uke ${t.week}` : 'Ukeplan og oppskrifter'; }],
  spor: ['Sporing', () => { const a = active(TR.data?.items ?? []), r = a.filter((p) => p.status === 'ready_for_pickup').length; return TR.data ? `${a.length} på vei${r ? ` · ${r} klar` : ''}` : 'Pakker'; }],
  mer: ['Mer', 'Alle moduler'], set: ['Innstillinger', 'Konto og utseende'], dom: ['Domener', 'Siste 24 timer'], media: ['Media', 'Plex · Jellyfin'],
  aks: ['Aksjer', 'Trading 212'], sub: ['Abonnementer', 'Subscription OS'], dir: ['Boliger', 'Utgifter og prosjekter'], finn: ['Finn', 'Kjøp og salg'],
  kv: ['Kvitteringer', 'Til gjennomgang'], fast: ['Faste utgifter', 'Hver måned'], konto: ['Kontoer', 'Saldo'], rap: ['Rapporter', 'Måned og år'], imp: ['Import', 'CSV, XLSX og tekst'],
  skann: ['Skann', 'Kvitteringer'], opp: ['Skann', 'Kø'], hl: ['', ''],
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MERS = ['dom', 'media', 'aks', 'sub', 'dir', 'finn', 'set', 'kv', 'fast', 'konto', 'rap', 'imp'];
const parentOf = (scr) => (scr === 'set' && m.sub ? ['set', 'Innstillinger'] : scr === 'mat' && m.sub ? ['mat', 'Mat'] : ['liste', 'budsjett', 'sok', 'skann', 'opp'].includes(scr) ? ['hjem', 'Finans'] : MERS.includes(scr) ? ['mer', 'Mer'] : ['hl', 'Hjem']);
const greetTxt = (h) => (h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 17 ? 'God dag' : 'God kveld');
const TOP = ['hl', 'hjem', 'mat', 'spor', 'mer'];

export function paperHero(scr) {
  const home = scr === 'hl', kind = photoKind();
  const [title, kick] = (scr === 'mat' && matTitle()) || (PAGE[scr] ?? [cap(scr), '']);
  const kicker = home ? cap(new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })) : typeof kick === 'function' ? kick() : kick;
  const ttl = home ? `${greetTxt(new Date().getHours())},<br>${esc(meName().split(' ')[0])}` : esc(title);
  const [pk, pl] = parentOf(scr);
  const w = hlData()?.weather;
  const backBtn = TOP.includes(scr) && !m.sub ? `<span class="pp-brand">${home ? 'Homelab' : ''}</span>` : `<a class="pp-pill" href="#/${pk}${scr === 'set' && m.sub && pk === 'set' ? '' : ''}">‹ ${esc(pl)}</a>`;
  return `<header class="pp-hero${home ? ' home' : ''}" style="${bgOf(kind)}">
    <div class="pp-top">${backBtn}<span class="m-grow"></span>
      ${home ? `<button class="pp-pill" data-pp="photo" aria-haspopup="menu" aria-expanded="${P.open}">${esc(PHOTOS.find(([k]) => k === kind)?.[1] ?? 'Eget bilde')} ▾</button>` : ''}
      <a class="pp-av${avatarUrl() ? ' img' : ''}" href="#/set" aria-label="Innstillinger">${avInner()}</a></div>
    ${home && P.open ? photoMenu(kind) : ''}
    <div class="pp-bottom"><div class="m-grow"><div class="pp-kick">${esc(kicker)}</div><h1 class="pp-title${home ? ' big' : ''}">${ttl}</h1></div>
      ${home && w ? `<a class="pp-temp" href="${esc(yrUrl(w))}" target="_blank" rel="noopener"><b>${w.temp != null ? Math.round(w.temp) + '°' : '–'}</b><span>${esc(w.text ?? '')}${w.updated ? ` · ${esc(new Date(w.updated).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }))}` : ''} ›</span></a>` : ''}</div>
    ${P.photo[kind]?.credit && home ? `<span class="pp-credit">${esc(P.photo[kind].credit)}</span>` : ''}
  </header>`;
}

function photoMenu(kind) {
  return `<div class="pp-menu" role="menu">${PHOTOS.map(([k, n]) => `<button role="menuitemradio" aria-checked="${kind === k}" data-pp="setphoto" data-k="${k}"><span class="pp-th" style="${thumbOf(k)}"></span><span class="m-grow">${n}</span><span>${kind === k ? '✓' : ''}</span></button>`).join('')}
    <label class="pp-own"><span class="pp-th dash">+</span><span class="m-grow">Eget bilde</span><span>${kind === 'custom' ? '✓' : ''}</span><input class="m-file" type="file" accept="image/jpeg,image/png,image/webp" data-ppfile></label></div>`;
}

export function paperNav(scr) {
  const cur = scr === 'hl' ? 'hl' : ['hjem', 'liste', 'budsjett', 'sok', 'skann', 'opp'].includes(scr) ? 'hjem' : scr === 'mat' ? 'mat' : scr === 'spor' ? 'spor' : 'mer';
  const tabs = [['hl', 'Hjem', '⌂'], ['hjem', 'Finans', 'kr'], ['mat', 'Mat', '◐'], ['spor', 'Sporing', '▣'], ['mer', 'Mer', '⋯']];
  return `<nav class="pp-nav" aria-label="Faner">${tabs.map(([k, n, ic]) => `<a href="#/${k}" data-tab="${k}" ${cur === k ? 'aria-current="page"' : ''}>${cur === k ? `<i>${ic}</i>` : ''}${n}</a>`).join('')}
    <button class="pp-scan" data-pp="scan" aria-label="Skann kvittering, oppskrift eller dokument">+</button></nav>`;
}

/* Arket for +Skann: kvittering (kamera, bilder/filer) eller oppskrift. */
export function paperScanSheet() {
  if (!P.scan) return '';
  return `<div class="sheet-bg" data-pp="scanx"></div><div class="pp-sheet" role="dialog" aria-label="Skann"><span class="pp-grab"></span>
    <div class="pp-sh">Skann</div><div class="pp-mut">Kvittering, oppskrift eller dokument. ✦ Gemini leser i bakgrunnen.</div>
    <button class="pp-btn ink" data-mact="cam">Kamera</button>
    <label class="pp-btn">Bilder eller filer<input class="m-file" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif" data-mupload></label>
    <label class="pp-btn">Oppskrift<input class="m-file" type="file" multiple accept="image/*,application/pdf" data-ppscanrec></label>
    <button class="pp-btn ghost" data-pp="scanx">Avbryt</button></div>`;
}

/* ---------- Papir-forsiden (Hjem) ---------- */

const lab = (t, r = '') => `<div class="pp-sec"><span>${esc(t)}</span>${r ? `<span>${r}</span>` : ''}</div>`;
const timeOf = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(+d)) return ''; return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }); };
const srcIni = (s) => { const t = String(s ?? '').trim(); return /^[A-ZÆØÅ0-9]{2,4}$/.test(t) ? t : t.slice(0, 3).toUpperCase(); };

export function paperHome() {
  const H = hlData(), w = H?.weather;
  const pk = active(TR.data?.items ?? []).sort((a, b) => (a.status === 'ready_for_pickup' ? -1 : 0) - (b.status === 'ready_for_pickup' ? -1 : 0));
  const p0 = pk[0];
  const pkg = p0 ? `<a class="pp-card pp-pkg" href="#/spor">${badge(p0.carrier, 52)}<span class="m-grow"><span class="pp-lab">${p0.status === 'ready_for_pickup' ? 'HENT I DAG' : 'PÅ VEI'}</span><b class="pp-serif">${esc(p0.name || p0.shop || p0.trackingNo)}</b><span class="pp-mut m-ell">${esc(p0.pickupPoint || p0.statusText || carName(p0.carrier))}${p0.eta ? ` · ${esc(/^\d{4}-\d\d-\d\d/.test(p0.eta) ? (p0.status === 'ready_for_pickup' ? 'innen ' : '') + new Date(p0.eta.slice(0, 10) + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'numeric' }) : p0.eta)}` : ''}</span></span>${pk.length > 1 ? `<span class="pp-mut">${pk.length - 1} til ›</span>` : ''}</a>` : '';
  const trips = (H?.ruter ?? []).flatMap((x) => (x.departures ?? []).slice(0, 2).map((d) => ({ ...d, to: d.to ?? x.to, from: x.from }))).sort((a, b) => (a.min ?? 99) - (b.min ?? 99)).slice(0, 3);
  const ruter = trips.length ? `<a class="pp-card pp-ruter" href="${esc(ruterUrl(H.ruter[0]?.from))}" target="_blank" rel="noopener"><div class="pp-row"><span class="pp-lab">AVGANGER${H.ruter[0]?.from ? ` · ${esc(H.ruter[0].from.toUpperCase())}` : ''}</span><span class="pp-mut">sanntid ›</span></div>
      ${trips.map((d) => `<div class="pp-dep"><span class="pp-line" style="background:${esc(lineBg(d))}">${esc(d.line)}</span><span class="m-grow m-ell">${esc(d.to ?? '')}</span><b class="pp-serif">${d.min != null ? (d.min <= 0 ? 'nå' : d.min) : ''}</b><span class="pp-mut pp-min">${d.min > 0 ? 'min' : ''}</span></div>`).join('')}</a>` : '';
  const s = S.summary, rv = (s?.review ?? []).filter((r) => r.status === 'needs_review').length, mt = matToday();
  const dm = hlDom(), dom = dm ? { visitors: dm.visitors, total: dm.n, down: dm.up === false ? 1 : 0 } : null;
  const minis = [
    ['FINANS', s ? n0(s.left) : '–', rv ? `${rv} kvittering${rv > 1 ? 'er' : ''}` : 'igjen å bruke', rv ? 'lab' : 'mut', '#/hjem', '20px'],
    ['MAT', mt?.name || 'Ingen rett', mt?.cook ? `${mt.cook} lager` : '', 'mut', '#/mat', '16px'],
    ['DOMENER', dom?.visitors != null ? n0(dom.visitors) : dom?.total != null ? String(dom.total) : '–', dom ? (dom.down ? `${dom.down} nede` : 'alle oppe') : '', dom?.down ? 'lab' : 'pos', '#/dom', '20px'],
  ];
  return `<div class="pp-home">
    <form class="pp-search" data-ppsearch role="search"><span aria-hidden="true">⌕</span><input class="m-input" name="q" type="search" enterkeyhint="search" placeholder="Søk på Google" aria-label="Søk på Google" autocomplete="off"></form>
    ${pkg}${ruter}
    <div class="pp-minis">${minis.map(([k, v, sub, c, href, fs]) => `<a class="pp-card pp-mini" href="${href}"><span class="pp-lab mut">${k}</span><b class="pp-serif m-ell" style="font-size:${fs}">${esc(v)}</b><span class="pp-${c}" style="font-size:11px">${esc(sub)}</span></a>`).join('')}</div>
    ${newsCard(H?.news)}
  </div>`;
}
const lineBg = (d) => (d.mode === 'tram' || d.mode === 'bus' || /^\d{2,3}$/.test(String(d.line)) ? '#a8d4fb' : '#f3d38a');

function newsCard(list) {
  const items = (list ?? P.news?.items ?? []).slice(0, 5);
  const srcs = [...new Set(items.map((x) => x.feed))].slice(0, 3).join(' · ');
  return `<div class="pp-card pp-news"><div class="pp-row pp-rule"><span class="pp-lab">SISTE NYTT</span><span class="pp-mut">${esc(srcs)}</span></div>
    <div class="pp-nlist">${items.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener"><span class="pp-lab">${esc(srcIni(x.feed))}</span><span class="m-grow pp-serif m-ell">${esc(x.title)}</span><span class="pp-mut">${esc(timeOf(x.published))}</span></a>`).join('') || `<div class="pp-mut" style="padding:10px 0">${list === undefined && !P.news ? 'Henter nyheter …' : 'Ingen nyheter ennå. Legg til kilder i nyhetsleseren.'}</div>`}</div>
    <div class="pp-center"><a class="pp-btn ink sm" href="#/nyheter">Åpne nyhetsleser ›</a></div></div>`;
}

/* ---------- Finans-oversikt i Papir ---------- */

export function paperFin() {
  const s = S.summary;
  if (!s) return '<div class="m-spin"></div>';
  const bal = (S.boot?.accounts ?? []).reduce((a, x) => a + (x.balance ?? 0), 0);
  const rv = (s.review ?? []).filter((r) => r.status === 'needs_review').length;
  const bud = (s.budgets ?? []).filter((b) => b.budget).sort((a, b) => b.used / b.budget - a.used / a.budget).slice(0, 5);
  const month = new Date(s.month + '-15').toLocaleDateString('nb-NO', { month: 'long' }).toUpperCase();
  return `<div class="pp-card pp-saldo"><span class="pp-lab">SALDO · ALLE KONTOER</span><b class="pp-serif pp-huge" data-mact="reveal">${pref('hideAmt') && !m.reveal ? '••••' : `${bal < 0 ? '−' : ''}${n0(bal)} kr`}</b>
      <div class="pp-kpi"><div><span>Inn</span><b class="pp-pos">${n0(s.inn ?? 0)}</b></div><div><span>Brukt</span><b>${n0(s.budgetUsed ?? 0)}</b></div><div><span>Igjen</span><b>${n0(s.left ?? 0)}</b></div></div></div>
    ${rv ? `<a class="pp-cta" href="#/kv"><span>${rv} kvittering${rv > 1 ? 'er' : ''} til gjennomgang</span><span>Skann ›</span></a>` : ''}
    ${lab('SISTE TRANSAKSJONER', '<a href="#/liste">Alle ›</a>')}
    <div class="pp-rows">${(s.recent ?? []).slice(0, 5).map((t) => `<button class="pp-tx" data-tx="${t.id}"><span class="pp-ti" style="background:${esc(t.color ?? '#6b665c')}">${esc(ini(t.description))}</span><span class="m-grow"><b class="m-ell">${esc(t.description)}</b><span class="pp-mut">${esc(t.category ?? '')} · ${esc(t.date === today() ? 'I dag' : t.date?.slice(8, 10) + '.' + t.date?.slice(5, 7))}</span></span><span class="pp-serif ${t.amount > 0 ? 'pp-pos' : ''}">${t.amount < 0 ? '−' : '+'}${n0(t.amount)}</span></button>`).join('') || '<div class="pp-mut">Ingen transaksjoner ennå.</div>'}</div>
    ${bud.length ? `${lab(`BUDSJETT · ${month}`, `${n0(s.budgetUsed)} av ${n0(s.budgetTotal)}`)}<div class="pp-rows">${bud.map((b) => { const p = Math.round((b.used / b.budget) * 100); return `<a class="pp-bud" href="#/budsjett"><span>${esc(b.category)}</span><span class="pp-bar"><i style="width:${Math.min(100, p)}%;background:${p > 90 ? 'var(--pp-lab)' : 'var(--pp-ink)'}"></i></span><span class="pp-mut">${p} %</span></a>`; }).join('')}</div>` : ''}
    <div class="pp-two"><a class="pp-btn" href="#/budsjett">Budsjett</a><a class="pp-btn" href="#/sok">✦ Søk</a></div>`;
}

/* ---------- Mer ---------- */

export function paperMer() {
  const rows = [['dom', 'Domener', 'Trafikk, besøk og oppetid'], ['media', 'Media', 'Spilles nå og historikk'], ['aks', 'Aksjer', 'Trading 212'], ['sub', 'Abonnementer', 'Subscription OS'],
    ['dir', 'Boliger', 'Utgifter, prosjekter og regninger'], ['finn', 'Finn', 'Kjøp og salg'], ['nyheter', 'Nyhetsleser', 'RSS med AI-sammendrag'], ['kv', 'Kvitteringer', 'Kø og gjennomgang'],
    ['fast', 'Faste utgifter', 'Hver måned'], ['konto', 'Kontoer', 'Saldo og kort'], ['rap', 'Rapporter', 'Måned og år'], ['imp', 'Import', 'CSV, XLSX og tekst'], ['set', 'Innstillinger', 'Tema, bakgrunn og konto']];
  return `<div class="pp-card pp-list">${rows.map(([k, n, s]) => `<a href="#/${k}"><span class="m-grow"><b class="pp-serif">${n}</b><span class="pp-mut">${s}</span></span><span class="pp-mut">›</span></a>`).join('')}</div>`;
}

/* ---------- Media (Plex og Jellyfin) ---------- */

export async function mediaLoad() {
  const [now, hist] = await Promise.all([hlApi('/media/now').catch(() => null), hlApi('/media/history').catch(() => null)]);
  P.media = { now: now?.items ?? (Array.isArray(now) ? now : []), hist: hist?.items ?? (Array.isArray(hist) ? hist : []), configured: now?.configured ?? hist?.configured ?? true };
}
const ago = (iso) => { if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} t` : `${Math.round(s / 86400)} d`; };
export function mediaView() {
  const M = P.media;
  if (!M) return '<div class="m-spin"></div>';
  if (!M.configured && !M.now.length && !M.hist.length) return '<div class="pp-card"><div class="pp-mut">Plex eller Jellyfin er ikke satt opp. Legg dem inn i Homelab → Innstillinger → Integrasjoner.</div></div>';
  const now = M.now;
  return `<div class="pp-card pp-saldo"><span class="pp-lab">SPILLES NÅ</span><b class="pp-serif pp-huge" style="font-size:40px">${now.length ? `${now.length} ${now.length === 1 ? 'strøm' : 'strømmer'}` : 'Ingenting'}</b>
      <span class="pp-mut">${esc(now.map((x) => `${x.user || 'Ukjent'} · ${x.title}`).join(' · ') || 'Ingen spiller noe akkurat nå')}</span></div>
    ${lab('HISTORIKK')}
    <div class="pp-rows">${M.hist.slice(0, 20).map((x) => `<a class="pp-hist" href="${esc(x.url ?? '#')}" target="_blank" rel="noopener">${x.poster ? `<span class="pp-post" style="background-image:url('${esc(x.poster)}')"></span>` : '<span class="pp-post"></span>'}<span class="m-grow"><b class="m-ell">${esc(x.show || x.title)}${x.kind === 'episode' && x.season != null ? ` · S${x.season}E${x.episode}` : ''}</b><span class="pp-mut m-ell">${esc(x.kind === 'episode' ? x.title : '')}${x.user ? `${x.kind === 'episode' ? ' · ' : ''}<em class="pp-user">${esc(x.user)}</em>` : ''}</span></span><span class="pp-mut">${esc(ago(x.playedAt))}</span></a>`).join('') || '<div class="pp-mut">Ingen historikk ennå.</div>'}</div>`;
}

/* ---------- Nyhetsleser (Nyhetsleser.dc.html, mobil) ---------- */

const CATS = [['siste', 'Siste'], ['norge', 'Norge'], ['verden', 'Verden'], ['okonomi', 'Økonomi'], ['sport', 'Sport'], ['teknologi', 'Teknologi'], ['kultur', 'Kultur']];
const FCOL = ['#c8102e', '#d7263d', '#1a5a8a', '#2a3440', '#e05a2a', '#2f7a4f', '#5b4a8a'];
export async function newsLoad() {
  try { P.news = await hlApi(`/rss?cat=${P.cat}&limit=40`); P.newsErr = ''; }
  catch (e) { P.newsErr = e.status === 404 ? 'Nyhetsleseren krever en nyere server.' : e.message; P.news ??= null; }
}
export function newsView() {
  const N = P.news, items = N?.items ?? [], feeds = N?.feeds ?? [], st = N?.settings ?? { aiSummary: true, aiCategorize: true };
  const cats = N?.categories?.length ? N.categories.map((c) => [c.id, c.name]) : CATS;
  const upd = N?.updatedAt ? new Date(N.updatedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '';
  const lead = st.aiSummary && N?.digest?.text ? N.digest.text : items[0]?.title ?? '';
  const catName = (id) => cats.find(([k]) => k === id)?.[1] ?? id ?? '';
  return `<div class="pp-reader">
    <div class="pp-rhead"><a class="pp-pill line" href="#/${m.sub === 'hl' ? 'hl' : 'mer'}" data-pp="newsback">‹ Tilbake</a><div class="m-grow"><div class="pp-lab">NYHETSLESER · ${feeds.length} KILDER${upd ? ` · OPPDATERT ${upd}` : ''}</div><div class="pp-serif pp-rtitle">Siste nytt</div></div>
      <button class="pp-gear" data-pp="newsset" aria-label="Kilder og AI"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/></svg></button></div>
    <div class="pp-tabs" role="tablist">${cats.map(([k, n]) => `<button role="tab" data-pp="cat" data-k="${k}" aria-selected="${P.cat === k}">${esc(n)}</button>`).join('')}</div>
    ${P.newsErr ? `<div class="pp-card pp-mut">${esc(P.newsErr)}</div>` : !N ? '<div class="m-spin"></div>' : `
    ${lead ? `<div class="pp-lead">${st.aiSummary && N.digest?.text ? '<span class="pp-lab">✦ AI-SAMMENDRAG</span>' : ''}<p>${esc(lead)}</p></div>` : ''}
    <div class="pp-items">${items.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${P.cat === 'siste' ? `<span class="pp-lab pp-cat">${esc(catName(x.category).toUpperCase())}</span>` : ''}<span class="m-grow"><span class="pp-it">${esc(x.title)}</span><span class="pp-mut">${esc(x.feed)} · ${esc(timeOf(x.published))}${x.ai || x.aiCategory ? ' · ✦ AI' : ''}</span></span><span class="pp-mut">›</span></a>`).join('') || '<div class="pp-mut" style="padding:20px 0">Ingen saker i denne kategorien.</div>'}</div>`}
    ${P.set ? newsSheet(feeds, st, cats) : ''}
  </div>`;
}
function newsSheet(feeds, st, cats) {
  const tog = (k, n, s, on) => `<button class="pp-tog" data-pp="newstog" data-k="${k}" role="switch" aria-checked="${on}"><span class="m-grow"><b>${n}</b><span class="pp-mut">${s}</span></span><span class="pp-sw${on ? ' on' : ''}"><i></i></span></button>`;
  return `<div class="sheet-bg" data-pp="newssetx"></div><div class="pp-sheet tall" role="dialog" aria-label="Kilder og AI">
    <div class="pp-row"><div><div class="pp-lab">NYHETSLESER</div><div class="pp-sh">Kilder og AI</div></div><button class="pp-btn ink sm" data-pp="newssetx">Ferdig</button></div>
    <div class="pp-card pp-tight">${tog('aiSummary', '✦ AI-sammendrag', 'Lager en kort ingress over de viktigste sakene øverst.', st.aiSummary !== false)}${tog('aiCategorize', '✦ AI-kategorisering', 'Setter kategori per sak når kilden står på Auto.', st.aiCategorize !== false)}</div>
    <div class="pp-row"><span class="pp-lab">ADRESSER · ${feeds.length}</span><span class="pp-mut">Trykk på kategorien for å endre</span></div>
    <div class="pp-card pp-tight">${feeds.map((f, i) => `<div class="pp-feed"><span class="pp-fi" style="background:${esc(f.color || FCOL[i % FCOL.length])}">${esc(String(f.name).slice(0, 2).toUpperCase())}</span><span class="m-grow"><b class="m-ell">${esc(f.name)}</b><span class="pp-mono m-ell">${esc(f.url)}</span>${f.lastError ? `<span class="pp-lab" style="letter-spacing:0">${esc(f.lastError)}</span>` : ''}</span>
      <button class="pp-chip" data-pp="feedcat" data-id="${f.id}" data-c="${esc(f.category)}">${f.category === 'auto' && st.aiCategorize !== false ? '✦ ' : ''}${esc(f.category === 'auto' ? 'Auto' : cats.find(([k]) => k === f.category)?.[1] ?? f.category)} ▾</button><button class="pp-x" data-pp="feeddel" data-id="${f.id}" aria-label="Fjern ${esc(f.name)}">×</button></div>`).join('') || '<div class="pp-mut" style="padding:12px">Ingen kilder.</div>'}</div>
    <form class="pp-col" data-ppform="feed"><input class="pp-in" name="url" value="${esc(P.nf)}" placeholder="https://www.nrk.no/toppsaker.rss" inputmode="url" autocomplete="off" aria-label="RSS- eller Atom-adresse"><button class="pp-btn lab" type="submit" ${P.busy ? 'disabled' : ''}>${P.busy ? 'Sjekker …' : '+ Legg til adresse'}</button><span class="pp-mut">${st.aiCategorize !== false ? '✦ AI finner navnet på kilden og foreslår kategori.' : 'Kategorien settes til Auto.'}</span></form>
  </div>`;
}

/* ---------- Hendelser ---------- */

async function uploadPhoto(f) {
  const fd = new FormData(); fd.append('file', f, f.name || 'bilde.jpg');
  const r = await fetch('/api/me/photo-window', { method: 'POST', body: fd });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error || (r.status === 404 ? 'Serveren støtter ikke eget bilde ennå' : `Feil ${r.status}`));
  P.photo.custom = { ...d, t: Date.now() };
}

export async function paperBind(e, t) {
  if (!paper() && m.screen !== 'nyheter') return false;
  if (e.type === 'change') {
    if (t.matches?.('[data-ppfile]')) {
      const f = t.files?.[0]; t.value = ''; if (!f) return true;
      try { await uploadPhoto(f); setPref('photo', 'custom'); P.open = false; flash('Bakgrunnen er lagret'); } catch (err) { flash(err.message); }
      draw(); return true;
    }
    if (t.matches?.('[data-ppscanrec]')) {
      const files = [...t.files]; t.value = ''; P.scan = false;
      for (const f of files) { const fd = new FormData(); fd.append('file', f, f.name || 'oppskrift.jpg'); const r = await fetch('/mat/api/recipes/scan', { method: 'POST', body: fd }).catch(() => null); if (!r?.ok) { flash(r?.status === 404 ? 'Serveren støtter ikke skanning av oppskrifter ennå' : 'Kunne ikke laste opp oppskriften'); draw(); return true; } }
      flash('Oppskriften leses i bakgrunnen'); location.hash = '#/mat'; return true;
    }
    return false;
  }
  if (e.type === 'input') { if (t.closest?.('[data-ppform=feed]')) { P.nf = t.value; return true; } return false; }
  if (e.type === 'submit') {
    if (t.matches?.('[data-ppsearch]')) { e.preventDefault(); const q = t.q.value.trim(); if (q) { hlApi('/search/history', { method: 'POST', json: { q } }).catch(() => {}); location.href = /^\S+\.\S+$/.test(q) && !/\s/.test(q) ? (/^https?:/.test(q) ? q : 'https://' + q) : `https://www.google.com/search?q=${encodeURIComponent(q)}`; } return true; }
    if (t.matches?.('[data-ppform=feed]')) {
      e.preventDefault(); const v = String(new FormData(t).get('url') || '').trim(); if (!v) return true;
      P.busy = true; draw();
      try { await hlApi('/rss/feeds', { method: 'POST', json: { url: /^https?:/i.test(v) ? v : 'https://' + v } }); P.nf = ''; await newsLoad(); flash('Kilden er lagt til'); } catch (err) { flash(err.message); }
      P.busy = false; draw(); return true;
    }
    return false;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-pp]');
  if (!x) { if (P.open && !t.closest?.('.pp-menu')) { P.open = false; draw(); } return false; }
  if (x.tagName !== 'LABEL') e.preventDefault();
  const k = x.dataset.pp;
  if (k === 'photo') { P.open = !P.open; if (P.open) Promise.all(PHOTOS.map(([q]) => photoLoad(q))).then(draw); draw(); return true; }
  if (k === 'setphoto') { P.open = false; saveDesign({ photo: x.dataset.k }, false); await photoLoad(x.dataset.k); draw(); return true; }
  if (k === 'scan') { P.scan = true; draw(); return true; }
  if (k === 'scanx') { P.scan = false; draw(); return true; }
  if (k === 'newsback') { history.length > 1 ? history.back() : (location.hash = '#/mer'); return true; }
  if (k === 'newsset') { P.set = true; draw(); return true; }
  if (k === 'newssetx') { P.set = false; draw(); return true; }
  if (k === 'cat') { P.cat = x.dataset.k; P.news = P.news ? { ...P.news, items: [] } : null; draw(); await newsLoad(); draw(); return true; }
  if (k === 'newstog') {
    const st = P.news?.settings ?? {}, key = x.dataset.k, v = !(st[key] !== false);
    try { await hlApi('/rss/settings', { method: 'PUT', json: { [key]: v } }); if (P.news) P.news.settings = { ...st, [key]: v }; await newsLoad(); } catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (k === 'feedcat') {
    const L = ['auto', ...CATS.slice(1).map(([c]) => c)], next = L[(L.indexOf(x.dataset.c) + 1) % L.length];
    try { await hlApi(`/rss/feeds/${x.dataset.id}`, { method: 'PATCH', json: { category: next } }); await newsLoad(); } catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (k === 'feeddel') {
    try { await hlApi(`/rss/feeds/${x.dataset.id}`, { method: 'DELETE' }); await newsLoad(); flash('Kilden er fjernet'); } catch (err) { flash(err.message); }
    draw(); return true;
  }
  return false;
}

export const paperState = P;
export { openSheet };
