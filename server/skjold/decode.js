// Prompt 77 (SKJAISRV): rene funksjoner for Skjold Lab-forslagene – dekodere og normalisering (ingen I/O, ingen modell).
//   - Motstand fra fargebånd (3, 4, 5 og 6 bånd; norske og engelske fargenavn; leses baklengs når gull/sølv står først).
//   - SMD-motstandskoder (103, 1002, 4R7, R47, EIA-96 «01C») og kondensatorkoder (104, 229, 4n7, 2u2, toleransebokstav J/K/M).
//   - Enheter og verdier: «10k» → «10 kΩ», «0.1uF» → «100 nF», «1/4W» → «¼ W», «M3x10» → «M3 × 10», «3.3v» → «3,3 V».
//   - Navnemalen «Type Verdi Variant» («Motstand 10 kΩ ¼ W», «Skrue M3 × 10 umbraco», «LED 5 mm rød»).
//   - Kategorier: velg blant brukerens egne (synonymgrupper), ellers standardlisten; ny bare når ingen passer.
// Modellen regner aldri ut verdier: den oppgir fargene/koden, og verdien regnes ut her.

/* ---------------- Tall og prefiks ---------------- */

/** Norsk tallformat: maks 4 gjeldende sifre, komma som desimaltegn, ingen eksponent. */
export function fmtNum77(n) {
  if (!Number.isFinite(n)) return '';
  let s = String(Number(n.toPrecision(4)));
  if (/e/i.test(s)) s = Number(n.toPrecision(4)).toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}
const PFX = { p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };
const PSYM = { p: 'p', n: 'n', u: 'µ', m: 'm', '': '', k: 'k', M: 'M', G: 'G' };
/** Velger prefiks slik at tallet blir 1–999 (innenfor de tillatte prefiksene). */
function withPrefix(v, unit, allowed) {
  if (v === 0) return `0 ${unit}`;
  const a = Math.abs(v);
  let pick = allowed[0];
  for (const p of allowed) if (a / PFX[p] >= 0.99999) pick = p;
  return `${fmtNum77(v / PFX[pick])} ${PSYM[pick]}${unit}`;
}
/** Ohm → «10 kΩ», «4,7 kΩ», «1 MΩ», «0,47 Ω», «10 mΩ». */
export const fmtOhm77 = (v) => (Math.abs(v) < 0.1 && v !== 0 ? withPrefix(v, 'Ω', ['m']) : withPrefix(v, 'Ω', ['', 'k', 'M', 'G']));
/** Farad → pF/nF/µF (aldri mF: «1000 µF»). */
export const fmtFarad77 = (v) => withPrefix(v, 'F', ['p', 'n', 'u']);
export const fmtHenry77 = (v) => withPrefix(v, 'H', ['n', 'u', 'm', '']);
const FRACT = [[0.0625, '1/16'], [0.125, '⅛'], [0.25, '¼'], [0.5, '½'], [0.75, '¾']];
/** Watt → «¼ W», «½ W», «2 W», «250 mW» (vanlige brøker som tegn). */
export function fmtWatt77(v) {
  const f = FRACT.find(([x]) => Math.abs(x - v) < 1e-9);
  if (f) return `${f[1]} W`;
  return withPrefix(v, 'W', ['m', '', 'k']);
}
const UNIT_FMT = {
  R: fmtOhm77, C: fmtFarad77, L: fmtHenry77, W: fmtWatt77,
  V: (v) => withPrefix(v, 'V', ['m', '', 'k']), A: (v) => withPrefix(v, 'A', ['u', 'm', '']), Hz: (v) => withPrefix(v, 'Hz', ['', 'k', 'M', 'G']),
  mAh: (v) => `${fmtNum77(v)} mAh`,
};

/* ---------------- Verdier med enhet ---------------- */

const fold = (s) => String(s ?? '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').normalize('NFD').replace(/[̀-ͯ]/g, '');
const UNIT_KIND = (u) => {
  const x = u.toLowerCase();
  if (/^(ω|ohms?|r)$/.test(x)) return 'R';
  if (x === 'f' || x === 'fd' || x === 'farad') return 'C';
  if (x === 'h') return 'L';
  if (x === 'v' || x === 'vdc' || x === 'vac') return 'V';
  if (x === 'a') return 'A';
  if (x === 'w') return 'W';
  if (x === 'hz') return 'Hz';
  if (x === 'mah') return 'mAh';
  return null;
};
/**
 * Tolker én verdi med valgfri enhet. kind er et hint ('R' motstand, 'C' kondensator, 'L' spole, 'V', 'A', 'W', 'Hz') for tall uten enhet.
 * Støtter «10k», «4k7», «4R7», «R47», «0.1uF», «100n», «4n7», «2u2», «1M», «1meg», «3.3V», «1/4W», «500mA», «16MHz», «2000mAh».
 * → {kind, si, text} | null
 */
