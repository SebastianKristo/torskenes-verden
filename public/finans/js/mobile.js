// FinansHub mobil (PWA). Tema: iOS Liquid Glass på iPhone/iPad, ellers Android Material 3 Expressive.
// ≥ 600 px (åpen brettbar): navigasjonsrail + to paneler. Henter kun fra /finans/api.
import {
  S, api, esc, n0, n2, sgn, neg, dd, dWeek, dLong, today, monthName, cap, ini, rgba, greet, parseAmount,
  render, loadBoot, loadSummary, loadTx, loadReceipts, catById, cats, accs, uploadReceipt, icon, logo, aiLine, matApi, conic,
} from './core.js';

const u = S.ui;
const m = { screen: 'hjem', sel: null, budSel: null, rc: null, filter: '', toast: '', theme: null, menu: false, jobs: [], uploading: 0, mat: null, matErr: '', detail: false };
const root = () => document.getElementById('app');
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const theme = () => { try { const t = localStorage.getItem('fh_theme'); if (t === 'ios' || t === 'and') return t; } catch {} return isIOS() ? 'ios' : 'and'; };
const two = () => matchMedia('(min-width: 600px)').matches;
const SCREENS = [['hjem', 'Hjem', 'home'], ['liste', 'Liste', 'list'], ['budsjett', 'Budsjett', 'bud'], ['mat', 'Matplan', 'mat']];
const iosBg = () => { try { return localStorage.getItem('fh_ios_bg') !== '0'; } catch { return true; } };
const ACTIVE = ['pending', 'processing'];
const amtC = (v, th) => (v > 0 ? '#9FE3C6' : th === 'and' ? '#F0DFD7' : '#fff');

/* ---------- Byggeklosser ---------- */

