// «Mer» i Finans: alle funksjonene fra FinansHub på nettsiden, tilpasset mobil, i én felles mal
// (tilbake, tittel og undertekst, hero-kort, nøkkeltall, grupper med rader). Rader åpner en detaljside med feltene og tilhørende transaksjoner.
import { S, api, esc, n0, n2, sgn, dd, today, monthName, cap, icon, logo, aiLine, loadReceipts, accs, navName } from './core.js';
import { m, draw, flash, avatar, backBtn, theme, amtC, openSheet, openCam, upqList } from './mobile.js';
import { c3 } from './mobile-theme.js';
import { LAY } from './mobile-hl.js';
import { AK, aksView, aksLoad, aksBind } from './mobile-aks.js';

export const PAGES = ['mer', 'kv', 'fast', 'konto', 'aks', 'rap', 'imp', 'sok'];
const PG = { rec: null, stocks: null, rep: null, repMode: 'month', sub: null, dirs: null, finn: null, booked: null,
  imp: { rows: null, files: [], text: '', busy: false, acc: null }, ai: { q: '', r: null, busy: false, hist: null, sugg: null, groups: null, focus: false, aiDown: false, notice: '' }, last: '' };
const isI = () => theme() === 'ios';
const gl = (c = 'glass2') => (isI() ? c : '');
const kr = (v) => `${n0(v)} kr`, kr2 = (v) => `${n2(v)} kr`;
const curM = () => S.summary?.month ?? today().slice(0, 7);

/* ---------- Mal ---------- */

export const R = {
  // Raden kan ha en egen knapp (o.act), så den klikkbare raden er en div med role=button (knapper kan ikke ligge i knapper).
  item: (o) => `<div class="item prow${o.attrs ? ' tap' : ''}" ${o.attrs ? `role="button" tabindex="0" ${o.attrs}` : ''}>${o.logo ? logo(o.logo, 40, isI() ? 20 : 12) : `<span class="m-ini pini" style="${o.iniStyle ?? ''}">${esc(o.ini ?? (o.t ?? '?').slice(0, 1))}</span>`}
    <span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(o.t)}</span>${o.s ? `<span class="m-ell s">${esc(o.s)}</span>` : ''}${aiLine(o.ai, 'm-ell ai')}${o.tags?.length ? `<span class="ptags">${o.tags.map((g) => `<em class="${g.k ?? ''}">${esc(g.n)}</em>`).join('')}</span>` : ''}</span>
    <span class="pv">${o.v ? `<b class="m-mono" style="color:${o.vc ?? 'inherit'}">${esc(o.v)}</b>` : ''}${o.vs ? `<small>${esc(o.vs)}</small>` : ''}${o.act ? `<button class="pact ${o.act.k ?? ''}" ${o.act.attrs}>${esc(o.act.l)}</button>` : ''}</span></div>`,
  bar: (l, v, pct, c, s = '', sc = '') => `<div class="opt-row col pbar"><span class="m-row" style="justify-content:space-between;gap:10px"><span class="m-ell">${esc(l)}</span><span class="m-mono" style="flex:none">${esc(v)}</span></span><span class="hbar"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${c}"></i></span>${s ? `<span style="font-size:12.5px;color:${sc || 'inherit'};opacity:${sc ? 1 : 0.65}">${esc(s)}</span>` : ''}</div>`,
  tog: (l, sub, on, attrs) => `<button class="opt-row" ${attrs} role="switch" aria-checked="${!!on}"><span class="m-grow"><b style="font-weight:500">${esc(l)}</b>${sub ? `<br><span style="font-size:13px;opacity:.65">${esc(sub)}</span>` : ''}</span><span class="sw" aria-checked="${!!on}"></span></button>`,
  val: (l, v, c = '', mono = false) => `<div class="opt-row"><span class="m-grow" style="opacity:.75">${esc(l)}</span><b class="${mono ? 'm-mono' : ''}" style="font-weight:500;text-align:right;${c ? `color:${c}` : ''}">${esc(v)}</b></div>`,
  chips: (l, opts) => `<div class="opt-row col">${l ? `<span style="font-size:13px;opacity:.7">${esc(l)}</span>` : ''}<div class="schips">${opts.map((o) => `<button class="chip" ${o.attrs} aria-pressed="${!!o.on}">${o.on && !isI() ? '✓ ' : ''}${esc(o.n)}</button>`).join('')}</div></div>`,
  inp: (l, id, v, ph = '', extra = '') => `<label class="opt-row col"><span style="font-size:13px;opacity:.7">${esc(l)}</span><input class="sinp" id="${id}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" ${extra}></label>`,
  btn: (l, attrs, c = 'var(--m-acc)') => `<button class="opt-row" ${attrs}><span class="m-grow" style="color:${c};font-weight:500">${esc(l)}</span></button>`,
  link: (l, href, c = 'var(--m-acc)', extra = '') => `<a class="opt-row" href="${href}" ${extra}><span class="m-grow" style="color:${c};font-weight:500">${esc(l)}</span></a>`,
  text: (l) => `<div class="opt-row"><span class="m-grow" style="line-height:1.45">${esc(l)}</span></div>`,
  file: (l, sub, accept, attrs) => `<label class="opt-row"><span class="set-ic">${icon('imp', 18)}</span><span class="m-grow"><b style="font-weight:500;color:var(--m-acc)">${esc(l)}</b><br><span style="font-size:12.5px;opacity:.65">${esc(sub)}</span></span><input class="m-file" type="file" accept="${accept}" multiple ${attrs}></label>`,
};
export const G = (t, rows, o = {}) => `${t || o.act ? `<div class="sec phd"><span>${esc(t)}</span>${o.act ? `<button class="pha" ${o.act.attrs}>${esc(o.act.l)}</button>` : ''}</div>` : ''}<div class="list ${gl()}">${rows.filter(Boolean).join('')}</div>${o.note ? `<div class="snote">${esc(o.note)}</div>` : ''}`;

