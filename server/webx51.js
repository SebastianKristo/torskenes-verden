// Prompt 51 (WEBX51): felles søk over alle moduler, onboarding for nye familiemedlemmer, tema per bruker (synket mellom enheter,
// automatisk etter sola/klokka) og konfliktvarsel for offline-køen. API-formene står i SERVER51-API.md (seksjon WEBX51) og i
// docs/web-51.md.
//
//   GET    /api/search51?q=&types=&limit=      → {q, ms, engine, results:[Result], groups:[{type,label,count}], recent?}
//   GET    /api/search51/types                 → {types:[{type,label,icon}]}
//   POST   /api/search51/recent {q} · DELETE /api/search51/recent
//   POST   /api/onboard51/invites (admin) · GET /api/onboard51/invites (admin) · DELETE /api/onboard51/invites/:id (admin)
//   POST   /api/onboard51/preview {id, code | link}  (uinnlogget)
//   POST   /api/onboard51/accept {id, code | link, username, password, name?, share?, client?, device?, platform?} (uinnlogget)
//   GET    /join/:id.:code                     → veiviseren (public/join51.html)
//   GET/PUT /api/me/share51 · GET/PUT /api/me/theme51
//   GET    /api/offline51/versions?tasks=1,2&events=3
//   Mellomvare: X-Offline51-Base på PATCH/DELETE /api/tasks/:id og PATCH /api/famcal51/events/:id → X-Offline51-Conflict
//
// Sikkerhet: søket ser bare det brukeren selv har tilgang til (samme regler som modulene). Invitasjonen er en engangskode, aldri et
// token: QR/lenke har bare id + kode + offentlig server-URL, koden lagres bare som hash, varer maks 7 døgn, kan brukes én gang og
// trekkes tilbake. Nye kontoer fra en invitasjon er alltid vanlige brukere, og app-tokenet får aldri bredere scope enn en vanlig
// app-innlogging. Ugyldige koder telles i SEC51-sperren (scope qr, per IP).
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { db, kv, OWNER } from './db.js';
import { config } from './config.js';
import { authOrToken } from './mobile.js';
import { userInfo, listUsers, isAdmin, createUser, createSession, trustIp, serverName, rememberDevice } from './auth.js';
import { broadcast } from './realtime.js';
import { notifyUser } from './notify.js';
import { family50 as F } from './family.js';
import { qrSvg } from './totp.js';
import { publicUrl46, originOf46 } from './public-url46.js';
import { blocked51, fail51, clear51 } from './ratelimit51.js';
import { gate51, afterLogin51 } from './sec51.js';
import { issueToken, SCOPES as FH_SCOPES } from './finans/routes.js';
import { ensureIndex42, norm42, fold42, synonymsOf42 } from './finans/search42.js';
import { settings as fhSettings } from './finans/db.js';
import { gateEmbed } from './ai-gate.js';
import { sunTime } from './weather.js';

const q = (sql) => db.prepare(sql);
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const NO_STORE = { 'Cache-Control': 'no-store' };
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status, NO_STORE);
const isoOf = (t) => (t ? new Date(t).toISOString() : null);
const nameOf = (id) => { const u = userInfo(id); return u?.displayName ?? u?.name ?? u?.username ?? null; };
const hasTable = (t) => !!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const hasCol = (t, col) => hasTable(t) && q(`PRAGMA table_info(${t})`).all().some((x) => x.name === col);
const ymdOslo = (t = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date(t));
const dayLabel = (ymd) => {
  if (!ymd) return null;
  const today = ymdOslo(), tomorrow = ymdOslo(Date.now() + DAY), yesterday = ymdOslo(Date.now() - DAY);
  if (ymd === today) return 'i dag';
  if (ymd === tomorrow) return 'i morgen';
  if (ymd === yesterday) return 'i går';
  const [y, m, d] = ymd.split('-').map(Number);
  const M = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
  return `${d}. ${M[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`;
};
const kr = (n) => (n == null ? null : `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\s/g, ' ')} kr`);

/* =====================================================================================================================
   Tabeller (additive)
   ===================================================================================================================== */

