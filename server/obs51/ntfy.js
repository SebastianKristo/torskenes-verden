// Prompt 51 (OBS51): ntfy – selvhostet push (tjenesten «ntfy» i docker-compose.yml).
//
// Serveren publiserer til NTFY_URL (internt: http://ntfy:80) med NTFY_TOKEN (skrivetoken for brukeren «homelab» i ntfy, settes i .env,
// sendes aldri til klientene og logges aldri). Hver bruker får egne emner per enhet: «hl_» + 128 bit tilfeldig (emnenavnet er nøkkelen;
// ntfy står på deny-all, og «everyone» får bare lese hl_*). Klientene abonnerer på NTFY_PUBLIC_URL (LAN-adressen) + emnet.
// Varsler fra notifyUser (notify.js) går også hit når brukeren har emner: samme regler (av, grupper, forgrunn, stille timer),
// «Hent meg» (data.priority 'high') og kritiske driftsvarsler (data.critical) med høy prioritet (5) gjennom stille timer.
// iOS: upstream-base-url er AV som standard (se docs/drift-51.md). Slås den på, sender ntfy bare en poll-forespørsel med emne-hash til
// ntfy.sh – aldri innhold.
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS obs51_ntfy_topics (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device TEXT NOT NULL, topic TEXT NOT NULL UNIQUE, created INTEGER NOT NULL, last_ok INTEGER, fails INTEGER NOT NULL DEFAULT 0
)`);
db.exec('CREATE INDEX IF NOT EXISTS obs51_ntfy_user ON obs51_ntfy_topics(user_id)');

const q = (s) => db.prepare(s);
let F = (u, i) => fetch(u, i);
export const _setNtfyFetch51 = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); };

export function ntfyConf51(env = process.env) {
  const url = String(env.NTFY_URL ?? '').trim().replace(/\/+$/, '');
  const pub = String(env.NTFY_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  return { url, publicUrl: pub || null, token: String(env.NTFY_TOKEN ?? '').trim(), enabled: /^https?:\/\//i.test(url) };
}
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const topicOut = (r, conf = ntfyConf51()) => ({ id: r.id, device: r.device, topic: r.topic, createdAt: new Date(r.created).toISOString(), lastOk: r.last_ok ? new Date(r.last_ok).toISOString() : null, fails: r.fails,
  subscribeUrl: conf.publicUrl ? `${conf.publicUrl}/${r.topic}` : null });

export const topicsOf51 = (user) => q('SELECT * FROM obs51_ntfy_topics WHERE user_id=? ORDER BY created').all(user);
export function addTopic51(user, device) {
  const d = clean(device, 60) || 'Enhet';
  if (topicsOf51(user).length >= 10) throw Object.assign(new Error('Maks 10 enheter per bruker'), { status: 400 });
  const r = { id: randomUUID(), user_id: user, device: d, topic: `hl_${randomBytes(16).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x')}`, created: Date.now() };
  q('INSERT INTO obs51_ntfy_topics(id, user_id, device, topic, created) VALUES(?,?,?,?,?)').run(r.id, r.user_id, r.device, r.topic, r.created);
  return topicOut({ ...r, last_ok: null, fails: 0 });
}
export const removeTopic51 = (user, id) => q('DELETE FROM obs51_ntfy_topics WHERE user_id=? AND id=?').run(user, String(id)).changes > 0;
export function ntfyStatus51(user) {
  const conf = ntfyConf51();
  return { enabled: conf.enabled, tokenSet: !!conf.token, publicUrl: conf.publicUrl, topics: topicsOf51(user).map((r) => topicOut(r, conf)),
    upstream: { enabled: false, text: 'iOS-varsler via ntfy.sh (upstream-base-url) er av. Slås det på, sendes bare en poll-forespørsel med emne-hash – aldri innholdet.' },
    help: conf.enabled ? 'Installer ntfy-appen, legg til serveren og abonner på emnet for enheten din.' : 'ntfy er ikke satt opp på serveren (NTFY_URL i .env).' };
}

/** Prioritet 1–5 for et varsel. */
export function priorityOf51(item = {}) {
  const d = item.data ?? {};
  if (d.priority === 'high' || d.critical === true) return 5;
  if (item.category === 'system' && d.obs51) return 4;
  if (item.category === 'ai') return 2;
  return 3;
}

/** Publiser til ett emne. → {ok, status?, error?} */
export async function publish51(topic, { title, body = '', priority = 3, tags = [], click = null } = {}) {
  const conf = ntfyConf51();
  if (!conf.enabled) return { ok: false, error: 'ntfy er ikke satt opp' };
  // JSON-publisering (POST til rot-adressen) tåler æøå i tittelen, i motsetning til Title-headeren.
  const payload = { topic, title: clean(title, 120), message: clean(body, 1000) || clean(title, 120), priority: Math.max(1, Math.min(5, priority | 0 || 3)), ...(tags.length ? { tags: tags.slice(0, 5) } : {}), ...(click ? { click } : {}) };
  try {
    const r = await F(conf.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(conf.token ? { Authorization: `Bearer ${conf.token}` } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
    return r.ok ? { ok: true, status: r.status } : { ok: false, status: r.status, error: `ntfy svarte ${r.status}` };
  } catch (e) { return { ok: false, error: `ntfy svarer ikke (${e?.cause?.code || e?.name || 'feil'})` }; }
}

/** Kroken fra notifyUser: sender til alle emnene brukeren har. */
export async function ntfyNotify51(user, item) {
  const conf = ntfyConf51();
  if (!conf.enabled) return 0;
  const rows = topicsOf51(user);
  if (!rows.length) return 0;
  const pr = priorityOf51(item);
  const click = /^https:\/\//i.test(process.env.PUBLIC_URL ?? '') && item.url ? `${String(process.env.PUBLIC_URL).replace(/\/+$/, '')}${String(item.url).startsWith('/') ? item.url : `/${item.url}`}` : null;
  let ok = 0;
  for (const r of rows) {
    const res = await publish51(r.topic, { title: item.title, body: item.body, priority: pr, tags: pr >= 5 ? ['rotating_light'] : pr === 4 ? ['warning'] : [], click });
    if (res.ok) { ok++; q('UPDATE obs51_ntfy_topics SET last_ok=?, fails=0 WHERE id=?').run(Date.now(), r.id); }
    else q('UPDATE obs51_ntfy_topics SET fails=fails+1 WHERE id=?').run(r.id);
  }
  return ok;
}
