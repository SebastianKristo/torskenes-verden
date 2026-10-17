// Værmelding og Pakker i én karusell (Dashboard på PC og «Vær» på mobil).
// Karusellen tegnes én gang; bare innholdet i hvert lysbilde byttes ved oppdatering, så sveipeposisjonen beholdes.
import { esc, nb } from './util.js';
import { store, load, on } from './store.js';

const WI = {
  rain: 'M7 15a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.6 9 3.5 3.5 0 0 1 17 16H7zM8 19l-1 2M12 19l-1 2M16 19l-1 2',
  cloud: 'M7 18a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.6 12 3.5 3.5 0 0 1 17 19H7z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  part: 'M8 3v1M3.6 5.6l.7.7M2 10h1M12 7.3A4 4 0 0 0 5 9M8 20a4 4 0 1 1 .9-7.9A5 5 0 0 1 18.6 14 3.5 3.5 0 0 1 18 21H8z',
  snow: 'M7 15a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.6 9 3.5 3.5 0 0 1 17 16H7zM8 19h.01M12 21h.01M16 19h.01M10 22h.01M14 23h.01',
  thunder: 'M7 15a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.6 9 3.5 3.5 0 0 1 17 16H7zM13 16l-2 4h3l-2 3',
  fog: 'M7 12a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.6 6 3.5 3.5 0 0 1 17 13H7zM4 17h16M6 21h12',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  hum: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11zM9 14h6',
  uv: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2',
  gauge: 'M12 21a9 9 0 1 1 9-9M12 12l4-4',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  rise: 'M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4',
  set: 'M17 18a5 5 0 0 0-10 0M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
};
const svg = (k, size = 18, stroke = '#d7dbe4', w = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${WI[k] ?? WI.cloud}"/></svg>`;
const mm = (v) => (v ? nb(v, v < 10 ? 1 : 0) : '–');
const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '–');
const deg = (v) => (v == null ? '–' : `${v}°`);

const ui = { open: false, idx: 0 };

/* ---------- Værmelding ---------- */

function weatherStats(w) {
  return [
    ['wind', 'Vind', `${w.wind} m/s`, [w.windDirText, w.windGust != null ? `kast ${w.windGust}` : ''].filter(Boolean).join(', ')],
    ['drop', 'Nedbør', `${mm(w.precipNow ?? w.precip)} mm`, `Neste 24 t: ${mm(w.precip24)} mm`],
    ['hum', 'Fuktighet', w.humidity != null ? `${w.humidity} %` : '–', w.dew != null ? `Duggpunkt ${w.dew}°` : ''],
    ['uv', 'UV', w.uv ?? '–', w.uvText ?? ''],
    ['gauge', 'Lufttrykk', w.pressure != null ? `${w.pressure} hPa` : '–', w.pressureTrend ?? ''],
    ['eye', 'Sikt', w.visibility ?? '–', w.cloud != null ? `Skydekke ${w.cloud} %` : ''],
    ['rise', 'Soloppgang', hm(w.sunrise), w.dayLengthText ? `Lys i ${w.dayLengthText}` : ''],
    ['set', 'Solnedgang', hm(w.sunset), w.dusk ? `Mørkt fra ${hm(w.dusk)}` : ''],
  ];
}

