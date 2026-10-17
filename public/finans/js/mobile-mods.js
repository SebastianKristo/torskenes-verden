// Moduler i mobilappen («Andre OS»): Matplan, Domener, Subscription OS, Delte mapper og Finn-handler.
// Hver modul fyller hele skjermen og henter fra sitt eget API. Feiler API-et, vises en lenke til desktop-siden.
import { api, esc, n0, n2, dd, dWeek, today, icon, logo, aiLine, matApi, domApi, parseAmount, navName } from './core.js';
import { m, draw, flash, avatar, backBtn } from './mobile.js';

export const MODS = [
  ['mat', 'Matplan', 'Ukemeny, kokk og handleliste', 'mat'],
  ['dom', 'Domener', 'Trafikk, besøk, ytelse og sikkerhet', 'globe'],
  ['sub', 'Subscription OS', 'Abonnementer og trekk', 'sub'],
  ['dir', 'Boliger', 'Utgifter, prosjekter og regninger', 'dir'],
  ['finn', 'Finn-handler', 'Trygg betaling, Fiks ferdig, Tillit', 'finn'],
];
const D = { mat: null, sub: null, dirs: null, dir: {}, finn: null, err: {}, users: null, subAdd: false, subF: { name: '', price: '', cycle: 'monthly', nextDate: '' }, dirAdd: false, dirF: { name: '', type: 'Hytte', address: '' } };
const desk = { sub: 'sub', dir: 'dir', finn: 'finn', mat: null, dom: null };
const isIos = (th) => th === 'ios';
const gl = (th, c = 'glass2') => (isIos(th) ? c : '');

// Subscription OS, Delte mapper og Finn-handler ligger under Finans → Mer og får en tilbakeknapp dit.
function head(th, title, right = '') {
  const back = ['sub', 'dir', 'finn'].includes(m.screen) && !m.sub ? `<div class="m-row">${backBtn(th, '#/mer', 'Tilbake til Mer')}</div>` : '';
  return `${back}<div class="m-row" style="justify-content:space-between;padding:6px 4px 0;gap:10px"><div class="title m-ell">${esc(title)}</div><span class="m-row" style="gap:8px">${right}${avatar()}</span></div>`;
}
function failed(th, key, title) {
  const href = desk[key] ? `/finans/?desktop=1#/${desk[key]}` : key === 'mat' ? '/#/matplan' : '/#/domener';
  return `${head(th, title)}<div class="m-empty">${esc(D.err[key])}</div><a class="cta ${gl(th, 'glass')}" href="${href}"><span class="m-grow"><b style="font-weight:600">Åpne på en større skjerm</b><br><span style="font-size:13px;opacity:.7">Fullversjonen i nettleseren</span></span><span style="opacity:.6">›</span></a>`;
}
const kpis = (th, list) => `<div class="kpis">${list.map(([l, v, hi]) => `<div class="kpi ${gl(th)}${hi ? ' hi' : ''}"><span>${l}</span><b class="m-mono">${v}</b></div>`).join('')}</div>`;
const sec = (t) => `<div class="sec">${t}</div>`;
const listBox = (th, inner) => `<div class="list ${gl(th)}">${inner}</div>`;

/* ---------- Lasting ---------- */

export async function modLoad(key, sub) {
  D.err[key] = '';
  try {
    if (key === 'mat') D.mat = await matApi('/week');
    else if (key === 'sub') D.sub = await api('/subscriptions');
    else if (key === 'finn') D.finn = await api('/finn');
    else if (key === 'dir') { D.dirs = await api('/folders'); if (sub) { D.dir[sub] = await api(`/folders/${encodeURIComponent(sub)}`); D.users ??= await api('/users').catch(() => []); } }
    else if (key === 'dom') await domLoad();
  } catch (e) { D.err[key] = `${MODS.find(([k]) => k === key)?.[1] ?? 'Modulen'} er ikke tilgjengelig: ${e.message}`; }
}

export function modView(key, th, sub) {
  const title = navName(key, MODS.find(([k]) => k === key)?.[1] ?? '');
  if (D.err[key]) return failed(th, key, title);
  if (key === 'mat') return mat(th);
  if (key === 'dom') return domView(th);
  if (key === 'sub') return subs(th);
  if (key === 'finn') return finn(th);
  if (key === 'dir') return sub ? folder(th, sub) : folders(th);
  return '';
}

/* ---------- Matplan ---------- */

const SRC = { gemini: ['Gemini', '#FFB08A', 'rgba(255,122,61,.15)'], hellofresh: ['HelloFresh', '#C2E27A', 'rgba(145,193,30,.18)'], fixed: ['Fast', '#9FE3C6', '#1F3A2F'], own: ['Egen', '#A9C3FF', 'rgba(122,167,255,.15)'] };
function mat(th) {
  const w = D.mat;
  if (!w) return `${head(th, 'Matplan')}<div class="m-spin"></div>`;
  const td = today();
  return `${head(th, 'Matplan')}
    <div class="m-row" style="gap:8px;flex-wrap:wrap"><button class="pri-b" data-mat="plan" style="flex:1">✦ Ny ukeplan med Gemini</button></div>
    <div style="font-size:13px;opacity:.7;padding:0 4px">Ukekost ca. ${n0(w.weekCost ?? 0)} kr · Automatisk hver søndag: ${w.auto ? 'på' : 'av'}</div>
    ${listBox(th, (w.days ?? []).map((d) => { const [n, c, bg] = SRC[d.source] ?? SRC.own; return `<div class="opt-row day${d.date === td ? ' today' : ''}"><span class="m-grow"><span class="s" style="text-transform:capitalize">${esc(d.weekday ?? dWeek(d.date))}${d.cook ? ` · ${esc(d.cook)}` : ''}</span><b class="m-ell" style="display:block;font-weight:500">${esc(d.name || '–')}</b><em class="src" style="color:${c};background:${bg}">${n}${d.fixed ? ' · fast' : ''}</em></span><span class="m-mono" style="opacity:.8">${d.cost ? n0(d.cost) + ' kr' : ''}</span><button class="mini" data-mat="day" data-date="${d.date}" aria-label="Ny rett for dagen">✦</button></div>`; }).join('') || '<div class="m-empty">Ingen plan ennå.</div>')}
    ${(w.shopping ?? []).length ? `${sec('Handleliste')}${listBox(th, w.shopping.map((x) => `<button class="opt-row" data-shop="${esc(x.id)}"><span class="chk${x.done ? ' on' : ''}">${x.done ? '✓' : ''}</span><span class="m-grow" style="${x.done ? 'text-decoration:line-through;opacity:.5' : ''}">${esc(x.text)}</span></button>`).join(''))}` : ''}`;
}

