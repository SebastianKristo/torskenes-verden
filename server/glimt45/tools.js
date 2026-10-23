// Prompt 45 (GLIMT45): ett verktøyregister for Glimt over de eksisterende API-ene/funksjonene.
// Hvert verktøy: {name, module, description, destructive, parameters (JSON-skjema), validate(args, ctx) → {args}|{ask}|{error},
// run(args, ctx) → {status:'done'|'failed', result, cards, facts}, verify?(result, ctx) → bool}.
// Verktøyene ser bare den innloggede brukerens data (runAsUser + user_id i alle spørringer). Boliger/Matplan røres ikke her.
import { db, kv } from '../db.js';
import { runAsUser } from '../settings.js';
import { broadcast } from '../realtime.js';
import { eventsFor, createEvent, updateEvent, deleteEvent, findEvent, eventInput, normText } from '../calendar.js';
import { KINDS, parseQuick } from '../../public/js/quick-time.js';
import { ensureIndex42, merchantKey42, synonymsOf42, stem42, fold42, norm42 } from '../finans/search42.js';
import { ensureLedger, settings as fhSettings } from '../finans/db.js';
import { whenOf45, parsePeriod45, parseAmount45, parseDate45, parseTime45, isIsoDate45, isHm45, addDays45, addMin45, todayOslo45, longDate45, relDate45, mondayOf45, MON45 } from './dates.js';

