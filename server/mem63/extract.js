// Prompt 63 (prompt 49 del 5, D5SRV): forslag til nye fakta fra dagens kilder – BARE brukerens egne:
//   conversation – dagens Glimt-forespørsler (sporet glimt47_trace) og samtaletilstanden (glimt60_convo, brukerens egne turer)
//   correction   – rettelser fra del 1 («nei, jeg mente …», recipe_runs)
//   calendar     – nye kalenderhendelser med personer/steder («Frisør hos Nina»)
// To veier, begge må være forankret i kildeteksten (navnet og verdien står i teksten – ellers forkastes forslaget):
//   1. faste mønstre i kode («Kari er søsteren min», «middag med Kari, søsteren min», «min søster Kari», «Frisør hos Nina»),
//   2. den lokale modellen via gaten (bakgrunnsprioritet, think:false, JSON-schema, localOnly – «finansdata forlater aldri huset»).
// Kjente fakta, åpne forslag og tidligere avviste forslag foreslås aldri på nytt.
import { db, kv } from '../db.js';
import { hasWord47, words47 } from '../glimt45/words47.js';
import { normName } from '../../public/js/quick-time.js';
import { DIN, typeOfWord } from '../glimt-memory.js';
import { memRows63, keyOf63, pendingByKey63, classify63 } from './store.js';

