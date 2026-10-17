// FinansHub desktop. Alle sider tegnes fra S (core.js); hendelser fanges med delegering på roten.
import {
  S, api, esc, n0, n2, sgn, neg, neg0, k, dd, dLong, today, monthName, cap, shiftMonth, ini, rgba, greet, pctChange, parseAmount,
  render, toast, loadBoot, loadSummary, loadTx, loadReceipts, loadRecurring, loadReport, loadAi, catById, cats, accs, uploadReceipt,
  smooth, spark, conic, icon, logo, aiLine, ICONS,
} from './core.js';
import { MODULE_PAGES, MODULE_SUB, MODULE_FN, MODULE_LOADERS, bindModules, backupTab, firstRunCard, loadBackup, impPage } from './modules.js';

ICONS.ai = 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z';
const BASE_PAGES = [['ov', 'Oversikt'], ['tx', 'Transaksjoner'], ['ai', 'AI-søk'], ['kv', 'Kvitteringer'], ['bud', 'Budsjett'], ['fast', 'Faste utgifter'], ['konto', 'Kontoer'], ['rap', 'Rapporter'], ['inn', 'Innstillinger']];
const NAV_DEFAULT = ['ov', 'tx', 'ai', 'kv', 'bud', 'fast', 'konto', 'aks', 'rap', 'sub', 'dir', 'finn', 'inn'];
const NAV_FIXED = ['ov', 'inn'];
const PAGES = [...BASE_PAGES, ...MODULE_PAGES];
const pageName = (p) => PAGES.find(([x]) => x === p)?.[1] ?? p;
const ACC_TYPES = { checking: 'Brukskonto', savings: 'Sparekonto', credit: 'Kredittkort', cash: 'Kontanter' };
const KINDS = { expense: 'Utgift', income: 'Inntekt', transfer: 'Overføring' };
const root = () => document.getElementById('app');
const u = S.ui;
const card = (inner, cls = '', style = '') => `<section class="card ${cls}" style="${style}">${inner}</section>`;
const skel = (h = 120) => `<div class="skel" style="min-height:${h}px"></div>`;
const amtColor = (v) => (v > 0 ? 'var(--pos)' : 'var(--text)');
const catColor = (id) => catById(id)?.color ?? '#A0A0AA';
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
const catOpts = (sel, kind) => cats(kind).map((c) => opt(c.id, c.name, sel)).join('');
const accOpts = (sel, empty) => (empty ? opt('', empty, sel) : '') + accs().map((a) => opt(a.id, a.name, sel)).join('');

/* ===================== Skall ===================== */

// Sidemenyen er personlig: rekkefølge og skjulte punkter redigeres i Innstillinger → Sidemeny og lagres i
// /api/me/layout (finNav), med FinansHubs egne prefs som reserve. Oversikt og Innstillinger kan ikke skjules.
function navCfg() {
  const def = (S.boot.navDefault ?? NAV_DEFAULT).filter((p) => PAGES.some(([x]) => x === p));
  const fin = S.layout?.finNav;
  const saved = (fin?.order?.length ? fin.order : S.boot.nav) ?? def;
  const keep = saved.filter((p) => def.includes(p));
  if (!keep.includes('ai') && keep.includes('tx')) keep.splice(keep.indexOf('tx') + 1, 0, 'ai');
  const order = [...new Set([...keep, ...def.filter((p) => !keep.includes(p))])];
  const hidden = (fin?.hidden ?? S.boot.navHidden ?? []).filter((p) => order.includes(p) && !NAV_FIXED.includes(p));
  return { order: u.cfgOrder ?? order, hidden };
}
const navOrder = () => { if (S.boot.restricted) return ['dir']; const { order, hidden } = navCfg(); return order.filter((p) => !hidden.includes(p)); };
function sideNav() {
  const b = S.boot;
  const items = navOrder().map((p) => `<a href="#/${p}" ${p === u.page ? 'aria-current="page"' : ''}>${icon(p, 18, 'currentColor')}<span>${pageName(p)}</span>${p === 'kv' && b.reviewCount ? `<span class="badge">${b.reviewCount}</span>` : ''}</a>`).join('');
  return `<div class="side-label">${b.restricted ? 'Delt med deg' : 'Generelt'}</div><nav class="nav">${items}</nav>`;
}

