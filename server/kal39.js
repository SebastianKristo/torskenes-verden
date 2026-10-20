// Prompt 39 (SERVER39): Kalender – bare fire kalendere (Personlig · Bursdager · Skole · Helligdager), opprydding 12 → 4 som kan
// angres, innebygde norske helligdager og Google-velgeren «Hvilken kalender er hva?». Per bruker, sesjon eller app-token.
//
// GET   /api/kalender/calendars → som før (kalender33.js), men standard er bare de fire + brukerens egne. Hver rad:
//   {id, key, name, color, source:'google'|'url'|'builtin'|'own', sourceLabel:'sebastian@…'|'tp.uio.no · hver time'|'Norge',
//    badge:'GOOGLE'|'URL'|'INNEBYGD'|'EGEN'|'HA', count, visible, notify, notifyLabel, showInBrief, kind:<gammel source>,
//    subjectColors?:[{key, color}] (Skole), url?, interval?:'15m'|'1h'|'6h'|'1d', lastFetched?, status?:'ok'|'Feil · sjekk URL'|'Ikke satt'|'Ikke koblet',
//    country?:'NO', removable, …gamle felt (textColor, lightColor, builtin, writable, hidMenu)}
//   + migration:{done, from, to, moved, merged:[{id, name, into}], at, undoUntil, undone}
//   Opprydding (én gang per bruker, første gang kalenderne leses): Jobb/Familie/Helse (+ egne «Personlig»/«Privat»/«Jobb …») → Personlig,
//   Studie/«Studie 40»/Timeplan/Prøver/skolens iCal → Skole, Google-«Sebastian…» → kilde for Personlig, bursdag-duplikater → Bursdager.
//   Hendelsene flyttes (kal33_evcal), ingenting slettes. Logges i kv 'kal39_log' og konsollen.
// POST  /api/kalender/calendars/migration/undo → {ok, migration, calendars}  (innen undoUntil, 30 dager; tilbake til de seks fra før)
// POST  /api/kalender/calendars/migration      → {ok, migration, calendars}  (kjør oppryddingen på nytt etter angre)
// PATCH /api/kalender/calendars/:id {name?, color?, visible?, notify?, showInBrief?, url?, interval?, country?} → {calendar}
//   url (bare Skole): webcal:// eller https://…ics, hentes med en gang (400 ved feil) og blir kilden til Skole.
// POST  /api/kalender/calendars/skole/refresh → {calendar}  («↻ Oppdater nå»)
// POST  /api/kalender/calendars/url/preview {url} → {ok, name, count, subjects:[…], url}  (hent én gang før lagring)
// GET   /api/kalender/google/mapping → {connected, email, calendars:[{googleId, name, color, access:'primær · eier'|'eier'|'delt · kan redigere'|'kan se',
//          role:'p'|'b'|null, suggested}], school:{url, host, status, interval}, holidays:{country}, preview:[{id, name, color, parts:[…], summary}], job}
// PUT   /api/kalender/google/mapping {map:{googleId:'p'|'b'|null}} → {ok, job:{id, state}, …samme som GET}
//   Full synk i bakgrunnen (realtime «kalender» {action:'sync', jobId, state, pct}); GET /api/kalender/google/mapping/jobs/:id → job.
//   Nye hendelser fra appen lagres i primær Google-kalender (Personlig).
import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { db, kv } from './db.js';
import { authOrToken, layoutOf } from './mobile.js';
import { broadcast } from './realtime.js';
import { runAsUser, userCfg } from './settings.js';
import { googleConnected, googleConfSet, googleCalendarList, calendarLinks } from './birthdays.js';
import { clearCalendarCache, googleExtraOf, addEventSource, eventsFor } from './calendar.js';
import { extCalendarsOf, addIcal, refreshIcal, removeExt, normalizeIcalUrl, guessName } from './kalender35.js';
import { calendarsOut, appCalendarsOf, eventKey, LEGACY_ALIAS, _setKal39 } from './kalender33.js';
import { fagKey } from './kal37.js';
import { parseIcs, expandIcs } from './ical-expand.js';
import { osloTodayISO } from '../public/js/quick-time.js';

