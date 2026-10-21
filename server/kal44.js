// Prompt 44 (SERVER44): Kalender – deltakere og invitasjon (.ics fra egen e-post), brukerliste, adresseforslag.
// claude-code-kalender-deltakere-invitasjon.md, claude-code-kalender-sted-adresse.md.
//
//   Hendelser (POST/PATCH /api/kalender/events[/:id]) godtar attendees:[{userId|email, name?, status?}] og geo:{lat, lon, label?}.
//   Alle hendelser i svarene får attendees:[{userId?, email?, name, status:'invited'|'accepted'|'declined'|'tentative'|'pending', kind:'user'|'email', sentAt?}]
//   og geo når det finnes (lagret per eier i kv kal44_ev, nøkkel = hendelses-id uten dato-suffiks).
//   POST /api/kalender/events/:id/invite {attendees?, message?} → {ok, sent:[{to, kind, via:'app'|'smtp'|'gmail'|'mock', status}], failed:[{to, error}],
//        attendees, from, text}. Brukere i appen: hendelsen legges i deres kalender (kilde «invites») + varsel. Andre: e-post med
//        invite.ics (METHOD:REQUEST, ORGANIZER = brukerens adresse, ATTENDEE;RSVP=TRUE, UID = hendelses-id, SEQUENCE).
//        Sletting av en hendelse med deltakere sender METHOD:CANCEL.
//   GET  /api/kalender/invites → {items:[{id, eventId, from:{id,name}, title, date, start, end, allDay, place, status}]}
//   POST /api/kalender/invites/:id/respond {status:'accepted'|'declined'|'tentative'} → {ok, status}
//   GET  /api/users/directory → {users:[{id, name, displayName, color, email, avatarUrl, me}]}  (alle innloggede; husstanden på serveren)
//   GET  /api/geo/address?q= → [{label, street, postcode, city, lat, lon, source:'kartverket'|'osm'}] (fra 3 tegn, maks 6, cache 30 d)
import { Hono } from 'hono';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { randomBytes, createHash } from 'node:crypto';
import { parseQuick, osloTodayISO } from '../public/js/quick-time.js';
import { db, kv } from './db.js';
import { userInfo, listUsers } from './auth.js';
import { authOrToken } from './mobile.js';
import { userCfg } from './settings.js';
import { notifyUser } from './notify.js';
import { addEventDecorator, addEventSource, findEvent } from './calendar.js';
import { NOMINATIM_UA } from './family.js';

const MOCK = () => process.env.MOCK_DATA === '1';
const TZ = 'Europe/Oslo';
db.exec(`CREATE TABLE IF NOT EXISTS geo44_cache (q TEXT PRIMARY KEY, result TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS kal44_invites (id INTEGER PRIMARY KEY AUTOINCREMENT, organizer TEXT NOT NULL, event_id TEXT NOT NULL, attendee TEXT NOT NULL, snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited', created INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE(organizer, event_id, attendee));
CREATE TABLE IF NOT EXISTS mail44_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, to_addr TEXT NOT NULL, subject TEXT NOT NULL, via TEXT NOT NULL, status TEXT NOT NULL, error TEXT, ics TEXT, created INTEGER NOT NULL);`);
const q = (sql) => db.prepare(sql);
const baseId = (id) => String(id ?? '').split('~')[0].replace(/-\d{8}(T\d{4})?$/, '');
const EMAIL = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,190}\.[a-z]{2,24}$/i;
const STATUSES = ['invited', 'accepted', 'declined', 'tentative', 'pending'];

/* ---------------- Lagring per hendelse ---------------- */

