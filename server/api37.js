// Prompt 37 (SERVER37): kobler sammen modulene for prompt 37 (montert i index.js).
//   /api/profiles, /api/onboarding/link, /api/users/:id/profile, /api/profiles/settings  → profiles37.js
//   /api/bible/*                                                                        → bible37.js
//   /api/tracking/keys                                                                  → tracking-keys37.js (+ tracking37.js)
//   /api/kalender/subjects, /api/kalender/geo                                           → kal37.js
//   /api/tasks/* (Gjøremål, Glimt)                                                      → tasks.js + tasks-glimt37.js
//   /finans/api/subscriptions/:id/members|leave                                         → finans/shared37.js
//   «hvor er X» i /api/assist                                                           → where37.js
import { colorOf } from './family.js';
import { _setTaskColors } from './tasks.js';
import { _setSubColors, hasSharedSubs } from './finans/shared37.js';
import { _setProfileHas } from './profiles37.js';
import { db } from './db.js';

_setTaskColors((id) => { try { return colorOf(id); } catch { return null; } });
_setSubColors((id) => { try { return colorOf(id); } catch { return null; } });
_setProfileHas({
  lists: (uid) => !!db.prepare('SELECT 1 FROM hl_task_list_members m JOIN hl_task_lists l ON l.id=m.list_id WHERE m.user_id=? OR l.owner=? LIMIT 1').get(uid, uid),
  subs: (uid) => { try { return hasSharedSubs(uid); } catch { return false; } },
});

export { default as profilesApi } from './profiles37.js';
export { default as bibleApi } from './bible37.js';
export { default as trackingKeysApi } from './tracking-keys37.js';
export { default as kal37Api } from './kal37.js';
