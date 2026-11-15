// Prompt 52 (SRV52): kvitteringer leses bare lokalt. Gemini (og andre sky-API-er) er tatt helt ut av kvitteringslesingen,
// også som reserve og også når «Finansdata forlater aldri huset» er av. Alt som likevel prøver å sende et kvitteringsbilde
// (eller varelinjer/beløp fra en kvittering) til en sky-API, stoppes her og logges som en advarsel (uten innhold og nøkler).
//
//   blockCloudReceipt52(where, provider) → kaster alltid en feil med blocked:true (og logger advarselen)
//   warnCloudReceipt52(where, provider)  → bare advarselen (teller), for steder som selv faller tilbake til lokalt
//   cloudReceiptWarnings52()             → [{at, where, provider}] (siste 50, til System/diagnostikk og testene)
export const RECEIPT_LOCAL_TEXT52 = 'Glimt leser lokalt …';
export const RECEIPT_SOURCE_LABEL52 = 'Lokal AI';
export const RECEIPT_ENGINE_NOTE52 = 'Gemini brukes ikke lenger til kvitteringer – lest lokalt';

const log52 = [];
export function warnCloudReceipt52(where, provider = 'gemini') {
  const w = { at: new Date().toISOString(), where: String(where ?? 'ukjent').slice(0, 80), provider: String(provider ?? 'sky').slice(0, 30) };
  log52.unshift(w);
  if (log52.length > 50) log52.length = 50;
  console.warn(`[kvittering] ADVARSEL: forsøk på å sende kvitteringsbilde til sky-API (${w.provider}, ${w.where}) – stoppet. Kvitteringer leses bare lokalt.`);
  return w;
}
export function blockCloudReceipt52(where, provider = 'gemini') {
  warnCloudReceipt52(where, provider);
  return Object.assign(new Error('Kvitteringer leses bare lokalt (sky-API-er brukes ikke)'), { noRetry: true, blocked: true, cloud52: true });
}
export const cloudReceiptWarnings52 = () => log52.slice();
export const _resetCloudGuard52 = () => { log52.length = 0; };