const evMap = (u) => kv.get(u, 'kal44_ev', {}) ?? {};
const saveEv = (u, id, patch) => { const m = evMap(u), k = baseId(id); m[k] = { ...(m[k] ?? {}), ...patch, at: Date.now() }; if (patch === null) delete m[k]; const keys = Object.keys(m); if (keys.length > 3000) for (const x of keys.slice(0, keys.length - 3000)) delete m[x]; kv.set(u, 'kal44_ev', m); return m[k]; };
/** Gyldige deltakere fra klienten. Ukjente brukere og ugyldige e-poster avvises (kaster {status:400}). */
export function attendeesInput44(list, prev = [], organizer = null) {
  if (!Array.isArray(list)) throw Object.assign(new Error('attendees må være en liste'), { status: 400 });
  const out = [], seen = new Set();
  for (const a of list.slice(0, 50)) {
    const x = typeof a === 'string' ? (EMAIL.test(a) ? { email: a } : { userId: a }) : a ?? {};
    if (x.userId) {
      const u = userInfo(String(x.userId));
      if (!u) throw Object.assign(new Error('Ukjent bruker i deltakerlisten'), { status: 400 });
      if (u.id === organizer || seen.has(`u:${u.id}`)) continue;
      seen.add(`u:${u.id}`);
      const old = prev.find((p) => p.userId === u.id);
      out.push({ kind: 'user', userId: u.id, name: u.displayName ?? u.name, status: old?.status ?? 'pending', ...(old?.sentAt ? { sentAt: old.sentAt } : {}) });
    } else {
      const email = String(x.email ?? '').trim().toLowerCase();
      if (!EMAIL.test(email)) throw Object.assign(new Error(`Ugyldig e-post: ${String(x.email ?? '').slice(0, 80)}`), { status: 400, field: 'email' });
      if (seen.has(`e:${email}`)) continue;
      seen.add(`e:${email}`);
      const old = prev.find((p) => p.email === email);
      out.push({ kind: 'email', email, name: String(x.name ?? old?.name ?? '').trim().slice(0, 80) || email.split('@')[0], status: old?.status ?? 'pending', ...(old?.sentAt ? { sentAt: old.sentAt } : {}) });
    }
  }
  return out;
}
const geoInput = (g) => {
  if (g === null) return null;
  const lat = +g?.lat, lon = +(g?.lon ?? g?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Object.assign(new Error('geo må være {lat, lon}'), { status: 400 });
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, ...(g.label ? { label: String(g.label).slice(0, 160) } : {}) };
};
const statusText = { pending: 'Ikke sendt', invited: 'Invitert', accepted: 'Ja', tentative: 'Kanskje', declined: 'Nei' };
const attOut = (a) => ({ ...a, statusText: statusText[a.status] ?? a.status });

// Alle hendelser i svarene får deltakere og koordinater.
/** Prompt 44: etag for en hendelse (tittel, tid, sted, notat, gjentakelse, deltakere). PATCH med etag/If-Match → 412 ved konflikt. */
export const etagOf44 = (e) => `"${createHash('sha1').update(JSON.stringify([e.title, e.date, e.start, e.end, e.allDay, e.endDate ?? null, e.room ?? '', e.note ?? '', e.recurrence ?? null, e.calendar ?? null, e.reminder ?? null, (e.attendees ?? []).map((a) => [a.userId ?? a.email, a.status])])).digest('hex').slice(0, 16)}"`;
addEventDecorator((user, events) => {
  const m = evMap(user);
  for (const e of events) {
    e.repeat = e.recurrence ?? 'none'; e.recurring = !!e.recurrence;
    const x = m[baseId(e.id)];
    if (!x) { e.etag = etagOf44(e); continue; }
    if (!x) continue;
    if (x.attendees?.length) e.attendees = x.attendees.map(attOut);
    e.etag = etagOf44(e);
    if (x.geo && !e.geo) { e.geo = x.geo; if (!e.map) e.map = { lat: x.geo.lat, lon: x.geo.lon, label: x.geo.label ?? e.room ?? '', appleUrl: `https://maps.apple.com/?ll=${x.geo.lat},${x.geo.lon}&q=${encodeURIComponent(x.geo.label ?? e.room ?? '')}`, googleUrl: `https://www.google.com/maps/search/?api=1&query=${x.geo.lat},${x.geo.lon}` }; }
  }
});
// Hendelser andre har invitert meg til (kilde «invites», bare lesing).
addEventSource(async (u, from, to) => {
  const rows = q("SELECT * FROM kal44_invites WHERE attendee=? AND status<>'declined' AND status<>'cancelled'").all(u);
  const events = rows.map((r) => { const s = JSON.parse(r.snapshot); return s.date >= from && s.date <= to ? { ...s, id: `inv-${r.id}`, source: 'invites', calendar: 'invites', editable: false, invite: { id: r.id, status: r.status, from: { id: r.organizer, name: userInfo(r.organizer)?.displayName ?? '' } }, origin: `Invitert av ${userInfo(r.organizer)?.displayName ?? ''}` } : null; }).filter(Boolean);
  return events.length ? { id: 'invites', name: 'Invitasjoner', events } : null;
});

/* ---------------- .ics ---------------- */

