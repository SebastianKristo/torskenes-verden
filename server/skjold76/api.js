// Prompt 76 (SKJSRV): /api/skjold – Skjold Lab (sorteringsskap). Sesjon eller app-token, alt per bruker (admin ser bare sine egne).
// Se $S/CONTRACT76.md og $S/P76-NOTES.md for formen på svarene.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authOrToken } from '../mobile.js';
import { userInfo } from '../auth.js';
import { db } from '../db.js';
import { originOf46 } from '../public-url46.js';
import {
  KINDS76, UNITS76, ensureUser76, cabinetRow76, cabinetRows76, insertCabinet76, updateCabinet76, drawerRows76, drawerOut76, setDrawer76, reindexDrawer76,
  partRow76, partOut76, cabCache76, insertPart76, updatePart76, softDelete76, restore76, purge76, addHistory76, historyOf76, historyAll76, locSnap76,
  searchParts76, setFileUrl76, thumbOf76, shortLoc76, defaultLabel76, indexPart76, now76, words76, coverMap81, coverOf81, spanText81,
} from './store.js';
import { presetsMount81, presetLayout81, applyPreset81, setSpan81, clampSpans81, drawerCount81 } from './layout81.js'; // prompt 81 (SPANSRV): sammenslåtte skuffer
import { saveImage76, removeImage76, readImage76, signedUrl76, signedUser76, MAX_IN76 } from './images.js';
import { exportCsv76, importCsv76 } from './csv.js';
import { labelsHtml76 } from './labels.js';
import { mountAi77, undoEdit77 } from './ai77.js'; // prompt 77 (SKJAISRV): forslag, bildesøk, Rydd opp
import { thumbUser77 } from './images77.js';
import { mountLeds78, ledsBrief78 } from './leds78.js'; // prompt 78 (LEDSRV): LED over hver skuff (WLED)
import { mountPicklist79 } from './picklist79.js'; // prompt 79 (PICKSRV): plukkliste
import { mountProjects82, usedIn82 } from './projects82.js'; // prompt 82 (CHKSRV): produkter – sjekk ut/inn deler

setFileUrl76((name, user) => signedUrl76(name, user));
const q = (sql) => db.prepare(sql);
const NS = { 'Cache-Control': 'no-store' };
const J = (s, d) => { if (s == null) return d; try { return JSON.parse(s) ?? d; } catch { return d; } };
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const longStr = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n) : '');
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; };
const intIn = (v, lo, hi) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const numOk = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))));
const toNum = (v) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.')));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export const skjoldApi76 = new Hono();

// Bildefilene: signert URL (appenes bildelastere) eller vanlig sesjon/token. Alt annet: sesjon eller app-token.
skjoldApi76.use('*', async (c, next) => {
  const m = /\/files\/([^/]+)$/.exec(c.req.path);
  if (m && c.req.method === 'GET' && c.req.query('sig')) {
    const u = signedUser76(m[1], c.req.query('u'), c.req.query('exp'), c.req.query('sig'));
    if (u && userInfo(u)) { c.set('user', u); return next(); }
  }
  // Prompt 77: miniatyrer fra bildesøket – id-en er kryptert, signert og bundet til brukeren (virker i bildelastere uten header).
  const t77 = /\/ai\/thumb\/([^/]+)$/.exec(c.req.path);
  if (t77 && c.req.method === 'GET') { const u = thumbUser77(t77[1]); if (u && userInfo(u)) { c.set('user', u); return next(); } }
  return authOrToken(c, async () => { ensureUser76(c.get('user')); await next(); });
});

/* ---------------- Skap ---------------- */

function cabinetOut(cab, user) {
  const parts = q('SELECT count(*) FROM skj_parts WHERE user_id=? AND cabinet_id=? AND deleted_at IS NULL').pluck().get(user, cab.id);
  const used = q('SELECT count(*) FROM (SELECT DISTINCT row, col FROM skj_parts WHERE user_id=? AND cabinet_id=? AND deleted_at IS NULL)').pluck().get(user, cab.id);
  return { id: cab.id, name: cab.name, rows: cab.rows, cols: cab.cols, kind: cab.kind, sort: cab.sort, notes: cab.notes ?? null,
    photoUrl: cab.photo ? signedUrl76(cab.photo, user) : null, thumbUrl: cab.photo ? signedUrl76(thumbOf76(cab.photo), user) : null,
    corners: J(cab.photo_corners, null), counts: { parts, usedDrawers: used, drawers: drawerCount81(cab) }, created: iso(cab.created), updated: iso(cab.updated), leds: ledsBrief78(cab) };
}
function cabinetFields(b, { partial = false } = {}) {
  const f = {};
  if (!partial || has(b, 'name')) { const n = str(b.name, 60); if (!n) return { error: 'Navn mangler' }; f.name = n; }
  if (!partial || has(b, 'rows')) { const r = intIn(b.rows ?? 12, 1, 40); if (r == null) return { error: 'rows må være 1–40' }; f.rows = r; }
  if (!partial || has(b, 'cols')) { const r = intIn(b.cols ?? 5, 1, 20); if (r == null) return { error: 'cols må være 1–20' }; f.cols = r; }
  if (!partial || has(b, 'kind')) { const k = b.kind ?? 'kjøpt'; if (!KINDS76.includes(k)) return { error: `kind må være ${KINDS76.join(' eller ')}` }; f.kind = k; }
  if (has(b, 'notes')) f.notes = longStr(b.notes, 2000) || null;
  if (partial && has(b, 'sort')) { const s = intIn(b.sort, 0, 1000); if (s == null) return { error: 'sort må være 0–1000' }; f.sort = s; }
  return { f };
}
const cabOr404 = (c) => cabinetRow76(c.get('user'), c.req.param('id'));
const NOCAB = { error: 'Fant ikke skapet' };

