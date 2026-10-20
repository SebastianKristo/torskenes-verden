// Værsiden på web (prompt 22, fasit design/Vaer.dc.html): fullskjerm med systemfont, animert værbakgrunn, Forhold, 7 dager,
// «Yr og Storm», detaljark for alle kort, kartknapp nede til venstre (Windy med lag) og ☰ nede til høyre (Steder: søk,
// legg til, hold inne og dra, sveip mot høyre for å slette).
// Data: GET /api/weather/full?place=<id> (MET/yr via serveren). Nye felt (7 dager time for time, compare) brukes når de finnes,
// ellers fylles det inn fra døgnverdiene. Storm (tidligere «Pent»): full.compare eller GET /api/weather/compare (eldre format).
// Steder: GET/POST/DELETE /api/weather/places, PUT /api/weather/places/order. Prompt 28: søk i GET /api/weather/places?q=
// (Open-Meteo + OpenStreetMap via serveren, {name, sub, lat, lon, country, source}); eldre server: /api/weather/search?q=.
// Prompt 28: ny værbakgrunn (weather-fx.js, fasit WxFx). Prompt 30: to flytende knapper nederst (kart · steder, ingen
// linje), lett haptikk når et ark/popup lukkes (sentralt i paintLayer), Yr mot Storm i fullskjerm med Ferdig-pille,
// «Pent» heter Storm overalt, logoer fra /assets/brands/ (yr.png, storm.png), og hele «Yr og Storm»-kortet er trykkbart.
import { clearBtn } from '/assets/js/searchfield.js';
import { api, esc, sheetBtn, haptic } from './util.js';
import { createWxFx, sunFrac } from './weather-fx.js';
import { cmp39Html, bindCmp39, cmp39Reset } from './weather-cmp39.js'; // prompt 39: Yr mot Storm 2a + wiggle
import { fig } from './glimt-figs.js'; // prompt 39: Glimt · ukas vær

