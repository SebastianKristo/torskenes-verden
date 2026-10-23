// Prompt 45 (SERVER45): Innstillinger → Helse → Home Assistant – rydd opp (claude-code-helse-ha-opprydding.md, Helse Home Assistant.dc.html).
//
// Feilen: health42 laget «enheter» av ALLE sensor.*-entiteter i HA (devicesFromStates42 på /api/states), så Aqara-brytere, rullegardiner og
// bevegelsessensorer med batteri dukket opp (56 enheter). Nå filtreres det på integrasjonen mobile_app:
//   1. WS config/device_registry/list + config/entity_registry/list + config_entries/get (domain mobile_app) → enhetene og entitetene deres.
//   2. Reserve: REST /api/template med integration_entities('mobile_app') (samme svar, ett kall).
//   3. Reserve uten registeret (eldre HA/feil): bare enheter med helsesensorer (heuristic).
// Mellomvare på GET /api/family/health/ha (?view=phones|all). Se SERVER45-API.md for feltene.
import WebSocket from 'ws';
import { OWNER } from './db.js';
import { cfg, runAsUser } from './settings.js';
import { userInfo } from './auth.js';
import { colorOf } from './family.js';

const MOCK = () => process.env.MOCK_DATA === '1';
export const _ha45 = { ws: null, template: null }; // tester: erstatt kildene
const haConf = () => runAsUser(OWNER, () => ({ url: String(cfg('ha_url') || '').replace(/\/+$/, ''), token: cfg('ha_token') || '' }));

