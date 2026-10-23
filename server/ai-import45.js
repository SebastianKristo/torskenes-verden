// Prompt 45 (SERVER45): import av samtaler og minner fra Claude (fiks), ChatGPT og Gemini (claude-code-ai-import-claude-chatgpt-gemini.md).
//
// Hvorfor Claude-importen (prompt 43) ikke virket med ekte eksporter:
//   1. Hele fila ble lest inn i minnet og hver ZIP-fil pakket ut til én streng med unzip() fra xlsx-leseren: grense 100 MB per fil
//      («Regnearket er for stort»), ingen ZIP64, og en conversations.json på flere hundre MB sprenger maks strenglengde i V8.
//      Feilen ble vist som «Fila er ikke en gyldig ZIP» – ikke den faktiske årsaken.
//   2. Store filer (> 100 MB) stoppes av Cloudflare-tunnelen før de når serveren (413 i HTML), så klienten fikk bare «Homelab svarte 413».
//   Nå: ZIP leses fra disk med ZIP64, hver fil strømmes gjennom inflateRaw med tak på utpakket størrelse (zip-bomb-vern), conversations.json
//   strøm-parses element for element, og store filer kan lastes opp i biter (POST /api/ai/import/upload). Feil har reason + tydelig tekst.
//
// Kilder: Claude (conversations.json, projects.json, users.json, memories*), ChatGPT (conversations.json med mapping-tre → meldinger i
// rekkefølge, memories hvis de finnes), Gemini (Google Takeout → My Activity → Gemini Apps → MyActivity.json/.html → spørsmål/svar-par
// med tidspunkt, gruppert i samtaler når det er under 30 min mellom dem). Alt parses lokalt, per bruker; ingenting kjøres.
// Se SERVER45-API.md for formene.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { closeSync, createReadStream, existsSync, fstatSync, mkdirSync, openSync, readSync, readdirSync, rmSync, statSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInflateRaw } from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';
import { config } from './config.js';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { addMemory43, removeMemory43, splitMemory43 } from './ai-memory43.js';
import { messageText43, memoryFrom43 } from './claude-import43.js';

const q = (sql) => db.prepare(sql);
export const LIMITS45 = { upload: 1024 ** 3, chunk: 16 * 1024 ** 2, unzipped: 2 * 1024 ** 3, entry: 1024 ** 3, entries: 20_000, smallFile: 64 * 1024 ** 2, conversations: 50_000, msgChars: 200_000 };
const TTL = 60 * 60_000;
const DIR = () => resolve(config.dataDir, 'ai-import45');
const SOURCES = { claude: { name: 'Claude', color: '#d97757', prefix: 'cl_' }, chatgpt: { name: 'ChatGPT', color: '#10a37f', prefix: 'gpt_' }, gemini: { name: 'Gemini', color: '#4285f4', prefix: 'gem_' } };
export class ImportError45 extends Error { constructor(m, reason = 'error', status = 400, detail = null) { super(m); this.reason = reason; this.status = status; this.detail = detail; } }

db.exec(`CREATE TABLE IF NOT EXISTS ai_memory45_vec (memory_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, model TEXT, vec TEXT NOT NULL, src TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ai_memory45_vec_u ON ai_memory45_vec(user_id);`);

/* ---------------- Kilde: Buffer eller fil på disk ---------------- */

function srcOf(input) {
  if (Buffer.isBuffer(input)) return { size: input.length, read: (off, len) => input.subarray(off, Math.min(input.length, off + len)), stream: (a, b) => bufStream(input.subarray(a, b)), close() {} };
  const fd = openSync(input, 'r'), size = fstatSync(fd).size;
  return { size, read: (off, len) => { const b = Buffer.alloc(Math.max(0, Math.min(len, size - off))); readSync(fd, b, 0, b.length, off); return b; }, stream: (a, b) => (b > a ? createReadStream(input, { start: a, end: b - 1, highWaterMark: 1 << 20 }) : bufStream(Buffer.alloc(0))), close: () => { try { closeSync(fd); } catch { /* */ } } };
}
async function* bufGen(b) { for (let i = 0; i < b.length; i += 1 << 20) yield b.subarray(i, i + (1 << 20)); }
const bufStream = (b) => bufGen(b);

/* ---------------- ZIP (med ZIP64) ---------------- */