/* ---------------- Konstanter fra designet ---------------- */
const IC = { sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4', moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', part: 'M8 4v1.5M3.5 9H5M4.8 5.8l1 1M11.2 5.8l-1 1M8 7a3 3 0 0 0-2.8 4M7 19h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.5A3.3 3.3 0 0 0 7 19z', cloud: 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z', rain: 'M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3', snow: 'M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01', fog: 'M4 10h16M6 14h12M4 18h16', storm: 'M7 13h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 13zM12 14l-2 4h3l-2 4' };
const ICC = { sun: '#ffd36b', moon: '#f2f2f2', part: '#ffe7a8', cloud: '#ffffff', rain: '#bfe6ff', snow: '#ffffff', fog: '#e6ecf3', storm: '#ffd36b' };
const DESC = (c) => (c === 0 ? 'Klart' : c <= 2 ? 'Delvis skyet' : c === 3 ? 'Overskyet' : c <= 48 ? 'Tåke' : c <= 57 ? 'Yr' : c <= 67 ? 'Regn' : c <= 77 ? 'Snø' : c <= 82 ? 'Regnbyger' : c <= 86 ? 'Snøbyger' : 'Torden');
const ICN = (c, n) => (c <= 1 ? (n ? 'moon' : 'sun') : c <= 2 ? (n ? 'moon' : 'part') : c === 3 ? 'cloud' : c <= 48 ? 'fog' : c <= 67 || (c >= 80 && c <= 82) ? 'rain' : c <= 86 ? 'snow' : 'storm');
const D16 = ['N', 'NNØ', 'NØ', 'ØNØ', 'Ø', 'ØSØ', 'SØ', 'SSØ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
const WD = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'], WL = ['S', 'M', 'T', 'O', 'T', 'F', 'L'];
const DEFP = [['oslo', 'Oslo', 59.91, 10.75, 'Oslo'], ['bergen', 'Bergen', 60.39, 5.32, 'Vestland'], ['trondheim', 'Trondheim', 63.43, 10.39, 'Trøndelag'], ['tromso', 'Tromsø', 69.65, 18.96, 'Troms']].map(([id, name, lat, lon, region]) => ({ id, name, lat, lon, region }));
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hourKey = (d) => `${dayKey(d)}T${pad2(d.getHours())}`;
const f1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const r0 = (v) => (v == null || !Number.isFinite(+v) ? '–' : `${Math.round(v)}°`);
// Klokkeslett: lokal tid uten sone («2026-10-18T08:01») vises som den er; med sone gjøres den om til lokal tid.
const hmS = (s) => (!s ? '–' : /[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? new Date(s).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : String(s).slice(11, 16));
const hrOf = (s) => { const t = new Date(s); return t.getHours() + t.getMinutes() / 60; };
const svgIc = (k, size, sw = 1.8, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${ICC[k] ?? '#fff'}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}><path d="${IC[k] ?? ''}"/></svg>`;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat modus */ } };
const pick = (o, ...ks) => { for (const k of ks) if (o?.[k] != null) return o[k]; return null; };

/* ---------------- Tilstand ---------------- */
const S = {
  places: null, placesOk: true, cur: lsGet('wx_city'), full: null, d: null, cmp: null, cmpBusy: false, cmpErr: false, src: 'Henter …', mode: (() => { try { return sessionStorage.getItem('wx_mode') || 'temp'; } catch { return 'temp'; } })(),
  sh: null, feel: false, ms: null, msD: 1, cmpOpen: false, plOpen: false, plQ: '', plRes: null, plBusy: false, mpOpen: false, mpL: 'rain', sc: 0,
  swOpen: null, drag: null,
};
let ldId = 0, fx = null;
const root = () => document.getElementById('wxp');

/* ---------------- Data ---------------- */
// Timeserien kan hete hours (48 t), hourly/hours7 (7 døgn) eller være i Open-Meteo-form ({time:[], …}).
// Prompt 22: detail.days[].hours har 7 døgn fra MET (fuktighet, UV, nedbør, kast, trykk, sikt, føles som). Senere kilder overstyrer tidligere.
function hourList(full) {
  const detail = Array.isArray(full.detail?.days) ? full.detail.days.flatMap((d) => d.hours ?? []) : null;
  const cands = [full.hours, full.hoursAll, full.hourly, full.hourly7, full.hours7, detail].filter(Boolean).map((h) => {
    if (Array.isArray(h)) return h;
    if (Array.isArray(h.time)) return h.time.map((t, i) => ({ t, temp: h.temperature_2m?.[i], feels: h.apparent_temperature?.[i], code: h.weather_code?.[i], precipProb: h.precipitation_probability?.[i], precip: h.precipitation?.[i], wind: h.wind_speed_10m?.[i], gust: h.wind_gusts_10m?.[i], humidity: h.relative_humidity_2m?.[i], uv: h.uv_index?.[i], pressure: h.pressure_msl?.[i], visibility: h.visibility?.[i] }));
    return [];
  });
  return cands.flat();
}
const tKey = (t) => { if (!t) return null; if (typeof t === 'number') return hourKey(new Date(t)); return /[zZ]$|[+-]\d\d:?\d\d$/.test(t) ? hourKey(new Date(t)) : String(t).slice(0, 13); };

/** Gjør /api/weather/full om til samme form som designet (Open-Meteo: indeks 0 = i går, 1 = i dag, 216 timer fra i går 00). */
function adapt(full) {
  const C0 = full.current ?? {}, days = full.days ?? [];
  const y0 = new Date(); y0.setDate(y0.getDate() - 1); y0.setHours(0, 0, 0, 0);
  const D = { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [], precipitation_probability_max: [], precipitation_sum: [], sunrise: [], sunset: [], uv_index_max: [], wind_max: [] };
  const byDay = new Map(days.map((x) => [String(x.date).slice(0, 10), x]));
  const sm = new Map(((Array.isArray(full.sunMoon) ? full.sunMoon : full.sunMoon?.days) ?? []).map((x) => [String(x.date).slice(0, 10), x]));
  const visM = (v) => (v == null ? null : v < 200 ? v * 1000 : v); // km (serveren) eller meter
  const hours = hourList(full), hm = new Map();
  for (const h of hours) { const k = tKey(pick(h, 't', 'time', 'ts')); if (k) hm.set(k, h); }
  for (let i = 0; i < 8; i++) {
    const dd = new Date(y0); dd.setDate(dd.getDate() + i);
    const k = dayKey(dd), x = byDay.get(k) ?? (i === 0 ? { hi: full.yesterday?.hi, lo: full.yesterday?.lo } : null) ?? {};
    D.time.push(k);
    const hs = [...Array(24).keys()].map((h) => hm.get(`${k}T${pad2(h)}`)).filter(Boolean), ts = hs.map((h) => pick(h, 'temp', 'temperature')).filter((v) => v != null);
    D.temperature_2m_max.push(pick(x, 'hi', 'max') ?? (ts.length ? Math.max(...ts) : null));
    D.temperature_2m_min.push(pick(x, 'lo', 'min') ?? (ts.length ? Math.min(...ts) : null));
    D.weather_code.push(pick(x, 'code') ?? pick(hs[13] ?? hs[0], 'code') ?? C0.code ?? 3);
    D.precipitation_probability_max.push(pick(x, 'precipProb') ?? (hs.length ? Math.max(...hs.map((h) => pick(h, 'precipProb') ?? 0)) : 0));
    D.precipitation_sum.push(pick(x, 'precipSum', 'precip') ?? (hs.length ? hs.reduce((a, h) => a + (pick(h, 'precip') ?? 0), 0) : 0));
    D.sunrise.push(pick(x, 'sunrise') ?? sm.get(k)?.sunrise ?? null); D.sunset.push(pick(x, 'sunset') ?? sm.get(k)?.sunset ?? null);
    D.moon = D.moon ?? []; D.moon.push(sm.get(k)?.moon ?? null);
    D.uv_index_max.push(pick(x, 'uvMax', 'uv') ?? (hs.length ? Math.max(...hs.map((h) => pick(h, 'uv') ?? 0)) : 0));
    D.wind_max.push(pick(x, 'windMax') ?? null);
  }
  // I går mangler ofte i serverens døgnliste: bruk dagens sol og det vi har.
  for (let i = 0; i < 8; i++) { D.sunrise[i] ??= D.sunrise[1] ?? `${D.time[i]}T08:00`; D.sunset[i] ??= D.sunset[1] ?? `${D.time[i]}T18:00`; D.temperature_2m_max[i] ??= D.temperature_2m_max[1] ?? 8; D.temperature_2m_min[i] ??= D.temperature_2m_min[1] ?? 2; }
  const H = { time: [], temperature_2m: [], apparent_temperature: [], weather_code: [], precipitation_probability: [], precipitation: [], wind_speed_10m: [], wind_gusts_10m: [], pressure_msl: [], uv_index: [], relative_humidity_2m: [], visibility: [], is_day: [] };
  const cur = { temp: pick(C0, 'temp') ?? 8, hum: pick(C0, 'humidity') ?? 70, pres: pick(C0, 'pressure') ?? 1013, vis: visM(pick(C0, 'visibility')) ?? 20000, wind: pick(C0, 'wind') ?? 3 };
  for (let k = 0; k < 192; k++) {
    const t = new Date(y0.getTime() + k * 36e5), key = hourKey(t), di = Math.floor(k / 24), hh = t.getHours(), h = hm.get(key);
    const rise = hrOf(D.sunrise[di]), set = hrOf(D.sunset[di]), day = hh + 0.5 >= rise && hh + 0.5 <= set;
    H.time.push(`${key}:00`); H.is_day.push(day ? 1 : 0);
    if (h) {
      const T = pick(h, 'temp', 'temperature');
      H.temperature_2m.push(T); H.apparent_temperature.push(pick(h, 'feels', 'apparent') ?? T); H.weather_code.push(pick(h, 'code') ?? D.weather_code[di]);
      H.precipitation_probability.push(pick(h, 'precipProb', 'pp') ?? 0); H.precipitation.push(pick(h, 'precip', 'mm') ?? 0);
      H.wind_speed_10m.push(pick(h, 'wind') ?? cur.wind); H.wind_gusts_10m.push(pick(h, 'gust') ?? (pick(h, 'wind') ?? cur.wind) * 1.6);
      H.pressure_msl.push(pick(h, 'pressure') ?? cur.pres); H.uv_index.push(pick(h, 'uv') ?? (day ? Math.max(0, (D.uv_index_max[di] ?? 0) * Math.sin(((hh - rise) / Math.max(1, set - rise)) * Math.PI)) : 0));
      H.relative_humidity_2m.push(pick(h, 'humidity', 'rh') ?? cur.hum); H.visibility.push(visM(pick(h, 'visibility', 'vis')) ?? cur.vis);
    } else {
      // Fylles inn fra døgnverdiene (eldre server med bare 48 timer).
      const hi = D.temperature_2m_max[di], lo = D.temperature_2m_min[di], T = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(((hh - 9) / 24) * 2 * Math.PI));
      const pp = D.precipitation_probability_max[di] ?? 0, w = (D.wind_max[di] ?? cur.wind * 1.4) * 0.65;
      H.temperature_2m.push(T); H.apparent_temperature.push(T - (w > 4 ? 2 : 1)); H.weather_code.push(D.weather_code[di]);
      H.precipitation_probability.push(Math.round(pp * (0.7 + 0.3 * Math.sin(hh / 3)))); H.precipitation.push(pp >= 30 ? (D.precipitation_sum[di] ?? 0) / 24 : 0);
      H.wind_speed_10m.push(w); H.wind_gusts_10m.push(w * 1.6); H.pressure_msl.push(cur.pres); H.uv_index.push(day ? Math.max(0, (D.uv_index_max[di] ?? 0) * Math.sin(((hh - rise) / Math.max(1, set - rise)) * Math.PI)) : 0);
      H.relative_humidity_2m.push(cur.hum); H.visibility.push(cur.vis);
    }
  }
  const C = { temperature_2m: cur.temp, apparent_temperature: pick(C0, 'feels') ?? cur.temp, relative_humidity_2m: cur.hum, weather_code: pick(C0, 'code') ?? 3, wind_speed_10m: cur.wind, wind_direction_10m: pick(C0, 'windDir') ?? 0,
    wind_gusts_10m: pick(C0, 'gust') ?? cur.wind * 1.6, pressure_msl: cur.pres, visibility: cur.vis, uv_index: pick(C0, 'uv') ?? 0, precipitation: pick(C0, 'precip') ?? 0, dew: pick(C0, 'dew'),
    is_day: C0.isDay == null ? (new Date().getHours() >= 7 && new Date().getHours() < 19 ? 1 : 0) : C0.isDay ? 1 : 0 };
  return { current: C, hourly: H, daily: D };
}

/** Storm (ECMWF-modellen, tidligere «Pent») i designets form: hourly {time, temperature_2m, precipitation}, daily {time, max, min, sum, icon}. */
function adaptCmp(c) {
  if (!c || (!c.hours?.length && !c.days?.length)) return null;
  const P = (x) => x?.pent ?? x?.ecmwf ?? x?.storm ?? null;
  const SH = { time: [], temperature_2m: [], precipitation: [] };
  for (const h of c.hours ?? []) {
    const p = P(h), t = pick(h, 'time', 't');
    if (!t || p == null) continue;
    SH.time.push(String(t)); SH.temperature_2m.push(typeof p === 'number' ? p : pick(p, 'temp', 't', 'temperature')); SH.precipitation.push(typeof p === 'number' ? 0 : pick(p, 'precip', 'mm') ?? 0);
  }
  const SD = { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], icon: [] };
  for (const d of c.days ?? []) {
    const p = P(d);
    SD.time.push(String(d.date).slice(0, 10)); SD.temperature_2m_max.push(pick(p, 'max', 'hi')); SD.temperature_2m_min.push(pick(p, 'min', 'lo')); SD.precipitation_sum.push(pick(p, 'precip', 'mm'));
    const code = pick(p, 'code'), icn = pick(p, 'icon');
    SD.icon.push(typeof code === 'number' ? ICN(code, false) : typeof icn === 'number' ? ICN(icn, false) : IC[icn] ? icn : null);
  }
  const ag = typeof c.agreement === 'string' ? c.agreement : null;
  return { hourly: SH, daily: SD, agreement: ag, avgDiff: c.avgDiff ?? null, place: c.place };
}

async function loadPlaces() {
  try { const l = await api('/weather/places'); S.places = Array.isArray(l) && l.length ? l : DEFP; S.placesOk = true; }
  catch (e) {
    S.placesOk = e.status !== 404 && S.placesOk;
    try { const v = JSON.parse(lsGet('wx_places_local') ?? 'null'); S.places = Array.isArray(v) && v.length ? v : DEFP; } catch { S.places = DEFP; }
  }
}
const place = () => S.places?.find((p) => p.id === S.cur) ?? S.places?.[0] ?? DEFP[0];
const savePlacesLocal = () => { if (!S.placesOk) lsSet('wx_places_local', JSON.stringify(S.places)); };

async function load() {
  const P = place(), id = ++ldId;
  S.src = 'Henter …'; paintTop();
  let full = null;
  try { full = await api(`/weather/full?${!P.local ? `place=${encodeURIComponent(P.id)}` : `lat=${P.lat}&lon=${P.lon}&name=${encodeURIComponent(P.name)}`}`); } catch (e) { full = null; S.err = e.message; }
  if (id !== ldId) return;
  S.full = full;
  if (full) {
    S.d = adapt(full);
    const tm = new Date(full.updatedAt ?? Date.now()).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    S.src = full.mock || full.source === 'mock' ? 'Eksempeldata' : `${/open-meteo/.test(full.source ?? '') && !/met/.test(full.source ?? '') ? 'Open-Meteo' : 'MET Norway · yr.no'} · ${tm}`;
  } else { S.d = null; S.src = 'Vær utilgjengelig'; }
  S.cmp = full?.compare ? adaptCmp(full.compare) : null;
  paint();
  if (!S.cmp) loadCmp(id);
}
async function loadCmp(id = ldId) {
  const P = place();
  S.cmpBusy = true; S.cmpErr = false; paintMain();
  try {
    const c = await api(`/weather/compare?${!P.local ? `place=${encodeURIComponent(P.id)}` : `lat=${P.lat}&lon=${P.lon}`}`);
    if (id !== ldId) return;
    S.cmp = adaptCmp(c); S.cmpErr = !S.cmp;
  } catch { if (id === ldId) { S.cmp = null; S.cmpErr = true; } }
  S.cmpBusy = false; paint();
}

/* ---------------- Utregninger (fra designet) ---------------- */
const ic = (c, n) => { const k = ICN(c, n); return { k, ic: IC[k], icc: ICC[k] }; };
function nowIndex(H) { const nowMs = Date.now(); return Math.max(0, H.time.findIndex((t) => new Date(t).getTime() > nowMs - 36e5)); }
const kindOf = (code, night) => ((code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 ? 'rain' : code === 45 || code === 48 ? 'fog' : code === 3 ? 'clouds' : night ? (code === 2 ? 'partn' : 'stars') : code === 2 ? 'part' : 'sun');
function skyOf(code, night) {
  if (night) return 'linear-gradient(180deg,#0b1730 0%,#1c2d52 55%,#2a3f6a 100%)';
  if (code <= 2) return 'linear-gradient(180deg,#1f5fc4 0%,#3a82d8 42%,#6aa8e8 78%,#9ccaf2 100%)';
  if (code === 3) return 'linear-gradient(180deg,#4f6d8f 0%,#6a87a6 55%,#9bb0c5 100%)';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'linear-gradient(180deg,#3b4658 0%,#323d4e 45%,#2a3342 100%)';
  if ((code >= 71 && code <= 77) || code >= 85) return 'linear-gradient(180deg,#5e6b7c 0%,#7d8a9a 55%,#a3aebb 100%)';
  return 'linear-gradient(180deg,#36485e 0%,#4f627a 55%,#74869b 100%)';
}
function moonAt(ms) {
  const age = (((ms / 864e5 - 6.8) % 29.53) + 29.53) % 29.53, ill = (1 - Math.cos((2 * Math.PI * age) / 29.53)) / 2;
  const name = age < 1.8 ? 'Nymåne' : age < 7.4 ? 'Voksende sigd' : age < 9.2 ? 'Første kvarter' : age < 14 ? 'Voksende måne' : age < 15.6 ? 'Fullmåne' : age < 21.2 ? 'Avtagende måne' : age < 23 ? 'Siste kvarter' : age < 27.7 ? 'Avtagende sigd' : 'Nymåne';
  return { age, ill, name };
}

/* ---------------- Visning ---------------- */
const card = (inner, attrs = '', cls = '') => `<div class="wxp-card ${cls}" ${attrs}>${inner}</div>`;
const lab = (svg, t) => `<div class="wxp-lab">${svg}${esc(t)}</div>`;
const LSVG = {
  wind: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/></svg>',
  moon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  sun: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18h18M7 14a5 5 0 0 1 10 0M12 4v3M5 8l1.5 1.5M19 8l-1.5 1.5"/></svg>',
  uv: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>',
  feel: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/></svg>',
  yd: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 20h18M5 16l4-4 3 3 7-7"/></svg>',
  rain: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/></svg>',
  vis: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  hum: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15M3 19h9"/></svg>',
  pres: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/></svg>',
};

function cmpVals(d, nowI) {
  const P = place(), Sx = S.cmp;
  if (!Sx) return { ready: false, agC: '#9aa3ae', agT: S.cmpBusy ? 'Henter Storm …' : S.cmpErr ? 'Storm svarte ikke' : 'Henter …' };
  const H = d.hourly, D = d.daily, SH = Sx.hourly, SD = Sx.daily, si = {};
  SH.time.forEach((t, i) => { si[tKey(t)] = i; });
  const hrs = [];
  for (let k = 0; k < 24; k++) { const i = nowI + k, t = H.time[i]; if (!t) break; const j = si[t.slice(0, 13)]; hrs.push({ t, y: H.temperature_2m[i], yp: H.precipitation[i] || 0, s: j != null ? SH.temperature_2m[j] : null, sp: j != null ? SH.precipitation[j] || 0 : 0 }); }
  const all = hrs.flatMap((h) => [h.y, h.s]).filter((v) => v != null), lo = Math.floor((Math.min(...all) - 1) / 2) * 2, hi = Math.ceil((Math.max(...all) + 1) / 2) * 2;
  const W = 278, X = (k) => 22 + (k / Math.max(1, hrs.length - 1)) * W, Y = (v) => 10 + (1 - (v - lo) / Math.max(1, hi - lo)) * 110, pm = Math.max(2, ...hrs.flatMap((h) => [h.yp, h.sp]));
  const ln = (key) => hrs.map((h, k) => (h[key] == null ? '' : `${k && hrs[k - 1][key] != null ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(h[key]).toFixed(1)}`)).join(' ');
  const grid = []; for (let v = lo; v <= hi; v += Math.max(2, Math.round((hi - lo) / 4 / 2) * 2)) grid.push({ y: Y(v).toFixed(1), ty: (Y(v) + 3).toFixed(1), t: `${v}°` });
  const bars = []; hrs.forEach((h, k) => { [[h.yp, '#5ec8f2', -4.5], [h.sp, '#ff8a3d', 0.5]].forEach(([v, c, o]) => { if (v > 0) { const bh = Math.max(2, (v / pm) * 30); bars.push({ x: (X(k) + o).toFixed(1), y: (152 - bh).toFixed(1), h: bh.toFixed(1), c }); } }); });
  const sdi = {}; SD.time.forEach((t, i) => { sdi[t] = i; });
  const mm = (v) => (v == null ? '–' : `${f1(v)} mm`);
  const diffs = [];
  const days = [1, 2, 3, 4, 5, 6, 7].filter((i) => i < D.time.length).map((i, k) => {
    const day = D.time[i], j = sdi[day], yI = ic(D.weather_code[i], false), sk = j != null ? SD.icon[j] ?? yI.k : null;
    const yh = D.temperature_2m_max[i], sh = j != null ? SD.temperature_2m_max[j] : null, df = sh == null || yh == null ? null : Math.round(yh - sh);
    if (df != null) diffs.push(Math.abs(yh - sh));
    return { d: k ? WD[new Date(`${day}T12:00`).getDay()] : 'I dag', yk: yI.k, sk, yh, sh, dfN: df, ypN: D.precipitation_sum[i] ?? 0, spN: j != null ? SD.precipitation_sum[j] ?? 0 : null, ylo: D.temperature_2m_min[i], slo: j != null ? SD.temperature_2m_min[j] : null, yt: `${r0(yh)} / ${r0(D.temperature_2m_min[i])}`, stt: j != null ? `${r0(sh)} / ${r0(SD.temperature_2m_min[j])}` : '–', yp: mm(D.precipitation_sum[i]), sp: j != null ? mm(SD.precipitation_sum[j]) : '–',
      df: df == null ? '–' : `${df > 0 ? '+' : ''}${df}°`, dbg: df == null || Math.abs(df) < 2 ? 'rgba(255,255,255,.1)' : Math.abs(df) < 4 ? 'rgba(255,179,71,.3)' : 'rgba(242,107,94,.4)' };
  });
  const avg = Sx.avgDiff ?? (diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0);
  const ag = Sx.agreement ?? (avg < 1.5 ? 'good' : avg < 3 ? 'mid' : 'bad');
  return { ready: true, yr: ln('y'), st: ln('s'), grid, bars, hx: hrs.map((h, k) => ({ x: X(k).toFixed(1), t: h.t.slice(11, 13) })).filter((_, k) => k % 4 === 0), days, days4: days.slice(0, 4),
    agC: ag === 'good' ? '#6fdc8c' : ag === 'mid' ? '#ffb347' : '#f26b5e', agT: ag === 'good' ? 'Yr og Storm er enige' : ag === 'mid' ? `Litt uenige · ${f1(avg)}° i snitt` : `Uenige · ${f1(avg)}° i snitt`,
    agS: `Snitt avvik i makstemperatur: ${f1(avg)}° over ${diffs.length} dager`, place: P.name };
}

// Prompt 32: PC-oppsett (fasit Vaer.dc.html med desktop=true): sidepanel med steder til venstre, innhold i to kolonner 5:7
// (topp, Forhold og 7 dager til venstre; værkart, Yr og Storm, vind, måne og fliser til høyre). Under 900 px: mobiloppsettet.
// Prompt 36: nytt PC-oppsett (Vær på Mac) fra 800 px; under det mobiloppsettet.
const isDk = () => window.innerWidth >= 800;
// Kortfargen tones etter himmelen (fasit Vaer.dc.html → cardBg).
function cardBgOf(code, night) {
  if (night) return 'rgba(34,38,78,.58)';
  if (code <= 2) return 'rgba(24,82,168,.34)';
  if (code === 3) return 'rgba(62,84,110,.42)';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rgba(34,42,56,.5)';
  if ((code >= 71 && code <= 77) || code >= 85) return 'rgba(84,98,118,.4)';
  return 'rgba(52,64,80,.45)';
}
const MODE_SUB = { temp: 'Temperatur (°C)', rain: 'Nedbør (mm) · Sjanse', wind: 'Vind (m/s) · Kast' };
const f1n = (v) => (v < 0.05 ? '0' : v < 10 ? String(Math.round(v * 10) / 10).replace('.', ',') : String(Math.round(v)));
const DROP = '<svg width="12" height="14" viewBox="0 0 24 24" fill="#5ad1ff" aria-hidden="true"><path d="M12 2c3.5 4.6 7 8.6 7 12.6a7 7 0 0 1-14 0C5 10.6 8.5 6.6 12 2z"/></svg>';

function heroHtml(d, P) {
  const C = d.current, D = d.daily, dk = isDk();
  return `<div class="wxp-hero${dk ? ' dk' : ''}" style="opacity:${dk ? 1 : Math.max(0, 1 - S.sc / 220).toFixed(2)}"><span class="wxp-k">${P.id === 'pos' || P.mine ? 'MIN POSISJON' : esc((P.region && P.region !== P.name ? P.region : P.country || 'Norge').toUpperCase())}</span><span class="wxp-city">${esc(P.name)}</span><span class="wxp-temp">${r0(C.temperature_2m)}</span><span class="wxp-desc">${esc(DESC(C.weather_code))}</span><span class="wxp-hl">H:${r0(D.temperature_2m_max[1])}  L:${r0(D.temperature_2m_min[1])}</span>${dk ? '' : `<span class="wxp-hsrc">${esc(S.src)}</span>`}</div>`;
}

// Forhold: bryteren ☁/💧/🌬 bytter både timeraden og dagslisten. Timecellene er alltid 142 px høye.
function forholdHtml(d) {
  const H = d.hourly, nowI = nowIndex(H), Sx = S.cmp, psi = {};
  if (Sx) Sx.hourly.time.forEach((t, i) => { psi[tKey(t)] = i; });
  const PR = H.precipitation, WS = H.wind_speed_10m, WG = H.wind_gusts_10m, gst = (i) => (WG[i] != null ? WG[i] : (WS[i] || 0) * 1.5);
  const WMX = Math.max(4, ...H.time.slice(nowI, nowI + 24).map((_, k) => gst(nowI + k))), wy = (v) => (31 - Math.min(1, v / WMX) * 27).toFixed(1);
  const hrs = H.time.slice(nowI, nowI + 24).map((t, k) => {
    const i = nowI + k, hh = +t.slice(11, 13), lab = `<span style="font-weight:${k ? 700 : 800}">${k ? pad2(hh) : 'Nå'}</span>`, pp = Math.round(H.precipitation_probability[i] ?? 0);
    if (S.mode === 'rain') {
      const mm = PR[i] || 0;
      return `<div class="wxp-h">${lab}<span class="wxp-rb"><i style="top:33%"></i><i style="top:66%"></i><b style="height:${Math.min(100, (mm / 3) * 100).toFixed(0)}%;border-radius:${mm >= 3 ? '9px' : '0 0 9px 9px'}"></b></span><span class="wxp-mm">${mm >= 0.05 ? `${f1n(mm)} mm` : ''}</span><span class="wxp-ppa">${pp} %</span></div>`;
    }
    if (S.mode === 'wind') {
      const a = WS[Math.max(nowI, i - 1)] || 0, b = WS[i] || 0, c2 = WS[i + 1] != null ? WS[i + 1] : b;
      const ga = gst(Math.max(nowI, i - 1)), gb = gst(i), gc = WG[i + 1] != null || WS[i + 1] != null ? gst(i + 1) : gb;
      return `<div class="wxp-h">${lab}<b class="wxp-ws">${Math.round(b)}</b><span class="wxp-wu">m/s</span><span class="wxp-wg">kast ${Math.round(gb)}</span><svg width="56" height="34" viewBox="0 0 56 34" preserveAspectRatio="none" aria-hidden="true"><path d="M0 34 L0 ${wy((ga + gb) / 2)} L28 ${wy(gb)} L56 ${wy((gb + gc) / 2)} L56 34 Z" fill="rgba(90,209,255,.28)"/><path d="M0 ${wy((a + b) / 2)} L28 ${wy(b)} L56 ${wy((b + c2) / 2)}" fill="none" stroke="#3fd0e0" stroke-width="3" stroke-linecap="round"/></svg></div>`;
    }
    const I = ic(H.weather_code[i], !H.is_day[i]), j = psi[t.slice(0, 13)];
    const pt = Sx && j != null && Sx.hourly.temperature_2m[j] != null ? `${Math.round(Sx.hourly.temperature_2m[j])}°` : '';
    return `<div class="wxp-h">${lab}${svgIc(I.k, 28)}<span class="wxp-pp">${pp >= 20 ? `${pp} %` : ''}</span><b>${r0(H.temperature_2m[i])}</b><span class="wxp-pt" title="${pt ? 'Storm (ECMWF-modell)' : ''}">${pt}</span></div>`;
  }).join('');
  const MODES = [['temp', 'Temperatur', IC.part], ['rain', 'Nedbør', 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z'], ['wind', 'Vind', 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8']];
  return card(`<div class="wxp-hrhead"><button class="wxp-link" data-wx-sh="1"><b>Forhold ›</b><span>${MODE_SUB[S.mode]}</span></button><div class="wxp-modes" role="tablist">${MODES.map(([k, n, p]) => `<button role="tab" aria-selected="${S.mode === k}" aria-label="${n}" title="${n}" data-wx-mode="${k}" class="${S.mode === k ? 'on' : ''}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/></svg></button>`).join('')}</div></div>
      <div class="wxp-hours m-${S.mode}">${hrs}</div>`, '', 'wxp-hcard');
}

function daysHtml(d) {
  const C = d.current, D = d.daily, H = d.hourly, PR = H.precipitation, WS = H.wind_speed_10m, WG = H.wind_gusts_10m, gst = (i) => (WG[i] != null ? WG[i] : (WS[i] || 0) * 1.5);
  const di = [1, 2, 3, 4, 5, 6, 7].filter((i) => i < D.time.length), LO = Math.min(...di.map((i) => D.temperature_2m_min[i])), HI = Math.max(...di.map((i) => D.temperature_2m_max[i])), sp = Math.max(1, HI - LO);
  const nowHr = new Date().getHours();
  const rows = di.map((i, k) => {
    const name = `<span class="wxp-dn">${k ? WD[new Date(`${D.time[i]}T12:00`).getDay()] : 'I dag'}</span>`, pp = Math.round(D.precipitation_probability_max[i] ?? 0);
    const ix = Array.from({ length: 24 }, (_, h) => i * 24 + h).filter((j) => H.time[j]);
    if (S.mode === 'rain') {
      const two = Array.from({ length: 12 }, (_, q) => (PR[ix[q * 2]] || 0) + (PR[ix[q * 2 + 1]] || 0)), mmS = D.precipitation_sum[i] ?? two.reduce((a, v) => a + v, 0);
      const bars = two.map((v, q) => `<span style="background:${q >= 3 && q < 9 ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.16)'};outline:${k === 0 && Math.floor(nowHr / 2) === q ? '2px solid #fff' : 'none'}"><b style="height:${Math.min(100, (v / 4) * 100).toFixed(0)}%"></b></span>`).join('');
      return `<button class="wxp-day r" data-wx-sh="${i}">${name}<span class="wxp-rbars">${bars}</span><span class="wxp-dmm" style="color:${mmS >= 0.05 ? '#fff' : '#9fe0ff'}">${f1n(mmS)} mm</span><span class="wxp-dpp" style="color:${pp >= 30 ? '#fff' : '#9fe0ff'}">${pp >= 30 ? DROP : ''}${pp}%</span></button>`;
    }
    if (S.mode === 'wind') {
      const s2 = ix.map((j) => WS[j] || 0), g2 = ix.map((j) => gst(j)), dMx = Math.max(4, ...g2), yy = (v) => (26 - Math.min(1, v / dMx) * 22).toFixed(1), px = (q) => ((q / Math.max(1, ix.length - 1)) * 120).toFixed(1);
      const sL = s2.length ? `M${s2.map((v, q) => `${px(q)} ${yy(v)}`).join(' L')}` : '', gA = g2.length ? `M0 28 L${g2.map((v, q) => `${px(q)} ${yy(v)}`).join(' L')} L120 28 Z` : '';
      const nI = Math.min(ix.length - 1, nowHr), dot = k === 0 && s2.length ? `<i style="left:${((px(nI) / 120) * 100).toFixed(1)}%;top:${((yy(s2[nI]) / 28) * 100).toFixed(1)}%"></i>` : '';
      return `<button class="wxp-day w" data-wx-sh="${i}">${name}<span class="wxp-wgr"><svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><rect x="30" y="0" width="60" height="28" fill="rgba(255,255,255,.08)"/><path d="${gA}" fill="rgba(90,209,255,.3)"/><path d="${sL}" fill="none" stroke="#3fd0e0" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${k === 0 ? '5 4' : 'none'}" vector-effect="non-scaling-stroke"/></svg>${dot}</span><span class="wxp-wr">${s2.length ? `${Math.round(Math.min(...s2))}–${Math.round(Math.max(...g2))}` : '–'} <span>m/s</span></span></button>`;
    }
    const lo = D.temperature_2m_min[i], hi = D.temperature_2m_max[i], I = ic(D.weather_code[i], false);
    return `<button class="wxp-day" data-wx-sh="${i}">${name}<span class="wxp-di">${svgIc(I.k, 24)}<span>${pp >= 30 ? `${pp} %` : ''}</span></span><span class="wxp-lo">${r0(lo)}</span>
      <span class="wxp-bar"><span style="left:${(((lo - LO) / sp) * 100).toFixed(1)}%;width:${Math.max(8, ((hi - lo) / sp) * 100).toFixed(1)}%"></span>${k === 0 ? `<i style="left:${Math.min(100, Math.max(0, ((C.temperature_2m - LO) / sp) * 100)).toFixed(1)}%"></i>` : ''}</span><span class="wxp-hi">${r0(hi)}</span></button>`;
  }).join('');
  return card(rows, '', 'wxp-days');
}