/** WS-kommandoer mot HA. → [svar] i samme rekkefølge. */
function haWs(cmds, { timeout = 8000 } = {}) {
  if (_ha45.ws) return _ha45.ws(cmds);
  const { url, token } = haConf();
  return new Promise((resolve, reject) => {
    let ws; const out = new Array(cmds.length); let left = cmds.length, done = false;
    const end = (e, v) => { if (done) return; done = true; clearTimeout(t); try { ws?.close(); } catch { /* */ } e ? reject(e) : resolve(v); };
    const t = setTimeout(() => end(new Error('Home Assistant svarte ikke i tide (WebSocket)')), timeout);
    try { ws = new WebSocket(`${url.replace(/^http/i, 'ws')}/api/websocket`, { handshakeTimeout: timeout }); } catch (e) { end(e); return; }
    ws.on('error', (e) => end(e));
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      else if (m.type === 'auth_invalid') end(Object.assign(new Error('Koble til Home Assistant på nytt'), { code: 'token' }));
      else if (m.type === 'auth_ok') cmds.forEach((c, i) => ws.send(JSON.stringify({ id: i + 1, ...c })));
      else if (m.type === 'result' && m.id >= 1 && m.id <= cmds.length) { out[m.id - 1] = m.success ? m.result : null; if (--left === 0) end(null, out); }
    });
  });
}
async function haTemplate(tpl) {
  if (_ha45.template) return _ha45.template(tpl);
  const { url, token } = haConf();
  const r = await fetch(`${url}/api/template`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ template: tpl }), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Home Assistant svarte ${r.status}`);
  return r.text();
}
const TPL = "{% set ns = namespace(d=[]) %}{% for e in integration_entities('mobile_app') %}{% set id = device_id(e) %}{% set ns.d = ns.d + [[e, id, device_attr(id,'name_by_user') or device_attr(id,'name'), device_attr(id,'model'), device_attr(id,'manufacturer')]] %}{% endfor %}{{ ns.d | tojson }}";
const MOCK_REG = () => ({ source: 'mock', otherCount: 50, devices: [
  ['cybele_oneplus_12', 'Cybele OnePlus 12', 'CPH2581', 'OnePlus', 133], ['rune_iphone_13', 'Rune iPhone 13', 'iPhone14,5', 'Apple', 61], ['rune_oneplus_8', 'Rune OnePlus 8', 'IN2013', 'OnePlus', 118],
  ['samsung_s26_ultra', 'Samsung S26 Ultra', 'SM-S948B', 'samsung', 140], ['sebastian_ipad_pro', 'Sebastian iPad Pro', 'iPad16,3', 'Apple', 38], ['sebastian_iphone_17_pro', 'Sebastian iPhone 17 Pro', 'iPhone18,1', 'Apple', 64],
].map(([prefix, name, model, manufacturer, entities]) => ({ id: prefix, name, model, manufacturer, entities, prefixes: [prefix] })) });
const prefixOf = (eid) => String(eid).replace(/^\w+\./, '').replace(/_(battery_level|battery_state|battery|steps|heart_rate|resting_heart_rate|sleep_duration|activity|distance|floors_\w+|average_active_pace|storage|ssid|bssid|wifi\w*|connection_type|geocoded_location|last_update_trigger|\w+_calories_burned|app_\w+|sim_\d|charger_type|is_charging|audio_\w+|public_ip_address|location_\w+|interactive|doze_mode|next_alarm|light_sensor|pressure_sensor|proximity_sensor|step_sensor|active|last_reboot|focus)$/, '');
let cache = null;
/** mobile_app-enhetene i HA. → {source, devices:[{id, name, model, manufacturer, entities, prefixes}], otherCount} */
export async function mobileDevices45({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < 5 * 60_000) return cache.v;
  const { url, token } = haConf();
  let v;
  if ((!url || !token) && !_ha45.ws && !_ha45.template) v = MOCK() ? MOCK_REG() : null;
  else {
    try {
      const [entries, devs, ents] = await haWs([{ type: 'config_entries/get', domain: 'mobile_app' }, { type: 'config/device_registry/list' }, { type: 'config/entity_registry/list' }]);
      const ids = new Set((entries ?? []).filter((e) => e.domain === 'mobile_app').map((e) => e.entry_id));
      const all = Array.isArray(devs) ? devs : [];
      const mine = all.filter((d) => (d.config_entries ?? []).some((x) => ids.has(x)));
      const byDev = new Map(); for (const e of Array.isArray(ents) ? ents : []) { if (!e.device_id) continue; const l = byDev.get(e.device_id) ?? []; l.push(e.entity_id); byDev.set(e.device_id, l); }
      v = { source: 'registry', otherCount: Math.max(0, all.filter((d) => d.entry_type !== 'service').length - mine.length),
        devices: mine.map((d) => { const es = byDev.get(d.id) ?? []; return { id: d.id, name: d.name_by_user || d.name || d.model || 'Ukjent enhet', model: d.model ?? null, manufacturer: d.manufacturer ?? null, entities: es.length, prefixes: [...new Set(es.map(prefixOf))], entityIds: es }; }) };
    } catch (e) {
      if (e.code === 'token') throw e;
      try {
        const rows = JSON.parse(await haTemplate(TPL));
        const m = new Map();
        for (const [eid, did, name, model, manu] of Array.isArray(rows) ? rows : []) { const d = m.get(did) ?? { id: did, name: name || 'Ukjent enhet', model: model ?? null, manufacturer: manu ?? null, entities: 0, prefixes: new Set(), entityIds: [] }; d.entities++; d.prefixes.add(prefixOf(eid)); d.entityIds.push(eid); m.set(did, d); }
        v = { source: 'template', otherCount: null, devices: [...m.values()].map((d) => ({ ...d, prefixes: [...d.prefixes] })) };
      } catch { v = null; }
    }
  }
  cache = { at: Date.now(), v };
  return v;
}
export const _resetHa45 = () => { cache = null; };
const isTablet = (d) => /ipad|\btab\b|tablet|galaxy tab|\bpad\b/i.test(`${d.name ?? ''} ${d.model ?? ''}`);
const osOf = (d) => (d.platform === 'android' ? 'Android' : /ipad/i.test(`${d.name} ${d.model ?? ''}`) || d.platform === 'ipad' ? 'iPadOS' : 'iOS');

/** Mellomvare: GET /api/family/health/ha → bare mobile_app, gruppert per person, «N andre enheter vises ikke». */
export async function haHealthMw45(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/\/api\/family\/health\/ha\/?$/.test(c.req.path)) return;
  let j; try { j = await c.res.clone().json(); } catch { return; }
  if (!j?.connected) return;
  // Uten ?view svarer vi som før med alle mobilapp-enheter (eldre klienter); de nye klientene sender view=phones (Telefoner er standard i UI-et).
  const view = c.req.query('view') === 'phones' ? 'phones' : 'all';
  let reg = null; try { reg = await mobileDevices45(); } catch { reg = null; }
  const devices0 = Array.isArray(j.devices) ? j.devices : [];
  let devices;
  if (reg) {
    // Koble health42-enhetene (prefiks i entity_id) til registeret; mobile_app-enheter uten helsesensorer tas med nedtonet.
    const used = new Set();
    devices = reg.devices.map((r) => {
      const h = devices0.find((d) => !used.has(d.id) && (r.prefixes.includes(d.id) || (r.entityIds ?? []).some((e) => d.sensors?.some((s) => s.entity === e))));
      if (h) used.add(h.id);
      const name = r.name || h?.name;
      const platform = h?.platform ?? (/apple|iphone|ipad/i.test(`${r.manufacturer} ${r.model} ${name}`) ? (/ipad/i.test(`${r.model} ${name}`) ? 'ipad' : 'ios') : 'android');
      return { ...(h ?? { id: r.prefixes[0] ?? r.id, sensors: [], selected: [], personId: null, suggestedPersonId: null, noHealth: true, healthCount: 0 }), name, model: r.model ?? h?.model ?? null, manufacturer: r.manufacturer ?? null, registryId: r.id, entities: r.entities || h?.entities || 0, platform };
    });
  } else devices = devices0.filter((d) => d.sensors?.length); // heuristikk: bare enheter med helsesensorer
  const persons = Array.isArray(j.persons) ? j.persons : [];
  const pName = (id) => persons.find((p) => p.id === id)?.name ?? userInfo(id)?.displayName ?? null;
  devices = devices.map((d) => {
    const n = d.sensors?.length ?? 0, tablet = isTablet(d), sug = d.suggestedPersonId ? pName(d.suggestedPersonId) : null;
    const rest = { ...d, ...(n ? {} : { noHealthText: 'Ingen helsesensorer' }) }; // noHealthText beholdes for eldre klienter; vis bare healthText
    return { ...rest, kind: tablet ? 'tablet' : 'phone', os: osOf(d), integration: 'mobile_app', healthCount: n, noHealth: !n, healthText: n ? `${n} helsesensor${n === 1 ? '' : 'er'}` : 'Ingen helsesensorer',
      subtitle: `${d.entities ?? 0} entiteter · ${n ? `${n} helsesensorer` : 'ingen helsesensorer'}`, ...(sug && !d.personId ? { suggestedPersonName: sug, suggestText: `Foreslått ut fra navnet: ${sug}` } : {}) };
  });
  const phones = devices.filter((d) => d.kind === 'phone'), shown = view === 'all' ? devices : phones;
  const linked = devices.filter((d) => d.personId).length;
  const groups = [];
  for (const d of shown) { const key = d.personId ?? null; let g = groups.find((x) => x.personId === key); if (!g) { g = { personId: key, name: key ? pName(key) ?? key : 'Ikke koblet', color: key ? colorOf(key) : null, devices: [] }; groups.push(g); } g.devices.push(d.id); }
  groups.sort((a, b) => (a.personId ? 0 : 1) - (b.personId ? 0 : 1) || String(a.name).localeCompare(String(b.name), 'nb'));
  for (const g of groups) { g.count = g.devices.length; g.label = g.personId ? `${String(g.name).split(/\s+/)[0].toUpperCase()} · ${g.count}` : `IKKE KOBLET · ${g.count}`; }
  const other = reg?.otherCount;
  const hiddenN = (other ?? 0) + (view === 'phones' ? devices.length - phones.length : 0);
  const { url } = haConf();
  c.res = c.json({ ...j, view, devices: shown, filter: { source: reg?.source ?? 'heuristic' }, counts: { phones: phones.length, all: devices.length, other: other ?? null },
    hidden: { count: hiddenN, text: other != null ? `${other} andre enheter fra Home Assistant (brytere, sensorer, rullegardiner) vises ikke her. De har ingen helsedata.${view === 'phones' && devices.length > phones.length ? ` ${devices.length - phones.length} nettbrett er skjult (velg «Alle mobilapp»).` : ''}` : 'Bare enheter fra Home Assistant-appen (mobile_app) vises. Brytere, sensorer og rullegardiner har ingen helsedata.' },
    status: { connected: true, url: url ? url.replace(/^https?:\/\//, '') : (j.mock ? 'homeassistant.local:8123' : null), linked, total: devices.length, text: `${linked} av ${devices.length} koblet` }, groups,
    segments: [{ id: 'phones', label: 'Telefoner', count: phones.length, selected: view === 'phones' }, { id: 'all', label: 'Alle mobilapp', count: devices.length, selected: view === 'all' }] });
}
