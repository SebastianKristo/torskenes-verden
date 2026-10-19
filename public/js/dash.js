import { esc, kr, nb, signed, p2, cap, isoDay, hm, isMobile, api, logoImg, NOT_SET_UP } from './util.js';
import { store, widget, card, refresh, errBox, on, load } from './store.js';
import { renderSearch, popHandler } from './extras.js';
import { hiddenWidgets } from './profile.js';
import './media.js';
import './poscard.js';
import './bdwidget.js';
import './kalender.js';
import { pkgLogo, pkgTitle, moreText } from './pkglogo.js';
import { carousel, restoreCarousel, startPackages } from './weather-card.js';
import { is2c, pwCredit, pwImg } from './hltheme.js';
import { updBanner } from './upd-banner.js';
// Prompt 31: URL-er i stedsteksten vises ikke (lenken brukes som kart-lenke i stedet).
const noUrl = (t) => String(t ?? '').replace(/\s*https?:\/\/\S+/g, '').trim();
const urlOf = (t) => String(t ?? '').match(/https?:\/\/\S+/)?.[0] ?? '';

// Snarveiene hentes fra serveren per bruker (/api/state.shortcuts), og deles med mobilappen.
// Ekte logo (favicon via serveren); lokale adresser slås opp med AI én gang. Uten logo vises forbokstavene i en farge.
const TILE_COLORS = ['#f59a8f', '#a8d4fb', '#f3d38a', '#8fe0b0', '#e8a6d8', '#9fb4ff', '#e8b48f'];
let resolveAsked = false;
export const tiles = () => {
  const list = store.me.shortcuts ?? [];
  if (!resolveAsked && list.some((s) => s.local && !s.resolved)) {
    resolveAsked = true;
    api('/me/shortcuts/resolve', { method: 'POST' }).then((l) => { if (Array.isArray(l)) { store.me.shortcuts = l; refresh('d_links'); refresh('m_links'); } }).catch(() => {});
  }
  return list.map(({ name, url, domain }, i) =>
    `<a class="tile" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(name)}" style="--tc:${TILE_COLORS[i % TILE_COLORS.length]}">${logoImg(domain, name === 'Home Assistant' ? 'HA' : name, 'tile-lg')}<span>${esc(name)}</span></a>`).join('')
    || '<div class="empty">Ingen snarveier. Legg til under Innstillinger → Startside → Snarveier.</div>';
};

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
    label: cur ? 'NÅ' : 'NESTE', subj: l.title, room: noUrl(l.location) || '–', time: `${hm(s)}–${hm(e)}`,
    left: cur ? `${mins(e - t)} min igjen` : `starter om ${mins(s - t)} min`,
    pct: cur ? ((t - s) / (e - s)) * 100 : 0,
    map: urlOf(l.location) || (l.location ? `https://use.mazemap.com/#v=1${campus ? `&campusid=${encodeURIComponent(campus)}` : ''}&search=${encodeURIComponent(noUrl(l.location))}` : null),
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

