// Prompt 51 (OBS51): selvreparasjon – container som er unhealthy eller død → omstart via Docker-proxyen (bare restart, ingen andre
// handlinger), maks N per time per container (standard 3), varsel til admin etterpå. Gjentatt feil (grensen nådd, eller 3 omstarter
// på et døgn) → et issue-utkast med de siste loggene (hemmeligheter maskert). Utkastet opprettes ALDRI som issue automatisk – admin
// kopierer det fra System.
//   «Unhealthy» = Docker-helsesjekken (Status «(unhealthy)») sett i to påfølgende runder (≥ 1 min), eller tilstanden «dead».
//   Homelab selv (os-containeren) startes aldri på nytt herfra, og containere admin har unntatt hoppes over.
import { randomUUID } from 'node:crypto';
import { db, kv, OWNER } from '../db.js';
import { listUsers } from '../auth.js';
import { notifyUser } from '../notify.js';
import { docker51, dockerAvailable44, maskLog44 } from '../logs44.js';
import { healthOf51 } from './health.js';

db.exec(`CREATE TABLE IF NOT EXISTS obs51_heal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, container TEXT NOT NULL, reason TEXT NOT NULL, action TEXT NOT NULL, ok INTEGER NOT NULL, message TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS obs51_heal_ct ON obs51_heal_events(container, ts)');
db.exec(`CREATE TABLE IF NOT EXISTS obs51_issue_drafts (
  id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL, container TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, dismissed INTEGER NOT NULL DEFAULT 0
)`);

const q = (s) => db.prepare(s);
const HOUR = 3_600_000, DAY = 86_400_000;
const KEY = 'obs51_heal';
export const HEAL51_DEFAULTS = Object.freeze({ on: true, maxPerHour: 3, exclude: [] });
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function healSettings51() {
  const s = kv.get(OWNER, KEY, null) ?? {};
  return { on: s.on !== false, maxPerHour: Number.isInteger(s.maxPerHour) ? s.maxPerHour : HEAL51_DEFAULTS.maxPerHour, exclude: Array.isArray(s.exclude) ? s.exclude.filter((x) => NAME.test(x)) : [] };
}
/** → feiltekst | null */
export function saveHeal51(b = {}) {
  const cur = healSettings51();
  const next = { ...cur };
  if (b.on !== undefined) { if (typeof b.on !== 'boolean') return 'on må være true/false'; next.on = b.on; }
  if (b.maxPerHour !== undefined) { const n = Number(b.maxPerHour); if (!Number.isInteger(n) || n < 1 || n > 10) return 'maxPerHour må være 1–10'; next.maxPerHour = n; }
  if (b.exclude !== undefined) { if (!Array.isArray(b.exclude) || b.exclude.length > 50 || b.exclude.some((x) => !NAME.test(String(x)))) return 'exclude må være en liste med containernavn'; next.exclude = [...new Set(b.exclude.map(String))]; }
  kv.set(OWNER, KEY, next);
  return null;
}

/** Ekstra maskering for issue-utkast: lange tokenlignende strenger i tillegg til maskLog44. */
export function scrub51(text) {
  return maskLog44(String(text ?? ''))
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '••••')
    .replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '••••')
    .replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, (ip) => (/^(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(ip) ? ip : '<ip>'));
}

const seen = new Map(); // navn → {n: påfølgende runder unhealthy, at}
const admins = () => listUsers().filter((u) => u.role === 'admin').map((u) => u.id);
const restartsSince = (name, t) => q("SELECT count(*) FROM obs51_heal_events WHERE container=? AND action='restart' AND ts>=?").pluck().get(name, t);
const log = (name, reason, action, ok, message, now) => q('INSERT INTO obs51_heal_events(ts, container, reason, action, ok, message) VALUES(?,?,?,?,?,?)').run(now, name, reason, action, ok ? 1 : 0, String(message ?? '').slice(0, 300));
let checkLater = (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); };
export const _setHealTimer51 = (fn) => { checkLater = fn; };
const tellAdmins = (title, body, tag, critical = false) => { for (const a of admins()) notifyUser(a, { title, body, url: '/#/innstillinger/system', tag, category: 'system', data: { obs51: true, ...(critical ? { critical: true } : {}) } }).catch(() => {}); };

async function draftFor(c, reason, now) {
  const name = c.name;
  const open = q('SELECT * FROM obs51_issue_drafts WHERE container=? AND dismissed=0 ORDER BY updated DESC LIMIT 1').get(name);
  let lines = [];
  try { lines = await docker51.logs(name, now - 2 * HOUR, 300); } catch { lines = []; }
  const tail = lines.slice(-60).map((l) => `${l.t} ${String(l.level).toUpperCase().padEnd(5)} ${scrub51(l.msg)}`);
  const ev = q('SELECT * FROM obs51_heal_events WHERE container=? AND ts>=? ORDER BY ts DESC LIMIT 20').all(name, now - DAY);
  const title = `[selvreparasjon] ${name} blir unhealthy gjentatte ganger`;
  const body = [
    `## Hva skjedde`, `Containeren **${name}** (${scrub51(c.image ?? '')}) ble oppdaget som *${reason}* og startet på nytt av Homelab-selvreparasjonen.`, '',
    `- Status nå: \`${scrub51(c.status ?? c.state ?? '')}\``, `- Omstarter siste time: ${restartsSince(name, now - HOUR)}, siste døgn: ${restartsSince(name, now - DAY)}`, `- Oppdaget: ${new Date(now).toISOString()}`, '',
    `## Hendelser (siste døgn)`, ...(ev.length ? ev.map((e) => `- ${new Date(e.ts).toISOString()} · ${e.action} · ${e.reason}${e.ok ? '' : ' · feilet'}${e.message ? ` · ${scrub51(e.message)}` : ''}`) : ['- (ingen)']), '',
    `## Siste logglinjer (maskert)`, '```', ...(tail.length ? tail : ['(fikk ikke hentet loggene)']), '```', '',
    `_Laget automatisk av Homelab (OBS51). Hemmeligheter er maskert, men les gjennom før du limer inn._`,
  ].join('\n').slice(0, 60_000);
  if (open) { q('UPDATE obs51_issue_drafts SET updated=?, body=?, count=count+1 WHERE id=?').run(now, body, open.id); return open.id; }
  const id = randomUUID();
  q('INSERT INTO obs51_issue_drafts(id, created, updated, container, title, body) VALUES(?,?,?,?,?,?)').run(id, now, now, name, title, body);
  tellAdmins(`Issue-utkast for ${name}`, `${name} feiler gjentatte ganger. Utkastet ligger under System → Selvreparasjon (kopier det inn selv).`, `obs51-draft-${name}`);
  return id;
}

