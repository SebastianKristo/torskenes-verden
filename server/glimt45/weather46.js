// Prompt 46 (GLIMT46): sammensatte værspørsmål (claude-code-glimt-vaer-sammensatte-sporsmal.md).
// «Hvordan er været i Oslo i dag og temperaturen i New York i morgen?» → to delspørsmål {sted, tid, hva} → to kall til den
// eksisterende værtjenesten (weather35.placeWeather: MET for Norge, Open-Meteo med timezone=auto ellers), parallelt.
//
// Oppdelingen er generell (ikke én regel per setning): teksten deles i ledd på «, og», «og» + nytt spørreledd og «?»; hvert ledd
// får steder (lister med «og/eller/,»), tidsuttrykk og informasjonstype. Ledd uten sted arver forrige sted («… nå, og hvordan blir
// den i morgen?»), ledd uten tid arver forrige tid. Relative datoer regnes fra dagens dato i Oslo; prognosedagen velges på dato i
// stedets egen tidssone (Open-Meteo gir dagene lokalt), så «i morgen» i New York er stedets dag med samme dato.
import { parseDate45, parseWindow47, addDays45, mondayOf45, todayOslo45, nowMinOslo45, WD45, MON45 } from './dates.js';

const L = (s) => String(s ?? '').toLowerCase();
export const WEATHER_WORDS46 = /(?<![a-zæøå])(vær(?:et|meldingen)?|temperatur(?:en)?|grader|varm(?:t|ere|est)?|kald(?:t|ere|est)?|regn(?:er|e)?|nedbør|paraply|snø(?:r)?|vind(?:en|fullt)?|sol(?:fylt)?|skyet|prognose(?:n)?|yr)(?![a-zæøå])/i;
const INFO = [['precip', /regn|nedbør|paraply|snø|byge/], ['wind', /vind|blåse|storm/], ['temp', /temperatur|grader|varm|kald|hvor\s+varmt|hvor\s+kaldt/], ['summary', /vær|prognose|sol|skyet|yr/]];
const COMPARE = /(?<![a-zæøå])(sammenlign\w*|varmere|kaldere|varmest|kaldest|mer\s+regn|mest\s+regn|forskjell)(?![a-zæøå])|\beller\b/;

/* ---------------- Tid ---------------- */

const WD = '(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)';
const TIME_RE = new RegExp([
  // Prompt 47: timevinduer først («neste time», «om 2 timer», «de neste 3 timene», «i morgen tidlig/kveld»).
  '(?:den\\s+)?(?:neste|kommende)\\s+timen?', 'de\\s+neste\\s+(?:\\d{1,2}|to|tre|fire|fem|seks)\\s+timene', 'om\\s+(?:\\d{1,3}|en|ei|ett|to|tre|fire|fem|seks|en\\s+halv|halvannen)\\s+(?:timer?|t|minutt(?:er)?|min)', 'om\\s+(?:en\\s+halvtime|et{1,2}\\s+kvarter)',
  'i\\s+morgen\\s+(?:tidlig|kveld)', 'i\\s+ettermiddag',
  '(?:akkurat\\s+)?nå(?![a-zæøå])', 'i\\s+dag', 'idag', 'i\\s+morgen(?:\\s+tidlig)?', 'imorgen', 'i\\s+overmorgen', 'overmorgen', 'i\\s+kveld', 'i\\s+natt',
  '(?:til|i|denne)\\s+helg(?:en|a)?', 'neste\\s+helg(?:en|a)?', 'neste\\s+uke', 'denne\\s+uk(?:en|a)', 'resten\\s+av\\s+uk(?:a|en)', 'de\\s+neste\\s+(?:dagene|\\d\\s+dagene)',
  `(?:på\\s+|neste\\s+|til\\s+)?${WD}(?:en)?`, '\\d{1,2}\\.\\s*\\d{1,2}\\.?(?:\\d{2,4})?', `\\d{1,2}\\.\\s*(?:${MON45.join('|')})`,
].map((x) => `(?<![a-zæøå\\d])${x}(?![a-zæøå])`).join('|'), 'gi');

