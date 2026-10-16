import { esc, kr, cap, api, makeThumb, parseNum, isMobile } from './util.js';
import { store, widget, card, refresh, emit, on } from './store.js';

const view = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), filter: '', q: '' };

export const catColor = (name) => store.me.categories.find((c) => c.name === name)?.color ?? '#8a93a6';
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const monthReceipts = (d) => (store.receipts ?? []).filter((r) => r.date.startsWith(ym(d)));

export async function loadReceipts() {
  try { store.receipts = await api('/receipts'); } catch { store.receipts = store.receipts ?? []; }
  emit('receipts');
}

async function patch(id, fields) {
  const r = await api(`/receipts/${id}`, { method: 'PATCH', json: fields });
  store.receipts = store.receipts.map((x) => (x.id === id ? r : x));
  emit('receipts');
}

export async function uploadFiles(files) {
  for (const f of files) {
    const fd = new FormData();
    fd.append('file', f);
    const t = await makeThumb(f);
    if (t) fd.append('thumb', t, 'thumb.jpg');
    fd.append('store', f.name.replace(/\.[^.]+$/, '').slice(0, 60));
    fd.append('category', 'Annet');
    try {
      const r = await api('/receipts', { method: 'POST', body: fd });
      store.receipts = [r, ...store.receipts];
    } catch (e) { alert(`Kunne ikke laste opp ${f.name}: ${e.message}`); }
  }
  emit('receipts');
}

const totals = () => {
  const list = monthReceipts(view.month);
  const total = list.reduce((a, r) => a + r.amount, 0);
  const sums = store.me.categories.map((c) => ({ ...c, sum: list.filter((r) => r.category === c.name).reduce((a, r) => a + r.amount, 0) }));
  return { list, total, sums, max: Math.max(...sums.map((s) => s.sum), 1) };
};

widget('e_budget', { render() {
  const { total } = totals(), b = store.me.budget, left = b - total;
  return `<div class="card-title">Månedsbudsjett</div>
    <div class="sub"><b style="font-size:44px;font-weight:300;color:var(--text)">${kr(total)}</b> brukt</div>
    <div class="bar" style="height:12px"><i style="width:${Math.min(100, b ? (total / b) * 100 : 0)}%"></i></div>
    <label class="sub" style="display:flex;justify-content:space-between;align-items:center;font-size:14px">Budsjett<input class="field mono" id="budget" inputmode="numeric" value="${b}" style="width:110px;text-align:right"></label>
    <div style="font-size:14px;color:${left >= 0 ? 'var(--green)' : 'var(--red)'}">${left >= 0 ? `${kr(left)} igjen denne måneden` : `${kr(-left)} over budsjett`}</div>`;
} });

widget('e_cats', { cls: 'card span2', render() {
  const { sums, max } = totals();
  return `<div class="card-title">Per kategori</div>${sums.map((c) => `<button class="cat-bar" data-cat="${esc(c.name)}" aria-pressed="${view.filter === c.name}"><span>${esc(c.name)}</span><span class="bar"><i style="width:${(c.sum / max) * 100}%;background:${c.color}"></i></span><span class="mono sub" style="text-align:right">${kr(c.sum)}</span></button>`).join('')}`;
} });

// Mobil: sammendrag med kategori-chips.
widget('e_summary_m', { render() {
  const { total, sums } = totals(), b = store.me.budget;
  return `<div class="sub" style="font-size:14px"><b style="font-size:38px;font-weight:300;color:var(--text)">${kr(total)}</b> av ${kr(b)}</div>
    <div class="bar"><i style="width:${Math.min(100, b ? (total / b) * 100 : 0)}%"></i></div>
    <div class="hscroll" style="gap:6px;margin-top:4px">${sums.map((c) => `<button class="chip" data-cat="${esc(c.name)}" style="flex:0 0 auto;display:flex;gap:6px;align-items:center;border-color:${view.filter === c.name ? c.color : 'var(--line)'}"><span style="width:8px;height:8px;border-radius:2px;background:${c.color}"></span>${esc(c.name)} <span class="muted">${kr(c.sum)}</span></button>`).join('')}</div>`;
} });

