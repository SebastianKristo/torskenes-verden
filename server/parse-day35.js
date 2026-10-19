// Prompt 35 (SERVER35): felles dag-tolkning for Glimt – brukt av /api/assist (Homelab-søket og Chat), Kalender-Glimt
// (calendar-glimt.js og kalender33.js) og POST /api/glimt. Fiksen for «Hva skjer i morgen?» som ga svar for i dag:
// spørsmålet normaliseres først (små bokstaver, tegnsetting fjernet, mellomrom slått sammen og polstret), så leses dag-ordet.
//
// parseDay(text, today='YYYY-MM-DD') → {date, offset, word, label:'i morgen', Label:'I morgen', kind} | null
//   kind: 'rel' (i dag/i morgen/overmorgen/i går/om N dager) | 'weekday' | 'date'
//   overmorgen / overimorgen / i overmorgen → +2 · i morgen / imorgen / i morra / imorra / imorgo / tomorrow → +1
//   i dag / idag / i kveld / ikveld / i natt / today / tonight → 0 · i går / igår / yesterday → −1 · om 3 dager → +3
//   ukedag (norsk/engelsk): neste forekomst (samme ukedag = om 7 dager), «neste fredag» = fredag i neste uke (+7 hvis < 7)
//   dato: 25.10 · 25.10.2026 · 25/10 · 25. okt · 25 oktober · 2026-10-25 (uten år og passert → neste år)
export const WD_NO = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const WD_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const MON_NO = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (s) => s.split('-').map(Number);
export const addDaysISO = (s, n) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const wdOf = (s) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const diff = (a, b) => { const [y1, m1, d1] = ymd(a), [y2, m2, d2] = ymd(b); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000); };
const validDate = (s) => /^\d{4}-\d\d-\d\d$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const NUM = { en: 1, ett: 1, ei: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10 };

/** Normaliserer: små bokstaver, fjerner ? ! . , : ; « » " og polstrer med mellomrom. */
export const normDayText = (t) => ` ${String(t ?? '').toLowerCase().replace(/[?!.,:;«»"“”()]/g, ' ').replace(/\s+/g, ' ').trim()} `;

/** «i dag», «i morgen», «i overmorgen», «i går», «på fredag» (< 7 dager), ellers «fredag 30. oktober». */
export function dayLabel(date, today) {
  const n = diff(today, date);
  if (n === 0) return 'i dag';
  if (n === 1) return 'i morgen';
  if (n === 2) return 'i overmorgen';
  if (n === -1) return 'i går';
  const [, m, d] = ymd(date);
  if (n > 2 && n < 7) return `på ${WD_NO[wdOf(date)]}`;
  return `${WD_NO[wdOf(date)]} ${d}. ${MON_NO[m - 1]}`;
}

function out(date, today, word, kind) {
  const label = dayLabel(date, today);
  return { date, offset: diff(today, date), word: word.trim(), label, Label: label.replace(/^på /, '').replace(/^./, (c) => c.toUpperCase()), kind };
}

/** Dagen teksten gjelder, eller null (ingen dag-ord). */
export function parseDay(text, today) {
  if (!validDate(String(today ?? ''))) throw new Error('parseDay: today må være YYYY-MM-DD');
  const n = normDayText(text);
  let m;
  if ((m = n.match(/ (i )?over ?i? ?morgen /))) return out(addDaysISO(today, 2), today, m[0], 'rel');
  if ((m = n.match(/ (i morgen|imorgen|i morra|imorra|i morgo|imorgo|tomorrow|tmrw) /))) return out(addDaysISO(today, 1), today, m[0], 'rel');
  if ((m = n.match(/ (i går|igår|i gaar|yesterday) /))) return out(addDaysISO(today, -1), today, m[0], 'rel');
  if ((m = n.match(/ (i dag|idag|i kveld|ikveld|i natt|inatt|today|tonight) /))) return out(today, today, m[0], 'rel');
  if ((m = n.match(/ om (\d{1,3}|en|ett|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti) (dag|dager|døgn) /))) { const k = NUM[m[1]] ?? +m[1]; if (k <= 400) return out(addDaysISO(today, k), today, m[0], 'rel'); }
  if ((m = n.match(/ in (\d{1,3}) days? /))) return out(addDaysISO(today, +m[1]), today, m[0], 'rel');
  // ISO-dato
  if ((m = String(text ?? '').match(/\b(\d{4})-(\d\d)-(\d\d)\b/)) && validDate(`${m[1]}-${m[2]}-${m[3]}`)) return out(`${m[1]}-${m[2]}-${m[3]}`, today, m[0], 'date');
  // 25.10 / 25.10.2026 / 25/10 (punktum beholdes her)
  const raw = ` ${String(text ?? '').toLowerCase().replace(/[?!,;«»"]/g, ' ')} `;
  if ((m = raw.match(/(?:^|[\s(])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=[\s.)]|$)/)) && !/(kl\.?|klokka|kl)\s*$/.test(raw.slice(0, m.index + 1))) {
    const r = dateOf(+m[1], +m[2], m[3], today);
    if (r) return out(r, today, m[0], 'date');
  }
  // 25. okt / 25 oktober / 25. oktober 2026
  if ((m = raw.match(/(?:^|\s)(\d{1,2})\.?\s+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|aug|sep|sept|okt|nov|des)\.?(?:\s+(\d{4}))?(?=[\s.]|$)/))) {
    const mi = MON_NO.indexOf(m[2]) >= 0 ? MON_NO.indexOf(m[2]) : MON_SHORT.indexOf(m[2] === 'sept' ? 'sep' : m[2]);
    const r = dateOf(+m[1], mi + 1, m[3], today);
    if (r) return out(r, today, m[0], 'date');
  }
  // Ukedag (norsk eller engelsk), «neste fredag», «på fredag», «next friday»
  if ((m = n.match(/ (neste |next |på |on )?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(en)? /))) {
    const w = WD_NO.indexOf(m[2]) >= 0 ? WD_NO.indexOf(m[2]) : WD_EN.indexOf(m[2]);
    let df = (w - wdOf(today) + 7) % 7 || 7;
    if (/neste|next/.test(m[1] ?? '') && df < 7) df += 7;
    return out(addDaysISO(today, df), today, m[0], 'weekday');
  }
  return null;
}

function dateOf(d, mo, y, today) {
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const [ty] = ymd(today);
  let yy = y ? (+y < 100 ? 2000 + +y : +y) : ty;
  let s = `${yy}-${pad(mo)}-${pad(d)}`;
  if (!validDate(s)) return null;
  if (!y && s < today) { yy += 1; s = `${yy}-${pad(mo)}-${pad(d)}`; if (!validDate(s)) return null; }
  return s;
}

/** Bare datoen (eller null). */
export const parseDayDate = (text, today) => parseDay(text, today)?.date ?? null;
