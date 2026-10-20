// Prompt 42 (SERVER42): Glimt-søkedatabase for Finans – rask SQL/FTS5 før Ollama.
// claude-code-glimt-sokedatabase.md + claude-code-finans-glimt-abonnement.md.
//
//   search_items(id, user_id, kind:'line'|'receipt'|'tx', ref, receipt_id, tx_id, home_id, date, merchant_id, merchant_norm, merchant_display,
//                item_text, item_norm, item_category, amount, qty, unit, account, has_image)
//   search_fts42(item_norm, merchant_norm, item_category, synonyms)   – rowid = search_items.id (unicode61, æøå beholdes, egen stemming)
//   item_synonyms(term, canon, category)                              – tomat → tomater, cherrytomat …; kaffe → espresso …
// Indeksen bygges én gang per bruker (migrering) og deretter på nytt bare for brukeren når dataene er endret (signatur).
//
// parseQuery42(text) → {intent, item, itemStem, terms[], category, merchant, merchantDisplay, period:{from, to, label}|null, min, max, last, words}
// ask42(u, text, {scope, onStep}) → {text, cards, hits, steps:[{label, detail, ms, done}], ms, engine:'lokalt'|'ollama', path:'fast'|'llm', parsed, intent, …}
import { db, me } from './db.js';
import { matchMerchant, normalize as logoNorm } from '../logos/match.js';
import { kv } from '../db.js';

const q = (sql) => db.prepare(sql);

/* ---------------- Tabeller ---------------- */

db.exec(`CREATE TABLE IF NOT EXISTS search_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- line | receipt | tx
  ref TEXT NOT NULL,
  receipt_id TEXT, tx_id INTEGER, home_id INTEGER,
  date TEXT, merchant_id TEXT, merchant_norm TEXT, merchant_display TEXT,
  item_text TEXT, item_norm TEXT, item_category TEXT,
  amount REAL, qty REAL, unit TEXT, account TEXT, has_image INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS search_items_merchant ON search_items(user_id, merchant_id, date);
CREATE INDEX IF NOT EXISTS search_items_cat ON search_items(user_id, item_category, date);
CREATE INDEX IF NOT EXISTS search_items_home ON search_items(home_id, date);
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts42 USING fts5(item_norm, merchant_norm, item_category, synonyms, tokenize = 'unicode61 remove_diacritics 0');
CREATE TABLE IF NOT EXISTS item_synonyms (term TEXT PRIMARY KEY, canon TEXT NOT NULL, category TEXT);`);

/* ---------------- Normalisering og stemming ---------------- */

/** Små bokstaver, uten aksenter (é→e, ü→u), men æ, ø og å beholdes. */
export const fold42 = (s) => String(s ?? '').toLowerCase().replace(/å/g, '\u0001').replace(/æ/g, '\u0002').replace(/ø/g, '\u0003')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'å').replace(/\u0002/g, 'æ').replace(/\u0003/g, 'ø');
const SUFFIX = ['heten', 'ene', 'ane', 'ers', 'ens', 'ets', 'er', 'ar', 'en', 'et', 'a', 'e', 's'];
/** Norsk stemming: tomater/tomaten → tomat, lyspærer/lyspære → lyspær, batterier → batteri. */
export function stem42(w) {
  const x = fold42(w);
  if (x.length <= 3) return x;
  for (const s of SUFFIX) if (x.endsWith(s) && x.length - s.length >= 3) return x.slice(0, -s.length);
  return x;
}
const SIZE = /\b\d+(?:[.,]\d+)?\s?(?:g|gr|kg|l|dl|cl|ml|pk|pakk|stk|st|x|m|cm|mm|w|v|mah)\b|[×x]\s?\d+\b|\b\d{3,}\b|\b\d+\b/giu;
/** «TOMATER CHERRY 250G» → «tomat cherry» (størrelser, vekt og koder fjernes, ordene stemmes). */
export function norm42(s) {
  return fold42(String(s ?? '').replace(SIZE, ' ')).replace(/[^\p{L}\s-]/gu, ' ').split(/[\s-]+/).filter((w) => w.length >= 2).map(stem42).join(' ').trim();
}
const words42 = (s) => fold42(s).replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);

/* ---------------- Synonymer og varekategorier ---------------- */

// [kanonisk, kategori, synonymer …]
const SYN = [
  ['tomat', 'grønnsaker', 'tomater', 'cherrytomat', 'cherrytomater', 'plommetomat', 'plommetomater', 'cocktailtomat'],
  ['agurk', 'grønnsaker', 'slangeagurk'], ['paprika', 'grønnsaker'], ['løk', 'grønnsaker', 'rødløk', 'gul løk', 'vårløk'], ['gulrot', 'grønnsaker', 'gulrøtter'],
  ['potet', 'grønnsaker', 'poteter', 'mandelpotet'], ['salat', 'grønnsaker', 'isberg', 'ruccola', 'hjertesalat'], ['brokkoli', 'grønnsaker'], ['avokado', 'grønnsaker'],
  ['eple', 'frukt', 'epler'], ['banan', 'frukt', 'bananer'], ['appelsin', 'frukt', 'appelsiner', 'klementin', 'klementiner'], ['drue', 'frukt', 'druer'], ['sitron', 'frukt'],
  ['kylling', 'kjøtt', 'kyllingfilet', 'kyllinglår'], ['kjøttdeig', 'kjøtt', 'karbonadedeig'], ['pølse', 'kjøtt', 'pølser', 'grillpølse'], ['bacon', 'kjøtt'], ['biff', 'kjøtt', 'entrecote', 'indrefilet'],
  ['laks', 'fisk', 'laksefilet'], ['torsk', 'fisk', 'torskefilet'], ['reker', 'fisk'],
  ['melk', 'meieri', 'lettmelk', 'helmelk', 'skummet', 'mellommelk', 'havremelk'], ['ost', 'meieri', 'norvegia', 'jarlsberg', 'gulost', 'brunost'], ['yoghurt', 'meieri'], ['smør', 'meieri', 'bremykt'],
  ['rømme', 'meieri'], ['egg', 'meieri'],
  ['kaffe', 'kaffe', 'espresso', 'filterkaffe', 'kapsler', 'kaffekapsler', 'kaffebønner', 'cappuccino', 'latte'],
  ['brød', 'bakeri', 'rundstykke', 'rundstykker', 'loff', 'baguett', 'grovbrød'],
  ['brus', 'drikke', 'cola', 'pepsi', 'solo', 'fanta'], ['juice', 'drikke', 'appelsinjuice', 'eplejuice'], ['vann', 'drikke', 'farris', 'imsdal'], ['øl', 'drikke', 'pils'],
  ['batteri', 'batteri', 'batterier', 'aa-batteri', 'aaa-batteri', 'knappecelle'],
  ['lyspære', 'lys og elektrisk', 'lyspærer', 'led-pære', 'ledpære', 'pære'], ['skjøteledning', 'lys og elektrisk', 'forlengelseskabel'], ['kabel', 'lys og elektrisk', 'usb-kabel', 'ladekabel'],
  ['lader', 'lys og elektrisk', 'ladere'],
  ['lading', 'lading', 'hurtiglading', 'ladestasjon', 'elbillading'],
  ['maling', 'maling', 'beis', 'grunning', 'pensel', 'pensler', 'malerrull'],
  ['oppvask', 'rengjøring', 'oppvaskmiddel', 'zalo', 'oppvasktabletter'], ['vaskemiddel', 'rengjøring', 'tøyvask', 'omo', 'milo'], ['toalettpapir', 'rengjøring', 'dopapir', 'tørkerull'],
  ['blomst', 'blomster', 'blomster', 'bukett', 'tulipan', 'tulipaner', 'roser', 'stauder'],
  ['jord', 'hage', 'plantejord', 'gjødsel', 'kompost'],
  ['klor', 'basseng', 'ph-minus', 'ph-pluss', 'bassengduk', 'bassengpumpe', 'pool'],
  ['ved', 'ved og brensel', 'pellets', 'tennbriketter'],
];
// Kategorier som teller som «mat».
const FOOD = new Set(['grønnsaker', 'frukt', 'kjøtt', 'fisk', 'meieri', 'kaffe', 'bakeri', 'drikke', 'mat']);
// Ord i spørsmålet som betyr en hel kategori.
const CAT_WORDS = { mat: 'mat', dagligvarer: 'mat', matvarer: 'mat', grønnsaker: 'grønnsaker', frukt: 'frukt', kjøtt: 'kjøtt', fisk: 'fisk', meieri: 'meieri', drikke: 'drikke',
  kaffe: 'kaffe', lading: 'lading', strøm: 'strøm', maling: 'maling', rengjøring: 'rengjøring', blomster: 'blomster', hage: 'hage' };