export function parseValue77(input, kind = null) {
  let s = String(input ?? '').trim().replace(/\s+/g, '').replace(/[µμ]/g, 'u').replace(/[Ωω]/g, 'Ω').replace(/,/g, '.');
  if (!s) return null;
  s = s.replace(/^±/, '');
  // Brøk-watt: 1/4W, 1/8 w
  let m = s.match(/^(\d+)\/(\d+)(w)?$/i);
  if (m && (m[3] || kind === 'W') && +m[2]) return finish('W', +m[1] / +m[2]);
  const fr = { '¼': 0.25, '½': 0.5, '⅛': 0.125, '¾': 0.75 }[s.replace(/w$/i, '')];
  if (fr && (/w$/i.test(s) || kind === 'W')) return finish('W', fr);
  // MFD/uFD = mikrofarad (gamle kondensatorer)
  m = s.match(/^(\d+(?:\.\d+)?)(?:mfd|ufd|uf)$/i);
  if (m) return finish('C', +m[1] * 1e-6);
  // «meg» = mega (motstand)
  m = s.match(/^(\d+(?:\.\d+)?)meg(?:Ω|ohms?)?$/i);
  if (m) return finish('R', +m[1] * 1e6);
  // R-notasjon / prefiks som desimaltegn: 4k7, 4R7, R47, 1M5, 4n7, 2u2, p47 (valgfri enhet etter)
  m = s.match(/^(\d*)([rRkKmMgGpPnNuU])(\d+)(Ω|ohms?|f|h)?$/);
  if (m && (m[1] || /[rRpPnNuU]/.test(m[2]))) {
    const L = m[2];
    const num = Number(`${m[1] || '0'}.${m[3]}`);
    if (/[rR]/.test(L)) return finish('R', num);
    if (/[pPnNuU]/.test(L)) {
      const k = m[4] && /h/i.test(m[4]) ? 'L' : kind === 'L' ? 'L' : 'C';
      return finish(k, num * PFX[L.toLowerCase()]);
    }
    if (/[kK]/.test(L)) return finish(kind && kind !== 'R' ? kind : 'R', num * 1e3);
    if (/[gG]/.test(L)) return finish(kind && kind !== 'R' ? kind : 'R', num * 1e9);
    return finish('R', num * 1e6); // 1M5 = 1,5 MΩ
  }
  // Tall + prefiks + enhet
  m = s.match(/^(\d+(?:\.\d+)?|\.\d+)([pnumkKMG]?)(Ω|ohms?|r|fd|f|farad|h|vdc|vac|v|a|w|hz|mah)?$/i);
  if (!m) {
    m = s.match(/^(\d+(?:\.\d+)?|\.\d+)(mah)$/i);
    if (!m) return null;
  }
  const num = Number(m[1]);
  let pre = m[2] ?? '', unit = m[3] ?? '';
  if (/^mah$/i.test(unit)) return finish('mAh', num);
  if (/^mah$/i.test(pre + unit)) return finish('mAh', num);
  let k = unit ? UNIT_KIND(unit) : kind;
  if (/^hz$/i.test(unit)) k = 'Hz';
  if (!k) {
    if (/[pnu]/i.test(pre) && !/[kKMG]/.test(pre)) k = 'C';
    else return null;
  }
  // m/M: mega for motstand uten eksplisitt «mΩ», ellers milli; K/k = kilo; U = mikro.
  let mult;
  if (pre === '') mult = 1;
  else if (pre === 'k' || pre === 'K') mult = 1e3;
  else if (pre === 'G') mult = 1e9;
  else if (pre === 'M') mult = k === 'R' || k === 'Hz' || k === 'V' ? 1e6 : k === 'C' ? 1e-6 : 1e6;
  else if (pre === 'm') mult = k === 'R' && !unit ? 1e6 : 1e-3;
  else mult = PFX[pre.toLowerCase()] ?? 1;
  if (k === 'Hz' && pre === 'm') mult = 1e6; // 16mhz = 16 MHz (ingen bruker millihertz)
  return finish(k, num * mult);
}
function finish(kind, si) {
  if (!Number.isFinite(si) || si < 0) return null;
  const f = UNIT_FMT[kind];
  return { kind, si: Number(si.toPrecision(12)), text: f ? f(si) : fmtNum77(si) };
}
/** Normalisert tekst for en verdi («10k» → «10 kΩ»); ukjent → ryddet original. */
export function normValue77(s, kind = null) {
  const raw = String(s ?? '').trim();
  if (!raw) return '';
  const p = parseValue77(raw, kind);
  if (p) return p.text;
  // Flere verdier («100nF 50V»): normaliser hvert ord for seg.
  const parts = raw.split(/\s+/);
  if (parts.length > 1) return parts.map((w) => parseValue77(w, null)?.text ?? w).join(' ');
  return raw;
}

/* ---------------- Motstand: fargebånd ---------------- */

const COLOR = {
  svart: 0, sort: 0, black: 0, brun: 1, brown: 1, rod: 2, red: 2, oransje: 3, orange: 3, gul: 4, yellow: 4, gronn: 5, green: 5,
  bla: 6, blue: 6, fiolett: 7, lilla: 7, violet: 7, purple: 7, gra: 8, grey: 8, gray: 8, hvit: 9, white: 9,
  gull: 'gull', gold: 'gull', solv: 'solv', silver: 'solv', rosa: 'rosa', pink: 'rosa', ingen: 'ingen', none: 'ingen',
};
const NB_NAME = ['svart', 'brun', 'rød', 'oransje', 'gul', 'grønn', 'blå', 'fiolett', 'grå', 'hvit'];
const NB = (c) => (typeof c === 'number' ? NB_NAME[c] : { gull: 'gull', solv: 'sølv', rosa: 'rosa', ingen: 'ingen' }[c]);
const MULT = { gull: 0.1, solv: 0.01, rosa: 0.001 };
const TOL = { 1: 1, 2: 2, 3: 0.05, 4: 0.02, 5: 0.5, 6: 0.25, 7: 0.1, 8: 0.05, gull: 5, solv: 10, ingen: 20 };
const TEMPCO = { 0: 250, 1: 100, 2: 50, 3: 15, 4: 25, 5: 20, 6: 10, 7: 5, 8: 1 };
/** Fargenavn (norsk/engelsk, «rød»/«red»/«Rod») → siffer 0–9 | 'gull' | 'solv' | 'rosa' | 'ingen' | null. */
export function colorOf77(name) {
  const k = fold(name).replace(/[^a-z]/g, '');
  return k in COLOR ? COLOR[k] : null;
}
/** «5» → «5 %», 0.5 → «0,5 %». */
export const fmtPct77 = (n) => `${fmtNum77(n)} %`;

