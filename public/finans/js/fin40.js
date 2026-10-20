// Prompt 40 (WEB40) – FinansHub på web:
// - «Lagt til»-linjen nederst i transaksjonen og kvitteringen (claude-code-finans-lagt-til.md): added:{at, by, byName, source, sourceLabel}
//   (eller created_at/created_by/created_via) og «Sist endret …» fra history/updated_at.
// - «Rediger alt» med varelinjer, live sumkontroll og «Tilbakestill til slik Glimt leste den», og «✦ La Glimt lese kvitteringen
//   på nytt» (claude-code-finans-les-pa-nytt-rediger.md). Lagres med PATCH /finans/api/transactions/:id (alle felt + lines).
// - Søk: Glimt svarer med ryddige kort (claude-code-finans-sok-glimt-kort.md): POST /finans/api/search/ask {q} →
//   {text, source, cards:[{kind:'sub'|'tx'|'receipt'|'budget'|'stat', …}], items, total?, open?} (tåler også
//   {summary, kpis, items, action}). 404 → vanlig AI-søk som før.
import { api, esc, n2 } from './core.js';

/* ---------------- Lagt til ---------------- */

const TZ = 'Europe/Oslo';
/** «16.10.2026 kl. 17.46» i Europe/Oslo. */
export function whenTxt(at) {
  const d = new Date(at);
  if (Number.isNaN(+d)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} kl. ${p.hour}.${p.minute}`;
}
const SRC = { scan: 'skannet kvittering', bank: 'bankimport', bank_import: 'bankimport', manual: 'lagt inn manuelt', email: 'fra e-post', import: 'importert fil', glimt: 'lagt til av Glimt fra chat', shortcut: 'via iOS Snarvei', api: 'via API-nøkkel' };
/** added-objektet uansett hvordan serveren sender det (added:{…} eller created_*). */
export function addedOf(x) {
  if (!x) return null;
  const a = x.added ?? {};
  const at = a.at ?? x.createdAt ?? x.created_at ?? null;
  if (!at) return null;
  return { at, by: a.by ?? x.createdBy ?? x.created_by ?? null, byName: a.byName ?? x.createdByName ?? null, source: a.source ?? x.createdVia ?? x.created_via ?? (x.source === 'receipt' ? 'scan' : x.source === 'bank' ? 'bank' : null), sourceLabel: a.sourceLabel ?? x.sourceLabel ?? null };
}
/** Én dempet, sentrert linje (+ «Sist endret …» når den er endret etterpå). */
export function addedLine(x) {
  const a = addedOf(x);
  const h = Array.isArray(x?.history) && x.history.length ? x.history[x.history.length - 1] : null;
  const upAt = h?.at ?? x?.updatedAt ?? x?.updated_at ?? null, upBy = h?.byName ?? h?.by ?? x?.updatedByName ?? null;
  if (!a && !upAt) return '';
  let src = '';
  if (a) {
    const s = a.source;
    if (s === 'bank' || s === 'bank_import') src = a.sourceLabel ? (/^bankimport/i.test(a.sourceLabel) ? a.sourceLabel : `bankimport fra ${a.sourceLabel}`) : 'bankimport';
    else if (s === 'api') src = a.sourceLabel ? `via API-nøkkel «${a.sourceLabel}»` : 'via API-nøkkel';
    else src = a.sourceLabel && !SRC[s] ? a.sourceLabel : SRC[s] ?? a.sourceLabel ?? '';
  }
  const who = a?.byName && !(a.source === 'bank' || a.source === 'bank_import') ? a.byName : '';
  const first = a ? `Lagt til ${whenTxt(a.at)}${src ? ` · ${esc(src)}` : ''}${who ? ` · ${esc(who)}` : ''}` : '';
  const changed = upAt && (!a || Math.abs(Date.parse(upAt) - Date.parse(a.at)) > 60_000) ? `Sist endret ${whenTxt(upAt)}${upBy ? ` av ${esc(upBy)}` : ''}` : '';
  return `<div class="f40-added">${first ? `<span>${first}</span>` : ''}${changed ? `<span>${changed}</span>` : ''}</div>`;
}

/* ---------------- Rediger alt: varelinjer og sumkontroll ---------------- */

const E = { id: null, lines: null, orig: null, dirty: false };
const parse = (s) => { const v = parseFloat(String(s ?? '').replace(/\s| /g, '').replace('−', '-').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const linesOfTx = (t) => (t?.lines ?? []).map((l) => ({ description: l.description ?? l.text ?? '', amount: Number(l.amount ?? l.price ?? 0) }));
export function editState(t) {
  if (E.id !== t?.id) { E.id = t?.id ?? null; E.lines = linesOfTx(t); E.orig = t?.extraction?.lines ?? t?.originalLines ?? null; E.dirty = false; }
  return E;
}
function sumLine(t) {
  const sum = E.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), amt = Math.abs(Number(t.amount) || 0);
  const ok = Math.abs(sum - amt) < 0.01;
  return `<div class="f40-sum ${ok ? 'ok' : 'bad'}" data-f40-sum>Sum linjer ${n2(sum)} kr · ${ok ? 'stemmer' : `stemmer ikke med beløpet (${n2(amt)} kr)`}</div>`;
}
/** Varelinjer i detaljpanelet: navn og pris kan endres, × fjerner, «+ Legg til linje». */
export function linesEditor(t) {
  editState(t);
  if (!E.lines.length && !t.receiptId) return `<div class="f40-lines"><div class="f40-lh"><b>Varelinjer</b><button type="button" class="link-btn" data-f40-addline>+ Legg til linje</button></div></div>`;
  return `<div class="f40-lines" data-f40-lines><div class="f40-lh"><b>Varelinjer</b>${E.orig || t.receiptId ? '<button type="button" class="link-btn" data-f40-reset title="Tilbakestill til slik Glimt leste den">Tilbakestill</button>' : ''}</div>
    ${E.lines.map((l, i) => `<div class="f40-ln"><input class="inp" data-f40-ln="${i}" data-k="description" value="${esc(l.description)}" aria-label="Varelinje ${i + 1}"><input class="inp mono" data-f40-ln="${i}" data-k="amount" inputmode="decimal" value="${n2(l.amount)}" aria-label="Pris"><button type="button" class="x-btn" data-f40-rmline="${i}" aria-label="Fjern linjen">×</button></div>`).join('')}
    <button type="button" class="link-btn" data-f40-addline>+ Legg til linje</button>
    ${E.lines.length ? sumLine(t) : ''}
    ${E.dirty ? '<div class="f40-lsave"><button type="button" class="btn ghost" data-f40-undo>Avbryt</button><button type="button" class="btn pri" data-f40-save>Lagre linjene</button></div>' : ''}</div>`;
}
/** Kobles til detaljpanelet. getTx() gir valgt transaksjon, save(body) lagrer (PATCH), rerender() tegner på nytt. */
export function bindEditor(root, { getTx, save, rerender }) {
  root.addEventListener('input', (e) => {
    const inp = e.target.closest?.('[data-f40-ln]');
    if (!inp) return;
    const i = +inp.dataset.f40Ln, k = inp.dataset.k;
    if (!E.lines?.[i]) return;
    E.lines[i][k] = k === 'amount' ? parse(inp.value) ?? 0 : inp.value;
    const wasDirty = E.dirty; E.dirty = true;
    const t = getTx(); const s = root.querySelector('[data-f40-sum]');
    if (s && t) s.outerHTML = sumLine(t);
    if (!wasDirty) { const box = root.querySelector('[data-f40-lines]'); if (box && !box.querySelector('.f40-lsave')) box.insertAdjacentHTML('beforeend', '<div class="f40-lsave"><button type="button" class="btn ghost" data-f40-undo>Avbryt</button><button type="button" class="btn pri" data-f40-save>Lagre linjene</button></div>'); }
  });
  root.addEventListener('click', async (e) => {
    const t = getTx();
    if (!t) return;
    if (e.target.closest('[data-f40-addline]')) { e.preventDefault(); editState(t).lines.push({ description: '', amount: 0 }); E.dirty = true; rerender(); setTimeout(() => root.querySelector(`[data-f40-ln="${E.lines.length - 1}"][data-k="description"]`)?.focus(), 30); return; }
    const rm = e.target.closest('[data-f40-rmline]');
    if (rm) { e.preventDefault(); E.lines.splice(+rm.dataset.f40Rmline, 1); E.dirty = true; rerender(); return; }
    if (e.target.closest('[data-f40-undo]')) { e.preventDefault(); E.id = null; editState(t); rerender(); return; }
    if (e.target.closest('[data-f40-reset]')) {
      e.preventDefault();
      if (!confirm('Tilbakestille varelinjene til slik Glimt leste kvitteringen?')) return;
      if (E.orig) { E.lines = E.orig.map((l) => ({ description: l.description ?? '', amount: Number(l.amount ?? 0) })); E.dirty = true; rerender(); return; }
      try { await save({ reset: 'extraction' }); E.id = null; } catch (er) { alert(er.message); }
      return;
    }
    if (e.target.closest('[data-f40-save]')) { e.preventDefault(); await saveLines(save); }
  });
}
export async function saveLines(save) {
  if (!E.dirty) return false;
  const lines = E.lines.filter((l) => String(l.description).trim() || Number(l.amount)).map((l) => ({ description: String(l.description).trim(), amount: Number(l.amount) || 0 }));
  await save({ lines });
  E.dirty = false; E.id = null;
  return true;
}
export const editorDirty = () => E.dirty;

/** «✦ La Glimt lese kvitteringen på nytt» (full bredde, mørk). Bruker reanalyze-dialogen (data-reanalyze). */
export const rereadBtn = (t) => (t?.receiptId ? `<button type="button" class="f40-reread" data-reanalyze="${esc(t.receiptId)}" data-status="${t.receipt === 'booked' ? 'booked' : ''}" data-f40-reread title="Les på nytt (R)">✦ La Glimt lese kvitteringen på nytt</button>` : '');

/* ---------------- Søk: Glimt-kort ---------------- */

// Standardspørsmål som alltid gir kort (også uten ✦ Glimt slått på).
const STD = /\b(abonnement(?:er|ene)?|abo|faste trekk|faste utgifter|hva betaler jeg for|kontoer|budsjett(?:et)?|hvor mye (?:brukte|har) jeg|forbruk)\b/i;
export const isStandardQ = (q) => STD.test(String(q ?? ''));
const strip = (t) => String(t ?? '').replace(/\*\*|__/g, '').replace(/\s*\[(?:n|\d+(?:\s*,\s*\d+)*)\]/gi, '').replace(/^#+\s*/gm, '').replace(/\s+([.,;:!?])/g, '$1').trim();
/** POST /search/ask. null = serveren har det ikke (404) eller ingen kort. */
export async function askGlimt(q, signal) {
  let r;
  try { r = await api('/search/ask', { method: 'POST', json: { q }, signal }); }
  catch (e) { if (e.status === 404 || e.status === 405 || e.name === 'AbortError') return null; throw e; }
  if (!r) return null;
  const cards = Array.isArray(r.cards) ? r.cards : [];
  const kpis = (Array.isArray(r.kpis) ? r.kpis : cards.filter((c) => c.kind === 'stat')).map((k) => ({ label: k.label ?? k.l ?? '', value: k.value ?? k.v ?? '', sub: k.sub ?? k.s ?? '' }));
  const items = (cards.filter((c) => c.kind !== 'stat').length ? cards.filter((c) => c.kind !== 'stat') : Array.isArray(r.items) ? r.items : []).map((x) => ({ ...x, kind: x.kind ?? x.type ?? 'tx' }));
  const text = strip(r.text ?? r.summary ?? '');
  if (!text && !items.length) return null;
  return { q, text, source: r.source ?? '', kpis: kpis.slice(0, 3), items, total: r.total ?? null, open: r.open ?? r.action ?? null, model: r.model ?? '' };
}
const DAY = 86400000;
function nextTxt(x) {
  const d = x.nextDate ?? x.next_date ?? x.next ?? null;
  if (!d) return '';
  const t = new Date(String(d).length <= 10 ? `${d}T12:00` : d), days = Math.round((new Date(t.toDateString()) - new Date(new Date().toDateString())) / DAY);
  const ds = t.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '');
  return { txt: `Neste trekk ${ds} · ${days === 0 ? 'i dag' : days === 1 ? 'i morgen' : days > 0 ? `om ${days} dager` : `${-days} dager siden`}`, soon: days >= 0 && days <= 7 };
}
const krTxt = (v) => (v == null || v === '' ? '' : typeof v === 'number' ? `${Number.isInteger(v) ? new Intl.NumberFormat('nb-NO').format(v) : n2(v)} kr` : esc(v));
/** Kortet: kilde til høyre, kort oppsummering (serif), tre nøkkeltall, liste med kort, «Åpne … ›». */
export function glimtCard(a, logo) {
  const src = a.source ? (/^fra |^leste /.test(a.source) ? a.source : `fra ${a.source}`) : 'leste transaksjoner og kvitteringer';
  const items = a.items.map((x) => {
    const n = nextTxt(x), amt = x.amount ?? x.price ?? null, cyc = x.cycle ?? x.per ?? '';
    const per = cyc === 'år' || cyc === 'year' || cyc === 'yearly' ? `per år${amt ? ` · ${new Intl.NumberFormat('nb-NO').format(Math.round(amt / 12))}/mnd` : ''}` : cyc ? 'per mnd' : '';
    const href = x.url ?? (x.kind === 'sub' ? `#/sub${x.id ? `/${x.id}` : ''}` : null);
    const attrs = x.kind === 'tx' && x.id ? `data-open-tx="${esc(x.id)}"` : x.kind === 'receipt' && x.id ? `data-open-rc="${esc(x.id)}"` : href ? `href="${esc(href)}"` : '';
    const tag = attrs.startsWith('href') ? 'a' : 'button type="button"';
    const sub = n ? `<span class="${n.soon ? 'soon' : ''}">${esc(n.txt)}</span>` : x.note || x.date ? `<span>${esc(x.note ?? x.date)}</span>` : '';
    return `<${tag} class="f40-gi" ${attrs}>${logo({ name: x.name ?? x.description ?? '', description: x.name ?? '', domain: x.domain ?? x.logo ?? '' }, 36, 10)}<span class="f40-gn"><b>${esc(x.name ?? x.description ?? '')}</b>${sub}</span><span class="f40-ga"><b class="mono">${krTxt(amt)}</b>${per ? `<span>${per}</span>` : ''}</span></${tag.split(' ')[0]}>`;
  }).join('');
  const kp = a.kpis.length ? `<div class="f40-kpis">${a.kpis.map((k) => `<div><span>${esc(String(k.label).toUpperCase())}</span><b>${esc(typeof k.value === 'number' ? krTxt(k.value) : k.value)}</b>${k.sub ? `<em>${esc(k.sub)}</em>` : ''}</div>`).join('')}</div>` : '';
  const op = a.open ? `<a class="f40-open" href="${esc(a.open.target ?? a.open.url ?? a.open.href ?? '#/sub')}">${esc(a.open.label ?? 'Åpne Subscription OS')} ›</a>` : /subscription/i.test(a.source) ? '<a class="f40-open" href="#/sub">Åpne Subscription OS ›</a>' : '';
  return `<section class="card f40-glimt" aria-live="polite"><div class="f40-gh"><span class="f40-gk">✦ GLIMT</span><span class="f40-gs" title="${esc(a.model || '')}">${esc(src)}</span><button class="x-btn" data-act="ai-close" aria-label="Lukk">×</button></div>
    ${a.text ? `<p class="f40-gt">${esc(a.text)}</p>` : ''}${kp}${items ? `<div class="f40-glist">${items}</div>` : ''}${op}</section>`;
}