const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line) => { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let n = 74; while (Buffer.byteLength(s.slice(0, n)) > 74) n--; out.push(s.slice(0, n)); s = ` ${s.slice(n)}`; } out.push(s); return out.join('\r\n'); };
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (d) => String(d).replace(/-/g, '');
const addDay = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
/** invite.ics for en hendelse. method: REQUEST | CANCEL. */
export function buildIcs44(ev, { organizer, organizerName, attendees = [], method = 'REQUEST', seq = 0, uid } = {}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nordlys OS//Kalender//NO', 'CALSCALE:GREGORIAN', `METHOD:${method}`, 'BEGIN:VEVENT',
    `UID:${uid ?? `${baseId(ev.id)}@nordlys`}`, `DTSTAMP:${utc(Date.now())}`, `SEQUENCE:${seq}`];
  if (ev.allDay) L.push(`DTSTART;VALUE=DATE:${dateOnly(ev.date)}`, `DTEND;VALUE=DATE:${dateOnly(ev.endDate && ev.endDate > ev.date ? addDay(ev.endDate, 1) : String(ev.end ?? '').length === 10 ? ev.end : addDay(ev.date, 1))}`);
  else L.push(`DTSTART:${utc(Date.parse(ev.start))}`, `DTEND:${utc(Date.parse(ev.end ?? ev.start))}`);
  L.push(`SUMMARY:${icsEsc(ev.title)}`);
  if (ev.room || ev.location) L.push(`LOCATION:${icsEsc(ev.room ?? ev.location)}`);
  if (ev.geo) L.push(`GEO:${ev.geo.lat};${ev.geo.lon}`);
  if (ev.note) L.push(`DESCRIPTION:${icsEsc(ev.note)}`);
  L.push(`ORGANIZER;CN=${icsEsc(organizerName ?? organizer)}:mailto:${organizer}`);
  for (const a of attendees) if (a.email) L.push(`ATTENDEE;CN=${icsEsc(a.name ?? a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`);
  if (method === 'CANCEL') L.push('STATUS:CANCELLED');
  L.push('END:VEVENT', 'END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

/* ---------------- SMTP (uten avhengigheter) ---------------- */

let fakeSmtp = null;
/** Bare for tester: (msg) → {ok} | kaster. */
export const _setSmtp44 = (fn) => { fakeSmtp = fn; };
const smtpConf = (u) => ({ host: userCfg(u, 'smtp_host'), port: +(userCfg(u, 'smtp_port') || 587), user: userCfg(u, 'smtp_user'), pass: userCfg(u, 'smtp_pass'), from: userCfg(u, 'smtp_from') });
export const smtpReady44 = (u) => { const c = smtpConf(u); return !!(c.host && c.user && c.pass); };
/** Én SMTP-økt: svar leses linje for linje (flerlinjesvar «250-…» til «250 …»). STARTTLS på 587, TLS direkte på 465. */
async function smtpSend(conf, { from, to, raw }) {
  let sock = conf.port === 465 ? tlsConnect({ host: conf.host, port: conf.port, servername: conf.host }) : netConnect({ host: conf.host, port: conf.port });
  let buf = '', waiter = null, err = null;
  const onData = (d) => { buf += d.toString('utf8'); pump(); };
  const pump = () => { if (!waiter) return; const lines = buf.split('\r\n'); for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { const text = lines.slice(0, i + 1).join('\n'); buf = lines.slice(i + 1).join('\r\n'); const w = waiter; waiter = null; w.resolve({ code: +lines[i].slice(0, 3), text }); return; } };
  const onErr = (e) => { err = e; if (waiter) { const w = waiter; waiter = null; w.reject(e); } };
  const attach = (s) => { s.on('data', onData); s.on('error', onErr); s.setTimeout(20_000, () => s.destroy(new Error('SMTP svarte ikke i tide'))); };
  attach(sock);
  const read = () => new Promise((resolve, reject) => { if (err) return reject(err); waiter = { resolve, reject }; pump(); });
  const cmd = async (line, ok, msg) => { if (line != null) sock.write(`${line}\r\n`); const r = await read(); if (!ok.includes(r.code)) throw new Error(`${msg} (SMTP ${r.code})`); return r; };
  try {
    await cmd(null, [220], 'SMTP-serveren svarte ikke riktig');
    const host = process.env.HOSTNAME || 'nordlys.local';
    let r = await cmd(`EHLO ${host}`, [250], 'EHLO feilet');
    if (conf.port !== 465 && /STARTTLS/i.test(r.text)) {
      await cmd('STARTTLS', [220], 'STARTTLS feilet');
      sock.removeListener('data', onData);
      sock = await new Promise((resolve, reject) => { const t = tlsConnect({ socket: sock, servername: conf.host }, () => resolve(t)); t.once('error', reject); });
      attach(sock);
      await cmd(`EHLO ${host}`, [250], 'EHLO etter TLS feilet');
    }
    await cmd('AUTH LOGIN', [334], 'SMTP godtok ikke innlogging');
    await cmd(Buffer.from(conf.user).toString('base64'), [334], 'Brukernavnet ble avvist');
    await cmd(Buffer.from(conf.pass).toString('base64'), [235], 'Feil brukernavn eller app-passord');
    await cmd(`MAIL FROM:<${from}>`, [250], 'Avsenderen ble avvist');
    await cmd(`RCPT TO:<${to}>`, [250, 251], 'Mottakeren ble avvist');
    await cmd('DATA', [354], 'SMTP DATA feilet');
    await cmd(`${raw.replace(/\r?\n\./g, '\r\n..')}\r\n.`, [250], 'Meldingen ble ikke godtatt');
    sock.write('QUIT\r\n');
    return { ok: true };
  } finally { setTimeout(() => { try { sock.destroy(); } catch { /* */ } }, 200).unref?.(); }
}
const b64lines = (s) => Buffer.from(s).toString('base64').replace(/.{76}/g, '$&\r\n');
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
function mime({ from, fromName, to, subject, text, html, ics, method }) {
  const b = `nordlys_${randomBytes(8).toString('hex')}`;
  return [`From: ${encWord(fromName ?? '')} <${from}>`, `To: <${to}>`, `Subject: ${encWord(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${randomBytes(12).toString('hex')}@nordlys>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`, '', `--${b}`, 'Content-Type: multipart/alternative; boundary="alt_' + b + '"', '', `--alt_${b}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64lines(text),
    `--alt_${b}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64lines(html), `--alt_${b}`, `Content-Type: text/calendar; charset=utf-8; method=${method}`, 'Content-Transfer-Encoding: base64', '', b64lines(ics), `--alt_${b}--`,
    `--${b}`, `Content-Type: application/ics; name="invite.ics"`, 'Content-Disposition: attachment; filename="invite.ics"', 'Content-Transfer-Encoding: base64', '', b64lines(ics), `--${b}--`, ''].join('\r\n');
}
const fromOf = (u) => {
  const c = smtpConf(u), m = String(c.from ?? '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const addr = m?.[2] ?? (EMAIL.test(c.from ?? '') ? c.from : EMAIL.test(c.user ?? '') ? c.user : `${userInfo(u)?.username ?? 'homelab'}@${process.env.MAIL_DOMAIN || 'localhost'}`);
  return { addr, name: m?.[1] || userInfo(u)?.displayName || userInfo(u)?.name || addr };
};
export async function testSmtp44(u) {
  const c = smtpConf(u);
  if (!c.host || !c.user || !c.pass) return { ok: false, code: 'missing', message: 'Fyll inn SMTP-server, brukernavn og app-passord.' };
  if (MOCK() || fakeSmtp) return { ok: true, mock: true, message: `✓ ${c.host}:${c.port} (demodata)` };
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = c.port === 465 ? tlsConnect({ host: c.host, port: c.port, servername: c.host }) : netConnect({ host: c.host, port: c.port });
    s.setTimeout(8000, () => { s.destroy(); resolve({ ok: false, message: 'SMTP svarte ikke i tide' }); });
    s.once('data', (d) => { s.end('QUIT\r\n'); resolve(/^220/.test(d.toString()) ? { ok: true, ms: Date.now() - t0, message: `✓ ${c.host} svarte på ${Date.now() - t0} ms` } : { ok: false, message: 'Uventet svar fra SMTP' }); });
    s.on('error', (e) => resolve({ ok: false, message: `Fikk ikke kontakt med ${c.host}: ${e.message}` }));
  });
}
async function sendMail(u, msg) {
  const f = fromOf(u);
  const raw = mime({ ...msg, from: f.addr, fromName: f.name });
  let via = 'smtp';
  try {
    if (fakeSmtp) { await fakeSmtp({ ...msg, from: f.addr, raw }); via = 'smtp'; }
    else if (smtpReady44(u)) await smtpSend(smtpConf(u), { from: f.addr, to: msg.to, raw });
    else if (MOCK()) via = 'mock';
    else throw new Error('E-post er ikke satt opp. Innstillinger → Integrasjoner → E-post (SMTP).');
    q('INSERT INTO mail44_outbox(user_id, to_addr, subject, via, status, ics, created) VALUES(?,?,?,?,?,?,?)').run(u, msg.to, msg.subject, via, 'sent', msg.ics, Date.now());
    console.log(`mail.send to=${msg.to} via=${via} status=sent`);
    return { via };
  } catch (e) {
    q('INSERT INTO mail44_outbox(user_id, to_addr, subject, via, status, error, created) VALUES(?,?,?,?,?,?,?)').run(u, msg.to, msg.subject, via, 'failed', String(e.message).slice(0, 300), Date.now());
    console.log(`mail.send to=${msg.to} via=${via} status=failed error=${String(e.message).slice(0, 120)}`);
    throw e;
  }
}
export const outbox44 = (u) => q('SELECT id, to_addr AS "to", subject, via, status, error, created FROM mail44_outbox WHERE user_id=? ORDER BY id DESC LIMIT 50').all(u);