skjoldApi76.get('/cabinets', (c) => { const u = c.get('user'); return c.json(cabinetRows76(u).map((x) => cabinetOut(x, u)), 200, NS); });
skjoldApi76.post('/cabinets', async (c) => {
  const u = c.get('user'), b = await body(c);
  if (!b) return c.json({ error: 'Forventet {name, rows, cols, kind}' }, 400);
  const r = cabinetFields(b);
  if (r.error) return c.json({ error: r.error }, 400);
  if (cabinetRows76(u).length >= 50) return c.json({ error: 'Maks 50 skap' }, 409);
  // Prompt 81: {name, preset:{id, etasjer}} – skapet får forhåndsoppsettet med en gang.
  if (b.preset != null) { const pl = typeof b.preset === 'object' ? presetLayout81(b.preset.id, b.preset.etasjer) : { error: 'preset må være {id, etasjer}' }; if (pl.error) return c.json({ error: pl.error }, 400); }
  let cab = insertCabinet76(u, r.f);
  if (b.preset != null) cab = applyPreset81(u, cab, b.preset).cab ?? cab;
  return c.json(cabinetOut(cab, u), 201);
});
skjoldApi76.patch('/cabinets/:id', async (c) => {
  const u = c.get('user'), cab = cabOr404(c), b = await body(c);
  if (!cab) return c.json(NOCAB, 404);
  if (!b) return c.json({ error: 'Forventet JSON' }, 400);
  const r = cabinetFields(b, { partial: true });
  if (r.error) return c.json({ error: r.error }, 400);
  const rows = r.f.rows ?? cab.rows, cols = r.f.cols ?? cab.cols;
  if (rows < cab.rows || cols < cab.cols) {
    const out = q('SELECT count(*) FROM skj_parts WHERE user_id=? AND cabinet_id=? AND deleted_at IS NULL AND (row>? OR col>?)').pluck().get(u, cab.id, rows, cols);
    if (out) return c.json({ error: `${out} ${out === 1 ? 'del ligger' : 'deler ligger'} i skuffer som forsvinner – flytt dem først`, parts: out }, 409);
    q('DELETE FROM skj_drawers WHERE cabinet_id=? AND (row>? OR col>?)').run(cab.id, rows, cols);
    clampSpans81(cab.id, rows, cols);
  }
  const nameChanged = r.f.name && r.f.name !== cab.name;
  const nx = updateCabinet76(u, cab.id, r.f);
  if (nameChanged) for (const id of q('SELECT id FROM skj_parts WHERE cabinet_id=? AND deleted_at IS NULL').pluck().all(cab.id)) indexPart76(id);
  return c.json(cabinetOut(nx, u));
});
skjoldApi76.delete('/cabinets/:id', (c) => {
  const u = c.get('user'), cab = cabOr404(c);
  if (!cab) return c.json(NOCAB, 404);
  const ids = q('SELECT id FROM skj_parts WHERE user_id=? AND cabinet_id=? AND deleted_at IS NULL').pluck().all(u, cab.id);
  const move = c.req.query('move');
  let target = null;
  if (ids.length) {
    if (move == null || move === '') return c.json({ error: `Skapet har ${ids.length} ${ids.length === 1 ? 'del' : 'deler'}. Velg hvor de skal (?move=<skap-id> eller ?move=none).`, parts: ids.length }, 409);
    if (move !== 'none') {
      target = cabinetRow76(u, move);
      if (!target || target.id === cab.id) return c.json({ error: 'Ukjent skap å flytte til' }, 400);
    }
  }
  db.transaction(() => {
    for (const id of ids) {
      const p = partRow76(u, id), before = locSnap76(p);
      const keep = target && p.row <= target.rows && p.col <= target.cols;
      updatePart76(u, id, keep ? { cabinet_id: target.id } : { cabinet_id: null, row: null, col: null, compartment: null });
      addHistory76(u, id, 'flyttet', before, locSnap76(partRow76(u, id)));
    }
    // Slettede deler i papirkurven peker ikke lenger på skapet.
    q('UPDATE skj_parts SET cabinet_id=NULL, row=NULL, col=NULL, compartment=NULL WHERE user_id=? AND cabinet_id=? AND deleted_at IS NOT NULL').run(u, cab.id);
    q('DELETE FROM skj_drawers WHERE cabinet_id=?').run(cab.id);
    q('DELETE FROM skj_cabinets WHERE id=? AND user_id=?').run(cab.id, u);
  })();
  if (cab.photo) removeImage76(cab.photo);
  return c.json({ ok: true, moved: ids.length, to: target ? target.id : ids.length ? 'none' : null });
});

