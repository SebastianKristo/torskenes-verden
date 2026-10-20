// Prompt 41 (SERVER41): Glimt i Gjøremål/Huskeliste deler opp lange beskjeder med ekte AI, i bakgrunnen, og husker originalen
// («Laget med Glimt»). claude-code-huskeliste-glimt-ai-bakgrunn.md.
//
// Montert av tasks.js under /api/tasks (før prompt 37-rutene), samme tilgang (sesjon eller app-token):
//   POST   /api/tasks/glimt {q, async:true, list?, origin?:'huske'|'home_search'}
//          → 202 {jobId, placeholder:{id, text, list, label:'Glimt deler opp beskjeden …', startedAt}}   (uten async: som før, prompt 37/40)
//   GET    /api/tasks/glimt/jobs → {jobs:[job]}            (pågående + de 10 siste)
//   GET    /api/tasks/glimt/jobs/:id → job
//          job = {jobId, state:'queued'|'running'|'done'|'failed', text, list, origin, engine?, items?:[oppgave], count, text2?, error?, createdAt, endedAt?, srcId}
//   GET    /api/tasks/glimt/sources → {sources:[{id, text, createdAt, engine, engineLabel, by:{id, name}, origin, count, deleted, items:[oppgave + step]}], count}
//   POST   /api/tasks/glimt/sources/:id/redo → 202 {jobId, placeholder} («✦ Del opp på nytt»: ufullførte punkter fra beskjeden slettes først)
//   DELETE /api/tasks/glimt/sources/:id → {ok} («Glem beskjeden», punktene blir)
//   Alias (api41.js): POST /api/huske/glimt-jobs {text, list?, origin?} → 202 {job_id, jobId, placeholder}
// Sanntid: «glimt-job» {jobId, state, …job} til brukeren, og «todo:changed»/«tasks» for punktene (tasks.js).
// Push når ferdig (Glimt-varsel): «Glimt lagde 3 punkter i riktig rekkefølge» (notifyUser hopper over push når appen er i forgrunnen).
// Oppgaven får origin:{id, text, at, engine} (itemOut i tasks.js) når den er laget av en slik beskjed.
//
// Motor: samme AI-kjede som Glimt ellers (run('glimt'), rutingen velger Groq → Gemini → Ollama), 60 s per forsøk, 2 nye forsøk,
// så den lokale tolkeren splitLocal41 (forstår «før vi skal», «hvor vi må», «og så», «siden/fordi» → note). Korte enkeltoppgaver
// går lokalt med en gang. Data: huske_glimt_src (id, user_id, text, created_at, engine, item_ids, …), hl_tasks.src_id. Siste 60 per bruker.
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { userInfo, listUsers } from './auth.js';
import { broadcast } from './realtime.js';
import { notifyUser } from './notify.js';
import { imperative40, validateAi40, migrate40 } from './tasks-glimt40.js';
import { parseTask37 } from './tasks-glimt37.js';

db.exec(`CREATE TABLE IF NOT EXISTS huske_glimt_src (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL, engine TEXT, item_ids TEXT NOT NULL DEFAULT '[]',
  list TEXT, origin TEXT NOT NULL DEFAULT 'huske', state TEXT NOT NULL DEFAULT 'queued', error TEXT, ended_at INTEGER, deleted INTEGER NOT NULL DEFAULT 0, forgotten INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS huske_glimt_src_u ON huske_glimt_src(user_id, created_at);`);

const q = (s) => db.prepare(s);
const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const cap = (s) => String(s ?? '').replace(/^\s*./, (c) => c.toUpperCase());
const KEEP = 60;
export const AI_MS41 = 60_000, AI_RETRIES41 = 2;
/** Bare for tester: (prompt, {attempt}) → {items:[…]} | null. null = vanlig AI-kjede. */
export const _ai41 = { impl: null, ms: null };

