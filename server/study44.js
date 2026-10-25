// Prompt 44 (SERVER44): Studie → Dokumenter (vitnemål, karakterutskrift …) og Studie-oversikten for ny web.
// claude-code-studie-dokumenter.md, claude-code-studie-web-ny.md. Bare eieren ser dokumentene (per bruker). Filen og teksten
// lagres kryptert (AES-256-GCM, nøkkel avledet fra SESSION_SECRET). Snitt og studiepoeng regnes her, aldri av LLM-en.
// Tekst: PDF-tekst (pdftotext når den finnes, ellers innebygd uttrekk av tekstlaget), bilder med Tesseract (nor+eng), .txt direkte.
// Tolkning: egen tolker for emnelinjer først; finner den ingenting, spørres lokal modell (Glimt via ai-run/ai-gate) med JSON-svar.
//
//   POST   /api/study/documents (multipart: file eller files[]; også /api/studie/docs) → {doc} (flere filer: {docs:[…], doc})
//          doc: {id, kind:'vitnemal'|'karakterutskrift'|'attest'|'kursbevis'|'annet', kindLabel, title, institution, student, program, date,
//                emner:[{kode, navn, sp, karakter, semester, tone:'good'|'neutral'|'warn'|'bad'}], snitt:{letter, value, text, scale}|null,
//                snittVgs:{value, points, text}|null, sp, spText, found:[tekst], summary, steps:[{key, label, ms, ok}], filename, mime, size,
//                createdAt, updatedAt, replaced?:true, compare?:{newCourses, before, after, text}, appliedAt}
//   GET    /api/study/documents → {items:[doc uten tekst], kpi:{sp, snitt, snittVgs, count}}
//   GET    /api/study/documents/:id → {doc} · GET …/:id/file → originalfilen · DELETE …/:id → {ok}
//   POST   /api/study/documents/:id/ask {q} → {answer, source:'doc'|'glimt'|'none', emner?}
//   POST   /api/study/documents/:id/apply → {ok, added, updated, subjects:[{kode, navn, karakter}], message}
//   GET    /api/study/overview → {date, weekday, week, now, next, today:{blocks, nowMin, start, end}, deadlines:[…], grades:{items, avg, avgText}, documents:[…], tip}
import { Hono } from 'hono';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { config } from './config.js';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { ocrTools } from './ocr-fallback.js';
import { extract45, parseCourses45, cleanAiCourses45, statusOf45, STUDY_SCHEMA45, pdfPages45, tool45 } from './study45.js'; // prompt 45: ekte vitnemål (se study45.js)
import { readStudy46, vgsAverage46, cleanEdited46 } from './study46.js'; // prompt 46: tabeller med posisjon, OCR-bokser, visjon i striper (se study46.js)

const MOCK = () => process.env.MOCK_DATA === '1';
const DIR = () => resolve(config.dataDir, 'study44');
db.exec(`CREATE TABLE IF NOT EXISTS study44_docs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  text_enc TEXT, parsed TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, applied INTEGER);
CREATE INDEX IF NOT EXISTS study44_user ON study44_docs(user_id);`);
const q = (sql) => db.prepare(sql);

/* ---------------- Kryptering ---------------- */

const KEY = () => createHash('sha256').update(`study44:${config.sessionSecret || 'dev'}`).digest();
const enc = (buf) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', KEY(), iv); const out = Buffer.concat([c.update(buf), c.final()]); return Buffer.concat([iv, c.getAuthTag(), out]); };
const dec = (buf) => { const d = createDecipheriv('aes-256-gcm', KEY(), buf.subarray(0, 12)); d.setAuthTag(buf.subarray(12, 28)); return Buffer.concat([d.update(buf.subarray(28)), d.final()]); };
const fileOf = (u, id) => join(DIR(), String(u).replace(/[^\w-]/g, ''), `${id}.bin`);

/* ---------------- Tekst ---------------- */

const run = (cmd, args, timeout = 60_000) => new Promise((res, rej) => execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (e, out) => (e ? rej(e) : res(out))));
/** Innebygd uttrekk av tekstlaget i en PDF (Tj/TJ i FlateDecode-strømmer). Godt nok for vitnemål/utskrifter laget digitalt. */
export function pdfText44(buf) {
  const s = buf.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g; let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, end = s.indexOf('endstream', start);
    if (end < 0) break;
    const head = s.slice(Math.max(0, m.index - 300), m.index);
    let data = Buffer.from(s.slice(start, end).replace(/\r?\n$/, ''), 'latin1');
    if (/FlateDecode/.test(head)) { try { data = inflateSync(data); } catch { continue; } }
    const t = data.toString('latin1');
    if (!/T[jJ*']|BT/.test(t)) continue;
    let line = '';
    const tok = /\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^)])*)\)\s*(?:Tj|'|")|(T\*|ET|Td|TD|Tm)/g; let k;
    const unesc = (x) => x.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (a, b) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[b] ?? String.fromCharCode(parseInt(b, 8))));
    while ((k = tok.exec(t))) {
      if (k[3]) { if (/T\*|ET|Td|TD|Tm/.test(k[3]) && line.trim()) { out.push(line.trim()); line = ''; } continue; }
      if (k[1] != null) { const parts = [...k[1].matchAll(/\(((?:\\.|[^)])*)\)|(-?\d+(?:\.\d+)?)/g)]; for (const p of parts) { if (p[1] != null) line += unesc(p[1]); else if (+p[2] < -200) line += ' '; } }
      else line += unesc(k[2]);
    }
    if (line.trim()) out.push(line.trim());
  }
  return Buffer.from(out.join('\n'), 'latin1').toString('latin1').replace(/Ã¸/g, 'ø').replace(/Ã¦/g, 'æ').replace(/Ã¥/g, 'å').replace(/Ã˜/g, 'Ø').replace(/Ã†/g, 'Æ').replace(/Ã…/g, 'Å');
}
let textImpl = null;
/** Bare for tester: (buf, mime) → tekst. */
export const _setStudyText44 = (fn) => { textImpl = fn; };
async function extract(buf, mime, name) {
  if (textImpl) return { text: await textImpl(buf, mime), how: 'test' };
  // Prompt 45: poppler/innebygd PDF-leser med ToUnicode, skannede sider som bilder, HEIC → JPG (study45.js). Demoteksten bare i MOCK uten verktøy.
  try {
    const r = await extract45(buf, mime, name);
    if (MOCK() && !visionImpl && r.how === 'ocr' && !r.text.trim()) return { ...r, text: DEMO_TEXT };
    return r;
  } catch (e) { if (!MOCK() || e.status === 415) throw e; }
  if (/^text\//.test(mime) || /\.txt$/i.test(name)) return { text: buf.toString('utf8'), how: 'tekst' };
  if (mime === 'application/pdf') {
    try { const dir = await mkdtemp(join(tmpdir(), 'st44-')); try { await writeFile(join(dir, 'in.pdf'), buf); const t = await run('pdftotext', ['-layout', join(dir, 'in.pdf'), '-'], 30_000); if (t.trim()) return { text: t, how: 'pdf' }; } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); } } catch { /* ingen pdftotext */ }
    const t = pdfText44(buf);
    if (t.trim()) return { text: t, how: 'pdf' };
  }
  if (/^image\//.test(mime) || mime === 'application/pdf') {
    const tl = await ocrTools().catch(() => ({}));
    if (tl.tesseract) {
      const dir = await mkdtemp(join(tmpdir(), 'st44-'));
      try { const src = join(dir, mime === 'application/pdf' ? 'in.pdf' : 'in.img'); await writeFile(src, buf); const t = await run('tesseract', [src, 'stdout', '-l', 'nor+eng', '--psm', '6']).catch(() => run('tesseract', [src, 'stdout', '--psm', '6'])); return { text: t, how: 'ocr' }; }
      finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
    }
    if (MOCK()) return { text: DEMO_TEXT, how: 'ocr' };
    throw Object.assign(new Error('Fant ingen tekst. Lokal OCR (Tesseract) er ikke installert på serveren, og dokumentet har ikke tekstlag.'), { status: 422 });
  }
  throw Object.assign(new Error('Filtypen støttes ikke. Bruk PDF, JPG, PNG eller HEIC.'), { status: 415 });
}
const DEMO_TEXT = `Universitetet i Oslo\nKarakterutskrift\nStudent: Sebastian Kristo\nStudieprogram: Informatikk: programmering og systemarkitektur\nDato: 20.06.2026\n
IN1000 Introduksjon til objektorientert programmering 10 B Høst 2025\nIN1150 Logiske metoder 10 C Høst 2025\nMAT1100 Kalkulus 10 D Høst 2025\nIN1010 Objektorientert programmering 10 A Vår 2026\nIN1020 Introduksjon til datateknologi 10 B Vår 2026\nIN1030 Systemer, krav og konsekvenser 10 Bestått Vår 2026`;

