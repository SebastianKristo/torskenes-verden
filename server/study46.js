// Prompt 46 (SERVER46), claude-code-studie-vitnemal-lesing-2.md – Studie: Glimt klarer fortsatt ikke å lese vitnemål (andre gang).
//
// Hvorfor prompt 45 ikke løste det: alt gikk fortsatt gjennom LINJE-tolkere (parseCourses44/45) på `pdftotext -layout`-tekst, eller én
// visjonsmodell på en hel side. Ekte dokumenter er TABELLER:
//   - FS/Vitnemålsportalen (UiO, NTNU, UiB, OsloMet): Emnekode · Emnenavn · Semester · Karakter · Studiepoeng. Lange emnenavn brytes
//     over to linjer, «2022 VÅR» står i egen kolonne, studiepoeng med komma (7,5) – linjetolkeren mistet radene eller blandet kolonnene.
//   - Vitnemål fra videregående (Udir): Fag · Fagkode · Årstimer · Standpunkt · Eksamen skriftlig/muntlig. Årstimer (140, 393) ble lest
//     som studiepoeng eller stoppet tolkeren, og to karakterer per fag ble blandet.
//   - Skannede sider ble rendret i 150 dpi og lest som ren tekst; visjonsmodellen fikk hele A4-siden nedskalert + et langt skjema.
// Ny kjede (hver metode logges med tid, `method`: tekst | regler | ocr | visjon):
//   1. Tekst først: PDF med tekstlag → ord MED POSISJON (`pdftotext -bbox`). Rader fra y, kolonner fra x og tabelloverskriften.
//      Ingen AI for å lese tekst.
//   2. Kjente formater deterministisk (tableCourses46): kolonnetypene kjennes igjen på overskriften (emnekode/fagkode, emnenavn/fag,
//      semester/termin, karakter/resultat, studiepoeng/sp, standpunkt, eksamen skriftlig/muntlig, årstimer). Rader uten karakter blir
//      seksjoner («Fellesfag», «Programfag») eller fortsettelse av forrige emnenavn.
//   3. Skannet/bilde: sidene i 300 dpi → Tesseract TSV (ord med bokser, nor+eng) → samme tabellrekonstruksjon.
//   4. Visjon (reserve): siden deles i horisontale striper (full oppløsning, min. 1600 px bredde), ett kall per stripe med kort skjema
//      {rows:[{code,name,semester,grade,ects}]} og Ollama `format`. Slås sammen og valideres.
//   5. Koden regner (A=5 … E=1 vektet med sp; vgs: snitt av alle tallkarakterer, standpunkt og eksamen), aldri modellen.
//   6. Validering: karakter i gyldig sett, sp 0–60 per emne, sum mot totalen på dokumentet → «Sjekk» (check:true, checkReason).
// Hver rad har bbox {page, x0, y0, x1, y1} (0–1 av siden) så klienten kan markere raden i originalen.
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tool45, pdfPages45, heicToJpg45, parseCourses45 } from './study45.js';

const run = (cmd, args, timeout = 60_000) => new Promise((res, rej) => execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (e, out) => (e ? rej(e) : res(out))));
const tmp = async (fn) => { const dir = await mkdtemp(join(tmpdir(), 'st46-')); try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); } };
const ent = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const cap = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());

/* ---------------- 1. Ord med posisjon ---------------- */

