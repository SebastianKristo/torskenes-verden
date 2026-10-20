// Prompt 40 (WEB40): små ting i skallet.
// - Julemodus: Glimt-innstillingene (jul, julPhase, julActive) hentes ved oppstart og ved sanntid «glimt:settings», så
//   figurbiblioteket (glimt-figs.js → julOn) vet om lua skal på. Endring → «glimt-jul» → app.js tegner siden på nytt.
// - Gjøremål: /gjoremal (og #/gjoremal) åpner Gjøremål i fullskjerm.
import { loadGlimt } from './glimt35.js';
import { onLive } from './realtime.js';

export function initWeb40() {
  // Julemodus fra serveren (gjelder på alle enheter). loadGlimt kaller setJul når svaret kommer.
  loadGlimt(null).catch?.(() => {});
  onLive('glimt:settings', () => { loadGlimt(null, true); });
  // Direktelenke /gjoremal → #/gjoremal (krever at serveren svarer med app.html på /gjoremal).
  if (/^\/gjoremal\/?$/.test(location.pathname) && !location.hash) history.replaceState(null, '', `/#/gjoremal${location.search}`);
}