let migrated = false;
function migrate41() {
  migrate40();
  if (migrated) return;
  if (!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hl_tasks'").get()) return;
  if (!q('PRAGMA table_info(hl_tasks)').all().some((c) => c.name === 'src_id')) db.exec('ALTER TABLE hl_tasks ADD COLUMN src_id TEXT');
  migrated = true;
}

/* ---------------- Når trengs AI? ---------------- */

const CONNECT = /\b(før (?:vi|jeg|du|dere) (?:skal|må)|hvor (?:vi|jeg) (?:må|skal)|der (?:vi|jeg) (?:må|skal)|og så|og deretter|deretter|etterpå|siden|fordi|ettersom|men først|først)(?![\p{L}])/iu;
const words = (t) => String(t ?? '').trim().split(/\s+/).filter(Boolean).length;
/** true når beskjeden bør deles opp av AI (≥ 12 ord med må/skal/huske, koblinger eller flere setninger). */
export function needsAi41(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  const sentences = t.split(/[.!?]+\s+(?=\S)/).filter((s) => s.trim().length > 2).length;
  return (words(t) >= 12 && /\b(må|skal|huske|husk)\b/i.test(t)) || CONNECT.test(t) || sentences > 1;
}
/** Huskebeskjed fra søkefeltet på Hjem: «husk …», «påminn meg …», «legg til i huskeliste …», «ny oppgave …», eller ≥ 6 ord med må/skal/huske og vi/jeg/meg/oss. Ikke spørsmål. */
export function isHuskeMessage41(text) {
  const t = String(text ?? '').trim(), n = t.toLowerCase();
  if (!t || /\?\s*$/.test(t) || /^(hva|hvem|hvor|når|hvilke|hvilken|hvordan|hvorfor|kan du|er det|har jeg)\b/.test(n)) return false;
  if (/^(husk|påminn meg|minn meg på|legg (?:til )?i huskelist(?:a|en)|legg til i gjøremål|ny oppgave|nytt gjøremål)\b/.test(n)) return true;
  return words(t) >= 6 && /\b(må|skal|huske|husk)\b/.test(n) && /\b(vi|jeg|meg|oss)\b/.test(n);
}

/* ---------------- Lokal tolker (reserve) ---------------- */

const TYPO41 = { tilhengrern: 'tilhengeren', tilhengern: 'tilhengeren', tilhengren: 'tilhengeren', møbelerer: 'møbler', møbeler: 'møbler', møbelene: 'møblene', pakkke: 'pakke', butikkken: 'butikken' };
// Stedsnavn som får stor forbokstav (kjente norske og nordiske steder; AI-en retter resten).
const PLACES41 = ['oslo', 'toten', 'strømstad', 'bergen', 'trondheim', 'stavanger', 'drammen', 'hamar', 'gjøvik', 'lillehammer', 'hafjell', 'kongsberg', 'fredrikstad', 'sarpsborg', 'moss',
  'tønsberg', 'sandefjord', 'larvik', 'skien', 'kristiansand', 'tromsø', 'bodø', 'ålesund', 'molde', 'halden', 'asker', 'bærum', 'lillestrøm', 'ski', 'sverige', 'danmark', 'göteborg', 'gøteborg',
  'stockholm', 'københavn', 'trysil', 'geilo', 'beitostølen', 'norefjell', 'kragerø', 'arendal', 'grimstad', 'mandal', 'hemsedal', 'sjusjøen', 'valdres', 'hadeland', 'ringerike', 'hønefoss',
  'elverum', 'kongsvinger', 'jessheim', 'gardermoen', 'majorstuen', 'grünerløkka', 'frogner', 'amagerveien'];
const fixWords = (s) => s.split(/(\s+)/).map((w) => {
  const m = w.match(/^([\p{L}-]+)([.,;:!?]*)$/u);
  if (!m) return w;
  const low = m[1].toLowerCase();
  const fixed = TYPO41[low] ?? m[1];
  return (PLACES41.includes(low) ? cap(low) : fixed) + m[2];
}).join('');
const LEAD41 = /^\s*(?:(?:og|men|så)\s+)?(?:(?:vi|jeg|du|dere)\s+(?:må|skal)\s+|(?:må|skal)\s+(?:vi|jeg|du|dere)\s+|(?:må|skal)\s+|(?:vi|jeg|du|dere)\s+)?(?:(?:også|da|nok)\s+)?(?:huske\s+(?:å|på\s+å)\s+|husk\s+(?:å|på\s+å)\s+|påminn\s+meg\s+(?:om\s+)?(?:å\s+)?|minn\s+meg\s+på\s+(?:å\s+)?)?/i;
/** Én handling → kort tittel i imperativ («til toten» → «Kjør til Toten»). */
export function title41(piece) {
  let t = String(piece ?? '').replace(/[.!?]+$/, '').trim();
  t = t.replace(LEAD41, '').replace(/^(?:å\s+)/i, '').trim();
  t = fixWords(t);
  if (/^(til|hjem til)\s+\S/i.test(t)) t = `kjør ${t}`;
  else if (/^(på|i)\s+\p{Lu}/u.test(t)) t = `dra til ${t.replace(/^(på|i)\s+/i, '')}`;
  return imperative40(t).replace(/\s{2,}/g, ' ').trim().slice(0, 200);
}
const SPLIT41 = /\s*,?\s*\b(før (?:vi|jeg|du|dere) (?:skal|må)|før det|hvor (?:vi|jeg|du|dere) (?:må|skal)|der (?:vi|jeg) (?:må|skal)|og så|og deretter|deretter|og etterpå|etterpå|siden|fordi|ettersom|men først)(?![\p{L}])\s*/giu;
/**
 * Lokal oppdeling: «vi skal levere pakke på butikken før vi skal til toten hvor vi må huske å ta med tilhengrern hjem til oslo siden vi skal ha med møbelerer til strømstad»
 * → [{n:'Lever pakke på butikken'}, {n:'Kjør til Toten', after:0}, {n:'Ta med tilhengeren hjem til Oslo', after:1, note:'Skal ha med møbler til Strømstad'}]
 * → [{n, list:null, who:null, date, time, place, after, tags:[], note}]
 */
export function splitLocal41(text, today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  const sentences = String(text ?? '').replace(/\r/g, '').split(/(?:[.!?]+\s+)|\n+/).map((s) => s.trim().replace(/[.!?]+$/, '')).filter(Boolean);
  for (const s of sentences) {
    const parts = s.split(SPLIT41);
    // parts = [ledd, kobling, ledd, kobling, …]
    let rel = null;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i % 2 === 1) { rel = p.toLowerCase(); continue; }
      if (!p || !p.trim()) continue;
      if (/^(siden|fordi|ettersom)$/.test(rel ?? '') && out.length) {
        const note = cap(fixWords(p.trim().replace(/^(?:vi|jeg|du|dere)\s+/i, '')).replace(/[.!?]+$/, ''));
        const prev = out.at(-1);
        prev.note = prev.note ? `${prev.note}. ${note}` : note;
        continue;
      }
      const n = title41(p);
      if (n.length < 2) continue;
      const pt = parseTask37(p, today, { people: [] });
      const item = { n, list: null, who: null, date: pt.due ?? null, time: pt.time ?? null, urgent: !!pt.urgent, place: null, after: null, tags: [], note: null, rel };
      const pm = n.match(/\b(?:til|i|på|hos|fra)\s+(\p{Lu}[\p{L}-]+)/u);
      if (pm && PLACES41.includes(pm[1].toLowerCase())) item.place = pm[1];
      if (/^(før det|men først)$/.test(rel ?? '') && out.length) { out.splice(out.length - 1, 0, item); } // skal gjøres før det forrige
      else out.push(item);
      rel = null;
    }
  }
  out.forEach((x, i) => { x.after = i > 0 && out.length > 1 ? i - 1 : null; delete x.rel; });
  return out;
}

