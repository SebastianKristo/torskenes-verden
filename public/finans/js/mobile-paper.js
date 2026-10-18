// Papir (prompt 13): det nye felles mobildesignet «Forside med kort» (Mobil Nytt Design 2a / Mobil Papir App).
// Lyst papir (#f3efe6) eller kveldspapir (#14130f), Newsreader, Manrope og IBM Plex Mono, et fotovindu øverst og en svart
// pillefanelinje nederst med Hjem, Finans, Mat, Sporing, Mer og +Skann. Ingen Liquid Glass og ingen Material You.
// Alle eksisterende sider tegnes i Papir ved at Android-fargerollene (--m3-*) får papirfarger (se mobile-theme.js).
// Her ligger skallet (fotovindu og fanelinje), Papir-forsiden, Finans-oversikten, Mer, Media og nyhetsleseren.
import { S, esc, n0, hlApi, ini, today } from './core.js';
import { m, draw, flash, pref, setPref, meName, avInner, avatarUrl, openSheet, upload, ACTIVE_JOBS } from './mobile.js';
import { hlData, hlDom, yrUrl, ruterUrl } from './mobile-hl.js';
import { TR, active, badge, carName } from './mobile-track.js';
import { haptic } from './mobile-haptics.js';
import { matToday, matTitle } from './mobile-mat.js';

/* ---------- Valg (per bruker i /api/me/layout, med lokal kopi) ---------- */

export const paper = () => pref('mDesign') === 'papir';
export const paperDark = () => { const v = pref('paperMode'); return v === 'mork' || (v === 'auto' && !!matchMedia('(prefers-color-scheme: dark)').matches); };
const PHOTOS = [['cur', 'Nåværende'], ['oslo', 'Oslo'], ['weather', 'Vær nå'], ['planets', 'Planeter']];
const PHOTO_SUB = { cur: 'Mørk gradient', oslo: 'Bilde av Oslo', weather: 'Følger været nå', planets: 'Ny planet hver dag (NASA)', custom: 'Ditt eget bilde' };
const WX_NB = { clear: 'klart', klart: 'klart', cloudy: 'skyet', sky: 'skyet', rain: 'regn', regn: 'regn', snow: 'snø', fog: 'tåke', night: 'natt' };
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

const P = { photo: {}, img: {}, fail: {}, open: false, news: null, newsErr: '', cat: 'siste', set: false, nf: '', media: null, busy: false, press: false, hint: '' };
const FALLBACK = {
  cur: 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)',
  oslo: 'linear-gradient(170deg,#f2b36b 0%,#d7766a 45%,#4a3a5e 100%)',
  weather: 'linear-gradient(170deg,#4a5a6c 0%,#7d8b99 55%,#b7c0c8 100%)',
  planets: 'linear-gradient(170deg,#05060d 0%,#141a33 100%)',
  custom: 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)',
};
// Mørk toning øverst og nederst, så teksten i fotovinduet alltid er lesbar.
const OV = 'linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0) 35%,rgba(0,0,0,.45))';

