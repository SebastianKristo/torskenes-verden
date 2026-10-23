// Prompt 40 (SERVER40): Glimt i Gjøremål forstår setninger og lager riktige punkter (claude-code-huskeliste-glimt-forstar.md).
// Kalles fra tasks-glimt37.js (addFromText) for tekst med flere handlinger eller en nevnt person. Enkle ting går som før.
//
// «Jeg må huske å ta med noen pakker og møbeler til Strømstad men først må jeg levere pakken» →
//   1. Lever pakken · Mine · #pakke #strømstad · først
//   2. Ta med noen pakker og møbler til Strømstad · Mine · sted Strømstad · #strømstad · after = «Lever pakken»
//   «Lagde 2 punkter for Strømstad, i riktig rekkefølge.» + Angre (fjerner begge)
//
// Motor: først Glimt (lokal modell, run('glimt', json, 6 s), svar KUN {"items":[{n, list, who, date, time, place, after, tags}]}, alt valideres),
// så den lokale tolkeren splitLocal40 (samme resultat som eksempelet over, uten nett).
// Datamodell (additivt): hl_tasks.place_name (fritt sted), place_lat/place_lng, after_id (punktet som skal gjøres først), mentions ('["<bruker-id>"]').
// Svaret fra POST /api/tasks/glimt: {kind:'add', intent:'tasks.multi', text, items:[oppgave + placeName, after, mentions, step:{n, label}], undo, engine:'glimt'|'lokal'}
//   oppgave.who = {userId, name} når en person er nevnt (assignee = personen når hen ser lista), mentions = [bruker-id].
import { db } from './db.js';
import { keepUserWords46 } from './glimt45/tasks46.js'; // prompt 46: brukerens egne ord i titlene
import { parseTask37 } from './tasks-glimt37.js';
import { notifyUser } from './notify.js';
import { userInfo } from './auth.js';

const hasCol = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
let migrated = false;
/** Nye kolonner (additivt). Kjøres første gang de trengs (tasks.js lager tabellen etter at denne modulen er lastet). */
export function migrate40() {
  if (migrated) return;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hl_tasks'").get()) return;
  for (const [col, def] of [['place_name', 'TEXT'], ['place_lat', 'REAL'], ['place_lng', 'REAL'], ['after_id', 'INTEGER'], ['mentions', "TEXT NOT NULL DEFAULT '[]'"]]) if (!hasCol('hl_tasks', col)) db.exec(`ALTER TABLE hl_tasks ADD COLUMN ${col} ${def}`);
  migrated = true;
}

const cap = (s) => String(s ?? '').replace(/^\s*./, (c) => c.toUpperCase());
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WD = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const NOT_PLACE = new Set([...WD, ...MONTHS, 'jul', 'påske', 'helgen', 'morgen', 'dag', 'kveld', 'natt']);
// Rekkefølge: «før»-ord betyr at setningsleddet skal gjøres FØR det forrige; «etter»-ord at det kommer etter.
const BEFORE = ['men aller først', 'men først', 'aller først', 'men før det', 'før det', 'først'];
const AFTER = ['og etter det', 'etter det', 'og deretter', 'deretter', 'og etterpå', 'etterpå', 'og så', 'til slutt', 'så'];
const MARK_RE = new RegExp(`(?:^|[\\s,;]+)(${[...BEFORE, ...AFTER].sort((a, b) => b.length - a.length).map(esc).join('|')})(?=\\s)`, 'gi');
const LEAD = /^\s*(?:(?:og|men)\s+)?(?:jeg\s+må\s+huske\s+(?:å|på\s+å)\s+|husk\s+(?:å|på\s+å)\s+|påminn\s+meg\s+(?:om\s+)?(?:å\s+)?|minn\s+meg\s+på\s+(?:å\s+)?|jeg\s+må\s+|jeg\s+skal\s+|må\s+jeg\s+|skal\s+jeg\s+|vi\s+må\s+|må\s+vi\s+|må\s+|skal\s+)/i;
const VERBS = { levere: 'Lever', hente: 'Hent', ringe: 'Ring', kjøpe: 'Kjøp', sende: 'Send', bestille: 'Bestill', kjøre: 'Kjør', betale: 'Betal', vaske: 'Vask', rydde: 'Rydd',
  lage: 'Lag', handle: 'Handle', pakke: 'Pakk', bytte: 'Bytt', skrive: 'Skriv', svare: 'Svar', lese: 'Les', huske: 'Husk', fikse: 'Fiks', møte: 'Møt', følge: 'Følg', legge: 'Legg', sette: 'Sett', spørre: 'Spør', gå: 'Gå', ta: 'Ta', gi: 'Gi', få: 'Få', se: 'Se', dra: 'Dra', si: 'Si' };
