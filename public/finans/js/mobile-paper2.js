// Papir (prompt 14): sidene som har fått egne Papir-oppsett. Finans → Liste og Finans → Mer, Finn som rutenett med
// rediger/legg til, og Sporing med faner, «Varsler og kilder» og omorganisering med langt trykk.
// Data fra de samme API-ene som Klassisk (/finans/api/transactions, /finans/api/finn, /api/tracking).
import * as P37B from './mobile-p37b.js'; // prompt 37: husstandens sporingsnøkler (maskert) og kvote
import { S, api, esc, n0, n2, ini, today, hlApi } from './core.js';
import { glimtOrb } from './mobile-orb43.js'; // prompt 43
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { pkgLogo, pkgTitle } from './mobile-p21.js';
import { TR, trkLoad, trkPrefs, setTrkPref, badge, carOf, stepOf, isDone, isReady, STXT, normNo, detectLocal } from './mobile-track.js';
import { edBlocks, finnWay } from './mobile-paper3.js';
import { ppTi } from './mobile-p20.js';
import * as P26 from './mobile-p26.js';

const lab = (t, r = '') => `<div class="pp-sec"><span>${esc(t)}</span>${r ? `<span>${r}</span>` : ''}</div>`;
const kr = (v) => `${n0(v)} kr`;
const ddmm = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');
const sw = (on) => `<span class="pp-sw${on ? ' on' : ''}"><i></i></span>`;

/* ---------- Finans → Liste ---------- */

const PL = { cat: 'Alle' };
export function paperList() {
  const items = S.tx?.items ?? null, q = S.ui?.q ?? '';
  const count = new Map();
  for (const t of items ?? []) if (t.category) count.set(t.category, (count.get(t.category) ?? 0) + 1);
  const cats = ['Alle', 'Til gjennomgang', ...[...count].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)];
  if (!cats.includes(PL.cat)) PL.cat = 'Alle';
  const L = (items ?? []).filter((t) => PL.cat === 'Alle' || (PL.cat === 'Til gjennomgang' ? t.receipt === 'needs_review' : t.category === PL.cat));
  const sum = L.reduce((a, t) => a + (t.amount ?? 0), 0);
  const month = (S.summary?.month ? new Date(S.summary.month + '-15') : new Date()).toLocaleDateString('nb-NO', { month: 'long' }).toUpperCase();
  const rc = (t) => (t.receipt === 'needs_review' ? ['Til gjennomgang', 'pp-lab-c'] : t.receiptId ? ['Vedlagt', 'pp-mut'] : ['ingen kvittering', 'pp-mut']);
  void sum; void month;
  // Prompt 43 (claude-code-finans-liste-maned-topp.md): gruppert per måned med rød mono-etikett, «Netto …» og 2 pt strek i ink.
  const txRow = (t) => { const [rt, rcls] = rc(t); return `<button class="pp-tx" data-tx="${t.id}">${ppTi(t, ini(t.merchant || t.description), t.color)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(t.merchant || t.description)}</b><span class="pp-mut">${esc(t.category ?? '')} · ${esc(t.date === today() ? 'I dag' : ddmm(t.date))} · <span class="${rcls}">${rt}</span></span></span><span class="pp-serif ${t.amount > 0 ? 'pp-pos' : ''}">${t.amount < 0 ? '−' : '+'}${n0(t.amount)}</span></button>`; };
  const groups = [];
  for (const t of L) { const k = String(t.date ?? '').slice(0, 7) || '—'; let g = groups.at(-1); if (!g || g.k !== k) { g = groups.find((x) => x.k === k); if (!g) { g = { k, L: [] }; groups.push(g); } } g.L.push(t); }
  const mName = (k, short) => { const [y, mo] = k.split('-').map(Number); if (!y || !mo) return ''; const d = new Date(y, mo - 1, 15); return (short ? d.toLocaleDateString('nb-NO', { month: 'short' }).replace('.', '') : d.toLocaleDateString('nb-NO', { month: 'long' })).toUpperCase(); };
  const head = (g) => { const net = g.L.reduce((a, t) => a + (Number(t.amount) || 0), 0), lbl = PL.cat === 'Alle' ? `${mName(g.k)} · ${g.L.length}` : `${PL.cat.toUpperCase()} · ${mName(g.k, true)} · ${g.L.length}`;
    return `<div class="p43-mh"><span class="p43-mhl">${esc(lbl)}</span><span class="p43-mhn">Netto ${net < 0 ? '−' : '+'}${n2(Math.abs(net))} kr</span></div>`; };
  return `<form class="pp-search" data-msearch role="search"><span aria-hidden="true">⌕</span><input class="m-input" id="m-txq" name="q" type="search" value="${esc(q)}" enterkeyhint="search" placeholder="Søk i transaksjoner og kvitteringer" aria-label="Søk i transaksjoner" autocomplete="off"><button type="button" class="p43-gpill" data-p43="lglimt" aria-label="Spør Glimt i Finans → Søk">${glimtOrb(20, 'chip')}Glimt</button></form>
    <div class="pp-chips">${cats.map((n) => `<button class="pp-fchip" data-ppl="cat" data-k="${esc(n)}" aria-pressed="${PL.cat === n}">${esc(n)}</button>`).join('')}</div>
    ${items === null ? '<div class="m-spin"></div>' : groups.map((g) => `<section class="p43-mg">${head(g)}<div class="pp-rows">${g.L.map(txRow).join('')}</div></section>`).join('')}
    ${items === null || L.length ? '' : `${head({ k: S.summary?.month ?? '', L: [] })}<div class="pp-mut" style="padding:16px 4px;font-size:14px">Ingen treff. Trykk Glimt og spør fritt, for eksempel «hvor mye brukte jeg på mat i september».</div>`}`;
}

