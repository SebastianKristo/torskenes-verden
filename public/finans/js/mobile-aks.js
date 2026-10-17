// Aksjer i mobilappen (prompt 11, design «Aksjer Mobil»). Følger alltid appens tema: iOS med mørke glasskort,
// hvite pilleknapper og dempede pasteller; Android med Material You-fargene (var(--m3-…)).
// Skjermer: #/aks (portefølje), #/aks/<ticker> (aksje) og #/aks/tx (transaksjoner). Data fra /finans/api/stocks.
// Kjøp/Selg åpner Trading 212: API-nøkkelen har bare lesetilgang, så ordrer legges inn i Trading 212 selv.
import { api, esc, n0, n2, today, icon } from './core.js';
import { m, draw, flash, avatar, backBtn, theme } from './mobile.js';
import { haptic } from './mobile-haptics.js';

export const AK = { d: null, per: '1M', seg: 'all', q: '', txf: 'all', hi: null, busy: false };
const RG = [['1D', 1, 'i dag'], ['1U', 7, 'siste uke'], ['1M', 31, 'siste måned'], ['3M', 92, 'siste 3 måneder'], ['1Å', 365, 'siste år'], ['Alt', 1e5, 'totalt']];
const SEG = [['all', 'Alle'], ['stock', 'Aksjer'], ['etf', 'ETF'], ['cash', 'Kontanter']];
const TXF = [['all', 'Alle'], ['buy', 'Kjøp'], ['sell', 'Salg'], ['div', 'Utbytte']];
const TINTS = 6;

export async function aksLoad() {
  try { AK.d = await api('/stocks'); } catch (e) { AK.d = { error: e.message }; }
}

/* ---------- Hjelpere ---------- */

