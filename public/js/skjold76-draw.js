// Prompt 76 (SKJWEB): Skjold Lab – tegning av sorteringsskapet og perspektiv-overlegget på bildet av skapet.
// - drawCabinet76: SVG i skapets proporsjoner (Raaco 150-01: mørk ramme, lyse skuffer med håndtak). Rad 1 øverst, skuff 1 til venstre.
//   Valgt skuff får aksentfarge og puls i 2 s (bare opacity), raden og kolonnen merkes med tall.
// - homography76/matrix3d76: projektiv avbildning av enhetskvadratet til de 4 hjørnene (tl, tr, br, bl) → CSS matrix3d,
//   så rutenettet (og uthevingen) legges oppå bildet i riktig perspektiv.
// Ingen import: modulen er ren (testes i Node, test/p76-web.test.js).
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const CELL_W = 60, CELL_H = 40; // én skuff i tegningen (≈ 55 × 37 mm på Raaco 150-01)
const FR = 14, NUM = 18; // rammetykkelse og plass til tall (rad til venstre, kolonne over)

export const short76 = (row, col) => `${row}-${col}`;
export const long76 = (row, col) => `Rad ${row} · Skuff ${col}`;
/** Egen etikett på skuffen (serveren sender standard «R4·S2» i label og den egne i customLabel). */
export const ownLabel76 = (d) => (d ? ('customLabel' in d ? d.customLabel || '' : /^R\d+·S\d+$/.test(d.label ?? '') ? '' : d.label || '') : '');

/** Projektiv avbildning av (0,0),(1,0),(1,1),(0,1) til p = [tl, tr, br, bl] ({x, y}). → {a..h}: X = (au+bv+c)/(gu+hv+1). */
export function homography76(p) {
  const [p0, p1, p2, p3] = p;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-12) return null;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    h = (dx1 * dy3 - dx3 * dy1) / det;
  }
  return { a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + h * p3.x, c: p0.x, d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + h * p3.y, f: p0.y, g, h };
}
export function mapPt76(H, u, v) {
  const w = H.g * u + H.h * v + 1;
  return { x: (H.a * u + H.b * v + H.c) / w, y: (H.d * u + H.e * v + H.f) / w };
}
/** CSS matrix3d (kolonnevis) for et element på W × H px med transform-origin 0 0, slik at hjørnene havner i p. */
export function matrix3d76(p, W, Hh) {
  const H = homography76(p);
  if (!H) return null;
  const m = [H.a / W, H.d / W, 0, H.g / W, H.b / Hh, H.e / Hh, 0, H.h / Hh, 0, 0, 1, 0, H.c, H.f, 0, 1];
  if (m.some((x) => !Number.isFinite(x))) return null;
  return `matrix3d(${m.map((x) => +x.toFixed(9)).join(',')})`;
}
/** Hjørnene er gyldige når alle fire finnes (0–1) og firkanten er konveks. */
export function cornersOk76(c) {
  if (!c) return false;
  const P = ['tl', 'tr', 'br', 'bl'].map((k) => c[k]);
  if (P.some((q) => !q || !Number.isFinite(+q.x) || !Number.isFinite(+q.y))) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], d = P[(i + 2) % 4];
    const z = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}

/**
 * Tegner skapet. cab: {rows, cols, kind, name}; map: {drawers:[{row,col,label,compartments,count,color}]};
 * opt: {sel:{row,col,compartment}, pick:boolean, pulse:boolean, compact:boolean}
 */
