// Prompt 37 (SERVER37): dagens bibelvers (claude-code-bibelvers.md). Personlig modul: standard på bare for brukeren «sebastian».
// Tekst: Bibelen 1930-oversettelsen (Det Norske Bibelselskap, fri bruk) i server/data/bible1930-morgen.json og -kveld.json
// (≥ 365 + 365 vers, laget med scripts/build-bible37.mjs). Ett vers per dag og periode, deterministisk: (dag i året − 1) % antall.
//
// Alle ruter: sesjon eller app-token. Uten modulen → 403 {enabled:false, error}.
// GET  /api/bible/today?period=morning|evening[&date=YYYY-MM-DD]
//   → {enabled:true, id, ref:'Salme 4,9', short:'Sal 4,9', text, period, date, kicker:'KVELDSVERS · GLIMT', translation:'1930',
//      context:{before:[{v, text}], after:[{v, text}]}, index, count, read, saved, url}
//   period uten verdi: morning 05–17, ellers evening.
// GET  /api/bible/next?offset=1[&period=] → samme form for dagen + offset (widgetens «Neste ›»)
// GET  /api/bible/settings → {enabled, allowed, morning, evening, notify, translation, translations:['1930']}
// PUT  /api/bible/settings {enabled?, morning?, evening?, notify?, translation?} (bare med modulen)
// GET  /api/bible/stats → {streak, best, readToday, readDays:[dates], week:[{date, wd, read, today}], hint,
//                          plan:{id, name, total, day, doneToday, today:{label, url}, pct, options:[{id, name, total}]},
//                          saved:[{ref, text}], totals:{days, saved, planPct}, reminder}
// POST /api/bible/read {date?, period?} → stats (teller i rekken; date kan bare være i dag eller i går)
// GET/PUT /api/bible/plan {plan:'joh'|'sal'|'ord'|'mark'} · POST /api/bible/plan/done → stats (Ferdig teller også i rekken)
// GET /api/bible/saved → {saved} · PUT /api/bible/saved {saved:[{ref, text}]} (synk fra appene)
// POST /api/bible/saved {ref} · DELETE /api/bible/saved?ref= → {saved}
// PUT  /api/bible/reminder {on} → {reminder}
// POST /api/bible/explain {ref?, text?, period?} → {text, source:'glimt'|'mal'}
// Admin: GET /api/bible/users → {users:[{id, name, username, allowed, enabled}]} · PUT /api/bible/users/:id {allowed}
// Brief: bibleForBrief(user, kind) → {…verset, placement:'top'|'bottom'} eller null (modulen av, eller dagsbrief uten lest vers).
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { db } from './db.js';
import { userInfo, listUsers, isAdmin } from './auth.js';
import { authOrToken } from './mobile.js';

const MOCK = process.env.MOCK_DATA === '1';
const q = (sql) => db.prepare(sql);
const load = (f) => JSON.parse(readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8'));
export const VERSES = { morning: load('bible1930-morgen.json').verses, evening: load('bible1930-kveld.json').verses };

db.exec(`CREATE TABLE IF NOT EXISTS user_features (
  user_id TEXT NOT NULL, feature TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 0,
  morning INTEGER NOT NULL DEFAULT 1, evening INTEGER NOT NULL DEFAULT 1, notify INTEGER NOT NULL DEFAULT 0, translation TEXT NOT NULL DEFAULT '1930',
  updated INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, feature));
CREATE TABLE IF NOT EXISTS bible_progress (
  user_id TEXT PRIMARY KEY, read_days TEXT NOT NULL DEFAULT '[]', reads TEXT NOT NULL DEFAULT '{}', best_streak INTEGER NOT NULL DEFAULT 0,
  saved TEXT NOT NULL DEFAULT '[]', plan TEXT NOT NULL DEFAULT 'joh', plan_day INTEGER NOT NULL DEFAULT 1, plan_done_date TEXT,
  reminder INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL DEFAULT 0);`);
const F = 'bible_verse';

const pad = (n) => String(n).padStart(2, '0');
const osloNow = (t = Date.now()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour };
};
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dayOfYear = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1; };
const parseJ = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const WD = ['S', 'M', 'T', 'O', 'T', 'F', 'L'];
const MON = ['jan.', 'feb.', 'mars', 'april', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];

