// Prompt 37 (SERVER37): Glimt i Gjøremål – alle 11 funksjonene fra claude-code-gjoremal-glimt.md på serversiden.
// Montert av tasks.js under /api/tasks (sesjon eller app-token, samme tilgang som resten: bare lister man er medlem av).
//
// POST /api/tasks/glimt {q, list?, image?(base64), action?, eventId?, ids?}
//   → {kind:'question'|'add'|'action', intent, text, items:[oppgave], undo:{token, expiresAt}|null, skipped?, example?}
//   q tolkes slik (lokalt, uten nett):
//    1. tekst → oppgave med felter: «Påminn meg å kansellere Overleaf 21.09 kl 9, viktig, hver måned» → tittel, dato, tid, viktig,
//       gjenta, liste. I dag/i morgen/overmorgen/ukedag/neste uke, dd.mm(.åå), kl hh(.mm), «påminn 30 min før», #tagger og navn
//       (husstandens brukere) som ansvarlig. «Kjøp melk, egg og kaffe» → én vare per ting i Handel.
//    2. flere linjer (SMS, e-post, oppskrift) → én oppgave per linje (punkttegn fjernes). image → varer fra handlelapp/oppskrift
//       (lokal visjonsmodell; uten modell/MOCK: eksempelvarer med example:true) i Handel med #handlelapp.
//    3. «Legg ukas matplan i handlelisten» → ingrediensene i Handel med #matplan, åpne varer som finnes fra før hoppes over (skipped).
//    6. «slå sammen like» · 7. «flytt forfalte til i morgen» / «arkiver forfalte» · 8. «påminn meg ved butikken»
//    10. «lag pakkeliste» (neste hytte/reise/bursdag/eksamen i kalenderen, eller eventId) → Hytta med #pakkeliste (+ «Bestill brøyting»)
//    11. spørsmål (spørreord eller «?»): «Hva har jeg igjen i dag?», «Hva har Ingrid lagt til i Handel?», «Når kjøpte vi sist kaffe?»,
//        «Hva er forfalt?», ukjent → «Spør meg i Chat for mer.»
//   action (fra Glimt-kortene): 'merge' | 'overdue.tomorrow' | 'overdue.archive' | 'store' | 'packlist' | 'matplan'
// POST /api/tasks/glimt/undo {token} → {ok, restored} (innen 30 s; alt Glimt la til/endret/slettet rulles tilbake)
// GET  /api/tasks/glimt/cards[?list=] → {cards:[{key, kind:'merge'|'overdue'|'store'|'packlist', text, list?, ids?, count?, event?, actions:[…]}]}
// POST /api/tasks/glimt/cards/dismiss {key} → {ok} («Ikke nå», vises ikke igjen for den hendelsen)
// GET  /api/tasks/brief → {count, overdue, items[3], text:'Du har tre gjøremål i dag, ett er forfalt.'} (Now Brief, punkt 9)
// POST /api/tasks/:id/split {apply?} → {subs:[{n, done}], source:'glimt'|'mal', item?} (punkt 4, 3–6 deloppgaver)
// POST /api/tasks/:id/suggest → {list:{id, name}|null, who:{id, name}|null, tags:[], place:null|'store'…, text:'Handel · Pål · #hytte · påminn ved butikken'}
// Alt Glimt lager får glimt:true (✦ i historikken) og by = brukeren.
import { randomBytes } from 'node:crypto';
import { kv } from './db.js';
import { userInfo, listUsers } from './auth.js';
import { parseDay } from './parse-day35.js';

