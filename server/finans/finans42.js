// Prompt 42 (SERVER42): Finans-API for prompt 42. Montert under /finans/api FØR finans40Api og routes.js (index.js via api42.js).
// Rutene her har egen tilgangskontroll (økt eller API-token med finance:read / finance:write, som routes.js), og kjører som brukeren.
//
//   POST /search/ask {q, scope?:{module:'boliger', home_id}} → {text, cards, hits, steps:[{label, detail, ms, done}], ms, engine:'lokalt'|'ollama', path:'fast'|'llm', parsed, intent, doneText, hitsText}
//   GET|POST /search/ask/stream?q=…                       → SSE: event step {label, detail, ms, done} · event ping {elapsed} (hvert 2. s) · event answer {…svar} · event done
//   POST /search/warm                                      → forvarmer Ollama (keep_alive 30m) når søkefeltet får fokus → {ok, model}
//   GET  /search/log                                       → {items:[{at, q, intent, path, engine, parse_ms, sql_ms, llm_used, hits, ms}]}
//   GET  /transactions?merchant[]=&category[]=&home=all|<id>&min=&max=&from=YYYY-MM[-DD]&to=YYYY-MM[-DD]&week=34-50&year=  (uten disse: som før i routes.js)
//        → {items:[tx], count, net, sum, filter, chips:[{key, label}]}
//   GET  /filter/facets                                    → {merchants:[{key, name, count, logo}], categories:[{id, name, color, count}], homes:[{id, name}], top:6}
//   POST /filter/glimt {q}                                 → {filter, text:'✦ Glimt satte filteret: … · 0,04 s', ms, engine}
//   POST /glimt/tasks · GET /glimt/tasks · GET/DELETE /glimt/tasks/:id · GET /glimt/tasks/:id/events · GET /glimt/tasks/:id/report.pdf   (glimt-tasks42.js)
//   Boliger + import rett til Boliger                      → homes42.js
//   GET  /stocks (mellomvare): hver posisjon får logo:{url, issuer, domain}, monogram, tickerBadge, exchange, subtitle:'VUAG · London · USD', instrument
//   GET  /aksjer/logo/:key                                 → bildet (Cache-Control 30 d) eller 404 (klienten viser monogram)
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db, settings, ensureLedger } from './db.js';
import { runAsUser } from '../settings.js';
import { tokenAccessOf, txOut42, TX_SELECT42 } from './routes.js';
import { financeAsk40 } from './p40.js';
import { subscriptionSources } from './subs-ask32.js';
import { ask42, searchLog42, merchantKey42, filterFromText42, weekRange42, fold42 } from './search42.js';
import { startTask42, listTasks42, getTask42, deleteTask42, jobOut42, subscribe42, reportFile42, kindFromText42, KINDS42, MAX_RUNNING42 } from './glimt-tasks42.js';
import { mountHomes42, homeSearch42, homesOf42 } from './homes42.js';
import { logo as faviconLogo, validDomain } from './enrich.js';
import { itemForDomain, filePath as logoFile } from '../logos/match.js';
import { readFile } from 'node:fs/promises';
import { gateLoad } from '../ollama-gate.js'; // prompt 43
import { modelFor } from '../ai-run.js';

const q = (sql) => db.prepare(sql);
const bad = (c, msg, code = 400) => c.json({ error: msg }, code);
const str = (v, n = 300) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');
const IMPLIED = { 'read:transactions': 'finance:read', 'read:summary': 'finance:read', 'write:transactions': 'finance:write' };
const hasScope = (a, s) => a.session || a.scopes.has(s) || (IMPLIED[s] && a.scopes.has(IMPLIED[s])) || (s === 'finance:read' && a.scopes.has('finance:write'));
/** Mellomvare: økt eller token med scope → c.get('user'), c.get('access'), og resten kjører som brukeren. */
export const auth42 = (scope = 'finance:read') => async (c, next) => {
  const a = tokenAccessOf(c);
  if (!a) return bad(c, 'Ikke innlogget', 401);
  if (!hasScope(a, scope)) return bad(c, `Tokenet mangler tilgangen ${scope}`, 403);
  c.set('access', a); c.set('user', a.user);
  ensureLedger(a.user);
  return runAsUser(a.user, () => next());
};
const R = auth42('finance:read'), W = auth42('finance:write');

export const finans42Api = new Hono();

/* ---------------- Glimt-søk ---------------- */