/* ---------- Finans → Mer ---------- */

export function paperFMer() {
  const s = S.summary, rv = (s?.review ?? []).filter((r) => r.status === 'needs_review').length;
  const bud = s?.budgetTotal ? `${Math.round((s.budgetUsed / s.budgetTotal) * 100)} %` : '';
  const G = [['PENGER', [['budsjett', 'Budsjett', 'Per kategori', bud], ['kv', 'Kvitteringer', 'Kø og bokført', rv ? String(rv) : '', rv], ['fast', 'Faste trekk', 'Neste 30 dager', ''], ['konto', 'Kontoer', 'Saldo og kort', '']]],
    ['MODULER', [['aks', 'Aksjer', 'Trading 212', ''], ['sub', 'Abonnementer', 'Subscription OS', ''], ['dir', 'Boliger', 'Utgifter, prosjekter og regninger', '']]],
    ['DATA', [['imp', 'Import', 'Bank, Excel og Finn', ''], ['rap', 'Rapporter', 'Måned og år', ''], ['set', 'Innstillinger', 'Tema, kategorier og regler', '']]]];
  return G.map(([t, rows]) => `<div class="pp-grp"><span class="pp-lab">${t}</span><div class="pp-card pp-list">${rows.map(([k, n, sd, v, hot]) => `<a href="#/${k}"><span class="m-grow"><b class="pp-serif">${n}</b><span class="pp-mut">${sd}</span></span>${v ? `<span class="${hot ? 'pp-lab-c' : 'pp-mut'}" style="font-size:13px">${esc(v)}</span>` : ''}<span class="pp-mut">›</span></a>`).join('')}</div></div>`).join('');
}

/* ---------- Finans → Finn (rutenett med bilde) ---------- */

export const PF = { d: null, err: '', seg: 'Alle', add: false, f: { role: 'bought', link: '', item: '', amount: '', who: '' }, ed: null, e: {}, busy: false, del: false };
export async function paperFinnLoad() { try { PF.d = await api('/finn'); PF.err = ''; } catch (e) { PF.err = e.message; } }
const SEG = [['Alle', () => true], ['På vei', (x) => !x.done && x.stage >= 2], ['Kjøpt', (x) => x.role !== 'sold'], ['Solgt', (x) => x.role === 'sold'], ['Fullført', (x) => x.done]];
const STEPS = { bought: ['Betalt', 'Sendt', 'Mottatt', 'Godkjent'], sold: ['Solgt', 'Sendt', 'Levert', 'Utbetalt'] };
const TINT = ['#3A2F4A', '#1E2A3F', '#3B2E22', '#22362C', '#2C2C33', '#2A3540'];

