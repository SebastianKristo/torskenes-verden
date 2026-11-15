// Glimt: «Sist jeg var på X» – finans før minne. Mellomvaren foran POST /api/glimt/agent svarer uten LLM, og minne-svar på
// setninger som ikke er eksplisitte minner byttes ut. Finans-søket (/finans/api/search/ask) bruker lastVisitSpecial52.
// Her ligger også migreringen av lagrede kvitteringsvalg (Gemini/Groq er tatt ut av kvitteringslesingen), som kjøres når fila
// lastes. Før i srv52.js; mellomvaren monteres fra mountGlimtEarly (glimt/index.js).
import { q, kv, OWNER } from '../db.js';
import { runAsUser } from '../settings.js';
import { osloTodayISO } from '../dates/quick.js'; // dato og tid fra den felles tolkeren
import { matchMerchant, filePath as libraryFile } from '../logos/match.js';

const DAY = 86_400_000;
const NO_STORE = { 'Cache-Control': 'no-store' };
const hasTable = (t) => !!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const nb2 = (n) => new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\s/g, ' ');
const krText = (n) => `${nb2(n)} kr`;
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON_S = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const WD_S = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
const dOf = (ymd) => new Date(`${ymd}T12:00:00Z`);
const daysBetween = (a, b) => Math.round((dOf(b) - dOf(a)) / DAY);
const longDate = (ymd) => { const d = dOf(ymd); return `${WD[d.getUTCDay()]} ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`; };
const shortDate = (ymd) => { const d = dOf(ymd); return `${WD_S[d.getUTCDay()]} ${d.getUTCDate()}. ${MON_S[d.getUTCMonth()]}`; };

/** aiTasks.receipts 'gemini'/'groq' → 'ollama', receipts48.gemini fjernes. Idempotent. → {changed, from} */
export function migrateReceipts52() {
  try {
    const st = kv.get(OWNER, 'fh_settings', null);
    if (!st || typeof st !== 'object') return { changed: false };
    let changed = false, from = null;
    const next = { ...st };
    if (next.aiTasks && typeof next.aiTasks === 'object' && next.aiTasks.receipts && next.aiTasks.receipts !== 'ollama') {
      from = next.aiTasks.receipts; next.aiTasks = { ...next.aiTasks, receipts: 'ollama' }; changed = true;
    }
    if (next.receipts48 && typeof next.receipts48 === 'object' && 'gemini' in next.receipts48) {
      const { gemini, ...rest } = next.receipts48; void gemini; next.receipts48 = rest; changed = true;
    }
    if (changed) { kv.set(OWNER, 'fh_settings', next); console.info(`[kvittering] prompt 52: lagrede valg migrert – kvitteringer leses bare lokalt${from ? ` (aiTasks.receipts ${from} → ollama)` : ''}`); }
    return { changed, from };
  } catch (e) { console.warn('[kvittering] migrering (prompt 52):', e.message); return { changed: false, error: e.message }; }
}
migrateReceipts52();

/** «jem & fix», «Jem og Fix», «JEM&FIX» → «jemogfix». */
export function normMerchant52(s) {
  return String(s ?? '').toLowerCase().replace(/&/g, ' og ').replace(/[^\p{L}\p{N}]+/gu, '').trim();
}
/** Damerau-Levenshtein (optimal string alignment). */
export function dlev52(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}

// Eksplisitte minnemønstre. Alt annet er aldri minne.
const MEM_PREFIX52 = /^(?:husk\s+at|husk:|noter\s+at|lagre\s+at)\s*\S/i;
const MEM_ROLE52 = /^\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?\s+er\s+(\p{L}+)\s+(min|mitt|mine)\b/u;
const NOT_MEM52 = /^(?:sist|når|hvor|hva|hvilke|hvilken|har\s+jeg|vis)\b/i;
/** true bare for «husk at …», «husk: …», «noter at …», «lagre at …» og «<Navn> er <rolle> min/mitt/mine». */
export function isExplicitMemory52(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t || /\?\s*$/.test(t) || NOT_MEM52.test(t)) return false;
  return MEM_PREFIX52.test(t) || MEM_ROLE52.test(t);
}
const LAST_VISIT_RE52 = /^(sist|forrige gang|når var)( jeg)?( var| handlet| kjøpte)?( jeg)? (på|hos|i) (.+?)\??$/i;
/** «Sist jeg var på jem & fix» → {type:'last_visit', merchant:'jem & fix'} | null */
export function parseLastVisit52(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  const m = t.match(LAST_VISIT_RE52);
  if (!m) return null;
  const merchant = m[6].replace(/\?+$/, '').trim();
  if (!merchant || merchant.length > 60) return null;
  // «sist jeg var på butikken i går» o.l. uten navn er ikke en butikk.
  if (/^(?:butikken|butikk|jobb(?:en)?|skolen|hjemme|ferie)$/i.test(merchant)) return null;
  return { type: 'last_visit', merchant };
}

