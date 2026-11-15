// Prompt 43 (SERVER43): kobler sammen modulene for prompt 43 (montert i index.js).
//   Media: Sonarr, Radarr, qBittorrent, Prowlarr, Glimt, varsler, webhooks, kalenderkilde «media» → server/media/ (mountMedia)
//   Integrasjoner: MEDIA-gruppen (qBittorrent, Prowlarr, Sonarr/Radarr-felt, steg, «Test tilkobling»)                  → integrations-api.js, settings.js
//   Widgets: /api/widgets/media og /api/widgets/catalog                                                                   → widgets43.js
//   Claude-import (/api/chat/import/claude) og AI-minne (/api/ai/memory, brukt av Chat)                                   → server/ai/ (mountAi, mountChat)
//   Google Search Console: årsak ved tomt, «Hent nå», Test per eiendom                                                    → gsc43.js (+ domains-glimt.js)
//   Gjøremål: rekkefølge på lister (/api/tasks/lists/order)                                                                → tasks43.js
export { widgets43Api } from './widgets43.js';
export { gscDomains43Api, gsc43Api, gscViewMw43, gscOverviewMw43 } from './gsc43.js';
export { tasks43Api, tasksOrderMw43 } from './tasks43.js';