// Ruters egne linjefarger: fra Entur når serveren sender dem (color/textColor), ellers etter transportmiddel og linjenummer.
const RUTER = { metro: '#EC700C', tram: '#0B91EF', bus: '#E60000', regional: '#75A300', water: '#682C88', rail: '#003087' };
function ruterColor(d) {
  const okHex = (c) => (/^#?[0-9a-f]{6}$/i.test(c ?? '') ? (c[0] === '#' ? c : '#' + c) : null);
  if (okHex(d.color)) return [okHex(d.color), okHex(d.textColor) ?? '#fff'];
  const m = String(d.mode ?? '').toLowerCase(), n = String(d.line ?? '');
  const k = /metro|subway/.test(m) || /^T?\d$/.test(n) && /metro/.test(m) ? 'metro'
    : /tram/.test(m) ? 'tram' : /water|ferry|boat/.test(m) ? 'water' : /rail|train/.test(m) ? 'rail'
    : /^[1-5]$/.test(n) ? 'metro' : /^1[1-9]$/.test(n) ? 'tram' : /^B\d/i.test(n) ? 'water' : /^(R|L|F)\d/i.test(n) ? 'rail' : /^\d{3}/.test(n) ? 'regional' : 'bus';
  return [RUTER[k], '#fff'];
}

// Prompt 21: trykk på en avgang som har stopp (serveren sender stops fra Entur) for å se holdeplassene på turen.
// Bare én er åpen om gangen; trykk igjen lukker. Eldre servere uten stops: avgangen er en vanlig lenke som før.
const depUi = { open: null, all: false, fresh: false };
const MODE_NB = { tram: 'Trikk', bus: 'Buss', metro: 'T-bane', rail: 'Tog', water: 'Båt', coach: 'Buss', ferry: 'Båt' };
const modeName = (d) => d.modeName ?? (/^(Trikk|Buss|T-bane|Tog|Båt)$/.test(d.mode ?? '') ? d.mode : MODE_NB[String(d.mode ?? '').toLowerCase()] ?? '');
const depKey = (trip, d) => `${trip.from}|${trip.to}|${d.line}|${d.aimed ?? d.time}`;
const stopTime = (x) => { const t = x.time ?? x.expected ?? x.aimed; return t ? hm(new Date(t)) : ''; };

function depStatus(d) {
  if (d.status) return d.status;
  const late = Number.isFinite(+d.delayMin) ? +d.delayMin : d.aimed && d.time ? Math.round((new Date(d.time) - new Date(d.aimed)) / 60000) : null;
  return late == null ? '' : late > 0 ? `${late} min forsinket` : 'i rute';
}

function depPanel(trip, d, m) {
  const [bg, fg] = ruterColor(d), st = d.stops ?? [];
  const status = depStatus(d), late = /forsinket/.test(status);
  const sub = [modeName(d), d.platform ? `plattform ${d.platform}` : '', status].filter(Boolean);
  const subHtml = sub.map((x) => (x === status && late ? `<span class="dx-late">${esc(x)}</span>` : esc(x))).join(' · ');
  const n = st.length, many = n > 6 && !depUi.all;
  const rows = (many ? [...st.slice(0, 2), null, ...st.slice(-2)] : st).map((x, j, arr) => {
    if (!x) return `<button type="button" class="dx-stop dx-more" data-dep-all><span class="dx-rail" style="--lc:${bg}"><i class="lt"></i><i class="gap"></i><i class="lb"></i></span><span class="dx-n">· · · ${n - 4} stopp</span></button>`;
    const first = j === 0, last = j === arr.length - 1;
    return `<div class="dx-stop${first || last ? ' end' : ''}"><span class="dx-rail" style="--lc:${bg}"><i class="lt"${first ? ' hidden' : ''}></i><i class="dot${first ? ' fill' : ''}"></i><i class="lb"${last ? ' hidden' : ''}></i></span><span class="dx-n">${esc(x.name)}${x.platform && first ? ` <small>${esc(x.platform)}</small>` : ''}</span><span class="dx-t">${esc(stopTime(x))}</span></div>`;
  }).join('');
  const url = d.ruterUrl || trip.url || 'https://ruter.no/reiseplanlegger/';
  return `<div class="dx${depUi.fresh ? ' dx-in' : ''}"><div class="dx-in-w">
    <div class="dx-top"><span class="dx-line" style="background:${bg};color:${fg}">${esc(d.line)}</span><span class="dx-h"><b>${esc(d.to ?? trip.to)}</b><span>${subHtml}</span></span>
      <span class="dx-m"><b>${m <= 0 ? 'nå' : `${m} min`}</b><span>${esc(hm(new Date(d.time)))}</span></span></div>
    ${rows ? `<div class="dx-stops">${rows}</div>` : ''}
    <a class="dx-ruter" href="${esc(url)}" target="_blank" rel="noopener">Åpne i Ruter ›</a></div></div>`;
}

function renderTrips() {
  const r = store.data.ruter;
  if (!r) return store.errors.ruter ? errBox('ruter', 'Ruter') : '<div class="trip"><div class="skeleton"></div></div>'.repeat(4);
  const t = store.now.getTime();
  const paper = is2c();
  const out = r.trips.map((trip) => {
    let panel = '';
    const hasStops = trip.deps.some((d) => d.stops?.length);
    const deps = trip.deps.map((d) => {
      const m = Math.round((new Date(d.time) - t) / 60000);
      if (m < -1) return '';
      const k = depKey(trip, d), open = depUi.open === k && d.stops?.length;
      if (open) panel = depPanel(trip, d, m);
      const attrs = d.stops?.length ? ` role="button" tabindex="0" data-dep-open="${esc(k)}" aria-expanded="${!!open}"` : '';
      if (paper) {
        const [bg, fg] = ruterColor(d);
        return `<span class="p-dep${open ? ' on' : ''}"${attrs}><span class="p-line" style="background:${bg};color:${fg};border-color:${bg}">${esc(d.line)}</span>${m <= 0 ? 'nå' : `${m} min`}</span>`;
      }
      const min = m <= 0 ? 'nå' : isMobile() ? `${m}m` : `${m} min`;
      const c = /metro/.test(d.mode) ? '#f3d38a' : '#a8d4fb';
      return `<span class="dep${open ? ' on' : ''}"${attrs}><span class="badge" style="background:${c}">${esc(d.line)}</span><span class="dep-min">${min}</span></span>`;
    }).join('');
    const none = `<span class="${paper ? 'p-mute' : 'muted'}">${trip.error ? 'Ingen sanntid' : 'Ingen avganger'}</span>`;
    // Med stopp er ikke hele raden en lenke (avgangene er knapper); strekningen lenker fortsatt til Ruter.
    if (paper) {
      const name = `${esc(trip.from)} → ${esc(trip.to)}`;
      return hasStops
        ? `<div class="p-trip"><a class="p-trip-n" href="${esc(trip.url)}" target="_blank" rel="noopener">${name}</a><div class="p-deps">${deps || none}</div>${panel}</div>`
        : `<a class="p-trip" href="${esc(trip.url)}" target="_blank" rel="noopener"><div class="p-trip-n">${name}</div><div class="p-deps">${deps || none}</div></a>`;
    }
    const name = `${esc(trip.from)} → <b>${esc(trip.to)}</b>`;
    return hasStops
      ? `<div class="trip${panel ? ' trip-open' : ''}"><a class="trip-name" href="${esc(trip.url)}" target="_blank" rel="noopener">${name}</a><div class="deps">${deps || none}</div>${panel}</div>`
      : `<a class="trip" href="${esc(trip.url)}" target="_blank" rel="noopener"><div class="trip-name">${name}</div><div class="deps">${deps || none}</div></a>`;
  }).join('');
  depUi.fresh = false;
  return out;
}

function toggleDep(k) {
  depUi.fresh = depUi.open !== k;
  depUi.open = depUi.open === k ? null : k;
  depUi.all = false;
  setHtml('trips', renderTrips());
  [...document.querySelectorAll('#trips [data-dep-open]')].find((x) => x.dataset.depOpen === k)?.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => {
  const all = e.target.closest?.('#trips [data-dep-all]');
  if (all) { depUi.all = true; return setHtml('trips', renderTrips()); }
  const b = e.target.closest?.('#trips [data-dep-open]');
  if (b) { e.preventDefault(); toggleDep(b.dataset.depOpen); }
});
document.addEventListener('keydown', (e) => {
  const b = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('#trips [data-dep-open]');
  if (b) { e.preventDefault(); toggleDep(b.dataset.depOpen); }
});

// ISO2: trading, skole og media bruker brukerens egne integrasjoner; uten oppsett {configured:false}.

function greeting(h) { return (h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 12 ? 'God formiddag' : h < 18 ? 'God ettermiddag' : h < 23 ? 'God kveld' : 'God natt'); }

function renderLesson() {
  const s = store.data.school;
  if (s && !s.configured) return `<div class="empty">${NOT_SET_UP}</div>`;
  if (!s) return store.errors.school ? errBox('school', 'Timeplan') : '';
  const l = lessonNow();
  if (!l) return '<div class="sub" style="font-size:14px">Ingen flere timer i dag</div>';
  return `<div class="lesson">
    <div class="card-head" style="align-items:center"><span class="badge" style="background:var(--blue);padding:2px 8px">${l.label}</span><span class="mono sub" style="font-size:12px">${l.time}</span></div>
    <div class="card-head" style="align-items:flex-end"><div><div style="font-size:20px;font-weight:600">${esc(l.subj)}</div><div class="card-sub">Rom ${esc(l.room)} · ${l.left}</div></div>
    ${l.map ? `<a href="${esc(l.map)}" target="_blank" rel="noopener" class="chip" style="flex:0 0 auto">MazeMap ↗</a>` : ''}</div>
    <div class="bar"><i style="width:${l.pct}%"></i></div></div>`;
}

// Værmelding + Pakker i karusell (weather-card.js). Beholdt som navn for kompatibilitet.
export const renderWeather = () => carousel();

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
  if (!t.configured) return head + `<div class="empty">${NOT_SET_UP}</div>`;
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

// Økonomi-sammendrag fra FinansHub (/finans/api/summary).
widget('d_eco', { render() {
  const f = store.data.finans;
  const head = `<div class="card-head"><div><div class="card-title">Økonomi</div><div class="card-sub">${cap(new Date().toLocaleDateString('nb-NO', { month: 'long' }))} · FinansHub</div></div><a class="btn" href="/finans/">Åpne ↗</a></div>`;
  if (!f) return head + (errBox('finans', 'FinansHub') || '<div class="skeleton" style="min-height:120px"></div>');
  const top = f.byCategory.slice(0, 5);
  return `${head}<div class="sub"><b class="num" style="color:var(--text)">${kr(f.budgetTotal ? f.budgetUsed : f.ut)}</b> ${f.budgetTotal ? `av ${kr(f.budgetTotal)}` : 'brukt'}</div>
    <div class="bar"><i style="width:${Math.min(100, f.budgetTotal ? (f.budgetUsed / f.budgetTotal) * 100 : 0)}%"></i></div>
    ${top.map((c) => `<div style="display:flex;align-items:center;gap:10px;font-size:14px"><span style="width:10px;height:10px;border-radius:3px;background:${esc(c.color)}"></span><span style="flex:1">${esc(c.category)}</span><span class="mono sub">${kr(c.amount)}</span></div>`).join('') || '<div class="empty">Ingen utgifter denne måneden.</div>'}
    ${f.review.length ? `<a href="/finans/#/kv" class="sub" style="font-size:13px;color:var(--blue)">${f.review.length} kvitteringer til gjennomgang →</a>` : ''}`;
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
  if (!u.tv.configured && !u.movies.configured) return head + `<div class="empty">${NOT_SET_UP}</div>`;
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

const evRow = (e) => `<div class="row" style="justify-content:flex-start"><span class="dot" style="background:${e.color}"></span><span class="mono sub" style="font-size:13px;width:48px;flex:0 0 auto">${e.allDay ? 'hele' : hm(new Date(e.start))}</span><span style="flex:1;min-width:0">${esc(e.title)}</span><span class="muted" style="font-size:12px;min-width:0;max-width:45%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(noUrl(e.location))}</span></div>`;

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
  const map = urlOf(e.location) || (e.location ? `https://use.mazemap.com/#v=1${campus ? `&campusid=${encodeURIComponent(campus)}` : ''}&search=${encodeURIComponent(noUrl(e.location))}` : null);
  return { title: e.title, body: `<div class="mono sub" style="font-size:13px">${cap(s.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }))}${e.allDay ? '' : ` · ${hm(s)}–${hm(en)}`}</div>
    ${noUrl(e.location) ? `<div>Rom/sted: <b>${esc(noUrl(e.location))}</b></div>` : ''}${e.deadline ? '<div style="color:var(--red)">Frist</div>' : ''}
    ${map ? `<a class="btn" href="${esc(map)}" target="_blank" rel="noopener" style="align-self:flex-start">MazeMap ↗</a>` : ''}` };
});

popHandler('pos', (i) => {
  const t = store.data.trading, p = t?.positions[+i];
  if (!p) return null;
  return { title: p.ticker, body: `<div class="big">${nb(p.value)} <span class="sub" style="font-size:16px">${esc(t.currency === 'NOK' ? 'kr' : t.currency)}</span></div>
    <div class="mono ${p.pct < 0 ? 'red' : 'green'}">${signed(p.ppl)} (${signed(p.pct, 1)} %) urealisert</div>
    <div class="muted" style="font-size:12px">Andel av porteføljen: ${nb((p.value / t.total) * 100, 1)} %</div>` };
});

// På mobil er karusellen selve kortet (lysbildene har egen kortstil).
widget('d_weather_m', { cls: 'card wxc-host', render: () => carousel(), mounted: (el) => restoreCarousel(el) });

/* ---------- Vindu og papir (2c) ---------- */

// Seksjonene i de tre spaltene er egne widgets, så de tegnes på nytt når dataene kommer, akkurat som kortene.
const lab = (t, extra = '') => `<div class="p-lab"${extra}>${t}</div>`;
const pdate = (n) => cap(n.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }));

