// Prompt 41 (SERVER41): Hjemlys «Si fra» (Sjekket inn · Drar snart · Drar nå · Fremme) og tur til et valgfritt mål (claude-code-hjemlys.md).
// Montert under /api/hjemlys FØR hjemlys40Api (index.js via api41.js). Sesjon eller app-token.
//
// POST /api/hjemlys/notice {kind:'checkin'|'leaving_soon'|'leaving_now'|'arrived', place?, eta?(ISO|minutter), leaveInMin?:15|30|60|null,
//                           to:[userId], contacts?:[{name, phone}], note?, destination?:{name, lat?, lon?, kind:'home'|'place'}, waitMin?, remember?:true}
//   → {notice, session?, links?:[{name, phone, url, sms}], live?}
//   Bare beskjeden og stedet du valgte sendes – aldri posisjon. Mottakerne får varsel («Sebastian sjekket inn · Bursdag hos Mari»,
//   «Sebastian drar om ca. 30 min», «Sebastian drar nå · hjem ca. 23:38»). leaving_now med destination starter en vanlig Hjemlys-tur (session).
//   Kontakter uten Papir får en lenke til en enkel statusside (/hl/:token, utløper etter 24 t) som appen sender som SMS.
//   notice = {id, kind, userId, name, place, note, eta, leaveAt, text, recipients:[{userId, name}], contacts:[{name}], createdAt, expiresAt, sessionId?}
//   live (Live Activity / Live Update, content-state): checkin → {state:'checkedIn', at, until, label:'Inne · 19:42'},
//                                                       leaving_soon → {state:'leavingSoon', leaveAt, label:'Drar om ca. 30 min · 23:04'} (Unix-sekunder)
// POST /api/hjemlys/status {kind:'checked_in'|'leaving_soon'|'leaving_now', place?, leave_at?, destination?, recipients[]} → samme (navnene i spesifikasjonen)
// PATCH /api/hjemlys/notice/:id {plus:15} → {notice, live}  («+ 15 min» på Drar snart, mottakerne får ny tid)
// POST /api/hjemlys/notice/:id/now {destination?} → {notice, session?}  («Drar nå» fra Drar snart)
// GET  /api/hjemlys/notices → {mine:[notice], received:[notice]}  (siste 24 t, Familie-tråden og web-kortet)
// GET  /api/hjemlys/recipients → {household:[{userId, name, avatar}], last:{checkin:[id], …}}  (du selv er aldri med)
// POST /api/hjemlys/start {…som før, destination?:{name, lat, lon, kind:'home'|'place'}, recipients:[id]} → {session} (mål ≠ hjem: geofence 60 m rundt målet)
// GET  /api/hjemlys får i tillegg notices:{mine, received} (Familie → Hjemlys).
// Offentlig: GET /api/hjemlys/public/:token → {name, text, kind, place, at, eta, expiresAt} · GET /hl/:token → enkel statusside (HTML uten skript).
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { db, kv } from './db.js';
import { authOrToken as authOrToken0 } from './mobile.js';
const authOrToken = (c, next) => authOrToken0(c, next); // sen binding (mobile.js kan være midt i lastingen)
import { userInfo, listUsers } from './auth.js';
import { notifyUser } from './notify.js';
import { broadcast } from './realtime.js';
import { start40, sessionOut40 } from './hjemlys40.js';

