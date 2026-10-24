// Prompt 40 (SERVER40): Finans – «Lagt til»-linja, rediger alt (med historikk), «Les på nytt» og Glimt-søk med kort.
// Montert under /finans/api FØR routes.js (index.js via api40.js). Mellomvarene slipper forespørselen videre til routes.js
// (samme tilgang: økt eller token med riktige rettigheter) og legger til det nye etterpå.
//
// GET   /finans/api/transactions/:id          → som før + history:[{at, by, byName, changes:[{field, label, old, new}], text}], added (alltid, også i lista)
// POST  /finans/api/transactions               → som før; created_by = brukeren, created_via fra X-Homelab-Via (glimt|shortcut) eller API-nøkkelen
// PATCH /finans/api/transactions/:id {date?, amount?, type?, description?, merchant?|counterparty?, categoryId?|category?(navn), accountId?|account?(navn),
//                                       note?, tags?:[…], folderId?(deling), receiptId?, lines?:[{description|name, amount|price}]}
//        → transaksjonen + tags, lines, lineCheck:{sum, total, ok, text}, added (med edited), history, changes (det som ble endret nå)
// POST  /finans/api/transactions/:id/reread {engine?:'gemini'|'tesseract'} → «✦ La Glimt lese kvitteringen på nytt» = prompt 39 reanalyze
//        (apply:false – ingenting lagres før «Bruk endringene» = POST /finans/api/receipts/:rid/reanalyze/apply)
//        → {receiptId, jobId?, changes:[{field, label, old, new}], lines_new:[…], total_ok, noChanges, text, candidateId?, …reanalyze-svaret}
// POST  /finans/api/transactions/:id/reread/apply {candidateId, keep?:'new'|'old'} → «Bruk endringene» / «Behold som før»
// POST  /finans/api/transactions/:id/reset     → varelinjene tilbake slik Glimt leste dem («Tilbakestill»)
// POST  /finans/api/search/ask {q}             → {text, source, sourceLabel, cards:[{kind:'sub'|'tx'|'receipt'|'budget'|'stat', …}], items, total?, open?, intent}
import { Hono } from 'hono';
import { db } from './db.js';
import { sessionUser } from '../auth.js';
import { bearerOk } from './routes.js';
import { subscriptionSources, subIntent } from './subs-ask32.js';
import { plainSearch } from './search.js';
import { addedOf40, markCreated40, historyOf40, recordChange40, tagsOf40, applyRereadTx40 } from './added40.js';
import { osloTodayISO } from '../../public/js/quick-time.js';

const q = (sql) => db.prepare(sql);
const who = (c) => sessionUser(c) ?? (bearerOk(c, 'finance:read') ? c.get('user') : null);
const str = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');

/* ---------------- Tall og tekst (nb-NO) ---------------- */

