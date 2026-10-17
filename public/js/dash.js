import { esc, kr, nb, signed, p2, cap, isoDay, hm, isMobile } from './util.js';
import { store, widget, card, refresh, errBox, on } from './store.js';
import { monthReceipts, catColor } from './eco.js';
import { renderSearch, popHandler } from './extras.js';

export const LINKS = [
  ['NRK', 'https://www.nrk.no', '#f59a8f'], ['VG', 'https://www.vg.no', '#f59a8f'], ['FINN', 'https://www.finn.no', '#a8d4fb'],
  ['Komplett', 'https://www.komplett.no', '#f3d38a'], ['Yr', 'https://www.yr.no', '#a8d4fb'], ['Canvas', 'https://canvas.instructure.com', '#f3d38a'],
  ['Claude', 'https://claude.ai', '#e8b48f'], ['ChatGPT', 'https://chatgpt.com', '#8fe0b0'], ['Gemini', 'https://gemini.google.com', '#9fb4ff'],
  ['Ruter', 'http://192.168.1.1', '#8fe0b0'], ['Home Assistant', 'http://192.168.1.20:8123', '#a8d4fb'], ['Proxmox', 'https://192.168.1.10:8006', '#f3d38a'],
  ['Homey', 'https://my.homey.app', '#e8a6d8'], ['LabDeck', 'http://192.168.1.50', '#9fb4ff'],
];
const tileAbbr = (n) => n === 'Home Assistant' ? 'HA' : n.slice(0, 2);
export const tiles = () => LINKS.map(([name, url, c]) =>
  `<a class="tile" href="${esc(url)}" target="_blank" rel="noopener"><b style="color:${c}">${esc(tileAbbr(name))}</b><span>${esc(name)}</span></a>`).join('');

/* ---------- Skoledata ---------- */

const events = () => store.data.school?.events ?? [];
const timed = (e) => !e.allDay && e.end > e.start;

export function lessonNow(now = store.now) {
  const today = isoDay(now);
  const list = events().filter((e) => timed(e) && isoDay(new Date(e.start)) === today);
  const t = now.getTime();
  const cur = list.find((e) => new Date(e.start) <= t && new Date(e.end) > t);
  const next = list.find((e) => new Date(e.start) > t);
  const l = cur ?? next;
  if (!l) return null;
  const s = new Date(l.start), e = new Date(l.end);
  const mins = (ms) => Math.max(0, Math.round(ms / 60000));
  const campus = store.data.school?.mazemapCampusId;
  return {
    label: cur ? 'NÅ' : 'NESTE', subj: l.title, room: l.location || '–', time: `${hm(s)}–${hm(e)}`,
    left: cur ? `${mins(e - t)} min igjen` : `starter om ${mins(s - t)} min`,
    pct: cur ? ((t - s) / (e - s)) * 100 : 0,
    map: l.location ? `https://use.mazemap.com/#v=1${campus ? `&campusid=${encodeURIComponent(campus)}` : ''}&search=${encodeURIComponent(l.location)}` : null,
  };
}

