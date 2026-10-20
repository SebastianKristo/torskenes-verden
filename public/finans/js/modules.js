// Modulene i FinansHub-sidemenyen: Subscription OS, Boliger (bol42.js), Finn-handler og Import.
// Samme mønster som desktop.js: sidene tegnes fra S, hendelser fanges med delegering (data-m*-attributter).
import { S, api, esc, n0, n2, sgn, dd, render, toast, loadBoot, accs, logo, aiLine, ICONS, smooth } from './core.js';
import { finnPage as finnDesk, loadFinn as loadFinnDesk, bindFinn } from './finn-desktop.js'; // Finn-handler med detaljside
import { subPage, loadSubs, bindSubs } from './subs-desktop.js'; // Subscription OS: Oversikt og Kalender
import { glimt } from '/assets/js/glimt.js';
import { aiStart, aiDone } from '/assets/js/ai-jobs.js';
import { bolPage, loadB42, bindB42 } from './bol42.js'; // prompt 42: Boliger 2a + 1b
import { stockLogo, instrSub } from './fin42.js';

Object.assign(ICONS, {
  sub: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  dir: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 14a2 2 0 1 0 0-.01M15 14a2 2 0 1 0 0-.01',
  finn: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  imp: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  aks: 'M3 17l6-6 4 4 8-8M15 7h6v6',
});

export const MODULE_PAGES = [['aks', 'Aksjer'], ['sub', 'Subscription OS'], ['dir', 'Boliger'], ['finn', 'Finn-handler'], ['imp', 'Import']];
export const MODULE_SUB = { aks: 'Trading 212', sub: 'Abonnementer', finn: 'Trygg betaling, Fiks ferdig, Tillit', imp: 'CSV, XLSX og tekst' };
const u = S.ui;
const card = (inner, style = '') => `<section class="card" style="${style}">${inner}</section>`;
const skel = (h = 160) => `<div class="skel" style="min-height:${h}px"></div>`;
const kr0 = (v) => `${n0(v)} kr`;
/* ===================== Subscription OS: se subs-desktop.js ===================== */

/* ===================== Boliger ===================== */

// Prompt 42: selve Boliger-siden ligger i bol42.js (2a «Alle boligene på ett ark» + 1b «Kontobok»). Den gamle siden
// (boligpiller, tallkort for én bolig, prosjekter med avdrag og faste regninger) er slettet.
// Under står bare det Innstillinger → Boliger bruker.
const TYPES = ['Enebolig', 'Leilighet', 'Hytte', 'Utleie', 'Annet'];
const ROLE_N = { owner: 'Eier', editor: 'Kan redigere', viewer: 'Kan se' };
const short = (n) => esc(String(n ?? '').slice(0, 2).toUpperCase());
const optList = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');

/* ===================== Innstillinger → Boliger ===================== */

export async function loadBolSettings() {
  const [folders, users, cats] = await Promise.all([api('/folders'), api('/users').catch(() => []), api('/boliger/categories')]);
  S.folders = folders; S.users = users; S.bolCats = cats;
}
const reloadBol = async () => { if (u.page === 'dir') { await loadB42(); return render(); } await loadBolSettings(); render(); };