const pad = (n) => String(n).padStart(2, '0');
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const COLOR = /^#[0-9a-f]{6}$/i;
const UNDO_MS = 30 * 86400_000;
const FOUR = ['personlig', 'bursdager', 'skole', 'helligdager'];
const INTERVALS = { '15m': 15 * 60_000, '1h': 3600_000, '6h': 6 * 3600_000, '1d': 86400_000 };
const INTERVAL_LABEL = { '15m': 'hvert 15. min', '1h': 'hver time', '6h': 'hver 6. time', '1d': 'daglig' };
const NOTIFY_LABEL = { personlig: '15 min før', bursdager: 'kl. 09:00 samme dag', skole: '15 min før', helligdager: 'Av' };
const NOTIFY_DEFAULT = { personlig: true, bursdager: true, skole: true, helligdager: false };
const COUNTRIES = { NO: 'Norge' };

/* ---------------- Lagring ---------------- */

const st = (u) => { const v = kv.get(u, 'kal39', null); return v && typeof v === 'object' ? v : {}; };
const save = (u, patch) => kv.set(u, 'kal39', { ...st(u), ...patch });
const evMap = (u) => { const v = kv.get(u, 'kal33_evcal', {}); return v && typeof v === 'object' ? v : {}; };
const logMig = (u, text) => {
  console.info(`[kalender39] ${u}: ${text}`);
  const L = kv.get(u, 'kal39_log', []) ?? [];
  kv.set(u, 'kal39_log', [...(Array.isArray(L) ? L : []), { at: new Date().toISOString(), text }].slice(-50));
};
export const modeOf = (u) => (st(u).mode === 'legacy' ? 'legacy' : 'four');
export const mergedInto = (u, id) => (modeOf(u) === 'four' ? st(u).merged?.[id] ?? null : null);

/* ---------------- Opprydding (12 → 4) ---------------- */

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
/** Hvilken av de fire en eksisterende kalender (navn/adresse) hører til, eller null (beholdes som egen). */
export function targetOf(name, url = '', kind = 'own') {
  const n = norm(name), h = norm(url);
  if (/bursdag|birthday|fodselsdag|kontakter|contacts/.test(n)) return 'bursdager';
  if (/studie|timeplan|prover\b|prove|skole|forelesning|emne|semester|eksamen/.test(n) || /tp\.uio|timeplan|canvas|itslearning|uio\.no|ntnu|oslomet|skole/.test(h)) return 'skole';
  if (/^(jobb|familie|helse|personlig|privat)\b/.test(n) || /^sebastian/.test(n)) return 'personlig';
  if (kind === 'google' && /famil|jobb|helse/.test(n)) return 'personlig';
  return null;
}
const LEGACY_COUNT = 6;
/** Kjører oppryddingen én gang for u. → migrasjonen */
export function ensureMigrated(u) {
  const s = st(u);
  if (s.migration?.done || s.migration?.undone) return s.migration;
  const merged = {}, mergedList = [];
  const cs = kv.get(u, 'kal33_cals', null);
  const custom = Array.isArray(cs?.custom) ? cs.custom : [];
  for (const c of custom) { const t = targetOf(c.name); if (t) { merged[c.id] = t; mergedList.push({ id: c.id, name: c.name, into: t }); } }
  for (const c of extCalendarsOf(u)) { if (c.source !== 'ical') continue; const t = targetOf(c.name, c.url); if (t) { merged[c.id] = t; mergedList.push({ id: c.id, name: c.name, into: t }); } }
  for (const x of googleExtraOf(u)) { const t = targetOf(x.name, '', 'google'); if (t) { merged[x.id] = t; mergedList.push({ id: x.id, name: x.name, into: t }); } }
  const from = LEGACY_COUNT + custom.length + extCalendarsOf(u).length + googleExtraOf(u).length;
  // Hendelsene flyttes: gamle id-er og sammenslåtte kalendere → målet. Det gamle valget huskes for angre.
  const map = evMap(u), changed = {};
  let moved = 0;
  for (const [k, v] of Object.entries(map)) {
    const to = LEGACY_ALIAS[v] ?? merged[v];
    if (to && to !== v) { changed[k] = v; map[k] = to; moved++; }
  }
  if (moved) kv.set(u, 'kal33_evcal', map);
  const prevDefault = cs?.prefs?.defaultCalendar ?? null;
  if (prevDefault && (LEGACY_ALIAS[prevDefault] || merged[prevDefault])) kv.set(u, 'kal33_cals', { ...cs, prefs: { ...cs.prefs, defaultCalendar: LEGACY_ALIAS[prevDefault] ?? merged[prevDefault] } });
  const at = Date.now();
  const to = FOUR.length + (custom.length + extCalendarsOf(u).length + googleExtraOf(u).length - mergedList.length);
  const migration = { done: true, from, to, moved, merged: mergedList, at: new Date(at).toISOString(), undoUntil: new Date(at + UNDO_MS).toISOString(), undone: false };
  save(u, { mode: 'four', merged, migration, undo: { changed, prevDefault } });
  logMig(u, `ryddet kalenderne ${from} → ${to}: ${moved} hendelser flyttet${mergedList.length ? `, slått sammen: ${mergedList.map((m) => `${m.name} → ${m.into}`).join(', ')}` : ''}`);
  return migration;
}
export function undoMigration(u) {
  const s = st(u), m = s.migration;
  if (!m?.done) return { error: 'Det er ingen opprydding å angre', status: 409 };
  if (Date.parse(m.undoUntil) < Date.now()) return { error: 'Fristen for å angre har gått ut', status: 409 };
  const map = evMap(u);
  let restored = 0;
  for (const [k, old] of Object.entries(s.undo?.changed ?? {})) { const now = map[k]; if (now === (LEGACY_ALIAS[old] ?? s.merged?.[old])) { map[k] = old; restored++; } }
  kv.set(u, 'kal33_evcal', map);
  const cs = kv.get(u, 'kal33_cals', null);
  if (cs && s.undo?.prevDefault) kv.set(u, 'kal33_cals', { ...cs, prefs: { ...(cs.prefs ?? {}), defaultCalendar: s.undo.prevDefault } });
  const migration = { ...m, done: false, undone: true, undoneAt: new Date().toISOString() };
  save(u, { mode: 'legacy', merged: {}, migration });
  clearCalendarCache(u);
  logMig(u, `angret oppryddingen: ${restored} hendelser tilbake`);
  return { ok: true, migration, restored };
}
export function redoMigration(u) {
  save(u, { migration: null, mode: 'four' });
  return ensureMigrated(u);
}