/** `pdftotext -bbox` (HTML) → [{page, x0, y0, x1, y1, t, pw, ph}] (y nedover). */
export function parseBbox46(html) {
  const out = [];
  let page = 0, pw = 595, ph = 842;
  const re = /<page\s+width="([\d.]+)"\s+height="([\d.]+)"|<word\s+xMin="([\d.]+)"\s+yMin="([\d.]+)"\s+xMax="([\d.]+)"\s+yMax="([\d.]+)"\s*>([^<]*)<\/word>/g;
  let m;
  while ((m = re.exec(String(html ?? '')))) {
    if (m[1]) { page++; pw = +m[1]; ph = +m[2]; continue; }
    const t = ent(m[7]).trim();
    if (t) out.push({ page: page || 1, x0: +m[3], y0: +m[4], x1: +m[5], y1: +m[6], t, pw, ph });
  }
  return out;
}
/** Tesseract TSV → ord (nivå 5, conf ≥ 30). */
export function parseTsv46(tsv, page = 1, pw = 0, ph = 0) {
  const out = [];
  for (const line of String(tsv ?? '').split('\n').slice(1)) {
    const c = line.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const t = c.slice(11).join('\t').trim(), conf = +c[10];
    if (!t || conf < 30) continue;
    const x0 = +c[6], y0 = +c[7], w = +c[8], h = +c[9];
    out.push({ page, x0, y0, x1: x0 + w, y1: y0 + h, t, pw: pw || 2480, ph: ph || 3508, conf });
  }
  return out;
}
export async function pdfWords46(buf) {
  if (!(await tool45('pdftotext'))) return [];
  return tmp(async (dir) => {
    await writeFile(join(dir, 'in.pdf'), buf);
    try { await run('pdftotext', ['-bbox', '-enc', 'UTF-8', join(dir, 'in.pdf'), join(dir, 'out.html')], 30_000); } catch { return []; }
    return parseBbox46(await readFile(join(dir, 'out.html'), 'utf8').catch(() => ''));
  });
}
async function ocrWords46(img, page) {
  if (!(await tool45('tesseract'))) return [];
  return tmp(async (dir) => {
    const src = join(dir, 'in.png');
    await writeFile(src, img);
    const tsv = await run('tesseract', [src, 'stdout', '-l', 'nor+eng', '--psm', '6', '--dpi', '300', 'tsv'], 120_000).catch(() => run('tesseract', [src, 'stdout', '--psm', '6', 'tsv'], 120_000)).catch(() => '');
    return parseTsv46(tsv, page);
  });
}

/* ---------------- 2. Rader og celler ---------------- */

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
/** Ord → rader (per side, sortert ovenfra) med celler (ord som står tett slås sammen). */
export function rowsOf46(words) {
  const rows = [];
  const pages = [...new Set(words.map((w) => w.page))].sort((a, b) => a - b);
  for (const p of pages) {
    const ws = words.filter((w) => w.page === p).sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
    const h = median(ws.map((w) => w.y1 - w.y0)) || 10;
    const pr = [];
    for (const w of ws) {
      const yc = (w.y0 + w.y1) / 2;
      const r = pr.find((z) => Math.abs(z.yc - yc) <= h * 0.45);
      if (r) { r.words.push(w); r.yc = (r.yc * (r.words.length - 1) + yc) / r.words.length; } else pr.push({ page: p, yc, words: [w], h });
    }
    for (const r of pr.sort((a, b) => a.yc - b.yc)) {
      r.words.sort((a, b) => a.x0 - b.x0);
      const cells = [];
      for (const w of r.words) {
        const last = cells[cells.length - 1];
        const gap = last ? w.x0 - last.x1 : Infinity;
        if (last && gap <= Math.max(2, (w.y1 - w.y0) * 0.75)) { last.t += ` ${w.t}`; last.x1 = Math.max(last.x1, w.x1); last.y0 = Math.min(last.y0, w.y0); last.y1 = Math.max(last.y1, w.y1); }
        else cells.push({ t: w.t, x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 });
      }
      rows.push({ page: p, y: r.yc, h: r.h, pw: r.words[0].pw, ph: r.words[0].ph, cells, text: cells.map((c) => c.t).join('  ') });
    }
  }
  return rows;
}

/* ---------------- 3. Tabeller i kjente formater ---------------- */