export function paperFinn() {
  if (PF.err && !PF.d) return `<div class="pp-card pp-mut">Finn-handler er ikke tilgjengelig: ${esc(PF.err)}</div>`;
  if (!PF.d) return '<div class="m-spin"></div>';
  const D = PF.d.items ?? [], buy = PF.d.bought ?? 0, sell = PF.d.sold ?? 0, net = sell - buy, mx = Math.max(1, buy, sell);
  const flt = (SEG.find(([n]) => n === PF.seg) ?? SEG[0])[1], L = D.filter(flt), f = PF.f;
  const inp = (k, ph, v, extra = '') => `<input class="pp-in" id="pp-fn-${k}" data-ppf="${k}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off" ${extra}>`;
  const cards = L.map((x) => {
    const st = Math.max(0, Math.min(3, (x.stage ?? 1) - 1)), done = !!x.done, sold = x.role === 'sold';
    const bars = [0, 1, 2, 3].map((j) => `<i style="background:${done ? 'var(--pp-pos)' : j < st ? 'var(--pp-ink)' : j === st ? 'var(--pp-lab)' : 'var(--pp-line)'}"></i>`).join('');
    const pill = done ? ['rgba(0,0,0,.6)', '#fff'] : sold ? ['#2f7a4f', '#fff'] : ['rgba(243,239,230,.94)', '#1b1a17'];
    const img = x.image ? `background-image:url('${esc(x.image)}')` : '';
    const inner = `<span class="pp-fimg" style="background-color:${TINT[x.id % TINT.length]};${img}">${x.image ? '' : `<span class="pp-fini">${esc(String(x.item).split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase())}</span>`}<span class="pp-fpill" style="background:${pill[0]};color:${pill[1]}">${esc(done ? 'FULLFØRT' : String(x.status ?? STEPS[sold ? 'sold' : 'bought'][st]).toUpperCase())}</span><span class="pp-fbars">${bars}</span></span>
      <span class="pp-fbody"><span class="pp-serif pp-fv${sold ? ' pp-pos' : ''}">${sold ? '+' : '−'}${kr(x.amount)}</span><span class="m-ell pp-ft">${esc(x.item)}</span><span class="m-ell pp-mut" style="font-size:11.5px">${sold ? 'Solgt · Til' : 'Kjøpt · Fra'} ${esc(x.counterpart || '–')}</span>${!done && x.next ? `<span class="m-ell pp-fnext${x.needsAction ? ' hot' : ''}">${esc(x.next)}</span>` : ''}</span>`;
    return `<div class="pp-fcard${PF.ed === x.id ? ' on' : ''}${x.needsAction ? ' act' : ''}"><a href="#/finn/ad/${x.id}" title="Åpne annonsen">${inner}</a>
      <button class="pp-fed" data-ppfn="edit" data-id="${x.id}" aria-label="Rediger ${esc(x.item)}">✎</button></div>`;
  }).join('');
  return `<div class="pp-card pp-saldo"><div class="pp-row"><span class="pp-lab">NETTO I ÅR</span><span class="pp-mut">${D.length} handler</span></div><b class="pp-serif pp-huge ${net >= 0 ? 'pp-pos' : 'pp-lab-c'}">${net >= 0 ? '+' : '−'}${kr(Math.abs(net))}</b>
      <div class="pp-two" style="gap:12px"><div class="pp-col" style="gap:5px"><span class="pp-mut">Kjøpt · ${PF.d.nBought ?? D.filter((x) => x.role !== 'sold').length}</span><b class="pp-serif" style="font-size:18px">${kr(buy)}</b><span class="pp-bar thin"><i style="width:${(buy / mx) * 100}%;background:var(--pp-ink)"></i></span></div>
        <div class="pp-col" style="gap:5px"><span class="pp-mut">Solgt · ${PF.d.nSold ?? D.filter((x) => x.role === 'sold').length}</span><b class="pp-serif" style="font-size:18px">${kr(sell)}</b><span class="pp-bar thin"><i style="width:${(sell / mx) * 100}%;background:var(--pp-pos)"></i></span></div></div></div>
    ${finnWay(D)}
    <div class="pp-chips">${SEG.map(([n, fn]) => `<button class="pp-fchip" data-ppfn="seg" data-k="${n}" aria-pressed="${PF.seg === n}">${n} <span style="opacity:.6">${D.filter(fn).length}</span></button>`).join('')}</div>
    <button class="pp-btn dash" data-ppfn="add">${PF.add ? 'Lukk' : '+ Legg til kjøp eller salg'}</button>
    ${PF.add ? `<form class="pp-card pp-col" data-ppfnform>
      <div class="pp-two" style="gap:6px">${[['bought', 'Kjøpt'], ['sold', 'Solgt']].map(([k, n]) => `<button type="button" class="pp-seg" data-ppfn="role" data-k="${k}" aria-pressed="${f.role === k}">${n}</button>`).join('')}</div>
      ${inp('link', 'Finn-lenke, f.eks. finn.no/…/item/476377764', f.link, 'inputmode="url"')}
      ${inp('item', 'Hva, f.eks. Sofabord i eik', f.item)}
      <div class="pp-two" style="gap:6px">${inp('amount', 'Pris kr', f.amount, 'inputmode="decimal"')}${inp('who', f.role === 'sold' ? 'Kjøper' : 'Selger', f.who)}</div>
      <span class="pp-mut" style="font-size:12px">✦ Med lenke henter AI tittel, pris, beskrivelse og bilder fra annonsen.</span>
      <button class="pp-btn ink" type="submit" ${PF.busy ? 'disabled' : ''}>${PF.busy ? 'Lagrer …' : 'Lagre handel'}</button></form>` : ''}
    <div class="pp-fgrid">${cards}</div>
    ${L.length ? '' : '<div class="pp-mut" style="padding:16px 4px;font-size:14px">Ingen handler her.</div>'}`;
}

// Redigering i et ark nedenfra: tittel, pris, person, status, kvittering og bilder, annonse, Lagre og Slett.
export function paperFinnSheet() {
  const x = PF.ed != null ? (PF.d?.items ?? []).find((y) => y.id === PF.ed) : null;
  if (!x) return '';
  const e = PF.e, sold = x.role === 'sold', L = STEPS[sold ? 'sold' : 'bought'], st = Math.max(1, Math.min(4, x.stage ?? 1));
  return `<div class="sheet-bg" data-ppfn="close"></div><div class="pp-sheet tall" role="dialog" aria-label="Rediger ${esc(x.item)}">
    <div class="pp-row"><b class="pp-serif" style="font-size:19px">Rediger · ${esc(x.item)}</b><button class="pp-x" data-ppfn="close" aria-label="Lukk">×</button></div>
    <input class="pp-in" id="pp-fe-item" data-ppe="item" value="${esc(e.item ?? x.item)}" aria-label="Tittel">
    <div class="pp-two" style="gap:6px"><input class="pp-in" id="pp-fe-amount" data-ppe="amount" value="${esc(e.amount ?? String(x.amount))}" inputmode="decimal" aria-label="Pris"><input class="pp-in" id="pp-fe-who" data-ppe="counterpart" value="${esc(e.counterpart ?? x.counterpart ?? '')}" placeholder="${sold ? 'Kjøper' : 'Selger'}" aria-label="${sold ? 'Kjøper' : 'Selger'}"></div>
    <div class="pp-chips pp-wrap">${L.map((n, j) => `<button class="pp-fchip sm" data-ppfn="stage" data-k="${j + 1}" aria-pressed="${st === j + 1}">${n}</button>`).join('')}</div>
    <div class="pp-three"><label class="pp-btn sq">Kvittering<input class="m-file" type="file" accept="image/*,application/pdf,message/rfc822,.eml" data-ppfnfile="receipt"></label><label class="pp-btn sq">Bilder<input class="m-file" type="file" multiple accept="image/*" data-ppfnfile="photo"></label>${x.adUrl ? `<a class="pp-btn sq" href="${esc(x.adUrl)}" target="_blank" rel="noopener">Annonse ↗</a>` : '<button class="pp-btn sq" disabled>Ingen annonse</button>'}</div>
    <span class="pp-mut" style="font-size:12px">${esc(x.summary?.text || 'Ingen vedlegg ennå')}</span>
    <div class="pp-row" style="gap:6px"><button class="pp-btn ink" style="flex:1" data-ppfn="save" ${PF.busy ? 'disabled' : ''}>Lagre</button><button class="pp-btn lab-o" data-ppfn="del">${PF.del ? 'Trykk igjen for å slette' : 'Slett'}</button></div>
    <a class="pp-mut" href="#/finn/${x.id}" style="text-align:center;padding:4px">Alle detaljer, e-poster og filer ›</a></div>`;
}