export function page(o) {
  const th = theme();
  return `${o.back ? `<div class="m-row pg-top" style="justify-content:space-between">${backBtn(th, o.back[0], o.back[1], o.back[2] ?? '')}${avatar()}</div>` : ''}
    <div class="m-row pg-title" style="justify-content:space-between;align-items:flex-start;gap:10px;padding:2px 4px 0"><div class="m-grow"><div class="title m-ell">${esc(o.title)}</div>${o.sub ? `<div class="psub">${esc(o.sub)}</div>` : ''}</div>${o.back ? '' : avatar()}</div>
    ${o.hero?.v ? `<div class="phero ${gl('glass')}"><span>${esc(o.hero.l)}</span><b>${esc(o.hero.v)}</b>${o.hero.s ? `<span>${esc(o.hero.s)}</span>` : ''}${o.hero.spark ?? ''}${o.hero.chips ? `<div class="schips">${o.hero.chips.map((c) => `<button class="hchip" ${c.attrs} aria-pressed="${!!c.on}">${esc(c.n)}</button>`).join('')}</div>` : ''}</div>` : ''}
    ${o.kpis?.length ? `<div class="pkpis" style="grid-template-columns:${o.kpiCols ?? 'repeat(2,minmax(0,1fr))'}">${o.kpis.map((k) => `<div class="kpi ${gl()}"><span>${esc(k.l)}</span><b class="m-mono" style="color:${k.c ?? 'inherit'}">${esc(k.v)}</b>${k.s ? `<small>${esc(k.s)}</small>` : ''}</div>`).join('')}</div>` : ''}
    ${o.tiles?.length ? `<div class="ptiles">${o.tiles.map((t) => `<a class="ptile ${gl()}" href="${t.href}"><span class="pti">${icon(t.ic, 22)}${t.badge ? `<em>${t.badge}</em>` : ''}</span><b>${esc(t.l)}</b><span class="m-ell">${esc(t.s ?? '')}</span></a>`).join('')}</div>` : ''}
    ${(o.groups ?? []).join('')}`;
}

/* ---------- Detaljside for en rad ---------- */

function detailView() {
  const D = m.pdet;
  const list = D.list === undefined ? '<div class="m-spin"></div>' : D.list?.length ? G('Transaksjoner', D.list.map((t) => { m.txCache[t.id] = t; return R.item({ logo: t, t: t.description, s: `${dd(t.date)} · ${t.account} · ${t.category}`, ai: t.aiShort, v: sgn(t.amount), vc: amtC(t.amount, theme()), attrs: `data-tx="${t.id}"` }); }), { note: 'Trykk for å se kvittering, varelinjer og detaljer.' }) : '';
  return page({ back: ['#', D.backL ?? 'Tilbake', 'pdback'], title: D.title, sub: D.sub, hero: { l: D.hl ?? 'Beløp', v: D.v, s: D.vs },
    groups: [...(D.groups ?? []).map(([t, rows]) => G(t, rows.map(([k, v, c, mono]) => R.val(k, v, c, mono)))), list] });
}
async function openDetail(D, q) {
  m.pdet = { ...D, backL: D.backL ?? { kv: 'Kvitteringer', fast: 'Faste utgifter', konto: 'Kontoer', aks: 'Aksjer', rap: 'Rapporter', imp: 'Import' }[m.screen] };
  window.scrollTo(0, 0); draw();
  if (!q) { m.pdet.list = null; return draw(); }
  try { const r = await api('/transactions?' + new URLSearchParams(q)); if (m.pdet) m.pdet.list = (r.items ?? []).slice(0, 30); } catch { if (m.pdet) m.pdet.list = null; }
  draw();
}
const word = (s) => String(s ?? '').split(/[\s·]+/).find((w) => w.length >= 3) ?? String(s ?? '');

/* ---------- Lasting ---------- */

