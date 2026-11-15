// Glimt: monterer rutene i domenet. server/index.js kaller mountGlimt(app) der /api/glimt (glimtApi) sto, etter de andre
// /api/glimt/*-rutene (nyheter, kvalitet, 17. mai, oppskrifter, faste oppgaver) og før Chat. Rekkefølgen er bærende (Hono kjører
// handlere og mellomvare i registreringsrekkefølge):
//   – /api/glimt/memory: ryddingen (forslag, motstrid, ubrukte fakta) før «Glimt husker», som har /:id
//   – /api/brief: etter julemodus- og sesongmellomvarene (jul40, brief41) i index.js, som legger til felt i svaret
//   – /api/glimt (glimtApi, sesjon eller app-token for hele /api/glimt/*) til sist, så de mer spesifikke rutene svarer først
//   – /api/assist: Kalenderens lokale tolkning (local:{…}, kalender/invites.js) legges rundt Glimt-ruteren
// Filene:
//   engine.js            – Glimt-motoren: forstå → plan → verktøy → kontroll → svar, én inngang for alle felt
//   agent-api.js         – /api/glimt/agent (motoren, bekreftelser, logg, spor, innstillinger, kalendere)
//   plan.js / planner.js – lokal plan og modellplanleggeren (JSON-skjema)
//   context.js, answer.js, model-params.js, trace.js, words.js, dates.js, personality.js, recurrence.js
//   tools.js             – verktøyregisteret; tools-weather-subs.js og tools-search.js registrerer flere verktøy
//   calendar.js, calendar-card.js, subscriptions.js, tasks.js, weather.js, document.js, episode-ask.js, fag.js
//   convo/               – samtaletilstand, entitetsregisteret og «bedre forståelse i samtaler»
//   memory/              – «Glimt husker» (remember.js), minnehenting (recall.js) og nattlig rydding (store, extract, review, nightly)
//   brief.js             – Glimt-brief (morgen/dag/kveld), widget og innstillinger; brief-cards.js – kortene i briefen og nordlysvarselet
//   settings.js          – Glimt-innstillinger, opplesning (/api/tts) og bildeproxy (/api/img)
//   assist.js            – /api/assist (Glimt-ruteren fra Hjem-søket og Chat, serverjobb)
// Importrekkefølgen følger den gamle rekkefølgen i server/index.js (modulene registrerer verktøy og dekoratører når de lastes).
import remember from './memory/remember.js';
import { agentApi45 } from './agent-api.js';
import { entitiesApi60 } from './convo/api.js';
import { memoryApi63 } from './memory/hygiene-api.js';
import assistApi from './assist.js';
import { glimtApi } from '../ai/control.js';
import { brief38Api } from './brief-cards.js';
import { settingsApi, ttsApi, imgApi } from './settings.js';
import briefApi from './brief.js';
import { assistLocalMw44 } from '../kalender/invites.js';

/** Alle Glimt-rutene: minnet, brief, innstillinger, motoren, entitetene, /api/glimt og /api/assist. */
export function mountGlimt(app) {
  app.route('/api/glimt/memory', memoryApi63); // /pending, /conflicts, /stale, /hygiene (før «Glimt husker»-rutene)
  app.route('/api/glimt/memory', remember); // GET/POST/DELETE, POST /:id/apply (per bruker)
  app.route('/api/brief', brief38Api); // nye kort (pakker, familie, skole og jobb, bursdager, nordlys) + POST /gift
  app.route('/api/brief', briefApi); // Glimt-brief
  app.route('/api/glimt/settings', settingsApi);
  app.route('/api/tts', ttsApi);
  app.route('/api/img', imgApi);
  app.route('/api/glimt/agent', agentApi45); // Glimt-motoren (én inngang for alle Glimt-felt)
  app.route('/api/glimt/entities', entitiesApi60); // entitetsregisteret (per bruker)
  app.route('/api/glimt', glimtApi); // POST /api/glimt {prompt, tool:'calendar'} (etter de spesifikke /api/glimt/*-rutene)
  app.use('/api/assist', assistLocalMw44); // local (Kalenderens tolkning) i svaret
  app.route('/api/assist', assistApi); // Glimt-ruteren (sesjon eller app-token, per bruker)
}