/* ---------------- Modulen per bruker ---------------- */

/** Standard: tillatt og på for brukernavnet «sebastian», av for alle andre. Lagres første gang den leses. */
export function featureOf(uid) {
  let r = q('SELECT * FROM user_features WHERE user_id=? AND feature=?').get(uid, F);
  if (!r) {
    const on = String(userInfo(uid)?.username ?? '').toLowerCase() === 'sebastian' ? 1 : 0;
    q('INSERT OR IGNORE INTO user_features(user_id, feature, allowed, enabled, updated) VALUES(?,?,?,?,?)').run(uid, F, on, on, Date.now());
    r = q('SELECT * FROM user_features WHERE user_id=? AND feature=?').get(uid, F);
  }
  return { allowed: !!r.allowed, enabled: !!(r.allowed && r.enabled), morning: !!r.morning, evening: !!r.evening, notify: !!r.notify, translation: r.translation || '1930' };
}
export const bibleEnabled = (uid) => { try { return featureOf(uid).enabled; } catch { return false; } };
// Migrering (logges): brukeren «sebastian» får modulen ved oppstart.
for (const u of q("SELECT id FROM users WHERE lower(username)='sebastian'").all()) featureOf(u.id);

/* ---------------- Versene ---------------- */

export const periodNow = (t = Date.now()) => { const h = osloNow(t).h; return h >= 5 && h < 17 ? 'morning' : 'evening'; };
/** Dagens vers for date og periode (samme på alle enheter). */
export function verseFor(date, period = 'morning') {
  const list = VERSES[period === 'evening' ? 'evening' : 'morning'];
  const index = (dayOfYear(date) - 1) % list.length;
  return { ...list[index], index, count: list.length };
}
const urlOf = (v) => `https://www.bibel.no/nettbibelen?parse=${encodeURIComponent(`${v.short}`)}`;
function verseOut(uid, date, period) {
  const v = verseFor(date, period);
  const pr = progressOf(uid);
  return { enabled: true, id: v.id, ref: v.ref, short: v.short, text: v.text, period, date, kicker: period === 'evening' ? 'KVELDSVERS · GLIMT' : 'MORGENVERS · GLIMT',
    dateLabel: `${+date.slice(8)}. ${MON[+date.slice(5, 7) - 1]}`, translation: '1930', translationName: 'Bibelen (1930)',
    context: { before: v.before ?? [], after: v.after ?? [] }, index: v.index, count: v.count, read: pr.read_days.includes(date), saved: pr.saved.some((s) => s.ref === v.ref), url: urlOf(v) };
}

/* ---------------- Rekke og leseplan ---------------- */

