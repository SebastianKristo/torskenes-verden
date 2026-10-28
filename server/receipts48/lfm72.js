// Prompt 72 (LFM72): Liquid AI-visjonsmodellene som valgbare motorer i kvitteringskjeden – AV som standard.
//   lfm3vl      LFM3-VL-2B uten tenking: leser bildet rett til kvitteringsformatet (samme schema og validering som steg V).
//   lfm25layout LFM2.5-VL-3B: dokumentlayout («image_index=<n> <label> [xmin, ymin, xmax, ymax]» + innhold, tabeller som OTSL)
//               → rader i lesefølge → qwen3:8b med samme schema og validering.
// Brukes i steg V (ingen OCR), i crossCheck51 (ekstra kontroll av totalen) og i steg L (layouten ordner Mac-OCR-linjene i
// kolonner/rader før qwen3:8b). Standarden er uendret: Apple Vision OCR + qwen3:8b, og V = qwen2.5vl.
//
// Alle kall går gjennom ai-run.run('rc', {local72}) → ai-gate (kø, tidsgrenser, jobbloggen), til Ollama i huset eller oMLX
// (server/omlx58, bak vakten på Mac mini-en). Aldri sky: et modellnavn som ikke er lokalt, stoppes av cloud-guard52.
// Strukturerte kall tenker aldri: think:false (Ollama) / chat_template_kwargs.enable_thinking=false (oMLX, via THINKING_RE «lfm3»).
// <think>-blokker fjernes alltid før JSON leses.
import { stripThink } from '../ollama-opts.js';
import { modelFormat48 } from './schema.js';
import { rows48 } from './normalize.js';
import { totalCandidates48 } from './validate.js';
import { parseRows48 } from './engines/llm.js';
import { blockCloudReceipt52 } from './cloud-guard52.js';
import { CLOUD_MODEL72 } from './settings.js';

/** Standard modellnavn per motor. Sjekk navnene på Hugging Face før du henter dem (tools/lfm72/README.md). */
export const LFM_MODELS72 = Object.freeze({
  ollama: Object.freeze({ lfm3: 'hf.co/LiquidAI/LFM3-VL-2B-GGUF', lfm25: 'hf.co/LiquidAI/LFM2.5-VL-3B-GGUF' }),
  omlx: Object.freeze({ lfm3: 'mlx-community/LFM3-VL-2B-4bit', lfm25: 'mlx-community/LFM2.5-VL-3B-4bit' }),
});
/** Anbefalte innstillinger fra docs.liquid.ai (vision-capabilities). */
export const LFM_SAMPLING72 = Object.freeze({
  lfm3: Object.freeze({ temperature: 0.1, top_k: 50, repeat_penalty: 1.1 }),
  lfm25: Object.freeze({ temperature: 0.1, repeat_penalty: 1.05 }),
});
export const ENGINE_LABELS72 = { qwen25vl: 'qwen2.5vl (standard)', lfm3vl: 'LFM3-VL-2B', lfm25layout: 'LFM2.5-VL-3B layout + qwen3:8b', off: 'Av' };
export const LFM_NOTE72 = 'Modellen må hentes først (tools/lfm72/README.md). Bildene går bare til Ollama eller oMLX i huset.';
// Instruksen for layout-modus. Sjekk ordlyden mot modellkortet til LFM2.5-VL-3B (layoutmodusen er trent på en bestemt prompt).
export const LAYOUT_PROMPT72 = 'Parse the document layout. List every element in reading order as image_index=<n> <label> [xmin, ymin, xmax, ymax] followed by its content. Write tables as OTSL.';
const TOTAL_SCHEMA72 = Object.freeze({ type: 'object', properties: { total: { type: ['number', 'null'] } }, required: ['total'] });
const TOTAL_SYSTEM72 = 'Du leser BILDET av en norsk kvittering. Svar bare med JSON: {"total": <beløpet ved TOTAL / Å BETALE / SUM / BETALT som tall med punktum, eller null>}. Ikke regn ut noe selv.';