const q = (sql) => db.prepare(sql);
const DAY = 86400_000;
export const MAX_SNIPPETS63 = 40, MAX_PROPOSALS63 = 10;
const clip = (s, n = 300) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)} …` : t; };

/* ---------------- Kilder ---------------- */

let calImpl = null, modelImpl = null;
/** Bare for tester: falske kalenderhendelser (user, from, to) → [{id, title, date, location, note, created}] og falsk modell (prompt, snippets) → {facts:[…]}. */
export const _setSources63 = ({ calendar, model } = {}) => { if (calendar !== undefined) calImpl = calendar; if (model !== undefined) modelImpl = model; };

const isCorrection = (t) => /^\s*(?:nei|næ|neida|feil)\b[\s,.!:–-]*(?:jeg\s+)?(?:mente|mener|tenkte\s+på|ville\s+ha|spurte\s+om)?/i.test(t);

/** Dagens tekster fra Glimt for brukeren. → [{kind:'message'|'correction', source, text, at}] */
export function conversationSnippets63(user, since) {
  const out = [], seen = new Set();
  const add = (kind, text, at) => {
    const t = clip(text, 400);
    if (t.length < 6 || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push({ kind, source: kind === 'correction' ? 'correction' : 'conversation', text: t, at });
  };
  try {
    for (const r of q('SELECT created, data FROM glimt47_trace WHERE user_id=? AND created>=? ORDER BY created').all(user, since)) {
      let d; try { d = JSON.parse(r.data); } catch { continue; }
      if (d?.user && d.user !== user) continue;
      const m = String(d?.message ?? '');
      add(isCorrection(m) ? 'correction' : 'message', m, r.created);
    }
  } catch { /* ingen spor-tabell */ }
  try {
    for (const r of q('SELECT state, updated FROM glimt60_convo WHERE user_id=? AND updated>=?').all(user, since)) {
      let st; try { st = JSON.parse(r.state); } catch { continue; }
      for (const t of st?.turns ?? []) if (t?.u) add(isCorrection(t.u) ? 'correction' : 'message', t.u, r.updated);
    }
  } catch { /* */ }
  // Rettelser fra del 1 (oppskriftene): kjøringene som var rettelser.
  try {
    for (const r of q('SELECT text, created FROM recipe_runs WHERE user_id=? AND created>=? ORDER BY created').all(user, since)) if (isCorrection(r.text)) add('correction', r.text, r.created);
  } catch { /* */ }
  return out;
}

const SEEN_KEY = 'mem63_seen_events';
/** Nye kalenderhendelser (ikke sett av nattjobben før, eller laget siste døgn). → [{kind:'event', source:'calendar', text, at, ref}] */
export async function calendarSnippets63(user, now, { mark = true } = {}) {
  const day = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).slice(0, 10);
  let events = [];
  try {
    if (calImpl) events = await calImpl(user, day(now - DAY), day(now + 60 * DAY));
    else { const { eventsFor } = await import('../calendar.js'); events = (await eventsFor(user, day(now - DAY), day(now + 60 * DAY)))?.events ?? []; }
  } catch { return []; }
  let seen = null;
  try { seen = kv.get(user, SEEN_KEY, null); } catch { /* */ }
  const first = !Array.isArray(seen);
  const set = new Set(first ? [] : seen);
  const out = [];
  for (const e of events ?? []) {
    const id = String(e?.id ?? '').split('~')[0];
    if (!id || set.has(id)) continue;
    set.add(id);
    const created = Date.parse(e.created ?? '') || null;
    // Første kjøring: bare hendelser laget siste døgn (resten merkes som sett, så det ikke kommer en flom av forslag).
    if (first && !(created && now - created < DAY)) continue;
    const text = clip([e.title, e.location, e.note].filter(Boolean).join(' – '), 300);
    if (text.length >= 4) out.push({ kind: 'event', source: 'calendar', text, at: created ?? now, ref: id });
  }
  if (mark) try { kv.set(user, SEEN_KEY, [...set].slice(-3000)); } catch { /* */ }
  return out;
}

/* ---------------- Mønstre i kode ---------------- */

const NAME = "(\\p{Lu}[\\p{Ll}\\p{Lu}'’-]+(?:\\s+\\p{Lu}[\\p{Ll}'’-]+)?)";
const REL = '([\\p{Ll}-]{3,30})';
const OWN = '(min|mi|mitt)';
const NOT_NAMES = new Set(['jeg', 'det', 'den', 'dette', 'denne', 'han', 'hun', 'vi', 'de', 'du', 'dere', 'hva', 'hvem', 'hvor', 'når', 'hvorfor', 'hvordan', 'glimt', 'hei', 'husk', 'nei', 'ja',
  'og', 'men', 'så', 'kan', 'vil', 'skal', 'må', 'i', 'på', 'til', 'med', 'hos', 'fra', 'min', 'mi', 'mitt', 'mine', 'neste', 'forrige', 'middag', 'lunsj', 'møte', 'time', 'mandag', 'tirsdag', 'onsdag',
  'torsdag', 'fredag', 'lørdag', 'søndag', 'i dag', 'i morgen', 'frisør', 'lege', 'tannlege']);
const NOT_ROLES = new Set(['glad', 'syk', 'ferdig', 'borte', 'hjemme', 'klar', 'sen', 'her', 'der', 'også', 'ikke', 'bare', 'veldig', 'egentlig', 'helt', 'litt']);
const PATTERNS = [
  [new RegExp(`${NAME}\\s+er\\s+${OWN}\\s+${REL}(?![\\p{L}])`, 'gu'), (m) => [m[1], `${m[2]} ${m[3]}`]],               // Kari er min søster
  [new RegExp(`${NAME}\\s+er\\s+${REL}\\s+${OWN}(?![\\p{L}])`, 'gu'), (m) => [m[1], `${m[2]} ${m[3]}`]],               // Kari er søsteren min
  [new RegExp(`${NAME},\\s+${REL}\\s+${OWN}(?![\\p{L}])`, 'gu'), (m) => [m[1], `${m[2]} ${m[3]}`]],                    // Kari, søsteren min,
  [new RegExp(`(?<![\\p{L}])${OWN}\\s+${REL}\\s+${NAME}`, 'gu'), (m) => [m[3], `${m[1]} ${m[2]}`]],                    // min søster Kari
  [new RegExp(`(?<![\\p{L}])${REL}\\s+${OWN},?\\s+${NAME}`, 'gu'), (m) => [m[3], `${m[1]} ${m[2]}`]],                  // søsteren min Kari
];
const TYPE_RE = new RegExp(`(?<![\\p{L}])(\\p{L}{4,20})\\s+(?:hos|med|til)\\s+(\\p{Lu}[\\p{Ll}'’-]+(?:\\s+\\p{Lu}[\\p{Ll}'’-]+)?)`, 'gu');
const TYPE_OF = { frisørtime: 'frisør', hårklipp: 'frisør', klipp: 'frisør', tannlegetime: 'tannlege', legetime: 'lege', fastlege: 'lege', fysioterapeut: 'fysio', kiropraktor: 'fysio', naprapat: 'fysio' };

/** Kandidater i én tekst. → [{subject, object}] */
export function patternFacts63(text) {
  const t = String(text ?? '');
  const out = [];
  for (const [re, f] of PATTERNS) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const [subject, object] = f(m);
      const role = object.split(' ').find((w) => !/^(?:min|mi|mitt)$/.test(w));
      if (!subject || NOT_NAMES.has(subject.toLowerCase()) || NOT_NAMES.has(subject.split(/\s+/)[0].toLowerCase()) || NOT_ROLES.has(role)) continue;
      out.push({ subject: subject.trim(), object: object.trim(), via: 'mønster' });
    }
  }
  TYPE_RE.lastIndex = 0;
  for (const m of t.matchAll(TYPE_RE)) {
    const w = m[1].toLowerCase(), name = m[2].trim();
    const type = TYPE_OF[w] ?? TYPE_OF[w.replace(/(?:en|a|et)$/, '')] ?? typeOfWord(w);
    if (!type || type === 'annet' || NOT_NAMES.has(name.toLowerCase())) continue;
    out.push({ subject: name, object: (DIN[type] ?? `${type} din`).replace(/ din$/, ' min'), via: 'mønster' });
  }
  return out;
}

/* ---------------- Forankring ---------------- */

const POSS_W = new Set(['min', 'mi', 'mitt', 'mine', 'en', 'ei', 'et', 'vår', 'vårt']);
/** Står navnet og verdien i kildeteksten? (Gjetninger lagres aldri.) */
export function grounded63(text, subject, object) {
  if (!subject || !object || String(subject).length < 2) return false;
  if (!hasWord47(text, subject, { suffix: true })) return false;
  const ws = words47(object).filter((w) => !POSS_W.has(w));
  if (!ws.length) return false;
  // Typer («fysioterapeuten min»): godtatt når et typeord i teksten gir samme type («Fysio hos Siri»).
  const cls = classify63(object);
  if (cls.kind === 'alias' && words47(text).some((w) => (TYPE_OF[w] ?? TYPE_OF[w.replace(/(?:en|a|et)$/, '')] ?? typeOfWord(w)) === cls.type)) return true;
  // Verdien: hvert innholdsord (med bøying: «søster» ≈ «søsteren») står i teksten; typeordene fra mønsteret («frisøren») godtas via stammen.
  return ws.every((w) => hasWord47(text, w, { suffix: true }) || hasWord47(text, w.replace(/(?:ene|en|et|a)$/, ''), { suffix: true }));
}

/* ---------------- Modellen (gaten) ---------------- */

export const SCHEMA63 = {
  type: 'object',
  properties: { facts: { type: 'array', maxItems: 10, items: { type: 'object', properties: { subject: { type: 'string' }, object: { type: 'string' }, source: { type: 'integer' } }, required: ['subject', 'object', 'source'] } } },
  required: ['facts'],
};
const SYSTEM63 = 'You extract durable personal facts for a Norwegian assistant\'s memory. Only facts the user states explicitly about a named person, place or business and how it relates to the user '
  + '(e.g. "Kari er søsteren min" → subject "Kari", object "søsteren min"; "Frisør hos Nina" → subject "Nina", object "frisøren min"). Never guess, never infer, no opinions, no money/finance details, '
  + 'no one-off plans. Copy names and words exactly as written (Norwegian). source = the number of the snippet. If nothing qualifies, return {"facts":[]}.';

async function modelFacts(user, snippets) {
  const list = snippets.slice(0, MAX_SNIPPETS63);
  const prompt = `Snippets (the user's own words today):\n${list.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}\n\nReturn JSON {"facts":[{"subject","object","source"}]}.`;
  let data;
  if (modelImpl) data = await modelImpl(prompt, list);
  else {
    const { run } = await import('../ai-run.js');
    const r = await run('glimt', { user, system: SYSTEM63, prompt, schema: SCHEMA63, json: true, localOnly: true, background: true, think: false, temperature: 0, numPredict: 500, noRetry: true,
      timeoutMs: 120_000, title: 'Glimt · nattlig oppsummering av minnet' });
    data = r.data;
    data = { ...(data ?? {}), _model: r.model ?? null };
  }
  const facts = Array.isArray(data?.facts) ? data.facts : [];
  return { model: data?._model ?? (modelImpl ? 'test' : null), facts: facts.filter((f) => f && typeof f.subject === 'string' && typeof f.object === 'string' && Number.isInteger(f.source))
    .map((f) => ({ subject: f.subject.trim().slice(0, 80), object: f.object.trim().slice(0, 200), snippet: list[f.source - 1] ?? null, via: 'modell' })).filter((f) => f.snippet) };
}