widget('p_school', { cls: 'p-sec', render() {
  const s = store.data.school;
  let now = '';
  if (s && !s.configured) now = `<div class="p-mute">${NOT_SET_UP}</div>`;
  else if (!s) now = errBox('school', 'Timeplan');
  else {
    const l = lessonNow();
    now = l ? `<div class="p-now"><span class="p-tag-ink">${l.label}</span><span class="p-now-t">${esc(l.subj)}</span>
      <div class="p-mute">${esc(l.time)} · ${esc(l.room)} · ${esc(l.left)}${l.map ? ` · <a href="${esc(l.map)}" target="_blank" rel="noopener" class="p-u">MazeMap ↗</a>` : ''}</div></div>` : '<div class="p-now"><span class="p-now-t">Ingen flere timer i dag</span></div>';
  }
  const rows = upcoming(5).map((e) => `<div class="p-ev" data-pop="ev:${esc(e.start)}|${esc(e.title)}" role="button" tabindex="0"><span class="p-mute">${esc(e.when)}</span><b>${esc(e.title)}</b><span class="p-tag">${e.tag}</span></div>`).join('')
    || (s ? '<div class="p-mute" style="padding:9px 0">Ingen kommende hendelser.</div>' : '');
  return lab('I DAG PÅ SKOLEN') + now + rows;
} });