db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search51_fts USING fts5(type UNINDEXED, ref UNINDEXED, uid UNINDEXED, meta UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 0');
CREATE TABLE IF NOT EXISTS onboard51_invites (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, name TEXT NOT NULL, username TEXT, share TEXT NOT NULL DEFAULT '{}',
  note TEXT, created INTEGER NOT NULL, created_by TEXT NOT NULL, expires INTEGER NOT NULL, used_at INTEGER, user_id TEXT, revoked_at INTEGER);`);

/* =====================================================================================================================
   Søk – typer
   ===================================================================================================================== */

export const TYPES51 = {
  action: ['Handlinger', 'bolt'], page: ['Sider', 'gear'], task: ['Gjøremål', 'check'], shopping: ['Handleliste', 'cart'], list: ['Lister', 'list'],
  event: ['Familiekalender', 'calendar'], receipt: ['Kvitteringer', 'receipt'], line: ['Varelinjer', 'receipt'], transaction: ['Transaksjoner', 'card'],
  place: ['Steder', 'pin'], person: ['Folk', 'person'], package: ['Pakker', 'box'], study: ['Studie', 'book'], chat: ['Chat', 'chat'], birthday: ['Bursdager', 'cake'],
};
// Vekt per type (rekkefølgen når treffene er like gode): handlinger og ting du jobber med først, historikk sist.
const WEIGHT = { action: 0.9, page: 0.85, task: 1, shopping: 1, list: 0.9, event: 0.95, person: 0.95, place: 0.9, package: 0.9, receipt: 0.85, transaction: 0.8, line: 0.75, study: 0.8, chat: 0.75, birthday: 0.85 };
const SHOP_RE = /^(handel|handleliste|handlelista|handle|innkjøp|dagligvarer)\b/i;
const appLink = (type, id) => `papir://open?type=${encodeURIComponent(type)}&id=${encodeURIComponent(String(id))}`;

/* ---------------- Dokumenter per bruker (search51_fts) ---------------- */

function tasksDocs(u) {
  if (!hasTable('hl_tasks')) return [];
  const lists = q(`SELECT * FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?)`).all(u, u);
  const byId = new Map(lists.map((l) => [l.id, l]));
  const arch = hasCol('hl_tasks', 'archived_at') ? 'AND archived_at IS NULL' : '';
  const rows = q(`SELECT * FROM hl_tasks WHERE (list IN (SELECT id FROM hl_task_lists WHERE owner=@u OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=@u))
    OR (created_by=@u AND (list='' OR list NOT IN (SELECT id FROM hl_task_lists)))) ${arch} ORDER BY done, id DESC LIMIT 3000`).all({ u });
  const out = lists.map((l) => ({ type: 'list', ref: l.id, title: l.name, body: '', meta: { name: l.name, kind: l.kind ?? null } }));
  for (const t of rows) {
    const l = byId.get(t.list);
    const shop = !!l && SHOP_RE.test(l.name ?? '');
    out.push({ type: shop ? 'shopping' : 'task', ref: String(t.id), title: t.title, body: [t.note, l?.name, t.tags].filter(Boolean).join(' '),
      meta: { list: l?.name ?? null, listId: l?.id ?? null, due: t.due ?? null, done: !!t.done, assignee: t.assignee ?? null, updated: t.updated_at ?? null } });
  }
  return out;
}
function famcalDocs() {
  if (!hasTable('famcal51_event')) return [];
  const tasks = hasTable('famcal51_task') ? q('SELECT event_id, kind, assignee FROM famcal51_task').all() : [];
  const drivers = new Map();
  for (const t of tasks) { const a = drivers.get(t.event_id) ?? []; a.push(`${t.kind} ${t.assignee ? nameOf(t.assignee) ?? '' : 'trenger sjåfør'}`); drivers.set(t.event_id, a); }
  return q('SELECT * FROM famcal51_event WHERE start > ? ORDER BY start DESC LIMIT 2000').all(Date.now() - 400 * DAY).map((e) => ({
    type: 'event', ref: String(e.id), title: e.title, body: [e.place_name, e.note, ...(drivers.get(e.id) ?? [])].filter(Boolean).join(' '),
    meta: { start: e.start, allDay: !!e.all_day, place: e.place_name ?? null, needsDriver: (drivers.get(e.id) ?? []).some((x) => /trenger sjåfør/.test(x)) } }));
}
function placeDocs(u) {
  try { return F.zonesFor(u).map((z) => ({ type: 'place', ref: String(z.id), title: z.name, body: z.place_type ?? '', meta: { placeType: z.place_type ?? null, shared: !!z.shared } })); } catch { return []; }
}
function personDocs(u) {
  try { return F.everyone(u).filter((p) => !p.mock).map((p) => ({ type: 'person', ref: p.id, title: p.self ? `${p.name} (deg)` : p.name, body: userInfo(p.id)?.username ?? '', meta: { self: !!p.self, color: p.color } })); } catch { return []; }
}
function packageDocs(u) {
  if (!hasTable('hl_shipments')) return [];
  const own = u === OWNER ? 'COALESCE(user_id, @u)=@u' : 'user_id=@u';
  return q(`SELECT * FROM hl_shipments WHERE ${own} AND archived=0 ORDER BY id DESC LIMIT 500`).all({ u }).map((s) => ({
    type: 'package', ref: String(s.id), title: s.name || s.shop || s.tracking_no, body: [s.tracking_no, s.shop, s.carrier, s.pickup_point].filter(Boolean).join(' '),
    meta: { status: s.status, eta: s.eta ?? null, carrier: s.carrier, trackingNo: s.tracking_no } }));
}
const STUDY_KIND = { vitnemal: 'Vitnemål', karakterutskrift: 'Karakterutskrift', diploma: 'Diplom', annet: 'Dokument' };
function studyDocs(u) {
  if (!hasTable('study44_docs')) return [];
  return q('SELECT id, kind, filename, parsed, updated FROM study44_docs WHERE user_id=? ORDER BY id DESC LIMIT 300').all(u).map((d) => {
    let p = {}; try { p = JSON.parse(d.parsed) ?? {}; } catch { /* */ }
    return { type: 'study', ref: String(d.id), title: p.title || p.program || d.filename, body: [d.filename, p.institution, p.program, p.student].filter(Boolean).join(' '),
      meta: { kind: STUDY_KIND[d.kind] ?? 'Dokument', institution: p.institution ?? null } };
  });
}
function chatDocs(u) {
  if (!hasTable('hl_chats')) return [];
  return q('SELECT id, title, updated FROM hl_chats WHERE user_id=? ORDER BY updated DESC LIMIT 500').all(u).map((x) => ({ type: 'chat', ref: x.id, title: x.title, body: '', meta: { updated: x.updated } }));
}
function birthdayDocs(u) {
  if (!hasTable('birthdays')) return [];
  return q('SELECT * FROM birthdays WHERE user_id=? LIMIT 1000').all(u).map((b) => ({ type: 'birthday', ref: String(b.id), title: b.name, body: b.relation ?? '', meta: { month: b.month, day: b.day, year: b.year ?? null } }));
}
const SOURCES = [tasksDocs, (u) => famcalDocs(u), placeDocs, personDocs, packageDocs, studyDocs, chatDocs, birthdayDocs];

const sigQ = (sql, ...a) => { try { return q(sql).pluck().get(...a) ?? ''; } catch { return ''; } };
function signature(u) {
  return [
    sigQ("SELECT count(*)||':'||ifnull(max(updated_at),0)||':'||ifnull(sum(done),0) FROM hl_tasks"),
    sigQ("SELECT count(*)||':'||group_concat(name, ',') FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?)", u, u),
    sigQ("SELECT count(*)||':'||ifnull(max(updated),0) FROM famcal51_event"), sigQ("SELECT count(*)||':'||ifnull(max(updated),0) FROM famcal51_task"),
    sigQ("SELECT count(*)||':'||ifnull(max(id),0)||':'||ifnull(sum(length(name)),0)||':'||ifnull(sum(shared),0) FROM family_zone"),
    sigQ("SELECT count(*)||':'||ifnull(max(created),0)||':'||ifnull(sum(length(name)),0) FROM users"),
    sigQ("SELECT count(*)||':'||ifnull(max(id),0)||':'||ifnull(sum(archived),0)||':'||ifnull(sum(length(status)),0) FROM hl_shipments WHERE COALESCE(user_id,'')=? OR user_id IS NULL", u),
    sigQ("SELECT count(*)||':'||ifnull(max(updated),0) FROM study44_docs WHERE user_id=?", u),
    sigQ("SELECT count(*)||':'||ifnull(max(updated),0) FROM hl_chats WHERE user_id=?", u),
    sigQ("SELECT count(*)||':'||ifnull(max(updated),0) FROM birthdays WHERE user_id=?", u),
  ].join('|');
}
const built = new Map(); // bruker → {sig, at}
/** Bygger brukerens rader i search51_fts på nytt når dataene er endret. → antall dokumenter (null = uendret) */
export function ensureIndex51(u, { force = false } = {}) {
  const sig = signature(u);
  if (!force && built.get(u)?.sig === sig) return null;
  const docs = [];
  for (const src of SOURCES) { try { docs.push(...src(u)); } catch (e) { console.warn('[søk51] kilde:', e.message); } }
  const ins = q('INSERT INTO search51_fts(type, ref, uid, meta, title, body) VALUES(?,?,?,?,?,?)');
  db.transaction(() => {
    q('DELETE FROM search51_fts WHERE uid=?').run(u);
    for (const d of docs) ins.run(d.type, d.ref, u, JSON.stringify(d.meta ?? {}), clean(d.title, 300), clean(d.body, 2000));
  })();
  built.set(u, { sig, at: Date.now() });
  return docs.length;
}
export const _resetIndex51 = () => built.clear();

/* ---------------- Spørring ---------------- */

const words51 = (s) => fold42(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 8);
/** «tann lege» → «"tann"* "lege"*» (alle ordene, prefiks – paletten søker mens du skriver). */
const ftsExpr = (ws) => ws.map((w) => `"${w.replace(/"/g, '""')}"*`).join(' ');
function matchRanges(title, ws) {
  const t = fold42(title), out = [];
  for (const w of ws) {
    let i = t.indexOf(w);
    while (i >= 0 && out.length < 6) { if (i === 0 || !/[\p{L}\p{N}]/u.test(t[i - 1])) { out.push([i, i + w.length]); break; } i = t.indexOf(w, i + 1); }
    if (i < 0) { const j = t.indexOf(w); if (j >= 0) out.push([j, j + w.length]); }
  }
  return out.sort((a, b) => a[0] - b[0]);
}
function titleBoost(title, qf, ws) {
  const t = fold42(title);
  if (!qf) return 0;
  if (t === qf) return 0.35;
  if (t.startsWith(qf)) return 0.25;
  if (ws.every((w) => t.includes(w))) return 0.12;
  return 0;
}

function localHits(u, ws, types) {
  if (!ws.length) return [];
  let rows = [];
  try {
    rows = q('SELECT type, ref, meta, title, body, bm25(search51_fts, 0, 0, 0, 0, 3.0, 1.0) AS r FROM search51_fts WHERE search51_fts MATCH ? AND uid=? ORDER BY r LIMIT 200').all(ftsExpr(ws), u);
  } catch { rows = []; }
  // Delord («tomat» i «cherrytomat», «lege» i «tannlege») – FTS-prefikset finner bare ordstart.
  if (rows.length < 10 && ws.some((w) => w.length >= 3)) {
    const seen = new Set(rows.map((r) => `${r.type}:${r.ref}`));
    const like = q('SELECT type, ref, meta, title, body FROM search51_fts WHERE uid=?').all(u)
      .filter((r) => { const t = fold42(`${r.title} ${r.body}`); return ws.every((w) => t.includes(w)); })
      .filter((r) => !seen.has(`${r.type}:${r.ref}`)).slice(0, 60).map((r) => ({ ...r, r: 0, partial: true }));
    rows = rows.concat(like);
  }
  return rows.filter((r) => !types || types.has(r.type)).map((r, i) => { let meta = {}; try { meta = JSON.parse(r.meta); } catch { /* */ } return { ...r, meta, rank: r.partial ? i + 8 : i }; });
}

/* ---------------- Finans (Glimt-søkedatabasen fra prompt 42 + lokale embeddings) ---------------- */

function finFtsExpr(text) {
  const stems = norm42(text).split(' ').filter((w) => w.length >= 2).slice(0, 6);
  if (!stems.length) return null;
  return stems.map((s) => {
    const alts = [...new Set([s, ...synonymsOf42(s)])].filter((x) => x && /^[\p{L}\p{N}-]+$/u.test(x)).slice(0, 8).map((x) => `"${x.replace(/"/g, '""')}"*`);
    return alts.length > 1 ? `(${alts.join(' OR ')})` : alts[0];
  }).join(' AND ');
}
function finHits(u, text, types) {
  const want = (t) => !types || types.has(t);
  if (!want('receipt') && !want('line') && !want('transaction')) return [];
  try { ensureIndex42(u); } catch (e) { console.warn('[søk51] finansindeks:', e.message); return []; }
  const expr = finFtsExpr(text);
  let rows = [];
  if (expr) {
    try {
      rows = q(`SELECT s.*, bm25(search_fts42) AS r FROM search_fts42 f JOIN search_items s ON s.id=f.rowid WHERE search_fts42 MATCH ? AND s.user_id=? ORDER BY r LIMIT 120`).all(expr, u);
    } catch { rows = []; }
  }
  // Butikknavn som ikke stemmes pent («Rema 1000», «Kiwi») – direkte på visningsnavnet.
  const qf = fold42(text).trim();
  if (qf.length >= 2 && rows.length < 20) {
    const seen = new Set(rows.map((r) => r.id));
    rows = rows.concat(q("SELECT s.*, 0 AS r FROM search_items s WHERE s.user_id=? AND s.kind IN ('receipt','tx') AND lower(s.merchant_display) LIKE ? ORDER BY s.date DESC LIMIT 40")
      .all(u, `%${qf.replace(/[%_]/g, '')}%`).filter((r) => !seen.has(r.id)));
  }
  const kindType = { receipt: 'receipt', line: 'line', tx: 'transaction' };
  const per = { receipt: 0, line: 0, transaction: 0 };
  const out = [];
  for (const r of rows) {
    const type = kindType[r.kind];
    if (!type || !want(type) || per[type] >= (type === 'line' ? 8 : 10)) continue;
    per[type]++;
    out.push({ fin: r, type, ref: r.kind === 'line' ? r.ref : r.kind === 'tx' ? String(r.tx_id) : r.receipt_id, rank: out.length });
  }
  return out;
}
const blobVec = (b) => new Float32Array(b.buffer, b.byteOffset, b.length / 4);
/** Lokale embeddings (fh_embed) når en Ollama-embeddingmodell er valgt – aldri Gemini herfra. → [{kind, ref, score}] */
async function vectorHits51(u, text) {
  let model = null;
  try { model = fhSettings(u)?.embedModel || null; } catch { model = null; }
  if (!model || !hasTable('fh_embed') || !hasCol('fh_embed', 'user_id')) return [];
  const have = q('SELECT count(*) FROM fh_embed WHERE model=? AND user_id=?').pluck().get(model, u);
  if (!have) return [];
  try {
    const base = String(fhSettings(u)?.ollamaUrl ?? '').replace(/\/$/, '');
    if (!base) return [];
    const out = await gateEmbed({ model, input: [text], base, signal: AbortSignal.timeout(1500), priority: 'interactive', timeoutMs: 1500, label: 'Søk · felles søk' });
    const qv = out?.embeddings?.[0];
    if (!qv?.length) return [];
    const qn = Math.hypot(...qv) || 1;
    return q('SELECT kind, ref, vec FROM fh_embed WHERE model=? AND user_id=?').all(model, u).map((r) => {
      const v = blobVec(r.vec); let dot = 0, n = 0;
      for (let i = 0; i < v.length && i < qv.length; i++) { dot += v[i] * qv[i]; n += v[i] * v[i]; }
      return { kind: r.kind, ref: r.ref, score: dot / ((Math.sqrt(n) || 1) * qn) };
    }).filter((r) => r.score >= 0.72).sort((a, b) => b.score - a.score).slice(0, 15);
  } catch { return []; }
}

/* ---------------- Resultater ---------------- */

function shopListOf(u) {
  try {
    const ls = q('SELECT * FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?) ORDER BY owner<>?, sort, created').all(u, u, u);
    return ls.find((l) => SHOP_RE.test(l.name ?? '')) ?? null;
  } catch { return null; }
}
const open = (label = 'Åpne') => ({ id: 'open', label, kind: 'open' });

function resultOf(h, u, qtext) {
  const m = h.meta ?? {};
  const hl = encodeURIComponent(qtext ?? '');
  const base = { id: `${h.type}:${h.ref}`, type: h.type, typeLabel: TYPES51[h.type]?.[0] ?? h.type, icon: TYPES51[h.type]?.[1] ?? 'bolt', title: h.title, subtitle: '', date: null, amount: null };
  switch (h.type) {
    case 'task': case 'shopping': {
      const sub = [m.list, m.due ? dayLabel(m.due) : null, m.assignee && m.assignee !== u ? nameOf(m.assignee) : null, m.done ? 'fullført' : null].filter(Boolean).join(' · ');
      return { ...base, subtitle: sub, date: m.due ?? null, link: { web: `/#/gjoremal?task=${h.ref}`, app: appLink(h.type, h.ref), route: 'huske', ref: h.ref },
        actions: [m.done ? { id: 'undone', label: 'Ikke fullført', kind: 'http', method: 'PATCH', url: `/api/tasks/${h.ref}`, body: { done: false } }
          : { id: 'done', label: h.type === 'shopping' ? 'Kjøpt' : 'Fullfør', kind: 'http', method: 'PATCH', url: `/api/tasks/${h.ref}`, body: { done: true } }, open()], done: !!m.done };
    }
    case 'list': return { ...base, subtitle: SHOP_RE.test(m.name ?? '') ? 'Handleliste' : 'Liste', link: { web: `/#/gjoremal?list=${encodeURIComponent(h.ref)}`, app: appLink('list', h.ref), route: 'huske', ref: h.ref }, actions: [open('Åpne listen')] };
    case 'event': {
      const d = m.start ? ymdOslo(m.start) : null;
      const time = m.start && !m.allDay ? new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(m.start)) : null;
      return { ...base, subtitle: [dayLabel(d), time, m.place, m.needsDriver ? 'trenger sjåfør' : null].filter(Boolean).join(' · '), date: d,
        link: { web: `/#/familiekalender?event=${h.ref}`, app: appLink('event', h.ref), route: 'famcal', ref: h.ref }, actions: [open()] };
    }
    case 'place': return { ...base, subtitle: m.shared ? 'Delt sted' : 'Sted', link: { web: `/#/familie/steder?place=${h.ref}`, app: appLink('place', h.ref), route: 'steder', ref: h.ref },
      actions: [open(), { id: 'checkin', label: 'Sjekk inn her', kind: 'open', url: `/#/familie/sjekk?place=${h.ref}` }] };
    case 'person': return { ...base, subtitle: m.self ? 'Deg' : 'Familie', link: { web: `/#/familie?person=${encodeURIComponent(h.ref)}`, app: appLink('person', h.ref), route: 'familie', ref: h.ref },
      actions: m.self ? [open()] : [open(), { id: 'request', label: 'Be om innsjekk', kind: 'http', method: 'POST', url: '/api/family/checkin/request', body: { to: [h.ref] } }] };
    case 'package': return { ...base, subtitle: [m.status, m.eta ? dayLabel(String(m.eta).slice(0, 10)) : null, m.carrier && m.carrier !== 'other' ? m.carrier : null].filter(Boolean).join(' · '),
      link: { web: `/#/sporing?id=${h.ref}`, app: appLink('package', h.ref), route: 'sporing', ref: h.ref }, actions: [open(), { id: 'copy', label: 'Kopier sporingsnummer', kind: 'copy', value: m.trackingNo }] };
    case 'study': return { ...base, subtitle: [m.kind, m.institution].filter(Boolean).join(' · '), link: { web: `/#/studie?doc=${h.ref}`, app: appLink('study', h.ref), route: 'studie', ref: h.ref }, actions: [open()] };
    case 'chat': return { ...base, subtitle: m.updated ? `Chat · ${dayLabel(ymdOslo(m.updated))}` : 'Chat', link: { web: `/#/chat?c=${encodeURIComponent(h.ref)}`, app: appLink('chat', h.ref), route: 'chat', ref: h.ref }, actions: [open('Fortsett samtalen')] };
    case 'birthday': {
      const M = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
      return { ...base, subtitle: `${m.day}. ${M[(m.month ?? 1) - 1]}${m.year ? ` · født ${m.year}` : ''}`, link: { web: `/#/bursdager?id=${h.ref}`, app: appLink('birthday', h.ref), route: 'bursdager', ref: h.ref }, actions: [open()] };
    }
    case 'receipt': case 'line': case 'transaction': {
      const r = h.fin;
      const isTx = h.type === 'transaction';
      const rcId = r.receipt_id;
      const title = h.type === 'line' ? r.item_text : r.merchant_display || r.item_text || 'Ukjent';
      const sub = h.type === 'line' ? [r.merchant_display, dayLabel(r.date)].filter(Boolean).join(' · ')
        : isTx ? [dayLabel(r.date), r.account].filter(Boolean).join(' · ') : [dayLabel(r.date), r.item_text ? clean(r.item_text, 60) : null].filter(Boolean).join(' · ');
      const web = isTx ? `/finans/#/tx?tx=${r.tx_id}&hl=${hl}` : `/finans/#/kv?rc=${encodeURIComponent(rcId)}&hl=${hl}`;
      const ref = isTx ? String(r.tx_id) : h.type === 'line' ? r.ref : rcId;
      return { ...base, id: `${h.type}:${ref}`, title, subtitle: sub, date: r.date ?? null, amount: r.amount ?? null, amountText: kr(r.amount),
        link: { web, app: appLink(isTx ? 'transaction' : 'receipt', isTx ? r.tx_id : rcId), route: isTx ? 'tx' : 'kv', ref: isTx ? String(r.tx_id) : rcId }, actions: [open(isTx ? 'Åpne transaksjonen' : 'Åpne kvitteringen')] };
    }
    default: return { ...base, link: { web: '/', app: appLink(h.type, h.ref), route: null, ref: h.ref }, actions: [open()] };
  }
}

