// Papir (prompt 13): det nye felles mobildesignet «Forside med kort» (Mobil Nytt Design 2a / Mobil Papir App).
// Lyst papir (#f3efe6) eller kveldspapir (#14130f), Newsreader, Manrope og IBM Plex Mono, et fotovindu øverst og en svart
// pillefanelinje nederst med Hjem, Finans, Mat, Sporing, Mer og +Skann. Ingen Liquid Glass og ingen Material You.
// Alle eksisterende sider tegnes i Papir ved at Android-fargerollene (--m3-*) får papirfarger (se mobile-theme.js).
// Her ligger skallet (fotovindu og fanelinje), Papir-forsiden, Finans-oversikten, Mer, Media og nyhetsleseren.
import { S, esc, n0, hlApi, ini, today, greet } from './core.js';
import { m, draw, flash, pref, setPref, meName, avInner, avatarUrl, openSheet, upload, ACTIVE_JOBS, startScr, domOk } from './mobile.js';
import { hlData, hlDom, ruterUrl, yrUrl } from './mobile-hl.js';
import { TR, active, badge, carName } from './mobile-track.js';
import { pkgLogo, pkgTitle, pkgMore } from './mobile-p21.js';
import { haptic } from './mobile-haptics.js';
import { matToday, matTitle } from './mobile-mat.js';
import { edOn, edBlocks, finKeys, finScreens, fabStyle, fourth, onWay, rcBanner, FX, openNewShip } from './mobile-paper3.js';
import { mainTabs, heroBg, bolTitle } from './mobile-p16.js';
import { SB } from './mobile-subs.js';
import { aksTitle } from './mobile-aks.js';
import * as P23 from './mobile-p23.js';
import * as P29 from './mobile-p29.js';
import * as P30 from './mobile-p30.js';
import * as P24 from './mobile-p24.js';
import * as P25 from './mobile-p25.js';
import * as P26 from './mobile-p26.js';
import * as KAL from './mobile-kal.js';
import * as P27 from './mobile-p27.js';
import * as P28 from './mobile-p28.js';
import * as P32 from './mobile-p32.js';
import { setTitle } from './mobile-set.js';
import { appName, huskeWidget, bolWidget, scanCtx, homeUpload, FT } from './mobile-p17.js';
import { posCard, ppTi } from './mobile-p20.js';
import { bgFetch, bgLayers, bgControls, saveBg, takeBg, bgSet } from './mobile-bg.js';
import * as P34 from './mobile-p34.js'; // prompt 34: Glimt-brief på Hjem (h12)
import * as P35 from './mobile-p35.js'; // prompt 35: Hjem-kortet med vertsfiguren
import * as P37 from './mobile-p37.js'; // prompt 37: Gjøremål-widgeten
import * as P37B from './mobile-p37b.js'; // prompt 37: bibelvers på Hjem, Pakker «bare når det er pakker»
import * as P36 from './mobile-p36.js'; // prompt 36: sveip bort brief-kortet, Now Brief i Mer, temperatur trykk/hold

/* ---------- Valg (per bruker i /api/me/layout, med lokal kopi) ---------- */

export const paper = () => pref('mDesign') === 'papir';
export const paperDark = () => { const v = pref('paperMode'); return v === 'mork' || (v === 'auto' && !!matchMedia('(prefers-color-scheme: dark)').matches); };
const PHOTOS = [['weather', 'Vær'], ['planets', 'Planeter'], ['oslo', 'Oslo'], ['cur', 'Ingen']];
const PHOTO_SUB = { cur: 'Bare mørk gradient', oslo: 'Oslo fra luften', weather: 'Følger været der du er (MET)', planets: 'Jorda, Månen, Jupiter, Mars og Saturn (NASA)', custom: 'Ditt eget bilde' };
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
  takeBg(r);
}

/* ---------- Fotovindu ---------- */

const P = { photo: {}, img: {}, fail: {}, open: false, news: null, newsErr: '', cat: 'siste', set: false, nf: '', media: null, busy: false, press: false, hint: '' };
// Når ingen bilder kan lastes: rolig gradient (prompt 21), aldri en tegning.
const CALM = 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)';
const FALLBACK = { cur: CALM, oslo: CALM, weather: CALM, planets: CALM, custom: CALM };

// Bildene kommer fra serveren (/api/bg/…, lastet ned og cachet der), med reservebilder i «fallbacks».
// Hvert bilde prøves i rekkefølge; feiler alle, vises gradienten og «Fikk ikke lastet bildet · trykk for å prøve igjen».
export async function photoLoad(kind = photoKind(), force = false) {
  if (kind === 'cur') { P.photo.cur = { url: null, gradient: FALLBACK.cur, t: Date.now() }; return; }
  if (!force && P.photo[kind]?.t > Date.now() - 10 * 60000) return;
  // Felles bakgrunnstjeneste (/api/background); eldre servere: /api/photo-window (se mobile-bg.js).
  try { const r = await bgFetch(kind); P.photo[kind] = { ...r, t: Date.now() }; }
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
      const to = setTimeout(() => { im.onload = im.onerror = null; next(i + 1); }, 9000);
      im.onload = () => { clearTimeout(to); P.img[kind] = u; P.fail[kind] = false; done(); };
      im.onerror = () => { clearTimeout(to); next(i + 1); };
      im.src = u;
    };
    next(0);
  });
}
// Fotovinduet tegnes som lag (bilde med uskarphet/papirfilter, mørklegging, scrim, tekstur og partikler), se mobile-bg.js.
const bgOf = (kind) => bgLayers({ img: P.img[kind], gradient: P.photo[kind]?.gradient || FALLBACK[kind] || FALLBACK.cur,
  particles: P.photo[kind]?.particles, papir: true, hint: heroHint(kind) });
// theme_hint gjelder bildet, eller serverens gradient når bildet mangler; reservegradientene er mørke.
export const heroHint = (kind = photoKind()) => (P.photo[kind]?.hint === 'light' && (P.img[kind] || P.photo[kind]?.gradient) ? 'light' : 'dark');
/** Klassisk Hjem: samme bakgrunn som et bånd bak hilsenen (null ved «Ingen»). */
export function classicBand() {
  const kind = photoKind();
  if (kind === 'cur') return null;
  if (!P.photo[kind] && !P.band) { P.band = true; photoLoad(kind).then(draw).catch(() => {}).finally(() => { P.band = false; }); }
  const p = P.photo[kind], img = P.img[kind];
  const credit = p?.credit && img ? `<span class="p19-cr">${p.creditUrl ? `<a href="${esc(p.creditUrl)}" target="_blank" rel="noopener" style="color:inherit">${esc(p.credit)}</a>` : esc(p.credit)}</span>` : '';
  return { cls: ` p19-band${heroHint(kind) === 'light' ? ' hint-light' : ''}`,
    html: bgLayers({ img, gradient: p?.gradient || FALLBACK[kind] || FALLBACK.cur, particles: p?.particles, papir: false, hint: heroHint(kind) }) + credit };
}

