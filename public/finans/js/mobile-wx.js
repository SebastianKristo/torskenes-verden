// Værvisning v2 (design/Vaer.dc.html): et trykk på temperaturen på Hjem åpner en egen værskjerm i stedet for yr.no.
// Himmel etter vær og døgn, stor sentrert header som tones ut ved scroll, neste 24 timer (temperatur, nedbør, vind),
// 7 dager, fliser (vind, måne, sol, UV, føles som, mot i går, nedbør, sikt, fuktighet, trykk) og «Forhold»-arket.
// Data: GET /api/weather/full?place= (MET/yr.no via serveren, Open-Meteo som reserve, 10 min cache). Eldre server: /mobile/home.weather.
// Steder: GET/POST/DELETE /api/weather/places og søk i /api/weather/search?q= (Kartverket).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { hlData } from './mobile-hl.js';
import { CMP, cmpLoad } from './mobile-p17.js';
import * as P39 from './mobile-p39.js'; // prompt 39: Yr mot Storm 2a med wiggle og Glimt · ukas vær
import { WX2, normCmp, pentAt, cmpCard, bottomBtns, mapView, placesSheet, metricSheet, fxKind, fxAfterDraw, wx22Bind } from './mobile-wx22.js';
import * as P25 from './mobile-p25.js';
import { haptic } from './mobile-haptics.js';

const PLACES = [['oslo', 'Oslo'], ['bergen', 'Bergen'], ['trondheim', 'Trondheim'], ['tromso', 'Tromsø']];
export const WX = { places: null, add: false, q: '', res: null, sErr: '', busy: false, edit: false, place: (() => { try { return localStorage.getItem('fh_wx_place') || 'oslo'; } catch { return 'oslo'; } })(), d: {}, err: '', mode: 'temp', sh: null, feel: false, from: 'hl' };

async function placesLoad() {
  if (WX.places) return;
  try { const r = await hlApi('/weather/places'); WX.places = (Array.isArray(r) ? r : r?.items ?? []).map((x) => [String(x.id), x.name, x]); }
  catch { WX.places = PLACES.map(([k, n]) => [k, n, null]); WX.fixed = true; }
  if (!plist().some(([k]) => k === WX.place) && WX.places[0]) WX.place = WX.places[0][0];
}
// Prompt 35: sted fra AI-søket («været i New York») legges midlertidig sist i bylista (id «tmp:lat,lon»), lagres ikke.
const plist = () => [...(WX.places ?? PLACES.map(([k, n]) => [k, n, null])), ...(WX.tmp ? [WX.tmp] : [])];
export const placeQuery = (p) => { if (String(p).startsWith('tmp:') && WX.tmp?.[0] === p) { const o = WX.tmp[2]; return `lat=${encodeURIComponent(o.lat)}&lon=${encodeURIComponent(o.lon)}&name=${encodeURIComponent(WX.tmp[1])}`; } return `place=${encodeURIComponent(p)}`; };
export function tempPlace({ name, lat, lon, label }) {
  const near = (WX.places ?? []).find(([, , o]) => o && Math.abs(+o.lat - lat) < 0.05 && Math.abs(+o.lon - lon) < 0.05);
  if (near) { WX.place = near[0]; return; }
  const id = `tmp:${(+lat).toFixed(3)},${(+lon).toFixed(3)}`;
  WX.tmp = [id, name, { lat, lon, label, tmp: true }]; WX.place = id; WX.sh = null;
}
export async function wxLoad(force = false) {
  await placesLoad();
  const p = WX.place;
  if (!force && WX.d[p] && Date.now() - WX.d[p]._t < 10 * 60000) return;
  try { const r = await hlApi(`/weather/full?${placeQuery(p)}`); WX.d[p] = { ...r, _t: Date.now() }; WX.err = ''; }
  catch (e) {
    const w = hlData()?.weather;
    if (p === 'oslo' && w) { WX.d[p] = { ...fromHome(w), _t: Date.now() }; WX.err = ''; }
    else WX.err = e.status === 404 ? 'Værvisningen krever en nyere server. Oppdater Homelab.' : e.message;
  }
  // Yr og Pent lastes automatisk når værsiden åpnes eller stedet byttes (eldre server: /weather/compare).
  if (WX.d[p] && !WX.d[p].compare && !CMP.d[p] && !CMP.busy) cmpLoad(p).catch?.(() => {});
}
export const cmpOf = (p = WX.place) => normCmp(WX.d[p]?.compare) ?? normCmp(CMP.d[p]);
export async function placesReload() { WX.places = null; await placesLoad(); }
// Reserve: bygg det vi kan av været på Homelab-forsiden (MET, 8 timer og 6 dager).
function fromHome(w) {
  const now = new Date();
  return {
    place: { id: 'oslo', name: w.place || 'Oslo' }, kind: kindOf(w.symbol ?? w.code),
    current: { temp: w.temp, feels: w.feels ?? w.temp, code: w.symbol ?? w.code, text: w.text ?? w.desc, isDay: now.getHours() > 6 && now.getHours() < 20, wind: w.wind?.speed ?? w.wind, gust: w.wind?.gust, windDir: w.wind?.dir, humidity: w.humidity, dew: w.dew, pressure: w.pressure, pressureTrend: w.pressureTrend, visibility: w.visibility, uv: w.uv, precip: w.precipNow },
    today: { hi: w.hi ?? w.max, lo: w.lo ?? w.min, sunrise: w.sunrise, sunset: w.sunset, precipSum: w.precip24 },
    hours: (w.hours ?? []).map((h) => ({ t: h.t, temp: h.temp, code: h.symbol, precip: h.mm })),
    days: (w.days ?? []).map((d) => ({ date: d.date, hi: d.max, lo: d.min, code: d.symbol, precipSum: d.mm })),
    yrUrl: 'https://www.yr.no/nb', fallback: true,
  };
}

/* ---------- Symboler ---------- */