/* ---------- Subscription OS ---------- */

const CYCLE = { monthly: ['Månedlig', '/mnd'], yearly: ['Årlig', '/år'], biennial: ['Hvert 2. år', '/2 år'] };
function subs(th) {
  const s = D.sub;
  if (!s) return `${head(th, navName('sub', 'Subscription OS'))}<div class="m-spin"></div>`;
  const items = s.items ?? [];
  const f = D.subF, cyc = (k, n) => `<button class="chip" type="button" data-subcyc="${k}" aria-pressed="${f.cycle === k}">${n}</button>`;
  const form = D.subAdd ? `${sec('Nytt abonnement')}<form class="${isIos(th) ? 'list glass2' : 'fields'}" data-subform>
      <label class="field">${isIos(th) ? '<span>Tjeneste</span>' : 'Tjeneste'}<input name="name" id="m-sub-name" value="${esc(f.name)}" placeholder="f.eks. Disney+" required></label>
      <label class="field">${isIos(th) ? '<span>kr per trekk</span>' : 'kr per trekk'}<input name="price" id="m-sub-price" value="${esc(f.price)}" inputmode="decimal" class="m-mono" placeholder="149" required></label>
      <div class="opt-row col"><span style="font-size:13px;opacity:.7">Trekkes</span><div class="schips">${cyc('monthly', 'Månedlig')}${cyc('yearly', 'Årlig')}${cyc('biennial', 'Hvert 2. år')}</div></div>
      <label class="field">${isIos(th) ? '<span>Neste trekk</span>' : 'Neste trekk'}<input name="nextDate" id="m-sub-next" value="${esc(f.nextDate)}" placeholder="dd.mm"></label>
      <div style="padding:${isIos(th) ? '10px 12px' : '0'};display:flex;gap:8px"><button class="pri-b" type="submit" style="flex:1">Legg til</button><button class="sec-b" type="button" data-subadd="0" style="flex:1">Avbryt</button></div></form>
      <div class="snote">2-årige abonnementer regnes om: 1 200 kr hvert 2. år blir 50 kr/mnd og 600 kr/år.</div>` : '';
  return `${head(th, navName('sub', 'Abonnementer'), D.subAdd ? '' : '<button class="tonal" data-subadd="1">+ Nytt</button>')}
    ${kpis(th, [['Per måned', `${n0(s.monthly ?? 0)} kr`], ['Per år', `${n0(s.yearly ?? 0)} kr`], ['Lite brukt', `${n0(s.lowUse ?? 0)} kr`, true]])}
    ${form}
    ${listBox(th, items.map((x) => {
      const [cl, per] = CYCLE[x.cycle] ?? CYCLE.monthly;
      const st = !x.active ? ['Sagt opp', 'off'] : x.lowUse ? ['Si opp', 'warn'] : ['Aktiv', 'ok'];
      return `<div class="item sub-row${x.active ? '' : ' dim'}">${logo({ ...x, description: x.name }, 40, isIos(th) ? 20 : 12)}
        <span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(x.name)}${x.plan ? ` <span style="opacity:.6;font-weight:400">· ${esc(x.plan)}</span>` : ''}</span>${aiLine(x.aiShort, 'm-ell ai')}<span class="m-ell s">${cl}${x.nextDate ? ` · neste ${dd(x.nextDate)}` : ''}${x.usageNote ? ` · ${esc(x.usageNote)}` : ''}</span></span>
        <span style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="m-mono" style="font-weight:600">${n0(x.price)} kr<small style="opacity:.6">${per}</small></span><button class="stchip ${st[1]}" data-subtog="${x.id}" aria-label="${x.active ? 'Si opp' : 'Gjenoppta'} ${esc(x.name)}">${st[0]}</button></span></div>`;
    }).join('') || '<div class="m-empty">Ingen abonnementer ennå. Legg dem til på en større skjerm, eller fra en kvittering.</div>')}
    <div style="font-size:12px;opacity:.55;text-align:center;padding:4px 10px">Trykk på status for å si opp eller gjenoppta.</div>`;
}

/* ---------- Delte mapper (boliger) ---------- */

