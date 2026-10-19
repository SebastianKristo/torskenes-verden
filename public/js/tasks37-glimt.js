// Prompt 37 (claude-code-gjoremal-glimt.md): lokal Glimt-tolker for Gjøremål. Ren ES-modul uten DOM.
// Brukes når serveren mangler POST /api/tasks/glimt (404) og til forslag i detaljarket («✦ Glimt foreslår», «Del opp»).
// Verdier som serveren (SERVER37): rep none|daily|weekdays|weekly|biweekly|monthly|yearly, early none|5m|15m|30m|1h|1d|2d|1w, place store|home|leave|work|cabin.
// Fasit: Huskeliste.dc.html → gParse(), guess(), gAsk(), splitSugg(), packList(), matIng().
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const p2 = (n) => String(n).padStart(2, '0');
export const isoDay = (n, from = new Date()) => { const d = new Date(from); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Liste-nøkkel ut fra ord i teksten: dagligvarer → handel, hytte → hytta, jobb-ord → jobb, hjem-ord → hjem. */
export function guess(t, people = []) {
  const s = ` ${String(t).toLowerCase()} `;
  const l = / (melk|egg|brød|kaffe|ost|smør|bananer|epler|pasta|ris|kjøttdeig|kylling|tomat|løk|yoghurt|juice|dopapir|tørkerull|batterier|lyspærer|kjøpe?|handle) /.test(s) ? 'handel'
    : / (hytta|hytte|hafjell|brøyting|ved) /.test(s) ? 'hytta'
      : / (jobb|møte|faktura|domene|rapport|kunde|overleaf) /.test(s) ? 'jobb'
        : / (hjem|filter|vaske|rydde|støvsuge|pante|røykvarsler|varmepumpe|fellesutgifter) /.test(s) ? 'hjem' : null;
  const who = people.find((p) => p.name && new RegExp(`(^|[^a-zæøå])${p.name.toLowerCase()}([^a-zæøå]|$)`).test(s)) ?? null;
  const tags = / (hytte|hytta) /.test(s) ? ['hytte'] : / (gave|bursdag) /.test(s) ? ['gave'] : [];
  const place = l === 'handel' ? 'store' : l === 'hytta' ? 'cabin' : null;
  return { l, who, tags, place };
}

/** Tekst → én eller flere oppgaver {n, lk, due, time, urgent, rep, early, tags, who}. lk = liste-nøkkel (navn i små bokstaver) eller null. */
export function parse(txt, { people = [], now = new Date() } = {}) {
  let s = ` ${String(txt).trim()} `, due = null, time = null, urgent = false, rep = 'none', early = 'none', m;
  const cut = (re) => { const mm = s.match(re); if (mm) s = s.replace(mm[0], ' '); return mm; };
  if (cut(/(^|\s)(viktig|haster|med alarm)(?=[\s,.]|$),?/i)) urgent = true;
  m = cut(/(^|\s)(hver dag|daglig|ukedager|hver uke|ukentlig|annenhver uke|hver måned|månedlig|hvert år|årlig)(?=[\s,.]|$),?/i);
  if (m) { const v = m[2].toLowerCase(); rep = /ukedager/.test(v) ? 'weekdays' : /annenhver/.test(v) ? 'biweekly' : /uke|ukentlig/.test(v) ? 'weekly' : /måned/.test(v) ? 'monthly' : /år/.test(v) ? 'yearly' : 'daily'; }
  m = cut(/(?:påminn(?:else)?|varsle?)\s*(?:meg\s*)?(\d+)\s*(min|minutter|t|time|timer|dag|dager|uke)\s*før/i);
  if (m) { const n = +m[1], u = m[2][0]; early = u === 'm' ? (n <= 5 ? '5m' : n <= 15 ? '15m' : '30m') : u === 't' ? '1h' : u === 'd' ? (n >= 2 ? '2d' : '1d') : '1w'; }
  m = cut(/(?:kl\.?|klokka|klokken)\s*(\d{1,2})(?:[.:](\d{2}))?(?=\D|$)/i);
  if (m && +m[1] < 24) time = `${p2(m[1])}:${m[2] ?? '00'}`;
  m = cut(/(?:^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=[\s,]|$)/);
  if (m) {
    const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    let d = new Date(y, +m[2] - 1, +m[1], 12);
    if (!m[3] && d.toLocaleDateString('sv-SE') < isoDay(0, now)) d = new Date(y + 1, +m[2] - 1, +m[1], 12);
    if (!isNaN(d)) due = d.toLocaleDateString('sv-SE');
  }
  if (due == null) {
    if (cut(/(^|\s)i\s*overmorgen(?=[\s,.?]|$)/i)) due = isoDay(2, now);
    else if (cut(/(^|\s)i\s*morgen(?=[\s,.?]|$)/i)) due = isoDay(1, now);
    else if (cut(/(^|\s)i\s*(dag|kveld)(?=[\s,.?]|$)/i)) due = isoDay(0, now);
    else if ((m = cut(/(^|\s)(?:på\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)(?=[\s,.]|$)/i))) { const w = WD.indexOf(m[2].toLowerCase()); due = isoDay(((w - now.getDay() + 7) % 7) || 7, now); }
    else if (cut(/(^|\s)neste uke(?=[\s,.]|$)/i)) due = isoDay(7, now);
  }
  if (time && due == null) due = isoDay(0, now);
  const tags = [];
  s = s.replace(/#([\wæøå-]+)/gi, (_, b) => { tags.push(b.toLowerCase()); return ' '; });
  let t = s.replace(/^\s*(påminn meg (om )?(å )?|husk (å )?|legg til |ny oppgave:? |jeg må |må )/i, ' ').replace(/\s+(den|på|i|til|kl\.?)\s*$/i, ' ').replace(/[,.;:]+\s*$/, '').replace(/\s+/g, ' ').trim();
  t = cap(t) || 'Ny oppgave';
  const g = guess(txt, people);
  const base = { lk: g.l, who: g.who?.id ?? null, due, time, urgent, rep, early, tags: [...new Set([...tags, ...g.tags])] };
  if (/^\s*(kjøp|kjøpe|handle)\s+/i.test(t) && /,| og /.test(t)) {
    return t.replace(/^\s*(kjøp|kjøpe|handle)\s+/i, '').split(/,| og /).map((x) => x.trim()).filter(Boolean).map((n) => ({ ...base, lk: 'handel', n: cap(n) }));
  }
  return [{ ...base, n: t }];
}

/** Innlimt tekst med flere linjer → én oppgave per linje (punkttegn fjernes). */
export const pasteLines = (txt) => String(txt).split(/\n/).map((x) => x.replace(/^[\s•\-*\d.)]+/, '').trim()).filter((x) => x.length > 1).slice(0, 20);

export const isAsk = (q) => /\?|^\s*(hva|hvem|hvor|når|hvilke|har|kan du|vet du)(?![a-zæøå])/i.test(q);

/** Spørsmål om egne og delte gjøremål. items: [{n, l (listId), listName, who, whoName, by, byName, due, done, doneAt}]. */
export function ask(q, items, { lists = [], today = isoDay(0) } = {}) {
  const low = q.toLowerCase(), op = items.filter((x) => !x.done);
  if (/igjen i dag|i dag|hva (har|må) jeg/.test(low)) {
    const L = op.filter((x) => x.due && x.due <= today), late = L.filter((x) => x.due < today).length;
    if (!L.length) { const nx = op.filter((x) => x.due).sort((a, b) => a.due.localeCompare(b.due))[0]; return { text: `Ingenting i dag. Neste: ${nx ? nx.n : 'ingen med dato'}.`, items: [] }; }
    return { text: `Du har ${L.length} gjøremål i dag${late ? `, ${late === 1 ? 'ett' : late} av dem er forfalt` : ''}.`, items: L };
  }
  const who = /(?:hva har|har)\s+([a-zæøå]+)\s+(?:lagt|la)/i.exec(q);
  if (who && /lagt til|lagt inn|la til/.test(low)) {
    const n = cap(who[1].toLowerCase()), ln = lists.find((l) => low.includes(String(l.name).toLowerCase()));
    const R = items.filter((x) => (String(x.byName ?? '').toLowerCase() === n.toLowerCase() || String(x.whoName ?? '').toLowerCase() === n.toLowerCase()) && (!ln || x.l === ln.id));
    return { text: R.length ? `${n} har ${R.length} gjøremål${ln ? ` i ${ln.name}` : ''}.` : `${n} har ikke lagt til noe${ln ? ` i ${ln.name}` : ''}.`, items: R };
  }
  const sist = /sist\s+(?:kjøpte|kjøpt|handlet)\s+(?:vi\s+|jeg\s+)?([\wæøå ]+)|(?:kjøpte|kjøpt)\s+(?:vi|jeg)\s+sist\s+([\wæøå ]+)/.exec(low);
  if (sist) {
    const term = (sist[1] || sist[2] || '').replace(/\?/g, '').trim();
    const D = items.filter((x) => x.done && x.n.toLowerCase().includes(term)).sort((a, b) => (+b.doneAt || 0) - (+a.doneAt || 0))[0];
    return { text: D ? `Sist krysset av «${D.n}» ${new Date(+D.doneAt || Date.now()).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}${D.whoName ? ` (${D.whoName})` : ''}.` : `Finner ikke «${term}» blant fullførte gjøremål.`, items: D ? [D] : [] };
  }
  if (/forfalt/.test(low)) { const R = op.filter((x) => x.due && x.due < today); return { text: R.length ? `${R.length} er forfalt.` : 'Ingenting er forfalt.', items: R }; }
  return null;
}

/** Deloppgaver fra lokale maler (flytting, hytte, bursdag, filter, domene). */
export function splitSugg(n) {
  const low = String(n).toLowerCase();
  if (/flytt/.test(low)) return ['Bestill flyttebil', 'Pakk kjøkken', 'Pakk klær', 'Meld adresseendring', 'Vask ut'];
  if (/hytt/.test(low)) return ['Sjekk vær og føre', 'Handle mat', 'Pakk bilen', 'Ta med nøkler'];
  if (/bursdag|gave|selskap/.test(low)) return ['Kjøp gave', 'Bestill kake', 'Send invitasjon', 'Pynt'];
  if (/filter|ventilasjon/.test(low)) return ['Finn riktig filterstørrelse', 'Bestill filter', 'Bytt filter', 'Noter dato for neste bytte'];
  if (/domene|forny/.test(low)) return ['Sjekk utløpsdato', 'Logg inn hos registrar', 'Betal fornyelse'];
  return ['Finn ut hva som trengs', 'Gjør det', 'Sjekk at det er ferdig'];
}

export const PACK = ['Sengetøy og håndklær', 'Mat til helgen', 'Ved og tennbriketter', 'Ski og skismøring', 'Ladere', 'Søppelsekker'];
export const MAT_FALLBACK = [['Spaghetti bolognese', ['400 g kjøttdeig', '1 løk', '2 fedd hvitløk', '1 boks hakkede tomater', '400 g spaghetti']], ['Kyllingwok', ['500 g kyllingfilet', '1 pose wokgrønnsaker', 'Soyasaus', 'Ris']], ['Taco', ['400 g kjøttdeig', 'Tacokrydder', 'Tortillalefser', 'Salat', 'Rømme']]];

/** Like oppgaver (samme tittel i samme liste, ikke ferdige). → [{key, n, l, ids}] */
export function dupes(items) {
  const m = new Map();
  for (const x of items) { if (x.done) continue; const k = `${x.l}|${x.n.trim().toLowerCase()}`; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.values()].filter((a) => a.length > 1).map((a) => ({ n: a[0].n, l: a[0].l, ids: a.map((x) => x.id) }));
}