export async function pageLoad(scr) {
  const j = [], ok = (p) => p.catch(() => null);
  if (scr === 'mer') {
    j.push(ok(api('/recurring')).then((r) => { PG.rec = r; }), ok(api('/subscriptions')).then((r) => { PG.sub = r; }), ok(api('/folders')).then((r) => { PG.dirs = r; }), ok(api('/finn')).then((r) => { PG.finn = r; }));
    if (S.boot?.settings?.t212Set || !PG.stocks) j.push(ok(api('/stocks')).then((r) => { PG.stocks = r; }));
  }
  if (scr === 'kv') { j.push(ok(loadReceipts())); const { from, to } = S.boot?.period ?? {}; j.push(ok(api('/transactions?' + new URLSearchParams(from ? { from, to } : {}))).then((r) => { PG.booked = (r?.items ?? []).filter((t) => t.receipt === 'booked'); })); }
  if (scr === 'fast') j.push(ok(api('/recurring')).then((r) => { PG.rec = r ?? []; }));
  if (scr === 'aks') j.push(aksLoad().then(() => { if (AK.d && !AK.d.error) PG.stocks = AK.d; }));
  if (scr === 'rap') j.push(loadRep());
  if (scr === 'sok') {
    j.push(ok(api('/search/history')).then((r) => { PG.ai.hist = (Array.isArray(r) ? r : r?.items ?? []).map((x) => (typeof x === 'string' ? x : x?.q)).filter(Boolean); }));
    if (!PG.ai.groups) j.push(ok(api('/search/suggestions')).then((r) => {
      if (Array.isArray(r?.groups)) PG.ai.groups = r.groups.filter((g) => g?.items?.length);
      else if (Array.isArray(r) && r.length) PG.ai.groups = [{ title: 'Forslag', items: r }, ...localGroups().slice(1)];
    }));
  }
  await Promise.all(j);
}
async function loadRep() { PG.rep = await api(`/reports?mode=${PG.repMode}&month=${curM()}`).catch(() => null); }

/* ---------- Sider ---------- */

const monthly = (r) => (r.interval === 'yearly' ? r.amount / 12 : r.interval === 'weekly' ? (r.amount * 52) / 12 : r.amount);
const recWhen = (r) => (r.interval === 'yearly' ? `${r.day}.${String(r.month ?? 1).padStart(2, '0')} hvert år` : r.interval === 'weekly' ? 'Hver uke' : `Den ${r.day}. hver måned`);
const stockCur = () => { const c = PG.stocks?.summary?.currency; return !c || c === 'NOK' ? 'kr' : c; };

function mer() {
  const rv = S.boot?.reviewCount ?? (S.summary?.review ?? []).filter((r) => r.status === 'needs_review').length;
  const rec = (PG.rec ?? []).filter((r) => r.active), st = PG.stocks?.summary;
  // Budsjett ligger øverst når fanen er skjult (Finn har plassen som standard); Finn-flisen bare når Finn-fanen er skjult.
  const sm = S.summary, budTile = LAY().hide.bud ? [['budsjett', 'Budsjett', sm?.budgetTotal ? `${kr(sm.left ?? 0)} ${(sm.left ?? 0) < 0 ? 'over' : 'igjen'}` : 'Ikke satt opp', 'bud']] : [];
  const tiles = [
    ...budTile,
    ['kv', 'Kvitteringer', `${rv} til gjennomgang`, 'kv2', rv],
    ['fast', 'Faste utgifter', PG.rec ? `${kr(rec.reduce((a, r) => a + monthly(r), 0))}/mnd` : '…', 'fast2'],
    ['konto', 'Kontoer', kr(accs().reduce((a, x) => a + (x.balance ?? 0), 0)), 'konto2'],
    ['aks', 'Aksjer', st ? `${n0(st.value ?? st.total)} ${stockCur()}` : PG.stocks?.configured === false ? 'Ikke koblet til' : '…', 'aks'],
    ['rap', 'Rapporter', 'Måned og år', 'rap'],
    ['sub', 'Subscription OS', PG.sub ? `${kr(PG.sub.monthly ?? 0)}/mnd` : '…', 'sub2'],
    ['dir', 'Boliger', PG.dirs ? `${PG.dirs.length} ${PG.dirs.length === 1 ? 'bolig' : 'boliger'}` : '…', 'dir2'],
    ...(LAY().hide.finn ? [['finn', 'Finn-handler', PG.finn ? `${PG.finn.ongoing ?? 0} pågående` : '…', 'finn2']] : []),
    ['imp', 'Import', 'CSV, XLSX, tekst', 'imp'],
    ['sok', 'AI-søk', 'Spør om alt', 'ai'],
  ].map(([k, l, s, ic, badge]) => ({ href: '#/' + k, l: navName(k, l), s, ic, badge }));
  return page({ title: 'Mer', sub: 'Alt fra FinansHub på nettsiden', tiles,
    groups: [G('✦ Spør AI', [`<form data-pa="merai" class="opt-row col"><span style="font-size:13px;opacity:.7">Søker i transaksjoner, kvitteringer og varelinjer</span><input class="sinp" id="m-merq" type="search" enterkeyhint="search" placeholder="Hvor mye brukte jeg på kaffe?" value="${esc(PG.ai.q)}"></form>`, R.btn('Spør', 'data-pa="merask"')])] });
}

