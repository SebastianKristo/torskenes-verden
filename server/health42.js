// Prompt 42 (SERVER42): Familie → Helse fra Home Assistant (Companion-appens sensorer), per person. claude-code-helse-fra-home-assistant.md.
// Bruker den eksisterende HA-integrasjonen (ha_url + ha_token, serveroppsett). Uten HA og med MOCK_DATA=1: eksempelenhetene fra skjermbildet.
//
//   GET  /api/family/health/ha → {connected, error?:'token'|'connect', message?, devices:[{id, name, model, platform:'android'|'ios'|'ipad', entities,
//          sensors:[{key, entity, label, state, unit}], personId, suggestedPersonId?, selected:[key], limited, limitedText?, unavailableSince?, noHealth}], persons:[{id, name}], consent:{…}}
//   PUT  /api/family/health/ha {devices:[{id, personId, sensors:[key]}]} (bare admin) → som GET
//   POST /api/family/health/ha/sync (bare admin) → {ok, stored, persons:[…]}   (første gang 30 dager historikk for skritt)
//   POST /api/family/health/ha/consent {allow:true|false} (personen selv) → {consent}
//   Familie-svar (mellomvare): health får source:'ha:<enhet>', sourceDevice, sourceText:'Fra Home Assistant · OnePlus 12 · oppdatert 2 min siden', limited, stale, staleText.
import { Hono } from 'hono';
import { db, kv, OWNER } from './db.js';
import { userInfo, listUsers, isAdmin, sessionUser } from './auth.js';
import { cfg, runAsUser } from './settings.js';
import { bearerOk } from './finans/routes.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS health_daily (person_id TEXT NOT NULL, date TEXT NOT NULL, metric TEXT NOT NULL, value REAL, source TEXT NOT NULL, updated INTEGER NOT NULL,
  PRIMARY KEY (person_id, date, metric, source))`);

export const HA_METRICS42 = {
  steps: 'Skritt', heart_rate: 'Puls', resting_heart_rate: 'Hvilepuls', sleep_duration: 'Søvn', active_calories_burned: 'Aktive kalorier', total_calories_burned: 'Kalorier totalt',
  distance: 'Distanse', floors_climbed: 'Etasjer', floors_ascended: 'Etasjer opp', floors_descended: 'Etasjer ned', weight: 'Vekt', body_fat: 'Fettprosent', oxygen_saturation: 'Oksygenmetning',
  respiratory_rate: 'Pustefrekvens', blood_glucose: 'Blodsukker', vo2_max: 'VO2 maks', activity: 'Aktivitet', average_active_pace: 'Tempo',
};
const DEFAULT_SEL = ['steps', 'heart_rate', 'resting_heart_rate', 'sleep_duration', 'active_calories_burned', 'activity'];
const KEYS = Object.keys(HA_METRICS42).sort((a, b) => b.length - a.length);
/** Bare for tester: fetch mot HA. */
export const _ha42 = { fetch: null };
const MOCK = () => process.env.MOCK_DATA === '1';
const haConf = () => runAsUser(OWNER, () => ({ url: String(cfg('ha_url') || '').replace(/\/+$/, ''), token: cfg('ha_token') || '' }));
async function haGet(path) {
  const { url, token } = haConf();
  const f = _ha42.fetch ?? fetch;
  let r;
  try { r = await f(`${url}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }); }
  catch (e) { throw Object.assign(new Error(`Fikk ikke kontakt med Home Assistant (${e.cause?.code ?? e.name})`), { code: 'connect' }); }
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Koble til Home Assistant på nytt'), { code: 'token' });
  if (!r.ok) throw Object.assign(new Error(`Home Assistant svarte ${r.status}`), { code: 'connect' });
  return r.json();
}
const MOCK_STATES = () => {
  const now = new Date().toISOString();
  const S = (dev, name, metric, state, unit = null) => ({ entity_id: `sensor.${dev}_${metric}`, state: String(state), last_updated: now, attributes: { friendly_name: `${name} ${HA_METRICS42[metric] ?? metric}`, unit_of_measurement: unit } });
  return [
    S('cybele_oneplus_12', 'Cybele OnePlus 12', 'steps', 8412, 'steps'), S('cybele_oneplus_12', 'Cybele OnePlus 12', 'heart_rate', 71, 'bpm'), S('cybele_oneplus_12', 'Cybele OnePlus 12', 'sleep_duration', 452, 'min'),
    S('cybele_oneplus_12', 'Cybele OnePlus 12', 'battery_level', 64, '%'),
    S('rune_iphone_13', 'Rune iPhone 13', 'steps', 5120, 'steps'), S('rune_iphone_13', 'Rune iPhone 13', 'floors_ascended', 6), S('rune_iphone_13', 'Rune iPhone 13', 'activity', 'Walking'),
    S('rune_oneplus_8', 'Rune OnePlus 8', 'steps', 4980, 'steps'), S('rune_oneplus_8', 'Rune OnePlus 8', 'resting_heart_rate', 58, 'bpm'),
    S('samsung_s26_ultra', 'Samsung S26 Ultra', 'steps', 10233, 'steps'), S('samsung_s26_ultra', 'Samsung S26 Ultra', 'heart_rate', 66, 'bpm'), S('samsung_s26_ultra', 'Samsung S26 Ultra', 'active_calories_burned', 512, 'kcal'),
    S('sebastian_ipad_pro', 'Sebastian iPad Pro', 'battery_level', 88, '%'),
    S('sebastian_iphone_17_pro', 'Sebastian iPhone 17 Pro', 'steps', 7310, 'steps'), S('sebastian_iphone_17_pro', 'Sebastian iPhone 17 Pro', 'distance', 5.2, 'km'), S('sebastian_iphone_17_pro', 'Sebastian iPhone 17 Pro', 'activity', 'Stationary'),
  ];
};
/** HA-tilstandene → enheter (prefiks før målingen i entity_id). */
export function devicesFromStates42(states) {
  const by = new Map();
  for (const s of states ?? []) {
    const m = String(s.entity_id ?? '').match(/^sensor\.(.+)$/);
    if (!m) continue;
    const key = KEYS.find((k) => m[1].endsWith(`_${k}`));
    const dev = key ? m[1].slice(0, -key.length - 1) : m[1].replace(/_(battery_level|battery_state|battery|storage|wifi\w*|bssid|ssid|connection_type|geocoded_location|last_update_trigger)$/, '');
    if (dev === m[1] && !key) continue;
    const d = by.get(dev) ?? { id: dev, name: null, entities: 0, sensors: [] };
    d.entities++;
    if (key) {
      d.sensors.push({ key, entity: s.entity_id, label: HA_METRICS42[key], state: s.state, unit: s.attributes?.unit_of_measurement ?? null, updated: s.last_updated ?? null });
      d.name ??= String(s.attributes?.friendly_name ?? '').replace(new RegExp(`\\s*${HA_METRICS42[key]}$`, 'i'), '').replace(/\s*(steps|heart rate|sleep duration|activity|distance)$/i, '').trim() || null;
    } else d.name ??= String(s.attributes?.friendly_name ?? '').replace(/\s*(battery level|batteri\w*|storage|wifi.*)$/i, '').trim() || null;
    by.set(dev, d);
  }
  return [...by.values()].map((d) => {
    const name = d.name || d.id.replace(/_/g, ' ');
    const ipad = /ipad/i.test(name), ios = /iphone|ipad|ios/i.test(name) || d.sensors.some((x) => ['floors_ascended', 'floors_descended', 'average_active_pace'].includes(x.key));
    const unavail = d.sensors.filter((x) => x.state === 'unavailable').map((x) => Date.parse(x.updated)).filter(Boolean);
    return { id: d.id, name, model: name.split(/\s+/).slice(1).join(' ') || name, platform: ipad ? 'ipad' : ios ? 'ios' : 'android', entities: d.entities, sensors: d.sensors,
      noHealth: !d.sensors.length, ...(!d.sensors.length ? { noHealthText: 'Ingen helsesensorer' } : {}), limited: ios && !ipad && !!d.sensors.length,
      ...(ios && !ipad ? { limitedText: 'Begrenset på iPhone: bare skritt, etasjer og aktivitet fra HA. Puls og søvn krever Homelab-appen (Apple Health).' } : {}),
      unavailableSince: unavail.length && unavail.length === d.sensors.length ? new Date(Math.min(...unavail)).toISOString() : null };
  });
}
const links = () => kv.get(OWNER, 'health42_links', {}) ?? {};
const consents = () => kv.get(OWNER, 'health42_consent', {}) ?? {};
const persons = () => listUsers().map((u) => ({ id: u.id, name: u.displayName ?? u.name ?? u.username, first: String(u.displayName ?? u.name ?? u.username ?? '').split(/\s+/)[0] }));
const suggest = (devName) => persons().find((p) => p.first && new RegExp(`^${p.first}\\b`, 'i').test(devName))?.id ?? null;
async function states() { const { url, token } = haConf(); if (!url || !token) { if (MOCK()) return { states: MOCK_STATES(), mock: true }; return null; } return { states: await haGet('/api/states') }; }
export async function haHealthOut42(viewer) {
  let st;
  try { st = await states(); } catch (e) { return { connected: false, error: e.code ?? 'connect', message: e.message, devices: [], persons: persons(), people: persons() }; }
  if (!st) return { connected: false, message: 'Home Assistant er ikke koblet til (Innstillinger → Integrasjoner)', devices: [], persons: persons(), people: persons() };
  const L = links();
  let devices = devicesFromStates42(st.states).map((d) => ({ ...d, personId: L[d.id]?.personId ?? null, suggestedPersonId: suggest(d.name), selected: L[d.id]?.sensors ?? DEFAULT_SEL.filter((k) => d.sensors.some((x) => x.key === k)),
    healthCount: d.sensors.length, subtitle: `${d.entities} entiteter · ${d.sensors.length} helsesensorer` }))
    .map((d) => ({ ...d, sensors: d.sensors.map((x) => ({ ...x, enabled: d.selected.includes(x.key) })) }));
  if (!isAdmin(viewer)) devices = devices.filter((d) => d.personId === viewer);
  return { connected: true, mock: !!st.mock, devices, persons: persons(), people: persons(), consent: consents(), lastSync: kv.get(OWNER, 'health42_sync', null) };
}
const num = (v) => (Number.isFinite(+v) ? +v : null);
const MAP = { steps: 'steps', heart_rate: 'hr', resting_heart_rate: 'resting_hr', sleep_duration: 'sleep_min', active_calories_burned: 'active_kcal' };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
/** Leser sensorene og lagrer dagsaggregatene per person (Health Connect > iOS; høyeste skritt per dag, ingen dobbelttelling). */
export async function syncHa42({ history = false } = {}) {
  const st = await states();
  if (!st) return { ok: false, message: 'Home Assistant er ikke koblet til', stored: 0 };
  const devs = devicesFromStates42(st.states), L = links(), C = consents();
  const day = today(), by = new Map();
  for (const d of devs) {
    const l = L[d.id];
    if (!l?.personId || C[l.personId]?.allow !== true) continue;
    for (const s of d.sensors) {
      if (!(l.sensors ?? DEFAULT_SEL).includes(s.key) || s.state === 'unavailable' || s.state === 'unknown') continue;
      let v = num(s.state);
      if (s.key === 'sleep_duration' && v != null && /^h/i.test(s.unit ?? '')) v = Math.round(v * 60);
      if (v == null) { if (s.key === 'activity') q('INSERT OR REPLACE INTO health_daily(person_id, date, metric, value, source, updated) VALUES(?,?,?,?,?,?)').run(l.personId, day, `activity:${s.state}`, 1, `ha:${d.id}`, Date.now()); continue; }
      q('INSERT OR REPLACE INTO health_daily(person_id, date, metric, value, source, updated) VALUES(?,?,?,?,?,?)').run(l.personId, day, s.key, v, `ha:${d.id}`, Date.now());
      const p = by.get(l.personId) ?? { src: d, vals: {} };
      const col = MAP[s.key];
      if (col) {
        const prio = d.platform === 'android' ? 2 : 1;
        if (col === 'steps') p.vals.steps = Math.max(p.vals.steps ?? 0, v);
        else if (!p.vals[col] || prio > (p.prio?.[col] ?? 0)) { p.vals[col] = v; p.prio = { ...(p.prio ?? {}), [col]: prio }; }
      }
      if (d.platform === 'android' || !by.has(l.personId)) p.src = d;
      by.set(l.personId, p);
    }
  }
  const hi = (col) => `CASE WHEN excluded.${col} IS NULL THEN ${col} WHEN ${col} IS NULL THEN excluded.${col} ELSE MAX(${col}, excluded.${col}) END`;
  const ins = q(`INSERT INTO family_health(user, date, steps, resting_hr, hr, sleep_min, active_kcal, updated) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(user, date) DO UPDATE SET steps=${hi('steps')}, resting_hr=COALESCE(excluded.resting_hr, resting_hr), hr=COALESCE(excluded.hr, hr), sleep_min=${hi('sleep_min')}, active_kcal=${hi('active_kcal')}, updated=excluded.updated`);
  let stored = 0;
  for (const [pid, p] of by) {
    ins.run(pid, day, p.vals.steps ?? null, p.vals.resting_hr ?? null, p.vals.hr ?? null, p.vals.sleep_min ?? null, p.vals.active_kcal ?? null, Date.now()); stored++;
    const src = kv.get(OWNER, 'health42_src', {}) ?? {};
    src[pid] = { device: p.src.id, name: p.src.name, platform: p.src.platform, limited: p.src.platform === 'ios', at: Date.now(), unavailableSince: p.src.unavailableSince };
    kv.set(OWNER, 'health42_src', src);
  }
  // Første synk: 30 dager historikk for skritt (høyeste per dag).
  if (history && !st.mock) {
    const start = new Date(Date.now() - 30 * 86400_000).toISOString();
    for (const d of devs) {
      const l = L[d.id]; const s = d.sensors.find((x) => x.key === 'steps');
      if (!l?.personId || !s || C[l.personId]?.allow !== true) continue;
      try {
        const hist = await haGet(`/api/history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(s.entity)}&minimal_response`);
        const per = new Map();
        for (const h of (hist?.[0] ?? [])) { const v = num(h.state); const dt = String(h.last_changed ?? h.last_updated ?? '').slice(0, 10); if (v != null && dt) per.set(dt, Math.max(per.get(dt) ?? 0, v)); }
        for (const [dt, v] of per) ins.run(l.personId, dt, v, null, null, null, null, Date.now());
      } catch { /* historikken er valgfri */ }
    }
  }
  kv.set(OWNER, 'health42_sync', Date.now());
  return { ok: true, stored, persons: [...by.keys()] };
}
const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60_000)); return m < 1 ? 'nå nettopp' : m < 60 ? `${m} min siden` : m < 1440 ? `${Math.round(m / 60)} t siden` : `${Math.round(m / 1440)} d siden`; };
/** Kildefeltene for en persons helse (null når personen ikke har HA-kilde). */
export function haSourceOf42(personId) {
  const s = (kv.get(OWNER, 'health42_src', {}) ?? {})[personId];
  if (!s) return null;
  const stale = !!s.unavailableSince && Date.now() - Date.parse(s.unavailableSince) > 6 * 3600_000 || Date.now() - s.at > 6 * 3600_000;
  const hm = new Date(s.unavailableSince ? Date.parse(s.unavailableSince) : s.at).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
  return { source: `ha:${s.device}`, sourceDevice: s.name, sourceText: `Fra Home Assistant · ${s.name.replace(/^\S+\s+/, '')} · oppdatert ${ago(s.at)}`, limited: !!s.limited, stale, ...(stale ? { staleText: `Ingen data fra ${s.name} siden ${hm}` } : {}) };
}
/** Mellomvare foran /api/family: health i svarene får HA-kilden. */
export async function familyHealthMw42(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res?.status !== 200 || !/json/.test(c.res.headers.get('content-type') ?? '')) return;
  try {
    const j = await c.res.clone().json();
    let touched = false;
    const walk = (o, d = 0) => {
      if (!o || typeof o !== 'object' || d > 5) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, d + 1); return; }
      if (o.userId && o.health && typeof o.health === 'object') { const s = haSourceOf42(o.userId); if (s) { Object.assign(o.health, s); touched = true; } }
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, d + 1);
    };
    walk(j);
    if (touched) c.res = c.json(j, 200);
  } catch { /* svaret står */ }
}

