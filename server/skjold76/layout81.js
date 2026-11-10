// Prompt 81 (SPANSRV): Skjold Lab – sammenslåtte skuffer (store 2 × 2 og brede 2 × 1) og forhåndsoppsettet «Skjold Lab-hylla (3D-print)».
// Oppsettet regnes ut med samme algoritme som OpenSCAD-modellen (tools/skjoldlab3d/skjoldlab_ledvegg.scad, variant "hele_hylla":
// et_u, nb, venstre_rader, brede_h). Modellen teller rader nedenfra (enhet u = 0 nederst); her er rad 1 øverst.
//   GET  /presets                       → [{id, name, options:{etasjer:[4,5]}, description}]
//   POST /cabinets/:id/preset {id, etasjer} → oppdatert skap (409 med deler utenfor nye grenser)
//   PUT  /cabinets/:id/drawers/:row/:col {spanR, spanC} (håndteres i api.js, logikken er her: setSpan81)
import { db } from '../db.js';
import { cabinetRow76, drawerRows76, setDrawer76, updatePart76, addHistory76, locSnap76, partRow76, reindexDrawer76, updateCabinet76, coverMap81, drawerRow76, now76 } from './store.js';
import { ledsOf78 } from './leds78.js';

const q = (sql) => db.prepare(sql);

const deling = (n, m, i) => Math.floor(n / m) + (i < n % m ? 1 : 0);
const sumDeling = (n, m, i) => { let s = 0; for (let k = 0; k < i; k++) s += deling(n, m, k); return s; };

/**
 * Port av «hele_hylla» fra skjoldlab_ledvegg.scad.
 * U = enkeltrader (h_U), K = skuffkolonner (h_K). → {rows, cols, spans:[{row, col, spanR, spanC}]} med rad 1 øverst, kolonne 1 til venstre.
 */
export function shelfLayout81({ U, K = 11, venstreKolonner = 4, store = 10, brede = 10, modulKolonnerMaks = 3, modulRaderMaks = 3 }) {
  const rpm = Math.max(1, modulRaderMaks), kpm = Math.max(1, modulKolonnerMaks);
  const hNy = Math.max(1, Math.ceil(U / rpm));
  const vkOn = venstreKolonner >= 2 && store + brede > 0;
  const vk = vkOn ? 2 * Math.floor(venstreKolonner / 2) : 0;
  const halv = Math.max(1, vk / 2);
  const nxr = Math.max(1, Math.ceil((K - vk) / kpm));
  const kw = vkOn ? [vk, ...Array.from({ length: nxr }, (_, i) => deling(K - vk, nxr, i))]
    : (() => { const n = Math.max(1, Math.ceil(K / kpm)); return Array.from({ length: n }, (_, i) => deling(K, n, i)); })();
  const kwFor = (i) => kw.slice(0, Math.max(0, i)).reduce((s, x) => s + x, 0);
  const etU = (j) => deling(U, hNy, j), etS = (j) => sumDeling(U, hNy, j);
  const capB = (j) => Math.floor(etU(j) / 2);
  const capBFor = (j) => { let s = 0; for (let k = 0; k < j; k++) s += capB(k); return s; };
  const NB = vkOn ? Math.min(capBFor(hNy), Math.ceil(Math.max(0, store) / halv)) : 0;
  const nb = (j) => Math.max(0, Math.min(capB(j), NB - capBFor(j)));
  const f1For = (j) => { let s = 0; for (let k = 0; k < j; k++) s += etU(k) - 2 * nb(k); return s; };
  const NWL = vkOn ? Math.min(f1For(hNy), Math.ceil(Math.max(0, brede) / halv)) : 0;
  const i0r = vkOn ? 1 : 0;
  let parR = 0; for (let i = i0r; i < kw.length; i++) parR += Math.floor(kw[i] / 2);
  const nBrR = Math.min(parR * U, Math.max(0, brede - NWL * halv));
  const parForR = (i) => { let s = 0; for (let k = i0r; k < i; k++) s += Math.floor(kw[k] / 2); return s; };
  const bredeH = (u, i) => { const qq = U - 1 - u, n = nBrR - qq * parR; return Math.max(0, Math.min(Math.floor(kw[i] / 2), n - parForR(i))); };

  const spans = [];
  // u (nedenfra, 0 = nederst) og høyde h → øverste rad (rad 1 øverst)
  const topRow = (u, h) => U - (u + h - 1);
  for (let j = 0; j < hNy; j++) {
    const s = etS(j);
    if (vkOn) {
      for (let b = 0; b < nb(j); b++) for (let p = 0; p < halv; p++) spans.push({ row: topRow(s + 2 * b, 2), col: 2 * p + 1, spanR: 2, spanC: 2 });
      for (let t = 0; t < etU(j) - 2 * nb(j); t++) if (f1For(j) + t < NWL) for (let p = 0; p < halv; p++) spans.push({ row: topRow(s + 2 * nb(j) + t, 1), col: 2 * p + 1, spanR: 1, spanC: 2 });
    }
    for (let i = i0r; i < kw.length; i++) for (let t = 0; t < etU(j); t++) {
      for (let p = 0; p < bredeH(s + t, i); p++) spans.push({ row: topRow(s + t, 1), col: kwFor(i) + 2 * p + 1, spanR: 1, spanC: 2 });
    }
  }
  spans.sort((a, b) => a.row - b.row || a.col - b.col);
  return { rows: U, cols: K, spans };
}

