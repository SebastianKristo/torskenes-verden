// FinansHub mobil (PWA). Tema: iOS Liquid Glass på iPhone/iPad, ellers Android Material 3 Expressive.
// ≥ 600 px (åpen brettbar): navigasjonsrail + to paneler. Henter kun fra /finans/api.
import {
  S, api, esc, n0, n2, sgn, neg, dd, dWeek, dLong, today, monthName, cap, ini, rgba, greet, parseAmount,
  render, loadBoot, loadSummary, loadTx, loadReceipts, catById, cats, accs, uploadReceipt, icon,
} from './core.js';

const u = S.ui;
const m = { screen: 'hjem', sel: null, budSel: null, rc: null, filter: '', toast: '', theme: null };
const root = () => document.getElementById('app');
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const theme = () => { try { const t = localStorage.getItem('fh_theme'); if (t === 'ios' || t === 'and') return t; } catch {} return isIOS() ? 'ios' : 'and'; };
const two = () => matchMedia('(min-width: 600px)').matches;
const SCREENS = [['hjem', 'Hjem', 'home'], ['liste', 'Liste', 'list'], ['budsjett', 'Budsjett', 'bud'], ['meg', 'Meg', 'me']];
const amtC = (v, th) => (v > 0 ? '#9FE3C6' : th === 'and' ? '#F0DFD7' : '#fff');

/* ---------- Byggeklosser ---------- */

const txItem = (t, th, on) => `<button class="item${on ? ' on' : ''}" data-tx="${t.id}"><span class="m-ini" style="background:${rgba(t.color, 0.18)};color:${t.color}">${esc(ini(t.description))}</span>
  <span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(t.description)}</span><span class="m-ell s">${dd(t.date)} · ${esc(t.category)}</span></span>
  <span class="m-mono" style="font-weight:600;color:${amtC(t.amount, th)}">${sgn(t.amount)}</span></button>`;

function groups(items, th) {
  const by = new Map();
  for (const t of items) (by.get(t.date) ?? by.set(t.date, []).get(t.date)).push(t);
  return [...by].map(([d, list]) => `<div class="sec">${cap(dWeek(d))}</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${list.map((t) => txItem(t, th, m.sel === t.id)).join('')}</div>`).join('');
}

function hero(th) {
  const s = S.summary;
  if (!s) return `<div class="hero ${th === 'ios' ? 'glass' : ''}"><div class="m-spin"></div></div>`;
  const pct = s.budgetTotal ? Math.min(100, (s.budgetUsed / s.budgetTotal) * 100) : 0;
  return `<div class="hero ${th === 'ios' ? 'glass' : ''}"><div class="lbl">Igjen å bruke${th === 'ios' ? ` i ${monthName(s.month)}` : ''}</div>
    <div class="amt">${neg(s.left).replace(/,\d\d$/, '')}<small> kr</small></div>
    <div class="m-bar"><i style="width:${pct}%;background:#FF8A4C"></i></div>
    <div class="foot"><span>Brukt ${n0(s.budgetUsed)} kr</span><span>${n0(Math.max(0, s.left) / s.daysLeft)} kr/dag</span></div></div>`;
}

const reviewCta = (th) => {
  const q = (S.summary?.review ?? []).filter((r) => r.status === 'needs_review');
  if (!q.length) return '';
  return `<a class="cta ${th === 'ios' ? 'glass' : ''}" href="#/skann"><span class="n">${q.length}</span><span class="m-grow"><b style="display:block;font-weight:600">${th === 'ios' ? 'Kvitteringer til gjennomgang' : 'Til gjennomgang'}</b><span class="m-ell" style="font-size:13px;opacity:.75">${esc(q.map((r) => r.merchant ?? 'Ny').join(' · '))}</span></span><span style="font-size:20px;opacity:.6">›</span></a>`;
};

/* ---------- Skjermer ---------- */