/* ---------------- Helligdager (innebygd, ingen nett) ---------------- */

/** Første påskedag (gregoriansk, «anonym» algoritme). → 'YYYY-MM-DD' */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
/** Norske offentlige høytidsdager (fridager) for året. → [{date, name}] */
export function holidaysNO(y) {
  const E = easter(y);
  return [
    [`${y}-01-01`, 'Første nyttårsdag'], [addDays(E, -3), 'Skjærtorsdag'], [addDays(E, -2), 'Langfredag'], [E, 'Første påskedag'], [addDays(E, 1), 'Andre påskedag'],
    [`${y}-05-01`, 'Arbeidernes dag'], [`${y}-05-17`, 'Grunnlovsdag'], [addDays(E, 39), 'Kristi himmelfartsdag'], [addDays(E, 49), 'Første pinsedag'], [addDays(E, 50), 'Andre pinsedag'],
    [`${y}-12-25`, 'Første juledag'], [`${y}-12-26`, 'Andre juledag'],
  ].map(([date, name]) => ({ date, name })).sort((a, b) => (a.date < b.date ? -1 : 1));
}
function holidayEvents(u, fromDate, toDate) {
  const out = [];
  const color = appCalendarsOf(u).find((c) => c.id === 'helligdager')?.color ?? '#a39d90';
  for (let y = Number(fromDate.slice(0, 4)); y <= Number(toDate.slice(0, 4)); y++) {
    for (const h of holidaysNO(y)) {
      if (h.date < fromDate || h.date > toDate) continue;
      out.push({ id: `hol-no-${h.date.replace(/-/g, '')}`, title: h.name, short: h.name.length > 18 ? `${h.name.slice(0, 17)}…` : h.name, subject: null, room: '', teacher: '', note: 'Offentlig høytidsdag · fridag',
        start: h.date, end: addDays(h.date, 1), allDay: true, date: h.date, time: null, inAllDayRow: true, type: 'helligdag', color, source: 'helligdager', calendar: 'helligdager',
        editable: false, reminder: 'none', holiday: true, fri: true, origin: 'Helligdager · Norge' });
    }
  }
  return out;
}
addEventSource(async (u, fromDate, toDate) => (modeOf(u) === 'four' ? { id: 'helligdager', name: 'Helligdager', events: holidayEvents(u, fromDate, toDate) } : null));