/* ---------- Skall: fotovindu og fanelinje ---------- */

const PAGE = {
  hjem: ['Finans', () => { const s = S.summary; return s ? `${cap(new Date(s.month + '-15').toLocaleDateString('nb-NO', { month: 'long' }))} · ${s.daysLeft} dager igjen` : 'Denne måneden'; }],
  liste: ['Liste', 'Alle kontoer'], budsjett: ['Budsjett', 'Denne måneden'], sok: ['Søk', '✦ Med Glimt'], fmer: ['Mer', 'Alt fra FinansHub på nettsiden'],
  mat: ['Mat', () => { const t = matToday(); return t?.week ? `Uke ${t.week}` : 'Ukeplan og oppskrifter'; }],
  spor: ['Sporing', 'Pakker og sendinger'],
  mer: ['Mer', 'Alle moduler'], set: ['Innstillinger', 'Konto og utseende'], media: ['Media', 'Plex · Jellyfin'],
  dom: ['Domener', 'Trafikk, besøk og oppetid'], 'dom/pub': ['Publikum', 'Kart, land og enheter'], 'dom/ytl': ['Ytelse', 'Statuskoder, fart og sikkerhet'], 'dom/inf': ['Infrastruktur', 'Oppetid, DNS og domeneinfo'], 'dom/admin': ['Domener', 'Legg til og fjern'],
  aks: ['Aksjer', 'Trading 212'], sub: ['Abonnementer', 'Subscription OS'], dir: ['Boliger', 'Utgifter, prosjekter og kvitteringer'], finn: ['Finn', 'Kjøp og salg'],
  avg: ['Avganger', 'Ruter · sanntid fra Entur'], fam: ['Familie', 'Posisjon, soner og helse'], huske: ['Gjøremål', 'To-do for hele familien'], bibel: ['Bibel', 'Dagens vers og leseplan'],
  bd: ['Bursdager', 'Familie og venner'], kal: ['Kalender', 'Skole og familie'], kv: ['Kvitteringer', 'Til gjennomgang'], fast: ['Faste trekk', 'Neste 30 dager'], konto: ['Kontoer', 'Saldo'], rap: ['Rapporter', 'Måned og år'], imp: ['Import', 'Bank, Excel og Finn'],
  skann: ['Kvittering', 'Bekreft'], opp: ['Kø', 'Kvitteringer'], hl: ['', ''],
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Finans har egen fanelinje (Oversikt, Liste, Finn, Mer); undersidene ligger under Finans → Mer.
export const FIN_MAIN = ['hjem', 'liste', 'finn', 'fmer'];
export const FIN_SUB = ['budsjett', 'kv', 'fast', 'konto', 'aks', 'sub', 'dir', 'imp', 'rap', 'sok', 'skann', 'opp'];
export const ctxOf = (scr) => (scr === 'dom' ? 'dom' : FIN_MAIN.includes(scr) || FIN_SUB.includes(scr) ? 'fin' : 'main');
const ABO_BACK = { mer: 'Mer', hl: 'Hjem', hjem: 'Oversikt', fmer: 'Mer', liste: 'Liste', finn: 'Finn', sok: 'Søk', set: 'Innstillinger', brief: 'Brief', huske: 'Gjøremål', kal: 'Kalender' };
const NAMES = { hl: 'Hjem', mer: 'Mer', fmer: 'Mer', hjem: 'Oversikt', liste: 'Liste', finn: 'Finn', mat: 'Mat', spor: 'Sporing', set: 'Innstillinger', sok: 'Søk', dom: 'Domener' };
// Hvor pila øverst til venstre går: Finans-fanene og de andre hovedfanene går hjem, undersider til forelderen.
// Prompt 24: i profilene Finans + Boliger og Boliger-profil er Boliger roten. Finans-fanene og Finans → Mer har ingen
// tilbake-knapp, og all «tilbake til Hjem» går til Boliger (også fra Domener).
function parentOf(scr) {
  const r = parentOf0(scr);
  if (!P24.profRoot()) return r;
  if ((finScreens().includes(scr) || scr === 'fmer') && !(m.detail && ['liste', 'sok', 'hjem'].includes(scr)) && !(scr === 'dir' && m.sub) && !(scr === 'finn' && m.sub)) return [null, ''];
  return r[0] === 'hl' && scr !== 'hl' ? ['dir', 'Boliger'] : r;
}
function parentOf0(scr) {
  if (scr === 'bd' || scr === 'kal' || scr === 'bibel') return ['mer', 'Mer'];
  if (m.detail && ['liste', 'sok', 'hjem'].includes(scr)) return ['txback', NAMES[scr]];
  if (scr === 'finn' && m.sub) return ['finn', 'Finn'];
  if (scr === 'set' && /^integ\/./.test(m.sub ?? '')) return ['set/integ', 'Integrasjoner'];
  if (scr === 'set' && m.sub) return ['set', 'Alle innstillinger'];
  if (scr === 'mat' && m.sub) return ['mat', 'Mat'];
  // Domener: pila (og sveip tilbake) går alltid hjem, også når Domener ble åpnet fra Mer.
  if (scr === 'dom') return m.sub === 'admin' ? ['dom', 'Domener'] : ['hl', 'Hjem'];
  if (scr === 'skann' && m.rc) return ['back', 'Kvitteringer'];
  if (scr === 'aks' && m.sub) return ['aks', 'Aksjer'];
  if (scr === 'dir' && m.sub) return ['dir', 'Boliger'];
  if (['avg', 'fam', 'vaer', 'huske'].includes(scr)) return ['hl', 'Hjem'];
  if (finScreens().includes(scr) || scr === 'fmer') return ['hl', 'Hjem'];
  // Prompt 38: Abonnement går tilbake dit det ble åpnet fra (Mer, Hjem, Oversikt, Finans → Mer, Innstillinger, brief).
  if (scr === 'sub' && m.aboFrom && m.aboFrom !== 'sub' && ABO_BACK[m.aboFrom]) return [m.aboFrom, ABO_BACK[m.aboFrom]];
  if (FIN_SUB.includes(scr)) return ['fmer', 'Mer'];
  if (['media', 'nyheter'].includes(scr)) return ['mer', 'Mer'];
  if (scr === 'set') return [m.setFrom && m.setFrom !== 'set' ? m.setFrom : 'hl', NAMES[m.setFrom] ?? 'Hjem'];
  return ['hl', 'Hjem'];
}

export function paperHero(scr) {
  const home = scr === 'hl', kind = photoKind();
  const key = scr === 'dom' && m.sub ? `dom/${m.sub}` : scr;
  const [title, kick] = (m.detail && ['liste', 'sok', 'hjem'].includes(scr) && ['Detaljer', 'Transaksjon']) || (scr === 'mat' && matTitle()) || (scr === 'dir' && m.sub && bolTitle()) || (scr === 'aks' && m.sub && aksTitle(m.sub)) || (scr === 'set' && m.sub && setTitle(m.sub) && [setTitle(m.sub), 'Innstillinger'])
    || (scr === 'sub' && SB.tab !== 'home' && [SB.tab === 'ins' ? 'Innsikt' : 'Historikk', 'Subscription OS']) || (PAGE[key] ?? PAGE[scr] ?? [cap(scr), '']);
  const kicker = home ? cap(new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })) : typeof kick === 'function' ? kick() : kick;
  // Hilsen etter tid på døgnet, alltid på to linjer: «God ettermiddag,» og navnet. Lange hilsener skaleres ned i stedet for å brytes.
  const ttl = home ? `<span class="pp-gl">${esc(greet())},</span><span class="pp-gl">${esc(meName().split(' ')[0])}</span>` : esc(title);
  const [pk, pl] = parentOf(scr);
  const w = hlData()?.weather;
  const backBtn = home ? `<span class="pp-brand">${esc(appName())}</span>` : !pk ? ''
    : ['txback', 'back'].includes(pk) ? `<button class="pp-pill pp-back" data-mact="${pk}">‹ ${esc(pl)}</button>` : `<a class="pp-pill pp-back${pk === 'hl' || pk === startScr() ? ' to-home' : ''}" href="#/${pk}">‹ ${esc(pl)}</a>`;
  const failNote = home && P.fail[kind] ? '<button class="pp-pill pp-fail" data-pp="retry">Fikk ikke lastet bildet · trykk for å prøve igjen</button>' : '';
  // Bakgrunnsvelgeren ligger under Innstillinger → Bakgrunn. Profilbildet åpner Innstillinger → Profil.
  // Prompt 30: bare profilbildet (38 px) – ingen @brukernavn-pille i toppen (brukernavnet står under Innstillinger → Konto).
  // Prompt 29: «Planeter ▾» på Hjem og øverst i Innstillinger (claude-code-innst-bakgrunn.md), samme meny begge steder.
  const bgPill = home || (scr === 'set' && !m.sub);
  const own = heroBg(scr), bolK = scr === 'dir' && !m.sub ? P24.bolKicker() : null;
  return `<header class="pp-hero${home ? ' home' : ''}${bgPill && P.open ? ' p29-open' : ''}${own ? ' own' : ''}${!own && heroHint(kind) === 'light' ? ' hint-light' : ''}" style="${own ?? ''}">${own ? '' : bgOf(kind)}${scr === 'dir' ? P24.bolFade() : ''}
    <div class="pp-top">${backBtn}<span class="m-grow"></span>
      ${bgPill ? `<button class="p29-bgp" data-pp="photo" aria-haspopup="menu" aria-expanded="${P.open}">${esc(BG_N[kind] ?? 'Nåværende')} ▾</button>` : ''}<a class="pp-av${avatarUrl() ? ' img' : ''}" href="#/set" aria-label="Innstillinger">${avInner()}</a></div>
    ${failNote}${bgPill && P.open ? bgMenu(kind) : ''}
    <div class="pp-bottom"><div class="m-grow"><div class="pp-kick">${esc(bolK ?? kicker)}</div><h1 class="pp-title${home ? ' big' : ''}">${ttl}</h1></div>${scr === 'dir' ? P24.domPill() : ''}
      ${home && w ? `<a class="pp-temp" href="${esc(yrUrl(w))}" target="_blank" rel="noopener" data-p36temp title="Trykk: Vær · Hold inne: åpne Yr" aria-label="Åpne værvisningen (hold inne for Yr)"><b>${w.temp != null ? Math.round(w.temp) + '°' : '–'}</b><span>${esc(w.text ?? '')}${w.updated ? ` · ${esc(new Date(w.updated).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }))}` : ''} ›</span></a>` : ''}</div>
    ${P.photo[kind]?.credit && home && P.img[kind] ? (P.photo[kind].creditUrl ? `<a class="pp-credit" href="${esc(P.photo[kind].creditUrl)}" target="_blank" rel="noopener">${esc(P.photo[kind].credit)}</a>` : `<span class="pp-credit">${esc(P.photo[kind].credit)}</span>`) : ''}
  </header>`;
}

