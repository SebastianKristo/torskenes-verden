# Vedlegg A – server: rålister

Generert 2026-11-14 av audit-skriptene i `$S/audit-server/` (routes.mjs, usage.mjs, graph.mjs, eqp.mjs). Alle tall er fra testserveren (`test/e2e51/server.mjs`, MOCK_DATA=1).

## A1. Alle endepunkter og hvilke klienter som refererer stien

Kolonne «Klienter»: `web` = public/ (uten finans), `fhweb` = public/finans, `ios` = FinansHub/Shared/Watch51, `kal_ios` = Kalender iOS, `mac` = KalenderMac, `android` = app, `kal_android`, `wear`. `?` = bare treff via et sti-prefiks klienten bygger på (f.eks. `/api/skjold` + sti) – **usikkert**. Tom = ingen streng i klientkoden matcher (kandidat til død rute, men kan brukes av tester, skript, webhooks eller nettleseren direkte). Metoden er streng-matching (estimat).

| Metode | Sti | Klienter |
|---|---|---|
| GET | `/` |  |
| GET | `/.well-known/apple-app-site-association` |  |
| GET | `/.well-known/assetlinks.json` |  |
| GET | `/api/admin/brief52/access` | web |
| PUT | `/api/admin/brief52/access` | web |
| GET | `/api/admin/crashes51` | web |
| DELETE | `/api/admin/crashes51` | web |
| GET | `/api/admin/crashes51/:id{[0-9]+}` | web |
| POST | `/api/admin/crashes51/flush` | web |
| GET | `/api/admin/crashes51/status` | web |
| GET | `/api/admin/dal53/health` | web |
| POST | `/api/admin/dal53/preload` | web |
| GET | `/api/admin/fermion53/config` | web |
| PUT | `/api/admin/fermion53/config` | web |
| GET | `/api/admin/fermion53/health` | web? |
| POST | `/api/admin/fermion53/test` | web |
| GET | `/api/admin/flags51` | web |
| POST | `/api/admin/flags51` | web |
| PATCH | `/api/admin/flags51/:key` | web |
| DELETE | `/api/admin/flags51/:key` | web |
| PUT | `/api/admin/flags51/:key/override` | web |
| GET | `/api/admin/glimt-char52` | web, ios, android |
| PUT | `/api/admin/glimt-char52/:userId` | web, ios, android |
| POST | `/api/admin/impersonate` | web, fhweb, ios, android |
| GET | `/api/admin/impersonate` | web, fhweb, ios, android |
| POST | `/api/admin/impersonate/exit` | web, fhweb, ios, android |
| GET | `/api/admin/impersonate/notice` | web, fhweb |
| POST | `/api/admin/impersonate/notice/seen` | web, fhweb |
| GET | `/api/admin/local-fetch-hosts` | web |
| PUT | `/api/admin/local-fetch-hosts` | web |
| GET | `/api/admin/omlx58/config` | web |
| PUT | `/api/admin/omlx58/config` | web |
| GET | `/api/admin/omlx58/health` | web? |
| POST | `/api/admin/omlx58/test` | web |
| GET | `/api/admin/voxcpm57/config` | web |
| PUT | `/api/admin/voxcpm57/config` | web |
| GET | `/api/admin/voxcpm57/health` | web? |
| POST | `/api/admin/voxcpm57/test` | web |
| GET | `/api/admin/whisper54/config` | web |
| PUT | `/api/admin/whisper54/config` | web |
| GET | `/api/admin/whisper54/health` | web? |
| POST | `/api/admin/whisper54/test` | web |
| GET | `/api/ai/backend` | web? |
| PUT | `/api/ai/backend` | web? |
| POST | `/api/ai/backend/test` | web? |
| DELETE | `/api/ai/backend/think-leak` | web? |
| PUT | `/api/ai/cloud` | web?, fhweb, android |
| GET | `/api/ai/gate` | web? |
| POST | `/api/ai/import` | web, fhweb |
| GET | `/api/ai/import/:importId` | web, fhweb |
| POST | `/api/ai/import/:importId/commit` | web?, fhweb? |
| POST | `/api/ai/import/:importId/undo` | web?, fhweb? |
| GET | `/api/ai/import/sources` | web, fhweb |
| POST | `/api/ai/import/upload` | web, fhweb |
| GET | `/api/ai/jobs` | web?, fhweb, ios, android |
| DELETE | `/api/ai/jobs` | web?, fhweb, ios, android |
| POST | `/api/ai/jobs/:id/cancel` | web?, fhweb |
| POST | `/api/ai/jobs/:id/retry` | web?, fhweb |
| POST | `/api/ai/jobs/retry` | web? |
| POST | `/api/ai/jobs/seen` | web? |
| GET | `/api/ai/keys` | web?, fhweb, ios, android |
| PUT | `/api/ai/keys/:provider` | web, fhweb, ios, android |
| POST | `/api/ai/keys/:provider/test` | web? |
| GET | `/api/ai/library` | web?, fhweb, android |
| GET | `/api/ai/memory` | web? |
| POST | `/api/ai/memory` | web? |
| PATCH | `/api/ai/memory/:id{[0-9]+}` | web? |
| DELETE | `/api/ai/memory/:id{[0-9]+}` | web? |
| GET | `/api/ai/memory/areas` | web? |
| GET | `/api/ai/models` | web?, fhweb, android |
| DELETE | `/api/ai/models/:id` | web?, fhweb, ios, android |
| POST | `/api/ai/models/:id/load` | web? |
| POST | `/api/ai/models/:id/unload` | web? |
| PUT | `/api/ai/models/default` | web?, fhweb, android |
| POST | `/api/ai/models/pull` | web?, fhweb, ios, android |
| GET | `/api/ai/models/pulls` | web?, android |
| DELETE | `/api/ai/models/pulls/:model` | web?, fhweb, android |
| POST | `/api/ai/queue/pause` | web?, fhweb, android |
| GET | `/api/ai/recommend` | web?, fhweb, ios, android |
| POST | `/api/ai/recommend/apply` | web?, fhweb, ios, android |
| POST | `/api/ai/recommend/apply/undo` | web?, android |
| POST | `/api/ai/recommend/ask` | web?, fhweb, ios, android |
| GET | `/api/ai/recommend/plan` | web? |
| GET | `/api/ai/routing` | web?, fhweb, android |
| PUT | `/api/ai/routing` | web?, fhweb, android |
| POST | `/api/ai/selftest` | web?, fhweb, ios, android |
| GET | `/api/ai/status` | web?, fhweb, android |
| GET | `/api/ai/tokens` | web?, fhweb, android |
| POST | `/api/ai/tokens` | web?, fhweb, android |
| DELETE | `/api/ai/tokens/:id` | web?, fhweb, android |
| GET | `/api/ai/usage` | web?, fhweb, android |
| POST | `/api/ai/websearch/test` | web? |
| GET | `/api/app` | web, fhweb, ios, android |
| PUT | `/api/app` | web, fhweb, ios, android |
| GET | `/api/app/android/apk/:version` | web?, fhweb?, android |
| GET | `/api/app/android/latest` | web?, fhweb?, ios, android |
| GET | `/api/app/pages` | web?, fhweb? |
| GET | `/api/apps/kalender/:version/:file` |  |
| GET | `/api/apps/kalender/latest` | mac, kal_android |
| POST | `/api/apps/kalender/log` | kal_ios, kal_android |
| POST | `/api/assist` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| GET | `/api/assist/:id` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| POST | `/api/assist/:id/cancel` | web, fhweb, kal_ios?, mac?, android, kal_android? |
| POST | `/api/assist/:id/handoff` | web, fhweb, kal_ios?, mac?, kal_android? |
| POST | `/api/assist/classify` | web?, kal_ios?, mac?, kal_android? |
| GET | `/api/assist/settings` | web?, kal_ios?, mac?, kal_android? |
| PUT | `/api/assist/settings` | web?, kal_ios?, mac?, kal_android? |
| POST | `/api/auth/2fa` | web, kal_ios, kal_android? |
| DELETE | `/api/auth/2fa` | web, kal_ios, kal_android? |
| POST | `/api/auth/2fa/backup-codes` | web?, kal_ios?, kal_android? |
| POST | `/api/auth/2fa/backup/regenerate` | web?, fhweb, ios, kal_ios?, android, kal_android? |
| POST | `/api/auth/2fa/disable` | web?, fhweb, ios, kal_ios?, android, kal_android? |
| POST | `/api/auth/2fa/enable` | web?, fhweb, ios, kal_ios?, android, kal_android? |
| POST | `/api/auth/2fa/setup` | web?, fhweb, ios, kal_ios?, android, kal_android? |
| GET | `/api/auth/2fa/status` | web?, fhweb, ios, kal_ios?, android, kal_android? |
| POST | `/api/auth/2fa/verify` | web?, kal_ios?, kal_android? |
| POST | `/api/auth/app-code` | web, ios, kal_ios?, android, kal_android? |
| POST | `/api/auth/app-session` | kal_ios?, mac, kal_android? |
| POST | `/api/auth/device-exchange` | kal_ios, android, kal_android? |
| POST | `/api/auth/device-token` | ios, kal_ios?, android, kal_android? |
| POST | `/api/auth/login` | web, fhweb, kal_ios?, kal_android? |
| POST | `/api/auth/logout-all` | web, fhweb, ios, kal_ios?, android, kal_android? |
| POST | `/api/auth/passkey/login` | web, kal_ios?, kal_android? |
| POST | `/api/auth/passkey/options` | web, kal_ios?, kal_android? |
| GET | `/api/auth/passkey/status` | web, kal_ios?, kal_android? |
| POST | `/api/auth/qr` | web, kal_ios, android, kal_android? |
| GET | `/api/auth/qr/:sid` | web, fhweb, ios, kal_ios, android, kal_android, wear |
| GET | `/api/auth/qr/:sid/events` | web, kal_ios?, kal_android? |
| POST | `/api/auth/qr/approve` | web?, fhweb, ios, kal_ios, android, kal_android |
| POST | `/api/auth/qr/finish` | web, kal_ios, android, kal_android? |
| POST | `/api/auth/qr/scan` | web?, fhweb, ios, kal_ios, android, kal_android |
| POST | `/api/auth/qr/session` | web?, ios, kal_ios?, android, kal_android, wear |
| GET | `/api/auth/qr/session/:id` | web?, ios, kal_ios?, android, kal_android, wear |
| POST | `/api/auth/reauth` | web, fhweb, ios, kal_ios?, android, kal_android? |
| POST | `/api/auth/refresh` | kal_ios, kal_android |
| POST | `/api/auth/token` | ios, kal_ios, android, kal_android |
| POST | `/api/auth/totp` | web, fhweb, kal_ios?, kal_android? |
| POST | `/api/auth/totp/disable` | web, fhweb?, ios, kal_ios?, kal_android? |
| POST | `/api/auth/totp/setup` | web, fhweb?, ios, kal_ios?, kal_android? |
| POST | `/api/auth/totp/verify` | web, fhweb?, ios, kal_ios?, kal_android? |
| GET | `/api/background` | web, fhweb, ios, android |
| GET | `/api/background/credits` | fhweb? |
| GET | `/api/background/img/:id` | fhweb?, android |
| GET | `/api/background/oslo` | web, fhweb? |
| POST | `/api/background/oslo` | web, fhweb? |
| DELETE | `/api/background/oslo/:id` | web, fhweb? |
| GET | `/api/background/previews` | web, fhweb, ios, android |
| POST | `/api/backgrounds/:slot` | web |
| DELETE | `/api/backgrounds/:slot` | web |
| GET | `/api/backup/:id/download` | web?, fhweb, ios?, android? |
| POST | `/api/backup/key` | web, fhweb, ios, android |
| GET | `/api/backup/list` | web?, fhweb, ios, android |
| POST | `/api/backup/restore` | web?, fhweb, ios, android |
| POST | `/api/backup/run` | web, fhweb, ios, android |
| GET | `/api/backup/settings` | web, fhweb, ios, android |
| PUT | `/api/backup/settings` | web, fhweb, ios, android |
| GET | `/api/backup/status` | web?, fhweb, ios, android |
| POST | `/api/backup/upload` | web?, fhweb?, ios?, android? |
| GET | `/api/bg/:file` | web, ios, android |
| GET | `/api/bg/gphoto` | web, ios, android |
| POST | `/api/bg/gphoto` | web, ios, android |
| DELETE | `/api/bg/gphoto` | web, ios, android |
| GET | `/api/bg/gphoto/img/:file` |  |
| POST | `/api/bg/gphoto/next` | web, ios |
| POST | `/api/bg/gphoto/refresh` | web, ios, android |
| POST | `/api/bible/explain` | ios, android |
| GET | `/api/bible/next` | web, fhweb, ios, android |
| PUT | `/api/bible/plan` | android |
| GET | `/api/bible/plan` | android |
| POST | `/api/bible/plan/done` | android |
| POST | `/api/bible/read` | fhweb, ios, android |
| PUT | `/api/bible/reminder` | android |
| GET | `/api/bible/saved` | android |
| PUT | `/api/bible/saved` | android |
| POST | `/api/bible/saved` | android |
| DELETE | `/api/bible/saved` | android |
| GET | `/api/bible/settings` | fhweb, ios, android |
| PUT | `/api/bible/settings` | fhweb, ios, android |
| GET | `/api/bible/stats` | fhweb, ios, android |
| GET | `/api/bible/today` | web, fhweb, ios, android |
| GET | `/api/bible/users` |  |
| PUT | `/api/bible/users/:id` |  |
| GET | `/api/birthdays` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| POST | `/api/birthdays` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| PATCH | `/api/birthdays/:id{[0-9]+}` | web, fhweb, ios, kal_ios, mac, android, kal_android? |
| DELETE | `/api/birthdays/:id{[0-9]+}` | web, fhweb, ios, kal_ios, mac, android, kal_android? |
| POST | `/api/birthdays/:id{[0-9]+}/photo` | web, ios?, kal_ios?, mac?, android, kal_android? |
| DELETE | `/api/birthdays/:id{[0-9]+}/photo` | web, ios?, kal_ios?, mac?, android, kal_android? |
| GET | `/api/birthdays/:id{[0-9]+}/photos` | web, fhweb, ios?, kal_ios?, mac?, android, kal_android |
| POST | `/api/birthdays/:id{[0-9]+}/photos` | web, fhweb, ios?, kal_ios?, mac?, android, kal_android |
| GET | `/api/birthdays/:id{[0-9]+}/photos/:pid{[0-9a-f]{16}}` | ios?, kal_ios?, mac?, kal_android? |
| DELETE | `/api/birthdays/:id{[0-9]+}/photos/:pid{[0-9a-f]{16}}` | ios?, kal_ios?, mac?, kal_android? |
| PUT | `/api/birthdays/:id{[0-9]+}/photos/:pid{[0-9a-f]{16}}/primary` | ios?, kal_ios?, mac?, kal_android? |
| PUT | `/api/birthdays/google` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| DELETE | `/api/birthdays/google` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| GET | `/api/birthdays/google/auth` | web, fhweb, ios, kal_ios?, mac?, kal_android? |
| GET | `/api/birthdays/google/calendars` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| GET | `/api/birthdays/google/callback` | ios?, kal_ios?, mac?, kal_android? |
| POST | `/api/birthdays/google/start` | fhweb, ios?, kal_ios, mac?, android, kal_android |
| POST | `/api/birthdays/google/sync` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| PUT | `/api/birthdays/ha` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| GET | `/api/birthdays/ha/calendars` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| POST | `/api/birthdays/ha/import` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| GET | `/api/birthdays/reminders` | ios?, kal_ios?, mac?, kal_android? |
| GET | `/api/boliger/oversikt` | fhweb |
| GET | `/api/brief` | web, fhweb, ios, android |
| GET | `/api/brief-cards` | web, ios, android |
| PUT | `/api/brief-cards` | web, ios, android |
| POST | `/api/brief-cards/reset` | web, ios, android |
| POST | `/api/brief/gift` | web, fhweb, ios, android |
| GET | `/api/brief/settings` | web, fhweb, ios, android |
| PUT | `/api/brief/settings` | web, fhweb, ios, android |
| POST | `/api/brief/trials/:id{[0-9]+}/done` | web, fhweb, ios? |
| GET | `/api/brief/widget` | web?, ios |
| GET | `/api/brief52` | web, ios, android |
| POST | `/api/brief52/homelab/:id/start` | web, ios |
| POST | `/api/calendar/ask` | kal_ios, kal_android |
| POST | `/api/calendar/quick` |  |
| POST | `/api/calendar/quick/:id/cancel` |  |
| POST | `/api/calendar/quick/:id/undo` |  |
| GET | `/api/calendar/quick/jobs` |  |
| POST | `/api/calendar/quick/parse` |  |
| GET | `/api/calendars/events` | web |
| GET | `/api/chat/auto` | web? |
| GET | `/api/chat/chats` | web?, fhweb?, ios, android |
| GET | `/api/chat/chats/:id` | web?, fhweb, ios, android |
| PATCH | `/api/chat/chats/:id` | web?, fhweb, ios, android |
| DELETE | `/api/chat/chats/:id` | web?, fhweb, ios, android |
| GET | `/api/chat/chats/:id/export` | web?, fhweb |
| POST | `/api/chat/chats/:id/feedback` | web?, fhweb? |
| POST | `/api/chat/chats/:id/share` | web?, fhweb |
| DELETE | `/api/chat/chats/:id/share` | web?, fhweb |
| POST | `/api/chat/files` | web, fhweb, ios, android |
| GET | `/api/chat/files/:id` | web?, fhweb?, ios, android |
| DELETE | `/api/chat/files/:id` | web?, fhweb?, ios, android |
| POST | `/api/chat/files/:id/finans` | web?, fhweb?, ios?, android? |
| GET | `/api/chat/files/:id/thumb` | web?, fhweb?, ios?, android? |
| POST | `/api/chat/folders` | web?, fhweb, ios, android |
| PATCH | `/api/chat/folders/:id` | web?, fhweb, ios, android |
| DELETE | `/api/chat/folders/:id` | web?, fhweb, ios, android |
| POST | `/api/chat/import/claude` | web, fhweb, ios, android |
| GET | `/api/chat/import/claude/:importId` | web?, fhweb?, ios, android |
| POST | `/api/chat/import/claude/:importId/commit` | web?, fhweb?, android |
| POST | `/api/chat/import/claude/:importId/undo` | web?, fhweb?, android |
| GET | `/api/chat/knowledge` | web?, fhweb, ios, android |
| GET | `/api/chat/models` | web, fhweb, ios, android |
| DELETE | `/api/chat/models/:name` | web, fhweb, ios, android |
| POST | `/api/chat/models/pull` | web, fhweb, ios, android |
| GET | `/api/chat/mydata` | web? |
| POST | `/api/chat/send` | web, fhweb, ios, android |
| GET | `/api/chat/settings` | web, android |
| PATCH | `/api/chat/settings` | web, android |
| GET | `/api/chat/shared/:token` | web? |
| POST | `/api/chat/system` | web? |
| POST | `/api/chat/transcribe` | web?, fhweb |
| GET | `/api/config` | web, fhweb, android |
| PUT | `/api/config` | web, fhweb, android |
| GET | `/api/config/map` | web, fhweb, android |
| GET | `/api/config/servers` | web, ios, android |
| POST | `/api/config/test/:group` | web, fhweb |
| POST | `/api/crash` | web, ios, kal_ios, android, kal_android |
| GET | `/api/cv` | web |
| PUT | `/api/cv` | web |
| DELETE | `/api/cv` | web |
| GET | `/api/dashboard/layout` | web |
| PUT | `/api/dashboard/layout` | web |
| DELETE | `/api/dashboard/layout` | web |
| GET | `/api/devices` | web, fhweb |
| DELETE | `/api/devices/:id` | web, fhweb?, ios |
| POST | `/api/devices/current` | web, fhweb?, ios |
| GET | `/api/discovery` | web, ios, kal_ios, android, kal_android |
| GET | `/api/domains/:domain/gsc` | web |
| POST | `/api/domains/:domain/gsc/refresh` | web |
| GET | `/api/domains/:domain/gsc/test` | web |
| POST | `/api/domains/:domain/gsc/test` | web |
| POST | `/api/domains/:domain/gsc/verify` | web? |
| GET | `/api/domains/:domain/summary` | web, fhweb |
| POST | `/api/domains/:domain/summary` | web, fhweb |
| GET | `/api/domains/gsc/sites` | web |
| GET | `/api/domains/import` | web |
| POST | `/api/domains/import` | web |
| GET | `/api/domains/overview` | web? |
| GET | `/api/domains/summary` | web?, fhweb, ios, android |
| POST | `/api/domains/token/verify` | web |
| GET | `/api/domener/sammendrag` |  |
| POST | `/api/emo53/suggest` |  |
| GET | `/api/energy` |  |
| GET | `/api/famcal51/drives` | web, ios, android |
| GET | `/api/famcal51/events` | web, ios, android |
| POST | `/api/famcal51/events` | web, ios, android |
| GET | `/api/famcal51/events/:id` | web, ios, android |
| PATCH | `/api/famcal51/events/:id` | web, ios, android |
| DELETE | `/api/famcal51/events/:id` | web, ios, android |
| POST | `/api/famcal51/events/:id/tasks` | web, ios, android |
| GET | `/api/famcal51/settings` | web, ios, android |
| PUT | `/api/famcal51/settings` | web, ios, android |
| PATCH | `/api/famcal51/tasks/:id` | web, ios, android |
| DELETE | `/api/famcal51/tasks/:id` | web, ios, android |
| POST | `/api/famcal51/tasks/:id/claim` | web, ios, android |
| POST | `/api/famcal51/tasks/:id/done` | web, ios, android |
| POST | `/api/famcal51/tasks/:id/release` | web, ios, android |
| GET | `/api/famcal51/tasks/:id/ruter` | web, ios, android |
| GET | `/api/family` | web, fhweb, ios, android |
| GET | `/api/family/checkin` | web, fhweb?, ios, android, wear |
| POST | `/api/family/checkin` | web, fhweb?, ios, android, wear |
| GET | `/api/family/checkin/:id{[0-9]+}` | web, fhweb?, ios, android |
| POST | `/api/family/checkin/:id{[0-9]+}/pickup` | web, fhweb?, ios? |
| PUT | `/api/family/checkin/:id{[0-9]+}/reminder` | web, fhweb?, ios? |
| DELETE | `/api/family/checkin/:id{[0-9]+}/reminder` | web, fhweb?, ios? |
| POST | `/api/family/checkin/:id{[0-9]+}/reply` | web, fhweb, ios? |
| POST | `/api/family/checkin/:id{[0-9]+}/seen` | web, fhweb?, ios? |
| GET | `/api/family/checkin/log` | web?, fhweb?, ios? |
| POST | `/api/family/checkin/request` | web, fhweb?, ios, android |
| GET | `/api/family/checkin/suggest` | web?, fhweb?, ios? |
| GET | `/api/family/events` | web, ios |
| POST | `/api/family/health` | web?, ios, android |
| GET | `/api/family/health/ha` | web, fhweb, ios, android |
| PUT | `/api/family/health/ha` | web, fhweb, ios, android |
| POST | `/api/family/health/ha/consent` | web?, ios? |
| PUT | `/api/family/health/ha/devices/:id` | web?, ios?, android |
| POST | `/api/family/health/ha/sync` | web?, ios? |
| DELETE | `/api/family/health/me` | web?, ios, android |
| GET | `/api/family/health50` | web, ios, android |
| GET | `/api/family/health50/:userId` | web, ios, android |
| POST | `/api/family/health50/:userId/request` | web, ios? |
| PUT | `/api/family/health50/goal` | web, ios? |
| POST | `/api/family/location` | web, fhweb, ios, android |
| PUT | `/api/family/me` | web, fhweb, ios, android |
| PUT | `/api/family/me/source` | web, fhweb, ios, android |
| GET | `/api/family/people50` | web, ios, android |
| GET | `/api/family/people50/:userId` | web, ios? |
| PUT | `/api/family/photo/:userId` | web, fhweb, ios, android |
| DELETE | `/api/family/photo/:userId` | web, fhweb, ios, android |
| GET | `/api/family/photo/:userId` | web, fhweb, ios, android |
| POST | `/api/family/ping/:userId` | web, fhweb, ios, android |
| GET | `/api/family/places` | web, ios, android |
| POST | `/api/family/places` | web, ios, android |
| GET | `/api/family/places/:id{[0-9]+}` | web, ios, android |
| PATCH | `/api/family/places/:id{[0-9]+}` | web, ios, android |
| DELETE | `/api/family/places/:id{[0-9]+}` | web, ios, android |
| POST | `/api/family/places/:id{[0-9]+}/areas` | web, ios? |
| PATCH | `/api/family/places/:id{[0-9]+}/areas/:areaId{[0-9]+}` | web, ios? |
| DELETE | `/api/family/places/:id{[0-9]+}/areas/:areaId{[0-9]+}` | web, ios? |
| GET | `/api/family/places/regions` | web?, ios, android |
| GET | `/api/family/positions` | web, fhweb, ios, android |
| GET | `/api/family/today50` | web, ios, android |
| GET | `/api/family/track/:userId` | web, fhweb, ios, android |
| GET | `/api/family/vendor/:file` | web, fhweb, ios? |
| GET | `/api/family/zone-alerts` | web, fhweb, ios, android |
| PUT | `/api/family/zone-alerts` | web, fhweb, ios, android |
| POST | `/api/family/zones` | web, fhweb, ios, android |
| PATCH | `/api/family/zones/:id` | web, fhweb, ios, android |
| DELETE | `/api/family/zones/:id` | web, fhweb, ios, android |
| GET | `/api/family/zones/:id{[0-9]+}/icon.png` | web?, ios?, android? |
| GET | `/api/family/zones/:id{[0-9]+}/icon.svg` | web?, ios?, android? |
| PUT | `/api/family/zones/:id/notify` | web, fhweb, ios, android? |
| GET | `/api/files/:name` | ios |
| POST | `/api/finans/kvitteringer` |  |
| POST | `/api/finans/kvitteringer/ocr` |  |
| GET | `/api/flags` | web, ios, kal_ios, android, kal_android |
| GET | `/api/geo/address` | web, fhweb, ios, kal_ios, android, kal_android |
| POST | `/api/glimt` | web, fhweb |
| POST | `/api/glimt/agent` | web, fhweb, ios, kal_ios, android, kal_android, wear |
| GET | `/api/glimt/agent/calendar70/:id` | web?, kal_ios?, kal_android? |
| PATCH | `/api/glimt/agent/calendar70/:id` | web?, kal_ios?, kal_android? |
| POST | `/api/glimt/agent/calendar70/:id/undo` | web?, kal_ios?, kal_android? |
| GET | `/api/glimt/agent/calendars` | web?, kal_ios?, kal_android? |
| POST | `/api/glimt/agent/confirm` | web, fhweb, ios, kal_ios?, android, kal_android? |
| GET | `/api/glimt/agent/convo/:id` | web, kal_ios?, kal_android? |
| DELETE | `/api/glimt/agent/convo/:id` | web, kal_ios?, kal_android? |
| GET | `/api/glimt/agent/fast` | web, kal_ios?, kal_android? |
| PUT | `/api/glimt/agent/fast` | web, kal_ios?, kal_android? |
| DELETE | `/api/glimt/agent/fast/cache` | web, kal_ios?, kal_android? |
| POST | `/api/glimt/agent/fast/warm` | web, kal_ios?, kal_android? |
| GET | `/api/glimt/agent/log` | web?, kal_ios?, kal_android? |
| POST | `/api/glimt/agent/preview` | web?, kal_ios, kal_android |
| GET | `/api/glimt/agent/settings` | web, fhweb, kal_ios?, kal_android? |
| PUT | `/api/glimt/agent/settings` | web, fhweb, kal_ios?, kal_android? |
| POST | `/api/glimt/agent/stream` | web, ios, kal_ios?, android, kal_android? |
| POST | `/api/glimt/agent/stream/save` | web, ios, kal_ios?, android, kal_android? |
| POST | `/api/glimt/agent/stream/stop` | web?, ios, kal_ios?, android, kal_android? |
| GET | `/api/glimt/agent/tools` | web?, kal_ios?, kal_android? |
| GET | `/api/glimt/agent/trace` | web?, kal_ios?, kal_android? |
| GET | `/api/glimt/agent/trace/view` | web?, kal_ios?, kal_android? |
| GET | `/api/glimt/agent/understand` | web, ios, kal_ios?, kal_android? |
| PUT | `/api/glimt/agent/understand` | web, ios, kal_ios?, kal_android? |
| GET | `/api/glimt/entities` | web, ios, android |
| POST | `/api/glimt/entities` | web, ios, android |
| PATCH | `/api/glimt/entities/:id` | web?, ios, android |
| DELETE | `/api/glimt/entities/:id` | web?, ios, android |
| GET | `/api/glimt/entities/resolve` | web?, ios, android |
| GET | `/api/glimt/lex52` | web?, ios, android |
| POST | `/api/glimt/lex52` | web?, ios, android |
| DELETE | `/api/glimt/lex52/:from` | web? |
| GET | `/api/glimt/mai17` | web, ios, android |
| PUT | `/api/glimt/mai17/design` | web, ios, android |
| POST | `/api/glimt/mai17/hurra` | web, ios, android |
| GET | `/api/glimt/memory` | web, ios, android |
| POST | `/api/glimt/memory` | web, ios, android |
| DELETE | `/api/glimt/memory/:id` | web?, ios, android |
| POST | `/api/glimt/memory/:id/apply` | web, fhweb, ios, android |
| GET | `/api/glimt/memory/conflicts` | web?, ios, android |
| POST | `/api/glimt/memory/conflicts/:id/resolve` | web?, android |
| GET | `/api/glimt/memory/hygiene` | web?, ios, android |
| PUT | `/api/glimt/memory/hygiene` | web?, ios, android |
| POST | `/api/glimt/memory/hygiene/run-now` | web?, ios, android |
| GET | `/api/glimt/memory/pending` | web?, ios, android |
| POST | `/api/glimt/memory/pending/:id/approve` | web?, android |
| POST | `/api/glimt/memory/pending/:id/edit` | web? |
| POST | `/api/glimt/memory/pending/:id/reject` | web?, android |
| GET | `/api/glimt/memory/stale` | web?, ios, android |
| POST | `/api/glimt/memory/stale/:id/keep` | web?, ios, android |
| POST | `/api/glimt/news-digest` | web? |
| POST | `/api/glimt/quality/abort` | web?, ios, android |
| POST | `/api/glimt/quality/run-now` | web?, ios, android |
| GET | `/api/glimt/quality/runs` | web?, ios, android |
| GET | `/api/glimt/quality/runs/:id` | web, ios, android |
| GET | `/api/glimt/quality/settings` | web?, ios, android |
| PUT | `/api/glimt/quality/settings` | web?, ios, android |
| GET | `/api/glimt/quality/weekly` | web?, ios, android |
| POST | `/api/glimt/quickparse52` | web, ios, android |
| GET | `/api/glimt/recipes` | web, ios, android |
| GET | `/api/glimt/recipes/:id` | web, ios, android |
| PATCH | `/api/glimt/recipes/:id` | web, ios, android |
| DELETE | `/api/glimt/recipes/:id` | web, ios, android |
| POST | `/api/glimt/recipes/:id/test` | web? |
| POST | `/api/glimt/recipes/feedback` | web?, ios, android |
| GET | `/api/glimt/recipes/settings` | web, ios, android |
| PUT | `/api/glimt/recipes/settings` | web, ios, android |
| GET | `/api/glimt/recipes/stats` | web?, ios, android |
| GET | `/api/glimt/schedules` | web, ios, android |
| POST | `/api/glimt/schedules` | web, ios, android |
| GET | `/api/glimt/schedules/:id` | web, ios, android |
| PATCH | `/api/glimt/schedules/:id` | web, ios, android |
| DELETE | `/api/glimt/schedules/:id` | web, ios, android |
| POST | `/api/glimt/schedules/:id/run-now` | web? |
| GET | `/api/glimt/schedules/:id/runs` | web? |
| POST | `/api/glimt/schedules/parse` | web?, ios, android |
| GET | `/api/glimt/schedules/settings` | web, ios, android |
| PUT | `/api/glimt/schedules/settings` | web, ios, android |
| GET | `/api/glimt/settings` | web, fhweb, ios, android |
| PUT | `/api/glimt/settings` | web, fhweb, ios, android |
| GET | `/api/grades` | web |
| POST | `/api/grades` | web |
| PATCH | `/api/grades/:id` | web |
| DELETE | `/api/grades/:id` | web |
| GET | `/api/gsc` | web |
| DELETE | `/api/gsc` | web |
| GET | `/api/gsc/auth` | web |
| GET | `/api/gsc/callback` | web? |
| POST | `/api/gsc/service-account` | web |
| DELETE | `/api/gsc/service-account` | web |
| POST | `/api/gsc/site` | web |
| POST | `/api/gsc/start` | web? |
| GET | `/api/gsc/test` | web? |
| POST | `/api/gsc/test` | web? |
| GET | `/api/health` | web, fhweb, ios, kal_ios, android, kal_android |
| GET | `/api/hjemlys` | web, fhweb, ios, android |
| PATCH | `/api/hjemlys/:id` | web, fhweb, ios, android |
| POST | `/api/hjemlys/:id/end` | web, android |
| POST | `/api/hjemlys/:id/home` | android |
| GET | `/api/hjemlys/:id/log` | web, fhweb |
| POST | `/api/hjemlys/:id/ok` | android |
| POST | `/api/hjemlys/notice` | web, fhweb, ios, android |
| PATCH | `/api/hjemlys/notice/:id` | web, fhweb, ios, android |
| POST | `/api/hjemlys/notice/:id/now` | fhweb |
| GET | `/api/hjemlys/notices` |  |
| PUT | `/api/hjemlys/phone` |  |
| GET | `/api/hjemlys/public/:token` |  |
| GET | `/api/hjemlys/recipients` | web, fhweb, ios, android |
| GET | `/api/hjemlys/route` | web, ios, android |
| POST | `/api/hjemlys/start` | web, fhweb, ios, android |
| POST | `/api/hjemlys/status` | ios |
| GET | `/api/hjemlys/suggest` | web, fhweb, ios, android |
| POST | `/api/hjemlys/tokens` | ios |
| POST | `/api/homes/:id{[0-9]+}/expenses` | fhweb |
| PATCH | `/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}` | fhweb?, android |
| GET | `/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}/history` | fhweb? |
| POST | `/api/homes/:id{[0-9]+}/members` | fhweb? |
| GET | `/api/homes/:id{[0-9]+}/shareable` | fhweb? |
| POST | `/api/huske/glimt-jobs` | android |
| GET | `/api/icons/:prefix/:file` | web, fhweb, ios, android |
| GET | `/api/icons/search` | web, fhweb, ios, android |
| GET | `/api/icons/sets` | web, fhweb?, ios, android? |
| POST | `/api/icons/suggest` | web, fhweb, ios, android |
| GET | `/api/img` | fhweb, ios |
| GET | `/api/integrasjoner` |  |
| GET | `/api/integrasjoner/:id` |  |
| PUT | `/api/integrasjoner/:id` |  |
| DELETE | `/api/integrasjoner/:id/:key` |  |
| POST | `/api/integrasjoner/:id/test` |  |
| GET | `/api/integrasjoner/status` |  |
| GET | `/api/integrations` | web, fhweb, ios, android |
| GET | `/api/integrations/:id` | web, fhweb, ios, android |
| PUT | `/api/integrations/:id` | web, fhweb, ios, android |
| DELETE | `/api/integrations/:id/:key` | web, fhweb, android |
| POST | `/api/integrations/:id/test` | web, fhweb, android |
| GET | `/api/integrations/status` | ios, android |
| GET | `/api/kalender` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| GET | `/api/kalender/abonnementer.ics` | web?, ios?, kal_ios?, kal_android? |
| GET | `/api/kalender/abonnementer/events` | web?, ios?, kal_ios?, kal_android? |
| GET | `/api/kalender/calendars` | web, ios?, kal_ios, mac, kal_android |
| POST | `/api/kalender/calendars` | web, ios?, kal_ios, mac, kal_android |
| PATCH | `/api/kalender/calendars/:id` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| DELETE | `/api/kalender/calendars/:id` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| GET | `/api/kalender/calendars/google` | web, fhweb, ios, kal_ios, mac?, android, kal_android |
| PUT | `/api/kalender/calendars/google` | web, fhweb, ios, kal_ios, mac?, android, kal_android |
| POST | `/api/kalender/calendars/ha` | web, ios?, kal_ios, mac?, kal_android |
| POST | `/api/kalender/calendars/ical` | web, ios?, kal_ios, mac?, kal_android |
| POST | `/api/kalender/calendars/ical/:id/refresh` | web?, ios?, kal_ios?, mac?, kal_android? |
| POST | `/api/kalender/calendars/migration` | web?, ios?, kal_ios?, mac?, kal_android? |
| POST | `/api/kalender/calendars/migration/undo` | web, ios?, kal_ios, mac?, kal_android |
| PUT | `/api/kalender/calendars/prefs` | web?, ios?, kal_ios, mac?, kal_android |
| POST | `/api/kalender/calendars/skole/refresh` | web?, ios?, kal_ios?, mac?, kal_android? |
| POST | `/api/kalender/calendars/url/preview` | web?, ios?, kal_ios?, mac?, kal_android? |
| POST | `/api/kalender/describe` | web, fhweb, ios, kal_ios?, android, kal_android? |
| POST | `/api/kalender/events` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| GET | `/api/kalender/events/:id` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| PATCH | `/api/kalender/events/:id` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| DELETE | `/api/kalender/events/:id` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| POST | `/api/kalender/events/:id/copy` | web, fhweb, ios?, kal_ios?, mac?, kal_android? |
| POST | `/api/kalender/events/:id/invite` | web, ios?, kal_ios?, mac?, kal_android? |
| GET | `/api/kalender/geo` | web, ios?, kal_ios?, kal_android? |
| POST | `/api/kalender/glimt/search` | web?, ios?, kal_ios, kal_android |
| GET | `/api/kalender/google/mapping` | web, ios?, kal_ios, kal_android |
| PUT | `/api/kalender/google/mapping` | web, ios?, kal_ios, kal_android |
| GET | `/api/kalender/google/mapping/jobs/:id` | web?, ios?, kal_ios?, kal_android? |
| GET | `/api/kalender/ha/calendars` | web, ios?, kal_ios, kal_android |
| GET | `/api/kalender/invites` | web?, ios?, kal_ios?, kal_android? |
| POST | `/api/kalender/invites/:id{[0-9]+}/respond` | web?, ios?, kal_ios?, kal_android? |
| POST | `/api/kalender/notify/test` | web?, ios?, kal_ios, kal_android |
| GET | `/api/kalender/outbox` | web?, ios?, kal_ios?, kal_android? |
| POST | `/api/kalender/quick` | web, fhweb, ios, kal_ios?, android, kal_android |
| POST | `/api/kalender/quick/:id/cancel` | web, fhweb, ios?, kal_ios?, android, kal_android? |
| POST | `/api/kalender/quick/:id/undo` | web, fhweb, ios?, kal_ios?, kal_android? |
| GET | `/api/kalender/quick/jobs` | web, fhweb, ios, kal_ios?, android, kal_android |
| POST | `/api/kalender/quick/parse` | web?, ios, kal_ios?, android, kal_android? |
| POST | `/api/kalender/refresh` | web?, ios?, kal_ios?, kal_android? |
| GET | `/api/kalender/search` | web, fhweb, ios, kal_ios?, android, kal_android? |
| GET | `/api/kalender/subjects` | web?, ios?, kal_ios?, kal_android? |
| PUT | `/api/kalender/subjects/:key` | web?, ios?, kal_ios?, kal_android? |
| GET | `/api/kalender/weather` | web, ios?, kal_ios, kal_android |
| GET | `/api/kart` | web, fhweb, ios, android |
| POST | `/api/kart/live` | ios, android |
| GET | `/api/kart/people` |  |
| GET | `/api/kart/prefs` | web, fhweb, ios, android |
| PUT | `/api/kart/prefs` | web, fhweb, ios, android |
| GET | `/api/kart/search` | web, fhweb, ios, android |
| GET | `/api/kart/stops` | web, fhweb, ios, android |
| GET | `/api/kart/stops/:id/departures` | web, fhweb |
| GET | `/api/kart/vehicles` | web, fhweb, ios, android |
| GET | `/api/kart/zones` |  |
| DELETE | `/api/layouts` | web |
| GET | `/api/live/aktiviteter` | ios, android |
| POST | `/api/live/handling` | ios, android |
| GET | `/api/live/innstillinger` | web, ios, android |
| PUT | `/api/live/innstillinger` | web, ios, android |
| POST | `/api/live/tokens` | ios |
| DELETE | `/api/live/tokens` | ios |
| POST | `/api/login` | web, fhweb, ios, mac, android |
| POST | `/api/logout` | web, fhweb |
| PUT | `/api/matplan/auto` | web? |
| POST | `/api/matplan/calendar/rotate` | web? |
| POST | `/api/matplan/cooks` | web? |
| PUT | `/api/matplan/cooks` | web? |
| DELETE | `/api/matplan/cooks/:name` | web? |
| PUT | `/api/matplan/cooks/:name/best` | web? |
| PATCH | `/api/matplan/day/:date` | web? |
| POST | `/api/matplan/dishes` | web? |
| PATCH | `/api/matplan/dishes/:id` | web? |
| DELETE | `/api/matplan/dishes/:id` | web? |
| PUT | `/api/matplan/dishes/:id/fixed` | web? |
| POST | `/api/matplan/dishes/:id/links` | web? |
| DELETE | `/api/matplan/dishes/:id/links/:lid` | web? |
| GET | `/api/matplan/files/:id` | web? |
| GET | `/api/matplan/folders` | web? |
| POST | `/api/matplan/folders` | web? |
| PATCH | `/api/matplan/folders/:id` | web? |
| DELETE | `/api/matplan/folders/:id` | web? |
| POST | `/api/matplan/hellofresh` | web? |
| POST | `/api/matplan/hellofresh/:id/add` | web? |
| POST | `/api/matplan/meals` | web? |
| DELETE | `/api/matplan/meals/:id` | web? |
| POST | `/api/matplan/plan` | web? |
| POST | `/api/matplan/recipes/import` | web? |
| POST | `/api/matplan/recipes/import/save` | web? |
| GET | `/api/matplan/recipes/jobs` | web? |
| DELETE | `/api/matplan/recipes/jobs/:id` | web? |
| POST | `/api/matplan/recipes/jobs/:id/retry` | web? |
| POST | `/api/matplan/recipes/scan` | web? |
| POST | `/api/matplan/shopping` | web? |
| DELETE | `/api/matplan/shopping/:id` | web? |
| POST | `/api/matplan/shopping/:id/toggle` | web? |
| POST | `/api/matplan/swap` | web? |
| GET | `/api/matplan/week` | web |
| GET | `/api/matplan/week.ics` | web? |
| GET | `/api/me` | web, fhweb, ios, android |
| PATCH | `/api/me` | web, fhweb, ios, android |
| GET | `/api/me/avatar` | web, fhweb, ios, android |
| POST | `/api/me/avatar` | web, fhweb, ios, android |
| PUT | `/api/me/avatar` | web, fhweb, ios, android |
| DELETE | `/api/me/avatar` | web, fhweb, ios, android |
| GET | `/api/me/glimt-char52` | web?, fhweb?, android |
| PUT | `/api/me/glimt-char52` | web?, fhweb?, android |
| GET | `/api/me/home-departures` | web?, fhweb, ios, android |
| PUT | `/api/me/home-departures` | web?, fhweb, ios, android |
| GET | `/api/me/layout` | web, fhweb, ios, kal_ios, android, kal_android |
| PUT | `/api/me/layout` | web, fhweb, ios, kal_ios, android, kal_android |
| GET | `/api/me/notify` | web, fhweb, ios, android |
| PUT | `/api/me/notify` | web, fhweb, ios, android |
| POST | `/api/me/notify/sound` | web, fhweb, ios, android |
| GET | `/api/me/notify/sound` | web, fhweb, ios, android |
| DELETE | `/api/me/notify/sound` | web, fhweb, ios, android |
| GET | `/api/me/ntfy51` | web, fhweb?, android |
| POST | `/api/me/ntfy51/test` | web, fhweb?, android |
| POST | `/api/me/ntfy51/topics` | web, fhweb?, android |
| DELETE | `/api/me/ntfy51/topics/:id` | web, fhweb?, android |
| GET | `/api/me/photo-window` | web, fhweb, ios, android |
| POST | `/api/me/photo-window` | web, fhweb, ios, android |
| DELETE | `/api/me/photo-window` | web, fhweb, ios, android |
| GET | `/api/me/profiles` | web?, fhweb, ios, android |
| GET | `/api/me/server` | web, fhweb, ios, kal_ios, android, kal_android |
| PUT | `/api/me/server` | web, fhweb, ios, kal_ios, android, kal_android |
| GET | `/api/me/sessions` | web, fhweb, ios, android |
| GET | `/api/me/share51` | web?, fhweb? |
| PUT | `/api/me/share51` | web?, fhweb? |
| GET | `/api/me/shortcuts` | web, fhweb? |
| PUT | `/api/me/shortcuts` | web, fhweb? |
| POST | `/api/me/shortcuts/resolve` | web, fhweb? |
| GET | `/api/me/stops` | web?, fhweb, ios, android, wear |
| PUT | `/api/me/stops` | web?, fhweb, ios, android, wear |
| GET | `/api/me/theme51` | web, fhweb?, ios, android |
| PUT | `/api/me/theme51` | web, fhweb?, ios, android |
| GET | `/api/medctl51/links` | web |
| PUT | `/api/medctl51/links/:userId` | web |
| GET | `/api/medctl51/now` | web, ios, android, wear |
| POST | `/api/medctl51/sessions/:id/:action` | web, ios |
| GET | `/api/media/access` | web |
| PUT | `/api/media/access` | web |
| POST | `/api/media/altSpeed` | web?, ios, android |
| POST | `/api/media/apps/:id{[0-9]+}/sync` | web?, android |
| GET | `/api/media/bilde/:type{serie\|film}/:id{[0-9]+}/:variant{poster\|fanart\|banner}` | web, android |
| GET | `/api/media/calendar` | web?, ios |
| POST | `/api/media/command` | web?, ios, android |
| GET | `/api/media/cover` | web? |
| GET | `/api/media/diag` | web?, ios |
| GET | `/api/media/diagnostics` | web, ios, android |
| POST | `/api/media/diagnostics` | web, ios, android |
| GET | `/api/media/disk` | web? |
| GET | `/api/media/ekstern` | web? |
| PUT | `/api/media/episode/monitor` | web?, ios |
| PUT | `/api/media/episodes/:id{[0-9]+}` | web?, android |
| DELETE | `/api/media/episodes/:id{[0-9]+}/file` | web?, ios, android |
| POST | `/api/media/glimt` | web?, ios, android |
| GET | `/api/media/health` | web? |
| GET | `/api/media/history` | web, fhweb, android |
| POST | `/api/media/hook/:svc` | web? |
| GET | `/api/media/indexers` | web?, ios, android |
| POST | `/api/media/indexers` | web?, ios, android |
| POST | `/api/media/indexers/:id{[0-9]+}/test` | web?, ios, android |
| GET | `/api/media/indexers/health` | web? |
| GET | `/api/media/indexers/schema` | web?, ios, android |
| POST | `/api/media/indexers/test` | web?, android |
| POST | `/api/media/indexers/testall` | web? |
| GET | `/api/media/movies` | web?, ios, android |
| POST | `/api/media/movies` | web?, ios, android |
| GET | `/api/media/movies/:id{[0-9]+}` | web?, ios, android |
| PUT | `/api/media/movies/:id{[0-9]+}` | web?, ios, android |
| DELETE | `/api/media/movies/:id{[0-9]+}` | web?, ios, android |
| DELETE | `/api/media/movies/:id{[0-9]+}/file` | web?, ios, android |
| GET | `/api/media/movies/lookup` | web?, ios, android |
| GET | `/api/media/now` | web, fhweb, android |
| GET | `/api/media/nrk/bibliotek` | web? |
| GET | `/api/media/nrk/bilde` | web?, ios |
| POST | `/api/media/nrk/folger` | web?, android |
| DELETE | `/api/media/nrk/folger/:id` | web?, android |
| POST | `/api/media/nrk/folger/:id/sjekk` | web?, android |
| GET | `/api/media/nrk/jobber` | web?, android |
| POST | `/api/media/nrk/jobber` | web?, android |
| DELETE | `/api/media/nrk/jobber/:id` | web?, android |
| POST | `/api/media/nrk/jobber/:id/:handling{avbryt\|igjen}` | web?, android |
| POST | `/api/media/nrk/rydd` | web?, android |
| GET | `/api/media/nrk/serie` | web? |
| GET | `/api/media/nrk/serie/:sid` | web? |
| GET | `/api/media/nrk/serie/:sid/sesong/:navn` | web? |
| GET | `/api/media/nrk/sok` | web? |
| GET | `/api/media/nrk/status` | web? |
| GET | `/api/media/poster` | web? |
| GET | `/api/media/qualityprofiles` | web?, ios, android |
| GET | `/api/media/recent` | web |
| GET | `/api/media/release` | web?, ios, android |
| POST | `/api/media/release` | web?, ios, android |
| POST | `/api/media/release/search` | web?, ios, android |
| GET | `/api/media/release/search/:jobId` | web?, ios, android |
| DELETE | `/api/media/release/search/:jobId` | web?, ios, android |
| GET | `/api/media/release/search/:jobId/events` | web? |
| GET | `/api/media/rootfolders` | web?, ios, android |
| POST | `/api/media/search` | web? |
| GET | `/api/media/search/:jobId` | web? |
| DELETE | `/api/media/search/:jobId` | web? |
| GET | `/api/media/search/:jobId/events` | web? |
| GET | `/api/media/series` | web?, ios, android |
| POST | `/api/media/series` | web?, ios, android |
| GET | `/api/media/series/:id{[0-9]+}` | web?, ios, android |
| PUT | `/api/media/series/:id{[0-9]+}` | web?, ios, android |
| DELETE | `/api/media/series/:id{[0-9]+}` | web?, ios, android |
| GET | `/api/media/series/lookup` | web?, ios, android |
| GET | `/api/media/servers` | web, fhweb, ios, android |
| POST | `/api/media/servers` | web, fhweb, ios, android |
| PUT | `/api/media/servers/:id` | web?, fhweb, ios, android |
| DELETE | `/api/media/servers/:id` | web?, fhweb, ios, android |
| POST | `/api/media/servers/:id/test` | web? |
| PUT | `/api/media/servers/select` | web?, fhweb, ios, android |
| GET | `/api/media/settings` | web |
| PUT | `/api/media/settings` | web |
| GET | `/api/media/status` | web, ios, android |
| GET | `/api/media/torrents` | web?, ios, android |
| DELETE | `/api/media/torrents/:hash` | web?, ios, android |
| POST | `/api/media/torrents/:hash{[a-fA-F0-9]{40}\|[a-fA-F0-9]{64}}/start` | web, ios, android |
| POST | `/api/media/torrents/:hash/:op{pause\|resume\|recheck\|forceStart\|priority\|sequential}` | web, ios, android |
| GET | `/api/media/torrents/:hash/files` | web?, ios, android |
| POST | `/api/media/torrents/:hash/files` | web?, ios, android |
| GET | `/api/media/torrents/categories` | web? |
| POST | `/api/media/torrents/magnet` | web?, ios, android |
| POST | `/api/media/torrents/magnet/check` | web? |
| POST | `/api/media/torrents/pauseAll` | web?, ios |
| POST | `/api/media/torrents/resumeAll` | web?, ios |
| POST | `/api/media/track` | web?, ios, android |
| GET | `/api/media/track` | web?, ios, android |
| GET | `/api/media/track/:id` | web?, ios, android |
| GET | `/api/media/transferinfo` | web?, android |
| GET | `/api/media/unmonitored` | web, ios, android |
| POST | `/api/media/unmonitored/delete` | web?, ios, android |
| GET | `/api/media/unmonitored/pending/:id` | web, ios |
| DELETE | `/api/media/unmonitored/pending/:id` | web, ios |
| GET | `/api/media/upcoming` | web?, ios, android |
| GET | `/api/media/widget` | web? |
| GET | `/api/media/yubal/bilde` | web?, ios |
| GET | `/api/media/yubal/info` | web? |
| GET | `/api/media/yubal/jobs` | web?, android |
| POST | `/api/media/yubal/jobs` | web?, android |
| DELETE | `/api/media/yubal/jobs` | web?, android |
| DELETE | `/api/media/yubal/jobs/:id` | web?, android |
| POST | `/api/media/yubal/jobs/:id/cancel` | web?, android |
| GET | `/api/media/yubal/status` | web? |
| GET | `/api/media/yubal/subscriptions` | web?, android |
| POST | `/api/media/yubal/subscriptions` | web?, android |
| PATCH | `/api/media/yubal/subscriptions/:id` | web?, android |
| DELETE | `/api/media/yubal/subscriptions/:id` | web?, android |
| POST | `/api/media/yubal/subscriptions/:id/sync` | web?, android |
| GET | `/api/media/yubal/subscriptions/:id/tracks` | web? |
| POST | `/api/media/yubal/subscriptions/sync` | web?, android |
| GET | `/api/media51/audio/continue` | web, ios, android |
| GET | `/api/media51/audio/cover/:id` |  |
| PUT | `/api/media51/audio/me` | web, ios, android |
| GET | `/api/media51/audio/status` |  |
| GET | `/api/media51/status` | web, ios, android |
| GET | `/api/media51/storage` | web, ios, android |
| POST | `/api/media51/storage/delete` | web, ios, android |
| GET | `/api/media51/storage/deletions` |  |
| POST | `/api/media51/storage/deletions/:id/undo` | web, ios, android |
| GET | `/api/media51/storage/trash` |  |
| POST | `/api/media51/storage/trash/empty` | web, ios, android |
| GET | `/api/media51/subs/:kind/:id` | web, ios |
| POST | `/api/media51/subs/:kind/:id/search` | web, ios, android |
| GET | `/api/media51/subs/status` | web, ios, android |
| GET | `/api/media51/subs/wanted` | web, ios, android |
| GET | `/api/media51/tonight` | web, ios, android |
| GET | `/api/media51/tonight/home` |  |
| GET | `/api/media51/tonight/profile` |  |
| PUT | `/api/media51/tonight/profile` |  |
| GET | `/api/mobile/home` | fhweb, ios, android |
| GET | `/api/mobile/widgets` | ios, android |
| GET | `/api/news` |  |
| POST | `/api/news/glimt` | web, fhweb, ios, android |
| GET | `/api/news/glimt/prefs` |  |
| PUT | `/api/news/glimt/prefs` |  |
| GET | `/api/news/glimt/sources` | fhweb, ios |
| GET | `/api/news/saved` | web, ios, android |
| POST | `/api/news/saved` | web, ios, android |
| GET | `/api/news/saved/:id` | web, ios, android |
| DELETE | `/api/news/saved/:id` | web, ios, android |
| GET | `/api/news/saved/:id/img/:n` |  |
| POST | `/api/news/saved/:id/retry` | web, ios, android |
| GET | `/api/notify/pending` | ios, android |
| GET | `/api/offline51/versions` |  |
| POST | `/api/onboard51/accept` | web, ios, android |
| POST | `/api/onboard51/invites` | web, ios |
| GET | `/api/onboard51/invites` | web, ios |
| DELETE | `/api/onboard51/invites/:id` | web, ios |
| POST | `/api/onboard51/preview` | web, ios, android |
| POST | `/api/onboarding/link` | web, fhweb, ios, android |
| POST | `/api/ops51/backup/key` | web? |
| POST | `/api/ops51/backup/restore-test` | web? |
| GET | `/api/ops51/backup/restore-tests` | web? |
| GET | `/api/ops51/backup/restore-tests/:id` | web? |
| POST | `/api/ops51/backup/run` | web? |
| GET | `/api/ops51/backup/runs` | web? |
| GET | `/api/ops51/backup/runs/:id` | web? |
| GET | `/api/ops51/backup/settings` | web? |
| PUT | `/api/ops51/backup/settings` | web? |
| GET | `/api/ops51/db` | web? |
| POST | `/api/ops51/db/maintenance` | web? |
| GET | `/api/ops51/smoke` | web? |
| GET | `/api/ops51/summary` | web? |
| GET | `/api/ops51/updates` | web? |
| POST | `/api/ops51/updates/discard` | web? |
| POST | `/api/ops51/updates/promote` | web? |
| POST | `/api/ops51/updates/rollback-image` | web? |
| POST | `/api/ops51/updates/stage` | web? |
| PUT | `/api/password` | web |
| GET | `/api/photo-window` | web, fhweb, ios, android |
| GET | `/api/playback/history` | web?, fhweb, android |
| GET | `/api/playback/libraries` | web?, fhweb, android |
| DELETE | `/api/playback/plex` | web? |
| POST | `/api/playback/plex/pin` | web?, fhweb, ios, android |
| GET | `/api/playback/plex/pin/:id` | web?, fhweb, ios, android |
| PUT | `/api/playback/plex/server` | web? |
| GET | `/api/playback/plex/servers` | web? |
| GET | `/api/playback/sessions` | web, fhweb, android |
| GET | `/api/playback/stats` | web?, fhweb, android |
| GET | `/api/playback/status` | web? |
| GET | `/api/prefs` | web, fhweb |
| PUT | `/api/prefs` | web, fhweb |
| GET | `/api/prefs/mer` | fhweb, ios, android |
| PUT | `/api/prefs/mer` | fhweb, ios, android |
| GET | `/api/profiles` | web, fhweb, ios, android |
| GET | `/api/profiles/me` | web? |
| PUT | `/api/profiles/settings` | web? |
| GET | `/api/profiles/settings` | web? |
| POST | `/api/push/presence` | web, fhweb |
| POST | `/api/push/subscribe` | web, fhweb |
| DELETE | `/api/push/subscribe` | web, fhweb |
| POST | `/api/push/test` | kal_ios, kal_android |
| GET | `/api/push/vapid` | web, fhweb |
| GET | `/api/receipts` | fhweb, ios, android |
| POST | `/api/receipts` | fhweb, ios, android |
| GET | `/api/receipts.csv` |  |
| PATCH | `/api/receipts/:id` | web, fhweb, ios, android |
| DELETE | `/api/receipts/:id` | web, fhweb, ios, android |
| GET | `/api/receipts/health` | web, ios |
| POST | `/api/receipts/scan` | fhweb, ios, android |
| GET | `/api/rom/apod` |  |
| GET | `/api/rom/mars` |  |
| GET | `/api/rom/satellites` |  |
| GET | `/api/rom/settings` |  |
| PUT | `/api/rom/settings` |  |
| GET | `/api/rom/tle` |  |
| GET | `/api/rss` | web, fhweb, ios, android |
| GET | `/api/rss/article` | web, fhweb, ios, android |
| GET | `/api/rss/categories` | web, fhweb, ios, android |
| POST | `/api/rss/categories` | web, fhweb, ios, android |
| PATCH | `/api/rss/categories/:id` | web, fhweb, ios, android |
| DELETE | `/api/rss/categories/:id` | web, fhweb, ios, android |
| PUT | `/api/rss/categories/order` |  |
| GET | `/api/rss/favicon` |  |
| POST | `/api/rss/feeds` | web, fhweb, ios, android |
| PATCH | `/api/rss/feeds/:id` | web, fhweb, ios, android |
| DELETE | `/api/rss/feeds/:id` | web, fhweb, ios, android |
| GET | `/api/rss/foryou` |  |
| GET | `/api/rss/interests` | web, fhweb, ios, android |
| PUT | `/api/rss/interests` | web, fhweb, ios, android |
| POST | `/api/rss/interests` | web, fhweb, ios, android |
| DELETE | `/api/rss/interests/:word` |  |
| POST | `/api/rss/read` |  |
| POST | `/api/rss/refresh` | web, ios, android |
| PUT | `/api/rss/settings` | web, fhweb, ios, android |
| GET | `/api/rss/settings` | web, fhweb, ios, android |
| GET | `/api/rss/summary` | web, fhweb, ios, android |
| GET | `/api/ruter` | fhweb |
| POST | `/api/ruter/arrived-school` | android |
| GET | `/api/ruter/departures` | fhweb, ios, android, wear |
| GET | `/api/ruter/journey` | fhweb, ios, android |
| POST | `/api/ruter/journey/hide` | fhweb, ios, android |
| DELETE | `/api/ruter/journey/hide` | fhweb, ios, android |
| POST | `/api/ruter/journey/home` |  |
| POST | `/api/ruter/left-school` | ios, android |
| GET | `/api/ruter/my-routes` | ios |
| PUT | `/api/ruter/my-routes` | ios |
| GET | `/api/ruter/my-trip` | fhweb, ios, android |
| GET | `/api/ruter/school-zones` | fhweb, ios, android |
| POST | `/api/ruter/school-zones` | fhweb, ios, android |
| DELETE | `/api/ruter/school-zones/:id{[0-9]+}` | fhweb, ios, android |
| GET | `/api/ruter/school50` | fhweb, ios, android |
| GET | `/api/ruter/search` | fhweb, ios, android |
| GET | `/api/ruter/settings` | web, fhweb, ios, android |
| PUT | `/api/ruter/settings` | web, fhweb, ios, android |
| GET | `/api/school` | web |
| GET | `/api/search-history` | web, fhweb |
| POST | `/api/search-history` | web, fhweb |
| DELETE | `/api/search-history` | web, fhweb |
| DELETE | `/api/search-history/:id{[0-9]+}` | web |
| POST | `/api/search-history/restore` | web |
| POST | `/api/search/ask` | web, fhweb, ios, android |
| GET | `/api/search/history` | web, fhweb, ios, android |
| POST | `/api/search/history` | web, fhweb, ios, android |
| DELETE | `/api/search/history` | web, fhweb, ios, android |
| DELETE | `/api/search/history/:q` | web, fhweb |
| POST | `/api/search/history/import` | web, fhweb |
| PUT | `/api/search/settings` | web, fhweb |
| GET | `/api/search/suggest` | web, fhweb, ios, android |
| GET | `/api/search51` | web, ios, android |
| POST | `/api/search51/recent` | web, ios, android |
| DELETE | `/api/search51/recent` | web, ios, android |
| GET | `/api/search51/types` | web?, ios? |
| GET | `/api/security51/approvals` | web?, ios, kal_ios, android, kal_android |
| POST | `/api/security51/approvals/:id` | web?, ios, kal_ios, android, kal_android |
| POST | `/api/security51/approvals/:id/finish` | web?, ios, kal_ios?, android, kal_android? |
| GET | `/api/security51/approvals/:id/status` | web?, ios, kal_ios?, android, kal_android? |
| GET | `/api/security51/audit` | web?, kal_ios?, kal_android? |
| GET | `/api/security51/devices` | web?, kal_ios?, android, kal_android? |
| DELETE | `/api/security51/devices/:id` | web?, kal_ios?, android, kal_android? |
| GET | `/api/security51/limits` | web?, kal_ios?, kal_android? |
| DELETE | `/api/security51/limits` | web?, kal_ios?, kal_android? |
| GET | `/api/security51/logscan` | web?, kal_ios?, kal_android? |
| POST | `/api/security51/logscan` | web?, kal_ios?, kal_android? |
| GET | `/api/security51/overview` | web?, kal_ios?, kal_android? |
| GET | `/api/security51/passkeys` | web?, kal_ios?, kal_android? |
| PATCH | `/api/security51/passkeys/:id` | web?, kal_ios?, kal_android? |
| DELETE | `/api/security51/passkeys/:id` | web?, kal_ios?, kal_android? |
| POST | `/api/security51/passkeys/register/options` | web?, kal_ios?, kal_android? |
| POST | `/api/security51/passkeys/register/verify` | web?, kal_ios?, kal_android? |
| GET | `/api/security51/policy` | web?, kal_ios?, kal_android? |
| PUT | `/api/security51/policy` | web?, kal_ios?, kal_android? |
| GET | `/api/security51/secrets` | web?, kal_ios?, kal_android? |
| POST | `/api/security51/secrets/rotate` | web?, kal_ios?, kal_android? |
| PUT | `/api/server` | web |
| GET | `/api/server/owner` | web, fhweb, ios, android |
| POST | `/api/server/owner/transfer` | web, fhweb, ios, android |
| POST | `/api/server/owner/transfer/:id{[0-9]+}/:act{approve\|reject}` | web, fhweb, ios |
| PUT | `/api/settings/:key` | web, fhweb, ios, android |
| POST | `/api/settings/ai-search` | fhweb, ios, android |
| POST | `/api/settings/ask` | web |
| GET | `/api/settings/index` | web |
| GET | `/api/settings/sections` |  |
| POST | `/api/setup` | web |
| GET | `/api/setup/status` | web |
| GET | `/api/skjold` | web, ios, android |
| POST | `/api/skjold/ai/images` | web? |
| GET | `/api/skjold/ai/settings` | web |
| PUT | `/api/skjold/ai/settings` | web |
| POST | `/api/skjold/ai/suggest` | web |
| GET | `/api/skjold/ai/thumb/:id` | web? |
| POST | `/api/skjold/ai/tidy` | web |
| GET | `/api/skjold/ai/tidy/:jobId` | web? |
| DELETE | `/api/skjold/ai/tidy/:jobId` | web? |
| POST | `/api/skjold/ai/tidy/:jobId/apply` | web? |
| POST | `/api/skjold/ai/tidy/:jobId/skip` | web? |
| GET | `/api/skjold/cabinets` | web |
| POST | `/api/skjold/cabinets` | web |
| PATCH | `/api/skjold/cabinets/:id` | web? |
| DELETE | `/api/skjold/cabinets/:id` | web? |
| GET | `/api/skjold/cabinets/:id{[0-9]+}/leds` | web? |
| PUT | `/api/skjold/cabinets/:id{[0-9]+}/leds` | web? |
| POST | `/api/skjold/cabinets/:id{[0-9]+}/leds/calibrate` | web? |
| POST | `/api/skjold/cabinets/:id{[0-9]+}/leds/diagnose` | web? |
| PUT | `/api/skjold/cabinets/:id{[0-9]+}/leds/override` | web? |
| POST | `/api/skjold/cabinets/:id{[0-9]+}/leds/test` | web? |
| POST | `/api/skjold/cabinets/:id{[0-9]+}/preset` | web? |
| PUT | `/api/skjold/cabinets/:id/corners` | web? |
| PUT | `/api/skjold/cabinets/:id/drawers/:row/:col` | web? |
| GET | `/api/skjold/cabinets/:id/map` | web? |
| POST | `/api/skjold/cabinets/:id/photo` | web? |
| DELETE | `/api/skjold/cabinets/:id/photo` | web? |
| GET | `/api/skjold/categories` | web? |
| POST | `/api/skjold/checkout` | web? |
| POST | `/api/skjold/checkout/undo` | web? |
| GET | `/api/skjold/export.csv` | web |
| GET | `/api/skjold/files/:name` | web, android |
| GET | `/api/skjold/free` | web? |
| GET | `/api/skjold/history` | web? |
| POST | `/api/skjold/history/:id{[0-9]+}/undo` | web? |
| POST | `/api/skjold/import` | web? |
| GET | `/api/skjold/labels` | web |
| GET | `/api/skjold/leds/settings` | web? |
| PUT | `/api/skjold/leds/settings` | web? |
| GET | `/api/skjold/leds/status` | web? |
| POST | `/api/skjold/locate` | web? |
| POST | `/api/skjold/locate/off` | web? |
| GET | `/api/skjold/parts` | web |
| POST | `/api/skjold/parts` | web |
| GET | `/api/skjold/parts/:id{[0-9]+}` | web? |
| PATCH | `/api/skjold/parts/:id{[0-9]+}` | web? |
| DELETE | `/api/skjold/parts/:id{[0-9]+}` | web? |
| GET | `/api/skjold/parts/:id{[0-9]+}/history` | web? |
| POST | `/api/skjold/parts/:id{[0-9]+}/move` | web? |
| POST | `/api/skjold/parts/:id{[0-9]+}/photos` | web? |
| DELETE | `/api/skjold/parts/:id{[0-9]+}/photos/:n{[0-9]+}` | web? |
| POST | `/api/skjold/parts/:id{[0-9]+}/photos/from-search` | web? |
| POST | `/api/skjold/parts/:id{[0-9]+}/qty` | web? |
| POST | `/api/skjold/parts/:id{[0-9]+}/restore` | web? |
| GET | `/api/skjold/picklist` | web? |
| PUT | `/api/skjold/picklist` | web? |
| POST | `/api/skjold/picklist/take` | web? |
| POST | `/api/skjold/picklist/undo` | web? |
| GET | `/api/skjold/presets` | web? |
| GET | `/api/skjold/projects` | web? |
| POST | `/api/skjold/projects` | web? |
| GET | `/api/skjold/projects/:id{[0-9]+}` | web? |
| PATCH | `/api/skjold/projects/:id{[0-9]+}` | web? |
| DELETE | `/api/skjold/projects/:id{[0-9]+}` | web? |
| GET | `/api/skjold/suggest` | web? |
| GET | `/api/skjold/trash` | web? |
| POST | `/api/skjold/usage/:id{[0-9]+}/return` | web? |
| POST | `/api/smb/browse` | web? |
| POST | `/api/smb/discover` | web? |
| POST | `/api/smb/list` | web? |
| POST | `/api/smb/mkdir` | web? |
| POST | `/api/smb/probe` | web? |
| POST | `/api/smb/save` | web? |
| POST | `/api/smb/scan` | web? |
| POST | `/api/smb/shares` | web? |
| POST | `/api/smb/test` | web? |
| GET | `/api/space/apod` | web |
| GET | `/api/space/gallery/:key` | web |
| GET | `/api/space/mars` | web |
| GET | `/api/space/tle` | web |
| GET | `/api/state` | web |
| POST | `/api/studie/docs` |  |
| GET | `/api/studie/docs` |  |
| GET | `/api/studie/docs/:id{[0-9]+}` |  |
| DELETE | `/api/studie/docs/:id{[0-9]+}` |  |
| POST | `/api/studie/docs/:id{[0-9]+}/apply` |  |
| POST | `/api/studie/docs/:id{[0-9]+}/ask` |  |
| PUT | `/api/studie/docs/:id{[0-9]+}/courses` |  |
| GET | `/api/studie/docs/:id{[0-9]+}/file` |  |
| POST | `/api/studie/docs/:id{[0-9]+}/reanalyze` |  |
| GET | `/api/studie/docs/:id{[0-9]+}/thumb` |  |
| POST | `/api/study/documents` | web, fhweb, ios, android |
| GET | `/api/study/documents` | web, fhweb, ios, android |
| GET | `/api/study/documents/:id{[0-9]+}` | web, fhweb, ios, android |
| DELETE | `/api/study/documents/:id{[0-9]+}` | web, fhweb, ios, android |
| POST | `/api/study/documents/:id{[0-9]+}/apply` | web, fhweb, ios |
| POST | `/api/study/documents/:id{[0-9]+}/ask` | web, fhweb, ios |
| PUT | `/api/study/documents/:id{[0-9]+}/courses` | web?, fhweb?, ios? |
| GET | `/api/study/documents/:id{[0-9]+}/file` | web, fhweb, ios? |
| POST | `/api/study/documents/:id{[0-9]+}/reanalyze` | web, fhweb, ios? |
| GET | `/api/study/documents/:id{[0-9]+}/thumb` | web?, fhweb, ios? |
| GET | `/api/study/overview` | web |
| GET | `/api/system/changelog` | web, fhweb, ios, android |
| GET | `/api/system/containers` | web, fhweb, ios, android |
| GET | `/api/system/containers/:id` | web, fhweb, ios, android |
| POST | `/api/system/containers/:id/:act{restart\|stop\|start}` | web, fhweb, ios |
| GET | `/api/system/containers/:id/inspect` | web, fhweb |
| GET | `/api/system/docker/setup` | web, fhweb |
| POST | `/api/system/docker/setup` | web, fhweb |
| GET | `/api/system/logs` | web, fhweb, ios, android |
| GET | `/api/system/logs/download` | web, fhweb, ios |
| POST | `/api/system/logs/explain` | web, fhweb, ios, android |
| GET | `/api/system/logs/groups` | web, fhweb, ios, android |
| GET | `/api/system/logs/stream` | web, fhweb, ios |
| GET | `/api/system/obs51/heal` | web |
| PUT | `/api/system/obs51/heal` | web |
| GET | `/api/system/obs51/heal/drafts/:id` | web |
| DELETE | `/api/system/obs51/heal/drafts/:id` | web |
| POST | `/api/system/obs51/heal/run` | web? |
| GET | `/api/system/obs51/health` | web? |
| GET | `/api/system/obs51/proxmox` | web |
| PUT | `/api/system/obs51/proxmox` | web |
| GET | `/api/system/obs51/traces` | web |
| GET | `/api/system/update` | web, ios, android |
| POST | `/api/system/update/abort` | web?, android |
| GET | `/api/system/update/changelog` | web? |
| POST | `/api/system/update/check` | web?, android |
| GET | `/api/system/update/log` | web |
| GET | `/api/system/update/pause` | web? |
| DELETE | `/api/system/update/pause` | web? |
| POST | `/api/system/update/prune` | web? |
| GET | `/api/system/update/resources` | web? |
| POST | `/api/system/update/retry` | web?, android |
| POST | `/api/system/update/rollback` | web, fhweb, ios, android |
| GET | `/api/system/update/settings` | web, fhweb, ios, android |
| PUT | `/api/system/update/settings` | web, fhweb, ios, android |
| POST | `/api/system/update/start` | web?, fhweb, ios, android |
| GET | `/api/system/update/status` | web?, android |
| GET | `/api/system/update/version` | web? |
| GET | `/api/system/update/versions` | web?, fhweb |
| GET | `/api/system/version` | web, fhweb, ios, android |
| GET | `/api/tasks` | web, fhweb, ios, android, wear |
| POST | `/api/tasks` | web, fhweb, ios, android, wear |
| PATCH | `/api/tasks/:id{[0-9]+}` | web, fhweb, ios, kal_ios, mac, android, kal_android, wear |
| DELETE | `/api/tasks/:id{[0-9]+}` | web, fhweb, ios, kal_ios, mac, android, kal_android, wear |
| POST | `/api/tasks/:id{[0-9]+}/split` | web, fhweb, ios |
| POST | `/api/tasks/:id{[0-9]+}/subs` | web?, ios? |
| PATCH | `/api/tasks/:id{[0-9]+}/subs/:sid` | web?, ios? |
| DELETE | `/api/tasks/:id{[0-9]+}/subs/:sid` | web?, ios? |
| POST | `/api/tasks/:id{[0-9]+}/suggest` | web?, ios? |
| POST | `/api/tasks/archive-done` | web?, ios |
| DELETE | `/api/tasks/archived` | web?, ios |
| GET | `/api/tasks/brief` | web, ios? |
| POST | `/api/tasks/clear-done` | web?, ios |
| POST | `/api/tasks/glimt` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| GET | `/api/tasks/glimt/cards` | web?, ios?, kal_ios?, mac?, android, kal_android? |
| POST | `/api/tasks/glimt/cards/dismiss` | web, ios?, kal_ios?, mac?, android, kal_android? |
| GET | `/api/tasks/glimt/jobs` | web?, ios, kal_ios?, mac?, android, kal_android? |
| GET | `/api/tasks/glimt/jobs/:id` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| POST | `/api/tasks/glimt/jobs/:id/undo` | web?, fhweb, ios?, kal_ios?, mac?, kal_android? |
| GET | `/api/tasks/glimt/log` | web?, ios?, kal_ios?, mac?, kal_android? |
| GET | `/api/tasks/glimt/sources` | web?, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| DELETE | `/api/tasks/glimt/sources/:id` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| POST | `/api/tasks/glimt/sources/:id/redo` | web, fhweb, ios?, kal_ios?, mac?, kal_android? |
| GET | `/api/tasks/glimt/tips` | web?, ios?, kal_ios?, mac?, kal_android? |
| PUT | `/api/tasks/glimt/tips` | web?, ios?, kal_ios?, mac?, kal_android? |
| POST | `/api/tasks/glimt/undo` | web, fhweb, ios, kal_ios?, mac?, android, kal_android? |
| GET | `/api/tasks/ha` | web, fhweb, ios, android |
| PUT | `/api/tasks/ha` | web, fhweb, ios, android |
| POST | `/api/tasks/ha/create` | web, fhweb, ios, android |
| PUT | `/api/tasks/ha/map` | web, fhweb, ios, android |
| GET | `/api/tasks/ha/summary` | web?, ios? |
| POST | `/api/tasks/ha/sync` | web, fhweb, ios, android |
| GET | `/api/tasks/lists` | web, fhweb, ios, android, wear |
| POST | `/api/tasks/lists` | web, fhweb, ios, android, wear |
| PATCH | `/api/tasks/lists/:id` | web, fhweb, ios, android |
| DELETE | `/api/tasks/lists/:id` | web, fhweb, ios, android |
| POST | `/api/tasks/lists/:id/leave` | web, fhweb, ios |
| PUT | `/api/tasks/lists/:id/members` | web, fhweb, ios |
| DELETE | `/api/tasks/lists/:id/members/me` | web, fhweb, ios? |
| GET | `/api/tasks/lists/order` | web?, fhweb, ios, android |
| PUT | `/api/tasks/lists/order` | web?, fhweb, ios, android |
| GET | `/api/tasks/next` | web, ios, android |
| GET | `/api/tasks/settings` | web, ios? |
| PUT | `/api/tasks/settings` | web, ios? |
| GET | `/api/tasks/sync` | web?, ios? |
| PUT | `/api/tasks/sync` | web?, ios? |
| POST | `/api/tasks/sync/now` | web?, ios? |
| GET | `/api/tests` | web |
| POST | `/api/tests` | web |
| DELETE | `/api/tests/:id` | web |
| GET | `/api/tokens/companion` | ios, kal_ios, android |
| POST | `/api/tokens/companion` | ios, kal_ios, android |
| DELETE | `/api/tokens/companion/:id` | kal_ios? |
| GET | `/api/tracking` | web, fhweb, ios, android |
| POST | `/api/tracking` | web, fhweb, ios, android |
| PATCH | `/api/tracking/:id` | web, fhweb, ios, android |
| DELETE | `/api/tracking/:id` | web, fhweb, ios, android |
| POST | `/api/tracking/:id{[0-9]+}/refresh` |  |
| DELETE | `/api/tracking/accounts/:src` | web |
| POST | `/api/tracking/accounts/:src/finish` | web |
| POST | `/api/tracking/accounts/:src/start` | web |
| POST | `/api/tracking/accounts/:src/sync` | web |
| GET | `/api/tracking/aliexpress` |  |
| PUT | `/api/tracking/aliexpress` |  |
| POST | `/api/tracking/aliexpress/check` |  |
| POST | `/api/tracking/aliexpress/mail` |  |
| POST | `/api/tracking/bulk` | fhweb, ios, android |
| POST | `/api/tracking/check` | web, fhweb, ios |
| GET | `/api/tracking/debug/:id{[0-9]+}` |  |
| POST | `/api/tracking/debug/:id{[0-9]+}/test` |  |
| GET | `/api/tracking/detect` | fhweb |
| GET | `/api/tracking/keys` | web, fhweb, ios, android |
| PUT | `/api/tracking/keys/:id` | web, ios, android |
| DELETE | `/api/tracking/keys/:id` | web, ios, android |
| PUT | `/api/tracking/keys/quota` |  |
| DELETE | `/api/tracking/notices` |  |
| GET | `/api/tracking/postnord/health` | ios |
| PUT | `/api/tracking/prefs` | web, fhweb, ios, android |
| POST | `/api/tracking/refresh` | web, fhweb, ios, android |
| PUT | `/api/tracking/sources` | web, fhweb, ios, android |
| GET | `/api/tracking/sources46` | web |
| GET | `/api/tracking/widget` | web |
| GET | `/api/trading` |  |
| POST | `/api/tts` | web, fhweb, ios, android |
| GET | `/api/ui` | web |
| PUT | `/api/ui` | web |
| GET | `/api/upcoming` | web, fhweb |
| GET | `/api/update` |  |
| POST | `/api/update/abort` |  |
| GET | `/api/update/changelog` |  |
| POST | `/api/update/check` |  |
| GET | `/api/update/log` |  |
| GET | `/api/update/pause` |  |
| DELETE | `/api/update/pause` |  |
| POST | `/api/update/prune` |  |
| GET | `/api/update/resources` |  |
| POST | `/api/update/retry` |  |
| POST | `/api/update/rollback` | web, fhweb, ios, android |
| GET | `/api/update/settings` |  |
| PUT | `/api/update/settings` |  |
| POST | `/api/update/start` |  |
| GET | `/api/update/status` |  |
| GET | `/api/update/version` |  |
| GET | `/api/update/versions` | web, fhweb, ios, android |
| GET | `/api/users` | web, fhweb, ios, android |
| POST | `/api/users` | web, fhweb, ios, android |
| PATCH | `/api/users/:id` | web, fhweb, ios, kal_ios, android, kal_android |
| DELETE | `/api/users/:id` | web, fhweb, ios, kal_ios, android, kal_android |
| GET | `/api/users/:id/avatar` | web?, fhweb?, ios |
| GET | `/api/users/:id/layout` | web, fhweb, ios |
| PUT | `/api/users/:id/layout` | web, fhweb, ios |
| POST | `/api/users/:id/layout/copy-from-me` | web, fhweb, ios? |
| PUT | `/api/users/:id/layout/lock` | web, fhweb, ios |
| POST | `/api/users/:id/layout/reset` | web, fhweb, ios? |
| POST | `/api/users/:id/layout/undo` | web?, fhweb, ios |
| PUT | `/api/users/:id/profile` | web?, fhweb?, ios? |
| GET | `/api/users/directory` | web, fhweb, ios?, kal_ios, android, kal_android |
| GET | `/api/version` |  |
| GET | `/api/voice53/backends` | web, ios, android |
| POST | `/api/voice53/transcribe` | web, ios, android |
| GET | `/api/voices57` | web |
| POST | `/api/voices57` | web |
| DELETE | `/api/voices57/:id` | web |
| POST | `/api/voices57/:id/preview` | web |
| GET | `/api/weather` | web, fhweb |
| GET | `/api/weather/compare` | web, fhweb, ios, android |
| GET | `/api/weather/full` | web, fhweb, ios, android |
| GET | `/api/weather/here` | web, fhweb, ios, android |
| GET | `/api/weather/layout` | web, ios |
| PUT | `/api/weather/layout` | web, ios |
| GET | `/api/weather/place` | web, fhweb, android |
| GET | `/api/weather/places` | web, fhweb, ios, android |
| POST | `/api/weather/places` | web, fhweb, ios, android |
| DELETE | `/api/weather/places/:id` | web, fhweb, ios, android |
| PUT | `/api/weather/places/order` | web, fhweb, ios, android |
| GET | `/api/weather/places/summary` | web |
| GET | `/api/weather/search` | web, fhweb, ios, android |
| GET | `/api/weather/week-summary` | web, fhweb, ios, android |
| PUT | `/api/weather/week-summary` | web, fhweb, ios, android |
| GET | `/api/whatsnew` | web, fhweb, ios, kal_ios, android, kal_android |
| POST | `/api/whatsnew/seen` | web, fhweb, ios, kal_ios, android, kal_android |
| GET | `/api/widgets/birthdays` | ios, android |
| GET | `/api/widgets/calendar` | ios, android |
| GET | `/api/widgets/catalog` | web, fhweb |
| GET | `/api/widgets/departures` | ios, android |
| GET | `/api/widgets/media` | fhweb, ios, android |
| GET | `/api/widgets/ruter` | android |
| GET | `/api/widgets/server-status` |  |
| GET | `/api/widgets/trials` | fhweb, ios, android |
| POST | `/api/widgets/trials/:id{[0-9]+}` | fhweb, ios, android |
| GET | `/app-auth` | ios, kal_ios, kal_android |
| POST | `/app-auth` | ios, kal_ios, kal_android |
| GET | `/chat` | fhweb, android |
| GET | `/cv` | web |
| GET | `/domains/api/:name/analytics` | fhweb?, ios?, android? |
| GET | `/domains/api/:name/live` | fhweb?, ios?, android? |
| GET | `/domains/api/domains` | web, fhweb?, ios?, android? |
| POST | `/domains/api/domains` | web, fhweb?, ios?, android? |
| DELETE | `/domains/api/domains/:id` | web?, fhweb?, ios?, android? |
| POST | `/domains/api/token/verify` | fhweb?, ios?, android? |
| GET | `/domains/api/vendor/:file` | web, fhweb?, ios?, android |
| GET | `/domains/api/vendor/nordic.json` | web?, fhweb?, ios?, android? |
| GET | `/finans` | web, fhweb, ios, kal_ios, android, kal_android |
| GET | `/finans/` | web, fhweb, ios, kal_ios, android, kal_android |
| POST | `/finans/api/accounts` | fhweb |
| PATCH | `/finans/api/accounts/:id` | fhweb |
| DELETE | `/finans/api/accounts/:id` | fhweb |
| GET | `/finans/api/ai-audit` | web, fhweb, ios, android |
| GET | `/finans/api/ai-privacy` | web |
| PATCH | `/finans/api/ai-privacy` | web |
| GET | `/finans/api/ai/gemini-keys` | fhweb |
| POST | `/finans/api/ai/gemini-keys` | fhweb |
| PATCH | `/finans/api/ai/gemini-keys/:id` | fhweb |
| DELETE | `/finans/api/ai/gemini-keys/:id` | fhweb |
| POST | `/finans/api/ai/gemini-keys/:id/test` | fhweb |
| PUT | `/finans/api/ai/gemini-keys/order` | fhweb |
| GET | `/finans/api/ai/limits` | fhweb, ios, android |
| GET | `/finans/api/ai/log` | fhweb, ios |
| GET | `/finans/api/ai/ollama/models` | fhweb |
| DELETE | `/finans/api/ai/ollama/models/:name{.+}` | fhweb |
| GET | `/finans/api/ai/ollama/pull` | fhweb |
| POST | `/finans/api/ai/ollama/pull` | fhweb |
| POST | `/finans/api/ai/roboflow/test` | fhweb, ios |
| POST | `/finans/api/ai/test` | fhweb, ios |
| GET | `/finans/api/ai/vision` |  |
| POST | `/finans/api/ai/vision/install` | fhweb, ios, android |
| GET | `/finans/api/aksjer/logo/:key` | fhweb |
| DELETE | `/finans/api/all` | fhweb |
| POST | `/finans/api/auth/logout` | ios, kal_ios?, android, kal_android? |
| POST | `/finans/api/auth/token` | ios, kal_ios, mac, android, kal_android |
| GET | `/finans/api/backup` | fhweb |
| GET | `/finans/api/backup/export` | fhweb |
| GET | `/finans/api/backup/list` | fhweb, ios, android |
| POST | `/finans/api/backup/restore` | fhweb, ios, android |
| POST | `/finans/api/backup/run` | web, fhweb, ios, android |
| PUT | `/finans/api/backup/smb` | fhweb |
| POST | `/finans/api/backup/smb/test` | fhweb |
| POST | `/finans/api/backup/stage` | fhweb |
| GET | `/finans/api/boliger/categories` | fhweb, ios |
| POST | `/finans/api/boliger/categories` | fhweb, ios |
| PATCH | `/finans/api/boliger/categories/:id` | fhweb |
| DELETE | `/finans/api/boliger/categories/:id` | fhweb |
| POST | `/finans/api/boliger/categories/reset` | fhweb |
| POST | `/finans/api/boliger/categories/suggest` |  |
| GET | `/finans/api/boliger/layout` |  |
| PUT | `/finans/api/boliger/layout` |  |
| GET | `/finans/api/boliger/oversikt` | web, fhweb |
| GET | `/finans/api/boliger/search` |  |
| PUT | `/finans/api/boliger/settings` | fhweb |
| GET | `/finans/api/bootstrap` | fhweb, ios, android |
| PUT | `/finans/api/budgets` | fhweb |
| POST | `/finans/api/categories` | web, fhweb, ios, android |
| PATCH | `/finans/api/categories/:id` | fhweb |
| DELETE | `/finans/api/categories/:id` | fhweb |
| POST | `/finans/api/demo` | fhweb |
| GET | `/finans/api/export.json` |  |
| GET | `/finans/api/filter/facets` | fhweb |
| POST | `/finans/api/filter/glimt` | fhweb |
| GET | `/finans/api/fin51/calendar` | fhweb, ios, android |
| GET | `/finans/api/fin51/goals` | fhweb, ios, android |
| POST | `/finans/api/fin51/goals` | fhweb, ios, android |
| PATCH | `/finans/api/fin51/goals/:id` | fhweb, ios, android |
| DELETE | `/finans/api/fin51/goals/:id` | fhweb, ios, android |
| POST | `/finans/api/fin51/goals/:id/deposit` | fhweb, ios, android |
| PUT | `/finans/api/fin51/goals/:id/image` | fhweb, ios, android |
| DELETE | `/finans/api/fin51/goals/:id/image` | fhweb, ios, android |
| GET | `/finans/api/fin51/goals/:id/image` | fhweb, ios, android |
| GET | `/finans/api/fin51/goals/:id/moves` | ios? |
| GET | `/finans/api/fin51/hunter` | fhweb, ios, android |
| POST | `/finans/api/fin51/hunter/dismiss` | fhweb, ios, android |
| DELETE | `/finans/api/fin51/hunter/dismiss` | fhweb, ios, android |
| POST | `/finans/api/fin51/hunter/draft` | fhweb, ios, android |
| POST | `/finans/api/fin51/hunter/used` | fhweb, ios, android |
| GET | `/finans/api/fin51/prices` | fhweb, ios, android |
| GET | `/finans/api/fin51/prices/item` | fhweb, ios, android |
| GET | `/finans/api/fin51/roundup` | fhweb, ios, android |
| PUT | `/finans/api/fin51/roundup` | fhweb, ios, android |
| POST | `/finans/api/fin51/roundup/apply` | fhweb, ios, android |
| GET | `/finans/api/fin51/tax` | ios, android |
| GET | `/finans/api/fin51/tax/export.csv` | android |
| GET | `/finans/api/fin51/tax/export.html` | android |
| PUT | `/finans/api/fin51/tax/profile` | fhweb, ios, android |
| GET | `/finans/api/finn` | fhweb, ios, android |
| POST | `/finans/api/finn` | fhweb, ios, android |
| GET | `/finans/api/finn/:id` | fhweb, ios, android |
| PATCH | `/finans/api/finn/:id` | fhweb, ios, android |
| DELETE | `/finans/api/finn/:id` | fhweb, ios, android |
| POST | `/finans/api/finn/:id/ad` | fhweb, ios, android |
| DELETE | `/finans/api/finn/:id/ad` | fhweb, ios, android |
| GET | `/finans/api/finn/:id/ad` | fhweb, ios, android |
| GET | `/finans/api/finn/:id/ad/img/:n` |  |
| POST | `/finans/api/finn/:id/ad/refresh` | fhweb, ios, android |
| GET | `/finans/api/finn/:id/emails` | fhweb, ios, android |
| POST | `/finans/api/finn/:id/emails` | fhweb, ios, android |
| GET | `/finans/api/finn/:id/emails/:eid` | fhweb, ios, android |
| DELETE | `/finans/api/finn/:id/emails/:eid` | fhweb, ios, android |
| POST | `/finans/api/finn/:id/files` | fhweb, ios, android |
| GET | `/finans/api/finn/:id/files/:fid` | fhweb |
| DELETE | `/finans/api/finn/:id/files/:fid` | fhweb |
| GET | `/finans/api/finn/:id/img/:n` |  |
| GET | `/finans/api/finn/:id/messages` | fhweb, ios, android |
| POST | `/finans/api/finn/import/eml` | fhweb |
| POST | `/finans/api/finn/import/links` | fhweb |
| POST | `/finans/api/finn/import/mail` | fhweb |
| GET | `/finans/api/finn/import/status` | fhweb |
| POST | `/finans/api/firstrun` | fhweb |
| GET | `/finans/api/folders` | web, fhweb, ios, android |
| POST | `/finans/api/folders` | web, fhweb, ios, android |
| GET | `/finans/api/folders/:id` | web, fhweb, ios, android |
| PATCH | `/finans/api/folders/:id` | web, fhweb, ios, android |
| DELETE | `/finans/api/folders/:id` | web, fhweb, ios, android |
| GET | `/finans/api/folders/:id{[0-9]+}/categories` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/categories` | fhweb?, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/categories/:cid{[0-9]+}` | fhweb?, ios?, android? |
| DELETE | `/finans/api/folders/:id{[0-9]+}/categories/:cid{[0-9]+}` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/categories/glimt` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/entries/:eid{[0-9]+}/reanalyze` | fhweb, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/entries/:eid{[0-9]+}/receipt` | fhweb, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/entries/:eid{[0-9]+}/receipt` | fhweb, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/expenses` | fhweb?, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/expenses/:eid{[0-9]+}` | fhweb?, ios, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/expenses/:eid{[0-9]+}/reanalyze` | fhweb?, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/projects` | fhweb, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/projects` | fhweb, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/projects/:pid{[0-9]+}` | fhweb, ios?, android? |
| PATCH | `/finans/api/folders/:id{[0-9]+}/projects/:pid{[0-9]+}` | fhweb, ios?, android? |
| DELETE | `/finans/api/folders/:id{[0-9]+}/projects/:pid{[0-9]+}` | fhweb, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/projects/:pid{[0-9]+}/candidates` | fhweb, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/projects/:pid{[0-9]+}/glimt` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/projects/:pid{[0-9]+}/items` | fhweb?, ios?, android? |
| DELETE | `/finans/api/folders/:id{[0-9]+}/projects/:pid{[0-9]+}/items/:eid{[0-9]+}` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/projects/:pid{[0-9]+}/items/undo` | fhweb?, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/review` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id{[0-9]+}/review/approve` | fhweb?, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/search` | fhweb?, ios?, android? |
| GET | `/finans/api/folders/:id{[0-9]+}/years` | fhweb?, ios?, android? |
| PUT | `/finans/api/folders/:id/bg` | fhweb, ios, android |
| GET | `/finans/api/folders/:id/bg` | fhweb, ios, android |
| POST | `/finans/api/folders/:id/bills` | fhweb?, ios?, android? |
| PATCH | `/finans/api/folders/:id/bills/:bid` | fhweb?, ios?, android? |
| DELETE | `/finans/api/folders/:id/bills/:bid` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id/entries` | fhweb, ios, android |
| PATCH | `/finans/api/folders/:id/entries/:eid` | fhweb, ios, android |
| DELETE | `/finans/api/folders/:id/entries/:eid` | fhweb, ios, android |
| GET | `/finans/api/folders/:id/entries/:eid/history` | fhweb, ios?, android? |
| DELETE | `/finans/api/folders/:id/installments/:iid` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id/installments/:iid/pay` | fhweb, ios?, android? |
| POST | `/finans/api/folders/:id/invite` | fhweb, ios, android |
| POST | `/finans/api/folders/:id/members` | fhweb, ios, android |
| PATCH | `/finans/api/folders/:id/members/:mid` | fhweb, ios, android |
| DELETE | `/finans/api/folders/:id/members/:mid` | fhweb, ios, android |
| POST | `/finans/api/folders/:id/projects` | fhweb, ios?, android? |
| PATCH | `/finans/api/folders/:id/projects/:pid` | fhweb, ios?, android? |
| DELETE | `/finans/api/folders/:id/projects/:pid` | fhweb, ios?, android? |
| POST | `/finans/api/folders/:id/projects/:pid/installments` | fhweb?, ios?, android? |
| POST | `/finans/api/folders/:id/receipts` | fhweb, ios, android |
| GET | `/finans/api/folders/:id/receipts/:rid/file` | fhweb, ios?, android |
| GET | `/finans/api/folders/:id/receipts/:rid/thumb` | fhweb, ios, android |
| GET | `/finans/api/folders/:id/shareable` | fhweb?, ios?, android? |
| GET | `/finans/api/forslag` | fhweb, ios, android |
| POST | `/finans/api/glimt/jobs` |  |
| GET | `/finans/api/glimt/jobs` |  |
| GET | `/finans/api/glimt/jobs/:id` |  |
| DELETE | `/finans/api/glimt/jobs/:id` |  |
| GET | `/finans/api/glimt/jobs/:id/events` |  |
| GET | `/finans/api/glimt/jobs/:id/report.pdf` |  |
| POST | `/finans/api/glimt/tasks` | fhweb |
| GET | `/finans/api/glimt/tasks` | fhweb |
| GET | `/finans/api/glimt/tasks/:id` | fhweb |
| DELETE | `/finans/api/glimt/tasks/:id` | fhweb |
| GET | `/finans/api/glimt/tasks/:id/events` | fhweb? |
| GET | `/finans/api/glimt/tasks/:id/report.pdf` | fhweb |
| POST | `/finans/api/goals` | fhweb |
| PATCH | `/finans/api/goals/:id` | fhweb |
| DELETE | `/finans/api/goals/:id` | fhweb |
| GET | `/finans/api/health/ai` | fhweb, ios |
| GET | `/finans/api/homes/:id{[0-9]+}/categories` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/categories` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/categories/:cid{[0-9]+}` |  |
| DELETE | `/finans/api/homes/:id{[0-9]+}/categories/:cid{[0-9]+}` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/categories/glimt` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/entries/:eid{[0-9]+}/reanalyze` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/entries/:eid{[0-9]+}/receipt` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/entries/:eid{[0-9]+}/receipt` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/expenses` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}` | android |
| POST | `/finans/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}/reanalyze` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/projects` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/projects` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}` |  |
| PATCH | `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}` |  |
| DELETE | `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/candidates` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/glimt` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/items` |  |
| DELETE | `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/items/:eid{[0-9]+}` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/items/undo` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/review` |  |
| POST | `/finans/api/homes/:id{[0-9]+}/review/approve` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/search` |  |
| GET | `/finans/api/homes/:id{[0-9]+}/years` |  |
| POST | `/finans/api/import` | fhweb, ios, android |
| POST | `/finans/api/import/csv` | fhweb |
| GET | `/finans/api/import/home-rules` | fhweb |
| PUT | `/finans/api/import/home-rules` | fhweb |
| POST | `/finans/api/import/home-rules` | fhweb |
| DELETE | `/finans/api/import/home-rules/:rid{[0-9]+}` | fhweb |
| POST | `/finans/api/import/home-rules/backfill` | fhweb |
| POST | `/finans/api/import/home-rules/run` |  |
| POST | `/finans/api/import/preview` |  |
| GET | `/finans/api/import/templates` | fhweb |
| DELETE | `/finans/api/import/templates/:id` | fhweb |
| POST | `/finans/api/import/xlsx` |  |
| GET | `/finans/api/jobs/:id` | web, fhweb, ios, android |
| DELETE | `/finans/api/jobs/:id` | web, fhweb, ios, android |
| GET | `/finans/api/jobs/:id/events` |  |
| POST | `/finans/api/login` | web, fhweb, ios, kal_ios, mac, android, kal_android |
| GET | `/finans/api/logo/:domain` | web, fhweb, ios, android |
| GET | `/finans/api/logos` | fhweb, ios, android |
| GET | `/finans/api/logos/file/:id` | web, fhweb, ios, android |
| GET | `/finans/api/logos/match` | fhweb? |
| POST | `/finans/api/logos/override` | fhweb? |
| GET | `/finans/api/logos/overrides` | fhweb? |
| GET | `/finans/api/logos/registry` | fhweb, ios, android |
| POST | `/finans/api/logos52/batch` | ios, android |
| GET | `/finans/api/logos52/match` |  |
| GET | `/finans/api/mail/config` | web? |
| PUT | `/finans/api/mail/config` | web? |
| POST | `/finans/api/mail/run` | web?, android |
| GET | `/finans/api/mail/status` | web? |
| POST | `/finans/api/mail/test` | web? |
| GET | `/finans/api/me` | web, fhweb, ios, android |
| GET | `/finans/api/merchants/:id/logo` | fhweb, ios |
| PUT | `/finans/api/merchants/:id/logo` | fhweb, ios |
| POST | `/finans/api/merchants/logo` | ios, android |
| DELETE | `/finans/api/merchants/logo` | ios, android |
| GET | `/finans/api/merchants/logo-overrides` | fhweb, ios, android |
| GET | `/finans/api/merchants/logo/file/:file` |  |
| POST | `/finans/api/merchants/logo/manual` | ios, android |
| POST | `/finans/api/merchants/logo/upload` | fhweb, ios, android |
| GET | `/finans/api/overview` | web |
| GET | `/finans/api/prefs` | web, fhweb |
| PUT | `/finans/api/prefs` | web, fhweb |
| POST | `/finans/api/receipts` | fhweb, ios, android |
| GET | `/finans/api/receipts` | fhweb, ios, android |
| GET | `/finans/api/receipts/:id` | web, fhweb, ios, android |
| PATCH | `/finans/api/receipts/:id` | web, fhweb, ios, android |
| DELETE | `/finans/api/receipts/:id` | web, fhweb, ios, android |
| POST | `/finans/api/receipts/:id/book` | fhweb, ios, android |
| POST | `/finans/api/receipts/:id/cancel-ai` | fhweb, ios?, android |
| POST | `/finans/api/receipts/:id/corrections` | fhweb, ios, android |
| GET | `/finans/api/receipts/:id/file` | fhweb, ios, android? |
| POST | `/finans/api/receipts/:id/logo/ai` | fhweb?, ios?, android? |
| POST | `/finans/api/receipts/:id/merchant` | fhweb, ios, android |
| GET | `/finans/api/receipts/:id/reads` | fhweb?, ios?, android? |
| POST | `/finans/api/receipts/:id/reanalyze` | fhweb, ios, android |
| POST | `/finans/api/receipts/:id/reanalyze/:jobId/cancel` | fhweb?, ios, android |
| POST | `/finans/api/receipts/:id/reanalyze/apply` | fhweb, ios, android |
| POST | `/finans/api/receipts/:id/reject` | fhweb, ios, android |
| POST | `/finans/api/receipts/:id/reprocess` | fhweb, ios, android |
| POST | `/finans/api/receipts/:id/reread` | fhweb, ios, android |
| POST | `/finans/api/receipts/:id/review` | fhweb?, ios?, android? |
| GET | `/finans/api/receipts/:id/thumb` | fhweb?, ios, android |
| POST | `/finans/api/receipts/:id/unbook` | fhweb, ios, android |
| GET | `/finans/api/receipts/analyzing` | fhweb, ios, android |
| GET | `/finans/api/receipts/brreg` | fhweb?, ios?, android? |
| POST | `/finans/api/receipts/brreg/update` | fhweb?, ios?, android? |
| GET | `/finans/api/receipts/corrections` | fhweb?, ios?, android? |
| GET | `/finans/api/receipts/corrections/export` | fhweb?, ios?, android? |
| GET | `/finans/api/receipts/health` | web, fhweb?, ios, android? |
| GET | `/finans/api/receipts/jobs` | fhweb, ios, android |
| GET | `/finans/api/receipts/jobs/:jobId` | fhweb?, ios?, android? |
| POST | `/finans/api/receipts/mac-ocr/test` | web, fhweb?, ios?, android? |
| GET | `/finans/api/receipts/ocr` | fhweb, ios?, android? |
| POST | `/finans/api/receipts/ocr` | fhweb, ios?, android? |
| POST | `/finans/api/receipts/ocr-text` | fhweb?, ios?, android? |
| POST | `/finans/api/receipts/parsed` | fhweb?, ios, android? |
| GET | `/finans/api/receipts/reanalyze/:jobId` | fhweb, ios, android? |
| DELETE | `/finans/api/receipts/reanalyze/:jobId` | fhweb, ios, android? |
| POST | `/finans/api/receipts/scan` | fhweb, ios, android |
| GET | `/finans/api/receipts/schemas/:kind{(ocr\|receipt)}` | fhweb?, ios?, android? |
| GET | `/finans/api/recurring` | fhweb, ios, android |
| POST | `/finans/api/recurring` | fhweb, ios, android |
| PATCH | `/finans/api/recurring/:id` | fhweb, ios, android |
| DELETE | `/finans/api/recurring/:id` | fhweb, ios, android |
| POST | `/finans/api/recurring/detect` | fhweb |
| GET | `/finans/api/reports` | fhweb, ios, android |
| POST | `/finans/api/rules` | fhweb, ios, android |
| PATCH | `/finans/api/rules/:id` | fhweb |
| DELETE | `/finans/api/rules/:id` | fhweb |
| POST | `/finans/api/rules/apply` | fhweb |
| POST | `/finans/api/scan/barcode` | fhweb, android |
| GET | `/finans/api/search` | fhweb, ios, android |
| POST | `/finans/api/search/ai` | fhweb, ios, android |
| POST | `/finans/api/search/ask` | web, fhweb, ios, android |
| GET | `/finans/api/search/ask/stream` | fhweb |
| POST | `/finans/api/search/ask/stream` | fhweb |
| GET | `/finans/api/search/history` | web, fhweb, ios, android |
| DELETE | `/finans/api/search/history` | web, fhweb, ios, android |
| GET | `/finans/api/search/log` |  |
| GET | `/finans/api/search/suggestions` | fhweb, ios, android |
| POST | `/finans/api/search/warm` |  |
| PUT | `/finans/api/settings` | web, fhweb, ios, android |
| GET | `/finans/api/settings` | web, fhweb, ios, android |
| GET | `/finans/api/stocks` | fhweb, ios, android |
| PUT | `/finans/api/stocks/config` | fhweb |
| GET | `/finans/api/stocks/dividends` |  |
| GET | `/finans/api/stocks/orders` |  |
| GET | `/finans/api/stocks/portfolio` |  |
| GET | `/finans/api/stocks/summary` |  |
| POST | `/finans/api/stocks/sync` | fhweb, ios, android |
| POST | `/finans/api/stocks/test` | fhweb |
| GET | `/finans/api/subscriptions` | web, fhweb, ios, android |
| POST | `/finans/api/subscriptions` | web, fhweb, ios, android |
| PATCH | `/finans/api/subscriptions/:id` | web, fhweb, ios, android |
| DELETE | `/finans/api/subscriptions/:id` | web, fhweb, ios, android |
| POST | `/finans/api/subscriptions/:id{[0-9]+}/leave` | web?, fhweb, ios, android |
| PUT | `/finans/api/subscriptions/:id{[0-9]+}/members` | web?, fhweb, ios, android |
| POST | `/finans/api/subscriptions/:id/logo` | web?, fhweb, ios, android |
| GET | `/finans/api/subscriptions/:id/logo` | web?, fhweb, ios, android |
| POST | `/finans/api/subscriptions/:id/logo/ai` | web?, fhweb, ios, android |
| GET | `/finans/api/subscriptions/candidates` | web?, fhweb, ios, android |
| POST | `/finans/api/subscriptions/from-screenshot` | web?, fhweb, ios, android |
| GET | `/finans/api/subscriptions/knowledge` | web? |
| PUT | `/finans/api/subscriptions/knowledge` | web? |
| GET | `/finans/api/subscriptions/log` | web?, fhweb, ios, android |
| POST | `/finans/api/subscriptions/log` | web?, fhweb, ios, android |
| GET | `/finans/api/subscriptions/log.csv` | web? |
| POST | `/finans/api/subscriptions/receipts` | web?, fhweb, ios, android |
| GET | `/finans/api/subscriptions/trials` | web, fhweb, ios, android |
| POST | `/finans/api/subscriptions/trials` | web, fhweb, ios, android |
| PATCH | `/finans/api/subscriptions/trials/:id{[0-9]+}` | web, fhweb, ios, android |
| POST | `/finans/api/subscriptions/trials/parse` | web?, fhweb?, ios? |
| GET | `/finans/api/summary` | web, fhweb, ios, android |
| GET | `/finans/api/tokens` | web, fhweb, ios, android |
| POST | `/finans/api/tokens` | web, fhweb, ios, android |
| DELETE | `/finans/api/tokens/:id` | web, fhweb, ios, android |
| GET | `/finans/api/transactions` | fhweb, ios, android |
| POST | `/finans/api/transactions` | fhweb, ios, android |
| GET | `/finans/api/transactions.csv` | fhweb |
| PATCH | `/finans/api/transactions/:id` | fhweb, ios, android |
| DELETE | `/finans/api/transactions/:id` | fhweb, ios, android |
| GET | `/finans/api/transactions/:id` | fhweb, ios, android |
| POST | `/finans/api/transactions/:id{[0-9]+}/reread` | fhweb |
| POST | `/finans/api/transactions/:id{[0-9]+}/reread/apply` | fhweb |
| POST | `/finans/api/transactions/:id{[0-9]+}/reset` |  |
| GET | `/finans/api/transactions/:id/original` | fhweb, ios, android |
| POST | `/finans/api/transactions/:id/receipt` | fhweb |
| GET | `/finans/api/transactions/months` |  |
| GET | `/finans/api/users` | web, fhweb, ios, android |
| GET | `/finans/api/users/shareable` | fhweb, ios, android |
| GET | `/finans/manifest.webmanifest` | fhweb |
| GET | `/finans/plan51` | fhweb? |
| POST | `/finans/share` |  |
| GET | `/finans/sw.js` | fhweb |
| GET | `/gjoremal` |  |
| GET | `/healthz` | web, fhweb |
| GET | `/hl/:token` |  |
| GET | `/home/api/inventory` |  |
| POST | `/home/api/inventory` |  |
| PATCH | `/home/api/inventory/:id` |  |
| DELETE | `/home/api/inventory/:id` |  |
| GET | `/home/api/property` |  |
| PUT | `/home/api/property` |  |
| GET | `/join/:token` | web |
| GET | `/kalender` | web, fhweb, ios, kal_ios, mac, android |
| GET | `/l/:code` |  |
| GET | `/login` | web, fhweb, ios, mac, android |
| GET | `/manifest.webmanifest` | web |
| PUT | `/mat/api/auto` | fhweb?, ios?, android? |
| POST | `/mat/api/calendar/rotate` | fhweb?, ios?, android? |
| POST | `/mat/api/cooks` | fhweb?, ios?, android? |
| PUT | `/mat/api/cooks` | fhweb?, ios?, android? |
| DELETE | `/mat/api/cooks/:name` | fhweb?, ios?, android? |
| PUT | `/mat/api/cooks/:name/best` | fhweb?, ios?, android? |
| PATCH | `/mat/api/day/:date` | fhweb?, ios?, android? |
| POST | `/mat/api/dishes` | fhweb?, ios?, android? |
| PATCH | `/mat/api/dishes/:id` | fhweb?, ios?, android? |
| DELETE | `/mat/api/dishes/:id` | fhweb?, ios?, android? |
| PUT | `/mat/api/dishes/:id/fixed` | fhweb?, ios?, android? |
| POST | `/mat/api/dishes/:id/links` | fhweb, ios?, android? |
| DELETE | `/mat/api/dishes/:id/links/:lid` | fhweb?, ios?, android? |
| GET | `/mat/api/files/:id` | fhweb?, ios?, android? |
| GET | `/mat/api/folders` | fhweb?, ios?, android? |
| POST | `/mat/api/folders` | fhweb?, ios?, android? |
| PATCH | `/mat/api/folders/:id` | fhweb?, ios?, android? |
| DELETE | `/mat/api/folders/:id` | fhweb?, ios?, android? |
| POST | `/mat/api/hellofresh` | fhweb?, ios?, android? |
| POST | `/mat/api/hellofresh/:id/add` | fhweb?, ios?, android? |
| POST | `/mat/api/meals` | fhweb?, ios?, android? |
| DELETE | `/mat/api/meals/:id` | fhweb?, ios?, android? |
| POST | `/mat/api/plan` | fhweb?, ios?, android? |
| POST | `/mat/api/recipes/import` | fhweb?, ios?, android? |
| POST | `/mat/api/recipes/import/save` | fhweb?, ios?, android? |
| GET | `/mat/api/recipes/jobs` | fhweb?, ios?, android? |
| DELETE | `/mat/api/recipes/jobs/:id` | fhweb?, ios?, android? |
| POST | `/mat/api/recipes/jobs/:id/retry` | fhweb?, ios?, android? |
| POST | `/mat/api/recipes/scan` | fhweb, ios?, android? |
| POST | `/mat/api/shopping` | fhweb?, ios, android? |
| DELETE | `/mat/api/shopping/:id` | fhweb?, ios, android? |
| POST | `/mat/api/shopping/:id/toggle` | fhweb?, ios?, android? |
| POST | `/mat/api/swap` | fhweb?, ios?, android? |
| GET | `/mat/api/week` | fhweb?, ios, android? |
| GET | `/mat/api/week.ics` | fhweb?, ios?, android? |
| GET | `/mat/calendar.ics` |  |
| GET | `/starting.html` |  |
| GET | `/sw.js` | web |
| GET | `/tiles/:file{blank(?:-dark)?(?:@2x)?\.png}` | web |
| GET | `/tiles/:style/:z/:x/:file` | web |
| GET | `/version.json` | web |

## A2. Endepunkter uten noen klienttreff (155)

- GET `/`
- GET `/.well-known/apple-app-site-association`
- GET `/.well-known/assetlinks.json`
- GET `/api/apps/kalender/:version/:file`
- GET `/api/bg/gphoto/img/:file`
- GET `/api/bible/users`
- PUT `/api/bible/users/:id`
- POST `/api/calendar/quick`
- POST `/api/calendar/quick/:id/cancel`
- POST `/api/calendar/quick/:id/undo`
- GET `/api/calendar/quick/jobs`
- POST `/api/calendar/quick/parse`
- GET `/api/domener/sammendrag`
- POST `/api/emo53/suggest`
- GET `/api/energy`
- POST `/api/finans/kvitteringer`
- POST `/api/finans/kvitteringer/ocr`
- GET `/api/hjemlys/notices`
- PUT `/api/hjemlys/phone`
- GET `/api/hjemlys/public/:token`
- GET `/api/integrasjoner`
- GET `/api/integrasjoner/:id`
- PUT `/api/integrasjoner/:id`
- DELETE `/api/integrasjoner/:id/:key`
- POST `/api/integrasjoner/:id/test`
- GET `/api/integrasjoner/status`
- GET `/api/kart/people`
- GET `/api/kart/zones`
- GET `/api/media51/audio/cover/:id`
- GET `/api/media51/audio/status`
- GET `/api/media51/storage/deletions`
- GET `/api/media51/storage/trash`
- GET `/api/media51/tonight/home`
- GET `/api/media51/tonight/profile`
- PUT `/api/media51/tonight/profile`
- GET `/api/news`
- GET `/api/news/glimt/prefs`
- PUT `/api/news/glimt/prefs`
- GET `/api/news/saved/:id/img/:n`
- GET `/api/offline51/versions`
- GET `/api/receipts.csv`
- GET `/api/rom/apod`
- GET `/api/rom/mars`
- GET `/api/rom/satellites`
- GET `/api/rom/settings`
- PUT `/api/rom/settings`
- GET `/api/rom/tle`
- PUT `/api/rss/categories/order`
- GET `/api/rss/favicon`
- GET `/api/rss/foryou`
- DELETE `/api/rss/interests/:word`
- POST `/api/rss/read`
- POST `/api/ruter/journey/home`
- GET `/api/settings/sections`
- POST `/api/studie/docs`
- GET `/api/studie/docs`
- GET `/api/studie/docs/:id{[0-9]+}`
- DELETE `/api/studie/docs/:id{[0-9]+}`
- POST `/api/studie/docs/:id{[0-9]+}/apply`
- POST `/api/studie/docs/:id{[0-9]+}/ask`
- PUT `/api/studie/docs/:id{[0-9]+}/courses`
- GET `/api/studie/docs/:id{[0-9]+}/file`
- POST `/api/studie/docs/:id{[0-9]+}/reanalyze`
- GET `/api/studie/docs/:id{[0-9]+}/thumb`
- POST `/api/tracking/:id{[0-9]+}/refresh`
- GET `/api/tracking/aliexpress`
- PUT `/api/tracking/aliexpress`
- POST `/api/tracking/aliexpress/check`
- POST `/api/tracking/aliexpress/mail`
- GET `/api/tracking/debug/:id{[0-9]+}`
- POST `/api/tracking/debug/:id{[0-9]+}/test`
- PUT `/api/tracking/keys/quota`
- DELETE `/api/tracking/notices`
- GET `/api/trading`
- GET `/api/update`
- POST `/api/update/abort`
- GET `/api/update/changelog`
- POST `/api/update/check`
- GET `/api/update/log`
- GET `/api/update/pause`
- DELETE `/api/update/pause`
- POST `/api/update/prune`
- GET `/api/update/resources`
- POST `/api/update/retry`
- GET `/api/update/settings`
- PUT `/api/update/settings`
- POST `/api/update/start`
- GET `/api/update/status`
- GET `/api/update/version`
- GET `/api/version`
- GET `/api/widgets/server-status`
- GET `/finans/api/ai/vision`
- POST `/finans/api/boliger/categories/suggest`
- GET `/finans/api/boliger/layout`
- PUT `/finans/api/boliger/layout`
- GET `/finans/api/boliger/search`
- GET `/finans/api/export.json`
- GET `/finans/api/finn/:id/ad/img/:n`
- GET `/finans/api/finn/:id/img/:n`
- POST `/finans/api/glimt/jobs`
- GET `/finans/api/glimt/jobs`
- GET `/finans/api/glimt/jobs/:id`
- DELETE `/finans/api/glimt/jobs/:id`
- GET `/finans/api/glimt/jobs/:id/events`
- GET `/finans/api/glimt/jobs/:id/report.pdf`
- GET `/finans/api/homes/:id{[0-9]+}/categories`
- POST `/finans/api/homes/:id{[0-9]+}/categories`
- GET `/finans/api/homes/:id{[0-9]+}/categories/:cid{[0-9]+}`
- DELETE `/finans/api/homes/:id{[0-9]+}/categories/:cid{[0-9]+}`
- POST `/finans/api/homes/:id{[0-9]+}/categories/glimt`
- POST `/finans/api/homes/:id{[0-9]+}/entries/:eid{[0-9]+}/reanalyze`
- GET `/finans/api/homes/:id{[0-9]+}/entries/:eid{[0-9]+}/receipt`
- POST `/finans/api/homes/:id{[0-9]+}/entries/:eid{[0-9]+}/receipt`
- GET `/finans/api/homes/:id{[0-9]+}/expenses`
- POST `/finans/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}/reanalyze`
- GET `/finans/api/homes/:id{[0-9]+}/projects`
- POST `/finans/api/homes/:id{[0-9]+}/projects`
- GET `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}`
- PATCH `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}`
- DELETE `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}`
- POST `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/candidates`
- POST `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/glimt`
- POST `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/items`
- DELETE `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/items/:eid{[0-9]+}`
- POST `/finans/api/homes/:id{[0-9]+}/projects/:pid{[0-9]+}/items/undo`
- GET `/finans/api/homes/:id{[0-9]+}/review`
- POST `/finans/api/homes/:id{[0-9]+}/review/approve`
- GET `/finans/api/homes/:id{[0-9]+}/search`
- GET `/finans/api/homes/:id{[0-9]+}/years`
- POST `/finans/api/import/home-rules/run`
- POST `/finans/api/import/preview`
- POST `/finans/api/import/xlsx`
- GET `/finans/api/jobs/:id/events`
- GET `/finans/api/logos52/match`
- GET `/finans/api/merchants/logo/file/:file`
- GET `/finans/api/search/log`
- POST `/finans/api/search/warm`
- GET `/finans/api/stocks/dividends`
- GET `/finans/api/stocks/orders`
- GET `/finans/api/stocks/portfolio`
- GET `/finans/api/stocks/summary`
- POST `/finans/api/transactions/:id{[0-9]+}/reset`
- GET `/finans/api/transactions/months`
- POST `/finans/share`
- GET `/gjoremal`
- GET `/hl/:token`
- GET `/home/api/inventory`
- POST `/home/api/inventory`
- PATCH `/home/api/inventory/:id`
- DELETE `/home/api/inventory/:id`
- GET `/home/api/property`
- PUT `/home/api/property`
- GET `/l/:code`
- GET `/mat/calendar.ics`
- GET `/starting.html`

## A3. Eksporter som ingen fil (server, test, skript) importerer

- `server/space32.js`: _setSpaceFetch, apodWeek, marsRovers, checkMars, CATS, catOf, CITIES, makeTle, tleText, satellites
- `server/fermion53/index.js`: fermion53Api, chatModels53, neutrinoChatStream53, isNeutrino53, NEUTRINO_ID53, NEUTRINO_BACKEND53, phononAsr53
- `server/omlx58/index.js`: omlx58Api, healthOut58, testOmlx58, engineFor58, omlxModelFor58, omlxConf58
- `server/hjemlys41.js`: KINDS41, noticeText41, noticeOut41, startTrip41, notice41
- `server/admin44.js`: IMP_TTL_MS, impOf, serverOwner44, layoutOut44
- `server/finans/p40.js`: kr40, stripMd40, lineCheck40, rereadChanges40
- `server/medfam51/index.js`: famcal51Api, media51Api, sweepDeletions51, sweepFamcal51
- `server/misc45.js`: _setHereGeo45, weatherHere45, tasksHaSummary45, settingsSections45
- `server/tasks.js`: REPS, EARLY, PLACES, nextDue
- `server/ai-api.js`: fitOf, _setAiApiFetch, FIN_DEFAULTS
- `server/api40.js`: PAGES40, PAGE_KEYS40, pagesFor40
- `server/chat-scans.js`: SCAN_FOLDER, SCAN_KINDS, scanFolderId
- `server/obs51/index.js`: obs51Api, ntfy51Api, alertRound51
- `server/receipts48/routes.js`: SOURCE48, client48, homeTarget52
- `server/voxcpm57/index.js`: voxcpm57Api, vxReady57, vxConfigured57
- `server/auth40.js`: ISSUER40, status40
- `server/auth44.js`: REFRESH_MS, refresh44
- `server/docker45.js`: dockerSetupState45, setup45
- `server/finans/added40.js`: VIA, osloStamp
- `server/finans/highlight30.js`: termsOf, cleanBbox
- `server/medfam51/subs.js`: bazarrConf51, bazarrOn51
- `server/medfam51/tonight.js`: GENRES51, _history51
- `server/media45.js`: unmonitored45, playbackSummary45
- `server/mem63/review.js`: editOf63, CHOICES63
- `server/recipes61/engine61.js`: planKey61, writes61
- `server/secret86.js`: SECRET_HELP86, resolveSecret86
- `server/skjold76/picklist79.js`: MAX_PICK79, picklist79
- `server/weather.js`: symbolText, symbolKind
- `server/whisper54/index.js`: whisper54Api, nbWhisperAsr54
- `server/api41.js`: VAER_CARDS41
- `server/convo60/tools60.js`: cancelTool60
- `server/fast59/api.js`: PING_MS59
- `server/finans/boliger30.js`: colorFor
- `server/finans/csv.js`: parseDate
- `server/medfam51/audio.js`: _clearAbs51
- `server/recipes61/api.js`: INTENTS47
- `server/sched62/api.js`: BRIEF62
- `server/search-history.js`: historyEnabled
- `server/skjold76/api.js`: freeOf76
- `server/tasks43.js`: tabOrder43
- `server/trial-widgets.js`: trialsWidget
- `server/voxcpm57/client.js`: SHA_RE57
- `server/widgets43.js`: widgetCatalog43

## A4. Spørringer med full tabellskanning (EXPLAIN QUERY PLAN, 214 stk)

Kun SQL-strenger uten `${}`-interpolasjon. Mange er greie (små tabeller, admin-lister); se hovedrapporten for de viktige.

| Fil:linje | Skanning | SQL (forkortet) |
|---|---|---|
| admin44.js:53 | SCAN users | `SELECT id FROM users WHERE is_main_admin=1 ORDER BY created LIMIT 1` |
| admin44.js:308 | SCAN users | `UPDATE users SET is_main_admin=0 WHERE is_main_admin=1` |
| ai-api.js:491 | SCAN fh_tokens | `SELECT * FROM fh_tokens WHERE COALESCE(user_id, ?)=? AND name LIKE ? ORDER BY created DESC` |
| ai-api.js:505 | SCAN fh_tokens | `DELETE FROM fh_tokens WHERE substr(id,1,12)=? AND COALESCE(user_id, ?)=? AND name LIKE ?` |
| ai-import45.js:403 | SCAN hl_chat_folders | `SELECT id FROM hl_chat_folders WHERE user_id=? AND name=? ORDER BY created LIMIT 1` |
| auth.js:28 | SCAN users | `SELECT 1 FROM users WHERE is_main_admin=1` |
| auth.js:163 | SCAN sessions | `DELETE FROM sessions WHERE user=? AND id<>?` |
| auth.js:164 | SCAN sessions | `DELETE FROM sessions WHERE user=?` |
| auth.js:450 | SCAN sessions | `DELETE FROM sessions WHERE expires < ?` |
| auth41.js:162 | SCAN fh_app_codes | `DELETE FROM fh_app_codes WHERE exp < ?` |
| auth44.js:55 | SCAN fh_refresh44 | `DELETE FROM fh_refresh44 WHERE family=?` |
| auth44.js:58 | SCAN fh_refresh44 | `SELECT * FROM fh_refresh44 WHERE family=?` |
| backup51.js:272 | SCAN ops51_backup_runs | `SELECT * FROM ops51_backup_runs ORDER BY started DESC LIMIT ?` |
| backup51.js:328 | SCAN ops51_restore_tests | `SELECT * FROM ops51_restore_tests ORDER BY started DESC LIMIT ?` |
| chat.js:214 | SCAN hl_chat_folders | `SELECT * FROM hl_chat_folders WHERE user_id=? ORDER BY created` |
| chat.js:488 | SCAN hl_chats | `SELECT * FROM hl_chats WHERE share_token=?` |
| chat.js:666 | SCAN hl_chat_files | `SELECT id, name, size, mime, created FROM hl_chat_files WHERE user_id=? ORDER BY created DESC LIMIT 200` |
| convo60/entities.js:59 | SCAN family_zone | `SELECT * FROM family_zone WHERE created_by=? OR shared=1 ORDER BY id` |
| dal53/news.js:44 | SCAN news_topics53 | `DELETE FROM news_topics53 WHERE item_id NOT IN (SELECT id FROM rss_item)` |
| db.js:97 | SCAN grades | `SELECT 1 FROM grades LIMIT 1` |
| dbmaint51.js:99 | SCAN ops51_maint | `SELECT * FROM ops51_maint WHERE integrity IS NOT NULL ORDER BY started DESC LIMIT 1` |
| dbmaint51.js:116 | SCAN ops51_maint | `SELECT * FROM ops51_maint ORDER BY started DESC LIMIT 1` |
| dbmaint51.js:117 | SCAN ops51_maint | `SELECT * FROM ops51_maint ORDER BY started DESC LIMIT ?` |
| dbmaint51.js:157 | SCAN ops51_maint; SCAN ops51_maint | `DELETE FROM ops51_maint WHERE id NOT IN (SELECT id FROM ops51_maint ORDER BY started DESC LIMIT 100)` |
| dbmaint51.js:197 | SCAN ops51_migrations; SCAN ops51_migrations | `DELETE FROM ops51_migrations WHERE id NOT IN (SELECT id FROM ops51_migrations ORDER BY at DESC LIMIT 200)` |
| dbmaint51.js:204 | SCAN ops51_migrations | `SELECT * FROM ops51_migrations ORDER BY at DESC, id DESC LIMIT ?` |
| domains.js:49 | SCAN hl_domains | `SELECT * FROM hl_domains ORDER BY id` |
| family.js:49 | SCAN family_zone | `UPDATE family_zone SET created_by=? WHERE created_by IS NULL` |
| family.js:80 | SCAN family_zone | `SELECT id, name FROM family_zone WHERE icon IS NULL` |
| family.js:103 | SCAN family_zone | `SELECT * FROM family_zone WHERE place_type IS NULL` |
| family.js:104 | SCAN z | `SELECT z.* FROM family_zone z WHERE NOT EXISTS (SELECT 1 FROM family_area50 a WHERE a.zone_id=z.id)` |
| family.js:230 | SCAN family_zone | `SELECT * FROM family_zone ORDER BY id` |
| family.js:232 | SCAN family_zone | `SELECT * FROM family_zone WHERE created_by=? OR shared=1 ORDER BY id` |
| family.js:289 | SCAN i | `SELECT i.user, i.zone_id, i.out_since, z.name FROM family_inside i JOIN family_zone z ON z.id=i.zone_id WHERE i.inside=1` |
| family.js:345 | SCAN family_pos | `DELETE FROM family_pos WHERE ts < ?` |
| family.js:348 | SCAN family_health | `DELETE FROM family_health WHERE date < ?` |
| family.js:762 | SCAN family_inside | `DELETE FROM family_inside WHERE zone_id=?` |
| family50.js:450 | SCAN family_checkin50 | `SELECT * FROM family_checkin50 WHERE remind_at IS NOT NULL AND reminded_at IS NULL AND remind_at <= ? LIMIT 50` |
| finans/backup.js:302 | SCAN kv | `SELECT * FROM kv` |
| finans/backup.js:468 | SCAN fh_backups | `SELECT * FROM fh_backups ORDER BY created DESC LIMIT 60` |
| finans/boliger.js:90 | SCAN c; SCAN e | `SELECT c.*, (SELECT count(*) FROM fh_folder_entries e WHERE e.category_id=c.id) AS cnt FROM fh_bolig_categories c ORDER ` |
| finans/boliger.js:253 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET category=? WHERE category=?` |
| finans/boliger.js:262 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET category_id=? WHERE category_id=?` |
| finans/boliger.js:266 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET category_id=?, category=? WHERE category_id=?` |
| finans/boliger.js:278 | SCAN fh_folder_entries | `SELECT 1 FROM fh_folder_entries WHERE category_id=? LIMIT 1` |
| finans/boliger.js:279 | SCAN s | `SELECT s.*, t.name AS top FROM fh_bolig_categories s JOIN fh_bolig_categories t ON t.id=s.parent_id` |
| finans/boliger30.js:30 | SCAN fh_folder_members | `SELECT user_id FROM fh_folder_members WHERE folder_id=? AND user_id IS NOT NULL` |
| finans/boliger30.js:31 | SCAN m2 | `SELECT m2.user_id uid, f.name FROM fh_folder_members m1 JOIN fh_folder_members m2 ON m2.folder_id=m1.folder_id JOIN fh_f` |
| finans/db.js:24 | SCAN sqlite_sequence | `SELECT seq FROM sqlite_sequence WHERE name=?` |
| finans/db.js:37 | SCAN sqlite_sequence | `UPDATE sqlite_sequence SET seq=max(seq, ?) WHERE name=?` |
| finans/db.js:314 | SCAN fh_folders | `UPDATE fh_folders SET owner_id=? WHERE owner_id IS NULL` |
| finans/db.js:486 | SCAN receipts | `SELECT * FROM receipts WHERE user=?` |
| finans/demo.js:99 | SCAN users | `SELECT id, username, name FROM users` |
| finans/finn-routes.js:361 | SCAN fh_finn_files | `SELECT kind, count(*) n FROM fh_finn_files WHERE finn_id=? GROUP BY kind` |
| finans/finn-routes.js:468 | SCAN fh_finn_files | `SELECT * FROM fh_finn_files WHERE finn_id=? ORDER BY id` |
| finans/finn-routes.js:603 | SCAN fh_finn_files | `SELECT file FROM fh_finn_files WHERE finn_id=?` |
| finans/finn-routes.js:606 | SCAN fh_finn_files | `DELETE FROM fh_finn WHERE id=?` |
| finans/finn-routes.js:887 | SCAN fh_finn_files | `DELETE FROM fh_finn WHERE id=?` |
| finans/finn42.js:94 | SCAN a | `SELECT a.finn_id, a.images, f.finn_code FROM fh_finn_ad a JOIN fh_finn f ON f.id=a.finn_id` |
| finans/homes42.js:129 | SCAN fh_folder_members | `SELECT * FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| finans/homes42.js:135 | SCAN m | `SELECT f.*, m.role FROM fh_folders f JOIN fh_folder_members m ON m.folder_id=f.id AND m.user_id=? ORDER BY f.id` |
| finans/homes42.js:147 | SCAN fh_folder_members | `SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| finans/homes42.js:165 | SCAN fh_folder_projects | `SELECT id, name FROM fh_folder_projects WHERE folder_id=? ORDER BY id` |
| finans/homes42.js:171 | SCAN x | `SELECT c.id, c.name, c.color, count(*) n FROM fh_folder_entries x JOIN fh_bolig_categories c ON c.id=x.category_id WHERE` |
| finans/homes42.js:184 | SCAN fh_folder_entries | `SELECT * FROM fh_folder_entries WHERE folder_id=? AND date>=? AND date<? ORDER BY date DESC, id DESC` |
| finans/homes42.js:192 | SCAN fh_folder_entries | `SELECT * FROM fh_folder_entries WHERE folder_id=? AND date>=? AND date<?` |
| finans/homes42.js:194 | SCAN e | `SELECT count(*) FROM fh_folder_entries e WHERE e.folder_id=? AND e.receipt_id IS NULL AND e.tx_id IS NULL AND e.date<? A` |
| finans/homes42.js:195 | SCAN fh_folder_members | `SELECT name, user_id FROM fh_folder_members WHERE folder_id=? ORDER BY id` |
| finans/homes42.js:200 | SCAN fh_folder_entries | `SELECT * FROM fh_folder_entries WHERE folder_id=? ORDER BY date DESC, id DESC LIMIT 1` |
| finans/homes42.js:213 | SCAN fh_folder_entries | `SELECT substr(date,1,4) y, sum(amount) s, count(*) n FROM fh_folder_entries WHERE folder_id=? GROUP BY y` |
| finans/homes42.js:233 | SCAN fh_folder_entries | `SELECT * FROM fh_folder_entries WHERE folder_id=?` |
| finans/homes42.js:239 | SCAN fh_folder_entries | `SELECT ifnull(sum(amount),0) FROM fh_folder_entries WHERE folder_id=? AND date>=? AND date<? AND category_id IN (SELECT ` |
| finans/homes42.js:279 | SCAN fh_folder_projects | `SELECT * FROM fh_folder_projects WHERE folder_id=? ORDER BY id` |
| finans/homes42.js:309 | SCAN fh_folder_entries | `SELECT * FROM fh_folder_entries WHERE folder_id=? ORDER BY date DESC, id DESC` |
| finans/homes42.js:328 | SCAN fh_folder_entries | `SELECT * FROM fh_folder_entries WHERE folder_id=? ORDER BY date DESC, id DESC` |
| finans/homes42.js:389 | SCAN fh_folder_entries | `SELECT 1 FROM fh_folder_entries WHERE tx_id=?` |
| finans/homes42.js:513 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET category_id=?, category=? WHERE category_id=?` |
| finans/homes42.js:542 | SCAN fh_folder_entries | `SELECT * FROM fh_folder_entries WHERE folder_id=? AND (project_id IS NULL OR project_id NOT IN (SELECT id FROM fh_folder` |
| finans/homes42.js:557 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET project_id=NULL WHERE project_id=? AND folder_id=?` |
| finans/homes42.js:558 | SCAN fh_project_installments | `DELETE FROM fh_folder_projects WHERE id=? AND folder_id=?` |
| finans/homes42.js:567 | SCAN fh_folder_entries | `SELECT id FROM fh_folder_entries WHERE folder_id=? AND tx_id=?` |
| finans/homes42.js:571 | SCAN fh_folder_entries | `SELECT id FROM fh_folder_entries WHERE folder_id=? AND receipt_id=?` |
| finans/receipts39.js:186 | SCAN fh_rules; SCAN fh_recurring; SCAN fh_receipts; SCAN fh_transactions | `DELETE FROM fh_categories WHERE id=?` |
| finans/routes.js:99 | SCAN fh_tokens | `DELETE FROM fh_tokens WHERE user_id=?` |
| finans/routes.js:108 | SCAN fh_tokens | `DELETE FROM fh_tokens WHERE user_id=?` |
| finans/routes.js:145 | SCAN t; SCAN e; SCAN e | `SELECT t.*, r.status AS receipt_status, r.id AS receipt_id, r.extraction AS receipt_extraction, r.ai_short AS receipt_ai` |
| finans/routes.js:285 | SCAN fh_folder_members | `SELECT 1 FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| finans/routes.js:286 | SCAN e | `SELECT 1 FROM fh_folder_entries e JOIN fh_folder_members m ON m.folder_id=e.folder_id WHERE e.receipt_id=? AND m.user_id` |
| finans/routes.js:441 | SCAN fh_folder_members | `SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| finans/routes.js:446 | SCAN fh_folder_entries | `SELECT id FROM fh_folder_entries WHERE receipt_id=?` |
| finans/routes.js:450 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET description=?, date=?, amount=? WHERE receipt_id=?` |
| finans/routes.js:715 | SCAN fh_folder_entries; SCAN fh_project_installments | `DELETE FROM fh_folder_entries WHERE tx_id=?` |
| finans/routes.js:720 | SCAN fh_folder_members | `SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| finans/routes.js:773 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET amount=?, date=?, description=? WHERE tx_id=?` |
| finans/routes.js:785 | SCAN fh_folder_entries; SCAN fh_project_installments | `DELETE FROM fh_folder_entries WHERE tx_id=?` |
| finans/routes.js:786 | SCAN fh_finn; SCAN fh_folder_entries; SCAN fh_subscriptions; SCAN fh_receipts | `DELETE FROM fh_transactions WHERE id=?` |
| finans/routes.js:942 | SCAN fh_folder_members | `SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| finans/routes.js:1080 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET tx_id=? WHERE receipt_id=? AND tx_id IS NULL` |
| finans/routes.js:1103 | SCAN fh_receipts | `SELECT COUNT(*) n FROM fh_receipts WHERE transaction_id=? AND id<>?` |
| finans/routes.js:1105 | SCAN fh_folder_entries | `UPDATE fh_folder_entries SET tx_id=NULL WHERE tx_id=?` |
| finans/routes.js:1106 | SCAN fh_finn; SCAN fh_folder_entries; SCAN fh_subscriptions; SCAN fh_receipts | `DELETE FROM fh_transactions WHERE id=?` |
| finans/routes.js:1418 | SCAN fh_folder_entries | `DELETE FROM fh_receipts WHERE id=?` |
| finans/routes.js:1509 | SCAN fh_recurring; SCAN fh_receipts; SCAN fh_transactions | `DELETE FROM fh_accounts WHERE id=? AND user_id=?` |
| finans/routes.js:1557 | SCAN fh_rules; SCAN fh_recurring; SCAN fh_receipts; SCAN fh_transactions | `DELETE FROM fh_categories WHERE id=? AND user_id=?` |
| finans/routes.js:1753 | SCAN fh_tokens | `SELECT * FROM fh_tokens WHERE COALESCE(user_id, ?)=? ORDER BY created DESC` |
| finans/routes.js:1779 | SCAN fh_tokens | `DELETE FROM fh_tokens WHERE substr(id,1,12)=? AND COALESCE(user_id, ?)=?` |
| finans/routes.js:2032 | SCAN fh_folder_members | `SELECT * FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| finans/routes.js:2053 | SCAN fh_folder_members | `SELECT * FROM fh_folder_members WHERE folder_id=? AND user_id IS NOT NULL` |
| finans/routes.js:2055 | SCAN fh_folder_members | `SELECT 1 FROM fh_folder_members WHERE folder_id=? AND name=? AND id<>?` |
| finans/routes.js:2065 | SCAN e | `SELECT e.*, p.name AS project FROM fh_folder_entries e LEFT JOIN fh_folder_projects p ON p.id=e.project_id WHERE e.folde` |
| finans/routes.js:2109 | SCAN fh_folder_projects | `SELECT * FROM fh_folder_projects WHERE folder_id=? ORDER BY id` |
| finans/routes.js:2111 | SCAN fh_project_installments | `SELECT * FROM fh_project_installments WHERE project_id=? ORDER BY sort, id` |
| finans/routes.js:2116 | SCAN fh_folder_bills | `SELECT * FROM fh_folder_bills WHERE folder_id=? ORDER BY id` |
| finans/routes.js:2148 | SCAN m | `SELECT f.* FROM fh_folders f JOIN fh_folder_members m ON m.folder_id=f.id AND m.user_id=? ORDER BY f.id` |
| finans/routes.js:2260 | SCAN fh_folder_bills; SCAN fh_folder_projects; SCAN fh_folder_entries; SCAN fh_folder_members | `DELETE FROM fh_folders WHERE id=?` |
| finans/routes.js:2276 | SCAN fh_folder_members | `SELECT id FROM fh_folder_members WHERE folder_id=? AND user_id IS NULL AND lower(name)=lower(?)` |
| finans/routes.js:2322 | SCAN fh_folder_members | `SELECT 1 FROM fh_folder_members WHERE folder_id=? AND name=?` |
| finans/routes.js:2330 | SCAN fh_folder_members | `SELECT name FROM fh_folder_members WHERE folder_id=?` |
| finans/routes.js:2342 | SCAN fh_folder_entries | `SELECT 1 FROM fh_folder_entries WHERE folder_id=? AND tx_id=?` |
| finans/routes.js:2382 | SCAN fh_folder_members | `SELECT 1 FROM fh_folder_members WHERE folder_id=? AND name=?` |
| finans/routes.js:2398 | SCAN fh_folder_entries | `SELECT 1 FROM fh_folder_entries WHERE folder_id=? AND receipt_id=?` |
| finans/routes.js:2404 | SCAN fh_project_installments | `DELETE FROM fh_folder_entries WHERE id=? AND folder_id=?` |
| finans/routes.js:2427 | SCAN fh_project_installments | `DELETE FROM fh_folder_projects WHERE id=? AND folder_id=?` |
| finans/routes.js:2452 | SCAN fh_folder_projects | `DELETE FROM fh_project_installments WHERE id=? AND project_id IN (SELECT id FROM fh_folder_projects WHERE folder_id=?)` |
| finans/routes.js:2750 | SCAN fh_backups | `SELECT * FROM fh_backups ORDER BY created DESC LIMIT 20` |
| finans/search.js:35 | SCAN t | `SELECT t.id, t.user_id, t.date, t.amount, t.description, t.merchant, t.note, t.ai_short, t.ai_long, c.name AS category, ` |
| finans/search42.js:135 | SCAN e | `SELECT e.tx_id, e.folder_id FROM fh_folder_entries e JOIN fh_transactions t ON t.id=e.tx_id WHERE t.user_id=?` |
| glimt45/engine.js:218 | SCAN glimt45_requests | `DELETE FROM glimt45_requests WHERE created < ?` |
| glimt45/engine.js:218 | SCAN glimt45_confirm | `DELETE FROM glimt45_confirm WHERE created < ?` |
| glimt45/trace47.js:75 | SCAN glimt47_trace | `DELETE FROM glimt47_trace WHERE created < ?` |
| hjemlys40.js:161 | SCAN hjemlys_tokens | `SELECT count(*) FROM hjemlys_tokens WHERE (user_id=? OR session_id=?)` |
| hjemlys40.js:259 | SCAN hjemlys_sessions | `DELETE FROM hjemlys_pos WHERE session_id IN (SELECT id FROM hjemlys_sessions WHERE ended_at IS NOT NULL AND ended_at < ?` |
| hjemlys41.js:154 | SCAN hjemlys_links | `DELETE FROM hjemlys_links WHERE expires_at < ?` |
| hjemlys41.js:158 | SCAN hjemlys_status | `SELECT * FROM hjemlys_status WHERE created_at > ? ORDER BY created_at DESC LIMIT 200` |
| index.js:451 | SCAN devices | `SELECT id, name, created, last_seen, last_ip FROM devices WHERE user=? ORDER BY last_seen DESC` |
| index.js:521 | SCAN devices | `SELECT id FROM devices WHERE user=? AND substr(id,1,16)=?` |
| index.js:569 | SCAN receipts | `SELECT user FROM receipts WHERE file=? OR thumb=? LIMIT 1` |
| index.js:620 | SCAN receipts | `SELECT * FROM receipts WHERE user=? ORDER BY date DESC, id DESC` |
| index.js:654 | SCAN receipts | `SELECT * FROM receipts WHERE user=? ORDER BY date` |
| index.js:662 | SCAN grades | `SELECT id, subject, grade, tests FROM grades WHERE user=? ORDER BY sort, id` |
| index.js:681 | SCAN tests | `SELECT id, date, title, note FROM tests WHERE user=? ORDER BY date` |
| mat-recipes.js:126 | SCAN dish_link | `SELECT * FROM dish_link WHERE user_id=? ORDER BY created` |
| mat-recipes.js:412 | SCAN mat_scan_job | `SELECT * FROM mat_scan_job WHERE user_id=? ORDER BY created DESC LIMIT 30` |
| mat.js:186 | SCAN dish_link | `SELECT id, dish_id, url FROM dish_link WHERE user_id=?` |
| mat.js:192 | SCAN mat_file | `UPDATE mat_file SET user_id=? WHERE user_id=?` |
| mat.js:193 | SCAN mat_scan_job | `SELECT id, dish_id FROM mat_scan_job WHERE user_id=?` |
| medfam51/storage.js:132 | SCAN media51_deletion | `SELECT * FROM media51_deletion ORDER BY id DESC LIMIT 50` |
| misc45.js:67 | SCAN m | `SELECT m.list_id, m.entity_id, l.name FROM huske_ha_map m LEFT JOIN hl_task_lists l ON l.id = m.list_id WHERE l.owner=? ` |
| obs51/heal.js:137 | SCAN obs51_heal_events | `SELECT * FROM obs51_heal_events ORDER BY ts DESC LIMIT 50` |
| obs51/health.js:42 | SCAN obs51_samples | `DELETE FROM obs51_samples WHERE ts < ?` |
| playback44.js:176 | SCAN plays44 | `SELECT id, server, skey, seen FROM plays44 WHERE stopped IS NULL AND seen>?` |
| playback44.js:204 | SCAN plays44 | `SELECT user AS name, COUNT(*) count FROM plays44 GROUP BY user ORDER BY count DESC` |
| profiles37.js:39 | SCAN users | `SELECT id, name, username FROM users ORDER BY created` |
| profiles37.js:50 | SCAN profiles37 | `SELECT 1 FROM profiles37 WHERE lower(name)=lower(?)` |
| profiles37.js:99 | SCAN profiles37 | `SELECT * FROM profiles37 ORDER BY user_id IS NULL, created, id` |
| qa51.js:114 | SCAN flag_overrides51 | `SELECT flag_key, value FROM flag_overrides51 WHERE user=? AND device=?` |
| qa51.js:316 | SCAN crash51 | `SELECT id FROM crash51 WHERE forwarded=0 ORDER BY id LIMIT ?` |
| qa51.js:323 | SCAN crash51 | `SELECT COUNT(*) n FROM crash51 WHERE forwarded=0` |
| qa51.js:382 | SCAN flags51 | `SELECT * FROM flags51 ORDER BY builtin DESC, key` |
| qa51.js:384 | SCAN flag_devices51 | `SELECT user, device, name, platform, last_seen FROM flag_devices51 ORDER BY last_seen DESC LIMIT 500` |
| qr38.js:444 | SCAN fh_tokens | `SELECT id FROM fh_tokens WHERE COALESCE(user_id, ?)=? AND name NOT LIKE ?` |
| qr38.js:462 | SCAN sessions | `DELETE FROM sessions WHERE user=? AND id IS NOT ?` |
| qr38.js:463 | SCAN devices | `DELETE FROM devices WHERE user=? AND id IS NOT ?` |
| qr38.js:482 | SCAN sessions | `SELECT COUNT(*) n FROM sessions WHERE user=? AND expires>=?` |
| qr38.js:483 | SCAN devices | `SELECT COUNT(*) n FROM devices WHERE user=?` |
| qr38.js:485 | SCAN fh_tokens | `SELECT COUNT(*) n FROM fh_tokens WHERE COALESCE(user_id, ?)=? AND name NOT LIKE ? AND (expires IS NULL OR expires>=?)` |
| quality64/store.js:96 | SCAN quality64_requests | `DELETE FROM quality64_requests WHERE at < ?` |
| quality64/store.js:121 | SCAN quality64_requests | `SELECT * FROM quality64_requests WHERE at>=? AND at<? ORDER BY at` |
| quality64/system.js:42 | SCAN users | `SELECT id FROM users ORDER BY created` |
| quality64/weekly.js:72 | SCAN glimt47_trace | `SELECT id, user_id, created, data FROM glimt47_trace WHERE created >= ? ORDER BY created` |
| quality64/weekly.js:96 | SCAN recipes | `SELECT COUNT(*) FROM recipes WHERE created_at>=? AND created_at<?` |
| ratelimit51.js:59 | SCAN sec51_limits | `SELECT * FROM sec51_limits WHERE locked_until>? OR last_fail>? ORDER BY locked_until DESC, last_fail DESC LIMIT 500` |
| ratelimit51.js:69 | SCAN sec51_limits | `DELETE FROM sec51_limits WHERE locked_until<? AND COALESCE(last_fail,0)<?` |
| receipts48/corrections.js:62 | SCAN receipt_corrections48 | `SELECT * FROM receipt_corrections48 ORDER BY id` |
| receipts48/routes.js:112 | SCAN fh_folder_members | `SELECT role FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| receipts48/routes.js:127 | SCAN fh_folder_entries | `SELECT 1 FROM fh_folder_entries WHERE receipt_id=?` |
| receipts48/routes.js:128 | SCAN fh_folder_members | `SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?` |
| receipts48/routes.js:209 | SCAN fh_folder_entries | `SELECT id FROM fh_folder_entries WHERE receipt_id=?` |
| recipes61/store.js:71 | SCAN recipe_negatives | `SELECT COUNT(*) FROM recipe_negatives WHERE recipe_id=?` |
| sec51.js:164 | SCAN devices | `SELECT 1 FROM devices WHERE user=? AND paused=0 LIMIT 1` |
| sec51.js:620 | SCAN sec51_approvals | `DELETE FROM sec51_approvals WHERE exp<? AND (retry_until IS NULL OR retry_until<?)` |
| secret91.js:201 | SCAN main.users | `SELECT id, username, totp_enabled, totp_secret_enc, recovery_hashes FROM main.users WHERE totp_secret_enc IS NOT NULL` |
| skjold76/api.js:56 | SCAN (subquery-1) | `SELECT count(*) FROM (SELECT DISTINCT row, col FROM skj_parts WHERE user_id=? AND cabinet_id=? AND deleted_at IS NULL)` |
| study44.js:335 | SCAN grades | `SELECT 1 FROM grades WHERE user=? AND subject=?` |
| study44.js:361 | SCAN tests | `SELECT id, date, title, note FROM tests WHERE user=? AND date>=? ORDER BY date LIMIT 20` |
| study44.js:364 | SCAN grades | `SELECT id, subject, grade FROM grades WHERE user=? ORDER BY sort, id` |
| system-backup.js:193 | SCAN backup_jobs | `SELECT * FROM backup_jobs WHERE cloud IS NOT NULL ORDER BY started DESC LIMIT 1` |
| system-backup.js:195 | SCAN backup_jobs | `SELECT * FROM backup_jobs WHERE smb IS NOT NULL ORDER BY started DESC LIMIT 1` |
| tasks-ha.js:39 | SCAN hl_tasks | `UPDATE hl_tasks SET updated_at=created_at WHERE updated_at=0` |
| tasks-ha.js:47 | SCAN huske_ha_map | `SELECT * FROM huske_ha_map ORDER BY created` |
| tasks-ha.js:50 | SCAN huske_ha_queue | `SELECT COUNT(*) n FROM huske_ha_queue` |
| tasks-ha.js:398 | SCAN huske_ha_queue | `UPDATE huske_ha_queue SET tries=tries+1, last_error=?` |
| tasks-ha.js:529 | SCAN huske_ha_queue | `DELETE FROM huske_ha_queue WHERE entity_id=?` |
| tasks-ha.js:544 | SCAN huske_ha_queue | `DELETE FROM huske_ha_queue WHERE entity_id=?` |
| tasks-ha.js:565 | SCAN hl_task_lists | `SELECT * FROM hl_task_lists` |
| tasks-ha.js:585 | SCAN huske_ha_queue | `DELETE FROM huske_ha_queue WHERE entity_id=?` |
| tasks.js:63 | SCAN users | `SELECT id FROM users WHERE is_main_admin=1 ORDER BY created LIMIT 1` |
| tasks.js:65 | SCAN hl_task_lists | `UPDATE hl_task_lists SET owner=? WHERE owner IS NULL` |
| tasks.js:108 | SCAN users | `SELECT id FROM users WHERE is_main_admin=1 ORDER BY created LIMIT 1` |
| tasks.js:134 | SCAN hl_task_lists | `SELECT * FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?) ORDER BY o` |
| tasks.js:148 | SCAN hl_task_lists | `SELECT * FROM hl_task_lists WHERE household=1` |
| tasks.js:149 | SCAN hl_task_lists | `SELECT 1 FROM hl_task_lists WHERE owner=? LIMIT 1` |
| tasks.js:172 | SCAN hl_task_lists | `SELECT id FROM hl_task_lists WHERE owner=? AND lower(name)=lower(?) ORDER BY sort, created LIMIT 1` |
| tasks.js:184 | SCAN hl_task_lists | `SELECT id FROM hl_task_lists WHERE owner=? ORDER BY sort, created LIMIT 1` |
| tasks.js:335 | SCAN hl_tasks | `SELECT * FROM hl_tasks WHERE done=1 AND archived_at IS NULL AND done_at IS NOT NULL AND done_at<?` |
| tasks.js:600 | SCAN hl_task_lists | `SELECT COUNT(*) n FROM hl_task_lists WHERE owner=?` |
| tasks.js:603 | SCAN hl_task_lists | `SELECT id FROM hl_task_lists WHERE owner=? AND id != ? ORDER BY sort, created LIMIT 1` |
| tasks43.js:14 | SCAN hl_task_lists | `SELECT id, name, color FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id` |
| tracking.js:536 | SCAN users | `SELECT id FROM users ORDER BY is_main_admin DESC, created` |
| tracking37.js:45 | SCAN users | `SELECT id FROM users ORDER BY id=? DESC, created DESC` |
| webx51.js:96 | SCAN hl_task_lists | `SELECT * FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?)` |
| webx51.js:112 | SCAN famcal51_task | `SELECT event_id, kind, assignee FROM famcal51_task` |
| webx51.js:294 | SCAN hl_task_lists | `SELECT * FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?) ORDER BY o` |
| webx51.js:737 | SCAN onboard51_invites | `SELECT * FROM onboard51_invites WHERE created > ? ORDER BY created DESC LIMIT 100` |
