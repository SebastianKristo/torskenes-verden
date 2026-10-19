// Prompt 35: felles dag-tolkning på klienten (samme regler som serverens parseDay()): «i morgen», «imorgen», «i morra»,
// «overmorgen», «tomorrow», «i dag», «i går», ukedager (norsk og engelsk, «neste fredag»), og datoer («21.10», «21. oktober»,
// «2026-10-21»). Brukes av Kalender-Glimt på web («hva skjer i morgen?» ga dagens avtaler før).
const WD_NB = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const WD_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MN_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const d0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** → {date: Date (00:00), offset, label:'i morgen'|'fredag'|'21. oktober', kind:'rel'|'weekday'|'date'} eller null. */
export function parseDay(text, now = new Date()) {
  const t = ` ${String(text ?? '').toLowerCase().replace(/[?!,;]/g, ' ')} `, today = d0(now);
  const out = (date, label, kind) => ({ date, offset: Math.round((date - today) / 864e5), label, kind });
  if (/\s(i\s*overmorgen|overmorgen|day after tomorrow)\s/.test(t)) return out(add(today, 2), 'i overmorgen', 'rel');
  if (/\s(i\s*morgen|imorgen|i\s*morra|imorra|tomorrow|tmrw)\s/.test(t)) return out(add(today, 1), 'i morgen', 'rel');
  if (/\s(i\s*går|igår|yesterday)\s/.test(t)) return out(add(today, -1), 'i går', 'rel');
  if (/\s(i\s*dag|idag|today|i\s*kveld|ikveld|tonight|i\s*natt)\s/.test(t)) return out(today, 'i dag', 'rel');
  let m = t.match(/\s(\d{4})-(\d{2})-(\d{2})\s/);
  if (m) return out(new Date(+m[1], +m[2] - 1, +m[3]), `${+m[3]}. ${MN[+m[2] - 1]}`, 'date');
  m = t.match(/\s(\d{1,2})\.\s?(\d{1,2})\.?(\d{2,4})?\s/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
    let y = m[3] ? +m[3] : today.getFullYear(); if (y < 100) y += 2000;
    let d = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && d < add(today, -60)) d = new Date(y + 1, +m[2] - 1, +m[1]);
    return out(d, `${+m[1]}. ${MN[+m[2] - 1]}`, 'date');
  }
  m = t.match(new RegExp(`\\s(\\d{1,2})\\.?\\s+(${MN.join('|')}|${MN_EN.join('|')}|${MN.map((x) => x.slice(0, 3)).join('|')})\\b`));
  if (m) {
    let mi = MN.indexOf(m[2]); if (mi < 0) mi = MN_EN.indexOf(m[2]); if (mi < 0) mi = MN.map((x) => x.slice(0, 3)).indexOf(m[2]);
    let d = new Date(today.getFullYear(), mi, +m[1]); if (d < add(today, -60)) d = new Date(today.getFullYear() + 1, mi, +m[1]);
    return out(d, `${+m[1]}. ${MN[mi]}`, 'date');
  }
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\s(neste\\s+|next\\s+|på\\s+|on\\s+)?(${WD_NB[i]}|${WD_EN[i]})(en)?\\s`);
    const w = t.match(re);
    if (w) { let n = (i - today.getDay() + 7) % 7; if (w[1] && /neste|next/.test(w[1]) && n === 0) n = 7; return out(add(today, n), WD_NB[i], 'weekday'); }
  }
  return null;
}