function home(th) {
  const s = S.summary, st = S.boot.settings;
  const yearPct = s && s.yearGoal ? Math.round((s.savedYear / s.yearGoal) * 100) : null;
  return `<div class="m-row" style="justify-content:space-between;align-items:flex-end;padding:6px 4px 0"><div><div class="hello">${greet()}, ${esc(st.name)}</div><div class="title">${cap(monthName(S.summary?.month ?? today().slice(0, 7)))}</div></div><a class="m-av" href="#/meg" aria-label="Meg">${esc(ini(st.name))}</a></div>
    ${hero(th)}
    ${th === 'and' && s ? `<div class="tiles"><div class="tile"><span>Inn</span><b>${n0(s.inn)}</b></div><div class="tile"><span>Spart i år</span><b>${yearPct !== null ? yearPct + ' %' : n0(s.savedYear)}</b></div></div>` : ''}
    ${reviewCta(th)}
    <div class="sec">Siste</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${(s?.recent ?? []).slice(0, 6).map((t) => txItem(t, th, m.sel === t.id)).join('') || '<div class="m-empty">Ingen transaksjoner ennå.</div>'}</div>`;
}

function list(th) {
  const items = S.tx?.items ?? null;
  const chips = [['', 'Alle'], ['ut', 'Utgifter'], ['inn', 'Inntekter']].map(([k, n]) => `<button class="chip" data-filter="${k}" aria-pressed="${m.filter === k}">${n}</button>`).join('');
  return `<div class="title" style="padding:6px 4px 0">Transaksjoner</div>
    <form class="search ${th === 'ios' ? 'glass2' : ''}" data-msearch role="search"><span style="opacity:.7">${icon('search', 18)}</span><input class="m-input" name="q" value="${esc(u.q)}" placeholder="${th === 'ios' ? 'Søk' : 'Søk i transaksjoner'}" aria-label="Søk" enterkeyhint="search"></form>
    <div style="display:flex;gap:8px;overflow-x:auto">${chips}</div>
    ${items === null ? '<div class="m-spin"></div>' : groups(items, th) || '<div class="m-empty">Ingen treff.</div>'}`;
}

function budget(th) {
  const s = S.summary;
  if (!s) return '<div class="m-spin"></div>';
  const rows = s.budgets.filter((b) => b.budget).sort((a, b) => b.used / b.budget - a.used / a.budget);
  return `<div class="title" style="padding:6px 4px 0">Budsjett</div>${hero(th)}
    ${rows.map((b) => { const o = b.used > b.budget, on = m.budSel === b.categoryId;
      return `<button class="${th === 'ios' ? 'glass2' : 'item'}${on ? ' on' : ''}" data-bud="${b.categoryId}" style="display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:${th === 'ios' ? '22px' : '20px'};text-align:left;width:100%">
        <span class="m-row" style="justify-content:space-between;width:100%"><b style="font-weight:600">${esc(b.category)}</b><span class="m-mono" style="font-size:14px;color:${o ? (th === 'and' ? '#FFB68A' : '#FFB08A') : th === 'and' ? '#D7C2B8' : 'rgba(255,255,255,.7)'}">${n0(b.used)} / ${n0(b.budget)}</span></span>
        <span class="m-bar" style="width:100%;height:8px;background:${th === 'ios' ? 'rgba(255,255,255,.14)' : '#31281F'}"><i style="width:${Math.min(100, (b.used / b.budget) * 100)}%;background:${o ? '#FF7A3D' : b.color}"></i></span></button>`; }).join('') || '<div class="m-empty">Ingen budsjett satt. Sett opp på desktop under Budsjett.</div>'}`;
}