const q = (sql) => db.prepare(sql);
const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => String(s ?? '').replace(/^\s*(.)/, (m, c) => c.toUpperCase());
const str = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const krN = (v) => { const r = Math.round(Math.abs(+v) * 100) / 100; return (Number.isInteger(r) ? r.toLocaleString('nb-NO') : r.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).replace(/\s/g, ' '); };
export const kr45 = (v) => `${krN(v)} kr`;
const osloHm = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute}`; };
const hmOfEv = (e) => (e.allDay ? null : (isHm45(e.s) ? e.s : osloHm(e.start)));
const endHmOfEv = (e) => (e.allDay ? null : osloHm(e.end));
const durMin = (e) => (e.allDay ? 0 : Math.max(15, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60000)));
const shortDay = (date) => { const x = new Date(`${date}T00:00:00Z`); return `${['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'][x.getUTCDay()]} ${x.getUTCDate()}. ${['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'][x.getUTCMonth()]}`; };
export const eventLabel45 = (e) => `${e.title} · ${shortDay(e.date)}${e.allDay ? '' : ` ${hmOfEv(e)}`}`;
export const eventCard45 = (e) => ({ kind: 'event', id: e.id, title: e.title, subtitle: `${shortDay(e.date)}${e.allDay ? ' · hele dagen' : ` · ${hmOfEv(e)}–${endHmOfEv(e)}`}${e.room ? ` · ${e.room}` : ''}`,
  date: e.date, time: hmOfEv(e), end: endHmOfEv(e), allDay: !!e.allDay, place: e.room ?? null, calendar: e.appCalendar ?? e.calendar ?? null, color: e.appColor ?? e.color ?? null, editable: !!e.editable });

/* ---------------- Tittel ---------------- */

const LEAD = /^(?:(?:kan du|vil du|glimt,?)\s+)?(?:legg(?:e)?\s+(?:til|inn)|sett\s+opp|book(?:e)?|bestill|lag|opprett|registrer|ny|nytt|skriv\s+inn|før\s+opp)(?![a-zæøå])\s*(?:en\s+|et\s+|ny\s+|nytt\s+)?/i;
const NOUN = /^(?:time|timen|avtale|avtalen|hendelse|møte\s+om|påminnelse\s+om)(?![a-zæøå])\s*/i;
const WHERE_CAL = /\s*(?:i|på|til|inn\s+i)\s+(?:kalender(?:en)?|min\s+kalender|kalendern)(?![a-zæøå])/gi;
const FILLER = /(?<![a-zæøå])(?:kl\.?|klokka|klokken|den|på|til|om)\s*$/i;
/**
 * Ryddig tittel fra teksten når modellen ikke ga en (eller ga hele setningen): dato, tid, innledningsord og «i kalenderen» fjernes.
 * «Legg til time 12.10 12:15 Kino se på dune» → «Kino – Dune».
 */
export function cleanEventTitle45(raw) {
  let t = ` ${String(raw ?? '')} `.replace(WHERE_CAL, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) { const b = t; t = t.replace(LEAD, '').replace(NOUN, '').trim(); if (b === t) break; }
  t = t.replace(/(?<![a-zæøå])(?:i dag|i morgen|i overmorgen|i kveld|neste uke)(?![a-zæøå])/gi, ' ').replace(/(?<![a-zæøå])(?:kl\.?|klokka|klokken)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
  while (FILLER.test(t)) t = t.replace(FILLER, '').trim();
  t = t.replace(/^(?:på|den|til|om)\s+/i, '').replace(/[\s.,;:!–-]+$/g, '').replace(/^[\s.,;:–-]+/, '').trim();
  // «Kino se på dune», «teater for å se Peer Gynt», «konsert med Kygo» → «Kino – Dune»
  const m = /^(kino|teater(?:et)?|konsert|forestilling|musikal|film|opera|ballett|stand-?up|show|kamp)\s+(?:for\s+å\s+se|å\s+se|se\s+på|se|med|:)\s+(.+)$/i.exec(t);
  if (m) t = `${cap(m[1].toLowerCase())} – ${m[2].replace(/(^|\s)(\p{L})/gu, (x, a, c) => a + c.toUpperCase())}`;
  t = t.replace(/\s+/g, ' ').trim();
  return t ? cap(t.length > 120 ? `${t.slice(0, 118)}…` : t) : '';
}
const TASK_LEAD = /^(?:(?:kan du|vil du|glimt,?)\s+)?(?:minn\s+meg\s+(?:på|om)\s+(?:at\s+(?:jeg|vi)\s+(?:må|skal)\s+)?|påminn\s+meg\s+(?:om\s+)?|husk\s+(?:meg\s+)?(?:på\s+)?(?:at\s+(?:jeg|vi)\s+(?:må|skal)\s+)?|ikke\s+glem\s+|jeg\s+må\s+huske\s+|vi\s+må\s+huske\s+|jeg\s+må\s+|vi\s+må\s+|må\s+huske\s+|legg\s+(?:til|inn)\s+|ny\s+oppgave:?\s*|nytt\s+gjøremål:?\s*|gjøremål:?\s*|oppgave:?\s*)/i;
const TASK_TAIL = /\s*(?:i|på|til)\s+(?:huskelist(?:a|en|e)|handlelist(?:a|en|e)|gjøremål(?:ene)?|oppgavene|todo-?lista)(?![a-zæøå])/gi;
/** «Minn meg på å kjøpe melk i morgen» → «Kjøpe melk». Dato/tid fjernes av whenOf45 før dette. */
export function cleanTaskTitle45(raw) {
  let t = ` ${String(raw ?? '')} `.replace(TASK_TAIL, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) { const b = t; t = t.replace(TASK_LEAD, '').replace(/^(?:å|om\s+å|at)\s+/i, '').trim(); if (b === t) break; }
  t = t.replace(/(?<![a-zæøå])(?:i dag|i morgen|i overmorgen|i kveld|neste uke|innen)(?![a-zæøå])/gi, ' ').replace(/\s+/g, ' ');
  while (FILLER.test(t)) t = t.replace(FILLER, '').trim();
  t = t.replace(/[\s.,;:!–-]+$/g, '').trim();
  return t ? cap(t.length > 200 ? t.slice(0, 200) : t) : '';
}

/* ---------------- Kalender ---------------- */

const durationOf = (title) => { const k = KINDS.find(([re]) => re.test(String(title).toLowerCase())); return k ? k[1] : 60; };
async function eventsIn(user, from, to) { return (await runAsUser(user, () => eventsFor(user, from, to))).events ?? []; }
const onDay = (e, d) => (e.allDay ? e.date <= d && (e.end ?? e.date) > d || e.date === d : e.date === d);
const sortEv = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.allDay ? -1 : b.allDay ? 1 : Date.parse(a.start) - Date.parse(b.start)));
const sameTitle = (a, b) => normText(a).replace(/[^\p{L}\d]+/gu, '') === normText(b).replace(/[^\p{L}\d]+/gu, '');
const STOP_TERMS = new Set(['den', 'det', 'avtalen', 'avtale', 'timen', 'time', 'hendelsen', 'møtet', 'min', 'mitt', 'til', 'på', 'i', 'kl', 'klokka', 'fra', 'flytt', 'endre', 'slett', 'fjern', 'avlys', 'utsett', 'med', 'en', 'et', 'neste', 'første', 'denne']);
const termsOf = (s) => normText(s).replace(/[^\p{L}\d\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP_TERMS.has(w));

/**
 * Finner målet for en endring/sletting. Rekkefølge: valgt element (context.selectedId) → navn i teksten (blant synlige/kommende)
 * → sist viste/lagde (glimt45-kontekst, 30 min) når den er entydig. Flere mulige → spør (aldri gjett).
 * → {event} | {ask:{question, options}} | {none:true}
 */
export async function resolveEvent45(user, { targetId = null, target = '', ctx = {}, today = todayOslo45(), verb = 'endre' } = {}) {
  const id = targetId ?? ctx.selectedId ?? null;
  if (id) { const ev = await runAsUser(user, () => findEvent(user, String(id))).catch(() => null); if (ev) return { event: ev }; }
  const upcoming = (await eventsIn(user, addDays45(today, -1), addDays45(today, 120))).filter((e) => e.editable !== false).sort(sortEv);
  const terms = termsOf(target);
  if (terms.length) {
    const pool = ctx.visibleIds?.length ? upcoming.filter((e) => ctx.visibleIds.includes(e.id)) : [];
    const hit = (e) => terms.every((w) => normText(`${e.title} ${e.room ?? ''}`).includes(w)) || terms.some((w) => w.length > 3 && normText(e.title).split(/\s+/).some((x) => x.startsWith(w.slice(0, Math.max(4, w.length - 2)))));
    const list = (pool.length ? pool.filter(hit) : []).concat(upcoming.filter(hit).filter((e) => !pool.includes(e)));
    if (list.length === 1) return { event: list[0] };
    if (list.length > 1) return { ask: { question: `Hvilken avtale vil du ${verb}?`, options: list.slice(0, 5).map((e) => ({ id: e.id, label: eventLabel45(e) })) } };
  }
  const last = (ctxOf45(user).items ?? []).filter((x) => x.kind === 'event');
  if (!terms.length && last.length === 1) { const ev = await runAsUser(user, () => findEvent(user, last[0].id)).catch(() => null); if (ev) return { event: ev }; }
  if (!terms.length && ctx.visibleIds?.length === 1) { const ev = upcoming.find((e) => e.id === ctx.visibleIds[0]); if (ev) return { event: ev }; }
  const opts = (last.length > 1 ? upcoming.filter((e) => last.some((x) => x.id === e.id)) : upcoming.filter((e) => e.date >= today)).slice(0, 5);
  return { ask: { question: terms.length ? `Fant ingen avtale som heter «${target.trim()}». Hvilken mener du?` : `Hvilken avtale vil du ${verb}?`, options: opts.map((e) => ({ id: e.id, label: eventLabel45(e) })) }, none: true };
}

/* ---------------- Kontekst mellom moduler ---------------- */

const CTX = 'glimt45_ctx';
const CTX_MS = 30 * 60_000;
export function ctxOf45(user) { const c = kv.get(user, CTX, null); return c && Date.now() - (c.at ?? 0) < CTX_MS ? c : {}; }
export function setCtx45(user, patch) { try { kv.set(user, CTX, { ...ctxOf45(user), ...patch, at: Date.now() }); } catch { /* best effort */ } }

/* ---------------- Gjøremål (hjelpere fra tasks.js) ---------------- */

let T = null;
/** tasks.js gir oss sine egne hjelpere (samme tilgangsregler som resten av /api/tasks). */
export const setTaskHelpers45 = (h) => { T = h; };
const needT = () => { if (!T) throw new Error('Gjøremål er ikke klare'); return T; };
function listByName(user, name) {
  if (!name) return null;
  const n = fold42(name).replace(/^(?:i|på)\s+/, '').replace(/lista$|listen$/, '');
  const all = needT().listsOf(user);
  return all.find((l) => fold42(l.name) === n) ?? all.find((l) => fold42(l.name).startsWith(n.slice(0, 4))) ?? null;
}
const GROCERY = /\b(melk|brød|egg|smør|ost|kaffe|te\b|frukt|banan|epler?|tomat|agurk|kjøttdeig|kylling|laks|pasta|ris|mel|sukker|yoghurt|juice|brus|dopapir|toalettpapir|tørkerull|vaskemiddel|oppvask|bleier|rømme|fløte|pålegg|grønnsaker|poteter?)\b/i;

/* ---------------- Finans ---------------- */

// Omskrivinger søket må forstå («lader» ≈ «USB-C strømadapter»). Utvider synonymene i search42 (de røres ikke).
const ITEM_SYN45 = {
  lader: ['lader', 'ladere', 'adapter', 'strømadapter', 'usb-c', 'usbc', 'ladekabel', 'charger', 'hurtiglader', 'magsafe', 'powerbank'],
  batteri: ['batteri', 'batterier', 'aa', 'aaa', 'knappecelle', 'cr2032', 'duracell', 'energizer', 'varta'],
  kabel: ['kabel', 'ledning', 'usb', 'hdmi', 'skjøteledning'], hodetelefon: ['hodetelefoner', 'øreplugger', 'earbuds', 'airpods', 'headset'],
  lyspære: ['lyspære', 'lyspærer', 'pære', 'led', 'e27', 'gu10'],
};
const itemTerms = (item) => {
  const w = fold42(item).replace(/^(?:den|det|de)\s+(?:nye|gamle)\s+/, '').replace(/^(?:nye|ny|gamle)\s+/, '').trim();
  const st = stem42(w.split(/\s+/).pop() ?? w);
  const extra = Object.entries(ITEM_SYN45).find(([k, v]) => stem42(k) === st || v.some((x) => stem42(x) === st))?.[1] ?? [];
  // Korte stammer («lad») gir falske treff («Circle K Lading»), så bare ord/stammer på minst 4 tegn (eller eksakte synonymer).
  return [...new Set([w, st, ...synonymsOf42(w), ...extra].map((x) => fold42(x)).filter((x) => x && (x.length >= 4 || extra.includes(x))))];
};
const KIND_SQL = { receipt: "s.kind IN ('receipt','line')", transaction: "s.kind='tx'", any: "s.kind IN ('receipt','line','tx')" };

/** Strukturert søk i search_items (transaksjoner, kvitteringer, varelinjer). → {purchases, meta} */
export function financeSearch45(user, p) {
  ensureLedger(user);
  runAsUser(user, () => ensureIndex42(user));
  const w = ['s.user_id=?'], a = [user];
  const meta = { receipts: q('SELECT count(*) FROM fh_receipts WHERE user_id=? AND status NOT IN (\'rejected\')').pluck().get(user) ?? 0, linesIndexed: 0, merchantKnown: null, semantic: false };
  meta.linesIndexed = q("SELECT count(*) FROM search_items WHERE user_id=? AND kind='line'").pluck().get(user) ?? 0;
  if (p.merchant) {
    const mk = merchantKey42(p.merchant);
    const mn = norm42(p.merchant);
    const ids = q('SELECT DISTINCT merchant_id FROM search_items WHERE user_id=? AND (merchant_id=? OR merchant_norm LIKE ? OR merchant_norm LIKE ?)').pluck().all(user, mk.id ?? '', `${mn}%`, `% ${mn}%`).filter(Boolean);
    meta.merchantKnown = ids.length > 0;
    if (!ids.length) return { purchases: [], all: [], meta: { ...meta, merchantUnknown: p.merchant } };
    w.push(`s.merchant_id IN (${ids.map(() => '?').join(',')})`); a.push(...ids);
  }
  if (p.from) { w.push('s.date>=?'); a.push(p.from); }
  if (p.to) { w.push('s.date<=?'); a.push(p.to); }
  if (p.amount != null) { w.push('abs(s.amount) BETWEEN ? AND ?'); a.push(Math.abs(p.amount) - 1, Math.abs(p.amount) + 1); }
  if (p.min != null) { w.push('abs(s.amount)>=?'); a.push(p.min); }
  if (p.max != null) { w.push('abs(s.amount)<=?'); a.push(p.max); }
  if (p.category) { w.push('(lower(s.item_category)=lower(?) OR s.ref IN (SELECT CAST(t.id AS TEXT) FROM fh_transactions t JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND lower(c.name) LIKE lower(?)))'); a.push(p.category, user, `%${p.category}%`); }
  let rows;
  const kindSql = KIND_SQL[p.kind] ?? KIND_SQL.any;
  if (p.item) {
    const terms = itemTerms(p.item);
    const fts = terms.map((x) => `"${x.replace(/"/g, '')}"*`).join(' OR ');
    const like = terms.map(() => '(s.item_norm LIKE ? OR lower(s.item_text) LIKE ?)').join(' OR ');
    const likeArgs = terms.flatMap((x) => [`%${stem42(x).length >= 4 ? stem42(x) : x}%`, `%${x}%`]);
    rows = q(`SELECT s.* FROM search_items s WHERE ${w.join(' AND ')} AND s.kind IN ('line','tx') AND (s.id IN (SELECT rowid FROM search_fts42 WHERE search_fts42 MATCH ?) OR ${like}) ORDER BY s.date DESC LIMIT 300`)
      .all(...a, `{item_norm synonyms} : (${fts})`, ...likeArgs);
    meta.terms = terms;
  } else rows = q(`SELECT s.* FROM search_items s WHERE ${w.join(' AND ')} AND ${kindSql} ORDER BY s.date DESC LIMIT 300`).all(...a);
  // Kjøp: kvittering (med varelinjer) eller transaksjon. Kvittering ↔ transaksjon kobles på tx_id, ellers beløp + dato (±3 d) + butikk.
  const buys = new Map();
  for (const r of rows) {
    const key = r.receipt_id ? `rc:${r.receipt_id}` : `tx:${r.tx_id ?? r.ref}`;
    const cur = buys.get(key) ?? { key, receiptId: r.receipt_id ?? null, txId: r.tx_id ?? null, date: r.date, merchant: r.merchant_display, merchantId: r.merchant_id, amount: null, lines: [] };
    if (r.kind === 'line') cur.lines.push({ text: r.item_text, amount: r.amount });
    if (r.kind === 'receipt' || r.kind === 'tx') cur.amount = r.amount;
    buys.set(key, cur);
  }
  const out = [];
  for (const b of buys.values()) {
    if (b.receiptId) {
      const rc = q('SELECT id, merchant, date, total, transaction_id, file FROM fh_receipts WHERE id=? AND user_id=?').get(b.receiptId, user);
      if (!rc) continue;
      b.amount = rc.total != null ? -rc.total / 100 : b.amount; b.txId = rc.transaction_id ?? b.txId; b.hasFile = !!rc.file;
      if (!b.lines.length) { try { b.allLines = (JSON.parse(q('SELECT extraction FROM fh_receipts WHERE id=?').pluck().get(rc.id) ?? 'null')?.lines ?? []).filter((l) => l?.description).map((l) => ({ text: String(l.description), amount: l.amount != null ? -Math.abs(+l.amount) : null })); } catch { b.allLines = []; } }
    } else if (b.txId) {
      const t = q('SELECT id, amount, date, merchant, description FROM fh_transactions WHERE id=? AND user_id=?').get(b.txId, user);
      if (!t) continue;
      b.amount = t.amount / 100;
      const rc = q("SELECT id FROM fh_receipts WHERE user_id=? AND (transaction_id=? OR (abs(total - ?) <= 100 AND date BETWEEN ? AND ?)) AND status NOT IN ('rejected') LIMIT 1")
        .get(user, t.id, Math.abs(t.amount), addDays45(t.date, -3), addDays45(t.date, 3));
      if (rc) b.receiptId = rc.id;
    }
    out.push(b);
  }
  // Én rad per kjøp: transaksjon som allerede er med via kvitteringen, tas bort.
  const rcTx = new Set(out.filter((x) => x.key.startsWith('rc:') && x.txId).map((x) => x.txId));
  const purchases = out.filter((x) => !(x.key.startsWith('tx:') && rcTx.has(x.txId))).sort((x, y) => (x.date < y.date ? 1 : -1));
  return { purchases: p.kind === 'receipt' ? purchases.filter((x) => x.receiptId) : purchases, all: purchases, meta };
}
/** Semantisk reserve (embeddings) – bare når en lokal Ollama-embeddingmodell er valgt (ingen sky). */
async function semantic45(user, text) {
  let st; try { st = fhSettings(user); } catch { return []; }
  if (!st?.embedModel) return [];
  try {
    const { search } = await import('../finans/search.js');
    const r = await runAsUser(user, () => search(text, { limit: 8 }));
    return (r.hits ?? []).filter((h) => /Lignende innhold/.test(h.reason ?? '')).slice(0, 8);
  } catch { return []; }
}
const purchaseCard = (b) => ({ kind: b.receiptId ? 'receipt' : 'transaction', id: b.receiptId ?? String(b.txId), receiptId: b.receiptId ?? null, txId: b.txId ?? null, title: b.merchant || 'Ukjent butikk',
  subtitle: `${shortDay(b.date)}${b.amount != null ? ` · ${kr45(b.amount)}` : ''}${(b.lines.length ? b.lines : b.allLines ?? []).length ? ` · ${(b.lines.length ? b.lines : b.allLines).slice(0, 2).map((l) => l.text).join(', ')}` : ''}`, date: b.date, amount: b.amount, lines: (b.lines.length ? b.lines : b.allLines ?? []).slice(0, 5), matched: b.lines.length > 0,
  open: b.receiptId ? { web: `/finans/#/kv/${encodeURIComponent(b.receiptId)}`, deepLink: `finanshub://kvittering?id=${encodeURIComponent(b.receiptId)}` } : { web: '/finans/#/transaksjoner', deepLink: 'finanshub://finans' } });