/**
 * Motstandsverdi fra fargebånd (3–6 bånd, eller ett svart = 0 Ω). Leses baklengs når gull/sølv står først.
 * → {ohms, value:'10 kΩ', tolerance:'5 %', tempco?:'100 ppm/K', bands:['brun','svart','oransje','gull'], text:'10 kΩ 5 %'} | {error}
 */
export function resistorFromBands77(bands) {
  const list = (Array.isArray(bands) ? bands : String(bands ?? '').split(/[\s,;\-–/]+/)).map((x) => String(x).trim()).filter(Boolean);
  if (!list.length) return { error: 'Ingen fargebånd' };
  let c = list.map(colorOf77);
  const bad = list.find((_, i) => c[i] == null);
  if (bad) return { error: `Ukjent farge «${bad}»` };
  if (c.length === 1) return c[0] === 0 ? { ohms: 0, value: '0 Ω', tolerance: null, bands: ['svart'], text: '0 Ω (bro)' } : { error: 'Ett bånd må være svart (0 Ω)' };
  if (c.length > 6) return { error: 'For mange bånd (maks 6)' };
  if (typeof c[0] !== 'number' && typeof c.at(-1) === 'number') c = [...c].reverse();
  const n = c.length;
  const digits = n === 3 || n === 4 ? 2 : 3;
  const ds = c.slice(0, digits);
  if (ds.some((d) => typeof d !== 'number')) return { error: 'Sifferbåndene må være vanlige farger (ikke gull/sølv)' };
  const mc = c[digits];
  const mult = typeof mc === 'number' ? 10 ** mc : MULT[mc];
  if (mult == null) return { error: 'Ugyldig multiplikatorbånd' };
  const tc = n >= 4 ? c[digits + 1] : 'ingen';
  const tol = TOL[tc];
  if (tol == null) return { error: `Ugyldig toleransebånd (${NB(tc)})` };
  const ohms = Number((Number(ds.join('')) * mult).toPrecision(12));
  const out = { ohms, value: fmtOhm77(ohms), tolerance: fmtPct77(tol), bands: c.map(NB) };
  if (n === 6) { const t = TEMPCO[c[5]]; if (t == null) return { error: 'Ugyldig temperaturbånd' }; out.tempco = `${t} ppm/K`; }
  out.text = `${out.value} ${out.tolerance}`;
  return out;
}

/* ---------------- SMD-motstand og kondensatorkoder ---------------- */

const EIA96 = [100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191,
  196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392,
  402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806,
  825, 845, 866, 887, 909, 931, 953, 976];
const EIA_MULT = { Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1, A: 1, B: 10, H: 10, C: 100, D: 1e3, E: 1e4, F: 1e5 };
/**
 * SMD-motstandskode: «103» (3 siffer), «1002» (4 siffer), «4R7»/«R47»/«2R2» (R = komma), «0»/«000» (0 Ω), «01C» (EIA-96).
 * → {ohms, value, code, system} | {error}
 */
export function smdCode77(code) {
  const s = String(code ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/Ω|OHM$/, '');
  if (!s) return { error: 'Tom kode' };
  const ok = (ohms, system) => ({ ohms: Number(ohms.toPrecision(12)), value: fmtOhm77(ohms), code: s, system });
  if (/^0+$/.test(s)) return ok(0, '0 Ω (bro)');
  let m = s.match(/^(\d*)R(\d*)$/);
  if (m && (m[1] || m[2])) return ok(Number(`${m[1] || '0'}.${m[2] || '0'}`), 'R-notasjon');
  m = s.match(/^(\d*)([KM])(\d+)$/);
  if (m && m[1]) return ok(Number(`${m[1]}.${m[3]}`) * (m[2] === 'K' ? 1e3 : 1e6), 'R-notasjon');
  m = s.match(/^(\d{2})([ZYXSABHCDEF])$/);
  if (m) { const i = Number(m[1]); if (i < 1 || i > 96) return { error: 'EIA-96-koden må være 01–96' }; return ok(EIA96[i - 1] * EIA_MULT[m[2]], 'EIA-96'); }
  m = s.match(/^(\d{2,3})(\d)$/);
  if (m) return ok(Number(m[1]) * 10 ** Number(m[2]), m[1].length === 2 ? '3 siffer' : '4 siffer');
  return { error: `Ukjent SMD-kode «${s}»` };
}
const CAP_TOL = { B: '±0,1 pF', C: '±0,25 pF', D: '±0,5 pF', F: '1 %', G: '2 %', J: '5 %', K: '10 %', M: '20 %', Z: '+80/−20 %' };
/**
 * Kondensatorkode: «104» = 100 nF, «103» = 10 nF, «229» = 2,2 pF (8 → ×0,01, 9 → ×0,1), «47» = 47 pF, «4n7», «2u2», «p47»,
 * med valgfri toleransebokstav («104K» = 100 nF 10 %) og spenning («104K50V»/«104 50V»).
 * → {farads, value, tolerance?, voltage?, code} | {error}
 */