export function whenLabel(d, now = store.now) {
  const day = Math.round((new Date(isoDay(d)) - new Date(isoDay(now))) / 86400000);
  const prefix = day === 0 ? 'I dag' : day === 1 ? 'I morgen' : cap(d.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', ''));
  return `${prefix} ${hm(d)}`;
}

export function upcoming(n = 5) {
  const t = store.now.getTime();
  return events().filter((e) => new Date(e.end || e.start) > t).slice(0, n).map((e) => {
    const s = new Date(e.start);
    const live = s <= t && new Date(e.end) > t;
    return { ...e, when: e.allDay ? (whenLabel(s).split(' ')[0]) : whenLabel(s), tag: live ? 'NÅ' : e.deadline ? 'FRIST' : '', live };
  });
}

/* ---------- Topp: avganger, klokke, vær ---------- */

function renderTrips() {
  const r = store.data.ruter;
  if (!r) return store.errors.ruter ? errBox('ruter', 'Ruter') : '<div class="trip"><div class="skeleton"></div></div>'.repeat(4);
  const t = store.now.getTime();
  return r.trips.map((trip) => {
    const deps = trip.deps.map((d) => {
      const m = Math.round((new Date(d.time) - t) / 60000);
      if (m < -1) return '';
      const min = m <= 0 ? 'nå' : isMobile() ? `${m}m` : `${m} min`;
      const c = /metro/.test(d.mode) ? '#f3d38a' : '#a8d4fb';
      return `<span class="dep"><span class="badge" style="background:${c}">${esc(d.line)}</span><span class="dep-min">${min}</span></span>`;
    }).join('');
    return `<a class="trip" href="${esc(trip.url)}" target="_blank" rel="noopener">
      <div class="trip-name">${esc(trip.from)} → <b>${esc(trip.to)}</b></div>
      <div class="deps">${deps || `<span class="muted">${trip.error ? 'Ingen sanntid' : 'Ingen avganger'}</span>`}</div></a>`;
  }).join('');
}

function greeting(h) { return h < 10 ? 'God morgen' : h < 18 ? 'Hei' : 'God kveld'; }

function renderLesson() {
  const s = store.data.school;
  if (s && !s.configured) return '<div class="empty">Legg inn SCHOOL_ICAL_URL for timeplan.</div>';
  if (!s) return store.errors.school ? errBox('school', 'Timeplan') : '';
  const l = lessonNow();
  if (!l) return '<div class="sub" style="font-size:14px">Ingen flere timer i dag</div>';
  return `<div class="lesson">
    <div class="card-head" style="align-items:center"><span class="badge" style="background:var(--blue);padding:2px 8px">${l.label}</span><span class="mono sub" style="font-size:12px">${l.time}</span></div>
    <div class="card-head" style="align-items:flex-end"><div><div style="font-size:20px;font-weight:600">${esc(l.subj)}</div><div class="card-sub">Rom ${esc(l.room)} · ${l.left}</div></div>
    ${l.map ? `<a href="${esc(l.map)}" target="_blank" rel="noopener" class="chip" style="flex:0 0 auto">MazeMap ↗</a>` : ''}</div>
    <div class="bar"><i style="width:${l.pct}%"></i></div></div>`;
}

export function renderWeather(compact = false) {
  const w = store.data.weather;
  if (!w) return store.errors.weather ? errBox('weather', 'Vær') : '<div class="skeleton" style="min-height:200px"></div>';
  const hours = w.hours.map((h) => `<div class="wx-h"><div class="mono muted" style="font-size:12px">${esc(h.label)}</div><div style="font-size:18px">${h.temp}°</div>${compact ? '' : `<div class="bar"><i style="width:${Math.min(100, h.precip * 40)}%"></i></div>`}</div>`).join('');
  const head = compact
    ? `<div class="card-head" style="align-items:flex-end"><div class="wx-now"><div class="wx-temp">${w.temp}°</div><div class="sub" style="font-size:13px;padding-bottom:6px">${esc(w.text)}<br>${w.wind} m/s · ${nb(w.precip, 1)} mm</div></div><a href="https://www.yr.no" target="_blank" rel="noopener" class="sub" style="font-size:12px">yr ↗</a></div>`
    : `<div class="card-head"><div><div class="card-title">Værmelding</div><div class="card-sub">${esc(w.place)} · fra yr.no</div></div><a href="https://www.yr.no" target="_blank" rel="noopener" class="sub" style="font-size:13px">yr.no ↗</a></div>
       <div class="wx-now"><div class="wx-temp">${w.temp}°</div><div class="sub" style="padding-bottom:10px">${esc(w.text)} · føles som ${w.feels}°<br>Nedbør ${nb(w.precip, 1)} mm · Vind ${w.wind} m/s</div></div>`;
  const days = compact ? '' : `<div class="wx-days">${w.days.map((d) => `<div style="display:flex;gap:6px"><span class="muted">${esc(d.label)}</span><b style="font-weight:500">${d.max}° / ${d.min}°</b></div>`).join('')}</div>`;
  return `${head}<div class="wx-hours">${hours}</div>${days}`;
}

/* ---------- Widgets ---------- */

widget('d_cal', { render() {
  const n = store.now, y = n.getFullYear(), m = n.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
  const dots = {};
  for (const e of events()) {
    const d = new Date(e.start);
    if (d.getFullYear() === y && d.getMonth() === m) (dots[d.getDate()] ??= new Set()).add(e.color);
  }
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cal-d blank"></div>';
  for (let d = 1; d <= dim; d++) {
    const ds = [...(dots[d] ?? [])].slice(0, 3).map((c) => `<i style="background:${c}"></i>`).join('');
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells += `<div class="cal-d${d === n.getDate() ? ' today' : ''}" data-pop="day:${iso}" role="button" tabindex="0" aria-label="${d}. – vis detaljer">${d}<div class="cal-dots">${ds}</div></div>`;
  }
  const s = store.data.school;
  return `<div><div class="card-title">Skolekalender</div><div class="card-sub">${s && !s.configured ? 'iCal er ikke satt opp' : 'Synkronisert via iCal · Canvas'}</div></div>
    <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:600"><span>${cap(n.toLocaleDateString('nb-NO', { month: 'long' }))}</span><span class="muted" style="font-weight:400">${y}</span></div>
    <div class="cal">${['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((d) => `<div class="cal-wd">${d}</div>`).join('')}${cells}</div>${errBox('school', 'iCal')}`;
} });

widget('d_agenda', { cls: 'card', render() {
  const list = upcoming(isMobile() ? 4 : 6);
  return `<div><div class="card-title">${isMobile() ? 'I dag' : 'Agenda'}</div>${isMobile() ? '' : '<div class="card-sub">Kommende fra skolen</div>'}</div>
    ${list.map((e) => `<div class="row" style="justify-content:flex-start" data-pop="ev:${esc(e.start)}|${esc(e.title)}" role="button" tabindex="0"><span class="dot" style="background:${e.color}"></span><span class="mono sub" style="font-size:13px;width:84px;flex:0 0 auto">${esc(e.when)}</span><span style="flex:1;min-width:0">${esc(e.title)}</span><span class="mono" style="font-size:11px;color:var(--blue)">${e.tag}</span></div>`).join('')
    || (store.data.school ? '<div class="empty">Ingen kommende hendelser.</div>' : '')}${errBox('school', 'iCal')}`;
} });

widget('d_trading', { render() {
  const t = store.data.trading;
  const head = '<div><div class="card-title">Trading 212</div><div class="card-sub">Portefølje</div></div>';
  if (!t) return head + (errBox('trading', 'Trading 212') || '<div class="skeleton" style="min-height:120px"></div>');
  if (!t.configured) return head + '<div class="empty">Legg inn TRADING212_API_KEY på serveren.</div>';
  const cur = t.currency === 'NOK' ? 'kr' : t.currency;
  const day = t.dayChange != null ? `${signed(t.dayChange)} ${cur} (${signed(t.dayPct, 1)} %) i dag · ` : '';
  const pos = t.positions.map((p, i) => `<div class="row" data-pop="pos:${i}" role="button" tabindex="0"><span class="mono" style="font-weight:500">${esc(p.ticker)}</span><span class="mono" style="display:flex;gap:14px;font-size:13px"><span>${nb(p.value)}</span><span class="${p.pct < 0 ? 'red' : 'green'}" style="width:62px;text-align:right">${signed(p.pct, 1)} %</span></span></div>`).join('');
  return `${head}<div style="display:flex;align-items:flex-start;gap:6px"><div class="big">${nb(t.total)}</div><div class="sub" style="font-size:16px">${esc(cur)}</div></div>
    <div class="mono ${(t.dayChange ?? t.ppl) < 0 ? 'red' : 'green'}" style="font-size:13px">${day}${signed(t.pplPct, 1)} % totalt</div>${pos}${t.stale ? '<div class="empty">Viser sist hentede verdier.</div>' : ''}`;
} });

widget('d_energy', { render() {
  const e = store.data.energy;
  const head = '<div><div class="card-title">Energi</div><div class="card-sub">Home Assistant · kWh per dag</div></div>';
  if (!e) return head + (errBox('energy', 'Home Assistant') || '<div class="skeleton" style="min-height:150px"></div>');
  if (!e.configured) return head + '<div class="empty">Legg inn HA_URL og HA_TOKEN på serveren.</div>';
  const mx = Math.max(...e.days.map((d) => d.kwh), 1);
  const stat = (v, unit, label) => `<div><div class="num">${v}<span class="sub" style="font-size:15px"> ${unit}</span></div><div class="muted" style="font-size:12px">${label}</div></div>`;
  return `${head}<div style="display:flex;gap:28px;flex-wrap:wrap">${stat(e.kw != null ? nb(e.kw, 1) : '–', 'kW', 'nå')}${stat(nb(e.week), 'kWh', 'siste 7 dager')}${stat(e.price != null ? nb(e.price, 2) : '–', 'kr', 'pris/kWh')}</div>
    <div class="energy-bars">${e.days.map((d, i) => `<div class="${i === e.days.length - 1 ? 'cur' : ''}"><span class="mono sub" style="font-size:11px">${nb(d.kwh)}</span><i style="height:${(d.kwh / mx) * 80}%"></i><span class="muted" style="font-size:11px">${esc(d.label)}</span></div>`).join('')}</div>`;
} });

widget('d_eco', { render() {
  const me = store.me, list = monthReceipts(new Date());
  const total = list.reduce((a, r) => a + r.amount, 0);
  const cats = me.categories.map((c) => ({ ...c, sum: list.filter((r) => r.category === c.name).reduce((a, r) => a + r.amount, 0) })).filter((c) => c.sum > 0);
  return `<div class="card-head"><div><div class="card-title">Økonomi</div><div class="card-sub">${cap(new Date().toLocaleDateString('nb-NO', { month: 'long' }))}</div></div><a class="btn" href="#/okonomi">Åpne ↗</a></div>
    <div class="sub"><b class="num" style="color:var(--text)">${kr(total)}</b> av ${kr(me.budget)}</div>
    <div class="bar"><i style="width:${Math.min(100, me.budget ? (total / me.budget) * 100 : 0)}%"></i></div>
    ${store.receipts ? cats.map((c) => `<div style="display:flex;align-items:center;gap:10px;font-size:14px"><span style="width:10px;height:10px;border-radius:3px;background:${catColor(c.name)}"></span><span style="flex:1">${esc(c.name)}</span><span class="mono sub">${kr(c.sum)}</span></div>`).join('') || '<div class="empty">Ingen kvitteringer denne måneden.</div>' : ''}`;
} });

widget('d_links', { render() {
  return `<div><div class="card-title">Snarveier</div><div class="card-sub">Nyheter, AI, skole og nettverk</div></div><div class="tiles">${tiles()}</div>`;
} });

/* ---------- Kommer ut (Sonarr/Radarr) ---------- */

const dayFmt = (iso) => {
  if (!iso) return 'overvåkes';
  const d = new Date(iso), days = Math.round((new Date(isoDay(d)) - new Date(isoDay(store.now))) / 86400000);
  if (days === 0) return 'i dag';
  if (days === 1) return 'i morgen';
  return d.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(/\.$/, '');
};

function posters(kind, items) {
  return `<div class="posters">${items.slice(0, isMobile() ? 6 : 12).map((m, i) => `<button class="poster" data-pop="up:${kind}:${i}">
    <div class="poster-img" style="${m.img ? `background-image:url('${esc(m.img)}')` : ''}">${m.img ? '' : `<span class="ph">${esc(m.title)}</span>`}<span class="badge" style="${m.date ? '' : 'color:#f3d38a'}">${esc(dayFmt(m.date))}</span></div>
    <b>${esc(m.title)}</b><span>${esc(m.sub)}</span></button>`).join('')}</div>`;
}

widget('d_upcoming', { render() {
  const u = store.data.upcoming;
  const links = u ? [['Sonarr', u.tv], ['Radarr', u.movies]].filter(([, x]) => x.url).map(([n, x]) => `<a class="btn" href="${esc(x.url)}" target="_blank" rel="noopener">${n} ↗</a>`).join('') : '';
  const head = `<div class="card-head"><div><div class="card-title">Kommer ut</div><div class="card-sub">Sonarr · Radarr</div></div><div style="display:flex;gap:6px">${links}</div></div>`;
  if (!u) return head + (errBox('upcoming', 'Sonarr/Radarr') || '<div class="skeleton" style="min-height:160px"></div>');
  if (!u.tv.configured && !u.movies.configured) return head + '<div class="empty">Legg inn URL og API-nøkkel for Sonarr og Radarr under Innstillinger → Integrasjoner.</div>';
  const part = (label, x, kind) => !x.configured ? '' : `<div class="section-label">${label}</div>${x.error ? `<div class="err">${esc(x.error)}</div>` : x.items.length ? posters(kind, x.items) : '<div class="empty">Ingenting i perioden.</div>'}`;
  return head + part('TV-serier', u.tv, 'tv') + part('Filmer', u.movies, 'movies');
} });

popHandler('up', (key) => {
  const [kind, i] = key.split(':');
  const m = store.data.upcoming?.[kind]?.items[+i];
  if (!m) return null;
  const when = m.date ? new Date(m.date).toLocaleString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', hour: kind === 'tv' ? '2-digit' : undefined, minute: kind === 'tv' ? '2-digit' : undefined }) : 'Ingen dato ennå';
  return { title: m.title, body: `${m.img ? `<img class="popup-poster" src="${esc(m.img)}" alt="">` : ''}
    <div class="sub">${esc(m.sub)}</div><div class="mono" style="font-size:13px;color:var(--blue)">${esc(cap(when))} · ${esc(m.status)}</div>
    ${m.overview ? `<div class="sub" style="font-size:14px;line-height:1.5">${esc(m.overview)}</div>` : ''}
    ${m.url && m.url !== '#' ? `<a class="btn" href="${esc(m.url)}" target="_blank" rel="noopener" style="align-self:flex-start">Åpne i ${kind === 'tv' ? 'Sonarr' : 'Radarr'} ↗</a>` : ''}` };
});

/* ---------- Popup for kalenderdag, agenda og aksjer ---------- */

const evRow = (e) => `<div class="row" style="justify-content:flex-start"><span class="dot" style="background:${e.color}"></span><span class="mono sub" style="font-size:13px;width:48px;flex:0 0 auto">${e.allDay ? 'hele' : hm(new Date(e.start))}</span><span style="flex:1;min-width:0">${esc(e.title)}</span><span class="muted" style="font-size:12px">${esc(e.location)}</span></div>`;

popHandler('day', (iso) => {
  const list = events().filter((e) => isoDay(new Date(e.start)) === iso);
  const d = new Date(iso + 'T12:00');
  return { title: cap(d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })),
    body: list.map(evRow).join('') || '<div class="empty">Ingen hendelser</div>' };
});

