// Prompt 48 (WEB48, Del 5): skjemaet for kvitteringer som er lest av den nye kjeden (POST /finans/api/receipts/scan,
// source «scan48»). Brukes av FinansHub på desktop (desktop.js confirmPanel) og PWA-en (mobile-p23.js, Kvitteringer).
//   - merkelapp for veien kvitteringen tok («iPhone», «Mac», «Glimt (Tesseract)», «Gemini» …) fra extraction.receipt48.label
//   - usikre felt (uncertain_fields / failed_fields) markeres med «Usikker» på feltet
//   - redigerbare detaljer: klokkeslett, org.nr., betaling, varelinjer og rabatter, med sumkontroll mens du skriver
//   - stegene i kjeden (A/B/C/Tesseract/D) med status og tid
// Butikk, dato, total og kategori lagres som før (PATCH /receipts/:id + /book – serveren lagrer rettelsen ved bokføring).
// Endrer brukeren detaljene her, sendes hele kvitteringen i felles format til POST /receipts/:id/corrections før
// bokføringen (modellens svar + rettelsen lagres som testdata på serveren, aldri i repoet).
import { api, esc, n2, parseAmount } from './core.js';

const E = {}; // kvitterings-id → {items, discounts, time, org_number, payment_method, date, dirty}
let redraw = () => {};
export const setRedraw48 = (fn) => { redraw = fn; };

/** extraction.receipt48 for kvitteringer fra den nye kjeden, ellers null. */
export const meta48 = (R) => (R?.extraction?.receipt48 && typeof R.extraction.receipt48 === 'object' ? R.extraction.receipt48 : null);
export const is48 = (R) => !!meta48(R) || R?.source === 'scan48';

// Feltnavnene på serveren (felles format) → feltene i skjemaene.
const ALIAS = { category_suggestion: 'category', items: 'items', org_number: 'org_number', payment_method: 'payment_method' };
const uncSet = (R) => { const m = meta48(R); return new Set([...(m?.uncertain_fields ?? []), ...(m?.failed_fields ?? [])].map((f) => ALIAS[f] ?? f)); };
/** Er feltet usikkert? (merchant, date, total, items, vat, category, org_number, time) */
export const unc48 = (R, f) => uncSet(R).has(f);
export const uncTag48 = (R, f) => (unc48(R, f) ? '<span class="r48-unc-tag" title="Kontrollen på serveren var usikker på dette feltet">Usikker</span>' : '');
export const uncCls48 = (R, f) => (unc48(R, f) ? ' r48-unc' : '');

const ICON = {
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  mac: 'M4 5h16v11H4zM9 20h6M12 16v4',
  glimt: 'M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z',
  cloud: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z',
};
const ico = (d) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
/** Merkelappen for veien («iPhone», «Mac», «Glimt», «Gemini») – tom for kvitteringer fra den gamle kjeden. */
export function via48(R) {
  const m = meta48(R);
  if (!m?.label) return '';
  const l = m.label, d = /Gemini/.test(l) ? ICON.cloud : /Mac/.test(l) ? ICON.mac : /^(iPhone|Android)$/.test(l) ? ICON.phone : ICON.glimt;
  const why = { A: 'Tolket på telefonen og kontrollert av Glimt', B: 'Teksten ble lest på telefonen og tolket av den lokale modellen', C: 'Lest av Apple Vision på Mac mini-en og tolket av den lokale modellen', T: 'Lest av Tesseract på serveren og tolket av den lokale modellen', D: 'Lest av Gemini Flash (sky)' }[m.used] ?? '';
  return `<span class="r48-via" data-r48-via="${esc(l)}" title="${esc(why)}">${ico(d)}${esc(l)}</span>`;
}
const CONF = { high: 'Høy sikkerhet', medium: 'Middels sikkerhet', low: 'Lav sikkerhet' };
const STEP = { ok: '✓', failed: '!', error: '!', unavailable: '–', skipped: '·', compare: '=' };
const STAT = { ok: 'Besto', failed: 'Besto ikke kontrollen', error: 'Feil', unavailable: 'Utilgjengelig', skipped: 'Hoppet over', compare: 'Bare sammenligning' };
const FIELD_NO = { merchant: 'butikk', date: 'dato', total: 'total', items: 'varelinjer', vat: 'mva', category: 'kategori', org_number: 'org.nr.', time: 'klokkeslett', schema: 'format' };
const sec = (ms) => (ms == null || !ms ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? '' : (+v).toFixed(2).replace('.', ','));

