// Værvisning v2 (design/Vaer.dc.html): et trykk på temperaturen på Hjem åpner en egen værskjerm i stedet for yr.no.
// Himmel etter vær og døgn, stor sentrert header som tones ut ved scroll, neste 24 timer (temperatur, nedbør, vind),
// 7 dager, fliser (vind, måne, sol, UV, føles som, mot i går, nedbør, sikt, fuktighet, trykk) og «Forhold»-arket.
// Data: GET /api/weather/full?place= (MET/yr.no via serveren, Open-Meteo som reserve, 10 min cache). Eldre server: /mobile/home.weather.
// Steder: GET/POST/DELETE /api/weather/places og søk i /api/weather/search?q= (Kartverket).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { hlData } from './mobile-hl.js';

const PLACES = [['oslo', 'Oslo'], ['bergen', 'Bergen'], ['trondheim', 'Trondheim'], ['tromso', 'Tromsø']];
export const WX = { places: null, add: false, q: '', res: null, sErr: '', busy: false, edit: false, place: (() => { try { return localStorage.getItem('fh_wx_place') || 'oslo'; } catch { return 'oslo'; } })(), d: {}, err: '', mode: 'temp', sh: null, feel: false, from: 'hl' };

async function placesLoad() {
  if (WX.places) return;
  try { const r = await hlApi('/weather/places'); WX.places = (Array.isArray(r) ? r : r?.items ?? []).map((x) => [String(x.id), x.name, x]); }
  catch { WX.places = PLACES.map(([k, n]) => [k, n, null]); WX.fixed = true; }
  if (!WX.places.some(([k]) => k === WX.place) && WX.places[0]) WX.place = WX.places[0][0];
}
const plist = () => WX.places ?? PLACES.map(([k, n]) => [k, n, null]);
export async function wxLoad(force = false) {
  await placesLoad();
  const p = WX.place;
  if (!force && WX.d[p] && Date.now() - WX.d[p]._t < 10 * 60000) return;
  try { const r = await hlApi(`/weather/full?place=${encodeURIComponent(p)}`); WX.d[p] = { ...r, _t: Date.now() }; WX.err = ''; }
  catch (e) {
    const w = hlData()?.weather;
    if (p === 'oslo' && w) { WX.d[p] = { ...fromHome(w), _t: Date.now() }; WX.err = ''; }
    else WX.err = e.status === 404 ? 'Værvisningen krever en nyere server. Oppdater Homelab.' : e.message;
  }
}
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
const SKY = {
  clear: ['linear-gradient(180deg,#2f6fc4 0%,#4d8fd8 40%,#8fc2ee 100%)', 'radial-gradient(90% 50% at 70% 0%,rgba(255,226,140,.55),transparent 70%)'],
  partly: ['linear-gradient(180deg,#3d6c9e 0%,#6b93ba 50%,#a9c3da 100%)', 'radial-gradient(80% 40% at 75% 0%,rgba(255,226,140,.3),transparent 70%)'],
  cloudy: ['linear-gradient(180deg,#4f6378 0%,#71869a 50%,#9fb0bf 100%)', 'none'],
  rain: ['linear-gradient(180deg,#33414f 0%,#4b5c6d 50%,#6e7f8f 100%)', 'none'],
  thunder: ['linear-gradient(180deg,#252c3a 0%,#3b4556 60%,#56627a 100%)', 'none'],
  snow: ['linear-gradient(180deg,#6c829b 0%,#93a6ba 50%,#c3d0dc 100%)', 'none'],
  fog: ['linear-gradient(180deg,#6f7b86 0%,#8f99a2 50%,#b6bdc3 100%)', 'none'],
  night: ['linear-gradient(180deg,#0b1730 0%,#182a4f 55%,#2d4370 100%)', 'radial-gradient(60% 30% at 80% 5%,rgba(200,215,255,.18),transparent 70%)'],
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
  const back = `<button class="vx-back" data-wx="back" data-swipeback>‹ ${WX.from === 'hl' ? 'Hjem' : 'Tilbake'}</button>`;
  // Stedsvelgeren nederst: egne steder kan legges til (søk) og fjernes (Rediger → ✕).
  const places = `<div class="vx-places" role="tablist">${plist().map(([k, n]) => `<button role="tab" data-wx="${WX.edit ? 'rmpl' : 'place'}" data-k="${esc(k)}" aria-selected="${WX.place === k}">${esc(n)}${WX.edit && plist().length > 1 ? ' <b aria-label="Fjern">✕</b>' : ''}</button>`).join('')}${WX.fixed ? '' : `<button data-wx="addpl" aria-label="Legg til sted">＋</button><button data-wx="editpl" aria-pressed="${WX.edit}">${WX.edit ? 'Ferdig' : 'Rediger'}</button>`}</div>${WX.add ? addSheet() : ''}`;
  if (!D) return `<div class="vx" style="background:${SKY.cloudy[0]}"><div class="vx-bar">${back}</div><div class="vx-in">${WX.err ? `<div class="vx-card vx-pad">${esc(WX.err)}</div>` : '<div class="m-spin"></div>'}</div>${places}</div>`;
  const c = D.current ?? {}, td = D.today ?? {}, kind0 = D.kind ?? kindOf(c.code), kind = nightOf(kind0 === 'night' ? 'clear' : kind0, c.isDay !== false && kind0 !== 'night');
  const [sky, glow] = SKY[kind] ?? SKY.cloudy, desc = descOf(c.code, c.text), city = D.place?.name ?? plist().find(([k]) => k === WX.place)?.[1] ?? '';
  const nowT = Date.now(), hours = (D.hours ?? []).filter((h) => new Date(h.t) >= nowT - 3600e3).slice(0, 24);
  const days = (D.days ?? []).slice(0, 7), lo = Math.min(...days.map((d) => d.lo ?? 99)), hi = Math.max(...days.map((d) => d.hi ?? -99)), span = Math.max(1, hi - lo);
  const modes = [['temp', 'Temperatur', 'M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z'], ['rain', 'Nedbør', 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z'], ['wind', 'Vind', 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8']];
  const hv = (h) => (WX.mode === 'rain' ? `${Math.round(h.precipProb ?? (h.precip > 0 ? 60 : 0))} %` : WX.mode === 'wind' ? `${Math.round(h.wind ?? 0)}` : deg(h.temp));
  const nr = D.nextRain, hrTitle = nr?.t ? `Nedbør ventet rundt ${hm(nr.t)}` : kind === 'rain' ? 'Regn akkurat nå' : 'Opphold de neste timene';
  const hrs = hours.map((h, i) => { const k = nightOf(kindOf(h.code), h.isDay !== false && new Date(h.t).getHours() > 6 && new Date(h.t).getHours() < 20);
    return `<div class="vx-h"><span${i === 0 ? ' class="b"' : ''}>${i === 0 ? 'Nå' : String(new Date(h.t).getHours()).padStart(2, '0')}</span>${ico(k, 28)}<span class="vx-pp">${(h.precipProb ?? 0) >= 20 ? `${Math.round(h.precipProb)} %` : ''}</span><b>${hv(h)}</b></div>`; }).join('');
  const dayRows = days.map((d, i) => { const k = kindOf(d.code), l = (((d.lo ?? lo) - lo) / span) * 100, w = (((d.hi ?? hi) - (d.lo ?? lo)) / span) * 100;
    const nowL = i === 0 && c.temp != null ? Math.max(0, Math.min(100, ((c.temp - lo) / span) * 100)) : null, dt = new Date(d.date + 'T12:00');
    return `<button class="vx-d" data-wx="day" data-i="${i}"><span class="vx-dn">${i === 0 ? 'I dag' : WD[dt.getDay()].replace(/^./, (x) => x.toUpperCase())}</span><span class="vx-di">${ico(k, 24)}<small>${(d.precipProb ?? 0) >= 20 ? `${Math.round(d.precipProb)} %` : ''}</small></span>
      <span class="vx-lo">${deg(d.lo)}</span><span class="vx-rng"><i style="left:${l.toFixed(1)}%;width:${Math.max(4, w).toFixed(1)}%"></i>${nowL != null ? `<em style="left:${nowL.toFixed(1)}%"></em>` : ''}</span><span class="vx-hi">${deg(d.hi)}</span></button>`; }).join('');
  // Vind
  const ws = c.wind != null ? Math.round(c.wind) : null, wg = c.gust != null ? Math.round(c.gust) : null;
  const wind = `<div class="vx-card vx-split"><div class="vx-col"><div class="vx-t">${tIco('M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8')}VIND</div>
      ${[['Vind', ws != null ? `${ws} m/s` : '–'], ['Vindkast', wg != null ? `${wg} m/s` : '–'], ['Retning', c.windDir != null ? `${Math.round(c.windDir)}° ${dirName(c.windDir)}` : '–']].map(([a, b], i) => `<div class="vx-r${i ? ' bt' : ''}"><span>${a}</span><span>${b}</span></div>`).join('')}</div>
    <svg viewBox="0 0 100 100" class="vx-comp" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="7" stroke-dasharray="0.8 2.5"/><text x="50" y="12" fill="#fff" font-size="8" font-weight="800" text-anchor="middle">N</text><text x="91" y="53" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">Ø</text><text x="50" y="97" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">S</text><text x="9" y="53" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">V</text>
      <g transform="rotate(${Math.round(c.windDir ?? 0)} 50 50)"><circle cx="50" cy="12" r="3.2" fill="#fff"/><line x1="50" y1="15" x2="50" y2="34" stroke="#fff" stroke-width="2"/><line x1="50" y1="66" x2="50" y2="86" stroke="#fff" stroke-width="2"/><path d="M45 80 L50 89 L55 80" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>
      <circle cx="50" cy="50" r="19" fill="rgba(20,50,90,.35)"/><text x="50" y="51" fill="#fff" font-size="14" font-weight="800" text-anchor="middle">${ws ?? '–'}</text><text x="50" y="61" fill="#fff" font-size="7.5" font-weight="700" text-anchor="middle">m/s</text></svg></div>`;
  // Måne
  const mo = D.moon?.phase != null ? D.moon : moonOf(), mp = mo.phase ?? moonOf().phase;
  const moon = `<div class="vx-card vx-split"><div class="vx-col"><div class="vx-t">${tIco('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z')}${esc(String(mo.name ?? moonOf().name).toUpperCase())}</div>
      ${[['Belyst', `${Math.round(mo.illum ?? moonOf().illum)} %`], ['Neste fullmåne', dShort(mo.nextFull ?? moonOf().nextFull)], ['Neste nymåne', dShort(mo.nextNew ?? moonOf().nextNew)]].map(([a, b], i) => `<div class="vx-r${i ? ' bt' : ''}"><span>${a}</span><span>${b}</span></div>`).join('')}</div>
    <svg viewBox="0 0 56 56" class="vx-moon" aria-hidden="true"><circle cx="28" cy="28" r="24" fill="rgba(20,40,70,.55)"/><path d="${moonPath(mp)}" fill="#e9eef5"/><circle cx="20" cy="20" r="3" fill="rgba(120,140,170,.25)"/><circle cx="33" cy="33" r="4.5" fill="rgba(120,140,170,.22)"/><circle cx="34" cy="18" r="2" fill="rgba(120,140,170,.25)"/></svg></div>`;
  // Sol
  const sr = td.sunrise ? new Date(td.sunrise) : null, ss = td.sunset ? new Date(td.sunset) : null, now = new Date();
  const beforeSet = ss && now < ss && (!sr || now > sr), lbl = beforeSet ? 'SOLNEDGANG' : 'SOLOPPGANG';
  const dayFrac = (now.getHours() * 60 + now.getMinutes()) / 1440, srF = sr ? (sr.getHours() * 60 + sr.getMinutes()) / 1440 : 0.3, ssF = ss ? (ss.getHours() * 60 + ss.getMinutes()) / 1440 : 0.72;
  const sunY = (f) => 25 - 22 * Math.sin(((f - srF) / (ssF - srF)) * Math.PI) * (f >= srF && f <= ssF ? 1 : 0.35);
  const curve = Array.from({ length: 49 }, (_, i) => { const f = i / 48, inDay = f >= srF && f <= ssF, y = inDay ? 25 - 22 * Math.sin(((f - srF) / (ssF - srF)) * Math.PI) : 25 + 12 * Math.sin(Math.min(1, (f < srF ? srF - f : f - ssF) / Math.max(0.05, 1 - (ssF - srF))) * Math.PI / 2); return `${i ? 'L' : 'M'}${(f * 120).toFixed(1)} ${y.toFixed(1)}`; }).join(' ');
  const sun = `<div class="vx-card vx-tile vx-sun"><div class="vx-t pad">${tIco('M3 18h18M7 14a5 5 0 0 1 10 0M12 4v3M5 8l1.5 1.5M19 8l-1.5 1.5')}${lbl}</div><b class="vx-big pad">${hm(beforeSet ? td.sunset : td.sunrise)}</b>
    <svg viewBox="0 0 120 50" preserveAspectRatio="none" class="vx-sunc" aria-hidden="true"><line x1="0" y1="25" x2="120" y2="25" stroke="rgba(255,255,255,.45)" stroke-width="1"/><path d="${curve}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2"/><circle cx="${(dayFrac * 120).toFixed(1)}" cy="${sunY(dayFrac).toFixed(1)}" r="4.5" fill="#fff"/></svg>
    <span class="vx-sm pad">${beforeSet ? `Soloppgang: ${hm(td.sunrise)}` : `Solnedgang: ${hm(td.sunset)}`}</span></div>`;
  // UV
  const uv = c.uv ?? days[0]?.uvMax ?? null, uvN = uv == null ? '–' : uv < 3 ? 'Lav' : uv < 6 ? 'Moderat' : uv < 8 ? 'Høy' : uv < 11 ? 'Svært høy' : 'Ekstrem';
  const uvT = `<div class="vx-card vx-tile"><div class="vx-t">${tIco('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2')}UV-INDEKS</div><b class="vx-big" style="line-height:1">${uv == null ? '–' : Math.round(uv)}</b><b class="vx-mid">${uvN}</b>
    <span class="vx-uvb"><em style="left:${Math.min(100, ((uv ?? 0) / 11) * 100).toFixed(0)}%"></em></span><span class="vx-sm">${uv != null && uv >= 3 ? 'Bruk solkrem midt på dagen.' : 'Lav resten av dagen.'}</span></div>`;
  // Føles som
  const fd = c.feels != null && c.temp != null ? Math.round(c.feels - c.temp) : 0;
  const feel = `<div class="vx-card vx-tile"><div class="vx-t">${tIco('M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z')}FØLES SOM</div><b class="vx-big">${deg(c.feels)}</b><span class="vx-sm" style="margin-top:auto">${fd <= -2 ? 'Vinden gjør at det føles kaldere.' : fd >= 2 ? 'Fuktigheten gjør at det føles varmere.' : 'Ligner den faktiske temperaturen.'}</span></div>`;
  // Mot i går
  const yh = D.yesterday?.hi, th = td.hi ?? days[0]?.hi, diff = yh != null && th != null ? Math.round(th - yh) : null;
  const yd = `<div class="vx-card vx-tile"><div class="vx-t">${tIco('M3 20h18M5 16l4-4 3 3 7-7')}MOT I GÅR</div><b class="vx-big">${diff == null ? '–' : `${diff > 0 ? '+' : ''}${diff}°`}</b><b class="vx-sm b">${diff == null ? 'Ingen data for i går' : diff > 0 ? 'Varmere enn i går' : diff < 0 ? 'Kaldere enn i går' : 'Likt som i går'}</b>
    <div class="vx-yd"><span>I dag</span><span>H:${deg(th)}</span><span>I går</span><span>H:${deg(yh)}</span></div></div>`;
  // Nedbør
  const ps = td.precipSum ?? days[0]?.precipSum ?? 0;
  const rain = `<div class="vx-card vx-tile"><div class="vx-t">${tIco('M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z', true)}NEDBØR</div><b class="vx-big">${(Math.round((ps ?? 0) * 10) / 10).toLocaleString('nb-NO')} mm</b><b class="vx-mid">I dag</b>
    <span class="vx-sm" style="margin-top:auto">${nr?.t ? `${(Math.round((nr.mm ?? 0) * 10) / 10).toLocaleString('nb-NO')} mm ventet ${new Date(nr.t).toDateString() === now.toDateString() ? 'rundt' : `${WD[new Date(nr.t).getDay()]}`} ${hm(nr.t)}.` : 'Ingen nedbør ventet de neste dagene.'}</span></div>`;
  // Sikt, fuktighet og trykk
  const vk = c.visibility != null ? (c.visibility > 100 ? c.visibility / 1000 : c.visibility) : null;
  const vis = `<div class="vx-card vx-tile"><div class="vx-t">${tIco('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z')}SIKT</div><b class="vx-big">${vk == null ? '–' : `${Math.round(vk)} km`}</b><span class="vx-sm" style="margin-top:auto">${vk == null ? '' : vk >= 10 ? 'Helt klart sikt akkurat nå.' : vk >= 4 ? 'Litt dis.' : 'Dårlig sikt.'}</span></div>`;
  const hum = `<div class="vx-card vx-tile"><div class="vx-t">${tIco('M3 9h11a3 3 0 1 0-3-3M3 14h15M3 19h9')}LUFTFUKTIGHET</div><b class="vx-big">${c.humidity != null ? Math.round(c.humidity) : '–'} %</b><span class="vx-sm" style="margin-top:auto">Duggpunktet er ${deg(c.dew)} akkurat nå.</span></div>`;
  const pr = c.pressure, rot = pr != null ? Math.max(-135, Math.min(135, ((pr - 1013) / 50) * 135)) : 0, tr = c.pressureTrend;
  const pres = `<div class="vx-card vx-tile"><div class="vx-t">${tIco('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 12l4-4')}LUFTTRYKK</div>
    <svg viewBox="0 0 100 86" class="vx-pres" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="8" stroke-dasharray="0.9 2.4" transform="rotate(135 50 50)"/><g transform="rotate(${rot.toFixed(0)} 50 50)"><line x1="50" y1="9" x2="50" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>
      <text x="50" y="40" fill="#fff" font-size="12" font-weight="800" text-anchor="middle">${tr === 'up' || tr > 0 ? '↑' : tr === 'down' || tr < 0 ? '↓' : '→'}</text><text x="50" y="56" fill="#fff" font-size="15" font-weight="800" text-anchor="middle">${pr != null ? Math.round(pr) : '–'}</text><text x="50" y="66" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">hPa</text><text x="26" y="84" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">Lavt</text><text x="74" y="84" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">Høyt</text></svg></div>`;
  return `<div class="vx" style="background:${sky}"><div class="vx-glow" style="background:${glow}"></div>
    <div class="vx-bar">${back}<div class="vx-compact"><b>${esc(city)}</b><span>${deg(c.temp)} | ${esc(desc)}</span></div><span class="vx-src">${D.mock ? 'Eksempeldata' : D.fallback || D.source === 'met' ? 'MET' : 'Open-Meteo'}</span></div>
    <div class="vx-in">
      <div class="vx-head"><span class="vx-pos">MIN POSISJON</span><span class="vx-city">${esc(city)}</span><span class="vx-temp">${deg(c.temp)}</span><span class="vx-desc">${esc(desc)}</span><span class="vx-hl">H:${deg(td.hi ?? days[0]?.hi)}  L:${deg(td.lo ?? days[0]?.lo)}${c.feels != null ? ` · Føles som ${deg(c.feels)}` : ''}</span></div>
      ${hours.length ? `<div class="vx-card vx-hours"><div class="vx-hrow"><button class="vx-forh" data-wx="day" data-i="0"><b>Forhold ›</b><span>${esc(hrTitle)}</span></button><div class="vx-modes">${modes.map(([k, n, p]) => `<button data-wx="mode" data-k="${k}" aria-label="${n}" aria-pressed="${WX.mode === k}">${tIco(p, k === 'rain', 18)}</button>`).join('')}</div></div><div class="vx-hs">${hrs}</div></div>` : ''}
      ${days.length ? `<div class="vx-card vx-days">${dayRows}</div>` : ''}
      ${wind}${moon}
      <div class="vx-grid">${sun}${uvT}${feel}${yd}${rain}${vis}${hum}${pres}</div>
      <a class="vx-yr" href="${esc(D.yrUrl || 'https://www.yr.no/nb')}" target="_blank" rel="noopener">${esc(D.credit || `Data: ${D.fallback || D.source === 'met' ? 'MET Norge' : 'Open-Meteo'}`)} · Se også yr.no ↗</a>
    </div>${places}${WX.sh != null ? sheet(D) : ''}</div>`;
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
    <div class="vx-shtop"><button class="vx-x" data-wx="shx" aria-label="Lukk">×</button><b>Forhold</b><span></span></div>
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
  if (e.type === 'input' && t.matches?.('[data-wxq]')) { WX.q = t.value; clearTimeout(qT); qT = setTimeout(search, 280); return true; }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-wx]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.wx;
  if (k === 'back') { if (history.length > 1) history.back(); else location.hash = '#/hl'; return true; }
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