widget('p_energy', { cls: 'p-sec', render() {
  const e = store.data.energy;
  if (!e) return lab('ENERGI') + (errBox('energy', 'Home Assistant') || '<div class="skeleton" style="min-height:90px"></div>');
  if (!e.configured) return lab('ENERGI') + '<div class="p-mute">Legg inn HA_URL og HA_TOKEN på serveren.</div>';
  const mx = Math.max(...e.days.map((d) => d.kwh), 1), last = e.days.length - 1;
  return lab('ENERGI') + `<div class="p-split"><span><span class="p-num">${e.kw != null ? nb(e.kw, 1) : '–'}</span> <span class="p-mute">kW nå</span></span><span class="p-mute">${nb(e.week)} kWh denne uken${e.price != null ? ` · ${nb(e.price, 2)} kr/kWh` : ''}</span></div>
    <div class="p-bars">${e.days.map((d, i) => `<div title="${esc(d.label)}: ${nb(d.kwh)} kWh" class="${i === last ? 'cur' : ''}" style="height:${(d.kwh / mx) * 100}%"></div>`).join('')}</div>
    <div class="p-bars-l">${e.days.map((d) => `<span>${esc(d.label)}</span>`).join('')}</div>`;
} });

widget('p_wx', { cls: 'p-sec', render() {
  const w = store.data.weather;
  if (!w) return lab('VÆR') + (errBox('weather', 'Vær') || '<div class="skeleton" style="min-height:90px"></div>');
  const hours = (w.hours ?? []).slice(0, 6).map((h) => `<div><span class="p-mute">${esc(h.t ?? h.label)}</span><b>${h.temp}°</b><span class="p-mute">${h.mm ? nb(h.mm, 1) : '0'}</span></div>`).join('');
  const days = (w.days ?? []).slice(1, 4).map((d) => `<div class="p-wxd"><span>${esc(d.label)}</span><b>${d.max}°</b><span class="p-mute">${d.min}°</span><span class="p-mute">${d.mm ? `${nb(d.mm, 1)} mm` : '0 mm'}</span></div>`).join('');
  return lab(`VÆR · ${esc(w.place ?? '').toUpperCase()}`) + `<div class="p-mute" style="margin-top:6px">${esc(w.text)} · føles som ${w.feels ?? '–'}° · vind ${w.wind} m/s${w.hi != null ? ` · ${w.hi}° / ${w.lo}°` : ''}</div>
    ${hours ? `<div class="p-wxh">${hours}</div>` : ''}${days}`;
} });