function kv() {
  const q = (S.receipts ?? []).filter((r) => r.status === 'needs_review'), st = S.boot?.settings ?? {};
  const jobs = m.jobs.filter((x) => x.status !== 'booked');
  return page({ back: ['#/mer', 'Tilbake til Mer'], title: 'Kvitteringer', hero: { l: 'Til gjennomgang', v: String(q.length), s: 'Lest av AI · bekreft før bokføring' },
    groups: [
      upqList(theme(), true),
      G('Trenger gjennomgang', q.length ? q.map((r) => { const hi = !r.error && (r.confidence ?? 0) >= (st.minConf ?? 85) / 100 && !r.flag; return R.item({ logo: { description: r.merchant ?? 'Kvittering', domain: r.domain, color: '#FFB08A' }, t: r.merchant ?? 'Ny kvittering', s: `${dd(r.date)} · ${r.provider ?? 'manuell'}${r.confidence != null ? ` · sikkerhet ${String(r.confidence.toFixed(2)).replace('.', ',')}` : ''}`, ai: r.aiShort, tags: [{ n: r.match ? 'Matchet mot kortkjøp' : hi ? 'Klar' : 'Sjekk beløp', k: r.match || hi ? 'ok' : 'warn' }], v: r.total != null ? `−${n2(r.total)}` : '', act: { l: 'Bokfør', attrs: `data-pa="book" data-id="${esc(r.id)}"` }, attrs: `data-rc="${esc(r.id)}"` }); }) : [R.text('Alt er gjennomgått.')]),
      jobs.length ? G('Opplastingskø', jobs.map((x) => { const run = ['pending', 'processing'].includes(x.status); return R.item({ ini: '↑', t: x.merchant || x.name || 'Kvittering', s: x.status === 'needs_review' ? 'Klar · trykk for å bekrefte' : x.status === 'processing' ? `Gemini leser … ${x.progress ?? 50} %` : x.status === 'error' ? 'Feil – åpne for å fylle ut' : 'I kø', tags: [{ n: x.status === 'needs_review' ? 'Klar' : run ? 'Leses' : x.status === 'error' ? 'Feil' : 'I kø', k: x.status === 'needs_review' ? 'ok' : run ? 'blue' : 'warn' }], attrs: `data-job="${esc(x.id)}"` }); })) : '',
      G('', [R.btn('Last opp kvittering', 'data-pa="sheet"'), R.btn('Ta bilde', 'data-pa="cam"')]),
      G(`Bokført i ${monthName(curM())}`, PG.booked === null ? ['<div class="m-spin"></div>'] : PG.booked.length ? PG.booked.slice(0, 20).map((t) => { m.txCache[t.id] = t; return R.item({ logo: t, t: t.description, s: `${dd(t.date)} · ${t.category}`, ai: t.aiShort, v: sgn(t.amount), vc: amtC(t.amount, theme()), attrs: `data-tx="${t.id}"` }); }) : [R.text('Ingen bokførte kvitteringer denne måneden.')]),
    ] });
}

function fast() {
  const list = PG.rec, act = (list ?? []).filter((r) => r.active), sum = act.reduce((a, r) => a + monthly(r), 0);
  return page({ back: ['#/mer', 'Tilbake til Mer'], title: 'Faste utgifter', kpis: [{ l: 'Per måned', v: kr(sum), s: `${act.length} aktive` }, { l: 'Per år', v: kr(sum * 12), s: 'Med dagens trekk' }],
    groups: [G('Trekk', list === null ? ['<div class="m-spin"></div>'] : list.length ? list.map((r) => R.item({ logo: { description: r.name, color: r.color }, t: r.name, s: `${recWhen(r)} · ${r.category}`, v: kr(r.amount), vs: r.active ? (r.interval === 'yearly' ? 'per år' : r.interval === 'weekly' ? 'per uke' : 'per mnd') : 'av', vc: r.active ? 'inherit' : 'rgba(127,127,127,.8)',
      act: { l: r.active ? 'På' : 'Av', k: r.active ? 'on' : 'off', attrs: `data-pa="fasttog" data-id="${r.id}"` }, attrs: `data-pd="fast" data-id="${r.id}"` })) : [R.text('Ingen faste trekk ennå.')], { note: 'Oppdages automatisk fra gjentakende transaksjoner. Skru av det som ikke lenger trekkes.' }),
      G('', [R.btn('Finn faste trekk automatisk', 'data-pa="detect"')])] });
}

function konto() {
  const a = accs(), tot = a.reduce((x, y) => x + (y.balance ?? 0), 0), goals = S.boot?.goals ?? [];
  const TYPE = { checking: 'Brukskonto', savings: 'Sparekonto', credit: 'Kreditt', cash: 'Kontanter' };
  return page({ back: ['#/mer', 'Tilbake til Mer'], title: 'Kontoer', hero: { l: 'Total saldo', v: kr(tot), s: `${a.length} kontoer` },
    groups: [G('Kontoer', a.map((x) => R.item({ ini: x.name.slice(0, 2), iniStyle: 'font-size:13px', t: x.name, s: [x.bank, x.last4 ? `•••• ${x.last4}` : '', TYPE[x.type] ?? ''].filter(Boolean).join(' · '), v: `${x.balance < 0 ? '−' : ''}${n2(x.balance)}`, vc: x.balance < 0 ? '#FFB08A' : 'inherit', attrs: `data-pd="konto" data-id="${x.id}"` }))),
      goals.length ? G('Sparemål', goals.map((g) => R.bar(g.name, `${n0(g.saved)} / ${n0(g.target)} kr`, g.target ? (g.saved / g.target) * 100 : 0, g.saved >= g.target ? '#9FE3C6' : 'var(--m-acc)', g.saved >= g.target ? 'Nådd ✓' : `${Math.round(g.target ? (g.saved / g.target) * 100 : 0)} % · ${n0(g.target - g.saved)} kr igjen`))) : ''] });
}