const HEAD_TYPES = [
  ['code', /^(emne\s?kode|fag\s?kode|kode|emnenr|course\s?code)$/],
  ['name', /^(emnenavn|emne|emnetittel|fag|fagnavn|navn|tittel|course(\s?title)?)$/],
  ['semester', /^(semester|termin|vurderingssemester|eksamenssemester|periode|år|dato|eksamensdato|term)$/],
  ['grade', /^(karakter|resultat|vurdering|grade|bokstavkarakter)$/],
  ['sp', /^(studiepoeng|sp|stp|poeng|ects|credits|studie\s?poeng)$/],
  ['standpunkt', /^(standpunkt|standpunktkarakter|stp\.?\s?kar\.?)$/],
  ['exam', /^(eksamen|eksamens\s?karakter|eksamen\s?(skriftlig|muntlig|praktisk|muntlig-praktisk)|skriftlig|muntlig|praktisk)$/],
  ['hours', /^(års\s?timer|timer|timetall|uketimer|årstimer)$/],
];
const typeOf = (t) => { const s = String(t).toLowerCase().replace(/[.:*]/g, '').replace(/\s+/g, ' ').trim(); for (const [k, re] of HEAD_TYPES) if (re.test(s)) return k; return null; };
/** Overskriftsrad: ≥2 kjente kolonner, blant dem karakter/standpunkt og navn/kode. Celler med flere ord deles («Emnekode Emnenavn»). */
function headerOf(row) {
  const cols = [];
  for (const c of row.cells) {
    const whole = typeOf(c.t);
    if (whole) { cols.push({ type: whole, x0: c.x0, x1: c.x1, label: c.t }); continue; }
    // Celler som «Emnekode Emnenavn» (tett satt): del på ord og fordel bredden.
    const parts = c.t.split(/\s+/), types = parts.map(typeOf);
    if (parts.length > 1 && types.every(Boolean)) {
      const w = (c.x1 - c.x0) / parts.length;
      parts.forEach((p, i) => cols.push({ type: types[i], x0: c.x0 + i * w, x1: c.x0 + (i + 1) * w, label: p }));
    } else if (/^eksamen\b/i.test(c.t)) cols.push({ type: 'exam', x0: c.x0, x1: c.x1, label: c.t });
    else cols.push({ type: null, x0: c.x0, x1: c.x1, label: c.t });
  }
  const types = new Set(cols.map((c) => c.type).filter(Boolean));
  if (types.size < 2 || !(types.has('grade') || types.has('standpunkt')) || !(types.has('name') || types.has('code'))) return null;
  return cols.filter((c) => c.type);
}
const GRADE_RE = /^([A-F]|[1-6]|bestått|ikke bestått|godkjent|ikke godkjent|stryk|iv|ib|fritatt|fritak|deltatt|ikke møtt|passed|failed)$/i;
const normGrade = (g) => {
  const s = String(g ?? '').trim().replace(/\s+/g, ' ');
  if (/^[a-f]$/i.test(s)) return s.toUpperCase();
  if (/^[1-6]$/.test(s)) return s;
  if (/^passed$/i.test(s)) return 'Bestått';
  if (/^failed$/i.test(s)) return 'Ikke bestått';
  if (/^(iv|ib)$/i.test(s)) return s.toUpperCase();
  if (/^fritak$/i.test(s)) return 'Fritatt';
  return GRADE_RE.test(s) ? cap(s.toLowerCase()) : null;
};
const CODE_RE = /^[A-ZÆØÅ]{2,8}-?\d{2,5}[A-Z]{0,3}$/;
const SEM = /\b(?:(\d{4})\s*(HØST|VÅR|SOMMER|H|V)\b|(HØST|VÅR|SOMMER)\s*(\d{4})|([HV])(\d{2,4})\b)/i;
const semNorm = (s) => {
  const m = String(s ?? '').match(SEM);
  if (!m) { const y = String(s ?? '').match(/\b(19|20)\d{2}\b/); return y ? y[0] : null; }
  const y = m[1] ?? m[4] ?? m[6]; const t = String(m[2] ?? m[3] ?? m[5]).toUpperCase();
  return `${t.startsWith('H') ? 'Høst' : t.startsWith('V') ? 'Vår' : 'Sommer'} ${y.length === 2 ? `20${y}` : y}`;
};
const numOf = (s) => { const m = String(s ?? '').trim().match(/^(\d{1,3})(?:[.,](\d{1,2}))?$/); return m ? +`${m[1]}.${m[2] ?? 0}` : null; };
const TOTAL_RE = /\b(sum|totalt|i alt|samlet|total)\b/i;

/**
 * Rader → emner etter tabelloverskriftene. → {emner:[…], tables, total:{sp}|null, format:'fs'|'vgs'|null}
 * Hvert emne: {kode, navn, sp, karakter, semester, standpunkt?, eksamen?, eksamenMuntlig?, timer?, section?, check?, checkReason?, bbox, source:'tabell'}
 */
