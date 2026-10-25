// Prompt 53 (DAL53): emnene fra Gist per nyhetssak – bare databasen (ingen modell), så rss.js og news46.js kan importere uten sykler.
import { db } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS news_topics53 (
  item_id INTEGER PRIMARY KEY, topics TEXT NOT NULL, top TEXT, category TEXT, model TEXT NOT NULL DEFAULT 'gist', at INTEGER NOT NULL
)`);
const q = (sql) => db.prepare(sql);

/** Gist-emne (slug) → standardkategori i Nyheter, eller null. Slugene matches løst, så nye/endrede navn i modellen tåles. */
export function categoryOfTopic53(slug) {
  const s = String(slug ?? '').toLowerCase();
  if (!s) return null;
  if (/sport|football|soccer|athlet|olymp/.test(s)) return 'sport';
  if (/tech|software|science|gaming|video_game|gadget|ai\b|computing|space/.test(s)) return 'teknologi';
  if (/business|financ|econom|money|invest|real_estate|career|market|crypto/.test(s)) return 'okonomi';
  if (/art|music|film|movie|tv|entertain|book|literat|culture|celebr|fashion|design|photo|theat/.test(s)) return 'kultur';
  return null;
}
// Norske ord som peker på et emne («For deg»).
const TOPIC_WORDS53 = [
  [/sport|football|soccer/, ['sport', 'fotball', 'idrett', 'ski', 'håndball', 'sjakk', 'tennis', 'golf', 'sykkel', 'langrenn', 'skiskyting']],
  [/tech|software|computing|gadget/, ['teknologi', 'tech', 'data', 'it', 'ki', 'ai', 'programmering', 'mobil', 'apple', 'android']],
  [/science|space/, ['vitenskap', 'forskning', 'romfart', 'verdensrommet', 'klima']],
  [/gaming|video_game/, ['spill', 'gaming', 'dataspill']],
  [/business|financ|econom|money|invest|market|crypto/, ['økonomi', 'finans', 'aksjer', 'børs', 'penger', 'renter', 'næringsliv', 'krypto', 'bolig']],
  [/real_estate/, ['bolig', 'eiendom', 'boligmarkedet']],
  [/music/, ['musikk', 'konsert', 'artist']], [/film|movie|tv/, ['film', 'kino', 'serier', 'tv']],
  [/food|drink|cook|recipe/, ['mat', 'oppskrift', 'restaurant', 'vin', 'matlaging']], [/travel/, ['reise', 'ferie', 'turisme']],
  [/health|medic|fitness|wellness/, ['helse', 'trening', 'medisin', 'sykdom']], [/politic|government|election/, ['politikk', 'valg', 'regjering', 'storting']],
  [/auto|car|vehicle|transport/, ['bil', 'elbil', 'biler', 'trafikk']], [/parent|family|kid|educat/, ['familie', 'barn', 'skole', 'utdanning']],
  [/pet|animal|nature|environment/, ['dyr', 'natur', 'miljø', 'klima']], [/fashion|beauty/, ['mote', 'skjønnhet']], [/home|garden|diy/, ['hjem', 'hage', 'oppussing', 'interiør']],
];
/** Treffer interesseordet et av emnene (slugs)? */
export function interestMatchesTopics53(word, slugs) {
  const w = String(word ?? '').toLowerCase().trim();
  if (!w || !slugs?.length) return false;
  for (const s of slugs) {
    const sl = String(s).toLowerCase();
    if (sl === w || (w.length >= 4 && (sl.includes(w) || w.includes(sl)))) return true;
    for (const [re, words] of TOPIC_WORDS53) if (re.test(sl) && words.includes(w)) return true;
  }
  return false;
}

const getStmt = () => q('SELECT topics, top, category FROM news_topics53 WHERE item_id=?');
let get = null;
/** Lagrede emner for saken → {topics:[{slug,name,score}], top, category} | null. */
export function topicsOf53(itemId) {
  try { get ??= getStmt(); const r = get.get(itemId); return r ? { topics: JSON.parse(r.topics), top: r.top, category: r.category } : null; } catch { return null; }
}
/** Kategori fra emnet (til rss.js catOf), eller null. */
export const gistCategory53 = (itemId) => topicsOf53(itemId)?.category ?? null;
/** Slugs for saken (til «For deg»). */
export const topicSlugs53 = (itemId) => (topicsOf53(itemId)?.topics ?? []).map((t) => t.slug);