function rap() {
  const r = PG.rep, yr = PG.repMode === 'year', back = ['#/mer', 'Tilbake til Mer'];
  if (!r) return page({ back, title: 'Rapporter', groups: ['<div class="m-spin"></div>'] });
  const ms = r.months ?? [], cur = ms.find((x) => x.month === curM()) ?? ms[0] ?? { inn: 0, ut: 0 };
  const inn = yr ? ms.reduce((a, x) => a + x.inn, 0) : cur.inn, ut = yr ? ms.reduce((a, x) => a + x.ut, 0) : cur.ut;
  const mx = Math.max(1, ...(r.byCategory ?? []).map((c) => c.amount));
  const lbl = yr ? curM().slice(0, 4) : cap(monthName(curM()));
  return page({ back, title: 'Rapporter', kpis: [{ l: 'Inn', v: kr(inn), s: lbl, c: '#9FE3C6' }, { l: 'Ut', v: kr(ut), s: lbl }, { l: 'Spart', v: kr(inn - ut), s: 'Inn − ut' }, { l: 'Sparerate', v: `${inn ? Math.round(((inn - ut) / inn) * 100) : 0} %`, s: 'Av inntekt' }],
    groups: [G('', [R.chips('Periode', [{ n: 'Denne måneden', on: !yr, attrs: 'data-pa="rapm" data-v="month"' }, { n: 'Hittil i år', on: yr, attrs: 'data-pa="rapm" data-v="year"' }])]),
      G('Per kategori', (r.byCategory ?? []).map((c) => R.bar(c.category, kr(c.amount), (c.amount / mx) * 100, c.color))),
      (r.merchants ?? []).length ? G('Topp butikker', r.merchants.map((x) => R.item({ logo: { description: x.name }, t: x.name, s: `${x.count} kjøp`, v: `−${n0(x.amount)} kr`, attrs: `data-pd="merch" data-name="${esc(x.name)}"` }))) : '',
      G('Måned for måned', ms.map((x) => R.item({ ini: cap(monthName(x.month, false)).slice(0, 3), iniStyle: 'font-size:12px', t: cap(monthName(x.month)), s: `Spart ${kr(x.inn - x.ut)}`, v: `+${n0(x.inn)}`, vs: `−${n0(x.ut)}`, vc: '#9FE3C6' }))),
      G('', [R.link('Eksporter som CSV', `/finans/api/transactions.csv?from=${r.from}&to=${r.to}`, 'var(--m-acc)', 'download'), R.link('Lag PDF-rapport på en større skjerm', '/finans/?desktop=1#/rap')])] });
}

function imp() {
  const I = PG.imp, rows = I.rows, a = accs();
  return page({ back: ['#/mer', 'Tilbake til Mer'], title: 'Import', sub: 'Kontoutskrift fra nettbanken',
    groups: [
      G('Last inn', [R.file('Velg filer', '.xlsx, .csv eller .txt · flere samtidig', '.xlsx,.xls,.csv,.txt,text/csv', 'data-pa="impfile"'),
        `<label class="opt-row col"><span style="font-size:13px;opacity:.7">Eller lim inn tekst</span><textarea class="sinp" id="m-imptxt" rows="4" placeholder="10/10/26  Ruterappen  238,00" style="height:auto;padding:10px 12px;font-family:var(--mono);font-size:13px">${esc(I.text)}</textarea></label>`,
        a.length > 1 ? R.chips('Konto', a.map((x) => ({ n: x.name, on: (I.acc ?? a[0].id) === x.id, attrs: `data-pa="impacc" data-v="${x.id}"` }))) : '',
        R.btn(I.busy ? 'Leser …' : 'Les inn tekst', 'data-pa="imptxt"')], { note: 'DNB-format støttes: Dato, Forklaring, Rentedato, Ut, Inn. Tekst som «Visa 100021» og «Varekjøp» fjernes. Den opprinnelige bankraden lagres uendret.' }),
      rows ? G(`Forhåndsvisning · ${rows.length} poster`, rows.slice(0, 80).map((r) => R.item({ logo: { description: r.description, domain: r.domain }, t: r.description, s: `${dd(r.date)} · ${r.raw ?? ''}`, ai: r.aiShort, tags: [r.category ? { n: r.category } : null, r.duplicate ? { n: 'Finnes fra før', k: 'warn' } : null].filter(Boolean), v: sgn(r.amount), vc: r.amount > 0 ? '#9FE3C6' : 'inherit' })), { act: { l: 'Tøm', attrs: 'data-pa="impclear"' } }) : '',
      rows ? G('', [R.btn(`Importer ${rows.filter((r) => !r.duplicate).length} poster`, 'data-pa="impgo"')]) : '',
    ] });
}

