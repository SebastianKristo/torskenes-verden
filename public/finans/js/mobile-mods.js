// Moduler i mobilappen («Andre OS»): Matplan, Domener, Subscription OS, Delte mapper og Finn-handler.
// Hver modul fyller hele skjermen og henter fra sitt eget API. Feiler API-et, vises en lenke til desktop-siden.
import { api, esc, n0, n2, dd, dWeek, today, icon, logo, aiLine, matApi, domApi, parseAmount, navName } from './core.js';
import { m, draw, flash, avatar, backBtn } from './mobile.js';
import { subsLoad, subsView, subsBind } from './mobile-subs.js';

export const MODS = [
  ['mat', 'Mat', 'Ukemeny, kokk og handleliste', 'mat'],
  ['dom', 'Domener', 'Trafikk, besøk, ytelse og sikkerhet', 'globe'],
  ['sub', 'Subscription OS', 'Abonnementer og trekk', 'sub'],
  ['dir', 'Boliger', 'Utgifter, prosjekter og regninger', 'dir'],
  ['finn', 'Finn-handler', 'Trygg betaling, Fiks ferdig, Tillit', 'finn'],
];
const D = { mat: null, dirs: null, dir: {}, finn: null, err: {}, users: null, dirAdd: false, dirF: { name: '', type: 'Hytte', address: '' } };
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
    else if (key === 'sub') await subsLoad();
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
  if (key === 'sub') return subsView();
  if (key === 'finn') return finn(th);
  if (key === 'dir') return sub ? folder(th, sub) : folders(th);
  return '';
}

/* ---------- Matplan ---------- */

const SRC = { gemini: ['Gemini', '#FFB08A', 'rgba(255,122,61,.15)'], hellofresh: ['HelloFresh', '#C2E27A', 'rgba(145,193,30,.18)'], fixed: ['Fast', '#9FE3C6', '#1F3A2F'], own: ['Egen', '#A9C3FF', 'rgba(122,167,255,.15)'] };
function mat(th) {
  const w = D.mat;
  if (!w) return `${head(th, 'Mat')}<div class="m-spin"></div>`;
  const td = today();
  return `${head(th, 'Mat')}
    <div class="m-row" style="gap:8px;flex-wrap:wrap"><button class="pri-b" data-mat="plan" style="flex:1">✦ Ny ukeplan med Gemini</button></div>
    <div style="font-size:13px;opacity:.7;padding:0 4px">Ukekost ca. ${n0(w.weekCost ?? 0)} kr · Automatisk hver søndag: ${w.auto ? 'på' : 'av'}</div>
    ${listBox(th, (w.days ?? []).map((d) => { const [n, c, bg] = SRC[d.source] ?? SRC.own; return `<div class="opt-row day${d.date === td ? ' today' : ''}"><span class="m-grow"><span class="s" style="text-transform:capitalize">${esc(d.weekday ?? dWeek(d.date))}${d.cook ? ` · ${esc(d.cook)}` : ''}</span><b class="m-ell" style="display:block;font-weight:500">${esc(d.name || '–')}</b><em class="src" style="color:${c};background:${bg}">${n}${d.fixed ? ' · fast' : ''}</em></span><span class="m-mono" style="opacity:.8">${d.cost ? n0(d.cost) + ' kr' : ''}</span><button class="mini" data-mat="day" data-date="${d.date}" aria-label="Ny rett for dagen">✦</button></div>`; }).join('') || '<div class="m-empty">Ingen plan ennå.</div>')}
    ${(w.shopping ?? []).length ? `${sec('Handleliste')}${listBox(th, w.shopping.map((x) => `<button class="opt-row" data-shop="${esc(x.id)}"><span class="chk${x.done ? ' on' : ''}">${x.done ? '✓' : ''}</span><span class="m-grow" style="${x.done ? 'text-decoration:line-through;opacity:.5' : ''}">${esc(x.text)}</span></button>`).join(''))}` : ''}`;
}

