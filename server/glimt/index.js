// Glimt: monterer rutene i domenet. server/index.js kaller mountGlimt(app) der /api/glimt (glimtApi) sto, etter de andre
// /api/glimt/*-rutene (nyheter, kvalitet, 17. mai, oppskrifter, faste oppgaver) og før Chat. Rekkefølgen er bærende (Hono kjører
// handlere og mellomvare i registreringsrekkefølge):
//   – /api/glimt/memory: ryddingen (forslag, motstrid, ubrukte fakta) før «Glimt husker», som har /:id
//   – /api/brief: briefExtras (ski, 17. mai, Min reise og jul, legges på det ferdige svaret) før briefApi
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
//   recipes/             – «Glimt lærer»: lagrede planer (oppskrifter) som lærer av bruk og rettelser (engine.js er krokene i motoren)
//   schedules/           – planlagte oppgaver («Faste oppgaver»): tolkning, lagring, verktøyene schedule.*, kjøring og tikket
//   jul.js               – julemodus (Auto/Av/På, faser, dagens luke) for Glimt-innstillingene og briefen
//   brief-card-settings.js – rekkefølge og av/på for kortene (Innstillinger → Glimt → Brief) og bryteren for nordlysvarselet
//   brief-content.js     – «Innhold i briefen» (/api/brief-cards, montert i mountGlimtEarly) og filteret på GET /api/brief
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
import { settingsApi, ttsApi, imgApi } from './settings.js';
import briefApi, { briefExtras } from './brief.js';
import { assistLocalMw44 } from '../kalender/invites.js';
import { recipesApi61 } from './recipes/api.js';
import { schedulesApi62 } from './schedules/api.js';
import { authOrToken } from '../mobile.js';
import { glimtAgentMw52 } from './last-visit.js';
import { quickParseApi } from './quick-parse.js';
import { myBriefApi } from './my-brief.js';
import { characterApi } from './character.js';
import { brief73Api } from './brief-content.js';

/**
 * Tidlig i index.js (før /api-rutene med requireAuth og før Glimt-motoren): mellomvaren «sist jeg var på X» foran
 * POST /api/glimt/agent, hurtigtolkingen og de lærte ordene, brief-kortene per bruker, Glimt-figuren og «Innhold i briefen».
 * Der mountSrv52 (den gamle srv52.js) sto.
 */
export function mountGlimtEarly(app) {
  app.post('/api/glimt/agent', authOrToken, glimtAgentMw52);
  app.route('/api', quickParseApi); // /api/glimt/quickparse52, /api/glimt/lex52
  app.route('/api', myBriefApi); // /api/brief52, /api/brief52/homelab/:id/start, /api/admin/brief52/access
  app.route('/api', characterApi); // /api/me/glimt-char52, /api/admin/glimt-char52
  app.route('/api', brief73Api); // GET/PUT /api/brief-cards, POST /api/brief-cards/reset
}

/** Alle Glimt-rutene: Glimt lærer, planlagte oppgaver, minnet, brief, innstillinger, motoren, entitetene, /api/glimt og /api/assist. */
export function mountGlimt(app) {
  app.route('/api/glimt/recipes', recipesApi61); // «Glimt lærer»: oppskrifter som lærer av bruk (per bruker)
  app.route('/api/glimt/schedules', schedulesApi62); // planlagte oppgaver, «Faste oppgaver» (per bruker); tikket går i server/jobs/
  app.route('/api/glimt/memory', memoryApi63); // /pending, /conflicts, /stale, /hygiene (før «Glimt husker»-rutene)
  app.route('/api/glimt/memory', remember); // GET/POST/DELETE, POST /:id/apply (per bruker)
  app.use('/api/brief', briefExtras); // ski, 17. mai, Min reise og jul på det ferdige svaret (før: briefJul40 og brief41 i index.js)
  app.route('/api/brief', briefApi); // Glimt-brief med kortene (pakker, familie, skole og jobb, bursdager, nordlys) + POST /gift
  app.route('/api/glimt/settings', settingsApi);
  app.route('/api/tts', ttsApi);
  app.route('/api/img', imgApi);
  app.route('/api/glimt/agent', agentApi45); // Glimt-motoren (én inngang for alle Glimt-felt)
  app.route('/api/glimt/entities', entitiesApi60); // entitetsregisteret (per bruker)
  app.route('/api/glimt', glimtApi); // POST /api/glimt {prompt, tool:'calendar'} (etter de spesifikke /api/glimt/*-rutene)
  app.use('/api/assist', assistLocalMw44); // local (Kalenderens tolkning) i svaret
  app.route('/api/assist', assistApi); // Glimt-ruteren (sesjon eller app-token, per bruker)
}