// ✦ AI-søk: svar med sammendrag og treff fra transaksjoner, kvitteringer og varelinjer.
function aiPanel() {
  const a = u.ai;
  if (!a) return '';
  const hits = (a.hits ?? []).map((h) => `<button class="ai-hit" ${h.txId ? `data-open-tx="${h.txId}"` : h.receiptId ? `data-open-rc="${esc(h.receiptId)}"` : ''}><span class="dot" style="background:${esc(h.color ?? '#A0A0AA')}"></span>
    <span class="grow"><span style="font-weight:500">${esc(h.description)}</span> <span class="note" style="font-size:12.5px">· ${dd(h.date)} · ${esc(h.source)}</span><span class="ai-why">${esc(h.reason ?? '')}</span></span>
    <span class="mono" style="white-space:nowrap">${h.amount != null ? sgn(h.amount) + ' kr' : '–'}</span></button>`).join('');
  return `<section class="card ai-panel"><div class="card-h" style="align-items:flex-start"><div style="min-width:0"><div class="ai-k">✦ AI-SØK · ${esc(a.engine ?? (S.boot.settings.provider === 'ollama' ? 'Ollama' : 'Gemini'))}</div>${a.q ? `<div class="ai-q">${esc(a.q)}</div>` : '<div class="ai-q">Spør om økonomien din på vanlig norsk</div>'}</div><button class="x-btn" data-act="ai-close" aria-label="Lukk">×</button></div>
    ${a.busy ? '<div class="sub" style="font-size:14px"><span class="spin" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:8px"></span>Leser transaksjoner, kvitteringer og varelinjer …</div>' : ''}
    ${a.answer ? `<div class="ai-a">${esc(a.answer)}</div>` : ''}${hits ? `<div class="ai-hits">${hits}</div>` : ''}
    ${(a.suggestions ?? []).length ? `<div class="ai-sugg">${a.suggestions.map((g) => `<button data-ai-q="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}</section>`;
}

function shell(content) {
  const b = S.boot, st = b.settings;
  const pg = PAGES.find(([p]) => p === u.page);
  const ai = S.ai, prov = st.provider;
  const aiOk = ai ? (prov === 'ollama' ? ai.ollama.ok : ai.gemini.ok) : null;
  const me = b.me ?? { name: st.name, role: 'admin' };
  const aiMode = !!u.aiMode;
  return `<div class="app">
  <aside class="side" aria-label="FinansHub-meny">
    <div class="brand"><div class="brand-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/></svg></div><div class="brand-t">Finans<span>Hub</span></div></div>
    ${sideNav()}
    ${b.restricted ? '' : `<div class="ai-box"><div class="side-label" style="padding:0">AI-motor</div>
      <div style="display:flex;align-items:center;gap:8px;font-weight:600"><span class="ai-dot ${aiOk === null ? 'unk' : aiOk ? '' : 'off'}"></span>${prov === 'ollama' ? 'Ollama · lokalt' : 'Gemini · sky'}</div>
      <div class="note" style="font-size:12px">${prov === 'ollama' ? `${esc(st.ollamaModel)} · reserve: ${st.fallback ? 'Gemini' : 'ingen'}` : esc(st.geminiModel)}${aiOk === false ? ' · <span class="neg">ikke tilgjengelig</span>' : ''}</div></div>`}
  </aside>
  <main class="main"><div class="wrap">
    <header class="head">
      <div><div class="crumb"><span>FinansHub</span><span>›</span><b>${pg[1]}</b></div><h1>${u.page === 'ov' ? `${greet()}, ${esc(me.name)}` : pg[1]}</h1>${MODULE_SUB[u.page] ? `<div class="note" style="font-size:14px;margin-top:4px">${MODULE_SUB[u.page]}</div>` : ''}</div>
      <div class="head-r">
        ${b.restricted ? '' : `<form class="search${aiMode ? ' ai' : ''}" data-form="gsearch" role="search">${aiMode ? '<span class="ai-star">✦</span>' : icon('search', 17, 'var(--muted)')}<input name="q" value="${esc(aiMode ? (u.aiDraft ?? '') : u.q)}" placeholder="${aiMode ? 'Spør, f.eks. «strøm i september»' : 'Søk i transaksjoner …'}" aria-label="${aiMode ? 'Spør AI om transaksjoner og kvitteringer' : 'Søk i transaksjoner'}"><button type="button" class="ai-tog" data-act="ai-toggle" aria-pressed="${aiMode}" title="Søk med AI i transaksjoner og kvitteringer">✦ AI</button></form>
        <a class="icon-btn" href="#/kv" aria-label="Varsler: ${b.reviewCount} kvitteringer til gjennomgang">${icon('bell', 18)}${b.reviewCount ? '<span class="dot"></span>' : ''}</a>`}
        <div class="me"><div class="av">${esc(ini(me.name))}</div><div class="me-n"><div>${esc(me.name)}</div><div>${me.role === 'admin' ? 'Privat' : 'Delte mapper'}</div></div></div>
        <a class="close" href="/#/dash" aria-label="Tilbake til Hjem" title="Tilbake til Hjem">×</a>
      </div>
    </header>
    ${u.page === 'ai' ? '' : aiPanel()}
    ${content}
  </div></main></div>${modalHtml()}`;
}

/* ===================== AI-søk (egen side) ===================== */

const AI_SUGG = () => ['Hvor mye har jeg brukt på kaffe?', 'Når kjøpte jeg lyspærer?', `Mat i ${monthName(S.boot.month ?? today().slice(0, 7))}`, 'Hva har jeg betalt for lading?'];
function aiPage() {
  const sugg = [...new Set([...AI_SUGG(), ...(S.aiSugg ?? [])])].slice(0, 6);
  const hist = (S.aiHist ?? []).slice(0, 8);
  const prov = S.boot.settings.provider === 'ollama' ? 'Ollama · lokalt' : 'Gemini';
  return `<div class="ai-page">
    <form class="card ai-ask" data-form="aipage" role="search"><div class="ai-k">✦ AI-SØK · ${prov}</div>
      <div class="ai-ask-row"><input name="aiq" value="${esc(u.aiPageDraft ?? '')}" placeholder="Spør om alt, f.eks. «hvor mye har jeg brukt på kaffe i år?»" autocomplete="off" aria-label="Spørsmål til AI-søket" data-ai-page-input><button class="btn pri">Spør AI</button></div>
      <div class="note" style="font-size:13px;text-wrap:pretty">Søker i transaksjoner, kvitteringer og varelinjene som AI har lest av kvitteringsbildene.</div>
      <div class="ai-sugg">${sugg.map((g) => `<button type="button" data-ai-q="${esc(g)}">${esc(g)}</button>`).join('')}</div></form>
    ${u.ai?.q ? aiPanel() : ''}
    ${card(`<div class="card-h"><b style="font-weight:600;font-size:15px">Tidligere spørsmål</b>${hist.length ? '<button class="link-btn" data-act="ai-hist-clear">Tøm</button>' : ''}</div>
      ${hist.length ? `<div class="ai-hist">${hist.map((h) => `<button data-ai-q="${esc(h)}"><span class="muted">↺</span><span class="ell">${esc(h)}</span></button>`).join('')}</div>` : '<div class="note" style="font-size:13.5px">Ingen spørsmål ennå.</div>'}`, '', 'gap:10px')}
  </div>`;
}

/* ===================== Oversikt ===================== */

// Beløpet står alltid på én linje med «kr» rett etter; minigrafen ligger under, ved siden av notatet.
function kpi(label, iconK, icBg, icFg, value, noteHtml, art) {
  return `<div class="card kpi"><div class="kpi-h"><div><span class="kpi-ic" style="background:${icBg};color:${icFg}">${icon(iconK, 16)}</span><span class="sub">${label}</span></div></div>
    <div class="big">${value}<small> kr</small></div><div class="kpi-b"><div class="note">${noteHtml}</div><div class="kpi-art">${art}</div></div></div>`;
}
const change = (cur, prev, goodDown) => {
  const p = pctChange(cur, prev);
  if (p === null || !Number.isFinite(p)) return '<span class="muted">ingen sammenligning</span>';
  const good = goodDown ? p <= 0 : p >= 0;
  return `<span style="color:${good ? 'var(--pos)' : 'var(--acc-l)'}">${p >= 0 ? '↗' : '↘'} ${n0(Math.abs(p))} %</span> <span class="muted">mot ${monthName(shiftMonth(S.summary.month, -1))}</span>`;
};

function chart(s) {
  const year = u.mode === 'year';
  let rows = s.series;
  if (year) { // akkumulert hittil i år
    const y = s.month.slice(0, 4); let ai = 0, au = 0;
    rows = s.series.filter((r) => r.month.startsWith(y)).map((r) => ({ ...r, inn: (ai += r.inn), ut: (au += r.ut) }));
  }
  if (!rows.length) return '<div class="empty">Ingen data ennå.</div>';
  const W = 600, H = 200, mx = Math.max(1000, ...rows.flatMap((r) => [r.inn, r.ut])) * 1.1;
  const x = (i) => (rows.length === 1 ? W / 2 : (i * W) / (rows.length - 1));
  const pi = rows.map((r, i) => [x(i), H - (r.inn / mx) * H]), pu = rows.map((r, i) => [x(i), H - (r.ut / mx) * H]);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => `<div><span>${k(mx * f)}</span></div>`).join('');
  const hov = rows.map((r, i) => {
    const on = u.hov === i;
    return `<div data-hov="${i}">${on ? `<div class="vline"></div><span class="pt" style="background:var(--warn);top:calc(${(1 - r.inn / mx) * 100}% - 6px)"></span><span class="pt" style="background:var(--acc);top:calc(${(1 - r.ut / mx) * 100}% - 6px)"></span>
      <div class="tip" style="left:${i > rows.length / 2 ? 'calc(50% - 172px)' : 'calc(50% + 12px)'}"><b>${cap(monthName(r.month))} ${r.month.slice(0, 4)}</b><span><span class="sub">● Inn</span><span class="mono">${n0(r.inn)} kr</span></span><span><span class="sub">● Ut</span><span class="mono">${n0(r.ut)} kr</span></span><span><span class="sub">Netto</span><span class="mono" style="color:${r.inn - r.ut >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${neg0(r.inn - r.ut)} kr</span></span></div>` : ''}</div>`;
  }).join('');
  return `<div class="chart" data-chart>
    <div class="chart-grid">${ticks}</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2C14E" stop-opacity=".22"/><stop offset="1" stop-color="#F2C14E" stop-opacity="0"/></linearGradient><linearGradient id="gu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7A3D" stop-opacity=".18"/><stop offset="1" stop-color="#FF7A3D" stop-opacity="0"/></linearGradient></defs>
      <path d="${smooth(pi)} L${W} ${H} L0 ${H} Z" fill="url(#gi)"/><path d="${smooth(pu)} L${W} ${H} L0 ${H} Z" fill="url(#gu)"/>
      <path d="${smooth(pi)}" fill="none" stroke="#F2C14E" stroke-width="2.5" vector-effect="non-scaling-stroke"/><path d="${smooth(pu)}" fill="none" stroke="#FF7A3D" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
    <div class="chart-hov">${hov}</div>
    <div class="chart-x">${rows.map((r) => `<span>${monthName(r.month, false)}</span>`).join('')}</div></div>`;
}

const txRow = (t) => `<button class="tx-row" data-open-tx="${t.id}">${logo(t, 38, 12)}
  <span class="grow"><span class="ell" style="font-weight:500">${esc(t.description)}</span><span class="ell note" style="font-size:12px">${dd(t.date)} · ${esc(t.category)}</span>${aiLine(t.aiShort, 'd-ai ell')}</span>
  <span class="mono" style="font-weight:500;color:${amtColor(t.amount)}">${sgn(t.amount)}</span></button>`;

const paper = (r) => `<span class="paper${r.thumb ? ' img' : ''}" style="${r.thumb ? `background-image:url('${r.thumb}')` : ''}"><i></i><i></i><i></i><i></i></span>`;

const pctOf = (s) => (s.budgetTotal ? Math.min(1, s.budgetUsed / s.budgetTotal) : 0);

function overview() {
  const s = S.summary;
  if (!s) return skel(400);
  const st = S.boot.settings;
  const bal = s.balanceSeries, mxB = Math.max(...bal.map(Math.abs), 1);
  const saldoBars = bal.slice(-18).map((v) => `<i style="flex:1 1 0;min-width:0;height:${Math.max(4, (Math.abs(v) / mxB) * 46)}px"></i>`).join('');
  const innSp = spark(s.series.slice(-8).map((r) => r.inn));
  const days = s.dailyOut.slice(-12), mxD = Math.max(...days.map((d) => d.amount), 1);
  const utBars = days.map((d) => `<i style="flex:1 1 0;min-width:0;opacity:.9;height:${Math.max(3, (d.amount / mxD) * 46)}px" title="${dd(d.date)}: ${n0(d.amount)} kr"></i>`).join('');
  const ang = Math.PI * (1 - pctOf(s)), gx = 50 + 40 * Math.cos(ang), gy = 44 - 40 * Math.sin(ang);
  const pct = pctOf(s);
  const kpis = `<div class="kpis">
    ${kpi('Total saldo', 'wallet', '#2A1A12', '#FFB08A', neg(s.balance), change(bal.at(-1), bal.at(-2)), `<div class="bars">${saldoBars}</div>`)}
    ${kpi(`Inn i ${monthName(s.month)}`, 'up', '#142032', '#9DBDFF', n2(s.inn), s.lastIncome ? `${esc(s.lastIncome.description)} ${dd(s.lastIncome.date)}` : 'Ingen inntekt registrert', `<svg width="96" height="46" viewBox="0 0 96 46" fill="none" preserveAspectRatio="none" aria-hidden="true"><path d="${innSp.area}" fill="rgba(122,167,255,.16)"/><path d="${innSp.line}" stroke="#7AA7FF" stroke-width="2" stroke-linecap="round"/></svg>`)}
    ${kpi(`Brukt i ${monthName(s.month)}`, 'dn', '#2A1A12', '#FFB08A', n2(s.ut), change(s.ut, s.prevUt, true), `<div class="bars" style="gap:3px">${utBars}</div>`)}
    ${kpi('Igjen av budsjett', 'pie', '#13201B', '#9FE3C6', neg(s.left), s.budgetTotal ? `${n0(pct * 100)} % brukt · ${s.daysLeft} dager igjen` : '<a href="#/bud">Sett opp budsjett</a>', `<svg width="96" height="46" viewBox="0 0 100 48" fill="none" aria-hidden="true"><path d="M10 44A40 40 0 0 1 90 44" stroke="#24242A" stroke-width="8" stroke-linecap="round"/><path d="M10 44A40 40 0 0 1 90 44" stroke="${pct >= 1 ? '#FF7A3D' : pct > 0.8 ? '#F2C14E' : '#FF7A3D'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${pct * 125.7} 200"/><circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="3" fill="#F2F2F4"/></svg>`)}
  </div>`;
  const a = accs(), credit = a.find((x) => x.type === 'credit'), main = a.find((x) => x.type === 'checking') ?? a[0];
  const accCard = card(`<div class="card-h"><h2>Kontoer</h2><a class="btn sm pri" href="#/konto">Se alle</a></div>
    ${a.length ? `<div class="cards-stack"><div class="cc-back"><span class="mc"><i></i><i></i></span><span class="mono sub" style="font-size:13px">${main?.last4 ? '•••• ' + esc(main.last4) : esc(main?.name ?? '')}</span></div>
      <div class="cc-front"><div style="display:flex;justify-content:space-between;align-items:flex-start"><b style="font-size:20px;font-style:italic;letter-spacing:.02em">${credit ? 'VISA' : esc(main.bank || 'Konto')}</b><span class="mono" style="font-size:13px">${(credit ?? main).last4 ? '•••• ' + esc((credit ?? main).last4) : ''}</span></div>
      <div><div style="font-size:12px;opacity:.75">${credit ? 'Kredittkort · brukt' : esc(main.name)}</div><div class="mono" style="font-size:22px;font-weight:600">${credit ? n2(Math.min(0, credit.balance)) : neg(main.balance)} kr</div></div></div></div>
    <div>${a.map((x) => `<div class="kv-line"><span class="sub">${esc(x.name)}</span><span class="mono" style="font-weight:500">${neg(x.balance)} kr</span></div>`).join('')}</div>`
    : '<div class="empty" style="padding:20px 0">Ingen kontoer ennå. <a href="#/konto">Legg til</a></div>'}`, '', 'flex:1 1 320px');
  const stack = s.budgets.map((b) => `<span style="background:${b.color};width:${s.budgetTotal ? (b.used / s.budgetTotal) * 100 : 0}%"></span>`).join('');
  const budTop = s.budgets.filter((b) => b.used > 0 || b.budget).sort((x, y) => y.used / (y.budget || 1) - x.used / (x.budget || 1)).slice(0, 4).map((b) => {
    const o = b.used > b.budget;
    return `<div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between;font-size:13px"><span style="display:flex;align-items:center;gap:8px"><span class="tag" style="padding:0;background:none"><i style="background:${b.color};width:8px;height:8px"></i></span>${esc(b.category)}</span><span class="mono" style="color:${o ? 'var(--acc-l)' : 'var(--muted)'}">${n0(b.used)} / ${n0(b.budget)}</span></div>
      <div class="prog"><i style="width:${Math.min(100, (b.used / (b.budget || 1)) * 100)}%;background:${o ? 'var(--acc)' : b.color}"></i></div></div>`;
  }).join('');
  const rv = s.review.slice(0, 4).map((r) => `<button class="rq" data-open-rc="${r.id}">${paper(r)}<span class="grow"><span style="display:flex;justify-content:space-between;gap:8px"><b class="ell" style="font-weight:600">${esc(r.merchant ?? 'Ny kvittering')}</b><span class="mono">${r.total != null ? n2(r.total) + ' kr' : '–'}</span></span>
    <span class="note" style="display:block;font-size:12px">${dd(r.date)} · ${r.status === 'needs_review' ? esc(r.provider ?? 'manuell') : 'Leser …'}</span>
    <span style="display:block;font-size:12px;color:${r.flag || r.error ? 'var(--acc-l)' : r.status === 'needs_review' ? 'var(--pos)' : 'var(--blue-l)'}">${r.status !== 'needs_review' ? 'Leses av AI …' : r.error ? 'Må fylles ut manuelt' : r.flag ?? 'Alle felt lest sikkert'}</span></span></button>`).join('');
  const up = s.upcoming.slice(0, 4).map((r) => `<div class="kv-line" style="align-items:center"><div><div style="font-weight:500">${esc(r.name)}</div><div class="note" style="font-size:12px">Trekkes ${new Date(r.next + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '')}</div></div><div class="mono" style="font-weight:500">${n0(r.amount)} kr</div></div>`).join('');
  // På PC lastes kvitteringer opp fra filer (ingen kamera).
  const actions = `<label class="action" style="background:#2A1A12;color:var(--text);cursor:pointer"><span style="color:#FFB08A">${icon('down', 17)}</span>Last opp kvittering<input type="file" multiple accept="image/*,application/pdf" data-upload hidden></label>`
    + [['Ny transaksjon', '#142032', '#9DBDFF', 'plus', 'data-act="add-tx"'], ['Importer', '#13201B', '#9FE3C6', 'imp', 'href="#/imp"'], ['Rapport', '#221A30', '#C9B6FF', 'rap', 'href="#/rap"']]
    .map(([n, bg, c, ic, at]) => `<${at.startsWith('href') ? 'a' : 'button'} class="action" ${at} style="background:${bg};color:var(--text)"><span style="color:${c}">${icon(ic, 17)}</span>${n}</${at.startsWith('href') ? 'a' : 'button'}>`).join('');
  const noData = !S.boot.hasData ? card(`<div class="card-h"><div><h2>Kom i gang</h2><div class="note">Legg til en konto, importer fra nettbanken eller last opp en kvittering. Du kan også laste inn demodata for å se hvordan alt ser ut.</div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/konto">Legg til konto</a><button class="btn" data-act="goto-import">Importer CSV</button><button class="btn pri" data-act="demo">Last inn demodata</button></div></div>`, '', 'border-color:#3A2A1C') : '';
  return `<div style="display:flex;flex-direction:column;gap:18px">${S.boot.firstRun ? firstRunCard() : noData}${kpis}
    <div class="row-flex">${card(`<div class="card-h"><div><h2>Inn og ut</h2><div class="note" style="font-size:13px">${u.mode === 'year' ? `Akkumulert, ${s.month.slice(0, 4)}` : 'Per måned, siste 12 måneder'}</div></div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><div class="legend"><span><i style="background:var(--warn)"></i>Inn</span><span><i style="background:var(--acc)"></i>Ut</span></div>
      <div class="seg"><button data-mode="month" aria-pressed="${u.mode === 'month'}">Måned</button><button data-mode="year" aria-pressed="${u.mode === 'year'}">År</button></div></div></div>${chart(s)}`, '', 'flex:2 1 560px')}${accCard}</div>
    <div class="row-flex">
      ${card(`<div class="card-h" style="margin-bottom:-6px"><h2>Siste transaksjoner</h2><a class="link" href="#/tx">Se alle →</a></div><div style="display:flex;flex-direction:column;gap:2px">${s.recent.map(txRow).join('') || '<div class="empty">Ingen transaksjoner ennå.</div>'}</div>`, '', 'flex:1.3 1 380px;gap:6px')}
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:16px">
        ${card(`<h2>Handlinger</h2><div class="actions">${actions}</div>`)}
        ${card(`<div class="card-h"><h2>Budsjett</h2><a class="link" href="#/bud">Endre →</a></div>${s.budgetTotal ? `<div class="stack">${stack}</div>${budTop}` : '<div class="note">Ingen budsjett satt. <a href="#/bud">Sett opp</a></div>'}`, '', 'gap:12px')}
      </div>
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:16px">
        ${card(`<div class="card-h"><h2>Trenger gjennomgang</h2><span class="pill" style="background:#3A2414;color:var(--acc-l)">${s.review.length} nye</span></div>${rv || '<div class="note">Alt er gjennomgått.</div>'}`, 'review', 'gap:10px')}
        ${card(`<div class="card-h" style="margin-bottom:-6px"><h2>Kommende trekk</h2><a class="link" href="#/fast">Alle →</a></div><div>${up || '<div class="note" style="padding-top:8px">Ingen faste trekk registrert.</div>'}</div>`, '', 'gap:2px')}
      </div>
    </div></div>`;
}

/* ===================== Transaksjoner ===================== */

function transactions() {
  const list = S.tx;
  const chips = [{ id: '', name: 'Alle', color: '#F2F2F4' }, ...cats()].map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="${String(u.cat) === String(c.id)}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`).join('');
  const qs = new URLSearchParams({ ...(u.q && { q: u.q }), ...(u.cat && { category: u.cat }), ...(u.acc && { account: u.acc }), ...(u.type && { type: u.type }) });
  const rows = list?.items.map((t) => `<tr data-open-tx="${t.id}" class="${u.sel === t.id ? 'on' : ''}">
    <td class="mono muted" style="white-space:nowrap">${dd(t.date)}</td>
    <td><div style="display:flex;align-items:center;gap:10px">${logo(t, 30, 9)}<div style="min-width:0"><div style="font-weight:500">${esc(t.description)}</div><div class="note" style="font-size:12px">${esc(t.account)}${t.note ? ' · ' + esc(t.note) : ''}${t.folder ? ' · ' + esc(t.folder) : ''}</div>${aiLine(t.aiShort, 'd-ai ell')}</div></div></td>
    <td><span class="tag"><i style="background:${t.color}"></i>${esc(t.category)}</span></td>
    <td style="font-size:12.5px;color:${t.receipt === 'needs_review' ? 'var(--acc-l)' : 'var(--muted)'}">${t.receipt === 'booked' ? 'Vedlagt' : t.receipt ? 'Til gjennomgang' : '–'}</td>
    <td class="mono" style="white-space:nowrap;font-weight:500;color:${amtColor(t.amount)}">${sgn(t.amount)}</td></tr>`).join('');
  const sel = list?.items.find((t) => t.id === u.sel);
  const detail = sel ? card(`<div style="display:flex;justify-content:space-between;align-items:flex-start">${logo(sel, 46, 14)}<button class="x-btn" data-act="close-sel" aria-label="Lukk">×</button></div>
    <div><input class="inp" data-tx-field="description" value="${esc(sel.description)}" aria-label="Beskrivelse" style="font-size:18px;font-weight:600;background:none;border-color:transparent;padding:0;height:auto"><div class="note" style="font-size:13px">${dLong(sel.date)} · ${esc(sel.account)}</div></div>
    <div class="mono" style="font-size:32px;font-weight:600;letter-spacing:-.03em;color:${amtColor(sel.amount)}">${sgn(sel.amount)} <span style="font-size:15px;color:var(--muted);font-weight:400">kr</span></div>
    <div style="display:flex;gap:10px;align-items:flex-end"><div class="seg" style="border-radius:10px;flex:none" role="group" aria-label="Type">${[['expense', 'Utgift'], ['income', 'Inntekt']].map(([k2, l]) => `<button type="button" data-txkind="${k2}" aria-pressed="${sel.type === k2}" style="height:38px;padding:0 14px">${l}</button>`).join('')}</div>
      <label class="f" style="flex:1">Beløp (kr)<input class="inp mono" data-tx-field="amount" inputmode="decimal" value="${n2(Math.abs(sel.amount))}"></label></div>
    ${sel.aiLong ? `<div class="ai-card"><b>✦ AI-beskrivelse</b><span>${esc(sel.aiLong)}</span>${sel.lines?.length ? `<div class="ai-lines">${sel.lines.map((l) => `<span><span>${esc(l.description)}</span><span class="mono">${n2(l.amount)}</span></span>`).join('')}</div>` : ''}</div>` : ''}
    <label class="f">Kategori<select class="inp" data-tx-field="categoryId">${opt('', 'Ukategorisert', sel.categoryId)}${catOpts(sel.categoryId)}</select></label>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Dato<input class="inp" type="date" data-tx-field="date" value="${sel.date}"></label><label class="f" style="flex:1">Konto<select class="inp" data-tx-field="accountId">${accOpts(sel.accountId, '–')}</select></label></div>
    <label class="f">Delt mappe<select class="inp" data-tx-field="folderId">${opt('', 'Ingen', sel.folderId)}${(S.txFolders ?? []).map((f) => opt(f.id, f.name, sel.folderId)).join('')}</select></label>
    <label class="f">Notat<input class="inp" data-tx-field="note" value="${esc(sel.note ?? '')}" placeholder="Legg til notat"></label>
    <div class="box"><span class="muted">Kvittering</span>${sel.receiptId ? `<a href="#/kv" data-open-rc="${sel.receiptId}">${sel.receipt === 'booked' ? 'Vedlagt – vis' : 'Til gjennomgang →'}</a>` : `<label class="link-btn" style="cursor:pointer">Legg ved kvittering<input type="file" accept="image/*,application/pdf" data-attach-rc="${sel.id}" hidden></label>`}</div>
    <div class="orig-links"><button class="orig-link" data-orig="receipt">${icon('kv', 16, 'var(--muted)')}<span class="grow">Original kvittering</span><span class="note">${sel.receiptId ? (sel.receipt === 'booked' ? 'Vedlagt' : 'Til gjennomgang') : 'Ingen'}</span><span class="muted">›</span></button>
      <button class="orig-link" data-orig="bank">${icon('konto', 16, 'var(--muted)')}<span class="grow">Original banktransaksjon</span><span class="note">${sel.hasBankRow ? 'Fra banken' : sel.source === 'receipt' ? 'Fra kvittering' : 'Lagt inn manuelt'}</span><span class="muted">›</span></button></div>
    <div style="display:flex;gap:10px"><button class="btn ghost" style="flex:1" data-act="make-rule">Lag regel</button><button class="btn danger" style="flex:1" data-act="del-tx">Slett</button></div>
    ${u.msg.rule ? `<div class="ok-msg">${esc(u.msg.rule)}</div>` : ''}`, 'detail') : '';
  return `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="filters">
      <form class="search" data-form="txsearch" role="search">${icon('search', 17, 'var(--muted)')}<input name="q" value="${esc(u.q)}" placeholder="Søk etter butikk eller beskrivelse" aria-label="Søk"></form>
      <select class="sel" data-filter="acc" aria-label="Konto">${accOpts(u.acc, 'Alle kontoer')}</select>
      <select class="sel" data-filter="type" aria-label="Type">${opt('', 'Inn og ut', u.type)}${opt('inn', 'Kun inn', u.type)}${opt('ut', 'Kun ut', u.type)}</select>
      <a class="btn" href="/finans/api/transactions.csv?${qs}">Eksporter CSV</a>
      <button class="btn pri" data-act="add-tx">+ Ny transaksjon</button>
    </div>
    <div class="chips">${chips}</div>
    <div class="row-flex">
      <section class="card" style="flex:2 1 600px;padding:10px 22px 16px;gap:0">
        <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:13px" class="muted"><span>${list ? `${list.count} transaksjoner` : 'Laster …'}</span><span>Netto <b class="mono" style="color:var(--text);font-weight:500">${list ? sgn(list.net) + ' kr' : ''}</b></span></div>
        <div class="tbl-wrap"><table style="min-width:620px"><thead><tr><th>Dato</th><th>Beskrivelse</th><th>Kategori</th><th>Kvittering</th><th>Beløp</th></tr></thead><tbody>${rows ?? ''}</tbody></table></div>
        ${list && !list.items.length ? '<div class="empty">Ingen transaksjoner matcher filteret.</div>' : ''}${!list ? skel(300) : ''}
      </section>${detail}
    </div></div>`;
}

/* ===================== Kvitteringer ===================== */

const STATUS = { pending: ['I kø', '#142032', '#9DBDFF'], processing: ['Leser …', '#142032', '#9DBDFF'], needs_review: ['Gjennomgå', '#3A2414', '#FFB08A'] };

function receipts() {
  const all = S.receipts;
  if (!all) return skel(400);
  const st = S.boot.settings, aiShort = st.provider === 'ollama' ? 'Ollama' : 'Gemini';
  const queue = all.filter((r) => STATUS[r.status]);
  const booked = all.filter((r) => r.status === 'booked' || r.status === 'rejected').slice(0, 12);
  if (!u.selRc || !all.find((r) => r.id === u.selRc)) u.selRc = queue[0]?.id ?? null;
  const R = all.find((r) => r.id === u.selRc);
  const qHtml = queue.map((r) => { const [label, bg, fg] = STATUS[r.status]; return `<button class="rq${r.id === u.selRc ? ' sel' : ''}" data-open-rc="${r.id}">${paper(r)}<span class="grow"><span style="display:flex;justify-content:space-between;gap:8px"><b class="ell" style="font-weight:600">${esc(r.merchant ?? 'Ny kvittering')}</b><span class="mono">${r.total != null ? n2(r.total) + ' kr' : ''}</span></span><span class="note" style="display:block;font-size:12px">${dd(r.date)} · ${esc(r.provider ?? aiShort)}</span>${aiLine(r.aiShort, 'd-ai ell')}</span><span class="status" style="background:${bg};color:${fg}">${label}</span></button>`; }).join('');
  let panel;
  if (!R) panel = '<div class="empty" style="padding:80px 20px">Velg en kvittering i køen, eller last opp en ny.</div>';
  else if (R.status === 'pending' || R.status === 'processing') panel = `<div style="padding:80px 20px;display:flex;flex-direction:column;align-items:center;gap:14px" class="sub"><span class="spin"></span>Leser kvitteringen med ${aiShort} …<button class="btn sm ghost" data-act="rc-manual">Fyll ut manuelt i stedet</button></div>`;
  else panel = confirmPanel(R);
  return `<div class="row-flex">
    <div style="flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:16px">
      <label class="drop" data-drop><span class="drop-ic">${icon('scan', 24, 'currentColor')}</span><b style="font-size:15px;font-weight:600">Last opp kvitteringer</b><span class="note" style="font-size:13px">Bilder eller PDF · flere filer · dra hit eller klikk · leses av ${aiShort}</span><input type="file" accept="image/*,application/pdf" multiple data-upload hidden></label>
      ${card(`<div class="card-h"><h2 style="font-size:16px">Kø</h2><span class="note" style="font-size:12.5px">${queue.length} til gjennomgang</span></div>${qHtml || '<div class="note">Ingen kvitteringer i køen.</div>'}`, '', 'padding:20px;gap:8px')}
      ${card(`<h2 style="font-size:16px">Bokført</h2><div>${booked.map((r) => `<div class="kv-line" style="font-size:13.5px"><button class="link" style="color:var(--text);text-align:left" data-open-rc="${r.id}">${esc(r.merchant ?? '–')} ${r.aiShort ? `<span class="acc-l" style="font-size:12px">✦ ${esc(r.aiShort)}</span> ` : ''}<span class="muted">· ${dd(r.date)}</span></button><span class="mono" style="color:${r.status === 'rejected' ? 'var(--muted)' : 'var(--text)'}">${r.status === 'rejected' ? 'Avvist' : n2(r.total) + ' kr'}</span></div>`).join('') || '<div class="note">Ingen ennå.</div>'}</div>`, '', 'padding:20px;gap:2px')}
    </div>
    ${card(panel, '', 'flex:2 1 520px;gap:18px')}
  </div>`;
}

function confirmPanel(R) {
  const st = S.boot.settings;
  const done = R.status === 'booked' || R.status === 'rejected';
  const conf = R.confidence ?? 0, high = !R.error && conf >= st.minConf / 100 && !R.flag;
  const ex = R.extraction ?? {};
  const other = (R.rawProvider ?? st.provider) === 'ollama' ? 'gemini' : 'ollama';
  const img = R.file && R.mime?.startsWith('image/')
    ? `<div class="receipt-img photo" style="background-image:url('${R.file}')" role="img" aria-label="Kvitteringsbilde"></div>`
    : `<div class="receipt-img">${R.file && R.mime === 'application/pdf' ? `<a href="${R.file}" target="_blank" class="btn sm" style="align-self:center;margin-bottom:8px">Åpne PDF ↗</a>` : ''}
      <div class="hl" style="text-align:center;font-weight:600;font-size:14px;padding:4px">${esc(R.merchant ?? '–')}</div>${ex.org_number ? `<div style="text-align:center">Org.nr ${esc(ex.org_number)}</div>` : ''}<div class="dash"></div>
      ${(ex.lines ?? []).map((l) => `<div class="ln"><span>${esc(l.description)}${l.quantity > 1 ? ` ×${l.quantity}` : ''}</span><span>${n2(l.amount)}</span></div>`).join('') || '<div class="ln" style="opacity:.6"><span>Ingen varelinjer lest</span></div>'}
      <div class="dash"></div><div class="ln hl" style="font-weight:600;font-size:14px;padding:2px 4px"><span>TOTAL</span><span>${R.total != null ? n2(R.total) : '–'}</span></div>
      ${(ex.vat ?? []).map((v) => `<div class="ln"><span>herav mva ${v.rate} %</span><span>${n2(v.amount)}</span></div>`).join('')}</div>`;
  const catBtns = cats('expense').map((c) => `<button data-rc-cat="${c.id}" aria-pressed="${R.categoryId === c.id}" ${done ? 'disabled' : ''}>${esc(c.name)}</button>`).join('');
  return `<div class="card-h"><div><h2 style="font-size:18px">${done ? (R.status === 'booked' ? 'Bokført kvittering' : 'Avvist kvittering') : 'Bekreft kvittering'}</h2><div class="note" style="font-size:13px">${R.provider && R.provider !== 'Manuell' ? `Lest av ${esc(R.provider)}${R.seconds ? ` · ${n2(R.seconds).replace(/,?0+$/, '')} s` : ''}${R.model ? ` · ${esc(R.model)}` : ''}` : 'Manuell utfylling'}</div></div>
      ${R.error ? `<span class="conf" style="background:#2A1A10;color:var(--acc-l)"><i></i>Må fylles ut</span>` : `<span class="conf" style="background:${high ? '#13201B' : '#2A1A10'};color:${high ? 'var(--pos)' : 'var(--acc-l)'}"><i></i>${high ? 'Høy sikkerhet' : 'Sjekk beløp'}</span>`}</div>
    ${R.error ? `<div class="err-msg">${esc(R.error)}</div>` : R.flag ? `<div class="err-msg">${esc(R.flag)}</div>` : ''}
    <div class="row-flex" style="gap:18px">${img}
      <div style="flex:1 1 260px;display:flex;flex-direction:column;gap:12px">
        <label class="f">Butikk<input class="inp" data-rc-field="merchant" value="${esc(R.merchant ?? '')}" ${done ? 'disabled' : ''}></label>
        <div style="display:flex;gap:10px"><label class="f" style="flex:1">Dato<input class="inp" type="date" data-rc-field="date" value="${R.date ?? ''}" ${done ? 'disabled' : ''}></label><label class="f" style="flex:1">Total (kr)<input class="inp hl mono" data-rc-field="total" inputmode="decimal" value="${R.total != null ? n2(R.total).replace(/\s/g, '') : ''}" ${done ? 'disabled' : ''}></label></div>
        <div class="f">Kategori<div class="catpick">${catBtns}</div></div>
        <label class="f">Konto<select class="inp" data-rc-field="accountId" ${done ? 'disabled' : ''}>${accOpts(R.accountId, '–')}</select></label>
        <div class="match ${R.match ? '' : 'none'}">${icon('link', 18, R.match ? '#9FE3C6' : '#8C8C96')}<div><div style="font-weight:600;color:${R.match ? 'var(--pos)' : 'var(--text)'}">${R.match ? 'Matchet mot kortkjøp' : 'Ingen bankmatch ennå'}</div><div class="sub">${R.match ? `${dd(R.match.date)} · ${sgn(R.match.amount)} kr · ${esc(R.match.account)}` : 'Bokføres som ny transaksjon'}</div></div></div>
      </div></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      ${done ? `<button class="btn ghost" data-act="rc-delete">Slett kvittering</button>${R.file ? `<a class="btn" href="${R.file}" target="_blank">Åpne original ↗</a>` : ''}`
        : `${R.file ? `<button class="btn ghost" style="height:48px" data-act="rc-reprocess" data-prov="${other}">Les på nytt med ${other === 'gemini' ? 'Gemini' : 'Ollama'}</button>` : ''}<button class="btn ghost" style="height:48px" data-act="rc-reject">Avvis</button><button class="btn pri" style="height:48px;padding:0 28px" data-act="rc-book">Bokfør</button>`}
    </div>`;
}

/* ===================== Budsjett ===================== */

function budget() {
  const s = S.summary;
  if (!s) return skel(400);
  const used = new Map(s.byCategory.map((b) => [b.categoryId, b.amount]));
  const budMap = new Map(s.budgets.map((b) => [b.categoryId, b.budget]));
  const pct = s.budgetTotal ? s.budgetUsed / s.budgetTotal : 0;
  const ring = conic(s.budgets.map((b) => ({ value: b.used, color: b.color })), Math.max(s.budgetTotal, s.budgetUsed));
  const cards = cats('expense').map((c) => {
    const uu = used.get(c.id) ?? 0, b = budMap.get(c.id) ?? 0, r = b ? uu / b : 0, over = b && uu > b;
    return `<div class="card" style="padding:20px;gap:12px;border-color:${over ? '#4A2A20' : 'var(--line)'}">
      <div class="card-h"><span style="display:flex;align-items:center;gap:10px;font-weight:600"><span class="ini sm" style="background:${rgba(c.color, 0.14)};color:${c.color}">${esc(ini(c.name))}</span>${esc(c.name)}</span><span style="font-size:12px;color:${over ? 'var(--acc-l)' : r > 0.8 ? 'var(--warn)' : 'var(--muted)'}">${!b ? 'Ikke satt' : over ? `Over med ${n0(uu - b)} kr` : r > 0.8 ? 'Nær grensen' : `${n0(b - uu)} kr igjen`}</span></div>
      <div class="mono" style="font-size:22px;font-weight:600">${n0(uu)} <span style="font-size:13px;color:var(--muted);font-weight:400">av ${n0(b)} kr</span></div>
      <div class="prog" style="height:8px"><i style="width:${Math.min(100, r * 100)}%;background:${over ? 'var(--acc)' : r > 0.8 ? 'var(--warn)' : c.color}"></i></div>
      <label class="f" style="flex-direction:row;align-items:center;justify-content:space-between">Månedsbudsjett<input class="inp mono" data-budget="${c.id}" inputmode="numeric" value="${b || ''}" placeholder="0" style="width:110px;height:38px;text-align:right"></label></div>`;
  }).join('');
  return `<div style="display:flex;flex-direction:column;gap:16px">
    <div style="display:flex;align-items:center;gap:10px"><button class="btn sm" data-month="-1" aria-label="Forrige måned">‹</button><b style="font-size:15px;min-width:130px;text-align:center">${cap(monthName(s.month))} ${s.month.slice(0, 4)}</b><button class="btn sm" data-month="1" aria-label="Neste måned">›</button><span class="note">Beløpene gjelder alle måneder</span></div>
    ${card(`<div class="ring" style="background:${ring}"><div><span class="mono" style="font-size:26px;font-weight:600">${n0(pct * 100)} %</span><span class="note" style="font-size:12px">brukt</span></div></div>
      <div style="flex:1 1 300px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px">
        <div><div class="note" style="font-size:13px">Budsjett ${monthName(s.month)}</div><div class="mono" style="font-size:24px;font-weight:600">${n0(s.budgetTotal)} kr</div></div>
        <div><div class="note" style="font-size:13px">Brukt</div><div class="mono neg" style="font-size:24px;font-weight:600">${n0(s.budgetUsed)} kr</div></div>
        <div><div class="note" style="font-size:13px">Igjen</div><div class="mono" style="font-size:24px;font-weight:600;color:${s.left >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${neg0(s.left)} kr</div></div>
        <div><div class="note" style="font-size:13px">Per dag resten av måneden</div><div class="mono" style="font-size:24px;font-weight:600">${n0(Math.max(0, s.left) / s.daysLeft)} kr</div></div>
      </div>`, '', 'padding:24px;flex-direction:row;flex-wrap:wrap;gap:28px;align-items:center')}
    <div class="grid-cards">${cards}</div></div>`;
}

/* ===================== Faste utgifter ===================== */

function recurring() {
  const list = S.recurring;
  if (!list) return skel(300);
  const act = list.filter((r) => r.active);
  const monthly = act.reduce((a, r) => a + (r.interval === 'yearly' ? r.amount / 12 : r.interval === 'weekly' ? (r.amount * 52) / 12 : r.amount), 0);
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
  const days = new Set(act.filter((r) => r.interval === 'monthly' || (r.interval === 'yearly' && r.month === m + 1)).map((r) => Math.min(r.day, dim)));
  let cal = ['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((d) => `<span class="wd">${d}</span>`).join('') + '<span class="blank"></span>'.repeat(first);
  for (let d = 1; d <= dim; d++) cal += `<span class="${d === now.getDate() ? 'today' : days.has(d) ? 'has' : ''}">${d}</span>`;
  const IV = { monthly: 'Månedlig', yearly: 'Årlig', weekly: 'Ukentlig' };
  const rows = list.map((r) => `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-top:1px solid var(--sep);opacity:${r.active ? 1 : 0.45}">
    <span class="ini" style="background:${rgba(r.color, 0.14)};color:${r.color}">${esc(ini(r.name))}</span>
    <button class="grow link" style="color:var(--text);text-align:left" data-edit-rec="${r.id}"><div style="font-weight:500">${esc(r.name)}${r.detected ? ' <span class="pill" style="background:#142032;color:var(--blue-l);font-size:11px">oppdaget</span>' : ''}</div><div class="note" style="font-size:12px">${esc(r.category)} · ${IV[r.interval]} · ${r.day}.${r.interval === 'yearly' && r.month ? ' ' + monthName(`2000-${String(r.month).padStart(2, '0')}`) : ''} · neste ${dd(r.next)}</div></button>
    <span class="mono" style="font-weight:500">${n0(r.amount)} kr</span>
    <button class="toggle" role="switch" aria-checked="${r.active}" aria-label="Aktiv" data-rec-toggle="${r.id}"></button></div>`).join('');
  return `<div class="row-flex">
    ${card(`<div class="card-h" style="margin-bottom:10px"><h2>Abonnementer og regninger</h2><div style="display:flex;gap:8px"><button class="btn sm" data-act="detect-rec">Finn faste trekk</button><button class="btn sm pri" data-act="add-rec">+ Legg til</button></div></div>
      ${rows || '<div class="note" style="padding:12px 0">Ingen faste utgifter ennå. «Finn faste trekk» ser etter gjentakende trekk i transaksjonene dine.</div>'}${u.msg.rec ? `<div class="ok-msg" style="padding-top:8px">${esc(u.msg.rec)}</div>` : ''}`, '', 'flex:2 1 520px;gap:4px')}
    <div style="flex:1 1 320px;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${card(`<div class="note" style="font-size:13px">Faste utgifter per måned</div><div class="mono" style="font-size:30px;font-weight:600">${n0(monthly)} <span style="font-size:14px;color:var(--muted);font-weight:400">kr</span></div><div class="note">${n0(monthly * 12)} kr i året · ${act.length} aktive</div>`, '', 'gap:6px')}
      ${card(`<div class="card-h"><b style="font-weight:600">${cap(monthName(`${y}-${String(m + 1).padStart(2, '0')}`))}</b><span class="note">trekkdager</span></div><div class="cal7">${cal}</div>`, '', 'gap:12px')}
    </div></div>`;
}

/* ===================== Kontoer ===================== */

const FACES = { checking: ['linear-gradient(135deg,#2A2A31,#17171B)', 'var(--text)'], credit: ['linear-gradient(135deg,#FF8A4C,#C24E17)', 'var(--acc-ink)'], savings: ['linear-gradient(135deg,#1F3A2F,#13201B)', 'var(--text)'], cash: ['var(--inner)', 'var(--text)'] };
function accounts() {
  const a = accs(), goals = S.boot.goals;
  const cardsHtml = a.map((x) => { const [face, ink] = FACES[x.type] ?? FACES.cash; return `<div style="display:flex;flex-direction:column;gap:12px">
    <button class="acc-face" data-edit-acc="${x.id}" style="background:${face};color:${ink};text-align:left;${x.type === 'credit' ? 'border-color:transparent' : ''}"><div style="display:flex;justify-content:space-between;width:100%"><b style="font-weight:600">${esc(x.bank || ACC_TYPES[x.type])}</b><span class="mono" style="font-size:13px">${x.last4 ? '•••• ' + esc(x.last4) : ''}</span></div>
      <div><div style="font-size:12.5px;opacity:.8">${esc(x.name)}</div><div class="mono" style="font-size:24px;font-weight:600">${neg(x.balance)} kr</div></div></button>
    <div style="display:flex;justify-content:space-between;font-size:13px;padding:0 4px" class="muted"><span>${ACC_TYPES[x.type]}</span><span>${esc(x.note)}</span></div></div>`; }).join('');
  const total = a.reduce((s, x) => s + x.balance, 0);
  return `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="card-h"><div class="note">Samlet saldo <b class="mono" style="color:var(--text);font-size:16px">${neg(total)} kr</b></div><button class="btn pri" data-act="add-acc">+ Ny konto</button></div>
    <div class="grid-cards">${cardsHtml || '<div class="note">Ingen kontoer ennå.</div>'}</div>
    ${card(`<div class="card-h"><h2>Sparemål</h2><button class="btn sm" data-act="add-goal">+ Nytt sparemål</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">${goals.map((g) => `<button class="goal" data-edit-goal="${g.id}" style="border:0;text-align:left"><div class="card-h" style="width:100%"><b style="font-weight:600">${esc(g.name)}</b><span class="note">${n0((g.saved / g.target) * 100)} %</span></div>
        <div class="mono" style="font-size:18px">${n0(g.saved)} kr <span class="note">/ ${n0(g.target)} kr</span></div><div class="prog" style="height:8px;width:100%"><i style="width:${Math.min(100, (g.saved / g.target) * 100)}%;background:${g.color}"></i></div></button>`).join('') || '<div class="note">Ingen sparemål ennå.</div>'}</div>`, '', 'gap:16px')}
  </div>`;
}

/* ===================== Rapporter ===================== */

function reports() {
  const r = S.report;
  if (!r) return skel(400);
  const donut = conic(r.byCategory.map((c) => ({ value: c.amount, color: c.color })), r.total, 1, '#24242A');
  const topMax = r.merchants[0]?.amount || 1;
  const title = r.mode === 'year' ? r.from.slice(0, 4) : `${cap(monthName(r.from.slice(0, 7)))} ${r.from.slice(0, 4)}`;
  return `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="card-h no-print"><div style="display:flex;gap:12px;align-items:center"><div class="seg"><button data-rap="month" aria-pressed="${u.rap === 'month'}">Måned</button><button data-rap="year" aria-pressed="${u.rap === 'year'}">År</button></div>
      <button class="btn sm" data-month="-1" aria-label="Forrige">‹</button><b>${title}</b><button class="btn sm" data-month="1" aria-label="Neste">›</button></div>
      <div style="display:flex;gap:10px"><a class="btn" href="/finans/api/transactions.csv?from=${r.from}&to=${r.to}">CSV</a><button class="btn pri" data-act="print">PDF-rapport</button></div></div>
    <div class="row-flex">
      ${card(`<div class="donut" style="background:${donut}"><div><span class="note" style="font-size:12px">Utgifter</span><span class="mono" style="font-size:19px;font-weight:600">${n0(r.total)} kr</span></div></div>
        <div style="flex:1 1 180px;display:flex;flex-direction:column;gap:9px">${r.byCategory.map((c) => `<div style="display:flex;align-items:center;gap:10px;font-size:13px"><span style="width:10px;height:10px;border-radius:3px;background:${c.color}"></span><span class="grow">${esc(c.category)}</span><span class="muted">${n0((c.amount / (r.total || 1)) * 100)} %</span><span class="mono" style="width:90px;text-align:right">${n0(c.amount)}</span></div>`).join('') || '<div class="note">Ingen utgifter i perioden.</div>'}</div>`, '', 'flex:1 1 380px;flex-direction:row;flex-wrap:wrap;gap:24px;align-items:center')}
      ${card(`<h2>Mest brukt hos</h2>${r.merchants.map((m) => `<div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>${esc(m.name)} <span class="muted">· ${m.count} kjøp</span></span><span class="mono">${n0(m.amount)} kr</span></div><div class="prog"><i style="width:${(m.amount / topMax) * 100}%;background:var(--acc)"></i></div></div>`).join('') || '<div class="note">Ingen kjøp i perioden.</div>'}`, '', 'flex:1 1 300px;gap:12px')}
    </div>
    <section class="card" style="padding:10px 22px 16px"><div class="tbl-wrap"><table style="min-width:520px"><thead><tr><th>Måned</th><th style="text-align:right">Inn</th><th style="text-align:right">Ut</th><th style="text-align:right">Netto</th><th>Sparerate</th></tr></thead>
      <tbody>${r.months.map((m) => { const net = m.inn - m.ut; return `<tr style="cursor:default" class="mono"><td style="font-family:Geist,sans-serif">${cap(monthName(m.month))}</td><td style="text-align:right">${n0(m.inn)}</td><td style="text-align:right">${n0(m.ut)}</td><td style="text-align:right;color:${net >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${net >= 0 ? '+' : '−'}${n0(net)}</td><td class="muted">${m.inn ? n0((net / m.inn) * 100) + ' %' : '–'}</td></tr>`; }).join('')}</tbody></table></div></section>
  </div>`;
}

/* ===================== Innstillinger ===================== */

const SET_TABS = [['gen', 'Generelt', 'Navn, valuta, måned'], ['meny', 'Sidemeny', 'Rekkefølge og synlighet'], ['imp', 'Import', 'Kontoutskrift, CSV og XLSX'], ['ai', 'AI-motor', 'Ollama eller Gemini'], ['cat', 'Kategorier', 'Farger og typer'], ['rule', 'Regler', 'Auto-kategorisering'],
  ['bank', 'Bank og import', 'CSV og PSD2'], ['varsel', 'Varsler', 'Budsjett og kvitteringer'], ['mobil', 'Mobil og tilgang', 'App-tokens og snarveier'], ['data', 'Backup og data', 'Nedlasting, SMB-share og gjenoppretting']];

// Innstillinger → Sidemeny: dra, ▲▼ og bryter for vis/skjul. Endringene lagres med en gang.
function menuTab() {
  const { order, hidden } = navCfg();
  const rows = order.map((p, i) => {
    const hid = hidden.includes(p), fixed = NAV_FIXED.includes(p), label = pageName(p);
    return `<div class="navcfg${hid ? ' off' : ''}" draggable="true" data-navcfg="${p}">
      <span class="grip" aria-hidden="true">⋮⋮</span><span class="no mono">${String(i + 1).padStart(2, '0')}</span>${icon(p, 18, 'var(--muted)')}<span class="lbl">${label}</span>
      <button type="button" class="mv" data-navcfg-move="${p}:-1" aria-label="Flytt ${label} opp" ${i ? '' : 'disabled'}>▲</button><button type="button" class="mv" data-navcfg-move="${p}:1" aria-label="Flytt ${label} ned" ${i < order.length - 1 ? '' : 'disabled'}>▼</button>
      ${fixed ? '<span class="always">Alltid</span>' : `<button type="button" class="toggle" role="switch" aria-checked="${!hid}" data-navcfg-tog="${p}" aria-label="Vis ${label} i sidemenyen" title="${hid ? 'Skjult' : 'Vises'}"></button>`}</div>`;
  }).join('');
  return `<div class="sub" style="font-size:13.5px;line-height:1.5;text-wrap:pretty">Dra punktene for å endre rekkefølgen i sidemenyen, eller bruk pilene. Bryteren skjuler eller viser et menypunkt. Endringene lagres med en gang. Skjulte sider kan fortsatt åpnes fra lenker.</div>
    <div class="navcfg-list">${rows}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" data-act="nav-showall">Vis alle</button><button class="btn ghost" data-act="nav-reset">Tilbakestill rekkefølge</button></div>`;
}