const SYN_MAP = new Map(); // stem → {canon, category}
for (const [canon, cat, ...rest] of SYN) for (const t of [canon, ...rest]) SYN_MAP.set(stem42(t), { canon, category: cat });
{
  const ins = q('INSERT OR IGNORE INTO item_synonyms(term, canon, category) VALUES(?,?,?)');
  db.transaction(() => { for (const [canon, cat, ...rest] of SYN) for (const t of [canon, ...rest]) ins.run(fold42(t), canon, cat); })();
}
/** Varekategori for en varelinje (regler, ingen AI ved spørring). */
export function itemCategory42(text) {
  for (const w of norm42(text).split(' ')) { const s = SYN_MAP.get(w); if (s) return s.category; }
  const n = fold42(text);
  for (const [canon, cat, ...rest] of SYN) if ([canon, ...rest].some((t) => t.length >= 4 && n.includes(fold42(t)))) return cat;
  return null;
}
/** Alle synonymstammer for en kanonisk vare (tomat → tomat, cherrytomat, plommetomat …). */
export function synonymsOf42(word) {
  const s = SYN_MAP.get(stem42(word));
  if (!s) return [stem42(word)];
  return [...new Set(SYN.find((x) => x[0] === s.canon).filter((_, i) => i !== 1).map(stem42))];
}
const TX_CAT = [[/mat og dagligvarer|dagligvare/i, 'mat'], [/restaurant|kafé|kafe/i, 'restaurant'], [/transport|lading/i, 'lading'], [/abonnement/i, 'abonnement'], [/bolig|strøm/i, 'bolig'], [/hjem/i, 'hjem']];
const txCategory = (name) => TX_CAT.find(([re]) => re.test(name ?? ''))?.[1] ?? null;

/* ---------------- Butikk-alias ---------------- */

/** «ICA KVANTUM 1234» → {id:'ica', display:'ICA Kvantum'}; «REMA 1000 Bislett» → {id:'rema-1000'}. */
export function merchantKey42(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return { id: null, display: null };
  let m = null;
  try { m = matchMerchant(raw); } catch { /* registeret mangler */ }
  if (m?.id) return { id: m.id, display: m.navn ?? raw };
  const w = logoNorm(raw).split(' ').filter((x) => x && !/^\d+$/.test(x));
  const first = raw.split(/\s+/)[0] ?? '';
  return { id: w[0] ?? null, display: /^\p{Lu}{2,}$/u.test(first) ? first : first ? first[0].toUpperCase() + first.slice(1) : raw };
}

/* ---------------- Indeks ---------------- */

const built = new Map(); // bruker → signatur
const sigOf = (u) => q(`SELECT (SELECT count(*)||':'||ifnull(max(id),0)||':'||ifnull(sum(amount),0)||':'||ifnull(sum(length(ai_short)),0)||':'||ifnull(sum(category_id),0) FROM fh_transactions WHERE user_id=?)||'|'||
  (SELECT count(*)||':'||ifnull(max(created),0)||':'||ifnull(sum(length(extraction)),0)||':'||ifnull(sum(total),0) FROM fh_receipts WHERE user_id=?)||'|'||
  (SELECT count(*)||':'||ifnull(max(id),0) FROM fh_folder_entries e WHERE e.tx_id IN (SELECT id FROM fh_transactions WHERE user_id=?))`).pluck().get(u, u, u);