/* ---------- Subscription OS: se mobile-subs.js ---------- */

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
    ${(f.categories ?? []).length ? `${sec('Kategorier')}${listBox(th, f.categories.map((c) => `<div class="opt-row" style="flex-direction:column;align-items:stretch;gap:6px"><span class="m-row" style="justify-content:space-between;gap:8px"><span class="m-row" style="gap:8px;min-width:0"><i style="width:10px;height:10px;border-radius:50%;flex:none;background:${esc(c.color)}"></i><b class="m-ell" style="font-weight:500">${esc(c.name)}</b></span><span class="m-mono">${n0(c.sum)} kr</span></span>
      <span class="m-bar" style="height:5px;background:rgba(127,127,127,.18)"><i style="width:${Math.min(100, c.pct ?? 0)}%;background:${esc(c.color)}"></i></span>
      ${(c.subs ?? []).map((x) => `<span class="m-row" style="justify-content:space-between;gap:8px;font-size:12.5px;opacity:.72;padding-left:18px"><span class="m-ell">${esc(x.name)}</span><span class="m-mono">${n0(x.sum)} kr</span></span>`).join('')}</div>`).join(''))}` : ''}
    ${sec('Utgifter')}
    ${listBox(th, (f.entries ?? []).map((e) => `<div class="item">${logo(e, 40, isIos(th) ? 20 : 12)}<span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(e.description)}</span>${aiLine(e.aiShort, 'm-ell ai')}<span class="m-ell s">${e.pending ? '✦ Kategoriseres … · ' : e.categoryLabel ? `<span style="color:${esc(e.color ?? 'inherit')}">${e.aiCategory ? '✦ ' : ''}${esc(e.categoryLabel)}</span> · ` : ''}${dd(e.date)}${e.paidBy ? ` · betalt av ${esc(e.paidBy)}` : ''}${e.split ? ` · ${esc(e.split)}` : ''}</span></span><span class="m-mono" style="font-weight:600">${n2(e.amount)}</span></div>`).join('') || '<div class="m-empty">Ingen utgifter ennå.</div>')}
    ${ro && !bolEditable().length ? '<div class="m-empty">Du har lesetilgang. Be en eier om redigeringstilgang for å legge til utgifter.</div>' : addForm(th, f, members)}
    ${sharing(th, f)}`;
}
// Boliger brukeren kan legge poster i, og hvilken som er valgt («Legg i bolig»). Standard er boligen du står i.
const bolEditable = () => (D.dirs ?? []).filter((x) => x.role && x.role !== 'viewer');
const bolTarget = (f) => { const t = D.bolTarget?.[f.id]; return bolEditable().some((x) => x.id === t) ? t : bolEditable().some((x) => x.id === f.id) ? f.id : bolEditable()[0]?.id; };
function addForm(th, f, members) {
  const list = bolEditable(), tgt = bolTarget(f), other = tgt !== f.id;
  const opts = (f.catTree ?? []);
  const lab = (t) => (isIos(th) ? `<span>${t}</span>` : t);
  return `${sec('Legg til utgift eller kvittering')}
    ${list.length > 1 ? `<div class="opt-row col" style="padding:0 2px"><span style="font-size:13px;opacity:.7">Legg i bolig</span><div class="schips">${list.map((x) => `<button class="chip" type="button" data-boltgt="${f.id}:${x.id}" aria-pressed="${x.id === tgt}">${esc(x.name)}</button>`).join('')}</div></div>` : ''}
    <form class="${isIos(th) ? 'list glass2' : 'fields'}" data-dirform="${esc(String(tgt))}" data-from="${esc(String(f.id))}">
      <label class="field">${lab('Beskrivelse')}<input name="description" required placeholder="F.eks. Plantasjen, blomster"></label>
      <label class="field">${lab('Beløp')}<input name="amount" inputmode="decimal" required placeholder="0,00" class="m-mono"></label>
      <label class="field">${lab('Kategori')}<select name="categoryId"><option value="">✦ AI velger</option>${opts.map((o) => `<option value="${o.id}">${o.sub ? '  ' : ''}${esc(o.label)}</option>`).join('')}</select></label>
      ${other ? '' : `<label class="field">${lab('Betalt av')}<select name="paidBy">${members.map((x) => `<option>${esc(x.name ?? x.username)}</option>`).join('')}</select></label>`}
      <div style="padding:${isIos(th) ? '10px 12px' : '0'};display:flex;gap:8px"><button class="pri-b" type="submit" style="flex:1;height:50px">Legg til</button><label class="sec-b" style="flex:1;height:50px;display:flex;align-items:center;justify-content:center;cursor:pointer">Kvittering<input type="file" accept="image/*,application/pdf" multiple hidden data-dirrc="${esc(String(tgt))}" data-from="${esc(String(f.id))}"></label></div>
    </form>
    <div class="snote">${other ? `Havner i ${esc(list.find((x) => x.id === tgt)?.name ?? '')}. ` : ''}✦ AI velger kategori og underkategori, og kan lage en ny når ingen passer.</div>`;
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
const dm = { list: null, sel: null, per: '24h', hist: '7d', pick: false, data: {}, manage: false, add: { name: '', source: 'cloudflare' } };
const DSRC = { cloudflare: 'Cloudflare', tunnel: 'Cloudflare Tunnel', plausible: 'Plausible', umami: 'Umami', uptime: 'Bare oppetid og SSL' };
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

function domManage(th) {
  const f = dm.add;
  return `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0"><div class="title" style="font-size:${isIos(th) ? 30 : 32}px">Domener</div><button class="tonal" data-dom="mclose">Ferdig</button></div>
    ${sec('Dine domener')}${listBox(th, (dm.list ?? []).map((d) => `<div class="opt-row"><span class="m-grow">${esc(d.name)}<br><span style="font-size:12px;opacity:.6">${esc(DSRC[d.source] ?? d.source ?? '')}${d.hasToken ? ' · eget token' : ''}</span></span><button class="mini danger" data-dom="rm" data-id="${esc(d.id)}" data-name="${esc(d.name)}">Fjern</button></div>`).join('') || '<div class="m-empty">Ingen domener ennå.</div>')}
    ${sec('Legg til domene')}<form class="list ${gl(th)}" data-domadd><label class="opt-row col"><span style="font-size:13px;opacity:.7">Domene</span><input class="sinp" name="name" id="m-dom-name" value="${esc(f.name)}" placeholder="eksempel.no" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off"></label>
      <div class="opt-row col"><span style="font-size:13px;opacity:.7">Statistikkilde</span><div class="chips">${Object.entries(DSRC).map(([k, n]) => `<button type="button" class="chip" data-dom="src" data-v="${k}" aria-pressed="${f.source === k}">${n}</button>`).join('')}</div></div>
      <button class="opt-row" type="submit"><span class="m-grow" style="color:var(--m-acc);font-weight:600">Legg til domene</span></button></form>
    <div class="snote" style="padding:0 6px">Listen er den samme som i Homelab. Cloudflare bruker standard-tokenet fra Integrasjoner; eget API-token per domene legges inn på web (Homelab → Innstillinger → Domener).</div>`;
}

function domView(th) {
  if (dm.manage || m.sub === 'admin') return domManage(th);
  // Prompt 12: domenevelgeren er bare et ikon, og ligger sammen med Oppdater ved siden av profilbildet.
  const pickBtn = `<button class="mini dpick-ic${dm.pick ? ' on' : ''}" data-dom="pick" aria-expanded="${dm.pick}" aria-label="Velg domene (${esc(dm.sel ?? 'ingen valgt')})">${icon('globe', 18)}</button>`;
  // iPhone: tannhjulet ligger i fanelinjen (samme plass som Skann i Finans), ikke øverst.
  const right = `${pickBtn}<button class="mini" data-dom="refresh" aria-label="Oppdater">${icon('refresh', 18)}</button>${isIos(th) ? '' : `<a class="mini" href="#/set/dom" aria-label="Innstillinger">${icon('gear', 18)}</a>`}`;
  const manageRow = `<button class="opt-row" data-dom="manage"><span class="m-grow" style="color:var(--m-acc);font-weight:600">＋ Administrer domener</span></button>`;
  const top = `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0;gap:8px"><b class="dname m-ell">${esc(dm.sel ?? 'Domener')}</b><span class="m-row" style="gap:8px;flex:none">${right}${avatar()}</span></div>
    ${dm.pick ? listBox(th, (dm.list ?? []).map((d) => `<button class="opt-row" data-dom="sel" data-name="${esc(d.name)}"><span class="m-grow">${esc(d.name)}<br><span style="font-size:12px;opacity:.6">${esc(DSRC[d.source] ?? d.source ?? '')}</span></span>${d.name === dm.sel ? '<span style="color:var(--m-acc)">✓</span>' : ''}</button>`).join('') + manageRow) : ''}`;
  if (!dm.list) return `${top}<div class="m-spin"></div>`;
  if (!dm.list.length) return `${top}<div class="m-empty">Ingen domener lagt til ennå.</div>${listBox(th, manageRow)}`;
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
    ${h ? [['Besøk', ser.map((x) => x.visitors ?? 0)], ['Forespørsler', ser.map((x) => x.requests ?? 0)]].map(([l, arr]) => `<div class="dchart ${gl(th)}"><div class="m-row" style="justify-content:space-between"><span style="opacity:.75">${l}</span><b class="m-mono">${nbx(arr.reduce((x, y) => x + y, 0))}</b></div>${bars(arr)}</div>`).join('') : '<div class="m-spin"></div>'}
    ${domCard(th, a)}`;
}
const dLong = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}` : '–');
const daysTo = (v) => (v ? Math.round((new Date(String(v).slice(0, 10) + 'T12:00:00') - Date.now()) / 864e5) : null);
function domCard(th, a) {
  const STAT = { active: ['Aktiv', '#7BE3A0'], down: ['Nede', '#FF8A80'], pending: ['Venter', '#F2B56B'] }[a.status] ?? ['Ukjent', 'inherit'];
  const cert = a.sslExpires ?? a.security?.certExpires, cd = daysTo(cert);
  const ip = (a.dns ?? []).find((r) => r.type === 'A')?.content ?? (a.dns ?? []).find((r) => r.type === 'AAAA')?.content;
  const tls = a.tls?.[0]?.name ?? (a.security?.minTls ? `TLS ${a.security.minTls}+` : null);
  const yes = (v) => (v === true ? 'På' : v === false ? 'Av' : '–');
  const src = dm.list?.find((d) => d.name === dm.sel)?.source;
  const rows = [['Status', `<b style="color:${STAT[1]};font-weight:600">● ${STAT[0]}</b>`], ['Statistikkilde', esc(DSRC[src] ?? src ?? '–')], ['Registrar', esc(a.registrar ?? '–')],
    ['Fornyes', dLong(a.renews)], ['SSL-sertifikat', cert ? `<span style="color:${cd != null && cd < 30 ? '#F2B56B' : 'inherit'}">${dLong(String(cert))} · ${cd} dager igjen</span>` : '–'],
    ['Navnetjenere', (a.nameServers ?? []).map(esc).join('<br>') || '–'], ['IP', ip ? `<span class="m-mono" style="font-size:13px">${esc(ip)}</span>` : '–'], ['TLS', esc(tls ?? '–')], ['DNSSEC', yes(a.security?.dnssec)]];
  return `${sec('Domene')}${listBox(th, rows.map(([k, v]) => `<div class="opt-row"><span style="opacity:.7;flex:none">${k}</span><span class="m-grow" style="text-align:right">${v}</span></div>`).join(''))}`;
}
function domBes(th, a) {
  const dev = a.devices ?? [], colors = ['#FF9EBE', '#8AB4F8', '#F2B56B', '#7BE3A0'];
  return `${kpis(th, [['Besøk', nbx(a.visitors)], ['Sidevisninger', nbx(a.pageviews)], ['Land', String((a.countries ?? []).length)]])}
    ${sec('Verdenskart')}<div class="dchart ${gl(th)} dmapbox"><div class="dmap" data-dmap aria-label="Besøk per land"></div><span style="font-size:12px;opacity:.6">Trykk på et land for å se antall besøk.</span></div>
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
  const up = (a.uptime90 ?? []).slice(-90);
  return `<div class="dchart ${gl(th)}"><div class="m-row" style="justify-content:space-between"><span style="opacity:.75">Bufret</span><b class="m-mono" style="font-size:24px">${pct(a.cachedPct)}</b></div><span class="sbar" style="height:10px"><i style="width:${Math.min(100, a.cachedPct ?? 0)}%"></i></span><span style="font-size:13px;opacity:.65">av ${mb} ${unit} levert fra Cloudflare-kanten</span></div>
    <div class="dcards">${[['Median TTFB', `${Math.round(a.ttfb?.p50 ?? 0)} ms`, 'Fra kanten'], ['95. persentil', `${Math.round(a.ttfb?.p95 ?? 0)} ms`, 'De tregeste 5 %'], ['Fra opprinnelse', a.originMs != null ? `${Math.round(a.originMs)} ms` : '–', 'Når cache bommer'], ['Feilrate', pct(a.errorPct), '5xx']].map(([l, v, s2]) => `<div class="dcard ${gl(th)}"><span class="l">${l}</span><b class="m-mono">${v}</b><span style="font-size:12px;opacity:.6">${s2}</span></div>`).join('')}</div>
    ${sec('Statuskoder')}${listBox(th, SC.map(([k, n, c]) => { const v = Number(st[k]) || 0; return `<div class="opt-row share"><span class="m-grow"><span class="m-row" style="justify-content:space-between"><span><b style="color:${c};font-weight:600">${k}</b> <span style="opacity:.65">${n}</span></span><span class="m-mono">${pct((v / tot) * 100)}</span></span><span class="sbar"><i style="width:${Math.max(1, (v / tot) * 100)}%;background:${c}"></i></span></span></div>`; }).join(''))}
    ${(a.http ?? []).length || (a.tls ?? []).length ? `${sec('Protokoller')}${listBox(th, [...(a.http ?? []), ...(a.tls ?? [])].map((x) => `<div class="opt-row"><span class="m-grow">${esc(x.name)}</span><span class="m-mono">${pct(x.pct)}</span></div>`).join(''))}` : ''}
    ${up.length ? `${sec(`Oppetid siste ${up.length} dager`)}<div class="dchart ${gl(th)}"><div class="upt">${up.map((v) => `<i style="background:${v >= 0.999 ? '#7BE3A0' : v >= 0.98 ? '#F2B56B' : '#FF8A80'}" title="${pct(v * 100)}"></i>`).join('')}</div><span style="font-size:13px;opacity:.65">${pct(a.uptimePct ?? (up.reduce((x, y) => x + y, 0) / up.length) * 100)} oppetid</span></div>` : ''}`;
}
function domSik(th, a) {
  const t = a.threats ?? {}, s = a.security ?? {};
  const yes = (v) => (v === true ? 'På' : v === false ? 'Av' : esc(v ?? '–'));
  const byC = (a.countries ?? []).filter((c) => c.threats).sort((x, y) => y.threats - x.threats).slice(0, 6);
  return `<div class="dhero ${gl(th, 'glass')}"><span style="opacity:.75;font-size:14px">Trusler stoppet</span><b class="m-mono" style="font-size:40px">${nbx(t.total)}</b><span style="font-size:13px;opacity:.7">${dm.per === 'today' ? 'i dag' : 'siste 24 timer'}</span></div>
    ${(t.types ?? []).length ? `${sec('Typer')}${shareRows(th, t.types, 0, 'name', 'count')}` : ''}
    ${sec('Siste hendelser')}${listBox(th, (t.events ?? []).slice(0, 10).map((e) => `<div class="opt-row"><em class="role ${e.action === 'Blokkert' ? 'blk' : 'chl'}">${esc(e.action)}</em><span class="m-grow"><span class="m-ell">${esc(e.path ?? '/')}</span><span class="m-ell" style="font-size:12px;opacity:.6">${esc([e.country, e.ip].filter(Boolean).join(' · '))}</span></span><span style="font-size:12px;opacity:.6">${e.time ? new Date(e.time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>`).join('') || '<div class="m-empty">Ingen hendelser.</div>')}
    ${byC.length ? `${sec('Trusler per land')}${shareRows(th, byC, 0, 'name', 'threats')}` : ''}
    ${sec('DNS-poster')}${listBox(th, (a.dns ?? []).map((r) => `<div class="opt-row"><em class="role dns">${esc(r.type)}</em><span class="m-grow" style="min-width:0"><span class="m-ell">${esc(r.name)}</span><span class="m-ell m-mono" style="font-size:12px;opacity:.65">${esc(r.content)}</span></span><span style="font-size:12px;flex:none;color:${r.proxied ? '#F2B56B' : 'inherit'};opacity:${r.proxied ? 1 : 0.6}">${r.proxied ? 'Proxy' : 'Kun DNS'}</span></div>`).join('') || '<div class="m-empty">Ingen DNS-poster.</div>')}
    ${sec('Innstillinger')}${listBox(th, [['SSL-modus', esc(s.sslMode ?? '–')], ['Alltid HTTPS', yes(s.alwaysHttps)], ['Minimum TLS', esc(s.minTls ?? '–')], ['DNSSEC', yes(s.dnssec)], ['Bot Fight Mode', yes(s.botFight)], ['Sertifikat utløper', s.certExpires ? dd(String(s.certExpires).slice(0, 10)) + '.' + String(s.certExpires).slice(0, 4) : '–']].map(([k, v]) => `<div class="opt-row"><span class="m-grow" style="opacity:.75">${k}</span><b style="font-weight:500">${v}</b></div>`).join(''))}`;
}

/* ---------- Hendelser for modulene. Returnerer true når hendelsen er håndtert. ---------- */

export async function modBind(e, t) {
  if (await subsBind(e, t)) return true;
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'submit' && (x = d('[data-dirform]'))) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(x));
    const amount = parseAmount(v.amount);
    if (!v.description?.trim() || amount === null) { flash('Fyll ut beskrivelse og beløp'); return true; }
    const tgt = x.dataset.dirform, from = x.dataset.from ?? tgt;
    const r = await api(`/folders/${encodeURIComponent(tgt)}/entries`, { method: 'POST', json: { description: v.description.trim(), amount, paidBy: v.paidBy, categoryId: +v.categoryId || null, date: today() } });
    if (String(tgt) === String(from)) D.dir[from] = r; else D.dir[from] = await api(`/folders/${encodeURIComponent(from)}`);
    D.dirs = await api('/folders').catch(() => D.dirs);
    flash(`Lagt til i ${r.name}${v.categoryId ? '' : ' · ✦ AI velger kategori'}`); return true;
  }
  if (e.type === 'change' && t.matches?.('[data-dirrc]')) {
    const files = [...t.files], tgt = t.dataset.dirrc, from = t.dataset.from ?? tgt; t.value = '';
    if (!files.length) return true;
    const fd = new FormData();
    for (const f of files) fd.append('file', f);
    const r = await api(`/folders/${encodeURIComponent(tgt)}/receipts`, { method: 'POST', body: fd });
    const n = r.jobs?.length ?? files.length;
    flash(`${n} kvittering${n === 1 ? '' : 'er'} leses · ✦ AI velger kategori`);
    // Følg med til AI-en er ferdig, så havner kvitteringen i listen.
    const poll = async (i) => { if (i > 20 || m.screen !== 'dir') return; D.dir[from] = await api(`/folders/${encodeURIComponent(from)}`).catch(() => D.dir[from]); draw(); const jobs = await api('/receipts/jobs').catch(() => []); if (jobs.some((j) => (r.jobs ?? []).some((y) => y.id === j.id) && ['pending', 'processing'].includes(j.status))) setTimeout(() => poll(i + 1), 2500); };
    setTimeout(() => poll(0), 2500);
    return true;
  }
  if (e.type === 'submit' && (x = d('[data-domadd]'))) {
    e.preventDefault();
    const name = String(new FormData(x).get('name') ?? '').trim().toLowerCase();
    if (!name) { flash('Skriv et domene, f.eks. eksempel.no'); return true; }
    await domApi('/domains', { method: 'POST', json: { name, source: dm.add.source } });
    dm.add = { name: '', source: dm.add.source }; dm.sel = name; await domLoad(true); flash(`${name} er lagt til`); return true;
  }
  if (e.type === 'input' && t.id === 'm-dom-name') { dm.add.name = t.value; return true; }
  if (e.type === 'input') {
    if (d('[data-dirnew]') && t.name) D.dirF[t.name] = t.value; else return false;
    return true;
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
  if ((x = d('[data-diradd]'))) { D.dirAdd = x.dataset.diradd === '1'; draw(); return true; }
  if ((x = d('[data-dirtype]'))) { D.dirF.type = x.dataset.dirtype; draw(); return true; }
  if ((x = d('[data-boltgt]'))) { const [from, to] = x.dataset.boltgt.split(':').map(Number); (D.bolTarget ??= {})[from] = to; draw(); return true; }
  if ((x = d('[data-dirrole]'))) { const nx = { viewer: 'editor', editor: 'owner', owner: 'viewer' }[x.dataset.r] ?? 'viewer'; D.dir[fid] = await api(`/folders/${fid}/members/${x.dataset.dirrole}`, { method: 'PATCH', json: { role: nx } }); draw(); return true; }
  if ((x = d('[data-dirshare]'))) { D.dir[fid] = await api(`/folders/${fid}/members`, { method: 'POST', json: { userId: x.dataset.dirshare, role: 'viewer' } }); flash('Delt · kan se'); return true; }
  if ((x = d('[data-dirleave]'))) { if (!confirm('Forlate boligen? Du mister tilgangen til den.')) return true; await api(`/folders/${fid}/members/${x.dataset.dirleave}`, { method: 'DELETE' }); flash('Du forlot mappen'); location.hash = '#/dir'; return true; }
  if ((x = d('[data-dirpay]'))) { D.dir[fid] = await api(`/folders/${fid}/installments/${x.dataset.dirpay}/pay`, { method: 'POST' }).then((r) => (r?.members ? r : api(`/folders/${fid}`))); flash('Registrert som betalt'); return true; }
  if ((x = d('[data-shop]'))) { await matApi(`/shopping/${encodeURIComponent(x.dataset.shop)}/toggle`, { method: 'POST' }); await modLoad('mat'); draw(); return true; }
  if ((x = d('[data-mat]'))) { const day = x.dataset.mat === 'day'; flash(day ? 'Gemini foreslår en ny rett …' : 'Gemini lager ukeplan …'); await matApi('/plan', { method: 'POST', json: day ? { scope: 'day', date: x.dataset.date } : { scope: 'week', date: D.mat?.start ?? today() } }); await modLoad('mat'); flash('Mat oppdatert'); return true; }
  if ((x = d('[data-dom]'))) {
    const k = x.dataset.dom;
    if (k === 'manage') { dm.manage = true; dm.pick = false; window.scrollTo(0, 0); }
    else if (k === 'mclose') { dm.manage = false; if (m.sub === 'admin') { location.hash = '#/dom'; return true; } }
    else if (k === 'src') { dm.add.source = x.dataset.v; }
    else if (k === 'rm') {
      if (!confirm(`Fjerne ${x.dataset.name} fra Domener? Statistikken slutter å hentes.`)) return true;
      await domApi(`/domains/${encodeURIComponent(x.dataset.id)}`, { method: 'DELETE' });
      if (dm.sel === x.dataset.name) dm.sel = null;
      await domLoad(true); flash(`${x.dataset.name} er fjernet`);
    }
    else if (k === 'pick') dm.pick = !dm.pick;
    else if (k === 'sel') { dm.sel = x.dataset.name; dm.pick = false; try { localStorage.setItem('hl_dom_sel', dm.sel); } catch {} draw(); await modLoad('dom'); }
    else if (k === 'per') { dm.per = x.dataset.v; draw(); await modLoad('dom'); }
    else if (k === 'hist') { dm.hist = x.dataset.v; draw(); await modLoad('dom'); }
    else if (k === 'refresh') { flash('Oppdaterer …'); dm.data = {}; try { await domLoad(true); flash('Oppdatert fra Cloudflare'); } catch (err) { flash(err.message); } }
    draw(); return true;
  }
  return false;
}

/* Verdenskartet tegnes etter hver tegning av Besøk-fanen (rosa skala). */
export function modAfterDraw(th) {
  const el = document.querySelector('[data-dmap]');
  if (!el) return;
  const a = dm.data[`${dm.sel}|${dm.per}`];
  const lt = th === 'and' && m.light;
  import('/assets/js/worldmap.js').then(({ drawMap }) => drawMap(el, a?.countries ?? [], {
    lo: lt ? '#F2C4D3' : '#4a2433', hi: lt ? '#8A4E61' : '#FFB1C8', empty: lt ? '#EBDDE1' : th === 'and' ? '#3A2F33' : '#2A2228', stroke: lt ? '#FFFFFF' : th === 'and' ? '#1A1114' : '#141016', tap: true,
  })).catch(() => { el.innerHTML = '<div class="wm-msg">Kunne ikke laste kartet.</div>'; });
}