/* ---------------- Testkroker ---------------- */
let runImpl = null, textImpl = null;
/** Bare for tester: erstatter ai-run.run (task, opts) → {text, data?, model, timing?}. */
export const _setLfmRun72 = (fn) => { runImpl = fn ?? null; };
/** Bare for tester: erstatter tekststeget (parseRows48) i lfm25layout. */
export const _setLfmText72 = (fn) => { textImpl = fn ?? null; };
async function aiRun(task, o) {
  if (runImpl) return runImpl(task, o);
  const { run } = await import('../ai-run.js');
  return run(task, o);
}

/* ---------------- Modell og motor ---------------- */

/** Modellen for which ('lfm3' | 'lfm25') etter innstillingene. → {id, engine:'ollama'|'omlx'} */
export function lfmModel72(which, cfg = {}) {
  const engine = cfg.lfmBackend72 === 'omlx' ? 'omlx' : 'ollama';
  const own = which === 'lfm3' ? cfg.lfm3Model72 : cfg.lfm25Model72;
  return { id: String(own || LFM_MODELS72[engine][which]).trim(), engine };
}
/** Sperren: bare lokale modeller (Ollama/MLX). Ellers kastes cloud-guard52-feilen (og advarselen logges). */
export function assertLocal72(model, where = 'lfm72') {
  const id = String(model?.id ?? model ?? '');
  if (!id || CLOUD_MODEL72.test(id)) throw blockCloudReceipt52(where, /gemini/i.test(id) ? 'gemini' : 'sky');
  return true;
}

/* ---------------- Tekst → JSON ---------------- */

/** Fjerner <think>…</think> (også uavsluttet) og LFM-varianten <|think|>. */
export const stripThink72 = (t) => stripThink(String(t ?? '').replace(/<\|think\|>[\s\S]*?<\|\/think\|>/gi, ''));
/** Første JSON-objekt i svaret (etter at tenking og ```-gjerder er fjernet). Kaster {badJson:true}. */
export function parseJson72(text) {
  const s = stripThink72(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch { /* prøv objektet inni */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  throw Object.assign(new Error('LFM svarte ikke med gyldig JSON'), { badJson: true });
}

/* ---------------- Layout (LFM2.5-VL) ---------------- */

const KNOWN_LABELS72 = /^(text|title|section_header|list|list_item|table|page_header|page_footer|caption|footnote|formula|picture|figure|code|key_value|form|checkbox|document_index)$/i;
const NUM = '(-?\\d+(?:\\.\\d+)?)';
const HEAD72 = new RegExp(`^\\s*(?:image_index\\s*=\\s*(\\d+)\\s+)?([A-Za-z][\\w-]*)\\s*\\[\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\]\\s*:?\\s?(.*)$`);
const clamp = (v) => Math.min(1000, Math.max(0, +v));

/** OTSL (<fcel>, <ecel>, <lcel>, <ucel>, <xcel>, <ched>, <rhed>, <srow>, <nl>) → [[celle, …], …]. Sammenslåtte celler blir ''. */
export function parseOtsl72(s) {
  const body = String(s ?? '').replace(/<\/?otsl>/gi, '').replace(/<loc_\d+>/gi, '');
  const rows = [];
  for (const seg of body.split(/<nl>/i)) {
    const cells = [];
    for (const m of seg.matchAll(/<(fcel|ecel|lcel|ucel|xcel|ched|rhed|srow)>([^<]*)/gi)) cells.push(/^(ecel|lcel|ucel|xcel)$/i.test(m[1]) ? '' : m[2].trim());
    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows;
}
const isOtsl = (s) => /<(fcel|ecel|ched|nl)>/i.test(String(s ?? ''));

/**
 * Layoutsvaret → [{index, label, bbox:[x0,y0,x1,y1] (0–1000), text, table?:[[celler]]}] i den rekkefølgen modellen skrev dem.
 * Innholdet er resten av overskriftslinja pluss linjene fram til neste element.
 */
export function parseLayout72(raw) {
  const out = [];
  let cur = null;
  for (const line of stripThink72(raw).split(/\r?\n/)) {
    const m = line.match(HEAD72);
    if (m && (m[1] != null || KNOWN_LABELS72.test(m[2]))) {
      const [x0, y0, x1, y1] = [m[3], m[4], m[5], m[6]].map(clamp);
      cur = { index: m[1] != null ? +m[1] : 0, label: m[2].toLowerCase(), bbox: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)], lines: m[7] ? [m[7]] : [] };
      out.push(cur);
    } else if (cur) cur.lines.push(line);
  }
  return out.map(({ lines, ...e }) => {
    const text = lines.join('\n').trim();
    return { ...e, text, ...(e.label === 'table' || isOtsl(text) ? { table: parseOtsl72(text) } : {}) };
  });
}

/** Elementene → rader i lesefølge (tabellrader: cellene med mellomrom; tekst: én rad per linje). */
export function layoutRows72(elements) {
  const rows = [];
  for (const e of elements ?? []) {
    if (e.table?.length) for (const r of e.table) { const t = r.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); if (t) rows.push(t); }
    else for (const l of String(e.text ?? '').split('\n')) { const t = l.replace(/<[^>]{1,20}>/g, ' ').replace(/\s+/g, ' ').trim(); if (t) rows.push(t); }
  }
  return rows;
}