export function capCode77(code) {
  let s = String(code ?? '').trim().replace(/\s+/g, '').replace(/[µμ]/g, 'u');
  if (!s) return { error: 'Tom kode' };
  let voltage = null;
  const vm = s.match(/(\d+(?:[.,]\d+)?)V$/i);
  if (vm && vm.index > 0) { voltage = `${fmtNum77(Number(vm[1].replace(',', '.')))} V`; s = s.slice(0, vm.index); }
  let tolerance = null;
  const tm = s.match(/^(.*\d)([BCDFGJKMZ])$/);
  if (tm && !/[pnu]$/i.test(tm[1])) { tolerance = CAP_TOL[tm[2]]; s = tm[1]; }
  const ok = (f) => ({ farads: Number(f.toPrecision(12)), value: fmtFarad77(f), ...(tolerance ? { tolerance } : {}), ...(voltage ? { voltage } : {}), code: String(code).trim() });
  let m = s.match(/^(\d*)([pnu])(\d*)$/i);
  if (m && (m[1] || m[3])) return ok(Number(`${m[1] || '0'}.${m[3] || '0'}`) * PFX[m[2].toLowerCase()]);
  m = s.match(/^(\d+(?:[.,]\d+)?)([pnu])f?$/i);
  if (m) return ok(Number(m[1].replace(',', '.')) * PFX[m[2].toLowerCase()]);
  m = s.match(/^(\d)(\d)(\d)$/);
  if (m) {
    const e = Number(m[3]);
    if (e === 7) return { error: 'Ugyldig multiplikator 7 i kondensatorkoden' };
    const mult = e === 8 ? 0.01 : e === 9 ? 0.1 : 10 ** e;
    return ok(Number(`${m[1]}${m[2]}`) * mult * 1e-12);
  }
  m = s.match(/^(\d{1,2})$/);
  if (m) return ok(Number(m[1]) * 1e-12);
  return { error: `Ukjent kondensatorkode «${String(code).trim()}»` };
}

/* ---------------- Skruer ---------------- */

/** «M3x10», «m3 x 10mm», «M2.5*6», «M4-20» → {thread:'M3', length:'10 mm', text:'M3 × 10'}; «m3» → {thread:'M3', text:'M3'}. */
export function screw77(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/\bm\s?(\d+(?:[.,]\d+)?)\s*(?:[x×*]|-(?=\s*\d))\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\b/i);
  if (m) {
    const th = `M${fmtNum77(Number(m[1].replace(',', '.')))}`, len = fmtNum77(Number(m[2].replace(',', '.')));
    return { thread: th, length: `${len} mm`, text: `${th} × ${len}` };
  }
  m = t.match(/\bm\s?(\d+(?:[.,]\d+)?)\b/i);
  if (m && Number(m[1].replace(',', '.')) <= 64) { const th = `M${fmtNum77(Number(m[1].replace(',', '.')))}`; return { thread: th, text: th }; }
  return null;
}

/* ---------------- Fritekst-normalisering ---------------- */

