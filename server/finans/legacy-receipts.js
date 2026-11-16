// Den gamle kvitteringslista (før FinansHub): /api/receipts på den innloggede routeren, tabellen receipts (beløp i kroner, REAL).
// Q30: dataene flyttes bare når admin ber om det (Økonomi → Innstillinger → Backup og data → «Flytt gamle kvitteringer», receipt-migration.js). FinansHub-kvitteringene ligger i fh_receipts (/finans/api/receipts).
//   GET    /api/receipts            → [{id, store, date, category, amount, file, thumb, mime}] (brukerens egne, nyeste først)
//   POST   /api/receipts (multipart: store, date, category, amount, file, thumb) → kvitteringen
//   PATCH  /api/receipts/:id {store?, date?, category?, amount?} → kvitteringen (404 for andres)
//   DELETE /api/receipts/:id        → {ok:true} (sletter også filene)
//   GET    /api/receipts.csv        → CSV (Dato;Butikk;Kategori;Beløp)
// Filene lagres i uploads/ med de felles hjelperne i index.js (saveFile/removeFile), og vises via /api/files/:name, som spør
// legacyReceiptOwner hvem som eier en fil.
import { db } from '../db.js';
import { osloDate } from '../dates/oslo.js';

const receiptOut = (r) => ({ id: r.id, store: r.store, date: r.date, category: r.category, amount: r.amount, file: r.file, thumb: r.thumb, mime: r.mime });

/** Eieren av en opplastet fil i den gamle kvitteringslista, eller undefined. */
export const legacyReceiptOwner = (name) => db.prepare('SELECT user FROM receipts WHERE file=? OR thumb=? LIMIT 1').get(name, name)?.user;

/** Registrerer rutene på den innloggede routeren (authed i index.js, montert på /api). */
export function registerLegacyReceipts(authed, { upload, saveFile, removeFile }) {
  authed.get('/receipts', (c) => c.json(db.prepare('SELECT * FROM receipts WHERE user=? ORDER BY date DESC, id DESC').all(c.get('user')).map(receiptOut)));

  authed.post('/receipts', upload, async (c) => {
    const body = await c.req.parseBody();
    let file, thumb;
    try { file = await saveFile(body.file); thumb = await saveFile(body.thumb, false); } catch (e) { return c.json({ error: e.message }, 400); }
    const today = osloDate();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today;
    const r = db.prepare('INSERT INTO receipts(user,store,date,category,amount,file,thumb,mime,created) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *')
      .get(c.get('user'), String(body.store ?? '').slice(0, 120), date, String(body.category ?? 'Annet').slice(0, 30), Number(body.amount) || 0, file?.name ?? null, thumb?.name ?? null, file?.mime ?? null, Date.now());
    return c.json(receiptOut(r));
  });

  authed.patch('/receipts/:id', async (c) => {
    const b = await c.req.json();
    const cur = db.prepare('SELECT * FROM receipts WHERE id=? AND user=?').get(c.req.param('id'), c.get('user'));
    if (!cur) return c.notFound();
    const next = {
      store: typeof b.store === 'string' ? b.store.slice(0, 120) : cur.store,
      date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : cur.date,
      category: typeof b.category === 'string' ? b.category.slice(0, 30) : cur.category,
      amount: b.amount !== undefined && Number.isFinite(Number(b.amount)) ? Number(b.amount) : cur.amount,
    };
    const r = db.prepare('UPDATE receipts SET store=?, date=?, category=?, amount=? WHERE id=? RETURNING *').get(next.store, next.date, next.category, next.amount, cur.id);
    return c.json(receiptOut(r));
  });

  authed.delete('/receipts/:id', (c) => {
    const r = db.prepare('DELETE FROM receipts WHERE id=? AND user=? RETURNING file, thumb').get(c.req.param('id'), c.get('user'));
    if (r) { removeFile(r.file); removeFile(r.thumb); }
    return c.json({ ok: true });
  });

  authed.get('/receipts.csv', (c) => {
    const rows = db.prepare('SELECT * FROM receipts WHERE user=? ORDER BY date').all(c.get('user'));
    const q = (v) => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const csv = '﻿' + ['Dato;Butikk;Kategori;Beløp', ...rows.map((r) => [r.date.split('-').reverse().join('.'), r.store, r.category, String(r.amount).replace('.', ',')].map(q).join(';'))].join('\r\n');
    return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="kvitteringer.csv"' });
  });
}