/**
 * Steg L: layouten ordner OCR-linjene (Apple Vision, bbox [x, y, w, h] 0–1). Hver linje legges i elementet som inneholder midtpunktet
 * (minste element når flere gjør det); innenfor et element grupperes linjene i rader med samme regel som rows48 (y-overlapp, sortert på x).
 * Elementene kommer i layoutens lesefølge; linjer utenfor alle elementer settes inn etter høyden. → rows[] | null (ingen linjer med bbox)
 */
export function orderOcrByLayout72(ocr, elements) {
  const lines = (ocr?.lines ?? []).filter((l) => String(l?.text ?? '').trim() && Array.isArray(l.bbox) && l.bbox.length === 4 && l.bbox.every(Number.isFinite));
  if (!lines.length || !elements?.length) return null;
  const els = elements.map((e, i) => ({ ...e, i, area: (e.bbox[2] - e.bbox[0]) * (e.bbox[3] - e.bbox[1]), got: [] }));
  const orphans = [];
  for (const l of lines) {
    const cx = (l.bbox[0] + l.bbox[2] / 2) * 1000, cy = (l.bbox[1] + l.bbox[3] / 2) * 1000;
    const hit = els.filter((e) => cx >= e.bbox[0] && cx <= e.bbox[2] && cy >= e.bbox[1] && cy <= e.bbox[3]).sort((a, b) => a.area - b.area)[0];
    if (hit) hit.got.push(l); else orphans.push({ l, y: cy });
  }
  const blocks = els.filter((e) => e.got.length).map((e) => ({ y: e.bbox[1], rows: rows48(e.got), el: true }));
  for (const row of rows48(orphans.map((o) => o.l))) {
    const y = orphans.find((o) => row.includes(String(o.l.text).trim()))?.y ?? 1001;
    const at = blocks.findIndex((b) => b.el && b.y > y);
    const blk = { y, rows: [row], el: false };
    if (at < 0) blocks.push(blk); else blocks.splice(at, 0, blk);
  }
  return blocks.flatMap((b) => b.rows);
}

/* ---------------- Kallene ---------------- */

const timingOf = (out) => (out?.timing ? { loadMs: out.timing.loadMs ?? null, genMs: out.timing.genMs ?? null, queueMs: out.timing.queueMs ?? null, cold: out.timing.cold ?? null } : null);

/**
 * LFM3-VL-2B: bildet → kvitteringsformatet (schema modelFormat48), uten tenking. → {data, model, engine, timing}
 * system/prompt er de samme som for qwen2.5vl i steg V.
 */