// WMO-kode (Open-Meteo) eller MET-symbol → slag.
export function kindOf(c) {
  if (typeof c === 'string') { const s = c.toLowerCase(); return /snow|sleet/.test(s) ? 'snow' : /thunder/.test(s) ? 'thunder' : /rain|shower/.test(s) ? 'rain' : /fog/.test(s) ? 'fog' : /clearsky|fair/.test(s) ? (/night/.test(s) ? 'night' : 'clear') : /partly/.test(s) ? 'partly' : 'cloudy'; }
  const n = Number(c);
  if (!Number.isFinite(n)) return 'cloudy';
  return n <= 1 ? 'clear' : n === 2 ? 'partly' : n === 3 ? 'cloudy' : n <= 48 ? 'fog' : n >= 95 ? 'thunder' : (n >= 71 && n <= 77) || n === 85 || n === 86 ? 'snow' : 'rain';
}
const IC = {
  clear: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  night: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  partly: 'M12 2v2M4.9 4.9l1.4 1.4M2 12h2M16 8a4 4 0 0 0-7.6 1.7M8 20h9a4 4 0 1 0-.9-7.9A5 5 0 0 0 7 14a3 3 0 0 0 1 6z',
  cloudy: 'M7 18h10a4 4 0 1 0-.9-7.9A5.5 5.5 0 0 0 5.5 12 3 3 0 0 0 7 18z',
  rain: 'M7 15h10a4 4 0 1 0-.9-7.9A5.5 5.5 0 0 0 5.5 9 3 3 0 0 0 7 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3',
  snow: 'M7 15h10a4 4 0 1 0-.9-7.9A5.5 5.5 0 0 0 5.5 9 3 3 0 0 0 7 15zM8 19h.01M12 19h.01M16 19h.01M10 22h.01M14 22h.01',
  fog: 'M4 9h16M3 13h18M5 17h14M8 21h8',
  thunder: 'M7 15h10a4 4 0 1 0-.9-7.9A5.5 5.5 0 0 0 5.5 9 3 3 0 0 0 7 15zM13 15l-3 5h4l-3 4',
};
const ICC = { clear: '#ffd36b', night: '#e6ecff', partly: '#ffe39a', cloudy: '#ffffff', rain: '#9fe0ff', snow: '#ffffff', fog: '#e9eef4', thunder: '#ffd36b' };
const ico = (k, size = 26, col) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${col || ICC[k] || '#fff'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[k] ?? IC.cloudy}"/></svg>`;
const nightOf = (k, isDay) => (!isDay && (k === 'clear' || k === 'partly') ? 'night' : k);
// Himmel fra design/Vaer.dc.html (prompt 22): mørkere grå ved regn, lysere grå ved snø. Solen tegnes på canvas (dempet).
const SKY = {
  clear: ['linear-gradient(180deg,#1f5fc4 0%,#3a82d8 42%,#6aa8e8 78%,#9ccaf2 100%)', 'none'],
  partly: ['linear-gradient(180deg,#1f5fc4 0%,#3a82d8 42%,#6aa8e8 78%,#9ccaf2 100%)', 'none'],
  cloudy: ['linear-gradient(180deg,#4f6d8f 0%,#6a87a6 55%,#9bb0c5 100%)', 'none'],
  rain: ['linear-gradient(180deg,#3b4658 0%,#323d4e 45%,#2a3342 100%)', 'none'],
  thunder: ['linear-gradient(180deg,#2c3443 0%,#262e3b 45%,#1f2632 100%)', 'none'],
  snow: ['linear-gradient(180deg,#5e6b7c 0%,#7d8a9a 55%,#a3aebb 100%)', 'none'],
  fog: ['linear-gradient(180deg,#3f4d5e 0%,#556374 55%,#6f7d8d 100%)', 'none'], // prompt 28: tåke blir aldri hvit
  night: ['linear-gradient(180deg,#0b1730 0%,#1c2d52 55%,#2a3f6a 100%)', 'none'],
};
const WMO_NB = { 0: 'Klarvær', 1: 'Lettskyet', 2: 'Delvis skyet', 3: 'Skyet', 45: 'Tåke', 48: 'Rimtåke', 51: 'Lett yr', 53: 'Yr', 55: 'Kraftig yr', 61: 'Lett regn', 63: 'Regn', 65: 'Kraftig regn', 71: 'Lett snø', 73: 'Snø', 75: 'Kraftig snø', 80: 'Regnbyger', 81: 'Regnbyger', 82: 'Kraftige regnbyger', 85: 'Snøbyger', 86: 'Snøbyger', 95: 'Torden', 96: 'Torden med hagl', 99: 'Torden med hagl' };
const KIND_NB = { clear: 'Klarvær', night: 'Klarvær', partly: 'Delvis skyet', cloudy: 'Skyet', rain: 'Regn', snow: 'Snø', fog: 'Tåke', thunder: 'Torden' };
const descOf = (code, text) => text || WMO_NB[Number(code)] || KIND_NB[kindOf(code)] || '';
const deg = (v) => (v == null || !Number.isFinite(+v) ? '–' : `${Math.round(v)}°`);
const hm = (iso) => { if (!iso) return '–'; const d = new Date(iso); return Number.isNaN(+d) ? String(iso).slice(11, 16) : d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }); };
const DIRS = ['N', 'NNØ', 'NØ', 'ØNØ', 'Ø', 'ØSØ', 'SØ', 'SSØ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
const dirName = (d) => (d == null ? '–' : DIRS[Math.round(((+d % 360) + 360) % 360 / 22.5) % 16]);
const WD = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const MON = ['jan.', 'feb.', 'mars', 'april', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const dayKey = (iso) => String(iso ?? '').slice(0, 10);

/* ---------- Månen (regnes lokalt når serveren ikke sender den) ---------- */

function moonOf(d = new Date()) {
  const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((d - ref) / 864e5) % syn + syn) % syn, phase = age / syn;
  const illum = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100);
  const name = phase < 0.03 || phase > 0.97 ? 'Nymåne' : phase < 0.22 ? 'Voksende månesigd' : phase < 0.28 ? 'Første kvarter' : phase < 0.47 ? 'Voksende måne' : phase < 0.53 ? 'Fullmåne' : phase < 0.72 ? 'Minkende måne' : phase < 0.78 ? 'Siste kvarter' : 'Minkende månesigd';
  const nf = new Date(+d + ((0.5 - phase + 1) % 1) * syn * 864e5), nn = new Date(+d + ((1 - phase) % 1 || 1) * syn * 864e5);
  return { phase, illum, name, nextFull: nf.toISOString(), nextNew: nn.toISOString() };
}
function moonPath(p) {
  const rx = (24 * Math.abs(Math.cos(2 * Math.PI * p))).toFixed(2);
  if (p < 0.5) return `M28 4 A24 24 0 0 1 28 52 A${rx} 24 0 0 ${p > 0.25 ? 1 : 0} 28 4Z`;
  return `M28 4 A24 24 0 0 0 28 52 A${rx} 24 0 0 ${p < 0.75 ? 0 : 1} 28 4Z`;
}
const dShort = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '–' : `${d.getDate()}. ${MON[d.getMonth()]}`; };