/* ---------------- AI ---------------- */

export function prompt41(text, { lists = [], people = [], today }) {
  const wd = new Date(`${today}T12:00:00Z`).toLocaleDateString('nb-NO', { weekday: 'long', timeZone: 'UTC' });
  return `I dag er ${wd} ${today}. Lister: ${lists.map((l) => l.name).join(', ') || 'Hjem'}. Familie: ${people.join(', ') || '–'}.\n`
    + 'Del beskjeden i ett punkt per handling eller sted, i riktig rekkefølge. Tittel kort i imperativ («Lever pakke på butikken», «Kjør til Toten»). '
    + 'Del også opp setninger koblet med «før vi skal», «hvor vi må», «og så». Begrunnelser («siden», «fordi») blir note på punktet de gjelder, ikke eget punkt. '
    + 'Rett åpenbare skrivefeil, stedsnavn med stor forbokstav. after = indeksen til punktet som må gjøres først. Ikke finn på noe.\n'
    + 'Svar KUN JSON {"items":[{"n":"…","list":"…","who":"…","date":"YYYY-MM-DD","time":"HH:MM","place":"…","after":0,"tags":["…"],"note":"…"}]}.\n'
    + `Beskjed: «${String(text).slice(0, 1500)}»`;
}
async function askAi(u, prompt, attempt) {
  if (_ai41.impl) return _ai41.impl(prompt, { attempt });
  const { run } = await import('./ai-run.js');
  const r = await run('glimt', { user: u, prompt, json: true, numPredict: 700, temperature: 0.1, timeoutMs: _ai41.ms ?? AI_MS41, title: 'Glimt · deler opp beskjed', background: true });
  return { ...(r.data ?? JSON.parse(String(r.text).match(/\{[\s\S]*\}/)?.[0] ?? '{}')), _engine: `${r.provider === 'ollama' ? 'Ollama' : r.provider === 'gemini' ? 'Gemini' : r.provider === 'groq' ? 'Groq' : r.provider} · ${r.model}` };
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(Object.assign(new Error('Tidsavbrudd'), { timeout: true })), ms); t.unref?.(); })]);
/** → {items, engine:'glimt'|'lokal', engineLabel} */
/** Prompt 42 (tasks-glimt42.js): liste-kontrakt {tasks:[…]}, ny prompt, lengdevakt og bedre lokal forhåndsdeling. */
export const _hooks42 = { prompt: null, normalize: null, guard: null, local: null, log: null };
export async function understand41(u, text, { lists = [], people = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const log = { input_len: String(text ?? '').length, model: null, tasks_count: 0, parse_ok: false, path: 'local' };
  const done = (r) => { log.tasks_count = r.items.length; if (r.engine === 'glimt') { log.path = 'ai'; log.model = r.engineLabel; } try { _hooks42.log?.(u, log); } catch { /* */ } return { ...r, log }; };
  if (needsAi41(text)) {
    const prompt = _hooks42.prompt?.(text, { lists, people: people.map((p) => p.first), today }) ?? prompt41(text, { lists, people: people.map((p) => p.first), today });
    for (let attempt = 0; attempt <= AI_RETRIES41; attempt++) {
      try {
        let j = await withTimeout(Promise.resolve(askAi(u, attempt && _hooks42.prompt ? `${prompt}\nSvar kun med gyldig JSON.` : prompt, attempt)), (_ai41.ms ?? AI_MS41) + 2000);
        if (_hooks42.normalize) j = _hooks42.normalize(j);
        if (j) log.parse_ok = true;
        if (_hooks42.guard && j && !_hooks42.guard(j)) continue; // lengdevakt: for lange titler / flere handlinger i én → nytt forsøk
        const ai = validateAi40(j, { lists, people });
        if (ai?.length) {
          const raw = Array.isArray(j.items) ? j.items : [];
          ai.forEach((x, i) => { const nt = raw[i]?.note; x.note = nt ? cap(String(nt).trim()).slice(0, 300) : null; x.n = fixWords(x.n); if (x.place) x.place = fixWords(String(x.place)); });
          return done({ items: ai, engine: 'glimt', engineLabel: j._engine ?? 'Glimt AI' });
        }
      } catch { /* nytt forsøk */ }
    }
  }
  const local = _hooks42.local?.(text, today) ?? splitLocal41(text, today);
  return done({ items: local, engine: 'lokal', engineLabel: 'Glimt · lokal (uten AI)' });
}

/* ---------------- Jobbene ---------------- */

let T = null; // hjelperne fra tasks.js (settes av mountGlimt41)
const queue = [];
let running = 0;
const MAX_PAR = 2;
const srcRow = (id) => q('SELECT * FROM huske_glimt_src WHERE id=?').get(id);
const first = (id) => String(userInfo(id)?.displayName ?? userInfo(id)?.name ?? '').split(/\s+/)[0] || null;
const iso = (t) => (t ? new Date(t).toISOString() : null);
function jobOut41(r) {
  if (!r) return null;
  const ids = parseJ(r.item_ids, []);
  const items = T ? ids.map((id) => T.byId(id)).filter(Boolean).map(T.itemOut) : [];
  return { jobId: r.id, srcId: r.id, placeholderId: r.id, state: r.state, text: r.text, list: r.list ?? null, origin: r.origin, engine: r.engine ?? null, items, tasks: items, count: ids.length,
    ...(r.state === 'done' && ids.length ? { undo: { token: r.id, method: 'POST', url: `/api/tasks/glimt/jobs/${r.id}/undo`, label: 'Angre' }, splitText: ids.length > 1 ? `Glimt delte beskjeden i ${ids.length} oppgaver` : null } : {}), // prompt 42
    ...(r.state === 'done' ? { message: doneText(ids.length, items) } : {}), ...(r.error ? { error: r.error } : {}), createdAt: iso(r.created_at), endedAt: iso(r.ended_at) };
}
const NUMW = ['null', 'ett', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti'];
function doneText(n, items = []) {
  const ordered = items.some((x) => x.after);
  return n === 1 ? `Glimt la til «${items[0]?.title ?? 'punktet'}»` : `Glimt lagde ${n <= 10 ? n : n} punkter${ordered ? ' i riktig rekkefølge' : ''}`;
}
const emit = (r) => { try { broadcast('glimt-job', jobOut41(r), [r.user_id]); } catch { /* sanntid er best effort */ } };
function prune(u) {
  const old = q('SELECT id FROM huske_glimt_src WHERE user_id=? ORDER BY created_at DESC LIMIT -1 OFFSET ?').pluck().all(u, KEEP);
  for (const id of old) { q('UPDATE hl_tasks SET src_id=NULL WHERE src_id=?').run(id); q('DELETE FROM huske_glimt_src WHERE id=?').run(id); }
}
/** Starter en bakgrunnsjobb. → {jobId, placeholder} */
export function startJob41(u, text, { list = null, origin = 'huske' } = {}) {
  if (!T) throw Object.assign(new Error('Gjøremål er ikke klart'), { status: 503 });
  migrate41();
  const t = String(text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 4000);
  if (!t) throw Object.assign(new Error('Skriv en beskjed til Glimt'), { status: 400 });
  if (list && !T.canSeeList(T.listRow(list), u)) throw Object.assign(new Error('Fant ikke listen'), { status: 404 });
  if (q("SELECT count(*) FROM huske_glimt_src WHERE user_id=? AND state IN ('queued','running')").pluck().get(u) >= 5) throw Object.assign(new Error('Glimt jobber allerede med flere beskjeder. Vent litt.'), { status: 429 });
  const id = 'hg' + randomBytes(7).toString('hex'), now = Date.now();
  const og = ['huske', 'home_search', 'chat', 'gjoremal'].includes(origin) ? origin : 'huske';
  q('INSERT INTO huske_glimt_src(id, user_id, text, created_at, list, origin, state) VALUES(?,?,?,?,?,?,?)').run(id, u, t, now, list, og, 'queued');
  prune(u);
  emit(srcRow(id));
  queue.push(id);
  pump();
  return { jobId: id, placeholder: { id, text: t, list, label: 'Glimt deler opp beskjeden …', startedAt: iso(now) } };
}
function pump() {
  while (running < MAX_PAR && queue.length) {
    const id = queue.shift();
    running++;
    runJob(id).catch((e) => console.warn('[gjøremål-glimt]', e.message)).finally(() => { running--; pump(); });
  }
}
/** Venter til jobben er ferdig (tester). */
export async function waitJob41(id, ms = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const r = srcRow(id); if (r && ['done', 'failed'].includes(r.state)) return jobOut41(r); await new Promise((res) => setTimeout(res, 20)); }
  return jobOut41(srcRow(id));
}
async function runJob(id) {
  let r = srcRow(id);
  if (!r) return;
  q("UPDATE huske_glimt_src SET state='running' WHERE id=?").run(id);
  emit(srcRow(id));
  const u = r.user_id;
  try {
    const lists = T.visibleLists(u);
    const people = listUsers().filter((x) => x.id !== u).map((x) => ({ id: x.id, first: String(x.displayName ?? x.name ?? '').split(/\s+/)[0] })).filter((p) => p.first);
    const today = T.today();
    let { items, engine, engineLabel } = await understand41(u, r.text, { lists, people, today });
    if (!items.length) { const p = parseTask37(r.text, today, { people }); items = [{ n: p.title || cap(r.text).slice(0, 200), date: p.due ?? null, time: p.time ?? null, after: null, tags: p.tags ?? [], note: null }]; }
    if (!srcRow(id) || srcRow(id).deleted) return;
    const base = r.list ? T.listRow(r.list) : T.listRow(T.defaultList(u));
    const rows = [];
    db.transaction(() => {
      for (const it of items) {
        const l = (it.list ? T.listByWord(u, it.list) : null) ?? base;
        const fields = { title: it.n, list: l?.id, due: it.date ?? null, time: it.time ?? null, urgent: !!it.urgent, tags: it.tags ?? [], ...(it.note ? { note: it.note } : {}) };
        if (it.who && l && T.canSeeList(l, it.who.userId)) fields.assignee = it.who.userId;
        rows.push(T.add(u, fields));
      }
      items.forEach((it, i) => q('UPDATE hl_tasks SET src_id=?, place_name=COALESCE(?, place_name), after_id=? WHERE id=?')
        .run(id, it.place ?? null, it.after !== null && it.after !== undefined ? rows[it.after]?.id ?? null : null, rows[i].id));
    })();
    for (const row of rows) { const nr = T.byId(row.id); T.send(T.audienceOfTask(nr), 'updated', { item: T.itemOut(nr) }); }
    q("UPDATE huske_glimt_src SET state='done', engine=?, item_ids=?, ended_at=?, error=NULL WHERE id=?").run(engineLabel ?? engine, JSON.stringify(rows.map((x) => x.id)), Date.now(), id);
    r = srcRow(id);
    emit(r);
    const out = jobOut41(r);
    try { await notifyUser(u, { title: 'Glimt', body: `${out.message}. Trykk for å se dem i «Laget med Glimt».`, url: `/#/huske?glimt=${id}`, tag: `huske-glimt-${id}`, category: 'ai', data: { kind: 'tasks.glimt', jobId: id, srcId: id, deepLink: `finanshub://huske?glimt=${id}` } }, { realtime: false }); } catch { /* */ }
  } catch (e) {
    q("UPDATE huske_glimt_src SET state='failed', error=?, ended_at=? WHERE id=?").run(String(e.message).slice(0, 300), Date.now(), id);
    emit(srcRow(id));
  }
}

/** origin på oppgaven (itemOut i tasks.js). */
export function origin41(r) {
  if (!r?.src_id) return {};
  const s = srcRow(r.src_id);
  return s && !s.forgotten ? { origin: { id: s.id, text: s.text, at: iso(s.created_at), engine: s.engine ?? null }, srcId: s.id } : {};
}

/* ---------------- Rutene ---------------- */

export function mountGlimt41(api, helpers) {
  const { q: tq, listRow, canSeeList, listsOf, itemOut, byId, cleanTask, insertTask, send, audienceOfTask, defaultList, today } = helpers;
  const listByWord = (u, word) => { if (!word) return null; const w = String(word).toLowerCase().trim(); return listsOf(u).find((l) => l.name.toLowerCase() === w || l.id === word) ?? null; };
  const add = (u, fields) => {
    const l = listRow(fields.list) ?? listRow(defaultList(u));
    const b = { ...fields, list: l?.id ?? '', glimt: true };
    if (b.assignee && !(l && canSeeList(l, b.assignee))) delete b.assignee;
    return insertTask(u, cleanTask(b, false, u, l?.id));
  };
  T = { q: tq, listRow, canSeeList, visibleLists: listsOf, itemOut, byId, send, audienceOfTask, defaultList, today, listByWord, add };
  const fail = (c, e) => c.json({ error: e.message }, e.status ?? 400);

  api.post('/glimt', async (c, next) => {
    const b = await c.req.json().catch(() => ({}));
    if (b?.async !== true || b.image || b.action) return next();
    try { return c.json(startJob41(c.get('user'), String(b.q ?? b.text ?? ''), { list: b.list ?? null, origin: b.origin ?? 'huske' }), 202); } catch (e) { return fail(c, e); }
  });
  api.get('/glimt/jobs', (c) => {
    migrate41();
    const u = c.get('user');
    const rows = q("SELECT * FROM huske_glimt_src WHERE user_id=? AND (state IN ('queued','running') OR id IN (SELECT id FROM huske_glimt_src WHERE user_id=? ORDER BY created_at DESC LIMIT 10)) ORDER BY created_at DESC").all(u, u);
    return c.json({ jobs: rows.map(jobOut41) });
  });
  // Prompt 42: én Angre for hele delingen – punktene jobben laget slettes, og én oppgave med originalteksten kommer tilbake.
  api.post('/glimt/jobs/:id/undo', (c) => {
    const u = c.get('user'), r = srcRow(c.req.param('id'));
    if (!r || r.user_id !== u) return c.json({ error: 'Fant ikke jobben' }, 404);
    if (r.state !== 'done') return c.json({ error: 'Glimt er ikke ferdig med beskjeden ennå' }, 409);
    const ids = parseJ(r.item_ids, []);
    let deleted = 0, listId = null;
    for (const id of ids) { const t = byId(id); if (t && t.src_id === r.id) { listId ??= t.list_id ?? t.list ?? null; tq('DELETE FROM hl_tasks WHERE id=?').run(id); send(audienceOfTask(t), 'deleted', { id }); deleted++; } }
    const row = add(u, { title: cap(r.text).slice(0, 200), list: r.list ?? listId ?? undefined });
    const nr = byId(row.id);
    send(audienceOfTask(nr), 'created', { item: itemOut(nr) });
    q("UPDATE huske_glimt_src SET forgotten=1, state='undone' WHERE id=?").run(r.id);
    emit(srcRow(r.id));
    return c.json({ ok: true, deleted, restored: itemOut(nr), text: 'Angret · én oppgave med originalteksten' });
  });
  api.get('/glimt/jobs/:id', (c) => { const r = srcRow(c.req.param('id')); return r && r.user_id === c.get('user') ? c.json(jobOut41(r)) : c.json({ error: 'Fant ikke jobben' }, 404); });
  api.get('/glimt/sources', (c) => {
    migrate41();
    const u = c.get('user');
    const rows = q("SELECT * FROM huske_glimt_src WHERE user_id=? AND state='done' AND forgotten=0 ORDER BY created_at DESC LIMIT ?").all(u, KEEP);
    const sources = rows.map((r) => {
      const ids = parseJ(r.item_ids, []);
      const items = ids.map((id) => byId(id)).filter((x) => x && x.src_id === r.id);
      return { id: r.id, text: r.text, createdAt: iso(r.created_at), engine: r.engine, engineLabel: /lokal/i.test(r.engine ?? '') ? 'Glimt (uten AI)' : 'Glimt AI', by: { id: u, name: first(u) }, origin: r.origin,
        count: items.length, deleted: Math.max(0, ids.length - items.length), items: items.map((x, i) => ({ ...itemOut(x), step: { n: i + 1 } })) };
    }).filter((s) => s.count || s.deleted);
    return c.json({ sources, count: sources.length });
  });
  api.post('/glimt/sources/:id/redo', (c) => {
    const u = c.get('user'), r = srcRow(c.req.param('id'));
    if (!r || r.user_id !== u) return c.json({ error: 'Fant ikke beskjeden' }, 404);
    for (const id of parseJ(r.item_ids, [])) { const t = byId(id); if (t && !t.done && t.src_id === r.id) { tq('DELETE FROM hl_tasks WHERE id=?').run(id); send(audienceOfTask(t), 'deleted', { id }); } }
    q('UPDATE huske_glimt_src SET forgotten=1 WHERE id=?').run(r.id);
    try { return c.json(startJob41(u, r.text, { list: r.list, origin: r.origin }), 202); } catch (e) { return fail(c, e); }
  });
  api.delete('/glimt/sources/:id', (c) => {
    const u = c.get('user'), r = srcRow(c.req.param('id'));
    if (!r || r.user_id !== u) return c.json({ error: 'Fant ikke beskjeden' }, 404);
    q('UPDATE huske_glimt_src SET forgotten=1 WHERE id=?').run(r.id);
    return c.json({ ok: true });
  });
}