/** Normaliserer verdier i et navn/fritekst: «10k» → «10 kΩ» (kind='R'), «0.1uF» → «100 nF», «M3x10» → «M3 × 10», «1/4w» → «¼ W». */
export function normText77(s, kind = null) {
  let t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t.replace(/\bm\s?(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)(?:\s*mm\b)?/gi, (all) => screw77(all)?.text ?? all);
  t = t.replace(/(?<![\w/])(\d+\/\d+)\s*w\b/gi, (all, f) => parseValue77(`${f}W`)?.text ?? all);
  // Verdier som eget ord (med valgfri enhet). Rene tall endres ikke (kan være modellnummer).
  t = t.replace(/(?<![\w.,-])(\d+(?:[.,]\d+)?\s?(?:meg|[pnuµμmkKMG])?\s?(?:Ω|ohms?|uF|nF|pF|µF|μF|mF|F|mH|uH|µH|H|mV|V|mA|A|mW|W|kHz|MHz|GHz|Hz|mAh)|\d+[rRkKmM]\d+|\d+(?:[.,]\d+)?[kKM]|\d+(?:[.,]\d+)?[pnuµμ][fF]?)(?![\w])/g, (all) => {
    const compact = all.replace(/\s+/g, '');
    if (/^\d+[mM]\d+$/.test(compact) && kind !== 'R') return all;
    const p = parseValue77(compact, kind);
    return p ? p.text : all;
  });
  // Stor forbokstav i første ord, ellers som den er.
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------------- Typer og kategorier ---------------- */

export const DEFAULT_CATEGORIES77 = ['Motstander', 'Kondensatorer', 'Dioder og LED', 'Transistorer', 'IC-er', 'Mikrokontrollere', 'Sensorer', 'Moduler',
  'Kontakter', 'Kabler', 'Skruer og bolter', 'Mutre og skiver', 'Avstandsstykker', 'Brytere', 'Sikringer', 'Verktøy', 'Diverse'];

// [kanonisk type, standardkategori, verdi-type, regex over foldet tekst (type/navn)]
const TYPES = [
  ['Motstand', 'Motstander', 'R', /\b(motstand\w*|resistor\w*|resistans|potensiometer|potmeter|trimpot)\b|\d\s?(?:k|m)?\s?(ohm|Ω)/],
  ['Kondensator', 'Kondensatorer', 'C', /\b(kondensator\w*|capacitor\w*|elektrolytt\w*|elko|tantal\w*|keramisk kondensator|mlcc|\d+(?:[.,]\d+)?\s?[pnuµ]f)\b/],
  ['Spole', 'Diverse', 'L', /\b(spole\w*|induktor\w*|inductor\w*|drossel\w*|\d+\s?[uµm]h)\b/],
  ['LED', 'Dioder og LED', null, /\b(led|leds|lysdiode\w*|ws2812\w*|neopixel|sk6812)\b/],
  ['Diode', 'Dioder og LED', null, /\b(diode\w*|zener\w*|schottky|1n4\d{3}|1n58\d{2}|likeretter\w*)\b/],
  ['Transistor', 'Transistorer', null, /\b(transistor\w*|mosfet\w*|bjt|igbt|2n\d{4}|bc\d{3}|irf\w+|ao3400|tip\d+)\b/],
  ['Mikrokontroller', 'Mikrokontrollere', null, /\b(esp32\w*|esp8266|esp-\w+|arduino\w*|atmega\w*|attiny\w*|stm32\w*|rp2040|rp2350|raspberry pi pico|pico|mikrokontroller\w*|microcontroller\w*|wemos|d1 mini|nodemcu|teensy)\b/],
  ['Sensor', 'Sensorer', null, /\b(sensor\w*|dht\d+|bme\d+|bmp\d+|ds18b20|mpu\d+|hc-sr\d+|pir|ldr|termistor\w*|ntc)\b/],
  ['IC', 'IC-er', null, /\b(ic|ic-er|krets\w*|ne555|555|lm\d+\w*|74hc\w+|74ls\w+|cd40\w+|op-?amp|regulator\w*|ams1117|lm7805|78\d\d)\b/],
  ['Modul', 'Moduler', null, /\b(modul\w*|module|breakout|shield|hat|driver\w*|relemodul|relay module|oled|display|skjerm)\b/],
  ['Kontakt', 'Kontakter', null, /\b(kontakt\w*|connector\w*|plugg\w*|header\w*|stiftlist\w*|jst\w*|dupont|xt60|xt30|usb-c|terminal\w*|rekkeklemme\w*|kabelsko|krympesko)\b/],
  ['Kabel', 'Kabler', null, /\b(kabel\w*|ledning\w*|wire|awg|krympestromp\w*|jumper\w*)\b/],
  ['Avstandsstykke', 'Avstandsstykker', null, /\b(avstand\w*|standoff\w*|spacer\w*|distanse\w*)\b/],
  ['Skrue', 'Skruer og bolter', null, /\b(skrue\w*|screw\w*|bolt\w*|maskinskrue\w*|unbrako|umbraco|treskrue\w*)\b/],
  ['Mutter', 'Mutre og skiver', null, /\b(mutter\w*|mutre\w*|nut|nuts|skive\w*|washer\w*|nylonmutter\w*|innpressmutter\w*|insert\w*)\b/],
  ['Bryter', 'Brytere', null, /\b(bryter\w*|switch\w*|knapp\w*|button\w*|vippebryter\w*|trykknapp\w*|rele\w*|relay)\b/],
  ['Sikring', 'Sikringer', null, /\b(sikring\w*|fuse\w*|polyfuse|ptc)\b/],
  ['Verktøy', 'Verktøy', null, /\b(verktoy|tang|skrutrekker\w*|loddebolt\w*|multimeter|pinsett|kniv|tool\w*)\b/],
];
const TYPE_ALIAS = { resistor: 'Motstand', motstand: 'Motstand', capacitor: 'Kondensator', kondensator: 'Kondensator', elektrolytt: 'Kondensator', inductor: 'Spole',
  led: 'LED', diode: 'Diode', transistor: 'Transistor', mosfet: 'Transistor', microcontroller: 'Mikrokontroller', mikrokontroller: 'Mikrokontroller', mcu: 'Mikrokontroller',
  sensor: 'Sensor', ic: 'IC', chip: 'IC', module: 'Modul', modul: 'Modul', connector: 'Kontakt', kontakt: 'Kontakt', cable: 'Kabel', kabel: 'Kabel', wire: 'Kabel', ledning: 'Kabel',
  screw: 'Skrue', skrue: 'Skrue', bolt: 'Skrue', nut: 'Mutter', mutter: 'Mutter', washer: 'Mutter', skive: 'Mutter', standoff: 'Avstandsstykke', spacer: 'Avstandsstykke',
  avstandsstykke: 'Avstandsstykke', switch: 'Bryter', bryter: 'Bryter', button: 'Bryter', knapp: 'Bryter', fuse: 'Sikring', sikring: 'Sikring', tool: 'Verktøy', verktoy: 'Verktøy' };
/** Kanonisk type fra modellens/brukerens tekst. → {type, category, kind} | null */
export function typeOf77(text) {
  const f = fold(text);
  if (!f.trim()) return null;
  const first = f.trim().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
  const alias = TYPE_ALIAS[first] ?? TYPE_ALIAS[first.replace(/(er|ene|s)$/, '')];
  if (alias) { const t = TYPES.find((x) => x[0] === alias); return { type: alias, category: t[1], kind: t[2] }; }
  for (const [type, category, kind, re] of TYPES) if (re.test(f)) return { type, category, kind };
  return null;
}

// Synonymgrupper for kategorier: en eksisterende kategori «Skruer» passer til «Skruer og bolter», «LED» til «Dioder og LED» osv.
const CAT_GROUPS = [
  ['motstand', 'motstander', 'resistor', 'resistorer', 'resistors', 'potensiometer'], ['kondensator', 'kondensatorer', 'capacitor', 'capacitors', 'elko', 'elektrolytt'],
  ['dioder og led', 'diode', 'dioder', 'led', 'leder', 'lysdioder', 'leds'], ['transistor', 'transistorer', 'mosfet', 'transistors'], ['ic', 'ic-er', 'icer', 'kretser', 'integrerte kretser', 'chips'],
  ['mikrokontroller', 'mikrokontrollere', 'microcontrollers', 'mcu', 'utviklingskort', 'dev boards'], ['sensor', 'sensorer', 'sensors'], ['modul', 'moduler', 'modules', 'breakout'],
  ['kontakt', 'kontakter', 'connectors', 'kabelsko', 'plugger', 'terminaler'], ['kabel', 'kabler', 'ledning', 'ledninger', 'cables', 'wire'], ['skrue', 'skruer', 'skruer og bolter', 'bolter', 'screws'],
  ['mutter', 'mutre', 'mutre og skiver', 'skiver', 'muttere', 'nuts'], ['avstandsstykke', 'avstandsstykker', 'standoffs', 'distanser'], ['bryter', 'brytere', 'switcher', 'knapper', 'switches'],
  ['sikring', 'sikringer', 'fuses'], ['verktoy', 'tools'], ['diverse', 'annet', 'misc', 'ukjent'],
];
const catKey = (s) => fold(s).replace(/[^a-z0-9\- ]/g, '').replace(/\s+/g, ' ').trim();
const groupOf = (s) => { const k = catKey(s); const i = CAT_GROUPS.findIndex((g) => g.includes(k)); return i < 0 ? null : i; };
/** Finner kategorien blant listen (eksakt, så synonymgruppe, så prefiks). → kategorinavnet fra listen | null */
export function matchCategory77(name, list) {
  const k = catKey(name);
  if (!k || !Array.isArray(list)) return null;
  const exact = list.find((c) => catKey(c) === k);
  if (exact) return exact;
  const g = groupOf(name);
  if (g != null) { const hit = list.find((c) => groupOf(c) === g); if (hit) return hit; }
  const stem = (x) => x.replace(/(ene|er|ar|e|s)$/, '');
  const hit = list.find((c) => { const a = stem(catKey(c)), b = stem(k); return a.length >= 3 && b.length >= 3 && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)); });
  return hit ?? null;
}
/**
 * Velger kategori: modellens forslag eller typens standardkategori, blant brukerens egne (userCats).
 * Har brukeren ingen, brukes standardlisten. Ny bare når ingen passer. → {category, categoryNew}
 */
