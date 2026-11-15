// Prompt 42 (SERVER42): liten egen PDF-skriver (ingen avhengigheter, ingen headless Chromium på serveren).
// A4 (595 × 842 pt), koordinater fra øvre venstre hjørne. Standardfontene Helvetica / Helvetica-Bold / Times-Roman / Courier(-Bold)
// med WinAnsiEncoding, så æ, ø, å, «», –, … og · vises riktig. Tegn utenfor WinAnsi byttes til nærmeste (✦ → *, ▼ → v, ▲ → ^).
export const A4 = { w: 595.28, h: 841.89 };
const FONTS = { sans: 'Helvetica', bold: 'Helvetica-Bold', serif: 'Times-Roman', mono: 'Courier', monob: 'Courier-Bold' };
const FONT_KEYS = Object.keys(FONTS);
// Unicode → WinAnsi (cp1252) for tegnene mellom 0x80 og 0x9f.
const CP1252 = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
const SUBST = { '✦': '*', '▼': 'v', '▲': '^', '−': '-', ' ': ' ', ' ': ' ', '✓': 'v', '›': '>', '‹': '<', '⇩': '', '⤢': '' };
/** Tekst → hex-streng i WinAnsi. */
export function winAnsiHex(s) {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = SUBST[ch] ?? ch;
    for (const x of c) {
      const code = CP1252[x] ?? x.codePointAt(0);
      out += (code < 256 ? code : 0x3f).toString(16).padStart(2, '0');
    }
  }
  return out;
}
// Omtrentlig bredde (Helvetica: snitt ~0,52 em; Courier: nøyaktig 0,6 em).
export function textWidth(s, size, font = 'sans') {
  if (font === 'mono' || font === 'monob') return [...String(s)].length * size * 0.6;
  let w = 0;
  for (const ch of String(s)) w += /[ilI.,:;'|!]/.test(ch) ? 0.28 : /[mwMW@]/.test(ch) ? 0.83 : /[A-ZÆØÅ]/.test(ch) ? 0.67 : /[0-9]/.test(ch) ? 0.556 : ch === ' ' ? 0.278 : 0.5;
  return w * size * (font === 'bold' ? 1.06 : font === 'serif' ? 0.95 : 1);
}
const rgb = (hex) => { const m = String(hex ?? '#000').replace('#', ''); const n = parseInt(m.length === 3 ? m.replace(/./g, '$&$&') : m, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' '); };
const f2 = (v) => (Math.round(v * 100) / 100).toString();

export class Pdf42 {
  constructor({ title = 'Dokument', author = 'Glimt' } = {}) { this.pages = []; this.title = title; this.author = author; this.page(); }
  page() { this.cur = []; this.pages.push(this.cur); return this; }
  /** text(x, y, tekst, {size, font:'sans'|'bold'|'serif'|'mono'|'monob', color, align:'left'|'right'|'center'}) – y er grunnlinjen fra toppen. */
  text(x, y, s, { size = 10, font = 'sans', color = '#1b1a17', align = 'left' } = {}) {
    const fi = FONT_KEYS.indexOf(font) + 1 || 1;
    const w = textWidth(s, size, font);
    const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    this.cur.push(`BT ${rgb(color)} rg /F${fi} ${f2(size)} Tf ${f2(xx)} ${f2(A4.h - y)} Td <${winAnsiHex(s)}> Tj ET`);
    return w;
  }
  /** Bryter teksten på ord innenfor bredden. → y etter siste linje. */
  para(x, y, s, width, { size = 10, font = 'sans', color = '#1b1a17', lead = 1.4 } = {}) {
    const words = String(s ?? '').split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (textWidth(next, size, font) > width && line) { this.text(x, y, line, { size, font, color }); y += size * lead; line = w; } else line = next;
    }
    if (line) { this.text(x, y, line, { size, font, color }); y += size * lead; }
    return y;
  }
  rect(x, y, w, h, { fill = null, stroke = null, lw = 0.6 } = {}) {
    const ops = [];
    if (fill) ops.push(`${rgb(fill)} rg`);
    if (stroke) ops.push(`${rgb(stroke)} RG ${f2(lw)} w`);
    ops.push(`${f2(x)} ${f2(A4.h - y - h)} ${f2(w)} ${f2(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    this.cur.push(ops.join(' '));
    return this;
  }
  line(x1, y1, x2, y2, { color = '#d6cdbb', lw = 0.6 } = {}) { this.cur.push(`${rgb(color)} RG ${f2(lw)} w ${f2(x1)} ${f2(A4.h - y1)} m ${f2(x2)} ${f2(A4.h - y2)} l S`); return this; }
  circle(cx, cy, r, { fill = '#b23a2a' } = {}) {
    const k = 0.5523 * r, y = A4.h - cy;
    this.cur.push(`${rgb(fill)} rg ${f2(cx + r)} ${f2(y)} m ${f2(cx + r)} ${f2(y + k)} ${f2(cx + k)} ${f2(y + r)} ${f2(cx)} ${f2(y + r)} c ${f2(cx - k)} ${f2(y + r)} ${f2(cx - r)} ${f2(y + k)} ${f2(cx - r)} ${f2(y)} c `
      + `${f2(cx - r)} ${f2(y - k)} ${f2(cx - k)} ${f2(y - r)} ${f2(cx)} ${f2(y - r)} c ${f2(cx + k)} ${f2(y - r)} ${f2(cx + r)} ${f2(y - k)} ${f2(cx + r)} ${f2(y)} c f`);
    return this;
  }
  /** → Buffer med en gyldig PDF 1.4. */
  output() {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const fontIds = FONT_KEYS.map((k) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[k]} /Encoding /WinAnsiEncoding >>`));
    const res = `<< /Font << ${fontIds.map((id, i) => `/F${i + 1} ${id} 0 R`).join(' ')} >> >>`;
    const kids = [];
    for (const p of this.pages) {
      const body = p.join('\n');
      const cid = add(`<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources ${res} /Contents ${cid} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title <feff${Buffer.from(this.title, 'utf16le').swap16().toString('hex')}> /Author <feff${Buffer.from(this.author, 'utf16le').swap16().toString('hex')}> /Producer (Homelab Glimt) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}