const SUGG = ['Hvor mye har jeg brukt på kaffe?', 'Når kjøpte jeg lyspærer?', `Mat i ${monthName(today().slice(0, 7))}`, 'Hva har jeg betalt for lading?'];
// Søkemodus lagres på enheten. Er AI av eller nede, brukes vanlig søk automatisk.
const modeOf = () => { try { return localStorage.getItem('fh_search_mode') === 'plain' ? 'plain' : 'ai'; } catch { return 'ai'; } };
const setMode = (v) => { try { localStorage.setItem('fh_search_mode', v); } catch {} };
// Forslag før søk, i tre grupper. Serveren (GET /search/suggestions) kan sende egne grupper; ellers lages de her.
function localGroups() {
  const recent = [...new Set((S.summary?.recent ?? []).map((t) => String(t.description ?? '').split(/\s+/).slice(0, 2).join(' ')).filter(Boolean))].slice(0, 3);
  const month = monthName(today().slice(0, 7));
  return [
    { title: 'Butikker', items: (recent.length ? recent : ['Biltema', 'Rema 1000']).map((n) => `Sist jeg var på ${n}`).concat(['Alle kjøp på Circle K']) },
    { title: 'Varer i kvitteringer', items: ['Kvitteringer med tomater', 'Når kjøpte jeg lyspærer?', 'Kvitteringer med melk', 'Hva har jeg kjøpt av kaffe?'] },
    { title: 'Beløp og perioder', items: [`Mat i ${month}`, 'Over 500 kr', 'Største utgift', 'Til gjennomgang'] },
  ];
}
const groupsOf = () => (PG.ai.groups?.length ? PG.ai.groups : localGroups());
const allSugg = () => groupsOf().flatMap((g) => g.items);
function hitRow(h) {
  const ini = h.type === 'line' ? '≡' : h.type === 'receipt' ? '⧉' : (h.description ?? '?').slice(0, 1);
  return R.item({ ini, iniStyle: `background:${(h.color ?? '#A0A0AA')}2e;color:${h.color ?? '#A0A0AA'}`, t: h.description ?? '–', s: [h.date ? dd(h.date) : '', h.source ?? ''].filter(Boolean).join(' · '),
    ai: h.reason ?? h.why ?? '', v: h.amount != null ? sgn(h.amount) : '', vc: (h.amount ?? 0) > 0 ? '#9FE3C6' : 'inherit',
    attrs: h.txId ? `data-hit="${h.txId}" data-d="${esc(h.description ?? '')}"` : h.receiptId ? `data-rc="${esc(h.receiptId)}"` : '' });
}
function sok() {
  const A = PG.ai, r = A.r, mode = A.aiDown ? 'plain' : modeOf();
  if (PG.last !== 'sok') A.focus = true;
  const engine = S.boot?.settings?.provider === 'gemini' ? 'Gemini' : 'Ollama';
  const chip = (k, n) => ({ n, on: mode === k, attrs: `data-pa="smode" data-v="${k}"` });
  const chipsOf = (list) => R.chips('', list.map((t) => ({ n: t, on: r?.q === t, attrs: `data-pa="ask" data-q="${esc(t)}"` })));
  const follow = r ? (r.followUps?.length ? r.followUps : []) : [];
  const more = r ? (r.suggestions?.length ? r.suggestions : allSugg()).filter((t) => t !== r.q && !follow.includes(t)).slice(0, 8) : [];
  return page({ title: 'Søk', sub: mode === 'ai' ? `✦ AI · ${engine} · leser også innholdet i kvitteringene` : 'Vanlig søk · butikk, kategori, notat og varelinjer',
    groups: [
      R.chips('', [chip('ai', '✦ AI'), chip('plain', 'Vanlig søk')]),
      A.notice ? `<div class="snote snotice">${esc(A.notice)}</div>` : '',
      r?.plainFirst && !A.busy ? `<div class="plainfirst ${gl()}"><span class="m-grow">${esc(r.notice || 'Fant treff med vanlig søk, så AI ble ikke brukt')}</span><button class="pact" data-pa="askai" data-q="${esc(r.q)}">✦ Spør AI likevel</button></div>` : '',
      `<form data-aiform class="list ${gl()} aiform"><label class="opt-row col"><span style="font-size:13px;opacity:.7">${mode === 'ai' ? 'Spørsmål' : 'Søk'}</span><input class="sinp" id="m-aiq" type="search" enterkeyhint="search" autocomplete="off" value="${esc(A.q)}" placeholder="${mode === 'ai' ? 'f.eks. Når kjøpte jeg lyspærer?' : 'f.eks. tomater, Biltema, over 500 kr'}"></label><button type="submit" class="opt-row"><span class="m-grow" style="color:var(--m-acc);font-weight:600">${A.busy ? (mode === 'ai' ? 'Spør AI …' : 'Søker …') : mode === 'ai' ? '✦ Spør AI' : 'Søk'}</span></button></form>`,
      A.busy ? '<div class="m-spin"></div>' : '',
      // Før søk: forslag i tre grupper.
      !r && !A.busy ? groupsOf().map((g) => G(g.title, [chipsOf(g.items.slice(0, 6))])).join('') : '',
      r ? G(r.mode === 'plain' ? 'Resultat' : 'Svar', [R.text(r.answer || r.summary || (r.hits?.length ? `${r.hits.length} treff` : 'Fant ingen treff.')), r.engine ? `<div class="opt-row"><span class="snote" style="padding:0">${esc(r.engine)}</span></div>` : '']) : '',
      r?.stores?.length ? G('Butikker med det navnet', r.stores.map((st) => R.item({ ini: (st.name ?? '?').slice(0, 1), t: st.name, s: `${st.count ?? 0} kjøp${st.last ? ` · sist ${dd(st.last)}` : ''}` }))) : '',
      r?.hits?.length ? G('Treff', r.hits.slice(0, 40).map(hitRow)) : '',
      follow.length ? G('Prøv også', [chipsOf(follow.slice(0, 6))]) : '',
      more.length ? G('Flere forslag', [chipsOf(more)]) : '',
      (A.hist ?? []).length ? G('Tidligere søk', A.hist.slice(0, 8).map((q) => R.item({ ini: '↺', t: q, attrs: `data-pa="ask" data-q="${esc(q)}"` })), { act: { l: 'Tøm', attrs: 'data-pa="aihclear"' } }) : '',
    ] });
}