function cmpCardHtml(d) {
  const cmp = cmpVals(d, nowIndex(d.hourly));
  // Hele kortet åpner Yr mot Storm i fullskjerm.
  return card(`<div class="wxp-cmph"><span class="wxp-yp">${LOGO('yr', 30)}${LOGO('storm', 30)}</span><span class="wxp-grow"><b>Yr og Storm</b><span class="wxp-ag"><i style="background:${cmp.agC}"></i>${esc(cmp.agT)}</span></span></div>
    ${cmp.ready ? `<div class="wxp-cg wxp-cgh"><span></span><span style="color:#7fd6f5">YR</span><span style="color:#ffb27a">STORM</span><span style="text-align:right">AVVIK</span></div>${cmp.days4.map(cmpRow).join('')}` : `<span class="wxp-busy">${esc(S.cmpBusy ? 'Henter Storm …' : S.cmpErr ? 'Storm svarte ikke.' : '')}</span>`}
    <span class="wxp-more"><span>Time for time og hele uka</span><span>›</span></span>`, 'data-wx="cmp" role="button" tabindex="0" aria-label="Yr mot Storm, time for time og hele uka"', 'wxp-cmp');
}

// Vind, måne, sol, UV, føles som, mot i går, nedbør, sikt, luftfuktighet, lufttrykk.
function restHtml(d) { const R = restParts(d); return `${R.wind}${R.moon}<div class="wxp-tiles">${R.tiles.join('')}</div>`; }
// Prompt 36: delene hver for seg, så PC-oppsettet kan legge dem i et 5-kolonners rutenett.
function restParts(d) {
  const C = d.current, D = d.daily, H = d.hourly, nowI = nowIndex(H), di = [1, 2, 3, 4, 5, 6, 7].filter((i) => i < D.time.length);
  const dir = C.wind_direction_10m ?? 0, dTxt = `${Math.round(dir)}° ${D16[Math.round(dir / 22.5) % 16]}`;
  const rows = (arr) => arr.map(([a, b], i) => `<div class="wxp-row${i ? ' bt' : ''}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('');
  const windCard = card(`<div>${lab(LSVG.wind, 'VIND')}${rows([['Vind', `${f1(C.wind_speed_10m)} m/s`], ['Kast', `${f1(C.wind_gusts_10m)} m/s`], ['Retning', dTxt]])}</div>
    <svg viewBox="0 0 100 100" class="wxp-dial"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="7" stroke-dasharray="0.8 2.5"/><text x="50" y="12" fill="#fff" font-size="8" font-weight="800" text-anchor="middle">N</text><text x="91" y="53" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">Ø</text><text x="50" y="97" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">S</text><text x="9" y="53" fill="#fff" font-size="8" font-weight="800" text-anchor="middle" opacity=".75">V</text><g transform="rotate(${Math.round(dir)} 50 50)"><circle cx="50" cy="12" r="3.2" fill="#fff"/><line x1="50" y1="15" x2="50" y2="34" stroke="#fff" stroke-width="2"/><line x1="50" y1="66" x2="50" y2="86" stroke="#fff" stroke-width="2"/><path d="M45 80 L50 89 L55 80" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g><circle cx="50" cy="50" r="19" fill="rgba(20,50,90,.35)"/><text x="50" y="51" fill="#fff" font-size="14" font-weight="800" text-anchor="middle">${f1(C.wind_speed_10m)}</text><text x="50" y="61" fill="#fff" font-size="7.5" font-weight="700" text-anchor="middle">m/s</text></svg>`, 'data-wx-ms="wind" role="button" tabindex="0"', 'wxp-split');
  const mo = moonAt(Date.now()), wax = mo.age < 14.77, kx = Math.abs(1 - 2 * mo.ill) * 24;
  const lit = `M28 4 A24 24 0 0 ${wax ? 1 : 0} 28 52 A${kx.toFixed(1)} 24 0 0 ${(mo.ill > 0.5) === wax ? 1 : 0} 28 4 Z`;
  const toFull = Math.round((((14.77 - mo.age) % 29.53) + 29.53) % 29.53), toNew = Math.round(29.53 - mo.age);
  const moonCard = card(`<div>${lab(LSVG.moon, mo.name.toUpperCase())}${rows([['Belyst', `${Math.round(mo.ill * 100)} %`], ['Neste fullmåne', toFull <= 0 ? 'I dag' : `${toFull} dager`], ['Neste nymåne', `${toNew} dager`]])}</div>
    <svg viewBox="0 0 56 56" class="wxp-moon"><circle cx="28" cy="28" r="24" fill="rgba(20,40,70,.55)"/><path d="${lit}" fill="#e9eef5"/><circle cx="20" cy="20" r="3" fill="rgba(120,140,170,.25)"/><circle cx="33" cy="33" r="4.5" fill="rgba(120,140,170,.22)"/><circle cx="34" cy="18" r="2" fill="rgba(120,140,170,.25)"/><circle cx="22" cy="38" r="2.4" fill="rgba(120,140,170,.2)"/></svg>`, 'data-wx-ms="moon" role="button" tabindex="0"', 'wxp-split');
  const rise = D.sunrise[1], set = D.sunset[1], rh = hrOf(rise), shh = hrOf(set), noon = (rh + shh) / 2, nh = new Date().getHours() + new Date().getMinutes() / 60;
  const el = (h) => Math.cos((2 * Math.PI * (h - noon)) / 24) - Math.cos((2 * Math.PI * (rh - noon)) / 24), eMax = el(noon), eMin = el(noon + 12), yOf = (h) => 6 + ((eMax - el(h)) / (eMax - eMin)) * 40;
  const sp2 = Array.from({ length: 49 }, (_, k) => { const h = k / 2; return `${k ? 'L' : 'M'}${((h / 24) * 120).toFixed(1)} ${yOf(h).toFixed(1)}`; }).join(' ');
  const pre = nh > shh || nh < rh;
  const uv = Math.round(C.uv_index ?? D.uv_index_max[1] ?? 0), UVN = uv < 3 ? 'Lav' : uv < 6 ? 'Moderat' : uv < 8 ? 'Høy' : uv < 11 ? 'Svært høy' : 'Ekstrem';
  const dew = C.dew ?? C.temperature_2m - (100 - C.relative_humidity_2m) / 5, visKm = (C.visibility || 0) / 1000, diff = C.apparent_temperature - C.temperature_2m;
  const nx = di.slice(1).find((i) => (D.precipitation_sum[i] || 0) >= 0.5);
  const rainNext = nx ? `Neste ventet er ${f1(D.precipitation_sum[nx])} mm ${WD[new Date(`${D.time[nx]}T12:00`).getDay()].toLowerCase()}.` : 'Ingen nedbør ventet de neste dagene.';
  const yd = D.temperature_2m_max[1] - D.temperature_2m_max[0];
  const pNow = H.pressure_msl[nowI] ?? C.pressure_msl, p3 = H.pressure_msl[Math.max(0, nowI - 3)] ?? pNow, pr = C.pressure_msl, pf = Math.min(1, Math.max(0, (pr - 960) / 100));
  const trend = S.full?.current?.pressureTrend, arrow = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : pNow - p3 > 0.6 ? '↑' : pNow - p3 < -0.6 ? '↓' : '→';
  const tile = (k, inner) => card(inner, `data-wx-ms="${k}" role="button" tabindex="0"`, 'wxp-tile');
  const tiles = [
    card(`${lab(LSVG.sun, pre ? 'SOLOPPGANG' : 'SOLNEDGANG')}<b class="wxp-big">${esc(pre ? hmS(rise) : hmS(set))}</b><svg viewBox="0 0 120 50" preserveAspectRatio="none" class="wxp-sunarc"><line x1="0" y1="${yOf(rh).toFixed(1)}" x2="120" y2="${yOf(rh).toFixed(1)}" stroke="rgba(255,255,255,.45)" stroke-width="1"/><path d="${sp2}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2"/><circle cx="${((nh / 24) * 120).toFixed(1)}" cy="${yOf(nh).toFixed(1)}" r="4.5" fill="#fff"/></svg><span class="wxp-small">${esc(pre ? `Solnedgang: ${hmS(set)}` : `Soloppgang: ${hmS(rise)}`)}</span>`, 'data-wx-ms="sun" role="button" tabindex="0"', 'wxp-tile wxp-suntile'),
    tile('uv', `${lab(LSVG.uv, 'UV-INDEKS')}<b class="wxp-big" style="line-height:1">${uv}</b><b class="wxp-mid">${UVN}</b><span class="wxp-uvbar"><i style="left:${Math.min(100, (uv / 11) * 100)}%"></i></span><span class="wxp-small">${uv < 3 ? 'Lave nivåer hele dagen.' : 'Bruk solkrem midt på dagen.'}</span>`),
    tile('feel', `${lab(LSVG.feel, 'FØLES SOM')}<b class="wxp-big">${r0(C.apparent_temperature)}</b><span class="wxp-small wxp-auto">${Math.abs(diff) < 1 ? 'Omtrent som den faktiske temperaturen.' : diff < 0 ? 'Føles kaldere enn faktisk, på grunn av vind.' : 'Føles varmere enn den faktiske temperaturen.'}</span>`),
    tile('yd', `${lab(LSVG.yd, 'MOT I GÅR')}<b class="wxp-big">${yd >= 0 ? '+' : '−'}${Math.abs(Math.round(yd))}°</b><span class="wxp-small" style="font-weight:700">${Math.round(yd) === 0 ? 'Like varmt som i går' : yd > 0 ? 'Varmere enn i går' : 'Kaldere enn i går'}</span><div class="wxp-yd"><span>I dag</span><span>H:${r0(D.temperature_2m_max[1])}</span><span>I går</span><span>H:${r0(D.temperature_2m_max[0])}</span></div>`),
    tile('rain', `${lab(LSVG.rain, 'NEDBØR')}<b class="wxp-big">${f1(D.precipitation_sum[1] || 0)} mm</b><b class="wxp-mid">I dag</b><span class="wxp-small wxp-auto">${esc(rainNext)}</span>`),
    tile('vis', `${lab(LSVG.vis, 'SIKT')}<b class="wxp-big">${visKm >= 30 ? `+${Math.round(visKm)}` : visKm >= 10 ? Math.round(visKm) : f1(visKm)} km</b><span class="wxp-small wxp-auto">${visKm >= 20 ? 'Helt klar sikt.' : visKm >= 10 ? 'God sikt.' : visKm >= 4 ? 'Moderat sikt.' : 'Dårlig sikt.'}</span>`),
    tile('hum', `${lab(LSVG.hum, 'LUFTFUKTIGHET')}<b class="wxp-big">${Math.round(C.relative_humidity_2m)} %</b><span class="wxp-small wxp-auto">Duggpunktet er ${Math.round(dew)}° akkurat nå.</span>`),
    tile('pres', `${lab(LSVG.pres, 'LUFTTRYKK')}<svg viewBox="0 0 100 86" class="wxp-pres"><circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="8" stroke-dasharray="0.9 2.4" transform="rotate(135 50 50)" pathLength="100"/><g transform="rotate(${(-135 + pf * 270).toFixed(0)} 50 50)"><line x1="50" y1="9" x2="50" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g><text x="50" y="40" fill="#fff" font-size="12" font-weight="800" text-anchor="middle">${arrow}</text><text x="50" y="56" fill="#fff" font-size="15" font-weight="800" text-anchor="middle">${Math.round(pr).toLocaleString('nb-NO')}</text><text x="50" y="66" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">hPa</text><text x="26" y="84" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">Lavt</text><text x="74" y="84" fill="#fff" font-size="8" font-weight="700" text-anchor="middle">Høyt</text></svg>`),
  ];
  const [sun, uvT, feel, ydT, rain, vis, hum, pres] = tiles;
  return { wind: windCard, moon: moonCard, tiles, sun, uv: uvT, feel, yd: ydT, rain, vis, hum, pres };
}

const mapSrc = (P) => `https://embed.windy.com/embed2.html?lat=${P.lat}&lon=${P.lon}&detailLat=${P.lat}&detailLon=${P.lon}&zoom=7&level=surface&overlay=${S.mpL}&product=ecmwf&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=m%2Fs&metricTemp=%C2%B0C`;
// Værkartet på PC: eget kort øverst i høyre kolonne (lag og Fullskjerm). Iframen tegnes bare når sted eller lag endres.
function mapCardHtml() {
  return `<div class="wxp-mapcard"><div class="wxp-mapslot"></div><div class="wxp-mapbar"><span class="wxp-layers sm" role="tablist">${LAYERS.map(([k, n]) => `<button role="tab" aria-selected="${S.mpL === k}" class="${S.mpL === k ? 'on' : ''}" data-wx-layer="${k}">${n}</button>`).join('')}</span><button class="wxp-fsb" data-wx="map">⤢ Fullskjerm</button></div></div>`;
}
function paintMap(r) {
  const slot = r.querySelector('.wxp-mapslot');
  if (!slot) return;
  const P = place(), src = mapSrc(P);
  if (slot.dataset.src === src && slot.firstChild) return;
  slot.dataset.src = src;
  slot.innerHTML = `<iframe src="${esc(src)}" title="Værkart for ${esc(P.name)}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
}

// Prompt 36: sidepanelet på PC (320 px, fra topp til bunn): søkefelt + rund «+», og stedskort med været for HVERT sted
// (temperatur, H/L, beskrivelse eller «85 % sjanse for regn på torsdag», lokal tid når tidssonen er en annen) på stedets egen himmel.
const DN = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
function sideHtml() {
  const L = S.places ?? DEFP, C = S.d?.current, D = S.d?.daily, cur = place();
  const list = L.map((P) => {
    const on = P.id === cur.id, Q = S.pw?.[P.id];
    let t = '', sub = [P.region, P.country || 'Norge'].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', '), hl = '', tag = '', bg = '';
    if (on && C) { t = r0(C.temperature_2m); sub = DESC(C.weather_code); hl = `H:${r0(D.temperature_2m_max[1])}  L:${r0(D.temperature_2m_min[1])}`; tag = P.id === 'pos' || P.mine ? 'Min posisjon' : (P.region && P.region !== P.name ? P.region : P.country || 'Norge'); }
    else if (Q) {
      t = r0(Q.t); hl = Q.hi != null ? `H:${r0(Q.hi)}  L:${r0(Q.lo)}` : ''; bg = skyOf(Q.code ?? 2, Q.day === false);
      tag = Q.time || P.region || P.country || '';
      sub = Q.pp >= 60 ? `${Math.round(Q.pp)} % sjanse for regn ${Q.ppD}` : DESC(Q.code ?? 2);
    }
    return `<button class="wx36-pc${on ? ' on' : ''}" data-wx-pl="${esc(P.id)}"${on ? ' aria-current="true"' : ''}${bg ? ` style="background:${bg}"` : ''}><span class="wx36-pc1"><span class="wx36-pcn"><b>${esc(P.name)}</b><span>${esc(tag)}</span></span><span class="wx36-pct">${t}</span></span><span class="wx36-pc2"><span>${esc(sub)}</span><span>${hl}</span></span></button>`;
  }).join('');
  return `<div class="wx36-sq"><button class="wx36-sqb" data-wx="places"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>Søk etter by eller sted</button><button class="wx36-plus" data-wx="places" aria-label="Legg til sted" title="Legg til sted"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>
    <div class="wx36-pcs">${list}</div><span class="wxp-sidesrc">${esc(S.src)}</span>`;
}

// Været for alle steder i ett kall: GET /api/weather/places/summary (prompt 36). Tåler 404 / andre former: da hentes
// /api/weather/full per sted. Oppdateres hvert 10. min og når steder legges til eller fjernes.
function normQ(x) {
  if (!x) return null;
  const c = x.current ?? x, days = x.days ?? x.daily ?? null;
  const t = pick(c, 'temp', 't', 'temperature', 'temperature_2m');
  if (t == null) return null;
  const code = pick(c, 'code', 'weatherCode', 'weather_code') ?? 2;
  const dayRaw = pick(c, 'isDay', 'day', 'is_day');
  let hi = pick(x, 'hi', 'max', 'high'), lo = pick(x, 'lo', 'min', 'low');
  let pp = pick(x, 'pp', 'precipProbMax', 'rainChance'), ppD = x.ppDay ?? x.ppD ?? null, ppDate = x.ppDate ?? null;
  if (Array.isArray(days) && days.length) {
    hi ??= pick(days[0], 'hi', 'max'); lo ??= pick(days[0], 'lo', 'min');
    if (pp == null) { let k = 0; days.slice(0, 4).forEach((dd, q) => { if ((pick(dd, 'precipProb', 'pp') ?? 0) > (pick(days[k], 'precipProb', 'pp') ?? 0)) k = q; }); pp = pick(days[k], 'precipProb', 'pp') ?? 0; ppDate = String(days[k].date ?? '').slice(0, 10); ppD = k === 0 ? 'i dag' : k === 1 ? 'i morgen' : null; }
  }
  if (!ppD && ppDate) { const dd = new Date(`${ppDate}T12:00`), today = dayKey(new Date()), tm = new Date(); tm.setDate(tm.getDate() + 1); ppD = ppDate === today ? 'i dag' : ppDate === dayKey(tm) ? 'i morgen' : `på ${DN[dd.getDay()]}`; }
  // Lokal tid når stedet har en annen tidssone (New York 15:49).
  let time = '';
  const tz = x.tz ?? x.timezone ?? null, off = pick(x, 'utcOffset', 'utc_offset_seconds', 'offsetSec');
  try {
    if (tz && typeof tz === 'string') {
      const there = new Date().toLocaleTimeString('nb-NO', { timeZone: tz, hour: '2-digit', minute: '2-digit' }), here = new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
      if (there !== here) time = there;
    } else if (off != null && Math.abs(off + new Date().getTimezoneOffset() * 60) >= 60) time = new Date(Date.now() + (off + new Date().getTimezoneOffset() * 60) * 1000).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  } catch { /* ukjent tidssone */ }
  return { t, code, day: dayRaw == null ? null : !!dayRaw, hi, lo, pp: pp ?? 0, ppD: ppD ?? '', time };
}
function fromFull(f) {
  if (!f?.current) return null;
  const days = (f.days ?? []).map((x) => ({ date: x.date, hi: x.hi ?? x.max, lo: x.lo ?? x.min, precipProb: x.precipProb ?? 0 }));
  return normQ({ current: f.current, days, tz: f.timezone ?? f.tz ?? null });
}
let pwTimer = null;
async function loadAll(force) {
  if (!isDk() || !root()) return;
  const L = S.places ?? DEFP, key = L.map((p) => p.id).join(',');
  if (!force && S.pwKey === key && Date.now() - (S.pwAt || 0) < 6e5) return;
  S.pwKey = key; S.pwAt = Date.now();
  let got = null;
  try {
    const r = await api('/weather/places/summary');
    const arr = Array.isArray(r) ? r : r?.places ?? r?.items ?? r?.summary ?? null;
    if (Array.isArray(arr)) { got = {}; for (const x of arr) { const q = normQ(x); const id = x.id ?? x.placeId; if (q && id != null) got[id] = q; } }
    else if (r && typeof r === 'object') { got = {}; for (const [id, x] of Object.entries(r)) { const q = normQ(x); if (q) got[id] = q; } }
    if (got && !Object.keys(got).length) got = null;
  } catch { got = null; }
  if (!got) {
    got = {};
    await Promise.all(L.map(async (P) => { try { got[P.id] = fromFull(await api(`/weather/full?${!P.local ? `place=${encodeURIComponent(P.id)}` : `lat=${P.lat}&lon=${P.lon}&name=${encodeURIComponent(P.name)}`}`)); } catch { /* stedet vises uten vær */ } }));
  }
  S.pw = { ...(S.pw ?? {}), ...got };
  const side = root()?.querySelector('.wxp-side');
  if (side && isDk()) side.innerHTML = sideHtml();
  clearTimeout(pwTimer);
  pwTimer = setTimeout(() => { if (root()) loadAll(true); }, 6e5);
}

// Prompt 36: hoveddelen på PC: toppen sentrert, så et 5-kolonners rutenett (3 under 1100 px) der kortene i samme rad har lik høyde.
function dkHtml(d, P) {
  const C = d.current, D = d.daily, R = restParts(d), mine = P.id === 'pos' || P.mine;
  const kick = mine ? 'MIN POSISJON' : (P.region && P.region !== P.name ? P.region : P.country || 'Norge').toUpperCase();
  const arrow = mine ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3L3 10.5l7.5 2.5L13 21z"/></svg>' : '';
  const c = (cls, inner) => `<div class="wx36-c ${cls}">${inner}</div>`;
  return `<div class="wx36-hero" style="opacity:${Math.max(0, 1 - S.sc / 220).toFixed(2)}"><span class="wx36-k">${arrow}${esc(kick)}</span><span class="wx36-city">${esc(P.name)}</span><span class="wx36-temp">${r0(C.temperature_2m)}</span><span class="wx36-desc">${esc(DESC(C.weather_code))}</span><span class="wx36-hl">H:${r0(D.temperature_2m_max[1])}  L:${r0(D.temperature_2m_min[1])}</span></div>
    <div class="wx36-grid">${c('s5 forhold', forholdHtml(d))}${c('s2 r2 days', daysHtml(d))}${c('s2 map', mapCardHtml())}${c('s1', R.sun)}${c('s2', R.moon)}${c('s1', R.uv)}${c('s2', cmpCardHtml(d))}${c('s1', R.feel)}${c('s1', R.yd)}${c('s1', R.rain)}${c('s1', R.vis)}${c('s1', R.hum)}${c('s1', R.pres)}${c('s2', R.wind)}</div>
    ${weekCardHtml(P)}
    <div class="wx36-foot"><b>Vær for ${esc(P.name)}</b><span class="wxp-sidesrc">${esc(S.src)}</span><a href="${esc(S.full?.yrUrl ?? 'https://www.yr.no/')}" target="_blank" rel="noopener">Se også yr.no ↗</a></div>`;
}

function mainHtml() {
  const d = S.d, P = place();
  if (!d) return `<div class="wxp-hero"><span class="wxp-city">${esc(P.name)}</span><span class="wxp-desc">${esc(S.src === 'Henter …' ? 'Henter været …' : 'Fikk ikke hentet været')}</span>${S.src === 'Henter …' ? '' : '<button class="wxp-pill" data-wx="retry">Prøv igjen</button>'}</div>`;
  const credit = `<a class="wxp-credit" href="${esc(S.full?.yrUrl ?? 'https://www.yr.no/')}" target="_blank" rel="noopener">${esc(S.full?.credit ?? 'Data: MET Norway')} · Se også yr.no ↗</a>`;
  if (isDk()) return dkHtml(d, P);
  return `${heroHtml(d, P)}<div class="wxp-cols"><div class="wxp-col">${forholdHtml(d)}${daysHtml(d)}${cmpCardHtml(d)}</div><div class="wxp-col">${restHtml(d)}</div></div>${weekCardHtml(P)}${credit}`;
}

/* ---------- Prompt 39: «Glimt · ukas vær» nederst (claude-code-vaer-glimt-ukas-vaer.md, GET /api/weather/week-summary) ---------- */
const WK_CH = [['sky', 'Sky', 'den rolige'], ['ugle', 'Ugle', 'tallknuseren'], ['spire', 'Spire', 'ut og lek']];
function loadWeek(P = place(), ch) {
  const key = `${P.id}|${ch ?? S.wkCh ?? ''}`;
  if (S.wkKey === key && (S.wk || S.wkBusy)) return;
  S.wkKey = key; S.wkBusy = true; S.wkErr = '';
  const q = !P.local && P.id !== 'pos' ? `place=${encodeURIComponent(P.name)}` : `place=${P.lat},${P.lon}`;
  api(`/weather/week-summary?${q}${ch ? `&char=${ch}` : ''}`).then((r) => { if (S.wkKey !== key) return; S.wk = r; S.wkCh = r?.char ?? ch ?? 'sky'; }).catch((e) => { if (S.wkKey === key) { S.wk = null; S.wkErr = e.status === 404 ? 'none' : e.message; } })
    .finally(() => { if (S.wkKey === key) { S.wkBusy = false; paintMain(); } });
}
function weekCardHtml(P) {
  if (!S.wk && !S.wkBusy && S.wkKey !== `${P.id}|${S.wkCh ?? ''}`) queueMicrotask(() => loadWeek(P));
  if (S.wkErr === 'none' || (!S.wk && !S.wkBusy && S.wkErr)) return '';
  const w = S.wk, ch = S.wkCh ?? w?.char ?? 'sky';
  const tiles = w?.tiles ?? [], hl = w?.highlights ?? [];
  return `<section class="wk39" aria-label="Glimt · ukas vær"><div class="wk39-h"><span class="wk39-k">✦ GLIMT · UKAS VÆR</span><span class="wk39-chs" role="radiogroup" aria-label="Personlighet">${WK_CH.map(([id, n, d]) => `<button type="button" role="radio" aria-checked="${ch === id}" class="${ch === id ? 'on' : ''}" data-wx-wkc="${id}" title="${n} · ${d}">${fig(id, 26, ch === id ? 'talk' : 'idle')}<span>${n}</span></button>`).join('')}</span></div>
    <div class="wk39-b">${fig(ch, 54, S.wkBusy ? 'tenker' : 'talk')}<p>${w ? esc(w.text) : 'Glimt ser på uka …'}</p></div>
    ${tiles.length ? `<div class="wk39-t">${tiles.map((t) => `<span><span class="wk39-tl">${esc(t.label)}</span><b>${esc(t.value)}</b><span>${esc(t.sub ?? '')}</span></span>`).join('')}</div>` : ''}
    ${hl.length ? `<div class="wk39-r">${hl.map((x) => `<span><span>${esc(x.label)}</span><b>${esc(x.text)}</b></span>`).join('')}</div>` : ''}</section>`;
}
const cmpRow = (x) => `<div class="wxp-cg wxp-cgr"><b>${esc(x.d)}</b><span class="wxp-cc">${svgIc(x.yk, 22)}<span><b>${esc(x.yt)}</b><span>${esc(x.yp)}</span></span></span><span class="wxp-cc">${x.sk ? svgIc(x.sk, 22) : '<span style="width:22px"></span>'}<span><b>${esc(x.stt)}</b><span>${esc(x.sp)}</span></span></span><span class="wxp-df" style="background:${x.dbg}">${esc(x.df)}</span></div>`;

/* ---------------- Ark ---------------- */
const sheet = (inner, kind) => `<div class="wxp-scrim" data-wx-close="${kind}"><div class="wxp-sheet" role="dialog" aria-modal="true">${inner}</div></div>`;
const xBtn = (kind) => `<button class="wxp-x" data-wx-close="${kind}" aria-label="Lukk">×</button>`;
const doneBtn = (kind) => sheetBtn('Ferdig', `data-wx-close="${kind}"`, 'pri');
// Logoer (SERVER30 legger dem i /assets/brands/, beskåret til sirkelen). Hentes aldri fra nettet.
const LOGO = (k, sz) => `<img class="wxp-logo" src="/assets/brands/${k}.png" alt="${k === 'yr' ? 'Yr' : 'Storm'}" width="${sz}" height="${sz}" style="width:${sz}px;height:${sz}px">`;

function forholdSheet(d) {
  const D = d.daily, H = d.hourly, di = S.sh, st = di * 24, W = 300, HT = 170, nowI = nowIndex(H);
  const src = S.feel ? H.apparent_temperature : H.temperature_2m, v = src.slice(st, st + 24);
  if (v.length < 24) return '';
  const mn = Math.min(...v), mx = Math.max(...v), ylo = Math.floor((mn - 2) / 3) * 3, yhi = Math.ceil((mx + 2) / 3) * 3, X = (i) => (i / 23) * W, Y = (t) => HT - ((t - ylo) / (yhi - ylo)) * HT;
  const pts = v.map((t, i) => [X(i), Y(t)]), cut = di === 1 ? Math.min(23, Math.max(0, nowI - st)) : di < 1 ? 23 : 0;
  const line = (a) => a.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
  const iH = v.indexOf(mx), iL = v.indexOf(mn), dt = new Date(`${D.time[di]}T12:00`), pps = H.precipitation_probability.slice(st, st + 24);
  const grid = []; for (let t = ylo; t <= yhi; t += 3) grid.push(`<line x1="0" y1="${Y(t).toFixed(1)}" x2="300" y2="${Y(t).toFixed(1)}" stroke="#2c3038" stroke-width="1"/><text x="306" y="${(Y(t) + 4).toFixed(1)}" fill="#9aa0aa" font-size="11" font-weight="700">${t}°</text>`);
  const I = ic(D.weather_code[di], false);
  const xt = [0, 6, 12, 18].map((h) => `<text x="${(X(h) + 2).toFixed(1)}" y="188" fill="#9aa0aa" font-size="12" font-weight="700">${pad2(h)}</text>`).join('');
  const marks = [[iH, 'H'], [iL, 'L']].map(([i, t]) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v[i]).toFixed(1)}" r="4.5" fill="#fff" stroke="#17191e" stroke-width="2.5"/><text x="${X(i).toFixed(1)}" y="${(Y(v[i]) - 10).toFixed(1)}" fill="#c7ccd4" font-size="12" font-weight="800" text-anchor="middle">${t}</text>`).join('');
  const icons = Array.from({ length: 12 }, (_, k) => { const h = k * 2, J = ic(H.weather_code[st + h], !H.is_day[st + h]); return svgIc(J.k, 20, 1.8, ' style="justify-self:center"'); }).join('');
  const days = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => i < D.time.length).map((i) => { const x = new Date(`${D.time[i]}T12:00`), on = i === di; return `<button data-wx-shd="${i}"><span>${WL[x.getDay()]}</span><span class="wxp-dot${on ? ' on' : ''}${i === 0 && !on ? ' past' : ''}">${x.getDate()}</span></button>`; }).join('');
  return sheet(`<div class="wxp-sh3"><span></span><b>Forhold</b>${xBtn('sh')}</div>
    <div class="wxp-dsel n8">${days}</div>
    <div class="wxp-date">${esc(dt.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, (m) => m.toUpperCase()))}</div>
    <div class="wxp-shtop"><div><div class="wxp-shbig"><b>${di === 1 ? r0(d.current.temperature_2m) : r0(D.temperature_2m_max[di])}</b>${svgIc(I.k, 34)}</div><span>H:${r0(D.temperature_2m_max[di])} L:${r0(D.temperature_2m_min[di])}</span></div><span class="wxp-mut">${esc(DESC(D.weather_code[di]))}</span></div>
    <div class="wxp-chart"><div class="wxp-icons12">${icons}</div>
      <svg viewBox="0 0 336 196"><defs><linearGradient id="vgA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ec8d8" stop-opacity=".55"/><stop offset="1" stop-color="#2b6ea8" stop-opacity=".35"/></linearGradient></defs>${grid.join('')}
      <path d="${line(pts)} L${W} ${HT} L0 ${HT} Z" fill="url(#vgA)"/>${cut > 0 ? `<path d="${line(pts.slice(0, cut + 1))}" fill="none" stroke="#5ec8d8" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round"/>` : ''}
      <path d="${line(pts.slice(cut))}" fill="none" stroke="#5ec8d8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="${X(cut).toFixed(1)}" y1="0" x2="${X(cut).toFixed(1)}" y2="170" stroke="#9aa0aa" stroke-width="1" stroke-dasharray="${di === 1 ? '3 3' : '0 999'}"/>${marks}${xt}</svg></div>
    <div class="wxp-seg">${[['Faktisk', false], ['Føles som', true]].map(([n, f]) => `<button data-wx-feel="${f ? 1 : 0}" class="${S.feel === f ? 'on' : ''}">${n}</button>`).join('')}</div>
    <span class="wxp-mut" style="padding:0 6px">${S.feel ? 'Hvordan temperaturen føles med vind og fuktighet.' : 'Den faktiske temperaturen.'}</span>
    <div style="padding-top:8px"><b class="wxp-h2">Sjanse for nedbør</b><span class="wxp-mut">Dagens sjanse: ${Math.round(D.precipitation_probability_max[di] || 0)} %</span></div>
    <svg viewBox="0 0 336 150" class="wxp-ppchart">${[0, 25, 50, 75, 100].map((q) => `<line x1="0" y1="${(130 - (q / 100) * 124).toFixed(1)}" x2="300" y2="${(130 - (q / 100) * 124).toFixed(1)}" stroke="#2c3038" stroke-width="1"/><text x="306" y="${(134 - (q / 100) * 124).toFixed(1)}" fill="#9aa0aa" font-size="11" font-weight="700">${q} %</text>`).join('')}
      ${pps.map((q, i) => { const h = Math.max(1, (q / 100) * 124); return `<rect x="${(X(i) - 4.5).toFixed(1)}" y="${(130 - h).toFixed(1)}" width="9" height="${h.toFixed(1)}" rx="2" fill="${di === 1 && i < cut ? '#3a5d74' : '#5ec8f2'}"/>`; }).join('')}
      ${[0, 6, 12, 18].map((h) => `<text x="${(X(h) + 2).toFixed(1)}" y="146" fill="#9aa0aa" font-size="12" font-weight="700">${pad2(h)}</text>`).join('')}</svg>`, 'sh');
}

const MS = {
  uv: { t: 'UV-indeks', ty: 'bar', key: 'uv_index', c: (x) => (x < 3 ? '#6fdc8c' : x < 6 ? '#ffd34d' : x < 8 ? '#ff9a3d' : x < 11 ? '#f2555a' : '#b36bff'), fmt: (x) => String(Math.round(x)), lvl: (x) => (x < 3 ? 'Lav' : x < 6 ? 'Moderat' : x < 8 ? 'Høy' : x < 11 ? 'Svært høy' : 'Ekstrem'), about: 'UV-indeksen måler styrken på solens ultrafiolette stråling. Fra 3 og oppover bør du bruke solkrem, solbriller og skygge midt på dagen. Verdien er beregnet for skyfri himmel.', scale: [['0–2', 'Lav', '#6fdc8c'], ['3–5', 'Moderat', '#ffd34d'], ['6–7', 'Høy', '#ff9a3d'], ['8–10', 'Svært høy', '#f2555a'], ['11+', 'Ekstrem', '#b36bff']], min: 0, maxF: 11 },
  feel: { t: 'Føles som', ty: 'line', key: 'apparent_temperature', key2: 'temperature_2m', l2: 'Faktisk', fmt: (x) => `${Math.round(x)}°`, about: '«Føles som» tar med vindens nedkjølende effekt (vindavkjøling) og luftfuktighet. Kald vind gjør at det føles kaldere enn termometeret viser.' },
  yd: { t: 'Mot i går', ty: 'line', key: 'temperature_2m', prev: true, l2: 'Dagen før', fmt: (x) => `${Math.round(x)}°`, about: 'Sammenligner temperaturen time for time med dagen før. Den stiplede linjen er dagen før.' },
  rain: { t: 'Nedbør', ty: 'bar', key: 'precipitation', c: () => '#5ec8f2', fmt: (x) => `${f1(x)} mm`, pp: true, about: 'Viser forventet nedbørsmengde per time i millimeter. Under 0,5 mm per time er lett regn, over 4 mm er kraftig regn. Prosenten er sannsynligheten for nedbør.', min: 0, maxF: 2 },
  vis: { t: 'Sikt', ty: 'line', key: 'visibility', div: 1000, fmt: (x) => `${x >= 10 ? Math.round(x) : f1(x)} km`, about: 'Sikt er hvor langt du kan se tydelig. Tåke, dis, nedbør og forurensning reduserer sikten. Over 10 km regnes som god sikt.', min: 0 },
  hum: { t: 'Luftfuktighet', ty: 'line', key: 'relative_humidity_2m', fmt: (x) => `${Math.round(x)} %`, about: 'Relativ luftfuktighet er hvor mye vanndamp luften inneholder, sammenlignet med det maksimale ved samme temperatur. Duggpunktet er temperaturen der dugg eller tåke dannes.', min: 0, max: 100 },
  pres: { t: 'Lufttrykk', ty: 'line', key: 'pressure_msl', fmt: (x) => `${Math.round(x).toLocaleString('nb-NO')} hPa`, about: 'Lufttrykket er redusert til havnivå. Stigende trykk betyr ofte bedre vær, synkende trykk kan bety at lavtrykk og nedbør er på vei. Normalt er cirka 1013 hPa.' },
  wind: { t: 'Vind', ty: 'line', key: 'wind_speed_10m', key2: 'wind_gusts_10m', l2: 'Vindkast', fmt: (x) => `${f1(x)} m/s`, about: 'Gjennomsnittlig vind i 10 meters høyde. Vindkast er de sterkeste kortvarige vindstøtene. Over 10,8 m/s er liten kuling, over 20,8 m/s er sterk kuling.', min: 0 },
  sun: { t: 'Sol', ty: 'list', about: 'Soloppgang og solnedgang for valgt sted. Dagslengden er tiden mellom soloppgang og solnedgang.' },
  moon: { t: 'Månen', ty: 'list', about: 'Månefasen gjentas hver 29,5 dag. Belyst andel er hvor stor del av månen som er opplyst sett fra jorda.' },
};

function metricSheet(d) {
  const K = S.ms, M = MS[K], H = d.hourly, D = d.daily, di = S.msD ?? 1, st = di * 24, nowH = new Date().getHours(), isToday = di === 1;
  const ser = (key, off = 0) => Array.from({ length: 24 }, (_, i) => { const v = H[key]?.[st - off + i]; return v == null ? null : M.div ? v / M.div : v; });
  const days = [1, 2, 3, 4, 5, 6, 7].filter((i) => i < D.time.length).map((i) => { const x = new Date(`${D.time[i]}T12:00`), on = i === di; return `<button data-wx-msd="${i}"><span>${WL[x.getDay()]}</span><span class="wxp-dot${on ? ' on' : ''}">${x.getDate()}</span></button>`; }).join('');
  const date = new Date(`${D.time[di]}T12:00`).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (m) => m.toUpperCase());
  const head = `<div class="wxp-sh3"><span></span><b>${esc(M.t)}</b>${xBtn('ms')}</div><div class="wxp-dsel n7">${days}</div><div class="wxp-date">${esc(date)}</div>`;
  const about = `<div class="wxp-about"><b>Om ${esc(M.t.toLowerCase() === 'månen' ? 'månen' : M.t)}</b><span>${esc(M.about)}</span></div>`;
  if (M.ty === 'list') {
    const len = (a, b) => { if (!a || !b) return '–'; const m = Math.round((new Date(b) - new Date(a)) / 6e4); return `${Math.floor(m / 60)} t ${m % 60} min`; };
    const idx = [1, 2, 3, 4, 5, 6, 7].filter((i) => i < D.time.length);
    if (K === 'sun') {
      const rows = idx.map((i, k) => `<button class="wxp-lrow${i === di ? ' on' : ''}" data-wx-msd="${i}"><b>${k ? WD[new Date(`${D.time[i]}T12:00`).getDay()] : 'I dag'}</b><span>↑ ${esc(hmS(D.sunrise[i]))}</span><span class="wxp-blue">↓ ${esc(hmS(D.sunset[i]))}</span><span class="wxp-mut">${esc(len(D.sunrise[i], D.sunset[i]))}</span></button>`).join('');
      return sheet(`${head}<div class="wxp-bigv"><b>${esc(hmS(D.sunrise[di]))} – ${esc(hmS(D.sunset[di]))}</b><span>Dagslengde ${esc(len(D.sunrise[di], D.sunset[di]))}</span></div><div class="wxp-list">${rows}</div>${about}`, 'ms');
    }
    const mOf = (i) => { const sv = D.moon?.[i]; return sv?.name ? { name: sv.name, ill: (sv.illum ?? 0) / 100 } : moonAt(new Date(`${D.time[i]}T22:00`).getTime()); };
    const rows = idx.map((i, k) => { const p = mOf(i); return `<button class="wxp-lrow${i === di ? ' on' : ''}" data-wx-msd="${i}"><b>${k ? WD[new Date(`${D.time[i]}T12:00`).getDay()] : 'I dag'}</b><span>${esc(p.name)}</span><span class="wxp-blue">${Math.round(p.ill * 100)} %</span><span></span></button>`; }).join('');
    const p = mOf(di);
    return sheet(`${head}<div class="wxp-bigv"><b>${esc(p.name)}</b><span>Belyst ${Math.round(p.ill * 100)} %</span></div><div class="wxp-list">${rows}</div>${about}`, 'ms');
  }
  const vv = ser(M.key).map((x) => x ?? 0), v2 = M.prev ? ser(M.key, 24) : M.key2 ? ser(M.key2) : null;
  const all = [...vv, ...(v2 ?? [])].filter((x) => x != null), mn = Math.min(...all), mx = Math.max(...all);
  const lo = M.min != null ? M.min : Math.floor(mn - (mx - mn) * 0.15 - 0.5); let hi = M.max != null ? M.max : Math.max(lo + (M.maxF || 1), Math.ceil(mx + (mx - mn) * 0.15 + 0.5)); if (hi - lo < 1) hi = lo + 1;
  const W = 296, HT = 150, X = (i) => 4 + (i / 23) * (W - 8), Y = (x) => 8 + (1 - (x - lo) / (hi - lo)) * HT;
  const ln = (a) => a.map((x, i) => (x == null ? '' : `${i && a[i - 1] != null ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x).toFixed(1)}`)).join(' ');
  const strip = (s) => s.replace(/ (hPa|mm|m\/s|km)$/, '');
  const grid = [0, 1, 2, 3].map((q) => { const val = lo + ((hi - lo) * q) / 3; return `<line x1="0" y1="${Y(val).toFixed(1)}" x2="300" y2="${Y(val).toFixed(1)}" stroke="#2c3038" stroke-width="1"/><text x="306" y="${(Y(val) + 4).toFixed(1)}" fill="#9aa0aa" font-size="11" font-weight="700">${esc(strip(M.fmt(val)))}</text>`; }).join('');
  const curI = isToday ? nowH : 12, cur = vv[curI], imx = vv.indexOf(Math.max(...vv)), imn = vv.indexOf(Math.min(...vv));
  const bars = M.ty === 'bar' ? vv.map((x, i) => { const h = Math.max(1.5, ((x - lo) / (hi - lo)) * HT); return `<rect x="${(X(i) - 4.5).toFixed(1)}" y="${(8 + HT - h).toFixed(1)}" width="9" height="${h.toFixed(1)}" rx="2" fill="${isToday && i < nowH ? 'rgba(255,255,255,.25)' : M.c ? M.c(x) : '#5ec8f2'}"/>`; }).join('') : '';
  const pps = M.pp ? ser('precipitation_probability') : null;
  const big = isToday ? M.fmt(cur) : M.fmt(Math.max(...vv));
  const sub = `${M.lvl ? `${M.lvl(isToday ? cur : Math.max(...vv))} · ` : ''}${isToday ? 'Nå' : 'Høyest'} · maks ${M.fmt(vv[imx])} kl. ${pad2(imx)}${M.ty === 'line' ? ` · min ${M.fmt(vv[imn])}` : ''}${pps ? ` · ${Math.round(Math.max(...pps.map((x) => x ?? 0)))} % sjanse` : ''}`;
  const line = M.ty === 'line' ? `<path d="${ln(vv)} L${X(23).toFixed(1)} ${8 + HT} L${X(0).toFixed(1)} ${8 + HT} Z" fill="rgba(94,200,242,.14)"/>${v2 ? `<path d="${ln(v2)}" fill="none" stroke="#9aa0aa" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>` : ''}<path d="${ln(vv)}" fill="none" stroke="#5ec8f2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  const nowM = isToday ? `<line x1="${X(nowH).toFixed(1)}" x2="${X(nowH).toFixed(1)}" y1="8" y2="158" stroke="rgba(255,255,255,.35)" stroke-width="1"/><circle cx="${X(nowH).toFixed(1)}" cy="${(cur != null ? Y(cur) : 0).toFixed(1)}" r="5" fill="#fff" stroke="#17191e" stroke-width="2.5"/>` : '';
  const xt = [0, 6, 12, 18].map((h) => `<text x="${X(h).toFixed(1)}" y="176" fill="#9aa0aa" font-size="12" font-weight="700">${pad2(h)}</text>`).join('');
  const ppRow = pps ? `<div class="wxp-pprow" aria-label="Sannsynlighet for nedbør per time">${pps.map((q, i) => (i % 3 ? '' : `<span>${pad2(i)}<b>${Math.round(q ?? 0)} %</b></span>`)).join('')}</div>` : '';
  const legend = v2 ? `<div class="wxp-legend"><span><i class="ln"></i>${esc(M.t)}</span><span><i class="dash"></i>${esc(M.l2)}</span></div>` : '';
  const scale = M.scale ? `<div class="wxp-scale"><b>Skala</b><div class="wxp-sbar">${M.scale.map(([, , c]) => `<span style="background:${c}"></span>`).join('')}</div><div class="wxp-sgrid">${M.scale.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join('')}</div></div>` : '';
  return sheet(`${head}<div class="wxp-bigv"><b>${esc(big)}</b><span>${esc(sub)}</span></div>
    <div class="wxp-chart"><svg viewBox="0 0 336 182">${grid}${bars}${line}${nowM}${xt}</svg>${legend}${ppRow}</div>${scale}${about}`, 'ms');
}