/* ---------------- Sider og hurtighandlinger ---------------- */

const PAGES51 = [
  ['dash', 'Hjem', 'forside dashbord oversikt', '/#/dash'], ['gjoremal', 'Gjøremål', 'huskeliste oppgaver todo', '/#/gjoremal'], ['kalender', 'Kalender', 'avtaler uke måned', '/#/kalender'],
  ['familiekalender', 'Familiekalender', 'hvem kjører henting bringing', '/#/familiekalender'], ['familie', 'Familie', 'posisjon kart folk helse', '/#/familie'],
  ['sjekk', 'Sjekk inn', 'innsjekk hent meg trygg fremme', '/#/familie/sjekk'], ['media', 'Media', 'film serier plex jellyfin', '/#/media'], ['mediakveld', 'Hva skal vi se i kveld?', 'film kveld anbefaling', '/#/mediakveld'],
  ['vaer', 'Vær', 'yr regn temperatur', '/#/vaer'], ['sporing', 'Sporing', 'pakker post bring', '/#/sporing'], ['chat', 'Chat', 'glimt ai samtale', '/#/chat'],
  ['studie', 'Studie', 'karakterer vitnemål', '/#/studie'], ['bursdager', 'Bursdager', 'fødselsdag gratulerer', '/#/bursdager'], ['matplan', 'Matplan', 'middag oppskrifter', '/#/matplan'],
  ['kart', 'Kart', 'steder', '/#/kart'], ['finans', 'Finans', 'penger budsjett økonomi', '/finans/'], ['kvitteringer', 'Kvitteringer', 'kvittering skann', '/finans/#/kv'],
  ['planlegging', 'Planlegging', 'sparemål faste utgifter skatt abonnement', '/finans/plan51'], ['innstillinger', 'Innstillinger', 'konto oppsett', '/#/innstillinger/konto'],
  ['utseende', 'Utseende og tema', 'tema mørk lys modus farger', '/#/innstillinger/look'], ['sikkerhet', 'Sikkerhet', 'passkey enheter passord', '/#/innstillinger/sikkerhet'],
];
function actionsFor(u, qtext, types) {
  const qf = fold42(qtext).trim();
  const out = [];
  const want = (t) => !types || types.has(t);
  const theme = themeOf(u);
  const dark = theme.mode === 'dark' || (theme.mode !== 'light' && computeTheme(u, theme).effective === 'dark');
  const shop = shopListOf(u);
  const A = [
    ['new-task', qtext ? `Ny oppgave: «${qtext}»` : 'Ny oppgave', 'ny oppgave gjøremål huske legg til', qtext ? { kind: 'http', method: 'POST', url: '/api/tasks', body: { title: qtext } } : { kind: 'open', url: '/#/gjoremal?new=1' }, 'check'],
    ...(shop ? [['shop', qtext ? `Legg «${qtext}» i handlelisten` : 'Handlelisten', 'handleliste handle kjøp legg til', qtext ? { kind: 'http', method: 'POST', url: '/api/tasks', body: { title: qtext, list: shop.id } } : { kind: 'open', url: `/#/gjoremal?list=${encodeURIComponent(shop.id)}` }, 'cart']] : []),
    ['checkin', 'Sjekk inn', 'sjekk inn innsjekk trygg fremme', { kind: 'open', url: '/#/familie/sjekk' }, 'pin'],
    ['pickup', 'Hent meg', 'hent meg henting', { kind: 'open', url: '/#/familie/sjekk?pickup=1' }, 'car'],
    ['scan', 'Skann kvittering', 'skann kvittering bilde', { kind: 'open', url: '/finans/#/skann' }, 'receipt'],
    ['famcal-new', 'Ny hendelse i familiekalenderen', 'ny hendelse familiekalender avtale', { kind: 'open', url: '/#/familiekalender?new=1' }, 'calendar'],
    ['theme', dark ? 'Bytt til lyst tema' : 'Bytt til mørkt tema', 'tema mørk lys modus bytt automatisk', { kind: 'http', method: 'PUT', url: '/api/me/theme51', body: { mode: dark ? 'light' : 'dark' } }, 'gear'],
    // Bare admin: inviter et nytt familiemedlem (web viser skjema + QR i paletten, appene sin egen flyt).
    ...(isAdmin(u) ? [['invite', 'Inviter et familiemedlem', 'inviter ny bruker familiemedlem onboarding qr', { kind: 'open', url: '/#/inviter51' }, 'person']] : []),
  ];
  if (want('action')) {
    A.forEach(([key, title, words, act, icon], i) => {
      const hit = !qf || fold42(`${title} ${words}`).split(/\s+/).some((w) => w.startsWith(qf)) || fold42(title).includes(qf);
      const always = qf.length >= 2 && (key === 'new-task' || key === 'shop');
      if (!hit && !always) return;
      out.push({ id: `action:${key}`, type: 'action', typeLabel: TYPES51.action[0], icon, title, subtitle: act.kind === 'http' ? 'Handling' : 'Snarvei', date: null, amount: null,
        link: { web: act.url && act.kind === 'open' ? act.url : '/', app: appLink('action', key), route: key, ref: key },
        actions: [{ id: key, label: act.kind === 'http' ? 'Utfør' : 'Åpne', ...act }], score: hit ? 0.9 - i * 0.02 : 0.15 - i * 0.01 });
    });
  }
  if (want('page') && qf) {
    for (const [key, title, words, url] of PAGES51) {
      const t = fold42(`${title} ${words}`);
      if (!(fold42(title).startsWith(qf) || t.split(/\s+/).some((w) => w.startsWith(qf)))) continue;
      out.push({ id: `page:${key}`, type: 'page', typeLabel: TYPES51.page[0], icon: 'gear', title, subtitle: 'Gå til', date: null, amount: null,
        link: { web: url, app: appLink('page', key), route: key, ref: key }, actions: [open('Gå til')], score: fold42(title).startsWith(qf) ? 0.95 : 0.7 });
    }
  }
  return out;
}