function settingsPage() {
  const st = S.boot.settings, t = u.setTab, cur = SET_TABS.find((x) => x[0] === t);
  let body = '';
  const sel = (key, options) => `<select class="inp" data-set="${key}">${options.map(([v, l]) => opt(v, l, st[key])).join('')}</select>`;
  if (t === 'gen') body = `<div class="form-grid">
    <label class="f">Visningsnavn<input class="inp" data-set="name" value="${esc(st.name)}" placeholder="Navnet til hovedadmin"></label>
    <label class="f">Valuta${sel('currency', [['NOK', 'NOK – norske kroner'], ['EUR', 'EUR – euro'], ['SEK', 'SEK – svenske kroner']])}</label>
    <label class="f">Måneden starter (lønningsdag)<select class="inp" data-set="monthStart">${Array.from({ length: 28 }, (_, i) => opt(i + 1, `${i + 1}. i måneden`, st.monthStart)).join('')}</select></label>
    <label class="f">Sparemål for året (kr)<input class="inp mono" data-set="yearGoal" inputmode="numeric" value="${st.yearGoal}"></label></div>`;
  else if (t === 'ai') {
    const ai = S.ai;
    const models = ai?.ollama?.models?.length ? ai.ollama.models : ['qwen2.5vl:7b', 'gemma3:12b', 'llama3.2-vision:11b', 'minicpm-v'];
    if (!models.includes(st.ollamaModel)) models.unshift(st.ollamaModel);
    body = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
      ${[['ollama', 'Ollama · lokalt', 'Bildet forlater aldri huset'], ['gemini', 'Gemini · sky', 'Raskest og mest presis']].map(([k2, n, s2]) => `<button class="prov" data-provider="${k2}" aria-pressed="${st.provider === k2}"><b><span class="radio"></span>${n}</b><span class="note" style="font-size:12.5px">${s2}</span></button>`).join('')}</div>
      <div class="form-grid">
        <label class="f">Ollama-adresse<input class="inp mono" style="font-size:13px" data-set="ollamaUrl" value="${esc(st.ollamaUrl)}"></label>
        <label class="f">Ollama-modell<select class="inp" data-set="ollamaModel">${models.map((m) => opt(m, m, st.ollamaModel)).join('')}</select></label>
        <label class="f">Gemini-modell<input class="inp mono" style="font-size:13px" data-set="geminiModel" value="${esc(st.geminiModel)}"></label>
        <label class="f">Gemini API-nøkkel<input class="inp" type="password" data-set="geminiKey" value="" placeholder="${st.geminiKeySet ? '•••••••• lagret på serveren' : 'Lagres på serveren'}" autocomplete="off"></label></div>
      <label class="f">Minste sikkerhet før bilaget merkes «Sjekk» · <b class="mono" style="color:var(--text)">${st.minConf} %</b><input type="range" min="50" max="99" value="${st.minConf}" data-set="minConf"></label>
      <button class="tog-row" data-tog="fallback"><span class="grow"><b style="font-weight:500">Bruk ${st.provider === 'ollama' ? 'Gemini' : 'Ollama'} som reserve</b><br><span class="note" style="font-size:12.5px">Når hovedmotoren er utilgjengelig eller usikker. Slå av for å holde alt lokalt.</span></span><span class="toggle" role="switch" aria-checked="${!!st.fallback}"></span></button>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn ghost" data-act="test-ai">Test tilkobling</button>${u.msg.ai ? `<span class="${u.msg.aiOk ? 'ok-msg' : 'err-msg'}">${esc(u.msg.ai)}</span>` : ''}</div>
      <div class="note" style="font-size:12.5px">Med Gemini sendes bildet til Google. På gratisnivået kan Google bruke data til å forbedre tjenestene – sjekk vilkårene.</div>`;
  } else if (t === 'cat') body = `<div style="display:flex;flex-direction:column;gap:8px">${cats().map((c) => `<div class="edit-row"><input type="color" value="${c.color}" data-cat-field="color" data-id="${c.id}" aria-label="Farge"><input class="inp grow" value="${esc(c.name)}" data-cat-field="name" data-id="${c.id}" aria-label="Navn" style="flex:1 1 160px">
      <select class="inp" data-cat-field="kind" data-id="${c.id}" style="width:140px">${Object.entries(KINDS).map(([k2, l]) => opt(k2, l, c.kind)).join('')}</select><button class="del" data-del-cat="${c.id}" aria-label="Slett">×</button></div>`).join('')}
    <button class="add" data-act="add-cat">+ Ny kategori</button><div class="note" style="font-size:12.5px">Overføringer (f.eks. til sparekonto) telles verken som inntekt eller utgift.</div></div>`;
  else if (t === 'rule') body = `<div style="display:flex;flex-direction:column;gap:8px"><div class="sub" style="font-size:13px">Regler går foran AI-forslaget. Bruk * som jokertegn – «REMA*» treffer også «VARER REMA 1000». Rettelser du gjør ved bokføring blir nye regler automatisk.</div>
    ${S.boot.rules.map((r) => `<div class="edit-row"><input class="inp mono" style="flex:1 1 140px;font-size:13px" value="${esc(r.pattern)}" data-rule-field="pattern" data-id="${r.id}" aria-label="Mønster"><span class="muted">→</span><select class="inp" style="flex:1 1 180px" data-rule-field="categoryId" data-id="${r.id}">${catOpts(r.categoryId)}</select><button class="del" data-del-rule="${r.id}" aria-label="Slett">×</button></div>`).join('')}
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="add" data-act="add-rule">+ Ny regel</button><button class="add" data-act="apply-rules">Bruk på ukategoriserte</button></div>${u.msg.rules ? `<div class="ok-msg">${esc(u.msg.rules)}</div>` : ''}</div>`;
  else if (t === 'bank') body = `<form data-form="csv" style="display:flex;flex-direction:column;gap:14px">
    <div class="form-grid"><label class="f">CSV-profil${sel('csvProfile', S.boot.profiles.map((p) => [p, p]))}</label><label class="f">Konto<select class="inp" name="accountId" required>${accOpts('', 'Velg konto')}</select></label></div>
    <label class="drop" style="flex-direction:row;justify-content:flex-start;text-align:left;padding:20px"><span class="ini" style="background:var(--inner);color:var(--acc-l)">↑</span><span><b style="font-weight:600">Importer CSV fra nettbanken</b><br><span class="note" style="font-size:12.5px">Duplikater hoppes over automatisk · regler brukes på nye rader</span></span><input type="file" name="file" accept=".csv,text/csv" hidden data-csv></label>
    ${u.msg.csv ? `<div class="${u.msg.csvOk ? 'ok-msg' : 'err-msg'}">${esc(u.msg.csv)}</div>` : ''}
    <div class="box" style="padding:16px;flex-wrap:wrap"><div><b style="font-weight:600">Open banking (PSD2)</b><div class="note" style="font-size:12.5px">Automatisk henting via Enable Banking · kommer i fase 3</div></div><span class="pill" style="background:var(--line);color:var(--text2);font-weight:400">Ikke koblet</span></div>
    <div class="box" style="padding:16px;flex-direction:column;align-items:stretch;gap:12px"><div><b style="font-weight:600">Finn-handler via e-post (IMAP)</b><div class="note" style="font-size:12.5px">For å hente Finn-kvitteringer automatisk senere. Inntil videre limes e-postene inn under Finn-handler. Flere filer (XLSX, CSV, tekst) importeres under <a href="#/imp">Import</a>.</div></div>
      <div class="form-grid"><label class="f">IMAP-server<input class="inp mono" style="font-size:13px" data-set="imapHost" value="${esc(st.imapHost ?? '')}" placeholder="imap.gmail.com"></label><label class="f">Brukernavn<input class="inp" data-set="imapUser" value="${esc(st.imapUser ?? '')}" autocomplete="off"></label>
      <label class="f">App-passord<input class="inp" type="password" data-set="imapPass" value="" placeholder="${st.imapPassSet ? '•••••••• lagret på serveren' : 'Lagres på serveren'}" autocomplete="off"></label><label class="f">Mappe<input class="inp" data-set="imapFolder" value="${esc(st.imapFolder ?? 'INBOX')}"></label></div></div></form>`;
  else if (t === 'varsel') body = `<div style="display:flex;flex-direction:column;gap:8px">${[['autoCat', 'Auto-kategorisering', 'Bruk regler og AI-forslag'], ['aiSummaries', '✦ AI-sammendrag', 'Kort og lang beskrivelse av hver post, laget i bakgrunnen'], ['n80', 'Varsel ved 80 % av budsjett', 'Per kategori'], ['n100', 'Varsel når budsjett er brukt opp', 'Per kategori'], ['nRc', 'Ny kvittering til gjennomgang', 'Vises som merke i menyen'], ['nFast', 'Påminnelse om faste trekk', 'Dagen før trekkdato']]
    .map(([k2, n, s2]) => `<button class="tog-row" data-tog="${k2}"><span class="grow"><b style="font-weight:500">${n}</b><br><span class="note" style="font-size:12.5px">${s2}</span></span><span class="toggle" role="switch" aria-checked="${!!st[k2]}"></span></button>`).join('')}
    <div class="note" style="font-size:12.5px">Varsler vises i FinansHub og i mobilappen. Push-varsler krever at appen er installert på hjemskjermen.</div></div>`;
  else if (t === 'mobil') {
    const when = (ms) => (ms ? new Date(ms).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
    body = `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="sub" style="font-size:13px">Mobilappen åpnes på <b class="mono">/finans/</b> eller i de native appene, og logger inn med brukernavn og passord (og 2FA-kode hvis det er på).</div>
    <div class="sub" style="font-size:13px">Personlige tokens gir tilgang til FinansHub-API-et uten innlogging, f.eks. for iOS-snarveien som laster opp kvitteringer (<span class="mono">POST /finans/api/receipts</span>), Home Assistant, Excel Power Query eller skript (<span class="mono">Authorization: Bearer fh_pat_…</span>). De gir aldri tilgang til resten av homelab. Bare hashen lagres.</div>
    ${(S.tokens ?? []).map((tk) => `<div class="edit-row"><span class="grow"><b style="font-weight:500">${esc(tk.name)}</b>${tk.expired ? ' <span class="pill" style="background:#3A2414;color:var(--acc-l)">utløpt</span>' : ''}<br><span class="note mono" style="font-size:12px">${tk.scopes.join(' · ')}</span><br><span class="note" style="font-size:12px">Laget ${when(tk.created)} · ${tk.lastUsed ? 'sist brukt ' + when(tk.lastUsed) : 'aldri brukt'} · ${tk.expires ? (tk.expired ? 'utløp ' : 'utløper ') + when(tk.expires) : 'utløper aldri'}</span></span><button class="btn sm danger" data-del-token="${tk.id}">Trekk tilbake</button></div>`).join('') || '<div class="note">Ingen tokens.</div>'}
    <form data-form="token" class="box" style="flex-direction:column;align-items:stretch;gap:12px;padding:16px"><b style="font-weight:600">Nytt token</b>
      <div class="form-grid"><label class="f">Navn<input class="inp" name="name" placeholder="F.eks. iPhone-snarvei" required></label>
      <label class="f">Utløper<select class="inp" name="expires">${[['30d', 'Om 30 dager'], ['90d', 'Om 90 dager'], ['1y', 'Om 1 år'], ['never', 'Aldri']].map(([v, l]) => opt(v, l, '90d')).join('')}</select></label></div>
      <div class="scope-grid">${[['finance:read', 'Lese alt'], ['read:transactions', 'Lese transaksjoner'], ['read:summary', 'Lese oversikt'], ['read:budget', 'Lese budsjett'], ['receipts:write', 'Laste opp kvitteringer'], ['write:transactions', 'Endre transaksjoner'], ['finance:write', 'Endre alt']].map(([v, l]) => `<label class="scope"><input type="checkbox" name="scope" value="${v}" ${['finance:read', 'receipts:write'].includes(v) ? 'checked' : ''}><span><b class="mono" style="font-size:12px;font-weight:500">${v}</b><br><span class="note" style="font-size:12px">${l}</span></span></label>`).join('')}</div>
      <div><button class="btn sm pri">Lag token</button></div></form>
    ${u.msg.token ? `<div class="box" style="flex-direction:column;align-items:stretch"><span class="ok-msg">Kopier tokenet nå – det vises bare én gang:</span><div style="display:flex;gap:10px;align-items:center"><code class="mono grow" style="word-break:break-all;user-select:all">${esc(u.msg.token)}</code><button class="btn sm" data-copy="${esc(u.msg.token)}">Kopier</button></div></div>` : ''}</div>`;
  }
  else if (t === 'data') body = backupTab();
  else if (t === 'meny') body = menuTab();
  else if (t === 'imp') body = impPage();
  return `<div class="row-flex">
    <nav class="card set-nav">${SET_TABS.map(([k2, n, s2]) => `<button data-settab="${k2}" aria-current="${t === k2}"><span>${n}</span><small>${s2}</small></button>`).join('')}</nav>
    ${card(`<div><h2 style="font-size:18px">${cur[1]}</h2><div class="note" style="font-size:13px">${cur[2]}</div></div>${body}${u.msg.set ? `<div class="ok-msg">${esc(u.msg.set)}</div>` : ''}`, '', 'flex:1 1 480px;padding:24px;gap:18px')}
  </div>`;
}

/* ===================== Modaler ===================== */

// Kvitteringer uten lagret bilde (f.eks. e-postkvitteringer og demodata): tegnes som papirkvittering fra varelinjene AI leste.
function paperReceipt(r) {
  const vat = (r.vat ?? []).reduce((a, v) => a + (+v.amount || 0), 0);
  return `<div class="paper-rc mono"><b>${esc((r.merchant ?? 'Kvittering').toUpperCase())}</b><span class="c">${r.date ? dd(r.date) + '.' + r.date.slice(0, 4) : ''}</span><hr>
    ${(r.lines ?? []).map((l) => `<span class="ln"><span>${esc(l.description ?? '')}</span><span>${n2(l.amount)}</span></span>`).join('') || '<span class="c">Ingen varelinjer lest</span>'}<hr>
    <span class="ln tot"><span>TOTAL</span><span>${r.total != null ? n2(r.total) : '–'}</span></span>${vat ? `<span class="ln"><span>herav MVA</span><span>${n2(vat)}</span></span>` : ''}
    <span class="c" style="margin-top:10px">Ingen bildefil lagret – vist fra AI-utlesingen</span></div>`;
}

// Originalene bak en transaksjon: kvitteringsbildet/PDF-en med zoom, og bankraden slik den kom fra banken.
function origModal(m, close) {
  const o = S.orig?.[m.id], t = S.tx?.items.find((x) => x.id === m.id);
  const seg = `<div class="seg" style="border-radius:12px" role="tablist">${[['receipt', 'Kvittering'], ['bank', 'Banktransaksjon']].map(([k2, l]) => `<button type="button" role="tab" data-orig-view="${k2}" aria-pressed="${m.view === k2}" style="flex:1;height:38px">${l}</button>`).join('')}</div>`;
  let body = skel(260);
  if (o && m.view === 'receipt') {
    const r = o.receipt;
    body = !r ? `<div class="empty" style="display:flex;flex-direction:column;gap:12px;align-items:center">Ingen kvittering vedlagt<label class="btn sm" style="cursor:pointer">Legg ved kvittering<input type="file" accept="image/*,application/pdf" data-attach-rc="${m.id}" hidden></label></div>`
      : !r.fileUrl ? paperReceipt(r)
      : r.mime === 'application/pdf' ? `<iframe class="orig-pdf" src="${esc(r.fileUrl)}" title="Kvittering (PDF)"></iframe>`
      : `<div class="orig-img${u.origZoom ? ' zoom' : ''}" data-act="orig-zoom" title="${u.origZoom ? 'Zoom ut' : 'Zoom inn'}"><img src="${esc(r.fileUrl)}" alt="Original kvittering${r.merchant ? ' fra ' + esc(r.merchant) : ''}"></div>`;
  } else if (o) {
    const b = o.bankRow;
    const rows = (pairs) => pairs.filter(([, v]) => v != null && v !== '').map(([k2, v]) => `<div class="kv-line"><span class="sub">${k2}</span><span class="mono" style="text-align:right;word-break:break-word">${esc(v)}</span></div>`).join('');
    body = !b ? `<div class="empty">${t?.source === 'receipt' ? 'Transaksjonen ble laget fra en kvittering og har ingen bankrad.' : 'Ingen bankrad lagret. Transaksjonen er lagt inn manuelt eller importert før FinansHub tok vare på bankradene.'}</div>`
      : `<div class="orig-bank">${rows([['Dato', b.bookingDate], ['Rentedato', b.valueDate], ['Forklaring', b.description], [b.amount < 0 ? 'Ut' : 'Inn', n2(Math.abs(b.amount)) + ' kr'], ['Konto', b.account], ['Bank', b.bank], ['Arkivref.', b.archiveReference], ['Kilde', [b.source, b.file].filter(Boolean).join(' · ')], ['Importert', b.importedAt ? new Date(b.importedAt).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : null]])}</div>
        <details class="orig-raw"><summary>Rådata (JSON)</summary><pre class="mono">${esc(JSON.stringify({ bookingDate: b.bookingDate, valueDate: b.valueDate, description: b.description, amount: b.amount, account: b.account, archiveReference: b.archiveReference, source: b.source, raw: b.raw }, null, 2))}</pre></details>`;
  }
  const dl = o && m.view === 'receipt' && o.receipt?.fileUrl ? `<a class="btn ghost" href="${esc(o.receipt.fileUrl)}" download>Last ned</a>` : o?.bankRow && m.view === 'bank' ? '<button type="button" class="btn ghost" data-act="orig-dl">Last ned</button>' : '';
  const share = o && (m.view === 'bank' ? o.bankRow : o.receipt?.fileUrl) && navigator.share ? '<button type="button" class="btn ghost" data-act="orig-share">Del</button>' : '';
  return `<div class="modal" data-modal><div class="dlg orig-modal" role="dialog" aria-modal="true"><div class="card-h"><div><h2 style="font-size:19px">${m.view === 'bank' ? 'Original banktransaksjon' : 'Original kvittering'}</h2><div class="note" style="font-size:13px">${esc(t?.description ?? '')}${t ? ' · ' + dd(t.date) : ''}</div></div>${close}</div>
    ${seg}${body}${dl || share ? `<div style="display:flex;gap:10px;justify-content:flex-end">${share}${dl}</div>` : ''}</div></div>`;
}

function modalHtml() {
  const m = u.add;
  if (!m) return '';
  const close = '<button type="button" class="x-btn" data-act="close-modal" aria-label="Lukk">×</button>';
  if (m.type === 'tx') return `<div class="modal" data-modal><form data-form="tx"><div class="card-h"><h2 style="font-size:19px">Ny transaksjon</h2>${close}</div>
    <div class="seg" style="border-radius:12px"><button type="button" data-txtype="ut" aria-pressed="${m.kind !== 'inn'}" style="flex:1;height:38px">Utgift</button><button type="button" data-txtype="inn" aria-pressed="${m.kind === 'inn'}" style="flex:1;height:38px">Inntekt</button></div>
    <label class="f">Beskrivelse<input class="inp" name="description" required placeholder="F.eks. Rema 1000" autofocus></label>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Beløp (kr)<input class="inp hl mono" name="amount" required inputmode="decimal"></label><label class="f" style="flex:1">Dato<input class="inp" type="date" name="date" value="${today()}" required></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Kategori<select class="inp" name="categoryId">${opt('', 'Automatisk (regler)', '')}${catOpts(m.kind === 'inn' ? cats('income')[0]?.id : '')}</select></label><label class="f" style="flex:1">Konto<select class="inp" name="accountId">${accOpts(accs()[0]?.id, '–')}</select></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Delt mappe<select class="inp" name="folderId">${opt('', 'Ingen', '')}${(S.txFolders ?? []).map((f) => opt(f.id, f.name, '')).join('')}</select></label><label class="f" style="flex:1">Notat<input class="inp" name="note"></label></div>
    <button class="btn pri" style="height:50px;margin-top:4px">Lagre</button></form></div>`;
  if (m.type === 'orig') return origModal(m, close);
  if (m.type === 'acc') { const a = accs().find((x) => x.id === m.id) ?? { type: 'checking' }; return `<div class="modal" data-modal><form data-form="acc"><div class="card-h"><h2 style="font-size:19px">${m.id ? 'Endre konto' : 'Ny konto'}</h2>${close}</div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Navn<input class="inp" name="name" required value="${esc(a.name ?? '')}" placeholder="Brukskonto"></label><label class="f" style="flex:1">Bank<input class="inp" name="bank" value="${esc(a.bank ?? '')}" placeholder="DNB"></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Type<select class="inp" name="type">${Object.entries(ACC_TYPES).map(([k2, l]) => opt(k2, l, a.type)).join('')}</select></label><label class="f" style="flex:1">Siste fire siffer<input class="inp mono" name="last4" inputmode="numeric" maxlength="4" value="${esc(a.last4 ?? '')}" placeholder="1234"></label></div>
    <label class="f">Startsaldo (kr) – saldo før første transaksjon<input class="inp mono" name="openingBalance" inputmode="decimal" value="${a.openingBalance ?? 0}"></label>
    <label class="f">Notat<input class="inp" name="note" value="${esc(a.note ?? '')}" placeholder="F.eks. 3,9 % rente"></label>
    <div class="note" style="font-size:12px">Lagre aldri fullt konto- eller kortnummer – bare de fire siste sifrene.</div>
    <div style="display:flex;gap:10px">${m.id ? '<button type="button" class="btn danger" data-act="del-acc">Slett</button>' : ''}<button class="btn pri" style="flex:1;height:50px">Lagre</button></div></form></div>`; }
  if (m.type === 'goal') { const g = S.boot.goals.find((x) => x.id === m.id) ?? {}; return `<div class="modal" data-modal><form data-form="goal"><div class="card-h"><h2 style="font-size:19px">${m.id ? 'Endre sparemål' : 'Nytt sparemål'}</h2>${close}</div>
    <label class="f">Navn<input class="inp" name="name" required value="${esc(g.name ?? '')}"></label>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Spart (kr)<input class="inp mono" name="saved" inputmode="decimal" value="${g.saved ?? 0}"></label><label class="f" style="flex:1">Mål (kr)<input class="inp mono" name="target" inputmode="decimal" required value="${g.target ?? ''}"></label><label class="f">Farge<input type="color" name="color" value="${g.color ?? '#5FD3A8'}"></label></div>
    <div style="display:flex;gap:10px">${m.id ? '<button type="button" class="btn danger" data-act="del-goal">Slett</button>' : ''}<button class="btn pri" style="flex:1;height:50px">Lagre</button></div></form></div>`; }
  if (m.type === 'rec') { const r = S.recurring?.find((x) => x.id === m.id) ?? { interval: 'monthly', day: 1 }; return `<div class="modal" data-modal><form data-form="rec"><div class="card-h"><h2 style="font-size:19px">${m.id ? 'Endre fast utgift' : 'Ny fast utgift'}</h2>${close}</div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:2">Navn<input class="inp" name="name" required value="${esc(r.name ?? '')}" placeholder="Spotify"></label><label class="f" style="flex:1">Beløp (kr)<input class="inp mono" name="amount" required inputmode="decimal" value="${r.amount ?? ''}"></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Intervall<select class="inp" name="interval">${[['monthly', 'Månedlig'], ['yearly', 'Årlig'], ['weekly', 'Ukentlig']].map(([k2, l]) => opt(k2, l, r.interval)).join('')}</select></label><label class="f" style="flex:1">Trekkdag<input class="inp mono" name="day" type="number" min="1" max="31" value="${r.day}"></label><label class="f" style="flex:1">Måned (årlig)<input class="inp mono" name="month" type="number" min="1" max="12" value="${r.month ?? ''}"></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Kategori<select class="inp" name="categoryId">${opt('', '–', r.categoryId)}${catOpts(r.categoryId)}</select></label><label class="f" style="flex:1">Konto<select class="inp" name="accountId">${accOpts(r.accountId, '–')}</select></label></div>
    <div style="display:flex;gap:10px">${m.id ? '<button type="button" class="btn danger" data-act="del-rec">Slett</button>' : ''}<button class="btn pri" style="flex:1;height:50px">Lagre</button></div></form></div>`; }
  if (m.type === 'wipe') return `<div class="modal" data-modal><form data-form="wipe"><div class="card-h"><h2 style="font-size:19px">Slett alle økonomidata</h2>${close}</div>
    <div class="sub">Dette sletter alle transaksjoner, kvitteringer, kontoer, budsjetter, faste utgifter og sparemål. Kategorier, regler og innstillinger beholdes. Kan ikke angres.</div>
    <label class="f">Skriv SLETT for å bekrefte<input class="inp" name="confirm" autocomplete="off" required></label><button class="btn danger" style="height:50px">Slett alt</button></form></div>`;
  return '';
}

/* ===================== Tegning og ruting ===================== */

const PAGE_FN = { ov: overview, tx: transactions, ai: aiPage, kv: receipts, bud: budget, fast: recurring, konto: accounts, rap: reports, inn: settingsPage, ...MODULE_FN };

export function draw() {
  const el = root();
  const scroll = window.scrollY;
  const focus = document.activeElement?.closest('[data-form] input, [data-tx-field], [data-rc-field]') ? { sel: focusSel(document.activeElement), pos: document.activeElement.selectionStart } : null;
  el.innerHTML = shell(PAGE_FN[u.page]());
  window.scrollTo(0, scroll);
  if (focus?.sel) { const f = el.querySelector(focus.sel); if (f) { f.focus(); try { f.setSelectionRange(focus.pos, focus.pos); } catch {} } }
}
const focusSel = (e) => (e.name ? `[data-form] input[name="${e.name}"]` : e.dataset.txField ? `[data-tx-field="${e.dataset.txField}"]` : e.dataset.rcField ? `[data-rc-field="${e.dataset.rcField}"]` : null);

const loadTxFolders = async () => { S.txFolders = await api('/folders').catch(() => []); };
const loadAiPage = async () => { [S.aiHist, S.aiSugg] = await Promise.all([api('/search/history').catch(() => []), api('/search/suggestions').catch(() => [])]); };
// Personlig oppsett fra homelab (/api/me/layout). Mangler endepunktet, brukes FinansHubs egne prefs.
async function loadLayout() {
  if (S.layout !== undefined) return;
  try { const r = await fetch('/api/me/layout', { headers: { Accept: 'application/json' } }); S.layout = r.ok && r.headers.get('content-type')?.includes('json') ? await r.json() : null; } catch { S.layout = null; }
  S.layoutOk = !!S.layout;
}
const LOADERS = { ov: [loadSummary], tx: [loadTx, loadTxFolders], ai: [loadAiPage], kv: [loadReceipts], bud: [loadSummary], fast: [loadRecurring], konto: [], rap: [loadReport], inn: [], ...MODULE_LOADERS };
// Brukere uten admin-rolle har bare Delte mapper.
const allowed = (p) => !S.boot?.restricted || p === 'dir';
export async function load(page = u.page) {
  try { await Promise.all([loadLayout(), ...LOADERS[page].map((f) => f())]); } catch (e) { toast(e.message); }
  if (page === 'inn' && u.setTab === 'mobil') S.tokens = await api('/tokens').catch(() => []);
  if (page === 'inn' && u.setTab === 'data') await loadBackup().catch((e) => toast(e.message));
  render();
  schedulePoll();
}
let pollT;
function schedulePoll() {
  clearTimeout(pollT);
  const busy = (S.receipts ?? []).some((r) => r.status === 'pending' || r.status === 'processing') || (S.summary?.review ?? []).some((r) => r.status !== 'needs_review');
  if (busy) pollT = setTimeout(async () => { await refreshAll(); }, 2000);
}
export async function refreshAll() { await loadBoot(); await load(); }

export function route() {
  let p = location.hash.replace(/^#\/?/, '').split('/')[0];
  // Import ligger nå under Innstillinger; gamle lenker til #/imp havner der.
  if (p === 'imp' && allowed('inn')) { u.setTab = 'imp'; history.replaceState(null, '', '#/inn'); p = 'inn'; }
  const next = PAGE_FN[p] && allowed(p) ? p : S.boot?.restricted ? 'dir' : 'ov';
  const entered = next !== u.page;
  if (entered) { u.page = next; u.msg = {}; window.scrollTo(0, 0); }
  draw();
  if (entered && next === 'ai') document.querySelector('[data-ai-page-input]')?.focus();
  load();
}

/* ===================== Hendelser ===================== */

const busyWrap = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };
const patchTx = busyWrap(async (id, body) => { await api(`/transactions/${id}`, { method: 'PATCH', json: body }); await Promise.all([loadTx(), loadBoot()]); render(); });
const patchRc = busyWrap(async (id, body) => { const r = await api(`/receipts/${id}`, { method: 'PATCH', json: body }); S.receipts = S.receipts.map((x) => (x.id === id ? r : x)); render(); });
const saveSet = busyWrap(async (body) => { S.boot.settings = await api('/settings', { method: 'PUT', json: body }); render(); });

async function uploadFiles(files) {
  for (const f of files) {
    try { const r = await uploadReceipt(f); u.selRc = r.id; } catch (e) { toast(`${f.name}: ${e.message}`); }
  }
  location.hash = '#/kv';
  await refreshAll();
}

async function askAi(text) {
  const qText = String(text ?? '').trim();
  u.aiDraft = qText;
  u.ai = { ...(u.ai ?? {}), q: qText, busy: true, answer: '', hits: [] };
  render();
  try { const r = await api('/search/ai', { method: 'POST', json: { q: qText } }); u.ai = { ...r, busy: false }; if (r.history) S.aiHist = r.history; }
  catch (e) { u.ai = { q: qText, busy: false, answer: e.message, hits: [], suggestions: u.ai?.suggestions }; }
  render();
}
// Lagrer rekkefølge og skjulte punkter: i /api/me/layout (finNav) når det finnes, og alltid i FinansHubs prefs.
const saveNavCfg = busyWrap(async (order, hidden) => {
  hidden = hidden.filter((p) => !NAV_FIXED.includes(p));
  S.layout = S.layout ? { ...S.layout, finNav: { order, hidden } } : S.layout;
  S.boot.nav = order; S.boot.navHidden = hidden; u.cfgOrder = null;
  render();
  const r = await api('/prefs', { method: 'PUT', json: { nav: order, hidden } });
  S.boot.nav = r.nav; S.boot.navHidden = r.hidden;
  if (S.layoutOk) {
    const res = await fetch('/api/me/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finNav: { order: r.nav, hidden: r.hidden } }) }).catch(() => null);
    if (res?.ok) S.layout = { ...S.layout, finNav: { order: r.nav, hidden: r.hidden } };
  }
});
function moveNav(p, d) {
  const { order, hidden } = navCfg(), a = [...order], i = a.indexOf(p), j = i + d;
  if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  return saveNavCfg(a, hidden);
}
async function openOrig(id, view) {
  u.add = { type: 'orig', id, view }; u.origZoom = false; render();
  S.orig = S.orig ?? {};
  try { S.orig[id] = await api(`/transactions/${id}/original`); } catch (e) { u.add = null; toast(e.message); }
  render();
}
const bankText = (b) => [`Dato: ${b.bookingDate ?? ''}`, b.valueDate ? `Rentedato: ${b.valueDate}` : null, `Forklaring: ${b.description ?? ''}`, `${b.amount < 0 ? 'Ut' : 'Inn'}: ${n2(Math.abs(b.amount))} kr`,
  b.account ? `Konto: ${b.account}${b.bank ? ' (' + b.bank + ')' : ''}` : null, b.archiveReference ? `Arkivref.: ${b.archiveReference}` : null].filter(Boolean).join('\n');

export function bind() {
  const el = root();
  bindModules(el);
  el.addEventListener('click', busyWrap(async (e) => {
    const t = e.target;
    const d = (sel) => t.closest(sel);
    if (d('[data-modal]') && t === d('[data-modal]')) { u.add = null; return render(); }
    let x;
    if ((x = d('[data-open-tx]'))) { const id = +x.dataset.openTx; if (u.page !== 'tx') { u.sel = id; location.hash = '#/tx'; return; } u.sel = u.sel === id ? null : id; u.msg = {}; return render(); }
    if ((x = d('[data-open-rc]'))) { e.preventDefault(); u.selRc = x.dataset.openRc; if (u.page !== 'kv') { location.hash = '#/kv'; return; } return render(); }
    if ((x = d('[data-mode]'))) { u.mode = x.dataset.mode; return render(); }
    if ((x = d('[data-rap]'))) { u.rap = x.dataset.rap; await loadReport(); return render(); }
    if ((x = d('[data-month]'))) { u.month = shiftMonth(u.month, (u.page === 'rap' && u.rap === 'year' ? 12 : 1) * +x.dataset.month); return load(); }
    if ((x = d('[data-cat]'))) { u.cat = x.dataset.cat; await loadTx(); return render(); }
    if ((x = d('[data-rc-cat]'))) return patchRc(u.selRc, { categoryId: +x.dataset.rcCat });
    if ((x = d('[data-settab]'))) { u.setTab = x.dataset.settab; u.msg = {}; if (u.setTab === 'ai') loadAi().then(render); return load(); }
    if ((x = d('[data-provider]'))) return saveSet({ provider: x.dataset.provider });
    if ((x = d('[data-tog]'))) return saveSet({ [x.dataset.tog]: !S.boot.settings[x.dataset.tog] });
    if ((x = d('[data-txtype]'))) { u.add.kind = x.dataset.txtype; return render(); }
    if ((x = d('[data-rec-toggle]'))) { const r = S.recurring.find((y) => y.id === +x.dataset.recToggle); await api(`/recurring/${r.id}`, { method: 'PATCH', json: { active: !r.active } }); await loadRecurring(); return render(); }
    if ((x = d('[data-edit-rec]'))) { u.add = { type: 'rec', id: +x.dataset.editRec }; return render(); }
    if ((x = d('[data-edit-acc]'))) { u.add = { type: 'acc', id: +x.dataset.editAcc }; return render(); }
    if ((x = d('[data-edit-goal]'))) { u.add = { type: 'goal', id: +x.dataset.editGoal }; return render(); }
    if ((x = d('[data-del-cat]'))) { if (!confirm('Slette kategorien? Transaksjoner i den blir ukategoriserte.')) return; await api(`/categories/${x.dataset.delCat}`, { method: 'DELETE' }); await loadBoot(); return render(); }
    if ((x = d('[data-del-rule]'))) { await api(`/rules/${x.dataset.delRule}`, { method: 'DELETE' }); await loadBoot(); return render(); }
    if ((x = d('[data-del-token]'))) { await api(`/tokens/${x.dataset.delToken}`, { method: 'DELETE' }); u.msg.token = null; return load(); }
    if ((x = d('[data-hov]'))) return;
    if ((x = d('[data-navcfg-move]'))) { const [p, dir] = x.dataset.navcfgMove.split(':'); return moveNav(p, +dir); }
    if ((x = d('[data-navcfg-tog]'))) { const p = x.dataset.navcfgTog, { order, hidden } = navCfg(); return saveNavCfg(order, hidden.includes(p) ? hidden.filter((y) => y !== p) : [...hidden, p]); }
    if ((x = d('[data-txkind]'))) { const tx = S.tx?.items.find((y) => y.id === u.sel); if (tx && tx.type !== x.dataset.txkind) return patchTx(tx.id, { type: x.dataset.txkind }); return; }
    if ((x = d('[data-orig]'))) return openOrig(u.sel, x.dataset.orig);
    if ((x = d('[data-orig-view]'))) { u.add.view = x.dataset.origView; return render(); }
    if ((x = d('[data-ai-q]'))) { u.aiMode = true; return askAi(x.dataset.aiQ); }
    if ((x = d('[data-copy]'))) { try { await navigator.clipboard.writeText(x.dataset.copy); toast('Kopiert'); } catch { toast('Merk teksten og kopier manuelt'); } return; }
    const act = d('[data-act]')?.dataset.act;
    if (!act) return;
    const sel = S.tx?.items.find((y) => y.id === u.sel);
    const R = S.receipts?.find((y) => y.id === u.selRc);
    switch (act) {
      case 'add-tx': u.add = { type: 'tx', kind: 'ut' }; if (u.page !== 'tx') location.hash = '#/tx'; return render();
      case 'goto-import': u.setTab = 'bank'; location.hash = '#/inn'; return u.page === 'inn' && render();
      case 'close-modal': u.add = null; return render();
      case 'close-sel': u.sel = null; return render();
      case 'del-tx': if (!confirm('Slette transaksjonen?')) return; await api(`/transactions/${sel.id}`, { method: 'DELETE' }); u.sel = null; await loadTx(); await loadBoot(); return render();
      case 'make-rule': {
        const word = (sel.merchant || sel.description).toUpperCase().replace(/[^A-ZÆØÅ0-9 ]/g, ' ').trim().split(/\s+/).find((w) => w.length >= 3 && !/^(VARER|VISA|VARE|KORTKJØP)$/.test(w));
        if (!word || !sel.categoryId) { u.msg.rule = 'Velg kategori først.'; return render(); }
        await api('/rules', { method: 'POST', json: { pattern: word + '*', categoryId: sel.categoryId } });
        await loadBoot(); u.msg.rule = `Regel lagt til: ${word}* → ${sel.category}`; return render();
      }
      case 'rc-book': await api(`/receipts/${R.id}/book`, { method: 'POST' }); toast('Bokført ✓'); { const nx = S.receipts.find((y) => y.id !== R.id && y.status === 'needs_review'); u.selRc = nx?.id ?? null; } return refreshAll();
      case 'rc-reject': await api(`/receipts/${R.id}/reject`, { method: 'POST' }); toast('Kvittering avvist'); u.selRc = null; return refreshAll();
      case 'rc-reprocess': await api(`/receipts/${R.id}/reprocess?provider=${t.closest('[data-prov]').dataset.prov}`, { method: 'POST' }); return refreshAll();
      case 'rc-manual': await api(`/receipts/${R.id}`, { method: 'PATCH', json: { merchant: R.merchant ?? '' } }); S.receipts = S.receipts.map((y) => (y.id === R.id ? { ...y, status: 'needs_review', error: 'Fylles ut manuelt.' } : y)); return render();
      case 'rc-delete': if (!confirm('Slette kvitteringen og bildet? Transaksjonen beholdes.')) return; await api(`/receipts/${R.id}`, { method: 'DELETE' }); u.selRc = null; return refreshAll();
      case 'add-rec': u.add = { type: 'rec' }; return render();
      case 'detect-rec': { const r = await api('/recurring/detect', { method: 'POST' }); u.msg.rec = r.added ? `Fant ${r.added} nye faste trekk.` : 'Fant ingen nye faste trekk.'; await loadRecurring(); return render(); }
      case 'add-acc': u.add = { type: 'acc' }; return render();
      case 'add-goal': u.add = { type: 'goal' }; return render();
      case 'del-acc': if (!confirm('Slette kontoen? Transaksjonene beholdes uten konto.')) return; await api(`/accounts/${u.add.id}`, { method: 'DELETE' }); u.add = null; return refreshAll();
      case 'del-goal': await api(`/goals/${u.add.id}`, { method: 'DELETE' }); u.add = null; return refreshAll();
      case 'del-rec': await api(`/recurring/${u.add.id}`, { method: 'DELETE' }); u.add = null; await loadRecurring(); return render();
      case 'add-cat': await api('/categories', { method: 'POST', json: { name: `Ny kategori ${cats().length + 1}`, color: '#8FD3FF' } }); await loadBoot(); return render();
      case 'add-rule': { const c = cats('expense')[0]; await api('/rules', { method: 'POST', json: { pattern: 'BUTIKK*', categoryId: c.id } }); await loadBoot(); return render(); }
      case 'apply-rules': { const r = await api('/rules/apply', { method: 'POST' }); u.msg.rules = `${r.updated} transaksjoner fikk kategori.`; return render(); }
      case 'test-ai': {
        u.msg.ai = 'Tester …'; render(); await loadAi();
        const a = S.ai, st = S.boot.settings;
        if (!a) { u.msg.ai = 'Fikk ikke svar fra serveren.'; u.msg.aiOk = false; }
        else if (st.provider === 'ollama') { u.msg.aiOk = a.ollama.ok && a.ollama.hasModel; u.msg.ai = !a.ollama.ok ? `Ollama svarte ikke på ${st.ollamaUrl} (${a.ollama.error ?? 'feil'})` : a.ollama.hasModel ? `Ollama svarte · ${st.ollamaModel} er lastet ned` : `Ollama svarte, men ${st.ollamaModel} mangler. Kjør: ollama pull ${st.ollamaModel}`; }
        else { u.msg.aiOk = a.gemini.ok; u.msg.ai = !a.gemini.configured ? 'Gemini-nøkkel mangler' : a.gemini.ok ? `Gemini svarte · ${st.geminiModel}` : `Gemini svarte ikke (${a.gemini.status ?? a.gemini.error})`; }
        return render();
      }
      case 'demo': await api('/demo', { method: 'POST' }); toast('Demodata lastet inn'); return refreshAll();
      case 'wipe': u.add = { type: 'wipe' }; return render();
      case 'print': return window.print();
      case 'nav-showall': return saveNavCfg(navCfg().order, []);
      case 'nav-reset': await saveNavCfg([...(S.boot.navDefault ?? NAV_DEFAULT)], navCfg().hidden); toast('Standard rekkefølge er satt'); return;
      case 'ai-hist-clear': S.aiHist = await api('/search/history', { method: 'DELETE' }); return render();
      case 'orig-zoom': u.origZoom = !u.origZoom; return render();
      case 'orig-dl': {
        const b = S.orig?.[u.add.id]?.bankRow; if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })); a.download = `banktransaksjon-${u.add.id}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
      }
      case 'orig-share': {
        const o = S.orig?.[u.add.id]; if (!o) return;
        try {
          if (u.add.view === 'bank') await navigator.share({ title: 'Banktransaksjon', text: bankText(o.bankRow) });
          else { const blob = await (await fetch(o.receipt.fileUrl)).blob(); const file = new File([blob], `kvittering.${blob.type.split('/')[1] || 'jpg'}`, { type: blob.type }); await (navigator.canShare?.({ files: [file] }) ? navigator.share({ files: [file], title: 'Kvittering' }) : navigator.share({ title: 'Kvittering', url: new URL(o.receipt.fileUrl, location.href).href })); }
        } catch (err) { if (err?.name !== 'AbortError') toast('Kunne ikke dele'); }
        return;
      }
      case 'ai-toggle': {
        u.aiMode = !u.aiMode;
        if (u.aiMode && !u.ai) { u.ai = { q: '', suggestions: [] }; render(); u.ai.suggestions = await api('/search/suggestions').catch(() => []); }
        if (!u.aiMode) u.ai = null;
        render(); document.querySelector('.search input')?.focus(); return;
      }
      case 'ai-close': u.ai = null; u.aiMode = false; return render();
    }
  }));

  // Hover i grafen tegner bare grafen på nytt.
  const redrawChart = () => { const c = el.querySelector('[data-chart]'); if (c && S.summary) c.outerHTML = chart(S.summary); };
  el.addEventListener('mouseover', (e) => { const h = e.target.closest('[data-hov]'); if (h && u.hov !== +h.dataset.hov) { u.hov = +h.dataset.hov; redrawChart(); } });
  el.addEventListener('mouseleave', (e) => { if (e.target.matches?.('[data-chart]')) { u.hov = null; redrawChart(); } }, true);

  el.addEventListener('change', busyWrap(async (e) => {
    const t = e.target;
    if (t.matches('[data-upload]')) return uploadFiles([...t.files]);
    if (t.matches('[data-attach-rc]')) {
      const id = +t.dataset.attachRc, f = t.files[0]; t.value = '';
      if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      await api(`/transactions/${id}/receipt`, { method: 'POST', body: fd });
      toast('Kvitteringen er lagt ved og leses av AI'); if (u.add?.type === 'orig') { S.orig[id] = await api(`/transactions/${id}/original`); }
      await Promise.all([loadTx(), loadBoot()]); return render();
    }
    if (t.matches('[data-csv]')) {
      const form = t.closest('form');
      const fd = new FormData(form); fd.set('profile', S.boot.settings.csvProfile);
      if (!fd.get('accountId')) { u.msg.csv = 'Velg kontoen filen hører til først.'; u.msg.csvOk = false; t.value = ''; return render(); }
      try { const r = await api('/import/csv', { method: 'POST', body: fd }); u.msg.csv = `${r.added} nye transaksjoner importert · ${r.duplicates} duplikater hoppet over${r.skipped ? ` · ${r.skipped} rader kunne ikke leses` : ''}`; u.msg.csvOk = true; }
      catch (err) { u.msg.csv = err.message; u.msg.csvOk = false; }
      t.value = ''; await loadBoot(); return render();
    }
    if (t.dataset.filter) { u[t.dataset.filter] = t.value; await loadTx(); return render(); }
    if (t.dataset.txField) {
      const f = t.dataset.txField, v = t.value, tx = S.tx?.items.find((y) => y.id === u.sel);
      if (f === 'amount') { const a = parseAmount(v); if (a === null || !Number.isFinite(a)) { toast('Ugyldig beløp'); return render(); } return patchTx(u.sel, { amount: Math.abs(a), type: tx?.type ?? 'expense' }); }
      if (f === 'description' && !v.trim()) { toast('Beskrivelse må fylles ut'); return render(); }
      return patchTx(u.sel, { [f]: ['categoryId', 'accountId', 'folderId'].includes(f) ? (+v || null) : v });
    }
    if (t.dataset.rcField) { const f = t.dataset.rcField; return patchRc(u.selRc, { [f]: f === 'total' ? parseAmount(t.value) : f === 'accountId' ? (+t.value || null) : t.value }); }
    if (t.dataset.budget) { await api('/budgets', { method: 'PUT', json: { categoryId: +t.dataset.budget, amount: parseAmount(t.value) ?? 0 } }); await loadSummary(); return render(); }
    if (t.dataset.set) {
      const key = t.dataset.set; let v = t.value;
      if (['monthStart', 'yearGoal', 'minConf'].includes(key)) v = +String(v).replace(/\s/g, '');
      if ((key === 'geminiKey' || key === 'imapPass') && !v) return;
      await saveSet({ [key]: v }); if (key === 'monthStart') await refreshAll();
      if (key === 'geminiKey') toast('Nøkkelen er lagret på serveren');
      return;
    }
    if (t.dataset.catField) { await api(`/categories/${t.dataset.id}`, { method: 'PATCH', json: { [t.dataset.catField]: t.value } }); await loadBoot(); return render(); }
    if (t.dataset.ruleField) { await api(`/rules/${t.dataset.id}`, { method: 'PATCH', json: { [t.dataset.ruleField]: t.dataset.ruleField === 'categoryId' ? +t.value : t.value } }); await loadBoot(); return render(); }
  }));

  el.addEventListener('submit', busyWrap(async (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    switch (f.dataset.form) {
      case 'aipage': u.aiPageDraft = ''; if (!String(v.aiq ?? '').trim()) return; return askAi(v.aiq);
      case 'gsearch': if (u.aiMode) return askAi(v.q);
      // fallthrough
      case 'txsearch': u.q = v.q; u.sel = null; if (u.page !== 'tx') { location.hash = '#/tx'; return; } await loadTx(); return render();
      case 'tx': {
        const amt = Math.abs(parseAmount(v.amount) ?? NaN);
        if (!Number.isFinite(amt)) return toast('Ugyldig beløp');
        await api('/transactions', { method: 'POST', json: { ...v, type: u.add.kind === 'inn' ? 'income' : 'expense', amount: amt, categoryId: +v.categoryId || null, accountId: +v.accountId || null, folderId: +v.folderId || null } });
        u.add = null; toast('Transaksjon lagret'); return refreshAll();
      }
      case 'acc': await api(u.add.id ? `/accounts/${u.add.id}` : '/accounts', { method: u.add.id ? 'PATCH' : 'POST', json: { ...v, openingBalance: parseAmount(v.openingBalance) ?? 0 } }); u.add = null; return refreshAll();
      case 'goal': await api(u.add.id ? `/goals/${u.add.id}` : '/goals', { method: u.add.id ? 'PATCH' : 'POST', json: { ...v, saved: parseAmount(v.saved) ?? 0, target: parseAmount(v.target) } }); u.add = null; return refreshAll();
      case 'rec': await api(u.add.id ? `/recurring/${u.add.id}` : '/recurring', { method: u.add.id ? 'PATCH' : 'POST', json: { ...v, amount: parseAmount(v.amount), categoryId: +v.categoryId || null, accountId: +v.accountId || null } }); u.add = null; await loadRecurring(); return render();
      case 'token': {
        const scopes = new FormData(f).getAll('scope');
        if (!scopes.length) return toast('Velg minst én tilgang');
        const r = await api('/tokens', { method: 'POST', json: { name: v.name, scopes, expires: v.expires } });
        u.msg.token = r.token; return load();
      }
      case 'wipe': await api('/all', { method: 'DELETE', json: { confirm: v.confirm } }); u.add = null; toast('Alle økonomidata er slettet'); return refreshAll();
    }
  }));

  // Dra og slipp i Innstillinger → Sidemeny. DOM-noden flyttes direkte (en full omtegning midt i et drag avbryter draget).
  el.addEventListener('dragstart', (e) => {
    const n = e.target.closest?.('[data-navcfg]');
    if (!n) return;
    u.navDrag = n.dataset.navcfg; u.cfgOrder = [...navCfg().order];
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', u.navDrag);
    requestAnimationFrame(() => n.classList.add('dragging'));
  });
  el.addEventListener('dragover', (e) => {
    const n = e.target.closest?.('[data-navcfg]');
    if (!n || !u.navDrag || !u.cfgOrder) return;
    e.preventDefault();
    const a = u.cfgOrder, from = a.indexOf(u.navDrag), to = a.indexOf(n.dataset.navcfg);
    if (from < 0 || to < 0 || from === to) return;
    a.splice(to, 0, a.splice(from, 1)[0]);
    const src = el.querySelector(`[data-navcfg="${u.navDrag}"]`);
    if (src) n.parentNode.insertBefore(src, from < to ? n.nextSibling : n);
  });
  el.addEventListener('drop', (e) => { if (e.target.closest?.('[data-navcfg]')) e.preventDefault(); });
  el.addEventListener('dragend', () => {
    if (!u.navDrag) return;
    const order = u.cfgOrder; u.navDrag = null;
    if (order && order.join() !== (S.boot.nav ?? []).join()) return saveNavCfg(order, navCfg().hidden);
    u.cfgOrder = null; render();
  });

  // Dra og slipp kvitteringer.
  el.addEventListener('dragover', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  el.addEventListener('dragleave', (e) => e.target.closest('[data-drop]')?.classList.remove('over'));
  el.addEventListener('drop', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); uploadFiles([...e.dataTransfer.files]); } });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector('.search input')?.focus(); }
    if (e.key === 'Escape' && u.add) { u.add = null; render(); }
  });
}
