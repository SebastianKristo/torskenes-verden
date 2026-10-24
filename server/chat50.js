// Prompt 50 (SRVCHAT50): vedlegg i Chat med miniatyr, riktig modell for bilder og kvittering i chat
// (claude-code-chat-slipp-filer-og-miniatyr.md). Brukes av server/chat.js.
//
//   POST /api/chat/files (multipart file)  → {id, name, size, mime, readable, kind:'image'|'pdf'|'file', thumb?, url, w?, h?}
//        Bilder får en miniatyr (maks 480 px, WebP) som lagres sammen med originalen. Mangler ImageMagick, er miniatyren originalen.
//   GET  /api/chat/files/:id               → originalen (bare eieren; lysboksen henter den først når den åpnes)
//   GET  /api/chat/files/:id/thumb         → miniatyren (image/webp, eller originalen som reserve). Immutable – id-en endres aldri.
//   POST /api/chat/files/:id/finans        → «Legg i Finans ›»: bildet legges i Finans-køen (POST /finans/api/receipts) → receiptOut
//   POST /api/chat/send: meldingene kan ha attachments:[id | {id}] (eller files:[id] som før). Bilder i siste melding sendes til
//        modellen (nedskalert til 1600 px); i samtalen lagres bare beskrivelsen {id,name,mime,kind,size,w,h,thumb,url} – aldri base64.
//        Innebygde images (base64, eldre apper) lagres som vedlegg med miniatyr på samme måte.
//   Bilde + valgt modell uten vision (f.eks. gpt-oss): beste lokale vision-modell svarer på akkurat denne meldingen
//        (meta.readWith {engine:'vision', model, label:'Lest med gemma3:12b fordi gpt-oss ikke kan se bilder'}); finnes ingen,
//        leses bildet med lokal OCR (Tesseract) og teksten sendes som «[Tekst fra bilde: …]» (readWith.engine 'ocr', «Lest med lokal OCR»).
//        imageMode:'ocr' i forespørselen tvinger OCR.
//   Kvittering i chat («les kvitteringen og skriv det i en tabell»): samme kvitteringskjede som Finans (prompt 48, server/receipts48),
//        som respekterer «Finansdata forlater aldri huset». Svaret er en markdown-tabell (Vare | Antall | Pris) + meta.receipt med
//        action {label:'Legg i Finans ›', method:'POST', url:'/api/chat/files/:id/finans'}. Ingen sky-modell ser kvitteringen.
//   GET /api/chat/models: vision fra Ollama /api/show (capabilities inneholder «vision»), lagret i chat_model_caps50.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { db as fdb } from './finans/db.js';
import { toJpeg50, thumbWebp50, sniffImage50, imageSize50 } from './img50.js';

const q = (sql) => db.prepare(sql);
export const FILES50 = resolve(config.dataDir, 'chat', 'files');
export const LIMITS50 = { maxBytes: 20 * 1024 * 1024, maxFiles: 10, modelPx: 1600, thumbPx: 480, hydrateMessages: 3 };

