// Prompt 51 (FIN51): «Planlegging» i FinansHub – sparemål, faste utgifter-kalender med saldoprognose, skattehjelp,
// prishistorikk og abonnementsjeger. Samme modul brukes på desktop (siden «plan» i FinansHub, modules.js) og som egen
// side for PWA/mobil (/finans/plan51). Selvstendig: egen tilstand og egne hendelser (data-p51*), ingen avhengighet til
// desktop.js. Desktop tegner hele siden på nytt ofte, så modulen monterer seg selv i hvert nytt [data-p51-host] (MutationObserver)
// og bruker data den allerede har hentet. API: /finans/api/fin51/* ($S/SERVER51-API.md, seksjon FIN51).

const BASE = '/finans/api';
const TABS = [['spar', 'Sparemål'], ['kal', 'Kalender'], ['skatt', 'Skatt'], ['pris', 'Priser'], ['jakt', 'Abonnementsjeger']];
const P = { tab: 'spar', data: {}, busy: {}, err: {}, ui: { days: 30, acc: 'all', year: null, q: '', sort: 'change', open: null, weeks: 6, draft: null, edit: null, newGoal: false, dep: null } };
try { const t = localStorage.getItem('fin51_tab'); if (TABS.some(([k]) => k === t)) P.tab = t; } catch { /* privat modus */ }
{ const h = location.hash.replace(/^#\/?/, ''); if (TABS.some(([k]) => k === h)) P.tab = h; }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => (Number.isFinite(+v) ? (+v).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\s/g, ' ') : '–');
const kr = (v, d = 0) => `${v < 0 ? '−' : ''}${nf(Math.abs(v), d)} kr`;
const krS = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), Math.abs(v) % 1 ? 2 : 0)} kr`;
const MON3 = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const dl = (iso) => (iso ? `${+iso.slice(8, 10)}. ${MON3[+iso.slice(5, 7) - 1]}` : '');

async function api(path, { method = 'GET', json, body, headers = {} } = {}) {
  const r = await fetch(BASE + path, { method, credentials: 'same-origin', headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: json !== undefined ? JSON.stringify(json) : body });
  if (r.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.hash)}`; throw new Error('Ikke innlogget'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Feil ${r.status}`);
  return j;
}

/* ---------------- Lasting ---------------- */

const LOAD = {
  spar: () => api('/fin51/goals'),
  kal: () => api(`/fin51/calendar?days=${P.ui.days}`),
  skatt: () => api(`/fin51/tax${P.ui.year ? `?year=${P.ui.year}` : ''}`),
  pris: () => api(`/fin51/prices?sort=${P.ui.sort}${P.ui.q ? `&q=${encodeURIComponent(P.ui.q)}` : ''}`),
  jakt: () => api(`/fin51/hunter?weeks=${P.ui.weeks}`),
};
async function load(tab = P.tab, force = false) {
  if (P.busy[tab] || (!force && P.data[tab])) return;
  P.busy[tab] = true; P.err[tab] = null; paint();
  try { P.data[tab] = await LOAD[tab](); if (tab === 'skatt' && !P.ui.year) P.ui.year = P.data[tab].year; } catch (e) { P.err[tab] = e.message; }
  P.busy[tab] = false; paint();
}
let toastT;
function toast(msg) {
  let t = document.getElementById('p51-toast');
  if (!t) { t = document.createElement('div'); t.id = 'p51-toast'; t.className = 'p51-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
}

/* ---------------- Tegning ---------------- */

const hosts = () => [...document.querySelectorAll('[data-p51-host]')];
function paint() { for (const h of hosts()) { h.innerHTML = view(); h.dataset.p51On = '1'; } }
const card = (inner, cls = '') => `<section class="card p51-card ${cls}">${inner}</section>`;
const loading = () => '<div class="p51-skel" aria-busy="true"><span></span><span></span><span></span></div>';
const errBox = (t) => `<div class="p51-err" role="alert">${esc(P.err[t])} <button type="button" class="p51-lnk" data-p51="retry">Prøv igjen</button></div>`;
const bar = (pct, color = 'var(--acc)') => `<div class="p51-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><span style="width:${Math.max(0, Math.min(100, pct))}%;background:${esc(color)}"></span></div>`;

function view() {
  const tabs = `<nav class="p51-tabs" role="tablist" aria-label="Planlegging">${TABS.map(([k, n]) => `<button type="button" role="tab" aria-selected="${P.tab === k}" class="${P.tab === k ? 'on' : ''}" data-p51="tab" data-k="${k}">${n}</button>`).join('')}</nav>`;
  const t = P.tab, d = P.data[t];
  const body = P.err[t] && !d ? errBox(t) : !d ? loading() : { spar: sparView, kal: kalView, skatt: skattView, pris: prisView, jakt: jaktView }[t](d);
  return `<div class="p51-wrap">${tabs}<div class="p51-body" role="tabpanel">${body}</div></div>`;
}

/* --- Sparemål --- */
const STATUS = { done: ['Nådd', 'ok'], on_track: ['I rute', 'ok'], behind: ['Bak skjema', 'warn'], overdue: ['Fristen er ute', 'warn'], no_deadline: ['Uten frist', 'mut'] };
function goalForm(g = null, accs = []) {
  const v = g ?? { name: '', target: '', deadline: '', color: '#2f7a4f', accountId: '' };
  return `<form class="p51-form" data-p51f="${g ? 'goal-edit' : 'goal-new'}" ${g ? `data-id="${g.id}"` : ''}>
    <label>Navn<input name="name" required maxlength="60" value="${esc(v.name)}" placeholder="F.eks. Japan-tur"></label>
    <label>Målbeløp (kr)<input name="target" required inputmode="decimal" value="${esc(v.target)}" placeholder="30 000"></label>
    ${g ? '' : '<label>Allerede spart (kr)<input name="saved" inputmode="decimal" placeholder="0"></label>'}
    <label>Frist<input name="deadline" type="date" value="${esc(v.deadline ?? '')}"></label>
    <label>Følg en sparekonto<select name="accountId"><option value="">Nei – jeg registrerer innskudd selv</option>${accs.map((a) => `<option value="${a.id}"${String(a.id) === String(v.accountId ?? '') ? ' selected' : ''}>${esc(a.name)} (${kr(a.balance)})</option>`).join('')}</select></label>
    <label class="p51-col">Farge<input name="color" type="color" value="${esc(v.color ?? '#2f7a4f')}"></label>
    <div class="p51-row"><button class="p51-btn pri" type="submit">${g ? 'Lagre' : 'Lag sparemål'}</button><button class="p51-btn" type="button" data-p51="${g ? 'goal-edit-x' : 'goal-new-x'}">Avbryt</button></div></form>`;
}
function goalCard(g, accs) {
  if (P.ui.edit === g.id) return card(`<h3 class="p51-h">Endre «${esc(g.name)}»</h3>${goalForm(g, accs)}`, 'p51-goal');
  const [st, cls] = STATUS[g.status] ?? ['', 'mut'];
  const img = g.imageUrl ? `<img src="${esc(g.imageUrl)}" alt="" loading="lazy">` : `<span class="p51-gph" style="background:${esc(g.color)}" aria-hidden="true">${esc(g.name.slice(0, 1).toUpperCase())}</span>`;
  const dep = P.ui.dep === g.id ? `<form class="p51-dep" data-p51f="deposit" data-id="${g.id}"><input name="amount" inputmode="decimal" placeholder="Beløp (kr), minus for uttak" aria-label="Beløp" autofocus><button class="p51-btn pri" type="submit">Sett inn</button><button class="p51-btn" type="button" data-p51="dep-x">Avbryt</button></form>` : '';
  return card(`<div class="p51-gimg">${img}<label class="p51-gup" title="Bytt bilde"><input type="file" accept="image/jpeg,image/png,image/webp" data-p51-img="${g.id}" hidden>Bilde</label></div>
    <div class="p51-gtop"><div><h3 class="p51-h">${esc(g.name)}</h3><div class="p51-mut">${g.deadlineLabel ? `Frist ${esc(g.deadlineLabel)}` : 'Ingen frist'}${g.account ? ` · følger ${esc(g.account)}` : ''}</div></div><span class="p51-tag ${cls}">${st}</span></div>
    <div class="p51-gnum"><b>${kr(g.saved)}</b><span>av ${kr(g.target)} · ${nf(g.pct, g.pct % 1 ? 1 : 0)} %</span></div>
    ${bar(g.pct, g.color)}
    <div class="p51-note">${esc(g.statusText)}${g.pace > 0 ? ` · tempo ${kr(g.pace)}/mnd` : ''}</div>
    ${dep}
    <div class="p51-row">${g.followsAccount ? '' : `<button type="button" class="p51-btn" data-p51="dep" data-id="${g.id}">Sett inn</button>`}<button type="button" class="p51-btn" data-p51="goal-edit" data-id="${g.id}">Endre</button>${g.imageUrl ? `<button type="button" class="p51-btn" data-p51="img-del" data-id="${g.id}">Fjern bilde</button>` : ''}<button type="button" class="p51-btn red" data-p51="goal-del" data-id="${g.id}">Slett</button></div>`, 'p51-goal');
}
function sparView(d) {
  const ru = d.roundUp;
  const ruCard = card(`<div class="p51-gtop"><div><div class="p51-lab">Rund opp</div><h3 class="p51-h">${ru.count ? `${kr(ru.amount, ru.amount % 1 ? 2 : 0)} klar til sparing` : 'Ingenting å runde opp nå'}</h3></div>
      <label class="p51-mini">Rund til<select data-p51-ch="ru-step">${ru.steps.map((s) => `<option value="${s}"${s === ru.step ? ' selected' : ''}>${s} kr</option>`).join('')}</select></label></div>
    <div class="p51-note">${esc(ru.text)}. Kjøp fra ${esc(dl(ru.from))} til ${esc(dl(ru.until))} rundes opp til nærmeste ${ru.step} kr.</div>
    ${ru.sample.length ? `<ul class="p51-list sm">${ru.sample.map((x) => `<li><span>${esc(x.name)}<small>${esc(dl(x.date))} · ${kr(x.amount, 2)}</small></span><b class="pos">+${nf(x.roundUp, 2)} kr</b></li>`).join('')}</ul>` : ''}
    ${d.items.length ? `<div class="p51-row"><select data-p51-ch="ru-goal" aria-label="Sparemål for rund opp">${d.items.map((g) => `<option value="${g.id}"${g.id === ru.goalId ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select><button type="button" class="p51-btn pri" data-p51="ru-apply" ${ru.count ? '' : 'disabled'}>Sett inn ${kr(ru.amount, ru.amount % 1 ? 2 : 0)}</button></div>` : ''}`, 'p51-ru');
  const tot = d.items.length ? card(`<div class="p51-lab">Totalt spart</div><div class="p51-big">${kr(d.totals.saved)} <small>av ${kr(d.totals.target)}</small></div>${bar(d.totals.pct)}`, 'p51-tot') : '';
  const add = P.ui.newGoal ? card(`<h3 class="p51-h">Nytt sparemål</h3>${goalForm(null, d.accounts ?? [])}`) : `<button type="button" class="p51-add" data-p51="goal-new">+ Nytt sparemål</button>`;
  return `<div class="p51-grid2">${tot}${ruCard}</div>
    ${d.items.length ? '' : card('<h3 class="p51-h">Ingen sparemål ennå</h3><div class="p51-note">Lag et mål med beløp, frist og bilde. Glimt viser fremdriften og hvor mye du må spare i måneden, og foreslår å runde opp kjøpene dine til målet.</div>')}
    <div class="p51-goals">${d.items.map((g) => goalCard(g, d.accounts ?? [])).join('')}</div>${add}`;
}

/* --- Kalender --- */
const KIND = { sub: 'Abonnement', recurring: 'Fast utgift', detected: 'Funnet', income: 'Inntekt' };
function spark(series, w = 640, h = 120) {
  if (!series?.length) return '';
  const v = series.map((s) => s.balance), mn = Math.min(...v), mx = Math.max(...v), pad = Math.max(1, (mx - mn) * 0.12), lo = mn - pad, hi = mx + pad;
  const x = (i) => (i / Math.max(1, v.length - 1)) * w, y = (b) => h - 8 - ((b - lo) / (hi - lo || 1)) * (h - 16);
  const pts = v.map((b, i) => `${x(i).toFixed(1)},${y(b).toFixed(1)}`).join(' ');
  const zero = lo < 0 && hi > 0 ? `<line x1="0" x2="${w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="p51-zero"/>` : '';
  const minI = v.indexOf(Math.min(...v));
  return `<svg class="p51-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Saldo de neste ${v.length} dagene, lavest ${kr(v[minI])} ${dl(series[minI].date)}">${zero}<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${x(minI).toFixed(1)}" cy="${y(v[minI]).toFixed(1)}" r="3.5" class="p51-dot"/></svg>`;
}
function kalView(d) {
  const accs = d.accounts ?? [];
  const sel = P.ui.acc === 'all' ? null : accs.find((a) => String(a.id) === String(P.ui.acc)) ?? null;
  const all = accs.length ? accs[0].series.map((s, i) => ({ date: s.date, balance: accs.reduce((a, x) => a + (x.type === 'credit' ? 0 : x.series[i].balance), 0) })) : [];
  const series = sel ? sel.series : all;
  const start = sel ? sel.start : accs.filter((a) => a.type !== 'credit').reduce((s, a) => s + a.start, 0), end = series.at(-1)?.balance ?? start;
  const chips = `<div class="p51-chips" role="radiogroup" aria-label="Konto"><button type="button" role="radio" aria-checked="${!sel}" class="${!sel ? 'on' : ''}" data-p51="acc" data-k="all">Alle kontoer</button>${accs.map((a) => `<button type="button" role="radio" aria-checked="${sel?.id === a.id}" class="${sel?.id === a.id ? 'on' : ''}" data-p51="acc" data-k="${a.id}">${esc(a.name)}</button>`).join('')}</div>`;
  const dayRows = d.days.filter((x) => x.items.some((it) => !sel || it.accountId === sel.id) || x.today).map((x) => {
    const its = x.items.filter((it) => !sel || it.accountId === sel.id);
    const bal = series.find((s) => s.date === x.date)?.balance;
    return `<li class="p51-day${x.today ? ' today' : ''}"><div class="p51-dd"><b>${esc(x.label)}</b>${bal != null ? `<span class="${bal < 0 ? 'neg' : ''}">Saldo ${kr(bal)}</span>` : ''}</div>
      ${its.length ? `<ul>${its.map((it) => `<li><span>${esc(it.name)}<small>${KIND[it.kind] ?? ''}${it.account && !sel ? ` · ${esc(it.account)}` : ''}</small></span><b class="${it.amount > 0 ? 'pos' : ''}">${krS(it.amount)}</b></li>`).join('')}</ul>` : '<div class="p51-mut">Ingen trekk i dag</div>'}</li>`;
  }).join('');
  return `${card(`<div class="p51-gtop"><div><div class="p51-lab">Saldoprognose · ${esc(dl(d.from))}–${esc(dl(d.to))}</div><div class="p51-big">${kr(end)} <small>om ${d.days.length} dager (nå ${kr(start)})</small></div></div>
      <label class="p51-mini">Periode<select data-p51-ch="days">${[30, 60, 90].map((n) => `<option value="${n}"${n === P.ui.days ? ' selected' : ''}>${n} dager</option>`).join('')}</select></label></div>
    ${chips}${spark(series)}
    <div class="p51-kpis"><span>Ut <b>${kr(d.total.out)}</b></span><span>Inn <b class="pos">${kr(d.total.in)}</b></span><span>${d.total.count} trekk og innbetalinger</span>${d.lowest ? `<span>Lavest: <b class="${d.lowest.balance < 0 ? 'neg' : ''}">${kr(d.lowest.balance)}</b> ${esc(dl(d.lowest.date))} (${esc(d.lowest.account)})</span>` : ''}</div>
    ${d.warnings.map((w) => `<div class="p51-warn" role="alert">${esc(w)}</div>`).join('')}${d.unassigned ? `<div class="p51-note">${esc(d.unassigned.text)}</div>` : ''}`)}
    ${card(`<h3 class="p51-h">Neste ${d.days.length} dager</h3>${dayRows ? `<ul class="p51-days">${dayRows}</ul>` : '<div class="p51-note">Ingen faste trekk i perioden.</div>'}
      <div class="p51-mut">Kilder: abonnementer, faste utgifter, gjentakende trekk funnet i transaksjonene og inntekter som kommer hver måned. Samme tjeneste telles bare én gang.</div>`)}`;
}

/* --- Skatt --- */
const SRC = { transaksjoner: 'Fra transaksjonene', registrert: 'Registrert av deg', anslag: 'Anslag', mangler: 'Ikke funnet' };
function skattView(d) {
  const p = d.profile ?? {};
  const y0 = new Date().getFullYear();
  const years = [y0, y0 - 1, y0 - 2];
  const rem = d.reminder?.show ? `<div class="p51-rem" role="status"><b>Skattemeldingen</b> ${esc(d.reminder.text)} <a href="${esc(d.reminder.url)}" target="_blank" rel="noopener">skatteetaten.no ›</a></div>` : '';
  const rows = d.items.map((i) => `<li class="p51-tax"><div class="p51-gtop"><div><b>${esc(i.title)}</b><div class="p51-mut">${esc(i.note)}</div>${i.orgs?.length ? `<div class="p51-mut">${i.orgs.map((o) => `${esc(o.org)} ${kr(o.amount)}${o.counts ? '' : ' (under 500 kr)'}`).join(' · ')}</div>` : ''}${i.missing ? `<div class="p51-miss">${esc(i.missing)}</div>` : ''}</div>
    <div class="p51-taxn"><b>${kr(i.kind === 'skattefradrag' ? i.basis : i.deduction)}</b><small>${i.kind === 'skattefradrag' ? 'grunnlag' : 'fradrag'} · verdi ${kr(i.value)}</small><span class="p51-tag ${i.source === 'mangler' ? 'mut' : i.source === 'anslag' ? 'warn' : 'ok'}">${SRC[i.source] ?? esc(i.source)}</span></div></div>
    ${i.sources?.length ? `<details><summary>${i.sources.length} transaksjoner</summary><ul class="p51-list sm">${i.sources.map((t) => `<li><span>${esc(t.name)}<small>${esc(t.date)}</small></span><b>${kr(t.amount, 2)}</b></li>`).join('')}</ul></details>` : ''}</li>`).join('');
  const gifts = (p.gifts ?? []).map((g) => `${g.org}: ${g.amount}`).join('\n');
  const form = `<form class="p51-form" data-p51f="tax-profile">
    <label>Avstand til jobben, én vei (km)<input name="commuteKm" inputmode="decimal" value="${esc(p.commuteKm || '')}" placeholder="0"></label>
    <label>Arbeidsdager i året<input name="workDays" inputmode="numeric" value="${esc(p.workDays ?? 230)}"></label>
    <label>Renter på lån (kr, hvis ikke i transaksjonene)<input name="loanInterest" inputmode="decimal" value="${esc(p.loanInterest || '')}"></label>
    <label>Fagforening (kr, i tillegg til transaksjonene)<input name="union" inputmode="decimal" value="${esc(p.union || '')}"></label>
    <label>BSU-innskudd i året (kr)<input name="bsu" inputmode="decimal" value="${esc(p.bsu || '')}"></label>
    <label>IPS-innskudd i året (kr)<input name="ips" inputmode="decimal" value="${esc(p.ips || '')}"></label>
    <label class="p51-wide">Andre gaver (én per linje: «Organisasjon: beløp»)<textarea name="gifts" rows="3" placeholder="Leger Uten Grenser: 1000">${esc(gifts)}</textarea></label>
    <label class="p51-chk"><input type="checkbox" name="remind" ${p.remind !== false ? 'checked' : ''}> Påminnelse når skattemeldingen kommer (mars) og før fristen (april)</label>
    <div class="p51-row"><button class="p51-btn pri" type="submit">Lagre</button></div></form>`;
  return `${rem}${card(`<div class="p51-gtop"><div><div class="p51-lab">Skattehjelp · inntektsåret ${d.year}</div><div class="p51-big">${kr(d.total.value)} <small>anslått skatteverdi av ${kr(d.total.deduction)} i fradrag</small></div></div>
      <label class="p51-mini">År<select data-p51-ch="year">${years.map((y) => `<option value="${y}"${y === d.year ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div>
    <div class="p51-disc"><b>Forbehold:</b> ${esc(d.disclaimer)}${d.ratesNote ? ` ${esc(d.ratesNote)}` : ''}</div>
    <div class="p51-row"><a class="p51-btn" href="${BASE}/fin51/tax/export.csv?year=${d.year}" download>Last ned CSV</a><a class="p51-btn" href="${BASE}/fin51/tax/export.html?year=${d.year}" target="_blank" rel="noopener">Utskrift / PDF</a></div>`)}
    ${card(`<h3 class="p51-h">Fradragsposter</h3><ul class="p51-taxes">${rows}</ul>`)}
    ${card(`<h3 class="p51-h">Det du vet best selv</h3><div class="p51-note">Brukes i anslaget for ${d.year}. Lagres bare for deg.</div>${form}`)}`;
}

/* --- Priser --- */
function prisChart(points) {
  if (!points?.length) return '';
  const w = 560, h = 120, v = points.map((p) => p.price), lo = Math.min(...v) * 0.95, hi = Math.max(...v) * 1.05;
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points.at(-1).date) || t0 + 1;
  const x = (d) => ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (w - 20) + 10, y = (p) => h - 10 - ((p - lo) / (hi - lo || 1)) * (h - 20);
  const stores = [...new Set(points.map((p) => p.store))];
  const cls = (s) => `s${stores.indexOf(s) % 5}`;
  return `<svg class="p51-pchart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pris over tid">${stores.map((s) => { const ps = points.filter((p) => p.store === s); return `<polyline class="${cls(s)}" points="${ps.map((p) => `${x(p.date).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ')}" fill="none" stroke-width="2"/>${ps.map((p) => `<circle class="${cls(s)}" cx="${x(p.date).toFixed(1)}" cy="${y(p.price).toFixed(1)}" r="3"><title>${esc(s)} ${esc(p.date)}: ${nf(p.price, 2)} kr</title></circle>`).join('')}`; }).join('')}</svg>
    <div class="p51-legend">${stores.map((s) => `<span class="${cls(s)}">${esc(s)}</span>`).join('')}</div>`;
}
function prisView(d) {
  const b = d.basket;
  const head = card(`<div class="p51-lab">Billigste butikk for det du kjøper</div><h3 class="p51-h">${esc(b.text)}</h3>
    ${b.stores.length ? `<ul class="p51-list sm">${b.stores.map((s, i) => `<li><span>${esc(s.store)}<small>${s.items} varer sammenlignet · billigst på ${s.cheapestFor}</small></span><b class="${i ? '' : 'pos'}">${i ? `+${s.index - b.stores[0].index} %` : 'billigst'}</b></li>`).join('')}</ul>` : ''}
    <div class="p51-mut">${d.receipts} kvitteringer · ${d.count} varer · ${d.raised} har økt minst 5 %</div>`);
  const tools = `<form class="p51-tools" data-p51f="pris-q"><input name="q" type="search" value="${esc(P.ui.q)}" placeholder="Søk etter vare eller butikk" aria-label="Søk etter vare eller butikk"><select data-p51-ch="sort" aria-label="Sorter">${[['change', 'Mest økt'], ['count', 'Mest kjøpt'], ['name', 'Navn']].map(([k, n]) => `<option value="${k}"${k === P.ui.sort ? ' selected' : ''}>${n}</option>`).join('')}</select></form>`;
  const rows = d.items.map((i) => {
    const open = P.ui.open === i.key;
    const det = open ? (P.data.prisItem?.key === i.key ? `<div class="p51-pdet">${prisChart(P.data.prisItem.points)}<ul class="p51-list sm">${i.stores.map((s) => `<li><span>${esc(s.store)}<small>sist ${esc(dl(s.lastDate))} · laveste ${nf(s.min, 2)} kr · ${s.count} kjøp</small></span><b>${nf(s.last, 2)} kr</b></li>`).join('')}</ul></div>` : loading()) : '';
    return `<li class="p51-pr${open ? ' open' : ''}"><button type="button" class="p51-prb" data-p51="pris-open" data-k="${esc(i.key)}" aria-expanded="${open}"><span><b>${esc(i.name)}</b><small>${nf(i.last.price, 2)} kr/${esc(i.unit)} · ${esc(i.last.store)} · ${i.count} kjøp</small></span>
      <span class="p51-prr"><span class="${i.changePct >= 1 ? 'neg' : i.changePct <= -1 ? 'pos' : 'p51-mut'}">${esc(i.changeText)}</span>${i.cheapest ? `<small>Billigst: ${esc(i.cheapest.store)} ${nf(i.cheapest.price, 2)} kr (−${i.cheapest.savingPct} %)</small>` : ''}</span></button>${det}</li>`;
  }).join('');
  return `${head}${card(`${tools}${rows ? `<ul class="p51-prices">${rows}</ul>` : `<div class="p51-note">${P.ui.q ? 'Ingen varer passer søket.' : 'Ingen varelinjer ennå. Skann kvitteringer med varelinjer, så følger FinansHub prisene for deg.'}</div>`}`)}`;
}

/* --- Abonnementsjeger --- */
const FK = { price_up: ['Prisøkning', 'warn'], double: ['Dobbelt', 'warn'], unused: ['Ubrukt', 'mut'] };
function jaktView(d) {
  const draft = P.ui.draft;
  const items = d.findings.map((f) => {
    const [lab, cls] = FK[f.kind] ?? ['', 'mut'];
    const sid = f.subId ?? (f.subIds?.length ? f.subIds.at(-1) : null);
    const dr = draft && draft.key === f.key ? `<div class="p51-draft">${draft.busy ? '<div class="p51-note">Skriver med den lokale modellen …</div>' : `<label>Emne<input readonly value="${esc(draft.subject)}"></label><label>Tekst<textarea rows="9" data-p51-draft>${esc(draft.text)}</textarea></label>
      <div class="p51-mut">${draft.engine === 'lokal' ? `Skrevet av lokal modell (${esc(draft.model ?? '')})` : 'Mal'}${draft.notice ? ` · ${esc(draft.notice)}` : ''}. ${esc(draft.note)}</div>
      <div class="p51-row"><button type="button" class="p51-btn pri" data-p51="draft-copy">Kopier</button><button type="button" class="p51-btn" data-p51="draft-x">Lukk</button></div>`}</div>` : '';
    return `<li class="p51-find"><div class="p51-gtop"><div><span class="p51-tag ${cls}">${lab}</span><h3 class="p51-h">${esc(f.title)}</h3><div class="p51-note">${esc(f.text)}</div></div>${f.saving ? `<div class="p51-taxn"><b>${kr(f.saving)}</b><small>per mnd å spare</small></div>` : ''}</div>
      <div class="p51-row">${f.kind === 'unused' && f.subId ? `<button type="button" class="p51-btn" data-p51="used" data-id="${f.subId}">Jeg bruker den</button>` : ''}${sid ? `<button type="button" class="p51-btn" data-p51="draft" data-id="${sid}" data-key="${esc(f.key)}">Skriv oppsigelse</button>` : ''}<button type="button" class="p51-btn" data-p51="dismiss" data-key="${esc(f.key)}">Skjul</button></div>${dr}</li>`;
  }).join('');
  return `${card(`<div class="p51-gtop"><div><div class="p51-lab">Abonnementsjeger</div><div class="p51-big">${kr(d.summary.monthlySaving)} <small>per måned å spare (${kr(d.summary.yearlySaving)} i året)</small></div></div>
      <label class="p51-mini">Ubrukt etter<select data-p51-ch="weeks">${[4, 6, 8, 12].map((w) => `<option value="${w}"${w === d.weeks ? ' selected' : ''}>${w} uker</option>`).join('')}</select></label></div>
    <div class="p51-note">${esc(d.summary.text)}. ${esc(d.signals.note)}</div>${d.summary.dismissed ? `<button type="button" class="p51-lnk" data-p51="undismiss">Vis ${d.summary.dismissed} skjulte igjen</button>` : ''}`)}
    ${items ? `<ul class="p51-finds">${items}</ul>` : card('<div class="p51-note">Ingen funn akkurat nå. Glimt ser etter prisøkninger i banktrekkene, doble abonnementer og abonnementer uten bruk.</div>')}
    <div class="p51-mut p51-foot">Oppsigelsesteksten skrives av en lokal modell på hjemmeserveren og sendes aldri automatisk.</div>`;
}

/* ---------------- Hendelser ---------------- */

const reload = (t = P.tab) => { P.data[t] = null; return load(t, true); };
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace('−', '-').replace(',', '.')); return Number.isFinite(n) ? n : null; };
async function onClick(e) {
  const b = e.target.closest('[data-p51]');
  if (!b || !e.currentTarget.contains(b)) return;
  const a = b.dataset.p51, id = +b.dataset.id;
  try {
    if (a === 'tab') { P.tab = b.dataset.k; try { localStorage.setItem('fin51_tab', P.tab); } catch { /* */ } if (document.body.dataset.p51Page) history.replaceState(null, '', `#${P.tab}`); paint(); return load(); }
    if (a === 'retry') return reload();
    if (a === 'goal-new') { P.ui.newGoal = true; return paint(); }
    if (a === 'goal-new-x') { P.ui.newGoal = false; return paint(); }
    if (a === 'goal-edit') { P.ui.edit = id; return paint(); }
    if (a === 'goal-edit-x') { P.ui.edit = null; return paint(); }
    if (a === 'dep') { P.ui.dep = id; paint(); document.querySelector('.p51-dep input')?.focus(); return; }
    if (a === 'dep-x') { P.ui.dep = null; return paint(); }
    if (a === 'goal-del') { if (!confirm('Slette sparemålet?')) return; await api(`/fin51/goals/${id}`, { method: 'DELETE' }); toast('Sparemålet er slettet'); return reload('spar'); }
    if (a === 'img-del') { await api(`/fin51/goals/${id}/image`, { method: 'DELETE' }); return reload('spar'); }
    if (a === 'ru-apply') { const g = document.querySelector('[data-p51-ch="ru-goal"]')?.value; const r = await api('/fin51/roundup/apply', { method: 'POST', json: { goalId: g ? +g : undefined } }); toast(r.applied.transferHint ?? `${kr(r.applied.amount, 2)} satt inn på «${r.goal.name}»`); return reload('spar'); }
    if (a === 'acc') { P.ui.acc = b.dataset.k; return paint(); }
    if (a === 'pris-open') {
      const k = b.dataset.k;
      if (P.ui.open === k) { P.ui.open = null; return paint(); }
      P.ui.open = k; paint();
      P.data.prisItem = await api(`/fin51/prices/item?key=${encodeURIComponent(k)}`); return paint();
    }
    if (a === 'used') { await api('/fin51/hunter/used', { method: 'POST', json: { subId: id } }); toast('Merket som brukt'); return reload('jakt'); }
    if (a === 'dismiss') { await api('/fin51/hunter/dismiss', { method: 'POST', json: { key: b.dataset.key } }); return reload('jakt'); }
    if (a === 'undismiss') { await api('/fin51/hunter/dismiss', { method: 'DELETE' }); return reload('jakt'); }
    if (a === 'draft') {
      P.ui.draft = { key: b.dataset.key, busy: true }; paint();
      const r = await api('/fin51/hunter/draft', { method: 'POST', json: { subId: id } }).catch((err) => { P.ui.draft = null; throw err; });
      P.ui.draft = { key: b.dataset.key, ...r }; return paint();
    }
    if (a === 'draft-copy') { const t = document.querySelector('[data-p51-draft]')?.value ?? P.ui.draft?.text ?? ''; await navigator.clipboard?.writeText(`${P.ui.draft?.subject ?? ''}\n\n${t}`); toast('Kopiert – lim inn i e-post eller kontaktskjema'); return; }
    if (a === 'draft-x') { P.ui.draft = null; return paint(); }
  } catch (err) { toast(err.message); paint(); }
}
async function onChange(e) {
  const s = e.target.closest('[data-p51-ch]'), f = e.target.closest('[data-p51-img]');
  try {
    if (f && f.files?.[0]) {
      const file = f.files[0];
      if (file.size > 4 * 1024 * 1024) return toast('Bildet kan være maks 4 MB');
      await api(`/fin51/goals/${f.dataset.p51Img}/image`, { method: 'PUT', body: file, headers: { 'content-type': file.type || 'application/octet-stream' } });
      toast('Bildet er lagret'); return reload('spar');
    }
    if (!s) return;
    const k = s.dataset.p51Ch, v = s.value;
    if (k === 'ru-step') { await api('/fin51/roundup', { method: 'PUT', json: { step: +v } }); return reload('spar'); }
    if (k === 'ru-goal') { await api('/fin51/roundup', { method: 'PUT', json: { goalId: +v } }); return reload('spar'); }
    if (k === 'days') { P.ui.days = +v; return reload('kal'); }
    if (k === 'year') { P.ui.year = +v; return reload('skatt'); }
    if (k === 'sort') { P.ui.sort = v; return reload('pris'); }
    if (k === 'weeks') { P.ui.weeks = +v; return reload('jakt'); }
  } catch (err) { toast(err.message); }
}
async function onSubmit(e) {
  const f = e.target.closest('[data-p51f]');
  if (!f) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f).entries()), k = f.dataset.p51f;
  try {
    if (k === 'goal-new' || k === 'goal-edit') {
      const body = { name: v.name, target: num(v.target), deadline: v.deadline || null, color: v.color, accountId: v.accountId ? +v.accountId : null, ...(v.saved ? { saved: num(v.saved) } : {}) };
      if (!body.name || !body.target) return toast('Navn og målbeløp må fylles ut');
      if (k === 'goal-new') { await api('/fin51/goals', { method: 'POST', json: body }); P.ui.newGoal = false; toast('Sparemålet er laget'); }
      else { await api(`/fin51/goals/${f.dataset.id}`, { method: 'PATCH', json: body }); P.ui.edit = null; }
      return reload('spar');
    }
    if (k === 'deposit') {
      const amt = num(v.amount);
      if (!amt) return toast('Skriv et beløp');
      await api(`/fin51/goals/${f.dataset.id}/deposit`, { method: 'POST', json: { amount: amt } }); P.ui.dep = null; toast(amt > 0 ? `${kr(amt, amt % 1 ? 2 : 0)} satt inn` : `${kr(-amt)} tatt ut`); return reload('spar');
    }
    if (k === 'tax-profile') {
      const gifts = String(v.gifts ?? '').split('\n').map((l) => l.split(':')).filter((x) => x.length >= 2).map(([org, ...rest]) => ({ org: org.trim(), amount: num(rest.join(':')) })).filter((g) => g.org && g.amount > 0);
      await api('/fin51/tax/profile', { method: 'PUT', json: { commuteKm: num(v.commuteKm) ?? 0, workDays: num(v.workDays) ?? 230, loanInterest: num(v.loanInterest) ?? 0, union: num(v.union) ?? 0, bsu: num(v.bsu) ?? 0, ips: num(v.ips) ?? 0, gifts, remind: !!v.remind } });
      toast('Lagret'); return reload('skatt');
    }
    if (k === 'pris-q') { P.ui.q = String(v.q ?? '').trim(); return reload('pris'); }
  } catch (err) { toast(err.message); }
}

/* ---------------- Montering ---------------- */

function mount(h) {
  if (h.dataset.p51Bound) { h.innerHTML = view(); return; }
  h.dataset.p51Bound = '1';
  h.addEventListener('click', onClick);
  h.addEventListener('change', onChange);
  h.addEventListener('submit', onSubmit);
  h.innerHTML = view();
  load();
}
/** Desktop (modules.js): siden «Planlegging» i FinansHub. Innholdet monteres av modulen selv. */
export function plan51Page() { return `<div class="p51 p51-desk" data-p51-host>${view()}</div>`; }
export const PLAN51_ICON = 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M8 14h3M13 14h3M8 17h3';

function scan() { for (const h of document.querySelectorAll('[data-p51-host]')) if (!h.dataset.p51Bound) mount(h); }
const mo = new MutationObserver(() => scan());
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { scan(); mo.observe(document.body, { childList: true, subtree: true }); });
else { scan(); mo.observe(document.body, { childList: true, subtree: true }); }
// Egen side (/finans/plan51): tema som i FinansHub (lys / mørk / glød), ellers systemets.
if (document.body?.dataset.p51Page || document.documentElement.dataset.p51Page) {
  const h = document.documentElement;
  let d = null;
  try { d = localStorage.getItem('fh_design'); } catch { /* */ }
  if (!['lys', 'mork', 'glod'].includes(d)) d = matchMedia('(prefers-color-scheme: dark)').matches ? 'mork' : 'lys';
  h.setAttribute('data-theme', d);
  window.addEventListener('hashchange', () => { const t = location.hash.replace(/^#\/?/, ''); if (TABS.some(([k]) => k === t) && t !== P.tab) { P.tab = t; paint(); load(); } });
}
