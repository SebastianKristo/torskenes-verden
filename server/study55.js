// Prompt 55 (GLIMT55): vitnemål – karakter, fagkode og fagnavn valideres i kode.
//   - gradeOf55: karakteren er 1–6, A–F eller et ord fra skalaen (Bestått, Ikke bestått, Godkjent, IV, IB, Fritatt …). Innpakninger
//     som modellen eller en formateringsfeil kan gi («strconv(4)», «int("4")», «4.0», «Karakter: 4», «4/6») pakkes ut. En fagkode
//     (NOR1211, REA3056, IN1000) er ALDRI en karakter.
//   - canonicalSubject55: fagnavnet matches mot kjente fagnavn (vgs og høyere utdanning) med Damerau-Levenshtein etter normalisering.
//     Nivået («1», «2», «R1», «II») må være likt – «Fysikk 1» blir aldri «Fysikk 2». «Samfunnuskunnskap» → «Samfunnskunnskap».
//   - clean55: kjører begge på en liste emner, bytter kode/karakter når modellen har lagt dem i feil felt, og fjerner dubletter.

/** Fagkode (vgs: tre bokstaver + fire sifre, NOR1211; høyere utdanning: IN1000, STK1100, MAT-INF1100). */
export const SUBJECT_CODE55 = /^[A-ZÆØÅ]{2,8}-?[A-ZÆØÅ]{0,4}\d{3,5}[A-Z]{0,3}$/i;
export const isSubjectCode55 = (s) => { const t = String(s ?? '').trim(); return /[A-ZÆØÅ]{2}/i.test(t) && /\d{3}/.test(t) && SUBJECT_CODE55.test(t); };

const WORD_GRADES55 = [['bestått', 'Bestått'], ['ikke bestått', 'Ikke bestått'], ['godkjent', 'Godkjent'], ['ikke godkjent', 'Ikke godkjent'], ['stryk', 'Stryk'],
  ['fritatt', 'Fritatt'], ['fritak', 'Fritatt'], ['deltatt', 'Deltatt'], ['ikke møtt', 'Ikke møtt'], ['passed', 'Bestått'], ['failed', 'Ikke bestått']];
