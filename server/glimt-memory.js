// Prompt 33 (GLIMT-MEMORY): «Glimt husker» – det brukeren har lært Glimt, per bruker. Montert under /api/glimt/memory.
// Sesjon eller app-token (authOrToken; skriving krever finance:write). Alt er per bruker: ingen kan se eller endre andres.
//
// Tabell glimt_memory(id, user_id, kind:'alias'|'fact', match, type, title, note, created, used_at)
//   alias = avsender/bedrift → type/tittel: match «påhåret» → type frisør, tittel «Frisør · Påhåret Studio Hoff».
//   fact  = fritekst brukeren har bedt Glimt huske (vises i listen, sendes bare til lokal Ollama).
//
// GET    /api/glimt/memory              → {items:[{id, kind, match, type, title, note, created, used_at}], types:[…]}
// POST   /api/glimt/memory {kind?, match, type?, title?, note?}
//                                        → 201 {ok, item, matches} (finnes match fra før: oppdateres, 200). matches = antall
//                                          egne avtaler som treffer og har en annen tittel («Endre tittel på N avtaler?»)
// DELETE /api/glimt/memory/:id          → {ok}
// POST   /api/glimt/memory/:id/apply {dryRun?}
//                                        → {ok, count, events:[{id, title, from}]} – gir egne hendelser i Privat (lokale eller
//                                          Google) som treffer match aliasets tittel. dryRun: bare telling.
//
// Kontekst for «det var frisør»: siste raske time (calendar-quick) eller sist åpnede hendelse (GET /api/kalender/events/:id),
// eller {context:{eventId}} i POST /api/assist. Lagres i kv(user, 'glimt_ctx').
//
// Personvern: aliasene sendes bare til lokal Ollama (rask time og Glimt-reserven), aldri til sky.
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { runAsUser } from './settings.js';
import { senderOf, niceCase, normName, aliasTitle, kindOfName, isNoiseLine, osloTodayISO, TYPE_LABEL, TYPES } from '../public/js/quick-time.js';

db.exec(`CREATE TABLE IF NOT EXISTS glimt_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'alias' CHECK (kind IN ('alias','fact')),
  match TEXT NOT NULL,
  type TEXT,
  title TEXT,
  note TEXT,
  created INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS glimt_memory_user ON glimt_memory(user_id, kind);`);
const q = (sql) => db.prepare(sql);
const MAX_ITEMS = 200;
export const MEMORY_TYPES = ['frisør', 'lege', 'tannlege', 'fysio', 'optiker', 'psykolog', 'annet'];
const ORIGIN_QUICK = 'AI · rask time';

const out = (r) => ({ id: r.id, kind: r.kind, match: r.match, type: r.type ?? null, title: r.title ?? null, note: r.note ?? null, created: r.created, used_at: r.used_at ?? null });
/** Brukerens minne (nyeste først). */
export const listMemory = (user) => q('SELECT * FROM glimt_memory WHERE user_id=? ORDER BY created DESC, id DESC').all(user).map(out);
/** Bare aliasene, i formen parseQuick tar imot. */
export const aliasesOf = (user) => listMemory(user).filter((m) => m.kind === 'alias');
export const getMemory = (user, id) => { const r = q('SELECT * FROM glimt_memory WHERE id=? AND user_id=?').get(Number(id), user); return r ? out(r) : null; };
export const touchMemory = (user, id) => { try { q('UPDATE glimt_memory SET used_at=? WHERE id=? AND user_id=?').run(Date.now(), Number(id), user); } catch { /* best effort */ } };

