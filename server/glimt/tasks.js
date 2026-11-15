// Prompt 46 (GLIMT46): bedre norsk i Gjøremål (claude-code-gjoremal-glimt-norsk.md).
// Rotårsak: modellen fikk skrive om brukerens tekst («Hvert gjøremål starter med et verb i imperativ», «Rett åpenbare skrivefeil»),
// og en 8–12B-modell skriver dårligere norsk enn brukeren. Nå plukker modellen ut deler av teksten (tegnposisjoner + den ordrette
// teksten), og koden klipper titlene ut av originalen. Bare fyllord i starten («husk å», «jeg må», «minn meg på å» …) og dato/tid
// fjernes, og første bokstav blir stor. Hver tittel kontrolleres mot originalen; en tittel som ikke finnes der, byttes med brukerens
// egne ord (lokal oppdeling, ellers det lengste ordrette stykket).
const LEAD = /^\s*(?:(?:og|men|så)\s+)?(?:(?:husk|huske)\s+(?:på\s+)?(?:å|at)\s+|(?:jeg|vi|du|dere)\s+(?:må|skal)\s+(?:huske\s+(?:på\s+)?(?:å\s+)?)?|(?:må|skal)\s+(?:huske\s+(?:å\s+)?)?|(?:kan\s+du\s+)?(?:minne|minn|påminn)\s+meg\s+(?:på|om)\s+(?:å|at)\s+|at\s+(?:jeg|vi)\s+(?:må|skal)\s+|ikke\s+glem\s+(?:å\s+)?|husk\s+)/i;
const TIME_TAIL = /\s*(?:,\s*)?(?:(?:i\s+(?:dag|morgen|overmorgen|kveld|helga|helgen)|neste\s+uke|innen\s+\S+|før\s+(?:helga|helgen|jul)|(?:på|til|innen)\s+(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|(?:kl\.?|klokka|klokken)\s*\d{1,2}(?:[.:]\d{2})?))\s*$/i;
const cap = (s) => String(s ?? '').replace(/^\s*(\p{L})/u, (m, c) => m.replace(c, c.toUpperCase()));
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFC').replace(/[.,;:!?«»"()]/g, ' ').replace(/\s+/g, ' ').trim();

/** Fjerner bare fyllord i starten og dato/tid til slutt. Resten er ordrett. */
export function trimSpan46(s) {
  let t = String(s ?? '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) { const b = t; t = t.replace(LEAD, '').replace(/^(?:å|at)\s+/i, '').trim(); if (b === t) break; }
  for (let i = 0; i < 3; i++) { const b = t; t = t.replace(TIME_TAIL, '').trim(); if (b === t) break; }
  return cap(t.replace(/^[\s,.;:–-]+|[\s,.;:!?–-]+$/g, ''));
}
// Småord som kan stå i en ryddet tittel uten å være «nye ord» (bøying og rekkefølge holdes ellers fra brukeren).
const GLUE = new Set(['og', 'i', 'på', 'til', 'fra', 'med', 'som', 'skal', 'for', 'av', 'en', 'et', 'ei', 'den', 'det', 'de', 'hjem', 'om']);
/**
 * Bruker tittelen bare brukerens ord? Hvert ord må stå i originalen, være samme ord med annen endelse (felles stamme på minst
 * fire bokstaver: «pakke/pakken», «levere/lever») eller et småord. Nye innholdsord (svenske/danske/engelske ord, oppdiktede verb) avvises.
 */
export function userWords46(title, text) {
  const xw = fold(text).split(' ').filter(Boolean);
  return fold(title).split(' ').filter(Boolean).every((w) => GLUE.has(w) || xw.includes(w) || (w.length >= 4 && xw.some((x) => x.length >= 4 && (x.startsWith(w.slice(0, 4)) && Math.abs(x.length - w.length) <= 3))));
}
/** Finnes tittelen ordrett (uten store/små bokstaver og tegnsetting) i originalen? */
export function inOriginal46(title, text) {
  const a = fold(title), b = ` ${fold(text)} `;
  return !!a && b.includes(` ${a} `);
}
/** Lengste sammenhengende ordrette stykke av `title` som finnes i `text` (minst 2 ord), eller ''. */
function bestSpan(title, text) {
  const tw = fold(title).split(' '), xw = fold(text).split(' ');
  let best = [0, 0, -1];
  for (let i = 0; i < xw.length; i++) for (let j = 0; j < tw.length; j++) {
    let k = 0; while (xw[i + k] && tw[j + k] && xw[i + k] === tw[j + k]) k++;
    if (k > best[1]) best = [i, k, j];
  }
  if (best[1] < 2) return '';
  // Bruk originalens ord (med tegnsetting og store bokstaver) for stykket.
  const raw = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const map = []; raw.forEach((w, idx) => { if (fold(w)) map.push(idx); });
  const from = map[best[0]], to = map[best[0] + best[1] - 1];
  return from == null || to == null ? '' : raw.slice(from, to + 1).join(' ').replace(/[,;:.!?]+$/, '');
}

/** Ny kontrakt til modellen: plukk ut, ikke skriv om. Bokmål, tre korte eksempler, ingen engelske instrukser. */
export function prompt46(text, { lists = [], people = [], today }) {
  const wd = new Date(`${today}T12:00:00Z`).toLocaleDateString('nb-NO', { weekday: 'long', timeZone: 'UTC' });
  const src = String(text).slice(0, 1500);
  return `I dag er ${wd} ${today}. Lister: ${lists.map((l) => l.name).join(', ') || 'Hjem'}. Familie: ${people.join(', ') || '–'}.\n`
    + 'Finn gjøremålene i beskjeden. IKKE skriv om teksten: for hvert gjøremål, oppgi start og slutt (tegnposisjon i beskjeden) og kopier teksten ordrett i «tekst».\n'
    + 'Ta ikke med «husk å», «jeg må», «minn meg på å» eller dato og tid i «tekst». Dato/tid skrives i «frist» slik brukeren skrev den. Ikke finn på noe.\n'
    + 'Svar KUN med JSON: {"items":[{"start":0,"slutt":0,"tekst":"…","frist":null,"liste":null,"hvem":null}]}\n'
    + 'Eksempler:\n'
    + '«Husk å kjøpe melk i morgen» → {"items":[{"start":7,"slutt":17,"tekst":"kjøpe melk","frist":"i morgen"}]}\n'
    + '«Ringe tannlegen og bestille time til Pål» → {"items":[{"start":0,"slutt":40,"tekst":"Ringe tannlegen og bestille time til Pål","frist":null}]}\n'
    + '«vaske bilen, hente pakken på posten» → {"items":[{"start":0,"slutt":11,"tekst":"vaske bilen"},{"start":13,"slutt":36,"tekst":"hente pakken på posten"}]}\n'
    + `Beskjed: «${src}»`;
}
export const TASK_SCHEMA46 = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { start: { type: 'integer' }, slutt: { type: 'integer' }, tekst: { type: 'string' }, frist: { type: ['string', 'null'] }, liste: { type: ['string', 'null'] }, hvem: { type: ['string', 'null'] } }, required: ['tekst'] } } }, required: ['items'] };