export function tableCourses46(rows) {
  const emner = [];
  let cols = null, section = null, tables = 0, total = null, format = null, last = null;
  const colAt = (cell) => {
    let best = null, bestOv = -Infinity;
    for (let i = 0; i < cols.length; i++) {
      const lo = i === 0 ? -Infinity : (cols[i - 1].x1 + cols[i].x0) / 2, hi = i === cols.length - 1 ? Infinity : (cols[i].x1 + cols[i + 1].x0) / 2;
      const ov = Math.min(hi, cell.x1) - Math.max(lo, cell.x0);
      if (ov > bestOv) { bestOv = ov; best = cols[i]; }
    }
    return best;
  };
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const h = headerOf(row);
    if (h) {
      cols = h; tables++; section = null; last = null;
      // Underoverskrift («skriftlig» / «muntlig» under «Eksamen»): neste rad med bare slike ord.
      const nx = rows[ri + 1];
      if (nx && nx.page === row.page && nx.cells.every((c) => /^(skriftlig|muntlig|praktisk|muntlig-praktisk)$/i.test(c.t))) {
        const exams = cols.filter((c) => c.type === 'exam');
        for (const c of nx.cells) {
          const tgt = exams.find((e) => c.x1 > e.x0 - 4 && c.x0 < e.x1 + 4 && !e.sub) ?? null;
          if (tgt) tgt.sub = c.t.toLowerCase();
          else cols.push({ type: 'exam', x0: c.x0, x1: c.x1, label: c.t, sub: c.t.toLowerCase() });
        }
        cols.sort((a, b) => a.x0 - b.x0);
        ri++;
      }
      format = cols.some((c) => c.type === 'standpunkt' || c.type === 'hours') ? 'vgs' : format ?? 'fs';
      continue;
    }
    if (!cols) continue;
    if (TOTAL_RE.test(row.cells[0]?.t ?? '') || /^(sum|totalt)\b/i.test(row.text)) {
      const n = row.cells.map((c) => numOf(c.t)).filter((x) => x != null && x > 0);
      if (n.length) total = { sp: n[n.length - 1] };
      continue;
    }
    const f = {};
    for (const c of row.cells) {
      const col = colAt(c);
      const key = col.type === 'exam' ? (col.sub === 'muntlig' ? 'examM' : col.sub === 'praktisk' ? 'examP' : 'exam') : col.type;
      f[key] = f[key] ? `${f[key]} ${c.t}` : c.t;
    }
    // Kode og navn i samme celle («IN1000 Introduksjon …»).
    if (!f.code && f.name) { const m = f.name.match(/^([A-ZÆØÅ]{2,8}-?\d{2,5}[A-Z]{0,3})\s+(.+)$/); if (m) { f.code = m[1]; f.name = m[2]; } }
    if (f.name && !f.grade && !f.standpunkt) { const m = f.name.match(/^(.+?)\s+([A-F])$/); if (m && f.sp) { f.name = m[1]; f.grade = m[2]; } }
    const grade = normGrade(f.grade) ?? null, stp = normGrade(f.standpunkt), ex = normGrade(f.exam), exM = normGrade(f.examM ?? f.examP);
    const hasData = grade || stp || ex || exM || numOf(f.sp) != null;
    const bbox = { page: row.page, x0: +(Math.min(...row.cells.map((c) => c.x0)) / row.pw).toFixed(4), y0: +(Math.min(...row.cells.map((c) => c.y0)) / row.ph).toFixed(4),
      x1: +(Math.max(...row.cells.map((c) => c.x1)) / row.pw).toFixed(4), y1: +(Math.max(...row.cells.map((c) => c.y1)) / row.ph).toFixed(4) };
    if (!hasData) {
      const t = String(f.name ?? row.text).trim();
      if (!t) continue;
      // Fortsettelse av forrige emnenavn (liten bokstav, rett under) eller en seksjon («Fellesfag»).
      if (last && /^[a-zæøå(]/.test(t) && row.page === last.bbox.page && (row.y - last._y) < row.h * 2.2) { last.navn = `${last.navn} ${t}`.slice(0, 160); last._y = row.y; last.bbox.y1 = bbox.y1; continue; }
      if (t.length <= 60 && !/\d{4}/.test(t)) section = t.replace(/:$/, '');
      continue;
    }
    const navn = String(f.name ?? '').trim();
    const kode = f.code && CODE_RE.test(f.code.trim().toUpperCase()) ? f.code.trim().toUpperCase() : null;
    const e = { kode, navn: cap(navn), sp: null, karakter: grade ?? stp ?? ex ?? exM, semester: f.semester ? semNorm(f.semester) : null, bbox, source: 'tabell', ...(section ? { section } : {}) };
    const checks = [];
    if (f.sp != null) {
      const v = numOf(f.sp);
      if (format === 'vgs' && v != null && v > 60) e.timer = v;
      else if (v == null) checks.push('Studiepoeng kunne ikke leses');
      else if (v < 0 || v > 60) checks.push('Studiepoeng utenfor 0–60');
      else e.sp = v;
    }
    if (f.hours) { const v = numOf(f.hours); if (v != null) e.timer = v; }
    if (stp) e.standpunkt = stp;
    if (ex) e.eksamen = ex;
    if (exM) e.eksamenMuntlig = exM;
    if (!e.karakter) checks.push('Mangler karakter');
    if (f.grade && !grade) checks.push(`Ukjent karakter «${f.grade}»`);
    if (f.code && !kode) checks.push(`Uvanlig emnekode «${f.code}»`);
    if (!navn || navn.length < 2) { if (kode) e.navn = kode; else checks.push('Mangler navn'); }
    if (checks.length) { e.check = true; e.checkReason = checks.join(' · '); }
    e._y = row.y;
    emner.push(e); last = e;
  }
  for (const e of emner) delete e._y;
  return { emner, tables, total, format };
}