// Prompt 39: Yr mot Storm 2a (himmel + glasskort, duell, enighet, Glimt forklarer) med wiggle-redigering (weather-cmp39.js).
function cmpSheet(d) {
  const cmp = cmpVals(d, nowIndex(d.hourly)), P = place();
  return cmp39Html(cmp, { P, busy: S.cmpBusy, err: S.cmpErr, LOGO, svgIc, cmpRow, done: doneBtn('cmp'), yrUrl: S.full?.yrUrl, upd: S.full?.updatedAt ?? S.d?.updatedAt ?? null });
}
function placesSheet() {
  const L = S.places ?? DEFP, res = S.plRes ?? [];
  const resHtml = res.length ? `<div class="wxp-box wxp-res">${res.map((r, i) => { const have = L.find((x) => Math.abs(x.lat - r.lat) < 0.05 && Math.abs(x.lon - r.lon) < 0.05); return `<button data-wx-res="${i}"${i ? ' class="bt"' : ''}><span><b>${esc(r.name)}</b><span class="wxp-mut">${esc(r.sub || [r.region, r.country].filter(Boolean).join(', '))}</span></span><span class="${have ? 'wxp-mut' : 'wxp-blue2'}">${have ? 'Vis' : '+ Legg til'}</span></button>`; }).join('')}</div>` : '';
  const list = L.map((P) => `<div class="wxp-pl${S.drag === P.id ? ' drag' : ''}${S.swOpen === P.id ? ' sw' : ''}" data-pl="${esc(P.id)}"><button class="wxp-pldel" data-wx-del="${esc(P.id)}" tabindex="${S.swOpen === P.id ? 0 : -1}">Slett</button><div class="wxp-plrow${P.id === place().id ? ' cur' : ''}" style="transform:translateX(${S.swOpen === P.id ? 96 : 0}px)" role="button" tabindex="0" data-wx-pl="${esc(P.id)}"><span><b>${esc(P.name)}</b><span>${esc(P.region ?? '')}</span></span><span class="wxp-grip" aria-hidden="true">≡</span></div></div>`).join('');
  return sheet(`<div class="wxp-shh"><b class="wxp-h1">Steder</b>${doneBtn('pl')}</div>
    <form class="wxp-search${S.plQ ? ' has' : ''}" data-wx-search data-sf><span class="sf-ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9aa3ae" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>${clearBtn()}<input name="q" value="${esc(S.plQ)}" placeholder="Søk etter by eller sted" autocomplete="off" aria-label="Søk etter sted"></form>
    <div data-wx-resbox>${S.plBusy ? '<span class="wxp-mut">Søker …</span>' : ''}${resHtml}${S.plRes && !res.length && !S.plBusy ? `<span class="wxp-mut">${S.plErr ? 'Får ikke søkt nå. Prøv igjen.' : `Fant ingen steder som heter «${esc(S.plQ.trim())}»`}</span>` : ''}</div>
    <span class="wxp-cap">MINE STEDER</span>
    <div class="wxp-pls" data-wx-pls>${list}</div>
    <span class="wxp-mut" style="font-size:12px;padding:0 4px">Hold inne for å flytte · sveip mot høyre for å slette</span>
    <span class="wxp-mut" style="font-size:12px;line-height:1.45">Værdata fra Meteorologisk institutt (yr.no, api.met.no). Stedssøk via Open-Meteo og OpenStreetMap.${S.placesOk ? '' : ' Stedene lagres i denne nettleseren.'}</span>`, 'pl');
}

