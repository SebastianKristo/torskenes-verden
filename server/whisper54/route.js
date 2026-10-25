// Prompt 54 (WHISPER54): rutingen for tale til tekst (rene funksjoner, ingen avhengigheter – trygg å importere fra server/dal53/asr.js).
//
//   norsk (no/nb/nn)  → NB-Whisper (bokmål som standard, nn = nynorsk)
//   engelsk (en)      → Voz (server) → Phonon (Mac mini) → NB-Whisper (language=en) som reserve
//   annet valgt språk → Phonon/Voz når de støtter det (som før) → NB-Whisper hvis det er et Whisper-språk
//   auto              → språkdeteksjon (NB-Whisper /detect, første 30 s); oppdaget språk rutes som over,
//                       men for «annet» går NB-Whisper først (kontrakt 54), med Phonon/Voz som reserve.
// Brukerens foretrukne språk (profil) er bare et hint: det vinner bare når deteksjonen er usikker og hintet har reell sannsynlighet.

export const ENGINE_LABELS54 = { nbwhisper: 'NB-Whisper (Mac mini)', voz: 'Voz (server)', phonon: 'Phonon (Mac mini)' };
export const LANG_NAMES54 = { no: 'norsk', nn: 'nynorsk', en: 'engelsk', sv: 'svensk', da: 'dansk', de: 'tysk', fr: 'fransk', es: 'spansk', fi: 'finsk', pl: 'polsk', nl: 'nederlandsk', it: 'italiensk', pt: 'portugisisk', uk: 'ukrainsk', ru: 'russisk' };
export const SURE54 = 0.5;      // deteksjonen er sikker nok fra denne sannsynligheten
export const HINT_MIN54 = 0.15; // hintet må ha minst dette når deteksjonen er usikker

/** 'nb'|'no'|'nb-NO' → {lang:'no', variant:'nb'}, 'nn' → {lang:'no', variant:'nn'}, 'en-GB' → {lang:'en'}, ''/auto → {lang:null}. */
export function splitLang54(l) {
  const s = String(l ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (!s || s === 'auto') return { lang: null, variant: null };
  if (['nn', 'nno'].includes(s)) return { lang: 'no', variant: 'nn' };
  if (['nb', 'no', 'nor', 'nob'].includes(s)) return { lang: 'no', variant: 'nb' };
  return { lang: s.slice(0, 8), variant: null };
}
/** Språket NB-Whisper skal få: 'no' (bokmål) eller 'nn' for norsk, ellers koden. */
export const nbWire54 = (lang, variant) => (lang === 'no' ? (variant === 'nn' ? 'nn' : 'no') : lang);
export const langLabel54 = (lang, variant) => (lang === 'no' ? (variant === 'nn' ? 'norsk (nynorsk)' : 'norsk (bokmål)') : LANG_NAMES54[lang] ?? lang ?? 'ukjent');

/**
 * Velg språk fra deteksjonen. det: {language, probability, languages:[{language, probability}]} (koder som 'no','nn','en'), hint: 'no'|'en'|… eller null.
 * no + nn slås sammen til norsk. → {lang, variant, probability, source:'detected'|'hint'}
 */
export function decide54(det, hint = null) {
  const probs = new Map();
  const add = (l, p) => { const { lang } = splitLang54(l); if (lang) probs.set(lang, (probs.get(lang) ?? 0) + (Number(p) || 0)); };
  for (const x of det?.languages ?? []) add(x.language, x.probability);
  if (!probs.size && det?.language) add(det.language, det.probability ?? 1);
  const nnShare = (det?.languages ?? []).find((x) => splitLang54(x.language).variant === 'nn')?.probability ?? 0;
  const sorted = [...probs.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  const [top, p] = sorted[0];
  const h = splitLang54(hint).lang;
  // Bokmål som standard: nynorsk bare når brukeren ber om det (eller deteksjonen er nesten bare nynorsk).
  const variantOf = (l) => (l === 'no' ? (nnShare > 0.8 * (probs.get('no') ?? 1) ? 'nn' : 'nb') : null);
  if (p < SURE54 && h && h !== top && (probs.get(h) ?? 0) >= HINT_MIN54) return { lang: h, variant: variantOf(h), probability: probs.get(h), source: 'hint' };
  return { lang: top, variant: variantOf(top), probability: p, source: 'detected' };
}

/**
 * Rekkefølgen på motorene for et språk. list: [{id, priority}] (bare de som er klare og støtter språket).
 * auto=true betyr at språket ble oppdaget (ikke valgt) – da går NB-Whisper først også for «andre» språk.
 */
export function order54(list, lang, { auto = false } = {}) {
  const rank = (x) => {
    if (lang === 'no') return x.id === 'nbwhisper' ? 0 : 10 - (x.priority ?? 0) / 100;
    if (lang === 'en') return { voz: 0, phonon: 1, nbwhisper: 3 }[x.id] ?? 2 - (x.priority ?? 0) / 100;
    if (auto) return x.id === 'nbwhisper' ? 0 : 1 - (x.priority ?? 0) / 100;
    return x.id === 'nbwhisper' ? 50 : -(x.priority ?? 0);
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}
