// Prompt 63 (prompt 49 del 5, D5SRV): lagring for «minnet holder seg ryddig». Additive migreringer:
//   glimt_memory_pending   – forslag fra nattjobben (pending → approved | rejected). Ingenting kommer inn i glimt_memory uten ja.
//   glimt_memory_conflicts – motstrid med to sider (a/b) og brukerens valg (keep_a | keep_b | both).
//   glimt_memory.kept_at   – brukeren trykket «behold» på et faktum som ikke er brukt på lenge (telleren starter på nytt).
// «Sist brukt» er den eksisterende kolonnen glimt_memory.used_at (prompt 33) – nå satt der minnet faktisk brukes (kontekst/planlegger).
// Alt er per bruker; spørringene har alltid user_id.
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { ensureMemory47, TYPE_SYNONYMS47 } from '../glimt45/memory47.js';
import { typeOfWord, DIN, MEMORY_TYPES } from '../glimt-memory.js';
import { niceCase, normName } from '../../public/js/quick-time.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS glimt_memory_pending (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', subject TEXT NOT NULL, predicate TEXT NOT NULL DEFAULT 'er', object TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'fact', type TEXT,
  aliases TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'conversation', evidence TEXT NOT NULL DEFAULT '[]', reason TEXT, conflict_id TEXT, memory_id INTEGER,
  edited INTEGER NOT NULL DEFAULT 0, decided_at INTEGER, key TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS glimt_memory_pending_user ON glimt_memory_pending(user_id, status);