export function zipEntries45(src) {
  if (src.size < 22) throw new ImportError45('Fila er ikke en gyldig ZIP', 'not_zip');
  const tail = src.read(Math.max(0, src.size - 66_000), Math.min(src.size, 66_000)), base = Math.max(0, src.size - 66_000);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new ImportError45('Fila er ikke en gyldig ZIP (fant ikke innholdsfortegnelsen – er nedlastingen ufullstendig?)', 'not_zip');
  let count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  // ZIP64: locator rett før EOCD.
  if ((count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) && e >= 20 && tail.readUInt32LE(e - 20) === 0x07064b50) {
    const z64 = Number(tail.readBigUInt64LE(e - 20 + 8)), rec = src.read(z64, 56);
    if (rec.readUInt32LE(0) === 0x06064b50) { count = Number(rec.readBigUInt64LE(32)); cdSize = Number(rec.readBigUInt64LE(40)); cdOff = Number(rec.readBigUInt64LE(48)); }
  }
  if (count > LIMITS45.entries) throw new ImportError45(`ZIP-fila har ${count} filer (maks ${LIMITS45.entries})`, 'zip_bomb', 413);
  if (cdOff + cdSize > src.size + 1) throw new ImportError45('ZIP-fila er ødelagt eller ufullstendig', 'not_zip');
  const cd = src.read(cdOff, cdSize), out = [];
  let p = 0;
  for (let k = 0; k < count && p + 46 <= cd.length; k++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
    let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42);
    const name = cd.toString(flags & 0x800 ? 'utf8' : 'utf8', p + 46, p + 46 + nl);
    const ex = cd.subarray(p + 46 + nl, p + 46 + nl + el);
    for (let i = 0; i + 4 <= ex.length;) {
      const id = ex.readUInt16LE(i), sz = ex.readUInt16LE(i + 2);
      if (id === 1) { let j = i + 4; if (usize === 0xffffffff) { usize = Number(ex.readBigUInt64LE(j)); j += 8; } if (csize === 0xffffffff) { csize = Number(ex.readBigUInt64LE(j)); j += 8; } if (off === 0xffffffff) { off = Number(ex.readBigUInt64LE(j)); } }
      i += 4 + sz;
    }
    p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    out.push({ name, method, csize, usize, off, encrypted: !!(flags & 1) });
  }
  return out;
}
/** Strømmer én ZIP-fil som tekst-biter. Teller faktisk utpakkede bytes (stoler ikke på hodet). */
async function* entryChunks(src, e, budget) {
  if (e.encrypted) throw new ImportError45(`${e.name} er kryptert`, 'unknown_format');
  if (![0, 8].includes(e.method)) throw new ImportError45(`${e.name} bruker en komprimering som ikke støttes (${e.method})`, 'unknown_format');
  const lh = src.read(e.off, 30);
  if (lh.length < 30 || lh.readUInt32LE(0) !== 0x04034b50) throw new ImportError45('ZIP-fila er ødelagt', 'not_zip');
  const start = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const raw = src.stream(start, start + e.csize);
  const dec = new StringDecoder('utf8');
  let n = 0;
  const lim = Math.min(LIMITS45.entry, budget.left);
  if (e.method === 0) { for await (const c of raw) { n += c.length; if (n > lim) throw new ImportError45('Eksporten pakker ut til mer enn tillatt', 'zip_bomb', 413); yield dec.write(c); } budget.left -= n; yield dec.end(); return; }
  const inf = createInflateRaw({ chunkSize: 1 << 20 });
  const feed = (async () => { try { for await (const c of raw) { if (!inf.write(c)) await new Promise((r) => inf.once('drain', r)); } inf.end(); } catch (err) { inf.destroy(err); } })();
  try {
    for await (const c of inf) { n += c.length; if (n > lim) { inf.destroy(); throw new ImportError45(`Eksporten pakker ut til mer enn ${Math.round(lim / 1024 ** 2)} MB (zip-bomb-vern)`, 'zip_bomb', 413); } yield dec.write(c); }
  } catch (err) { if (err instanceof ImportError45) throw err; throw new ImportError45(`Kunne ikke pakke ut ${e.name}: ${err.message}`, 'not_zip'); }
  await feed;
  budget.left -= n;
  yield dec.end();
}
async function textOf(chunks, max = LIMITS45.smallFile) { let s = ''; for await (const c of chunks) { s += c; if (s.length > max) throw new ImportError45('En fil i eksporten er for stor til å leses', 'too_big', 413); } return s; }

/* ---------------- Strøm-parsing av en stor JSON-liste ---------------- */

/** Kaller onItem(obj) for hvert element i en toppnivå-liste ([…] eller {"conversations":[…]}). Holder bare ett element i minnet. */
export async function streamJsonArray45(chunks, onItem, { maxItem = 256 * 1024 ** 2 } = {}) {
  let depth = 0, inStr = false, esc = false, started = false, buf = [], len = 0, count = 0, arrDepth = -1, prefix = '';
  for await (const chunk of chunks) {
    let seg = 0;
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (arrDepth === -1 && depth <= 1 && prefix.length < 400) prefix += ch;
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '[' || ch === '{') {
        if (arrDepth === -1 && ch === '[' && (depth === 0 || /"(conversations|items|data)"\s*:\s*\[$/.test(prefix))) { arrDepth = depth + 1; depth++; seg = i + 1; continue; }
        if (depth === arrDepth && !started) { started = true; seg = i; }
        depth++;
        continue;
      }
      if (ch === ']' || ch === '}') {
        depth--;
        if (arrDepth > 0 && depth === arrDepth && started && ch === '}') {
          buf.push(chunk.slice(seg, i + 1)); len += i + 1 - seg;
          const s = buf.join(''); buf = []; len = 0; started = false;
          try { onItem(JSON.parse(s)); count++; } catch { throw new ImportError45('conversations.json er ikke gyldig JSON', 'bad_json'); }
          seg = i + 1;
        }
        if (arrDepth > 0 && depth < arrDepth) { arrDepth = -2; }
        continue;
      }
    }
    if (started) { buf.push(chunk.slice(seg)); len += chunk.length - seg; if (len > maxItem) throw new ImportError45('Én samtale i eksporten er for stor', 'too_big', 413); }
    if (arrDepth === -1 && prefix.length >= 400) prefix = prefix.slice(-100);
  }
  if (arrDepth === -1) throw new ImportError45('Fant ikke conversations.json i eksporten', 'no_conversations', 400, 'Fila har ingen liste med samtaler');
  return count;
}

/* ---------------- Formatene ---------------- */