// Kategorier i spørsmålet (samme navn som standardkategoriene i Finans).
const FIN_CATS45 = [[/(?<![a-zæøå])(mat|matvarer|dagligvare\w*|matbutikk)(?![a-zæøå])/, 'Mat og dagligvarer'], [/restaurant|kafé|kafe|take ?away|ute ?spising/, 'Restaurant og kafé'],
  [/transport|lading|bensin|drivstoff|taxi|(?<![a-zæøå])(tog|buss)(?![a-zæøå])/, 'Transport og lading'], [/bolig|husleie|strøm(?!pris)/, 'Bolig'], [/fritid|hobby|trening/, 'Fritid og hobby'], [/abonnement/, 'Abonnementer'], [/(?<![a-zæøå])(skole|bøker)(?![a-zæøå])/, 'Skole']];

/* ---------------- Felles validering ---------------- */

const ask = (question, options = null, field = null) => ({ ask: { question, ...(options ? { options } : {}), ...(field ? { field } : {}) } });
/**
 * Dato/tid for et verktøy: brukerens tekst er fasit når den inneholder dato/tid (koden tolker, ikke modellen).
 * Modellens felt brukes bare når teksten ikke sier noe selv – og da bare hvis feltet er gyldig og kan tolkes av parseren.
 */