/* ---------------- CSS ---------------- */
if (!document.getElementById('f40-css')) {
  const st = document.createElement('style'); st.id = 'f40-css';
  st.textContent = `.f40-added{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;font-size:12.5px;color:var(--muted,#8C8C96);padding-top:4px}
.f40-reread{width:100%;min-height:46px;border-radius:14px;border:0;background:var(--text,#F2F2F4);color:var(--bg,#0B0B0E);font:600 14.5px inherit;font-family:inherit;cursor:pointer}
.f40-reread:hover{opacity:.9}
.f40-lines{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:14px;background:var(--inner,#1B1B20);border:1px solid var(--sep,var(--line,#24242A))}
.f40-lh{display:flex;justify-content:space-between;align-items:center;gap:8px}.f40-lh b{font-weight:600;font-size:14px}
.f40-ln{display:grid;grid-template-columns:minmax(0,1fr) 110px 32px;gap:8px;align-items:center}.f40-ln .inp{height:38px}.f40-ln .inp.mono{text-align:right}
.f40-sum{font-size:13px;font-weight:600}.f40-sum.ok{color:var(--pos,#3DD68C)}.f40-sum.bad{color:var(--neg,#FF6B6B)}
.f40-lsave{display:flex;gap:8px;justify-content:flex-end}
.f40-glimt{gap:14px}.f40-gh{display:flex;align-items:center;gap:10px}.f40-gk{font:600 11px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.12em;color:var(--acc,#FF8A5C)}
.f40-gs{flex:1;min-width:0;text-align:right;font-size:12.5px;color:var(--muted,#8C8C96);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f40-gt{margin:0;font:400 19px/1.4 Newsreader,Georgia,serif;color:var(--text)}
.f40-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.f40-kpis>div{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:12px;background:var(--inner,#1B1B20);min-width:0}
.f40-kpis span{font:600 10px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.1em;color:var(--muted,#8C8C96)}.f40-kpis b{font-size:16px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.f40-kpis em{font-style:normal;font-size:12px;color:var(--muted,#8C8C96);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f40-glist{display:flex;flex-direction:column;border-radius:16px;border:1px solid var(--sep,var(--line,#24242A));overflow:hidden}
.f40-gi{display:flex;align-items:center;gap:12px;padding:11px 14px;border:0;border-bottom:1px solid var(--sep,var(--line,#24242A));background:transparent;color:var(--text);text-decoration:none;text-align:left;font:inherit;cursor:pointer;width:100%}
.f40-gi:last-child{border-bottom:0}.f40-gi:hover{background:var(--inner,#1B1B20)}
.f40-gn{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.f40-gn b{font-weight:600;font-size:14.5px}.f40-gn span{font-size:12.5px;color:var(--muted,#8C8C96)}.f40-gn span.soon{color:var(--neg,#FF6B6B);font-weight:600}
.f40-ga{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:2px}.f40-ga b{font-weight:600}.f40-ga span{font-size:12px;color:var(--muted,#8C8C96)}
.f40-open{align-self:flex-start;font-weight:600;font-size:14px;color:var(--acc,#FF8A5C);text-decoration:none}
.f40-ctx{min-width:220px;display:flex;flex-direction:column;padding:6px;border-radius:14px;background:var(--card,#141418);border:1px solid var(--line,#24242A);box-shadow:0 18px 40px rgba(0,0,0,.45)}
.f40-ctx button{height:38px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:var(--text,#F2F2F4);text-align:left;font:500 14px inherit;font-family:inherit;cursor:pointer}.f40-ctx button:hover{background:var(--inner,#1B1B20)}
@media (max-width:560px){.f40-kpis{grid-template-columns:1fr}}`;
  document.head.appendChild(st);
}
