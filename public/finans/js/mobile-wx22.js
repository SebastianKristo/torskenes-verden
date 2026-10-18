// Prompt 22 (mobil-PWA): værsiden etter design/Vaer.dc.html.
// Kartknapp nede til venstre (Windy i fullskjerm med lagene Nedbør · Temperatur · Vind · Skyer), ☰ nede til høyre
// (Steder: søk, legg til, hold inne og dra for å flytte, sveip mot høyre for å slette), animert værbakgrunn (canvas,
// maks 30 fps, stopper ved «Reduser bevegelse»), kortet «Yr og Pent» og detaljark for alle kortene.
// Data: /api/weather/full (med compare og timeverdier når serveren har dem), ellers /api/weather/compare som reserve.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { dragStart, dragging } from './mobile-p21.js';

export const WX2 = { map: false, layer: 'rain', pl: false, q: '', res: null, busy: false, err: '', ms: null, msD: 0, sw: null, open: null, lp: false };
const SYS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Roboto,system-ui,sans-serif";
export { SYS };
const WD = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'], WL = ['S', 'M', 'T', 'O', 'T', 'F', 'L'];
const f1 = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const dKey = (iso) => String(iso ?? '').slice(0, 10);
const hh = (iso) => { const s = String(iso ?? ''); return /T\d\d/.test(s) ? +s.slice(11, 13) : new Date(iso).getHours(); };
const hmS = (iso) => { if (!iso) return '–'; const s = String(iso); return /T\d\d:\d\d/.test(s) && !/Z|[+-]\d\d:?\d\d$/.test(s) ? s.slice(11, 16) : new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }); };
const ico = (d, size, col) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="${d}"/></svg>`;

/* ---------- Yr og Pent ---------- */

const num = (x) => (x == null ? null : typeof x === 'object' ? x.temp ?? x.t ?? null : +x);
function side(o) {
  if (!o) return null;
  return { code: o.code ?? o.icon ?? o.symbol ?? null, max: o.max ?? o.hi ?? null, min: o.min ?? o.lo ?? null, precip: o.precip ?? o.mm ?? o.precipSum ?? null };
}
/** Begge formatene: nytt (compare i /weather/full) og eldre (/weather/compare med yr/ecmwf, hi/lo/mm). */
export function normCmp(r) {
  if (!r || !Array.isArray(r.days)) return null;
  const days = r.days.map((d) => {
    const yr = side(d.yr), pent = side(d.pent ?? d.ecmwf ?? d.storm);
    const diff = d.diff ?? d.diffHi ?? (yr?.max != null && pent?.max != null ? yr.max - pent.max : null);
    return { date: dKey(d.date), yr, pent, diff: diff == null ? null : +diff };
  });
  const hours = (r.hours ?? []).map((h) => ({ t: h.time ?? h.t, yr: num(h.yr), pent: num(h.pent ?? h.ecmwf ?? h.storm) }));
  const ds = days.filter((d) => d.diff != null), avg = r.avgDiff ?? (ds.length ? ds.reduce((a, d) => a + Math.abs(d.diff), 0) / ds.length : 0);
  const ag = ['good', 'mid', 'bad'].includes(r.agreement) ? r.agreement : avg < 1.5 ? 'good' : avg < 3 ? 'mid' : 'bad';
  return { days, hours, agreement: ag, avgDiff: +avg, n: ds.length };
}
const AG = { good: ['#6fdc8c', () => 'Yr og Pent er enige'], mid: ['#ffb347', (a) => `Litt uenige · ${f1(a)}° i snitt`], bad: ['#f26b5e', (a) => `Uenige · ${f1(a)}° i snitt`] };
/** Pent-temperatur for en time (oransje under Yr i timeraden). */
export function pentAt(C, t) {
  if (!C) return null;
  const k = String(t).slice(0, 13), h = C.hours.find((x) => String(x.t).slice(0, 13) === k);
  return h?.pent ?? null;
}
export function cmpCard(C, D, { IC, ICC, kindOf, busy, err }) {
  const head = (c, t) => `<div class="w22-ch"><span class="w22-yp"><span style="background:#00b9f1">Yr</span><span style="background:#ff8a3d">P</span></span><span class="m-grow" style="min-width:0"><b>Yr og Pent</b><span class="w22-ag"><i style="background:${c}"></i>${esc(t)}</span></span></div>`;
  if (!C) return `<div class="vx-card w22-cmp">${head('#9aa3ae', err ? 'Pent svarte ikke' : 'Henter …')}${busy ? '<span class="w22-busy">Henter Pent …</span>' : ''}<button class="w22-more" data-p17="cmp"><span>Time for time og hele uka</span><span style="opacity:.7">›</span></button></div>`;
  const [c, t] = AG[C.agreement] ?? AG.good, mm = (v) => (v == null ? '–' : `${f1(v)} mm`), r = (v) => (v == null ? '–' : `${Math.round(v)}°`);
  const yCode = (date) => (D.days ?? []).find((d) => d.date === date)?.code;
  const ic = (code) => { const k = code == null ? 'cloudy' : kindOf(code); return ico(IC[k] ?? IC.cloudy, 22, ICC[k] ?? '#fff'); };
  const today = dKey(new Date().toLocaleDateString('sv-SE'));
  const rows = C.days.filter((d) => d.date >= today).slice(0, 4).map((d, k) => {
    const df = d.diff == null ? null : Math.round(d.diff), bg = df == null || Math.abs(df) < 2 ? 'rgba(255,255,255,.1)' : Math.abs(df) < 4 ? 'rgba(255,179,71,.3)' : 'rgba(242,107,94,.4)';
    return `<div class="w22-cr"><b>${k ? WD[new Date(d.date + 'T12:00').getDay()] : 'I dag'}</b>
      <span class="w22-cc">${ic(d.yr?.code ?? yCode(d.date))}<span><b>${r(d.yr?.max)} / ${r(d.yr?.min)}</b><small>${mm(d.yr?.precip)}</small></span></span>
      <span class="w22-cc">${ic(d.pent?.code ?? d.yr?.code ?? yCode(d.date))}<span><b>${r(d.pent?.max)} / ${r(d.pent?.min)}</b><small>${mm(d.pent?.precip)}</small></span></span>
      <span class="w22-df" style="background:${bg}">${df == null ? '–' : `${df > 0 ? '+' : ''}${df}°`}</span></div>`;
  }).join('');
  return `<div class="vx-card w22-cmp">${head(c, t(C.avgDiff))}<div class="w22-cr h"><span></span><span style="color:#7fd6f5">YR</span><span style="color:#ffb27a">PENT</span><span style="text-align:right">AVVIK</span></div>${rows}
    <button class="w22-more" data-p17="cmp"><span>Time for time og hele uka</span><span style="opacity:.7">›</span></button></div>`;
}

/* ---------- Knappene nederst og værkartet ---------- */

const MAPIC = 'M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20';
export const bottomBtns = () => `<div class="w22-bot"><button class="w22-rb" data-wx2="map" aria-label="Værkart" title="Værkart"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${MAPIC}"/></svg></button><span class="m-grow"></span>
  <button class="w22-rb" data-wx2="pl" aria-label="Steder" title="Steder og søk"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div>`;
const LAYERS = [['rain', 'Nedbør'], ['temp', 'Temperatur'], ['wind', 'Vind'], ['clouds', 'Skyer']];
export function mapView(P, city) {
  if (!WX2.map) return '';
  const la = (+P?.lat || 59.91).toFixed(3), lo = (+P?.lon || 10.75).toFixed(3);
  const src = `https://embed.windy.com/embed2.html?lat=${la}&lon=${lo}&detailLat=${la}&detailLon=${lo}&zoom=7&level=surface&overlay=${WX2.layer}&product=ecmwf&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=m%2Fs&metricTemp=%C2%B0C`;
  return `<div class="w22-map" role="dialog" aria-label="Værkart"><iframe src="${esc(src)}" title="Værkart" allowfullscreen></iframe>
    <div class="w22-mtop"><button data-wx2="mapx">Ferdig</button><b>${esc(city ?? '')}</b><span></span></div>
    <div class="w22-mlay"><div>${LAYERS.map(([k, n]) => `<button data-wx2="layer" data-k="${k}" aria-pressed="${WX2.layer === k}">${n}</button>`).join('')}</div></div></div>`;
}