const uploadLimit = bodyLimit({ maxSize: MAX_IN76 + 256 * 1024, onError: (c) => c.json({ error: 'Bildet er for stort (maks 10 MB)' }, 413) });
async function fileOf(c) {
  const ct = c.req.header('content-type') ?? '';
  if (/^multipart\/form-data/i.test(ct)) {
    const b = await c.req.parseBody().catch(() => ({}));
    const f = b.file ?? b.photo ?? b.image;
    return f instanceof File ? Buffer.from(await f.arrayBuffer()) : null;
  }
  if (/^image\//i.test(ct)) return Buffer.from(await c.req.arrayBuffer());
  return null;
}
skjoldApi76.post('/cabinets/:id/photo', uploadLimit, async (c) => {
  const u = c.get('user'), cab = cabOr404(c);
  if (!cab) return c.json(NOCAB, 404);
  const buf = await fileOf(c);
  if (!buf) return c.json({ error: 'Mangler fil (multipart «file»)' }, 400);
  const r = await saveImage76(u, buf);
  if (r.error) return c.json({ error: r.error }, r.status);
  if (cab.photo) removeImage76(cab.photo);
  const nx = updateCabinet76(u, cab.id, { photo: r.name });
  return c.json({ ...cabinetOut(nx, u), converted: r.converted }, 201);
});
skjoldApi76.delete('/cabinets/:id/photo', (c) => {
  const u = c.get('user'), cab = cabOr404(c);
  if (!cab) return c.json(NOCAB, 404);
  if (cab.photo) removeImage76(cab.photo);
  return c.json(cabinetOut(updateCabinet76(u, cab.id, { photo: null, photo_corners: null }), u));
});
const pt = (p) => (p && typeof p === 'object' ? (Array.isArray(p) ? { x: p[0], y: p[1] } : p) : null);
skjoldApi76.put('/cabinets/:id/corners', async (c) => {
  const u = c.get('user'), cab = cabOr404(c), b = await body(c);
  if (!cab) return c.json(NOCAB, 404);
  if (!b) return c.json({ error: 'Forventet {tl, tr, br, bl} med {x, y} 0–1' }, 400);
  if (b.tl === null && b.tr === null) return c.json(cabinetOut(updateCabinet76(u, cab.id, { photo_corners: null }), u));
  const out = {};
  for (const k of ['tl', 'tr', 'br', 'bl']) {
    const p = pt(b[k]);
    if (!p || !numOk(p.x) || !numOk(p.y)) return c.json({ error: `${k} mangler {x, y}` }, 400);
    const x = toNum(p.x), y = toNum(p.y);
    if (x < 0 || x > 1 || y < 0 || y > 1) return c.json({ error: `${k} må ligge innenfor bildet (0–1)` }, 400);
    out[k] = { x: Math.round(x * 1e4) / 1e4, y: Math.round(y * 1e4) / 1e4 };
  }
  // Enkel sjekk: firkanten må være konveks og ikke vrengt (tl→tr→br→bl med klokka i bildekoordinater).
  const P = [out.tl, out.tr, out.br, out.bl];
  const cross = P.map((a, i) => { const b2 = P[(i + 1) % 4], c2 = P[(i + 2) % 4]; return (b2.x - a.x) * (c2.y - b2.y) - (b2.y - a.y) * (c2.x - b2.x); });
  if (!cross.every((v) => v > 0)) return c.json({ error: 'Hjørnene må danne en firkant i rekkefølgen øverst venstre, øverst høyre, nederst høyre, nederst venstre' }, 400);
  return c.json(cabinetOut(updateCabinet76(u, cab.id, { photo_corners: JSON.stringify(out) }), u));
});

skjoldApi76.get('/cabinets/:id/map', (c) => {
  const u = c.get('user'), cab = cabOr404(c);
  if (!cab) return c.json(NOCAB, 404);
  const dr = new Map(drawerRows76(cab.id).map((d) => [`${d.row}:${d.col}`, d]));
  const ps = q('SELECT * FROM skj_parts WHERE user_id=? AND cabinet_id=? AND deleted_at IS NULL ORDER BY compartment, name').all(u, cab.id);
  const by = new Map(), cover = coverMap81(cab.id);
  // Prompt 81: deler i en dekket rute (eldre data) telles på ankeret; dekkede ruter har coveredBy og ingen deler.
  for (const p of ps) { const a = cover.get(`${p.row}:${p.col}`), k = a ? `${a.row}:${a.col}` : `${p.row}:${p.col}`; if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  const drawers = [];
  for (let r = 1; r <= cab.rows; r++) for (let col = 1; col <= cab.cols; col++) {
    const list = cover.has(`${r}:${col}`) ? [] : by.get(`${r}:${col}`) ?? [];
    drawers.push({ ...drawerOut76(cab, r, col, dr.get(`${r}:${col}`) ?? null, cover), count: list.length, low: list.some((p) => p.min_qty != null && p.qty <= p.min_qty),
      parts: list.slice(0, 30).map((p) => { const ph = J(p.photos, []); return { id: p.id, name: p.name, qty: p.qty, unit: p.unit, compartment: p.compartment ?? null, thumbUrl: ph.length ? signedUrl76(thumbOf76(ph[0]), u) : null }; }) });
  }
  const co = cabinetOut(cab, u);
  return c.json({ id: cab.id, name: cab.name, rows: cab.rows, cols: cab.cols, kind: cab.kind, photoUrl: co.photoUrl, corners: co.corners, counts: co.counts, drawers }, 200, NS);
});
skjoldApi76.put('/cabinets/:id/drawers/:row/:col', async (c) => {
  const u = c.get('user'), cab = cabOr404(c), b = await body(c);
  if (!cab) return c.json(NOCAB, 404);
  let row = intIn(c.req.param('row'), 1, cab.rows), col = intIn(c.req.param('col'), 1, cab.cols);
  if (row == null || col == null) return c.json({ error: `Skuffen finnes ikke (rad 1–${cab.rows}, skuff 1–${cab.cols})` }, 404);
  if (!b) return c.json({ error: 'Forventet {label, compartments, color, spanR, spanC}' }, 400);
  // Prompt 81: spenn (slå sammen / del). En dekket rute uten spenn i body = ankeret.
  let moved = 0;
  if (has(b, 'spanR') || has(b, 'spanC')) {
    const cur = q('SELECT span_r, span_c FROM skj_drawers WHERE cabinet_id=? AND row=? AND col=?').get(cab.id, row, col) ?? { span_r: 1, span_c: 1 };
    const sr = has(b, 'spanR') ? intIn(b.spanR, 1, 4) : cur.span_r, sc = has(b, 'spanC') ? intIn(b.spanC, 1, 4) : cur.span_c;
    if (sr == null || sc == null) return c.json({ error: 'spanR og spanC må være 1–4' }, 400);
    const sp = setSpan81(u, cab, row, col, sr, sc);
    if (sp.error) return c.json({ error: sp.error, ...(sp.conflict ? { conflict: sp.conflict } : {}) }, sp.status);
    moved = sp.moved;
  } else { const a = coverOf81(cab.id, row, col); if (a) { row = a.row; col = a.col; } }
  const f = {};
  if (has(b, 'label')) { const l = str(b.label ?? '', 40); f.label = l && l !== defaultLabel76(row, col) ? l : null; }
  if (has(b, 'compartments')) { const n = intIn(b.compartments ?? 1, 1, 4); if (n == null) return c.json({ error: 'compartments må være 1–4' }, 400); f.compartments = n; }
  if (has(b, 'color')) { const s = str(b.color ?? '', 9); if (s && !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(s)) return c.json({ error: 'color må være #rgb eller #rrggbb' }, 400); f.color = s || null; }
  setDrawer76(cab.id, row, col, f);
  if (f.compartments) q('UPDATE skj_parts SET compartment=NULL WHERE user_id=? AND cabinet_id=? AND row=? AND col=? AND compartment>?').run(u, cab.id, row, col, f.compartments);
  reindexDrawer76(u, cab.id, row, col);
  return c.json({ ok: true, drawer: drawerOut76(cab, row, col), ...(moved ? { moved } : {}) });
});

/* ---------------- Deler ---------------- */

/** Felt fra body → {f} | {error}. partial = PATCH. */
function partFields(u, b, { partial = false } = {}) {
  const f = {};
  if (!partial || has(b, 'name')) { const n = str(b.name, 120); if (!n) return { error: 'Navn mangler' }; f.name = n; }
  if (has(b, 'category')) f.category = str(b.category ?? '', 60) || null;
  if (has(b, 'description')) f.description = longStr(b.description ?? '', 2000) || null;
  if (has(b, 'supplier')) f.supplier = str(b.supplier ?? '', 80) || null;
  if (has(b, 'specs')) {
    const s = b.specs ?? {};
    if (typeof s !== 'object' || Array.isArray(s)) return { error: 'specs må være et objekt' };
    f.specs = Object.fromEntries(Object.entries(s).map(([k, v]) => [str(k, 40), str(v == null ? '' : String(v), 80)]).filter(([k, v]) => k && v).slice(0, 20));
  }
  for (const k of ['qty', 'min_qty', 'price']) {
    const key = k === 'min_qty' && !has(b, 'min_qty') && has(b, 'minQty') ? 'minQty' : k;
    if (!has(b, key)) continue;
    const v = b[key];
    if (v == null || v === '') { if (k === 'qty') return { error: 'qty må være et tall ≥ 0' }; f[k] = null; continue; }
    if (!numOk(v) || toNum(v) < 0 || toNum(v) > 1e9) return { error: `${k} må være et tall ≥ 0` };
    f[k] = Math.round(toNum(v) * 1000) / 1000;
  }
  if (has(b, 'unit')) { const un = str(b.unit ?? 'stk', 8).toLowerCase() || 'stk'; if (!UNITS76.includes(un)) return { error: `unit må være ${UNITS76.join(', ')}` }; f.unit = un; }
  if (has(b, 'tags')) {
    const t = Array.isArray(b.tags) ? b.tags : typeof b.tags === 'string' ? b.tags.split(/[,;]/) : null;
    if (!t) return { error: 'tags må være en liste' };
    f.tags = [...new Set(t.map((x) => str(String(x ?? ''), 30)).filter(Boolean))].slice(0, 20);
  }
  if (has(b, 'url')) { const s = str(b.url ?? '', 500); if (s && !/^https?:\/\/[^\s]+$/i.test(s)) return { error: 'url må starte med http:// eller https://' }; f.url = s || null; }
  const loc = locFields(u, b);
  if (loc.error) return loc;
  Object.assign(f, loc.f);
  return { f };
}
/** Plassering fra body ({cabinetId|cabinet_id, row, col, compartment}). cabinetId null → «Uten plass». */
function locFields(u, b, { required = false } = {}) {
  const ck = has(b, 'cabinetId') ? 'cabinetId' : has(b, 'cabinet_id') ? 'cabinet_id' : null;
  if (!ck) return required ? { error: 'cabinetId mangler (null = uten plass)' } : { f: {} };
  if (b[ck] == null || b[ck] === '' || b[ck] === 'none') return { f: { cabinet_id: null, row: null, col: null, compartment: null } };
  const cab = cabinetRow76(u, b[ck]);
  if (!cab) return { error: 'Ukjent skap' };
  const row = intIn(b.row, 1, cab.rows), col = intIn(b.col, 1, cab.cols);
  if (row == null) return { error: `row må være 1–${cab.rows}` };
  if (col == null) return { error: `col må være 1–${cab.cols}` };
  let comp = null;
  if (b.compartment != null && b.compartment !== '') { comp = intIn(b.compartment, 1, 4); if (comp == null) return { error: 'compartment må være 1–4' }; }
  return { f: { cabinet_id: cab.id, row, col, compartment: comp }, cab };
}
const partOr404 = (c) => partRow76(c.get('user'), c.req.param('id'));
const NOPART = { error: 'Fant ikke delen' };
const out = (r, u) => partOut76(r, { user: u });
/** Andre deler i samme skuff (og samme rom, eller uten rom). */
function occupiedBy(u, r) {
  if (!r.cabinet_id) return [];
  return q('SELECT id, name, compartment FROM skj_parts WHERE user_id=? AND cabinet_id=? AND row=? AND col=? AND id<>? AND deleted_at IS NULL ORDER BY name').all(u, r.cabinet_id, r.row, r.col, r.id)
    .filter((p) => !r.compartment || !p.compartment || p.compartment === r.compartment).map((p) => ({ id: p.id, name: p.name, compartment: p.compartment ?? null }));
}
let lastPurge = 0;
function maybePurge() {
  if (now76() - lastPurge < 3600_000) return;
  lastPurge = now76();
  try { for (const f of purge76()) removeImage76(f); } catch (e) { console.warn('[skjold76] opprydding:', e.message); }
}

skjoldApi76.get('/parts', (c) => {
  maybePurge();
  const u = c.get('user'), Q = (k) => c.req.query(k);
  const limit = Math.min(500, Math.max(1, Number(Q('limit')) || 100)), offset = Math.max(0, Number(Q('offset')) || 0);
  const r = searchParts76(u, { q: Q('q') ?? '', category: Q('category') || null, cabinet: Q('cabinet') || null, row: Q('row') ? Number(Q('row')) : null, col: Q('col') ? Number(Q('col')) : null,
    low: Q('low') === '1' || Q('low') === 'true', limit, offset });
  const cc = cabCache76(u);
  return c.json({ items: r.rows.map((x) => partOut76(x, { user: u, cabCache: cc })), total: r.total, limit, offset }, 200, NS);
});
skjoldApi76.get('/parts/:id{[0-9]+}', (c) => {
  const u = c.get('user'), r = partRow76(u, c.req.param('id'), { withDeleted: true });
  if (!r) return c.json(NOPART, 404);
  return c.json({ ...out(r, u), occupied: occupiedBy(u, r), history: historyOf76(u, r.id, 20), usedIn: usedIn82(u, r.id) }, 200, NS);
});
skjoldApi76.get('/parts/:id{[0-9]+}/history', (c) => {
  const u = c.get('user'), r = partRow76(u, c.req.param('id'), { withDeleted: true });
  if (!r) return c.json(NOPART, 404);
  return c.json({ items: historyOf76(u, r.id, 200) }, 200, NS);
});
skjoldApi76.post('/parts', async (c) => {
  const u = c.get('user'), b = await body(c);
  if (!b) return c.json({ error: 'Forventet {name, …}' }, 400);
  const r = partFields(u, b);
  if (r.error) return c.json({ error: r.error }, 400);
  if (q('SELECT count(*) FROM skj_parts WHERE user_id=?').pluck().get(u) >= 20000) return c.json({ error: 'Maks 20 000 deler' }, 409);
  const row = insertPart76(u, r.f);
  return c.json({ ...out(row, u), occupied: occupiedBy(u, row) }, 201);
});
skjoldApi76.patch('/parts/:id{[0-9]+}', async (c) => {
  const u = c.get('user'), cur = partOr404(c), b = await body(c);
  if (!cur) return c.json(NOPART, 404);
  if (!b) return c.json({ error: 'Forventet JSON' }, 400);
  const r = partFields(u, b, { partial: true });
  if (r.error) return c.json({ error: r.error }, 400);
  const before = locSnap76(cur);
  const row = updatePart76(u, cur.id, r.f);
  const after = locSnap76(row);
  if (JSON.stringify(before) !== JSON.stringify(after)) addHistory76(u, cur.id, 'flyttet', before, after);
  if (r.f.qty !== undefined && r.f.qty !== cur.qty) addHistory76(u, cur.id, 'antall', { qty: cur.qty }, { qty: r.f.qty });
  const changed = Object.keys(r.f).filter((k) => !['cabinet_id', 'row', 'col', 'compartment', 'qty'].includes(k) && JSON.stringify(r.f[k]) !== JSON.stringify(k === 'specs' || k === 'tags' ? J(cur[k], null) : cur[k]));
  if (changed.length) addHistory76(u, cur.id, 'endret', Object.fromEntries(changed.map((k) => [k, k === 'specs' || k === 'tags' ? J(cur[k], null) : cur[k]])), Object.fromEntries(changed.map((k) => [k, r.f[k]])));
  return c.json({ ...out(row, u), occupied: occupiedBy(u, row) });
});
skjoldApi76.delete('/parts/:id{[0-9]+}', (c) => {
  const u = c.get('user'), cur = partOr404(c);
  if (!cur) return c.json(NOPART, 404);
  const r = softDelete76(u, cur.id);
  return c.json({ ok: true, id: cur.id, deletedAt: iso(r.deleted_at), purgeAt: iso(r.deleted_at + 30 * 86400_000), undo: { method: 'POST', url: `/api/skjold/parts/${cur.id}/restore` } });
});
skjoldApi76.post('/parts/:id{[0-9]+}/restore', (c) => {
  const u = c.get('user'), r = restore76(u, c.req.param('id'));
  if (!r) return c.json({ error: 'Fant ikke delen i papirkurven' }, 404);
  return c.json({ ...out(r, u), occupied: occupiedBy(u, r) });
});
skjoldApi76.get('/trash', (c) => {
  const u = c.get('user'), cc = cabCache76(u);
  return c.json({ items: q('SELECT * FROM skj_parts WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500').all(u).map((x) => partOut76(x, { user: u, cabCache: cc })) }, 200, NS);
});
skjoldApi76.post('/parts/:id{[0-9]+}/move', async (c) => {
  const u = c.get('user'), cur = partOr404(c), b = await body(c);
  if (!cur) return c.json(NOPART, 404);
  if (!b) return c.json({ error: 'Forventet {cabinetId, row, col, compartment}' }, 400);
  const l = locFields(u, b, { required: true });
  if (l.error) return c.json({ error: l.error }, 400);
  const before = locSnap76(cur);
  const row = updatePart76(u, cur.id, l.f);
  const after = locSnap76(row);
  if (JSON.stringify(before) !== JSON.stringify(after)) addHistory76(u, cur.id, 'flyttet', before, after);
  const occ = occupiedBy(u, row);
  return c.json({ ok: true, part: out(row, u), occupied: occ, ...(occ.length ? { warning: `${occ.length === 1 ? `«${occ[0].name}» ligger` : `${occ.length} andre deler ligger`} allerede i denne skuffen` } : {}),
    undo: { cabinetId: before.cabinetId, row: before.row, col: before.col, compartment: before.compartment } });
});
skjoldApi76.post('/parts/:id{[0-9]+}/qty', async (c) => {
  const u = c.get('user'), cur = partOr404(c), b = await body(c);
  if (!cur) return c.json(NOPART, 404);
  if (!b || (b.delta == null && b.set == null)) return c.json({ error: 'Forventet {delta} eller {set}' }, 400);
  let next;
  if (b.set != null) { if (!numOk(b.set) || toNum(b.set) < 0) return c.json({ error: 'set må være et tall ≥ 0' }, 400); next = toNum(b.set); }
  else { if (!numOk(b.delta)) return c.json({ error: 'delta må være et tall' }, 400); next = Math.max(0, cur.qty + toNum(b.delta)); }
  next = Math.round(next * 1000) / 1000;
  const row = updatePart76(u, cur.id, { qty: next });
  if (next !== cur.qty) addHistory76(u, cur.id, 'antall', { qty: cur.qty }, { qty: next });
  return c.json({ ok: true, part: out(row, u), qty: next, low: row.min_qty != null && next <= row.min_qty, undo: { set: cur.qty } });
});
skjoldApi76.post('/parts/:id{[0-9]+}/photos', uploadLimit, async (c) => {
  const u = c.get('user'), cur = partOr404(c);
  if (!cur) return c.json(NOPART, 404);
  const photos = J(cur.photos, []);
  if (photos.length >= 12) return c.json({ error: 'Maks 12 bilder per del' }, 409);
  const buf = await fileOf(c);
  if (!buf) return c.json({ error: 'Mangler fil (multipart «file»)' }, 400);
  const r = await saveImage76(u, buf);
  if (r.error) return c.json({ error: r.error }, r.status);
  const row = updatePart76(u, cur.id, { photos: [...photos, r.name] });
  return c.json({ ...out(row, u), converted: r.converted }, 201);
});
skjoldApi76.delete('/parts/:id{[0-9]+}/photos/:n{[0-9]+}', (c) => {
  const u = c.get('user'), cur = partOr404(c);
  if (!cur) return c.json(NOPART, 404);
  const photos = J(cur.photos, []), n = Number(c.req.param('n'));
  if (n >= photos.length) return c.json({ error: 'Fant ikke bildet' }, 404);
  const [gone] = photos.splice(n, 1);
  removeImage76(gone);
  return c.json(out(updatePart76(u, cur.id, { photos }), u));
});
skjoldApi76.get('/files/:name', (c) => {
  const f = readImage76(c.get('user'), c.req.param('name'));
  if (!f) return c.json({ error: 'Fant ikke bildet' }, 404);
  return c.body(f.buf, 200, { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
});

/* ---------------- Historikk og angre ---------------- */

skjoldApi76.get('/history', (c) => c.json({ items: historyAll76(c.get('user'), Math.min(500, Number(c.req.query('limit')) || 100)) }, 200, NS));
skjoldApi76.post('/history/:id{[0-9]+}/undo', (c) => {
  const u = c.get('user');
  const h = q('SELECT * FROM skj_history WHERE id=? AND user_id=?').get(Number(c.req.param('id')), u);
  if (!h) return c.json({ error: 'Fant ikke hendelsen' }, 404);
  const from = J(h.from, null);
  if (h.action === 'slettet') { const r = restore76(u, h.part_id); return r ? c.json({ ok: true, part: out(r, u) }) : c.json({ error: 'Delen er allerede gjenopprettet' }, 409); }
  const cur = partRow76(u, h.part_id);
  if (!cur) return c.json(NOPART, 404);
  if (h.action === 'flyttet' && from) {
    const cabOk = from.cabinetId && cabinetRow76(u, from.cabinetId);
    const f = cabOk ? { cabinet_id: from.cabinetId, row: from.row, col: from.col, compartment: from.compartment } : { cabinet_id: null, row: null, col: null, compartment: null };
    const before = locSnap76(cur), row = updatePart76(u, cur.id, f);
    addHistory76(u, cur.id, 'flyttet', before, locSnap76(row));
    return c.json({ ok: true, part: out(row, u) });
  }
  if (h.action === 'antall' && from) {
    const row = updatePart76(u, cur.id, { qty: from.qty });
    addHistory76(u, cur.id, 'antall', { qty: cur.qty }, { qty: from.qty });
    return c.json({ ok: true, part: out(row, u) });
  }
  if (h.action === 'endret') { const row = undoEdit77(u, h); if (row) return c.json({ ok: true, part: out(row, u) }); } // prompt 77: navn/kategori/specs/tags
  return c.json({ error: 'Denne hendelsen kan ikke angres' }, 409);
});

/* ---------------- Kategorier, forslag, ledige skuffer ---------------- */

skjoldApi76.get('/categories', (c) => {
  const u = c.get('user');
  const rows = q("SELECT COALESCE(NULLIF(category,''), NULL) AS name, count(*) AS count, sum(CASE WHEN min_qty IS NOT NULL AND qty<=min_qty THEN 1 ELSE 0 END) AS low FROM skj_parts WHERE user_id=? AND deleted_at IS NULL GROUP BY lower(COALESCE(category,'')) ORDER BY name IS NULL, name COLLATE NOCASE").all(u);
  return c.json({ items: rows.filter((r) => r.name).map((r) => ({ name: r.name, count: r.count, low: r.low })), uncategorized: rows.find((r) => !r.name)?.count ?? 0,
    total: rows.reduce((s, r) => s + r.count, 0), low: rows.reduce((s, r) => s + r.low, 0) }, 200, NS);
});
skjoldApi76.get('/suggest', (c) => {
  const u = c.get('user'), text = str(c.req.query('q') ?? '', 100);
  if (!words76(text).length) return c.json({ q: text, items: [] }, 200, NS);
  const r = searchParts76(u, { q: text, limit: 6 });
  const cc = cabCache76(u);
  const items = r.rows.map((p) => { const o = partOut76(p, { user: u, cabCache: cc }); return { kind: 'part', id: p.id, text: p.name, sub: o.location.text, short: o.location.short, thumbUrl: o.thumbUrl, qty: p.qty, unit: p.unit }; });
  const f = text.toLowerCase();
  const cats = q("SELECT category AS name, count(*) AS n FROM skj_parts WHERE user_id=? AND deleted_at IS NULL AND category IS NOT NULL AND lower(category) LIKE ? GROUP BY lower(category) ORDER BY n DESC LIMIT 2").all(u, `${f.replace(/[%_]/g, '')}%`);
  for (const k of cats) items.push({ kind: 'category', text: k.name, sub: `${k.n} ${k.n === 1 ? 'del' : 'deler'}` });
  return c.json({ q: text, items: items.slice(0, 8) }, 200, NS);
});
/** Tomme skuffer per skap (rad for rad, ovenfra og fra venstre) + første ledige som forslag. */
export function freeOf76(u, onlyCab = null) {
  const cabs = cabinetRows76(u).filter((x) => !onlyCab || x.id === Number(onlyCab));
  const used = new Set(q('SELECT DISTINCT cabinet_id, row, col FROM skj_parts WHERE user_id=? AND deleted_at IS NULL AND cabinet_id IS NOT NULL').all(u).map((r) => `${r.cabinet_id}:${r.row}:${r.col}`));
  let first = null;
  const list = cabs.map((cab) => {
    const dr = new Map(drawerRows76(cab.id).map((d) => [`${d.row}:${d.col}`, d]));
    const cover = coverMap81(cab.id);
    const free = [];
    for (let r = 1; r <= cab.rows; r++) for (let col = 1; col <= cab.cols; col++) {
      if (used.has(`${cab.id}:${r}:${col}`) || cover.has(`${r}:${col}`)) continue;
      const d = dr.get(`${r}:${col}`);
      free.push({ row: r, col, short: shortLoc76(r, col), label: d?.label || defaultLabel76(r, col), spanR: d?.span_r ?? 1, spanC: d?.span_c ?? 1 });
    }
    if (!first && free.length) first = { cabinetId: cab.id, cabinet: cab.name, row: free[0].row, col: free[0].col, short: free[0].short, text: `${cab.name} · ${spanText81(free[0].row, free[0].col, free[0].spanR, free[0].spanC)}` };
    return { id: cab.id, name: cab.name, rows: cab.rows, cols: cab.cols, freeCount: free.length, free };
  });
  return { cabinets: list, first };
}
skjoldApi76.get('/free', (c) => c.json(freeOf76(c.get('user'), c.req.query('cabinet') || null), 200, NS));

/* ---------------- CSV og etiketter ---------------- */

skjoldApi76.get('/export.csv', (c) => c.body(exportCsv76(c.get('user')), 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="skjold-lab.csv"', ...NS }));
skjoldApi76.post('/import', bodyLimit({ maxSize: 5 * 1024 * 1024, onError: (c) => c.json({ error: 'Filen er for stor (maks 5 MB)' }, 413) }), async (c) => {
  const u = c.get('user'), ct = c.req.header('content-type') ?? '';
  let text = null;
  if (/^multipart\/form-data/i.test(ct)) { const b = await c.req.parseBody().catch(() => ({})); if (b.file instanceof File) text = await b.file.text(); }
  else if (/json/i.test(ct)) { const b = await body(c); text = typeof b?.csv === 'string' ? b.csv : null; }
  else text = await c.req.text();
  if (!text?.trim()) return c.json({ error: 'Mangler CSV (multipart «file», text/csv eller {csv})' }, 400);
  const dry = ['1', 'true'].includes(c.req.query('dry') ?? '');
  const r = importCsv76(u, text, { dry });
  if (r.error) return c.json({ error: r.error }, 400);
  return c.json(r, dry ? 200 : 201);
});
skjoldApi76.get('/labels', (c) => {
  const u = c.get('user'), id = c.req.query('cabinet');
  const cabs = id ? [cabinetRow76(u, id)].filter(Boolean) : cabinetRows76(u);
  if (id && !cabs.length) return c.json(NOCAB, 404);
  let origin = '';
  try { origin = originOf46(c) || ''; } catch { origin = ''; }
  if (!origin) { try { origin = new URL(c.req.url).origin; } catch { origin = ''; } }
  return c.html(labelsHtml76(u, cabs, origin.replace(/\/$/, ''), { empty: c.req.query('empty') !== '0' }), 200, NS);
});

skjoldApi76.get('/', (c) => {
  const u = c.get('user');
  const parts = q('SELECT count(*) FROM skj_parts WHERE user_id=? AND deleted_at IS NULL').pluck().get(u);
  const low = q('SELECT count(*) FROM skj_parts WHERE user_id=? AND deleted_at IS NULL AND min_qty IS NOT NULL AND qty<=min_qty').pluck().get(u);
  const unplaced = q('SELECT count(*) FROM skj_parts WHERE user_id=? AND deleted_at IS NULL AND cabinet_id IS NULL').pluck().get(u);
  return c.json({ parts, low, unplaced, cabinets: cabinetRows76(u).map((x) => cabinetOut(x, u)), units: UNITS76, kinds: KINDS76 }, 200, NS);
});

// Prompt 81 (SPANSRV): GET /presets, POST /cabinets/:id/preset.
presetsMount81(skjoldApi76, { cabinetOut, NOCAB, body });
// Prompt 77 (SKJAISRV): /ai/* (forslag, bildesøk, Rydd opp, innstillinger) og /parts/:id/photos/from-search.
mountAi77(skjoldApi76, { fileOf, uploadLimit });
// Prompt 78 (LEDSRV): /cabinets/:id/leds*, /locate, /locate/off, /leds/status, /leds/settings.
mountLeds78(skjoldApi76);
// Prompt 79 (PICKSRV): GET|PUT /picklist, POST /picklist/take, /picklist/undo.
mountPicklist79(skjoldApi76);
// Prompt 82 (CHKSRV): /projects*, /checkout, /checkout/undo, /usage/:id/return.
mountProjects82(skjoldApi76);