widget('p_pk', { cls: 'p-sec', render() {
  const d = store.data.trackw;
  const all = (d?.items ?? []).filter((p) => !p.archived && p.status !== 'delivered');
  const ready = (p) => p.status === 'ready_for_pickup';
  const top = [...all].sort((a, b) => ready(b) - ready(a) || (b.step ?? 0) - (a.step ?? 0)).slice(0, 3);
  const rows = top.map((p) => `<a class="p-pk p-pk-l" href="#/sporing">${pkgLogo(p, 40)}<span class="p-pk-t"><b>${esc(pkgTitle(p))}</b>
    <span class="${ready(p) ? 'p-acc' : 'p-mute'}">${esc(p.statusText ?? '')}${ready(p) && p.pickupPoint ? ` · ${esc(p.pickupPoint)}` : p.eta ? ` · ${esc(p.eta)}` : ''}</span></span></a>`).join('');
  const more = moreText((d?.count?.active ?? all.length) - top.length + 1);
  return lab(`PAKKER${all.length ? ` · ${all.length} PÅ VEI` : ''}`) + (rows || `<div class="p-mute" style="padding:9px 0">${d ? 'Ingen pakker på vei.' : ''}</div>`) + `<a class="p-u p-more" href="#/sporing">${more ? `${esc(more)} · ` : ''}Åpne sporing ›</a>`;
} });