export function chooseCategory77(proposed, typeCategory, userCats = []) {
  const own = (userCats ?? []).filter(Boolean);
  for (const cand of [proposed, typeCategory]) { const hit = cand && matchCategory77(cand, own); if (hit) return { category: hit, categoryNew: false }; }
  const pool = DEFAULT_CATEGORIES77;
  for (const cand of [typeCategory, proposed]) { const hit = cand && matchCategory77(cand, pool); if (hit) return { category: hit, categoryNew: true }; }
  const clean = String(proposed ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (clean) return { category: clean.charAt(0).toUpperCase() + clean.slice(1), categoryNew: true };
  const div = matchCategory77('Diverse', own);
  return div ? { category: div, categoryNew: false } : { category: 'Diverse', categoryNew: true };
}

/* ---------------- Specs ---------------- */

const SPEC_KEYS = {
  verdi: ['verdi', 'value', 'resistans', 'resistance', 'kapasitans', 'capacitance', 'induktans', 'inductance', 'ohm'],
  toleranse: ['toleranse', 'tolerance', 'tol'], effekt: ['effekt', 'power', 'watt', 'wattage', 'power rating'], pakke: ['pakke', 'package', 'kapsel', 'footprint', 'case', 'hus'],
  spenning: ['spenning', 'voltage', 'volt', 'maks spenning', 'max voltage', 'rated voltage'], 'strøm': ['strom', 'current', 'maks strom'],
  gjenger: ['gjenger', 'gjenge', 'thread', 'gjengetype', 'thread size'], lengde: ['lengde', 'length'], diameter: ['diameter', 'storrelse', 'size', 'dia'],
  farge: ['farge', 'color', 'colour'], hode: ['hode', 'head', 'hodetype', 'head type', 'drive', 'drev'], materiale: ['materiale', 'material'],
  frekvens: ['frekvens', 'frequency', 'klokke'], kapasitet: ['kapasitet', 'capacity'], brikke: ['brikke', 'chip', 'mcu', 'soc'], flash: ['flash'],
  tverrsnitt: ['tverrsnitt', 'gauge', 'awg', 'cross section'], polaritet: ['polaritet', 'polarity'], kanaler: ['kanaler', 'channels'], grensesnitt: ['grensesnitt', 'interface', 'bus', 'protokoll'],
  'bølgelengde': ['bolgelengde', 'wavelength'], type: ['type', 'variant'],
};
const KEY_OF = new Map(Object.entries(SPEC_KEYS).flatMap(([k, al]) => al.map((a) => [a, k])));
const COLOR_NB = { red: 'rød', green: 'grønn', blue: 'blå', yellow: 'gul', white: 'hvit', black: 'svart', orange: 'oransje', purple: 'lilla', violet: 'fiolett', pink: 'rosa',
  grey: 'grå', gray: 'grå', warm: 'varmhvit', 'warm white': 'varmhvit', 'cold white': 'kaldhvit', rgb: 'RGB', uv: 'UV', ir: 'IR', clear: 'klar', transparent: 'klar', brown: 'brun' };
const PKG = [[/^(0201|0402|0603|0805|1206|1210|2010|2512)$/, (x) => x], [/^sot-?(\d+(?:-\d+)?)$/i, (x, m) => `SOT-${m[1]}`], [/^to-?(\d+\w*)$/i, (x, m) => `TO-${m[1].toUpperCase()}`],
  [/^(dip|pdip|soic|sop|ssop|tssop|qfn|qfp|lqfp|tqfp|bga|sod)-?(\d+\w*)$/i, (x, m) => `${m[1].toUpperCase()}-${m[2].toUpperCase()}`], [/^(tht|through[- ]?hole|hullmontert|gjennomhull)$/i, () => 'THT'], [/^smd$/i, () => 'SMD']];
/** Normaliserer én spec-verdi etter nøkkelen. */
export function normSpecValue77(key, v, kind = null) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!s) return '';
  switch (key) {
    case 'verdi': return normValue77(s, kind);
    case 'toleranse': { const m = s.replace(',', '.').match(/^±?\s*(\d+(?:\.\d+)?)\s*%?$/); return m ? fmtPct77(Number(m[1])) : s; }
    case 'effekt': return parseValue77(s, 'W')?.text ?? s;
    case 'spenning': return parseValue77(s, 'V')?.text ?? normValue77(s);
    case 'strøm': return parseValue77(s, 'A')?.text ?? s;
    case 'frekvens': return parseValue77(s, 'Hz')?.text ?? s;
    case 'gjenger': return screw77(s)?.thread ?? s.toUpperCase();
    case 'lengde': case 'diameter': { const m = s.replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/i); return m ? `${fmtNum77(Number(m[1]))} ${(m[2] ?? 'mm').toLowerCase()}` : s; }
    case 'farge': { const f = fold(s); return COLOR_NB[f] ?? s.toLowerCase(); }
    case 'pakke': { for (const [re, fn] of PKG) { const m = s.match(re); if (m) return fn(s, m); } return s; }
    case 'kapasitet': return parseValue77(s)?.text ?? s;
    default: return s;
  }
}
/** Specs-objekt med kjente nøkler (verdi, toleranse, effekt, pakke, spenning, gjenger, lengde …) og normaliserte verdier. Maks 20. */
export function normSpecs77(specs, kind = null) {
  const out = {};
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return out;
  for (const [k0, v] of Object.entries(specs)) {
    if (v == null || typeof v === 'object') continue;
    const fk = fold(k0).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!fk) continue;
    const key = KEY_OF.get(fk) ?? fk.slice(0, 40);
    const val = normSpecValue77(key, String(v), kind);
    if (val && !(key in out)) out[key] = val;
    if (Object.keys(out).length >= 20) break;
  }
  return out;
}

