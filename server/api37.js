// Prompt 37 (SERVER37): kobler sammen modulene for prompt 37 (montert i index.js).
//   /api/profiles, /api/onboarding/link, /api/users/:id/profile, /api/profiles/settings  → profiles37.js
//   /api/bible/*                                                                        → bibel/ (mountBibel)
//   /api/tracking/keys                                                                  → server/sporing/ (mountSporing)
//   /api/tasks/* (Gjøremål, Glimt)                                                      → gjoremal/routes.js + gjoremal/glimt.js
//   /finans/api/subscriptions/:id/members|leave                                         → finans/shared-subs.js
//   «hvor er X» i /api/assist                                                           → familie/where.js
import { colorOf } from './familie/positions.js';
import { _setTaskColors } from './gjoremal/routes.js';
import { _setSubColors, hasSharedSubs } from './finans/shared-subs.js';
import { _setProfileHas } from './profiles37.js';
import { db } from './db.js';

_setTaskColors((id) => { try { return colorOf(id); } catch { return null; } });
_setSubColors((id) => { try { return colorOf(id); } catch { return null; } });
_setProfileHas({
  lists: (uid) => !!db.prepare('SELECT 1 FROM hl_task_list_members m JOIN hl_task_lists l ON l.id=m.list_id WHERE m.user_id=? OR l.owner=? LIMIT 1').get(uid, uid),
  subs: (uid) => { try { return hasSharedSubs(uid); } catch { return false; } },
});

export { default as profilesApi } from './profiles37.js';