const krN = (v) => { const r = Math.round(Math.abs(v) * 100) / 100; return (Number.isInteger(r) ? r.toLocaleString('nb-NO') : r.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).replace(/ /g, ' '); };
export const kr40 = (v) => `${krN(v)} kr`;
/** Fjerner markdown og kildemarkører ([n], **x**, _x_, #, `x`). */
export const stripMd40 = (s) => String(s ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,!?])/g, '$1$2')
  .replace(/`([^`]+)`/g, '$1').replace(/^#+\s*/gm, '').replace(/^\s*[-*•]\s+/gm, '').replace(/\s*\[(?:n|\d+(?:\s*[,–-]\s*\d+)*)\]/gi, '').replace(/\s+([.,!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const MONTH_LONG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const dLabel = (iso) => (iso ? `${+iso.slice(8, 10)}. ${MON[+iso.slice(5, 7) - 1]}` : null);
const daysTo = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400_000);
const inDays = (n) => (n === 0 ? 'i dag' : n === 1 ? 'i morgen' : n < 0 ? `for ${-n} dager siden` : `om ${n} dager`);
const NUMW = ['null', 'ett', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti'];
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFC');

/* ---------------- Glimt-søk med kort ---------------- */

const SUBS_RE = /\b(abonnement\w*|abonement\w*|abo|faste trekk|hva betaler jeg for|strømmetjenest\w*|tjenester jeg betaler)\b/;
const FIXED_RE = /\bfaste utgifter\b|\bfaste regninger\b|\bregninger\b/;
const BUDGET_RE = /\bbudsjett\w*\b/;
const ACCOUNT_RE = /\b(kontoer|konto|saldo|disponibelt)\b/;
const SPEND_RE = /\b(hvor mye|brukt|brukte|bruker jeg|forbruk|handlet|kjøpt)\b/;

function subsAnswer(u, today) {
  const subs = subscriptionSources(u).filter((s) => s.kind === 'abonnement');
  const items = subs.map((s) => {
    const d = s.nextDate ? daysTo(today, s.nextDate) : null;
    return { kind: 'sub', id: s.id, name: s.name, plan: s.plan || null, logo: s.logoUrl, domain: s.domain, amount: s.price, cycle: s.perLabel === '/år' ? 'yearly' : s.perLabel === '/2 år' ? 'biennial' : 'monthly',
      perLabel: s.perLabel === '/år' ? `per år · ${krN(s.monthly)}/mnd` : s.perLabel === '/2 år' ? `per 2 år · ${krN(s.monthly)}/mnd` : 'per mnd', monthly: s.monthly,
      nextDate: s.nextDate, nextIn: d, nextLabel: s.nextDate ? `Neste trekk ${dLabel(s.nextDate)} · ${inDays(d)}` : null, soon: d != null && d >= 0 && d <= 7, url: s.url, target: s.url };
  }).sort((a, b) => (a.nextDate ?? '9999').localeCompare(b.nextDate ?? '9999'));
  const perMonth = Math.round(items.reduce((a, s) => a + s.monthly, 0) * 100) / 100;
  const next = items.find((s) => s.nextIn != null && s.nextIn >= 0);
  const n = items.length;
  const text = !n ? 'Du har ingen aktive abonnementer i Subscription OS.'
    : `Du har ${n <= 10 ? NUMW[n].replace(/^ett$/, 'ett') : n} ${n === 1 ? 'abonnement' : 'abonnementer'}. Til sammen ${kr40(perMonth)} i måneden.${next ? ` Neste trekk er ${next.name} ${inDays(next.nextIn)}.` : ''}`;
  const stats = n ? [
    { kind: 'stat', key: 'month', label: 'PER MÅNED', value: kr40(perMonth), raw: perMonth },
    { kind: 'stat', key: 'year', label: 'PER ÅR', value: kr40(Math.round(perMonth * 12 * 100) / 100), raw: Math.round(perMonth * 1200) / 100 },
    ...(next ? [{ kind: 'stat', key: 'next', label: 'NESTE TREKK', value: dLabel(next.nextDate), sub: `${next.name} · ${kr40(next.amount)}`, raw: next.nextDate }] : []),
  ] : [];
  return { intent: 'subscriptions', text, source: 'Subscription OS', sourceLabel: 'fra Subscription OS', cards: [...stats, ...items], items, total: perMonth,
    open: { label: 'Åpne Subscription OS ›', target: '/finans/#/abonnement' } };
}

function fixedAnswer(u, today) {
  const rows = q('SELECT r.*, c.name AS cat FROM fh_recurring r LEFT JOIN fh_categories c ON c.id=r.category_id WHERE r.user_id=? AND r.active=1 ORDER BY r.day').all(u);
  const monthly = (r) => (r.interval === 'yearly' ? r.amount / 12 : r.interval === 'weekly' ? (r.amount * 52) / 12 : r.amount) / 100;
  const items = rows.map((r) => ({ kind: 'tx', id: `rec-${r.id}`, recurringId: r.id, name: r.name, description: r.name, amount: -Math.abs(r.amount / 100), category: r.cat ?? null,
    perLabel: r.interval === 'yearly' ? 'per år' : r.interval === 'weekly' ? 'per uke' : 'per mnd', nextLabel: r.interval === 'monthly' ? `Hver ${r.day}. i måneden` : null }));
  const sum = Math.round(rows.reduce((a, r) => a + Math.abs(monthly(r)), 0) * 100) / 100;
  const text = rows.length ? `Du har ${rows.length} faste utgifter. Til sammen ${kr40(sum)} i måneden.` : 'Du har ingen faste utgifter registrert.';
  return { intent: 'fixed', text, source: 'Faste utgifter', sourceLabel: 'fra faste utgifter', cards: [...(rows.length ? [{ kind: 'stat', key: 'month', label: 'PER MÅNED', value: kr40(sum), raw: sum }, { kind: 'stat', key: 'count', label: 'ANTALL', value: String(rows.length), raw: rows.length }] : []), ...items], items, total: sum,
    open: { label: 'Åpne faste utgifter ›', target: '/finans/#/faste' } };
}

function budgetAnswer(u, today) {
  const month = today.slice(0, 7);
  const rows = q("SELECT b.category_id, b.month, b.amount, c.name, c.color FROM fh_budgets b JOIN fh_categories c ON c.id=b.category_id WHERE b.user_id=? AND b.month IN ('default', ?)").all(u, month);
  const by = new Map();
  for (const r of rows) if (r.month === 'default' && !by.has(r.category_id)) by.set(r.category_id, r);
  for (const r of rows) if (r.month === month) by.set(r.category_id, r);
  const from = `${month}-01`, to = `${month}-32`;
  const items = [...by.values()].map((b) => {
    const spent = Math.abs(q('SELECT COALESCE(SUM(amount),0) FROM fh_transactions WHERE user_id=? AND category_id=? AND amount<0 AND date>=? AND date<?').pluck().get(u, b.category_id, from, to)) / 100;
    const budget = b.amount / 100;
    return { kind: 'budget', categoryId: b.category_id, category: b.name, color: b.color, budget, spent, left: Math.round((budget - spent) * 100) / 100, pct: budget ? Math.round((spent / budget) * 100) : null, over: spent > budget };
  }).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const total = items.reduce((a, x) => a + x.budget, 0), spent = items.reduce((a, x) => a + x.spent, 0);
  const over = items.filter((x) => x.over);
  const text = items.length ? `Du har brukt ${kr40(spent)} av ${kr40(total)} i ${MONTH_LONG[+month.slice(5) - 1]}.${over.length ? ` ${over[0].category} er over budsjett.` : ' Alt er innenfor budsjett.'}` : 'Du har ikke satt opp budsjett ennå.';
  return { intent: 'budget', text, source: 'Budsjett', sourceLabel: 'fra budsjettet', cards: [...(items.length ? [
    { kind: 'stat', key: 'budget', label: 'BUDSJETT', value: kr40(total), raw: total }, { kind: 'stat', key: 'spent', label: 'BRUKT', value: kr40(spent), raw: spent },
    { kind: 'stat', key: 'left', label: 'IGJEN', value: kr40(total - spent), raw: Math.round((total - spent) * 100) / 100 }] : []), ...items], items, total: spent, open: { label: 'Åpne budsjett ›', target: '/finans/#/budsjett' } };
}

function accountsAnswer(u) {
  const rows = q('SELECT a.*, a.opening_balance + COALESCE((SELECT SUM(amount) FROM fh_transactions WHERE account_id=a.id AND user_id=a.user_id),0) AS balance FROM fh_accounts a WHERE a.user_id=? ORDER BY sort, id').all(u);
  const items = rows.map((a) => ({ kind: 'stat', key: `acc-${a.id}`, accountId: a.id, label: String(a.name).toUpperCase(), value: kr40(a.balance / 100), raw: a.balance / 100, sub: a.last4 ? `•••• ${a.last4}` : null }));
  const sum = rows.reduce((x, a) => x + a.balance, 0) / 100;
  return { intent: 'accounts', text: rows.length ? `Du har ${rows.length} ${rows.length === 1 ? 'konto' : 'kontoer'} med til sammen ${kr40(sum)}.` : 'Du har ingen kontoer ennå.', source: 'Kontoer', sourceLabel: 'fra kontoene', cards: items, items, total: sum, open: { label: 'Åpne kontoer ›', target: '/finans/#/kontoer' } };
}

function spendAnswer(u, text) {
  const r = plainSearch(text, { limit: 60 });
  const hits = (r.hits ?? []).filter((h) => h.type === 'tx');
  const spend = hits.filter((h) => h.amount < 0);
  const sum = Math.round(spend.reduce((a, h) => a - h.amount, 0) * 100) / 100;
  const max = spend.slice().sort((a, b) => a.amount - b.amount)[0];
  const cards = hits.slice(0, 30).map((h) => ({ kind: 'tx', id: h.txId ?? h.id, txId: h.txId ?? null, name: h.description, description: h.description, amount: h.amount, date: h.date, dateLabel: dLabel(h.date), category: h.category, color: h.color, reason: h.reason ?? null }));
  const rcs = (r.hits ?? []).filter((h) => h.type === 'receipt').slice(0, 10).map((h) => ({ kind: 'receipt', id: h.receiptId ?? h.id, receiptId: h.receiptId ?? h.id, name: h.store ?? h.description, amount: h.amount ?? null, date: h.date ?? null, dateLabel: dLabel(h.date), line: h.matchedText ?? h.reason ?? null }));
  const what = r.interpreted?.store ?? r.interpreted?.category ?? r.interpreted?.item ?? null;
  const per = r.interpreted?.month ? ` i ${r.interpreted.month}` : '';
  let t;
  if (!hits.length && !rcs.length) t = `Fant ingenting om «${text}».`;
  else if (spend.length) t = `Du brukte ${kr40(sum)}${what ? ` på ${what}` : ''}${per}, fordelt på ${spend.length} ${spend.length === 1 ? 'kjøp' : 'kjøp'}.${max ? ` Største var ${max.description} (${kr40(-max.amount)}).` : ''}`;
  else t = stripMd40(r.summary || `Fant ${hits.length + rcs.length} treff.`);
  const stats = spend.length ? [{ kind: 'stat', key: 'spent', label: 'BRUKT', value: kr40(sum), raw: sum }, { kind: 'stat', key: 'count', label: 'KJØP', value: String(spend.length), raw: spend.length },
    ...(max ? [{ kind: 'stat', key: 'max', label: 'STØRST', value: kr40(-max.amount), sub: max.description, raw: -max.amount }] : [])] : [];
  return { intent: spend.length ? 'spend' : 'search', text: stripMd40(t), source: 'Transaksjoner', sourceLabel: 'leste transaksjoner og kvitteringer', cards: [...stats, ...cards, ...rcs], items: [...cards, ...rcs], total: spend.length ? sum : undefined,
    open: { label: 'Vis alle i Liste ›', target: `/finans/#/liste?q=${encodeURIComponent(text)}` } };
}

