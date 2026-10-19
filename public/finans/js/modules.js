// FinansHub v2-moduler i sidemenyen: Subscription OS, Delte mapper, Finn-handler og Import.
// Samme mønster som desktop.js: sidene tegnes fra S, hendelser fanges med delegering (data-m*-attributter).
import { S, api, esc, n0, n2, sgn, dd, today, render, toast, loadBoot, accs, logo, aiLine, ICONS, parseAmount, ini, smooth, icon, sheetBtn } from './core.js';
import { clearBtn } from '/assets/js/searchfield.js';
import { finnPage as finnDesk, loadFinn as loadFinnDesk, bindFinn } from './finn-desktop.js'; // Finn-handler med detaljside
import { subPage, loadSubs, bindSubs } from './subs-desktop.js'; // Subscription OS: Oversikt og Kalender
import { glimt } from '/assets/js/glimt.js';
import { aiStart, aiDone } from '/assets/js/ai-jobs.js';

Object.assign(ICONS, {
  sub: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  dir: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 14a2 2 0 1 0 0-.01M15 14a2 2 0 1 0 0-.01',
  finn: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  imp: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  aks: 'M3 17l6-6 4 4 8-8M15 7h6v6',
});

export const MODULE_PAGES = [['aks', 'Aksjer'], ['sub', 'Subscription OS'], ['dir', 'Boliger'], ['finn', 'Finn-handler'], ['imp', 'Import']];
export const MODULE_SUB = { aks: 'Trading 212', sub: 'Abonnementer', dir: 'Utgifter, prosjekter og regninger per bolig', finn: 'Trygg betaling, Fiks ferdig, Tillit', imp: 'CSV, XLSX og tekst' };
const u = S.ui;
const card = (inner, style = '') => `<section class="card" style="${style}">${inner}</section>`;
const skel = (h = 160) => `<div class="skel" style="min-height:${h}px"></div>`;
const kr0 = (v) => `${n0(v)} kr`;
const modes = (key, cur) => `<div class="mod-modes">${[['new', key === 'dir' ? 'Ny utgift' : 'Nytt abonnement'], ['rc', 'Kvittering'], ['tx', 'Fra transaksjoner']]
  .map(([m, n]) => `<button class="mod-mode" data-mmode="${key}:${m}" aria-pressed="${cur === m}">${n}</button>`).join('')}</div>`;
const txPick = (target) => S.recentOut ? `<div class="mod-txs">${S.recentOut.map((t) => `<button data-mtx="${target}:${t.id}">${logo(t, 26, 7)}<span class="grow"><span>${esc(t.description)} <span class="muted">· ${dd(t.date)}</span></span>${aiLine(t.aiShort, 'd-ai')}</span><span class="mono">${n2(Math.abs(t.amount))} kr</span><span class="acc-l">+</span></button>`).join('') || '<div class="note" style="padding:12px">Ingen utgifter ennå.</div>'}</div>` : skel(120);

/* ===================== Subscription OS: se subs-desktop.js ===================== */

/* ===================== Delte mapper ===================== */

const MONTHS_LONG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const TYPES = ['Enebolig', 'Leilighet', 'Hytte', 'Utleie', 'Annet'];
const ROLE_N = { owner: 'Eier', editor: 'Kan redigere', viewer: 'Kan se' };
const short = (n) => esc(String(n ?? '').slice(0, 2).toUpperCase());
const optList = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');

// Boliger der brukeren kan redigere (for «Legg i bolig»), og hvilken bolig nye poster havner i.
const editable = () => (S.folders ?? []).filter((f) => f.role && f.role !== 'viewer');
const target = () => (u.bolTarget && editable().some((f) => f.id === u.bolTarget) ? u.bolTarget : u.dir);
const targetName = () => (S.folders ?? []).find((f) => f.id === target())?.name ?? S.folder?.name ?? '';
// Kategorivalg: hovedkategorier med underkategoriene rett under («Hage og uteområde › Blomster»).
const catSelect = (name, opts, sel, first) => `<select class="inp" name="${name}">${first ? `<option value="">${esc(first)}</option>` : ''}${(opts ?? []).map((o) => `<option value="${o.id}"${String(o.id) === String(sel ?? '') ? ' selected' : ''}>${o.sub ? '   ' : ''}${esc(o.label)}</option>`).join('')}</select>`;
const legg = (cur) => {
  const list = editable();
  if (list.length < 2) return '';
  return `<label class="bol-legg">Legg i bolig<select class="inp" data-mbol-target>${list.map((f) => `<option value="${f.id}"${f.id === target() ? ' selected' : ''}>${esc(f.name)}${f.id === cur.id ? ' (denne)' : ''}</option>`).join('')}</select></label>`;
};
const toBolSettings = '<a class="btn ghost" href="#/inn" data-mact="bol-settings">+ Ny bolig i Innstillinger</a>';