const ROLE = { owner: 'Eier', editor: 'Kan redigere', edit: 'Kan redigere', viewer: 'Kan se', view: 'Kan se', member: 'Medlem' };
function folders(th) {
  const list = D.dirs;
  if (!list) return `${head(th, navName('dir', 'Boliger'))}<div class="m-spin"></div>`;
  const f = D.dirF;
  const form = D.dirAdd ? `${sec('Ny bolig')}<form class="${isIos(th) ? 'list glass2' : 'fields'}" data-dirnew>
      <label class="field">${isIos(th) ? '<span>Navn</span>' : 'Navn'}<input name="name" value="${esc(f.name)}" placeholder="f.eks. Hytta Geilo" required></label>
      <div class="opt-row col"><span style="font-size:13px;opacity:.7">Type</span><div class="schips">${['Enebolig', 'Leilighet', 'Hytte', 'Utleie', 'Annet'].map((t) => `<button class="chip" type="button" data-dirtype="${t}" aria-pressed="${f.type === t}">${t}</button>`).join('')}</div></div>
      <label class="field">${isIos(th) ? '<span>Adresse</span>' : 'Adresse'}<input name="address" value="${esc(f.address)}" placeholder="Valgfritt"></label>
      <div style="padding:${isIos(th) ? '10px 12px' : '0'};display:flex;gap:8px"><button class="pri-b" type="submit" style="flex:1">Opprett</button><button class="sec-b" type="button" data-diradd="0" style="flex:1">Avbryt</button></div></form>
      <div class="snote">Del boligen med andre brukere etterpå. Nye brukere legges til av admin i Homelab → Innstillinger → Innlogging.</div>` : '';
  return `${head(th, navName('dir', 'Boliger'), D.dirAdd ? '' : '<button class="tonal" data-diradd="1">+ Ny</button>')}
    <div style="font-size:14px;opacity:.7;padding:0 4px;margin-top:-6px">Utgifter til bolig, hytte og utleie</div>${form}
    ${list.length ? list.map((f) => `<a class="fold ${gl(th, 'glass')}" href="#/dir/${f.id}"><span class="fold-ic">${icon('dir', 22)}</span><span class="m-grow"><b class="m-ell" style="font-weight:600">${esc(f.name)}</b><span class="m-ell s">${[f.type, f.address].filter(Boolean).map(esc).join(' · ') || `${(f.members ?? []).length} medlemmer`}</span></span><span class="m-mono" style="font-weight:600">${n0(f.total ?? 0)} kr</span></a>`).join('') : '<div class="m-empty">Ingen boliger ennå. Trykk «+ Ny» for å opprette en.</div>'}`;
}
function folder(th, id) {
  const f = D.dir[id];
  if (!f) return `${head(th, navName('dir', 'Boliger'))}<div class="m-spin"></div>`;
  const back = backBtn(th, '#/dir', 'Tilbake til Boliger');
  const role = f.myRole ?? f.role;
  const ro = f.canEdit === false || ['viewer', 'view', 'Kan se'].includes(role);
  const members = f.members ?? [];
  const bal = f.balances ?? [];
  const projects = f.projects ?? [], bills = f.bills ?? [];
  return `<div class="m-row">${back}</div>${head(th, f.name)}
    <div style="font-size:14px;opacity:.7;padding:0 4px">${[f.type, f.address, `${members.length} medlemmer`].filter(Boolean).map(esc).join(' · ')}</div>
    ${kpis(th, [['Totalt', `${n0(f.total ?? 0)} kr`], ['Poster', String(f.count ?? (f.entries ?? []).length)], ...(projects.length ? [['Prosjekter', String(projects.length)]] : [])])}
    ${bal.length ? `${sec('Saldo')}<div class="bchips" style="padding:0 2px">${bal.map((b) => `<em class="${b.balance >= 0 ? 'pos' : 'negb'}">${esc(b.name)} ${b.balance >= 0 ? '+' : '−'}${n0(Math.abs(b.balance))} kr</em>`).join('')}</div>` : ''}
    ${projects.length ? `${sec('Prosjekter')}${listBox(th, projects.map((p) => { const used = p.used ?? p.paid ?? 0, bud = p.budget ?? 0; return `<div class="opt-row" style="flex-direction:column;align-items:stretch;gap:8px"><span class="m-row" style="justify-content:space-between"><b style="font-weight:500">${esc(p.name)}</b><span class="m-mono">${n0(used)} / ${n0(bud)} kr</span></span>${p.vendor ? `<span class="s" style="opacity:.65;font-size:13px">${esc(p.vendor)}</span>` : ''}<span class="m-bar" style="height:6px;background:rgba(255,255,255,.12)"><i style="width:${bud ? Math.min(100, (used / bud) * 100) : 0}%;background:var(--m-acc)"></i></span><span style="font-size:12.5px;opacity:.65">${used >= bud && bud ? 'Betalt ✓' : `${n0(Math.max(0, bud - used))} kr igjen`}</span>${(p.installments ?? []).map((i) => `<span class="m-row" style="justify-content:space-between;gap:8px;font-size:13.5px"><span class="m-ell">${esc(i.label ?? 'Avdrag')}${i.due ? ` · ${dd(i.due)}` : ''}</span><span class="m-row" style="gap:8px"><span class="m-mono">${n0(i.amount)} kr</span>${i.paid ? '<em class="stchip ok" style="cursor:default">Betalt</em>' : ro ? '<em class="stchip warn" style="cursor:default">Forfaller</em>' : `<button class="stchip warn" data-dirpay="${i.id}">Registrer betalt</button>`}</span></span>`).join('')}</div>`; }).join(''))}` : ''}
    ${bills.length ? `${sec('Faste regninger')}${listBox(th, bills.map((b) => `<div class="opt-row"><span class="m-grow"><b style="font-weight:500">${esc(b.name)}</b><br><span style="font-size:13px;opacity:.65">${[b.freq ?? b.frequency, b.payer ? `betales av ${b.payer}` : ''].filter(Boolean).map(esc).join(' · ')}</span></span><span class="m-mono" style="opacity:.8">${b.nextDue ?? b.next_due ? `neste ${dd(b.nextDue ?? b.next_due)}` : ''}</span></div>`).join(''))}` : ''}
    ${sec('Utgifter')}
    ${listBox(th, (f.entries ?? []).map((e) => `<div class="item">${logo(e, 40, isIos(th) ? 20 : 12)}<span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(e.description)}</span>${aiLine(e.aiShort, 'm-ell ai')}<span class="m-ell s">${dd(e.date)}${e.paidBy ? ` · betalt av ${esc(e.paidBy)}` : ''}${e.split ? ` · ${esc(e.split)}` : ''}</span></span><span class="m-mono" style="font-weight:600">${n2(e.amount)}</span></div>`).join('') || '<div class="m-empty">Ingen utgifter ennå.</div>')}
    ${ro ? '<div class="m-empty">Du har lesetilgang. Be en eier om redigeringstilgang for å legge til utgifter.</div>' : `${sec('Legg til utgift')}
    <form class="${isIos(th) ? 'list glass2' : 'fields'}" data-dirform="${esc(String(f.id))}">
      <label class="field">${isIos(th) ? '<span>Beskrivelse</span>' : 'Beskrivelse'}<input name="description" required placeholder="F.eks. Vannregning"></label>
      <label class="field">${isIos(th) ? '<span>Beløp</span>' : 'Beløp'}<input name="amount" inputmode="decimal" required placeholder="0,00" class="m-mono"></label>
      <label class="field">${isIos(th) ? '<span>Betalt av</span>' : 'Betalt av'}<select name="paidBy">${members.map((x) => `<option>${esc(x.name ?? x.username)}</option>`).join('')}</select></label>
      <div style="padding:${isIos(th) ? '10px 12px' : '0'}"><button class="pri-b" type="submit" style="width:100%;height:50px">Legg til</button></div>
    </form>`}
    ${sharing(th, f)}`;
}
// Deling: eier bytter rolle (Kan se ↔ Kan redigere ↔ Eier) og deler med andre brukere; medlemmer kan forlate mappen.
function sharing(th, f) {
  const members = f.members ?? [], owner = f.isOwner ?? (f.myRole === 'Eier' || f.role === 'owner'), me = members.find((x) => x.you);
  const others = (D.users ?? []).filter((u) => !members.some((x) => x.userId === u.id));
  return `${sec('Deling')}${listBox(th, members.map((x) => `<div class="opt-row"><span class="m-av" style="width:34px;height:34px;font-size:14px">${esc((x.name ?? x.username ?? '?').slice(0, 1).toUpperCase())}</span><span class="m-grow">${esc(x.name ?? x.username)}${x.you ? ' <span style="opacity:.6">(deg)</span>' : ''}${x.login === false ? '<br><span style="font-size:12px;opacity:.55">Uten innlogging</span>' : ''}</span>${owner && !x.you ? `<button class="stchip ok" data-dirrole="${x.id}" data-r="${x.role}">${esc(x.roleName ?? ROLE[x.role] ?? x.role)}</button>` : `<span style="opacity:.7;font-size:13px">${esc(x.roleName ?? ROLE[x.role] ?? x.role ?? '')}</span>`}</div>`).join('')
    + (owner && others.length ? `<div class="opt-row col"><span style="font-size:13px;opacity:.7">Del med</span><div class="schips">${others.map((u) => `<button class="chip" data-dirshare="${esc(u.id)}">${esc(u.name ?? u.username)}</button>`).join('')}</div></div>` : ''))}
    <div class="snote">${owner ? 'Trykk på rollen for å bytte mellom Kan se, Kan redigere og Eier. Nye brukere legges til av admin i Homelab.' : 'Bare eiere kan endre deling.'}</div>
    ${me && !owner ? `<button class="sec-b danger wide" data-dirleave="${me.id}">Forlat boligen</button>` : ''}`;
}

