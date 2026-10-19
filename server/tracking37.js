// Prompt 37 (SERVER37): API-nøkler for Sporing deles i husstanden; pakker og sporingsnumre er alltid private
// (claude-code-sporing-delte-nokler.md). Nøklene ligger kryptert (AES-256-GCM, samme nøkkel som Innstillinger) i
// kv(OWNER,'trk_household') og vises bare maskert (••••a91f). Bare admin endrer. tracking-carriers.js leser trkCfg(nøkkel):
// husstandens verdi først, så brukerens egen (eldre oppsett).
//
// GET /api/tracking/keys → {providers:[{id, name, set, tail, masked, status:'ok'|'missing'|'error'|'quota', fields:[{key, label, set, tail}],
//                          addedBy:{id, name}|null, updatedAt, scope:'household', managedBy:'admin'}], quota:{provider:'parcelsapp', used, mine,
//                          limit, perUserPct, myLimit, left, text}, admin, note}
// PUT /api/tracking/keys/:id {fields:{key: verdi|null}} eller {key: verdi} (bare admin) → {provider}
// PUT /api/tracking/keys/quota {perUserPct, limit?} (bare admin) → {quota}
// DELETE /api/tracking/keys/:id (bare admin) → {provider}
// Kvote (ParcelsApp): felles teller per måned for husstanden + per bruker; med flere brukere kan én bruker bruke maks
// perUserPct (standard 50 %) av kvoten.
import { kv, OWNER, db } from './db.js';
import { userInfo, listUsers, isAdmin } from './auth.js';
import { sealSecret, openSecret, userCfgOverride, activeUser } from './settings.js';

export const PROVIDERS37 = [
  { id: 'parcelsapp', name: 'ParcelsApp', fields: [['trk_parcelsapp_key', 'API-nøkkel']] },
  { id: 'mybring', name: 'Posten / Bring', fields: [['mybringUid', 'Mybring-bruker (e-post)', false], ['mybringKey', 'Mybring API-nøkkel']] },
  { id: 'postnord', name: 'PostNord', fields: [['postnordKey', 'API-nøkkel']] },
  { id: 'dhl', name: 'DHL', fields: [['trk_dhl_key', 'API-nøkkel']] },
  { id: 'ups', name: 'UPS', fields: [['trk_ups_id', 'Client ID', false], ['trk_ups_secret', 'Client Secret']] },
  { id: '17track', name: '17TRACK (Helthjem, Instabox, Budbee, Porterbuddy …)', fields: [['trk_17_key', 'API-nøkkel']] },
];
const KEY_OF = new Map(PROVIDERS37.flatMap((p) => p.fields.map(([k]) => [k, p.id])));
const store = () => kv.get(OWNER, 'trk_household', {}) ?? {};
const save = (s) => kv.set(OWNER, 'trk_household', s);
const tail = (v) => (v ? String(v).slice(-4) : null);
export const mask = (v) => (v ? `••••${tail(v)}` : null);

/** Husstandens verdi for en sporingsnøkkel ('' hvis ikke satt). */
export function householdValue(key) {
  const p = KEY_OF.get(key);
  if (!p) return '';
  const v = store()[p]?.fields?.[key];
  return v ? openSecret(v) || '' : '';
}

// Engangsmigrering: nøkler som lå per bruker, kopieres til husstanden (eierens først, ellers den nyeste brukeren som har en).
(function migrate() {
  if (kv.get(OWNER, 'trk_household_v1', false)) return;
  const s = store();
  let n = 0;
  const users = db.prepare('SELECT id FROM users ORDER BY id=? DESC, created DESC').all(OWNER).map((r) => r.id);
  for (const p of PROVIDERS37) {
    if (s[p.id]) continue;
    for (const u of users) {
      const vals = Object.fromEntries(p.fields.map(([k]) => [k, userCfgOverride(u, k)]));
      const secretKey = p.fields.find(([, , sec]) => sec !== false)?.[0];
      if (!vals[secretKey]) continue;
      s[p.id] = { fields: Object.fromEntries(Object.entries(vals).filter(([, v]) => v).map(([k, v]) => [k, sealSecret(String(v))])), addedBy: u, updatedAt: Date.now(), migrated: true };
      n++;
      break;
    }
  }
  if (n) { save(s); console.log(`[sporing] prompt 37: ${n} nøkler flyttet til husstanden (kopiert, de personlige er beholdt)`); }
  kv.set(OWNER, 'trk_household_v1', Date.now());
})();

