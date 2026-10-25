// Prompt 52 (SRV52): serverdelen av prompt 52. API-formene står i $S/SERVER52-API.md (seksjon SRV52) og i docs/server-52.md.
//
//   Glimt «sist jeg var på X»   – finans-intent før minne (mellomvare foran POST /api/glimt/agent + special i Finans-søket)
//   POST /api/glimt/quickparse52 {text, now?, ai?}     → regel + AI-svar for kalenderbeskjeder (ai-gate, 5 s, think:false)
//   GET/POST /api/glimt/lex52 · DELETE /api/glimt/lex52/:from   → lærte ord (rettede navn/steder) per bruker
//   GET  /api/brief52                                   → de ni brief-kortene for innlogget bruker (filtrert på tilgang)
//   POST /api/brief52/homelab/:id/start                 → «Start» (bare admin; start/omstart via Docker-proxyen)
//   GET/PUT /api/admin/brief52/access                   → hvem som er barn / har Homelab, Domener, Aksjer (bare admin)
//   GET/PUT /api/me/glimt-char52 · GET /api/admin/glimt-char52 · PUT /api/admin/glimt-char52/:userId
//   POST /finans/api/logos52/batch {names} · GET /finans/api/logos52/match?q=   (monteres i finans/routes.js-treet via mountLogos52)
//
// Sikkerhet: alt er per bruker (finansdata, lærte ord, brief). Homelab-start er bare for admin og bruker bare de faste handlingene
// i Docker-proxyen (start/restart). AI-kall går via ai-run/ai-gate (lokal modell, localOnly). Logoer kommer bare fra logobiblioteket
// og logoer serveren allerede har lagret – aldri eksterne oppslag.
import { Hono } from 'hono';
import { db, kv, OWNER } from './db.js';
import { authOrToken } from './mobile.js';
import { userInfo, listUsers, isAdmin } from './auth.js';
import { runAsUser } from './settings.js';
import { parseQuick, osloTodayISO } from '../public/js/quick-time.js';
import { CHARS, glimtSettingsOf, cleanGlimtPatch, saveGlimtSettings, charDefaultOf52, setCharDefault52, CHAR_META52 } from './glimt35.js';
import { matchMerchant, filePath as libraryFile } from './logos/match.js';

const q = (sql) => db.prepare(sql);
const DAY = 86_400_000;
const NO_STORE = { 'Cache-Control': 'no-store' };
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const bad = (c, error, status = 400) => c.json({ error }, status, NO_STORE);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const hasTable = (t) => !!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const withTimeout = (p, ms, fallback = null) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((res) => { setTimeout(() => res(fallback), ms); })]);
const firstName = (u) => { const x = userInfo(u); return String(x?.displayName || x?.name || x?.username || '').trim().split(/\s+/)[0] || null; };
const nb2 = (n) => new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\s/g, ' ');
const nb0 = (n) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(n).replace(/\s/g, ' ');
const krText = (n) => `${nb2(n)} kr`;
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON_S = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const WD_S = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
const dOf = (ymd) => new Date(`${ymd}T12:00:00Z`);
const addDays = (ymd, n) => new Date(dOf(ymd).getTime() + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((dOf(b) - dOf(a)) / DAY);
const longDate = (ymd) => { const d = dOf(ymd); return `${WD[d.getUTCDay()]} ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`; };
const shortDate = (ymd) => { const d = dOf(ymd); return `${WD_S[d.getUTCDay()]} ${d.getUTCDate()}. ${MON_S[d.getUTCMonth()]}`; };
const osloHm = (t = Date.now()) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));

/* =====================================================================================================================
   1. Kvitteringer: migrering av lagrede valg (Gemini er tatt helt ut av kvitteringslesingen)
   ===================================================================================================================== */

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

/* =====================================================================================================================
   2. Glimt: «Sist jeg var på X» – finans før minne
   ===================================================================================================================== */

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

/* =====================================================================================================================
   3. Kalenderkontekst: regel først, så AI (ai-gate, 5 s)
   ===================================================================================================================== */

const STOP52 = new Set(['møte', 'mote', 'lunsj', 'middag', 'frokost', 'kaffe', 'kino', 'fest', 'med', 'på', 'hos', 'til', 'i', 'og', 'kl', 'klokka', 'time', 'avtale', 'trening', 'fotball',
  'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag', 'morgen', 'dag', 'kveld', 'neste', 'uke', 'ha', 'skal', 'jeg', 'vi', 'har', 'en', 'et', 'ei', 'den', 'det', 'for',
  'om', 'etter', 'før', 'fra', 'hjemme', 'jobb', 'jobben', 'skole', 'skolen', 'tannlege', 'lege', 'frisør', 'bursdag', 'date', 'tur', 'handle', 'handling', 'møtet']);
