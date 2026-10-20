// Prompt 41: verktøylag i Glimt-chatten («Glimt henter fakta»). Modellen (ofte en lokal Ollama-modell uten funksjonskall)
// vet ikke ekte vær, vind eller klokkeslett andre steder. Før modellen kalles:
//   1. planQuestion(tekst) deler spørsmålet i deloppgaver {tool:'weather'|'time'|'sun', place, when, fields[]} med en lokal
//      tolker for norsk og engelsk (flere steder i samme setning, «her/hjemme» = første lagrede vær-sted, tidsord og felt).
//      Er tolkeren usikker og en modell finnes, kan rutingen «chat» lage planen som JSON (maks 8 s), ellers gjelder den lokale.
//   2. Verktøyene kjøres parallelt: weather (geokoding via weather35.geocode → Open-Meteo/searchPlacesV2, prognose fra MET for
//      Norge og Open-Meteo med timezone=auto ellers; tidsvinduet velges i stedets lokale tid), time (lokal tid via tidssonen) og
//      sun (soloppgang/solnedgang/dagslys regnet lokalt med sun36.daylight). Prognoser og fakta caches i 10 min.
//   3. factsPrompt(facts) blir et kort faktaavsnitt i systemprompten; meta.used/meta.facts går til klientene (faktakort).
// Feil i ett verktøy (ukjent sted, ingen nett) gir en fakta-rad med error og stopper ikke resten.
//
// Fakta: {tool, place, country, when:'neste time', window:'kl. 09–10 lokal tid', localTime:'08:20', date, tz, label:'6 m/s fra
//         sørvest, kast 9 m/s', values:{…}, source:'MET'|'Open-Meteo'|'Tidssone'|'Beregnet lokalt', text, error?, mock?}
import { cached } from './cache.js';
import { config } from './config.js';
import { kv } from './db.js';
import { wmoText, metToRaw, DEFAULT_PLACES } from './weather-full.js';
import { geocode, extractPlace } from './weather35.js';
import { daylight, SUN_RE } from './sun36.js';

const MOCK = () => process.env.MOCK_DATA === '1';
let F = null, planLlm = null;
/** Bare for tester: injiser fetch for prognosene (null = standard). Med injisert fetch hentes ekte prognoser også med MOCK_DATA=1. */
export const _setTools41Fetch = (fn) => { F = fn ?? null; };
/** Bare for tester: (tekst) → {tasks:[…]} | null (LLM-planleggeren). */
export const _setPlan41Llm = (fn) => { planLlm = fn ?? null; };
export const PLAN_LLM_MS = 8000;

/* ---------------- Tid i en tidssone ---------------- */

const pad = (n) => String(n).padStart(2, '0');
const WD_NB = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON_NB = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wdOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const longDay = (iso) => `${WD_NB[wdOf(iso)]} ${+iso.slice(8, 10)}. ${MON_NB[+iso.slice(5, 7) - 1]}`;
/** Lokal tid i tz → {date:'YYYY-MM-DD', hour, minute, hm:'14:05'} */
export function localNow(tz, now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now)).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  const hour = +p.hour % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, hour, minute: +p.minute, hm: `${pad(hour)}:${p.minute}` };
}
/** UTC-forskyvning i minutter for tz på tidspunktet. */
export function offsetMin(tz, now = Date.now()) {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(now)).find((x) => x.type === 'timeZoneName')?.value ?? 'GMT';
  const m = v.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] ?? 0)) : 0;
}
const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
const hourKey = (date, h) => { const d = addDays(date, Math.floor(h / 24)); return `${d}T${pad(((h % 24) + 24) % 24)}:00`; };

/* ---------------- Tolkeren: tid ---------------- */

const NUM = { en: 1, ett: 1, én: 1, one: 1, an: 1, a: 1, to: 2, two: 2, tre: 3, three: 3, fire: 4, four: 4, fem: 5, five: 5, seks: 6, six: 6, sju: 7, syv: 7, seven: 7,
  åtte: 8, eight: 8, ni: 9, nine: 9, ti: 10, ten: 10, elleve: 11, eleven: 11, tolv: 12, twelve: 12 };
