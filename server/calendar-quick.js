// Prompt 29 (SERVER29): Kalender → rask time («time hos Nina frisør 14.30 25.09»). Montert under /api/kalender/quick
// (og /api/calendar/quick). Sesjon eller app-token (authOrToken). Alt er per bruker.
//   POST /parse {text, today?}  → parseQuick(text) + label (lokal og rask, til live forhåndsvisning i appene)
//   POST /      {text}          → 202 {jobId}. Jobben legges i cal_quick_jobs og kjøres i bakgrunnen:
//                                  Ollama (format:"json", temperature 0, prompten i spec) → reserve parseQuick når Ollama er
//                                  nede/feiler eller sikkerhet < 0,6 → hendelse i Privat (Google når koblet, ellers lokal),
//                                  varsel 1 t før, origin «AI · rask time», lang tekst i notat.
//                                  Ferdig/feilet → sanntid «calendar-quick» på /api/ws (samme form som Bursdager-varslene:
//                                  {action, job, title, body, category, url}).
//   GET  /jobs                  → [{id, state, text, result?, error?, found?, engine, created, updated}] (siste 20)
//   POST /:id/undo              → {ok} (sletter hendelsen jobben laget)
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { authOrToken } from './mobile.js';
import { runAsUser } from './settings.js';
import { broadcast } from './realtime.js';
import { notifyOf } from './notify.js';
import { eventInput, createEvent, deleteEvent } from './calendar.js';
import { settings } from './finans/db.js';
import { aiTimeoutsOf, _aiTest, logAi } from './finans/ai.js';
import { parseQuick, quickLabel, osloTodayISO, TYPES, DURATION, NO_DATE } from '../public/js/quick-time.js';

const MOCK = process.env.MOCK_DATA === '1';
const ORIGIN = 'AI · rask time';
const MAX_TEXT = 4000;
const MAX_PENDING = 10;
const MIN_CONF = 0.6;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^q[0-9a-f]{12}$/;
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

db.exec(`CREATE TABLE IF NOT EXISTS cal_quick_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','done','failed')),
  text TEXT NOT NULL,
  result TEXT,
  error TEXT,
  found TEXT,
  engine TEXT,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cal_quick_jobs_user ON cal_quick_jobs(user_id, created);`);
const q = (sql) => db.prepare(sql);

/* ---------------- Ollama ---------------- */

export const PROMPT = (text, today = osloTodayISO()) => `Dagens dato er ${today} (${WD[new Date(today + 'T12:00:00Z').getUTCDay()]}). Tidssone Europe/Oslo.
Hent ut én avtale fra teksten. Svar KUN JSON:
{"tittel":string,"dato":"YYYY-MM-DD"|null,"start":"HH:MM"|null,"slutt":"HH:MM"|null,
 "sted":string|null,"type":"lege"|"tannlege"|"frisør"|"fysio"|"psykolog"|"optiker"|"annet","sikkerhet":0-1}
Regler: dd.mm uten år = neste gang den datoen kommer. "14.30" er klokkeslett, "25.09" er dato.
Ikke finn på tid eller dato.

Tekst:
${text}`;

