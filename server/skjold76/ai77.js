// Prompt 77 (SKJAISRV): Skjold Lab med smarte forslag – AI-oppgaven «skj» (Skjold Lab · gjenkjenning) via ai-run.
//   POST /ai/suggest            → forslag (navn, kategori, specs, tags, sikkerhet, begrunnelse) fra bilde og/eller tekst
//   POST /ai/images {q}         → bildekandidater (images77.js), GET /ai/thumb/:id (proxy), POST /parts/:id/photos/from-search {id}
//   POST /ai/tidy               → «Rydd opp» som bakgrunnsjobb (én del om gangen, viker for Glimt: ai-run background → gate-prioritet)
//   GET  /ai/tidy/:jobId · POST /ai/tidy/:jobId/apply {partIds} · POST /ai/tidy/:jobId/skip {partIds} · DELETE /ai/tidy/:jobId
//   GET|PUT /ai/settings        → {webImages, autoSuggestOnPhoto}
// Modellen svarer strukturert (JSON-schema, tenker aldri) og valideres i kode; ugyldig svar gir ett nytt forsøk, så norsk feil.
// Verdier fra fargebånd og koder regnes ut i decode77.js – modellen oppgir bare fargene/koden. Ingenting endres uten godkjenning.
import { randomBytes } from 'node:crypto';
import { db, kv } from '../db.js';
import { partRow76, partOut76, updatePart76, addHistory76 } from './store.js';
import { readImage76, saveImage76 } from './images.js';
import { magick50, toJpeg50 } from '../img50.js';
import { finalize77, heuristic77, colorOf77, DEFAULT_CATEGORIES77 } from './decode77.js';
import { searchImages77, proxyImage77, downloadImage77, searxngConfigured77 } from './images77.js';

const q = (sql) => db.prepare(sql);
const NS = { 'Cache-Control': 'no-store' };
const J = (s, d) => { if (s == null) return d; try { return JSON.parse(s) ?? d; } catch { return d; } };
export const TIMEOUT_IMAGE77 = 60_000;
export const TIMEOUT_TEXT77 = 30_000;
export const TIMEOUT_TIDY77 = 180_000; // bakgrunn: tiden i køen bak Glimt teller med
const MOCK = () => process.env.MOCK_DATA === '1' && !process.env.OLLAMA_URL;

let aiImpl = null;
/** Bare for tester: erstatter ai-run.run(task, opts) → {data?, text}. null = ekte ai-run. */
export const _setAi77 = (fn) => { aiImpl = fn ?? null; };
async function aiRun(task, o) {
  if (aiImpl) return aiImpl(task, o);
  const { run } = await import('../ai-run.js');
  return run(task, o);
}

/* ---------------- Innstillinger ---------------- */

const SET_DEF = { webImages: true, autoSuggestOnPhoto: true };
export const settings77 = (user) => ({ ...SET_DEF, ...(kv.get(user, 'skjold77_ai', null) ?? {}) });
export function saveSettings77(user, b) {
  const cur = settings77(user);
  for (const k of Object.keys(SET_DEF)) if (typeof b?.[k] === 'boolean') cur[k] = b[k];
  kv.set(user, 'skjold77_ai', { webImages: cur.webImages, autoSuggestOnPhoto: cur.autoSuggestOnPhoto });
  return cur;
}

/* ---------------- Modellkallet ---------------- */