function whenFor(args, ctx, prefer = 'future') {
  const w = whenOf45(ctx.text, ctx.today, { prefer, nowMin: ctx.nowMin, timeWithoutDate: 'none' });
  const corrections = [];
  let date = w.date, start = w.start, end = w.end;
  const mDate = str(args.date, 40), mTime = str(args.time ?? args.start, 40), mEnd = str(args.end_time ?? args.end, 40);
  if (!date && mDate) {
    const d = isIsoDate45(mDate) ? { date: mDate } : parseDate45(mDate, ctx.today, { prefer });
    if (d?.date) {
      // Modellen ga en dato teksten ikke nevner: bare godta den hvis den er en tolkning av ord i teksten (f.eks. «til helga»).
      const anyDateWord = /\d|dag\b|morgen|kveld|uke|måned|helg|jul|påske|januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember/i.test(ctx.text);
      if (anyDateWord) { date = d.date; corrections.push('date:model'); }
    }
  } else if (date && mDate && isIsoDate45(mDate) && mDate !== date) corrections.push(`date:${mDate}->${date}`);
  if (!start && mTime) {
    const tm = isHm45(mTime) ? { start: mTime } : parseTime45(mTime);
    if (tm?.start && /\d|kl|klokka|halv|kvart|ett|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti|elleve|tolv/i.test(ctx.text)) { start = tm.start; corrections.push('time:model'); }
  } else if (start && mTime && isHm45(mTime) && mTime !== start && !w.assumedPm) corrections.push(`time:${mTime}->${start}`);
  if (!end && mEnd && start) { const tm = isHm45(mEnd) ? { start: mEnd } : parseTime45(mEnd); if (tm?.start && tm.start > start) end = tm.start; }
  return { ...w, date, start, end, corrections };
}

/* ---------------- Registeret ---------------- */

