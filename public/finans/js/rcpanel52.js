// Prompt 52 (WEB52F): ett kvitteringspanel for FinansHub web – Transaksjoner, Boliger og Filter bruker samme komponent
// (claude-code-finanshub-kvittering-panel-scroll.md og claude-code-kvittering-lokal-lik-overalt.md):
//   logo + × (fast øverst mens panelet scroller), butikk, «dato · bolig · kategori», stort beløp, ✦ Glimt-beskrivelse med
//   varelinjer, selve kvitteringen (bilde / PDF / papir-gjengivelse), «⇩ Last ned original», og knappene til slutt.
// Panelet har egen scroll (overscroll-behavior: contain), så scroll over panelet flytter aldri lista bak.
// Stilene ligger i css/fin52.css. Bredde/plassering styres av klassen: «inline» (sticky ved siden av lista, skuff under
// 1100 px) eller «drawer» (skuff fra høyre, maks 500 px).
import { esc, n2 } from './core.js';

const amtTxt = (a) => (a == null || Number.isNaN(+a) ? '–' : `${+a < 0 ? '−' : ''}${n2(Math.abs(+a))}`);

/** Papir-gjengivelse når originalfilen mangler. */
export function paperReceipt52({ merchant = '', sub = [], lines = [], total = null } = {}) {
  const L = lines.length ? lines : [];
  return `<div class="rcp52-paper" role="img" aria-label="Kvittering slik Glimt leste den"><b>${esc(String(merchant || 'Kvittering').toUpperCase())}</b>${sub.filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('')}<hr>
    ${L.map((l) => `<span class="lr"><span>${esc(l.text ?? l.description ?? l.name ?? l.t ?? '')}${(l.quantity ?? l.qty) > 1 ? ` ×${esc(l.quantity ?? l.qty)}` : ''}</span><span>${n2(+(l.amount ?? l.price ?? l.a ?? 0))}</span></span>`).join('') || '<span class="lr" style="opacity:.6"><span>Ingen varelinjer lest</span><span></span></span>'}
    <hr><span class="lr tot"><span>TOTALT</span><span>${total != null ? n2(Math.abs(+total)) : '–'}</span></span></div>`;
}

/**
 * Felles kvitteringspanel.
 * o.key        – nøkkel for scroll-posisjonen (samme nøkkel = samme scroll etter ny tegning, ny nøkkel = toppen).
 * o.cls        – 'inline' | 'drawer' (+ ev. egne klasser), o.attrs – ekstra attributter på <aside>.
 * o.logo       – HTML for logoen, o.close – attributter på ×-knappen (f.eks. 'data-act="close-sel"').
 * o.title      – tekst (escapes) eller o.titleHtml (f.eks. et input-felt), o.meta – «dato · bolig · kategori».
 * o.amount     – tall (negativt = utgift), o.amountColor, o.amountHtml (overstyrer).
 * o.top        – HTML rett under beløpet, o.glimt {text, lines:[{text, amount, hit, html}]}, o.body – HTML etter Glimt.
 * o.receipt    – {url, mime, paper:{merchant, sub, lines, total}, label, zoom:'attr'} eller null (ingen kvitteringsdel).
 * o.download   – URL til originalen («⇩ Last ned original»), o.actions – knapper nederst, o.foot – liten tekst helt nederst.
 */