function base(R) {
  const m = meta48(R), mr = m?.model_receipt, ex = R.extraction ?? {};
  if (mr && typeof mr === 'object') return { ...mr, items: (mr.items ?? []).map((x) => ({ ...x })), discounts: (mr.discounts ?? []).map((x) => ({ ...x })) };
  return { merchant: R.merchant ?? '', org_number: ex.org_number ?? null, date: R.date ?? '', time: ex.time ?? null, currency: ex.currency ?? 'NOK',
    items: (ex.lines ?? []).map((l) => ({ description: l.description ?? l.name ?? '', quantity: l.quantity ?? null, unit_price: l.unitPrice ?? null, amount: +l.amount || 0 })),
    discounts: (ex.discounts ?? []).map((d) => ({ description: d.description ?? d.text ?? 'Rabatt', amount: -Math.abs(+d.amount || 0) })), subtotal: ex.subtotal ?? null,
    vat: ex.vat ?? [], total: R.total ?? 0, payment_method: ex.payment_method ?? null, category_suggestion: ex.suggested_category ?? '' };
}
const st = (R) => (E[R.id] ??= (() => { const b = base(R); return { items: b.items, discounts: b.discounts, time: b.time ?? '', org_number: b.org_number ?? '', payment_method: b.payment_method ?? '', date: null, dirty: false }; })());

function sumLine(R, s, total) {
  const sum = s.items.reduce((a, x) => a + (+x.amount || 0), 0) + s.discounts.reduce((a, x) => a + (+x.amount || 0), 0);
  if (!s.items.length) return '<span class="r48-sum bad" data-r48-sum>Ingen varelinjer lest</span>';
  if (total == null) return `<span class="r48-sum" data-r48-sum>Linjene summerer ${n2(sum)} kr</span>`;
  const ok = Math.abs(sum - total) <= 1;
  return `<span class="r48-sum ${ok ? 'ok' : 'bad'}" data-r48-sum>${ok ? `Linjene stemmer med totalen (${n2(total)} kr) ✓` : `Linjene summerer ${n2(sum)} kr, totalen er ${n2(total)} kr`}</span>`;
}

/**
 * Skjemaet. opts: {done (bokført/avvist → skrivebeskyttet), head:false (verten viser merkelapp og sikkerhet selv), has: felt verten selv viser (standard merchant, date, total, category),
 *   total: totalen slik den står i vertens felt nå}
 */