export function weatherCard() {
  const w = store.data.weather;
  if (!w) {
    return store.errors.weather
      ? `<div class="card-title">Værmelding</div><div class="err">Vær: ${esc(store.errors.weather)}</div>`
      : '<div class="skeleton" style="min-height:260px"></div>';
  }
  const hours = w.hours ?? [], days = w.days ?? [];
  const upd = w.updated ? ` · oppdatert ${hm(w.updated)}` : '';
  const mini = [`Vind ${w.wind} m/s`, `nedbør ${mm(w.precipNow ?? w.precip)} mm`, w.humidity != null ? `fukt ${w.humidity} %` : ''].filter(Boolean).join(' · ');
  const h6 = hours.slice(0, 6).map((h) => `<div class="wxc-h"><span class="mono">${esc(h.t ?? h.label)}</span>${svg(h.icon)}<b>${h.temp}°</b><span class="mono wxc-mm">${mm(h.mm ?? h.precip)}</span></div>`).join('');
  const d3 = days.slice(1, 4).map((d) => `<div class="wxc-d">${svg(d.icon, 22)}<span class="wxc-d-t"><span>${esc(d.label)}</span><b>${d.max}° <span class="muted">/ ${d.min}°</span></b></span><span class="wxc-mm">${d.mm ? `${mm(d.mm)} mm` : ''}</span></div>`).join('');
  const chips = [['rise', `Sol opp ${hm(w.sunrise)}`], ['set', `Ned ${hm(w.sunset)}`], ['uv', `UV ${w.uv ?? '–'}`], ['gauge', w.pressure != null ? `${w.pressure} hPa` : '–']]
    .map(([k, t]) => `<span class="wxc-chip">${svg(k, 13, '#8a93a6')}${esc(t)}</span>`).join('');
  let more = '';
  if (ui.open) {
    const stats = weatherStats(w).map(([k, l, v, s]) => `<div class="wxc-stat"><span>${svg(k, 13, '#8a93a6')}${l}</span><b>${esc(v)}</b><span>${esc(s)}</span></div>`).join('');
    const maxMm = Math.max(1, ...hours.map((h) => h.mm ?? 0));
    const h8 = hours.map((h) => `<div class="wxc-h"><span class="mono">${esc(h.t ?? h.label)}</span>${svg(h.icon)}<b>${h.temp}°</b><span class="wxc-bar"><i style="height:${Math.max(2, Math.round(((h.mm ?? 0) / maxMm) * 22))}px;background:${h.mm ? '#a8d4fb' : '#232938'}"></i></span><span class="mono wxc-mm">${mm(h.mm)}</span></div>`).join('');
    const LO = Math.min(...days.map((d) => d.min)), HI = Math.max(...days.map((d) => d.max)), span = Math.max(1, HI - LO);
    const d6 = days.map((d) => `<div class="wxc-day"><span>${esc(d.label)}</span>${svg(d.icon)}<span class="muted" style="text-align:right">${d.min}°</span>
      <span class="wxc-range"><i style="left:${((d.min - LO) / span) * 100}%;width:${Math.max(4, ((d.max - d.min) / span) * 100)}%"></i></span><b>${d.max}°</b><span class="wxc-mm" style="text-align:right">${d.mm ? `${mm(d.mm)} mm` : ''}</span></div>`).join('');
    more = `<div class="wxc-more">
      <div class="wxc-stats">${stats}</div>
      <div class="wxc-sec"><div class="wxc-sec-h"><span>Neste timer</span><span>Nedbør mm</span></div><div class="wxc-h8">${h8}</div></div>
      <div class="wxc-days">${d6}</div></div>`;
  }
  return `<div class="card-head" style="align-items:flex-start"><div><div class="card-title">Værmelding</div><div class="card-sub">${esc(w.place)}${upd} · yr.no</div></div>
      <a href="https://www.yr.no" target="_blank" rel="noopener" class="sub" style="font-size:13px">yr.no ↗</a></div>
    <div class="wxc-now">${svg(w.icon, 46, '#a8d4fb')}<div class="wxc-temp">${w.temp}°</div>
      <div class="wxc-cond"><b>${esc(w.text)}</b><span>Føles som ${deg(w.feels)} · ${deg(w.hi)} / ${deg(w.lo)}</span><span>${esc(mini)}</span></div></div>
    <div class="wxc-h6">${h6}</div>
    ${w.nowcast?.text ? `<div class="wxc-cast">${esc(w.nowcast.text)}</div>` : ''}
    ${d3 ? `<div class="wxc-d3">${d3}</div>` : ''}
    <div class="wxc-chips">${chips}</div>
    <span style="flex:1"></span>
    <button class="wxc-btn" data-wx-more aria-expanded="${ui.open}">${ui.open ? 'Mindre vær ▴' : 'Mer vær ▾'}</button>${more}`;
}

/* ---------- Pakker (fra Sporing) ---------- */

const CARRIERS = {
  posten: ['P', '#E32D22', '#fff'], bring: ['B', '#7BC144', '#0f2a05'], postnord: ['PN', '#00A0D6', '#fff'], dhl: ['DHL', '#FFCC00', '#D40511'],
  ups: ['UPS', '#351C15', '#FFB500'], fedex: ['FX', '#4D148C', '#fff'], gls: ['GLS', '#061AB1', '#FFD100'], helthjem: ['HH', '#1E2B57', '#fff'],
  budbee: ['BB', '#3BDBB2', '#0c2b23'], instabox: ['IB', '#E5007E', '#fff'], schenker: ['DB', '#E00000', '#fff'],
};
const carrierBadge = (p, size = 30) => {
  const [ini, bg, fg] = CARRIERS[p.carrier] ?? [(p.carrierName ?? '?').slice(0, 2).toUpperCase(), '#3a4256', '#eef0f4'];
  return `<span class="pk-car" style="width:${size}px;height:${size}px;background:${bg};color:${fg}">${esc(ini)}</span>`;
};