const WD_RE = { mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6, søndag: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
const WD_TOK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON_ALL = { januar: 1, februar: 2, mars: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, desember: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, october: 10, december: 12 };
const NUMW = '(\\d{1,2}|en|ett|én|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti|elleve|tolv|one|an|a|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const MONW = `(${Object.keys(MON_ALL).join('|')})`;
const B = '(?<![\\p{L}\\d])', E = '(?![\\p{L}\\d])'; // ordgrenser som tåler æøå

// [regex, (match, today) → token]. Rekkefølgen betyr noe (overmorgen før morgen, neste time før neste).
const WHEN_RULES = [
  [`${B}(?:i\\s+)?(?:løpet\\s+av\\s+)?(?:den\\s+)?neste\\s+timen?${E}|${B}(?:in\\s+|during\\s+|over\\s+)?the\\s+next\\s+hour${E}|${B}next\\s+hour${E}|${B}within\\s+the\\s+hour${E}`, () => 'next_hour'],
  [`${B}(?:om|in)\\s+${NUMW}\\s+(?:timer?|hours?)${E}`, (m) => { const n = /^\d+$/.test(m[1]) ? +m[1] : NUM[m[1].toLowerCase()] ?? 1; return n === 1 ? 'next_hour' : `in_${Math.min(48, Math.max(1, n))}h`; }],
  [`${B}(?:om|in)\\s+(?:en|an|one)\\s+(?:time|hour)${E}`, () => 'next_hour'],
  [`${B}i\\s*overmorgen${E}|${B}overmorgen${E}|${B}(?:the\\s+)?day\\s+after\\s+tomorrow${E}`, () => 'day_after'],
  [`${B}i\\s*kveld${E}|${B}tonight${E}|${B}this\\s+evening${E}|${B}i\\s+ettermiddag${E}|${B}this\\s+afternoon${E}`, () => 'tonight'],
  [`${B}i\\s*natt${E}|${B}overnight${E}|${B}(?:in\\s+the\\s+|this\\s+|to)night${E}`, () => 'night'],
  [`${B}i\\s*(?:morgen|morra)(?:\\s*tidlig)?${E}|${B}imorgen${E}|${B}tomorrow(?:\\s+morning|\\s+evening)?${E}`, () => 'tomorrow'],
  [`${B}i\\s*dag${E}|${B}idag${E}|${B}today${E}|${B}i\\s+løpet\\s+av\\s+dagen${E}|${B}later\\s+today${E}`, () => 'today'],
  [`${B}(?:i\\s+|denne\\s+|til\\s+)?helg(?:a|en)?${E}|${B}(?:this|the|over\\s+the|on\\s+the)\\s+weekend${E}|${B}weekend${E}`, () => 'weekend'],
  [`${B}(?:på\\s+|neste\\s+|til\\s+|on\\s+|next\\s+|this\\s+)?(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:en)?${E}`,
    (m) => `${/^(neste|next)/i.test(m[0]) ? 'next_' : ''}${WD_TOK[WD_RE[m[1].toLowerCase()]]}`],
  [`${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`, (m) => `${m[1]}-${m[2]}-${m[3]}`],
  [`${B}(?:den\\s+|on\\s+)?(\\d{1,2})\\.\\s?(\\d{1,2})\\.?(\\d{2,4})?(?!\\d)`, (m, today) => dateTok(+m[1], +m[2], m[3], today)],
  [`${B}(?:den\\s+|on\\s+(?:the\\s+)?)?(\\d{1,2})\\.?(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONW}${E}`, (m, today) => dateTok(+m[1], MON_ALL[m[2].toLowerCase()], null, today)],
  [`${B}${MONW}\\s+(\\d{1,2})(?:st|nd|rd|th)?${E}`, (m, today) => dateTok(+m[2], MON_ALL[m[1].toLowerCase()], null, today)],
  [`${B}(?:akkurat\\s+nå|nå|for\\s+øyeblikket|i\\s+øyeblikket|nå\\s+for\\s+tiden|right\\s+now|now|currently|at\\s+the\\s+moment)${E}`, () => 'now'],
].map(([re, fn]) => [new RegExp(re, 'giu'), fn]);

function dateTok(d, m, y, today) {
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
  let year = y ? (+y < 100 ? 2000 + +y : +y) : +today.slice(0, 4);
  let iso = `${year}-${pad(m)}-${pad(d)}`;
  if (!y && iso < addDays(today, -1)) { year += 1; iso = `${year}-${pad(m)}-${pad(d)}`; }
  return iso;
}

/** Finner tidsuttrykket i teksten. → {when:token|null, rest:tekst uten tidsuttrykk} */
export function parseWhen(text, today = localNow('Europe/Oslo').date) {
  let rest = ` ${String(text ?? '')} `, when = null;
  for (const [re, fn] of WHEN_RULES) {
    re.lastIndex = 0;
    rest = rest.replace(re, (...a) => {
      const m = a.slice(0, -2); // [full, …grupper]
      const tok = fn(m, today);
      if (tok && !when) when = tok;
      return tok ? ' ' : a[0];
    });
  }
  return { when, rest: rest.replace(/\s+/g, ' ').trim() };
}

/* ---------------- Tolkeren: verktøy og felt ---------------- */

const RX = (s) => new RegExp(s, 'iu');
const TIME_Q = RX(`${B}((?:hva|hvor\\s+mye)\\s+er\\s+klokk(?:a|en)|klokk(?:a|en)\\s+(?:er\\s+)?(?:nå\\s+)?(?:i|på)(?![\\p{L}])|hvor\\s+sent\\s+er\\s+det|hva\\s+er\\s+tiden|tiden\\s+(?:er\\s+)?(?:det\\s+)?(?:nå\\s+)?(?:i|på)|lokal\\s?tid(?:en)?|tidssone(?:n)?|tidsforskjell(?:en)?|what\\s+time|time\\s+is\\s+it|local\\s+time|time\\s?zone|time\\s+difference)${E}`);
const WX_GENERIC = RX(`${B}(vær(?:et|meldingen|varsel(?:et)?|melding)?|værmelding|prognose(?:n)?|yr|weather|forecast)${E}`);
const FIELD_RULES = [
  ['feels', RX(`${B}(føles\\s+(?:det\\s+)?(?:som|ut)|føles|følt\\s+temperatur|vindavkjøling|feels?\\s+like|apparent|wind\\s?chill)${E}`)],
  ['temp', RX(`${B}(temperatur(?:en)?|grader|temperature|degrees)${E}`)],
  ['precip', RX(`${B}(nedbør(?:en)?|regn(?:et|byger?|vær)?|regner\\s+det|blir\\s+det\\s+regn|paraply|regnbyger|yr(?:er)?\\s+det|precipitation|rain(?:ing|y)?|umbrella|drizzle)${E}`)],
  ['wind', RX(`${B}(vind(?:en|hastighet(?:en)?|styrke(?:n)?|kast(?:ene)?|retning(?:en)?)?|blåser\\s+det|kuling|wind(?:s|y)?|wind\\s+speed|gusts?|breezy)${E}`)],
  ['cloud', RX(`${B}(skydekke(?:t)?|skyet|overskyet|klarvær|solskinn|blir\\s+det\\s+sol|cloud\\s?cover|cloudy|overcast)${E}`)],
  ['humidity', RX(`${B}(luftfuktighet(?:en)?|luftfugtighet(?:en)?|fuktighet(?:en)?|fukt(?:ig)?|humid(?:ity)?)${E}`)],
  ['uv', RX(`${B}(uv(?:-?indeks(?:en)?|-?index)?|solfaktor)${E}`)],
];
// Svake ord teller bare når delen også har sted eller tid («blir det kaldt i morgen», ikke «varm suppe»).
const WEAK_RULES = [
  ['temp', RX(`${B}(varm(?:t|e)?|kald(?:t|e)?|kulde|varme|warm|cold|hot|chilly)${E}`)],
  ['precip', RX(`${B}(snø(?:r|en)?|sludd|byger|snow(?:ing)?|showers?)${E}`)],
  ['wind', RX(`${B}(blåser|blåsete|storm|stormfullt|windy)${E}`)],
  ['cloud', RX(`${B}(skyer|sol|sola|sunny|sunshine|clouds?)${E}`)],
];
const WIND_SPEED_ONLY = RX(`${B}(vindhastighet(?:en)?|vindstyrke(?:n)?|wind\\s+speed)${E}`);
const WIND_GUST = RX(`${B}(kast|vindkast(?:ene)?|gusts?)${E}`);
const WIND_DIR = RX(`${B}(vindretning(?:en)?|retning(?:en)?|hvilken\\s+vei|fra\\s+hvor|direction)${E}`);
const SUN_FIELDS = [
  ['sunrise', RX(`${B}(soloppgang(?:en)?|sola?\\s+(?:står|går|kommer)\\s+opp|(?:står|går)\\s+sola\\s+opp|sunrise|sun\\s+rises?|sun\\s+come\\s+up)${E}`)],
  ['sunset', RX(`${B}(solnedgang(?:en)?|sola?\\s+går\\s+ned|går\\s+sola\\s+ned|sunset|sun\\s+sets?|sun\\s+go\\s+down)${E}`)],
  ['daylight', RX(`${B}(dagslys(?:et)?|lyse\\s+timer|lys(?:t)?\\s+ute|daylight|hours\\s+of\\s+light|day\\s+length)${E}`)],
];
const SUN_EXTRA = RX(`${B}(sunrise|sunset|daylight|sun\\s+(?:rise|set)s?|sun\\s+(?:come\\s+up|go\\s+down))${E}`);
const HOME_RE = RX(`${B}(her|hjemme|hos\\s+meg|her\\s+jeg\\s+bor|here|at\\s+home|where\\s+i\\s+(?:am|live))${E}`);
const NOT_PLACE41 = /^(meg|deg|seg|oss|dere|dem|jobb(en)?|skolen|butikken|byen|sentrum|toppen|fjellet|ute|inne|me|you|us|work|school|the|this|that|there|it|der|det|den|dette|hjemme|her|here|home|morgen|kveld|natt|dag)$/i;
const STOP_WORDS = /^(hva|hvordan|hvor|når|hvilken|hvilket|er|blir|det|den|vil|kan|du|si|meg|fortell|om|og|så|da|what|how|where|when|is|will|be|the|it|tell|me|about|and|like|what's|whats|hvem|også|too|also|then|in|i|på|for|at|ved)$/i;

const SPLIT = /\s*(?:[;?!]+|,\s*|\.\s+|\s(?:og|and|samt|men|but|pluss|plus|deretter|then)\s)\s*/iu;
/** Er det verdt å se etter fakta (vær/tid/sol) i teksten? Billig sjekk før planleggingen. */
export const hasFactWords = (text) => {
  const t = String(text ?? '');
  return WX_GENERIC.test(t) || TIME_Q.test(t) || SUN_RE.test(t) || SUN_EXTRA.test(t) || FIELD_RULES.some(([, re]) => re.test(t)) || WEAK_RULES.some(([, re]) => re.test(t)) || SUN_FIELDS.some(([, re]) => re.test(t));
};
const DEFAULT_WHEN = { weather: 'now', time: 'now', sun: 'today' };
const GENERIC_FIELDS = ['cond', 'temp', 'precip', 'wind'];

function fieldsOf(seg, weak = false) {
  const out = new Set();
  for (const [f, re] of FIELD_RULES) if (re.test(seg)) out.add(f);
  if (weak) for (const [f, re] of WEAK_RULES) if (re.test(seg)) out.add(f);
  if (out.has('wind')) {
    const s2 = seg.replace(/vindkast\p{L}*/giu, '');
    const gustOnly = WIND_GUST.test(seg) && !/vind|wind(?!\s*gust)|blås|storm|kuling/iu.test(s2);
    if (gustOnly) { out.delete('wind'); out.add('gust'); }
    else { out.add('gust'); if (!WIND_SPEED_ONLY.test(seg) || WIND_DIR.test(seg)) out.add('windDir'); }
  }
  return [...out];
}
function sunFieldsOf(seg) { return SUN_FIELDS.filter(([, re]) => re.test(seg)).map(([f]) => f); }

function cleanPlace(p) {
  const v = String(p ?? '').replace(/^(the|byen)\s+/i, '').replace(/[.,]+$/, '').trim();
  if (v.length < 2 || NOT_PLACE41.test(v)) return null;
  return v;
}
function titleCase(s) { return s.split(/\s+/).map((w) => (w === w.toLowerCase() && !/^(de|la|le|del|am|upon|og|i|på)$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' '); }

function parseSegment(seg, today) {
  const { when, rest } = parseWhen(seg, today);
  const tools = [];
  const sunF = sunFieldsOf(seg);
  const isSun = sunF.length > 0 || SUN_RE.test(seg) || SUN_EXTRA.test(seg);
  const isTime = TIME_Q.test(seg);
  const generic = WX_GENERIC.test(seg);
  const anchored = !!when || /(?:^|\s)(i|på|in|for|at|ved)\s+\p{Lu}/u.test(seg) || HOME_RE.test(seg) || generic;
  let fields = fieldsOf(seg, anchored && !isSun);
  if (generic || fields.length) tools.push({ tool: 'weather', fields: fields.length ? fields : GENERIC_FIELDS, generic });
  if (isSun) tools.push({ tool: 'sun', fields: sunF.length ? sunF : ['sunrise', 'sunset', 'daylight'] });
  if (isTime) tools.push({ tool: 'time', fields: ['time'] });
  // Stedet: «her/hjemme» → hjemstedet, ellers etter preposisjon (i/på/in/for/at …) i teksten uten tidsord.
  let place = null, guess = false;
  const ex = extractPlace(rest.replace(HOME_RE, ' '));
  if (ex) place = cleanPlace(ex);
  if (!place && HOME_RE.test(rest)) place = 'HOME';
  if (!place && !tools.length) {
    // Bare et stedsnavn («… og Bergen»): 1–3 ord uten spørreord.
    const words = rest.replace(/^(i|på|in|for|at|ved)\s+/i, '').replace(/[«»"“”.]/g, '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 1 && words.length <= 3 && words.every((w) => /^\p{L}[\p{L}'.-]*$/u.test(w) && !STOP_WORDS.test(w))) { place = cleanPlace(titleCase(words.join(' '))); guess = !!place && !/^\p{Lu}/u.test(words[0]); }
  }
  return { seg, when, place, tools, guess, words: rest.split(/\s+/).filter(Boolean).length };
}

/**
 * Lokal tolker. → {tasks:[{tool, place:'Oslo'|'HOME', when, fields[]}], confident}
 * when: now | next_hour | in_Nh | tonight | night | today | tomorrow | day_after | weekend | mon…sun | next_mon… | YYYY-MM-DD
 */
export function planLocal(text, { today = localNow('Europe/Oslo').date } = {}) {
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src || !hasFactWords(src)) return { tasks: [], confident: true, local: true };
  const segs = src.split(SPLIT).map((s) => s.trim()).filter(Boolean).map((s) => parseSegment(s, today));
  // 1) Uten sted og tid, og neste del har et sted: lån stedet og tida (temperatur og vind i Oslo i morgen).
  for (let i = segs.length - 2; i >= 0; i--) {
    const a = segs[i], b = segs[i + 1];
    if (a.tools.length && !a.place && !a.when && b.place && (b.tools.length || b.guess === false)) { a.place = b.place; a.when = b.when; a.borrowed = true; }
  }
  // 2) Fra venstre: deler uten verktøy arver forrige dels verktøy (… og Bergen / … og i morgen); uten sted arves forrige sted.
  const tasks = [];
  let prev = null;
  for (const s of segs) {
    if (!s.tools.length) {
      if (!prev || (!s.place && !s.when)) continue;
      if (s.words > 5 && !s.when) continue;
      // «været i Oslo og Bergen i helga»: tida på slutten gjelder også forrige del når den ikke hadde egen tid.
      if (s.when && !prev.explicitWhen && prev.tasks) for (const t of prev.tasks) t.when = s.when;
      for (const t of prev.tools) tasks.push({ tool: t.tool, place: s.place ?? prev.place, when: s.when ?? prev.when, fields: [...t.fields], guess: s.guess });
      prev = { ...prev, place: s.place ?? prev.place, when: s.when ?? prev.when };
      continue;
    }
    const place = s.place ?? prev?.place ?? 'HOME';
    const when = s.when ?? (prev && (s.place == null || s.place === prev.place) ? prev.explicitWhen : null);
    const mine = s.tools.map((t) => ({ tool: t.tool, place, when, fields: [...t.fields], guess: false }));
    tasks.push(...mine);
    prev = { tools: s.tools, tasks: mine, place, when, explicitWhen: s.when ?? (s.place == null ? prev?.explicitWhen : null) ?? null };
  }
  // Standard tid per verktøy, og slå sammen like oppgaver.
  const out = [];
  for (const t of tasks) {
    let when = t.when ?? DEFAULT_WHEN[t.tool];
    if (t.tool === 'time') when = 'now';
    if (t.tool === 'sun' && ['now', 'next_hour', 'tonight'].includes(when)) when = 'today';
    if (t.tool === 'sun' && /^in_\d+h$/.test(when)) when = 'today';
    const same = out.find((o) => o.tool === t.tool && o.place === t.place && o.when === when);
    if (same) { for (const f of t.fields) if (!same.fields.includes(f)) same.fields.push(f); continue; }
    out.push({ tool: t.tool, place: t.place, when, fields: t.fields, ...(t.guess ? { guess: true } : {}) });
  }
  const confident = out.length > 0 && !out.some((t) => t.guess);
  return { tasks: out.slice(0, 6), confident, local: true };
}

/* ---------------- LLM-planlegging (bare når tolkeren er usikker) ---------------- */

const WHEN_OK = /^(now|next_hour|in_\d{1,2}h|tonight|night|today|tomorrow|day_after|weekend|(next_)?(mon|tue|wed|thu|fri|sat|sun)|\d{4}-\d{2}-\d{2})$/;
const FIELDS_OK = new Set(['cond', 'temp', 'feels', 'precip', 'wind', 'gust', 'windDir', 'cloud', 'humidity', 'uv', 'sunrise', 'sunset', 'daylight', 'time']);
/** Sjekker en plan fra modellen. → tasks[] (tom ved ugyldig) */
export function cleanPlan(data) {
  const list = Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data) ? data : [];
  const out = [];
  for (const t of list.slice(0, 6)) {
    const tool = ['weather', 'time', 'sun'].includes(t?.tool) ? t.tool : null;
    if (!tool) continue;
    let place = typeof t.place === 'string' ? t.place.trim().slice(0, 60) : '';
    if (!place || /^(home|her|hjemme|here|null)$/i.test(place)) place = 'HOME';
    const when = typeof t.when === 'string' && WHEN_OK.test(t.when) ? t.when : DEFAULT_WHEN[tool];
    let fields = (Array.isArray(t.fields) ? t.fields : []).filter((f) => FIELDS_OK.has(f));
    if (!fields.length) fields = tool === 'weather' ? GENERIC_FIELDS : tool === 'sun' ? ['sunrise', 'sunset', 'daylight'] : ['time'];
    out.push({ tool, place, when: tool === 'time' ? 'now' : when, fields });
  }
  return out;
}
const PLAN_SYSTEM = 'Du deler et spørsmål i deloppgaver for verktøy. Svar KUN med JSON {"tasks":[{"tool":"weather"|"time"|"sun","place":"stedsnavn eller HOME","when":"now|next_hour|in_3h|tonight|night|today|tomorrow|day_after|weekend|mon|tue|wed|thu|fri|sat|sun|YYYY-MM-DD","fields":["cond","temp","feels","precip","wind","gust","windDir","cloud","humidity","uv","sunrise","sunset","daylight"]}]}. HOME = brukerens hjemsted. Én oppgave per sted og tid, i samme rekkefølge som i spørsmålet. Ingen tekst utenfor JSON.';

async function planWithLlm(text, { user, localOnly = true, today }) {
  const call = planLlm ? Promise.resolve().then(() => planLlm(text))
    : (async () => {
      const { run } = await import('./ai-run.js');
      const r = await run('chat', { user, system: PLAN_SYSTEM, prompt: `I dag er ${today}.\nSpørsmål: ${String(text).slice(0, 500)}`, json: true, temperature: 0, numPredict: 300, timeoutMs: PLAN_LLM_MS, localOnly, title: 'Glimt · planlegger fakta', noRetry: true });
      return r.data ?? null;
    })();
  const res = await Promise.race([call.catch(() => null), new Promise((r) => { const t = setTimeout(() => r(null), PLAN_LLM_MS); t.unref?.(); })]);
  return cleanPlan(res);
}

/**
 * Planen: lokal tolker først; er den usikker og en modell finnes (ikke MOCK), prøver vi LLM-en (≤ 8 s) og faller tilbake.
 * → {tasks, via:'lokal'|'llm'}
 */
export async function planQuestion(text, { user = null, localOnly = true, useLlm = true } = {}) {
  const today = localNow('Europe/Oslo').date;
  const local = planLocal(text, { today });
  const strip = (l) => l.map(({ guess, ...t }) => t); // eslint-disable-line no-unused-vars
  if (local.confident || !useLlm || (MOCK() && !planLlm) || !hasFactWords(text)) return { tasks: strip(local.tasks), via: 'lokal' };
  const llm = await planWithLlm(text, { user, localOnly, today }).catch(() => []);
  if (llm.length) return { tasks: llm, via: 'llm' };
  return { tasks: strip(local.tasks), via: 'lokal' };
}

/* ---------------- Steder ---------------- */

const inNorway = (lat, lon) => lat >= 57.8 && lat <= 71.3 && lon >= 4.4 && lon <= 31.2 && !(lon > 20 && lat < 68.5);
/** Brukerens hjemsted: første lagrede vær-sted (ellers Oslo). */
export async function homePlace(u) {
  let list = null;
  try { list = u ? kv.get(u, 'wx_places', null) : null; } catch { /* ingen */ }
  const p = (Array.isArray(list) && list.length ? list : DEFAULT_PLACES)[0];
  const lat = +p.lat, lon = +p.lon, norway = inNorway(lat, lon);
  let tz = norway ? 'Europe/Oslo' : null, country = norway ? 'Norge' : '';
  if (!norway) { try { const g = await geocode(p.name); if (g?.tz) { tz = g.tz; country = g.country ?? ''; } } catch { /* tidssonen fra prognosen */ } }
  return { name: p.name, country, label: p.name, lat, lon, tz, norway, home: true };
}
async function resolvePlace(name, u, homeP) {
  if (name === 'HOME') return homeP ?? (await homePlace(u));
  const g = await geocode(name);
  if (!g) return null;
  return { ...g, norway: !!g.norway };
}

/* ---------------- Prognoser ---------------- */

const r1 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v * 10) / 10);
const r0 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
const HOURLY = 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,relative_humidity_2m,uv_index,is_day';
const DAILY = 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset';
async function getJson(url, headers = {}, ms = 8000) {
  const res = await (F ?? globalThis.fetch)(url, { headers: { Accept: 'application/json', 'User-Agent': 'homelab-os', ...headers }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} svarte ${res.status}`);
  return res.json();
}
async function openMeteo(p) {
  const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&timezone=auto&forecast_days=8&wind_speed_unit=ms&hourly=${HOURLY}&daily=${DAILY}`);
  if (!d?.hourly?.time?.length) throw new Error('Open-Meteo ga ingen prognose');
  return { hourly: d.hourly, daily: d.daily ?? {}, tz: d.timezone ?? p.tz ?? 'UTC', source: 'Open-Meteo' };
}
async function met(p) {
  const d = await getJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${(+p.lat).toFixed(4)}&lon=${(+p.lon).toFixed(4)}`, { 'User-Agent': config.metUserAgent });
  const raw = metToRaw(d, p);
  if (!raw.hourly.time.length) throw new Error('MET ga ingen prognose');
  // Skydekke finnes ikke i metToRaw: hent det fra tidsseriene (samme lokale timer i Europe/Oslo).
  const cloud = new Map();
  for (const t of d?.properties?.timeseries ?? []) { const n = localNow('Europe/Oslo', Date.parse(t.time)); cloud.set(`${n.date}T${pad(n.hour)}:00`, t.data?.instant?.details?.cloud_area_fraction ?? null); }
  raw.hourly.cloud_cover = raw.hourly.time.map((t) => (cloud.has(t) ? r0(cloud.get(t)) : null));
  return { hourly: raw.hourly, daily: raw.daily, tz: 'Europe/Oslo', source: 'MET' };
}
/** Eksempeldata (MOCK_DATA=1): deterministisk ut fra sted og dato, i stedets lokale tid. */
export function mockForecast(p, tz, now = Date.now()) {
  const n = localNow(tz, now);
  const seed = Math.abs(Math.round((p.lat * 7 + p.lon * 3) * 10)) % 97;
  const H = { time: [], temperature_2m: [], apparent_temperature: [], precipitation: [], precipitation_probability: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], cloud_cover: [], relative_humidity_2m: [], uv_index: [], is_day: [] };
  const D = { time: [], temperature_2m_max: [], temperature_2m_min: [], apparent_temperature_max: [], apparent_temperature_min: [], precipitation_sum: [], precipitation_probability_max: [], weather_code: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], wind_direction_10m_dominant: [], uv_index_max: [], sunrise: [], sunset: [] };
  const base = 16 - Math.abs(p.lat) / 5;
  for (let d = 0; d < 8; d++) {
    const date = addDays(n.date, d), rainy = (d + seed) % 3 === 1;
    let hi = -99, lo = 99, sum = 0, pm = 0, wm = 0, gm = 0, fh = -99, fl = 99;
    for (let h = 0; h < 24; h++) {
      const temp = r1(base + Math.sin(d + seed) * 2 + 4 * Math.sin(((h - 9) / 24) * 2 * Math.PI) - (rainy ? 1.5 : 0));
      const wind = r1(3 + (seed % 4) + 1.5 * Math.sin(h / 3 + d) + (rainy ? 2 : 0)), gust = r1(wind + 3 + (seed % 3));
      const mm = rainy && h >= 10 && h <= 18 ? r1(0.3 + 0.3 * Math.abs(Math.sin(h))) : 0, prob = rainy ? 70 + (h % 3) * 8 : 10;
      const feels = r1(temp - wind * 0.4);
      H.time.push(`${date}T${pad(h)}:00`); H.temperature_2m.push(temp); H.apparent_temperature.push(feels); H.precipitation.push(mm); H.precipitation_probability.push(prob);
      H.weather_code.push(rainy && mm ? 61 : h % 5 === 0 ? 3 : 2); H.wind_speed_10m.push(wind); H.wind_gusts_10m.push(gust); H.wind_direction_10m.push((200 + seed + h * 4) % 360);
      H.cloud_cover.push(rainy ? 90 : 40 + (h % 4) * 10); H.relative_humidity_2m.push(rainy ? 88 : 68); H.uv_index.push(h >= 9 && h <= 15 ? 2 : 0); H.is_day.push(h >= 7 && h < 18 ? 1 : 0);
      hi = Math.max(hi, temp); lo = Math.min(lo, temp); fh = Math.max(fh, feels); fl = Math.min(fl, feels); sum += mm; pm = Math.max(pm, prob); wm = Math.max(wm, wind); gm = Math.max(gm, gust);
    }
    D.time.push(date); D.temperature_2m_max.push(r1(hi)); D.temperature_2m_min.push(r1(lo)); D.apparent_temperature_max.push(r1(fh)); D.apparent_temperature_min.push(r1(fl));
    D.precipitation_sum.push(r1(sum)); D.precipitation_probability_max.push(pm); D.weather_code.push(rainy ? 61 : 2); D.wind_speed_10m_max.push(r1(wm)); D.wind_gusts_10m_max.push(r1(gm));
    D.wind_direction_10m_dominant.push((220 + seed) % 360); D.uv_index_max.push(2); D.sunrise.push(null); D.sunset.push(null);
  }
  return { hourly: H, daily: D, tz, source: p.norway ? 'MET' : 'Open-Meteo', mock: true };
}
/** Prognosen for stedet (cachet 10 min). Norge: MET, ellers (og som reserve) Open-Meteo med timezone=auto. */
export async function forecastFor(p) {
  if (MOCK() && !F) return mockForecast(p, p.tz || (p.norway ? 'Europe/Oslo' : 'UTC'));
  return cached(`t41:fc:${p.lat},${p.lon}`, 10 * 60_000, async () => {
    if (p.norway) { try { return await met(p); } catch (e) { console.warn('[chat41] MET:', e.message, '· bruker Open-Meteo'); } }
    return openMeteo(p);
  });
}

/* ---------------- Tidsvindu og verdier ---------------- */

const DIR_NB = ['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest'], DIR_SHORT = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
const dirIdx = (deg) => Math.round(((+deg % 360) + 360) % 360 / 45) % 8;
const meanDir = (list) => { const v = list.filter((x) => x != null); if (!v.length) return null; const s = v.reduce((a, d) => a + Math.sin((d * Math.PI) / 180), 0), c = v.reduce((a, d) => a + Math.cos((d * Math.PI) / 180), 0); return ((Math.atan2(s, c) * 180) / Math.PI + 360) % 360; };
const nb = (v) => String(v).replace('.', ',');
const avg = (l) => { const v = l.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const mx = (l) => { const v = l.filter((x) => x != null); return v.length ? Math.max(...v) : null; };
const mn = (l) => { const v = l.filter((x) => x != null); return v.length ? Math.min(...v) : null; };
const sum = (l) => { const v = l.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
const worstCode = (l) => { const v = l.filter((x) => x != null); if (!v.length) return null; const cnt = {}; for (const c of v) cnt[c] = (cnt[c] ?? 0) + 1; const wet = v.filter((c) => c >= 51); return wet.length >= Math.max(2, v.length / 4) ? Math.max(...wet) : +Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]; };

/** Tidsvinduet i stedets lokale tid. → {kind:'hours'|'days', label, window, hours:[nøkler], dates:[…], date} */
export function resolveWhen(tok, tz, now = Date.now()) {
  const n = localNow(tz, now), H = n.hour;
  const range = (a, b, date = n.date) => { const out = []; for (let h = a; h <= b; h++) out.push(hourKey(date, h)); return out; };
  const hh = (h) => pad(((h % 24) + 24) % 24);
  if (tok === 'now') return { kind: 'hours', label: 'nå', window: `kl. ${n.hm} lokal tid`, hours: [hourKey(n.date, H)], date: n.date, single: true };
  if (tok === 'next_hour') return { kind: 'hours', label: 'neste time', window: `kl. ${hh(H + 1)}–${hh(H + 2)} lokal tid`, hours: [hourKey(n.date, H + 1)], date: hourKey(n.date, H + 1).slice(0, 10), single: true };
  const inh = /^in_(\d+)h$/.exec(tok);
  if (inh) { const k = +inh[1]; return { kind: 'hours', label: `om ${k} timer`, window: `kl. ${hh(H + k)}:00 lokal tid`, hours: [hourKey(n.date, H + k)], date: hourKey(n.date, H + k).slice(0, 10), single: true }; }
  if (tok === 'tonight') { const a = Math.max(18, Math.min(H, 23)); return { kind: 'hours', label: 'i kveld', window: `kl. ${hh(a)}–24 lokal tid`, hours: range(a, 23), date: n.date }; }
  if (tok === 'night') {
    if (H < 6) return { kind: 'hours', label: 'i natt', window: `kl. ${hh(H)}–06 lokal tid`, hours: range(H, 5), date: n.date };
    return { kind: 'hours', label: 'i natt', window: 'kl. 23–06 lokal tid', hours: [hourKey(n.date, 23), ...range(0, 5, addDays(n.date, 1))], date: addDays(n.date, 1) };
  }
  if (tok === 'today') return { kind: 'days', label: 'i dag', window: `${longDay(n.date)}, resten av dagen fra kl. ${hh(H)}`, dates: [n.date], hours: range(H, 23), date: n.date, today: true };
  let date = null, label = null;
  if (tok === 'tomorrow') { date = addDays(n.date, 1); label = 'i morgen'; }
  else if (tok === 'day_after') { date = addDays(n.date, 2); label = 'i overmorgen'; }
  else if (tok === 'weekend') {
    const wd = wdOf(n.date);
    const sat = wd === 6 ? n.date : wd === 0 ? null : addDays(n.date, 6 - wd), sun = wd === 0 ? n.date : addDays(sat, 1);
    const dates = sat ? [sat, sun] : [sun];
    return { kind: 'days', label: 'i helga', window: dates.map(longDay).join(' og '), dates, date: dates[0] };
  } else if (/^(next_)?(sun|mon|tue|wed|thu|fri|sat)$/.test(tok)) {
    const [, nx, w] = /^(next_)?(\w+)$/.exec(tok); const target = WD_TOK.indexOf(w);
    let d = (target - wdOf(n.date) + 7) % 7; if (nx && d === 0) d = 7;
    date = addDays(n.date, d); label = d === 0 ? 'i dag' : d === 1 ? 'i morgen' : `på ${WD_NB[target]}`;
    if (d === 0) return { kind: 'days', label, window: `${longDay(date)}, resten av dagen fra kl. ${hh(H)}`, dates: [date], hours: range(H, 23), date, today: true };
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) { date = tok; label = date === n.date ? 'i dag' : date === addDays(n.date, 1) ? 'i morgen' : `${+date.slice(8, 10)}. ${MON_NB[+date.slice(5, 7) - 1]}`; }
  else return resolveWhen('now', tz, now);
  return { kind: 'days', label, window: longDay(date), dates: [date], date };
}

// «4–9 °C», men «-3 til 5 °C» (bindestrek og minus blir uleselig sammen).
const span = (a, b) => (a < 0 || b < 0 ? `${a} til ${b} °C` : `${a}–${b} °C`);
const condText = (code) => (code == null ? null : wmoText(code));
/** Verdier for felt i et tidsvindu. → {values, parts:[tekst]} */
function valuesFor(fc, win, fields) {
  const Hh = fc.hourly, Dd = fc.daily ?? {};
  const idx = new Map((Hh.time ?? []).map((t, i) => [t, i]));
  const hourIdx = (keys) => keys.map((k) => idx.get(k)).filter((i) => i != null);
  const col = (name, ix) => ix.map((i) => Hh[name]?.[i] ?? null);
  const want = new Set(fields);
  const days = win.kind === 'days' ? win.dates : null;
  const blocks = [];
  if (win.kind === 'hours') {
    const ix = hourIdx(win.hours);
    if (!ix.length) throw new Error('Prognosen dekker ikke dette tidspunktet');
    blocks.push({ ix, day: null });
  } else {
    for (const date of days) {
      const keysOfDay = (Hh.time ?? []).filter((t) => t.startsWith(date));
      const ix = win.today && win.hours ? hourIdx(win.hours) : hourIdx(keysOfDay);
      const di = (Dd.time ?? []).indexOf(date);
      if (!ix.length && di < 0) throw new Error(`Prognosen går ikke så langt fram (${longDay(date)})`);
      blocks.push({ ix, day: di >= 0 && !win.today ? di : null, date });
    }
  }
  const one = (b) => {
    const v = {}, parts = [];
    const single = b.ix.length === 1 && b.day == null;
    const d = (name) => (b.day != null ? Dd[name]?.[b.day] ?? null : null);
    if (want.has('cond')) { const c = single ? col('weather_code', b.ix)[0] : d('weather_code') ?? worstCode(col('weather_code', b.ix)); if (c != null) { v.cond = condText(c); v.code = c; parts.push(v.cond.toLowerCase()); } }
    if (want.has('temp')) {
      if (single) { v.temp = r0(col('temperature_2m', b.ix)[0]); if (v.temp != null) parts.push(`${v.temp} °C`); }
      else { v.tempMin = r0(d('temperature_2m_min') ?? mn(col('temperature_2m', b.ix))); v.tempMax = r0(d('temperature_2m_max') ?? mx(col('temperature_2m', b.ix))); if (v.tempMin != null) parts.push(v.tempMin === v.tempMax ? `${v.tempMin} °C` : span(v.tempMin, v.tempMax)); }
    }
    if (want.has('feels')) {
      if (single) { v.feels = r0(col('apparent_temperature', b.ix)[0]); if (v.feels != null) parts.push(`føles som ${v.feels} °C`); }
      else { v.feelsMin = r0(d('apparent_temperature_min') ?? mn(col('apparent_temperature', b.ix))); v.feelsMax = r0(d('apparent_temperature_max') ?? mx(col('apparent_temperature', b.ix))); if (v.feelsMin != null) parts.push(`føles som ${span(v.feelsMin, v.feelsMax)}`); }
    }
    if (want.has('precip')) {
      v.precip = r1(single ? col('precipitation', b.ix)[0] : d('precipitation_sum') ?? sum(col('precipitation', b.ix))) ?? 0;
      v.precipProb = r0(single ? col('precipitation_probability', b.ix)[0] : d('precipitation_probability_max') ?? mx(col('precipitation_probability', b.ix)));
      const pr = v.precipProb != null ? ` (${v.precipProb} % sjanse)` : '';
      parts.push(v.precip >= 0.1 ? `${nb(v.precip)} mm nedbør${pr}` : `opphold${pr}`);
    }
    if (want.has('wind') || want.has('gust') || want.has('windDir')) {
      const w = single ? col('wind_speed_10m', b.ix)[0] : d('wind_speed_10m_max') ?? mx(col('wind_speed_10m', b.ix));
      const g = single ? col('wind_gusts_10m', b.ix)[0] : d('wind_gusts_10m_max') ?? mx(col('wind_gusts_10m', b.ix));
      const dir = single ? col('wind_direction_10m', b.ix)[0] : d('wind_direction_10m_dominant') ?? meanDir(col('wind_direction_10m', b.ix));
      let txt = '';
      if (want.has('wind') && w != null) { v.wind = r0(w); if (!single) v.windMax = v.wind; txt = `${single ? '' : 'opptil '}${v.wind} m/s`; }
      if (want.has('windDir') && dir != null) { const k = dirIdx(dir); v.windDir = DIR_SHORT[k]; v.windDeg = r0(dir); txt += `${txt ? ' ' : 'vind '}fra ${DIR_NB[k]}`; }
      if (want.has('gust') && g != null) { v.gust = r0(g); txt += `${txt ? ', ' : ''}kast ${single ? '' : 'opptil '}${v.gust} m/s`; }
      if (txt) parts.push(txt.startsWith('kast') || txt.startsWith('vind') ? txt : `vind ${txt}`);
    }
    if (want.has('cloud')) { const c = single ? col('cloud_cover', b.ix)[0] : avg(col('cloud_cover', b.ix)); if (c != null) { v.cloud = r0(c); parts.push(`skydekke ${v.cloud} %`); } }
    if (want.has('humidity')) { const h = single ? col('relative_humidity_2m', b.ix)[0] : avg(col('relative_humidity_2m', b.ix)); if (h != null) { v.humidity = r0(h); parts.push(`luftfuktighet ${v.humidity} %`); } }
    if (want.has('uv')) { const u = single ? col('uv_index', b.ix)[0] : d('uv_index_max') ?? mx(col('uv_index', b.ix)); if (u != null) { v.uv = r1(u); parts.push(`UV ${nb(v.uv)}`); } }
    return { v, parts };
  };
  if (blocks.length === 1) { const { v, parts } = one(blocks[0]); return { values: v, label: parts.join(', ') }; }
  const per = blocks.map((b) => ({ date: b.date, ...one(b) }));
  return { values: { days: per.map((x) => ({ date: x.date, ...x.v })) }, label: per.map((x) => `${WD_NB[wdOf(x.date)]}: ${x.parts.join(', ')}`).join('; ') };
}

/* ---------------- Verktøyene ---------------- */

const TOOL_NAME = { weather: 'Vær', time: 'Tid', sun: 'Sol' };
const placeLabel = (p) => (p.norway || !p.country ? p.name : `${p.name}, ${p.country}`);
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
function baseFact(task, p, tz, now) {
  const n = localNow(tz, now);
  return { tool: task.tool, place: p.name, country: p.country || (p.norway ? 'Norge' : ''), tz, localTime: n.hm, localDate: n.date };
}
async function weatherTool(task, p, now) {
  const fc = await forecastFor(p);
  const tz = fc.tz || p.tz || 'Europe/Oslo';
  const win = resolveWhen(task.when, tz, now);
  const { values, label } = valuesFor(fc, win, task.fields);
  const f = { ...baseFact(task, p, tz, now), when: win.label, window: win.window, date: win.date, label: label || 'ingen verdier', values, source: fc.source, ...(fc.mock ? { mock: true } : {}) };
  f.text = `${cap(win.label)} (${win.window}) i ${placeLabel(p)}: ${f.label}.`;
  return f;
}
async function tzOf(p) {
  if (p.tz && validTz(p.tz)) return p.tz;
  if (p.norway) return 'Europe/Oslo';
  try { const fc = await forecastFor(p); if (fc.tz && validTz(fc.tz)) return fc.tz; } catch { /* nedenfor */ }
  throw new Error(`Fant ikke tidssonen for ${p.name}`);
}
async function timeTool(task, p, now) {
  const tz = await tzOf(p);
  const n = localNow(tz, now), off = offsetMin(tz, now), diff = (off - offsetMin('Europe/Oslo', now)) / 60;
  const offTxt = `UTC${off >= 0 ? '+' : '−'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? `:${pad(Math.abs(off) % 60)}` : ''}`;
  const diffTxt = diff === 0 ? 'samme tid som i Norge' : `${nb(Math.abs(diff))} t ${diff > 0 ? 'foran' : 'bak'} Norge`;
  const values = { time: n.hm, date: n.date, weekday: WD_NB[wdOf(n.date)], utcOffset: offTxt, diffHours: diff };
  const f = { ...baseFact(task, p, tz, now), when: 'nå', window: tz, date: n.date, label: `${n.hm}, ${longDay(n.date)} (${offTxt}, ${diffTxt})`, values, source: 'Tidssone' };
  f.text = `Klokka i ${placeLabel(p)} er nå ${f.label}.`;
  return f;
}
async function sunTool(task, p, now) {
  const tz = await tzOf(p);
  const win = resolveWhen(task.when, tz, now);
  const dates = win.dates ?? [win.date];
  const want = new Set(task.fields.filter((x) => ['sunrise', 'sunset', 'daylight'].includes(x)));
  if (!want.size) ['sunrise', 'sunset', 'daylight'].forEach((x) => want.add(x));
  const per = dates.map((date) => {
    const d = daylight(date, { name: p.name, lat: p.lat, lon: p.lon, tz });
    const v = { date }, parts = [];
    if (d.polar) { v.polar = d.polar; v.daylightMin = d.daylightMin; parts.push(d.polar === 'midnattssol' ? 'midnattssol, sola går ikke ned' : 'mørketid, sola står ikke opp'); }
    else {
      if (want.has('sunrise')) { v.sunrise = d.sunrise; parts.push(`soloppgang ${d.sunrise}`); }
      if (want.has('sunset')) { v.sunset = d.sunset; parts.push(`solnedgang ${d.sunset}`); }
      if (want.has('daylight')) { v.daylightMin = d.daylightMin; v.daylight = `${Math.floor(d.daylightMin / 60)} t ${d.daylightMin % 60} min`; parts.push(`${v.daylight} dagslys`); }
    }
    return { v, parts };
  });
  const label = per.length === 1 ? per[0].parts.join(', ') : per.map((x) => `${WD_NB[wdOf(x.v.date)]}: ${x.parts.join(', ')}`).join('; ');
  const values = per.length === 1 ? per[0].v : { days: per.map((x) => x.v) };
  const f = { ...baseFact(task, p, tz, now), when: win.label, window: dates.map(longDay).join(' og '), date: win.date, label, values, source: 'Beregnet lokalt' };
  f.text = `${cap(win.label)} (${f.window}) i ${placeLabel(p)}: ${label} (lokal tid).`;
  return f;
}
const TOOLS = { weather: weatherTool, time: timeTool, sun: sunTool };
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(msg)), ms); t.unref?.(); })]);

/** Kjører én deloppgave. Feil gir en fakta-rad med error (stopper ikke de andre). */
export async function runTask(task, { user = null, home = null, now = Date.now() } = {}) {
  const shown = task.place === 'HOME' ? (home?.name ?? 'hjemme') : task.place;
  let p;
  try { p = await withTimeout(resolvePlace(task.place, user, home), 8000, 'Stedssøket svarte ikke'); }
  catch (e) { return { tool: task.tool, place: shown, country: '', when: task.when, label: `Fikk ikke søkt etter stedet «${shown}» (${e.message})`, error: e.message, values: {}, source: null, text: `Fikk ikke søkt etter stedet «${shown}».` }; }
  if (!p) { const msg = `Fant ikke stedet «${shown}»`; return { tool: task.tool, place: shown, country: '', when: task.when, label: msg, error: msg, values: {}, source: null, text: `${msg}.` }; }
  try {
    const hourTag = localNow(p.tz && validTz(p.tz) ? p.tz : 'UTC', now);
    const run = () => withTimeout(TOOLS[task.tool](task, p, now), 9000, 'svarte ikke i tide');
    // Tid caches ikke (klokka går); vær og sol caches per sted/tidsvindu/felt i 10 min (nøkkel med lokal time, så «neste time» følger klokka).
    const f = task.tool === 'time' ? await run()
      : await cached(`t41:f:${task.tool}:${p.lat},${p.lon}:${task.when}:${task.fields.join(',')}:${hourTag.date}T${hourTag.hour}`, 10 * 60_000, run);
    return { ...f, ...(p.home ? { home: true } : {}) };
  } catch (e) {
    const what = task.tool === 'weather' ? 'været' : task.tool === 'sun' ? 'soldata' : 'klokka';
    const msg = `Fikk ikke hentet ${what} for ${placeLabel(p)} (${e.message})`;
    return { tool: task.tool, place: p.name, country: p.country ?? '', when: task.when, label: msg, error: msg, values: {}, source: null, text: `${msg}.` };
  }
}

/**
 * Hele laget: planlegg og hent fakta parallelt. → {facts:[…], used:['Vær · Oslo', …], tasks, via}
 * Tomt når spørsmålet ikke handler om vær, tid eller sol.
 */
export async function gatherFacts(text, { user = null, localOnly = true, useLlm = true, now = Date.now() } = {}) {
  if (!hasFactWords(text)) return { facts: [], used: [], tasks: [], via: 'ingen' };
  const plan = await planQuestion(text, { user, localOnly, useLlm });
  if (!plan.tasks.length) return { facts: [], used: [], tasks: [], via: plan.via };
  const home = plan.tasks.some((t) => t.place === 'HOME') ? await homePlace(user).catch(() => null) : null;
  const facts = await Promise.all(plan.tasks.map((t) => runTask(t, { user, home, now })));
  const used = [...new Set(facts.filter((f) => !f.error).map((f) => `${TOOL_NAME[f.tool]} · ${f.place}`))];
  return { facts, used, tasks: plan.tasks, via: plan.via };
}

/** Faktaavsnittet i systemprompten. */
export function factsPrompt(facts) {
  if (!facts?.length) return '';
  const lines = facts.map((f, i) => {
    const head = `${i + 1}. ${TOOL_NAME[f.tool] ?? f.tool} · ${f.place}${f.country ? `, ${f.country}` : ''}`;
    if (f.error) return `${head}: ${f.label}. Si dette til brukeren, ikke gjett.`;
    return `${head} · ${f.when} (${f.window}) · lokal tid nå ${f.localTime} (${f.tz})\n   ${f.label} · kilde ${f.source}`;
  });
  return `Fakta hentet nå (bruk disse, ikke gjett):\n${lines.join('\n')}\n`
    + `Svar på alle ${facts.length > 1 ? `${facts.length} delene` : 'delene'} av spørsmålet i samme rekkefølge, kort og ryddig, med tall og enheter fra faktaene. `
    + 'Bruk ikke markdown-tabeller. Står det at noe ikke ble funnet, si det kort.';
}

/** Svar uten modell (MOCK): bruker faktaene og svarer på alle delene. */
export function factsAnswer(facts) {
  if (!facts?.length) return '';
  return facts.map((f) => f.text).join(' ');
}

/** Bør /api/assist (source:'chat') overlate spørsmålet til chatten? Flere deler, klokka, eller timer/vinduer Glimt-kortet ikke dekker. */
export function needsChatTools(text) {
  if (!hasFactWords(text)) return false;
  const { tasks } = planLocal(text);
  if (!tasks.length) return false;
  if (tasks.length >= 2) return true;
  const t = tasks[0];
  if (t.tool === 'time') return true;
  if (t.tool === 'weather' && !['now', 'today', 'tomorrow'].includes(t.when)) return true;
  if (t.tool === 'weather' && !t.fields.includes('cond') && t.fields.some((f) => ['wind', 'gust', 'windDir', 'humidity', 'uv', 'cloud', 'feels'].includes(f))) return true;
  return false;
}
