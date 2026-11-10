// Prompt 76 (SKJSRV): utskriftsside med etiketter per skuff – «4-2», egen etikett, innhold og QR til /#/skjold/skap/<id>/4-2.
// Ren HTML + CSS (ingen skript, så den globale CSP-en holder). Brukeren skriver ut med Ctrl/⌘+P.
import { db } from '../db.js';
import { qrSvg } from '../totp.js';
import { drawerRows76, defaultLabel76, coverMap81 } from './store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** cabs = skapene som skal med, origin = adressen QR-kodene peker til. empty=false hopper over tomme skuffer uten etikett. */
export function labelsHtml76(user, cabs, origin, { empty = true } = {}) {
  const parts = db.prepare('SELECT id, name, qty, unit, cabinet_id, row, col, compartment FROM skj_parts WHERE user_id=? AND deleted_at IS NULL AND cabinet_id IS NOT NULL ORDER BY compartment, name').all(user);
  const by = new Map();
  for (const p of parts) { const k = `${p.cabinet_id}:${p.row}:${p.col}`; if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  const sheets = cabs.map((cab) => {
    const dr = new Map(drawerRows76(cab.id).map((d) => [`${d.row}:${d.col}`, d]));
    const cells = [], cover = coverMap81(cab.id); // prompt 81: sammenslåtte skuffer får én etikett (ankeret)
    for (let r = 1; r <= cab.rows; r++) for (let c = 1; c <= cab.cols; c++) {
      if (cover.has(`${r}:${c}`)) continue;
      const d = dr.get(`${r}:${c}`), ps = by.get(`${cab.id}:${r}:${c}`) ?? [];
      if (!empty && !ps.length && !d?.label) continue;
      const url = `${origin}/#/skjold/skap/${cab.id}/${r}-${c}`;
      const list = ps.slice(0, 4).map((p) => `<li>${esc(p.name)}${p.compartment ? ` <small>(rom ${p.compartment})</small>` : ''}</li>`).join('') + (ps.length > 4 ? `<li><small>+ ${ps.length - 4} til</small></li>` : '');
      cells.push(`<div class="lab"${d?.color ? ` style="border-left:6px solid ${esc(/^#[0-9a-f]{3,8}$/i.test(d.color) ? d.color : '#999')}"` : ''}><div class="txt"><div class="no">${r}-${c}</div>`
        + `<div class="nm">${esc(d?.label || defaultLabel76(r, c))}</div><ul>${list || '<li class="tom">Tom</li>'}</ul></div><div class="qr">${qrSvg(url, { px: 64, dark: '#000', light: '#fff' }).replace('QR-kode for 2FA', `QR til skuff ${r}-${c}`)}</div></div>`);
    }
    return `<section><h1>${esc(cab.name)} <small>${cab.rows} × ${cab.cols} skuffer</small></h1><div class="grid">${cells.join('')}</div></section>`;
  });
  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Skjold Lab · etiketter</title>
<style>
:root{color-scheme:light}body{font:12px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;margin:16px;color:#111;background:#fff}
h1{font-size:16px;margin:0 0 8px}h1 small{font-weight:400;color:#666}.hint{color:#666;margin:0 0 12px}
section{break-after:page;margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(58mm,1fr));gap:2mm}
.lab{display:flex;justify-content:space-between;gap:2mm;border:1px dashed #999;padding:2mm;min-height:20mm;break-inside:avoid}
.no{font-weight:700;font-size:18px;letter-spacing:.02em}.nm{font-weight:600}.txt{min-width:0}ul{margin:2px 0 0;padding-left:14px}li{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:38mm}
.tom{color:#999;list-style:none;margin-left:-14px}.qr svg{display:block}
@media print{body{margin:6mm}.hint{display:none}}
</style></head><body><p class="hint">Skriv ut med Ctrl/⌘ + P. Klipp langs de stiplede linjene. QR-koden åpner skuffen i Skjold Lab.</p>${sheets.join('') || '<p>Ingen skap.</p>'}</body></html>`;
}