CREATE INDEX IF NOT EXISTS glimt_memory_pending_key ON glimt_memory_pending(user_id, key);
CREATE TABLE IF NOT EXISTS glimt_memory_conflicts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  kind TEXT NOT NULL, key TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, question TEXT NOT NULL, resolution TEXT, resolved_at INTEGER);
CREATE INDEX IF NOT EXISTS glimt_memory_conflicts_user ON glimt_memory_conflicts(user_id, status);
CREATE INDEX IF NOT EXISTS glimt_memory_conflicts_key ON glimt_memory_conflicts(user_id, key);`);
let migrated = false;
export function ensureMem63() {
  if (migrated) return;
  ensureMemory47();
  try {
    const cols = q('PRAGMA table_info(glimt_memory)').all().map((c) => c.name);
    if (!cols.length) return;
    if (!cols.includes('kept_at')) db.exec('ALTER TABLE glimt_memory ADD COLUMN kept_at INTEGER');
    migrated = true;
  } catch (e) { console.warn('[mem63] migrering:', e.message); }
}
ensureMem63();
// Rydding: avgjorte forslag og motstrid eldre enn ett år (avviste forslag huskes så lenge, så de ikke foreslås igjen).
try { q("DELETE FROM glimt_memory_pending WHERE status != 'pending' AND COALESCE(decided_at, updated_at) < ?").run(Date.now() - 365 * 86400_000); } catch { /* */ }
try { q("DELETE FROM glimt_memory_conflicts WHERE status != 'open' AND COALESCE(resolved_at, created_at) < ?").run(Date.now() - 365 * 86400_000); } catch { /* */ }

export const PID63 = /^p[0-9a-f]{14}$/;
export const CID63 = /^c[0-9a-f]{14}$/;
export const MAX_PENDING63 = 50; // åpne forslag per bruker
export const newId63 = (p) => `${p}${randomBytes(7).toString('hex')}`;
const J = (s, d) => { if (s == null) return d; try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
export const SOURCE_LABEL63 = { conversation: 'Glimt-samtale', correction: 'Rettelse', calendar: 'Kalender', memory: 'Glimt husker', entity: 'Entitetsregisteret' };

/* ---------------- Ord og nøkler ---------------- */

const POSS = /\s+(?:min|mi|mitt|mine|vår|vårt|våre)$/i;
const fold = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
/** «søsteren min» → «søster»; «frisøren» → «frisør»; typer slås opp først (frisørtime → frisør). */
export function roleOf63(object, type = null) {
  if (type) return type;
  const o = fold(object).replace(/^(?:min|mi|mitt|mine)\s+/, '').replace(POSS, '');
  const t = typeOfWord(o.split(' ')[0]);
  if (t && t !== 'annet') return t;
  return o.replace(/(?:ene|en|et|a)$/, '').trim() || o;
}
/** Bare «rolle»-fakta (ett substantiv, ev. med eiendomsord) kan motsi hverandre («søsteren min» vs «kollegaen min»). */
export const isRole63 = (object, type = null) => !!type || /^(?:(?:min|mi|mitt|mine)\s+)?[\p{L}-]+(?:\s+(?:min|mi|mitt|mine))?$/u.test(fold(object));
export const keyOf63 = (subject, object, type = null) => `${normName(subject)}|${roleOf63(object, type)}`;
/** «søsteren min» → «søsteren din» (til brukeren). */
export const youOf63 = (s) => String(s ?? '').replace(/(?<![\p{L}])min(?![\p{L}])/gu, 'din').replace(/(?<![\p{L}])mi(?![\p{L}])/gu, 'di').replace(/(?<![\p{L}])mitt(?![\p{L}])/gu, 'ditt').replace(/(?<![\p{L}])mine(?![\p{L}])/gu, 'dine');
/** Setningen til visning. */
export function sentenceOf63({ subject, object, kind, type }) {
  const s = niceCase(subject);
  if (kind === 'alias' && type) return `${s} er ${DIN[type] ?? type}`;
  return `${s} er ${youOf63(object)}`;
}
/** Hva lagres? «frisøren min» → alias type frisør; ellers fakta. */
export function classify63(object) {
  const o = fold(object).replace(/^(?:min|mi|mitt|mine|en|ei|et)\s+/, '').replace(POSS, '');
  const t = typeOfWord(o.split(' ')[0]);
  return t && MEMORY_TYPES.includes(t) && t !== 'annet' ? { kind: 'alias', type: t } : { kind: 'fact', type: null };
}

/* ---------------- Minnet (glimt_memory) ---------------- */

/** Brukerens minnerader med «sist brukt». → [{id, kind, match, subject, object, type, title, note, aliases, ownAliases, created, usedAt, keptAt, etype}] */
export function memRows63(user) {
  ensureMem63();
  let rows = [];
  try { rows = q('SELECT * FROM glimt_memory WHERE user_id=? ORDER BY id').all(user); } catch { return []; }
  return rows.map((r) => {
    const own = J(r.aliases, null);
    const aliases = Array.isArray(own) && own.length ? own.map(String) : r.kind === 'alias' ? TYPE_SYNONYMS47[r.type] ?? [r.type].filter(Boolean) : [];
    const synonyms = r.kind === 'alias' ? TYPE_SYNONYMS47[r.type] ?? [] : [];
    return { id: r.id, kind: r.kind, match: r.match, subject: niceCase(r.match), object: r.kind === 'alias' ? (r.type ?? 'annet') : (r.note ?? r.title ?? ''), type: r.kind === 'alias' ? r.type ?? null : null,
      title: r.title ?? null, note: r.note ?? null, aliases: [...new Set(aliases)], ownAliases: aliases.filter((a) => !synonyms.some((x) => normName(x) === normName(a))),
      created: r.created ?? null, usedAt: r.used_at ?? null, keptAt: r.kept_at ?? null, etype: r.etype ?? null };
  });
}
/** «Sist brukt»: minnefaktaene som faktisk ble brukt i kontekst/planlegger (id-er fra recallFacts47 eller entitetsregisteret «m12»). */
export function touchFacts63(user, facts, now = Date.now()) {
  const ids = [...new Set((facts ?? []).map((f) => (typeof f?.id === 'number' ? f.id : /^m(\d{1,12})$/.exec(String(f?.id ?? ''))?.[1])).filter((x) => x != null).map(Number))].slice(0, 20);
  if (!ids.length) return 0;
  try { return q(`UPDATE glimt_memory SET used_at=? WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`).run(now, user, ...ids).changes; } catch { return 0; }
}
/** Sist aktivitet for et faktum (brukt, laget eller beholdt). */
export const lastActive63 = (m) => Math.max(m.usedAt ?? 0, m.created ?? 0, m.keptAt ?? 0);
export function staleOf63(user, days, now = Date.now()) {
  const lim = days * 86400_000;
  return memRows63(user).filter((m) => now - lastActive63(m) > lim).sort((a, b) => lastActive63(a) - lastActive63(b))
    .map((m) => ({ id: m.id, kind: m.kind, subject: m.subject, object: m.object, title: m.title, lastUsedAt: iso(m.usedAt), createdAt: iso(m.created), keptAt: iso(m.keptAt),
      daysUnused: Math.floor((now - lastActive63(m)) / 86400_000), staleSince: iso(lastActive63(m) + lim) }));
}
export const keepFact63 = (user, id, now = Date.now()) => { ensureMem63(); return q('UPDATE glimt_memory SET kept_at=? WHERE id=? AND user_id=?').run(now, Number(id), user).changes > 0; };

/* ---------------- Forslag ---------------- */

export const pendingRow63 = (user, id) => q('SELECT * FROM glimt_memory_pending WHERE id=? AND user_id=?').get(String(id ?? ''), user) ?? null;
export const pendingRows63 = (user, status = 'pending') => (status === 'all' ? q('SELECT * FROM glimt_memory_pending WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 200').all(user)
  : q('SELECT * FROM glimt_memory_pending WHERE user_id=? AND status=? ORDER BY created_at DESC, rowid DESC LIMIT 200').all(user, status));
export const pendingByKey63 = (user, key) => q('SELECT * FROM glimt_memory_pending WHERE user_id=? AND key=? ORDER BY created_at DESC LIMIT 1').get(user, key) ?? null;
export const pendingCounts63 = (user) => {
  const out = { pending: 0, approved: 0, rejected: 0 };
  for (const r of q('SELECT status, COUNT(*) n FROM glimt_memory_pending WHERE user_id=? GROUP BY status').all(user)) out[r.status] = r.n;
  return out;
};
export function publicPending63(r) {
  const src = r.source;
  return { id: r.id, status: r.status, subject: niceCase(r.subject), predicate: r.predicate, object: r.object, kind: r.kind, type: r.type ?? null, aliases: J(r.aliases, []),
    sentence: sentenceOf63({ subject: r.subject, object: r.object, kind: r.kind, type: r.type }), source: src, sourceLabel: SOURCE_LABEL63[src] ?? src,
    evidence: J(r.evidence, []), reason: r.reason ?? null, conflictId: r.conflict_id ?? null, memoryId: r.memory_id ?? null, edited: !!r.edited,
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), decidedAt: iso(r.decided_at) };
}
/** Nytt forslag. p = {subject, object, aliases, source, evidence, reason}. → raden */
export function insertPending63(user, p, now = Date.now()) {
  const id = newId63('p');
  const c = classify63(p.object);
  q(`INSERT INTO glimt_memory_pending(id, user_id, created_at, updated_at, status, subject, predicate, object, kind, type, aliases, source, evidence, reason, key)
    VALUES(?,?,?,?, 'pending', ?, 'er', ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user, now, now, String(p.subject).slice(0, 80), String(p.object).slice(0, 300), c.kind, c.type,
    JSON.stringify((p.aliases ?? []).slice(0, 8)), p.source ?? 'conversation', JSON.stringify((p.evidence ?? []).slice(0, 3)), p.reason ?? null, keyOf63(p.subject, p.object, c.type));
  return pendingRow63(user, id);
}
export function updatePending63(user, id, set, now = Date.now()) {
  const keys = Object.keys(set);
  if (keys.length) q(`UPDATE glimt_memory_pending SET ${keys.map((k) => `${k}=@${k}`).join(', ')}, updated_at=@_now WHERE id=@_id AND user_id=@_user`).run({ ...set, _now: now, _id: id, _user: user });
  return pendingRow63(user, id);
}

