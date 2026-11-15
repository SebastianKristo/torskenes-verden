// Prompt 39 (SERVER39): kobler sammen modulene for prompt 39 (montert i index.js).
//   Glimt følger opp og forklarer fag (assist, Kalender-Glimt, ✦ Spør i kalendersøket)                                → glimt/fag.js
//   /finans/api/categories (source:'ai'), kvitteringslesing (varelinjer, sumkontroll, ny kategori), ✦ På nytt med fremdrift → finans/receipts39.js (+ routes.js, ai.js, ai-jobs.js)
//   /api/ai/recommend, /recommend/ask, /recommend/plan, /recommend/apply                                               → ai39.js (montert fra server/ai/index.js)
//   n_ai_in + Glimt-ikon på varsel, draape-lyden, avatar-sanntid                                                      → notify.js, mobile.js
//   briefGlimt i /api/glimt/settings og /api/brief                                                                    → glimt/settings.js, glimt/brief.js
//   Gjøremål: ingen pakkeliste for bursdager, /api/tasks/glimt/tips                                                    → tasks-glimt37.js
//   /api/weather/week-summary                                                                                         → weather39.js
//   /api/domains/gsc/sites, /api/domains/import, /api/domains/:d/gsc/verify, kilde 'gsc'                               → domains-glimt.js, domains.js
export { week39Api } from './weather39.js';