/** Svar på et standardspørsmål i Finans-søket. → {text, source, sourceLabel, cards, items, total?, open?, intent} */
export function financeAsk40(u, text, today = osloTodayISO()) {
  const t = fold(text);
  let out;
  if (SUBS_RE.test(t) || subIntent(text)?.general) out = subsAnswer(u, today);
  else if (FIXED_RE.test(t)) out = fixedAnswer(u, today);
  else if (BUDGET_RE.test(t)) out = budgetAnswer(u, today);
  else if (ACCOUNT_RE.test(t) && !SPEND_RE.test(t)) out = accountsAnswer(u);
  else out = spendAnswer(u, text);
  return { q: text, ...out, text: stripMd40(out.text), engine: 'Glimt', label: '✦ GLIMT', noHitsLine: false };
}

/* ---------------- Ruter og mellomvarer ---------------- */

export const finans40Api = new Hono();
const txRow = (id, u) => q('SELECT * FROM fh_transactions WHERE id=? AND user_id=?').get(id, u);
const receiptOfTx = (id, u) => q('SELECT * FROM fh_receipts WHERE transaction_id=? AND user_id=? ORDER BY created DESC LIMIT 1').get(id, u);
const linesOfReceipt = (r) => { try { return (JSON.parse(r?.extraction ?? 'null')?.lines ?? []).map((l) => ({ description: l.description, amount: l.amount })); } catch { return []; } };
export function lineCheck40(lines, amount) {
  const sum = Math.round(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0) * 100) / 100, total = Math.round(Math.abs(amount) * 100) / 100;
  const ok = Math.abs(sum - total) < 0.01;
  return { sum, total, ok, text: `Sum linjer ${kr40(sum)} · ${ok ? 'stemmer' : 'stemmer ikke med beløpet'}` };
}
const viaOf = (c) => {
  const h = String(c.req.header('x-homelab-via') ?? '').toLowerCase();
  if (['glimt', 'shortcut'].includes(h)) return h;
  const a = c.get('access');
  if (a && !a.session && a.tokenId) { const n = q('SELECT name FROM fh_tokens WHERE id=?').pluck().get(a.tokenId); return `api:${String(n ?? '').replace(/^Glimt-API: /, '').slice(0, 60)}`; }
  return null;
};

