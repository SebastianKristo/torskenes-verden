// Prompt 47 (GLIMT47) – dokumentpipeline for vitnemål: fullstendighetssjekk i KODE. OCR-teksten (Tesseract / PDF-tekstlag fra
// study46) telles rad for rad: en «fag-rad» er en linje med et fagnavn (minst tre bokstaver) og en karakter (1–6, A–F, Bestått/IB,
// eventuelt to karakterer: standpunkt og eksamen). Antallet sammenlignes med fagene i JSON. Avvik → nytt forsøk på bare de manglende
// radene (tekstmodellen med strengt skjema, params47.document), og svaret flagges («Fant 14 fag, 1 rad var uleselig: …»).
// Modellen får aldri legge til fag som ikke står i OCR-teksten: hvert fag fra modellen må matche en OCR-rad.
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFC').replace(/[^\p{L}\d]+/gu, ' ').trim();
const GRADE_TOK = '(?:[1-6]|[A-F]|bestått|ikke\\s+bestått|ib|fritatt|godkjent)';
const ROW_RE = new RegExp(`^(.*?\\p{L}{3}.*?)[\\s\\t.:|]+(${GRADE_TOK})(?:[\\s\\t|]+(${GRADE_TOK}))?[\\s\\t|]*$`, 'iu');
const HEADER = /^(fag|faget|karakter|karakterer|standpunkt|eksamen|fagkode|emne|emnekode|vitnemål|sum|gjennomsnitt|snitt|poeng|elev|navn|fødselsdato|skole|utskrift|side)\b/i;

/** Fag-radene i OCR-teksten. → [{line, name, grades:[…]}] */
export function subjectRows47(text) {
  const out = [];
  const GR = new RegExp(`^${GRADE_TOK}$`, 'i');
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 5 || line.length > 160 || HEADER.test(line)) continue;
    // Kolonner (to+ mellomrom eller tab, slik OCR/tabell-leseren gir dem): «Kjemi 1    3» = fag «Kjemi 1», karakter 3.
    const cols = raw.trim().split(/\t|\s{2,}/).map((x) => x.trim()).filter(Boolean);
    if (cols.length >= 2 && GR.test(cols.at(-1))) {
      const gs = []; while (cols.length > 1 && GR.test(cols.at(-1)) && gs.length < 2) gs.unshift(cols.pop());
      const name = cols.join(' ').replace(/\b[A-ZÆØÅ]{3}\d{4}\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (/\p{L}{3}/u.test(name) && !HEADER.test(name)) { out.push({ line, name, grades: gs }); continue; }
    }
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const name = m[1].replace(/\b[A-ZÆØÅ]{3}\d{4}\b/g, ' ').replace(/[\s.:|-]+$/, '').trim();
    if (!/\p{L}{3}/u.test(name) || HEADER.test(name)) continue;
    out.push({ line, name, grades: [m[2], m[3]].filter(Boolean) });
  }
  return out;
}
const sameName = (a, b) => { const x = fold(a), y = fold(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x) || (x.length >= 6 && y.includes(x)) || (y.length >= 6 && x.includes(y))); };

/** Sammenligner fagene med OCR-radene. → {ocrRows, found, missing:[rad], extra:[fag uten OCR-rad], complete} */
export function completeness47(text, emner) {
  const rows = subjectRows47(text);
  const missing = rows.filter((r) => !emner.some((e) => sameName(e.navn, r.name)));
  const extra = rows.length ? emner.filter((e) => !rows.some((r) => sameName(e.navn, r.name))) : [];
  return { ocrRows: rows.length, found: emner.length, missing, extra, complete: !missing.length };
}

export const DOC_SCHEMA47 = {
  type: 'object',
  properties: { fag: { type: 'array', items: { type: 'object', properties: { navn: { type: 'string' }, karakter: { type: ['string', 'null'] }, eksamen: { type: ['string', 'null'] }, type: { type: ['string', 'null'], enum: ['standpunkt', 'eksamen', null] } }, required: ['navn', 'karakter'] } } },
  required: ['fag'],
};
/**
 * Nytt forsøk på bare de manglende radene. ai(prompt, schema) → JSON. Fag som ikke matcher en av radene, forkastes.
 * → [{navn, karakter, eksamen?}]
 */
export async function retryMissing47(missing, ai) {
  if (!missing.length || !ai) return [];
  const prompt = `These lines are rows from a Norwegian school diploma (vitnemål), read by OCR. Return ONLY JSON {"fag":[{"navn":"…","karakter":"…","eksamen":null,"type":"standpunkt"}]} with one entry per line, in the same order. Copy the subject name exactly (fix only obvious OCR errors). Do not add subjects that are not in the lines.\n\n${missing.map((r) => r.line).join('\n')}`;
  let j;
  try { j = await ai(prompt, DOC_SCHEMA47); } catch { return []; }
  const list = Array.isArray(j?.fag) ? j.fag : Array.isArray(j?.emner) ? j.emner : [];
  return list.map((e) => ({ navn: String(e?.navn ?? '').trim().slice(0, 120), karakter: String(e?.karakter ?? '').trim().slice(0, 20), eksamen: e?.eksamen ? String(e.eksamen).trim().slice(0, 20) : null }))
    .filter((e) => e.navn && missing.some((r) => sameName(e.navn, r.name)));
}
/** «Fant 14 fag, 1 rad var uleselig: Kjemi 1.» – eller null når alt stemmer. */
export function completenessText47(c) {
  if (c.complete || !c.ocrRows) return null;
  const n = c.missing.length;
  return `Fant ${c.found} fag, ${n} ${n === 1 ? 'rad' : 'rader'} i dokumentet ble ikke lest: ${c.missing.slice(0, 5).map((r) => r.name).join(', ')}${n > 5 ? ' …' : ''}.`;
}