const linesOf = (r) => { try { return (JSON.parse(r.extraction ?? 'null')?.lines ?? []).filter((l) => l?.description); } catch { return []; } };
/** Bygger brukerens rader i search_items/search_fts42 på nytt (rask; kalles når signaturen er endret). → antall rader */
export function buildIndex42(u) {
  const sig = sigOf(u);
  const rows = [];
  const homes = new Map(q('SELECT e.tx_id, e.folder_id FROM fh_folder_entries e JOIN fh_transactions t ON t.id=e.tx_id WHERE t.user_id=?').all(u).map((r) => [r.tx_id, r.folder_id]));
  for (const t of q(`SELECT t.*, c.name AS cat, c.kind AS ckind, a.name AS acc FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id LEFT JOIN fh_accounts a ON a.id=t.account_id WHERE t.user_id=?`).all(u)) {
    if (t.ckind === 'transfer') continue;
    const mk = merchantKey42(t.merchant || t.description);
    const text = [t.description, t.note, t.ai_short].filter(Boolean).join(' · ');
    rows.push({ kind: 'tx', ref: String(t.id), receipt_id: null, tx_id: t.id, home_id: homes.get(t.id) ?? null, date: t.date, merchant_id: mk.id, merchant_norm: norm42(t.merchant || t.description),
      merchant_display: mk.display || t.merchant || t.description, item_text: text, item_norm: norm42(text), item_category: txCategory(t.cat) ?? itemCategory42(text), amount: t.amount / 100, qty: null, unit: null, account: t.acc ?? null, has_image: 0, cat: t.cat });
  }
  for (const r of q("SELECT * FROM fh_receipts WHERE user_id=? AND status NOT IN ('rejected')").all(u)) {
    const mk = merchantKey42(r.merchant);
    const lines = linesOf(r);
    rows.push({ kind: 'receipt', ref: r.id, receipt_id: r.id, tx_id: r.transaction_id, home_id: homes.get(r.transaction_id) ?? null, date: r.date, merchant_id: mk.id, merchant_norm: norm42(r.merchant), merchant_display: mk.display || r.merchant,
      item_text: lines.map((l) => l.description).join(', '), item_norm: norm42(lines.map((l) => l.description).join(' ')), item_category: null, amount: r.total != null ? -r.total / 100 : null, qty: null, unit: null, account: null, has_image: r.file ? 1 : 0 });
    lines.forEach((l, i) => {
      const qty = Number(String(l.description).match(/[×x]\s?(\d+)\b/i)?.[1] ?? l.qty ?? l.quantity) || null;
      const unit = String(l.description).match(/\b\d+(?:[.,]\d+)?\s?(g|kg|l|dl|cl|ml|pk|stk)\b/i)?.[1]?.toLowerCase() ?? null;
      rows.push({ kind: 'line', ref: `${r.id}:${i}`, receipt_id: r.id, tx_id: r.transaction_id, home_id: homes.get(r.transaction_id) ?? null, date: r.date, merchant_id: mk.id, merchant_norm: norm42(r.merchant),
        merchant_display: mk.display || r.merchant, item_text: l.description, item_norm: norm42(l.description), item_category: itemCategory42(l.description), amount: l.amount != null ? -Math.abs(+l.amount) : null, qty, unit, account: null, has_image: r.file ? 1 : 0 });
    });
  }
  const ids = q('SELECT id FROM search_items WHERE user_id=?').pluck().all(u);
  const ins = q(`INSERT INTO search_items(user_id, kind, ref, receipt_id, tx_id, home_id, date, merchant_id, merchant_norm, merchant_display, item_text, item_norm, item_category, amount, qty, unit, account, has_image)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`);
  const fts = q('INSERT INTO search_fts42(rowid, item_norm, merchant_norm, item_category, synonyms) VALUES(?,?,?,?,?)');
  const delFts = q('DELETE FROM search_fts42 WHERE rowid=?');
  db.transaction(() => {
    for (const id of ids) delFts.run(id);
    q('DELETE FROM search_items WHERE user_id=?').run(u);
    for (const r of rows) {
      const id = ins.get(u, r.kind, r.ref, r.receipt_id, r.tx_id, r.home_id, r.date, r.merchant_id, r.merchant_norm, r.merchant_display, r.item_text, r.item_norm, r.item_category, r.amount, r.qty, r.unit, r.account, r.has_image).id;
      const syn = [...new Set(r.item_norm.split(' ').map((w) => SYN_MAP.get(w)?.canon).filter(Boolean).map(stem42))].join(' ');
      fts.run(id, r.item_norm, r.merchant_norm ?? '', r.item_category ?? '', syn);
    }
  })();
  built.set(u, sig);
  return rows.length;
}
/** Bygger indeksen når brukerens data er endret. → true når den ble bygd nå. */
export function ensureIndex42(u) {
  if (built.get(u) === sigOf(u)) return false;
  buildIndex42(u);
  return true;
}
// Migrering: indeksen for alle brukere med data bygges én gang i bakgrunnen ved oppstart (ikke i tester).
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => {
    try { for (const u of q('SELECT DISTINCT user_id FROM fh_transactions WHERE user_id IS NOT NULL').pluck().all()) ensureIndex42(u); }
    catch (e) { console.warn('[søk42] indeks:', e.message); }
  }, 5_000).unref?.();
}
export const _resetIndex42 = () => built.clear();

/* ---------------- Tolking av spørsmålet ---------------- */

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
/** Mandag i ISO-uke w i år y. */
export function isoWeekStart42(y, w) {
  const jan4 = new Date(y, 0, 4, 12);
  const mon = new Date(jan4); mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
  return iso(mon);
}
/** Uke a til uke b (over nyttår når b < a) → {from, to} (to er dagen etter siste søndag). */
export function weekRange42(a, b = a, year = new Date().getFullYear()) {
  const from = isoWeekStart42(year, a);
  const to = addD(isoWeekStart42(b < a ? year + 1 : year, b), 7);
  return { from, to, label: a === b ? `uke ${a}` : `uke ${a}–${b}` };
}
const monthRange = (y, m0, m1 = m0) => ({ from: `${y}-${String(m0 + 1).padStart(2, '0')}-01`, to: iso(new Date(m1 < m0 ? y + 1 : y, m1 + 1, 1, 12)) });
const PERIOD_WORDS = new Set(['i', 'dag', 'går', 'denne', 'uka', 'uken', 'forrige', 'måned', 'måneden', 'år', 'året', 'fjor', 'siste', 'sist', 'mnd', 'måneder', 'dager', 'uker', 'uke', 'hittil',
  'sommer', 'høst', 'vinter', 'vår', 'til', 'fra', 'og', ...MONTHS]);