// POST /transactions: hvem og hvordan.
finans40Api.post('/transactions', async (c, next) => {
  await next();
  if (c.res.status !== 200) return;
  try { const j = await c.res.clone().json(); const u = c.get('user'); if (j?.id) { markCreated40('fh_transactions', j.id, u, viaOf(c)); c.res = c.json({ ...j, added: addedOf40(txRow(j.id, u), 'tx') }); } } catch { /* svaret står */ }
});

// PATCH /transactions/:id: alle felt + historikk.
finans40Api.patch('/transactions/:id{[0-9]+}', async (c, next) => {
  const u = who(c);
  const id = +c.req.param('id');
  const before = u ? txRow(id, u) : null;
  if (!before) return next();
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return next();
  // Navn → id (kategori/konto som tekst) settes etter routes.js; motpart-alias.
  let catAlias = null, accAlias = null;
  if (b.categoryId === undefined && typeof b.category === 'string') { catAlias = q('SELECT id FROM fh_categories WHERE user_id=? AND lower(name)=lower(?)').pluck().get(u, b.category.trim()) ?? null; if (!catAlias) return c.json({ error: 'Ukjent kategori' }, 400); }
  if (b.accountId === undefined && typeof b.account === 'string') { accAlias = q('SELECT id FROM fh_accounts WHERE user_id=? AND lower(name)=lower(?)').pluck().get(u, b.account.trim()) ?? null; if (!accAlias) return c.json({ error: 'Ukjent konto' }, 400); }
  if (b.merchant === undefined && b.counterparty !== undefined) b.merchant = b.counterparty;
  if (b.tags !== undefined && !Array.isArray(b.tags)) return c.json({ error: 'tags må være en liste' }, 400);
  if (b.lines !== undefined && !Array.isArray(b.lines)) return c.json({ error: 'lines må være en liste' }, 400);
  const beforeLines = linesOfReceipt(receiptOfTx(id, u));
  await next();
  if (c.res.status !== 200) return;
  const extra = [], warnings = [];
  if (catAlias) q('UPDATE fh_transactions SET category_id=? WHERE id=?').run(catAlias, id);
  if (accAlias) q('UPDATE fh_transactions SET account_id=? WHERE id=?').run(accAlias, id);
  if (b.merchant !== undefined) q('UPDATE fh_transactions SET merchant=? WHERE id=?').run(str(b.merchant) || null, id);
  if (b.tags !== undefined) q('UPDATE fh_transactions SET tags=? WHERE id=?').run(JSON.stringify([...new Set(b.tags.map((x) => str(String(x), 30).replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, 20)), id);
  if (b.folderId !== undefined) extra.push({ field: 'folderId', label: 'deling', old: null, new: b.folderId || null });
  if (b.lines !== undefined) {
    const r = receiptOfTx(id, u);
    if (!r) warnings.push('Varelinjer kan bare endres på en transaksjon med kvittering');
    else {
      const lines = b.lines.slice(0, 200).map((l) => ({ description: str(l?.description ?? l?.name ?? '', 120), amount: Math.round((Number(String(l?.amount ?? l?.price ?? 0).replace(',', '.')) || 0) * 100) / 100 })).filter((l) => l.description);
      let ex = {}; try { ex = JSON.parse(r.extraction ?? '{}') ?? {}; } catch { ex = {}; }
      if (!r.extraction_orig40 && r.extraction) q('UPDATE fh_receipts SET extraction_orig40=? WHERE id=?').run(r.extraction, r.id);
      q('UPDATE fh_receipts SET extraction=?, updated_at=?, updated_by=? WHERE id=?').run(JSON.stringify({ ...ex, lines, edited40: { at: Date.now(), by: u } }), Date.now(), u, r.id);
      if (JSON.stringify(lines) !== JSON.stringify(beforeLines)) extra.push({ field: 'lines', label: 'varelinjer', old: beforeLines.length, new: lines.length });
    }
  }
  const after = txRow(id, u);
  const changes = recordChange40(id, u, before, after, extra);
  try {
    // Hent transaksjonen på nytt (kategori/konto/motpart kan være endret her etter routes.js).
    const { default: fin } = await import('./routes.js');
    const fresh = await fin.request(`/transactions/${id}`, { headers: { cookie: c.req.header('cookie') ?? '', authorization: c.req.header('authorization') ?? '' } }, c.env);
    const j = fresh.ok ? await fresh.json() : await c.res.clone().json();
    const row = txRow(id, u), lines = linesOfReceipt(receiptOfTx(id, u));
    c.res = c.json({ ...j, merchant: row.merchant, tags: tagsOf40(row), lines, lineCheck: lines.length ? lineCheck40(lines, row.amount / 100) : null, added: addedOf40(row, 'tx'), history: historyOf40(id), changes, ...(warnings.length ? { warnings } : {}) });
  } catch { /* svaret står */ }
});

// GET /transactions/:id: + historikk og sumkontroll.
finans40Api.get('/transactions/:id{[0-9]+}', async (c, next) => {
  await next();
  if (c.res.status !== 200) return;
  try {
    const j = await c.res.clone().json(), u = c.get('user'), id = +c.req.param('id');
    const lines = linesOfReceipt(receiptOfTx(id, u));
    const r = receiptOfTx(id, u);
    c.res = c.json({ ...j, history: historyOf40(id), lineCheck: lines.length ? lineCheck40(lines, j.amount) : null, canReread: !!r?.file, canReset: !!r?.extraction_orig40 });
  } catch { /* */ }
});

const FIELD_LABEL = { merchant: 'butikk', date: 'dato', total: 'beløp', category: 'kategori', items: 'linjer', lines: 'linjer', vat: 'MVA' };
/** Forskjellen mellom forrige og ny lesing (reanalyze previous/result). */
export function rereadChanges40(prev = {}, next = {}) {
  const out = [];
  for (const f of ['merchant', 'date', 'total', 'category']) if ((prev[f] ?? null) !== (next[f] ?? null) && next[f] != null) out.push({ field: f, label: FIELD_LABEL[f], old: prev[f] ?? null, new: next[f] });
  const pl = (prev.items ?? []).map((l) => `${l.description}|${l.amount}`), nl = (next.items ?? []).map((l) => `${l.description}|${l.amount}`);
  if (JSON.stringify(pl) !== JSON.stringify(nl)) {
    const n = Math.max(pl.length, nl.length);
    for (let i = 0; i < n; i++) if (pl[i] !== nl[i]) out.push({ field: `lines[${i}]`, label: `linje ${i + 1}`, old: prev.items?.[i] ?? null, new: next.items?.[i] ?? null });
  }
  return out;
}

// POST /transactions/:id/reread → reanalyze på kvitteringen (originalbildet i full oppløsning), ingenting lagres før «Bruk endringene».
finans40Api.post('/transactions/:id{[0-9]+}/reread', async (c) => {
  const u = who(c);
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!bearerOk(c, 'finance:write')) return c.json({ error: 'Tokenet mangler tilgangen finance:write' }, 403);
  const id = +c.req.param('id');
  if (!txRow(id, u)) return c.json({ error: 'Fant ikke transaksjonen' }, 404);
  const r = receiptOfTx(id, u);
  if (!r?.file) return c.json({ error: 'Transaksjonen har ingen kvittering å lese på nytt', noReceipt: true }, 409);
  const b = await c.req.json().catch(() => ({})) ?? {};
  const { default: fin } = await import('./routes.js');
  const res = await fin.request(`/receipts/${encodeURIComponent(r.id)}/reanalyze`, { method: 'POST', headers: { cookie: c.req.header('cookie') ?? '', authorization: c.req.header('authorization') ?? '', 'content-type': 'application/json' },
    body: JSON.stringify({ engine: b.engine ?? 'gemini', apply: false, ...(b.async ? { async: true } : {}), ...(b.small ? { small: true } : {}) }) }, c.env); // prompt 50: small = «Les mindre versjon»
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return c.json({ receiptId: r.id, ...j }, res.status);
  if (res.status === 202) return c.json({ receiptId: r.id, ...j }, 202);
  const changes = rereadChanges40(j.previous ?? {}, j.result ?? {});
  const lines = j.result?.items ?? [];
  const sum = Math.round(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0) * 100) / 100;
  const totalOk = j.result?.total != null ? Math.abs(sum - Math.abs(j.result.total)) < 0.01 : null;
  const text = changes.length ? `Glimt fant ${changes.length} ${changes.length === 1 ? 'endring' : 'endringer'}.` : `Ingen endringer. Butikk, dato og alle ${lines.length} linjer stemmer${totalOk ? `, og summen er ${kr40(sum)}` : ''}.`;
  return c.json({ receiptId: r.id, ...j, changes, lines_new: lines, total_ok: totalOk, noChanges: !changes.length, text: totalOk === false ? `${text} Summen av linjene (${kr40(sum)}) stemmer ikke med beløpet – sjekk med «Rediger alt».` : text });
});