const VIEWS = { mer, kv, fast, konto, aks: () => aksView(m.sub), rap, imp, sok };
export function pageView(scr) {
  const html = m.pdet ? detailView() : VIEWS[scr]();
  PG.last = scr;
  return html;
}
export function pageAfterDraw() {
  if (m.screen === 'sok' && PG.ai.focus && !m.pdet && !m.detail) { PG.ai.focus = false; const el = document.getElementById('m-aiq'); if (el && document.activeElement !== el) el.focus({ preventScroll: true }); }
  if (m.screen !== 'sok') PG.last = m.screen;
}

/* ---------- Hendelser ---------- */

// Vanlig søk: GET /search. Eldre servere uten /search får et enkelt søk i transaksjonene.
async function plainSearch(q) {
  try { return { ...(await api('/search?q=' + encodeURIComponent(q))), mode: 'plain' }; }
  catch (e) {
    if (!/404|Not Found/i.test(e.message)) throw e;
    const t = await api('/transactions?q=' + encodeURIComponent(q));
    const items = t?.items ?? [];
    return { mode: 'plain', summary: items.length ? `${items.length} transaksjoner passer.` : 'Fant ingen treff.', hits: items.slice(0, 40).map((x) => ({ type: 'tx', txId: x.id, description: x.description, date: x.date, amount: x.amount, reason: `Butikk · ${x.description}` })) };
  }
}
async function ask(q, { force = false } = {}) {
  q = String(q ?? '').trim();
  if (!q) return;
  const A = PG.ai;
  A.q = q; A.busy = true; A.notice = ''; draw();
  const useAi = force || (modeOf() === 'ai' && !A.aiDown);
  try {
    if (useAi) {
      try {
        // Enkle ord (f.eks. «ica», «proton»): serveren prøver vanlig søk først og svarer plainFirst når det gir treff.
        // «✦ Spør AI likevel» sender force:true.
        const r = await api('/search/ai', { method: 'POST', json: force ? { q, force: true } : { q } });
        if (r?.aiUnavailable) throw Object.assign(new Error('AI er ikke tilgjengelig'), { ai: true });
        A.r = { ...r, q, mode: r?.plainFirst ? 'plain' : r?.mode ?? 'ai' };
      } catch (e) {
        A.aiDown = true; A.notice = 'AI-motoren svarer ikke nå. Viser vanlig søk i butikk, kategori, notat og varelinjer.';
        A.r = { ...(await plainSearch(q)), q };
      }
    } else A.r = { ...(await plainSearch(q)), q };
  } catch (e) { A.r = { q, answer: e.message, hits: [] }; }
  A.busy = false;
  A.hist = [q, ...(A.hist ?? []).filter((x) => x !== q)].slice(0, 20);
  draw();
}
async function impPost(commit) {
  const I = PG.imp, fd = new FormData();
  for (const f of I.files) fd.append('files', f);
  if (I.text.trim()) fd.append('text', I.text);
  const acc = I.acc ?? accs()[0]?.id; if (acc) fd.append('accountId', acc);
  return api('/import' + (commit ? '?commit=1' : ''), { method: 'POST', body: fd });
}

async function rowClick(e, d) {
  let x;
  if ((x = d('[data-hit]'))) {
    e.preventDefault();
    const id = +x.dataset.hit;
    if (!m.txCache[id] && ![...(S.tx?.items ?? [])].some((y) => y.id === id)) {
      try { const r = await api('/transactions?' + new URLSearchParams({ q: word(x.dataset.d), limit: 200 })); for (const y of r.items ?? []) m.txCache[y.id] = y; } catch {}
    }
    m.sel = id; m.detail = true; m.edit = null; window.scrollTo(0, 0); draw(); return true;
  }
  if ((x = d('[data-pd]'))) {
    e.preventDefault();
    const k = x.dataset.pd, id = x.dataset.id;
    if (k === 'fast') {
      const r = PG.rec.find((y) => String(y.id) === id);
      await openDetail({ title: r.name, sub: r.category, v: kr(r.amount), vs: recWhen(r), groups: [['Trekk', [['Trekkdato', recWhen(r)], ['Kategori', r.category], ['Per måned', kr(monthly(r))], ['Per år', kr(monthly(r) * 12)], ['Neste trekk', r.next ? `${dd(r.next)}.${r.next.slice(0, 4)}` : '–'], ['Status', r.active ? 'Aktiv' : 'Av', r.active ? '#9FE3C6' : ''], ['Oppdaget fra', r.detected ? 'Gjentakende transaksjoner' : 'Lagt inn manuelt']]]] }, { q: word(r.name), limit: 30 });
    } else if (k === 'konto') {
      const a = accs().find((y) => String(y.id) === id);
      await openDetail({ title: a.name, sub: a.bank ?? '', hl: 'Saldo', v: `${a.balance < 0 ? '−' : ''}${kr2(Math.abs(a.balance))}`, vs: 'Startsaldo + transaksjoner', groups: [['Konto', [['Bank', a.bank ?? '–'], ['Kontonummer', a.last4 ? `•••• ${a.last4}` : '–', '', true], ['Startsaldo', kr2(a.openingBalance ?? 0)], ['Notat', a.note || '–']]]] }, { account: a.id, limit: 30 });
    } else if (k === 'merch') {
      const n = x.dataset.name, r = (PG.rep?.merchants ?? []).find((y) => y.name === n);
      await openDetail({ title: n, sub: 'Topp butikk', v: `−${kr(r?.amount ?? 0)}`, vs: `${r?.count ?? 0} kjøp`, groups: [] }, { q: word(n), from: PG.rep.from, to: PG.rep.to, limit: 30 });
    }
    return true;
  }
  return false;
}