popHandler('ev', (key) => {
  const [start, title] = key.split('|');
  const e = events().find((x) => x.start === start && x.title === title);
  if (!e) return null;
  const s = new Date(e.start), en = new Date(e.end);
  const campus = store.data.school?.mazemapCampusId;
  const map = e.location ? `https://use.mazemap.com/#v=1${campus ? `&campusid=${encodeURIComponent(campus)}` : ''}&search=${encodeURIComponent(e.location)}` : null;
  return { title: e.title, body: `<div class="mono sub" style="font-size:13px">${cap(s.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }))}${e.allDay ? '' : ` · ${hm(s)}–${hm(en)}`}</div>
    ${e.location ? `<div>Rom/sted: <b>${esc(e.location)}</b></div>` : ''}${e.deadline ? '<div style="color:var(--red)">Frist</div>' : ''}
    ${map ? `<a class="btn" href="${esc(map)}" target="_blank" rel="noopener" style="align-self:flex-start">MazeMap ↗</a>` : ''}` };
});

popHandler('pos', (i) => {
  const t = store.data.trading, p = t?.positions[+i];
  if (!p) return null;
  return { title: p.ticker, body: `<div class="big">${nb(p.value)} <span class="sub" style="font-size:16px">${esc(t.currency === 'NOK' ? 'kr' : t.currency)}</span></div>
    <div class="mono ${p.pct < 0 ? 'red' : 'green'}">${signed(p.ppl)} (${signed(p.pct, 1)} %) urealisert</div>
    <div class="muted" style="font-size:12px">Andel av porteføljen: ${nb((p.value / t.total) * 100, 1)} %</div>` };
});