const typeOk = (t) => (MEMORY_TYPES.includes(t) ? t : null);
/** Validerer og lagrer (eller oppdaterer samme match). → {item, created} eller {error}. */
export function addMemory(user, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Forventet {match, type, title?}' };
  const kind = b.kind === 'fact' ? 'fact' : 'alias';
  const match = String(b.match ?? '').replace(/\s+/g, ' ').trim();
  if (match.length < 2 || match.length > 80) return { error: 'Navnet må være 2–80 tegn' };
  const type = b.type == null || b.type === '' ? null : typeOk(b.type);
  if (b.type != null && b.type !== '' && !type) return { error: `Ukjent type (${MEMORY_TYPES.join(', ')})` };
  if (kind === 'alias' && !type) return { error: 'Velg en type' };
  // Uten egen tittel: «Frisør · Studio Nova» med navnet slik brukeren skrev det (match lagres med små bokstaver).
  const title = (b.title == null ? null : String(b.title).replace(/\s+/g, ' ').trim().slice(0, 120) || null) ?? (kind === 'alias' ? aliasTitle({ type, match }, niceCase(match)) : null);
  const note = b.note == null ? null : String(b.note).trim().slice(0, 500) || null;
  const m = normName(match);
  const old = q('SELECT * FROM glimt_memory WHERE user_id=? AND kind=?').all(user, kind).find((r) => normName(r.match) === m);
  if (old) {
    q('UPDATE glimt_memory SET match=?, type=?, title=?, note=coalesce(?, note) WHERE id=?').run(m, type, title, note, old.id);
    return { item: getMemory(user, old.id), created: false };
  }
  if (q('SELECT count(*) FROM glimt_memory WHERE user_id=?').pluck().get(user) >= MAX_ITEMS) return { error: `Glimt husker maks ${MAX_ITEMS} ting. Slett noe først.` };
  const r = q('INSERT INTO glimt_memory(user_id, kind, match, type, title, note, created) VALUES(?,?,?,?,?,?,?)').run(user, kind, m, type, title, note, Date.now());
  return { item: getMemory(user, r.lastInsertRowid), created: true };
}
export const deleteMemory = (user, id) => q('DELETE FROM glimt_memory WHERE id=? AND user_id=?').run(Number(id), user).changes > 0;

/** Kort liste til lokal Ollama («påhåret = frisør (Frisør · Påhåret Studio Hoff)»). Tom streng uten alias. Aldri til sky. */
export function aliasPrompt(list) {
  const a = (list ?? []).filter((m) => m.kind === 'alias').slice(0, 20);
  if (!a.length) return '';
  return 'Brukeren har lært Glimt disse navnene:\n' + a.map((m) => `- «${m.match}» = ${m.type}${m.title ? ` (tittel «${m.title}»)` : ''}`).join('\n');
}

/* ---------------- Kontekst («det var frisør») ---------------- */

const CTX_KEY = 'glimt_ctx';
/** Lagrer siste raske time / viste hendelse. */
export function setContext(user, c) {
  try { kv.set(user, CTX_KEY, { ...c, at: Date.now() }); } catch { /* best effort */ }
}
export const getContext = (user) => kv.get(user, CTX_KEY, null);
/** Fra GET /api/kalender/events/:id. */
export function rememberShown(user, ev) {
  if (!ev?.id) return;
  setContext(user, { source: 'event', eventId: ev.id, title: ev.title ?? '', note: ev.note ?? '', place: ev.room ?? '' });
}
/** Navnet konteksten gjelder: avsenderen i teksten/notatet, ellers tittelen uten «Frisør · ». */
export function nameOfContext(c) {
  if (!c) return null;
  const s = c.business || senderOf(c.text || '') || senderOf(c.note || '');
  if (s) return s;
  const t = String(c.title ?? '').replace(/^[^·]{2,20}·\s*/, '').trim();
  return t && !isNoiseLine(t) ? niceCase(t) : null;
}

/** Forslag når brukeren selv gir en rask time ny tittel (PATCH /api/kalender/events/:id). Lagres ikke. */
export function memorySuggestion(user, ev, newTitle) {
  try {
    if (ev?.origin !== ORIGIN_QUICK) return null;
    const name = senderOf(ev.note || '') || nameOfContext({ title: ev.title });
    if (!name) return null;
    const type = kindOfName(newTitle) ?? kindOfName(ev.title) ?? kindOfName(name) ?? 'annet';
    const t = TYPES.includes(type) ? type : 'annet';
    const match = normName(name);
    const known = aliasesOf(user).find((m) => normName(m.match) === match);
    if (known && known.title === newTitle) return null;
    return { match, name, type: t, title: newTitle, text: `Husk «${name}» som ${TYPE_LABEL[t] ? TYPE_LABEL[t].toLowerCase() : 'dette'} neste gang?` };
  } catch { return null; }
}