export const SCHEMA77 = {
  type: 'object',
  properties: {
    type: { type: 'string' }, name: { type: 'string' }, value: { type: 'string' }, variant: { type: 'string' },
    category: { type: 'string' }, categoryNew: { type: 'boolean' },
    specs: { type: 'object', additionalProperties: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } },
    bands: { type: 'array', items: { type: 'string' } }, code: { type: 'string' },
    confidence: { type: 'number' }, why: { type: 'string' },
  },
  required: ['type', 'name', 'category', 'confidence', 'why'],
};
const SYSTEM77 = `Du kjenner igjen elektronikkomponenter og smådeler (motstander, kondensatorer, LED, IC-er, mikrokontrollere, sensorer, moduler, kontakter, kabler, skruer, mutre, avstandsstykker, brytere, sikringer, verktøy) for et personlig sorteringsskap.
Svar KUN med JSON etter skjemaet, på norsk bokmål:
- type: komponenttypen på norsk (f.eks. «Motstand», «Kondensator», «LED», «Skrue», «Mutter», «Mikrokontroller», «Sensor», «Modul»).
- name: kort navn etter malen «Type Verdi Variant», f.eks. «Motstand 10 kΩ ¼ W», «Skrue M3 × 10 unbrako», «LED 5 mm rød», «ESP32-DevKitC V4».
- value: verdien slik den står (f.eks. «10k», «100nF», «M3x10»); variant: det som skiller (effekt, spenning, farge, hode).
- category: velg en av kategoriene i listen. Bare hvis ingen passer: foreslå en ny og sett categoryNew=true.
- specs: nøkler som verdi, toleranse, effekt, pakke, spenning, strøm, gjenger, lengde, diameter, farge, hode, brikke (bare det du vet).
- tags: 0–5 korte stikkord med små bokstaver.
- Motstand med fargebånd: oppgi fargene i bands fra venstre (f.eks. ["brun","svart","oransje","gull"]). IKKE regn ut verdien selv.
- Trykt kode (SMD-motstand «103»/«4R7», kondensator «104»): oppgi den i code. IKKE regn ut verdien selv.
- confidence: 0–1 (hvor sikker du er). why: én kort setning om hva du så/leste.
Ikke finn på verdier du ikke ser eller leser.`;

/** Validerer modellens svar i kode. → {ok:true, value} | {ok:false, error} */
export function validate77(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'svaret er ikke et JSON-objekt' };
  const isStr = (v) => typeof v === 'string';
  if (!isStr(d.name) || !d.name.trim() || d.name.length > 200) return { ok: false, error: 'name mangler' };
  if (!isStr(d.type)) return { ok: false, error: 'type mangler' };
  if (!isStr(d.category)) return { ok: false, error: 'category mangler' };
  if (typeof d.confidence !== 'number' || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 100) return { ok: false, error: 'confidence må være et tall 0–1' };
  if (d.why != null && !isStr(d.why)) return { ok: false, error: 'why må være tekst' };
  for (const k of ['value', 'variant', 'code']) if (d[k] != null && !isStr(d[k])) return { ok: false, error: `${k} må være tekst` };
  if (d.categoryNew != null && typeof d.categoryNew !== 'boolean') return { ok: false, error: 'categoryNew må være true/false' };
  if (d.specs != null && (typeof d.specs !== 'object' || Array.isArray(d.specs) || Object.values(d.specs).some((v) => v != null && typeof v === 'object'))) return { ok: false, error: 'specs må være et objekt med tekstverdier' };
  if (d.tags != null && (!Array.isArray(d.tags) || d.tags.some((t) => !isStr(t)))) return { ok: false, error: 'tags må være en liste med tekst' };
  if (d.bands != null) {
    if (!Array.isArray(d.bands) || d.bands.length > 6) return { ok: false, error: 'bands må være en liste med maks 6 farger' };
    const bad = d.bands.find((b) => !isStr(b) || colorOf77(b) == null);
    if (bad !== undefined) return { ok: false, error: `ukjent farge i bands: ${String(bad)}` };
  }
  return { ok: true, value: d };
}

export class Suggest77Error extends Error {
  constructor(message, status = 502, code = 'failed') { super(message); this.status = status; this.code = code; }
}
/** Brukerens kategorier (fra delene). */
export const userCategories77 = (user) => q("SELECT DISTINCT category FROM skj_parts WHERE user_id=? AND deleted_at IS NULL AND category IS NOT NULL AND trim(category)<>'' ORDER BY category COLLATE NOCASE").pluck().all(user);