/** Periode i teksten → {from, to, label} | null. to er eksklusiv. */
export function parsePeriod42(text, now = new Date()) {
  const t = fold42(text), today = iso(now), Y = now.getFullYear(), M = now.getMonth();
  const yr = t.match(/\b(20\d{2})\b/)?.[1];
  const year = yr ? +yr : Y;
  let m;
  if ((m = t.match(/\buke\s*(\d{1,2})\s*(?:-|–|til|og)\s*(?:uke\s*)?(\d{1,2})\b/))) return weekRange42(+m[1], +m[2], year);
  if ((m = t.match(/\buke\s*(\d{1,2})\b/))) return weekRange42(+m[1], +m[1], year);
  const mi = (w) => MONTHS.indexOf(w) >= 0 ? MONTHS.indexOf(w) : MON_SHORT.indexOf(w);
  if ((m = t.match(/\bfra\s+(\p{L}+)\s+(?:til|og)\s+(\p{L}+)/u)) && mi(m[1]) >= 0 && mi(m[2]) >= 0) {
    const a = mi(m[1]), b = mi(m[2]);
    return { ...monthRange(year, a, b), label: `${MONTHS[a]}–${MONTHS[b]}` };
  }
  if ((m = t.match(/\b(\p{L}+)\s*(?:-|–)\s*(\p{L}+)\b/u)) && mi(m[1]) >= 0 && mi(m[2]) >= 0) { const a = mi(m[1]), b = mi(m[2]); return { ...monthRange(year, a, b), label: `${MONTHS[a]}–${MONTHS[b]}` }; }
  if (/\bi dag\b/.test(t)) return { from: today, to: addD(today, 1), label: 'i dag' };
  if (/\bi går(?![\p{L}])/u.test(t)) return { from: addD(today, -1), to: today, label: 'i går' };
  if (/\b(denne uka|denne uken|i uka)\b/.test(t)) { const mon = addD(today, -((now.getDay() + 6) % 7)); return { from: mon, to: addD(mon, 7), label: 'denne uka' }; }
  if (/\bforrige uke\b/.test(t)) { const mon = addD(today, -((now.getDay() + 6) % 7) - 7); return { from: mon, to: addD(mon, 7), label: 'forrige uke' }; }
  if ((m = t.match(/\bsiste\s+(\d{1,2})\s*(mnd|måneder|måned)\b/))) { const d = new Date(Y, M - +m[1] + 1, 1, 12); return { from: iso(d), to: addD(today, 1), label: `siste ${m[1]} mnd` }; }
  if ((m = t.match(/\bsiste\s+(\d{1,3})\s*dager\b/))) return { from: addD(today, -+m[1]), to: addD(today, 1), label: `siste ${m[1]} dager` };
  if (/\bforrige måned\b/.test(t)) { const d = new Date(Y, M - 1, 1, 12); return { ...monthRange(d.getFullYear(), d.getMonth()), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }; }
  if (/\b(denne måneden|i måned|hittil i måned)\b/.test(t)) return { ...monthRange(Y, M), label: `${MONTHS[M]} ${Y}` };
  if (/\bi sommer\b/.test(t)) { const y = M < 5 ? Y - 1 : Y; return { ...monthRange(y, 5, 7), label: `sommeren ${y}` }; }
  if (/\bi høst\b/.test(t)) { const y = M < 8 ? Y - 1 : Y; return { ...monthRange(y, 8, 10), label: `høsten ${y}` }; }
  if (/\bi vinter\b/.test(t)) { const y = M < 2 ? Y - 1 : Y; return { from: `${y - (M < 2 ? 0 : 0)}-12-01`, to: `${y + 1}-03-01`, label: 'i vinter' }; }
  const mm = MONTHS.findIndex((x) => new RegExp(`\\b${x}\\b`).test(t));
  if (mm >= 0) { const y = yr ? year : mm > M ? Y - 1 : Y; return { ...monthRange(y, mm), label: `${MONTHS[mm]} ${y}` }; }
  if (/\bi fjor\b/.test(t)) return { from: `${Y - 1}-01-01`, to: `${Y}-01-01`, label: String(Y - 1) };
  if (/\b(i år|hittil i år)(?![\p{L}])/u.test(t) || yr) return { from: `${year}-01-01`, to: `${year + 1}-01-01`, label: String(year) };
  return null;
}
const SUBS_RE = /\b(abonnement\w*|abonement\w*|abo|subscription\w*|faste trekk|faste utgifter|månedlige|trekk hver måned|strømmetjenest\w*|prøveperiode\w*|hva betaler jeg hver måned|betaler jeg hver måned)\b/;
const amountOf = (s) => Number(String(s).replace(/[\s ]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
/** Beløp i teksten: «mellom 500 og 5000 kr», «over 5 000», «under 100». → {min, max} */
export function parseAmount42(text) {
  const t = fold42(text);
  const N = '(\\d(?:[\\d.,]|[\\s\\u00a0](?=\\d{3}(?!\\d)))*)';
  let m = t.match(new RegExp(`\\bmellom\\s+${N}\\s*(?:kr|kroner)?\\s+og\\s+${N}`));
  if (m) return { min: amountOf(m[1]), max: amountOf(m[2]) };
  const out = {};
  if ((m = t.match(new RegExp(`\\b(?:over|mer enn|minst)\\s+${N}`)))) out.min = amountOf(m[1]);
  if ((m = t.match(new RegExp(`\\b(?:under|mindre enn|maks)\\s+${N}`)))) out.max = amountOf(m[1]);
  return out;
}
const STOP = new Set(('hvor mye mange brukte brukt bruker jeg meg min mitt mine på i til av for fra med og eller hva hvilke hvilken hvilket når har hadde var er det den de en et som om totalt sum summen ' +
  'kostet koster betalte betalt vis finn alle kr kroner nok kjøp kjøpte kjøpt handlet handel utgifter utgift penger kvittering kvitteringer kvitteringen kvitteringene sist siste gang gangen ' +
  'hos butikk butikken ganger ofte noen per hver måned år mellom over under mer enn minst mindre største dyreste se gi meg liste list ut inn ved etter').split(' '));
const INTENTS = [
  ['subscriptions', SUBS_RE],
  ['how_often', /\b(hvor ofte|hvor mange ganger|antall ganger)(?![\p{L}])/u],
  ['per_month', /\b(per måned|hver måned|i måneden|månedlig|per mnd)\b/],
  ['how_much', /\b(hvor mye|hva brukte|hva har jeg brukt|brukt på|bruker jeg|sum|totalt|til sammen)(?![\p{L}])/u],
  ['last_bought', /(?<![\p{L}])(sist jeg|siste gang|når kjøpte|sist kjøpt|sist handlet)(?![\p{L}])/u],
  ['find_receipt', /\b(kvittering\w*|varelinje\w*)\b/],
  ['largest', /(?<![\p{L}])(største|dyreste|høyeste)(?![\p{L}])/u],
];
const OPEN_RE = /(?<![\p{L}])(bør jeg|burde jeg|kutte ned|spare penger|kan jeg spare|anbefal\w*|tips|råd om|hvorfor|hvordan kan)(?![\p{L}])/u;
let merchantsCache = { u: null, sig: null, list: [] };
/** Butikkene brukeren har handlet hos (fra indeksen), med alias fra logobiblioteket. */
function knownMerchants(u) {
  const sig = built.get(u) ?? null;
  if (merchantsCache.u === u && merchantsCache.sig === sig) return merchantsCache.list;
  const rows = q('SELECT merchant_id AS id, merchant_display AS display, count(*) n FROM search_items WHERE user_id=? AND merchant_id IS NOT NULL GROUP BY merchant_id ORDER BY n DESC').all(u);
  const list = rows.map((r) => {
    const aliases = new Set([r.id.replace(/-/g, ' '), logoNorm(r.display).split(' ').filter((w) => !/^\d+$/.test(w)).slice(0, 2).join(' '), logoNorm(r.display).split(' ')[0]]);
    return { ...r, aliases: [...aliases].filter((a) => a && a.length >= 2) };
  });
  merchantsCache = { u, sig, list };
  return list;
}
/** Tolker spørsmålet lokalt (regex + ordlister, < 20 ms). */
export function parseQuery42(text, { u = me(), now = new Date() } = {}) {
  const raw = String(text ?? '').trim(), t = fold42(raw);
  const out = { intent: null, item: null, itemStem: null, terms: [], category: null, merchant: null, merchantDisplay: null, period: parsePeriod42(raw, now), min: null, max: null, last: false, words: [] };
  for (const [name, re] of INTENTS) if (re.test(t)) { out.intent = name; break; }
  if (/\bsist\b/.test(t) && (!out.intent || out.intent === 'find_receipt')) { out.last = true; if (!out.intent) out.intent = 'last_bought'; }
  const a = parseAmount42(raw); if (a.min != null) out.min = a.min; if (a.max != null) out.max = a.max;
  if (out.intent === 'subscriptions') return out;
  // Butikk: «på ica», «fra biltema», «hos clas ohlson» eller bare navnet.
  const ln = ` ${logoNorm(raw)} `;
  let best = null;
  for (const m of knownMerchants(u)) for (const al of m.aliases) if (ln.includes(` ${al} `) && (!best || al.length > best.al.length)) best = { m, al };
  if (!best) {
    const pm = raw.match(/\b(?:på|fra|hos)\s+([\p{L}][\p{L}\d&.\- ]{1,30}?)(?=\s+(?:i|på|fra|til|for|siste|denne|forrige|over|under|mellom)\b|[?.!,]|$)/iu);
    if (pm) { const mk = merchantKey42(pm[1]); if (mk.id) { out.merchant = mk.id; out.merchantDisplay = mk.display; out.merchantWords = logoNorm(pm[1]).split(' '); } }
  } else { out.merchant = best.m.id; out.merchantDisplay = best.m.display; out.merchantWords = best.al.split(' '); }
  // Åpne spørsmål («hva bør jeg kutte ned på?») går til Glimt (LLM).
  if (OPEN_RE.test(t) && !out.merchant) { out.intent = 'open'; return out; }
  // Butikk uten «på»: et kjent navn i logobiblioteket eller et ord i STORE BOKSTAVER («ICA mellom 500 og 5000 kr»).
  if (!out.merchant) {
    for (const w of raw.split(/[\s,]+/)) {
      const clean = w.replace(/[^\p{L}\p{N}&-]/gu, '');
      if (clean.length < 2 || STOP.has(fold42(clean)) || PERIOD_WORDS.has(fold42(clean)) || SYN_MAP.has(stem42(clean)) || CAT_WORDS[fold42(clean)]) continue;
      let m = null; try { m = matchMerchant(clean); } catch { /* */ }
      if (m?.id && logoNorm(m.navn ?? '').split(' ')[0] === logoNorm(clean)) { out.merchant = m.id; out.merchantDisplay = m.navn; out.merchantWords = [logoNorm(clean)]; break; }
      if (/^\p{Lu}{2,}$/u.test(clean) && !/^(KR|NOK|EUR|USD)$/.test(clean)) { const mk = merchantKey42(clean); out.merchant = mk.id; out.merchantDisplay = clean; out.merchantWords = [logoNorm(clean)]; break; }
    }
  }
  // Vare/kategori: ordene som er igjen.
  const skip = new Set([...(out.merchantWords ?? []), ...(out.merchantWords ?? []).map(fold42)]);
  const rest = words42(raw).filter((w) => !STOP.has(w) && !PERIOD_WORDS.has(w) && !skip.has(w) && !skip.has(logoNorm(w)) && !/^\d/.test(w) && w.length >= 2);
  for (const w of rest) {
    if (CAT_WORDS[w] && !out.category && !SYN_MAP.has(stem42(w))) { out.category = CAT_WORDS[w]; continue; }
    if (CAT_WORDS[w] && !out.category && !out.item && ['mat', 'lading', 'strøm'].includes(w)) { out.category = CAT_WORDS[w]; continue; }
    if (!out.item) { out.item = w; out.itemStem = stem42(w); out.terms = synonymsOf42(w); }
    else out.words.push(w);
  }
  if (!out.intent && (out.item || out.merchant || out.category)) out.intent = 'list';
  return out;
}
/** true når hurtigveien kan svare (vare, butikk, kategori eller intensjon). */
export const understood42 = (p) => !!(p.intent && (p.intent === 'subscriptions' || p.item || p.merchant || p.category || p.period || p.min != null || p.max != null || p.intent === 'largest'));

/* ---------------- Svar uten LLM ---------------- */

const krN = (v) => { const r = Math.round(Math.abs(v) * 100) / 100; return (Number.isInteger(r) ? r.toLocaleString('nb-NO') : r.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).replace(/\s/g, ' '); };
const kr = (v) => `${krN(v)} kr`;
const dLabel = (s) => (s ? `${+s.slice(8, 10)}. ${MON_SHORT[+s.slice(5, 7) - 1]}` : '');
const secs = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
const NUMW = ['ingen', 'én', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti'];
const nw = (n) => (n <= 10 ? NUMW[n] : String(n));
const ftsOf = (terms) => terms.filter(Boolean).map((w) => `"${w.replace(/"/g, '')}"*`).join(' OR ');

/** SQL mot search_items med filtrene. → rader (nyeste først, relevans). */
export function sqlHits42(u, p, { limit = 300, home = null } = {}) {
  const w = ['s.user_id=?'], a = [u];
  let from = 'search_items s';
  const terms = p.terms?.length ? p.terms : p.itemStem ? [p.itemStem] : [];
  if (terms.length) { from = 'search_fts42 f JOIN search_items s ON s.id=f.rowid'; w.push('search_fts42 MATCH ?'); a.push(`{item_norm synonyms} : (${ftsOf(terms)})`); }
  if (p.merchant) { w.push('s.merchant_id=?'); a.push(p.merchant); }
  if (p.category) {
    if (p.category === 'mat') { w.push(`s.item_category IN (${[...FOOD].map(() => '?').join(',')})`); a.push(...FOOD); }
    else { w.push('s.item_category=?'); a.push(p.category); }
  }
  if (p.period) { w.push('s.date>=? AND s.date<?'); a.push(p.period.from, p.period.to); }
  if (p.min != null) { w.push('abs(s.amount)>=?'); a.push(p.min); }
  if (p.max != null) { w.push('abs(s.amount)<=?'); a.push(p.max); }
  if (home) { w.push('s.home_id=?'); a.push(home); }
  // Varer/kategorier: varelinjer og transaksjoner (ikke kvitteringshodet). Bare butikk: transaksjoner og kvitteringer.
  if (terms.length || (p.category && p.category !== 'mat' && p.category !== 'lading')) w.push("s.kind IN ('line','tx')");
  else if (p.category) w.push("s.kind IN ('line','tx')");
  else w.push("s.kind IN ('tx','receipt')");
  const order = terms.length ? 'ORDER BY s.date DESC, bm25(search_fts42)' : 'ORDER BY s.date DESC, s.id DESC';
  return q(`SELECT s.* FROM ${from} WHERE ${w.join(' AND ')} ${order} LIMIT ${limit}`).all(...a);
}
const ORIGINAL = (rid) => `/finans/api/receipts/${encodeURIComponent(rid)}/file`;
function receiptCards(u, rows) {
  const by = new Map();
  for (const r of rows) {
    const key = r.receipt_id ?? `tx:${r.tx_id}`;
    const cur = by.get(key) ?? { rows: [], r };
    cur.rows.push(r); by.set(key, cur);
  }
  return [...by.values()].map(({ rows: rs, r }) => {
    const head = r.receipt_id ? q('SELECT id, merchant, date, total, file, transaction_id FROM fh_receipts WHERE id=? AND user_id=?').get(r.receipt_id, u) : null;
    const lines = rs.filter((x) => x.kind === 'line');
    const total = head?.total != null ? head.total / 100 : r.kind === 'tx' ? Math.abs(r.amount) : null;
    return { kind: r.receipt_id ? 'receipt' : 'tx', receiptId: r.receipt_id ?? null, txId: r.tx_id ?? head?.transaction_id ?? null, merchant: head?.merchant ?? r.merchant_display, name: head?.merchant ?? r.merchant_display,
      date: r.date, dateLabel: dLabel(r.date), total, amount: total != null ? -total : r.amount,
      line: lines[0] ? `${lines[0].item_text}${lines[0].amount != null ? ` · ${krN(lines[0].amount)}` : ''}` : null,
      lines: lines.map((l) => ({ text: l.item_text, amount: l.amount != null ? Math.abs(l.amount) : null })), category: r.item_category ?? null,
      original: head?.file ? { label: 'Vis original', url: ORIGINAL(head.id) } : null, hasImage: !!head?.file };
  });
}
function monthBars(rows) {
  const m = new Map();
  for (const r of rows) { const k = (r.date ?? '').slice(0, 7); if (!k) continue; m.set(k, (m.get(k) ?? 0) + Math.abs(r.amount ?? 0)); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, sum]) => ({ month, label: MON_SHORT[+month.slice(5) - 1], sum: Math.round(sum * 100) / 100 }));
}
const what = (p) => p.item ?? (p.category === 'mat' ? 'mat' : p.category) ?? null;
const at = (p) => (p.merchantDisplay ? ` på ${p.merchantDisplay}` : '');
const per = (p) => (p.period ? ` ${/^(i |uke|siste|denne|forrige|sommeren|høsten)/.test(p.period.label) ? p.period.label : /^\d{4}$/.test(p.period.label) ? `i ${p.period.label}` : `i ${p.period.label}`}` : '');
/** Bygger svaret fra SQL-treffene (tekst fra mal). */
export function fastAnswer42(u, p, rows) {
  const lines = rows.filter((r) => r.kind === 'line'), txs = rows.filter((r) => r.kind === 'tx'), rcs = rows.filter((r) => r.kind === 'receipt');
  const W = what(p);
  const base = { intent: p.intent };
  if (!rows.length) {
    return { ...base, text: `Fant ingen kjøp${W ? ` av ${W}` : ''}${at(p)}${per(p)}.${p.item ? ' Varelinjer finnes bare for kvitteringer Glimt har lest.' : ''}`, cards: [], hits: 0 };
  }
  // Varer: tell per kvittering (linjene), ellers transaksjoner.
  const useLines = !!(p.item || (p.category && lines.length));
  const set = useLines ? (lines.length ? lines : txs) : txs.length ? txs : rcs;
  const count = useLines ? new Set(set.map((r) => r.receipt_id ?? `tx:${r.tx_id}`)).size : set.length;
  const sum = Math.round(set.reduce((s, r) => s + Math.abs(r.amount ?? 0), 0) * 100) / 100;
  const last = set[0];
  const cards = receiptCards(u, (p.last ? set.slice(0, 1) : set).slice(0, 60));
  if (p.intent === 'how_much' || p.intent === 'per_month') {
    const bars = monthBars(set);
    const text = `Du har brukt ${kr(sum)}${W ? ` på ${W}` : ''}${at(p)}${per(p)}, fordelt på ${nw(count)} ${count === 1 ? 'kjøp' : 'kjøp'}.`;
    return { ...base, text, sum, count, cards: [{ kind: 'stat', key: 'sum', label: 'BRUKT', value: kr(sum), raw: sum }, { kind: 'stat', key: 'count', label: 'KJØP', value: String(count), raw: count },
      { kind: 'bars', key: 'months', bars }, ...cards], hits: set.length };
  }
  if (p.intent === 'how_often') {
    return { ...base, text: `Du kjøpte ${W ?? 'noe'}${at(p)} ${nw(count)} ${count === 1 ? 'gang' : 'ganger'}${per(p)}, sist ${dLabel(last.date)}${last.amount != null ? ` (${kr(last.amount)})` : ''}.`, count, sum,
      cards: [{ kind: 'stat', key: 'count', label: 'GANGER', value: String(count), raw: count }, { kind: 'bars', key: 'months', bars: monthBars(set) }, ...cards], hits: set.length };
  }
  if (p.intent === 'largest') {
    const big = set.slice().sort((x, y) => Math.abs(y.amount ?? 0) - Math.abs(x.amount ?? 0))[0];
    return { ...base, text: `Største kjøp${W ? ` av ${W}` : ''}${at(p)}${per(p)} var ${big.merchant_display ?? big.item_text} ${dLabel(big.date)} på ${kr(big.amount)}.`, cards: receiptCards(u, [big, ...set.filter((x) => x !== big).slice(0, 9)]), hits: set.length };
  }
  const where = last.merchant_display ? ` på ${last.merchant_display}` : '';
  let text;
  if ((p.intent === 'last_bought' || p.last) && !W && p.merchantDisplay) text = `Sist du var på ${last.merchant_display ?? p.merchantDisplay} var ${dLabel(last.date)}${last.amount != null ? ` (${kr(last.amount)})` : ''}.`;
  else if (p.intent === 'last_bought' || p.last) text = `Sist du kjøpte ${W ?? 'noe'}${p.merchantDisplay ? at(p) : where} var ${dLabel(last.date)}${last.amount != null ? ` (${kr(last.amount)})` : ''}.${last.receipt_id ? ' Her er kvitteringen.' : ''}`;
  else if (W) text = `Du kjøpte ${W}${at(p)} ${nw(count)} ${count === 1 ? 'gang' : 'ganger'}${per(p)}, sist ${dLabel(last.date)}${last.amount != null ? ` (${kr(last.amount)})` : ''}.${cards.some((c) => c.receiptId) ? ` Her er ${cards.filter((c) => c.receiptId).length === 1 ? 'kvitteringen' : 'kvitteringene'}.` : ''}`;
  else text = `Fant ${nw(count)} ${count === 1 ? 'kjøp' : 'kjøp'}${at(p)}${per(p)}, til sammen ${kr(sum)}. Sist ${dLabel(last.date)}.`;
  return { ...base, text, count, sum, cards, hits: set.length };
}

/* ---------------- LLM (bare når hurtigveien ikke forstår) ---------------- */

/** Bare for tester: (prompt, {rows}) → tekst | Promise. null = Glimt-kjeden (Ollama/Gemini via ai-run). */
export const _llm42 = { impl: null, ms: 6000 };
async function llmText(u, prompt, rows) {
  if (_llm42.impl) return { text: await _llm42.impl(prompt, { rows }), model: 'test' };
  const { run } = await import('../ai-run.js');
  const r = await run('glimt', { user: u, prompt, numPredict: 200, temperature: 0.2, timeoutMs: _llm42.ms, title: 'Glimt · Finans-søk', background: true, localOnly: true });
  return { text: String(r.text ?? '').trim(), model: r.model ?? null, provider: r.provider ?? 'ollama' };
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => { setTimeout(() => rej(Object.assign(new Error("Tidsavbrudd"), { timeout: true })), ms); })]);
function llmPrompt(text, rows, sum) {
  return `Du er Glimt i FinansHub. Svar kort på norsk (1–3 setninger) ut fra radene under. Ikke finn på tall.\nSpørsmål: «${text}»\n`
    + `Sammendrag: ${rows.length} rader, til sammen ${krN(sum)} kr.\n` + rows.slice(0, 40).map((r) => `${r.date} · ${r.merchant_display ?? ''} · ${r.item_text ?? ''} · ${krN(r.amount ?? 0)}`).join('\n');
}