/* ---------- Finn-handler ---------- */

function finn(th) {
  const f = D.finn;
  if (!f) return `${head(th, navName('finn', 'Finn-handler'))}<div class="m-spin"></div>`;
  return `${head(th, navName('finn', 'Finn-handler'))}
    ${kpis(th, [['Kjøpt i år', `${n0(f.bought ?? 0)} kr`], ['Solgt i år', `${n0(f.sold ?? 0)} kr`], ['Pågående', String(f.ongoing ?? 0)]])}
    ${listBox(th, (f.items ?? []).map((x) => `<div class="item" style="align-items:flex-start">${logo({ domain: 'finn.no', description: 'Finn' }, 40, isIos(th) ? 20 : 12)}<span class="m-grow"><span class="m-row" style="gap:8px"><em class="role ${x.role === 'sold' ? 'sold' : 'bought'}">${x.role === 'sold' ? 'Solgt' : 'Kjøpt'}</em><span class="m-ell" style="font-weight:500">${esc(x.item)}</span></span><span class="m-ell s">${esc(x.counterpart ?? '')}${x.date ? ` · ${dd(x.date)}` : ''}</span>
      <span class="steps">${(x.steps ?? []).map((s) => `<em class="${s.done ? 'done' : ''}">${esc(s.t ?? s.name ?? s.label ?? s)}</em>`).join('')}</span></span><span class="m-mono" style="font-weight:600;color:${x.role === 'sold' ? '#9FE3C6' : 'inherit'}">${x.role === 'sold' ? '+' : '−'}${n0(x.amount)}</span></div>`).join('') || '<div class="m-empty">Ingen Finn-handler ennå. Lim inn Finn-e-poster i FinansHub på PC.</div>')}`;
}

/* ---------- Domener (Cloudflare): faner Trafikk · Besøk · Ytelse · Sikkerhet ---------- */