/* ---------------- Tolkning ---------------- */

const LETTER = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
const KINDS = [['vitnemal', /vitnem[åa]l|kompetansebevis/i, 'Vitnemål'], ['karakterutskrift', /karakterutskrift|resultatutskrift|transcript|emneresultater|karakterer/i, 'Karakterutskrift'], ['attest', /\battest\b|arbeidsattest/i, 'Attest'], ['kursbevis', /kursbevis|sertifikat|certificate|kompetansebevis/i, 'Kursbevis']];
const SEM = /\b((?:høst|vår|sommer|h|v)\s?\d{2,4}|\d{4}\s?(?:høst|vår|h|v))\b/i;
const GRADE = /^(A|B|C|D|E|F|[1-6]|Bestått|Ikke bestått|Godkjent|Ikke godkjent|IB|Stryk)$/i;
const toneOf = (k) => { const g = String(k ?? '').toUpperCase(); if (['A', 'B', '5', '6'].includes(g) || /^(BESTÅTT|GODKJENT)$/.test(g)) return 'good'; if (['C', '4'].includes(g)) return 'neutral'; if (['D', '3'].includes(g)) return 'warn'; if (['E', 'F', '1', '2'].includes(g) || /IKKE|STRYK|IB/.test(g)) return 'bad'; return 'neutral'; };
const cap = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());
/** Emnelinjer: «IN1000 Navn 10 B Høst 2025», «REA3024 Matematikk R2 5», «Norsk hovedmål 4», tabulatorer eller flere mellomrom. */
export function parseCourses44(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\t+/g, '  ').replace(/\s+$/, '');
    if (!line.trim() || line.length > 200) continue;
    const sem = line.match(SEM)?.[1] ?? null;
    const body = sem ? line.replace(sem, ' ').trim() : line.trim();
    const parts = body.split(/\s{2,}|\s\|\s|;/).map((x) => x.trim()).filter(Boolean);
    const words = parts.length >= 3 ? parts : body.split(/\s+/);
    // Karakter sist (eventuelt «Ikke bestått»).
    let grade = null, rest = [...words];
    const two = rest.slice(-2).join(' ');
    if (GRADE.test(two)) { grade = two; rest = rest.slice(0, -2); } else if (GRADE.test(rest[rest.length - 1] ?? '')) { grade = rest[rest.length - 1]; rest = rest.slice(0, -1); }
    if (!grade) continue;
    let sp = null;
    if (!/^[1-6]$/.test(grade) && /^\d{1,2}(?:[.,]\d)?$/.test(rest[rest.length - 1] ?? '') && rest.length > 1) { sp = +rest[rest.length - 1].replace(',', '.'); rest = rest.slice(0, -1); }
    let kode = null;
    if (/^[A-ZÆØÅ]{2,8}[-]?\d{3,5}[A-Z]?$/.test(rest[0] ?? '')) { kode = rest[0]; rest = rest.slice(1); }
    const navn = rest.join(' ').replace(/\s+/g, ' ').trim();
    if (!navn || navn.length < 2 || /^(karakter|emne|kode|sum|totalt|snitt|gjennomsnitt|side)\b/i.test(navn)) continue;
    // Bokstavkarakter uten studiepoeng og uten kode er sjelden et emne (f.eks. «Klasse B»).
    if (/^[A-F]$/i.test(grade) && sp == null && !kode) continue;
    if (/^[1-6]$/.test(grade) && sp != null && !kode && sp > 6) continue;
    out.push({ kode, navn: cap(navn), sp, karakter: /^[a-f]$/.test(grade) ? grade.toUpperCase() : cap(grade.toLowerCase()), semester: sem ? cap(sem.toLowerCase().replace(/^h(\d)/, 'Høst $1').replace(/^v(\d)/, 'Vår $1')) : null, tone: toneOf(grade) });
  }
  return out;
}
const LETTERS = ['E', 'D', 'C', 'B', 'A'];
/** Snitt høyere utdanning (vektet med sp, A=5 … E=1, F og bestått telles ikke) og vgs (karakterpoeng = snitt × 10). */
export function averages44(emner) {
  const letter = emner.filter((e) => /^[A-E]$/.test(e.karakter));
  const w = letter.reduce((a, e) => a + (e.sp || 1), 0);
  const v = w ? letter.reduce((a, e) => a + LETTER[e.karakter] * (e.sp || 1), 0) / w : null;
  const snitt = v == null ? null : { value: Math.round(v * 100) / 100, letter: LETTERS[Math.max(0, Math.min(4, Math.round(v) - 1))], text: `${LETTERS[Math.max(0, Math.min(4, Math.round(v) - 1))]} (${String(Math.round(v * 10) / 10).replace('.', ',')})`, scale: 'A–E' };
  const num = emner.filter((e) => /^[1-6]$/.test(e.karakter));
  const nv = num.length ? num.reduce((a, e) => a + +e.karakter, 0) / num.length : null;
  const vgs = nv == null ? null : { value: Math.round(nv * 100) / 100, points: Math.round(nv * 10 * 10) / 10, text: `${String(Math.round(nv * 100) / 100).replace('.', ',')} · ${String(Math.round(nv * 100) / 10).replace('.', ',')} karakterpoeng` };
  const sp = emner.filter((e) => e.sp && !/^F$|ikke|stryk|^IB$/i.test(e.karakter)).reduce((a, e) => a + e.sp, 0);
  return { snitt, snittVgs: vgs, sp: Math.round(sp * 10) / 10 };
}
function metaOf(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const kind = KINDS.find(([, re]) => re.test(text)) ?? ['annet', null, 'Dokument'];
  const inst = lines.find((l) => /universitet|høgskole|høyskole|videregående|\bskole\b|\bNTNU\b|\bUiO\b|OsloMet|\bBI\b|\bUiB\b|\bUiT\b|akademi/i.test(l) && l.length < 90) ?? null;
  const student = (String(text).match(/(?:Student|Navn|Elev|Name)\s*[:.]\s*([^\n]{2,60})/i)?.[1] ?? '').trim() || null;
  const program = (String(text).match(/(?:Studieprogram|Program|Utdanningsprogram|Studieretning)\s*[:.]\s*([^\n]{2,90})/i)?.[1] ?? '').trim() || null;
  const dm = String(text).match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/) ?? String(text).match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const date = dm ? (dm[3]?.length === 4 ? `${dm[3]}-${String(dm[2]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}` : `${dm[1]}-${dm[2]}-${dm[3]}`) : null;
  return { kind: kind[0], kindLabel: kind[2], institution: inst, student, program, date };
}
function foundOf(d) {
  const f = [];
  if (d.sp) f.push(`${String(d.sp).replace('.', ',')} studiepoeng${d.kind === 'karakterutskrift' ? ' registrert' : ''}`);
  if (d.snitt) f.push(`Snitt ${d.snitt.text} for høyere utdanning`);
  if (d.snittVgs) f.push(`Snitt vgs ${d.snittVgs.text}`);
  const weak = [...d.emner].filter((e) => ['warn', 'bad'].includes(e.tone) && !/bestått|godkjent/i.test(e.karakter)).sort((a, b) => (LETTER[a.karakter] ?? +a.karakter) - (LETTER[b.karakter] ?? +b.karakter))[0];
  if (weak) f.push(`Svakest: ${weak.navn} (${weak.karakter})${/^[DEF]$|^[12]$/.test(weak.karakter) ? ', kan tas opp igjen' : ''}`);
  const fail = d.emner.filter((e) => /^F$|ikke bestått|stryk|^IB$/i.test(e.karakter));
  if (fail.length) f.push(`Stryk: ${fail.map((e) => e.navn).join(', ')}`);
  if (d.snitt && d.snitt.value >= 3) f.push(`Snitt ${d.snitt.letter} holder for de fleste masterprogram (krav C)`);
  const r2 = d.emner.some((e) => /matematikk r2|R2\b/i.test(e.navn)), fys = d.emner.some((e) => /fysikk ?(2|1)/i.test(e.navn));
  if (r2 && fys) f.push('R2 + Fysikk oppfyller kravet for ingeniørfag');
  return f.slice(0, 6);
}
let visionImpl = null;
/** Bare for tester: (images, user) → {emner, institution, …}. */
export const _setStudyVision45 = (fn) => { visionImpl = fn; };
const vision = () => visionImpl ?? (MOCK() ? null : async (images, user) => { const { run: aiRun } = await import('./ai-run.js'); const out = await aiRun('rc', { user, images, prompt: 'Dette er et norsk vitnemål eller en karakterutskrift. Les ALLE fag/emner med fagkode, navn, studiepoeng, karakter (A–F, 1–6, Bestått/Ikke bestått), semester, og for vitnemål standpunkt og eksamen. Svar KUN med JSON etter skjemaet. Ikke regn ut snitt, ikke finn på fag.', json: true, schema: STUDY_SCHEMA45, localOnly: true, step: 'document', numCtx: 8192, numPredict: 4096, title: 'Glimt · les vitnemål (bilde)', background: true }); /* prompt 47: 8192 (visjonsmodellen + bilde), 4096 ut */ return out.data ?? JSON.parse(String(out.text).match(/\{[\s\S]*\}/)?.[0] ?? '{}'); });
let aiImpl = null;
export const _setStudyAi44 = (fn) => { aiImpl = fn; };
// Prompt 47: dokumentstrukturering med steg «document» (params47: num_ctx 16384, num_predict 4096, temperatur 0, think av) og
// strengt JSON-skjema når kalleren gir et – før kuttet 4096/900 lange dokumenter, og fag manglet.
import { completeness47, retryMissing47, completenessText47 } from './glimt45/document47.js'; // prompt 47
import { clean55 } from './study55.js'; // prompt 55
const ai = () => aiImpl ?? (MOCK() ? null : async (prompt, user, schema = null) => { const { run: aiRun } = await import('./ai-run.js'); const out = await aiRun('glimt', { user, prompt, json: true, ...(schema ? { schema } : {}), step: 'document', localOnly: true, title: 'Glimt · les dokument', background: true }); return out.data ?? JSON.parse(String(out.text).match(/\{[\s\S]*\}/)?.[0] ?? '{}'); });
async function analyse(user, buf, mime, name) {
  const steps = [];
  const step = async (key, label, fn) => { const t0 = Date.now(); try { const r = await fn(); steps.push({ key, label: typeof label === 'function' ? label(r) : label, ms: Date.now() - t0, ok: true }); return r; } catch (e) { steps.push({ key, label: typeof label === 'function' ? label(null) : label, ms: Date.now() - t0, ok: false, error: e.message }); throw e; } };
  steps.push({ key: 'upload', label: 'Lastet opp og kryptert', ms: 0, ok: true });
  // Prompt 46: tabellen leses med posisjoner først (tekstlag → kolonner; skannet → OCR-bokser; visjon i striper som reserve).
  let t46 = null;
  if (!textImpl && (mime === 'application/pdf' || /^image\//.test(mime))) {
    const t0 = Date.now();
    try { t46 = await readStudy46(buf, mime, { user, name }); } catch (e) { console.warn(`[study] tabell-leseren: ${e.message}`); }
    if (t46) for (const s of t46.steps) steps.push({ ...s, key: `p46-${s.key}` });
    void t0;
  }
  const ex = t46?.emner?.length ? { text: t46.text, how: t46.method, images: t46.images ?? [], notes: t46.notes ?? [] }
    : await step('read', (r) => (r?.how === 'ocr' ? 'Leste bildet (OCR)' : r?.how === 'pdf' ? 'Leste PDF-teksten' : 'Leste teksten'), () => extract(buf, mime, name));
  const meta = await step('meta', 'Fant skole, dato og type', async () => metaOf(ex.text));
  // Prompt 45: begge tolkerne, den som finner flest fag vinner (parseCourses45 tåler FS-utskrifter og vgs-vitnemål).
  let emner = t46?.emner?.length ? t46.emner.map((e) => ({ ...e, tone: toneOf(e.karakter) }))
    : await step('courses', (r) => `Leste ${r?.length ?? 0} fag og karakterer`, async () => { const a = parseCourses44(ex.text), b = parseCourses45(ex.text).map((e) => ({ ...e, tone: toneOf(e.karakter) })); return b.length >= a.length ? b : a; });
  // Prompt 45: bilder/skannede sider → lokal visjonsmodell med JSON-skjema når OCR ikke ga fag.
  if (!emner.length && ex.images?.length && vision()) {
    const t0 = Date.now();
    try {
      const j = await vision()(ex.images.slice(0, 4), user);
      emner = cleanAiCourses45(j?.emner).map((e) => ({ ...e, tone: toneOf(e.karakter) }));
      for (const k of ['institution', 'student', 'program']) if (!meta[k] && j?.[k]) meta[k] = String(j[k]).slice(0, 90);
      if (!meta.date && /^\d{4}-\d{2}-\d{2}$/.test(String(j?.date ?? ''))) meta.date = j.date;
      steps.push({ key: 'vision', label: `Glimt leste bildet (${emner.length} fag)`, ms: Date.now() - t0, ok: true });
      ex.how = 'vision';
    } catch (e) { steps.push({ key: 'vision', label: 'Glimt kunne ikke lese bildet', ms: Date.now() - t0, ok: false, error: e.message }); console.warn(`[study] visjon feilet: ${e.message}`); }
  }
  if (!emner.length && ai()) {
    try {
      const j = await ai()(`Les dette dokumentet (vitnemål eller karakterutskrift). Svar KUN med JSON {"emner":[{"kode":"","navn":"","sp":0,"karakter":"","semester":""}],"institution":"","student":""}. Ikke regn ut snitt.\n\n${ex.text.slice(0, 30000)}`, user);
      emner = (Array.isArray(j?.emner) ? j.emner : []).slice(0, 80).map((e) => ({ kode: e.kode ? String(e.kode).slice(0, 20) : null, navn: cap(String(e.navn ?? '').slice(0, 120)), sp: Number.isFinite(+e.sp) && +e.sp > 0 ? +e.sp : null, karakter: String(e.karakter ?? '').trim().slice(0, 20), semester: e.semester ? String(e.semester).slice(0, 20) : null, tone: toneOf(e.karakter) })).filter((e) => e.navn && GRADE.test(e.karakter));
      if (!meta.institution && j?.institution) meta.institution = String(j.institution).slice(0, 90);
      if (!meta.student && j?.student) meta.student = String(j.student).slice(0, 60);
      steps.push({ key: 'glimt', label: 'Glimt leste fagene (lokal modell)', ms: 0, ok: true });
    } catch (e) { steps.push({ key: 'glimt', label: 'Glimt kunne ikke lese fagene', ms: 0, ok: false, error: e.message }); }
  }
  // Prompt 55: karakteren valideres (fagkode/«strconv(4)» blir aldri karakter), fagnavn matches mot kjente fag, dubletter fjernes.
  emner = clean55(emner).map((e) => ({ ...e, tone: toneOf(e.karakter) }));
  // Prompt 47: fullstendighetssjekk i kode – fag-rader i OCR-teksten mot fagene i JSON. Manglende rader får ett nytt forsøk (bare de
  // radene, strengt skjema), og avvik flagges i svaret. Modellen får ikke legge til fag som ikke står i OCR-teksten.
  let comp = ex.text ? completeness47(ex.text, emner) : null;
  if (comp && comp.missing.length && emner.length && ai()) {
    const add = await retryMissing47(comp.missing, (p, schema) => ai()(p, user, schema));
    for (const e of add) if (GRADE.test(e.karakter) && !emner.some((x) => x.navn.toLowerCase() === e.navn.toLowerCase())) emner.push({ kode: null, navn: cap(e.navn), sp: null, karakter: e.karakter, semester: null, ...(e.eksamen ? { eksamen: e.eksamen } : {}), tone: toneOf(e.karakter), source: 'glimt-rad', check: true, checkReason: 'Lest på nytt av Glimt – sjekk karakteren' });
    if (add.length) steps.push({ key: 'complete', label: `Leste ${add.length} manglende ${add.length === 1 ? 'rad' : 'rader'} på nytt`, ms: 0, ok: true });
    comp = completeness47(ex.text, emner);
  }
  // Prompt 46: koden regner – vgs-snittet tar med eksamenskarakterene også.
  const avg = await step('calc', 'Regner snitt …', async () => { const a = averages44(emner); const v = vgsAverage46(emner); return v ? { ...a, snittVgs: { value: v.value, points: v.points, text: v.text } } : a; });
  const d = { ...meta, emner, ...avg };
  d.found = foundOf(d);
  d.title = `${meta.kindLabel}${meta.institution ? ` · ${meta.institution}` : ''}`;
  d.summary = `${meta.kindLabel}${meta.institution ? ` fra ${meta.institution}` : ''}${meta.date ? ` (${meta.date.split('-').reverse().join('.')})` : ''}: ${emner.length} ${emner.length === 1 ? 'emne' : 'emner'}${avg.sp ? `, ${String(avg.sp).replace('.', ',')} sp` : ''}${avg.snitt ? `, snitt ${avg.snitt.text}` : avg.snittVgs ? `, snitt ${avg.snittVgs.text}` : ''}.`;
  d.steps = steps;
  d.spText = avg.sp ? `${String(avg.sp).replace('.', ',')} sp` : null;
  d.how = ex.how; d.notes = ex.notes ?? [];
  // Prompt 46: metode (tekst | regler | ocr | visjon), validering mot totalen og antall rader som må sjekkes.
  d.method = t46?.emner?.length ? t46.method : ex.how === 'vision' ? 'visjon' : ex.how === 'ocr' ? 'ocr' : ex.how === 'pdf' ? 'tekst' : ex.how ?? null;
  d.format = t46?.format ?? null;
  if (t46?.validation) d.validation = t46.validation;
  d.checks = emner.filter((e) => e.check).length;
  if (comp) d.completeness = { ocrRows: comp.ocrRows, found: comp.found, missing: comp.missing.map((r) => r.name).slice(0, 20), complete: comp.complete };
  Object.assign(d, statusOf45(d));
  if (comp && !comp.complete && emner.length) d.statusText = `${d.statusText} · ${completenessText47(comp)}`;
  if (d.checks && d.status !== 'failed') d.statusText = `${d.statusText} · ${d.checks} må sjekkes`;
  if (!emner.length) { d.statusText = 'Klarte ikke å lese dokumentet. Er det et bilde? Prøv en skarpere kopi eller PDF fra Vitnemålsportalen.'; d.manual = { label: 'Fyll inn selv', method: 'PUT', path: '/api/study/documents/:id/courses' }; }
  if (!emner.length) console.warn(`[study] fant ingen fag how=${ex.how} tekst=${(ex.text ?? '').length} tegn`);
  return { d, text: ex.text };
}
const docOut = (r, withText = false) => {
  const p = JSON.parse(r.parsed);
  const st = p.status ? {} : statusOf45(p); // prompt 45: eldre dokumenter får status også
  return { id: r.id, ...p, ...st, retry: { method: 'POST', path: `/api/study/documents/${r.id}/reanalyze` }, edit: { method: 'PUT', path: `/api/study/documents/${r.id}/courses` }, // prompt 46
    file: { url: `/api/study/documents/${r.id}/file`, download: `/api/study/documents/${r.id}/file?download=1`, thumb: `/api/study/documents/${r.id}/thumb`, kind: r.mime === 'application/pdf' ? 'pdf' : /^image\//.test(r.mime) ? 'image' : 'text', mime: r.mime },
    filename: r.filename, mime: r.mime, size: r.size, createdAt: new Date(r.created).toISOString(), updatedAt: new Date(r.updated).toISOString(), appliedAt: r.applied ? new Date(r.applied).toISOString() : null,
    ...(withText && r.text_enc ? { text: dec(Buffer.from(r.text_enc, 'base64')).toString('utf8').slice(0, 20000) } : {}) };
};
const ofUser = (u, id) => q('SELECT * FROM study44_docs WHERE id=? AND user_id=?').get(+id, u);

async function upload(u, file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw Object.assign(new Error('Velg en fil (PDF, JPG, PNG eller HEIC)'), { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) throw Object.assign(new Error('Filen er tom'), { status: 400 });
  if (buf.length > 20 * 1024 * 1024) throw Object.assign(new Error('Filen er større enn 20 MB'), { status: 413 });
  const name = String(file.name ?? 'dokument').slice(0, 120);
  const mime = buf.subarray(0, 4).toString() === '%PDF' ? 'application/pdf' : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf.subarray(1, 4).toString() === 'PNG' ? 'image/png' : /heic|heif/i.test(file.type ?? '') || buf.subarray(4, 12).toString().includes('ftyphei') ? 'image/heic' : /^text\//.test(file.type ?? '') || /\.txt$/i.test(name) ? 'text/plain' : String(file.type || 'application/octet-stream');
  const { d, text } = await analyse(u, buf, mime, name);
  // Ny utskrift av samme studium: sammenlign og oppdater i stedet for å duplisere.
  const prev = q('SELECT * FROM study44_docs WHERE user_id=? AND kind=? ORDER BY id DESC').all(u, d.kind).find((r) => { const p = JSON.parse(r.parsed); return p.institution && p.institution === d.institution && (p.student ?? '') === (d.student ?? '') && (p.program ?? '') === (d.program ?? ''); });
  const now = Date.now();
  let id;
  if (prev && d.emner.length) {
    const p = JSON.parse(prev.parsed);
    const had = new Set((p.emner ?? []).map((e) => (e.kode ?? e.navn).toLowerCase()));
    const fresh = d.emner.filter((e) => !had.has((e.kode ?? e.navn).toLowerCase()));
    d.compare = { newCourses: fresh.length, before: p.snitt?.letter ?? null, after: d.snitt?.letter ?? null, text: `${fresh.length} ${fresh.length === 1 ? 'nytt emne' : 'nye emner'}${p.snitt && d.snitt && p.snitt.letter !== d.snitt.letter ? `, snittet ${d.snitt.value > p.snitt.value ? 'opp' : 'ned'} fra ${p.snitt.letter} til ${d.snitt.letter}` : ''}` };
    d.found = [d.compare.text, ...d.found].slice(0, 6);
    d.replaced = true;
    q('UPDATE study44_docs SET filename=?, mime=?, size=?, text_enc=?, parsed=?, updated=? WHERE id=?').run(name, mime, buf.length, enc(Buffer.from(text)).toString('base64'), JSON.stringify(d), now, prev.id);
    id = prev.id;
  } else {
    id = q('INSERT INTO study44_docs(user_id, kind, filename, mime, size, text_enc, parsed, created, updated) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id').get(u, d.kind, name, mime, buf.length, enc(Buffer.from(text)).toString('base64'), JSON.stringify(d), now, now).id;
  }
  mkdirSync(join(DIR(), String(u).replace(/[^\w-]/g, '')), { recursive: true });
  writeFileSync(fileOf(u, id), enc(buf), { mode: 0o600 });
  console.log(`study.doc user=${u} id=${id} kind=${d.kind} emner=${d.emner.length} ${d.replaced ? 'oppdatert' : 'ny'}`);
  return docOut(ofUser(u, id));
}
function kpiOf(u) {
  const docs = q('SELECT * FROM study44_docs WHERE user_id=?').all(u).map((r) => JSON.parse(r.parsed));
  const higher = docs.filter((d) => d.kind !== 'vitnemal').flatMap((d) => d.emner ?? []), vgs = docs.filter((d) => d.kind === 'vitnemal').flatMap((d) => d.emner ?? []);
  const a = averages44(higher), b = averages44(vgs);
  return { sp: a.sp, snitt: a.snitt, snittVgs: b.snittVgs, count: docs.length };
}
async function ask(u, r, qs) {
  const d = docOut(r, true), t = String(qs ?? '').toLowerCase().trim();
  if (!t) throw Object.assign(new Error('Skriv et spørsmål'), { status: 400 });
  const em = d.emner ?? [];
  const sub = em.filter((e) => t.split(/\s+/).some((w) => w.length > 3 && (e.navn.toLowerCase().includes(w.replace(/[?.!]/g, '')) || (e.kode ?? '').toLowerCase() === w)) || (/matte|matematikk/.test(t) && /matemat|kalkulus|mat\d/i.test(`${e.navn} ${e.kode ?? ''}`)));
  if (/snitt|gjennomsnitt/.test(t)) {
    if (sub.length) { const a = averages44(sub); return { answer: `Snittet i ${sub.map((e) => e.navn).join(', ')} er ${a.snitt?.text ?? a.snittVgs?.text ?? 'ikke mulig å regne ut'}.`, source: 'doc', emner: sub }; }
    return { answer: d.snitt ? `Snittet er ${d.snitt.text} (vektet med studiepoeng).` : d.snittVgs ? `Snittet er ${d.snittVgs.text}.` : 'Dokumentet har ingen karakterer som gir snitt.', source: 'doc' };
  }
  if (/stryk|strøk|stryke|ikke bestått|\bf\b/.test(t)) { const f = em.filter((e) => /^F$|ikke bestått|stryk|^IB$/i.test(e.karakter)); return { answer: f.length ? `Ja, ${f.map((e) => `${e.navn} (${e.karakter})`).join(', ')}.` : 'Nei, ingen stryk i dette dokumentet.', source: 'doc', emner: f }; }
  if (/studiepoeng|\bsp\b|poeng/.test(t)) return { answer: `${String(d.sp ?? 0).replace('.', ',')} studiepoeng${sub.length ? ` (${sub.reduce((a, e) => a + (e.sp ?? 0), 0)} i ${sub.map((e) => e.navn).join(', ')})` : ''}.`, source: 'doc' };
  if (/best|sterkest|høyest/.test(t)) { const b = [...em].sort((x, y) => (LETTER[y.karakter] ?? +y.karakter ?? 0) - (LETTER[x.karakter] ?? +x.karakter ?? 0))[0]; return { answer: b ? `Best: ${b.navn} (${b.karakter}).` : 'Fant ingen karakterer.', source: 'doc', emner: b ? [b] : [] }; }
  if (sub.length) return { answer: sub.map((e) => `${e.navn}${e.kode ? ` (${e.kode})` : ''}: ${e.karakter}${e.sp ? `, ${e.sp} sp` : ''}${e.semester ? `, ${e.semester}` : ''}`).join('. ') + '.', source: 'doc', emner: sub };
  if (ai()) {
    try { const j = await ai()(`Svar kort på norsk bokmål ut fra dokumentet under, KUN med JSON {"answer":"…"}. Finnes ikke svaret i dokumentet, si det.\nSpørsmål: ${String(qs).slice(0, 300)}\nDokument:\n${String(d.text ?? '').slice(0, 10000)}`, u); if (j?.answer) return { answer: String(j.answer).slice(0, 800), source: 'glimt' }; } catch { /* */ }
  }
  return { answer: 'Fant ikke svaret i dokumentet.', source: 'none' };
}
function apply(u, r) {
  const d = JSON.parse(r.parsed);
  const cur = kv.get(u, 'study44_courses', []) ?? [];
  let added = 0, updated = 0;
  for (const e of d.emner ?? []) {
    const k = (e.kode ?? e.navn).toLowerCase(), i = cur.findIndex((x) => (x.kode ?? x.navn).toLowerCase() === k);
    const row = { kode: e.kode, navn: e.navn, sp: e.sp, karakter: e.karakter, semester: e.semester, docId: r.id, institution: d.institution };
    if (i >= 0) { cur[i] = row; updated++; } else { cur.push(row); added++; }
    // Tallkarakterer (vgs) blir også fag i Karakterer (samme tabell som før).
    if (/^[1-6]$/.test(e.karakter) && !q('SELECT 1 FROM grades WHERE user=? AND subject=?').get(u, e.navn)) q('INSERT INTO grades(user,subject,grade,tests,sort) VALUES(?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM grades))').run(u, e.navn.slice(0, 60), +e.karakter, d.kindLabel ?? '');
  }
  kv.set(u, 'study44_courses', cur.slice(0, 400));
  q('UPDATE study44_docs SET applied=? WHERE id=?').run(Date.now(), r.id);
  return { ok: true, added, updated, subjects: cur.map(({ kode, navn, karakter, sp }) => ({ kode, navn, karakter, sp })), message: `${added} ${added === 1 ? 'emne' : 'emner'} lagt i Studie${updated ? ` · ${updated} oppdatert` : ''}` };
}

/* ---------------- Studie-oversikt (ny web) ---------------- */

const OSLO = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
const WDN = { Monday: 'MANDAG', Tuesday: 'TIRSDAG', Wednesday: 'ONSDAG', Thursday: 'TORSDAG', Friday: 'FREDAG', Saturday: 'LØRDAG', Sunday: 'SØNDAG' };
const MON = ['JANUAR', 'FEBRUAR', 'MARS', 'APRIL', 'MAI', 'JUNI', 'JULI', 'AUGUST', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
const isoWeek = (d) => { const t = new Date(`${d}T12:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - f) / 86400_000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); };
const hmOf = (iso) => { const p = OSLO(Date.parse(iso)); return `${p.hour}:${p.minute}`; };
const minOf = (iso) => { const p = OSLO(Date.parse(iso)); return +p.hour * 60 + +p.minute; };
export async function overview44(u, now = Date.now()) {
  const p = OSLO(now), today = `${p.year}-${p.month}-${p.day}`;
  const { eventsFor, lessonNowOf } = await import('./calendar.js');
  const end = new Date(Date.parse(`${today}T12:00:00Z`) + 21 * 86400_000).toISOString().slice(0, 10);
  let events = [];
  try { events = (await eventsFor(u, today, end)).events; } catch { events = []; }
  const school = events.filter((e) => ['ical', 'canvas'].includes(e.source) || ['time', 'prove', 'innl', 'skole'].includes(e.type));
  const ln = lessonNowOf(school, now);
  const todays = school.filter((e) => e.date === today && !e.allDay).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const blocks = todays.map((e) => ({ id: e.id, title: e.subject ?? e.title, room: e.room ?? '', start: hmOf(e.start), end: hmOf(e.end), startMin: minOf(e.start), endMin: minOf(e.end), color: e.subjectColor ?? e.color ?? null, now: Date.parse(e.start) <= now && now < Date.parse(e.end), kind: e.kind ?? e.type }));
  const nowMin = +p.hour * 60 + +p.minute;
  const tests = q('SELECT id, date, title, note FROM tests WHERE user=? AND date>=? ORDER BY date LIMIT 20').all(u, today);
  const dl = [...tests.map((t) => ({ id: `t-${t.id}`, title: t.title, date: t.date, note: t.note ?? '', source: 'studie' })), ...school.filter((e) => (e.type === 'innl' || e.type === 'prove') && e.date >= today).map((e) => ({ id: e.id, title: e.title.replace(/^Frist:\s*/i, ''), date: e.date, note: e.subject ?? '', source: e.source, kind: e.type === 'prove' ? 'prove' : 'frist' }))]
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8).map((x) => { const n = Math.round((Date.parse(`${x.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000); return { ...x, daysLeft: n, tone: n <= 2 ? 'red' : n <= 5 ? 'yellow' : 'neutral', countdownText: n === 0 ? 'i dag' : n === 1 ? 'i morgen' : `om ${n} dager` }; });
  const grades = q('SELECT id, subject, grade FROM grades WHERE user=? ORDER BY sort, id').all(u).filter((g) => g.grade != null);
  const courses = (kv.get(u, 'study44_courses', []) ?? []).filter((x) => /^[A-F]$/.test(x.karakter));
  const avg = grades.length ? grades.reduce((a, g) => a + g.grade, 0) / grades.length : null;
  const docs = q('SELECT * FROM study44_docs WHERE user_id=? ORDER BY updated DESC LIMIT 2').all(u).map((r) => { const d = docOut(r); return { id: d.id, title: d.title, kind: d.kind, kindLabel: d.kindLabel, summary: d.summary, updatedAt: d.updatedAt }; });
  const cur = ln.current, nxt = ln.next ?? (ln.nextSchoolDay?.first ? { ...ln.nextSchoolDay.first, label: `${ln.nextSchoolDay.label} ${hmOf(ln.nextSchoolDay.first.start)}` } : null);
  const tip = cur ? `${cur.label ?? ''} igjen av ${cur.subject ?? cur.title}.` : blocks.length && nowMin < blocks[0].startMin ? `Første time er ${blocks[0].title} kl. ${blocks[0].start}.` : dl[0] ? `Neste frist: ${dl[0].title} ${dl[0].countdownText}.` : 'Ingen timer i dag.';
  return { date: today, weekday: WDN[p.weekday] ?? '', week: isoWeek(today), heading: `${WDN[p.weekday] ?? ''} ${+p.day}. ${MON[+p.month - 1]} · UKE ${isoWeek(today)}`,
    now: cur ? { title: cur.subject ?? cur.title, room: cur.room ?? '', start: hmOf(cur.start), end: hmOf(cur.end), progress: Math.round((cur.progress ?? 0) * 100), minutesLeft: cur.minutesLeft, leftText: cur.label } : null,
    next: nxt ? { title: nxt.subject ?? nxt.title, room: nxt.room ?? '', start: hmOf(nxt.start), label: nxt.label ?? null, startsIn: nxt.startsIn ?? null } : null,
    today: { blocks, nowMin, start: 8 * 60, end: Math.max(15 * 60, ...blocks.map((b) => b.endMin)) },
    deadlines: dl,
    grades: { items: [...grades.map((g) => ({ subject: g.subject, grade: g.grade, tone: g.grade >= 5 ? 'good' : g.grade === 4 ? 'neutral' : 'warn' })), ...courses.map((x) => ({ subject: x.navn, grade: x.karakter, tone: toneOf(x.karakter) }))],
      avg: avg == null ? null : Math.round(avg * 100) / 100, avgText: avg == null ? null : `Snitt ${String(Math.round(avg * 10) / 10).replace('.', ',')}`, higher: kpiOf(u).snitt },
    documents: docs, tip };
}

/* ---------------- Ruter ---------------- */

const fail = (c, e) => c.json({ error: e.message }, e.status && e.status < 600 ? e.status : 500);
const noImp = async (c, next) => { if (c.get('actor') && c.req.method !== 'GET') return c.json({ error: 'Studie-dokumenter kan ikke endres mens du er logget inn som en annen bruker', readOnly: true }, 403); await next(); };
export const study44Api = new Hono();
const postDocs = async (c) => {
  let form; try { form = await c.req.parseBody({ all: true }); } catch { return c.json({ error: 'Forventet multipart/form-data med file' }, 400); }
  const files = [form.file, form['files[]'], form.files, form.document].flat().filter((f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function').slice(0, 10);
  if (!files.length) return c.json({ error: 'Velg en fil (PDF, JPG, PNG eller HEIC)' }, 400);
  try {
    const docs = [];
    for (const f of files) docs.push(await upload(c.get('user'), f));
    return c.json(docs.length === 1 ? { doc: docs[0] } : { docs, doc: docs[docs.length - 1] }, 201);
  } catch (e) { return fail(c, e); }
};
for (const base of ['/study/documents', '/studie/docs']) {
  study44Api.post(base, authOrToken, noImp, postDocs);
  study44Api.get(base, authOrToken, (c) => c.json({ items: q('SELECT * FROM study44_docs WHERE user_id=? ORDER BY updated DESC').all(c.get('user')).map((r) => docOut(r)), kpi: kpiOf(c.get('user')) }));
  study44Api.get(`${base}/:id{[0-9]+}`, authOrToken, (c) => { const r = ofUser(c.get('user'), c.req.param('id')); return r ? c.json({ doc: docOut(r) }) : c.json({ error: 'Fant ikke dokumentet' }, 404); });
  study44Api.get(`${base}/:id{[0-9]+}/file`, authOrToken, (c) => {
    const r = ofUser(c.get('user'), c.req.param('id'));
    if (!r || !existsSync(fileOf(c.get('user'), r.id))) return c.json({ error: 'Fant ikke dokumentet' }, 404);
    const fname = r.filename.replace(/[^\w.\- ]/g, '_');
    return c.body(dec(readFileSync(fileOf(c.get('user'), r.id))), 200, { 'Content-Type': r.mime, 'Content-Disposition': `${c.req.query('download') === '1' ? 'attachment' : 'inline'}; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(r.filename)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); // prompt 45: CSP (frame-ancestors 'self') settes i index.js for file/thumb
  });
  // Prompt 45: miniatyr (bilde: originalen; PDF: side 1 som PNG) og «Prøv igjen» (hele kjeden på nytt fra originalfila).
  study44Api.get(`${base}/:id{[0-9]+}/thumb`, authOrToken, async (c) => {
    const r = ofUser(c.get('user'), c.req.param('id'));
    if (!r || !existsSync(fileOf(c.get('user'), r.id))) return c.json({ error: 'Fant ikke dokumentet' }, 404);
    const buf = dec(readFileSync(fileOf(c.get('user'), r.id)));
    const h = { 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' };
    if (/^image\/(jpeg|png|webp)$/.test(r.mime)) return c.body(buf, 200, { ...h, 'Content-Type': r.mime });
    if (r.mime === 'application/pdf') { const [p] = await pdfPages45(buf, { max: 1, dpi: 60 }).catch(() => []); if (p) return c.body(p, 200, { ...h, 'Content-Type': 'image/png' }); }
    return c.json({ error: 'Ingen miniatyr for denne filtypen' }, 404);
  });
  study44Api.post(`${base}/:id{[0-9]+}/reanalyze`, authOrToken, noImp, async (c) => {
    const u = c.get('user'), r = ofUser(u, c.req.param('id'));
    if (!r || !existsSync(fileOf(u, r.id))) return c.json({ error: 'Fant ikke dokumentet' }, 404);
    try {
      const { d, text } = await analyse(u, dec(readFileSync(fileOf(u, r.id))), r.mime, r.filename);
      q('UPDATE study44_docs SET kind=?, text_enc=?, parsed=?, updated=? WHERE id=?').run(d.kind, enc(Buffer.from(text ?? '')).toString('base64'), JSON.stringify(d), Date.now(), r.id);
      console.log(`study.reanalyze user=${u} id=${r.id} emner=${d.emner.length} how=${d.how}`);
      return c.json({ doc: docOut(ofUser(u, r.id)) });
    } catch (e) { console.warn(`[study] analyse feilet id=${r.id}: ${e.message}`); return fail(c, e); }
  });
  // Prompt 46: redigerbar tabell. PUT …/:id/courses {emner:[{kode, navn, sp, karakter, semester, standpunkt?, eksamen?}]} → {doc}
  // Koden validerer og regner snitt/sum på nytt (aldri modellen); rader som fortsatt er feil beholder «Sjekk».
  study44Api.put(`${base}/:id{[0-9]+}/courses`, authOrToken, noImp, async (c) => {
    const u = c.get('user'), r = ofUser(u, c.req.param('id'));
    if (!r) return c.json({ error: 'Fant ikke dokumentet' }, 404);
    const b = await c.req.json().catch(() => null);
    if (!b || !Array.isArray(b.emner)) return c.json({ error: 'Forventet {emner:[…]}' }, 400);
    const p = JSON.parse(r.parsed);
    const emner = cleanEdited46(b.emner).map((e) => ({ ...e, tone: toneOf(e.karakter) }));
    const a = averages44(emner), v = vgsAverage46(emner);
    const d = { ...p, emner, ...a, ...(v ? { snittVgs: { value: v.value, points: v.points, text: v.text } } : {}), edited: true, editedAt: new Date().toISOString() };
    d.spText = d.sp ? `${String(d.sp).replace('.', ',')} sp` : null;
    d.found = foundOf(d);
    d.checks = emner.filter((e) => e.check).length;
    if (p.validation?.total) d.validation = { ...p.validation, sum: a.sp, ok: Math.abs(p.validation.total - a.sp) < 0.05, diff: Math.round((p.validation.total - a.sp) * 10) / 10 };
    delete d.manual;
    Object.assign(d, statusOf45({ ...d, error: null }));
    if (d.checks && d.status !== 'failed') d.statusText = `${d.statusText} · ${d.checks} må sjekkes`;
    q('UPDATE study44_docs SET parsed=?, updated=? WHERE id=?').run(JSON.stringify(d), Date.now(), r.id);
    console.log(`study.edit user=${u} id=${r.id} emner=${emner.length} checks=${d.checks}`);
    return c.json({ doc: docOut(ofUser(u, r.id)) });
  });
  study44Api.delete(`${base}/:id{[0-9]+}`, authOrToken, noImp, (c) => {
    const r = ofUser(c.get('user'), c.req.param('id'));
    if (!r) return c.json({ error: 'Fant ikke dokumentet' }, 404);
    q('DELETE FROM study44_docs WHERE id=?').run(r.id);
    try { unlinkSync(fileOf(c.get('user'), r.id)); } catch { /* allerede borte */ }
    return c.json({ ok: true, id: r.id });
  });
  study44Api.post(`${base}/:id{[0-9]+}/ask`, authOrToken, async (c) => {
    const r = ofUser(c.get('user'), c.req.param('id'));
    if (!r) return c.json({ error: 'Fant ikke dokumentet' }, 404);
    try { return c.json(await ask(c.get('user'), r, (await c.req.json().catch(() => ({})))?.q)); } catch (e) { return fail(c, e); }
  });
  study44Api.post(`${base}/:id{[0-9]+}/apply`, authOrToken, noImp, (c) => { const r = ofUser(c.get('user'), c.req.param('id')); return r ? c.json(apply(c.get('user'), r)) : c.json({ error: 'Fant ikke dokumentet' }, 404); });
}
study44Api.get('/study/overview', authOrToken, async (c) => { try { const t = Date.parse(c.req.query('now') ?? ''); return c.json(await overview44(c.get('user'), Number.isFinite(t) ? t : Date.now())); } catch (e) { return fail(c, e); } });