export async function pagesBind(e, t) {
  if (!PAGES.includes(m.screen)) return false;
  if (m.screen === 'aks' && !m.pdet && await aksBind(e, t)) return true;
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'input') {
    if (t.id === 'm-aiq') { PG.ai.q = t.value; return true; }
    if (t.id === 'm-merq') { PG.ai.q = t.value; return true; }
    if (t.id === 'm-imptxt') { PG.imp.text = t.value; return true; }
    return false;
  }
  if (e.type === 'submit') {
    if (d('[data-aiform]')) { e.preventDefault(); await ask(document.getElementById('m-aiq')?.value); return true; }
    if (d('[data-pa="merai"]')) { e.preventDefault(); location.hash = '#/sok'; ask(PG.ai.q); return true; }
    return false;
  }
  if (e.type === 'change') {
    if ((x = d('[data-pa="impfile"]'))) {
      PG.imp.files = [...x.files]; x.value = '';
      if (!PG.imp.files.length) return true;
      PG.imp.busy = true; draw();
      try { PG.imp.rows = (await impPost(false)).rows; } catch (err) { flash(err.message); }
      PG.imp.busy = false; draw(); return true;
    }
    return false;
  }
  if (e.type !== 'click') return false;
  const pa = d('[data-pa]');
  if (!pa) {
    if (d('[data-mact="pdback"]')) { e.preventDefault(); m.pdet = null; draw(); return true; }
    return rowClick(e, d);
  }
  const k = pa.dataset.pa;
  if (k === 'merai' || k === 'impfile') return false;
  e.preventDefault();
  if (k === 'merask') { const q = document.getElementById('m-merq')?.value ?? PG.ai.q; location.hash = '#/sok'; ask(q); }
  else if (k === 'ask') { if (m.screen !== 'sok') location.hash = '#/sok'; await ask(pa.dataset.q); }
  else if (k === 'askai') { await ask(pa.dataset.q, { force: true }); }
  else if (k === 'smode') {
    const v = pa.dataset.v;
    if (v === 'ai' && PG.ai.aiDown) { PG.ai.aiDown = false; } // prøv AI igjen
    setMode(v); PG.ai.notice = ''; draw();
    if (PG.ai.r?.q) await ask(PG.ai.r.q);
  }
  else if (k === 'aihclear') { PG.ai.hist = []; api('/search/history', { method: 'DELETE' }).catch(() => {}); draw(); }
  else if (k === 'book') { await api(`/receipts/${pa.dataset.id}/book`, { method: 'POST' }); await pageLoad('kv'); flash('Bokført ✓'); }
  else if (k === 'sheet') openSheet();
  else if (k === 'cam') openCam();
  else if (k === 'fasttog') { const r = PG.rec.find((y) => String(y.id) === pa.dataset.id); await api(`/recurring/${r.id}`, { method: 'PATCH', json: { active: !r.active } }); await pageLoad('fast'); flash(r.active ? `${r.name} er skrudd av` : `${r.name} er skrudd på`); }
  else if (k === 'detect') { const r = await api('/recurring/detect', { method: 'POST' }); await pageLoad('fast'); flash(r.added ? `Fant ${r.added} nye faste trekk` : 'Fant ingen nye faste trekk'); }
  else if (k === 'rapm') { PG.repMode = pa.dataset.v; PG.rep = null; draw(); await loadRep(); draw(); }
  else if (k === 'impacc') { PG.imp.acc = +pa.dataset.v; draw(); }
  else if (k === 'imptxt') { if (!PG.imp.text.trim() && !PG.imp.files.length) { flash('Lim inn rader eller velg filer først'); return true; } PG.imp.busy = true; draw(); try { PG.imp.rows = (await impPost(false)).rows; } catch (err) { flash(err.message); } PG.imp.busy = false; draw(); }
  else if (k === 'impclear') { PG.imp = { ...PG.imp, rows: null, files: [], text: '' }; draw(); }
  else if (k === 'impgo') { const r = await impPost(true); PG.imp = { ...PG.imp, rows: null, files: [], text: '' }; flash(`${r.imported} poster importert${r.duplicates ? ` · ${r.duplicates} fantes fra før` : ''} · kategoriseres i bakgrunnen`); }
  else return false;
  return true;
}
export { c3 };
