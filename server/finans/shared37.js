// Prompt 37 (SERVER37): delte abonnementer i Subscription OS (f.eks. Starlink), claude-code-abo-provetid.md.
// subscription_members {sub_id, user_id} + fh_subscriptions.split ('equal'|'payer') og payer_id. Eieren er alltid med.
// - Alle medlemmer ser abonnementet (liste, kalender, varsler). Bare eier og betaler kan endre pris og si opp. Medlemmer kan forlate.
// - Din del: lik deling = pris / antall, «jeg betaler» = hele beløpet hos betaleren, 0 hos de andre. Totaler og budsjett bruker din del.
// Abonnementet i GET /finans/api/subscriptions får: members:[{userId, name, color, role:'owner'|'member', avatarUrl}], shared,
//   split, payerId, ownerId, mine, canEdit, myShare (kr per trekk), myShareMonthly (kr/mnd), shareLabel:'Delt · din del 400 kr/mnd'
// PUT  /finans/api/subscriptions/:id/members {members:[userId], split?, payerId?} (eier/betaler) → abonnementet
// POST /finans/api/subscriptions/:id/leave (medlem) → {ok}
import { db } from './db.js';
import { userInfo } from '../auth.js';

const q = (sql) => db.prepare(sql);
db.exec('CREATE TABLE IF NOT EXISTS subscription_members (sub_id INTEGER NOT NULL, user_id TEXT NOT NULL, added INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (sub_id, user_id))');
const cols = q('PRAGMA table_info(fh_subscriptions)').all().map((c) => c.name);
if (!cols.includes('split')) db.exec("ALTER TABLE fh_subscriptions ADD COLUMN split TEXT NOT NULL DEFAULT 'equal'");
if (!cols.includes('payer_id')) db.exec('ALTER TABLE fh_subscriptions ADD COLUMN payer_id TEXT');

let colorOf = () => null;
export const _setSubColors = (fn) => { colorOf = fn; };
export const memberIds = (subId) => q('SELECT user_id FROM subscription_members WHERE sub_id=? ORDER BY added, user_id').pluck().all(subId);
/** Abonnementer brukeren ser: egne + delte hen er medlem av. */
export const visibleSubs = (uid, order = "ORDER BY active DESC, COALESCE(next_date, '9999'), name") =>
  q(`SELECT * FROM fh_subscriptions WHERE user_id=@u OR id IN (SELECT sub_id FROM subscription_members WHERE user_id=@u) ${order}`).all({ u: uid });
export const isMemberSub = (subId, uid) => !!q('SELECT 1 FROM subscription_members WHERE sub_id=? AND user_id=?').get(subId, uid);
/** Abonnementet hvis brukeren er eier eller betaler (kan endre), ellers undefined. */
export const editableSub = (id, uid) => q('SELECT * FROM fh_subscriptions WHERE id=? AND (user_id=? OR (payer_id=? AND id IN (SELECT sub_id FROM subscription_members WHERE user_id=?)))').get(id, uid, uid, uid);
export const hasSharedSubs = (uid) => !!q('SELECT 1 FROM subscription_members WHERE user_id=? LIMIT 1').get(uid) || !!q('SELECT 1 FROM subscription_members m JOIN fh_subscriptions s ON s.id=m.sub_id WHERE s.user_id=? LIMIT 1').get(uid);