/* ---------------- Skole-kilden (iCal-URL) ---------------- */

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };
/** Skole-kilden: eget valg (PATCH url), ellers første iCal som er slått inn i Skole, ellers serverens skole-iCal (cal_ics). */
function schoolOf(u) {
  const s = st(u), ext = extCalendarsOf(u).filter((c) => c.source === 'ical');
  const own = s.school?.icalId ? ext.find((c) => c.id === s.school.icalId) : null;
  const merged = own ?? ext.find((c) => s.merged?.[c.id] === 'skole');
  const interval = INTERVALS[s.school?.interval] ? s.school.interval : '1h';
  if (merged) {
    const fails = s.school?.fails ?? 0;
    return { url: merged.url, host: hostOf(merged.url), interval, lastFetched: merged.fetchedAt ?? null, status: merged.error && fails >= 3 ? 'Feil · sjekk URL' : merged.error ? 'Prøver igjen' : 'ok', error: merged.error ?? null, icalId: merged.id };
  }
  let sys = '';
  try { sys = userCfg(u, 'cal_ics') || ''; } catch { /* */ }
  if (sys) return { url: sys.replace(/([?&](?:token|key|auth|secret)=)[^&]+/gi, '$1…'), host: hostOf(sys), interval, lastFetched: null, status: 'ok', error: null, icalId: null, system: true };
  return { url: null, host: null, interval, lastFetched: null, status: process.env.MOCK_DATA === '1' ? 'ok' : 'Ikke satt', error: null, icalId: null, ...(process.env.MOCK_DATA === '1' ? { host: 'tp.uio.no', mock: true } : {}) };
}
async function subjectColorsOf(u) {
  const own = layoutOf(u)?.subjectColors ?? {};
  const rows = db.prepare('SELECT key, color FROM study_subject_colors WHERE user_id=? ORDER BY created').all(u);
  const m = new Map(rows.map((r) => [r.key, r.color]));
  for (const [k, v] of Object.entries(own)) if (COLOR.test(String(v))) m.set(k, v);
  return [...m].map(([key, color]) => ({ key, color }));
}

/* ---------------- Radene (ny form) ---------------- */

const SRC_KIND = { ical: 'url', ha: 'own', google: 'google', own: 'own', builtin: 'builtin' };
const BADGE = { google: 'GOOGLE', url: 'URL', builtin: 'INNEBYGD', own: 'EGEN' };
function shape(u, c) {
  if (c.shape39) return c;
  const s = st(u), o = s.cal?.[c.id] ?? {};
  const kind = c.source ?? 'own';
  let source = SRC_KIND[kind] ?? 'own', sourceLabel = c.name, extra = {};
  if (c.builtin && FOUR.includes(c.id) && modeOf(u) === 'four') {
    const g = calendarLinks(u).google;
    if (c.id === 'personlig' || c.id === 'bursdager') { source = 'google'; sourceLabel = g.connected ? g.email ?? 'Google' : c.id === 'bursdager' ? 'Bursdager i Homelab' : 'Ikke koblet'; extra.status = g.connected ? 'ok' : 'Ikke koblet'; }
    else if (c.id === 'skole') { const sc = schoolOf(u); source = 'url'; sourceLabel = sc.host ? `${sc.host} · ${INTERVAL_LABEL[sc.interval]}` : 'Ingen URL ennå'; extra = { url: sc.url, interval: sc.interval, lastFetched: sc.lastFetched ? new Date(sc.lastFetched).toISOString() : null, status: sc.status, ...(sc.error ? { error: sc.error } : {}) }; }
    else if (c.id === 'helligdager') { source = 'builtin'; const cc = COUNTRIES[o.country] ? o.country : 'NO'; sourceLabel = COUNTRIES[cc]; extra = { country: cc, fridagerOnly: true }; }
  } else if (kind === 'ical') sourceLabel = `${hostOf(c.url) ?? 'iCal'} · ${INTERVAL_LABEL['1h']}`;
  else if (kind === 'ha') sourceLabel = 'Home Assistant';
  else if (kind === 'google') sourceLabel = 'Google';
  else if (c.builtin) source = 'builtin', sourceLabel = 'Homelab';
  const badge = kind === 'ha' ? 'HA' : BADGE[source] ?? 'EGEN';
  const nDef = NOTIFY_DEFAULT[c.id] ?? true;
  return { ...c, kind, source, sourceLabel, badge, notify: typeof o.notify === 'boolean' ? o.notify : nDef, notifyLabel: (typeof o.notify === 'boolean' ? o.notify : nDef) ? NOTIFY_LABEL[c.id] ?? '15 min før' : 'Av',
    showInBrief: typeof o.showInBrief === 'boolean' ? o.showInBrief : true, removable: !c.builtin, relinkOnly: c.id === 'personlig', shape39: true, ...extra };
}
_setKal39({ mode: modeOf, merged: mergedInto, shape, ensure: ensureMigrated, extra: (u) => ({ migration: st(u).migration ?? null }) });

