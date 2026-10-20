// Prompt 38 (SERVER38): nye kort i Now Brief – Pakker, Familie, Skole og jobb, Bursdager og Nordlys i natt – og
// «+ Gave til … i Gjøremål». Montert foran /api/brief (brief34.js): GET /api/brief får feltene under flettet inn.
//
// GET /api/brief (i tillegg til feltene fra prompt 34–37):
//   cards:[{id, on, label}]  rekkefølgen fra Innstillinger → Glimt → Brief (av = feltet under er null)
//   packages:{count, label:'2 PÅ VEI', items:[{id, carrier, carrierId, logo, name, status, due, dueRed, deepLink}], first}   bare egne pakker
//   family:{label, text, items:[{userId, name, avatar, initial, color, state, place, since, dot, home}]}   bare de som deler posisjon med deg
//   school:{label:'NESTE 7 DAGER', items:[{id, title, kind:'prove'|'frist'|'mote', date, time, room, daysLeft, color, red, deepLink}]}
//          Studie/Jobb-kalenderen, rød ved ≤ 4 dager
//   birthdays:{label:'NESTE', items:[{id, name, age, date, dateLabel, text:'Fyller 12 · tir 23. okt', daysLeft, red, color, avatarUrl}]}   30 dager
//   aurora:{show, kp, cloud, best:'22–01', text, level:'GODE'|'MULIGE', label:'KP 4 · GODE SJANSER', source, updatedAt}
//          show bare i kvelds- og nattbrief og når Kp ≥ 3 (NOAA SWPC Kp-prognose + MET skydekke; mock med MOCK_DATA=1)
// POST /api/brief/gift {name, date:'YYYY-MM-DD'} → 201 {ok, created:true, item} | 200 {ok, created:false, item} (finnes fra før)
//   Legger «Kjøp gave til X» i «Mine» med forfall to dager før (i dag om det er nærmere), tag #gave.
// Push kl. 20 (Oslo) når Kp ≥ 4 og skydekket < 40 % (auroraNotify i /api/glimt/settings, kortet «aurora» på).
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { config } from './config.js';
import { authOrToken } from './mobile.js';
import { packagesFor } from './tracking.js';
import { positions } from './family.js';
import { listFor as birthdaysOf } from './birthdays.js';
import { eventsFor } from './calendar.js';
import { fagKey, subjectColor } from './kal37.js';
import { insertTask, mineListOf } from './tasks.js';
import { notifyUser } from './notify.js';
import { cached } from './cache.js';
import { cardsOf, cardOn, auroraNotifyOf } from './cards38.js';

const MOCK = process.env.MOCK_DATA === '1';
const TZ = 'Europe/Oslo';
const WD = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const MS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const osloDate = (t = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(t));
const osloHour = (t = Date.now()) => +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const osloHm = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const dayLabel = (d) => { const x = new Date(`${d}T12:00:00Z`); return `${WD[x.getUTCDay()]} ${x.getUTCDate()}. ${MS[x.getUTCMonth()]}`; };
const withTimeout = (p, ms, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((r) => setTimeout(() => r(fallback), ms).unref?.())]);

/* ---------------- Pakker (bare egne) ---------------- */