export function drawCabinet76(cab, map, opt = {}) {
  const rows = Math.max(1, +cab.rows || 1), cols = Math.max(1, +cab.cols || 1);
  const by = new Map((map?.drawers ?? []).map((d) => [`${d.row}-${d.col}`, d]));
  const W = NUM + FR * 2 + cols * CELL_W, Hh = NUM + FR * 2 + rows * CELL_H;
  const x0 = NUM + FR, y0 = NUM + FR, sel = opt.sel, printed = cab.kind === '3d';
  let s = `<svg class="sk76-svg${printed ? ' p3d' : ''}${opt.pick ? ' pick' : ''}" viewBox="0 0 ${W} ${Hh}" role="group" aria-label="${esc(`${cab.name || 'Skap'}: ${rows} rader × ${cols} skuffer`)}" preserveAspectRatio="xMidYMin meet">`;
  // Ramme (mørk metall på hovedskapet, lysere «print» på 3D-skap).
  s += `<rect class="sk76-frame" x="${NUM}" y="${NUM}" width="${cols * CELL_W + FR * 2}" height="${rows * CELL_H + FR * 2}" rx="6"/>`;
  // Tall: kolonner over, rader til venstre. Valgt rad/kolonne uthevet.
  for (let c = 1; c <= cols; c++) s += `<text class="sk76-num${sel?.col === c ? ' on' : ''}" x="${x0 + (c - 0.5) * CELL_W}" y="${NUM - 5}" text-anchor="middle">${c}</text>`;
  for (let r = 1; r <= rows; r++) s += `<text class="sk76-num${sel?.row === r ? ' on' : ''}" x="${NUM - 4}" y="${y0 + (r - 0.5) * CELL_H + 4}" text-anchor="end">${r}</text>`;
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const d = by.get(`${r}-${c}`), x = x0 + (c - 1) * CELL_W, y = y0 + (r - 1) * CELL_H, n = +d?.count || 0;
      const isSel = sel && sel.row === r && sel.col === c, comp = Math.min(4, Math.max(1, +d?.compartments || 1));
      const own = ownLabel76(d), lbl = own ? ` · ${own}` : '';
      const aria = `${long76(r, c)}${lbl} · ${n ? `${n} ${n === 1 ? 'del' : 'deler'}` : 'tom'}`;
      s += `<g class="sk76-dr${n ? ' has' : ''}${isSel ? ' sel' : ''}" data-sk76-dr="${r}-${c}" role="button" tabindex="0" aria-label="${esc(aria)}"${isSel ? ' aria-current="true"' : ''}>`;
      s += `<rect class="sk76-box" x="${x + 2}" y="${y + 3}" width="${CELL_W - 4}" height="${CELL_H - 5}" rx="2"${d?.color ? ` style="fill:${esc(d.color)}"` : ''}/>`;
      for (let k = 1; k < comp; k++) s += `<line class="sk76-wall" x1="${x + 2 + ((CELL_W - 4) * k) / comp}" y1="${y + 6}" x2="${x + 2 + ((CELL_W - 4) * k) / comp}" y2="${y + CELL_H - 13}"/>`;
      s += `<rect class="sk76-handle" x="${x + CELL_W / 2 - 11}" y="${y + CELL_H - 11}" width="22" height="5" rx="2"/>`;
      if (n) s += `<circle class="sk76-dot" cx="${x + CELL_W - 9}" cy="${y + 10}" r="${n > 9 ? 7 : 6}"/><text class="sk76-dotn" x="${x + CELL_W - 9}" y="${y + 13}" text-anchor="middle">${n > 99 ? '99' : n}</text>`;
      if (own && !opt.compact) s += `<text class="sk76-lbl" x="${x + 5}" y="${y + 14}">${esc(own.length > 8 ? `${own.slice(0, 7)}…` : own)}</text>`;
      if (isSel) {
        // Valgt rom (når skuffen har skillevegger) markeres tydeligere.
        const ci = sel.compartment && comp > 1 ? Math.min(comp, sel.compartment) : 0;
        const rx = ci ? x + 2 + ((CELL_W - 4) * (ci - 1)) / comp : x + 2, rw = ci ? (CELL_W - 4) / comp : CELL_W - 4;
        s += `<rect class="sk76-hl${opt.pulse === false ? '' : ' pulse'}" x="${rx}" y="${y + 3}" width="${rw}" height="${CELL_H - 5}" rx="2"/>`;
        s += `<rect class="sk76-hlb" x="${x + 0.5}" y="${y + 1.5}" width="${CELL_W - 1}" height="${CELL_H - 2}" rx="3"/>`;
      }
      s += '</g>';
    }
  }
  return `${s}</svg>`;
}

/**
 * Overlegget oppå bildet: et rutenett (divs) i skapets proporsjoner som får matrix3d fra de 4 hjørnene.
 * Elementet må ligge i .sk76-photo sammen med <img>; layoutPhoto76 setter transformen når bildet har størrelse.
 */
export function overlayGrid76(cab, sel, opt = {}) {
  const rows = Math.max(1, +cab.rows || 1), cols = Math.max(1, +cab.cols || 1);
  let s = `<div class="sk76-ov${opt.preview ? ' prev' : ''}" style="width:${cols * CELL_W}px;height:${rows * CELL_H}px;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)" aria-hidden="true" data-sk76-ov>`;
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const on = sel && sel.row === r && sel.col === c;
    s += `<i class="${on ? 'on' : ''}" data-sk76-ovc="${r}-${c}">${on ? '<b class="pulse"></b>' : ''}</i>`;
  }
  return `${s}</div>`;
}
/** Plasserer overlegget over det viste bildet (object-fit: contain tas hensyn til). */
export function layoutPhoto76(box, cab, corners) {
  const img = box?.querySelector('img'), ov = box?.querySelector('[data-sk76-ov]');
  if (!img || !ov || !img.naturalWidth || !cornersOk76(corners)) { if (ov) ov.style.visibility = 'hidden'; return false; }
  const bw = img.clientWidth, bh = img.clientHeight, nr = img.naturalWidth / img.naturalHeight;
  // Det faktiske bildet inne i <img> (contain): bredde/høyde og forskyvning.
  let w = bw, h = bw / nr;
  if (h > bh) { h = bh; w = bh * nr; }
  const ox = img.offsetLeft + (bw - w) / 2, oy = img.offsetTop + (bh - h) / 2;
  const pts = ['tl', 'tr', 'br', 'bl'].map((k) => ({ x: ox + corners[k].x * w, y: oy + corners[k].y * h }));
  const m = matrix3d76(pts, (+cab.cols || 1) * CELL_W, (+cab.rows || 1) * CELL_H);
  if (!m) { ov.style.visibility = 'hidden'; return false; }
  ov.style.transform = m;
  ov.style.visibility = 'visible';
  return { ox, oy, w, h };
}
