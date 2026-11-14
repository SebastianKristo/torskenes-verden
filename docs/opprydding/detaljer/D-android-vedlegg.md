# Vedlegg til D-android.md

## A. Urefererte toppnivå-deklarasjoner (57 av 4091, skript dead2.py)

```
app/src/main/java/no/kristo/finanshub/Mod24B.kt:665 fun b24MailNow
app/src/main/java/no/kristo/finanshub/Calendar27.kt:108 fun kalNext27
app/src/main/java/no/kristo/finanshub/Models15.kt:162 fun wmoIcon
app/src/main/java/no/kristo/finanshub/Models15.kt:197 fun wxCompass
app/src/main/java/no/kristo/finanshub/P39.kt:217 fun setAiIn39
app/src/main/java/no/kristo/finanshub/Kart46.kt:42 val MODE_PATH46
app/src/main/java/no/kristo/finanshub/P36.kt:304 fun takeBriefHint36
app/src/main/java/no/kristo/finanshub/Mod23.kt:125 fun moveSubCard23
app/src/main/java/no/kristo/finanshub/P52B.kt:347 fun learnLex52
app/src/main/java/no/kristo/finanshub/P52B.kt:386 fun hasBriefTodo52
app/src/main/java/no/kristo/finanshub/P31.kt:148 fun dLong31
app/src/main/java/no/kristo/finanshub/Calendar26.kt:74 val KAL_CARD_NAMES
app/src/main/java/no/kristo/finanshub/Calendar26.kt:135 fun kalRoomTeacher
app/src/main/java/no/kristo/finanshub/Calendar26.kt:252 fun kalNow
app/src/main/java/no/kristo/finanshub/Calendar26.kt:498 fun setKalView26
app/src/main/java/no/kristo/finanshub/Calendar26.kt:512 fun moveKalCard26
app/src/main/java/no/kristo/finanshub/Calendar26.kt:524 fun hideKalCard26
app/src/main/java/no/kristo/finanshub/Calendar26.kt:533 fun showKalCard26
app/src/main/java/no/kristo/finanshub/Calendar26.kt:539 fun resetKalCards26
app/src/main/java/no/kristo/finanshub/ui/SettingsUi.kt:265 fun ServerPage
app/src/main/java/no/kristo/finanshub/ui/Ui41b.kt:193 fun SourcesEntry41
app/src/main/java/no/kristo/finanshub/ui/Paper14.kt:167 fun PaperFinMore
app/src/main/java/no/kristo/finanshub/ui/Paper14.kt:460 fun ReorderCard
app/src/main/java/no/kristo/finanshub/ui/Paper14.kt:493 fun ReorderDoneBar
app/src/main/java/no/kristo/finanshub/ui/Tasks37.kt:742 fun BriefTodos37
app/src/main/java/no/kristo/finanshub/ui/Paper17.kt:447 fun TasksScreen
app/src/main/java/no/kristo/finanshub/ui/Voice56Ui.kt:140 fun SearchMic56
app/src/main/java/no/kristo/finanshub/ui/Weather32b.kt:57 fun WxClose32b
app/src/main/java/no/kristo/finanshub/ui/Update28.kt:83 fun upd28Summary
app/src/main/java/no/kristo/finanshub/ui/Update28.kt:98 fun Update28Page
app/src/main/java/no/kristo/finanshub/ui/Modules.kt:77 fun SubScreen
app/src/main/java/no/kristo/finanshub/ui/Modules.kt:240 fun ShoppingPane
app/src/main/java/no/kristo/finanshub/ui/Brief34.kt:210 fun BriefPage34
app/src/main/java/no/kristo/finanshub/ui/Nordlys31.kt:465 fun TrialsCard31
app/src/main/java/no/kristo/finanshub/ui/Media43.kt:168 fun IconBtn43
app/src/main/java/no/kristo/finanshub/ui/Fin43.kt:34 fun SaldoCard43
app/src/main/java/no/kristo/finanshub/ui/Paper15.kt:240 fun PageEditBar
app/src/main/java/no/kristo/finanshub/ui/Settings26B.kt:274 fun BdCalLink26
app/src/main/java/no/kristo/finanshub/ui/Ui28B.kt:571 val WIGGLE_SPACE28
app/src/main/java/no/kristo/finanshub/ui/Paper18.kt:38 fun PaperReceipts
app/src/main/java/no/kristo/finanshub/ui/More.kt:379 fun StocksScreen
app/src/main/java/no/kristo/finanshub/ui/Finance.kt:155 fun ReviewCta
app/src/main/java/no/kristo/finanshub/ui/Settings24.kt:328 fun IntegrationsPage24
app/src/main/java/no/kristo/finanshub/ui/Ui41.kt:157 fun Server41
app/src/main/java/no/kristo/finanshub/ui/Tasks44.kt:136 fun HaRow44
app/src/main/java/no/kristo/finanshub/ui/App.kt:66 fun moduleIcon
app/src/main/java/no/kristo/finanshub/ui/Paper16.kt:213 fun WxPlacesSheet
app/src/main/java/no/kristo/finanshub/ui/Paper16.kt:280 fun RuterPage
app/src/main/java/no/kristo/finanshub/ui/Paper16.kt:385 fun PaperBoliger
app/src/main/java/no/kristo/finanshub/ui/Chat27Ui.kt:597 val CHAT27_MER_ICON
app/src/main/java/no/kristo/finanshub/ui/Ui36.kt:213 fun AvatarThumb36
app/src/main/java/no/kristo/finanshub/ui/Weather22.kt:458 fun CmpSheet
app/src/main/java/no/kristo/finanshub/ui/Ui38.kt:606 fun BriefCards38
app/src/main/java/no/kristo/finanshub/ui/Ui30.kt:91 val IC_MINUS30
app/src/main/java/no/kristo/finanshub/widget/Brief34Widgets.kt:171 fun glimtBitmap34
kalender/src/main/java/no/kristo/kalender/KalModel.kt:172 fun shade
kalender/src/main/java/no/kristo/kalender/ui/KalSheets.kt:310 fun LoginScreen```