const fmtKr = (v) => `${Math.round(Math.abs(v)).toLocaleString('nb-NO').replace(/\s/g, ' ')} kr`;
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const dLabel = (s) => (s ? `${+s.slice(8, 10)}. ${MON[+s.slice(5, 7) - 1]}` : '');
const daysTo = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
/** Gjentakende transaksjoner: samme forhandler, lignende beløp (±15 %), intervall 7/30/90/365 d ±4 d, minst 2 ganger siste 13 mnd. */
export function recurringFromTx42(u, now = new Date()) {
  const from = new Date(now); from.setMonth(from.getMonth() - 13);
  const rows = q("SELECT t.date, t.amount, COALESCE(t.merchant, t.description) AS name FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND t.amount<0 AND t.date>=? AND COALESCE(c.kind,'expense')<>'transfer' ORDER BY t.date").all(u, from.toISOString().slice(0, 10));
  const by = new Map();
  for (const r of rows) { const k = merchantKey42(r.name).id ?? r.name; const g = by.get(k) ?? { name: r.name, rows: [] }; g.rows.push(r); by.set(k, g); }
  const out = [];
  for (const g of by.values()) {
    if (g.rows.length < 2) continue;
    const amts = g.rows.map((r) => -r.amount / 100), avg = amts.reduce((s, v) => s + v, 0) / amts.length;
    if (amts.some((v) => Math.abs(v - avg) > avg * 0.15)) continue;
    const gaps = g.rows.slice(1).map((r, i) => daysTo(g.rows[i].date, r.date));
    const iv = [7, 30, 90, 365].find((d) => gaps.every((x) => Math.abs(x - d) <= (d === 30 ? 4 : d === 7 ? 1 : 6)));
    if (!iv) continue;
    const last = g.rows.at(-1).date;
    const next = new Date(`${last}T12:00:00`); next.setDate(next.getDate() + iv);
    out.push({ name: g.name, amount: Math.round(avg * 100) / 100, interval: iv, monthly: Math.round((avg * 30) / iv * 100) / 100, last, nextDate: next.toISOString().slice(0, 10), count: g.rows.length });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}
/** «Har jeg noen abonnementer?» – Subscription OS / prøveperioder først, så gjentakende transaksjoner. Hurtigvei (ingen LLM). */
export function subsAnswer42(u, text) {
  const base = financeAsk40(u, text);
  const today = new Date().toISOString().slice(0, 10);
  let trials = [];
  try { trials = subscriptionSources(u).filter((s) => s.kind === 'prøve' && s.nextDate && daysTo(today, s.nextDate) >= 0 && daysTo(today, s.nextDate) <= 14); } catch { /* */ }
  const trialCards = trials.map((t) => ({ kind: 'sub', id: t.id, name: t.name, trial: true, badge: `PRØVE · slutter ${dLabel(t.nextDate)}`, amount: t.price, nextDate: t.nextDate, nextLabel: `Prøveperioden slutter ${dLabel(t.nextDate)}` }));
  let cards = [...trialCards, ...(base.cards ?? [])];
  let textOut = base.text;
  const subs = (base.items ?? []).filter((x) => x.kind === 'sub');
  if (!subs.length) {
    const rec = recurringFromTx42(u);
    if (rec.length) {
      const per = rec.reduce((s, r) => s + r.monthly, 0);
      textOut = `Du har ${rec.length} faste trekk i transaksjonene, til sammen ${fmtKr(per)} i måneden. Dyrest: ${rec.slice(0, 3).map((r) => `${r.name} ${fmtKr(r.monthly)}`).join(', ')}.`;
      cards = [...trialCards, { kind: 'stat', key: 'month', label: 'PER MÅNED', value: fmtKr(per), raw: per }, ...rec.map((r) => ({ kind: 'sub', name: r.name, amount: r.amount, monthly: r.monthly, perLabel: r.interval === 30 ? 'per mnd' : `hver ${r.interval}. dag`, nextDate: r.nextDate, nextLabel: `Neste trekk ${dLabel(r.nextDate)}`, source: 'transaksjoner' }))];
    } else textOut = 'Jeg finner ingen faste trekk de siste 13 månedene.';
  } else {
    const top = subs.slice().sort((a, b) => b.monthly - a.monthly).slice(0, 3);
    const next = subs.filter((s) => s.nextIn != null && s.nextIn >= 0).sort((a, b) => a.nextIn - b.nextIn)[0];
    const per = subs.reduce((s, x) => s + x.monthly, 0);
    textOut = `Du har ${subs.length} aktive abonnementer, til sammen ${fmtKr(per)} i måneden. Dyrest: ${top.map((s) => `${s.name} ${fmtKr(s.monthly)}`).join(', ')}.${next ? ` Neste trekk: ${next.name} ${dLabel(next.nextDate)}.` : ''}`;
  }
  return { ...base, intent: 'subscriptions', text: textOut, cards, items: [...trialCards, ...(base.items ?? [])], hits: subs.length || cards.filter((x) => x.kind === 'sub').length, open: { label: 'Åpne abonnementer ›', target: '/finans/#/abonnement' } };
}
const SPECIAL40 = /\b(budsjett\w*|faste utgifter|faste regninger|regninger)\b|^(?:mine )?(kontoer|konto|saldo|disponibelt)\b/;
/** Budsjett, faste utgifter og kontoer: prompt 40-svarene (med kort og nøkkeltall). */
const special42 = (u, text, p) => (!p.merchant && SPECIAL40.test(fold42(text).trim()) ? financeAsk40(u, text) : null);
// scope: {module:'boliger', home_id} eller {home:<id>} (FinansHub web) – søket filtreres på boligen.
const scopeOf = (sc) => (!sc || typeof sc !== 'object' ? null : sc.module === 'boliger' || sc.home != null || sc.home_id != null || sc.homeId != null ? { module: 'boliger', home_id: sc.home_id ?? sc.homeId ?? (sc.home === 'all' ? null : sc.home) ?? null } : null);
const askOpts = (b) => ({ scope: scopeOf(b.scope), homeSearch: homeSearch42, subsAnswer: subsAnswer42, special: special42 });
finans42Api.post('/search/ask', R, async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  const text = str(b.q ?? b.query ?? '', 300);
  if (!text) return bad(c, 'Skriv et spørsmål');
  return c.json(await ask42(c.get('user'), text, askOpts(b)));
});
const streamAsk = async (c, b) => {
  const text = str(b.q ?? b.query ?? '', 300);
  if (!text) return bad(c, 'Skriv et spørsmål');
  const u = c.get('user');
  c.header('Cache-Control', 'no-cache'); c.header('X-Accel-Buffering', 'no');
  return streamSSE(c, async (sse) => {
    const t0 = Date.now();
    const writes = [];
    const send = (event, data) => { if (!sse.aborted) writes.push(sse.writeSSE({ event, data: JSON.stringify(data) })); };
    send('start', { startedAt: new Date(t0).toISOString(), label: 'Glimt tenker …' });
    const ping = setInterval(() => send('ping', { elapsed: Date.now() - t0 }), 2000);
    try {
      const ans = await runAsUser(u, () => ask42(u, text, { ...askOpts(b), onStep: (s) => send('step', s) }));
      send('answer', ans);
    } catch (e) { send('error', { error: e.message }); }
    finally { clearInterval(ping); send('done', { ms: Date.now() - t0 }); await Promise.all(writes); }
  });
};
finans42Api.get('/search/ask/stream', R, (c) => streamAsk(c, { q: c.req.query('q'), scope: c.req.query('home') ? { module: 'boliger', home_id: +c.req.query('home') } : c.req.query('scope') === 'boliger' ? { module: 'boliger' } : null }));
finans42Api.post('/search/ask/stream', R, async (c) => streamAsk(c, await c.req.json().catch(() => ({})) ?? {}));
finans42Api.get('/search/log', R, (c) => c.json({ items: searchLog42(c.get('user')) }));
finans42Api.post('/search/warm', R, async (c) => {
  const st = settings();
  // Prompt 43: modellen fra rutingen (Finans · spør), ikke en hardkodet standard; oppvarmingen går gjennom Ollama-gaten
  // (keep_alive per modell, venter på tur, laster aldri ut en modell som er i bruk).
  const model = await modelFor('fsok', 'ollama', st.ollamaTextModel || st.ollamaModel || '').catch(() => st.ollamaTextModel || st.ollamaModel || '');
  if (process.env.MOCK_DATA === '1' || process.env.NODE_ENV === 'test') return c.json({ ok: true, model, mock: true });
  if (model) gateLoad(model, { base: String(st.ollamaUrl).replace(/\/$/, ''), priority: 'interactive', retries: 0, label: 'Finans · oppvarming' }).catch(() => {});
  return c.json({ ok: true, model });
});