// Prompt 29: bakgrunnsmenyen fra pillen (fasit: Mobil Papir App → Hjem/Innstillinger, «Planeter ▾»).
const BG_N = { cur: 'Nåværende', oslo: 'Oslo', weather: 'Vær nå', planets: 'Planeter', custom: 'Eget bilde' };
const BG_S = { cur: 'Mørk gradient', oslo: 'Bilde av Oslo', weather: 'Følger været nå', planets: 'Ny planet hver dag (NASA)' };
function bgMenu(kind) {
  const th = (k) => (P.img[k] ? `background-image:url("${esc(P.img[k])}")` : `background-image:${P.photo[k]?.gradient || FALLBACK[k] || 'linear-gradient(170deg,#4a5a6a,#1d242c)'}`);
  const opt = (k) => `<button class="p29-bo${kind === k ? ' on' : ''}" role="menuitemradio" aria-checked="${kind === k}" data-pp="setphoto" data-k="${k}"><span class="p29-bth" style='${th(k)}'></span><span class="m-grow"><b>${BG_N[k]}</b><small>${P.fail[k] ? 'Fikk ikke lastet bildet · trykk for å prøve igjen' : BG_S[k]}</small></span><span class="p29-bck">${kind === k ? '✓' : P.fail[k] ? '!' : ''}</span></button>`;
  return `<div class="pp-menu p29-bgm open" role="menu" aria-label="Bakgrunn">${['cur', 'oslo', 'weather', 'planets'].map(opt).join('')}<i class="p29-bsep"></i>
    <label class="p29-bo own"><span class="p29-bth plus">+</span><span class="m-grow"><b>Eget bilde</b>${kind === 'custom' ? '<small>Valgt · trykk for å bytte</small>' : ''}</span><span class="p29-bck">${kind === 'custom' ? '✓' : ''}</span><input class="m-file" type="file" accept="image/jpeg,image/png,image/webp" data-ppfile></label></div>`;
}