/* ---------------- Navnemalen ---------------- */

/** «Type Verdi Variant» med enkle mellomrom. */
export const buildName77 = (type, value, variant) => [type, value, variant].map((x) => String(x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ').slice(0, 120);

/** Typeetikett i navnet (undertype for kondensatorer: «Elektrolytt», «Keramisk kondensator», «Tantalkondensator»). */
function typeLabel(type, rawType, text) {
  const f = fold(`${rawType ?? ''} ${text ?? ''}`);
  if (type === 'Kondensator') {
    if (/elektrolytt|elko|electrolytic/.test(f)) return 'Elektrolytt';
    if (/keramisk|ceramic|mlcc/.test(f)) return 'Keramisk kondensator';
    if (/tantal/.test(f)) return 'Tantalkondensator';
    if (/film/.test(f)) return 'Filmkondensator';
  }
  if (type === 'Mutter' && /skive|washer/.test(f) && !/mutter|nut\b/.test(f)) return 'Skive';
  if (type === 'Diode' && /zener/.test(f)) return 'Zenerdiode';
  return type;
}

/**
 * Lager det endelige forslaget fra modellens (eller heuristikkens) rådata. Verdier fra fargebånd/koder regnes ut her.
 * raw = {type, name, value?, variant?, category?, specs?, tags?, bands?, code?, confidence?, why?}
 * → {name, category, categoryNew, specs, tags, confidence, why, type, decoded?}
 */
export function finalize77(raw, { userCats = [], text = '', baseSpecs = null } = {}) {
  const r = raw ?? {};
  let t = typeOf77(r.type) ?? typeOf77(`${r.name ?? ''}`) ?? typeOf77(text);
  const decoded = {};
  if (Array.isArray(r.bands) && r.bands.length) {
    const d = resistorFromBands77(r.bands);
    if (!d.error) { decoded.resistor = d; if (!t || t.type !== 'Motstand') t = typeOf77('motstand'); }
  }
  if (r.code && String(r.code).trim()) {
    const code = String(r.code).trim();
    if (!t || t.type === 'Motstand') { const d = smdCode77(code); if (!d.error) { decoded.smd = d; t = t ?? typeOf77('motstand'); } }
    if (!decoded.smd && (!t || t.type === 'Kondensator')) { const d = capCode77(code); if (!d.error) { decoded.cap = d; t = t ?? typeOf77('kondensator'); } }
  }
  const kind = t?.kind ?? null;
  const specs = { ...normSpecs77(baseSpecs, kind), ...normSpecs77(r.specs, kind) }; // brukerens specs beholdes, modellens går foran
  if (r.value && !specs.verdi && kind) specs.verdi = normValue77(r.value, kind);
  if (decoded.resistor) { specs.verdi = decoded.resistor.value; specs.toleranse = decoded.resistor.tolerance; if (decoded.resistor.tempco) specs.tempko = decoded.resistor.tempco; }
  if (decoded.smd) specs.verdi = decoded.smd.value;
  if (decoded.cap) { specs.verdi = decoded.cap.value; if (decoded.cap.tolerance) specs.toleranse = decoded.cap.tolerance; if (decoded.cap.voltage && !specs.spenning) specs.spenning = decoded.cap.voltage; }
  // Skruer: gjenger/lengde fra navnet når de mangler.
  const sc = screw77(`${r.value ?? ''} ${r.name ?? ''} ${text}`);
  if (t && ['Skrue', 'Mutter', 'Avstandsstykke'].includes(t.type) && sc) {
    if (!specs.gjenger) specs.gjenger = sc.thread;
    if (sc.length && !specs.lengde && t.type !== 'Mutter') specs.lengde = sc.length;
  }
  const variant = normText77(r.variant ?? '', kind).replace(/^./, (c) => c.toLowerCase());
  let name;
  const label = t ? typeLabel(t.type, r.type, `${r.name ?? ''} ${text}`) : null;
  if (t && (t.type === 'Motstand' || t.type === 'Kondensator' || t.type === 'Spole') && specs.verdi) {
    const v2 = variant || (t.type === 'Motstand' ? specs.effekt ?? '' : t.type === 'Kondensator' ? specs.spenning ?? '' : '');
    name = buildName77(label, specs.verdi, v2);
  } else if (t && ['Skrue', 'Avstandsstykke'].includes(t.type) && specs.gjenger) {
    const n = specs.lengde ? `${specs.gjenger} × ${specs.lengde.replace(/\s*mm$/, '')}` : specs.gjenger;
    name = buildName77(label, n, variant || (specs.hode ? String(specs.hode).toLowerCase() : ''));
  } else if (t && t.type === 'Mutter' && specs.gjenger) {
    name = buildName77(label, specs.gjenger, variant);
  } else if (t && t.type === 'LED' && (specs.diameter || specs.farge) && !/ws2812|sk6812|stripe|strip|neopixel/i.test(`${r.name ?? ''} ${text}`)) {
    name = buildName77('LED', specs.diameter ?? '', [specs.farge, variant].filter(Boolean).join(' '));
  } else {
    name = normText77(r.name || text || r.type || '', kind).slice(0, 120);
  }
  const cat = chooseCategory77(r.category, t?.category ?? null, userCats);
  const tags = [...new Set((Array.isArray(r.tags) ? r.tags : []).map((x) => String(x ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 30)).filter(Boolean))].slice(0, 8);
  let conf = Number(r.confidence);
  if (!Number.isFinite(conf)) conf = 0.5;
  if (conf > 1 && conf <= 100) conf /= 100;
  conf = Math.round(Math.min(1, Math.max(0, conf)) * 100) / 100;
  const out = { name: name || 'Ukjent del', category: cat.category, categoryNew: cat.categoryNew, specs, tags, confidence: conf, why: String(r.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 300), type: t?.type ?? null };
  if (Object.keys(decoded).length) out.decoded = decoded;
  return out;
}

/* ---------------- Heuristikk (uten modell: mock og reserve for tester) ---------------- */

const PKG_RE = /\b(0201|0402|0603|0805|1206|1210|2512|sot-?23(?:-\d)?|to-?220|to-?92|dip-?\d+|soic-?\d+|tht|smd)\b/i;
const COLOR_WORD_RE = /\b(rød|rod|red|grønn|gronn|green|blå|bla|blue|gul|yellow|hvit|white|varmhvit|rgb|uv|oransje|orange)\b/i;
/** Enkel tekstbasert tolkning: type, verdi, skrue, pakke, farge, effekt, spenning. → rådata til finalize77 */
export function heuristic77(text) {
  const s = String(text ?? '');
  const t = typeOf77(s);
  const kind = t?.kind ?? null;
  const specs = {};
  // Tall og enhet hører sammen («4,7 kΩ» → «4,7kΩ»); komma er desimaltegn, ikke skilletegn, når det står mellom sifre.
  const words = s.replace(/(\d)\s+(?=(?:meg|[pnuµμmkKMG])?(?:Ω|ohms?\b|[fF]\b|[pnuµμ][fF]\b|[kKM]\b|[hH]\b))/g, '$1').split(/[\s;]+|,(?!\d)/).filter(Boolean);
  if (kind) {
    for (const w of words) { const p = parseValue77(w, kind); if (p && p.kind === kind && !/^\d+$/.test(w)) { specs.verdi = p.text; break; } }
    if (!specs.verdi) for (const w of words) { if (/^\d+(?:[.,]\d+)?$/.test(w) && kind === 'R') { specs.verdi = parseValue77(w, 'R').text; break; } }
  }
  const watt = s.match(/(\d+\/\d+|\d+(?:[.,]\d+)?)\s*w\b/i);
  if (watt) { const p = parseValue77(`${watt[1]}W`); if (p) specs.effekt = p.text; }
  const volt = s.match(/(\d+(?:[.,]\d+)?)\s*v\b/i);
  if (volt) specs.spenning = parseValue77(`${volt[1]}V`).text;
  const pkg = s.match(PKG_RE);
  if (pkg) specs.pakke = pkg[1];
  const mm = s.match(/\b(\d+(?:[.,]\d+)?)\s*mm\b/i);
  if (mm && t?.type === 'LED') specs.diameter = `${mm[1]} mm`;
  const col = s.match(COLOR_WORD_RE);
  if (col && t?.type === 'LED') specs.farge = col[1];
  const tol = s.match(/±?\s*(\d+(?:[.,]\d+)?)\s*%/);
  if (tol) specs.toleranse = tol[1];
  const sc = screw77(s);
  if (sc && t && ['Skrue', 'Mutter', 'Avstandsstykke'].includes(t.type)) { specs.gjenger = sc.thread; if (sc.length) specs.lengde = sc.length; }
  const hode = s.match(/\b(unbrako|umbraco|torx|stjerne|kryss|sekskant|senkhode|flathode|pan head)\b/i);
  const variant = hode ? hode[1].toLowerCase() : '';
  const tags = [];
  if (specs.pakke && /^(0201|0402|0603|0805|1206|1210|2512|sot)/i.test(specs.pakke)) tags.push('smd');
  if (specs.pakke && /tht/i.test(specs.pakke)) tags.push('tht');
  if (sc?.thread) tags.push(sc.thread.toLowerCase());
  return { type: t?.type ?? '', name: s.trim(), category: t?.category ?? '', specs, tags, variant, confidence: t ? 0.55 : 0.2,
    why: t ? `Tolket fra teksten: ${t.type.toLowerCase()}${specs.verdi ? ` ${specs.verdi}` : ''}` : 'Fant ingen kjent komponenttype i teksten' };
}