// POST /transactions/:id/reread/apply {candidateId, keep?:'new'|'old'} → «Bruk endringene» / «Behold som før» for en bokført transaksjon.
//   'new': kvitteringen får den nye lesingen (den gamle huskes for «Tilbakestill»), transaksjonen får butikk, dato og beløp (fortegnet beholdes),
//   og endringen står i historikken. → transaksjonen (som GET) + history, changes
finans40Api.post('/transactions/:id{[0-9]+}/reread/apply', async (c) => {
  const u = who(c);
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!bearerOk(c, 'finance:write')) return c.json({ error: 'Tokenet mangler tilgangen finance:write' }, 403);
  const id = +c.req.param('id');
  const t = txRow(id, u);
  if (!t) return c.json({ error: 'Fant ikke transaksjonen' }, 404);
  const r = receiptOfTx(id, u);
  const b = await c.req.json().catch(() => ({})) ?? {};
  let cand = null; try { cand = JSON.parse(r?.candidate ?? 'null'); } catch { cand = null; }
  if (!r || !cand || cand.id !== b.candidateId) return c.json({ error: 'Resultatet er utløpt. Les på nytt.' }, 409);
  const keepOld = b.keep === 'old' || b.keepNew === false;
  const changes = keepOld ? (q('UPDATE fh_receipts SET candidate=NULL WHERE id=?').run(r.id), []) : applyRereadTx40(u, t, r, cand);
  const { default: fin } = await import('./routes.js');
  const fresh = await fin.request(`/transactions/${id}`, { headers: { cookie: c.req.header('cookie') ?? '', authorization: c.req.header('authorization') ?? '' } }, c.env);
  return c.json({ ...(await fresh.json()), history: historyOf40(id), changes, kept: keepOld ? 'old' : 'new' });
});