const MOCK = process.env.MOCK_DATA === '1';
const UNDO_MS = 30_000;
const undos = new Map(); // token → {user, ops, exp}
const pad = (n) => String(n).padStart(2, '0');
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const wdOf = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
const cap = (s) => String(s ?? '').replace(/^\s*./, (c) => c.toUpperCase());
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const NUMW = ['null', 'ett', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti'];
const numWord = (n) => (n <= 10 ? NUMW[n] : String(n));
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const dateText = (d) => { const [, m, dd] = d.split('-').map(Number); return `${WD[wdOf(d)]} ${dd}. ${MON[m - 1]}`; };

/* ---------------- Tolkning av tekst (punkt 1) ---------------- */

const GROCERY = /\b(melk|egg|brød|kaffe|ost|smør|yoghurt|bananer?|epler?|appelsin|poteter?|løk|tomat(er)?|agurk|paprika|kylling|kjøttdeig|laks|fisk|pasta|ris|mel|sukker|salt|pepper|juice|te\b|vann|øl|vin|bleier|dopapir|tørkerull|oppvask|vaskemiddel|såpe|tannkrem|sjampo|frukt|grønnsaker|pålegg|syltetøy|leverpostei|skinke|pølser|taco|tortilla|rømme|fløte|sjokolade|kjeks|chips|brus|middag|dagligvare|handle|kjøp|handleliste)\b/;
const RULES = [
  [/\bhytt(a|e|en|er)\b|\bhafjell|\bbrøyting|\bved\b(?! siden)|\bfjellet\b/, 'hytta'],
  [/\bjobb(en)?\b|\bmøte\b|\brapport\b|\bkunde\b|\bfaktur|\bpresentasjon|\bkontor/, 'jobb'],
  [/\bfilter\b|\bvaske?\b|\brydd|\bboden\b|\bhage(n)?\b|\bplen\b|\bstøvsug|\bpære\b|\bmaling\b|\breparer|\bfiks\b|\bkjeller|\bstrøm(regning)?\b/, 'hjem'],
];
const REP_RE = [[/\bannenhver uke\b|\bhver (?:andre|annen) uke\b/, 'biweekly'], [/\bhver ukedag\b|\bukedager\b|\bhverdager\b/, 'weekdays'], [/\bhver dag\b|\bdaglig\b/, 'daily'],
  [/\bhver uke\b|\bukentlig\b/, 'weekly'], [/\bhver måned\b|\bmånedlig\b/, 'monthly'], [/\bhvert år\b|\bårlig\b/, 'yearly']];
const PLACE_RE = [[/\b(ved|på) (butikken|matbutikken|kiwi|rema|meny|coop|extra|joker)\b/, 'store'], [/\bnår jeg kommer hjem\b/, 'home'],
  [/\bnår jeg drar( hjemmefra)?\b/, 'leave'], [/\bpå jobb(en)?\b/, 'work'], [/\bpå hytta\b/, 'cabin']];

/** Husstandens personer (navn → bruker) som kan være ansvarlig. */
const peopleOf = () => listUsers().map((u) => ({ id: u.id, name: u.displayName ?? u.name ?? u.username, first: String(u.displayName ?? u.name ?? u.username ?? '').split(/\s+/)[0] }));

/** Tolker én oppgavetekst. → {title, due, time, urgent, rep, early, tags, prio, flag, place, who, whoName, listHint} */
export function parseTask37(text, today, { people = [] } = {}) {
  let t = ` ${String(text ?? '').replace(/\s+/g, ' ').trim()} `;
  const low = () => t.toLowerCase();
  const out = { tags: [], urgent: false, rep: 'none', early: 'none', prio: 0, flag: false, place: null, due: null, time: null, who: null, whoName: null, listHint: null };
  const cut = (re) => { t = t.replace(re, ' '); };
  // #tagger
  for (const m of t.matchAll(/#([\p{L}\p{N}_-]{1,30})/gu)) out.tags.push(m[1].toLowerCase());
  cut(/#[\p{L}\p{N}_-]{1,30}/gu);
  // Tidlig påminnelse: «påminn (meg) 30 min før», «varsle 1 dag før»
  let m = low().match(/(?:påminn(?: meg)?|varsle?(?: meg)?|minn meg på)\s+(\d{1,3}|en|ett|to)\s*(min|minutter|t|time|timer|dag|dager|døgn|uke|uker)\s+før/);
  if (m) {
    const n = { en: 1, ett: 1, to: 2 }[m[1]] ?? +m[1], u = m[2];
    const mins = /^(dag|døgn)/.test(u) ? n * 1440 : /^uke/.test(u) ? n * 10080 : /^t/.test(u) ? n * 60 : n;
    out.early = mins <= 5 ? '5m' : mins <= 15 ? '15m' : mins <= 30 ? '30m' : mins <= 60 ? '1h' : mins <= 1440 ? '1d' : mins <= 2880 ? '2d' : '1w';
    t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
  }
  // Gjenta
  for (const [re, v] of REP_RE) if (re.test(low())) { out.rep = v; cut(new RegExp(re.source, 'i')); break; }
  // Viktig / prioritet / flagg
  if (/\b(viktig|haster|alarm)\b/i.test(t)) { out.urgent = true; cut(/\b(viktig|haster|alarm)\b/gi); }
  if (/(^|\s)!!!(\s|$)|\bhøy prioritet\b/i.test(t)) out.prio = 3; else if (/(^|\s)!!(\s|$)|\bmiddels prioritet\b/i.test(t)) out.prio = 2; else if (/(^|\s)!(\s|$)|\blav prioritet\b/i.test(t)) out.prio = 1;
  cut(/(^|\s)!{1,3}(?=\s|$)|\b(høy|middels|lav) prioritet\b/gi);
  if (/\bflagg(et)?\b/i.test(t)) { out.flag = true; cut(/\bflagg(et)?\b/gi); }
  // Sted
  for (const [re, v] of PLACE_RE) if (re.test(low())) { out.place = v; if (v !== 'cabin' && v !== 'work') cut(new RegExp(re.source, 'i')); break; }
  // Tid: «kl 9», «kl. 14.30», «klokka 9»
  m = low().match(/\b(?:kl\.?|klokka|klokken)\s*([01]?\d|2[0-3])(?:[.:]([0-5]\d))?\b/);
  if (m) { out.time = `${pad(+m[1])}:${m[2] ?? '00'}`; t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); }
  // Dato
  if (/\bneste uke\b/i.test(t)) { const wd = (wdOf(today) + 6) % 7; out.due = addDays(today, 7 - wd); cut(/\bneste uke\b/gi); }
  else {
    const d = parseDay(t, today);
    if (d) {
      out.due = d.date;
      const w = d.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      t = t.replace(new RegExp(`(\\b(på|til|innen|den)\\s+)?${w}`, 'i'), ' ');
    }
  }
  if (out.time && !out.due) out.due = today; // tid slår på dato (i dag)
  // Ansvarlig: «… Ingrid», «Pål skal …», «til Emma»
  for (const p of people) {
    if (!p.first || p.first.length < 2) continue;
    const re = new RegExp(`(^|[\\s,(])(?:til |for |ansvarlig:? )?${p.first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s,.)!?])`, 'i');
    if (re.test(t)) { out.who = p.id; out.whoName = p.first; t = t.replace(re, '$1'); break; }
  }
  // Liste etter nøkkelord
  const lt = low();
  out.listHint = GROCERY.test(lt) ? 'handel' : RULES.find(([re]) => re.test(lt))?.[1] ?? null;
  // Tittel: fjern «påminn meg (om) å», «husk å», «legg til» og løse tegn
  let title = t.replace(/^\s*(?:påminn meg (?:om )?(?:å )?|minn meg på (?:å )?|husk (?:å )?|legg til |ny oppgave:?\s*|todo:?\s*)/i, ' ')
    .replace(/\s+([,.;:!?])/g, '$1').replace(/(^[\s,.;:–-]+|[\s,.;:–-]+$)/g, '').replace(/\s*,\s*(,\s*)+/g, ', ').replace(/,\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  title = title.replace(/\s+(og|,)$/i, '').trim();
  out.title = cap(title).slice(0, 200);
  return out;
}

/** «Kjøp melk, egg og kaffe» → ['Melk', 'Egg', 'Kaffe'] (bare når det ser ut som en handleliste). */
export function shoppingItems(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/^(?:kjøp|handle|vi trenger|trenger|husk å kjøpe|legg til)\s+(.+)$/i);
  if (!m) return null;
  const rest = m[1].replace(/\s+(i|på)\s+(handel|handlelisten|handlelista)\s*\.?$/i, '').replace(/[.!]+$/, '');
  const parts = rest.split(/\s*,\s*|\s+og\s+|\s*\+\s*/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2 && !GROCERY.test(rest.toLowerCase())) return null;
  return parts.slice(0, 30).map((x) => cap(x.replace(/^(en|ei|et|noen|litt)\s+/i, '')));
}

/** Lim inn: én oppgave per linje, punkttegn og nummerering fjernes. */
export const pastedLines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-–•*·▪◦]|\d{1,2}[.)]|\[\s?\]|☐)\s*/, '').trim()).filter((l) => l.length > 1).slice(0, 60);