/* ---------------- Kvote ---------------- */

const monthKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }).slice(0, 7);
const quotaCfg = () => ({ perUserPct: 50, limit: null, ...(kv.get(OWNER, 'trk_quota', {}) ?? {}) });
/** Bruk denne måneden: husstanden (sum av alle) og per bruker. */
export function usage37(defaultLimit = 3, uid = activeUser() ?? OWNER) {
  const m = monthKey();
  const rows = db.prepare("SELECT user, value FROM kv WHERE key='parcelsapp_usage'").all();
  let used = 0, mine = 0;
  for (const r of rows) { let v; try { v = JSON.parse(r.value); } catch { continue; } if (v?.month !== m) continue; used += v.used ?? 0; if (r.user === uid) mine = v.used ?? 0; }
  const q = quotaCfg(), limit = q.limit ?? defaultLimit;
  const many = listUsers().length > 1;
  const myLimit = many ? Math.max(1, Math.floor((limit * q.perUserPct) / 100)) : limit;
  return { provider: 'parcelsapp', used, mine, limit, perUserPct: q.perUserPct, myLimit, left: Math.max(0, Math.min(limit - used, myLimit - mine)), month: m };
}
/** Feilmelding hvis neste oppslag ville gå over kvoten, ellers null. */
export function quotaBlock37(defaultLimit = 3) {
  if (!householdValue('trk_parcelsapp_key')) return null; // egen (eldre) nøkkel: egen kvote som før
  const u = usage37(defaultLimit);
  if (u.used >= u.limit) return `ParcelsApp: husstandens månedskvote (${u.limit} oppslag) er brukt opp`;
  if (u.mine >= u.myLimit) return `ParcelsApp: du har brukt din del av husstandens kvote (${u.myLimit} av ${u.limit} oppslag denne måneden)`;
  return null;
}

/* ---------------- Utdata (rutene ligger i tracking-keys37.js) ---------------- */

function providerOut(p, viewerAdmin, parcelsLimit) {
  const s = store()[p.id];
  const fields = p.fields.map(([k, label]) => { const v = s?.fields?.[k] ? openSecret(s.fields[k]) : ''; return { key: k, label, set: !!v, tail: v ? tail(v) : null, masked: mask(v) }; });
  const main = fields.find((f, i) => p.fields[i][2] !== false) ?? fields[0];
  const set = fields.every((f) => f.set);
  let status = set ? (s?.status ?? 'ok') : 'missing';
  if (p.id === 'parcelsapp' && set) { const u = usage37(parcelsLimit); if (u.used >= u.limit) status = 'quota'; }
  const by = s?.addedBy ? userInfo(s.addedBy) : null;
  return { id: p.id, name: p.name, set, tail: main.tail, masked: main.masked, status, fields, addedBy: by ? { id: by.id, name: by.displayName } : null,
    addedByText: by ? `Delt i husstanden · lagt inn av ${by.displayName}` : null, updatedAt: s?.updatedAt ? new Date(s.updatedAt).toISOString() : null,
    scope: 'household', managedBy: 'admin', editable: viewerAdmin };
}
export function keysOut(uid, parcelsLimit = 3) {
  const admin = isAdmin(uid);
  const u = usage37(parcelsLimit, uid);
  return { providers: PROVIDERS37.map((p) => providerOut(p, admin, parcelsLimit)),
    quota: { ...u, text: `Du har brukt ${u.mine} av husstandens ${u.limit} oppslag denne måneden`, line: householdValue('trk_parcelsapp_key') ? `Bruker husstandens ParcelsApp-nøkkel · ${Math.max(0, u.limit - u.used)} oppslag igjen` : null },
    admin, note: admin ? null : 'Administreres av admin' };
}

let limitImpl = () => 3;
export const _setParcelsLimit = (fn) => { limitImpl = fn; };
export const parcelsLimit37 = () => limitImpl();
export { quotaCfg, store as householdStore, save as householdSave, providerOut };
