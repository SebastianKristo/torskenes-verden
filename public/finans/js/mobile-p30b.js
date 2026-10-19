// Prompt 30 (PWA): Boliger – kvittering til godkjenning trykkbar, del med brukere i Homelab (uten brukernavn) og
// rediger utgifter (claude-code-boliger-kvittering-deling-rediger.md, fasit Boliger.dc.html: det, inv).
// API (FinansHub): GET /folders/:id (entries med status, receiptId, catTree, members, isOwner),
// GET /users/shareable?home=<id> → [{id, name, initial, color, relation?}] (aldri e-post/brukernavn),
// POST /folders/:id/members {userIds[], role}, POST /folders/:id/invite {emails[]} (utenfor Homelab),
// PATCH /folders/:id/entries/:eid {merchant, amount, date, categoryId, status} (debounce 400 ms, «endret av» i historikken),
// GET /folders/:id/entries/:eid/history, DELETE /folders/:id/entries/:eid.
import { api, esc, n0, dd, parseAmount } from './core.js';
import { m, draw, flash } from './mobile.js';
import { BO } from './mobile-p16.js';
import { sheetBtn, hapLight } from './mobile-p30.js';
import { glimt } from './mobile-p31.js';

export const B30 = { ent: null, edit: {}, t: null, saving: false, hist: {}, sh: {}, sel: [], role: 'editor', email: '', busy: false };
const kr = (v) => `${(v ?? 0) < 0 ? '−' : ''}${n0(v)} kr`;
const fmtAmt = (v) => { if (v == null || v === '') return ''; const n = Number(v), dec = Math.round(n * 100) % 100 !== 0; return n.toLocaleString('nb-NO', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: 2 }).replace(/\s/g, ' '); };
const bolId = () => +String(m.sub ?? '').split('/')[0] || null;
const CHEVR = '<span class="b30-chev" aria-hidden="true">›</span>';
const CHECK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const catName = (t) => t.label ?? t.name ?? '';
// Forslag: kategoriene boligen bruker mest (d.categories), ellers de første i treet.
const topCats = (d) => { const L = (d.categories ?? []).filter((c) => c.id != null).map((c) => ({ id: c.id, name: c.name })); return (L.length ? L : (d.catTree ?? []).filter((t) => !/›/.test(catName(t))).map((t) => ({ id: t.id, name: catName(t) }))).slice(0, 4); };
const thumb = (d, e) => (e.receiptId ? `<span class="b30-th" style="background-image:url('/finans/api/folders/${d.id}/receipts/${esc(e.receiptId)}/thumb')"></span>` : '<span class="b30-th none" aria-hidden="true">kr</span>');

/* ---------- 1. Til gjennomgang: hele toppraden åpner detaljarket (også mens AI leser) ---------- */
export function reviewCard(d) {
  const rows = (d.entries ?? []).filter((e) => e.status === 'review' || e.pending);
  if (!rows.length) return '';
  return `<div class="pp-card b30-rev"><span class="pp-lab">TIL GJENNOMGANG · ${rows.length}</span>${rows.slice(0, 6).map((e) => `<div class="b30-rr">
      <button type="button" class="b30-rtop" data-b30="ent" data-id="${e.id}" aria-label="Åpne ${esc(e.description)}">${thumb(d, e)}<span class="m-grow"><b class="m-ell">${esc(e.description)}</b><span class="pp-mut m-ell">${e.pending ? `${glimt(14, 'think', 'p31-inl')}Glimt leser kvitteringen …` : `✦ ${esc(e.categoryLabel ?? e.category ?? 'Forslag')}`}</span></span><b class="b30-amt">${kr(e.amount)}</b>${CHEVR}</button>
      ${d.canEdit && !e.pending ? `<div class="b30-chips">${topCats(d).map((c) => `<button type="button" class="b30-chip" data-b30="cat" data-id="${e.id}" data-c="${esc(c.id)}" aria-pressed="${e.category === c.name}">${esc(c.name)}</button>`).join('')}</div>
      <div class="b30-two"><button type="button" class="pp-btn sm" data-b30="ent" data-id="${e.id}">Detaljer</button><button type="button" class="pp-btn sm ink" data-b30="ok" data-id="${e.id}">Godkjenn</button></div>` : ''}</div>`).join('')}</div>`;
}