function scanQueue(th) {
  const q = (S.receipts ?? []).filter((r) => ['pending', 'processing', 'needs_review'].includes(r.status));
  return `<div class="title" style="padding:6px 4px 0">Skann</div>
    <label class="cta ${th === 'ios' ? 'glass' : ''}" style="cursor:pointer"><span class="n">${icon('scan', 20)}</span><span class="m-grow"><b style="display:block;font-weight:600">Ta bilde av kvittering</b><span style="font-size:13px;opacity:.75">Eller velg bilde/PDF</span></span><input class="m-file" type="file" accept="image/*,application/pdf" capture="environment" data-mupload></label>
    ${q.length ? `<div class="sec">Til gjennomgang</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${q.map((r) => `<button class="item${m.rc === r.id ? ' on' : ''}" data-rc="${r.id}"><span class="m-ini" style="border-radius:10px;background:#ECE8E0 center/cover;${r.thumb ? `background-image:url('${r.thumb}')` : ''}"></span><span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(r.merchant ?? 'Ny kvittering')}</span><span class="m-ell s">${r.status === 'needs_review' ? `${dd(r.date)} · ${esc(r.provider ?? 'manuell')}` : 'Leser …'}</span></span><span class="m-mono">${r.total != null ? n2(r.total) : ''}</span></button>`).join('')}</div>` : '<div class="m-empty">Ingen kvitteringer i køen.</div>'}`;
}