const DOMTABS = [['dom/traf', 'Trafikk', 'traf'], ['dom/bes', 'Besøk', 'bes'], ['dom/yt', 'Ytelse', 'yt'], ['dom/sik', 'Sikkerhet', 'sik']];
const dm = { list: null, sel: null, per: '24h', hist: '7d', pick: false, data: {} };
try { dm.sel = localStorage.getItem('hl_dom_sel'); } catch {}
const tabOf = () => (DOMTABS.some(([k]) => k === `dom/${m.sub}`) ? m.sub : 'traf');
export const domNav = () => DOMTABS;
domNav.cur = () => `dom/${tabOf()}`;

async function domLoad(force = false) {
  if (!dm.list || force) {
    const l = await domApi('/domains');
    dm.list = Array.isArray(l) ? l : l?.items ?? [];
  }
  if (!dm.list.length) return;
  if (!dm.list.some((d) => d.name === dm.sel)) dm.sel = dm.list[0].name;
  const need = [dm.per, ...(tabOf() === 'traf' ? [dm.hist] : [])];
  await Promise.all(need.map(async (r) => {
    const k = `${dm.sel}|${r}`;
    if (!dm.data[k] || force) dm.data[k] = await domApi(`/${encodeURIComponent(dm.sel)}/analytics?range=${encodeURIComponent(r)}`);
  }));
}
// Sanntid: hent /:name/live hvert 30. sekund mens Trafikk vises.
let liveT = null;
function liveTimer(on) {
  if (!on) { clearInterval(liveT); liveT = null; return; }
  if (liveT) return;
  liveT = setInterval(async () => {
    if (m.screen !== 'dom' || document.hidden) return;
    const a = dm.data[`${dm.sel}|${dm.per}`];
    if (!a) return;
    try { const l = await domApi(`/${encodeURIComponent(dm.sel)}/live`); a.live = { ...a.live, ...(l?.live ?? l) }; draw(); } catch {}
  }, 30000);
}
const nbx = (v) => { v = Number(v) || 0; return v >= 1e6 ? (v / 1e6).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' mill.' : v >= 1e4 ? (v / 1e3).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + 'k' : Math.round(v).toLocaleString('nb-NO'); };
const bytes = (b) => { b = Number(b) || 0; return b >= 1e9 ? [(b / 1e9).toLocaleString('nb-NO', { maximumFractionDigits: 1 }), 'GB'] : [(b / 1e6).toLocaleString('nb-NO', { maximumFractionDigits: b >= 1e8 ? 0 : 1 }), 'MB']; };
const pct = (v) => `${(Number(v) || 0).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %`;
const path = (a, w, h) => { if (!a?.length) return ''; const mx = Math.max(...a, 1); return 'M' + a.map((v, i) => `${((i / Math.max(1, a.length - 1)) * w).toFixed(1)} ${(h - 4 - (v / mx) * (h - 8)).toFixed(1)}`).join(' L'); };
const bars = (a) => { const mx = Math.max(1, ...a); return `<div class="dbars" style="gap:${a.length > 40 ? 1 : 3}px">${a.map((v, i) => `<i style="height:${Math.max(3, (v / mx) * 100)}%;opacity:${i === a.length - 1 ? 1 : 0.72}"></i>`).join('')}</div>`; };
const shareRows = (th, rows, total, name = 'name', val = 'visitors') => { const mx = Math.max(1, ...rows.map((r) => r[val] ?? r.count ?? 0)); return listBox(th, rows.map((r) => { const v = r[val] ?? r.count ?? 0; return `<div class="opt-row share"><span class="m-grow"><span class="m-row" style="justify-content:space-between"><span class="m-ell">${esc(r[name] ?? r.path ?? r.name)}</span><span class="m-mono" style="opacity:.85">${nbx(v)}</span></span><span class="sbar"><i style="width:${(v / mx) * 100}%"></i></span></span></div>`; }).join('') || '<div class="m-empty">Ingen data.</div>'); };