/** Totalen som står på dokumentet («Sum studiepoeng 180», «Studiepoeng i alt: 180,0»). */
export function docTotal46(text) {
  const m = String(text ?? '').match(/(?:sum\s+studiepoeng|studiepoeng\s+(?:i\s+alt|totalt|sum)|totalt\s+antall\s+studiepoeng|totalt\s+studiepoeng|sum\s+sp)\s*[:.]?\s*(\d{1,3}(?:[.,]\d{1,2})?)/i);
  return m ? numOf(m[1]) : null;
}
/** Validering mot totalen: avvik → hele dokumentet får «Sjekk» på radene som mangler sp. → {sum, total, ok, diff} */
export function validate46(emner, total) {
  const sum = Math.round(emner.filter((e) => e.sp && !/^F$|ikke|stryk|^IB$/i.test(e.karakter ?? '')).reduce((a, e) => a + e.sp, 0) * 10) / 10;
  if (!total) return { sum, total: null, ok: null, diff: null };
  const diff = Math.round((total - sum) * 10) / 10;
  const ok = Math.abs(diff) < 0.05;
  if (!ok) for (const e of emner) if (!e.sp && !/^[1-6]$/.test(e.karakter ?? '')) { e.check = true; e.checkReason = [e.checkReason, `Summen (${sum}) stemmer ikke med ${total} sp på dokumentet`].filter(Boolean).join(' · '); }
  return { sum, total, ok, diff };
}

/* ---------------- 4. Visjon i striper (reserve) ---------------- */