// Bildene kommer fra serveren (/api/bg/…, lastet ned og cachet der), med reservebilder i «fallbacks».
// Hvert bilde prøves i rekkefølge; feiler alle, vises gradienten og «Fikk ikke lastet bildet · trykk for å prøve igjen».
export async function photoLoad(kind = photoKind(), force = false) {
  if (kind === 'cur') { P.photo.cur = { url: null, gradient: FALLBACK.cur, t: Date.now() }; return; }
  if (!force && P.photo[kind]?.t > Date.now() - 10 * 60000) return;
  try { const r = await hlApi(`/photo-window?kind=${kind}`); P.photo[kind] = { ...r, t: Date.now() }; }
  catch { P.photo[kind] = { url: null, gradient: FALLBACK[kind], t: Date.now() }; }
  await probe(kind, force);
}
function probe(kind, force) {
  const p = P.photo[kind], list = [p?.url, ...(p?.fallbacks ?? [])].filter(Boolean);
  if (!list.length) { P.img[kind] = null; P.fail[kind] = false; return Promise.resolve(); }
  if (!force && P.img[kind] && list.includes(P.img[kind])) return Promise.resolve();
  return new Promise((done) => {
    const next = (i) => {
      if (i >= list.length) { P.img[kind] = null; P.fail[kind] = true; console.warn(`[papir] fikk ikke lastet bakgrunnen «${kind}»`); return done(); }
      const im = new Image(), u = list[i] + (force ? `${list[i].includes('?') ? '&' : '?'}r=${Date.now()}` : '');
      const to = setTimeout(() => { im.onload = im.onerror = null; next(i + 1); }, 8000);
      im.onload = () => { clearTimeout(to); P.img[kind] = u; P.fail[kind] = false; done(); };
      im.onerror = () => { clearTimeout(to); next(i + 1); };
      im.src = u;
    };
    next(0);
  });
}
const bgOf = (kind) => {
  const u = P.img[kind];
  if (u) return `background-image:${OV},url('${esc(u)}')`;
  return `background-image:${OV},${P.photo[kind]?.gradient || FALLBACK[kind] || FALLBACK.cur}`;
};
const thumbOf = (kind) => { const u = P.img[kind]; return u ? `background-image:url('${esc(u)}')` : `background-image:${P.photo[kind]?.gradient || FALLBACK[kind]}`; };

/* ---------- Skall: fotovindu og fanelinje ---------- */