/** Selve søket. → {q, ms, engine, results, groups} */
export async function search51(u, qtext, { types = null, limit = 20 } = {}) {
  const t0 = Date.now();
  const text = clean(qtext, 200);
  const tset = types ? new Set(types) : null;
  const ws = words51(text);
  const qf = fold42(text).trim();
  const scored = [];
  scored.push(...actionsFor(u, text, tset));
  let engine = 'fts';
  if (ws.length) {
    try { ensureIndex51(u); } catch (e) { console.warn('[søk51] indeks:', e.message); }
    for (const h of localHits(u, ws, tset)) {
      const r = resultOf(h, u, text);
      const base = (WEIGHT[h.type] ?? 0.8) / (1 + h.rank * 0.06);
      r.score = Math.min(1, base * (h.type === 'task' || h.type === 'shopping' ? (r.done ? 0.7 : 1) : 1) + titleBoost(h.title, qf, ws));
      r.match = matchRanges(r.title, ws);
      scored.push(r);
    }
    const fin = finHits(u, text, tset);
    const vec = await vectorHits51(u, text);
    if (vec.length) {
      engine = 'fts+vektor';
      // RRF: rangert liste fra FTS + rangert liste fra vektorer.
      const rrf = new Map();
      fin.forEach((h, i) => rrf.set(`${h.type}:${h.ref}`, { h, s: 1 / (60 + i) }));
      vec.forEach((v, i) => {
        const type = v.kind === 'tx' ? 'transaction' : 'receipt';
        if (tset && !tset.has(type)) return;
        const key = `${type}:${v.ref}`;
        const cur = rrf.get(key);
        if (cur) { cur.s += 1 / (60 + i); return; }
        const row = type === 'transaction' ? q("SELECT *, 0 AS r FROM search_items WHERE user_id=? AND kind='tx' AND tx_id=?").get(u, Number(v.ref)) : q("SELECT *, 0 AS r FROM search_items WHERE user_id=? AND kind='receipt' AND receipt_id=?").get(u, v.ref);
        if (row) rrf.set(key, { h: { fin: row, type, ref: v.ref }, s: 1 / (60 + i) });
      });
      fin.length = 0;
      [...rrf.values()].sort((a, b) => b.s - a.s).forEach((x, i) => fin.push({ ...x.h, rank: i }));
    }
    for (const h of fin) {
      const r = resultOf(h, u, text);
      r.score = Math.min(1, (WEIGHT[h.type] ?? 0.8) / (1 + h.rank * 0.06) + titleBoost(r.title, qf, ws) * 0.6);
      r.match = matchRanges(r.title, ws);
      scored.push(r);
    }
  }
  const seen = new Set();
  const all = scored.filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).sort((a, b) => b.score - a.score);
  const groups = new Map();
  for (const r of all) { const g = groups.get(r.type) ?? { type: r.type, label: TYPES51[r.type]?.[0] ?? r.type, count: 0, best: r.score }; g.count++; groups.set(r.type, g); }
  const n = Math.max(1, Math.min(50, Number(limit) || 20));
  const results = all.slice(0, n).map((r) => ({ ...r, score: Math.round(r.score * 100) / 100, match: r.match ?? [] }));
  return { q: text, ms: Date.now() - t0, engine, results, groups: [...groups.values()].sort((a, b) => b.best - a.best).map(({ best: _b, ...g }) => g) };
}