export const health42Api = new Hono();
health42Api.use('*', async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
});
health42Api.get('/', async (c) => c.json(await haHealthOut42(c.get('user'))));
health42Api.put('/devices/:id', async (c) => { const b = await c.req.json().catch(() => ({})); return saveLinks(c, { devices: [{ ...b, id: c.req.param('id') }] }); });
health42Api.put('/', async (c) => saveLinks(c, await c.req.json().catch(() => ({}))));
async function saveLinks(c, b) {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Home Assistant er serveroppsett. Bare administratorer kan koble enheter til personer.' }, 403);
  if (!Array.isArray(b.devices)) return c.json({ error: 'Forventet {devices:[{id, personId, sensors}]}' }, 400);
  const ids = new Set(listUsers().map((u) => u.id));
  const L = links();
  for (const d of b.devices.slice(0, 50)) {
    const id = String(d.id ?? '').replace(/[^\w-]/g, '').slice(0, 80);
    if (!id) continue;
    if (d.personId === null || d.personId === '') { delete L[id]; continue; }
    if (!ids.has(d.personId)) return c.json({ error: `Ukjent person for ${id}` }, 400);
    L[id] = { personId: d.personId, sensors: (Array.isArray(d.sensors) ? d.sensors : DEFAULT_SEL).filter((x) => typeof x === 'string' || x?.enabled !== false).map((x) => (typeof x === 'string' ? x : x?.key)).filter((k) => HA_METRICS42[k]) };
  }
  kv.set(OWNER, 'health42_links', L);
  // Personer som ikke har godkjent ennå får et varsel (Homelab-appen); HA-varsel via notify.mobile_app_<enhet> er valgfritt.
  for (const pid of new Set(Object.values(L).map((x) => x.personId))) if (!consents()[pid]) {
    import('./notify.js').then(({ notifyUser }) => notifyUser(pid, { title: 'Helse fra Home Assistant', body: 'Homelab vil vise skritt og søvn til familien. Tillat?', category: 'familie', tag: 'health42-consent', url: '/#/familie/helse' })).catch(() => {});
  }
  const sync = await syncHa42({ history: true }).catch(() => null);
  return c.json({ ...(await haHealthOut42(c.get('user'))), sync });
}
health42Api.post('/sync', async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer' }, 403);
  try { return c.json(await syncHa42({ history: !kv.get(OWNER, 'health42_sync', null) })); } catch (e) { return c.json({ ok: false, error: e.code ?? 'connect', message: e.message }, 502); }
});
health42Api.post('/consent', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (typeof b.allow !== 'boolean') return c.json({ error: 'allow må være true eller false' }, 400);
  const C = consents(); C[c.get('user')] = { allow: b.allow, at: new Date().toISOString() }; kv.set(OWNER, 'health42_consent', C);
  if (!b.allow) { q("DELETE FROM health_daily WHERE person_id=? AND source LIKE 'ha:%'").run(c.get('user')); const s = kv.get(OWNER, 'health42_src', {}) ?? {}; delete s[c.get('user')]; kv.set(OWNER, 'health42_src', s); }
  return c.json({ consent: C[c.get('user')] });
});
let timer = null;
export function startHealth42() { if (timer) return; timer = setInterval(() => { if (Object.keys(links()).length) syncHa42().catch(() => {}); }, 15 * 60_000); timer.unref?.(); }