const PAGE = {
  hjem: ['Finans', () => { const s = S.summary; return s ? `${cap(new Date(s.month + '-15').toLocaleDateString('nb-NO', { month: 'long' }))} · ${s.daysLeft} dager igjen` : 'Denne måneden'; }],
  liste: ['Liste', 'Alle kontoer'], budsjett: ['Budsjett', 'Denne måneden'], sok: ['Søk', '✦ Spør om alt'], fmer: ['Mer', 'Finans'],
  mat: ['Mat', () => { const t = matToday(); return t?.week ? `Uke ${t.week}` : 'Ukeplan og oppskrifter'; }],
  spor: ['Sporing', () => { const a = active(TR.data?.items ?? []), r = a.filter((p) => p.status === 'ready_for_pickup').length; return TR.data ? `${a.length} på vei${r ? ` · ${r} klar` : ''}` : 'Pakker og sendinger'; }],
  mer: ['Mer', 'Alle moduler'], set: ['Innstillinger', 'Konto og utseende'], media: ['Media', 'Plex · Jellyfin'],
  dom: ['Domener', 'Siste 24 timer'], 'dom/pub': ['Publikum', 'Kart, land og enheter'], 'dom/ytl': ['Ytelse', 'Statuskoder, fart og sikkerhet'], 'dom/inf': ['Infrastruktur', 'Oppetid, DNS og domeneinfo'], 'dom/admin': ['Domener', 'Legg til og fjern'],
  aks: ['Aksjer', 'Trading 212'], sub: ['Abonnementer', 'Subscription OS'], dir: ['Boliger', 'Utgifter og prosjekter'], finn: ['Finn', 'Kjøp og salg'],
  kv: ['Kvitteringer', 'Til gjennomgang'], fast: ['Faste trekk', 'Neste 30 dager'], konto: ['Kontoer', 'Saldo'], rap: ['Rapporter', 'Måned og år'], imp: ['Import', 'Bank, Excel og Finn'],
  skann: ['Kvittering', 'Bekreft'], opp: ['Kø', 'Kvitteringer'], hl: ['', ''],
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Finans har egen fanelinje (Oversikt, Liste, Finn, Mer); undersidene ligger under Finans → Mer.
export const FIN_MAIN = ['hjem', 'liste', 'finn', 'fmer'];
export const FIN_SUB = ['budsjett', 'kv', 'fast', 'konto', 'aks', 'sub', 'dir', 'imp', 'rap', 'sok', 'skann', 'opp'];
export const ctxOf = (scr) => (scr === 'dom' ? 'dom' : FIN_MAIN.includes(scr) || FIN_SUB.includes(scr) ? 'fin' : 'main');
const NAMES = { hl: 'Hjem', mer: 'Mer', fmer: 'Mer', hjem: 'Oversikt', liste: 'Liste', finn: 'Finn', mat: 'Mat', spor: 'Sporing', set: 'Innstillinger' };
// Hvor pila øverst til venstre går: Finans-fanene og de andre hovedfanene går hjem, undersider til forelderen.
function parentOf(scr) {
  if (scr === 'liste' && m.detail) return ['txback', 'Liste'];
  if (scr === 'finn' && m.sub) return ['finn', 'Finn'];
  if (scr === 'set' && m.sub) return ['set', 'Innstillinger'];
  if (scr === 'mat' && m.sub) return ['mat', 'Mat'];
  if (scr === 'dom') { if (m.sub === 'admin') return ['dom', 'Domener']; const f = m.domFrom && m.domFrom !== 'dom' ? m.domFrom : 'hl'; return [f, NAMES[f] ?? 'Tilbake']; }
  if (scr === 'skann' && m.rc) return ['back', 'Kvitteringer'];
  if (FIN_SUB.includes(scr)) return ['fmer', 'Mer'];
  if (['media', 'nyheter'].includes(scr)) return ['mer', 'Mer'];
  if (scr === 'set') return [m.setFrom && m.setFrom !== 'set' ? m.setFrom : 'hl', NAMES[m.setFrom] ?? 'Hjem'];
  return ['hl', 'Hjem'];
}
const greetTxt = (h) => (h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 17 ? 'God dag' : 'God kveld');

export function paperHero(scr) {
  const home = scr === 'hl', kind = photoKind();
  const key = scr === 'dom' && m.sub ? `dom/${m.sub}` : scr;
  const [title, kick] = (scr === 'mat' && matTitle()) || (PAGE[key] ?? PAGE[scr] ?? [cap(scr), '']);
  const kicker = home ? cap(new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })) : typeof kick === 'function' ? kick() : kick;
  const ttl = home ? `${greetTxt(new Date().getHours())},<br>${esc(meName().split(' ')[0])}` : esc(title);
  const [pk, pl] = parentOf(scr);
  const w = hlData()?.weather;
  const backBtn = home ? '<span class="pp-brand">Homelab</span>'
    : ['txback', 'back'].includes(pk) ? `<button class="pp-pill" data-mact="${pk}">‹ ${esc(pl)}</button>` : `<a class="pp-pill" href="#/${pk}">‹ ${esc(pl)}</a>`;
  const failNote = home && P.fail[kind] ? '<button class="pp-pill pp-fail" data-pp="retry">Fikk ikke lastet bildet · trykk for å prøve igjen</button>' : '';
  return `<header class="pp-hero${home ? ' home' : ''}" style="${bgOf(kind)}">
    <div class="pp-top">${backBtn}<span class="m-grow"></span>
      ${home ? `<button class="pp-pill" data-pp="photo" aria-haspopup="menu" aria-expanded="${P.open}">${esc(PHOTOS.find(([k]) => k === kind)?.[1] ?? 'Eget bilde')} ▾</button>` : ''}
      <a class="pp-av${avatarUrl() ? ' img' : ''}" href="#/set" aria-label="Innstillinger">${avInner()}</a></div>
    ${home ? photoMenu(kind) : ''}${failNote}
    <div class="pp-bottom"><div class="m-grow"><div class="pp-kick">${esc(kicker)}</div><h1 class="pp-title${home ? ' big' : ''}">${ttl}</h1></div>
      ${home && w ? `<a class="pp-temp" href="${esc(yrUrl(w))}" target="_blank" rel="noopener"><b>${w.temp != null ? Math.round(w.temp) + '°' : '–'}</b><span>${esc(w.text ?? '')}${w.updated ? ` · ${esc(new Date(w.updated).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }))}` : ''} ›</span></a>` : ''}</div>
    ${P.photo[kind]?.credit && home ? `<span class="pp-credit">${esc(P.photo[kind].credit)}</span>` : ''}
  </header>`;
}