const recentOf = (u) => (Array.isArray(kv.get(u, 'search51_recent', [])) ? kv.get(u, 'search51_recent', []) : []).filter((x) => typeof x === 'string').slice(0, 10);

/* =====================================================================================================================
   Tema per bruker
   ===================================================================================================================== */

const MODES = ['light', 'dark', 'system', 'auto'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEF_THEME = { mode: 'system', auto: { by: 'sun', lightAt: '07:00', darkAt: '21:00', place: null }, palette: 'papir', updatedAt: 0 };
export function themeOf(u) {
  const s = kv.get(u, 'theme51', null);
  if (s && typeof s === 'object') return { ...DEF_THEME, ...s, auto: { ...DEF_THEME.auto, ...(s.auto ?? {}) } };
  // Fra før: web_theme (prompt 44) light/dark/system.
  const web = kv.get(u, 'layout', {})?.web_theme;
  return { ...DEF_THEME, mode: ['light', 'dark', 'system'].includes(web) ? web : DEF_THEME.mode };
}
/** Klokkeslett «HH:MM» i Oslo på dagen ymd → ms. */
function osloAt(ymd, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = Date.parse(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const local = Date.parse(new Date(guess).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(' ', 'T') + 'Z');
  return guess - (local - guess);
}
function placeFor(u, t) {
  try {
    const p = F.lastRaw(u);
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100, name: 'Din posisjon', source: 'family' };
  } catch { /* */ }
  const m = t.auto?.place;
  if (m && Number.isFinite(m.lat) && Number.isFinite(m.lon)) return { lat: m.lat, lon: m.lon, name: m.name ?? 'Valgt sted', source: 'manual' };
  return { lat: 59.91, lon: 10.75, name: 'Oslo', source: 'default' };
}
/** Beregner effektivt tema nå + neste bytte. */
export function computeTheme(u, t = themeOf(u), now = Date.now()) {
  if (t.mode === 'light' || t.mode === 'dark') return { effective: t.mode, next: null, sun: null };
  if (t.mode === 'system') return { effective: null, next: null, sun: null };
  const today = ymdOslo(now), tomorrow = ymdOslo(now + DAY);
  if (t.auto.by === 'time') {
    const l = osloAt(today, t.auto.lightAt), d = osloAt(today, t.auto.darkAt);
    const light = l < d ? now >= l && now < d : !(now >= d && now < l);
    const cands = [l, d, osloAt(tomorrow, t.auto.lightAt), osloAt(tomorrow, t.auto.darkAt)].filter((x) => x > now).sort((a, b) => a - b);
    const nx = cands[0];
    return { effective: light ? 'light' : 'dark', next: nx ? { at: isoOf(nx), mode: [osloAt(today, t.auto.lightAt), osloAt(tomorrow, t.auto.lightAt)].includes(nx) ? 'light' : 'dark' } : null, sun: null };
  }
  const p = placeFor(u, t);
  const rise = sunTime(today, p.lat, p.lon, -0.833, true), set = sunTime(today, p.lat, p.lon, -0.833, false);
  const riseMs = rise ? +new Date(rise) : null, setMs = set ? +new Date(set) : null;
  if (!riseMs || !setMs) {
    // Midnattssol eller mørketid: deklinasjonen avgjør (samme formel som sun36.js).
    const rad = Math.PI / 180, n = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.UTC(2000, 0, 1, 12)) / DAY) - p.lon / 360;
    const M = (357.5291 + 0.98560028 * n) % 360, C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad);
    const L = (M + C + 180 + 102.9372) % 360, decl = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad));
    const polar = Math.sign(p.lat) === Math.sign(decl) ? 'midnattssol' : 'mørketid';
    return { effective: polar === 'midnattssol' ? 'light' : 'dark', next: null, sun: { sunrise: null, sunset: null, polar, place: p.name } };
  }
  const light = now >= riseMs && now < setMs;
  let next = null;
  if (now < riseMs) next = { at: isoOf(riseMs), mode: 'light' };
  else if (now < setMs) next = { at: isoOf(setMs), mode: 'dark' };
  else { const r2 = sunTime(tomorrow, p.lat, p.lon, -0.833, true); if (r2) next = { at: isoOf(+new Date(r2)), mode: 'light' }; }
  return { effective: light ? 'light' : 'dark', next, sun: { sunrise: isoOf(riseMs), sunset: isoOf(setMs), polar: null, place: p.name } };
}
const themeOut = (u, t = themeOf(u)) => {
  const { place, ...auto } = t.auto ?? {};
  return { mode: t.mode, auto: { ...auto, place: place ?? null }, palette: t.palette, updatedAt: t.updatedAt || 0, ...computeTheme(u, t) };
};
function themeIn(b, cur) {
  const next = { ...cur, auto: { ...cur.auto } };
  if (b.mode !== undefined) { if (!MODES.includes(b.mode)) return 'mode må være light, dark, system eller auto'; next.mode = b.mode; }
  if (b.palette !== undefined) { if (!['papir', 'noytral'].includes(b.palette)) return 'palette må være papir eller noytral'; next.palette = b.palette; }
  if (b.auto !== undefined) {
    const a = b.auto;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return 'auto må være et objekt';
    if (a.by !== undefined) { if (!['sun', 'time'].includes(a.by)) return 'auto.by må være sun eller time'; next.auto.by = a.by; }
    for (const k of ['lightAt', 'darkAt']) if (a[k] !== undefined) { if (!HHMM.test(String(a[k]))) return `auto.${k} må være HH:MM`; next.auto[k] = a[k]; }
    if (a.lightAt !== undefined || a.darkAt !== undefined) if (next.auto.lightAt === next.auto.darkAt) return 'Lys og mørk kan ikke starte samtidig';
    if (a.place !== undefined) {
      if (a.place === null) next.auto.place = null;
      else {
        const lat = Number(a.place?.lat), lon = Number(a.place?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'auto.place må ha lat og lon';
        // Avrundet: temaet trenger ikke mer enn ~1 km.
        next.auto.place = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, name: clean(a.place.name, 60) || 'Valgt sted' };
      }
    }
  }
  return next;
}

