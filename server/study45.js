// Prompt 45 (SERVER45): Studie – vitnemål ga ingen karakterer/fag + «Vis original» (claude-code-studie-vitnemal-analyse-original.md).
//
// Rotårsaker i kjeden opplasting → filtype → tekst → tolkning → lagring (prompt 44):
//   1. Containeren hadde verken pdftotext eller pdftoppm (poppler-utils manglet i Dockerfile). Da ble den innebygde PDF-leseren brukt, og den
//      kunne bare lese (literal)-strenger. Ekte vitnemål/utskrifter (Udir, FS/Studentweb) bruker innebygde skrifter med <hex>-strenger og
//      ToUnicode-tabeller → ingen tekst, eller søppel. Nå: poppler-utils i Dockerfile + pdfText45 som leser hex, ToUnicode (bfchar/bfrange),
//      objektstrømmer og grupperer tekstbitene i rader etter posisjon (tabeller blir linjer igjen).
//   2. Skannede PDF-er gikk til Tesseract som PDF (Tesseract leser ikke PDF) → feil. Nå: sidene rendres til PNG (pdftoppm), så OCR/visjon.
//   3. HEIC ble sendt rett til Tesseract (støttes ikke). Nå: HEIC → JPG (heif-convert / ImageMagick) først.
//   4. Tolkeren krevde «karakter sist»: FS-utskrifter har «… B 10» (karakter, så studiepoeng), og vitnemål har fagkoden ETTER navnet og to
//      karakterer (standpunkt + eksamen). Linjene ble hoppet over. Nå: parseLine45 finner kode, semester, karakterer og sp uansett rekkefølge.
//   5. Bilder: bare Tesseract. Nå: finner OCR ingen fag, leser den lokale visjonsmodellen (qwen2.5vl via ai-run → ai-gate, localOnly) bildet
//      med et JSON-skjema. Validering i koden (karakterskala, sp), snitt regnes aldri av modellen.
//   6. Tomt resultat ga en tom side. Nå: status ok|partial|failed, statusText («Fant 14 fag»), missing[] og fields med «Ikke funnet».
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const run = (cmd, args, timeout = 60_000, encoding = 'utf8') => new Promise((res, rej) => execFile(cmd, args, { timeout, maxBuffer: 32 * 1024 * 1024, encoding }, (e, out) => (e ? rej(e) : res(out))));
const has = new Map();
export async function tool45(cmd) {
  if (has.has(cmd)) return has.get(cmd);
  const ok = await run(cmd, cmd === 'pdftotext' || cmd === 'pdftoppm' ? ['-v'] : cmd === 'heif-convert' ? ['--version'] : ['-version'], 5000).then(() => true, (e) => e?.code !== 'ENOENT' && e?.code !== 127 && !/not found|ENOENT/i.test(e?.message ?? ''));
  has.set(cmd, ok);
  return ok;
}
export const _setTools45 = (m) => { has.clear(); for (const [k, v] of Object.entries(m ?? {})) has.set(k, v); };

/* ---------------- PDF: tekstlaget (uten poppler) ---------------- */