// Egen nedtrekksmeny (ikke systemets): papirfarget panel med radius 18, miniatyrer 30×30 og ✓ på valgt rad.
function photoMenu(kind) {
  const sub = (k) => {
    if (P.fail[k]) return 'Fikk ikke lastet bildet · trykk for å prøve igjen';
    if (k === 'weather') { const sy = WX_NB[P.photo.weather?.symbol] ?? WX_NB[String(P.photo.weather?.symbol ?? '').split('_')[0]]; return `${PHOTO_SUB.weather}${sy ? ` · ${sy}` : ''}`; }
    return PHOTO_SUB[k];
  };
  return `<div class="pp-menu${P.open ? ' open' : ''}" role="menu" aria-hidden="${!P.open}">${PHOTOS.map(([k, n]) => `<button role="menuitemradio" aria-checked="${kind === k}" data-pp="setphoto" data-k="${k}" tabindex="${P.open ? 0 : -1}"><span class="pp-th" style="${thumbOf(k)}"></span><span class="m-grow pp-mi"><span>${n}</span><small class="${P.fail[k] ? 'bad' : ''}">${esc(sub(k))}</small></span><span class="pp-ck${P.fail[k] && kind !== k ? ' bad' : ''}">${kind === k ? '✓' : P.fail[k] ? '!' : ''}</span></button>`).join('')}
    <i class="pp-msep"></i>
    <label class="pp-own"><span class="pp-th dash">+</span><span class="m-grow pp-mi"><span>Eget bilde</span>${kind === 'custom' ? '<small>Valgt</small>' : ''}</span><span class="pp-ck">${kind === 'custom' ? '✓' : ''}</span><input class="m-file" type="file" accept="image/jpeg,image/png,image/webp" data-ppfile></label></div>`;
}

// Fanelinja: jevnt fordelte faner (aktiv fane har ikon og egen bredde), og +-knappen rett etter Mer.
// Hjem vises bare på Hjem; ellers går pila øverst til venstre hjem. Finans og Domener har sine egne faner.
export function paperNav(scr) {
  const ctx = ctxOf(scr);
  let tabs, cur, plus;
  if (ctx === 'fin') {
    tabs = [['hjem', 'Oversikt', '◎'], ['liste', 'Liste', '≡'], ['finn', 'Finn', '⇄'], ['fmer', 'Mer', '⋯']];
    cur = FIN_MAIN.includes(scr) ? scr : 'fmer'; plus = ['Legg til kvittering', 'fin'];
  } else if (ctx === 'dom') {
    tabs = [['dom', 'Oversikt', '◎'], ['dom/pub', 'Publikum', '◍'], ['dom/ytl', 'Ytelse', '⚡'], ['dom/inf', 'Infra', '▤']];
    cur = ['pub', 'ytl', 'inf'].includes(m.sub) ? `dom/${m.sub}` : 'dom'; plus = ['Legg til domene', 'dom'];
  } else {
    tabs = [['hl', 'Hjem', '⌂'], ['hjem', 'Finans', 'kr'], ['mat', 'Mat', '◐'], ['spor', 'Sporing', '▣'], ['mer', 'Mer', '⋯']].filter(([k]) => k !== 'hl' || scr === 'hl');
    cur = ['hl', 'mat', 'spor'].includes(scr) ? scr : 'mer'; plus = [scr === 'mat' ? 'Skann oppskrift' : 'Skann', scr === 'mat' ? 'mat' : 'main'];
  }
  return `<div class="pp-navbg" aria-hidden="true"></div><nav class="pp-nav" aria-label="Faner">${tabs.map(([k, n, ic]) => `<a href="#/${k}" data-tab="${k}" ${cur === k ? 'aria-current="page"' : ''}>${cur === k ? `<i>${ic}</i>` : ''}<span>${n}</span></a>`).join('')}
    <button class="pp-scan${P.press ? ' down' : ''}" data-ppplus="${plus[1]}" aria-label="${plus[0]} (trykk for valg, hold inne for å laste opp)" title="Trykk for valg · hold inne for å laste opp">+</button></nav>
    <input class="m-file" id="pp-quick" type="file" multiple accept="${plus[1] === 'mat' ? 'image/*,application/pdf' : 'application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif'}" data-ppquick="${plus[1]}">
    ${P.hint ? `<div class="pp-hint" role="status">${esc(P.hint)}</div>` : ''}`;
}

