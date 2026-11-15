// Brief: de ni brief-kortene for innlogget bruker, filtrert på tilgang (barn, Homelab, Domener, Aksjer), og «Start» for Homelab.
//   GET  /api/brief52                       → kortene (?only=…)
//   POST /api/brief52/homelab/:id/start     → «Start» (bare admin; start/omstart via Docker-proxyen, bare de faste handlingene)
//   GET/PUT /api/admin/brief52/access       → hvem som er barn / har Homelab, Domener, Aksjer (bare admin)
// Butikklogoene for lister (POST /finans/api/logos52/batch, GET /finans/api/logos52/match) ligger i logos/local.js og monteres i
// finans/routes.js. Før i srv52.js; montert fra mountGlimtEarly (glimt/index.js).
import { Hono } from 'hono';
import { q, kv, OWNER } from '../db.js';
import { authOrToken } from '../mobile.js';
import { userInfo, listUsers, isAdmin } from '../auth/session.js';
import { runAsUser } from '../settings.js';
import { osloTodayISO } from '../dates/quick.js'; // dato og tid fra den felles tolkeren
import { glimtSettingsOf } from './settings.js';
import { rawCards73, B52_OF73, KEY_OF_B52 } from '../brief73.js'; // prompt 73: Innhold i briefen (rekkefølge og av/på)
import { dtf } from '../intl-format.js'; // gjenbrukte Intl.DateTimeFormat

const DAY = 86_400_000;
const NO_STORE = { 'Cache-Control': 'no-store' };
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const bad = (c, error, status = 400) => c.json({ error }, status, NO_STORE);
const hasTable = (t) => !!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const withTimeout = (p, ms, fallback = null) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((res) => { setTimeout(() => res(fallback), ms); })]);
const firstName = (u) => { const x = userInfo(u); return String(x?.displayName || x?.name || x?.username || '').trim().split(/\s+/)[0] || null; };
const nb2 = (n) => new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\s/g, ' ');
const nb0 = (n) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(n).replace(/\s/g, ' ');
const krText = (n) => `${nb2(n)} kr`;
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON_S = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const WD_S = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
const dOf = (ymd) => new Date(`${ymd}T12:00:00Z`);
const addDays = (ymd, n) => new Date(dOf(ymd).getTime() + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((dOf(b) - dOf(a)) / DAY);
const longDate = (ymd) => { const d = dOf(ymd); return `${WD[d.getUTCDay()]} ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`; };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const shortDate = (ymd) => { const d = dOf(ymd); return `${WD_S[d.getUTCDay()]} ${d.getUTCDate()}. ${MON_S[d.getUTCMonth()]}`; };

const ACCESS_KEY52 = 'brief52_access';
export function briefAccess52() {
  const a = kv.get(OWNER, ACCESS_KEY52, {}) ?? {};
  const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && userInfo(x)) : []);
  return { children: ids(a.children), homelab: ids(a.homelab), domains: ids(a.domains), stocks: ids(a.stocks) };
}
export const isChild52 = (u) => briefAccess52().children.includes(u);
const mediaOk52 = async (u) => { try { const { mediaAllowed43 } = await import('../media/arr.js'); return mediaAllowed43(u); } catch { return isAdmin(u); } };
const CARDS52 = [['focus', '1b', 'Dagens fokus'], ['trip', '3b', 'Min reise'], ['todo', '4a', 'Huskeliste'], ['bills', '2a', 'Regninger'], ['clothes', '9b', 'Klær'],
  ['tonight', '5b', 'Nytt i kveld'], ['homelab', '6a', 'Homelab'], ['domains', '7a', 'Domener'], ['stocks', '8b', 'Aksjer']];
