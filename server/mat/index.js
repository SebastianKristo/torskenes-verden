// Mat (Matplan): én Hono-app montert under to prefikser, /api/matplan (web) og /mat/api (Økonomi-web, iOS, Android), og
// ICS-kalenderen. Matplanen er felles for husstanden. server/index.js kaller mountMat(app) der /api/matplan sto; ingen andre
// ruter mellom den og de gamle /mat/-monteringene svarer på /mat/*, så rekkefølgen er den samme.
// Filene:
//   plan.js    – retter, ukeplan (AI eller tilfeldig), faste retter, kokker, HelloFresh, handleliste, ICS og planleggeren
//   recipes.js – mapper, oppskrifter fra nettsider og skannede bilder, lenker og filer per rett
// («Glimt lærer»-oppskriftene i server/recipes61/ er Glimt-planer, ikke matoppskrifter, og hører ikke til her.)
import { matApi, matCalendar } from './plan.js';

export function mountMat(app) {
  app.route('/api/matplan', matApi); // samme Matplan-API som /mat/api (Matplan hører til Homelab)
  app.route('/mat/api', matApi);
  app.get('/mat/calendar.ics', matCalendar);
}