export function bolSettings() {
  const list = S.folders, cats = S.bolCats;
  if (!list || !cats) return skel(360);
  const me = S.boot.me ?? {};
  const users = (S.users ?? []).filter((x) => x.id !== me.id);
  const pick = u.newPick ?? [];
  // Boligene: deling og sletting (bare eiere, to trykk).
  const homes = list.map((f) => {
    const owner = f.role === 'owner', open = u.bolShare === f.id, del = u.bolDel === f.id;
    const sub = [f.address, `Din rolle: ${f.myRole ?? ''}`, `${f.count} ${f.count === 1 ? 'post' : 'poster'}`].filter(Boolean).join(' · ');
    return `<div class="bol-home${open ? ' open' : ''}"><span class="grow" style="min-width:0"><span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-weight:600">${esc(f.name)}</b><span class="mtag">${esc(f.type)}</span></span><span class="note" style="display:block;font-size:12.5px;margin-top:3px">${esc(sub)}</span></span>
      <button class="btn sm${open ? ' on' : ''}" data-bshare="${f.id}" aria-expanded="${open}">Deling · ${f.members.length}</button>${owner ? `<button class="btn sm${del ? ' danger' : ' ghost'}" data-bdel="${f.id}">${del ? 'Bekreft sletting' : 'Slett'}</button>` : ''}</div>
      ${open ? shareBox(f) : ''}`;
  }).join('') || '<div class="bol-home note">Ingen boliger ennå.</div>';
  const create = `<form class="dir-new" data-mform="folder" style="border-style:solid"><b>Ny bolig</b><input class="inp" name="name" placeholder="Navn, f.eks. Hytta Geilo" required>
    <input class="inp" name="address" placeholder="Adresse (valgfritt)"><select class="inp" name="type">${optList(TYPES.map((t) => [t, t]), 'Enebolig')}</select>
    ${users.length ? `<span class="note" style="font-size:12px">Del med</span><div class="pick">${users.map((x) => `<button type="button" class="pick-u${pick.includes(x.id) ? ' on' : ''}" data-mpick="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : '<span class="note" style="font-size:12px">Nye brukere legges til av admin under Innstillinger → Innlogging i Homelab.</span>'}
    <div><button class="btn pri">Opprett</button></div></form>`;
  // Kategorier for boliger.
  const man = cats.canManage;
  const catRows = cats.categories.map((c) => `<div class="bcat"><div class="bcat-h"><i style="background:${c.color}"></i><b>${esc(c.name)}</b>${c.ai ? '<span class="bcat-ai">✦ Glimt</span>' : ''}<span class="grow"></span><span class="note mono" style="font-size:12px">${c.count || ''}</span>${man ? `<button class="x-btn sm" data-bcat-del="${c.id}" aria-label="Fjern kategorien ${esc(c.name)}">×</button>` : ''}</div>
    <div class="bcat-subs">${c.children.map((x) => `<span class="bsub">${x.ai ? '✦ ' : ''}${esc(x.name)}${man ? `<button data-bcat-del="${x.id}" aria-label="Fjern ${esc(x.name)}">×</button>` : ''}</span>`).join('')}${man ? `<input class="bsub-in" data-bcat-sub="${c.id}" placeholder="+ Underkategori" maxlength="40" aria-label="Ny underkategori under ${esc(c.name)}">` : ''}</div></div>`).join('');
  return `<div class="bol-set">
    <div class="bol-sec"><div class="set-label">Boligene</div>${homes}</div>
    ${create}
    <div class="bol-sec"><div class="card-h" style="align-items:center"><b style="font-size:14px">Kategorier for boliger</b>${man ? '<button class="btn sm ghost" data-mact="bcat-reset">Nullstill</button>' : ''}</div>
      <button class="tog-row" data-mact="bcat-ai" ${man ? '' : 'disabled'}><span class="grow"><b style="font-weight:500">✦ La Glimt lage nye kategorier</b><br><span class="note" style="font-size:12.5px">Når en kvittering, transaksjon eller opplastning ikke passer i noen kategori, lager Glimt en ny kategori eller underkategori. Av: Glimt velger bare blant de som finnes.</span></span><span class="toggle" role="switch" aria-checked="${!!cats.aiNew}"></span></button>
      ${catRows}
      ${man ? '<form class="bcat-new" data-mform="bcat"><input class="inp" name="name" placeholder="Ny kategori, f.eks. Garasje" maxlength="40" required><button class="btn">Legg til</button></form>' : '<div class="note" style="font-size:12.5px">Bare administratorer og eiere av en bolig kan endre kategoriene.</div>'}
      <span class="note" style="font-size:12px">✦ viser kategorier og underkategorier som Glimt har laget. Underkategori legges til med Enter.</span></div>
    <div class="note" style="font-size:12.5px">Trykk «Deling» på en bolig for å se hvem den er delt med, endre tilgang eller dele den med flere.</div>
  </div>`;
}
function shareBox(f) {
  const isOwner = f.role === 'owner', owners = f.members.filter((m) => m.role === 'owner').length;
  const acl = f.members.map((m) => {
    const lastOwner = m.role === 'owner' && owners <= 1;
    const edit = isOwner && !m.you;
    return `<div class="acl"><span class="av-s">${short(m.name)}</span><span class="grow">${esc(m.name)} <span class="muted" style="font-size:12.5px">${m.you ? '(deg)' : m.login ? '' : '(uten innlogging)'}</span></span>
      ${edit ? `<select class="sel" data-brole="${f.id}:${m.id}" aria-label="Tilgang for ${esc(m.name)}">${optList(Object.entries(ROLE_N), m.role)}</select><button class="x-btn sm" data-brm="${f.id}:${m.id}" aria-label="Fjern ${esc(m.name)}">×</button>` : `<span class="sub" style="font-size:13px;padding:0 10px">${ROLE_N[m.role] ?? 'Kan redigere'}</span>`}
      ${m.you && !lastOwner ? `<button class="btn sm" data-brm="${f.id}:${m.id}" data-leave="1" style="color:var(--acc-l)">Forlat</button>` : ''}</div>`;
  }).join('');
  const inv = (S.users ?? []).filter((x) => !f.members.some((m) => m.userId === x.id));
  return `<div class="share-box"><div class="card-h" style="align-items:baseline;flex-wrap:wrap;gap:8px"><b style="font-size:14px">Deling · ${esc(f.name)}</b><span class="note" style="font-size:12px">${isOwner ? 'Eiere kan dele, endre tilgang og fjerne medlemmer' : 'Bare eiere kan endre deling'}</span></div>${acl}
    ${isOwner ? (inv.length ? `<form class="share-add" data-mform="bshare" data-fid="${f.id}"><select class="inp" name="userId" required><option value="">Velg bruker …</option>${inv.map((x) => `<option value="${esc(x.id)}">${esc(x.name ?? x.displayName)}${x.username ? ` (${esc(x.username)})` : ''}</option>`).join('')}</select><select class="inp" name="role">${optList([['editor', 'Kan redigere'], ['viewer', 'Kan se']], 'editor')}</select><button class="btn pri">Del</button></form>` : '<span class="note" style="font-size:12px">Alle brukere har tilgang. Nye brukere legges til av admin under Innstillinger → Innlogging i Homelab.</span>') : ''}</div>`;
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
    <form class="mod-box" data-mform="finn"><b>Legg til fra e-post</b><span class="note" style="font-size:13px">Lim inn en e-post fra Finn (Trygg betaling, Fiks ferdig eller Tillit). Glimt trekker ut gjenstand, motpart, beløp og status, og matcher mot bankposten.</span>
      <textarea class="inp mod-ta" name="email" rows="5" placeholder="Lim inn e-posten her …" required></textarea><div><button class="btn pri">Les e-posten</button></div></form>
    <div class="note" style="font-size:13px">Kilde: e-postkvitteringer fra Finn (Trygg betaling, Fiks ferdig-frakt, Tillit forsikring) leses av Glimt og matches mot bankposter. ${d.imap.configured ? 'IMAP er konfigurert; automatisk henting kommer i en senere versjon.' : 'Automatisk henting via IMAP settes opp i Innstillinger → Import.'}</div>
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
    ${(im.formats ?? []).map(fmtBox).join('')}
    ${im.rows.length ? card(im.rows.map((r) => `<div class="imp-row${r.duplicate ? ' dup' : ''}">${logo({ description: r.description, domain: r.domain, color: '#A0A0AA' }, 28, 8)}<span class="mono note" style="font-size:12px">${dd(r.date)}</span>
      <span class="ell-wrap"><span style="display:block">${esc(r.description)}</span>${aiLine(r.aiShort, 'd-ai')}<span class="muted ell" style="font-size:12px;display:block">${esc(r.raw)}</span></span>
      <span class="note" style="font-size:13px">${r.duplicate ? 'Finnes fra før' : esc(r.category ?? 'Glimt kategoriserer')}</span><b class="mono" style="text-align:right;color:${r.amount > 0 ? 'var(--pos)' : 'var(--text)'}">${sgn(r.amount)}</b></div>`).join(''), 'padding:0;gap:0;overflow:hidden') : ''}
    <div style="display:flex;justify-content:flex-end"><button class="btn" style="background:var(--text);color:var(--bg)" data-mact="imp-commit" ${n ? '' : 'disabled'}>Importer ${n} poster</button></div>
    ${tplList()}
  </div>`;
}

// Hvilket format filen ble lest med, og hvilke kolonner som er koblet til hvilke felt.
const SRC_TXT = { builtin: ['Innebygd mal', 'var(--text2)'], saved: ['Lagret mal', 'var(--pos)'], head: ['Kolonnenavn', 'var(--text2)'], ai: ['✦ Glimt leste de første radene og lagret malen', 'var(--acc-l)'], guess: ['Gjettet ut fra verdiene (AI svarte ikke) og lagret som mal', 'var(--acc-l)'] };
function fmtBox(f) {
  const [src, col] = SRC_TXT[f.template?.source] ?? ['', 'var(--muted)'];
  return `<div class="mod-box" style="gap:10px;padding:14px 16px;border-radius:14px">
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="note" style="font-size:12.5px">Format${f.file && (S.imp.formats ?? []).length > 1 ? ` · ${esc(f.file)}` : ''}</span><b style="font-weight:600">${esc(f.template?.name ?? '')}</b><span style="font-size:12.5px;color:${col}">${esc(src)}</span><span class="note mono" style="margin-left:auto;font-size:12.5px">${{ mdy: 'MM/DD/ÅÅ', ymd: 'ÅÅÅÅ-MM-DD' }[f.dateFormat] ?? 'DD.MM.ÅÅÅÅ'}</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${(f.columns ?? []).map((c) => `<span style="display:inline-flex;gap:6px;align-items:center;height:28px;padding:0 10px;border-radius:8px;background:var(--inner,#1B1B20);font-size:12.5px"><span class="note">${esc(c.label)}</span>←<span>${esc(c.column)}</span></span>`).join('')}</div></div>`;
}
function tplList() {
  const t = S.impTpl;
  if (!t) return '';
  return `<div style="display:flex;flex-direction:column;gap:8px"><b style="font-size:14px;font-weight:600">Importmaler</b><div style="display:flex;gap:8px;flex-wrap:wrap">${t.map((x) => `<span style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 ${x.builtin ? 12 : 6}px 0 12px;border-radius:9px;background:var(--card);border:1px solid var(--sep);font-size:13px">${esc(x.name)}<span class="note" style="font-size:11.5px">${x.builtin ? 'Innebygd' : x.hasHeader ? 'Med overskrift' : 'Uten overskrift'}</span>${x.builtin ? '' : `<button data-mtpl-del="${x.id}" aria-label="Slett mal" style="width:22px;height:22px;border-radius:6px;border:0;background:transparent;color:var(--text2);cursor:pointer">×</button>`}</span>`).join('')}</div>
    <span class="note" style="font-size:12.5px;line-height:1.45">Når et format er ukjent, leser Glimt de første radene, finner dato, beskrivelse og beløp, og lagrer det som en mal. Neste fil med samme kolonner bruker malen direkte.</span></div>`;
}
export const loadImpTpl = async () => { S.impTpl = await api('/import/templates').catch(() => S.impTpl ?? null); };

// Innstillinger → Import → Finn.no: tidligere Finn-e-poster og annonselenker blir handler i Finn-handler.
export function finnImportBox() {
  const fi = S.finnImp ?? (S.finnImp = { links: '', role: 'bought', job: null });
  const codes = [...new Set([...(fi.links.matchAll(/finn\.no\/[^\s]*?(?:item\/|finnkode=)(\d{6,12})/gi))].map((m) => m[1]))];
  const j = fi.job;
  const items = (j?.items ?? []).map((r) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:var(--inner,#1B1B20)"><span style="flex:none;width:44px;height:44px;border-radius:10px;background:hsl(${(+r.code) % 360} 35% 30%)"></span><span style="flex:1;min-width:0"><b style="display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.title ?? r.error ?? '')}</b><span class="note mono" style="font-size:12px">Finn-kode ${esc(r.code)}${r.status === 'ok' ? ` · ${r.images} bilde${r.images === 1 ? '' : 'r'}` : ''}</span></span><span style="font-size:12.5px;color:${r.status === 'ok' ? 'var(--pos)' : 'var(--neg)'}">${r.status === 'ok' ? '✓ Lagret' : 'Feilet'}</span></div>`).join('');
  const status = j ? `<div class="${j.errors?.length && !j.added && !j.linked ? 'err-msg' : 'ok-msg'}" style="font-size:13px">${j.running ? `${glimt(14, 'tenker')} Arbeider … ${j.done} av ${j.total || '?'}` : esc(j.message ?? '')}${!j.running && j.errors?.length ? `<br><span class="note" style="font-size:12px">${j.errors.slice(0, 3).map(esc).join('<br>')}</span>` : ''}</div>` : '';
  return `<div class="mod-box" style="padding:18px;border-radius:18px;gap:12px">
    <div style="display:flex;align-items:center;gap:12px"><img src="/finans/api/logo/finn.no" alt="" style="width:36px;height:36px;border-radius:10px;background:#fff;padding:5px"><div style="flex:1;min-width:0"><b style="font-weight:600">Finn.no</b><div class="note" style="font-size:12.5px">Tidligere kjøp, salg og annonser legges i Finn-handler</div></div></div>
    <label style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;border:1.5px dashed var(--line,#3A3A42);cursor:pointer"><span style="width:34px;height:34px;border-radius:10px;background:var(--inner,#1B1B20);display:grid;place-items:center;color:var(--acc-l)">✉</span><span style="flex:1;min-width:0"><b style="font-weight:500">Finn-e-poster (.eml, .mbox eller Proton-eksport)</b><br><span class="note" style="font-size:12.5px">Kvitteringer, «Du har solgt», Fiks ferdig og utbetalinger kobles til riktig handel, også annonser du har lagt inn fra lenke. Annonsen hentes fra finn.no når Finn-koden står i e-posten.</span></span><input type="file" multiple accept=".eml,.mbox,.zip,.txt,message/rfc822" data-mfinn-imp hidden></label>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="note" style="font-size:12.5px">Mappe i Proton Mail</span><input class="inp" style="width:160px" data-mfinn-folder value="${esc(fi.folder ?? S.finnFolder ?? 'FINN')}" placeholder="FINN" aria-label="Mappe i Proton Mail"><button class="btn pri" data-mact="finn-imp-folder" ${j?.running ? 'disabled' : ''}>✦ Importer fra mappen</button><button class="btn" data-mact="finn-imp-mail" ${j?.running ? 'disabled' : ''}>Søk i all e-post</button></div>
    <span class="note" style="font-size:12px;margin-top:-6px">Alle e-postene i mappen leses, uansett avsender. «FINN» finner også «Folders/FINN» i Bridge. Søk i all e-post leter etter avsender FINN, Posten/Bring og Tillit.</span>
    <div style="display:flex;flex-direction:column;gap:6px"><span class="note" style="font-size:12.5px">Annonselenker, én per linje</span><textarea class="inp mod-ta mono" rows="3" data-mfinn-links placeholder="https://www.finn.no/recommerce/forsale/item/476377764">${esc(fi.links)}</textarea>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select class="sel" data-mfinn-role aria-label="Type handel"><option value="bought"${fi.role === 'bought' ? ' selected' : ''}>Kjøpt</option><option value="sold"${fi.role === 'sold' ? ' selected' : ''}>Solgt</option></select><button class="btn pri" data-mact="finn-imp-links" ${j?.running || !codes.length ? 'disabled' : ''}>✦ Hent annonser (${codes.length})</button><span class="note" style="font-size:12.5px">Glimt henter tittel, pris, beskrivelse og bilder og lagrer dem i handelen</span></div></div>
    ${status}${items}
  </div>`;
}
async function finnImp(path, opts) {
  const fi = S.finnImp;
  fi.job = { running: true, done: 0, total: 0 }; render();
  try {
    fi.job = await api(path, opts);
    while (fi.job.running) { render(); await new Promise((r) => setTimeout(r, 2500)); fi.job = await api('/finn/import/status'); }
    toast(fi.job.message ?? 'Ferdig');
  } catch (e) { fi.job = { running: false, message: e.message, errors: [e.message] }; }
  render();
}

/* ===================== Aksjer (Trading 212) ===================== */

const PCOL = ['#FF7A3D', '#7AA7FF', '#5FD3A8', '#F2C14E', '#B79CFF', '#FF6B8B', '#8FD3FF', '#C9E265'];
const PERIODS = [['1m', '1M', 31], ['3m', '3M', 92], ['1y', '1 år', 366], ['all', 'Alt', 1e6]];
const cur$ = (v, c) => `${n2(v)} ${c === 'NOK' || !c ? 'kr' : esc(c)}`;
const pctTxt = (v) => (v == null || !Number.isFinite(v) ? '–' : `${v >= 0 ? '+' : '−'}${n2(Math.abs(v)).replace(/,00$/, '')} %`);

// Oppsettet (status, Live/Demo, Synk nå, nøkkel og secret) ligger i Innstillinger → «Aksjer · Trading 212».
export function aksSettings() {
  const d = S.stocks;
  if (!d) return skel(260);
  const st = S.boot.settings;
  const env = d.env ?? st.t212Env ?? 'live';
  const ok = d.configured || d.mock;
  const dot = d.error ? 'var(--neg)' : ok ? 'var(--ok)' : '#6E6E78';
  const head = `<div class="aks-head aks-head-set"><span class="aks-logo">212</span><div class="grow"><div style="font-weight:600">Trading 212 · Invest</div><div class="note" style="font-size:12.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="dot" style="background:${dot}"></span>${esc(d.status ?? '')}${d.syncedAt ? ` · ${new Date(d.syncedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : ''}</div></div>
    <div class="seg">${[['live', 'Live'], ['demo', 'Demo']].map(([v, l]) => `<button data-maks-env="${v}" aria-pressed="${env === v}">${l}</button>`).join('')}</div>
    <button class="btn pri" data-mact="aks-sync" ${ok ? '' : 'disabled'}>Synk nå</button></div>`;
  // Secret-feltet er et tekstfelt med prikker, så passordbehandlere ikke fyller inn innloggingspassordet ditt.
  const t = u.aksTest;
  const testBox = t ? `<div class="aks-test ${t.ok ? 'ok' : 'bad'}" role="status"><b>${t.ok ? '✓ Tilkoblet' : '✕ Feilet'}</b> ${esc(t.message ?? '')}${t.keyLength != null ? `<div class="note" style="font-size:12px">Sendt: nøkkel-ID ${t.keyLength} tegn · secret ${t.secretLength} tegn · ${t.env === 'demo' ? 'Demo' : 'Live'}</div>` : ''}${t.code === 'wrong_env' ? `<button type="button" class="btn" style="margin-top:8px" data-maks-env="${t.suggest}">Bytt til ${t.suggest === 'demo' ? 'Demo' : 'Live'}</button>` : ''}</div>` : '';
  return `<div style="display:flex;flex-direction:column;gap:16px">${head}
    ${d.error ? `<div class="err-msg">${esc(d.error)}</div>` : ''}
    <form data-mform="aks" style="display:flex;flex-direction:column;gap:12px" autocomplete="off">
    <div class="form-grid"><label class="f">Nøkkel-ID (API key)<input class="inp mono" name="key" placeholder="${st.t212Set ? 'Lagret · ' + esc(d.keyHint ?? '') : 'f.eks. 35875800ZxYa…'}" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore></label>
    <label class="f">Secret<input class="inp mono aks-secret" name="secret" type="text" placeholder="${st.t212Set ? `•••••••• lagret (${d.secretLength ?? 0} tegn)` : 'Vises bare én gang i Trading 212'}" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore></label>
    <label class="f">Miljø<select class="inp" name="env"><option value="live" ${env === 'live' ? 'selected' : ''}>Live (ekte konto)</option><option value="demo" ${env === 'demo' ? 'selected' : ''}>Demo (praksiskonto)</option></select></label></div>
    <div class="sub" style="font-size:13px;line-height:1.55">Lag nøkkelen på nettsiden til Trading 212 under <b>Innstillinger → API (Beta)</b>, i samme konto (Invest eller Stocks ISA – ikke CFD) og samme miljø som du velger her. Du får en <b>nøkkel-ID</b> og en <b>secret</b>; begge trengs. Slå på lesetilgangene <b>account</b>, <b>portfolio</b>, <b>history:orders</b> og <b>history:dividends</b>. Låser du nøkkelen til IP, må det være homelabens offentlige IP (WAN). Mellomrom, linjeskift og anførselstegn fra liming fjernes automatisk.</div>
    <div class="mono note aks-api">Authorization: Basic base64(KEY:SECRET)<br>GET ${esc(d.base)}/equity/account/summary<br>GET ${esc(d.base)}/equity/portfolio</div>
    ${testBox}
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn pri">Lagre og synk</button><button type="button" class="btn" data-mact="aks-test">Test tilkobling</button>${st.t212Set ? '<button type="button" class="btn danger" data-mact="aks-clear">Fjern nøkkel</button>' : ''}</div></form></div>`;
}
export const loadStocksSettings = async () => { if (!S.stocks) await loadStocks(); };

function aksPage() {
  const d = S.stocks;
  if (!d) return skel(400);
  const ok = d.configured || d.mock;
  const dot = d.error ? 'var(--neg)' : ok ? 'var(--ok)' : '#6E6E78';
  const state = d.error ? 'Feil ved synk' : ok ? 'Synkronisert' : 'Ikke satt opp';
  const time = d.syncedAt ? ` · ${new Date(d.syncedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : '';
  // Bare en statuslinje her – oppsettet ligger i Innstillinger.
  const head = `<a class="aks-status" href="#/inn" data-settab="aks"><span class="dot" style="background:${dot}"></span><span>Trading 212 · ${state}${time}</span><span class="grow"></span><span class="muted">Innstillinger ›</span></a>`;
  if (!d.summary) return `<div class="mod">${head}${card(`<div class="empty">${d.configured ? esc(d.error ?? 'Henter data …') : 'Trading 212 er ikke satt opp. Legg inn nøkkel og secret i <a href="#/inn" data-settab="aks">Innstillinger → Aksjer · Trading 212</a>.'}</div>`)}</div>`;
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
    chart = `<svg viewBox="0 0 600 180" preserveAspectRatio="none" style="width:100%;height:200px;display:block" aria-hidden="true"><path d="M0 45H600M0 90H600M0 135H600" style="stroke:var(--sep)"/><path d="${line} L600 180 L0 180 Z" style="fill:color-mix(in srgb,var(--ok) 12%,transparent)"/><path d="${line}" fill="none" style="stroke:var(--ok)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    const ch = vals.at(-1) - vals[0];
    perTxt = `${ch >= 0 ? '+' : '−'}${cur$(Math.abs(ch), c)} (${pctTxt((ch / (vals[0] || 1)) * 100)}) siste ${per[1].toLowerCase()}`; perC = ch >= 0 ? 'var(--pos)' : 'var(--neg)';
  }
  const pos = d.positions ?? [], tot = pos.reduce((a, p) => a + p.value, 0) || 1;
  const kpis = [['Porteføljeverdi', cur$(s.total, c), `Investert ${cur$(s.invested, c)}`, 'var(--text)'], ['Avkastning', `${s.result >= 0 ? '+' : '−'}${cur$(Math.abs(s.result), c)}`, pctTxt(plPct), s.result >= 0 ? 'var(--pos)' : 'var(--neg)'],
    ['Kontanter', cur$(s.cash, c), 'Tilgjengelig for handel', 'var(--text)'], ['Utbytte i år', cur$((d.dividends ?? []).filter((x) => x.date?.startsWith(String(new Date().getFullYear()))).reduce((a, x) => a + x.amount, 0), c), `${(d.dividends ?? []).length} utbetalinger`, 'var(--pos)']]
    .map(([l, v, sub, col]) => `<div class="card mod-kpi" style="padding:18px 20px"><span class="sub">${l}</span><b class="mono" style="font-size:25px;color:${col}">${v}</b><span class="muted" style="font-size:12.5px">${sub}</span></div>`).join('');
  // Prompt 42 (claude-code-finans-aksje-logoer.md): ekte logo (utsteder for ETF/fond, selskap for aksjer) og «VUAG · London · USD».
  const posRows = pos.map((p, i) => { const col = PCOL[i % PCOL.length]; return `<div class="aks-row"><span class="aks-pos">${stockLogo({ ...p, color: col }, 48)}<span class="ell-wrap"><b class="ell" style="display:block;font-weight:500">${esc(p.name)}</b><span class="note" style="font-size:12px" title="${esc(p.ticker)}">${instrSub(p)}</span></span></span>
    <span class="mono r">${n2(p.quantity).replace(/,00$/, '')}</span><span class="mono r sub">${n2(p.avg)}</span><span class="mono r">${n2(p.price)}</span><b class="mono r">${n2(p.value)}</b>
    <span class="mono r" style="color:${p.pl >= 0 ? 'var(--pos)' : 'var(--neg)'}">${p.pl >= 0 ? '+' : '−'}${n2(Math.abs(p.pl))}<span style="display:block;font-size:12px">${pctTxt(p.plPct)}</span></span><span class="mono r" style="color:${(p.dayPct ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'}">${pctTxt(p.dayPct)}</span></div>`; }).join('');
  const divs = (d.dividends ?? []).slice(0, 8).map((x) => `<div class="kv-line"><span>${esc(x.symbol)} <span class="muted" style="font-size:12.5px">· ${dd(x.date)}</span></span><span class="mono pos">${cur$(x.amount, c)}</span></div>`).join('') || '<div class="note">Ingen utbytte ennå.</div>';
  const orders = (d.orders ?? []).slice(0, 8).map((o) => `<div class="kv-line" style="align-items:center"><span style="display:flex;align-items:center;gap:10px"><span class="mtag" style="background:${o.side === 'Kjøp' ? 'color-mix(in srgb,var(--blue) 15%,transparent)' : 'var(--pos-line)'};color:${o.side === 'Kjøp' ? '#A9C3FF' : 'var(--pos)'}">${o.side}</span>${esc(o.symbol)} <span class="muted" style="font-size:12.5px">· ${n2(o.quantity).replace(/,00$/, '')} stk · ${dd(o.date)}</span></span><span class="mono">${cur$(o.value, c)}</span></div>`).join('') || '<div class="note">Ingen ordre.</div>';
  return `<div class="mod">${head}${d.error ? `<div class="err-msg">${esc(d.error)} · viser siste kjente data</div>` : ''}
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

// ISO2: SMB-backup av hele databasen er bare for hovedadmin (canSmb). Alle kan laste ned og gjenopprette sine egne data.
export function backupTab() {
  const b = S.backup;
  if (!b) return skel(300);
  if (b.canSmb === false || !b.config) return ownBackupTab();
  const c = b.config;
  const last = b.history?.find((h) => h.status === 'ok');
  const failed = b.history?.[0]?.status === 'failed' ? b.history[0] : null;
  const [stBg, stBd, stDot, stTitle, stSub] = b.running ? ['var(--blue-soft)', 'var(--line2)', 'var(--blue-l)', 'Backup kjører …', 'Lager arkiv og laster opp til sharen']
    : failed ? ['var(--warn-soft)', 'var(--warm-line, var(--line2))', 'var(--neg)', 'Siste backup feilet', failed.error ?? '']
    : last ? ['var(--pos-soft)', 'var(--pos-line)', 'var(--ok)', `Siste backup ${new Date(last.created).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, `${last.file} · ${size(last.size)}${b.nextRun ? ` · neste ${typeof b.nextRun === 'number' ? new Date(b.nextRun).toLocaleString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : b.nextRun}` : ''}`]
    : ['var(--inner)', 'var(--line)', 'var(--muted)', 'Ingen backup til SMB-share ennå', c.share ? 'Trykk «Ta backup nå», eller velg en tidsplan' : 'Sett opp en SMB-share under, eller last ned en backupfil'];
  const flags = [['db', 'Database'], ['receipts', 'Kvitteringsbilder'], ['settings', 'Innstillinger'], ['encrypt', 'Krypter (AES-256)']];
  const path = `${c.share || '//server/share'}${c.dir ? '/' + c.dir : ''}/homelab-backup-ÅÅÅÅMMDD-TTMM.tar.gz${c.encrypt ? '.enc' : ''}`;
  const list = S.backupList;
  return `<div style="display:flex;flex-direction:column;gap:18px">
    <div class="bk-status" style="background:${stBg};border-color:${stBd}"><span class="dot" style="width:10px;height:10px;background:${stDot}"></span><div class="grow"><div style="font-weight:600;color:var(--text)">${esc(stTitle)}</div><div class="sub" style="font-size:12.5px">${esc(stSub)}</div></div><button class="btn pri" data-mact="bk-run" ${b.running ? 'disabled' : ''}>${b.running ? 'Kjører …' : 'Ta backup nå'}</button></div>
    <div class="mod-box"><div class="set-label">Last ned</div><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="/finans/api/backup/export?format=json">Full backup (.json)</a><a class="btn" href="/finans/api/backup/export?format=xlsx">Excel-database (.xlsx)</a><a class="btn" href="/finans/api/transactions.csv">Bare transaksjoner (CSV)</a></div>
      <div class="note" style="font-size:12.5px;line-height:1.5">JSON-filen er den komplette backupen av FinansHub og brukes til gjenoppretting. Excel-filen har ett ark per tabell (Info, Kontoer, Kategorier, Transaksjoner, Kvitteringer, Varelinjer, Budsjett, Faste_utgifter, Aksjer, Utbytte, Ordre, Regler og modulene) med ID-kolonner som kobler arkene sammen, filter på overskriftene og beløp som tall. CSV-en bruker semikolon og UTF-8 med BOM.</div></div>
    <form class="mod-box" data-mform="smb"><div class="card-h"><div class="set-label">SMB-share</div><button type="button" class="tog-inline" data-mact="smb-on"><span class="toggle" role="switch" aria-checked="${!!c.on}"></span>${c.on ? 'På' : 'Av'}</button></div>
      ${b.smbclient ? '' : '<div class="err-msg">smbclient er ikke installert på serveren. Docker-imaget har det fra denne versjonen; på andre installasjoner: apt install smbclient.</div>'}
      <div class="smb-wiz-row"><div class="grow"><div style="font-weight:600;color:var(--text)">${c.share ? esc(`${c.share}${c.dir ? '/' + c.dir : ''}`) : 'Ingen nettverksdisk satt opp'}</div><div class="sub" style="font-size:12.5px">${c.share ? esc(`${c.user ? c.user : 'Gjest'} · SMB ${c.version}${c.pwSet ? ' · passord lagret' : ''}`) : 'Finn NAS-en på nettverket, logg inn og velg mappe – uten å skrive stier for hånd.'}</div></div><button type="button" class="btn pri" data-mact="smb-wiz">Sett opp med veiviser</button></div>
      <details class="smb-adv"${u.smbAdv ? ' open' : ''}><summary data-mact="smb-adv">Avansert (manuelt oppsett)</summary>
      <div class="form-grid"><label class="f">Share<input class="inp mono" style="font-size:13px" name="share" value="${esc(c.share)}" placeholder="\\\\192.168.1.20\\backup"></label><label class="f">Mappe på sharen<input class="inp" name="dir" value="${esc(c.dir)}" placeholder="finanshub"></label>
        <label class="f">SMB-versjon<select class="inp" name="version">${optList([['3.1.1', 'SMB 3.1.1'], ['3.0', 'SMB 3.0'], ['2.1', 'SMB 2.1']], c.version)}</select></label><label class="f">Brukernavn<input class="inp" name="user" value="${esc(c.user)}" autocomplete="off"></label>
        <label class="f">Passord<input class="inp" type="password" name="pw" placeholder="${c.pwSet ? '•••••••• lagret kryptert' : 'Lagres kryptert på serveren'}" autocomplete="new-password"></label><label class="f">Domene / arbeidsgruppe<input class="inp" name="domain" value="${esc(c.domain)}" placeholder="WORKGROUP"></label></div></details>
      <div class="form-grid"><label class="f">Tidsplan<select class="inp" name="schedule">${optList(SCHED, c.schedule)}</select></label><label class="f"><span>Behold versjoner · <b class="mono" style="color:var(--text)" data-keep-out>${c.keep}</b></span><input type="range" min="3" max="90" name="keep" value="${c.keep}" data-keep></label></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${flags.map(([k2, n]) => `<button type="button" class="flag${c[k2] ? ' on' : ''}" data-mflag="${k2}"><span>${c[k2] ? '✓' : ''}</span>${n}</button>`).join('')}</div>
      ${c.encrypt ? `<label class="f">Passfrase for kryptering (AES-256)<input class="inp" type="password" name="phrase" placeholder="${c.phraseSet ? '•••••••• lagret kryptert – skriv ny for å bytte' : 'Trengs for å gjenopprette – skriv den ned'}" autocomplete="new-password"></label>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button type="button" class="btn" data-mact="smb-test">Test tilkobling</button><button class="btn">Lagre</button>${u.msg?.smb ? `<span class="${u.msg.smbOk ? 'ok-msg' : 'err-msg'}">${esc(u.msg.smb)}</span>` : ''}</div>
      <div class="mono note aks-api">${esc(path)}</div></form>
    <div class="mod-box"><div class="card-h"><div class="set-label">Backuper på sharen</div><button class="btn sm" data-mact="bk-list">${list ? 'Oppdater' : 'Hent liste'}</button></div>
      ${list?.error ? `<div class="err-msg">${esc(list.error)}</div>` : ''}
      ${list ? `<div class="bk-list">${list.items.map((r) => `<div class="bk-row"><span class="dot" style="background:${r.status === 'ok' ? 'var(--ok)' : r.status === 'running' ? 'var(--blue-l)' : 'var(--neg)'}"></span><span class="grow"><span class="mono" style="font-size:12.5px">${esc(r.file)}</span><span class="note" style="display:block;font-size:12px">${r.created ? new Date(r.created).toLocaleString('nb-NO') : '–'} · ${esc(r.kind)} · ${size(r.size)} · ${r.status === 'ok' ? (r.onShare ? 'på sharen' : 'ok') : r.status === 'running' ? 'kjører' : 'feilet' + (r.error ? ': ' + esc(r.error) : '')}</span></span>${r.onShare ? `<button class="btn sm" data-mremote="${esc(r.file)}">Gjenopprett</button>` : ''}</div>`).join('') || '<div class="note" style="padding:12px">Ingen backuper ennå.</div>'}</div>` : ''}
      ${u.remotePhrase ? `<form class="inst-add" data-mform="remote"><input class="inp" type="password" name="phrase" placeholder="Passfrase for ${esc(u.remotePhrase)}" required><button class="btn sm pri">Les backupen</button></form>` : ''}</div>
    <div class="mod-box"><div class="set-label">Gjenopprett / ny installasjon</div>
      <div class="sub" style="font-size:13px;line-height:1.5">En ny installasjon spør ved første oppstart: start tom, hent fra SMB-share eller last opp en backupfil. Her kan du gjøre det samme manuelt. Både .json-backup, Excel-databasen og krypterte SMB-backuper (.tar.gz.enc) kan importeres. Du ser antall rader per tabell før noe endres.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="btn" style="cursor:pointer">Velg backupfil …<input type="file" accept=".json,.xlsx,.gz,.enc,application/json" data-mbk-file hidden></label><input class="inp" type="password" data-mbk-phrase placeholder="Passfrase (krypterte filer)" style="max-width:260px"></div>
      ${stagePreview()}</div>
    ${!S.boot.hasData ? '<button class="btn" data-act="demo" style="align-self:flex-start">Last inn demodata</button>' : ''}
    <button class="btn danger" data-act="wipe" style="align-self:flex-start">Slett alle økonomidata …</button></div>`;
}

const downloadBox = () => `<div class="mod-box"><div class="set-label">Last ned</div><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="/finans/api/backup/export?format=json">Full backup (.json)</a><a class="btn" href="/finans/api/backup/export?format=xlsx">Excel-database (.xlsx)</a><a class="btn" href="/finans/api/transactions.csv">Bare transaksjoner (CSV)</a></div>
      <div class="note" style="font-size:12.5px;line-height:1.5">JSON-filen er den komplette backupen av ditt regnskap i FinansHub og brukes til gjenoppretting. Excel-filen har ett ark per tabell med ID-kolonner som kobler arkene sammen. CSV-en bruker semikolon og UTF-8 med BOM.</div></div>`;
function ownBackupTab() {
  return `<div style="display:flex;flex-direction:column;gap:18px">
    ${downloadBox()}
    <div class="mod-box"><div class="set-label">Gjenopprett</div>
      <div class="sub" style="font-size:13px;line-height:1.5">Last opp en .json-backup eller Excel-databasen du har lastet ned herfra. Du ser antall rader per tabell før noe endres, og bare dine egne data berøres.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="btn" style="cursor:pointer">Velg backupfil …<input type="file" accept=".json,.xlsx,application/json" data-mbk-file hidden></label></div>
      ${stagePreview()}</div>
    <div class="mod-box"><div class="set-label">Backup til SMB-share</div><div class="note" style="font-size:12.5px">Backup av hele serveren settes opp av administrator.</div></div>
    ${!S.boot.hasData ? '<button class="btn" data-act="demo" style="align-self:flex-start">Last inn demodata</button>' : ''}
    <button class="btn danger" data-act="wipe" style="align-self:flex-start">Slett alle økonomidata …</button></div>`;
}

// Første oppstart (tom database): start tom, hent fra SMB-share eller last opp en backupfil.
export function firstRunCard() {
  return `<section class="card first-run"><div><h2>Velkommen til FinansHub</h2><div class="note">Dette ser ut som en ny installasjon. Hvordan vil du begynne?</div></div>
    <div class="fr-opts"><button class="fr-opt" data-mact="fr-empty"><b>Start tom</b><span>Legg til kontoer og importer fra nettbanken selv</span></button>
      ${(S.backup ? S.backup.canSmb !== false : S.boot?.me?.isMainAdmin !== false) ? '<button class="fr-opt" data-mact="fr-smb"><b>Hent fra SMB-share</b><span>Gjenopprett en backup fra NAS-en</span></button>' : ''}
      <label class="fr-opt"><b>Last opp backupfil</b><span>.json, .xlsx eller .tar.gz.enc</span><input type="file" accept=".json,.xlsx,.gz,.enc,application/json" data-mbk-file data-first hidden></label>
      <button class="fr-opt" data-act="demo"><b>Se demodata</b><span>Utforsk med eksempeldata først</span></button></div>
    ${S.stage ? stagePreview() : ''}</section>`;
}

export const MODULE_FN = { aks: aksPage, sub: subPage, dir: bolPage, finn: finnDesk, imp: impPage };

/* ===================== Lasting ===================== */

const loadFinn = async () => { S.finn = await api('/finn'); };
const loadStocks = async (force) => { S.stocks = await api(`/stocks${force === true ? '?force=1' : ''}`); };
export async function loadBackup() { S.backup = await api('/backup'); }
export const MODULE_LOADERS = { aks: [loadStocks], sub: [loadSubs], dir: [loadB42], finn: [loadFinnDesk], imp: [loadImpTpl] };

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
    im.rows = r.rows; im.formats = commit ? [] : r.formats ?? [];
    if (r.formats?.some((f) => f.template?.source === 'ai' || f.template?.source === 'guess')) { await loadImpTpl(); if (!commit) toast('✦ Glimt fant formatet og lagret det som mal'); }
    const files = impFiles.length ? `${impFiles.length} fil${impFiles.length === 1 ? '' : 'er'} · ` : '';
    im.status = commit ? `${r.imported} poster importert · ${r.duplicates} duplikater hoppet over · Glimt kategoriserer og beskriver i bakgrunnen`
      : `${files}${r.rows.length} rader lest${r.skipped ? ` · ${r.skipped} rader hoppet over` : ''}${r.errors?.length ? ' · ' + r.errors.join('; ') : ''}`;
    if (commit) { toast(`${r.imported} poster importert`); impFiles = []; im.text = ''; im.rows = []; await loadBoot(); }
  } catch (e) { im.status = e.message; im.rows = []; im.formats = []; }
  render();
}

async function uploadTo(kind, files) {
  const fd = new FormData();
  for (const f of files) fd.append('file', f);
  const path = '/subscriptions/receipts'; // Boliger laster opp selv (bol42.js)
  const n0 = files.length;
  // Prompt 31: Glimt-toasten (ai-jobs.js) mens kvitteringene leses. Trykk på den viser stegene.
  const job = aiStart({ title: n0 > 1 ? `Leser ${n0} kvitteringer` : 'Leser kvitteringen', toast: n0 > 1 ? `Leser ${n0} kvitteringer …` : 'Leser kvitteringen …', model: 'Glimt · lokal', input: files.map((f) => f.name).join(', '),
    steps: ['Laster opp', 'Leser teksten', 'Finner butikk, dato og beløp', 'Velger kategori'], dur: 15000 });
  let r;
  try { r = await api(path, { method: 'POST', body: fd }); } catch (e) { aiDone(job, { silent: true }); throw e; }
  toast(`${r.jobs.length} kvittering${r.jobs.length === 1 ? '' : 'er'} leses i bakgrunnen`);
  // Følg med til AI-en er ferdig, så havner kvitteringen i listen.
  const poll = async (n) => {
    if (n > 30 || !['sub', 'dir'].includes(u.page)) { aiDone(job, { silent: true }); return; }
    await reload();
    if (!(await api('/receipts/jobs')).some((j) => r.jobs.some((x) => x.id === j.id) && ['pending', 'processing'].includes(j.status))) { aiDone(job, { text: n0 > 1 ? `✓ ${n0} kvitteringer er lest` : '✓ Kvitteringen er lest' }); return; }
    setTimeout(() => poll(n + 1), 2500);
  };
  setTimeout(() => poll(0), 2500);
}
// Følg med på en backup som kjører.
function pollBackup(n = 0) { setTimeout(async () => { if (n > 400) return; await loadBackup().catch(() => {}); if (S.ui.page === 'inn') render(); if (S.backup?.running) pollBackup(n + 1); }, 3000); }
async function reload() { await Promise.all((MODULE_LOADERS[u.page] ?? []).map((f) => f())); render(); }

export function bindModules(el) {
  bindFinn(el);
  bindSubs(el);
  bindB42(el);
  const wrap = (fn) => async (e) => { try { await fn(e); } catch (err) { toast(err.message); } };
  el.addEventListener('click', wrap(async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    if ((x = d('[data-msub-tog]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.msubTog); await api(`/subscriptions/${s.id}`, { method: 'PATCH', json: { active: !s.active } }); return reload(); }
    if ((x = d('[data-msub-low]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.msubLow); await api(`/subscriptions/${s.id}`, { method: 'PATCH', json: { lowUse: !s.lowUse } }); return reload(); }
    if ((x = d('[data-msub-del]'))) { if (!confirm('Slette abonnementet?')) return; await api(`/subscriptions/${x.dataset.msubDel}`, { method: 'DELETE' }); return reload(); }
    // Innstillinger → Boliger.
    if ((x = d('[data-bshare]'))) { const id = +x.dataset.bshare; u.bolShare = u.bolShare === id ? null : id; u.bolDel = null; return render(); }
    if ((x = d('[data-bdel]'))) {
      const id = +x.dataset.bdel, f = S.folders.find((y) => y.id === id);
      if (u.bolDel !== id) { u.bolDel = id; return render(); }
      await api(`/folders/${id}`, { method: 'DELETE' }); u.bolDel = null; toast(`${f?.name ?? 'Boligen'} er slettet. Transaksjonene i regnskapet beholdes.`); return reloadBol();
    }
    if ((x = d('[data-brm]'))) {
      const [fid, mid] = x.dataset.brm.split(':').map(Number), f = S.folders.find((y) => y.id === fid), m = f?.members.find((y) => y.id === mid), leave = !!x.dataset.leave;
      if (!confirm(leave ? `Forlate «${f.name}»? Du mister tilgangen til boligen.` : `Fjerne ${m?.name} fra «${f.name}»?`)) return;
      await api(`/folders/${fid}/members/${mid}`, { method: 'DELETE' });
      if (leave) { u.bolShare = null; }
      toast(leave ? `Du har forlatt ${f.name}` : `Tilgang fjernet · ${m?.name ?? 'medlemmet'}`); return reloadBol();
    }
    if ((x = d('[data-bcat-del]'))) {
      const id = +x.dataset.bcatDel, all = S.bolCats.categories.flatMap((c) => [c, ...c.children]), c = all.find((y) => y.id === id);
      const n = c?.count ? ` ${c.count} ${c.count === 1 ? 'post flyttes' : 'poster flyttes'} til ${c.parentId ? 'hovedkategorien' : '«Annet»'}.` : '';
      if (!confirm(`Fjerne «${c?.name}»?${n}`)) return;
      S.bolCats = await api(`/boliger/categories/${id}`, { method: 'DELETE' }); return render();
    }
    if ((x = d('[data-mtpl-del]'))) { if (!confirm('Slette malen? Neste fil med samme kolonner tolkes på nytt.')) return; await api(`/import/templates/${x.dataset.mtplDel}`, { method: 'DELETE' }); await loadImpTpl(); toast('Malen er slettet'); return render(); }
    if ((x = d('[data-mpick]'))) { const id = x.dataset.mpick, p = u.newPick ?? []; u.newPick = p.includes(id) ? p.filter((y) => y !== id) : [...p, id]; return render(); }
    if ((x = d('[data-maks-env]'))) { u.aksTest = null; await api('/stocks/config', { method: 'PUT', json: { env: x.dataset.maksEnv } }); await loadBoot(); await loadStocks(true); return render(); }
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
      case 'bol-settings': e.preventDefault(); u.setTab = 'bol'; if (location.hash === '#/inn') return render(); location.hash = '#/inn'; return;
      case 'bcat-reset': if (!confirm('Sette tilbake standardkategoriene? Egne og Glimt-lagde kategorier uten utgifter fjernes. Kategorier som er i bruk beholdes.')) return; S.bolCats = await api('/boliger/categories/reset', { method: 'POST' }); toast('Standardkategoriene er satt tilbake'); return render();
      case 'bcat-ai': S.bolCats = await api('/boliger/settings', { method: 'PUT', json: { aiNew: !S.bolCats.aiNew } }); return render();
      case 'aks-sync': { toast('Synkroniserer med Trading 212 …'); await loadStocks(true); return render(); }
      case 'aks-test': {
        const f = el.querySelector('[data-mform=aks]'); const v = f ? Object.fromEntries(new FormData(f)) : {};
        u.aksTest = { ok: false, message: 'Tester …' }; render();
        u.aksTest = await api('/stocks/test', { method: 'POST', json: { key: v.key, secret: v.secret, env: v.env } }).catch((err) => ({ ok: false, message: err.message })); return render();
      }
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
      case 'smb-wiz': {
        // Prompt 30: felles veiviser (finn server → logg inn → delt mappe → mappe → test og lagre).
        const { openSmbWizard } = await import('/assets/js/smb-wizard.js');
        openSmbWizard({ use: ['finans'], encrypted: !!S.backup.config.encrypt, onDone: async () => { await loadBackup(); u.msg = { ...(u.msg ?? {}), smb: 'Nettverksdisken er satt opp', smbOk: true }; render(); } });
        return;
      }
      case 'smb-adv': e.preventDefault?.(); u.smbAdv = !u.smbAdv; return render();
      case 'smb-on': S.backup.config = await api('/backup/smb', { method: 'PUT', json: { on: !S.backup.config.on } }); return render();
      case 'smb-test': { u.msg = { ...(u.msg ?? {}), smb: 'Tester …', smbOk: true }; render(); const r = await api('/backup/smb/test', { method: 'POST' }); u.msg.smb = r.message; u.msg.smbOk = r.ok; return render(); }
      case 'fr-empty': await api('/firstrun', { method: 'POST', json: { choice: 'empty' } }); S.boot.firstRun = false; return render();
      case 'fr-smb': u.setTab = 'data'; location.hash = '#/inn'; return;
      case 'imp-commit': return preview(true);
      case 'finn-imp-mail': return finnImp('/finn/import/mail', { method: 'POST', json: {} });
      case 'finn-imp-folder': return finnImp('/finn/import/mail', { method: 'POST', json: { folder: (S.finnImp.folder ?? S.finnFolder ?? 'FINN').trim() || 'FINN' } });
      case 'finn-imp-links': return finnImp('/finn/import/links', { method: 'POST', json: { text: S.finnImp.links, role: S.finnImp.role } });
    }
  }));
  el.addEventListener('change', wrap(async (e) => {
    const t = e.target;
    if (t.matches('[data-mrc]')) { const files = [...t.files]; t.value = ''; return uploadTo(t.dataset.mrc, files); }
    if (t.matches('[data-mimp]')) { impFiles = [...t.files]; t.value = ''; return preview(); }
    if (t.matches('[data-mimp-text]')) { S.imp.text = t.value; return preview(); }
    if (t.matches('[data-mimp-acc]')) { u.impAcc = t.value; return; }
    if (t.matches('[data-mfinn-imp]')) { const fd = new FormData(); for (const f of t.files) fd.append('files', f); t.value = ''; return finnImp('/finn/import/eml', { method: 'POST', body: fd }); }
    if (t.matches('[data-mfinn-links]')) { S.finnImp.links = t.value; return render(); }
    if (t.matches('[data-mfinn-folder]')) { S.finnImp.folder = t.value; return; }
    if (t.matches('[data-mfinn-role]')) { S.finnImp.role = t.value; return; }
    if (t.matches('[data-msub-cyc]')) { await api(`/subscriptions/${t.dataset.msubCyc}`, { method: 'PATCH', json: { cycle: t.value } }); return reload(); }
    if (t.matches('[data-brole]')) { const [fid, mid] = t.dataset.brole.split(':'); await api(`/folders/${fid}/members/${mid}`, { method: 'PATCH', json: { role: t.value } }); const mm = (S.folders ?? []).find((y) => y.id === +fid)?.members?.find((y) => y.id === +mid), rn = t.selectedOptions?.[0]?.textContent?.trim(); toast(mm?.name && rn ? `Rolle endret · ${mm.name} er nå ${rn}` : 'Rolle endret'); return reloadBol(); }
    if (t.matches('[data-mbk-file]')) {
      const f = t.files[0]; t.value = '';
      if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      const ph = el.querySelector('[data-mbk-phrase]')?.value; if (ph) fd.append('phrase', ph);
      toast('Leser backupen …');
      S.stage = await api('/backup/stage', { method: 'POST', body: fd }); return render();
    }
  }));
  // Underkategori legges til med Enter.
  el.addEventListener('keydown', wrap(async (e) => {
    const t = e.target;
    if (e.key !== 'Enter' || !t.matches('[data-bcat-sub]')) return;
    e.preventDefault();
    const name = t.value.trim();
    if (!name) return;
    S.bolCats = await api('/boliger/categories', { method: 'POST', json: { name, parentId: +t.dataset.bcatSub } });
    render(); el.querySelector(`[data-bcat-sub="${t.dataset.bcatSub}"]`)?.focus();
  }));
  el.addEventListener('input', (e) => { if (e.target.matches('[data-keep]')) { const o = el.querySelector('[data-keep-out]'); if (o) o.textContent = e.target.value; } });
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest('[data-mform]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    switch (f.dataset.mform) {
      case 'folder': { const r = await api('/folders', { method: 'POST', json: { ...v, share: (u.newPick ?? []).map((id) => ({ userId: id, role: 'editor' })) } }); u.newPick = []; toast(r.members.length > 1 ? `${r.name} er opprettet og delt` : `${r.name} er opprettet`); return reloadBol(); }
      case 'bshare': if (!v.userId) return; { const r = await api(`/folders/${f.dataset.fid}/members`, { method: 'POST', json: v }); toast(`${r.name} er delt`); } return reloadBol();
      case 'bcat': S.bolCats = await api('/boliger/categories', { method: 'POST', json: { name: v.name } }); toast(`«${v.name.trim()}» er lagt til`); render(); el.querySelector('[data-mform=bcat] input')?.focus(); return;
      case 'aks': {
        await api('/stocks/config', { method: 'PUT', json: { key: v.key, secret: v.secret, env: v.env } }); await loadBoot();
        u.aksTest = await api('/stocks/test', { method: 'POST', json: {} }).catch((err) => ({ ok: false, message: err.message }));
        toast(u.aksTest.ok ? 'Nøkkelen er lagret og virker' : 'Nøkkelen er lagret, men testen feilet'); await loadStocks(true); return render();
      }
      case 'smb': {
        const body = { share: v.share, dir: v.dir, version: v.version, user: v.user, domain: v.domain, schedule: v.schedule, keep: +v.keep };
        if (v.pw) body.pw = v.pw; if (v.phrase) body.phrase = v.phrase;
        S.backup.config = await api('/backup/smb', { method: 'PUT', json: body }); u.msg = { ...(u.msg ?? {}), smb: 'Lagret', smbOk: true }; await loadBackup(); return render();
      }
      case 'remote': S.stage = await api('/backup/stage', { method: 'POST', json: { remote: u.remotePhrase, phrase: v.phrase } }); u.remotePhrase = null; return render();
      case 'finn': { const r = await api('/finn', { method: 'POST', json: v }); toast(`${r.item} lagt til`); return reload(); }
    }
  }));
  // Logoer som ikke finnes: vis forbokstaven (CSP stopper inline onerror).
  el.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.parentNode?.classList?.contains('m-logo')) { img.parentNode.classList.add('err'); img.remove(); } }, true);
}