/** Hvilke kort brukeren får. → {allowed:Set, hidden:[{id, reason}]} */
export async function briefCardsFor52(u) {
  const admin = isAdmin(u), acc = briefAccess52(), child = acc.children.includes(u) && !admin;
  const media = await mediaOk52(u);
  const hidden = [];
  const allowed = new Set();
  for (const [id] of CARDS52) {
    let why = null;
    if (child && ['bills', 'tonight', 'homelab', 'domains', 'stocks'].includes(id)) why = 'child';
    else if (id === 'tonight' && !media) why = 'access';
    else if (['homelab', 'domains', 'stocks'].includes(id) && !admin && !acc[id].includes(u)) why = 'access';
    if (why) hidden.push({ id, reason: why }); else allowed.add(id);
  }
  return { allowed, hidden, admin, child };
}
const kindNow52 = (t = Date.now()) => { const h = +dtf('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)); return h < 5 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 22 ? 'evening' : 'night'; };
const GREET52 = { morning: 'God morgen', day: 'Hei', evening: 'God kveld', night: 'God natt' };

function clothesOf52(w) {
  if (!w?.now) return null;
  const t = w.now.temp, lo = w.lo ?? t, rain = !!w.umbrella;
  const items = [];
  if (lo <= 0) items.push('vinterjakke', 'lue', 'votter'); else if (lo <= 7) items.push('varm jakke', 'lue'); else if (lo <= 14) items.push('lett jakke'); else items.push('t-skjorte');
  if (rain) items.unshift('regnjakke');
  const text = rain ? `${cap(items[0])}${items[1] ? ` og ${items[1]}` : ''} i dag – det blir regn${w.rainFrom ? ` fra ${w.rainFrom}` : ''}.` : `${cap(items.join(', ').replace(/, ([^,]*)$/, ' og $1'))} i dag.`;
  return { temp: t, hi: w.hi ?? null, lo: w.lo ?? null, rain, text, items, place: w.place ?? null, cond: w.cond ?? null };
}
function billsOf52(u, today) {
  const items = [];
  const horizon = addDays(today, 14);
  try {
    if (hasTable('fh_subscriptions')) for (const s of q("SELECT name, price, next_date FROM fh_subscriptions WHERE user_id=? AND active=1 AND next_date IS NOT NULL AND next_date>=? AND next_date<=? ORDER BY next_date LIMIT 20").all(u, today, horizon)) {
      items.push({ name: s.name, amount: Math.abs(s.price ?? 0) / 100, due: s.next_date });
    }
  } catch { /* */ }
  try {
    if (hasTable('fh_recurring')) for (const r of q('SELECT name, amount, interval, day, month FROM fh_recurring WHERE user_id=? AND active=1').all(u)) {
      const due = nextDue52(r, today);
      if (due && due <= horizon && !items.some((x) => x.name === r.name && x.due === due)) items.push({ name: r.name, amount: Math.abs(r.amount ?? 0) / 100, due });
    }
  } catch { /* */ }
  items.sort((a, b) => a.due.localeCompare(b.due));
  const list = items.slice(0, 5).map((x) => ({ ...x, amount_text: krText(x.amount), days: daysBetween(today, x.due), due_label: x.due === today ? 'i dag' : x.due === addDays(today, 1) ? 'i morgen' : shortDate(x.due) }));
  const sum = Math.round(items.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  return { items: list, count: items.length, sum, sum_text: krText(sum) };
}
function nextDue52(r, today) {
  const [y, m, d] = today.split('-').map(Number);
  const day = Math.max(1, Math.min(28, +r.day || 1));
  const pad = (n) => String(n).padStart(2, '0');
  if (r.interval === 'weekly') return null;
  if (r.interval === 'yearly') { const mm = +r.month || 1; let cand = `${y}-${pad(mm)}-${pad(day)}`; if (cand < today) cand = `${y + 1}-${pad(mm)}-${pad(day)}`; return cand; }
  let cand = `${y}-${pad(m)}-${pad(day)}`;
  if (cand < today) { const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y; cand = `${ny}-${pad(nm)}-${pad(day)}`; }
  return cand;
}
async function homelabOf52(u) {
  const { containers51 } = await import('../system/observability/health.js');
  const ct = await withTimeout(containers51(), 4000, null);
  if (!ct) return { error: 'Docker svarte ikke' };
  if (!ct.available) return { ok: 0, down: 0, services: [], error: ct.error ?? 'Docker-proxyen er ikke satt opp' };
  const admin = isAdmin(u);
  const services = ct.items.map((x) => {
    const state = x.state !== 'running' ? (x.state === 'restarting' ? 'restarting' : 'exited') : x.health === 'unhealthy' ? 'unhealthy' : 'running';
    return { id: x.id, name: x.name, state, health: x.health ?? null, can_start: admin && !x.self && (state === 'exited' || state === 'unhealthy'), action: state === 'unhealthy' ? 'restart' : state === 'exited' ? 'start' : null };
  });
  return { ok: services.filter((s) => s.state === 'running').length, down: services.filter((s) => s.state !== 'running').length, total: services.length, services: services.slice(0, 24) };
}
async function domainsOf52() {
  const D = await import('../domener/domains.js');
  const o = D.domainOverview();
  const items = o.items.slice(0, 8).map((x) => ({ name: x.name, up: x.up, ms: x.ms, ssl_days: o.expiringSoon.find((e) => e.name === x.name)?.days ?? null }));
  return { total: o.total, up: o.up, down: o.down, warn: o.expiringSoon.length + o.down, items, expiring: o.expiringSoon };
}
async function stocksOf52(u) {
  const { cachedStocks } = await import('../finans/stocks.js');
  const s = cachedStocks(u);
  if (!s) return null;
  const sum = s.summary ?? {};
  const value = sum.total ?? sum.value ?? sum.totalValue ?? null;
  const pct = sum.ppl != null && value ? Math.round((sum.ppl / Math.max(1, value - sum.ppl)) * 1000) / 10 : sum.changePct ?? null;
  const items = (s.positions ?? []).slice().sort((a, b) => Math.abs(b.pplPct ?? b.changePct ?? 0) - Math.abs(a.pplPct ?? a.changePct ?? 0)).slice(0, 4)
    .map((p) => ({ name: p.name ?? p.ticker, ticker: p.ticker ?? null, change_pct: p.pplPct ?? p.changePct ?? null, value: p.value ?? null }));
  return { value, value_text: value != null ? `${nb0(value)} kr` : null, change_pct: pct, items, synced_at: s.syncedAt ? new Date(s.syncedAt).toISOString() : null, status: s.status ?? null };
}
async function tonightOf52(today) {
  const { upcoming43 } = await import('../media/arr.js');
  const up = await withTimeout(upcoming43(1), 4000, null);
  if (!up) return { items: [], error: 'Media svarte ikke' };
  const items = (up.items ?? []).filter((x) => x.date === today).slice(0, 5).map((x) => ({ title: x.title, subtitle: [x.code, x.episodeTitle].filter(Boolean).join(' · ') || null, time: x.time || null, kind: x.kind, poster: x.poster ?? null }));
  return { items, count: items.length, configured: up.configured !== false };
}
async function tripOf52(u) {
  const { myTrip41 } = await import('../reise/ruter.js');
  const t = await withTimeout(myTrip41(u), 4000, null);
  if (!t || t.empty || !t.options?.length) return null;
  const now = Date.now();
  return { label: t.label, from: t.from, to: t.to, items: t.options.slice(0, 3).map((o) => { const l = o.legs?.find((x) => x.mode !== 'foot') ?? o.legs?.[0] ?? {}; return { line: l.line ?? null, mode: l.mode ?? null, from: l.from ?? null, dest: o.via ?? l.to ?? null, dep: l.dep ?? null, arr: o.arr ?? null, in_min: l.dep ? Math.max(0, Math.round((Date.parse(l.dep) - now) / 60000)) : null, badges: o.badges ?? [] }; }), alert: t.alert ?? null, source: t.source ?? null };
}
// Prompt 73: grunnlaget (buildBrief) deles av Dagens fokus, Huskeliste og Klær – også når kortene hentes hver for seg (?only=).
const base73 = new Map(); // bruker → {at, p}
function briefBase73(u, t) {
  const hit = base73.get(u);
  if (hit && Date.now() - hit.at < 20_000) return hit.p;
  const p = (async () => { try { const { buildBrief } = await import('./brief.js'); return await withTimeout(runAsUser(u, () => buildBrief(u, { t, llm: false, raw: true })), 6000, null); } catch { return null; } })();
  base73.set(u, { at: Date.now(), p });
  p.then((v) => { if (!v) base73.delete(u); });
  return p;
}
/** Prompt 73: bare kortene som er på i «Innhold i briefen», i den rekkefølgen. only:['focus', …] gir bare de kortene (henting per kort).
 *  Hvert kort har 6 s; svarer det ikke, kommer det med error:'Klarte ikke hente' (kortet blir stående). order: alle nøkler som er på. */
export async function brief52(u, { t = Date.now(), only = null } = {}) {
  const today = osloTodayISO(new Date(t));
  const { allowed, hidden, admin, child } = await briefCardsFor52(u);
  const kind = kindNow52(t);
  const name = firstName(u);
  const list73 = rawCards73(u);
  const blocked = new Set(hidden.map((h) => KEY_OF_B52[h.id]).filter(Boolean));
  const order = list73.filter((x) => x.on && !blocked.has(x.key)).map((x) => x.key);
  const want = new Set(order.map((k) => B52_OF73[k]).filter(Boolean).filter((id) => allowed.has(id) && (!only || only.includes(id))));
  const needB = ['focus', 'todo', 'clothes'].some((id) => want.has(id));
  const b = needB ? await briefBase73(u, t) : null;
  const safe = async (fn) => { try { const v = await withTimeout(fn(), 6000, { __timeout: true }); return v; } catch (e) { return { __error: e?.message ?? String(e) }; } };
  const tasks = {
    focus: async () => {
      if (!b) return null;
      const ev = b.events ?? [];
      const todayEv = ev.filter((e) => e.date === today);
      const next = b.next ? { title: b.next.title, time: b.next.time, label: b.next.label, in_min: b.next.inMin } : null;
      const top = (b.todos?.items ?? [])[0]?.title ?? null;
      const text = todayEv.length ? `${todayEv.length === 1 ? 'Én avtale' : `${todayEv.length} avtaler`} i dag${next ? ` · neste: ${next.title} kl. ${next.time}` : ''}.` : top ? `Ingen avtaler i dag. Viktigst: ${top}.` : 'Ingen avtaler i dag.';
      return { text, count: todayEv.length, next, events: todayEv.slice(0, 3).map((e) => ({ title: e.title, time: e.time, place: e.place })), top_task: top };
    },
    trip: () => tripOf52(u),
    todo: async () => { const td = b?.todos ?? null; return td ? { top: (td.items ?? []).slice(0, 3).map((x) => ({ id: x.id ?? null, title: x.title, due: x.due ?? null, overdue: !!x.overdue })), open: td.count ?? (td.items ?? []).length, overdue: td.overdue ?? 0, text: td.text ?? null } : null; },
    bills: () => runAsUser(u, () => billsOf52(u, today)),
    clothes: async () => clothesOf52(b?.weather),
    tonight: () => tonightOf52(today),
    homelab: () => homelabOf52(u),
    domains: () => domainsOf52(),
    stocks: () => stocksOf52(u),
  };
  // Rekkefølgen er brukerens (Innhold i briefen); alle kortene hentes samtidig.
  const ids = order.map((k) => CARDS52.find(([id]) => id === B52_OF73[k])).filter((x) => x && want.has(x[0]));
  const datas = await Promise.all(ids.map(([id]) => safe(tasks[id])));
  const cards = [];
  const EMPTY = { trip: 'Ingen reise satt opp i dag', bills: 'Ingen regninger denne uka', tonight: 'Ingenting nytt i kveld', todo: 'Ingenting på lista' };
  ids.forEach(([id, variant, title], i) => {
    let data = datas[i];
    let error = null;
    if (data && data.__timeout) { error = 'Klarte ikke hente'; data = null; }
    if (data && data.__error) { error = 'Ingen data akkurat nå'; data = null; }
    if (data?.error && !error) error = data.error;
    // Prompt 73: kortet skjules aldri etter at det er vist – uten innhold får det en kort tomtekst (empty:true).
    cards.push({ id, key: KEY_OF_B52[id], variant, title, data: data ?? null, ...(error ? { error } : !data ? { error: EMPTY[id] ?? 'Ingen data akkurat nå', empty: true } : {}) });
  });
  const gs = glimtSettingsOf(u);
  return { user: { id: u, name: firstName(u), first: name, admin, child }, greeting: `${GREET52[kind]}${name ? `, ${name}` : ''}`, kind, date: today, date_label: longDate(today), glimt_char: gs.char, cards, hidden, order, fetched_at: new Date().toISOString() };
}

/* 5. Butikklogoer for lister: se logos52.js (egen modul uten tunge avhengigheter, montert i finans/routes.js). */
export { localLogo52, mountLogos52 } from '../logos/local.js';

const adminOnly = async (c, next) => { if (!isAdmin(c.get('user'))) return bad(c, 'Bare administratorer kan gjøre dette', 403); await next(); };
export const myBriefApi = new Hono();
// NB: authOrToken per rute (ikke use('*')): ruteren monteres på /api og skal ikke treffe andre /api-ruter.
const A = authOrToken;

myBriefApi.get('/brief52', A, async (c) => { const o = String(c.req.query('only') ?? '').split(',').map((x) => x.trim()).filter(Boolean); return c.json(await brief52(c.get('user'), { only: o.length ? o : null }), 200, NO_STORE); });
myBriefApi.post('/brief52/homelab/:id/start', A, adminOnly, async (c) => {
  const id = String(c.req.param('id') ?? '').slice(0, 80);
  const [{ containers51 }, { docker51, docker52 }] = await Promise.all([import('../system/observability/health.js'), import('../system/docker-logs.js')]);
  const ct = await containers51({ force: true });
  if (!ct.available) return bad(c, ct.error ?? 'Docker-proxyen er ikke satt opp', 503);
  const x = ct.items.find((i) => i.id === id || i.name === id);
  if (!x) return bad(c, 'Fant ikke tjenesten', 404);
  if (x.self) return bad(c, 'Homelab kan ikke starte seg selv herfra', 409);
  const action = x.state !== 'running' ? 'start' : x.health === 'unhealthy' ? 'restart' : null;
  if (!action) return bad(c, `${x.name} kjører allerede`, 409);
  try {
    const r = action === 'start' ? await docker52.start(x.name) : await docker51.restart(x.name);
    console.log(`docker.${action} container=${x.name} by=${c.get('user')} (brief52)`);
    return c.json({ ok: true, id: x.id, name: x.name, action, state: action === 'start' ? 'starting' : 'restarting', message: r?.message ?? null });
  } catch (e) { return bad(c, e.message ?? 'Kunne ikke starte tjenesten', e.status ?? 502); }
});
myBriefApi.get('/admin/brief52/access', A, adminOnly, (c) => c.json({ ...briefAccess52(), users: listUsers().map((x) => ({ id: x.id, name: x.displayName || x.name || x.username, role: x.role })) }, 200, NO_STORE));
myBriefApi.put('/admin/brief52/access', A, adminOnly, async (c) => {
  const b = await body(c);
  const cur = briefAccess52();
  for (const k of ['children', 'homelab', 'domains', 'stocks']) {
    if (b[k] === undefined) continue;
    if (!Array.isArray(b[k]) || b[k].some((x) => typeof x !== 'string' || !userInfo(x))) return bad(c, `${k} må være en liste med bruker-id-er`);
    cur[k] = [...new Set(b[k])];
  }
  kv.set(OWNER, ACCESS_KEY52, cur);
  return c.json({ ...briefAccess52(), users: listUsers().map((x) => ({ id: x.id, name: x.displayName || x.name || x.username, role: x.role })) });
});