/* ---------------- Invitasjon ---------------- */

const fmtWhen = (ev) => {
  const d = new Date(`${ev.date}T12:00:00Z`);
  const day = new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return ev.allDay ? day : `${day} ${new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ev.start))}`;
};
const snap = (ev) => ({ title: ev.title, date: ev.date, start: ev.start, end: ev.end, allDay: !!ev.allDay, endDate: ev.endDate ?? null, room: ev.room ?? ev.location ?? '', note: ev.note ?? '', geo: ev.geo ?? null, time: ev.time ?? null, inAllDayRow: !!ev.allDay, type: 'invite', color: '#2b5d8a' });
export async function invite44(u, id, body = {}) {
  const ev = await findEvent(u, id);
  if (!ev) throw Object.assign(new Error('Fant ikke hendelsen'), { status: 404 });
  const cur = evMap(u)[baseId(ev.id)] ?? {};
  const atts = body.attendees ? attendeesInput44(body.attendees, cur.attendees ?? [], u) : cur.attendees ?? [];
  if (!atts.length) throw Object.assign(new Error('Legg til deltakere først'), { status: 400 });
  const seq = (cur.seq ?? -1) + 1, f = fromOf(u), me = userInfo(u)?.displayName ?? 'Noen';
  const sent = [], failed = [];
  const ics = buildIcs44({ ...ev, geo: cur.geo ?? ev.geo }, { organizer: f.addr, organizerName: f.name, attendees: atts.filter((a) => a.email), seq });
  const now = new Date().toISOString();
  for (const a of atts) {
    if (a.kind === 'user') {
      q(`INSERT INTO kal44_invites(organizer, event_id, attendee, snapshot, status, created, updated) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(organizer, event_id, attendee) DO UPDATE SET snapshot=excluded.snapshot, updated=excluded.updated, status=CASE WHEN kal44_invites.status='cancelled' THEN 'invited' ELSE kal44_invites.status END`)
        .run(u, baseId(ev.id), a.userId, JSON.stringify(snap({ ...ev, geo: cur.geo ?? ev.geo })), 'invited', Date.now(), Date.now());
      notifyUser(a.userId, { title: `${me} inviterte deg: ${ev.title}`, body: `${fmtWhen(ev)}${ev.room ? ` · ${ev.room}` : ''}`, url: `/#/kalender?date=${ev.date}`, tag: `invite-${baseId(ev.id)}`, category: 'kalender', data: { kind: 'calendar-invite', eventId: baseId(ev.id), organizer: u, actions: ['accepted', 'declined'] } }).catch(() => {});
      if (a.status === 'pending') a.status = 'invited';
      a.sentAt = now;
      sent.push({ to: a.name, userId: a.userId, kind: 'user', via: 'app', status: a.status });
    } else {
      try {
        const text = `${me} inviterer deg til «${ev.title}» ${fmtWhen(ev)}${ev.room ? ` · ${ev.room}` : ''}.${body.message ? `\n\n${String(body.message).slice(0, 1000)}` : ''}\n\nSvar med Ja / Kanskje / Nei i kalenderen din (vedlagt invite.ics).`;
        const html = `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`;
        const r = await sendMail(u, { to: a.email, subject: `Invitasjon: ${ev.title} · ${fmtWhen(ev)}`, text, html, ics, method: 'REQUEST' });
        if (a.status === 'pending') a.status = 'invited';
        a.sentAt = now;
        sent.push({ to: a.email, kind: 'email', via: r.via, status: a.status });
      } catch (e) { failed.push({ to: a.email, kind: 'email', error: e.message }); }
    }
  }
  saveEv(u, ev.id, { attendees: atts, seq });
  return { ok: !failed.length, sent, failed, attendees: atts.map(attOut), from: f.addr, text: `Invitasjon sendt til ${sent.length}${failed.length ? ` · ${failed.length} feilet` : ''}` };
}
/** Avlysning (METHOD:CANCEL) til eksterne og fjerning hos brukerne, når en hendelse med deltakere slettes. */
export async function cancel44(u, id, ev = null) {
  const cur = evMap(u)[baseId(id)];
  if (!cur?.attendees?.length) return { sent: 0 };
  q("UPDATE kal44_invites SET status='cancelled', updated=? WHERE organizer=? AND event_id=?").run(Date.now(), u, baseId(id));
  let sent = 0;
  if (ev) {
    const f = fromOf(u), ics = buildIcs44(ev, { organizer: f.addr, organizerName: f.name, attendees: cur.attendees.filter((a) => a.email), seq: (cur.seq ?? 0) + 1, method: 'CANCEL' });
    for (const a of cur.attendees.filter((x) => x.email && x.sentAt)) { try { await sendMail(u, { to: a.email, subject: `Avlyst: ${ev.title}`, text: `«${ev.title}» er avlyst.`, html: `<p>«${ev.title}» er avlyst.</p>`, ics, method: 'CANCEL' }); sent++; } catch { /* logget */ } }
  }
  saveEv(u, id, null);
  return { sent };
}