function confirmRc(th) {
  const all = S.receipts ?? [];
  const q = all.filter((r) => r.status === 'needs_review');
  const R = all.find((r) => r.id === m.rc);
  if (!R) return two() ? '<div class="m-empty">Velg en kvittering.</div>' : scanQueue(th);
  if (R.status === 'pending' || R.status === 'processing') return `${backBar(th, 'Skann')}<div style="padding:60px 0;display:flex;flex-direction:column;gap:14px;text-align:center"><div class="m-spin"></div>Leser kvitteringen med ${S.boot.settings.provider === 'ollama' ? 'Ollama' : 'Gemini'} …</div>`;
  const ex = R.extraction ?? {}, st = S.boot.settings;
  const high = !R.error && (R.confidence ?? 0) >= st.minConf / 100 && !R.flag;
  const paper = R.file && R.mime?.startsWith('image/') ? `<div class="m-photo" style="background-image:url('${R.file}')" role="img" aria-label="Kvittering"></div>`
    : `<div class="m-receipt"><b style="text-align:center;font-size:14px">${esc((R.merchant ?? '').toUpperCase())}</b>${(ex.lines ?? []).map((l) => `<span class="ln"><span>${esc(l.description)}</span><span>${n2(l.amount)}</span></span>`).join('')}<span class="dash"></span><b class="ln"><span>TOTAL</span><span>${R.total != null ? n2(R.total) : '–'}</span></b></div>`;
  const catChips = cats('expense').map((c) => `<button class="chip" data-mcat="${c.id}" aria-pressed="${R.categoryId === c.id}">${esc(c.name)}</button>`).join('');
  const idx = q.findIndex((r) => r.id === R.id);
  const fields = th === 'ios'
    ? `<div class="list glass2"><label class="field"><span>Butikk</span><input data-mf="merchant" value="${esc(R.merchant ?? '')}"></label><label class="field"><span>Dato</span><input type="date" data-mf="date" value="${R.date ?? ''}"></label><label class="field"><span>Total</span><input class="m-mono" data-mf="total" inputmode="decimal" value="${R.total != null ? n2(R.total).replace(/\s/g, '') : ''}" style="color:#FFB08A"></label><label class="field"><span>Konto</span><select data-mf="accountId">${accs().map((a) => `<option value="${a.id}"${a.id === R.accountId ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>`
    : `<div class="fields"><label class="field">Butikk<input data-mf="merchant" value="${esc(R.merchant ?? '')}"></label><div class="two"><label class="field">Dato<input type="date" data-mf="date" value="${R.date ?? ''}"></label><label class="field">Total<input class="m-mono" data-mf="total" inputmode="decimal" value="${R.total != null ? n2(R.total).replace(/\s/g, '') : ''}"></label></div><label class="field">Konto<select data-mf="accountId">${accs().map((a) => `<option value="${a.id}"${a.id === R.accountId ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>`;
  return `${backBar(th, 'Bekreft kvittering', idx > -1 ? `${idx + 1} av ${q.length}` : '')}
    ${th === 'ios' ? '<div class="title" style="font-size:28px">Bekreft kvittering</div>' : ''}
    ${paper}
    <div class="conf"><span>${R.provider && R.provider !== 'Manuell' ? `Lest av ${esc(R.provider)}${R.seconds ? ` · ${n2(R.seconds).replace(/0$/, '')} s` : ''}` : 'Manuell utfylling'}</span><span style="color:${high ? '#9FE3C6' : '#FFB08A'};font-weight:600">● ${R.error ? 'Fyll ut' : high ? 'Høy sikkerhet' : 'Sjekk beløp'}</span></div>
    ${R.error ? `<div style="font-size:13px;color:#FFB08A;padding:0 6px">${esc(R.error)}</div>` : ''}
    ${fields}
    <div style="display:flex;flex-wrap:wrap;gap:8px">${catChips}</div>
    <div class="m-match ${R.match ? '' : 'none'}"><b style="font-weight:600;${R.match ? 'color:#9FE3C6' : ''}">${R.match ? 'Matchet mot kortkjøp' : 'Ingen bankmatch'}</b><br><span style="opacity:.8">${R.match ? `${dd(R.match.date)} · ${sgn(R.match.amount)} kr · ${esc(R.match.account)}` : 'Bokføres som ny transaksjon'}</span></div>
    <div class="btn2"><button class="sec-b" data-mact="reject">Avvis</button><button class="pri-b" data-mact="book">Bokfør</button></div>`;
}

function backBar(th, title, right = '') {
  if (two()) return right ? `<div class="m-row" style="justify-content:flex-end;opacity:.7;font-size:14px">${right}</div>` : '';
  return th === 'ios'
    ? `<div class="m-row" style="justify-content:space-between"><a class="back" href="#/skann" data-mact="back">‹ Tilbake</a><span style="opacity:.7;font-size:14px">${right}</span></div>`
    : `<div class="m-row"><a class="back" href="#/skann" data-mact="back" aria-label="Tilbake">←</a><b style="font-size:22px;font-weight:700;flex:1">${esc(title)}</b><span style="font-size:14px;color:#D7C2B8">${right}</span></div>`;
}

function me(th) {
  const st = S.boot.settings;
  const sw = (k, label, sub) => `<button class="opt-row" data-mtog="${k}"><span class="m-grow"><b style="font-weight:500">${label}</b>${sub ? `<br><span style="font-size:13px;opacity:.65">${sub}</span>` : ''}</span><span class="sw" role="switch" aria-checked="${!!st[k]}"></span></button>`;
  const cur = (() => { try { return localStorage.getItem('fh_theme') || 'auto'; } catch { return 'auto'; } })();
  return `<div class="m-row" style="padding:6px 4px 0;gap:14px"><span class="m-av" style="width:56px;height:56px;font-size:22px">${esc(ini(st.name))}</span><div><div class="title" style="font-size:28px">${esc(st.name)}</div><div style="opacity:.65;font-size:14px">FinansHub · privat</div></div></div>
    <div class="sec">AI-motor</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${[['ollama', 'Ollama · lokalt', 'Bildet forlater aldri huset'], ['gemini', 'Gemini · sky', 'Raskest og mest presis']].map(([k, n, s]) => `<button class="opt-row" data-mprov="${k}"><span class="m-grow"><b style="font-weight:500">${n}</b><br><span style="font-size:13px;opacity:.65">${s}</span></span><span style="font-size:20px;color:#FF7A3D">${st.provider === k ? '✓' : ''}</span></button>`).join('')}${sw('fallback', 'Bruk reserve ved feil', '')}</div>
    <div class="sec">Varsler</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${sw('n80', 'Budsjett 80 %', '')}${sw('n100', 'Budsjett brukt opp', '')}${sw('nRc', 'Ny kvittering', '')}${sw('autoCat', 'Auto-kategorisering', '')}</div>
    <div class="sec">Utseende</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${[['auto', 'Automatisk', isIOS() ? 'iOS' : 'Android'], ['ios', 'iOS · Liquid Glass', ''], ['and', 'Android · Material 3', '']].map(([k, n, s]) => `<button class="opt-row" data-mtheme="${k}"><span class="m-grow"><b style="font-weight:500">${n}</b>${s ? ` <span style="opacity:.6">(${s})</span>` : ''}</span><span style="font-size:20px;color:#FF7A3D">${cur === k ? '✓' : ''}</span></button>`).join('')}</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}"><a class="opt-row" href="/finans/api/transactions.csv"><span class="m-grow">Eksporter transaksjoner (CSV)</span><span style="opacity:.6">›</span></a><button class="opt-row" data-mact="logout"><span class="m-grow" style="color:#FF8A6B">Lås</span></button></div>
    <div style="font-size:12px;opacity:.5;text-align:center;padding:10px">Flere innstillinger finnes i FinansHub på en større skjerm.</div>`;
}

/* ---------- Detaljpanel (to paneler) ---------- */

function detail(th) {
  if (m.screen === 'skann') { m.rc ??= (S.receipts ?? []).find((r) => r.status === 'needs_review')?.id ?? null; return confirmRc(th); }
  if (m.screen === 'budsjett') {
    const b = S.summary?.budgets.find((x) => x.categoryId === m.budSel) ?? S.summary?.budgets.find((x) => x.budget);
    if (!b) return '<div class="m-empty">Velg en kategori.</div>';
    const o = b.used > b.budget, items = (S.tx?.items ?? []).filter((t) => t.categoryId === b.categoryId && t.date >= S.summary.from && t.date < S.summary.to);
    return `<div class="title" style="font-size:28px">${esc(b.category)}</div>
      <div class="${th === 'ios' ? 'glass hero' : 'hero'}" style="${th === 'and' ? 'background:#31281F;color:#F0DFD7;border-radius:28px' : ''}"><div class="lbl">Brukt av ${n0(b.budget)} kr</div><div class="amt">${n0(b.used)}<small> kr</small></div>
        <div class="m-bar" style="background:rgba(255,255,255,.12)"><i style="width:${Math.min(100, (b.used / b.budget) * 100)}%;background:${o ? '#FF7A3D' : b.color}"></i></div>
        <div style="font-size:14px;opacity:.85">${o ? `Over budsjett med ${n0(b.used - b.budget)} kr.` : `${n0(b.budget - b.used)} kr igjen denne måneden.`}</div></div>
      ${items.length ? `<div class="sec">Transaksjoner</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${items.map((t) => txItem(t, th)).join('')}</div>` : ''}`;
  }
  if (m.screen === 'meg') return `<div class="title" style="font-size:28px">${cap(monthName(S.summary?.month ?? today().slice(0, 7)))}</div>${hero(th)}${reviewCta(th)}`;
  const pool = [...(S.tx?.items ?? []), ...(S.summary?.recent ?? [])];
  const t = pool.find((x) => x.id === m.sel) ?? pool[0];
  if (!t) return '<div class="m-empty">Ingen transaksjon valgt.</div>';
  const row = (k, v) => `<div class="${th === 'ios' ? 'field' : 'opt-row'}" style="${th === 'and' ? 'justify-content:space-between;background:#261E19;border-radius:16px' : ''}"><span style="opacity:.7">${k}</span><b style="font-weight:500">${v}</b></div>`;
  return `<div class="m-row" style="gap:14px"><span class="m-ini" style="width:56px;height:56px;font-size:22px;background:${rgba(t.color, 0.2)};color:${t.color};border-radius:${th === 'and' ? '18px' : '50%'}">${esc(ini(t.description))}</span><div><b style="font-size:20px;font-weight:700">${esc(t.description)}</b><div style="opacity:.7;font-size:14px">${cap(dWeek(t.date))}</div></div></div>
    <div class="m-mono" style="font-size:40px;font-weight:600;letter-spacing:-.03em;color:${amtC(t.amount, th)}">${sgn(t.amount)} <span style="font-size:18px;opacity:.6">kr</span></div>
    <div class="${th === 'ios' ? 'list glass2' : 'fields'}">${row('Kategori', esc(t.category))}${row('Konto', esc(t.account))}${row('Kvittering', t.receipt === 'booked' ? 'Vedlagt' : t.receipt ? 'Til gjennomgang' : '–')}${t.note ? row('Notat', esc(t.note)) : ''}</div>
    <label class="${th === 'ios' ? 'list glass2' : 'field'}" style="${th === 'ios' ? 'padding:12px 16px;display:flex;flex-direction:column;gap:6px' : ''}">${th === 'ios' ? '<span style="opacity:.65;font-size:13px">Endre kategori</span>' : 'Endre kategori'}<select data-mtxcat="${t.id}" style="background:none;border:0;outline:none;color:inherit;font-size:16px">${cats().map((c) => `<option value="${c.id}"${c.id === t.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
}

/* ---------- Tegning ---------- */

export function draw() {
  const th = theme(), wide = two();
  const scr = SCREENS.find(([k]) => k === m.screen) ? m.screen : m.screen === 'skann' ? 'skann' : 'hjem';
  const confirmView = scr === 'skann' && m.rc && !wide;
  const main = scr === 'hjem' ? home(th) : scr === 'liste' ? list(th) : scr === 'budsjett' ? budget(th) : scr === 'meg' ? me(th) : confirmView ? confirmRc(th) : scanQueue(th);
  const navKey = scr === 'skann' ? '' : scr;
  const scanBtn = `<label class="${th === 'ios' ? 'scanbtn' : 'fab'}" aria-label="Skann kvittering" style="cursor:pointer">${icon('scan', 26, 'currentColor', 2.2)}${th === 'and' ? '<span>Skann</span>' : ''}<input class="m-file" type="file" accept="image/*,application/pdf" capture="environment" data-mupload></label>`;
  const nav = th === 'ios'
    ? `<div class="tabbar"><nav class="tabs" aria-label="Meny">${SCREENS.map(([k, n, ic]) => `<a href="#/${k}" ${navKey === k ? 'aria-current="page"' : ''}>${icon(ic, 22)}${n}</a>`).join('')}</nav>${scanBtn}</div>`
    : `${scr !== 'skann' ? scanBtn : ''}<nav class="navbar" aria-label="Meny">${SCREENS.map(([k, n, ic]) => `<a href="#/${k}" ${navKey === k ? 'aria-current="page"' : ''}><span>${icon(ic, 22)}</span>${n}</a>`).join('')}</nav>`;
  const rail = `<nav class="rail" aria-label="Meny"><label class="r-scan" aria-label="Skann" style="cursor:pointer">${icon('scan', 24, 'currentColor', 2.2)}<input class="m-file" type="file" accept="image/*,application/pdf" capture="environment" data-mupload></label>
    ${[...SCREENS.slice(0, 3), ['skann', 'Skann', 'kv'], SCREENS[3]].map(([k, n, ic]) => `<a href="#/${k}" ${scr === k ? 'aria-current="page"' : ''}><span>${icon(ic, 22)}</span>${n}</a>`).join('')}</nav>`;
  root().innerHTML = `<div class="m ${th}${wide ? ' two' : ''}">${th === 'ios' ? '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>' : ''}
    ${rail}<div class="m-scroll">${main}</div><div class="m-detail">${wide ? detail(th) : ''}</div>${nav}
    ${m.toast ? `<div class="m-toast" role="status">${esc(m.toast)}</div>` : ''}</div>`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', th === 'ios' ? '#07070A' : '#19120E');
}

let toastT;
const flash = (t) => { m.toast = t; draw(); clearTimeout(toastT); toastT = setTimeout(() => { m.toast = ''; draw(); }, 1800); };

async function load() {
  try {
    const jobs = [loadSummary()];
    if (m.screen === 'liste' || (two() && (m.screen === 'hjem' || m.screen === 'budsjett'))) jobs.push(loadTx());
    if (m.screen === 'skann') jobs.push(loadReceipts());
    await Promise.all(jobs);
  } catch (e) { flash(e.message); }
  draw();
  poll();
}
let pollT;
function poll() {
  clearTimeout(pollT);
  if ((S.receipts ?? []).some((r) => r.status === 'pending' || r.status === 'processing')) pollT = setTimeout(async () => { await loadReceipts(); draw(); poll(); }, 2000);
}

export function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/')[0];
  const map = { ov: 'hjem', tx: 'liste', kv: 'skann', bud: 'budsjett', inn: 'meg' }; // desktop-lenker
  const next = map[h] ?? (['hjem', 'liste', 'budsjett', 'skann', 'meg'].includes(h) ? h : 'hjem');
  if (next !== m.screen) { m.screen = next; if (next !== 'skann') m.rc = null; window.scrollTo(0, 0); }
  u.type = m.filter;
  draw();
  load();
}

/* ---------- Hendelser ---------- */

const safe = (fn) => async (e) => { try { await fn(e); } catch (err) { flash(err.message); } };

async function upload(files) {
  for (const f of files) { const r = await uploadReceipt(f); m.rc = r.id; }
  m.screen = 'skann';
  if (location.hash !== '#/skann') location.hash = '#/skann'; else { await loadReceipts(); draw(); poll(); }
}

export function bind() {
  const el = root();
  el.addEventListener('click', safe(async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    if ((x = d('[data-tx]'))) { m.sel = +x.dataset.tx; if (two()) return draw(); return; }
    if ((x = d('[data-rc]'))) { m.rc = x.dataset.rc; return draw(); }
    if ((x = d('[data-bud]'))) { m.budSel = +x.dataset.bud; if (!S.tx) await loadTx(); return draw(); }
    if ((x = d('[data-filter]'))) { m.filter = x.dataset.filter; u.type = m.filter; await loadTx(); return draw(); }
    if ((x = d('[data-mcat]'))) { const r = await api(`/receipts/${m.rc}`, { method: 'PATCH', json: { categoryId: +x.dataset.mcat } }); S.receipts = S.receipts.map((y) => (y.id === r.id ? r : y)); return draw(); }
    if ((x = d('[data-mtog]'))) { S.boot.settings = await api('/settings', { method: 'PUT', json: { [x.dataset.mtog]: !S.boot.settings[x.dataset.mtog] } }); return draw(); }
    if ((x = d('[data-mprov]'))) { S.boot.settings = await api('/settings', { method: 'PUT', json: { provider: x.dataset.mprov } }); return draw(); }
    if ((x = d('[data-mtheme]'))) { try { if (x.dataset.mtheme === 'auto') localStorage.removeItem('fh_theme'); else localStorage.setItem('fh_theme', x.dataset.mtheme); } catch {} return draw(); }
    const act = d('[data-mact]')?.dataset.mact;
    if (act === 'back') { e.preventDefault(); m.rc = null; return draw(); }
    if (act === 'book' || act === 'reject') {
      await api(`/receipts/${m.rc}/${act}`, { method: 'POST' });
      const nx = (S.receipts ?? []).find((y) => y.id !== m.rc && y.status === 'needs_review');
      m.rc = nx?.id ?? null;
      await Promise.all([loadReceipts(), loadBoot(), loadSummary()]);
      return flash(act === 'book' ? 'Bokført ✓' : 'Kvittering avvist');
    }
    if (act === 'logout') { await fetch('/api/logout', { method: 'POST' }); location.href = '/login?next=/finans/'; }
  }));
  el.addEventListener('change', safe(async (e) => {
    const t = e.target;
    if (t.matches('[data-mupload]')) { await upload([...t.files]); t.value = ''; return; }
    if (t.dataset.mf) {
      const f = t.dataset.mf;
      const r = await api(`/receipts/${m.rc}`, { method: 'PATCH', json: { [f]: f === 'total' ? parseAmount(t.value) : f === 'accountId' ? +t.value : t.value } });
      S.receipts = S.receipts.map((y) => (y.id === r.id ? r : y)); return draw();
    }
    if (t.dataset.mtxcat) { await api(`/transactions/${t.dataset.mtxcat}`, { method: 'PATCH', json: { categoryId: +t.value } }); await Promise.all([loadTx(), loadSummary()]); return flash('Kategori endret'); }
  }));
  el.addEventListener('submit', safe(async (e) => {
    if (!e.target.matches('[data-msearch]')) return;
    e.preventDefault();
    u.q = e.target.q.value; await loadTx(); draw();
  }));
}