widget('p_play', { cls: 'p-sec', render() {
  const now = store.data.media_now, items = now?.items ?? [];
  const left = (ms) => { const m = Math.round((ms || 0) / 60000); return m >= 60 ? `${Math.floor(m / 60)} t ${m % 60} min igjen` : `${m} min igjen`; };
  const rows = items.slice(0, 3).map((n) => `<div class="p-play"><span class="p-poster" style="${n.poster ? `background-image:url('${esc(n.poster)}')` : ''}">${n.poster ? '' : esc(String(n.title).charAt(0).toUpperCase())}</span>
    <div><div class="p-play-t">${esc(n.title)}</div><div class="p-mute">${esc([n.user, n.src === 'jellyfin' ? 'Jellyfin' : 'Plex', left(n.leftMs)].filter(Boolean).join(' · '))}</div></div></div>`).join('');
  const empty = !now ? '' : now.configured === false ? NOT_SET_UP : 'Ingen spiller noe akkurat nå.';
  return lab('SPILLES NÅ') + (rows || `<div class="p-mute" style="padding:9px 0">${empty}</div>`);
} });

widget('p_money', { cls: 'p-sec', render() {
  const t = store.data.trading, f = store.data.finans;
  const cur = t?.currency === 'NOK' || !t?.currency ? 'kr' : t.currency;
  const tr = !t ? '<div class="skeleton" style="min-height:60px"></div>' : !t.configured ? `<div class="p-mute">${NOT_SET_UP}</div>`
    : `<div class="p-big">${nb(t.total)} ${esc(cur)}</div>${t.dayChange != null ? `<div class="${t.dayChange < 0 ? 'p-neg' : 'p-pos'}">${signed(t.dayChange)} ${esc(cur)} (${signed(t.dayPct, 1)} %)</div>` : `<div class="${t.pplPct < 0 ? 'p-neg' : 'p-pos'}">${signed(t.pplPct, 1)} % totalt</div>`}`;
  const month = cap(store.now.toLocaleDateString('nb-NO', { month: 'long' }));
  const fh = !f ? (errBox('finans', 'FinansHub') || '<div class="skeleton" style="min-height:60px"></div>')
    : `<div class="p-big">${kr(f.budgetTotal ? f.budgetUsed : f.ut)}</div><div class="p-mute">${f.budgetTotal ? `av ${kr(f.budgetTotal)}` : 'brukt'}${f.review?.length ? ` · <a class="p-u" href="/finans/#/kv">${f.review.length} til gjennomgang</a>` : ''}</div>`;
  return lab('PENGER') + `<div class="p-money"><a href="/finans/#/aks"><div class="p-mute">Trading 212</div>${tr}</a><a href="/finans/"><div class="p-mute">Brukt i ${esc(month.toLowerCase())}</div>${fh}</a></div>`;
} });