const BOL_TABS = [['ov', 'Oversikt'], ['ut', 'Utgifter'], ['pr', 'Prosjekter'], ['rg', 'Regninger'], ['kv', 'Kvitteringer']];
const BOL_ICON = { Hytte: 'M3 20h18M5 20V11l7-7 7 7v9M10 20v-5h4v5', Leilighet: 'M5 21V4h14v17M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2', Utleie: 'M3 11l9-7 9 7M5 10v10h14V10M15 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0M12 17v3', Annet: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' };
const bolIcon = (type, sz = 20) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${BOL_ICON[type] ?? 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6'}"/></svg>`;
const bolHue = (type) => ({ Hytte: 28, Leilighet: 215, Utleie: 160, Annet: 280 }[type] ?? 14);
const dueTxt = (x) => (x.days < 0 ? `${-x.days} d over` : x.days === 0 ? 'i dag' : x.days === 1 ? 'i morgen' : x.days <= 31 ? `om ${x.days} d` : dd(x.date));
function upcomingCard(cur, n = 6, style = 'flex:2 1 260px;padding:20px;gap:6px') {
  const list = (cur.upcoming ?? []).slice(0, n);
  const rows = list.map((x) => `<div class="bol-up${x.days < 0 ? ' late' : x.days <= 7 ? ' soon' : ''}"><span class="bol-up-d"><b>${esc(dd(x.date))}</b><small>${esc(dueTxt(x))}</small></span><span class="bol-up-dot" style="background:${x.color}"></span><span class="grow ell-wrap"><b class="ell" style="display:block;font-weight:500">${esc(x.title)}</b><span class="note ell" style="display:block;font-size:12px">${x.kind === 'installment' ? 'Avdrag · ' : ''}${esc(x.sub)}</span></span><b class="mono" style="white-space:nowrap">${x.amount != null ? kr0(x.amount) : '–'}</b>${x.kind === 'installment' && cur.canEdit ? `<button class="btn sm pay" data-mpay="${x.id}">Betalt</button>` : ''}</div>`).join('');
  return card(`<div class="card-h" style="align-items:baseline"><h3>Kommende forfall</h3><button class="link-btn" data-mbol-tab="rg">Regninger ›</button></div>${rows || '<div class="note" style="font-size:13.5px">Ingen regninger eller avdrag forfaller de neste 90 dagene. Legg inn faste regninger under Regninger.</div>'}`, style);
}
function recentCard(cur) {
  const rows = cur.entries.slice(0, 6).map((e) => `<div class="dir-row2">${logo({ ...e, color: '#A0A0AA' }, 30, 8)}<span class="grow ell-wrap"><span class="ell" style="display:block">${esc(e.description)}</span><span class="dir-meta"><span class="mtag" style="background:${e.color}1F;color:${e.color}">${e.pending ? `${glimt(12, 'tenker')} Kategoriseres …` : `${e.aiCategory ? '✦ ' : ''}${esc(e.categoryLabel ?? e.category)}`}</span>${dd(e.date)}${e.receiptId ? ' · 🧾' : ''}</span></span><b class="mono" style="white-space:nowrap">${e.pending ? '…' : kr0(e.amount)}</b></div>`).join('');
  return card(`<div class="card-h" style="padding:12px 0 4px;align-items:baseline"><h3>Siste utgifter</h3><button class="link-btn" data-mbol-tab="ut">Alle ${cur.entries.length} ›</button></div>${rows || '<div class="note" style="padding:14px 0">Ingen utgifter ennå. Dra en kvittering inn på siden for å komme i gang.</div>'}`, 'padding:8px 20px 14px;gap:0');
}
function projMini(cur) {
  const rows = cur.projects.map((p) => { const pct = p.budget ? Math.min(100, (p.spent / p.budget) * 100) : 0, over = p.remaining < 0;
    return `<button class="bol-pm" data-mbol-tab="pr"><span class="bol-pm-h"><b>${esc(p.name)}</b><span class="mono" style="color:${over ? 'var(--neg)' : 'var(--dim)'}">${Math.round(pct)} %</span></span><span class="prog" style="height:6px"><i style="width:${pct}%;background:${over ? 'var(--neg)' : 'var(--acc)'}"></i></span><span class="note" style="font-size:12px">${n0(p.spent)} av ${n0(p.budget)} kr${p.vendor ? ' · ' + esc(p.vendor) : ''}</span></button>`; }).join('');
  return card(`<div class="card-h" style="align-items:baseline"><h3>Prosjekter</h3><button class="link-btn" data-mbol-tab="pr">Alle ›</button></div><div style="display:flex;flex-direction:column;gap:8px">${rows}</div>`, 'flex:3 1 340px;padding:20px;gap:12px');
}
// Utgifter som tidslinje per måned, med søk og kategorifilter.
function timelineCard(cur) {
  const qv = (u.bolQ ?? '').trim().toLowerCase();
  const rows = cur.entries.filter((e) => (!u.dcat || e.category === u.dcat) && (!qv || [e.description, e.categoryLabel, e.category, e.project, e.paidBy, e.aiShort].some((x) => String(x ?? '').toLowerCase().includes(qv))));
  const groups = new Map();
  for (const e of rows) { const m = (e.date ?? '').slice(0, 7); if (!groups.has(m)) groups.set(m, []); groups.get(m).push(e); }
  const chips = [['', 'Alle'], ...cur.categories.map((c) => [c.name, c.name])].map(([v, n]) => `<button class="bol-chip${(u.dcat ?? '') === v ? ' on' : ''}" data-mbol-cat="${esc(v)}">${esc(n)}</button>`).join('');
  const body = [...groups].map(([m, list]) => { const [y, mo] = m.split('-');
    return `<div class="bol-tl-m"><div class="bol-tl-h"><b>${MONTHS_LONG[+mo - 1] ?? m} ${y ?? ''}</b><span class="mono">${kr0(list.reduce((a, e) => a + e.amount, 0))}</span></div>${list.map((e) => entryRow(cur, e)).join('')}</div>`; }).join('');
  return card(`<div class="bol-tl-top"><h3>${esc(u.dcat || 'Alle utgifter')}</h3><span class="note" style="font-size:12.5px">${rows.length} poster · ${kr0(rows.reduce((a, e) => a + e.amount, 0))}</span><span class="bol-qw${u.bolQ ? ' has' : ''}" data-sf>${clearBtn()}<input class="inp bol-q" type="search" placeholder="Søk i butikk, kategori, prosjekt …" value="${esc(u.bolQ ?? '')}" data-mbol-q aria-label="Søk i utgifter"></span></div>
    <div class="bol-chips">${chips}</div>${body || `<div class="note" style="padding:18px 0;border-top:1px solid var(--sep)">${qv ? `Ingen treff på «${esc(u.bolQ)}».` : 'Ingen utgifter her ennå.'}</div>`}`, 'padding:16px 20px;gap:10px');
}
function entryRow(cur, e) {
  return `<div class="dir-row2">${e.receiptId ? `<a class="bol-thumb" href="/finans/api/folders/${cur.id}/receipts/${e.receiptId}/file" target="_blank" rel="noopener" title="Åpne kvitteringen"><img src="/finans/api/folders/${cur.id}/receipts/${e.receiptId}/thumb" alt="" loading="lazy"></a>` : logo({ ...e, color: '#A0A0AA' }, 30, 8)}<span class="grow ell-wrap"><span class="ell" style="display:block">${esc(e.description)}</span>
    <span class="dir-meta">${cur.canEdit && !e.pending ? `<label class="mtag mtag-sel" style="background:${e.color}1F;color:${e.color}" title="Endre kategori">${e.aiCategory ? '✦ ' : ''}${esc(e.categoryLabel ?? e.category)}<select data-mentry-cat="${e.id}" aria-label="Kategori for ${esc(e.description)}">${(cur.catTree ?? []).map((o) => `<option value="${o.id}"${o.id === e.categoryId ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`
      : `<span class="mtag" style="background:${e.color}1F;color:${e.color}">${e.pending ? `${glimt(12, 'tenker')} Kategoriseres …` : `${e.aiCategory ? '✦ ' : ''}${esc(e.categoryLabel ?? e.category)}`}</span>`}${e.project ? `<span class="mtag">${esc(e.project)}</span>` : ''}${dd(e.date)} · betalt av ${esc(e.paidBy)}</span>${aiLine(e.aiShort, 'd-ai')}</span>
    <b class="mono" style="white-space:nowrap">${e.pending ? '…' : kr0(e.amount)}</b>${cur.canEdit ? `<button class="x-btn sm" data-mentry-del="${e.id}" aria-label="Fjern">×</button>` : ''}</div>`;
}
function receiptsCard(cur) {
  const list = cur.receipts ?? [];
  const drop = cur.canEdit ? `<label class="bol-drop"><span class="bol-drop-ic" aria-hidden="true">↑</span><b>Dra kvitteringer og regninger hit</b><span>eller trykk for å velge · bilder og PDF · ✦ AI leser butikk, dato og beløp og velger kategori</span><input type="file" multiple accept="image/*,application/pdf" data-mrc="folder" hidden></label>` : '';
  const grid = list.map((r) => `<a class="bol-rc" href="${r.fileUrl}" target="_blank" rel="noopener"><span class="bol-rc-img"><img src="${r.thumbUrl}" alt="" loading="lazy">${r.pending ? '<span class="bol-rc-pend">✦ Leses …</span>' : ''}</span><span class="bol-rc-t"><b class="ell">${esc(r.description)}</b><span class="note">${dd(r.date)} · <span style="color:${r.color}">${esc(r.category)}</span></span><b class="mono">${r.pending ? '…' : kr0(r.amount)}</b></span></a>`).join('');
  return `${drop}${card(`<div class="card-h" style="align-items:baseline"><h3>Kvitteringer</h3><span class="note" style="font-size:12.5px">${list.length} lagret i ${esc(cur.name)}</span></div>${grid ? `<div class="bol-rcs">${grid}</div>` : '<div class="note" style="font-size:13.5px">Ingen kvitteringer ennå.</div>'}`, 'padding:20px;gap:14px')}`;
}

// Boliger (design «Boliger» web): boligvelger som piller, fanene Oversikt · Utgifter · Prosjekter · Regninger · Tilgang.
// Budsjett, farge og varselvalg lagres på boligen når serveren tar imot dem, og ellers lokalt i nettleseren.
const BOL_COLORS = ['#2f6b45', '#2b5d8a', '#7a3f6e', '#a8661b', '#b23a2a', '#3f4655'];
const META_KEY = 'fh_bol_meta';
const metaAll = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; } };
const bolMeta = (f) => { const m = metaAll()[f.id] ?? {}; return { budget: f.budget ?? m.budget ?? null, color: f.color ?? m.color ?? BOL_COLORS[(f.id - 1) % BOL_COLORS.length], autoCat: f.autoCat ?? m.autoCat ?? true, notify: f.notify ?? m.notify ?? true }; };
async function setBolMeta(f, patch) {
  const all = metaAll(); all[f.id] = { ...all[f.id], ...patch };
  try { localStorage.setItem(META_KEY, JSON.stringify(all)); } catch { /* privat modus */ }
  if (f.isOwner) { try { S.folder = await api(`/folders/${f.id}`, { method: 'PATCH', json: patch }); } catch { /* eldre server: beholdes lokalt */ } }
}
const BOL_TABS2 = [['ov', 'Oversikt'], ['ut', 'Utgifter'], ['pr', 'Prosjekter'], ['rg', 'Regninger'], ['acc', 'Tilgang']];
const CAT_GLYPH = { Strøm: '⚡', Vaktmester: '⌂', Vedlikehold: '⚒', 'Kommunale avgifter': '▤', Forsikring: '◈', Hage: '✿', 'Hage og uteområde': '✿', Håndverker: '⚒', Renhold: '✧', Møbler: '▭', Internett: '⌁', Oppvarming: '♨' };
const glyph = (c) => CAT_GLYPH[c] ?? (String(c ?? '?').slice(0, 1).toUpperCase());
const tint = (c) => `color-mix(in oklab,${c} 16%,transparent)`;
const ROLE_TXT = { owner: ['Eier', 'Full tilgang, kan invitere og slette'], editor: ['Kan laste opp', 'Legger til kvitteringer og utgifter'], viewer: ['Kan se', 'Ser oversikt og kvitteringer'] };
const inReview = (e) => e.pending || e.status === 'review' || e.review === true;
const avColor = (n) => BOL_COLORS[[...String(n ?? '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % BOL_COLORS.length];
const ini2 = (n) => esc(String(n ?? '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?');
const topCats = (cur) => (cur.catTree ?? []).filter((o) => !o.sub);
// Prompt 24: bakgrunn per bolig: 'color' | 'preset:stromstad' | 'upload:<id>'. Boliger med «Strømstad» i navn eller adresse
// får Strømstad-bildet når bakgrunn ikke er satt. Serveren sender backgroundUrl; ellers bygges adressen her.
const STROMSTAD = '/assets/boliger/stromstad.webp';
const bgKey = (f) => f?.background || metaAll()[f?.id]?.background || (/str[øo]mstad/i.test(`${f?.name ?? ''} ${f?.address ?? ''}`) ? 'preset:stromstad' : 'color');
const bgUrlOf = (f, key = bgKey(f)) => (key === 'preset:stromstad' ? STROMSTAD : key.startsWith('upload:') ? (f?.background === key && f?.backgroundUrl) || `/finans/api/folders/${f.id}/bg?v=${encodeURIComponent(key.slice(7))}` : key.startsWith('data:') || key.startsWith('blob:') ? key : '');
// Enkle anførselstegn: verdien brukes inne i style="…".
const cssU = (url) => `url('${String(url).replace(/["'()\\\s]/g, encodeURIComponent)}')`;
const heroBg = (url, c) => (url ? `linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.15) 40%,rgba(0,0,0,.55)),${cssU(url)} center / cover no-repeat` : '');
const ED_COLORS = ['#2f6b45', '#2b5d8a', '#b23a2a', '#a8661a', '#7a3b6b', '#2e6f75', '#5c5850'];
// «Rediger bolig» (Boliger.dc.html): forhåndsvisning, navn, adresse, budsjett, farge, bakgrunn, Lagre og Slett bolig (to trykk).
function editHomeSheet() {
  const E = u.bolEd;
  if (!E) return '';
  const f = (S.folders ?? []).find((x) => x.id === E.id) ?? {}, url = E.preview || bgUrlOf({ ...f, background: E.bg }, E.bg);
  const prev = url ? `linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.5)),${cssU(url)} center / cover` : `linear-gradient(150deg,${E.color},color-mix(in oklab,${E.color} 70%,#000))`;
  const own = E.bg.startsWith('upload:') || E.preview ? [[E.bg, 'Eget bilde', E.preview || bgUrlOf({ ...f, background: E.bg }, E.bg)]] : f.background?.startsWith('upload:') ? [[f.background, 'Eget bilde', bgUrlOf(f, f.background)]] : [];
  const opts = [['color', 'Farge', ''], ['preset:stromstad', 'Strømstad', STROMSTAD], ...own];
  const last = (S.folders ?? []).length <= 1;
  return `<div class="bol2-modal" data-bol2-back><div class="bol2-sheet bol2-ed" role="dialog" aria-modal="true" aria-label="Rediger bolig">
    <div class="bol2-sheet-h"><div><div class="bol2-kick">FINANS · BOLIGER</div><h3>Rediger bolig</h3></div>${sheetBtn('Lukk', 'data-bol2-act="close"', 'sec')}</div>
    <div class="bol2-ed-prev" style="background:${prev}" data-bol2-edprev>${esc(E.name || 'Bolig')}</div>
    <label class="bol2-f">Navn<input class="inp" data-bol2-ed="name" value="${esc(E.name)}" maxlength="60"></label>
    <label class="bol2-f">Adresse<input class="inp" data-bol2-ed="address" value="${esc(E.address)}" maxlength="120"></label>
    <label class="bol2-f">Budsjett per måned (kr)<input class="inp mono" data-bol2-ed="budget" inputmode="numeric" value="${esc(E.budget)}" placeholder="Ikke satt"></label>
    <div class="bol2-f">Farge<div class="bol2-sw">${ED_COLORS.map((c) => `<button type="button" style="background:${c}" class="${c === E.color ? 'on' : ''}" data-bol2-edc="${c}" aria-label="Farge ${c}"></button>`).join('')}<label class="bol2-swc" title="Egen farge"><input type="color" data-bol2-ed="color" value="${esc(/^#[0-9a-f]{6}$/i.test(E.color) ? E.color : '#2f6b45')}" aria-label="Egen farge"></label></div></div>
    <div class="bol2-f">Bakgrunn<div class="bol2-bgs">${opts.map(([k, n, img]) => `<button type="button" class="bol2-bgo${E.bg === k ? ' on' : ''}" data-bol2-edbg="${esc(k)}"><span style="background:${img ? `${cssU(img)} center / cover` : E.color}"></span><b>${n}</b></button>`).join('')}
      <label class="bol2-bgo up"><span>+</span><b>${E.busy ? 'Laster opp …' : 'Last opp'}</b><input type="file" accept="image/*" data-bol2-edup hidden></label></div></div>
    <div class="bol2-sheet-b col"><button type="button" class="btn pri" data-bol2-act="ed-save"${E.busy ? ' disabled' : ''}>Lagre</button>
      <button type="button" class="btn bol2-del" data-bol2-act="ed-del"${last ? ' disabled' : ''}>${last ? 'Kan ikke slette siste bolig' : u.bolEdDel ? `Trykk igjen for å slette ${esc(E.name)}` : 'Slett bolig'}</button></div>
  </div></div>`;
}
function openEdit(id) {
  const f = (S.folders ?? []).find((x) => x.id === id);
  if (!f) return;
  const det = S.folder?.id === id ? S.folder : f, m = bolMeta(det);
  u.bolEd = { id, name: det.name ?? '', address: det.address ?? '', budget: m.budget ?? '', color: m.color, bg: bgKey(det), preview: null, file: null };
  u.bolEdDel = false;
  render();
}
/** Skalerer bildet til maks 1200 px bredde og gjør det om til JPEG. */
async function scaleBg(file, W = 1200) {
  let src;
  try { src = await createImageBitmap(file); } catch { src = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Kunne ikke lese bildet')); i.src = URL.createObjectURL(file); }); }
  const k = Math.min(1, W / src.width), c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
}

function bolTile(cur, e, sz = 44) {
  if (e.receiptId) return `<span class="bol2-tile" style="width:${sz}px;height:${sz}px"><img src="/finans/api/folders/${cur.id}/receipts/${e.receiptId}/thumb" alt="" loading="lazy"></span>`;
  return `<span class="bol2-tile" style="width:${sz}px;height:${sz}px;background:${tint(e.color ?? '#8a8478')};color:${e.color ?? 'var(--muted)'}">${esc(glyph(e.category))}</span>`;
}
function catChipRow(cur, e) {
  const tops = topCats(cur); const curId = tops.find((o) => o.label === e.category)?.id ?? e.categoryId;
  const list = [...tops.filter((o) => o.id === curId), ...tops.filter((o) => o.id !== curId)].slice(0, 6);
  return `<div class="bol2-chips">${list.map((o) => `<button class="bol2-chip${o.id === curId ? ' on' : ''}" data-bol2-cat="${e.id}:${o.id}"><i style="background:${(cur.categories ?? []).find((c) => c.name === o.label)?.color ?? 'var(--muted)'}"></i>${esc(o.label)}</button>`).join('')}</div>`;
}
function reviewCards(cur) {
  const list = cur.entries.filter(inReview);
  if (!list.length) return '';
  return `<div class="bol2-lab"><span>TIL GJENNOMGANG · ${list.length}</span>${cur.canEdit && list.some((e) => !e.pending) ? '<button class="link-btn" data-bol2-act="ok-all">Godkjenn alle</button>' : ''}</div>
    ${list.map((e) => `<div class="bol2-rev"><div class="bol2-rev-h" data-bol2-open="${e.id}" role="button" tabindex="0" aria-label="Åpne ${esc(e.description)}">${bolTile(cur, e)}<span class="grow ell-wrap"><b class="ell">${esc(e.description)}</b><span class="note">${e.pending ? '✦ AI leser kvitteringen …' : `✦ AI foreslår ${esc(e.categoryLabel ?? e.category)} · ${esc(e.paidBy)}`}</span></span><b class="mono">${e.pending ? '…' : kr0(e.amount)}</b><span class="bol2-chev" aria-hidden="true">›</span></div>
      ${e.pending || !cur.canEdit ? '' : catChipRow(cur, e)}
      <div class="bol2-rev-b"><button class="btn" data-bol2-open="${e.id}">Detaljer</button>${cur.canEdit ? `<button class="btn pri" data-bol2-ok="${e.id}"${e.pending ? ' disabled' : ''}>Godkjenn</button>` : ''}</div></div>`).join('')}`;
}
function entryLine(cur, e, i, full = false) {
  const rv = inReview(e);
  return `<button class="bol2-row${i ? '' : ' first'}" data-bol2-open="${e.id}">${bolTile(cur, e, 40)}<span class="grow ell-wrap"><b class="ell">${esc(e.description)}</b><span class="note ell" style="${rv ? 'color:var(--acc-l)' : ''}">${esc(dd(e.date))} · ${esc(e.categoryLabel ?? e.category)}${full ? ` · ${esc(e.paidBy)}` : ''}${e.project ? ` · ${esc(e.project)}` : ''}</span></span>
    <span class="bol2-row-r"><b class="mono">${e.pending ? '…' : kr0(e.amount)}</b>${e.pending ? '<small>Leses av AI</small>' : rv ? '<small>Til gjennomgang</small>' : e.receiptId ? '<small>⎙ Kvittering</small>' : ''}</span></button>`;
}
function detailSheet(cur) {
  const e = cur.entries.find((x) => x.id === u.bolSel);
  if (!e) return '';
  const rv = inReview(e), mem = cur.members.length || 1, ed = cur.canEdit && !e.pending;
  return `<div class="bol2-modal" data-bol2-back><div class="bol2-sheet" role="dialog" aria-modal="true" aria-label="${esc(e.description)}">
    <div class="bol2-sheet-h"><div class="grow" style="min-width:0"><div class="bol2-kick">${esc(cur.name.toUpperCase())} · ${e.pending ? 'LESES AV AI' : rv ? 'TIL GJENNOMGANG' : 'GODKJENT'}</div>${ed ? `<input class="bol2-edt" data-bol2-ee="merchant" value="${esc(e.description)}" maxlength="120" aria-label="Butikk eller beskrivelse" autocomplete="off">` : `<h3>${esc(e.description)}</h3>`}</div>${sheetBtn('Ferdig', 'data-bol2-act="close"', 'pri')}</div>
    <div class="bol2-sheet-top">${e.receiptId ? `<a class="bol2-rc" href="/finans/api/folders/${cur.id}/receipts/${e.receiptId}/file" target="_blank" rel="noopener" title="Åpne kvitteringen"><img src="/finans/api/folders/${cur.id}/receipts/${e.receiptId}/thumb" alt=""></a>` : '<span class="bol2-rc empty"></span>'}
      <div class="grow" style="min-width:0">${ed ? `<label class="bol2-eamt"><input data-bol2-ee="amount" inputmode="decimal" value="${esc(n2(e.amount))}" aria-label="Beløp i kroner" autocomplete="off"><span>kr</span></label>
        <div class="bol2-edate"><input type="date" data-bol2-ee="date" value="${esc(e.date ?? '')}" aria-label="Dato"><span class="note">· lagt til av ${esc(e.paidBy)}${e.editedBy ? ` · endret av ${esc(e.editedBy)}` : ''}</span></div><span class="note bol2-esave" data-bol2-esave aria-live="polite"></span>`
        : `<div class="bol2-amt">${e.pending ? '…' : kr0(e.amount)}</div><div class="note">${esc(dd(e.date))} · lagt til av ${esc(e.paidBy)}</div>`}${e.aiShort ? `<div class="bol2-ai">✦ ${esc(e.aiShort)}</div>` : ''}</div></div>
    ${cur.canEdit && !e.pending ? `<div class="note" style="font-size:13px">Kategori</div>${catChipRow(cur, e)}` : ''}
    ${cur.canEdit && mem > 1 ? `<div class="bol2-opt"><span><b>Betalt av</b><span class="note">Fordeles etter boligens nøkkel (${cur.split === 'equal' ? `likt på ${mem}` : 'egen nøkkel'})</span></span><select class="inp" data-bol2-paid="${e.id}">${cur.members.map((m) => `<option${m.name === e.paidBy ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>` : ''}
    ${e.receiptId ? `<a class="bol2-opt" href="/finans/api/folders/${cur.id}/receipts/${e.receiptId}/file" target="_blank" rel="noopener"><b>Original kvittering</b><span class="note">Åpne ›</span></a>` : ''}
    ${cur.canEdit ? `<div class="bol2-sheet-b"><button class="btn bol2-del" data-bol2-del="${e.id}">${u.bolDelE === e.id ? 'Trykk igjen for å slette' : 'Slett'}</button><button class="btn pri" data-bol2-ok="${e.id}"${e.pending ? ' disabled' : ''}>${rv ? 'Godkjenn' : 'Lagre'}</button></div>` : ''}
  </div></div>`;
}
function newHomeSheet() {
  if (!u.bolNew) return '';
  return `<div class="bol2-modal" data-bol2-back><form class="bol2-sheet" data-mform="folder" role="dialog" aria-modal="true" aria-label="Ny bolig">
    <div class="bol2-sheet-h"><div><div class="bol2-kick">FINANS · BOLIGER</div><h3>Ny bolig</h3></div>${sheetBtn('Avbryt', 'data-bol2-act="close"', 'sec')}</div>
    <label class="bol2-f">Navn<input class="inp" name="name" placeholder="F.eks. Hytta Geilo" required></label>
    <label class="bol2-f">Adresse<input class="inp" name="address" placeholder="Valgfritt"></label>
    <label class="bol2-f">Type<select class="inp" name="type">${optList(TYPES.map((t) => [t, t]), 'Hytte')}</select></label>
    <div class="note" style="font-size:12.5px">Du kan dele boligen og sette budsjett under Tilgang etterpå.</div>
    <div class="bol2-sheet-b"><button type="button" class="btn" data-bol2-act="close">Avbryt</button><button class="btn pri">Opprett</button></div></form></div>`;
}
const SH = { home: null, list: [], sel: new Set(), loading: false, busy: false };
function shareState(cur) {
  if (SH.home !== cur.id) {
    SH.home = cur.id; SH.sel = new Set(); SH.list = []; SH.loading = true;
    api(`/users/shareable?home=${cur.id}`).catch(() => api(`/folders/${cur.id}/shareable`)).catch(() => null).then((r) => {
      // Eldre server: alle brukere minus medlemmene (bare navn vises).
      SH.list = Array.isArray(r) ? r : (S.users ?? []).filter((x) => !cur.members.some((m) => m.userId === x.id) && x.id !== S.boot?.me?.id)
        .map((x) => ({ id: x.id, name: x.displayName ?? x.name ?? 'Bruker', color: avColor(x.displayName ?? x.name), avatarUrl: x.avatarUrl ?? null }));
      SH.loading = false; render();
    });
  }
  return SH;
}
async function shareUsers() {
  const ids = [...SH.sel], role = u.bolInvRole ?? 'editor';
  if (!ids.length || SH.busy) return;
  const names = SH.list.filter((x) => SH.sel.has(String(x.id))).map((x) => x.name);
  SH.busy = true; render();
  try {
    try { S.folder = await api(`/folders/${u.dir}/members`, { method: 'POST', json: { userIds: ids, role } }); }
    catch (err) { if (ids.length > 1 || err.status === 404) { for (const id of ids) S.folder = await api(`/folders/${u.dir}/members`, { method: 'POST', json: { userId: id, role } }); } else throw err; }
    toast(`${names.length <= 2 ? names.join(' og ') : `${names.length} personer`} har fått tilgang`);
    SH.home = null; // hent listen på nytt
  } finally { SH.busy = false; }
  return reload();
}
function accessTab(cur, meta) {
  const ownerCount = cur.members.filter((m) => m.role === 'owner').length;
  const rows = cur.members.map((m, i) => {
    const [rn, rd] = ROLE_TXT[m.role] ?? ROLE_TXT.editor;
    const canChange = cur.isOwner && !(m.role === 'owner' && ownerCount < 2);
    return `<div class="bol2-mem${i ? '' : ' first'}"><span class="bol2-av" style="background:${avColor(m.name)}">${ini2(m.name)}</span><span class="grow ell-wrap"><b class="ell">${esc(m.name)}</b><span class="note">${rd}${m.you ? ' · deg' : ''}${m.login ? '' : ' · uten innlogging'}</span></span>
      ${canChange ? `<select class="bol2-role" data-brole="${cur.id}:${m.id}" aria-label="Tilgang for ${esc(m.name)}">${Object.entries(ROLE_TXT).map(([k, [n]]) => `<option value="${k}"${k === m.role ? ' selected' : ''}>${n}</option>`).join('')}</select>` : `<span class="bol2-role ro">${rn}</span>`}
      ${(cur.isOwner && !m.you) || (m.you && !(m.role === 'owner' && ownerCount < 2)) ? `<button class="bol2-rm" data-brm="${cur.id}:${m.id}"${m.you ? ' data-leave="1"' : ''} aria-label="${m.you ? 'Forlat boligen' : `Fjern ${esc(m.name)}`}" title="${m.you ? 'Forlat boligen' : 'Fjern'}">−</button>` : ''}</div>`;
  }).join('');
  const role = u.bolInvRole ?? 'editor';
  // Prompt 30: «Del boligen» – rutenett med brukerne i Homelab som ikke har tilgang (navn, farge, relasjon; aldri
  // brukernavn eller e-post). Velg flere, velg rolle, «Del med Ingrid og Pål». Uten valg: e-post til noen utenfor Homelab.
  const sh = shareState(cur), picked = sh.list.filter((x) => sh.sel.has(String(x.id)));
  const names = picked.map((x) => x.name), shareL = !names.length ? '' : names.length <= 2 ? `Del med ${names.join(' og ')}` : `Del med ${names.length} personer`;
  const grid = sh.loading ? '<div class="note">Henter brukere …</div>' : sh.list.length ? `<div class="bol2-ugrid" role="group" aria-label="Brukere i Homelab">${sh.list.map((x) => {
    const on = sh.sel.has(String(x.id));
    return `<button type="button" class="bol2-u${on ? ' on' : ''}" data-bol2-pick="${esc(String(x.id))}" aria-pressed="${on}"><span class="bol2-uav" style="background:${esc(x.color ?? avColor(x.name))}">${x.avatarUrl ? `<img src="${esc(x.avatarUrl)}" alt="">` : esc(x.initial ?? ini(x.name))}</span><b class="ell">${esc(x.name)}</b>${x.relation ? `<span class="note ell">${esc(x.relation)}</span>` : ''}${on ? '<i class="bol2-uck" aria-hidden="true">✓</i>' : ''}</button>`;
  }).join('')}</div>` : '<div class="note bol2-allin">Alle brukerne har allerede tilgang.</div>';
  const invite = cur.isOwner ? `<div class="card bol2-card"><h3 class="bol2-h">Del boligen</h3>
      <div class="bol2-lab2">BRUKERE I HOMELAB</div>${grid}
      <div class="bol2-lab2">ROLLE</div><div class="bol2-seg">${Object.entries(ROLE_TXT).map(([k, [n]]) => `<button type="button" class="${k === role ? 'on' : ''}" data-bol2-irole="${k}">${n}</button>`).join('')}</div>
      <div class="note" style="font-size:12.5px">${ROLE_TXT[role][1]}.</div>
      ${names.length ? `<button type="button" class="btn pri bol2-wide" data-bol2-act="share-users"${sh.busy ? ' disabled' : ''}>${sh.busy ? 'Deler …' : esc(shareL)}</button>`
        : `<form class="bol2-inv" data-mform="bol2-invite"><label class="bol2-f">Eller e-post til noen utenfor Homelab<input class="inp" name="who" type="email" placeholder="navn@eksempel.no" required autocomplete="off"></label><button class="btn pri bol2-wide">Send invitasjon</button></form>`}</div>` : '';
  const sw = (k, on, t, s) => `<label class="bol2-tog"><span><b>${t}</b><span class="note">${s}</span></span><input type="checkbox" data-bol2-meta="${k}"${on ? ' checked' : ''}${cur.isOwner ? '' : ' disabled'}><i></i></label>`;
  const about = `<div class="card bol2-card"><h3 class="bol2-h">Om boligen</h3>
    <label class="bol2-f">Navn<input class="inp" data-bol2-field="name" value="${esc(cur.name)}"${cur.isOwner ? '' : ' disabled'}></label>
    <label class="bol2-f">Adresse<input class="inp" data-bol2-field="address" value="${esc(cur.address ?? '')}"${cur.isOwner ? '' : ' disabled'}></label>
    <label class="bol2-f">Månedsbudsjett (kr)<input class="inp mono" data-bol2-field="budget" inputmode="numeric" value="${meta.budget ?? ''}" placeholder="Ikke satt"${cur.isOwner ? '' : ' disabled'}></label>
    <div class="bol2-f">Farge<div class="bol2-sw">${BOL_COLORS.map((c) => `<button type="button" style="background:${c}" class="${c === meta.color ? 'on' : ''}" data-bol2-color="${c}" aria-label="Farge ${c}"${cur.isOwner ? '' : ' disabled'}></button>`).join('')}</div></div>
    ${sw('autoCat', meta.autoCat, 'AI-kategorisering', 'Kvitteringer over 90 % sikkerhet godkjennes automatisk')}
    ${sw('notify', meta.notify, 'Varsle ved nye utgifter', 'Push når noen laster opp en kvittering')}
    ${cur.isOwner ? `<button class="btn bol2-del bol2-wide" data-bol2-act="del-home">${u.bolDelH === cur.id ? `Trykk igjen for å slette ${esc(cur.name)}` : `Slett ${esc(cur.name)}`}</button>` : ''}</div>`;
  return `<div class="bol2-cols"><div class="bol2-col"><div class="card bol2-card"><h3 class="bol2-h">Hvem har tilgang</h3>${rows}</div>${invite}</div><div class="bol2-col">${about}</div></div>`;
}

function dirPage() {
  const list = S.folders;
  if (!list) return skel(400);
  const cur = S.folder;
  const me = S.boot.me ?? {};
  const monthIdx = new Date().getMonth(), monName = MONTHS_LONG[monthIdx];
  const pills = list.map((f) => {
    const on = cur?.id === f.id, m = bolMeta(f);
    const v = on && cur.months?.length ? `${kr0(cur.months[cur.months.length - 1].total)} i ${monName.slice(0, 3)}` : `${kr0(f.yearTotal)} i år`;
    return `<button class="bol2-pill${on ? ' on' : ''}" data-mdir="${f.id}" data-bol2-hold="${f.isOwner || f.role === 'owner' ? f.id : ''}" role="tab" aria-selected="${on}" title="${f.isOwner || f.role === 'owner' ? 'Hold inne for å redigere' : ''}"><span class="bol2-ini" style="background:${m.color}">${esc(f.name.slice(0, 1).toUpperCase())}</span><span class="bol2-pill-t"><b>${esc(f.name)}</b><small>${v}</small></span></button>`;
  }).join('');
  const sumAll = `${list.length} bolig${list.length === 1 ? '' : 'er'} · ${kr0(list.reduce((a, f) => a + (f.yearTotal ?? 0), 0))} i år`;
  const top = `<div class="bol2-top"><div class="bol2-pills" role="tablist" aria-label="Boliger">${pills}<button class="bol2-pill add" data-bol2-act="new-home">+ Ny bolig</button></div><span class="note bol2-sum">${sumAll}</span></div>`;
  if (!cur) return `<div class="bol2">${top}${list.length ? '' : `<div class="card note" style="padding:18px;font-size:14px">Ingen boliger er delt med ${esc(me.name ?? 'deg')} ennå. Trykk «+ Ny bolig» for å lage den første.</div>`}${newHomeSheet()}</div>`;

  const meta = bolMeta(cur);
  const months = cur.months ?? [];
  const spent = months[months.length - 1]?.total ?? 0, prev = months[months.length - 2]?.total ?? 0;
  const dl = prev ? Math.round(((spent - prev) / prev) * 100) : null;
  const bud = +meta.budget || 0, pct = bud ? Math.min(100, (spent / bud) * 100) : 0;
  const rvN = cur.entries.filter(inReview).length;
  const tab = BOL_TABS2.some(([k]) => k === u.bolTab) ? u.bolTab : 'ov';
  const counts = { ut: cur.entries.length, pr: cur.projects.length, rg: (cur.upcoming ?? []).filter((x) => x.days <= 14).length || cur.bills.length, acc: cur.members.length };
  const tabs = `<nav class="bol2-tabs" role="tablist" aria-label="Boligmeny">${BOL_TABS2.map(([k, n]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-mbol-tab="${k}">${n}${counts[k] ? ` · ${counts[k]}` : ''}${k === 'ut' && rvN ? '<i class="bol2-dot"></i>' : ''}</button>`).join('')}</nav>`;

  // Prompt 24: bolig-kortet viser bakgrunnsbildet (Strømstad eller eget) med mørk gradient; ✎ åpner «Rediger bolig».
  const lf = list.find((f) => f.id === cur.id) ?? {}, hb = heroBg(bgUrlOf({ ...lf, ...cur, background: cur.background ?? lf.background, backgroundUrl: cur.backgroundUrl ?? lf.backgroundUrl }));
  const hero = `<div class="bol2-hero${hb ? ' img' : ''}" style="--hc:${meta.color}${hb ? `;background:${hb}` : ''}">
    <div class="bol2-hero-h"><span class="bol2-ini lg">${esc(cur.name.slice(0, 1).toUpperCase())}</span><div class="grow" style="min-width:0"><div class="bol2-hero-n">${esc(cur.name)}</div><div class="bol2-hero-a">${esc(cur.address || cur.type || 'Bolig')}</div></div><span class="bol2-hero-m">${monName[0].toUpperCase() + monName.slice(1)}</span>${cur.isOwner ? '<button class="bol2-edit" data-bol2-act="edit-home" aria-label="Rediger bolig" title="Rediger bolig">✎</button>' : ''}</div>
    <div class="bol2-hero-l">Brukt denne måneden</div>
    <div class="bol2-hero-v"><span>${kr0(spent)}</span>${dl !== null && prev ? `<span class="bol2-hero-d">${dl >= 0 ? '▲' : '▼'} ${Math.abs(dl)} % fra ${MONTHS_LONG[(monthIdx + 11) % 12]}</span>` : ''}</div>
    ${bud ? `<div class="bol2-bar"><i style="width:${pct}%"></i></div><div class="bol2-hero-f"><span>av ${kr0(bud)} i budsjett</span><b>${spent > bud ? `${kr0(spent - bud)} over` : `${kr0(bud - spent)} igjen`}</b></div>`
      : `<div class="bol2-hero-f"><span>${kr0(cur.kpi.yearTotal)} i år · snitt ${kr0(cur.kpi.perMonth)} per måned</span>${cur.isOwner ? '<button class="link-btn" data-mbol-tab="acc">Sett budsjett ›</button>' : ''}</div>`}</div>`;
  const acts = cur.canEdit ? `<div class="bol2-acts">
    <label class="bol2-act"><span class="bol2-act-ic red">${icon('scan', 18)}</span><b>Skann</b><input type="file" accept="image/*" capture="environment" data-mrc="folder" hidden></label>
    <label class="bol2-act"><span class="bol2-act-ic">↑</span><b>Last opp</b><input type="file" multiple accept="image/*,application/pdf" data-mrc="folder" hidden></label>
    <a class="bol2-act" href="#/inn" data-bol2-act="mail"><span class="bol2-act-ic">✉</span><b>Fra e-post</b></a>
    <button class="bol2-act" data-bol2-act="new-entry"><span class="bol2-act-ic">+</span><b>Ny utgift</b></button></div>` : '';
  // Kategorier denne måneden (ellers i år) som stablet stolpe og rader.
  const byCat = Object.entries(months[months.length - 1]?.byCat ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const useYear = !byCat.length;
  const catRows = useYear ? (cur.categories ?? []).map((c) => [c.name, c.sum]) : byCat;
  const catTot = catRows.reduce((a, [, v]) => a + v, 0) || 1;
  const colOf = (n) => (cur.categories ?? []).find((c) => c.name === n)?.color ?? '#8a8478';
  const cntOf = (n) => cur.entries.filter((e) => e.category === n && (useYear || (e.date ?? '').startsWith(months[months.length - 1]?.month ?? '#'))).length;
  const catsCard = catRows.length ? `<div class="card bol2-card"><div class="bol2-ch"><h3 class="bol2-h">Kategorier</h3><span class="note">${useYear ? 'I år' : monName[0].toUpperCase() + monName.slice(1)}</span></div>
    <div class="bol2-stack">${catRows.map(([n, v]) => `<i style="flex:${Math.max(1, Math.round(v))} 1 0;background:${colOf(n)}" title="${esc(n)}"></i>`).join('')}</div>
    ${catRows.map(([n, v]) => { const c = cntOf(n); return `<button class="bol2-crow" data-bol2-fcat="${esc(n)}"><span class="bol2-tile sm" style="background:${tint(colOf(n))};color:${colOf(n)}">${esc(glyph(n))}</span><span class="grow">${esc(n)} <span class="note">· ${c} utgift${c === 1 ? '' : 'er'}</span></span><span class="note">${Math.round((v / catTot) * 100)} %</span><b class="mono">${kr0(v)}</b></button>`; }).join('')}</div>` : '';
  const hist = months.slice(-6), hMax = Math.max(1, ...hist.map((m) => m.total)), avg = hist.length > 1 ? hist.slice(0, -1).reduce((a, m) => a + m.total, 0) / (hist.length - 1) : 0;
  const k = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(v)));
  const histCard = `<div class="card bol2-card"><div class="bol2-ch"><h3 class="bol2-h">Historikk</h3>${avg ? `<span class="note">Snitt ${kr0(avg)}</span>` : ''}</div><div class="bol2-hist">${hist.map((m, i) => { const last = i === hist.length - 1; return `<div class="bol2-hcol${last ? ' now' : ''}"><small class="mono">${k(m.total)}</small><span style="height:${Math.max(3, (m.total / hMax) * 100)}%"></span><b>${esc(m.label)}</b></div>`; }).join('') || '<div class="note">Ingen utgifter i år.</div>'}</div></div>`;
  const recent = cur.entries.filter((e) => !inReview(e)).slice(0, 5);
  const recentCard2 = `<div class="card bol2-card"><div class="bol2-ch"><h3 class="bol2-h">Siste utgifter</h3><button class="link-btn" data-mbol-tab="ut">Alle ›</button></div>${recent.map((e, i) => entryLine(cur, e, i)).join('') || '<div class="note" style="font-size:13.5px">Ingen utgifter ennå. Dra en kvittering inn på siden for å komme i gang.</div>'}</div>`;
  const others = cur.members.filter((m) => !m.you);
  const shareCard = `<button class="card bol2-card bol2-share" data-mbol-tab="acc"><span class="bol2-avs">${cur.members.slice(0, 4).map((m) => `<span class="bol2-av" style="background:${avColor(m.name)}">${ini2(m.name)}</span>`).join('')}</span><span class="grow"><b>${others.length ? `Delt med ${cur.members.length} personer` : 'Bare deg'}</b><span class="note">Hvem som kan se og laste opp</span></span><span class="note">›</span></button>`;

  let body;
  if (tab === 'ut') {
    const qv = (u.bolQ ?? '').trim().toLowerCase();
    const rows = cur.entries.filter((e) => (!u.dcat || e.category === u.dcat) && (!qv || [e.description, e.categoryLabel, e.category, e.project, e.paidBy, e.aiShort].some((x) => String(x ?? '').toLowerCase().includes(qv))));
    const chips = [['', 'Alle'], ...(cur.categories ?? []).map((c) => [c.name, c.name])].map(([v, n]) => `<button class="bol2-fchip${(u.dcat ?? '') === v ? ' on' : ''}" data-mbol-cat="${esc(v)}">${esc(n)}</button>`).join('');
    const view = u.bolView === 'rc' ? 'rc' : 'list';
    body = `<div class="bol2-search${u.bolQ ? ' has' : ''}" data-sf><span class="sf-ic">${icon('search', 16, 'var(--muted)')}</span>${clearBtn()}<input type="search" placeholder="Søk i utgifter og kvitteringer" value="${esc(u.bolQ ?? '')}" data-mbol-q aria-label="Søk i utgifter"></div>
      <div class="bol2-fchips">${chips}</div>
      <div class="bol2-meta"><span class="note">${rows.length} utgift${rows.length === 1 ? '' : 'er'}</span><span class="bol2-view"><button class="${view === 'list' ? 'on' : ''}" data-bol2-view="list">Liste</button><button class="${view === 'rc' ? 'on' : ''}" data-bol2-view="rc">Kvitteringer</button></span><b class="mono">${kr0(rows.reduce((a, e) => a + e.amount, 0))}</b></div>
      ${view === 'rc' ? receiptsCard(cur) : `<div class="card bol2-card">${rows.map((e, i) => entryLine(cur, e, i, true)).join('') || `<div class="note" style="padding:12px 0">${qv ? `Ingen treff på «${esc(u.bolQ)}».` : 'Ingen utgifter her ennå.'}</div>`}</div>`}`;
  } else if (tab === 'pr') {
    body = projectsTab(cur);
  } else if (tab === 'rg') {
    body = billsTab(cur);
  } else if (tab === 'acc') {
    body = accessTab(cur, meta);
  } else {
    body = `<div class="bol2-cols ov"><div class="bol2-col">${hero}${acts}${reviewCards(cur)}${catsCard}${(cur.upcoming ?? []).length ? upcomingCard(cur, 4, 'padding:20px;gap:6px') : ''}</div>
      <div class="bol2-col">${histCard}${recentCard2}${cur.projects.length ? projMini(cur).replace('flex:3 1 340px;', '') : ''}${shareCard}</div></div>`;
  }
  const addSheet = u.bolAdd ? `<div class="bol2-modal" data-bol2-back><div class="bol2-sheet" role="dialog" aria-modal="true" aria-label="Ny utgift"><div class="bol2-sheet-h"><div><div class="bol2-kick">${esc(cur.name.toUpperCase())}</div><h3>Ny utgift</h3></div>${sheetBtn('Lukk', 'data-bol2-act="close"', 'sec')}</div>${addBoxHtml(cur)}</div></div>` : '';
  return `<div class="bol2" data-bol-drop>${top}${tabs}${body}${detailSheet(cur)}${addSheet}${newHomeSheet()}${editHomeSheet()}
    ${cur.canEdit ? '<div class="bol-dropover" aria-hidden="true"><b>Slipp kvitteringene her</b><span>✦ AI leser butikk, dato og beløp, og velger kategori</span></div>' : ''}</div>`;
}
function addBoxHtml(cur) {
  const mode = u.dirMode ?? 'new', names = cur.members.map((m) => m.name);
  const tgt = target(), other = tgt !== cur.id;
  if (!editable().length) return '<div class="note">Du har lesetilgang. Be en eier om redigeringstilgang.</div>';
  return `${legg(cur)}${modes('dir', mode)}${other ? `<div class="note" style="font-size:12.5px">Havner i <b style="color:var(--acc-l)">${esc(targetName())}</b>.</div>` : ''}
    ${mode === 'new' ? `<form class="bol2-form" data-mform="entry"><input class="inp" name="description" placeholder="Beskrivelse, f.eks. Plantasjen" required><input class="inp" name="amount" placeholder="Beløp" inputmode="decimal" required>
      ${catSelect('categoryId', other ? S.bolCats?.options ?? cur.catTree : cur.catTree, '', 'Kategori: ✦ AI velger')}<select class="inp" name="projectId">${optList([['', 'Uten prosjekt'], ...(other ? [] : cur.projects.map((p) => [p.id, p.name]))], '')}</select>
      ${other ? '' : `<select class="inp" name="paidBy">${optList(names.map((n) => [n, 'Betalt av ' + n]), cur.members.find((m) => m.you)?.name)}</select>`}<button class="btn pri">Legg til</button></form>`
      : mode === 'rc' ? `<label class="mod-drop"><b>Last opp kvitteringer og regninger</b><span>Flere filer · AI leser butikk, dato og beløp, og velger kategori</span><input type="file" multiple accept="image/*,application/pdf" data-mrc="folder" hidden></label>`
      : txPick('folder')}`;
}
function projectsTab(cur) {
  const list = cur.projects.map((p) => {
    const over = p.remaining < 0;
    return `<div class="card bol2-card"><div class="bol2-ch"><div style="min-width:0"><h3 class="bol2-h">${esc(p.name)}</h3><div class="note">${esc(p.vendor || 'Uten håndverker')} · ${esc(p.category)}</div></div><div style="text-align:right"><b class="mono">${n0(p.spent)} / ${n0(p.budget)} kr</b><div class="note" style="color:${over ? 'var(--neg)' : ''}">${over ? `${n0(-p.remaining)} kr over budsjett` : `${n0(p.remaining)} kr igjen`}</div></div></div>
      <div class="bol2-bar thin"><i style="width:${Math.min(100, p.budget ? (p.spent / p.budget) * 100 : 0)}%;background:${over ? 'var(--neg)' : 'var(--acc)'}"></i></div>
      ${p.installments.map((x) => `<div class="inst"><span class="inst-mark${x.paid ? ' on' : ''}">${x.paid ? '✓' : ''}</span><span class="grow">${esc(x.label)} <span class="muted" style="font-size:12.5px">· ${esc(/^\d{4}-\d{2}-\d{2}$/.test(x.due ?? '') ? dd(x.due) : x.due ?? '–')}</span></span><span class="mono">${kr0(x.amount)}</span>${!x.paid && cur.canEdit ? `<button class="btn sm pay" data-mpay="${x.id}">Marker betalt</button>` : ''}</div>`).join('')}
      ${cur.canEdit ? `<form class="inst-add" data-mform="inst" data-pid="${p.id}"><input class="inp" name="label" placeholder="Nytt avdrag" required><input class="inp" name="due" placeholder="Forfall dd.mm"><input class="inp" name="amount" placeholder="kr" inputmode="decimal" required><button class="btn sm">+</button></form>` : ''}</div>`;
  }).join('');
  const add = cur.canEdit ? `<div class="card bol2-card"><h3 class="bol2-h">Nytt prosjekt</h3><form class="inst-add" data-mform="project"><input class="inp" name="name" placeholder="F.eks. Ny terrasse" required style="flex:2 1 160px"><input class="inp" name="vendor" placeholder="Håndverker"><input class="inp" name="budget" placeholder="Budsjett kr" inputmode="decimal" required><button class="btn pri sm">Legg til</button></form></div>` : '';
  return `<div class="bol2-grid">${list || '<div class="card note" style="padding:18px;font-size:13.5px">Ingen prosjekter ennå. Legg til et for å følge budsjett og avdrag til håndverkere.</div>'}${add}</div>`;
}
function billsTab(cur) {
  const names = cur.members.map((m) => m.name);
  const bills = cur.bills.map((b, i) => `<div class="bol2-row static${i ? '' : ' first'}"><span class="bol2-tile" style="width:40px;height:40px;background:${tint(b.color)};color:${b.color}">${esc(glyph(b.category))}</span><span class="grow ell-wrap"><b class="ell">${esc(b.category)}</b><span class="note ell">${esc(b.name)}${b.payer ? ' · ' + esc(b.payer) : ''} · ${esc(b.freq)}</span></span>
    <span class="bol2-row-r"><b class="mono">${b.last ? kr0(b.last.amount) : '–'}</b><small>neste ${b.nextDue ? (/^\d{4}-\d{2}-\d{2}$/.test(b.nextDue) ? dd(b.nextDue) : esc(b.nextDue)) : '–'}</small></span>${cur.canEdit ? `<button class="x-btn sm" data-mbill-del="${b.id}" aria-label="Fjern regning">×</button>` : ''}</div>`).join('');
  const add = cur.canEdit ? `<form class="inst-add" data-mform="bill"><input class="inp" name="name" placeholder="Fra, f.eks. Fjordkraft" required><select class="inp" name="category">${optList(cur.catOptions.map((c) => [c, c]), 'Strøm')}</select><select class="inp" name="freq">${optList(cur.freqs.map((c) => [c, c]), 'Månedlig')}</select><select class="inp" name="payer">${optList([['', 'Hvem betaler'], ...names.map((n) => [n, n])], '')}</select><input class="inp" name="nextDue" placeholder="Neste dd.mm"><button class="btn sm">+</button></form>` : '';
  const split = `<div class="bol2-ch" style="margin-top:6px"><span class="note">Fordeling · ${cur.split === 'equal' ? 'likt delt' : 'egen nøkkel'}${cur.isOwner ? ` · <button class="link-btn" data-mact="split-edit">${u.splitEdit ? 'Lukk' : 'Endre'}</button>` : ''}</span></div>
    <div class="dir-bal">${cur.balances.map((b) => `<span>${esc(b.name)} <b class="mono" style="color:${b.balance >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${b.balance >= 0 ? '+' : '−'}${n0(Math.abs(b.balance))} kr</b></span>`).join('')}</div>
    ${u.splitEdit ? `<form class="inst-add" data-mform="split">${cur.members.map((m) => `<label class="note" style="font-size:12px;display:flex;flex-direction:column;gap:4px">${esc(m.name)}<input class="inp" name="w:${esc(m.name)}" value="${cur.weights[m.name] ?? 1}" inputmode="decimal" style="width:80px"></label>`).join('')}<button class="btn sm" name="equal" value="1">Likt</button><button class="btn sm pri">Lagre nøkkel</button></form>` : ''}`;
  return `<div class="bol2-cols"><div class="bol2-col">${upcomingCard(cur, 40, 'padding:20px;gap:6px')}</div><div class="bol2-col"><div class="card bol2-card"><h3 class="bol2-h">Faste regninger</h3>${bills || '<div class="note" style="font-size:13.5px">Ingen faste regninger.</div>'}${add}${split}</div></div></div>`;
}

/* ===================== Innstillinger → Boliger ===================== */

export async function loadBolSettings() {
  const [folders, users, cats, layout] = await Promise.all([api('/folders'), api('/users').catch(() => []), api('/boliger/categories'), api('/boliger/layout')]);
  S.folders = folders; S.users = users; S.bolCats = cats; S.bolLayout = layout;
}
const reloadBol = async () => { if (u.page === 'dir') { await loadFolders(); return render(); } await loadBolSettings(); render(); };

export function bolSettings() {
  const list = S.folders, cats = S.bolCats, lay = S.bolLayout;
  if (!list || !cats || !lay) return skel(360);
  const me = S.boot.me ?? {};
  const users = (S.users ?? []).filter((x) => x.id !== me.id);
  const pick = u.newPick ?? [];
  // Boligene: deling og sletting (bare eiere, to trykk).
  const homes = list.map((f) => {
    const owner = f.role === 'owner', open = u.bolShare === f.id, del = u.bolDel === f.id;
    const sub = [f.address, `Du: ${(f.myRole ?? '').toLowerCase()}`, `${f.count} ${f.count === 1 ? 'post' : 'poster'}`].filter(Boolean).join(' · ');
    return `<div class="bol-home${open ? ' open' : ''}"><span class="grow" style="min-width:0"><span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-weight:600">${esc(f.name)}</b><span class="mtag">${esc(f.type)}</span></span><span class="note" style="display:block;font-size:12.5px;margin-top:3px">${esc(sub)}</span></span>
      <button class="btn sm${open ? ' on' : ''}" data-bshare="${f.id}" aria-expanded="${open}">Deling · ${f.members.length}</button>${owner ? `<button class="btn sm${del ? ' danger' : ' ghost'}" data-bdel="${f.id}">${del ? 'Bekreft sletting' : 'Slett'}</button>` : ''}</div>
      ${open ? shareBox(f) : ''}`;
  }).join('') || '<div class="bol-home note">Ingen boliger ennå.</div>';
  const create = `<form class="dir-new" data-mform="folder" style="border-style:solid"><b>Ny bolig</b><input class="inp" name="name" placeholder="Navn, f.eks. Hytta Geilo" required>
    <input class="inp" name="address" placeholder="Adresse (valgfritt)"><select class="inp" name="type">${optList(TYPES.map((t) => [t, t]), 'Enebolig')}</select>
    ${users.length ? `<span class="note" style="font-size:12px">Del med</span><div class="pick">${users.map((x) => `<button type="button" class="pick-u${pick.includes(x.id) ? ' on' : ''}" data-mpick="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : '<span class="note" style="font-size:12px">Nye brukere legges til av admin under Innstillinger → Innlogging i Homelab.</span>'}
    <div><button class="btn pri">Opprett</button></div></form>`;
  // Oppsett av boligsiden.
  const names = Object.fromEntries(lay.cards.map((c) => [c.id, c.name]));
  const layRows = lay.order.map((id, i) => {
    const hid = lay.hid.includes(id);
    return `<div class="navcfg${hid ? ' off' : ''}" style="cursor:default"><span class="no mono">${String(i + 1).padStart(2, '0')}</span><span class="lbl">${esc(names[id] ?? id)}</span>
      <button type="button" class="mv" data-blay-move="${id}:-1" aria-label="Flytt ${esc(names[id])} opp" ${i ? '' : 'disabled'}>↑</button><button type="button" class="mv" data-blay-move="${id}:1" aria-label="Flytt ${esc(names[id])} ned" ${i < lay.order.length - 1 ? '' : 'disabled'}>↓</button>
      <button type="button" class="toggle" role="switch" aria-checked="${!hid}" data-blay-tog="${id}" aria-label="Vis ${esc(names[id])}"></button></div>`;
  }).join('');
  // Kategorier for boliger.
  const man = cats.canManage;
  const catRows = cats.categories.map((c) => `<div class="bcat"><div class="bcat-h"><i style="background:${c.color}"></i><b>${esc(c.name)}</b>${c.ai ? '<span class="bcat-ai">✦ AI</span>' : ''}<span class="grow"></span><span class="note mono" style="font-size:12px">${c.count || ''}</span>${man ? `<button class="x-btn sm" data-bcat-del="${c.id}" aria-label="Fjern kategorien ${esc(c.name)}">×</button>` : ''}</div>
    <div class="bcat-subs">${c.children.map((x) => `<span class="bsub">${x.ai ? '✦ ' : ''}${esc(x.name)}${man ? `<button data-bcat-del="${x.id}" aria-label="Fjern ${esc(x.name)}">×</button>` : ''}</span>`).join('')}${man ? `<input class="bsub-in" data-bcat-sub="${c.id}" placeholder="+ Underkategori" maxlength="40" aria-label="Ny underkategori under ${esc(c.name)}">` : ''}</div></div>`).join('');
  return `<div class="bol-set">
    <div class="bol-sec"><div class="set-label">Boligene</div>${homes}</div>
    ${create}
    <div class="bol-sec"><div class="card-h" style="align-items:center"><b style="font-size:14px">Oppsett av boligsiden</b><button class="btn sm ghost" data-mact="blay-reset">Nullstill</button></div>
      <span class="note" style="font-size:12.5px">Velg hvilke kort som vises på hver bolig, og i hvilken rekkefølge. Gjelder alle boligene, bare for deg.</span><div class="navcfg-list">${layRows}</div></div>
    <div class="bol-sec"><div class="card-h" style="align-items:center"><b style="font-size:14px">Kategorier for boliger</b>${man ? '<button class="btn sm ghost" data-mact="bcat-reset">Nullstill</button>' : ''}</div>
      <button class="tog-row" data-mact="bcat-ai" ${man ? '' : 'disabled'}><span class="grow"><b style="font-weight:500">✦ La AI lage nye kategorier</b><br><span class="note" style="font-size:12.5px">Når en kvittering, transaksjon eller opplastning ikke passer i noen kategori, lager AI en ny kategori eller underkategori. Av: AI velger bare blant de som finnes.</span></span><span class="toggle" role="switch" aria-checked="${!!cats.aiNew}"></span></button>
      ${catRows}
      ${man ? '<form class="bcat-new" data-mform="bcat"><input class="inp" name="name" placeholder="Ny kategori, f.eks. Garasje" maxlength="40" required><button class="btn">Legg til</button></form>' : '<div class="note" style="font-size:12.5px">Bare administratorer og eiere av en bolig kan endre kategoriene.</div>'}
      <span class="note" style="font-size:12px">✦ viser kategorier og underkategorier som AI har laget. Underkategori legges til med Enter.</span></div>
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
    <form class="mod-box" data-mform="finn"><b>Legg til fra e-post</b><span class="note" style="font-size:13px">Lim inn en e-post fra Finn (Trygg betaling, Fiks ferdig eller Tillit). AI trekker ut gjenstand, motpart, beløp og status, og matcher mot bankposten.</span>
      <textarea class="inp mod-ta" name="email" rows="5" placeholder="Lim inn e-posten her …" required></textarea><div><button class="btn pri">Les e-posten</button></div></form>
    <div class="note" style="font-size:13px">Kilde: e-postkvitteringer fra Finn (Trygg betaling, Fiks ferdig-frakt, Tillit forsikring) leses av AI og matches mot bankposter. ${d.imap.configured ? 'IMAP er konfigurert; automatisk henting kommer i en senere versjon.' : 'Automatisk henting via IMAP settes opp i Innstillinger → Import.'}</div>
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
      <span class="note" style="font-size:13px">${r.duplicate ? 'Finnes fra før' : esc(r.category ?? 'AI kategoriserer')}</span><b class="mono" style="text-align:right;color:${r.amount > 0 ? 'var(--pos)' : 'var(--text)'}">${sgn(r.amount)}</b></div>`).join(''), 'padding:0;gap:0;overflow:hidden') : ''}
    <div style="display:flex;justify-content:flex-end"><button class="btn" style="background:var(--text);color:var(--bg)" data-mact="imp-commit" ${n ? '' : 'disabled'}>Importer ${n} poster</button></div>
    ${tplList()}
  </div>`;
}

// Hvilket format filen ble lest med, og hvilke kolonner som er koblet til hvilke felt.
const SRC_TXT = { builtin: ['Innebygd mal', 'var(--text2)'], saved: ['Lagret mal', 'var(--pos)'], head: ['Kolonnenavn', 'var(--text2)'], ai: ['✦ AI leste de første radene og lagret malen', 'var(--acc-l)'], guess: ['Gjettet ut fra verdiene (AI svarte ikke) og lagret som mal', 'var(--acc-l)'] };
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
    <span class="note" style="font-size:12.5px;line-height:1.45">Når et format er ukjent, leser AI de første radene, finner dato, beskrivelse og beløp, og lagrer det som en mal. Neste fil med samme kolonner bruker malen direkte.</span></div>`;
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
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select class="sel" data-mfinn-role aria-label="Type handel"><option value="bought"${fi.role === 'bought' ? ' selected' : ''}>Kjøpt</option><option value="sold"${fi.role === 'sold' ? ' selected' : ''}>Solgt</option></select><button class="btn pri" data-mact="finn-imp-links" ${j?.running || !codes.length ? 'disabled' : ''}>✦ Hent annonser (${codes.length})</button><span class="note" style="font-size:12.5px">AI henter tittel, pris, beskrivelse og bilder og lagrer dem i handelen</span></div></div>
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
  const posRows = pos.map((p, i) => { const col = PCOL[i % PCOL.length]; return `<div class="aks-row"><span class="aks-pos"><span class="aks-tk" style="background:${col}22;color:${col}">${esc(p.symbol.slice(0, 5))}</span><span class="ell-wrap"><b class="ell" style="display:block;font-weight:500">${esc(p.name)}</b><span class="note" style="font-size:12px">${esc(p.ticker)}</span></span></span>
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

export const MODULE_FN = { aks: aksPage, sub: subPage, dir: dirPage, finn: finnDesk, imp: impPage };

/* ===================== Lasting ===================== */

const loadRecentOut = async () => { S.recentOut = (await api('/transactions?type=ut&limit=40')).items; };
async function loadFolders() {
  S.folders = await api('/folders');
  const id = u.dir && S.folders.some((f) => f.id === u.dir) ? u.dir : S.folders[0]?.id;
  u.dir = id;
  S.folder = id ? await api(`/folders/${id}`) : null;
  // Kategorier AI har laget siden sist: vis en melding én gang.
  u.seenNotice ??= new Set();
  for (const n of S.folder?.notices ?? []) { const key = `${n.entryId}:${n.at}`; if (!u.seenNotice.has(key)) { u.seenNotice.add(key); toast(n.text); } }
}
const loadBolCats = async () => { S.bolCats = await api('/boliger/categories').catch(() => S.bolCats ?? null); };
const loadUsers = async () => { S.users = await api('/users').catch(() => []); };
const loadFinn = async () => { S.finn = await api('/finn'); };
const loadStocks = async (force) => { S.stocks = await api(`/stocks${force === true ? '?force=1' : ''}`); };
export async function loadBackup() { S.backup = await api('/backup'); }
export const MODULE_LOADERS = { aks: [loadStocks], sub: [loadSubs], dir: [loadFolders, loadUsers, loadRecentOut, loadBolCats], finn: [loadFinnDesk], imp: [loadImpTpl] };

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
    if (r.formats?.some((f) => f.template?.source === 'ai' || f.template?.source === 'guess')) { await loadImpTpl(); if (!commit) toast('✦ AI fant formatet og lagret det som mal'); }
    const files = impFiles.length ? `${impFiles.length} fil${impFiles.length === 1 ? '' : 'er'} · ` : '';
    im.status = commit ? `${r.imported} poster importert · ${r.duplicates} duplikater hoppet over · AI kategoriserer og beskriver i bakgrunnen`
      : `${files}${r.rows.length} rader lest${r.skipped ? ` · ${r.skipped} rader hoppet over` : ''}${r.errors?.length ? ' · ' + r.errors.join('; ') : ''}`;
    if (commit) { toast(`${r.imported} poster importert`); impFiles = []; im.text = ''; im.rows = []; await loadBoot(); }
  } catch (e) { im.status = e.message; im.rows = []; im.formats = []; }
  render();
}

async function uploadTo(kind, files) {
  const fd = new FormData();
  for (const f of files) fd.append('file', f);
  // Boliger: kvitteringene havner i boligen valgt under «Legg i bolig».
  const path = kind === 'sub' ? '/subscriptions/receipts' : `/folders/${target()}/receipts`;
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

let holdFired = false;
export function bindModules(el) {
  bindFinn(el);
  bindSubs(el);
  const wrap = (fn) => async (e) => { try { await fn(e); } catch (err) { toast(err.message); } };
  el.addEventListener('click', wrap(async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    // Klikket etter «hold inne» på en bolig skal ikke også bytte bolig.
    if (holdFired) { holdFired = false; if (d('[data-mdir]') || !d('.bol2-modal')) return; }
    // Boliger (nytt design): ark, godkjenning, kategorivalg og Tilgang.
    if ((x = d('[data-bol2-back]')) && t === x) { u.bolSel = null; u.bolAdd = false; u.bolNew = false; u.bolDelE = null; u.bolEd = null; return render(); }
    if ((x = d('[data-bol2-open]'))) { u.bolSel = +x.dataset.bol2Open; u.bolDelE = null; return render(); }
    if ((x = d('[data-bol2-cat]'))) { const [eid, cid] = x.dataset.bol2Cat.split(':').map(Number); S.folder = await api(`/folders/${u.dir}/entries/${eid}`, { method: 'PATCH', json: { categoryId: cid } }); return render(); }
    if ((x = d('[data-bol2-ok]'))) { const eid = +x.dataset.bol2Ok; S.folder = await api(`/folders/${u.dir}/entries/${eid}`, { method: 'PATCH', json: { status: 'ok' } }); if (u.bolSel === eid) u.bolSel = null; toast(`Lagret i ${S.folder.name}`); return render(); }
    if ((x = d('[data-bol2-del]'))) { const eid = +x.dataset.bol2Del; if (u.bolDelE !== eid) { u.bolDelE = eid; return render(); } S.folder = await api(`/folders/${u.dir}/entries/${eid}`, { method: 'DELETE' }); u.bolSel = null; u.bolDelE = null; toast('Utgiften er slettet'); return reload(); }
    if ((x = d('[data-bol2-irole]'))) { u.bolInvRole = x.dataset.bol2Irole; return render(); }
    if ((x = d('[data-bol2-pick]'))) { const id = x.dataset.bol2Pick; if (SH.sel.has(id)) SH.sel.delete(id); else SH.sel.add(id); return render(); }
    if ((x = d('[data-bol2-edc]')) && u.bolEd) { u.bolEd.color = x.dataset.bol2Edc; return render(); }
    if ((x = d('[data-bol2-edbg]')) && u.bolEd) { u.bolEd.bg = x.dataset.bol2Edbg; if (!u.bolEd.bg.startsWith('upload:')) u.bolEd.preview = null; return render(); }
    if ((x = d('[data-bol2-color]'))) { await setBolMeta(S.folder, { color: x.dataset.bol2Color }); return render(); }
    if ((x = d('[data-bol2-view]'))) { u.bolView = x.dataset.bol2View; return render(); }
    if ((x = d('[data-bol2-fcat]'))) { u.bolTab = 'ut'; u.dcat = x.dataset.bol2Fcat; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if ((x = d('[data-bol2-act]'))) {
      const a = x.dataset.bol2Act;
      if (a === 'close') { u.bolSel = null; u.bolAdd = false; u.bolNew = false; u.bolDelE = null; u.bolEd = null; return render(); }
      if (a === 'share-users') return shareUsers();
      if (a === 'edit-home') return openEdit(S.folder.id);
      if (a === 'ed-save') {
        const E = u.bolEd; if (!E || E.busy) return;
        const patch = { name: E.name.trim() || undefined, address: E.address.trim(), budget: E.budget === '' ? null : +String(E.budget).replace(/\D/g, '') || null, color: E.color, background: E.bg };
        E.busy = true; render();
        try {
          await setBolMeta({ id: E.id, isOwner: true }, patch);
          const all = metaAll(); if (all[E.id]) { all[E.id].background = E.bg; try { localStorage.setItem(META_KEY, JSON.stringify(all)); } catch { /* privat modus */ } }
        } finally { E.busy = false; }
        u.bolEd = null; toast(`Lagret ${patch.name ?? 'bolig'}`); return reload();
      }
      if (a === 'ed-del') {
        const E = u.bolEd; if (!E || (S.folders ?? []).length <= 1) return;
        if (!u.bolEdDel) { u.bolEdDel = true; return render(); }
        await api(`/folders/${E.id}`, { method: 'DELETE' }); u.bolEd = null; u.bolEdDel = false; if (u.dir === E.id) u.dir = null; u.bolTab = 'ov';
        toast(`${E.name} er slettet. Transaksjonene i regnskapet beholdes.`); return reload();
      }
      if (a === 'new-home') { u.bolNew = true; render(); el.querySelector('[data-mform=folder] input')?.focus(); return; }
      if (a === 'new-entry') { u.bolAdd = true; u.dirMode = 'new'; render(); el.querySelector('.bol2-sheet [data-mform=entry] input')?.focus(); return; }
      if (a === 'mail') { e.preventDefault(); u.setTab = 'imp'; location.hash = '#/inn'; return; }
      if (a === 'ok-all') { for (const en of S.folder.entries.filter((y) => !y.pending && (y.status === 'review' || y.review))) S.folder = await api(`/folders/${u.dir}/entries/${en.id}`, { method: 'PATCH', json: { status: 'ok' } }); toast('Alle er godkjent'); return render(); }
      if (a === 'del-home') { const f = S.folder; if (u.bolDelH !== f.id) { u.bolDelH = f.id; return render(); } await api(`/folders/${f.id}`, { method: 'DELETE' }); u.bolDelH = null; u.dir = null; u.bolTab = 'ov'; toast(`${f.name} er slettet. Transaksjonene i regnskapet beholdes.`); return reload(); }
    }
    // Boliger: meny, kategorifilter i tidslinjen.
    if ((x = d('[data-mbol-tab]'))) { u.bolTab = x.dataset.mbolTab; if (x.dataset.mbolAdd) u.dirMode = 'new'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); if (x.dataset.mbolAdd) el.querySelector('[data-mform=entry] input')?.focus(); return; }
    if ((x = d('[data-mbol-cat]'))) { u.dcat = x.dataset.mbolCat || null; return render(); }
    if ((x = d('[data-mmode]'))) { const [k, m] = x.dataset.mmode.split(':'); u[k === 'sub' ? 'subMode' : 'dirMode'] = m; return render(); }
    if ((x = d('[data-mtx]'))) {
      const [k, id] = x.dataset.mtx.split(':');
      if (k === 'sub') { const s = await api('/subscriptions', { method: 'POST', json: { fromTx: +id } }); toast(`${s.name} lagt til som abonnement`); }
      else { const r = await api(`/folders/${target()}/entries`, { method: 'POST', json: { txId: +id } }); toast(`Flyttet til ${r.name} · ✦ AI velger kategori`); }
      return reload();
    }
    if ((x = d('[data-msub-tog]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.msubTog); await api(`/subscriptions/${s.id}`, { method: 'PATCH', json: { active: !s.active } }); return reload(); }
    if ((x = d('[data-msub-low]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.msubLow); await api(`/subscriptions/${s.id}`, { method: 'PATCH', json: { lowUse: !s.lowUse } }); return reload(); }
    if ((x = d('[data-msub-del]'))) { if (!confirm('Slette abonnementet?')) return; await api(`/subscriptions/${x.dataset.msubDel}`, { method: 'DELETE' }); return reload(); }
    if ((x = d('[data-mdir]'))) { u.dir = +x.dataset.mdir; u.dcat = null; u.bolQ = ''; u.bolTarget = null; S.folder = await api(`/folders/${u.dir}`); return render(); }
    // Innstillinger → Boliger.
    if ((x = d('[data-bshare]'))) { const id = +x.dataset.bshare; u.bolShare = u.bolShare === id ? null : id; u.bolDel = null; return render(); }
    if ((x = d('[data-bdel]'))) {
      const id = +x.dataset.bdel, f = S.folders.find((y) => y.id === id);
      if (u.bolDel !== id) { u.bolDel = id; return render(); }
      await api(`/folders/${id}`, { method: 'DELETE' }); u.bolDel = null; if (u.dir === id) u.dir = null; toast(`${f?.name ?? 'Boligen'} er slettet. Transaksjonene i regnskapet beholdes.`); return reloadBol();
    }
    if ((x = d('[data-brm]'))) {
      const [fid, mid] = x.dataset.brm.split(':').map(Number), f = S.folders.find((y) => y.id === fid), m = f?.members.find((y) => y.id === mid), leave = !!x.dataset.leave;
      if (!confirm(leave ? `Forlate «${f.name}»? Du mister tilgangen til boligen.` : `Fjerne ${m?.name} fra «${f.name}»?`)) return;
      await api(`/folders/${fid}/members/${mid}`, { method: 'DELETE' });
      if (leave) { u.bolShare = null; if (u.dir === fid) u.dir = null; }
      toast(leave ? `Du har forlatt ${f.name}` : `${m?.name} har ikke lenger tilgang`); return reloadBol();
    }
    if ((x = d('[data-blay-move]'))) {
      const [id, dir] = x.dataset.blayMove.split(':'), o = [...S.bolLayout.order], i = o.indexOf(id), j = i + +dir;
      if (j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]];
      S.bolLayout = await api('/boliger/layout', { method: 'PUT', json: { order: o, hid: S.bolLayout.hid } }); return render();
    }
    if ((x = d('[data-blay-tog]'))) {
      const id = x.dataset.blayTog, h = S.bolLayout.hid;
      S.bolLayout = await api('/boliger/layout', { method: 'PUT', json: { order: S.bolLayout.order, hid: h.includes(id) ? h.filter((y) => y !== id) : [...h, id] } }); return render();
    }
    if ((x = d('[data-bcat-del]'))) {
      const id = +x.dataset.bcatDel, all = S.bolCats.categories.flatMap((c) => [c, ...c.children]), c = all.find((y) => y.id === id);
      const n = c?.count ? ` ${c.count} ${c.count === 1 ? 'post flyttes' : 'poster flyttes'} til ${c.parentId ? 'hovedkategorien' : '«Annet»'}.` : '';
      if (!confirm(`Fjerne «${c?.name}»?${n}`)) return;
      S.bolCats = await api(`/boliger/categories/${id}`, { method: 'DELETE' }); return render();
    }
    if ((x = d('[data-mtpl-del]'))) { if (!confirm('Slette malen? Neste fil med samme kolonner tolkes på nytt.')) return; await api(`/import/templates/${x.dataset.mtplDel}`, { method: 'DELETE' }); await loadImpTpl(); toast('Malen er slettet'); return render(); }
    if ((x = d('[data-mentry-del]'))) { if (!confirm('Fjerne posten fra boligen?')) return; S.folder = await api(`/folders/${u.dir}/entries/${x.dataset.mentryDel}`, { method: 'DELETE' }); return reload(); }
    if ((x = d('[data-mpick]'))) { const id = x.dataset.mpick, p = u.newPick ?? []; u.newPick = p.includes(id) ? p.filter((y) => y !== id) : [...p, id]; return render(); }
    if ((x = d('[data-mdcat]'))) { u.dcat = u.dcat === x.dataset.mdcat ? null : x.dataset.mdcat; return render(); }
    if ((x = d('[data-mpay]'))) { S.folder = await api(`/folders/${u.dir}/installments/${x.dataset.mpay}/pay`, { method: 'POST' }); toast('Registrert som betalt'); return reload(); }
    if ((x = d('[data-mbill-del]'))) { S.folder = await api(`/folders/${u.dir}/bills/${x.dataset.mbillDel}`, { method: 'DELETE' }); return render(); }
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
      case 'blay-reset': S.bolLayout = await api('/boliger/layout', { method: 'PUT', json: { reset: true } }); toast('Boligsiden viser alle kortene i standard rekkefølge'); return render();
      case 'bcat-reset': if (!confirm('Sette tilbake standardkategoriene? Egne og AI-lagde kategorier uten utgifter fjernes. Kategorier som er i bruk beholdes.')) return; S.bolCats = await api('/boliger/categories/reset', { method: 'POST' }); toast('Standardkategoriene er satt tilbake'); return render();
      case 'bcat-ai': S.bolCats = await api('/boliger/settings', { method: 'PUT', json: { aiNew: !S.bolCats.aiNew } }); return render();
      case 'dcat-clear': u.dcat = null; return render();
      case 'split-edit': u.splitEdit = !u.splitEdit; return render();
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
    if (t.matches('[data-brole]')) { const [fid, mid] = t.dataset.brole.split(':'); await api(`/folders/${fid}/members/${mid}`, { method: 'PATCH', json: { role: t.value } }); toast('Tilgangen er endret'); return reloadBol(); }
    if (t.matches('[data-bol2-paid]')) { S.folder = await api(`/folders/${u.dir}/entries/${t.dataset.bol2Paid}`, { method: 'PATCH', json: { paidBy: t.value } }); return render(); }
    if (t.matches('[data-bol2-meta]')) { await setBolMeta(S.folder, { [t.dataset.bol2Meta]: t.checked }); return render(); }
    if (t.matches('[data-bol2-field]')) {
      const k = t.dataset.bol2Field, v = t.value.trim();
      if (k === 'budget') { await setBolMeta(S.folder, { budget: v ? parseAmount(v) : null }); return render(); }
      if (k === 'name' && !v) return render();
      S.folder = await api(`/folders/${u.dir}`, { method: 'PATCH', json: { [k]: v } }); await loadFolders(); toast('Lagret'); return render();
    }
    if (t.matches('[data-mbol-target]')) { u.bolTarget = +t.value; return render(); }
    if (t.matches('[data-mentry-cat]')) { S.folder = await api(`/folders/${u.dir}/entries/${t.dataset.mentryCat}`, { method: 'PATCH', json: { categoryId: +t.value } }); return render(); }
    if (t.matches('[data-mbk-file]')) {
      const f = t.files[0]; t.value = '';
      if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      const ph = el.querySelector('[data-mbk-phrase]')?.value; if (ph) fd.append('phrase', ph);
      toast('Leser backupen …');
      S.stage = await api('/backup/stage', { method: 'POST', body: fd }); return render();
    }
  }));
  // Escape lukker arkene i Boliger.
  if (!bindModules.esc) { bindModules.esc = true; document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (u.bolSel || u.bolAdd || u.bolNew || u.bolEd)) { u.bolSel = null; u.bolAdd = false; u.bolNew = false; u.bolEd = null; render(); } }); }
  // Prompt 30: rediger utgift i detaljarket (butikk, beløp, dato). Lagres fortløpende (400 ms) uten å tegne arket på nytt,
  // så markøren beholdes. PATCH /folders/:id/entries/:eid {merchant, description, amount, date}; serveren logger «endret av».
  const eeT = {};
  const eeSave = async (eid, k, raw) => {
    const out = el.querySelector('[data-bol2-esave]');
    let json;
    if (k === 'amount') { const v = parseAmount(raw); if (!Number.isFinite(v) || v < 0) { if (out) out.textContent = 'Skriv et gyldig beløp'; return; } json = { amount: Math.abs(v) }; }
    else if (k === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return; json = { date: raw }; }
    else { const v = String(raw).trim(); if (!v) { if (out) out.textContent = 'Beskrivelsen kan ikke være tom'; return; } json = { merchant: v, description: v }; }
    if (out) out.textContent = 'Lagrer …';
    try { S.folder = await api(`/folders/${u.dir}/entries/${eid}`, { method: 'PATCH', json }); if (out) out.textContent = 'Lagret ✓'; if (!u.bolSel) render(); }
    catch (err) { if (out) out.textContent = err.message; }
  };
  el.addEventListener('input', (e) => {
    const k = e.target.dataset?.bol2Ee;
    if (!k || !u.bolSel) return;
    const eid = u.bolSel, v = e.target.value;
    clearTimeout(eeT[k]); eeT[k] = setTimeout(() => eeSave(eid, k, v), 400);
  });
  el.addEventListener('keydown', (e) => {
    if (e.target.dataset?.bol2Ee && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.bol2-rev-h[role=button]')) { e.preventDefault(); e.target.click(); }
  });
  // Prompt 24: «Rediger bolig»: felt oppdateres uten å tegne arket på nytt (markøren beholdes), bilde lastes opp og skaleres.
  el.addEventListener('input', (e) => {
    const k = e.target.dataset?.bol2Ed;
    if (!k || !u.bolEd) return;
    u.bolEd[k] = k === 'budget' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value;
    if (k === 'name') { const pv = el.querySelector('[data-bol2-edprev]'); if (pv) pv.textContent = e.target.value || 'Bolig'; }
    if (k === 'color') render();
  });
  el.addEventListener('change', wrap(async (e) => {
    const inp = e.target.closest?.('[data-bol2-edup]');
    if (!inp || !u.bolEd) return;
    const file = inp.files?.[0]; inp.value = '';
    if (!file) return;
    const E = u.bolEd, blob = await scaleBg(file);
    E.preview = URL.createObjectURL(blob); E.busy = true; render();
    try {
      const fd = new FormData(); fd.append('file', blob, 'bg.jpg');
      const r = await api(`/folders/${E.id}/bg`, { method: 'PUT', body: fd });
      E.bg = r?.background || 'upload:' + (r?.id ?? Date.now());
      const f = (S.folders ?? []).find((y) => y.id === E.id); if (f) { f.background = E.bg; f.backgroundUrl = r?.backgroundUrl ?? null; }
      toast('Bildet er lastet opp');
    } catch (er) { E.preview = null; toast(er.status === 404 ? 'Serveren støtter ikke egne bilder ennå' : er.message); }
    finally { E.busy = false; render(); }
  }));
  // Hold inne 0,5 s på en bolig (eller høyreklikk) for å redigere den. Avbrytes hvis pekeren flyttes mer enn 10 px.
  let holdT = null, holdXY = null;
  const holdEnd = () => { clearTimeout(holdT); holdT = null; };
  el.addEventListener('pointerdown', (e) => {
    const p = e.target.closest?.('[data-bol2-hold]');
    holdFired = false;
    if (!p || !p.dataset.bol2Hold || e.button > 0) return;
    holdXY = [e.clientX, e.clientY]; holdEnd();
    holdT = setTimeout(() => { holdT = null; holdFired = true; openEdit(+p.dataset.bol2Hold); }, 500);
  });
  el.addEventListener('pointermove', (e) => { if (holdT && holdXY && Math.hypot(e.clientX - holdXY[0], e.clientY - holdXY[1]) > 10) holdEnd(); });
  el.addEventListener('pointerup', holdEnd); el.addEventListener('pointercancel', holdEnd);
  el.addEventListener('contextmenu', (e) => { const p = e.target.closest?.('[data-bol2-hold]'); if (!p || !p.dataset.bol2Hold) return; e.preventDefault(); holdEnd(); openEdit(+p.dataset.bol2Hold); });
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
  // Søk i boligens utgifter: tegn på nytt og behold markøren i feltet.
  let bolQT = null;
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-mbol-q]')) return;
    const v = e.target.value; clearTimeout(bolQT);
    bolQT = setTimeout(() => { u.bolQ = v; render(); const i = el.querySelector('[data-mbol-q]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 160);
  });
  // Dra og slipp kvitteringer rett inn i boligen.
  let dragN = 0;
  const dropZone = (e) => e.target.closest?.('[data-bol-drop]');
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  el.addEventListener('dragenter', (e) => { const z = dropZone(e); if (!z || !hasFiles(e)) return; e.preventDefault(); dragN++; z.classList.add('drag'); });
  el.addEventListener('dragover', (e) => { if (dropZone(e) && hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  el.addEventListener('dragleave', (e) => { const z = dropZone(e); if (!z) return; if (--dragN <= 0) { dragN = 0; z.classList.remove('drag'); } });
  el.addEventListener('drop', wrap(async (e) => {
    const z = dropZone(e); if (!z) return;
    e.preventDefault(); dragN = 0; z.classList.remove('drag');
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /^image\/|pdf$/.test(f.type) || /\.(pdf|jpe?g|png|heic|heif|webp)$/i.test(f.name));
    if (!files.length) return toast('Bare bilder og PDF kan lastes opp som kvittering');
    await uploadTo('folder', files);
  }));
  el.addEventListener('input', (e) => { if (e.target.matches('[data-keep]')) { const o = el.querySelector('[data-keep-out]'); if (o) o.textContent = e.target.value; } });
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest('[data-mform]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    switch (f.dataset.mform) {
      case 'folder': { const r = await api('/folders', { method: 'POST', json: { ...v, share: (u.newPick ?? []).map((id) => ({ userId: id, role: 'editor' })) } }); u.dir = r.id; u.newPick = []; u.bolNew = false; u.bolTab = 'ov'; toast(r.members.length > 1 ? `${r.name} er opprettet og delt` : `${r.name} er opprettet`); return u.page === 'inn' ? reloadBol() : reload(); }
      case 'entry': {
        const r = await api(`/folders/${target()}/entries`, { method: 'POST', json: { description: v.description, amount: parseAmount(v.amount), date: today(), categoryId: +v.categoryId || null, projectId: +v.projectId || null, paidBy: v.paidBy } });
        u.bolAdd = false; toast(`Lagt til i ${r.name}${v.categoryId ? '' : ' · ✦ AI velger kategori'}`); return reload();
      }
      case 'bshare': if (!v.userId) return; { const r = await api(`/folders/${f.dataset.fid}/members`, { method: 'POST', json: v }); toast(`${r.name} er delt`); } return reloadBol();
      case 'bcat': S.bolCats = await api('/boliger/categories', { method: 'POST', json: { name: v.name } }); toast(`«${v.name.trim()}» er lagt til`); render(); el.querySelector('[data-mform=bcat] input')?.focus(); return;
      case 'project': S.folder = await api(`/folders/${u.dir}/projects`, { method: 'POST', json: { ...v, budget: parseAmount(v.budget) } }); toast('Prosjekt lagt til'); return render();
      case 'inst': S.folder = await api(`/folders/${u.dir}/projects/${f.dataset.pid}/installments`, { method: 'POST', json: { ...v, amount: parseAmount(v.amount) } }); return render();
      case 'bill': S.folder = await api(`/folders/${u.dir}/bills`, { method: 'POST', json: v }); return render();
      case 'split': {
        const equal = e.submitter?.name === 'equal';
        const w = Object.fromEntries(Object.entries(v).filter(([k2]) => k2.startsWith('w:')).map(([k2, x]) => [k2.slice(2), parseAmount(x) ?? 0]));
        S.folder = await api(`/folders/${u.dir}`, { method: 'PATCH', json: { split: equal ? 'equal' : w } }); u.splitEdit = false; return render();
      }
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
      case 'bol2-invite': {
        const who = String(v.who ?? '').trim(), role = u.bolInvRole ?? 'editor';
        if (!who) return;
        // Vanlige brukere får ikke brukernavnet til andre (prompt 21): match også på visningsnavn.
        const usr = (S.users ?? []).find((x) => (x.username && x.username === who.toLowerCase()) || [x.name, x.displayName].some((n) => n && String(n).toLowerCase() === who.toLowerCase()));
        if (usr) S.folder = await api(`/folders/${u.dir}/members`, { method: 'POST', json: { userId: usr.id, role } });
        else S.folder = await api(`/folders/${u.dir}/invite`, { method: 'POST', json: { members: [who] } });
        toast(`${usr ? (usr.displayName ?? usr.name ?? usr.username) : who} har fått tilgang`); return reload();
      }
      case 'invite': if (!v.emails.trim()) return; S.folder = await api(`/folders/${u.dir}/invite`, { method: 'POST', json: v }); return reload();
      case 'finn': { const r = await api('/finn', { method: 'POST', json: v }); toast(`${r.item} lagt til`); return reload(); }
    }
  }));
  // Logoer som ikke finnes: vis forbokstaven (CSP stopper inline onerror).
  el.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.parentNode?.classList?.contains('m-logo')) { img.parentNode.classList.add('err'); img.remove(); } }, true);
}