const iso = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Date.parse(v); return Number.isFinite(n) ? new Date(n).toISOString() : null; };
const clip = (s, n = LIMITS45.msgChars) => String(s ?? '').slice(0, n);
const idOf = (v) => String(v ?? randomUUID()).replace(/[^\w-]/g, '').slice(0, 80) || randomUUID();
/** Claude: {uuid, name, chat_messages:[{sender, text|content[], created_at, attachments, files}]} */
export function claudeConv45(x) {
  const msgs = (Array.isArray(x.chat_messages) ? x.chat_messages : Array.isArray(x.messages) ? x.messages : []).map((m) => ({ role: m.sender === 'human' || m.role === 'user' || m.sender === 'user' ? 'user' : 'assistant', content: clip(messageText43(m)), ts: Date.parse(m.created_at ?? '') || null })).filter((m) => m.content);
  return { uuid: idOf(x.uuid ?? x.id), name: String(x.name ?? x.title ?? '').trim().slice(0, 200) || (msgs[0]?.content.slice(0, 60) ?? 'Samtale fra Claude'), created: iso(x.created_at), updated: iso(x.updated_at ?? x.created_at),
    project: x.project?.name ?? x.project_name ?? null, projectId: x.project_uuid ?? x.project?.uuid ?? null, messages: msgs };
}
/** ChatGPT: mapping-tre → gren fra current_node til roten, snudd. Skjulte/system/verktøy-meldinger hoppes over. */
export function chatgptConv45(x) {
  const map = x.mapping && typeof x.mapping === 'object' ? x.mapping : {};
  let node = x.current_node && map[x.current_node] ? x.current_node : Object.keys(map).find((k) => !(map[k]?.children ?? []).length) ?? null;
  const chain = [], seen = new Set();
  while (node && map[node] && !seen.has(node) && chain.length < 20_000) { seen.add(node); chain.push(map[node]); node = map[node].parent; }
  chain.reverse();
  const msgs = [];
  for (const n of chain) {
    const m = n?.message; if (!m) continue;
    const role = m.author?.role;
    if (!['user', 'assistant'].includes(role) || m.metadata?.is_visually_hidden_from_conversation) continue;
    const c = m.content ?? {};
    let t = '';
    if (Array.isArray(c.parts)) t = c.parts.map((p) => (typeof p === 'string' ? p : p?.content_type === 'image_asset_pointer' ? '[Bilde]' : typeof p?.text === 'string' ? p.text : '')).filter(Boolean).join('\n\n');
    else if (typeof c.text === 'string') t = c.text;
    else if (c.content_type === 'code' && typeof c.text === 'string') t = c.text;
    if (!t.trim()) continue;
    msgs.push({ role, content: clip(t), ts: m.create_time ? Math.round(m.create_time * 1000) : null });
  }
  return { uuid: idOf(x.conversation_id ?? x.id), name: String(x.title ?? '').trim().slice(0, 200) || (msgs[0]?.content.slice(0, 60) ?? 'Samtale fra ChatGPT'), created: iso(x.create_time), updated: iso(x.update_time ?? x.create_time), project: null, projectId: null, messages: msgs };
}
const unhtml = (h) => String(h ?? '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (a, n) => String.fromCodePoint(+n)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const PROMPTED = /^\s*(Prompted|Spurte|Ledetekst|Promptet|Asked|Du spurte)\s*:?\s*/i;
/** Gemini (Takeout My Activity, JSON): [{header:'Gemini Apps', title:'Prompted …', time, safeHtmlItem:[{html}]}] → par. */
export function geminiPairsJson45(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object' && /gemini|bard/i.test(`${x.header ?? ''} ${(x.products ?? []).join(' ')}`) && typeof x.title === 'string')
    .map((x) => ({ q: x.title.replace(PROMPTED, '').trim(), a: unhtml((x.safeHtmlItem ?? []).map((h) => h?.html ?? '').join('\n')), ts: Date.parse(x.time ?? '') || null }))
    .filter((p) => p.q && !/^(Used|Brukte|Gave feedback|Ga tilbakemelding)\b/i.test(p.q));
}
/** Gemini (Takeout My Activity, HTML): outer-cell-blokker med «Prompted …», tidspunkt og svaret. */
export function geminiPairsHtml45(html) {
  const out = [];
  for (const blk of String(html).split(/<div class="outer-cell/).slice(1)) {
    const cell = blk.match(/<div class="content-cell[^"]*mdl-typography--body-1"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!cell) continue;
    const text = unhtml(cell);
    if (!PROMPTED.test(text)) continue;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const qLine = lines[0].replace(PROMPTED, '').trim();
    const dIdx = lines.findIndex((l) => /\d{1,2}[. ]\s?\w+\.?\s+\d{4}|\w+ \d{1,2}, \d{4}/.test(l) && /\d{1,2}:\d{2}/.test(l));
    const ts = dIdx >= 0 ? Date.parse(lines[dIdx].replace(/\s?(CET|CEST|UTC|GMT)\b.*$/, '').replace(/,(\s\d{1,2}:\d{2})/, '$1')) || null : null;
    const rest = blk.slice(blk.indexOf(cell) + cell.length);
    const ans = unhtml(cell.split(/<br\s*\/?>/i).slice(dIdx >= 0 ? dIdx + 1 : 1).join('<br>') + (rest.match(/<div class="content-cell[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''));
    if (qLine) out.push({ q: qLine, a: ans, ts });
  }
  return out;
}
/** Par → samtaler (nytt når det er over 30 min mellom spørsmålene). */
export function geminiConvs45(pairs) {
  const sorted = [...pairs].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  const convs = [];
  let cur = null;
  for (const p of sorted) {
    if (!cur || !p.ts || !cur.last || p.ts - cur.last > 30 * 60_000) { cur = { uuid: `g${(p.ts ?? Date.now()).toString(36)}${randomBytes(3).toString('hex')}`, name: p.q.slice(0, 80), created: iso(p.ts), updated: iso(p.ts), project: null, projectId: null, messages: [], last: p.ts }; convs.push(cur); }
    cur.messages.push({ role: 'user', content: clip(p.q), ts: p.ts }, ...(p.a ? [{ role: 'assistant', content: clip(p.a), ts: p.ts }] : []));
    cur.last = p.ts; cur.updated = iso(p.ts);
  }
  for (const c of convs) delete c.last;
  return convs;
}
const isGeminiPath = (n) => /(gemini|bard)/i.test(n) && /(my ?activity|min ?aktivitet|aktivitet)/i.test(n) && /\.(json|html?)$/i.test(n);

/** Leser en eksport (Buffer eller sti). → {source, convs, projects, memory, files, steps, warnings} */
export async function readExport45(input, { name = '', source = 'auto' } = {}) {
  const src = srcOf(input), steps = [], warnings = [];
  const t = () => Date.now();
  let t0 = t();
  try {
    const head = src.read(0, 4);
    const isZip = head.length === 4 && head.readUInt32LE(0) === 0x04034b50;
    const files = [], convs = [];
    let projects = [], memory = [], detected = source !== 'auto' ? source : null;
    const take = (kind, x) => { if (convs.length >= LIMITS45.conversations) return; const cv = kind === 'chatgpt' ? chatgptConv45(x) : claudeConv45(x); if (cv.messages.length) convs.push(cv); };
    const kindOf = (x) => (x && typeof x === 'object' ? (x.mapping ? 'chatgpt' : Array.isArray(x.chat_messages) ? 'claude' : x.messages ? 'claude' : null) : null);
    const eat = async (chunks) => { let k = detected === 'gemini' ? null : detected; await streamJsonArray45(chunks, (x) => { const kk = kindOf(x); if (!k && kk) k = kk; take(kk ?? k ?? 'claude', x); }); detected ??= k ?? 'claude'; };
    if (isZip) {
      const entries = zipEntries45(src);
      const total = entries.reduce((a, e) => a + e.usize, 0);
      steps.push({ t: `Pakket ut ${entries.length} ${entries.length === 1 ? 'fil' : 'filer'}`, ms: t() - t0 });
      if (total > LIMITS45.unzipped) throw new ImportError45(`Eksporten pakker ut til ${Math.round(total / 1024 ** 3)} GB (maks 2 GB)`, 'zip_bomb', 413);
      const budget = { left: LIMITS45.unzipped };
      const base = (n) => n.split('/').pop();
      const conv = entries.find((e) => /^conversations[^/]*\.json$/i.test(base(e.name)));
      const gem = entries.filter((e) => isGeminiPath(e.name));
      t0 = t();
      if (conv) { files.push(conv.name); await eat(entryChunks(src, conv, budget)); steps.push({ t: `Fant ${convs.length} ${convs.length === 1 ? 'samtale' : 'samtaler'}`, ms: t() - t0 }); }
      else if (gem.length) {
        detected = 'gemini';
        const pairs = [];
        for (const e of gem.sort((a, b) => (/\.json$/i.test(a.name) ? -1 : 1) - (/\.json$/i.test(b.name) ? -1 : 1))) {
          if (pairs.length && /\.html?$/i.test(e.name)) continue; // JSON og HTML er det samme innholdet
          files.push(e.name);
          const s = await textOf(entryChunks(src, e, budget), 512 * 1024 ** 2);
          pairs.push(...(/\.json$/i.test(e.name) ? geminiPairsJson45(JSON.parse(s)) : geminiPairsHtml45(s)));
        }
        convs.push(...geminiConvs45(pairs));
        steps.push({ t: `Leste ${pairs.length} spørsmål og svar fra Gemini`, ms: t() - t0 });
      } else throw new ImportError45(source === 'claude' || source === 'chatgpt' ? 'Fant ikke conversations.json i eksporten' : 'Fant ikke conversations.json (Claude/ChatGPT) eller Gemini-aktivitet (My Activity) i eksporten', 'no_conversations', 400, entries.slice(0, 15).map((e) => e.name).join(', '));
      for (const e of entries) {
        const b = base(e.name);
        if (/^projects[^/]*\.json$/i.test(b)) { files.push(e.name); try { const p = JSON.parse(await textOf(entryChunks(src, e, budget))); projects = (Array.isArray(p) ? p : []).map((x) => ({ uuid: x.uuid ?? null, name: String(x.name ?? '').slice(0, 120) })).filter((x) => x.name); } catch { warnings.push('projects.json kunne ikke leses'); } }
        if (/^(memor(y|ies)|conversations_memory|user_memories?)[^/]*\.(json|md|txt)$/i.test(b)) { files.push(e.name); try { const s = await textOf(entryChunks(src, e, budget)); memory.push(...(/\.json$/i.test(b) ? memoryFrom45(JSON.parse(s)) : splitMemory43(s))); } catch { warnings.push(`${b} kunne ikke leses`); } }
        if (/^users?\.json$/i.test(b)) files.push(e.name);
      }
    } else {
      const first = src.read(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart();
      if (/^<(!doctype|html)/i.test(first) || /\.html?$/i.test(name)) {
        detected = 'gemini';
        if (src.size > 512 * 1024 ** 2) throw new ImportError45('HTML-fila er for stor', 'too_big', 413);
        const pairs = geminiPairsHtml45(src.read(0, src.size).toString('utf8'));
        convs.push(...geminiConvs45(pairs));
        steps.push({ t: `Leste ${pairs.length} spørsmål og svar fra Gemini`, ms: t() - t0 });
        files.push(name || 'MyActivity.html');
      } else if (first.startsWith('[') || first.startsWith('{')) {
        files.push(name || 'conversations.json');
        // Gemini-JSON (My Activity) har header/title på toppnivå: les hele (begrenset) og sjekk.
        if (/"header"\s*:\s*"(Gemini|Bard)/i.test(first) || source === 'gemini') {
          if (src.size > 512 * 1024 ** 2) throw new ImportError45('Fila er for stor', 'too_big', 413);
          let list; try { list = JSON.parse(src.read(0, src.size).toString('utf8').replace(/^﻿/, '')); } catch { throw new ImportError45('Fila er ikke gyldig JSON', 'bad_json'); }
          detected = 'gemini';
          const pairs = geminiPairsJson45(list);
          convs.push(...geminiConvs45(pairs));
          steps.push({ t: `Leste ${pairs.length} spørsmål og svar fra Gemini`, ms: t() - t0 });
        } else {
          const chunks = (async function* () { const d = new StringDecoder('utf8'); for await (const c of src.stream(0, src.size)) yield d.write(c); yield d.end(); })();
          await eat(chunks);
          steps.push({ t: `Fant ${convs.length} ${convs.length === 1 ? 'samtale' : 'samtaler'}`, ms: t() - t0 });
        }
      } else throw new ImportError45('Fila er verken en ZIP, JSON eller HTML. Velg eksport-ZIP-en du lastet ned (eller conversations.json / MyActivity.html).', 'unknown_format');
    }
    const byId = new Map(projects.map((p) => [p.uuid, p.name]));
    for (const cv of convs) if (!cv.project && cv.projectId && byId.has(cv.projectId)) cv.project = byId.get(cv.projectId);
    if (convs.length >= LIMITS45.conversations) warnings.push(`Bare de første ${LIMITS45.conversations} samtalene er tatt med`);
    if (memory.length) steps.push({ t: `Fant ${memory.length} minnepunkter`, ms: 0 });
    return { source: detected ?? 'claude', convs, projects, memory, files, steps, warnings };
  } finally { src.close(); }
}
export function memoryFrom45(v) {
  // ChatGPT-minner: [{content|memory|text}] eller {memories:[…]}; ellers Claude-formen.
  if (Array.isArray(v?.memories)) return v.memories.flatMap(memoryFrom45);
  return memoryFrom43(v);
}

/* ---------------- Bitvis opplasting ---------------- */

const up = () => { mkdirSync(DIR(), { recursive: true, mode: 0o700 }); return DIR(); };
const uploadPath = (u, id) => join(up(), `${String(u).replace(/[^\w-]/g, '')}-${id}.part`);
function sweepUploads() {
  try { for (const f of readdirSync(DIR())) { const p = join(DIR(), f); if (Date.now() - statSync(p).mtimeMs > TTL) rmSync(p, { force: true }); } } catch { /* ingen mappe */ }
}
const uploads = new Map(); // uploadId → {user, total, next, bytes, name, at}

/* ---------------- Forhåndsvisning, import og angre ---------------- */

const imports = new Map();
const sweep = () => { const t = Date.now(); for (const [k, v] of imports) if (t - v.at > TTL) imports.delete(k); for (const [k, v] of uploads) if (t - v.at > TTL) { uploads.delete(k); rmSync(uploadPath(v.user, k), { force: true }); } sweepUploads(); };
const MON = ['jan.', 'feb.', 'mar.', 'apr.', 'mai', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const dText = (s) => { if (!s) return ''; const d = new Date(s); if (Number.isNaN(+d)) return ''; const p = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }); return `${+p.slice(8, 10)}. ${MON[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`; };
const prefixOf = (src) => SOURCES[src]?.prefix ?? 'cl_';
const itemOut = (x, have, src) => { const imported = have.has(`${prefixOf(src)}${x.uuid}`); return { id: x.uuid, title: x.name, date: x.updated ?? x.created, dateText: dText(x.updated ?? x.created), messages: x.messages.length, project: x.project ?? null, imported, importedLabel: imported ? 'Importert før' : null, selected: !imported }; };
const haveIds = (u, src) => new Set(q('SELECT id FROM hl_chats WHERE user_id=? AND id LIKE ?').pluck().all(u, `${prefixOf(src)}%`));

export function preview45(u, parsed, memText = '') {
  sweep();
  const importId = randomBytes(12).toString('base64url'), src = parsed.source;
  const existing = new Set(q('SELECT lower(text) FROM ai_memory43 WHERE user_id=?').pluck().all(u).map((s) => s.replace(/\s+/g, ' ').trim()));
  const seen = new Set(), memory = [];
  for (const t of [...parsed.memory, ...splitMemory43(memText ?? '')]) { const k = String(t).toLowerCase().replace(/\s+/g, ' ').trim(); if (!k || seen.has(k)) continue; seen.add(k); const ex = existing.has(k); memory.push({ id: `m${memory.length + 1}`, text: t, exists: ex, selected: !ex }); }
  const convs = parsed.convs.sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')));
  const dates = convs.flatMap((x) => [x.created, x.updated]).filter(Boolean).sort();
  const projectNames = [...new Set([...parsed.projects.map((p) => p.name), ...convs.map((x) => x.project).filter(Boolean)])];
  imports.set(importId, { user: u, at: Date.now(), source: src, convs, memory, done: null });
  const have = haveIds(u, src), items = convs.map((x) => itemOut(x, have, src));
  const sel = items.filter((x) => x.selected).length, msel = memory.filter((m) => m.selected).length;
  return { importId, source: src, sourceLabel: SOURCES[src]?.name ?? src, conversations: convs.length, messages: convs.reduce((a, x) => a + x.messages.length, 0), projects: projectNames.length, projectNames,
    memory, range: dates.length ? { from: dates[0], to: dates[dates.length - 1], text: `Fra ${dText(dates[0])} til ${dText(dates[dates.length - 1])}` } : { from: null, to: null, text: '' },
    items: items.slice(0, 60), total: items.length, selected: sel, importedBefore: items.length - sel, steps: parsed.steps, files: parsed.files, warnings: parsed.warnings ?? [],
    expiresAt: new Date(Date.now() + TTL).toISOString(), button: `Importer ${sel} samtaler og ${msel} minnepunkter` };
}
function folderOf(u, name) {
  const f = q('SELECT id FROM hl_chat_folders WHERE user_id=? AND name=? ORDER BY created LIMIT 1').pluck().get(u, name);
  if (f) return f;
  const id = randomUUID();
  q('INSERT INTO hl_chat_folders(id,user_id,name,open,created) VALUES(?,?,?,1,?)').run(id, u, name, Date.now());
  return id;
}
/** Minnepunktene indekseres som Glimt-minne (embeddings, kb-ruten = nomic-embed-text) i bakgrunnen. Best effort. */
async function indexMemory(u, items, src) {
  if (!items.length) return 0;
  try {
    const { embed } = await import('./ai-run.js');
    const r = await embed(items.map((m) => m.text), { user: u, title: `Glimt-minne · import fra ${src}`, background: true });
    const ins = q('INSERT OR REPLACE INTO ai_memory45_vec(memory_id, user_id, model, vec, src, created) VALUES(?,?,?,?,?,?)');
    db.transaction(() => { items.forEach((m, i) => { if (Array.isArray(r.vectors?.[i])) ins.run(m.id, u, r.model, JSON.stringify(r.vectors[i]), src, Date.now()); }); })();
    return r.vectors?.length ?? 0;
  } catch (e) { console.warn(`[ai-import] embeddings: ${e.message}`); return 0; }
}
export function commit45(u, x, b = {}) {
  const src = x.source, S = SOURCES[src] ?? SOURCES.claude, skipExisting = b.skipExisting !== false;
  const ids = Array.isArray(b.conversationIds) ? new Set(b.conversationIds.map(String)) : null;
  const created = []; let skipped = 0, folderId = null;
  if (b.importConversations !== false) {
    const pick = x.convs.filter((cv) => (ids ? ids.has(cv.uuid) : true));
    if (pick.length) folderId = folderOf(u, S.name);
    const ins = q('INSERT INTO hl_chats(id,user_id,title,model,settings,messages,created,updated,folder_id) VALUES(?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const cv of pick) {
        const id = `${S.prefix}${cv.uuid}`;
        const row = q('SELECT user_id FROM hl_chats WHERE id=?').get(id);
        if (row) { if (skipExisting || row.user_id !== u) { skipped++; continue; } q('DELETE FROM hl_chats WHERE id=? AND user_id=?').run(id, u); }
        const c0 = Date.parse(cv.created ?? '') || Date.now(), up0 = Date.parse(cv.updated ?? '') || c0;
        ins.run(id, u, cv.name.slice(0, 200), 'auto', JSON.stringify({ importedFrom: src }), JSON.stringify(cv.messages.map((m) => ({ role: m.role, content: m.content, ...(m.ts ? { ts: m.ts } : {}) }))), c0, up0, folderId);
        created.push(id);
      }
    })();
  }
  let mem = { added: [], skipped: 0 };
  if (b.importMemory !== false) {
    const want = Array.isArray(b.memory) ? b.memory.map((m) => (typeof m === 'string' && /^m\d+$/.test(m) ? x.memory.find((y) => y.id === m)?.text : typeof m === 'string' ? m : m?.text)).filter(Boolean) : x.memory.filter((m) => m.selected).map((m) => m.text);
    mem = addMemory43(u, want, S.name);
  }
  const done = { conversations: created.length, memory: mem.added.length, skipped, folderId, folder: S.name };
  x.done = done; x.chatIds = created; x.memoryIds = mem.added.map((m) => m.id);
  x.convs = []; x.memory = []; // personvern: eksporten slettes fra minnet
  const log = kv.get(u, 'ai45_imports', []) ?? [];
  kv.set(u, 'ai45_imports', [...log.slice(-19), { importId: b.importId, source: src, at: new Date().toISOString(), chatIds: created, memoryIds: x.memoryIds }]);
  indexMemory(u, mem.added, S.name).then((n) => { x.indexed = n; }).catch(() => {});
  console.log(`ai.import source=${src} user=${u} conversations=${created.length} memory=${mem.added.length} skipped=${skipped}`);
  return { ok: true, ...done, indexing: mem.added.length > 0, text: `✓ ${created.length} ${created.length === 1 ? 'samtale' : 'samtaler'} og ${mem.added.length} minnepunkter importert fra ${S.name}`,
    detail: `Samtalene ligger i mappen «${S.name}» i Chat. Minnet ligger under Chat → ⚙ → Minne og brukes av Glimt.${skipped ? ` ${skipped} var importert før og ble hoppet over.` : ''}` };
}
export function undo45(u, id, x) {
  const log = kv.get(u, 'ai45_imports', []) ?? [];
  const rec = x?.done ? { chatIds: x.chatIds, memoryIds: x.memoryIds } : log.find((r) => r.importId === id);
  if (!rec) return null;
  let removedConversations = 0;
  for (const cid of rec.chatIds ?? []) removedConversations += q('DELETE FROM hl_chats WHERE id=? AND user_id=?').run(cid, u).changes;
  const removedMemory = removeMemory43(u, rec.memoryIds ?? []);
  for (const m of rec.memoryIds ?? []) q('DELETE FROM ai_memory45_vec WHERE memory_id=? AND user_id=?').run(m, u);
  kv.set(u, 'ai45_imports', log.filter((r) => r.importId !== id));
  if (x) imports.delete(id);
  return { ok: true, removedConversations, removedMemory, text: `Fjernet ${removedConversations} samtaler og ${removedMemory} minnepunkter` };
}

/* ---------------- Eksempler ---------------- */

const SAMPLES = {
  chatgpt: () => ({ list: [{ title: 'Budsjett for hytteturen', create_time: Date.now() / 1000 - 86400 * 20, update_time: Date.now() / 1000 - 86400 * 19, conversation_id: 'c0ffee01-gpt', current_node: 'n3',
    mapping: { n0: { id: 'n0', message: null, parent: null, children: ['n1'] }, n1: { id: 'n1', parent: 'n0', children: ['n2'], message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } } },
      n2: { id: 'n2', parent: 'n1', children: ['n3'], message: { author: { role: 'user' }, create_time: Date.now() / 1000 - 86400 * 20, content: { content_type: 'text', parts: ['Lag et enkelt budsjett for fire dager på Hafjell.'] } } },
      n3: { id: 'n3', parent: 'n2', children: [], message: { author: { role: 'assistant' }, create_time: Date.now() / 1000 - 86400 * 20, content: { content_type: 'text', parts: ['Heiskort 2 400 kr, mat 1 600 kr, drivstoff 900 kr – totalt ca. 4 900 kr.'] } } } } }] }),
  gemini: () => ({ list: [{ header: 'Gemini Apps', title: 'Prompted Hva er forskjellen på R1 og R2?', time: new Date(Date.now() - 86400_000 * 3).toISOString(), safeHtmlItem: [{ html: '<p>R1 er grunnlaget, R2 bygger videre med integrasjon og rekker.</p>' }] },
    { header: 'Gemini Apps', title: 'Prompted Gi meg tre øvingsoppgaver i integrasjon', time: new Date(Date.now() - 86400_000 * 3 + 600_000).toISOString(), safeHtmlItem: [{ html: '<p>1) ∫x² dx 2) ∫sin x dx 3) ∫eˣ dx</p>' }] }] }),
};

/* ---------------- Ruter ---------------- */

export const aiImport45Api = new Hono();
aiImport45Api.use('*', authOrToken);
const err = (c, e) => c.json({ error: e.message, reason: e.reason ?? 'error', ...(e.detail ? { detail: e.detail } : {}) }, e.status ?? 400);
const noImp = async (c, next) => { if (c.get('actor') && c.req.method !== 'GET') return c.json({ error: 'Import er ikke tilgjengelig mens du er logget inn som en annen bruker' }, 403); await next(); };

aiImport45Api.get('/sources', (c) => c.json({ maxBytes: LIMITS45.upload, chunkBytes: 8 * 1024 ** 2, sources: [
  { id: 'claude', name: 'Claude', color: SOURCES.claude.color, accept: '.zip,.json', files: ['conversations.json', 'projects.json', 'users.json', 'memories.json'], steps: ['Åpne claude.ai → Innstillinger → Personvern', 'Trykk «Eksporter data»', 'Last ned ZIP-en fra e-posten (lenken varer i 24 t)', 'Slipp ZIP-en her'], note: 'Minnet kan også limes inn som tekst.' },
  { id: 'chatgpt', name: 'ChatGPT', color: SOURCES.chatgpt.color, accept: '.zip,.json', files: ['conversations.json'], steps: ['Åpne chatgpt.com → Innstillinger → Datakontroller', 'Trykk «Eksporter data» og bekreft', 'Last ned ZIP-en fra e-posten', 'Slipp ZIP-en her'], note: 'Minner er ikke med i eksporten. Lim dem inn fra Innstillinger → Personalisering → Administrer minner.' },
  { id: 'gemini', name: 'Gemini', color: SOURCES.gemini.color, accept: '.zip,.json,.html', files: ['My Activity/Gemini Apps/MyActivity.json', 'MyActivity.html'], steps: ['Åpne takeout.google.com', 'Velg bare «Min aktivitet» → «Gemini Apps» (JSON-format gir best resultat)', 'Last ned ZIP-en', 'Slipp ZIP-en her'], note: 'Gemini lagrer spørsmål og svar hver for seg. Spørsmål med under 30 min mellomrom blir én samtale.' },
] }));

aiImport45Api.post('/upload', noImp, async (c) => {
  sweep();
  const u = c.get('user');
  const idx = Number(c.req.header('x-chunk-index') ?? 0), total = Number(c.req.header('x-chunk-total') ?? 1);
  if (!Number.isInteger(idx) || !Number.isInteger(total) || idx < 0 || total < 1 || total > 1000 || idx >= total) return c.json({ error: 'Ugyldig X-Chunk-Index/X-Chunk-Total', reason: 'bad_chunk' }, 400);
  let id = c.req.header('x-upload-id') ?? '';
  let st = id ? uploads.get(id) : null;
  if (id && (!st || st.user !== u)) return c.json({ error: 'Opplastingen er utløpt. Start på nytt.', reason: 'expired' }, 404);
  if (!id) { if (idx !== 0) return c.json({ error: 'Første bit må ha X-Chunk-Index 0', reason: 'bad_chunk' }, 400); id = randomBytes(12).toString('base64url'); st = { user: u, total, next: 0, bytes: 0, name: decodeURIComponent(c.req.header('x-file-name') ?? '').slice(0, 200), at: Date.now() }; uploads.set(id, st); writeFileSync(uploadPath(u, id), Buffer.alloc(0), { mode: 0o600 }); }
  if (idx !== st.next) return c.json({ error: `Forventet bit ${st.next}`, reason: 'bad_chunk', expected: st.next, uploadId: id }, 409);
  const body = Buffer.from(await c.req.arrayBuffer());
  if (body.length > LIMITS45.chunk) return c.json({ error: 'Biten er for stor (maks 16 MB)', reason: 'too_big' }, 413);
  if (st.bytes + body.length > LIMITS45.upload) { uploads.delete(id); rmSync(uploadPath(u, id), { force: true }); return c.json({ error: 'Fila kan være maks 1 GB', reason: 'too_big' }, 413); }
  appendFileSync(uploadPath(u, id), body);
  st.bytes += body.length; st.next++; st.at = Date.now();
  return c.json({ uploadId: id, received: st.next, total: st.total, bytes: st.bytes, done: st.next >= st.total });
});

aiImport45Api.post('/', noImp, bodyLimit({ maxSize: 210 * 1024 ** 2, onError: (c) => c.json({ error: 'Fila er for stor for vanlig opplasting. Bruk bitvis opplasting (POST /api/ai/import/upload).', reason: 'too_big' }, 413) }), async (c) => {
  const u = c.get('user'), ct = c.req.header('content-type') ?? '';
  let tmpFile = null;
  try {
    let parsed = null, memText = '', source = 'auto';
    if (ct.startsWith('multipart/')) {
      const b = await c.req.parseBody();
      memText = typeof b.memory === 'string' ? b.memory : '';
      source = SOURCES[b.source] ? b.source : 'auto';
      const f = b.file ?? b.zip ?? b.export;
      if (f && typeof f.arrayBuffer === 'function') parsed = await readExport45(Buffer.from(await f.arrayBuffer()), { name: f.name ?? '', source });
    } else {
      const b = await c.req.json().catch(() => null);
      if (!b || typeof b !== 'object') return c.json({ error: 'Forventet en fil (multipart) eller JSON {uploadId}', reason: 'bad_request' }, 400);
      memText = typeof b.memory === 'string' ? b.memory : Array.isArray(b.memory) ? b.memory.join('\n') : '';
      source = SOURCES[b.source] ? b.source : 'auto';
      if (b.sample) {
        const kind = SOURCES[b.sample] ? b.sample : 'claude';
        if (kind === 'claude') { parsed = await readExport45(Buffer.from(JSON.stringify([{ uuid: 'c1a0de01', name: 'Docker compose for Sonarr', created_at: new Date(Date.now() - 86400_000 * 40).toISOString(), updated_at: new Date(Date.now() - 86400_000 * 39).toISOString(), chat_messages: [{ sender: 'human', text: 'Hvordan setter jeg opp hardlinks?' }, { sender: 'assistant', text: 'Bruk samme /data-mappe i alle containerne.' }] }])), { name: 'conversations.json', source: 'claude' }); memText ||= 'Kjører homelab med Docker'; }
        else parsed = await readExport45(Buffer.from(JSON.stringify(SAMPLES[kind]().list)), { name: kind === 'gemini' ? 'MyActivity.json' : 'conversations.json', source: kind });
      } else if (b.uploadId) {
        const st = uploads.get(String(b.uploadId));
        if (!st || st.user !== u) return c.json({ error: 'Opplastingen er utløpt. Velg fila på nytt.', reason: 'expired' }, 404);
        if (st.next < st.total) return c.json({ error: `Opplastingen er ikke ferdig (${st.next} av ${st.total} biter)`, reason: 'incomplete' }, 409);
        tmpFile = uploadPath(u, String(b.uploadId));
        uploads.delete(String(b.uploadId));
        parsed = await readExport45(tmpFile, { name: st.name, source });
      }
    }
    if (!parsed && !memText.trim()) return c.json({ error: 'Velg eksport-fila (ZIP, conversations.json eller MyActivity), eller lim inn minnet', reason: 'no_file' }, 400);
    parsed ??= { source: SOURCES[source] ? source : 'claude', convs: [], projects: [], memory: [], files: [], steps: [], warnings: [] };
    if (SOURCES[source] && source !== parsed.source && parsed.convs.length) parsed.warnings.push(`Fila ser ut som en ${SOURCES[parsed.source].name}-eksport, ikke ${SOURCES[source].name}. Den importeres som ${SOURCES[parsed.source].name}.`);
    if (!parsed.convs.length && !parsed.memory.length && !memText.trim()) return c.json({ error: 'Fant ingen samtaler i fila', reason: 'no_conversations', files: parsed.files }, 400);
    return c.json(preview45(u, parsed, memText));
  } catch (e) {
    if (!(e instanceof ImportError45)) console.warn(`[ai-import] ${e.message}`);
    return err(c, e instanceof ImportError45 ? e : new ImportError45(`Kunne ikke lese eksporten: ${e.message}`, 'error'));
  } finally { if (tmpFile) rmSync(tmpFile, { force: true }); }
});
const own = (c) => { sweep(); const x = imports.get(c.req.param('importId')); return x && x.user === c.get('user') ? x : null; };
aiImport45Api.get('/:importId', (c) => {
  const x = own(c);
  if (!x) return c.json({ error: 'Importen er utløpt. Velg fila på nytt.', reason: 'expired' }, 404);
  const have = haveIds(c.get('user'), x.source), t = String(c.req.query('q') ?? '').toLowerCase().trim();
  const all = x.convs.filter((cv) => !t || cv.name.toLowerCase().includes(t)).map((cv) => itemOut(cv, have, x.source));
  const offset = Math.max(0, +c.req.query('offset') || 0), limit = Math.min(500, Math.max(1, +c.req.query('limit') || 60));
  return c.json({ items: all.slice(offset, offset + limit), total: all.length, offset, limit, memory: x.memory, ...(x.done ? { done: x.done, indexed: x.indexed ?? 0 } : {}) });
});
aiImport45Api.post('/:importId/commit', noImp, async (c) => {
  const x = own(c);
  if (!x) return c.json({ error: 'Importen er utløpt. Velg fila på nytt.', reason: 'expired' }, 404);
  if (x.done) return c.json({ error: 'Importen er allerede gjort', ...x.done }, 409);
  const b = await c.req.json().catch(() => ({})) ?? {};
  return c.json(commit45(c.get('user'), x, { ...b, importId: c.req.param('importId') }));
});
aiImport45Api.post('/:importId/undo', noImp, (c) => {
  const id = c.req.param('importId'), x = own(c);
  const r = undo45(c.get('user'), id, x);
  return r ? c.json(r) : c.json({ error: 'Fant ikke importen' }, 404);
});
export const _ai45 = { imports, uploads, existsSync };
