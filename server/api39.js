// Prompt 39 (SERVER39): kobler sammen modulene for prompt 39 (montert i index.js).
//   /api/kalender/calendars (fire kalendere, opprydding 12 → 4, angre, PATCH notify/showInBrief/url/interval/country)  → kal39.js (+ kalender33.js)
//   /api/kalender/google/mapping («Hvilken kalender er hva?»)                                                          → kal39.js
//   Glimt følger opp og forklarer fag (assist, Kalender-Glimt, ✦ Spør i kalendersøket)                                → glimt39-fag.js
//   /finans/api/categories (source:'ai'), kvitteringslesing (varelinjer, sumkontroll, ny kategori), ✦ På nytt med fremdrift → finans/receipts39.js (+ routes.js, ai.js, ai-jobs.js)
//   /api/ai/recommend, /recommend/ask, /recommend/plan, /recommend/apply                                               → ai39.js
//   n_ai_in + Glimt-ikon på varsel, draape-lyden, avatar-sanntid                                                      → notify.js, mobile.js
//   briefGlimt i /api/glimt/settings og /api/brief                                                                    → glimt35.js, brief34.js
//   Gjøremål: ingen pakkeliste for bursdager, /api/tasks/glimt/tips                                                    → tasks-glimt37.js
//   /api/weather/week-summary                                                                                         → weather39.js
//   /api/domains/gsc/sites, /api/domains/import, /api/domains/:d/gsc/verify, kilde 'gsc'                               → domains-glimt.js, domains.js
export { cals39Api, googleMap39Api } from './kal39.js';
export { rec39Api } from './ai39.js';
export { week39Api } from './weather39.js';