/* Arket for +: kamera og filer med kø (Finans), skann (hoved) eller oppskrift (Mat). */
export function paperScanSheet() {
  if (!P.scan) return '';
  const ctx = ctxOf(m.screen), mat = m.screen === 'mat';
  const jobs = P.qShow ? (m.jobs ?? []).filter((j) => ACTIVE_JOBS.includes(j.status) || j.status === 'needs_review').slice(0, 5) : [];
  const q = jobs.map((j) => { const run = ACTIVE_JOBS.includes(j.status), pct = run ? Math.max(5, Math.min(99, j.progress ?? 30)) : 100;
    return `<div class="pp-q"><div class="pp-row"><span class="m-ell">${esc(j.merchant || j.name || 'Kvittering')}</span><span class="${run ? 'pp-lab-c' : 'pp-pos'}">${run ? `✦ Leser … ${pct} %` : '✓ Klar til bekreftelse'}</span></div><span class="pp-bar"><i style="width:${pct}%;background:${run ? 'var(--pp-lab)' : 'var(--pp-pos)'}"></i></span></div>`; }).join('');
  const title = mat ? 'Skann oppskrift' : ctx === 'fin' ? 'Legg til kvittering' : 'Skann';
  const sub = ctx === 'fin' ? 'Ta bilde, velg filer eller del fra e-post. ✦ Gemini leser i bakgrunnen og kobler mot transaksjonen.' : mat ? 'Bilde eller PDF av en oppskrift. ✦ AI trekker ut ingredienser og steg.' : 'Kvittering, oppskrift eller dokument. ✦ Gemini leser i bakgrunnen.';
  return `<div class="sheet-bg" data-pp="scanx"></div><div class="pp-sheet" role="dialog" aria-label="${esc(title)}"><span class="pp-grab"></span>
    <div class="pp-sh">${esc(title)}</div><div class="pp-mut">${esc(sub)}</div>${q}
    ${mat ? '' : '<button class="pp-btn ink" data-mact="cam">Kamera</button>'}
    ${mat ? '' : '<label class="pp-btn">Bilder eller filer<input class="m-file" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif" data-ppquick="fin"></label>'}
    ${ctx === 'fin' ? '' : `<label class="pp-btn${mat ? ' ink' : ''}">${mat ? 'Kamera, bilder eller PDF' : 'Oppskrift'}<input class="m-file" type="file" multiple accept="image/*,application/pdf" data-ppscanrec></label>`}
    <button class="pp-btn ghost" data-pp="scanx">${q ? 'Lukk' : 'Avbryt'}</button></div>`;
}

/* +-knappen: trykk = valgarket, hold inne 450 ms = filvelgeren direkte (med haptisk tikk og en kort hint-boble).
   Filvelgeren åpnes når fingeren slippes, fordi nettleseren bare tillater det i en brukerhandling. */
