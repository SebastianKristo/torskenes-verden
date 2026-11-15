// Gjøremål (Huskeliste): monterer rutene under /api/tasks og aliaset /api/huske. server/index.js kaller mountGjoremal(app) der
// de gamle monteringene sto. Rekkefølgen er bærende (Hono kjører handlere og mellomvare i registreringsrekkefølge): de små
// ruterne med egen innlogging (sesjon eller app-token) står før routes.js, som har sin egen innlogging for resten av /api/tasks.
// Filene:
//   routes.js          – listene og oppgavene (delt i familien, sanntid), listOrder i GET / og /lists, placeName/after før innloggingen
//   order.js           – rekkefølgen på listene (/lists/order) per bruker
//   ha.js              – synk med Home Assistant To-do (/ha, /sync) og synk-raden i Innstillinger (/ha/summary)
//   glimt.js           – Glimt i Gjøremål (/glimt, /glimt/cards, /glimt/tips, /brief, /:id/split, /:id/suggest)
//   glimt-sentences.js – Glimt forstår setninger (flere punkter, rekkefølge, sted og person), placeName/after, «Nå kan du: …»
//   glimt-jobs.js      – Glimt deler opp lange beskjeder i bakgrunnen (/glimt/jobs, /glimt/sources) og /api/huske/glimt-jobs
//   glimt-split.js     – liste-kontrakten, lengdevakt og lokal forhåndsdeling, og loggen (/glimt/log)
import tasksApi from './routes.js';
import { haSummaryApi } from './ha.js';
import { listOrderApi } from './order.js';
import { glimtLogApi } from './glimt-split.js';
import { huskeApi } from './glimt-jobs.js';

export function mountGjoremal(app) {
  app.route('/api/tasks', haSummaryApi); // GET /ha/summary
  app.route('/api/tasks', listOrderApi); // GET/PUT /lists/order
  app.route('/api/tasks', glimtLogApi); // GET /glimt/log
  app.route('/api/tasks', tasksApi); // Huskeliste: delt i familien, sanntid via /api/ws
  app.route('/api/huske', huskeApi); // POST /glimt-jobs
}