const NAMES52 = ['Anna', 'Anne', 'Astrid', 'Emma', 'Emil', 'Eva', 'Hanne', 'Ida', 'Ingrid', 'Jonas', 'Kari', 'Karin', 'Kristian', 'Laila', 'Lars', 'Linn', 'Maja', 'Marius', 'Martin', 'Mia',
  'Nina', 'Nora', 'Ola', 'Ole', 'Per', 'Pål', 'Rune', 'Sara', 'Sebastian', 'Sofie', 'Silje', 'Thomas', 'Tone', 'Tor', 'Tuva', 'Vilde', 'Arild', 'Henrik', 'Jakob', 'Magnus', 'Mari', 'Marte'];
const PLACES52 = ['Olivia', 'Egon', 'Peppes', 'Starbucks', 'Espresso House', 'Kaffebrenneriet', 'Vapiano', 'Burger King', 'Joe & The Juice', 'Steen & Strøm', 'Storo', 'Majorstuen', 'Aker Brygge', 'Grünerløkka', 'Sats', 'Elixia'];
const INTRO52 = /^(?:(?:husk\s+at|minn\s+meg\s+på\s+at)\s+)?(?:(?:jeg|vi)\s+(?:skal|har|må)(?:\s+(?:ha|på|til))?\s+|legg\s+inn\s+|sett\s+opp\s+)/i;
const CAL_WORDS52 = /\b(møte|mote|lunsj|middag|frokost|kaffe|kino|fest|time|avtale|trening|date|konsert|bursdag|tannlege|lege|frisør)\b/i;