export const ETASJER81 = { 4: 11, 5: 13 };
export const PRESETS81 = [{
  id: 'skjoldlab3d', name: 'Skjold Lab-hylla (3D-print)', options: { etasjer: [4, 5] },
  description: 'Hylla fra 3D-modellen (skjoldlab_ledvegg.scad): 11 skuffer i bredden, store skuffer (2 × 2) og brede (2 × 1) til venstre og øverst til høyre, LED-stripe over hver rad. 4 etasjer = 11 rader, 5 etasjer = 13 rader.',
}];
/** Oppsettet for forhåndsvalget (id, etasjer) → {rows, cols, spans} | {error}. */
export function presetLayout81(id, etasjer) {
  if (id !== 'skjoldlab3d') return { error: `Ukjent forhåndsoppsett «${String(id ?? '').slice(0, 40)}»` };
  const e = Number(etasjer ?? 4);
  if (!ETASJER81[e]) return { error: 'etasjer må være 4 eller 5' };
  return shelfLayout81({ U: ETASJER81[e], K: 11 });
}
export const summary81 = (lay) => ({ big: lay.spans.filter((s) => s.spanR === 2 && s.spanC === 2).length, wide: lay.spans.filter((s) => s.spanR === 1 && s.spanC === 2).length,
  single: lay.rows * lay.cols - lay.spans.reduce((s, x) => s + x.spanR * x.spanC, 0) });

/** Antall skuffer (ankere + vanlige) i skapet. */
export function drawerCount81(cab) {
  const covered = coverMap81(cab.id);
  let n = 0;
  for (const k of covered.keys()) { const [r, c] = k.split(':').map(Number); if (r <= cab.rows && c <= cab.cols) n++; }
  return cab.rows * cab.cols - n;
}

/** Flytter deler i ruter som dekkes av ankeret (a = {row, col, span_r, span_c, compartments}) til ankeret. → antall flyttet. */
function moveIntoAnchor(user, cab, a) {
  const ids = q('SELECT id FROM skj_parts WHERE user_id=? AND cabinet_id=? AND deleted_at IS NULL AND row>=? AND row<? AND col>=? AND col<? AND NOT (row=? AND col=?)')
    .pluck().all(user, cab.id, a.row, a.row + a.span_r, a.col, a.col + a.span_c, a.row, a.col);
  for (const id of ids) {
    const p = partRow76(user, id), before = locSnap76(p);
    const comp = p.compartment && p.compartment <= (a.compartments ?? 1) ? p.compartment : null;
    q('UPDATE skj_parts SET row=?, col=?, compartment=?, updated=? WHERE id=?').run(a.row, a.col, comp, now76(), id);
    addHistory76(user, id, 'flyttet', before, { ...locSnap76(partRow76(user, id)), note: 'flyttet ved sammenslåing' });
  }
  // Papirkurven: peker også på ankeret (gjenoppretting havner riktig).
  q('UPDATE skj_parts SET row=?, col=? WHERE user_id=? AND cabinet_id=? AND deleted_at IS NOT NULL AND row>=? AND row<? AND col>=? AND col<?')
    .run(a.row, a.col, user, cab.id, a.row, a.row + a.span_r, a.col, a.col + a.span_c);
  if (ids.length) reindexDrawer76(user, cab.id, a.row, a.col);
  return ids.length;
}

/**
 * Slå sammen / del skuffen (row, col) til spanR × spanC. → {ok, moved} | {error, status}
 * Gyldig: 1–4, innenfor skapet, ingen overlapp med andre ankre (de dekkede rutene slettes ikke – etikettene kommer tilbake når skuffen deles).
 */