/**
 * Forslag fra kildene. → {proposals:[{subject, object, aliases, source, evidence, reason}], sources:{messages, corrections, events}, model, modelError}
 * opts.useModel:false = bare mønstrene (f.eks. når den lokale modellen ikke finnes).
 */
export async function propose63(user, { now = Date.now(), since = now - DAY, useModel = true, markEvents = true } = {}) {
  const conv = conversationSnippets63(user, since);
  const cal = await calendarSnippets63(user, now, { mark: markEvents });
  const snippets = [...conv, ...cal];
  const sources = { messages: conv.filter((s) => s.kind === 'message').length, corrections: conv.filter((s) => s.kind === 'correction').length, events: cal.length };
  const cands = [];
  for (const s of snippets) for (const f of patternFacts63(s.text)) cands.push({ ...f, snippet: s });
  let model = null, modelError = null;
  if (useModel && snippets.length) {
    try { const m = await modelFacts(user, snippets); model = m.model; cands.push(...m.facts); } catch (e) { modelError = String(e?.message ?? e).slice(0, 200); }
  }
  const known = new Set(memRows63(user).map((m) => keyOf63(m.match, m.object, m.type)));
  const knownFacts = memRows63(user);
  const out = [], keys = new Set();
  for (const c of cands) {
    if (out.length >= MAX_PROPOSALS63) break;
    if (!grounded63(c.snippet.text, c.subject, c.object)) continue;
    const cls = classify63(c.object);
    const key = keyOf63(c.subject, c.object, cls.type);
    if (keys.has(key) || known.has(key) || pendingByKey63(user, key)) continue;
    // Samme setning lagret som fritekst («Kari er søsteren min» som note): kjent.
    if (knownFacts.some((m) => normName(m.match) === normName(c.subject) && normName(m.object).includes(normName(c.object).replace(/\s+(?:min|mi|mitt)$/, '')))) continue;
    keys.add(key);
    const s = c.snippet;
    const when = s.kind === 'event' ? 'i en ny kalenderhendelse' : s.kind === 'correction' ? 'i en rettelse til Glimt' : 'i en samtale med Glimt';
    out.push({ subject: c.subject, object: c.object, aliases: [], source: s.source, evidence: [{ kind: s.kind, text: s.text, at: s.at ? new Date(s.at).toISOString() : null }],
      reason: `Du skrev det ${when}${c.via === 'modell' ? ' (funnet av den lokale modellen)' : ''}` });
  }
  return { proposals: out, sources, model, modelError };
}