function domView(th) {
  const pickBtn = `<button class="dpick ${gl(th)}" data-dom="pick" aria-expanded="${dm.pick}">${esc(dm.sel ?? 'Domene')} <span style="opacity:.6">▾</span></button>`;
  const right = `<button class="mini" data-dom="refresh" aria-label="Oppdater">${icon('refresh', 18)}</button><a class="mini" href="#/set" aria-label="Innstillinger">${icon('gear', 18)}</a>`;
  const top = `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0;gap:8px">${pickBtn}<span class="m-row" style="gap:8px">${right}${avatar()}</span></div>
    ${dm.pick ? listBox(th, (dm.list ?? []).map((d) => `<button class="opt-row" data-dom="sel" data-name="${esc(d.name)}"><span class="m-grow">${esc(d.name)}<br><span style="font-size:12px;opacity:.6">${esc({ cloudflare: 'Cloudflare', tunnel: 'Cloudflare Tunnel', plausible: 'Plausible', umami: 'Umami', uptime: 'Bare oppetid og SSL' }[d.source] ?? d.source ?? '')}</span></span>${d.name === dm.sel ? '<span style="color:var(--m-acc)">✓</span>' : ''}</button>`).join('') + '<div style="font-size:12px;opacity:.55;padding:10px 16px">Domener legges til i Homelab → Domener.</div>') : ''}`;
  if (!dm.list) return `${top}<div class="m-spin"></div>`;
  if (!dm.list.length) return `${top}<div class="m-empty">Ingen domener lagt til. Legg dem til i Homelab → Domener.</div>`;
  const a = dm.data[`${dm.sel}|${dm.per}`];
  if (!a) return `${top}<div class="m-spin"></div>`;
  const tab = tabOf();
  const mock = a.mock ? '<div style="font-size:12px;opacity:.55;text-align:center">Eksempeldata – legg inn Cloudflare-token i Homelab for ekte tall.</div>' : '';
  const body = tab === 'bes' ? domBes(th, a) : tab === 'yt' ? domYt(th, a) : tab === 'sik' ? domSik(th, a) : domTraf(th, a);
  const STAT = { active: ['Aktiv', '#7BE3A0'], down: ['Nede', '#FF8A80'], pending: ['Venter', '#F2B56B'] }[a.status] ?? ['Ukjent', 'inherit'];
  const meta = [`<b style="color:${STAT[1]};font-weight:600">● ${STAT[0]}</b>`, a.plan ? esc(a.plan) : '', a.sslExpires ? `SSL til ${dd(a.sslExpires)}.${String(a.sslExpires).slice(0, 4)}` : ''].filter(Boolean).join(' · ');
  liveTimer(tab === 'traf');
  return `${top}<div class="title" style="font-size:${isIos(th) ? 30 : 32}px">${DOMTABS.find(([k]) => k === `dom/${tab}`)[1]}</div><div style="font-size:13px;opacity:.75;padding:0 4px">${meta}</div>${a.error ? `<div class="m-empty" style="padding:8px">${esc(a.error)}${a.stale ? ' · viser sist hentede tall' : ''}</div>` : ''}${body}${mock}`;
}
const chipRow = (opts, cur, key) => `<div style="display:flex;gap:8px;overflow-x:auto">${opts.map(([k, n]) => `<button class="chip" data-dom="${key}" data-v="${k}" aria-pressed="${cur === k}">${cur === k ? '✓ ' : ''}${n}</button>`).join('')}</div>`;
function domTraf(th, a) {
  const live = a.live ?? {}, [mb, unit] = bytes(a.bytes ?? (live.mb ?? 0) * 1e6), h = dm.data[`${dm.sel}|${dm.hist}`];
  const sp = live.spark ?? (a.series ?? []).map((x) => x.requests), sl = path(sp, 300, 70);
  const ser = h?.series ?? [];
  return `<div class="dhero ${gl(th, 'glass')}"><div class="m-row" style="justify-content:space-between"><span class="live"><i></i>Live nå</span><span style="opacity:.75;font-size:13px">${dm.per === 'today' ? 'I dag' : 'Siste 24 timer'}</span></div>
      <div class="dlive"><div><b class="m-mono">${nbx(live.visitors ?? a.visitors)}</b><span>besøk</span></div><div><b class="m-mono">${nbx(live.requests ?? a.requests)}</b><span>forespørsler</span></div><div><b class="m-mono">${live.mb != null ? nbx(live.mb) : mb}</b><span>${live.mb != null ? 'MB' : unit}</span></div></div>
      ${sl ? `<svg viewBox="0 0 300 70" preserveAspectRatio="none" class="dspark" aria-hidden="true"><path d="${sl} L300 70 L0 70 Z" class="ar"/><path d="${sl}" class="ln"/></svg>` : ''}</div>
    ${chipRow([['24h', 'Siste 24 t'], ['today', 'I dag']], dm.per, 'per')}
    <div class="dcards">${[['Besøk', nbx(a.visitors), 'bes', '#FF9EBE', 'dom/bes'], ['Forespørsler', nbx(a.requests), 'req', '#8AB4F8', 'dom/yt'], ['Dataoverføring', `${mb} ${unit}`, 'dl', '#F2B56B', 'dom/yt'], ['Land', String((a.countries ?? []).length), 'globe', '#7BE3A0', 'dom/bes']].map(([l, v, ic, c, go]) => `<a class="dcard ${gl(th)}" href="#/${go}"><span style="color:${c}">${icon(ic, 18)}</span><span class="l">${l}</span><b class="m-mono">${v}</b></a>`).join('')}</div>
    <div class="sec">Historikk</div>
    ${chipRow([['7d', '7 d'], ['30d', '30 d'], ['90d', '90 d'], ['1y', '1 år']], dm.hist, 'hist')}
    ${h ? [['Besøk', ser.map((x) => x.visitors ?? 0)], ['Forespørsler', ser.map((x) => x.requests ?? 0)]].map(([l, arr]) => `<div class="dchart ${gl(th)}"><div class="m-row" style="justify-content:space-between"><span style="opacity:.75">${l}</span><b class="m-mono">${nbx(arr.reduce((x, y) => x + y, 0))}</b></div>${bars(arr)}</div>`).join('') : '<div class="m-spin"></div>'}`;
}
function domBes(th, a) {
  const dev = a.devices ?? [], colors = ['#FF9EBE', '#8AB4F8', '#F2B56B', '#7BE3A0'];
  return `${kpis(th, [['Besøk', nbx(a.visitors)], ['Sidevisninger', nbx(a.pageviews)], ['Land', String((a.countries ?? []).length)]])}
    ${sec('Topp land')}${shareRows(th, (a.countries ?? []).slice(0, 8), a.visitors)}
    ${dev.length ? `${sec('Enheter')}<div class="dchart ${gl(th)}"><div class="stack">${dev.map((d, i) => `<i style="width:${d.pct}%;background:${colors[i % 4]}"></i>`).join('')}</div><div class="legend">${dev.map((d, i) => `<span><i style="background:${colors[i % 4]}"></i>${esc(d.name)} ${pct(d.pct)}</span>`).join('')}</div></div>` : ''}
    ${sec('Toppsider')}${shareRows(th, (a.topPages ?? []).slice(0, 8), 0, 'path', 'count')}
    ${sec('Henvisere')}${shareRows(th, (a.referrers ?? []).slice(0, 6), 0, 'name', 'count')}
    ${(a.browsers ?? []).length ? `${sec('Nettlesere')}${shareRows(th, a.browsers, 0, 'name', 'pct')}` : ''}`;
}
function domYt(th, a) {
  const st = a.statusCodes ?? (typeof a.status === 'object' ? a.status : {}), tot = Object.values(st).reduce((x, y) => x + (Number(y) || 0), 0) || 1;
  const [mb, unit] = bytes(a.bytes);
  const SC = [['2xx', 'OK', '#7BE3A0'], ['3xx', 'Videresendt', '#8AB4F8'], ['4xx', 'Ikke funnet o.l.', '#F2B56B'], ['5xx', 'Serverfeil', '#FF8A80']];
  const up = (a.uptime90 ?? []).slice(-30);
  return `<div class="dchart ${gl(th)}"><div class="m-row" style="justify-content:space-between"><span style="opacity:.75">Bufret</span><b class="m-mono" style="font-size:24px">${pct(a.cachedPct)}</b></div><span class="sbar" style="height:10px"><i style="width:${Math.min(100, a.cachedPct ?? 0)}%"></i></span><span style="font-size:13px;opacity:.65">av ${mb} ${unit} levert fra Cloudflare-kanten</span></div>
    <div class="dcards">${[['Median TTFB', `${Math.round(a.ttfb?.p50 ?? 0)} ms`, 'Fra kanten'], ['95. persentil', `${Math.round(a.ttfb?.p95 ?? 0)} ms`, 'De tregeste 5 %'], ['Fra opprinnelse', a.originMs != null ? `${Math.round(a.originMs)} ms` : '–', 'Når cache bommer'], ['Feilrate', pct(a.errorPct), '5xx']].map(([l, v, s2]) => `<div class="dcard ${gl(th)}"><span class="l">${l}</span><b class="m-mono">${v}</b><span style="font-size:12px;opacity:.6">${s2}</span></div>`).join('')}</div>
    ${sec('Statuskoder')}${listBox(th, SC.map(([k, n, c]) => { const v = Number(st[k]) || 0; return `<div class="opt-row share"><span class="m-grow"><span class="m-row" style="justify-content:space-between"><span><b style="color:${c};font-weight:600">${k}</b> <span style="opacity:.65">${n}</span></span><span class="m-mono">${pct((v / tot) * 100)}</span></span><span class="sbar"><i style="width:${Math.max(1, (v / tot) * 100)}%;background:${c}"></i></span></span></div>`; }).join(''))}
    ${(a.http ?? []).length || (a.tls ?? []).length ? `${sec('Protokoller')}${listBox(th, [...(a.http ?? []), ...(a.tls ?? [])].map((x) => `<div class="opt-row"><span class="m-grow">${esc(x.name)}</span><span class="m-mono">${pct(x.pct)}</span></div>`).join(''))}` : ''}
    ${up.length ? `${sec('Oppetid siste 30 dager')}<div class="dchart ${gl(th)}"><div class="upt">${up.map((v) => `<i style="background:${v >= 0.999 ? '#7BE3A0' : v >= 0.98 ? '#F2B56B' : '#FF8A80'}" title="${pct(v * 100)}"></i>`).join('')}</div><span style="font-size:13px;opacity:.65">${pct(a.uptimePct ?? (up.reduce((x, y) => x + y, 0) / up.length) * 100)} oppetid</span></div>` : ''}`;
}
function domSik(th, a) {
  const t = a.threats ?? {}, s = a.security ?? {};
  const yes = (v) => (v === true ? 'På' : v === false ? 'Av' : esc(v ?? '–'));
  const byC = (a.countries ?? []).filter((c) => c.threats).sort((x, y) => y.threats - x.threats).slice(0, 6);
  return `<div class="dhero ${gl(th, 'glass')}"><span style="opacity:.75;font-size:14px">Trusler stoppet</span><b class="m-mono" style="font-size:40px">${nbx(t.total)}</b><span style="font-size:13px;opacity:.7">${dm.per === 'today' ? 'i dag' : 'siste 24 timer'}</span></div>
    ${(t.types ?? []).length ? `${sec('Typer')}${shareRows(th, t.types, 0, 'name', 'count')}` : ''}
    ${sec('Siste hendelser')}${listBox(th, (t.events ?? []).slice(0, 10).map((e) => `<div class="opt-row"><em class="role ${e.action === 'Blokkert' ? 'blk' : 'chl'}">${esc(e.action)}</em><span class="m-grow"><span class="m-ell">${esc(e.path ?? '/')}</span><span class="m-ell" style="font-size:12px;opacity:.6">${esc([e.country, e.ip].filter(Boolean).join(' · '))}</span></span><span style="font-size:12px;opacity:.6">${e.time ? new Date(e.time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>`).join('') || '<div class="m-empty">Ingen hendelser.</div>')}
    ${byC.length ? `${sec('Trusler per land')}${shareRows(th, byC, 0, 'name', 'threats')}` : ''}
    ${sec('Innstillinger')}${listBox(th, [['SSL-modus', esc(s.sslMode ?? '–')], ['Alltid HTTPS', yes(s.alwaysHttps)], ['Minimum TLS', esc(s.minTls ?? '–')], ['DNSSEC', yes(s.dnssec)], ['Bot Fight Mode', yes(s.botFight)], ['Sertifikat utløper', s.certExpires ? dd(String(s.certExpires).slice(0, 10)) + '.' + String(s.certExpires).slice(0, 4) : '–']].map(([k, v]) => `<div class="opt-row"><span class="m-grow" style="opacity:.75">${k}</span><b style="font-weight:500">${v}</b></div>`).join(''))}`;
}

/* ---------- Hendelser for modulene. Returnerer true når hendelsen er håndtert. ---------- */

export async function modBind(e, t) {
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'submit' && (x = d('[data-dirform]'))) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(x));
    const amount = parseAmount(v.amount);
    if (!v.description?.trim() || amount === null) { flash('Fyll ut beskrivelse og beløp'); return true; }
    D.dir[x.dataset.dirform] = await api(`/folders/${encodeURIComponent(x.dataset.dirform)}/entries`, { method: 'POST', json: { description: v.description.trim(), amount, paidBy: v.paidBy, date: today() } });
    flash('Lagt til i boligen'); return true;
  }
  if (e.type === 'input') {
    if (t.id === 'm-sub-name') D.subF.name = t.value; else if (t.id === 'm-sub-price') D.subF.price = t.value; else if (t.id === 'm-sub-next') D.subF.nextDate = t.value;
    else if (d('[data-dirnew]') && t.name) D.dirF[t.name] = t.value; else return false;
    return true;
  }
  if (e.type === 'submit' && (x = d('[data-subform]'))) {
    e.preventDefault();
    const f = D.subF, price = parseAmount(f.price);
    if (!f.name.trim() || !price) { flash('Skriv tjeneste og beløp'); return true; }
    await api('/subscriptions', { method: 'POST', json: { name: f.name.trim(), price, cycle: f.cycle, nextDate: f.nextDate || null } });
    D.subAdd = false; D.subF = { name: '', price: '', cycle: 'monthly', nextDate: '' };
    await modLoad('sub'); flash(`${f.name.trim()} lagt til`); return true;
  }
  if (e.type === 'submit' && (x = d('[data-dirnew]'))) {
    e.preventDefault();
    const f = D.dirF;
    if (!f.name.trim()) { flash('Gi boligen et navn'); return true; }
    const r = await api('/folders', { method: 'POST', json: { name: f.name.trim(), type: f.type, address: f.address } });
    D.dirAdd = false; D.dirF = { name: '', type: 'Hytte', address: '' };
    flash(`${r.name} opprettet`); location.hash = `#/dir/${r.id}`; return true;
  }
  if (e.type !== 'click') return false;
  const fid = m.sub;
  if ((x = d('[data-subadd]'))) { D.subAdd = x.dataset.subadd === '1'; draw(); return true; }
  if ((x = d('[data-subcyc]'))) { D.subF.cycle = x.dataset.subcyc; draw(); return true; }
  if ((x = d('[data-diradd]'))) { D.dirAdd = x.dataset.diradd === '1'; draw(); return true; }
  if ((x = d('[data-dirtype]'))) { D.dirF.type = x.dataset.dirtype; draw(); return true; }
  if ((x = d('[data-dirrole]'))) { const nx = { viewer: 'editor', editor: 'owner', owner: 'viewer' }[x.dataset.r] ?? 'viewer'; D.dir[fid] = await api(`/folders/${fid}/members/${x.dataset.dirrole}`, { method: 'PATCH', json: { role: nx } }); draw(); return true; }
  if ((x = d('[data-dirshare]'))) { D.dir[fid] = await api(`/folders/${fid}/members`, { method: 'POST', json: { userId: x.dataset.dirshare, role: 'viewer' } }); flash('Delt · kan se'); return true; }
  if ((x = d('[data-dirleave]'))) { if (!confirm('Forlate boligen? Du mister tilgangen til den.')) return true; await api(`/folders/${fid}/members/${x.dataset.dirleave}`, { method: 'DELETE' }); flash('Du forlot mappen'); location.hash = '#/dir'; return true; }
  if ((x = d('[data-dirpay]'))) { D.dir[fid] = await api(`/folders/${fid}/installments/${x.dataset.dirpay}/pay`, { method: 'POST' }).then((r) => (r?.members ? r : api(`/folders/${fid}`))); flash('Registrert som betalt'); return true; }
  if ((x = d('[data-shop]'))) { await matApi(`/shopping/${encodeURIComponent(x.dataset.shop)}/toggle`, { method: 'POST' }); await modLoad('mat'); draw(); return true; }
  if ((x = d('[data-mat]'))) { const day = x.dataset.mat === 'day'; flash(day ? 'Gemini foreslår en ny rett …' : 'Gemini lager ukeplan …'); await matApi('/plan', { method: 'POST', json: day ? { scope: 'day', date: x.dataset.date } : { scope: 'week', date: D.mat?.start ?? today() } }); await modLoad('mat'); flash('Matplan oppdatert'); return true; }
  if ((x = d('[data-subtog]'))) {
    const it = D.sub?.items?.find((y) => String(y.id) === x.dataset.subtog);
    if (!it) return true;
    if (it.active && !confirm(`Markere ${it.name} som sagt opp?`)) return true;
    await api(`/subscriptions/${it.id}`, { method: 'PATCH', json: { active: !it.active } });
    await modLoad('sub'); flash(it.active ? `${it.name} er sagt opp` : `${it.name} er aktiv igjen`); return true;
  }
  if ((x = d('[data-dom]'))) {
    const k = x.dataset.dom;
    if (k === 'pick') dm.pick = !dm.pick;
    else if (k === 'sel') { dm.sel = x.dataset.name; dm.pick = false; try { localStorage.setItem('hl_dom_sel', dm.sel); } catch {} draw(); await modLoad('dom'); }
    else if (k === 'per') { dm.per = x.dataset.v; draw(); await modLoad('dom'); }
    else if (k === 'hist') { dm.hist = x.dataset.v; draw(); await modLoad('dom'); }
    else if (k === 'refresh') { flash('Oppdaterer …'); dm.data = {}; try { await domLoad(true); flash('Oppdatert fra Cloudflare'); } catch (err) { flash(err.message); } }
    draw(); return true;
  }
  return false;
}