export async function paperFinnBind(e, t) {
  if (m.screen !== 'finn' || m.sub) return false;
  if (e.type === 'input') {
    if (t.dataset?.ppf) { PF.f[t.dataset.ppf] = t.value; if (t.dataset.ppf === 'link' && !PF.f.item && /\d{6,}/.test(t.value)) { /* AI fyller resten når lenken lagres */ } return true; }
    if (t.dataset?.ppe) { PF.e[t.dataset.ppe] = t.value; return true; }
    return false;
  }
  if (e.type === 'change' && t.dataset?.ppfnfile) {
    const files = [...t.files]; t.value = ''; if (!files.length || PF.ed == null) return true;
    const fd = new FormData(); fd.append('kind', t.dataset.ppfnfile); for (const f of files) fd.append('file', f, f.name);
    try { await api(`/finn/${PF.ed}/files`, { method: 'POST', body: fd }); await paperFinnLoad(); flash(t.dataset.ppfnfile === 'photo' ? `${files.length} bilde${files.length > 1 ? 'r' : ''} lagt til` : 'Kvitteringen er lagt til'); }
    catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (e.type === 'submit' && t.matches?.('[data-ppfnform]')) {
    e.preventDefault();
    const f = PF.f, amount = parseFloat(String(f.amount).replace(/\s/g, '').replace(',', '.'));
    if (!f.link.trim() && (!f.item.trim() || !(amount > 0))) { haptic('err'); flash('Skriv hva og pris, eller lim inn en Finn-lenke'); return true; }
    PF.busy = true; draw();
    try {
      const r = await api('/finn', { method: 'POST', json: { role: f.role, item: f.item.trim(), amount: Number.isFinite(amount) ? amount : 0, counterpart: f.who.trim(), adUrl: f.link.trim() || undefined } });
      PF.f = { role: f.role, link: '', item: '', amount: '', who: '' }; PF.add = false; PF.seg = 'Alle';
      await paperFinnLoad(); flash(r?.adError ? `Handelen er lagret, men annonsen ble ikke hentet: ${r.adError}` : `${r?.item ?? 'Handelen'} er lagret`);
    } catch (err) { haptic('err'); flash(err.message); }
    PF.busy = false; draw(); return true;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-ppfn]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.ppfn;
  if (k === 'seg') PF.seg = x.dataset.k;
  else if (k === 'add') PF.add = !PF.add;
  else if (k === 'role') PF.f.role = x.dataset.k;
  else if (k === 'edit') { PF.ed = +x.dataset.id; PF.e = {}; PF.del = false; }
  else if (k === 'close') { PF.ed = null; PF.e = {}; PF.del = false; }
  else if (k === 'stage') {
    try { await api(`/finn/${PF.ed}`, { method: 'PATCH', json: { stage: +x.dataset.k } }); await paperFinnLoad(); haptic('tab'); } catch (err) { flash(err.message); }
  } else if (k === 'save') {
    const body = {}, it = (PF.d?.items ?? []).find((y) => y.id === PF.ed);
    if (PF.e.item !== undefined) body.item = PF.e.item.trim();
    if (PF.e.counterpart !== undefined) body.counterpart = PF.e.counterpart.trim();
    if (PF.e.amount !== undefined) body.amount = PF.e.amount;
    PF.busy = true; draw();
    try { if (Object.keys(body).length) await api(`/finn/${PF.ed}`, { method: 'PATCH', json: body }); await paperFinnLoad(); PF.ed = null; PF.e = {}; flash(`${body.item || it?.item || 'Handelen'} er lagret`); }
    catch (err) { flash(err.message); }
    PF.busy = false;
  } else if (k === 'del') {
    if (!PF.del) { PF.del = true; haptic('err'); }
    else { const it = (PF.d?.items ?? []).find((y) => y.id === PF.ed); await api(`/finn/${PF.ed}`, { method: 'DELETE' }); PF.ed = null; PF.del = false; await paperFinnLoad(); flash(`${it?.item ?? 'Handelen'} er slettet`); }
  }
  draw(); return true;
}

/* ---------- Sporing ---------- */

const TT = { tab: 'act', set: false, nv: '', pick: '', busy: false, sel: null, delArm: false, arch: null, lp: null, lpFired: false };
const TABS = [['act', 'Aktive', (p) => !p.archived && !isDone(p)], ['pick', 'Klar for henting', (p) => !p.archived && isReady(p)], ['way', 'På vei', (p) => !p.archived && !isDone(p) && !isReady(p) && stepOf(p) >= 1],
  ['reg', 'Registrert', (p) => !p.archived && !isDone(p) && stepOf(p) === 0], ['done', 'Levert', (p) => !p.archived && isDone(p)], ['all', 'Alle', (p) => !p.archived], ['arch', 'Arkiv', (p) => !!p.archived]];
// Arkivet hentes for seg (GET /api/tracking?archived=1); eldre server: de arkiverte som ligger i den vanlige listen.
async function archLoad() { try { const r = await hlApi('/tracking?archived=1'); TT.arch = (r?.items ?? []).map((p) => ({ ...p, archived: true })); } catch { TT.arch = (TR.data?.items ?? []).filter((p) => p.archived); } }
const tabItems = (id) => (id === 'arch' ? TT.arch ?? (TR.data?.items ?? []).filter((p) => p.archived) : TR.data?.items ?? null);
const tabCount = (id, f) => (id === 'arch' ? TR.data?.counts?.archived ?? (TT.arch ?? (TR.data?.items ?? []).filter((p) => p.archived)).length : (TR.data?.items ?? []).filter(f).length);
/* Velg flere: hold inne en pakke (mobil) eller klikk på ikonet (PC). Menyen har Velg alle, Arkiver/Gjenopprett og Slett. */
export function trkDown(e) {
  TT.lpFired = false;
  if (m.screen !== 'spor' || (e.button ?? 0) > 0) return;
  const c = e.target.closest?.('[data-pk]');
  if (!c || TT.sel) return;
  TT.lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { TT.lp = null; TT.lpFired = true; TT.sel = new Set([c.dataset.pk]); TT.delArm = false; haptic('ok'); navigator.vibrate?.(15); draw(); }, 500) };
}
export function trkMove(e) { if (TT.lp && (Math.abs(e.clientX - TT.lp.x) > 10 || Math.abs(e.clientY - TT.lp.y) > 10)) { clearTimeout(TT.lp.t); TT.lp = null; } }
export function trkUp() { if (TT.lp) clearTimeout(TT.lp.t); TT.lp = null; }
async function bulk(action) {
  const ids = [...(TT.sel ?? [])];
  if (!ids.length) return;
  try { await hlApi('/tracking/bulk', { method: 'POST', json: { ids, action } }); }
  catch (e) {
    if (e.status !== 404) { flash(e.message); return; }
    for (const id of ids) await (action === 'delete' ? hlApi(`/tracking/${encodeURIComponent(id)}`, { method: 'DELETE' }) : hlApi(`/tracking/${encodeURIComponent(id)}`, { method: 'PATCH', json: { archived: action === 'archive' } })).catch(() => {});
  }
  haptic('ok'); flash(`${ids.length} ${ids.length === 1 ? 'sending' : 'sendinger'} ${action === 'delete' ? 'slettet' : action === 'archive' ? 'arkivert' : 'gjenopprettet'}`);
  TT.sel = null; TT.delArm = false; await trkLoad(); if (TT.tab === 'arch' || action !== 'delete') await archLoad(); draw();
}
function selBar(list) {
  if (!TT.sel) return '';
  const n = TT.sel.size, arch = TT.tab === 'arch', all = list.length && list.every((p) => TT.sel.has(String(p.id)));
  return `<div class="p17-selbar" role="toolbar" aria-label="Valgte sendinger"><b>${n} valgt</b><span class="m-grow"></span>
    <button data-pptrk="selall">${all ? 'Velg ingen' : 'Velg alle'}</button><button data-pptrk="${arch ? 'unarch' : 'arch'}" ${n ? '' : 'disabled'}>${arch ? 'Gjenopprett' : 'Arkiver'}</button>
    <button class="bad" data-pptrk="del" ${n ? '' : 'disabled'}>${TT.delArm ? 'Trykk igjen for å slette' : 'Slett'}</button><button class="x" data-pptrk="selx" aria-label="Avslutt valg">×</button></div>`;
}
const NOTIFY = [['found', 'Ny pakke funnet', 'Når et sporingsnummer dukker opp i e-post eller Finn'], ['pickup', 'Klar for henting', 'Med hentested og frist'], ['out', 'Ute for levering', 'Når budet er på vei til deg'], ['delayed', 'Forsinket', 'Når leveringen er forsinket'], ['delivered', 'Levert', 'Når pakken er levert']];
const SOURCES = [['email', 'E-post (Proton Mail)', 'Ordre- og fraktbekreftelser'], ['finn', 'Finn', 'Fiks ferdig-handler med sporingsnummer'], ['autoArchive', 'Arkiver leverte automatisk', 'Etter 7 dager']];
const srcOn = (k) => { const s = TR.data?.sources?.[k]; return k === 'autoArchive' ? s?.on === true || s === true : s?.on !== false && s !== false; };
// Prompt 26: lenken følger en overstyrt transportør (ParcelsApp har egen sporingsside).
const pkUrl = (p0) => { const p = P26.shown(p0); return p.url || (p.carrier === 'parcelsapp' ? `https://parcelsapp.com/no/tracking/${encodeURIComponent(p.trackingNo ?? '')}` : `${carOf(p.carrier).url}${encodeURIComponent(p.trackingNo ?? '')}`); };
const stTxt = (p) => (isDone(p) ? (p.direction === 'out' ? 'Levert til kjøper' : 'Levert') : isReady(p) ? 'Klar for henting' : p.statusText || STXT[p.status] || 'Ukjent status');
function etaTxt(p) {
  const eta = p.estimatedDelivery ?? p.eta, dl = p.pickup?.deadline ?? (isReady(p) ? eta : null);
  const fmt = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? new Date(String(v).slice(0, 10) + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'numeric' }) : v ?? '');
  const d = fmt(eta);
  if (isReady(p)) return [p.pickup?.name ?? p.pickupPoint, dl ? `hent innen ${fmt(dl)}` : ''].filter(Boolean).join(' · ');
  // Prompt 22: «Ingen leveringsdato ennå» bare når status er Registrert og API-et ikke har estimatedDelivery.
  if (p.noEtaText && !d) return p.noEtaText;
  if (!d && !isDone(p) && stepOf(p) === 0 && !p.updateError && !('noEtaText' in p)) return 'Ingen leveringsdato ennå';
  if (isDone(p)) return d ? `Levert ${d}` : '';
  return d ? `Ventet ${d}` : '';
}
const tog = (attr, n, s, on) => `<button class="pp-tog" ${attr} role="switch" aria-checked="${on}"><span class="m-grow"><b>${esc(n)}</b>${s ? `<span class="pp-mut">${esc(s)}</span>` : ''}</span>${sw(on)}</button>`;
const notifyRows = () => { const P = trkPrefs(); return NOTIFY.map(([k, n, s]) => tog(`data-trkpref="${k}"`, n, s, !!P[k])).join(''); };
const sourceRows = () => SOURCES.map(([k, n, s]) => tog(`data-pptrk="src" data-k="${k}"`, n, s, srcOn(k))).join('');

