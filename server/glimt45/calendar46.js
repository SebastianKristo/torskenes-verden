// Prompt 46 (GLIMT46): kalender i Glimt-motoren.
//  1. Standardkalender (claude-code-glimt-kalender-standardkalender.md): lovlige kalendere = de brukeren kan skrive til (appens
//     kalendere, Familie i Google, og Google-kalendere som er skrivbare i Google). Ingen hardkodet «Privat | Familie». Sier ikke
//     brukeren noe, brukes standardkalenderen fra Innstillinger → Kalender → Standardkalender. Nevnt kalender matches fuzzy.
//  2. Rask time (claude-code-kalender-rask-time-glimt.md): «vi skal se på dune på coluseum kino 17.12 kl 17:30» → tittel «Dune – Kino»,
//     sted «Colosseum Kino» (stavefeil rettet, slått opp i stedssøket), slutt = start + spilletid + 15 min når filmen er kjent (Radarr/TMDB).
import { kv } from '../db.js';
import { normText } from '../calendar.js';

const cap = (s) => String(s ?? '').replace(/^\s*(\p{L})/u, (m, c) => m.replace(c, c.toUpperCase()));
const fold = (s) => normText(String(s ?? '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå ]+/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}

/* ---------------- Kalendere ---------------- */

const K33 = async () => import('../kalender33.js');
/**
 * Kalenderne brukeren kan skrive til. → {calendars:[{id, name, backend, source:'app'|'google', calId?, google:boolean}], defaultId, google:boolean}
 * Lokale/app-kalendere skrives via Privat/Familie-backenden (Google når koblet til, ellers lokalt). Google-kalendere som er
 * skrivbare i Google, men skjult som skrivebeskyttet i appen, skrives direkte til Google.
 */
export async function writableCalendars46(user) {
  const k = await K33();
  const { googleConnected } = await import('../birthdays.js');
  const g = googleConnected(user);
  const all = k.appCalendarsOf(user);
  const list = [];
  const { isGoogleCalId } = await import('../kalender36g.js');
  for (const c of all) {
    if (isGoogleCalId(c.id)) { if (g && c.readOnly === false && c.calId) list.push({ id: c.id, name: c.name, backend: 'privat', source: 'google', calId: c.calId, google: true }); continue; }
    if (!c.writable || c.readOnly) continue;
    list.push({ id: c.id, name: c.name, backend: c.backend ?? 'privat', source: 'app', google: g && (c.backend ?? 'privat') !== 'local' });
  }
  if (!list.some((c) => c.id === 'familie')) list.push({ id: 'familie', name: 'Familie', backend: 'familie', source: 'app', google: g, virtual: true });
  const prefs = k.kal46.prefs(user);
  const want = k.resolveCalendar(user, prefs.defaultCalendar);
  const def = list.find((c) => c.id === want) ?? list.find((c) => c.source === 'google') ?? list.find((c) => c.id === 'personlig') ?? list[0];
  const readOnly = all.filter((c) => !list.some((x) => x.id === c.id)).map((c) => ({ id: c.id, name: c.name }));
  return { calendars: list, defaultId: def?.id ?? 'personlig', google: g, readOnly };
}
export const calendarLabel46 = (c) => (c ? `${c.name}${c.google && c.source === 'app' && c.backend === 'privat' && c.id === 'personlig' ? ' (Google)' : ''}` : 'Personlig');

const CAL_MENTION = /(?<![a-zæøå])(?:i|på|til|inn\s+i)\s+(?:den\s+|min\s+|mitt\s+)?([\p{L}\d@.]*?)-?kalender(?:en)?(?:\s+(?:«|")?([\p{Lu}][\p{L}\d .@-]{1,30}?)(?:»|")?(?=[\s,.!?]|$))?(?![a-zæøå])/iu;
/** Kalendernavnet brukeren nevner («i familiekalenderen», «på jobb-kalenderen», «i kalenderen Trening»), eller null. */
export function calendarMention46(text) {
  const m = CAL_MENTION.exec(String(text ?? ''));
  const n2 = (m?.[2] ?? '').trim();
  const n = (m?.[1] || (n2 && !/^(?:i|på|neste|denne|kl|klokka|om)?\s*(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|morgen|dag|kveld|\d)/i.test(n2) ? n2 : '') || '').trim();
  if (!n) return null;
  return /^personlige?$/i.test(n) ? 'personlig' : n;
}
/** Teksten uten «i familiekalenderen» (så det ikke havner i tittelen). */
export const withoutCalendarMention46 = (text) => {
  const s = String(text ?? '');
  const m = CAL_MENTION.exec(s);
  if (!m) return s;
  const nm = calendarMention46(m[0]) ?? '';
  const keepTail = m[2] && nm !== m[2].trim() ? m[0].slice(m[0].lastIndexOf(m[2])) : '';
  return `${s.slice(0, m.index)} ${keepTail} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
};
/** Fuzzy treff i lista (Familie, familie@…, «Familie (Google)»). → kalender | null */
export function matchCalendar46(list, name) {
  const w = fold(name).replace(/\s*kalender(en)?$/, '');
  if (!w) return null;
  const score = (c) => {
    const n = fold(c.name), id = fold(c.id);
    if (n === w || id === w) return 0;
    if (n.startsWith(w) || w.startsWith(n) || n.split(/[\s@(]/)[0] === w) return 1;
    const d = lev(w, n.split(/[\s@(]/)[0]);
    return d <= Math.max(1, Math.round(w.length * 0.25)) ? 2 + d : 99;
  };
  const best = list.map((c) => [c, score(c)]).filter(([, s]) => s < 99).sort((a, b) => a[1] - b[1]);
  return best[0]?.[0] ?? null;
}

/* ---------------- Steder (stavefeil i kjente steder) ---------------- */

// Kjente spillesteder (navn og type). Adressen slås opp i stedssøket (kal37.geocode: Nominatim, cache i databasen).
export const VENUES46 = [
  ['Colosseum Kino', 'kino'], ['Saga Kino', 'kino'], ['Klingenberg Kino', 'kino'], ['Ringen Kino', 'kino'], ['Gimle Kino', 'kino'], ['Vika Kino', 'kino'], ['Symra Kino', 'kino'],
  ['Odeon Storo', 'kino'], ['Odeon Stovner', 'kino'], ['Eldorado Kino', 'kino'], ['Bergen Kino', 'kino'], ['Nova Kino', 'kino'], ['Prinsen Kino', 'kino'],
  ['Oslo Konserthus', 'konsert'], ['Operaen', 'opera'], ['Nationaltheatret', 'teater'], ['Det Norske Teatret', 'teater'], ['Oslo Nye Teater', 'teater'], ['Chat Noir', 'teater'],
  ['Rockefeller', 'konsert'], ['Sentrum Scene', 'konsert'], ['Cosmopolite', 'konsert'], ['Chateau Neuf', 'konsert'], ['Unity Arena', 'konsert'], ['Telenor Arena', 'konsert'],
  ['Ullevaal Stadion', 'kamp'], ['Intility Arena', 'kamp'], ['Lerkendal Stadion', 'kamp'],
];
const VENUE_TYPE_WORD = /(?<![a-zæøå])(kino|teater|teateret|konserthus|scene|arena|stadion|opera)(?![a-zæøå])/i;
/** «coluseum kino» → {name:'Colosseum Kino', type:'kino', corrected:true}; ukjent → {name: rensket tekst, type?, corrected:false}. */
export function venueOf46(raw) {
  const t = fold(raw);
  if (!t) return null;
  let best = null;
  for (const [name, type] of VENUES46) {
    const n = fold(name);
    const d = lev(t, n);
    if (d <= Math.max(1, Math.round(n.length * 0.2)) && (!best || d < best.d)) best = { name, type, d };
    else if (t.length >= 5 && n.startsWith(t) && (!best || best.d > 1)) best = { name, type, d: 1 };
  }
  if (best) return { name: best.name, type: best.type, corrected: fold(best.name) !== t };
  const tw = VENUE_TYPE_WORD.exec(t)?.[1]?.toLowerCase() ?? null;
  return { name: String(raw).trim().replace(/(^|\s)(\p{Ll})/gu, (m, a, c) => a + c.toUpperCase()), type: tw ? tw.replace(/teateret/, 'teater').replace(/konserthus|scene|arena/, 'konsert').replace(/stadion/, 'kamp') : null, corrected: false };
}

let geoImpl = null;
/** Bare for tester: (navn) → {address, label, lat, lon} | null */
export const _setPlace46 = (fn) => { geoImpl = fn ?? null; };
/** Stedet slått opp i stedssøket (samme som adressefeltet i Kalender). Maks 2,5 s. → {name, address, label, lat, lon} | null */
export async function lookupPlace46(name) {
  if (!name) return null;
  try {
    const g = geoImpl ? await geoImpl(name) : await Promise.race([(await import('../kal37.js')).geocode(name), new Promise((r) => setTimeout(() => r(null), 2500))]);
    return g ? { name, address: g.address ?? g.label ?? null, label: g.label ?? g.address ?? null, lat: g.lat ?? null, lon: g.lon ?? null } : null;
  } catch { return null; }
}

/* ---------------- Film (spilletid og plakat) ---------------- */

let movieImpl = null;
/** Bare for tester: (tittel) → {title, year, runtime, poster} | null */
export const _setMovie46 = (fn) => { movieImpl = fn ?? null; };
const movieCache = new Map();
/** Filmen fra Media (Radarr-oppslag mot TMDB), eller null (Media ikke satt opp / ukjent). Maks 3 s. */
export async function movieOf46(title) {
  const k = fold(title);
  if (!k || k.length < 2) return null;
  if (movieImpl) return movieImpl(title);
  if (movieCache.has(k)) return movieCache.get(k);
  let out = null;
  try {
    // Samme oppslag som Media bruker (Radarr /movie/lookup → TMDB). Ikke satt opp → kaster → null.
    const m = await import('../media43.js');
    const list = await Promise.race([m.arr43('radarr', 'GET', '/movie/lookup', { query: { term: title }, timeout: 3000 }), new Promise((r) => setTimeout(() => r(null), 3000))]);
    // Bare eksakt tittel: «Dune» skal ikke få spilletiden til «Dune: Part Three».
    const x = (Array.isArray(list) ? list : []).find((y) => fold(y.title) === k) ?? null;
    if (x && x.runtime > 0) out = { title: x.title, year: x.year ?? null, runtime: x.runtime, poster: (x.images ?? []).find((i) => i.coverType === 'poster')?.remoteUrl ?? null, tmdbId: x.tmdbId ?? null };
  } catch { out = null; }
  movieCache.set(k, out);
  return out;
}

/* ---------------- Tittel og sted fra teksten ---------------- */

const FILL_LEAD = /^(?:(?:vi|jeg|dere|du|de)\s+(?:skal|må|vil|kan|har\s+lyst\s+til\s+å)\s+|skal\s+|må\s+|husk\s+(?:å\s+)?|planlegger\s+å\s+|tenker\s+å\s+)+(?:(?:å|og)\s+)?/i;
const SEE = /^(?:se\s+på|se|å\s+se|gå\s+på|dra\s+på|gå\s+og\s+se)\s+/i;
/**
 * Tittel og sted fra resten av teksten (dato og tid er allerede tatt ut). Ingen modell: deterministisk reserve og etterkontroll.
 * «vi skal se på dune på coluseum kino» → {title:'Dune – Kino', location:'Colosseum Kino', venueType:'kino', film:'Dune'}
 * «tannlege hos Nina» → {title:'Tannlege', location:'Nina'} · «middag med mormor» → {title:'Middag med mormor', location:null}
 */
export function splitTitlePlace46(rest) {
  let t = String(rest ?? '').replace(/\s+/g, ' ').replace(/[\s.,;:!–-]+$/g, '').trim();
  t = t.replace(/^(?:(?:kan du|vil du|glimt,?)\s+)?(?:legg(?:e)?\s+(?:til|inn)|sett\s+opp|book(?:e)?|lag|opprett|ny|nytt)\s+(?:en\s+|et\s+)?(?:time|avtale)?\s*/i, '').trim();
  t = t.replace(FILL_LEAD, '').trim();
  let location = null, venueType = null, corrected = false;
  // «… på/i/ved X kino|teater|…» eller kjent sted. Alle delingspunkt prøves; kjent sted vinner, ellers siste med typeord.
  let pick = null;
  for (const m of t.matchAll(/\s+(?:på|i|ved)\s+/gi)) {
    const head = t.slice(0, m.index).trim(), tail = t.slice(m.index + m[0].length).trim();
    if (!head || !tail) continue;
    const v = venueOf46(tail);
    if (!v) continue;
    const known = VENUES46.some(([n]) => n === v.name);
    if (known || v.type) { if (!pick || known || !pick.known) pick = { head, v, known }; if (known) break; }
  }
  if (pick) { location = pick.v.name; venueType = pick.v.type; corrected = pick.v.corrected; t = pick.head; }
  // «tannlege hos Nina» → sted Nina.
  if (!location) {
    const hm = /^(.*?)\s+hos\s+(.+)$/i.exec(t);
    if (hm && hm[1].trim()) { location = hm[2].trim().replace(/(^|\s)(\p{Ll})/gu, (m, a, c) => a + c.toUpperCase()); t = hm[1].trim(); }
  }
  t = t.replace(SEE, '').trim();
  let film = null;
  if (venueType === 'kino' && t && !/^(kino|film)$/i.test(t)) {
    film = t.replace(/^(?:filmen|den\s+nye)\s+/i, '').replace(/(^|\s)(\p{Ll})/gu, (m, a, c) => a + c.toUpperCase());
    t = `${film} – Kino`;
  } else if (venueType && t && !new RegExp(venueType, 'i').test(t) && ['teater', 'konsert', 'opera'].includes(venueType) && t.split(/\s+/).length <= 4) {
    t = `${t.replace(/(^|\s)(\p{Ll})/gu, (m, a, c) => a + c.toUpperCase())} – ${cap(venueType)}`;
  } else if (!t && venueType) t = cap(venueType);
  return { title: cap(t.slice(0, 120)), location, venueType, film, corrected };
}

/* ---------------- Plakat på hendelsen ---------------- */

const POSTERS = 'glimt46_posters';
export function rememberPoster46(user, eventId, poster) {
  if (!eventId || !poster) return;
  try { const m = kv.get(user, POSTERS, {}) ?? {}; m[String(eventId).split('~')[0]] = { poster, at: Date.now() }; const keys = Object.keys(m); if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete m[k]; kv.set(user, POSTERS, m); } catch { /* */ }
}
let decorated = false;
export async function installPosterDecorator46() {
  if (decorated) return; decorated = true;
  try {
    const { addEventDecorator } = await import('../calendar.js');
    addEventDecorator((user, events) => {
      const m = kv.get(user, POSTERS, null);
      if (!m) return events;
      for (const e of events) { const p = m[String(e.id).split('~')[0]]; if (p && !e.image) e.image = p.poster; }
      return events;
    });
  } catch { /* */ }
}