const LAYERS = [['rain', 'Nedbør'], ['temp', 'Temperatur'], ['wind', 'Vind'], ['clouds', 'Skyer']];
function mapOverlay() {
  const P = place(), src = mapSrc(P);
  return `<div class="wxp-map" role="dialog" aria-label="Værkart"><iframe src="${esc(src)}" title="Værkart for ${esc(P.name)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
    <div class="wxp-maptop"><button class="wxp-glass" data-wx-close="mp">Ferdig</button><b>${esc(P.name)}</b><span style="width:72px"></span></div>
    <div class="wxp-mapbot"><div class="wxp-layers" role="tablist">${LAYERS.map(([k, n]) => `<button role="tab" aria-selected="${S.mpL === k}" class="${S.mpL === k ? 'on' : ''}" data-wx-layer="${k}">${n}</button>`).join('')}</div></div></div>`;
}

function layerHtml() {
  if (S.mpOpen) return mapOverlay();
  if (S.plOpen) return placesSheet();
  if (!S.d) return '';
  if (S.cmpOpen) return cmpSheet(S.d);
  if (S.ms) return metricSheet(S.d);
  if (S.sh != null) return forholdSheet(S.d);
  return '';
}

/* ---------------- Tegning ---------------- */
function paintTop() {
  const r = root();
  if (!r) return;
  const P = place(), C = S.d?.current;
  r.querySelectorAll('.wxp-hsrc,.wxp-sidesrc').forEach((x) => { x.textContent = S.src; });
  const c = r.querySelector('.wxp-tc'), dk = isDk(), mine = P.id === 'pos' || P.mine;
  // Prompt 36 (PC): kompakt tittel «MIN POSISJON / Oslo / 5° | Delvis skyet» tones inn etter 170 px.
  c.innerHTML = `${dk ? `<span class="wx36-tk">${esc(mine ? 'MIN POSISJON' : (P.region && P.region !== P.name ? P.region : P.country || 'Norge').toUpperCase())}</span>` : ''}<b>${esc(P.name)}</b><span>${C ? `${r0(C.temperature_2m)}${dk ? '  |  ' : ' | '}${esc(DESC(C.weather_code))}` : ''}</span>`;
  c.style.opacity = S.sc > (dk ? 170 : 200) ? 1 : 0;
  c.classList.toggle('in', S.sc > (dk ? 170 : 200));
}
function paintMain() {
  const r = root();
  if (!r) return;
  const sc = r.querySelector('.wxp-scroll'), top = sc.scrollTop;
  const dk = isDk();
  r.classList.toggle('dk', dk);
  r.classList.toggle('dk36', dk);
  sc.querySelector('.wxp-inner').innerHTML = mainHtml();
  sc.scrollTop = top;
  const side = r.querySelector('.wxp-side');
  if (side) side.innerHTML = dk ? sideHtml() : '';
  paintMap(r);
  const C = S.d?.current, night = C ? C.is_day === 0 : new Date().getHours() < 7 || new Date().getHours() >= 19;
  const code = C?.weather_code ?? 2;
  r.querySelector('.wxp-sky').style.background = skyOf(code, night);
  // Prompt 36: kortene får himmelfargen (--vcard) og valgt stedskort samme himmel som hovedvisningen (--vsky).
  r.style.setProperty('--vsky', skyOf(code, night));
  r.style.setProperty('--vcard', cardBgOf(code, night));
  const D = S.d?.daily, sunF = D ? sunFrac(D.sunrise?.[1], D.sunset?.[1]) : 0.5;
  fx?.set({ kind: kindOf(code, night), heavy: code === 65 || code === 82 || code >= 95, thunder: code >= 95, day: !night, sunF });
  paintTop();
}
function paintLayer() {
  const r = root();
  if (!r) return;
  const l = r.querySelector('.wxp-layer'), old = l.querySelector('.wxp-sheet,.wxp-cmpin'), top = old?.scrollTop ?? 0, same = l.dataset.k === layerKey();
  // Felles «dismiss»-hook: et ark/popup som lukkes (✕, Ferdig, trykk utenfor, Esc eller valg av sted) gir ett lett tikk.
  const was = l.dataset.k || '', next = layerKey();
  if (was && was !== next && !(was.startsWith('ms:') && next.startsWith('ms:'))) haptic(10);
  const a = document.activeElement, q = a?.name === 'q' && l.contains(a) ? a.selectionStart : null;
  l.innerHTML = layerHtml();
  l.dataset.k = layerKey();
  if (same) { const s = l.querySelector('.wxp-sheet,.wxp-cmpin'); if (s) s.scrollTop = top; }
  if (q != null) { const i = l.querySelector('input[name=q]'); i?.focus(); try { i?.setSelectionRange(q, q); } catch { /* */ } }
  document.body.classList.toggle('wxp-modal', !!l.firstElementChild);
}
const layerKey = () => (S.mpOpen ? 'mp' : S.plOpen ? 'pl' : S.cmpOpen ? 'cmp' : S.ms ? `ms:${S.ms}` : S.sh != null ? 'sh' : '');
function paint() { paintMain(); paintLayer(); }