export function form48(R, opts = {}) {
  const m = meta48(R);
  if (!m) return '';
  const s = st(R), dis = opts.done ? ' disabled' : '', id = esc(R.id), has = new Set(opts.has ?? ['merchant', 'date', 'total', 'category']);
  const U = uncSet(R), unc = [...U].filter((f) => FIELD_NO[f]).map((f) => FIELD_NO[f]);
  const total = opts.total ?? R.total;
  const fld = (k, label, val, extra = '') => `<label class="r48-f${uncCls48(R, k)}"><span class="r48-lbl"><span>${label}${uncTag48(R, k)}</span></span><input data-r48f="${k}" data-id="${id}" value="${esc(val ?? '')}"${extra}${dis}></label>`;
  const dateF = has.has('date') ? '' : fld('date', 'Dato', s.date ?? R.date ?? '', ' type="date"');
  const items = s.items.map((x, i) => `<div class="r48-it"><input data-r48f="it-d" data-i="${i}" data-id="${id}" value="${esc(x.description ?? '')}" aria-label="Vare ${i + 1}"${dis}><input data-r48f="it-q" data-i="${i}" data-id="${id}" value="${esc(x.quantity ?? '')}" inputmode="decimal" aria-label="Antall"${dis}><input data-r48f="it-a" data-i="${i}" data-id="${id}" value="${esc(num(x.amount))}" inputmode="decimal" class="mono" aria-label="Beløp"${dis}>${opts.done ? '<span></span>' : `<button type="button" class="r48-x" data-r48="rm" data-i="${i}" data-id="${id}" aria-label="Fjern linjen">×</button>`}</div>`).join('');
  const disc = s.discounts.map((x, i) => `<div class="r48-it"><input data-r48f="dc-d" data-i="${i}" data-id="${id}" value="${esc(x.description ?? '')}" aria-label="Rabatt ${i + 1}"${dis}><span></span><input data-r48f="dc-a" data-i="${i}" data-id="${id}" value="${esc(num(x.amount))}" inputmode="decimal" aria-label="Rabattbeløp (negativt)"${dis}>${opts.done ? '<span></span>' : `<button type="button" class="r48-x" data-r48="rmd" data-i="${i}" data-id="${id}" aria-label="Fjern rabatten">×</button>`}</div>`).join('');
  const steps = (m.pipeline ?? []).map((p) => `<div class="r48-step"><span class="r48-st ${esc(p.status)}" aria-hidden="true">${STEP[p.status] ?? '·'}</span><span><b>${esc(p.step === 'T' ? 'Tesseract' : p.step)} · ${esc(p.name ?? '')}</b></span><span class="m">${esc(sec(p.ms))}</span>
    <span class="s">${esc([STAT[p.status] ?? p.status, p.engine && p.engine !== 'gemini' ? p.engine.replace('_', ' ') : '', p.model ?? '', p.reason ?? '', p.error ?? '', p.failed_fields?.length ? `feilet: ${p.failed_fields.map((f) => FIELD_NO[f] ?? f).join(', ')}` : ''].filter(Boolean).join(' · '))}</span></div>`).join('');
  const cmp = m.compare && m.compare.agree === false ? `<div class="r48-warn">Telefonen leste totalen som ${n2(m.compare.device)} kr, Mac-OCR som ${n2(m.compare.mac)} kr.${m.compare.chosen ? ` Brukte ${m.compare.chosen === 'mac' ? 'Mac' : 'telefonen'} (stemmer med varelinjene).` : ' Sjekk totalen.'}</div>` : '';
  return `<div class="r48" data-r48-form="${id}"${total != null ? ` data-total="${esc(total)}"` : ''}>
    ${opts.head === false ? '' : `<div class="r48-hd">${via48(R)}${m.confidence ? `<span class="r48-conf ${esc(m.confidence)}">${CONF[m.confidence] ?? esc(m.confidence)}</span>` : ''}${m.seconds ? `<span class="r48-sec">${sec(Math.round(m.seconds * 1000))}</span>` : ''}</div>`}
    ${unc.length && !opts.done ? `<div class="r48-warn" data-r48-unc>Sjekk ${unc.join(', ')} – kontrollen var usikker. Rett feltene merket «Usikker» før du bokfører.</div>` : ''}${cmp}
    <div class="r48-grid">${dateF}${fld('time', 'Klokkeslett', s.time, ' inputmode="numeric" placeholder="TT:MM" maxlength="5"')}${fld('org_number', 'Org.nr.', s.org_number, ' inputmode="numeric" placeholder="9 siffer" maxlength="11"')}${fld('payment_method', 'Betaling', s.payment_method, ' maxlength="30" placeholder="BankAxept, Visa …"')}</div>
    <div class="r48-items${uncCls48(R, 'items')}"><div class="r48-it r48-ith"><span>VARELINJER${uncTag48(R, 'items')}</span><span>ANT.</span><span>BELØP</span><span></span></div>${items || '<div class="r48-note">Ingen varelinjer lest.</div>'}
      ${opts.done ? '' : `<button type="button" class="r48-add" data-r48="add" data-id="${id}">+ Varelinje</button>`}
      ${disc ? `<div class="r48-it r48-ith"><span>RABATTER</span><span></span><span></span><span></span></div>${disc}` : ''}${opts.done || disc ? '' : `<button type="button" class="r48-add" data-r48="addd" data-id="${id}">+ Rabatt</button>`}
      ${sumLine(R, s, total)}</div>
    ${s.dirty && !opts.done ? '<div class="r48-note" data-r48-dirty>Rettelsene lagres når du bokfører, som eksempler som gjør lesingen bedre.</div>' : ''}
    ${steps ? `<details><summary>Veien kvitteringen tok (${(m.pipeline ?? []).length} steg)</summary><div class="r48-steps">${steps}</div></details>` : ''}</div>`;
}