let plusT = null, plusLong = false, plusEl = null;
export function paperDown(e) {
  const x = e.target.closest?.('[data-ppplus]');
  if (!x) return false;
  plusEl = x; plusLong = false; P.press = true; x.classList.add('down');
  clearTimeout(plusT);
  plusT = setTimeout(() => { plusLong = true; haptic('tap'); navigator.vibrate?.(12); P.hint = 'Slipp for å velge filer'; showHint(); }, 450);
  return true;
}
const showHint = () => { const n = document.querySelector('.pp-hint') ?? Object.assign(document.createElement('div'), { className: 'pp-hint' }); n.textContent = P.hint; n.setAttribute('role', 'status'); if (!n.isConnected) document.querySelector('.m.papir')?.appendChild(n); };
export function paperUp(e) {
  if (!plusEl) return false;
  clearTimeout(plusT); P.press = false; plusEl.classList.remove('down');
  const over = e.type === 'pointerup' && plusEl.contains(document.elementFromPoint(e.clientX, e.clientY));
  plusEl = null;
  if (plusLong && over) { plusLong = 'used'; document.getElementById('pp-quick')?.click(); setTimeout(() => { P.hint = ''; document.querySelector('.pp-hint')?.remove(); }, 1600); }
  else { P.hint = ''; document.querySelector('.pp-hint')?.remove(); }
  return true;
}
export function paperMove(e) { if (plusEl && !plusLong && (Math.abs(e.movementX) > 6 || Math.abs(e.movementY) > 6)) { clearTimeout(plusT); } return false; }

/* ---------- Papir-forsiden (Hjem) ---------- */

const lab = (t, r = '') => `<div class="pp-sec"><span>${esc(t)}</span>${r ? `<span>${r}</span>` : ''}</div>`;
const timeOf = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(+d)) return ''; return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }); };
const srcIni = (s) => { const t = String(s ?? '').trim(); return /^[A-ZÆØÅ0-9]{2,4}$/.test(t) ? t : t.slice(0, 3).toUpperCase(); };