/* ---------- 2. Rediger utgift: tittel, beløp, dato, kategori (lagres fortløpende) ---------- */
export function entSheet(d) {
  const id = B30.ent;
  if (!id || !d) return '';
  const e = (d.entries ?? []).find((x) => x.id === id);
  if (!e) return '';
  const E = B30.edit, mer = E.merchant ?? e.description, amt = E.amount ?? fmtAmt(e.amount), date = E.date ?? e.date, rv = e.status === 'review', ro = !d.canEdit;
  const opts = (d.catTree ?? []).flatMap((t) => [[t.id, catName(t)], ...(t.children ?? t.subs ?? []).map((c) => [c.id, `${catName(t)} › ${catName(c)}`])]);
  const H = B30.hist[id];
  const who = e.editedBy ? `Endret av ${e.editedBy}${e.editedAt ? ` · ${new Date(e.editedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}` : ''}` : e.paidBy ? `Betalt av ${e.paidBy}` : '';
  return `<div class="sheet-bg" data-b30="entx"></div><div class="pp-sheet b30-sheet" role="dialog" aria-modal="true" aria-label="Utgift">
    <span class="pp-grab" aria-hidden="true"></span>
    <div class="b30-hd"><div class="m-grow"><span class="pp-lab">${esc(d.name.toUpperCase())} · ${rv ? 'TIL GJENNOMGANG' : 'GODKJENT'}</span><input class="b30-mer" id="b30-mer" data-b30in="merchant" value="${esc(mer)}" aria-label="Butikk eller beskrivelse" maxlength="120" ${ro ? 'readonly' : ''}></div>${sheetBtn('Ferdig', 'pri', 'data-b30="entx"')}</div>
    <div class="b30-body">${e.receiptId ? `<a class="b30-img" href="/finans/api/folders/${d.id}/receipts/${esc(e.receiptId)}/file" target="_blank" rel="noopener" style="background-image:url('/finans/api/folders/${d.id}/receipts/${esc(e.receiptId)}/thumb')" aria-label="Åpne kvitteringen"></a>` : '<span class="b30-img none">Ingen kvittering</span>'}
      <div class="b30-f"><label class="b30-amtl"><input id="b30-amt" data-b30in="amount" value="${esc(amt)}" inputmode="decimal" placeholder="0" aria-label="Beløp" ${ro ? 'readonly' : ''}><span>kr</span></label>
        <label class="b30-date">Dato<input type="date" id="b30-date" data-b30in="date" value="${esc(date)}" ${ro ? 'readonly' : ''}></label>
        <span class="pp-mut b30-who">${B30.saving ? 'Lagrer …' : esc(who)}</span>${e.aiShort ? `<span class="b30-ai">✦ ${esc(e.aiShort)}</span>` : ''}</div></div>
    <span class="pp-mut b30-l">Kategori</span>
    <select class="sinp p16-inp" data-b30in="categoryId" ${ro ? 'disabled' : ''}>${opts.map(([cid, n]) => `<option value="${esc(cid)}"${String(e.categoryId) === String(cid) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
    ${H?.length ? `<div class="b30-hist"><span class="pp-lab">HISTORIKK</span>${H.slice(0, 5).map((h) => `<span class="pp-mut">${esc(new Date(h.at).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · endret av ${esc(h.you ? 'deg' : h.by)}${h.changes ? ` · ${esc(Object.keys(h.changes).map((k) => ({ merchant: 'butikk', amount: 'beløp', date: 'dato', category: 'kategori' })[k] ?? k).join(', '))}` : ''}</span>`).join('')}</div>` : ''}
    ${ro ? '' : `<div class="b30-two big"><button type="button" class="pp-btn b30-del" data-b30="del" data-id="${e.id}">Slett</button><button type="button" class="pp-btn ink" data-b30="${rv ? 'ok' : 'entx'}" data-id="${e.id}">${rv ? 'Godkjenn' : 'Lagre'}</button></div>`}</div>`;
}
async function save(fid, id, body) {
  B30.saving = true;
  try { BO.d[fid] = await api(`/folders/${fid}/entries/${id}`, { method: 'PATCH', json: body }); B30.hist[id] = null; histLoad(fid, id); }
  catch (err) { flash(err.message, 'err'); }
  B30.saving = false; draw();
}
function queue(fid, id) {
  clearTimeout(B30.t);
  B30.t = setTimeout(() => {
    const E = B30.edit, body = {};
    if (E.merchant != null && E.merchant.trim()) body.merchant = E.merchant.trim();
    if (E.amount != null) { const a = parseAmount(E.amount); if (a != null) body.amount = Math.abs(a); }
    if (E.date) body.date = E.date;
    if (Object.keys(body).length) save(fid, id, body);
  }, 400);
}
async function histLoad(fid, id) {
  try { B30.hist[id] = await api(`/folders/${fid}/entries/${id}/history`); draw(); } catch { B30.hist[id] = []; }
}
function flush() {
  // Lukkes arket før 400 ms, lagres det som står i feltene med en gang.
  if (!B30.t) return;
  clearTimeout(B30.t); B30.t = null;
  const fid = bolId(), id = B30.ent, E = B30.edit, body = {};
  if (E.merchant != null && E.merchant.trim()) body.merchant = E.merchant.trim();
  if (E.amount != null) { const a = parseAmount(E.amount); if (a != null) body.amount = Math.abs(a); }
  if (E.date) body.date = E.date;
  if (fid && id && Object.keys(body).length) save(fid, id, body);
}

/* ---------- 3. Tilgang: Del boligen med brukere i Homelab ---------- */
const ROLES = [['owner', 'Eier'], ['uploader', 'Kan laste opp'], ['viewer', 'Kan se']];
async function shLoad(fid) {
  if (B30.sh[fid] !== undefined) return;
  B30.sh[fid] = null;
  try { B30.sh[fid] = await api(`/users/shareable?home=${fid}`); } catch (e) { B30.sh[fid] = e.status === 404 ? false : []; }
  draw();
}
export function accessTab(d) {
  shLoad(d.id);
  const mem = d.members ?? [], L = B30.sh[d.id];
  const members = `<div class="pp-card b30-mem"><span class="pp-lab">HAR TILGANG · ${mem.length}</span>${mem.map((x) => `<div class="b30-mr"><span class="b30-av sm" style="background:${esc(x.color || '#6b6558')}">${esc((x.name || '?').charAt(0).toUpperCase())}</span><span class="m-grow"><b>${esc(x.name)}${x.you ? ' <span class="pp-mut">(deg)</span>' : ''}</b></span><span class="pp-mut">${esc(x.roleName ?? '')}</span></div>`).join('')}</div>`;
  if (!d.isOwner) return `${members}<div class="pp-card"><span class="pp-mut">Bare eieren kan dele boligen med flere.</span></div>`;
  const sel = B30.sel.filter((id) => (L || []).some((u) => u.id === id)), names = sel.map((id) => L.find((u) => u.id === id)?.name ?? '');
  const btn = sel.length === 0 ? 'Send invitasjon' : sel.length === 1 ? `Del med ${names[0]}` : sel.length === 2 ? `Del med ${names[0]} og ${names[1]}` : `Del med ${sel.length} personer`;
  const grid = L === null ? '<div class="m-spin"></div>' : L === false ? '<span class="pp-mut">Serveren kan ikke vise brukerne ennå. Oppdater Homelab.</span>'
    : L.length ? `<div class="b30-grid">${L.map((u) => { const on = sel.includes(u.id); return `<button type="button" class="b30-u${on ? ' on' : ''}" data-b30="pick" data-id="${esc(u.id)}" aria-pressed="${on}">${u.avatarUrl ? `<span class="b30-av img" style="background-image:url('${esc(u.avatarUrl)}')"></span>` : `<span class="b30-av" style="background:${esc(u.color || '#6b6558')}">${esc(u.initial || (u.name || '?').charAt(0))}</span>`}<b class="m-ell">${esc(u.name)}</b><span class="pp-mut m-ell">${esc(u.relation ?? '')}</span><span class="b30-ck" aria-hidden="true">${CHECK}</span></button>`; }).join('')}</div>`
    : '<span class="pp-mut">Alle brukerne har allerede tilgang.</span>';
  return `${members}<form class="pp-card b30-share" data-b30form="share"><b class="pp-serif b30-h">Del boligen</b>
    <span class="pp-lab">BRUKERE I HOMELAB</span>${grid}
    <span class="pp-lab">ROLLE</span><div class="b30-roles">${ROLES.map(([k, n]) => `<button type="button" data-b30="role" data-k="${k}" aria-pressed="${B30.role === k || (k === 'uploader' && B30.role === 'editor')}">${n}</button>`).join('')}</div>
    ${sel.length ? '' : `<input class="sinp p16-inp" type="email" data-b30in="email" value="${esc(B30.email)}" placeholder="Eller e-post til noen utenfor Homelab" autocomplete="off">`}
    <button type="submit" class="pp-btn ink b30-go" ${B30.busy ? 'disabled' : ''}>${B30.busy ? 'Deler …' : esc(btn)}</button></form>`;
}
async function share(fid) {
  const L = B30.sh[fid] || [], sel = B30.sel.filter((id) => L.some((u) => u.id === id));
  const role = B30.role === 'uploader' ? 'editor' : B30.role;
  if (!sel.length && !B30.email.trim()) { flash('Velg noen å dele med, eller skriv en e-post'); return; }
  B30.busy = true; draw();
  try {
    if (sel.length) BO.d[fid] = await api(`/folders/${fid}/members`, { method: 'POST', json: { userIds: sel, role } });
    else BO.d[fid] = await api(`/folders/${fid}/invite`, { method: 'POST', json: { emails: [B30.email.trim()] } });
    const n = sel.length; B30.sel = []; B30.email = ''; delete B30.sh[fid];
    flash(n ? `Delt med ${n === 1 ? (L.find((u) => u.id === sel[0])?.name ?? '1 person') : `${n} personer`} ✓` : 'Invitasjon lagt til ✓');
  } catch (e) { flash(e.message, 'err'); }
  B30.busy = false; draw();
}

/* ---------- Hendelser ---------- */
export function leave30b() { flush(); B30.ent = null; B30.edit = {}; }
export function input30b(e, t) {
  const k = t.dataset?.b30in;
  if (!k) return false;
  if (k === 'email') { B30.email = t.value; return true; }
  if (k === 'categoryId') return false; // change-hendelsen
  const fid = bolId(), id = B30.ent; if (!fid || !id) return true;
  B30.edit[k] = t.value; queue(fid, id);
  return true;
}
export async function change30b(e, t) {
  if (t.dataset?.b30in !== 'categoryId') return false;
  const fid = bolId(), id = B30.ent; if (!fid || !id) return true;
  await save(fid, id, { categoryId: +t.value }); return true;
}
export async function bind30b(e, t) {
  if (e.type === 'submit' && t.matches?.('[data-b30form="share"]')) { e.preventDefault(); await share(bolId()); return true; }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-b30]');
  if (!x) return false;
  e.preventDefault(); e.stopPropagation();
  const a = x.dataset.b30, fid = bolId(), id = +x.dataset.id || null;
  if (a === 'ent') { flush(); B30.ent = id; B30.edit = {}; draw(); if (fid) histLoad(fid, id); return true; }
  if (a === 'entx') { flush(); B30.ent = null; B30.edit = {}; hapLight(); draw(); return true; }
  if (a === 'cat') { await save(fid, id, { categoryId: +x.dataset.c }); return true; }
  if (a === 'ok') { flush(); await save(fid, id, { status: 'ok' }); B30.ent = null; B30.edit = {}; flash('Godkjent ✓'); return true; }
  if (a === 'del') {
    if (!confirm('Slette utgiften?')) return true;
    try { await api(`/folders/${fid}/entries/${id}`, { method: 'DELETE' }); BO.d[fid] = await api(`/folders/${fid}`); B30.ent = null; flash('Utgiften er slettet'); } catch (err) { flash(err.message, 'err'); }
    draw(); return true;
  }
  if (a === 'pick') { const k = x.dataset.id; B30.sel = B30.sel.includes(k) ? B30.sel.filter((y) => y !== k) : [...B30.sel, k]; navigator.vibrate?.(8); draw(); return true; }
  if (a === 'role') { B30.role = x.dataset.k; draw(); return true; }
  return false;
}
// Datoen kommer i formatet til <input type="date">; dd() brukes i listene.
export const shortDate = (s) => dd(s);

/* =====================================================================
   Kvitteringsmarkering (claude-code-kvittering-highlight.md, fasit tx1.hasHl / hlScroll)
   ===================================================================== */
// Åpnes en transaksjon fra Søk (eller Liste med søketekst), sendes søkeordet med (?hl=tomat). Serveren svarer med
// receipt.highlight {lineIndex[], matchedText, hasBoxes}. Linjene markeres gult, ordet sterkere, siden scroller til
// første linje og den pulserer to ganger. Har bildet posisjoner (bbox i %), tegnes gule rektangler over bildet.
export const HL = { q: '', off: {}, done: {}, busy: {} };
const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const terms = (q) => fold(q).split(/[^\p{L}\p{N}&+]+/u).filter((w) => w.length >= 2);
/** Linjeteksten med søkeordet markert (som en markeringstusj). Uavhengig av store/små bokstaver og aksenter. */
export function markWord(text, q, matched) {
  const t = String(text ?? ''), f = fold(t), cand = [...terms(matched), ...terms(q)];
  for (const w of cand) {
    const i = f.indexOf(w);
    if (i < 0 || f.length !== t.length) continue;
    let j = i + w.length; while (j < t.length && /[\p{L}\p{N}]/u.test(t[j])) j++;
    return `${esc(t.slice(0, i))}<mark class="p30-mk">${esc(t.slice(i, j))}</mark>${esc(t.slice(j))}`;
  }
  return esc(t);
}
const price = (v) => (v == null ? '' : `${Math.abs(Number(v)).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`);
/** Info om markeringen for en transaksjon, eller null. */
export function hlInfo(id, t) {
  const h = t?.receipt?.highlight;
  if (!h || HL.off[id] || !h.lineIndex?.length) return null;
  return h;
}
/** Gult banner over kvitteringen. lines = r.lines (med opprinnelig indeks). */
export function hlBanner(id, t) {
  const h = hlInfo(id, t);
  if (!h) return '';
  const L = t.receipt.lines ?? [], i0 = h.lineIndex[0], l0 = L[i0], more = h.lineIndex.length - 1;
  const word = h.query || h.matchedText;
  const reread = !h.hasBoxes && t.receipt.id && !/pdf/i.test(t.receipt.mime ?? '') ? `<button type="button" class="p30-hlre" data-b30hl="reread" data-id="${esc(t.receipt.id)}" ${HL.busy[id] ? 'disabled' : ''}>${HL.busy[id] ? 'Leser …' : 'Les kvitteringen på nytt'}</button>` : '';
  return `<div class="p30-hlb" role="status"><span class="p30-hlsq" aria-hidden="true"></span><button type="button" class="p30-hlt" data-b30hl="go">‹${esc(word)}› står på linje ${i0 + 1}${l0?.price != null ? ` · ${esc(price(l0.price))}` : ''}${more > 0 ? ` <span>og ${more} til</span>` : ''}</button><button type="button" class="p30-hlx" data-b30hl="clr">Fjern</button></div>${reread ? `<div class="p30-hlrw"><span class="pp-mut">Kvitteringen mangler posisjoner, så bare linjene er markert.</span>${reread}</div>` : ''}`;
}
/** Bildet med gule rektangler over linjene som matcher (bare når bbox finnes). */
export function hlImage(id, t) {
  const h = hlInfo(id, t), r = t?.receipt;
  if (!h || !h.hasBoxes || !r?.fileUrl || /pdf/i.test(r.mime ?? '')) return '';
  const boxes = h.lineIndex.map((i) => r.lines?.[i]?.bbox).filter(Boolean);
  if (!boxes.length) return '';
  return `<div class="p30-rcimg" data-p30rcimg><div class="p30-rcin"><img src="${esc(r.fileUrl)}" alt="Kvitteringen med treffet markert">${boxes.map(([x, y, w, hh], k) => `<i class="p30-bb"${k ? '' : ' data-p30bb="1"'} style="left:${x}%;top:${y}%;width:${w}%;height:${hh}%"></i>`).join('')}</div></div>`;
}
function hlScroll(id) {
  setTimeout(() => {
    const img = document.querySelector('#app [data-p30rcimg]'), bb = img?.querySelector('[data-p30bb]');
    if (img && bb) { const go = () => { img.scrollTop = Math.max(0, bb.offsetTop - img.clientHeight / 2 + bb.offsetHeight / 2); }; const im = img.querySelector('img'); if (im?.complete) go(); else im?.addEventListener('load', go, { once: true }); }
    const el = document.querySelector('#app [data-p30hl="1"]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, scrollY + r.top - innerHeight / 2 + r.height / 2), behavior: 'smooth' });
    el.animate?.([{ boxShadow: '0 0 0 0 rgba(224,168,0,.7)' }, { boxShadow: '0 0 0 10px rgba(224,168,0,0)' }], { duration: 900, iterations: 2 });
  }, 280);
}
/** Etter tegning: scroll til første treff én gang per åpning. */
export function hlAfter() {
  if (!m.detail || m.sel == null) return;
  const id = m.sel;
  if (HL.done[id] || !document.querySelector('#app [data-p30hl="1"]')) return;
  HL.done[id] = true; hlScroll(id);
}
export function hlOpen(id, q) { HL.q = String(q ?? '').trim(); delete HL.done[id]; delete HL.off[id]; }
export async function hlBind(e, t, { TX, txLoad }) {
  const x = t.closest?.('[data-b30hl]');
  if (!x) return false;
  e.preventDefault(); e.stopPropagation();
  const id = m.sel, a = x.dataset.b30hl;
  if (a === 'go') hlScroll(id);
  else if (a === 'clr') { HL.off[id] = true; draw(); }
  else if (a === 'reread') {
    HL.busy[id] = true; draw();
    try { await api(`/receipts/${encodeURIComponent(x.dataset.id)}/reread`, { method: 'POST' }); flash('✦ Leser kvitteringen på nytt …'); }
    catch (err) { flash(err.status === 404 ? 'Serveren kan ikke lese kvitteringen på nytt ennå.' : err.message, 'err'); HL.busy[id] = false; draw(); return true; }
    // Tolkningen går i bakgrunnen: hent transaksjonen på nytt etter en stund.
    for (const ms of [6000, 15000, 30000]) setTimeout(async () => { if (m.sel !== id) return; await txLoad(id, true, HL.q); HL.busy[id] = !TX.d[id]?.receipt?.highlight?.hasBoxes && ms < 30000; draw(); }, ms);
  }
  return true;
}