/** Teksten modellen får om delen. */
function describe(t) {
  const lines = [];
  if (t.name) lines.push(`Navn: ${t.name}`);
  if (t.description) lines.push(`Beskrivelse: ${t.description}`);
  const sp = Object.entries(t.specs ?? {}).filter(([k, v]) => k && v != null && v !== '');
  if (sp.length) lines.push(`Specs: ${sp.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (t.category) lines.push(`Nåværende kategori: ${t.category}`);
  return lines.join('\n');
}

/**
 * Forslag for én del. input = {name, description, specs, category, image?:Buffer}. → forslaget (kontraktens felt) + source.
 * Kaster Suggest77Error (status/kode + norsk tekst).
 */
export async function suggest77(user, input, { background = false, timeoutMs = null, signal = null } = {}) {
  const text = describe(input);
  const image = input.image ?? null;
  if (!text && !image) throw new Suggest77Error('Skriv et navn eller legg til et bilde først', 400, 'empty');
  const source = image && text ? 'begge' : image ? 'bilde' : 'tekst';
  const cats = userCategories77(user);
  const plain = [input.name, input.description, ...Object.entries(input.specs ?? {}).map(([k, v]) => `${k} ${v}`)].filter(Boolean).join(' ');
  if (MOCK() && !aiImpl) {
    // Uten modell (mock-serveren): tekstheuristikk, og et fast eksempel (fargebånd) når det bare finnes et bilde.
    const raw = plain ? { ...heuristic77(plain), ...(input.name ? { name: input.name } : {}) } : { type: 'Motstand', name: 'Motstand', bands: ['brun', 'svart', 'oransje', 'gull'], specs: { effekt: '0.25W' }, tags: ['tht'], confidence: 0.6, why: 'Leste fargebåndene brun, svart, oransje og gull (mock)' };
    return { ...finalize77(raw, { userCats: cats, text: plain, baseSpecs: input.specs }), source, mock: true };
  }
  const list = cats.length ? cats : DEFAULT_CATEGORIES77;
  const prompt = `${cats.length ? 'Brukerens kategorier' : 'Kategorier (standardlisten)'}: ${list.join(', ')}\n\n${text || '(ingen tekst – bare bildet)'}${image ? '\n\nBildet viser delen. Les fargebånd og trykt kode hvis de finnes.' : ''}`;
  const limit = timeoutMs ?? (image ? TIMEOUT_IMAGE77 : TIMEOUT_TEXT77);
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), limit);
    const onOuter = () => ctrl.abort(signal.reason);
    signal?.addEventListener?.('abort', onOuter, { once: true });
    let out;
    try {
      out = await aiRun('skj', {
        user, system: SYSTEM77, prompt: attempt === 1 ? prompt : `${prompt}\n\nForrige svar var ugyldig (${lastErr}). Svar KUN med gyldig JSON etter skjemaet.`,
        ...(image ? { images: [image] } : {}), schema: SCHEMA77, json: true, think: false, temperature: 0, numPredict: 500, noRetry: true,
        background, signal: ctrl.signal, title: `Skjold Lab · ${image ? 'kjenner igjen del (bilde)' : 'foreslår navn'}${background ? ' · rydd opp' : ''}`,
      });
    } catch (e) {
      if (signal?.aborted) throw new Suggest77Error('Avbrutt', 499, 'cancelled');
      if (ctrl.signal.aborted) throw new Suggest77Error(`Glimt brukte mer enn ${Math.round(limit / 1000)} s – prøv igjen`, 504, 'timeout');
      if (/gyldig JSON/i.test(String(e?.message)) && attempt === 1) { lastErr = 'ikke gyldig JSON'; continue; }
      if (/gyldig JSON/i.test(String(e?.message))) break;
      throw new Suggest77Error(`Glimt kunne ikke foreslå: ${String(e?.message ?? e).slice(0, 240)}`, e?.code === 'no_model' ? 503 : 502, e?.code === 'no_model' ? 'no_model' : 'ai');
    } finally { clearTimeout(timer); signal?.removeEventListener?.('abort', onOuter); }
    let data = out?.data;
    if (data === undefined) { try { data = JSON.parse(String(out?.text ?? '').replace(/^```(?:json)?\s*|```$/g, '')); } catch { data = null; } }
    const v = validate77(data);
    if (v.ok) return { ...finalize77(v.value, { userCats: cats, text: plain, baseSpecs: input.specs }), source, ...(out?.model ? { model: out.model } : {}) };
    lastErr = v.error;
  }
  throw new Suggest77Error('Glimt ga et ugyldig svar to ganger. Prøv igjen, eller fyll inn selv.', 502, 'invalid');
}

/** Bildet til modellen: maks 1024 px JPEG når ImageMagick finnes. */
async function forModel(buf) {
  if (!buf) return null;
  if (await magick50()) { const j = await toJpeg50(buf, 1024, 85); if (j?.buf) return j.buf; }
  return buf;
}
const specsOf = (v) => {
  if (v == null || v === '') return {};
  if (typeof v === 'string') { try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } }
  return typeof v === 'object' && !Array.isArray(v) ? v : {};
};

/* ---------------- Rydd opp (bakgrunnsjobb) ---------------- */

const JOBS = new Map(); // jobId → job
const JOB_TTL = 24 * 3600_000;
export const _tidyJobs77 = JOBS;
const snap = (r) => ({ name: r.name, category: r.category ?? null, specs: J(r.specs, {}), tags: J(r.tags, []) });
function jobOut(j) {
  return { jobId: j.id, state: j.state, done: j.done, total: j.total, error: j.error ?? null, startedAt: new Date(j.started).toISOString(), finishedAt: j.finished ? new Date(j.finished).toISOString() : null,
    items: j.items.map((it) => ({ partId: it.partId, status: it.status, before: it.before, ...(it.after ? { after: it.after, confidence: it.confidence, why: it.why, changed: it.changed } : {}), ...(it.error ? { error: it.error } : {}) })) };
}
function gcJobs() { const now = Date.now(); for (const [id, j] of JOBS) if (j.finished && now - j.finished > JOB_TTL) JOBS.delete(id); }
/** Starter «Rydd opp». partIds = liste, eller all = alle delene. → job | {error,status} */
export function startTidy77(user, { partIds = null, all = false } = {}) {
  gcJobs();
  const running = [...JOBS.values()].find((j) => j.user === user && j.state === 'running');
  if (running) return { error: 'Rydd opp kjører allerede', status: 409, jobId: running.id };
  let rows;
  if (all) rows = q('SELECT * FROM skj_parts WHERE user_id=? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE LIMIT 500').all(user);
  else {
    const ids = [...new Set((Array.isArray(partIds) ? partIds : []).map(Number).filter(Number.isInteger))].slice(0, 500);
    if (!ids.length) return { error: 'Velg deler (partIds) eller all: true', status: 400 };
    rows = ids.map((id) => partRow76(user, id)).filter(Boolean);
  }
  if (!rows.length) return { error: 'Fant ingen deler å rydde', status: 404 };
  const j = { id: randomBytes(8).toString('hex'), user, state: 'running', done: 0, total: rows.length, started: Date.now(), finished: null, ctrl: new AbortController(),
    items: rows.map((r) => ({ partId: r.id, status: 'pending', before: snap(r), updated: r.updated })) };
  JOBS.set(j.id, j);
  runTidy(j).catch((e) => { j.state = 'failed'; j.error = String(e?.message ?? e); j.finished = Date.now(); });
  return j;
}
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function runTidy(j) {
  for (const it of j.items) {
    if (j.ctrl.signal.aborted) break;
    const r = partRow76(j.user, it.partId);
    if (!r) { it.status = 'error'; it.error = 'Delen finnes ikke lenger'; j.done++; continue; }
    const photos = J(r.photos, []), specs = J(r.specs, {});
    // Bilde bare når teksten sier lite (visjon er tregt): ingen specs og maks to ord i navnet.
    let image = null;
    if (photos.length && !Object.keys(specs).length && String(r.name).trim().split(/\s+/).length <= 2) image = await forModel(readImage76(j.user, photos[0])?.buf ?? null);
    try {
      const s = await suggest77(j.user, { name: r.name, description: r.description, specs, category: r.category, image }, { background: true, timeoutMs: TIMEOUT_TIDY77, signal: j.ctrl.signal });
      const after = { name: s.name, category: s.category, categoryNew: s.categoryNew, specs: { ...specs, ...s.specs }, tags: [...new Set([...J(r.tags, []), ...s.tags])].slice(0, 20) };
      it.after = after; it.confidence = s.confidence; it.why = s.why;
      it.changed = after.name !== r.name || (after.category ?? null) !== (r.category ?? null) || !sameJson(after.specs, specs) || !sameJson(after.tags, J(r.tags, []));
      it.status = it.changed ? 'ready' : 'unchanged';
    } catch (e) {
      if (e?.code === 'cancelled') break;
      it.status = 'error'; it.error = e?.message ?? String(e);
      // Ingen modell: resten vil feile likt – stopp jobben med én melding.
      if (e?.code === 'no_model') { j.state = 'failed'; j.error = it.error; j.done++; j.finished = Date.now(); return; }
    }
    j.done++;
  }
  j.state = j.ctrl.signal.aborted ? 'cancelled' : 'done';
  j.finished = Date.now();
}
export const tidyJob77 = (user, id) => { const j = JOBS.get(String(id)); return j && j.user === user ? j : null; };

const EDIT_KEYS = ['name', 'category', 'specs', 'tags', 'description'];
/** Godkjenner forslag. Delen må være uendret siden forslaget (ellers hoppes den over). Logges som «endret» i historikken (kan angres). */
export function applyTidy77(user, j, partIds) {
  const want = new Set((Array.isArray(partIds) ? partIds : []).map(Number));
  const applied = [], skipped = [];
  db.transaction(() => {
    for (const it of j.items) {
      if (!want.has(it.partId)) continue;
      if (it.status !== 'ready') { skipped.push({ partId: it.partId, reason: it.status === 'applied' ? 'allerede godtatt' : it.status === 'unchanged' ? 'ingen endring' : it.status === 'skipped' ? 'hoppet over' : 'ingen forslag' }); continue; }
      const cur = partRow76(user, it.partId);
      if (!cur) { skipped.push({ partId: it.partId, reason: 'delen finnes ikke lenger' }); continue; }
      if (cur.updated !== it.updated) { skipped.push({ partId: it.partId, reason: 'delen er endret siden forslaget' }); continue; }
      const f = { name: it.after.name.slice(0, 120), category: it.after.category ? it.after.category.slice(0, 60) : null, specs: it.after.specs, tags: it.after.tags };
      const before = snap(cur);
      const changed = Object.keys(f).filter((k) => !sameJson(f[k], before[k]));
      if (!changed.length) { it.status = 'unchanged'; skipped.push({ partId: it.partId, reason: 'ingen endring' }); continue; }
      updatePart76(user, cur.id, f);
      addHistory76(user, cur.id, 'endret', { ...Object.fromEntries(changed.map((k) => [k, before[k]])), via: 'glimt' }, Object.fromEntries(changed.map((k) => [k, f[k]])));
      const hid = q('SELECT max(id) FROM skj_history WHERE user_id=? AND part_id=?').pluck().get(user, cur.id);
      it.status = 'applied';
      applied.push({ partId: cur.id, historyId: hid });
    }
  })();
  return { applied, skipped };
}
/** Angrer en «endret»-hendelse (navn, kategori, specs, tags, beskrivelse). → rad | null (kan ikke angres) */
export function undoEdit77(user, h) {
  const from = J(h.from, null);
  if (h.action !== 'endret' || !from || from.deleted != null) return null;
  const cur = partRow76(user, h.part_id);
  if (!cur) return null;
  const f = Object.fromEntries(EDIT_KEYS.filter((k) => k in from).map((k) => [k, from[k]]));
  if (!Object.keys(f).length) return null;
  const before = { ...snap(cur), description: cur.description ?? null };
  const row = updatePart76(user, cur.id, f);
  addHistory76(user, cur.id, 'endret', Object.fromEntries(Object.keys(f).map((k) => [k, before[k]])), { ...f, undo: h.id });
  return row;
}

/* ---------------- Ruter ---------------- */

const inflight = new Map();
/**
 * Monterer rutene på /api/skjold (kalles fra api.js). helpers = {fileOf(c), uploadLimit}.
 */
export function mountAi77(app, { fileOf, uploadLimit }) {
  const err = (c, e) => c.json({ error: e.message, code: e.code ?? null }, e.status ?? 500);

  app.post('/ai/suggest', uploadLimit, async (c) => {
    const u = c.get('user'), ct = c.req.header('content-type') ?? '';
    let b = {}, file = null;
    if (/^multipart\/form-data/i.test(ct)) {
      const f = await c.req.parseBody().catch(() => ({}));
      b = { partId: f.partId, name: f.name, description: f.description, specs: f.specs, photo: f.photo, category: f.category, usePhoto: f.usePhoto === 'false' ? false : undefined };
      const up = f.file ?? f.image;
      if (up instanceof File) file = Buffer.from(await up.arrayBuffer());
    } else if (/^image\//i.test(ct)) file = Buffer.from(await c.req.arrayBuffer());
    else b = (await c.req.json().catch(() => null)) ?? {};
    if (typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {partId?, name?, description?, specs?, photo?}' }, 400);
    let part = null;
    if (b.partId != null && b.partId !== '') { part = partRow76(u, b.partId); if (!part) return c.json({ error: 'Fant ikke delen' }, 404); }
    const has = (k) => b[k] !== undefined && b[k] !== null;
    const input = {
      name: String(has('name') ? b.name : part?.name ?? '').trim().slice(0, 200),
      description: String(has('description') ? b.description : part?.description ?? '').trim().slice(0, 1000),
      specs: has('specs') ? specsOf(b.specs) : J(part?.specs, {}),
      category: String(has('category') ? b.category : part?.category ?? '').trim().slice(0, 60),
    };
    let img = file;
    if (!img && typeof b.photo === 'string' && b.photo) {
      const f = readImage76(u, b.photo.replace(/^.*\/files\//, '').replace(/\?.*$/, ''));
      if (!f) return c.json({ error: 'Fant ikke bildet' }, 404);
      img = f.buf;
    }
    if (!img && part && b.usePhoto !== false && !has('photo')) { const ph = J(part.photos, []); if (ph.length) img = readImage76(u, ph[0])?.buf ?? null; }
    if (img && img.length > 10 * 1024 * 1024) return c.json({ error: 'Bildet er for stort (maks 10 MB)' }, 413);
    input.image = await forModel(img);
    const n = inflight.get(u) ?? 0;
    if (n >= 2) return c.json({ error: 'Glimt tenker allerede på to forslag – vent litt', code: 'busy' }, 429);
    inflight.set(u, n + 1);
    try { return c.json(await suggest77(u, input), 200, NS); }
    catch (e) { if (e instanceof Suggest77Error) return err(c, e); throw e; }
    finally { const m = (inflight.get(u) ?? 1) - 1; if (m > 0) inflight.set(u, m); else inflight.delete(u); }
  });

  app.post('/ai/images', async (c) => {
    const u = c.get('user'), b = (await c.req.json().catch(() => null)) ?? {};
    let qq = typeof b.q === 'string' ? b.q : '';
    if (!qq.trim() && b.partId != null) qq = partRow76(u, b.partId)?.name ?? '';
    const r = await searchImages77(u, qq, { enabled: settings77(u).webImages });
    if (r.error) return c.json({ error: r.error, code: r.code }, r.status);
    return c.json(r, 200, NS);
  });

  app.get('/ai/thumb/:id', async (c) => {
    try {
      const v = await proxyImage77(c.get('user'), c.req.param('id'), c.req.query('size') === 'preview' ? 'preview' : 'thumb');
      return c.body(v.buf, 200, { 'Content-Type': v.type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    } catch (e) { return c.json({ error: e.message, code: e.code ?? null }, e.status ?? 502); }
  });

  app.post('/parts/:id{[0-9]+}/photos/from-search', async (c) => {
    const u = c.get('user'), cur = partRow76(u, c.req.param('id'));
    if (!cur) return c.json({ error: 'Fant ikke delen' }, 404);
    const b = (await c.req.json().catch(() => null)) ?? {};
    if (typeof b.id !== 'string' || !b.id) return c.json({ error: 'Forventet {id} fra bildesøket' }, 400);
    if (!settings77(u).webImages) return c.json({ error: '«Finn bilder på nett» er slått av. Slå det på under Innstillinger → Moduler → Skjold Lab.', code: 'off' }, 409);
    const photos = J(cur.photos, []);
    if (photos.length >= 12) return c.json({ error: 'Maks 12 bilder per del' }, 409);
    let dl;
    try { dl = await downloadImage77(u, b.id); } catch (e) { return c.json({ error: e.message, code: e.code ?? null }, e.status ?? 502); }
    const r = await saveImage76(u, dl.buf);
    if (r.error) return c.json({ error: r.error }, r.status);
    const row = updatePart76(u, cur.id, { photos: [...photos, r.name] });
    return c.json({ ...partOut76(row, { user: u }), converted: r.converted, from: { title: dl.title, source: dl.source } }, 201);
  });

  app.post('/ai/tidy', async (c) => {
    const u = c.get('user'), b = (await c.req.json().catch(() => null)) ?? {};
    const j = startTidy77(u, { partIds: b.partIds, all: b.all === true });
    if (j.error) return c.json({ error: j.error, ...(j.jobId ? { jobId: j.jobId } : {}) }, j.status);
    return c.json({ jobId: j.id, total: j.total, state: j.state }, 202);
  });
  app.get('/ai/tidy/:jobId', (c) => {
    const j = tidyJob77(c.get('user'), c.req.param('jobId'));
    return j ? c.json(jobOut(j), 200, NS) : c.json({ error: 'Fant ikke jobben' }, 404);
  });
  app.post('/ai/tidy/:jobId/apply', async (c) => {
    const u = c.get('user'), j = tidyJob77(u, c.req.param('jobId'));
    if (!j) return c.json({ error: 'Fant ikke jobben' }, 404);
    const b = (await c.req.json().catch(() => null)) ?? {};
    const ids = b.all === true ? j.items.filter((x) => x.status === 'ready').map((x) => x.partId) : b.partIds;
    if (!Array.isArray(ids) || !ids.length) return c.json({ error: 'Forventet {partIds: [...]}' }, 400);
    const r = applyTidy77(u, j, ids);
    const parts = r.applied.map((a) => partOut76(partRow76(u, a.partId), { user: u }));
    return c.json({ ok: true, ...r, historyIds: r.applied.map((x) => x.historyId), parts, job: jobOut(j) });
  });
  app.post('/ai/tidy/:jobId/skip', async (c) => {
    const u = c.get('user'), j = tidyJob77(u, c.req.param('jobId'));
    if (!j) return c.json({ error: 'Fant ikke jobben' }, 404);
    const b = (await c.req.json().catch(() => null)) ?? {};
    const want = new Set((b.all === true ? j.items.map((x) => x.partId) : Array.isArray(b.partIds) ? b.partIds : []).map(Number));
    for (const it of j.items) if (want.has(it.partId) && it.status === 'ready') it.status = 'skipped';
    return c.json({ ok: true, job: jobOut(j) });
  });
  app.delete('/ai/tidy/:jobId', (c) => {
    const j = tidyJob77(c.get('user'), c.req.param('jobId'));
    if (!j) return c.json({ error: 'Fant ikke jobben' }, 404);
    if (j.state === 'running') j.ctrl.abort(new Error('avbrutt'));
    return c.json({ ok: true, state: j.state === 'running' ? 'cancelled' : j.state });
  });

  app.get('/ai/settings', (c) => c.json({ ...settings77(c.get('user')), searxng: searxngConfigured77() }, 200, NS));
  app.put('/ai/settings', async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {webImages, autoSuggestOnPhoto}' }, 400);
    for (const k of ['webImages', 'autoSuggestOnPhoto']) if (k in b && typeof b[k] !== 'boolean') return c.json({ error: `${k} må være true eller false` }, 400);
    return c.json({ ...saveSettings77(c.get('user'), b), searxng: searxngConfigured77() });
  });
}