export function packagesCard() {
  const d = store.data.trackw;
  const all = (d?.items ?? []).filter((p) => !p.archived && p.status !== 'delivered');
  const ready = (p) => p.status === 'ready_for_pickup';
  const rows = [...all].sort((a, b) => ready(b) - ready(a) || (b.step ?? 0) - (a.step ?? 0)).slice(0, 3);
  const pick = all.filter(ready).length;
  const count = all.length ? `${all.length} på vei${pick ? ` · ${pick} klar` : ''}` : '';
  const list = rows.map((p) => {
    const st = p.step ?? 0, fin = p.status === 'delivered';
    const bars = [0, 1, 2, 3, 4].map((j) => `<i style="background:${j <= st ? (j === st && !fin ? '#ff7a3d' : '#eef0f4') : 'rgba(255,255,255,.16)'}"></i>`).join('');
    const eta = ready(p) && p.pickupPoint ? p.pickupPoint : p.eta ?? '';
    return `<a class="pk-row" href="#/sporing" aria-label="${esc(p.name || p.trackingNo)}">
      <span class="pk-top">${carrierBadge(p)}<span class="pk-txt"><b>${esc(p.name || p.shop || p.trackingNo)}</b><span style="color:${ready(p) ? '#ffb08a' : fin ? '#8fe0b0' : '#eef0f4'}">${esc(p.statusText ?? '')}</span></span>
      <span class="pk-eta">${esc(eta)}</span></span><span class="pk-bars">${bars}</span></a>`;
  }).join('');
  return `<div class="card-head" style="align-items:center"><div class="pk-head"><span class="pk-ic">${svg('box', 18, '#ffb08a', 1.9)}</span><b>Pakker</b></div><span class="sub" style="font-size:13.5px">${esc(count)}</span></div>
    ${list || `<div class="pk-none">Ingen pakker på vei.</div>`}
    <span style="flex:1"></span><a class="wxc-btn" href="#/sporing">Åpne sporing ›</a>`;
}

/* ---------- Karusellen ---------- */

export function carousel() {
  const dots = [['Værmelding', 0], ['Pakker', 1]].map(([n, i]) => `<button data-wxc-dot="${i}" aria-label="${n}" aria-current="${ui.idx === i}"></button>`).join('');
  return `<div class="wxc">
    <div class="wxc-track" data-wxc-track>
      <div class="wxc-slide"><section class="card glass wxc-card" data-wxs="w" aria-label="Værmelding">${weatherCard()}</section></div>
      <div class="wxc-slide"><section class="card glass wxc-card" data-wxs="p" aria-label="Pakker">${packagesCard()}</section></div>
    </div>
    <div class="wxc-dots" role="tablist">${dots}</div></div>`;
}

const fill = (key, html) => document.querySelectorAll(`[data-wxs="${key}"]`).forEach((el) => { el.innerHTML = html; });
const markDots = () => document.querySelectorAll('[data-wxc-dot]').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.wxcDot === ui.idx)));
// Etter at karusellen er tegnet på nytt (ny rute, resize): hopp til valgt lysbilde uten animasjon.
export function restoreCarousel(root = document) {
  root.querySelectorAll('[data-wxc-track]').forEach((t) => { t.scrollLeft = ui.idx * t.clientWidth; });
}

on('weather', () => fill('w', weatherCard()));
on('trackw', () => fill('p', packagesCard()));

document.addEventListener('click', (e) => {
  const more = e.target.closest('[data-wx-more]');
  if (more) { ui.open = !ui.open; fill('w', weatherCard()); return; }
  const dot = e.target.closest('[data-wxc-dot]');
  if (dot) {
    ui.idx = +dot.dataset.wxcDot;
    const track = dot.closest('.wxc')?.querySelector('[data-wxc-track]');
    track?.scrollTo({ left: ui.idx * track.clientWidth, behavior: 'smooth' });
    markDots();
  }
});
// scroll bobler ikke, men kan fanges på dokumentet.
document.addEventListener('scroll', (e) => {
  const t = e.target;
  if (!(t instanceof Element) || !t.matches('[data-wxc-track]') || !t.clientWidth) return;
  const i = Math.round(t.scrollLeft / t.clientWidth);
  if (i !== ui.idx) { ui.idx = i; markDots(); }
}, { capture: true, passive: true });

// Pakkene hentes fra Sporing (/api/tracking/widget) hvert 2. minutt mens Dashboard er åpent.
let pkTimer = null;
export function startPackages() {
  if (pkTimer) return;
  load('trackw', '/tracking/widget');
  pkTimer = setInterval(() => { if (!document.hidden && document.querySelector('[data-wxs="p"]')) load('trackw', '/tracking/widget'); }, 120_000);
}