export function setSpan81(user, cab, row, col, spanR, spanC) {
  if (!Number.isInteger(spanR) || spanR < 1 || spanR > 4 || !Number.isInteger(spanC) || spanC < 1 || spanC > 4) return { error: 'spanR og spanC må være 1–4', status: 400 };
  if (row + spanR - 1 > cab.rows || col + spanC - 1 > cab.cols) return { error: `Skuffen går utenfor skapet (${cab.rows} rader × ${cab.cols} skuffer)`, status: 409 };
  const others = q('SELECT * FROM skj_drawers WHERE cabinet_id=? AND (span_r>1 OR span_c>1) AND NOT (row=? AND col=?)').all(cab.id, row, col);
  for (const o of others) {
    if (o.row < row + spanR && row < o.row + o.span_r && o.col < col + spanC && col < o.col + o.span_c) {
      const txt = `${o.row}${o.span_r > 1 ? `–${o.row + o.span_r - 1}` : ''}-${o.col}${o.span_c > 1 ? `–${o.col + o.span_c - 1}` : ''}`;
      return { error: `Overlapper den sammenslåtte skuffen ${o.row}-${o.col} (${txt}). Del den først.`, status: 409, conflict: { row: o.row, col: o.col, spanR: o.span_r, spanC: o.span_c } };
    }
  }
  let moved = 0;
  db.transaction(() => {
    setDrawer76(cab.id, row, col, { spanR, spanC });
    const a = drawerRow76(cab.id, row, col) ?? { row, col, span_r: 1, span_c: 1, compartments: 1 };
    if (spanR > 1 || spanC > 1) moved = moveIntoAnchor(user, cab, a);
  })();
  return { ok: true, moved };
}

/** Bruk forhåndsoppsettet på skapet. → {cab} | {error, status, parts?} */
export function applyPreset81(user, cab, { id, etasjer }) {
  const lay = presetLayout81(id, etasjer);
  if (lay.error) return { error: lay.error, status: 400 };
  const outside = q('SELECT id, name, row, col FROM skj_parts WHERE user_id=? AND cabinet_id=? AND deleted_at IS NULL AND (row>? OR col>?) ORDER BY row, col, name').all(user, cab.id, lay.rows, lay.cols);
  if (outside.length) {
    return { error: `${outside.length} ${outside.length === 1 ? 'del ligger' : 'deler ligger'} i skuffer utenfor ${lay.rows} × ${lay.cols} – flytt dem først`, status: 409,
      parts: outside.map((p) => ({ id: p.id, name: p.name, row: p.row, col: p.col, short: `${p.row}-${p.col}` })) };
  }
  let moved = 0;
  db.transaction(() => {
    q('DELETE FROM skj_drawers WHERE cabinet_id=? AND (row>? OR col>?)').run(cab.id, lay.rows, lay.cols);
    for (const d of drawerRows76(cab.id)) if (d.span_r > 1 || d.span_c > 1) setDrawer76(cab.id, d.row, d.col, { spanR: 1, spanC: 1 });
    const cfg = ledsOf78(cab);
    const leds = { ...cfg, layout: 'same', ledPitchMm: 16.667, drawerPitchMm: 50, firstDrawerXmm: 25, rows: [], overrides: {} };
    q('UPDATE skj_cabinets SET leds=? WHERE id=?').run(JSON.stringify(leds), cab.id);
    updateCabinet76(user, cab.id, { rows: lay.rows, cols: lay.cols, kind: '3d' });
    const cab2 = cabinetRow76(user, cab.id);
    for (const s of lay.spans) {
      setDrawer76(cab.id, s.row, s.col, { spanR: s.spanR, spanC: s.spanC });
      moved += moveIntoAnchor(user, cab2, drawerRow76(cab.id, s.row, s.col));
    }
  })();
  return { cab: cabinetRow76(user, cab.id), moved, layout: summary81(lay) };
}

/** Når skapet krymper (PATCH rows/cols): spenn som stikker utenfor, kortes ned. */
export function clampSpans81(cabId, rows, cols) {
  q('UPDATE skj_drawers SET span_r=min(span_r, ?-row+1), span_c=min(span_c, ?-col+1) WHERE cabinet_id=? AND row<=? AND col<=?').run(rows, cols, cabId, rows, cols);
  q('DELETE FROM skj_drawers WHERE cabinet_id=? AND span_r=1 AND span_c=1 AND label IS NULL AND compartments=1 AND color IS NULL').run(cabId);
}

/** GET /presets og POST /cabinets/:id/preset. */
export function presetsMount81(app, { cabinetOut, NOCAB, body }) {
  app.get('/presets', (c) => c.json(PRESETS81, 200, { 'Cache-Control': 'no-store' }));
  app.post('/cabinets/:id{[0-9]+}/preset', async (c) => {
    const u = c.get('user'), cab = cabinetRow76(u, c.req.param('id')), b = await body(c);
    if (!cab) return c.json(NOCAB, 404);
    if (!b) return c.json({ error: "Forventet {id:'skjoldlab3d', etasjer:4|5}" }, 400);
    const r = applyPreset81(u, cab, b);
    if (r.error) return c.json({ error: r.error, ...(r.parts ? { parts: r.parts } : {}) }, r.status);
    return c.json({ ...cabinetOut(r.cab, u), moved: r.moved, layout: r.layout });
  });
}