/* =====================================================================================================================
   Deling (onboarding og etterpå)
   ===================================================================================================================== */

const HEALTH_SHARE = { steps: true, restingHr: true, hr: false, sleep: true, activeKcal: true, week: true };
export function shareOf51(u) {
  const p = kv.get(u, 'family_prefs', {}) ?? {};
  const s = kv.get(u, 'share51', {}) ?? {};
  return { location: p.sharing === 'on', health: p.sharing === 'on' && Object.entries(p.shareHealth ?? {}).some(([k, v]) => k !== 'week' && v), calendar: s.calendar === true };
}
export function setShare51(u, b) {
  const cur = shareOf51(u);
  const next = { location: typeof b.location === 'boolean' ? b.location : cur.location, health: typeof b.health === 'boolean' ? b.health : cur.health, calendar: typeof b.calendar === 'boolean' ? b.calendar : cur.calendar };
  // Familie har én delingsbryter (family.js): helse deles bare når deling med familien er på. Personvern først – uten posisjon
  // deles heller ikke helse (klientene viser «Helse deles sammen med posisjon»).
  if (!next.location) next.health = false;
  const p = { ...(kv.get(u, 'family_prefs', {}) ?? {}) };
  p.sharing = next.location ? 'on' : (p.sharing === 'paused' ? 'paused' : 'off');
  p.shareHealth = next.health ? (cur.health ? { ...(p.shareHealth ?? {}) } : { ...HEALTH_SHARE }) : Object.fromEntries(Object.keys(HEALTH_SHARE).map((k) => [k, false]));
  kv.set(u, 'family_prefs', p);
  kv.set(u, 'share51', { ...(kv.get(u, 'share51', {}) ?? {}), calendar: next.calendar, location: next.location, health: next.health, at: Date.now() });
  try { broadcast('family', { kind: 'prefs', userId: u }, listUsers().map((x) => x.id)); } catch { /* */ }
  return shareOf51(u);
}

/* =====================================================================================================================
   Onboarding
   ===================================================================================================================== */

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // uten 0/O/1/I
const newCode = () => { let s = ''; for (let i = 0; i < 8; i++) s += CODE_ABC[randomInt(CODE_ABC.length)]; return `${s.slice(0, 4)}-${s.slice(4)}`; };
const normCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeHash = (id, code) => createHash('sha256').update(`onboard51:${config.sessionSecret || 'dev'}:${id}:${normCode(code)}`).digest('hex');
const ID_RE = /^inv51_[A-Za-z0-9_-]{8,40}$/;
const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;
const shareIn = (s, d = { location: false, health: false, calendar: true }) => ({
  location: typeof s?.location === 'boolean' ? s.location : d.location, health: typeof s?.health === 'boolean' ? s.health : d.health, calendar: typeof s?.calendar === 'boolean' ? s.calendar : d.calendar });
