// Prompt 36 (claude-code-glimt-en-indikator.md): spørsmål vs. handling. Ren ES-modul uten DOM (web og PWA).
// Spørsmål → bare kortet under søkefeltet (ingen pille, aldri «Legg i kalender»). Handling → bare Glimt-pillen.
const START = /^(spørsmål|hva|hvor|hvem|hvilken|hvilke|hvilket|hvordan|hvorfor|når|kan du|vet du|fortell|what|when|where|how|who|why)(?![a-zæøå])/i;
const HAS = /(?:^|[^a-zæøå])(hvor mange|hvor mye|hvor lenge|hvor langt|hva er|hva blir|når går|når er|hvordan blir)(?![a-zæøå])/i;
const ACT = /(?:^|[^a-zæøå])(legg til|legg inn|book|booke|bestill|påminn|minn meg|lagre|last opp|avbestill)(?![a-zæøå])/i;
/** true når teksten er et spørsmål (svar skal leses), også med dato i («… dagslys den 29.06.2027»). */
export function isQuestion(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (ACT.test(t)) return false; // eksplisitt handling vinner
  return t.includes('?') || START.test(t) || HAS.test(t);
}
/** 'question' | 'action' (lokale regler; null når det er uklart). */
export function kindOf(text, { attachment = false } = {}) {
  if (attachment) return 'action';
  const t = String(text ?? '').trim();
  if (ACT.test(t)) return 'action';
  if (isQuestion(t)) return 'question';
  if (/\d{1,2}[.:]\d{2}|\d{1,2}\.\d{1,2}/.test(t)) return 'action';
  return null;
}