/* ---------- Steder ---------- */

export function placesSheet(WX, plist) {
  if (!WX2.pl) return '';
  const L = plist(), res = WX2.res ?? [];
  const have = (r) => L.find(([, n, o]) => o && Math.abs(+o.lat - r.lat) < 0.05 && Math.abs(+o.lon - r.lon) < 0.05) ?? L.find(([, n]) => n === r.name && !L.some(([, , o]) => o));
  const resHtml = res.length ? `<div class="w22-res">${res.map((r, i) => { const h = have(r); return `<button data-wx2="pick" data-i="${i}"><span class="m-grow" style="min-width:0"><b>${esc(r.name)}</b><small>${esc([r.region, r.country].filter(Boolean).join(', '))}${r.lat != null ? ` · ${(+r.lat).toFixed(2)}, ${(+r.lon).toFixed(2)}` : ''}</small></span><span style="color:${h ? '#9aa3ae' : '#5ec8f2'}">${h ? 'Vis' : '+ Legg til'}</span></button>`; }).join('')}</div>` : '';
  const rows = L.map(([id, n, o]) => {
    const d = WX.d[id], open = WX2.open === id, sw = WX2.sw?.id === id ? WX2.sw.dx : null, dx = sw ?? (open ? 96 : 0);
    const sub = [o?.region, d?.current?.temp != null ? `${Math.round(d.current.temp)}°` : ''].filter(Boolean).join(' · ');
    return `<div class="w22-pl${WX.place === id ? ' on' : ''}" data-wpl="${esc(id)}"><button class="w22-del" data-wx2="rm" data-k="${esc(id)}" style="opacity:${dx > 0 ? 1 : 0}" tabindex="${dx > 0 ? 0 : -1}">Slett</button>
      <div class="w22-plin" data-wx2="sel" data-k="${esc(id)}" style="transform:translateX(${dx}px);transition:${sw != null ? 'none' : 'transform .2s ease-out'}"><span class="m-grow" style="min-width:0"><b>${esc(n)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="w22-hdl" aria-hidden="true">≡</span></div></div>`;
  }).join('');
  return `<div class="vx-shbg w22-bg" data-wx2="plx"></div><div class="vx-sh w22-sh" role="dialog" aria-label="Steder">
    <div class="w22-shh"><b>Steder</b><button class="w22-done" data-wx2="plx">Ferdig</button></div>
    <form class="w22-q" data-wx2form><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9aa3ae" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="w22-q" data-wx2q value="${esc(WX2.q)}" placeholder="Søk etter by eller sted" autocomplete="off" enterkeyhint="search" aria-label="Søk etter sted"></form>
    ${WX2.busy ? '<span class="w22-m">Søker …</span>' : ''}${WX2.err ? `<span class="w22-m">${esc(WX2.err)}</span>` : ''}${resHtml}${WX2.res && !res.length && !WX2.busy && !WX2.err ? '<span class="w22-m">Fant ingen steder.</span>' : ''}
    <span class="w22-lab">MINE STEDER</span><div class="w22-pls">${rows}</div>
    <span class="w22-m" style="padding:0 4px">Hold inne for å flytte · sveip mot høyre for å slette</span>
    <span class="w22-m" style="line-height:1.45">Værdata fra Meteorologisk institutt (yr.no, api.met.no). Stedssøk via Open-Meteo.</span></div>`;
}