/* ---------------- Maler (del opp, pakkeliste) ---------------- */

const SPLIT_TPL = [
  [/flytt/, ['Bestill flyttebil', 'Kjøp flytteesker', 'Meld adresseendring', 'Si opp strøm og internett', 'Pakk kjøkkenet', 'Vask ut']],
  [/hytt/, ['Sjekk vær og føre', 'Bestill brøyting', 'Handle mat', 'Pakk sengetøy', 'Ta med ved']],
  [/bursdag|selskap|fest/, ['Send invitasjoner', 'Bestill kake', 'Kjøp gave', 'Handle til maten', 'Pynt']],
  [/filter|ventilasjon/, ['Finn riktig filtertype', 'Bestill filter', 'Slå av anlegget', 'Bytt filter', 'Noter dato for neste bytte']],
  [/domene|nettside|dns/, ['Sjekk utløpsdato', 'Forny domenet', 'Kontroller DNS', 'Test nettsiden']],
  [/reis|ferie|tur\b/, ['Sjekk pass og billetter', 'Bestill transport', 'Pakk', 'Sjekk vær', 'Gi beskjed om post']],
];
export const PACK_TPL = {
  hytte: ['Sengetøy', 'Håndklær', 'Mat til helgen', 'Ved og tennbriketter', 'Lommelykt', 'Ski og votter'],
  reise: ['Pass og billetter', 'Lader', 'Toalettsaker', 'Klær for været', 'Medisiner', 'Hodetelefoner'],
  bursdag: ['Gave', 'Kort', 'Gavepapir', 'Kake', 'Lys', 'Ballonger'],
  eksamen: ['Studentkort', 'Kalkulator', 'Blyanter og viskelær', 'Vannflaske', 'Matpakke', 'Klokke'],
};
const kindOfEvent = (e) => { const t = norm(`${e.title} ${e.room ?? ''} ${e.place ?? ''}`); return /hytt|hafjell|fjell/.test(t) ? 'hytte' : /fly|reis|ferie|tur\b|gardermoen/.test(t) ? 'reise' : /bursdag/.test(t) || e.appCalendar === 'bursdager' ? 'bursdag' : /eksamen|prøve|tentamen/.test(t) ? 'eksamen' : null; };

/* ---------------- Montering ---------------- */