const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const sTxt = (d) => ({ type: 'string', description: d });
export const TOOLS45 = [
  {
    name: 'calendar.create', module: 'calendar', destructive: false,
    description: 'Opprett en avtale i kalenderen. title = kort ryddig tittel (ikke hele setningen), date/time slik brukeren skrev dem.',
    parameters: S({ title: sTxt('Kort tittel, f.eks. «Kino – Dune», «Tannlege»'), date: sTxt('Dato slik brukeren skrev den («12.10», «fredag», «i morgen») eller YYYY-MM-DD'), time: sTxt('Starttid («12:15», «klokka sju») eller tom'), end_time: sTxt('Sluttid hvis oppgitt'), location: sTxt('Sted hvis oppgitt'), note: sTxt('Ekstra info') }, ['title']),
    async validate(args, ctx) {
      const w = whenFor(args, ctx, 'future');
      if (w.errors.length) return ask(`${w.errors[0].message}. Hvilken dato mener du?`, null, 'date');
      let title = str(args.title, 120);
      // «Glimt husker»-alias, avsender i signaturen («Mvh Påhåret») og «time hos X» har egne regler i parseQuick – de gjenbrukes.
      let aliases = []; try { aliases = (await import('../glimt-memory.js')).aliasesOf(ctx.user); } catch { /* */ }
      const pq = parseQuick(ctx.text, ctx.today, aliases);
      const richPq = !!(pq.memory || pq.business || /(?<![a-zæøå])hos\s/i.test(ctx.text) || (pq.type && pq.type !== 'annet'));
      if (pq.memory) title = pq.title;
      else if (!title || title.length > 60 || normText(title) === normText(ctx.text) || /\d{1,2}[.:/]\d{1,2}|(?<![a-zæøå])(?:kl|klokka|legg til|i kalenderen)(?![a-zæøå])/i.test(title)) title = (richPq ? pq.title : '') || cleanEventTitle45(w.rest) || cleanEventTitle45(title);
      if (!title) return ask('Hva skal avtalen hete?', null, 'title');
      if (!w.date) return ask(`Hvilken dag skal «${title}» være?`, null, 'date');
      const allDay = !w.start;
      const end = w.start ? (w.end ?? addMin45(w.start, pq.type && pq.type !== 'annet' ? pq.duration : durationOf(title))) : null;
      const location = str(args.location, 200) || (richPq ? pq.place : null) || null;
      return { args: { title, date: w.date, start: w.start, end, allDay, location, note: [str(args.note, 500), w.softTime].filter(Boolean).join(' · ') || null, assumedPm: w.assumedPm, corrections: w.corrections } };
    },
    async run(a, ctx) {
      const user = ctx.user;
      // Gjentatt forespørsel / dobbel lagring: samme tittel og tid samme dag finnes allerede → ikke lag en til.
      const same = (await eventsIn(user, a.date, a.date)).find((e) => sameTitle(e.title, a.title) && (a.allDay ? e.allDay : !e.allDay && hmOfEv(e) === a.start));
      if (same) return { status: 'done', result: { event: eventCard45(same), existing: true }, cards: [eventCard45(same)], events: [same] };
      const v = eventInput({ title: a.title, allDay: a.allDay, date: a.date, start: a.start, end: a.end, location: a.location ?? '', calendar: 'privat', repeat: 'none', reminder: a.allDay ? 'none' : '1h', note: a.note ?? '' });
      if (v.error) return { status: 'failed', error: v.error };
      const ev = await runAsUser(user, () => createEvent(user, { ...v.value, origin: 'Glimt' }));
      try { const { attachGeo } = await import('../kal37.js'); if (ev) await attachGeo(user, ev, { place: a.location ?? null, text: ctx.text }); } catch { /* best effort */ }
      broadcast('kalender', { action: 'created', id: ev?.id }, [user]);
      return { status: 'done', result: { event: eventCard45(ev ?? { ...v.value, id: null }), eventId: ev?.id ?? null, undo: ev?.id ? { method: 'DELETE', url: `/api/kalender/events/${encodeURIComponent(ev.id)}` } : null }, cards: ev ? [eventCard45(ev)] : [], events: ev ? [ev] : [] };
    },
    async verify(r, ctx) {
      if (r.result?.existing) return true;
      if (!r.result?.eventId) return false;
      return !!(await runAsUser(ctx.user, () => findEvent(ctx.user, r.result.eventId)).catch(() => null)) || (await eventsIn(ctx.user, r.result.event.date, r.result.event.date)).some((e) => String(e.id).split('~')[0] === String(r.result.eventId).split('~')[0]);
    },
  },
  {
    name: 'calendar.list', module: 'calendar', destructive: false,
    description: 'Hent avtaler i en periode («i morgen», «neste uke», «fredag»).',
    parameters: S({ period: sTxt('Perioden slik brukeren skrev den («neste uke», «i morgen») eller tom for i dag'), from: sTxt('YYYY-MM-DD'), to: sTxt('YYYY-MM-DD') }),
    async validate(args, ctx) {
      const per = parsePeriod45(ctx.text, ctx.today, { prefer: 'future' }) ?? (args.period ? parsePeriod45(str(args.period, 60), ctx.today, { prefer: 'future' }) : null);
      if (per) return { args: { from: per.from, to: per.to, label: per.label } };
      if (isIsoDate45(args.from) && /\d|dag|uke|måned|morgen/.test(ctx.text)) return { args: { from: args.from, to: isIsoDate45(args.to) && args.to >= args.from ? args.to : args.from, label: relDate45(args.from, ctx.today) } };
      return { args: { from: ctx.today, to: ctx.today, label: 'i dag' } };
    },
    async run(a, ctx) {
      const evs = (await eventsIn(ctx.user, a.from, a.to)).filter((e) => (a.from === a.to ? onDay(e, a.from) : e.date >= a.from && e.date <= a.to || (e.allDay && e.date < a.from && (e.end ?? e.date) > a.from))).sort(sortEv);
      return { status: 'done', result: { from: a.from, to: a.to, label: a.label, count: evs.length }, cards: evs.slice(0, 20).map(eventCard45), events: evs };
    },
  },
  {
    name: 'calendar.search', module: 'calendar', destructive: false,
    description: 'Finn kommende (eller tidligere) avtaler som matcher ord, f.eks. «når er neste tannlege».',
    parameters: S({ query: sTxt('Søkeord, f.eks. «tannlege»'), past: { type: 'boolean', description: 'true for «sist», «forrige gang»' } }, ['query']),
    async validate(args, ctx) { const qy = str(args.query, 80); return qy ? { args: { query: qy, past: !!args.past || /\bsist\b|forrige gang/i.test(ctx.text) } } : ask('Hva skal jeg lete etter i kalenderen?'); },
    async run(a, ctx) {
      const terms = termsOf(a.query);
      const evs = (await eventsIn(ctx.user, a.past ? addDays45(ctx.today, -365) : ctx.today, a.past ? ctx.today : addDays45(ctx.today, 365)))
        .filter((e) => terms.length && terms.every((w) => normText(`${e.title} ${e.room ?? ''} ${e.note ?? ''}`).includes(w))).sort(sortEv);
      const list = a.past ? evs.reverse() : evs.filter((e) => (e.allDay ? e.date >= ctx.today : Date.parse(e.end) > Date.now()));
      return { status: 'done', result: { query: a.query, count: list.length }, cards: list.slice(0, 6).map(eventCard45), events: list };
    },
  },
  {
    name: 'calendar.update', module: 'calendar', destructive: false,
    description: 'Flytt eller endre en avtale. target = hvilken avtale («den», «tannlegetimen»), date/time = ny tid.',
    parameters: S({ target: sTxt('Avtalen det gjelder, slik brukeren omtalte den'), target_id: sTxt('Id hvis kjent'), date: sTxt('Ny dato'), time: sTxt('Nytt klokkeslett'), title: sTxt('Ny tittel hvis brukeren vil endre den') }),
    async validate(args, ctx) {
      const r = await resolveEvent45(ctx.user, { targetId: str(args.target_id, 120) || null, target: str(args.target, 80) || targetTextOf(ctx.text), ctx: ctx.context, today: ctx.today, verb: 'flytte' });
      if (r.ask) return r;
      const ev = r.event;
      if (!ev.editable) return { error: 'Skolens hendelser kan ikke endres. Kopier til Privat for å lage din egen.' };
      const w = whenFor(args, { ...ctx, text: ctx.text.replace(/^.*?\b(?:til|på)\b(?=\s)/i, (m) => m.replace(/[^\s]/g, ' ')) }, 'future');
      const w2 = w.date || w.start ? w : whenFor(args, ctx, 'future');
      if (w2.errors.length) return ask(`${w2.errors[0].message}. Hvilken dato mener du?`);
      const title = str(args.title, 120) || null;
      if (!w2.date && !w2.start && !title) return ask(`Når vil du flytte «${ev.title}» til?`);
      const date = w2.date ?? ev.date, start = w2.start ?? hmOfEv(ev);
      const end = ev.allDay && !w2.start ? null : addMin45(start, durMin(ev) || 60);
      return { args: { id: ev.id, title: title ?? ev.title, date, start: ev.allDay && !w2.start ? null : start, end, allDay: ev.allDay && !w2.start, prev: eventCard45(ev) } };
    },
    async run(a, ctx) {
      const patch = { title: a.title, date: a.date, allDay: a.allDay, ...(a.allDay ? {} : { start: a.start, end: a.end }), endDate: null };
      const ev = await runAsUser(ctx.user, () => updateEvent(ctx.user, a.id, patch));
      broadcast('kalender', { action: 'updated', id: ev?.id ?? a.id }, [ctx.user]);
      return { status: 'done', result: { event: ev ? eventCard45(ev) : null, from: a.prev, eventId: ev?.id ?? a.id }, cards: ev ? [eventCard45(ev)] : [], events: ev ? [ev] : [] };
    },
    async verify(r, ctx) { const e = r.result?.event; if (!e) return false; return (await eventsIn(ctx.user, e.date, e.date)).some((x) => String(x.id).split('~')[0] === String(r.result.eventId).split('~')[0] && x.date === e.date); },
  },
  {
    name: 'calendar.delete', module: 'calendar', destructive: true,
    description: 'Slett en avtale (krever bekreftelse).',
    parameters: S({ target: sTxt('Avtalen det gjelder'), target_id: sTxt('Id hvis kjent') }),
    async validate(args, ctx) {
      const r = await resolveEvent45(ctx.user, { targetId: str(args.target_id, 120) || null, target: str(args.target, 80) || targetTextOf(ctx.text), ctx: ctx.context, today: ctx.today, verb: 'slette' });
      if (r.ask) return r;
      if (!r.event.editable) return { error: 'Skolens hendelser kan ikke slettes.' };
      return { args: { id: r.event.id, event: eventCard45(r.event) }, summary: `Slette «${r.event.title}» ${longDate45(r.event.date, ctx.today)}${r.event.allDay ? '' : ` kl. ${hmOfEv(r.event)}`}?` };
    },
    async run(a, ctx) { await runAsUser(ctx.user, () => deleteEvent(ctx.user, a.id)); broadcast('kalender', { action: 'deleted', id: a.id }, [ctx.user]); return { status: 'done', result: { deleted: a.event } }; },
    async verify(r, ctx) { return !(await runAsUser(ctx.user, () => findEvent(ctx.user, r.result.deleted.id)).catch(() => null)); },
  },
  {
    name: 'tasks.create', module: 'tasks', destructive: false,
    description: 'Lag en oppgave/påminnelse i Gjøremål. title = selve oppgaven («Kjøpe melk»), due = dag, note = «etter skolen» o.l.',
    parameters: S({ title: sTxt('Oppgaven, kort («Kjøpe melk»)'), due: sTxt('Dag slik brukeren skrev den, eller tom'), time: sTxt('Klokkeslett hvis oppgitt'), note: sTxt('Tidsangivelse uten klokkeslett («etter skolen») eller annen info'), list: sTxt('Liste hvis nevnt («Handel», «Hytta»)') }, ['title']),
    async validate(args, ctx) {
      const w = whenFor({ date: args.due, time: args.time }, ctx, 'future');
      if (w.errors.length) return ask(`${w.errors[0].message}. Hvilken dag mener du?`);
      let title = str(args.title, 200);
      if (!title || normText(title) === normText(ctx.text) || TASK_LEAD.test(title) || /(?<![a-zæøå])(i morgen|i dag|neste uke|kl\.?|klokka)(?![a-zæøå])/i.test(title)) title = cleanTaskTitle45(w.rest) || cleanTaskTitle45(title);
      if (!title) return ask('Hva skal jeg minne deg på?');
      const soft = w.softTime && !new RegExp(w.softTime, 'i').test(title) ? w.softTime : null;
      const note = [str(args.note, 300), soft].filter(Boolean).filter((x, i, arr) => arr.findIndex((y) => normText(y) === normText(x)) === i).join(' · ') || null;
      const listName = str(args.list, 40) || (/(?<![a-zæøå])(handleliste|handlelista|handle)(?![a-zæøå])/i.test(ctx.text) ? 'Handel' : null);
      return { args: { title, due: w.date ?? null, time: w.start ?? null, note, list: listName, remind: /minn|påminn|husk/i.test(ctx.text), ...(w.dateKind === 'week' ? { dueLabel: 'neste uke' } : {}) } };
    },
    async run(a, ctx) {
      const h = needT();
      let listId;
      const named = listByName(ctx.user, a.list) ?? (!a.list && GROCERY.test(a.title) ? listByName(ctx.user, 'Handel') : null);
      if (named) listId = named.id;
      if (!listId && ctx.context?.listId && h.canSeeList(h.listRow(ctx.context.listId), ctx.user)) listId = ctx.context.listId;
      // Gjentatt: samme åpne oppgave med samme frist finnes allerede.
      const dup = h.q(`SELECT * FROM hl_tasks WHERE done=0 AND archived_at IS NULL AND ${h.VISIBLE} AND lower(title)=lower(@t) AND coalesce(due,'')=@d`).get({ u: ctx.user, t: a.title, d: a.due ?? '' });
      if (dup) return { status: 'done', result: { task: taskCard(h.itemOut(dup)), existing: true }, cards: [taskCard(h.itemOut(dup))] };
      const t = h.cleanTask({ title: a.title, ...(listId ? { list: listId } : {}), ...(a.due ? { due: a.due } : {}), ...(a.time ? { time: a.time } : {}), ...(a.note ? { note: a.note } : {}), ...(a.time && a.remind ? { early: '15m' } : {}), glimt: true }, false, ctx.user, listId ?? h.defaultList(ctx.user));
      const row = h.insertTask(ctx.user, t);
      const item = h.itemOut(row);
      const list = h.listRow(row.list);
      return { status: 'done', result: { task: taskCard(item), taskId: row.id, list: list ? { id: list.id, name: list.name } : null, undo: { method: 'DELETE', url: `/api/tasks/${row.id}` } }, cards: [taskCard(item)] };
    },
    async verify(r) { if (r.result?.existing) return true; const row = needT().byId(r.result?.taskId); return !!row && !row.done; },
  },
  {
    name: 'tasks.list', module: 'tasks', destructive: false,
    description: 'Vis oppgaver: i dag, forfalte eller alle åpne.',
    parameters: S({ filter: { type: 'string', enum: ['today', 'overdue', 'open', 'week'], description: 'Hvilke oppgaver' } }),
    async validate(args, ctx) { const f = ['today', 'overdue', 'open', 'week'].includes(args.filter) ? args.filter : /forfalt/i.test(ctx.text) ? 'overdue' : /i dag|igjen/i.test(ctx.text) ? 'today' : /uk(e|a|en)/i.test(ctx.text) ? 'week' : 'open'; return { args: { filter: f } }; },
    async run(a, ctx) {
      const h = needT();
      const rows = h.q(`SELECT * FROM hl_tasks WHERE done=0 AND archived_at IS NULL AND ${h.VISIBLE}`).all({ u: ctx.user }).map(h.itemOut);
      const t = ctx.today, wEnd = addDays45(t, 6);
      const list = rows.filter((x) => (a.filter === 'overdue' ? x.due && x.due < t : a.filter === 'today' ? x.due && x.due <= t : a.filter === 'week' ? x.due && x.due <= wEnd : true))
        .sort((x, y) => ((x.due ?? '9999') < (y.due ?? '9999') ? -1 : (x.due ?? '9999') > (y.due ?? '9999') ? 1 : x.createdAt - y.createdAt));
      return { status: 'done', result: { filter: a.filter, count: list.length, overdue: list.filter((x) => x.due && x.due < t).length }, cards: list.slice(0, 12).map(taskCard), tasks: list };
    },
  },
  {
    name: 'tasks.complete', module: 'tasks', destructive: false,
    description: 'Kryss av en oppgave som ferdig.',
    parameters: S({ target: sTxt('Oppgaven det gjelder'), target_id: sTxt('Id hvis kjent') }),
    async validate(args, ctx) {
      const h = needT();
      const id = Number(args.target_id ?? ctx.context?.selectedId);
      if (Number.isInteger(id) && id > 0) { const row = h.byId(id); if (row && h.canSeeTask(row, ctx.user)) return { args: { id, title: row.title } }; }
      const terms = termsOf(str(args.target, 80) || targetTextOf(ctx.text).replace(/^(?:kryss av|ferdig med|jeg har)\s+/i, ''));
      const rows = h.q(`SELECT * FROM hl_tasks WHERE done=0 AND archived_at IS NULL AND ${h.VISIBLE}`).all({ u: ctx.user }).filter((r) => terms.length && terms.every((w) => normText(r.title).includes(w)));
      if (rows.length === 1) return { args: { id: rows[0].id, title: rows[0].title } };
      if (rows.length > 1) return ask('Hvilken oppgave er ferdig?', rows.slice(0, 5).map((r) => ({ id: String(r.id), label: r.title })));
      return ask('Hvilken oppgave er ferdig?');
    },
    async run(a, ctx) {
      const h = needT(); const cur = h.byId(a.id);
      h.q('UPDATE hl_tasks SET done=1, done_at=?, done_by=?, updated_at=? WHERE id=?').run(Date.now(), ctx.user, Date.now(), a.id);
      const row = h.byId(a.id); h.send(h.audienceOfTask(row), 'updated', { item: h.itemOut(row) }); try { h.haLocal?.('updated', cur, row); } catch { /* */ }
      return { status: 'done', result: { task: taskCard(h.itemOut(row)), taskId: a.id }, cards: [taskCard(h.itemOut(row))] };
    },
    async verify(r) { return !!needT().byId(r.result.taskId)?.done; },
  },
  {
    name: 'finance.search', module: 'finance', destructive: false,
    description: 'Finn kjøp, kvitteringer og transaksjoner: butikk, beløp, periode, kategori og varer på kvitteringen.',
    parameters: S({ merchant: sTxt('Butikk/forhandler, f.eks. «Elkjøp»'), item: sTxt('Vare, f.eks. «batterier», «lader»'), amount: { type: 'number', description: 'Eksakt beløp i kroner' }, min: { type: 'number' }, max: { type: 'number' },
      period: sTxt('Periode slik brukeren skrev den («forrige måned»)'), category: sTxt('Kategori'), kind: { type: 'string', enum: ['receipt', 'transaction', 'any'] } }),
    async validate(args, ctx) {
      const per = parsePeriod45(ctx.text, ctx.today, { prefer: 'past' }) ?? (args.period ? parsePeriod45(str(args.period, 60), ctx.today, { prefer: 'past' }) : null);
      const am = parseAmount45(ctx.text);
      const merchant = str(args.merchant, 60) || merchantOf45(ctx.text);
      let item = str(args.item, 60) || itemOf45(ctx.text, merchant);
      if (item && merchant && normText(item) === normText(merchant)) item = '';
      const kind = ['receipt', 'transaction', 'any'].includes(args.kind) ? args.kind : /kvittering/i.test(ctx.text) ? 'receipt' : 'any';
      const a = { merchant: merchant || null, item: item || null, amount: am?.amount ?? (Number.isFinite(+args.amount) && /\d/.test(ctx.text) ? +args.amount : null), min: am?.min ?? null, max: am?.max ?? null,
        from: per?.from ?? null, to: per?.to ?? null, label: per?.label ?? null, category: str(args.category, 40) || null, kind };
      if (!a.merchant && !a.item && a.amount == null && a.min == null && !a.from && !a.category) return ask('Hva leter du etter – butikk, vare, beløp eller periode?');
      return { args: a };
    },
    async run(a, ctx) {
      const r = financeSearch45(ctx.user, a);
      let purchases = r.purchases, semantic = [];
      if (!purchases.length && a.item) semantic = await semantic45(ctx.user, a.item);
      return { status: 'done', result: { count: purchases.length, filters: a, meta: r.meta, semantic: semantic.length, withoutReceipt: a.kind === 'receipt' ? (r.all.length - purchases.length) : 0 },
        cards: [...purchases.slice(0, 10).map(purchaseCard), ...semantic.map((h) => ({ kind: h.type === 'tx' ? 'transaction' : 'receipt', id: String(h.id), title: h.description ?? h.merchant ?? 'Treff', subtitle: `${h.date ?? ''} · lignende innhold`, date: h.date ?? null, amount: h.amount ?? null, semantic: true }))],
        purchases };
    },
  },
  {
    name: 'finance.summary', module: 'finance', destructive: false,
    description: 'Regn ut forbruk fra faktiske transaksjoner: totalt, per kategori eller per butikk i en periode («hva brukte jeg mest penger på forrige måned»).',
    parameters: S({ period: sTxt('Periode slik brukeren skrev den'), group_by: { type: 'string', enum: ['category', 'merchant', 'total'] }, category: sTxt('Bare én kategori') }),
    async validate(args, ctx) {
      const per = parsePeriod45(ctx.text, ctx.today, { prefer: 'past' }) ?? (args.period ? parsePeriod45(str(args.period, 60), ctx.today, { prefer: 'past' }) : null)
        ?? { from: `${ctx.today.slice(0, 8)}01`, to: ctx.today, label: `i ${MON45[+ctx.today.slice(5, 7) - 1]}` };
      const g = ['category', 'merchant', 'total'].includes(args.group_by) ? args.group_by : /butikk|hvor\s+(?:har|handlet)|forhandler/i.test(ctx.text) ? 'merchant' : /mest|kategori|hva\s+brukte/i.test(ctx.text) ? 'category' : 'total';
      const cat = str(args.category, 40) || FIN_CATS45.find(([re]) => re.test(ctx.text.toLowerCase()))?.[1] || null;
      return { args: { from: per.from, to: per.to, label: per.label, group_by: cat && g === 'category' && !/mest/i.test(ctx.text) ? 'total' : g, category: cat } };
    },
    async run(a, ctx) {
      ensureLedger(ctx.user);
      const rows = q(`SELECT t.amount, t.date, coalesce(nullif(t.merchant,''), t.description) AS name, coalesce(c.name, 'Ukategorisert') AS cat FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id
        WHERE t.user_id=? AND t.date BETWEEN ? AND ? AND t.amount < 0 AND coalesce(c.kind, 'expense') = 'expense' ${a.category ? 'AND lower(c.name) LIKE lower(?)' : ''}`).all(ctx.user, a.from, a.to, ...(a.category ? [`%${a.category}%`] : []));
      const total = rows.reduce((s, r) => s - r.amount, 0) / 100;
      const groups = new Map();
      for (const r of rows) { const k = a.group_by === 'merchant' ? (r.name || 'Ukjent') : r.cat; const g = groups.get(k) ?? { name: k, amount: 0, count: 0 }; g.amount -= r.amount / 100; g.count++; groups.set(k, g); }
      const top = [...groups.values()].sort((x, y) => y.amount - x.amount).map((g) => ({ ...g, amount: Math.round(g.amount * 100) / 100 }));
      const biggest = [...rows].sort((x, y) => x.amount - y.amount).slice(0, 3).map((r) => ({ name: r.name || 'Ukjent', amount: Math.round(-r.amount) / 100, date: r.date }));
      return { status: 'done', result: { from: a.from, to: a.to, label: a.label, total: Math.round(total * 100) / 100, count: rows.length, groupBy: a.group_by, category: a.category, top: top.slice(0, 5), biggest },
        cards: top.slice(0, 5).map((g) => ({ kind: a.group_by === 'merchant' ? 'merchant' : 'category', id: g.name, title: g.name, subtitle: `${kr45(g.amount)} · ${g.count} kjøp`, amount: -g.amount })) };
    },
  },
  {
    name: 'nav.open', module: 'home', destructive: false,
    description: 'Åpne en side i appen (bare når brukeren ber om å åpne/gå til en side).',
    parameters: S({ target: { type: 'string', enum: ['kalender', 'huskeliste', 'finans', 'kvitteringer', 'budsjett', 'abonnement', 'vaer', 'familie', 'mat', 'bursdager', 'chat', 'innstillinger', 'sporing', 'domener', 'rom', 'nordlys'] } }, ['target']),
    async validate(args) { return args.target ? { args: { target: String(args.target) } } : ask('Hvilken side vil du åpne?'); },
    async run(a) { return { status: 'done', result: { target: a.target } }; },
  },
  {
    name: 'app.answer', module: 'home', destructive: false,
    description: 'Vær, avganger (Ruter), pakker, sol, hvor familien er, prøveperioder, «Glimt husker», neste time hos X, ledig tid og fag – de eksisterende Glimt-svarene.',
    parameters: S({ topic: { type: 'string', enum: ['weather', 'departures', 'packages', 'sun', 'family', 'trial', 'memory', 'calendar_next', 'free_time', 'school', 'other'] } }),
    async validate(args) { return { args: { topic: args.topic ?? 'other' } }; },
    async run() { return { status: 'done', result: { legacy: true } }; },
  },
  {
    name: 'chat.answer', module: 'chat', destructive: false,
    description: 'Vanlig spørsmål eller samtale uten data fra appen.',
    parameters: S({}),
    async validate() { return { args: {} }; },
    async run() { return { status: 'done', result: { legacy: true, chat: true } }; },
  },
];
export const TOOL45 = Object.fromEntries(TOOLS45.map((t) => [t.name, t]));
const taskCard = (x) => ({ kind: 'task', id: String(x.id), title: x.title, subtitle: [x.due ? shortDay(x.due) : null, x.time, x.note].filter(Boolean).join(' · ') || null, date: x.due ?? null, time: x.time ?? null, done: !!x.done, list: x.list ?? null });