/* Prompt 22: siste hendelse fra API-et, feil ved oppdatering og tidslinje med faktisk status. */
const tShort = (v) => { if (!v) return ''; const d = new Date(v); return Number.isNaN(+d) ? String(v) : `${d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`; };
const hmOnly = (v) => { const d = new Date(v); return Number.isNaN(+d) ? '' : d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }); };
function evLine(p) {
  const e = p.updateError, L = p.lastEvent;
  const err = e ? `<span class="t22-err">${esc(typeof e === 'string' ? 'Kunne ikke oppdatere' : e.text || 'Kunne ikke oppdatere')}${e.retryAt ? ` · prøver igjen ${hmOnly(e.retryAt)}` : ''}</span>` : '';
  const ev = L && (L.line || L.text || L.place) ? `<span class="t22-ev m-ell">${esc(L.line || [L.text, L.place, tShort(L.time)].filter(Boolean).join(' · '))}</span>` : '';
  return ev || err ? `<span class="t22-evs">${ev}${err}</span>` : '';
}
const TL = ['Registrert', 'Hentet', 'I transport', 'Hentested', 'Levert'];
function tlLine(p, st, done) {
  // steps: enten bare navnene (['Registrert', …]) eller objekter med done/time per steg.
  const T = Array.isArray(p.timeline) && p.timeline.length ? p.timeline : null;
  if (T) { const ci = Math.max(0, T.findIndex((x) => x.current) >= 0 ? T.findIndex((x) => x.current) : T.map((x) => !!x.done).lastIndexOf(true)); return `<span class="t22-tl" style="grid-template-columns:repeat(${T.length},minmax(0,1fr))">${T.map((x, i) => `<span class="${i === ci ? 'on' : x.done ? 'past' : ''}">${esc(x.label ?? TL[i] ?? '')}${i === ci && (x.timeText || x.time) ? `<small>${esc(x.timeText || tShort(x.time))}</small>` : ''}</span>`).join('')}</span>`; }
  const S = Array.isArray(p.steps) && p.steps.length ? p.steps.slice(0, 6) : null, obj = S && typeof S[0] === 'object';
  const labels = S ? S.map((x, i) => (typeof x === 'string' ? x : x?.label ?? x?.text ?? x?.name ?? TL[i])) : TL;
  const cur = obj ? Math.max(0, S.map((x) => !!(x?.done ?? x?.reached ?? x?.time)).lastIndexOf(true)) : Math.min(labels.length - 1, done ? labels.length - 1 : st);
  const when = (obj ? S[cur]?.time ?? null : null) ?? p.lastEvent?.time ?? p.statusAt ?? null;
  return `<span class="t22-tl" style="grid-template-columns:repeat(${labels.length},minmax(0,1fr))">${labels.map((n, i) => `<span class="${i === cur ? 'on' : i < cur ? 'past' : ''}">${esc(n)}${i === cur && when ? `<small>${esc(tShort(when))}</small>` : ''}</span>`).join('')}</span>`;
}
function pkCard(p) {
  const st = stepOf(p), done = isDone(p), ready = isReady(p), on = TT.sel?.has(String(p.id));
  const bars = [0, 1, 2, 3, 4].map((j) => `<i style="background:${done ? 'var(--pp-pos)' : j < st ? 'var(--pp-ink)' : j === st ? 'var(--pp-lab)' : 'var(--pp-line)'}"></i>`).join('');
  const src = p.source === 'finn' ? 'Finn' : p.source === 'email' ? 'E-post' : 'Manuelt';
  return `<a class="pp-card pp-pk${ready ? ' ready' : ''}${TT.sel ? ' pksel' : ''}${on ? ' on' : ''}" data-pk="${esc(p.id)}" href="${esc(pkUrl(p))}" target="_blank" rel="noopener"><div class="pp-pkt"><span class="p17-pkb" data-pksel="${esc(p.id)}" title="Velg">${pkgLogo(P26.shown(p), 44)}${TT.sel ? `<i class="p17-pkc" aria-hidden="true">${on ? '✓' : ''}</i>` : ''}</span><span class="m-grow" style="min-width:0"><b class="pp-serif m-ell">${esc(pkgTitle(p))}</b><span class="pp-mut m-ell">${esc(P26.carLabel(p))} · ${esc(p.trackingNo ?? '')}</span></span><span class="pp-src">${src}</span></div>
    <div class="pp-row"><b class="pp-pks ${ready ? 'pp-lab-c' : done ? 'pp-pos' : ''}">${esc(stTxt(p))}</b><span class="pp-mut" style="text-align:right">${esc(etaTxt(p))}</span></div>${evLine(p)}<span class="pp-pkb">${bars}</span>${tlLine(p, st, done)}</a>`;
}