/* ---------------- Motstrid ---------------- */

export const conflictRow63 = (user, id) => q('SELECT * FROM glimt_memory_conflicts WHERE id=? AND user_id=?').get(String(id ?? ''), user) ?? null;
export const conflictRows63 = (user, status = 'open') => (status === 'all' ? q('SELECT * FROM glimt_memory_conflicts WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 200').all(user)
  : q('SELECT * FROM glimt_memory_conflicts WHERE user_id=? AND status=? ORDER BY created_at DESC, rowid DESC LIMIT 200').all(user, status));
export const conflictByKey63 = (user, key) => q('SELECT * FROM glimt_memory_conflicts WHERE user_id=? AND key=? ORDER BY created_at DESC LIMIT 1').get(user, key) ?? null;
export const conflictCounts63 = (user) => {
  const out = { open: 0, resolved: 0 };
  for (const r of q('SELECT status, COUNT(*) n FROM glimt_memory_conflicts WHERE user_id=? GROUP BY status').all(user)) out[r.status] = r.n;
  return out;
};
export function publicConflict63(r) {
  const a = J(r.a, {}), b = J(r.b, {});
  return { id: r.id, status: r.status, kind: r.kind, question: r.question, a, b,
    choices: [{ id: 'keep_a', label: `Behold «${a.label}»` }, { id: 'keep_b', label: `Behold «${b.label}»` }, { id: 'both', label: 'Begge stemmer' }],
    resolution: r.resolution ?? null, resolvedAt: iso(r.resolved_at), createdAt: iso(r.created_at) };
}
export function insertConflict63(user, c, now = Date.now()) {
  const id = newId63('c');
  q('INSERT INTO glimt_memory_conflicts(id, user_id, created_at, status, kind, key, a, b, question) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id, user, now, 'open', c.kind, c.key, JSON.stringify(c.a), JSON.stringify(c.b), c.question);
  return conflictRow63(user, id);
}
export const finishConflict63 = (user, id, resolution, now = Date.now()) => q("UPDATE glimt_memory_conflicts SET status='resolved', resolution=?, resolved_at=? WHERE id=? AND user_id=? AND status='open'").run(resolution, now, id, user).changes;
export { iso as iso63, J as J63 };