export function paperHome() {
  const H = hlData(), w = H?.weather;
  const pk = active(TR.data?.items ?? []).sort((a, b) => (a.status === 'ready_for_pickup' ? -1 : 0) - (b.status === 'ready_for_pickup' ? -1 : 0));
  const p0 = pk[0];
  const pkg = p0 ? `<a class="pp-card pp-pkg" href="#/spor">${badge(p0.carrier, 52, p0.carrierLogo)}<span class="m-grow"><span class="pp-lab">${p0.status === 'ready_for_pickup' ? 'HENT I DAG' : 'PÅ VEI'}</span><b class="pp-serif">${esc(p0.name || p0.shop || p0.trackingNo)}</b><span class="pp-mut m-ell">${esc(p0.pickupPoint || p0.statusText || carName(p0.carrier))}${p0.eta ? ` · ${esc(/^\d{4}-\d\d-\d\d/.test(p0.eta) ? (p0.status === 'ready_for_pickup' ? 'innen ' : '') + new Date(p0.eta.slice(0, 10) + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'numeric' }) : p0.eta)}` : ''}</span></span>${pk.length > 1 ? `<span class="pp-mut">${pk.length - 1} til ›</span>` : ''}</a>` : '';
  const trips = (H?.ruter ?? []).flatMap((x) => (x.departures ?? []).slice(0, 2).map((d) => ({ ...d, min: d.min ?? d.minutes, to: d.to ?? x.to, from: x.from }))).sort((a, b) => (a.min ?? 99) - (b.min ?? 99)).slice(0, 3);
  const ruter = trips.length ? `<a class="pp-card pp-ruter" href="${esc(ruterUrl(H.ruter[0]?.from))}" target="_blank" rel="noopener"><div class="pp-row"><span class="pp-lab">AVGANGER${H.ruter[0]?.from ? ` · ${esc(H.ruter[0].from.toUpperCase())}` : ''}</span><span class="pp-mut">sanntid ›</span></div>
      ${trips.map((d) => `<div class="pp-dep"><span class="pp-line" style="background:${esc(lineBg(d))};color:${esc(lineFg(d))}">${esc(d.line)}</span><span class="m-grow m-ell">${esc(d.to ?? '')}</span><b class="pp-serif">${d.min != null ? (d.min <= 0 ? 'nå' : d.min) : ''}</b><span class="pp-mut pp-min">${d.min > 0 ? 'min' : ''}</span></div>`).join('')}</a>` : '';
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
    <div class="pp-minis">${minis.map(([k, v, sub, c, href, fs]) => `<a class="pp-card pp-mini" href="${href}"><span class="pp-lab mut">${k}</span><b class="pp-serif m-ell" style="font-size:${fs}">${esc(v)}</b><span class="${c === 'lab' ? 'pp-lab-c' : `pp-${c}`}" style="font-size:11px">${esc(sub)}</span></a>`).join('')}</div>
    ${newsCard(H?.news)}
  </div>`;
}
// Ruters egne linjefarger (fra Entur via serveren), med Ruters standardfarger per transportmiddel som reserve.
const RUTER = { metro: '#EC700C', tram: '#0B91EF', bus: '#E60000', regionbus: '#75A300', water: '#682C88', ferry: '#682C88', rail: '#003087', train: '#003087' };
export const lineBg = (d) => d.color || RUTER[d.mode] || (/^\d$/.test(String(d.line)) ? RUTER.metro : /^1[1-9]$/.test(String(d.line)) ? RUTER.tram : /^\d{2,3}[A-Z]?$/.test(String(d.line)) ? RUTER.bus : RUTER.metro);
export const lineFg = (d) => d.textColor || '#ffffff';

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
  const rows = [['dom', 'Domener', 'Trafikk, besøk og oppetid'], ['media', 'Media', 'Spilles nå og historikk'], ['hjem', 'Finans', 'Oversikt, liste, Finn og mer'],
    ['nyheter', 'Nyhetsleser', 'RSS med AI-sammendrag'], ['set', 'Innstillinger', 'Tema, bakgrunn og konto']];
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

async function recipeUpload(files) {
  P.scan = false;
  for (const f of files) { const fd = new FormData(); fd.append('file', f, f.name || 'oppskrift.jpg'); const r = await fetch('/mat/api/recipes/scan', { method: 'POST', body: fd }).catch(() => null); if (!r?.ok) { flash(r?.status === 404 ? 'Serveren støtter ikke skanning av oppskrifter ennå' : 'Kunne ikke laste opp oppskriften'); draw(); return true; } }
  flash('Oppskriften leses i bakgrunnen'); if (location.hash !== '#/mat') location.hash = '#/mat'; else draw(); return true;
}
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
    if (t.matches?.('[data-ppquick]')) {
      const files = [...t.files]; t.value = ''; if (!files.length) return true;
      if (t.dataset.ppquick === 'mat') return recipeUpload(files);
      P.scan = true; P.qShow = true; draw();
      await upload(files, { stay: true });
      draw(); return true;
    }
    if (t.matches?.('[data-ppscanrec]')) {
      const files = [...t.files]; t.value = ''; return recipeUpload(files);
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
  const plus = t.closest?.('[data-ppplus]');
  if (plus) {
    e.preventDefault();
    if (plusLong) { plusLong = false; return true; } // holdt inne: filvelgeren er allerede åpnet
    if (plus.dataset.ppplus === 'dom') { location.hash = '#/dom/admin'; return true; }
    P.scan = true; P.qShow = (m.jobs ?? []).some((j) => ACTIVE_JOBS.includes(j.status)); draw(); return true;
  }
  const x = t.closest?.('[data-pp]');
  if (!x) { if (P.open && !t.closest?.('.pp-menu')) { P.open = false; draw(); } return false; }
  if (x.tagName !== 'LABEL') e.preventDefault();
  const k = x.dataset.pp;
  if (k === 'photo') { P.open = !P.open; if (P.open) Promise.all(PHOTOS.map(([q]) => photoLoad(q))).then(draw); draw(); return true; }
  if (k === 'setphoto') { const kk = x.dataset.k, retry = P.fail[kk]; P.open = false; saveDesign({ photo: kk }, false); draw(); await photoLoad(kk, retry); draw(); return true; }
  if (k === 'retry') { await photoLoad(photoKind(), true); draw(); return true; }
  if (k === 'scan') { P.scan = true; draw(); return true; }
  if (k === 'scanx') { P.scan = false; P.qShow = false; draw(); return true; }
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