export const PLANS = {
  joh: { name: 'Johannes på 21 dager', total: 21, label: (d) => `Johannes ${d}` },
  sal: { name: 'Salmene på 30 dager', total: 30, label: (d) => `Salme ${d * 5 - 4}–${d * 5}` },
  ord: { name: 'Ordspråkene på 31 dager', total: 31, label: (d) => `Ordspråkene ${d}` },
  mark: { name: 'Markus på 16 dager', total: 16, label: (d) => `Markus ${d}` },
};
function progressOf(uid) {
  let r = q('SELECT * FROM bible_progress WHERE user_id=?').get(uid);
  if (!r) {
    // MOCK_DATA=1: som i prototypen – lest de seks siste dagene, lengste rekke 12.
    const days = MOCK ? Array.from({ length: 6 }, (_, i) => addDays(osloNow().date, -(i + 1))).reverse() : [];
    q('INSERT OR IGNORE INTO bible_progress(user_id, read_days, best_streak, plan_day, updated) VALUES(?,?,?,?,?)').run(uid, JSON.stringify(days), MOCK ? 12 : 0, MOCK ? 8 : 1, Date.now());
    r = q('SELECT * FROM bible_progress WHERE user_id=?').get(uid);
  }
  return { ...r, read_days: parseJ(r.read_days, []), reads: parseJ(r.reads, {}), saved: parseJ(r.saved, []) };
}
/** Rekken: dager på rad som slutter i dag (lest) eller i går. I dag teller ikke før det er lest. */
export function streakOf(days, today) {
  const set = new Set(days);
  let d = set.has(today) ? today : addDays(today, -1), n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
const longest = (days) => { const s = [...new Set(days)].sort(); let best = 0, run = 0, prev = null; for (const d of s) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; } return best; };
function statsOf(uid, today = osloNow().date) {
  const p = progressOf(uid);
  const streak = streakOf(p.read_days, today), best = Math.max(p.best_streak, longest(p.read_days), streak);
  const readToday = p.read_days.includes(today);
  const wd = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7, monday = addDays(today, -wd);
  const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(monday, i); return { date: d, wd: WD[(i + 1) % 7], read: p.read_days.includes(d), today: d === today, future: d > today }; });
  const P = PLANS[p.plan] ?? PLANS.joh, day = Math.min(p.plan_day, P.total), doneToday = p.plan_done_date === today;
  const pct = Math.round(((p.plan_day - 1 + (p.plan_day > P.total ? 0 : 0)) / P.total) * 100);
  const label = P.label(day);
  return {
    streak, best, readToday, readDays: [...p.read_days].sort(), week,
    hint: readToday ? 'Bra! Kom tilbake i morgen.' : `Les dagens vers for å holde rekken på ${streak + 1} ${streak + 1 === 1 ? 'dag' : 'dager'}.`,
    plan: { id: p.plan, name: P.name, total: P.total, day, dayLabel: `Dag ${day} av ${P.total}`, doneToday, finished: p.plan_day > P.total, pct: Math.min(100, Math.max(0, pct)),
      today: { label, url: `https://www.bibel.no/nettbibelen?parse=${encodeURIComponent(label)}` }, options: Object.entries(PLANS).map(([id, x]) => ({ id, name: x.name, total: x.total })) },
    saved: p.saved, totals: { days: new Set(p.read_days).size, saved: p.saved.length, planPct: Math.min(100, Math.max(0, pct)) }, reminder: !!p.reminder,
  };
}
function markRead(uid, date, period = null) {
  const p = progressOf(uid);
  const days = [...new Set([...p.read_days, date])].sort().slice(-1000);
  const reads = { ...p.reads, [date]: [...new Set([...(p.reads[date] ?? []), ...(period ? [period] : [])])] };
  for (const k of Object.keys(reads)) if (k < addDays(date, -60)) delete reads[k];
  const best = Math.max(p.best_streak, longest(days));
  q('UPDATE bible_progress SET read_days=?, reads=?, best_streak=?, updated=? WHERE user_id=?').run(JSON.stringify(days), JSON.stringify(reads), best, Date.now(), uid);
}

/** For briefen. kind: morning|day|evening|night. Lest i dag → nederst (placement 'bottom'), også i dagsbriefen. */
export function bibleForBrief(uid, kind = 'morning', t = Date.now()) {
  if (!bibleEnabled(uid)) return null;
  const f = featureOf(uid), { date } = osloNow(t);
  const p = progressOf(uid);
  const read = p.read_days.includes(date);
  const period = kind === 'evening' || kind === 'night' ? 'evening' : 'morning';
  if (kind === 'day' && !read) return null;
  if (!read && ((period === 'morning' && !f.morning) || (period === 'evening' && !f.evening))) return null;
  const v = verseOut(uid, date, period);
  return { period, ref: v.ref, short: v.short, text: v.text, date, dateLabel: v.dateLabel, kicker: v.kicker, translation: '1930', id: v.id, read, placement: read ? 'bottom' : 'top',
    context: v.context, open: { route: 'bibel' }, deepLink: 'finanshub://bibel', speak: `Dagens vers er fra ${v.ref.replace(/,/, ' vers ').replace('–', ' til ')}. ${v.text}` };
}

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', authOrToken);
const need = (c) => (featureOf(c.get('user')).enabled ? null : c.json({ enabled: false, error: 'Bibelvers er ikke slått på for deg' }, 403));
const periodIn = (v) => (v === 'evening' || v === 'kveld' ? 'evening' : v === 'morning' || v === 'morgen' ? 'morning' : null);

