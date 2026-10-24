// Felles sjekk for Nina-casene (01–03, 13). Ikke en case (filnavn med _ hoppes over).
import { mentionsDate, mentionsTime, plain, did } from '../lib/match.mjs';

export function checkNextNina(s, ck, { expectDate = '2026-11-03', expectTime = '14:00', none = false } = {}) {
  ck('svarte', s.status === 200 && s.reply, `HTTP ${s.status} ${s.error ?? ''}`);
  const r = plain(s.reply);
  if (none) {
    ck('sier tydelig at ingen avtale ble funnet', /(finner|fant|ser)\s+(ingen|ikke)|ingen\s+(kommende|planlagt|ny)|har\s+ingen|ikke\s+noen\s+(kommende|avtale)/i.test(r), did(s));
    ck('nevner ikke en (feil) dato', !/(?<!\d)\d{1,2}\.\s*(okt|nov|des)|(?<!\d)\d{1,2}\.\d{1,2}(?!\d)/i.test(r.replace(/24\.\s*okt\w*/i, '')), `svar «${r.slice(0, 200)}»`);
  } else {
    ck('riktig dato (tirsdag 3. november)', mentionsDate(r, expectDate), did(s));
    ck('riktig klokkeslett (14:00)', mentionsTime(r, expectTime), `svar «${r.slice(0, 200)}»`);
  }
  ck('endret ikke kalenderen', !(s.actions ?? []).some((a) => /calendar\.(create|update|delete)/.test(a.tool) && a.status === 'done'), did(s));
}