// Transportørens logo (URL) – shipment.logo er butikkens logo-objekt med carrierLogo inni, eller en URL.
const logoUrl = (p) => (typeof p.carrierLogo === 'string' ? p.carrierLogo : p.carrierLogo?.url) ?? (typeof p.logo === 'string' ? p.logo : p.logo?.carrierLogo?.url) ?? null;
export function packagesPart(u, today = osloDate()) {
  let list = [];
  try { list = packagesFor(10, u); } catch { list = []; }
  const items = list.map((p) => {
    const ready = p.status === 'ready_for_pickup';
    const dl = p.pickup?.deadline && DATE.test(String(p.pickup.deadline).slice(0, 10)) ? String(p.pickup.deadline).slice(0, 10) : null;
    const eta = p.eta && DATE.test(String(p.eta).slice(0, 10)) ? String(p.eta).slice(0, 10) : null;
    let due = null, dueRed = false;
    if (ready) { due = dl ? `Hent innen ${dayLabel(dl)}` : 'Klar nå'; dueRed = !dl || diffDays(today, dl) <= 3; }
    else if (p.status === 'out_for_delivery') { due = 'I dag'; dueRed = false; }
    else if (eta) { const n = diffDays(today, eta); due = n <= 0 ? 'I dag' : n === 1 ? 'I morgen' : dayLabel(eta); }
    const point = p.pickup?.name ?? p.pickupPoint ?? null;
    return { id: p.id, carrier: p.carrierName ?? p.carrier ?? null, carrierId: p.carrier ?? null, logo: logoUrl(p), shopLogo: typeof p.logo === 'object' ? p.logo?.url ?? null : null,
      color: p.carrierColor ?? null, fg: p.carrierFg ?? '#fff', ini: p.carrierIni ?? null,
      name: p.title || p.name || p.shop || 'Pakke', status: `${p.statusText ?? ''}${ready && point && !String(p.statusText ?? '').includes(point) ? ` · ${point}` : ''}`.trim() || null,
      due, dueRed, deepLink: `finanshub://sporing/${p.id}` };
  });
  const count = list[0]?.activeCount ?? items.length;
  return { count, label: `${count} PÅ VEI`, items, first: items[0] ? { title: items[0].name, statusText: items[0].status } : null };
}

/* ---------------- Familie (bare de som deler med deg) ---------------- */

export async function familyPart(u, kind) {
  let rows = [];
  try { rows = await withTimeout(positions(u), 3000, []); } catch { rows = []; }
  const items = rows.filter((m) => !m.self && m.status !== 'off').map((m) => {
    const home = /hjem/i.test(m.sone ?? '');
    const state = m.sone ?? (m.aktivitet ? m.aktivitet[0].toUpperCase() + m.aktivitet.slice(1) : 'Sist sett');
    return { userId: m.userId, name: m.name, avatar: m.photoUrl ?? null, initial: String(m.name ?? '?')[0], color: m.farge ?? null, state, place: m.sted ?? null,
      since: m.oppdatert ?? null, text: m.linje2 ?? null, dot: m.status === 'fresh' ? '#2f7a4f' : '#d9a400', home };
  });
  const names = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} og ${xs.at(-1)}`);
  const out = items.filter((x) => !x.home).map((x) => x.name), inn = items.filter((x) => x.home).map((x) => x.name);
  const text = !items.length ? null : kind === 'evening' || kind === 'night'
    ? (inn.length ? `${names(inn)} ${inn.length > 1 ? 'er' : 'er'} hjemme.` : 'Ingen er hjemme ennå.')
    : (out.length ? `${names(out)} har dratt.` : 'Alle er hjemme.');
  return { label: items.length ? 'DELER POSISJON MED DEG' : null, text, items };
}

/* ---------------- Skole og jobb (neste 7 dager) ---------------- */

const isTrial = (e) => e.source === 'trials' || e.kind === 'trial' || /-prøven slutter/i.test(e.title ?? '');
export async function schoolPart(u, today = osloDate(), now = Date.now()) {
  let events = [];
  try { events = (await withTimeout(eventsFor(u, today, addDays(today, 7)), 4000, { events: [] })).events ?? []; } catch { events = []; }
  const items = events.filter((e) => !isTrial(e) && e.date >= today && e.date <= addDays(today, 7)).map((e) => {
    const t = String(e.title ?? '');
    const prove = e.type === 'prove' || e.kind === 'prove' || e.kind === 'eksamen' || ((e.appCalendar === 'studie' || e.appCalendar === 'skole') && /prøve|eksamen|tentamen|quiz/i.test(t));
    const frist = !prove && (e.type === 'innl' || e.kind === 'frist' || /^frist\b|innlevering|oblig/i.test(t));
    const mote = !prove && !frist && (e.appCalendar === 'jobb' || e.appKind === 'jobb') && (e.important || e.flag || e.prio > 0 || /viktig|presentasjon|kvartal|møte/i.test(t));
    if (!prove && !frist && !mote) return null;
    if (!e.allDay && e.start && Date.parse(e.end ?? e.start) < now) return null;
    let color = e.appColor ?? e.color ?? '#2b5d8a';
    if (prove || frist) { try { color = subjectColor(u, fagKey(t, e.subject ?? null))?.c ?? color; } catch { /* */ } }
    const daysLeft = diffDays(today, e.date);
    return { id: e.id, title: t, kind: prove ? 'prove' : frist ? 'frist' : 'mote', date: e.date, dateLabel: dayLabel(e.date), time: e.allDay || !e.start ? null : osloHm(e.start),
      room: e.room || e.location || null, daysLeft, daysLabel: daysLeft === 0 ? 'i dag' : daysLeft === 1 ? '1 dag' : `${daysLeft} dager`, color, red: daysLeft <= 4,
      deepLink: `kalender://dag/${e.date}` };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))).slice(0, 6);
  return { label: 'NESTE 7 DAGER', items };
}

