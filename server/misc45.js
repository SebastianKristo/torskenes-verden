// Prompt 45 (SERVER45): Innstillinger samlet. (Vær «Min posisjon» ligger i server/vaer/here.js og Gjøremål-synkraden,
// GET /api/tasks/ha/summary, i server/gjoremal/ha.js.)
//   GET /api/settings/sections → {sections:[{id, title, icon, color, route, items, api}]}  (én seksjon per modul, admin-sider skjult for andre)
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { isAdmin } from './auth/session.js';
import { indexFor } from './settings-ask30.js';

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
