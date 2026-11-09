// Prompt 76 (SKJSRV): CSV inn/ut for Skjold Lab. Samme kolonner begge veier (UTF-8 med BOM, komma, «"» rundt felt med skilletegn).
// specs er JSON i én kolonne, tags skilles med «;». Plassering: skapets navn + rad + skuff (+ rom). Import: id (egen del) → endring,
// ellers ny del. ?dry=1 gir forhåndsvisning uten å lagre.
import { db } from '../db.js';
import { cabinetRows76, cabCache76, partRow76, insertPart76, updatePart76, addHistory76, locSnap76, UNITS76 } from './store.js';

export const CSV_COLS76 = ['id', 'name', 'category', 'description', 'specs', 'qty', 'unit', 'min_qty', 'tags', 'cabinet', 'row', 'col', 'compartment', 'url', 'price', 'supplier'];
const J = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const cell = (v) => {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)?$/.test(s)) s = `'${s}`; // formelinjeksjon i regneark
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv76(user) {
  const cabs = cabCache76(user);
  const rows = db.prepare('SELECT * FROM skj_parts WHERE user_id=? AND deleted_at IS NULL ORDER BY cabinet_id IS NULL, cabinet_id, row, col, compartment, name').all(user);
  const lines = [CSV_COLS76.join(',')];
  for (const r of rows) {
    const specs = J(r.specs, {}), tags = J(r.tags, []);
    lines.push([r.id, r.name, r.category, r.description, Object.keys(specs).length ? JSON.stringify(specs) : '', r.qty, r.unit, r.min_qty, tags.join(';'),
      r.cabinet_id ? cabs.get(r.cabinet_id)?.name : '', r.row, r.col, r.compartment, r.url, r.price, r.supplier].map(cell).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** RFC 4180-parser (komma eller semikolon som skilletegn, oppdaget fra overskriften). → [[felt]] */
export function parseCsv76(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const head = s.split(/\r?\n/, 1)[0] ?? '';
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const out = [];
  let row = [], f = '', i = 0, inQ = false;
  while (i < s.length) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i += 2; continue; } inQ = false; i++; continue; }
      f += ch; i++; continue;
    }
    if (ch === '"' && f === '') { inQ = true; i++; continue; }
    if (ch === sep) { row.push(f); f = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(f); out.push(row); row = []; f = ''; i++; continue; }
    f += ch; i++;
  }
  if (f !== '' || row.length) { row.push(f); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ''));
}

const num = (v) => { const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.'); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const txt = (v, n) => { const s = String(v ?? '').replace(/^'(?=[=+\-@])/, '').replace(/[\u0000-\u001f]/g, ' ').trim(); return s ? s.slice(0, n) : null; };

/**
 * Importerer CSV. dry=true → bare forhåndsvisning. → {ok, dry, create, update, skipped, errors:[{line, error}], rows:[{line, action, id?, name, location}]}
 */
export function importCsv76(user, text, { dry = false, maxRows = 5000 } = {}) {
  const rows = parseCsv76(text);
  if (!rows.length) return { error: 'Tom CSV' };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/^minqty$/, 'min_qty'));
  if (!head.includes('name')) return { error: 'CSV-en mangler kolonnen «name»' };
  if (rows.length - 1 > maxRows) return { error: `For mange rader (maks ${maxRows})` };
  const cabs = cabinetRows76(user);
  const byName = new Map(cabs.map((c) => [c.name.toLowerCase(), c]));
  const out = { ok: true, dry, create: 0, update: 0, skipped: 0, errors: [], rows: [] };
  const work = [];
  rows.slice(1).forEach((cells, k) => {
    const line = k + 2;
    const o = Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
    const err = (e) => { out.errors.push({ line, error: e }); out.skipped++; };
    const name = txt(o.name, 120);
    if (!name) return err('Mangler navn');
    const f = { name, category: txt(o.category, 60), description: txt(o.description, 2000), supplier: txt(o.supplier, 80) };
    if (o.specs !== undefined) {
      const sp = String(o.specs ?? '').trim();
      if (!sp) f.specs = {};
      else { const v = J(sp, null); if (!v || typeof v !== 'object' || Array.isArray(v)) return err('specs må være JSON-objekt'); f.specs = Object.fromEntries(Object.entries(v).slice(0, 20).map(([a, b]) => [String(a).slice(0, 40), String(b).slice(0, 80)])); }
    }
    for (const [k2, col] of [['qty', 'qty'], ['min_qty', 'min_qty'], ['price', 'price']]) {
      if (o[col] === undefined) continue;
      const n = num(o[col]);
      if (Number.isNaN(n) || (n != null && n < 0)) return err(`${col} må være et tall ≥ 0`);
      if (n != null || k2 !== 'qty') f[k2] = n;
    }
    if (o.unit !== undefined) { const u = String(o.unit).trim().toLowerCase() || 'stk'; if (!UNITS76.includes(u)) return err(`Ukjent enhet «${u}»`); f.unit = u; }
    if (o.tags !== undefined) f.tags = String(o.tags).split(/[;|]/).map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 20);
    if (o.url !== undefined) { const u = txt(o.url, 500); if (u && !/^https?:\/\//i.test(u)) return err('url må starte med http(s)://'); f.url = u; }
    // Plassering
    const cn = txt(o.cabinet, 60);
    if (cn) {
      const cab = byName.get(cn.toLowerCase());
      if (!cab) return err(`Ukjent skap «${cn}»`);
      const r = num(o.row), c = num(o.col), comp = num(o.compartment);
      if (!Number.isInteger(r) || r < 1 || r > cab.rows) return err(`Rad må være 1–${cab.rows}`);
      if (!Number.isInteger(c) || c < 1 || c > cab.cols) return err(`Skuff må være 1–${cab.cols}`);
      if (comp != null && (!Number.isInteger(comp) || comp < 1 || comp > 4)) return err('Rom må være 1–4');
      Object.assign(f, { cabinet_id: cab.id, row: r, col: c, compartment: comp ?? null });
    } else if (o.cabinet !== undefined) Object.assign(f, { cabinet_id: null, row: null, col: null, compartment: null });
    const id = num(o.id);
    const own = Number.isInteger(id) ? partRow76(user, id) : null;
    const loc = f.cabinet_id ? `${cabs.find((c) => c.id === f.cabinet_id).name} · Rad ${f.row} · Skuff ${f.col}${f.compartment ? ` · Rom ${f.compartment}` : ''}` : (f.cabinet_id === null ? 'Uten plass' : null);
    if (own) { out.update++; out.rows.push({ line, action: 'endre', id: own.id, name, location: loc }); work.push(() => {
      const before = locSnap76(own);
      const r = updatePart76(user, own.id, f);
      const after = locSnap76(r);
      if (f.cabinet_id !== undefined && JSON.stringify(before) !== JSON.stringify(after)) addHistory76(user, own.id, 'flyttet', before, after);
      if (f.qty !== undefined && f.qty !== own.qty) addHistory76(user, own.id, 'antall', { qty: own.qty }, { qty: f.qty });
      addHistory76(user, own.id, 'endret', null, { import: true });
    }); }
    else { out.create++; out.rows.push({ line, action: 'ny', name, location: loc ?? 'Uten plass' }); work.push(() => insertPart76(user, f)); }
  });
  if (!dry) db.transaction(() => { for (const w of work) w(); })();
  out.rows = out.rows.slice(0, 200);
  return out;
}
