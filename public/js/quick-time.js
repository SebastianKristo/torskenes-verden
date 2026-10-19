// Rask time – felles tolker for «time hos Nina frisør 14.30 25.09».
// Ren ES-modul uten DOM: brukes av server (import '../public/js/quick-time.js'),
// web og PWA. Port av QP() fra design/Kalender.dc.html, utvidet med reglene i
// prompts/prompt-29-pakke/claude-code-kalender-rask-time.md punkt 2.
//
// parseQuick(text, todayISO?, memory?) → {ok, why?, title, date, start, end, place, type,
//   duration, allDay, confidence, isAppointment, business?, memory?}
// Prompt 33 (GLIMT-MEMORY): avsenderen i signaturen («Mvh X», «Hilsen X», «– X», «Påminnelse fra X») blir bedriftsnavnet,
// og tittelen blir «Frisør · Påhåret Studio Hoff» (type + bedrift). Linjer med «NB!», «Viktig», «Husk», gebyr/avbestilling,
// telefonnummer og «kan ikke besvares» blir aldri tittel. memory = brukerens «Glimt husker»-alias
// [{id?, kind:'alias', match, type, title?}] (GET /api/glimt/memory): treffer teksten match, settes type og tittel derfra.
// Alle datoer regnes som kalenderdatoer (UTC-midnatt internt), så tidssonen til
// maskinen påvirker ikke resultatet. Uten todayISO brukes dagens dato i Europe/Oslo.

const pad = (n) => String(n).padStart(2, '0');
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, des: 11 };
const WDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const WD_SHORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
export const MN_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

// [mønster, varighet (min), tittel, type]
export const KINDS = [
  [/fris(ø|o)r|klipp|hårsalong|barber/, 45, 'Frisør', 'frisør'],
  [/tannlege|tannpleier|tannklinikk/, 60, 'Tannlege', 'tannlege'],
  [/fastlege|legetime|legekontor|legesenter|legevakt|(^|[^a-zæøå])lege([^a-zæøå]|$)|(^|\s)dr\.\s/, 30, 'Lege', 'lege'],
  [/fysio|kiropraktor|naprapat|osteopat/, 45, 'Fysioterapi', 'fysio'],
  [/psykolog/, 50, 'Psykolog', 'psykolog'],
  [/optiker/, 30, 'Optiker', 'optiker'],
  [/vaksin/, 15, 'Vaksine', 'annet'],
  [/massasje/, 60, 'Massasje', 'annet'],
  [/hudpleie|negl/, 60, 'Hudpleie', 'annet'],
];
// Prompt 33: ord i bedriftsnavnet («PÅHÅRET Studio Hoff», «Hår1», «Cutters», «Tannhelse Sør»). Brukes bare på navnet.
const BIZ_KINDS = [
  [/fris(ø|o)r|hår|salong|klipp|barber|cutters|hair/, 'frisør'],
  [/tann|dental|kjeveortoped/, 'tannlege'],
  [/lege|legekontor|legesenter|fastlege|medisinsk/, 'lege'],
  [/fysio|kiropraktor|naprapat|osteopat/, 'fysio'],
  [/psykolog/, 'psykolog'],
  [/optiker|brille|synsam|specsavers|interoptik/, 'optiker'],
  [/vaksin/, 'vaksine'],
];
export const TYPE_LABEL = { frisør: 'Frisør', lege: 'Lege', tannlege: 'Tannlege', fysio: 'Fysioterapi', psykolog: 'Psykolog', optiker: 'Optiker', vaksine: 'Vaksine', annet: '' };
export const TYPES = ['lege', 'tannlege', 'frisør', 'fysio', 'psykolog', 'optiker', 'annet'];
export const DURATION = { frisør: 45, lege: 30, tannlege: 60, fysio: 45, psykolog: 50, optiker: 30, vaksine: 15, annet: 60 };
export const NO_DATE = 'Fant ikke dato. Skriv f.eks. «25.09» eller «tirsdag».';
export const NO_TIME = 'Fant ikke klokkeslett, lagt inn som hele dagen.';
const INTENT = /(^|[^a-zæøå])(time|timen|timer|avtale|avtalen|legg til|book|booke|booket|bestill|bestilt|bestille)([^a-zæøå]|$)/;