widget('e_list', { cls: () => (isMobile() ? 'card m-list' : 'card'), render() {
  const cats = store.me.categories;
  const list = monthReceipts(view.month).filter((r) => (!view.filter || r.category === view.filter) && r.store.toLowerCase().includes(view.q.toLowerCase()));
  const opts = (sel) => [...new Set([...cats.map((c) => c.name), sel])].map((n) => `<option${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const rows = list.map((r) => {
    const thumb = r.thumb ? `style="background-image:url('/api/files/${r.thumb}')"` : '';
    const ext = r.thumb ? '' : r.mime === 'application/pdf' ? 'PDF' : 'KVT';
    const date = r.date.split('-').reverse().join('.');
    return `<div class="receipt" data-id="${r.id}">
      ${r.file ? `<a class="thumb" href="/api/files/${r.file}" target="_blank" ${thumb}>${ext}</a>` : `<div class="thumb">${ext}</div>`}
      <div style="min-width:0"><input class="bare" data-f="store" value="${esc(r.store)}" aria-label="Butikk" style="font-size:15px">
        <div class="muted r-date" style="font-size:12px;display:flex;gap:6px;align-items:center"><span style="width:8px;height:8px;border-radius:2px;background:${catColor(r.category)}"></span><input type="date" class="bare muted" data-f="date" value="${r.date}" aria-label="Dato" style="width:auto;font-size:12px" title="${date}"></div></div>
      <select class="field r-cat" data-f="category" aria-label="Kategori" style="color:${isMobile() ? catColor(r.category) : 'var(--text)'}">${opts(r.category)}</select>
      <input class="field mono r-amount" data-f="amount" inputmode="decimal" value="${String(r.amount).replace('.', ',')}" aria-label="Beløp" style="width:90px;text-align:right">
      <button class="x" data-del="${r.id}" aria-label="Slett">×</button></div>`;
  }).join('');
  if (isMobile()) return rows || '<div class="empty" style="padding:12px">Ingen kvitteringer matcher.</div>';
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div class="card-title" style="flex:1">Kvitteringer</div>
      <input class="search" id="q" placeholder="Søk butikk…" value="${esc(view.q)}" aria-label="Søk">
      <select class="search" id="filter" style="min-width:0" aria-label="Kategori"><option value="">Alle kategorier</option>${cats.map((c) => `<option${view.filter === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div id="rlist" style="display:flex;flex-direction:column;gap:14px">${rows || '<div class="empty" style="padding:12px">Ingen kvitteringer matcher.</div>'}</div>`;
} });

export function render() {
  const mob = isMobile();
  const month = `${cap(view.month.toLocaleDateString('nb-NO', { month: 'long' }))} ${view.month.getFullYear()}`;
  const nav = `<span style="display:inline-flex;gap:6px;align-items:center"><button class="chip" data-month="-1" aria-label="Forrige måned">‹</button>${month}<button class="chip" data-month="1" aria-label="Neste måned">›</button></span>`;
  const uploadInput = (cls, label, cap) => `<label class="${cls}">${label}<input type="file" accept="image/*,application/pdf" multiple ${cap ? 'capture="environment"' : ''} data-upload hidden></label>`;
  if (mob) {
    return `<div class="page-title">Øko<b>nomi</b></div><div class="sub" style="padding:0 4px">${nav}</div>
      ${card('e_summary_m')}
      <input class="search" id="q" placeholder="Søk butikk…" value="${esc(view.q)}" aria-label="Søk" style="padding:14px 18px;background:rgba(11,14,21,.9)">
      ${card('e_list')}
      <a class="btn-lg" href="/api/receipts.csv" style="justify-content:center;padding:14px;font-size:15px">Eksporter CSV</a>
      ${uploadInput('fab', '+', true)}`;
  }
  return `<div style="display:flex;flex-direction:column;gap:20px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px"><div><div class="page-title">Økonomi<b>sentral</b></div><div class="sub">${nav}</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn-lg" href="/api/receipts.csv">Eksporter CSV</a>${uploadInput('btn-lg btn-primary', '+ Last opp kvittering', false)}</div></div>
    <div class="grid eco" data-dnd="eco">${card('e_budget')}${card('e_cats')}</div>
    ${card('e_list')}</div>`;
}

function refreshList() {
  // Søk/filter skal ikke tegne søkefeltet på nytt (fokus beholdes).
  const el = document.getElementById('rlist');
  if (el && !isMobile()) {
    const tmp = document.createElement('div');
    tmp.innerHTML = card('e_list');
    el.replaceWith(tmp.querySelector('#rlist'));
  } else refresh('e_list');
}

export function bind(root) {
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-upload]')) { await uploadFiles([...t.files]); t.value = ''; return; }
    if (t.id === 'budget') {
      const v = parseNum(t.value);
      store.me.budget = v;
      api('/settings/budget', { method: 'PUT', json: { value: v } });
      t.blur(); emit('receipts'); return;
    }
    if (t.id === 'filter') { view.filter = t.value; refreshList(); refresh('e_cats'); return; }
    const row = t.closest('.receipt');
    if (row && t.dataset.f) {
      const val = t.dataset.f === 'amount' ? parseNum(t.value) : t.value;
      try { await patch(+row.dataset.id, { [t.dataset.f]: val }); } catch (err) { alert(err.message); }
    }
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'q') { view.q = e.target.value; refreshList(); } });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.receipt input, #budget')) e.target.blur(); });
  root.addEventListener('click', async (e) => {
    const cat = e.target.closest('[data-cat]');
    if (cat) { view.filter = view.filter === cat.dataset.cat ? '' : cat.dataset.cat; refresh('e_cats', 'e_summary_m'); refreshList(); const f = document.getElementById('filter'); if (f) f.value = view.filter; return; }
    const m = e.target.closest('[data-month]');
    if (m) { view.month = new Date(view.month.getFullYear(), view.month.getMonth() + +m.dataset.month, 1); emit('route'); return; }
    const del = e.target.closest('[data-del]');
    if (del && confirm('Slette kvitteringen?')) {
      const id = +del.dataset.del;
      await api(`/receipts/${id}`, { method: 'DELETE' });
      store.receipts = store.receipts.filter((r) => r.id !== id);
      emit('receipts');
    }
  });
}

on('receipts', () => { refresh('e_budget', 'e_cats', 'e_summary_m'); refreshList(); });