const txItem = (t, th, on) => `<button class="item${on ? ' on' : ''}" data-tx="${t.id}">${logo(t, 40, th === 'ios' ? 20 : 12)}
  <span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(t.description)}</span>${aiLine(t.aiShort, 'm-ell ai')}<span class="m-ell s">${dd(t.date)} · ${esc(t.category)}</span></span>
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

function jobsPill(th) {
  const j = m.jobs; if (!j.length) return '';
  const run = j.filter((x) => ACTIVE.includes(x.status)).length, ready = j.filter((x) => x.status === 'needs_review').length;
  if (!run && !ready) return '';
  const pct = Math.round(j.reduce((a, x) => a + (ACTIVE.includes(x.status) ? x.progress ?? 0 : 100), 0) / j.length);
  return `<a class="pill ${th === 'ios' ? 'glass2' : ''}" href="#/opp"><span class="ring" style="background:${conic([{ value: pct, color: '#FF8A4C' }], 100, 0, th === 'ios' ? 'rgba(255,255,255,.15)' : '#31281F')}"></span><span class="m-grow">${run ? `Gemini leser i bakgrunnen · ${j.length - run} av ${j.length} ferdig` : `${ready} kvitteringer klare til bekreftelse`}</span><span style="opacity:.6">›</span></a>`;
}

function andCards(s) {
  const inn = s.innMonthly?.length ? s.innMonthly.slice(-7) : [s.inn];
  const mx = Math.max(1, ...inn);
  const prev = inn.length > 1 ? inn[inn.length - 2] : null, up = prev === null || s.inn >= prev;
  const pct = s.yearGoal ? Math.min(100, (s.savedYear / s.yearGoal) * 100) : 0;
  return `<div class="tiles"><div class="tile"><span class="m-row" style="justify-content:space-between">Inn i ${monthName(s.month)}<em class="badge">${up ? '↑' : '↓'}</em></span><b>${n0(s.inn)}</b>
      <span class="minibars">${inn.map((v, i) => `<i style="height:${Math.max(8, (v / mx) * 100)}%;${i === inn.length - 1 ? 'background:#9FE3C6' : ''}"></i>`).join('')}</span></div>
    <div class="tile"><span>Spart i år</span><span class="m-row" style="gap:12px"><span class="cring" style="background:${conic([{ value: pct, color: '#FFB68A' }], 100, 0, '#4A3C33')}"><i>${Math.round(pct)}%</i></span><span style="display:flex;flex-direction:column"><b style="font-size:18px">${n0(s.savedYear)}</b><small>av ${n0(s.yearGoal)}</small></span></span>
      <small>${s.yearGoal ? `${n0(Math.max(0, s.yearGoal - s.savedYear))} kr igjen` : 'Sett et årsmål på desktop'}</small></div></div>`;
}

const avatar = (st) => `<button class="m-av" data-mact="menu" aria-label="Meny" aria-haspopup="dialog">${esc(ini(st.name))}</button>`;

function home(th) {
  const s = S.summary, st = S.boot.settings;
  return `<div class="m-row" style="justify-content:space-between;align-items:flex-end;padding:6px 4px 0"><div><div class="hello">${greet()}, ${esc(st.name)}</div><div class="title">${cap(monthName(S.summary?.month ?? today().slice(0, 7)))}</div></div>${avatar(st)}</div>
    ${hero(th)}
    ${jobsPill(th)}
    ${th === 'and' && s ? andCards(s) : ''}
    ${reviewCta(th)}
    <div class="sec">Siste</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${(s?.recent ?? []).slice(0, 6).map((t) => txItem(t, th, m.sel === t.id)).join('') || '<div class="m-empty">Ingen transaksjoner ennå.</div>'}</div>`;
}

function list(th) {
  const items = S.tx?.items ?? null;
  const chips = [['', 'Alle'], ['ut', 'Utgifter'], ['inn', 'Inntekter']].map(([k, n]) => `<button class="chip" data-filter="${k}" aria-pressed="${m.filter === k}">${n}</button>`).join('');
  return `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0"><div class="title">Transaksjoner</div>${avatar(S.boot.settings)}</div>
    <form class="search ${th === 'ios' ? 'glass2' : ''}" data-msearch role="search"><span style="opacity:.7">${icon('search', 18)}</span><input class="m-input" name="q" value="${esc(u.q)}" placeholder="Søk i transaksjoner" aria-label="Søk" enterkeyhint="search"></form>
    <div style="display:flex;gap:8px;overflow-x:auto">${chips}</div>
    ${items === null ? '<div class="m-spin"></div>' : groups(items, th) || '<div class="m-empty">Ingen treff.</div>'}`;
}

function budCard(b, th, s) {
  const o = b.used > b.budget, on = m.budSel === b.categoryId, left = b.budget - b.used, days = Math.max(1, s.daysLeft);
  const trend = b.prevUsed ? Math.round(((b.used - b.prevUsed) / b.prevUsed) * 100) : null;
  const chips = [b.count != null ? `${b.count} kjøp` : '', b.topMerchant ? `Mest: ${esc(b.topMerchant)}` : '', trend !== null ? `${trend > 0 ? '↑' : '↓'} ${Math.abs(trend)} % mot forrige mnd` : ''].filter(Boolean);
  const hi = th === 'and' ? '#FFB68A' : '#FFB08A';
  return `<button class="${th === 'ios' ? 'glass2' : 'item'} bud${on ? ' on' : ''}" data-bud="${b.categoryId}">
    <span class="m-row" style="justify-content:space-between;width:100%"><b style="font-weight:600">${esc(b.category)}</b><span class="m-mono" style="font-size:14px;color:${o ? hi : th === 'and' ? '#D7C2B8' : 'rgba(255,255,255,.7)'}">${n0(b.used)} / ${n0(b.budget)}</span></span>
    <span class="m-bar" style="width:100%;height:8px;background:${th === 'ios' ? 'rgba(255,255,255,.14)' : '#31281F'}"><i style="width:${Math.min(100, (b.used / b.budget) * 100)}%;background:${o ? '#FF7A3D' : b.color}"></i></span>
    <span class="m-row" style="justify-content:space-between;width:100%;font-size:13px"><span style="color:${o ? hi : 'inherit'};opacity:${o ? 1 : 0.8}">${o ? `Over med ${n0(-left)} kr` : `${n0(left)} kr igjen · ${n0(left / days)} kr/dag`}</span><span style="opacity:.65">${Math.round((b.used / b.budget) * 100)} % brukt</span></span>
    ${chips.length ? `<span class="bchips">${chips.map((c) => `<em>${c}</em>`).join('')}</span>` : ''}</button>`;
}

function budget(th) {
  const s = S.summary;
  if (!s) return '<div class="m-spin"></div>';
  const rows = s.budgets.filter((b) => b.budget).sort((a, b) => b.used / b.budget - a.used / a.budget);
  return `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0"><div class="title">Budsjett</div>${avatar(S.boot.settings)}</div>
    <div class="bsum ${th === 'ios' ? 'glass' : ''}"><div><span>Budsjett</span><b>${n0(s.budgetTotal)}</b></div><div><span>Brukt</span><b>${n0(s.budgetUsed)}</b></div><div><span>Dager igjen</span><b>${s.daysLeft}</b></div></div>
    ${rows.map((b) => budCard(b, th, s)).join('') || '<div class="m-empty">Ingen budsjett satt. Sett opp på desktop under Budsjett.</div>'}`;
}

/* ---------- Last opp (kø i bakgrunnen) ---------- */

function uploadScreen(th) {
  const j = m.jobs;
  const st = (x) => (x.status === 'needs_review' ? ['Klar · trykk for å bekrefte', '#9FE3C6', 100] : x.status === 'booked' ? ['Bokført', '#9FE3C6', 100] : x.status === 'error' ? ['Feil – åpne for å fylle ut', '#FF8A6B', 100] : x.status === 'processing' ? [`Gemini leser … ${x.progress ?? 50} %`, th === 'and' ? '#FFB68A' : '#FF8A4C', x.progress ?? 50] : ['I kø', 'rgba(255,255,255,.55)', 0]);
  return `${th === 'ios' ? '<div class="m-row" style="justify-content:space-between"><a class="back" href="#/hjem">‹ Hjem</a></div><div class="title" style="font-size:28px">Last opp</div>' : '<div class="m-row"><a class="back" href="#/hjem" aria-label="Tilbake">←</a><b style="font-size:22px;font-weight:700;flex:1">Last opp</b></div>'}
    <label class="drop ${th === 'ios' ? 'glass' : ''}"><span class="n">${icon('up', 22)}</span><b>Velg kvitteringer</b><span>Bilder eller PDF – flere om gangen. Gemini leser dem i bakgrunnen. Du kan bruke appen mens du venter.</span><input class="m-file" type="file" accept="image/*,application/pdf" multiple data-mupload></label>
    <label class="cta ${th === 'ios' ? 'glass2' : ''}" style="cursor:pointer"><span class="n">${icon('scan', 20)}</span><span class="m-grow"><b style="display:block;font-weight:600">Ta bilde</b><span style="font-size:13px;opacity:.75">Bakkamera</span></span><input class="m-file" type="file" accept="image/*" capture="environment" data-mupload></label>
    ${m.uploading ? `<div class="m-empty">Laster opp ${m.uploading} fil${m.uploading > 1 ? 'er' : ''} …</div>` : ''}
    ${j.length ? `<div class="sec">Kø</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${j.map((x) => { const [txt, c, p] = st(x); return `<button class="item job" data-job="${esc(x.id)}"><span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(x.merchant || x.name || 'Kvittering')}</span><span class="m-ell s" style="color:${c}">${txt}</span><span class="m-bar" style="height:4px;margin-top:6px;background:${th === 'ios' ? 'rgba(255,255,255,.12)' : '#31281F'}"><i style="width:${p}%;background:${c}"></i></span></span><span class="m-mono">${x.total != null ? n2(x.total) : ''}</span></button>`; }).join('')}</div>` : ''}`;
}

/* ---------- Utgiftsdetalj ---------- */

function txDetail(th, t) {
  if (!t) return '<div class="m-empty">Ingen transaksjon valgt.</div>';
  const row = (k, v) => `<div class="${th === 'ios' ? 'field' : 'opt-row'}" style="${th === 'and' ? 'justify-content:space-between;background:#261E19;border-radius:16px' : ''}"><span style="opacity:.7">${k}</span><b style="font-weight:500">${v}</b></div>`;
  const lines = t.lines ?? [];
  return `${two() ? '' : th === 'ios' ? '<div class="m-row"><a class="back" href="#" data-mact="txback">‹ Tilbake</a></div>' : '<div class="m-row"><a class="back" href="#" data-mact="txback" aria-label="Tilbake">←</a><b style="font-size:22px;font-weight:700;flex:1">Utgift</b></div>'}
    <div class="m-row" style="gap:14px">${logo(t, 60, th === 'and' ? 18 : 30)}<div><b style="font-size:20px;font-weight:700">${esc(t.description)}</b><div style="opacity:.7;font-size:14px">${cap(dWeek(t.date))}</div></div></div>
    <div class="m-mono" style="font-size:40px;font-weight:600;letter-spacing:-.03em;color:${amtC(t.amount, th)}">${sgn(t.amount)} <span style="font-size:18px;opacity:.6">kr</span></div>
    ${t.aiLong || t.aiShort ? `<div class="aicard ${th === 'ios' ? 'glass2' : ''}"><b>✦ AI-beskrivelse</b><p>${esc(t.aiLong || t.aiShort)}</p></div>` : ''}
    ${lines.length ? `<div class="sec">Varelinjer</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${lines.map((l) => `<div class="opt-row" style="justify-content:space-between"><span class="m-ell">${esc(l.description ?? '–')}</span><span class="m-mono">${n2(l.amount)}</span></div>`).join('')}</div>` : ''}
    <div class="${th === 'ios' ? 'list glass2' : 'fields'}">${row('Kategori', esc(t.category))}${row('Konto', esc(t.account))}${row('Kvittering', t.receipt === 'booked' ? 'Vedlagt' : t.receipt ? 'Til gjennomgang' : '–')}${row('Delt mappe', t.folder ? esc(t.folder) : '–')}${t.note ? row('Notat', esc(t.note)) : ''}</div>
    <label class="${th === 'ios' ? 'list glass2' : 'field'}" style="${th === 'ios' ? 'padding:12px 16px;display:flex;flex-direction:column;gap:6px' : ''}">${th === 'ios' ? '<span style="opacity:.65;font-size:13px">Endre kategori</span>' : 'Endre kategori'}<select data-mtxcat="${t.id}" style="background:none;border:0;outline:none;color:inherit;font-size:16px">${cats().map((c) => `<option value="${c.id}"${c.id === t.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
}
const selTx = () => { const pool = [...(S.tx?.items ?? []), ...(S.summary?.recent ?? [])]; return pool.find((x) => x.id === m.sel) ?? (two() ? pool[0] : null); };

/* ---------- Matplan ---------- */

const SRC = { gemini: ['Gemini', '#FFB08A', 'rgba(255,122,61,.15)'], hellofresh: ['HelloFresh', '#C2E27A', 'rgba(145,193,30,.18)'], fixed: ['Fast', '#9FE3C6', '#1F3A2F'], own: ['Egen', '#A9C3FF', 'rgba(122,167,255,.15)'] };
function mat(th) {
  const w = m.mat, head = `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0"><div class="title">Matplan</div>${avatar(S.boot.settings)}</div>`;
  if (m.matErr) return `${head}<div class="m-empty">${esc(m.matErr)}</div>`;
  if (!w) return `${head}<div class="m-spin"></div>`;
  const td = today();
  return `${head}
    <div class="m-row" style="gap:8px;flex-wrap:wrap"><button class="pri-b" data-mat="plan" style="flex:1">✦ Ny ukeplan med Gemini</button></div>
    <div style="font-size:13px;opacity:.7;padding:0 4px">Ukekost ca. ${n0(w.weekCost ?? 0)} kr · Automatisk hver søndag: ${w.auto ? 'på' : 'av'}</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${(w.days ?? []).map((d) => { const [n, c, bg] = SRC[d.source] ?? SRC.own; return `<div class="opt-row day${d.date === td ? ' today' : ''}"><span class="m-grow"><span class="s" style="text-transform:capitalize">${esc(d.weekday ?? dWeek(d.date))}${d.cook ? ` · ${esc(d.cook)}` : ''}</span><b class="m-ell" style="display:block;font-weight:500">${esc(d.name || '–')}</b><em class="src" style="color:${c};background:${bg}">${n}${d.fixed ? ' · fast' : ''}</em></span><span class="m-mono" style="opacity:.8">${d.cost ? n0(d.cost) + ' kr' : ''}</span><button class="mini" data-mat="day" data-date="${d.date}" aria-label="Ny rett for dagen">✦</button></div>`; }).join('') || '<div class="m-empty">Ingen plan ennå.</div>'}</div>
    ${(w.shopping ?? []).length ? `<div class="sec">Handleliste</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${w.shopping.map((x) => `<button class="opt-row" data-shop="${esc(x.id)}"><span class="chk${x.done ? ' on' : ''}">${x.done ? '✓' : ''}</span><span class="m-grow" style="${x.done ? 'text-decoration:line-through;opacity:.5' : ''}">${esc(x.text)}</span></button>`).join('')}</div>` : ''}`;
}

/* ---------- Meny bak profilbildet ---------- */

function menuSheet(th) {
  if (!m.menu) return '';
  const st = S.boot.settings, onMat = m.screen === 'mat';
  const os = [['sub', 'Subscription OS', 'Abonnementer og trekk'], ['dir', 'Delte mapper', 'Felles utgifter'], ['finn', 'Finn-handler', 'Kjøp og salg']];
  return `<div class="sheet-bg" data-mact="menu"></div><div class="sheet ${th === 'ios' ? 'glass' : ''}" role="dialog" aria-label="Meny">
    <div class="m-row" style="gap:12px"><span class="m-av">${esc(ini(st.name))}</span><div class="m-grow"><b>${esc(st.name)}</b><div style="font-size:13px;opacity:.65">FinansHub</div></div><button class="mini" data-mact="menu" aria-label="Lukk">${icon('close', 18)}</button></div>
    <div class="seg"><a href="#/hjem" data-mact="menu" ${onMat ? '' : 'aria-current="true"'}>Finans</a><a href="#/mat" data-mact="menu" ${onMat ? 'aria-current="true"' : ''}>Matplan</a></div>
    <div class="sec">Andre OS</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${os.map(([k, n, s]) => `<a class="opt-row" href="/finans/?desktop=1#/${k}"><span class="m-grow"><b style="font-weight:500">${n}</b><br><span style="font-size:13px;opacity:.65">${s}</span></span><span style="opacity:.6">›</span></a>`).join('')}</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${th === 'ios' ? `<button class="opt-row" data-mact="iosbg"><span class="m-grow"><b style="font-weight:500">Fargebakgrunn</b></span><span class="sw" role="switch" aria-checked="${iosBg()}"></span></button>` : ''}<a class="opt-row" href="#/meg" data-mact="menu"><span class="m-grow">Innstillinger</span><span style="opacity:.6">›</span></a><button class="opt-row" data-mact="logout"><span class="m-grow" style="color:#FF8A6B">Lås</span></button></div></div>`;
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
  if (m.screen === 'mat') return `<div class="title" style="font-size:28px">${cap(monthName(today().slice(0, 7)))}</div>${hero(th)}${jobsPill(th)}`;
  if (m.screen === 'opp') return confirmRc(th);
  return txDetail(th, selTx());
}

/* ---------- Tegning ---------- */

export function draw() {
  const th = theme(), wide = two();
  const scr = ['hjem', 'liste', 'budsjett', 'mat', 'meg', 'opp', 'skann'].includes(m.screen) ? m.screen : 'hjem';
  const confirmView = scr === 'skann' && m.rc && !wide;
  const scrs = { hjem: home, liste: list, budsjett: budget, meg: me, mat, opp: uploadScreen };
  const main = m.detail && !wide && m.sel ? txDetail(th, selTx()) : scrs[scr] ? scrs[scr](th) : confirmView ? confirmRc(th) : scanQueue(th);
  const navKey = scr === 'skann' || scr === 'opp' ? '' : scr;
  const scanBtn = `<a class="${th === 'ios' ? 'scanbtn' : 'fab'}" href="#/opp" aria-label="Last opp kvitteringer">${icon('scan', 26, 'currentColor', 2.2)}${th === 'and' ? '<span>Last opp</span>' : ''}</a>`;
  const nav = th === 'ios'
    ? `<div class="tabbar"><nav class="tabs" aria-label="Meny">${SCREENS.map(([k, n, ic]) => `<a href="#/${k}" ${navKey === k ? 'aria-current="page"' : ''}>${icon(ic, 22)}${n}</a>`).join('')}</nav>${scanBtn}</div>`
    : `${scr !== 'skann' && scr !== 'opp' ? scanBtn : ''}<nav class="navbar" aria-label="Meny">${SCREENS.map(([k, n, ic]) => `<a href="#/${k}" ${navKey === k ? 'aria-current="page"' : ''}><span>${icon(ic, 22)}</span>${n}</a>`).join('')}</nav>`;
  const rail = `<nav class="rail" aria-label="Meny"><a class="r-scan" href="#/opp" aria-label="Last opp">${icon('scan', 24, 'currentColor', 2.2)}</a>
    ${[...SCREENS, ['skann', 'Skann', 'kv'], ['meg', 'Meg', 'me']].map(([k, n, ic]) => `<a href="#/${k}" ${scr === k ? 'aria-current="page"' : ''}><span>${icon(ic, 22)}</span>${n}</a>`).join('')}</nav>`;
  root().innerHTML = `<div class="m ${th}${wide ? ' two' : ''}${th === 'ios' && !iosBg() ? ' nobg' : ''}">${th === 'ios' && iosBg() ? '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>' : ''}
    ${rail}<div class="m-scroll">${main}</div><div class="m-detail">${wide ? detail(th) : ''}</div>${nav}
    ${menuSheet(th)}${m.toast ? `<div class="m-toast" role="status">${esc(m.toast)}</div>` : ''}</div>`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', th === 'ios' ? '#07070A' : '#19120E');
}

let toastT;
const flash = (t) => { m.toast = t; draw(); clearTimeout(toastT); toastT = setTimeout(() => { m.toast = ''; draw(); }, 1800); };

async function load() {
  try {
    const jobs = [loadSummary()];
    if (m.screen === 'liste' || (two() && (m.screen === 'hjem' || m.screen === 'budsjett'))) jobs.push(loadTx());
    if (m.screen === 'skann' || (two() && m.screen === 'opp')) jobs.push(loadReceipts());
    if (m.screen === 'mat') jobs.push(loadMat());
    jobs.push(loadJobs());
    await Promise.all(jobs);
  } catch (e) { flash(e.message); }
  draw();
  poll();
}
async function loadMat() {
  try { m.mat = await matApi('/week'); m.matErr = ''; } catch (e) { m.matErr = 'Matplan er ikke tilgjengelig: ' + e.message; }
}
// Jobbkø fra serveren; eldre server uten /receipts/jobs faller tilbake til kvitteringslisten.
async function loadJobs() {
  try { m.jobs = await api('/receipts/jobs'); }
  catch { try { await loadReceipts(); } catch {} m.jobs = (S.receipts ?? []).filter((r) => [...ACTIVE, 'needs_review'].includes(r.status)).map((r) => ({ id: r.id, name: r.merchant, merchant: r.merchant, total: r.total, status: r.status, progress: r.status === 'processing' ? 50 : 0 })); }
}
let pollT;
function poll() {
  clearTimeout(pollT);
  const busy = m.jobs.some((r) => ACTIVE.includes(r.status)) || (S.receipts ?? []).some((r) => ACTIVE.includes(r.status));
  if (busy) pollT = setTimeout(async () => { try { await loadJobs(); if (m.screen === 'skann' || m.screen === 'opp') await loadReceipts(); } catch {} draw(); poll(); }, 2000);
}

export function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/')[0];
  const map = { ov: 'hjem', tx: 'liste', kv: 'skann', bud: 'budsjett', inn: 'meg' }; // desktop-lenker
  const next = map[h] ?? (['hjem', 'liste', 'budsjett', 'skann', 'meg', 'mat', 'opp'].includes(h) ? h : 'hjem');
  if (next !== m.screen) { m.screen = next; m.detail = false; if (next !== 'skann' && next !== 'opp') m.rc = null; window.scrollTo(0, 0); }
  u.type = m.filter;
  draw();
  load();
}