/* ---------------- Logg og cache ---------------- */

const LOG_KEY = 'search42_log';
export function logSearch42(u, row) {
  try { const l = kv.get(u, LOG_KEY, []) ?? []; l.unshift({ at: new Date().toISOString(), ...row }); kv.set(u, LOG_KEY, l.slice(0, 50)); } catch { /* loggen er best effort */ }
}
export const searchLog42 = (u) => kv.get(u, LOG_KEY, []) ?? [];
const cache = new Map();
const CACHE_MS = 10 * 60_000;

/* ---------------- Hovedfunksjonen ---------------- */

/**
 * Glimt-søk i Finans. Hurtigvei (parse → SQL) først; LLM bare når spørsmålet ikke lar seg tolke, med maks 40 rader og 6 s grense.
 * opts: {scope:{module:'boliger', home_id}, onStep(step), homeSearch(u, text, scope, p) → svar, subsAnswer(u, text) → svar, now}
 */
export async function ask42(u, text, { scope = null, onStep = () => {}, homeSearch = null, subsAnswer = null, special = null, now = new Date(), noCache = false } = {}) {
  const t0 = performance.now();
  const steps = [];
  const step = (label, detail, ms, done = true) => { const s = { label, detail: detail ?? null, ms: Math.round(ms * 100) / 100, done }; steps.push(s); try { onStep(s); } catch { /* */ } return s; };
  const tIdx = performance.now();
  const rebuilt = ensureIndex42(u);
  const idxMs = performance.now() - tIdx;
  const key = `${u}|${fold42(text).replace(/\s+/g, ' ').trim()}|${JSON.stringify(scope ?? null)}|${built.get(u)}`;
  if (!noCache && cache.has(key) && Date.now() - cache.get(key).at < CACHE_MS) {
    const c = cache.get(key).value;
    const ms = Math.round(performance.now() - t0);
    for (const s of c.steps) { try { onStep(s); } catch { /* */ } }
    return { ...c, cached: true, ms };
  }
  const tp = performance.now();
  const p = parseQuery42(text, { u, now });
  const parseMs = performance.now() - tp;
  const parts = [p.intent === 'subscriptions' ? 'abonnementer' : p.intent === 'find_receipt' ? 'kvittering' : p.intent === 'how_much' ? 'hvor mye' : p.intent === 'how_often' ? 'hvor ofte' : p.intent === 'last_bought' ? 'sist kjøpt' : p.intent,
    p.item ? `vare «${p.item}»` : null, p.category ? `kategori «${p.category}»` : null, p.merchantDisplay ? `butikk «${p.merchantDisplay}»` : null, p.period ? p.period.label : null,
    p.min != null || p.max != null ? `${p.min ?? 0}–${p.max ?? '∞'} kr` : null, scope?.module === 'boliger' ? 'i Boliger' : null].filter(Boolean);
  step('Forstod spørsmålet', parts.join(' · ') || 'fritekst', parseMs + (rebuilt ? idxMs : 0));
  let out, path = 'fast', engine = 'lokalt', model = null, sqlMs = 0, llmUsed = false;
  // Boliger: søket avgrenses til boligen (eller alle boligene).
  if (scope?.module === 'boliger' && homeSearch) {
    const ts = performance.now();
    out = await homeSearch(u, text, scope, p);
    sqlMs = performance.now() - ts;
    step(`Søkte i ${out.searched ?? out.hits ?? 0} utgifter${out.homeName ? ` i ${out.homeName}` : ''} · fant ${out.hits ?? 0}`, null, sqlMs);
  } else if (special && (out = special(u, text, p))) {
    // Budsjett, faste utgifter og kontoer (prompt 40) – også hurtigvei.
    step(`Leste ${out.source?.toLowerCase() ?? 'dataene'}`, null, 0);
  } else if (p.intent === 'subscriptions' && subsAnswer) {
    const ts = performance.now();
    out = subsAnswer(u, text);
    sqlMs = performance.now() - ts;
    step(`Leste abonnementene · fant ${out.items?.length ?? 0}`, null, sqlMs);
  } else if (understood42(p)) {
    const ts = performance.now();
    const rows = sqlHits42(u, p);
    const total = q('SELECT count(*) FROM search_items WHERE user_id=? AND kind=?').pluck().get(u, p.item ? 'line' : 'tx');
    sqlMs = performance.now() - ts;
    step(`Søkte i ${total.toLocaleString('nb-NO').replace(/\s/g, ' ')} ${p.item ? 'varelinjer' : 'transaksjoner'} · fant ${rows.length}`, null, sqlMs);
    const tb = performance.now();
    out = fastAnswer42(u, p, rows);
    step(out.cards.some((c) => c.receiptId) ? 'Fant kvitteringene' : 'Regnet ut svaret', null, performance.now() - tb);
  } else {
    // Fritekst: LLM med maks 40 rader. Ingen svar etter 6 s → vis SQL-treffene (vanlig søk).
    path = 'llm';
    const ts = performance.now();
    const words = words42(text).filter((w) => !STOP.has(w) && w.length >= 3).map(stem42);
    let rows = words.length ? q(`SELECT s.* FROM search_fts42 f JOIN search_items s ON s.id=f.rowid WHERE s.user_id=? AND search_fts42 MATCH ? ORDER BY s.date DESC LIMIT 40`).all(u, ftsOf(words)) : [];
    if (!rows.length) rows = q("SELECT * FROM search_items WHERE user_id=? AND kind='tx' ORDER BY date DESC LIMIT 40").all(u);
    sqlMs = performance.now() - ts;
    step(`Valgte ${rows.length} relevante rader`, null, sqlMs);
    const sum = rows.reduce((s, r) => s + Math.abs(r.amount ?? 0), 0);
    const tl = performance.now();
    step('Glimt skriver svaret …', null, 0, false);
    try {
      const r = await withTimeout(llmText(u, llmPrompt(text, rows, sum), rows), _llm42.ms);
      llmUsed = true; engine = 'ollama'; model = r.model;
      out = { intent: 'free', text: r.text || `Fant ${rows.length} rader.`, cards: receiptCards(u, rows.slice(0, 20)), hits: rows.length };
      steps[steps.length - 1] = { ...steps.at(-1), done: true, ms: Math.round(performance.now() - tl) };
    } catch (e) {
      steps[steps.length - 1] = { ...steps.at(-1), label: e.timeout ? 'Glimt brukte for lang tid · viser vanlig søk' : 'Glimt svarte ikke · viser vanlig søk', done: true, ms: Math.round(performance.now() - tl) };
      out = { intent: 'search', text: rows.length ? `Fant ${rows.length} treff. Glimt fortsetter i bakgrunnen.` : 'Fant ingenting.', cards: receiptCards(u, rows.slice(0, 20)), hits: rows.length, llmPending: !!e.timeout };
      path = 'fast-fallback'; engine = 'lokalt';
    }
  }
  const ms = Math.round(performance.now() - t0);
  const n = out.hits ?? out.items?.length ?? 0;
  const done = engine === 'ollama' ? `Glimt tenkte i ${secs(ms)} · Ollama${model ? ` (${model})` : ''}` : `Glimt tenkte i ${secs(ms)} · lokalt søk`;
  if (!out.source) Object.assign(out, scope?.module === 'boliger' ? { source: 'Boliger', sourceLabel: 'leste utgiftene i boligen' } : { source: 'Transaksjoner', sourceLabel: 'leste transaksjoner og kvitteringer' });
  const value = { ...out, q: text, steps, ms, engine, path: path === 'fast-fallback' ? 'fast' : path, model, parsed: p, intent: out.intent ?? p.intent, label: '✦ Glimt · lokalt', thinking: 'Glimt tenker …', doneText: done,
    hitsText: `Fant ${n} ${n === 1 ? 'treff' : 'treff'} på ${secs(ms)} · ${engine === 'ollama' ? 'Glimt (Ollama)' : 'lokalt søk'}`, timing: { parse_ms: Math.round(parseMs * 100) / 100, sql_ms: Math.round(sqlMs * 100) / 100, total_ms: ms } };
  logSearch42(u, { q: String(text).slice(0, 120), intent: value.intent, path: value.path, engine, parse_ms: value.timing.parse_ms, sql_ms: value.timing.sql_ms, llm_used: llmUsed, hits: n, ms });
  if (!llmUsed) cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}