export function mountGlimt37(api, T) {
  const { q, db, listRow, canSeeList, canSeeTask, listsOf, itemOut, byId, cleanTask, insertTask, send, audienceOfTask, defaultList, VISIBLE, today, haLocal, parseArr } = T;

  const visibleLists = (u) => listsOf(u);
  // «handel» → listen med det navnet som brukeren ser (egen først, så delt).
  const listByWord = (u, word) => { if (!word) return null; const w = norm(word); return visibleLists(u).find((l) => norm(l.name) === w || l.id === word) ?? null; };
  const openRows = (u, listId = null) => q(`SELECT * FROM hl_tasks WHERE done=0 AND archived_at IS NULL AND ${VISIBLE}${listId ? ' AND list=@l' : ''}`).all({ u, ...(listId ? { l: listId } : {}) });
  const people = () => peopleOf();
  const mkUndo = (u, ops) => {
    const token = randomBytes(12).toString('base64url'), exp = Date.now() + UNDO_MS;
    undos.set(token, { user: u, ops, exp });
    for (const [k, v] of undos) if (v.exp < Date.now()) undos.delete(k);
    return { token, expiresAt: new Date(exp).toISOString(), ms: UNDO_MS };
  };
  /** Lager en oppgave fra Glimt (alltid glimt:true). Ansvarlig uten tilgang til listen droppes stille. */
  const add = (u, fields) => {
    const l = listRow(fields.list) ?? listRow(defaultList(u));
    const b = { ...fields, list: l?.id ?? '', glimt: true };
    if (b.assignee && !(l && canSeeList(l, b.assignee))) delete b.assignee;
    const t = cleanTask(b, false, u, l?.id);
    return insertTask(u, t);
  };
  const updateRow = (row, set) => {
    const keys = Object.keys(set);
    q(`UPDATE hl_tasks SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...keys.map((k) => set[k]), Date.now(), row.id);
    const nr = byId(row.id);
    send(audienceOfTask(nr), 'updated', { item: itemOut(nr) });
    haLocal('updated', row, nr);
    return nr;
  };
  const deleteRow = (row) => { q('DELETE FROM hl_tasks WHERE id=?').run(row.id); send(audienceOfTask(row), 'deleted', { id: row.id }); haLocal('deleted', row); };

  /* ---- spørsmål (punkt 11) ---- */
  function answerQuestion(u, text, t0) {
    const n = norm(text);
    const rows = openRows(u).map(itemOut);
    const lname = (id) => listRow(id)?.name ?? '';
    if (/forfalt|forfalte|på etterskudd/.test(n)) {
      const od = rows.filter((x) => x.due && x.due < t0);
      return { intent: 'tasks.overdue', text: od.length ? `${cap(numWord(od.length))} ${od.length === 1 ? 'gjøremål er' : 'gjøremål er'} forfalt: ${od.slice(0, 5).map((x) => x.title).join(', ')}.` : 'Ingenting er forfalt. Bra!', items: od };
    }
    if (/sist|forrige gang/.test(n) && /kjøpt|kjøpte|handlet|gjort|gjorde/.test(n)) {
      const what = n.replace(/\b(når|kjøpte|kjøpt|handlet|gjorde|gjort|vi|jeg|sist|forrige|gang|det|hva|har)\b/g, ' ').replace(/\s+/g, ' ').trim();
      const done = q(`SELECT * FROM hl_tasks WHERE done=1 AND ${VISIBLE} ORDER BY done_at DESC LIMIT 500`).all({ u }).filter((r) => !what || what.split(' ').every((w) => norm(r.title).includes(w)));
      const r = done[0];
      if (!r) return { intent: 'tasks.last', text: `Fant ikke at ${what || 'det'} er krysset av før.`, items: [] };
      const d = new Date(r.done_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
      const who = userInfo(r.done_by ?? r.created_by)?.displayName?.split(' ')[0];
      return { intent: 'tasks.last', text: `${cap(r.title)} ble sist krysset av ${daysBetween(d, t0) === 0 ? 'i dag' : daysBetween(d, t0) === 1 ? 'i går' : dateText(d)}${who ? ` av ${who}` : ''}${r.list ? ` (${lname(r.list)})` : ''}.`, items: [itemOut(r)] };
    }
    const person = people().find((p) => p.first && new RegExp(`\\b${norm(p.first)}\\b`).test(n));
    if (person && /lagt til|la til|lagt inn|skal|ansvar/.test(n)) {
      const l = visibleLists(u).find((x) => new RegExp(`\\b${norm(x.name)}\\b`).test(n));
      const list = rows.filter((x) => (!l || x.list === l.id) && (x.createdBy === person.id || x.assignee === person.id));
      return { intent: 'tasks.by', text: list.length ? `${person.first} har lagt til ${numWord(list.length)} ${list.length === 1 ? 'ting' : 'ting'}${l ? ` i ${l.name}` : ''}: ${list.slice(0, 6).map((x) => x.title).join(', ')}.` : `${person.first} har ikke lagt til noe${l ? ` i ${l.name}` : ''} som er åpent nå.`, items: list };
    }
    if (/i dag|igjen|idag|resten av dagen/.test(n) || /hva (har|må|skal) jeg/.test(n)) {
      const td = rows.filter((x) => x.due && x.due <= t0);
      const od = td.filter((x) => x.due < t0).length;
      return { intent: 'tasks.today', text: td.length ? `Du har ${numWord(td.length)} ${td.length === 1 ? 'gjøremål' : 'gjøremål'} i dag${od ? `, ${numWord(od)} er forfalt` : ''}: ${td.slice(0, 5).map((x) => x.title).join(', ')}.` : 'Du har ingen gjøremål igjen i dag.', items: td };
    }
    return { intent: 'tasks.unknown', text: 'Spør meg i Chat for mer.', items: [], followUp: 'chat' };
  }

  /* ---- matplan → Handel (punkt 3) ---- */
  async function matplan(u, t0) {
    const handel = listByWord(u, 'Handel') ?? listRow(defaultList(u));
    const { weekIngredients37 } = await import('./mat.js');
    let days = [];
    try { days = weekIngredients37(t0); } catch (e) { return { kind: 'action', intent: 'tasks.matplan', text: `Fikk ikke lest matplanen: ${e.message}`, items: [] }; }
    const have = new Set(openRows(u, handel?.id).map((r) => norm(r.title)));
    const want = [], seen = new Set();
    for (const d of days) for (const ing of d.ingredients) { const k = norm(ing.replace(/^\d+[\s,.]*(g|kg|dl|l|stk|ss|ts|pk)?\s+/i, '')); if (k && !seen.has(k)) { seen.add(k); want.push(cap(ing.replace(/^\d+[\s,.]*(g|kg|dl|l|stk|ss|ts|pk)?\s+/i, ''))); } }
    const add1 = want.filter((x) => !have.has(norm(x))), skipped = want.length - add1.length;
    const rows = db.transaction(() => add1.map((n) => add(u, { title: n, list: handel?.id, tags: ['matplan'] })))();
    const items = rows.map(itemOut);
    if (!days.length) return { kind: 'action', intent: 'tasks.matplan', text: 'Det er ingen retter i ukas matplan ennå.', items: [] };
    return { kind: 'action', intent: 'tasks.matplan', text: `La til ${numWord(items.length)} ${items.length === 1 ? 'vare' : 'varer'} fra ukas matplan i ${handel?.name ?? 'Handel'}.${skipped ? ` Hoppet over ${numWord(skipped)} som allerede står der.` : ''}`,
      items, skipped, undo: items.length ? mkUndo(u, [{ created: rows.map((r) => r.id) }]) : null };
  }

  /* ---- slå sammen like (punkt 6) ---- */
  const dupGroups = (u, listId = null) => {
    const g = new Map();
    for (const r of openRows(u, listId)) { const k = `${r.list}|${norm(r.title)}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    return [...g.values()].filter((x) => x.length > 1).map((x) => x.sort((a, b) => a.created_at - b.created_at));
  };
  function merge(u, listId) {
    const groups = dupGroups(u, listId);
    const ops = [], kept = [];
    db.transaction(() => {
      for (const [keep, ...rest] of groups) {
        const tags = [...new Set([...parseArr(keep.tags), ...rest.flatMap((r) => parseArr(r.tags))])];
        const subs = [...parseArr(keep.subs)];
        for (const r of rest) for (const s of parseArr(r.subs)) if (!subs.some((x) => norm(x.n) === norm(s.n))) subs.push(s);
        ops.push({ updated: [{ id: keep.id, before: { tags: keep.tags, subs: keep.subs } }] }, { deleted: rest });
        kept.push(updateRow(keep, { tags: JSON.stringify(tags), subs: JSON.stringify(subs) }));
        for (const r of rest) deleteRow(r);
      }
    })();
    const n = groups.reduce((a, g) => a + g.length - 1, 0);
    return { kind: 'action', intent: 'tasks.merge', text: n ? `Slo sammen ${numWord(n)} ${n === 1 ? 'dobbel' : 'doble'} ${n === 1 ? 'oppgave' : 'oppgaver'}.` : 'Fant ingen like oppgaver.', items: kept.map(itemOut), undo: n ? mkUndo(u, ops) : null };
  }

  /* ---- forfalte (punkt 7) ---- */
  function overdue(u, mode, t0) {
    const rows = openRows(u).filter((r) => r.due && r.due < t0);
    const ops = [{ updated: rows.map((r) => ({ id: r.id, before: { due: r.due, archived_at: r.archived_at } })) }];
    const out = db.transaction(() => rows.map((r) => updateRow(r, mode === 'archive' ? { archived_at: Date.now() } : { due: addDays(t0, 1) })))();
    return { kind: 'action', intent: mode === 'archive' ? 'tasks.overdue.archive' : 'tasks.overdue.tomorrow',
      text: !rows.length ? 'Ingenting er forfalt.' : mode === 'archive' ? `Arkiverte ${numWord(rows.length)} forfalte gjøremål.` : `Flyttet ${numWord(rows.length)} forfalte gjøremål til i morgen.`,
      items: out.map(itemOut), undo: rows.length ? mkUndo(u, ops) : null };
  }

  /* ---- påminn ved butikken (punkt 8) ---- */
  function storeReminder(u, listId) {
    const l = listRow(listId) ?? listByWord(u, 'Handel');
    if (!l || !canSeeList(l, u)) return { kind: 'action', intent: 'tasks.store', text: 'Fant ikke handlelisten.', items: [] };
    const rows = openRows(u, l.id).filter((r) => r.place !== 'store');
    const ops = [{ updated: rows.map((r) => ({ id: r.id, before: { place: r.place } })) }];
    const out = db.transaction(() => rows.map((r) => updateRow(r, { place: 'store' })))();
    const all = openRows(u, l.id);
    kv.set(u, 'tasks37_store', { ...(kv.get(u, 'tasks37_store', {}) ?? {}), [l.id]: true });
    return { kind: 'action', intent: 'tasks.store', text: `Jeg minner deg på ${l.name} når du er ved en matbutikk${all.length ? ` (${all.slice(0, 3).map((r) => r.title.toLowerCase()).join(', ')}${all.length > 3 ? ' …' : ''})` : ''}.`,
      items: out.map(itemOut), undo: rows.length ? mkUndo(u, ops) : null, notification: { title: 'Du er ved butikken', body: `${l.name}: ${all.slice(0, 4).map((r) => r.title).join(', ')}${all.length > 4 ? ' …' : ''}`, action: 'Vis' } };
  }

  /* ---- pakkeliste fra kalenderen (punkt 10) ---- */
  async function nextTripEvent(u, t0, eventId = null) {
    try {
      const { eventsFor } = await import('./calendar.js');
      const { runAsUser } = await import('./settings.js');
      const { events } = await runAsUser(u, () => eventsFor(u, t0, addDays(t0, 30)));
      const list = events.filter((e) => (eventId ? e.id === eventId : kindOfEvent(e)) && e.date >= t0).sort((a, b) => a.date.localeCompare(b.date));
      return list[0] ?? null;
    } catch { return null; }
  }
  async function packlist(u, t0, eventId) {
    const e = await nextTripEvent(u, t0, eventId);
    const kind = e ? kindOfEvent(e) ?? 'reise' : 'hytte';
    const target = kind === 'hytte' ? listByWord(u, 'Hytta') ?? listRow(defaultList(u)) : listRow(defaultList(u));
    const due = e ? addDays(e.date, -1) : null;
    const items = PACK_TPL[kind];
    const rows = db.transaction(() => {
      const r = items.map((n) => add(u, { title: n, list: target?.id, tags: ['pakkeliste'], due }));
      if (kind === 'hytte') r.push(add(u, { title: 'Bestill brøyting', list: target?.id, tags: ['hytte'], due: e ? addDays(e.date, -2) : null }));
      return r;
    })();
    if (e) kv.set(u, 'tasks37_cards_dismissed', [...new Set([...(kv.get(u, 'tasks37_cards_dismissed', []) ?? []), `packlist:${e.id}`])]);
    return { kind: 'action', intent: 'tasks.packlist', text: `La ${numWord(rows.length)} ting i ${target?.name ?? 'listen'}${e ? ` til ${e.title} ${dateText(e.date)}` : ''}.`, items: rows.map(itemOut), undo: mkUndo(u, [{ created: rows.map((r) => r.id) }]), event: e ? { id: e.id, title: e.title, date: e.date } : null };
  }

  /* ---- bilde (punkt 2) ---- */
  async function fromImage(u, image, listId) {
    const handel = listRow(listId) ?? listByWord(u, 'Handel') ?? listRow(defaultList(u));
    let names = null, example = false;
    if (!(MOCK && !process.env.OLLAMA_URL)) {
      try {
        const { run } = await import('./ai-run.js');
        const out = await run('glimt', { user: u, prompt: 'Les varene på handlelappen eller ingrediensene i oppskriften. Svar KUN med JSON {"items":["Melk","Egg"]} på norsk.', images: [String(image).replace(/^data:[^,]+,/, '')], json: true, localOnly: true, numPredict: 300, title: 'Glimt · handlelapp' });
        const j = out.data ?? JSON.parse(String(out.text).match(/\{[\s\S]*\}/)?.[0] ?? '{}');
        if (Array.isArray(j.items)) names = j.items.map((x) => cap(String(x).trim().slice(0, 80))).filter(Boolean).slice(0, 40);
      } catch (e) { console.warn('[gjøremål] bilde:', e.message); }
    }
    if (!names?.length) { names = ['Melk', 'Egg', 'Brød', 'Kaffe', 'Bananer']; example = true; }
    const rows = db.transaction(() => names.map((n) => add(u, { title: n, list: handel?.id, tags: ['handlelapp'] })))();
    return { kind: 'add', intent: 'tasks.image', text: `${example ? 'Eksempel: ' : ''}la til ${numWord(rows.length)} varer fra bildet i ${handel?.name ?? 'listen'}.`, items: rows.map(itemOut), example, undo: mkUndo(u, [{ created: rows.map((r) => r.id) }]) };
  }

  /* ---- vanlig tekst (punkt 1) og lim inn (punkt 2) ---- */
  function addFromText(u, text, listId, t0) {
    const given = listId ? listRow(listId) : null;
    if (given && !canSeeList(given, u)) return { error: 'Fant ikke listen', status: 404 };
    const lines = String(text).includes('\n') ? pastedLines(text) : null;
    const ppl = people();
    const pick = (hint) => given ?? (hint ? listByWord(u, { handel: 'Handel', hytta: 'Hytta', jobb: 'Jobb', hjem: 'Hjem' }[hint]) : null) ?? listRow(defaultList(u));
    let rows;
    if (lines && lines.length > 1) {
      const grocery = lines.filter((l) => GROCERY.test(l.toLowerCase())).length >= Math.ceil(lines.length / 2);
      const target = given ?? (grocery ? listByWord(u, 'Handel') : null) ?? listRow(defaultList(u));
      rows = db.transaction(() => lines.map((l) => { const p = parseTask37(l, t0, { people: ppl }); return add(u, { title: p.title || l, list: target?.id, due: p.due, time: p.time, tags: p.tags }); }))();
      return { kind: 'add', intent: 'tasks.paste', text: `La til ${numWord(rows.length)} ${rows.length === 1 ? 'oppgave' : 'oppgaver'} i ${target?.name ?? 'listen'}.`, items: rows.map(itemOut), undo: mkUndo(u, [{ created: rows.map((r) => r.id) }]) };
    }
    const shop = shoppingItems(text);
    if (shop && shop.length > 1) {
      const target = given ?? listByWord(u, 'Handel') ?? listRow(defaultList(u));
      rows = db.transaction(() => shop.map((n) => add(u, { title: n, list: target?.id })))();
      return { kind: 'add', intent: 'tasks.shopping', text: `La ${shop.map((x) => x.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' og $1')} i ${target?.name ?? 'listen'}.`, items: rows.map(itemOut), undo: mkUndo(u, [{ created: rows.map((r) => r.id) }]) };
    }
    const p = parseTask37(text, t0, { people: ppl });
    if (!p.title) return { kind: 'question', intent: 'tasks.unknown', text: 'Hva skal jeg legge til?', items: [] };
    const target = pick(p.listHint);
    const r = add(u, { title: p.title, list: target?.id, due: p.due, time: p.time, urgent: p.urgent, rep: p.rep, early: p.early, prio: p.prio, flag: p.flag, tags: p.tags, place: p.place, assignee: p.who });
    const it = itemOut(r);
    const bits = [it.due ? `${it.due === t0 ? 'i dag' : it.due === addDays(t0, 1) ? 'i morgen' : dateText(it.due)}${it.time ? ` kl. ${it.time}` : ''}` : null, it.urgent ? 'viktig' : null,
      it.rep !== 'none' ? { daily: 'hver dag', weekdays: 'ukedager', weekly: 'hver uke', biweekly: 'annenhver uke', monthly: 'hver måned', yearly: 'hvert år' }[it.rep] : null,
      it.assignee ? userInfo(it.assignee)?.displayName?.split(' ')[0] : null].filter(Boolean);
    return { kind: 'add', intent: 'tasks.add', text: `La til «${it.title}» i ${target?.name ?? 'listen'}${bits.length ? ` · ${bits.join(' · ')}` : ''}.`, items: [it], parsed: p, undo: mkUndo(u, [{ created: [r.id] }]) };
  }

  const isQ = (text) => /\?\s*$/.test(String(text).trim()) || /^(hva|hvem|hvor|når|hvilke|hvilken|hvor mange|har|er det|what|when|who)\b/i.test(String(text).trim());

  api.post('/glimt', async (c) => {
    const u = c.get('user');
    const b = await c.req.json().catch(() => ({}));
    const text = String(b.q ?? b.text ?? '').slice(0, 4000);
    const t0 = today();
    if (b.list && !canSeeList(listRow(b.list), u)) return c.json({ error: 'Fant ikke listen' }, 404);
    let r;
    try {
      const n = norm(text), act = String(b.action ?? '');
      if (b.image) r = await fromImage(u, b.image, b.list);
      else if (act === 'merge' || (!act && /slå sammen/.test(n))) r = merge(u, b.list ?? null);
      else if (act === 'overdue.archive' || (!act && /arkiver/.test(n) && /forfalt|forfalte/.test(n))) r = overdue(u, 'archive', t0);
      else if (act === 'overdue.tomorrow' || (!act && /forfalt|forfalte/.test(n) && /flytt|utsett/.test(n))) r = overdue(u, 'tomorrow', t0);
      else if (act === 'store' || (!act && /påminn.*(ved|på) (butikken|matbutikken)/.test(n) && !/\bkjøp/.test(n) && n.split(' ').length <= 7)) r = storeReminder(u, b.list ?? null);
      else if (act === 'packlist' || (!act && /pakkeliste/.test(n))) r = await packlist(u, t0, b.eventId ?? null);
      else if (act === 'matplan' || (!act && /matplan|ukas middag|middagene/.test(n) && /handel|handlelist|handlelapp|handleliste/.test(n))) r = await matplan(u, t0);
      else if (!text.trim()) return c.json({ error: 'Skriv noe til Glimt' }, 400);
      else if (isQ(text) && !text.includes('\n')) r = { kind: 'question', ...answerQuestion(u, text, t0) };
      else r = addFromText(u, text, b.list ?? null, t0);
    } catch (e) { return c.json({ error: e.message }, 400); }
    if (r.error) return c.json({ error: r.error }, r.status ?? 400);
    return c.json({ kind: r.kind ?? 'action', intent: r.intent, text: r.text, items: r.items ?? [], undo: r.undo ?? null, source: 'Glimt · Gjøremål',
      ...['skipped', 'example', 'event', 'notification', 'followUp', 'parsed'].reduce((o, k) => (r[k] !== undefined ? { ...o, [k]: r[k] } : o), {}) });
  });

  api.post('/glimt/undo', async (c) => {
    const u = c.get('user'), b = await c.req.json().catch(() => ({}));
    const x = undos.get(String(b.token ?? ''));
    if (!x || x.user !== u) return c.json({ error: 'Kan ikke angre lenger' }, 404);
    if (x.exp < Date.now()) { undos.delete(b.token); return c.json({ error: 'Angrefristen er ute' }, 410); }
    undos.delete(b.token);
    let restored = 0;
    db.transaction(() => {
      for (const op of [...x.ops].reverse()) {
        for (const id of op.created ?? []) { const r = byId(id); if (r) { deleteRow(r); restored++; } }
        for (const d of op.deleted ?? []) {
          const cols = Object.keys(d);
          q(`INSERT OR IGNORE INTO hl_tasks(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map((k) => d[k]));
          const r = byId(d.id); if (r) { send(audienceOfTask(r), 'created', { item: itemOut(r) }); haLocal('created', null, r); restored++; }
        }
        for (const up of op.updated ?? []) { const r = byId(up.id); if (r) { updateRow(r, up.before); restored++; } }
      }
    })();
    return c.json({ ok: true, restored });
  });

  /* ---- Glimt-kortene i listen ---- */
  api.get('/glimt/cards', async (c) => {
    const u = c.get('user'), t0 = today(), listId = c.req.query('list') || null;
    if (listId && listId !== 'alle' && !canSeeList(listRow(listId), u)) return c.json({ error: 'Fant ikke listen' }, 404);
    const lid = listId && listId !== 'alle' ? listId : null;
    const dismissed = new Set(kv.get(u, 'tasks37_cards_dismissed', []) ?? []);
    const cards = [];
    for (const g of dupGroups(u, lid)) {
      const l = listRow(g[0].list);
      const key = `merge:${g.map((r) => r.id).join('-')}`;
      if (!dismissed.has(key)) cards.push({ key, kind: 'merge', text: `${g.length}× «${g[0].title}» i ${l?.name ?? 'listen'}`, list: l ? { id: l.id, name: l.name } : null, ids: g.map((r) => r.id), actions: [{ action: 'merge', label: 'Slå sammen' }] });
    }
    const od = openRows(u, lid).filter((r) => r.due && r.due < t0);
    if (od.length >= 2 && !dismissed.has(`overdue:${t0}`)) cards.push({ key: `overdue:${t0}`, kind: 'overdue', count: od.length, text: `${cap(numWord(od.length))} gjøremål er forfalt`, ids: od.map((r) => r.id), actions: [{ action: 'overdue.tomorrow', label: 'Flytt til i morgen' }, { action: 'overdue.archive', label: 'Arkiver' }] });
    const handel = lid ? listRow(lid) : listByWord(u, 'Handel');
    if (handel && /^handel/i.test(handel.name) && openRows(u, handel.id).length && !(kv.get(u, 'tasks37_store', {}) ?? {})[handel.id] && !dismissed.has(`store:${handel.id}`)) {
      cards.push({ key: `store:${handel.id}`, kind: 'store', text: 'Påminn meg ved butikken', list: { id: handel.id, name: handel.name }, actions: [{ action: 'store', label: 'Slå på' }] });
    }
    const e = await nextTripEvent(u, t0);
    if (e && !dismissed.has(`packlist:${e.id}`)) {
      const inDays = daysBetween(t0, e.date), k = kindOfEvent(e);
      cards.push({ key: `packlist:${e.id}`, kind: 'packlist', event: { id: e.id, title: e.title, date: e.date, inDays }, text: `${e.title} om ${inDays} ${inDays === 1 ? 'dag' : 'dager'}: ${k === 'hytte' ? 'Lage pakkeliste og huske brøyting?' : 'Lage pakkeliste?'}`,
        actions: [{ action: 'packlist', label: 'Lag pakkeliste', eventId: e.id }, { action: 'dismiss', label: 'Ikke nå' }] });
    }
    return c.json({ cards });
  });
  api.post('/glimt/cards/dismiss', async (c) => {
    const u = c.get('user'), b = await c.req.json().catch(() => ({}));
    const key = String(b.key ?? '').slice(0, 200);
    if (!key) return c.json({ error: 'Mangler key' }, 400);
    kv.set(u, 'tasks37_cards_dismissed', [...new Set([...(kv.get(u, 'tasks37_cards_dismissed', []) ?? []), key])].slice(-300));
    return c.json({ ok: true });
  });

  /* ---- Now Brief (punkt 9) ---- */
  api.get('/brief', (c) => c.json(briefTodos(c.get('user'))));

  /* ---- del opp (punkt 4) og sortere (punkt 5) ---- */
  api.post('/:id{[0-9]+}/split', async (c) => {
    const u = c.get('user'), cur = byId(+c.req.param('id'));
    if (!cur || !canSeeTask(cur, u)) return c.json({ error: 'Fant ikke oppgaven' }, 404);
    const b = await c.req.json().catch(() => ({}));
    let subs = null, source = 'mal';
    if (!(MOCK && !process.env.OLLAMA_URL)) {
      try {
        const { run } = await import('./ai-run.js');
        const out = await run('glimt', { user: u, prompt: `Del opp gjøremålet «${cur.title}» i 3–6 korte, konkrete deloppgaver på norsk bokmål. Svar KUN med JSON {"subs":["…"]}.`, json: true, localOnly: true, numPredict: 200, title: 'Glimt · del opp', background: true });
        const j = out.data ?? JSON.parse(String(out.text).match(/\{[\s\S]*\}/)?.[0] ?? '{}');
        if (Array.isArray(j.subs) && j.subs.length >= 2) { subs = j.subs.slice(0, 6).map((x) => cap(String(x).trim().slice(0, 120))).filter(Boolean); source = 'glimt'; }
      } catch { /* malene under */ }
    }
    if (!subs) subs = (SPLIT_TPL.find(([re]) => re.test(norm(cur.title)))?.[1]) ?? ['Finn ut hva som trengs', 'Sett av tid i kalenderen', 'Gjør første del', 'Sjekk at det er ferdig'];
    const out = subs.map((n) => ({ n, done: false }));
    if (b.apply) {
      const merged = [...parseArr(cur.subs)];
      for (const s of out) if (!merged.some((x) => norm(x.n) === norm(s.n))) merged.push(s);
      return c.json({ subs: out, source, item: itemOut(updateRow(cur, { subs: JSON.stringify(merged) })) });
    }
    return c.json({ subs: out, source });
  });
  api.post('/:id{[0-9]+}/suggest', (c) => {
    const u = c.get('user'), cur = byId(+c.req.param('id'));
    if (!cur || !canSeeTask(cur, u)) return c.json({ error: 'Fant ikke oppgaven' }, 404);
    const p = parseTask37(`${cur.title} ${cur.note ?? ''}`, today(), { people: people() });
    const l = p.listHint ? listByWord(u, { handel: 'Handel', hytta: 'Hytta', jobb: 'Jobb', hjem: 'Hjem' }[p.listHint]) : null;
    const who = p.who && (l ?? listRow(cur.list)) && canSeeList(l ?? listRow(cur.list), p.who) ? { id: p.who, name: p.whoName } : null;
    const tags = [...new Set([...p.tags, ...(p.listHint === 'hytta' ? ['hytte'] : [])])];
    const place = p.place ?? (p.listHint === 'handel' ? 'store' : null);
    const parts = [l?.name, who?.name, ...tags.map((t) => `#${t}`), place === 'store' ? 'påminn ved butikken' : null].filter(Boolean);
    return c.json({ list: l ? { id: l.id, name: l.name } : null, who, tags, place, text: parts.length ? `✦ Glimt foreslår: ${parts.join(' · ')}` : null });
  });

  /** Brief-kortet: forfalte + i dag (de tre første), og setningen Glimt leser opp. */
  function briefTodos(u) {
    const t0 = today();
    const rows = openRows(u).filter((r) => r.due && r.due <= t0).map(itemOut).sort((a, b) => a.due.localeCompare(b.due) || (a.time ?? '99').localeCompare(b.time ?? '99'));
    const od = rows.filter((x) => x.due < t0).length;
    const n = rows.length;
    const lname = (id) => listRow(id)?.name ?? null;
    return { count: n, overdue: od, items: rows.slice(0, 3).map((x) => ({ id: x.id, title: x.title, due: x.due, time: x.time, done: x.done, overdue: x.due < t0, list: x.list, listName: lname(x.list), urgent: x.urgent })),
      text: n ? `Du har ${numWord(n)} ${n === 1 ? 'gjøremål' : 'gjøremål'} i dag${od ? `, ${od === 1 ? 'ett' : numWord(od)} er forfalt` : ''}.` : 'Ingen gjøremål i dag.',
      title: `${n} ${n === 1 ? 'gjøremål' : 'gjøremål'} i dag`, open: { route: 'huske' }, deepLink: 'finanshub://huske' };
  }
  setBrief(briefTodos);
}

let briefImpl = () => null;
const setBrief = (fn) => { briefImpl = fn; };
/** For brief34.js: Gjøremål-kortet i Now Brief ({count, items[3], text}). */
export const todosForBrief = (u) => { try { return briefImpl(u); } catch { return null; } };