export function rcPanel52(o = {}) {
  const title = o.titleHtml ?? `<b class="rcp52-t">${esc(o.title ?? '')}</b>`;
  const amount = o.amountHtml ?? (o.amount === undefined ? '' : `<div class="rcp52-amt"${o.amountColor ? ` style="color:${o.amountColor}"` : ''}>${amtTxt(o.amount)} <span>kr</span></div>`);
  const G = o.glimt;
  const glimt = G && (G.text || G.lines?.length) ? `<div class="rcp52-ai"><b>✦ Glimt-beskrivelse</b>${G.text ? `<span>${esc(G.text)}</span>` : ''}${G.lines?.length ? `<div class="rcp52-lines">${G.lines.map((l) => `<span class="${l.hit ? 'rc-hit' : ''}"><span>${l.html ?? esc(l.text ?? l.description ?? '')}</span><span class="mono">${n2(+(l.amount ?? 0))}</span></span>`).join('')}</div>` : ''}${G.extra ?? ''}</div>` : (G?.extra ?? '');
  const R = o.receipt;
  let rc = '';
  if (R) {
    const isPdf = R.mime === 'application/pdf' || /\.pdf($|\?)/i.test(R.url ?? '');
    const isImg = R.url && !isPdf && (!R.mime || String(R.mime).startsWith('image/'));
    const view = isImg ? `<button type="button" class="rcp52-img"${R.zoom ? ` ${R.zoom}` : ''} aria-label="Se originalen større"><img src="${esc(R.url)}" alt="Kvittering${o.title ? ` fra ${esc(o.title)}` : ''}" loading="lazy"></button>`
      : isPdf ? `<div class="rcp52-pdf"><iframe src="${esc(R.url)}" title="Original kvittering (PDF)" loading="lazy"></iframe><a class="btn sm" href="${esc(R.url)}" target="_blank" rel="noopener">Åpne PDF ↗</a></div>`
      : paperReceipt52(R.paper ?? {});
    rc = `<section class="rcp52-rc" aria-label="Original kvittering"><span class="rcp52-k">${esc(R.label ?? 'ORIGINAL KVITTERING')}</span>${view}
      ${R.note ? `<span class="rcp52-note">${esc(R.note)}</span>` : ''}</section>`;
  }
  const dl = o.download ? `<a class="btn ink rcp52-dl" href="${esc(o.download)}" download>⇩ Last ned original</a>` : '';
  const acts = dl || o.actions ? `<div class="rcp52-acts">${dl}${o.actions ?? ''}</div>` : '';
  return `<aside class="rcp52 ${o.cls ?? 'drawer'}" data-rcp52="${esc(o.key ?? '')}" role="${o.role ?? 'region'}" aria-label="${esc(o.label ?? o.title ?? 'Kvittering')}"${o.attrs ? ` ${o.attrs}` : ''}>
    <div class="rcp52-head">${o.logo ?? ''}<span class="rcp52-hgrow"></span>${o.headExtra ?? ''}<button type="button" class="x-btn" ${o.close ?? ''} aria-label="Lukk">×</button></div>
    <div class="rcp52-tit">${title}${o.meta ? `<span class="rcp52-meta">${esc(o.meta)}</span>` : ''}</div>
    ${amount}${o.top ?? ''}${glimt}${o.body ?? ''}${rc}${acts}${o.foot ?? ''}</aside>`;
}

/* ---------- Scroll-posisjon mellom tegningene ---------- */
// FinansHub tegner hele siden på nytt (innerHTML). Panelet beholder scroll-posisjonen så lenge nøkkelen er den samme;
// ny transaksjon/kvittering = ny nøkkel = toppen (detailEl.scrollTop = 0, ikke window.scrollTo).
let saved = null;
export function rcpBefore52(root = document) {
  const p = root.querySelector?.('.rcp52[data-rcp52]');
  saved = p ? { k: p.dataset.rcp52, y: p.scrollTop } : null;
}
// Ved siden av lista: høyden følger det synlige vinduet (før siden er scrollet står panelet lenger ned, og bunnen av
// panelet skal likevel kunne nås uten å scrolle siden).
const narrow = () => matchMedia('(max-width: 1099px)').matches;
function fit52() {
  const p = document.querySelector('.rcp52.inline');
  if (!p) return;
  if (narrow()) { p.style.maxHeight = ''; return; }
  const top = Math.max(20, p.getBoundingClientRect().top);
  p.style.maxHeight = `${Math.max(320, innerHeight - top - 20)}px`;
}
let fitOn = false;
export function rcpAfter52(root = document) {
  const p = root.querySelector?.('.rcp52[data-rcp52]');
  if (!p) return;
  if (!fitOn) { fitOn = true; addEventListener('scroll', fit52, { passive: true }); addEventListener('resize', fit52, { passive: true }); }
  fit52();
  p.scrollTop = saved && saved.k === p.dataset.rcp52 ? saved.y : 0;
  // Skuffen (smal skjerm) låser scroll på siden bak mens den er åpen.
  document.documentElement.classList.toggle('rcp52-lock', p.classList.contains('drawer') || (p.classList.contains('inline') && narrow()));
}
export function rcpGone52() { if (!document.querySelector('.rcp52')) document.documentElement.classList.remove('rcp52-lock'); }