widget('p_links', { cls: 'p-sec', render() {
  const list = store.me.shortcuts ?? [];
  return lab('SNARVEIER') + `<div class="p-links">${list.map(({ name, url }, i) => `<a href="${esc(url)}" target="_blank" rel="noopener"><span style="background:${TILE_COLORS[i % TILE_COLORS.length]}"></span>${esc(name)}</a>`).join('') || '<span class="p-mute">Ingen snarveier.</span>'}</div>`;
} });

function photoWindow(n) {
  const w = store.data.weather;
  return `<section class="pw pw-dash">${pwImg()}
    <div class="pw-bottom">
      <div><div class="pw-date" id="date">${pdate(n)}</div><div class="pw-hello"><span id="greet">${greeting(n.getHours())}</span>, ${esc(store.me.user)}</div></div>
      <a class="pw-wx" href="${esc(w?.lat != null ? `https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/${w.lat},${w.lon}` : 'https://www.yr.no')}" target="_blank" rel="noopener"><div class="pw-temp" id="pw-temp">${w ? `${w.temp}°` : '–°'}</div><div class="pw-cond"><span id="pw-cond">${w ? esc(w.text) : ''}</span>${w ? ' · ' : ''}<span id="clock-hm">${p2(n.getHours())}:${p2(n.getMinutes())}</span> ›</div></a>
    </div>
    <div class="pw-credit">${esc(pwCredit())}</div><button type="button" class="pw-fail" hidden>Fikk ikke lastet bildet · trykk for å prøve igjen</button></section>`;
}

function render2c(n, cardH) {
  return `<div class="p-dash">${photoWindow(n)}
    <div class="p-paper">
      <div class="p-search">${store.me.hideSearch ? '' : renderSearch()}</div>
      ${updBanner('dash')}
      <div id="p-ticker-slot"></div>
      <div class="p-cols">
        <div class="p-col">${card('p_school')}${hiddenWidgets().has('d_cal') ? '' : card('d_cal')}</div>
        <div class="p-col">${lab('AVGANGER')}<div id="trips" class="p-trips">${renderTrips()}</div>${hiddenWidgets().has('d_kal') ? '' : card('p_kal')}${hiddenWidgets().has('d_energy') ? '' : card('p_energy')}${card('p_wx')}${card('p_pk')}</div>
        <div class="p-col">${hiddenWidgets().has('d_pos') ? '' : card('p_pos')}${hiddenWidgets().has('d_bday') ? '' : card('p_bday')}${card('p_play')}${hiddenWidgets().has('d_trading') && hiddenWidgets().has('d_eco') ? '' : card('p_money')}${hiddenWidgets().has('d_links') ? '' : card('p_links')}</div>
      </div>
      <div class="grid" data-dnd="dash2c">${['d_upcoming', 'd_media', 'd_media_hist', 'd_trading', 'd_eco'].map(cardH).join('')}</div>
    </div></div>`;
}

let pkTimer2 = null;
function startPk2c() {
  if (pkTimer2) return;
  pkTimer2 = setInterval(() => { if (!document.hidden && document.querySelector('[data-w="p_pk"]')) load('trackw', '/tracking/widget'); }, 120_000);
}