/* ---------------- Bruk i tittelen ---------------- */

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hits = (hay, match) => { const k = normName(match); return k.length >= 2 && new RegExp('(^|[^a-z0-9æøå])' + escRe(k) + '(?![a-z0-9æøå])').test(normName(hay)); };
/** Hendelsen treffer aliaset (tittel, notat eller sted). */
export const eventHitsAlias = (e, m) => hits(`${e.title ?? ''} \n ${e.note ?? ''} \n ${e.room ?? ''}`, m.match);

const addDaysISO = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** Egne hendelser i Privat (lokale eller Google) som treffer aliaset og har en annen tittel. */
export async function applyTargets(user, m) {
  const { eventsFor } = await import('./calendar.js');
  const today = osloTodayISO();
  const { events } = await runAsUser(user, () => eventsFor(user, addDaysISO(today, -365), addDaysISO(today, 365)));
  const title = aliasTitle(m);
  const seen = new Set();
  return events.filter((e) => {
    if (!e.editable || e.calendar !== 'privat' || !['local', 'google'].includes(e.source)) return false;
    if (!eventHitsAlias(e, m) || e.title === title) return false;
    const key = e.source === 'local' ? String(e.id).split('~')[0] : e.googleId ?? e.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
/** Gir treffene aliasets tittel. → {count, events:[{id, title, from}]} */
export async function applyMemory(user, m, { dryRun = false } = {}) {
  const list = await applyTargets(user, m);
  const title = aliasTitle(m);
  if (dryRun) return { count: list.length, title, events: list.slice(0, 50).map((e) => ({ id: e.id, title, from: e.title, date: e.date })) };
  const { updateEvent } = await import('./calendar.js');
  const done = [];
  for (const e of list) {
    try { await runAsUser(user, () => updateEvent(user, e.id, { title }, e)); done.push({ id: e.id, title, from: e.title, date: e.date }); } catch (err) { console.warn('[glimt husker] apply:', err?.message ?? err); }
  }
  if (done.length) touchMemory(user, m.id);
  return { count: done.length, title, events: done };
}

/* ---------------- Glimt: «husk at Påhåret er frisøren min» ---------------- */

const TYPE_WORDS = [
  [/^(?:frisør(?:en)?|frisor(?:en)?|hårklipp(?:en)?|barber(?:en)?|hårsalong(?:en)?)$/, 'frisør'],
  [/^(?:tannlege(?:n)?|tannpleier(?:en)?|tannklinikk(?:en)?)$/, 'tannlege'],
  [/^(?:lege(?:n)?|fastlege(?:n)?|legekontor(?:et)?|legesenter(?:et)?|legetime(?:n)?)$/, 'lege'],
  [/^(?:fysio(?:en)?|fysioterapeut(?:en)?|fysioterapi(?:en)?|kiropraktor(?:en)?|naprapat(?:en)?)$/, 'fysio'],
  [/^(?:optiker(?:en)?)$/, 'optiker'],
  [/^(?:psykolog(?:en)?)$/, 'psykolog'],
];
/** «frisøren» → frisør, ellers null. */
export const typeOfWord = (w) => { const n = String(w ?? '').toLowerCase().replace(/[.!?,]+$/, ''); return TYPE_WORDS.find(([re]) => re.test(n))?.[1] ?? null; };
export const DIN = { frisør: 'frisøren din', lege: 'legen din', tannlege: 'tannlegen din', fysio: 'fysioterapeuten din', optiker: 'optikeren din', psykolog: 'psykologen din', annet: 'avtalen din' };
const OWN = '(?:\\s+(?:min|mitt|mi|vår))?';
const CTX_RE = new RegExp(`^(?:husk(?:\\s+at)?\\s+)?(?:dette|det|den|denne|avtalen|timen|den\\s+avtalen|denne\\s+avtalen|den\\s+timen|denne\\s+timen)\\s+(?:er|var|gjelder|skal\\s+være)\\s+(?:for\\s+|hos\\s+|til\\s+|med\\s+|en\\s+|ei\\s+)?(?:en\\s+|min\\s+|mitt\\s+)?([a-zæøå]+)${OWN}$`, 'i');
const NAMED_RE = new RegExp(`^(?:husk(?:\\s+at)?\\s+|husk:\\s*)?(.{2,60}?)\\s+(?:er|=)\\s+(?:min\\s+|mitt\\s+|en\\s+|ei\\s+)?([a-zæøå]+)${OWN}$`, 'i');
/** Gjenkjenner minne-setninger. → {name?, type, ref:'named'|'context'} eller null. */
export function parseMemoryIntent(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  if (!t || t.length > 120 || /\?$/.test(t)) return null;
  let m = t.match(CTX_RE);
  if (m) { const type = typeOfWord(m[1]); return type ? { type, ref: 'context' } : null; }
  m = t.match(NAMED_RE);
  if (m) {
    const type = typeOfWord(m[2]);
    const name = m[1].trim().replace(/^[«"']|[»"']$/g, '');
    if (!type || /^(?:når|hva|hvem|hvor|hvordan|hvilken|neste|det|dette|den|denne|jeg|du|vi|han|hun)(?![a-zæøå])/i.test(name) || /\d{1,2}[.:]\d{2}/.test(name) || name.split(' ').length > 6) return null;
    return { name, type, ref: 'named' };
  }
  return null;
}

/** Lærer aliaset fra Glimt. ctx = kontekst (kv eller fra {context:{eventId}}). → svar til assist. */
export async function learnFromAssist(user, text, intent, ctx = getContext(user)) {
  const ctxName = nameOfContext(ctx);
  let display, match;
  if (intent.ref === 'named') {
    match = normName(intent.name);
    display = ctxName && normName(ctxName).includes(match) ? ctxName : niceCase(intent.name);
  } else {
    if (!ctxName) return { text: 'Hvilken avtale mener du? **Åpne avtalen** først, eller skriv f.eks. «Påhåret er frisøren min».', source: 'Glimt husker', tool: 'Glimt husker' };
    display = ctxName;
    match = normName(ctxName);
  }
  const title = aliasTitle({ type: intent.type, match }, display);
  const r = addMemory(user, { kind: 'alias', match, type: intent.type, title });
  if (r.error) return { text: r.error, source: 'Glimt husker', tool: 'Glimt husker' };
  let count = 0;
  try { count = (await applyMemory(user, r.item, { dryRun: true })).count; } catch { /* kalender nede: bare minnet */ }
  const ask = count ? ` Vil du at jeg endrer tittelen på **${count} ${count === 1 ? 'avtale' : 'avtaler'}** til «${title}»?` : '';
  return { text: `Ok, jeg husker at **${display}** er ${DIN[intent.type] ?? 'avtalen din'}.${ask}`, source: 'Glimt husker', tool: 'Glimt husker',
    memory: r.item, apply: { memoryId: r.item.id, count, title, url: `/api/glimt/memory/${r.item.id}/apply` } };
}

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', authOrToken);
api.get('/', (c) => c.json({ items: listMemory(c.get('user')), types: MEMORY_TYPES }, 200, { 'Cache-Control': 'no-store' }));
api.post('/', async (c) => {
  const user = c.get('user');
  const r = addMemory(user, await c.req.json().catch(() => null));
  if (r.error) return c.json({ error: r.error }, 400);
  let matches = 0;
  if (r.item.kind === 'alias') { try { matches = (await applyMemory(user, r.item, { dryRun: true })).count; } catch { /* */ } }
  return c.json({ ok: true, item: r.item, matches }, r.created ? 201 : 200);
});
api.delete('/:id', (c) => {
  const id = c.req.param('id');
  if (!/^\d{1,12}$/.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
  return deleteMemory(c.get('user'), id) ? c.json({ ok: true }) : c.json({ error: 'Fant ikke' }, 404);
});
api.post('/:id/apply', async (c) => {
  const user = c.get('user'), id = c.req.param('id');
  if (!/^\d{1,12}$/.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
  const m = getMemory(user, id);
  if (!m) return c.json({ error: 'Fant ikke' }, 404);
  if (m.kind !== 'alias') return c.json({ error: 'Bare alias kan brukes på avtaler' }, 400);
  const b = await c.req.json().catch(() => ({})) ?? {};
  try { return c.json({ ok: true, ...(await applyMemory(user, m, { dryRun: b.dryRun === true })) }); } catch (e) { return c.json({ error: String(e?.message ?? e).slice(0, 300) }, 502); }
});

export default api;