export async function lfm3Read72({ image, system, prompt, schema = modelFormat48(), cfg = {}, signal = null, title = 'Kvittering · LFM3-VL (ingen OCR)', numPredict = 3072 }) {
  const m = lfmModel72('lfm3', cfg);
  assertLocal72(m, 'lfm72/lfm3vl');
  const out = await aiRun('rc', { local72: m, images: [image], system, prompt, schema, localOnly: true, think: false, noThink: true,
    temperature: LFM_SAMPLING72.lfm3.temperature, extraOptions: { top_k: LFM_SAMPLING72.lfm3.top_k, repeat_penalty: LFM_SAMPLING72.lfm3.repeat_penalty }, numCtx: 8192, numPredict, title, signal });
  // <think> fjernes alltid før JSON leses (også når gaten/ai-run allerede har parset et svar med tenking i).
  const data = out?.text != null ? parseJson72(out.text) : out?.data ?? null;
  return { data, model: out?.model ?? m.id, engine: m.engine, timing: timingOf(out) };
}

/** LFM2.5-VL-3B layout: bildet → {elements, rows, model, engine, timing}. Fritekst (ingen schema), aldri tenking. */
export async function lfm25Layout72({ image, cfg = {}, signal = null, title = 'Kvittering · LFM2.5-VL layout' }) {
  const m = lfmModel72('lfm25', cfg);
  assertLocal72(m, 'lfm72/lfm25layout');
  const out = await aiRun('rc', { local72: m, images: [image], prompt: LAYOUT_PROMPT72, localOnly: true, think: false, noThink: true,
    temperature: LFM_SAMPLING72.lfm25.temperature, extraOptions: { repeat_penalty: LFM_SAMPLING72.lfm25.repeat_penalty }, numCtx: 8192, numPredict: 4096, title, signal });
  const elements = parseLayout72(out?.text ?? '');
  if (!elements.length) throw Object.assign(new Error('LFM2.5-VL ga ingen layout-elementer'), { badLayout: true });
  return { elements, rows: layoutRows72(elements), model: out?.model ?? m.id, engine: m.engine, timing: timingOf(out) };
}

/**
 * lfm25layout i steg V: layout (gjenbrukes mellom forsøkene via layout) → rader → qwen3:8b. → {data, model, rows, layout}
 */
export async function lfm25Read72({ image, categories = [], feedback = null, cfg = {}, signal = null, layout = null }) {
  const lo = layout ?? await lfm25Layout72({ image, cfg, signal });
  const parse = textImpl ?? parseRows48;
  const r = await parse(lo.rows, { categories, feedback, model: cfg.textModel ?? 'qwen3:8b', base: cfg.ollamaUrl, timeoutS: cfg.modelTimeoutS ?? 90, signal });
  return { data: r.data, model: `${lo.model} + ${r.model ?? cfg.textModel ?? 'qwen3:8b'}`, rows: lo.rows, layout: lo, timing: lo.timing };
}

/** Bare totalen fra bildet (crossCheck51). engine: 'lfm3vl' | 'lfm25layout'. → {total, totals[], model, engine} */
export async function lfmTotal72(engine, { image, cfg = {}, signal = null }) {
  if (engine === 'lfm3vl') {
    const r = await lfm3Read72({ image, system: TOTAL_SYSTEM72, prompt: 'Hva er totalbeløpet på kvitteringen?', schema: TOTAL_SCHEMA72, cfg, signal, title: 'Kvittering · LFM3-VL totalkontroll', numPredict: 256 });
    const t = Number(r.data?.total);
    return { total: Number.isFinite(t) && t > 0 ? t : null, totals: Number.isFinite(t) && t > 0 ? [t] : [], model: r.model, engine: r.engine, timing: r.timing };
  }
  if (engine === 'lfm25layout') {
    const lo = await lfm25Layout72({ image, cfg, signal, title: 'Kvittering · LFM2.5-VL totalkontroll' });
    const totals = totalCandidates48(lo.rows.join('\n'));
    return { total: totals[0] ?? null, totals, model: lo.model, engine: lo.engine, timing: lo.timing };
  }
  throw new Error(`Ukjent LFM-motor ${engine}`);
}
