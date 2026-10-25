// Prompt 39 (SERVER39): kvitteringer – bedre varelinjer, kontroll av summen, ny kategori når ingen passer.
// (claude-code-glimt-kvittering-lesing.md, claude-code-kvittering-ny-kategori.md, claude-code-kvittering-pa-nytt-fremdrift.md)
//
// Lesingen (ai.js PROMPT + SCHEMA) får norske kvitteringsregler og nye linjefelt: name, nameRaw, qty, unitPrice, discount, vatRate,
// og på toppen discounts[], pant, receipt_no, time. validate() beholder dem. Kontrollen verify39(): sum(linjer) − rabatter + pant = total (±1 kr)
// → {ok, status:'ok'|'usikker', lines, sum, total, diff, text:'✦ Glimt leste 3 varer · sum stemmer' | 'Usikker · linjene summerer 120 av 135 kr'}.
// Feiler den, leser ai.js én gang til med tilbakemelding («Linjene summerer 120,00, total er 135,00. Finn linjen som mangler.»).
//
// Kategori: classify39(u, data) → {categoryId, category, isNew, confidence (0–1), reason:'Bokhandel · pensum', suggestNew?}
//   Eksisterende kategori (også tidligere AI-lagde) når forslaget eller butikktypen passer (likhet ≥ 0,85 på normaliserte ord,
//   «Skole» = «Skole og studier»). Ellers lages en ny (1–3 norske ord, aldri butikknavn eller «Diverse») med farge og ikon fra paletten,
//   source:'ai', confirmed:false. Maks 3 nye per uke uten godkjenning, deretter bare forslag (suggestNew) og «Annet».
//   Bokføring (godkjenning) gjør den permanent (confirmed). 2 like godkjenninger (butikk → ny kategori) gir regelen «AKADEMIKA* → Skole og studier» (source 'ai').
//   Ubekreftede AI-kategorier som ingen kvitteringer/transaksjoner bruker, slettes etter 24 t.
import { db, me } from './db.js';

