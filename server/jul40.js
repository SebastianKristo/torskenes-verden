// Prompt 40 (SERVER40): Glimt i julemodus (1. desember – 13. januar), Auto/Av/På + fasevalg (claude-code-glimt-jul.md).
// Valget lagres per bruker i Glimt-innstillingene (glimt35.js): jul:'auto'|'av'|'pa', julPhase:'advent'|'jul'|'nyttar'|'vinter'|null,
// snow:true, julSound:'av'|'bjelle'. Avledet julActive = {on, phase, until, label, auto, outfit} (Europe/Oslo). Sanntid «glimt:settings».
// Brief i julemodus: jul = {phase, label, countdown, countdownText, luke:{n, text}|null, aaret?:{title, items}} (luke 1.–24. des, «Året ditt» 31. des).
//
// Faser (auto):  advent 1.–23. des · jul 24.–30. des · nyttar 31. des – 1. jan · vinter 2.–13. jan. Antrekk: nisse | jul | nyttar | vinter.
export const JUL_MODES = ['auto', 'av', 'pa'];
export const JUL_PHASES = ['advent', 'jul', 'nyttar', 'vinter'];
export const JUL_SOUNDS = ['av', 'bjelle'];
const PHASE_LABEL = { advent: 'Advent', jul: 'Jul', nyttar: 'Nyttår', vinter: 'Vinter' };
const OUTFIT = { advent: 'nisse', jul: 'jul', nyttar: 'nyttar', vinter: 'vinter' };
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** {y, m, d} i Oslo. */
export const osloYmd = (t = Date.now()) => { const [y, m, d] = new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }).split('-').map(Number); return { y, m, d }; };
/** Fasen for datoen (auto), eller null utenfor 1. des – 13. jan. */
export function autoPhase(t = Date.now()) {
  const { m, d } = osloYmd(t);
  if (m === 12) return d <= 23 ? 'advent' : d <= 30 ? 'jul' : 'nyttar';
  if (m === 1) return d <= 1 ? 'nyttar' : d <= 13 ? 'vinter' : null;
  return null;
}
/** Slutten på perioden (13. jan) som ISO-dato, for datoen t (des → neste år). */
const endOf = (t) => { const { y, m } = osloYmd(t); return `${m === 12 ? y + 1 : y}-01-13`; };
const startOf = (t) => { const { y, m } = osloYmd(t); return `${m === 1 ? y - 1 : y}-12-01`; };

/** Avledet julemodus fra innstillingene. → {on, phase, until, label, auto, outfit, mode, snow, sound} */
export function julActive(s = {}, t = Date.now()) {
  const mode = JUL_MODES.includes(s.jul) ? s.jul : 'auto';
  const ap = autoPhase(t);
  let on, phase, until = null, label;
  if (mode === 'av') { on = false; phase = null; label = 'Av hele året'; }
  else if (mode === 'pa') { on = true; phase = JUL_PHASES.includes(s.julPhase) ? s.julPhase : ap ?? 'advent'; label = `På · ${PHASE_LABEL[phase]}`; }
  else if (ap) { on = true; phase = ap; until = endOf(t); label = 'På nå · slås av 13. januar'; }
  else { on = false; phase = null; label = 'Slås på 1. desember'; }
  return { on, phase, until, label, auto: mode === 'auto', outfit: phase ? OUTFIT[phase] : null, mode, snow: s.snow !== false, sound: JUL_SOUNDS.includes(s.julSound) ? s.julSound : 'av',
    ...(mode === 'auto' && !ap ? { startsAt: (() => { const { y, m } = osloYmd(t); return `${m === 12 ? y : y}-12-01`; })() } : {}) };
}

/** Renser jul-feltene i en Glimt-innstillingsendring. → {patch, errors} */
export function cleanJul(b) {
  const patch = {}, errors = [];
  if (b.jul !== undefined) { if (!JUL_MODES.includes(b.jul)) errors.push('jul må være auto, av eller pa'); else patch.jul = b.jul; }
  if (b.julPhase !== undefined) { if (b.julPhase !== null && !JUL_PHASES.includes(b.julPhase)) errors.push('julPhase må være advent, jul, nyttar, vinter eller null'); else patch.julPhase = b.julPhase; }
  if (b.snow !== undefined) { if (typeof b.snow !== 'boolean') errors.push('snow må være true eller false'); else patch.snow = b.snow; }
  if (b.julSound !== undefined) { if (!JUL_SOUNDS.includes(b.julSound)) errors.push('julSound må være av eller bjelle'); else patch.julSound = b.julSound; }
  return { patch, errors };
}
export const JUL_DEFAULTS = { jul: 'auto', julPhase: null, snow: true, julSound: 'av' };

// Dagens luke: ett nyttig tips per dag 1.–24. desember.
export const LUKER = [
  'Sett opp julelysene i dag – helgen er fri for regn.', 'Lag en julegaveliste i Gjøremål, så glemmer du ingen.', 'Sjekk siste frist for pakker til utlandet.',
  'Bestill juletre tidlig – de fine går først.', 'Ta en tur på julemarkedet i kveld.', 'Bak den første sorten i dag.', 'Sjekk lysene på hytta før det blir kaldt.',
  'Sett av en kveld til juleverksted.', 'Legg julekort i postkassen innen den 15.', 'Rydd i boden og finn julepynten.', 'Lag en budsjettpost for jul i Finans.',
  'Kjøp frimerker til julekortene.', 'Luciadagen – lussekatter til frokost?', 'Planlegg julemiddagen og hvem som kommer.', 'Bestill ribbe eller pinnekjøtt nå.',
  'Pakk inn gavene du allerede har.', 'Sjekk at julegavene fra nett er på vei i Sporing.', 'Lag en rolig kveld med julefilm.', 'Kjøp inn til grøten.', 'Vask og gjør klart gjesterommet.',
  'Vintersolverv – i morgen blir dagene lengre.', 'Siste handledag før helgen – lag handleliste.', 'Lillejulaften: pynt treet og senk skuldrene.', 'God jul! Ingenting må gjøres i dag.',
];
/** Dagens luke for datoen, eller null utenfor 1.–24. desember. */
export function lukeOf(t = Date.now()) { const { m, d } = osloYmd(t); return m === 12 && d >= 1 && d <= 24 ? { n: d, text: LUKER[d - 1] } : null; }
/** Dager til julaften (0 på julaften, null etter). */
export function countdownOf(t = Date.now()) {
  const { y, m, d } = osloYmd(t);
  if (m !== 12 || d > 24) return null;
  return 24 - d;
}

/**
 * Brief-tillegg i julemodus. aaret(u) gir «Året ditt» 31. des (best effort). → null utenfor julemodus.
 */
export function julBrief(s, t = Date.now(), { aaret = null } = {}) {
  const a = julActive(s, t);
  if (!a.on) return null;
  const cd = a.phase === 'advent' ? countdownOf(t) : null;
  const { m, d } = osloYmd(t);
  return { phase: a.phase, label: a.label, outfit: a.outfit, countdown: cd, countdownText: cd == null ? (m === 12 && d === 24 ? 'God jul!' : null) : cd === 1 ? '1 dag til jul' : `${cd} dager til jul`,
    luke: a.phase === 'advent' || (m === 12 && d === 24) ? lukeOf(t) : null, ...(m === 12 && d === 31 && aaret ? { aaret } : {}), snow: a.snow };
}
export const julDateText = (iso) => { if (!iso) return null; const [, mm, dd] = iso.split('-').map(Number); return `${dd}. ${MON[mm - 1]}`; };
export { startOf as julStartOf, endOf as julEndOf };
