// Subscription OS på PC (designet «Subscription OS», web): fanene Oversikt og Kalender, og «+ Legg til abonnement»
// med Skriv inn selv · Fra kvittering · Fra transaksjoner. Tallene kommer fra GET /subscriptions (byMonth, health,
// savings, upcoming, thisMonth). Kvitteringer lastes opp med data-mrc="sub" (modules.js), resten håndteres her.
import { S, api, esc, n0, render, toast, logo, parseAmount } from './core.js';

const u = S.ui;
const kr = (v) => `${n0(v)} kr`;
const skel = (h = 160) => `<div class="skel" style="min-height:${h}px"></div>`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
const MON_L = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
// Kategorifarger: lys farge for valgt måned og legend, mørk for de andre månedene og stripene.
export const CAT_COL = { Underholdning: ['#FF7A3D', '#C85A26'], Produktivitet: ['#7AA7FF', '#4F78D0'], 'Lagring og sky': ['#F2C14E', '#BD9330'], 'Helse og trening': ['#5FD3A8', '#3A9F7B'],
  Transport: ['#B79CFF', '#8A70D6'], 'Mobil og internett': ['#30B0C7', '#22808F'], 'Nyheter og lesing': ['#FF8A80', '#C8615A'], Annet: ['#A0A0AA', '#6E6E78'] };
const col = (c, i = 0) => (CAT_COL[c] ?? CAT_COL.Annet)[i];
const CYC = [['monthly', 'Månedlig'], ['yearly', 'Årlig'], ['biennial', 'Hvert 2. år']];
const CYC_M = { monthly: 1, yearly: 12, biennial: 24 };
const ST = { active: ['Aktiv', 'ok'], low_use: ['⚠ Lite brukt', 'low'], price_up: ['▲ Pris økt', 'up'], cancelled: ['Sagt opp', 'off'] };
const ST_RANK = { price_up: 0, low_use: 1, active: 2, cancelled: 3 };
const lg = (s, size = 28) => logo({ ...s, description: s.name ?? s.merchant, color: col(s.category) }, size, size / 2);
const dShort = (iso) => (iso ? `${+iso.slice(8, 10)}. ${MON_L[+iso.slice(5, 7) - 1].slice(0, 3)}` : '–');
const dLong = (iso) => `${+iso.slice(8, 10)}. ${MON_L[+iso.slice(5, 7) - 1]}`;
const ymOf = (iso) => iso.slice(0, 7);
const days = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 86400_000);
const dayWord = (iso, today) => { const n = days(today, iso); return n === 0 ? 'i dag' : n === 1 ? 'i morgen' : WD[new Date(`${iso}T12:00`).getDay()]; };
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);

export async function loadSubs() {
  S.subs = await api('/subscriptions');
  if (u.subCand) S.subCands = await api('/subscriptions/candidates');
  S.subsCal = u.subCalM && u.subCalM !== S.subs.month ? await api(`/subscriptions?month=${u.subCalM}`) : null;
}

/* ---------- Topplinje: fanene og «+ Legg til abonnement» ---------- */