const lexOf52 = (u) => (kv.get(u, 'glimt_lex52', []) ?? []).filter((x) => x && x.from && x.to);
/** Ordforrådet: navn (Bursdager, familie, vanlige fornavn, lærte) og steder (kalenderen, kjente, lærte). */
async function vocab52(u, today) {
  const people = new Set(NAMES52), places = new Set(PLACES52);
  try { for (const x of listUsers()) { const n = firstName(x.id); if (n) people.add(n); } } catch { /* */ }
  try { if (hasTable('birthdays')) for (const r of q('SELECT name FROM birthdays WHERE user_id=? LIMIT 400').all(u)) { const n = String(r.name).trim().split(/\s+/)[0]; if (n) people.add(n); } } catch { /* */ }
  try {
    const { eventsFor } = await import('./calendar.js');
    const ev = await withTimeout(runAsUser(u, () => eventsFor(u, addDays(today, -120), addDays(today, 30))), 1500, { events: [] });
    for (const e of ev?.events ?? []) { const l = String(e.location || e.room || '').split(',')[0].trim(); if (l && l.length <= 40) places.add(l); }
  } catch { /* kalenderen er valgfri */ }
  const lex = lexOf52(u);
  for (const x of lex) (x.kind === 'place' ? places : people).add(x.to);
  return { people: [...people], places: [...places], lex };
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Retter ett ord mot ordforrådet: ≤ 1 for 4–6 tegn, ≤ 2 for 7+. → {to, kind} | null */
function fixWord52(w, voc) {
  const lw = w.toLowerCase();
  if (lw.length < 4 || STOP52.has(lw) || /\d/.test(lw)) return null;
  const learned = voc.lex.find((x) => x.from.toLowerCase() === lw);
  if (learned) return { to: learned.to, kind: learned.kind ?? 'person' };
  const max = lw.length >= 7 ? 2 : 1;
  let best = null;
  for (const [list, kind] of [[voc.people, 'person'], [voc.places, 'place']]) {
    for (const cand of list) {
      if (cand.includes(' ')) continue;
      const lc = cand.toLowerCase();
      if (lc === lw) return { to: cand, kind, exact: true };
      if (Math.abs(lc.length - lw.length) > max) continue;
      const d = dlev52(lw, lc);
      if (d <= max && (!best || d < best.d)) best = { to: cand, kind, d };
    }
  }
  return best;
}
/** Regelparseren (QCX.pre → QP → QCX.post). */
export async function ruleParse52(u, text, { today = osloTodayISO(), voc = null } = {}) {
  voc ??= await vocab52(u, today);
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const asked = /\?\s*$/.test(t) || /^(?:hva|hvem|hvor|når|hvordan|hvilk\w*|kan du|er det)\b/i.test(t);
  const huske = /^(?:husk|kjøp|ikke glem|noter)\b/i.test(t) && !CAL_WORDS52.test(t);
  t = t.replace(INTRO52, '');
  const fixes = [], people = [];
  t = t.split(' ').map((w) => {
    const m = w.match(/^([\p{L}'-]+)([.,!?]*)$/u);
    if (!m) return w;
    const f = fixWord52(m[1], voc);
    if (!f) return w;
    if (!f.exact) fixes.push({ from: m[1], to: f.to, kind: f.kind });
    if (f.kind === 'person' && !people.includes(f.to)) people.push(f.to);
    return f.to + m[2];
  }).join(' ');
  // Sted: «på/hos X» (også med liten bokstav), men ikke dager og tider.
  let location = null;
  const lm = t.match(/\s(?:på|hos)\s+((?:[\p{L}][\p{L}'&.-]*)(?:\s+(?:&\s+)?[\p{Lu}][\p{L}'&.-]*){0,3})(?=\s+(?:kl\.?|klokka|i\s+dag|i\s+morgen|på\s|neste|om\s|\d)|[.,!?]?$)/u);
  if (lm && !/^(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|dagen|kvelden|morgenen|jobb(?:en)?|skolen|tirsdager)$/i.test(lm[1])) {
    location = cap(lm[1]);
    t = t.replace(lm[0], ' ').replace(/\s+/g, ' ').trim();
  }
  const pq = parseQuick(t, today);
  if (!location && pq.place) location = cap(pq.place);
  let title = cap(String(pq.title || t).replace(location ? new RegExp(`\\s(?:på|hos)\\s+${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : /$^/, '').replace(/\s+/g, ' ').trim());
  const type = asked ? 'spørsmål' : huske ? 'huske' : (CAL_WORDS52.test(t) || pq.isAppointment || pq.date || pq.start) ? 'kalender' : 'annet';
  const start = pq.start ?? null;
  const end = pq.end ?? (start ? endOf(start) : null);
  return { type, title, date: pq.date ?? (type === 'kalender' ? today : null), start, end, location, people, allDay: !start && type === 'kalender', fixes };
}
const endOf = (hm) => { const [h, m] = hm.split(':').map(Number); const x = (h * 60 + m + 60) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

export const QUICK_SCHEMA52 = { type: 'object', properties: { type: { type: 'string', enum: ['kalender', 'huske', 'spørsmål', 'annet'] }, title: { type: 'string' }, date: { type: ['string', 'null'] },
  start: { type: ['string', 'null'] }, end: { type: ['string', 'null'] }, location: { type: ['string', 'null'] }, people: { type: 'array', items: { type: 'string' } } }, required: ['type', 'title'] };
let quickAi52 = null; // tester: (prompt, {schema}) → data
export const _setQuickAi52 = (fn) => { quickAi52 = fn; };
export const QUICK_AI_MS52 = { ms: 5000 };
function quickPrompt52(text, { today, now, voc }) {
  const d = dOf(today);
  return [
    'Tolk en kort norsk beskjed til en kalender-/huskeassistent. Svar KUN med JSON etter skjemaet {type,title,date,start,end,location,people[]}.',
    'type: kalender (avtale/hendelse), huske (huskeliste/gjøremål), spørsmål, eller annet. title: kort tittel med stor forbokstav, uten innledning («jeg skal ha») og uten sted.',
    'Rett skrivefeil i navn og steder mot listene under. date: YYYY-MM-DD (mangler dato for kalender → i dag). start/end: HH:MM eller null (start uten slutt → slutt = start + 1 t). location: stedet uten «på/hos».',
    `I dag: ${WD[d.getUTCDay()]} ${today}, klokka ${now}.`,
    `Kjente personer: ${voc.people.slice(0, 80).join(', ')}.`,
    `Tidligere steder: ${voc.places.slice(0, 60).join(', ')}.`,
    `Beskjed: «${text}»`,
  ].join('\n');
}
const YMD = /^\d{4}-\d{2}-\d{2}$/, HMR = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanAi52(x) {
  if (!x || typeof x !== 'object' || typeof x.title !== 'string' || !x.title.trim()) return null;
  const type = ['kalender', 'huske', 'spørsmål', 'annet'].includes(x.type) ? x.type : 'annet';
  return { type, title: cap(clean(x.title, 120)), date: YMD.test(x.date ?? '') ? x.date : null, start: HMR.test(x.start ?? '') ? x.start : null, end: HMR.test(x.end ?? '') ? x.end : null,
    location: x.location ? cap(clean(x.location, 80)) || null : null, people: Array.isArray(x.people) ? x.people.map((p) => cap(clean(p, 40))).filter(Boolean).slice(0, 8) : [] };
}
/** → svaret til POST /api/glimt/quickparse52 */
export async function quickParse52(u, text, { now = Date.now(), ai = true } = {}) {
  const t0 = Date.now();
  const today = osloTodayISO(new Date(now));
  const voc = await vocab52(u, today);
  const rule = await ruleParse52(u, text, { today, voc });
  let aiOut = null, aiMs = null, model = null, timedOut = false, aiError = null;
  if (ai) {
    const ta = Date.now();
    const prompt = quickPrompt52(text, { today, now: osloHm(now), voc });
    const call = quickAi52 ? Promise.resolve().then(() => quickAi52(prompt, { schema: QUICK_SCHEMA52 })).then((data) => ({ data, model: 'test' }))
      : import('./ai-run.js').then(({ run }) => run('glimt', { user: u, prompt, schema: QUICK_SCHEMA52, json: true, think: false, numCtx: 2048, numPredict: 220, temperature: 0,
        timeoutMs: QUICK_AI_MS52.ms, localOnly: true, title: 'Glimt · kalenderbeskjed', noRetry: true })).then((r) => ({ data: r.data ?? (() => { try { return JSON.parse(r.text); } catch { return null; } })(), model: r.model }));
    const TIMEOUT = Symbol('timeout');
    const r = await Promise.race([call.catch((e) => ({ error: e })), new Promise((res) => { setTimeout(() => res(TIMEOUT), QUICK_AI_MS52.ms); })]);
    aiMs = Date.now() - ta;
    if (r === TIMEOUT) { timedOut = true; aiError = `Glimt svarte ikke innen ${Math.round(QUICK_AI_MS52.ms / 1000)} s`; }
    else if (r?.error) aiError = 'Glimt kunne ikke tolke beskjeden akkurat nå';
    else { aiOut = cleanAi52(r?.data); model = r?.model ?? null; if (!aiOut) aiError = 'Glimt ga et ufullstendig svar'; }
  }
  const pick = aiOut ? { ...rule, ...aiOut, date: aiOut.date ?? rule.date ?? (aiOut.type === 'kalender' ? today : null), start: aiOut.start ?? rule.start, end: aiOut.end ?? (aiOut.start ? endOf(aiOut.start) : rule.end),
    location: aiOut.location ?? rule.location, people: aiOut.people.length ? aiOut.people : rule.people } : rule;
  const { fixes, ...result } = pick; void fixes;
  const dl = result.date ? (result.date === today ? 'i dag' : result.date === addDays(today, 1) ? 'i morgen' : longDate(result.date)) : null;
  return { text, rule, ai: aiOut, result: { ...result, date_label: dl, time_label: result.start ? `${result.start}${result.end ? `–${result.end}` : ''}` : null },
    source: aiOut ? 'ai' : 'rule', ai_ms: aiMs, ms: Date.now() - t0, model, timed_out: timedOut, ai_error: aiError };
}
export function learnWord52(u, b) {
  const from = clean(b.from, 40), to = clean(b.to, 60);
  if (!from || !to || from.length < 2) return { error: 'Forventet {from, to}' };
  const kind = b.kind === 'place' ? 'place' : 'person';
  const list = lexOf52(u).filter((x) => x.from.toLowerCase() !== from.toLowerCase());
  const old = lexOf52(u).find((x) => x.from.toLowerCase() === from.toLowerCase());
  list.unshift({ from, to, kind, n: (old?.to === to ? old.n ?? 1 : 0) + 1, at: Date.now() });
  kv.set(u, 'glimt_lex52', list.slice(0, 300));
  return { words: lexOf52(u) };
}

/* =====================================================================================================================
   4. Brief-kort per innlogget bruker
   ===================================================================================================================== */

const ACCESS_KEY52 = 'brief52_access';
export function briefAccess52() {
  const a = kv.get(OWNER, ACCESS_KEY52, {}) ?? {};
  const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && userInfo(x)) : []);
  return { children: ids(a.children), homelab: ids(a.homelab), domains: ids(a.domains), stocks: ids(a.stocks) };
}
export const isChild52 = (u) => briefAccess52().children.includes(u);
const mediaOk52 = async (u) => { try { const { mediaAllowed43 } = await import('./media43.js'); return mediaAllowed43(u); } catch { return isAdmin(u); } };
const CARDS52 = [['focus', '1b', 'Dagens fokus'], ['trip', '3b', 'Min reise'], ['todo', '4a', 'Huskeliste'], ['bills', '2a', 'Regninger'], ['clothes', '9b', 'Klær'],
  ['tonight', '5b', 'Nytt i kveld'], ['homelab', '6a', 'Homelab'], ['domains', '7a', 'Domener'], ['stocks', '8b', 'Aksjer']];
/** Hvilke kort brukeren får. → {allowed:Set, hidden:[{id, reason}]} */
export async function briefCardsFor52(u) {
  const admin = isAdmin(u), acc = briefAccess52(), child = acc.children.includes(u) && !admin;
  const media = await mediaOk52(u);
  const hidden = [];
  const allowed = new Set();
  for (const [id] of CARDS52) {
    let why = null;
    if (child && ['bills', 'tonight', 'homelab', 'domains', 'stocks'].includes(id)) why = 'child';
    else if (id === 'tonight' && !media) why = 'access';
    else if (['homelab', 'domains', 'stocks'].includes(id) && !admin && !acc[id].includes(u)) why = 'access';
    if (why) hidden.push({ id, reason: why }); else allowed.add(id);
  }
  return { allowed, hidden, admin, child };
}
const kindNow52 = (t = Date.now()) => { const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)); return h < 5 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 22 ? 'evening' : 'night'; };
const GREET52 = { morning: 'God morgen', day: 'Hei', evening: 'God kveld', night: 'God natt' };

function clothesOf52(w) {
  if (!w?.now) return null;
  const t = w.now.temp, lo = w.lo ?? t, rain = !!w.umbrella;
  const items = [];
  if (lo <= 0) items.push('vinterjakke', 'lue', 'votter'); else if (lo <= 7) items.push('varm jakke', 'lue'); else if (lo <= 14) items.push('lett jakke'); else items.push('t-skjorte');
  if (rain) items.unshift('regnjakke');
  const text = rain ? `${cap(items[0])}${items[1] ? ` og ${items[1]}` : ''} i dag – det blir regn${w.rainFrom ? ` fra ${w.rainFrom}` : ''}.` : `${cap(items.join(', ').replace(/, ([^,]*)$/, ' og $1'))} i dag.`;
  return { temp: t, hi: w.hi ?? null, lo: w.lo ?? null, rain, text, items, place: w.place ?? null, cond: w.cond ?? null };
}
function billsOf52(u, today) {
  const items = [];
  const horizon = addDays(today, 14);
  try {
    if (hasTable('fh_subscriptions')) for (const s of q("SELECT name, price, next_date FROM fh_subscriptions WHERE user_id=? AND active=1 AND next_date IS NOT NULL AND next_date>=? AND next_date<=? ORDER BY next_date LIMIT 20").all(u, today, horizon)) {
      items.push({ name: s.name, amount: Math.abs(s.price ?? 0) / 100, due: s.next_date });
    }
  } catch { /* */ }
  try {
    if (hasTable('fh_recurring')) for (const r of q('SELECT name, amount, interval, day, month FROM fh_recurring WHERE user_id=? AND active=1').all(u)) {
      const due = nextDue52(r, today);
      if (due && due <= horizon && !items.some((x) => x.name === r.name && x.due === due)) items.push({ name: r.name, amount: Math.abs(r.amount ?? 0) / 100, due });
    }
  } catch { /* */ }
  items.sort((a, b) => a.due.localeCompare(b.due));
  const list = items.slice(0, 5).map((x) => ({ ...x, amount_text: krText(x.amount), days: daysBetween(today, x.due), due_label: x.due === today ? 'i dag' : x.due === addDays(today, 1) ? 'i morgen' : shortDate(x.due) }));
  const sum = Math.round(items.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  return { items: list, count: items.length, sum, sum_text: krText(sum) };
}
function nextDue52(r, today) {
  const [y, m, d] = today.split('-').map(Number);
  const day = Math.max(1, Math.min(28, +r.day || 1));
  const pad = (n) => String(n).padStart(2, '0');
  if (r.interval === 'weekly') return null;
  if (r.interval === 'yearly') { const mm = +r.month || 1; let cand = `${y}-${pad(mm)}-${pad(day)}`; if (cand < today) cand = `${y + 1}-${pad(mm)}-${pad(day)}`; return cand; }
  let cand = `${y}-${pad(m)}-${pad(day)}`;
  if (cand < today) { const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y; cand = `${ny}-${pad(nm)}-${pad(day)}`; }
  return cand;
}
async function homelabOf52(u) {
  const { containers51 } = await import('./obs51/health.js');
  const ct = await withTimeout(containers51(), 4000, null);
  if (!ct) return { error: 'Docker svarte ikke' };
  if (!ct.available) return { ok: 0, down: 0, services: [], error: ct.error ?? 'Docker-proxyen er ikke satt opp' };
  const admin = isAdmin(u);
  const services = ct.items.map((x) => {
    const state = x.state !== 'running' ? (x.state === 'restarting' ? 'restarting' : 'exited') : x.health === 'unhealthy' ? 'unhealthy' : 'running';
    return { id: x.id, name: x.name, state, health: x.health ?? null, can_start: admin && !x.self && (state === 'exited' || state === 'unhealthy'), action: state === 'unhealthy' ? 'restart' : state === 'exited' ? 'start' : null };
  });
  return { ok: services.filter((s) => s.state === 'running').length, down: services.filter((s) => s.state !== 'running').length, total: services.length, services: services.slice(0, 24) };
}
async function domainsOf52() {
  const D = await import('./domains.js');
  const o = D.domainOverview();
  const items = o.items.slice(0, 8).map((x) => ({ name: x.name, up: x.up, ms: x.ms, ssl_days: o.expiringSoon.find((e) => e.name === x.name)?.days ?? null }));
  return { total: o.total, up: o.up, down: o.down, warn: o.expiringSoon.length + o.down, items, expiring: o.expiringSoon };
}
async function stocksOf52(u) {
  const { cachedStocks } = await import('./finans/stocks.js');
  const s = cachedStocks(u);
  if (!s) return null;
  const sum = s.summary ?? {};
  const value = sum.total ?? sum.value ?? sum.totalValue ?? null;
  const pct = sum.ppl != null && value ? Math.round((sum.ppl / Math.max(1, value - sum.ppl)) * 1000) / 10 : sum.changePct ?? null;
  const items = (s.positions ?? []).slice().sort((a, b) => Math.abs(b.pplPct ?? b.changePct ?? 0) - Math.abs(a.pplPct ?? a.changePct ?? 0)).slice(0, 4)
    .map((p) => ({ name: p.name ?? p.ticker, ticker: p.ticker ?? null, change_pct: p.pplPct ?? p.changePct ?? null, value: p.value ?? null }));
  return { value, value_text: value != null ? `${nb0(value)} kr` : null, change_pct: pct, items, synced_at: s.syncedAt ? new Date(s.syncedAt).toISOString() : null, status: s.status ?? null };
}
async function tonightOf52(today) {
  const { upcoming43 } = await import('./media43.js');
  const up = await withTimeout(upcoming43(1), 4000, null);
  if (!up) return { items: [], error: 'Media svarte ikke' };
  const items = (up.items ?? []).filter((x) => x.date === today).slice(0, 5).map((x) => ({ title: x.title, subtitle: [x.code, x.episodeTitle].filter(Boolean).join(' · ') || null, time: x.time || null, kind: x.kind, poster: x.poster ?? null }));
  return { items, count: items.length, configured: up.configured !== false };
}
async function tripOf52(u) {
  const { myTrip41 } = await import('./ruter41.js');
  const t = await withTimeout(myTrip41(u), 4000, null);
  if (!t || t.empty || !t.options?.length) return null;
  const now = Date.now();
  return { label: t.label, from: t.from, to: t.to, items: t.options.slice(0, 3).map((o) => { const l = o.legs?.find((x) => x.mode !== 'foot') ?? o.legs?.[0] ?? {}; return { line: l.line ?? null, mode: l.mode ?? null, from: l.from ?? null, dest: o.via ?? l.to ?? null, dep: l.dep ?? null, arr: o.arr ?? null, in_min: l.dep ? Math.max(0, Math.round((Date.parse(l.dep) - now) / 60000)) : null, badges: o.badges ?? [] }; }), alert: t.alert ?? null, source: t.source ?? null };
}
export async function brief52(u, { t = Date.now() } = {}) {
  const today = osloTodayISO(new Date(t));
  const { allowed, hidden, admin, child } = await briefCardsFor52(u);
  const kind = kindNow52(t);
  const name = firstName(u);
  let b = null;
  try { const { buildBrief } = await import('./brief34.js'); b = await withTimeout(runAsUser(u, () => buildBrief(u, { t, llm: false })), 6000, null); } catch { b = null; }
  const safe = async (fn) => { try { return await fn(); } catch (e) { return { __error: e?.message ?? String(e) }; } };
  const tasks = {
    focus: async () => {
      if (!b) return null;
      const ev = b.events ?? [];
      const todayEv = ev.filter((e) => e.date === today);
      const next = b.next ? { title: b.next.title, time: b.next.time, label: b.next.label, in_min: b.next.inMin } : null;
      const top = (b.todos?.items ?? [])[0]?.title ?? null;
      const text = todayEv.length ? `${todayEv.length === 1 ? 'Én avtale' : `${todayEv.length} avtaler`} i dag${next ? ` · neste: ${next.title} kl. ${next.time}` : ''}.` : top ? `Ingen avtaler i dag. Viktigst: ${top}.` : 'Ingen avtaler i dag.';
      return { text, count: todayEv.length, next, events: todayEv.slice(0, 3).map((e) => ({ title: e.title, time: e.time, place: e.place })), top_task: top };
    },
    trip: () => tripOf52(u),
    todo: async () => { const td = b?.todos ?? null; return td ? { top: (td.items ?? []).slice(0, 3).map((x) => ({ id: x.id ?? null, title: x.title, due: x.due ?? null, overdue: !!x.overdue })), open: td.count ?? (td.items ?? []).length, overdue: td.overdue ?? 0, text: td.text ?? null } : null; },
    bills: () => runAsUser(u, () => billsOf52(u, today)),
    clothes: async () => clothesOf52(b?.weather),
    tonight: () => tonightOf52(today),
    homelab: () => homelabOf52(u),
    domains: () => domainsOf52(),
    stocks: () => stocksOf52(u),
  };
  const ids = CARDS52.filter(([id]) => allowed.has(id));
  const datas = await Promise.all(ids.map(([id]) => safe(tasks[id])));
  const cards = [];
  ids.forEach(([id, variant, title], i) => {
    let data = datas[i];
    let error = null;
    if (data && data.__error) { error = 'Ingen data akkurat nå'; data = null; }
    if (data?.error && !error) error = data.error;
    if (id === 'trip' && !data && !error) { hidden.push({ id, reason: 'none' }); return; }
    cards.push({ id, variant, title, data: data ?? null, ...(error || !data ? { error: error ?? 'Ingen data akkurat nå' } : {}) });
  });
  const gs = glimtSettingsOf(u);
  return { user: { id: u, name: firstName(u), first: name, admin, child }, greeting: `${GREET52[kind]}${name ? `, ${name}` : ''}`, kind, date: today, date_label: longDate(today), glimt_char: gs.char, cards, hidden };
}

/* 5. Butikklogoer for lister: se logos52.js (egen modul uten tunge avhengigheter, montert i finans/routes.js). */
export { localLogo52, mountLogos52 } from './logos52.js';

/* =====================================================================================================================
   Ruter
   ===================================================================================================================== */

const adminOnly = async (c, next) => { if (!isAdmin(c.get('user'))) return bad(c, 'Bare administratorer kan gjøre dette', 403); await next(); };
const charsOut52 = () => CHARS.map((x) => ({ ...x, ...(CHAR_META52[x.id] ?? {}) }));
const charOut52 = (u) => {
  const own = kv.get(u, 'glimt35_settings', null)?.char;
  const def = charDefaultOf52(u);
  const s = glimtSettingsOf(u);
  return { char: s.char, source: own ? 'user' : def ? 'default' : 'standard', default: def, chars: charsOut52() };
};
export const srv52Api = new Hono();
// NB: authOrToken per rute (ikke use('*')): ruteren monteres på /api og skal ikke treffe andre /api-ruter.
const A = authOrToken;

srv52Api.post('/glimt/quickparse52', A, async (c) => {
  const b = await body(c);
  const text = clean(b.text ?? b.q, 500);
  if (!text) return bad(c, 'Skriv en beskjed');
  const now = b.now && Number.isFinite(Date.parse(b.now)) ? Date.parse(b.now) : Date.now();
  return c.json(await quickParse52(c.get('user'), text, { now, ai: b.ai !== false }), 200, NO_STORE);
});
srv52Api.get('/glimt/lex52', A, (c) => c.json({ words: lexOf52(c.get('user')) }, 200, NO_STORE));
srv52Api.post('/glimt/lex52', A, async (c) => {
  const r = learnWord52(c.get('user'), await body(c));
  return r.error ? bad(c, r.error) : c.json({ ok: true, ...r });
});
srv52Api.delete('/glimt/lex52/:from', A, (c) => {
  const u = c.get('user'), from = decodeURIComponent(c.req.param('from')).toLowerCase();
  kv.set(u, 'glimt_lex52', lexOf52(u).filter((x) => x.from.toLowerCase() !== from));
  return c.json({ ok: true, words: lexOf52(u) });
});

srv52Api.get('/brief52', A, async (c) => c.json(await brief52(c.get('user')), 200, NO_STORE));
srv52Api.post('/brief52/homelab/:id/start', A, adminOnly, async (c) => {
  const id = String(c.req.param('id') ?? '').slice(0, 80);
  const [{ containers51 }, { docker51, docker52 }] = await Promise.all([import('./obs51/health.js'), import('./logs44.js')]);
  const ct = await containers51({ force: true });
  if (!ct.available) return bad(c, ct.error ?? 'Docker-proxyen er ikke satt opp', 503);
  const x = ct.items.find((i) => i.id === id || i.name === id);
  if (!x) return bad(c, 'Fant ikke tjenesten', 404);
  if (x.self) return bad(c, 'Homelab kan ikke starte seg selv herfra', 409);
  const action = x.state !== 'running' ? 'start' : x.health === 'unhealthy' ? 'restart' : null;
  if (!action) return bad(c, `${x.name} kjører allerede`, 409);
  try {
    const r = action === 'start' ? await docker52.start(x.name) : await docker51.restart(x.name);
    console.log(`docker.${action} container=${x.name} by=${c.get('user')} (brief52)`);
    return c.json({ ok: true, id: x.id, name: x.name, action, state: action === 'start' ? 'starting' : 'restarting', message: r?.message ?? null });
  } catch (e) { return bad(c, e.message ?? 'Kunne ikke starte tjenesten', e.status ?? 502); }
});
srv52Api.get('/admin/brief52/access', A, adminOnly, (c) => c.json({ ...briefAccess52(), users: listUsers().map((x) => ({ id: x.id, name: x.displayName || x.name || x.username, role: x.role })) }, 200, NO_STORE));
srv52Api.put('/admin/brief52/access', A, adminOnly, async (c) => {
  const b = await body(c);
  const cur = briefAccess52();
  for (const k of ['children', 'homelab', 'domains', 'stocks']) {
    if (b[k] === undefined) continue;
    if (!Array.isArray(b[k]) || b[k].some((x) => typeof x !== 'string' || !userInfo(x))) return bad(c, `${k} må være en liste med bruker-id-er`);
    cur[k] = [...new Set(b[k])];
  }
  kv.set(OWNER, ACCESS_KEY52, cur);
  return c.json({ ...briefAccess52(), users: listUsers().map((x) => ({ id: x.id, name: x.displayName || x.name || x.username, role: x.role })) });
});

srv52Api.get('/me/glimt-char52', A, (c) => c.json(charOut52(c.get('user')), 200, NO_STORE));
srv52Api.put('/me/glimt-char52', A, async (c) => {
  const u = c.get('user'), b = await body(c);
  const { next, errors } = cleanGlimtPatch({ char: b.char }, glimtSettingsOf(u));
  if (errors.length || typeof b.char !== 'string') return bad(c, errors[0] ?? 'Forventet {char}');
  saveGlimtSettings(u, next);
  return c.json(charOut52(u));
});
srv52Api.get('/admin/glimt-char52', A, adminOnly, (c) => c.json({ users: listUsers().map((x) => ({ id: x.id, name: x.displayName || x.name || x.username, ...(({ chars, ...r }) => r)(charOut52(x.id)) })), chars: charsOut52() }, 200, NO_STORE));
srv52Api.put('/admin/glimt-char52/:userId', A, adminOnly, async (c) => {
  const id = c.req.param('userId');
  if (!userInfo(id)) return bad(c, 'Fant ikke brukeren', 404);
  const b = await body(c);
  if (b.default !== null && (typeof b.default !== 'string' || !CHARS.some((x) => x.id === b.default))) return bad(c, 'default må være en figur-id eller null');
  setCharDefault52(id, b.default);
  const { chars, ...r } = charOut52(id); void chars;
  return c.json({ ok: true, user: { id, name: firstName(id), ...r } });
});

/** Monteres i index.js før /api-rutene med requireAuth, og mellomvaren foran /api/glimt/agent. */
export function mountSrv52(app) {
  app.post('/api/glimt/agent', authOrToken, glimtAgentMw52);
  app.route('/api', srv52Api);
}