db.exec(`CREATE TABLE IF NOT EXISTS hjemlys_status (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, place TEXT, note TEXT, eta INTEGER, leave_at INTEGER, recipients TEXT NOT NULL DEFAULT '[]',
  contacts TEXT NOT NULL DEFAULT '[]', session_id TEXT, dest_kind TEXT, dest_name TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS hjemlys_status_u ON hjemlys_status(user_id, created_at);
CREATE TABLE IF NOT EXISTS hjemlys_links (token TEXT PRIMARY KEY, status_id TEXT NOT NULL, name TEXT, phone TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);

export const KINDS41 = ['checkin', 'leaving_soon', 'leaving_now', 'arrived'];
const ALIAS = { checked_in: 'checkin', checkedin: 'checkin', sjekket_inn: 'checkin', leavingsoon: 'leaving_soon', drar_snart: 'leaving_soon', leavingnow: 'leaving_now', drar_naa: 'leaving_now', fremme: 'arrived' };
const LINK_MS = 24 * 3600_000, NOTICE_MS = 24 * 3600_000, CHECKIN_LIVE_MS = 15 * 60_000;
const q = (s) => db.prepare(s);
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const first = (id) => String(userInfo(id)?.displayName || userInfo(id)?.name || userInfo(id)?.username || 'Ukjent').split(/\s+/)[0];
const hhmm = (ms) => new Date(ms).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
const clean = (v, n) => (v == null ? null : String(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) || null);
const cleanPhone = (v) => { const t = String(v ?? '').replace(/[^\d+]/g, ''); return /^\+?\d{5,15}$/.test(t) ? t : null; };
const iso = (t) => (t ? new Date(t).toISOString() : null);
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const others = (u) => listUsers().map((x) => x.id).filter((id) => id !== u);

/** Teksten mottakerne får. */
export function noticeText41(n, now = Date.now()) {
  const who = first(n.user_id);
  if (n.kind === 'checkin') return `${who} sjekket inn${n.place ? ` · ${n.place}` : ''}`;
  if (n.kind === 'arrived') return `${who} er fremme${n.place ? ` · ${n.place}` : ''}`;
  if (n.kind === 'leaving_soon') {
    if (!n.leave_at) return `${who} drar snart${n.place ? ` fra ${n.place}` : ''}`;
    const m = Math.max(1, Math.round((n.leave_at - now) / 60_000));
    return `${who} drar om ca. ${m >= 60 && m % 60 === 0 ? `${m / 60} t` : `${m} min`}${n.place ? ` fra ${n.place}` : ''}`;
  }
  return `${who} drar nå${n.eta ? ` · ${n.dest_kind === 'place' && n.dest_name ? `${n.dest_name}` : 'hjem'} ca. ${hhmm(n.eta)}` : ''}`;
}
function liveOf(n, now = Date.now()) {
  if (n.kind === 'checkin') return { state: 'checkedIn', at: Math.round(n.created_at / 1000), until: Math.round((n.created_at + CHECKIN_LIVE_MS) / 1000), label: `Inne · ${hhmm(n.created_at)}` };
  if (n.kind === 'leaving_soon') return { state: 'leavingSoon', leaveAt: n.leave_at ? Math.round(n.leave_at / 1000) : null, label: n.leave_at ? `Drar om ca. ${Math.max(1, Math.round((n.leave_at - now) / 60_000))} min · ${hhmm(n.leave_at)}` : 'Drar snart' };
  return null;
}
export function noticeOut41(r, now = Date.now()) {
  if (!r) return null;
  return { id: r.id, kind: r.kind, userId: r.user_id, name: first(r.user_id), place: r.place ?? null, note: r.note ?? null,
    eta: iso(r.eta), leaveAt: iso(r.leave_at), text: noticeText41(r, now), destination: r.dest_kind ? { kind: r.dest_kind, name: r.dest_name ?? null } : null, recipients: parse(r.recipients, []).map((id) => ({ userId: id, name: first(id) })),
    contacts: parse(r.contacts, []).map((x) => ({ name: x.name ?? null })), createdAt: iso(r.created_at), expiresAt: iso(r.expires_at), ...(r.session_id ? { sessionId: r.session_id } : {}), live: liveOf(r, now) };
}
const row = (id) => q('SELECT * FROM hjemlys_status WHERE id=?').get(id);

function etaOf(v, now) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 0 && v < 24 * 60) return now + Math.round(v) * 60_000;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t < now - 3600_000 || t > now + 24 * 3600_000) throw bad('eta må være innen 24 timer');
  return t;
}
function destOf(d) {
  if (!d || typeof d !== 'object') return null;
  const kind = d.kind === 'place' ? 'place' : 'home';
  const lat = Number(d.lat), lon = Number(d.lon);
  const has = d.lat != null && d.lon != null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (kind === 'place' && !has && !clean(d.name, 80)) throw bad('destination må ha navn eller lat/lon');
  return { kind, name: clean(d.name, 80) ?? (kind === 'home' ? 'Hjem' : null), lat: has ? lat : null, lon: has ? lon : null };
}
/** Hjemlys-tur med valgfritt mål. → session-raden */
export async function startTrip41(u, b = {}, now = Date.now()) {
  const dest = destOf(b.destination);
  const s = await start40(u, b, now);
  if (dest) {
    q('UPDATE hjemlys_sessions SET dest_name=?, dest_lat=?, dest_lon=?, dest_kind=?, updated=? WHERE id=?').run(dest.name, dest.lat, dest.lon, dest.kind, now, s.id);
    return q('SELECT * FROM hjemlys_sessions WHERE id=?').get(s.id);
  }
  return s;
}
function recipientsOf(u, to) {
  const all = others(u);
  const list = Array.isArray(to) ? [...new Set(to.map(String))].filter((id) => id !== u) : null;
  if (list && list.some((id) => !all.includes(id))) throw bad('Ukjent mottaker');
  return list ?? all;
}
function contactsOf(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).map((x) => ({ name: clean(x?.name, 60), phone: cleanPhone(x?.phone) })).filter((x) => x.phone);
}
async function deliver(r, { action = 'notice' } = {}) {
  const out = noticeOut41(r);
  const to = parse(r.recipients, []);
  const actions = r.kind === 'leaving_now' && r.session_id ? ['follow', 'fine'] : ['fine'];
  for (const id of to) {
    try { await notifyUser(id, { title: 'Hjemlys', body: out.text, url: '/#/familie/hjemlys', category: 'familie', tag: `hjemlys-notice-${r.id}`, data: { kind: `hjemlys.${r.kind}`, noticeId: r.id, sessionId: r.session_id ?? null, actions } }); } catch { /* */ }
  }
  try { broadcast('hjemlys', { action, notice: out }, [r.user_id, ...to]); } catch { /* */ }
  return out;
}
/** «Si fra». → {notice, session?, links?} */
export async function notice41(u, b = {}, { origin = '' } = {}, now = Date.now()) {
  const kind = KINDS41.includes(b.kind) ? b.kind : ALIAS[String(b.kind ?? '').toLowerCase()];
  if (!kind) throw bad(`kind må være ${KINDS41.join(', ')}`);
  const to = recipientsOf(u, b.to ?? b.recipients);
  const contacts = contactsOf(b.contacts);
  if (!to.length && !contacts.length) throw bad('Velg minst én mottaker');
  const place = clean(b.place, 80), note = clean(b.note, 300);
  let leaveAt = null, eta = null;
  if (kind === 'leaving_soon') {
    const m = b.leaveInMin ?? b.leave_in_min;
    if (m != null) { if (![15, 30, 45, 60, 90, 120].includes(+m)) throw bad('leaveInMin må være 15, 30, 60 eller tom (ukjent)'); leaveAt = now + +m * 60_000; }
    else if (b.leave_at ?? b.leaveAt) leaveAt = etaOf(b.leave_at ?? b.leaveAt, now);
  }
  if (kind === 'leaving_now') eta = etaOf(b.eta, now);
  const dest = kind === 'leaving_now' ? destOf(b.destination) : null;
  let session = null;
  if (dest && to.length) {
    session = await startTrip41(u, { eta: eta ? new Date(eta).toISOString() : 30, recipients: to, waitMin: b.waitMin, mode: b.mode, pos: b.pos, leg: b.leg, destination: dest }, now);
    eta = session.eta;
  }
  const id = 'hs' + randomBytes(7).toString('hex');
  q('INSERT INTO hjemlys_status(id,user_id,kind,place,note,eta,leave_at,recipients,contacts,session_id,dest_kind,dest_name,created_at,expires_at,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, u, kind, place, note, eta, leaveAt, JSON.stringify(to), JSON.stringify(contacts.map((x) => ({ name: x.name }))), session?.id ?? null, dest?.kind ?? null, dest?.name ?? null, now, now + NOTICE_MS, now);
  if (b.remember !== false) kv.set(u, 'hjemlys41_last', { ...(kv.get(u, 'hjemlys41_last', {}) ?? {}), [kind]: to });
  const r = row(id);
  const out = await deliver(r);
  const links = contacts.map((x) => {
    const token = randomBytes(12).toString('base64url');
    q('INSERT INTO hjemlys_links(token,status_id,name,phone,created_at,expires_at) VALUES(?,?,?,?,?,?)').run(token, id, x.name, x.phone, now, now + LINK_MS);
    const url = `${origin}/hl/${token}`;
    return { name: x.name, phone: x.phone, url, sms: `sms:${x.phone}?body=${encodeURIComponent(`${out.text}. ${url}`)}` };
  });
  q('DELETE FROM hjemlys_links WHERE expires_at < ?').run(now);
  return { notice: out, ...(session ? { session: await sessionOut40(session) } : {}), ...(links.length ? { links } : {}), ...(out.live ? { live: out.live } : {}) };
}
function noticesOf(u, now = Date.now()) {
  const rows = q('SELECT * FROM hjemlys_status WHERE created_at > ? ORDER BY created_at DESC LIMIT 200').all(now - NOTICE_MS);
  return { mine: rows.filter((r) => r.user_id === u).slice(0, 20).map((r) => noticeOut41(r, now)), received: rows.filter((r) => r.user_id !== u && parse(r.recipients, []).includes(u)).slice(0, 30).map((r) => noticeOut41(r, now)) };
}
/** GET /api/hjemlys får notices:{mine, received}. */
export async function hjemlysGet41(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/^\/api\/hjemlys\/?$/.test(c.req.path)) return;
  try { const j = await c.res.clone().json(); c.res = c.json({ ...j, notices: noticesOf(c.get('user')) }); } catch { /* svaret står */ }
}

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => HTML_ESC[ch]);
function publicOf(token, now = Date.now()) {
  if (!/^[\w-]{10,40}$/.test(String(token ?? ''))) return null;
  const l = q('SELECT * FROM hjemlys_links WHERE token=?').get(token);
  if (!l || l.expires_at < now) return null;
  const r = row(l.status_id);
  if (!r) return null;
  const n = noticeOut41(r, now);
  return { name: n.name, text: n.text, kind: n.kind, place: n.place, at: n.createdAt, eta: n.eta, expiresAt: iso(l.expires_at) };
}
/** GET /hl/:token – statussiden for kontakter uten Papir (ingen skript, ingen posisjon). */
export function hlPage41(c) {
  const p = publicOf(c.req.param('token'));
  const body = p ? `<h1>${esc(p.text)}</h1><p>${esc(new Date(p.at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }))}${p.eta ? ` · forventet ${esc(hhmm(Date.parse(p.eta)))}` : ''}</p><p class="s">Sendt med Hjemlys · lenken utløper etter 24 timer</p>`
    : '<h1>Lenken er utløpt</h1><p class="s">Hjemlys-lenker virker i 24 timer.</p>';
  return c.html(`<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Hjemlys</title>