/* ---------- Detaljark for kortene ---------- */

const META = {
  uv: { t: 'UV-indeks', ty: 'bar', k: (h) => h.uv ?? h.uvIndex, cur: (c) => c.uv, c: (x) => (x < 3 ? '#6fdc8c' : x < 6 ? '#ffd34d' : x < 8 ? '#ff9a3d' : x < 11 ? '#f2555a' : '#b36bff'), fmt: (x) => String(Math.round(x)), lvl: (x) => (x < 3 ? 'Lav' : x < 6 ? 'Moderat' : x < 8 ? 'Høy' : x < 11 ? 'Svært høy' : 'Ekstrem'), min: 0, maxF: 11,
    about: 'UV-indeksen måler styrken på solens ultrafiolette stråling. Fra 3 og oppover bør du bruke solkrem, solbriller og skygge midt på dagen. Verdien er beregnet for skyfri himmel.',
    scale: [['0–2', 'Lav', '#6fdc8c'], ['3–5', 'Moderat', '#ffd34d'], ['6–7', 'Høy', '#ff9a3d'], ['8–10', 'Svært høy', '#f2555a'], ['11+', 'Ekstrem', '#b36bff']] },
  feel: { t: 'Føles som', ty: 'line', k: (h) => h.feels ?? h.apparent, cur: (c) => c.feels, k2: (h) => h.temp, l2: 'Faktisk', fmt: (x) => `${Math.round(x)}°`, about: '«Føles som» tar med vindens nedkjølende effekt (vindavkjøling) og luftfuktighet. Kald vind gjør at det føles kaldere enn termometeret viser.' },
  yd: { t: 'Mot i går', ty: 'line', k: (h) => h.temp, cur: (c) => c.temp, prev: true, l2: 'Dagen før', fmt: (x) => `${Math.round(x)}°`, about: 'Sammenligner temperaturen time for time med dagen før. Den stiplede linjen er dagen før.' },
  rain: { t: 'Nedbør', ty: 'bar', k: (h) => h.precip ?? h.mm ?? 0, cur: (c) => c.precip, c: () => '#5ec8f2', fmt: (x) => `${f1(x)} mm`, pp: true, min: 0, maxF: 2, about: 'Viser forventet nedbørsmengde per time i millimeter. Under 0,5 mm per time er lett regn, over 4 mm er kraftig regn. Prosenten er sannsynligheten for nedbør.' },
  vis: { t: 'Sikt', ty: 'line', k: (h) => km(h.visibility), cur: (c) => km(c.visibility), fmt: (x) => `${x >= 10 ? Math.round(x) : f1(x)} km`, min: 0, about: 'Sikt er hvor langt du kan se tydelig. Tåke, dis, nedbør og forurensning reduserer sikten. Over 10 km regnes som god sikt.' },
  hum: { t: 'Luftfuktighet', ty: 'line', k: (h) => h.humidity, cur: (c) => c.humidity, fmt: (x) => `${Math.round(x)} %`, min: 0, max: 100, about: 'Relativ luftfuktighet er hvor mye vanndamp luften inneholder, sammenlignet med det maksimale ved samme temperatur. Duggpunktet er temperaturen der dugg eller tåke dannes.' },
  pres: { t: 'Lufttrykk', ty: 'line', k: (h) => h.pressure, cur: (c) => c.pressure, fmt: (x) => `${Math.round(x).toLocaleString('nb-NO')} hPa`, about: 'Lufttrykket er redusert til havnivå. Stigende trykk betyr ofte bedre vær, synkende trykk kan bety at lavtrykk og nedbør er på vei. Normalt er cirka 1013 hPa.' },
  wind: { t: 'Vind', ty: 'line', k: (h) => h.wind, cur: (c) => c.wind, k2: (h) => h.gust, l2: 'Vindkast', fmt: (x) => `${f1(x)} m/s`, min: 0, about: 'Gjennomsnittlig vind i 10 meters høyde. Vindkast er de sterkeste kortvarige vindstøtene. Over 10,8 m/s er liten kuling, over 20,8 m/s er sterk kuling.' },
  sun: { t: 'Sol', ty: 'list', about: 'Soloppgang og solnedgang for valgt sted. Dagslengden er tiden mellom soloppgang og solnedgang.' },
  moon: { t: 'Månen', ty: 'list', about: 'Månefasen gjentas hver 29,5 dag. Belyst andel er hvor stor del av månen som er opplyst sett fra jorda.' },
};
function km(v) { if (v == null || !Number.isFinite(+v)) return null; return +v > 100 ? +v / 1000 : +v; }
/** 24 verdier for en dato: timeverdiene fra serveren, hull fylt lineært (MET har 6-timers verdier lenger fram). */
function series(D, date, f) {
  const a = Array(24).fill(null);
  // Timedata fra MET for 7 dager (detail.days) når serveren har det, ellers timene i hours.
  const det = (D.detail?.days ?? []).find((d) => dKey(d.date) === date)?.hours;
  const src = det?.length ? det : [...(D.yesterday?.hours ?? []), ...(D.hours ?? [])];
  for (const h of src) { const t = h.t ?? h.time; if (dKey(t) === date) { const v = f(h); if (v != null && Number.isFinite(+v)) a[hh(t)] = +v; } }
  const idx = a.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  if (!idx.length) return null;
  for (let i = 0; i < 24; i++) {
    if (a[i] != null) continue;
    const lo = idx.filter((j) => j < i).pop(), hi = idx.find((j) => j > i);
    a[i] = lo == null ? a[hi] : hi == null ? a[lo] : a[lo] + ((a[hi] - a[lo]) * (i - lo)) / (hi - lo);
  }
  return a;
}
// Temperatur uten timeverdier: jevn kurve mellom lav (kl. 05) og høy (kl. 15).
const synth = (d) => (d && d.hi != null && d.lo != null ? Array.from({ length: 24 }, (_, i) => d.lo + (d.hi - d.lo) * ((Math.cos(((i - 15) / 24) * 2 * Math.PI) + 1) / 2)) : null);
const prevDate = (date) => { const x = new Date(date + 'T12:00'); x.setDate(x.getDate() - 1); return x.toLocaleDateString('sv-SE'); };
function moonPh(ms) { const age = ((ms / 864e5 - 6.8) % 29.53 + 29.53) % 29.53, ill = (1 - Math.cos((2 * Math.PI * age) / 29.53)) / 2; return [age, ill, age < 1.8 ? 'Nymåne' : age < 7.4 ? 'Voksende sigd' : age < 9.2 ? 'Første kvarter' : age < 14 ? 'Voksende måne' : age < 15.6 ? 'Fullmåne' : age < 21.2 ? 'Avtagende måne' : age < 23 ? 'Siste kvarter' : age < 27.7 ? 'Avtagende sigd' : 'Nymåne']; }
const dayLen = (a, b) => { if (!a || !b) return '–'; const mm = Math.round((new Date(b) - new Date(a)) / 6e4); return Number.isFinite(mm) ? `${Math.floor(mm / 60)} t ${mm % 60} min` : '–'; };