const stateOf = (r, now = Date.now()) => (r.revoked_at ? 'revoked' : r.used_at ? 'used' : r.expires <= now ? 'expired' : 'open');
const inviteOut = (r) => {
  let share = {}; try { share = JSON.parse(r.share); } catch { /* */ }
  return { id: r.id, name: r.name, username: r.username ?? null, share: shareIn(share), note: r.note ?? null, createdAt: isoOf(r.created), createdBy: r.created_by, createdByName: nameOf(r.created_by),
    expiresAt: isoOf(r.expires), state: stateOf(r), usedAt: isoOf(r.used_at), userId: r.user_id ?? null };
};
const slugUser = (name) => fold42(name).replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32) || 'bruker';
function suggestUsername(r) {
  const base = r.username && USERNAME_RE.test(r.username) ? r.username : slugUser(r.name);
  let u = base, i = 2;
  while (q('SELECT 1 FROM users WHERE username=?').get(u)) u = `${base.slice(0, 29)}${i++}`;
  return u;
}
/** «papir://join?i=…&c=…», «https://…/join/<id>.<code>» eller «<id>.<code>» → {id, code} */
export function parseInviteLink51(s) {
  const t = String(s ?? '').trim();
  try {
    if (/^papir:\/\/join\?/i.test(t)) { const u = new URL(t.replace(/^papir:\/\//i, 'https://x/')); return { id: u.searchParams.get('i'), code: u.searchParams.get('c') }; }
    if (/^https?:\/\//i.test(t)) { const m = new URL(t).pathname.match(/\/join\/([^/.]+)\.([A-Za-z0-9-]+)$/); if (m) return { id: m[1], code: m[2] }; }
  } catch { /* */ }
  const m = t.match(/^(inv51_[A-Za-z0-9_-]{8,40})\.([A-Za-z0-9-]{4,20})$/);
  return m ? { id: m[1], code: m[2] } : { id: null, code: null };
}
function ipKey(c) { return trustIp(c) || 'ukjent'; }
/** Finner en åpen invitasjon med riktig kode. → {row} | {status, error, code} */
function checkInvite(c, b) {
  const ip = ipKey(c);
  const wait = blocked51('qr', 'ip', ip);
  if (wait) return { status: 429, error: `For mange forsøk. Prøv igjen om ${Math.max(1, Math.ceil(wait / 60))} min.`, code: 'rate', retryAfter: wait };
  const parsed = b.link ? parseInviteLink51(b.link) : { id: b.id, code: b.code };
  const id = String(parsed.id ?? ''), code = String(parsed.code ?? '');
  const row = ID_RE.test(id) ? q('SELECT * FROM onboard51_invites WHERE id=?').get(id) : null;
  const ok = row && (() => { const a = Buffer.from(row.code_hash, 'hex'), x = Buffer.from(codeHash(id, code), 'hex'); return a.length === x.length && timingSafeEqual(a, x); })();
  if (!ok) { fail51('qr', 'ip', ip); return { status: 404, error: 'Invitasjonen finnes ikke, eller koden er feil.', code: 'invalid' }; }
  const st = stateOf(row);
  if (st === 'used') return { status: 410, error: 'Invitasjonen er allerede brukt.', code: 'used' };
  if (st === 'revoked') return { status: 410, error: 'Invitasjonen er trukket tilbake.', code: 'revoked' };
  if (st === 'expired') return { status: 410, error: 'Invitasjonen er utløpt. Be om en ny.', code: 'expired' };
  clear51('qr', 'ip', ip);
  return { row };
}

/* =====================================================================================================================
   Offline-kø: konfliktvarsel (siste skriving vinner)
   ===================================================================================================================== */

const VERSIONED = [
  [/^\/api\/tasks\/(\d+)$/, ['PATCH', 'DELETE'], (id) => q('SELECT updated_at FROM hl_tasks WHERE id=?').pluck().get(Number(id)) ?? null],
  [/^\/api\/famcal51\/events\/(\d+)$/, ['PATCH', 'DELETE'], (id) => (hasTable('famcal51_event') ? q('SELECT updated FROM famcal51_event WHERE id=?').pluck().get(Number(id)) ?? null : null)],
];
const tsOf = (v) => { const s = String(v ?? '').trim(); if (/^\d{10,14}$/.test(s)) return Number(s.length <= 10 ? Number(s) * 1000 : s); const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
async function offlineMw(c, next) {
  const base = c.req.header('x-offline51-base');
  const queued = c.req.header('x-offline51-queued');
  if (!base && !queued) return next();
  const path = c.req.path;
  const hit = VERSIONED.find(([re, methods]) => re.test(path) && methods.includes(c.req.method));
  let before = null;
  if (hit) { try { before = hit[2](path.match(hit[0])[1]); } catch { before = null; } }
  await next();
  if (!hit || !c.res) return;
  // Uten Base (klienten vet ikke hvilken versjon den så): endret etter at skrivingen ble gjort offline = konflikt.
  const b = tsOf(base) ?? tsOf(queued);
  if (c.res.status < 400) {
    let after = null; try { after = hit[2](path.match(hit[0])[1]); } catch { /* */ }
    if (after != null) c.res.headers.set('X-Offline51-Updated', String(after));
    if (b != null && before != null && before > b + 1000) {
      c.res.headers.set('X-Offline51-Conflict', '1');
      c.res.headers.set('X-Offline51-Server-Updated', String(before));
    }
  }
  c.res.headers.set('Access-Control-Expose-Headers', 'X-Offline51-Conflict, X-Offline51-Server-Updated, X-Offline51-Updated');
}

/* =====================================================================================================================
   Ruter
   ===================================================================================================================== */

export const webx51Api = new Hono();
const admin = (c) => (isAdmin(c.get('user')) ? null : bad(c, 'Bare for administrator', 403));

webx51Api.get('/search51', authOrToken, async (c) => {
  const u = c.get('user');
  const types = (c.req.query('types') ?? '').split(',').map((x) => x.trim()).filter((x) => TYPES51[x]);
  const r = await search51(u, c.req.query('q') ?? '', { types: types.length ? types : null, limit: c.req.query('limit') });
  if (!r.q) r.recent = recentOf(u);
  return c.json(r, 200, NO_STORE);
});
webx51Api.get('/search51/types', authOrToken, (c) => c.json({ types: Object.entries(TYPES51).map(([type, [label, icon]]) => ({ type, label, icon })) }, 200, NO_STORE));
webx51Api.post('/search51/recent', authOrToken, async (c) => {
  const u = c.get('user'), t = clean((await body(c)).q, 100);
  if (t.length < 2) return bad(c, 'q mangler');
  kv.set(u, 'search51_recent', [t, ...recentOf(u).filter((x) => fold42(x) !== fold42(t))].slice(0, 10));
  return c.json({ ok: true }, 200, NO_STORE);
});
webx51Api.delete('/search51/recent', authOrToken, (c) => { kv.set(c.get('user'), 'search51_recent', []); return c.json({ ok: true }, 200, NO_STORE); });

/* ---------------- Tema og deling ---------------- */

webx51Api.get('/me/theme51', authOrToken, (c) => c.json(themeOut(c.get('user')), 200, NO_STORE));
webx51Api.put('/me/theme51', authOrToken, async (c) => {
  const u = c.get('user'), b = await body(c), cur = themeOf(u);
  const at = b.updatedAt != null ? Number(b.updatedAt) : Date.now();
  if (!Number.isFinite(at)) return bad(c, 'updatedAt må være et tall (ms)');
  if (cur.updatedAt && at < cur.updatedAt) return c.json({ error: 'En nyere endring finnes allerede', theme: themeOut(u, cur) }, 409, NO_STORE);
  const next = themeIn(b, cur);
  if (typeof next === 'string') return bad(c, next);
  next.updatedAt = Math.min(at, Date.now() + 5 * MIN);
  kv.set(u, 'theme51', next);
  // Bakoverkompatibelt: eldre web-kode leser web_theme fra /api/me/layout.
  if (['light', 'dark', 'system'].includes(next.mode)) kv.set(u, 'layout', { ...(kv.get(u, 'layout', {}) ?? {}), web_theme: next.mode });
  const out = themeOut(u, next);
  try { broadcast('theme51', { theme: out }, [u]); } catch { /* */ }
  return c.json(out, 200, NO_STORE);
});
webx51Api.get('/me/share51', authOrToken, (c) => c.json(shareOf51(c.get('user')), 200, NO_STORE));
webx51Api.put('/me/share51', authOrToken, async (c) => c.json(setShare51(c.get('user'), await body(c)), 200, NO_STORE));

/* ---------------- Offline ---------------- */

webx51Api.get('/offline51/versions', authOrToken, (c) => {
  const u = c.get('user');
  const ids = (k) => (c.req.query(k) ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200);
  const tasks = {};
  for (const id of ids('tasks')) {
    const t = q('SELECT id, list, created_by, updated_at FROM hl_tasks WHERE id=?').get(id);
    if (!t) { tasks[id] = null; continue; }
    const visible = t.list ? !!q('SELECT 1 FROM hl_task_lists WHERE id=? AND (owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?))').get(t.list, u, u) || (t.created_by === u && !q('SELECT 1 FROM hl_task_lists WHERE id=?').get(t.list)) : t.created_by === u;
    if (visible) tasks[id] = t.updated_at ?? null;
  }
  const events = {};
  if (hasTable('famcal51_event')) for (const id of ids('events')) events[id] = q('SELECT updated FROM famcal51_event WHERE id=?').pluck().get(id) ?? null;
  return c.json({ tasks, events }, 200, NO_STORE);
});

/* ---------------- Onboarding ---------------- */

webx51Api.post('/onboard51/invites', authOrToken, async (c) => {
  const no = admin(c); if (no) return no;
  const b = await body(c);
  const name = clean(b.name, 60);
  if (!name) return bad(c, 'Navn mangler');
  let username = b.username ? String(b.username).trim().toLowerCase().replace(/^@/, '') : null;
  if (username && !USERNAME_RE.test(username)) return bad(c, 'Brukernavn: 2–32 tegn, bokstaver, tall, punktum, bindestrek eller understrek');
  if (username && q('SELECT 1 FROM users WHERE username=?').get(username)) return bad(c, 'Brukernavnet finnes allerede', 409);
  const ttl = b.ttlHours == null ? 48 : Number(b.ttlHours);
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 168) return bad(c, 'ttlHours må være 1–168');
  const id = `inv51_${randomBytes(12).toString('base64url')}`, code = newCode(), now = Date.now();
  q('INSERT INTO onboard51_invites(id, code_hash, name, username, share, note, created, created_by, expires) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id, codeHash(id, code), name, username, JSON.stringify(shareIn(b.share)), clean(b.note, 200) || null, now, c.get('user'), now + Math.round(ttl * HOUR));
  const srv = (publicUrl46() || originOf46(c) || '').replace(/\/$/, '');
  const url = `${srv}/join/${id}.${code}`;
  const qr = `papir://join?i=${encodeURIComponent(id)}&c=${encodeURIComponent(code)}${srv ? `&srv=${encodeURIComponent(srv)}` : ''}`;
  return c.json({ invite: inviteOut(q('SELECT * FROM onboard51_invites WHERE id=?').get(id)), code, url, qr, qrSvg: qrSvg(qr, { px: 220, dark: '#17150f', light: '#ffffff' }) }, 201, NO_STORE);
});
webx51Api.get('/onboard51/invites', authOrToken, (c) => {
  const no = admin(c); if (no) return no;
  return c.json({ invites: q('SELECT * FROM onboard51_invites WHERE created > ? ORDER BY created DESC LIMIT 100').all(Date.now() - 90 * DAY).map(inviteOut) }, 200, NO_STORE);
});
webx51Api.delete('/onboard51/invites/:id', authOrToken, (c) => {
  const no = admin(c); if (no) return no;
  const r = q('SELECT * FROM onboard51_invites WHERE id=?').get(c.req.param('id'));
  if (!r) return bad(c, 'Fant ikke invitasjonen', 404);
  if (!r.used_at && !r.revoked_at) q('UPDATE onboard51_invites SET revoked_at=? WHERE id=?').run(Date.now(), r.id);
  return c.json({ ok: true, invite: inviteOut(q('SELECT * FROM onboard51_invites WHERE id=?').get(r.id)) }, 200, NO_STORE);
});
webx51Api.post('/onboard51/preview', async (c) => {
  const r = checkInvite(c, await body(c));
  if (!r.row) return c.json({ error: r.error, code: r.code, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) }, r.status, NO_STORE);
  const inv = inviteOut(r.row);
  return c.json({ ok: true, id: inv.id, name: inv.name, usernameSuggestion: suggestUsername(r.row), serverName: serverName(), invitedBy: inv.createdByName, share: inv.share, expiresAt: inv.expiresAt }, 200, NO_STORE);
});
webx51Api.post('/onboard51/accept', async (c) => {
  const b = await body(c);
  const r = checkInvite(c, b);
  if (!r.row) return c.json({ error: r.error, code: r.code, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) }, r.status, NO_STORE);
  const inv = r.row;
  const username = String(b.username ?? inv.username ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!USERNAME_RE.test(username)) return bad(c, 'Brukernavn: 2–32 tegn, bokstaver, tall, punktum, bindestrek eller understrek', 400, { code: 'username' });
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) return bad(c, 'Passordet må ha minst 8 tegn', 400, { code: 'password' });
  if (q('SELECT 1 FROM users WHERE username=?').get(username)) return bad(c, 'Brukernavnet finnes allerede', 409, { code: 'username_taken' });
  let user;
  // Engangs: merk invitasjonen brukt i samme transaksjon som kontoen lages (to samtidige forsøk → bare ett lykkes).
  try {
    user = db.transaction(() => {
      if (q('UPDATE onboard51_invites SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires>?').run(Date.now(), inv.id, Date.now()).changes !== 1) throw Object.assign(new Error('Invitasjonen er allerede brukt.'), { status: 410 });
      // Scope-regel: alltid vanlig bruker, aldri admin via invitasjon.
      const u = createUser({ username, password: b.password, role: 'bruker', name: clean(b.name, 60) || inv.name });
      q('UPDATE onboard51_invites SET user_id=? WHERE id=?').run(u.id, inv.id);
      return u;
    })();
  } catch (e) { return bad(c, e.message || 'Kunne ikke lage kontoen', e.status ?? 400); }
  let invShare = {}; try { invShare = JSON.parse(inv.share); } catch { /* */ }
  const share = setShare51(user.id, shareIn(b.share, shareIn(invShare)));
  kv.set(user.id, 'onboard51', { invite: inv.id, at: Date.now(), by: inv.created_by });
  notifyUser(inv.created_by, { title: `${user.name ?? user.username} er med nå`, body: `Invitasjonen ble brukt. Deler: ${[share.location && 'posisjon', share.health && 'helse', share.calendar && 'kalender'].filter(Boolean).join(', ') || 'ingenting ennå'}.`, category: 'system', url: '/#/familie', tag: `onboard51-${inv.id}` }).catch(() => {});
  const app = b.client === 'app';
  const g = gate51(c, user.id, { method: 'password', kind: app ? 'token' : 'web', tokenName: clean(b.device, 60) || null });
  if (g.pending) return c.json({ error: 'Ny enhet må godkjennes', code: 'DEVICE_APPROVAL_REQUIRED', pendingApproval: true }, 403, NO_STORE); // skal ikke skje (første enhet)
  if (app) {
    const t = issueToken(user.id, { name: `${clean(b.device, 40) || (b.platform === 'android' ? 'Android' : b.platform === 'ios' ? 'iPhone' : 'App')} (invitasjon)`, scopes: [...FH_SCOPES], expires: null });
    try { afterLogin51(c, user.id, 'token', { detail: { onboard51: inv.id } }); } catch { /* */ }
    return c.json({ ok: true, user: { id: user.id, username: user.username, role: user.role, name: user.name }, token: t.token, scopes: t.scopes ?? [...FH_SCOPES], share }, 201, NO_STORE);
  }
  createSession(c, user.id);
  try { rememberDevice(c, user.id); } catch { /* */ }
  if (g.setCookie) c.header('Set-Cookie', g.setCookie, { append: true });
  try { afterLogin51(c, user.id, 'password', { detail: { onboard51: inv.id } }); } catch { /* */ }
  return c.json({ ok: true, user: { id: user.id, username: user.username, role: user.role, name: user.name }, share, next: '/#/dash' }, 201, NO_STORE);
});

/** Monteres i index.js (etter secureHeaders, før modulrutene). */
export function mountWebx51(app) {
  app.use('/api/tasks/*', offlineMw);
  app.use('/api/famcal51/*', offlineMw);
  app.route('/api', webx51Api);
  app.get('/join/:token', async (c) => c.html(await readFile(join(resolve('public'), 'join51.html'), 'utf8'), 200, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }));
}