<style>body{margin:0;font:17px/1.45 -apple-system,system-ui,sans-serif;background:#F4EFE6;color:#1B1A17;display:grid;place-items:center;min-height:100vh}main{max-width:420px;padding:32px 20px;text-align:center}
.dot{width:22px;height:22px;border-radius:50%;margin:0 auto 18px;background:radial-gradient(#FFE7A3,#F2A93B);box-shadow:0 0 18px #F2A93B}h1{font-size:22px;margin:0 0 8px}.s{color:#6b665c;font-size:14px}</style></head>
<body><main><div class="dot"></div>${body}</main></body></html>`, p ? 200 : 404, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
}

export const hjemlys41Api = new Hono();
hjemlys41Api.get('/public/:token', (c) => { const p = publicOf(c.req.param('token')); return p ? c.json(p, 200, { 'Cache-Control': 'no-store' }) : c.json({ error: 'Lenken er utløpt' }, 404); });
hjemlys41Api.use('*', authOrToken);
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const fail = (c, e) => c.json({ error: e.message }, e.status ?? 400);
const originOf = (c) => { try { const u = new URL(c.req.url); const host = c.req.header('x-forwarded-host') ?? u.host; const proto = c.req.header('x-forwarded-proto') ?? u.protocol.replace(':', ''); return `${proto}://${host}`; } catch { return ''; } };

hjemlys41Api.post('/notice', async (c) => { try { return c.json(await notice41(c.get('user'), await body(c), { origin: originOf(c) })); } catch (e) { return fail(c, e); } });
hjemlys41Api.post('/status', async (c) => { try { return c.json(await notice41(c.get('user'), await body(c), { origin: originOf(c) })); } catch (e) { return fail(c, e); } });
hjemlys41Api.get('/notices', (c) => c.json(noticesOf(c.get('user'))));
hjemlys41Api.get('/recipients', (c) => {
  const u = c.get('user');
  return c.json({ household: others(u).map((id) => ({ userId: id, name: first(id), avatar: userInfo(id)?.avatarUrl ?? null })), last: kv.get(u, 'hjemlys41_last', {}) ?? {} });
});
hjemlys41Api.patch('/notice/:id', async (c) => {
  const u = c.get('user'), r = row(c.req.param('id'));
  if (!r || r.user_id !== u) return c.json({ error: 'Fant ikke beskjeden' }, 404);
  const b = await body(c);
  const p = Math.round(+b.plus);
  if (r.kind !== 'leaving_soon' || !(p >= 1 && p <= 120)) return c.json({ error: 'plus (1–120 min) gjelder Drar snart' }, 400);
  const now = Date.now();
  q('UPDATE hjemlys_status SET leave_at=?, updated=? WHERE id=?').run(Math.max(r.leave_at ?? now, now) + p * 60_000, now, r.id);
  const out = await deliver(row(r.id), { action: 'notice-update' });
  return c.json({ notice: out, live: out.live });
});
hjemlys41Api.post('/notice/:id/now', async (c) => {
  const u = c.get('user'), r = row(c.req.param('id'));
  if (!r || r.user_id !== u) return c.json({ error: 'Fant ikke beskjeden' }, 404);
  const b = await body(c);
  try { return c.json(await notice41(u, { ...b, kind: 'leaving_now', to: b.to ?? parse(r.recipients, []), place: b.place ?? r.place }, { origin: originOf(c) })); } catch (e) { return fail(c, e); }
});
// Tur med valgfritt mål (prompt 41). Uten destination: som før (hjemlys40).
hjemlys41Api.post('/start', async (c, next) => {
  const b = await body(c);
  if (!b.destination) return next();
  try { return c.json({ session: await sessionOut40(await startTrip41(c.get('user'), b)) }); } catch (e) { return fail(c, e); }
});