async function withSubjects(u, out) {
  const sk = out.calendars.find((c) => c.id === 'skole');
  if (sk) sk.subjectColors = await subjectColorsOf(u);
  return out;
}

/* ---------------- Ruter: /api/kalender/calendars (monteres før kalender33) ---------------- */

const bad = (c, error, status = 400) => c.json({ error }, status);
const changed = (u, action = 'calendars', extra = {}) => { try { broadcast('kalender', { action, ...extra }, [u]); } catch { /* */ } };
export const cals39Api = new Hono();
cals39Api.use('*', authOrToken);
cals39Api.get('/', async (c) => { const u = c.get('user'); return c.json(await withSubjects(u, await calendarsOut(u))); });
cals39Api.post('/migration/undo', async (c) => {
  const u = c.get('user'), r = undoMigration(u);
  if (r.error) return bad(c, r.error, r.status);
  changed(u);
  return c.json({ ...r, ...(await calendarsOut(u)) });
});
cals39Api.post('/migration', async (c) => {
  const u = c.get('user'), migration = redoMigration(u);
  clearCalendarCache(u);
  changed(u);
  return c.json({ ok: true, ...(await calendarsOut(u)), migration });
});
cals39Api.post('/url/preview', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const r = await previewUrl(b?.url);
  return r.error ? bad(c, r.error) : c.json(r);
});
/** POST /:id/refresh – «↻ Oppdater nå» for Skole (skole) eller et iCal-abonnement (ical-…). */
cals39Api.post('/:id/refresh', async (c, next) => {
  const u = c.get('user'), id = c.req.param('id');
  if (id === 'skole') return refreshSchool(c);
  if (!/^ical-[\w.-]+$/.test(id)) return id === 'ical' ? next() : bad(c, 'Bare Skole og iCal-abonnement kan oppdateres', 400);
  const x = await runAsUser(u, () => refreshIcal(u, id));
  if (!x) return bad(c, 'Fant ikke kalenderen', 404);
  clearCalendarCache(u); changed(u);
  return c.json({ calendar: appCalendarsOf(u).find((k) => k.id === id) ?? null, refreshed: true });
});
cals39Api.post('/skole/refresh', (c) => refreshSchool(c));
async function refreshSchool(c) {
  const u = c.get('user'), sc = schoolOf(u);
  if (!sc.icalId) return bad(c, 'Skole har ingen URL å hente. Lim inn en iCal-adresse først.', 409);
  await runAsUser(u, () => refreshIcal(u, sc.icalId));
  noteFetch(u);
  clearCalendarCache(u);
  changed(u);
  return c.json({ calendar: (await calendarsOut(u)).calendars.find((x) => x.id === 'skole') });
}
/** PATCH med de nye feltene (notify, showInBrief, url, interval, country); resten (navn, farge, synlighet) går videre til kalender33. */
cals39Api.patch('/:id', async (c, next) => {
  const u = c.get('user'), id = c.req.param('id');
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad(c, 'Forventet et objekt');
  const mine = {};
  for (const k of ['notify', 'showInBrief']) if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') return bad(c, `${k} må være true eller false`); mine[k] = b[k]; }
  if (b.country !== undefined) { if (id !== 'helligdager') return bad(c, 'country gjelder bare Helligdager'); if (!COUNTRIES[b.country]) return bad(c, 'Bare Norge (NO) støttes foreløpig'); mine.country = b.country; }
  if (b.interval !== undefined) { if (id !== 'skole') return bad(c, 'interval gjelder bare Skole'); if (!INTERVALS[b.interval]) return bad(c, 'interval må være 15m, 1h, 6h eller 1d'); }
  if (b.url !== undefined && id !== 'skole') return bad(c, 'url gjelder bare Skole');
  if (b.subjectColors !== undefined) {
    // Farge per fag (Skole): {FYS1000:'#2b5d8a', …} eller [{key, color}]; null fjerner eget valg. Lagres i layout.subjectColors (samme som appene).
    if (id !== 'skole') return bad(c, 'subjectColors gjelder bare Skole');
    const list = Array.isArray(b.subjectColors) ? b.subjectColors.map((x) => [x?.key, x?.color]) : b.subjectColors && typeof b.subjectColors === 'object' ? Object.entries(b.subjectColors) : null;
    if (!list || list.length > 60 || list.some(([k, v]) => typeof k !== 'string' || !k.trim() || k.length > 40 || (v !== null && !COLOR.test(String(v))))) return bad(c, 'subjectColors må være {fag:"#rrggbb"|null}');
    const l = layoutOf(u) ?? {}, sc = { ...(l.subjectColors ?? {}) };
    for (const [k, v] of list) { if (v === null) delete sc[k]; else sc[k] = String(v).toLowerCase(); }
    kv.set(u, 'layout', { ...(kv.get(u, 'layout', {}) ?? {}), subjectColors: sc });
    clearCalendarCache(u);
  }
  if (b.url !== undefined) {
    const url = normalizeIcalUrl(b.url);
    if (!url || !/^(webcals?:\/\/|https?:\/\/)/i.test(String(b.url).trim())) return bad(c, 'Skriv en iCal-adresse (webcal:// eller https://…ics)');
    const cur = schoolOf(u);
    if (cur.url !== url) {
      const existing = extCalendarsOf(u).find((x) => x.source === 'ical' && x.url === url);
      let icalId = existing?.id;
      if (!icalId) {
        const r = await runAsUser(u, () => addIcal(u, { url, name: 'Skole' }));
        if (r.error) return bad(c, r.error, r.status ?? 400);
        icalId = r.calendar.id;
      }
      if (cur.icalId && cur.icalId !== icalId) removeExt(u, cur.icalId); // «Lim inn ny URL»: den gamle adressen erstattes
      const s = st(u);
      save(u, { merged: { ...(s.merged ?? {}), [icalId]: 'skole' }, school: { ...(s.school ?? {}), icalId, fails: 0, lastAt: Date.now() } });
      clearCalendarCache(u);
    }
  }
  if (b.interval !== undefined) { const s = st(u); save(u, { school: { ...(s.school ?? {}), interval: b.interval } }); }
  if (Object.keys(mine).length) {
    if (!appCalendarsOf(u).some((x) => x.id === id)) return bad(c, 'Fant ikke kalenderen', 404);
    const s = st(u);
    save(u, { cal: { ...(s.cal ?? {}), [id]: { ...(s.cal?.[id] ?? {}), ...mine } } });
  }
  const rest = Object.keys(b).filter((k) => !['notify', 'showInBrief', 'url', 'interval', 'country', 'subjectColors'].includes(k));
  if (rest.length) {
    await next();
    if (!c.res || c.res.status >= 300) return;
  }
  changed(u);
  const cal = (await withSubjects(u, await calendarsOut(u))).calendars.find((x) => x.id === id) ?? appCalendarsOf(u).find((x) => x.id === id);
  const res = cal ? c.json({ calendar: cal }) : bad(c, 'Fant ikke kalenderen', 404);
  if (rest.length) { c.res = res; return; }
  return res;
});