const cur = () => { const c = AK.d?.summary?.currency; return !c || c === 'NOK' ? 'kr' : c; };
const money = (v, dec = false) => `${(v ?? 0) < 0 ? '−' : ''}${dec ? n2(v) : n0(v)} ${cur()}`;
const pct = (v) => `${(v ?? 0) < 0 ? '−' : '+'}${Math.abs(v ?? 0).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const qty = (v) => (v ?? 0).toLocaleString('nb-NO', { maximumFractionDigits: 4 });
const chip = (v, txt) => `<span class="ak-chg ${(v ?? 0) < 0 ? 'dn' : 'up'}">${(v ?? 0) < 0 ? '↓' : '↑'} ${esc(txt ?? pct(v))}</span>`;
const isEtf = (p) => p.type === 'ETF' || /\bETF\b|UCITS|Vanguard|iShares|SPDR|Xtrackers|Invesco|Amundi|All-World|Index/i.test(`${p.name} ${p.ticker}`);
const days = () => RG.find(([k]) => k === AK.per)?.[1] ?? 31;
const perTxt = () => RG.find(([k]) => k === AK.per)?.[2] ?? '';
const tickerOf = (p) => p.ticker || p.symbol;
const t212 = (p) => `https://app.trading212.com/?ticker=${encodeURIComponent(tickerOf(p) ?? '')}`;
const dayTitle = (d) => { if (d === today()) return 'I dag'; const y = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE'); return d === y ? 'I går' : `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`; };

function series(hist, n) {
  const since = new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE');
  let s = (hist ?? []).filter((h) => h.date >= since);
  if (s.length < 2) s = (hist ?? []).slice(-2);
  return s;
}
// SVG-linje med fylt område. pts er tall; w×h er viewBox.
function path(vals, w, h, pad = 8) {
  if (vals.length < 2) vals = [vals[0] ?? 0, vals[0] ?? 0];
  const mx = Math.max(...vals), mn = Math.min(...vals), r = mx - mn || 1;
  const xy = vals.map((v, i) => [(i / (vals.length - 1)) * w, pad + (1 - (v - mn) / r) * (h - pad * 2)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return { d, area: `${d} L${w} ${h} L0 ${h} Z`, xy, mx, mn };
}
const spark = (vals, up) => { const p = path(vals, 80, 30, 3); return `<svg class="ak-spark ${up ? 'up' : 'dn'}" viewBox="0 0 80 30" preserveAspectRatio="none" aria-hidden="true"><path d="${p.d}"/></svg>`; };

// Kursserie for én aksje: posisjonens egen historikk hvis serveren sender den; demodata får formen fra porteføljen.
function posSeries(p) {
  if (Array.isArray(p.history) && p.history.length > 1) return { vals: p.history.map((h) => (typeof h === 'number' ? h : h.price ?? h.value)), dates: p.history.map((h) => h.date ?? '') , real: true };
  const h = series(AK.d?.history, days());
  if (AK.d?.mock && h.length > 1) { const last = h[h.length - 1].value || 1; return { vals: h.map((x) => (x.value / last) * p.price), dates: h.map((x) => x.date), real: true }; }
  return { vals: [p.avg, p.price], dates: ['Snittkurs', 'Nå'], real: false };
}
const posOf = (t) => (AK.d?.positions ?? []).find((p) => tickerOf(p) === t || p.symbol === t);

function head(title, sub, back, right = '') {
  const th = theme();
  return `<div class="m-row" style="justify-content:space-between">${backBtn(th, back[0], back[1])}<span class="m-row" style="gap:8px">${right}${avatar()}</span></div>
    <div style="padding:2px 4px 0"><div class="title m-ell">${esc(title)}</div>${sub ? `<div class="psub">${sub}</div>` : ''}</div>`;
}
const syncPill = () => { const t = AK.d?.syncedAt; return `<button class="ak-pill ghost" data-ak="sync" aria-label="Synk med Trading 212">${AK.busy ? '↻ …' : `↻ ${t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : 'Synk'}`}</button>`; };

/* ---------- Portefølje ---------- */

function overview() {
  const d = AK.d, pos = d.positions ?? [], s = d.summary ?? {};
  const pf = AK.seg === 'etf' ? pos.filter(isEtf) : AK.seg === 'stock' ? pos.filter((p) => !isEtf(p)) : AK.seg === 'cash' ? [] : pos;
  const invested = pos.reduce((a, p) => a + p.value, 0) || s.value || 0;
  const val = AK.seg === 'cash' ? s.cash ?? 0 : AK.seg === 'all' ? (s.total ?? invested + (s.cash ?? 0)) : pf.reduce((a, p) => a + p.value, 0);
  // Grafen: porteføljens historikk, skalert til andelen for Aksjer/ETF. Kontanter er en flat linje.
  const hist = series(d.history, days());
  const share = AK.seg === 'all' ? 1 : AK.seg === 'cash' ? 0 : invested ? val / invested : 0;
  const vals = AK.seg === 'cash' ? [val, val] : hist.map((h) => h.value * (AK.seg === 'all' ? 1 : share));
  const ch = AK.per === '1D' && AK.seg !== 'cash'
    ? (() => { const dv = pf.reduce((a, p) => a + (p.dayPct != null ? (p.value * p.dayPct) / (100 + p.dayPct) : 0), 0); return { v: dv, p: val ? (dv / (val - dv)) * 100 : 0 }; })()
    : { v: vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0, p: vals.length > 1 && vals[0] ? ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100 : 0 };
  const g = path(vals, 330, 130);
  const top = [...pf].sort((a, b) => b.value - a.value).slice(0, 3);
  return `${head('Aksjer', `Trading 212 · ${d.env === 'demo' ? 'Demo' : 'Invest'}${d.mock ? ' · eksempeldata' : ''}`, ['#/mer', 'Tilbake til Mer'], syncPill())}
    <div class="ak-hero"><span class="ak-lbl">${AK.seg === 'cash' ? 'Kontanter' : 'Porteføljeverdi'}</span><b class="ak-val">${money(val)}</b>
      <span class="m-row" style="gap:8px;flex-wrap:wrap">${chip(ch.p, `${pct(ch.p)} ${perTxt()}`)}<span class="ak-dim">${ch.v < 0 ? '−' : '+'}${n0(ch.v)} ${cur()}</span></span></div>
    <div class="ak-chart"><svg viewBox="0 0 330 130" preserveAspectRatio="none" role="img" aria-label="Utvikling ${esc(perTxt())}"><defs><linearGradient id="akg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".32"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${g.area}" fill="url(#akg)"/><path d="${g.d}" class="ln"/></svg></div>
    <div class="ak-rng" role="tablist" aria-label="Periode">${RG.map(([k]) => `<button role="tab" data-ak="per" data-v="${k}" aria-selected="${AK.per === k}">${k}</button>`).join('')}</div>
    <div class="ak-seg" role="tablist" aria-label="Filter">${SEG.map(([k, n]) => `<button role="tab" data-ak="seg" data-v="${k}" aria-selected="${AK.seg === k}">${n}</button>`).join('')}</div>
    ${AK.seg === 'cash' ? `<div class="ak-card"><div class="ak-row"><span class="ak-ini">${esc(cur())}</span><span class="m-grow"><b>Ledig kontantbeholdning</b><span class="ak-dim">Klar til å investere</span></span><b class="m-mono">${money(s.cash ?? 0)}</b></div></div>`
      : `${top.length ? `<div class="ak-h">Største posisjoner</div><div class="ak-tops">${top.map((p, i) => topCard(p, i)).join('')}</div>` : ''}
      <div class="ak-h phd"><span>Alle posisjoner</span><a class="pha" href="#/aks/tx">Transaksjoner ›</a></div>
      <div class="ak-card">${pf.map(posRow).join('') || '<div class="m-empty">Ingen posisjoner her.</div>'}</div>`}
    ${AK.seg === 'all' ? `<div class="ak-card"><div class="ak-row"><span class="ak-ini">${esc(cur())}</span><span class="m-grow"><b>Kontanter</b><span class="ak-dim">Ledig å investere</span></span><b class="m-mono">${money(s.cash ?? 0)}</b></div></div>` : ''}
    ${d.status || d.error ? `<div class="snote">${esc(d.error ?? d.status)}</div>` : ''}`;
}
function topCard(p, i) {
  const t = tickerOf(p);
  return `<div class="ak-top t${i % TINTS}"><a class="ak-topa" href="#/aks/${encodeURIComponent(t)}"><span class="ak-sym">${esc(p.symbol)}</span><b class="m-ell">${esc(p.name)}</b><span class="ak-big">${money(p.value)}</span>${chip(p.plPct)}</a>
    <span class="ak-btns"><button class="ak-pill" data-ak="buy" data-t="${esc(t)}">Kjøp</button><button class="ak-pill ghost" data-ak="sell" data-t="${esc(t)}">Selg</button></span></div>`;
}
function posRow(p) {
  const v = posSeries(p).vals, dp = p.dayPct ?? p.plPct ?? 0;
  return `<a class="ak-row" href="#/aks/${encodeURIComponent(tickerOf(p))}"><span class="ak-ini">${esc(String(p.symbol ?? '').slice(0, 4))}</span><span class="m-grow" style="min-width:0"><b class="m-ell">${esc(p.name)}</b><span class="ak-dim m-ell">${qty(p.quantity)} stk · ${money(p.price, true)}</span></span>
    ${spark(v, (v[v.length - 1] ?? 0) >= (v[0] ?? 0))}<span class="ak-r"><b class="m-mono">${money(p.value)}</b>${chip(dp)}</span></a>`;
}

/* ---------- Aksje ---------- */

function detail(t) {
  const p = posOf(t);
  if (!p) return `${head('Aksjer', '', ['#/aks', 'Tilbake til Aksjer'])}<div class="m-empty">Fant ikke ${esc(t)} i porteføljen.</div>`;
  const s = posSeries(p), g = path(s.vals, 330, 160, 14);
  const hi = AK.hi != null && AK.hi < s.vals.length ? AK.hi : s.vals.indexOf(Math.max(...s.vals));
  const [mx, my] = g.xy[hi] ?? [0, 0];
  const first = s.vals[0] ?? p.price, ch = first ? ((p.price - first) / first) * 100 : 0;
  const val = AK.d.summary?.value || 1;
  const ord = [...(AK.d.orders ?? []).filter((o) => o.ticker === p.ticker || o.symbol === p.symbol).map((o) => ({ ...o, k: o.side === 'Salg' ? 'sell' : 'buy' })),
    ...(AK.d.dividends ?? []).filter((o) => o.ticker === p.ticker || o.symbol === p.symbol).map((o) => ({ ...o, k: 'div', value: o.amount }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const tipL = Math.min(78, Math.max(4, (mx / 330) * 100));
  return `${head(p.name, `${esc(p.symbol)} · Trading 212`, ['#/aks', 'Tilbake til Aksjer'])}
    <div class="ak-hero"><span class="ak-lbl">Kurs</span><b class="ak-val">${money(p.price, true)}</b><span class="m-row" style="gap:8px">${chip(s.real ? ch : p.plPct, `${pct(s.real ? ch : p.plPct)} ${s.real ? perTxt() : 'siden kjøp'}`)}</span></div>
    <div class="ak-chart det" data-akchart="${s.vals.length}"><svg viewBox="0 0 330 160" preserveAspectRatio="none" role="img" aria-label="Kursgraf"><defs><linearGradient id="akg2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".3"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${g.area}" fill="url(#akg2)"/><path d="${g.d}" class="ln"/><line x1="${mx}" x2="${mx}" y1="0" y2="160" class="mk"/></svg>
      <i class="ak-dot" style="left:${(mx / 330) * 100}%;top:${(my / 160) * 100}%"></i><span class="ak-tip" style="left:${tipL}%">${money(s.vals[hi], true)}<small>${esc(s.dates[hi] ? (/^\d{4}-/.test(s.dates[hi]) ? `${s.dates[hi].slice(8, 10)}.${s.dates[hi].slice(5, 7)}` : s.dates[hi]) : '')}</small></span></div>
    ${s.real ? `<div class="ak-rng" role="tablist" aria-label="Periode">${RG.map(([k]) => `<button role="tab" data-ak="per" data-v="${k}" aria-selected="${AK.per === k}">${k}</button>`).join('')}</div>` : '<div class="snote">Kursgraf per aksje vises når serveren lagrer kurshistorikk. Linjen går fra snittkurs til kurs nå.</div>'}
    <div class="ak-h">Min posisjon</div>
    <div class="ak-stats">${[['Antall', `${qty(p.quantity)} stk`], ['Verdi', money(p.value)], ['Snittkurs', money(p.avg, true)], ['Avkastning', `${(p.pl ?? 0) < 0 ? '−' : '+'}${n0(p.pl)} ${cur()}`, (p.pl ?? 0) < 0 ? 'dn' : 'up'], ['I dag', p.dayPct != null ? pct(p.dayPct) : '–', (p.dayPct ?? 0) < 0 ? 'dn' : 'up'], ['Andel', `${Math.round((p.value / val) * 100)} %`]]
      .map(([l, v, c]) => `<div class="ak-stat"><span>${l}</span><b class="m-mono ${c ?? ''}">${esc(v)}</b></div>`).join('')}</div>
    ${ord.length ? `<div class="ak-h">Handler i ${esc(p.symbol)}</div><div class="ak-card">${ord.map(txRow).join('')}</div>` : ''}
    <div class="ak-fixed"><button class="ak-pill ghost lg" data-ak="sell" data-t="${esc(tickerOf(p))}">Selg</button><button class="ak-pill lg" data-ak="buy" data-t="${esc(tickerOf(p))}">Kjøp</button></div>`;
}

/* ---------- Transaksjoner ---------- */

const ST = (o) => (o.k === 'div' ? ['Utført', 'up'] : /FILLED|EXECUTED/i.test(o.status ?? 'FILLED') ? ['Utført', 'up'] : /REJECT|CANCEL/i.test(o.status) ? ['Avvist', 'dn'] : ['Venter', 'bl']);
function txRow(o) {
  const [st, c] = ST(o), lbl = { buy: 'Kjøp', sell: 'Salg', div: 'Utbytte' }[o.k];
  return `<div class="ak-row"><span class="ak-ini ${o.k}">${o.k === 'div' ? '%' : o.k === 'sell' ? '−' : '+'}</span><span class="m-grow" style="min-width:0"><b class="m-ell">${lbl} ${esc(o.symbol)}</b><span class="ak-dim m-ell">${o.k === 'div' ? 'Utbetalt' : `${qty(o.quantity)} stk à ${money(o.price, true)}`}</span></span>
    <span class="ak-r"><b class="m-mono ${o.k === 'div' ? 'up' : ''}">${o.k === 'div' ? '+' : o.k === 'sell' ? '+' : '−'}${money(o.value, true)}</b><span class="ak-st ${c}">${st}</span></span></div>`;
}
function txs() {
  const d = AK.d, q = AK.q.trim().toLowerCase();
  const all = [...(d.orders ?? []).map((o) => ({ ...o, k: o.side === 'Salg' ? 'sell' : 'buy' })), ...(d.dividends ?? []).map((o) => ({ ...o, k: 'div', value: o.amount }))]
    .filter((o) => AK.txf === 'all' || o.k === AK.txf)
    .filter((o) => !q || `${o.symbol} ${o.ticker} ${posOf(o.ticker)?.name ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const by = new Map();
  for (const o of all) (by.get(o.date) ?? by.set(o.date, []).get(o.date)).push(o);
  return `${head('Transaksjoner', 'Kjøp, salg og utbytte fra Trading 212', ['#/aks', 'Tilbake til Aksjer'])}
    <form class="search ak-search" data-aksearch role="search"><span style="opacity:.7">${icon('search', 18)}</span><input class="m-input" id="m-akq" type="search" value="${esc(AK.q)}" placeholder="Søk etter aksje" aria-label="Søk i transaksjoner" enterkeyhint="search"></form>
    <div class="ak-seg" role="tablist">${TXF.map(([k, n]) => `<button role="tab" data-ak="txf" data-v="${k}" aria-selected="${AK.txf === k}">${n}</button>`).join('')}</div>
    <div id="m-aktx">${[...by].map(([dt, l]) => `<div class="ak-h">${esc(dayTitle(String(dt)))}</div><div class="ak-card">${l.map(txRow).join('')}</div>`).join('') || '<div class="m-empty">Ingen transaksjoner.</div>'}</div>`;
}

/* ---------- Visning og hendelser ---------- */

export function aksView(sub) {
  const d = AK.d, back = ['#/mer', 'Tilbake til Mer'];
  const wrap = (h) => `<div class="aks">${h}</div>`;
  if (!d) return wrap(`${head('Aksjer', '', back)}<div class="m-spin"></div>`);
  if (d.error && !d.summary) return wrap(`${head('Aksjer', '', back)}<div class="ak-card"><div class="ak-row"><span class="m-grow">${esc(d.error)}</span></div></div><a class="ak-pill lg" href="#/set/t212" style="align-self:flex-start">Innstillinger · Trading 212</a>`);
  if (!d.configured && !d.mock) return wrap(`${head('Aksjer', 'Trading 212', back)}<div class="ak-card"><div class="ak-row"><span class="m-grow">Ikke koblet til. Legg inn API-nøkkel og secret fra Trading 212 (Innstillinger → API (Beta), bare lesetilgang).</span></div></div><a class="ak-pill lg" href="#/set/t212" style="align-self:flex-start">Koble til Trading 212</a>`);
  return wrap(sub === 'tx' ? txs() : sub ? detail(decodeURIComponent(sub)) : overview());
}

export async function aksBind(e, t) {
  if (m.screen !== 'aks') return false;
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'input' && t.id === 'm-akq') { AK.q = t.value; draw(); return true; }
  if (e.type === 'submit' && d('[data-aksearch]')) { e.preventDefault(); t.querySelector?.('input')?.blur(); return true; }
  if (e.type !== 'click') return false;
  if ((x = d('[data-akchart]'))) {
    const r = x.getBoundingClientRect(), n = +x.dataset.akchart;
    AK.hi = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))); haptic('tick'); draw(); return true;
  }
  if (!(x = d('[data-ak]'))) return false;
  e.preventDefault();
  const k = x.dataset.ak, v = x.dataset.v;
  if (k === 'per') { AK.per = v; AK.hi = null; }
  else if (k === 'seg') AK.seg = v;
  else if (k === 'txf') AK.txf = v;
  else if (k === 'buy' || k === 'sell') {
    const p = posOf(x.dataset.t) ?? { ticker: x.dataset.t, name: x.dataset.t };
    flash(`Åpner ${k === 'buy' ? 'kjøp' : 'salg'} av ${p.name} i Trading 212`);
    window.open(t212(p), '_blank', 'noopener');
    return true;
  } else if (k === 'sync') {
    if (AK.busy) return true;
    AK.busy = true; draw();
    try { AK.d = await api('/stocks/sync', { method: 'POST' }); flash('Synket med Trading 212'); }
    catch (err) { haptic('err'); flash(err.message); }
    AK.busy = false;
  }
  draw(); return true;
}