/* ---------- Hendelser ---------- */

const safe = (fn) => async (e) => { try { await fn(e); } catch (err) { flash(err.message); } };

// Filene lastes opp én og én (med nedskalert skann og miniatyr); AI-en leser dem i køen på serveren.
async function upload(files) {
  if (!files.length) return;
  if (location.hash !== '#/opp') location.hash = '#/opp';
  m.uploading = files.length; draw();
  for (const f of files) {
    try { await uploadReceipt(f); } catch (e) { flash(`${f.name}: ${e.message}`); }
    m.uploading--; await loadJobs(); draw();
  }
  if (two()) await loadReceipts();
  draw(); poll();
}

export function bind() {
  const el = root();
  el.addEventListener('click', safe(async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    if ((x = d('[data-tx]'))) { m.sel = +x.dataset.tx; m.detail = true; window.scrollTo(0, 0); return draw(); }
    if ((x = d('[data-job]'))) { const j = m.jobs.find((y) => y.id === x.dataset.job); if (j && j.status !== 'booked' && !ACTIVE.includes(j.status)) { m.rc = j.id; if (two()) { await loadReceipts(); return draw(); } location.hash = '#/skann'; } return; }
    if ((x = d('[data-shop]'))) { await matApi(`/shopping/${encodeURIComponent(x.dataset.shop)}/toggle`, { method: 'POST' }); await loadMat(); return draw(); }
    if ((x = d('[data-mat]'))) { const day = x.dataset.mat === 'day'; flash(day ? 'Gemini foreslår en ny rett …' : 'Gemini lager ukeplan …'); await matApi('/plan', { method: 'POST', json: day ? { scope: 'day', date: x.dataset.date } : { scope: 'week', date: m.mat?.start ?? today() } }); await loadMat(); return flash('Matplan oppdatert'); }
    if ((x = d('[data-rc]'))) { m.rc = x.dataset.rc; return draw(); }
    if ((x = d('[data-bud]'))) { m.budSel = +x.dataset.bud; if (!S.tx) await loadTx(); return draw(); }
    if ((x = d('[data-filter]'))) { m.filter = x.dataset.filter; u.type = m.filter; await loadTx(); return draw(); }
    if ((x = d('[data-mcat]'))) { const r = await api(`/receipts/${m.rc}`, { method: 'PATCH', json: { categoryId: +x.dataset.mcat } }); S.receipts = S.receipts.map((y) => (y.id === r.id ? r : y)); return draw(); }
    if ((x = d('[data-mtog]'))) { S.boot.settings = await api('/settings', { method: 'PUT', json: { [x.dataset.mtog]: !S.boot.settings[x.dataset.mtog] } }); return draw(); }
    if ((x = d('[data-mprov]'))) { S.boot.settings = await api('/settings', { method: 'PUT', json: { provider: x.dataset.mprov } }); return draw(); }
    if ((x = d('[data-mtheme]'))) { try { if (x.dataset.mtheme === 'auto') localStorage.removeItem('fh_theme'); else localStorage.setItem('fh_theme', x.dataset.mtheme); } catch {} return draw(); }
    const act = d('[data-mact]')?.dataset.mact;
    if (act === 'back') { e.preventDefault(); m.rc = null; return draw(); }
    if (act === 'txback') { e.preventDefault(); m.detail = false; return draw(); }
    if (act === 'menu') { m.menu = !m.menu; return draw(); }
    if (act === 'iosbg') { try { localStorage.setItem('fh_ios_bg', iosBg() ? '0' : '1'); } catch {} return draw(); }
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