/* ---------------- Filter ---------------- */

const listParam = (c, ...names) => names.flatMap((n) => [...(c.req.queries(n) ?? []), ...(c.req.queries(`${n}[]`) ?? [])]).flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean);
const FILTER_KEYS = ['merchant', 'merchant[]', 'shop', 'category[]', 'cat', 'home', 'min', 'max', 'week', 'wk'];
const ymd = (s, end = false) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) return end ? (() => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() : s;
  if (/^\d{4}-\d{2}$/.test(s ?? '')) { if (!end) return `${s}-01`; const [y, m] = s.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); }
  return null;
};
/** Filteret fra URL-en → normalisert objekt. */
export function filterOf42(c, u) {
  const qs = c.req.query();
  const merchants = listParam(c, 'merchant', 'shop').map((m) => merchantKey42(m).id ?? fold42(m));
  const cats = listParam(c, 'category', 'cat');
  const catRows = q('SELECT id, name, color FROM fh_categories WHERE user_id=?').all(u);
  const categories = cats.map((x) => (/^\d+$/.test(x) ? catRows.find((r) => r.id === +x) : catRows.find((r) => fold42(r.name) === fold42(x) || fold42(r.name).startsWith(fold42(x))))).filter(Boolean);
  const home = qs.home === 'all' || qs.home === 'alle' ? 'all' : /^\d+$/.test(qs.home ?? '') ? +qs.home : null;
  const num = (v) => (v === undefined || v === '' ? null : Number.isFinite(+String(v).replace(/\s/g, '').replace(',', '.')) ? +String(v).replace(/\s/g, '').replace(',', '.') : null);
  let from = ymd(qs.from), to = ymd(qs.to, true), week = null;
  const wk = String(qs.week ?? qs.wk ?? '').match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (wk) { const y = /^\d{4}$/.test(qs.year ?? '') ? +qs.year : new Date().getFullYear(); const r = weekRange42(+wk[1], +(wk[2] ?? wk[1]), y); from = r.from; to = r.to; week = { from: +wk[1], to: +(wk[2] ?? wk[1]), year: y }; }
  return { merchants, categories, home, min: num(qs.min), max: num(qs.max), from, to, week, q: str(qs.q ?? '', 100) || null };
}
export const isFiltered42 = (c) => FILTER_KEYS.some((k) => c.req.query(k) !== undefined || (c.req.queries(k) ?? []).length) || /^\d{4}-\d{2}$/.test(c.req.query('from') ?? '') || /^\d{4}-\d{2}$/.test(c.req.query('to') ?? '');
/** Transaksjonene som passer filteret. */
export function filteredTx42(u, f, { limit = 2000 } = {}) {
  const w = ['t.user_id=?'], a = [u];
  if (f.from) { w.push('t.date>=?'); a.push(f.from); }
  if (f.to) { w.push('t.date<?'); a.push(f.to); }
  if (f.min != null) { w.push('abs(t.amount)>=?'); a.push(Math.round(f.min * 100)); }
  if (f.max != null) { w.push('abs(t.amount)<=?'); a.push(Math.round(f.max * 100)); }
  if (f.categories.length) { w.push(`t.category_id IN (${f.categories.map(() => '?').join(',')})`); a.push(...f.categories.map((x) => x.id)); }
  if (f.home === 'all') w.push('EXISTS (SELECT 1 FROM fh_folder_entries e WHERE e.tx_id=t.id)');
  else if (f.home) { w.push('EXISTS (SELECT 1 FROM fh_folder_entries e WHERE e.tx_id=t.id AND e.folder_id=?)'); a.push(f.home); }
  if (f.q) { w.push('(t.description LIKE ? OR t.merchant LIKE ? OR t.note LIKE ?)'); a.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  let rows = q(`${TX_SELECT42} WHERE ${w.join(' AND ')} ORDER BY t.date DESC, t.id DESC LIMIT 20000`).all(...a);
  if (f.merchants.length) { const set = new Set(f.merchants); rows = rows.filter((t) => set.has(merchantKey42(t.merchant || t.description).id) || f.merchants.some((m) => fold42(`${t.merchant ?? ''} ${t.description}`).includes(m.replace(/-/g, ' ')))); }
  return { rows: rows.slice(0, limit), total: rows.length, net: rows.reduce((s, t) => s + t.amount, 0) / 100, sum: rows.reduce((s, t) => s + Math.abs(t.amount), 0) / 100 };
}
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
function chipsOf(f, homes) {
  const out = [];
  if (f.merchants.length) out.push({ key: 'merchant', label: `Butikk: ${f.merchants.join(', ')}` });
  if (f.categories.length) out.push({ key: 'category', label: `Kategori: ${f.categories.map((c) => c.name).join(', ')}` });
  if (f.home) out.push({ key: 'home', label: `Bolig: ${f.home === 'all' ? 'Alle boliger' : homes.find((h) => h.id === f.home)?.name ?? f.home}` });
  if (f.min != null || f.max != null) out.push({ key: 'amount', label: f.min != null && f.max != null ? `${f.min.toLocaleString('nb-NO')}–${f.max.toLocaleString('nb-NO')} kr` : f.min != null ? `Over ${f.min.toLocaleString('nb-NO')} kr` : `Under ${f.max.toLocaleString('nb-NO')} kr` });
  if (f.week) out.push({ key: 'period', label: f.week.from === f.week.to ? `Uke ${f.week.from}` : `Uke ${f.week.from}–${f.week.to}` });
  else if (f.from || f.to) {
    const m0 = f.from ? +f.from.slice(5, 7) - 1 : null, last = f.to ? new Date(Date.parse(`${f.to}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10) : null;
    const whole = f.from?.endsWith('-01') && f.to?.endsWith('-01');
    out.push({ key: 'period', label: whole ? `${MONTHS[m0][0].toUpperCase()}${MONTHS[m0].slice(1)}${+last.slice(5, 7) - 1 !== m0 ? `–${MONTHS[+last.slice(5, 7) - 1]}` : ''}` : `${f.from ?? '…'} – ${last ?? '…'}` });
  }
  return out;
}
finans42Api.get('/transactions', R, async (c, next) => {
  if (!isFiltered42(c)) return next();
  const u = c.get('user'), f = filterOf42(c, u);
  const r = filteredTx42(u, f, { limit: Math.min(2000, +c.req.query('limit') || 500) });
  const items = r.rows.map((t) => { const o = txOut42(t); return { ...o, receiptLabel: o.receiptId ? 'Kvittering ›' : 'Ingen kvittering' }; });
  const homes = homesOf42(u).map((h) => ({ id: h.id, name: h.name }));
  return c.json({ items, count: r.total, net: r.net, sum: r.sum, filter: { ...f, categories: f.categories.map((x) => x.id) }, chips: chipsOf(f, homes), text: `${r.total} treff` });
});
const logoOfName = (name) => {
  const mk = merchantKey42(name);
  return { key: mk.id, name: mk.display ?? name, logo: mk.id && logoFile(mk.id) ? `/finans/api/logos/file/${mk.id}` : null };
};
finans42Api.get('/filter/facets', R, (c) => {
  const u = c.get('user');
  const rows = q("SELECT COALESCE(t.merchant, t.description) AS name, count(*) n FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND COALESCE(c.kind,'expense')<>'transfer' GROUP BY 1 ORDER BY n DESC LIMIT 400").all(u);
  const by = new Map();
  for (const r of rows) { const l = logoOfName(r.name); if (!l.key) continue; const x = by.get(l.key) ?? { ...l, count: 0, names: [] }; x.count += r.n; x.names.push(r.name); by.set(l.key, x); }
  const merchants = [...by.values()].sort((a, b) => b.count - a.count).map(({ names, ...x }) => ({ ...x, aliases: names.slice(0, 5) }));
  const categories = q('SELECT c.id, c.name, c.color, c.kind, count(t.id) n FROM fh_categories c LEFT JOIN fh_transactions t ON t.category_id=c.id AND t.user_id=c.user_id WHERE c.user_id=? GROUP BY c.id ORDER BY n DESC, c.sort').all(u)
    .map((x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind, count: x.n }));
  const homes = homesOf42(u).map((h) => ({ id: h.id, name: h.name, type: h.type }));
  return c.json({ merchants, categories, homes, top: 6, moreMerchants: Math.max(0, merchants.length - 6), moreCategories: Math.max(0, categories.length - 6),
    amountPresets: [{ label: 'Under 100', max: 100 }, { label: '100–500', min: 100, max: 500 }, { label: '500–5 000', min: 500, max: 5000 }, { label: 'Over 5 000', min: 5000 }] });
});
finans42Api.post('/filter/glimt', R, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({})) ?? {};
  const text = str(b.q ?? b.text ?? '', 300);
  if (!text) return bad(c, 'Skriv hva du vil filtrere på');
  const categories = q('SELECT id, name FROM fh_categories WHERE user_id=?').all(u);
  const homes = homesOf42(u).map((h) => ({ id: h.id, name: h.name, type: h.type }));
  const r = filterFromText42(u, text, { homes, categories });
  const url = new URLSearchParams();
  for (const m of r.filter.merchants) url.append('shop', m);
  if (r.filter.week) url.set('wk', `${r.filter.week.from}-${r.filter.week.to}`); else { if (r.filter.from) url.set('from', r.filter.from); if (r.filter.to) url.set('to', r.filter.to); }
  if (r.filter.min != null) url.set('min', String(r.filter.min)); if (r.filter.max != null) url.set('max', String(r.filter.max));
  for (const id of r.filter.categories) url.append('cat', String(id));
  if (r.filter.home) url.set('home', String(r.filter.home));
  return c.json({ ...r, query: url.toString(), url: `/finans/filter?${url}` });
});

/* ---------------- Glimt: avanserte oppgaver ---------------- */

const KIND_ALIAS = { report: 'report', forbruksrapport: 'report', cut_subs: 'cut_subs', subscriptions: 'cut_subs', compare_year: 'compare_year', compare: 'compare_year', clean_categories: 'clean_categories', categories: 'clean_categories' };
const startHandler = async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  let kind = KIND_ALIAS[b.kind ?? b.type] ?? null, params = b.params && typeof b.params === 'object' ? b.params : {};
  if (b.period && !params.period) params = { ...params, period: b.period };
  if (!kind && (b.text || b.q)) { const k = kindFromText42(b.text ?? b.q); if (!k) return bad(c, 'Glimt forstod ikke oppgaven. Prøv «lag en rapport over forbruket mitt i høst».'); kind = k.kind; params = { ...k.params, ...params }; }
  if (!kind) return bad(c, 'Velg en oppgave (kind)');
  try { const job = startTask42(c.get('user'), kind, params); return c.json({ jobId: job.id, job_id: job.id, job }, 202); } catch (e) { return bad(c, e.message, e.status ?? 400); }
};
finans42Api.post('/glimt/tasks', W, startHandler);
finans42Api.post('/glimt/jobs', W, startHandler);
const listHandler = (c) => {
  const jobs = listTasks42(c.get('user'));
  return c.json({ jobs, running: jobs.filter((j) => j.state === 'running').length, max: MAX_RUNNING42, kinds: Object.entries(KINDS42).map(([kind, k]) => ({ kind, title: k.title, sub: k.sub })) });
};
finans42Api.get('/glimt/tasks', R, listHandler);
finans42Api.get('/glimt/jobs', R, listHandler);
for (const base of ['/glimt/tasks', '/glimt/jobs']) {
  finans42Api.get(`${base}/:id/report.pdf`, R, async (c) => {
    const r = getTask42(c.get('user'), c.req.param('id'));
    if (!r?.pdf) return bad(c, 'Fant ikke rapporten', 404);
    const buf = await reportFile42(r).catch(() => null);
    if (!buf) return bad(c, 'Fant ikke rapporten', 404);
    const name = jobOut42(r).pdfName;
    return c.body(buf, 200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `${c.req.query('inline') === '1' ? 'inline' : 'attachment'}; filename="${name}"`, 'Cache-Control': 'private, max-age=3600' });
  });
  finans42Api.get(`${base}/:id/events`, R, (c) => {
    const r = getTask42(c.get('user'), c.req.param('id'));
    if (!r) return bad(c, 'Fant ikke jobben', 404);
    c.header('Cache-Control', 'no-cache'); c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (sse) => {
      let wake = null, last = jobOut42(r);
      const off = subscribe42(r.id, (v) => { last = v; wake?.(); });
      sse.onAbort(() => { off(); wake?.(); });
      try {
        await sse.writeSSE({ event: 'job', data: JSON.stringify(last) });
        while (!sse.aborted && !['done', 'failed'].includes(last?.state)) {
          await new Promise((res) => { wake = res; setTimeout(res, 2000); });
          wake = null;
          const cur = getTask42(c.get('user'), r.id); if (!cur) break;
          last = jobOut42(cur);
          await sse.writeSSE({ event: last.state === 'running' || last.state === 'queued' ? 'job' : 'done', data: JSON.stringify(last) });
          if (!['done', 'failed'].includes(last.state)) await sse.writeSSE({ event: 'ping', data: '{}' });
        }
      } finally { off(); }
    });
  });
  finans42Api.get(`${base}/:id`, R, (c) => { const r = getTask42(c.get('user'), c.req.param('id')); return r ? c.json(jobOut42(r)) : bad(c, 'Fant ikke jobben', 404); });
  finans42Api.delete(`${base}/:id`, W, async (c) => (await deleteTask42(c.get('user'), c.req.param('id')) ? c.json({ ok: true }) : bad(c, 'Fant ikke jobben', 404)));
}

/* ---------------- Boliger ---------------- */

mountHomes42(finans42Api, auth42);

/* ---------------- Aksjer: logoer og lesbar undertittel ---------------- */

// [ticker, domene, navn/utsteder, etf?]
const STOCKS = [
  ['VUAG', 'vanguard.com', 'Vanguard', true], ['VHYL', 'vanguard.com', 'Vanguard', true], ['VWCE', 'vanguard.com', 'Vanguard', true], ['VWRL', 'vanguard.com', 'Vanguard', true], ['VUSA', 'vanguard.com', 'Vanguard', true],
  ['VEVE', 'vanguard.com', 'Vanguard', true], ['VFEM', 'vanguard.com', 'Vanguard', true], ['VWRP', 'vanguard.com', 'Vanguard', true],
  ['CSPX', 'ishares.com', 'iShares', true], ['SWDA', 'ishares.com', 'iShares', true], ['IWDA', 'ishares.com', 'iShares', true], ['EIMI', 'ishares.com', 'iShares', true], ['IUSA', 'ishares.com', 'iShares', true], ['SSAC', 'ishares.com', 'iShares', true],
  ['XDWD', 'dws.com', 'Xtrackers', true], ['XMME', 'dws.com', 'Xtrackers', true], ['SPY', 'ssga.com', 'SPDR', true], ['SPYD', 'ssga.com', 'SPDR', true], ['SPPW', 'ssga.com', 'SPDR', true],
  ['EQNR', 'equinor.com', 'Equinor'], ['DNB', 'dnb.no', 'DNB'], ['NHY', 'hydro.com', 'Norsk Hydro'], ['ORK', 'orkla.com', 'Orkla'], ['TEL', 'telenor.com', 'Telenor'], ['MOWI', 'mowi.com', 'Mowi'],
  ['YAR', 'yara.com', 'Yara'], ['KOG', 'kongsberg.com', 'Kongsberg Gruppen'], ['AKRBP', 'akerbp.com', 'Aker BP'], ['SALM', 'salmar.no', 'SalMar'], ['STB', 'storebrand.no', 'Storebrand'], ['GJF', 'gjensidige.no', 'Gjensidige'],
  ['AAPL', 'apple.com', 'Apple'], ['NVDA', 'nvidia.com', 'NVIDIA'], ['MSFT', 'microsoft.com', 'Microsoft'], ['AMZN', 'amazon.com', 'Amazon'], ['GOOGL', 'abc.xyz', 'Alphabet'], ['GOOG', 'abc.xyz', 'Alphabet'],
  ['META', 'meta.com', 'Meta'], ['TSLA', 'tesla.com', 'Tesla'], ['NFLX', 'netflix.com', 'Netflix'], ['ASML', 'asml.com', 'ASML'], ['NOVO', 'novonordisk.com', 'Novo Nordisk'], ['SPOT', 'spotify.com', 'Spotify'],
].map(([ticker, domain, issuer, etf = false]) => ({ ticker, domain, issuer, etf }));
const ISSUERS = [[/vanguard/i, 'vanguard.com', 'Vanguard'], [/ishares|blackrock/i, 'ishares.com', 'iShares'], [/xtrackers|dws/i, 'dws.com', 'Xtrackers'], [/spdr/i, 'ssga.com', 'SPDR'], [/amundi/i, 'amundi.com', 'Amundi'],
  [/invesco/i, 'invesco.com', 'Invesco'], [/\bdnb\b/i, 'dnb.no', 'DNB'], [/\bklp\b/i, 'klp.no', 'KLP'], [/storebrand/i, 'storebrand.no', 'Storebrand'], [/nordnet/i, 'nordnet.no', 'Nordnet'], [/handelsbanken/i, 'handelsbanken.no', 'Handelsbanken'],
  [/\bodin\b/i, 'odinfond.no', 'ODIN'], [/holberg/i, 'holberg.no', 'Holberg'], [/skagen/i, 'skagenfondene.no', 'Skagen'], [/alfred berg/i, 'alfredberg.no', 'Alfred Berg']];
const EXCH = { l: 'London', d: 'Xetra', o: 'Oslo', p: 'Paris', a: 'Amsterdam', m: 'Milano', s: 'Zürich', e: 'Madrid', b: 'Brussel' };
/** Trading 212-id → {ticker, exchange, raw}. «VUAGl_EQ» → VUAG · London; «AAPL_US_EQ» → AAPL · USA; «EQNR.OL» → Oslo. */
export function instrument42(raw) {
  const s = String(raw ?? '');
  let m;
  if ((m = s.match(/^([A-Z0-9.]+)_US_EQ$/))) return { ticker: m[1], exchange: 'USA', raw: s };
  if ((m = s.match(/^([A-Z0-9]+)([a-z])_EQ$/))) return { ticker: m[1], exchange: EXCH[m[2]] ?? null, raw: s };
  if ((m = s.match(/^([A-Z0-9]+)\.OL$/i))) return { ticker: m[1].toUpperCase(), exchange: 'Oslo', raw: s };
  return { ticker: s.replace(/(_[A-Z]{2})?_EQ$/, ''), exchange: null, raw: s };
}
/** Logo for en posisjon: kjent ticker → selskap/utsteder, ETF ut fra navnet → utsteder, ellers monogram. */
export function stockLogo42(p) {
  const ins = instrument42(p.ticker);
  const known = STOCKS.find((x) => x.ticker === ins.ticker);
  const iss = !known ? ISSUERS.find(([re]) => re.test(p.name ?? '')) : null;
  const domain = known?.domain ?? iss?.[1] ?? null;
  const etf = known?.etf ?? (!!iss || /\b(etf|ucits|index|indeks|fond|fund)\b/i.test(p.name ?? ''));
  const key = ins.ticker.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const hue = [...key].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return { tickerShort: ins.ticker, exchange: ins.exchange, subtitle: [ins.ticker, ins.exchange, p.currency].filter(Boolean).join(' · '), instrument: ins.raw,
    logo: domain ? { url: `/finans/api/aksjer/logo/${key}`, domain, issuer: known?.issuer ?? iss?.[2] ?? null, alt: known?.issuer ?? iss?.[2] ?? p.name ?? key } : null,
    monogram: { text: key.slice(0, 4), color: `hsl(${hue} 45% 42%)`, bg: `hsl(${hue} 45% 92%)` }, tickerBadge: etf ? key.slice(0, 5) : null, etf };
}
// ISIN → ticker for de vanligste (GET /aksjer/logo/:isin fra FinansHub web).
const ISIN42 = { US0378331005: 'AAPL', US67066G1040: 'NVDA', US5949181045: 'MSFT', US0231351067: 'AMZN', US02079K3059: 'GOOGL', US30303M1027: 'META', US88160R1014: 'TSLA', NO0010096985: 'EQNR', NO0010161896: 'DNB',
  NO0005052605: 'NHY', NO0003733800: 'ORK', NO0010063308: 'TEL', NO0003054108: 'MOWI', NO0010208051: 'YAR', IE00BFMXXD54: 'VUAG', IE00B8GKDB10: 'VHYL', IE00BK5BQT80: 'VWCE', IE00B3RBWM25: 'VWRL', IE00B5BMR087: 'CSPX', IE00B4L5Y983: 'SWDA' };
const domainOfKey = (key) => STOCKS.find((x) => x.ticker === (ISIN42[key] ?? key))?.domain ?? (/^IE00/.test(key) ? null : null);
const logoFails = new Map();
finans42Api.get('/aksjer/logo/:key', R, async (c) => {
  const key = String(c.req.param('key')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const d = validDomain(domainOfKey(key) ?? (ISSUERS.find(([, dom, name]) => name.toUpperCase().replace(/[^A-Z0-9]/g, '') === key)?.[1] ?? ''));
  if (!d) return c.body(null, 404, { 'Cache-Control': 'public, max-age=86400' });
  if ((logoFails.get(d) ?? 0) > Date.now()) return c.body(null, 404);
  const it = itemForDomain(d);
  let img = it?.id && logoFile(it.id) ? await readFile(logoFile(it.id)).catch(() => null) : null;
  if (!img) img = await faviconLogo(d).catch(() => null);
  if (!img || img.length < 100) { logoFails.set(d, Date.now() + 7 * 86400_000); return c.body(null, 404, { 'Cache-Control': 'public, max-age=86400' }); }
  const type = img[0] === 0x89 ? 'image/png' : img[0] === 0xff ? 'image/jpeg' : img[0] === 0x3c ? 'image/svg+xml' : 'image/x-icon';
  return c.body(img, 200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=2592000', 'X-Content-Type-Options': 'nosniff' });
});
finans42Api.get('/stocks', async (c, next) => {
  await next();
  if (c.res?.status !== 200) return;
  try {
    const j = await c.res.clone().json();
    const dec = (p) => ({ ...p, ...stockLogo42(p) });
    const names = new Map((j.positions ?? []).map((p) => [p.ticker, p]));
    const out = { ...j, positions: (j.positions ?? []).map(dec), orders: (j.orders ?? []).map((o) => ({ ...o, ...stockLogo42({ ...o, name: names.get(o.ticker)?.name, currency: names.get(o.ticker)?.currency }) })),
      dividends: (j.dividends ?? []).map((o) => ({ ...o, ...stockLogo42({ ...o, name: names.get(o.ticker)?.name, currency: names.get(o.ticker)?.currency }) })) };
    c.res = c.json(out, 200, { 'Cache-Control': 'no-store' });
  } catch { /* svaret står */ }
});
