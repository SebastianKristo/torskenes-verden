// FinansHub v2-moduler i sidemenyen: Subscription OS, Delte mapper, Finn-handler og Import.
// Samme mønster som desktop.js: sidene tegnes fra S, hendelser fanges med delegering (data-m*-attributter).
import { S, api, esc, n0, n2, sgn, dd, today, render, toast, loadBoot, accs, logo, aiLine, ICONS, parseAmount, ini, smooth } from './core.js';

Object.assign(ICONS, {
  sub: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  dir: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 14a2 2 0 1 0 0-.01M15 14a2 2 0 1 0 0-.01',
  finn: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  imp: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  aks: 'M3 17l6-6 4 4 8-8M15 7h6v6',
});

export const MODULE_PAGES = [['aks', 'Aksjer'], ['sub', 'Subscription OS'], ['dir', 'Delte mapper'], ['finn', 'Finn-handler'], ['imp', 'Import']];
export const MODULE_SUB = { aks: 'Trading 212', sub: 'Abonnementer', dir: 'Boliger og felles utgifter', finn: 'Trygg betaling, Fiks ferdig, Tillit', imp: 'CSV, XLSX og tekst' };
const u = S.ui;
const card = (inner, style = '') => `<section class="card" style="${style}">${inner}</section>`;
const skel = (h = 160) => `<div class="skel" style="min-height:${h}px"></div>`;
const kr0 = (v) => `${n0(v)} kr`;
const modes = (key, cur) => `<div class="mod-modes">${[['new', key === 'dir' ? 'Ny utgift' : 'Nytt abonnement'], ['rc', 'Kvittering'], ['tx', 'Fra transaksjoner']]
  .map(([m, n]) => `<button class="mod-mode" data-mmode="${key}:${m}" aria-pressed="${cur === m}">${n}</button>`).join('')}</div>`;
const dropRc = (target) => `<label class="mod-drop"><b>Last opp kvitteringer</b><span>Flere filer · AI leser butikk, dato og beløp i bakgrunnen</span><input type="file" multiple accept="image/*,application/pdf" data-mrc="${target}" hidden></label>`;
const txPick = (target) => S.recentOut ? `<div class="mod-txs">${S.recentOut.map((t) => `<button data-mtx="${target}:${t.id}">${logo(t, 26, 7)}<span class="grow"><span>${esc(t.description)} <span class="muted">· ${dd(t.date)}</span></span>${aiLine(t.aiShort, 'd-ai')}</span><span class="mono">${n2(Math.abs(t.amount))} kr</span><span class="acc-l">+</span></button>`).join('') || '<div class="note" style="padding:12px">Ingen utgifter ennå.</div>'}</div>` : skel(120);

/* ===================== Subscription OS ===================== */

const CYC = [['monthly', 'Månedlig'], ['yearly', 'Årlig'], ['biennial', 'Hvert 2. år']];

