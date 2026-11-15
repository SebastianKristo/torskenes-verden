// Prompt 45 (SERVER45): små serverdeler – Gjøremål-synk som rad (Innstillinger → Gjøremål) og Innstillinger samlet.
// (Vær «Min posisjon», GET /api/weather/here, ligger i server/vaer/here.js.)
//   GET /api/tasks/ha/summary → {enabled, linked, lists, syncedAt, syncedText, text, settings, canEdit}  (alle innloggede; endring fortsatt bare admin)
//   GET /api/settings/sections → {sections:[{id, title, icon, color, route, items, api}]}  (én seksjon per modul, admin-sider skjult for andre)
import { Hono } from 'hono';
import { db, q, kv, OWNER } from './db.js';
import { authOrToken } from './mobile.js';
import { isAdmin } from './auth/session.js';
import { indexFor } from './settings-ask30.js';

const MOCK = () => process.env.MOCK_DATA === '1';

/* ---------------- Gjøremål: synk-raden ---------------- */

const hm = (t) => new Date(t).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
export function tasksHaSummary45(u) {
  const conf = { enabled: false, syncedAt: null, ...(kv.get(OWNER, 'huske_ha', {}) ?? {}) };
  let rows = [];
  try { rows = q(`SELECT m.list_id, m.entity_id, l.name FROM huske_ha_map m LEFT JOIN hl_task_lists l ON l.id = m.list_id WHERE l.owner=? OR l.id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?) OR ?`).all(u, u, isAdmin(u) ? 1 : 0); } catch { rows = []; }
  const synced = conf.syncedAt ? Number(conf.syncedAt) || Date.parse(conf.syncedAt) : null;
  const sameDay = synced && new Date(synced).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }) === new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const syncedText = synced ? `Synket ${sameDay ? hm(synced) : new Date(synced).toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short' })}` : conf.enabled ? 'Ikke synket ennå' : 'Av';
  return { enabled: !!conf.enabled, linked: rows.length, lists: rows.map((r) => ({ listId: r.list_id, name: r.name ?? null, entityId: r.entity_id })), syncedAt: synced ? new Date(synced).toISOString() : null, syncedText,
    text: `Synk med Home Assistant · ${conf.enabled ? syncedText : 'av'}`, hint: 'endres i Innstillinger → Gjøremål', settings: { web: '#/innstillinger/gjoremal', mobile: '#/set/huske', detail: 'huske', event: 'papir-open-settings' }, canEdit: isAdmin(u),
    integrationText: rows.length ? `Gjøremål: ${rows.length} ${rows.length === 1 ? 'liste' : 'lister'} koblet` : 'Gjøremål: ingen lister koblet' };
}
export const tasks45Api = new Hono();
tasks45Api.get('/ha/summary', authOrToken, (c) => c.json(tasksHaSummary45(c.get('user'))));

/* ---------------- Innstillinger samlet ---------------- */

// Én seksjon per modul (claude-code-innstillinger-samlet.md, Innstillinger Web.dc.html). items = oppføringer fra søkeindeksen med samme prefiks.
const SECTIONS = [
  ['media', 'Media', 'film', '#35c5f4', 'media', 'media', ['/api/media/servers', '/api/media/settings', '/api/playback/status']],
  ['gjoremal', 'Gjøremål', 'check', '#b23a2a', 'gjoremal', 'huske', ['/api/tasks/ha', '/api/tasks/ha/summary', '/api/tasks/lists/order', '/api/tasks/glimt/tips']],
  ['kalendere', 'Kalender', 'cal', '#2f7d4f', 'kal', 'kal', ['/api/calendars']],
  ['ruter', 'Ruter', 'bus', '#e05a2b', 'ruter', 'ruter', ['/api/ruter/settings', '/api/ruter/my-routes']],
  ['vaer', 'Vær', 'sun', '#2b6cb0', 'vaer', 'vaer', ['/api/weather/layout']],
  ['finans', 'Finans', 'bank', '#2f7a4f', 'finans', 'finans', []],
  ['studie', 'Studie', 'book', '#7a5ad6', 'studie', 'studie', ['/api/study/documents']],
  ['familie', 'Familie', 'users', '#a8456b', 'familie', 'familie', ['/api/family/zone-alerts', '/api/family/health/ha']],
  ['helse', 'Helse (Familie)', 'heart', '#c0392b', 'helse', 'helse', ['/api/family/health/ha']],
  ['ai', 'Glimt og AI', 'ai', '#7a3b6b', 'ai', 'ai', ['/api/ai/import/sources', '/api/glimt/settings']],
  ['varsler', 'Varsler', 'bell', '#b23a2a', 'varsel', 'varsler', ['/api/me/notify', '/api/family/zone-alerts']],
  ['server', 'Server', 'sys', '#6b6558', 'system', 'oppd', ['/api/system/update', '/api/system/containers', '/api/system/docker/setup'], true],
];
export function settingsSections45(u) {
  const admin = isAdmin(u), idx = indexFor(admin);
  return { sections: SECTIONS.filter((s) => admin || !s[7]).map(([id, title, icon, color, web, mobile, api, adm]) => ({ id, title, icon, color, route: { web: `#/innstillinger/${web}`, mobile: `#/set/${mobile}` },
    items: idx.filter((x) => x.id === id || x.id.startsWith(`${id}.`)).map((x) => ({ id: x.id, title: x.title, path: x.path, route: x.route, anchor: x.anchor ?? null })), api, ...(adm ? { admin: true } : {}) })) };
}
export const settings45Api = new Hono();
settings45Api.get('/sections', authOrToken, (c) => c.json(settingsSections45(c.get('user'))));