/** Tidsuttrykk → {kind:'now'|'day'|'range', from, to, label} (datoer i Oslo). */
export function whenOf46(raw, today = todayOslo45(), nowMin = null) {
  const t = L(raw).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // Prompt 47: timevinduer fra den felles datoparseren (dates.js). offset = dager fra i dag, så værverktøyet kan regne vinduet om
  // til stedets egen tidssone.
  const win = parseWindow47(t, today, nowMin ?? nowMinOslo45());
  if (win) return { kind: win.kind === 'hour' ? 'hour' : 'part', from: win.from, to: win.to, fromMin: win.fromMin, toMin: win.toMin, offset: win.offset, label: win.label };
  if (/nå$/.test(t)) return { kind: 'now', from: today, to: today, label: 'nå' };
  if (/^(i dag|idag)$/.test(t)) return { kind: 'day', from: today, to: today, label: 'i dag', offset: 0 };
  if (/^(i morgen|imorgen)/.test(t)) { const d = addDays45(today, 1); return { kind: 'day', from: d, to: d, label: 'i morgen', offset: 1 }; }
  if (/overmorgen/.test(t)) { const d = addDays45(today, 2); return { kind: 'day', from: d, to: d, label: 'i overmorgen', offset: 2 }; }
  const wd = (today0) => (new Date(`${today0}T00:00:00Z`).getUTCDay());
  if (/helg/.test(t)) {
    const m0 = mondayOf45(today);
    let sat = addDays45(m0, 5);
    if (/neste/.test(t) || wd(today) === 0) sat = addDays45(sat, 7);
    const from = wd(today) === 6 && !/neste/.test(t) ? today : sat;
    return { kind: 'range', from, to: addDays45(sat, 1), label: /neste/.test(t) ? 'neste helg' : 'i helgen' };
  }
  if (/neste uke/.test(t)) { const m0 = mondayOf45(addDays45(today, 7)); return { kind: 'range', from: m0, to: addDays45(m0, 6), label: 'neste uke' }; }
  if (/denne uk|resten av uk/.test(t)) { const m0 = mondayOf45(today); return { kind: 'range', from: today, to: addDays45(m0, 6), label: 'resten av uka' }; }
  if (/de neste/.test(t)) { const n = +(t.match(/\d/)?.[0] ?? 3); return { kind: 'range', from: today, to: addDays45(today, Math.max(1, n) - 1), label: `de neste ${n} dagene` }; }
  const d = parseDate45(t.replace(/^til\s+/, ''), today, { prefer: 'future' });
  if (d?.date) return { kind: 'day', from: d.date, to: d.date, label: dayLabel(d.date, today) };
  return null;
}
export function dayLabel(date, today) {
  if (date === today) return 'i dag';
  if (date === addDays45(today, 1)) return 'i morgen';
  const x = new Date(`${date}T00:00:00Z`);
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  return diff > 0 && diff < 7 ? WD45[x.getUTCDay()] : `${WD45[x.getUTCDay()]} ${x.getUTCDate()}. ${MON45[x.getUTCMonth()]}`;
}

/* ---------------- Steder ---------------- */