/** URL: hent én gang og vis navn + antall hendelser (de neste 120 dagene) og fagene før lagring. */
async function previewUrl(raw) {
  const url = normalizeIcalUrl(raw);
  if (!url) return { error: 'Skriv en iCal-adresse (webcal:// eller https://…ics)' };
  if (process.env.MOCK_DATA === '1') return { ok: true, url, name: guessName(url), count: 42, subjects: ['FYS1000', 'MAT1100', 'IN2010'], mock: true };
  let text;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'homelab-os kalender', Accept: 'text/calendar, */*' }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return { error: `Serveren svarte ${r.status}` };
    text = await r.text();
  } catch (e) { return { error: `Fikk ikke kontakt (${e.cause?.code ?? e.name})` }; }
  if (!/BEGIN:VCALENDAR/i.test(text)) return { error: 'Lenken ga ikke en iCal-kalender (.ics)' };
  const cal = parseIcs(text), now = Date.now();
  const items = expandIcs(cal, now, now + 120 * 86400_000);
  const subjects = [...new Set(items.map((i) => fagKey(i.summary)).filter(Boolean))].slice(0, 20);
  return { ok: true, url, name: text.match(/^X-WR-CALNAME:(.+)$/im)?.[1]?.trim()?.slice(0, 40) || guessName(url), count: items.length, subjects };
}

/* ---------------- Oppdateringsintervall for Skole ---------------- */

function noteFetch(u) {
  const sc = schoolOf(u), s = st(u);
  save(u, { school: { ...(s.school ?? {}), lastAt: Date.now(), fails: sc.error ? (s.school?.fails ?? 0) + 1 : 0 } });
}
export async function refreshSchools(now = Date.now()) {
  let n = 0;
  for (const { id } of db.prepare('SELECT id FROM users').all()) {
    const s = st(id), sc = schoolOf(id);
    if (!sc.icalId) continue;
    if (now - (s.school?.lastAt ?? 0) < INTERVALS[sc.interval]) continue;
    try { await runAsUser(id, () => refreshIcal(id, sc.icalId)); } catch { /* feilen står på raden */ }
    noteFetch(id); clearCalendarCache(id); n++;
  }
  return n;
}
if (process.env.NODE_ENV !== 'test') setInterval(() => { refreshSchools().catch((e) => console.warn('[kalender39]', e.message)); }, 5 * 60_000).unref?.();