export function metricSheet(D) {
  const K = WX2.ms, M = META[K];
  if (!M || !D) return '';
  const SM = D.sunMoon ?? [], days = (D.days ?? []).slice(0, 7).map((x) => { const sm = SM.find((q) => dKey(q.date) === x.date); return sm ? { ...x, sunrise: sm.sunrise ?? x.sunrise, sunset: sm.sunset ?? x.sunset, moon: sm.moon ?? x.moon, daylight: sm.daylight } : x; });
  if (!days.length) return '';
  const di = Math.min(WX2.msD, days.length - 1), d = days[di], isToday = di === 0, nowH = new Date().getHours(), C = D.current ?? {};
  const picker = `<div class="w22-dp">${days.map((x, i) => { const t = new Date(x.date + 'T12:00'); return `<button data-wx2="msd" data-i="${i}" aria-pressed="${i === di}"><span>${WL[t.getDay()]}</span><b>${t.getDate()}</b></button>`; }).join('')}</div>`;
  const date = new Date(d.date + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (x) => x.toUpperCase());
  let body = '', big = '–', sub = '';
  if (M.ty === 'list') {
    const rows = days.map((x, i) => {
      const lbl = i ? WD[new Date(x.date + 'T12:00').getDay()] : 'I dag';
      if (K === 'sun') return [lbl, `↑ ${hmS(x.sunrise)}`, `↓ ${hmS(x.sunset)}`, dayLen(x.sunrise, x.sunset), i];
      const p = x.moon?.illum != null ? [0, x.moon.illum > 1 ? x.moon.illum / 100 : x.moon.illum, x.moon.name ?? moonPh(new Date(x.date + 'T22:00').getTime())[2]] : moonPh(new Date(x.date + 'T22:00').getTime());
      return [lbl, p[2], `${Math.round(p[1] * 100)} %`, '', i];
    });
    if (K === 'sun') { big = `${hmS(d.sunrise)} – ${hmS(d.sunset)}`; sub = `Dagslengde ${dayLen(d.sunrise, d.sunset)}`; }
    else { big = rows[di][1]; sub = `Belyst ${rows[di][2]}`; }
    body = `<div class="w22-list">${rows.map(([a, b, c, e, i]) => `<button data-wx2="msd" data-i="${i}" class="${i === di ? 'on' : ''}"><b>${esc(a)}</b><span>${esc(b)}</span><span style="color:#bfe6ff">${esc(c)}</span><span class="w22-e">${esc(e)}</span></button>`).join('')}</div>`;
  } else {
    let v = series(D, d.date, M.k);
    if (!v && (K === 'feel' || K === 'yd')) v = synth(d);
    if (!v && isToday && M.cur(C) != null) v = Array(24).fill(+M.cur(C));
    let v2 = M.k2 ? series(D, d.date, M.k2) : null;
    if (M.prev) { const pd = prevDate(d.date); v2 = series(D, pd, M.k) ?? synth(di ? days[di - 1] : D.yesterday); }
    if (K === 'feel' && !v2) v2 = synth(d);
    if (!v) body = `<div class="w22-m" style="padding:20px 0;text-align:center">Timedata for ${esc(M.t.toLowerCase())} mangler for denne dagen.</div>`;
    else {
      const pp = M.pp ? series(D, d.date, (h) => h.precipProb) : null;
      const all = [...v, ...(v2 ?? [])].filter((x) => x != null), mn = Math.min(...all), mx = Math.max(...all);
      let lo = M.min != null ? M.min : Math.floor(mn - (mx - mn) * 0.15 - 0.5), hi = M.max != null ? M.max : Math.max(lo + (M.maxF || 1), Math.ceil(mx + (mx - mn) * 0.15 + 0.5));
      if (hi - lo < 1) hi = lo + 1;
      const W = 296, HT = 150, X = (i) => 4 + (i / 23) * (W - 8), Y = (x) => 8 + (1 - (x - lo) / (hi - lo)) * HT;
      const ln = (a) => a.map((x, i) => (x == null ? '' : `${i && a[i - 1] != null ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x).toFixed(1)}`)).join(' ');
      const strip = (s) => s.replace(/ (hPa|mm|m\/s|km)$/, '');
      const grid = [0, 1, 2, 3].map((q) => { const val = lo + ((hi - lo) * q) / 3, y = Y(val); return `<line x1="0" y1="${y.toFixed(1)}" x2="300" y2="${y.toFixed(1)}" stroke="#2c3038" stroke-width="1"/><text x="306" y="${(y + 4).toFixed(1)}" fill="#9aa0aa" font-size="11" font-weight="700">${esc(strip(M.fmt(val)))}</text>`; }).join('');
      const cur = v[isToday ? nowH : 12], imx = v.indexOf(Math.max(...v)), imn = v.indexOf(Math.min(...v));
      const bars = M.ty === 'bar' ? v.map((x, i) => { const h = Math.max(1.5, ((x - lo) / (hi - lo)) * HT); return `<rect x="${(X(i) - 4.5).toFixed(1)}" y="${(8 + HT - h).toFixed(1)}" width="9" height="${h.toFixed(1)}" rx="2" fill="${isToday && i < nowH ? 'rgba(255,255,255,.25)' : M.c(x)}"/>`; }).join('') : '';
      const lines = M.ty === 'line' ? `<path d="${ln(v)} L${X(23).toFixed(1)} ${8 + HT} L${X(0).toFixed(1)} ${8 + HT} Z" fill="rgba(94,200,242,.14)"/>${v2 ? `<path d="${ln(v2)}" fill="none" stroke="#9aa0aa" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>` : ''}<path d="${ln(v)}" fill="none" stroke="#5ec8f2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : '';
      const now = isToday ? `<line x1="${X(nowH).toFixed(1)}" x2="${X(nowH).toFixed(1)}" y1="8" y2="158" stroke="rgba(255,255,255,.35)" stroke-width="1"/><circle cx="${X(nowH).toFixed(1)}" cy="${Y(cur).toFixed(1)}" r="5" fill="#fff" stroke="#17191e" stroke-width="2.5"/>` : '';
      const xt = [0, 6, 12, 18].map((h) => `<text x="${X(h).toFixed(1)}" y="176" fill="#9aa0aa" font-size="12" font-weight="700">${String(h).padStart(2, '0')}</text>`).join('');
      const ref = isToday ? cur : Math.max(...v);
      big = M.fmt(ref);
      sub = `${M.lvl ? `${M.lvl(ref)} · ` : ''}${isToday ? 'Nå' : 'Høyest'} · maks ${M.fmt(v[imx])} kl. ${String(imx).padStart(2, '0')}${M.ty === 'line' ? ` · min ${M.fmt(v[imn])}` : ''}${pp ? ` · ${Math.round(Math.max(...pp))} % sjanse` : ''}`;
      body = `<div class="w22-chart"><svg viewBox="0 0 336 182" aria-label="${esc(M.t)} gjennom dagen">${grid}${bars}${lines}${now}${xt}</svg>
        ${v2 ? `<div class="w22-l2"><span><i style="background:#5ec8f2"></i>${esc(M.t)}</span><span><i class="d"></i>${esc(M.l2)}</span></div>` : ''}</div>`;
    }
  }
  const scale = M.scale ? `<div class="w22-box"><b>Skala</b><div class="w22-scb">${M.scale.map(([, , c]) => `<span style="background:${c}"></span>`).join('')}</div><div class="w22-scl">${M.scale.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join('')}</div></div>` : '';
  return `<div class="vx-shbg" data-wx2="msx"></div><div class="vx-sh w22-ms" role="dialog" aria-label="${esc(M.t)}">
    <div class="vx-shtop"><span></span><b>${esc(M.t)}</b><button class="vx-x" data-wx2="msx" aria-label="Lukk">×</button></div>
    ${picker}<div class="vx-shdate">${esc(date)}</div>
    <div class="w22-big"><b>${esc(big)}</b><span>${esc(sub)}</span></div>
    ${body}${scale}<div class="w22-box"><b>Om ${esc(M.t.toLowerCase() === 'månen' ? 'månen' : M.t.toLowerCase())}</b><span>${esc(M.about)}</span></div></div>`;
}

/* ---------- Animert værbakgrunn ---------- */

const FX = { cv: null, k: null, heavy: false, thunder: false, raf: 0, t0: 0, last: 0, W: 0, H: 0, stars: [], drops: [], flakes: [], clouds: [], ro: null };
export function fxKind(kind, isDay, code) {
  const n = Number(code), heavy = n === 65 || n === 82 || n >= 95 || /heavy/.test(String(code)), thunder = kind === 'thunder';
  const k = kind === 'snow' ? 'snow' : kind === 'rain' || kind === 'thunder' ? 'rain' : kind === 'fog' ? 'fog' : kind === 'cloudy' ? 'clouds' : kind === 'night' ? 'stars' : kind === 'partly' ? (isDay ? 'part' : 'partn') : isDay ? 'sun' : 'stars';
  return { k, heavy, thunder };
}
const rnd = (a, b) => a + Math.random() * (b - a);
function fxSize() {
  const cv = FX.cv, r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), k = FX.k;
  FX.W = r.width; FX.H = r.height; cv.width = FX.W * dpr; cv.height = FX.H * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = FX.W, H = FX.H;
  FX.stars = Array.from({ length: Math.round((W * H) / 2600) }, () => ({ x: rnd(0, W), y: rnd(0, H * 0.75), r: rnd(0.4, 1.5), a: rnd(0.3, 1), s: rnd(0.5, 2), o: rnd(0, 6.28) }));
  FX.drops = Array.from({ length: FX.heavy ? 220 : 120 }, () => ({ x: rnd(-40, W), y: rnd(-H, H), l: rnd(10, 22), v: rnd(9, 15), a: rnd(0.12, 0.32) }));
  FX.flakes = Array.from({ length: 110 }, () => ({ x: rnd(0, W), y: rnd(-H, H), r: rnd(1, 3.2), v: rnd(0.5, 1.5), d: rnd(0, 6.28) }));
  const nC = ['clouds', 'rain', 'snow', 'fog'].includes(k) ? 9 : k === 'part' || k === 'partn' ? 4 : 0;
  // Delvis skyet: skyene er mer gjennomsiktige, så solen ikke vaskes ut.
  FX.clouds = Array.from({ length: nC }, (_, i) => ({ x: rnd(-0.2, 1.1) * W, y: rnd(0.02, k === 'part' || k === 'partn' ? 0.35 : 0.55) * H, w: rnd(0.45, 0.9) * W, h: rnd(0.08, 0.16) * H, v: rnd(0.04, 0.14) * (i % 2 ? 1 : -0.6), a: k === 'fog' ? rnd(0.18, 0.3) : k === 'rain' || k === 'snow' ? rnd(0.16, 0.3) : k === 'part' ? rnd(0.08, 0.16) : rnd(0.2, 0.34) }));
}
const reduced = () => matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function fxFrame(now) {
  FX.raf = 0;
  const cv = FX.cv;
  if (!cv?.isConnected || m.screen !== 'vaer') return;
  // Maks 30 fps, og pause når appen ikke er synlig.
  if (document.hidden) { FX.raf = setTimeout(() => requestAnimationFrame(fxFrame), 500); return; }
  if (now - FX.last < 33 && !reduced()) { FX.raf = requestAnimationFrame(fxFrame); return; }
  FX.last = now;
  const ctx = cv.getContext('2d'), W = FX.W, H = FX.H, k = FX.k, t = (now - FX.t0) / 1000;
  ctx.clearRect(0, 0, W, H);
  if (k === 'stars' || k === 'partn') { for (const s of FX.stars) { ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(t * s.s + s.o)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill(); } ctx.globalAlpha = 1; }
  if (k === 'sun' || k === 'part') {
    // Dempet sol (prompt 22): glorien skaleres etter korteste side (maks 560 px), omtrent halvert lysstyrke, øvre høyre hjørne.
    const mm = Math.min(W, H), cx = W * 0.72, cy = -mm * 0.02, R = Math.min(mm * 0.95, 560);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.07, 'rgba(255,252,236,.36)'); g.addColorStop(0.22, 'rgba(255,245,220,.1)'); g.addColorStop(0.55, 'rgba(255,255,255,.02)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const hr = mm * 0.5; ctx.lineWidth = mm * 0.03;
    [['rgba(255,120,120,.035)', 0], ['rgba(255,230,120,.035)', mm * 0.03], ['rgba(120,220,255,.04)', mm * 0.06]].forEach(([c, o]) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(cx, cy, hr + o, 0, 6.283); ctx.stroke(); });
    const sh = Math.sin(t * 0.4) * 0.05;
    [[0.2, 0.06], [0.3, 0.035], [0.38, 0.05]].forEach(([fy, fr]) => { const x = cx + (W * 0.5 - cx) * (fy * 2.2) + sh * W, y = cy + H * fy, gg = ctx.createRadialGradient(x, y, 0, x, y, W * fr); gg.addColorStop(0, 'rgba(255,255,255,.06)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, W * fr, 0, 6.283); ctx.fill(); });
  }
  const col = k === 'rain' || k === 'snow' ? '200,210,225' : k === 'partn' ? '150,165,195' : '255,255,255';
  for (const c of FX.clouds) {
    c.x += c.v; if (c.x > W * 1.2) c.x = -c.w; if (c.x < -c.w * 1.1) c.x = W * 1.1;
    for (let j = 0; j < 5; j++) { const x = c.x + c.w * (j / 4), y = c.y + Math.sin(j * 1.7) * c.h * 0.35, rr = c.h * (1.1 + ((j * 37) % 5) / 6), g = ctx.createRadialGradient(x, y, 0, x, y, rr * 1.6); g.addColorStop(0, `rgba(${col},${c.a})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rr * 1.9, rr * 1.2, 0, 0, 6.283); ctx.fill(); }
  }
  if (k === 'rain') {
    ctx.lineCap = 'round';
    for (const d of FX.drops) { d.y += d.v * 2; d.x += d.v * 0.24; if (d.y > H) { d.y = rnd(-60, -10); d.x = rnd(-40, W); } ctx.strokeStyle = `rgba(220,230,245,${d.a})`; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.12, d.y + d.l); ctx.stroke(); }
    if (FX.thunder && Math.sin(t * 0.7) > 0.995) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 0, W, H); }
  }
  if (k === 'snow') for (const f of FX.flakes) { f.y += f.v * 2; f.x += Math.sin(t + f.d) * 0.8; if (f.y > H) { f.y = -5; f.x = rnd(0, W); } ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill(); }
  if (k === 'fog') { const g = ctx.createLinearGradient(0, H * 0.2, 0, H); g.addColorStop(0, 'rgba(220,225,232,0)'); g.addColorStop(1, 'rgba(220,225,232,.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (!reduced()) FX.raf = requestAnimationFrame(fxFrame);
}
/** Etter hver tegning: flytt det faste canvas-elementet inn på plassen sin og start animasjonen ved nytt værslag. */
export function fxAfterDraw(fx) {
  const slot = document.getElementById('w22-fx');
  if (!slot || !fx) { if (FX.raf) { cancelAnimationFrame(FX.raf); clearTimeout(FX.raf); FX.raf = 0; } return; }
  if (!FX.cv) { FX.cv = document.createElement('canvas'); FX.cv.className = 'w22-cv'; FX.cv.setAttribute('aria-hidden', 'true'); FX.ro = new ResizeObserver(() => { if (FX.cv.isConnected) { fxSize(); if (reduced()) fxFrame(performance.now() + 1e5); } }); }
  if (FX.cv.parentNode !== slot) slot.appendChild(FX.cv);
  FX.ro.observe(FX.cv);
  const changed = fx.k !== FX.k || fx.heavy !== FX.heavy || fx.thunder !== FX.thunder;
  if (changed) { FX.k = fx.k; FX.heavy = fx.heavy; FX.thunder = fx.thunder; FX.t0 = performance.now(); fxSize(); }
  if (!FX.raf) { FX.last = 0; FX.raf = requestAnimationFrame(fxFrame); }
}

/* ---------- Hendelser ---------- */

let qT = null;
async function search(q) {
  q = String(q ?? '').trim();
  if (q.length < 2) { WX2.res = null; WX2.err = ''; draw(); return; }
  WX2.busy = true; draw();
  try { const r = await hlApi(`/weather/search?q=${encodeURIComponent(q)}`); WX2.res = Array.isArray(r) ? r : r?.items ?? r?.results ?? []; WX2.err = ''; }
  catch (e) { WX2.res = []; WX2.err = e.status === 404 ? 'Søk etter steder krever en nyere server.' : e.message; }
  WX2.busy = false; draw();
  const el = document.getElementById('w22-q'); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(el.value.length, el.value.length); } catch {} }
}
async function saveOrder(WX, ids) {
  const by = new Map((WX.places ?? []).map((p) => [p[0], p]));
  WX.places = ids.map((id) => by.get(id)).filter(Boolean);
  haptic('ok'); draw();
  if (!WX.fixed) await hlApi('/weather/places/order', { method: 'PUT', json: { ids } }).catch((e) => flash(e.status === 404 ? 'Rekkefølgen krever en nyere server' : e.message));
}