/** Innstillinger → Bakgrunn: valgene som en liste (samme bilder og feilmeldinger som før). */
export function photoChoices() {
  const kind = photoKind();
  if (!P.choicesLoaded) { P.choicesLoaded = true; Promise.all([...PHOTOS.map(([q]) => photoLoad(q)), photoLoad('custom')]).then(draw).catch(() => {}); }
  const sub = (k) => {
    if (P.fail[k]) return 'Fikk ikke lastet bildet · trykk for å prøve igjen';
    if (k === 'weather') { const sy = WX_NB[P.photo.weather?.symbol] ?? WX_NB[String(P.photo.weather?.symbol ?? '').split('_')[0]]; return `${PHOTO_SUB.weather}${sy ? ` · ${sy}` : ''}`; }
    return PHOTO_SUB[k];
  };
  // Forhåndsvisning av hver type som kort (med samme filtre som fotovinduet), og valgene under.
  const card = (k, n) => `<button class="p19-prev" role="radio" aria-checked="${kind === k}" data-pp="setphoto" data-k="${k}">
      <span class="p19-th">${bgLayers({ img: P.img[k], gradient: P.photo[k]?.gradient || FALLBACK[k], particles: null, papir: true, hint: P.photo[k]?.hint })}<span class="p19-ck">${kind === k ? '✓' : ''}</span></span>
      <span class="p19-n">${n}</span><small class="${P.fail[k] ? 'bad' : ''}">${esc(sub(k))}</small></button>`;
  return `<div class="p19-grid" role="radiogroup" aria-label="Bakgrunn">${PHOTOS.map(([k, n]) => card(k, n)).join('')}
    <label class="p19-prev own" aria-checked="${kind === 'custom'}"><span class="p19-th">${kind === 'custom' && P.img.custom ? bgLayers({ img: P.img.custom, papir: true }) : '<span class="p19-plus">+</span>'}<span class="p19-ck">${kind === 'custom' ? '✓' : ''}</span></span>
      <span class="p19-n">Eget bilde</span><small>${kind === 'custom' ? 'Valgt · trykk for å bytte' : 'Last opp fra Bilder eller Filer'}</small><input class="m-file" type="file" accept="image/jpeg,image/png,image/webp" data-ppfile></label></div>
    ${kind === 'cur' ? '' : bgControls(kind)}
    ${P.photo[kind]?.credit && P.img[kind] ? `<div class="snote">Foto: ${P.photo[kind].creditUrl ? `<a href="${esc(P.photo[kind].creditUrl)}" target="_blank" rel="noopener">${esc(P.photo[kind].credit)}</a>` : esc(P.photo[kind].credit)}</div>` : ''}`;
}

// Fanelinja: jevnt fordelte faner (aktiv fane har ikon og egen bredde). Hjem vises bare på Hjem; ellers går pila
// øverst til venstre hjem. Finans og Domener har egne faner. Fjerde fane er Domener eller Sporing (automatisk ut fra
// pakker på vei). Med flytende skann (standard) står «⌕ Søk» rett før Mer og skanneknappen flyter over linja; ellers
// ligger + i linja. På Fold (≥ 600 px) blir linja en loddrett skinne til venstre (CSS).
const SCAN_IC = 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8';
export function paperNav(scr) {
  const ctx = ctxOf(scr), flyt = fabStyle() === 'float';
  let tabs, cur, plus;
  if (ctx === 'fin') {
    const fk = finKeys(), FTN = { oversikt: ['hjem', 'Oversikt', '◎'], liste: ['liste', 'Liste', '≡'], finn: ['finn', 'Finn', '⇄'], sok: ['sok', 'Søk', '⌕'], budsjett: ['budsjett', 'Budsjett', '◔'], kvitteringer: ['kv', 'Kvitteringer', '▢'], aksjer: ['aks', 'Aksjer', '↗'], abonnementer: ['sub', 'Abonnementer', '↻'], kontoer: ['konto', 'Kontoer', '▤'], boliger: ['dir', 'Boliger', '⌂'], chat: ['chat', 'Chat', '✦'] };
    // Prompt 26: egne navn og ikoner fra «Rediger fanelinjen» (maks 5 faner + Mer).
    tabs = fk.map((k) => P26.finTab(k, FTN[k])).filter(Boolean);
    if (flyt && tabs.length < 5 && !tabs.some(([k]) => k === 'sok')) tabs.push(['sok', 'Søk', '⌕']);
    tabs.push(['fmer', 'Mer', '⋯']);
    cur = tabs.some(([k]) => k === scr) ? scr : 'fmer'; plus = scanCtx() === 'bol' ? ['Legg kvittering i boligen', 'bol'] : ['Legg til kvittering', 'fin'];
  } else if (ctx === 'dom') {
    // Prompt 32: egne faner (rekkefølge, navn, ikon) fra «Rediger fanelinjen» (hold inne på fanelinja).
    tabs = P32.secTabs('dom').map(([k, n, ic]) => [k === 'dom' ? 'dom' : `dom/${k}`, n, ic]);
    cur = ['pub', 'ytl', 'inf'].includes(m.sub) ? `dom/${m.sub}` : 'dom'; plus = ['Legg til domene', 'dom'];
  } else {
    // Hovedlinja kan redigeres: hold inne på linja, eller Innstillinger → Fanelinje (navn, ikon, rekkefølge, fjern).
    tabs = mainTabs(scr);
    cur = tabs.some(([k]) => k === scr) ? scr : 'mer';
    plus = scr === 'spor' ? ['Ny sending', 'spor'] : [scr === 'mat' ? 'Skann oppskrift' : 'Skann', scr === 'mat' ? 'mat' : 'main'];
  }
  // Abonnementer: Hjem, Innsikt og Historikk i fanelinja, og + som en rød sirkel.
  if (scr === 'sub') {
    return `<div class="pp-navbg" aria-hidden="true"></div><nav class="pp-nav sb-nav" data-ctx="sub" aria-label="Abonnementer (hold inne for å redigere)">${P32.secTabs('abo').map(([k, n, ic]) => `<button data-sb="tab" data-v="${k}" ${SB.tab === k ? 'aria-current="page"' : ''}><i>${ic}</i><span>${n}</span></button>`).join('')}
      <button class="pp-scan sb-red${SB.sheet ? ' on' : ''}" data-sb="sheet" aria-label="${SB.sheet ? 'Lukk' : 'Legg til abonnement'}" aria-expanded="${SB.sheet}">${SB.sheet ? '×' : '+'}</button></nav>`;
  }
  // Familie (prompt 21): Kart, Soner og Helse i fanelinja, pluss Mer (som Abonnementer). Knappene øverst er skjult.
  if (scr === 'fam') {
    return `<div class="pp-navbg" aria-hidden="true"></div><nav class="pp-nav p21-fnav" data-ctx="fam" aria-label="Familie (hold inne for å redigere)">${P32.secTabs('kart').map(([k, n, ic]) => `<a href="#/fam" data-p17="ftab" data-k="${k}" role="tab" aria-selected="${FT.tab === k}" ${FT.tab === k ? 'aria-current="page"' : ''}><i>${ic}</i><span>${n}</span></a>`).join('')}</nav>`;
  }
  if (ctx === 'dom') plus = ['Legg til domene', 'dom'];
  const fabIc = plus[1] === 'spor' || plus[1] === 'dom' ? 'M12 5v14M5 12h14' : SCAN_IC;
  // Aksjer har ingen skanneknapp (prompt 23).
  const noPlus = scr === 'aks';
  // Prompt 38: Domener har ingen Skann/+ – den runde knappen er Glimt (fylt ✦) med oppsummering av domenene.
  const domG = ctx === 'dom' && m.sub !== 'admin';
  const gBtn = (cls) => `<button type="button" class="${cls} p38-domg" data-p38="domg" aria-label="Glimt · oppsummering av domenene" title="Glimt · oppsummering av domenene"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.3 6.4 6.7.6-5.1 4.4 1.6 6.6L12 17l-5.5 3.5 1.6-6.6L3 9.5l6.7-.6z" fill="currentColor"/></svg></button>`;
  const fab = domG ? (flyt ? gBtn('pp-fab') : '') : flyt && !noPlus ? `<button class="pp-fab${P.press ? ' down' : ''}" data-ppplus="${plus[1]}" aria-label="${plus[0]}${plus[1] === 'spor' || plus[1] === 'dom' ? '' : ' (trykk for kamera, hold inne for valg)'}" title="${esc(plus[0])}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${fabIc}"/></svg></button>` : '';
  return `<div class="pp-navbg" aria-hidden="true"></div><nav class="pp-nav${flyt ? ' flyt' : ''}" data-ctx="${ctx}" aria-label="Faner${ctx === 'main' || ctx === 'dom' ? ' (hold inne for å redigere)' : ''}">${tabs.map(([k, n, ic]) => `<a href="#/${k}" data-tab="${k}" ${cur === k ? 'aria-current="page"' : ''}><i>${ic}</i><span>${n}</span></a>`).join('')}
    ${domG && !flyt ? gBtn('pp-scan') : flyt || noPlus ? '' : `<button class="pp-scan${P.press ? ' down' : ''}" data-ppplus="${plus[1]}" aria-label="${plus[0]} (trykk for kamera, hold inne for valg)" title="Trykk for kamera · hold inne for valg">+</button>`}</nav>${fab}
    <input class="m-file" id="pp-cam" type="file" accept="image/*" capture="environment" data-ppquick="${['spor', 'dom', 'main'].includes(plus[1]) ? 'fin' : plus[1]}">
    ${P.hint ? `<div class="pp-hint" role="status">${esc(P.hint)}</div>` : ''}`;
}