widget('d_weather_m', { cls: 'card glass', render: () => renderWeather(true) });

/* ---------- Side ---------- */

export function render() {
  const n = store.now, mob = isMobile();
  const hello = `<div class="hello">
      <div class="greet"><span id="greet">${greeting(n.getHours())}</span>, <b>${esc(store.me.user)}</b></div>
      <div class="sub" id="date">${cap(n.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(store.me.place)}</div>
      <div class="clock"><div class="clock-hm" id="clock-hm">${p2(n.getHours())}:${p2(n.getMinutes())}</div><div class="clock-s" id="clock-s">${p2(n.getSeconds())}</div></div>
      <div id="lesson">${renderLesson()}</div></div>`;
  if (mob) {
    return `${hello}<div class="trips" id="trips">${renderTrips()}</div>${store.me.hideSearch ? '' : renderSearch()}
      <div class="grid" data-dnd="m_home">${['d_weather_m', 'd_agenda', 'd_trading', 'd_energy', 'd_eco', 'd_upcoming'].map(card).join('')}</div>`;
  }
  // Toppområdet kan omorganiseres; søkebaren ligger som standard mellom avganger og klokke.
  return `<div style="display:flex;flex-direction:column;gap:28px">
    <div data-dnd="top" style="display:flex;flex-direction:column;gap:24px">
      <div class="trips" id="trips">${renderTrips()}</div>
      ${store.me.hideSearch ? '' : renderSearch()}
      <div class="hero">${hello}<section class="card glass weather" id="weather">${renderWeather()}</section></div>
    </div>
    <div class="grid" data-dnd="dash">${['d_cal', 'd_agenda', 'd_trading', 'd_energy', 'd_eco', 'd_links', 'd_upcoming'].map(card).join('')}</div></div>`;
}

const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

// Kalles hvert sekund fra app.js.
export function tick() {
  const n = store.now;
  const hmEl = document.getElementById('clock-hm');
  if (!hmEl) return;
  hmEl.textContent = `${p2(n.getHours())}:${p2(n.getMinutes())}`;
  document.getElementById('clock-s').textContent = p2(n.getSeconds());
  if (n.getSeconds() === 0) {
    document.getElementById('greet').textContent = greeting(n.getHours());
    setHtml('lesson', renderLesson());
    refresh('d_agenda');
    if (n.getHours() === 0 && n.getMinutes() === 0) refresh('d_cal');
  }
  if (n.getSeconds() % 15 === 0) setHtml('trips', renderTrips());
}

on('ruter', () => setHtml('trips', renderTrips()));
on('weather', () => { setHtml('weather', renderWeather()); refresh('d_weather_m'); });
on('school', () => { setHtml('lesson', renderLesson()); refresh('d_cal', 'd_agenda'); });
on('trading', () => refresh('d_trading'));
on('energy', () => refresh('d_energy'));
on('upcoming', () => refresh('d_upcoming'));
on('receipts', () => refresh('d_eco'));