const TYPO = { møbeler: 'møbler', møbelene: 'møblene' };

/** Infinitiv → imperativ for første ord (levere → Lever, hente → Hent, -ere → -er). */
export function imperative40(s) {
  const m = String(s ?? '').trim().match(/^(\S+)(.*)$/s);
  if (!m) return '';
  const w = m[1].toLowerCase();
  let v = VERBS[w];
  if (!v && /ere$/.test(w) && w.length > 4) v = cap(w.slice(0, -1));
  return `${v ?? cap(m[1])}${m[2]}`;
}
const DATE_WORDS = new RegExp(`\\s*\\b(?:(?:på|til|innen|den|neste)\\s+)?(?:i\\s+dag|i\\s+morgen|i\\s+overmorgen|neste\\s+uke|${WD.join('|')})\\b|\\s*\\b(?:den\\s+)?\\d{1,2}\\.\\s?\\d{1,2}(?:\\.\\d{2,4})?\\b|\\s*\\b(?:kl\\.?|klokka|klokken)\\s*\\d{1,2}(?:[.:]\\d{2})?\\b|\\s*\\b(?:viktig|haster)\\b`, 'gi');
/** Tittel: «jeg må huske å …» fjernes, dato/tid fjernes, imperativ, enkle skrivefeil rettes. */
export function title40(clause) {
  let t = String(clause ?? '').replace(LEAD, '').replace(LEAD, '');
  t = t.replace(DATE_WORDS, '').replace(/#[\p{L}\p{N}_-]+/gu, '');
  t = t.split(/\s+/).map((w) => TYPO[w.toLowerCase()] ?? w).join(' ');
  t = t.replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  return imperative40(t).slice(0, 200);
}
/** Sted: «til/i/på/hos/ved/fra + Stort ord» (ikke ukedager, måneder eller personer). */
export function placeOf40(clause, people = []) {
  const names = new Set(people.map((p) => String(p.first ?? '').toLowerCase()).filter(Boolean));
  for (const m of String(clause ?? '').matchAll(/\b(?:til|i|på|hos|ved|fra)\s+((?:[A-ZÆØÅ][\p{L}\p{N}-]*)(?:\s+[A-ZÆØÅ0-9][\p{L}\p{N}-]*)?)/gu)) {
    const p = m[1].trim(), low = p.toLowerCase();
    if (NOT_PLACE.has(low) || names.has(low.split(/\s+/)[0])) continue;
    return p;
  }
  return null;
}
const personIn = (clause, people) => people.find((p) => p.first && p.first.length >= 2 && new RegExp(`(^|[\\s,(@])${esc(p.first)}(?=$|[\\s,.)!?'’s])`, 'i').test(clause)) ?? null;
const listHint = (clause) => {
  const t = clause.toLowerCase();
  if (/\bhytt(a|e|en)\b/.test(t)) return 'Hytta';
  if (/\b(melk|egg|brød|kaffe|handle|dagligvare|handleliste)\b/.test(t)) return 'Handel';
  if (/\bjobb(en)?\b|\bmøte\b|\brapport\b|\bkontor/.test(t)) return 'Jobb';
  return null;
};

/** Deler teksten i setningsledd med rekkefølge. → [{text, rel:'before'|'after'|null, sentence}] */
export function clauses40(text) {
  const out = [];
  const sentences = String(text ?? '').replace(/\r/g, '').split(/(?:[.!?;]+\s+(?=[A-ZÆØÅa-zæøå]))|\n+/).map((x) => x.trim().replace(/[.!?]+$/, '')).filter(Boolean);
  sentences.forEach((s, si) => {
    const parts = [];
    let last = 0, rel = null, m;
    MARK_RE.lastIndex = 0;
    while ((m = MARK_RE.exec(s))) {
      const before = s.slice(last, m.index).trim();
      // «så» og «først» midt i et ledd uten verb etter teller ikke (f.eks. «så fort som mulig»).
      if (/^så$/i.test(m[1]) && !/^\s*(?:må|skal|kan)?\s*(?:jeg|vi)?\s*\p{L}+e\b/iu.test(s.slice(m.index + m[0].length))) continue;
      if (before) parts.push({ text: before, rel, sentence: si });
      rel = BEFORE.includes(m[1].toLowerCase()) ? 'before' : 'after';
      last = m.index + m[0].length;
    }
    const rest = s.slice(last).trim();
    if (rest) parts.push({ text: rest, rel: parts.length || si ? rel ?? (si ? 'after' : null) : rel, sentence: si });
    out.push(...parts);
  });
  // Flere setninger med «må/skal» = flere punkter (rekkefølge som skrevet).
  return out.filter((p) => title40(p.text).length > 1);
}

/** Lokal tolker (gLocal). → [{n, list?, who?:{userId, name}, date?, time?, urgent?, place?, after?:index, tags:[]}] (tom = ikke flere punkter) */
export function splitLocal40(text, today, { people = [] } = {}) {
  const cl = clauses40(text);
  const hasPerson = cl.some((c) => personIn(c.text, people));
  if (cl.length < 2 && !hasPerson) return [];
  // Rekkefølge: «før»-ledd flyttes foran det forrige.
  const ordered = [];
  for (const c of cl) { if (c.rel === 'before' && ordered.length) ordered.splice(ordered.length - 1, 0, c); else ordered.push(c); }
  // Dato/tid gjelder alle ledd fra samme setning.
  const bySentence = new Map();
  for (const c of cl) { if (bySentence.has(c.sentence)) continue; const whole = cl.filter((x) => x.sentence === c.sentence).map((x) => x.text).join(' '); bySentence.set(c.sentence, parseTask37(whole, today, { people: [] })); }
  const items = ordered.map((c, i) => {
    const p = bySentence.get(c.sentence) ?? {};
    const person = personIn(c.text, people);
    const tags = [...new Set([...(p.tags ?? []), ...(/\bpakken?\b/i.test(c.text) ? ['pakke'] : [])])];
    return { n: title40(c.text), list: listHint(c.text), who: person ? { userId: person.id, name: person.first } : null, date: p.due ?? null, time: p.time ?? null, urgent: !!p.urgent,
      place: placeOf40(c.text, people), after: ordered.length > 1 && i > 0 && (ordered.some((x) => x.rel) || cl.length > 1) ? i - 1 : null, tags };
  }).filter((x) => x.n);
  const places = [...new Set(items.map((x) => x.place).filter(Boolean))];
  if (items.length > 1 && places.length === 1) for (const x of items) { const tg = places[0].toLowerCase().replace(/\s+/g, '-'); if (!x.tags.includes(tg)) x.tags.push(tg); }
  return items;
}

/** Validerer et AI-svar {"items":[…]} mot listene og husstanden. → items i samme form som splitLocal40, eller null. */
export function validateAi40(j, { lists = [], people = [] } = {}) {
  const raw = Array.isArray(j?.items) ? j.items : null;
  if (!raw || raw.length < 1 || raw.length > 12) return null;
  const items = [];
  for (const it of raw) {
    const n = cap(String(it?.n ?? it?.title ?? '').trim()).slice(0, 200);
    if (n.length < 2) return null;
    const list = it.list ? lists.find((l) => l.name.toLowerCase() === String(it.list).toLowerCase())?.name ?? null : null;
    const pw = it.who ? people.find((p) => p.first.toLowerCase() === String(it.who?.name ?? it.who).replace(/^@/, '').toLowerCase()) : null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(it.date ?? '')) && !Number.isNaN(Date.parse(it.date)) ? it.date : null;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(it.time ?? '')) ? it.time : null;
    items.push({ n, list, who: pw ? { userId: pw.id, name: pw.first } : null, date, time, urgent: !!it.urgent, place: it.place ? String(it.place).slice(0, 60) : null,
      after: Number.isInteger(it.after) ? it.after : null, tags: Array.isArray(it.tags) ? it.tags.map((t) => String(t).replace(/^#/, '').toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 8) : [] });
  }
  for (let i = 0; i < items.length; i++) if (items[i].after !== null && (items[i].after < 0 || items[i].after >= items.length || items[i].after === i)) items[i].after = null;
  return items;
}

/** Glimt (lokal modell) først, så den lokale tolkeren. → {items, engine:'glimt'|'lokal'} */
export async function understand40(u, text, today, { people = [], lists = [], aiImpl = null } = {}) {
  const local = splitLocal40(text, today, { people });
  if (!local.length) return { items: [], engine: 'lokal' };
  try {
    const ask = aiImpl ?? (async (prompt) => { const { run } = await import('./ai-run.js'); return (await run('glimt', { user: u, prompt, json: true, localOnly: true, numPredict: 400, temperature: 0.1, timeoutMs: 6000, title: 'Glimt · gjøremål' })).data; });
    const wd = new Date(`${today}T12:00:00Z`).toLocaleDateString('nb-NO', { weekday: 'long', timeZone: 'UTC' });
    const prompt = `I dag er ${wd} ${today}. Brukeren er ${userInfo(u)?.displayName ?? 'meg'}. Lister: ${lists.map((l) => l.name).join(', ')}. Familie: ${people.map((p) => p.first).join(', ')}.\n`
      + 'Del teksten i ett punkt per handling. Tittel kort i imperativ. «først/før det» = skal gjøres før. after = indeksen til punktet som må gjøres først. '
      + 'Svar KUN JSON {"items":[{"n":"…","list":"…","who":"…","date":"YYYY-MM-DD","time":"HH:MM","place":"…","after":0,"tags":["…"]}]}.\n'
      + `Tekst: «${String(text).slice(0, 600)}»`;
    const j = await Promise.race([ask(prompt), new Promise((r) => setTimeout(() => r(null), 6500).unref?.())]);
    // Prompt 46 (GLIMT46): titler modellen skrev om, byttes med brukerens egne ord (glimt45/tasks46.js).
    const ai = keepUserWords46(text, validateAi40(j, { lists, people }), local);
    if (ai && ai.length >= local.length) return { items: ai, engine: 'glimt' };
  } catch { /* lokal tolker */ }
  return { items: local, engine: 'lokal' };
}

const stepLabel = (it, items) => (it.after === null || it.after === undefined ? (items.some((x) => x.after !== null) ? `${items.indexOf(it) + 1} · først` : `${items.indexOf(it) + 1}`) : `${items.indexOf(it) + 1} · etter «${items[it.after]?.n}»`);

/**
 * Lager punktene. T = hjelperne fra mountGlimt37 ({add, listRow, listByWord, canSeeList, defaultList, mkUndo, itemOut, byId, visibleLists}).
 * → svaret til POST /api/tasks/glimt, eller null når teksten ikke er flere punkter / ingen person.
 */
export async function multiAdd40(T, u, text, listId, today, { people = [] } = {}) {
  migrate40();
  const given = listId ? T.listRow(listId) : null;
  const lists = T.visibleLists(u);
  const { items, engine } = await understand40(u, text, today, { people, lists, aiImpl: T.aiImpl ?? null });
  if (!items.length) return null;
  const base = given ?? T.listRow(T.defaultList(u));
  const pickList = (it) => {
    let l = (it.list ? T.listByWord(u, it.list) : null) ?? base;
    // Nevnt person: punktet havner i en liste dere begge er med i (Hjem først) når den valgte ikke er delt.
    if (it.who && l && !T.canSeeList(l, it.who.userId)) l = lists.find((x) => x.name === 'Hjem' && T.canSeeList(x, it.who.userId)) ?? lists.find((x) => T.canSeeList(x, it.who.userId)) ?? l;
    return l;
  };
  const rows = [];
  db.transaction(() => {
    items.forEach((it) => {
      const l = pickList(it);
      const r = T.add(u, { title: it.n, list: l?.id, due: it.date, time: it.time, urgent: it.urgent, tags: it.tags, ...(it.who && l && T.canSeeList(l, it.who.userId) ? { assignee: it.who.userId } : {}) });
      rows.push(r);
    });
    items.forEach((it, i) => {
      db.prepare('UPDATE hl_tasks SET place_name=?, after_id=?, mentions=? WHERE id=?').run(it.place ?? null, it.after !== null && it.after !== undefined ? rows[it.after]?.id ?? null : null, JSON.stringify(it.who ? [it.who.userId] : []), rows[i].id);
    });
  })();
  const out = rows.map((r, i) => ({ ...T.itemOut(T.byId(r.id)), who: items[i].who ? { userId: items[i].who.userId, name: items[i].who.name } : null, step: { n: i + 1, label: stepLabel(items[i], items) } }));
  for (const [i, it] of items.entries()) {
    if (it.who && it.who.userId !== u) { try { await notifyUser(it.who.userId, { title: `${userInfo(u)?.displayName?.split(' ')[0] ?? 'Noen'} nevnte deg i Huskeliste`, body: rows[i].title, url: '/#/huske', category: 'familie', tag: `task-mention-${rows[i].id}` }); } catch { /* best effort */ } }
  }
  const place = [...new Set(items.map((x) => x.place).filter(Boolean))];
  const ordered = items.some((x) => x.after !== null && x.after !== undefined);
  const n = rows.length;
  const word = (k) => (['null', 'ett', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti'][k] ?? String(k));
  const text1 = n === 1 ? `La til «${rows[0].title}» i ${pickList(items[0])?.name ?? 'listen'}${items[0].who ? ` · @${items[0].who.name}` : ''}.`
    : `Lagde ${n === 2 ? '2' : word(n)} punkter${place.length === 1 ? ` for ${place[0]}` : ''}${ordered ? ', i riktig rekkefølge' : ''}.`;
  return { kind: 'add', intent: n === 1 ? 'tasks.add' : 'tasks.multi', text: text1, items: out, engine, undo: T.mkUndo(u, [{ created: rows.map((r) => r.id) }]) };
}

/** Når et punkt blir gjort: varsel til de som har punktet som venter på det («Nå kan du: …»). → antall varsler */
export async function afterDone40(doneId, by) {
  migrate40();
  const next = db.prepare('SELECT * FROM hl_tasks WHERE after_id=? AND done=0').all(doneId);
  let n = 0;
  for (const t of next) {
    const to = t.assignee || t.created_by;
    if (!to) continue;
    try { await notifyUser(to, { title: 'Nå kan du', body: `Nå kan du: ${t.title}`, url: '/#/huske', category: 'familie', tag: `task-after-${t.id}` }); n++; } catch { /* */ }
  }
  return n;
}
export const extraOut40 = (r) => { let m = []; try { m = JSON.parse(r?.mentions ?? '[]'); } catch { m = []; } return { placeName: r?.place_name ?? null, after: r?.after_id ?? null, mentions: Array.isArray(m) ? m : [] }; };