/* ---------------- Bursdager (30 dager) ---------------- */

export function birthdaysPart(u, today = osloDate()) {
  let list = [];
  try { list = birthdaysOf(u, today); } catch { list = []; }
  const items = list.filter((b) => b.daysLeft >= 0 && b.daysLeft <= 30).slice(0, 5).map((b) => ({
    id: b.id, name: b.name, age: b.age ?? null, date: b.nextDate, dateLabel: dayLabel(b.nextDate),
    text: `${b.age ? `Fyller ${b.age} · ` : ''}${dayLabel(b.nextDate)}`, daysLeft: b.daysLeft, red: b.daysLeft <= 3, color: b.color ?? null, avatarUrl: b.avatarUrl ?? null,
    gift: { name: b.name, date: b.nextDate } }));
  return { label: 'NESTE', items };
}

/* ---------------- Nordlys (NOAA SWPC + MET) ---------------- */

let F = (u, i) => fetch(u, i), injected = false;
export const _setAuroraFetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); injected = !!fn; };
let auroraMock = null;
export const _setAuroraMock = (v) => { auroraMock = v; };
const NOAA = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

/** Høyeste Kp-prognose for natten (18–06 Oslo) fra NOAA SWPC. Godtar både tabell- og objektform. */
export function kpTonight(json, t = Date.now()) {
  const rows = Array.isArray(json) ? json : [];
  const pts = [];
  for (const r of rows) {
    const time = Array.isArray(r) ? r[0] : r?.time_tag, kp = Array.isArray(r) ? r[1] : r?.kp ?? r?.Kp;
    if (!time || time === 'time_tag') continue;
    const ms = Date.parse(String(time).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(String(time)) ? '' : 'Z'));
    const v = Number(kp);
    if (Number.isFinite(ms) && Number.isFinite(v)) pts.push({ ms, v });
  }
  const start = t - 2 * 3600_000, end = t + 14 * 3600_000;
  const win = pts.filter((p) => p.ms >= start && p.ms <= end).filter((p) => { const h = osloHour(p.ms); return h >= 18 || h < 6; });
  return win.length ? Math.round(Math.max(...win.map((p) => p.v)) * 10) / 10 : null;
}
/** Skydekke (%) og beste tid fra MET locationforecast (timeseries[].data.instant.details.cloud_area_fraction), 21–03 Oslo. */
export function cloudTonight(json, t = Date.now()) {
  const ts = (json?.properties?.timeseries ?? []).map((x) => ({ ms: Date.parse(x.time), c: x.data?.instant?.details?.cloud_area_fraction }))
    .filter((x) => Number.isFinite(x.ms) && Number.isFinite(x.c) && x.ms >= t - 3600_000 && x.ms <= t + 16 * 3600_000)
    .filter((x) => { const h = osloHour(x.ms); return h >= 21 || h < 3; });
  if (!ts.length) return { cloud: null, best: null };
  let bi = 0, bv = Infinity;
  for (let i = 0; i < ts.length; i++) { const w = ts.slice(i, i + 3), v = w.reduce((a, x) => a + x.c, 0) / w.length; if (v < bv) { bv = v; bi = i; } }
  const w = ts.slice(bi, bi + 3);
  const h1 = osloHour(w[0].ms), h2 = (osloHour(w.at(-1).ms) + 1) % 24;
  return { cloud: Math.round(w.reduce((a, x) => a + x.c, 0) / w.length), best: `${String(h1).padStart(2, '0')}–${String(h2).padStart(2, '0')}` };
}
function placeOf(u) {
  const list = kv.get(u, 'wx_places', null);
  const own = Array.isArray(list) && list[0]?.lat != null ? list[0] : null;
  return own ? { lat: +own.lat, lon: +own.lon, name: own.name ?? 'Oslo' } : { lat: config.location.lat, lon: config.location.lon, name: config.location.name || 'Oslo' };
}
async function fetchJ(url, ms = 6000) {
  const r = await F(url, { headers: { 'user-agent': config.metUserAgent, accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const levelOf = (kp) => (kp >= 5 ? 'SVÆRT GODE' : kp >= 4 ? 'GODE' : kp >= 3 ? 'MULIGE' : 'SMÅ');
export function auroraText(a, place = 'Oslo') {
  if (a.kp == null) return 'Fant ingen nordlysprognose akkurat nå.';
  if (a.kp >= 4 && (a.cloud ?? 100) < 40) return `Glimt anbefaler å se nordover${a.best ? ` mellom kl. ${a.best.replace('–', ' og ')}` : ' etter kl. 22'}. Lite skyer over ${place}. Finn et mørkt sted uten gatelys.`;
  if (a.kp >= 4) return `Gode sjanser for nordlys, men ${a.cloud ?? '?'} % skydekke over ${place}. Følg med om det klarner${a.best ? ` rundt ${a.best}` : ''}.`;
  return `Nordlys er mulig lavt i nord${a.best ? ` rundt ${a.best}` : ' etter kl. 23'} om det klarner. Følg med på varselet.`;
}
/** Nordlys for brukeren i kveld/natt. kind morning/day → show:false uten nettkall. */
export async function auroraPart(u, kind, t = Date.now()) {
  const base = { show: false, kp: null, cloud: null, best: null, text: null, level: null, label: null, source: 'NOAA SWPC · MET', updatedAt: new Date(t).toISOString() };
  if (kind !== 'evening' && kind !== 'night') return base;
  const p = placeOf(u);
  let kp = null, cl = { cloud: null, best: null }, src = base.source;
  if (auroraMock) { kp = auroraMock.kp ?? null; cl = { cloud: auroraMock.cloud ?? null, best: auroraMock.best ?? null }; }
  else if (MOCK && !injected) { kp = 4; cl = { cloud: 15, best: '22–01' }; src = 'Eksempeldata (NOAA SWPC · MET)'; }
  else {
    const [k, c] = await Promise.all([
      cached('aurora38:kp', 30 * 60_000, () => fetchJ(NOAA)).then((j) => kpTonight(j, t)).catch(() => null),
      cached(`aurora38:met:${p.lat.toFixed(2)},${p.lon.toFixed(2)}`, 30 * 60_000, () => fetchJ(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}`))
        .then((j) => cloudTonight(j, t)).catch(() => ({ cloud: null, best: null })),
    ]);
    kp = k; cl = c;
  }
  const a = { ...base, kp, cloud: cl.cloud, best: cl.best, source: src };
  a.level = kp == null ? null : levelOf(kp);
  a.label = kp == null ? null : `KP ${String(kp).replace('.', ',')} · ${a.level} SJANSER`;
  a.text = auroraText(a, p.name);
  a.show = kp != null && kp >= 3;
  return a;
}

/* ---------------- Alle kortene ---------------- */

/** De nye kortene for briefen (null for kort som er slått av). */
export async function brief38Cards(u, kind, t = Date.now()) {
  const today = osloDate(t);
  const cards = cardsOf(u);
  const on = (id) => cards.find((x) => x.id === id)?.on !== false;
  const [family, school, aurora] = await Promise.all([
    on('family') ? familyPart(u, kind) : null,
    on('school') ? schoolPart(u, today, t) : null,
    on('aurora') ? auroraPart(u, kind, t).catch(() => null) : null,
  ]);
  return { cards, packages: on('packages') ? packagesPart(u, today) : null, family, school, birthdays: on('birthdays') ? birthdaysPart(u, today) : null, aurora };
}

/* ---------------- Gave til … i Gjøremål ---------------- */

export function addGiftTask(u, name, date, today = osloDate()) {
  const n = String(name ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  if (!n) throw Object.assign(new Error('Mangler navn'), { status: 400 });
  if (!DATE.test(String(date ?? ''))) throw Object.assign(new Error('date må være YYYY-MM-DD'), { status: 400 });
  let due = addDays(date, -2);
  if (due < today) due = today;
  const title = `Kjøp gave til ${n}`;
  const list = mineListOf(u);
  if (!list) throw Object.assign(new Error('Fant ikke listen Mine'), { status: 500 });
  const old = db.prepare('SELECT * FROM hl_tasks WHERE list=? AND title=? AND done=0 AND archived_at IS NULL').get(list, title);
  if (old) return { created: false, row: old };
  return { created: true, row: insertTask(u, { title, list, due, tags: JSON.stringify(['gave']), note: `Bursdag ${dayLabel(date)}` }) };
}

/* ---------------- Push kl. 20 ---------------- */

/** Kalles hvert minutt. Mellom 20:00 og 20:15 (Oslo): én push per bruker per dag når Kp ≥ 4 og skydekke < 40 %. → antall sendt */
export async function auroraPushTick(t = Date.now(), { force = false } = {}) {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
  if (!force && !(hm >= '20:00' && hm < '20:15')) return 0;
  const day = osloDate(t);
  let n = 0;
  for (const { id } of db.prepare('SELECT id FROM users').all()) {
    if (!auroraNotifyOf(id) || !cardOn(id, 'aurora') || kv.get(id, 'aurora38_pushed', null) === day) continue;
    const a = await auroraPart(id, 'evening', t).catch(() => null);
    if (!a || a.kp == null || a.kp < 4 || a.cloud == null || a.cloud >= 40) continue;
    kv.set(id, 'aurora38_pushed', day);
    await notifyUser(id, { title: `Nordlys i kveld · Kp ${String(a.kp).replace('.', ',')}`, body: a.text, url: '/?brief=1', tag: `aurora-${day}`, category: 'system', data: { kind: 'aurora', kp: a.kp, cloud: a.cloud, best: a.best } }).catch(() => {});
    n++;
  }
  return n;
}

/* ---------------- Ruter (montert foran brief34 på /api/brief) ---------------- */

export const brief38Api = new Hono();
brief38Api.use('/', async (c, next) => {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/json/.test(c.res.headers.get('content-type') ?? '')) return;
  const u = c.get('user');
  if (!u) return;
  try {
    const b = await c.res.clone().json();
    const extra = await brief38Cards(u, b.kind);
    const packages = extra.packages ? { ...(b.packages ?? {}), ...extra.packages } : extra.packages;
    c.res = c.json({ ...b, ...extra, packages }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) { console.warn('[brief38]', e.message); }
});
brief38Api.post('/gift', authOrToken, async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  try {
    const r = addGiftTask(c.get('user'), b.name, b.date);
    const tags = (() => { try { return JSON.parse(r.row.tags); } catch { return []; } })();
    return c.json({ ok: true, created: r.created, item: { id: r.row.id, title: r.row.title, due: r.row.due, list: r.row.list, tags } }, r.created ? 201 : 200);
  } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
});

let timer = null;
export function startBrief38() {
  if (timer) return;
  timer = setInterval(() => { auroraPushTick().catch((e) => console.warn('[nordlys]', e.message)); }, 60_000);
  timer.unref?.();
}