/* ---------- Side ---------- */

export function render() {
  const n = store.now, mob = isMobile(), hid = hiddenWidgets();
  startPackages();
  requestAnimationFrame(() => restoreCarousel());
  // Skjulte widgets tegnes med hidden, så indeksene i lagret rekkefølge ikke forskyves.
  const cardH = (id) => hid.has(id) ? card(id).replace('<section ', '<section hidden ') : card(id);
  if (is2c()) { startPk2c(); return render2c(n, cardH); }
  const hello = `<div class="hello">
      <div class="greet"><span id="greet">${greeting(n.getHours())}</span>, <b>${esc(store.me.user)}</b></div>
      <div class="sub" id="date">${cap(n.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(store.me.place)}</div>
      <div class="clock"><div class="clock-hm" id="clock-hm">${p2(n.getHours())}:${p2(n.getMinutes())}</div><div class="clock-s" id="clock-s">${p2(n.getSeconds())}</div></div>
      <div id="lesson">${renderLesson()}</div></div>`;
  if (mob) {
    return `${updBanner('dash')}${hello}<div class="trips" id="trips">${renderTrips()}</div>${store.me.hideSearch ? '' : renderSearch()}
      <div class="grid" data-dnd="m_home">${['d_weather_m', 'd_agenda', 'd_trading', 'd_energy', 'd_eco', 'd_upcoming', 'd_media', 'd_media_hist', 'd_pos', 'd_bday', 'd_kal'].map(cardH).join('')}</div>`;
  }
  // Toppområdet kan omorganiseres; søkebaren ligger som standard mellom avganger og klokke.
  return `<div style="display:flex;flex-direction:column;gap:28px">
    ${updBanner('dash')}
    <div data-dnd="top" style="display:flex;flex-direction:column;gap:24px">
      <div class="trips" id="trips">${renderTrips()}</div>
      ${store.me.hideSearch ? '' : renderSearch()}
      <div class="hero">${hello}<div class="weather" id="weather">${carousel()}</div></div>
    </div>
    <div class="grid" data-dnd="dash">${['d_cal', 'd_agenda', 'd_trading', 'd_energy', 'd_eco', 'd_links', 'd_upcoming', 'd_media', 'd_media_hist', 'd_pos', 'd_bday', 'd_kal'].map(cardH).join('')}</div></div>`;
}

const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

// Kalles hvert sekund fra app.js.
export function tick() {
  const n = store.now;
  const hmEl = document.getElementById('clock-hm');
  if (!hmEl) return;
  hmEl.textContent = `${p2(n.getHours())}:${p2(n.getMinutes())}`;
  const sEl = document.getElementById('clock-s');
  if (sEl) sEl.textContent = p2(n.getSeconds());
  if (n.getSeconds() === 0) {
    document.getElementById('greet').textContent = greeting(n.getHours());
    setHtml('lesson', renderLesson());
    refresh('d_agenda', 'p_school');
    if (n.getHours() === 0 && n.getMinutes() === 0) refresh('d_cal');
  }
  if (n.getSeconds() % 15 === 0) setHtml('trips', renderTrips());
}

on('ruter', () => setHtml('trips', renderTrips()));
// Vær og pakker oppdateres i weather-card.js (bare lysbildene, så sveipeposisjonen beholdes).
on('school', () => { setHtml('lesson', renderLesson()); refresh('d_cal', 'd_agenda', 'p_school'); });
on('trading', () => refresh('d_trading', 'p_money'));
on('energy', () => refresh('d_energy', 'p_energy'));
on('upcoming', () => refresh('d_upcoming'));
on('finans', () => refresh('d_eco', 'p_money'));
// Vindu og papir: temperatur i vinduet og seksjonene for vær, pakker og media.
on('weather', () => {
  const w = store.data.weather;
  if (w) { setHtml('pw-temp', `${w.temp}°`); setHtml('pw-cond', esc(w.text)); }
  refresh('p_wx');
});
on('trackw', () => refresh('p_pk'));
on('media_now', () => refresh('p_play'));