/** Din del i øre per trekk. */
export function shareOre(s, uid) {
  const mem = memberIds(s.id);
  if (!mem.length) return s.user_id === uid ? s.price : 0;
  const payer = s.payer_id || s.user_id;
  if (s.split === 'payer') return uid === payer ? s.price : 0;
  return Math.round(s.price / (mem.length + 1));
}
const CYC = { monthly: 1, yearly: 12, biennial: 24 };
const kr = (v) => `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} kr`;
const person = (id, role) => { const u = userInfo(id); return { userId: id, id, name: u?.displayName ?? 'Ukjent', color: colorOf(id), role, avatarUrl: u?.avatarUrl ?? null }; };
/** Legger delingsfeltene på subOut(s). */
export function decorateSub(out, s, uid) {
  const mem = memberIds(s.id);
  const share = shareOre(s, uid), perM = share / (CYC[s.cycle] ?? 1);
  const shared = mem.length > 0;
  return { ...out, ownerId: s.user_id, mine: s.user_id === uid, shared, split: s.split || 'equal', payerId: s.payer_id || s.user_id,
    members: [person(s.user_id, 'owner'), ...mem.map((m) => person(m, 'member'))],
    canEdit: s.user_id === uid || (shared && (s.payer_id || s.user_id) === uid),
    myShare: share / 100, myShareMonthly: Math.round(perM) / 100, shareLabel: shared ? `Delt · din del ${kr(perM / 100)}/mnd` : null };
}
/** Raden med prisen byttet ut med din del (for totaler, graf og kalender). */
export const asShare = (s, uid) => (memberIds(s.id).length || s.user_id !== uid ? { ...s, price: shareOre(s, uid), prev_price: s.prev_price != null ? Math.round(s.prev_price * (shareOre(s, uid) / (s.price || 1))) : s.prev_price } : s);

export function mountShared37(api, { W, subOut }) {
  api.put('/subscriptions/:id{[0-9]+}/members', W, async (c) => {
    const uid = c.get('user'), s = editableSub(+c.req.param('id'), uid);
    if (!s) return c.json({ error: 'Bare eier og betaler kan endre delingen' }, isMemberSub(+c.req.param('id'), uid) ? 403 : 404);
    const b = await c.req.json().catch(() => ({}));
    if (b.members === undefined && Array.isArray(b.userIds)) b.members = b.userIds;
    if (b.members !== undefined && !Array.isArray(b.members)) return c.json({ error: 'members må være en liste' }, 400);
    if (b.split !== undefined && !['equal', 'payer'].includes(b.split)) return c.json({ error: "split må være 'equal' eller 'payer'" }, 400);
    const ids = b.members ? [...new Set(b.members.map(String))].filter((x) => x !== s.user_id) : memberIds(s.id);
    if (ids.some((x) => !userInfo(x))) return c.json({ error: 'Ukjent person' }, 400);
    const payer = b.payerId !== undefined ? (b.payerId ? String(b.payerId) : null) : s.payer_id;
    if (payer && payer !== s.user_id && !ids.includes(payer)) return c.json({ error: 'Betaleren må være med i abonnementet' }, 400);
    db.transaction(() => {
      q('DELETE FROM subscription_members WHERE sub_id=?').run(s.id);
      ids.slice(0, 20).forEach((x, i) => q('INSERT INTO subscription_members(sub_id, user_id, added) VALUES(?,?,?)').run(s.id, x, Date.now() + i));
      q('UPDATE fh_subscriptions SET split=?, payer_id=? WHERE id=?').run(b.split ?? s.split ?? 'equal', payer, s.id);
    })();
    const row = q('SELECT * FROM fh_subscriptions WHERE id=?').get(s.id);
    return c.json(decorateSub(subOut(row), row, uid));
  });
  api.post('/subscriptions/:id{[0-9]+}/leave', W, (c) => {
    const uid = c.get('user'), id = +c.req.param('id');
    const s = q('SELECT * FROM fh_subscriptions WHERE id=?').get(id);
    if (!s || !isMemberSub(id, uid)) return c.json({ error: s?.user_id === uid ? 'Eieren kan ikke forlate sitt eget abonnement' : 'Fant ikke abonnementet' }, s?.user_id === uid ? 400 : 404);
    q('DELETE FROM subscription_members WHERE sub_id=? AND user_id=?').run(id, uid);
    if (s.payer_id === uid) q('UPDATE fh_subscriptions SET payer_id=NULL WHERE id=?').run(id);
    return c.json({ ok: true });
  });
}