api.get('/today', (c) => {
  const deny = need(c); if (deny) return deny;
  const d = c.req.query('date');
  const date = DATE.test(d ?? '') ? d : osloNow().date;
  return c.json(verseOut(c.get('user'), date, periodIn(c.req.query('period')) ?? periodNow()));
});
api.get('/next', (c) => {
  const deny = need(c); if (deny) return deny;
  const off = Math.max(-365, Math.min(365, Math.round(Number(c.req.query('offset') ?? 1)) || 0));
  return c.json({ ...verseOut(c.get('user'), addDays(osloNow().date, off), periodIn(c.req.query('period')) ?? periodNow()), offset: off });
});
api.get('/settings', (c) => {
  const f = featureOf(c.get('user'));
  if (!f.allowed) return c.json({ enabled: false, allowed: false, error: 'Bibelvers er ikke slått på for deg' }, 403);
  return c.json({ ...f, translations: ['1930'] });
});
api.put('/settings', async (c) => {
  const u = c.get('user'), f = featureOf(u);
  if (!f.allowed) return c.json({ enabled: false, allowed: false, error: 'Bibelvers er ikke slått på for deg' }, 403);
  const b = await c.req.json().catch(() => ({}));
  if (b.translation !== undefined && b.translation !== '1930') return c.json({ error: 'Bare 1930-oversettelsen er tilgjengelig (Bibel 2011 krever lisens)' }, 400);
  const n = { enabled: b.enabled ?? f.enabled, morning: b.morning ?? f.morning, evening: b.evening ?? f.evening, notify: b.notify ?? f.notify };
  q('UPDATE user_features SET enabled=?, morning=?, evening=?, notify=?, updated=? WHERE user_id=? AND feature=?').run(n.enabled ? 1 : 0, n.morning ? 1 : 0, n.evening ? 1 : 0, n.notify ? 1 : 0, Date.now(), u, F);
  return c.json({ ...featureOf(u), translations: ['1930'] });
});
api.get('/stats', (c) => { const deny = need(c); if (deny) return deny; return c.json(statsOf(c.get('user'))); });
api.post('/read', async (c) => {
  const deny = need(c); if (deny) return deny;
  const b = await c.req.json().catch(() => ({}));
  const today = osloNow().date;
  const date = DATE.test(b.date ?? '') ? b.date : today;
  if (date !== today && date !== addDays(today, -1)) return c.json({ error: 'Bare i dag eller i går kan markeres som lest' }, 400);
  markRead(c.get('user'), date, periodIn(b.period));
  return c.json(statsOf(c.get('user')));
});
api.put('/plan', async (c) => {
  const deny = need(c); if (deny) return deny;
  const b = await c.req.json().catch(() => ({}));
  if (!PLANS[b.plan]) return c.json({ error: `plan må være ${Object.keys(PLANS).join(', ')}` }, 400);
  q('UPDATE bible_progress SET plan=?, plan_day=1, plan_done_date=NULL, updated=? WHERE user_id=?').run(b.plan, Date.now(), (progressOf(c.get('user')), c.get('user')));
  return c.json(statsOf(c.get('user')));
});
api.get('/plan', (c) => { const deny = need(c); if (deny) return deny; return c.json(statsOf(c.get('user')).plan); });
api.get('/saved', (c) => { const deny = need(c); if (deny) return deny; return c.json({ saved: progressOf(c.get('user')).saved }); });
// Appene (prompt 37) kan synke hele listen: PUT /saved {saved:[{ref, text}]}.
api.put('/saved', async (c) => {
  const deny = need(c); if (deny) return deny;
  const b = await c.req.json().catch(() => ({}));
  if (!Array.isArray(b.saved)) return c.json({ error: 'saved må være en liste' }, 400);
  const saved = b.saved.slice(0, 200).map((x) => ({ ref: String(x?.ref ?? '').slice(0, 60), text: String(x?.text ?? '').slice(0, 600), at: x?.at ?? new Date().toISOString() })).filter((x) => x.ref);
  progressOf(c.get('user'));
  q('UPDATE bible_progress SET saved=?, updated=? WHERE user_id=?').run(JSON.stringify(saved), Date.now(), c.get('user'));
  return c.json({ saved });
});
api.post('/plan/done', (c) => {
  const deny = need(c); if (deny) return deny;
  const u = c.get('user'), p = progressOf(u), today = osloNow().date;
  if (p.plan_done_date !== today) q('UPDATE bible_progress SET plan_day=plan_day+1, plan_done_date=?, updated=? WHERE user_id=?').run(today, Date.now(), u);
  markRead(u, today, 'plan');
  return c.json(statsOf(u));
});
api.post('/saved', async (c) => {
  const deny = need(c); if (deny) return deny;
  const b = await c.req.json().catch(() => ({}));
  const all = [...VERSES.morning, ...VERSES.evening];
  const v = all.find((x) => x.ref === b.ref || x.short === b.ref || x.id === b.id);
  if (!v) return c.json({ error: 'Ukjent vers' }, 404);
  const u = c.get('user'), p = progressOf(u);
  const saved = [{ ref: v.ref, text: v.text, at: new Date().toISOString() }, ...p.saved.filter((s) => s.ref !== v.ref)].slice(0, 200);
  q('UPDATE bible_progress SET saved=?, updated=? WHERE user_id=?').run(JSON.stringify(saved), Date.now(), u);
  return c.json({ saved });
});
api.delete('/saved', (c) => {
  const deny = need(c); if (deny) return deny;
  const u = c.get('user'), p = progressOf(u), ref = c.req.query('ref');
  const saved = p.saved.filter((s) => s.ref !== ref);
  q('UPDATE bible_progress SET saved=?, updated=? WHERE user_id=?').run(JSON.stringify(saved), Date.now(), u);
  return c.json({ saved });
});
api.put('/reminder', async (c) => {
  const deny = need(c); if (deny) return deny;
  const b = await c.req.json().catch(() => ({}));
  progressOf(c.get('user'));
  q('UPDATE bible_progress SET reminder=?, updated=? WHERE user_id=?').run(b.on ? 1 : 0, Date.now(), c.get('user'));
  return c.json({ reminder: !!b.on, time: '07:00', text: 'Dagens vers er klart', streakText: 'Hold rekken: dagens vers venter', streakTime: '21:00' });
});
api.post('/explain', async (c) => {
  const deny = need(c); if (deny) return deny;
  const b = await c.req.json().catch(() => ({}));
  const all = [...VERSES.morning, ...VERSES.evening];
  const v = (b.ref && all.find((x) => x.ref === b.ref || x.short === b.ref)) || (b.ref && b.text ? { ref: String(b.ref).slice(0, 60), text: String(b.text).slice(0, 600), book: String(b.ref).replace(/\s*\d.*$/, ''), before: [] } : null) || verseFor(osloNow().date, periodIn(b.period) ?? periodNow());
  const local = `${v.ref} er fra ${v.book}. ${v.before?.length ? `Versene rett før handler om det samme: «${v.before[v.before.length - 1].text.slice(0, 120)}${v.before[v.before.length - 1].text.length > 120 ? ' …' : ''}». ` : ''}Verset sier: «${v.text}» Les det langsomt, og tenk på hva det betyr for dagen din i dag.`;
  if (MOCK && !process.env.OLLAMA_URL) return c.json({ ref: v.ref, text: local, source: 'mal' });
  try {
    const { run } = await import('./ai-run.js');
    const out = await run('glimt', { user: c.get('user'), prompt: `Forklar bibelverset ${v.ref} (Bibelen 1930): «${v.text}» i 3–4 korte setninger på norsk bokmål: sammenheng i boken og hva det betyr. Ingen markdown.`, localOnly: true, numPredict: 220, title: 'Glimt · bibelvers' });
    const t = String(out.text ?? '').replace(/\s+/g, ' ').trim();
    return c.json({ ref: v.ref, text: t || local, source: t ? 'glimt' : 'mal' });
  } catch { return c.json({ ref: v.ref, text: local, source: 'mal' }); }
});
api.get('/users', (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer' }, 403);
  return c.json({ users: listUsers().map((u) => { const f = featureOf(u.id); return { id: u.id, name: u.displayName, username: u.username, allowed: f.allowed, enabled: f.enabled }; }) });
});
api.put('/users/:id', async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan slå på moduler for andre' }, 403);
  const id = c.req.param('id');
  if (!userInfo(id)) return c.json({ error: 'Fant ikke brukeren' }, 404);
  const b = await c.req.json().catch(() => ({}));
  featureOf(id);
  const on = !!(b.allowed ?? b.enabled);
  q('UPDATE user_features SET allowed=?, enabled=?, updated=? WHERE user_id=? AND feature=?').run(on ? 1 : 0, on ? 1 : 0, Date.now(), id, F);
  return c.json({ id, ...featureOf(id) });
});
export default api;