/** Ollama tool-definisjoner (/api/chat tools). */
export const ollamaTools45 = (names = null) => TOOLS45.filter((t) => !names || names.includes(t.name)).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
/** Registeret for GET /api/glimt/agent/tools. */
export const registryOut45 = () => TOOLS45.map((t) => ({ name: t.name, module: t.module, description: t.description, destructive: t.destructive, parameters: t.parameters }));

/* ---------------- Små uttrekk (brukes av validering og lokal plan) ---------------- */

/** «flytt tannlegetimen til fredag» → «tannlegetimen». */
export function targetTextOf(text) {
  return String(text ?? '').replace(/^\s*(?:kan du\s+)?(?:flytt|endre|utsett|forskyv|bytt|slett|fjern|avlys|kanseller)\s+/i, '').split(/\s+(?:til|på|fra|kl\.?|klokka)\s+/i)[0]
    .replace(/(?<![a-zæøå])(?:den|det|avtalen|timen|hendelsen|møtet)(?![a-zæøå])/gi, ' ').replace(/[?.!]/g, ' ').replace(/\s+/g, ' ').trim();
}
const MERCH_STOP = /^(?:meg|deg|oss|det|den|dette|kvittering\w*|nett|butikken|butikk|jobb|skolen|ferie|forrige|denne|neste|i|for|siste)$/i;
/** Butikk i teksten: «hos Clas Ohlson», «fra Elkjøp», «på Elkjøp». */
export function merchantOf45(text) {
  const m = /(?<![a-zæøå])(?:hos|fra|på|i)\s+((?:[A-ZÆØÅ][\p{L}\d&.'-]*)(?:\s+(?:[A-ZÆØÅ][\p{L}\d&.'-]*|og|&))*)/u.exec(String(text ?? ''));
  if (m && !MERCH_STOP.test(m[1]) && !/^(?:Januar|Februar|Mars|April|Mai|Juni|Juli|August|September|Oktober|November|Desember)$/.test(m[1])) return m[1].replace(/\s+(?:og|&)$/, '').trim();
  const known = /(?<![a-zæøå])(elkjøp|clas ohlson|power|xxl|ikea|kiwi|rema(?: 1000)?|coop(?: extra| prix| mega| obs)?|meny|spar|joker|biltema|jula|europris|normal|vinmonopolet|apotek(?:et)? 1|vitusapotek|komplett|netonnet|obs bygg|maxbo|byggmakker|jernia|zara|h&m|cubus|dressmann|sport ?1|intersport|g-?sport|narvesen|7-eleven|circle k|esso|shell|uno-x|ruter|vy|sas|norwegian|amazon|temu|zalando|apple|kjell)(?![a-zæøå])/i.exec(String(text ?? ''));
  return known ? known[1].replace(/(^|\s)(\p{L})/gu, (x, a, c) => a + c.toUpperCase()) : '';
}
/** Vare i teksten: «kvitteringer med batterier», «der jeg kjøpte batterier», «for den nye laderen». */
export function itemOf45(text, merchant = '') {
  const t = String(text ?? '').toLowerCase();
  const m = /(?:kvittering(?:en|er|ene)?\s+(?:med|for|på)\s+|der\s+jeg\s+kjøpte\s+|jeg\s+kjøpte\s+(?!for\b|på\b|hos\b|i\b)|kjøpt\s+|for\s+(?:den|det|de)\s+(?:nye\s+|gamle\s+)?)([\p{L}\d -]{2,40}?)(?=\s+(?:hos|fra|på|i|forrige|denne|siste|for)\b|[?.!,]|$)/u.exec(t);
  if (!m) return '';
  let w = m[1].trim();
  for (let i = 0; i < 3; i++) w = w.replace(/^(?:en|et|ei|noen|den|det|de|nye|ny|gamle)\s+/, '').trim();
  w = w.replace(/^(\p{L}{4,})en$/u, '$1');
  if (!w || /^(?:det|noe|meg|for|på|hos)$/.test(w) || (merchant && normText(w) === normText(merchant))) return '';
  return w;
}