/* Hold inne (0,45 s) for å løfte raden og dra, sveip mot høyre for å vise «Slett» (60 % av bredden sletter med en gang). */
let pd = null;
export function wx22Down(e, ctx) {
  if (m.screen !== 'vaer' || !WX2.pl) return false;
  const row = e.target.closest?.('[data-wpl]');
  if (!row || e.target.closest('.w22-del') || (e.button ?? 0) > 0) return false;
  const id = row.dataset.wpl;
  pd = { id, x: e.clientX, y: e.clientY, ax: null, row, w: row.offsetWidth || 320, base: WX2.open === id ? 96 : 0, pid: e.pointerId };
  WX2.lp = false;
  pd.t = setTimeout(() => {
    if (!pd || pd.ax) return;
    WX2.lp = true; WX2.open = null; navigator.vibrate?.(15); haptic('tab');
    const el = document.querySelector(`[data-wpl="${CSS.escape(id)}"]`);
    if (el) { el.classList.add('lift'); dragStart(e, el, { sel: '[data-wpl]', attr: 'data-wpl', drop: (keys) => { pd = null; saveOrder(ctx.WX, keys); } }); }
  }, 450);
  return true;
}
export function wx22Move(e) {
  if (!pd || dragging() || (pd.pid != null && e.pointerId !== pd.pid)) return false;
  const dx = e.clientX - pd.x, dy = e.clientY - pd.y;
  if (pd.ax == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { clearTimeout(pd.t); pd.ax = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; }
  if (pd.ax !== 'x') return false;
  WX2.sw = { id: pd.id, dx: Math.max(0, pd.base + dx) };
  const inner = document.querySelector(`[data-wpl="${CSS.escape(pd.id)}"] .w22-plin`), del = inner?.previousElementSibling;
  if (inner) { inner.style.transition = 'none'; inner.style.transform = `translateX(${WX2.sw.dx}px)`; }
  if (del) del.style.opacity = WX2.sw.dx > 0 ? '1' : '0';
  if (e.cancelable) e.preventDefault();
  return true;
}
export async function wx22Up(e, ctx) {
  if (!pd) return false;
  clearTimeout(pd.t);
  const p = pd; pd = null;
  if (p.ax !== 'x' || !WX2.sw) return false;
  const dx = WX2.sw.dx; WX2.sw = null; WX2.swUp = Date.now();
  if (dx > p.w * 0.6 && e.type !== 'pointercancel') { navigator.vibrate?.(12); await removePlace(ctx, p.id); return true; }
  WX2.open = dx > 60 ? p.id : null; draw();
  return true;
}
async function removePlace({ WX, plist, wxLoad }, id) {
  const L = plist();
  WX2.open = null;
  if (L.length <= 1) { flash('Det siste stedet kan ikke slettes'); draw(); return; }
  WX.places = L.filter(([q]) => q !== id);
  if (WX.place === id) { WX.place = WX.places[0][0]; try { localStorage.setItem('fh_wx_place', WX.place); } catch {} }
  draw(); haptic('ok');
  if (!WX.fixed) await hlApi(`/weather/places/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((err) => flash(err.message));
  await wxLoad(); draw();
}

export async function wx22Bind(e, t, ctx) {
  if (m.screen !== 'vaer') return false;
  const { WX, plist, wxLoad, placesReload } = ctx;
  if (e.type === 'input' && t.matches?.('[data-wx2q]')) { WX2.q = t.value; clearTimeout(qT); qT = setTimeout(() => search(WX2.q), 300); return true; }
  if (e.type === 'submit' && t.matches?.('[data-wx2form]')) { e.preventDefault(); clearTimeout(qT); await search(WX2.q); return true; }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-wx2]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.wx2;
  if (k === 'sel' && (WX2.lp || Date.now() - (WX2.swUp ?? 0) < 350)) { WX2.lp = false; return true; }
  switch (k) {
    case 'map': WX2.map = true; haptic('tap'); break;
    case 'mapx': WX2.map = false; break;
    case 'layer': WX2.layer = x.dataset.k; haptic('tab'); break;
    case 'pl': WX2.pl = true; WX2.q = ''; WX2.res = null; WX2.err = ''; WX2.open = null; break;
    case 'plx': WX2.pl = false; WX2.open = null; break;
    case 'sel': {
      if (WX2.open) { WX2.open = null; break; }
      WX.place = x.dataset.k; try { localStorage.setItem('fh_wx_place', WX.place); } catch {}
      WX2.pl = false; WX.sh = null; WX2.ms = null; draw(); scrollTo(0, 0); await wxLoad(); break;
    }
    case 'rm': await removePlace(ctx, x.dataset.k); return true;
    case 'pick': {
      const r = WX2.res?.[+x.dataset.i]; if (!r) return true;
      const L = plist(), have = L.find(([, , o]) => o && Math.abs(+o.lat - r.lat) < 0.05 && Math.abs(+o.lon - r.lon) < 0.05);
      let id = have?.[0];
      if (!id) {
        try {
          const p = await hlApi('/weather/places', { method: 'POST', json: { name: r.name, lat: r.lat, lon: r.lon, region: r.region } });
          await placesReload();
          const list = Array.isArray(p) ? p : null;
          id = String(list?.find((q) => Math.abs(q.lat - r.lat) < 0.01 && Math.abs(q.lon - r.lon) < 0.01)?.id ?? p?.id ?? p?.place?.id ?? plist().find(([, n]) => n === r.name)?.[0] ?? WX.place);
          flash(`${r.name} er lagt til ✓`);
        } catch (err) { flash(err.message); return true; }
      }
      WX.place = id; try { localStorage.setItem('fh_wx_place', id); } catch {}
      WX2.pl = false; WX2.q = ''; WX2.res = null; draw(); scrollTo(0, 0); await wxLoad(); break;
    }
    case 'ms': WX2.ms = x.dataset.k; WX2.msD = 0; haptic('tap'); break;
    case 'msd': WX2.msD = +x.dataset.i; haptic('tab'); break;
    case 'msx': WX2.ms = null; break;
    default: return false;
  }
  draw(); return true;
}
