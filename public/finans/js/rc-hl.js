// Prompt 30: marker hvor i kvitteringen søketreffet er (FinansHub desktop). claude-code-kvittering-highlight.md.
// - Åpnes en transaksjon/kvittering fra søket (eller med #/kv?rc=<id>&hl=tomat), sendes søkeordet med.
// - Gult banner «‹tomat› står på linje 3 · 24,90 kr» (+ «og 1 til»), Fjern skjuler markeringen.
// - Linjene som matcher får gul bakgrunn; selve ordet markeres sterkere. Bilde med bbox: gule rektangler over linjene.
// - Mangler bbox (eldre kvitteringer): bare den tolkede linjelisten, og «Les kvitteringen på nytt» (POST /receipts/:id/reread).
// Match er uavhengig av store/små bokstaver og aksenter. Alle søkeordene må finnes i linjen (som serveren).
import { esc, n2 } from './core.js';

export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'a').replace(/å/g, 'a');
const terms = (q) => norm(q).split(/[^a-z0-9]+/).filter((w) => w.length > 1);

/** Linjene som [{text, price, bbox}]: R.lines (SERVER30) eller extraction.lines. */
export function linesOf(R) {
  if (Array.isArray(R?.lines) && R.lines.length) return R.lines.map((l) => ({ text: String(l.text ?? l.description ?? ''), price: l.price ?? l.amount ?? null, bbox: Array.isArray(l.bbox) && l.bbox.length === 4 ? l.bbox : null }));
  return (R?.extraction?.lines ?? []).map((l) => ({ text: String(l.description ?? l.text ?? ''), price: l.amount ?? l.price ?? null, bbox: Array.isArray(l.bbox) && l.bbox.length === 4 ? l.bbox : null }));
}
/** Indeksene til linjene som matcher. */
export function matchLines(lines, q) {
  const t = terms(q);
  if (!t.length) return [];
  return lines.map((l, i) => [i, norm(l.text)]).filter(([, n]) => t.every((w) => n.includes(w))).map(([i]) => i);
}
/** Teksten med ordet markert (<mark>). Aksentuavhengig: posisjonene finnes i den normaliserte teksten (samme lengde for vanlige tegn). */
export function markText(text, q) {
  const t = terms(q), s = String(text ?? '');
  if (!t.length) return esc(s);
  const n = norm(s);
  if (n.length !== s.length) return esc(s); // sjeldne tegn som endrer lengden: ingen ordmarkering, bare linjen
  const hit = new Array(s.length).fill(false);
  for (const w of t) { let i = n.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) hit[k] = true; i = n.indexOf(w, i + w.length); } }
  let out = '', on = false;
  for (let i = 0; i < s.length; i++) { if (hit[i] !== on) { out += hit[i] ? '<mark class="rc-mk">' : '</mark>'; on = hit[i]; } out += esc(s[i]); }
  return out + (on ? '</mark>' : '');
}
/** Banneret over kvitteringen. */
export function hlBanner(q, lines, idx) {
  if (!q) return '';
  if (!idx.length) return `<div class="rc-hlb none" role="status"><span>Fant ikke «${esc(q)}» i varelinjene.</span><button type="button" class="rc-hlx" data-act="hl-clear">Fjern</button></div>`;
  const f = lines[idx[0]];
  return `<div class="rc-hlb" role="status"><button type="button" class="rc-hlgo" data-act="hl-scroll"><span class="rc-hlq">‹${esc(q)}›</span> står på linje ${idx[0] + 1}${f.price != null ? ` · ${n2(f.price)} kr` : ''}${idx.length > 1 ? ` <span class="note">og ${idx.length - 1} til</span>` : ''}</button><button type="button" class="rc-hlx" data-act="hl-clear">Fjern</button></div>`;
}
/** Linjelisten med markerte linjer. */
export function hlList(q, lines, idx) {
  const on = new Set(idx);
  return `<div class="rc-hll">${lines.map((l, i) => `<div class="rc-hlr${on.has(i) ? ' hit' : ''}" data-hl-line="${i}"><span>${on.has(i) ? markText(l.text, q) : esc(l.text)}</span><span class="mono">${l.price != null ? n2(l.price) : ''}</span></div>`).join('') || '<div class="note">Ingen varelinjer lest.</div>'}</div>`;
}
/** Bildet med gule rektangler over linjene som matcher (bbox i prosent). */
export function hlImage(src, lines, idx) {
  const boxes = idx.map((i) => lines[i]?.bbox).filter(Boolean);
  return `<div class="rc-hlimg" data-hl-img><div class="rc-hlin"><img src="${esc(src)}" alt="Kvitteringsbilde">${boxes.map(([x, y, w, h], k) => `<i class="rc-box" style="left:${+x}%;top:${+y}%;width:${+w}%;height:${+h}%"${k ? '' : ' data-hl-first'}></i>`).join('')}</div></div>`;
}
/** Scroller til første treff (midt på) og lar linjen pulsere to ganger. */
export function hlFocus(root) {
  const el = root?.querySelector('[data-hl-first]') ?? root?.querySelector('.rc-hlr.hit');
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  root.querySelectorAll('.rc-hlr.hit,.rc-box').forEach((x) => { x.classList.remove('pulse'); void x.offsetWidth; x.classList.add('pulse'); });
}