/* Arket for +: kamera og filer med kø (Finans), skann (hoved) eller oppskrift (Mat). */
export function paperScanSheet() {
  if (!P.scan) return '';
  const ctx = ctxOf(m.screen), mat = m.screen === 'mat';
  const jobs = P.qShow ? (m.jobs ?? []).filter((j) => ACTIVE_JOBS.includes(j.status) || j.status === 'needs_review').slice(0, 5) : [];
  const q = jobs.map((j) => { const run = ACTIVE_JOBS.includes(j.status), pct = run ? Math.max(5, Math.min(99, j.progress ?? 30)) : 100;
    return `<div class="pp-q"><div class="pp-row"><span class="m-ell">${esc(j.merchant || j.name || 'Kvittering')}</span><span class="${run ? 'pp-lab-c' : 'pp-pos'}">${run ? `✦ Leser … ${pct} %` : '✓ Klar til bekreftelse'}</span></div><span class="pp-bar"><i style="width:${pct}%;background:${run ? 'var(--pp-lab)' : 'var(--pp-pos)'}"></i></span></div>`; }).join('');
  // Hold inne på skanneknappen: Kvittering, Oppskrift, Bilder og Fil. I en bolig havner kvitteringen i boligen.
  const bol = scanCtx() === 'bol', qc = bol ? 'bol' : 'fin', bolN = bol ? (bolTitle()?.[0] ?? 'boligen') : '';
  const title = mat ? 'Skann oppskrift' : bol ? `Legg i ${bolN}` : ctx === 'fin' ? 'Legg til kvittering' : 'Skann';
  const sub = bol ? `Kvitteringen legges i ${bolN} med status «til gjennomgang». ✦ AI fyller inn beløp og kategori.` : ctx === 'fin' ? 'Ta bilde, velg filer eller del fra e-post. ✦ Gemini leser i bakgrunnen og kobler mot transaksjonen.' : mat ? 'Bilde eller PDF av en oppskrift. ✦ AI trekker ut ingredienser og steg.' : 'Kvittering, oppskrift, bilder eller fil. ✦ Gemini leser i bakgrunnen.';
  const IMG = 'application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif';
  const opt = (n, s2, attr, ink = false) => `<label class="pp-btn p17-opt${ink ? ' ink' : ''}"><span><b>${n}</b><small>${s2}</small></span><input class="m-file" type="file" ${attr}></label>`;
  return `<div class="sheet-bg" data-pp="scanx"></div><div class="pp-sheet" role="dialog" aria-label="${esc(title)}"><span class="pp-grab"></span>
    <div class="pp-sh">${esc(title)}</div><div class="pp-mut">${esc(sub)}</div>${q}
    ${mat ? opt('Oppskrift', 'Kamera', 'accept="image/*" capture="environment" data-ppscanrec', true) : opt('Kvittering', 'Kamera', `accept="image/*" capture="environment" data-ppquick="${qc}"`, true)}
    ${mat || bol ? '' : opt('Oppskrift', 'Bilde eller PDF til Mat', 'multiple accept="image/*,application/pdf" data-ppscanrec')}
    ${opt('Bilder', 'Fra biblioteket', `multiple accept="image/*" ${mat ? 'data-ppscanrec' : `data-ppquick="${qc}"`}`)}
    ${opt('Fil', 'PDF eller bilde fra Filer', `multiple accept="${mat ? 'image/*,application/pdf' : IMG}" ${mat ? 'data-ppscanrec' : `data-ppquick="${qc}"`}`)}
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
  if (['spor', 'dom'].includes(x.dataset.ppplus)) return true; // Ny sending og Legg til domene har ikke hold inne
  plusT = setTimeout(() => { plusLong = true; haptic('tap'); navigator.vibrate?.(12); P.scan = true; P.scanAt = Date.now(); P.qShow = (m.jobs ?? []).some((j) => ACTIVE_JOBS.includes(j.status)); draw(); }, 450);
  return true;
}
const showHint = () => { const n = document.querySelector('.pp-hint') ?? Object.assign(document.createElement('div'), { className: 'pp-hint' }); n.textContent = P.hint; n.setAttribute('role', 'status'); if (!n.isConnected) document.querySelector('.m.papir')?.appendChild(n); };
export function paperUp(e) {
  if (!plusEl) return false;
  clearTimeout(plusT); P.press = false; plusEl.classList.remove('down');
  const over = e.type === 'pointerup' && plusEl.contains(document.elementFromPoint(e.clientX, e.clientY));
  plusEl = null;
  if (plusLong) plusLong = 'used'; // holdt inne: arket med valg er allerede åpent
  void over;
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
  const pkg = p0 ? `<a class="pp-card pp-pkg" href="#/spor">${pkgLogo(p0, 52)}<span class="m-grow" style="min-width:0"><span class="pp-lab">${p0.status === 'ready_for_pickup' ? 'HENT I DAG' : 'PÅ VEI'}</span><b class="pp-serif m-ell" style="display:block">${esc(pkgTitle(p0))}</b><span class="pp-mut m-ell">${esc(p0.pickupPoint || p0.statusText || carName(p0.carrier))}${p0.eta ? ` · ${esc(/^\d{4}-\d\d-\d\d/.test(p0.eta) ? (p0.status === 'ready_for_pickup' ? 'innen ' : '') + new Date(p0.eta.slice(0, 10) + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'numeric' }) : p0.eta)}` : ''}</span></span>${pkgMore(p0, pk.length) ? `<span class="pp-mut p21-more">${pkgMore(p0, pk.length)}</span>` : ''}</a>` : '';
  // Brukerens egne stopp (Entur, prompt 16) går foran stoppene fra Homelab-oppsettet. Et trykk åpner Avganger.
  const src = H?.stops?.length ? H.stops.map((x) => ({ from: x.name, departures: x.departures })) : H?.ruter ?? [];
  const trips = src.flatMap((x) => (x.departures ?? []).slice(0, 2).map((d) => ({ ...d, min: d.min ?? d.minutes, to: d.to ?? x.to, from: x.from }))).sort((a, b) => (a.min ?? 99) - (b.min ?? 99)).slice(0, 3);
  const ruter = trips.length ? `<a class="pp-card pp-ruter" href="#/avg"><div class="pp-row"><span class="pp-lab">AVGANGER${src[0]?.from ? ` · ${esc(src[0].from.toUpperCase())}` : ''}</span><span class="pp-mut">sanntid ›</span></div>
      ${trips.map((d) => `<div class="pp-dep"><span class="pp-line" style="background:${esc(lineBg(d))};color:${esc(lineFg(d))}">${esc(d.line)}</span><span class="m-grow m-ell">${esc(d.to ?? '')}</span><b class="pp-serif">${d.min != null ? (d.min <= 0 ? 'nå' : d.min) : ''}</b><span class="pp-mut pp-min">${d.min > 0 ? 'min' : ''}</span></div>`).join('')}</a>` : '';
  const s = S.summary, rv = (s?.review ?? []).filter((r) => r.status === 'needs_review').length, mt = matToday();
  const dm = hlDom(), dom = dm ? { visitors: dm.visitors, total: dm.n, down: dm.up === false ? 1 : 0 } : null;
  const minis = [
    ['FINANS', s ? n0(s.left) : '–', rv ? `${rv} kvittering${rv > 1 ? 'er' : ''}` : 'igjen å bruke', rv ? 'lab' : 'mut', '#/hjem', '20px'],
    ['MAT', mt?.name || 'Ingen rett', mt?.cook ? `${mt.cook} lager` : '', 'mut', '#/mat', '16px'],
    fourth() === 'spor' && domOk() ? ['DOMENER', dom?.visitors != null ? n0(dom.visitors) : dom?.total != null ? String(dom.total) : '–', dom ? (dom.down ? `${dom.down} nede` : 'alle oppe') : '', dom?.down ? 'lab' : 'pos', '#/dom', '20px']
      : ['SPORING', String(onWay() || active(TR.data?.items ?? []).length || 0), onWay() ? 'på vei' : 'ingen på vei', onWay() ? 'lab' : 'mut', '#/spor', '20px'],
  ];
  // Hold inne et kort for å flytte eller skjule det (Søk, Pakker, Avganger, Snarveier, Siste nytt).
  // Prompt 24: Pakker vises alltid, også uten aktive pakker.
  const pkgEmpty = `<a class="pp-card pp-pkg p24-nopkg" href="#/spor"><span class="m-grow" style="min-width:0"><span class="pp-lab">PAKKER</span><b class="pp-serif m-ell" style="display:block">Ingen aktive pakker</b><span class="pp-mut m-ell">Legg til et sporingsnummer ›</span></span></a>`;
  // Prompt 37: «Vis bare når det er pakker» (standard på) og 1–3 pakker (papir_wopt.h2). Skjult uten pakker utenfor redigering.
  P37B.H2.pk = pk.length;
  const pkRows = pk.slice(1, 3).map((p) => `<a class="p37-h2r" href="#/spor">${pkgLogo(p, 30)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(pkgTitle(p))}</b><span class="pp-mut m-ell">${esc(p.pickupPoint || p.statusText || carName(p.carrier))}</span></span></a>`);
  const pkgCard = P37B.h2Widget(pkg, pkgEmpty, pk.length, pkRows, edOn('hl'));
  return `<div class="pp-home">${P30.updBanner('home')}${edBlocks('hl', {
    h1: P29.searchCard(), // Prompt 29: søkemotor-valg (System-AI / Google / DuckDuckGo) og timer som gjenkjennes
    h2: pkgCard, h3: P27.ruterCard(ruter),
    h4: `<div class="pp-minis">${minis.map(([k, v, sub, c, href, fs]) => `<a class="pp-card pp-mini" href="${href}"><span class="pp-lab mut">${k}</span><b class="pp-serif m-ell" style="font-size:${fs}">${esc(v)}</b><span class="${c === 'lab' ? 'pp-lab-c' : `pp-${c}`}" style="font-size:11px">${esc(sub)}</span></a>`).join('')}</div>`,
    h5: newsCard(H?.news),
    // Nye kort (prompt 17): Posisjon (familien), Bolig (budsjett, gjennomgang og neste faste utgift) og Huskeliste.
    h6: posCard(), h7: bolWidget(), h8: P37.todoWidget(), h9: P24.bdWidget(), h10: KAL.kalWidget(), h11: P32.trialsWidget(), // Prompt 32: Prøveperioder
    h12: P36.briefCard(P35.briefCard(), edOn('hl')), h13: P37B.bibleHome(edOn('hl')), h14: globalThis.P40?.hjemlysHome?.(edOn('hl')) ?? '', // Prompt 40: Hjemlys // Prompt 37: Dagens bibelvers (bare med modulen) // Prompt 34/35/36: sveip mot høyre skjuler kortet til neste brief: Glimt-brief øverst med vertsfiguren
  }, { full: ['h12', 'h13', 'h1', 'h4', 'h5'] })}</div>`;
}
// Ruters egne linjefarger (fra Entur via serveren), med Ruters standardfarger per transportmiddel som reserve.
const RUTER = { metro: '#EC700C', tram: '#0B91EF', bus: '#E60000', regionbus: '#75A300', water: '#682C88', ferry: '#682C88', rail: '#003087', train: '#003087' };
export const lineBg = (d) => d.color || RUTER[d.mode] || (/^\d$/.test(String(d.line)) ? RUTER.metro : /^1[1-9]$/.test(String(d.line)) ? RUTER.tram : /^\d{2,3}[A-Z]?$/.test(String(d.line)) ? RUTER.bus : RUTER.metro);
// Prompt 28: tekstfarge på linjemerket etter luminans (L > 0,4 → mørk tekst, ellers hvit).
const relLum = (hex) => { const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex ?? '').trim()); if (!m) return 0; let h = m[1]; if (h.length === 3) h = [...h].map((c) => c + c).join(''); const f = (i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4); };
export const lineFg = (d) => (relLum(lineBg(d)) > 0.4 ? '#1b1a17' : '#ffffff');

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
  const bud = (s.budgets ?? []).filter((b) => b.budget).sort((a, b) => b.used / b.budget - a.used / a.budget).slice(0, 5);
  const month = new Date(s.month + '-15').toLocaleDateString('nb-NO', { month: 'long' }).toUpperCase();
  const tx = (FX.recent ?? s.recent ?? []).slice(0, 15);
  // Kortene kan flyttes og skjules med hold inne: Saldo, Kvitteringer (f2), Siste transaksjoner (de 15 siste) og Budsjett.
  return edBlocks('hjem', {
    f1: `<div class="pp-card pp-saldo"><span class="pp-lab">SALDO · ALLE KONTOER</span><b class="pp-serif pp-huge" data-mact="reveal">${pref('hideAmt') && !m.reveal ? '••••' : `${bal < 0 ? '−' : ''}${n0(bal)} kr`}</b>
      <div class="pp-kpi"><div><span>Inn</span><b class="pp-pos">${n0(s.inn ?? 0)}</b></div><div><span>Brukt</span><b>${n0(s.budgetUsed ?? 0)}</b></div><div><span>Igjen</span><b>${n0(s.left ?? 0)}</b></div></div></div>`,
    f2: rcBanner(),
    f3: `${lab(`SISTE TRANSAKSJONER · ${tx.length}`, '<a href="#/liste">Vis alle ›</a>')}
      <div class="pp-rows">${tx.map((t) => `<button class="pp-tx" data-tx="${t.id}">${ppTi(t, ini(t.merchant || t.description), t.color)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(t.merchant || t.description)}</b><span class="pp-mut">${esc(t.category ?? '')} · ${esc(t.date === today() ? 'I dag' : t.date?.slice(8, 10) + '.' + t.date?.slice(5, 7))}</span></span><span class="pp-serif ${t.amount > 0 ? 'pp-pos' : ''}">${t.amount < 0 ? '−' : '+'}${n0(t.amount)}</span></button>`).join('') || '<div class="pp-mut">Ingen transaksjoner ennå.</div>'}</div>`,
    f4: bud.length ? `${lab(`BUDSJETT · ${month}`, `${n0(s.budgetUsed)} av ${n0(s.budgetTotal)}`)}<div class="pp-rows">${bud.map((b) => { const p = Math.round((b.used / b.budget) * 100); return `<a class="pp-bud" href="#/budsjett"><span>${esc(b.category)}</span><span class="pp-bar"><i style="width:${Math.min(100, p)}%;background:${p > 90 ? 'var(--pp-lab)' : 'var(--pp-ink)'}"></i></span><span class="pp-mut">${p} %</span></a>`; }).join('')}</div>` : '',
  });
}

/* ---------- Mer ---------- */

export function paperMer() {
  // Prompt 24 (claude-code-mer-lik.md): ett kort, rekkefølge og tekster som i designet. Det som allerede ligger i
  // fanelinja tas ut. I profilene Finans + Boliger og Boliger-profil står Hjem øverst.
  const n = onWay(), inBar = new Set(mainTabs('mer').map(([k]) => k)); // inBar: bare for valget Sporing/Domener under
  const mod = inBar.has('spor') ? (domOk() ? ['dom', 'Domener', 'Trafikk, besøk og oppetid'] : null) : ['spor', 'Sporing', n ? `${n} pakke${n === 1 ? '' : 'r'} på vei` : 'Pakker og sendinger'];
  const rows = [...(P24.profRoot() ? [['hl', 'Hjem', 'Pakker, avganger og widgets']] : []), ['brief', 'Now Brief', P36.briefMerSub()], ...(P37B.bibleOn() ? [['bibel', 'Bibel', 'Dagens vers, rekke og leseplan']] : []), // prompt 37: bare med bibelvers-modulen // prompt 36: Now Brief øverst i Mer
     ...(mod ? [mod] : []), ['kal', 'Kalender', 'Timeplan, prøver og frister'], ['bd', 'Bursdager', 'Hvem har bursdag snart'], ['huske', 'Gjøremål', 'To-do for hele familien'], ['fam', 'Familie og kart', 'Posisjon, soner og helse'],
    ['chat', 'Chat', 'Ollama, Gemini og Groq · historikk'], ['media', 'Media', 'Spilles nå og historikk'], ['hjem', 'Finans', 'Oversikt, liste, Finn og mer'], ['sub', 'Subscription OS', 'Abonnementer og faste trekk'], ['nyheter', 'Nyhetsleser', 'RSS med AI-sammendrag'], ['set', 'Innstillinger', 'Tema, bakgrunn og konto']]
    ; // prompt 40 (claude-code-fanelinje-alle-sider.md): faner i fanelinja vises fortsatt i Mer
  // Prompt 25: ikon til venstre (40-boks med strekikon i fargene fra ikonpaletten).
  // Prompt 28: hold inne for å flytte og skjule (lagres per konto), Subscription OS etter Finans.
  return P28.merView(rows);
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
  if (!M.configured && !M.now.length && !M.hist.length) return '<div class="pp-card pp-col"><b>Ikke satt opp</b><span class="pp-mut">Koble til din egen Plex eller Jellyfin.</span><a class="pp-btn ink" href="#/set/integ/plex" style="align-self:flex-start">Sett opp under Integrasjoner</a></div>';
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
  P23.setNewsState(P);
  const N = P.news, items = N?.items ?? [], feeds = N?.feeds ?? [], st = N?.settings ?? { aiSummary: true, aiCategorize: true };
  const cats = N?.categories?.length ? N.categories.map((c) => [c.id, c.name]) : CATS;
  const upd = N?.updatedAt ? new Date(N.updatedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '';
  const lead = st.aiSummary && N?.digest?.text ? N.digest.text : items[0]?.title ?? '';
  const catName = (id) => cats.find(([k]) => k === id)?.[1] ?? id ?? '';
  return `<div class="pp-reader">
    <div class="pp-rhead"><a class="p30-sb p30-back" href="#/${m.sub === 'hl' ? 'hl' : 'mer'}" data-pp="newsback"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Tilbake</a><div class="m-grow"><div class="pp-lab">NYHETSLESER · ${feeds.length} KILDER${upd ? ` · OPPDATERT ${upd}` : ''}</div><div class="pp-serif pp-rtitle">Siste nytt</div></div>
      <button class="pp-gear" data-pp="newsset" aria-label="Kilder og AI"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/></svg></button></div>
    ${P23.newsTabs(P, cats)}
    ${P.newsErr ? `<div class="pp-card pp-mut">${esc(P.newsErr)}</div>` : !N ? '<div class="m-spin"></div>' : `
    ${lead ? `<button type="button" class="pp-lead p40-nlead" data-p40="ngl"><span class="pp-lab">✦ GLIMT · SAMMENDRAG</span><p>${esc(lead)}</p><span class="p40-nmore">Les hele sammendraget med kilder og bilder ›</span></button>` : '' /* prompt 40: åpner Glimt-siden */}
    <div class="pp-items p27-items">${items.map((x, i) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" data-p27art="${i}"><span class="m-grow">${P.cat === 'siste' ? `<span class="pp-lab pp-cat">${esc(catName(x.category).toUpperCase())}</span>` : ''}<span class="pp-it">${esc(x.title)}</span><span class="pp-mut">${esc(x.feed)} · ${esc(timeOf(x.published))}${x.ai || x.aiCategory ? ' · ✦ AI' : ''}</span></span>${P27.newsThumb(x, i)}</a>`).join('') || '<div class="pp-mut" style="padding:20px 0">Ingen saker i denne kategorien.</div>'}</div>`}
    ${P.set ? newsSheet(feeds, st, cats) : ''}${P.set ? P23.iconPicker(P) : ''}
  </div>${P27.articleView(items, catName)}`;
}
function newsSheet(feeds, st, cats) {
  const tog = (k, n, s, on) => `<button class="pp-tog" data-pp="newstog" data-k="${k}" role="switch" aria-checked="${on}"><span class="m-grow"><b>${n}</b><span class="pp-mut">${s}</span></span><span class="pp-sw${on ? ' on' : ''}"><i></i></span></button>`;
  return `<div class="sheet-bg" data-pp="newssetx"></div><div class="pp-sheet tall" role="dialog" aria-label="Kilder og AI">
    <div class="pp-row"><div><div class="pp-lab">NYHETSLESER</div><div class="pp-sh">Kilder og AI</div></div><button type="button" class="p30-sb p30-pri" data-pp="newssetx">Ferdig</button></div>
    <div class="pp-card pp-tight">${tog('aiSummary', '✦ AI-sammendrag', 'Lager en kort ingress over de viktigste sakene øverst.', st.aiSummary !== false)}${tog('aiCategorize', '✦ AI-kategorisering', 'Setter kategori per sak når kilden står på Auto.', st.aiCategorize !== false)}</div>
    ${P23.newsIconSection(P, cats)}
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
      try { await uploadPhoto(f); await probe('custom', true); saveDesign({ photo: 'custom', bgType: 'custom' }, false); P.open = false; flash('Bakgrunnen er lagret'); } catch (err) { flash(err.message); }
      draw(); return true;
    }
    if (t.matches?.('[data-ppquick]')) {
      const files = [...t.files]; t.value = ''; if (!files.length) return true;
      if (t.dataset.ppquick === 'mat') return recipeUpload(files);
      if (t.dataset.ppquick === 'bol') { P.scan = false; draw(); await homeUpload(files); return true; }
      P.scan = true; P.qShow = true; draw();
      await upload(files, { stay: true });
      draw(); return true;
    }
    if (t.matches?.('[data-ppscanrec]')) {
      const files = [...t.files]; t.value = ''; return recipeUpload(files);
    }
    return false;
  }
  // Sliderne for uskarphet og mørklegging: tall og fotovindu oppdateres mens man drar, lagres etter en kort pause.
  if (e.type === 'input' && t.matches?.('[data-bgr]')) {
    const key = t.dataset.bgr, v = +t.value;
    saveBg({ [key]: v });
    const lab = document.querySelector(`[data-bgv="${key}"]`); if (lab) lab.textContent = `${v} ${key === 'bgBlur' ? 'px' : '%'}`;
    clearTimeout(P.bgT); P.bgT = setTimeout(draw, 250);
    return true;
  }
  if (e.type === 'input') { if (t.closest?.('[data-ppform=feed]')) { P.nf = t.value; return true; } return false; }
  if (e.type === 'submit') {
    if (t.matches?.('[data-ppsearch]')) { e.preventDefault(); const q = t.q.value.trim(); if (q) { hlApi('/search/history', { method: 'POST', json: { q, engine: 'google', device: 'mobil' } }).catch(() => {}); location.href = /^\S+\.\S+$/.test(q) && !/\s/.test(q) ? (/^https?:/.test(q) ? q : 'https://' + q) : `https://www.google.com/search?q=${encodeURIComponent(q)}`; } return true; }
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
    if (plusLong) { plusLong = false; return true; } // holdt inne: arket med valg er allerede åpent
    if (plus.dataset.ppplus === 'dom') { location.hash = '#/dom/admin'; return true; }
    if (plus.dataset.ppplus === 'spor') { openNewShip(); return true; }
    // Trykk: kameraet med en gang (i Mat som oppskrift, i en bolig rett inn i boligen).
    const cam = document.getElementById('pp-cam');
    if (cam) { if (plus.dataset.ppplus === 'mat') { cam.removeAttribute('data-ppquick'); cam.setAttribute('data-ppscanrec', ''); } cam.click(); return true; }
    P.scan = true; P.qShow = (m.jobs ?? []).some((j) => ACTIVE_JOBS.includes(j.status)); draw(); return true;
  }
  const x = t.closest?.('[data-pp]');
  if (!x) { if (P.open && !t.closest?.('.pp-menu')) { P.open = false; draw(); } return false; }
  if (x.tagName !== 'LABEL') e.preventDefault();
  const k = x.dataset.pp;
  if (k === 'photo') { P.open = !P.open; if (P.open) Promise.all(PHOTOS.map(([q]) => photoLoad(q))).then(draw); draw(); return true; }
  if (k === 'setphoto') { const kk = x.dataset.k, retry = P.fail[kk]; P.open = false; saveDesign({ photo: kk, bgType: kk }, false); draw(); await photoLoad(kk, retry); draw(); return true; }
  if (k === 'retry') { await photoLoad(photoKind(), true); draw(); return true; }
  if (k === 'bgplanet') { saveBg({ bgPlanet: x.dataset.v }); P.photo.planets = null; await photoLoad('planets', true); draw(); return true; }
  if (k === 'bgrot') { saveBg({ bgRotate: x.dataset.v }); draw(); return true; }
  if (k === 'bganim') { saveBg({ bgAnimate: !bgSet().animate }); draw(); return true; }
  if (k === 'scan') { P.scan = true; draw(); return true; }
  if (k === 'scanx') { if (Date.now() - (P.scanAt ?? 0) < 700) return true; P.scan = false; P.qShow = false; draw(); return true; } // fingeren som holdt inne, slippes over bakgrunnen
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