/* ---------------- Animert bakgrunn: se weather-fx.js (prompt 28) ---------------- */

/* ---------------- Steder ---------------- */
let sqT = null, sqId = 0;
async function search(q) {
  q = (q || '').trim();
  if (q.length < 2) { S.plRes = null; S.plBusy = false; S.plErr = false; return paintRes(); }
  const id = ++sqId; S.plBusy = true; S.plErr = false; paintRes();
  try { const r = await searchPlaces(q); if (id !== sqId) return; S.plRes = r; }
  catch { if (id === sqId) { S.plRes = []; S.plErr = true; } }
  if (id === sqId) { S.plBusy = false; paintRes(); }
}
// Prompt 28: GET /api/weather/places?q= gir søketreff ({name, sub, …, source}). En eldre server svarer med de lagrede
// stedene (uten source/sub) og ignorerer q; da brukes /api/weather/search?q= som før.
export async function searchPlaces(q) {
  const norm = (x) => ({ ...x, name: x.name, lat: +x.lat, lon: +x.lon, sub: x.sub ?? [x.region, x.country].filter(Boolean).join(', ') });
  try {
    const r = await api(`/weather/places?q=${encodeURIComponent(q)}`), L = Array.isArray(r) ? r : r?.results ?? r?.items ?? null;
    if (Array.isArray(L) && L.every((x) => x && ('source' in x || 'sub' in x))) return L.slice(0, 10).map(norm);
  } catch (e) { if (e.status && e.status !== 404 && e.status !== 405) throw e; }
  const r = await api(`/weather/search?q=${encodeURIComponent(q)}`);
  return (Array.isArray(r) ? r : r?.results ?? []).slice(0, 10).map(norm);
}
function paintRes() { const r = root()?.querySelector('[data-wx-resbox]'); if (!r) return; const tmp = document.createElement('div'); tmp.innerHTML = placesSheet(); r.replaceWith(tmp.querySelector('[data-wx-resbox]')); }
function selectPlace(id) { setTimeout(() => loadAll(), 0); S.cur = id; lsSet('wx_city', id); S.plOpen = false; S.plQ = ''; S.plRes = null; S.sh = null; S.ms = null; S.cmp = null; paintLayer(); load(); }
async function addPlace(r) {
  const have = S.places.find((x) => Math.abs(x.lat - r.lat) < 0.05 && Math.abs(x.lon - r.lon) < 0.05);
  if (have) return selectPlace(have.id);
  const body = { name: r.name, lat: +r.lat, lon: +r.lon, region: r.region ?? String(r.sub ?? '').split(',')[0].trim(), ...(r.country ? { country: r.country } : {}) };
  if (S.placesOk) {
    try { const l = await api('/weather/places', { method: 'POST', json: body }); if (Array.isArray(l)) S.places = l; const n = S.places.find((x) => Math.abs(x.lat - body.lat) < 0.01 && Math.abs(x.lon - body.lon) < 0.01); return selectPlace(n?.id ?? S.places.at(-1).id); }
    catch (e) { if (e.status !== 404) { alert(e.message); return; } S.placesOk = false; }
  }
  const n = { ...body, id: `l${Date.now().toString(36)}`, local: true }; S.places = [...S.places, n]; savePlacesLocal(); selectPlace(n.id);
}
async function removePlace(id) {
  if ((S.places?.length ?? 0) <= 1) { S.swOpen = null; return paintLayer(); } // det siste stedet kan ikke slettes
  const was = place().id;
  S.places = S.places.filter((x) => x.id !== id); S.swOpen = null;
  if (S.placesOk) { try { const l = await api(`/weather/places/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (Array.isArray(l) && l.length) S.places = l; } catch (e) { if (e.status !== 404) alert(e.message); } }
  savePlacesLocal();
  try { navigator.vibrate?.(12); } catch { /* */ }
  if (was === id) { S.cur = S.places[0].id; lsSet('wx_city', S.cur); paintLayer(); return load(); }
  paintLayer();
}
async function saveOrder() {
  savePlacesLocal();
  if (S.placesOk) { try { await api('/weather/places/order', { method: 'PUT', json: { ids: S.places.map((x) => x.id) } }); } catch { /* beholdes lokalt til neste lasting */ } }
}
// Hold inne (0,45 s) og dra for å flytte, sveip mot høyre for å slette (> 60 px står åpen, > 60 % sletter).
function bindPlaces(layer) {
  let g = null;
  const noTap = () => { layer.dataset.noTap = '1'; setTimeout(() => { delete layer.dataset.noTap; }, 400); };
  // Etter «hold inne» skal fingeren flytte raden, ikke rulle arket.
  layer.addEventListener('touchmove', (e) => { if (S.drag) e.preventDefault(); }, { passive: false });
  layer.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.wxp-plrow'); if (!row || e.button > 0) return;
    const id = row.dataset.wxPl;
    g = { id, x: e.clientX, y: e.clientY, ax: null, moved: false, lp: false, base: S.swOpen === id ? 96 : 0, dx: 0, row };
    g.t = setTimeout(() => { if (!g || g.ax) return; g.lp = true; try { navigator.vibrate?.(15); } catch { /* */ } S.drag = id; S.swOpen = null; paintLayer(); }, 450);
  });
  layer.addEventListener('pointermove', (e) => {
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (S.drag) {
      e.preventDefault(); g.moved = true;
      const w = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-pl]'), to = w?.dataset.pl;
      if (!to || to === S.drag) return;
      const fi = S.places.findIndex((x) => x.id === S.drag), ti = S.places.findIndex((x) => x.id === to);
      if (fi < 0 || ti < 0) return;
      const [m] = S.places.splice(fi, 1); S.places.splice(ti, 0, m);
      try { navigator.vibrate?.(6); } catch { /* */ }
      return paintLayer();
    }
    if (g.ax == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { clearTimeout(g.t); g.ax = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; }
    if (g.ax === 'x') {
      g.moved = true; g.dx = Math.max(0, g.base + dx);
      const row = layer.querySelector(`.wxp-plrow[data-wx-pl="${CSS.escape(g.id)}"]`);
      if (row) { row.style.transition = 'none'; row.style.transform = `translateX(${g.dx}px)`; row.parentElement.classList.add('sw'); }
    }
  });
  const up = (e) => {
    if (!g) return;
    clearTimeout(g.t);
    const cur = g; g = null;
    if (S.drag) { S.drag = null; paintLayer(); saveOrder(); noTap(); return; }
    if (cur.ax === 'x') {
      noTap();
      const wdt = cur.row.parentElement?.offsetWidth || 320;
      if (cur.dx > wdt * 0.6) return removePlace(cur.id);
      S.swOpen = cur.dx > 60 ? cur.id : null; return paintLayer();
    }
    if (cur.lp) noTap();
    if (e.type === 'pointercancel') return;
  };
  layer.addEventListener('pointerup', up);
  layer.addEventListener('pointercancel', up);
  layer.addEventListener('contextmenu', (e) => { if (e.target.closest('.wxp-pl')) e.preventDefault(); });
}

/* ---------------- Hendelser ---------------- */
function bind(r) {
  const layer = r.querySelector('.wxp-layer');
  bindPlaces(layer);
  bindCmp39(layer, () => paintLayer());
  r.querySelector('.wxp-scroll').addEventListener('scroll', (e) => {
    const v = e.currentTarget.scrollTop;
    if (Math.abs(v - S.sc) < 8) return;
    S.sc = v;
    const h = r.querySelector('.wxp-hero:not(.dk),.wx36-hero'); if (h) h.style.opacity = Math.max(0, 1 - v / 220).toFixed(2);
    const lim = isDk() ? 170 : 200, tc = r.querySelector('.wxp-tc');
    tc.style.opacity = v > lim ? 1 : 0; tc.classList.toggle('in', v > lim); r.classList.toggle('wx36-scd', v > lim);
  }, { passive: true });
  r.addEventListener('click', (e) => {
    const t = e.target;
    if (layer.dataset.noTap) { delete layer.dataset.noTap; if (layer.contains(t)) return; }
    const b = t.closest('[data-wx],[data-wx-wkc],[data-wx-sh],[data-wx-shd],[data-wx-ms],[data-wx-msd],[data-wx-mode],[data-wx-feel],[data-wx-close],[data-wx-layer],[data-wx-pl],[data-wx-del],[data-wx-res]');
    if (!b) return;
    const ds = b.dataset;
    if (ds.wxClose) {
      if (b.classList.contains('wxp-scrim') && t !== b) return; // klikk inne i arket
      const k = ds.wxClose;
      if (k === 'sh') S.sh = null; if (k === 'ms') S.ms = null; if (k === 'cmp') { S.cmpOpen = false; cmp39Reset(); } if (k === 'mp') S.mpOpen = false;
      if (k === 'pl') { S.plOpen = false; S.plQ = ''; S.plRes = null; S.swOpen = null; }
      return paintLayer();
    }
    if (ds.wxWkc) { const ch = ds.wxWkc; haptic(8); S.wkCh = ch; S.wk = null; S.wkKey = ''; loadWeek(place(), ch); api('/weather/week-summary', { method: 'PUT', json: { char: ch } }).catch(() => {}); return paintMain(); }
    if (ds.wx === 'retry') return load();
    if (ds.wx === 'close') { haptic(10); location.hash = '#/dash'; return; }
    if (ds.wx === 'cmp') { S.cmpOpen = true; paintLayer(); if (!S.cmp && !S.cmpBusy) loadCmp(); return; }
    if (ds.wx === 'map') { S.mpOpen = true; return paintLayer(); }
    if (ds.wx === 'places') { S.plOpen = true; paintLayer(); r.querySelector('.wxp-search input')?.focus(); return; }
    if (ds.wxSh != null) { S.sh = +ds.wxSh; return paintLayer(); }
    if (ds.wxShd != null) { S.sh = +ds.wxShd; return paintLayer(); }
    if (ds.wxMs) { S.ms = ds.wxMs; S.msD = 1; return paintLayer(); }
    if (ds.wxMsd != null) { S.msD = +ds.wxMsd; return paintLayer(); }
    if (ds.wxMode) { S.mode = ds.wxMode; try { sessionStorage.setItem('wx_mode', S.mode); } catch { /* */ } return paintMain(); }
    if (ds.wxFeel != null) { S.feel = ds.wxFeel === '1'; return paintLayer(); }
    if (ds.wxLayer) { S.mpL = ds.wxLayer; paintLayer(); return paintMain(); }
    if (ds.wxDel) return removePlace(ds.wxDel);
    if (ds.wxPl) { if (S.swOpen) { S.swOpen = null; return paintLayer(); } return selectPlace(ds.wxPl); }
    if (ds.wxRes != null) { const x = S.plRes?.[+ds.wxRes]; if (x) addPlace(x); }
  });
  r.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (S.mpOpen || S.plOpen || S.cmpOpen || S.ms || S.sh != null) { S.mpOpen = S.plOpen = S.cmpOpen = false; S.ms = null; S.sh = null; S.plRes = null; S.plQ = ''; return paintLayer(); }
      location.hash = '#/dash';
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role=button][data-wx-ms],[role=button][data-wx-pl],[role=button][data-wx]')) { e.preventDefault(); e.target.click(); }
  });
  r.addEventListener('input', (e) => { if (e.target.name !== 'q') return; S.plQ = e.target.value; clearTimeout(sqT); sqT = setTimeout(() => search(S.plQ), 250); });
  r.addEventListener('submit', (e) => { if (!e.target.matches('[data-wx-search]')) return; e.preventDefault(); clearTimeout(sqT); search(S.plQ); });
}

/* ---------------- Rute ---------------- */
function tempPlace() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? ''), lat = +q.get('lat'), lon = +q.get('lon'), name = q.get('name');
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return null;
  const known = S.places?.find((p) => Math.abs(p.lat - lat) < 0.05 && Math.abs(p.lon - lon) < 0.05);
  if (known) return { ...known, temp: false, _known: true };
  return { id: `tmp:${lat.toFixed(3)},${lon.toFixed(3)}`, name, lat, lon, local: true, temp: true, region: q.get('region') || '', country: q.get('country') || '' };
}
export function render() {
  setTimeout(async () => {
    const r = root();
    if (!r || r.dataset.bound) return;
    r.dataset.bound = '1';
    fx?.stop();
    fx = createWxFx(r.querySelector('.wxp-fx'));
    bind(r);
    paint();
    // PC ↔ mobil når vinduet endrer bredde (app.js tegner bare på nytt ved mobilgrensen).
    let rzT = null, was = isDk();
    const onRz = () => { if (!root()) { window.removeEventListener('resize', onRz); return; } clearTimeout(rzT); rzT = setTimeout(() => { if (isDk() !== was) { was = isDk(); paint(); loadAll(); } }, 120); };
    window.addEventListener('resize', onRz);
    await loadPlaces();
    loadAll();
    // Prompt 35: «været i New York» i AI-søket åpner #/vaer?name=…&lat=…&lon=… – stedet legges midlertidig i lista (lagres ikke).
    const tp = tempPlace();
    if (tp) { if (!tp._known) S.places = [...S.places.filter((p) => !p.temp), tp]; S.cur = tp.id; }
    if (!S.places.some((p) => p.id === S.cur)) S.cur = S.places[0]?.id;
    load();
  });
  return `<div id="wxp" class="wxp sb-dark${isDk() ? ' dk' : ''}" aria-label="Vær">
    <div class="wxp-sky"></div><canvas class="wxp-fx" aria-hidden="true"></canvas>
    <aside class="wxp-side" aria-label="Steder"></aside>
    <div class="wxp-top"><span class="wxp-tsp"></span><div class="wxp-tc" aria-hidden="true"></div><button class="wxp-close" data-wx="close" aria-label="Lukk" title="Lukk"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="wxp-scroll"><div class="wxp-inner"></div></div>
    <nav class="wxp-bnav wxp-fab" aria-label="Vær"><button class="wxp-bb" data-wx="map" aria-label="Værkart" title="Værkart"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20"/></svg></button><span></span><button class="wxp-bb" data-wx="places" aria-label="Steder" title="Steder og søk"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></nav>
    <div class="wxp-layer"></div></div>`;
}