function subPage() {
  const d = S.subs;
  if (!d) return skel(400);
  const mode = u.subMode ?? 'new';
  const rows = d.items.map((s) => {
    const off = !s.active;
    const [btn, bg, fg] = off ? ['Sagt opp', '#1B1B20', 'var(--muted)'] : s.lowUse ? ['Si opp', 'rgba(255,122,61,.15)', 'var(--acc-l)'] : ['Aktiv', 'transparent', 'var(--sub)'];
    return `<div class="sub-row${off ? ' off' : ''}">${logo({ ...s, description: s.name, color: '#A0A0AA' }, 32, 9)}
      <span class="ell-wrap"><b style="font-weight:500;display:block">${esc(s.name)}</b><span class="note" style="font-size:12px">${esc(s.plan || s.cycleName || 'Månedlig')}</span>${aiLine(s.aiShort, 'd-ai')}</span>
      <span class="sub sub-next">${s.nextDate ? 'Neste trekk ' + dd(s.nextDate) : '–'}<select class="sel sm" data-msub-cyc="${s.id}" aria-label="Trekk-intervall">${CYC.map(([v, l]) => `<option value="${v}"${s.cycle === v ? ' selected' : ''}>${l}</option>`).join('')}</select></span>
      <span style="color:${s.lowUse && !off ? 'var(--acc-l)' : 'var(--sub)'}">${esc(s.usageNote || '–')}</span>
      <span class="sub-price"><b class="mono">${n0(s.price)} kr<small class="muted">${s.perLabel ?? (s.cycle === 'yearly' ? '/år' : '/mnd')}</small></b>${s.cycle !== 'monthly' ? `<small class="muted">≈ ${n0(s.monthly)} kr/mnd</small>` : ''}</span>
      <span class="sub-btns"><button class="mod-tog" style="background:${bg};color:${fg}" data-msub-tog="${s.id}" title="${off ? 'Aktiver igjen' : s.lowUse ? 'Marker som sagt opp' : 'Marker som sagt opp'}">${btn}</button><button class="x-btn sm" data-msub-low="${s.id}" title="${s.lowUse ? 'Fjern «lite brukt»' : 'Marker som lite brukt'}">${s.lowUse ? '◐' : '○'}</button><button class="x-btn sm" data-msub-del="${s.id}" aria-label="Slett">×</button></span></div>`;
  }).join('');
  return `<div class="mod">
    <div class="mod-kpis">
      ${card(`<div class="sub">Per måned</div><b class="mono mod-big">${kr0(d.monthly)}</b>`, 'padding:18px')}
      ${card(`<div class="sub">Per år</div><b class="mono mod-big">${kr0(d.yearly)}</b>`, 'padding:18px')}
      <section class="card acc-card" style="padding:18px"><div class="acc-l">Lite brukt, kan sies opp</div><b class="mono mod-big">${n0(d.lowUse)} kr/mnd</b></section>
    </div>
    <div class="mod-box"><b>Legg til abonnement</b>${modes('sub', mode)}
      ${mode === 'new' ? `<form class="mod-grid" data-mform="sub"><input class="inp" name="name" placeholder="Tjeneste, f.eks. Disney+" required><input class="inp" name="plan" placeholder="Plan"><select class="inp" name="cycle" aria-label="Trekk-intervall">${CYC.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><input class="inp" name="price" placeholder="kr per trekk" inputmode="decimal" required><input class="inp" name="nextDate" placeholder="Neste trekk dd.mm"><button class="btn pri">Legg til</button></form>`
        : mode === 'rc' ? dropRc('sub') : txPick('sub')}
    </div>
    ${card(rows || '<div class="empty">Ingen abonnementer ennå. Legg til ett over, eller fra en transaksjon.</div>', 'padding:0;gap:0;overflow:hidden')}
  </div>`;
}

/* ===================== Delte mapper ===================== */

const MONTHS_LONG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const TYPES = ['Enebolig', 'Leilighet', 'Hytte', 'Utleie', 'Annet'];
const ROLE_N = { owner: 'Eier', editor: 'Kan redigere', viewer: 'Kan se' };
const short = (n) => esc(String(n ?? '').slice(0, 2).toUpperCase());
const optList = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');

function dirPage() {
  const list = S.folders;
  if (!list) return skel(400);
  const cur = S.folder;
  const mode = u.dirMode ?? 'new';
  const me = S.boot.me ?? {};
  const users = (S.users ?? []).filter((x) => x.id !== me.id);
  const pick = u.newPick ?? [];
  const cards = list.map((f) => {
    const others = f.members.filter((m) => !m.you).map((m) => m.name);
    return `<button class="dir-card${cur?.id === f.id ? ' on' : ''}" data-mdir="${f.id}"><span class="dir-card-h"><b>${esc(f.name)}</b><span class="mtag">${esc(f.type || 'Mappe')}</span></span>
      <span class="note" style="font-size:12.5px">${others.length ? 'Delt med ' + esc(others.join(', ')) : 'Bare deg'}</span><span class="dir-card-f"><span>Du: ${esc((f.myRole ?? '').toLowerCase())}</span><span class="mono">${kr0(f.yearTotal)} i år</span></span></button>`;
  }).join('');
  const create = `<form class="dir-new" data-mform="folder"><b>Ny bolig eller delt mappe</b><input class="inp" name="name" placeholder="Navn, f.eks. Hytta Geilo" required>
    <input class="inp" name="address" placeholder="Adresse (valgfritt)"><select class="inp" name="type">${optList(TYPES.map((t) => [t, t]), 'Enebolig')}</select>
    ${users.length ? `<span class="note" style="font-size:12px">Del med</span><div class="pick">${users.map((x) => `<button type="button" class="pick-u${pick.includes(x.id) ? ' on' : ''}" data-mpick="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : '<span class="note" style="font-size:12px">Nye brukere legges til av admin under Innstillinger → Innlogging i Homelab.</span>'}
    <button class="btn pri">Opprett</button></form>`;
  const left = `<div class="dir-left">${cards || `<div class="card note" style="padding:16px;font-size:13.5px">Ingen boliger er delt med ${esc(me.name ?? 'deg')} ennå.</div>`}${create}</div>`;
  if (!cur) return `<div class="dir-layout">${left}</div>`;

  const k = cur.kpi;
  const pctStrom = k.stromPrev ? Math.round((k.stromNow / k.stromPrev - 1) * 100) : null;
  const kpis = [['Brukt i år', kr0(k.yearTotal), `${k.count} utgifter og kvitteringer`], ['Snitt per måned', kr0(k.perMonth), k.months > 1 ? `januar–${MONTHS_LONG[k.months - 1]}` : 'januar'],
    ['Strøm i år', kr0(k.stromYear), `Denne måneden ${kr0(k.stromNow)}${pctStrom !== null ? ` · ${pctStrom >= 0 ? '+' : '−'}${Math.abs(pctStrom)} % mot forrige` : ''}`],
    cur.projects.length ? ['Igjen på prosjekter', kr0(k.projectsLeft), k.projectNames.join(', ')] : ['Kategorier', String(k.catCount), 'med utgifter i år']]
    .map(([l, v, sub]) => `<div class="card mod-kpi"><span class="note" style="font-size:13px">${l}</span><b class="mono">${v}</b><span class="muted" style="font-size:12px">${esc(sub)}</span></div>`).join('');
  const mMax = Math.max(1, ...cur.months.map((m) => m.total));
  const top = cur.months.reduce((a, m) => (m.total > a.total ? m : a), cur.months[0] ?? { total: 0, label: '' });
  const catColor = Object.fromEntries(cur.categories.map((c) => [c.name, c.color]));
  const chart = `<div class="dir-chart">${cur.months.map((m) => `<div class="dir-col" title="${m.label}: ${n0(m.total)} kr"><div class="dir-bar" style="height:${(m.total / mMax) * 100}%">${Object.entries(m.byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span style="flex:${Math.max(1, Math.round(v))} 1 0;background:${u.dcat && u.dcat !== c ? '#2A2A31' : catColor[c] ?? '#6E6E78'}"></span>`).join('')}</div><span>${m.label}</span></div>`).join('')}</div>`;
  const catsHtml = cur.categories.map((c) => `<button class="dir-cat${u.dcat === c.name ? ' on' : ''}" data-mdcat="${esc(c.name)}" style="--c:${c.color}"><span class="dir-cat-h"><span><i style="background:${c.color}"></i>${esc(c.name)}</span><span class="mono">${kr0(c.sum)}</span></span><span class="prog"><i style="width:${c.pct}%;background:${c.color}"></i></span></button>`).join('') || '<div class="note">Ingen utgifter i år.</div>';
  const projects = cur.projects.map((p) => {
    const over = p.remaining < 0;
    return `<div class="dir-proj"><div class="dir-proj-h"><div><b>${esc(p.name)}</b><div class="note" style="font-size:12.5px">${esc(p.vendor)} · ${esc(p.category)}</div></div><div style="text-align:right"><b class="mono">${n0(p.spent)} / ${n0(p.budget)} kr</b><div style="font-size:12px;color:${over ? '#FF8A7A' : 'var(--dim)'}">${over ? `${n0(-p.remaining)} kr over budsjett` : `${n0(p.remaining)} kr gjenstår`}</div></div></div>
      <div class="prog" style="height:8px"><i style="width:${Math.min(100, p.budget ? (p.spent / p.budget) * 100 : 0)}%;background:${over ? '#FF8A7A' : 'var(--acc)'}"></i></div>
      <div>${p.installments.map((x) => `<div class="inst"><span class="inst-mark${x.paid ? ' on' : ''}">${x.paid ? '✓' : ''}</span><span class="grow">${esc(x.label)} <span class="muted" style="font-size:12.5px">· ${esc(/^\d{4}-\d{2}-\d{2}$/.test(x.due ?? '') ? dd(x.due) : x.due ?? '–')}</span></span><span class="mono">${kr0(x.amount)}</span>${!x.paid && cur.canEdit ? `<button class="btn sm pay" data-mpay="${x.id}">Registrer betalt</button>` : ''}</div>`).join('')}
      ${cur.canEdit ? `<form class="inst-add" data-mform="inst" data-pid="${p.id}"><input class="inp" name="label" placeholder="Nytt avdrag" required><input class="inp" name="due" placeholder="Forfall dd.mm"><input class="inp" name="amount" placeholder="kr" inputmode="decimal" required><button class="btn sm">+</button></form>` : ''}</div></div>`;
  }).join('') || '<div class="note" style="font-size:13.5px">Ingen prosjekter. Legg til et for å følge budsjett og avdrag til håndverkere.</div>';
  const bills = cur.bills.map((b) => `<div class="bill"><span class="bill-ic" style="background:${b.color}22;color:${b.color}">${esc(b.category.slice(0, 1))}</span><span class="grow"><span style="display:block;font-size:14px">${esc(b.category)}</span><span class="note" style="font-size:12px">${esc(b.name)}${b.payer ? ' · ' + esc(b.payer) : ''} · ${esc(b.freq)}</span></span>
    <span style="text-align:right"><b class="mono" style="display:block;font-size:14px">${b.last ? kr0(b.last.amount) : '–'}</b><span class="note" style="font-size:12px;white-space:nowrap">neste ${b.nextDue ? (/^\d{4}-\d{2}-\d{2}$/.test(b.nextDue) ? dd(b.nextDue) : esc(b.nextDue)) : '–'}</span></span>${cur.canEdit ? `<button class="x-btn sm" data-mbill-del="${b.id}" aria-label="Fjern regning">×</button>` : ''}</div>`).join('');
  const names = cur.members.map((m) => m.name);
  const billAdd = cur.canEdit ? `<form class="inst-add" data-mform="bill"><input class="inp" name="name" placeholder="Fra, f.eks. Fjordkraft" required><select class="inp" name="category">${optList(cur.catOptions.map((c) => [c, c]), 'Strøm')}</select><select class="inp" name="freq">${optList(cur.freqs.map((c) => [c, c]), 'Månedlig')}</select><select class="inp" name="payer">${optList([['', 'Hvem betaler'], ...names.map((n) => [n, n])], '')}</select><input class="inp" name="nextDue" placeholder="Neste dd.mm"><button class="btn sm">+</button></form>` : '';
  const split = `<div style="display:flex;flex-direction:column;gap:6px;padding-top:6px"><span class="note" style="font-size:12.5px">Fordeling · ${cur.split === 'equal' ? 'likt delt' : 'egen nøkkel'}${cur.isOwner ? ` · <button class="link-btn" data-mact="split-edit">${u.splitEdit ? 'Lukk' : 'Endre'}</button>` : ''}</span>
    <div class="dir-bal">${cur.balances.map((b) => `<span>${esc(b.name)} <b class="mono" style="color:${b.balance >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${b.balance >= 0 ? '+' : '−'}${n0(Math.abs(b.balance))} kr</b></span>`).join('')}</div>
    ${u.splitEdit ? `<form class="inst-add" data-mform="split">${cur.members.map((m) => `<label class="note" style="font-size:12px;display:flex;flex-direction:column;gap:4px">${esc(m.name)}<input class="inp" name="w:${esc(m.name)}" value="${cur.weights[m.name] ?? 1}" inputmode="decimal" style="width:80px"></label>`).join('')}<button class="btn sm" name="equal" value="1">Likt</button><button class="btn sm pri">Lagre nøkkel</button></form>` : ''}</div>`;
  // Deling.
  const acl = cur.members.map((m) => {
    const lastOwner = m.role === 'owner' && cur.owners <= 1;
    const editable = cur.isOwner && !m.you;
    return `<div class="acl"><span class="av-s">${short(m.name)}</span><span class="grow">${esc(m.name)} <span class="muted" style="font-size:12.5px">${m.you ? '(deg)' : m.login ? '' : '(uten innlogging)'}</span></span>
      ${editable ? `<select class="sel" data-mrole="${m.id}">${optList(Object.entries(ROLE_N), m.role)}</select><button class="x-btn sm" data-mrm="${m.id}" aria-label="Fjern ${esc(m.name)}">×</button>` : `<span class="sub" style="font-size:13px;padding:0 10px">${ROLE_N[m.role] ?? 'Kan redigere'}</span>`}
      ${m.you && !lastOwner ? `<button class="btn sm" data-mrm="${m.id}" data-leave="1" style="color:var(--acc-l)">Forlat</button>` : ''}</div>`;
  }).join('');
  const invOpts = (S.users ?? []).filter((x) => !cur.members.some((m) => m.userId === x.id));
  const share = u.shareOpen ? `<div class="share-box"><div class="card-h" style="align-items:baseline"><b style="font-size:14px">Deling</b><span class="note" style="font-size:12px">${cur.isOwner ? 'Eiere kan dele, endre tilgang og fjerne medlemmer' : 'Bare eiere kan endre deling'}</span></div>${acl}
    ${cur.isOwner ? (invOpts.length ? `<form class="share-add" data-mform="share"><select class="inp" name="userId" required><option value="">Velg bruker …</option>${invOpts.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.username)})</option>`).join('')}</select><select class="inp" name="role">${optList([['editor', 'Kan redigere'], ['viewer', 'Kan se']], 'editor')}</select><button class="btn pri">Del</button></form>` : '<span class="note" style="font-size:12px">Alle brukere har tilgang. Nye brukere legges til av admin under Innstillinger → Innlogging i Homelab.</span>') : ''}</div>` : '';
  const rows = cur.entries.filter((e) => !u.dcat || e.category === u.dcat);
  const listHtml = rows.map((e) => `<div class="dir-row2">${logo({ ...e, color: '#A0A0AA' }, 30, 8)}<span class="grow ell-wrap"><span class="ell" style="display:block">${esc(e.description)}</span>
    <span class="dir-meta"><span class="mtag" style="background:${e.color}1F;color:${e.color}">${esc(e.category)}</span>${e.project ? `<span class="mtag">${esc(e.project)}</span>` : ''}${dd(e.date)} · betalt av ${esc(e.paidBy)}</span>${aiLine(e.aiShort, 'd-ai')}</span>
    <b class="mono" style="white-space:nowrap">${e.pending ? '…' : kr0(e.amount)}</b>${cur.canEdit ? `<button class="x-btn sm" data-mentry-del="${e.id}" aria-label="Fjern">×</button>` : ''}</div>`).join('') || '<div class="note" style="padding:18px 0;border-top:1px solid var(--sep)">Ingen utgifter her ennå.</div>';
  const addBox = cur.canEdit ? `<div class="mod-box"><b>Legg til utgift eller kvittering</b>${modes('dir', mode)}
    ${mode === 'new' ? `<form class="mod-grid" data-mform="entry"><input class="inp" name="description" placeholder="Beskrivelse, f.eks. Plantasjen" required><input class="inp" name="amount" placeholder="Beløp" inputmode="decimal" required>
      <select class="inp" name="category">${optList([['', 'Kategori: ✦ automatisk'], ...cur.catOptions.map((c) => [c, c])], '')}</select><select class="inp" name="projectId">${optList([['', 'Uten prosjekt'], ...cur.projects.map((p) => [p.id, p.name])], '')}</select>
      <select class="inp" name="paidBy">${optList(names.map((n) => [n, 'Betalt av ' + n]), cur.members.find((m) => m.you)?.name)}</select><button class="btn pri">Legg til</button></form>`
      : mode === 'rc' ? `<label class="mod-drop"><b>Last opp kvitteringer og regninger</b><span>Flere filer · AI leser butikk, dato, beløp og kategori i bakgrunnen</span><input type="file" multiple accept="image/*,application/pdf" data-mrc="folder" hidden></label>`
      : S.boot.restricted ? '<div class="note" style="padding:12px">Transaksjoner fra regnskapet kan bare flyttes hit av en administrator.</div>' : txPick('folder')}</div>`
    : '<div class="card note" style="padding:12px 14px;font-size:13px">Du har lesetilgang. Be en eier om redigeringstilgang for å legge til utgifter og kvitteringer.</div>';
  const right = `<div class="dir-main">
    <div class="card-h" style="align-items:flex-start;flex-wrap:wrap;gap:14px"><div style="min-width:0"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b style="font-size:24px;font-weight:600;letter-spacing:-.02em">${esc(cur.name)}</b><span class="mtag">${esc(cur.type)}</span></div><div class="note" style="font-size:13px;margin-top:4px">${esc(cur.address || '')}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-mact="share-toggle" aria-pressed="${!!u.shareOpen}">Del · ${cur.members.length} ${cur.members.length === 1 ? 'person' : 'personer'}</button>${cur.isOwner ? '<button class="btn danger" data-mact="del-folder">Slett</button>' : ''}</div></div>
    ${share}
    <div class="mod-kpis">${kpis}</div>
    <div class="row-flex">${card(`<div class="card-h" style="align-items:baseline"><h3>Utgifter per måned</h3><span class="note" style="font-size:12.5px">${top.total ? `Høyeste: ${top.label} · ${kr0(top.total)}` : ''}</span></div>${chart}`, 'flex:2 1 380px;padding:20px;gap:14px')}
      ${card(`<div class="card-h" style="align-items:baseline"><h3>Kategorier</h3>${u.dcat ? '<button class="link-btn" data-mact="dcat-clear">Vis alle</button>' : ''}</div><div style="display:flex;flex-direction:column;gap:4px">${catsHtml}</div>`, 'flex:1 1 240px;padding:20px;gap:14px')}</div>
    <div class="row-flex">${card(`<h3>Prosjekter</h3>${projects}${cur.canEdit ? '<form class="inst-add" data-mform="project"><input class="inp" name="name" placeholder="Nytt prosjekt, f.eks. Ny terrasse" required style="flex:2 1 160px"><input class="inp" name="vendor" placeholder="Håndverker"><input class="inp" name="budget" placeholder="Budsjett kr" inputmode="decimal" required><button class="btn pri sm">Legg til</button></form>' : ''}`, 'flex:3 1 380px;padding:20px;gap:14px')}
      ${card(`<h3>Faste regninger</h3>${bills || '<div class="note" style="font-size:13.5px">Ingen faste regninger.</div>'}${billAdd}${split}`, 'flex:2 1 260px;padding:20px;gap:10px')}</div>
    ${addBox}
    ${card(`<div class="card-h" style="padding:12px 0"><h3>${esc(u.dcat || 'Alle utgifter')}</h3><span class="note" style="font-size:12.5px">${rows.length} poster · ${kr0(rows.reduce((a, e) => a + e.amount, 0))}</span></div>${listHtml}`, 'padding:8px 20px;gap:0')}
  </div>`;
  return `<div class="dir-layout">${left}${right}</div>`;
}

/* ===================== Finn-handler ===================== */

function finnPage() {
  const d = S.finn;
  if (!d) return skel(400);
  const rows = d.items.map((r) => {
    const sold = r.role === 'sold';
    return `<div class="card finn-row"><div><span class="role ${sold ? 'sold' : 'bought'}">${sold ? 'Solgt' : 'Kjøpt'}</span><b style="display:block;font-weight:500;margin-top:6px">${esc(r.item)}</b><span class="note" style="font-size:12px">${esc(r.counterpart)}${r.counterpart ? ' · ' : ''}${dd(r.date)}${r.txId ? ' · matchet mot bankpost' : ''}</span></div>
      <div class="finn-steps">${r.steps.map((s, i) => `<button class="step${s.done ? ' done' : ''}" data-mfinn-step="${r.id}:${i}" title="Marker som ${s.done ? 'ikke fullført' : 'fullført'}">${esc(s.t)}</button>`).join('')}</div>
      <b class="mono" style="text-align:right;color:${sold ? 'var(--pos)' : 'var(--text)'}">${sold ? '+' : '−'}${n0(r.amount)} kr</b><button class="x-btn sm" data-mfinn-del="${r.id}" aria-label="Slett">×</button></div>`;
  }).join('');
  return `<div class="mod">
    <div class="mod-kpis">${[['Kjøpt i år', kr0(d.bought)], ['Solgt i år', kr0(d.sold)], ['Pågående handler', String(d.ongoing)]].map(([l, v]) => card(`<div class="sub">${l}</div><b class="mono" style="font-size:24px">${v}</b>`, 'padding:18px')).join('')}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${rows || card('<div class="empty">Ingen Finn-handler ennå.</div>')}</div>
    <form class="mod-box" data-mform="finn"><b>Legg til fra e-post</b><span class="note" style="font-size:13px">Lim inn en e-post fra Finn (Trygg betaling, Fiks ferdig eller Tillit). AI trekker ut gjenstand, motpart, beløp og status, og matcher mot bankposten.</span>
      <textarea class="inp mod-ta" name="email" rows="5" placeholder="Lim inn e-posten her …" required></textarea><div><button class="btn pri">Les e-posten</button></div></form>
    <div class="note" style="font-size:13px">Kilde: e-postkvitteringer fra Finn (Trygg betaling, Fiks ferdig-frakt, Tillit forsikring) leses av AI og matches mot bankposter. ${d.imap.configured ? 'IMAP er konfigurert; automatisk henting kommer i en senere versjon.' : 'Automatisk henting via IMAP settes opp i Innstillinger → Bank og import (kommer).'}</div>
  </div>`;
}

/* ===================== Import ===================== */

export function impPage() {
  const im = S.imp ?? (S.imp = { rows: [], status: 'Lim inn tekst eller velg filer. Flere filer kan velges samtidig.', text: '' });
  const n = im.rows.filter((r) => !r.duplicate).length;
  const accOptions = accs().map((a) => `<option value="${a.id}"${String(a.id) === String(u.impAcc ?? '') ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  return `<div class="mod">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="btn pri" style="cursor:pointer">Velg filer (.xlsx, .csv, .txt)<input type="file" multiple accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-mimp hidden></label>
      <select class="sel" data-mimp-acc aria-label="Konto">${accOptions}</select><span class="note" style="font-size:13px">${esc(im.status)}</span></div>
    <textarea class="inp mod-ta mono" data-mimp-text rows="6" placeholder="Dato&#9;Forklaring&#9;Rentedato&#9;Ut&#9;Inn&#10;10/14/26&#9;Visa 100021 Ruterappen&#9;10/15/26&#9;238.00">${esc(im.text)}</textarea>
    ${im.rows.length ? card(im.rows.map((r) => `<div class="imp-row${r.duplicate ? ' dup' : ''}">${logo({ description: r.description, domain: r.domain, color: '#A0A0AA' }, 28, 8)}<span class="mono note" style="font-size:12px">${dd(r.date)}</span>
      <span class="ell-wrap"><span style="display:block">${esc(r.description)}</span>${aiLine(r.aiShort, 'd-ai')}<span class="muted ell" style="font-size:12px;display:block">${esc(r.raw)}</span></span>
      <span class="note" style="font-size:13px">${r.duplicate ? 'Finnes fra før' : esc(r.category ?? 'AI kategoriserer')}</span><b class="mono" style="text-align:right;color:${r.amount > 0 ? 'var(--pos)' : 'var(--text)'}">${sgn(r.amount)}</b></div>`).join(''), 'padding:0;gap:0;overflow:hidden') : ''}
    <div style="display:flex;justify-content:flex-end"><button class="btn" style="background:var(--text);color:var(--bg)" data-mact="imp-commit" ${n ? '' : 'disabled'}>Importer ${n} poster</button></div>
  </div>`;
}

/* ===================== Aksjer (Trading 212) ===================== */

const PCOL = ['#FF7A3D', '#7AA7FF', '#5FD3A8', '#F2C14E', '#B79CFF', '#FF6B8B', '#8FD3FF', '#C9E265'];
const PERIODS = [['1m', '1M', 31], ['3m', '3M', 92], ['1y', '1 år', 366], ['all', 'Alt', 1e6]];
const cur$ = (v, c) => `${n2(v)} ${c === 'NOK' || !c ? 'kr' : esc(c)}`;
const pctTxt = (v) => (v == null || !Number.isFinite(v) ? '–' : `${v >= 0 ? '+' : '−'}${n2(Math.abs(v)).replace(/,00$/, '')} %`);

function aksPage() {
  const d = S.stocks;
  if (!d) return skel(400);
  const st = S.boot.settings;
  const env = d.env ?? st.t212Env ?? 'live';
  const ok = d.configured || d.mock;
  const dot = d.error ? '#FF8A7A' : ok ? '#5FD3A8' : '#6E6E78';
  const cfgOpen = u.aksCfg ?? !ok;
  const head = `<div class="card aks-head"><span class="aks-logo">212</span><div class="grow"><div style="font-weight:600">Trading 212 · Invest</div><div class="note" style="font-size:12.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="dot" style="background:${dot}"></span>${esc(d.status ?? '')}${d.syncedAt ? ` · ${new Date(d.syncedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : ''}</div></div>
    <div class="seg">${[['live', 'Live'], ['demo', 'Demo']].map(([v, l]) => `<button data-maks-env="${v}" aria-pressed="${env === v}">${l}</button>`).join('')}</div>
    <button class="btn pri" data-mact="aks-sync" ${ok ? '' : 'disabled'}>Synk nå</button><button class="btn" data-mact="aks-cfg" aria-pressed="${cfgOpen}">API-nøkkel</button></div>`;
  const cfg = cfgOpen ? `<form class="card" data-mform="aks" style="padding:18px;gap:12px"><div class="form-grid"><label class="f">API-nøkkel<input class="inp mono" name="key" placeholder="${st.t212Set ? '•••••••• lagret på serveren' : 'f.eks. 35875800ZxYa…'}" autocomplete="off"></label>
    <label class="f">API-secret<input class="inp" type="password" name="secret" placeholder="${st.t212Set ? '•••••••• lagret på serveren' : 'Vises bare én gang i Trading 212'}" autocomplete="new-password"></label></div>
    <div class="sub" style="font-size:13px;line-height:1.5">Lag nøkkelen på nettsiden til Trading 212 under Innstillinger → API (Beta). Velg bare lesetilganger: <b>account</b>, <b>portfolio</b>, <b>history:orders</b> og <b>history:dividends</b>, og lås den gjerne til IP-adressen til homelaben. Nøkkel og secret lagres kryptert på serveren og vises aldri igjen.</div>
    <div class="mono note aks-api">Authorization: Basic base64(KEY:SECRET)<br>GET ${esc(d.base)}/equity/account/summary<br>GET ${esc(d.base)}/equity/portfolio<br>GET ${esc(d.base)}/equity/history/orders?limit=50<br>GET ${esc(d.base)}/history/dividends?limit=50</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn pri">Lagre og synk</button>${st.t212Set ? '<button type="button" class="btn danger" data-mact="aks-clear">Fjern nøkkel</button>' : ''}</div></form>` : '';
  if (!d.summary) return `<div class="mod">${head}${cfg}${d.configured ? card(`<div class="empty">${esc(d.error ?? 'Henter data …')}</div>`) : ''}</div>`;
  const s = d.summary, c = s.currency;
  const plPct = s.invested ? (s.result / s.invested) * 100 : 0;
  const per = PERIODS.find(([k]) => k === (u.aksPer ?? '3m'));
  const from = new Date(Date.now() - per[2] * 86400_000).toLocaleDateString('sv-SE');
  const hist = (d.history ?? []).filter((h) => h.date >= from);
  let chart = '<div class="empty" style="padding:40px 0">Historikken bygges opp ett punkt per dag etter hvert som du synker.</div>', perTxt = '', perC = 'var(--dim)';
  if (hist.length > 1) {
    const vals = hist.map((h) => h.value), mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const pts = hist.map((h, i) => [(i / (hist.length - 1)) * 600, 170 - ((h.value - mn) / rng) * 150]);
    const line = smooth(pts);
    chart = `<svg viewBox="0 0 600 180" preserveAspectRatio="none" style="width:100%;height:200px;display:block" aria-hidden="true"><path d="M0 45H600M0 90H600M0 135H600" stroke="#1E1E23"/><path d="${line} L600 180 L0 180 Z" fill="rgba(95,211,168,.12)"/><path d="${line}" fill="none" stroke="#5FD3A8" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    const ch = vals.at(-1) - vals[0];
    perTxt = `${ch >= 0 ? '+' : '−'}${cur$(Math.abs(ch), c)} (${pctTxt((ch / (vals[0] || 1)) * 100)}) siste ${per[1].toLowerCase()}`; perC = ch >= 0 ? 'var(--pos)' : '#FF8A7A';
  }
  const pos = d.positions ?? [], tot = pos.reduce((a, p) => a + p.value, 0) || 1;
  const kpis = [['Porteføljeverdi', cur$(s.total, c), `Investert ${cur$(s.invested, c)}`, 'var(--text)'], ['Avkastning', `${s.result >= 0 ? '+' : '−'}${cur$(Math.abs(s.result), c)}`, pctTxt(plPct), s.result >= 0 ? 'var(--pos)' : '#FF8A7A'],
    ['Kontanter', cur$(s.cash, c), 'Tilgjengelig for handel', 'var(--text)'], ['Utbytte i år', cur$((d.dividends ?? []).filter((x) => x.date?.startsWith(String(new Date().getFullYear()))).reduce((a, x) => a + x.amount, 0), c), `${(d.dividends ?? []).length} utbetalinger`, 'var(--pos)']]
    .map(([l, v, sub, col]) => `<div class="card mod-kpi" style="padding:18px 20px"><span class="sub">${l}</span><b class="mono" style="font-size:25px;color:${col}">${v}</b><span class="muted" style="font-size:12.5px">${sub}</span></div>`).join('');
  const posRows = pos.map((p, i) => { const col = PCOL[i % PCOL.length]; return `<div class="aks-row"><span class="aks-pos"><span class="aks-tk" style="background:${col}22;color:${col}">${esc(p.symbol.slice(0, 5))}</span><span class="ell-wrap"><b class="ell" style="display:block;font-weight:500">${esc(p.name)}</b><span class="note" style="font-size:12px">${esc(p.ticker)}</span></span></span>
    <span class="mono r">${n2(p.quantity).replace(/,00$/, '')}</span><span class="mono r sub">${n2(p.avg)}</span><span class="mono r">${n2(p.price)}</span><b class="mono r">${n2(p.value)}</b>
    <span class="mono r" style="color:${p.pl >= 0 ? 'var(--pos)' : '#FF8A7A'}">${p.pl >= 0 ? '+' : '−'}${n2(Math.abs(p.pl))}<span style="display:block;font-size:12px">${pctTxt(p.plPct)}</span></span><span class="mono r" style="color:${(p.dayPct ?? 0) >= 0 ? 'var(--pos)' : '#FF8A7A'}">${pctTxt(p.dayPct)}</span></div>`; }).join('');
  const divs = (d.dividends ?? []).slice(0, 8).map((x) => `<div class="kv-line"><span>${esc(x.symbol)} <span class="muted" style="font-size:12.5px">· ${dd(x.date)}</span></span><span class="mono pos">${cur$(x.amount, c)}</span></div>`).join('') || '<div class="note">Ingen utbytte ennå.</div>';
  const orders = (d.orders ?? []).slice(0, 8).map((o) => `<div class="kv-line" style="align-items:center"><span style="display:flex;align-items:center;gap:10px"><span class="mtag" style="background:${o.side === 'Kjøp' ? 'rgba(122,167,255,.15)' : '#1F3A2F'};color:${o.side === 'Kjøp' ? '#A9C3FF' : 'var(--pos)'}">${o.side}</span>${esc(o.symbol)} <span class="muted" style="font-size:12.5px">· ${n2(o.quantity).replace(/,00$/, '')} stk · ${dd(o.date)}</span></span><span class="mono">${cur$(o.value, c)}</span></div>`).join('') || '<div class="note">Ingen ordre.</div>';
  return `<div class="mod">${head}${cfg}${d.error ? `<div class="err-msg">${esc(d.error)} · viser siste kjente data</div>` : ''}
    <div class="mod-kpis">${kpis}</div>
    <div class="row-flex">${card(`<div class="card-h"><div><h2>Porteføljeverdi</h2><div style="font-size:13px;color:${perC}">${perTxt}</div></div><div class="seg">${PERIODS.map(([k2, l]) => `<button data-maks-per="${k2}" aria-pressed="${per[0] === k2}">${l}</button>`).join('')}</div></div>${chart}`, 'flex:2 1 520px;padding:22px;gap:14px')}
      ${card(`<h2>Fordeling</h2><div class="aks-dist">${pos.map((p, i) => `<span style="flex:${p.value / tot} 1 0;background:${PCOL[i % PCOL.length]}"></span>`).join('')}</div><div style="display:flex;flex-direction:column;gap:8px">${pos.map((p, i) => `<div style="display:flex;align-items:center;gap:10px;font-size:13.5px"><span style="width:9px;height:9px;border-radius:3px;background:${PCOL[i % PCOL.length]}"></span><span class="grow ell">${esc(p.name)}</span><span class="mono sub">${n0((p.value / tot) * 100)} %</span></div>`).join('')}</div>`, 'flex:1 1 300px;padding:22px;gap:14px')}</div>
    <section class="card" style="padding:8px 0;overflow-x:auto"><div style="min-width:720px"><div class="aks-row aks-th"><span>Posisjon</span><span class="r">Antall</span><span class="r">Snittkurs</span><span class="r">Kurs</span><span class="r">Verdi</span><span class="r">Avkastning</span><span class="r">I dag</span></div>${posRows || '<div class="empty">Ingen posisjoner.</div>'}</div></section>
    <div class="row-flex">${card(`<div class="card-h" style="align-items:baseline"><h2>Utbytte</h2></div>${divs}`, 'flex:1 1 320px;padding:22px;gap:4px')}${card(`<h2>Siste ordre</h2>${orders}`, 'flex:1 1 320px;padding:22px;gap:4px')}</div>
  </div>`;
}

/* ===================== Backup og data (Innstillinger) ===================== */

const SCHED = [['off', 'Bare manuelt'], ['daily', 'Hver natt kl. 03.00'], ['weekly', 'Hver søndag kl. 03.00'], ['change', 'Etter hver endring (maks 1 per time)']];
const size = (b) => (b == null ? '–' : b > 1e9 ? `${n2(b / 1e9)} GB` : b > 1e6 ? `${n2(b / 1e6)} MB` : `${n0(b / 1e3)} kB`);
const TLABEL = { fh_accounts: 'Kontoer', fh_categories: 'Kategorier', fh_transactions: 'Transaksjoner', fh_receipts: 'Kvitteringer', fh_budgets: 'Budsjett', fh_recurring: 'Faste utgifter', fh_rules: 'Regler',
  fh_goals: 'Sparemål', fh_subscriptions: 'Abonnementer', fh_folders: 'Mapper', fh_folder_members: 'Mappemedlemmer', fh_folder_entries: 'Mappeposter', fh_folder_projects: 'Prosjekter',
  fh_project_installments: 'Avdrag', fh_folder_bills: 'Regninger', fh_finn: 'Finn-handler', receipt_files: 'Kvitteringsbilder', users: 'Brukere', kv: 'Innstillinger' };

function stagePreview() {
  const st = S.stage;
  if (!st) return '';
  const keys = [...new Set([...Object.keys(st.counts ?? {}), ...Object.keys(st.current ?? {})])].filter((k) => TLABEL[k] && ((st.counts?.[k] ?? 0) || (st.current?.[k] ?? 0)));
  return `<div class="stage"><div class="card-h"><b>Forhåndsvisning · ${esc(st.label ?? '')}</b><span class="note" style="font-size:12px">${{ json: 'Full backup (.json)', xlsx: 'Excel-database', archive: 'SMB-backup' }[st.kind] ?? ''}</span></div>
    <div class="stage-grid"><span class="note">Tabell</span><span class="note r">I backupen</span><span class="note r">Nå</span>${keys.map((k) => `<span>${TLABEL[k]}</span><b class="mono r">${n0(st.counts?.[k] ?? 0)}</b><span class="mono r sub">${st.current?.[k] != null ? n0(st.current[k]) : '–'}</span>`).join('')}</div>
    <div class="note" style="font-size:12.5px">${st.kind === 'archive' ? 'Hele databasen erstattes med innholdet i backupen (innlogginger som pågår beholdes), og bildene kopieres på plass.' : 'Radene legges inn med samme ID. Finnes en rad med samme ID fra før, overskrives den. Å importere samme fil to ganger gir samme resultat.'}</div>
    <div style="display:flex;gap:10px"><button class="btn pri" data-mact="bk-restore">Gjenopprett</button><button class="btn" data-mact="bk-cancel">Avbryt</button></div></div>`;
}

export function backupTab() {
  const b = S.backup;
  if (!b) return skel(300);
  const c = b.config;
  const last = b.history?.find((h) => h.status === 'ok');
  const failed = b.history?.[0]?.status === 'failed' ? b.history[0] : null;
  const [stBg, stBd, stDot, stTitle, stSub] = b.running ? ['#142032', '#22324A', '#9DBDFF', 'Backup kjører …', 'Lager arkiv og laster opp til sharen']
    : failed ? ['#24140E', '#4A2A20', '#FF8A7A', 'Siste backup feilet', failed.error ?? '']
    : last ? ['#13201B', '#1F3A2F', '#5FD3A8', `Siste backup ${new Date(last.created).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, `${last.file} · ${size(last.size)}${b.nextRun ? ` · neste ${typeof b.nextRun === 'number' ? new Date(b.nextRun).toLocaleString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : b.nextRun}` : ''}`]
    : ['#101013', '#24242A', '#6E6E78', 'Ingen backup til SMB-share ennå', c.share ? 'Trykk «Ta backup nå», eller velg en tidsplan' : 'Sett opp en SMB-share under, eller last ned en backupfil'];
  const flags = [['db', 'Database'], ['receipts', 'Kvitteringsbilder'], ['settings', 'Innstillinger'], ['encrypt', 'Krypter (AES-256)']];
  const path = `${c.share || '//server/share'}${c.dir ? '/' + c.dir : ''}/homelab-backup-ÅÅÅÅMMDD-TTMM.tar.gz${c.encrypt ? '.enc' : ''}`;
  const list = S.backupList;
  return `<div style="display:flex;flex-direction:column;gap:18px">
    <div class="bk-status" style="background:${stBg};border-color:${stBd}"><span class="dot" style="width:10px;height:10px;background:${stDot}"></span><div class="grow"><div style="font-weight:600">${esc(stTitle)}</div><div class="sub" style="font-size:12.5px">${esc(stSub)}</div></div><button class="btn pri" data-mact="bk-run" ${b.running ? 'disabled' : ''}>${b.running ? 'Kjører …' : 'Ta backup nå'}</button></div>
    <div class="mod-box"><div class="set-label">Last ned</div><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="/finans/api/backup/export?format=json">Full backup (.json)</a><a class="btn" href="/finans/api/backup/export?format=xlsx">Excel-database (.xlsx)</a><a class="btn" href="/finans/api/transactions.csv">Bare transaksjoner (CSV)</a></div>
      <div class="note" style="font-size:12.5px;line-height:1.5">JSON-filen er den komplette backupen av FinansHub og brukes til gjenoppretting. Excel-filen har ett ark per tabell (Info, Kontoer, Kategorier, Transaksjoner, Kvitteringer, Varelinjer, Budsjett, Faste_utgifter, Aksjer, Utbytte, Ordre, Regler og modulene) med ID-kolonner som kobler arkene sammen, filter på overskriftene og beløp som tall. CSV-en bruker semikolon og UTF-8 med BOM.</div></div>
    <form class="mod-box" data-mform="smb"><div class="card-h"><div class="set-label">SMB-share</div><button type="button" class="tog-inline" data-mact="smb-on"><span class="toggle" role="switch" aria-checked="${!!c.on}"></span>${c.on ? 'På' : 'Av'}</button></div>
      ${b.smbclient ? '' : '<div class="err-msg">smbclient er ikke installert på serveren. Docker-imaget har det fra denne versjonen; på andre installasjoner: apt install smbclient.</div>'}
      <div class="form-grid"><label class="f">Share<input class="inp mono" style="font-size:13px" name="share" value="${esc(c.share)}" placeholder="\\\\192.168.1.20\\backup"></label><label class="f">Mappe på sharen<input class="inp" name="dir" value="${esc(c.dir)}" placeholder="finanshub"></label>
        <label class="f">SMB-versjon<select class="inp" name="version">${optList([['3.1.1', 'SMB 3.1.1'], ['3.0', 'SMB 3.0'], ['2.1', 'SMB 2.1']], c.version)}</select></label><label class="f">Brukernavn<input class="inp" name="user" value="${esc(c.user)}" autocomplete="off"></label>
        <label class="f">Passord<input class="inp" type="password" name="pw" placeholder="${c.pwSet ? '•••••••• lagret kryptert' : 'Lagres kryptert på serveren'}" autocomplete="new-password"></label><label class="f">Domene / arbeidsgruppe<input class="inp" name="domain" value="${esc(c.domain)}" placeholder="WORKGROUP"></label>
        <label class="f">Tidsplan<select class="inp" name="schedule">${optList(SCHED, c.schedule)}</select></label><label class="f"><span>Behold versjoner · <b class="mono" style="color:var(--text)" data-keep-out>${c.keep}</b></span><input type="range" min="3" max="90" name="keep" value="${c.keep}" data-keep></label></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${flags.map(([k2, n]) => `<button type="button" class="flag${c[k2] ? ' on' : ''}" data-mflag="${k2}"><span>${c[k2] ? '✓' : ''}</span>${n}</button>`).join('')}</div>
      ${c.encrypt ? `<label class="f">Passfrase for kryptering (AES-256)<input class="inp" type="password" name="phrase" placeholder="${c.phraseSet ? '•••••••• lagret kryptert – skriv ny for å bytte' : 'Trengs for å gjenopprette – skriv den ned'}" autocomplete="new-password"></label>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button type="button" class="btn" data-mact="smb-test">Test tilkobling</button><button class="btn">Lagre</button>${u.msg?.smb ? `<span class="${u.msg.smbOk ? 'ok-msg' : 'err-msg'}">${esc(u.msg.smb)}</span>` : ''}</div>
      <div class="mono note aks-api">${esc(path)}</div></form>
    <div class="mod-box"><div class="card-h"><div class="set-label">Backuper på sharen</div><button class="btn sm" data-mact="bk-list">${list ? 'Oppdater' : 'Hent liste'}</button></div>
      ${list?.error ? `<div class="err-msg">${esc(list.error)}</div>` : ''}
      ${list ? `<div class="bk-list">${list.items.map((r) => `<div class="bk-row"><span class="dot" style="background:${r.status === 'ok' ? '#5FD3A8' : r.status === 'running' ? '#9DBDFF' : '#FF8A7A'}"></span><span class="grow"><span class="mono" style="font-size:12.5px">${esc(r.file)}</span><span class="note" style="display:block;font-size:12px">${r.created ? new Date(r.created).toLocaleString('nb-NO') : '–'} · ${esc(r.kind)} · ${size(r.size)} · ${r.status === 'ok' ? (r.onShare ? 'på sharen' : 'ok') : r.status === 'running' ? 'kjører' : 'feilet' + (r.error ? ': ' + esc(r.error) : '')}</span></span>${r.onShare ? `<button class="btn sm" data-mremote="${esc(r.file)}">Gjenopprett</button>` : ''}</div>`).join('') || '<div class="note" style="padding:12px">Ingen backuper ennå.</div>'}</div>` : ''}
      ${u.remotePhrase ? `<form class="inst-add" data-mform="remote"><input class="inp" type="password" name="phrase" placeholder="Passfrase for ${esc(u.remotePhrase)}" required><button class="btn sm pri">Les backupen</button></form>` : ''}</div>
    <div class="mod-box"><div class="set-label">Gjenopprett / ny installasjon</div>
      <div class="sub" style="font-size:13px;line-height:1.5">En ny installasjon spør ved første oppstart: start tom, hent fra SMB-share eller last opp en backupfil. Her kan du gjøre det samme manuelt. Både .json-backup, Excel-databasen og krypterte SMB-backuper (.tar.gz.enc) kan importeres. Du ser antall rader per tabell før noe endres.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="btn" style="cursor:pointer">Velg backupfil …<input type="file" accept=".json,.xlsx,.gz,.enc,application/json" data-mbk-file hidden></label><input class="inp" type="password" data-mbk-phrase placeholder="Passfrase (krypterte filer)" style="max-width:260px"></div>
      ${stagePreview()}</div>
    ${!S.boot.hasData ? '<button class="btn" data-act="demo" style="align-self:flex-start">Last inn demodata</button>' : ''}
    <button class="btn danger" data-act="wipe" style="align-self:flex-start">Slett alle økonomidata …</button></div>`;
}

// Første oppstart (tom database): start tom, hent fra SMB-share eller last opp en backupfil.
export function firstRunCard() {
  return `<section class="card first-run"><div><h2>Velkommen til FinansHub</h2><div class="note">Dette ser ut som en ny installasjon. Hvordan vil du begynne?</div></div>
    <div class="fr-opts"><button class="fr-opt" data-mact="fr-empty"><b>Start tom</b><span>Legg til kontoer og importer fra nettbanken selv</span></button>
      <button class="fr-opt" data-mact="fr-smb"><b>Hent fra SMB-share</b><span>Gjenopprett en backup fra NAS-en</span></button>
      <label class="fr-opt"><b>Last opp backupfil</b><span>.json, .xlsx eller .tar.gz.enc</span><input type="file" accept=".json,.xlsx,.gz,.enc,application/json" data-mbk-file data-first hidden></label>
      <button class="fr-opt" data-act="demo"><b>Se demodata</b><span>Utforsk med eksempeldata først</span></button></div>
    ${S.stage ? stagePreview() : ''}</section>`;
}

export const MODULE_FN = { aks: aksPage, sub: subPage, dir: dirPage, finn: finnPage, imp: impPage };

/* ===================== Lasting ===================== */

const loadRecentOut = async () => { S.recentOut = (await api('/transactions?type=ut&limit=40')).items; };
const loadSubs = async () => { S.subs = await api('/subscriptions'); };
async function loadFolders() {
  S.folders = await api('/folders');
  const id = u.dir && S.folders.some((f) => f.id === u.dir) ? u.dir : S.folders[0]?.id;
  u.dir = id;
  S.folder = id ? await api(`/folders/${id}`) : null;
}
const loadUsers = async () => { S.users = await api('/users').catch(() => []); };
const loadFinn = async () => { S.finn = await api('/finn'); };
const loadStocks = async (force) => { S.stocks = await api(`/stocks${force === true ? '?force=1' : ''}`); };
export async function loadBackup() { S.backup = await api('/backup'); }
const recentIfAdmin = async () => { if (!S.boot.restricted) await loadRecentOut(); };
export const MODULE_LOADERS = { aks: [loadStocks], sub: [loadSubs, loadRecentOut], dir: [loadFolders, loadUsers, recentIfAdmin], finn: [loadFinn], imp: [] };

/* ===================== Hendelser ===================== */

let impFiles = [];
async function preview(commit = false) {
  const im = S.imp;
  const fd = new FormData();
  for (const f of impFiles) fd.append('files', f);
  if (im.text.trim()) fd.append('text', im.text);
  if (u.impAcc) fd.append('accountId', u.impAcc);
  if (!impFiles.length && !im.text.trim()) { im.rows = []; im.status = 'Lim inn tekst eller velg filer.'; return render(); }
  try {
    const r = await api(`/import${commit ? '?commit=1' : ''}`, { method: 'POST', body: fd });
    im.rows = r.rows;
    const files = impFiles.length ? `${impFiles.length} fil${impFiles.length === 1 ? '' : 'er'} · ` : '';
    im.status = commit ? `${r.imported} poster importert · ${r.duplicates} duplikater hoppet over · AI kategoriserer og beskriver i bakgrunnen`
      : `${files}${r.rows.length} rader lest${r.skipped ? ` · ${r.skipped} rader hoppet over` : ''}${r.errors?.length ? ' · ' + r.errors.join('; ') : ''}`;
    if (commit) { toast(`${r.imported} poster importert`); impFiles = []; im.text = ''; im.rows = []; await loadBoot(); }
  } catch (e) { im.status = e.message; im.rows = []; }
  render();
}

async function uploadTo(target, files) {
  const fd = new FormData();
  for (const f of files) fd.append('file', f);
  const path = target === 'sub' ? '/subscriptions/receipts' : `/folders/${u.dir}/receipts`;
  const r = await api(path, { method: 'POST', body: fd });
  toast(`${r.jobs.length} kvittering${r.jobs.length === 1 ? '' : 'er'} leses i bakgrunnen`);
  // Følg med til AI-en er ferdig, så havner kvitteringen i listen.
  const poll = async (n) => { if (n > 30 || !['sub', 'dir'].includes(u.page)) return; await reload(); if (!(await api('/receipts/jobs')).some((j) => r.jobs.some((x) => x.id === j.id) && ['pending', 'processing'].includes(j.status))) return; setTimeout(() => poll(n + 1), 2500); };
  setTimeout(() => poll(0), 2500);
}
// Følg med på en backup som kjører.
function pollBackup(n = 0) { setTimeout(async () => { if (n > 400) return; await loadBackup().catch(() => {}); if (S.ui.page === 'inn') render(); if (S.backup?.running) pollBackup(n + 1); }, 3000); }
async function reload() { await Promise.all((MODULE_LOADERS[u.page] ?? []).map((f) => f())); render(); }

export function bindModules(el) {
  const wrap = (fn) => async (e) => { try { await fn(e); } catch (err) { toast(err.message); } };
  el.addEventListener('click', wrap(async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    if ((x = d('[data-mmode]'))) { const [k, m] = x.dataset.mmode.split(':'); u[k === 'sub' ? 'subMode' : 'dirMode'] = m; return render(); }
    if ((x = d('[data-mtx]'))) {
      const [k, id] = x.dataset.mtx.split(':');
      if (k === 'sub') { const s = await api('/subscriptions', { method: 'POST', json: { fromTx: +id } }); toast(`${s.name} lagt til som abonnement`); }
      else { S.folder = await api(`/folders/${u.dir}/entries`, { method: 'POST', json: { txId: +id } }); toast(`Flyttet til ${S.folder.name}`); }
      return reload();
    }
    if ((x = d('[data-msub-tog]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.msubTog); await api(`/subscriptions/${s.id}`, { method: 'PATCH', json: { active: !s.active } }); return reload(); }
    if ((x = d('[data-msub-low]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.msubLow); await api(`/subscriptions/${s.id}`, { method: 'PATCH', json: { lowUse: !s.lowUse } }); return reload(); }
    if ((x = d('[data-msub-del]'))) { if (!confirm('Slette abonnementet?')) return; await api(`/subscriptions/${x.dataset.msubDel}`, { method: 'DELETE' }); return reload(); }
    if ((x = d('[data-mdir]'))) { u.dir = +x.dataset.mdir; u.dcat = null; u.shareOpen = false; S.folder = await api(`/folders/${u.dir}`); return render(); }
    if ((x = d('[data-mentry-del]'))) { if (!confirm('Fjerne posten fra mappen?')) return; S.folder = await api(`/folders/${u.dir}/entries/${x.dataset.mentryDel}`, { method: 'DELETE' }); return reload(); }
    if ((x = d('[data-mpick]'))) { const id = x.dataset.mpick, p = u.newPick ?? []; u.newPick = p.includes(id) ? p.filter((y) => y !== id) : [...p, id]; return render(); }
    if ((x = d('[data-mdcat]'))) { u.dcat = u.dcat === x.dataset.mdcat ? null : x.dataset.mdcat; return render(); }
    if ((x = d('[data-mpay]'))) { S.folder = await api(`/folders/${u.dir}/installments/${x.dataset.mpay}/pay`, { method: 'POST' }); toast('Registrert som betalt'); return reload(); }
    if ((x = d('[data-mbill-del]'))) { S.folder = await api(`/folders/${u.dir}/bills/${x.dataset.mbillDel}`, { method: 'DELETE' }); return render(); }
    if ((x = d('[data-mrm]'))) {
      const leave = !!x.dataset.leave, m = S.folder.members.find((y) => y.id === +x.dataset.mrm);
      if (!confirm(leave ? `Forlate «${S.folder.name}»? Du mister tilgangen til mappen.` : `Fjerne ${m?.name} fra «${S.folder.name}»?`)) return;
      const r = await api(`/folders/${u.dir}/members/${x.dataset.mrm}`, { method: 'DELETE' });
      if (leave) { u.dir = null; toast(`Du har forlatt ${S.folder.name}`); } else { S.folder = r; toast(`${m?.name} har ikke lenger tilgang`); }
      return reload();
    }
    if ((x = d('[data-maks-env]'))) { await api('/stocks/config', { method: 'PUT', json: { env: x.dataset.maksEnv } }); await loadBoot(); await loadStocks(true); return render(); }
    if ((x = d('[data-maks-per]'))) { u.aksPer = x.dataset.maksPer; return render(); }
    if ((x = d('[data-mflag]'))) { const k = x.dataset.mflag; S.backup.config = await api('/backup/smb', { method: 'PUT', json: { [k]: !S.backup.config[k] } }); return render(); }
    if ((x = d('[data-mremote]'))) {
      const file = x.dataset.mremote;
      if (file.endsWith('.enc') && !S.backup.config.phraseSet) { u.remotePhrase = file; return render(); }
      S.stage = await api('/backup/stage', { method: 'POST', json: { remote: file } }); return render();
    }
    if ((x = d('[data-mfinn-step]'))) {
      const [id, i] = x.dataset.mfinnStep.split(':').map(Number);
      const r = S.finn.items.find((y) => y.id === id);
      await api(`/finn/${id}`, { method: 'PATCH', json: { steps: r.steps.map((s, k2) => (k2 === i ? { ...s, done: !s.done } : s)) } });
      return reload();
    }
    if ((x = d('[data-mfinn-del]'))) { if (!confirm('Slette handelen?')) return; await api(`/finn/${x.dataset.mfinnDel}`, { method: 'DELETE' }); return reload(); }
    switch (d('[data-mact]')?.dataset.mact) {
      case 'del-folder': if (!confirm(`Slette «${S.folder.name}» med alle poster, prosjekter og regninger? Transaksjonene i regnskapet beholdes.`)) return; await api(`/folders/${u.dir}`, { method: 'DELETE' }); u.dir = null; return reload();
      case 'share-toggle': u.shareOpen = !u.shareOpen; return render();
      case 'dcat-clear': u.dcat = null; return render();
      case 'split-edit': u.splitEdit = !u.splitEdit; return render();
      case 'aks-sync': { toast('Synkroniserer med Trading 212 …'); await loadStocks(true); return render(); }
      case 'aks-cfg': u.aksCfg = !(u.aksCfg ?? !(S.stocks?.configured || S.stocks?.mock)); return render();
      case 'aks-clear': if (!confirm('Fjerne nøkkel og secret for Trading 212?')) return; await api('/stocks/config', { method: 'PUT', json: { clear: true } }); await loadBoot(); await loadStocks(); return render();
      case 'bk-run': { await api('/backup/run', { method: 'POST' }); toast('Backup startet'); await loadBackup(); render(); pollBackup(); return; }
      case 'bk-list': S.backupList = { items: [], error: null }; render(); S.backupList = await api('/backup/list'); return render();
      case 'bk-cancel': S.stage = null; return render();
      case 'bk-restore': {
        const st = S.stage;
        if (!confirm(st.kind === 'archive' ? 'Gjenopprette hele databasen fra backupen? Data som ikke finnes i backupen forsvinner.' : 'Gjenopprette fra filen? Rader med samme ID overskrives.')) return;
        const r = await api('/backup/restore', { method: 'POST', json: { stageId: st.stageId } });
        S.stage = null; toast(`Gjenopprettet ${Object.values(r.counts).reduce((a, b) => a + (+b || 0), 0)} rader`);
        // Alt kan ha endret seg (kontoer, kategorier, mapper): last siden på nytt.
        setTimeout(() => location.reload(), 900); return render();
      }
      case 'smb-on': S.backup.config = await api('/backup/smb', { method: 'PUT', json: { on: !S.backup.config.on } }); return render();
      case 'smb-test': { u.msg = { ...(u.msg ?? {}), smb: 'Tester …', smbOk: true }; render(); const r = await api('/backup/smb/test', { method: 'POST' }); u.msg.smb = r.message; u.msg.smbOk = r.ok; return render(); }
      case 'fr-empty': await api('/firstrun', { method: 'POST', json: { choice: 'empty' } }); S.boot.firstRun = false; return render();
      case 'fr-smb': u.setTab = 'data'; location.hash = '#/inn'; return;
      case 'imp-commit': return preview(true);
    }
  }));
  el.addEventListener('change', wrap(async (e) => {
    const t = e.target;
    if (t.matches('[data-mrc]')) { const files = [...t.files]; t.value = ''; return uploadTo(t.dataset.mrc, files); }
    if (t.matches('[data-mimp]')) { impFiles = [...t.files]; t.value = ''; return preview(); }
    if (t.matches('[data-mimp-text]')) { S.imp.text = t.value; return preview(); }
    if (t.matches('[data-mimp-acc]')) { u.impAcc = t.value; return; }
    if (t.matches('[data-msub-cyc]')) { await api(`/subscriptions/${t.dataset.msubCyc}`, { method: 'PATCH', json: { cycle: t.value } }); return reload(); }
    if (t.matches('[data-mrole]')) { S.folder = await api(`/folders/${u.dir}/members/${t.dataset.mrole}`, { method: 'PATCH', json: { role: t.value } }); return render(); }
    if (t.matches('[data-mbk-file]')) {
      const f = t.files[0]; t.value = '';
      if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      const ph = el.querySelector('[data-mbk-phrase]')?.value; if (ph) fd.append('phrase', ph);
      toast('Leser backupen …');
      S.stage = await api('/backup/stage', { method: 'POST', body: fd }); return render();
    }
  }));
  el.addEventListener('input', (e) => { if (e.target.matches('[data-keep]')) { const o = el.querySelector('[data-keep-out]'); if (o) o.textContent = e.target.value; } });
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest('[data-mform]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    switch (f.dataset.mform) {
      case 'sub': await api('/subscriptions', { method: 'POST', json: { ...v, price: parseAmount(v.price) } }); toast('Abonnement lagt til'); return reload();
      case 'folder': { const r = await api('/folders', { method: 'POST', json: { ...v, share: (u.newPick ?? []).map((id) => ({ userId: id, role: 'editor' })) } }); u.dir = r.id; u.newPick = []; toast(r.members.length > 1 ? `${r.name} er opprettet og delt` : `${r.name} er opprettet`); return reload(); }
      case 'entry': S.folder = await api(`/folders/${u.dir}/entries`, { method: 'POST', json: { ...v, amount: parseAmount(v.amount), date: today(), projectId: +v.projectId || null } }); toast(`Lagt til i ${S.folder.name}`); return reload();
      case 'share': if (!v.userId) return; S.folder = await api(`/folders/${u.dir}/members`, { method: 'POST', json: v }); toast(`${S.folder.name} er delt`); return render();
      case 'project': S.folder = await api(`/folders/${u.dir}/projects`, { method: 'POST', json: { ...v, budget: parseAmount(v.budget) } }); toast('Prosjekt lagt til'); return render();
      case 'inst': S.folder = await api(`/folders/${u.dir}/projects/${f.dataset.pid}/installments`, { method: 'POST', json: { ...v, amount: parseAmount(v.amount) } }); return render();
      case 'bill': S.folder = await api(`/folders/${u.dir}/bills`, { method: 'POST', json: v }); return render();
      case 'split': {
        const equal = e.submitter?.name === 'equal';
        const w = Object.fromEntries(Object.entries(v).filter(([k2]) => k2.startsWith('w:')).map(([k2, x]) => [k2.slice(2), parseAmount(x) ?? 0]));
        S.folder = await api(`/folders/${u.dir}`, { method: 'PATCH', json: { split: equal ? 'equal' : w } }); u.splitEdit = false; return render();
      }
      case 'aks': {
        await api('/stocks/config', { method: 'PUT', json: { key: v.key, secret: v.secret } }); await loadBoot();
        toast('Nøkkelen er lagret på serveren'); u.aksCfg = false; await loadStocks(true); return render();
      }
      case 'smb': {
        const body = { share: v.share, dir: v.dir, version: v.version, user: v.user, domain: v.domain, schedule: v.schedule, keep: +v.keep };
        if (v.pw) body.pw = v.pw; if (v.phrase) body.phrase = v.phrase;
        S.backup.config = await api('/backup/smb', { method: 'PUT', json: body }); u.msg = { ...(u.msg ?? {}), smb: 'Lagret', smbOk: true }; await loadBackup(); return render();
      }
      case 'remote': S.stage = await api('/backup/stage', { method: 'POST', json: { remote: u.remotePhrase, phrase: v.phrase } }); u.remotePhrase = null; return render();
      case 'invite': if (!v.emails.trim()) return; S.folder = await api(`/folders/${u.dir}/invite`, { method: 'POST', json: v }); return reload();
      case 'finn': { const r = await api('/finn', { method: 'POST', json: v }); toast(`${r.item} lagt til`); return reload(); }
    }
  }));
  // Logoer som ikke finnes: vis forbokstaven (CSP stopper inline onerror).
  el.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.parentNode?.classList?.contains('m-logo')) { img.parentNode.classList.add('err'); img.remove(); } }, true);
}
