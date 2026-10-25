// Prompt 48 (SERVER48): rutene for den nye kvitteringskjeden. Monteres i finans/routes.js (samme tilgangskontroll: økt eller
// app-token med receipts:write / finance:write) og som alias under /api/receipts/* (index.js).
//
// POST /finans/api/receipts/scan   (alias POST /api/receipts/scan)                     receipts:write | finance:write
//   multipart: image (påkrevd, JPEG/PNG/WebP/HEIC), device_ocr (JSON, felles OCR-format), device_parse (JSON, felles
//   kvitteringsformat), client («ios 1.2.3» | {"platform":"ios","version":"1.2.3"}), valgfritt thumb (JPEG) og scan (JPEG ~1600 px).
//   → 201 {receipt_id, receipt, confidence, failed_fields, uncertain_fields, pipeline[], used, label, engine, model, compare,
//          warnings, errors, ocr:{source, rows, image_size}, stored:{…receiptOut, jobs[]}}
//   Kvitteringen lagres i fh_receipts (source «scan48») og går videre i den vanlige køen (kategori, bankmatch, sammendrag,
//   Til godkjenning) uten nytt AI-kall for selve tolkningen.
// GET  /finans/api/receipts/health  (alias GET /api/receipts/health)                   finance:read | receipts:write
// POST /finans/api/receipts/mac-ocr/test             – admin: test Mac-OCR-adressen og -nøkkelen
// GET  /finans/api/receipts/schemas/:kind  (ocr | receipt)                             finance:read | receipts:write
// POST /finans/api/receipts/:id/corrections {receipt}  – rettelse som testdata         receipts:write | finance:write
// GET  /finans/api/receipts/corrections                – egne rettelser               finance:read
// GET  /finans/api/receipts/corrections/export         – alle (JSONL), admin + innlogget økt
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db } from '../finans/db.js';
import { config } from '../config.js';
import { scanLog, sniffMime } from '../finans/scan.js';
import { validate } from '../finans/ai.js';
import { OCR_SCHEMA48, RECEIPT_SCHEMA48, checkReceipt48 } from './schema.js';
import { toLegacy48, itemBoxes48, normalizeReceipt48 } from './normalize.js';
import { runChain48, deviceOcr48 } from './chain.js';
import { health48 } from './health.js';
import { macHealth48 } from './engines/mac-vision.js';
import { r48Settings, macOcrKey48 } from './settings.js';
import { recordCorrection48, listCorrections48, exportCorrections48 } from './corrections.js';
import { todayOslo45 } from '../glimt45/dates.js';
import { MERCHANT_LABELS51, brregStatus51, brregLookup51, updateBrreg51, learnMerchant51, mod11Ok } from './brreg51.js'; // prompt 51: Enhetsregisteret (lokal kopi)

const DIR = resolve(config.dataDir, 'receipts');
const q = (sql) => db.prepare(sql);
// Additiv migrasjon: det beste OCR-resultatet (felles format) for kvitteringer fra /receipts/scan.
if (!q('PRAGMA table_info(fh_receipts)').all().some((c) => c.name === 'ocr48')) db.exec('ALTER TABLE fh_receipts ADD COLUMN ocr48 TEXT');
const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status);
const parse = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const IMG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
export const SOURCE48 = 'scan48';