const toNum = (v) => { const n = parseAmount(v); return n == null ? null : Math.round(n * 100) / 100; };
function onInput(e) {
  const t = e.target, k = t?.dataset?.r48f;
  if (!k) return;
  const R = { id: t.dataset.id }, s = E[R.id];
  if (!s) return;
  const i = +t.dataset.i;
  if (k === 'it-d') s.items[i].description = t.value;
  else if (k === 'it-q') s.items[i].quantity = t.value.trim() ? toNum(t.value) : null;
  else if (k === 'it-a') s.items[i].amount = toNum(t.value) ?? 0;
  else if (k === 'dc-d') s.discounts[i].description = t.value;
  else if (k === 'dc-a') s.discounts[i].amount = -Math.abs(toNum(t.value) ?? 0);
  else s[k] = t.value;
  s.dirty = true;
  // Sumkontrollen oppdateres uten ny tegning (fokus og markør står).
  const box = t.closest('[data-r48-form]'), line = box?.querySelector('[data-r48-sum]');
  if (line) {
    const hostTot = document.querySelector('[data-rc-field="total"]')?.value ?? document.getElementById(`p23-rv-${R.id}`)?.value;
    const tot = hostTot != null ? toNum(hostTot) : box.dataset.total ? +box.dataset.total : null;
    const h = document.createElement('span'); h.innerHTML = sumLine(R, s, tot); line.replaceWith(h.firstChild);
  }
  e.stopPropagation();
}
function onClick(e) {
  const b = e.target.closest?.('[data-r48]');
  if (!b) return;
  const s = E[b.dataset.id];
  if (!s) return;
  e.preventDefault(); e.stopPropagation();
  const i = +b.dataset.i, a = b.dataset.r48;
  if (a === 'add') s.items.push({ description: '', quantity: null, unit_price: null, amount: 0 });
  else if (a === 'addd') s.discounts.push({ description: 'Rabatt', amount: 0 });
  else if (a === 'rm') s.items.splice(i, 1);
  else if (a === 'rmd') s.discounts.splice(i, 1);
  s.dirty = true;
  redraw();
  if (a === 'add') requestAnimationFrame(() => { const all = document.querySelectorAll(`[data-r48-form="${CSS.escape(b.dataset.id)}"] [data-r48f="it-d"]`); all[all.length - 1]?.focus(); });
}
let bound = false;
export function bind48() {
  if (bound) return; bound = true;
  if (!document.getElementById('r48-css')) { const l = document.createElement('link'); l.id = 'r48-css'; l.rel = 'stylesheet'; l.href = `/assets/css/receipts48.css${new URL(import.meta.url).search}`; document.head.appendChild(l); }
  document.addEventListener('input', onInput, true);
  document.addEventListener('click', onClick, true);
}

/**
 * Før bokføring: er detaljene endret, sendes hele kvitteringen (felles format) til /corrections. Dato fra skjemaet (når verten
 * ikke har eget datofelt) lagres med PATCH. → {sent, date?, fields?} – feiler aldri bokføringen (feil gir {error}).
 * cur: {merchant, date, total, category} slik verten har dem nå.
 */
export async function flush48(R, cur = {}) {
  const s = E[R?.id];
  if (!s || !s.dirty || !meta48(R)) return { sent: false };
  const b = base(R), out = {};
  try {
    if (s.date && s.date !== R.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date)) { await api(`/receipts/${R.id}`, { method: 'PATCH', json: { date: s.date } }); out.date = s.date; }
    const items = s.items.filter((x) => String(x.description ?? '').trim() || +x.amount).map((x) => ({ description: String(x.description ?? '').trim() || 'Vare', quantity: x.quantity ?? null, unit_price: x.unit_price ?? null, amount: +x.amount || 0 }));
    const receipt = { ...b, merchant: cur.merchant ?? R.merchant ?? b.merchant, date: out.date ?? cur.date ?? R.date ?? b.date, total: cur.total ?? R.total ?? b.total,
      time: /^\d{1,2}[:.]\d{2}$/.test(s.time.trim()) ? s.time.trim().replace('.', ':').padStart(5, '0') : null, org_number: s.org_number.replace(/\D/g, '') || null, payment_method: s.payment_method.trim() || null,
      items, discounts: s.discounts.filter((x) => +x.amount).map((x) => ({ description: String(x.description ?? '').trim() || 'Rabatt', amount: -Math.abs(+x.amount) })),
      ...(cur.category ? { category_suggestion: cur.category } : {}) };
    const r = await api(`/receipts/${R.id}/corrections`, { method: 'POST', json: { receipt } });
    delete E[R.id];
    return { sent: !!r?.saved, fields: r?.fields ?? [], ...out };
  } catch (e) {
    return { sent: false, error: e.status === 404 || e.status === 405 ? null : e.message, ...out };
  }
}
/** Glem ulagrede endringer (f.eks. etter «Les på nytt»). */
export const reset48 = (id) => { delete E[id]; };
export const _e48 = E;