const NOT_PLACE = /^(dag|morgen|kveld|natt|helg\w*|uke\w*|det|den|de|dem|været|vær|temperaturen|regn|morges|ettermiddag|formiddag|løpet|går|tre\s+byer|to\s+byer|flere\s+byer|byer|byene|begge|morra|overmorgen|nærheten|området|hele|år|da|nå)$/i;
const STOP_AFTER_PLACE = new RegExp(`\\s+(?:i\\s+dag|idag|i\\s+morgen|imorgen|i\\s+overmorgen|overmorgen|i\\s+kveld|i\\s+natt|(?:til|i|denne|neste)\\s+helg\\w*|neste\\s+uke|denne\\s+uk\\w*|resten\\s+av|de\\s+neste|(?:den\\s+)?(?:neste|kommende)\\s+timen?|i\\s+ettermiddag|om\\s+(?:en|ei|ett|to|tre|fire|fem|seks)\\s|(?:akkurat\\s+)?nå|(?:på|neste|til)\\s+${WD}|${WD}|\\d{1,2}\\.|om\\s+\\d|kl\\.?|klokka|da|egentlig|for\\s+tiden|og\\s+(?:hva|hvordan|hvor|blir|er|regner|temperatur\\w*|været|vind\\w*)|og\\s+(?:i|på)\\s|eller\\s+(?:i|på)\\s|sammenlignet|enn|mot)(?![a-zæøå])`, 'i');
const titleCase = (s) => s.split(/\s+/).map((w) => (w === w.toLowerCase() && !/^(de|la|le|del|am|upon|og)$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
/** Stedene i et ledd («i Oslo og Stockholm», «i Oslo eller New York», «Oslo, Bergen og Trondheim»). */
export function placesIn46(clause) {
  const src = String(clause ?? '').replace(/[«»"“”]/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  for (const m of src.matchAll(/(?:^|\s)(?:i|på|in|for|ved|rundt)\s+/gi)) {
    let rest = src.slice(m.index + m[0].length);
    if (new RegExp(`^(?:dag|morgen|overmorgen|kveld|natt|helg\\w*|uk\\w*|år|løpet|${WD})(?![a-zæøå])`, 'i').test(rest)) continue;
    rest = rest.split(/[?!;:()]|\.(?=\s|$)/)[0];
    const stop = rest.search(STOP_AFTER_PLACE);
    if (stop >= 0) rest = rest.slice(0, stop);
    for (let part of rest.split(/\s*,\s*|\s+og\s+|\s+eller\s+/)) {
      part = part.replace(/^(?:i|på)\s+/i, '').replace(/\s+(?:nå|da|egentlig|akkurat)$/i, '').trim();
      if (!part || part.length < 2 || part.length > 40 || /^\d/.test(part) || NOT_PLACE.test(part) || part.split(/\s+/).length > 3) continue;
      if (/^(været|vær|regn|temperaturen|grader)$/i.test(part)) continue;
      const name = titleCase(part);
      if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
    }
  }
  return out;
}

/* ---------------- Oppdeling ---------------- */

// Ledd skilles på «, og», «, men», «;», «?» og «og»/«,» foran et nytt spørreledd (ikke «og» i en stedsliste).
const CLAUSE_SPLIT = /\s*[?;]\s*|\s*,\s*(?:og|men)\s+|\s+(?:og|men)\s+(?=(?:hva|hvordan|hvor|blir|er|regner|snør|temperatur\w*|været|vær|vind\w*|nedbør|i\s+[a-zæøå]+\s+(?:i|på)\s|(?:i|på)\s+\p{Lu}))\s*|\s*,\s*(?=(?:hva|hvordan|hvor|blir|er|regner|temperatur\w*|været|og\s|i\s+\p{Lu}|i\s+[a-zæøå]{3,}\s+(?:i|på)\s|(?:i|på)\s+\p{Lu}))/u;
/**
 * Deler et værspørsmål i delspørsmål. → {requests:[{place|null, when:{kind,from,to,label}, info, clause}], compare:{mode}|null, ask?}
 * place null = brukerens eget sted.
 */
export function analyzeWeather46(text, today = todayOslo45(), nowMin = null) {
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  const clauses = src.split(CLAUSE_SPLIT).map((s) => s.trim()).filter(Boolean);
  const reqs = [];
  let lastPlaces = null, lastWhen = null, lastInfo = null;
  const allWhen = [...src.matchAll(TIME_RE)].length;
  for (const c of clauses) {
    const lc = L(c);
    const places = placesIn46(c);
    const times = [...c.matchAll(TIME_RE)].map((m) => whenOf46(m[0], today, nowMin)).filter(Boolean);
    const info = INFO.find(([, re]) => re.test(lc))?.[0] ?? null;
    if (!places.length && !times.length && !info) continue;
    const ps = places.length ? places : lastPlaces ?? [null];
    const ws = times.length ? times : [lastWhen ?? (allWhen ? null : { kind: /temperatur|grader/.test(lc) ? 'now' : 'day', from: today, to: today, label: /temperatur|grader/.test(lc) ? 'nå' : 'i dag' })];
    // Prompt 47 (feilretting): ledd uten egen tid fikk ws = [null] når et senere ledd har tid, og `if (w)` droppet hele
    // delspørsmålet («været i Oslo og i New York i morgen» ga bare New York). Nå tas det med, og tiden fylles inn under.
    for (const p of ps) for (const w of ws) reqs.push({ place: p, when: w, info: info ?? lastInfo ?? 'summary', clause: c });
    if (places.length) lastPlaces = places;
    if (times.length) lastWhen = times[times.length - 1];
    if (info) lastInfo = info;
  }
  // Ledd uten tid fikk null over (fordi en senere del har tid): bruk tiden fra neste ledd med tid, ellers i dag.
  for (let i = 0; i < reqs.length; i++) if (!reqs[i].when) reqs[i].when = reqs.slice(i + 1).find((r) => r.when)?.when ?? { kind: 'day', from: today, to: today, label: 'i dag' };
  // Duplikater (samme sted + tid) slås sammen; informasjonstypen fra første.
  const seen = new Set();
  const requests = reqs.filter((r) => { const k = `${L(r.place)}|${r.when.from}|${r.when.to}|${r.when.kind}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  const lt = L(src);
  const mode = /kaldere|kaldest/.test(lt) ? 'colder' : /varmere|varmest/.test(lt) ? 'warmer' : /mer\s+regn|mest\s+regn/.test(lt) ? 'wetter' : /sammenlign|forskjell|\beller\b/.test(lt) ? 'compare' : null;
  const compare = mode && new Set(requests.map((r) => L(r.place))).size > 1 ? { mode } : null;
  const needPlaces = /(?<![a-zæøå])(to|tre|fire|fem|flere)\s+(?:byer|steder)/.exec(lt);
  if (needPlaces && new Set(requests.map((r) => L(r.place)).filter((x) => x !== 'null')).size < 2) return { requests: [], compare: null, ask: `Hvilke ${needPlaces[1] === 'flere' ? '' : `${needPlaces[1]} `}byer vil du sammenligne?` };
  return { requests, compare };
}
/** Trenger spørsmålet motoren (flere delspørsmål, en periode eller en sammenligning), eller holder det gamle værsvaret? */
export function isCompoundWeather46(text, today = todayOslo45(), nowMin = null) {
  if (!WEATHER_WORDS46.test(String(text ?? ''))) return false;
  const a = analyzeWeather46(text, today, nowMin);
  if (a.ask) return true;
  return a.requests.length > 1 || !!a.compare || a.requests.some((r) => r.when.kind === 'range' && r.place);
}

/* ---------------- Henting ---------------- */

let fetchImpl = null;
/** Bare for tester: (sted|null, {user}) → placeWeather-svar ({place, now, days:[{date, hi, lo, cond, precipProb, ic}], source}) eller kast. */
export const _setWeather46 = (fn) => { fetchImpl = fn ?? null; };
async function homePlace(user) {
  try {
    const { kv } = await import('../db.js');
    const list = kv.get(user, 'wx_places', null);
    const own = Array.isArray(list) && list[0]?.name ? list[0].name : null;
    return own ?? 'Oslo';
  } catch { return 'Oslo'; }
}
/** Ett delspørsmål → {ok, place, when, info, now?, days:[…], missing?, error?, notFound?, suggest?} */
export async function fetchWeather46(user, req, today = todayOslo45()) {
  const name = req.place ?? await homePlace(user);
  let r;
  try {
    r = fetchImpl ? await fetchImpl(name, { user }) : await (await import('../weather35.js')).placeWeather(name, { offset: 0 });
  } catch (e) {
    if (e?.status === 404 || /fant ikke stedet/i.test(String(e?.message))) return { ok: false, notFound: true, place: name, when: req.when, info: req.info, error: `Fant ikke stedet «${name}»`, suggest: e?.suggest ?? null };
    return { ok: false, place: name, when: req.when, info: req.info, error: `Fikk ikke hentet været for ${name} (${String(e?.message ?? e).slice(0, 80)})` };
  }
  const label = r.place?.label ?? r.place?.name ?? name;
  const tz = r.place?.tz ?? 'Europe/Oslo';
  let days = (r.days ?? []).filter(Boolean);
  // Prompt 47: tidsvinduer regnes i stedets tidssone. «i morgen» i New York = stedets lokale dato i morgen (avviket mellom stedets og
  // Oslos dato akkurat nå legges til), og «neste time» er de neste 60 minuttene, vist i stedets lokale klokkeslett.
  const shift = dayShift(tz);
  const when = shift && req.when.offset != null ? { ...req.when, from: addDays45(req.when.from, shift), to: addDays45(req.when.to, shift), tz } : { ...req.when, tz };
  req = { ...req, when };
  if (req.when.kind === 'hour' || req.when.kind === 'part') {
    const a = osloMs(today, req.when.fromMin, req.when.offset ?? 0), b = a + (((req.when.toMin - req.when.fromMin) + 1440) % 1440 || 1440) * 60_000;
    const hrs = (r.hours ?? []).map((h) => ({ ...h, ms: localMs(h.t, tz) })).filter((h) => Number.isFinite(h.ms) && h.ms + 3600_000 > a && h.ms < b);
    const span = `kl. ${hmIn(a, tz)}–${hmIn(b, tz)}`;
    if (hrs.length) return { ok: true, place: label, placeInfo: r.place ?? null, when: { ...req.when, span }, info: req.info, hours: hrs.slice(0, 8).map(({ ms, ...h }) => ({ ...h, local: hmIn(ms, tz) })), now: r.now ?? null, source: r.source };
    // Ingen timeprognose (eldre kilde): «neste time» = været nå.
    if (req.when.kind === 'hour' && r.now?.temp != null) return { ok: true, place: label, placeInfo: r.place ?? null, when: { ...req.when, span }, info: req.info, hours: [{ t: null, local: hmIn(a, tz), temp: r.now.temp, code: r.now.code, cond: r.now.cond, wind: r.now.wind, precip: null }], now: r.now, source: r.source, fromNow: true };
    return { ok: false, missing: true, place: label, when: req.when, info: req.info, error: `Værtjenesten ga ingen timeprognose for ${label} ${req.when.label}` };
  }
  if (req.when.kind === 'now') {
    if (r.now?.temp == null) return { ok: false, missing: true, place: label, when: req.when, info: req.info, error: `Værtjenesten ga ingen temperatur for ${label} akkurat nå` };
    return { ok: true, place: label, placeInfo: r.place ?? null, when: req.when, info: req.info, now: r.now, today: days.find((d) => d.date === today) ?? days[0] ?? null, source: r.source };
  }
  const want = days.filter((d) => d.date >= req.when.from && d.date <= req.when.to);
  const usable = want.filter((d) => d.hi != null || d.lo != null);
  if (!usable.length) {
    const last = days.at(-1)?.date ?? null;
    return { ok: false, missing: true, place: label, when: req.when, info: req.info, error: last && req.when.from > last ? `Prognosen for ${label} rekker bare til ${dayLabel(last, today)}` : `Værtjenesten ga ingen prognose for ${label} ${req.when.label}` };
  }
  const partial = req.when.kind === 'range' && usable.at(-1).date < req.when.to ? usable.at(-1).date : null;
  return { ok: true, place: label, placeInfo: r.place ?? null, when: req.when, info: req.info, days: usable, partialTo: partial, source: r.source };
}

/* Prompt 47: tidssone-hjelpere (Intl, ingen avhengigheter). */
function partsIn(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
const offsetMs = (ms, tz) => { const p = partsIn(ms, tz); return Date.parse(`${p.date}T${p.hm}:00Z`) - Math.floor(ms / 60_000) * 60_000; };
/** Lokal tid «YYYY-MM-DDTHH:MM» i tz → ms. */
export function localMs(t, tz) { if (!t) return NaN; const guess = Date.parse(`${String(t).slice(0, 16)}:00Z`); if (!Number.isFinite(guess)) return NaN; return guess - offsetMs(guess - offsetMs(guess, tz), tz); }
const osloMs = (date, min, offset = 0) => localMs(`${addDays45(date, offset + Math.floor(min / 1440))}T${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, 'Europe/Oslo');
const hmIn = (ms, tz) => partsIn(ms, tz).hm;
/** Hvor mange dager stedets dato ligger foran/bak Oslos akkurat nå (New York om morgenen = −1 før kl. 06 i Oslo). */
function dayShift(tz) {
  if (!tz || tz === 'Europe/Oslo') return 0;
  try { const now = Date.now(); const a = partsIn(now, tz).date, b = partsIn(now, 'Europe/Oslo').date; return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5); } catch { return 0; }
}

/* ---------------- Svartekst ---------------- */

const deg = (v) => `${v}°`;
const cap = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());
const rainWord = (p) => (p >= 60 ? 'Ja, det ser ut til å bli nedbør' : p >= 30 ? 'Kanskje – det er en viss sjanse for nedbør' : 'Neppe – det ser tørt ut');
/** Én setning per delresultat. Temperaturen sier alltid hva den er (nå, maks/min). */
export function weatherSentence46(r, today = todayOslo45()) {
  if (!r.ok) return `${r.error}.${r.suggest ? ` Mente du ${r.suggest}?` : ''}`;
  const P = r.place;
  if (r.when.kind === 'hour' || r.when.kind === 'part') {
    const hs = r.hours ?? [];
    const temps = hs.map((h) => h.temp).filter((v) => v != null);
    const mm = Math.round(hs.reduce((a, h) => a + (Number(h.precip) || 0), 0) * 10) / 10;
    const wind = Math.max(...hs.map((h) => h.wind ?? 0));
    const cond = String(hs[0]?.cond ?? '').toLowerCase();
    const t = temps.length ? (Math.min(...temps) === Math.max(...temps) ? deg(temps[0]) : `${Math.min(...temps)}–${Math.max(...temps)}°`) : '–';
    return `I ${P} ${r.when.label} (${r.when.span}${r.when.tz && r.when.tz !== 'Europe/Oslo' ? ' lokal tid' : ''}): **${t}**${cond ? `, ${cond}` : ''}, ${mm ? `${String(mm).replace('.', ',')} mm nedbør` : 'ingen nedbør'}, vind ${wind} m/s.`;
  }
  if (r.when.kind === 'now') {
    const n = r.now;
    if (r.info === 'precip') return `I ${P} nå: ${String(n.cond ?? '').toLowerCase() || 'ukjent vær'}, **${deg(n.temp)}**.${r.today ? ` ${r.today.precipProb ?? 0} % sjanse for nedbør i dag.` : ''}`;
    if (r.info === 'wind') return `I ${P} nå: vind **${n.wind ?? '–'} m/s**, ${deg(n.temp)}.`;
    return `I ${P} er det **${deg(n.temp)}** nå${n.cond ? ` (${String(n.cond).toLowerCase()})` : ''}.${r.info === 'summary' && r.today ? ` I dag ${r.today.lo}–${r.today.hi}°.` : ''}`;
  }
  if (r.when.kind === 'range' || r.days.length > 1) {
    const hiD = r.days.reduce((a, b) => ((b.hi ?? -99) > (a.hi ?? -99) ? b : a));
    const loD = r.days.reduce((a, b) => ((b.lo ?? 99) < (a.lo ?? 99) ? b : a));
    const wet = r.days.filter((d) => (d.precipProb ?? 0) >= 50).map((d) => dayLabel(d.date, today));
    const span = `${cap(r.when.label)} i ${P}`;
    const part = r.partialTo ? ` (prognosen går til ${dayLabel(r.partialTo, today)})` : '';
    if (r.info === 'precip') return `${span}${part}: ${wet.length ? `nedbør er sannsynlig **${wet.join(', ')}**` : '**lite nedbør** i prognosen'}.`;
    return `${span}${part}: maks **${deg(hiD.hi)}** (${dayLabel(hiD.date, today)}), min ${deg(loD.lo)} (${dayLabel(loD.date, today)}).${wet.length ? ` Nedbør sannsynlig ${wet.join(', ')}.` : ''}`;
  }
  const d = r.days[0];
  const when = cap(dayLabel(d.date, today));
  if (r.info === 'precip') return `${when} i ${P}: ${rainWord(d.precipProb ?? 0)} (**${d.precipProb ?? 0} %**), ${String(d.cond ?? '').toLowerCase()}, ${d.lo}–${d.hi}°.`;
  if (r.info === 'temp') return `${when} i ${P}: maks **${deg(d.hi)}**, min ${deg(d.lo)}.`;
  return `${when} i ${P}: **${String(d.cond ?? 'ukjent').toLowerCase()}, ${d.lo}–${d.hi}°** (min–maks), ${d.precipProb ?? 0} % sjanse for nedbør.`;
}
/** Sammenligning på tvers av delresultatene (bare de som lyktes). → setning | null */
export function weatherCompare46(results, mode) {
  const ok = results.filter((r) => r.ok);
  if (ok.length < 2) return null;
  const val = (r) => (r.hours ? Math.max(...r.hours.map((h) => h.temp ?? -99)) : r.when.kind === 'now' ? r.now.temp : Math.max(...r.days.map((d) => d.hi ?? -99)));
  const wet = (r) => (r.hours ? Math.max(...r.hours.map((h) => h.precipProb ?? 0)) : r.when.kind === 'now' ? r.today?.precipProb ?? 0 : Math.max(...r.days.map((d) => d.precipProb ?? 0)));
  if (mode === 'wetter') { const s = [...ok].sort((a, b) => wet(b) - wet(a)); return `Mest nedbør: **${s[0].place}** (${wet(s[0])} % mot ${wet(s[1])} % i ${s[1].place}).`; }
  const s = [...ok].sort((a, b) => val(b) - val(a));
  if (val(s[0]) === val(s[s.length - 1])) return `Det blir omtrent like varmt (${deg(val(s[0]))}).`;
  if (mode === 'colder') { const c = s[s.length - 1]; return `Kaldest blir det i **${c.place}** (${deg(val(c))} mot ${deg(val(s[0]))} i ${s[0].place}).`; }
  return `Varmest blir det i **${s[0].place}** (${deg(val(s[0]))} mot ${deg(val(s[s.length - 1]))} i ${s[s.length - 1].place}).`;
}
/** Kort for klientene (samme felt som k:'weather' i /api/assist der det passer). */
export function weatherCard46(r) {
  if (!r.ok) return { kind: 'weather', id: `${r.place}|${r.when.from}`, title: r.place, subtitle: r.error, error: true };
  const d = r.days?.[0] ?? r.today ?? null;
  const h = r.hours?.[0] ?? null;
  return { kind: 'weather', id: `${r.place}|${r.when.from}|${r.when.kind}`, title: r.place, subtitle: h ? `${r.when.label} · ${h.temp}°` : r.when.kind === 'now' ? `nå · ${r.now.temp}°` : `${r.when.label} · ${d?.lo}–${d?.hi}°`, ...(r.hours ? { hours: r.hours } : {}),
    date: r.when.from, place: r.placeInfo ?? null, now: r.when.kind === 'now' ? r.now : null, days: r.days ?? (r.today ? [r.today] : []), info: r.info, when: r.when };
}