/* ---------- Visning ---------- */

export function wxView() {
  const D = WX.d[WX.place];
  // Prompt 32 (claude-code-vaer-lukk-x.md): ingen «‹ Hjem». Tom plass til venstre (42 px) og ✕ Lukk oppe til høyre.
  const back = '<span class="w32-sp" aria-hidden="true"></span>', close = `<button class="w32-x" data-wx="back" data-swipeback aria-label="Lukk"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  // Stedsvelgeren nederst: egne steder kan legges til (søk) og fjernes (Rediger → ✕).
  // Prompt 22: ingen stedspiller nederst. Kartknapp nede til venstre, ☰ (Steder) nede til høyre.
  const P0 = plist().find(([k]) => k === WX.place)?.[2] ?? D?.place;
  const places = `${bottomBtns()}${placesSheet(WX, plist)}${mapView(P0, D?.place?.name ?? plist().find(([k]) => k === WX.place)?.[1])}`;
  if (!D) WX.fx = null;
  if (!D) return `<div class="vx" style="background:${SKY.cloudy[0]}"><div class="vx-bar">${back}<span class="m-grow"></span>${close}</div><div class="vx-in">${WX.err ? `<div class="vx-card vx-pad">${esc(WX.err)}</div>` : '<div class="m-spin"></div>'}</div>${places}</div>`;
  const c = D.current ?? {}, td = D.today ?? {}, kind0 = D.kind ?? kindOf(c.code), kind = nightOf(kind0 === 'night' ? 'clear' : kind0, c.isDay !== false && kind0 !== 'night');
  const [sky, glow] = SKY[kind] ?? SKY.cloudy, desc = descOf(c.code, c.text), city = D.place?.name ?? plist().find(([k]) => k === WX.place)?.[1] ?? '';
  const nowT = Date.now(), hours = (D.hours ?? []).filter((h) => new Date(h.t) >= nowT - 3600e3).slice(0, 24);
  const days = (D.days ?? []).slice(0, 7), lo = Math.min(...days.map((d) => d.lo ?? 99)), hi = Math.max(...days.map((d) => d.hi ?? -99)), span = Math.max(1, hi - lo);
  const modes = [['temp', 'Temperatur', 'M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z'], ['rain', 'Nedbør', 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z'], ['wind', 'Vind', 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8']];
  const hv = (h) => (WX.mode === 'rain' ? `${Math.round(h.precipProb ?? (h.precip > 0 ? 60 : 0))} %` : WX.mode === 'wind' ? `${Math.round(h.wind ?? 0)}` : deg(h.temp));
  const nr = D.nextRain, hrTitle = nr?.t ? `Nedbør ventet rundt ${hm(nr.t)}` : kind === 'rain' ? 'Regn akkurat nå' : 'Opphold de neste timene';
  const C2 = cmpOf();
  // Prompt 32 (claude-code-vaer-forhold-moduser.md): ☁ / 💧 / 🌬 bytter både timeraden og dagslisten.
  const M = WX.mode === 'rain' || WX.mode === 'wind' ? WX.mode : 'temp';
  const hrTitle2 = M === 'rain' ? 'Nedbør (mm) · Sjanse' : M === 'wind' ? 'Vind (m/s) · Kast' : 'Temperatur (°C)';
  const hrs = M !== 'temp' ? hoursMode(M, hours) : hours.map((h, i) => { const pt = WX.mode === 'temp' ? pentAt(C2, h.t) : null; const k = nightOf(kindOf(h.code), h.isDay !== false && new Date(h.t).getHours() > 6 && new Date(h.t).getHours() < 20);
    return `<div class="vx-h"><span${i === 0 ? ' class="b"' : ''}>${i === 0 ? 'Nå' : String(new Date(h.t).getHours()).padStart(2, '0')}</span>${ico(k, 28)}<span class="vx-pp">${(h.precipProb ?? 0) >= 20 ? `${Math.round(h.precipProb)} %` : ''}</span><b>${hv(h)}</b><span class="w22-pt">${pt != null ? `${Math.round(pt)}°` : ''}</span></div>`; }).join('');
  const dayRows = M !== 'temp' ? daysMode(M, days, D) : days.map((d, i) => { const k = kindOf(d.code), l = (((d.lo ?? lo) - lo) / span) * 100, w = (((d.hi ?? hi) - (d.lo ?? lo)) / span) * 100;
    const nowL = i === 0 && c.temp != null ? Math.max(0, Math.min(100, ((c.temp - lo) / span) * 100)) : null, dt = new Date(d.date + 'T12:00');
    return `<button class="vx-d" data-wx="day" data-i="${i}"><span class="vx-dn">${i === 0 ? 'I dag' : WD[dt.getDay()].replace(/^./, (x) => x.toUpperCase())}</span><span class="vx-di">${ico(k, 24)}<small>${(d.precipProb ?? 0) >= 20 ? `${Math.round(d.precipProb)} %` : ''}</small></span>
      <span class="vx-lo">${deg(d.lo)}</span><span class="vx-rng"><i style="left:${l.toFixed(1)}%;width:${Math.max(4, w).toFixed(1)}%"></i>${nowL != null ? `<em style="left:${nowL.toFixed(1)}%"></em>` : ''}</span><span class="vx-hi">${deg(d.hi)}</span></button>`; }).join('');
  // Vind
  const ws = c.wind != null ? Math.round(c.wind) : null, wg = c.gust != null ? Math.round(c.gust) : null;
  const wind = `<div class="vx-card vx-split" data-wxk="vind" data-wx2="ms" data-k="wind" role="button" tabindex="0"><div class="vx-col"><div class="vx-t">${tIco('M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8')}VIND</div>
      ${[['Vind', ws != null ? `${ws} m/s` : '–'], ['Vindkast', wg != null ? `${wg} m/s` : '–'], ['Retning', c.windDir != null ? `${Math.round(c.windDir)}° ${dirName(c.windDir)}` : '–']].map(([a, b], i) => `<div class="vx-r${i ? ' bt' : ''}"><span>${a}</span><span>${b}</span></div>`).join('')}</div>
    <svg viewBox="0 0 100 100" class="vx-comp" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="7" stroke-dasharray="0.8 2.5"/><text x="50" y="12" fill="#fff" font-size="8" font-weight="800" text-anchor="middle">N</text><text x="91" y="53" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">Ø</text><text x="50" y="97" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">S</text><text x="9" y="53" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">V</text>
      <g transform="rotate(${Math.round(c.windDir ?? 0)} 50 50)"><circle cx="50" cy="12" r="3.2" fill="#fff"/><line x1="50" y1="15" x2="50" y2="34" stroke="#fff" stroke-width="2"/><line x1="50" y1="66" x2="50" y2="86" stroke="#fff" stroke-width="2"/><path d="M45 80 L50 89 L55 80" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>
      <circle cx="50" cy="50" r="19" fill="rgba(20,50,90,.35)"/><text x="50" y="51" fill="#fff" font-size="14" font-weight="800" text-anchor="middle">${ws ?? '–'}</text><text x="50" y="61" fill="#fff" font-size="7.5" font-weight="700" text-anchor="middle">m/s</text></svg></div>`;
  // Måne
  const mo = D.moon?.phase != null ? D.moon : moonOf(), mp = mo.phase ?? moonOf().phase;
  const moon = `<div class="vx-card vx-split" data-wxk="mane" data-wx2="ms" data-k="moon" role="button" tabindex="0"><div class="vx-col"><div class="vx-t">${tIco('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z')}${esc(String(mo.name ?? moonOf().name).toUpperCase())}</div>
      ${[['Belyst', `${Math.round(mo.illum ?? moonOf().illum)} %`], ['Neste fullmåne', dShort(mo.nextFull ?? moonOf().nextFull)], ['Neste nymåne', dShort(mo.nextNew ?? moonOf().nextNew)]].map(([a, b], i) => `<div class="vx-r${i ? ' bt' : ''}"><span>${a}</span><span>${b}</span></div>`).join('')}</div>
    <svg viewBox="0 0 56 56" class="vx-moon" aria-hidden="true"><circle cx="28" cy="28" r="24" fill="rgba(20,40,70,.55)"/><path d="${moonPath(mp)}" fill="#e9eef5"/><circle cx="20" cy="20" r="3" fill="rgba(120,140,170,.25)"/><circle cx="33" cy="33" r="4.5" fill="rgba(120,140,170,.22)"/><circle cx="34" cy="18" r="2" fill="rgba(120,140,170,.25)"/></svg></div>`;
  // Sol
  const sr = td.sunrise ? new Date(td.sunrise) : null, ss = td.sunset ? new Date(td.sunset) : null, now = new Date();
  const beforeSet = ss && now < ss && (!sr || now > sr), lbl = beforeSet ? 'SOLNEDGANG' : 'SOLOPPGANG';
  const dayFrac = (now.getHours() * 60 + now.getMinutes()) / 1440, srF = sr ? (sr.getHours() * 60 + sr.getMinutes()) / 1440 : 0.3, ssF = ss ? (ss.getHours() * 60 + ss.getMinutes()) / 1440 : 0.72;
  const sunY = (f) => 25 - 22 * Math.sin(((f - srF) / (ssF - srF)) * Math.PI) * (f >= srF && f <= ssF ? 1 : 0.35);
  const curve = Array.from({ length: 49 }, (_, i) => { const f = i / 48, inDay = f >= srF && f <= ssF, y = inDay ? 25 - 22 * Math.sin(((f - srF) / (ssF - srF)) * Math.PI) : 25 + 12 * Math.sin(Math.min(1, (f < srF ? srF - f : f - ssF) / Math.max(0.05, 1 - (ssF - srF))) * Math.PI / 2); return `${i ? 'L' : 'M'}${(f * 120).toFixed(1)} ${y.toFixed(1)}`; }).join(' ');
  const sun = `<div class="vx-card vx-tile vx-sun" data-wx2="ms" data-k="sun" role="button" tabindex="0"><div class="vx-t pad">${tIco('M3 18h18M7 14a5 5 0 0 1 10 0M12 4v3M5 8l1.5 1.5M19 8l-1.5 1.5')}${lbl}</div><b class="vx-big pad">${hm(beforeSet ? td.sunset : td.sunrise)}</b>
    <svg viewBox="0 0 120 50" preserveAspectRatio="none" class="vx-sunc" aria-hidden="true"><line x1="0" y1="25" x2="120" y2="25" stroke="rgba(255,255,255,.45)" stroke-width="1"/><path d="${curve}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2"/><circle cx="${(dayFrac * 120).toFixed(1)}" cy="${sunY(dayFrac).toFixed(1)}" r="4.5" fill="#fff"/></svg>
    <span class="vx-sm pad">${beforeSet ? `Soloppgang: ${hm(td.sunrise)}` : `Solnedgang: ${hm(td.sunset)}`}</span></div>`;
  // UV
  const uv = c.uv ?? days[0]?.uvMax ?? null, uvN = uv == null ? '–' : uv < 3 ? 'Lav' : uv < 6 ? 'Moderat' : uv < 8 ? 'Høy' : uv < 11 ? 'Svært høy' : 'Ekstrem';
  const uvT = `<div class="vx-card vx-tile" data-wx2="ms" data-k="uv" role="button" tabindex="0"><div class="vx-t">${tIco('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2')}UV-INDEKS</div><b class="vx-big" style="line-height:1">${uv == null ? '–' : Math.round(uv)}</b><b class="vx-mid">${uvN}</b>
    <span class="vx-uvb"><em style="left:${Math.min(100, ((uv ?? 0) / 11) * 100).toFixed(0)}%"></em></span><span class="vx-sm">${uv != null && uv >= 3 ? 'Bruk solkrem midt på dagen.' : 'Lav resten av dagen.'}</span></div>`;
  // Føles som
  const fd = c.feels != null && c.temp != null ? Math.round(c.feels - c.temp) : 0;
  const feel = `<div class="vx-card vx-tile" data-wx2="ms" data-k="feel" role="button" tabindex="0"><div class="vx-t">${tIco('M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z')}FØLES SOM</div><b class="vx-big">${deg(c.feels)}</b><span class="vx-sm" style="margin-top:auto">${fd <= -2 ? 'Vinden gjør at det føles kaldere.' : fd >= 2 ? 'Fuktigheten gjør at det føles varmere.' : 'Ligner den faktiske temperaturen.'}</span></div>`;
  // Mot i går
  const yh = D.yesterday?.hi, th = td.hi ?? days[0]?.hi, diff = yh != null && th != null ? Math.round(th - yh) : null;
  const yd = `<div class="vx-card vx-tile" data-wx2="ms" data-k="yd" role="button" tabindex="0"><div class="vx-t">${tIco('M3 20h18M5 16l4-4 3 3 7-7')}MOT I GÅR</div><b class="vx-big">${diff == null ? '–' : `${diff > 0 ? '+' : ''}${diff}°`}</b><b class="vx-sm b">${diff == null ? 'Ingen data for i går' : diff > 0 ? 'Varmere enn i går' : diff < 0 ? 'Kaldere enn i går' : 'Likt som i går'}</b>
    <div class="vx-yd"><span>I dag</span><span>H:${deg(th)}</span><span>I går</span><span>H:${deg(yh)}</span></div></div>`;
  // Nedbør
  const ps = td.precipSum ?? days[0]?.precipSum ?? 0;
  const rain = `<div class="vx-card vx-tile" data-wx2="ms" data-k="rain" role="button" tabindex="0"><div class="vx-t">${tIco('M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z', true)}NEDBØR</div><b class="vx-big">${(Math.round((ps ?? 0) * 10) / 10).toLocaleString('nb-NO')} mm</b><b class="vx-mid">I dag</b>
    <span class="vx-sm" style="margin-top:auto">${nr?.t ? `${(Math.round((nr.mm ?? 0) * 10) / 10).toLocaleString('nb-NO')} mm ventet ${new Date(nr.t).toDateString() === now.toDateString() ? 'rundt' : `${WD[new Date(nr.t).getDay()]}`} ${hm(nr.t)}.` : 'Ingen nedbør ventet de neste dagene.'}</span></div>`;
  // Sikt, fuktighet og trykk
  const vk = c.visibility != null ? (c.visibility > 100 ? c.visibility / 1000 : c.visibility) : null;
  const vis = `<div class="vx-card vx-tile" data-wx2="ms" data-k="vis" role="button" tabindex="0"><div class="vx-t">${tIco('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z')}SIKT</div><b class="vx-big">${vk == null ? '–' : `${Math.round(vk)} km`}</b><span class="vx-sm" style="margin-top:auto">${vk == null ? '' : vk >= 10 ? 'Helt klart sikt akkurat nå.' : vk >= 4 ? 'Litt dis.' : 'Dårlig sikt.'}</span></div>`;
  const hum = `<div class="vx-card vx-tile" data-wx2="ms" data-k="hum" role="button" tabindex="0"><div class="vx-t">${tIco('M3 9h11a3 3 0 1 0-3-3M3 14h15M3 19h9')}LUFTFUKTIGHET</div><b class="vx-big">${c.humidity != null ? Math.round(c.humidity) : '–'} %</b><span class="vx-sm" style="margin-top:auto">Duggpunktet er ${deg(c.dew)} akkurat nå.</span></div>`;
  const pr = c.pressure, rot = pr != null ? Math.max(-135, Math.min(135, ((pr - 1013) / 50) * 135)) : 0, tr = c.pressureTrend;
  const pres = `<div class="vx-card vx-tile" data-wx2="ms" data-k="pres" role="button" tabindex="0"><div class="vx-t">${tIco('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 12l4-4')}LUFTTRYKK</div>
    <svg viewBox="0 0 100 86" class="vx-pres" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="8" stroke-dasharray="0.9 2.4" transform="rotate(135 50 50)"/><g transform="rotate(${rot.toFixed(0)} 50 50)"><line x1="50" y1="9" x2="50" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>
      <text x="50" y="40" fill="#fff" font-size="12" font-weight="800" text-anchor="middle">${tr === 'up' || tr > 0 ? '↑' : tr === 'down' || tr < 0 ? '↓' : '→'}</text><text x="50" y="56" fill="#fff" font-size="15" font-weight="800" text-anchor="middle">${pr != null ? Math.round(pr) : '–'}</text><text x="50" y="66" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">hPa</text><text x="26" y="84" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">Lavt</text><text x="74" y="84" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">Høyt</text></svg></div>`;
  // Prompt 25: på Fold og nettbrett (≥ 700 px) to kolonner (5 : 7) med værkartet rett på siden. Under 700 er kolonnene
  // display:contents, så rekkefølgen er som før.
  const fold = P25.wxFold();
  const srT = +new Date(td.sunrise ?? days[0]?.sunrise ?? NaN), ssT = +new Date(td.sunset ?? days[0]?.sunset ?? NaN), sunF = ssT > srT ? Math.min(1, Math.max(0, (Date.now() - srT) / (ssT - srT))) : 0.5;
  WX.fx = fxKind(kind0 === 'night' ? 'night' : kind0, c.isDay !== false && kind0 !== 'night', c.code, sunF); // prompt 28: sola følger soloppgang/-nedgang
  const W41 = globalThis.P41; // prompt 41: rediger kort (wiggle), Glimt skiføre
  return `<div class="vx${W41?.wxEditing?.() ? ' p41-wxed' : ''}" style="background:${sky}">${W41?.wxStyle?.() ?? ''}<div class="w22-fx" id="w22-fx" aria-hidden="true"></div><div class="vx-glow" style="background:${glow}"></div>
    <div class="vx-bar">${back}<div class="vx-compact"><b>${esc(city)}</b><span>${deg(c.temp)} | ${esc(desc)}</span></div>${close}</div>
    <div class="vx-in${fold ? ' p25-fold' : ''}"><div class="p25-c1">
      <div class="vx-head" data-wxk="na"><span class="vx-pos">MIN POSISJON</span><span class="vx-city">${esc(city)}</span><span class="vx-temp">${deg(c.temp)}</span><span class="vx-desc">${esc(desc)}</span><span class="vx-hl">H:${deg(td.hi ?? days[0]?.hi)}  L:${deg(td.lo ?? days[0]?.lo)}${c.feels != null ? ` · Føles som ${deg(c.feels)}` : ''}</span><span class="w32-src">${esc(srcLine(D))}</span></div>
      ${W41?.skiCard?.(D) ?? ''}
      ${hours.length ? `<div class="vx-card vx-hours w32-${M}" data-wxk="timer"><div class="vx-hrow"><button class="vx-forh w32-fh" data-wx="day" data-i="0"><b>Forhold ›</b><span>${esc(hrTitle2)}</span></button><div class="vx-modes">${modes.map(([k, n, p]) => `<button data-wx="mode" data-k="${k}" aria-label="${n}" aria-pressed="${WX.mode === k}">${tIco(p, k === 'rain', 18)}</button>`).join('')}</div></div><div class="vx-hs">${hrs}</div></div>` : ''}
      ${days.length ? `<div class="vx-card vx-days w32-${M}" data-wxk="dager">${dayRows}</div>` : ''}</div><div class="p25-c2">${fold ? P25.wxMapCard(P0, WX2.layer) : ''}
      <div class="p41-wb" data-wxk="cmp">${cmpCard(C2, D, { IC, ICC, kindOf, busy: CMP.busy, err: CMP.err })}</div>
      ${wind}${moon}
      <div class="vx-grid" data-wxk="detaljer">${sun}${uvT}${feel}${yd}${rain}${vis}${hum}${pres}</div></div>
      <div class="p41-wb" data-wxk="uke">${P39.wkCard(D, WX.place)}</div>
      ${W41?.wxEditBtn?.() ?? ''}
      <a class="vx-yr" href="${esc(D.yrUrl || 'https://www.yr.no/nb')}" target="_blank" rel="noopener">${esc(D.credit || `Data: ${D.fallback || D.source === 'met' ? 'MET Norge' : 'Open-Meteo'}`)} · Se også yr.no ↗</a>
    </div>${places}${WX.sh != null ? sheet(D) : ''}${metricSheet(D)}${P39.cmpView39(WX.place, city)}</div>`;
}
/* ---------- Prompt 32: Forhold-moduser for nedbør og vind ---------- */
const f1 = (v) => String(Math.round((+v || 0) * 10) / 10).replace('.', ',');
function srcLine(D) {
  const t = D.updatedAt ?? D.fetchedAt ?? D.time ?? D.current?.t ?? null, d = t ? new Date(t) : new Date(), hh = Number.isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${D.mock ? 'Eksempeldata' : D.fallback || D.source === 'met' ? 'MET Norway · yr.no' : 'Open-Meteo · MET Norway'}${hh ? ` · ${hh}` : ''}`;
}
/** 24 timer for en dato fra detail.days (MET, 7 dager) eller timelisten. */
function dayHrs32(D, date) {
  const det = (D.detail?.days ?? []).find((x) => String(x.date).slice(0, 10) === date)?.hours;
  const src = det?.length ? det : [...(D.yesterday?.hours ?? []), ...(D.hours ?? [])];
  return src.filter((h) => String(h.t ?? h.time ?? '').slice(0, 10) === date).sort((a, b) => String(a.t ?? a.time).localeCompare(String(b.t ?? b.time)));
}
function hoursMode(M, hours) {
  if (M === 'rain') return hours.map((h, i) => { const mmv = +h.precip || 0, pp = Math.round(h.precipProb ?? 0);
    return `<div class="vx-h w32-h"><span${i === 0 ? ' class="b"' : ''}>${i === 0 ? 'Nå' : String(new Date(h.t).getHours()).padStart(2, '0')}</span><span class="w32-bar"><i class="l1"></i><i class="l2"></i><em style="height:${Math.min(100, (mmv / 3) * 100).toFixed(0)}%;border-radius:${mmv >= 3 ? '9px' : '0 0 9px 9px'}"></em></span><span class="w32-mm">${mmv >= 0.05 ? `${f1(mmv)} mm` : ''}</span><span class="w32-pp">${pp} %</span></div>`; }).join('');
  const WS = hours.map((h) => +h.wind || 0), WG = hours.map((h, i) => Math.max(+h.gust || 0, WS[i])), mx = Math.max(4, ...WG), wy = (v) => (34 - Math.min(1, v / mx) * 30).toFixed(1);
  return hours.map((h, i) => { const a = WS[Math.max(0, i - 1)], b = WS[i], c2 = WS[i + 1] ?? b, ga = WG[Math.max(0, i - 1)], gb = WG[i], gc = WG[i + 1] ?? gb;
    return `<div class="vx-h w32-h"><span${i === 0 ? ' class="b"' : ''}>${i === 0 ? 'Nå' : String(new Date(h.t).getHours()).padStart(2, '0')}</span><b class="w32-ws">${Math.round(b)}</b><span class="w32-u">m/s</span><span class="w32-g">kast ${Math.round(gb)}</span>
      <svg class="w32-wl" width="56" height="34" viewBox="0 0 56 34" preserveAspectRatio="none" aria-hidden="true"><path d="M0 34 L0 ${wy((ga + gb) / 2)} L28 ${wy(gb)} L56 ${wy((gb + gc) / 2)} L56 34 Z" fill="rgba(90,209,255,.28)"/><path d="M0 ${wy((a + b) / 2)} L28 ${wy(b)} L56 ${wy((b + c2) / 2)}" fill="none" stroke="#3fd0e0" stroke-width="3" stroke-linecap="round"/></svg></div>`; }).join('');
}
function daysMode(M, days, D) {
  const nowH = new Date().getHours();
  return days.map((d, k) => {
    const dt = new Date(d.date + 'T12:00'), name = k === 0 ? 'I dag' : WD[dt.getDay()].replace(/^./, (x) => x.toUpperCase()), H = dayHrs32(D, d.date), pp = Math.round(d.precipProb ?? 0);
    if (M === 'rain') {
      const by = Array(24).fill(0); H.forEach((h) => { by[new Date(h.t ?? h.time).getHours()] = +h.precip || 0; });
      const two = Array.from({ length: 12 }, (_, q) => by[q * 2] + by[q * 2 + 1]), sum = d.precipSum ?? two.reduce((a, v) => a + v, 0);
      const bars = two.map((v, q) => `<span class="w32-rb${q >= 3 && q < 9 ? ' day' : ''}${k === 0 && Math.floor(nowH / 2) === q ? ' now' : ''}"><i style="height:${Math.min(100, (v / 4) * 100).toFixed(0)}%"></i></span>`).join('');
      return `<button class="vx-d w32-dr" data-wx="day" data-i="${k}"><span class="vx-dn">${name}</span><span class="w32-rbs">${bars}</span><span class="w32-sum${sum >= 0.05 ? '' : ' dim'}">${f1(sum)} mm</span><span class="w32-dp${pp >= 30 ? '' : ' dim'}">${pp >= 30 ? '<svg width="12" height="14" viewBox="0 0 24 24" fill="#5ad1ff" aria-hidden="true"><path d="M12 2c3.5 4.6 7 8.6 7 12.6a7 7 0 0 1-14 0C5 10.6 8.5 6.6 12 2z"/></svg>' : ''}${pp}%</span></button>`;
    }
    const sp = H.map((h) => +h.wind || 0), gs = H.map((h, i) => Math.max(+h.gust || 0, sp[i])), mx = Math.max(4, ...gs), yy = (v) => (26 - Math.min(1, v / mx) * 22).toFixed(1), px = (q) => ((q / Math.max(1, H.length - 1)) * 120).toFixed(1);
    const sL = sp.length ? `M${sp.map((v, q) => `${px(q)} ${yy(v)}`).join(' L')}` : '', gA = gs.length ? `M0 28 L${gs.map((v, q) => `${px(q)} ${yy(v)}`).join(' L')} L120 28 Z` : '';
    const ni = Math.min(sp.length - 1, nowH), dot = k === 0 && sp.length ? `<span class="w32-dot" style="left:${((+px(ni) / 120) * 100).toFixed(1)}%;top:${((+yy(sp[ni]) / 28) * 100).toFixed(1)}%"></span>` : '';
    const wr = sp.length ? `${Math.round(Math.min(...sp))}–${Math.round(Math.max(...gs))}` : d.windMax != null ? `–${Math.round(d.windMax)}` : '–';
    return `<button class="vx-d w32-dw" data-wx="day" data-i="${k}"><span class="vx-dn">${name}</span><span class="w32-mg"><svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><rect x="30" y="0" width="60" height="28" fill="rgba(255,255,255,.08)"/><path d="${gA}" fill="rgba(90,209,255,.3)"/><path d="${sL}" fill="none" stroke="#3fd0e0" stroke-width="2.4" stroke-linecap="round" ${k === 0 ? 'stroke-dasharray="5 4"' : ''} vector-effect="non-scaling-stroke"/></svg>${dot}</span><span class="w32-wr">${wr} <span>m/s</span></span></button>`;
  }).join('');
}
function tIco(p, fill = false, size = 15) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`; }