export const _clearCache42 = () => cache.clear();

/* ---------------- Filter fra fritekst (Filter-siden) ---------------- */

/** «ICA mellom 500 og 5000 kr i uke 34 til 50» → {merchants:['ica'], categories:[], home:null, min:500, max:5000, from, to, week:{from:34, to:50}, …} */
export function filterFromText42(u, text, { homes = [], categories = [], now = new Date() } = {}) {
  const t0 = performance.now();
  const p = parseQuery42(text, { u, now });
  const t = fold42(text);
  const f = { merchants: p.merchant ? [p.merchant] : [], merchantNames: p.merchantDisplay ? [p.merchantDisplay] : [], categories: [], home: null, min: p.min, max: p.max, from: p.period?.from ?? null, to: p.period?.to ?? null, week: null, period: p.period?.label ?? null, item: p.item };
  const wk = t.match(/\buke\s*(\d{1,2})\s*(?:-|–|til|og)\s*(?:uke\s*)?(\d{1,2})\b/) ?? t.match(/\buke\s*(\d{1,2})\b/);
  if (wk) f.week = { from: +wk[1], to: +(wk[2] ?? wk[1]) };
  for (const c of categories) if (new RegExp(`(^|[^\\p{L}])${fold42(c.name).split(' ')[0]}`, 'u').test(t)) f.categories.push(c.id);
  if (/\b(hytta|hytte)\b/.test(t)) { const h = homes.find((x) => /hytte/i.test(`${x.type} ${x.name}`)); if (h) f.home = h.id; }
  for (const h of homes) if (t.includes(fold42(h.name)) || fold42(h.name).split(/\s+/).some((w) => w.length >= 4 && new RegExp(`\\b${w}\\b`).test(t))) f.home = h.id;
  if (f.home == null && /\b(bolig|boliger|boligene)\b/.test(t)) f.home = 'all';
  if (f.item && f.categories.length) f.item = null;
  const ms = Math.round(performance.now() - t0);
  const chips = [...f.merchantNames.map((n) => n), f.min != null && f.max != null ? `${f.min}–${f.max} kr` : f.min != null ? `over ${f.min} kr` : f.max != null ? `under ${f.max} kr` : null,
    f.week ? (f.week.from === f.week.to ? `uke ${f.week.from}` : `uke ${f.week.from}–${f.week.to}`) : f.period, f.home === 'all' ? 'alle boliger' : f.home ? homes.find((h) => h.id === f.home)?.name : null,
    ...f.categories.map((id) => categories.find((c) => c.id === id)?.name)].filter(Boolean);
  return { filter: f, text: `✦ Glimt satte filteret: ${chips.join(' · ') || 'ingen filtre'} · ${secs(ms)}`, ms, engine: 'lokalt', understood: chips.length > 0 };
}