export const ROWS_SCHEMA46 = { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, name: { type: 'string' }, semester: { type: 'string' }, grade: { type: 'string' }, ects: { type: 'number' } }, required: ['name', 'grade'] } } }, required: ['rows'] };
let stripeImpl = null;
/** Bare for tester: (stripeBuffer, user, i) → {rows:[…]}. */
export const _setStudyStripe46 = (fn) => { stripeImpl = fn; };
const stripeAi = () => stripeImpl ?? (process.env.MOCK_DATA === '1' ? null : async (img, user) => {
  const { run: aiRun } = await import('./ai-run.js');
  const out = await aiRun('rc', { user, images: [img], prompt: 'Dette er en stripe av en tabell fra et norsk vitnemål/karakterutskrift. Les hver rad som et emne: kode, navn, semester, karakter (A–F, 1–6, Bestått) og studiepoeng. Hopp over overskrifter. Svar KUN med JSON.', schema: ROWS_SCHEMA46, json: true, localOnly: true, numPredict: 700, title: 'Glimt · les vitnemål (stripe)', background: true });
  return out.data ?? JSON.parse(String(out.text).match(/\{[\s\S]*\}/)?.[0] ?? '{}');
});
/** Bilde → horisontale striper (ImageMagick), min. 1600 px bredde. → [Buffer] */
export async function stripes46(img, { parts = 10 } = {}) {
  const cmd = (await tool45('magick')) ? 'magick' : (await tool45('convert')) ? 'convert' : null;
  if (!cmd) return [img];
  return tmp(async (dir) => {
    await writeFile(join(dir, 'in.png'), img);
    const pct = Math.max(5, Math.round(100 / parts));
    try { await run(cmd, [join(dir, 'in.png'), '-resize', '1600x<', '-crop', `100%x${pct}%`, '+repage', join(dir, 's-%02d.png')], 60_000); } catch { return [img]; }
    const files = (await readdir(dir)).filter((f) => /^s-\d+\.png$/.test(f)).sort();
    return files.length ? Promise.all(files.map((f) => readFile(join(dir, f)))) : [img];
  });
}
async function visionRows46(images, user) {
  const ai = stripeAi();
  if (!ai) return [];
  const rows = [];
  let n = 0;
  for (const img of images.slice(0, 4)) {
    for (const s of await stripes46(img)) {
      if (n++ >= 24) break;
      try { const j = await ai(s, user, n); rows.push(...(Array.isArray(j?.rows) ? j.rows : [])); } catch (e) { console.warn(`[study] stripe ${n}: ${e.message}`); }
    }
  }
  const seen = new Set();
  return rows.map((r) => {
    const karakter = normGrade(r?.grade);
    const sp = Number.isFinite(+r?.ects) && +r.ects > 0 && +r.ects <= 60 ? +r.ects : null;
    const kode = r?.code && CODE_RE.test(String(r.code).trim().toUpperCase()) ? String(r.code).trim().toUpperCase() : null;
    const e = { kode, navn: cap(String(r?.name ?? '').trim().slice(0, 120)), sp, karakter, semester: r?.semester ? semNorm(r.semester) ?? String(r.semester).slice(0, 20) : null, source: 'visjon' };
    if (!karakter) { e.check = true; e.checkReason = `Ukjent karakter «${String(r?.grade ?? '').slice(0, 20)}»`; e.karakter = String(r?.grade ?? '').slice(0, 20) || null; }
    return e;
  }).filter((e) => { const k = `${e.kode ?? ''}|${e.navn.toLowerCase()}`; if (e.navn.length < 2 || seen.has(k)) return false; seen.add(k); return true; });
}

/* ---------------- Hele kjeden ---------------- */

const METHOD_LABEL = { tekst: 'tekstlaget', regler: 'kjent format', ocr: 'OCR', visjon: 'Glimt (bilde)' };
/**
 * Leser dokumentet. → {emner, method:'regler'|'tekst'|'ocr'|'visjon'|null, methodLabel, text, format, total, validation, steps:[{key,label,ms,ok}], images, notes}
 * Kaster aldri for «fant ingenting» – da er emner tom og klienten viser «Fyll inn selv».
 */