function secHtml(k) {
  const items = TR.data?.items ?? null;
  if (k === 'tabs') {
    return `<div class="pp-trktabs"><div class="pp-trktabs-s" role="tablist">${TABS.map(([id, n, f]) => `<button role="tab" data-pptrk="tab" data-k="${id}" aria-selected="${TT.tab === id}">${n}<span>${tabCount(id, f)}</span></button>`).join('')}</div>
      <button class="pp-trkset" data-pptrk="set" aria-label="Kilder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6"/></svg></button></div>`;
  }
  if (k === 'shipments') {
    const fn = (TABS.find(([id]) => id === TT.tab) ?? TABS[0])[2], src = tabItems(TT.tab);
    const L = (src ?? []).filter(fn).sort((a, b) => (isReady(b) - isReady(a)) || (stepOf(b) - stepOf(a)));
    TT.vis = L;
    const one = TT.sel?.size === 1 ? L.find((p) => TT.sel.has(String(p.id))) : null;
    return `${selBar(L)}${one ? P26.sporVia(one) : ''}${TR.err ? `<div class="pp-card pp-mut">${esc(TR.err)}</div>` : ''}${TR.missing ? '<div class="pp-card pp-mut">Serveren har ikke Sporing ennå. Oppdater Homelab for å spore pakker.</div>' : ''}
      ${src === null ? '<div class="m-spin"></div>' : L.map(pkCard).join('') || `<div class="pp-mut" style="padding:16px 4px;font-size:14px">${TT.tab === 'arch' ? 'Ingen arkiverte sendinger.' : 'Ingen pakker her.'}</div>`}
      ${P37B.trkKeyLine() ?? (TR.data?.parcelsapp?.configured ? `<span class="pp-mut" style="font-size:12px;padding:0 4px">ParcelsApp: ${n0(TR.data.parcelsapp.used ?? 0)} av ${n0(TR.data.parcelsapp.limit ?? 3)} oppslag brukt denne måneden</span>` : '')}`; // prompt 37: husstandens nøkkel
  }
  if (k === 'add') {
    return `<form class="pp-trkadd" data-pptrkform><input class="pp-in dash" id="pp-trk-no" value="${esc(TT.nv)}" placeholder="Sporingsnummer" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Sporingsnummer"><button class="pp-btn ink" type="submit" ${TT.busy ? 'disabled' : ''}>${TT.busy ? '…' : 'Spor'}</button></form>
      ${P26.addCars(TT.nv, TT.pick, 'data-pptrk="car"')}
      <div class="pp-chips">${SOURCES.slice(0, 2).map(([id, n]) => `<button class="pp-fchip sm" data-pptrk="src" data-k="${id}" aria-pressed="${srcOn(id)}">${srcOn(id) ? '✓ ' : ''}${n.replace(/ \(.*\)/, '')}</button>`).join('')}</div>`;
  }
  if (k === 'notify') return `<span class="pp-lab">VARSLER</span><div class="pp-card pp-tight">${notifyRows()}</div>`;
  if (k === 'carriers') {
    const C = TR.data?.carriers ?? [];
    return `<span class="pp-lab">TRANSPORTØRER</span><div class="pp-card pp-tight">${C.map((c) => `<div class="pp-tog">${badge(c.id, 32, c.logo)}<span class="m-grow"><b>${esc(c.name ?? carOf(c.id).name)}</b></span><span class="${c.configured ? 'pp-pos' : 'pp-mut'}" style="font-size:12.5px">${c.configured ? 'Tilkoblet' : 'Mangler nøkkel'}</span></div>`).join('') || '<div class="pp-mut" style="padding:12px 14px">Nøklene legges inn i Homelab → Innstillinger → Integrasjoner → Sporing.</div>'}</div>`;
  }
  return '';
}
// Hold inne et kort for å flytte det: fanene, pakkelisten og Legg til (Varsler og kilder ligger i arket bak ⚙).
export function paperTrk() {
  return `<div class="pp-trk">${edBlocks('spor', { t1: secHtml('tabs'), t2: `<div class="pp-col" style="gap:10px">${secHtml('shipments')}</div>`, t3: `<div class="pp-col" style="gap:8px">${secHtml('add')}</div>` })}</div>`;
}

