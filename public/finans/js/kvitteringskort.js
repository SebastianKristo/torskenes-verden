// Prompt 52 (WEB52F, claude-code-kvittering-lokal-lik-overalt.md → Mobil): én kvitteringsvisning i PWA-en.
// Finans → transaksjon (paperTx i mobile-paper3.js) og Boliger → utgift (entSheet i mobile-p30b.js) bruker samme kort:
// logo/forbokstav, butikk, «kategori · dato · bolig», stort beløp og ✦ Glimt-tekst, deretter «ORIGINAL KVITTERING» med
// papir-gjengivelsen (varelinjer + total) som åpner originalen. Ingen egen leser i Boliger.
import { esc, ini } from './core.js';

const kr2 = (v) => (Number(v) || 0).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Papirlappen. o.open = attributter som åpner originalen (knapp) eller o.href (lenke i ny fane). */
export function slip52(o = {}) {
  const L = o.lines ?? [];
  const rows = o.linesHtml ?? (L.length ? L.map((l) => { const p = l.price ?? l.amount; return `<span class="pp-slipl"><span>${esc(l.name ?? l.text ?? l.description ?? '')}</span><span>${p != null ? kr2(Math.abs(p)) : ''}</span></span>`; }).join('')
    : `<span class="pp-slipl"><span>${o.hasFile ? 'Trykk for å se originalen' : 'Varelinjene er ikke lest ennå'}</span><span></span></span>`);
  const inner = `<span class="pp-slipn">${esc(String(o.name ?? '').toUpperCase())}</span><span class="pp-slipd">${esc(o.date ?? '')} · KVITTERING</span><i></i>
      ${rows}<i></i>
      <span class="pp-slipl tot"><span>TOTAL</span><span>${kr2(o.total)}</span></span>${o.hasFile ? `<span class="pp-slipo">${o.pdf ? 'Åpne PDF ↗' : 'Trykk for originalbildet'}</span>` : ''}`;
  return o.href ? `<a class="pp-slip" href="${esc(o.href)}" target="_blank" rel="noopener" aria-label="Åpne original kvittering">${inner}</a>`
    : `<button type="button" class="pp-slip" ${o.open ?? ''} ${o.hasFile ? '' : 'disabled'} aria-label="Åpne original kvittering">${inner}</button>`;
}

/** Kortet. o: {name, color, logo (HTML), meta, amount, ai, status, statusWarn, top, slip, after}. */
export function rcCard52(o = {}) {
  const amt = Number(o.amount) || 0;
  return `<div class="pp-card pp-txd rc52"><div class="pp-row" style="align-items:center;justify-content:flex-start;gap:12px">${o.logo ?? `<span class="pp-ti big" style="background:${esc(o.color ?? '#6b665c')}">${esc(ini(o.name ?? ''))}</span>`}<div style="min-width:0"><b class="pp-serif m-ell" style="display:block;font-size:22px">${esc(o.name ?? '')}</b><span class="pp-mut">${esc(o.meta ?? '')}</span></div></div>
      <span class="pp-serif pp-txamt ${amt > 0 ? 'pp-pos' : ''}">${amt < 0 ? '−' : '+'}${kr2(Math.abs(amt))} kr</span>${o.ai ? `<span class="pp-lab-c" style="font-size:13px">✦ ${esc(o.ai)}</span>` : ''}</div>
    ${o.top ?? ''}<div class="pp-sec"><span>ORIGINAL KVITTERING</span><span class="${o.statusWarn ? 'pp-lab-c' : ''}">${esc(o.status ?? '')}</span></div>
    ${o.slip ?? ''}${o.after ?? ''}`;
}