/** «ios 1.2.3» | «android/2.0» | {"platform":"web","version":"…"} → {platform, version} | null. */
export function client48(v) {
  if (v == null || v === '') return null;
  let o = v;
  if (typeof v === 'string') {
    try { o = JSON.parse(v); } catch {
      const m = v.trim().match(/^(ios|android|web)(?:[\s/@:-]+(\S{1,40}))?$/i);
      o = m ? { platform: m[1], version: m[2] ?? null } : null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const platform = String(o.platform ?? o.os ?? '').toLowerCase();
  if (!['ios', 'android', 'web'].includes(platform)) return null;
  return { platform, version: o.version != null ? String(o.version).slice(0, 40) : null };
}

async function storeFile(id, buf, suffix) {
  const d = new Date(), sub = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  await mkdir(join(DIR, sub), { recursive: true });
  const file = `${sub}/${id}${suffix}`;
  await writeFile(join(DIR, file), buf);
  return file;
}
const firstAccount = (u) => q('SELECT id FROM fh_accounts WHERE user_id=? ORDER BY sort, id LIMIT 1').get(u)?.id ?? null;
const expenseCats = (u) => q("SELECT name FROM fh_categories WHERE kind='expense' AND user_id=? ORDER BY sort").all(u).map((x) => x.name);
// OCR-resultatet som lagres (og går til rettelsene): uten for mye tekst.
export const ocrStore = (o) => (o ? JSON.stringify({ source: o.source, rows: (o.rows ?? []).slice(0, 600), full_text: String(o.full_text ?? '').slice(0, 30_000), lines: (o.lines ?? []).slice(0, 800), image_size: o.image_size ?? null, ms: o.ms ?? null, ...(o.cropped ? { cropped: true } : {}), ...(o.preprocess ? { preprocess: o.preprocess } : {}) }) : null);

/**
 * Prompt 51: brukeren har skrevet/rettet butikknavnet. Lagrer navnet på kvitteringen, merker kilden «user» og lærer
 * org.nr. → navn når kvitteringen har et gyldig org.nr. (eller klienten sender et). → {learned, org_number}
 */
export function setMerchant51(u, r, name, orgIn = null) {
  const ex = parse(r.extraction) ?? null;
  const nr = String(orgIn ?? ex?.merchant51?.org_number ?? ex?.org_number ?? '').replace(/\D/g, '');
  const org = mod11Ok(nr) ? nr : null;
  const learned = org ? learnMerchant51(u, org, name, { receiptId: r.id }) : false;
  if (ex) {
    const prev = ex.merchant51 ?? {};
    ex.merchant51 = { ...prev, source: 'user', org_number: org ?? prev.org_number ?? null, suggested: prev.suggested ?? r.merchant ?? null };
    if (org) ex.org_number = org;
    ex.merchant = name;
    q('UPDATE fh_receipts SET merchant=?, extraction=? WHERE id=?').run(name, JSON.stringify(ex), r.id);
  } else q('UPDATE fh_receipts SET merchant=? WHERE id=?').run(name, r.id);
  return { learned, org_number: org };
}

/** Motoren i køen (processReceipt): resultatet fra kjeden uten nytt AI-kall. force (Les på nytt) bruker den gamle kjeden. */
export function preScanned48(r, force) {
  if (force || r?.source !== SOURCE48) return null;
  const meta = parse(r.meta)?.scan48 ?? {};
  const ex = parse(r.extraction);
  if (!ex) throw new Error(meta.error ?? 'Ingen steg i kvitteringskjeden ga en gyldig tolkning');
  const data = validate(ex);
  data.receipt48 = ex.receipt48 ?? null;
  if (ex.subtotal != null) data.subtotal = ex.subtotal;
  return { provider: meta.provider ?? 'ollama', model: meta.model ?? null, data, seconds: meta.seconds ?? 0 };
}

/* ---------------- Prompt 52 (SRV52): Boliger på samme kvitteringsleser ---------------- */

/** home_id/expense_id fra skjemaet → {folderId, name, entryId, target} | {error, status} | null (ingen bolig). */
export function homeTarget52(u, homeId, expenseId) {
  if (homeId == null || homeId === '') return null;
  const fid = Number(homeId);
  if (!Number.isInteger(fid) || fid <= 0) return { error: 'home_id må være id-en til en bolig', status: 400 };
  const f = q('SELECT id, name FROM fh_folders WHERE id=?').get(fid);
  const m = f ? q('SELECT role FROM fh_folder_members WHERE folder_id=? AND user_id=?').get(fid, u) : null;
  if (!f || !m) return { error: 'Fant ikke boligen', status: 404 };
  if (m.role === 'viewer') return { error: 'Du har lesetilgang. Be en eier om redigeringstilgang.', status: 403 };
  let entryId = null;
  if (expenseId != null && expenseId !== '') {
    const e = q('SELECT id, receipt_id FROM fh_folder_entries WHERE id=? AND folder_id=?').get(Number(expenseId), fid);
    if (!e) return { error: 'Fant ikke utgiften i boligen', status: 404 };
    entryId = e.id;
  }
  return { folderId: fid, name: f.name, entryId, target: `folder:${fid}:${u}` };
}
/** Posten i boligen med en gang (fylles ut/oppdateres av køen via routeTarget). */
function linkHome52(h, receiptId, { merchant, date, total }) {
  try {
    if (h.entryId) { q('UPDATE fh_folder_entries SET receipt_id=? WHERE id=? AND folder_id=?').run(receiptId, h.entryId, h.folderId); return; }
    if (q('SELECT 1 FROM fh_folder_entries WHERE receipt_id=?').get(receiptId)) return;
    const payer = q('SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?').pluck().get(h.folderId, h.target.split(':')[2]) ?? 'Meg';
    q("INSERT INTO fh_folder_entries(folder_id,receipt_id,description,date,amount,paid_by,category,status,created) VALUES(?,?,?,?,?,?,?,'review',?)")
      .run(h.folderId, receiptId, String(merchant || 'Kvittering').slice(0, 120), date, Math.abs(total || 0), payer, null, Date.now());
  } catch (e) { console.warn('[skann48] bolig:', e.message); }
}

/**
 * deps: {W: skrivetilgang (receipts:write/finance:write), R: lesetilgang, adminOnly, sessionOnly, enqueue(id), out(id)}
 */
export function mountReceipts48(api, { W, R, adminOnly, sessionOnly, enqueue, out }) {
  const fileLimit = bodyLimit({ maxSize: Number(process.env.MAX_UPLOAD_MB ?? 40) * 1024 * 1024 + 4096, onError: (c) => bad(c, `Filen er for stor (maks ${process.env.MAX_UPLOAD_MB ?? 40} MB)`, 413) });

  api.post('/receipts/scan', fileLimit, W, async (c) => {
    if (!/multipart\/form-data/i.test(c.req.header('content-type') ?? '')) return bad(c, 'Forventet multipart/form-data med feltet «image»');
    const form = await c.req.parseBody().catch(() => null);
    if (!form) return bad(c, 'Kunne ikke lese skjemaet');
    const img = form.image instanceof File ? form.image : form.file instanceof File ? form.file : null;
    if (!img) return bad(c, 'Feltet «image» (bildet av kvitteringen) mangler');
    const buf = Buffer.from(await img.arrayBuffer());
    if (!buf.length) return bad(c, 'Bildet er tomt');
    const mime = sniffMime(buf, img.type, img.name);
    if (!IMG[mime]) return bad(c, `Bildet må være JPEG, PNG, WebP eller HEIC (${mime || img.type || 'ukjent type'})`);
    const warnings = [];
    let deviceOcr = null, deviceParse = null;
    if (typeof form.device_ocr === 'string' && form.device_ocr.trim()) {
      const j = parse(form.device_ocr);
      if (!j) warnings.push('device_ocr er ikke gyldig JSON og ble ignorert');
      else { const d = deviceOcr48(j); if (d.error) warnings.push(`${d.error} – ignorert`); else deviceOcr = d.ocr; }
    }
    if (typeof form.device_parse === 'string' && form.device_parse.trim()) {
      const j = parse(form.device_parse);
      if (!j || typeof j !== 'object' || Array.isArray(j)) warnings.push('device_parse er ikke et gyldig JSON-objekt og ble ignorert'); else deviceParse = j;
    }
    const client = client48(form.client);
    if (form.client && !client) warnings.push('client ble ikke forstått (forventet ios/android/web + versjon)');
    const scanImg = form.scan instanceof File && form.scan.type === 'image/jpeg' ? Buffer.from(await form.scan.arrayBuffer()) : null;
    const thumb = form.thumb instanceof File && form.thumb.type === 'image/jpeg' ? Buffer.from(await form.thumb.arrayBuffer()) : null;

    const u = c.get('user');
    // Prompt 52 (SRV52): Boliger bruker samme kvitteringsleser. home_id (og valgfritt expense_id) kobler kvitteringen til boligen:
    // target «folder:<id>:<bruker>» → posten havner i boligen når køen er ferdig (routeTarget), som for den gamle Boliger-opplastingen.
    const home52 = homeTarget52(u, form.home_id ?? form.homeId, form.expense_id ?? form.expenseId);
    if (home52?.error) return bad(c, home52.error, home52.status);
    const logs = [];
    const log = (step, detail) => { logs.push([step, detail]); console.info(`[skann48] ${step} – ${String(detail).slice(0, 200)}`); };
    // Kjeden fullføres selv om klienten kobler fra (kvitteringen lagres uansett; appens kø sender den ellers på nytt).
    const id = randomUUID();
    const res = await runChain48({ image: buf, mime, smallImage: scanImg, deviceOcr, deviceParse, client, categories: expenseCats(u), log, user: u, receiptId: id });

    const file = await storeFile(id, buf, `.${IMG[mime]}`);
    const scanRel = scanImg ? await storeFile(id, scanImg, '_scan.jpg') : null;
    const thumbRel = thumb ? await storeFile(id, thumb, '_t.jpg') : null;
    const rc = res.receipt;
    const meta48 = { used: res.used, label: res.label, engine: res.engine, provider: res.provider, model: res.model, confidence: res.confidence, failed_fields: res.failed_fields,
      uncertain_fields: res.uncertain_fields, pipeline: res.pipeline, compare: res.compare, client, seconds: res.seconds, ...(rc ? {} : { error: res.errors.join(' · ') }) };
    let extraction = null;
    if (rc && (rc.merchant || rc.total != null)) {
      const legacy = toLegacy48(rc, { confidence: res.confidence, failed: res.uncertain_fields, bboxes: itemBoxes48(rc.items, res.ocr) });
      try { extraction = JSON.stringify({ ...validate(legacy), subtotal: rc.subtotal ?? null, receipt48: { ...meta48, model_receipt: rc, warnings: res.warnings }, ...(res.merchant51 ? { merchant51: res.merchant51 } : {}) }); }
      catch (e) { meta48.error = e.message; }
    }
    const name = String(img.name ?? '').slice(0, 120) || rc?.merchant || `Kvittering (${res.label ?? 'skann'})`;
    q("INSERT INTO fh_receipts(id,file,scan,thumb,mime,status,date,account_id,name,source,target,uploaded_by,created,user_id,extraction,merchant,total,meta,ocr48) VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, file, scanRel, thumbRel, mime, rc?.date || todayOslo45(), firstAccount(u), name, SOURCE48, home52?.target ?? null, u, Date.now(), u, extraction, rc?.merchant || null,
        rc?.total != null ? Math.round(rc.total * 100) : null, JSON.stringify({ scan48: meta48 }), ocrStore(res.ocr));
    if (home52) linkHome52(home52, id, { merchant: rc?.merchant || name, date: rc?.date || todayOslo45(), total: rc?.total != null ? Math.round(rc.total * 100) : 0 });
    scanLog(id, 'mottatt', `Skann (prompt 48)${client ? ` fra ${client.platform}${client.version ? ` ${client.version}` : ''}` : ''} · ${mime} · ${Math.round(buf.length / 1024)} kB${deviceOcr ? ' + device_ocr' : ''}${deviceParse ? ' + device_parse' : ''}`);
    for (const [step, detail] of logs) scanLog(id, step, detail);
    scanLog(id, 'vei', `${res.pipeline.map((p) => `${p.step}:${p.status}${p.ms ? ` ${p.ms} ms` : ''}`).join(' → ')} · brukte ${res.used ?? 'ingen'} (${res.label ?? '–'}) · ${res.confidence}`);
    enqueue(id);
    return c.json({
      receipt_id: id, receipt: rc, confidence: res.confidence, failed_fields: res.failed_fields, uncertain_fields: res.uncertain_fields, pipeline: res.pipeline,
      used: res.used, label: res.label, engine: res.engine, model: res.model, compare: res.compare, warnings: [...warnings, ...res.warnings], errors: res.errors,
      ocr: res.ocr ? { source: res.ocr.source, engine: res.ocr.source, rows: res.ocr.rows?.length ?? 0, image_size: res.ocr.image_size ?? null } : null, seconds: res.seconds, stored: out(id),
      merchant_source: res.merchant51?.source ?? null, merchant_label: MERCHANT_LABELS51[res.merchant51?.source] ?? null, org_number: res.merchant51?.org_number ?? rc?.org_number ?? null,
      source_label: 'Lokal AI', // prompt 52: kvitteringer leses bare lokalt
      ...(home52 ? { home: { id: home52.folderId, name: home52.name, expense_id: home52.entryId ?? q('SELECT id FROM fh_folder_entries WHERE receipt_id=?').pluck().get(id) ?? null } } : {}),
    }, 201);
  });

  api.get('/receipts/health', R, async (c) => c.json(await health48({ admin: !!c.get('access')?.admin, categories: expenseCats(c.get('user')) }), 200, { 'Cache-Control': 'no-store' }));
  // «Test tilkobling» for Mac-OCR (Innstillinger › AI › Mac-OCR): GET /health på tjenesten med lagret adresse og nøkkel.
  api.post('/receipts/mac-ocr/test', adminOnly, async (c) => { const cfg = r48Settings(); const h = await macHealth48({ url: cfg.macOcrUrl, key: macOcrKey48(), timeoutMs: 4000 }); return c.json({ ...h, url: cfg.macOcrUrl }); });
  // Prompt 51: lokal kopi av Enhetsregisteret – status, manuell oppdatering (admin) og lokalt oppslag (aldri nett).
  api.get('/receipts/brreg', R, (c) => c.json(brregStatus51(), 200, { 'Cache-Control': 'no-store' }));
  api.post('/receipts/brreg/update', adminOnly, (c) => {
    if (brregStatus51().running) return c.json({ started: false, running: true }, 409);
    updateBrreg51().catch(() => { /* logget */ });
    return c.json({ started: true }, 202);
  });
  api.get('/receipts/brreg/:orgnr{[0-9 ]{9,11}}', R, (c) => {
    const nr = c.req.param('orgnr').replace(/\D/g, '');
    const hit = brregLookup51(nr);
    return c.json(hit ? { ...hit, found: true } : { org_number: nr, name: null, display_name: null, address: null, found: false });
  });
  api.get('/receipts/schemas/:kind{(ocr|receipt)}', R, (c) => c.json(c.req.param('kind') === 'ocr' ? OCR_SCHEMA48 : RECEIPT_SCHEMA48));

  api.get('/receipts/corrections/export', sessionOnly, adminOnly, (c) => c.body(exportCorrections48(), 200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': 'attachment; filename="receipt-corrections48.jsonl"', 'Cache-Control': 'no-store' }));
  api.get('/receipts/corrections', R, (c) => c.json({ items: listCorrections48(c.get('user'), Number(c.req.query('limit') ?? 100) || 100) }));
  // Prompt 51: rettet butikknavn → lær org.nr. → visningsnavn (per bruker). Navnet lagres på kvitteringen uansett.
  api.post('/receipts/:id/merchant', W, async (c) => {
    const u = c.get('user');
    const r = q('SELECT * FROM fh_receipts WHERE id=? AND user_id=?').get(c.req.param('id'), u);
    if (!r) return c.notFound();
    const b = await c.req.json().catch(() => null);
    const name = String(b?.merchant ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name) return bad(c, 'Forventet {merchant: "Butikknavn"}');
    const res = setMerchant51(u, r, name, b?.org_number);
    return c.json({ ok: true, learned: res.learned, org_number: res.org_number, merchant: name, receipt: out(r.id) });
  });
  api.post('/receipts/:id/corrections', W, async (c) => {
    const r = q('SELECT * FROM fh_receipts WHERE id=? AND user_id=?').get(c.req.param('id'), c.get('user'));
    if (!r) return c.notFound();
    const b = await c.req.json().catch(() => null);
    const corrected = normalizeReceipt48(b?.receipt ?? b);
    if (!corrected) return bad(c, 'Forventet {receipt: …} i felles kvitteringsformat');
    const errors = checkReceipt48(corrected);
    if (errors.length) return bad(c, `Rettelsen følger ikke kvitteringsformatet: ${errors[0]}`, 400, { errors });
    const saved = recordCorrection48(c.get('user'), r, corrected, 'edit');
    return c.json({ saved: !!saved, id: saved?.id ?? null, fields: saved?.fields ?? [] }, saved ? 201 : 200);
  });
}

/** Alias /api/receipts/scan og /api/receipts/health → samme ruter under /finans/api (samme tilgangskontroll). */
export function receiptsAlias48(finansApi) {
  const a = new Hono();
  const fwd = async (c, path) => finansApi.request(path, { method: c.req.method, headers: new Headers(c.req.raw.headers), body: c.req.method === 'GET' ? undefined : await c.req.arrayBuffer() }, c.env);
  a.post('/scan', (c) => fwd(c, '/receipts/scan'));
  a.get('/health', (c) => fwd(c, '/receipts/health'));
  return a;
}