const latin = (b) => Buffer.from(b).toString('latin1');
function inflateMaybe(dict, data) { if (/\/FlateDecode|\/Fl\b/.test(dict)) { try { return inflateSync(data); } catch { try { return inflateSync(data.subarray(0, data.length - 1)); } catch { return null; } } } return /\/Filter/.test(dict) ? null : data; }
/** Alle objekter: nr → {dict, stream} (også fra objektstrømmer). */
function objectsOf(buf) {
  const s = latin(buf), out = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, end = s.indexOf('endobj', start);
    if (end < 0) break;
    const body = s.slice(start, end);
    const si = body.search(/stream\r?\n/);
    let dict = body, stream = null;
    if (si >= 0) {
      dict = body.slice(0, si);
      const off = start + si + body.slice(si).match(/^stream\r?\n/)[0].length;
      const lenM = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
      let e2 = s.indexOf('endstream', off);
      if (lenM && off + +lenM[1] <= s.length) e2 = Math.min(e2 < 0 ? Infinity : e2, off + +lenM[1]);
      stream = e2 > off ? inflateMaybe(dict, buf.subarray(off, e2)) : null;
    }
    out.set(+m[1], { dict, stream });
    re.lastIndex = end;
  }
  // Objektstrømmer (PDF 1.5+): fonter og ressurser ligger ofte her.
  for (const [, o] of [...out]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict) || !o.stream) continue;
    const n = +(o.dict.match(/\/N\s+(\d+)/)?.[1] ?? 0), first = +(o.dict.match(/\/First\s+(\d+)/)?.[1] ?? 0);
    const t = latin(o.stream), head = t.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n && i * 2 + 1 < head.length; i++) {
      const num = head[i * 2], a = first + head[i * 2 + 1], b = i + 1 < n ? first + head[i * 2 + 3] : t.length;
      if (!out.has(num)) out.set(num, { dict: t.slice(a, b), stream: null });
    }
  }
  return out;
}
const hex2bytes = (h) => { h = h.replace(/[^0-9a-f]/gi, ''); if (h.length % 2) h += '0'; return Buffer.from(h, 'hex'); };
const utf16 = (b) => { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; };
/** ToUnicode-CMap → {map:Map(kode-hex → tekst), bytes} */
export function parseCMap45(text) {
  const map = new Map(); let bytes = 1;
  const cs = text.match(/begincodespacerange\s*<([0-9a-f]+)>/i); if (cs) bytes = Math.max(1, Math.ceil(cs[1].length / 2));
  for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of blk[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]*)>/gi)) map.set(p[1].toLowerCase(), utf16(hex2bytes(p[2])));
  for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of blk[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]*>|\[[^\]]*\])/gi)) {
      const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16), w = p[1].length;
      if (hi - lo > 5000) continue;
      if (p[3].startsWith('[')) { const arr = [...p[3].matchAll(/<([0-9a-f]*)>/gi)].map((x) => utf16(hex2bytes(x[1]))); for (let c = lo; c <= hi; c++) if (arr[c - lo] != null) map.set(c.toString(16).padStart(w, '0'), arr[c - lo]); }
      else { const base = hex2bytes(p[3].slice(1, -1)); for (let c = lo; c <= hi; c++) { const b = Buffer.from(base); b[b.length - 1] += c - lo; map.set(c.toString(16).padStart(w, '0'), utf16(b)); } }
    }
  }
  return { map, bytes };
}
const unescLit = (x) => x.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (a, b) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[b] ?? (/^[0-7]+$/.test(b) ? String.fromCharCode(parseInt(b, 8)) : '')));
const WIN = { 0x80: '€', 0x82: '‚', 0x84: '„', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' };
function decodeStr(bytes, font) {
  if (font?.cmap?.map.size) {
    const w = font.cmap.bytes, h = bytes.toString('hex');
    let s = '';
    for (let i = 0; i < h.length; i += w * 2) { const k = h.slice(i, i + w * 2); s += font.cmap.map.get(k) ?? (w === 1 ? String.fromCharCode(parseInt(k, 16)) : ''); }
    return s;
  }
  let s = ''; for (const b of bytes) s += WIN[b] ?? String.fromCharCode(b); return s;
}
/** Tekstlaget i en PDF, gruppert i linjer etter y-posisjon (tabeller blir rader). */
export function pdfText45(buf) {
  const objs = objectsOf(buf);
  const cmaps = new Map(); // objnr → cmap
  const fontObj = new Map(); // fontobj-nr → {cmap}
  for (const [n, o] of objs) if (o.stream) { const t = latin(o.stream); if (/beginbf(char|range)/.test(t)) cmaps.set(n, parseCMap45(t)); }
  for (const [n, o] of objs) if (/\/Type\s*\/Font\b/.test(o.dict) || /\/BaseFont/.test(o.dict)) { const tu = o.dict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/); fontObj.set(n, { cmap: tu ? cmaps.get(+tu[1]) ?? null : null }); }
  const names = new Map(); // /F1 → font
  const fontDicts = [];
  for (const [, o] of objs) {
    for (const m of o.dict.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) fontDicts.push(m[1]);
    for (const m of o.dict.matchAll(/\/Font\s+(\d+)\s+\d+\s+R/g)) { const d = objs.get(+m[1]); if (d) fontDicts.push(d.dict); }
  }
  for (const d of fontDicts) for (const m of d.matchAll(/\/([\w.+-]+)\s+(\d+)\s+\d+\s+R/g)) if (fontObj.has(+m[2])) names.set(m[1], fontObj.get(+m[2]));
  const pages = [];
  for (const [, o] of objs) {
    if (!o.stream || /\/(Type\s*\/(XObject|ObjStm|XRef|Metadata)|Subtype\s*\/(Image|Type1C|CIDFontType0C|OpenType))/.test(o.dict)) continue;
    const t = latin(o.stream);
    if (!/\bBT\b/.test(t) || !/T[jJ]/.test(t)) continue;
    const frags = [];
    let font = null, x = 0, y = 0, lx = 0, ly = 0, lead = 0, sx = 1, sy = 1;
    const tok = /\/([\w.+-]+)\s+[-\d.]+\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|([-\d.]+)\s+([-\d.]+)\s+T[dD]|([-\d.]+)\s+TL|T\*|\bBT\b|\[((?:\\.|[^\]\\])*)\]\s*TJ|\(((?:\\.|[^)\\])*)\)\s*(?:Tj|'|")|<([0-9a-fA-F\s]*)>\s*(?:Tj|'|")/g;
    let k;
    const push = (str) => { const v = str.replace(/[\u0000-\u0008\u000b-\u001f]/g, ''); if (v.trim()) frags.push({ x: lx, y: ly, t: v }); lx += v.length * 4 * sx; };
    while ((k = tok.exec(t))) {
      if (k[1]) font = names.get(k[1]) ?? null;
      else if (k[2] !== undefined) { sx = Math.abs(+k[2]) || 1; sy = Math.abs(+k[5]) || 1; x = +k[6]; y = +k[7]; lx = x; ly = y; }
      else if (k[8] !== undefined) { x += +k[8] * sx; y += +k[9] * sy; lx = x; ly = y; if (/TD$/.test(k[0])) lead = -+k[9]; }
      else if (k[10] !== undefined) lead = +k[10];
      else if (k[0] === 'T*') { y -= lead * sy; x = x; lx = x; ly = y; }
      else if (k[0] === 'BT') { x = 0; y = 0; lx = 0; ly = 0; }
      else if (k[11] !== undefined) {
        let s = '';
        for (const p of k[11].matchAll(/\(((?:\\.|[^)\\])*)\)|<([0-9a-fA-F\s]*)>|(-?\d+(?:\.\d+)?)/g)) {
          if (p[1] != null) s += decodeStr(Buffer.from(unescLit(p[1]), 'latin1'), font);
          else if (p[2] != null) s += decodeStr(hex2bytes(p[2]), font);
          else if (+p[3] < -180) s += ' ';
        }
        push(s);
      } else if (k[12] !== undefined) push(decodeStr(Buffer.from(unescLit(k[12]), 'latin1'), font));
      else if (k[13] !== undefined) push(decodeStr(hex2bytes(k[13]), font));
    }
    if (!frags.length) continue;
    // Rader: samme y (±2) → én linje, sortert etter x.
    const rows = [];
    for (const f of frags.sort((a, b) => b.y - a.y || a.x - b.x)) { const r = rows.find((z) => Math.abs(z.y - f.y) <= 2.5); if (r) r.items.push(f); else rows.push({ y: f.y, items: [f] }); }
    pages.push(rows.sort((a, b) => b.y - a.y).map((r) => r.items.sort((a, b) => a.x - b.x).map((f) => f.t.trim()).join('  ')).join('\n'));
  }
  return pages.join('\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

/* ---------------- Tolkning: norske vitnemål og karakterutskrifter ---------------- */

const CODE = /^[A-ZÆØÅ]{2,8}-?\d{2,5}[A-Z]{0,2}$/;
const LETTER = /^[A-F]$/;
const WORDGRADE = /^(bestått|godkjent|stryk|ib|iv|fritatt|deltatt)$/i;
const SPV = /^\d{1,2}(?:[.,]\d{1,2})?$/;
const HEAD = /^(karakter|karakterer|emne|emnekode|emnenavn|fag|fagkode|kode|sum|totalt|snitt|gjennomsnitt|side|dato|semester|studiepoeng|standpunkt|eksamen|vurdering|resultat|fødselsnummer|fødselsdato|navn|student|elev|studieprogram|program|skole|år|termin)\b/i;
const SEM_RE = /\b(?:(\d{4})\s*(HØST|VÅR|SOMMER|H|V)|(HØST|VÅR|SOMMER)\s*(\d{4})|([HV])(\d{2,4}))\b/i;
const cap = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());
const semText = (m) => { if (!m) return null; const y = m[1] ?? m[4] ?? m[6]; let t = (m[2] ?? m[3] ?? m[5] ?? '').toUpperCase(); t = t.startsWith('H') ? 'Høst' : t.startsWith('V') ? 'Vår' : 'Sommer'; const yy = y.length === 2 ? `20${y}` : y; return `${t} ${yy}`; };
/** Én linje → emne eller null. Kode, semester, karakter(er) og studiepoeng i hvilken som helst rekkefølge. */
export function parseLine45(raw) {
  let line = String(raw ?? '').replace(/\t+/g, '  ').replace(/[|;]/g, '  ').trim();
  if (!line || line.length > 220 || /:\s/.test(line.slice(0, 30)) && !CODE.test(line.split(/\s+/)[0])) return null;
  const sm = line.match(SEM_RE);
  const semester = semText(sm);
  if (sm) line = (line.slice(0, sm.index) + '  ' + line.slice(sm.index + sm[0].length)).trim();
  line = line.replace(/\bikke\s+bestått\b/gi, 'IKKE_BESTÅTT').replace(/\bikke\s+godkjent\b/gi, 'IKKE_GODKJENT').replace(/\bikke\s+møtt\b/gi, 'IKKE_MØTT');
  let toks = line.split(/\s+/).filter(Boolean);
  let kode = null;
  const ci = toks.findIndex((t) => CODE.test(t.replace(/[.,]$/, '')) && /\d/.test(t));
  if (ci >= 0) { kode = toks[ci].replace(/[.,]$/, ''); toks.splice(ci, 1); }
  const grades = [], nums = [];
  while (toks.length) {
    const t = toks[toks.length - 1];
    if (LETTER.test(t)) { grades.unshift(t); toks.pop(); continue; }
    if (WORDGRADE.test(t) || /^IKKE_(BESTÅTT|GODKJENT|MØTT)$/.test(t)) { grades.unshift(t); toks.pop(); continue; }
    if (SPV.test(t)) { nums.unshift(t); toks.pop(); continue; }
    if (t === '-' || t === '–') { toks.pop(); continue; }
    break;
  }
  if (nums.length > 4 || grades.length > 3) return null;
  // «Fysikk 2 6», «Kjemi 1 5»: nivået hører til fagnavnet (vgs-fag med nivå 1/2), ikke en karakter.
  if (!kode && !grades.length && nums.length >= 2 && /^[12]$/.test(nums[0]) && /(fysikk|kjemi|biologi|geofag|matematikk|informasjonsteknologi|programmering|økonomistyring|markedsføring|entreprenørskap|sosiologi|psykologi|rettslære|teknologi og forskningslære|historie og filosofi|politikk og menneskerettigheter)$/i.test(toks.join(' '))) toks.push(nums.shift());
  let karakter = null, sp = null, standpunkt = null, eksamen = null;
  const isSp = (n) => /[.,]/.test(n) || +n > 6;
  if (grades.length) {
    karakter = grades[0];
    const spn = nums.find((n) => +String(n).replace(',', '.') > 0 && +String(n).replace(',', '.') <= 60);
    if (spn) sp = +spn.replace(',', '.');
  } else {
    // Ingen bokstav: tall 1–6 er karakterer (vgs: standpunkt og eksamen), tall med desimal / over 6 er studiepoeng.
    const g = nums.filter((n) => /^[1-6]$/.test(n)), s = nums.filter(isSp);
    if (!g.length) return null;
    if (!kode && g.length === nums.length && g.length > 3) return null;
    standpunkt = g[0]; eksamen = g[1] ?? null; karakter = standpunkt;
    if (s.length) sp = +s[0].replace(',', '.');
  }
  const navn = toks.join(' ').replace(/\s+/g, ' ').replace(/^[-–•·\d.)\s]+/, '').trim();
  if (!navn || navn.length < 3 || !/[a-zæøå]{2}/i.test(navn) || HEAD.test(navn) || /^(postboks|telefon|tlf|org\.?nr|adresse)\b/i.test(navn)) return null;
  if (!kode && LETTER.test(karakter) && sp == null && navn.split(' ').length < 2) return null;
  if (/^\d/.test(navn) && !kode) return null;
  const k = karakter.replace(/^IKKE_BESTÅTT$/, 'Ikke bestått').replace(/^IKKE_GODKJENT$/, 'Ikke godkjent').replace(/^IKKE_MØTT$/, 'Ikke møtt');
  return { kode, navn: cap(navn), sp, karakter: LETTER.test(k) ? k : /^[1-6]$/.test(k) ? k : cap(k.toLowerCase()), semester, ...(standpunkt ? { standpunkt } : {}), ...(eksamen ? { eksamen } : {}) };
}
export function parseCourses45(text) {
  const seen = new Set(), out = [];
  for (const l of String(text ?? '').split(/\r?\n/)) {
    const e = parseLine45(l);
    if (!e) continue;
    const key = `${(e.kode ?? '').toLowerCase()}|${e.navn.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(e);
  }
  return out;
}

/* ---------------- Tekst fra fila ---------------- */

const tmp = async (fn) => { const dir = await mkdtemp(join(tmpdir(), 'st45-')); try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); } };
/** HEIC → JPG (heif-convert eller ImageMagick). → Buffer | null */
export async function heicToJpg45(buf) {
  return tmp(async (dir) => {
    const src = join(dir, 'in.heic'), dst = join(dir, 'out.jpg');
    await writeFile(src, buf);
    for (const [cmd, args] of [['heif-convert', [src, dst]], ['magick', [src, dst]], ['convert', [src, dst]]]) {
      if (!(await tool45(cmd))) continue;
      try { await run(cmd, args, 60_000); return await readFile(dst); } catch { /* neste */ }
    }
    return null;
  });
}
/** PDF-sider → PNG-er (maks 4 sider, 150 dpi). → [Buffer] */
export async function pdfPages45(buf, { max = 4, dpi = 150 } = {}) {
  if (!(await tool45('pdftoppm'))) return [];
  return tmp(async (dir) => {
    await writeFile(join(dir, 'in.pdf'), buf);
    try { await run('pdftoppm', ['-r', String(dpi), '-png', '-f', '1', '-l', String(max), join(dir, 'in.pdf'), join(dir, 'p')], 90_000); } catch { return []; }
    const files = (await readdir(dir)).filter((f) => /^p-?\d+\.png$/.test(f)).sort();
    return Promise.all(files.map((f) => readFile(join(dir, f))));
  });
}
async function ocr(img) {
  if (!(await tool45('tesseract'))) return '';
  return tmp(async (dir) => { const src = join(dir, 'in.png'); await writeFile(src, img); return run('tesseract', [src, 'stdout', '-l', 'nor+eng', '--psm', '6']).catch(() => run('tesseract', [src, 'stdout', '--psm', '6'])).catch(() => ''); });
}
/**
 * Tekst fra dokumentet. → {text, how:'pdf'|'ocr'|'tekst', images:[Buffer] (til visjonsmodellen), notes:[tekst]}
 * Kaster {status} med en tydelig melding når ingenting kan leses.
 */
export async function extract45(buf, mime, name) {
  const notes = [];
  if (/^text\//.test(mime) || /\.txt$/i.test(name)) return { text: buf.toString('utf8'), how: 'tekst', images: [], notes };
  if (mime === 'application/pdf') {
    if (await tool45('pdftotext')) {
      const t = await tmp(async (dir) => { await writeFile(join(dir, 'in.pdf'), buf); return run('pdftotext', ['-layout', '-enc', 'UTF-8', join(dir, 'in.pdf'), '-'], 30_000).catch(() => ''); });
      if (t.replace(/\s/g, '').length > 40) return { text: t, how: 'pdf', images: [], notes };
    }
    let t = '';
    try { t = pdfText45(buf); } catch (e) { notes.push(`PDF-leseren: ${e.message}`); }
    if (t.replace(/\s/g, '').length > 40) return { text: t, how: 'pdf', images: [], notes };
    // Skannet PDF: sidene som bilder → OCR (og visjonsmodellen hvis OCR ikke gir fag).
    const pages = await pdfPages45(buf);
    if (!pages.length) throw Object.assign(new Error('PDF-en har ikke tekstlag, og serveren kan ikke gjøre sidene om til bilder (poppler-utils mangler). Last opp et bilde av dokumentet i stedet.'), { status: 422 });
    const parts = []; for (const p of pages) parts.push(await ocr(p));
    return { text: parts.join('\n'), how: 'ocr', images: pages, notes: [...notes, `Skannet PDF: ${pages.length} ${pages.length === 1 ? 'side' : 'sider'} lest som bilde`] };
  }
  if (/^image\//.test(mime)) {
    let img = buf;
    if (/heic|heif/.test(mime)) {
      img = await heicToJpg45(buf);
      if (!img) throw Object.assign(new Error('Kunne ikke lese HEIC-bildet (heif-convert/ImageMagick mangler). Lagre bildet som JPG og prøv igjen.'), { status: 422 });
      notes.push('HEIC gjort om til JPG');
    }
    return { text: await ocr(img), how: 'ocr', images: [img], notes };
  }
  throw Object.assign(new Error('Filtypen støttes ikke. Bruk PDF, JPG, PNG eller HEIC.'), { status: 415 });
}

/** JSON-skjemaet visjonsmodellen må følge. */
export const STUDY_SCHEMA45 = { type: 'object', properties: { institution: { type: 'string' }, student: { type: 'string' }, date: { type: 'string' }, program: { type: 'string' },
  emner: { type: 'array', items: { type: 'object', properties: { kode: { type: 'string' }, navn: { type: 'string' }, sp: { type: 'number' }, karakter: { type: 'string' }, semester: { type: 'string' }, standpunkt: { type: 'string' }, eksamen: { type: 'string' } }, required: ['navn', 'karakter'] } } }, required: ['emner'] };
const GRADE_OK = /^([A-F]|[1-6]|Bestått|Ikke bestått|Godkjent|Ikke godkjent|Stryk|IB|Fritatt|Deltatt)$/i;
/** Validerer modellens emner (karakterskala, sp, lengder). */
export function cleanAiCourses45(list) {
  return (Array.isArray(list) ? list : []).slice(0, 80).map((e) => {
    let k = String(e?.karakter ?? e?.standpunkt ?? '').trim();
    if (/^[a-f]$/.test(k)) k = k.toUpperCase();
    k = /^[1-6]$|^[A-F]$/.test(k) ? k : cap(k.toLowerCase());
    const sp = Number.isFinite(+e?.sp) && +e.sp > 0 && +e.sp <= 60 ? +e.sp : null;
    return { kode: e?.kode && CODE.test(String(e.kode).trim().toUpperCase()) ? String(e.kode).trim().toUpperCase() : null, navn: cap(String(e?.navn ?? '').trim().slice(0, 120)), sp, karakter: k,
      semester: e?.semester ? String(e.semester).slice(0, 20) : null, ...(e?.standpunkt && /^[1-6]$/.test(String(e.standpunkt)) ? { standpunkt: String(e.standpunkt) } : {}), ...(e?.eksamen && /^[1-6]$/.test(String(e.eksamen)) ? { eksamen: String(e.eksamen) } : {}) };
  }).filter((e) => e.navn.length >= 2 && GRADE_OK.test(e.karakter));
}

/** Status og «Ikke funnet»-felt for visningen. */
export function statusOf45(d) {
  const n = d.emner?.length ?? 0;
  const missing = [];
  if (!d.institution) missing.push('skole');
  if (!d.date) missing.push('dato');
  if (!d.student) missing.push('navn');
  if (!n) missing.push('fag');
  const nf = 'Ikke funnet';
  return { status: d.error ? 'failed' : n ? (missing.length ? 'partial' : 'ok') : 'failed',
    statusText: d.error ? d.error : n ? `Fant ${n} ${n === 1 ? 'fag' : 'fag'}` : 'Fant ingen fag eller karakterer',
    missing, fields: { institution: d.institution ?? nf, student: d.student ?? nf, program: d.program ?? nf, date: d.date ?? nf, sp: d.sp ? d.spText ?? `${d.sp} sp` : nf, snitt: d.snitt?.text ?? d.snittVgs?.text ?? nf } };
}