const PRE_SKIP = /^(?:(?:du|jeg|vi|dere)\s+(?:har|skal ha|fikk)\s+(?:fått\s+)?)?(?:legg til|lag|sett opp|book|bestill|bestilt|ny)?\s*(?:en\s+|ny\s+)?(?:time|timen|avtale|avtalen|konsultasjon|timebestilling|påminnelse om time)?$/i;
const toMin = (s) => { const [a, b] = s.split(':'); return +a * 60 + +b; };
const hm = (x) => pad(Math.floor(x / 60) % 24) + ':' + pad(x % 60);
const cap = (t) => t.replace(/^./, (c) => c.toUpperCase());
const iso = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const mkDate = (y, m, d) => { const x = new Date(Date.UTC(y, m, d)); return x.getUTCMonth() === m && x.getUTCDate() === d ? x : null; };

/* ---------------- Prompt 33: avsender, støy og «Glimt husker» ---------------- */

/** Små bokstaver uten aksenter (æøå beholdes) – samme som normText på serveren. */
export const normName = (v) => String(v ?? '').toLowerCase().replace(/å/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'å').replace(/\s+/g, ' ').trim();
const KEEP_UPPER = new Set(['AS', 'ASA', 'DA', 'ANS', 'SA', 'BA', 'AB', 'OUS', 'UNN', 'NAV', 'DNB']);
/** «PÅHÅRET Studio Hoff» → «Påhåret Studio Hoff», «HÅR1» → «Hår1», «HOFFSVEIEN 4, SKØYEN» → «Hoffsveien 4, Skøyen». */
export function niceCase(name) {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim();
  const out = s.replace(/[A-Za-zÆØÅæøåÉéÜüÖöÄä0-9]+/g, (w) => {
    const letters = w.replace(/[^A-Za-zÆØÅæøåÉéÜüÖöÄä]/g, '');
    if (letters.length < 2 || letters !== letters.toUpperCase() || KEEP_UPPER.has(w)) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  });
  return out.replace(/^./, (c) => c.toUpperCase());
}
const PHONE = /(?:\+47[\s-]?)?(?<![\d.:])\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}(?![\d.:])|(?<![\d.:])\d{3}[\s-]\d{2}[\s-]\d{3}(?![\d.:])/;
const NOISE = /^(?:nb\b|nb!|obs\b|obs!|viktig|husk|merk\b|ps\b|unngå gebyr|avbestill|avbestilling|endring|svar\s+stopp|ring\s+oss|tlf|telefon)|kan ikke besvares|unngå gebyr|gebyr|(^|[^a-zæøå])avbestill|ikke møtt|svar\s+(?:stopp|ja|nei)\b/i;
const ADDR_LINE = /^(?:ny\s+)?(?:adresse|sted|oppmøte|oppmøtested|møtested)\s*:/i;
/** Linjen/setningen skal aldri bli tittel (NB!, Viktig, Husk, gebyr, avbestill, telefonnummer, «kan ikke besvares»). */
export const isNoiseLine = (s) => { const x = String(s ?? '').trim(); return !x || NOISE.test(x) || PHONE.test(x) || /^(?:ny\s+)?adresse\b/i.test(x); };
const SIG_KEY = /(?:^|[\s.!?,;])(med\s+vennlig\s+hilsen|vennlig\s+hilsen|beste\s+hilsen|hilsen\s+fra|hilsen|mvh|m\.v\.h\.?)(?![a-zæøå])\.?[\s,:]*/gi;
const SIG_LINE = /^(?:med\s+vennlig\s+hilsen|vennlig\s+hilsen|beste\s+hilsen|hilsen|mvh)(?![a-zæøå])/i;
const NAME_START = /^[A-ZÆØÅ0-9]/;
const PRONOUN = /^(?:oss|meg|deg|dere|seg|vi|dem)$/i;
function cleanName(s) {
  let n = String(s ?? '').split(/\n|[.!?](?:\s|$)|\s(?:tlf|telefon|tel|ring)\b|\s+-\s+|[,;]/i)[0];
  n = n.replace(PHONE, '').replace(/\s+/g, ' ').replace(/[\s,.:;–-]+$/, '').trim();
  if (n.length < 2 || n.length > 50 || n.split(' ').length > 6 || !NAME_START.test(n) || PRONOUN.test(n)) return null;
  if (/^\d+$/.test(n) || isNoiseLine(n)) return null;
  return n;
}
/** Avsenderen/bedriften i teksten («Mvh X», «Hilsen X», «– X» til slutt, «Påminnelse fra X»), pent skrevet, eller null. */
export function senderOf(text) {
  const orig = String(text ?? '').replace(/\r\n?/g, '\n');
  let found = null;
  for (const m of orig.matchAll(SIG_KEY)) { const n = cleanName(orig.slice(m.index + m[0].length)); if (n) found = n; }
  if (!found) {
    // «– Hår1 Majorstuen» helt til slutt (etter at støylinjer er tatt bort).
    const lines = orig.split(/\n+|(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    while (lines.length && isNoiseLine(lines[lines.length - 1]) && !/[–—]\s*[A-ZÆØÅ]/.test(lines[lines.length - 1])) lines.pop();
    const tail = lines.join(' ');
    const d = tail.match(/(?:[.!?]\s+|^)[–—]\s*([A-ZÆØÅ][^\n–—]{1,50}?)\s*\.?\s*$/) || (lines.length > 1 && tail.match(/[.!?]\s+-\s+([A-ZÆØÅ][^\n–—-]{1,50}?)\s*\.?\s*$/));
    if (d) found = cleanName(d[1]);
  }
  if (!found) {
    const f = orig.match(/(?:påminnelse|melding|sms|varsel|beskjed|hilsen|time|timebekreftelse|bekreftelse)\s+fra\s+([^\n:,!?()]{2,50})/i);
    if (f) found = cleanName(f[1].replace(/\s+(?:kl|på|den|om|i|til|for)(?![a-zæøå]).*$/i, ''));
  }
  return found ? niceCase(found) : null;
}
/** Typen et navn peker på («Påhåret Studio Hoff» → frisør), eller null. */
export function kindOfName(name) {
  const n = normName(name);
  if (!n) return null;
  const k = BIZ_KINDS.find(([re]) => re.test(n));
  return k ? k[1] : null;
}
/** Navnet sier allerede typen («Majorstuen Legekontor», «Tannlegene»): da settes ikke typen foran. */
const saysType = (name, lab) => !!lab && normName(name).includes(normName(lab).slice(0, 5));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Det lengste aliaset i «Glimt husker» som teksten treffer, eller null. memory: liste eller {items}. */
export function memoryMatch(text, memory) {
  const list = Array.isArray(memory) ? memory : Array.isArray(memory?.items) ? memory.items : [];
  const t = normName(text);
  if (!t || !list.length) return null;
  let best = null;
  for (const m of list) {
    if (!m || (m.kind && m.kind !== 'alias')) continue;
    const k = normName(m.match);
    if (k.length < 2) continue;
    if (!new RegExp('(^|[^a-z0-9æøå])' + escRe(k) + '(?![a-z0-9æøå])').test(t)) continue;
    if (!best || k.length > normName(best.match).length) best = m;
  }
  return best;
}
/** Tittelen et alias gir: egen tittel, ellers «Frisør · Påhåret» (type + navn). */
export function aliasTitle(m, business) {
  if (m?.title && String(m.title).trim()) return String(m.title).trim();
  const name = business || niceCase(m?.match ?? '');
  const lab = TYPE_LABEL[m?.type] ?? '';
  return lab && !saysType(name, lab) ? `${lab} · ${name}` : name || lab || 'Avtale';
}

export function osloTodayISO(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function todayOf(todayISO) {
  const s = typeof todayISO === 'string' && /^\d{4}-\d{2}-\d{2}/.test(todayISO) ? todayISO.slice(0, 10)
    : todayISO instanceof Date ? osloTodayISO(todayISO) : osloTodayISO();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// «fre 25. sep · 14:30» (uten tid: «fre 25. sep»)
export function quickLabel(r) {
  if (!r || !r.date) return '';
  const d = new Date(r.date + 'T00:00:00Z');
  return WD_SHORT[d.getUTCDay()] + ' ' + d.getUTCDate() + '. ' + MN_SHORT[d.getUTCMonth()] + (r.start ? ' · ' + r.start : '');
}

export function parseQuick(text, todayISO, memory) {
  const orig = String(text ?? '').replace(/\r\n?/g, '\n');
  const raw = orig.replace(/\s+/g, ' ').trim();
  const t = raw.toLowerCase();
  const today = todayOf(todayISO);
  const empty = { ok: false, why: 'Skriv hva timen gjelder.', title: '', date: null, start: null, end: null, place: null, type: 'annet', duration: 60, allDay: false, confidence: 0, isAppointment: false };
  if (!raw) return empty;

  let d = null, s = null, e = null, yr = null;
  const used = [];
  // Intervall 14.30–15.15 / kl 9–10
  const rng = t.match(/(?:kl\.?\s*|klokka\s*)?\b(\d{1,2})[:.](\d{2})\s*(?:-|–|—|til)\s*(\d{1,2})[:.](\d{2})\b/);
  if (rng && +rng[1] <= 23 && +rng[2] <= 59 && +rng[3] <= 23 && +rng[4] <= 59) { s = pad(+rng[1]) + ':' + rng[2]; e = pad(+rng[3]) + ':' + rng[4]; used.push(rng[0]); }
  else {
    const rh = t.match(/(?:kl\.?|klokka)\s*(\d{1,2})\s*(?:-|–|—|til)\s*(\d{1,2})(?![.:\d])/);
    if (rh && +rh[1] <= 23 && +rh[2] <= 23) { s = pad(+rh[1]) + ':00'; e = pad(+rh[2]) + ':00'; used.push(rh[0]); }
  }
  // «3. november», «3 nov 2026»
  const mon = t.match(/\b(\d{1,2})\.?\s*(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-zæøå]*\.?(?:\s+(\d{4}))?/);
  if (mon && +mon[1] >= 1 && +mon[1] <= 31) { d = [+mon[1], MON[mon[2]]]; if (mon[3]) yr = +mon[3]; used.push(mon[0]); }

  const tok = [...t.matchAll(/(kl\.?\s*|klokka\s*)?\b(\d{1,2})([.:/])(\d{1,2})(?:[./](\d{2,4}))?\b/g)]
    .filter((m) => !used.some((u) => u.includes(m[0].trim())));
  const amb = [];
  for (const m of tok) {
    const a = +m[2], b = +m[4], kl = !!m[1], col = m[3] === ':', y = m[5];
    const canT = a <= 23 && b <= 59 && m[4].length === 2;
    const canD = a >= 1 && a <= 31 && b >= 1 && b <= 12;
    if (y) { if (!d && canD) { d = [a, b - 1]; yr = +y < 100 ? 2000 + +y : +y; } continue; }
    if ((kl || col) && canT && !s) { s = pad(a) + ':' + pad(b); continue; }
    // «14.30»: minutter > 12 → tid. «25.09»: dag > 23 → dato. Ellers den som mangler.
    if (canT && !canD && !s) { s = pad(a) + ':' + pad(b); continue; }
    if (canD && !canT && !d) { d = [a, b - 1]; continue; }
    if (canT || canD) amb.push([a, b, canT, canD]);
  }
  if (!s) { const k1 = t.match(/(?:kl\.?|klokka)\s*(\d{1,2})(?![.:\d])/); if (k1 && +k1[1] <= 23) s = pad(+k1[1]) + ':00'; }
  for (const [a, b, canT, canD] of amb) {
    if (!s && d && canT) s = pad(a) + ':' + pad(b);
    else if (!d && s && canD) d = [a, b - 1];
    else if (!s && !d) {
      // Begge mangler: datoord i teksten → tid, ellers dato hvis mulig.
      const hasDayWord = /\b(i dag|i kveld|i morgen|i overmorgen|neste uke)\b/.test(t) || WDAYS.some((w) => new RegExp('(^|[^a-zæøå])' + w + '([^a-zæøå]|$)').test(t));
      if (canT && (hasDayWord || !canD)) s = pad(a) + ':' + pad(b); else if (canD) d = [a, b - 1];
    }
  }

  let dt = null;
  if (d) {
    dt = mkDate(yr || today.getUTCFullYear(), d[1], d[0]);
    if (dt && !yr && dt < today) dt = mkDate(today.getUTCFullYear() + 1, d[1], d[0]);
  } else if (/(^|\s)i overmorgen\b/.test(t)) dt = addDays(today, 2);
  else if (/(^|\s)i morgen\b/.test(t)) dt = addDays(today, 1);
  else if (/(^|\s)i (dag|kveld)\b/.test(t)) dt = today;
  else {
    const wi = WDAYS.findIndex((w) => new RegExp('(^|[^a-zæøå])' + w + '([^a-zæøå]|$)').test(t));
    const nextWeek = /\bneste uke\b/.test(t);
    if (wi >= 0) {
      if (nextWeek) {
        const mondayNext = addDays(today, 7 - ((today.getUTCDay() + 6) % 7));
        dt = addDays(mondayNext, (wi + 6) % 7);
      } else {
        let n = (wi - today.getUTCDay() + 7) % 7;
        if (n === 0) n = 7; // neste forekomst
        dt = addDays(today, n);
      }
    } else if (nextWeek) dt = addDays(today, 7 - ((today.getUTCDay() + 6) % 7));
  }

  const kind = KINDS.find(([re]) => re.test(t));
  const type = kind ? kind[3] : 'annet';
  const dur = kind ? kind[1] : 60;

  let ti = '';
  // Prompt 33: tittelen hentes ikke fra støylinjer (NB!, adresse, gebyr, telefon, signatur).
  const sentences = orig.split(/\n+|(?<=[.!?])\s+(?=[A-ZÆØÅ])/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const cleanText = sentences.filter((x) => !isNoiseLine(x) && !ADDR_LINE.test(x) && !SIG_LINE.test(x)).join(' ')
    || raw.replace(/^(?:(?:nb|obs|viktig|husk|merk|ps)(?![a-zæøå])[!:.]?\s*)+/i, '') || raw;
  let hos = raw.match(/(?:time|avtale|konsultasjon|timebestilling)?\s*\bhos\s+(.+?)(?=\s+(?:(?:kl\.?|klokka|den|på|om|i\s+(?:dag|kveld|morgen|overmorgen)|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|neste)(?![a-zæøå])|\d)|[,\n:;!?]|(?<!\b(?:[Dd]r|[Ss]t|[Nn]r|ca|[Tt]annl))\.|$)/i);
  if (hos && PRONOUN.test(hos[1].trim())) hos = null;
  if (hos) {
    ti = hos[1].trim();
    // «middag hos mormor» → behold det som står foran «hos» (men ikke «Du har time»)
    const at = hos.index + hos[0].search(/\bhos\s/i);
    const pre = raw.slice(0, at).split(/[.!?:;,\n]/).pop().trim();
    if (pre && !/\d/.test(pre) && pre.length <= 30 && !PRE_SKIP.test(pre)) ti = pre + ' hos ' + ti;
  } else if (kind) ti = kind[2];
  else ti = cleanText.replace(/^(legg til|lag|sett opp|book|bestill|ny)\s+/i, '').replace(/\b(time|avtale)\b/i, '').split(/(?:^|\s+)(?:kl\.?|klokka|den|i dag|i kveld|i morgen|i overmorgen|neste|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|\d)(?![a-zæøå])/i)[0].trim();
  ti = ti.replace(/^(legg til\s+)?(time|avtale)\s+/i, '').replace(/[\s,.:;–-]+$/, '').trim();
  if (!ti) ti = kind ? kind[2] : 'Avtale';
  ti = cap(ti.length > 48 ? ti.slice(0, 46) + '…' : ti);
  if (kind && !kind[0].test(ti.toLowerCase()) && !new RegExp(kind[2], 'i').test(ti) && !/frisør|lege|tannlege|dr\./i.test(ti)) ti = kind[2] + ' · ' + ti;

  // Prompt 33: avsenderen i signaturen blir bedriften; typen fra navnet (eller teksten). «Frisør · Påhåret Studio Hoff».
  const business = senderOf(orig);
  let typeOut = type, durOut = dur, kindLabel = kind ? kind[2] : '';
  if (business) {
    const bk = kindOfName(business);
    if (bk) { typeOut = TYPES.includes(bk) ? bk : 'annet'; durOut = DURATION[bk] ?? dur; kindLabel = TYPE_LABEL[bk]; }
    const name = business.length > 48 ? business.slice(0, 46) + '…' : business;
    ti = kindLabel && !saysType(name, kindLabel) ? `${kindLabel} · ${name}` : name;
  }
  // «Glimt husker»: brukerens eget alias vinner (type + tittel).
  const mem = memoryMatch(orig, memory);
  if (mem) {
    typeOut = TYPES.includes(mem.type) ? mem.type : 'annet';
    durOut = DURATION[mem.type] ?? durOut;
    ti = aliasTitle(mem, business);
  }

  // Sted: «Adresse:», «Sted:», «Oppmøte:» eller «på <Stort ord>»
  const one = orig.replace(/[ \t]+/g, ' ');
  let place = (one.match(/(?:^|[^a-zæøå])(?:adresse|sted|oppmøte|oppmøtested|møtested)\s*:\s*([^\n;]+?)(?=\s*(?:\n|;|\.\s|\.$|$))/i) || [])[1] || '';
  if (!place) {
    const pm = one.match(/(?:^|\s)på\s+([A-ZÆØÅ][^,\n.;!?]{1,40}?)(?=\s+(?:kl\.?|klokka|den|i dag|i morgen|i overmorgen|neste|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?![a-zæøå])|\s+\d{1,2}[.:]\d{2}|[,\n.;!?]|$)/);
    if (pm) place = pm[1];
  }
  place = place.trim() || null;
  if (place && place === place.toUpperCase() && /[A-ZÆØÅ]{3}/.test(place)) place = niceCase(place);

  if (s && !e) e = hm(toMin(s) + durOut);
  const intent = INTENT.test(t);
  let conf = 0.3;
  if (dt) conf += 0.3;
  if (s) conf += 0.2;
  if (kind) conf += 0.1;
  if (hos || intent || business) conf += 0.1;
  if (business && !kind && typeOut !== 'annet') conf += 0.1;
  if (mem && dt) conf = Math.max(conf, 0.9);
  conf = Math.round(Math.min(conf, 0.95) * 100) / 100;
  const extra = { ...(business ? { business } : {}), ...(mem ? { memory: { ...(mem.id != null ? { id: mem.id } : {}), match: mem.match, type: mem.type } } : {}) };

  if (!dt) {
    return { ok: false, why: NO_DATE, title: ti, date: null, start: s || null, end: s ? e : null, place, type: typeOut, duration: durOut, allDay: false, confidence: Math.min(conf, 0.5), isAppointment: false, ...extra };
  }
  const out = { ok: true, title: ti, date: iso(dt), start: s || null, end: s ? e : null, place, type: typeOut, duration: durOut, allDay: !s, confidence: conf, isAppointment: !!(intent || kind || mem || (business && typeOut !== 'annet') || (business && s)), ...extra };
  if (!s) out.why = NO_TIME;
  return out;
}

export default parseQuick;