## B. API-stier brukt av :app (grovt uttrekk, 525 linjer; prefiks gjettet ut fra hjelpefunksjonen – kall med request(..., prefix = HOMELAB) står feilaktig under /finans/api)

```
/api/admin/glimt-char52
/api/admin/glimt-char52/
/api/admin/impersonate
/api/admin/impersonate/exit
/api/ai/cloud
/api/ai/jobs
/api/ai/keys/
/api/ai/keys/:x
/api/ai/library
/api/ai/models/default
/api/ai/models/pulls/
/api/ai/recommend
/api/ai/recommend/apply
/api/ai/recommend/apply/undo
/api/ai/recommend/ask
/api/ai/routing
/api/ai/tokens
/api/ai/tokens/
/api/app
/api/assist/
/api/auth/2fa/backup/regenerate
/api/auth/2fa/disable
/api/auth/2fa/enable
/api/auth/2fa/setup
/api/auth/2fa/status
/api/auth/app-code
/api/auth/logout-all
/api/auth/qr/approve
/api/auth/qr/scan
/api/background
/api/background/previews
/api/backup/key
/api/backup/list
/api/backup/restore
/api/backup/run
/api/backup/settings
/api/backup/status
/api/bg/gphoto
/api/bible/explain
/api/bible/next
/api/bible/plan
/api/bible/plan/done
/api/bible/read
/api/bible/reminder
/api/bible/saved
/api/bible/settings
/api/bible/stats
/api/bible/today
/api/birthdays
/api/birthdays/
/api/birthdays/:x/photo
/api/birthdays/:x/photos
/api/birthdays/:x/photos/
/api/birthdays/google
/api/birthdays/google/calendars
/api/birthdays/google/start
/api/birthdays/google/sync
/api/birthdays/ha
/api/birthdays/ha/calendars
/api/birthdays/ha/import
/api/brief
/api/brief-cards
/api/brief-cards/reset
/api/brief/gift
/api/brief/settings
/api/brief/trials/
/api/brief52
/api/brief52/homelab/
/api/chat/chats
/api/chat/chats/
/api/chat/folders
/api/chat/import/claude
/api/chat/import/claude/:x
/api/chat/import/claude/:x/commit
/api/chat/import/claude/:x/undo
/api/chat/knowledge
/api/chat/models
/api/chat/models/
/api/chat/settings
/api/config/map
/api/config/servers
/api/crash
/api/discovery
/api/domains/summary
/api/family
/api/family/checkin
/api/family/checkin/
/api/family/checkin/request
/api/family/health
/api/family/health/ha
/api/family/health/me
/api/family/health50
/api/family/health50/
/api/family/location
/api/family/me
/api/family/people50
/api/family/ping/
/api/family/places
/api/family/places/
/api/family/places/regions
/api/family/positions
/api/family/today50
/api/family/track/
/api/family/zone-alerts
/api/family/zones
/api/family/zones/
/api/flags
/api/geo/address
/api/glimt/agent/confirm
/api/glimt/entities
/api/glimt/entities/
/api/glimt/entities/resolve
/api/glimt/lex52
/api/glimt/mai17
/api/glimt/mai17/design
/api/glimt/mai17/hurra
/api/glimt/memory
/api/glimt/memory/:x
/api/glimt/memory/:x/apply
/api/glimt/memory/conflicts
/api/glimt/memory/hygiene
/api/glimt/memory/pending
/api/glimt/memory/stale
/api/glimt/quality/abort
/api/glimt/quality/run-now
/api/glimt/quality/runs
/api/glimt/quality/runs/
/api/glimt/quality/settings
/api/glimt/quality/weekly
/api/glimt/recipes
/api/glimt/recipes/
/api/glimt/recipes/settings
/api/glimt/recipes/stats
/api/glimt/schedules
/api/glimt/schedules/
/api/glimt/schedules/parse
/api/glimt/schedules/settings
/api/glimt/settings
/api/health/ha/devices
/api/hjemlys
/api/hjemlys/
/api/hjemlys/:x/end
/api/hjemlys/:x/home
/api/hjemlys/:x/ok
/api/hjemlys/notice
/api/hjemlys/notice/
/api/hjemlys/recipients
/api/hjemlys/route
/api/hjemlys/start
/api/hjemlys/suggest
/api/huske/glimt-jobs
/api/icons/search
/api/icons/suggest
/api/integrations
/api/integrations/:x
/api/integrations/:x/:x
/api/integrations/:x/test
/api/integrations/status
/api/kalender
/api/kalender/calendars/google
/api/kalender/events
/api/kalender/events/
/api/kalender/quick
/api/kalender/quick/
/api/kalender/quick/jobs
/api/kalender/search
/api/kart
/api/kart/live
/api/kart/prefs
/api/kart/search
/api/kart/stops
/api/kart/stops/
/api/kart/vehicles
/api/live/innstillinger
/api/me
/api/me/avatar
/api/me/glimt-char52
/api/me/home-departures
/api/me/layout
/api/me/notify
/api/me/notify/sound
/api/me/ntfy51
/api/me/ntfy51/test
/api/me/ntfy51/topics
/api/me/ntfy51/topics/
/api/me/profiles
/api/me/server
/api/me/sessions
/api/me/stops
/api/me/theme51
/api/medctl51/now
/api/medctl51/sessions/
/api/media/altSpeed
/api/media/apps/:x/sync
/api/media/command
/api/media/episodefile/:x
/api/media/episodes/
/api/media/episodes/:x/file
/api/media/glimt
/api/media/history
/api/media/indexers
/api/media/indexers/:x/test
/api/media/indexers/test
/api/media/moviefile/:x
/api/media/movies
/api/media/movies/
/api/media/movies/:x/file
/api/media/now
/api/media/nrk/folger
/api/media/nrk/folger/:x
/api/media/nrk/folger/:x/sjekk
/api/media/nrk/jobber
/api/media/nrk/jobber/:x
/api/media/nrk/jobber/:x/avbryt
/api/media/nrk/jobber/:x/igjen
/api/media/nrk/rydd
/api/media/nrk:x
/api/media/release
/api/media/release/search
/api/media/release/search/
/api/media/series
/api/media/series/
/api/media/servers
/api/media/servers/select
/api/media/torrents/
/api/media/torrents/:x
/api/media/torrents/:x/:x
/api/media/torrents/:x/files
/api/media/torrents/magnet
/api/media/track
/api/media/track/
/api/media/yubal/jobs
/api/media/yubal/jobs/:x
/api/media/yubal/jobs/:x/cancel
/api/media/yubal/subscriptions
/api/media/yubal/subscriptions/:x
/api/media/yubal/subscriptions/:x/sync
/api/media/yubal/subscriptions/sync
/api/media/yubal:x
/api/media51/audio/continue
/api/mobile/home
/api/mobile/widgets
/api/news/saved
/api/news/saved/:x
/api/news/saved/:x/retry
/api/notify/pending
/api/onboarding/link
/api/photo-window
/api/playback/plex/pin
/api/playback/plex/pin/
/api/playback/sessions
/api/prefs/mer
/api/profiles
/api/rss
/api/rss/categories
/api/rss/categories/
/api/rss/feeds
/api/rss/feeds/
/api/rss/interests
/api/rss/settings
/api/rss/summary
/api/ruter/departures
/api/ruter/journey
/api/ruter/journey/hide
/api/ruter/my-trip
/api/ruter/school-zones
/api/ruter/school-zones/
/api/ruter/school50
/api/ruter/search
/api/ruter/settings
/api/search/history
/api/search/suggest
/api/search51
/api/search51/recent
/api/security51/approvals
/api/security51/approvals/
/api/security51/devices
/api/security51/devices/
/api/server/owner
/api/server/owner/transfer
/api/smb:x
/api/study/documents
/api/study/documents/
/api/subscriptions/log
/api/system/changelog
/api/system/containers
/api/system/containers/
/api/system/logs/explain
/api/system/logs/groups
/api/system/update
/api/system/update/settings
/api/system/version
/api/tasks
/api/tasks/
/api/tasks/glimt/cards
/api/tasks/glimt/cards/dismiss
/api/tasks/glimt/jobs/
/api/tasks/glimt/sources
/api/tasks/glimt/sources/
/api/tasks/glimt/undo
/api/tasks/ha
/api/tasks/ha/create
/api/tasks/ha/map
/api/tasks/ha/sync
/api/tasks/lists
/api/tasks/lists/
/api/tasks/lists/order
/api/tasks/next
/api/tracking
/api/tracking/bulk
/api/tracking/keys
/api/tracking/keys/
/api/tracking/prefs
/api/tracking/sources
/api/update/rollback
/api/update/versions
/api/users
/api/users/
/api/users/directory
/api/voice53/backends
/api/weather/compare
/api/weather/full
/api/weather/place
/api/weather/places
/api/weather/places/
/api/weather/places/order
/api/weather/search
/api/weather/week-summary
/api/whatsnew
/api/whatsnew/seen
/api/widgets/birthdays
/api/widgets/brief
/api/widgets/calendar
/api/widgets/departures
/api/widgets/media
/api/widgets/ruter
/api/widgets/trials
/domains/api/
/domains/api/domains
/domains/api/domains/
/finans/api/ai-audit
/finans/api/ai/jobs/
/finans/api/ai/keys/
/finans/api/ai/limits
/finans/api/ai/models/
/finans/api/ai/queue/pause
/finans/api/api/icons/:x/:x.svg
/finans/api/app/android/latest
/finans/api/assist
/finans/api/auth/device-exchange
/finans/api/auth/device-token
/finans/api/auth/logout
/finans/api/auth/qr
/finans/api/auth/qr/finish
/finans/api/auth/qr/session
/finans/api/auth/reauth
/finans/api/auth/token
/finans/api/bg/gphoto
/finans/api/bg/gphoto/refresh
/finans/api/birthdays/
/finans/api/birthdays/:x/photo
/finans/api/birthdays/:x/photos
/finans/api/bootstrap
/finans/api/chat/chats/
/finans/api/chat/files
/finans/api/chat/folders/
/finans/api/chat/import/claude
/finans/api/chat/settings
/finans/api/config
/finans/api/config/servers
/finans/api/discovery
/finans/api/dishes/
/finans/api/domains/api/vendor/countries-110m.json
/finans/api/family/health/ha/devices/
/finans/api/family/me/source
/finans/api/family/photo/
/finans/api/family/places/
/finans/api/family/zones
/finans/api/family/zones/
/finans/api/fin51/calendar
/finans/api/finans/api/logo/
/finans/api/finans/api/logos/file/
/finans/api/finn
/finans/api/finn/:x
/finans/api/finn/:x/ad
/finans/api/finn/:x/ad/refresh
/finans/api/finn/:x/emails
/finans/api/finn/:x/emails/:x
/finans/api/finn/:x/files
/finans/api/finn/:x/messages
/finans/api/folders
/finans/api/folders/
/finans/api/folders/:x
/finans/api/folders/:x/bg
/finans/api/folders/:x/entries
/finans/api/folders/:x/entries/:x
/finans/api/folders/:x/invite
/finans/api/folders/:x/members
/finans/api/folders/:x/members/:x
/finans/api/forslag
/finans/api/glimt/agent
/finans/api/glimt/agent/stream/save
/finans/api/glimt/agent/stream/stop
/finans/api/glimt/entities/
/finans/api/glimt/memory/hygiene/run-now
/finans/api/glimt/quality/runs/
/finans/api/glimt/quickparse52
/finans/api/glimt/recipes/
/finans/api/glimt/recipes/feedback
/finans/api/glimt/schedules/
/finans/api/health
/finans/api/hjemlys/
/finans/api/hjemlys/:x
/finans/api/hjemlys/notice/
/finans/api/homes/:x/expenses/:x
/finans/api/import
/finans/api/jobs/:x
/finans/api/kalender/describe
/finans/api/kalender/events/
/finans/api/kalender/quick/parse
/finans/api/kalender/search
/finans/api/live/aktiviteter
/finans/api/live/handling
/finans/api/login
/finans/api/logos
/finans/api/logos/registry
/finans/api/logos52/batch
/finans/api/mail/run
/finans/api/me
/finans/api/me/avatar
/finans/api/me/notify/sound
/finans/api/me/photo-window
/finans/api/media/diagnostics
/finans/api/media/release
/finans/api/media/yubal/subscriptions/:x
/finans/api/merchants/logo
/finans/api/merchants/logo-overrides
/finans/api/merchants/logo/manual
/finans/api/merchants/logo/upload
/finans/api/news/glimt
/finans/api/news/saved/:x
/finans/api/onboard51/accept
/finans/api/onboard51/preview
/finans/api/receipts
/finans/api/receipts/:x
/finans/api/receipts/:x/book
/finans/api/receipts/:x/cancel-ai
/finans/api/receipts/:x/corrections
/finans/api/receipts/:x/merchant
/finans/api/receipts/:x/reanalyze
/finans/api/receipts/:x/reanalyze/:x/cancel
/finans/api/receipts/:x/reanalyze/apply
/finans/api/receipts/:x/reject
/finans/api/receipts/:x/reprocess
/finans/api/receipts/:x/reread
/finans/api/receipts/:x/unbook
/finans/api/receipts/analyzing
/finans/api/receipts/jobs
/finans/api/recipes/import
/finans/api/recipes/jobs/
/finans/api/recipes/scan
/finans/api/recurring
/finans/api/recurring/:x
/finans/api/reports
/finans/api/rss/article
/finans/api/rss/feeds/
/finans/api/rss/refresh
/finans/api/rules
/finans/api/ruter/journey/hide
/finans/api/ruter/left-school
/finans/api/ruter/my-trip
/finans/api/scan/barcode
/finans/api/search
/finans/api/search/ai
/finans/api/search/ask
/finans/api/search/history
/finans/api/search/suggestions
/finans/api/settings
/finans/api/settings/ai-search
/finans/api/stocks
/finans/api/stocks/sync
/finans/api/study/documents
/finans/api/subscriptions
/finans/api/subscriptions/:x
/finans/api/subscriptions/:x/leave
/finans/api/subscriptions/:x/logo
/finans/api/subscriptions/:x/logo/ai
/finans/api/subscriptions/:x/members
/finans/api/subscriptions/candidates
/finans/api/subscriptions/from-screenshot
/finans/api/subscriptions/log
/finans/api/subscriptions/receipts
/finans/api/subscriptions/trials
/finans/api/subscriptions/trials/
/finans/api/subscriptions/trials/:x
/finans/api/summary
/finans/api/system/update/abort
/finans/api/system/update/check
/finans/api/system/update/retry
/finans/api/tasks/
/finans/api/tasks/glimt
/finans/api/tasks/lists/
/finans/api/tokens
/finans/api/tokens/:x
/finans/api/tokens/companion
/finans/api/tracking
/finans/api/tracking/:x
/finans/api/tracking/refresh
/finans/api/transactions
/finans/api/transactions/:x
/finans/api/transactions/:x/original
/finans/api/users/shareable
/finans/api/voice53/transcribe
/finans/api/widgets/trials/:x
/mat/api/day/:x
/mat/api/dishes/
/mat/api/folders
/mat/api/folders/
/mat/api/plan
/mat/api/recipes/import/save
/mat/api/recipes/jobs
/mat/api/recipes/jobs/
/mat/api/shopping
/mat/api/shopping/:x/toggle
/mat/api/week
```
