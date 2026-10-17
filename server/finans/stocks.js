// Aksjer fra Trading 212 (Public API v0). Nøkkel og secret ligger kryptert på serveren og sendes aldri til nettleseren.
// Autentisering: Authorization: Basic base64(KEY:SECRET). Svarene caches i 60 s (API-et har strenge rate limits),
// og et dagsbilde av porteføljen lagres slik at vi kan tegne porteføljeverdi over tid og «i dag»-endring per posisjon.
import { kv, OWNER } from '../db.js';
import { settings, secret, secretSource } from './db.js';

const BASE = { live: 'https://live.trading212.com/api/v0', demo: 'https://demo.trading212.com/api/v0' };
export const t212Base = (env = settings().t212Env) => BASE[env === 'demo' ? 'demo' : 'live'];
const MOCK = process.env.MOCK_DATA === '1';
const TTL = 60_000;
let cache = null, inflight = null;

// Limte verdier har ofte med seg mellomrom, linjeskift, usynlige tegn, anførselstegn eller «Basic »/«Bearer » foran.
export function cleanCred(v) {
  let s = String(v ?? '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
  for (let i = 0; i < 2; i++) s = s.replace(/^(?:Basic|Bearer)\s+/i, '').replace(/^(['"`«»“”])(.*)\1$/s, '$2').replace(/^["'`“”«](.*)["'`“”»]$/s, '$1').trim();
  return s.replace(/\s+/g, '');
}
// En lagret verdi som ikke kan dekrypteres skal ikke falle tilbake til en (gammel) nøkkel i .env – da blandes nøkkel og secret.
const val = (k) => (secretSource(k) === 'undecryptable' ? '' : secret(k));
const creds = () => ({ key: cleanCred(val('t212Key')), secret: cleanCred(val('t212Secret')) });
export const t212Configured = () => { const c = creds(); return !!(c.key && c.secret); };

// Authorization-headeren: Basic base64(KEY:SECRET) uten linjeskift. Eldre nøkler (uten secret) sendes rått.
export function t212AuthHeader(key, sec, style = 'basic') {
  const k = cleanCred(key), s = cleanCred(sec);
  if (style === 'legacy' || !s) return k;
  return 'Basic ' + Buffer.from(`${k}:${s}`, 'utf8').toString('base64');
}

// Hvilken tilgang (scope) et endepunkt krever – brukes i 403-meldingen.
const SCOPE = [[/^\/equity\/account/, 'account'], [/^\/equity\/portfolio/, 'portfolio'], [/^\/equity\/history\/orders/, 'history:orders'],
  [/^\/history\/dividends/, 'history:dividends'], [/^\/history\/transactions/, 'history:transactions'], [/^\/equity\/metadata/, 'metadata'], [/^\/equity\/orders/, 'orders:read']];
export function t212Error(status, path = '', { env = 'live', retryAfter } = {}) {
  const scope = SCOPE.find(([re]) => re.test(path))?.[1];
  const other = env === 'demo' ? 'Live' : 'Demo';
  if (status === 401) return Object.assign(new Error(`Trading 212 avviste nøkkelen (401): nøkkel-ID eller secret er feil, eller nøkkelen er laget for ${other} og ikke ${env === 'demo' ? 'Demo' : 'Live'}. Lim inn begge på nytt, og sjekk at miljøet stemmer.`), { status, code: 'unauthorized' });
  if (status === 403) return Object.assign(new Error(`Trading 212 nektet tilgang (403)${scope ? ` til «${scope}»` : ''}: nøkkelen mangler denne tilgangen, eller den er låst til en annen IP-adresse enn serverens. Rediger nøkkelen hos Trading 212 og slå på tilgangen${scope ? ` «${scope}»` : 'e'}.`), { status, code: 'forbidden', scope });
  if (status === 429) return Object.assign(new Error(`Trading 212: for mange kall (429). Vent${retryAfter ? ` ${retryAfter} s` : ' litt'} og prøv igjen.`), { status, code: 'rate_limited' });
  if (status === 404) return Object.assign(new Error(`Trading 212 fant ikke ${path} (404). Kontotypen (f.eks. CFD) støttes kanskje ikke – API-et virker for Invest og Stocks ISA.`), { status, code: 'not_found' });
  return Object.assign(new Error(`Trading 212 svarte ${status}`), { status, code: 'http' });
}

// Prøver Basic-auth først. Ved 401 prøves eldre nøkkelformat (rå nøkkel) én gang, og stilen som virker huskes.
async function request(path, { key, sec, env, style }) {
  const res = await fetch(t212Base(env) + path, { headers: { Authorization: t212AuthHeader(key, sec, style), Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  return res;
}
async function call(path, c = null) {
  const cr = c ?? { ...creds(), env: settings().t212Env };
  const auth = { key: cr.key, sec: cr.secret, env: cr.env };
  let style = kv.get(OWNER, 'fh_t212_auth', 'basic');
  let res = await request(path, { ...auth, style });
  if (res.status === 401 && style === 'basic') {
    const legacy = await request(path, { ...auth, style: 'legacy' });
    if (legacy.ok) { style = 'legacy'; res = legacy; if (!c) kv.set(OWNER, 'fh_t212_auth', 'legacy'); }
  } else if (res.status === 401 && style === 'legacy') {
    const basic = await request(path, { ...auth, style: 'basic' });
    if (basic.ok) { style = 'basic'; res = basic; if (!c) kv.set(OWNER, 'fh_t212_auth', 'basic'); }
  }
  if (res.status === 401) console.warn(`[t212] 401 på ${path} (${auth.env}) · nøkkel ${auth.key.length} tegn, secret ${auth.sec.length} tegn`);
  if (!res.ok) throw t212Error(res.status, path, { env: auth.env, retryAfter: res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset') });
  return res.json();
}

// «Test tilkobling»: henter kontosammendraget med lagrede verdier, eller med verdier fra skjemaet før de lagres.
// Ved 401 sjekkes også det andre miljøet, så brukeren får vite om nøkkelen hører til Demo i stedet for Live.
export async function testT212({ key, secret: sec, env } = {}) {
  const k = cleanCred(key) || creds().key, s = cleanCred(sec) || creds().secret;
  const e = env === 'demo' || env === 'live' ? env : settings().t212Env;
  if (MOCK && !k) return { ok: true, env: e, currency: 'NOK', total: 0, message: 'Demodata (MOCK_DATA=1) – ingen ekte kall', mock: true };
  const broken = ['t212Key', 't212Secret'].filter((x) => secretSource(x) === 'undecryptable');
  if (broken.length && !cleanCred(key) && !cleanCred(sec)) return { ok: false, env: e, code: 'undecryptable', message: 'Lagret nøkkel/secret kan ikke dekrypteres fordi SECRET_KEY eller SESSION_SECRET er endret. Lim inn nøkkel-ID og secret på nytt.' };
  if (!k) return { ok: false, env: e, code: 'missing', message: 'Nøkkel-ID mangler.' };
  if (!s) return { ok: false, env: e, code: 'missing', message: 'Secret mangler. Nye nøkler fra Trading 212 har både nøkkel-ID og secret.' };
  const lens = { keyLength: k.length, secretLength: s.length };
  try {
    let d;
    try { d = await call('/equity/account/summary', { key: k, secret: s, env: e }); } catch (err) { if (err.status !== 404) throw err; d = await call('/equity/account/cash', { key: k, secret: s, env: e }); }
    const sum = normSummary(d.totalValue != null || d.investments ? d : null, d);
    return { ok: true, env: e, currency: sum.currency, total: sum.total, message: `Tilkoblet ${e === 'demo' ? 'Demo' : 'Live'} · ${Math.round(sum.total).toLocaleString('nb-NO')} ${sum.currency}`, ...lens };
  } catch (err) {
    if (err.status === 401) {
      const other = e === 'demo' ? 'live' : 'demo';
      try { await call('/equity/account/summary', { key: k, secret: s, env: other }); return { ok: false, env: e, code: 'wrong_env', suggest: other, message: `Nøkkelen virker mot ${other === 'demo' ? 'Demo' : 'Live'}, ikke ${e === 'demo' ? 'Demo' : 'Live'}. Bytt miljø og lagre.`, ...lens }; } catch {}
    }
    const msg = err.name === 'TimeoutError' ? 'Trading 212 svarte ikke innen 15 s.' : /fetch failed|ENOTFOUND|ECONN/i.test(err.message + (err.cause?.code ?? '')) ? `Fikk ikke kontakt med ${t212Base(e)} (${err.cause?.code ?? 'nettverksfeil'}).` : err.message;
    return { ok: false, env: e, code: err.code ?? 'network', status: err.status, message: msg, ...lens };
  }
}
const items = (d) => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []);
// «AAPL_US_EQ» → AAPL, «EQNRo_EQ» → EQNR (liten bokstav = børs).
const tk = (t) => String(t ?? '').replace(/(_[A-Z]{2})?_EQ$/, '').replace(/[a-z]$/, '');

// Kontosammendrag: nytt format (/equity/account/summary) eller eldre (/equity/account/cash).
function normSummary(s, cash) {
  if (s && (s.totalValue != null || s.investments)) {
    const inv = s.investments ?? {};
    return { currency: s.currency ?? 'EUR', total: +s.totalValue || 0, invested: +inv.totalCost || 0, value: +inv.currentValue || 0,
      result: +inv.unrealizedProfitLoss || 0, realized: +inv.realizedProfitLoss || 0, cash: +(s.cash?.availableToTrade ?? s.cash?.free ?? 0) };
  }
  const c = cash ?? s ?? {};
  return { currency: c.currencyCode ?? 'EUR', total: +c.total || 0, invested: +c.invested || 0, value: (+c.invested || 0) + (+c.ppl || 0), result: +c.ppl || 0, realized: +c.result || 0, cash: +c.free || 0 };
}
function normPositions(list, names = {}) {
  return items(list).map((p) => {
    const ticker = p.ticker ?? p.instrument?.ticker ?? '';
    const qty = +(p.quantity ?? 0), avg = +(p.averagePrice ?? p.averagePricePaid ?? 0), px = +(p.currentPrice ?? 0);
    const value = +(p.walletImpact?.currentValue ?? qty * px);
    const pl = +(p.ppl ?? p.walletImpact?.unrealizedProfitLoss ?? value - qty * avg);
    return { ticker, symbol: tk(ticker), name: names[ticker]?.name ?? p.instrument?.name ?? tk(ticker), currency: names[ticker]?.currency ?? p.instrument?.currency ?? null,
      quantity: qty, avg, price: px, value, pl, plPct: qty * avg ? (pl / (qty * avg)) * 100 : 0, fxPl: +(p.fxPpl ?? 0) };
  }).sort((a, b) => b.value - a.value);
}
function normOrders(list) {
  return items(list).map((x) => {
    const o = x.order ?? x, f = x.fill ?? {};
    const qty = +(o.filledQuantity ?? o.quantity ?? f.quantity ?? o.orderedQuantity ?? 0);
    const value = +(o.filledValue ?? f.walletImpact?.netValue ?? (qty * +(o.fillPrice ?? f.price ?? 0)));
    return { id: String(o.id ?? o.fillId ?? ''), ticker: o.ticker ?? o.instrument?.ticker ?? '', symbol: tk(o.ticker ?? o.instrument?.ticker), side: qty < 0 || o.side === 'SELL' ? 'Salg' : 'Kjøp',
      quantity: Math.abs(qty), value: Math.abs(value), price: +(o.fillPrice ?? f.price ?? 0), status: o.status ?? '', date: String(o.dateExecuted ?? o.dateModified ?? o.createdAt ?? f.filledAt ?? o.dateCreated ?? '').slice(0, 10) };
  }).filter((o) => !o.status || /FILLED|EXECUTED/i.test(o.status));
}
const normDividends = (list) => items(list).map((d) => ({ ticker: d.ticker ?? '', symbol: tk(d.ticker), amount: +(d.amount ?? 0), perShare: +(d.grossAmountPerShare ?? 0), quantity: +(d.quantity ?? 0), date: String(d.paidOn ?? '').slice(0, 10) }));

// Dagsbilder: total verdi og kurs per ticker, maks to år.
function snapshot(summary, positions) {
  const day = new Date().toLocaleDateString('sv-SE');
  const hist = kv.get(OWNER, 'fh_t212_hist', []).filter((h) => h.date !== day);
  hist.push({ date: day, value: Math.round(summary.total * 100) / 100, prices: Object.fromEntries(positions.map((p) => [p.ticker, p.price])) });
  kv.set(OWNER, 'fh_t212_hist', hist.slice(-730));
  return hist;
}
function dayChange(positions, hist) {
  const day = new Date().toLocaleDateString('sv-SE');
  const prev = [...hist].reverse().find((h) => h.date < day);
  for (const p of positions) { const old = prev?.prices?.[p.ticker]; p.dayPct = old ? ((p.price - old) / old) * 100 : null; }
}

// Instrumentnavn: tung liste med lav rate limit, hentes maks én gang i døgnet.
async function instrumentNames() {
  const c = kv.get(OWNER, 'fh_t212_names', null);
  if (c && Date.now() - c.at < 86400_000) return c.map;
  try {
    const list = await call('/equity/metadata/instruments');
    const map = Object.fromEntries(items(list).map((i) => [i.ticker, { name: i.shortName && i.name ? i.name : i.name ?? i.shortName, currency: i.currencyCode }]));
    kv.set(OWNER, 'fh_t212_names', { at: Date.now(), map });
    return map;
  } catch { return c?.map ?? {}; }
}

async function fetchAll() {
  const names = await instrumentNames();
  let summary;
  try { summary = normSummary(await call('/equity/account/summary')); } catch (e) { if (e.status !== 404) throw e; summary = normSummary(null, await call('/equity/account/cash')); }
  const positions = normPositions(await call('/equity/portfolio'), names);
  let orders = [], dividends = [], partial = null;
  try { orders = normOrders(await call('/equity/history/orders?limit=50')); } catch (e) { partial = e.message; }
  try { dividends = normDividends(await call('/history/dividends?limit=50')); } catch (e) { partial = e.message; }
  const hist = snapshot(summary, positions);
  dayChange(positions, hist);
  return { summary, positions, orders, dividends, history: hist.map((h) => ({ date: h.date, value: h.value })), partial };
}

export async function stocks({ force = false } = {}) {
  const env = settings().t212Env;
  if (!t212Configured()) {
    if (MOCK) return { ...mock(), configured: false, mock: true, env, base: t212Base(env) };
    return { configured: false, env, base: t212Base(env), status: 'Ikke koblet til – legg inn API-nøkkel og secret' };
  }
  if (!force && cache && Date.now() - cache.at < TTL) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const d = await fetchAll();
      const data = { ...d, configured: true, env, base: t212Base(env), syncedAt: Date.now(), status: d.partial ? `Synkronisert · ${d.partial}` : 'Synkronisert' };
      cache = { at: Date.now(), data };
      kv.set(OWNER, 'fh_t212_cache', data);
      return data;
    } catch (e) {
      // Ved feil (f.eks. 429) vises siste gode svar med feilmeldingen.
      const last = cache?.data ?? kv.get(OWNER, 'fh_t212_cache', null);
      return { ...(last ?? { summary: null, positions: [], orders: [], dividends: [], history: [] }), configured: true, env, base: t212Base(env), error: e.message, status: e.message };
    } finally { inflight = null; }
  })();
  return inflight;
}
export const resetStocks = () => { cache = null; };
// Siste kjente data uten nye kall (backup/Excel).
export const cachedStocks = () => cache?.data ?? kv.get(OWNER, 'fh_t212_cache', null);

/* ---------------- Demodata (MOCK_DATA=1) ---------------- */

function mock() {
  const P = [['AAPL_US_EQ', 'Apple', 12, 1690.2, 2468.4, 1.2], ['NVDA_US_EQ', 'NVIDIA', 18, 980.5, 1512.8, -0.8], ['EQNRo_EQ', 'Equinor', 60, 278.4, 262.9, 0.4],
    ['VWCEd_EQ', 'Vanguard FTSE All-World', 40, 1104.0, 1352.6, 0.3], ['MSFT_US_EQ', 'Microsoft', 6, 3880.0, 4710.2, 0.9], ['NHYo_EQ', 'Norsk Hydro', 120, 61.2, 68.9, -1.1]];
  const positions = P.map(([ticker, name, quantity, avg, price, dayPct]) => {
    const value = quantity * price, pl = value - quantity * avg;
    return { ticker, symbol: tk(ticker), name, currency: 'NOK', quantity, avg, price, value, pl, plPct: (pl / (quantity * avg)) * 100, fxPl: 0, dayPct };
  });
  const value = positions.reduce((a, p) => a + p.value, 0), invested = positions.reduce((a, p) => a + p.quantity * p.avg, 0);
  const history = Array.from({ length: 365 }, (_, i) => {
    const d = new Date(Date.now() - (364 - i) * 86400_000);
    const end = value + 8420, start = invested * 0.86;
    return { date: d.toLocaleDateString('sv-SE'), value: Math.round((start + (end - start) * (i / 364) + (Math.sin(i / 9) * 2200 + Math.sin(i / 31) * 5200) * (1 - i / 364)) * 100) / 100 };
  });
  const days = (n) => new Date(Date.now() - n * 86400_000).toLocaleDateString('sv-SE');
  return {
    summary: { currency: 'NOK', total: value + 8420, invested, value, result: value - invested, realized: 3120, cash: 8420 },
    positions, history, syncedAt: Date.now(), status: 'Demodata (MOCK_DATA=1)',
    orders: [['NVDA_US_EQ', 'Kjøp', 4, 6020, 3], ['VWCEd_EQ', 'Kjøp', 10, 13400, 12], ['NHYo_EQ', 'Salg', 30, 2070, 21], ['AAPL_US_EQ', 'Kjøp', 2, 4890, 40]]
      .map(([t, side, quantity, v, n], i) => ({ id: String(i + 1), ticker: t, symbol: tk(t), side, quantity, value: v, price: v / quantity, status: 'FILLED', date: days(n) })),
    dividends: [['EQNRo_EQ', 412.8, 6], ['MSFT_US_EQ', 52.4, 28], ['AAPL_US_EQ', 31.2, 55], ['NHYo_EQ', 540, 140]]
      .map(([t, amount, n]) => ({ ticker: t, symbol: tk(t), amount, perShare: 0, quantity: 0, date: days(n) })),
  };
}