const q = (sql) => db.prepare(sql);
const addCol = (t, col, def) => { if (!q(`PRAGMA table_info(${t})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
addCol('fh_categories', 'source', "TEXT NOT NULL DEFAULT 'user'");
addCol('fh_categories', 'confirmed', 'INTEGER NOT NULL DEFAULT 1');
addCol('fh_categories', 'icon', 'TEXT');
addCol('fh_categories', 'created', 'INTEGER');
addCol('fh_categories', 'ai_reason', 'TEXT');
addCol('fh_categories', 'example_tx', 'TEXT');
addCol('fh_rules', 'source', "TEXT NOT NULL DEFAULT 'user'");

export const PALETTE39 = [['#2b5d8a', 'book'], ['#8a3fa0', 'gift'], ['#a8661a', 'tool'], ['#3d7f8a', 'heart'], ['#c2477a', 'ticket'], ['#5b4fc4', 'star'], ['#7a8a2a', 'leaf'], ['#2f7a4f', 'bag'], ['#b23a2a', 'tag'], ['#6b665c', 'box']];
export const MAX_NEW_PER_WEEK = 3;
export const NEW_THRESHOLD = 0.6;

/* ---------------- Systemprompt (norske kvitteringer) ---------------- */

export const RULES39 = `
Regler for norske kvitteringer:
- Komma er desimaltegn. «2 x 24,90» eller «2 STK á 24,90» blir qty 2, unitPrice 24.90, amount 49.80.
- RABATT, -10%, TRUMF og KUPONG er rabatter (discounts), ikke varer. PANT er pant.
- MVA 25 % / 15 % / 12 % / 0 % er MVA-tabellen (vat), ikke varer.
- Ignorer terminaltekst: BAX, Ref, AID, TVR, Autorisasjon, «Kundens kopi», «Takk for handelen».
- Kopier teksten fra kvitteringen, ikke gjett. nameRaw er teksten slik den står; name er lesbar form («TOMAT CHERRY 250G» → «Cherrytomater 250 g»).
  For bokhandel: bruk boktittel og ISBN hvis de står.
- Hver varelinje skal med. Er en linje uleselig, ta den med som name «(uleselig)» med pris. Hopp aldri over en linje.
- amount er linjens sum (etter linjerabatt). Summen av linjene − rabatter + pant skal bli total.`;

/* ---------------- Linjer og kontroll ---------------- */

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : Math.round(+v * 100) / 100);
/** Fyller de nye feltene på linjene (name, nameRaw, qty, unitPrice, discount, vatRate) fra det modellen ga. */
export function normalizeLines39(x, lines) {
  const raw = Array.isArray(x?.lines) ? x.lines.filter((l) => l && (l.amount ?? l.price) != null && Number.isFinite(+(l.amount ?? l.price))) : [];
  return lines.map((l, i) => {
    const r = raw[i] ?? {};
    const name = String(r.name ?? l.description ?? r.nameRaw ?? '').trim().slice(0, 120) || '(uleselig)';
    const qty = num(r.qty ?? r.quantity ?? l.quantity);
    return { ...l, description: l.description || name, name, nameRaw: String(r.nameRaw ?? r.description ?? name).slice(0, 120), qty: qty ?? 1, unitPrice: num(r.unitPrice) ?? (qty ? num(l.amount / qty) : num(l.amount)),
      discount: num(r.discount) ?? 0, ...(num(r.vatRate) != null ? { vatRate: num(r.vatRate) } : {}) };
  });
}
export function extras39(x) {
  return {
    discounts: Array.isArray(x?.discounts) ? x.discounts.filter((d) => d && Number.isFinite(+d.amount)).slice(0, 20).map((d) => ({ text: String(d.text ?? '').slice(0, 80), amount: Math.abs(num(d.amount)) })) : [],
    pant: num(x?.pant) ?? 0,
    receipt_no: typeof x?.receipt_no === 'string' ? x.receipt_no.slice(0, 40) : typeof x?.receiptNo === 'string' ? x.receiptNo.slice(0, 40) : null,
    time: typeof x?.time === 'string' && /^\d{2}:\d{2}$/.test(x.time) ? x.time : null,
  };
}
const kr = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const kr2 = (v) => v.toFixed(2).replace('.', ',');
/** sum(linjer) − rabatter + pant = total (±1 kr). → kontrollen */
export function verify39(d, txAmount = null) {
  const lines = Array.isArray(d?.lines) ? d.lines : [];
  const total = d?.total;
  if (total == null) return { ok: false, status: 'usikker', lines: lines.length, sum: null, total: null, diff: null, text: 'Usikker · fant ikke totalen' };
  if (!lines.length) return { ok: false, status: 'usikker', lines: 0, sum: null, total, diff: null, text: 'Usikker · Glimt fant bare totalen, ingen varelinjer' };
  const disc = (d.discounts ?? []).reduce((a, x) => a + Math.abs(x.amount ?? 0), 0);
  const sum = Math.round((lines.reduce((a, l) => a + (+l.amount || 0), 0) - disc + (+d.pant || 0)) * 100) / 100;
  const diff = Math.round((total - sum) * 100) / 100;
  const txOk = txAmount == null || Math.abs(Math.abs(txAmount) - total) <= 1;
  const ok = Math.abs(diff) <= 1 && txOk;
  const n = lines.filter((l) => l.name !== '(uleselig)').length;
  return { ok, status: ok ? 'ok' : 'usikker', lines: lines.length, sum, total, diff, discounts: disc, pant: +d.pant || 0,
    text: ok ? `✦ Glimt leste ${n} ${n === 1 ? 'vare' : 'varer'} · sum stemmer` : !txOk ? `Usikker · totalen ${kr(total)} kr stemmer ikke med banken (${kr(Math.abs(txAmount))} kr)` : `Usikker · linjene summerer ${kr(sum)} av ${kr(total)} kr`,
    feedback: ok ? null : `Linjene summerer ${kr2(sum)}, total er ${kr2(total)}. Finn linjen som mangler, eller rett beløpet som er feil.` };
}

/* ---------------- Kategori ---------------- */

const normName = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå ]/g, ' ').replace(/\b(og|for|til|av|i)\b/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (w) => w.replace(/(ene|er|en|et|e)$/, '');
/** Likhet 0–1 mellom to kategorinavn: andel felles ord (stammet) av det korteste. «Skole» ~ «Skole og studier» = 1. */
export function nameSim(a, b) {
  const A = new Set(normName(a).split(' ').filter(Boolean).map(stem)), B = new Set(normName(b).split(' ').filter(Boolean).map(stem));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
// Butikktype → kategori (navn, grunn, ikon). Første treff vinner. Bygger på butikknavn, orgnr-bransje (når kjent) og varelinjene.
export const MERCHANT_TYPES = [
  [/akademika|ark bokhandel|norli|tanum|bokhandel|pensum|\bisbn\b|cappelen|adlibris|studentbok/i, 'Skole og studier', 'Bokhandel · pensum', 'book'],
  [/vinmonopol/i, 'Vin og brennevin', 'Vinmonopolet · alkohol', 'glass'],
  [/jernia|clas ohlson|biltema|byggmax|maxbo|obs bygg|jula\b|montér|monter|coop byggmix|xl.?bygg|jernvare|skrue|verktøy/i, 'Verktøy og jernvare', 'Jernvare · verktøy', 'tool'],
  [/musti|dyrebutikk|\bzoo\b|dyreklinikk|veterinær|dyrlege|kattemat|hundemat|dogman/i, 'Kjæledyr', 'Dyrebutikk · fôr og utstyr', 'paw'],
  [/apotek|vitusapotek|boots|farmasi/i, 'Helse og apotek', 'Apotek', 'heart'],
  [/kino|teater|konsert|ticketmaster|billettservice|museum|nille kino|filmweb/i, 'Kultur og fritid', 'Kultur · billetter', 'ticket'],
  [/\bxxl\b|intersport|sport ?1|anton sport|g-sport|sportsbutikk/i, 'Sport og fritid', 'Sportsbutikk', 'ball'],
  [/h&m|cubus|dressmann|zara|bik bok|lindex|carlings|kappahl|vic|skoringen|eurosko/i, 'Klær og sko', 'Klesbutikk', 'shirt'],
  [/elkjøp|elkjop|\bpower\b|komplett|netonnet|kjell & company|kjell og company/i, 'Elektronikk', 'Elektronikkbutikk', 'plug'],
  [/ikea|jysk|bohus|kid interiør|princess|søstrene grene|sostrene grene|nille\b|europris/i, 'Hjem og interiør', 'Interiør · hjem', 'home'],
  [/circle k|\besso\b|\bshell\b|uno-x|\byx\b|\bst1\b|bensin|diesel/i, 'Drivstoff', 'Bensinstasjon', 'fuel'],
  [/interflora|blomster|gavekort|gaveeske/i, 'Gaver', 'Blomster og gaver', 'gift'],
  [/frisør|barber|neglstudio|hudpleie/i, 'Personlig pleie', 'Frisør og pleie', 'scissors'],
  [/parkering|easypark|apcoa|onepark|aimo park/i, 'Parkering', 'Parkering', 'car'],
];
const BAD_NAMES = /^(diverse|annet|andre|ukjent|kvittering|div\.?)$/i;
const cleanCat = (s) => String(s ?? '').replace(/[^\p{L}\d &-]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ').replace(/^./, (c) => c.toUpperCase()).slice(0, 40);
const cats = (u) => q("SELECT id, name, color, source, confirmed, icon, created FROM fh_categories WHERE user_id=? AND kind='expense' ORDER BY sort, id").all(u);
const isMerchantName = (name, merchant) => !!merchant && nameSim(name, merchant) >= 0.85;
export function newThisWeek(u, now = Date.now()) { return q("SELECT count(*) FROM fh_categories WHERE user_id=? AND source='ai' AND confirmed=0 AND created>?").pluck().get(u, now - 7 * 86400_000); }
/** Velger (eller lager) kategori for en lest kvittering. Lager aldri noe når dryRun. */
export function classify39(u, d, { dryRun = false, now = Date.now() } = {}) {
  const list = cats(u);
  const merchant = String(d?.merchant ?? '');
  const hay = `${merchant} ${(d?.lines ?? []).map((l) => `${l.name ?? ''} ${l.description ?? ''}`).join(' ')}`;
  const conf = Math.max(0, Math.min(1, +(d?.confidence?.merchant ?? d?.confidence?.total ?? 0.8) || 0.8));
  const best = (name) => list.map((c) => ({ c, s: nameSim(c.name, name) })).sort((a, b) => b.s - a.s)[0];
  const type = MERCHANT_TYPES.find(([re]) => re.test(hay));
  const sug = String(d?.suggested_category ?? '').trim();
  // 1. AI-forslaget finnes som kategori (også tidligere AI-lagde).
  if (sug && !BAD_NAMES.test(sug)) {
    const b = best(sug);
    if (b && b.s >= 0.85) {
      // Er forslaget «Annet»-aktig men butikktypen er kjent, går typen foran.
      if (!(type && /^annet$/i.test(b.c.name))) return { categoryId: b.c.id, category: b.c.name, isNew: false, confidence: Math.round(conf * 100) / 100, reason: type?.[2] ?? `Glimt foreslo ${b.c.name}` };
    }
  }
  // 2. Butikktypen passer en eksisterende kategori.
  if (type) {
    const b = best(type[1]);
    if (b && b.s >= 0.85) return { categoryId: b.c.id, category: b.c.name, isNew: false, confidence: 0.8, reason: type[2] };
  }
  // 3. Ny kategori: butikktypen, ellers et brukbart AI-forslag (ikke butikknavn, ikke «Diverse»).
  let name = type?.[1] ?? null, reason = type?.[2] ?? null, icon = type?.[3] ?? null;
  if (!name && sug && !BAD_NAMES.test(sug) && !isMerchantName(sug, merchant)) { name = cleanCat(sug); reason = `Glimt foreslo «${name}»`; }
  const annet = list.find((c) => /^annet$/i.test(c.name)) ?? null;
  if (!name || BAD_NAMES.test(name)) return { categoryId: annet?.id ?? null, category: annet?.name ?? null, isNew: false, confidence: Math.min(conf, 0.5), reason: 'Ingen kategori passet' };
  const sim = best(name);
  if (sim && sim.s >= 0.85) return { categoryId: sim.c.id, category: sim.c.name, isNew: false, confidence: 0.75, reason };
  if (newThisWeek(u, now) >= MAX_NEW_PER_WEEK) return { categoryId: annet?.id ?? null, category: annet?.name ?? null, isNew: false, confidence: 0.5, reason, suggestNew: name, suggestText: `Lag kategori «${name}»?` };
  if (dryRun) return { categoryId: null, category: name, isNew: true, confidence: 0.75, reason };
  const created = createAiCategory(u, { name, icon, reason, now });
  return { categoryId: created.id, category: created.name, isNew: true, confidence: 0.75, reason, color: created.color, icon: created.icon };
}
/** Lager en AI-kategori (ubekreftet) med farge og ikon fra paletten. Finnes navnet (eller noe likt), brukes det. */
export function createAiCategory(u, { name, color = null, icon = null, reason = null, exampleTx = null, now = Date.now() }) {
  const nm = cleanCat(name);
  const same = cats(u).find((c) => nameSim(c.name, nm) >= 0.85 || c.name.toLowerCase() === nm.toLowerCase());
  if (same) return { ...same, existing: true };
  const used = new Set(cats(u).map((c) => c.color?.toLowerCase()));
  const [pc, pi] = PALETTE39.find(([c]) => !used.has(c)) ?? PALETTE39[cats(u).length % PALETTE39.length];
  const r = q("INSERT INTO fh_categories(name,color,kind,sort,user_id,source,confirmed,icon,created,ai_reason,example_tx) VALUES(?,?,'expense',(SELECT COALESCE(MAX(sort),0)+1 FROM fh_categories WHERE user_id=?),?,'ai',0,?,?,?,?) RETURNING id")
    .get(nm, color && /^#[0-9a-f]{6}$/i.test(color) ? color : pc, u, u, icon || pi, now, reason, exampleTx ? String(exampleTx).slice(0, 120) : null);
  console.info(`[finans39] ny AI-kategori «${nm}» (${reason ?? 'uten grunn'}) for ${u}`);
  return { id: r.id, name: nm, color: color ?? pc, icon: icon || pi, source: 'ai', confirmed: 0, created: now };
}
export const categoryOut39 = (x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind ?? 'expense', source: x.source ?? 'user', confirmed: x.confirmed == null ? true : !!x.confirmed, icon: x.icon ?? null, ...(x.ai_reason ? { reason: x.ai_reason } : {}) });

/** Etter bokføring: AI-kategorien blir permanent; 2 like godkjenninger (butikk → AI-kategori) gir en regel (source 'ai'). */
export function confirmOnBook39(u, r) {
  if (!r?.category_id) return null;
  const c = q('SELECT * FROM fh_categories WHERE id=? AND user_id=?').get(r.category_id, u);
  if (!c || c.source !== 'ai') return null;
  if (!c.confirmed) q('UPDATE fh_categories SET confirmed=1 WHERE id=?').run(c.id);
  const word = String(r.merchant ?? '').toUpperCase().replace(/[^A-ZÆØÅ0-9 ]/g, '').trim().split(/\s+/)[0];
  if (!word || word.length < 3) return null;
  const n = q("SELECT count(*) FROM fh_receipts WHERE user_id=? AND status='booked' AND category_id=? AND upper(merchant) LIKE ?").pluck().get(u, c.id, `${word}%`);
  if (n < 2) return null;
  const ex = q('SELECT * FROM fh_rules WHERE pattern=? AND user_id=?').get(`${word}*`, u);
  if (ex) { q("UPDATE fh_rules SET category_id=?, source='ai' WHERE id=?").run(c.id, ex.id); return { id: ex.id, pattern: `${word}*`, category: c.name }; }
  const id = q("INSERT INTO fh_rules(pattern,category_id,priority,user_id,source) VALUES(?,?,40,?,'ai') RETURNING id").get(`${word}*`, c.id, u).id;
  return { id, pattern: `${word}*`, category: c.name };
}

/** Ubekreftede AI-kategorier uten kvitteringer/transaksjoner slettes etter 24 t (brukeren valgte en annen). */
export function sweepAiCategories(now = Date.now()) {
  const old = q(`SELECT id, name, user_id FROM fh_categories WHERE source='ai' AND confirmed=0 AND created IS NOT NULL AND created < ?
    AND id NOT IN (SELECT category_id FROM fh_receipts WHERE category_id IS NOT NULL) AND id NOT IN (SELECT category_id FROM fh_transactions WHERE category_id IS NOT NULL)`).all(now - 86400_000);
  for (const c of old) { q('DELETE FROM fh_categories WHERE id=?').run(c.id); console.info(`[finans39] ubrukt AI-kategori «${c.name}» fjernet etter 24 t (${c.user_id})`); }
  return old.length;
}
if (process.env.NODE_ENV !== 'test') { setInterval(() => { try { sweepAiCategories(); } catch (e) { console.warn('[finans39]', e.message); } }, 3600_000).unref?.(); }

/* ---------------- «✦ På nytt»: steg og prosent ---------------- */

export const RE_STEPS = [
  ['upload', 'Laster opp bildet'], ['ocr', 'Leser teksten (OCR)'], ['llm', '✦ {motor} tolker butikk, linjer og beløp'], ['verify', 'Sjekker sum og dato'],
];
export const stepsOut39 = (at, engine = 'Lokal AI', failed = false) => {
  const idx = RE_STEPS.findIndex(([k]) => k === at);
  return RE_STEPS.map(([k, label], i) => ({ k, label: label.replace('{motor}', engine), state: at === 'done' || i < idx ? 'done' : i === idx ? (failed ? 'error' : 'active') : 'pending' }));
};
export { me };