/* ---------- «Forhold»-arket: temperaturgraf og nedbørssjanse for valgt dag ---------- */

function dayHours(D, i) {
  const d = (D.days ?? [])[i];
  if (!d) return [];
  const real = (D.hours ?? []).filter((h) => dayKey(h.t) === d.date);
  if (real.length >= 12) return real.map((h) => ({ ...h, hour: new Date(h.t).getHours() }));
  // Uten timeverdier: en jevn kurve mellom lav (kl. 05) og høy (kl. 15).
  return Array.from({ length: 24 }, (_, hh) => { const f = (Math.cos(((hh - 15) / 24) * 2 * Math.PI) + 1) / 2; return { hour: hh, temp: (d.lo ?? 0) + ((d.hi ?? 0) - (d.lo ?? 0)) * f, feels: null, code: d.code, precipProb: d.precipProb ?? 0, synth: true }; });
}
function sheet(D) {
  const days = (D.days ?? []).slice(0, 7), i = Math.min(WX.sh, Math.max(0, days.length - 1)), d = days[i];
  if (!d) return '';
  const hrs = dayHours(D, i);
  if (!hrs.length) return '';
  const dt = new Date(d.date + 'T12:00'), isToday = i === 0, nowH = new Date().getHours();
  const vals = hrs.map((h) => (WX.feel && h.feels != null ? h.feels : h.temp)).filter((v) => v != null);
  const mn = Math.floor(Math.min(...vals) - 1), mx = Math.ceil(Math.max(...vals) + 1), sp = Math.max(1, mx - mn);
  const X = (hh) => (hh / 23) * 300, Y = (v) => 10 + (1 - (v - mn) / sp) * 150;
  const pts = hrs.map((h) => [X(h.hour), Y(WX.feel && h.feels != null ? h.feels : h.temp)]);
  const line = (a) => a.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const past = isToday ? pts.filter((_, k) => hrs[k].hour <= nowH) : [], fut = isToday ? pts.filter((_, k) => hrs[k].hour >= nowH) : pts;
  const area = pts.length ? `${line(pts)} L${pts[pts.length - 1][0].toFixed(1)} 170 L${pts[0][0].toFixed(1)} 170 Z` : '';
  const hiI = vals.indexOf(Math.max(...vals)), loI = vals.indexOf(Math.min(...vals));
  const marks = [[hiI, 'H'], [loI, 'L']].filter(([k]) => pts[k]).map(([k, t]) => `<circle cx="${pts[k][0].toFixed(1)}" cy="${pts[k][1].toFixed(1)}" r="4.5" fill="#fff" stroke="#17191e" stroke-width="2.5"/><text x="${pts[k][0].toFixed(1)}" y="${(pts[k][1] + (t === 'H' ? -10 : 18)).toFixed(1)}" fill="#c7ccd4" font-size="12" font-weight="800" text-anchor="middle">${t}</text>`).join('');
  const grid = [0, 1, 2, 3].map((g) => { const v = Math.round(mx - (sp * g) / 3), y = Y(v); return `<line x1="0" y1="${y.toFixed(1)}" x2="300" y2="${y.toFixed(1)}" stroke="#2c3038" stroke-width="1"/><text x="306" y="${(y + 4).toFixed(1)}" fill="#9aa0aa" font-size="11" font-weight="700">${v}°</text>`; }).join('');
  const icons = Array.from({ length: 12 }, (_, k) => hrs.find((h) => h.hour === k * 2) ?? hrs[k * 2]).map((h) => `<span>${ico(nightOf(kindOf(h?.code ?? d.code), (h?.hour ?? 12) > 6 && (h?.hour ?? 12) < 20), 20)}</span>`).join('');
  const pp = hrs.map((h) => Math.round(h.precipProb ?? 0));
  const nowLine = isToday ? `<line x1="${X(nowH).toFixed(1)}" y1="0" x2="${X(nowH).toFixed(1)}" y2="170" stroke="#9aa0aa" stroke-width="1" stroke-dasharray="3 3"/>` : '';
  return `<div class="vx-shbg" data-wx="shx"></div><div class="vx-sh" role="dialog" aria-label="Forhold">
    <div class="vx-shtop"><span></span><b>Forhold</b><button type="button" class="w32-x" data-wx="shx" aria-label="Lukk"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="vx-shdays">${days.map((x, k) => { const t = new Date(x.date + 'T12:00'); return `<button data-wx="day" data-i="${k}" aria-pressed="${k === i}"><span>${WD[t.getDay()].slice(0, 1).toUpperCase()}</span><b>${t.getDate()}</b></button>`; }).join('')}</div>
    <div class="vx-shdate">${WD[dt.getDay()].replace(/^./, (x) => x.toUpperCase())}dag ${dt.getDate()}. ${MON[dt.getMonth()]}</div>
    <div class="vx-shnow"><div><div class="vx-row"><b>${deg(isToday ? D.current?.temp : d.hi)}</b>${ico(kindOf(isToday ? D.current?.code : d.code), 34)}</div><span>H:${deg(d.hi)} L:${deg(d.lo)}</span></div><span class="vx-sm">${esc(descOf(d.code))}</span></div>
    <div class="vx-chart"><div class="vx-cic">${icons}</div><svg viewBox="0 0 336 196" aria-label="Temperatur gjennom dagen"><defs><linearGradient id="wxA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ec8d8" stop-opacity=".55"/><stop offset="1" stop-color="#2b6ea8" stop-opacity=".35"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#wxA)"/>${past.length > 1 ? `<path d="${line(past)}" fill="none" stroke="#5ec8d8" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round"/>` : ''}<path d="${line(fut)}" fill="none" stroke="#5ec8d8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${nowLine}${marks}
      ${[0, 6, 12, 18].map((h) => `<text x="${X(h).toFixed(1)}" y="188" fill="#9aa0aa" font-size="12" font-weight="700">${String(h).padStart(2, '0')}</text>`).join('')}</svg></div>
    <div class="vx-seg2"><button data-wx="feel" data-k="0" aria-pressed="${!WX.feel}">Faktisk</button><button data-wx="feel" data-k="1" aria-pressed="${WX.feel}">Føles som</button></div>
    ${hrs[0]?.synth ? '<span class="vx-sm" style="opacity:.6">Kurven er beregnet ut fra høy og lav for dagen.</span>' : ''}
    <b class="vx-shh">Sjanse for nedbør</b>
    <div class="vx-ppb">${pp.map((v, k) => `<span title="${String(hrs[k].hour).padStart(2, '0')}: ${v} %"><i style="height:${Math.max(2, v)}%"></i></span>`).join('')}</div>
    <div class="vx-ppx"><span>00</span><span>06</span><span>12</span><span>18</span></div>
    <span class="vx-sm" style="opacity:.75">Høyeste sjanse i dag: ${Math.max(0, ...pp)} %.</span></div>`;
}

/* ---------- Hendelser ---------- */

let bound = false;
export function wxBindScroll() {
  if (bound) return;
  bound = true;
  addEventListener('scroll', () => {
    if (m.screen !== 'vaer') return;
    const y = scrollY, el = document.querySelector('.vx');
    if (!el) return;
    el.style.setProperty('--wxh', Math.max(0, 1 - y / 160).toFixed(2));
    el.classList.toggle('sc', y > 140);
  }, { passive: true });
}
function addSheet() {
  const res = WX.res ?? [];
  return `<div class="sheet-bg" data-wx="addx"></div><div class="pp-sheet vx-sheet2" role="dialog" aria-label="Legg til sted"><span class="pp-grab"></span><div class="pp-sh">Legg til sted</div>
    <input class="sinp p16-inp" id="vx-q" data-wxq value="${esc(WX.q)}" placeholder="Søk etter by eller sted" autocomplete="off" enterkeyhint="search">
    <div class="p16-res">${WX.sErr ? `<div class="pp-mut">${esc(WX.sErr)}</div>` : ''}${res.map((r, i) => `<button class="p16-ri" data-wx="pick" data-i="${i}"><span class="m-grow"><b>${esc(r.name)}</b><span class="pp-mut">${esc([r.region, r.country].filter(Boolean).join(', '))}</span></span><span class="pp-lab-c">+ Legg til</span></button>`).join('') || (WX.busy ? '<div class="m-spin"></div>' : WX.q.length > 1 && !WX.sErr ? '<div class="pp-mut">Ingen treff.</div>' : '')}</div>
    <button class="pp-btn" data-wx="addx">Lukk</button></div>`;
}
let qT = null;
async function search() {
  const q = WX.q.trim();
  if (q.length < 2) { WX.res = null; draw(); return; }
  WX.busy = true; draw();
  try { WX.res = await hlApi(`/weather/search?q=${encodeURIComponent(q)}`); WX.sErr = ''; } catch (e) { WX.res = []; WX.sErr = e.status === 404 ? 'Søk etter steder krever en nyere server.' : e.message; }
  WX.busy = false; draw();
  const el = document.getElementById('vx-q'); if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); }
}
export async function wxBind(e, t) {
  if (m.screen !== 'vaer') return false;
  if (await wx22Bind(e, t, { WX, plist, wxLoad, placesReload })) return true;
  if (e.type === 'input' && t.matches?.('[data-wxq]')) { WX.q = t.value; clearTimeout(qT); qT = setTimeout(search, 280); return true; }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-wx]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.wx;
  if (k === 'back') { haptic('tap'); if (history.length > 1) history.back(); else location.hash = '#/hl'; return true; }
  if (k === 'place') { WX.place = x.dataset.k; try { localStorage.setItem('fh_wx_place', WX.place); } catch {} WX.sh = null; draw(); scrollTo(0, 0); await wxLoad(); draw(); return true; }
  if (k === 'addpl') { WX.add = true; WX.q = ''; WX.res = null; WX.sErr = ''; draw(); setTimeout(() => document.getElementById('vx-q')?.focus(), 40); return true; }
  if (k === 'addx') WX.add = false;
  else if (k === 'editpl') WX.edit = !WX.edit;
  else if (k === 'pick') {
    const r = WX.res?.[+x.dataset.i]; if (!r) return true;
    try {
      const p = await hlApi('/weather/places', { method: 'POST', json: { name: r.name, lat: r.lat, lon: r.lon, region: r.region } });
      WX.places = null; await placesLoad(); WX.add = false;
      const id = String(p?.id ?? p?.place?.id ?? WX.places.find(([, n]) => n === r.name)?.[0] ?? WX.place);
      WX.place = id; try { localStorage.setItem('fh_wx_place', id); } catch {}
      draw(); await wxLoad(); flash(`${r.name} er lagt til ✓`);
    } catch (err) { flash(err.message); }
  } else if (k === 'rmpl') {
    const id = x.dataset.k; if (plist().length <= 1) return true;
    try { await hlApi(`/weather/places/${encodeURIComponent(id)}`, { method: 'DELETE' }); WX.places = plist().filter(([q]) => q !== id); if (WX.place === id) { WX.place = WX.places[0][0]; await wxLoad(); } } catch (err) { flash(err.message); }
  } else if (k === 'mode') WX.mode = x.dataset.k;
  else if (k === 'day') WX.sh = +x.dataset.i;
  else if (k === 'shx') WX.sh = null;
  else if (k === 'feel') WX.feel = x.dataset.k === '1';
  draw(); return true;
}

/** Etter tegning: animert værbakgrunn (prompt 22). */
export function wxAfterDraw() { fxAfterDraw(m.screen === 'vaer' ? WX.fx : null); }
export const wxPlaces = () => ({ WX, plist, wxLoad });