/** Én runde. → {checked, restarted:[navn], skipped:[{name, why}], drafts:[id]} */
export async function healOnce51(now = Date.now()) {
  const s = healSettings51();
  const out = { checked: 0, restarted: [], skipped: [], drafts: [] };
  if (!s.on || !dockerAvailable44()) return { ...out, off: !s.on ? 'av' : 'docker' };
  let list; try { list = await docker51.list(); } catch (e) { return { ...out, error: e.message }; }
  const self = docker51.self();
  const names = new Set();
  for (const raw of list) {
    const c = { id: String(raw.Id).slice(0, 12), name: docker51.nameOf(raw), image: raw.Image, state: raw.State, status: raw.Status, health: healthOf51(raw.Status) };
    names.add(c.name); out.checked++;
    const bad = c.state === 'dead' ? 'dead' : c.state === 'running' && c.health === 'unhealthy' ? 'unhealthy' : null;
    const prev = seen.get(c.name);
    if (!bad) { seen.delete(c.name); continue; }
    // Én runde teller bare når det er gått minst 50 s siden forrige (to raske kall rett etter hverandre gir ikke omstart).
    const cur = !prev ? { n: 1, at: now } : now - prev.at >= 50_000 ? { n: prev.n + 1, at: now } : prev;
    seen.set(c.name, cur);
    const streak = cur.n;
    if (streak < 2 && bad === 'unhealthy') { out.skipped.push({ name: c.name, why: 'venter på neste runde' }); continue; }
    if ((self && raw.Id.startsWith(self)) || c.name === 'homelab-os') { out.skipped.push({ name: c.name, why: 'Homelab selv' }); continue; }
    if (s.exclude.includes(c.name)) { out.skipped.push({ name: c.name, why: 'unntatt' }); continue; }
    if (restartsSince(c.name, now - HOUR) >= s.maxPerHour) {
      out.skipped.push({ name: c.name, why: 'grensen per time' });
      if (!q("SELECT 1 FROM obs51_heal_events WHERE container=? AND action='limit' AND ts>=?").get(c.name, now - HOUR)) {
        log(c.name, bad, 'limit', false, `Maks ${s.maxPerHour} omstarter per time nådd`, now);
        tellAdmins(`${c.name} er fortsatt ${bad}`, `Selvreparasjonen har startet den på nytt ${s.maxPerHour} ganger siste time og gir seg nå. Se issue-utkastet i System.`, `obs51-limit-${c.name}`, true);
        out.drafts.push(await draftFor(c, bad, now));
      }
      continue;
    }
    let ok = true, msg = '';
    try { const r = await docker51.restart(c.name); msg = r.message; } catch (e) { ok = false; msg = e.message; }
    log(c.name, bad, 'restart', ok, msg, now);
    seen.delete(c.name);
    console.warn(`obs51.heal restart container=${c.name} reason=${bad} ok=${ok}`);
    if (ok) out.restarted.push(c.name);
    const day = restartsSince(c.name, now - DAY);
    if (day >= 3) out.drafts.push(await draftFor(c, bad, now));
    // Varsel etterpå: sjekk om den ble frisk.
    const name = c.name;
    checkLater(async () => {
      let st = null; try { const l = await docker51.list(); const x = l.find((y) => docker51.nameOf(y) === name); st = x ? { state: x.State, health: healthOf51(x.Status) } : null; } catch { st = null; }
      const fine = st && st.state === 'running' && st.health !== 'unhealthy';
      log(name, bad, 'verify', !!fine, fine ? 'Frisk etter omstart' : `Fortsatt ${st?.health ?? st?.state ?? 'ukjent'}`, Date.now());
      tellAdmins(fine ? `${name} ble startet på nytt` : `${name} er fortsatt ${st?.health ?? st?.state ?? 'nede'}`, fine ? `Den var ${bad}. Selvreparasjonen startet den på nytt, og nå svarer den igjen.` : `Selvreparasjonen startet den på nytt, men den er ikke frisk. Den prøver igjen (maks ${s.maxPerHour} per time).`, `obs51-heal-${name}`, !fine);
    }, 90_000);
    if (!ok) tellAdmins(`Klarte ikke å starte ${c.name} på nytt`, msg, `obs51-heal-${c.name}`, true);
  }
  for (const k of seen.keys()) if (!names.has(k)) seen.delete(k);
  return out;
}

