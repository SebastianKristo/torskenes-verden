// Familie: fargene til familiemedlemmene (positions.js colorOf) brukes også i Gjøremål (delte lister), Økonomi (delte
// abonnementer) og profilene (hva personen deler). Modulene får dem inn her, så de ikke importerer Familie direkte (sirkulært).
// Lastes fra familie/index.js.
import { colorOf } from './positions.js';
import { _setTaskColors } from '../gjoremal/routes.js';
import { _setSubColors, hasSharedSubs } from '../finans/shared-subs.js';
import { _setProfileHas } from './profiles.js';
import { db } from '../db.js';

_setTaskColors((id) => { try { return colorOf(id); } catch { return null; } });
_setSubColors((id) => { try { return colorOf(id); } catch { return null; } });
_setProfileHas({
  lists: (uid) => !!db.prepare('SELECT 1 FROM hl_task_list_members m JOIN hl_task_lists l ON l.id=m.list_id WHERE m.user_id=? OR l.owner=? LIMIT 1').get(uid, uid),
  subs: (uid) => { try { return hasSharedSubs(uid); } catch { return false; } },
});