/**
 * Modellens svar (posisjoner/ordrett tekst, eller gammel kontrakt med title/n) → {items:[{n, note, date, dueText, list, who, after}]} med titler
 * klippet ut av originalen. null når ingenting kan brukes (da tar den lokale tolkeren over).
 */
export function normalize46(j, text, prev = null) {
  if (!j) return j;
  if (typeof j === 'string' || (typeof j.text === 'string' && !j.items && !j.tasks)) {
    const raw = String(typeof j === 'string' ? j : j.text).replace(/```(?:json)?/gi, '').trim();
    try { j = { ...(typeof j === 'object' ? j : {}), ...JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) }; } catch { return null; }
  }
  const src = String(text ?? '');
  const list = Array.isArray(j.items) ? j.items : Array.isArray(j.tasks) ? j.tasks : null;
  if (!list) return prev ? prev(j) : j;
  const items = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const s = Number.isInteger(it.start) ? it.start : null, e = Number.isInteger(it.slutt ?? it.end) ? (it.slutt ?? it.end) : null;
    const quoted = String(it.tekst ?? it.text ?? '').trim();
    let span = '';
    if (s != null && e != null && s >= 0 && e > s && e <= src.length) span = src.slice(s, e);
    // Posisjonene stemmer ikke med den ordrette teksten (vanlig for små modeller): finn teksten i originalen.
    if (quoted && (!span || fold(span) !== fold(quoted))) { const i = src.toLowerCase().indexOf(quoted.toLowerCase()); if (i >= 0) span = src.slice(i, i + quoted.length); else if (!span) span = ''; }
    const old = String(it.title ?? it.n ?? '').trim();
    // Gammel kontrakt (title/n uten posisjoner): tittelen beholdes her; etterkontrollen (keepUserWords46) avgjør om den er brukerens ord.
    if (!span && old && !quoted) { items.push({ n: cap(old.slice(0, 200)), note: it.note ?? null, date: /^\d{4}-\d{2}-\d{2}$/.test(it.due ?? '') ? it.due : null, dueText: it.dueText ?? null, place: it.place ?? null, list: it.list ?? null, who: it.who ?? null, after: Number.isInteger(it.linkTo ?? it.after) ? (it.linkTo ?? it.after) : null }); continue; }
    if (!span && quoted) span = bestSpan(quoted, src);
    const n = trimSpan46(span);
    if (n.length < 2) continue;
    items.push({ n, note: it.note ?? null, date: /^\d{4}-\d{2}-\d{2}$/.test(it.due ?? '') ? it.due : null, dueText: it.frist ?? it.dueText ?? null, place: it.place ?? null, list: it.liste ?? it.list ?? null,
      who: it.hvem ?? it.who ?? null, after: Number.isInteger(it.linkTo ?? it.after) ? (it.linkTo ?? it.after) : null, verbatim: true });
  }
  return items.length ? { ...j, items } : null;
}

/**
 * Etterkontroll for alle Gjøremål-veier: titler fra modellen som ikke finnes ordrett i brukerens tekst byttes med brukerens egne ord
 * (samme punkt fra den lokale oppdelingen, ellers det lengste ordrette stykket). → items (samme form)
 */
export function keepUserWords46(text, items, local = []) {
  if (!Array.isArray(items)) return items;
  const used = new Set();
  return items.map((it) => {
    const n = String(it?.n ?? '');
    if (!n || inOriginal46(n, text) || inOriginal46(trimSpan46(n), text)) return it;
    // Samme punkt i den lokale oppdelingen (flest felles ord).
    const words = new Set(fold(n).split(' ').filter((w) => w.length > 2));
    let best = null, score = 0;
    (local ?? []).forEach((l, i) => { if (used.has(i)) return; const s = fold(l.n).split(' ').filter((w) => words.has(w)).length; if (s > score) { score = s; best = i; } });
    if (best != null && score >= 1) { used.add(best); return { ...it, n: local[best].n, rewritten: n }; }
    const span = trimSpan46(bestSpan(n, text));
    if (span.length >= 2) return { ...it, n: span, rewritten: n };
    // Ett punkt og ingenting ordrett: originalteksten (uten fyllord og dato) er tittelen.
    if (items.length === 1) { const whole = trimSpan46(text); if (whole.length >= 2) return { ...it, n: whole.slice(0, 200), rewritten: n }; }
    return it;
  });
}

/* ---------------- Kobles inn i Gjøremål (tasks-glimt41/42) ---------------- */

let installed = false;
/** Bytter prompt og tolking i Gjøremål-jobben (prompt 42-krokene) til «plukk ut, ikke skriv om». */
export async function installTaskHooks46() {
  if (installed) return; installed = true;
  try {
    const m41 = await import('../tasks-glimt41.js');
    await import('../tasks-glimt42.js'); // 42 setter sine kroker først; våre erstatter prompt og tolking
    const prev = m41._hooks42.normalize;
    Object.assign(m41._hooks42, { prompt: prompt46, normalize: (j, text) => normalize46(j, text, prev), verbatim: keepUserWords46 });
  } catch (e) { console.warn('[glimt46] gjøremål-kroker:', e.message); }
}