const titleCase = (s) => (/^[\p{Lu}\d\s&.'-]+$/u.test(s) && /\p{Lu}{3,}/u.test(s) ? s.toLowerCase().replace(/(^|[\s&.-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s);
const BANK_PREFIX52 = /^(?:vipps\s*\*|klarna\s*\*|sumup\s*\*|iz\s*\*|zettle_?\s*\*|sq\s*\*|nets\s*\*|paypal\s*\*|varekjøp\s+|varekjop\s+|kortkjøp\s+|visa\s+)/i;
const cleanName52 = (s) => titleCase(String(s ?? '').replace(BANK_PREFIX52, '').replace(/\s+\d{3,}.*$/, '').replace(/\s+\d{2}\.\d{2}.*$/, '').trim());

/** Brukerens kjøp per butikknavn (transaksjoner ut + kvitteringer). → Map(key → {name, rows:[{date, amount, receiptId, txId}]}) */
function purchasesByMerchant52(u) {
  const map = new Map();
  const add = (rawName, row) => {
    const name = cleanName52(rawName);
    const key = normMerchant52(name);
    if (!key || key.length < 2) return;
    const cur = map.get(key) ?? { key, name, rows: [] };
    if (row.receiptId && !/^[\p{Lu}\d\s&.'-]+$/u.test(name)) cur.name = name; // kvitteringens navn er penere enn banktekst
    cur.rows.push(row);
    map.set(key, cur);
  };
  if (hasTable('fh_receipts')) {
    for (const r of q("SELECT id, merchant, date, total, transaction_id FROM fh_receipts WHERE user_id=? AND merchant IS NOT NULL AND merchant<>'' AND status NOT IN ('rejected','failed') AND date IS NOT NULL").all(u)) {
      add(r.merchant, { date: r.date, amount: r.total != null ? r.total / 100 : null, receiptId: r.id, txId: r.transaction_id ?? null });
    }
  }
  if (hasTable('fh_transactions')) {
    const withRc = new Set([...map.values()].flatMap((m) => m.rows.map((x) => x.txId)).filter(Boolean));
    for (const t of q("SELECT id, date, amount, merchant, description FROM fh_transactions WHERE user_id=? AND amount<0").all(u)) {
      if (withRc.has(t.id)) continue;
      add(t.merchant || t.description, { date: t.date, amount: Math.abs(t.amount) / 100, receiptId: null, txId: t.id });
    }
  }
  return map;
}
/** Butikkmatch: eksakt → startsWith → Damerau-Levenshtein ≤ 2. → {hits:[entry], how} */
function matchMerchants52(map, query) {
  const qk = normMerchant52(query);
  if (!qk) return { hits: [], how: null };
  const all = [...map.values()];
  let hits = all.filter((m) => m.key === qk);
  if (hits.length) return { hits, how: 'exact' };
  hits = all.filter((m) => m.key.startsWith(qk) || (qk.length >= 4 && qk.startsWith(m.key) && m.key.length >= 4));
  if (hits.length) return { hits, how: 'prefix' };
  hits = all.filter((m) => dlev52(m.key, qk) <= 2 || (m.key.length > qk.length && dlev52(m.key.slice(0, qk.length), qk) <= (qk.length >= 7 ? 2 : 1)));
  return { hits, how: hits.length ? 'fuzzy' : null };
}
function suggestions52(map, query, n = 3) {
  const qk = normMerchant52(query);
  return [...map.values()].map((m) => ({ m, d: Math.min(dlev52(m.key, qk), dlev52(m.key.slice(0, qk.length + 2), qk)) }))
    .filter((x) => x.d <= Math.max(3, Math.ceil(qk.length / 2))).sort((a, b) => a.d - b.d || b.m.rows.length - a.m.rows.length).slice(0, n).map((x) => x.m.name);
}
const logoOf52 = (name) => {
  let m = null; try { m = matchMerchant(name); } catch { /* registeret mangler */ }
  return m?.id && libraryFile(m.id) ? { id: m.id, url: `/finans/api/logos/file/${m.id}`, color: m.farge ?? null } : null;
};

/** Svar uten LLM. → {intent, reply, text, last_visit, results, actions, cards, hits} */
export function lastVisit52(u, text, { today = osloTodayISO() } = {}) {
  const p = parseLastVisit52(text);
  if (!p) return null;
  const map = purchasesByMerchant52(u);
  const { hits } = matchMerchants52(map, p.merchant);
  const rows = hits.flatMap((h) => h.rows.map((r) => ({ ...r, name: h.name }))).filter((r) => r.date && r.date <= today).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.receiptId ? 1 : 0) - (a.receiptId ? 1 : 0)));
  const base = { intent: 'last_visit', module: 'finance', engine: 'lokal', source: 'Transaksjoner', sourceLabel: 'leste transaksjoner og kvitteringer' };
  if (!rows.length) {
    const sug = suggestions52(map, p.merchant);
    const reply = `Fant ingen kjøp på «${p.merchant}».${sug.length ? ` Mente du ${sug.map((s) => `**${s}**`).join(' eller ')}?` : ''}`;
    return { ...base, reply, text: reply, last_visit: { merchant: null, merchant_query: p.merchant, date: null, weekday: null, days_ago: null, amount: null, amount_text: null, receipt_id: null, tx_id: null, logo: null, suggestions: sug },
      results: [], cards: [], hits: 0, actions: [{ tool: 'finance.last_visit', status: 'done', args: { merchant: p.merchant } }] };
  }
  const last = rows[0];
  const sameDay = rows.filter((r) => r.date === last.date && r.name === last.name);
  const amount = Math.round(sameDay.reduce((s, r) => s + (r.amount ?? 0), 0) * 100) / 100;
  const ago = daysBetween(last.date, today);
  const agoText = ago === 0 ? 'i dag' : ago === 1 ? 'i går' : `${ago} dager siden`;
  const logo = logoOf52(last.name);
  const reply = `Sist du var på **${last.name}** var **${longDate(last.date)}** (${agoText}).${amount ? ` Du handlet for ${krText(amount)}.` : ''}`;
  const card = { kind: last.receiptId ? 'receipt' : 'transaction', id: last.receiptId ?? String(last.txId), title: last.name, subtitle: `${shortDate(last.date)}${amount ? ` · ${krText(amount)}` : ''}`,
    date: last.date, amount: -amount, receiptId: last.receiptId ?? null, txId: last.txId ?? null, logo,
    open: last.receiptId ? { web: `/finans/#/kv/${encodeURIComponent(last.receiptId)}`, deepLink: `finanshub://kvittering?id=${encodeURIComponent(last.receiptId)}` } : { web: '/finans/#/transaksjoner', deepLink: 'finanshub://finans' } };
  return { ...base, reply, text: reply, last_visit: { merchant: last.name, merchant_query: p.merchant, date: last.date, weekday: WD[dOf(last.date).getUTCDay()], days_ago: ago, amount, amount_text: amount ? krText(amount) : null,
    receipt_id: last.receiptId ?? null, tx_id: last.txId ?? null, logo, suggestions: [] }, results: [card], cards: [card], hits: rows.length, count: rows.length,
    actions: [{ tool: 'finance.last_visit', status: 'done', args: { merchant: p.merchant } }] };
}

/** Mellomvare foran POST /api/glimt/agent: «sist jeg var på X» svares her (uten LLM), og minne-svar på ikke-eksplisitte setninger byttes ut. */
export async function glimtAgentMw52(c, next) {
  if (c.req.method !== 'POST') return next();
  const b = await c.req.json().catch(() => null);
  const text = typeof (b?.text ?? b?.q) === 'string' ? String(b.text ?? b.q).trim() : '';
  const u = c.get('user');
  if (text && text.length <= 1000 && u && !b?.preview && !isExplicitMemory52(text)) {
    const t0 = Date.now();
    const lv = parseLastVisit52(text) ? runAsUser(u, () => lastVisit52(u, text)) : null;
    if (lv) return c.json({ requestId: b?.requestId ?? null, ...lv, ms: Date.now() - t0 }, 200, NO_STORE);
  }
  await next();
  // Planleggeren valgte minne for en setning som ikke er et eksplisitt minne → aldri minnehjelp-teksten.
  try {
    if (!text || isExplicitMemory52(text) || !c.res?.ok) return;
    const j = await c.res.clone().json().catch(() => null);
    const mem = j?.actions?.find?.((a) => a?.tool === 'memory.save');
    if (!mem || mem.status === 'done') return;
    const reply = 'Jeg er ikke helt sikker på hva du mener. Vil du at jeg skal huske noe, start med «husk at …».';
    c.res = new Response(JSON.stringify({ ...j, reply, text: reply, intent: 'ask', actions: [], results: [], memoryBlocked52: true }), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' } });
  } catch { /* svaret står som det er */ }
}

/** Finans-søket (/finans/api/search/ask): special-krok – «sist jeg var på X» får samme svar. → svar i ask42-form | null */
export function lastVisitSpecial52(u, text) {
  const r = lastVisit52(u, text);
  if (!r) return null;
  return { intent: 'last_visit', text: r.reply.replace(/\*\*/g, ''), markdown: r.reply, cards: r.cards, hits: r.hits, last_visit: r.last_visit, source: r.source, sourceLabel: r.sourceLabel };
}