export async function readStudy46(buf, mime, { user = null, name = '' } = {}) {
  const steps = [], notes = [];
  const t = () => Date.now();
  let words = [], images = [], method = null, text = '';
  let t0 = t();
  if (mime === 'application/pdf') {
    words = await pdfWords46(buf);
    steps.push({ key: 'text', label: words.length ? 'Leser tekst …' : 'PDF-en har ikke tekstlag', ms: t() - t0, ok: words.length > 0 });
    if (words.length) method = 'tekst';
  }
  if (!words.length && (mime === 'application/pdf' || /^image\//.test(mime))) {
    t0 = t();
    if (mime === 'application/pdf') images = await pdfPages45(buf, { max: 4, dpi: 300 });
    else if (/heic|heif/.test(mime)) { const j = await heicToJpg45(buf); if (j) { images = [j]; notes.push('HEIC gjort om til JPG'); } }
    else images = [buf];
    for (let i = 0; i < images.length; i++) words.push(...(await ocrWords46(images[i], i + 1)));
    steps.push({ key: 'ocr', label: words.length ? `OCR leste ${words.length} ord` : 'OCR fant ingen tekst', ms: t() - t0, ok: words.length > 0 });
    if (words.length) method = 'ocr';
  }
  let emner = [], format = null, totalRow = null;
  if (words.length) {
    t0 = t();
    const rows = rowsOf46(words);
    text = rows.map((r) => r.text).join('\n');
    const tb = tableCourses46(rows);
    format = tb.format; totalRow = tb.total;
    if (tb.emner.length) { emner = tb.emner; if (method === 'tekst') method = 'regler'; }
    else {
      // Ingen tabelloverskrift: linjetolkeren på de rekonstruerte radene (kolonnene skilt med to mellomrom).
      emner = parseCourses45(text).map((e) => ({ ...e, source: 'linje' }));
    }
    steps.push({ key: 'courses', label: `Fant ${emner.length} ${emner.length === 1 ? 'emne' : 'emner'}`, ms: t() - t0, ok: emner.length > 0 });
  }
  if (!emner.length && images.length) {
    t0 = t();
    emner = await visionRows46(images, user);
    steps.push({ key: 'vision', label: emner.length ? `Glimt leste ${emner.length} rader (bilde i striper)` : 'Glimt kunne ikke lese bildet', ms: t() - t0, ok: emner.length > 0 });
    if (emner.length) method = 'visjon';
  }
  const total = totalRow?.sp ?? docTotal46(text);
  const validation = emner.length ? validate46(emner, total) : { sum: 0, total, ok: null, diff: null };
  console.log(`study.read method=${method ?? 'ingen'} format=${format ?? '-'} words=${words.length} emner=${emner.length} checks=${emner.filter((e) => e.check).length} ms=${steps.reduce((a, s) => a + s.ms, 0)} file=${String(name).slice(0, 40)}`);
  return { emner, method: emner.length ? method : null, methodLabel: METHOD_LABEL[method] ?? null, text, format, total, validation, steps, images, notes };
}

/** Snitt vgs med ALLE tallkarakterer (standpunkt og eksamen teller hver for seg). → {value, points, text, count} | null */
export function vgsAverage46(emner) {
  const g = [];
  for (const e of emner) for (const k of [e.standpunkt ?? (/^[1-6]$/.test(e.karakter ?? '') ? e.karakter : null), e.eksamen, e.eksamenMuntlig]) if (/^[1-6]$/.test(String(k ?? ''))) g.push(+k);
  if (!g.length) return null;
  const v = g.reduce((a, b) => a + b, 0) / g.length;
  return { value: Math.round(v * 100) / 100, points: Math.round(v * 10 * 10) / 10, count: g.length, text: `${String(Math.round(v * 100) / 100).replace('.', ',')} · ${String(Math.round(v * 100) / 10).replace('.', ',')} karakterpoeng` };
}

/** Redigerte rader fra klienten → validerte emner (check beholdes når noe fortsatt er galt). */
export function cleanEdited46(list) {
  return (Array.isArray(list) ? list : []).slice(0, 120).map((e) => {
    const karakter = normGrade(e?.karakter);
    const sp = e?.sp === null || e?.sp === '' || e?.sp === undefined ? null : numOf(String(e.sp).replace(/\s/g, ''));
    const kode = e?.kode ? String(e.kode).trim().toUpperCase().slice(0, 20) : null;
    const out = { kode, navn: cap(String(e?.navn ?? '').trim().slice(0, 160)), sp: sp != null && sp >= 0 && sp <= 60 ? sp : null, karakter: karakter ?? (String(e?.karakter ?? '').trim().slice(0, 20) || null),
      semester: e?.semester ? semNorm(e.semester) ?? String(e.semester).slice(0, 20) : null, source: 'manuell', edited: true,
      ...(normGrade(e?.standpunkt) ? { standpunkt: normGrade(e.standpunkt) } : {}), ...(normGrade(e?.eksamen) ? { eksamen: normGrade(e.eksamen) } : {}), ...(e?.bbox && typeof e.bbox === 'object' ? { bbox: e.bbox } : {}) };
    const checks = [];
    if (!karakter) checks.push('Mangler karakter');
    if (sp != null && (sp < 0 || sp > 60)) checks.push('Studiepoeng utenfor 0–60');
    if (kode && !CODE_RE.test(kode)) checks.push('Uvanlig emnekode');
    if (checks.length) { out.check = true; out.checkReason = checks.join(' · '); }
    return out;
  }).filter((e) => e.navn.length >= 2);
}