export function paperTrkSheet() {
  if (!TT.set || m.screen !== 'spor') return '';
  return `<div class="sheet-bg" data-pptrk="setx"></div><div class="pp-sheet tall" role="dialog" aria-label="Varsler og kilder"><span class="pp-grab"></span>
    <div class="pp-row"><div><div class="pp-lab">SPORING</div><div class="pp-sh">Kilder</div></div><button type="button" class="p30-sb p30-pri" data-pptrk="setx">Ferdig</button></div>
    <a class="pp-card p17-golink" href="#/set/varsler"><span class="m-grow"><b>Varsler</b><span class="pp-mut">Pakkevarsler ligger nå under Innstillinger → Varsler</span></span><span aria-hidden="true">›</span></a>
    <span class="pp-lab">KILDER</span><div class="pp-card pp-tight">${sourceRows()}</div>
    ${P37B.trkKeysSection()}
    <span class="pp-lab">PARCELSAPP</span><div class="pp-card pp-tight"><div class="pp-tog"><span class="m-grow"><b>Reserve for ukjente transportører</b><span class="pp-mut">${TR.data?.parcelsapp?.configured ? `${n0(TR.data.parcelsapp.used ?? 0)} av ${n0(TR.data.parcelsapp.limit ?? 3)} oppslag brukt denne måneden` : 'Legg inn nøkkelen i Homelab → Innstillinger → Integrasjoner → Sporing. Gratisplanen har 3 oppslag i måneden.'}</span></span><span class="${TR.data?.parcelsapp?.configured ? 'pp-pos' : 'pp-mut'}" style="font-size:12.5px">${TR.data?.parcelsapp?.configured ? 'Tilkoblet' : 'Mangler nøkkel'}</span></div></div>
    ${secHtml('carriers')}
    <span class="pp-mut" style="line-height:1.45">E-post leses via Proton Mail Bridge hvert 15. minutt. Finn-handler med Fiks ferdig hentes automatisk.</span></div>`;
}