/** Middleware på /api/kalender/events(/…): attendees og geo i POST/PATCH, avlysning ved DELETE. */
export async function kalEventsMw44(c, next) {
  const m = c.req.method;
  if (!['POST', 'PATCH', 'DELETE'].includes(m) || /\/(invite|copy)$/.test(c.req.path)) return next();
  return authOrToken(c, async () => {
    const u = c.get('user');
    let b = null, atts, geo;
    if (m !== 'DELETE') {
      b = await c.req.json().catch(() => null);
      try {
        if (b && 'attendees' in b) atts = b.attendees;
        if (b && 'geo' in b) geo = geoInput(b.geo);
      } catch (e) { c.res = c.json({ error: e.message }, 400); return; }
    }
    const id = decodeURIComponent(c.req.path.match(/\/events\/([^/]+)$/)?.[1] ?? '');
    const before = m === 'DELETE' && id ? await findEvent(u, id).catch(() => null) : null;
    if (atts !== undefined) { try { attendeesInput44(atts, [], u); } catch (e) { c.res = c.json({ error: e.message, ...(e.field ? { field: e.field } : {}) }, 400); return; } }
    // Prompt 44: konflikter. etag (kropp) eller If-Match → 412 hvis hendelsen er endret siden; scope 'this'|'following' på en gjentakende
    // hendelse → 409 (bare hele serien kan endres herfra). force:true hopper over etag-sjekken.
    if (m === 'PATCH' && id) {
      const want = b?.etag ?? c.req.header('if-match') ?? null, scope = b?.scope ?? null;
      if ((want && b?.force !== true) || (scope && scope !== 'all')) {
        const cur = await findEvent(u, id).catch(() => null);
        if (!cur) { c.res = c.json({ error: 'Fant ikke hendelsen' }, 404); return; }
        const tag = etagOf44(cur);
        if (want && b?.force !== true && want !== tag && want !== tag.replace(/"/g, '')) { c.res = c.json({ error: 'Hendelsen er endret et annet sted. Last inn på nytt, eller lagre likevel (force).', conflict: true, etag: tag, current: cur }, 412); return; }
        if (scope && scope !== 'all' && cur.recurrence) { c.res = c.json({ error: 'Bare hele serien kan endres herfra', scopes: ['all'], conflict: true }, 409); return; }
      }
    }
    await next();
    if (c.res.status >= 300) return;
    if (m === 'DELETE') { if (id) cancel44(u, id, before).catch(() => {}); return; }
    if (atts === undefined && geo === undefined) return;
    try {
      const j = await c.res.clone().json();
      const ev = j?.event;
      if (!ev?.id) return;
      const prev = evMap(u)[baseId(ev.id)] ?? {};
      const patch = {};
      if (atts !== undefined) patch.attendees = attendeesInput44(atts, prev.attendees ?? [], u);
      if (geo !== undefined) patch.geo = geo;
      const x = saveEv(u, ev.id, patch);
      // Sendes med en gang når klienten ber om det (appen: «invitasjonen sendes når du trykker Lagre»).
      let inv = null;
      if (b?.sendInvites === true && x.attendees?.length) inv = await invite44(u, ev.id).catch((e) => ({ ok: false, error: e.message }));
      const out0 = { ...ev, ...(x.attendees ? { attendees: (inv?.attendees ?? x.attendees.map(attOut)) } : {}), ...(x.geo ? { geo: x.geo } : {}) };
      const out = { ...out0, etag: etagOf44(out0) };
      c.res = c.json({ ...j, event: out, ...(inv ? { invite: inv } : {}) }, c.res.status);
    } catch { /* lar svaret stå */ }
  });
}

/* ---------------- Glimt-tid i /api/assist ---------------- */

/** Prompt 44: lokal tolkning (dato, tid, tittel) før Ollama, også i /api/assist. Svaret får local:{ok, title, date, start, end, allDay, place, type, confidence}. */
export async function assistLocalMw44(c, next) {
  let text = null;
  if (c.req.method === 'POST') { const b = await c.req.json().catch(() => null); text = b?.text ?? b?.q ?? b?.prompt ?? b?.query ?? null; }
  await next();
  if (typeof text !== 'string' || !text.trim() || c.res.status >= 300 || !(c.res.headers.get('content-type') ?? '').includes('json')) return;
  try {
    const pq = parseQuick(text.slice(0, 500), osloTodayISO());
    if (!pq.date && !pq.start) return;
    const j = await c.res.clone().json();
    if (!j || typeof j !== 'object' || Array.isArray(j) || j.local) return;
    c.res = c.json({ ...j, local: { ok: !!pq.ok, title: pq.title, date: pq.date, start: pq.start, end: pq.end, allDay: !!pq.allDay, place: pq.place ?? null, type: pq.type, confidence: pq.confidence, engine: 'local' } }, c.res.status);
  } catch { /* lar svaret stå */ }
}

/* ---------------- Adresseforslag ---------------- */

let geoFetch = null;
export const _setGeoFetch44 = (fn) => { geoFetch = fn; };
const MOCK_ADDR = [
  ['Storgata 1', '0155', 'Oslo', 59.9127, 10.7497], ['Storgata 10', '0155', 'Oslo', 59.9131, 10.7514], ['Karl Johans gate 22', '0159', 'Oslo', 59.9133, 10.7406], ['Hoffsveien 4', '0275', 'Oslo', 59.9269, 10.6929],
  ['Kirkegata 15', '0153', 'Oslo', 59.9101, 10.7445], ['Torggata 5', '0181', 'Oslo', 59.9152, 10.7517], ['Bogstadveien 30', '0355', 'Oslo', 59.9283, 10.7199], ['Storgata 1', '3044', 'Drammen', 59.7441, 10.2045],
];
const nb = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const cap = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
async function kartverket(qs) {
  const u = `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(qs)}&fuzzy=true&treffPerSide=6&utkoordsys=4258&asciiKompatibel=true`;
  const r = await (geoFetch ?? fetch)(u, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Kartverket ${r.status}`);
  const j = await r.json();
  return (j.adresser ?? []).slice(0, 6).map((a) => ({ street: a.adressetekst, postcode: a.postnummer, city: cap(a.poststed), lat: a.representasjonspunkt?.lat, lon: a.representasjonspunkt?.lon, source: 'kartverket' })).filter((x) => Number.isFinite(x.lat));
}
let lastNom = 0;
async function nominatim(qs) {
  const wait = 1000 - (Date.now() - lastNom); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNom = Date.now();
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=no&accept-language=nb&q=${encodeURIComponent(qs)}`;
  const r = await (geoFetch ?? fetch)(u, { headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  return (await r.json()).slice(0, 6).map((x) => { const a = x.address ?? {}; const street = [a.road ?? x.name, a.house_number].filter(Boolean).join(' ') || x.name || x.display_name.split(',')[0]; return { street, postcode: a.postcode ?? '', city: a.city ?? a.town ?? a.village ?? a.municipality ?? '', lat: +x.lat, lon: +x.lon, source: 'osm' }; });
}
/** Adresseforslag (Kartverket, ellers OSM). Cache 30 dager. */
export async function addressSearch44(qRaw) {
  const qs = String(qRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (qs.length < 3) return [];
  const key = nb(qs);
  const hit = q('SELECT * FROM geo44_cache WHERE q=?').get(key);
  if (hit && Date.now() - hit.ts < 30 * 86400_000) return JSON.parse(hit.result);
  let list = [];
  if (MOCK() && !geoFetch) list = MOCK_ADDR.filter(([s, p, c]) => nb(`${s} ${p} ${c}`).includes(key) || key.split(' ').every((w) => nb(`${s} ${p} ${c}`).includes(w))).slice(0, 6).map(([street, postcode, city, lat, lon]) => ({ street, postcode, city, lat, lon, source: 'kartverket' }));
  else {
    try { list = await kartverket(qs); } catch (e) { console.warn('[geo] kartverket:', e.message); }
    if (!list.length) { try { list = await nominatim(qs); } catch (e) { console.warn('[geo] nominatim:', e.message); } }
  }
  const out = list.map((x) => ({ label: `${x.street}${x.postcode || x.city ? `, ${[x.postcode, x.city].filter(Boolean).join(' ')}` : ''}`, street: x.street, postcode: x.postcode ?? '', city: x.city ?? '', lat: Math.round(x.lat * 1e6) / 1e6, lon: Math.round(x.lon * 1e6) / 1e6, source: x.source }));
  if (out.length) q('INSERT OR REPLACE INTO geo44_cache(q, result, ts) VALUES(?,?,?)').run(key, JSON.stringify(out), Date.now());
  return out;
}

/* ---------------- Ruter ---------------- */

const fail = (c, e) => c.json({ error: e.message, ...(e.field ? { field: e.field } : {}) }, e.status && e.status < 500 ? e.status : 502);
const COLORS = ['#b23a2a', '#2b5d8a', '#2f6b4a', '#a0671a', '#6b3b5a', '#3f5a6b', '#7a4a2a'];
export const kal44Api = new Hono();
kal44Api.post('/kalender/events/:id/invite', authOrToken, async (c) => {
  try { return c.json(await invite44(c.get('user'), decodeURIComponent(c.req.param('id')), (await c.req.json().catch(() => ({}))) ?? {})); } catch (e) { return fail(c, e); }
});
kal44Api.get('/kalender/invites', authOrToken, (c) => c.json({ items: q("SELECT * FROM kal44_invites WHERE attendee=? AND status<>'cancelled' ORDER BY id DESC LIMIT 100").all(c.get('user')).map((r) => { const s = JSON.parse(r.snapshot); return { id: r.id, eventId: r.event_id, from: { id: r.organizer, name: userInfo(r.organizer)?.displayName ?? '' }, title: s.title, date: s.date, start: s.start, end: s.end, allDay: s.allDay, place: s.room || null, geo: s.geo ?? null, status: r.status, statusText: statusText[r.status] ?? r.status }; }) }));
kal44Api.post('/kalender/invites/:id{[0-9]+}/respond', authOrToken, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({}));
  const st = String(b?.status ?? '');
  if (!['accepted', 'declined', 'tentative'].includes(st)) return c.json({ error: "status må være 'accepted', 'declined' eller 'tentative'" }, 400);
  const r = q('SELECT * FROM kal44_invites WHERE id=? AND attendee=?').get(+c.req.param('id'), u);
  if (!r) return c.json({ error: 'Fant ikke invitasjonen' }, 404);
  q('UPDATE kal44_invites SET status=?, updated=? WHERE id=?').run(st, Date.now(), r.id);
  const m = evMap(r.organizer), x = m[r.event_id];
  if (x?.attendees) { for (const a of x.attendees) if (a.userId === u) a.status = st; kv.set(r.organizer, 'kal44_ev', m); }
  const me = userInfo(u)?.displayName ?? '';
  notifyUser(r.organizer, { title: `${me} svarte ${statusText[st].toLowerCase()}`, body: JSON.parse(r.snapshot).title, category: 'kalender', tag: `invite-reply-${r.id}` }).catch(() => {});
  return c.json({ ok: true, status: st, statusText: statusText[st] });
});
kal44Api.get('/users/directory', authOrToken, (c) => {
  const me = c.get('user');
  return c.json({ users: listUsers().map((u, i) => ({ id: u.id, name: u.displayName, displayName: u.displayName, color: kv.get(u.id, 'layout', {})?.color ?? COLORS[i % COLORS.length], email: userCfg(u.id, 'smtp_from')?.match(/<([^>]+)>/)?.[1] ?? (EMAIL.test(userCfg(u.id, 'smtp_user') ?? '') ? userCfg(u.id, 'smtp_user') : null), avatarUrl: u.avatarUrl, me: u.id === me, self: u.id === me })), me });
});
kal44Api.get('/geo/address', authOrToken, async (c) => {
  try { return c.json(await addressSearch44(c.req.query('q'))); } catch (e) { return fail(c, e); }
});
kal44Api.get('/kalender/outbox', authOrToken, (c) => c.json({ items: outbox44(c.get('user')) }));