/* ---------------- Google-velgeren (1d) ---------------- */

const appIdOf = (calId) => `g-${createHash('sha1').update(String(calId)).digest('hex').slice(0, 10)}`;
export function suggestRole(x) {
  const n = norm(x.name);
  if (/bursdag|birthday|fodselsdag|kontakter|contacts/.test(n) || /#contacts@/.test(String(x.googleId ?? ''))) return 'b';
  if (x.primary) return 'p';
  if (/helligdag|holiday|#holiday@/.test(`${n} ${x.googleId ?? ''}`)) return null;
  if (x.access === 'owner') return 'p';
  return null;
}
const accessLabel = (x) => (x.primary ? 'primær · eier' : x.access === 'owner' ? 'eier' : x.access === 'writer' ? 'delt · kan redigere' : 'kan se');
const jobs = new Map();
const jobOut = (j) => (j ? { id: j.id, state: j.state, pct: j.pct, msg: j.msg, count: j.count ?? null, startedAt: j.startedAt, finishedAt: j.finishedAt ?? null, ...(j.error ? { error: j.error } : {}) } : null);
async function mappingOut(u) {
  const g = calendarLinks(u).google;
  const s = st(u), sc = schoolOf(u);
  const holidays = { country: COUNTRIES[s.cal?.helligdager?.country] ? s.cal.helligdager.country : 'NO', name: 'Norge' };
  const school = { url: sc.url, host: sc.host, status: sc.status, interval: sc.interval };
  const cals = appCalendarsOf(u);
  const colorOf = (id) => cals.find((c) => c.id === id)?.color;
  let calendars = [];
  if (g.connected) {
    const list = await googleCalendarList(u);
    calendars = list.map((x) => {
      const suggested = suggestRole(x);
      const has = s.gmap && Object.prototype.hasOwnProperty.call(s.gmap, x.googleId);
      return { googleId: x.googleId, id: x.id, name: x.name, color: x.color ?? '#b23a2a', access: accessLabel(x), primary: x.primary, writable: x.writable, role: has ? s.gmap[x.googleId] : suggested, suggested };
    });
  }
  const names = (r) => calendars.filter((x) => x.role === r).map((x) => x.name);
  const own = (t) => Object.entries(s.merged ?? {}).filter(([, v]) => v === t).map(([id]) => [...extCalendarsOf(u), ...googleExtraOf(u)].find((x) => x.id === id)?.name).filter(Boolean);
  const sum = (p) => (p.length > 1 ? `${p.join(' + ')} · slått sammen` : p[0] ?? '');
  const pP = [...new Set([...names('p'), ...own('personlig')])], pB = [...new Set([...names('b'), 'Bursdager i Homelab'])];
  const preview = [
    { id: 'personlig', name: 'Personlig', color: colorOf('personlig'), parts: pP.length ? pP : ['Lokalt i Homelab'] },
    { id: 'bursdager', name: 'Bursdager', color: colorOf('bursdager'), parts: pB },
    { id: 'skole', name: 'Skole', color: colorOf('skole'), parts: sc.host ? [`${sc.host} · ${INTERVAL_LABEL[sc.interval]}`] : ['Ingen URL ennå'] },
    { id: 'helligdager', name: 'Helligdager', color: colorOf('helligdager'), parts: [holidays.name] },
  ].map((p) => ({ ...p, summary: sum(p.parts) }));
  const last = [...jobs.values()].filter((j) => j.user === u).sort((a, b) => b.startedAt - a.startedAt)[0];
  return { connected: !!g.connected, configured: !!g.configured, email: g.email ?? null, calendars, school, holidays, preview,
    note: 'Kalendere som ikke brukes, hentes ikke. Nye hendelser fra appen lagres i primær Google-kalender (Personlig).', job: jobOut(last) };
}
function startSync(u) {
  const j = { id: `ks${randomBytes(5).toString('hex')}`, user: u, state: 'running', pct: 5, msg: 'Starter synk …', startedAt: new Date().toISOString() };
  jobs.set(j.id, j);
  const emit = () => changed(u, 'sync', { jobId: j.id, state: j.state, pct: j.pct, msg: j.msg });
  emit();
  (async () => {
    try {
      clearCalendarCache(u);
      j.pct = 30; j.msg = 'Henter hendelser fra Google …'; emit();
      const today = osloTodayISO();
      const { events } = await runAsUser(u, () => eventsFor(u, addDays(today, -30), addDays(today, 180)));
      j.pct = 90; j.msg = 'Sorterer i de fire kalenderne …'; emit();
      j.count = events.length;
      Object.assign(j, { state: 'done', pct: 100, msg: `Ferdig · ${events.length} hendelser`, finishedAt: new Date().toISOString() });
    } catch (e) { Object.assign(j, { state: 'error', pct: 100, msg: 'Synken feilet', error: String(e.message ?? e).slice(0, 200), finishedAt: new Date().toISOString() }); }
    emit();
    changed(u);
    setTimeout(() => jobs.delete(j.id), 30 * 60_000).unref?.();
  })();
  return j;
}
export const googleMap39Api = new Hono();
googleMap39Api.use('*', authOrToken);
googleMap39Api.get('/mapping', async (c) => {
  try { return c.json(await mappingOut(c.get('user'))); } catch (e) { return bad(c, e.message || 'Kunne ikke hente Google-kalendere', e.status && e.status < 500 ? e.status : 502); }
});
googleMap39Api.get('/mapping/jobs/:id', (c) => { const j = jobs.get(c.req.param('id')); return j && j.user === c.get('user') ? c.json(jobOut(j)) : bad(c, 'Fant ikke jobben', 404); });
googleMap39Api.put('/mapping', async (c) => {
  const u = c.get('user');
  if (!googleConnected(u)) return bad(c, 'Logg inn med Google først (Innstillinger → Kalendere)', 409);
  const b = await c.req.json().catch(() => null);
  const map = b?.map;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return bad(c, 'Forventet {map:{googleId:"p"|"b"|null}}');
  let list;
  try { list = await googleCalendarList(u); } catch (e) { return bad(c, e.message || 'Kunne ikke hente Google-kalendere', 502); }
  const byG = new Map(list.flatMap((x) => [[x.googleId, x], [x.id, x]]));
  const s = st(u), gmap = { ...(s.gmap ?? {}) };
  for (const [k, v] of Object.entries(map)) {
    const x = byG.get(k);
    if (!x) return bad(c, `Fant ikke kalenderen «${k}» i Google-kontoen`);
    if (![null, 'p', 'b'].includes(v)) return bad(c, 'Rollen må være "p" (Personlig), "b" (Bursdager) eller null (Ikke bruk)');
    gmap[x.googleId] = v;
  }
  const roleOf = (x) => (Object.prototype.hasOwnProperty.call(gmap, x.googleId) ? gmap[x.googleId] : suggestRole(x));
  const ps = list.filter((x) => roleOf(x) === 'p');
  const main = ps.find((x) => x.primary && x.writable) ?? ps.find((x) => x.writable);
  if (!main) return bad(c, 'Personlig må ha minst én Google-kalender du kan skrive i (primær anbefales)');
  const old = new Map(googleExtraOf(u).map((x) => [x.calId, x]));
  const extras = [], merged = { ...(s.merged ?? {}) };
  for (const x of list) {
    if (x.id === main.id) continue;
    const prev = old.get(x.id);
    if (prev) delete merged[prev.id];
    const r = roleOf(x);
    if (!r) continue;
    const id = prev?.id ?? appIdOf(x.id);
    extras.push({ id, calId: x.id, name: x.name, color: prev?.color ?? (COLOR.test(x.color ?? '') ? x.color.toLowerCase() : '#b23a2a'), visible: true, hidMenu: false, writable: x.writable });
    merged[id] = r === 'p' ? 'personlig' : 'bursdager';
  }
  const fam = list.find((x) => /famil/i.test(x.name) && !x.primary);
  googleConfSet(u, { mainCalendarId: main.id, extraCalendars: extras, ...(fam && fam.id !== main.id ? { familyCalendarId: roleOf(fam) ? fam.id : null } : {}) });
  save(u, { gmap, merged });
  logMig(u, `Google-kobling lagret: Personlig = ${ps.map((x) => x.name).join(' + ')}; Bursdager = ${list.filter((x) => roleOf(x) === 'b').map((x) => x.name).join(' + ') || '–'}`);
  const j = startSync(u);
  return c.json({ ok: true, ...(await mappingOut(u)), job: jobOut(j) });
});

export const _kal39 = { st, save, jobs, schoolOf };
