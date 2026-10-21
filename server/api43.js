// Prompt 43 (SERVER43): kobler sammen modulene for prompt 43 (montert i index.js).
//   Media: Sonarr, Radarr, qBittorrent, Prowlarr, Glimt, varsler (jobb hvert 2. min), webhooks, kalenderkilde «media»  → media43.js (+ media43-mock.js)
//   Integrasjoner: MEDIA-gruppen (qBittorrent, Prowlarr, Sonarr/Radarr-felt, steg, «Test tilkobling»)                  → integrations-api.js, settings.js
//   Widgets: /api/widgets/media og /api/widgets/catalog                                                                   → widgets43.js
//   Claude-import (/api/chat/import/claude) og AI-minne (/api/ai/memory, brukt av Chat)                                   → claude-import43.js, ai-memory43.js, chat.js
//   Google Search Console: årsak ved tomt, «Hent nå», Test per eiendom                                                    → gsc43.js (+ domains-glimt.js)
//   Kalender-oppdatering fra appen: /api/apps/kalender/latest                                                             → kal-update43.js
//   Finans: saldokortet (/finans/api/overview) og netto per måned i Liste                                                  → finans/finans43.js
//   Gjøremål: rekkefølge på lister (/api/tasks/lists/order)                                                                → tasks43.js
export { media43Api, mediaCalendarsMw43, startMediaWatch43 } from './media43.js';
export { widgets43Api } from './widgets43.js';
export { claudeImport43Api } from './claude-import43.js';
export { aiMemory43Api } from './ai-memory43.js';
export { gscDomains43Api, gsc43Api, gscViewMw43, gscOverviewMw43 } from './gsc43.js';
export { kalUpdate43Api } from './kal-update43.js';
export { finans43Api, summaryMw43, transactionsMw43 } from './finans/finans43.js';
export { tasks43Api, tasksOrderMw43 } from './tasks43.js';