// Additiv migrasjon (samme tabell som chat.js oppretter; CREATE først fordi denne modulen evalueres før chat.js).
q('CREATE TABLE IF NOT EXISTS hl_chat_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT, path TEXT, text TEXT, owui_id TEXT, created INTEGER NOT NULL)').run();
{
  const cols = new Set(q('PRAGMA table_info(hl_chat_files)').all().map((c) => c.name));
  for (const [c, t] of [['kind', 'TEXT'], ['thumb', 'TEXT'], ['w', 'INTEGER'], ['h', 'INTEGER']]) if (!cols.has(c)) db.exec(`ALTER TABLE hl_chat_files ADD COLUMN ${c} ${t}`);
}
q('CREATE TABLE IF NOT EXISTS chat_model_caps50 (model TEXT PRIMARY KEY, base TEXT, vision INTEGER NOT NULL, caps TEXT, checked INTEGER NOT NULL)').run();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const kindOf50 = (mime) => (/^image\//.test(mime ?? '') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'file');
const userDir = (u) => join(FILES50, String(u).replace(/[^\w-]/g, '_'));

/* ---------------- Lagring ---------------- */

/** Lagrer en fil for brukeren (original + miniatyr for bilder). → raden i hl_chat_files */
export async function saveFile50(u, { buf, name, mime, text = null, owuiId = null }) {
  const id = randomUUID();
  const sniff = sniffImage50(buf);
  // Typen leses fra innholdet; påstår klienten «bilde» uten at det er et bilde, behandles det som en vanlig fil.
  const real = sniff ?? (/^image\//.test(mime ?? '') ? 'application/octet-stream' : (mime || 'application/octet-stream'));
  const kind = kindOf50(real);
  const dir = userDir(u);
  await mkdir(dir, { recursive: true });
  const path = join(dir, id);
  await writeFile(path, buf);
  let thumb = null, w = null, h = null;
  if (kind === 'image') {
    const t = await thumbWebp50(buf, LIMITS50.thumbPx).catch(() => null);
    if (t) { thumb = `${path}_t.webp`; await writeFile(thumb, t.buf); w = t.w ?? null; h = t.h ?? null; }
    else { const s = imageSize50(buf); if (s) { w = s.w; h = s.h; } }
  }
  q('INSERT INTO hl_chat_files(id,user_id,name,size,mime,path,text,owui_id,created,kind,thumb,w,h) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, u, String(name || 'vedlegg').replace(/[\\/\0]/g, '_').slice(0, 120), buf.length, real, path, text, owuiId, Date.now(), kind, thumb, w, h);
  return fileRow50(u, id);
}
export const fileRow50 = (u, id) => (UUID.test(String(id ?? '')) ? q('SELECT * FROM hl_chat_files WHERE id=? AND user_id=?').get(String(id), u) : null);
/** Beskrivelsen som lagres i meldingen og sendes til klientene. */
export function desc50(r) {
  if (!r) return null;
  const kind = r.kind ?? kindOf50(r.mime);
  return { id: r.id, name: r.name, mime: r.mime, kind, size: r.size, ...(r.w ? { w: r.w, h: r.h } : {}), url: `/api/chat/files/${r.id}`, ...(kind === 'image' ? { thumb: `/api/chat/files/${r.id}/thumb` } : {}) };
}
export async function deleteFile50(r) {
  for (const p of [r.path, r.thumb, r.path && `${r.path}_m.jpg`]) if (p) await unlink(p).catch(() => {});
}

/** Bildet slik modellen får det (nedskalert JPEG, base64). Hurtiglagres som <path>_m.jpg. */
export async function modelImage50(r) {
  const cache = `${r.path}_m.jpg`;
  try { return (await readFile(cache)).toString('base64'); } catch { /* lag den */ }
  const buf = await readFile(r.path);
  const j = await toJpeg50(buf, LIMITS50.modelPx).catch(() => null);
  if (j) { await writeFile(cache, j.buf).catch(() => {}); return j.buf.toString('base64'); }
  return buf.toString('base64'); // JS-reserve: originalen
}

/* ---------------- Ruter ---------------- */

const etagOf = (r, v) => `"${r.id}-${v}"`;
export function mountFiles50(api) {
  const send = async (c, r, path, mime, v) => {
    const tag = etagOf(r, v);
    if (c.req.header('if-none-match') === tag) return c.body(null, 304, { ETag: tag });
    let buf; try { buf = await readFile(path); } catch { return c.json({ error: 'Filen finnes ikke lenger' }, 404); }
    return c.body(buf, 200, { 'Content-Type': mime || 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable', ETag: tag,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(r.name)}`, 'X-Content-Type-Options': 'nosniff' });
  };
  api.get('/files/:id/thumb', async (c) => {
    const r = fileRow50(c.get('user'), c.req.param('id'));
    if (!r) return c.json({ error: 'Fant ikke vedlegget' }, 404);
    if ((r.kind ?? kindOf50(r.mime)) !== 'image') return c.json({ error: 'Vedlegget er ikke et bilde' }, 404);
    return r.thumb ? send(c, r, r.thumb, 'image/webp', 't') : send(c, r, r.path, r.mime, 'o');
  });
  api.get('/files/:id', async (c) => {
    const r = fileRow50(c.get('user'), c.req.param('id'));
    if (!r) return c.json({ error: 'Fant ikke vedlegget' }, 404);
    // Bare bilder og PDF vises i nettleseren; andre filer lastes ned (ingen HTML/SVG fra vedlegg på vårt domene).
    const safe = /^image\/(jpeg|png|webp|gif|heic)$|^application\/pdf$/.test(r.mime ?? '') ? r.mime : 'application/octet-stream';
    return send(c, r, r.path, safe, 'o');
  });
  // «Legg i Finans ›»: originalen går inn i den vanlige kvitteringskøen (samme tilgang som Finans: økt eller app-token).
  api.post('/files/:id/finans', async (c) => {
    const r = fileRow50(c.get('user'), c.req.param('id'));
    if (!r) return c.json({ error: 'Fant ikke vedlegget' }, 404);
    if (!/^image\/|^application\/pdf$/.test(r.mime ?? '')) return c.json({ error: 'Bare bilder og PDF kan legges i Finans' }, 400);
    let buf; try { buf = await readFile(r.path); } catch { return c.json({ error: 'Originalbildet finnes ikke lenger', kode: 'bilde_mangler' }, 404); }
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: r.mime }), r.name);
    const { default: finansApi } = await import('./finans/routes.js');
    const res = await finansApi.request('/receipts', { method: 'POST', headers: { cookie: c.req.header('cookie') ?? '', authorization: c.req.header('authorization') ?? '' }, body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return c.json({ error: j.error ?? `Finans svarte ${res.status}` }, res.status === 401 || res.status === 403 ? res.status : 502);
    return c.json({ ok: true, receiptId: j.id ?? null, receipt: j, url: '/finans/#/kv' }, 201);
  });
}

/* ---------------- Modeller: vision fra Ollama /api/show ---------------- */

const CAPS_TTL = 7 * 86400_000;
/** Setter vision på lokale Ollama-modeller ut fra /api/show (capabilities). Lagres; feiler kallet, beholdes gjetningen. */
export async function visionCaps50(list, base, F) {
  if (!base || !list.length) return list;
  const now = Date.now();
  await Promise.all(list.slice(0, 30).map(async (m) => {
    const row = q('SELECT * FROM chat_model_caps50 WHERE model=?').get(m.id);
    if (row && row.base === base && now - row.checked < CAPS_TTL) { m.vision = !!row.vision; m.visionFrom = 'ollama'; return; }
    try {
      const r = await F(`${base}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.id, name: m.id }), signal: AbortSignal.timeout(2500) });
      if (!r.ok) return;
      const caps = (await r.json())?.capabilities;
      if (!Array.isArray(caps)) return;
      m.vision = caps.includes('vision'); m.visionFrom = 'ollama';
      q('INSERT INTO chat_model_caps50(model, base, vision, caps, checked) VALUES(?,?,?,?,?) ON CONFLICT(model) DO UPDATE SET base=excluded.base, vision=excluded.vision, caps=excluded.caps, checked=excluded.checked')
        .run(m.id, base, m.vision ? 1 : 0, JSON.stringify(caps.slice(0, 20)), now);
    } catch { /* gjetningen fra navnet holder */ }
  }));
  return list;
}
export const _resetCaps50 = () => q('DELETE FROM chat_model_caps50').run();

/** Beste lokale modell som ser bilder (installert). rank = rankFor41 fra chat41.js. */
export function bestVision50(models, rank) {
  return rank('vision', models, { cloudOk: false }).find((m) => m.kind === 'lokal' && m.vision && m.installed !== false) ?? null;
}

/* ---------------- Meldinger ---------------- */

export const RECEIPT_RE50 = /\b(kvittering(?:en|a|er|ene)?|receipt)\b/i;
const IMG_MIME = /^image\/(jpeg|png|webp|gif|heic|heif)$/;

/** attachments i en innkommende melding → liste med id-er (strenger eller {id}). */
export const attIds50 = (list) => (Array.isArray(list) ? list.slice(0, LIMITS50.maxFiles).map((a) => (typeof a === 'string' ? a : a?.id)).filter((id) => UUID.test(String(id ?? ''))).map(String) : []);

/**
 * Gjør siste brukermelding klar: bildefiler (fra files eller attachments) og innebygde base64-bilder blir lagrede vedlegg med
 * miniatyr; bildene til modellen legges i images (nedskalert). Eldre meldinger med vedlegg får bildene sine igjen (de siste 3).
 * → {imageFiles: rader som er bilder (tas ut av files-listen), count}
 */
export async function prepareHistory50(u, history, fileRows = []) {
  const last = history.at(-1);
  const imageFiles = [];
  if (last?.role === 'user') {
    const ids = new Set(attIds50(last.attachments));
    for (const f of fileRows) if (f?.id && (f.kind === 'image' || IMG_MIME.test(f.mime ?? ''))) ids.add(f.id);
    const rows = [...ids].map((id) => fileRow50(u, id)).filter(Boolean);
    // Innebygde bilder (eldre apper sender base64): lagres som vedlegg, så historikken bare har miniatyrer.
    const inline = [];
    for (const b64 of last.images ?? []) {
      try { const buf = Buffer.from(b64, 'base64'); if (sniffImage50(buf)?.startsWith('image/')) inline.push(await saveFile50(u, { buf, name: 'Bilde', mime: sniffImage50(buf) })); } catch { /* ugyldig */ }
    }
    const all = [...rows, ...inline];
    const imgs = all.filter((r) => (r.kind ?? kindOf50(r.mime)) === 'image');
    imageFiles.push(...imgs);
    last.attachments = all.map(desc50);
    if (!last.attachments.length) delete last.attachments;
    last.images = await Promise.all(imgs.slice(0, 4).map((r) => modelImage50(r).catch(() => null))).then((x) => x.filter(Boolean));
    if (!last.images.length) delete last.images;
  }
  // Eldre meldinger: bildene hentes fra vedleggene (bare for de siste meldingene med bilder).
  let n = 0;
  for (let i = history.length - 2; i >= 0 && n < LIMITS50.hydrateMessages; i--) {
    const m = history[i];
    const imgs = (m.attachments ?? []).filter((a) => a?.kind === 'image');
    if (!imgs.length || m.images?.length) continue;
    n++;
    const rows = imgs.map((a) => fileRow50(u, a.id)).filter(Boolean).slice(0, 4);
    const b64 = (await Promise.all(rows.map((r) => modelImage50(r).catch(() => null)))).filter(Boolean);
    if (b64.length) m.images = b64;
  }
  return { imageFiles, count: last?.images?.length ?? 0 };
}

/** Meldingen slik den lagres: aldri base64 når vedleggene finnes (miniatyrene holder). */
export function stored50(m) {
  if (!m.attachments?.length) return m;
  const { images, ...rest } = m;
  void images;
  return rest;
}

/** Stripper bilder fra alle meldinger (modellen ser ikke bilder). */
export function dropImages50(history) { for (const m of history) if (m.images) delete m.images; }

/* ---------------- Lokal OCR ---------------- */

/** Leser teksten i bildene med Tesseract (lokalt). → {text, ok, error?} */
export async function ocrImages50(rows) {
  const { tesseractOcr48 } = await import('./receipts48/engines/tesseract.js');
  const parts = [];
  let err = null;
  for (const r of rows.slice(0, 4)) {
    try {
      const buf = await readFile(r.path);
      const small = await toJpeg50(buf, 2048).catch(() => null);
      const o = await tesseractOcr48(small?.buf ?? buf, small ? 'image/jpeg' : r.mime);
      parts.push(String(o.full_text ?? '').trim());
    } catch (e) { err = e.message; }
  }
  const text = parts.filter(Boolean).join('\n---\n').slice(0, 12_000);
  return { text, ok: !!text, ...(text ? {} : { error: err ?? 'Fant ingen tekst i bildet' }) };
}
export const ocrNote50 = (text) => `[Tekst fra bilde: ${text}]`;

/* ---------------- Kvittering i chat ---------------- */

const kr = (v) => (v == null ? '–' : `${Number(v).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`);
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
/** Markdown-tabell (Vare | Antall | Pris) for en kvittering i felles format. */
export function receiptTable50(rc) {
  const items = rc?.items ?? [];
  const head = `**${cell(rc?.merchant || 'Kvittering')}**${rc?.date ? ` · ${rc.date.split('-').reverse().join('.')}` : ''}`;
  const rows = items.map((l) => `| ${cell(l.description || '–')} | ${l.quantity != null ? String(l.quantity).replace('.', ',') : '1'} | ${kr(l.amount)} |`);
  const disc = (rc?.discounts ?? []).map((d) => `| ${cell(d.description || 'Rabatt')} |  | ${kr(d.amount)} |`);
  return [head, '', '| Vare | Antall | Pris |', '|---|---:|---:|', ...rows, ...disc, `| **Totalt** |  | **${kr(rc?.total)}** |`].join('\n');
}

/**
 * Leser kvitteringen i bildet med kvitteringskjeden fra prompt 48 (lokale steg først; Gemini bare når sperren er av).
 * → {ok, markdown, meta:{receipt, label, engine, model, confidence, fileId, action}} | {ok:false, error}
 */
export async function receiptChat50(u, row, { signal = null } = {}) {
  const { runChain48 } = await import('./receipts48/chain.js');
  let buf;
  try { buf = await readFile(row.path); } catch { return { ok: false, error: 'Fant ikke bildet' }; }
  const small = await toJpeg50(buf, 2048).catch(() => null);
  const categories = fdb.prepare("SELECT name FROM fh_categories WHERE kind='expense' AND user_id=? ORDER BY sort").all(u).map((x) => x.name);
  const res = await runChain48({ image: buf, mime: row.mime, smallImage: small?.buf ?? null, categories, signal, log: (s, d) => console.info(`[chat50] kvittering ${s} – ${String(d).slice(0, 160)}`) });
  const rc = res.receipt;
  if (!rc || (!rc.items?.length && rc.total == null)) return { ok: false, error: res.errors?.join(' · ') || 'Kvitteringen kunne ikke leses' };
  const label = `Lest med ${res.label ?? 'kvitteringsleseren'}`;
  return {
    ok: true,
    markdown: `${receiptTable50(rc)}\n\n${res.confidence === 'high' ? 'Summen stemmer med varelinjene.' : 'Sjekk beløpene – utlesingen er usikker.'}`,
    meta: {
      receipt: { merchant: rc.merchant ?? null, date: rc.date ?? null, total: rc.total ?? null, currency: rc.currency ?? 'NOK', items: (rc.items ?? []).map((l) => ({ description: l.description, quantity: l.quantity ?? null, amount: l.amount })),
        confidence: res.confidence, label: res.label, engine: res.engine, model: res.model, fileId: row.id,
        action: { label: 'Legg i Finans ›', method: 'POST', url: `/api/chat/files/${row.id}/finans` } },
      readWith: { engine: 'receipt', model: res.model ?? null, label },
    },
  };
}