function head() {
  const tab = u.subTab ?? 'ov';
  return `<div class="so-top"><div class="so-seg">${[['ov', 'Oversikt'], ['cal', 'Kalender']].map(([k, n]) => `<button data-stab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    <div class="so-addwrap"><button class="btn pri so-addbtn" data-sact="menu" aria-expanded="${!!u.subMenu}">+ Legg til abonnement ▾</button>
    ${u.subMenu ? `<div class="so-menu" role="menu">
      <button data-sact="manual" role="menuitem"><span class="so-mi">✎</span><span><b>Skriv inn selv</b><small>Tjeneste, beløp og trekkdag</small></span></button>
      <label role="menuitem"><span class="so-mi">⎙</span><span><b>Fra kvittering</b><small>✦ AI leser bilde, PDF eller e-post</small></span>
        <input type="file" multiple accept="image/*,application/pdf,.eml,message/rfc822,.txt,text/plain" data-mrc="sub" hidden></label>
      <button data-sact="cands" role="menuitem"><span class="so-mi">⇄</span><span><b>Fra transaksjoner</b><small>✦ Finn faste trekk i banken</small></span></button></div>` : ''}</div></div>`;
}

function candPanel() {
  if (!u.subCand) return '';
  const c = S.subCands;
  const body = !c ? skel(90) : c.length ? c.map((x, i) => `<div class="so-cand">${lg({ ...x, name: x.merchant }, 32)}<span class="grow"><b>${esc(x.merchant)}</b>
      <small>Trekkes ${+x.lastDate.slice(8, 10)}. ${x.cycle === 'monthly' ? 'hver måned' : x.cycle === 'yearly' ? 'hvert år' : 'hvert 2. år'} · ${kr(x.amount)} · sett ${x.count} ganger</small></span>
      <button class="btn sm pri" data-scand="${i}">+ Legg til</button></div>`).join('')
    : '<div class="note">Fant ingen faste trekk som ikke allerede er registrert. Trekk må være sett minst 3 ganger med omtrent samme beløp.</div>';
  return `<section class="card so-cands"><div class="card-h"><h2>✦ Faste trekk i banken</h2><button class="x-btn sm" data-sact="cands-close" aria-label="Lukk">×</button></div>
    <div class="note">Trekk sett minst 3 ganger som ikke er registrert som abonnement.</div>${body}</section>`;
}

/* ---------- Oversikt ---------- */

function savingsCard(d) {
  const act = d.items.filter((s) => s.active);
  const low = act.filter((s) => s.status === 'low_use').length, up = act.filter((s) => s.status === 'price_up').length;
  const n = d.savings.suggestions.length;
  const parts = [low ? `${low} abonnement${low === 1 ? '' : 'er'} å se på` : '', up ? (up === 1 ? 'én prisøkning' : `${up} prisøkninger`) : ''].filter(Boolean);
  return `<section class="card so-sav"><span class="so-chip acc">✦ AI-SPARING</span>
    <h2 class="so-sav-h">${n ? `Spar ${kr(d.savings.monthly)} i måneden` : 'Ingenting å spare akkurat nå'}</h2>
    <p>${n ? `AI fant ${parts.join(', og ')}.` : 'Alle abonnementene ser ut til å være i bruk, og ingen har økt prisen.'}</p>
    ${n ? `<div class="so-row"><button class="btn so-white" data-sact="review">Gå gjennom</button><span class="muted">${n} forslag</span></div>` : ''}</section>`;
}

function totalCard(d) {
  const act = d.items.filter((s) => s.active);
  const pct = d.prevMonthly ? ((d.monthly - d.prevMonthly) / d.prevMonthly) * 100 : null;
  const by = [...act].sort((a, b) => b.monthly - a.monthly);
  const hi = by[0], lo = by.at(-1);
  const mini = (l, v, s, cls) => `<div class="so-mini"><span>${l}</span><b class="mono">${v}</b>${s ? `<span class="so-chip ${cls}">${esc(s)}</span>` : ''}</div>`;
  return `<section class="card so-total"><div class="so-total-l"><span class="muted">Faste abonnementer per måned</span><b class="mono so-big">${kr(d.monthly)}</b>
      <div class="so-row">${pct != null && Math.abs(pct) >= 0.05 ? `<span class="so-trend ${pct > 0 ? 'up' : 'dn'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1).replace('.', ',')} %</span><span class="muted">fra forrige måned ·</span>` : ''}<span class="muted"><span class="mono">${kr(d.yearly)}</span> i året</span></div></div>
    <div class="so-minis">${mini('Aktive', String(act.length), 'Alle tjenester', 'blue')}${mini('Dyreste', hi ? kr(hi.monthly) : '–', hi?.name, 'red')}${mini('Billigste', lo ? kr(lo.monthly) : '–', lo?.name, 'green')}</div></section>`;
}

function banner(d) {
  const up = d.upcoming ?? [];
  if (!up.length) return '';
  const txt = list(up.slice(0, 4).map((x) => `${esc(x.name)} ${kr(x.amount)} ${dayWord(x.date, d.today)}`));
  return `<div class="so-banner"><span class="so-bang">!</span><span class="grow">${up.length} trekk de neste dagene: ${txt}${up.length > 4 ? ' …' : ''}.</span><button class="so-link" data-stab="cal">Se kalender →</button></div>`;
}

function yearChart(d) {
  const cats = d.categories.filter((c) => d.byMonth.some((m) => m.byCategory[c]));
  const mx = Math.max(1, ...d.byMonth.map((m) => m.total));
  const cur = d.year === +d.today.slice(0, 4) ? +d.today.slice(5, 7) - 1 : 0;
  const sel = Math.min(11, Math.max(0, u.subMon ?? cur)), m = d.byMonth[sel];
  const bars = d.byMonth.map((x, i) => {
    const on = i === sel;
    const segs = [...cats].reverse().filter((c) => x.byCategory[c]).map((c) => `<i style="flex:${x.byCategory[c]} 0 0;background:${on ? col(c) : `${col(c, 1)}99`}"></i>`).join('');
    return `<button class="so-bar${on ? ' on' : ''}" data-smon="${i}" title="${MON[i]} ${d.year}: ${kr(x.total)}"><span class="so-stack" style="height:${Math.max(2, (x.total / mx) * 86)}%">${segs}</span><span class="so-bl">${MON[i]}</span></button>`;
  }).join('');
  const left = Math.min(82, Math.max(18, ((sel + 0.5) / 12) * 100));
  const tip = `<div class="so-tip" style="left:${left}%"><b><span class="so-dot" style="background:var(--text)"></span>${MON[sel]} ${d.year}</b>
    <span>Totalt</span><span class="mono">${kr(m.total)}</span>${cats.filter((c) => m.byCategory[c]).map((c) => `<span>${esc(c)}</span><span class="mono">${kr(m.byCategory[c])}</span>`).join('')}</div>`;
  return `<section class="card so-chart"><div class="card-h"><h2>Forbruk per måned · ${d.year}</h2><span class="muted">Trykk på en måned</span></div>
    <div class="so-bars">${m.total ? tip : ''}${bars}</div>
    <div class="so-legend">${cats.map((c) => `<span><span class="so-dot" style="background:${col(c)}"></span>${esc(c)}</span>`).join('')}</div></section>`;
}

function monthCard(d, byId) {
  const all = d.thisMonth.filter((x) => byId.has(x.id));
  const paid = all.filter((x) => x.date <= d.today), sum = (a) => a.reduce((s, x) => s + x.amount, 0);
  const total = sum(all), done = sum(paid);
  const shown = paid.length ? [...paid].reverse() : all;
  const dates = [...new Set(shown.map((x) => x.date))].slice(0, 3);
  const groups = dates.map((dt) => `<div class="so-grp"><span class="muted">${days(dt, d.today) === 0 ? 'I dag' : days(dt, d.today) === 1 ? 'I går' : dLong(dt)}</span>${shown.filter((x) => x.date === dt).map((x) => {
    const s = byId.get(x.id);
    return `<div class="so-li">${lg(s, 32)}<span class="grow"><b>${esc(s.name)}</b><small>${x.date <= d.today ? 'Betalt' : 'Trekkes'} · ${esc(s.plan || s.cycleName)}</small></span><span class="mono so-neg">−${kr(x.amount)}</span></div>`;
  }).join('')}</div>`).join('');
  return `<section class="card so-month"><div class="card-h"><h2>Trekk denne måneden</h2><span class="muted">${kr(done)} av ${kr(total)}</span></div>
    <div class="so-prog"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    <span class="muted">${paid.length} av ${all.length} trekk er betalt</span>${groups || '<div class="note">Ingen trekk denne måneden.</div>'}</section>`;
}

function table(d) {
  const { k, dir } = u.subSort ?? { k: 'next', dir: 1 };
  const key = { name: (s) => s.name.toLowerCase(), plan: (s) => (s.plan ?? '').toLowerCase(), cyc: (s) => CYC_M[s.cycle] ?? 1, next: (s) => s.nextDate ?? '9999', amt: (s) => s.price, st: (s) => ST_RANK[s.status] ?? 2 }[k];
  const rows = [...d.items].sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1) || (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * dir);
  const th = [['name', 'Tjeneste'], ['plan', 'Plan'], ['cyc', 'Trekk'], ['next', 'Neste trekk'], ['amt', 'Beløp'], ['st', 'Status']]
    .map(([c, n]) => `<button data-ssort="${c}" class="${k === c ? 'on' : ''}">${n} ${k === c ? (dir > 0 ? '↑' : '↓') : '↕'}</button>`).join('');
  const f = u.subF ?? {};
  const add = u.subAdd ? `<form class="so-tr so-new" data-sform="new">
      <input class="inp" name="name" placeholder="Tjeneste, f.eks. Disney+" value="${esc(f.name ?? '')}" required aria-label="Tjeneste">
      <input class="inp" name="plan" placeholder="Plan" value="${esc(f.plan ?? '')}" aria-label="Plan">
      <span class="so-cyc" role="radiogroup" aria-label="Trekk">${CYC.map(([v, l]) => `<label><input type="radio" name="cycle" value="${v}"${(f.cycle ?? 'monthly') === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}</span>
      <input class="inp" name="chargeDay" type="number" min="1" max="31" placeholder="Trekkdag" value="${esc(f.chargeDay ?? '')}" aria-label="Trekkdag (1–31)">
      <input class="inp" name="price" placeholder="Beløp kr" inputmode="decimal" value="${esc(f.price ?? '')}" required aria-label="Beløp per trekk">
      <span class="so-new-b"><button class="btn sm pri">Legg til</button><button type="button" class="btn sm ghost" data-sact="add-close">Avbryt</button></span></form>` : '';
  const body = rows.map((s) => {
    const [stT, stC] = ST[s.status] ?? ST.active, flag = s.status === 'low_use' || s.status === 'price_up';
    const act = !s.active ? `<button class="so-act" data-msub-tog="${s.id}">Angre</button>` : flag ? `<button class="so-act on" data-ssub-cut="${s.id}">Si opp</button>` : `<button class="so-act" data-ssub-menu="${s.id}" aria-label="Flere valg">···</button>`;
    const pop = u.subRow === s.id ? `<div class="so-pop">
        <label>Trekk<select class="sel sm" data-msub-cyc="${s.id}">${CYC.map(([v, l]) => `<option value="${v}"${s.cycle === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Trekkdag<input class="inp sm" type="number" min="1" max="31" value="${s.chargeDay ?? ''}" data-ssub-day="${s.id}"></label>
        <label>Kategori<select class="sel sm" data-ssub-cat="${s.id}">${d.categories.map((c) => `<option${s.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <button data-msub-low="${s.id}">${s.lowUse ? 'Fjern «Lite brukt»' : 'Marker som lite brukt'}</button>
        <button data-ssub-cut="${s.id}">Si opp</button><button class="so-del" data-msub-del="${s.id}">Slett</button></div>` : '';
    const price = s.status === 'price_up' && s.prevPrice != null ? ` title="Var ${kr(s.prevPrice)} til ${dShort(s.priceChanged)}"` : '';
    return `<div class="so-tr${s.active ? '' : ' off'}"><span class="so-name">${lg(s)}<b>${esc(s.name)}</b></span><span class="sub ell">${esc(s.plan || '–')}</span><span class="sub">${s.cycleName}</span>
      <span class="sub">${dShort(s.nextDate)}</span><span class="mono"${price}>${kr(s.price)}</span><span><span class="so-st ${stC}"${s.usageNote ? ` title="${esc(s.usageNote)}"` : ''}>${stT}</span></span><span class="so-hand">${act}${pop}</span></div>`;
  }).join('');
  return `<section class="card so-table"><div class="card-h"><h2>Abonnementer</h2><button class="so-link plain" data-sact="${u.subAdd ? 'add-close' : 'manual'}">${u.subAdd ? 'Lukk' : '⊕ Nytt abonnement'}</button></div>
    <div class="so-tr so-th">${th}<span>Handling</span></div>${add}${body || '<div class="empty">Ingen abonnementer ennå. Legg til ett med «+ Legg til abonnement».</div>'}</section>`;
}

function gauge(score) {
  const ticks = Array.from({ length: 30 }, (_, i) => {
    const a = Math.PI * (1 - i / 29), on = i / 29 <= score / 100;
    const c = on ? (i < 10 ? '#C85A26' : i < 20 ? 'var(--acc)' : 'var(--acc-l)') : '#2A2A32';
    return `<line x1="${(110 + 78 * Math.cos(a)).toFixed(1)}" y1="${(112 - 78 * Math.sin(a)).toFixed(1)}" x2="${(110 + 100 * Math.cos(a)).toFixed(1)}" y2="${(112 - 100 * Math.sin(a)).toFixed(1)}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
  }).join('');
  return `<svg class="so-gauge" viewBox="0 0 220 124" role="img" aria-label="Abonnementshelse ${score} av 100">${ticks}<text x="110" y="112" text-anchor="middle"><tspan class="so-gv">${score}</tspan><tspan class="so-gm" dx="2">/100</tspan></text></svg>`;
}

function healthCard(d) {
  const h = d.health;
  return `<section class="card so-health"><div class="card-h"><h2>Abonnementshelse</h2><span class="so-chip ${h.score >= 65 ? 'green' : h.score >= 45 ? 'acc' : 'red'}">${esc(h.label)}</span></div>${gauge(h.score)}<p class="muted">${esc(h.text)}</p></section>`;
}

function tipsCard(d, byId) {
  const s = d.savings.suggestions;
  return `<section class="card so-tips"><h2>✦ Forslag</h2>${s.length ? s.map((x) => `<div class="so-li top">${lg({ ...(byId.get(x.id) ?? {}), name: x.name, domain: x.domain }, 30)}<span class="grow">${esc(x.text)} <b class="so-pos">−${kr(x.amount)}/mnd</b></span></div>`).join('')
    : '<div class="note">Ingen forslag akkurat nå.</div>'}</section>`;
}

function overview(d, byId) {
  return `<div class="so-r1">${savingsCard(d)}${totalCard(d)}</div>${banner(d)}
    <div class="so-r2">${yearChart(d)}${monthCard(d, byId)}</div>
    <div class="so-r3">${table(d)}<div class="so-side">${healthCard(d)}${tipsCard(d, byId)}</div></div>`;
}

/* ---------- Kalender ---------- */

function calendar(d, byId) {
  const ym = u.subCalM ?? d.month, src = ym === d.month ? d : S.subsCal;
  if (!src) return skel(480);
  const [y, m] = ym.split('-').map(Number);
  const charges = src.thisMonth.filter((x) => byId.has(x.id));
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7, n = new Date(y, m, 0).getDate();
  const sel = u.subDay && u.subDay.startsWith(ym) ? u.subDay : d.today.startsWith(ym) ? d.today : `${ym}-01`;
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="so-day blank"></span>');
  for (let i = 1; i <= n; i++) {
    const iso = `${ym}-${String(i).padStart(2, '0')}`, on = charges.filter((x) => x.date === iso);
    const cls = [iso < d.today ? 'past' : '', iso === d.today ? 'today' : '', iso === sel ? 'sel' : ''].filter(Boolean).join(' ');
    cells.push(`<button class="so-day ${cls}" data-sday="${iso}"><span class="so-dn">${i}</span><span class="so-dl">${on.slice(0, 3).map((x) => lg(byId.get(x.id), 22)).join('')}</span>${on.length ? `<span class="mono so-ds">${kr(on.reduce((a, x) => a + x.amount, 0))}</span>` : ''}</button>`);
  }
  const L = charges.filter((x) => x.date === sel);
  const detail = `<section class="card so-dd"><span class="so-ddt">${sel === d.today ? 'I DAG · ' : ''}${dLong(sel).toUpperCase()}</span><b class="mono so-ddv">${kr(L.reduce((a, x) => a + x.amount, 0))}</b>
    ${L.length ? L.map((x) => { const s = byId.get(x.id); return `<div class="so-li">${lg(s, 32)}<span class="grow"><b>${esc(s.name)}</b><small>${esc([s.plan, s.cycleName, s.category].filter(Boolean).join(' · '))}</small></span><span class="mono">${kr(x.amount)}</span></div>`; }).join('') : '<div class="note">Ingen trekk denne dagen.</div>'}</section>`;
  const per = {};
  for (const s of d.items) if (s.active) per[s.category] = (per[s.category] ?? 0) + s.monthly;
  const cats = d.categories.filter((c) => per[c]), mx = Math.max(1, ...cats.map((c) => per[c]));
  const split = `<section class="card so-split"><h2>Fordeling per måned</h2>${cats.map((c) => `<div class="so-cb"><span>${esc(c)}</span><span class="mono">${kr(per[c])}</span>
    <span class="so-cbar"><i style="width:${(per[c] / mx) * 100}%;background:repeating-linear-gradient(135deg,${col(c)} 0 6px,${col(c, 1)} 6px 9px)"></i></span></div>`).join('') || '<div class="note">Ingen aktive abonnementer.</div>'}</section>`;
  return `<div class="so-cal-wrap"><section class="card so-cal"><div class="card-h"><div class="so-row"><button class="x-btn sm" data-scal="-1" aria-label="Forrige måned">‹</button><h2>${MON_L[m - 1][0].toUpperCase()}${MON_L[m - 1].slice(1)} ${y}</h2><button class="x-btn sm" data-scal="1" aria-label="Neste måned">›</button></div>
    <span class="muted">${kr(charges.reduce((a, x) => a + x.amount, 0))} trekkes i ${MON_L[m - 1]}</span></div>
    <div class="so-grid">${['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((x) => `<span class="so-wd">${x}</span>`).join('')}${cells.join('')}</div></section>
    <div class="so-side">${detail}${split}</div></div>`;
}

export function subPage() {
  const d = S.subs;
  if (!d?.byMonth) return skel(400);
  const byId = new Map(d.items.map((s) => [s.id, s]));
  return `<div class="so">${head()}${candPanel()}${(u.subTab ?? 'ov') === 'cal' ? calendar(d, byId) : overview(d, byId)}</div>`;
}

/* ---------- Hendelser ---------- */

export function bindSubs(el) {
  const wrap = (fn) => async (e) => { if (u.page !== 'sub') return; try { await fn(e); } catch (err) { toast(err.message); } };
  const reload = async () => { await loadSubs(); render(); };
  const patch = async (id, json) => { await api(`/subscriptions/${id}`, { method: 'PATCH', json }); return reload(); };
  el.addEventListener('click', wrap(async (e) => {
    const d = (s) => e.target.closest(s);
    let x;
    // Menyene lukkes ved klikk utenfor.
    if (u.subMenu && !d('.so-addwrap')) { u.subMenu = false; render(); }
    if (u.subRow && !d('.so-hand')) { u.subRow = null; render(); }
    if ((x = d('[data-stab]'))) { u.subTab = x.dataset.stab; u.subMenu = false; return render(); }
    if ((x = d('[data-smon]'))) { u.subMon = +x.dataset.smon; return render(); }
    if ((x = d('[data-sday]'))) { u.subDay = x.dataset.sday; return render(); }
    if ((x = d('[data-ssort]'))) { const k = x.dataset.ssort, cur = u.subSort ?? { k: 'next', dir: 1 }; u.subSort = { k, dir: cur.k === k ? -cur.dir : 1 }; return render(); }
    if ((x = d('[data-ssub-menu]'))) { const id = +x.dataset.ssubMenu; u.subRow = u.subRow === id ? null : id; return render(); }
    if ((x = d('[data-ssub-cut]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.ssubCut); u.subRow = null; await patch(s.id, { active: false }); return toast(`${s.name} er markert som sagt opp`); }
    if ((x = d('[data-scal]'))) {
      const [y, m] = (u.subCalM ?? S.subs.month).split('-').map(Number), t = new Date(y, m - 1 + +x.dataset.scal, 1);
      u.subCalM = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; u.subDay = null; S.subsCal = null; render();
      if (u.subCalM !== S.subs.month) S.subsCal = await api(`/subscriptions?month=${u.subCalM}`);
      return render();
    }
    if ((x = d('[data-scand]'))) {
      const c = S.subCands[+x.dataset.scand];
      x.disabled = true;
      const s = await api('/subscriptions', { method: 'POST', json: { fromCandidate: c } });
      toast(`${s.name} er lagt til`); return reload();
    }
    if ((x = d('[data-sact]'))) {
      switch (x.dataset.sact) {
        case 'menu': u.subMenu = !u.subMenu; return render();
        case 'manual': u.subMenu = false; u.subTab = 'ov'; u.subAdd = true; render(); el.querySelector('[data-sform=new] [name=name]')?.focus(); return;
        case 'add-close': u.subAdd = false; u.subF = null; return render();
        case 'cands': u.subMenu = false; u.subCand = true; S.subCands = null; render(); S.subCands = await api('/subscriptions/candidates'); return render();
        case 'cands-close': u.subCand = false; return render();
        case 'review': u.subSort = { k: 'st', dir: 1 }; render(); el.querySelector('.so-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
      }
    }
  }));
  el.addEventListener('change', wrap(async (e) => {
    const t = e.target;
    if (t.matches('[data-mrc="sub"]')) { u.subMenu = false; return; } // opplastingen gjøres i modules.js
    if (t.matches('[data-ssub-day]')) return patch(+t.dataset.ssubDay, { chargeDay: +t.value || null });
    if (t.matches('[data-ssub-cat]')) return patch(+t.dataset.ssubCat, { category: t.value });
  }));
  // Feltene i den nye raden beholdes når siden tegnes på nytt.
  el.addEventListener('input', (e) => { const f = e.target.closest('[data-sform=new]'); if (f) u.subF = Object.fromEntries(new FormData(f)); });
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest('[data-sform]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const price = parseAmount(v.price);
    if (!v.name.trim() || !(price > 0)) return toast('Skriv tjeneste og beløp');
    const s = await api('/subscriptions', { method: 'POST', json: { name: v.name, plan: v.plan, price, cycle: v.cycle, chargeDay: +v.chargeDay || null } });
    u.subAdd = false; u.subF = null; toast(`${s.name} er lagt til`); return reload();
  }));
}
