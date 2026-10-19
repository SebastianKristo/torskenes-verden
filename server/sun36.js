// Prompt 36: dagslys, soloppgang og solnedgang for en dato og et sted, regnet lokalt (NOAA/suncalc-formelen i weather.js,
// ingen ny avhengighet og ingen nettkall). Brukes av Glimt (assist.js) for «hvor mange timer med dagslys er det 29.06.2027».
import { sunTime } from './weather.js';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
/** Gjelder spørsmålet sola/dagslyset? */
export const SUN_RE = /dagslys|soloppgang|solnedgang|sola?\s+(går|gå|står)\s+(opp|ned)|når\s+(går|står)\s+sola|lyse\s+timer|lys(t)?\s+ute|daylight|sunrise|sunset/i;
export const isSunQuestion = (t) => SUN_RE.test(String(t ?? ''));

const hm = (d, tz) => new Intl.DateTimeFormat('nb-NO', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace('.', ':');
const longDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d}. ${MONTHS[m - 1]} ${y}`; };

/**
 * → {date, place, tz, sunrise, sunset, daylightMin, polar:'midnattssol'|'mørketid'|null, text}
 * text: «29. juni 2027 i Oslo: soloppgang 03:54, solnedgang 22:44, 18 t 50 min dagslys.»
 */
export function daylight(dateIso, { name = 'Oslo', lat = 59.9139, lon = 10.7522, tz = 'Europe/Oslo' } = {}) {
  const rise = sunTime(dateIso, lat, lon, -0.833, true), set = sunTime(dateIso, lat, lon, -0.833, false);
  const where = `${longDate(dateIso)} i ${name}`;
  if (!rise || !set) {
    // Sola er over (midnattssol) eller under (mørketid) horisonten hele døgnet: deklinasjonen (samme formel som sunTime).
    const rad = Math.PI / 180, n = Math.round((Date.parse(dateIso + 'T12:00:00Z') - Date.UTC(2000, 0, 1, 12)) / 864e5) - lon / 360;
    const M = (357.5291 + 0.98560028 * n) % 360, C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad);
    const L = (M + C + 180 + 102.9372) % 360, decl = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad));
    const polar = Math.sign(lat) === Math.sign(decl) ? 'midnattssol' : 'mørketid';
    return { date: dateIso, place: name, tz, sunrise: null, sunset: null, daylightMin: polar === 'midnattssol' ? 1440 : 0, polar,
      text: polar === 'midnattssol' ? `${where}: **midnattssol**, sola går ikke ned (24 t dagslys).` : `${where}: **mørketid**, sola står ikke opp.` };
  }
  let min = Math.round((set - rise) / 60000);
  if (min < 0) min += 1440;
  const h = Math.floor(min / 60), m = min % 60;
  const sr = hm(rise, tz), ss = hm(set, tz);
  return { date: dateIso, place: name, tz, sunrise: sr, sunset: ss, sunriseAt: rise.toISOString(), sunsetAt: set.toISOString(), daylightMin: min, polar: null,
    text: `${where}: soloppgang ${sr}, solnedgang ${ss}, **${h} t ${m} min dagslys**.` };
}