export async function paperTrkBind(e, t) {
  if (m.screen !== 'spor') return false;
  if (e.type === 'input') { if (t.id === 'pp-trk-no') { const had = normNo(TT.nv).length >= 6; TT.nv = t.value; if (had !== (normNo(t.value).length >= 6)) draw(); else P26.refreshAuto(t.value); return true; } return false; }
  if (e.type === 'submit' && t.matches?.('[data-pptrkform]')) {
    e.preventDefault();
    const no = normNo(TT.nv);
    if (no.length < 6) { haptic('err'); flash('Skriv inn et sporingsnummer'); return true; }
    if ((TR.data?.items ?? []).some((p) => normNo(p.trackingNo) === no)) { haptic('err'); flash('Sendingen spores allerede'); return true; }
    TT.busy = true; draw();
    const pk = TT.pick;
    try { const r = await hlApi('/tracking', { method: 'POST', json: P26.addBody(no, pk) }); P26.noteAdded(no, pk); TT.nv = ''; TT.pick = ''; TT.tab = 'act'; await trkLoad(); haptic('ok'); flash(r?.message || `✦ Sporer hos ${pk ? `${P26.carN(pk)} · valgt` : carOf((r?.item ?? r)?.carrier ?? detectLocal(no)).name}`); }
    catch (err) { haptic('err'); flash(err.message); }
    TT.busy = false; draw(); return true;
  }
  if (e.type !== 'click') return false;
  // Velg flere: klikket etter et langt trykk, klikk på ikonet (PC) og klikk på kort mens noe er valgt.
  const card = t.closest?.('[data-pk]');
  if (card && (TT.lpFired || TT.sel || t.closest('[data-pksel]'))) {
    e.preventDefault();
    if (TT.lpFired) { TT.lpFired = false; return true; }
    const id = card.dataset.pk; TT.sel ??= new Set(); TT.sel.has(id) ? TT.sel.delete(id) : TT.sel.add(id); TT.delArm = false; haptic('tab');
    draw(); return true;
  }
  const x = t.closest?.('[data-pptrk]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.pptrk;
  if (k === 'car') { TT.pick = x.dataset.k; haptic('tab'); draw(); return true; }
  if (k === 'selx') { TT.sel = null; TT.delArm = false; draw(); return true; }
  if (k === 'selall') { const L = TT.vis ?? [], all = L.length && L.every((p) => TT.sel?.has(String(p.id))); TT.sel = new Set(all ? [] : L.map((p) => String(p.id))); TT.delArm = false; draw(); return true; }
  if (k === 'arch' || k === 'unarch') { await bulk(k === 'arch' ? 'archive' : 'unarchive'); return true; }
  if (k === 'del') { if (!TT.delArm) { TT.delArm = true; haptic('err'); draw(); return true; } await bulk('delete'); return true; }
  if (k === 'tab') { TT.tab = x.dataset.k; TT.sel = null; TT.delArm = false; haptic('tab'); if (TT.tab === 'arch' && !TT.arch) { draw(); await archLoad(); } }
  else if (k === 'set') TT.set = true;
  else if (k === 'setx') TT.set = false;
  else if (k === 'src') {
    const id = x.dataset.k, on = srcOn(id), s = { ...(TR.data?.sources ?? {}) };
    s[id] = { ...(typeof s[id] === 'object' ? s[id] : {}), on: !on }; if (TR.data) TR.data.sources = s; haptic('tab'); draw();
    await hlApi('/tracking/sources', { method: 'PUT', json: { [id]: !on } }).catch((err) => flash(TR.missing ? 'Serveren har ikke Sporing ennå' : err.message));
    return true;
  }
  draw(); return true;
}
export { setTrkPref };
