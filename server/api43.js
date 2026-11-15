// Prompt 43 (SERVER43): kobler sammen modulene for prompt 43 (montert i index.js).
//   Media: Sonarr, Radarr, qBittorrent, Prowlarr, Glimt, varsler, webhooks, kalenderkilde «media» → server/media/ (mountMedia)
//   Integrasjoner: MEDIA-gruppen (qBittorrent, Prowlarr, Sonarr/Radarr-felt, steg, «Test tilkobling»)                  → integrations-api.js, settings.js
//   Widgets: /api/widgets/media og /api/widgets/catalog                                                                   → widgets43.js
//   Claude-import (/api/chat/import/claude) og AI-minne (/api/ai/memory, brukt av Chat)                                   → server/ai/ (mountAi, mountChat)
//   Google Search Console: årsak ved tomt, «Hent nå», Test per eiendom                                                    → domener/ (mountDomener)
//   Gjøremål: rekkefølge på lister (/api/tasks/lists/order)                                                                → server/gjoremal/
export { widgets43Api } from './widgets43.js';