/** Pakker ut «strconv(4)», «int("4")», «"4"», «4.0», «Karakter: 4», «4/6», «4 (fire)». */
export function unwrapGrade55(raw) {
  let s = String(raw ?? '').trim();
  for (let i = 0; i < 3; i++) {
    const m = s.match(/^[A-Za-z_][\w.]*\(\s*(.*?)\s*\)$/); // strconv(4), int("4"), String(4), Number('5')
    if (!m) break;
    s = m[1].trim();
  }
  s = s.replace(/^["'«»`]+|["'«»`]+$/g, '').trim();
  s = s.replace(/^(?:karakter|grade|kar\.?|standpunkt|eksamen)\s*[:=]?\s*/i, '').trim();
  let m;
  if ((m = s.match(/^([1-6])(?:[.,]0+)?$/))) return m[1];
  if ((m = s.match(/^([1-6])\s*(?:\/\s*6|av\s+6)$/i))) return m[1];
  if ((m = s.match(/^([1-6])\s*\([a-zæøå ]+\)$/i))) return m[1];
  return s;
}
/**
 * Karakteren, eller null når verdien ikke er en gyldig karakter (f.eks. en fagkode).
 * scale: 'vgs' (1–6 og ord) | 'ho' (A–F og ord) | null (begge).
 */
export function gradeOf55(raw, { scale = null } = {}) {
  if (raw == null) return null;
  const s0 = String(raw).trim();
  if (!s0 || isSubjectCode55(s0)) return null;
  const s = unwrapGrade55(s0).replace(/\s+/g, ' ');
  if (!s || isSubjectCode55(s)) return null;
  if (/^[1-6]$/.test(s)) return scale === 'ho' ? null : s;
  if (/^[a-f]$/i.test(s)) return scale === 'vgs' ? null : s.toUpperCase();
  if (/^(iv|ib|g)$/i.test(s)) return s.toUpperCase();
  const w = WORD_GRADES55.find(([k]) => k === s.toLowerCase());
  return w ? w[1] : null;
}

/* ---------------- Kjente fagnavn ---------------- */

const LV = (name, levels) => levels.map((l) => `${name} ${l}`);
export const KNOWN_SUBJECTS55 = [
  // Vgs fellesfag
  'Norsk hovedmål, skriftlig', 'Norsk sidemål, skriftlig', 'Norsk, muntlig', 'Norsk', 'Norsk hovedmål', 'Norsk sidemål', 'Engelsk', 'Engelsk, skriftlig', 'Engelsk, muntlig',
  'Matematikk 1T', 'Matematikk 1P', 'Matematikk 2T', 'Matematikk 2P', 'Matematikk R1', 'Matematikk R2', 'Matematikk S1', 'Matematikk S2', 'Matematikk X',
  'Naturfag', 'Samfunnskunnskap', 'Geografi', 'Historie', 'Religion og etikk', 'Kroppsøving', 'Samfunnsfag', 'Fremmedspråk',
  ...LV('Spansk', ['I', 'II', 'III', 'I+II']), ...LV('Tysk', ['I', 'II', 'III', 'I+II']), ...LV('Fransk', ['I', 'II', 'III', 'I+II']), ...LV('Italiensk', ['I', 'II', 'III']),
  ...LV('Kinesisk', ['I', 'II']), ...LV('Russisk', ['I', 'II']), ...LV('Japansk', ['I', 'II']),
  // Vgs programfag
  ...LV('Kjemi', ['1', '2']), ...LV('Fysikk', ['1', '2']), ...LV('Biologi', ['1', '2']), ...LV('Geofag', ['1', '2']), ...LV('Informasjonsteknologi', ['1', '2']),
  ...LV('Psykologi', ['1', '2']), ...LV('Rettslære', ['1', '2']), ...LV('Markedsføring og ledelse', ['1', '2']), ...LV('Entreprenørskap og bedriftsutvikling', ['1', '2']),
  ...LV('Historie og filosofi', ['1', '2']), ...LV('Teknologi og forskningslære', ['1', '2']), ...LV('Økonomistyring', ['']).map((s) => s.trim()), 'Økonomi og ledelse',
  'Sosiologi og sosialantropologi', 'Sosialkunnskap', 'Politikk og menneskerettigheter', 'Samfunnsgeografi', 'Programmering og modellering X',
  'Engelskspråklig litteratur og kultur', 'Samfunnsfaglig engelsk', 'Internasjonal engelsk', 'Kommunikasjon og kultur 1', 'Breddeidrett', 'Toppidrett',
  'Musikk', 'Kunst og visuelle virkemidler', 'Design og arkitektur', 'Medie- og informasjonskunnskap 1', 'Medieuttrykk', 'Filosofi', 'Litteratur og kultur',
  // Høyere utdanning (vanlige navn)
  'Examen philosophicum', 'Examen facultatum', 'Ex.phil.', 'Ex.fac.', 'Bacheloroppgave', 'Masteroppgave', 'Statistikk', 'Matematikk 1', 'Matematikk 2', 'Lineær algebra',
  'Kalkulus', 'Programmering 1', 'Programmering 2', 'Algoritmer og datastrukturer', 'Databaser', 'Operativsystemer', 'Datanettverk', 'Diskret matematikk',
  'Innføring i programmering', 'Objektorientert programmering', 'Økonomistyring', 'Organisasjon og ledelse', 'Markedsføring', 'Mikroøkonomi', 'Makroøkonomi',
  'Bedriftsøkonomi', 'Regnskap', 'Finansregnskap', 'Investering og finansiering', 'Metode', 'Forskningsmetode', 'Etikk', 'Praksis',
];

/** Normalisering: små bokstaver, NFC, tegnsetting bort, ett mellomrom. */
export const normSubject55 = (s) => String(s ?? '').toLowerCase().normalize('NFC').replace(/[^\p{L}\d+ ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const LEVEL_RE = /^(?:\d{1,2}[a-zæøå]?|[a-z]\d|i{1,3}|iv|v|i\+ii|x)$/; // 1, 2, 1t, r1, s2, i, ii, iii, iv, x
/** Delt i ord og nivå: «matematikk r1» → {words:'matematikk', level:'r1'}. */
function splitLevel(n) {
  const toks = n.split(' ');
  const level = [];
  while (toks.length > 1 && LEVEL_RE.test(toks.at(-1))) level.unshift(toks.pop());
  return { words: toks.join(' '), level: level.join(' ') };
}
/** Damerau-Levenshtein (optimal string alignment). */
export function damerau55(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  const n = a.length, m = b.length;
  if (!n) return m; if (!m) return n;
  const d = Array.from({ length: n + 1 }, (_, i) => { const r = new Array(m + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}
const KNOWN_N55 = KNOWN_SUBJECTS55.map((name) => ({ name, n: normSubject55(name), ...splitLevel(normSubject55(name)) }));
const maxDist = (len) => (len <= 4 ? 0 : len <= 8 ? 1 : len <= 16 ? 2 : 3);
/**
 * Nærmeste kjente fagnavn. → {name, dist, exact} | null (ingen sikker match: for langt unna, eller to like nære).
 * Nivået må være identisk; bare ordene matches fuzzy.
 */
export function canonicalSubject55(name) {
  const n = normSubject55(name);
  if (n.length < 3) return null;
  const exact = KNOWN_N55.find((k) => k.n === n);
  if (exact) return { name: exact.name, dist: 0, exact: true };
  const { words, level } = splitLevel(n);
  let best = null, second = Infinity;
  for (const k of KNOWN_N55) {
    if (k.level !== level) continue;
    const dist = damerau55(words, k.words);
    if (!best || dist < best.dist) { second = best?.dist ?? Infinity; best = { name: k.name, dist }; } else if (dist < second && k.name !== best.name) second = dist;
  }
  if (!best || best.dist > maxDist(words.length) || best.dist === second) return null;
  return { name: best.name, dist: best.dist, exact: false };
}

/**
 * Rydder emnene: karakter valideres (kode i karakterfeltet flyttes til kode), fagnavn matches mot kjente navn, dubletter fjernes.
 * Emner med ugyldig karakter beholdes med karakter null og «Sjekk» (aldri en kode eller rar tekst som karakter).
 */
export function clean55(emner) {
  const out = [];
  for (const e0 of Array.isArray(emner) ? emner : []) {
    const e = { ...e0 };
    const raw = e.karakter;
    let k = gradeOf55(raw);
    // Modellen la fagkoden i karakterfeltet (og kanskje karakteren i kodefeltet).
    if (!k && isSubjectCode55(raw)) {
      if (!e.kode) e.kode = String(raw).trim().toUpperCase();
      const fromCode = gradeOf55(e0.kode);
      if (fromCode) { k = fromCode; e.kode = String(raw).trim().toUpperCase(); }
    }
    if (e.kode && !isSubjectCode55(e.kode)) { const g = gradeOf55(e.kode); if (g && !k) k = g; e.kode = null; }
    if (e.kode) e.kode = String(e.kode).trim().toUpperCase();
    for (const f of ['standpunkt', 'eksamen', 'eksamenMuntlig']) if (e[f] != null) { const g = gradeOf55(e[f]); if (g) e[f] = g; else delete e[f]; }
    if (!k && e.standpunkt) k = e.standpunkt;
    const others = String(e.checkReason ?? '').split(' · ').map((x) => x.trim()).filter((x) => x && !/^(Ukjent karakter|Mangler karakter)/.test(x));
    if (k) {
      e.karakter = k;
      if (others.length) e.checkReason = others.join(' · '); else if (e.check) { e.check = false; delete e.checkReason; }
    } else {
      e.karakter = null; e.check = true;
      e.checkReason = [...others, raw != null && String(raw).trim() ? `Ukjent karakter «${String(raw).slice(0, 20)}»` : 'Mangler karakter'].join(' · ');
    }
    // Fagkoden er aldri fagnavnet: «NOR1211 Norsk hovedmål» → kode + navn.
    const nm = String(e.navn ?? '').trim().match(/^([A-ZÆØÅ]{2,8}-?\d{3,5}[A-Z]{0,3})\s+(.+)$/);
    if (nm && isSubjectCode55(nm[1])) { e.kode ??= nm[1].toUpperCase(); e.navn = nm[2]; }
    const c = canonicalSubject55(e.navn);
    if (c && c.name !== e.navn) { if (!c.exact) e.navnLest = e.navn; e.navn = c.name; }
    out.push(e);
  }
  // Dubletter (samme rad lest to ganger, f.eks. over to striper): samme kode, eller samme navn der den ene mangler karakter / har samme karakter.
  const keep = [];
  for (const e of out) {
    const i = keep.findIndex((x) => (x.kode && e.kode && x.kode === e.kode) || (normSubject55(x.navn) === normSubject55(e.navn) && (!x.karakter || !e.karakter || x.karakter === e.karakter) && (!x.kode || !e.kode || x.kode === e.kode)));
    if (i < 0) { keep.push(e); continue; }
    const x = keep[i];
    if (!x.karakter && e.karakter) keep[i] = { ...e, kode: e.kode ?? x.kode };
    else if (!x.kode && e.kode) x.kode = e.kode;
  }
  return keep;
}