/** Standard: Ollama direkte (format:"json", temperature 0) med brukerens modell og tidsgrense. Tester bytter den ut. */
async function ollamaDefault(prompt, user) {
  const st = settings(user);
  const base = String(st.ollamaUrl ?? '').replace(/\/$/, '');
  if (!base) throw new Error('Ollama er ikke satt opp');
  const model = st.ollamaTextModel || st.ollamaModel;
  const ms = aiTimeoutsOf(st).ollama * 1000 * _aiTest.scale;
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ms),
      body: JSON.stringify({ model, stream: false, format: 'json', options: { temperature: 0 }, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error(`Ollama svarte ${r.status}`);
    const j = await r.json();
    const content = String(j?.message?.content ?? j?.response ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
    const data = JSON.parse(content);
    try { runAsUser(user, () => logAi({ task: 'calendar-quick', engine: 'ollama', model, promptLen: prompt.length, ms: Date.now() - t0 })); } catch { /* bare logg */ }
    return data;
  } catch (e) {
    try { runAsUser(user, () => logAi({ task: 'calendar-quick', engine: 'ollama', model, promptLen: prompt.length, ms: Date.now() - t0, status: 'feil', error: String(e.message).slice(0, 200) })); } catch { /* bare logg */ }
    throw e;
  }
}
let ollamaImpl = null;
/** Bare for tester: falsk Ollama (prompt, user) → objekt, eller null for standard. */
export const _setQuickOllama = (fn) => { ollamaImpl = fn; };
// MOCK_DATA=1 uten OLLAMA_URL: ingen Ollama å spørre, så den lokale tolkeren brukes direkte (raskt i demo).
const ollamaOf = () => ollamaImpl ?? (MOCK && !process.env.OLLAMA_URL ? null : ollamaDefault);

const validDate = (s) => DATE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const addMin = (hm, n) => { const [h, m] = hm.split(':').map(Number); const t = Math.min(23 * 60 + 59, h * 60 + m + n); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
/** Ollama-svaret → samme form som parseQuick, eller null hvis det ikke kan brukes (ugyldig, uten dato, sikkerhet < 0,6). */
export function fromOllama(o) {
  if (!o || typeof o !== 'object') return null;
  const conf = Number(o.sikkerhet ?? o.confidence);
  if (!Number.isFinite(conf) || conf < MIN_CONF) return null;
  const date = typeof o.dato === 'string' && validDate(o.dato) ? o.dato : null;
  if (!date) return null;
  const title = String(o.tittel ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!title) return null;
  const type = TYPES.includes(o.type) ? o.type : 'annet';
  const start = typeof o.start === 'string' && HM.test(o.start) ? o.start : null;
  let end = start && typeof o.slutt === 'string' && HM.test(o.slutt) && o.slutt > start ? o.slutt : null;
  const duration = DURATION[type] ?? 60;
  if (start && !end) end = addMin(start, duration);
  const place = typeof o.sted === 'string' && o.sted.trim() ? o.sted.trim().slice(0, 200) : null;
  return { ok: true, title, date, start, end, place, type, duration, allDay: !start, confidence: Math.round(conf * 100) / 100, isAppointment: true };
}

/** Tolker teksten: Ollama først, parseQuick som reserve. → {r, engine} */
export async function interpret(text, user, today = osloTodayISO()) {
  const local = parseQuick(text, today);
  const fn = ollamaOf();
  if (fn) {
    try {
      const r = fromOllama(await fn(PROMPT(text, today), user));
      if (r) return { r: { ...r, place: r.place ?? local.place }, engine: 'ollama' };
    } catch { /* Ollama nede eller ugyldig svar → lokal tolker */ }
  }
  return { r: local, engine: 'lokal' };
}

/* ---------------- Jobbkø ---------------- */

const parse = (s) => { try { return s ? JSON.parse(s) : undefined; } catch { return undefined; } };
export function jobOut(row) {
  const o = { id: row.id, state: row.state, text: row.text, engine: row.engine ?? null, created: row.created, updated: row.updated };
  const result = parse(row.result), found = parse(row.found);
  if (result) o.result = result;
  if (row.error) o.error = row.error;
  if (found) o.found = found;
  return o;
}
const getJob = (id) => q('SELECT * FROM cal_quick_jobs WHERE id=?').get(id);
const setJob = (id, f) => { const keys = Object.keys(f); q(`UPDATE cal_quick_jobs SET ${keys.map((k) => `${k}=@${k}`).join(', ')}, updated=@updated WHERE id=@id`).run({ ...f, id, updated: Date.now() }); };

function announce(user, job) {
  let n; try { n = notifyOf(user); } catch { n = { on: true }; }
  const ok = job.state === 'done';
  const body = ok ? `✓ ${job.result.title} · ${job.result.label}` : `Fant ikke alt i «${job.text.slice(0, 60)}». Åpne skjemaet for å fullføre.`;
  broadcast('calendar-quick', { action: ok ? 'done' : 'failed', job, title: ok ? 'Lagt i kalenderen' : 'Rask time', body, category: 'kalender',
    url: ok ? `finanshub://kalender?date=${job.result.date}` : 'finanshub://kalender?quick=' + job.id, silent: n?.on === false }, [user]);
}

async function runJob(id) {
  const row = getJob(id);
  if (!row || row.state !== 'queued') return;
  const user = row.user_id;
  setJob(id, { state: 'running' });
  const text = row.text;
  let r, engine = 'lokal';
  try { ({ r, engine } = await interpret(text, user)); } catch (e) { r = parseQuick(text); }
  const found = { title: r.title || '', date: r.date ?? null, start: r.start ?? null, end: r.end ?? null, place: r.place ?? null, type: r.type ?? 'annet', note: text, calendar: 'privat', reminder: r.start ? '1h' : 'none' };
  if (!r.ok || !r.date) {
    setJob(id, { state: 'failed', error: r.why || NO_DATE, found: JSON.stringify(found), engine });
    announce(user, jobOut(getJob(id)));
    return;
  }
  const v = eventInput({ title: r.title || 'Avtale', allDay: !r.start, date: r.date, start: r.start, end: r.end, location: r.place ?? '', calendar: 'privat', repeat: 'none',
    reminder: r.start ? '1h' : 'none', note: text.length > 60 ? text : '' });
  if (v.error) {
    setJob(id, { state: 'failed', error: v.error, found: JSON.stringify(found), engine });
    announce(user, jobOut(getJob(id)));
    return;
  }
  try {
    const ev = await runAsUser(user, () => createEvent(user, { ...v.value, origin: ORIGIN }));
    const result = { eventId: ev?.id ?? null, title: v.value.title, date: v.value.date, start: v.value.start, end: v.value.end, place: v.value.location || null, label: quickLabel({ date: v.value.date, start: v.value.start }) };
    setJob(id, { state: 'done', result: JSON.stringify(result), error: null, found: null, engine });
  } catch (e) {
    setJob(id, { state: 'failed', error: String(e?.message ?? e).slice(0, 300), found: JSON.stringify({ ...found, reconnect: !!e?.reconnect }), engine });
  }
  announce(user, jobOut(getJob(id)));
}

// Én jobb om gangen (Ollama har ett GPU-kort). Køen overlever ikke omstart i minnet, men tabellen gjør: se resume().
let chain = Promise.resolve();
const idle = new Set();
export function enqueue(id) {
  const p = chain.then(() => runJob(id)).catch((e) => {
    console.error('[rask time]', e?.message ?? e);
    try { setJob(id, { state: 'failed', error: 'Noe gikk galt. Prøv igjen.' }); } catch { /* */ }
  });
  chain = p;
  idle.add(p); p.finally(() => idle.delete(p));
  return p;
}
/** Bare for tester: venter til køen er tom. */
export const _drain = async () => { while (idle.size) await Promise.all([...idle]); };
// Ved oppstart: jobber som ble avbrutt av en omstart kjøres på nytt.
function resume() {
  q("UPDATE cal_quick_jobs SET state='queued' WHERE state='running'").run();
  for (const { id } of q("SELECT id FROM cal_quick_jobs WHERE state='queued' ORDER BY created").all()) enqueue(id);
}
if (process.env.NODE_ENV !== 'test') resume();

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', authOrToken);
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; };

api.post('/parse', async (c) => {
  const b = await body(c);
  if (!b || typeof b.text !== 'string') return c.json({ error: 'Forventet {text}' }, 400);
  const today = typeof b.today === 'string' && validDate(b.today) ? b.today : osloTodayISO();
  const r = parseQuick(b.text.slice(0, MAX_TEXT), today);
  return c.json({ ...r, label: quickLabel(r) });
});

api.post('/', async (c) => {
  const user = c.get('user');
  const b = await body(c);
  const text = typeof b?.text === 'string' ? b.text.replace(/\r\n?/g, '\n').trim() : '';
  if (!text) return c.json({ error: 'Skriv hva timen gjelder.' }, 400);
  if (text.length > MAX_TEXT) return c.json({ error: `Teksten er for lang (maks ${MAX_TEXT} tegn)` }, 400);
  const pending = q("SELECT count(*) FROM cal_quick_jobs WHERE user_id=? AND state IN ('queued','running')").pluck().get(user);
  if (pending >= MAX_PENDING) return c.json({ error: 'For mange timer i køen. Vent litt.' }, 429);
  const id = 'q' + randomBytes(6).toString('hex');
  const now = Date.now();
  q('INSERT INTO cal_quick_jobs(id, user_id, state, text, created, updated) VALUES(?,?,?,?,?,?)').run(id, user, 'queued', text, now, now);
  // Rydd: behold de 100 siste per bruker.
  q('DELETE FROM cal_quick_jobs WHERE user_id=? AND id NOT IN (SELECT id FROM cal_quick_jobs WHERE user_id=? ORDER BY created DESC LIMIT 100)').run(user, user);
  enqueue(id);
  return c.json({ jobId: id }, 202);
});

api.get('/jobs', (c) => c.json(q('SELECT * FROM cal_quick_jobs WHERE user_id=? ORDER BY created DESC, rowid DESC LIMIT 20').all(c.get('user')).map(jobOut)));

api.post('/:id/undo', async (c) => {
  const user = c.get('user'), id = c.req.param('id');
  if (!ID.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
  const row = getJob(id);
  if (!row || row.user_id !== user) return c.json({ error: 'Fant ikke jobben' }, 404);
  const res = parse(row.result);
  if (row.state !== 'done' || !res?.eventId) return c.json({ error: 'Jobben har ingen hendelse å angre' }, 409);
  if (res.undone) return c.json({ error: 'Allerede angret' }, 409);
  try { await runAsUser(user, () => deleteEvent(user, res.eventId)); } catch (e) {
    if (e?.status !== 404) return c.json({ error: String(e?.message ?? e).slice(0, 300) }, e?.status && e.status < 500 ? e.status : 502);
  }
  setJob(id, { result: JSON.stringify({ ...res, undone: true }) });
  return c.json({ ok: true });
});

export default api;