// POST /transactions/:id/reset → varelinjene slik Glimt leste dem.
finans40Api.post('/transactions/:id{[0-9]+}/reset', async (c) => {
  const u = who(c);
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!bearerOk(c, 'finance:write')) return c.json({ error: 'Tokenet mangler tilgangen finance:write' }, 403);
  const id = +c.req.param('id');
  const t = txRow(id, u);
  if (!t) return c.json({ error: 'Fant ikke transaksjonen' }, 404);
  const r = receiptOfTx(id, u);
  if (!r?.extraction_orig40) return c.json({ error: 'Ingenting å tilbakestille' }, 409);
  const before = linesOfReceipt(r);
  q('UPDATE fh_receipts SET extraction=?, extraction_orig40=NULL WHERE id=?').run(r.extraction_orig40, r.id);
  const lines = linesOfReceipt(receiptOfTx(id, u));
  recordChange40(id, u, t, t, [{ field: 'lines', label: 'varelinjer (tilbakestilt)', old: before.length, new: lines.length }]);
  return c.json({ ok: true, lines, lineCheck: lineCheck40(lines, t.amount / 100), history: historyOf40(id) });
});

// POST /search/ask {q} → ryddig svar med kort.
finans40Api.post('/search/ask', async (c) => {
  const u = who(c);
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', u);
  const b = await c.req.json().catch(() => ({})) ?? {};
  const text = str(b.q ?? b.query ?? '', 300);
  if (!text) return c.json({ error: 'Skriv et spørsmål' }, 400);
  return c.json(financeAsk40(u, text));
});