export function healOut51(now = Date.now()) {
  const s = healSettings51();
  return {
    settings: s,
    events: q('SELECT * FROM obs51_heal_events ORDER BY ts DESC LIMIT 50').all().map((e) => ({ id: e.id, at: new Date(e.ts).toISOString(), container: e.container, reason: e.reason, action: e.action, ok: !!e.ok, message: e.message })),
    drafts: q('SELECT id, created, updated, container, title, count FROM obs51_issue_drafts WHERE dismissed=0 ORDER BY updated DESC LIMIT 20').all().map((d) => ({ id: d.id, createdAt: new Date(d.created).toISOString(), updatedAt: new Date(d.updated).toISOString(), container: d.container, title: d.title, count: d.count })),
    lastHour: q("SELECT count(*) FROM obs51_heal_events WHERE action='restart' AND ts>=?").pluck().get(now - HOUR),
    watching: [...seen.entries()].map(([name, v]) => ({ name, rounds: v.n })),
  };
}
export const draft51 = (id) => q('SELECT * FROM obs51_issue_drafts WHERE id=?').get(String(id));
export const dismissDraft51 = (id) => q('UPDATE obs51_issue_drafts SET dismissed=1 WHERE id=?').run(String(id)).changes > 0;
export const _resetHeal51 = () => { seen.clear(); q('DELETE FROM obs51_heal_events').run(); q('DELETE FROM obs51_issue_drafts').run(); kv.del(OWNER, KEY); };
